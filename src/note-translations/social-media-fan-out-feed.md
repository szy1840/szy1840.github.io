---
title: "Designing a Moments Feed: Friendships and a Fan-out Feed"
lang: en
ref: social-media-fan-out-feed
---

A common system in social apps is the "Moments" feed (a friends-only timeline). Its main requirements are:

- After a user posts a Moment, all of their friends should see it.
- When a user opens their feed, they only see content posted by friends.
- After unfriending someone, neither side should see the other's past Moments.
- Likes and comments are only visible to mutual friends.

In other words, we want to implement a private, friends-only feed.

## Two Classic Feed Patterns

Feed systems in social apps generally come in two flavors.

### Fan-out on Write

When a user posts, the content is immediately copied into every follower's/friend's feed:

```text
User A posts Moment M
→ written to user B's feed
→ written to user C's feed
→ written to user D's feed
...
```

**Pros:**
- Extremely fast reads — a user only queries their own feed
- Great for read-heavy, write-light workloads
- Good real-time behavior

**Cons:**
- High write cost (N+1 writes, where N is the friend count)
- Unfriendly to users with many friends
- Redundant data (though typically only a Moment *index* is stored, so the redundancy is manageable)

### Fan-out on Read

When a user opens their feed, you query the latest content from everyone they follow in real time:

```text
User A opens the feed
→ query friend B's moments
→ query friend C's moments
→ query friend D's moments
→ aggregate, sort, and return
```

**Pros:**
- Simple writes — just one write
- No redundant data
- Suits users with many friends (super-nodes)

**Cons:**
- Slow reads (many queries)
- Complex aggregation and sorting logic
- Real-time behavior depends on query performance

### My Choice: Fan-out on Write

Given the characteristics of a Moments feed:

- The number of friends is usually bounded (< 500)
- Users open the feed frequently (reads far outnumber writes)
- A good real-time experience matters

I chose the **Fan-out on Write** pattern, implementing feed distribution with Firebase Cloud Functions.

## Data Model

The core idea: Moment content lives in a global `moments` collection, while each user's `feed` subcollection stores only a reference (`momentId`) plus a timestamp. The main design question is: should a moment be a top-level collection, or a subcollection of `users`?

The key difference: if moments live under `users/{authorId}/moments`, the IDs Firebase auto-generates are only unique within that author's subcollection — not necessarily globally unique. That means the feed can't simply use `momentId` as its key; it would have to store extra information (such as `authorId`), turning it into a composite-index structure.

Access control is also easier with a top-level collection. For non-private content like a Moments feed — and for features it might grow into (blocking, "visible only to X", etc.) — it's natural to associate permissions with the content itself, rather than forcibly binding them to the content's author. As a user subcollection, those access rules would be tightly coupled to the `/users/{uid}/moments` path permissions, and per-moment access control would be very hard.

### Firestore Structure

```text
users/
  └── {userId}/
      ├── name: string
      ├── ...
      │
      ├── friends/                      # Friends subcollection
      │   └── {friendUserId}/
      │       └── uid: string
      │
      └── feed/                         # Personal feed (fan-out target)
          └── {momentId}/
              ├── momentId: string
              └── createdAt: timestamp

moments/                                # Global Moments collection
  └── {momentId}/
      ├── authorId: string
      ├── text: string
      ├── attachments: array
      ├── createdAt: timestamp
      ├── likeCount: number
      ├── commentCount: number
      ├── likes/                        # Likes subcollection
      │   └── {userId}/
      └── comments/                     # Comments subcollection
          └── {commentId}/
```

**Read flow:**

```swift
// 1. Query the user's feed subcollection
let feedDocs = await db.collection("users/{userId}/feed")
    .order(by: "createdAt", descending: true)
    .limit(to: 10)
    .getDocuments()

// 2. Fetch the actual moment content in parallel
let momentIds = feedDocs.map { $0.data()["momentId"] }
let moments = await fetchMomentsInParallel(momentIds)
```

## Cloud Functions: Feed Distribution

The heart of the fan-out pattern is distributing content automatically when it's created.

### Fan-out When a Moment Is Created

```javascript
exports.onMomentCreated = onDocumentCreated(
  `/moments/{momentId}`,
  async (event) => {
    const db = admin.firestore();
    const momentId = event.params.momentId;
    const moment = event.data?.data();
    const authorId = moment.authorId;
    const createdAt = moment.createdAt?.toDate?.() || new Date();

    try {
      // 1. Get all of the author's friends
      const friendsSnap = await db
        .collection('users')
        .doc(authorId)
        .collection('friends')
        .get();

      const friendIds = friendsSnap.docs.map((d) => d.id);

      // 2. Include the author (so they see their own posts)
      const targets = new Set([authorId, ...friendIds]);

      // 3. Batch-write into every target user's feed
      const batch = db.batch();
      for (const uid of targets) {
        const feedRef = db
          .collection('users')
          .doc(uid)
          .collection('feed')
          .doc(momentId);
        batch.set(feedRef, {
          momentId: momentId,
          createdAt: createdAt,
        });
      }
      await batch.commit();

      logger.info(`Fanned out moment ${momentId} to ${targets.size} feeds`);
    } catch (e) {
      logger.error("Fan-out failed", e);
    }
  }
);
```

Using a `batch` here ensures atomicity — you won't end up in an inconsistent state where some friends can see the moment and others can't. And while a batch doesn't reduce the *number* of writes (it's still N write ops), it compresses what would be N separate Firestore API calls (RPCs) into one. That directly cuts the Cloud Function's network round-trips, auth overhead, connection-reuse pressure, and execution time.

### Cleaning Up the Feed When Unfriending

