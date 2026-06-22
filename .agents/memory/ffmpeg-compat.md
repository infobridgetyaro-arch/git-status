---
name: FFmpeg 7 argument compatibility
description: Deprecated flags that must be updated for FFmpeg 7
---
-vsync cfr is deprecated in FFmpeg 7; use -fps_mode cfr instead.
-vsync causes a warning that floods stderr and can interfere with log parsing.
**How to apply:** Any buildFFmpegArgs call using -vsync must use -fps_mode.
