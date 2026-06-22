import { spawn } from "child_process";
import fs from "fs";
import path from "path";

/** In-process cache: YouTube URL → downloaded temp file path */
const ytDownloadCache = new Map<string, string>();

/** Delete all cached yt-dlp downloads and clear the cache map. */
export function clearYtDownloadCache(): void {
  for (const [, filePath] of ytDownloadCache.entries()) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
  }
  ytDownloadCache.clear();
}

/**
 * Downloads a YouTube (or any yt-dlp-supported) video to a local temp mp4.
 * Uses --merge-output-format mp4 so video+audio are always combined.
 * Results are cached per URL (file is re-used on repeated calls).
 * onProgress receives filtered yt-dlp progress lines (download %, merge).
 */
export async function downloadYouTubeVideoToTemp(
  input: string,
  onProgress?: (msg: string) => void,
): Promise<string> {
  const url = input.trim();

  // Return cached file if it still exists on disk
  const cached = ytDownloadCache.get(url);
  if (cached && fs.existsSync(cached)) {
    onProgress?.("Using cached download — starting playback immediately");
    return cached;
  }

  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const destPath = path.join(uploadsDir, `break_yt_${Date.now()}.mp4`);
  const playerClients = getCookiesConfigured()
    ? "ios,mweb,web_creator,android,web"
    : "ios,mweb,android";

  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", [
      "--no-playlist",
      "-f", "b[height<=720][ext=mp4]/b[height<=480][ext=mp4]/b[height<=720]/b[height<=480]/b",
      "--merge-output-format", "mp4",
      "--no-check-certificate",
      "--socket-timeout", "30",
      "--extractor-args", `youtube:player_client=${playerClients};formats=missing_pot`,
      "--add-header", "Accept-Language:en-US,en;q=0.9",
      ...getCookiesArgs(),
      "-o", destPath,
      url,
    ]);

    let stderrBuf = "";
    proc.stderr?.on("data", (d: Buffer) => {
      const line = d.toString();
      stderrBuf += line;
      const trimmed = line.trim();
      if (onProgress && trimmed && (
        trimmed.startsWith("[download]") ||
        trimmed.startsWith("[Merger]") ||
        trimmed.startsWith("[ffmpeg]")
      )) {
        onProgress(trimmed.slice(0, 120));
      }
    });

    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      try { fs.unlinkSync(destPath); } catch {}
      reject(new Error("Download timed out after 120 seconds. Try a shorter video or upload the file instead."));
    }, 120000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(destPath)) {
        ytDownloadCache.set(url, destPath);
        resolve(destPath);
      } else {
        try { fs.unlinkSync(destPath); } catch {}
        // Do NOT cache failed URLs — allow the next attempt to retry fresh.
        reject(new Error(humaniseYtdlpError(
          stderrBuf.trim(),
          `yt-dlp could not download the video (exit ${code}). Is the video public?`,
        )));
      }
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(new Error("yt-dlp is not installed. Install with: pip install yt-dlp"));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Returns yt-dlp --cookies args if a cookies.txt file has been uploaded.
 * The cookies file lives at <cwd>/cookies.txt in Netscape format.
 */
export function getCookiesArgs(): string[] {
  const cookiesPath = path.join(process.cwd(), "cookies.txt");
  return fs.existsSync(cookiesPath) ? ["--cookies", cookiesPath] : [];
}

export function getCookiesConfigured(): boolean {
  return fs.existsSync(path.join(process.cwd(), "cookies.txt"));
}

/**
 * Reads cookies.txt (Netscape format) and returns a Cookie header string
 * suitable for FFmpeg's -headers option.
 * e.g. "Cookie: SID=abc; HSID=xyz\r\n"
 * Returns an empty string when no cookies file exists or it has no YouTube entries.
 */
export function getYouTubeFFmpegCookieHeader(): string {
  const cookiesPath = path.join(process.cwd(), "cookies.txt");
  if (!fs.existsSync(cookiesPath)) return "";

  try {
    const lines = fs.readFileSync(cookiesPath, "utf-8").split("\n");
    const pairs: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const parts = trimmed.split("\t");
      if (parts.length < 7) continue;
      const domain = parts[0];
      const name = parts[5];
      const value = parts[6];
      if (
        name && value &&
        (domain.includes("youtube.com") || domain.includes("google.com"))
      ) {
        pairs.push(`${name}=${value}`);
      }
    }
    return pairs.length > 0 ? `Cookie: ${pairs.join("; ")}\r\n` : "";
  } catch {
    return "";
  }
}

