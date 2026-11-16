import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { NextFunction, Request, Response } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hardcoded upstream Fish Audio TTS endpoint (never accept arbitrary upstream URLs from clients -> anti-SSRF)
const FISH_AUDIO_UPSTREAM_URL = "https://api.fish.audio/v1/tts";
const ALLOWED_FISH_MODELS = new Set(["s2.1-pro", "s2.1-pro-free", "drama-3", "s2-pro"]);
const ALLOWED_FISH_FORMATS = new Set(["mp3", "wav", "opus", "pcm"]);
const MAX_TEXT_LENGTH = 1000;
const REFERENCE_ID_RE = /^[a-zA-Z0-9_-]{3,128}$/;

const SESSION_COOKIE_NAME = "ww_fish_sid";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_BYOK_SESSIONS = 500;
const EPHEMERAL_MASTER_KEY = crypto.randomBytes(32);

interface EncryptedSessionEntry {
  iv: Buffer;
  tag: Buffer;
  cipher: Buffer;
  expiresAt: number;
}

const byokSessions = new Map<string, EncryptedSessionEntry>();
const rateLimitBuckets = new Map<string, number[]>();

function loadDotEnvIfPresent(): void {
  const envPath = path.resolve(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  try {
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // Ignore unreadable .env
  }
}

loadDotEnvIfPresent();

function parseCliPort(): number | null {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      const n = Number(args[i + 1]);
      if (Number.isInteger(n) && n > 0 && n < 65536) return n;
    } else if (args[i].startsWith("--port=")) {
      const n = Number(args[i].slice("--port=".length));
      if (Number.isInteger(n) && n > 0 && n < 65536) return n;
    }
  }
  return null;
}

function getServerPort(isProd: boolean): number {
  const cliPort = parseCliPort();
  if (cliPort) return cliPort;
  if (isProd) {
    const p = Number(process.env.PORT);
    if (Number.isInteger(p) && p > 0 && p < 65536) return p;
    return 3000;
  }
  const devPort = Number(process.env.DEFAULT_APP_PORT);
  if (Number.isInteger(devPort) && devPort > 0 && devPort < 65536) return devPort;
  return 3000;
}

function redactSecrets(input: unknown, extraSecrets: string[] = []): string {
  let text = String(input == null ? "" : input);
  const serverKey = String(process.env.FISH_AUDIO_API_KEY || "").trim();
  const proxyTok = String(process.env.FISH_PROXY_ACCESS_TOKEN || "").trim();
  const candidates = [serverKey, proxyTok, ...extraSecrets].filter((s) => s && s.length >= 4);
  for (const secret of candidates) {
    text = text.split(secret).join("[REDACTED]");
  }
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, "Bearer [REDACTED]");
  text = text.replace(/\b(?:sk|fa|fish|key)[_-][A-Za-z0-9_-]{8,}\b/gi, "[REDACTED]");
  return text;
}

function safeTimingEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[name] = decodeURIComponent(val);
    } catch {
      out[name] = val;
    }
  }
  return out;
}

function encryptApiKeyForSession(apiKey: string): EncryptedSessionEntry {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", EPHEMERAL_MASTER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv,
    tag,
    cipher: encrypted,
    expiresAt: Date.now() + SESSION_TTL_MS
  };
}

function decryptApiKeyFromSession(sessionId: string): string {
  const entry = byokSessions.get(sessionId);
  if (!entry) return "";
  if (entry.expiresAt <= Date.now()) {
    byokSessions.delete(sessionId);
    return "";
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", EPHEMERAL_MASTER_KEY, entry.iv);
  decipher.setAuthTag(entry.tag);
  const plain = Buffer.concat([decipher.update(entry.cipher), decipher.final()]);
  return plain.toString("utf8");
}

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [sid, entry] of byokSessions.entries()) {
    if (entry.expiresAt <= now) byokSessions.delete(sid);
  }
  while (byokSessions.size >= MAX_BYOK_SESSIONS) {
    const firstKey = byokSessions.keys().next().value;
    if (!firstKey) break;
    byokSessions.delete(firstKey);
  }
}

