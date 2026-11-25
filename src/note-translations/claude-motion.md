---
title: "How Does Claude Motion Make Animations, and What Does It Have to Do with Remotion?"
lang: en
ref: claude-motion
templateEngineOverride: md
---

On October 8, Anthropic released Claude Motion: you describe what you want in Claude, and it makes a short animated explainer that you can export as an MP4[^1]. The first question I had was whether it runs on Remotion under the hood.

The short answer: Anthropic hasn't published how Motion is built, and I found no evidence that it uses Remotion. This note has three parts: what is publicly confirmed, how this kind of tool usually works (with a minimal example that runs), and my guess about Motion.

## What is public

Runway is Motion's launch partner, and its announcement confirms the following[^1]:

- The input is a prompt and the output is a short animated explainer, built from the text, charts, shapes and images in your material.
- In the announcement's words, "Claude writes the code that animates your content." The animation is code that Claude writes.
- You can ask for changes in the conversation or adjust things directly in an editor. You can download it as an MP4 or hand it to Runway for further work.
- It is in beta, on the Team and Enterprise plans.

Several third-party reports also relay Anthropic as saying that Motion does not use a video generation model, so it does not generate live-action footage or AI-generated people. I haven't checked this on Anthropic's own pages.

The announcement says nothing about the underlying framework or how the MP4 is rendered.

## How code animation becomes video

Tools that "write animation as code, then export it as video" mostly work the same way. The core is one rule: **the picture depends only on the time t**.

1. **Write the picture as `render(t)`.** Given a time t, it draws that frame, and the same t always draws the same frame. The animation can't depend on the real clock, `setTimeout` or random numbers, or export couldn't get back to an exact frame.
2. **Drive it with the real clock for preview.** In the browser, `requestAnimationFrame` keeps calling `render(t)` with the current time, and you see an animation playing. Dragging the scrubber just means picking a different t.
3. **Capture frame by frame for export.** A headless browser opens the same page, sets t one frame at a time at the frame rate, takes a screenshot of each, and hands the screenshots to FFmpeg to encode as an MP4. This isn't screen recording, so it doesn't matter how fast the machine is: every frame is exact.

Here is a minimal example: a progress bar that goes from 0% to 100% in 2 seconds.

```html
<div id="label"></div>
<div id="bar"></div>
<script>
  const DURATION = 2; // seconds
  const ease = x => 1 - Math.pow(1 - x, 3);

  // The picture depends only on t: the same t always draws the same frame
  window.render = (t) => {
    const p = ease(Math.min(t / DURATION, 1));
    document.getElementById('bar').style.width = `${p * 480}px`;
    document.getElementById('label').textContent = `${Math.round(p * 100)}%`;
  };

  // Preview: drive render(t) with the real clock; skipped under automation
  if (!navigator.webdriver) {
    const start = performance.now();
    const tick = () => {
      render(((performance.now() - start) / 1000) % DURATION);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
</script>
```

The export script drives headless Chromium with Playwright and pipes the screenshots straight into FFmpeg:

```js
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const FPS = 30, DURATION = 2, W = 640, H = 360;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(new URL('anim.html', import.meta.url).href);

// Write each PNG screenshot to ffmpeg's stdin; ffmpeg encodes the MP4
const ffmpeg = spawn('ffmpeg', [
  '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', 'out.mp4',
], { stdio: ['pipe', 'inherit', 'inherit'] });

for (let i = 0; i < FPS * DURATION; i++) {
  await page.evaluate(t => window.render(t), i / FPS);   // jump to frame i
  ffmpeg.stdin.write(await page.screenshot());           // capture it
}

ffmpeg.stdin.end();
await new Promise(r => ffmpeg.on('close', r));
await browser.close();
```

On my Mac, this script produced a 2-second, 60-frame MP4:

<figure style="margin: 1.6em 0;">
  <video src="demo.mp4" poster="demo-poster.png" width="640" height="360" autoplay loop muted playsinline style="max-width: 100%; height: auto; border-radius: 6px;"></video>
  <figcaption style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--muted);">The video exported by the two snippets above</figcaption>
</figure>

If the animation uses CSS animations or the Web Animations API, the same idea applies: pause them all during export and set each animation's `currentTime` to the milliseconds for t. As long as you can jump straight to any frame, you can export it.

## Remotion works the same way

Remotion is an open-source framework for writing videos in React. Its `useCurrentFrame()` returns the current frame number, and the component computes the picture from it. That is really a React version of `render(t)`:

```jsx
import { useCurrentFrame, interpolate } from 'remotion';

export const Bar = () => {
  const frame = useCurrentFrame();
  const width = interpolate(frame, [0, 60], [0, 480], {
    extrapolateRight: 'clamp',
  });
  return <div style={{ width, height: 40, background: '#e8a33d' }} />;
};
```

To render, Remotion also opens the page in headless Chrome, captures it frame by frame, and hands the frames to FFmpeg to encode[^2]. The differences are mostly in the layer above: it organizes the timeline with React components and ideas like `<Sequence>`, and it offers batch rendering in the cloud with Lambda.

Watch the license: individuals and companies of up to 3 people can use it for free, and larger companies need a Company License[^3].

## Does Motion use Remotion?

I don't know. In principle either route works: Motion could run a Remotion project in the background, or it could have Claude write a web page with a `render(t)` and capture it frame by frame with its own export service.

I lean toward the second, for three reasons, all of them guesses:

- Motion's output is previewed and edited inside Claude, and Claude's Artifacts are already web pages, so writing a page directly is the simplest path.
- Remotion needs a React project and a bundling step, which makes the loop longer for live preview and repeated edits in a conversation.
- Under Remotion's license, a company of Anthropic's size needs a commercial license, while the approach above has little core code, so building its own runtime isn't hard.

There is a community project on GitHub with the same name, whaleyxbt/claude-motion[^4]. It has nothing to do with Anthropic, but it happens to take both routes. One pipeline writes React components with Remotion. The other, `sims/`, makes each piece a single HTML file where `render(t)` is a pure function of time, physics is simulated once when the page loads, and on export headless Chromium captures the page frame by frame into ffmpeg at 60 fps. If you want to compare the two approaches, it works as a reference implementation.

## Summary

- Claude Motion's animations are code written by Claude, not footage from a video generation model. The underlying framework isn't public.
- The usual way to turn code animation into video: write the picture as a pure function of time, preview it in the browser, and on export have a headless browser capture it frame by frame for FFmpeg to encode.
- Remotion is the React version of this approach. There is no evidence so far that Motion uses it.

[^1]: Runway, [Runway is in Claude Motion](https://runway.com/news/company-news/runway-claude-motion), October 8, 2026
[^2]: Remotion docs, [renderMedia()](https://www.remotion.dev/docs/renderer/render-media): uses a headless browser by default and relies on `ffmpeg` and `ffprobe`
[^3]: Remotion docs, [Pricing](https://www.remotion.dev/docs/license/pricing)
[^4]: whaleyxbt, [claude-motion](https://github.com/whaleyxbt/claude-motion), MIT license
