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

  function normalizeParticipantRecord(c) {
    if (!c) return null;
    var roleType = c.type === 'npc' ? 'npc' : 'char';
    return {
      id: String(c.id),
      rawId: c.id,
      roleType: roleType,
      name: getCharDisplayName(c),
      avatar: getCharDisplayAvatar(c),
      emojiFallback: roleType === 'npc' ? '🎭' : '🌸',
      gender: c.gender || '',
      role: c.role || '',
      group: c.group || '',
      status: c.status || '',
      description: c.description || '',
      raw: c
    };
  }

  async function loadAllCharactersRaw() {
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
    return Array.isArray(list) ? list : [];
  }

  function isValidParticipantRaw(c) {
    if (!c || c.id == null || c.id === '') return false;
    if (c.type === 'user') return false;
    var label = String(c.nick || c.name || '').trim();
    return Boolean(label);
  }

  async function loadAvailableChars() {
    var list = await loadAllCharactersRaw();
    return list
      .filter(function(c) { return isValidParticipantRaw(c) && (c.type === 'char' || !c.type); })
      .map(normalizeParticipantRecord)
      .filter(Boolean);
  }

  async function loadAvailableNpcs() {
    var list = await loadAllCharactersRaw();
    return list
      .filter(function(c) { return isValidParticipantRaw(c) && c.type === 'npc'; })
      .map(normalizeParticipantRecord)
      .filter(Boolean);
  }

  async function loadAvailableInvitees() {
    var list = await loadAllCharactersRaw();
    return list
      .filter(function(c) { return isValidParticipantRaw(c) && (c.type === 'char' || c.type === 'npc' || !c.type); })
      .map(normalizeParticipantRecord)
      .filter(Boolean);
  }

  async function verifyParticipantExists(participantId) {
    var pid = String(participantId || '');
    if (!pid) return { exists: false, record: null };
    if (pid === 'demo_char') return { exists: true, record: null };
    try {
      var list = await loadAllCharactersRaw();
      if (!global.db || !global.db.characters) {
        if (!list.length) return { exists: true, record: null };
      }
      var match = list.find(function(c) { return isValidParticipantRaw(c) && String(c.id) === pid; });
      return { exists: Boolean(match), record: match ? normalizeParticipantRecord(match) : null };
    } catch (_) {
      return { exists: true, record: null };
    }
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

  function normalizeActorRef(actorOrId, opts) {
    opts = opts || {};
    if (actorOrId && typeof actorOrId === 'object') {
      return {
        id: String(actorOrId.id != null ? actorOrId.id : (actorOrId.rawId != null ? actorOrId.rawId : '')),
        roleType: (actorOrId.roleType === 'npc' || (actorOrId.raw && actorOrId.raw.type === 'npc') || opts.roleType === 'npc') ? 'npc' : 'char'
      };
    }
    return {
      id: String(actorOrId == null ? '' : actorOrId),
      roleType: opts.roleType === 'npc' ? 'npc' : 'char'
    };
  }

  async function resolveLiveDefaultProvider(opts) {
    opts = opts || {};
    if (opts.liveDefaultProvider === 'minimax' || opts.liveDefaultProvider === 'fish_audio') {
      return opts.liveDefaultProvider;
    }
    try {
      if (global.HeartbeatLiveStorage && typeof global.HeartbeatLiveStorage.loadSettings === 'function') {
        var liveSettings = await global.HeartbeatLiveStorage.loadSettings();
        if (liveSettings && (liveSettings.ttsProvider === 'minimax' || liveSettings.ttsProvider === 'fish_audio')) {
          return liveSettings.ttsProvider;
        }
      }
    } catch (_) {}
    if (global.WanWanTTS && typeof global.WanWanTTS.getGlobalDefaultProvider === 'function') {
      return global.WanWanTTS.getGlobalDefaultProvider();
    }
    try {
      if (global.db && global.db.config) {
        var row = await global.db.config.get('defaultTtsProvider');
        if (row && row.value === 'fish_audio') return 'fish_audio';
      }
    } catch (_) {}
    return 'minimax';
  }

  async function readProviderApiStatus(provider) {
    var p = provider === 'fish_audio' ? 'fish_audio' : 'minimax';
    if (global.WanWanTTS && typeof global.WanWanTTS.getProviderCredentialStatus === 'function') {
      return global.WanWanTTS.getProviderCredentialStatus(p);
    }
    if (!global.db || !global.db.config) {
      return { provider: p, label: p === 'fish_audio' ? 'Fish Audio' : 'Minimax', apiReady: false, missingReason: '数据库未就绪' };
    }
    if (p === 'fish_audio') {
      var fRows = await Promise.all([
        global.db.config.get('fishAudioAuthMode'),
        global.db.config.get('fishAudioModel'),
        global.db.config.get('fishAudioApiKeyEnc'),
        global.db.config.get('fishAudioApiKey')
      ]);
      var authMode = (fRows[0] && fRows[0].value) || 'server_managed';
      var fModel = (fRows[1] && fRows[1].value) || 's2.1-pro';
      var hasPersonal = Boolean((fRows[2] && fRows[2].value && fRows[2].value.cipher) || (fRows[3] && fRows[3].value));
      var fReady = authMode === 'byok_session' ? Boolean(hasPersonal && fModel) : Boolean(fModel);
      return {
        provider: 'fish_audio',
        label: 'Fish Audio',
        apiReady: fReady,
        model: fModel,
        missingReason: fReady ? '' : 'Fish Audio 代理未就绪（请前往系统设置检查代理地址或个人密钥）'
      };
    }
    var rows = await Promise.all([
      global.db.config.get('minimaxGroupId'),
      global.db.config.get('minimaxApiKey'),
      global.db.config.get('minimaxModel')
    ]);
    var mReady = Boolean(rows[0] && rows[0].value && rows[1] && rows[1].value && rows[2] && rows[2].value);
    return {
      provider: 'minimax',
      label: 'Minimax',
      apiReady: mReady,
      model: (rows[2] && rows[2].value) || '',
      missingReason: mReady ? '' : 'Minimax 语音 API 未配置（请前往系统设置填写 Group ID / API Key / 模型）'
    };
  }

  // 严格隔离：心动直播（Char 与 NPC）绝不读取微信单聊 chatVoiceId_* / chatFishVoiceId_* / chatTtsProvider_*
  async function getLiveTtsStatus(actorOrId, opts) {
    opts = opts || {};
    var actor = normalizeActorRef(actorOrId, opts);
    var result = {
      roleId: actor.id,
      roleType: actor.roleType,
      provider: 'minimax',
      providerLabel: 'Minimax',
      savedProvider: 'default',
      apiReady: false,
      voiceId: '',
      minimaxVoiceId: '',
      fishReferenceId: '',
      voiceSource: '',
      missingReason: ''
    };
    try {
      if (!global.db || !global.db.config) {
        result.missingReason = '数据库未就绪';
        return result;
      }

      var roleCfg = { provider: 'default', minimaxVoiceId: '', fishReferenceId: '', roleType: actor.roleType };
      if (opts.voiceConfigOverride && typeof opts.voiceConfigOverride === 'object') {
        roleCfg = Object.assign({}, roleCfg, opts.voiceConfigOverride);
      } else if (global.HeartbeatLiveStorage && typeof global.HeartbeatLiveStorage.getRoleVoiceConfig === 'function') {
        roleCfg = await global.HeartbeatLiveStorage.getRoleVoiceConfig(actor.id, actor.roleType);
      }

      result.savedProvider = roleCfg.provider || 'default';
      result.minimaxVoiceId = String(roleCfg.minimaxVoiceId || '').trim();
      result.fishReferenceId = String(roleCfg.fishReferenceId || '').trim();

      var effectiveProvider;
      if (opts.providerOverride === 'minimax' || opts.providerOverride === 'fish_audio') {
        effectiveProvider = opts.providerOverride;
      } else if (roleCfg.provider === 'minimax' || roleCfg.provider === 'fish_audio') {
        effectiveProvider = roleCfg.provider;
      } else {
        effectiveProvider = await resolveLiveDefaultProvider(opts);
      }

      result.provider = effectiveProvider;
      result.providerLabel = effectiveProvider === 'fish_audio' ? 'Fish Audio' : 'Minimax';
      result.voiceId = effectiveProvider === 'fish_audio' ? result.fishReferenceId : result.minimaxVoiceId;
      result.voiceSource = result.voiceId ? 'live' : '';

      var credStatus = await readProviderApiStatus(effectiveProvider);
      result.apiReady = Boolean(credStatus && credStatus.apiReady);

      if (!result.apiReady) {
        result.missingReason = credStatus.missingReason || (result.providerLabel + ' API 未配置');
      } else if (!result.voiceId) {
        var roleLabel = actor.roleType === 'npc' ? '该 NPC' : '该 Char';
        var idLabel = effectiveProvider === 'fish_audio' ? 'Fish Audio Reference ID' : 'Minimax Voice ID';
        result.missingReason = roleLabel + ' 尚未设置直播专属 ' + idLabel + '（与微信聊天独立，不自动复用微信音色）';
      }
    } catch (e) {
      result.missingReason = (e && e.message) || '读取语音配置失败';
    }
    return result;
  }

  async function getMinimaxStatus(charId, opts) {
    return getLiveTtsStatus(charId, opts);
  }

  async function synthesizeLiveSpeech(status, ttsText) {
    if (global.WanWanTTS && typeof global.WanWanTTS.synthesize === 'function') {
      return global.WanWanTTS.synthesize({
        provider: status.provider,
        text: ttsText,
        voiceId: status.voiceId,
        referenceId: status.voiceId
      });
    }
    var h = global._wechatCallHelpers;
    if (status.provider === 'minimax' && h && typeof h.callMinimaxTTS === 'function') {
      var mmUrl = await h.callMinimaxTTS(ttsText, status.voiceId);
      return { provider: 'minimax', blobUrl: mmUrl, mimeType: 'audio/mpeg' };
    }
    throw new Error(status.providerLabel + ' TTS 引擎未加载');
  }

  async function speakCharLine(text, actorOrId, voiceVol, opts) {
    opts = opts || {};
    var cleanText = sanitizeText(text, 240);
    if (!cleanText) return { played: false, reason: 'empty' };
    var actor = normalizeActorRef(actorOrId, opts);
    var status = await getLiveTtsStatus(actor, opts);
    if (!status.apiReady || !status.voiceId) {
      return {
        played: false,
        provider: status.provider,
        providerLabel: status.providerLabel,
        reason: status.missingReason || 'unconfigured'
      };
    }

    var ttsText = cleanText;
    // NPC 严格隔离，不使用 Char 的微信双语规则；仅 Char 可安全剥离双语译文只读原句
    if (actor.roleType !== 'npc') {
      var h = global._wechatCallHelpers;
      if (h && typeof h.parseBilingualText === 'function') {
        var parsed = h.parseBilingualText(cleanText);
        if (parsed && parsed.original) ttsText = parsed.original;
      }
    }

    try {
      var synth = await synthesizeLiveSpeech(status, ttsText);
      return {
        played: true,
        provider: synth.provider || status.provider,
        providerLabel: status.providerLabel,
        blobUrl: synth.blobUrl,
        volume: Math.max(0, Math.min(1, Number(voiceVol == null ? 65 : voiceVol) / 100))
      };
    } catch (e) {
      var rawErr = (e && e.message) || '语音合成失败';
      var safeErr = (global.WanWanTTS && typeof global.WanWanTTS.redactSecrets === 'function')
        ? global.WanWanTTS.redactSecrets(rawErr)
        : rawErr;
      return {
        played: false,
        failed: true,
        errorCode: (e && e.code) || '',
        provider: status.provider,
        providerLabel: status.providerLabel,
        reason: safeErr
      };
    }
  }

  async function previewRoleVoiceLine(params) {
    params = params || {};
    var roleType = params.roleType === 'npc' ? 'npc' : 'char';
    var roleName = sanitizeText(params.roleName || (roleType === 'npc' ? 'NPC' : 'Char'), 32);
    var sampleText = sanitizeText(params.text, 180) || ('你好，我是' + roleName + '，这是心动直播的专属音色试听。');
    var providerOverride = (params.provider === 'minimax' || params.provider === 'fish_audio') ? params.provider : '';
    var status = await getLiveTtsStatus(
      { id: params.roleId || 'preview', roleType: roleType },
      {
        providerOverride: providerOverride,
        voiceConfigOverride: {
          provider: params.provider || 'default',
          minimaxVoiceId: params.minimaxVoiceId || '',
          fishReferenceId: params.fishReferenceId || '',
          roleType: roleType
        }
      }
    );
    if (!status.apiReady || !status.voiceId) {
      return {
        ok: false,
        provider: status.provider,
        providerLabel: status.providerLabel,
        reason: status.missingReason || '未配置音色或 API'
      };
    }
    try {
      var synth = await synthesizeLiveSpeech(status, sampleText);
      return {
        ok: true,
        provider: synth.provider || status.provider,
        providerLabel: status.providerLabel,
        blobUrl: synth.blobUrl,
        volume: Math.max(0, Math.min(1, Number(params.voiceVol == null ? 65 : params.voiceVol) / 100))
      };
    } catch (e) {
      var rawPreviewErr = (e && e.message) || '试听请求失败';
      var safePreviewErr = (global.WanWanTTS && typeof global.WanWanTTS.redactSecrets === 'function')
        ? global.WanWanTTS.redactSecrets(rawPreviewErr)
        : rawPreviewErr;
      return {
        ok: false,
        errorCode: (e && e.code) || '',
        provider: status.provider,
        providerLabel: status.providerLabel,
        reason: safePreviewErr
      };
    }
  }

  async function gatherCharContext(charObj, recentLines, settings) {
    var charId = charObj && (charObj.rawId != null ? charObj.rawId : charObj.id);
    var cidNum = Number(charId);
    var isNpc = Boolean(charObj && (charObj.roleType === 'npc' || (charObj.raw && charObj.raw.type === 'npc')));
    var recentMsgs = (recentLines || []).slice(-10).map(function(m) {
      var isSelf = (m.senderRole === 'char' || m.senderRole === 'npc') && (!m.senderId || String(m.senderId) === String(charId));
      return { role: isSelf ? 'assistant' : 'user', content: m.text || '' };
    });

    // NPC 严格隔离：绝不读取 Char 的私聊记忆（WanWanMemory）、万象镜经历桥梁（WanxiangMirrorBridge）或其他角色私密配置
    if (isNpc) {
      var npcLoreCtx = '';
      try {
        if (typeof global.getLorebookContext === 'function') {
          npcLoreCtx = await global.getLorebookContext(Number.isFinite(cidNum) ? cidNum : charId, recentMsgs);
        }
      } catch (_) {}
      return {
        isNpc: true,
        chatInfo: { ownerUid: Number(global._wechatUid || 0), chatId: 0, charId: String(charId || '') },
        loreCtx: npcLoreCtx || '',
        memoryCtx: '',
        bridgeCtx: '',
        bilingual: null
      };
    }

    var chatInfo = await resolveCharChatInfo(charId);

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
      isNpc: false,
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
    var hostType = params.hostType || (hostMode === 'user' ? 'user' : hostMode === 'npc' ? 'npc' : 'char');
    var actorIdStr = charObj && charObj.id != null ? String(charObj.id) : '';
    var hostIdStr = params.hostId != null ? String(params.hostId) : actorIdStr;
    var isCurrentHost = hostMode !== 'user' && actorIdStr && hostIdStr && actorIdStr === hostIdStr;
    var programId = params.program || 'chat';
    var progInfo = PROGRAMS[programId] || PROGRAMS.chat;
    var programTitle = params.programTitle || progInfo.defaultTitle;
    var style = params.programStyle || 'natural';
    var expression = (params.settings && params.settings.expression) || 'natural';
    var connectionType = params.connectionType || '';
    var isCohost = params.isCohost !== undefined ? Boolean(params.isCohost) : Boolean(connectionType);
    var simAudience = Boolean(params.settings && params.settings.sim && hostMode !== 'private');
    var isNpc = Boolean(ctx.isNpc || (charObj && (charObj.roleType === 'npc' || (charObj.raw && charObj.raw.type === 'npc'))));

    var charName = charObj ? charObj.name : (isNpc ? 'NPC' : 'Char');
    var hostNameLabel = params.hostName || charName;
    var raw = (charObj && charObj.raw) || {};
    var userName = userObj.name || '我';
    var relationText = '';
    try {
      if (!isNpc && global._wechatCallHelpers && typeof global._wechatCallHelpers.buildCurrentRelationText === 'function') {
        relationText = global._wechatCallHelpers.buildCurrentRelationText(raw) || '';
      }
    } catch (_) {}

    var companions = Array.isArray(params.companionNames) ? params.companionNames.filter(Boolean) : [];
    var companionLine = companions.length
      ? ('当前直播间还有其他同场成员：' + companions.join('、') + '（各有独立身份，请勿替他人发言或混淆彼此经历）。')
      : '';

    var modeDesc = '';
    if (hostMode === 'user') {
      modeDesc = '当前是【User 开播模式】：' + userName + ' 正在作为主播开播，你是受邀前排观众' +
        (isNpc ? '（NPC 嘉宾）' : '（Char 嘉宾）') +
        (isCohost && connectionType
          ? '，并且你已上麦连线，正在与主播实时同台互动。'
          : '，目前在观众席弹幕区观看并与主播互动，请勿自称是本场主播或已经上麦。');
    } else if (hostMode === 'private') {
      modeDesc = '当前是【私人双人连线模式】：直播间没有外部公开观众，只有你（' + charName + '）和 ' + userName + ' 两个人。';
    } else if (!isCurrentHost) {
      modeDesc = '当前是【' + (hostType === 'npc' ? 'NPC 主播' : 'Char 主播') + '直播间】：' +
        (hostType === 'npc' ? 'NPC 主播「' : 'Char 主播「') + hostNameLabel + '」正在主导开播，你是受邀进入观众席的' +
        (isNpc ? ' NPC 嘉宾' : ' Char 嘉宾') + '（请坚守自己的观众嘉宾身份，不要抢占主播身份）。';
    } else if (hostType === 'npc' || hostMode === 'npc' || isNpc) {
      modeDesc = '当前是【NPC 独立开播模式】：你（' + charName + '）作为独立 NPC 主播正在开启自己的直播间，' +
        userName + (connectionType ? ' 已连麦进入你的直播同台互动。' : ' 正在你的直播间观看并发送弹幕。请严格使用你自己的 NPC 人设回应，不得冒充其他 Char。');
    } else {
      modeDesc = '当前是【Char 开播模式】：你（' + charName + '）正在开个人直播，' +
        userName + (connectionType ? ' 已连麦进入你的直播同台互动。' : ' 正在直播间观看并发送弹幕。');
    }

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

    var connDesc = !isCohost || !connectionType
      ? '【普通弹幕观众互动中】从弹幕或直播互动中看到了主播/大家的动态。'
      : connectionType === 'voice'
        ? '【实时语音连麦中】对方正在用语音和你对话，回复应简短自然、适合口头朗读。'
        : connectionType === 'text'
          ? '【实时文字连麦席位中】对方在连麦席直接对你说，请直接与对方连麦对话。'
          : (connectionType === 'video' || connectionType === 'camera')
            ? '【视频同框连线中】双方处于同框画面状态，保持自然眼神与临场感（但不要编造看不到的现实物品）。'
            : '【普通弹幕互动中】从弹幕或互动中看到了对方的消息。';

    var sys = '';
    sys += '你正在「心动直播」中扮演' + (isNpc ? ' NPC 角色「' : '角色「') + charName + '」。用户称呼为「' + userName + '」。\n';
    sys += '请严格忠于本角色自身人设，只以「' + charName + '」第一人称口吻回复，禁止代他人说话、跳戏或变成通用客服。\n\n';
    sys += isNpc ? '<npc_persona>\n' : '<char_persona>\n';
    if (raw.gender) sys += '- 性别：' + raw.gender + '\n';
    if (raw.role) sys += '- 身份：' + raw.role + '\n';
    if (raw.group) sys += '- 所属分组：' + raw.group + '\n';
    if (raw.status) sys += '- 当前状态：' + raw.status + '\n';
    sys += (raw.description || (isNpc ? '贴合自己 NPC 身份的自然直播观众。' : '温柔、有主见的陪伴者，按普通自然逻辑说话。')) + '\n';
    if (ctx.loreCtx) sys += '\n【世界观设定参考】\n' + ctx.loreCtx + '\n';
    sys += isNpc ? '</npc_persona>\n\n' : '</char_persona>\n\n';

    if (userObj.description || relationText) {
      sys += '<user_context>\n';
      if (userObj.description) sys += '主播/用户设定：' + userObj.description + '\n';
      if (relationText) sys += '你们的关系：' + relationText + '\n';
      sys += '</user_context>\n\n';
    }

    if (!isNpc && ctx.memoryCtx) {
      sys += '<long_term_memories>\n以下为真实长期记忆（仅属于你和用户，不可泄露给其他角色），可自然流露，不要生硬背诵：\n' + ctx.memoryCtx + '\n</long_term_memories>\n\n';
    }
    if (!isNpc && ctx.bridgeCtx) {
      sys += '<shared_town_experiences>\n' + ctx.bridgeCtx + '\n</shared_town_experiences>\n\n';
    }

    sys += '<live_room_state>\n';
    sys += '- 直播模式：' + modeDesc + '\n';
    if (companionLine) sys += '- 同场成员：' + companionLine + '\n';
    sys += '- 当前节目：' + progInfo.label + '（标题：「' + programTitle + '」）\n';
    sys += '- 连麦状态：' + connDesc + '\n';
    sys += '- 互动节奏与风格：' + styleDesc + '；' + expDesc + '\n';
    if (programId === 'asmr') {
      sys += '- 【ASMR 特别提醒】正在播放本地环境音景，请保持极短、轻柔、低打扰的话语，不打断声音氛围。\n';
    }
    if (params.cameraActive && isCohost) {
      sys += '- 对方已开启本地摄像头预览；请保持自然陪伴，不要伪造看到了具体衣物或隐私细节。\n';
    }
    sys += '</live_room_state>\n\n';

    if (!isNpc && ctx.bilingual && ctx.bilingual.enabled && global._wechatCallHelpers) {
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
      sys += '{"speech":"' + charName + '的1~3句口语回应（贴合当前直播或连麦情境）","audience":"可选，0或1条简短直播间气氛弹幕（不超过16字，不带用户名，无必要可留空字符串）"}\n';
    } else {
      sys += '{"speech":"' + charName + '的1~3句口语回应（贴合当前直播或连麦情境）"}\n';
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
    var actorId = String(charObj.id);
    var existCheck = await verifyParticipantExists(actorId);
    if (!existCheck.exists) {
      return { stale: true, deleted: true };
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
      var isSelfTurn = (item.senderRole === 'char' || item.senderRole === 'npc') &&
        (!item.senderId || String(item.senderId) === actorId);
      if (isSelfTurn) {
        return { role: 'assistant', content: item.text };
      }
      var prefix = item.senderRole === 'user_cohost'
        ? '[连麦发言] '
        : item.senderRole === 'npc'
          ? '[NPC观众] '
          : item.senderRole === 'char'
            ? '[同场Char] '
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
      var postExist = await verifyParticipantExists(actorId);
      if (!postExist.exists) {
        return { stale: true, deleted: true };
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
    var invitedList = Array.isArray(session.invitedParticipants) ? session.invitedParticipants : [];
    var isNpcHost = session.hostType === 'npc' || session.hostMode === 'npc';
    var hostName = session.hostName || session.charName || (invitedList[0] && invitedList[0].name) || '个人直播间';
    var hasChar = Boolean(session.charId || invitedList.length || isNpcHost);
    var charName = isNpcHost
      ? hostName
      : (invitedList.length > 1
          ? invitedList.map(function(p) { return p.name; }).slice(0, 3).join('、') + (invitedList.length > 3 ? ' 等 ' + invitedList.length + ' 人' : '')
          : (hasChar ? (session.charName || (invitedList[0] && invitedList[0].name) || '嘉宾') : '个人直播间'));
    var dateStr = new Date(session.startedAt || Date.now()).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    var modeText = session.hostMode === 'user'
      ? (invitedList.length ? ('我开播、邀请了 ' + charName + ' 观看陪伴') : '我独自开启的个人直播')
      : session.hostMode === 'private'
        ? ('与 ' + charName + ' 的私人连线')
        : isNpcHost
          ? (charName + '（NPC 主播）的直播间' + (invitedList.length > 1 ? '（同场嘉宾 ' + invitedList.length + ' 人）' : ''))
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
      keywords: ['心动直播', prog.label, isNpcHost ? (charName + '(NPC)') : (hasChar ? charName : '个人开播')].filter(Boolean)
    };
  }

  async function saveJournalToLongMemory(params) {
    var journal = params.journal;
    var targetCharId = String((params && params.charId) || (journal && journal.charId) || '');
    if (!journal || !targetCharId) {
      return { ok: false, error: '缺少 Char 角色标识，无法写入长期记忆' };
    }
    if (journal.hostType === 'npc' || journal.hostMode === 'npc') {
      return { ok: false, error: 'NPC 主播场次不写入 Char 长期记忆（仅保存在直播手账与聊天回放）' };
    }
    var checkTarget = await verifyParticipantExists(targetCharId);
    if (checkTarget.record && checkTarget.record.roleType === 'npc') {
      return { ok: false, error: 'NPC 嘉宾不写入 Char 长期记忆（仅保存在直播手账与聊天回放）' };
    }
    if (journal.charType === 'npc' && !params.charId) {
      return { ok: false, error: '仅 NPC 参与的直播不写入 Char 长期记忆' };
    }
    if (!global.db || !global.db.memories) {
      return { ok: false, error: '长期记忆数据库未就绪' };
    }
    var info = await resolveCharChatInfo(targetCharId);
    if (!info.ownerUid || !info.chatId) {
      return { ok: false, error: '该 Char 暂无微信私聊会话，请先在微信开启与 Ta 的聊天后再保存到长期记忆' };
    }

    var title = sanitizeText(params.title || journal.title, 30);
    var content = sanitizeText(params.content || journal.summary, 150);
    if (!content) return { ok: false, error: '记忆摘要内容不能为空' };

    // 防重复检查
    var existingRows = await global.db.memories.toArray();
    var dup = existingRows.find(function(m) {
      return m && m.sourceType === 'heartbeat_live' &&
        String(m.sourceEventId || '') === String(journal.id) &&
        String(m.charId || '') === String(targetCharId);
    });
    if (dup) {
      if (global.HeartbeatLiveStorage) {
        await global.HeartbeatLiveStorage.markJournalMemorySaved(journal.id, dup.id, targetCharId);
      }
      return { ok: true, duplicate: true, memoryId: dup.id, memory: dup };
    }

    var now = Date.now();
    var keywords = Array.isArray(params.keywords)
      ? params.keywords.map(function(k) { return sanitizeText(k, 16); }).filter(Boolean).slice(0, 8)
      : ['心动直播', journal.programLabel || '直播', journal.charName || ''].filter(Boolean);

    var row = {
      ownerUid: Number(info.ownerUid),
      charId: Number(targetCharId) || targetCharId,
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
      await global.HeartbeatLiveStorage.markJournalMemorySaved(journal.id, newId, targetCharId);
    }
    return { ok: true, duplicate: false, memoryId: newId, memory: row };
  }

  global.HeartbeatLiveAI = {
    PROGRAMS: PROGRAMS,
    GIFT_CATALOG: GIFT_CATALOG,
    loadAvailableChars: loadAvailableChars,
    loadAvailableNpcs: loadAvailableNpcs,
    loadAvailableInvitees: loadAvailableInvitees,
    verifyParticipantExists: verifyParticipantExists,
    loadCurrentUserProfile: loadCurrentUserProfile,
    resolveCharChatInfo: resolveCharChatInfo,
    gatherCharContext: gatherCharContext,
    buildLiveSystemPrompt: buildLiveSystemPrompt,
    getLiveTtsStatus: getLiveTtsStatus,
    getMinimaxStatus: getMinimaxStatus,
    speakCharLine: speakCharLine,
    previewRoleVoiceLine: previewRoleVoiceLine,
    generateCharLiveReply: generateCharLiveReply,
    generateParticipantLiveReply: generateCharLiveReply,
    parseLiveAiResponse: parseLiveAiResponse,
    pickAudienceName: pickAudienceName,
    sendGiftTransaction: sendGiftTransaction,
    getEconomyBalance: getEconomyBalance,
    buildJournalDraft: buildJournalDraft,
    saveJournalToLongMemory: saveJournalToLongMemory
  };
})(typeof window !== 'undefined' ? window : globalThis);
