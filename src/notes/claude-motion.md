---
title: "Claude Motion 是怎么做动画的？和 Remotion 是什么关系"
date: 2026-11-25
tags: ["AI", "Animation", "Remotion", "Video"]
lang: zh
ref: claude-motion
templateEngineOverride: md
---

10 月 8 日，Anthropic 发布了 Claude Motion：描述想要的内容，Claude 做出一段短的动画讲解，可以导出成 MP4。我想知道它底层是不是 Remotion。结论是：Anthropic 没有公开实现，我也没找到它用了 Remotion 的证据。

## 公开的信息

Runway 的发布公告[^1]能确认：画面由你材料里的文字、图表、形状和图片组成；"Claude writes the code that animates your content"，也就是说动画是 Claude 写的代码；可以对话修改或在编辑器里调整，导出 MP4。第三方报道还转述 Anthropic 的说法，Motion 没有用视频生成模型（这一点我没在官方页面上核实）。底层框架和渲染方式都没有提。

## 代码动画怎么变成视频

这类工具的核心约定是：**画面只由时间 t 决定**。

1. 把画面写成 `render(t)`，同一个 t 永远画出同一帧，不依赖真实时钟或随机数。
2. 预览时用 `requestAnimationFrame` 拿当前时间调用 `render(t)`，看起来就是在播放。
3. 导出时用无头浏览器逐帧设置 t、截图，交给 FFmpeg 编码。这不是录屏，所以每一帧都是准的。

一个最小的例子，2 秒内从 0% 涨到 100% 的进度条：

```html
<div id="label"></div>
<div id="bar"></div>
<script>
  const ease = x => 1 - Math.pow(1 - x, 3);

  window.render = (t) => {            // 画面只由 t 决定
    const p = ease(Math.min(t / 2, 1));
    document.getElementById('bar').style.width = `${p * 480}px`;
    document.getElementById('label').textContent = `${Math.round(p * 100)}%`;
  };

  if (!navigator.webdriver) {         // 预览时用真实时钟驱动
    const start = performance.now();
    const tick = () => {
      render(((performance.now() - start) / 1000) % 2);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
</script>
```

导出脚本用 Playwright 驱动无头 Chromium，截图通过管道写给 FFmpeg：

```js
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const FPS = 30;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(new URL('anim.html', import.meta.url).href);

const ffmpeg = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS),
  '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', 'out.mp4']);

for (let i = 0; i < FPS * 2; i++) {
  await page.evaluate(t => window.render(t), i / FPS);  // 跳到第 i 帧
  ffmpeg.stdin.write(await page.screenshot());          // 截图
}
ffmpeg.stdin.end();
await new Promise(r => ffmpeg.on('close', r));
await browser.close();
```

导出的结果：

<figure style="margin: 1.6em 0;">
  <video src="demo.mp4" poster="demo-poster.png" width="640" height="360" autoplay loop muted playsinline style="max-width: 100%; height: auto; border-radius: 6px;"></video>
</figure>

## Remotion 也是这么做的

Remotion 是用 React 写视频的开源框架。`useCurrentFrame()` 返回当前帧号，组件据此算出画面，相当于 React 版的 `render(t)`；渲染时同样是无头浏览器逐帧截图，再交给 FFmpeg[^2]。个人和 3 人以内的公司可以免费用，更大的公司需要商业授权[^3]。

## Motion 用的是 Remotion 吗

不知道，两条路都走得通。我猜是自研的：Motion 在 Claude 里预览和编辑，Artifact 本来就是网页，直接写一个带 `render(t)` 的页面最省事；Remotion 还要 React 工程和打包，链路更长。但这只是推测。

顺带一提，GitHub 上有个同名的社区项目 whaleyxbt/claude-motion[^4]，和 Anthropic 无关，两条路都实现了：一条用 Remotion，另一条 `sims/` 是单个 HTML 文件加 `render(t)`，由无头 Chromium 逐帧截图交给 ffmpeg。可以当参考实现。

[^1]: Runway，[Runway is in Claude Motion](https://runway.com/news/company-news/runway-claude-motion)，2026 年 10 月 8 日
[^2]: Remotion 文档，[renderMedia()](https://www.remotion.dev/docs/renderer/render-media)
[^3]: Remotion 文档，[Pricing](https://www.remotion.dev/docs/license/pricing)
[^4]: whaleyxbt，[claude-motion](https://github.com/whaleyxbt/claude-motion)，MIT 许可证
