// ai-workspace-ai.js — 知屿（AI 工作空间）第四阶段：专属 API 路由解析、Prompt 组装与真实 SSE 流式调用引擎
// 严格遵守：不修改弯弯机全局主 API 配置，不透传 API Key 到日志，知屿专属 API 失败时不偷偷回退主 API。
(function(global) {
  'use strict';

  function S() {
    return global.AiWorkspaceStorage;
  }

  function normalizeBaseUrl(url) {
    if (S() && typeof S().normalizeBaseUrl === 'function') {
      return S().normalizeBaseUrl(url);
    }
    return String(url == null ? '' : url).trim().replace(/\/+$/, '');
  }

  function normalizeTemperature(val, fallback) {
    if (S() && typeof S().normalizeTemperature === 'function') {
      return S().normalizeTemperature(val, fallback);
    }
    var n = Number(val);
    if (!Number.isFinite(n)) return typeof fallback === 'number' ? fallback : 0.7;
    return Math.max(0, Math.min(2, Math.round(n * 100) / 100));
  }

  function buildChatCompletionsUrl(baseUrl) {
    var clean = normalizeBaseUrl(baseUrl);
    if (!clean) return '';
    if (/\/chat\/completions$/i.test(clean)) return clean;
    return clean + '/chat/completions';
  }

  function buildModelsUrl(baseUrl) {
    var clean = normalizeBaseUrl(baseUrl);
    if (!clean) return '';
    if (/\/chat\/completions$/i.test(clean)) return clean.replace(/\/chat\/completions$/i, '/models');
    if (/\/models$/i.test(clean)) return clean;
    return clean + '/models';
  }

  function getApiErrorHint(status, detail) {
    var text = String(detail || '').toLowerCase();
    if (status === 401 || status === 403) return 'API Key 无效、已过期或无访问权限，请检查密钥设置。';
    if (status === 404) return '接口地址可能不正确，请检查 Base URL（例如是否需要以 /v1 结尾）。';
    if (status === 429) return '请求频率过高或额度受限，请稍后再试。';
    if (text.indexOf('model') !== -1 && (text.indexOf('not found') !== -1 || text.indexOf('does not exist') !== -1 || text.indexOf('unknown') !== -1)) {
      return '当前模型名称可能不被服务端支持，请尝试切换或拉取模型列表。';
    }
    if (status >= 500) return '服务端暂时异常，请稍后重试。';
    return '';
  }

  function maskApiKey(key) {
    var s = String(key || '').trim();
    if (!s) return '';
    if (s.length <= 8) return '••••••••';
    return s.slice(0, 4) + '••••' + s.slice(-4);
  }

  function parseModelListPayload(json) {
    if (!json || typeof json !== 'object') return [];
    if (Array.isArray(json.data)) {
      return json.data.map(function(item) {
        return item && (item.id || item.name);
      }).filter(Boolean).map(String);
    }
    if (Array.isArray(json.models)) {
      return json.models.map(function(item) {
        var name = item && (item.name || item.id);
        return name ? String(name).replace(/^models\//, '') : '';
      }).filter(Boolean);
    }
    return [];
  }

  function extractNonStreamText(json, opts) {
    if (!json || typeof json !== 'object') return '';
    var choice = json.choices && json.choices[0];
    var msg = choice && choice.message;
    var content = msg ? msg.content : (choice && choice.text);
    if (typeof content === 'string' && content.trim()) return content;
    if (Array.isArray(content)) {
      var joined = content.map(function(part) {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      }).join('');
      if (joined.trim()) return joined;
    }
    if (opts && opts.allowReasoningFallback && msg && typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim()) {
      return msg.reasoning_content;
    }
    if (Array.isArray(json.candidates) && json.candidates[0] && json.candidates[0].content && Array.isArray(json.candidates[0].content.parts)) {
      return json.candidates[0].content.parts.map(function(p) {
        return p && typeof p.text === 'string' ? p.text : '';
      }).join('');
    }
    return typeof content === 'string' ? content : '';
  }

  function extractDeltaText(parsed) {
    if (!parsed || typeof parsed !== 'object') return '';
    var choice = parsed.choices && parsed.choices[0];
    if (!choice) return '';
    var delta = choice.delta;
    if (delta) {
      if (typeof delta.content === 'string') return delta.content;
      if (Array.isArray(delta.content)) {
        return delta.content.map(function(part) {
          if (typeof part === 'string') return part;
          if (part && typeof part.text === 'string') return part.text;
          return '';
        }).join('');
      }
    }
    if (choice.message && typeof choice.message.content === 'string') {
      return choice.message.content;
    }
    if (typeof choice.text === 'string') return choice.text;
    return '';
  }

  // 只读读取弯弯机主 API 配置（绝不修改全局配置或缓存）
  async function readPrimaryApiConfig() {
    var primary = { url: '', key: '', model: '' };
    var temperature = 0.7;

    try {
      if (typeof global.loadApiConfig === 'function') {
        var loaded = await global.loadApiConfig();
        if (loaded && loaded.primary) {
          primary.url = normalizeBaseUrl(loaded.primary.url);
          primary.key = String(loaded.primary.key || '').trim();
          primary.model = String(loaded.primary.model || '').trim();
        }
      } else if (global.db && global.db.config) {
        var rows = await global.db.config.bulkGet(['apiBaseUrl', 'apiKey', 'apiModel']);
        var v = function(r) { return r && r.value ? String(r.value) : ''; };
        primary.url = normalizeBaseUrl(v(rows[0]));
        primary.key = v(rows[1]).trim();
        primary.model = v(rows[2]).trim();
      }
    } catch (_) {}

    try {
      if (typeof global.getAITemperaturePreset === 'function') {
        temperature = normalizeTemperature(await global.getAITemperaturePreset('chat'), 0.7);
      }
    } catch (_) {}

    return {
      url: primary.url,
      key: primary.key,
      model: primary.model,
      temperature: temperature
    };
  }

  // 核心路由规则：
  // 1) 若知屿专属 API 完整配置（URL + Key + 模型），严格优先使用知屿专属 API，且失败时不回退主 API；
  // 2) 若知屿专属 API 未配置或不完整，自动使用弯弯机现有主 API（仅单次读取，不改动主 API）。
  async function resolveEffectiveApiConfig(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var store = S();
    var custom = store ? await store.getCustomApiConfig() : { baseUrl: '', apiKey: '', model: '', fetchedModels: [], temperature: 0.7, complete: false };
    var rememberedModel = store ? await store.getSelectedModel() : '';
    var primary = await readPrimaryApiConfig();

    var hasPartialCustom = !!(custom.baseUrl || custom.apiKey || custom.model);
    var requestedModel = String(opts.overrideModel || opts.chatModel || rememberedModel || '').trim();

    if (custom.complete) {
      var customEffectiveModel = requestedModel || custom.model;
      return {
        source: 'custom',
        sourceLabel: '知屿专属 API',
        configured: !!(custom.baseUrl && custom.apiKey && customEffectiveModel),
        customComplete: true,
        customIncomplete: false,
        url: custom.baseUrl,
        key: custom.apiKey,
        model: customEffectiveModel,
        defaultModel: custom.model,
        temperature: normalizeTemperature(custom.temperature, 0.7),
        fetchedModels: custom.fetchedModels || [],
        allowFallbackOnError: false
      };
    }

    var primaryEffectiveModel = requestedModel || primary.model;
    return {
      source: 'primary',
      sourceLabel: '弯弯机主 API',
      configured: !!(primary.url && primary.key && primaryEffectiveModel),
      customComplete: false,
      customIncomplete: hasPartialCustom,
      url: primary.url,
      key: primary.key,
      model: primaryEffectiveModel,
      defaultModel: primary.model,
      temperature: normalizeTemperature(primary.temperature, 0.7),
      fetchedModels: custom.fetchedModels || [],
      allowFallbackOnError: false
    };
  }

  function getSanitizedApiSummary(resolved) {
    if (!resolved) return { source: 'primary', configured: false, model: '', hasKey: false };
    return {
      source: resolved.source,
      sourceLabel: resolved.sourceLabel,
      configured: !!resolved.configured,
      customComplete: !!resolved.customComplete,
      customIncomplete: !!resolved.customIncomplete,
      url: resolved.url || '',
      hasKey: !!resolved.key,
      maskedKey: maskApiKey(resolved.key),
      model: resolved.model || '',
      defaultModel: resolved.defaultModel || '',
      temperature: resolved.temperature
    };
  }

  async function fetchModels(cfg) {
    var c = cfg && typeof cfg === 'object' ? cfg : {};
    var baseUrl = normalizeBaseUrl(c.url || c.baseUrl);
    var apiKey = String(c.key || c.apiKey || '').trim();
    if (!baseUrl) throw new Error('请先填写 Base URL');
    if (!apiKey) throw new Error('请先填写 API Key');

    var modelsUrl = buildModelsUrl(baseUrl);
    var isGemini = /generativelanguage\.googleapis\.com/i.test(modelsUrl);
    var headers = isGemini
      ? { 'x-goog-api-key': apiKey }
      : { Authorization: 'Bearer ' + apiKey };

    var res = await fetch(modelsUrl, { method: 'GET', headers: headers });
    var rawText = '';
    var json = null;
    try {
      rawText = await res.text();
      json = rawText ? JSON.parse(rawText) : {};
    } catch (_) {
      json = null;
    }

    if (!res.ok) {
      var detail = (json && ((json.error && json.error.message) || json.message || json.error)) || rawText || ('HTTP ' + res.status);
      var err = new Error('HTTP ' + res.status + '：' + String(detail).slice(0, 260));
      err.status = res.status;
      err.hint = getApiErrorHint(res.status, detail);
      throw err;
    }

    var models = parseModelListPayload(json);
    if (!models.length) {
      throw new Error('接口已响应，但未返回可用的模型列表，请尝试手动输入模型名称');
    }
    return models;
  }

  async function testConnection(cfg) {
    var c = cfg && typeof cfg === 'object' ? cfg : {};
    var url = normalizeBaseUrl(c.url || c.baseUrl);
    var key = String(c.key || c.apiKey || '').trim();
    var model = String(c.model || '').trim();
    var temperature = normalizeTemperature(c.temperature, 0.7);

    if (!url) throw new Error('请先填写 Base URL');
    if (!key) throw new Error('请先填写 API Key');
    if (!model) throw new Error('请先选择或手动输入模型名称');

    var isolatedCfg = { url: url, key: key, model: model };
    var startedAt = Date.now();
    var body = {
      model: model,
      temperature: temperature,
      messages: [{ role: 'user', content: '请只回复：连接成功' }]
    };

    var json;
    if (typeof global.runTrackedChatCompletion === 'function') {
      json = await global.runTrackedChatCompletion(isolatedCfg, body, '知屿专属 API 连接测试');
    } else {
      var endpoint = buildChatCompletionsUrl(url);
      var res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + key
        },
        body: JSON.stringify(body)
      });
      var rawText = await res.text();
      try {
        json = rawText ? JSON.parse(rawText) : {};
      } catch (_) {
        json = null;
      }
      if (!res.ok) {
        var detail = (json && ((json.error && json.error.message) || json.message || json.error)) || rawText || ('HTTP ' + res.status);
        var err = new Error('HTTP ' + res.status + '：' + String(detail).slice(0, 280));
        err.status = res.status;
        err.detail = String(detail);
        err.hint = getApiErrorHint(res.status, detail);
        throw err;
      }
      if (!json) throw new Error('API 返回了无法解析的 JSON 响应');
    }

    var reply = extractNonStreamText(json).trim();
    if (!reply) throw new Error('接口已响应，但未返回有效的模型回复内容');

    return {
      ok: true,
      reply: reply,
      model: (json && json.model) || model,
      durationMs: Date.now() - startedAt
    };
  }

  // ===== 提示词组装引擎（严格顺序：1.基础系统规则 -> 2.个性化设置 -> 3.当前预设 -> 4.相关长期记忆 -> 5.跨窗口历史参考 -> 6.当前对话摘要 -> 7.近期原始消息 -> 8.当前用户输入） =====
  function composeSystemPrompt(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var personalization = opts.personalization;
    var preset = opts.preset;
    var shortTermSummary = String(opts.shortTermSummary || '').trim();
    var memories = Array.isArray(opts.memories) ? opts.memories : [];
    var crossChatContexts = Array.isArray(opts.crossChatContexts) ? opts.crossChatContexts : [];
    var deepThink = !!opts.deepThink;

    var sections = [];

    // 1. 基础系统规则
    sections.push(
      '【基础系统规则】\n' +
      '你是「知屿」，运行在弯弯机中的个人 AI 工作空间助手。\n' +
      '- 请以清晰、准确、诚实且富有条理的方式回应用户的提问。\n' +
      '- 合适时可使用 Markdown 标题、列表、表格或 fenced 代码块组织回答。\n' +
      '- 如遇到不确定的事实或尚未接入的能力（如插件执行、文件读取等），请直接说明，不要虚构。'
    );

    // 2. 用户个性化配置（仅当启用时注入）
    if (personalization && personalization.enabled) {
      var psLines = [];
      if (personalization.tone) psLines.push('- 偏好回复语气：' + String(personalization.tone));
      if (personalization.detailLevel) psLines.push('- 偏好详细程度：' + String(personalization.detailLevel));
      if (personalization.customInstructions && String(personalization.customInstructions).trim()) {
        psLines.push('- 用户自定义指令：\n' + String(personalization.customInstructions).trim());
      }
      if (personalization.userPreferences && String(personalization.userPreferences).trim()) {
        psLines.push('- 用户个人偏好：\n' + String(personalization.userPreferences).trim());
      }
      if (psLines.length > 0) {
        sections.push('【用户个性化设置】\n' + psLines.join('\n'));
      }
    }

    // 3. 当前对话选用的预设（角色系统提示词与风格约束）
    if (preset && typeof preset === 'object') {
      var prLines = [];
      if (preset.name) prLines.push('- 当前角色预设：' + String(preset.name));
      if (preset.replyStyle) prLines.push('- 预设回复风格：' + String(preset.replyStyle));
      if (preset.detailLevel) prLines.push('- 预设回复详略：' + String(preset.detailLevel));
      if (preset.systemPrompt && String(preset.systemPrompt).trim()) {
        prLines.push('- 角色系统提示词：\n' + String(preset.systemPrompt).trim());
      }
      if (prLines.length > 0) {
        sections.push('【当前预设指令】\n' + prLines.join('\n'));
      }
    }

    // 4. 按相关性筛选后的长期记忆（仅作参考辅助，不得覆盖系统规则或用户当前指令）
    if (memories.length > 0) {
      var memLines = memories.map(function(m) {
        var cat = m.category ? '[' + String(m.category) + '] ' : '';
        var st = String(m.status || 'active').toLowerCase();
        var ts = String(m.temporalState || 'current').toLowerCase();
        var statusTag = '';
        if (st === 'cancelled' || ts === 'cancelled') {
          statusTag = '[已取消 · 非当前目标] ';
        } else if (st === 'completed' || ts === 'completed') {
          statusTag = '[已完成] ';
        } else if (st === 'historical' || ts === 'past') {
          statusTag = '[历史记录 · 非当前偏好] ';
        } else if (ts === 'future_plan') {
          statusTag = '[计划中] ';
        }
        return '- ' + statusTag + cat + String(m.content || '').trim();
      }).filter(Boolean);
      if (memLines.length > 0) {
        sections.push(
          '【相关长期记忆（仅作参考，不可覆盖系统规则或用户当前明确指令）】\n' +
          '以下内容是用户过往对话中沉淀的相关背景记忆，可自然参考以减少重复提问；标记为[历史记录]/[已取消]的内容代表已变更或取消的历史状态，请勿误当作当前目标或当前偏好；若与系统规则或用户本次明确要求冲突，一律以系统规则和用户当前指令为准：\n' +
          memLines.join('\n')
        );
      }
    }

    // 5. 跨窗口历史对话摘要/片段参考（仅在开启跨窗口记忆与参考历史聊天且命中相关内容时注入）
    if (crossChatContexts.length > 0) {
      var crossLines = crossChatContexts.map(function(c) {
        var label = c.chatTitle ? ('「' + String(c.chatTitle) + '」') : '「历史对话」';
        return '- 来自' + label + '：' + String(c.content || '').trim();
      }).filter(Boolean);
      if (crossLines.length > 0) {
        sections.push(
          '【跨窗口相关历史参考（仅作辅助，不可覆盖系统规则或用户当前明确指令）】\n' +
          '以下是用户在其他聊天窗口中曾提到过的相关上下文，请结合当前问题自然参考：\n' +
          crossLines.join('\n')
        );
      }
    }

    // 6. 当前对话短期记忆摘要（覆盖更早历史轮次，避免重复叠加）
    if (shortTermSummary) {
      sections.push(
        '【当前对话短期摘要（较早轮次阶段性总结）】\n' +
        '以下为本对话此前轮次的核心上下文摘要，后续消息列表仅保留最近原始对话：\n' +
        shortTermSummary
      );
    }

    // 深入思考模式补充提示
    if (deepThink) {
      sections.push(
        '【思考模式要求】\n' +
        '用户开启了「深入思考」模式。请在给出最终结论前，先在逻辑上充分推演关键约束、潜在边界情况与步骤依据，再输出条理分明的完整回答。'
      );
    }

    // 记忆系统真实执行状态提醒（如：需要向用户追问澄清、已拦截或关闭时，禁止假装“已记住/已删除”）
    if (opts.memoryTurnNotice && String(opts.memoryTurnNotice).trim()) {
      sections.push(
        '【本轮记忆系统真实状态提醒】\n' +
        String(opts.memoryTurnNotice).trim()
      );
    }

    return sections.join('\n\n');
  }

  function composeMessages(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var history = Array.isArray(opts.historyMessages) ? opts.historyMessages : [];
    var shortTermSummary = String(opts.shortTermSummary || '').trim();
    var summaryUpToCount = Math.max(0, Number(opts.summaryUpToCount) || 0);
    var hasExplicitLimit = opts.maxRecentMessages !== undefined && opts.maxRecentMessages !== null;
    var parsedLimit = Number(opts.maxRecentMessages);
    var maxRecent = hasExplicitLimit && Number.isFinite(parsedLimit)
      ? Math.max(0, Math.round(parsedLimit))
      : 6;

    // 7. 近期原始消息：若存在短期摘要且覆盖前 summaryUpToCount 条，则只取未摘要的最近原始消息
    var recentSlice = [];
    if (maxRecent > 0) {
      recentSlice = history;
      if (shortTermSummary && summaryUpToCount > 0 && summaryUpToCount < history.length) {
        recentSlice = history.slice(summaryUpToCount);
      }
      if (recentSlice.length > maxRecent) {
        recentSlice = recentSlice.slice(recentSlice.length - maxRecent);
      }
    }

    var systemText = composeSystemPrompt(opts);
    var out = [];
    if (systemText) {
      out.push({ role: 'system', content: systemText });
    }

    for (var i = 0; i < recentSlice.length; i++) {
      var msg = recentSlice[i];
      if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) continue;
      var text = String(msg.content || '').trim();
      if (!text) continue;
      if (msg.error && !msg.content) continue;
      out.push({ role: msg.role, content: String(msg.content) });
    }

    // 8. 当前用户输入
    if (opts.userContent != null && String(opts.userContent).trim()) {
      out.push({ role: 'user', content: String(opts.userContent) });
    }
    return out;
  }

  // ===== 真实 SSE 流式请求（严格支持 AbortController 中断，不模拟输出，不悄悄回退主 API） =====
  async function streamChatCompletion(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var cfg = opts.apiConfig || {};
    var url = normalizeBaseUrl(cfg.url || cfg.baseUrl);
    var key = String(cfg.key || cfg.apiKey || '').trim();
    var model = String(opts.model || cfg.model || '').trim();
    var temperature = normalizeTemperature(
      opts.temperature !== undefined ? opts.temperature : cfg.temperature,
      0.7
    );
    var messages = Array.isArray(opts.messages) ? opts.messages : [];
    var signal = opts.signal;
    var onDelta = typeof opts.onDelta === 'function' ? opts.onDelta : function() {};

    if (!url || !key) {
      var missingErr = new Error('尚未配置有效的 AI API（请先在弯弯机设置或「知屿专属 API」中填写 URL 与 Key）');
      missingErr.code = 'API_NOT_CONFIGURED';
      throw missingErr;
    }
    if (!model) {
      var modelErr = new Error('尚未指定模型名称，请先选择或输入模型');
      modelErr.code = 'MODEL_NOT_CONFIGURED';
      throw modelErr;
    }

    var endpoint = buildChatCompletionsUrl(url);
    var body = {
      model: model,
      messages: messages,
      temperature: temperature,
      stream: true
    };

    var res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
          Authorization: 'Bearer ' + key
        },
        body: JSON.stringify(body),
        signal: signal
      });
    } catch (networkErr) {
      if (networkErr && networkErr.name === 'AbortError') {
        networkErr.partialContent = '';
        throw networkErr;
      }
      var wrappedNetErr = new Error('网络请求失败：' + (networkErr && networkErr.message ? networkErr.message : '无法连接到 API 服务'));
      wrappedNetErr.cause = networkErr;
      wrappedNetErr.source = cfg.source || 'unknown';
      throw wrappedNetErr;
    }

    if (!res.ok) {
      var errText = '';
      var errJson = null;
      try {
        errText = await res.text();
        errJson = errText ? JSON.parse(errText) : null;
      } catch (_) {}
      var detail = (errJson && ((errJson.error && errJson.error.message) || errJson.message || errJson.error)) || errText || ('HTTP ' + res.status);
      var hint = getApiErrorHint(res.status, detail);
      var httpErr = new Error('HTTP ' + res.status + '：' + String(detail).slice(0, 280) + (hint ? '\n' + hint : ''));
      httpErr.status = res.status;
      httpErr.detail = String(detail);
      httpErr.hint = hint;
      httpErr.source = cfg.source || 'unknown';
      throw httpErr;
    }

    var contentType = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    var fullText = '';

    // 兼容部分网关未开启 SSE、直接返回 JSON 的情况
    if (/application\/json/i.test(contentType) && !/text\/event-stream/i.test(contentType)) {
      var jsonText = await res.text();
      var parsedJson;
      try {
        parsedJson = jsonText ? JSON.parse(jsonText) : {};
      } catch (_) {
        throw new Error('接口返回了无法解析的 JSON 数据');
      }
      if (parsedJson && parsedJson.error) {
        var jsonErrMsg = (parsedJson.error && parsedJson.error.message) || String(parsedJson.error);
        throw new Error(jsonErrMsg);
      }
      fullText = extractNonStreamText(parsedJson);
      if (fullText) onDelta(fullText, fullText);
      return {
        content: fullText,
        aborted: false,
        model: (parsedJson && parsedJson.model) || model,
        source: cfg.source || 'unknown'
      };
    }

    if (!res.body || typeof res.body.getReader !== 'function') {
      // 兜底：若当前运行环境响应无 ReadableStream reader，按完整文本解析 SSE 行
      var fallbackRaw = await res.text();
      var fallbackLines = fallbackRaw.split(/\r?\n/);
      for (var fi = 0; fi < fallbackLines.length; fi++) {
        var fl = fallbackLines[fi].trim();
        if (!fl || fl.indexOf('data:') !== 0) continue;
        var fPayload = fl.slice(5).trim();
        if (fPayload === '[DONE]') break;
        try {
          var fParsed = JSON.parse(fPayload);
          if (fParsed && fParsed.error) {
            throw new Error((fParsed.error && fParsed.error.message) || String(fParsed.error));
          }
          var fDelta = extractDeltaText(fParsed);
          if (fDelta) {
            fullText += fDelta;
            onDelta(fDelta, fullText);
          }
        } catch (parseEx) {
          if (parseEx && parseEx.message && fPayload.indexOf('"error"') !== -1) throw parseEx;
        }
      }
      return { content: fullText, aborted: false, model: model, source: cfg.source || 'unknown' };
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder('utf-8');
    var buffer = '';
    var doneStream = false;

    function processLine(rawLine) {
      var line = rawLine.trim();
      if (!line || line.charAt(0) === ':') return;
      if (line.indexOf('data:') !== 0) return;
      var payload = line.slice(5).trim();
      if (!payload) return;
      if (payload === '[DONE]') {
        doneStream = true;
        return;
      }
      var parsed;
      try {
        parsed = JSON.parse(payload);
      } catch (_) {
        return;
      }
      if (parsed && parsed.error) {
        var streamErrMsg = (parsed.error && parsed.error.message) || String(parsed.error);
        var streamErr = new Error(streamErrMsg);
        streamErr.source = cfg.source || 'unknown';
        throw streamErr;
      }
      var deltaText = extractDeltaText(parsed);
      if (deltaText) {
        fullText += deltaText;
        onDelta(deltaText, fullText);
      }
    }

    try {
      while (!doneStream) {
        var step = await reader.read();
        if (step.done) break;
        buffer += decoder.decode(step.value, { stream: true });
        var lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (var i = 0; i < lines.length; i++) {
          processLine(lines[i]);
          if (doneStream) break;
        }
      }
      buffer += decoder.decode();
      if (!doneStream && buffer.trim()) {
        var tailLines = buffer.split(/\r?\n/);
        for (var j = 0; j < tailLines.length; j++) {
          processLine(tailLines[j]);
        }
      }
    } catch (streamEx) {
      if (streamEx && streamEx.name === 'AbortError') {
        streamEx.partialContent = fullText;
        throw streamEx;
      }
      throw streamEx;
    } finally {
      try {
        if (doneStream && reader && typeof reader.cancel === 'function') {
          reader.cancel().catch(function() {});
        }
      } catch (_) {}
    }

    return {
      content: fullText,
      aborted: false,
      model: model,
      source: cfg.source || 'unknown'
    };
  }

  // ===== 轻量单次非流式请求（供后台自动记忆提取、短期摘要与跨窗口辅助检索复用当前知屿有效 API 配置） =====
  async function requestChatCompletion(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var cfg = (opts.apiConfig && (opts.apiConfig.url || opts.apiConfig.baseUrl) && (opts.apiConfig.key || opts.apiConfig.apiKey))
      ? opts.apiConfig
      : (await resolveEffectiveApiConfig());
    var url = normalizeBaseUrl(cfg.url || cfg.baseUrl);
    var key = String(cfg.key || cfg.apiKey || '').trim();
    var model = String(opts.model || cfg.model || '').trim();
    var temperature = normalizeTemperature(opts.temperature, 0.1);
    var messages = Array.isArray(opts.messages) ? opts.messages : [];

    if (!url || !key || !model) {
      throw new Error('API 未完整配置');
    }

    var body = {
      model: model,
      messages: messages,
      temperature: temperature,
      stream: false
    };
    if (opts.maxTokens && Number(opts.maxTokens) > 0) {
      body.max_tokens = Math.round(Number(opts.maxTokens));
    }

    var endpoint = buildChatCompletionsUrl(url);
    var res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key
      },
      body: JSON.stringify(body),
      signal: opts.signal
    });
    var rawText = await res.text();
    var contentType = (res.headers && res.headers.get && res.headers.get('content-type')) || '';

    if (!res.ok) {
      var errJson = null;
      try { errJson = rawText ? JSON.parse(rawText) : {}; } catch (_) {}
      var detail = (errJson && ((errJson.error && errJson.error.message) || errJson.message || errJson.error)) || rawText || ('HTTP ' + res.status);
      var err = new Error('HTTP ' + res.status + '：' + String(detail).slice(0, 200));
      err.status = res.status;
      throw err;
    }

    // 部分反代/网关即使 stream=false 仍可能返回 SSE 文本流，兼容解析
    if (/text\/event-stream/i.test(contentType) || /^\s*data:\s*/m.test(rawText)) {
      var sseLines = rawText.split(/\r?\n/);
      var sseText = '';
      for (var i = 0; i < sseLines.length; i++) {
        var line = sseLines[i].trim();
        if (!line || line.indexOf('data:') !== 0) continue;
        var payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          var chunk = JSON.parse(payload);
          var delta = extractDeltaText(chunk);
          if (delta) sseText += delta;
        } catch (_) {}
      }
      if (sseText.trim()) {
        return {
          content: sseText.trim(),
          model: model,
          source: cfg.source || 'unknown'
        };
      }
    }

    var json = null;
    try {
      json = rawText ? JSON.parse(rawText) : {};
    } catch (_) {
      json = null;
    }
    if (!json) throw new Error('API 返回了无法解析的 JSON 响应');
    if (json.error) {
      throw new Error((json.error && json.error.message) || String(json.error));
    }
    return {
      content: extractNonStreamText(json, { allowReasoningFallback: !!opts.allowReasoningFallback }).trim(),
      model: (json && json.model) || model,
      source: cfg.source || 'unknown'
    };
  }

  global.AiWorkspaceAI = {
    normalizeBaseUrl: normalizeBaseUrl,
    normalizeTemperature: normalizeTemperature,
    buildChatCompletionsUrl: buildChatCompletionsUrl,
    buildModelsUrl: buildModelsUrl,
    getApiErrorHint: getApiErrorHint,
    maskApiKey: maskApiKey,
    parseModelListPayload: parseModelListPayload,
    readPrimaryApiConfig: readPrimaryApiConfig,
    resolveEffectiveApiConfig: resolveEffectiveApiConfig,
    getSanitizedApiSummary: getSanitizedApiSummary,
    fetchModels: fetchModels,
    testConnection: testConnection,
    composeSystemPrompt: composeSystemPrompt,
    composeMessages: composeMessages,
    streamChatCompletion: streamChatCompletion,
    requestChatCompletion: requestChatCompletion
  };
})(typeof window !== 'undefined' ? window : globalThis);
