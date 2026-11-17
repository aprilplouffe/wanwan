/**
 * 弯弯小手机 - Fish Audio TTS 多用户 BYOK Cloudflare Worker 安全代理
 * 适配前端协议：js/tts-provider.js (/api/tts/fish, /api/tts/fish/status, /api/tts/fish/session)
 *
 * 设计原则：
 *   1. 纯 BYOK（Bring Your Own Key）模式：不读取、不使用任何开发者共享 FISH_AUDIO_API_KEY。
 *   2. 短期加密会话：用户个人 Key 仅在 /api/tts/fish/session 经服务端 Secret（AES-256-GCM）
 *      封装为有时效且绑定来源 Origin 的不透明密文令牌，Worker 不在日志、KV、数据库或缓存中保存明文 Key。
 *   3. 固定上游白名单：仅允许转发至 https://api.fish.audio/v1/tts，严禁任意 URL 代理（防 SSRF）。
 *   4. 兼容 GitHub Pages：完整支持 OPTIONS 预检、Access-Control-Allow-Credentials、X-Fish-Session 与音频二进制响应。
 *
 * Cloudflare 后台环境变量配置（Settings -> Variables and Secrets）：
 *   - 必填 Secret（Encrypt）: BYOK_SESSION_SECRET
 *       用于 AES-256-GCM 加密/解密短期会话令牌的随机高强度密钥（至少 32 位随机字符）。
 *   - 必填 Variable（Text）: ALLOWED_ORIGINS
 *       允许访问的浏览器 Origin 白名单（逗号分隔，仅协议+域名，不含路径与末尾斜杠）。
 *       例如：https://你的用户名.github.io
 *   - 可选 Variable（Text）: SESSION_TTL_SEC        短期会话有效期秒数（默认 1800，范围 300~14400）
 *   - 可选 Variable（Text）: RATE_LIMIT_PER_MIN     单 IP 每分钟最大合成请求数（默认 15，上限 120）
 *   - 可选 Variable（Text）: SESSION_RATE_PER_MIN   单 IP 每分钟最大会话签发次数（默认 10）
 *   - 可选 Variable（Text）: MAX_CONCURRENT_PER_IP  单实例内单 IP 最大并发请求数（默认 3）
 *   - 可选 Variable（Text）: MAX_CONCURRENT_GLOBAL  单实例全局最大并发请求数（默认 25）
 *   - 可选 Secret（Encrypt）: FISH_PROXY_ACCESS_TOKEN 若自建私有代理可附加访问口令（面向公众 GitHub Pages 勿硬编码此值）
 *   - 可选 Binding: FISH_RATE_LIMITER（Cloudflare Rate Limiting Binding / DO，建议生产大流量时绑定）
 */

const FISH_UPSTREAM = "https://api.fish.audio/v1/tts";
const ALLOWED_MODELS = new Set(["s2.1-pro-free", "s2.1-pro", "drama-3", "s2-pro"]);
const DEFAULT_MODEL = "s2.1-pro-free";
const ALLOWED_FORMATS = new Set(["mp3", "wav", "opus", "pcm"]);
const MAX_TEXT_LENGTH = 1000;
const MAX_BODY_BYTES = 16384;
const UPSTREAM_TIMEOUT_MS = 25000;
const DEFAULT_SESSION_TTL_SEC = 1800; // 30 分钟短期会话
const DEFAULT_TTS_RATE_PER_MIN = 15;
const DEFAULT_SESSION_RATE_PER_MIN = 10;
const DEFAULT_MAX_CONCURRENT_PER_IP = 3;
const DEFAULT_MAX_CONCURRENT_GLOBAL = 25;
const SESSION_COOKIE_NAME = "ww_fish_sid";
const REF_ID_RE = /^[a-zA-Z0-9_-]{3,128}$/;

