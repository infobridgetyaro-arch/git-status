---
name: HA & scalability architecture
description: Key design decisions for dual-VPS deployment, ABR HLS, Redis state, and failover watcher.
---

## HLS Encoder is a SEPARATE FFmpeg process
HLS encoding (`hls-encoder.ts`) spawns its own lightweight FFmpeg that reads
the same source URL as the RTMP pipeline. It does NOT touch the existing
`buildFFmpegArgs()` filter graph. If HLS fails, RTMP continues unaffected.
Triggered by `HLS_ENABLED=true` env var after stream reaches "streaming" status.

**Why:** Modifying the existing 7-pipe filter_complex for ABR splits is high risk;
a separate process is isolated and independently restartable.

**How to apply:** `startHlsEncoder` called in stream-manager.ts inside the
`if (!gotFrames)` block. `stopHlsEncoder` called in `cleanupStreamProc`.

## IStorage stays synchronous
`IStorage` interface in `storage.ts` is synchronous (returns values, not Promises).
`HybridStorage` wraps `MemStorage` for reads (fast, no network hop) and writes
to Redis asynchronously (fire-and-forget). Redis state is loaded into memory on
`init()` at startup.

**Why:** Changing the interface to async would require `await` on every route that
calls `storage.*` — a large risky diff across bintunet-routes.ts (1000+ lines).

## Failover watcher is a standalone script
`scripts/failover-watcher.mjs` runs as a separate PM2 process on the backup VPS
ONLY. It polls `primary:heartbeat` Redis key every 5s. On stale > 15s, it
authenticates to the local API and calls POST /api/streams/:id/start for each
stream ID listed in `primary:active_streams`.

**Why:** Decoupled from the main app process — if the main app crashes, the
watcher still runs and can restart streams on the backup.

## Deploy workflow builds once, deploys to both VPS in parallel
`.github/workflows/deploy.yml` has three jobs:
1. `build` — runs once on GitHub Actions runner, uploads tarball as artifact
2. `deploy-primary` and `deploy-backup` — download tarball, scp to VPS, extract, pm2 reload
Both deploy jobs run in parallel (both `needs: build`).

## GitHub Secrets required for deployment
PRIMARY_HOST, PRIMARY_USER, PRIMARY_SSH_KEY, PRIMARY_SSH_PORT (optional),
BACKUP_HOST, BACKUP_USER, BACKUP_SSH_KEY, BACKUP_SSH_PORT (optional),
APP_DIR, SESSION_SECRET, BINTUNET_PASSWORD, REDIS_URL,
HLS_ENABLED, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
R2_BUCKET, CDN_BASE_URL, YOUTUBE_API_KEY.

## Health endpoints
- `GET /api/healthz` — legacy minimal (kept for compat)
- `GET /api/health` — detailed (role, uptime, stream counts, WS clients, HLS/CDN status)
- `GET /api/ready` — readiness probe; returns 503 during graceful shutdown (isShuttingDown flag)

## Redis packages
`redis` ^4.7.0 and `chokidar` ^4.0.3 added to api-server/package.json.
Both bundle fine with esbuild (pure JS; chokidar v4 dropped native deps).
`@aws-sdk/client-s3` ^3.600.0 added but kept in esbuild externals (`@aws-sdk/*`)
so it loads from node_modules at runtime — must be installed on VPS.
