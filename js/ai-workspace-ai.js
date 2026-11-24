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

  // ===== 世界书注入长度上限与格式化（防止长文档导致过多 Token 消耗） =====
  var WORLDBOOK_MAX_TOTAL_CHARS = 6000;
  var WORLDBOOK_MAX_SINGLE_ENTRY_CHARS = 3500;

  function safeSlicePromptText(text, maxLen) {
    var src = String(text || '');
    if (maxLen <= 0) return '';
    if (src.length <= maxLen) return src;
    var cut = maxLen;
    // 避免截断 UTF-16 代理对
    var lastCode = src.charCodeAt(cut - 1);
    if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
      cut--;
    }
    var head = src.slice(0, cut);
    var minBoundary = Math.floor(cut * 0.78);
    var lastNewline = head.lastIndexOf('\n');
    if (lastNewline >= minBoundary) {
      head = head.slice(0, lastNewline);
    }
    return head.trimEnd();
  }

  function safeSlicePromptTail(text, maxLen) {
    var src = String(text || '');
    if (maxLen <= 0) return '';
    if (src.length <= maxLen) return src;
    var start = src.length - maxLen;
    var firstCode = src.charCodeAt(start);
    if (firstCode >= 0xDC00 && firstCode <= 0xDFFF) {
      start++;
    }
    var tail = src.slice(start);
    var firstNewline = tail.indexOf('\n');
    if (firstNewline > 0 && firstNewline <= Math.floor(tail.length * 0.22)) {
      tail = tail.slice(firstNewline + 1);
    }
    return tail.trimStart();
  }

  function trimSummaryToBudget(summaryText, maxChars) {
    var clean = String(summaryText || '').trim();
    var limit = Math.floor(Number(maxChars) || 0);
    if (!clean || limit <= 80) return '';
    if (clean.length <= limit) return clean;
    var lines = clean.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
    if (lines.length > 1) {
      var kept = [];
      var used = 0;
      for (var i = lines.length - 1; i >= 0; i--) {
        var line = lines[i];
        var need = line.length + (kept.length ? 1 : 0);
        if (used + need <= limit) {
          kept.unshift(line);
          used += need;
        } else if (!kept.length && limit > 40) {
          kept.unshift('…' + safeSlicePromptTail(line, limit - 1));
          break;
        } else {
          break;
        }
      }
      var joined = kept.join('\n');
      return joined.length > limit ? (safeSlicePromptText(joined, limit - 1) + '…') : joined;
    }
    return '…' + safeSlicePromptTail(clean, limit - 1);
  }

  function buildWorldBookPromptSection(worldBookEntries, options) {
    var list = Array.isArray(worldBookEntries) ? worldBookEntries : [];
    if (!list.length) return '';

    var opts = options && typeof options === 'object' ? options : {};
    var maxTotal = (Number.isFinite(Number(opts.maxTotalChars)) && Number(opts.maxTotalChars) > 0)
      ? Math.floor(Number(opts.maxTotalChars))
      : WORLDBOOK_MAX_TOTAL_CHARS;

    // 预去重并保留原始优先级顺序
    var uniqueEntries = [];
    var seenKeys = {};
    var seenContentKeys = {};
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || typeof item !== 'object') continue;
      var content = String(item.content || '').replace(/\r\n?/g, '\n').trim();
      if (!content) continue;
      var key = (item.bookId ? String(item.bookId) : '') + '::' + (item.id ? String(item.id) : ('uid_' + (item.uid != null ? item.uid : i)));
      if (seenKeys[key]) continue;
      var title = String(item.comment || '').trim();
      var contentKey = title + '\u0000' + content;
      if (seenContentKeys[contentKey]) continue;
      seenKeys[key] = true;
      seenContentKeys[contentKey] = true;
      uniqueEntries.push({
        bookName: String(item.bookName || '').trim(),
        comment: title,
        content: content
      });
    }

    if (!uniqueEntries.length) return '';

    var fullPreamble =
      '【世界书背景设定（静态设定参考，非真实发生的对话）】\n' +
      '以下内容为当前生效的世界书设定资料（已按优先级排序），仅用于提供世界观、人物、地点与规则等背景参考，切勿将其误认为用户刚刚说过的话或已经真实发生过的对话事件；若与系统规则或用户当前明确指令冲突，以系统规则和用户当前指令为准：\n';
    var compactPreamble = '【世界书背景设定】\n';
    var preamble = (maxTotal >= fullPreamble.length + 120)
      ? fullPreamble
      : (maxTotal >= compactPreamble.length + 40 ? compactPreamble : '');

    var truncTag = '…（超出长度上限，已截断）';
    var maxFooterChars = ('\n\n（注：为控制上下文长度，另有 ' + String(uniqueEntries.length) + ' 条较低优先级世界书词条未注入）').length;
    var noFooterBudget = Math.max(0, maxTotal - preamble.length);
    var withFooterBudget = Math.max(0, maxTotal - preamble.length - maxFooterChars);

    var defaultSingleLimit = uniqueEntries.length > 1
      ? Math.min(WORLDBOOK_MAX_SINGLE_ENTRY_CHARS, noFooterBudget)
      : noFooterBudget;
    var singleLimit = (Number.isFinite(Number(opts.maxSingleEntryChars)) && Number(opts.maxSingleEntryChars) > 0)
      ? Math.min(Math.floor(Number(opts.maxSingleEntryChars)), noFooterBudget)
      : defaultSingleLimit;

    // 检查是否所有词条无需任何截断即可直接放入 noFooterBudget
    var rawFullBlocks = [];
    var rawFullLen = 0;
    var fitsWithoutAnyTruncation = true;
    for (var k = 0; k < uniqueEntries.length; k++) {
      var e0 = uniqueEntries[k];
      var hp0 = [];
      if (e0.comment) hp0.push('[' + e0.comment + ']');
      if (e0.bookName) hp0.push('（世界书：' + e0.bookName + '）');
      var hl0 = hp0.length ? ('- ' + hp0.join('')) : '- [世界书设定]';
      if (e0.content.length > singleLimit) {
        fitsWithoutAnyTruncation = false;
        break;
      }
      var sep0 = rawFullBlocks.length > 0 ? 2 : 0;
      var bt0 = hl0 + '\n' + e0.content;
      rawFullLen += sep0 + bt0.length;
      if (rawFullLen > noFooterBudget) {
        fitsWithoutAnyTruncation = false;
        break;
      }
      rawFullBlocks.push(bt0);
    }

    if (fitsWithoutAnyTruncation && rawFullBlocks.length > 0) {
      return preamble + rawFullBlocks.join('\n\n');
    }

    // 需要截断或省略时，严格预留 preamble + footerNote 预算，保证整段注入长度 <= maxTotal
    var bodyBudget = withFooterBudget >= 60 ? withFooterBudget : noFooterBudget;
    var allowFooter = withFooterBudget >= 60;
    var effectiveSingleLimit = Math.min(singleLimit, bodyBudget);

    var blocks = [];
    var usedChars = 0;
    var truncatedAny = false;
    var omittedCount = 0;

    for (var j = 0; j < uniqueEntries.length; j++) {
      var entry = uniqueEntries[j];
      var remaining = bodyBudget - usedChars;
      if (remaining < 40) {
        omittedCount = uniqueEntries.length - j;
        truncatedAny = true;
        break;
      }

      var headerParts = [];
      if (entry.comment) headerParts.push('[' + entry.comment + ']');
      if (entry.bookName) headerParts.push('（世界书：' + entry.bookName + '）');
      var headerLine = headerParts.length ? ('- ' + headerParts.join('')) : '- [世界书设定]';
      var sepCost = blocks.length > 0 ? 2 : 0;
      var overhead = sepCost + headerLine.length + 1;
      var allowedContentChars = Math.min(effectiveSingleLimit, remaining - overhead);

      if (allowedContentChars < 24) {
        if (blocks.length === 0 && remaining - sepCost >= 20) {
          headerLine = '- [世界书设定]';
          overhead = sepCost + headerLine.length + 1;
          allowedContentChars = Math.min(effectiveSingleLimit, remaining - overhead);
        }
        if (allowedContentChars < 16) {
          omittedCount = uniqueEntries.length - j;
          truncatedAny = true;
          break;
        }
      }

      var bodyText = entry.content;
      if (bodyText.length > allowedContentChars) {
        if (allowedContentChars > truncTag.length + 4) {
          var sliceBudget = allowedContentChars - truncTag.length;
          bodyText = safeSlicePromptText(bodyText, sliceBudget) + truncTag;
        } else {
          bodyText = safeSlicePromptText(bodyText, allowedContentChars);
        }
        truncatedAny = true;
      }

      var blockText = headerLine + '\n' + bodyText;
      blocks.push(blockText);
      usedChars += sepCost + blockText.length;
    }

    if (!blocks.length) {
      var fallbackContent = safeSlicePromptText(uniqueEntries[0].content, Math.max(0, maxTotal - preamble.length));
      return fallbackContent ? (preamble + fallbackContent) : '';
    }

    var footerNote = '';
    if (allowFooter) {
      if (omittedCount > 0) {
        footerNote = '\n\n（注：为控制上下文长度，另有 ' + omittedCount + ' 条较低优先级世界书词条未注入）';
      } else if (truncatedAny) {
        footerNote = '\n\n（注：部分较长世界书设定已按长度上限截断）';
      }
    }

    var result = preamble + blocks.join('\n\n') + footerNote;
    if (result.length > maxTotal) {
      result = safeSlicePromptText(result, maxTotal);
    }
    return result;
  }

  // ===== 提示词组装引擎（严格顺序：1.基础系统规则 -> 2.个性化设置 -> 3.当前预设 -> 3.5.世界书背景设定 -> 4.相关长期记忆 -> 5.跨窗口历史参考 -> 6.当前对话摘要 -> 7.近期原始消息 -> 8.当前用户输入） =====
  function composeSystemPrompt(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var personalization = opts.personalization;
    var preset = opts.preset;
    var worldBookEntries = Array.isArray(opts.worldBookEntries)
      ? opts.worldBookEntries
      : (opts.worldBookMatch && Array.isArray(opts.worldBookMatch.matchedEntries) ? opts.worldBookMatch.matchedEntries : []);
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

    // 3.5. 当前生效的世界书背景设定（仅在命中词条时注入，作为静态背景设定，与真实聊天消息严格隔离）
    if (worldBookEntries.length > 0) {
      var worldBookSection = buildWorldBookPromptSection(worldBookEntries, {
        maxTotalChars: opts.worldBookMaxChars,
        maxSingleEntryChars: opts.worldBookMaxSingleEntryChars
      });
      if (worldBookSection) {
        sections.push(worldBookSection);
      }
    }

    // 4. 按相关性筛选后的长期记忆（仅作参考辅助，不得覆盖系统规则或用户当前指令）
    if (memories.length > 0) {
      var memLines = memories.map(function(m) {
        var cat = m.category ? '[' + String(m.category) + '] ' : '';
        var sceneTag = m.scenarioLabel ? '[' + String(m.scenarioLabel) + '] ' : '';
        var st = String(m.status || 'active').toLowerCase();
        var ts = String(m.temporalState || 'current').toLowerCase();
        var statusTag = '';
        if (st === 'cancelled' || ts === 'cancelled') {
          statusTag = '[已取消 · 非当前目标] ';
        } else if (st === 'paused' || ts === 'paused') {
          statusTag = '[暂时搁置 · 非当前进行中] ';
        } else if (st === 'completed' || ts === 'completed') {
          statusTag = '[已完成 · 已归档] ';
        } else if (st === 'historical' || ts === 'past') {
          statusTag = '[历史记录 · 非当前偏好] ';
        } else if (m.archived) {
          statusTag = '[已归档 · 历史参考] ';
        } else if (ts === 'future_plan') {
          statusTag = '[计划中] ';
        }
        var conflictTag = m.conflictState === 'pending_confirmation' ? '[存在待确认冲突] ' : '';
        return '- ' + statusTag + conflictTag + sceneTag + cat + String(m.content || '').trim();
      }).filter(Boolean);
      if (memLines.length > 0) {
        sections.push(
          '【相关长期记忆（仅作参考，不可覆盖系统规则或用户当前明确指令）】\n' +
          '以下内容是用户过往对话中沉淀的相关背景记忆，可自然参考以减少重复提问；标记为[历史记录]/[已取消]/[已完成]/[已归档]/[暂时搁置]的内容代表已变更、完成、取消或归档的过往状态，请勿误当作当前目标或当前偏好；标记为[存在待确认冲突]的内容可向用户温和确认；若与系统规则或用户本次明确要求冲突，一律以系统规则和用户当前指令为准：\n' +
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

  var DEFAULT_CONTEXT_BUDGET_BY_STRATEGY = {
    token_saver: 14000,
    natural: 26000,
    recall_more: 38000
  };

  function resolveTotalContextBudget(opts) {
    var explicit = Number(opts && opts.maxTotalContextChars);
    if (Number.isFinite(explicit) && explicit > 0) {
      return Math.max(400, Math.floor(explicit));
    }
    var strategy = String((opts && opts.strategy) || 'natural').trim();
    return DEFAULT_CONTEXT_BUDGET_BY_STRATEGY[strategy] || DEFAULT_CONTEXT_BUDGET_BY_STRATEGY.natural;
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

    // 7. 近期原始消息：按与 summaryUpToCount 一致的非空 user/assistant 清洗序列切片，避免空白/错误占位消息错位或重复注入已摘要消息
    var cleanHistory = [];
    for (var hi = 0; hi < history.length; hi++) {
      var hm = history[hi];
      if (!hm || (hm.role !== 'user' && hm.role !== 'assistant')) continue;
      if (!String(hm.content || '').trim()) continue;
      cleanHistory.push(hm);
    }

    var recentSlice = [];
    if (maxRecent > 0) {
      recentSlice = cleanHistory;
      if (shortTermSummary && summaryUpToCount > 0) {
        recentSlice = cleanHistory.slice(summaryUpToCount);
      }
      if (recentSlice.length > maxRecent) {
        recentSlice = recentSlice.slice(recentSlice.length - maxRecent);
      }
    }

    var workingRecent = [];
    for (var i = 0; i < recentSlice.length; i++) {
      var msg = recentSlice[i];
      if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) continue;
      var text = String(msg.content || '').trim();
      if (!text) continue;
      if (msg.error && !msg.content) continue;
      workingRecent.push({ role: msg.role, content: String(msg.content) });
    }

    var userMsgText = (opts.userContent != null && String(opts.userContent).trim()) ? String(opts.userContent) : '';
    var workingCross = Array.isArray(opts.crossChatContexts) ? opts.crossChatContexts.slice() : [];
    var workingMemories = Array.isArray(opts.memories) ? opts.memories.slice() : [];
    var workingSummary = shortTermSummary;
    var totalBudget = resolveTotalContextBudget(opts);

    var buildSystemWithWorking = function() {
      return composeSystemPrompt(Object.assign({}, opts, {
        shortTermSummary: workingSummary,
        memories: workingMemories,
        crossChatContexts: workingCross
      }));
    };
    var calcRecentChars = function(list) {
      var sum = 0;
      for (var ri = 0; ri < list.length; ri++) {
        sum += String((list[ri] && list[ri].content) || '').length;
      }
      return sum;
    };

    var systemText = buildSystemWithWorking();
    var totalChars = systemText.length + calcRecentChars(workingRecent) + userMsgText.length;

    if (totalChars > totalBudget) {
      // 1) 优先裁剪最低优先级的跨窗口历史参考（从尾部相关性最低项移除）
      while (totalChars > totalBudget && workingCross.length > 0) {
        workingCross.pop();
        systemText = buildSystemWithWorking();
        totalChars = systemText.length + calcRecentChars(workingRecent) + userMsgText.length;
      }

      // 2) 若近期原始消息过多过长，先收窄超出最近 4 条锚点窗口的较早原始消息，避免挤掉长期记忆与摘要
      while (totalChars > totalBudget && workingRecent.length > 4) {
        workingRecent.shift();
        totalChars = systemText.length + calcRecentChars(workingRecent) + userMsgText.length;
      }

      // 3) 若仍超预算，按最新行优先裁剪短期摘要（空间不足 80 字时整段省略，避免残片）
      if (totalChars > totalBudget && workingSummary) {
        var overage = totalChars - totalBudget;
        var targetSummaryLen = workingSummary.length - overage;
        workingSummary = trimSummaryToBudget(workingSummary, targetSummaryLen);
        systemText = buildSystemWithWorking();
        totalChars = systemText.length + calcRecentChars(workingRecent) + userMsgText.length;
      }

      // 4) 若仍超预算，从尾部逐条移除相关性最低的长期记忆，保住高相关核心记忆与近期对话
      while (totalChars > totalBudget && workingMemories.length > 0) {
        workingMemories.pop();
        systemText = buildSystemWithWorking();
        totalChars = systemText.length + calcRecentChars(workingRecent) + userMsgText.length;
      }

      // 5) 极端长对话下，逐步收缩更早近期消息（优先保住最新一轮与当前用户输入/必要系统指令）
      while (totalChars > totalBudget && workingRecent.length > 2) {
        workingRecent.shift();
        totalChars = systemText.length + calcRecentChars(workingRecent) + userMsgText.length;
      }
      while (totalChars > totalBudget && workingRecent.length > 1) {
        workingRecent.shift();
        totalChars = systemText.length + calcRecentChars(workingRecent) + userMsgText.length;
      }
      if (totalChars > totalBudget && workingRecent.length === 1) {
        var allowRecent = Math.max(0, totalBudget - systemText.length - userMsgText.length);
        if (allowRecent < 60) {
          workingRecent = [];
        } else {
          var truncPrefix = '…（较早内容已截断）\n';
          var tailBudget = allowRecent - truncPrefix.length;
          if (tailBudget > 24) {
            workingRecent[0] = {
              role: workingRecent[0].role,
              content: truncPrefix + safeSlicePromptTail(workingRecent[0].content, tailBudget)
            };
          } else {
            workingRecent[0] = {
              role: workingRecent[0].role,
              content: safeSlicePromptTail(workingRecent[0].content, allowRecent)
            };
          }
        }
      }
    }

    var out = [];
    if (systemText) {
      out.push({ role: 'system', content: systemText });
    }
    for (var j = 0; j < workingRecent.length; j++) {
      out.push(workingRecent[j]);
    }

    // 8. 当前用户输入（最高优先级完整保留）
    if (userMsgText) {
      out.push({ role: 'user', content: userMsgText });
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

    var hasTools = Array.isArray(opts.tools) && opts.tools.length > 0;
    var endpoint = buildChatCompletionsUrl(url);
    var body = {
      model: model,
      messages: messages,
      temperature: temperature,
      stream: true
    };
    if (hasTools) {
      body.tools = opts.tools;
      body.tool_choice = opts.toolChoice || 'auto';
    }

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
      if (hasTools && opts.allowToolFallback !== false && [400, 404, 422, 500].indexOf(res.status) !== -1) {
        var fallbackOpts = Object.assign({}, opts, {
          tools: undefined,
          toolChoice: undefined,
          allowToolFallback: false
        });
        return streamChatCompletion(fallbackOpts);
      }
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

    function extractNonStreamToolCalls(jsonObj) {
      var ch = jsonObj && Array.isArray(jsonObj.choices) ? jsonObj.choices[0] : null;
      var msgObj = ch && ch.message ? ch.message : null;
      var rawCalls = msgObj && Array.isArray(msgObj.tool_calls) ? msgObj.tool_calls : [];
      return rawCalls.map(function(tc, i) {
        return {
          id: (tc && tc.id) ? String(tc.id) : ('call_' + Date.now() + '_' + i),
          type: 'function',
          function: {
            name: (tc && tc.function && tc.function.name) ? String(tc.function.name) : '',
            arguments: (tc && tc.function && tc.function.arguments != null)
              ? (typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments))
              : '{}'
          }
        };
      }).filter(function(tc) { return !!tc.function.name; });
    }

    var toolCallAcc = Object.create(null);
    var lastFinishReason = '';
    function accumulateStreamToolCalls(parsedChunk) {
      var ch = parsedChunk && Array.isArray(parsedChunk.choices) ? parsedChunk.choices[0] : null;
      if (!ch) return;
      if (ch.finish_reason) lastFinishReason = String(ch.finish_reason);
      var delta = ch.delta || ch.message || null;
      if (!delta || !Array.isArray(delta.tool_calls)) return;
      for (var ti = 0; ti < delta.tool_calls.length; ti++) {
        var part = delta.tool_calls[ti];
        if (!part) continue;
        var idxKey = String(part.index != null ? part.index : ti);
        if (!toolCallAcc[idxKey]) {
          toolCallAcc[idxKey] = {
            index: Number(part.index != null ? part.index : ti),
            id: '',
            type: 'function',
            function: { name: '', arguments: '' }
          };
        }
        var entry = toolCallAcc[idxKey];
        if (part.id) entry.id = String(part.id);
        if (part.function) {
          if (part.function.name) entry.function.name += String(part.function.name);
          if (part.function.arguments != null) {
            entry.function.arguments += (typeof part.function.arguments === 'string'
              ? part.function.arguments
              : JSON.stringify(part.function.arguments));
          }
        }
      }
    }

    function finalizeAccumulatedToolCalls() {
      return Object.keys(toolCallAcc)
        .map(function(k) { return toolCallAcc[k]; })
        .sort(function(a, b) { return a.index - b.index; })
        .map(function(tc, i) {
          return {
            id: tc.id || ('call_' + Date.now() + '_' + i),
            type: 'function',
            function: {
              name: String(tc.function.name || '').trim(),
              arguments: String(tc.function.arguments || '').trim() || '{}'
            }
          };
        })
        .filter(function(tc) { return !!tc.function.name; });
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
        toolCalls: extractNonStreamToolCalls(parsedJson),
        finishReason: (parsedJson && parsedJson.choices && parsedJson.choices[0] && parsedJson.choices[0].finish_reason) || '',
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
          accumulateStreamToolCalls(fParsed);
          var fDelta = extractDeltaText(fParsed);
          if (fDelta) {
            fullText += fDelta;
            onDelta(fDelta, fullText);
          }
        } catch (parseEx) {
          if (parseEx && parseEx.message && fPayload.indexOf('"error"') !== -1) throw parseEx;
        }
      }
      return {
        content: fullText,
        toolCalls: finalizeAccumulatedToolCalls(),
        finishReason: lastFinishReason,
        aborted: false,
        model: model,
        source: cfg.source || 'unknown'
      };
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
      accumulateStreamToolCalls(parsed);
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
      toolCalls: finalizeAccumulatedToolCalls(),
      finishReason: lastFinishReason,
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

  async function matchWorldBooksForReply(options) {
    var store = S();
    if (!store || typeof store.matchWorldBookEntries !== 'function') {
      return {
        presetId: '',
        presetName: '',
        effectiveBooks: [],
        effectiveBookIds: [],
        effectiveBookCount: 0,
        globalBookCount: 0,
        presetBookCount: 0,
        matchedEntries: [],
        matchedCount: 0,
        constantCount: 0,
        keywordCount: 0,
        formattedText: ''
      };
    }
    return await store.matchWorldBookEntries(options || {});
  }

  // ===== 带工具自动调用循环的流式对话执行器（7-A3） =====
  async function runChatCompletionWithTools(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var tools = Array.isArray(opts.tools) ? opts.tools : [];
    var executeTool = typeof opts.executeTool === 'function' ? opts.executeTool : null;
    if (!tools.length || !executeTool) {
      return streamChatCompletion(opts);
    }

    var maxRounds = Math.max(1, Math.min(8, Math.floor(Number(opts.maxToolRounds) || 5)));
    var maxTotalCalls = Math.max(1, Math.min(20, Math.floor(Number(opts.maxTotalCalls) || 10)));
    var workingMessages = Array.isArray(opts.messages) ? opts.messages.slice() : [];
    var onDelta = typeof opts.onDelta === 'function' ? opts.onDelta : function() {};
    var onToolCallUpdate = typeof opts.onToolCallUpdate === 'function' ? opts.onToolCallUpdate : function() {};
    var toolRecords = [];
    var totalCallsCount = 0;

    for (var round = 0; round <= maxRounds; round++) {
      var canOfferTools = round < maxRounds && totalCallsCount < maxTotalCalls;
      var roundResult = await streamChatCompletion({
        apiConfig: opts.apiConfig,
        model: opts.model,
        temperature: opts.temperature,
        messages: workingMessages,
        tools: canOfferTools ? tools : undefined,
        toolChoice: canOfferTools ? (opts.toolChoice || 'auto') : undefined,
        allowToolFallback: opts.allowToolFallback !== false,
        signal: opts.signal,
        onDelta: onDelta
      });

      var calls = Array.isArray(roundResult.toolCalls) ? roundResult.toolCalls : [];
      if (!calls.length || !canOfferTools) {
        return {
          content: roundResult.content || '',
          aborted: !!roundResult.aborted,
          model: roundResult.model || opts.model || '',
          source: roundResult.source || 'unknown',
          toolCalls: toolRecords.slice()
        };
      }

      workingMessages.push({
        role: 'assistant',
        content: roundResult.content ? roundResult.content : null,
        tool_calls: calls
      });

      for (var ci = 0; ci < calls.length; ci++) {
        var tc = calls[ci];
        if (!tc || !tc.function || !tc.function.name) continue;
        if (totalCallsCount >= maxTotalCalls) {
          var limitMsg = '已达到单次回复最大工具调用次数上限（' + maxTotalCalls + ' 次）';
          workingMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: JSON.stringify({ ok: false, error: limitMsg })
          });
          continue;
        }
        totalCallsCount++;

        var rawArgs = tc.function.arguments || '{}';
        var parsedArgs = {};
        var parseError = '';
        try {
          parsedArgs = rawArgs ? JSON.parse(rawArgs) : {};
          if (!parsedArgs || typeof parsedArgs !== 'object' || Array.isArray(parsedArgs)) {
            parsedArgs = {};
          }
        } catch (argErr) {
          parseError = '工具参数 JSON 解析失败：' + (argErr && argErr.message ? argErr.message : '格式错误');
        }

        var record = {
          id: tc.id || ('tool_' + Date.now() + '_' + totalCallsCount),
          name: tc.function.name,
          fullName: tc.function.name,
          pluginName: '',
          toolLabel: tc.function.name,
          status: 'running',
          summaryText: '正在调用...',
          error: '',
          argumentsText: rawArgs,
          resultText: '',
          durationMs: 0
        };
        toolRecords.push(record);
        onToolCallUpdate(toolRecords.slice());

        var startedAt = Date.now();
        var execRes;
        if (parseError) {
          execRes = { ok: false, error: parseError };
        } else {
          try {
            execRes = await executeTool(tc, parsedArgs);
          } catch (execErr) {
            execRes = { ok: false, error: (execErr && execErr.message) ? execErr.message : '工具执行异常' };
          }
        }
        var duration = Math.max(0, Date.now() - startedAt);
        record.durationMs = duration;
        if (execRes) {
          if (execRes.fullName) record.fullName = execRes.fullName;
          if (execRes.pluginName) record.pluginName = execRes.pluginName;
          if (execRes.toolLabel) record.toolLabel = execRes.toolLabel;
          if (execRes.summaryText) record.summaryText = execRes.summaryText;
        }

        if (execRes && execRes.ok) {
          record.status = 'success';
          record.error = '';
          try {
            record.resultText = JSON.stringify(execRes.result, null, 2);
          } catch (_) {
            record.resultText = String(execRes.result || '');
          }
          if (!record.summaryText || record.summaryText === '正在调用...') {
            record.summaryText = '调用成功';
          }
        } else {
          record.status = 'error';
          record.error = (execRes && execRes.error) ? String(execRes.error) : '工具执行失败';
          record.summaryText = record.error;
          record.resultText = JSON.stringify({ ok: false, error: record.error });
        }
        onToolCallUpdate(toolRecords.slice());

        workingMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.function.name,
          content: JSON.stringify(
            execRes && execRes.ok
              ? { ok: true, data: execRes.result }
              : { ok: false, error: record.error }
          )
        });
      }
    }

    return {
      content: '',
      aborted: false,
      model: opts.model || '',
      source: 'unknown',
      toolCalls: toolRecords.slice()
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
    WORLDBOOK_MAX_TOTAL_CHARS: WORLDBOOK_MAX_TOTAL_CHARS,
    WORLDBOOK_MAX_SINGLE_ENTRY_CHARS: WORLDBOOK_MAX_SINGLE_ENTRY_CHARS,
    matchWorldBooksForReply: matchWorldBooksForReply,
    buildWorldBookPromptSection: buildWorldBookPromptSection,
    composeSystemPrompt: composeSystemPrompt,
    composeMessages: composeMessages,
    streamChatCompletion: streamChatCompletion,
    runChatCompletionWithTools: runChatCompletionWithTools,
    requestChatCompletion: requestChatCompletion
  };
})(typeof window !== 'undefined' ? window : globalThis);