When you unfriend someone, you must clear the other person's content from both feeds. The best design here is to redundantly store each moment's `authorId` in the feed:

```javascript
// Query the feed directly
const feedSnap = await db
  .collection('users')
  .doc(uid)
  .collection('feed')
  .where('authorId', '==', friendUid)
  .get();

const batch = db.batch();
feedSnap.docs.forEach((doc) => batch.delete(doc.ref));
await batch.commit();
```

If you didn't store it, things get more awkward. The procedure becomes:

1. Know which author you're removing (`friendUid`).
2. Query `moments/` where `authorId == friendUid` to get all their `momentId`s.
3. Iterate over every `momentId` and delete it from the feed if present.

Also note that Firestore caps a batch at 500 write operations, so if a user has posted a great many moments you'll need to paginate / cursor through the cleanup.

### Maintaining Like/Comment Counters

Like and comment counts are also maintained automatically through Cloud Functions:

```javascript
// Automatically +1 on a like
exports.onLikeCreated = onDocumentCreated(
  `/moments/{momentId}/likes/{uid}`,
  async (event) => {
    const momentRef = db.collection('moments').doc(event.params.momentId);
    await momentRef.update({
      likeCount: admin.firestore.FieldValue.increment(1)
    });
  }
);

// Automatically -1 on an unlike
exports.onLikeDeleted = onDocumentDeleted(
  `/moments/{momentId}/likes/{uid}`,
  async (event) => {
    const momentRef = db.collection('moments').doc(event.params.momentId);
    await momentRef.update({
      likeCount: admin.firestore.FieldValue.increment(-1)
    });
  }
);
```

This is the event-driven aggregation pattern. Because `likeCount` isn't concrete business data but a derived, aggregated field, you don't need a transaction — instead, let the server keep it in sync as the likes change. And `FieldValue.increment(1)` guarantees the operation is atomic.

## The Moments Feed and Friendships

### Filtering by Mutual-Friend Visibility

An important property of a Moments feed: only show likes and comments from mutual friends.

```swift
func getMutualLikes(momentId: String) async -> [MutualLike] {
    let currentUserId = SessionManager.currentUserId
    let friends = DataStorageManager.shared.friends  // Set<String>

    do {
        // 1. Get all likes
        let likesSnapshot = try await db.collection("moments")
            .document(momentId)
            .collection("likes")
            .getDocuments()

        // 2. Keep only likes from friends
        let mutualLikes = likesSnapshot.documents.compactMap { doc -> MutualLike? in
            guard let userId = doc.data()["userId"] as? String else {
                return nil
            }

            // Keep only friends' and the current user's likes
            guard friends.contains(userId) || userId == currentUserId else {
                return nil
            }

            return MutualLike(id: doc.documentID, userId: userId)
        }

        return mutualLikes
    } catch {
        print("Failed to load mutual likes: \(error)")
        return []
    }
}
```

For comments you must check not only whether the commenter is a friend, but also whether the person being replied to is a friend:

```swift
func getMutualComments(momentId: String) async -> [Comment] {
    let friends = DataStorageManager.shared.friends

    let commentsSnapshot = try await db.collection("moments")
        .document(momentId)
        .collection("comments")
        .order(by: "createdAt", descending: false)
        .getDocuments()

    return commentsSnapshot.documents.compactMap { doc -> Comment? in
        let userId = doc.data()["userId"] as? String
        let replyTo = doc.data()["replyTo"] as? String

        // Is the commenter a friend?
        let isAuthorFriend = friends.contains(userId ?? "") ||
                             userId == currentUserId

        // Is the person being replied to a friend?
        var isReplyToFriend = true
        if let replyTo = replyTo {
            // Find the author of the comment being replied to
            let replyToComment = commentsSnapshot.documents.first {
                $0.data()["commentId"] as? String == replyTo
            }
            if let replyToUserId = replyToComment?.data()["userId"] as? String {
                isReplyToFriend = friends.contains(replyToUserId) ||
                                  replyToUserId == currentUserId
            } else {
                isReplyToFriend = false  // Can't find the replied-to comment — hide it
            }
        }

        // Only show it if both are friends
        return (isAuthorFriend && isReplyToFriend) ? parseComment(doc) : nil
    }
}
```

This filtering happens on the client, because it's *presentation* logic (what to show), not *permission* logic — and doing it this way avoids storing multiple copies of the data.

## Future Optimizations and Extensions

### A Hybrid Approach

For users with too many friends, consider a hybrid approach:

```swift
// Pseudocode
func getFeed() async -> [Moment] {
    let popularFriends = friends.filter { $0.followerCount > 1000 }
    let normalFriends = friends.filter { $0.followerCount <= 1000 }

    // Normal friends: read from the feed (fan-out)
    let feedMoments = await loadFromFeed()

    // Popular friends: query in real time (fan-in)
    let popularMoments = await loadFromAuthors(popularFriends)

    // Merge and sort
    return merge(feedMoments, popularMoments)
}
```

### Backfilling Moments After Adding a Friend

In the current design, fan-out only runs when a Moment is created — becoming friends doesn't backfill historical feeds. To implement that backfill, the idea is:

1. When `friendUid` is written, trigger a Cloud Function to perform the backfill.
2. Read `friendUid`'s most recent N moments (newest first — a full backfill is usually unnecessary).
3. For each moment, write `feed/{momentId}` for the current user `uid`.

## Summary

Building a Moments feed means trading off read/write performance, storage cost, real-time behavior, and consistency. The fan-out pattern carries a high write cost, but for social apps where friend counts are bounded it delivers the best read performance and user experience.

With Firebase Cloud Functions, we can automate the complex business logic (feed distribution, aggregated counters) — preserving data consistency while keeping the client implementation simple.
