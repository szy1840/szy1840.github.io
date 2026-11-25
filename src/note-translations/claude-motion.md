---
title: "How Does Claude Motion Make Animations, and What Does It Have to Do with Remotion?"
lang: en
ref: claude-motion
---

On October 8, Anthropic released Claude Motion: you describe what you want, and Claude makes a short animated explainer you can export as an MP4. I wanted to know whether it runs on Remotion. The answer: Anthropic hasn't published how it works, and I found no evidence that it uses Remotion.

## What is public

Runway's launch announcement[^1] confirms that the picture is built from the text, charts, shapes and images in your material; that "Claude writes the code that animates your content", so the animation is code Claude writes; and that you can revise it in conversation or in an editor and export an MP4. Third-party reports also relay Anthropic as saying Motion does not use a video generation model (I haven't checked this on Anthropic's own pages). Nothing is said about the framework or how it renders.

## How code animation becomes video

The core rule of these tools: **the picture depends only on the time t**.

1. Write the picture as `render(t)`. The same t always draws the same frame, with no dependence on the real clock or random numbers.
2. For preview, `requestAnimationFrame` calls `render(t)` with the current time, so it looks like playback.
3. For export, a headless browser sets t frame by frame, takes screenshots, and hands them to FFmpeg. It isn't screen recording, so every frame is exact.

## Remotion works the same way

Remotion is an open-source framework for writing videos in React. `useCurrentFrame()` returns the current frame number and the component computes the picture from it, which is a React version of `render(t)`. To render, it also captures frames in a headless browser and hands them to FFmpeg[^2]. Individuals and companies of up to 3 people can use it for free; larger companies need a commercial license[^3].

## Does Motion use Remotion?

I don't know; both routes work. My guess is that it's built in-house: Motion is previewed and edited inside Claude, Artifacts are already web pages, so writing a page with a `render(t)` is the simplest path, while Remotion adds a React project and a bundling step. But that is only a guess.

As an aside, there's a community project on GitHub with the same name, whaleyxbt/claude-motion[^4]. It has nothing to do with Anthropic, but it implements both routes: one with Remotion, and one, `sims/`, where each piece is a single HTML file with a `render(t)` that headless Chromium captures frame by frame into ffmpeg. It works as a reference implementation.

[^1]: Runway, [Runway is in Claude Motion](https://runway.com/news/company-news/runway-claude-motion), October 8, 2026
[^2]: Remotion docs, [renderMedia()](https://www.remotion.dev/docs/renderer/render-media)
[^3]: Remotion docs, [Pricing](https://www.remotion.dev/docs/license/pricing)
[^4]: whaleyxbt, [claude-motion](https://github.com/whaleyxbt/claude-motion), MIT license
