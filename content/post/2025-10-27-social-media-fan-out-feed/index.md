+++
date = '2025-10-27T15:30:00-04:00'
draft = false
title = '朋友圈系统设计：好友关系与 Fan-out Feed'
tags = ['ios', 'firebase','social-media', 'architecture', 'feed-system']
ShowToc = true
+++


# 朋友圈系统设计：好友关系与 Fan-out Feed

在社交应用里，一个常见的系统就是朋友圈系统。其主要功能有：

- 用户发布 Moment（朋友圈动态）后，所有好友应该能看到
- 用户打开朋友圈时，只看到好友发布的内容
- 删除好友后，双方都不应再看到对方的历史动态
- 点赞和评论只对共同好友可见

换句话说，就是要实现 private social feed/friends-only feed。

## Feed 系统的两种经典模式

在社交应用中，Feed 系统主要有两种实现模式：

### Fan-out on Write（写扩散）

当用户发布内容时，立即将内容复制到所有粉丝/好友的 Feed 中：

```
用户A发布 Moment M
→ 写入用户B的feed
→ 写入用户C的feed
→ 写入用户D的feed
...
```

**优点**：
- 读取极快，用户只需查询自己的 feed
- 适合读多写少的场景
- 实时性好

**缺点**：
- 写入成本高（N+1 次写入，N=好友数）
- 对好友数多的用户不友好
- 有冗余数据（但一般只存Moment的索引，所以冗余可控）

### Fan-out on Read（读扩散）

当用户打开 Feed 时，实时查询所有关注对象的最新内容：

```
用户A打开Feed
→ 查询好友B的moments
→ 查询好友C的moments
→ 查询好友D的moments
→ 聚合排序后返回
```

**优点**：
- 写入简单，只需写入一次
- 无冗余数据
- 适合好友数多的用户（超级节点）

**缺点**：
- 读取慢（需要多次查询）
- 复杂的聚合排序逻辑
- 实时性依赖查询性能

### 我的选择：Fan-out on Write

考虑到朋友圈的特点：

- 朋友圈的好友数量通常是有限的（< 500）
- 用户打开朋友圈频率高（读远多于写）
- 需要良好的实时体验

我选择了 **Fan-out on Write** 模式，并结合 Firebase Cloud Functions 实现 Feed 分发。

## 数据结构设计

这些数据结构的设计理念主要是：Moment 内容存储在全局 `moments` 集合，而每个用户的 `feed` 子集合只存储引用（momentId）和时间戳。这里主要的设计考虑是：moment 应该作为顶层集合，还是作为 users 的子集合？

这里的主要区别是，如果 moments 放在 `users/{authorId}/moments` 这种用户下的子集合里，那么 firbase 自动生成的 ID 只在该作者的子集合范围内不重复，并不一定全局唯一，导致 feed 里面也无法简单地使用 momentId 作为 Id，必须额外存信息，比如 authorId，变成复合索引结构。

另外，对于权限控制而言，也是作为顶层集合更方便。对于朋友圈这种非个人私有的内容以及其未来可能需要扩展的功能（拉黑、仅对xxx可见等），天然适合将权限和内容本身关联，而不需要强行绑定内容的作者。如果作为用户的子集合，则这些访问规则就不得不和 `/users/{uid}/moments` 的路径访问权限强耦合，并且很难做 per-moment 的权限控制。


### Firestore 结构

```
users/
  └── {userId}/
      ├── name: string
      ├── ...
      │
      ├── friends/                      # 好友子集合
      │   └── {friendUserId}/
      │       └── uid: string
      │
      └── feed/                         # 个人 Feed（写扩散目标）
          └── {momentId}/
              ├── momentId: string
              └── createdAt: timestamp

moments/                                # 全局 Moments 集合
  └── {momentId}/
      ├── authorId: string
      ├── text: string
      ├── attachments: array
      ├── createdAt: timestamp
      ├── likeCount: number
      ├── commentCount: number
      ├── likes/                        # 点赞子集合
      │   └── {userId}/
      └── comments/                     # 评论子集合
          └── {commentId}/
```

**读取流程**：
```swift
// 1. 查询用户的 feed 子集合
let feedDocs = await db.collection("users/{userId}/feed")
    .order(by: "createdAt", descending: true)
    .limit(to: 10)
    .getDocuments()

// 2. 并行获取实际的 moment 内容
let momentIds = feedDocs.map { $0.data()["momentId"] }
let moments = await fetchMomentsInParallel(momentIds)
```

## Cloud Functions：Feed 分发

Fan-out 模式的核心是在内容创建时进行自动分发。

### Moment 创建时的 Fan-out

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
      // 1. 获取作者的所有好友
      const friendsSnap = await db
        .collection('users')
        .doc(authorId)
        .collection('friends')
        .get();

      const friendIds = friendsSnap.docs.map((d) => d.id);
      
      // 2. 包括作者自己（能看到自己的动态）
      const targets = new Set([authorId, ...friendIds]);

      // 3. 批量写入所有目标用户的 feed
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

