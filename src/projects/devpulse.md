---
title: DevPulse
summary: A unified team dashboard for how engineers actually use their AI coding tools, without uploading any code.
category: Hackathon
year: 2026
status: Live demo
role: Solo build
stack: [Next.js 15, React 19, TypeScript, InsForge, Recharts, Node CLI]
order: 3
size: wide
tags: [AI, Analytics, InsForge]
links:
  - label: Open the dashboard
    url: https://7aj5nkyd.insforge.site/
demo: https://7aj5nkyd.insforge.site/
preview: /previews/devpulse.png
gallery:
  - src: /previews/devpulse-sessions.png
    label: "Sessions: every synced AI session with project, agent, model, and a generated summary"
  - src: /previews/devpulse-connect.png
    label: "Onboarding: copy one prompt and let your own AI agent install and configure the CLI"
---

## Overview

DevPulse turns the AI coding sessions that already happen on your laptop into a single team dashboard. It shows how a team actually uses Cursor, Claude Code, OpenClaw, and Codex across tools, projects, and people, without uploading any code or transcripts. I built it solo in one afternoon for the InsForge hackathon.

## Why I built it

Engineers rarely stick to one AI tool. A typical day might run Cursor for quick edits, Claude Code for multi-file refactors, and other agents for everything else. Each tool ships its own usage view, but none of them show the full picture across tools, projects, or teammates. For small, AI-native teams, where most of the work already flows through local agents, there is no lightweight way to see whether everyone is aligned or to spot uneven adoption and runaway cost. DevPulse closes that gap with a simple loop: local AI tools, then the devpulse CLI, then a shared team dashboard.

## How it works

A small CLI (published as `devpulse-ai`) scans the logs your AI tools already write, extracts lightweight metadata, and uploads only what the dashboard needs. The web app aggregates it into Overview, Members, and Sessions views. Setup is a single prompt you can paste into your own agent, which installs and configures the CLI for you, similar to a Claude Code device login.

## Key features

- **One view across tools.** Cursor, Claude Code, OpenClaw, and Codex in the same dashboard, auto-detected on each machine.
- **Overview.** Session share by model, token composition, tool mix, and busiest projects.
- **Sessions and members.** Per-session history with project, agent, model, duration, and a generated summary, plus per-person activity.
- **Background sync.** Device login once, then sync on demand or on a schedule (launchd on macOS, cron on Linux).
- **Privacy first.** Only derived metadata leaves the machine: tool, model, tokens, timestamps, a short summary, and a hashed project path. Never code, prompts, or transcripts.

## Technical architecture

The dashboard is Next.js 15 (App Router) with React 19 and TypeScript, styled with Tailwind and Radix, with Recharts for the charts. The backend is InsForge, the hackathon's platform, which provided auth, database, and hosting through its SDK. A separate Node CLI handles local log parsing, browser-based device authorization, and uploads, and OpenAI turns raw sessions into the short summaries that feed the daily recap.

## Interesting technical decisions

The privacy boundary drove most of the design. The CLI uploads derived metadata only and hashes project paths, so it is safe to point at real work. Onboarding leans on agents rather than docs: instead of walking a user through a manual setup, the dashboard hands them one prompt to paste into their AI agent, which runs the install and login itself. Building on InsForge meant auth, data, and hosting were handled out of the box, which is what made it possible to ship the whole loop, CLI included, in a single afternoon.

## What's next

Correlating AI sessions with GitHub commits and PRs, lightweight review and scoring of daily summaries for team leads, and surfacing which workflows and tools actually correlate with the best outcomes.
