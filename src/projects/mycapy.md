---
title: MyCapy
summary: "A SwiftUI social app for close friends: a private moments feed, public posts, and direct messages on Firebase."
category: Side project
year: 2025
status: In development
role: Designer and iOS engineer
stack: [SwiftUI, Firebase, Firestore, Cloud Functions, WKWebView]
order: 5
size: wide
tags: [iOS, SwiftUI, Firebase]
relatedNotes:
  - social-media-fan-out-feed
  - build-a-side-drawer-in-swift-ui
  - swift-concurrency
links:
  - label: GitHub
    url: https://github.com/szy1840/MyCapy
---

## Overview

MyCapy is a SwiftUI social app I built for close friends. It brings together three things most apps keep apart: a private friends-only feed, a public space for longer posts, and direct messages, all on a Firebase backend. The name and the capybara mascot fit the goal, which was something calm and friendly rather than another attention machine.

## Why I built it

I wanted a social app that behaved the way I actually want to use one: small circles, no public follower counts, and a clear line between what you share with friends and what you publish to everyone. It was also the project where I taught myself iOS in earnest, so several of the engineering notes on this site came straight out of building it.

## Key features

- **Moments.** A private, friends-only feed. Posting a moment fans it out to friends, and likes and comments follow a WeChat-style rule where you only see interactions from mutual friends. Comments support threaded replies.
- **Posts.** A public, blog-style space with a rich text editor (Quill.js running inside a WKWebView), image upload to Firebase Storage, a global feed and a cached personal feed, plus likes, comments, bookmarks, and editing after publishing.
- **Conversations.** Direct messages between friends.
- **Accounts and friends.** Sign-in, profiles, and the friend relationships that drive visibility across the whole app.

## Technical architecture

The client is SwiftUI. The backend is Firebase: Auth for sign-in, Firestore for data, Storage for images, and Cloud Functions for the work that should not run on the client. Functions maintain the like and comment counters and fan moments out to friends' feeds, which keeps reads fast and the client simple. The rich text editor is Quill.js embedded in a WKWebView and bridged to Swift, since a good editor is one thing the platform does not give you for free.

## Interesting technical decisions

- Mutual-friend visibility for likes and comments is filtered on the client, because it is presentation logic rather than a security boundary, and it avoids storing several copies of the same data.
- Moments use fan-out on write, so each person reads one precomputed feed instead of querying every friend on open. The full design is in the related notes below.
- Counters are derived fields maintained by Cloud Functions with atomic increments, rather than recomputed on every read.
