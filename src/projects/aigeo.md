---
title: Aigeo
summary: A generative engine optimization platform that measures and improves how brands show up in AI answers.
category: Startup
year: 2025
status: Live
role: Technical cofounder
stack: [Wasp, React, TypeScript, Node.js, PostgreSQL, PgBoss, Multi-LLM]
order: 1
size: lg
accent: true
featured: true
tags: [GEO, AI, Full-stack]
links:
  - label: Visit theaigeo.com
    url: https://theaigeo.com
demo: https://theaigeo.com
preview: /previews/aigeo.png
gallery:
  - src: /previews/aigeo-dashboard.png
    label: Probe results and competitor landscape dashboard
---

## Overview

Aigeo is a generative engine optimization (GEO) platform. It measures how a brand appears inside AI assistant answers and gives teams a way to improve that visibility. Traditional SEO targets Google's ranked links. GEO targets the answers that models like ChatGPT, Gemini, and Perplexity produce when someone asks about a product or a category.

## Why I built it

More and more buyers start with an AI assistant instead of a search box. When someone asks "what is a good tool for X", the model returns a short list, and most brands have no way of knowing whether they are on it. I wanted to turn that black box into something you can measure: which prompts surface your brand, which models mention you, and what you can change to show up more often.

## My role

As the technical cofounder, I built Aigeo on my own, from product design through to deployment: the data model, the job system, the multi-model probing engine, the analysis features, the React front end, billing, and infrastructure.

## Key features

- **Multi-model probes.** Run a set of prompts across several AI models and record whether and how your brand is mentioned.
- **Website analysis.** Read a site, infer its positioning, and generate the prompts a real buyer would actually ask.
- **Lighthouse audits.** Pull PageSpeed and Core Web Vitals so technical health sits next to AI visibility.
- **Trend analysis.** Combine Google Trends with GEO prompt suggestions to find rising topics worth targeting.
- **Content generation.** Draft benchmark and authority articles aimed at the prompts that matter.
- **Dashboards.** Track visibility, usage, and revenue over time.

## Technical architecture

Aigeo is a full-stack TypeScript app built on Wasp, with React on the front end, Node actions on the back end, and PostgreSQL for storage.

The main architectural decision is that slow work never runs inside an HTTP request. Probe runs, Lighthouse scans, website and trend analysis, article generation, and the nightly stats rollup all run as background jobs. Wasp's job system uses PgBoss, a queue that lives inside Postgres itself. Job state sits in the same database as the application data, so there is no separate Redis or message broker to operate. An action creates a job record, hands a payload to PgBoss, and returns immediately. A worker then picks the job up, moves it through queued, running, and done or failed, and writes progress as it goes. The client polls that status instead of holding a connection open.

### Multi-model probes and concurrency

A probe run is the heart of the product, and it is slow by nature. Every prompt has to reach every model, and each call is a separate request to a third party. Running them one at a time would stretch a single scan into minutes.

So inside one probe job, every prompt and model pair runs together. Five prompts across seven models become thirty-five calls fired at once with `Promise.all`, and results are saved as they return. Failures stay contained: if a single model or prompt fails, it is logged and skipped, and the run still succeeds as long as one probe completes. The job only fails when every probe in the batch does.

That gives two layers of concurrency. PgBoss handles concurrency between jobs, so many users can start probes at the same time. `Promise.all` handles concurrency inside a job, which cuts the wall-clock time of a scan without a fleet of workers. In practice the ceiling comes from Node's async I/O and the rate limits of the model providers, not from my own code.

## Interesting technical decisions

Keeping the queue inside Postgres was a deliberate trade. A dedicated broker such as Redis or SQS would scale further, but at this stage the added operations cost is not worth it. One database to back up, migrate, and reason about keeps a solo project moving.

I also chose to tolerate partial failure instead of wrapping a probe batch in a transaction. The models fail in different ways and at different times. A finished scan with clear per-probe errors is far more useful to a user than an all-or-nothing run that throws everything away on a single timeout.

## Challenges

The hard parts were rarely a single feature. They lived in the seams: keeping job progress accurate while work runs in parallel, making partial failures visible instead of silent, and presenting a slow asynchronous backend as something that feels responsive in the browser.

## Outcome

Aigeo is live at [theaigeo.com](https://theaigeo.com), with more than 20 real paying clients. Building it end to end taught me a lot about running asynchronous work in production and about designing a product around a model layer that moves fast and occasionally misbehaves.
