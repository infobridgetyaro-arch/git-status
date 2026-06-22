---
name: FFmpeg pixel format YUV to RGBA
description: Use yuva420p not rgba for transparent-padded source video in the filter graph.
---

## Rule
When padding the source video with transparent bars (`pad=...color=black@0`) use `format=yuva420p`, not `format=rgba`.

## Why
TikTok/YouTube sources are `yuv420p`. Converting to `rgba` triggers swscaler:
```
[swscaler] deprecated pixel format used, make sure you did set range correctly
```
This is a YUV limited-range → RGB full-range conversion without explicit range flags. It causes colour inaccuracies and console noise.

`yuva420p` stays in YUV colour space (just adds an alpha plane), so no swscaler conversion occurs and no warning is emitted. The overlay filter with `format=auto` handles `yuva420p` alpha correctly.

## How to apply
In `buildFFmpegArgs` inside `stream-manager.ts`, the `videoSrcFilter` chain ends with `format=yuva420p[_src]` (not `format=rgba`).
