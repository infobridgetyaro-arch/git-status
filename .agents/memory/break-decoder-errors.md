---
name: Break decoder error logging
description: Why break video URL links failed silently and the fix applied
---
The secondary FFmpeg break-video decoder used -loglevel quiet and silenced stderr.
When a URL failed (SSL error, 403, redirect, etc.) there was zero feedback — user saw nothing.
Uploaded files always worked (local path, no network); typed HTTP URLs failed silently.
**Fix:** Changed to -loglevel error, added decoder.stderr logging to stream log, added -tls_verify 0 for HTTPS, added -rw_timeout 15000000, added decoderGotFrames flag that logs "Break video: playing" on first frame.
**Why:** Without error output the user had no way to know if a URL was invalid, rate-limited, or TLS-failing.
