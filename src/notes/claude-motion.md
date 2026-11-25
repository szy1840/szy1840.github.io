---
title: "Claude Motion 是怎么做动画的？和 Remotion 是什么关系"
date: 2026-11-25
tags: ["AI", "Animation", "Remotion", "Video"]
lang: zh
ref: claude-motion
templateEngineOverride: md
---

10 月 8 日，Anthropic 发布了 Claude Motion：在 Claude 里描述想要的内容，它会做出一段短的动画讲解，可以导出成 MP4[^1]。我第一个想到的问题是，它底层用的是不是 Remotion？

先说结论：Anthropic 没有公开 Motion 的实现，我也没有找到它用了 Remotion 的证据。下面分三部分来写：公开能确认的信息，这类工具通用的实现方式（附一个能跑的最小例子），以及我对 Motion 的推测。

## 公开的信息

Runway 是 Motion 的首发合作伙伴，从它的公告里能确认这几点[^1]：

- 输入是提示词，输出是一段短的动画讲解，画面由你材料里的文字、图表、形状和图片组成。
- 公告原话是 "Claude writes the code that animates your content"，也就是说，动画是 Claude 写的代码。
- 可以在对话里提修改，也可以在编辑器里直接调整；能下载成 MP4，也能交给 Runway 继续加工。
- 目前是 beta，Team 和 Enterprise 计划可用。

另外，多篇第三方报道转述了 Anthropic 的说法：Motion 没有用视频生成模型，所以不会生成实拍画面，也不会出现 AI 生成的人物。这一点我没有在 Anthropic 自己的页面上核实。

底层用的是什么框架、怎么渲染成 MP4，公告里都没有提。

## 代码动画怎么变成视频

"用代码写动画，再导出成视频"的工具，做法大同小异。核心是一个约定：**画面只由时间 t 决定**。

1. **把画面写成 `render(t)`。** 给一个时间 t，就画出那一帧；同一个 t 永远画出同一帧。动画不能依赖真实时钟、`setTimeout` 或随机数，否则导出的时候没法准确回到某一帧。
2. **预览时用真实时钟驱动。** 浏览器里用 `requestAnimationFrame` 不停地拿当前时间调用 `render(t)`，看起来就是一段正在播放的动画。拖进度条，也就是换一个 t。
3. **导出时逐帧截图。** 用无头浏览器打开同一个页面，按帧率一帧一帧地设置 t、截图，再把截图交给 FFmpeg 编码成 MP4。这不是录屏，所以和机器快慢无关，每一帧都是准的。

下面是一个最小的例子，页面上是一个在 2 秒内从 0% 涨到 100% 的进度条：

```html
<div id="label"></div>
<div id="bar"></div>
<script>
  const DURATION = 2; // 秒
  const ease = x => 1 - Math.pow(1 - x, 3);

  // 画面只由 t 决定：同一个 t 永远画出同一帧
  window.render = (t) => {
    const p = ease(Math.min(t / DURATION, 1));
    document.getElementById('bar').style.width = `${p * 480}px`;
    document.getElementById('label').textContent = `${Math.round(p * 100)}%`;
  };

  // 预览：用真实时钟驱动 render(t)；被自动化工具打开时不跑
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

导出脚本用 Playwright 驱动无头 Chromium，截图通过管道直接写给 FFmpeg：

```js
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const FPS = 30, DURATION = 2, W = 640, H = 360;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(new URL('anim.html', import.meta.url).href);

// 截图以 PNG 写进 ffmpeg 的标准输入，由它编码成 MP4
const ffmpeg = spawn('ffmpeg', [
  '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', 'out.mp4',
], { stdio: ['pipe', 'inherit', 'inherit'] });

for (let i = 0; i < FPS * DURATION; i++) {
  await page.evaluate(t => window.render(t), i / FPS);   // 跳到第 i 帧
  ffmpeg.stdin.write(await page.screenshot());           // 截下来
}

ffmpeg.stdin.end();
await new Promise(r => ffmpeg.on('close', r));
await browser.close();
```

在我的 Mac 上，这个脚本输出了一个 2 秒、60 帧的 MP4：

<figure style="margin: 1.6em 0;">
  <video src="demo.mp4" poster="demo-poster.png" width="640" height="360" autoplay loop muted playsinline style="max-width: 100%; height: auto; border-radius: 6px;"></video>
  <figcaption style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--muted);">上面两段代码导出的视频</figcaption>
</figure>

如果动画里用的是 CSS 动画或 Web Animations API，道理也一样：导出时把它们都暂停，再把每个动画的 `currentTime` 设成 t 对应的毫秒数。只要每一帧都能直接"跳过去"，就能导出。

## Remotion 也是这么做的

Remotion 是用 React 写视频的开源框架。它的 `useCurrentFrame()` 返回当前是第几帧，组件根据帧号算出画面，这其实就是 React 版的 `render(t)`：

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

渲染的时候，Remotion 同样是用无头 Chrome 打开页面、逐帧截图，再交给 FFmpeg 编码[^2]。区别主要在上层：它用 React 组件和 `<Sequence>` 这类概念来组织时间线，另外提供 Lambda 云端批量渲染。

许可证需要注意：个人和 3 人以内的公司可以免费用，更大的公司要买 Company License[^3]。

## Motion 用的是 Remotion 吗

不知道。从原理上讲两条路都行：Motion 可以在后台跑一个 Remotion 工程，也可以让 Claude 直接写一个带 `render(t)` 的网页，再用自己的导出服务逐帧截图。

我更倾向于后者，理由有三个，但都只是推测：

- Motion 的作品是在 Claude 里预览和编辑的，Claude 的 Artifact 本来就是网页，直接写一个网页最省事。
- Remotion 需要 React 工程和打包步骤，放进对话里实时预览、反复修改，链路更长。
- 按 Remotion 的许可证，Anthropic 这样规模的公司需要商业授权；而上面那套做法核心代码不多，自己做一个运行时也不难。

GitHub 上有一个同名的社区项目 whaleyxbt/claude-motion[^4]，和 Anthropic 没有关系，但正好两条路都走了。一条管线用 Remotion 写 React 组件；另一条 `sims/` 管线每个作品是一个单独的 HTML 文件，`render(t)` 是时间的纯函数，物理模拟在页面加载时先算好，导出时由无头 Chromium 逐帧截图交给 ffmpeg，输出 60fps 的视频。想对比这两种做法的话，可以拿它当参考实现。

## 小结

- Claude Motion 的动画是 Claude 写的代码，不是视频生成模型画出来的；底层框架没有公开。
- "代码动画 → 视频"的通用做法是：把画面写成时间的纯函数，在浏览器里预览，导出时由无头浏览器逐帧截图，交给 FFmpeg 编码。
- Remotion 是这套做法的 React 版。Motion 有没有用它，目前没有证据。

[^1]: Runway，[Runway is in Claude Motion](https://runway.com/news/company-news/runway-claude-motion)，2026 年 10 月 8 日
[^2]: Remotion 文档，[renderMedia()](https://www.remotion.dev/docs/renderer/render-media)：默认使用无头浏览器，并依赖 `ffmpeg` 和 `ffprobe`
[^3]: Remotion 文档，[Pricing](https://www.remotion.dev/docs/license/pricing)
[^4]: whaleyxbt，[claude-motion](https://github.com/whaleyxbt/claude-motion)，MIT 许可证