// 单 Worker Isolate 内尽力而为的并发与滑动窗口计数（无法替代 Cloudflare WAF / Rate Limiting Binding）
const memoryRateMap = new Map();
const memoryInflightByIp = new Map();
let memoryInflightGlobal = 0;

function redact(text, secrets) {
  let out = String(text || "");
  for (const s of secrets || []) {
    if (s && String(s).length >= 4) {
      out = out.split(String(s)).join("[REDACTED]");
    }
  }
  return out
    .replace(/Bearer\s+[A-Za-z0-9._~+\/=-]{6,}/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|fa|fish|key)[_-][A-Za-z0-9_-]{8,}\b/gi, "[REDACTED]");
}

function getAllowedOrigins(env) {
  const raw = String(
    (env && env.ALLOWED_ORIGINS) ||
      "capacitor://localhost,ionic://localhost,http://localhost,https://localhost,http://127.0.0.1:3000,http://localhost:3000"
  );
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  );
}

function getCorsHeaders(origin, allowedOrigins) {
  const cleanOrigin = String(origin || "").trim().replace(/\/+$/, "");
  if (!cleanOrigin || !allowedOrigins.has(cleanOrigin)) return {};
  return {
    "Access-Control-Allow-Origin": cleanOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Fish-Proxy-Token, X-Fish-Session, X-Requested-With",
    "Access-Control-Expose-Headers": "X-TTS-Provider, X-TTS-Format, Retry-After",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}

function jsonResponse(data, status, corsHeaders, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders,
      ...(extraHeaders || {})
    }
  });
}