/** Friendly hint shown whenever YouTube blocks without cookies */
const COOKIES_HINT =
  "YouTube is blocking the request. Upload cookies.txt in Settings → YouTube Cookies to fix this.";

/**
 * Parses yt-dlp stderr and returns a user-friendly error message.
 * Detects bot/sign-in blocks and suggests uploading cookies.
 */
export function humaniseYtdlpError(stderr: string, fallback: string): string {
  const low = stderr.toLowerCase();
  if (
    low.includes("sign in") ||
    low.includes("not a bot") ||
    low.includes("confirm you") ||
    low.includes("bot detection")
  ) {
    return COOKIES_HINT;
  }
  if (low.includes("private video") || low.includes("age-restricted") || low.includes("age restricted")) {
    return `This video is private or age-restricted. Upload cookies.txt in Settings → YouTube Cookies.`;
  }
  return stderr ? `yt-dlp: ${stderr.slice(0, 300)}` : fallback;
}

/**
 * Gets the direct CDN video URL for a YouTube VOD (not a live stream).
 * Uses --get-url so there is NO download — the URL is passed straight to FFmpeg.
 * Much faster than downloadYouTubeVideoToTemp (instant vs 1–2 min).
 *
 * IMPORTANT: YouTube's "best" (720p/1080p) formats are DASH streams — they come
 * as two separate URLs (video-only + audio-only). FFmpeg cannot loop a DASH segment.
 * We therefore request format "18" first, which is YouTube's 360p muxed H.264+AAC
 * mp4 — always a single combined stream URL that FFmpeg can play and restart to loop.
 * For the break video overlay (composited as background) 360p is more than sufficient.
 */
export async function getYouTubeVideoDirectUrl(input: string): Promise<string> {
  const url = input.trim();
  const playerClients = getCookiesConfigured()
    ? "ios,mweb,web_creator,android,web"
    : "ios,mweb,android";

  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", [
      "--no-playlist",
      // Format 18 = YouTube's 360p muxed mp4 (H.264+AAC, single combined stream).
      // Fallback chain: 360p muxed → any muxed mp4 → worst muxed → any.
      // These all return ONE url from --get-url, not two separate DASH urls.
      "-f", "18/b[height<=480][ext=mp4]/worst[ext=mp4]/worst",
      "--get-url",
      "--no-check-certificate",
      "--socket-timeout", "20",
      "--extractor-args", `youtube:player_client=${playerClients};formats=missing_pot`,
      "--add-header", "Accept-Language:en-US,en;q=0.9",
      ...getCookiesArgs(),
      url,
    ]);

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      reject(new Error("Timeout getting YouTube video URL (20s)."));
    }, 20000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      const lines = stdout.trim().split("\n").filter((l) => l.startsWith("http"));
      // Expect exactly ONE url for a muxed format. If we still get two (DASH fallback),
      // reject so the caller can fall through to the full download instead.
      if (code === 0 && lines.length === 1) {
        resolve(lines[0]);
      } else if (code === 0 && lines.length > 1) {
        reject(new Error("YouTube returned separate DASH streams — falling back to download."));
      } else {
        reject(new Error(humaniseYtdlpError(stderr.trim(), "Could not get direct URL from YouTube.")));
      }
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(err.code === "ENOENT"
        ? new Error("yt-dlp is not installed. Install with: pip install yt-dlp")
        : err
      );
    });
  });
}

/** Normalise any YouTube channel/video input to a full HTTPS URL */
export function normaliseYouTubeUrl(input: string): string {
  const url = input.trim();
  if (url.startsWith("http")) return url;
  if (url.startsWith("@")) return `https://www.youtube.com/${url}/live`;
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return `https://www.youtube.com/watch?v=${url}`;
  return `https://www.youtube.com/@${url}/live`;
}

/**
 * Attempt 1 — streamlink.
 * Confirmed working in June 2025 even for channels that block yt-dlp's ios client.
 * Returns the raw HLS playlist URL (manifest.googlevideo.com/…/index.m3u8).
 */
