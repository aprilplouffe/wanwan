// js/fan-community-works.js — 同好社区 · 捡手机文学多作品存储与安全迁移模块（任务 06）
// 存储结构：
//   1. 作品索引：wanwan-phone-works-index-v1
//   2. 作品内容：wanwan-phone-work-data-v1:<workId>
//   3. 旧版数据：wanwan-phone-messages-v3（仅只读迁移，绝不清空或覆盖）

(function(global) {
  'use strict';

  var LEGACY_STORAGE_KEY = 'wanwan-phone-messages-v3';
  var WORKS_INDEX_KEY = 'wanwan-phone-works-index-v1';
  var WORK_DATA_PREFIX = 'wanwan-phone-work-data-v1:';
  var LEGACY_WORK_ID = 'work_legacy_v3';
  var ARCHIVES_INDEX_KEY = 'wanwan-phone-archives-index-v1';
  var ARCHIVE_DATA_PREFIX = 'wanwan-phone-archive-data-v1:';

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function storage() {
    return global.localStorage || null;
  }

  function workDataKey(workId) {
    return WORK_DATA_PREFIX + String(workId || '');
  }

  function archiveDataKey(archiveId) {
    return ARCHIVE_DATA_PREFIX + String(archiveId || '');
  }

  function generateArchiveId() {
    var store = storage();
    for (var i = 0; i < 8; i++) {
      var candidate = 'arch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      if (!store || store.getItem(archiveDataKey(candidate)) === null) {
        return candidate;
      }
    }
    return 'arch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function generateWorkId() {
    var store = storage();
    for (var i = 0; i < 8; i++) {
      var candidate = 'work_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      if (!store || store.getItem(workDataKey(candidate)) === null) {
        return candidate;
      }
    }
    return 'work_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  var DEFAULT_CREATION_MODE = 'manual';
  var VALID_CREATION_MODES = ['manual', 'ai_roleplay', 'ai_story'];
  var CREATION_MODES = [
    {
      id: 'manual',
      title: '手动创作',
      description: '自己编辑双方聊天消息',
      pendingAi: false
    },
    {
      id: 'ai_roleplay',
      title: 'AI 角色互动',
      description: '自己发送消息，AI 扮演指定角色回复',
      pendingAi: true
    },
    {
      id: 'ai_story',
      title: 'AI 剧情生成',
      description: '根据设定自动生成双方聊天剧情',
      pendingAi: true
    }
  ];

  function normalizeCreationMode(raw) {
    var val = typeof raw === 'string' ? raw.trim() : '';
    return VALID_CREATION_MODES.indexOf(val) !== -1 ? val : DEFAULT_CREATION_MODE;
  }

  var AI_REPLY_LENGTHS = ['short', 'medium', 'detailed'];
  var AI_LANGUAGE_STYLES = ['natural', 'emotional', 'dramatic'];

  function cleanStr(val, maxLen) {
    if (typeof val !== 'string') return '';
    var s = val;
    if (typeof maxLen === 'number' && maxLen > 0 && s.length > maxLen) {
      s = s.slice(0, maxLen);
    }
    return s;
  }

  function createDefaultAiSettings(defaultCharName) {
    var charName = String(defaultCharName || '').trim() || '对方';
    return {
      aiRole: {
        name: charName,
        personality: '',
        background: '',
        speakingStyle: '',
        relationshipToUser: ''
      },
      userRole: {
        identityBackground: '',
        personality: '',
        relationshipNotes: ''
      },
      story: {
        worldBackground: '',
        currentPlot: '',
        plotDirection: '',
        avoidContent: ''
      },
      preferences: {
        replyLength: 'medium',
        languageStyle: 'natural',
        allowAdvancePlot: true
      }
    };
  }

  function normalizeAiSettings(raw, defaultCharName) {
    var fallbackChar = String(defaultCharName || '').trim() || '对方';
    var base = createDefaultAiSettings(fallbackChar);
    if (!raw || typeof raw !== 'object') return base;

    var aiRole = raw.aiRole && typeof raw.aiRole === 'object' ? raw.aiRole : {};
    var userRole = raw.userRole && typeof raw.userRole === 'object' ? raw.userRole : {};
    var story = raw.story && typeof raw.story === 'object' ? raw.story : {};
    var prefs = raw.preferences && typeof raw.preferences === 'object' ? raw.preferences : {};

    var rawRoleName = cleanStr(aiRole.name, 40).trim();
    var replyLen = typeof prefs.replyLength === 'string' && AI_REPLY_LENGTHS.indexOf(prefs.replyLength) !== -1
      ? prefs.replyLength
      : base.preferences.replyLength;
    var langStyle = typeof prefs.languageStyle === 'string' && AI_LANGUAGE_STYLES.indexOf(prefs.languageStyle) !== -1
      ? prefs.languageStyle
      : base.preferences.languageStyle;

    return {
      aiRole: {
        name: rawRoleName || fallbackChar,
        personality: cleanStr(aiRole.personality, 1200),
        background: cleanStr(aiRole.background, 2000),
        speakingStyle: cleanStr(aiRole.speakingStyle, 1000),
        relationshipToUser: cleanStr(aiRole.relationshipToUser, 1000)
      },
      userRole: {
        identityBackground: cleanStr(userRole.identityBackground, 1500),
        personality: cleanStr(userRole.personality, 1000),
        relationshipNotes: cleanStr(userRole.relationshipNotes, 1000)
      },
      story: {
        worldBackground: cleanStr(story.worldBackground, 2000),
        currentPlot: cleanStr(story.currentPlot, 2000),
        plotDirection: cleanStr(story.plotDirection, 1500),
        avoidContent: cleanStr(story.avoidContent, 1500)
      },
      preferences: {
        replyLength: replyLen,
        languageStyle: langStyle,
        allowAdvancePlot: prefs.allowAdvancePlot !== false
      }
    };
  }

  var AI_REPLY_COUNT_MIN_LIMIT = 1;
  var AI_REPLY_COUNT_MAX_LIMIT = 20;
  var DEFAULT_AI_REPLY_PREFS = {
    minMessages: 1,
    maxMessages: 5
  };

  function createDefaultAiReplyPrefs() {
    return {
      minMessages: DEFAULT_AI_REPLY_PREFS.minMessages,
      maxMessages: DEFAULT_AI_REPLY_PREFS.maxMessages
    };
  }

  function normalizeAiReplyPrefs(raw) {
    var base = createDefaultAiReplyPrefs();
    if (!raw || typeof raw !== 'object') return base;
    var rawMin = Number(raw.minMessages);
    var rawMax = Number(raw.maxMessages);
    var minVal = Number.isFinite(rawMin)
      ? Math.max(AI_REPLY_COUNT_MIN_LIMIT, Math.min(AI_REPLY_COUNT_MAX_LIMIT, Math.round(rawMin)))
      : base.minMessages;
    var maxVal = Number.isFinite(rawMax)
      ? Math.max(AI_REPLY_COUNT_MIN_LIMIT, Math.min(AI_REPLY_COUNT_MAX_LIMIT, Math.round(rawMax)))
      : base.maxMessages;
    if (minVal > maxVal) {
      maxVal = minVal;
    }
    return {
      minMessages: minVal,
      maxMessages: maxVal
    };
  }

  var _msgIdSeq = 0;

  function generateMessageId() {
    _msgIdSeq = (_msgIdSeq + 1) % 1000000;
    return 'msg_' + Date.now() + '_' + _msgIdSeq + '_' + Math.random().toString(36).slice(2, 6);
  }

  function ensureMessageIds(rawItems) {
    if (!Array.isArray(rawItems)) return [];
    var seen = Object.create(null);
    return rawItems.map(function(item) {
      if (!item || typeof item !== 'object') return item;
      var curId = typeof item.id === 'string' ? item.id.trim() : '';
      if (curId && !seen[curId]) {
        seen[curId] = true;
        return item;
      }
      var nextId = generateMessageId();
      while (seen[nextId]) {
        nextId = generateMessageId();
      }
      seen[nextId] = true;
      var copy = Object.assign({}, item, { id: nextId });
      return copy;
    });
  }

  function syncMessageFloors(rawItems) {
    if (!Array.isArray(rawItems)) return [];
    var out = [];
    for (var i = 0; i < rawItems.length; i++) {
      var item = rawItems[i];
      if (!item || typeof item !== 'object') continue;
      item.floor = out.length + 1;
      out.push(item);
    }
    return out;
  }

  function moveMessageToFloor(rawItems, fromIndex, targetFloor) {
    if (!Array.isArray(rawItems) || !rawItems.length) {
      return { ok: false, error: '当前没有可移动的消息' };
    }
    var len = rawItems.length;
    var fromIdx = Number(fromIndex);
    var floorNum = Number(targetFloor);
    if (!Number.isInteger(fromIdx) || fromIdx < 0 || fromIdx >= len) {
      return { ok: false, error: '原消息位置无效' };
    }
    if (!Number.isInteger(floorNum) || floorNum < 1 || floorNum > len) {
      return { ok: false, error: '请输入 1～' + len + ' 之间的有效楼层编号' };
    }
    var toIdx = floorNum - 1;
    var list = rawItems.slice();
    var moved = list.splice(fromIdx, 1)[0];
    list.splice(toIdx, 0, moved);
    syncMessageFloors(list);
    return {
      ok: true,
      items: list,
      fromIndex: fromIdx,
      toIndex: toIdx,
      fromFloor: fromIdx + 1,
      toFloor: floorNum
    };
  }

  var TIMEZONE_OPTIONS = [
    { value: 'Asia/Shanghai', label: '北京 / 上海 (UTC+8)' },
    { value: 'Asia/Hong_Kong', label: '香港 (UTC+8)' },
    { value: 'Asia/Taipei', label: '台北 (UTC+8)' },
    { value: 'Asia/Singapore', label: '新加坡 (UTC+8)' },
    { value: 'Asia/Tokyo', label: '东京 (UTC+9)' },
    { value: 'Asia/Seoul', label: '首尔 (UTC+9)' },
    { value: 'Australia/Sydney', label: '悉尼 (UTC+10/+11)' },
    { value: 'Europe/London', label: '伦敦 (UTC+0/+1)' },
    { value: 'Europe/Paris', label: '巴黎 (UTC+1/+2)' },
    { value: 'America/New_York', label: '纽约 (UTC-5/-4)' },
    { value: 'America/Los_Angeles', label: '洛杉矶 (UTC-8/-7)' },
    { value: 'UTC', label: '世界协调时 (UTC)' }
  ];

  function detectDefaultTimeZone() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && typeof tz === 'string') return tz;
    } catch (_) {}
    return 'Asia/Shanghai';
  }

  function pad2Num(n) {
    return String(n).padStart(2, '0');
  }

  function formatLocalTodayStr(nowMs) {
    var d = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
    return d.getFullYear() + '-' + pad2Num(d.getMonth() + 1) + '-' + pad2Num(d.getDate());
  }

  function parseVirtualDateTimeToMs(dateStr, timeStr) {
    var ds = typeof dateStr === 'string' ? dateStr.trim() : '';
    var ts = typeof timeStr === 'string' ? timeStr.trim() : '';
    var dm = ds.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    var tm = ts.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    var now = new Date();
    var y = dm ? parseInt(dm[1], 10) : now.getFullYear();
    var mo = dm ? Math.max(1, Math.min(12, parseInt(dm[2], 10))) : (now.getMonth() + 1);
    var da = dm ? Math.max(1, Math.min(31, parseInt(dm[3], 10))) : now.getDate();
    var hh = tm ? Math.max(0, Math.min(23, parseInt(tm[1], 10))) : 9;
    var mm = tm ? Math.max(0, Math.min(59, parseInt(tm[2], 10))) : 0;
    var ss = tm && tm[3] ? Math.max(0, Math.min(59, parseInt(tm[3], 10))) : 0;
    return Date.UTC(y, mo - 1, da, hh, mm, ss);
  }

  function formatVirtualMs(ms) {
    var safeMs = Number.isFinite(ms) ? ms : Date.UTC(2026, 0, 1, 9, 0, 0);
    var d = new Date(safeMs);
    var date = d.getUTCFullYear() + '-' + pad2Num(d.getUTCMonth() + 1) + '-' + pad2Num(d.getUTCDate());
    var time = pad2Num(d.getUTCHours()) + ':' + pad2Num(d.getUTCMinutes());
    var sec = pad2Num(d.getUTCSeconds());
    return {
      date: date,
      time: time,
      seconds: sec,
      full: date + ' ' + time,
      fullWithSec: date + ' ' + time + ':' + sec,
      ms: safeMs
    };
  }

  function clampVirtualSpeed(val) {
    var num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return 1;
    var clamped = Math.max(0.1, Math.min(1440, num));
    return Math.round(clamped * 100) / 100;
  }

  function createDefaultTimeSettings(nowRealMs) {
    var now = Number.isFinite(nowRealMs) ? nowRealMs : Date.now();
    var startDate = formatLocalTodayStr(now);
    var startTime = '09:00';
    return {
      showBubbleTime: false,
      mode: 'realtime',
      timeZone: detectDefaultTimeZone(),
      virtualStartDate: startDate,
      virtualStartTime: startTime,
      virtualSpeed: 1,
      virtualPaused: false,
      virtualBaseMs: parseVirtualDateTimeToMs(startDate, startTime),
      virtualAnchorRealMs: now
    };
  }

  function normalizeTimeSettings(raw, nowRealMs) {
    var now = Number.isFinite(nowRealMs) ? nowRealMs : Date.now();
    var base = createDefaultTimeSettings(now);
    if (!raw || typeof raw !== 'object') return base;

    var mode = raw.mode === 'virtual' ? 'virtual' : 'realtime';
    var tz = typeof raw.timeZone === 'string' && raw.timeZone.trim() ? raw.timeZone.trim() : base.timeZone;
    var startDate = typeof raw.virtualStartDate === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(raw.virtualStartDate.trim())
      ? raw.virtualStartDate.trim()
      : base.virtualStartDate;
    var startTime = typeof raw.virtualStartTime === 'string' && /^\d{1,2}:\d{1,2}$/.test(raw.virtualStartTime.trim())
      ? raw.virtualStartTime.trim()
      : base.virtualStartTime;
    var speed = clampVirtualSpeed(raw.virtualSpeed);
    var paused = Boolean(raw.virtualPaused);
    var defaultBaseMs = parseVirtualDateTimeToMs(startDate, startTime);
    var virtualBaseMs = Number.isFinite(Number(raw.virtualBaseMs)) ? Number(raw.virtualBaseMs) : defaultBaseMs;
    var virtualAnchorRealMs = Number.isFinite(Number(raw.virtualAnchorRealMs)) && Number(raw.virtualAnchorRealMs) > 0
      ? Number(raw.virtualAnchorRealMs)
      : now;

    return {
      showBubbleTime: Boolean(raw.showBubbleTime),
      mode: mode,
      timeZone: tz,
      virtualStartDate: startDate,
      virtualStartTime: startTime,
      virtualSpeed: speed,
      virtualPaused: paused,
      virtualBaseMs: virtualBaseMs,
      virtualAnchorRealMs: virtualAnchorRealMs
    };
  }

  function formatRealTimeInZone(nowMs, timeZone) {
    var d = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
    var tz = timeZone || detectDefaultTimeZone();
    try {
      var fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      var parts = fmt.formatToParts(d);
      var map = Object.create(null);
      for (var i = 0; i < parts.length; i++) {
        map[parts[i].type] = parts[i].value;
      }
      var hh = map.hour === '24' ? '00' : pad2Num(parseInt(map.hour || '0', 10) || 0);
      var mm = pad2Num(parseInt(map.minute || '0', 10) || 0);
      var ss = pad2Num(parseInt(map.second || '0', 10) || 0);
      var dateStr = (map.year || String(d.getFullYear())) + '-' + (map.month || pad2Num(d.getMonth() + 1)) + '-' + (map.day || pad2Num(d.getDate()));
      var timeStr = hh + ':' + mm;
      return {
        date: dateStr,
        time: timeStr,
        seconds: ss,
        full: dateStr + ' ' + timeStr,
        fullWithSec: dateStr + ' ' + timeStr + ':' + ss,
        ms: d.getTime(),
        timeZone: tz
      };
    } catch (_) {
      var fallbackDate = d.getFullYear() + '-' + pad2Num(d.getMonth() + 1) + '-' + pad2Num(d.getDate());
      var fallbackTime = pad2Num(d.getHours()) + ':' + pad2Num(d.getMinutes());
      var fallbackSec = pad2Num(d.getSeconds());
      return {
        date: fallbackDate,
        time: fallbackTime,
        seconds: fallbackSec,
        full: fallbackDate + ' ' + fallbackTime,
        fullWithSec: fallbackDate + ' ' + fallbackTime + ':' + fallbackSec,
        ms: d.getTime(),
        timeZone: tz
      };
    }
  }

  function resolveWorkCurrentTime(rawTimeSettings, nowRealMs) {
    var now = Number.isFinite(nowRealMs) ? nowRealMs : Date.now();
    var ts = normalizeTimeSettings(rawTimeSettings, now);
    if (ts.mode === 'virtual') {
      var elapsedReal = Math.max(0, now - ts.virtualAnchorRealMs);
      var curVirtualMs = ts.virtualPaused
        ? ts.virtualBaseMs
        : (ts.virtualBaseMs + elapsedReal * ts.virtualSpeed);
      var vf = formatVirtualMs(curVirtualMs);
      return {
        mode: 'virtual',
        date: vf.date,
        time: vf.time,
        seconds: vf.seconds,
        full: vf.full,
        fullWithSec: vf.fullWithSec,
        ms: vf.ms,
        paused: ts.virtualPaused,
        speed: ts.virtualSpeed,
        timeZone: ''
      };
    }
    var rf = formatRealTimeInZone(now, ts.timeZone);
    return {
      mode: 'realtime',
      date: rf.date,
      time: rf.time,
      seconds: rf.seconds,
      full: rf.full,
      fullWithSec: rf.fullWithSec,
      ms: rf.ms,
      paused: false,
      speed: 1,
      timeZone: rf.timeZone
    };
  }

  function pauseVirtualClock(rawTimeSettings, nowRealMs) {
    var now = Number.isFinite(nowRealMs) ? nowRealMs : Date.now();
    var ts = normalizeTimeSettings(rawTimeSettings, now);
    var cur = resolveWorkCurrentTime(Object.assign({}, ts, { mode: 'virtual' }), now);
    return Object.assign({}, ts, {
      virtualBaseMs: cur.ms,
      virtualAnchorRealMs: now,
      virtualPaused: true
    });
  }

  function resumeVirtualClock(rawTimeSettings, nowRealMs) {
    var now = Number.isFinite(nowRealMs) ? nowRealMs : Date.now();
    var ts = normalizeTimeSettings(rawTimeSettings, now);
    return Object.assign({}, ts, {
      virtualAnchorRealMs: now,
      virtualPaused: false
    });
  }

  function updateVirtualClockSpeed(rawTimeSettings, nextSpeed, nowRealMs) {
    var now = Number.isFinite(nowRealMs) ? nowRealMs : Date.now();
    var ts = normalizeTimeSettings(rawTimeSettings, now);
    var cur = resolveWorkCurrentTime(Object.assign({}, ts, { mode: 'virtual' }), now);
    return Object.assign({}, ts, {
      virtualBaseMs: cur.ms,
      virtualAnchorRealMs: now,
      virtualSpeed: clampVirtualSpeed(nextSpeed)
    });
  }

  function resetVirtualClockStart(rawTimeSettings, dateStr, timeStr, nowRealMs) {
    var now = Number.isFinite(nowRealMs) ? nowRealMs : Date.now();
    var ts = normalizeTimeSettings(rawTimeSettings, now);
    var nextDate = typeof dateStr === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr.trim())
      ? dateStr.trim()
      : ts.virtualStartDate;
    var nextTime = typeof timeStr === 'string' && /^\d{1,2}:\d{1,2}$/.test(timeStr.trim())
      ? timeStr.trim()
      : ts.virtualStartTime;
    return Object.assign({}, ts, {
      virtualStartDate: nextDate,
      virtualStartTime: nextTime,
      virtualBaseMs: parseVirtualDateTimeToMs(nextDate, nextTime),
      virtualAnchorRealMs: now
    });
  }

  function stampMessageTime(msg, rawTimeSettings, nowRealMs, forceOverwrite) {
    if (!msg || typeof msg !== 'object' || msg.type === 'date') return msg;
    if (!forceOverwrite && msg.sentTime && msg.sentTimeFull) return msg;
    var snap = resolveWorkCurrentTime(rawTimeSettings, nowRealMs);
    msg.sentTime = snap.time;
    msg.sentDate = snap.date;
    msg.sentTimeFull = snap.full;
    msg.sentTimestamp = snap.ms;
    msg.sentTimeMode = snap.mode;
    if (snap.timeZone) {
      msg.sentTimeZone = snap.timeZone;
    }
    return msg;
  }

  var DEFAULT_APPEARANCE = {
    bgType: 'color',
    bgColor: '#abc6d9',
    bgImageAssetId: '',
    bgImageFit: 'cover',
    userBubbleColor: '#fff133',
    charBubbleColor: '#ffffff',
    appearanceVersion: 2
  };

  function normalizeHexColor(val, fallback) {
    if (typeof val !== 'string') return fallback;
    var trimmed = val.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
    if (/^#[0-9a-f]{3}$/.test(trimmed)) {
      return '#' + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3];
    }
    return fallback;
  }

  function normalizeAppearance(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var bgImageAssetId = typeof src.bgImageAssetId === 'string' ? src.bgImageAssetId : '';
    var bgType = src.bgType === 'image' && bgImageAssetId ? 'image' : 'color';
    var bgColor = normalizeHexColor(src.bgColor, DEFAULT_APPEARANCE.bgColor);
    var userBubbleColor = normalizeHexColor(src.userBubbleColor, DEFAULT_APPEARANCE.userBubbleColor);
    var charBubbleColor = normalizeHexColor(src.charBubbleColor, DEFAULT_APPEARANCE.charBubbleColor);

    // 将历史版本未自定义过的旧默认外观自动升级为原版晴空蓝 + 白/黄气泡
    if (
      src.appearanceVersion !== 2 &&
      bgType === 'color' &&
      !bgImageAssetId &&
      bgColor === '#e8ede8' &&
      userBubbleColor === '#d9e3d2' &&
      charBubbleColor === '#fffefa'
    ) {
      bgColor = DEFAULT_APPEARANCE.bgColor;
      userBubbleColor = DEFAULT_APPEARANCE.userBubbleColor;
      charBubbleColor = DEFAULT_APPEARANCE.charBubbleColor;
    }

    return {
      bgType: bgType,
      bgColor: bgColor,
      bgImageAssetId: bgImageAssetId,
      bgImageFit: src.bgImageFit === 'contain' ? 'contain' : 'cover',
      userBubbleColor: userBubbleColor,
      charBubbleColor: charBubbleColor,
      appearanceVersion: 2
    };
  }

  var VALID_ROLE_SOURCES = ['community_persona', 'char', 'npc'];

  function normalizeBoundRoleRef(rawRef, legacyPersonaId) {
    if (rawRef && typeof rawRef === 'object') {
      var src = typeof rawRef.source === 'string' ? rawRef.source.trim() : '';
      var idStr = rawRef.id !== undefined && rawRef.id !== null ? String(rawRef.id).trim() : '';
      if (VALID_ROLE_SOURCES.indexOf(src) !== -1 && idStr) {
        return { source: src, id: idStr };
      }
    }
    var legacyId = typeof legacyPersonaId === 'string' ? legacyPersonaId.trim() : '';
    if (legacyId) {
      return { source: 'community_persona', id: legacyId };
    }
    return null;
  }

  function cloneBoundRoleRef(ref) {
    return ref ? { source: ref.source, id: ref.id } : null;
  }

  function clampScore(val, fallback) {
    var num = Number(val);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Math.min(100, Math.round(num)));
  }

  function createDefaultEmotionState() {
    return {
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
    };
  }

  function normalizeEmotionState(raw) {
    var base = createDefaultEmotionState();
    if (!raw || typeof raw !== 'object') return base;
    var events = [];
    if (Array.isArray(raw.recentStoryEvents)) {
      for (var i = 0; i < raw.recentStoryEvents.length; i++) {
        var ev = raw.recentStoryEvents[i];
        if (!ev || typeof ev !== 'object') continue;
        var evText = cleanStr(String(ev.event || ''), 240).trim();
        if (!evText) continue;
        events.push({
          event: evText,
          impact: cleanStr(String(ev.impact || ''), 160).trim(),
          emotionShift: cleanStr(String(ev.emotionShift || ''), 80).trim(),
          timestamp: typeof ev.timestamp === 'number' && Number.isFinite(ev.timestamp) ? ev.timestamp : 0
        });
      }
    }
    if (events.length > 12) {
      events = events.slice(events.length - 12);
    }
    return {
      relationshipStage: cleanStr(String(raw.relationshipStage || ''), 40).trim() || base.relationshipStage,
      intimacy: clampScore(raw.intimacy, base.intimacy),
      trust: clampScore(raw.trust, base.trust),
      affection: clampScore(raw.affection, base.affection),
      currentEmotion: cleanStr(String(raw.currentEmotion || ''), 40).trim() || base.currentEmotion,
      emotionIntensity: clampScore(raw.emotionIntensity, base.emotionIntensity),
      recentStoryEvents: events,
      relationshipSummary: cleanStr(String(raw.relationshipSummary || ''), 500).trim(),
      smallTalkStreak: Math.max(0, Math.min(999, Math.round(Number(raw.smallTalkStreak) || 0))),
      lastUpdatedAt: typeof raw.lastUpdatedAt === 'number' && Number.isFinite(raw.lastUpdatedAt) ? raw.lastUpdatedAt : 0
    };
  }

  function createDefaultAiMemory() {
    return {
      historySummary: '',
      summarizedCount: 0,
      lastSummaryAt: 0,
      lastModeUsed: '',
      turnCount: 0
    };
  }

  function normalizeAiMemory(raw) {
    var base = createDefaultAiMemory();
    if (!raw || typeof raw !== 'object') return base;
    return {
      historySummary: cleanStr(String(raw.historySummary || ''), 1600).trim(),
      summarizedCount: Math.max(0, Math.round(Number(raw.summarizedCount) || 0)),
      lastSummaryAt: typeof raw.lastSummaryAt === 'number' && Number.isFinite(raw.lastSummaryAt) ? raw.lastSummaryAt : 0,
      lastModeUsed: cleanStr(String(raw.lastModeUsed || ''), 30).trim(),
      turnCount: Math.max(0, Math.round(Number(raw.turnCount) || 0))
    };
  }

  function normalizeWorkData(raw, fallbackMeta) {
    var now = Date.now();
    var meta = fallbackMeta || {};
    var src = raw && typeof raw === 'object' ? raw : {};
    var resolvedChar = String(src.char || meta.char || '对方');

    var hasExplicitRef = Object.prototype.hasOwnProperty.call(src, 'boundRoleRef');
    var hasExplicitLegacy = Object.prototype.hasOwnProperty.call(src, 'boundPersonaId');
    var rawRef = hasExplicitRef ? src.boundRoleRef : meta.boundRoleRef;
    var rawLegacy = hasExplicitLegacy ? src.boundPersonaId : (hasExplicitRef ? '' : meta.boundPersonaId);
    var boundRoleRef = normalizeBoundRoleRef(rawRef, rawLegacy);
    var syncedPersonaId = (boundRoleRef && boundRoleRef.source === 'community_persona') ? boundRoleRef.id : '';

    return {
      id: String(src.id || meta.id || ''),
      title: String(src.title || meta.title || '未命名作品').trim() || '未命名作品',
      char: resolvedChar,
      user: String(src.user || meta.user || '我'),
      charAvatarAssetId: typeof src.charAvatarAssetId === 'string' ? src.charAvatarAssetId : (typeof meta.charAvatarAssetId === 'string' ? meta.charAvatarAssetId : ''),
      userAvatarAssetId: typeof src.userAvatarAssetId === 'string' ? src.userAvatarAssetId : (typeof meta.userAvatarAssetId === 'string' ? meta.userAvatarAssetId : ''),
      appearance: normalizeAppearance(src.appearance),
      creationMode: normalizeCreationMode(src.creationMode !== undefined ? src.creationMode : meta.creationMode),
      boundPersonaId: syncedPersonaId,
      boundRoleRef: boundRoleRef,
      aiSettings: normalizeAiSettings(src.aiSettings, resolvedChar),
      aiReplyPrefs: normalizeAiReplyPrefs(src.aiReplyPrefs),
      timeSettings: normalizeTimeSettings(src.timeSettings, now),
      emotionState: normalizeEmotionState(src.emotionState),
      aiMemory: normalizeAiMemory(src.aiMemory),
      topic: typeof src.topic === 'string' ? src.topic : '',
      join: src.join !== false,
      showTools: Boolean(src.showTools),
      isLegacy: Boolean(src.isLegacy || meta.isLegacy),
      isCompleted: Boolean(src.isCompleted || meta.isCompleted),
      completedAt: typeof src.completedAt === 'number' && Number.isFinite(src.completedAt)
        ? src.completedAt
        : (typeof meta.completedAt === 'number' && Number.isFinite(meta.completedAt) ? meta.completedAt : 0),
      lastArchiveId: typeof src.lastArchiveId === 'string'
        ? src.lastArchiveId
        : (typeof meta.lastArchiveId === 'string' ? meta.lastArchiveId : ''),
      createdAt: typeof src.createdAt === 'number' ? src.createdAt : (typeof meta.createdAt === 'number' ? meta.createdAt : now),
      updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : (typeof meta.updatedAt === 'number' ? meta.updatedAt : now),
      items: syncMessageFloors(ensureMessageIds(src.items))
    };
  }

  function toMeta(workData) {
    var ref = normalizeBoundRoleRef(workData.boundRoleRef, workData.boundPersonaId);
    return {
      id: workData.id,
      title: workData.title,
      char: workData.char || '对方',
      user: workData.user || '我',
      creationMode: normalizeCreationMode(workData.creationMode),
      boundPersonaId: (ref && ref.source === 'community_persona') ? ref.id : '',
      boundRoleRef: cloneBoundRoleRef(ref),
      messageCount: Array.isArray(workData.items) ? workData.items.length : 0,
      createdAt: workData.createdAt,
      updatedAt: workData.updatedAt,
      isLegacy: Boolean(workData.isLegacy),
      isCompleted: Boolean(workData.isCompleted),
      completedAt: typeof workData.completedAt === 'number' && Number.isFinite(workData.completedAt) ? workData.completedAt : 0,
      lastArchiveId: typeof workData.lastArchiveId === 'string' ? workData.lastArchiveId : ''
    };
  }

  function sortWorks(works) {
    return works.slice().sort(function(a, b) {
      var diff = (b.updatedAt || 0) - (a.updatedAt || 0);
      if (diff !== 0) return diff;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function readIndexRaw() {
    var store = storage();
    if (!store) {
      return { exists: false, data: { version: 1, migratedFromV3: false, activeWorkId: '', works: [] } };
    }
    var raw = store.getItem(WORKS_INDEX_KEY);
    if (!raw) {
      return { exists: false, data: { version: 1, migratedFromV3: false, activeWorkId: '', works: [] } };
    }
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.works)) {
      throw new Error('作品索引数据格式异常');
    }
    return {
      exists: true,
      data: {
        version: parsed.version || 1,
        migratedFromV3: Boolean(parsed.migratedFromV3),
        activeWorkId: parsed.activeWorkId ? String(parsed.activeWorkId) : '',
        works: parsed.works.slice()
      }
    };
  }

  function writeIndex(indexObj) {
    var store = storage();
    if (!store) return;
    store.setItem(WORKS_INDEX_KEY, JSON.stringify({
      version: 1,
      migratedFromV3: Boolean(indexObj.migratedFromV3),
      activeWorkId: indexObj.activeWorkId || '',
      works: sortWorks(indexObj.works || [])
    }));
  }

  function deriveLegacyTitle(legacyObj) {
    var orig = legacyObj && typeof legacyObj.title === 'string' ? legacyObj.title.trim() : '';
    if (orig && orig !== '捡手机文学' && orig !== '旧版作品') {
      return '旧版作品 · ' + orig;
    }
    return '旧版作品';
  }

  // 安全、幂等的旧版数据迁移：
  // - 仅当存在未迁移的 wanwan-phone-messages-v3 且索引内尚无旧版作品时执行
  // - 绝不清除或修改 wanwan-phone-messages-v3 原键
  // - 写入失败时回滚本次新建键，保留原始状态
  function ensureInitialized() {
    var store = storage();
    if (!store) {
      return { ok: true, index: { version: 1, migratedFromV3: true, activeWorkId: '', works: [] } };
    }

    var readRes;
    try {
      readRes = readIndexRaw();
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : '读取作品索引失败' };
    }

    var index = readRes.data;
    var hasLegacyWork = index.works.some(function(w) {
      return w && (w.id === LEGACY_WORK_ID || w.isLegacy === true);
    });

    if (index.migratedFromV3 || hasLegacyWork) {
      if (!index.migratedFromV3 && hasLegacyWork) {
        index.migratedFromV3 = true;
        try { writeIndex(index); } catch (_) {}
      }
      return { ok: true, index: index };
    }

    var legacyRaw = store.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) {
      index.migratedFromV3 = true;
      if (readRes.exists) {
        try { writeIndex(index); } catch (_) {}
      }
      return { ok: true, index: index };
    }

    var legacyObj;
    try {
      legacyObj = JSON.parse(legacyRaw);
    } catch (err) {
      return { ok: false, error: '旧版聊天记录格式解析失败，已保留原始数据' };
    }

    if (!legacyObj || typeof legacyObj !== 'object' || !Array.isArray(legacyObj.items)) {
      index.migratedFromV3 = true;
      if (readRes.exists) {
        try { writeIndex(index); } catch (_) {}
      }
      return { ok: true, index: index };
    }

    // 只有旧记录非空时迁移为「旧版作品」
    if (legacyObj.items.length === 0) {
      index.migratedFromV3 = true;
      if (readRes.exists) {
        try { writeIndex(index); } catch (_) {}
      }
      return { ok: true, index: index };
    }

    var targetKey = workDataKey(LEGACY_WORK_ID);
    var existingLegacyWorkRaw = store.getItem(targetKey);
    var wroteLegacyDataHere = false;
    var legacyData = null;

    if (existingLegacyWorkRaw) {
      try {
        legacyData = normalizeWorkData(JSON.parse(existingLegacyWorkRaw), {
          id: LEGACY_WORK_ID,
          title: deriveLegacyTitle(legacyObj),
          isLegacy: true
        });
      } catch (_) {
        return { ok: false, error: '读取已迁移旧版作品失败，已终止写入' };
      }
    } else {
      var now = Date.now();
      legacyData = normalizeWorkData(clone(legacyObj), {
        id: LEGACY_WORK_ID,
        title: deriveLegacyTitle(legacyObj),
        isLegacy: true,
        createdAt: now,
        updatedAt: now
      });
      legacyData.id = LEGACY_WORK_ID;
      legacyData.title = deriveLegacyTitle(legacyObj);
      legacyData.isLegacy = true;
    }

    try {
      if (!existingLegacyWorkRaw) {
        store.setItem(targetKey, JSON.stringify(legacyData));
        wroteLegacyDataHere = true;
      }
      index.works.push(toMeta(legacyData));
      index.migratedFromV3 = true;
      if (!index.activeWorkId) {
        index.activeWorkId = legacyData.id;
      }
      writeIndex(index);
      return { ok: true, index: index, migrated: true };
    } catch (err) {
      if (wroteLegacyDataHere) {
        try { store.removeItem(targetKey); } catch (_) {}
      }
      return { ok: false, error: err && err.message ? err.message : '迁移存储失败，已保留原始数据' };
    }
  }

  function listWorks() {
    var res = ensureInitialized();
    if (!res.ok) {
      return { ok: false, error: res.error, works: [] };
    }
    return {
      ok: true,
      works: sortWorks(res.index.works || []),
      activeWorkId: res.index.activeWorkId || ''
    };
  }

  function createWork(title) {
    var cleanTitle = String(title || '').trim();
    if (!cleanTitle) {
      return { ok: false, error: '请输入作品名称' };
    }
    var initRes = ensureInitialized();
    if (!initRes.ok) {
      return { ok: false, error: initRes.error };
    }

    var store = storage();
    var index = initRes.index;
    var now = Date.now();
    var workId = generateWorkId();
    var workData = {
      id: workId,
      title: cleanTitle,
      char: '对方',
      user: '我',
      charAvatarAssetId: '',
      userAvatarAssetId: '',
      appearance: clone(DEFAULT_APPEARANCE),
      creationMode: DEFAULT_CREATION_MODE,
      boundPersonaId: '',
      boundRoleRef: null,
      aiSettings: createDefaultAiSettings('对方'),
      aiReplyPrefs: createDefaultAiReplyPrefs(),
      timeSettings: createDefaultTimeSettings(now),
      emotionState: createDefaultEmotionState(),
      aiMemory: createDefaultAiMemory(),
      topic: '',
      join: true,
      showTools: false,
      isLegacy: false,
      isCompleted: false,
      completedAt: 0,
      lastArchiveId: '',
      createdAt: now,
      updatedAt: now,
      items: []
    };

    var key = workDataKey(workId);
    var wroteWorkData = false;
    try {
      if (store) {
        store.setItem(key, JSON.stringify(workData));
        wroteWorkData = true;
      }
      index.works.push(toMeta(workData));
      index.activeWorkId = workId;
      writeIndex(index);
      return { ok: true, work: toMeta(workData), data: workData };
    } catch (err) {
      if (store && wroteWorkData) {
        try { store.removeItem(key); } catch (_) {}
      }
      return { ok: false, error: '存储空间不足，新建作品失败' };
    }
  }

  function getWorkData(workId) {
    if (!workId) return null;
    var initRes = ensureInitialized();
    if (!initRes.ok) return null;

    var meta = null;
    var works = initRes.index.works || [];
    for (var i = 0; i < works.length; i++) {
      if (works[i] && works[i].id === workId) {
        meta = works[i];
        break;
      }
    }

    var store = storage();
    if (!store) return meta ? normalizeWorkData({}, meta) : null;
    try {
      var raw = store.getItem(workDataKey(workId));
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return normalizeWorkData(parsed, meta);
    } catch (_) {
      return null;
    }
  }

  function setActiveWorkId(workId) {
    var initRes = ensureInitialized();
    if (!initRes.ok) return false;
    initRes.index.activeWorkId = workId || '';
    try {
      writeIndex(initRes.index);
      return true;
    } catch (_) {
      return false;
    }
  }

  function saveWorkData(workId, stateObj, options) {
    if (!workId || !stateObj) return false;
    options = options || {};
    var touchUpdatedAt = options.touchUpdatedAt !== false;

    var initRes = ensureInitialized();
    if (!initRes.ok) return false;

    var store = storage();
    var index = initRes.index;
    var metaIdx = -1;
    for (var i = 0; i < index.works.length; i++) {
      if (index.works[i] && index.works[i].id === workId) {
        metaIdx = i;
        break;
      }
    }

    var existingMeta = metaIdx >= 0 ? index.works[metaIdx] : null;
    var now = Date.now();
    var payload = normalizeWorkData(stateObj, existingMeta || { id: workId });
    payload.id = workId;
    if (touchUpdatedAt) {
      payload.updatedAt = now;
    }

    try {
      if (store) {
        store.setItem(workDataKey(workId), JSON.stringify(payload));
      }
      var nextMeta = toMeta(payload);
      if (metaIdx >= 0) {
        index.works[metaIdx] = nextMeta;
      } else {
        index.works.push(nextMeta);
      }
      index.activeWorkId = workId;
      writeIndex(index);
      return true;
    } catch (_) {
      return false;
    }
  }

  function renameWork(workId, nextTitle) {
    var cleanTitle = String(nextTitle || '').trim();
    if (!workId || !cleanTitle) {
      return { ok: false, error: '作品名称不能为空' };
    }
    var data = getWorkData(workId);
    if (!data) {
      return { ok: false, error: '未找到对应作品' };
    }
    data.title = cleanTitle;
    var ok = saveWorkData(workId, data, { touchUpdatedAt: true });
    if (!ok) {
      return { ok: false, error: '保存重命名失败' };
    }
    return { ok: true, work: toMeta(data) };
  }

  function buildWorkExcerpt(items) {
    var list = Array.isArray(items) ? items : [];
    var parts = [];
    for (var i = 0; i < list.length; i++) {
      var raw = list[i];
      if (!raw || raw.type === 'date') continue;
      var it = (raw.type === 'withdraw' && raw.original) ? raw.original : raw;
      var line = '';
      if (it.type === 'text') line = String(it.text || '').trim();
      else if (it.type === 'text_voice' || it.type === 'voice') line = '[语音] ' + String(it.text || it.content || '').trim();
      else if (it.type === 'image') line = it.isSticker ? '[表情包]' : ('[图片] ' + String(it.text || it.alt || '').trim());
      else if (it.type === 'location') line = '[定位] ' + String(it.name || '').trim();
      else if (it.type === 'transfer') line = '[转账 ' + String(it.amount || '') + ']';
      else if (it.type === 'call') line = it.video ? '[视频通话]' : '[语音通话]';
      if (line) parts.push(line);
      if (parts.length >= 2) break;
    }
    var joined = parts.join(' / ').replace(/\s+/g, ' ').trim();
    return joined.length > 72 ? (joined.slice(0, 71) + '…') : joined;
  }

  function collectRecordAssetIds(record) {
    var map = Object.create(null);
    if (!record || typeof record !== 'object') return [];
    if (record.charAvatarAssetId) map[String(record.charAvatarAssetId)] = true;
    if (record.userAvatarAssetId) map[String(record.userAvatarAssetId)] = true;
    if (record.appearance && record.appearance.bgImageAssetId) {
      map[String(record.appearance.bgImageAssetId)] = true;
    }
    var items = Array.isArray(record.items) ? record.items : [];
    for (var i = 0; i < items.length; i++) {
      var m = items[i];
      if (!m) continue;
      if (m.assetId && !m.isSticker) map[String(m.assetId)] = true;
      if (m.original && m.original.assetId && !m.original.isSticker) map[String(m.original.assetId)] = true;
    }
    return Object.keys(map);
  }

  function sortArchives(archives) {
    return (archives || []).slice().sort(function(a, b) {
      var diff = (b.archivedAt || b.completedAt || 0) - (a.archivedAt || a.completedAt || 0);
      if (diff !== 0) return diff;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }

  function readArchivesIndexRaw() {
    var store = storage();
    if (!store) return { version: 1, archives: [] };
    try {
      var raw = store.getItem(ARCHIVES_INDEX_KEY);
      if (!raw) return { version: 1, archives: [] };
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.archives)) {
        return { version: 1, archives: [] };
      }
      return {
        version: parsed.version || 1,
        archives: parsed.archives.slice()
      };
    } catch (_) {
      return { version: 1, archives: [] };
    }
  }

  function writeArchivesIndex(indexObj) {
    var store = storage();
    if (!store) return;
    store.setItem(ARCHIVES_INDEX_KEY, JSON.stringify({
      version: 1,
      archives: sortArchives(indexObj && indexObj.archives ? indexObj.archives : [])
    }));
  }

  function toArchiveMeta(archiveData) {
    var items = Array.isArray(archiveData.items) ? archiveData.items : [];
    return {
      archiveId: String(archiveData.archiveId || ''),
      sourceWorkId: String(archiveData.sourceWorkId || archiveData.id || ''),
      category: String(archiveData.category || 'phone_fiction'),
      categoryLabel: String(archiveData.categoryLabel || '捡手机文学'),
      title: String(archiveData.title || '未命名作品'),
      char: String(archiveData.char || '对方'),
      user: String(archiveData.user || '我'),
      creationMode: normalizeCreationMode(archiveData.creationMode),
      messageCount: items.length,
      excerpt: String(archiveData.excerpt || buildWorkExcerpt(items)),
      completedAt: Number(archiveData.completedAt) || Date.now(),
      archivedAt: Number(archiveData.archivedAt) || Date.now(),
      updatedAt: Number(archiveData.updatedAt) || Date.now()
    };
  }

  function listArchives() {
    var idx = readArchivesIndexRaw();
    return {
      ok: true,
      archives: sortArchives(idx.archives || [])
    };
  }

  function getArchiveData(archiveId) {
    if (!archiveId) return null;
    var store = storage();
    if (!store) return null;
    try {
      var raw = store.getItem(archiveDataKey(archiveId));
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      var normalized = normalizeWorkData(parsed, {
        id: parsed.sourceWorkId || parsed.id || archiveId,
        title: parsed.title,
        char: parsed.char,
        user: parsed.user,
        isCompleted: true,
        completedAt: parsed.completedAt || parsed.archivedAt || Date.now(),
        lastArchiveId: String(archiveId)
      });
      normalized.archiveId = String(parsed.archiveId || archiveId);
      normalized.sourceWorkId = String(parsed.sourceWorkId || parsed.id || '');
      normalized.category = String(parsed.category || 'phone_fiction');
      normalized.categoryLabel = String(parsed.categoryLabel || '捡手机文学');
      normalized.archivedAt = Number(parsed.archivedAt) || normalized.completedAt || Date.now();
      normalized.completedAt = Number(parsed.completedAt) || normalized.archivedAt;
      normalized.isCompleted = true;
      normalized.excerpt = String(parsed.excerpt || buildWorkExcerpt(normalized.items));
      return normalized;
    } catch (_) {
      return null;
    }
  }

  function completeAndArchiveWork(workId, overrideState) {
    if (!workId) {
      return { ok: false, error: '未找到要完结的作品' };
    }
    var initRes = ensureInitialized();
    if (!initRes.ok) {
      return { ok: false, error: initRes.error || '读取作品索引失败' };
    }
    var baseData = overrideState && typeof overrideState === 'object'
      ? normalizeWorkData(overrideState, { id: workId })
      : getWorkData(workId);
    if (!baseData) {
      return { ok: false, error: '未能读取该作品数据' };
    }

    var now = Date.now();
    var store = storage();
    var archIndex = readArchivesIndexRaw();
    var existingArchId = baseData.lastArchiveId || '';
    var hasExistingArchive = Boolean(existingArchId && archIndex.archives.some(function(a) {
      return a && a.archiveId === existingArchId;
    }));
    var archiveId = hasExistingArchive ? existingArchId : generateArchiveId();

    baseData.id = workId;
    baseData.isCompleted = true;
    baseData.completedAt = now;
    baseData.lastArchiveId = archiveId;
    baseData.updatedAt = now;

    var snapshot = clone(baseData);
    snapshot.archiveId = archiveId;
    snapshot.sourceWorkId = workId;
    snapshot.category = 'phone_fiction';
    snapshot.categoryLabel = '捡手机文学';
    snapshot.archivedAt = now;
    snapshot.completedAt = now;
    snapshot.isCompleted = true;
    snapshot.excerpt = buildWorkExcerpt(snapshot.items);

    try {
      if (store) {
        store.setItem(archiveDataKey(archiveId), JSON.stringify(snapshot));
      }
      var nextMeta = toArchiveMeta(snapshot);
      var replaced = false;
      for (var i = 0; i < archIndex.archives.length; i++) {
        if (archIndex.archives[i] && archIndex.archives[i].archiveId === archiveId) {
          archIndex.archives[i] = nextMeta;
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        archIndex.archives.push(nextMeta);
      }
      writeArchivesIndex(archIndex);
    } catch (err) {
      return { ok: false, error: '写入存档失败，可能是本地存储空间不足' };
    }

    saveWorkData(workId, baseData, { touchUpdatedAt: false });

    return {
      ok: true,
      updatedExisting: hasExistingArchive,
      work: toMeta(baseData),
      workData: baseData,
      archive: toArchiveMeta(snapshot),
      archiveData: snapshot
    };
  }

  function deleteWork(workId) {
    if (!workId) {
      return { ok: false, error: '未指定要删除的作品' };
    }
    var initRes = ensureInitialized();
    if (!initRes.ok) {
      return { ok: false, error: initRes.error || '读取作品索引失败' };
    }
    var store = storage();
    var index = initRes.index;
    var targetIdx = -1;
    for (var i = 0; i < index.works.length; i++) {
      if (index.works[i] && index.works[i].id === workId) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx < 0) {
      return { ok: false, error: '未找到对应作品' };
    }

    var deletedMeta = index.works[targetIdx];
    var deletedData = getWorkData(workId);
    var candidateAssets = collectRecordAssetIds(deletedData);

    index.works.splice(targetIdx, 1);
    if (index.activeWorkId === workId) {
      var remaining = sortWorks(index.works);
      index.activeWorkId = remaining.length ? remaining[0].id : '';
    }

    try {
      writeIndex(index);
      if (store) {
        try { store.removeItem(workDataKey(workId)); } catch (_) {}
      }
    } catch (err) {
      return { ok: false, error: '删除作品失败，请稍后重试' };
    }

    var orphanedAssetIds = candidateAssets.filter(function(assetId) {
      return !isAssetReferencedInOtherWorks(assetId, workId);
    });

    return {
      ok: true,
      deletedWork: deletedMeta,
      orphanedAssetIds: orphanedAssetIds,
      remainingCount: index.works.length
    };
  }

  function deleteArchive(archiveId) {
    if (!archiveId) {
      return { ok: false, error: '未指定要删除的存档' };
    }
    var store = storage();
    var archIndex = readArchivesIndexRaw();
    var targetIdx = -1;
    for (var i = 0; i < archIndex.archives.length; i++) {
      if (archIndex.archives[i] && archIndex.archives[i].archiveId === archiveId) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx < 0) {
      return { ok: false, error: '未找到对应存档' };
    }

    var deletedMeta = archIndex.archives[targetIdx];
    var deletedData = getArchiveData(archiveId);
    var candidateAssets = collectRecordAssetIds(deletedData);

    archIndex.archives.splice(targetIdx, 1);
    try {
      writeArchivesIndex(archIndex);
      if (store) {
        try { store.removeItem(archiveDataKey(archiveId)); } catch (_) {}
      }
    } catch (_) {
      return { ok: false, error: '删除存档失败' };
    }

    if (deletedMeta && deletedMeta.sourceWorkId) {
      var srcWork = getWorkData(deletedMeta.sourceWorkId);
      if (srcWork && srcWork.lastArchiveId === archiveId) {
        srcWork.lastArchiveId = '';
        saveWorkData(deletedMeta.sourceWorkId, srcWork, { touchUpdatedAt: false });
      }
    }

    var orphanedAssetIds = candidateAssets.filter(function(assetId) {
      return !isAssetReferencedInOtherWorks(assetId, '', archiveId);
    });

    return {
      ok: true,
      deletedArchive: deletedMeta,
      orphanedAssetIds: orphanedAssetIds
    };
  }

  function appendParsedRecordAssets(parsed, combined) {
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.charAvatarAssetId) combined.push({ assetId: parsed.charAvatarAssetId });
    if (parsed.userAvatarAssetId) combined.push({ assetId: parsed.userAvatarAssetId });
    if (parsed.appearance && parsed.appearance.bgImageAssetId) {
      combined.push({ assetId: parsed.appearance.bgImageAssetId });
    }
    if (Array.isArray(parsed.items)) {
      for (var i = 0; i < parsed.items.length; i++) {
        combined.push(parsed.items[i]);
      }
    }
  }

  function recordUsesAsset(parsed, assetId) {
    if (!parsed || typeof parsed !== 'object') return false;
    if (
      parsed.charAvatarAssetId === assetId ||
      parsed.userAvatarAssetId === assetId ||
      (parsed.appearance && parsed.appearance.bgImageAssetId === assetId)
    ) {
      return true;
    }
    var items = Array.isArray(parsed.items) ? parsed.items : [];
    for (var j = 0; j < items.length; j++) {
      var m = items[j];
      if (!m) continue;
      if (m.assetId === assetId) return true;
      if (m.original && m.original.assetId === assetId) return true;
    }
    return false;
  }

  // 收集所有作品及存档的消息项，供素材引用安全检查使用
  function getAllReferencedItems() {
    var listed = listWorks();
    if (!listed.ok) return [];
    var store = storage();
    if (!store) return [];

    var combined = [];
    listed.works.forEach(function(w) {
      if (!w || !w.id) return;
      try {
        var raw = store.getItem(workDataKey(w.id));
        if (!raw) return;
        appendParsedRecordAssets(JSON.parse(raw), combined);
      } catch (_) {}
    });

    var archList = listArchives().archives || [];
    archList.forEach(function(a) {
      if (!a || !a.archiveId) return;
      try {
        var raw = store.getItem(archiveDataKey(a.archiveId));
        if (!raw) return;
        appendParsedRecordAssets(JSON.parse(raw), combined);
      } catch (_) {}
    });

    return combined;
  }

  function isAssetReferencedInOtherWorks(assetId, excludeWorkId, excludeArchiveId) {
    if (!assetId) return false;
    var listed = listWorks();
    if (!listed.ok) return true; // 读取索引失败时保守返回 true，绝不误删素材
    var store = storage();
    if (!store) return false;

    for (var i = 0; i < listed.works.length; i++) {
      var w = listed.works[i];
      if (!w || !w.id || w.id === excludeWorkId) continue;
      try {
        var raw = store.getItem(workDataKey(w.id));
        if (!raw) continue;
        if (recordUsesAsset(JSON.parse(raw), assetId)) return true;
      } catch (_) {
        return true; // 任意作品解析异常时保守保护素材
      }
    }

    var archList = listArchives().archives || [];
    for (var k = 0; k < archList.length; k++) {
      var a = archList[k];
      if (!a || !a.archiveId || a.archiveId === excludeArchiveId) continue;
      try {
        var archRaw = store.getItem(archiveDataKey(a.archiveId));
        if (!archRaw) continue;
        if (recordUsesAsset(JSON.parse(archRaw), assetId)) return true;
      } catch (_) {
        return true;
      }
    }

    return false;
  }

  function matchesCommunityPersonaBinding(record, personaId) {
    if (!record || !personaId) return false;
    if (record.boundRoleRef && typeof record.boundRoleRef === 'object') {
      if (record.boundRoleRef.source === 'community_persona' && String(record.boundRoleRef.id) === personaId) {
        return true;
      }
    }
    return record.boundPersonaId === personaId;
  }

  function countWorksUsingPersona(personaId) {
    if (!personaId) return 0;
    var listed = listWorks();
    if (!listed.ok) return 0;
    var store = storage();
    var count = 0;
    listed.works.forEach(function(w) {
      if (!w || !w.id) return;
      if (matchesCommunityPersonaBinding(w, personaId)) {
        count += 1;
        return;
      }
      if (!store) return;
      try {
        var raw = store.getItem(workDataKey(w.id));
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (matchesCommunityPersonaBinding(parsed, personaId)) {
          count += 1;
        }
      } catch (_) {}
    });
    return count;
  }

  function unbindPersonaAcrossWorks(personaId) {
    if (!personaId) return 0;
    var initRes = ensureInitialized();
    if (!initRes.ok) return 0;
    var store = storage();
    var index = initRes.index;
    var changedCount = 0;

    for (var i = 0; i < index.works.length; i++) {
      var meta = index.works[i];
      if (!meta || !meta.id) continue;
      var matched = matchesCommunityPersonaBinding(meta, personaId);
      var parsedData = null;
      if (store) {
        try {
          var raw = store.getItem(workDataKey(meta.id));
          if (raw) {
            parsedData = JSON.parse(raw);
            if (matchesCommunityPersonaBinding(parsedData, personaId)) {
              matched = true;
            }
          }
        } catch (_) {}
      }
      if (!matched) continue;
      changedCount += 1;
      meta.boundPersonaId = '';
      meta.boundRoleRef = null;
      if (parsedData && typeof parsedData === 'object') {
        parsedData.boundPersonaId = '';
        parsedData.boundRoleRef = null;
        if (store) {
          try {
            store.setItem(workDataKey(meta.id), JSON.stringify(parsedData));
          } catch (_) {}
        }
      }
    }

    if (changedCount > 0) {
      try {
        writeIndex(index);
      } catch (_) {}
    }
    return changedCount;
  }

  global.FanCommunityWorks = {
    LEGACY_STORAGE_KEY: LEGACY_STORAGE_KEY,
    WORKS_INDEX_KEY: WORKS_INDEX_KEY,
    WORK_DATA_PREFIX: WORK_DATA_PREFIX,
    LEGACY_WORK_ID: LEGACY_WORK_ID,
    ARCHIVES_INDEX_KEY: ARCHIVES_INDEX_KEY,
    ARCHIVE_DATA_PREFIX: ARCHIVE_DATA_PREFIX,
    DEFAULT_CREATION_MODE: DEFAULT_CREATION_MODE,
    CREATION_MODES: clone(CREATION_MODES),
    VALID_ROLE_SOURCES: VALID_ROLE_SOURCES.slice(),
    normalizeBoundRoleRef: normalizeBoundRoleRef,
    normalizeCreationMode: normalizeCreationMode,
    createDefaultAiSettings: createDefaultAiSettings,
    normalizeAiSettings: normalizeAiSettings,
    AI_REPLY_COUNT_MIN_LIMIT: AI_REPLY_COUNT_MIN_LIMIT,
    AI_REPLY_COUNT_MAX_LIMIT: AI_REPLY_COUNT_MAX_LIMIT,
    DEFAULT_AI_REPLY_PREFS: clone(DEFAULT_AI_REPLY_PREFS),
    createDefaultAiReplyPrefs: createDefaultAiReplyPrefs,
    normalizeAiReplyPrefs: normalizeAiReplyPrefs,
    generateMessageId: generateMessageId,
    ensureMessageIds: ensureMessageIds,
    syncMessageFloors: syncMessageFloors,
    moveMessageToFloor: moveMessageToFloor,
    TIMEZONE_OPTIONS: clone(TIMEZONE_OPTIONS),
    detectDefaultTimeZone: detectDefaultTimeZone,
    parseVirtualDateTimeToMs: parseVirtualDateTimeToMs,
    formatVirtualMs: formatVirtualMs,
    createDefaultTimeSettings: createDefaultTimeSettings,
    normalizeTimeSettings: normalizeTimeSettings,
    resolveWorkCurrentTime: resolveWorkCurrentTime,
    pauseVirtualClock: pauseVirtualClock,
    resumeVirtualClock: resumeVirtualClock,
    updateVirtualClockSpeed: updateVirtualClockSpeed,
    resetVirtualClockStart: resetVirtualClockStart,
    stampMessageTime: stampMessageTime,
    createDefaultEmotionState: createDefaultEmotionState,
    normalizeEmotionState: normalizeEmotionState,
    createDefaultAiMemory: createDefaultAiMemory,
    normalizeAiMemory: normalizeAiMemory,
    DEFAULT_APPEARANCE: clone(DEFAULT_APPEARANCE),
    normalizeAppearance: normalizeAppearance,
    ensureInitialized: ensureInitialized,
    listWorks: listWorks,
    createWork: createWork,
    getWorkData: getWorkData,
    saveWorkData: saveWorkData,
    setActiveWorkId: setActiveWorkId,
    renameWork: renameWork,
    deleteWork: deleteWork,
    buildWorkExcerpt: buildWorkExcerpt,
    listArchives: listArchives,
    getArchiveData: getArchiveData,
    completeAndArchiveWork: completeAndArchiveWork,
    deleteArchive: deleteArchive,
    countWorksUsingPersona: countWorksUsingPersona,
    unbindPersonaAcrossWorks: unbindPersonaAcrossWorks,
    getAllReferencedItems: getAllReferencedItems,
    isAssetReferencedInOtherWorks: isAssetReferencedInOtherWorks
  };
})(window);
