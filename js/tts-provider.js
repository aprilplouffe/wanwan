// js/tts-provider.js — 统一底层 TTS Provider 引擎（Minimax + Fish Audio 正式代理）
// 仅负责全局配置读取、代理凭据会话交换、错误分类与脱敏分发；业务音色与角色绑定严格由微信 / 心动直播各自独立管理。
(function(global) {
  'use strict';

  var PROVIDERS = {
    MINIMAX: 'minimax',
    FISH_AUDIO: 'fish_audio'
  };

  var FISH_AUTH_MODES = {
    SERVER_MANAGED: 'server_managed',
    BYOK_SESSION: 'byok_session'
  };

  var MINIMAX_MODELS = [
    'speech-2.8-hd',
    'speech-2.8-turbo',
    'speech-2.6-hd',
    'speech-2.6-turbo',
    'speech-02-hd',
    'speech-02-turbo'
  ];

  var DEFAULT_FISH_PROXY_PATH = '/api/tts/fish';
  // 若部署在 GitHub Pages 且希望所有用户免填高级代理地址，可在此填入已部署的 Worker 地址：
  // 例如：'https://wanwan-fish-tts.<你的子域名>.workers.dev/api/tts/fish'
  var DEFAULT_PUBLIC_FISH_PROXY_URL = '';
  var FISH_AUDIO_UPSTREAM_HOST = 'api.fish.audio';
  var DEFAULT_FISH_MODEL = 's2.1-pro-free';
  var FISH_AUDIO_MODELS = [
    's2.1-pro-free',
    's2.1-pro',
    'drama-3',
    's2-pro'
  ];
  var FISH_AUDIO_FORMATS = ['mp3', 'wav', 'opus', 'pcm'];
  var DEFAULT_TIMEOUT_MS = 28000;

  // 内存临时会话缓存（不暴露原始 API Key）
  var _memorySessionCache = {
    endpoint: '',
    sessionToken: '',
    expiresAt: 0
  };

  function redactSecrets(text, extraSecrets) {
    var out = String(text == null ? '' : text);
    if (Array.isArray(extraSecrets)) {
      for (var i = 0; i < extraSecrets.length; i++) {
        var s = String(extraSecrets[i] || '').trim();
        if (s && s.length >= 4) {
          out = out.split(s).join('[已隐藏密钥]');
        }
      }
    }
    out = out.replace(/Bearer\s+[A-Za-z0-9._~+\/=-]{6,}/gi, 'Bearer [已隐藏]');
    out = out.replace(/\b(?:sk|fa|fish|key)[_-][A-Za-z0-9_-]{8,}\b/gi, '[已隐藏密钥]');
    return out;
  }

  function makeTtsError(code, message, extra) {
    var err = new Error(redactSecrets(message || '语音服务错误'));
    err.code = code || 'tts_error';
    err.provider = (extra && extra.provider) || PROVIDERS.FISH_AUDIO;
    if (extra && extra.httpStatus != null) err.httpStatus = extra.httpStatus;
    if (extra && extra.retryable != null) err.retryable = Boolean(extra.retryable);
    return err;
  }

  function normalizeProvider(val, allowDefault) {
    var raw = String(val || '').trim().toLowerCase();
    if (allowDefault && (!raw || raw === 'default')) return 'default';
    if (raw === 'fish' || raw === 'fishaudio' || raw === 'fish_audio' || raw === 'fish-audio') {
      return PROVIDERS.FISH_AUDIO;
    }
    if (raw === 'minimax') return PROVIDERS.MINIMAX;
    return allowDefault ? 'default' : PROVIDERS.MINIMAX;
  }

  function getProviderLabel(provider) {
    return normalizeProvider(provider) === PROVIDERS.FISH_AUDIO ? 'Fish Audio' : 'Minimax';
  }

  function getMimeForFormat(fmt) {
    var f = String(fmt || 'mp3').toLowerCase();
    if (f === 'wav') return 'audio/wav';
    if (f === 'opus') return 'audio/ogg; codecs=opus';
    if (f === 'pcm') return 'audio/wav';
    return 'audio/mpeg';
  }

  function bytesToBase64(uint8) {
    var bin = '';
    for (var i = 0; i < uint8.length; i++) {
      bin += String.fromCharCode(uint8[i]);
    }
    if (typeof global.btoa === 'function') return global.btoa(bin);
    if (typeof Buffer !== 'undefined') return Buffer.from(uint8).toString('base64');
    return '';
  }

  function base64ToBytes(b64) {
    var bin = '';
    if (typeof global.atob === 'function') {
      bin = global.atob(b64);
    } else if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function readConfigKey(key) {
    if (!global.db || !global.db.config) return undefined;
    try {
      var op = function() { return global.db.config.get(key); };
      var row = typeof global.runWanWanDBRead === 'function'
        ? await global.runWanWanDBRead(op)
        : await op();
      return row ? row.value : undefined;
    } catch (_) {
      return undefined;
    }
  }

  async function writeConfigKey(key, value) {
    if (!global.db || !global.db.config) return;
    await global.db.config.put({ key: key, value: value });
  }

  async function deleteConfigKey(key) {
    if (!global.db || !global.db.config || typeof global.db.config.delete !== 'function') return;
    try {
      await global.db.config.delete(key);
    } catch (_) {}
  }

  // ===== 本地个人密钥加密存储（仅当用户显式开启 BYOK 会话模式时使用 WebCrypto AES-GCM） =====
  async function getOrCreateVaultCryptoKey() {
    var cryptoObj = global.crypto;
    if (!cryptoObj || !cryptoObj.subtle || !cryptoObj.getRandomValues) return null;
    try {
      var existing = await readConfigKey('fishAudioVaultKey');
      if (existing) return existing;
      var generated = await cryptoObj.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      await writeConfigKey('fishAudioVaultKey', generated);
      return generated;
    } catch (_) {
      return null;
    }
  }

  async function saveFishAudioPersonalKey(plainKey) {
    var clean = String(plainKey || '').trim();
    if (!clean) {
      await clearFishAudioPersonalKey();
      return { encrypted: false, cleared: true };
    }
    // 清理代理内存会话以便下次用新密钥重建
    _memorySessionCache = { endpoint: '', sessionToken: '', expiresAt: 0 };
    await deleteConfigKey('fishAudioSessionToken');

    var cryptoObj = global.crypto;
    if (cryptoObj && cryptoObj.subtle && typeof global.TextEncoder !== 'undefined') {
      var keyObj = await getOrCreateVaultCryptoKey();
      if (keyObj) {
        try {
          var iv = cryptoObj.getRandomValues(new Uint8Array(12));
          var encoded = new global.TextEncoder().encode(clean);
          var cipherBuf = await cryptoObj.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            keyObj,
            encoded
          );
          await writeConfigKey('fishAudioApiKeyEnc', {
            v: 1,
            iv: bytesToBase64(iv),
            cipher: bytesToBase64(new Uint8Array(cipherBuf))
          });
          // 移除旧版明文键
          await deleteConfigKey('fishAudioApiKey');
          return { encrypted: true, cleared: false };
        } catch (_) {}
      }
    }
    // 仅在无 WebCrypto 的受限环境兜底，但仍通过 session 交换避免业务请求暴露明文
    await writeConfigKey('fishAudioApiKey', clean);
    return { encrypted: false, cleared: false };
  }

  async function loadDecryptedFishPersonalKey() {
    var encRow = await readConfigKey('fishAudioApiKeyEnc');
    if (encRow && encRow.cipher && encRow.iv && global.crypto && global.crypto.subtle) {
      try {
        var vaultKey = await readConfigKey('fishAudioVaultKey');
        if (vaultKey) {
          var plainBuf = await global.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: base64ToBytes(encRow.iv) },
            vaultKey,
            base64ToBytes(encRow.cipher)
          );
          var decoded = new global.TextDecoder().decode(plainBuf);
          if (decoded) return decoded.trim();
        }
      } catch (_) {}
    }
    var legacy = await readConfigKey('fishAudioApiKey');
    var cleanLegacy = String(legacy || '').trim();
    // 如当前环境支持 WebCrypto，自动把历史明文迁移为 AES-GCM 密文并删除明文键
    if (cleanLegacy && global.crypto && global.crypto.subtle) {
      try {
        await saveFishAudioPersonalKey(cleanLegacy);
      } catch (_) {}
    }
    return cleanLegacy;
  }

  async function hasStoredFishPersonalKey() {
    var encRow = await readConfigKey('fishAudioApiKeyEnc');
    if (encRow && encRow.cipher && encRow.iv) return true;
    var legacy = await readConfigKey('fishAudioApiKey');
    return Boolean(String(legacy || '').trim());
  }

  async function clearFishAudioPersonalKey() {
    _memorySessionCache = { endpoint: '', sessionToken: '', expiresAt: 0 };
    await Promise.all([
      deleteConfigKey('fishAudioApiKey'),
      deleteConfigKey('fishAudioApiKeyEnc'),
      deleteConfigKey('fishAudioSessionToken')
    ]);
  }

  function isCapacitorNativeRuntime() {
    if (global.Capacitor) {
      if (typeof global.Capacitor.isNativePlatform === 'function') {
        try { return Boolean(global.Capacitor.isNativePlatform()); } catch (_) {}
      } else {
        return true;
      }
    }
    var loc = global.location;
    if (loc && loc.protocol) {
      var p = String(loc.protocol).toLowerCase();
      if (p === 'capacitor:' || p === 'ionic:' || p === 'file:') return true;
    }
    return false;
  }

  function isStaticGithubPagesRuntime() {
    var loc = global.location;
    if (!loc || !loc.hostname) return false;
    var host = String(loc.hostname).toLowerCase();
    return host.endsWith('.github.io');
  }

  function resolveFishProxyEndpoint(rawUrl) {
    var trimmed = String(rawUrl || '').trim();
    if (!trimmed) {
      trimmed = String(global.WANWAN_FISH_PROXY_URL || DEFAULT_PUBLIC_FISH_PROXY_URL || '').trim();
    }
    var nativeApp = isCapacitorNativeRuntime();

    if (!trimmed) {
      if (nativeApp) {
        return {
          ok: false,
          code: 'proxy_unconfigured',
          sameOrigin: false,
          url: '',
          message: 'Android / 离线打包环境无法使用相对路径代理，请展开「高级设置」填写 HTTPS 代理地址'
        };
      }
      if (isStaticGithubPagesRuntime()) {
        return {
          ok: false,
          code: 'proxy_unconfigured',
          sameOrigin: false,
          url: '',
          message: 'GitHub Pages 纯静态站点无法使用相对路径 /api/tts/fish，请展开「高级设置」填入您的 Cloudflare Worker 代理地址（https://wanwan-fish-tts.<子域名>.workers.dev/api/tts/fish）'
        };
      }
      return {
        ok: true,
        sameOrigin: true,
        url: DEFAULT_FISH_PROXY_PATH
      };
    }

    if (trimmed.toLowerCase().indexOf(FISH_AUDIO_UPSTREAM_HOST) >= 0) {
      return {
        ok: false,
        code: 'proxy_unconfigured',
        sameOrigin: false,
        url: '',
        message: '不能在浏览器端填写 api.fish.audio 直连地址（Fish Audio 官方网关未开放浏览器 CORS 预检），请填写同源 /api/tts/fish 或已部署的 HTTPS 代理'
      };
    }

    if (trimmed.charAt(0) === '/') {
      if (nativeApp) {
        return {
          ok: false,
          code: 'proxy_unconfigured',
          sameOrigin: false,
          url: '',
          message: 'Android / 离线打包环境不支持相对路径代理，请填写完整的 https:// 代理地址'
        };
      }
      return {
        ok: true,
        sameOrigin: true,
        url: trimmed
      };
    }

    var parsed;
    try {
      parsed = new URL(trimmed);
    } catch (_) {
      return {
        ok: false,
        code: 'proxy_unconfigured',
        sameOrigin: false,
        url: '',
        message: 'Fish Audio 代理地址格式无效，请填写 /api/tts/fish 或合法的 https:// 代理地址'
      };
    }

    var hostname = String(parsed.hostname || '').toLowerCase();
    var isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalHost)) {
      return {
        ok: false,
        code: 'proxy_insecure_url',
        sameOrigin: false,
        url: '',
        message: 'Fish Audio 外部代理地址必须使用 HTTPS 协议以保护语音凭据与音频安全'
      };
    }

    var sameOrigin = false;
    try {
      if (global.location && global.location.origin && parsed.origin === global.location.origin) {
        sameOrigin = true;
      }
    } catch (_) {}

    return {
      ok: true,
      sameOrigin: sameOrigin,
      url: parsed.toString().replace(/\/+$/, '')
    };
  }

  function deriveFishEndpointUrl(proxyUrl, suffix) {
    var base = String(proxyUrl || DEFAULT_FISH_PROXY_PATH).split('?')[0].replace(/\/+$/, '');
    if (base.endsWith('/' + suffix)) return base;
    return base + '/' + suffix;
  }

  async function getMinimaxConfig() {
    var vals = await Promise.all([
      readConfigKey('minimaxVersion'),
      readConfigKey('minimaxGroupId'),
      readConfigKey('minimaxApiKey'),
      readConfigKey('minimaxModel')
    ]);
    return {
      version: vals[0] === 'international' ? 'international' : 'domestic',
      groupId: String(vals[1] || '').trim(),
      apiKey: String(vals[2] || '').trim(),
      model: String(vals[3] || '').trim()
    };
  }

  async function getFishAudioConfig() {
    var vals = await Promise.all([
      readConfigKey('fishAudioAuthMode'),
      readConfigKey('fishAudioProxyUrl'),
      readConfigKey('fishAudioProxyToken'),
      readConfigKey('fishAudioModel'),
      readConfigKey('fishAudioFormat'),
      hasStoredFishPersonalKey()
    ]);
    // 多用户 BYOK 默认启用短期会话模式；仅当用户显式在高级设置选择 server_managed 时切换
    var authMode = vals[0] === FISH_AUTH_MODES.SERVER_MANAGED
      ? FISH_AUTH_MODES.SERVER_MANAGED
      : FISH_AUTH_MODES.BYOK_SESSION;
    var modelRaw = String(vals[3] || '').trim();
    var model = FISH_AUDIO_MODELS.indexOf(modelRaw) >= 0 ? modelRaw : (modelRaw || DEFAULT_FISH_MODEL);
    var fmtRaw = String(vals[4] || '').trim().toLowerCase();
    var format = FISH_AUDIO_FORMATS.indexOf(fmtRaw) >= 0 ? fmtRaw : 'mp3';
    return {
      authMode: authMode,
      proxyUrl: String(vals[1] || '').trim(),
      proxyToken: String(vals[2] || '').trim(),
      model: model,
      format: format,
      hasPersonalKey: Boolean(vals[5])
    };
  }

  async function getGlobalDefaultProvider() {
    var val = await readConfigKey('defaultTtsProvider');
    return normalizeProvider(val, false);
  }

  async function getProviderCredentialStatus(provider) {
    var p = normalizeProvider(provider, false);
    if (p === PROVIDERS.FISH_AUDIO) {
      var fCfg = await getFishAudioConfig();
      var ep = resolveFishProxyEndpoint(fCfg.proxyUrl);
      var ready = Boolean(ep.ok && fCfg.model);
      var missingReason = '';
      if (!ep.ok) {
        ready = false;
        missingReason = ep.message;
      } else if (fCfg.authMode === FISH_AUTH_MODES.BYOK_SESSION && !fCfg.hasPersonalKey) {
        ready = false;
        missingReason = '尚未填写个人 Fish Audio API Key，请前往「设置 -> Fish Audio 语音配置」填写';
      }
      return {
        provider: PROVIDERS.FISH_AUDIO,
        label: 'Fish Audio',
        apiReady: ready,
        authMode: fCfg.authMode,
        proxyEndpoint: ep.ok ? ep.url : '',
        model: fCfg.model,
        format: fCfg.format,
        missingReason: missingReason
      };
    }
    var mCfg = await getMinimaxConfig();
    var mReady = Boolean(mCfg.groupId && mCfg.apiKey && mCfg.model);
    return {
      provider: PROVIDERS.MINIMAX,
      label: 'Minimax',
      apiReady: mReady,
      model: mCfg.model,
      format: 'mp3',
      missingReason: mReady ? '' : 'Minimax 语音 API 未配置（请前往主设置填写 Group ID / API Key / 模型）'
    };
  }

  async function callMinimaxTTS(text, voiceId) {
    var cfg = await getMinimaxConfig();
    if (!cfg.groupId || !cfg.apiKey) {
      throw makeTtsError('config_missing', 'Minimax API 未配置，请在系统设置中填写 Group ID 和 API Key', { provider: PROVIDERS.MINIMAX });
    }
    if (!cfg.model) {
      throw makeTtsError('config_missing', 'Minimax 语音模型未选择，请在系统设置中选择模型', { provider: PROVIDERS.MINIMAX });
    }
    var cleanVoiceId = String(voiceId || '').trim();
    if (!cleanVoiceId) {
      throw makeTtsError('config_missing', 'Minimax Voice ID 未配置', { provider: PROVIDERS.MINIMAX });
    }
    var cleanText = String(text || '').trim();
    if (!cleanText) {
      throw makeTtsError('config_missing', '语音文本不能为空', { provider: PROVIDERS.MINIMAX });
    }
    if (typeof global.fetch !== 'function') {
      throw makeTtsError('network_error', '当前环境不支持网络请求', { provider: PROVIDERS.MINIMAX });
    }

    var host = cfg.version === 'international' ? 'https://api.minimaxi.chat' : 'https://api.minimax.chat';
    var url = host + '/v1/t2a_v2?GroupId=' + encodeURIComponent(cfg.groupId);

    var body = {
      model: cfg.model,
      text: cleanText,
      stream: false,
      voice_setting: {
        voice_id: cleanVoiceId,
        speed: 1.0,
        vol: 1.0,
        pitch: 0
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3'
      }
    };

    var res = await global.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      var detail = '';
      try {
        var errJson = await res.json();
        detail = (errJson && errJson.base_resp && errJson.base_resp.status_msg) ||
          (errJson && errJson.error && errJson.error.message) ||
          (errJson && errJson.message) || '';
      } catch (_) {}
      throw makeTtsError(
        'http_' + res.status,
        'Minimax TTS HTTP ' + res.status + (detail ? '：' + redactSecrets(detail, [cfg.apiKey]).slice(0, 240) : ''),
        { provider: PROVIDERS.MINIMAX, httpStatus: res.status }
      );
    }

    var json = await res.json();
    if (json && json.base_resp && json.base_resp.status_code !== 0 && json.base_resp.status_code !== undefined) {
      throw makeTtsError('upstream_error', 'Minimax TTS 错误：' + (json.base_resp.status_msg || '未知错误'), { provider: PROVIDERS.MINIMAX });
    }

    var audioHex = json && json.data && json.data.audio;
    if (!audioHex) {
      throw makeTtsError('empty_audio_stream', 'Minimax TTS 未返回音频数据', { provider: PROVIDERS.MINIMAX });
    }

    var bytes = new Uint8Array(audioHex.length / 2);
    for (var i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(audioHex.substr(i * 2, 2), 16);
    }
    var blob = new global.Blob([bytes], { type: 'audio/mpeg' });
    return global.URL.createObjectURL(blob);
  }

  function createAbortSignal(timeoutMs) {
    if (typeof global.AbortController === 'undefined') return { signal: undefined, cancel: function() {} };
    var ctrl = new global.AbortController();
    var timer = setTimeout(function() {
      try { ctrl.abort(); } catch (_) {}
    }, timeoutMs);
    return {
      signal: ctrl.signal,
      cancel: function() { clearTimeout(timer); }
    };
  }

  function classifyFetchException(err, endpointInfo) {
    var name = (err && err.name) || '';
    if (name === 'AbortError' || name === 'TimeoutError') {
      return makeTtsError('timeout', 'Fish Audio 代理请求超时，请检查网络连接或稍后再试', { retryable: true });
    }
    if (global.navigator && global.navigator.onLine === false) {
      return makeTtsError('network_error', '当前设备已离线，无法连接 Fish Audio 语音代理', { retryable: true });
    }
    var rawMsg = redactSecrets((err && err.message) || String(err || ''));
    if (endpointInfo && endpointInfo.sameOrigin) {
      return makeTtsError(
        'network_error',
        '无法连接同源 Fish Audio 代理（' + endpointInfo.url + '），请确认后端服务已启动：' + rawMsg.slice(0, 140),
        { retryable: true }
      );
    }
    return makeTtsError(
      'cors_blocked',
      '无法连接自定义 Fish Audio 代理（可能是代理未放行当前来源 CORS、HTTPS 证书异常或服务未启动）：' + rawMsg.slice(0, 140),
      { retryable: false }
    );
  }

  function wrapRawPcmAsWav(pcmBytes, sampleRate) {
    var sr = Number(sampleRate) || 44100;
    var numChannels = 1;
    var bitsPerSample = 16;
    var byteRate = sr * numChannels * (bitsPerSample / 8);
    var blockAlign = numChannels * (bitsPerSample / 8);
    var dataSize = pcmBytes.byteLength;
    var buffer = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buffer);

    function writeStr(offset, s) {
      for (var i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    }

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    new Uint8Array(buffer, 44).set(pcmBytes);
    return new Uint8Array(buffer);
  }

  async function exchangeByokSession(endpointInfo, proxyToken, personalKey, persistSession) {
    var sessionUrl = deriveFishEndpointUrl(endpointInfo.url, 'session');
    var headers = { 'Content-Type': 'application/json' };
    if (proxyToken) headers['X-Fish-Proxy-Token'] = proxyToken;

    var timerCtrl = createAbortSignal(15000);
    var sRes;
    try {
      sRes = await global.fetch(sessionUrl, {
        method: 'POST',
        headers: headers,
        credentials: endpointInfo.sameOrigin ? 'same-origin' : 'include',
        body: JSON.stringify({ apiKey: personalKey }),
        signal: timerCtrl.signal
      });
    } catch (netErr) {
      timerCtrl.cancel();
      throw classifyFetchException(netErr, endpointInfo);
    }
    timerCtrl.cancel();

    var sJson = {};
    try { sJson = await sRes.json(); } catch (_) {}
    if (!sRes.ok) {
      var msg = redactSecrets((sJson && sJson.message) || ('代理会话建立失败（HTTP ' + sRes.status + '）'), [personalKey, proxyToken]);
      if (sRes.status === 400) throw makeTtsError('bad_request_400', msg, { httpStatus: 400 });
      if (sRes.status === 401) throw makeTtsError('proxy_unauthorized', msg, { httpStatus: 401 });
      if (sRes.status === 403) throw makeTtsError('forbidden_403', msg, { httpStatus: 403 });
      if (sRes.status === 429) throw makeTtsError('rate_limit_429', msg, { httpStatus: 429, retryable: true });
      throw makeTtsError('server_5xx', msg, { httpStatus: sRes.status });
    }

    var token = String((sJson && sJson.sessionToken) || '').trim();
    var ttlSec = Math.max(60, Number((sJson && sJson.expiresInSec) || 1800));
    var expiresAt = Date.now() + ttlSec * 1000;
    if (token && persistSession !== false) {
      _memorySessionCache = {
        endpoint: endpointInfo.url,
        sessionToken: token,
        expiresAt: expiresAt
      };
      await writeConfigKey('fishAudioSessionToken', {
        endpoint: endpointInfo.url,
        token: token,
        expiresAt: expiresAt
      });
    }
    return { token: token, expiresInSec: ttlSec, expiresAt: expiresAt };
  }

  async function ensureByokProxySession(endpointInfo, proxyToken, forceRefresh) {
    var now = Date.now();
    if (!forceRefresh && _memorySessionCache.endpoint === endpointInfo.url && _memorySessionCache.sessionToken && _memorySessionCache.expiresAt > now + 15000) {
      return _memorySessionCache.sessionToken;
    }
    if (!forceRefresh) {
      var persisted = await readConfigKey('fishAudioSessionToken');
      if (persisted && typeof persisted === 'object' && persisted.endpoint === endpointInfo.url && persisted.token && Number(persisted.expiresAt) > now + 15000) {
        _memorySessionCache = {
          endpoint: endpointInfo.url,
          sessionToken: String(persisted.token),
          expiresAt: Number(persisted.expiresAt)
        };
        return _memorySessionCache.sessionToken;
      }
    } else {
      _memorySessionCache = { endpoint: '', sessionToken: '', expiresAt: 0 };
      await deleteConfigKey('fishAudioSessionToken');
    }

    var personalKey = await loadDecryptedFishPersonalKey();
    if (!personalKey) {
      throw makeTtsError('config_missing', '尚未配置个人 Fish Audio API Key，请先在系统设置中填写并保存');
    }

    var exchanged = await exchangeByokSession(endpointInfo, proxyToken, personalKey, true);
    return exchanged.token;
  }

  async function mapProxyErrorResponse(res, extraSecrets) {
    var payload = null;
    var rawText = '';
    try {
      rawText = await res.text();
      if (rawText) {
        try { payload = JSON.parse(rawText); } catch (_) {}
      }
    } catch (_) {}

    var code = (payload && payload.error) ? String(payload.error) : '';
    var detail = (payload && (payload.message || payload.detail || (payload.error && payload.error.message))) || rawText || '';
    detail = redactSecrets(detail, extraSecrets).slice(0, 260);
    var st = res.status;

    if (st === 400 || st === 422) {
      return makeTtsError('bad_request_400', detail || 'Fish Audio 模型或 Reference ID 参数错误（HTTP ' + st + '）', { httpStatus: st });
    }
    if (st === 401) {
      if (code === 'proxy_unauthorized') {
        return makeTtsError('proxy_unauthorized', detail || '代理访问令牌无效或缺失（HTTP 401）', { httpStatus: 401 });
      }
      if (code === 'session_required') {
        return makeTtsError('session_required', detail || '代理短期会话已失效，请重新建立连接', { httpStatus: 401 });
      }
      return makeTtsError('auth_401', detail || 'Fish Audio API Key 无效或已过期（HTTP 401）', { httpStatus: 401 });
    }
    if (st === 403) {
      return makeTtsError('forbidden_403', detail || '访问被拒绝或 Fish Audio 账号权限不足（HTTP 403）', { httpStatus: 403 });
    }
    if (st === 429) {
      return makeTtsError('rate_limit_429', detail || '请求过于频繁或 Fish Audio 额度已达上限（HTTP 429）', { httpStatus: 429, retryable: true });
    }
    if (st === 503 && (code === 'proxy_key_missing' || code === 'session_secret_missing')) {
      return makeTtsError(code, detail || '代理服务端未就绪（HTTP 503）', { httpStatus: 503 });
    }
    if (st === 504 || code === 'upstream_timeout') {
      return makeTtsError('timeout', detail || 'Fish Audio 上游合成超时（HTTP 504）', { httpStatus: 504, retryable: true });
    }
    if (st >= 500) {
      return makeTtsError('server_5xx', detail || 'Fish Audio 服务或代理暂不可用（HTTP ' + st + '）', { httpStatus: st, retryable: true });
    }
    return makeTtsError('http_' + st, detail || 'Fish Audio 请求异常（HTTP ' + st + '）', { httpStatus: st });
  }

  async function probeFishProxyStatus(customCfg) {
    var cfg = customCfg || await getFishAudioConfig();
    var endpointInfo = resolveFishProxyEndpoint(cfg.proxyUrl);
    if (!endpointInfo.ok) {
      return {
        ok: false,
        code: endpointInfo.code,
        message: endpointInfo.message
      };
    }
    if (typeof global.fetch !== 'function') {
      return { ok: false, code: 'network_error', message: '当前环境不支持网络请求' };
    }
    var statusUrl = deriveFishEndpointUrl(endpointInfo.url, 'status');
    var headers = {};
    if (cfg.proxyToken) headers['X-Fish-Proxy-Token'] = cfg.proxyToken;
    var timerCtrl = createAbortSignal(10000);
    var res;
    try {
      res = await global.fetch(statusUrl, {
        method: 'GET',
        headers: headers,
        credentials: endpointInfo.sameOrigin ? 'same-origin' : 'include',
        signal: timerCtrl.signal
      });
    } catch (netErr) {
      timerCtrl.cancel();
      var mapped = classifyFetchException(netErr, endpointInfo);
      return { ok: false, code: mapped.code, message: mapped.message };
    }
    timerCtrl.cancel();

    if (!res.ok) {
      var err = await mapProxyErrorResponse(res, [cfg.proxyToken]);
      return { ok: false, code: err.code, httpStatus: res.status, message: err.message };
    }
    var json = {};
    try { json = await res.json(); } catch (_) {}
    return {
      ok: Boolean(json && json.ok),
      sameOrigin: endpointInfo.sameOrigin,
      endpoint: endpointInfo.url,
      mode: (json && json.mode) || 'server_managed',
      serverKeyConfigured: Boolean(json && json.serverKeyConfigured),
      sessionSecretConfigured: json ? json.sessionSecretConfigured !== false : true,
      requiresAccessToken: Boolean(json && json.requiresAccessToken),
      byokSessionAllowed: json ? json.byokSessionAllowed !== false : true,
      hasByokSession: Boolean(json && json.hasByokSession),
      maxTextLength: Number(json && json.maxTextLength) || 1000
    };
  }

  async function testFishConnection(customCfg) {
    customCfg = customCfg || {};
    var cfg = await getFishAudioConfig();
    var authMode = customCfg.authMode || cfg.authMode || FISH_AUTH_MODES.BYOK_SESSION;
    var proxyUrl = customCfg.proxyUrl !== undefined ? customCfg.proxyUrl : cfg.proxyUrl;
    var proxyToken = customCfg.proxyToken !== undefined ? customCfg.proxyToken : cfg.proxyToken;

    var probe = await probeFishProxyStatus({ proxyUrl: proxyUrl, proxyToken: proxyToken });
    if (!probe.ok) {
      return {
        ok: false,
        stage: 'proxy',
        code: probe.code || 'network_error',
        message: probe.message || '代理连通失败'
      };
    }
    if (!probe.sessionSecretConfigured && authMode === FISH_AUTH_MODES.BYOK_SESSION) {
      return {
        ok: false,
        stage: 'proxy',
        code: 'session_secret_missing',
        probe: probe,
        message: '代理已连通（' + probe.endpoint + '），但 Worker 尚未配置 BYOK_SESSION_SECRET Secret，无法签发短期加密会话'
      };
    }

    if (authMode === FISH_AUTH_MODES.SERVER_MANAGED) {
      if (!probe.serverKeyConfigured) {
        return {
          ok: false,
          stage: 'proxy',
          code: 'proxy_key_missing',
          probe: probe,
          message: '代理已连通，但服务端未配置托管 FISH_AUDIO_API_KEY（公开 Worker 请使用个人密钥 BYOK 模式）'
        };
      }
      return {
        ok: true,
        stage: 'proxy',
        probe: probe,
        message: '服务端托管代理已连通就绪：' + probe.endpoint
      };
    }

    if (!probe.byokSessionAllowed) {
      return {
        ok: false,
        stage: 'proxy',
        code: 'forbidden_403',
        probe: probe,
        message: '当前代理未开启个人密钥 BYOK 会话模式，请检查代理配置'
      };
    }

    var candidateKey = String(customCfg.apiKey || '').trim();
    var usingUnsavedInput = Boolean(candidateKey);
    if (!candidateKey) {
      candidateKey = await loadDecryptedFishPersonalKey();
    }
    if (!candidateKey) {
      return {
        ok: false,
        stage: 'auth',
        code: 'config_missing',
        probe: probe,
        message: '代理连通正常（' + probe.endpoint + '），请先填写个人 Fish Audio API Key 再完成会话测试'
      };
    }

    var endpointInfo = resolveFishProxyEndpoint(proxyUrl);
    try {
      var sessionRes = await exchangeByokSession(endpointInfo, proxyToken, candidateKey, !usingUnsavedInput);
      var mins = Math.max(1, Math.round((sessionRes.expiresInSec || 1800) / 60));
      return {
        ok: true,
        stage: 'session',
        probe: probe,
        expiresInSec: sessionRes.expiresInSec,
        message: '连接测试通过：代理可达且 BYOK 短期加密会话已建立（有效期约 ' + mins + ' 分钟）。注意：API Key 本身是否欠费或被 Fish 官方鉴权通过，将在聊天/直播填写 Reference ID 实际合成音频时校验。'
      };
    } catch (err) {
      return {
        ok: false,
        stage: 'session',
        code: (err && err.code) || 'session_error',
        probe: probe,
        message: (err && err.message) || 'BYOK 会话交换失败'
      };
    }
  }

  async function callFishAudioTTS(text, referenceId, options) {
    options = options || {};
    var cfg = await getFishAudioConfig();
    var endpointInfo = resolveFishProxyEndpoint(options.proxyUrl != null ? options.proxyUrl : cfg.proxyUrl);
    if (!endpointInfo.ok) {
      throw makeTtsError(endpointInfo.code, endpointInfo.message);
    }

    var model = String(options.model || cfg.model || DEFAULT_FISH_MODEL).trim() || DEFAULT_FISH_MODEL;
    var format = String(options.format || cfg.format || 'mp3').trim().toLowerCase();
    if (FISH_AUDIO_FORMATS.indexOf(format) < 0) format = 'mp3';

    var cleanRefId = String(referenceId || '').trim();
    if (!cleanRefId) {
      throw makeTtsError('config_missing', 'Fish Audio Reference ID 未配置');
    }
    var cleanText = String(text || '').trim();
    if (!cleanText) {
      throw makeTtsError('config_missing', '语音文本不能为空');
    }
    if (typeof global.fetch !== 'function') {
      throw makeTtsError('network_error', '当前环境不支持网络请求');
    }

    var body = {
      text: cleanText,
      reference_id: cleanRefId,
      model: model,
      format: format,
      normalize: true
    };
    if (options.speed != null || options.volumeDb != null) {
      body.prosody = {};
      if (options.speed != null) {
        body.prosody.speed = Math.max(0.5, Math.min(2.0, Number(options.speed) || 1.0));
      }
      if (options.volumeDb != null) {
        body.prosody.volume = Math.max(-20, Math.min(20, Number(options.volumeDb) || 0));
      }
    }

    var proxyToken = options.proxyToken != null ? String(options.proxyToken).trim() : cfg.proxyToken;
    var sessionToken = '';
    if (cfg.authMode === FISH_AUTH_MODES.BYOK_SESSION) {
      sessionToken = await ensureByokProxySession(endpointInfo, proxyToken, false);
    }

    var attempt = 0;
    var res;
    while (attempt < 2) {
      attempt++;
      var headers = { 'Content-Type': 'application/json' };
      if (proxyToken) headers['X-Fish-Proxy-Token'] = proxyToken;
      if (sessionToken) headers['X-Fish-Session'] = sessionToken;

      var timerCtrl = createAbortSignal(Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
      try {
        res = await global.fetch(endpointInfo.url, {
          method: 'POST',
          headers: headers,
          credentials: endpointInfo.sameOrigin ? 'same-origin' : 'include',
          body: JSON.stringify(body),
          signal: timerCtrl.signal
        });
      } catch (netErr) {
        timerCtrl.cancel();
        throw classifyFetchException(netErr, endpointInfo);
      }
      timerCtrl.cancel();

      // 若代理因服务端重启导致 BYOK 临时会话失效，且客户端本地仍有个人密钥，自动重建一次会话后重试
      if (res.status === 503 || res.status === 401) {
        var clonedErr = await mapProxyErrorResponse(res, [proxyToken, sessionToken]);
        if (
          attempt === 1 &&
          cfg.authMode === FISH_AUTH_MODES.BYOK_SESSION &&
          (clonedErr.code === 'proxy_key_missing' || clonedErr.code === 'session_required')
        ) {
          sessionToken = await ensureByokProxySession(endpointInfo, proxyToken, true);
          continue;
        }
        throw clonedErr;
      }
      break;
    }

    if (!res.ok) {
      throw await mapProxyErrorResponse(res, [proxyToken, sessionToken]);
    }

    var resContentType = '';
    try {
      resContentType = String((res.headers && res.headers.get && res.headers.get('content-type')) || '').toLowerCase();
    } catch (_) {}
    if (resContentType && (resContentType.indexOf('application/json') >= 0 || resContentType.indexOf('text/') >= 0)) {
      throw makeTtsError('audio_decode_error', 'Fish Audio 代理返回了非音频响应（' + resContentType + '），请确认代理路径正确');
    }

    var mime = getMimeForFormat(format);
    var blob;
    if (format === 'pcm' && typeof res.arrayBuffer === 'function') {
      var pcmBuf = await res.arrayBuffer();
      if (!pcmBuf || !pcmBuf.byteLength) {
        throw makeTtsError('empty_audio_stream', 'Fish Audio TTS 返回了空音频流');
      }
      var pcmBytes = new Uint8Array(pcmBuf);
      var hasRiff = pcmBytes.length >= 4 && pcmBytes[0] === 82 && pcmBytes[1] === 73 && pcmBytes[2] === 70 && pcmBytes[3] === 70;
      var wavBytes = hasRiff ? pcmBytes : wrapRawPcmAsWav(pcmBytes, 44100);
      blob = new global.Blob([wavBytes], { type: 'audio/wav' });
    } else if (typeof res.blob === 'function') {
      var rawBlob = await res.blob();
      if (!rawBlob || (rawBlob.size !== undefined && rawBlob.size === 0)) {
        throw makeTtsError('empty_audio_stream', 'Fish Audio TTS 返回了空音频流');
      }
      blob = (rawBlob.type && rawBlob.type.indexOf('audio/') === 0)
        ? rawBlob
        : new global.Blob([rawBlob], { type: mime });
    } else if (typeof res.arrayBuffer === 'function') {
      var buf = await res.arrayBuffer();
      if (!buf || !buf.byteLength) {
        throw makeTtsError('empty_audio_stream', 'Fish Audio TTS 返回了空音频流');
      }
      blob = new global.Blob([buf], { type: mime });
    } else {
      throw makeTtsError('audio_decode_error', 'Fish Audio TTS 响应读取失败');
    }

    return global.URL.createObjectURL(blob);
  }

  function describeMediaError(mediaErr, format) {
    var code = mediaErr && mediaErr.code;
    var fmtLabel = format ? String(format).toUpperCase() : '音频';
    if (code === 1) return '音频播放被中断（MEDIA_ERR_ABORTED）';
    if (code === 2) return '音频流加载网络错误（MEDIA_ERR_NETWORK）';
    if (code === 3) return fmtLabel + ' 音频解码失败（MEDIA_ERR_DECODE）';
    if (code === 4) return '当前浏览器不支持该 ' + fmtLabel + ' 音频编码（MEDIA_ERR_SRC_NOT_SUPPORTED），建议切换为 MP3 或 WAV';
    return '音频播放或解码失败';
  }

  async function synthesize(params) {
    params = params || {};
    var provider = normalizeProvider(params.provider, false);
    if (provider === PROVIDERS.FISH_AUDIO) {
      var refId = params.referenceId != null ? params.referenceId : params.voiceId;
      var fishUrl = await callFishAudioTTS(params.text, refId, params.options);
      return {
        provider: PROVIDERS.FISH_AUDIO,
        blobUrl: fishUrl,
        mimeType: getMimeForFormat((params.options && params.options.format) || 'mp3')
      };
    }
    var mmUrl = await callMinimaxTTS(params.text, params.voiceId);
    return {
      provider: PROVIDERS.MINIMAX,
      blobUrl: mmUrl,
      mimeType: 'audio/mpeg'
    };
  }

  global.WanWanTTS = {
    PROVIDERS: PROVIDERS,
    FISH_AUTH_MODES: FISH_AUTH_MODES,
    MINIMAX_MODELS: MINIMAX_MODELS,
    DEFAULT_FISH_PROXY_PATH: DEFAULT_FISH_PROXY_PATH,
    DEFAULT_FISH_MODEL: DEFAULT_FISH_MODEL,
    FISH_AUDIO_MODELS: FISH_AUDIO_MODELS,
    FISH_AUDIO_FORMATS: FISH_AUDIO_FORMATS,
    normalizeProvider: normalizeProvider,
    getProviderLabel: getProviderLabel,
    redactSecrets: redactSecrets,
    resolveFishProxyEndpoint: resolveFishProxyEndpoint,
    deriveFishEndpointUrl: deriveFishEndpointUrl,
    getMinimaxConfig: getMinimaxConfig,
    getFishAudioConfig: getFishAudioConfig,
    saveFishAudioPersonalKey: saveFishAudioPersonalKey,
    clearFishAudioPersonalKey: clearFishAudioPersonalKey,
    hasStoredFishPersonalKey: hasStoredFishPersonalKey,
    probeFishProxyStatus: probeFishProxyStatus,
    testFishConnection: testFishConnection,
    getGlobalDefaultProvider: getGlobalDefaultProvider,
    getProviderCredentialStatus: getProviderCredentialStatus,
    describeMediaError: describeMediaError,
    callMinimaxTTS: callMinimaxTTS,
    callFishAudioTTS: callFishAudioTTS,
    synthesize: synthesize
  };
})(typeof window !== 'undefined' ? window : globalThis);
