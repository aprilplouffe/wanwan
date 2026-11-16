/**
 * Standalone Cloudflare Worker proxy for Fish Audio TTS (/api/tts/fish).
 * Ideal for static hosting or Capacitor Android APK builds where no Node backend runs alongside the client.
 *
 * Required Worker Secrets:
 *   - FISH_AUDIO_API_KEY (Fish Audio secret API key)
 *   - FISH_PROXY_ACCESS_TOKEN (optional shared proxy token sent via X-Fish-Proxy-Token)
 * Optional Worker Env Vars:
 *   - ALLOWED_ORIGINS (comma-separated, e.g. "https://your-site.pages.dev,capacitor://localhost,http://localhost")
 */

const FISH_UPSTREAM = "https://api.fish.audio/v1/tts";
const ALLOWED_MODELS = new Set(["s2.1-pro", "s2.1-pro-free", "drama-3", "s2-pro"]);
const ALLOWED_FORMATS = new Set(["mp3", "wav", "opus", "pcm"]);
const MAX_TEXT_LENGTH = 1000;
const REF_ID_RE = /^[a-zA-Z0-9_-]{3,128}$/;

function redact(text, secret) {
  let out = String(text || "");
  if (secret && secret.length >= 4) out = out.split(secret).join("[REDACTED]");
  return out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, "Bearer [REDACTED]");
}

function getCorsHeaders(origin, env) {
  const allowed = new Set(
    String(env.ALLOWED_ORIGINS || "capacitor://localhost,ionic://localhost,http://localhost,https://localhost")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  if (!origin || !allowed.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Fish-Proxy-Token",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = getCorsHeaders(origin, env);

    if (origin && !cors["Access-Control-Allow-Origin"]) {
      return new Response(JSON.stringify({ error: "origin_not_allowed", message: "未授权来源 Origin" }), {
        status: 403,
        headers: { "Content-Type": "application/json", Vary: "Origin" }
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/api/tts/fish/status" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          ok: true,
          serverKeyConfigured: Boolean(env.FISH_AUDIO_API_KEY),
          requiresAccessToken: Boolean(env.FISH_PROXY_ACCESS_TOKEN),
          byokSessionAllowed: false,
          models: Array.from(ALLOWED_MODELS),
          formats: Array.from(ALLOWED_FORMATS),
          maxTextLength: MAX_TEXT_LENGTH
        }),
        { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors } }
      );
    }

    if (url.pathname !== "/api/tts/fish" || request.method !== "POST") {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...cors }
      });
    }

    if (env.FISH_PROXY_ACCESS_TOKEN) {
      const token = request.headers.get("X-Fish-Proxy-Token") || "";
      if (token !== env.FISH_PROXY_ACCESS_TOKEN) {
        return new Response(JSON.stringify({ error: "proxy_unauthorized", message: "代理访问令牌无效" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...cors }
        });
      }
    }

    if (!env.FISH_AUDIO_API_KEY) {
      return new Response(JSON.stringify({ error: "proxy_key_missing", message: "Worker 未配置 FISH_AUDIO_API_KEY Secret" }), {
        status: 503,
        headers: { "Content-Type": "application/json", ...cors }
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid_body", message: "无效 JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors }
      });
    }

    for (const k of ["url", "endpoint", "targetUrl", "upstream", "host", "baseUrl"]) {
      if (k in (body || {})) {
        return new Response(JSON.stringify({ error: "ssrf_rejected", message: "禁止传入上游地址" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...cors }
        });
      }
    }

    const text = String(body.text || "").trim();
    const referenceId = String(body.reference_id || "").trim();
    const model = String(body.model || "s2.1-pro").trim();
    const format = String(body.format || "mp3").trim().toLowerCase();

    if (!text || text.length > MAX_TEXT_LENGTH) {
      return new Response(JSON.stringify({ error: "invalid_text", message: "文本为空或超过长度上限" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors }
      });
    }
    if (!REF_ID_RE.test(referenceId)) {
      return new Response(JSON.stringify({ error: "invalid_reference_id", message: "Reference ID 无效" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors }
      });
    }
    if (!ALLOWED_MODELS.has(model) || !ALLOWED_FORMATS.has(format)) {
      return new Response(JSON.stringify({ error: "invalid_params", message: "模型或音频格式不受支持" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors }
      });
    }

    const upstreamRes = await fetch(FISH_UPSTREAM, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.FISH_AUDIO_API_KEY}`,
        model
      },
      body: JSON.stringify({
        text,
        reference_id: referenceId,
        format,
        normalize: body.normalize !== false,
        ...(body.prosody ? { prosody: body.prosody } : {})
      }),
      signal: AbortSignal.timeout(25000)
    });

    if (!upstreamRes.ok) {
      const rawErr = redact(await upstreamRes.text().catch(() => ""), env.FISH_AUDIO_API_KEY);
      return new Response(
        JSON.stringify({ error: "upstream_error", upstreamStatus: upstreamRes.status, message: rawErr.slice(0, 260) }),
        { status: upstreamRes.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors } }
      );
    }

    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        "Content-Type": upstreamRes.headers.get("content-type") || "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...cors
      }
    });
  }
};