function streamlinkGetYouTubeUrl(pageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("streamlink", [
      "--stream-url",
      "--http-timeout", "20",
      "--http-header", "User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "--http-header", "Accept-Language=en-US,en;q=0.9",
      pageUrl,
      "best",
    ]);

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      reject(new Error("TIMEOUT"));
    }, 35_000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      const url = stdout.trim().split("\n").find((l) => l.startsWith("http"));
      if (code === 0 && url) {
        resolve(url);
      } else {
        const errText = stderr.trim();
        const lower = errText.toLowerCase();
        if (lower.includes("no playable streams") || lower.includes("no streams")) {
          reject(new Error("NOT_LIVE"));
        } else {
          reject(new Error(errText ? `streamlink: ${errText.slice(0, 300)}` : "STREAMLINK_FAIL"));
        }
      }
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new Error(err.code === "ENOENT" ? "ENOENT_STREAMLINK" : `spawn: ${err.message}`));
    });
  });
}

/**
 * Attempt 2 — yt-dlp with a specific player_client.
 * mweb is confirmed to work in June 2025 without cookies.
 * ios is tried last since it started getting bot-blocked for some channels.
 */
function ytdlpGetYouTubeLiveUrl(pageUrl: string, playerClient: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", [
      "--no-playlist",
      "--no-live-from-start",
      "-f", "b[protocol^=m3u8]/b[ext=mp4]/b",
      "--get-url",
      "--no-check-certificate",
      "--socket-timeout", "15",
      "--extractor-args", `youtube:player_client=${playerClient};formats=missing_pot`,
      "--add-header", "Accept-Language:en-US,en;q=0.9",
      ...getCookiesArgs(),
      pageUrl,
    ]);

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      reject(new Error("TIMEOUT"));
    }, 30_000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      const lines = stdout.trim().split("\n").filter((l) => l.startsWith("http"));
      if (code === 0 && lines[0]) {
        resolve(lines[0]);
      } else {
        reject(new Error(humaniseYtdlpError(
          stderr.trim(),
          `yt-dlp (${playerClient}): Could not get YouTube stream URL.`,
        )));
      }
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new Error(err.code === "ENOENT"
        ? "yt-dlp is not installed. Install with: pip install yt-dlp"
        : `spawn: ${err.message}`
      ));
    });
  });
}

/**
 * Main YouTube live URL resolver.
 * 3-tier fallback chain (fastest/most-reliable first):
 *   1. streamlink          — no bot detection, confirmed working June 2025
 *   2. yt-dlp mweb client  — confirmed working, slight PO Token warning but functional
 *   3. yt-dlp ios+android  — original behaviour, kept as last resort / cookie path
 */
export async function getYouTubeStreamUrl(input: string): Promise<string> {
  const pageUrl = normaliseYouTubeUrl(input);

  // ── Attempt 1: streamlink ─────────────────────────────────────────────────
  try {
    const url = await streamlinkGetYouTubeUrl(pageUrl);
    return url;
  } catch (e: any) {
    const msg: string = e.message || "";
    if (msg === "NOT_LIVE") {
      throw new Error(`The YouTube channel does not appear to be live right now. Double-check the username/URL and try again.`);
    }
    // ENOENT_STREAMLINK or other failure — fall through silently to yt-dlp
  }

  // ── Attempt 2: yt-dlp mweb (confirmed working without cookies) ────────────
  try {
    return await ytdlpGetYouTubeLiveUrl(pageUrl, "mweb");
  } catch (e: any) {
    const msg: string = e.message || "";
    if (msg === COOKIES_HINT || msg.includes("not live")) {
      throw new Error(msg); // surface sign-in / not-live immediately
    }
    // other failure — fall through to ios client
  }

  // ── Attempt 3: yt-dlp ios + android (original behaviour) ─────────────────
  const clientList = getCookiesConfigured()
    ? "ios,mweb,web_creator,android,web"
    : "ios,mweb,android";

  try {
    return await ytdlpGetYouTubeLiveUrl(pageUrl, clientList);
  } catch (e: any) {
    throw new Error(e.message || "Could not get YouTube stream URL. Is the channel live and accessible?");
  }
}
