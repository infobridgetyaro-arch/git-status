---
name: Stream process killers
description: Three confirmed mechanisms that silently kill active FFmpeg streams in BintuNet.
---

## Three confirmed stream killers

### 1. Drain deadlock in OverlayRenderer.startWritingTo
When FFmpeg's OS pipe buffer fills (backpressure), `dest.write(buf)` returns false and the renderer waits for `drain`. If FFmpeg is slow/stuck, `drain` never fires — renderer freezes → no new frames → stall watchdog fires after 30s → hard kill.

**Fix:** Added a `drainTimeoutMs = intervalMs * 4` (~800ms at 5fps) timeout. If drain doesn't arrive, drop the frame and resume — keeps the stall watchdog fed.

**Why:** The deadlock is self-reinforcing: slow FFmpeg → pipe full → renderer stops → FFmpeg has nothing to encode → stall detected → kill.

### 2. Startup watchdog called stopStream (no retry)
When FFmpeg didn't produce frames within 60s (slow TikTok URL + FFmpeg init), the watchdog called `stopStream()`. That function sets `autoRestart=false` *before* stopping, permanently silencing streams even if the user had auto-restart enabled.

**Fix:** Startup watchdog now calls `hardKillAndRestart(streamId, 1000, true)` (forced fresh URL) instead of `stopStream()`.

**Why:** `stopStream` is the user-initiated stop path and intentionally disables auto-restart. The startup watchdog should use the same path as the stall watchdog.

### 3. PM2 max_memory_restart at 512M
Two OverlayRenderer instances at 5fps with 1280×720 RGBA frames = ~37MB/s through Node.js buffers. Under load this pushes past 512MB, causing PM2 to restart the entire server — killing ALL active streams simultaneously.

**Fix:** Raised to 1536M in `ecosystem.config.cjs`.

**Why:** Canvas rendering is inherently memory-intensive; 512M was set before the dual-renderer architecture was added.
