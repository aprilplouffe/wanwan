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

  // 解析 AI 原始响应并结合真实表情包目录进行安全校验
  function parseStructuredResponse(rawText, options) {
    options = options || {};
    var mode = options.mode === 'ai_story' ? 'ai_story' : 'ai_roleplay';
    var stickerIdMap = options.stickerIdMap || Object.create(null);
    var defaultSide = options.defaultSide === 'right' ? 'right' : 'left';

    var parsedObj = extractBalancedJsonObject(rawText);
    var usedFallbackPlainText = false;
    var rawMessages = [];

    if (parsedObj && Array.isArray(parsedObj.messages)) {
      rawMessages = parsedObj.messages;
    } else if (parsedObj && typeof parsedObj.reply === 'string') {
      rawMessages = [{ type: 'text', content: parsedObj.reply }];
    } else if (parsedObj && typeof parsedObj.content === 'string') {
      rawMessages = [{ type: 'text', content: parsedObj.content }];
    } else {
      usedFallbackPlainText = true;
      var plain = stripCodeFence(rawText);
      // 去掉意外的 JSON 残片前缀或 markdown 噪音，按自然行切分，最多保留 3 条气泡
      var lines = plain
        .split(/\n+/)
        .map(function(line) { return cleanPlainText(line, 400); })
        .filter(Boolean);
      if (!lines.length && plain.trim()) {
        lines = [cleanPlainText(plain, 400)];
      }
      rawMessages = lines.slice(0, mode === 'ai_story' ? 4 : 3).map(function(line) {
        return { side: defaultSide, type: 'text', content: line };
      });
    }

    var validatedMessages = [];
    var droppedInvalidStickers = 0;

    for (var i = 0; i < rawMessages.length && validatedMessages.length < 6; i++) {
      var item = rawMessages[i];
      if (typeof item === 'string') {
        var strMsg = cleanPlainText(item, 600);
        if (strMsg) {
          validatedMessages.push({
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
            200
          );
          if (fallbackText) {
            validatedMessages.push({
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
          type: 'text',
          side: itemSide,
          text: txtVal
        });
      }
    }

    if (!validatedMessages.length) {
      var safeFallback = cleanPlainText(stripCodeFence(rawText), 500);
      if (safeFallback) {
        validatedMessages.push({
          type: 'text',
          side: defaultSide,
          text: safeFallback
        });
      }
    }

    return {
      messages: validatedMessages,
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
  function compressHistoryIfNeeded(workState, summaryNote) {
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
          ? pApi.serializeMessageForPrompt(newlyFolded[j].item, charName, userName)
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
        var entry = {
          id: String(st.id),
          name: String(st.name || '表情包').replace(/\.[a-z0-9]{1,5}$/i, '').trim() || '表情包',
          tags: Array.isArray(st.tags) ? st.tags : [],
          mood: String(st.mood || ''),
          note: String(st.note || '')
        };
        idMap[entry.id] = entry;
        if (catalog.length < 36) catalog.push(entry);
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

    // 最近聊天记录（包含普通文字、text_voice 语音文字内容、以及已使用表情包名称与语义标签）
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
          if (Array.isArray(meta.tags) && meta.tags.length) pushText(meta.tags.join(' '));
          pushText(meta.mood);
          pushText(meta.note);
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
    var resolvedRole = await resolveRoleSafe(workState);
    var stickerInfo = await loadStickerCatalogSafe();

    // 发起请求前如有必要先压缩更早历史（摘要保留，且下方的 assemblePromptPayload 仍强制注入全部全局规则）
    compressHistoryIfNeeded(workState, '');

    var scanTexts = buildWorldbookScanTexts(workState, resolvedRole, stickerInfo, {
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
      workState: workState,
      resolvedRole: resolvedRole,
      worldbookContext: worldbookContext,
      stickerCatalog: stickerInfo.catalog,
      recentWindowSize: MAX_RECENT_WINDOW,
      triggerType: options.triggerType || 'user_message',
      userDirection: options.userDirection || ''
    });

    if (typeof options.onPromptPrepared === 'function') {
      try { options.onPromptPrepared(payload); } catch (_) {}
    }

    var rawReply;
    try {
      rawReply = await global.callAI(payload.messages, {
        system: payload.system,
        temperature: mode === 'ai_story' ? 0.88 : 0.82
      });
    } catch (err) {
      var wrapped = new Error(formatAiCallError(err));
      wrapped.originalError = err;
      throw wrapped;
    }

    if (!rawReply || !String(rawReply).trim()) {
      throw new Error('模型未返回有效内容，请稍后重试');
    }

    var parsed = parseStructuredResponse(rawReply, {
      mode: mode,
      stickerIdMap: stickerInfo.idMap,
      defaultSide: 'left'
    });

    if (!parsed.messages.length) {
      throw new Error('模型返回内容无法解析为有效的聊天消息');
    }

    var nextEmotion = applyEmotionUpdate(workState.emotionState, parsed.emotionUpdate, {
      userInput: options.userInput || options.userDirection || '',
      mode: mode
    });
    workState.emotionState = nextEmotion;

    var wApi = worksApi();
    var mem = (wApi && typeof wApi.normalizeAiMemory === 'function')
      ? wApi.normalizeAiMemory(workState.aiMemory)
      : (workState.aiMemory || {});
    mem.lastModeUsed = mode;
    mem.turnCount = (mem.turnCount || 0) + 1;
    workState.aiMemory = mem;

    compressHistoryIfNeeded(workState, parsed.summaryNote);

    return {
      messages: parsed.messages,
      emotionState: workState.emotionState,
      aiMemory: workState.aiMemory,
      resolvedRole: resolvedRole,
      worldbookContext: worldbookContext,
      promptMeta: payload.meta,
      usedFallbackPlainText: parsed.usedFallbackPlainText,
      droppedInvalidStickers: parsed.droppedInvalidStickers
    };
  }

  global.FanCommunityAi = {
    MAX_RECENT_WINDOW: MAX_RECENT_WINDOW,
    COMPRESS_TRIGGER_COUNT: COMPRESS_TRIGGER_COUNT,
    estimateTextVoiceDuration: estimateTextVoiceDuration,
    parseStructuredResponse: parseStructuredResponse,
    applyEmotionUpdate: applyEmotionUpdate,
    compressHistoryIfNeeded: compressHistoryIfNeeded,
    resolveRoleSafe: resolveRoleSafe,
    loadStickerCatalogSafe: loadStickerCatalogSafe,
    buildWorldbookScanTexts: buildWorldbookScanTexts,
    resolveWorldbookForCommunity: resolveWorldbookForCommunity,
    requestAiTurn: requestAiTurn
  };
})(window);
