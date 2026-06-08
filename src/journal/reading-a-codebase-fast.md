---
title: "Notes on reading an unfamiliar codebase"
date: 2026-04-15
lang: en
lede: "A few habits that help me get oriented in code I didn't write."
---

> Placeholder note. Replace it with your own.

A short list I keep adding to, for the first hour in a repo I have never seen.

- Start at the entry point and the build, not the file you were sent to fix. How the thing boots tells you more than any single module.
- Read the data model first. In most apps the schema is the real architecture; the rest is plumbing around it.
- Follow one request all the way through, end to end, before reading anything in breadth.
- Trust names, then verify them. A function called `sync` usually syncs, until the one time it quietly does three other things.
- Write down the questions you can't answer yet. The list of unknowns is the map.

None of this is clever. It just keeps me from getting lost in the second hour.