function bytesToBase64Url(uint8) {
  let bin = "";
  for (let i = 0; i < uint8.length; i++) {
    bin += String.fromCharCode(uint8[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64u) {
  const clean = String(b64u || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = clean.length % 4 === 0 ? "" : "=".repeat(4 - (clean.length % 4));
  const bin = atob(clean + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

async function sha256Base64Url(input) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(String(input || "")));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function deriveAesKey(secret) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest("SHA-256", enc.encode("wanwan-byok-v1:" + String(secret)));
  return crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function sealByokSessionToken(apiKey, secret, origin, ttlSec) {
  const aesKey = await deriveAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const now = Date.now();
  const originHash = origin ? await sha256Base64Url(origin) : "";
  const payload = JSON.stringify({
    v: 1,
    k: apiKey,
    iat: now,
    exp: now + ttlSec * 1000,
    o: originHash
  });
  const encoded = new TextEncoder().encode(payload);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);
  return "v1." + bytesToBase64Url(iv) + "." + bytesToBase64Url(new Uint8Array(cipherBuf));
}

async function unsealByokSessionToken(token, secret, currentOrigin) {
  const raw = String(token || "").trim();
  if (!raw || raw.length > 2048) return { ok: false, reason: "missing" };
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return { ok: false, reason: "malformed" };

  try {
    const iv = base64UrlToBytes(parts[1]);
    const cipherBytes = base64UrlToBytes(parts[2]);
    if (iv.length !== 12 || cipherBytes.length < 16) return { ok: false, reason: "malformed" };
    const aesKey = await deriveAesKey(secret);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, cipherBytes);
    const parsed = JSON.parse(new TextDecoder().decode(plainBuf));
    if (!parsed || parsed.v !== 1 || !parsed.k || !parsed.exp) {
      return { ok: false, reason: "invalid_payload" };
    }
    if (Number(parsed.exp) <= Date.now()) {
      return { ok: false, reason: "expired" };
    }
    if (parsed.o) {
      const currentOriginHash = currentOrigin ? await sha256Base64Url(currentOrigin) : "";
      if (!currentOriginHash || parsed.o !== currentOriginHash) {
        return { ok: false, reason: "origin_mismatch" };
      }
    }
    return { ok: true, apiKey: String(parsed.k), expiresAt: Number(parsed.exp) };
  } catch {
    return { ok: false, reason: "decrypt_failed" };
  }
}

async function constantTimeEqual(a, b) {
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(a || ""))),
    crypto.subtle.digest("SHA-256", enc.encode(String(b || "")))
  ]);
  const viewA = new Uint8Array(hashA);
  const viewB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0 && Boolean(a) && Boolean(b);
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of String(cookieHeader).split(";")) {
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

function getClientIp(request) {
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp) return cfIp.trim();
  const xff = request.headers.get("X-Forwarded-For");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

function parseBoundedInt(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function checkRateLimit(request, env, bucketName, defaultLimit) {
  const envVarName = bucketName === "session" ? "SESSION_RATE_PER_MIN" : "RATE_LIMIT_PER_MIN";
  const limit = parseBoundedInt(env && env[envVarName], defaultLimit, 1, 120);
  const ip = getClientIp(request);

  // 若用户在 Cloudflare 绑定了官方原生 Rate Limiting Binding（推荐生产环境使用）
  try {
    if (env && env.FISH_RATE_LIMITER && typeof env.FISH_RATE_LIMITER.limit === "function") {
      const outcome = await env.FISH_RATE_LIMITER.limit({ key: bucketName + ":" + ip });
      if (outcome && outcome.success === false) {
        return { allowed: false, retryAfter: 60 };
      }
    }
  } catch {
    // 忽略绑定调用异常并继续执行兜底限流
  }

  const now = Date.now();
  const windowSec = 60;
  const windowId = Math.floor(now / (windowSec * 1000));
  const retryAfter = Math.max(1, windowSec - Math.floor((now % (windowSec * 1000)) / 1000));
  const memKey = bucketName + ":" + ip;

  const cutoff = now - windowSec * 1000;
  const recent = (memoryRateMap.get(memKey) || []).filter((ts) => ts > cutoff);
  if (recent.length >= limit) {
    memoryRateMap.set(memKey, recent);
    return { allowed: false, retryAfter };
  }
  recent.push(now);
  memoryRateMap.set(memKey, recent);
  if (memoryRateMap.size > 2000) {
    for (const [k, arr] of memoryRateMap.entries()) {
      if (!arr.length || arr[arr.length - 1] <= cutoff) memoryRateMap.delete(k);
    }
  }

  // Edge Cache API 兜底计数（仅单 PoP 内跨隔离生效；Quick Edit 预览不可用时跳过）
  try {
    if (typeof caches !== "undefined" && caches.default) {
      const cacheKey = new Request(
        "https://rate-limit.internal/" +
          encodeURIComponent(bucketName) +
          "/" +
          encodeURIComponent(ip) +
          "/" +
          windowId
      );
      const cached = await caches.default.match(cacheKey);
      let count = 0;
      if (cached) {
        const parsed = await cached.json().catch(() => null);
        count = Number(parsed && parsed.count) || 0;
      }
      if (count >= limit) {
        return { allowed: false, retryAfter };
      }
      await caches.default.put(
        cacheKey,
        new Response(JSON.stringify({ count: count + 1 }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=" + windowSec
          }
        })
      );
    }
  } catch {
    // 忽略预览环境 Cache API 不可写
  }

  return { allowed: true, retryAfter: 0 };
}

function tryAcquireConcurrency(ip, env) {
  const maxPerIp = parseBoundedInt(env && env.MAX_CONCURRENT_PER_IP, DEFAULT_MAX_CONCURRENT_PER_IP, 1, 20);
  const maxGlobal = parseBoundedInt(env && env.MAX_CONCURRENT_GLOBAL, DEFAULT_MAX_CONCURRENT_GLOBAL, 1, 200);
  const currentIp = memoryInflightByIp.get(ip) || 0;
  if (memoryInflightGlobal >= maxGlobal || currentIp >= maxPerIp) {
    return false;
  }
  memoryInflightGlobal += 1;
  memoryInflightByIp.set(ip, currentIp + 1);
  return true;
}

function releaseConcurrency(ip) {
  memoryInflightGlobal = Math.max(0, memoryInflightGlobal - 1);
  const currentIp = memoryInflightByIp.get(ip) || 0;
  if (currentIp <= 1) memoryInflightByIp.delete(ip);
  else memoryInflightByIp.set(ip, currentIp - 1);
}

function getMimeForFormat(format) {
  if (format === "wav") return "audio/wav";
  if (format === "opus") return "audio/ogg; codecs=opus";
  if (format === "pcm") return "audio/pcm";
  return "audio/mpeg";
}

function mapUpstreamErrorCode(status) {
  if (status === 400 || status === 422) return "bad_request";
  if (status === 401) return "upstream_auth_401";
  if (status === 403) return "upstream_forbidden_403";
  if (status === 429) return "upstream_rate_limit_429";
  if (status >= 500) return "upstream_server_5xx";
  return "upstream_error";
}

function extractSessionToken(request) {
  const fromHeader = String(request.headers.get("X-Fish-Session") || "").trim();
  if (fromHeader) return fromHeader;
  const cookies = parseCookies(request.headers.get("Cookie"));
  return String(cookies[SESSION_COOKIE_NAME] || "").trim();
}

function buildSessionSetCookie(token, maxAgeSec, isHttps) {
  const secureFlag = isHttps ? "; Secure; SameSite=None" : "; SameSite=Lax";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly${secureFlag}; Path=/; Max-Age=${maxAgeSec}`;
}

export default {
  async fetch(request, env) {
    let cors = {};
    const clientIp = getClientIp(request);
    let acquiredConcurrency = false;

    try {
      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      const origin = String(request.headers.get("Origin") || "").trim().replace(/\/+$/, "");
      const allowedOrigins = getAllowedOrigins(env);
      cors = getCorsHeaders(origin, allowedOrigins);

      // 1. 来源 Origin 校验（仅辅助浏览器隔离，不能替代后端真实鉴权与限流）
      if (origin && !cors["Access-Control-Allow-Origin"]) {
        return jsonResponse(
          {
            error: "origin_not_allowed",
            message: "未授权来源 Origin，请在 Worker ALLOWED_ORIGINS 变量中配置当前站点域名"
          },
          403,
          { Vary: "Origin" }
        );
      }

      // 2. CORS 预检响应
      if (request.method === "OPTIONS") {
        if (!origin) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: cors });
      }

      // 3. 限制无 Origin 的脚本直接 POST 探测（除非显式设置 ALLOW_NO_ORIGIN=true）
      if (
        request.method !== "GET" &&
        !origin &&
        String((env && env.ALLOW_NO_ORIGIN) || "").toLowerCase() !== "true"
      ) {
        return jsonResponse(
          { error: "origin_required", message: "缺少浏览器 Origin 头，已拒绝直接调用" },
          403,
          cors
        );
      }

      // 4. 若服务端配置了可选额外访问令牌，则校验（公开 GitHub Pages 多用户部署时不应硬编码此口令到前端）
      const optionalProxyToken = String((env && env.FISH_PROXY_ACCESS_TOKEN) || "").trim();
      if (optionalProxyToken) {
        const providedToken = String(request.headers.get("X-Fish-Proxy-Token") || "").trim();
        const okToken = await constantTimeEqual(providedToken, optionalProxyToken);
        if (!okToken) {
          return jsonResponse(
            { error: "proxy_unauthorized", message: "代理访问令牌无效或缺失（HTTP 401）" },
            401,
            cors
          );
        }
      }

      const sessionSecret = String((env && env.BYOK_SESSION_SECRET) || "").trim();
      const ttlSec = parseBoundedInt(env && env.SESSION_TTL_SEC, DEFAULT_SESSION_TTL_SEC, 300, 14400);
      const isHttps = url.protocol === "https:";

      // 5. 状态探测接口（GET /api/tts/fish/status 或 /status）
      if ((pathname === "/api/tts/fish/status" || pathname === "/status") && request.method === "GET") {
        const statusLimit = await checkRateLimit(request, env, "status", 30);
        if (!statusLimit.allowed) {
          return jsonResponse(
            { error: "rate_limited", message: "状态检查过于频繁，请稍后重试" },
            429,
            cors,
            { "Retry-After": String(statusLimit.retryAfter) }
          );
        }

        let hasByokSession = false;
        if (sessionSecret) {
          const rawSid = extractSessionToken(request);
          if (rawSid) {
            const unsealed = await unsealByokSessionToken(rawSid, sessionSecret, origin);
            hasByokSession = Boolean(unsealed.ok);
          }
        }

        return jsonResponse(
          {
            ok: true,
            mode: "byok_only",
            serverKeyConfigured: false,
            sessionSecretConfigured: Boolean(sessionSecret),
            requiresAccessToken: Boolean(optionalProxyToken),
            byokSessionAllowed: true,
            hasByokSession,
            sessionTtlSec: ttlSec,
            defaultModel: DEFAULT_MODEL,
            models: Array.from(ALLOWED_MODELS),
            formats: Array.from(ALLOWED_FORMATS),
            maxTextLength: MAX_TEXT_LENGTH
          },
          200,
          cors
        );
      }

      // 6. 签发/注销 BYOK 短期加密会话（/api/tts/fish/session 或 /session）
      if (pathname === "/api/tts/fish/session" || pathname === "/session") {
        if (request.method === "DELETE") {
          return jsonResponse(
            { ok: true },
            200,
            cors,
            { "Set-Cookie": buildSessionSetCookie("", 0, isHttps) }
          );
        }

        if (request.method !== "POST") {
          return jsonResponse({ error: "method_not_allowed", message: "仅支持 POST / DELETE" }, 405, cors);
        }

        if (!sessionSecret || sessionSecret.length < 16) {
          return jsonResponse(
            {
              error: "session_secret_missing",
              message: "Worker 尚未配置有效 BYOK_SESSION_SECRET Secret（至少 16 位），无法签发加密会话"
            },
            503,
            cors
          );
        }

        const sessLimit = await checkRateLimit(request, env, "session", DEFAULT_SESSION_RATE_PER_MIN);
        if (!sessLimit.allowed) {
          return jsonResponse(
            { error: "rate_limited", message: "会话签发过于频繁，请稍后再试" },
            429,
            cors,
            { "Retry-After": String(sessLimit.retryAfter) }
          );
        }

        let sessRaw = "";
        try {
          sessRaw = await request.text();
        } catch {
          return jsonResponse({ error: "invalid_body", message: "无法读取请求体" }, 400, cors);
        }
        if (new TextEncoder().encode(sessRaw).length > 4096) {
          return jsonResponse({ error: "payload_too_large", message: "请求体过大" }, 413, cors);
        }

        let sessBody;
        try {
          sessBody = JSON.parse(sessRaw || "{}");
        } catch {
          return jsonResponse({ error: "invalid_body", message: "请求体不是有效 JSON" }, 400, cors);
        }

        const userApiKey = String((sessBody && sessBody.apiKey) || "").trim();
        if (!userApiKey || userApiKey.length < 8 || userApiKey.length > 512 || /[\r\n\s]/.test(userApiKey)) {
          return jsonResponse(
            { error: "invalid_api_key_format", message: "Fish Audio API Key 格式无效" },
            400,
            cors
          );
        }

        const sealedToken = await sealByokSessionToken(userApiKey, sessionSecret, origin, ttlSec);
        return jsonResponse(
          {
            ok: true,
            sessionToken: sealedToken,
            expiresInSec: ttlSec
          },
          200,
          cors,
          { "Set-Cookie": buildSessionSetCookie(sealedToken, ttlSec, isHttps) }
        );
      }

      // 7. 语音合成接口（POST /api/tts/fish 或 /）
      if ((pathname !== "/api/tts/fish" && pathname !== "/") || request.method !== "POST") {
        return jsonResponse({ error: "not_found", message: "未找到对应代理接口" }, 404, cors);
      }

      if (!sessionSecret || sessionSecret.length < 16) {
        return jsonResponse(
          {
            error: "session_secret_missing",
            message: "Worker 尚未配置 BYOK_SESSION_SECRET Secret，无法解析用户会话密钥"
          },
          503,
          cors
        );
      }

      // 8. 并发限制 & 频率限制
      if (!tryAcquireConcurrency(clientIp, env)) {
        return jsonResponse(
          { error: "too_many_concurrent_requests", message: "当前并发合成请求过多，请稍后重试" },
          429,
          cors,
          { "Retry-After": "3" }
        );
      }
      acquiredConcurrency = true;

      const ttsLimit = await checkRateLimit(request, env, "tts", DEFAULT_TTS_RATE_PER_MIN);
      if (!ttsLimit.allowed) {
        return jsonResponse(
          { error: "rate_limited", message: "语音请求过于频繁，请稍后再试（HTTP 429）" },
          429,
          cors,
          { "Retry-After": String(ttsLimit.retryAfter) }
        );
      }

      // 9. 解析 BYOK 短期加密会话（绝不回退到任何开发者默认 Key）
      const rawSessionToken = extractSessionToken(request);
      if (!rawSessionToken) {
        return jsonResponse(
          { error: "session_required", message: "请先配置个人 Fish Audio API Key 并建立短期会话" },
          401,
          cors
        );
      }

      const unsealed = await unsealByokSessionToken(rawSessionToken, sessionSecret, origin);
      if (!unsealed.ok) {
        return jsonResponse(
          {
            error: "session_required",
            message:
              unsealed.reason === "expired"
                ? "Fish Audio 短期会话已过期，正在或请重新建立会话（HTTP 401）"
                : "Fish Audio 短期会话无效或来源不匹配，请重新连接（HTTP 401）"
          },
          401,
          cors
        );
      }
      const userFishKey = unsealed.apiKey;
      const sensitiveSecrets = [userFishKey, rawSessionToken, sessionSecret, optionalProxyToken];

      // 10. 请求体大小与 SSRF / 参数校验
      const contentLength = Number(request.headers.get("Content-Length") || 0);
      if (contentLength > MAX_BODY_BYTES) {
        return jsonResponse({ error: "payload_too_large", message: "请求体过大" }, 413, cors);
      }

      let rawBodyText = "";
      try {
        rawBodyText = await request.text();
      } catch {
        return jsonResponse({ error: "invalid_body", message: "无法读取请求体" }, 400, cors);
      }
      if (new TextEncoder().encode(rawBodyText).length > MAX_BODY_BYTES) {
        return jsonResponse({ error: "payload_too_large", message: "请求体超过大小限制" }, 413, cors);
      }

      let body;
      try {
        body = JSON.parse(rawBodyText || "{}");
      } catch {
        return jsonResponse({ error: "invalid_body", message: "请求体不是有效 JSON" }, 400, cors);
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return jsonResponse({ error: "invalid_body", message: "请求体格式无效" }, 400, cors);
      }

      for (const k of ["url", "endpoint", "targetUrl", "upstream", "upstreamUrl", "host", "baseUrl"]) {
        if (k in body) {
          return jsonResponse({ error: "ssrf_rejected", message: "禁止传入自定义上游地址" }, 400, cors);
        }
      }

      const text = String(body.text || "").trim();
      const referenceId = String(body.reference_id || "").trim();
      const model = String(body.model || DEFAULT_MODEL).trim();
      const format = String(body.format || "mp3").trim().toLowerCase();

      if (!text || text.length > MAX_TEXT_LENGTH) {
        return jsonResponse(
          { error: "invalid_text", message: `文本为空或超过 ${MAX_TEXT_LENGTH} 字符上限` },
          400,
          cors
        );
      }
      if (!REF_ID_RE.test(referenceId)) {
        return jsonResponse({ error: "invalid_reference_id", message: "Fish Audio Reference ID 格式无效" }, 400, cors);
      }
      if (!ALLOWED_MODELS.has(model) || !ALLOWED_FORMATS.has(format)) {
        return jsonResponse({ error: "invalid_params", message: "不支持的模型或音频格式" }, 400, cors);
      }

      const upstreamPayload = {
        text,
        reference_id: referenceId,
        format,
        normalize: body.normalize !== false
      };

      if (body.prosody && typeof body.prosody === "object" && !Array.isArray(body.prosody)) {
        const cleanProsody = {};
        if (body.prosody.speed !== undefined) {
          const speed = Number(body.prosody.speed);
          if (Number.isFinite(speed)) cleanProsody.speed = Math.max(0.5, Math.min(2.0, speed));
        }
        if (body.prosody.volume !== undefined) {
          const volume = Number(body.prosody.volume);
          if (Number.isFinite(volume)) cleanProsody.volume = Math.max(-20, Math.min(20, volume));
        }
        if (Object.keys(cleanProsody).length > 0) upstreamPayload.prosody = cleanProsody;
      }

      // 11. 仅向固定官方地址 https://api.fish.audio/v1/tts 发起请求（通过 model 请求头指定 s2.1-pro-free 等模型）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
      let upstreamRes;
      try {
        upstreamRes = await fetch(FISH_UPSTREAM, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + userFishKey,
            model
          },
          body: JSON.stringify(upstreamPayload),
          signal: controller.signal
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr && fetchErr.name === "AbortError") {
          return jsonResponse({ error: "upstream_timeout", message: "Fish Audio 上游合成超时（HTTP 504）" }, 504, cors);
        }
        return jsonResponse(
          { error: "upstream_network_error", message: redact("无法连接 Fish Audio 上游服务", sensitiveSecrets) },
          502,
          cors
        );
      }
      clearTimeout(timeoutId);

      if (!upstreamRes.ok) {
        const rawText = await upstreamRes.text().catch(() => "");
        let detail = rawText;
        try {
          const parsedErr = JSON.parse(rawText);
          detail = String(
            parsedErr.message ||
              parsedErr.reason ||
              parsedErr.detail ||
              (parsedErr.error && typeof parsedErr.error === "object" ? parsedErr.error.message : "") ||
              rawText
          );
        } catch {
          // 保留纯文本并脱敏
        }
        const safeDetail = redact(detail, sensitiveSecrets).slice(0, 260);
        return jsonResponse(
          {
            error: mapUpstreamErrorCode(upstreamRes.status),
            upstreamStatus: upstreamRes.status,
            message: safeDetail || `Fish Audio 上游返回错误（HTTP ${upstreamRes.status}）`
          },
          upstreamRes.status,
          cors
        );
      }

      const contentType = String(upstreamRes.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("application/json") || contentType.includes("text/")) {
        return jsonResponse(
          { error: "upstream_invalid_content", message: "Fish Audio 上游返回了非音频内容" },
          502,
          cors
        );
      }

      const audioBuffer = await upstreamRes.arrayBuffer();
      if (!audioBuffer || audioBuffer.byteLength === 0) {
        return jsonResponse({ error: "empty_audio_stream", message: "Fish Audio 返回了空音频流" }, 502, cors);
      }

      return new Response(audioBuffer, {
        status: 200,
        headers: {
          "Content-Type": upstreamRes.headers.get("content-type") || getMimeForFormat(format),
          "Content-Length": String(audioBuffer.byteLength),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-TTS-Provider": "fish_audio",
          "X-TTS-Format": format,
          ...cors
        }
      });
    } catch {
      return jsonResponse({ error: "internal_proxy_error", message: "Worker 内部处理异常，请稍后重试" }, 500, cors);
    } finally {
      if (acquiredConcurrency) {
        releaseConcurrency(clientIp);
      }
    }
  }
};
