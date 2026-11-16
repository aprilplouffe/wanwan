import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../server.ts";

let passed = 0;
let failed = 0;

function check(cond, label) {
  if (cond) {
    passed++;
    console.log("  [PASS]", label);
  } else {
    failed++;
    console.error("  [FAIL]", label);
  }
}

async function main() {
  console.log("=== Fish Audio 正式后端代理实测 (Express real HTTP) ===");

  // 配置测试限流与访问口令（仅测试态临时环境变量，不硬编码真实 API Key）
  process.env.FISH_PROXY_ACCESS_TOKEN = "proxy_guard_tok_123";
  process.env.FISH_PROXY_RATE_LIMIT_MAX = "6";
  delete process.env.FISH_AUDIO_API_KEY;

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. OPTIONS CORS 预检（允许本地源 & Capacitor 源，拒绝未授权第三方源）
    const optAllowed = await fetch(`${baseUrl}/api/tts/fish`, {
      method: "OPTIONS",
      headers: {
        Origin: "capacitor://localhost",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-fish-proxy-token"
      }
    });
    check(
      optAllowed.status === 204 &&
      optAllowed.headers.get("access-control-allow-origin") === "capacitor://localhost" &&
      String(optAllowed.headers.get("access-control-allow-headers")).toLowerCase().includes("x-fish-proxy-token"),
      "OPTIONS 预检对 Capacitor / 白名单 Origin 放行并返回完整 CORS 头"
    );

    const optDenied = await fetch(`${baseUrl}/api/tts/fish`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil-attacker.example.com" }
    });
    check(
      optDenied.status === 403 && !optDenied.headers.get("access-control-allow-origin"),
      "未授权跨站 Origin 的 OPTIONS 预检被代理明确拦截（HTTP 403）"
    );

    // 2. 代理访问令牌鉴权保护（防止匿名外部滥用）
    const noTokenRes = await fetch(`${baseUrl}/api/tts/fish/status`);
    check(noTokenRes.status === 401, "未携带 X-Fish-Proxy-Token 时拦截访问（HTTP 401）");

    const statusRes = await fetch(`${baseUrl}/api/tts/fish/status`, {
      headers: { "X-Fish-Proxy-Token": "proxy_guard_tok_123" }
    });
    const statusJson = await statusRes.json();
    check(
      statusRes.status === 200 &&
      statusJson.ok === true &&
      statusJson.serverKeyConfigured === false &&
      statusJson.requiresAccessToken === true &&
      !JSON.stringify(statusJson).includes("proxy_guard_tok_123"),
      "/api/tts/fish/status 正常返回非敏感状态且永不泄露密钥或令牌"
    );

    // 3. 防开放 SSRF 校验
    const ssrfRes = await fetch(`${baseUrl}/api/tts/fish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fish-Proxy-Token": "proxy_guard_tok_123"
      },
      body: JSON.stringify({
        url: "http://169.254.169.254/latest/meta-data",
        text: "hello",
        reference_id: "ref_1234"
      })
    });
    const ssrfJson = await ssrfRes.json();
    check(ssrfRes.status === 400 && ssrfJson.error === "ssrf_rejected", "传入任意目标 URL 时被代理防 SSRF 规则拒绝（HTTP 400）");

    // 4. 文本长度限制 & 无效模型 / Reference ID 校验
    const longTextRes = await fetch(`${baseUrl}/api/tts/fish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fish-Proxy-Token": "proxy_guard_tok_123"
      },
      body: JSON.stringify({
        text: "a".repeat(1200),
        reference_id: "ref_1234",
        model: "s2.1-pro",
        format: "mp3"
      })
    });
    check(longTextRes.status === 400, "超长文本被代理长度校验拦截（HTTP 400）");

    // 5. 未配置服务端 key 且未建会话时返回 503 proxy_key_missing
    const noKeyRes = await fetch(`${baseUrl}/api/tts/fish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fish-Proxy-Token": "proxy_guard_tok_123"
      },
      body: JSON.stringify({
        text: "hello",
        reference_id: "ref_1234",
        model: "s2.1-pro",
        format: "mp3"
      })
    });
    const noKeyJson = await noKeyRes.json();
    check(noKeyRes.status === 503 && noKeyJson.error === "proxy_key_missing", "无服务端密钥且无会话时准确返回 503 proxy_key_missing");

    // 6. 注册临时 BYOK 加密会话 + 真实请求 api.fish.audio/v1/tts 验证上游 401 透传及密钥脱敏
    const sessRes = await fetch(`${baseUrl}/api/tts/fish/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fish-Proxy-Token": "proxy_guard_tok_123"
      },
      body: JSON.stringify({ apiKey: "invalid_probe_secret_98765" })
    });
    const sessJson = await sessRes.json();
    check(
      sessRes.status === 200 &&
      Boolean(sessJson.sessionToken) &&
      String(sessRes.headers.get("set-cookie") || "").includes("HttpOnly") &&
      !JSON.stringify(sessJson).includes("invalid_probe_secret_98765"),
      "BYOK 会话交换签发 HttpOnly Cookie + 不透明会话令牌，不回显原始 API Key"
    );

    const liveUpstreamProbeRes = await fetch(`${baseUrl}/api/tts/fish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fish-Proxy-Token": "proxy_guard_tok_123",
        "X-Fish-Session": sessJson.sessionToken
      },
      body: JSON.stringify({
        text: "hello world",
        reference_id: "7f92f8afb8ec43bf81429cc1c9199cb1",
        model: "s2.1-pro",
        format: "mp3"
      })
    });
    const liveProbeJson = await liveUpstreamProbeRes.json();
    check(
      liveUpstreamProbeRes.status === 401 &&
      liveProbeJson.error === "upstream_auth_401" &&
      !JSON.stringify(liveProbeJson).includes("invalid_probe_secret_98765"),
      "代理真实向 https://api.fish.audio/v1/tts 发起 POST 并透传 401 鉴权失败（无任何 CORS 阻塞且密钥严格脱敏）"
    );

    // 7. 限流防刷校验（第 7 次触发 HTTP 429 + Retry-After）
    let hit429 = false;
    let hasRetryAfter = false;
    for (let i = 0; i < 6; i++) {
      const r = await fetch(`${baseUrl}/api/tts/fish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Fish-Proxy-Token": "proxy_guard_tok_123"
        },
        body: JSON.stringify({ text: "ping", reference_id: "ref_1234", model: "s2.1-pro", format: "mp3" })
      });
      if (r.status === 429) {
        hit429 = true;
        hasRetryAfter = Boolean(r.headers.get("retry-after"));
        break;
      }
    }
    check(hit429 && hasRetryAfter, "高频请求触发代理限流保护（HTTP 429 + Retry-After）");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\n=== 代理实测结果：通过 ${passed} 项，失败 ${failed} 项 ===`);
  assert.equal(failed, 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
