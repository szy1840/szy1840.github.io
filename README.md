# Ziyan Song — personal website

A hand-built, theme-free static site. Minimalist editorial design, bento-grid
projects, documentation-style technical notes, and a warm writing section for
Chinese essays and notes.

Built with **[Eleventy (11ty)](https://www.11ty.dev/)** — no client framework, no theme.

## Develop

```bash
npm install        # once
npm run dev        # local server at http://localhost:8080 (live reload)
npm run build      # production build → ./_site
```

## Where things live

```
src/
├── index.njk              # Home
├── projects.njk           # Projects (bento grid)
├── technical-notes.njk    # Technical Notes index
├── notes-essays.njk       # Notes & Essays index (two columns: essays + notes)
├── about.njk              # About
├── resume.njk             # Résumé
├── notes/                 # ← Technical notes (Markdown). One file = one note.
├── essays/                # ← Essays (Markdown). One file = one essay.
├── journal/               # ← Notes (Markdown). Dated, informal, any length.
├── projects/              # ← Projects (Markdown). One file = one project.
├── _data/
│   └── site.js            # Site title, nav, social links
├── _includes/             # Layouts & partials
├── css/                   # style.css (design system) + prism.css (code theme)
├── js/main.js             # Theme toggle, mobile nav, table of contents
└── static/                # Copied to site root (favicon.svg, resume.pdf, ...)
```

## Add a technical note

Create `src/notes/my-slug.md`:

```markdown
---
title: "标题 / Title"
date: 2026-06-01
tags: ["Swift", "iOS"]
---

Body in Markdown. Code blocks are highlighted automatically; an
auto-generated table of contents appears on wide screens.
```

URL → `/technical-notes/my-slug/`.

### Make a note bilingual (English ⇄ 中文)

Notes can carry two language versions. The page shows **English by default**
with an inline **EN / 中文** toggle (no reload; the choice is remembered, and the
table of contents rebuilds for the active language). The index lists the English
title plus an `EN · 中文` badge.

1. In the original note, add a `ref` (any unique key — the slug works) and `lang`:

   ```markdown
   ---
   title: "中文标题"
   date: 2026-06-01
   tags: ["Swift"]
   lang: zh
   ref: my-slug
   ---
   ```

2. Add the translation at `src/note-translations/my-slug.md` with the **same `ref`**:

   ```markdown
   ---
   title: "English Title"
   lang: en
   ref: my-slug
   ---

   English body…
   ```

The translation file is paired into the original page automatically — it does not
produce its own URL. The original note keeps owning the URL, date, and tags.
(Notes without a translation simply render in whatever language they're written in.)

## Add an essay or a note

The Notes & Essays page has two columns. **Essays** are the considered, titled
pieces; **Notes** are looser dated entries (study notes, conversations, anything),
of any length.

Essay → `src/essays/my-slug.md`. Note → `src/journal/my-slug.md`. Same front matter:

```markdown
---
title: "标题"        # notes may omit this (they lead with the date)
date: 2026-06-01
lang: zh             # "zh" uses a serif Chinese reading style; "en" for English
lede: "One-line summary shown in the index."
---

Body in Markdown.
```

Both render to `/notes-essays/my-slug/` (keep slugs unique across the two folders).

## Add / edit a project

Each project is one Markdown file in `src/projects/`. Front matter drives the card
(in the bento grid) and the fact sheet; the **body is free-form**, so every project
page can have a different structure. URL → `/projects/<slug>/`.

```markdown
---
title: Aigeo
summary: One-line summary (shown on the card and under the title).
category: Startup          # card label
year: 2025
status: Live              # fact sheet
role: Solo founder and engineer
stack: [Wasp, React, PostgreSQL]
order: 1                  # ordering in the grid (lower = first)
size: lg                 # bento footprint: lg, wide, tall, sm
accent: true             # highlights the card
tags: [GEO, AI]
demo: https://theaigeo.com   # optional: shows a live iframe preview
links:
  - label: Visit theaigeo.com
    url: https://theaigeo.com
relatedNotes:            # optional: slugs of technical notes to link
  - social-media-fan-out-feed
---

## Overview
…write whatever sections fit this project (Why I built it, Key features,
Technical architecture, Challenges, Outcome, …). Structure can vary per project.
```

- `demo:` embeds the URL in a browser-framed `<iframe>`. If the target site sends
  `X-Frame-Options`/`frame-ancestors` that forbid embedding, the frame stays blank
  and the visitor uses the "Open ↗" link instead.
- `relatedNotes:` lists technical-note slugs (file names in `src/notes/` without `.md`);
  resolved automatically, using the English title when a translation exists.

## Résumé PDF

Drop `resume.pdf` into `src/static/`; the "Download PDF" button links to `/resume.pdf`.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds with
Eleventy and publishes `_site/` to the `gh-pages` branch. Requires a repository
secret `PAT_TOKEN` (a GitHub personal access token with repo scope).
