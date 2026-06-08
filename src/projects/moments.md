---
title: Moments
summary: A private, friends-only social app focused on small circles instead of the attention economy.
category: Side project
year: 2025
status: In development
role: Designer and iOS engineer
stack: [SwiftUI, Firebase, Cloud Functions]
order: 3
size: wide
tags: [iOS, SwiftUI, Firebase]
relatedNotes:
  - social-media-fan-out-feed
  - build-a-side-drawer-in-swift-ui
  - swift-concurrency
links:
  - label: GitHub
    url: https://github.com/szy1840
---

> Placeholder content. Edit `src/projects/moments.md` to make it yours.

## Overview

Moments is a small social app for close friends. There is no public feed, no follower count, and no algorithm deciding what you see. You post a moment, and the people who actually know you see it.

## Why I built it

I wanted a calmer place to share everyday things with a handful of people, without the performance that comes with a public audience. It was also an excuse to design a feed system properly rather than reach for a library.

## Key features

- A friends-only timeline with real-time updates
- Likes and comments visible only to mutual friends
- A profile drawer for quick navigation between accounts and settings

## Technical architecture

The client is SwiftUI. The backend is Firebase, with Cloud Functions handling distribution and aggregation. Posts use a fan-out-on-write feed, so each user reads a single precomputed timeline rather than querying every friend on open. The deeper engineering write-ups are linked below.

## Outcome

Still a work in progress. The most valuable part so far has been the systems work: feed design, concurrency, and the small SwiftUI details that decide whether an app feels solid.
