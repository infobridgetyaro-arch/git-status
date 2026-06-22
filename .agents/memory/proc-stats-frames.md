---
name: proc_stats frame count broadcasting
description: How to make frame count available to the polling interval
---
lastFrameCount was a closure-local variable inside startStream. startProcStatsPolling only received the pid, so it could not access the frame count.
**Fix:** Added lastFrameCount and streamStartTime fields to StreamProcess interface. In the stderr handler, after updating lastFrameCount, also write activeStreams.get(streamId).lastFrameCount = lastFrameCount. startProcStatsPolling reads proc.lastFrameCount and includes frames + uptime in the broadcast.
**Why:** The closure variable is only readable inside the startStream scope; the polling interval runs independently and needs a shared location.
