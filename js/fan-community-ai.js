// js/fan-community-ai.js — 同好社区 · 捡手机文学 AI 运行时引擎（任务 15）
// 功能：
//   1. 统一调用弯弯机主 API（window.callAI），支持 AI 角色互动 与 AI 剧情生成。
//   2. 结构化输出解析与多层降级容错（纯 JSON / 代码块 JSON / 纯文本兜底）。
//   3. 严格校验 IndexedDB 真实表情包 ID，非法 ID 安全降级为文字。
//   4. 模拟文字语音条（text_voice）时长估算与纯文本清洗（绝不调用 TTS 或 Audio）。
//   5. 动态情感与关系状态演化（防刷屏通胀、解耦好感与当前情绪、事件日志持久化）。
//   6. 超过窗口上限时的对话历史滚动压缩摘要（且压缩后仍持续注入全局规则）。

(function(global) {
  'use strict';

  var MAX_RECENT_WINDOW = 18;
  var COMPRESS_TRIGGER_COUNT = 26;
  var MAX_HISTORY_SUMMARY_CHARS = 1400;

  function promptsApi() {
    return global.FanCommunityPrompts || null;
  }

  function worksApi() {
    return global.FanCommunityWorks || null;
  }

  function personasApi() {
    return global.FanCommunityPersonas || null;
  }

  function assetsApi() {
    return global.FanCommunityAssets || null;
  }

  function cleanPlainText(raw, maxLen) {
    if (raw === null || raw === undefined) return '';
    var s = String(raw).replace(/\r\n/g, '\n').trim();
    if (typeof maxLen === 'number' && maxLen > 0 && s.length > maxLen) {
      s = s.slice(0, maxLen);
    }
    return s;
  }

  // 根据语音文本长度估算自然秒数（短 3~5s，中 6~12s，长 13~55s）
  function estimateTextVoiceDuration(text, candidateDuration) {
    var parsed = Number(candidateDuration);
    if (Number.isFinite(parsed) && parsed >= 2 && parsed <= 59) {
      return Math.round(parsed);
    }
    var clean = String(text || '').replace(/\s+/g, '');
    var len = clean.length;
    if (len <= 0) return 4;
    if (len <= 8) return Math.max(3, Math.min(5, Math.ceil(len / 2)));
    if (len <= 28) return Math.max(6, Math.min(12, Math.round(len / 2.3)));
    return Math.max(13, Math.min(55, Math.round(len / 2.6)));
  }

  function stripCodeFence(rawText) {
    var text = String(rawText || '').trim();
    var fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) {
      return fenceMatch[1].trim();
    }
    return text;
  }

  function extractBalancedJsonObject(rawText) {
    var text = stripCodeFence(rawText);
    try {
      var direct = JSON.parse(text);
      if (direct && typeof direct === 'object') return direct;
    } catch (_) {}

    var start = text.indexOf('{');
    if (start === -1) return null;

    var depth = 0;
    var inString = false;
    var escaped = false;
    for (var i = start; i < text.length; i++) {
      var ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          var candidate = text.slice(start, i + 1);
          try {
            var parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object') return parsed;
          } catch (_) {
            break;
          }
        }
      }
    }
    return null;
  }

  var MAX_COUNT_RETRIES = 2;
  var _localMsgIdSeq = 0;

  function nextBubbleId() {
    var wApi = worksApi();
    if (wApi && typeof wApi.generateMessageId === 'function') {
      return wApi.generateMessageId();
    }
    _localMsgIdSeq = (_localMsgIdSeq + 1) % 1000000;
    return 'msg_' + Date.now() + '_' + _localMsgIdSeq + '_' + Math.random().toString(36).slice(2, 6);
  }

  function resolveReplyPrefsSafe(workState) {
    var wApi = worksApi();
    if (wApi && typeof wApi.normalizeAiReplyPrefs === 'function') {
      return wApi.normalizeAiReplyPrefs(workState && workState.aiReplyPrefs);
    }
    var pApi = promptsApi();
    if (pApi && typeof pApi.getReplyPrefs === 'function') {
      return pApi.getReplyPrefs(workState);
    }
    return { minMessages: 1, maxMessages: 5 };
  }

  function extractRawMessagesArray(parsedObj) {
    if (!parsedObj || typeof parsedObj !== 'object') return null;
    var candidate = null;
    if (Array.isArray(parsedObj.messages)) candidate = parsedObj.messages;
    else if (Array.isArray(parsedObj.items)) candidate = parsedObj.items;
    else if (Array.isArray(parsedObj.bubbles)) candidate = parsedObj.bubbles;
    else if (Array.isArray(parsedObj.replies)) candidate = parsedObj.replies;
    if (!candidate) return null;
    // 无损解包一层意外嵌套数组（例如 [[{...}, {...}]]）
    if (candidate.length === 1 && Array.isArray(candidate[0])) {
      return candidate[0];
    }
    return candidate;
  }

  function isCountableBubble(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type === 'text') {
      return Boolean(cleanPlainText(msg.text, 1000));
    }
    if (msg.type === 'image' && msg.isSticker) {
      return Boolean(msg.assetId);
    }
    if (msg.type === 'text_voice') {
      return Boolean(cleanPlainText(msg.text !== undefined ? msg.text : msg.content, 600));
    }
    return false;
  }

  // 解析 AI 原始响应并结合真实表情包目录进行安全校验
  // 注意：绝不通过句号/逗号/固定字数机械拆分单条消息，也不静默截断超出范围的剧情气泡
  function parseStructuredResponse(rawText, options) {
    options = options || {};
    var mode = options.mode === 'ai_story' ? 'ai_story' : 'ai_roleplay';
    var stickerIdMap = options.stickerIdMap || Object.create(null);
    var defaultSide = options.defaultSide === 'right' ? 'right' : 'left';
    var parseCeiling = Math.max(40, (Number(options.maxMessages) || 5) + 12);

    var parsedObj = extractBalancedJsonObject(rawText);
    var usedFallbackPlainText = false;
    var rawMessages = [];
    var extractedArray = extractRawMessagesArray(parsedObj);

    if (extractedArray) {
      rawMessages = extractedArray;
    } else if (parsedObj && typeof parsedObj.reply === 'string') {
      rawMessages = [{ type: 'text', content: parsedObj.reply }];
    } else if (parsedObj && typeof parsedObj.content === 'string') {
      rawMessages = [{ type: 'text', content: parsedObj.content }];
    } else {
      usedFallbackPlainText = true;
      var plain = stripCodeFence(rawText);
      var lines = plain
        .split(/\n+/)
        .map(function(line) { return cleanPlainText(line, 600); })
        .filter(Boolean);
      if (!lines.length && plain.trim()) {
        lines = [cleanPlainText(plain, 600)];
      }
      rawMessages = lines.slice(0, parseCeiling).map(function(line) {
        return { side: defaultSide, type: 'text', content: line };
      });
    }

    var validatedMessages = [];
    var droppedInvalidStickers = 0;

    for (var i = 0; i < rawMessages.length && validatedMessages.length < parseCeiling; i++) {
      var item = rawMessages[i];
      if (typeof item === 'string') {
        var strMsg = cleanPlainText(item, 800);
        if (strMsg) {
          validatedMessages.push({
            id: nextBubbleId(),
            type: 'text',
            side: defaultSide,
            text: strMsg
          });
        }
        continue;
      }
      if (!item || typeof item !== 'object') continue;

      var itemSide = mode === 'ai_story'
        ? (item.side === 'right' ? 'right' : 'left')
        : 'left';
      var rawType = String(item.type || 'text').trim().toLowerCase();

      if (rawType === 'sticker' || rawType === 'emoji' || rawType === 'image') {
        var assetId = String(item.assetId || item.stickerId || item.id || '').trim();
        var matchedSticker = assetId && stickerIdMap[assetId] ? stickerIdMap[assetId] : null;
        if (matchedSticker) {
          validatedMessages.push({
            id: nextBubbleId(),
            type: 'image',
            isSticker: true,
            side: itemSide,
            assetId: matchedSticker.id,
            alt: matchedSticker.name || '表情包'
          });
        } else {
          droppedInvalidStickers += 1;
          var fallbackText = cleanPlainText(
            item.fallbackText || item.text || item.content || '',
            240
          );
          if (fallbackText) {
            validatedMessages.push({
              id: nextBubbleId(),
              type: 'text',
              side: itemSide,
              text: fallbackText
            });
          }
        }
        continue;
      }

      if (rawType === 'text_voice' || rawType === 'textvoice') {
        var voiceText = cleanPlainText(item.content !== undefined ? item.content : item.text, 500);
        if (!voiceText) continue;
        var estDur = estimateTextVoiceDuration(voiceText, item.duration);
        validatedMessages.push({
          id: nextBubbleId(),
          type: 'text_voice',
          side: itemSide,
          text: voiceText,
          content: voiceText,
          duration: estDur,
          isAiVoice: true
        });
        continue;
      }

      // 默认按普通文本气泡处理（绝不混入未定义类型或破坏数据结构）
      var txtVal = cleanPlainText(item.content !== undefined ? item.content : item.text, 800);
      if (txtVal) {
        validatedMessages.push({
          id: nextBubbleId(),
          type: 'text',
          side: itemSide,
          text: txtVal
        });
      }
    }

    if (!validatedMessages.length && !extractedArray) {
      var safeFallback = cleanPlainText(stripCodeFence(rawText), 600);
      if (safeFallback) {
        validatedMessages.push({
          id: nextBubbleId(),
          type: 'text',
          side: defaultSide,
          text: safeFallback
        });
      }
    }

    var validBubbleCount = validatedMessages.filter(isCountableBubble).length;

    return {
      messages: validatedMessages,
      validBubbleCount: validBubbleCount,
      emotionUpdate: parsedObj && parsedObj.emotionUpdate && typeof parsedObj.emotionUpdate === 'object'
        ? parsedObj.emotionUpdate
        : null,
      summaryNote: parsedObj && typeof parsedObj.summaryNote === 'string'
        ? cleanPlainText(parsedObj.summaryNote, 300)
        : '',
      usedFallbackPlainText: usedFallbackPlainText,
      droppedInvalidStickers: droppedInvalidStickers
    };
  }

  function validateMessageCount(parsed, replyPrefs) {
    var prefs = replyPrefs || { minMessages: 1, maxMessages: 5 };
    var minVal = prefs.minMessages;
    var maxVal = prefs.maxMessages;
    var count = parsed && typeof parsed.validBubbleCount === 'number'
      ? parsed.validBubbleCount
      : (parsed && Array.isArray(parsed.messages) ? parsed.messages.filter(isCountableBubble).length : 0);

    if (count < minVal) {
      return {
        ok: false,
        reason: 'too_few',
        actualCount: count,
        minMessages: minVal,
        maxMessages: maxVal
      };
    }
    if (count > maxVal) {
      return {
        ok: false,
        reason: 'too_many',
        actualCount: count,
        minMessages: minVal,
        maxMessages: maxVal
      };
    }
    return {
      ok: true,
      reason: 'ok',
      actualCount: count,
      minMessages: minVal,
      maxMessages: maxVal
    };
  }

  function buildCountCorrectionInstruction(mode, validation) {
    var minVal = validation.minMessages;
    var maxVal = validation.maxMessages;
    var actual = validation.actualCount;
    var isFixed = minVal === maxVal;
    var targetDesc = isFixed
      ? ('恰好 ' + minVal + ' 条')
      : (minVal + ' 至 ' + maxVal + ' 条');
    var scopeHint = mode === 'ai_story'
      ? '（请留意：AI 剧情生成模式的条数限制针对双方所有消息气泡的总和）'
      : '';

    if (validation.reason === 'too_few') {
      return [
        '你上一次返回的有效独立消息数量为 ' + actual + ' 条，少于当前作品设定的 ' + targetDesc + ' 范围' + scopeHint + '。',
        '请基于刚才的语境、角色性格与剧情氛围重新组织本次回复，自然生成 ' + targetDesc + '有实际交流意义的独立手机聊天气泡（可通过更贴合真人的对话承接、追问、细节补充、贴合情绪的表情包或文字语音条来形成自然节奏，避免空话或重复凑数）。',
        '请严格返回完整的单个 JSON 对象（包含 messages 与 emotionUpdate）。'
      ].join('\n');
    }
    return [
      '你上一次返回的有效独立消息数量为 ' + actual + ' 条，超过了当前作品设定的 ' + targetDesc + ' 范围' + scopeHint + '。',
      '请完整保留本次核心剧情、情绪流动与角色语气，自然收束并重新组织为 ' + targetDesc + '独立手机聊天气泡（避免丢失关键内容）。',
      '请严格返回完整的单个 JSON 对象（包含 messages 与 emotionUpdate）。'
    ].join('\n');
  }

  function clampInt(val, min, max, fallback) {
    var num = Number(val);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, Math.round(num)));
  }

  // 判断是否为无转折的轻量闲聊（防止小聊几句就虚高升温）
  function looksLikeCasualSmallTalk(userInput, emotionUpdate) {
    if (emotionUpdate && emotionUpdate.storyEvent && typeof emotionUpdate.storyEvent === 'object' && cleanPlainText(emotionUpdate.storyEvent.event, 200)) {
      return false;
    }
    if (emotionUpdate && emotionUpdate.shouldChangeRelationship === true) {
      return false;
    }
    var txt = String(userInput || '').trim();
    if (!txt) return false;
    return txt.length <= 24;
  }

  function applyEmotionUpdate(prevState, emotionUpdate, context) {
    var wApi = worksApi();
    var base = (wApi && typeof wApi.normalizeEmotionState === 'function')
      ? wApi.normalizeEmotionState(prevState)
      : Object.assign({
          relationshipStage: '日常初始',
          intimacy: 20,
          trust: 25,
          affection: 15,
          currentEmotion: '平静',
          emotionIntensity: 35,
          recentStoryEvents: [],
          relationshipSummary: '',
          smallTalkStreak: 0,
          lastUpdatedAt: 0
        }, prevState || {});

    if (!emotionUpdate || typeof emotionUpdate !== 'object') {
      return base;
    }

    var next = JSON.parse(JSON.stringify(base));
    var userInput = (context && context.userInput) || '';
    var hasStoryEvent = Boolean(
      emotionUpdate.storyEvent &&
      typeof emotionUpdate.storyEvent === 'object' &&
      cleanPlainText(emotionUpdate.storyEvent.event, 200)
    );
    var allowRelShift = Boolean(emotionUpdate.shouldChangeRelationship || hasStoryEvent);
    var casualOnly = looksLikeCasualSmallTalk(userInput, emotionUpdate);

    if (emotionUpdate.currentEmotion) {
      next.currentEmotion = cleanPlainText(emotionUpdate.currentEmotion, 32) || next.currentEmotion;
    }
    if (emotionUpdate.emotionIntensity !== undefined && emotionUpdate.emotionIntensity !== null) {
      next.emotionIntensity = clampInt(emotionUpdate.emotionIntensity, 0, 100, next.emotionIntensity);
    }

    if (!allowRelShift || casualOnly) {
      // 普通寒暄只允许微弱情绪/信任波动，绝不自动升级关系阶段或虚高亲密度
      next.smallTalkStreak = Math.min(999, (next.smallTalkStreak || 0) + 1);
      var minorTrustDelta = clampInt(emotionUpdate.trustDelta, -1, 1, 0);
      next.trust = clampInt(next.trust + minorTrustDelta, 0, 100, next.trust);
    } else {
      next.smallTalkStreak = 0;
      var iDelta = clampInt(emotionUpdate.intimacyDelta, -6, 6, 0);
      var tDelta = clampInt(emotionUpdate.trustDelta, -6, 6, 0);
      var aDelta = clampInt(emotionUpdate.affectionDelta, -6, 6, 0);

      next.intimacy = clampInt(next.intimacy + iDelta, 0, 100, next.intimacy);
      next.trust = clampInt(next.trust + tDelta, 0, 100, next.trust);
      next.affection = clampInt(next.affection + aDelta, 0, 100, next.affection);

      if (emotionUpdate.relationshipStage) {
        next.relationshipStage = cleanPlainText(emotionUpdate.relationshipStage, 32) || next.relationshipStage;
      }
    }

    if (emotionUpdate.relationshipSummary) {
      next.relationshipSummary = cleanPlainText(emotionUpdate.relationshipSummary, 400);
    }

    if (hasStoryEvent) {
      var evItem = {
        event: cleanPlainText(emotionUpdate.storyEvent.event, 200),
        impact: cleanPlainText(emotionUpdate.storyEvent.impact || '', 140),
        emotionShift: next.currentEmotion + '(' + next.emotionIntensity + ')',
        timestamp: Date.now()
      };
      next.recentStoryEvents = Array.isArray(next.recentStoryEvents) ? next.recentStoryEvents.slice() : [];
      next.recentStoryEvents.push(evItem);
      if (next.recentStoryEvents.length > 12) {
        next.recentStoryEvents = next.recentStoryEvents.slice(next.recentStoryEvents.length - 12);
      }
    }

    next.lastUpdatedAt = Date.now();
    return (wApi && typeof wApi.normalizeEmotionState === 'function')
      ? wApi.normalizeEmotionState(next)
      : next;
  }

  // 当历史消息超过窗口时，将更早未被压缩的记录安全折叠进入 aiMemory.historySummary
  function compressHistoryIfNeeded(workState, summaryNote, stickerIdMap) {
    if (!workState || typeof workState !== 'object') return false;
    var pApi = promptsApi();
    var wApi = worksApi();

    var mem = (wApi && typeof wApi.normalizeAiMemory === 'function')
      ? wApi.normalizeAiMemory(workState.aiMemory)
      : Object.assign({
          historySummary: '',
          summarizedCount: 0,
          lastSummaryAt: 0,
          lastModeUsed: '',
          turnCount: 0
        }, workState.aiMemory || {});

    var changed = false;
    var items = Array.isArray(workState.items) ? workState.items : [];
    var charName = String(workState.char || '对方').trim() || '对方';
    var userName = String(workState.user || '我').trim() || '我';

    // 收集可见消息索引
    var visibleEntries = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || it.fakeRecall || it.type === 'withdraw') continue;
      visibleEntries.push({ rawIndex: i, item: it });
    }

    var safeKeepFrom = Math.max(0, visibleEntries.length - MAX_RECENT_WINDOW);
    if (visibleEntries.length >= COMPRESS_TRIGGER_COUNT && safeKeepFrom > mem.summarizedCount) {
      var newlyFolded = visibleEntries.slice(mem.summarizedCount, safeKeepFrom);
      var digestParts = [];
      for (var j = 0; j < newlyFolded.length; j++) {
        var ser = pApi && typeof pApi.serializeMessageForPrompt === 'function'
          ? pApi.serializeMessageForPrompt(newlyFolded[j].item, charName, userName, stickerIdMap)
          : null;
        if (ser && ser.line) {
          digestParts.push(cleanPlainText(ser.line, 64));
        }
      }
      if (digestParts.length) {
        var chunk = digestParts.join('；');
        var combined = mem.historySummary
          ? (mem.historySummary + '\n[前情延展] ' + chunk)
          : ('[前情摘要] ' + chunk);
        if (combined.length > MAX_HISTORY_SUMMARY_CHARS) {
          combined = '…' + combined.slice(combined.length - MAX_HISTORY_SUMMARY_CHARS + 1);
        }
        mem.historySummary = combined;
        mem.summarizedCount = safeKeepFrom;
        mem.lastSummaryAt = Date.now();
        changed = true;
      }
    }

    if (summaryNote && String(summaryNote).trim()) {
      var cleanNote = cleanPlainText(summaryNote, 200);
      if (cleanNote && mem.historySummary.indexOf(cleanNote) === -1) {
        var appended = mem.historySummary
          ? (mem.historySummary + '\n• ' + cleanNote)
          : ('• ' + cleanNote);
        if (appended.length > MAX_HISTORY_SUMMARY_CHARS) {
          appended = '…' + appended.slice(appended.length - MAX_HISTORY_SUMMARY_CHARS + 1);
        }
        mem.historySummary = appended;
        mem.lastSummaryAt = Date.now();
        changed = true;
      }
    }

    workState.aiMemory = mem;
    return changed;
  }

  function formatAiCallError(err) {
    var msg = (err && err.message) ? String(err.message).trim() : 'AI 请求失败';
    if (msg === 'API未配置') {
      return '尚未配置主模型 API，请先前往「弯弯机设置 → API 设置」配置 URL、Key 与模型后再试。';
    }
    return msg;
  }

  async function resolveRoleSafe(workState) {
    var pApi = personasApi();
    if (!pApi || typeof pApi.resolveRoleRef !== 'function') {
      return { status: 'unbound', ref: null, sourceLabel: '', role: null };
    }
    try {
      return await pApi.resolveRoleRef(workState.boundRoleRef, workState.boundPersonaId);
    } catch (_) {
      return {
        status: workState.boundRoleRef ? 'missing' : 'unbound',
        ref: workState.boundRoleRef || null,
        sourceLabel: '',
        role: null
      };
    }
  }

  async function loadStickerCatalogSafe() {
    var aApi = assetsApi();
    if (!aApi) {
      return { catalog: [], idMap: Object.create(null), totalCount: 0 };
    }
    if (typeof aApi.buildAiStickerCatalog === 'function') {
      try {
        return await aApi.buildAiStickerCatalog(36);
      } catch (_) {}
    }
    try {
      var list = await aApi.listAssets('sticker');
      var catalog = [];
      var idMap = Object.create(null);
      list.forEach(function(st) {
        if (!st || !st.id) return;
        var desc = String(st.description || st.note || '').trim();
        var entry = {
          id: String(st.id),
          name: String(st.name || '表情包').replace(/\.[a-z0-9]{1,5}$/i, '').trim() || '表情包',
          description: desc,
          tags: Array.isArray(st.tags) ? st.tags : [],
          mood: String(st.mood || ''),
          note: String(st.note || desc),
          createdAt: Number(st.createdAt || 0),
          updatedAt: Number(st.updatedAt || st.createdAt || 0)
        };
        idMap[entry.id] = entry;
        if (catalog.length < 32) catalog.push(entry);
      });
      return { catalog: catalog, idMap: idMap, totalCount: list.length };
    } catch (_) {
      return { catalog: [], idMap: Object.create(null), totalCount: 0 };
    }
  }

  function buildWorldbookScanTexts(workState, resolvedRole, stickerInfo, options) {
    var st = workState && typeof workState === 'object' ? workState : {};
    var opts = options && typeof options === 'object' ? options : {};
    var idMap = (stickerInfo && stickerInfo.idMap) || Object.create(null);
    var parts = [];

    function pushText(val) {
      if (typeof val !== 'string') return;
      var trimmed = val.trim();
      if (trimmed) parts.push(trimmed);
    }

    if (opts.userInput) pushText(String(opts.userInput));
    if (opts.userDirection) pushText(String(opts.userDirection));

    // 最近聊天记录（仅扫描本轮实际已发送的消息；包含文字、text_voice 与已发送表情包的名称/描述/标签，绝不扫描未发送的全局表情包库）
    var items = Array.isArray(st.items) ? st.items : [];
    var visible = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || it.fakeRecall || it.type === 'withdraw') continue;
      visible.push(it);
    }
    var recent = visible.slice(-MAX_RECENT_WINDOW);
    for (var j = 0; j < recent.length; j++) {
      var msg = recent[j];
      if (msg.type === 'text' || msg.type === 'date') {
        pushText(msg.text);
      } else if (msg.type === 'text_voice' || msg.type === 'voice') {
        pushText(msg.text || msg.content);
      } else if (msg.type === 'image') {
        pushText(msg.alt);
        if (msg.isSticker && msg.assetId && idMap[msg.assetId]) {
          var meta = idMap[msg.assetId];
          pushText(meta.name);
          pushText(meta.description);
          if (Array.isArray(meta.tags) && meta.tags.length) pushText(meta.tags.join(' '));
          pushText(meta.mood);
          if (meta.note && meta.note !== meta.description) pushText(meta.note);
        }
      } else if (msg.type === 'transfer') {
        pushText(msg.note);
      } else if (msg.type === 'call') {
        pushText(msg.status);
      }
    }

    // 作品独立 aiSettings（不扫描 avoidContent，避免反向禁忌词误触发正向设定条目）
    var aiSet = st.aiSettings && typeof st.aiSettings === 'object' ? st.aiSettings : {};
    if (aiSet.story) {
      pushText(aiSet.story.worldBackground);
      pushText(aiSet.story.currentPlot);
      pushText(aiSet.story.plotDirection);
    }
    if (aiSet.aiRole) {
      pushText(aiSet.aiRole.name);
      pushText(aiSet.aiRole.personality);
      pushText(aiSet.aiRole.background);
      pushText(aiSet.aiRole.speakingStyle);
      pushText(aiSet.aiRole.relationshipToUser);
    }
    if (aiSet.userRole) {
      pushText(aiSet.userRole.identityBackground);
      pushText(aiSet.userRole.personality);
      pushText(aiSet.userRole.relationshipNotes);
    }

    // 当前绑定角色底层基础资料
    var role = resolvedRole && resolvedRole.status === 'ok' ? resolvedRole.role : null;
    if (role) {
      pushText(role.name);
      pushText(role.nick);
      pushText(role.role);
      pushText(role.personality);
      pushText(role.background);
      pushText(role.description);
      pushText(role.speakingStyle);
      pushText(role.experience);
      pushText(role.notes);
      pushText(role.relationsSummary);
    }

    // 必要历史剧情摘要
    if (st.aiMemory && st.aiMemory.historySummary) {
      pushText(st.aiMemory.historySummary);
    }

    return parts;
  }

  // 预留给同好社区所有玩法（捡手机文学、论坛体、文游模拟器）的统一只读世界书解析接口
  async function resolveWorldbookForCommunity(params) {
    params = params || {};
    var empty = {
      segments: { before: '', middle: '', after: '' },
      mergedText: '',
      matchedCount: 0,
      totalMatchedBeforeBudget: 0,
      truncatedByBudget: false,
      matchedMeta: []
    };
    var resolvedRole = params.resolvedRole || null;
    var roleRef = params.roleRef || (resolvedRole && resolvedRole.status === 'ok' ? resolvedRole.ref : null);
    var roleObj = (resolvedRole && resolvedRole.status === 'ok') ? resolvedRole.role : null;

    var roleSource = 'none';
    var charId = null;
    var extraPersonalBookIds = Array.isArray(params.extraPersonalBookIds)
      ? params.extraPersonalBookIds.slice()
      : [];

    if (roleRef && roleRef.source === 'char' && roleRef.id) {
      roleSource = 'char';
      charId = roleRef.id;
    } else if (roleRef && roleRef.source === 'npc' && roleRef.id) {
      roleSource = 'npc';
      charId = roleRef.id;
    } else if (roleRef && roleRef.source === 'community_persona') {
      roleSource = 'community_persona';
      charId = null;
      if (roleObj && Array.isArray(roleObj.lorebookIds)) {
        extraPersonalBookIds = extraPersonalBookIds.concat(roleObj.lorebookIds);
      }
    }

    var scanTexts = Array.isArray(params.scanTexts) ? params.scanTexts : [];
    var maxChars = Number.isFinite(Number(params.maxChars)) ? Number(params.maxChars) : 3400;

    if (typeof global.resolveLorebookContext === 'function') {
      try {
        return await global.resolveLorebookContext({
          roleSource: roleSource,
          charId: charId,
          extraPersonalBookIds: extraPersonalBookIds,
          scanTexts: scanTexts,
          maxChars: maxChars,
          appId: params.appId || 'fan_community'
        });
      } catch (_) {
        return empty;
      }
    }

    if (typeof global.getLorebookContextSegments === 'function') {
      try {
        var msgObjs = scanTexts.map(function(t) { return { content: String(t || '') }; });
        var numId = Number(charId);
        var effectiveId = (roleSource === 'char' || roleSource === 'npc')
          ? (Number.isFinite(numId) && String(numId) === String(charId) ? numId : charId)
          : null;
        var seg = await global.getLorebookContextSegments(effectiveId, msgObjs);
        var merged = [seg.before, seg.middle, seg.after].filter(Boolean).join('\n\n');
        return {
          segments: seg,
          mergedText: merged,
          matchedCount: merged ? 1 : 0,
          totalMatchedBeforeBudget: merged ? 1 : 0,
          truncatedByBudget: false,
          matchedMeta: []
        };
      } catch (_) {
        return empty;
      }
    }

    return empty;
  }

  async function requestAiTurn(options) {
    options = options || {};
    var workState = options.workState;
    if (!workState || typeof workState !== 'object') {
      throw new Error('缺少当前作品数据');
    }
    var pApi = promptsApi();
    if (!pApi || typeof pApi.assemblePromptPayload !== 'function') {
      throw new Error('全局提示词模块未就绪');
    }
    if (typeof global.callAI !== 'function') {
      throw new Error('弯弯机主 AI 服务未就绪');
    }

    var mode = workState.creationMode === 'ai_story' ? 'ai_story' : 'ai_roleplay';
    var replyPrefs = resolveReplyPrefsSafe(workState);
    var resolvedRole = await resolveRoleSafe(workState);
    var stickerInfo = await loadStickerCatalogSafe();

    // 使用浅拷贝预览压缩记忆，校验通过后再统一落盘，防止重试或失败导致剧情/记忆状态被提前修改
    var previewWorkState = Object.assign({}, workState, {
      aiReplyPrefs: replyPrefs,
      aiMemory: workState.aiMemory ? JSON.parse(JSON.stringify(workState.aiMemory)) : undefined
    });
    compressHistoryIfNeeded(previewWorkState, '', stickerInfo.idMap);

    var scanTexts = buildWorldbookScanTexts(previewWorkState, resolvedRole, stickerInfo, {
      userInput: options.userInput || '',
      userDirection: options.userDirection || ''
    });
    var worldbookContext = await resolveWorldbookForCommunity({
      resolvedRole: resolvedRole,
      scanTexts: scanTexts,
      maxChars: 3400,
      appId: 'fan_community_phone_chat'
    });

    var payload = pApi.assemblePromptPayload({
      mode: mode,
      workState: previewWorkState,
      resolvedRole: resolvedRole,
      worldbookContext: worldbookContext,
      stickerCatalog: stickerInfo.catalog,
      stickerIdMap: stickerInfo.idMap,
      recentWindowSize: MAX_RECENT_WINDOW,
      triggerType: options.triggerType || 'user_message',
      userDirection: options.userDirection || ''
    });

    if (typeof options.onPromptPrepared === 'function') {
      try { options.onPromptPrepared(payload); } catch (_) {}
    }

    var maxRetries = typeof options.maxCountRetries === 'number' && options.maxCountRetries >= 0
      ? Math.min(4, Math.round(options.maxCountRetries))
      : MAX_COUNT_RETRIES;
    var baseTemp = mode === 'ai_story' ? 0.88 : 0.82;
    var parsed = null;
    var validation = null;
    var attempt = 0;
    var attemptMessages = payload.messages.slice();

    for (attempt = 1; attempt <= maxRetries + 1; attempt++) {
      var rawReply;
      try {
        rawReply = await global.callAI(attemptMessages, {
          system: payload.system,
          temperature: attempt === 1 ? baseTemp : Math.max(0.55, Number((baseTemp - 0.1 * (attempt - 1)).toFixed(2)))
        });
      } catch (err) {
        var wrapped = new Error(formatAiCallError(err));
        wrapped.originalError = err;
        throw wrapped;
      }

      if (!rawReply || !String(rawReply).trim()) {
        if (attempt <= maxRetries) {
          attemptMessages = payload.messages.concat([
            {
              role: 'user',
              content: '上一次未返回有效内容，请严格按约定 JSON 格式生成 ' +
                (replyPrefs.minMessages === replyPrefs.maxMessages
                  ? ('恰好 ' + replyPrefs.minMessages + ' 条')
                  : (replyPrefs.minMessages + ' 至 ' + replyPrefs.maxMessages + ' 条')) +
                '独立手机聊天气泡。'
            }
          ]);
          continue;
        }
        throw new Error('模型未返回有效内容，请稍后重试');
      }

      parsed = parseStructuredResponse(rawReply, {
        mode: mode,
        stickerIdMap: stickerInfo.idMap,
        defaultSide: 'left',
        minMessages: replyPrefs.minMessages,
        maxMessages: replyPrefs.maxMessages
      });

      validation = validateMessageCount(parsed, replyPrefs);
      if (validation.ok && parsed.messages.length > 0) {
        break;
      }

      if (attempt <= maxRetries) {
        var correctionPrompt = buildCountCorrectionInstruction(mode, validation);
        attemptMessages = payload.messages.concat([
          { role: 'assistant', content: String(rawReply).slice(0, 1800) },
          { role: 'user', content: correctionPrompt }
        ]);
      }
    }

    if (!parsed || !validation || !validation.ok || !parsed.messages.length) {
      var rangeLabel = replyPrefs.minMessages === replyPrefs.maxMessages
        ? ('固定 ' + replyPrefs.minMessages + ' 条')
        : (replyPrefs.minMessages + '～' + replyPrefs.maxMessages + ' 条');
      var actualCount = validation ? validation.actualCount : 0;
      var countErr = new Error(
        'AI 返回的有效气泡数（' + actualCount + ' 条）不符合当前设置范围（' + rangeLabel + '），已重试 ' + (attempt - 1) + ' 次仍未达标，未写入聊天记录。可点击「重试」或调整条数设置。'
      );
      countErr.code = 'REPLY_COUNT_OUT_OF_RANGE';
      countErr.expectedRange = { minMessages: replyPrefs.minMessages, maxMessages: replyPrefs.maxMessages };
      countErr.actualCount = actualCount;
      countErr.attempts = attempt;
      throw countErr;
    }

    // 校验通过后再统一提交动态情感状态与压缩记忆（避免失败/重试重复推进状态）
    var nextEmotion = applyEmotionUpdate(workState.emotionState, parsed.emotionUpdate, {
      userInput: options.userInput || options.userDirection || '',
      mode: mode
    });
    workState.emotionState = nextEmotion;

    var wApi = worksApi();
    var mem = (wApi && typeof wApi.normalizeAiMemory === 'function')
      ? wApi.normalizeAiMemory(previewWorkState.aiMemory || workState.aiMemory)
      : (previewWorkState.aiMemory || workState.aiMemory || {});
    mem.lastModeUsed = mode;
    mem.turnCount = (mem.turnCount || 0) + 1;
    workState.aiMemory = mem;

    compressHistoryIfNeeded(workState, parsed.summaryNote, stickerInfo.idMap);

    return {
      messages: parsed.messages,
      emotionState: workState.emotionState,
      aiMemory: workState.aiMemory,
      resolvedRole: resolvedRole,
      worldbookContext: worldbookContext,
      promptMeta: payload.meta,
      replyCountMeta: {
        minMessages: replyPrefs.minMessages,
        maxMessages: replyPrefs.maxMessages,
        actualCount: validation.actualCount,
        attempts: attempt
      },
      usedFallbackPlainText: parsed.usedFallbackPlainText,
      droppedInvalidStickers: parsed.droppedInvalidStickers
    };
  }

  global.FanCommunityAi = {
    MAX_RECENT_WINDOW: MAX_RECENT_WINDOW,
    COMPRESS_TRIGGER_COUNT: COMPRESS_TRIGGER_COUNT,
    MAX_COUNT_RETRIES: MAX_COUNT_RETRIES,
    estimateTextVoiceDuration: estimateTextVoiceDuration,
    parseStructuredResponse: parseStructuredResponse,
    validateMessageCount: validateMessageCount,
    applyEmotionUpdate: applyEmotionUpdate,
    compressHistoryIfNeeded: compressHistoryIfNeeded,
    resolveRoleSafe: resolveRoleSafe,
    loadStickerCatalogSafe: loadStickerCatalogSafe,
    buildWorldbookScanTexts: buildWorldbookScanTexts,
    resolveWorldbookForCommunity: resolveWorldbookForCommunity,
    requestAiTurn: requestAiTurn
  };
})(window);
