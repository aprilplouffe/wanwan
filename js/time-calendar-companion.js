// js/time-calendar-companion.js — 多 Char 深度陪伴＋主动关心＋微信聊天联动引擎 (阶段 4)
// 遵循原则：基于真实日程陪伴、多角色数据隔离、防重复防刷屏、微信原生投递、AI人设优先与失败隔离

(function() {
  'use strict';

  var STORAGE_KEYS = {
    CONFIG: 'time_calendar_companion_config',
    RECORDS: 'time_calendar_care_records',
    CARDS: 'time_calendar_greeting_cards'
  };

  // 默认全局陪伴配置
  var DEFAULT_CONFIG = {
    globalEnabled: false, // 遵循规范：总开关默认关闭，由用户主动在设置中开启
    allowAiGeneration: true,
    allowWechatDelivery: true,
    allowNotificationDelivery: true,
    quietHoursEnabled: true,
    quietHoursStart: '23:00',
    quietHoursEnd: '08:00',
    allowPersonalEventsFor: 'none', // 'none' | 'all' | 'specific'
    allowedPersonalCharIds: [],
    expiredPolicy: 'skip', // 'skip' | 'catchup_recent'
    chars: {} // charId -> char-specific settings
  };

  // 默认单角色专属配置
  var DEFAULT_CHAR_CONFIG = {
    enabled: true,
    dailyLimit: 2,
    weeklyLimit: 8,
    minIntervalHours: 2,
    anniversaryCareEnabled: true,
    examCareEnabled: true,
    studyCareEnabled: true,
    focusCareEnabled: true,
    generalScheduleCareEnabled: false,
    relationshipContextEnabled: true,
    customToneHint: '',
    lastTriggeredAt: 0
  };

  // 运行时状态
  var _isRunningCheck = false;
  var _checkIntervalTimer = null;
  var _cachedConfig = null;

  // ==========================================
  // 一、存储持久化通用辅助
  // ==========================================
  async function loadConfig(key, fallback) {
    try {
      if (window.db && db.config) {
        var row = await db.config.get(key);
        if (row && row.value !== undefined) return row.value;
      }
    } catch (_) {}
    try {
      var raw = localStorage.getItem('tc_' + key) || localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return fallback;
  }

  async function saveConfig(key, value) {
    try {
      if (window.db && db.config) {
        await db.config.put({ key: key, value: value });
      }
    } catch (_) {}
    try {
      localStorage.setItem('tc_' + key, JSON.stringify(value));
    } catch (_) {}
  }

  async function getCompanionSettings() {
    var saved = await loadConfig(STORAGE_KEYS.CONFIG, null);
    if (!saved) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    var merged = Object.assign({}, DEFAULT_CONFIG, saved);
    merged.chars = Object.assign({}, saved.chars || {});
    _cachedConfig = merged;
    return merged;
  }

  async function saveCompanionSettings(settings) {
    _cachedConfig = settings;
    await saveConfig(STORAGE_KEYS.CONFIG, settings);
  }

  function getCharSettings(charId, rootConfig) {
    var cid = String(charId);
    var chars = rootConfig.chars || {};
    return Object.assign({}, DEFAULT_CHAR_CONFIG, chars[cid] || {});
  }

  async function loadCareRecords() {
    return await loadConfig(STORAGE_KEYS.RECORDS, []);
  }

  async function saveCareRecords(records) {
    // 最多保留最近 150 条记录，保证轻量高效
    if (records.length > 150) {
      records = records.slice(0, 150);
    }
    await saveConfig(STORAGE_KEYS.RECORDS, records);
  }

  async function loadGreetingCards() {
    return await loadConfig(STORAGE_KEYS.CARDS, {});
  }

  async function saveGreetingCards(cards) {
    await saveConfig(STORAGE_KEYS.CARDS, cards);
  }

  // ==========================================
  // 二、安全状态校验与环境感知
  // ==========================================

  // 1. 判断是否处于夜间免打扰时段
  function isNowInQuietHours(config) {
    if (!config || !config.quietHoursEnabled) return false;
    var start = config.quietHoursStart || '23:00';
    var end = config.quietHoursEnd || '08:00';
    var now = new Date();
    var cur = (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' +
              (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();

    if (start <= end) {
      return cur >= start && cur <= end;
    } else {
      // 跨午夜，如 23:00 到 08:00
      return cur >= start || cur <= end;
    }
  }

  // 2. 判断用户是否正处于自习室专注中 (绝对不打扰番茄钟心流)
  function isUserFocusingInStudyRoom() {
    try {
      if (window.WanwanStudyRoom && typeof window.WanwanStudyRoom.getState === 'function') {
        var st = window.WanwanStudyRoom.getState();
        if (st && st.timerStatus === 'running') return true;
      }
      var studyPage = document.getElementById('study-room-page');
      if (studyPage) {
        var timerHint = studyPage.querySelector('#sr-timer-status-hint');
        if (timerHint && timerHint.textContent.indexOf('专注中') >= 0) return true;
      }
    } catch (_) {}
    return false;
  }

  // 3. 判断用户当前是否正打开该 Char 的聊天页面 (避免突兀横插气泡)
  function isChatWindowOpenWithChar(charId) {
    var cw = document.getElementById('chat-window');
    if (cw && cw.dataset && String(cw.dataset.charId) === String(charId)) {
      return true;
    }
    return false;
  }

  // 计算指定 YYYY-MM-DD 与今天的日期差 (0 为今天, 正数为未来几天, 负数为过去几天)
  function getDaysDifferenceFromToday(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    var now = new Date();
    var todayStr = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');

    var pT = todayStr.split('-').map(Number);
    var pD = dateStr.split('-').map(Number);
    var dToday = new Date(pT[0], pT[1] - 1, pT[2]);
    var dTarget = new Date(pD[0], pD[1] - 1, pD[2]);
    var diffMs = dTarget.getTime() - dToday.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  function getTodayLocalDateStr() {
    var now = new Date();
    return now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
  }

  function uid(prefix) {
    return (prefix || 'care') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }

  // ==========================================
  // 三、候选事件检测与权限过滤 (多 Char 独立感知)
  // ==========================================
  async function collectCandidateEventsForChar(targetChar, allCharacters, config) {
    var candidates = [];
    var charId = String(targetChar.id);
    var charConfig = getCharSettings(charId, config);
    if (!charConfig.enabled) return candidates;

    var todayStr = getTodayLocalDateStr();

    // 1. 恋爱记纪念日 (仅当纪念日关联至该特定 Char 时有权感知)
    if (charConfig.anniversaryCareEnabled && window.TimeCalendarIntegrations) {
      try {
        var annivList = await window.TimeCalendarIntegrations.loveDiary.getAnniversaries(charId, allCharacters);
        annivList.forEach(function(an) {
          if (String(an.charId) !== charId) return; // 严格角色隔离

          var ms = computeMilestone(an.startDate, todayStr);
          if (ms.isTodayAnniversary) {
            candidates.push({
              sourceApp: 'love-diary',
              sourceId: an.id,
              eventId: an.id,
              eventTitle: an.title || '恋爱纪念日',
              triggerType: 'anniversary',
              triggerStage: 'day_of',
              occurrenceDate: todayStr,
              charId: charId,
              charName: targetChar.name,
              meta: {
                startDate: an.startDate,
                yearsPassed: ms.nextYears,
                daysPassed: ms.daysPassed
              }
            });
          } else if (ms.daysToNext === 1) {
            candidates.push({
              sourceApp: 'love-diary',
              sourceId: an.id,
              eventId: an.id,
              eventTitle: an.title || '恋爱纪念日',
              triggerType: 'anniversary',
              triggerStage: '1_day_before',
              occurrenceDate: todayStr,
              charId: charId,
              charName: targetChar.name,
              meta: {
                startDate: an.startDate,
                nextYears: ms.nextYears,
                daysPassed: ms.daysPassed
              }
            });
          }
        });
      } catch (e) {
        console.warn('[TimeCalendarCompanion] 读取纪念日候选异常:', e);
      }
    }

    // 2. 自习室考试倒计时 (与该 Char 绑定的备考计划)
    if (charConfig.examCareEnabled && window.TimeCalendarIntegrations) {
      try {
        var exams = await window.TimeCalendarIntegrations.studyRoom.getExamsAsCountdowns(charId);
        exams.forEach(function(ex) {
          // 仅当明确指定了该 Char 或授权给该 Char
          if (ex.charId && String(ex.charId) !== charId) return;

          var diffDays = getDaysDifferenceFromToday(ex.targetDate);
          if (diffDays === null) return;

          var stage = null;
          if (diffDays === 7) stage = '7_days_before';
          else if (diffDays === 3) stage = '3_days_before';
          else if (diffDays === 1) stage = '1_day_before';
          else if (diffDays === 0) stage = 'day_of';
          else if (diffDays === -1 && ex.hasEndTime) stage = 'post_event';

          if (stage) {
            candidates.push({
              sourceApp: 'study-room',
              sourceId: ex.id,
              eventId: ex.id,
              eventTitle: ex.title || '备考计划',
              triggerType: 'exam',
              triggerStage: stage,
              occurrenceDate: todayStr,
              charId: charId,
              charName: targetChar.name,
              meta: {
                targetDate: ex.targetDate,
                diffDays: diffDays,
                notes: ex.notes || ''
              }
            });
          }
        });
      } catch (e) {
        console.warn('[TimeCalendarCompanion] 读取考试候选异常:', e);
      }
    }

    // 3. 普通日程关怀 (需检查用户针对个人日程的独立授权策略)
    if (charConfig.generalScheduleCareEnabled) {
      try {
        var allEvents = await loadConfig('time_calendar_events', []);
        allEvents.forEach(function(ev) {
          if (!ev || !ev.date || ev.completed) return;

          // 隐私授权检查
          var hasAccess = false;
          if (ev.relationType === 'specificChar' && String(ev.charId) === charId) {
            hasAccess = true;
          } else if (ev.relationType === 'personal') {
            if (config.allowPersonalEventsFor === 'all') {
              hasAccess = true;
            } else if (config.allowPersonalEventsFor === 'specific' && Array.isArray(config.allowedPersonalCharIds)) {
              hasAccess = config.allowedPersonalCharIds.indexOf(charId) >= 0;
            }
          }

          if (!hasAccess) return;

          var diff = getDaysDifferenceFromToday(ev.date);
          if (diff === 0 || diff === 1) {
            candidates.push({
              sourceApp: 'time-calendar',
              sourceId: ev.id,
              eventId: ev.id,
              eventTitle: ev.title,
              triggerType: 'general',
              triggerStage: diff === 0 ? 'day_of' : '1_day_before',
              occurrenceDate: todayStr,
              charId: charId,
              charName: targetChar.name,
              meta: {
                date: ev.date,
                startTime: ev.startTime || '',
                category: ev.category || 'other',
                notes: ev.notes || ''
              }
            });
          }
        });
      } catch (e) {
        console.warn('[TimeCalendarCompanion] 读取普通日程候选异常:', e);
      }
    }

    return candidates;
  }

  function computeMilestone(startDateStr, todayStr) {
    var pStart = startDateStr.split('-').map(Number);
    var pToday = (todayStr || getTodayLocalDateStr()).split('-').map(Number);
    var dStart = new Date(pStart[0], pStart[1] - 1, pStart[2]);
    var dToday = new Date(pToday[0], pToday[1] - 1, pToday[2]);

    var daysPassed = Math.max(1, Math.floor((dToday.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    var curYear = dToday.getFullYear();
    var anThisYear = new Date(curYear, pStart[1] - 1, pStart[2]);
    var nextDate;
    var nextYears;

    if (dToday.getTime() > anThisYear.getTime()) {
      nextDate = new Date(curYear + 1, pStart[1] - 1, pStart[2]);
      nextYears = curYear + 1 - pStart[0];
    } else {
      nextDate = anThisYear;
      nextYears = curYear - pStart[0];
    }
    if (nextYears <= 0) nextYears = 1;

    var daysToNext = Math.round((nextDate.getTime() - dToday.getTime()) / (1000 * 60 * 60 * 24));
    var isTodayAnniversary = (pStart[1] === pToday[1] && pStart[2] === pToday[2]);

    return {
      daysPassed: daysPassed,
      daysToNext: daysToNext,
      nextYears: nextYears,
      isTodayAnniversary: isTodayAnniversary
    };
  }

  // ==========================================
  // 四、AI 上下文构建与消息生成 (人设优先，杜绝幻觉)
  // ==========================================
  async function generateCareMessage(character, candidate) {
    if (!window.callAI || typeof window.callAI !== 'function') {
      throw new Error('系统尚未配置或接入 callAI 接口');
    }

    var charName = character.nick || character.name || 'TA';
    var personality = character.personality || character.bio || '温柔细腻、善解人意';
    var relationship = character.relationship || '恋人 / 亲密伴侣';
    var speakingStyle = character.speakingStyle || '';

    // 构建最小必要上下文，严防信息泄露与无端胡编
    var eventContextText = '';
    var goalText = '';

    if (candidate.triggerType === 'anniversary') {
      var meta = candidate.meta || {};
      if (candidate.triggerStage === 'day_of') {
        eventContextText = '今天是你们相守的第 ' + meta.daysPassed + ' 天，也是第 ' + meta.yearsPassed + ' 周年纪念日。';
        goalText = '向用户发送一句饱含深情、符合你性格特征的纪念日专属暖心祝福。';
      } else {
        eventContextText = '明天就是你们的 ' + meta.nextYears + ' 周年纪念日了（已相伴 ' + meta.daysPassed + ' 天）。';
        goalText = '带着轻快的期待，提醒明天这个特殊的日子。';
      }
    } else if (candidate.triggerType === 'exam') {
      var metaEx = candidate.meta || {};
      if (candidate.triggerStage === '7_days_before') {
        eventContextText = '距离重要考试/备考【' + candidate.eventTitle + '】还有 7 天。';
        goalText = '温和提醒把握复习节奏，适度放松，别给自己太大压力。';
      } else if (candidate.triggerStage === '3_days_before') {
        eventContextText = '距离考试【' + candidate.eventTitle + '】还有 3 天。';
        goalText = '提醒查漏补缺，注意作息和饮食，保持充沛精力。';
      } else if (candidate.triggerStage === '1_day_before') {
        eventContextText = '明天就是考试【' + candidate.eventTitle + '】了。';
        goalText = '为对方加油打气，叮嘱准备好文具和早点休息，给予信任与坚定支持。';
      } else if (candidate.triggerStage === 'day_of') {
        eventContextText = '今天是考试【' + candidate.eventTitle + '】当天。';
        goalText = '送上一句清晨/考前的舒心鼓励，稳住心态。';
      } else if (candidate.triggerStage === 'post_event') {
        eventContextText = '考试【' + candidate.eventTitle + '】已顺利结束。';
        goalText = '关心考完后的状态，鼓励好好犒劳一下自己，不要胡乱推断成绩。';
      }
    } else if (candidate.triggerType === 'focus') {
      var metaFoc = candidate.meta || {};
      eventContextText = '刚刚一起完成了 ' + (metaFoc.durationMinutes || 25) + ' 分钟的专注学习（' + (metaFoc.taskName || '专注') + '）。';
      goalText = '给予及时的夸奖与放松关切。';
    } else {
      // 普通日程
      eventContextText = (candidate.triggerStage === 'day_of' ? '今天' : '明天') + '有日程安排【' + candidate.eventTitle + '】' + (candidate.meta.startTime ? ' (' + candidate.meta.startTime + ')' : '') + '。';
      goalText = '送上一句关怀或备忘提醒。';
    }

    var systemPrompt =
      '你现在是【' + charName + '】。你与用户的关系是【' + relationship + '】。\n' +
      '你的人设性格特征：' + personality + '。\n' +
      (speakingStyle ? '你的日常说话风格：' + speakingStyle + '。\n' : '') +
      '【核心原则与铁律】：\n' +
      '1. 必须完全代入你的性格口吻，简短自然，像是在微信上发给对方的一条真实生活消息（通常为 1~2 句话，总字数在 20~60 字以内最佳）。\n' +
      '2. 严禁使用任何 AI 腔、客服腔、机械播报腔。\n' +
      '3. 严禁捏造未曾发生的虚假共同经历、编造考试分数或揣测虚构细节。\n' +
      '4. 不要输出任何角色前缀（如“' + charName + '：”）、括号说明、动作描写或引号，直接输出消息内容本身。';

    var userPrompt =
      '【当前生活背景】：' + eventContextText + '\n' +
      '【本次交流目标】：' + goalText + '\n' +
      '请直接写出你想在微信上发给TA的关怀消息：';

    var messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    var response = await window.callAI(messages, {
      temperature: 0.75
    });

    var cleanText = String(response || '').trim();
    // 清理可能产生的双引号或角色冒号前缀
    cleanText = cleanText.replace(/^["'“”‘]+|["'“”‘]+$/g, '');
    cleanText = cleanText.replace(new RegExp('^' + charName + '\\s*[:：]\\s*'), '');
    return cleanText;
  }

  // ==========================================
  // 五、微信消息安全投递 (原生引擎复用)
  // ==========================================
  async function deliverCareMessageToWechat(character, text, idempotentKey) {
    if (!window.db || !db.chats || !db.messages) {
      throw new Error('微信数据库尚未准备就绪');
    }

    var charId = Number(character.id);

    // 1. 获取当前有效微信 userUid
    var userUid = null;
    try {
      var storedUid = localStorage.getItem('wanwan_wechat_uid');
      if (storedUid) userUid = parseInt(storedUid, 10);
    } catch (_) {}

    if (!userUid && db.characters) {
      var userChar = await db.characters.where('type').equals('user').first();
      if (userChar) userUid = userChar.id;
    }
    if (!userUid) userUid = 1; // 兜底全局用户

    // 2. 定位或创建与该 Char 的私聊会话
    var chat = await db.chats.where('[ownerUid+charId]').equals([userUid, charId]).first();
    if (!chat) {
      var newChatId = await db.chats.add({
        charId: charId,
        ownerUid: userUid,
        createdAt: Date.now(),
        unread: 0
      });
      chat = await db.chats.get(newChatId);
    }

    // 3. 幂等插入消息
    var nowTime = Date.now();
    var msgId = await db.messages.add({
      chatId: chat.id,
      charId: charId,
      role: 'assistant',
      content: text,
      clientMessageId: idempotentKey,
      createdAt: nowTime
    });

    // 4. 更新未读计数与会话状态
    var isCurrentChat = isChatWindowOpenWithChar(charId);
    await db.chats.update(chat.id, {
      unread: isCurrentChat ? 0 : ((chat.unread || 0) + 1),
      lastMessageTime: nowTime
    });

    // 5. 刷新前台界面与推送通知
    if (isCurrentChat) {
      var cw = document.getElementById('chat-window');
      if (cw && window.refreshChat) {
        try { await window.refreshChat(cw, { scrollToBottom: true }); } catch (_) {}
      }
    } else {
      if (window.refreshVisibleWechatChatList) {
        try { await window.refreshVisibleWechatChatList({ showLoading: false }); } catch (_) {}
      }
      // 在应用处于后台或不同窗口时，触发系统级 Web 通知
      if (window.sendWanWanNotification) {
        try {
          var charName = character.nick || character.name || '伴侣';
          window.sendWanWanNotification(text, {
            title: charName,
            tag: 'tc-care-' + idempotentKey,
            data: {
              charId: charId,
              chatId: chat.id
            }
          });
        } catch (_) {}
      }
    }

    return {
      messageId: msgId,
      chatId: chat.id,
      deliveredAt: nowTime
    };
  }

  // ==========================================
  // 六、主动关心巡检调度器 (去重、限额与防刷屏)
  // ==========================================
  async function runCompanionCareCheck() {
    if (_isRunningCheck) return;
    _isRunningCheck = true;

    try {
      var config = await getCompanionSettings();
      // 用户总开关未开启，绝不擅自执行 AI 关怀
      if (!config.globalEnabled) return;

      // 免打扰时段跳过
      if (isNowInQuietHours(config)) {
        return;
      }

      // 用户正在专注自习，绝不横加打扰
      if (isUserFocusingInStudyRoom()) {
        return;
      }

      var allChars = await db.characters.toArray();
      var partnerChars = allChars.filter(function(c) { return c && c.type !== 'user'; });
      var allRecords = await loadCareRecords();

      var todayStr = getTodayLocalDateStr();
      var startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
      var startOfWeek = Date.now() - (7 * 24 * 60 * 60 * 1000);

      for (var i = 0; i < partnerChars.length; i++) {
        var charObj = partnerChars[i];
        var cid = String(charObj.id);
        var charConf = getCharSettings(cid, config);
        if (!charConf.enabled) continue;

        // 如果用户当前正与该 Char 聊天，延缓主动关心，避免插话
        if (isChatWindowOpenWithChar(cid)) continue;

        // 统计今日与本周该 Char 的已发送数量
        var charDeliveredToday = allRecords.filter(function(r) {
          return String(r.charId) === cid && r.status === 'delivered' && r.deliveredAt >= startOfToday;
        }).length;

        var charDeliveredWeek = allRecords.filter(function(r) {
          return String(r.charId) === cid && r.status === 'delivered' && r.deliveredAt >= startOfWeek;
        }).length;

        // 收集该 Char 有权感知的事件
        var candidates = await collectCandidateEventsForChar(charObj, partnerChars, config);

        for (var j = 0; j < candidates.length; j++) {
          var cand = candidates[j];
          var idempotentKey = cid + '_' + (cand.eventId || cand.sourceId) + '_' + cand.occurrenceDate + '_' + cand.triggerStage;

          // 1. 检查幂等去重
          var existingRecord = allRecords.find(function(r) { return r.idempotentKey === idempotentKey; });
          if (existingRecord && existingRecord.status === 'delivered') {
            continue; // 已发送，绝不重复
          }

          // 2. 检查频率配额
          if (charDeliveredToday >= charConf.dailyLimit) {
            if (!existingRecord) {
              allRecords.unshift({
                careId: uid('care'),
                idempotentKey: idempotentKey,
                charId: cid,
                charName: charObj.name,
                sourceApp: cand.sourceApp,
                sourceId: cand.sourceId,
                eventId: cand.eventId,
                eventTitle: cand.eventTitle,
                occurrenceDate: cand.occurrenceDate,
                triggerType: cand.triggerType,
                triggerStage: cand.triggerStage,
                status: 'skipped',
                skipReason: '今日关心频次已达上限 (' + charConf.dailyLimit + '条)',
                createdAt: Date.now()
              });
            }
            continue;
          }

          if (charDeliveredWeek >= charConf.weeklyLimit) {
            if (!existingRecord) {
              allRecords.unshift({
                careId: uid('care'),
                idempotentKey: idempotentKey,
                charId: cid,
                charName: charObj.name,
                sourceApp: cand.sourceApp,
                sourceId: cand.sourceId,
                eventId: cand.eventId,
                eventTitle: cand.eventTitle,
                occurrenceDate: cand.occurrenceDate,
                triggerType: cand.triggerType,
                triggerStage: cand.triggerStage,
                status: 'skipped',
                skipReason: '本周关心频次已达上限 (' + charConf.weeklyLimit + '条)',
                createdAt: Date.now()
              });
            }
            continue;
          }

          // 3. 检查冷却时间
          var hoursSinceLast = (Date.now() - (charConf.lastTriggeredAt || 0)) / (1000 * 60 * 60);
          if (hoursSinceLast < (charConf.minIntervalHours || 2)) {
            continue;
          }

          // 4. 调用 AI 生成关怀文案
          var careText = '';
          try {
            careText = await generateCareMessage(charObj, cand);
          } catch (aiErr) {
            console.warn('[TimeCalendarCompanion] AI 关怀生成失败 (不影响核心业务):', aiErr);
            allRecords.unshift({
              careId: uid('care'),
              idempotentKey: idempotentKey,
              charId: cid,
              charName: charObj.name,
              sourceApp: cand.sourceApp,
              sourceId: cand.sourceId,
              eventId: cand.eventId,
              eventTitle: cand.eventTitle,
              occurrenceDate: cand.occurrenceDate,
              triggerType: cand.triggerType,
              triggerStage: cand.triggerStage,
              status: 'failed',
              error: aiErr.message || 'AI 生成异常',
              createdAt: Date.now()
            });
            await saveCareRecords(allRecords);
            continue;
          }

          if (!careText) continue;

          // 5. 投递至微信
          try {
            var delRes = await deliverCareMessageToWechat(charObj, careText, idempotentKey);
            charConf.lastTriggeredAt = Date.now();
            config.chars[cid] = charConf;
            await saveCompanionSettings(config);

            charDeliveredToday++;
            charDeliveredWeek++;

            allRecords.unshift({
              careId: uid('care'),
              idempotentKey: idempotentKey,
              charId: cid,
              charName: charObj.name,
              sourceApp: cand.sourceApp,
              sourceId: cand.sourceId,
              eventId: cand.eventId,
              eventTitle: cand.eventTitle,
              occurrenceDate: cand.occurrenceDate,
              triggerType: cand.triggerType,
              triggerStage: cand.triggerStage,
              status: 'delivered',
              generatedText: careText,
              deliveredMessageId: delRes.messageId,
              deliveredAt: delRes.deliveredAt,
              createdAt: Date.now()
            });
            await saveCareRecords(allRecords);
          } catch (delErr) {
            console.warn('[TimeCalendarCompanion] 微信消息入库失败:', delErr);
            allRecords.unshift({
              careId: uid('care'),
              idempotentKey: idempotentKey,
              charId: cid,
              charName: charObj.name,
              sourceApp: cand.sourceApp,
              sourceId: cand.sourceId,
              eventId: cand.eventId,
              eventTitle: cand.eventTitle,
              occurrenceDate: cand.occurrenceDate,
              triggerType: cand.triggerType,
              triggerStage: cand.triggerStage,
              status: 'failed',
              error: '微信消息写入异常: ' + (delErr.message || ''),
              createdAt: Date.now()
            });
            await saveCareRecords(allRecords);
          }
        }
      }
    } catch (err) {
      console.warn('[TimeCalendarCompanion] 巡检异常:', err);
    } finally {
      _isRunningCheck = false;
    }
  }

  // ==========================================
  // 七、纪念日专属贺卡系统 (AI 寄语与缓存)
  // ==========================================
  async function getOrGenerateAnniversaryGreetingCard(annivItem, forceRegenerate) {
    var charId = String(annivItem.charId || 'default');
    var cardKey = 'card_' + charId + '_' + (annivItem.id || annivItem.startDate);
    var allCards = await loadGreetingCards();

    if (!forceRegenerate && allCards[cardKey]) {
      return allCards[cardKey];
    }

    // 调用 AI 生成专属落款寄语
    var char = await window.getCharacter(charId);
    var charName = (char && (char.nick || char.name)) || '林弯弯';
    var personality = (char && (char.personality || char.bio)) || '温柔体贴、深情守护';
    var relationship = (char && char.relationship) || '伴侣';

    var milestone = computeMilestone(annivItem.startDate);
    var blessingText = '';

    if (window.callAI) {
      try {
        var sys =
          '你是【' + charName + '】。你与用户的关系是【' + relationship + '】。\n' +
          '性格特点：' + personality + '。\n' +
          '今天是你们的纪念日（相识相伴第 ' + milestone.daysPassed + ' 天，' + milestone.nextYears + ' 周年）。\n' +
          '请为用户写一段写在专属纪念贺卡上的贺词（字数 60~120 字，包含三两句真挚走心的纪念寄语）。\n' +
          '严禁长篇大论，严禁使用 AI 模板腔，必须符合你的人设特点，真诚动人。格式直接返回贺词正文。';

        var prompt = '请为我们的 ' + milestone.nextYears + ' 周年纪念日撰写专属贺卡祝福：';
        var resp = await window.callAI([
          { role: 'system', content: sys },
          { role: 'user', content: prompt }
        ], { temperature: 0.8 });

        blessingText = String(resp || '').trim().replace(/^["'“”‘]+|["'“”‘]+$/g, '');
      } catch (e) {
        console.warn('[GreetingCard] AI 生成失败，回退默认温情寄语:', e);
      }
    }

    if (!blessingText) {
      blessingText = '相守的第 ' + milestone.daysPassed + ' 天，春去秋来，时光在走，而我一直在你身边。愿未来的岁岁年年，我们依然并肩同行。' + milestone.nextYears + ' 周年快乐！';
    }

    var cardData = {
      cardId: uid('card'),
      cardKey: cardKey,
      charId: charId,
      charName: charName,
      charAvatar: (char && char.avatar) || 'img/wanwan.png',
      annivTitle: annivItem.title || (charName + ' 的恋爱纪念日'),
      startDate: annivItem.startDate,
      yearsPassed: milestone.nextYears,
      daysPassed: milestone.daysPassed,
      blessing: blessingText,
      closing: '—— 永远陪伴你的 ' + charName,
      createdAt: Date.now()
    };

    allCards[cardKey] = cardData;
    await saveGreetingCards(allCards);
    return cardData;
  }

  // 贺卡视觉弹窗 (极简黑白灰高级卡片质感，契合小手机全域设计)
  async function showGreetingCardModal(annivItem) {
    var overlay = document.createElement('div');
    overlay.className = 'tc-modal-overlay';

    overlay.innerHTML =
      '<div class="tc-modal-dialog" style="max-width: 380px; padding: 0; background: transparent; box-shadow: none; border: none;">' +
        '<div id="tc-greeting-card-content" style="background: var(--c-surface, #ffffff); border: 1px solid var(--c-border, #e5e7eb); border-radius: 16px; padding: 24px; box-shadow: var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.1)); position: relative; overflow: hidden;">' +
          '<div style="text-align: center; padding: 30px 10px;">' +
            '<i class="fa fa-spinner fa-spin" style="font-size: 24px; color: var(--c-text-muted);"></i>' +
            '<div style="font-size: 13px; color: var(--c-text-muted); margin-top: 10px;">正在请 TA 亲手题写专属纪念寄语...</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    async function renderCard(force) {
      var contentEl = overlay.querySelector('#tc-greeting-card-content');
      try {
        var card = await getOrGenerateAnniversaryGreetingCard(annivItem, force);
        contentEl.innerHTML =
          '<button type="button" id="tc-card-close" style="position: absolute; top: 14px; right: 14px; width: 28px; height: 28px; border-radius: 50%; background: var(--c-surface-2, #f3f4f6); border: none; color: var(--c-text, #111827); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px;">' +
            '<i class="fa fa-xmark"></i>' +
          '</button>' +
          '<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">' +
            '<img src="' + card.charAvatar + '" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 1px solid var(--c-border);">' +
            '<div>' +
              '<div style="font-size: 15px; font-weight: 600; color: var(--c-text);">' + card.charName + ' · 纪念寄语</div>' +
              '<div style="font-size: 11px; color: var(--c-text-muted);">相识相伴第 ' + card.daysPassed + ' 天 · ' + card.yearsPassed + ' 周年</div>' +
            '</div>' +
          '</div>' +
          '<div style="background: var(--c-surface-2, #fafafa); border: 1px solid var(--c-border, #eee); border-radius: 12px; padding: 18px 16px; margin-bottom: 16px; position: relative;">' +
            '<div style="font-size: 10px; color: var(--c-text-muted); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;"><i class="fa-solid fa-heart" style="color: #ef4444; margin-right: 4px;"></i> ANNIVERSARY LETTER</div>' +
            '<div style="font-size: 13px; line-height: 1.75; color: var(--c-text); white-space: pre-wrap; font-style: normal;">' + card.blessing + '</div>' +
            '<div style="font-size: 12px; font-weight: 500; color: var(--c-text-muted); text-align: right; margin-top: 14px;">' + card.closing + '</div>' +
          '</div>' +
          '<div style="display: flex; gap: 8px;">' +
            '<button type="button" id="tc-btn-copy-card" style="flex: 1; padding: 8px; border-radius: 8px; background: var(--c-surface-2); border: 1px solid var(--c-border); color: var(--c-text); font-size: 12px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">' +
              '<i class="fa fa-copy"></i> 复制寄语' +
            '</button>' +
            '<button type="button" id="tc-btn-regen-card" style="flex: 1; padding: 8px; border-radius: 8px; background: var(--c-text); border: 1px solid var(--c-text); color: var(--c-bg); font-size: 12px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">' +
              '<i class="fa fa-rotate"></i> 重新题写' +
            '</button>' +
          '</div>';

        contentEl.querySelector('#tc-card-close').onclick = function() { overlay.remove(); };
        contentEl.querySelector('#tc-btn-copy-card').onclick = function() {
          var copyText = card.annivTitle + '\n' + card.blessing + '\n' + card.closing;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(copyText);
          }
          if (window.toast) window.toast('贺卡寄语已复制到剪贴板 ✨');
        };
        contentEl.querySelector('#tc-btn-regen-card').onclick = function() {
          renderCard(true);
        };
      } catch (err) {
        contentEl.innerHTML =
          '<div style="text-align: center; padding: 20px;">' +
            '<div style="font-size: 13px; color: var(--c-text-muted);">贺卡寄语题写失败：' + err.message + '</div>' +
            '<button type="button" class="tc-btn" style="margin-top: 10px;" onclick="this.closest(\'.tc-modal-overlay\').remove()">关闭</button>' +
          '</div>';
      }
    }

    renderCard(false);
  }

  // ==========================================
  // 八、管理与设置弹窗 (总控、分角色、频率与记录)
  // ==========================================
  async function showCompanionSettingsModal() {
    var overlay = document.createElement('div');
    overlay.className = 'tc-modal-overlay';

    var config = await getCompanionSettings();
    var allChars = await db.characters.toArray();
    var partnerChars = allChars.filter(function(c) { return c && c.type !== 'user'; });

    var activeTab = 'settings'; // 'settings' | 'records' | 'cards'

    overlay.innerHTML =
      '<div class="tc-modal-dialog" style="max-width: 440px; max-height: 85vh; display: flex; flex-direction: column;">' +
        '<div class="tc-modal-header">' +
          '<div class="tc-modal-title"><i class="fa-solid fa-heart" style="margin-right: 6px;"></i>Char 深度陪伴管理</div>' +
          '<button class="tc-modal-close-btn" id="tc-comp-close"><i class="fa xmark fa-xmark"></i></button>' +
        '</div>' +
        '<div style="display: flex; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--c-border);">' +
          '<button class="tc-reminder-tab-btn active" id="tc-comp-tab-settings" style="flex: 1;">陪伴配置</button>' +
          '<button class="tc-reminder-tab-btn" id="tc-comp-tab-records" style="flex: 1;">关怀日志</button>' +
          '<button class="tc-reminder-tab-btn" id="tc-comp-tab-cards" style="flex: 1;">专属贺卡</button>' +
        '</div>' +
        '<div id="tc-comp-body" style="flex: 1; overflow-y: auto; padding: 14px 16px;"></div>' +
        '<div class="tc-modal-footer">' +
          '<button class="tc-btn" id="tc-comp-trigger-now" style="font-size: 11px;"><i class="fa fa-play"></i> 立即巡检触发</button>' +
          '<button class="tc-btn tc-btn-primary" id="tc-comp-save" style="font-size: 11px;">保存配置</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var bodyEl = overlay.querySelector('#tc-comp-body');

    function renderActiveTab() {
      overlay.querySelector('#tc-comp-tab-settings').classList.toggle('active', activeTab === 'settings');
      overlay.querySelector('#tc-comp-tab-records').classList.toggle('active', activeTab === 'records');
      overlay.querySelector('#tc-comp-tab-cards').classList.toggle('active', activeTab === 'cards');

      if (activeTab === 'settings') {
        renderSettingsTab();
      } else if (activeTab === 'records') {
        renderRecordsTab();
      } else if (activeTab === 'cards') {
        renderCardsTab();
      }
    }

    // 1. 陪伴配置 Tab
    function renderSettingsTab() {
      var charsHtml = '';
      partnerChars.forEach(function(c) {
        var cid = String(c.id);
        var cc = getCharSettings(cid, config);
        charsHtml +=
          '<div style="background: var(--c-surface-2); border: 1px solid var(--c-border); border-radius: var(--r-md); padding: 10px 12px; margin-bottom: 8px;">' +
            '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">' +
              '<div style="display: flex; align-items: center; gap: 8px;">' +
                '<img src="' + (c.avatar || 'img/wanwan.png') + '" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">' +
                '<span style="font-size: 13px; font-weight: 600; color: var(--c-text);">' + (c.nick || c.name) + '</span>' +
              '</div>' +
              '<label class="tc-switch">' +
                '<input type="checkbox" class="tc-char-toggle" data-char-id="' + cid + '" ' + (cc.enabled ? 'checked' : '') + '>' +
                '<span class="tc-slider"></span>' +
              '</label>' +
            '</div>' +
            '<div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--c-text-muted);">' +
              '<label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">' +
                '<input type="checkbox" class="tc-char-opt" data-char-id="' + cid + '" data-field="anniversaryCareEnabled" ' + (cc.anniversaryCareEnabled ? 'checked' : '') + '> 纪念日祝福' +
              '</label>' +
              '<label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">' +
                '<input type="checkbox" class="tc-char-opt" data-char-id="' + cid + '" data-field="examCareEnabled" ' + (cc.examCareEnabled ? 'checked' : '') + '> 考试关怀' +
              '</label>' +
              '<label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">' +
                '<input type="checkbox" class="tc-char-opt" data-char-id="' + cid + '" data-field="focusCareEnabled" ' + (cc.focusCareEnabled ? 'checked' : '') + '> 专注鼓励' +
              '</label>' +
              '<label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">' +
                '<input type="checkbox" class="tc-char-opt" data-char-id="' + cid + '" data-field="generalScheduleCareEnabled" ' + (cc.generalScheduleCareEnabled ? 'checked' : '') + '> 普通日程备忘' +
              '</label>' +
            '</div>' +
            '<div style="display: flex; align-items: center; gap: 12px; margin-top: 6px; font-size: 11px; color: var(--c-text-muted);">' +
              '<span>每日上限：' +
                '<select class="tc-char-daily-limit tc-form-select" data-char-id="' + cid + '" style="padding: 1px 4px; font-size: 11px; width: 55px;">' +
                  '<option value="1" ' + (cc.dailyLimit === 1 ? 'selected' : '') + '>1 条</option>' +
                  '<option value="2" ' + (cc.dailyLimit === 2 ? 'selected' : '') + '>2 条</option>' +
                  '<option value="3" ' + (cc.dailyLimit === 3 ? 'selected' : '') + '>3 条</option>' +
                  '<option value="5" ' + (cc.dailyLimit === 5 ? 'selected' : '') + '>5 条</option>' +
                '</select>' +
              '</span>' +
              '<span>每周上限：' +
                '<select class="tc-char-weekly-limit tc-form-select" data-char-id="' + cid + '" style="padding: 1px 4px; font-size: 11px; width: 55px;">' +
                  '<option value="4" ' + (cc.weeklyLimit === 4 ? 'selected' : '') + '>4 条</option>' +
                  '<option value="8" ' + (cc.weeklyLimit === 8 ? 'selected' : '') + '>8 条</option>' +
                  '<option value="14" ' + (cc.weeklyLimit === 14 ? 'selected' : '') + '>14 条</option>' +
                '</select>' +
              '</span>' +
            '</div>' +
          '</div>';
      });

      bodyEl.innerHTML =
        '<!-- 全局总开关 -->' +
        '<div style="background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--r-md); padding: 12px; margin-bottom: 12px;">' +
          '<div style="display: flex; align-items: center; justify-content: space-between;">' +
            '<div>' +
              '<div style="font-size: 13px; font-weight: 600; color: var(--c-text);">允许 Char 依据日历主动关心</div>' +
              '<div style="font-size: 11px; color: var(--c-text-muted); margin-top: 2px;">开启后，获准的角色将在纪念日、考试或学习完成时主动发微信陪伴。</div>' +
            '</div>' +
            '<label class="tc-switch">' +
              '<input type="checkbox" id="tc-comp-global-toggle" ' + (config.globalEnabled ? 'checked' : '') + '>' +
              '<span class="tc-slider"></span>' +
            '</label>' +
          '</div>' +
          '<div style="display: flex; gap: 12px; margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--c-border); font-size: 11px;">' +
            '<label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">' +
              '<input type="checkbox" id="tc-comp-wechat-toggle" ' + (config.allowWechatDelivery ? 'checked' : '') + '> 投递微信消息' +
            '</label>' +
            '<label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">' +
              '<input type="checkbox" id="tc-comp-ai-toggle" ' + (config.allowAiGeneration ? 'checked' : '') + '> 启用 AI 拟真生成' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<!-- 免打扰与隐私策略 -->' +
        '<div style="background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--r-md); padding: 12px; margin-bottom: 12px;">' +
          '<div style="font-size: 12px; font-weight: 600; margin-bottom: 8px;"><i class="fa fa-moon" style="margin-right: 4px;"></i>安静免打扰与隐私感知</div>' +
          '<div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; margin-bottom: 6px;">' +
            '<span>夜间安静时段：</span>' +
            '<div style="display: flex; align-items: center; gap: 4px;">' +
              '<input type="time" class="tc-form-input" id="tc-comp-quiet-start" style="width: 70px; padding: 2px 4px; font-size: 11px;" value="' + (config.quietHoursStart || '23:00') + '">' +
              '<span>~</span>' +
              '<input type="time" class="tc-form-input" id="tc-comp-quiet-end" style="width: 70px; padding: 2px 4px; font-size: 11px;" value="' + (config.quietHoursEnd || '08:00') + '">' +
            '</div>' +
          '</div>' +
          '<div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px;">' +
            '<span>私人日程感知授权：</span>' +
            '<select class="tc-form-select" id="tc-comp-personal-policy" style="padding: 2px 6px; font-size: 11px; width: 140px;">' +
              '<option value="none" ' + (config.allowPersonalEventsFor === 'none' ? 'selected' : '') + '>严格保密 (不向任何Char开放)</option>' +
              '<option value="all" ' + (config.allowPersonalEventsFor === 'all' ? 'selected' : '') + '>所有陪伴角色均可感知</option>' +
            '</select>' +
          '</div>' +
        '</div>' +

        '<!-- 分角色独立配置 -->' +
        '<div style="font-size: 12px; font-weight: 600; margin-bottom: 8px;">各角色独立陪伴开关与配额</div>' +
        charsHtml;
    }

    // 2. 关怀日志 Tab
    async function renderRecordsTab() {
      bodyEl.innerHTML = '<div class="tc-empty-state"><i class="fa fa-spinner fa-spin"></i><span>正在载入关怀日志...</span></div>';
      var records = await loadCareRecords();

      if (!records || records.length === 0) {
        bodyEl.innerHTML =
          '<div class="tc-empty-state" style="padding: 40px 10px;">' +
            '<i class="fa fa-envelope-open-text"></i>' +
            '<span>暂无主动关心投递记录</span>' +
          '</div>';
        return;
      }

      var html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
      records.forEach(function(r) {
        var statusBadge = '';
        if (r.status === 'delivered') statusBadge = '<span style="font-size: 10px; background: #ecfdf5; color: #059669; padding: 1px 6px; border-radius: 10px;">已投递微信</span>';
        else if (r.status === 'skipped') statusBadge = '<span style="font-size: 10px; background: #f3f4f6; color: #6b7280; padding: 1px 6px; border-radius: 10px;">已跳过 (' + (r.skipReason || '限额') + ')</span>';
        else if (r.status === 'failed') statusBadge = '<span style="font-size: 10px; background: #fef2f2; color: #dc2626; padding: 1px 6px; border-radius: 10px;">生成失败</span>';

        var typeMap = { anniversary: '纪念日', exam: '考试备考', focus: '专注成就', general: '日常日程' };

        html +=
          '<div style="background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--r-md); padding: 10px 12px;">' +
            '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">' +
              '<span style="font-size: 12px; font-weight: 600; color: var(--c-text);">' + r.charName + ' · ' + (typeMap[r.triggerType] || '关怀') + '</span>' +
              statusBadge +
            '</div>' +
            '<div style="font-size: 11px; color: var(--c-text-muted); margin-bottom: 4px;">关联事件：' + (r.eventTitle || '日程') + ' · ' + r.occurrenceDate + '</div>' +
            (r.generatedText ? '<div style="font-size: 12px; line-height: 1.5; color: var(--c-text); background: var(--c-surface-2); padding: 6px 10px; border-radius: 6px; margin-top: 4px;">“' + r.generatedText + '”</div>' : '') +
            (r.error ? '<div style="font-size: 11px; color: #dc2626; margin-top: 2px;">原因：' + r.error + '</div>' : '') +
          '</div>';
      });
      html += '</div>';

      bodyEl.innerHTML = html;
    }

    // 3. 专属贺卡 Tab
    async function renderCardsTab() {
      bodyEl.innerHTML = '<div class="tc-empty-state"><i class="fa fa-spinner fa-spin"></i><span>正在读取专属贺卡馆...</span></div>';
      var cardsMap = await loadGreetingCards();
      var cardKeys = Object.keys(cardsMap);

      if (cardKeys.length === 0) {
        bodyEl.innerHTML =
          '<div class="tc-empty-state" style="padding: 40px 10px;">' +
            '<i class="fa-solid fa-cake-candles"></i>' +
            '<span>暂未生成专属贺卡，在纪念日页面点击「专属贺卡」即可生成</span>' +
          '</div>';
        return;
      }

      var html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
      cardKeys.forEach(function(k) {
        var card = cardsMap[k];
        html +=
          '<div style="background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--r-md); padding: 12px;">' +
            '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">' +
              '<img src="' + card.charAvatar + '" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">' +
              '<span style="font-size: 13px; font-weight: 600; color: var(--c-text);">' + card.charName + ' · ' + card.yearsPassed + ' 周年寄语</span>' +
            '</div>' +
            '<div style="font-size: 12px; line-height: 1.6; color: var(--c-text); background: var(--c-surface-2); padding: 8px 10px; border-radius: 6px;">' +
              card.blessing +
            '</div>' +
            '<div style="display: flex; align-items: center; justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--c-text-muted);">' +
              '<span>' + card.closing + '</span>' +
              '<span>第 ' + card.daysPassed + ' 天</span>' +
            '</div>' +
          '</div>';
      });
      html += '</div>';
      bodyEl.innerHTML = html;
    }

    renderActiveTab();

    // 绑定 Tab 切换
    overlay.querySelector('#tc-comp-tab-settings').onclick = function() { activeTab = 'settings'; renderActiveTab(); };
    overlay.querySelector('#tc-comp-tab-records').onclick = function() { activeTab = 'records'; renderActiveTab(); };
    overlay.querySelector('#tc-comp-tab-cards').onclick = function() { activeTab = 'cards'; renderActiveTab(); };

    overlay.querySelector('#tc-comp-close').onclick = function() { overlay.remove(); };

    // 立即执行一次巡检触发
    overlay.querySelector('#tc-comp-trigger-now').onclick = async function() {
      if (window.toast) window.toast('正在执行陪伴主动关心规则巡检...');
      await runCompanionCareCheck();
      if (activeTab === 'records') renderRecordsTab();
      if (window.toast) window.toast('主动关心巡检完成');
    };

    // 保存配置
    overlay.querySelector('#tc-comp-save').onclick = async function() {
      if (activeTab === 'settings') {
        config.globalEnabled = overlay.querySelector('#tc-comp-global-toggle').checked;
        config.allowWechatDelivery = overlay.querySelector('#tc-comp-wechat-toggle').checked;
        config.allowAiGeneration = overlay.querySelector('#tc-comp-ai-toggle').checked;
        config.quietHoursStart = overlay.querySelector('#tc-comp-quiet-start').value;
        config.quietHoursEnd = overlay.querySelector('#tc-comp-quiet-end').value;
        config.allowPersonalEventsFor = overlay.querySelector('#tc-comp-personal-policy').value;

        // 收集分角色配置
        overlay.querySelectorAll('.tc-char-toggle').forEach(function(toggle) {
          var cid = toggle.dataset.charId;
          if (!config.chars[cid]) config.chars[cid] = Object.assign({}, DEFAULT_CHAR_CONFIG);
          config.chars[cid].enabled = toggle.checked;
        });

        overlay.querySelectorAll('.tc-char-opt').forEach(function(opt) {
          var cid = opt.dataset.charId;
          var field = opt.dataset.field;
          if (!config.chars[cid]) config.chars[cid] = Object.assign({}, DEFAULT_CHAR_CONFIG);
          config.chars[cid][field] = opt.checked;
        });

        overlay.querySelectorAll('.tc-char-daily-limit').forEach(function(sel) {
          var cid = sel.dataset.charId;
          if (!config.chars[cid]) config.chars[cid] = Object.assign({}, DEFAULT_CHAR_CONFIG);
          config.chars[cid].dailyLimit = parseInt(sel.value, 10);
        });

        overlay.querySelectorAll('.tc-char-weekly-limit').forEach(function(sel) {
          var cid = sel.dataset.charId;
          if (!config.chars[cid]) config.chars[cid] = Object.assign({}, DEFAULT_CHAR_CONFIG);
          config.chars[cid].weeklyLimit = parseInt(sel.value, 10);
        });

        await saveCompanionSettings(config);
        if (window.toast) window.toast('Char 深度陪伴配置已保存');
      }
      overlay.remove();
    };
  }

  // ==========================================
  // 九、周期巡检初始化与全局挂载
  // ==========================================
  function initCompanionEngine() {
    // 1. 延迟 3 秒后首次安全巡检（确保 Dexie 和微信环境就绪）
    setTimeout(function() {
      runCompanionCareCheck();
    }, 3500);

    // 2. 每 15 分钟温和巡检一次 (绝不霸占主线程)
    if (_checkIntervalTimer) clearInterval(_checkIntervalTimer);
    _checkIntervalTimer = setInterval(function() {
      runCompanionCareCheck();
    }, 15 * 60 * 1000);

    // 3. 应用恢复前台可见时触发补偿检查
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        setTimeout(function() {
          runCompanionCareCheck();
        }, 1200);
      }
    });

    // 4. 监听自习室专注完成事件联动关怀
    if (window.TimeCalendarIntegrations && typeof window.TimeCalendarIntegrations.on === 'function') {
      window.TimeCalendarIntegrations.on('record_added', function(data) {
        // 如果专注时长大于等于 25 分钟，尝试触发一次专属同桌鼓励
        if (data && data.durationMinutes >= 25) {
          setTimeout(function() {
            runCompanionCareCheck();
          }, 2000);
        }
      });
    }
  }

  // 挂载至全局
  window.TimeCalendarCompanion = {
    checkCareTriggers: runCompanionCareCheck,
    getSettings: getCompanionSettings,
    saveSettings: saveCompanionSettings,
    showSettingsModal: showCompanionSettingsModal,
    showGreetingCard: showGreetingCardModal,
    generateGreetingCard: getOrGenerateAnniversaryGreetingCard,
    getRecords: loadCareRecords
  };

  // 自动启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompanionEngine);
  } else {
    initCompanionEngine();
  }

})();