这里，使用 `batch` 操作确保原子性，可以保证不会出现“部分好友能看到、部分好友看不到”的不一致场景。另外，虽然使用 `batch` 没有减少写入次数（write ops 依然是 N），但把原本 N 次的 Firestore API 调用（RPC）压缩成 1 次，直接减少了 Cloud Functions 的网络往返时间、认证开销、连接复用压力以及执行时长。


### 好友删除时的 Feed 清理

删除好友时，必须清理双方 Feed 中对方的内容。这里一个最好的设计是，在 feed 里面冗余地存每个 moment 的 authorId：

```swift
    // 直接查 feed
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

如果没有存的话，相对比较麻烦，查询方法是：

1. 知道要删除的作者是谁 (friendUid)
2. 去 moments/ where authorId == friendUid，拿到所有 momentId
3. 遍历所有 momentId，若在 feed 里有则删除

不过，由于 Firestore 有每个 batch 最大 500 写操作 的限制，因此如果一个用户发布动态特别多，需要做分页/游标清理。


### 点赞/评论计数器维护

点赞数和评论数也通过 Cloud Functions 自动维护：

```javascript
// 点赞时自动 +1
exports.onLikeCreated = onDocumentCreated(
  `/moments/{momentId}/likes/{uid}`,
  async (event) => {
    const momentRef = db.collection('moments').doc(event.params.momentId);
    await momentRef.update({
      likeCount: admin.firestore.FieldValue.increment(1)
    });
  }
);

// 取消点赞时自动 -1
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

这里是 Event-driven Aggregation Pattern。由于 likeCount 并不是具体业务数据，而是一个聚合的派生字段，因此不需要使用事务，而是应该让服务端根据 likes 变化同步维护。另外，使用 `FieldValue.increment(1)` 来保证原子操作。

## 朋友圈与好友关系
### 好友可见性过滤

朋友圈的一个重要特性是：只显示共同好友的点赞和评论。

```swift
func getMutualLikes(momentId: String) async -> [MutualLike] {
    let currentUserId = SessionManager.currentUserId
    let friends = DataStorageManager.shared.friends  // Set<String>
    
    do {
        // 1. 获取所有点赞
        let likesSnapshot = try await db.collection("moments")
            .document(momentId)
            .collection("likes")
            .getDocuments()
        
        // 2. 过滤出好友的点赞
        let mutualLikes = likesSnapshot.documents.compactMap { doc -> MutualLike? in
            guard let userId = doc.data()["userId"] as? String else { 
                return nil 
            }
            
            // 只保留好友和自己的点赞
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

评论不仅要检查评论者是否是好友，还要检查被回复者是否是好友：

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
        
        // 检查评论者是否是好友
        let isAuthorFriend = friends.contains(userId ?? "") || 
                             userId == currentUserId
        
        // 检查被回复者是否是好友
        var isReplyToFriend = true
        if let replyTo = replyTo {
            // 需要查找被回复评论的作者
            let replyToComment = commentsSnapshot.documents.first {
                $0.data()["commentId"] as? String == replyTo
            }
            if let replyToUserId = replyToComment?.data()["userId"] as? String {
                isReplyToFriend = friends.contains(replyToUserId) || 
                                  replyToUserId == currentUserId
            } else {
                isReplyToFriend = false  // 找不到被回复评论，不显示
            }
        }
        
        // 两者都是好友才显示
        return (isAuthorFriend && isReplyToFriend) ? parseComment(doc) : nil
    }
}
```

在客户端进行过滤，因为这是是否呈现的逻辑，而不是权限逻辑，并且这样实现也不需要存储多份数据。


## 未来优化和功能扩展


### 混合方案
对于好友数过多的用户，可以考虑混合方案：

```swift
// 伪代码
func getFeed() async -> [Moment] {
    let popularFriends = friends.filter { $0.followerCount > 1000 }
    let normalFriends = friends.filter { $0.followerCount <= 1000 }
    
    // 普通好友：从 feed 读取（Fan-out）
    let feedMoments = await loadFromFeed()
    
    // 大V好友：实时查询（Fan-in）
    let popularMoments = await loadFromAuthors(popularFriends)
    
    // 合并排序
    return merge(feedMoments, popularMoments)
}
```

### 加好友后回填动态
目前实现的逻辑，Fan-out 只在 Moment 创建时执行，成为好友时不会回填历史 Feed。如果需要实现这种 backfill，实现思路就是：

1. 当 friendUid 写入时触发 Cloud Function，执行回填操作
2. 读 friendUid 的最近 N 条 moments（按时间倒序，一般不需要全量回填）
3. 遍历每条 moment，为当前用户 uid 写入 feed/{momentId}



## 总结

实现一个朋友圈 Feed 系统，需要在读写性能、存储成本、实时性、一致性之间做权衡。Fan-out 模式虽然写入成本高，但在好友数量有限的社交应用中，提供了最佳的读取性能和用户体验。

结合 Firebase Cloud Functions，我们可以将复杂的业务逻辑（如 Feed 分发、聚合数据计算）自动化，保证数据一致性的同时，简化客户端实现。
