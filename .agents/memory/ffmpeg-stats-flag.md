---
name: FFmpeg -stats flag requirement
description: FFmpeg 7 silently suppresses progress output without -stats
---
FFmpeg 7.x does not emit frame= progress lines to stderr when -loglevel warning unless -stats is explicitly set.
The startupWatchdog and stallWatchdog both depend on gotFrames/lastFrameCount being updated from frame= lines.
Without -stats the watchdog kills every stream after 60s even when encoding is working.
**Fix:** Add "-stats" to args array right after "-loglevel warning" in buildFFmpegArgs.
**Why:** FFmpeg 7 changed the default behavior for progress output. Pre-7 versions always emitted stats.
