---
title: This Website
summary: A hand-built, theme-free personal site with a minimalist editorial design.
category: Side project
year: 2026
status: Live
role: Design and build
stack: [Eleventy, Nunjucks, Markdown, CSS, GitHub Actions]
order: 4
size: sm
tags: [Eleventy, Design]
links:
  - label: Source
    url: https://github.com/szy1840/szy1840.github.io
---

## Overview

This is the site you are reading. It is a personal home for my work and my writing, built by hand with Eleventy and a design system I wrote from scratch. There is no theme and no front-end framework. Content goes in as Markdown, the output is static HTML, and the whole thing is small enough to keep in my head.

## Why I built it

The site used to run on Hugo with an off-the-shelf theme, and I kept fighting it. Every change meant working against someone else's template, and the markup I wanted was always one override away. I wanted something that felt like mine, stayed simple to maintain, and let me write in Markdown without thinking about the build. So I rebuilt it from nothing: my own templates, my own CSS, and only the moving parts I actually use.

## What's in it

- A minimalist editorial design with a warm paper palette, serif display type, and a light and dark theme.
- Technical notes that can carry both a Chinese and an English version, with an inline language toggle, a table of contents that follows the active language, and English-preferred titles in the index.
- A Notes and Essays section for slower writing, with longer pieces and short fragments.
- Project pages with a fact sheet, a screenshot or live preview, a gallery, and links to related notes.
- A projects index that reveals each project's screenshot as you move down the list.

## Technical architecture

The site is built with Eleventy. Templates are Nunjucks and content is Markdown, rendered with markdown-it: anchored headings feed the table of contents, and Prism handles syntax highlighting at build time, so there is no highlighting library shipped to the browser. Collections are built straight from folders, so adding a note or a project is just dropping a file in place.

The interactive pieces are a small amount of vanilla JavaScript: the theme toggle, the mobile menu, the table of contents, the note language switch, and the project preview. Type is set in Fraunces and Inter. Everything ships as one stylesheet and one short script.

It deploys itself. A push to the main branch triggers a GitHub Actions workflow that builds the site and publishes the output to the branch GitHub Pages serves. There is no other infrastructure to run.

## Interesting technical decisions

- Moving off Hugo to Eleventy traded a single fast binary for templates I actually enjoy writing. For a fully custom design, that was the right trade.
- Bilingual notes are two Markdown files paired by a shared key. The translation never gets its own URL; it is folded into the main page, which keeps one canonical link per article and lets the toggle switch in place.
- Collections come from folder globs rather than tags, so the only tags that exist on the site are the ones I actually show on screen.
- The projects index uses a single screenshot preview that swaps on hover instead of a wall of cards, which keeps a clear sense of which projects matter most.

## Colophon

Type is Fraunces and Inter. Built with Eleventy, hosted on GitHub Pages. The source is linked above if you want to see how any of it fits together.