function getAllowedExtraOrigins(): Set<string> {
  const raw = String(process.env.FISH_PROXY_ALLOWED_ORIGINS || "");
  const set = new Set<string>([
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost",
    "https://localhost"
  ]);
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed) set.add(trimmed);
  }
  return set;
}

function isOriginAllowed(req: Request, origin: string): boolean {
  if (!origin) return true;
  if (getAllowedExtraOrigins().has(origin)) return true;
  try {
    const parsedOrigin = new URL(origin);
    const reqHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().toLowerCase();
    if (reqHost && parsedOrigin.host.toLowerCase() === reqHost) {
      return true;
    }
    if (parsedOrigin.hostname === "localhost" || parsedOrigin.hostname === "127.0.0.1") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function isLoopbackIp(ip: string | undefined): boolean {
  const clean = String(ip || "").trim();
  return clean === "127.0.0.1" || clean === "::1" || clean === "::ffff:127.0.0.1";
}

function checkRateLimit(req: Request): { allowed: boolean; retryAfterSec: number } {
  const limitMax = Math.max(5, Math.min(300, Number(process.env.FISH_PROXY_RATE_LIMIT_MAX || 30) || 30));
  const windowMs = 60 * 1000;
  const clientKey = String(req.ip || req.socket.remoteAddress || "unknown");
  const now = Date.now();
  const timestamps = (rateLimitBuckets.get(clientKey) || []).filter((ts) => now - ts < windowMs);
  if (timestamps.length >= limitMax) {
    const oldest = timestamps[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    rateLimitBuckets.set(clientKey, timestamps);
    return { allowed: false, retryAfterSec };
  }
  timestamps.push(now);
  rateLimitBuckets.set(clientKey, timestamps);
  if (rateLimitBuckets.size > 2000) {
    for (const [k, list] of rateLimitBuckets.entries()) {
      const fresh = list.filter((ts) => now - ts < windowMs);
      if (fresh.length) rateLimitBuckets.set(k, fresh);
      else rateLimitBuckets.delete(k);
    }
  }
  return { allowed: true, retryAfterSec: 0 };
}

function isHttpsOrLocal(req: Request): boolean {
  if (process.env.NODE_ENV !== "production" || process.env.FISH_PROXY_ALLOW_HTTP === "1") {
    return true;
  }
  const xfProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  if (xfProto === "https" || req.secure) return true;
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

function getMimeForFormat(fmt: string): string {
  if (fmt === "wav") return "audio/wav";
  if (fmt === "opus") return "audio/ogg; codecs=opus";
  if (fmt === "pcm") return "audio/pcm";
  return "audio/mpeg";
}

function fishProxySecurityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = String(req.headers.origin || "").trim();
  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (origin) {
    if (!isOriginAllowed(req, origin)) {
      res.status(403).json({
        error: "origin_not_allowed",
        message: "拒绝未授权来源（Origin）访问 Fish Audio 语音代理"
      });
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Fish-Proxy-Token, X-Fish-Session, X-Requested-With");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!isHttpsOrLocal(req)) {
    res.status(403).json({
      error: "https_required",
      message: "生产环境仅允许通过 HTTPS 调用 Fish Audio 代理"
    });
    return;
  }

  const configuredToken = String(process.env.FISH_PROXY_ACCESS_TOKEN || "").trim();
  if (configuredToken) {
    const providedToken = String(req.headers["x-fish-proxy-token"] || "").trim();
    if (!providedToken || !safeTimingEqual(providedToken, configuredToken)) {
      res.status(401).json({
        error: "proxy_unauthorized",
        message: "Fish Audio 代理访问令牌无效或缺失，请在系统设置中核对 Proxy Access Token"
      });
      return;
    }
  } else if (req.method !== "GET") {
    // When no shared token is set, reject anonymous external non-browser/cross-site mutating requests
    const secFetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
    const hasSameOriginProof =
      Boolean(origin) ||
      secFetchSite === "same-origin" ||
      isLoopbackIp(req.ip || req.socket.remoteAddress);
    if (!hasSameOriginProof) {
      res.status(403).json({
        error: "proxy_auth_required",
        message: "匿名外部请求被拦截：请配置同源访问或 FISH_PROXY_ACCESS_TOKEN"
      });
      return;
    }
  }

  next();
}

export function createApp(): express.Express {
  const app = express();
  app.set("trust proxy", 1);

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "wanwan-fish-tts-proxy", upstream: FISH_AUDIO_UPSTREAM_URL });
  });

  app.use("/api/tts/fish", express.json({ limit: "16kb" }), fishProxySecurityMiddleware);

  app.get("/api/tts/fish/status", (req: Request, res: Response) => {
    const serverKeyConfigured = Boolean(String(process.env.FISH_AUDIO_API_KEY || "").trim());
    const requiresAccessToken = Boolean(String(process.env.FISH_PROXY_ACCESS_TOKEN || "").trim());
    const byokSessionAllowed = process.env.FISH_ALLOW_BYOK_SESSION !== "0";
    const cookies = parseCookies(req.headers.cookie);
    const sid = String(req.headers["x-fish-session"] || cookies[SESSION_COOKIE_NAME] || "").trim();
    let hasByokSession = false;
    if (sid) {
      try {
        hasByokSession = Boolean(decryptApiKeyFromSession(sid));
      } catch {
        hasByokSession = false;
      }
    }
    res.json({
      ok: true,
      serverKeyConfigured,
      requiresAccessToken,
      byokSessionAllowed,
      hasByokSession,
      models: Array.from(ALLOWED_FISH_MODELS),
      formats: Array.from(ALLOWED_FISH_FORMATS),
      maxTextLength: MAX_TEXT_LENGTH
    });
  });

  app.post("/api/tts/fish/session", (req: Request, res: Response) => {
    if (process.env.FISH_ALLOW_BYOK_SESSION === "0") {
      res.status(403).json({
        error: "byok_disabled",
        message: "服务端已禁用客户端自带密钥模式，请使用服务端托管密钥"
      });
      return;
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const apiKey = String(body.apiKey || "").trim();
    if (!apiKey || apiKey.length < 8 || apiKey.length > 512 || /[\r\n\s]/.test(apiKey)) {
      res.status(400).json({
        error: "invalid_api_key_format",
        message: "Fish Audio API Key 格式无效"
      });
      return;
    }

    pruneExpiredSessions();
    const sid = crypto.randomBytes(24).toString("base64url");
    byokSessions.set(sid, encryptApiKeyForSession(apiKey));

    const secureCookie = isHttpsOrLocal(req) && process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/api/tts/fish; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secureCookie}`
    );
    res.json({
      ok: true,
      sessionToken: sid,
      expiresInSec: Math.floor(SESSION_TTL_MS / 1000)
    });
  });

  app.delete("/api/tts/fish/session", (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const sid = String(req.headers["x-fish-session"] || cookies[SESSION_COOKIE_NAME] || "").trim();
    if (sid) byokSessions.delete(sid);
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/api/tts/fish; Max-Age=0`
    );
    res.json({ ok: true });
  });

  app.post("/api/tts/fish", async (req: Request, res: Response) => {
    const startedAt = Date.now();
    const rate = checkRateLimit(req);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSec));
      res.status(429).json({
        error: "rate_limited",
        message: `请求过于频繁，请 ${rate.retryAfterSec} 秒后再试`
      });
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body : null;
    if (!body) {
      res.status(400).json({ error: "invalid_body", message: "请求体必须为 JSON 对象" });
      return;
    }

    // Strict SSRF prevention: reject any attempt to supply target URL/host
    for (const forbiddenKey of ["url", "endpoint", "targetUrl", "upstream", "upstreamUrl", "host", "baseUrl"]) {
      if (forbiddenKey in body) {
        res.status(400).json({ error: "ssrf_rejected", message: "代理禁止客户端指定上游地址" });
        return;
      }
    }

    const text = String(body.text || "").trim();
    if (!text) {
      res.status(400).json({ error: "empty_text", message: "语音文本不能为空" });
      return;
    }
    if (text.length > MAX_TEXT_LENGTH) {
      res.status(400).json({
        error: "text_too_long",
        message: `语音文本过长（最多 ${MAX_TEXT_LENGTH} 字符）`
      });
      return;
    }

    const referenceId = String(body.reference_id || "").trim();
    if (!referenceId || !REFERENCE_ID_RE.test(referenceId)) {
      res.status(400).json({
        error: "invalid_reference_id",
        message: "Fish Audio Reference ID 无效或未填写"
      });
      return;
    }

    const model = String(body.model || "s2.1-pro").trim();
    if (!ALLOWED_FISH_MODELS.has(model)) {
      res.status(400).json({
        error: "unsupported_model",
        message: `不支持的 Fish Audio 模型：${model}`
      });
      return;
    }

    const format = String(body.format || "mp3").trim().toLowerCase();
    if (!ALLOWED_FISH_FORMATS.has(format)) {
      res.status(400).json({
        error: "unsupported_format",
        message: `不支持的音频格式：${format}`
      });
      return;
    }

    // Resolve API Key safely on the server:
    // Priority 1: Server environment variable FISH_AUDIO_API_KEY
    // Priority 2: Ephemeral BYOK session (HttpOnly cookie or X-Fish-Session header; never logged/returned)
    let resolvedKey = String(process.env.FISH_AUDIO_API_KEY || "").trim();
    let usedSession = false;
    if (!resolvedKey) {
      const cookies = parseCookies(req.headers.cookie);
      const sid = String(req.headers["x-fish-session"] || cookies[SESSION_COOKIE_NAME] || "").trim();
      if (sid) {
        try {
          resolvedKey = decryptApiKeyFromSession(sid);
          usedSession = Boolean(resolvedKey);
        } catch {
          resolvedKey = "";
        }
      }
    }

    if (!resolvedKey) {
      res.status(503).json({
        error: "proxy_key_missing",
        message: "代理服务端未配置 FISH_AUDIO_API_KEY，且当前未建立有效的临时会话密钥"
      });
      return;
    }

    const upstreamPayload: Record<string, unknown> = {
      text,
      reference_id: referenceId,
      format,
      normalize: body.normalize !== false
    };
    if (body.prosody && typeof body.prosody === "object") {
      const p = body.prosody as Record<string, unknown>;
      const cleanProsody: Record<string, number> = {};
      if (p.speed != null && Number.isFinite(Number(p.speed))) {
        cleanProsody.speed = Math.max(0.5, Math.min(2.0, Number(p.speed)));
      }
      if (p.volume != null && Number.isFinite(Number(p.volume))) {
        cleanProsody.volume = Math.max(-20, Math.min(20, Number(p.volume)));
      }
      if (Object.keys(cleanProsody).length) upstreamPayload.prosody = cleanProsody;
    }

    const timeoutMs = Math.max(3000, Math.min(60000, Number(process.env.FISH_PROXY_TIMEOUT_MS || 25000) || 25000));
    let upstreamRes: globalThis.Response;
    try {
      upstreamRes = await fetch(FISH_AUDIO_UPSTREAM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resolvedKey}`,
          model
        },
        body: JSON.stringify(upstreamPayload),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (err: unknown) {
      const errName = err && typeof err === "object" && "name" in err ? String((err as { name?: unknown }).name) : "";
      const errMsg = redactSecrets(err && typeof err === "object" && "message" in err ? String((err as { message?: unknown }).message) : String(err), [resolvedKey]);
      if (errName === "TimeoutError" || errName === "AbortError") {
        console.warn(`[fish-tts-proxy] timeout durationMs=${Date.now() - startedAt} model=${model} format=${format}`);
        res.status(504).json({
          error: "upstream_timeout",
          message: `Fish Audio 上游请求超时（>${Math.round(timeoutMs / 1000)}s）`
        });
        return;
      }
      console.error(`[fish-tts-proxy] network_error durationMs=${Date.now() - startedAt} err=${errMsg.slice(0, 120)}`);
      res.status(502).json({
        error: "upstream_network_error",
        message: "Fish Audio 上游网络连接失败，请稍后重试"
      });
      return;
    }

    if (!upstreamRes.ok) {
      let detail = "";
      try {
        const rawText = await upstreamRes.text();
        if (rawText) {
          try {
            const parsed = JSON.parse(rawText) as Record<string, unknown>;
            detail = String(
              parsed.message ||
              parsed.reason ||
              parsed.detail ||
              (parsed.error && typeof parsed.error === "object" ? (parsed.error as Record<string, unknown>).message : "") ||
              rawText
            );
          } catch {
            detail = rawText;
          }
        }
      } catch {
        detail = "";
      }
      const cleanDetail = redactSecrets(detail, [resolvedKey]).slice(0, 260);
      const status = upstreamRes.status;
      let code = "upstream_error";
      let friendly = `Fish Audio 上游错误（HTTP ${status}）`;
      if (status === 400 || status === 422) {
        code = "bad_request";
        friendly = `模型（${model}）或 Reference ID 参数错误（HTTP ${status}）`;
      } else if (status === 401) {
        code = "upstream_auth_401";
        friendly = usedSession
          ? "Fish Audio API Key 无效或已过期（HTTP 401）"
          : "服务端 Fish Audio API Key 无效或已过期（HTTP 401）";
      } else if (status === 403) {
        code = "upstream_forbidden_403";
        friendly = "Fish Audio 权限不足或账号额度未授权（HTTP 403）";
      } else if (status === 429) {
        code = "upstream_rate_limit_429";
        friendly = "Fish Audio 请求频率或余额额度超限（HTTP 429）";
      } else if (status >= 500) {
        code = "upstream_server_5xx";
        friendly = `Fish Audio 服务端异常（HTTP ${status}）`;
      }
      console.warn(`[fish-tts-proxy] upstream_status=${status} code=${code} durationMs=${Date.now() - startedAt} model=${model}`);
      res.status(status).json({
        error: code,
        upstreamStatus: status,
        message: cleanDetail ? `${friendly}：${cleanDetail}` : friendly
      });
      return;
    }

    const buf = Buffer.from(await upstreamRes.arrayBuffer());
    if (!buf.length) {
      res.status(502).json({
        error: "empty_audio_stream",
        message: "Fish Audio 上游返回了空音频流"
      });
      return;
    }

    const contentType = upstreamRes.headers.get("content-type") || getMimeForFormat(format);
    res.status(200);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buf.length));
    res.setHeader("X-TTS-Provider", "fish_audio");
    res.setHeader("X-TTS-Format", format);
    console.info(`[fish-tts-proxy] ok status=200 bytes=${buf.length} durationMs=${Date.now() - startedAt} model=${model} format=${format}`);
    res.send(buf);
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const safeMsg = redactSecrets(err && typeof err === "object" && "message" in err ? (err as { message?: unknown }).message : "服务器内部错误");
    res.status(500).json({ error: "internal_error", message: safeMsg.slice(0, 200) });
  });

  return app;
}

async function startServer(): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";
  const port = getServerPort(isProd);
  const app = createApp();

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("/{*splat}", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`[wanwan-server] listening on http://0.0.0.0:${port} (mode=${isProd ? "production" : "development"})`);
  });
}

const isDirectEntry = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === __filename;
if (isDirectEntry) {
  startServer().catch((err) => {
    console.error("[wanwan-server] failed to start:", err);
    process.exit(1);
  });
}
