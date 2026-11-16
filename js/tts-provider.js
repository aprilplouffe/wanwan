// js/tts-provider.js — 统一底层 TTS Provider 引擎（Minimax + Fish Audio）
// 仅负责全局 API 凭据读取与语音合成请求分发；业务音色与角色绑定严格由微信 / 心动直播各自独立管理。
(function(global) {
  'use strict';

  var PROVIDERS = {
    MINIMAX: 'minimax',
    FISH_AUDIO: 'fish_audio'
  };

  var MINIMAX_MODELS = [
    'speech-2.8-hd',
    'speech-2.8-turbo',
    'speech-2.6-hd',
    'speech-2.6-turbo',
    'speech-02-hd',
    'speech-02-turbo'
  ];

  var FISH_AUDIO_ENDPOINT = 'https://api.fish.audio/v1/tts';
  var FISH_AUDIO_MODELS = [
    's2.1-pro',
    's2.1-pro-free',
    'drama-3',
    's2-pro'
  ];
  var FISH_AUDIO_FORMATS = ['mp3', 'wav', 'opus', 'pcm'];

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
    if (f === 'pcm') return 'audio/pcm';
    return 'audio/mpeg';
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
      readConfigKey('fishAudioApiKey'),
      readConfigKey('fishAudioModel'),
      readConfigKey('fishAudioFormat')
    ]);
    var modelRaw = String(vals[1] || '').trim();
    var model = FISH_AUDIO_MODELS.indexOf(modelRaw) >= 0 ? modelRaw : (modelRaw || 's2.1-pro');
    var fmtRaw = String(vals[2] || '').trim().toLowerCase();
    var format = FISH_AUDIO_FORMATS.indexOf(fmtRaw) >= 0 ? fmtRaw : 'mp3';
    return {
      apiKey: String(vals[0] || '').trim(),
      model: model,
      format: format
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
      var ready = Boolean(fCfg.apiKey && fCfg.model);
      return {
        provider: PROVIDERS.FISH_AUDIO,
        label: 'Fish Audio',
        apiReady: ready,
        model: fCfg.model,
        format: fCfg.format,
        missingReason: ready ? '' : 'Fish Audio API 未配置（请前往主设置填写 Fish Audio API Key 与模型）'
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
      throw new Error('Minimax API 未配置，请在系统设置中填写 Group ID 和 API Key');
    }
    if (!cfg.model) {
      throw new Error('Minimax 语音模型未选择，请在系统设置中选择模型');
    }
    var cleanVoiceId = String(voiceId || '').trim();
    if (!cleanVoiceId) {
      throw new Error('Minimax Voice ID 未配置');
    }
    var cleanText = String(text || '').trim();
    if (!cleanText) {
      throw new Error('语音文本不能为空');
    }
    if (typeof global.fetch !== 'function') {
      throw new Error('当前环境不支持网络请求');
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
      throw new Error('Minimax TTS HTTP ' + res.status + (detail ? '：' + String(detail).slice(0, 300) : ''));
    }

    var json = await res.json();
    if (json && json.base_resp && json.base_resp.status_code !== 0 && json.base_resp.status_code !== undefined) {
      throw new Error('Minimax TTS 错误：' + (json.base_resp.status_msg || '未知错误'));
    }

    var audioHex = json && json.data && json.data.audio;
    if (!audioHex) {
      throw new Error('Minimax TTS 未返回音频数据');
    }

    var bytes = new Uint8Array(audioHex.length / 2);
    for (var i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(audioHex.substr(i * 2, 2), 16);
    }
    var blob = new global.Blob([bytes], { type: 'audio/mpeg' });
    return global.URL.createObjectURL(blob);
  }

  async function callFishAudioTTS(text, referenceId, options) {
    options = options || {};
    var cfg = await getFishAudioConfig();
    if (!cfg.apiKey) {
      throw new Error('Fish Audio API Key 未配置，请在系统设置中填写 API Key');
    }
    var model = String(options.model || cfg.model || 's2.1-pro').trim() || 's2.1-pro';
    var format = String(options.format || cfg.format || 'mp3').trim().toLowerCase();
    if (FISH_AUDIO_FORMATS.indexOf(format) < 0) format = 'mp3';

    var cleanRefId = String(referenceId || '').trim();
    if (!cleanRefId) {
      throw new Error('Fish Audio Reference ID 未配置');
    }
    var cleanText = String(text || '').trim();
    if (!cleanText) {
      throw new Error('语音文本不能为空');
    }
    if (typeof global.fetch !== 'function') {
      throw new Error('当前环境不支持网络请求');
    }

    var body = {
      text: cleanText,
      reference_id: cleanRefId,
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

    var res;
    try {
      res = await global.fetch(FISH_AUDIO_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cfg.apiKey,
          'model': model
        },
        body: JSON.stringify(body)
      });
    } catch (netErr) {
      var msg = (netErr && netErr.message) || String(netErr || '网络异常');
      throw new Error('Fish Audio 请求失败（可能是网络异常或浏览器跨域 CORS 限制）：' + msg.slice(0, 200));
    }

    if (!res.ok) {
      var errDetail = '';
      try {
        var rawErr = await res.text();
        if (rawErr) {
          try {
            var parsed = JSON.parse(rawErr);
            errDetail = parsed.message || parsed.reason || parsed.detail || (parsed.error && parsed.error.message) || rawErr;
          } catch (_) {
            errDetail = rawErr;
          }
        }
      } catch (_) {}
      throw new Error('Fish Audio TTS HTTP ' + res.status + (errDetail ? '：' + String(errDetail).slice(0, 300) : ''));
    }

    var mime = getMimeForFormat(format);
    var blob;
    if (typeof res.blob === 'function') {
      var rawBlob = await res.blob();
      if (!rawBlob || (rawBlob.size !== undefined && rawBlob.size === 0)) {
        throw new Error('Fish Audio TTS 返回了空音频流');
      }
      blob = (rawBlob.type && rawBlob.type.indexOf('audio/') === 0)
        ? rawBlob
        : new global.Blob([rawBlob], { type: mime });
    } else if (typeof res.arrayBuffer === 'function') {
      var buf = await res.arrayBuffer();
      if (!buf || !buf.byteLength) {
        throw new Error('Fish Audio TTS 返回了空音频流');
      }
      blob = new global.Blob([buf], { type: mime });
    } else {
      throw new Error('Fish Audio TTS 响应读取失败');
    }

    return global.URL.createObjectURL(blob);
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
    MINIMAX_MODELS: MINIMAX_MODELS,
    FISH_AUDIO_ENDPOINT: FISH_AUDIO_ENDPOINT,
    FISH_AUDIO_MODELS: FISH_AUDIO_MODELS,
    FISH_AUDIO_FORMATS: FISH_AUDIO_FORMATS,
    normalizeProvider: normalizeProvider,
    getProviderLabel: getProviderLabel,
    getMinimaxConfig: getMinimaxConfig,
    getFishAudioConfig: getFishAudioConfig,
    getGlobalDefaultProvider: getGlobalDefaultProvider,
    getProviderCredentialStatus: getProviderCredentialStatus,
    callMinimaxTTS: callMinimaxTTS,
    callFishAudioTTS: callFishAudioTTS,
    synthesize: synthesize
  };
})(typeof window !== 'undefined' ? window : globalThis);
