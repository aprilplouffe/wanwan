// js/heartbeat-live-ai.js — 心动直播 V1.0 角色上下文、真实 AI、Minimax TTS、礼物扣费与记忆写入
(function(global) {
  'use strict';

  var PROGRAMS = {
    chat: { id: 'chat', label: '闲聊直播', icon: '💬', desc: 'Char 以聊天为主，回应弹幕并自然开启话题。', defaultTitle: '今晚来聊聊天 ♡' },
    game: { id: 'game', label: '游戏直播', icon: '🎮', desc: '可开启快问快答或猜词小挑战，Char 实时参与互动。', defaultTitle: '一起来挑战游戏吧！' },
    music: { id: 'music', label: '音乐直播', icon: '🎵', desc: '围绕旋律、点歌与心情的音乐陪伴主题。', defaultTitle: '今晚的音乐时间' },
    radio: { id: 'radio', label: '睡前电台', icon: '📻', desc: '温柔朗读、夜晚来信与轻声话题分享。', defaultTitle: '月光下的睡前电台' },
    asmr: { id: 'asmr', label: 'ASMR', icon: '🎧', desc: '以本地 ASMR 音景为主，Char 保持轻声低打扰陪伴。', defaultTitle: '安静听一会儿声音' },
    study: { id: 'study', label: '云陪伴', icon: '📚', desc: '陪伴学习、加班或做手边小事，温和回应不催促。', defaultTitle: '陪你度过这段时光' },
    special: { id: 'special', label: '特别企划', icon: '✨', desc: '适合纪念日、主题问答与自定义直播企划。', defaultTitle: '只属于今晚的特别企划' }
  };

  var GIFT_CATALOG = [
    { id: 'free_spark', name: '荧光棒心意', icon: '✨', price: 0, free: true, desc: '免费气氛互动 · 不扣金币' },
    { id: 'rose', name: '心动玫瑰', icon: '🌹', price: 10, free: false, desc: '官方金币礼物' },
    { id: 'cake', name: '草莓蛋糕', icon: '🍓', price: 30, free: false, desc: '官方金币礼物' },
    { id: 'meteor', name: '星愿流星', icon: '🌠', price: 88, free: false, desc: '官方金币礼物' },
    { id: 'crown', name: '银河皇冠', icon: '👑', price: 188, free: false, desc: '官方金币礼物' }
  ];

  var DEFAULT_AI_AUDIENCE_NAMES = ['小云朵', '草莓奶昔', '晚风听歌', '月亮值班员', '抹茶团子'];

  function sanitizeText(str, maxLen) {
    var s = String(str == null ? '' : str).replace(/[\u0000-\u001f]+/g, ' ').trim();
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }

  function getCharDisplayName(c) {
    if (!c) return 'Char';
    var h = global._wechatCallHelpers;
    if (h && typeof h.getWechatDisplayName === 'function') {
      var n = h.getWechatDisplayName(c);
      if (n) return n;
    }
    return c.nick || c.name || 'Char';
  }

  function getCharDisplayAvatar(c) {
    if (!c) return '';
    var h = global._wechatCallHelpers;
    if (h && typeof h.getWechatDisplayAvatar === 'function') {
      var a = h.getWechatDisplayAvatar(c);
      if (a) return a;
    }
    return c.avatar || '';
  }

  async function loadAvailableChars() {
    var list = [];
    try {
      if (global.db && global.db.characters) {
        list = await global.db.characters.toArray();
      } else if (global._charCache) {
        list = Object.values(global._charCache);
      }
    } catch (e) {
      console.warn('[HeartbeatLiveAI] load characters failed:', e);
    }
    return list
      .filter(function(c) { return c && (c.type === 'char' || !c.type); })
      .map(function(c) {
        return {
          id: String(c.id),
          rawId: c.id,
          name: getCharDisplayName(c),
          avatar: getCharDisplayAvatar(c),
          emojiFallback: '🌸',
          gender: c.gender || '',
          role: c.role || '',
          status: c.status || '',
          description: c.description || '',
          raw: c
        };
      });
  }

  async function loadCurrentUserProfile() {
    var user = global._wechatUser || null;
    if (!user && global.db && global.db.characters) {
      try {
        var all = await global.db.characters.toArray();
        user = all.find(function(c) { return c && c.type === 'user'; }) || null;
      } catch (_) {}
    }
    var uid = Number(global._wechatUid || (user && user.id) || 0);
    var avatar = (user && user.avatar) || '';
    if (uid && global.db && global.db.config) {
      try {
        var selfRow = await global.db.config.get('wechatSelfProfile_' + uid);
        if (selfRow && selfRow.value && selfRow.value.avatar) {
          avatar = selfRow.value.avatar;
        }
      } catch (_) {}
    }
    return {
      id: uid,
      name: (user && (user.nick || user.name)) || '我',
      avatar: avatar,
      description: (user && user.description) || ''
    };
  }

  async function resolveCharChatInfo(charId) {
    var cidNum = Number(charId);
    var cidStr = String(charId || '');
    var ownerUid = Number(global._wechatUid || 0);
    var chatId = 0;

    try {
      if (global.db && global.db.chats) {
        if (ownerUid && Number.isFinite(cidNum) && cidNum > 0) {
          var direct = await global.db.chats.where('[ownerUid+charId]').equals([ownerUid, cidNum]).first();
          if (direct) chatId = Number(direct.id) || 0;
        }
        if (!chatId) {
          var allChats = await global.db.chats.toArray();
          var matched = allChats.find(function(ch) {
            return ch && String(ch.charId) === cidStr && (!ownerUid || Number(ch.ownerUid) === ownerUid);
          }) || allChats.find(function(ch) { return ch && String(ch.charId) === cidStr; });
          if (matched) {
            chatId = Number(matched.id) || 0;
            if (!ownerUid && matched.ownerUid) ownerUid = Number(matched.ownerUid);
          }
        }
      }
    } catch (e) {
      console.warn('[HeartbeatLiveAI] resolveCharChatInfo error:', e);
    }

    return { ownerUid: ownerUid, chatId: chatId, charId: cidStr };
  }

  async function getMinimaxStatus(charId) {
    var result = {
      apiReady: false,
      voiceId: '',
      voiceSource: '',
      missingReason: ''
    };
    try {
      if (!global.db || !global.db.config) {
        result.missingReason = '数据库未就绪';
        return result;
      }
      var rows = await Promise.all([
        global.db.config.get('minimaxGroupId'),
        global.db.config.get('minimaxApiKey'),
        global.db.config.get('minimaxModel')
      ]);
      var groupId = rows[0] && rows[0].value;
      var apiKey = rows[1] && rows[1].value;
      var model = rows[2] && rows[2].value;
      result.apiReady = Boolean(groupId && apiKey && model);

      if (global.HeartbeatLiveStorage) {
        var customVoices = await global.HeartbeatLiveStorage.loadCharVoices();
        if (customVoices[String(charId)]) {
          result.voiceId = customVoices[String(charId)];
          result.voiceSource = 'live';
        }
      }
      if (!result.voiceId) {
        var info = await resolveCharChatInfo(charId);
        if (info.chatId) {
          var vRow = await global.db.config.get('chatVoiceId_' + info.chatId);
          if (vRow && vRow.value) {
            result.voiceId = String(vRow.value);
            result.voiceSource = 'chat';
          }
        }
      }
      if (!result.apiReady) {
        result.missingReason = 'Minimax 语音 API 未配置（请前往主设置填写 Group ID / API Key / 模型）';
      } else if (!result.voiceId) {
        result.missingReason = '该 Char 尚未设置 Voice ID（可在直播设置或微信聊天设置中填写）';
      }
    } catch (e) {
      result.missingReason = (e && e.message) || '读取语音配置失败';
    }
    return result;
  }

  async function speakCharLine(text, charId, voiceVol) {
    var cleanText = sanitizeText(text, 240);
    if (!cleanText) return { played: false, reason: 'empty' };
    var status = await getMinimaxStatus(charId);
    if (!status.apiReady || !status.voiceId) {
      return { played: false, reason: status.missingReason || 'unconfigured' };
    }
    var h = global._wechatCallHelpers;
    if (!h || typeof h.callMinimaxTTS !== 'function') {
      return { played: false, reason: 'TTS 引擎未加载' };
    }
    var ttsText = cleanText;
    if (typeof h.parseBilingualText === 'function') {
      var parsed = h.parseBilingualText(cleanText);
      if (parsed && parsed.original) ttsText = parsed.original;
    }
    var blobUrl = await h.callMinimaxTTS(ttsText, status.voiceId);
    return {
      played: true,
      blobUrl: blobUrl,
      volume: Math.max(0, Math.min(1, Number(voiceVol == null ? 65 : voiceVol) / 100))
    };
  }

  async function gatherCharContext(charObj, recentLines, settings) {
    var charId = charObj && (charObj.rawId != null ? charObj.rawId : charObj.id);
    var cidNum = Number(charId);
    var chatInfo = await resolveCharChatInfo(charId);
    var recentMsgs = (recentLines || []).slice(-10).map(function(m) {
      return { role: m.senderRole === 'char' ? 'assistant' : 'user', content: m.text || '' };
    });

    var loreCtx = '';
    try {
      if (typeof global.getLorebookContext === 'function') {
        loreCtx = await global.getLorebookContext(Number.isFinite(cidNum) ? cidNum : charId, recentMsgs);
      }
    } catch (_) {}

    var memoryCtx = '';
    try {
      if (chatInfo.chatId && chatInfo.ownerUid && global.WanWanMemory && typeof global.WanWanMemory.getMemoryContext === 'function') {
        memoryCtx = await global.WanWanMemory.getMemoryContext(chatInfo.chatId, Number.isFinite(cidNum) ? cidNum : charId, chatInfo.ownerUid, recentMsgs);
      }
    } catch (_) {}

    var bridgeCtx = '';
    try {
      if (settings && settings.context && global.WanxiangMirrorBridge && typeof global.WanxiangMirrorBridge.buildChatExperienceContext === 'function') {
        var bRes = await global.WanxiangMirrorBridge.buildChatExperienceContext({
          charId: String(charId),
          ownerUid: chatInfo.ownerUid,
          recentMessages: recentMsgs
        });
        if (bRes && bRes.text) bridgeCtx = bRes.text;
      }
    } catch (_) {}

    var bilingual = null;
    try {
      var h = global._wechatCallHelpers;
      if (chatInfo.chatId && h && typeof h.getChatBilingualSettings === 'function') {
        bilingual = await h.getChatBilingualSettings(chatInfo.chatId);
      }
    } catch (_) {}

    return {
      chatInfo: chatInfo,
      loreCtx: loreCtx,
      memoryCtx: memoryCtx,
      bridgeCtx: bridgeCtx,
      bilingual: bilingual
    };
  }

  function buildLiveSystemPrompt(params) {
    var charObj = params.charObj;
    var userObj = params.userObj || { name: '我', description: '' };
    var ctx = params.ctx || {};
    var hostMode = params.hostMode || 'char';
    var programId = params.program || 'chat';
    var progInfo = PROGRAMS[programId] || PROGRAMS.chat;
    var programTitle = params.programTitle || progInfo.defaultTitle;
    var style = params.programStyle || 'natural';
    var expression = (params.settings && params.settings.expression) || 'natural';
    var connectionType = params.connectionType || '';
    var simAudience = Boolean(params.settings && params.settings.sim && hostMode !== 'private');

    var charName = charObj ? charObj.name : 'Char';
    var raw = (charObj && charObj.raw) || {};
    var userName = userObj.name || '我';
    var relationText = '';
    try {
      if (global._wechatCallHelpers && typeof global._wechatCallHelpers.buildCurrentRelationText === 'function') {
        relationText = global._wechatCallHelpers.buildCurrentRelationText(raw) || '';
      }
    } catch (_) {}

    var modeDesc = hostMode === 'user'
      ? ('当前是【User 开播模式】：' + userName + ' 正在作为主播开播，你是特邀前排观众' + (connectionType ? '，并且已经接通了连麦，正在与主播实时同台互动。' : '，会在弹幕区和主播互动。'))
      : hostMode === 'private'
        ? ('当前是【私人双人连线模式】：直播间没有外部公开观众，只有你（' + charName + '）和 ' + userName + ' 两个人。')
        : ('当前是【Char 开播模式】：你（' + charName + '）正在开个人直播，' + userName + (connectionType ? ' 已连麦进入你的直播同台互动。' : ' 正在直播间观看并发送弹幕。'));

    var styleDesc = {
      natural: '保持自然亲切的互动节奏，适时回应和抛话题',
      quiet: '保持轻声、克制、安静陪伴感，不要过于喧闹或催促',
      lively: '保持轻松活泼、有来有往的互动节奏，但依然贴合本角色人设'
    }[style] || '自然互动';

    var expDesc = {
      natural: '情感真实自然',
      calm: '情感克制内敛，不浮夸',
      immersive: '更有临场陪伴氛围与情绪温度'
    }[expression] || '情感真实自然';

    var connDesc = connectionType === 'voice'
      ? '【实时语音连麦中】对方正在用语音和你对话，回复应简短自然、适合口头朗读。'
      : connectionType === 'text'
        ? '【实时文字连麦席位中】对方在连麦席直接对你说，请直接与对方连麦对话。'
        : connectionType === 'video' || connectionType === 'camera'
          ? '【视频同框连线中】双方处于同框画面状态，保持自然眼神与临场感（但不要编造看不到的现实物品）。'
          : '【普通弹幕互动中】从弹幕或互动中看到了对方的消息。';

    var sys = '';
    sys += '你正在「心动直播」中扮演角色「' + charName + '」。用户称呼为「' + userName + '」。\n';
    sys += '请严格忠于角色人设，禁止跳戏或变成通用客服。\n\n';
    sys += '<char_persona>\n';
    if (raw.gender) sys += '- 性别：' + raw.gender + '\n';
    if (raw.role) sys += '- 身份：' + raw.role + '\n';
    if (raw.status) sys += '- 当前状态：' + raw.status + '\n';
    sys += (raw.description || '温柔、有主见的陪伴者，按普通自然逻辑说话。') + '\n';
    if (ctx.loreCtx) sys += '\n【世界观设定参考】\n' + ctx.loreCtx + '\n';
    sys += '</char_persona>\n\n';

    if (userObj.description || relationText) {
      sys += '<user_context>\n';
      if (userObj.description) sys += '用户设定：' + userObj.description + '\n';
      if (relationText) sys += '你们的关系：' + relationText + '\n';
      sys += '</user_context>\n\n';
    }

    if (ctx.memoryCtx) {
      sys += '<long_term_memories>\n以下为真实长期记忆，可自然流露，不要生硬背诵：\n' + ctx.memoryCtx + '\n</long_term_memories>\n\n';
    }
    if (ctx.bridgeCtx) {
      sys += '<shared_town_experiences>\n' + ctx.bridgeCtx + '\n</shared_town_experiences>\n\n';
    }

    sys += '<live_room_state>\n';
    sys += '- 直播模式：' + modeDesc + '\n';
    sys += '- 当前节目：' + progInfo.label + '（标题：「' + programTitle + '」）\n';
    sys += '- 连麦状态：' + connDesc + '\n';
    sys += '- 互动节奏与风格：' + styleDesc + '；' + expDesc + '\n';
    if (programId === 'asmr') {
      sys += '- 【ASMR 特别提醒】正在播放本地环境音景，请保持极短、轻柔、低打扰的话语，不打断声音氛围。\n';
    }
    if (params.cameraActive) {
      sys += '- 对方已开启本地摄像头预览；请保持自然陪伴，不要伪造看到了具体衣物或隐私细节。\n';
    }
    sys += '</live_room_state>\n\n';

    if (ctx.bilingual && ctx.bilingual.enabled && global._wechatCallHelpers) {
      var h = global._wechatCallHelpers;
      var srcLabel = (h.getChatBilingualLangLabel && h.getChatBilingualLangLabel(ctx.bilingual.sourceLang)) || ctx.bilingual.sourceLang;
      var tgtLabel = (h.getChatBilingualLangLabel && h.getChatBilingualLangLabel(ctx.bilingual.targetLang)) || ctx.bilingual.targetLang;
      if (srcLabel) {
        sys += '【双语规则】如需说外语请使用' + srcLabel + '并附「' + tgtLabel + '翻译」；说中文则正常输出中文。\n\n';
      }
    }

    sys += '【输出格式要求】\n';
    sys += '请严格只输出一个合法 JSON 对象，不要包含 Markdown 代码块或多余解释：\n';
    if (simAudience) {
      sys += '{"speech":"Char的1~3句口语回应（贴合当前直播或连麦情境）","audience":"可选，0或1条简短直播间气氛弹幕（不超过16字，不带用户名，无必要可留空字符串）"}\n';
    } else {
      sys += '{"speech":"Char的1~3句口语回应（贴合当前直播或连麦情境）"}\n';
    }
    return sys;
  }

  function parseLiveAiResponse(rawText) {
    var text = String(rawText || '').trim();
    if (!text) return { speech: '', audience: '' };
    var stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    var jsonCandidate = stripped;
    var firstBrace = stripped.indexOf('{');
    var lastBrace = stripped.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonCandidate = stripped.slice(firstBrace, lastBrace + 1);
    }
    try {
      var obj = JSON.parse(jsonCandidate);
      if (obj && typeof obj === 'object') {
        return {
          speech: sanitizeText(obj.speech || obj.reply || obj.text || '', 300),
          audience: sanitizeText(obj.audience || '', 40)
        };
      }
    } catch (_) {}
    return {
      speech: sanitizeText(stripped.replace(/^["']|["']$/g, ''), 300),
      audience: ''
    };
  }

  function buildOfflineFallbackReply(params) {
    var charName = params.charObj ? params.charObj.name : 'Char';
    var prog = PROGRAMS[params.program] || PROGRAMS.chat;
    var trigger = params.triggerType || 'chat';
    if (trigger === 'gift') {
      return {
        speech: '谢谢你的「' + (params.giftName || '礼物') + '」，收到啦！',
        audience: '',
        offline: true
      };
    }
    if (trigger === 'program_switch') {
      return {
        speech: '好呀，那我们现在一起进入「' + prog.label + '」吧。',
        audience: '',
        offline: true
      };
    }
    if (params.program === 'asmr') {
      return { speech: '嘘……我在旁边陪你一起听。', audience: '', offline: true };
    }
    if (params.connectionType) {
      return {
        speech: '我在听呢（当前未连接主 AI 接口，已由本地角色陪伴回应：' + charName + ' 正在连麦中）。',
        audience: '',
        offline: true
      };
    }
    return {
      speech: '看到你的消息啦（当前未配置 AI 接口，已启用本地离线陪伴提示）。',
      audience: '',
      offline: true
    };
  }

  async function generateCharLiveReply(params) {
    var charObj = params.charObj;
    if (!charObj || !charObj.id) {
      return { speech: '', audience: '', noChar: true };
    }
    var userObj = params.userObj;
    var recentLines = params.recentLines || [];
    var settings = params.settings || {};

    if (typeof global.callAI !== 'function') {
      return buildOfflineFallbackReply(params);
    }

    var ctx = await gatherCharContext(charObj, recentLines, settings);
    if (typeof params.isStale === 'function' && params.isStale()) {
      return { stale: true };
    }

    var systemPrompt = buildLiveSystemPrompt(Object.assign({}, params, { ctx: ctx }));

    var historyMsgs = recentLines.slice(-12).map(function(item) {
      if (item.senderRole === 'char') {
        return { role: 'assistant', content: item.text };
      }
      var prefix = item.senderRole === 'user_cohost'
        ? '[连麦发言] '
        : item.senderRole === 'ai_audience'
          ? '[观众弹幕] '
          : item.senderRole === 'system'
            ? '[直播间事件] '
            : '[弹幕] ';
      return { role: 'user', content: prefix + item.sender + '：' + item.text };
    });

    if (params.userPrompt) {
      historyMsgs.push({ role: 'user', content: params.userPrompt });
    }

    try {
      var raw = await global.callAI(historyMsgs, {
        system: systemPrompt,
        temperature: params.program === 'asmr' ? 0.6 : 0.85
      });
      if (typeof params.isStale === 'function' && params.isStale()) {
        return { stale: true };
      }
      var parsed = parseLiveAiResponse(raw);
      if (!parsed.speech) {
        return buildOfflineFallbackReply(params);
      }
      return {
        speech: parsed.speech,
        audience: (settings.sim && params.hostMode !== 'private') ? parsed.audience : '',
        offline: false
      };
    } catch (err) {
      if (typeof params.isStale === 'function' && params.isStale()) {
        return { stale: true };
      }
      var errMsg = (err && err.message) || String(err || '');
      var fb = buildOfflineFallbackReply(params);
      fb.error = errMsg;
      return fb;
    }
  }

  function pickAudienceName() {
    return DEFAULT_AI_AUDIENCE_NAMES[Math.floor(Math.random() * DEFAULT_AI_AUDIENCE_NAMES.length)];
  }

  async function sendGiftTransaction(params) {
    var gift = params.gift;
    var charObj = params.charObj;
    if (!gift) return { ok: false, msg: '未选择礼物' };
    if (gift.free || !gift.price || gift.price <= 0) {
      return { ok: true, free: true, coinsSpent: 0 };
    }
    if (!charObj || !charObj.id) {
      return { ok: false, msg: '当前未邀请 Char，请先邀请 Char 后再送出金币礼物' };
    }
    var eco = global.SharedEconomyService;
    if (!eco || typeof eco.spendCoins !== 'function') {
      return { ok: false, msg: '共享经济系统未就绪，暂时无法扣费送礼' };
    }
    var charName = getCharDisplayName(charObj);
    var res = await eco.spendCoins(
      Number(gift.price),
      '心动直播礼物 · ' + gift.name + '（送给 ' + charName + '）',
      'heartbeatLive'
    );
    if (!res || !res.success) {
      return { ok: false, msg: (res && res.msg) || '金币余额不足' };
    }
    return {
      ok: true,
      free: false,
      coinsSpent: Number(gift.price),
      remaining: res.remaining
    };
  }

  async function getEconomyBalance() {
    try {
      if (global.SharedEconomyService && typeof global.SharedEconomyService.getState === 'function') {
        var st = await global.SharedEconomyService.getState();
        return Number(st && st.coins) || 0;
      }
    } catch (_) {}
    return null;
  }

  function buildJournalDraft(session) {
    var prog = PROGRAMS[session.program] || PROGRAMS.chat;
    var hasChar = Boolean(session.charId);
    var charName = hasChar ? (session.charName || 'Char') : '个人直播间';
    var dateStr = new Date(session.startedAt || Date.now()).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    var modeText = session.hostMode === 'user'
      ? (hasChar ? ('我开播、' + charName + ' 来看我') : '我独自开启的个人直播')
      : session.hostMode === 'private'
        ? ('与 ' + charName + ' 的私人连线')
        : (charName + ' 的直播间');
    var extras = [];
    if (session.cohostUsed) extras.push('开启了连麦同框');
    if (session.asmrUsed) extras.push('伴随了 ASMR 音景');
    if (session.giftsTotalCoins > 0) extras.push('送出 ' + session.giftsTotalCoins + ' 金币心意礼物');
    var mins = Math.max(1, Math.round(((session.endedAt || Date.now()) - (session.startedAt || Date.now())) / 60000));
    var title = sanitizeText(dateStr + '·' + (hasChar ? (charName + '的') : '我的') + prog.label, 30);
    var content = sanitizeText(
      dateStr + ' 进行了约 ' + mins + ' 分钟「' + (session.title || prog.label) + '」（' + modeText + '），共互动 ' + (session.msgCount || 0) + ' 条消息' +
      (extras.length ? '，期间' + extras.join('、') : '') + '。',
      150
    );
    return {
      title: title,
      content: content,
      keywords: ['心动直播', prog.label, hasChar ? charName : '个人开播'].filter(Boolean)
    };
  }

  async function saveJournalToLongMemory(params) {
    var journal = params.journal;
    if (!journal || !journal.charId) {
      return { ok: false, error: '缺少角色标识，无法写入长期记忆' };
    }
    if (!global.db || !global.db.memories) {
      return { ok: false, error: '长期记忆数据库未就绪' };
    }
    var info = await resolveCharChatInfo(journal.charId);
    if (!info.ownerUid || !info.chatId) {
      return { ok: false, error: '该角色暂无微信私聊会话，请先在微信开启与 Ta 的聊天后再保存到长期记忆' };
    }

    var title = sanitizeText(params.title || journal.title, 30);
    var content = sanitizeText(params.content || journal.summary, 150);
    if (!content) return { ok: false, error: '记忆摘要内容不能为空' };

    // 防重复检查
    var existingRows = await global.db.memories.toArray();
    var dup = existingRows.find(function(m) {
      return m && m.sourceType === 'heartbeat_live' && String(m.sourceEventId || '') === String(journal.id);
    });
    if (dup) {
      if (global.HeartbeatLiveStorage) {
        await global.HeartbeatLiveStorage.markJournalMemorySaved(journal.id, dup.id);
      }
      return { ok: true, duplicate: true, memoryId: dup.id, memory: dup };
    }

    var now = Date.now();
    var keywords = Array.isArray(params.keywords)
      ? params.keywords.map(function(k) { return sanitizeText(k, 16); }).filter(Boolean).slice(0, 8)
      : ['心动直播', journal.programLabel || '直播', journal.charName || ''].filter(Boolean);

    var row = {
      ownerUid: Number(info.ownerUid),
      charId: Number(journal.charId) || journal.charId,
      chatId: Number(info.chatId),
      title: title,
      content: content,
      keywords: keywords,
      valence: 0.4,
      arousal: 0.4,
      importance: 6,
      embedding: null,
      status: 'active',
      sourceMsgStartId: null,
      sourceMsgEndId: null,
      sourceType: 'heartbeat_live',
      sourceEventId: String(journal.id),
      sourceAt: Number(journal.startedAt) || now,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: null,
      accessCount: 0
    };

    var newId = await global.db.memories.add(row);
    row.id = newId;
    if (global.HeartbeatLiveStorage) {
      await global.HeartbeatLiveStorage.markJournalMemorySaved(journal.id, newId);
    }
    return { ok: true, duplicate: false, memoryId: newId, memory: row };
  }

  global.HeartbeatLiveAI = {
    PROGRAMS: PROGRAMS,
    GIFT_CATALOG: GIFT_CATALOG,
    loadAvailableChars: loadAvailableChars,
    loadCurrentUserProfile: loadCurrentUserProfile,
    resolveCharChatInfo: resolveCharChatInfo,
    getMinimaxStatus: getMinimaxStatus,
    speakCharLine: speakCharLine,
    generateCharLiveReply: generateCharLiveReply,
    parseLiveAiResponse: parseLiveAiResponse,
    pickAudienceName: pickAudienceName,
    sendGiftTransaction: sendGiftTransaction,
    getEconomyBalance: getEconomyBalance,
    buildJournalDraft: buildJournalDraft,
    saveJournalToLongMemory: saveJournalToLongMemory
  };
})(typeof window !== 'undefined' ? window : globalThis);
