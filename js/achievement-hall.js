// js/achievement-hall.js — 弯弯小手机｜成就馆 1.0 (第二阶段：跨 App 真实事件联动 × 自动解锁 × 实时进度同步 × 幂等保护)
// 架构职责：
// 1. 复用单一权威储存键 achievement_hall_state_v2 (AchievementService) 与现有数据备份体系
// 2. 标准化来源事件协议 + 真实事件驱动自动解锁 + 严禁虚假进度与 AI 文本直接解锁
// 3. 串行队列 + 持久事件去重索引 (processedEvents) 防并发重入与备份恢复后重复发放
// 4. 历史成就分批幂等校准（真实 occurredAt vs 补算 unlockedAt，不补发人生游戏经验/金币）
// 5. 多 Char 羁绊数据与解锁记录按 charId 严格隔离，个人视角绝不混入角色空间数据
// 6. 单例事件监听 + 安卓前后台恢复刷新，零轮询、零微信主动祝贺、零商城抽奖

(function(global) {
  'use strict';

  var STORAGE_KEY = 'achievement_hall_state_v2';
  var FAVORITES_KEY = 'life_game_favorite_badges_v1';
  var BROADCAST_CHANNEL_NAME = 'wanwan_achievement_hall_sync';
  var RULE_VERSION = 2;
  var SCHEMA_VERSION = 3;

  var ACHIEVEMENT_CATEGORIES = [
    { key: 'growth', name: '成长成就', icon: 'fa-solid fa-seedling', order: 1 },
    { key: 'study', name: '学习成就', icon: 'fa-solid fa-book-open', order: 2 },
    { key: 'time', name: '时间成就', icon: 'fa-solid fa-calendar-check', order: 3 },
    { key: 'bond', name: '羁绊成就', icon: 'fa-solid fa-heart', order: 4 },
    { key: 'special', name: '特别成就', icon: 'fa-solid fa-wand-magic-sparkles', order: 5 },
    { key: 'treasured', name: '珍藏勋章', icon: 'fa-solid fa-gem', order: 6 }
  ];

  var LEGACY_CATEGORY_MAP = {
    origin: 'growth',
    habit: 'growth',
    main: 'growth',
    growth: 'growth',
    study: 'study',
    time: 'time',
    life: 'time',
    bond: 'bond',
    farm: 'special',
    parallel: 'special',
    browser: 'special',
    special: 'special',
    treasured: 'treasured'
  };

  var SOURCE_APP_LABELS = {
    'life-game': '人生游戏',
    'study-room': '陪伴自习室',
    'time-calendar': '时光日历',
    'love-diary': '恋爱记',
    'wechat': '微信',
    'our-home': '我们的家'
  };

  // 已废弃/不符合健康原则的旧勋章 ID（活跃展示层屏蔽）
  var DEPRECATED_BADGE_IDS = {
    badge_deep_night_whisper: true,
    badge_dawn_challenge: true
  };

  // ====================================================
  // 一、通用工具与安全持久化
  // ====================================================
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeArray(val) {
    return Array.isArray(val) ? val : [];
  }

  function formatDateTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + ' ' + h + ':' + min;
  }

  function formatDateShort(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function parseTimestampSafe(val) {
    if (typeof val === 'number' && isFinite(val) && val > 0) return val;
    if (typeof val === 'string' && val.trim()) {
      var trimmed = val.trim();
      if (/^\d{10,13}$/.test(trimmed)) {
        var n = Number(trimmed);
        return n > 0 ? n : null;
      }
      var parsed = Date.parse(trimmed);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return null;
  }

  function toLocalDateStr(tsOrStr) {
    if (typeof tsOrStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(tsOrStr.trim())) {
      return tsOrStr.trim().slice(0, 10);
    }
    var ms = parseTimestampSafe(tsOrStr);
    if (!ms) return '';
    var d = new Date(ms);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function getMinutesOfDay(ts) {
    var ms = parseTimestampSafe(ts);
    if (!ms) return -1;
    var d = new Date(ms);
    return d.getHours() * 60 + d.getMinutes();
  }

  function isHealthyMorningTs(ts) {
    var mins = getMinutesOfDay(ts);
    return mins >= 7 * 60 && mins <= 8 * 60 + 30;
  }

  function isPeacefulEveningTs(ts) {
    var mins = getMinutesOfDay(ts);
    return mins >= 21 * 60 && mins <= 22 * 60 + 30;
  }

  function computeConsecutiveStreak(sortedDateStrs) {
    if (!sortedDateStrs || !sortedDateStrs.length) return 0;
    var dayMs = 86400000;
    var uniqueDays = [];
    var seen = {};
    sortedDateStrs.forEach(function(ds) {
      if (!ds || seen[ds]) return;
      var parts = ds.split('-');
      if (parts.length !== 3) return;
      var utc = Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      if (!isNaN(utc)) {
        seen[ds] = true;
        uniqueDays.push(utc);
      }
    });
    uniqueDays.sort(function(a, b) { return a - b; });
    if (!uniqueDays.length) return 0;
    var maxStreak = 1;
    var curStreak = 1;
    for (var i = 1; i < uniqueDays.length; i++) {
      if (uniqueDays[i] - uniqueDays[i - 1] === dayMs) {
        curStreak++;
        if (curStreak > maxStreak) maxStreak = curStreak;
      } else {
        curStreak = 1;
      }
    }
    return maxStreak;
  }

  function getCategoryMeta(categoryKey) {
    var mapped = LEGACY_CATEGORY_MAP[categoryKey] || categoryKey;
    var found = ACHIEVEMENT_CATEGORIES.find(function(c) { return c.key === mapped; });
    if (found) return found;
    if (!categoryKey) {
      return { key: 'special', name: '未分类', icon: 'fa-solid fa-medal', order: 999 };
    }
    return {
      key: String(categoryKey),
      name: String(categoryKey),
      icon: 'fa-solid fa-medal',
      order: 999
    };
  }

  function getSourceAppLabel(sourceApp) {
    return SOURCE_APP_LABELS[sourceApp] || sourceApp || '弯弯小手机';
  }

  function getByMetricPath(obj, path) {
    if (!obj || !path) return 0;
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return 0;
      cur = cur[parts[i]];
    }
    if (typeof cur === 'boolean') return cur ? 1 : 0;
    var n = Number(cur);
    return isNaN(n) ? 0 : n;
  }

  function computeDaysBetweenLocal(dateStr) {
    if (!dateStr) return 0;
    var clean = String(dateStr).trim().slice(0, 10);
    var parts = clean.split('-');
    if (parts.length < 3) return 0;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return 0;
    var now = new Date();
    var startMs = Date.UTC(y, m, d);
    var todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(1, Math.floor((todayMs - startMs) / 86400000) + 1);
  }

  function clampProgress(current, target) {
    var safeTarget = Math.max(1, Number(target) || 1);
    var safeCurrent = Math.max(0, Number(current) || 0);
    var capped = Math.min(safeCurrent, safeTarget);
    var percent = Math.min(100, Math.max(0, Math.round((capped / safeTarget) * 100)));
    return {
      current: safeCurrent,
      cappedCurrent: capped,
      target: safeTarget,
      percent: percent
    };
  }

  function makeProgress(current, target, unit, customText) {
    var p = clampProgress(current, target);
    var text = customText || (Math.min(p.current, p.target) + ' / ' + p.target + (unit ? ' ' + unit : ''));
    return {
      current: p.current,
      target: p.target,
      percent: p.percent,
      unit: unit || '',
      text: text,
      remainingText: p.current < p.target ? ('还差 ' + (p.target - p.current) + (unit ? ' ' + unit : '')) : '已达标'
    };
  }

  async function readConfigSafe(key, fallback) {
    try {
      if (global.db && global.db.config && typeof global.db.config.get === 'function') {
        var row = await global.db.config.get(key);
        if (row && row.value !== undefined && row.value !== null) {
          return row.value;
        }
      }
    } catch (_) {}
    try {
      if (global.localStorage) {
        var raw = global.localStorage.getItem(key);
        if (raw !== null && raw !== undefined) {
          return JSON.parse(raw);
        }
      }
    } catch (_) {}
    return fallback;
  }

  async function writeConfigSafe(key, value) {
    var dbOk = false;
    var lsOk = false;
    var lastErr = null;
    if (global.db && global.db.config && typeof global.db.config.put === 'function') {
      try {
        await global.db.config.put({ key: key, value: value });
        dbOk = true;
      } catch (e) {
        lastErr = e;
      }
    }
    if (global.localStorage) {
      try {
        global.localStorage.setItem(key, JSON.stringify(value));
        lsOk = true;
      } catch (e2) {
        if (!lastErr) lastErr = e2;
      }
    }
    // 当主数据库 db.config 明确报错且 fallback 也失败（或 db.config 失败本身就需要感知异常），抛出给队列做恢复保护
    if (lastErr && !dbOk && !lsOk) {
      throw lastErr;
    }
    if (lastErr && global.db && global.db.config && !dbOk) {
      throw lastErr;
    }
    return { ok: dbOk || lsOk, error: null };
  }

  // ====================================================
  // 二、多来源 App 只读数据快照读取器 (SourceSnapshotReader)
  // 严格只读：不修改原 App 状态，不做刷奖，不合并不同 Char 的私密数据
  // ====================================================
  function matchEventCharScope(ev, charScope) {
    if (!ev) return false;
    if (global.TimeCalendarIntegrations && typeof global.TimeCalendarIntegrations.matchesCharFilter === 'function') {
      return global.TimeCalendarIntegrations.matchesCharFilter(ev, charScope);
    }
    if (!charScope || charScope === 'all') return true;
    if (charScope === 'personal') {
      if (ev.visibility === 'private') return true;
      if (ev.relationType === 'personal' && !ev.charId) return true;
      if (!ev.charId && (!ev.source || !ev.source.charId) && ev.relationType !== 'specificChar') return true;
      return false;
    }
    var targetId = String(charScope);
    if (ev.visibility === 'private') return false;
    if (ev.visibility === 'selected-chars' && Array.isArray(ev.allowedCharIds)) {
      return ev.allowedCharIds.map(String).indexOf(targetId) >= 0;
    }
    if (ev.charId && String(ev.charId) === targetId) return true;
    if (ev.ownerCharId && String(ev.ownerCharId) === targetId) return true;
    if (ev.source && ev.source.charId && String(ev.source.charId) === targetId) return true;
    return false;
  }

  function isCrossAppProjectionEvent(ev) {
    if (!ev) return true;
    if (ev.source && ev.source.app) {
      var app = String(ev.source.app);
      if (app !== 'timeCalendar' && app !== 'time-calendar') return true;
    }
    if (ev.readOnly === true && ev.source && ev.source.app !== 'timeCalendar') return true;
    return false;
  }

  async function readSourceSnapshot(options) {
    options = options || {};
    var charScope = options.charScope || 'all';

    // 1. 角色档案列表（只读）
    var characters = [];
    var activeCharSet = {};
    try {
      if (global.db && global.db.characters && typeof global.db.characters.toArray === 'function') {
        characters = safeArray(await global.db.characters.toArray()).filter(function(c) { return c && !c.deleted; });
      } else if (global._charCache && typeof global._charCache === 'object') {
        characters = Object.keys(global._charCache).map(function(k) { return global._charCache[k]; }).filter(function(c) { return c && !c.deleted; });
      }
      characters.forEach(function(c) {
        if (c && c.id !== undefined && c.id !== null) activeCharSet[String(c.id)] = true;
      });
    } catch (_) { characters = []; }

    // 2. 人生游戏权威数据（只读 + taskId 跨表去重）
    var lgState = (await readConfigSafe('life_game_state_v2', null)) || {};
    var lgTasks = safeArray(await readConfigSafe('life_game_tasks_v1', []));
    var lgHistory = safeArray(await readConfigSafe('life_game_tasks_history_v1', []));
    var lgHabits = safeArray(await readConfigSafe('life_game_habits_v1', []));
    var lgGoals = safeArray(await readConfigSafe('life_game_goals_v1', []));
    var lgMementos = safeArray(await readConfigSafe('life_game_memento_cards_v1', []));
    var lgCompanionSettings = (await readConfigSafe('life_game_companion_settings_v1', null)) || {};

    var statsObj = (lgState && typeof lgState.stats === 'object' && lgState.stats) ? lgState.stats : {};
    var maxStatVal = Object.keys(statsObj).reduce(function(max, k) {
      return Math.max(max, Number(statsObj[k]) || 0);
    }, 0);

    var claimedTaskMap = {};
    function ingestClaimedTask(t, idx, fallbackPrefix) {
      if (!t || typeof t !== 'object') return;
      var tid = String(t.taskId || t.id || (fallbackPrefix + '_' + idx));
      var ts = parseTimestampSafe(t.claimedAt || t.completedAt || t.updatedAt || t.createdAt);
      if (!claimedTaskMap[tid]) {
        claimedTaskMap[tid] = {
          id: tid,
          category: t.category || 'daily',
          occurredAt: ts
        };
      } else if (ts && (!claimedTaskMap[tid].occurredAt || ts < claimedTaskMap[tid].occurredAt)) {
        claimedTaskMap[tid].occurredAt = ts;
      }
    }
    lgHistory.forEach(function(t, idx) {
      ingestClaimedTask(t, idx, 'hist');
    });
    lgTasks.forEach(function(t, idx) {
      if (t && (t.status === 'claimed' || t.status === 'completed')) {
        ingestClaimedTask(t, idx, 'task');
      }
    });

    var claimedTasksList = Object.keys(claimedTaskMap).map(function(k) { return claimedTaskMap[k]; });
    var claimedTasksTimestamps = claimedTasksList.map(function(t) { return t.occurredAt; }).filter(Boolean).sort(function(a, b) { return a - b; });
    var claimedMainList = claimedTasksList.filter(function(t) { return t.category === 'main'; });
    var claimedMainTimestamps = claimedMainList.map(function(t) { return t.occurredAt; }).filter(Boolean).sort(function(a, b) { return a - b; });

    var maxHabitStreak = 0;
    var morningCheckinAt = null;
    var peacefulEveningAt = null;
    lgHabits.forEach(function(h) {
      if (!h) return;
      maxHabitStreak = Math.max(maxHabitStreak, Number(h.bestStreak) || 0, Number(h.streak) || 0);
      var hTs = parseTimestampSafe(h.lastCheckinAt || h.updatedAt);
      if (hTs) {
        if (!morningCheckinAt && isHealthyMorningTs(hTs)) morningCheckinAt = hTs;
        if (!peacefulEveningAt && isPeacefulEveningTs(hTs)) peacefulEveningAt = hTs;
      }
    });
    claimedTasksTimestamps.forEach(function(ts) {
      if (!morningCheckinAt && isHealthyMorningTs(ts)) morningCheckinAt = ts;
      if (!peacefulEveningAt && isPeacefulEveningTs(ts)) peacefulEveningAt = ts;
    });

    var completedGoalTimestamps = [];
    var completedGoalsCount = 0;
    var completedMilestonesCount = 0;
    lgGoals.forEach(function(g) {
      if (!g) return;
      var ms = safeArray(g.milestones);
      var doneMs = ms.filter(function(m) {
        return m && (m.status === 'claimed' || m.status === 'completed' || m.completed || m.claimed || m.done);
      });
      completedMilestonesCount += doneMs.length;
      var isGoalDone = (g.status === 'completed' || g.completed === true) || (ms.length > 0 && doneMs.length === ms.length);
      if (isGoalDone) {
        completedGoalsCount++;
        var gTs = parseTimestampSafe(g.completedAt || g.updatedAt || (doneMs.length ? doneMs[doneMs.length - 1].claimedAt : null));
        if (gTs) completedGoalTimestamps.push(gTs);
      }
    });
    completedGoalTimestamps.sort(function(a, b) { return a - b; });

    var mementoTimestamps = lgMementos
      .map(function(m) { return parseTimestampSafe(m && (m.createdAt || m.timestamp)); })
      .filter(Boolean)
      .sort(function(a, b) { return a - b; });

    var authorizedCharCount = 0;
    if (lgCompanionSettings && lgCompanionSettings.chars && typeof lgCompanionSettings.chars === 'object') {
      authorizedCharCount = Object.keys(lgCompanionSettings.chars).filter(function(cid) {
        if (charScope !== 'all' && charScope !== 'personal' && String(cid) !== String(charScope)) return false;
        if (characters.length > 0 && !activeCharSet[String(cid)]) return false;
        return Boolean(lgCompanionSettings.chars[cid] && lgCompanionSettings.chars[cid].enabled);
      }).length;
    }

    // 3. 陪伴自习室权威数据（只读 + 拦截取消/暂停/零时长 + 记录 ID 去重 + 时长与次数分离）
    var studyRecords = safeArray(await readConfigSafe('wanwan_study_records', []));
    var studyTodos = safeArray(await readConfigSafe('wanwan_study_todos', []));
    var studyMistakes = safeArray(await readConfigSafe('wanwan_study_mistakes', []));
    var studyState = (await readConfigSafe('wanwan_study_state', null)) || {};

    var validStudyMap = {};
    var validStudyRecords = [];
    for (var srIdx = 0; srIdx < studyRecords.length; srIdx++) {
      var sr = studyRecords[srIdx];
      if (!sr || typeof sr !== 'object') continue;
      if (sr.cancelled === true || sr.aborted === true || sr.invalid === true) continue;
      if (sr.status === 'cancelled' || sr.status === 'aborted' || sr.status === 'paused') continue;
      var mins = Number(sr.durationMinutes !== undefined ? sr.durationMinutes : (sr.minutes !== undefined ? sr.minutes : sr.duration)) || 0;
      if (mins <= 0) continue;
      var recKey = sr.id ? String(sr.id) : ('sr_idx_' + srIdx);
      if (validStudyMap[recKey]) continue;
      validStudyMap[recKey] = true;
      validStudyRecords.push({
        id: recKey,
        minutes: mins,
        occurredAt: parseTimestampSafe(sr.completedAt || sr.createdAt || sr.timestamp || sr.date),
        dateStr: toLocalDateStr(sr.date || sr.completedAt || sr.createdAt || sr.timestamp)
      });
    }

    var totalStudyMinutes = 0;
    var maxSingleStudyMinutes = 0;
    var studyDateSet = {};
    var studyTimestamps = [];
    var focus45At = null;
    var centuryAt = null;
    var treasured500At = null;
    var day3At = null;

    // 按真实发生时间升序推算达标时间点（用于历史校准 occurredAt）
    var chronoRecords = validStudyRecords.slice().sort(function(a, b) {
      return (a.occurredAt || 0) - (b.occurredAt || 0);
    });
    var runningMinutes = 0;
    var runningDates = [];
    chronoRecords.forEach(function(item) {
      totalStudyMinutes += item.minutes;
      runningMinutes += item.minutes;
      if (item.minutes > maxSingleStudyMinutes) maxSingleStudyMinutes = item.minutes;
      if (item.occurredAt) studyTimestamps.push(item.occurredAt);
      if (item.minutes >= 45 && !focus45At) focus45At = item.occurredAt || null;
      if (runningMinutes >= 100 && !centuryAt) centuryAt = item.occurredAt || null;
      if (runningMinutes >= 500 && !treasured500At) treasured500At = item.occurredAt || null;
      if (item.dateStr && !studyDateSet[item.dateStr]) {
        studyDateSet[item.dateStr] = true;
        runningDates.push(item.dateStr);
        if (runningDates.length >= 3 && !day3At) {
          day3At = item.occurredAt || parseTimestampSafe(item.dateStr);
        }
      }
    });

    if (totalStudyMinutes === 0 && validStudyRecords.length === 0 && Number(studyState.totalMinutesToday) > 0 && !studyState.cancelled) {
      totalStudyMinutes = Number(studyState.totalMinutesToday) || 0;
    }
    var activeDaysList = Object.keys(studyDateSet).sort();
    var studyStreakDays = computeConsecutiveStreak(activeDaysList);

    var todoDoneSeen = {};
    var todoDoneTimestamps = [];
    var completedTodosCount = 0;
    studyTodos.forEach(function(t, idx) {
      if (!t || !(t.done === true || t.completed === true || t.status === 'completed')) return;
      var k = t.id ? String(t.id) : ('td_' + idx);
      if (todoDoneSeen[k]) return;
      todoDoneSeen[k] = true;
      completedTodosCount++;
      var ts = parseTimestampSafe(t.completedAt || t.updatedAt || t.createdAt || t.date);
      if (ts) todoDoneTimestamps.push(ts);
    });
    todoDoneTimestamps.sort(function(a, b) { return a - b; });

    var mistakeSeen = {};
    var mistakeTimestamps = [];
    var masteredMistakesCount = 0;
    studyMistakes.forEach(function(m, idx) {
      if (!m || !(m.mastered === true || m.resolved === true || m.status === 'mastered')) return;
      var k = m.id ? String(m.id) : ('mk_' + idx);
      if (mistakeSeen[k]) return;
      mistakeSeen[k] = true;
      masteredMistakesCount++;
      var ts = parseTimestampSafe(m.masteredAt || m.updatedAt || m.createdAt);
      if (ts) mistakeTimestamps.push(ts);
    });
    mistakeTimestamps.sort(function(a, b) { return a - b; });

    // 4. 时光日历权威数据（严格排除跨 App 投影 + 重复日程单实例精确去重 + charScope 隔离）
    var calEventsAll = safeArray(await readConfigSafe('time_calendar_events', []));
    var calAnniversariesAll = safeArray(await readConfigSafe('time_calendar_anniversaries', []));
    var calCountdownsAll = safeArray(await readConfigSafe('time_calendar_countdowns', []));

    var calNativeEvents = calEventsAll.filter(function(ev) {
      if (!ev || ev.deleted === true || ev.status === 'cancelled') return false;
      if (isCrossAppProjectionEvent(ev)) return false;
      return matchEventCharScope(ev, charScope);
    });

    var completedInstanceSet = {};
    var calCompletedTimestamps = [];
    var calRecurringCount = 0;
    var calRecurringTimestamps = [];
    var calPlannedTimestamps = [];

    calNativeEvents.forEach(function(ev, idx) {
      var evId = ev.id ? String(ev.id) : ('cal_' + idx);
      var evCreated = parseTimestampSafe(ev.createdAt || ev.date);
      if (evCreated) calPlannedTimestamps.push(evCreated);

      var rec = ev.recurrence || ev.repeat;
      var hasRec = false;
      if (typeof rec === 'string') hasRec = rec !== 'none' && rec !== '';
      else if (rec && typeof rec === 'object') hasRec = Boolean(rec.type && rec.type !== 'none');

      if (hasRec) {
        calRecurringCount++;
        if (evCreated) calRecurringTimestamps.push(evCreated);

        var overrides = (ev.recurrence && ev.recurrence.overrides && typeof ev.recurrence.overrides === 'object')
          ? ev.recurrence.overrides
          : {};
        var overrideKeys = Object.keys(overrides);
        overrideKeys.forEach(function(dateKey) {
          var ov = overrides[dateKey];
          if (ov && (ov.completed === true || ov.status === 'completed')) {
            var instKey = evId + '#' + dateKey;
            if (!completedInstanceSet[instKey]) {
              completedInstanceSet[instKey] = true;
              var ts = parseTimestampSafe(ov.completedAt || ov.updatedAt || dateKey || ev.updatedAt);
              if (ts) calCompletedTimestamps.push(ts);
            }
          }
        });

        var masterOv = ev.date ? overrides[ev.date] : null;
        if ((ev.status === 'completed' || ev.completed === true) && (!masterOv || masterOv.completed !== false)) {
          var masterInstKey = evId + '#' + (ev.date || 'base');
          if (!completedInstanceSet[masterInstKey]) {
            completedInstanceSet[masterInstKey] = true;
            var tsBase = parseTimestampSafe(ev.completedAt || ev.updatedAt || ev.date);
            if (tsBase) calCompletedTimestamps.push(tsBase);
          }
        }
      } else if (ev.status === 'completed' || ev.completed === true) {
        if (!completedInstanceSet[evId]) {
          completedInstanceSet[evId] = true;
          var tsSingle = parseTimestampSafe(ev.completedAt || ev.updatedAt || ev.date);
          if (tsSingle) calCompletedTimestamps.push(tsSingle);
        }
      }
    });

    var calCountdowns = calCountdownsAll.filter(function(c) {
      if (!c || c.deleted === true) return false;
      if (isCrossAppProjectionEvent(c)) return false;
      return matchEventCharScope(c, charScope);
    });
    calCountdowns.forEach(function(c) {
      var ts = parseTimestampSafe(c.createdAt || c.targetDate);
      if (ts) calPlannedTimestamps.push(ts);
    });

    var calAnniversaries = calAnniversariesAll.filter(function(a) {
      if (!a || a.deleted === true) return false;
      if (isCrossAppProjectionEvent(a)) return false;
      return matchEventCharScope(a, charScope);
    });
    var calAnniversaryTimestamps = calAnniversaries
      .map(function(a) { return parseTimestampSafe(a.createdAt || a.startDate || a.date); })
      .filter(Boolean)
      .sort(function(a, b) { return a - b; });

    calCompletedTimestamps.sort(function(a, b) { return a - b; });
    calPlannedTimestamps.sort(function(a, b) { return a - b; });
    calRecurringTimestamps.sort(function(a, b) { return a - b; });
    var calCompletedCount = Object.keys(completedInstanceSet).length;

    // 5. 恋爱记 & 微信羁绊数据（只读 + 严格按 charId 独立建账，绝不跨 Char 累加合并）
    var coupleSettings = (await readConfigSafe('coupleSpaceSettings', null)) || { activeCharId: null, spaces: {} };
    var spacesMap = (coupleSettings && typeof coupleSettings.spaces === 'object' && coupleSettings.spaces) ? coupleSettings.spaces : {};

    var bondByChar = {};
    function ensureCharBond(cid) {
      var key = String(cid);
      if (!bondByChar[key]) {
        bondByChar[key] = {
          charId: key,
          hasAcceptedSpace: false,
          daysTogether: 0,
          lettersAndDiaries: 0,
          completedWishes: 0,
          chatCount: 0,
          timestamps: {
            firstChatAt: null,
            spaceAcceptedAt: null,
            fifthLetterAt: null,
            thirdWishAt: null
          }
        };
      }
      return bondByChar[key];
    }

    if (charScope !== 'personal') {
      var targetCharIds = (charScope === 'all') ? Object.keys(spacesMap) : [String(charScope)];

      targetCharIds.forEach(function(cid) {
        var sp = spacesMap[cid] || spacesMap[Number(cid)];
        if (!sp || sp.status !== 'accepted' || sp.visibility === 'private') return;
        var entry = ensureCharBond(cid);
        entry.hasAcceptedSpace = true;
        entry.daysTogether = computeDaysBetweenLocal(sp.anniversaryDate);
        entry.timestamps.spaceAcceptedAt = parseTimestampSafe(sp.acceptedAt || sp.createdAt || sp.anniversaryDate);

        var ldList = safeArray(sp.letters).concat(safeArray(sp.diaries)).filter(function(item) {
          return item && item.visibility !== 'private';
        });
        entry.lettersAndDiaries = ldList.length;
        if (ldList.length >= 5) {
          var ldTimes = ldList.map(function(item) {
            return parseTimestampSafe(item.createdAt || item.date);
          }).filter(Boolean).sort(function(a, b) { return a - b; });
          entry.timestamps.fifthLetterAt = ldTimes[4] || ldTimes[ldTimes.length - 1] || entry.timestamps.spaceAcceptedAt;
        }

        var doneWishes = safeArray(sp.wishes).filter(function(w) {
          return w && w.done === true && w.visibility !== 'private';
        });
        entry.completedWishes = doneWishes.length;
        if (doneWishes.length >= 3) {
          var wishTimes = doneWishes.map(function(w) {
            return parseTimestampSafe(w.completedAt || w.updatedAt || w.targetDate);
          }).filter(Boolean).sort(function(a, b) { return a - b; });
          entry.timestamps.thirdWishAt = wishTimes[2] || wishTimes[wishTimes.length - 1] || entry.timestamps.spaceAcceptedAt;
        }
      });

      // 只读微信互动计数（不扫描消息正文内容，仅按 charId 分别统计是否存在交互记录）
      try {
        if (global.db && global.db.messages && typeof global.db.messages.toArray === 'function') {
          var msgs = safeArray(await global.db.messages.toArray());
          msgs.forEach(function(m) {
            if (!m || m.visibility === 'private') return;
            var mCid = m.charId !== undefined && m.charId !== null ? String(m.charId)
              : (m.chatId !== undefined && m.chatId !== null ? String(m.chatId) : '');
            if (!mCid) return;
            if (charScope !== 'all' && mCid !== String(charScope)) return;
            var entry = ensureCharBond(mCid);
            entry.chatCount++;
            var mTs = parseTimestampSafe(m.createdAt || m.timestamp);
            if (mTs && (!entry.timestamps.firstChatAt || mTs < entry.timestamps.firstChatAt)) {
              entry.timestamps.firstChatAt = mTs;
            }
          });
        } else if (global.db && global.db.chats && typeof global.db.chats.toArray === 'function') {
          var chats = safeArray(await global.db.chats.toArray());
          chats.forEach(function(c) {
            if (!c || c.charId === undefined || c.charId === null) return;
            var cCid = String(c.charId);
            if (charScope !== 'all' && cCid !== String(charScope)) return;
            var entry = ensureCharBond(cCid);
            entry.chatCount++;
            var cTs = parseTimestampSafe(c.updatedAt || c.createdAt);
            if (cTs && (!entry.timestamps.firstChatAt || cTs < entry.timestamps.firstChatAt)) {
              entry.timestamps.firstChatAt = cTs;
            }
          });
        }
      } catch (_) {}
    }

    // 视图汇总 bondSnapshot：在 'all' 下仅取单一 Char 最大值展示，绝不将 Char A + Char B 次数相加以避免跨 Char 串账
    var bondSnapshot = {
      scopeRestrictedToPersonal: charScope === 'personal',
      hasAcceptedSpace: false,
      daysTogether: 0,
      lettersAndDiaries: 0,
      completedWishes: 0,
      chatCount: 0
    };
    if (charScope !== 'personal') {
      if (charScope !== 'all') {
        var single = bondByChar[String(charScope)];
        if (single) {
          bondSnapshot.hasAcceptedSpace = single.hasAcceptedSpace;
          bondSnapshot.daysTogether = single.daysTogether;
          bondSnapshot.lettersAndDiaries = single.lettersAndDiaries;
          bondSnapshot.completedWishes = single.completedWishes;
          bondSnapshot.chatCount = single.chatCount;
        }
      } else {
        Object.keys(bondByChar).forEach(function(cid) {
          var b = bondByChar[cid];
          if (b.hasAcceptedSpace) bondSnapshot.hasAcceptedSpace = true;
          if (b.daysTogether > bondSnapshot.daysTogether) bondSnapshot.daysTogether = b.daysTogether;
          if (b.lettersAndDiaries > bondSnapshot.lettersAndDiaries) bondSnapshot.lettersAndDiaries = b.lettersAndDiaries;
          if (b.completedWishes > bondSnapshot.completedWishes) bondSnapshot.completedWishes = b.completedWishes;
          if (b.chatCount > bondSnapshot.chatCount) bondSnapshot.chatCount = b.chatCount;
        });
      }
    }

    return {
      charScope: charScope,
      characters: characters,
      lifeGame: {
        level: Math.max(1, Number(lgState.level) || 1),
        exp: Math.max(0, Number(lgState.exp) || 0),
        claimedTasksCount: claimedTasksList.length,
        claimedMainCount: claimedMainList.length,
        maxHabitStreak: maxHabitStreak,
        maxStatVal: maxStatVal,
        completedGoalsCount: completedGoalsCount,
        completedMilestonesCount: completedMilestonesCount,
        mementoCount: lgMementos.length,
        authorizedCharCount: authorizedCharCount,
        morningCheckin: morningCheckinAt ? 1 : 0,
        peacefulEvening: peacefulEveningAt ? 1 : 0,
        timestamps: {
          firstQuestAt: claimedTasksTimestamps[0] || null,
          fifthQuestAt: claimedTasksTimestamps[4] || null,
          firstMainAt: claimedMainTimestamps[0] || null,
          firstGoalAt: completedGoalTimestamps[0] || null,
          thirdMementoAt: mementoTimestamps[2] || mementoTimestamps[mementoTimestamps.length - 1] || null,
          morningCheckinAt: morningCheckinAt,
          peacefulEveningAt: peacefulEveningAt
        }
      },
      studyRoom: {
        sessionCount: validStudyRecords.length,
        totalMinutes: totalStudyMinutes,
        maxSingleMinutes: maxSingleStudyMinutes,
        activeDaysCount: activeDaysList.length,
        streakDays: studyStreakDays,
        completedTodosCount: completedTodosCount,
        masteredMistakesCount: masteredMistakesCount,
        timestamps: {
          firstSessionAt: studyTimestamps[0] || null,
          focus45At: focus45At,
          centuryAt: centuryAt,
          treasured500At: treasured500At,
          day3At: day3At,
          fifthTodoAt: todoDoneTimestamps[4] || todoDoneTimestamps[todoDoneTimestamps.length - 1] || null,
          thirdMistakeAt: mistakeTimestamps[2] || mistakeTimestamps[mistakeTimestamps.length - 1] || null
        }
      },
      timeCalendar: {
        plannedCount: calNativeEvents.length + calCountdowns.length,
        completedCount: calCompletedCount,
        recurringCount: calRecurringCount,
        anniversaryCount: calAnniversaries.length,
        milestoneEcho: calNativeEvents.length + calCountdowns.length + calCompletedCount,
        timestamps: {
          firstCompletedAt: calCompletedTimestamps[0] || null,
          thirdCompletedAt: calCompletedTimestamps[2] || calCompletedTimestamps[calCompletedTimestamps.length - 1] || null,
          fifthPlannedAt: calPlannedTimestamps[4] || calPlannedTimestamps[calPlannedTimestamps.length - 1] || null,
          firstRecurringAt: calRecurringTimestamps[0] || null,
          firstAnniversaryAt: calAnniversaryTimestamps[0] || null
        }
      },
      bond: bondSnapshot,
      bondByChar: bondByChar
    };
  }

  // ====================================================
  // 三、成就定义目录 (ACHIEVEMENT_DEFINITIONS)
  // ====================================================
  var ACHIEVEMENT_DEFINITIONS = [
    // ── 1. 成长成就 (growth) ──
    {
      achievementId: 'badge_first_quest',
      name: '旅途启程',
      description: '在人生游戏中完成并领取第 1 个现实委托奖励。',
      icon: 'fa-solid fa-compass',
      category: 'growth',
      points: 100,
      titleReward: '旅途启程者',
      sourceApp: 'life-game',
      sourceTab: 'tasks',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'lifeGame.claimedTasksCount',
        comparator: '>=',
        target: 1,
        description: '领取人生游戏任意现实委托奖励 1 次'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.lifeGame.claimedTasksCount, 1, '次');
      },
      resolveOccurredAt: function(snap) { return snap.lifeGame.timestamps.firstQuestAt; }
    },
    {
      achievementId: 'badge_life_task_5',
      name: '步履积微',
      description: '在人生游戏中脚踏实地完成并领取 5 次现实委托奖励。',
      icon: 'fa-solid fa-shoe-prints',
      category: 'growth',
      points: 180,
      titleReward: '微光积行者',
      sourceApp: 'life-game',
      sourceTab: 'tasks',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'lifeGame.claimedTasksCount',
        comparator: '>=',
        target: 5,
        description: '累计领取人生游戏现实委托奖励 5 次'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.lifeGame.claimedTasksCount, 5, '次');
      },
      resolveOccurredAt: function(snap) { return snap.lifeGame.timestamps.fifthQuestAt; }
    },
    {
      achievementId: 'badge_main_quest_1',
      name: '破浪之誓',
      description: '攻克并领取第 1 个高价值主线现实任务。',
      icon: 'fa-solid fa-flag',
      category: 'growth',
      points: 260,
      titleReward: '破浪开拓官',
      sourceApp: 'life-game',
      sourceTab: 'tasks',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'lifeGame.claimedMainCount',
        comparator: '>=',
        target: 1,
        description: '完成并领取 1 个主线委托奖励'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.lifeGame.claimedMainCount, 1, '个');
      },
      resolveOccurredAt: function(snap) { return snap.lifeGame.timestamps.firstMainAt; }
    },
    {
      achievementId: 'badge_habit_7d',
      name: '晨曦破晓',
      description: '任意一项日常习惯连续坚持打卡达到 7 天。',
      icon: 'fa-solid fa-sun',
      category: 'growth',
      points: 200,
      titleReward: '破晓之星',
      sourceApp: 'life-game',
      sourceTab: 'habits',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'lifeGame.maxHabitStreak',
        comparator: '>=',
        target: 7,
        description: '单一日常习惯连续打卡达 7 天'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.lifeGame.maxHabitStreak, 7, '天');
      }
    },
    {
      achievementId: 'badge_habit_21d',
      name: '自律蜕变',
      description: '将微小的坚持延续 21 天，沉淀为自然的生活节律。',
      icon: 'fa-solid fa-feather-pointed',
      category: 'growth',
      points: 450,
      titleReward: '坚毅持戒者',
      sourceApp: 'life-game',
      sourceTab: 'habits',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'lifeGame.maxHabitStreak',
        comparator: '>=',
        target: 21,
        description: '单一日常习惯连续打卡达 21 天'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.lifeGame.maxHabitStreak, 21, '天');
      }
    },
    {
      achievementId: 'badge_level_5',
      name: '学者初成',
      description: '在点滴真实积累中，人生游戏成长等级达到 LV.5。',
      icon: 'fa-solid fa-award',
      category: 'growth',
      points: 300,
      titleReward: '博识探幽者',
      sourceApp: 'life-game',
      sourceTab: 'profile',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'lifeGame.level',
        comparator: '>=',
        target: 5,
        description: '人生游戏角色等级达到 LV.5'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.lifeGame.level, 5, '级');
      }
    },
    {
      achievementId: 'badge_stat_century',
      name: '百炼成钢',
      description: '六维成长属性中任意一项突破 100 点。',
      icon: 'fa-solid fa-dumbbell',
      category: 'growth',
      points: 350,
      titleReward: '极境破壁者',
      sourceApp: 'life-game',
      sourceTab: 'profile',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'lifeGame.maxStatVal',
        comparator: '>=',
        target: 100,
        description: '任意一项六维成长属性达到 100 点'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.lifeGame.maxStatVal, 100, '点');
      }
    },

    // ── 2. 学习成就 (study) ──
    {
      achievementId: 'badge_focus_novice',
      name: '静心初探',
      description: '在陪伴自习室完成任意一次真实专注学习。',
      icon: 'fa-solid fa-seedling',
      category: 'study',
      points: 150,
      titleReward: '静心初学者',
      sourceApp: 'study-room',
      sourceTab: 'duo',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'studyRoom.sessionCount',
        comparator: '>=',
        target: 1,
        description: '陪伴自习室完成 1 次有效专注记录'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.studyRoom.sessionCount, 1, '次');
      },
      resolveOccurredAt: function(snap) { return snap.studyRoom.timestamps.firstSessionAt; }
    },
    {
      achievementId: 'badge_focus_master_45',
      name: '专注大师',
      description: '单次进入深度心流，连续专注满 45 分钟。',
      icon: 'fa-solid fa-hourglass-start',
      category: 'study',
      points: 300,
      titleReward: '深海潜修者',
      sourceApp: 'study-room',
      sourceTab: 'duo',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'studyRoom.maxSingleMinutes',
        comparator: '>=',
        target: 45,
        description: '单次专注时长达到 45 分钟'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.studyRoom.maxSingleMinutes, 45, '分钟');
      },
      resolveOccurredAt: function(snap) { return snap.studyRoom.timestamps.focus45At; }
    },
    {
      achievementId: 'badge_focus_century',
      name: '学海无涯',
      description: '陪伴自习室累计专注学习时长突破 100 分钟。',
      icon: 'fa-solid fa-graduation-cap',
      category: 'study',
      points: 400,
      titleReward: '求索苦行僧',
      sourceApp: 'study-room',
      sourceTab: 'report',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'studyRoom.totalMinutes',
        comparator: '>=',
        target: 100,
        description: '陪伴自习室累计专注时长达 100 分钟'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.studyRoom.totalMinutes, 100, '分钟');
      },
      resolveOccurredAt: function(snap) { return snap.studyRoom.timestamps.centuryAt; }
    },
    {
      achievementId: 'badge_study_streak_3',
      name: '三日微澜',
      description: '在陪伴自习室累计 3 个不同学习日完成有效专注。',
      icon: 'fa-solid fa-calendar-day',
      category: 'study',
      points: 200,
      titleReward: '恒心研习生',
      sourceApp: 'study-room',
      sourceTab: 'report',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'studyRoom.activeDaysCount',
        comparator: '>=',
        target: 3,
        description: '在自习室累计 3 个有效学习日完成专注'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.studyRoom.activeDaysCount, 3, '天');
      },
      resolveOccurredAt: function(snap) { return snap.studyRoom.timestamps.day3At; }
    },
    {
      achievementId: 'badge_study_todo_5',
      name: '笃行不怠',
      description: '在自习室学习待办清单中逐项完成 5 个学习任务。',
      icon: 'fa-solid fa-list-check',
      category: 'study',
      points: 220,
      titleReward: '笃行研学者',
      sourceApp: 'study-room',
      sourceTab: 'hall',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'studyRoom.completedTodosCount',
        comparator: '>=',
        target: 5,
        description: '完成 5 项自习室学习待办'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.studyRoom.completedTodosCount, 5, '项');
      },
      resolveOccurredAt: function(snap) { return snap.studyRoom.timestamps.fifthTodoAt; }
    },
    {
      achievementId: 'badge_mistakes_conquered',
      name: '温故知新',
      description: '在错题本中认真复盘并攻克 3 道薄弱错题。',
      icon: 'fa-solid fa-book-open-reader',
      category: 'study',
      points: 220,
      titleReward: '析疑解惑者',
      sourceApp: 'study-room',
      sourceTab: 'mistakes',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'studyRoom.masteredMistakesCount',
        comparator: '>=',
        target: 3,
        description: '在错题本攻克 3 道错题'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.studyRoom.masteredMistakesCount, 3, '道');
      },
      resolveOccurredAt: function(snap) { return snap.studyRoom.timestamps.thirdMistakeAt; }
    },

    // ── 3. 时间成就 (time) ──
    {
      achievementId: 'badge_calendar_first',
      name: '日程初印',
      description: '在时光日历中圆满完成第 1 项个人原生日程安排。',
      icon: 'fa-solid fa-check-double',
      category: 'time',
      points: 100,
      titleReward: '拾光有序者',
      sourceApp: 'time-calendar',
      sourceTab: 'schedule',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'timeCalendar.completedCount',
        comparator: '>=',
        target: 1,
        description: '在时光日历完成 1 个原生日程'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.timeCalendar.completedCount, 1, '个');
      },
      resolveOccurredAt: function(snap) { return snap.timeCalendar.timestamps.firstCompletedAt; }
    },
    {
      achievementId: 'badge_calendar_chronos',
      name: '光阴旅者',
      description: '在时光日历中按期完成 3 项既定日程计划。',
      icon: 'fa-solid fa-calendar-check',
      category: 'time',
      points: 200,
      titleReward: '光阴旅者',
      sourceApp: 'time-calendar',
      sourceTab: 'schedule',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'timeCalendar.completedCount',
        comparator: '>=',
        target: 3,
        description: '在时光日历完成 3 个日程'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.timeCalendar.completedCount, 3, '个');
      },
      resolveOccurredAt: function(snap) { return snap.timeCalendar.timestamps.thirdCompletedAt; }
    },
    {
      achievementId: 'badge_calendar_planner_5',
      name: '秩序筑梦',
      description: '提前整理生活节奏，建立 5 项个人日程或倒计时规划。',
      icon: 'fa-solid fa-clock',
      category: 'time',
      points: 180,
      titleReward: '从容规划师',
      sourceApp: 'time-calendar',
      sourceTab: 'calendar',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'timeCalendar.plannedCount',
        comparator: '>=',
        target: 5,
        description: '在时光日历记录 5 项日程或倒计时'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.timeCalendar.plannedCount, 5, '项');
      },
      resolveOccurredAt: function(snap) { return snap.timeCalendar.timestamps.fifthPlannedAt; }
    },
    {
      achievementId: 'badge_calendar_recurring_1',
      name: '岁月节律',
      description: '为自己的长期规律建立至少 1 项重复日程规则。',
      icon: 'fa-solid fa-repeat',
      category: 'time',
      points: 160,
      titleReward: '节律守护人',
      sourceApp: 'time-calendar',
      sourceTab: 'schedule',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'timeCalendar.recurringCount',
        comparator: '>=',
        target: 1,
        description: '创建 1 条重复日程规则'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.timeCalendar.recurringCount, 1, '条');
      },
      resolveOccurredAt: function(snap) { return snap.timeCalendar.timestamps.firstRecurringAt; }
    },
    {
      achievementId: 'badge_calendar_anniversary_1',
      name: '时光刻痕',
      description: '在时光日历中珍重标记第 1 个值得铭记的纪念日。',
      icon: 'fa-solid fa-bookmark',
      category: 'time',
      points: 150,
      titleReward: '记事拾光人',
      sourceApp: 'time-calendar',
      sourceTab: 'anniversary',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'timeCalendar.anniversaryCount',
        comparator: '>=',
        target: 1,
        description: '在时光日历记录 1 个纪念日'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.timeCalendar.anniversaryCount, 1, '个');
      },
      resolveOccurredAt: function(snap) { return snap.timeCalendar.timestamps.firstAnniversaryAt; }
    },

    // ── 4. 羁绊成就 (bond · 多 Char 视角严格隔离) ──
    {
      achievementId: 'badge_first_chat',
      name: '初遇之光',
      description: '与心仪的角色开启对话，点亮彼此相伴的第一段记忆。',
      icon: 'fa-solid fa-handshake-angle',
      category: 'bond',
      points: 100,
      titleReward: '初心同行人',
      sourceApp: 'wechat',
      sourceTab: 'chat',
      isHidden: false,
      repeatable: false,
      charScoped: true,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'bond.chatCount',
        comparator: '>=',
        target: 1,
        description: '与同一角色产生过至少 1 条对话记录'
      },
      progressCalculator: function(snap) {
        if (snap.bond.scopeRestrictedToPersonal) {
          return makeProgress(0, 1, '条', '个人视角不展示角色互动数据');
        }
        return makeProgress(snap.bond.chatCount, 1, '条');
      }
    },
    {
      achievementId: 'badge_love_space_open',
      name: '双人秘密基地',
      description: '在恋爱记中成功开通属于彼此的情侣空间。',
      icon: 'fa-solid fa-house-chimney-heart',
      category: 'bond',
      points: 180,
      titleReward: '秘密基地主人',
      sourceApp: 'love-diary',
      sourceTab: 'album',
      isHidden: false,
      repeatable: false,
      charScoped: true,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'bond.hasAcceptedSpace',
        comparator: '>=',
        target: 1,
        description: '在恋爱记为对应角色开通情侣空间'
      },
      progressCalculator: function(snap) {
        if (snap.bond.scopeRestrictedToPersonal) {
          return makeProgress(0, 1, '个', '个人视角已隔离角色空间');
        }
        return makeProgress(snap.bond.hasAcceptedSpace ? 1 : 0, 1, '个');
      }
    },
    {
      achievementId: 'badge_love_devotion',
      name: '命定之约',
      description: '在恋爱记里累计写下温暖的日记与信笺，记录相守时光。',
      icon: 'fa-solid fa-heart-pulse',
      category: 'bond',
      points: 350,
      titleReward: '岁月同行伴侣',
      sourceApp: 'love-diary',
      sourceTab: 'diaries',
      isHidden: false,
      repeatable: false,
      charScoped: true,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'bond.lettersAndDiaries',
        comparator: '>=',
        target: 5,
        description: '在单一情侣空间累计记录 5 篇日记或情书'
      },
      progressCalculator: function(snap) {
        if (snap.bond.scopeRestrictedToPersonal) {
          return makeProgress(0, 5, '篇', '个人视角已隔离角色空间');
        }
        return makeProgress(snap.bond.lettersAndDiaries, 5, '篇');
      }
    },
    {
      achievementId: 'badge_love_wish_3',
      name: '心愿同行',
      description: '在恋爱记心愿清单中与伴侣携手兑现 3 个心愿。',
      icon: 'fa-solid fa-star',
      category: 'bond',
      points: 240,
      titleReward: '心愿筑梦家',
      sourceApp: 'love-diary',
      sourceTab: 'wishes',
      isHidden: false,
      repeatable: false,
      charScoped: true,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'bond.completedWishes',
        comparator: '>=',
        target: 3,
        description: '在单一情侣空间完成 3 项双人心愿清单'
      },
      progressCalculator: function(snap) {
        if (snap.bond.scopeRestrictedToPersonal) {
          return makeProgress(0, 3, '项', '个人视角已隔离角色空间');
        }
        return makeProgress(snap.bond.completedWishes, 3, '项');
      }
    },

    // ── 5. 特别成就 (special · 含健康作息与隐藏保护) ──
    {
      achievementId: 'badge_companion_grant',
      name: '心意授权',
      description: '在明确知情的情况下，主动为伴侣授予成长陪伴权限。',
      icon: 'fa-solid fa-shield-heart',
      category: 'special',
      points: 120,
      titleReward: '信任的缔约者',
      sourceApp: 'life-game',
      sourceTab: 'companion',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'lifeGame.authorizedCharCount',
        comparator: '>=',
        target: 1,
        description: '为至少 1 位角色开启人生游戏陪伴授权'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.lifeGame.authorizedCharCount, 1, '位');
      }
    },
    {
      achievementId: 'badge_morning_glow',
      name: '晨光律动',
      description: '在清晨 07:00–08:30 规律作息时段完成健康打卡。',
      icon: 'fa-solid fa-mug-saucer',
      category: 'special',
      points: 260,
      titleReward: '沐光晨行者',
      sourceApp: 'life-game',
      sourceTab: 'habits',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'lifeGame.morningCheckin',
        comparator: '>=',
        target: 1,
        description: '在健康晨间时段 07:00–08:30 完成习惯打卡'
      },
      progressCalculator: function(snap, unlocked) {
        return makeProgress(unlocked || snap.lifeGame.morningCheckin ? 1 : 0, 1, '次');
      },
      resolveOccurredAt: function(snap) { return snap.lifeGame.timestamps.morningCheckinAt; }
    },
    {
      achievementId: 'badge_peaceful_night',
      name: '夜幕归宁',
      description: '在晚间 22:30 前从容完成当日探索，及时休息保持规律作息。',
      icon: 'fa-solid fa-moon',
      category: 'special',
      points: 200,
      titleReward: '宁息守心者',
      sourceApp: 'life-game',
      sourceTab: 'tasks',
      isHidden: true,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'lifeGame.peacefulEvening',
        comparator: '>=',
        target: 1,
        description: '在 21:00–22:30 健康休息前完成当日复盘与打卡',
        hintWhenHidden: '关于规律作息与及时歇息的隐藏纪念'
      },
      progressCalculator: function(snap, unlocked) {
        return makeProgress(unlocked ? 1 : 0, 1, '次');
      },
      resolveOccurredAt: function(snap) { return snap.lifeGame.timestamps.peacefulEveningAt; }
    },
    {
      achievementId: 'badge_secret_echo',
      name: '时光回响',
      description: '当时间线跨越十个日夜的计划与里程碑时悄然浮现的记忆回响。',
      icon: 'fa-solid fa-wand-sparkles',
      category: 'special',
      points: 280,
      titleReward: '光阴拾遗人',
      sourceApp: 'time-calendar',
      sourceTab: 'anniversary',
      isHidden: true,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'timeCalendar.milestoneEcho',
        comparator: '>=',
        target: 10,
        description: '在时光日历累计规划与完成达到特定回响尺度',
        hintWhenHidden: '时光流转之间，某段规律坚持悄然留下的线索'
      },
      progressCalculator: function(snap, unlocked) {
        var total = snap.timeCalendar.milestoneEcho || (snap.timeCalendar.plannedCount + snap.timeCalendar.completedCount);
        return makeProgress(unlocked ? 10 : total, 10, '次');
      }
    },

    // ── 6. 珍藏勋章 (treasured) ──
    {
      achievementId: 'badge_level_10',
      name: '登峰造极',
      description: '千帆过尽，现实中的长期耕耘终将角色推至 LV.10 殿堂。',
      icon: 'fa-solid fa-crown',
      category: 'treasured',
      points: 800,
      titleReward: '超维传奇缔造者',
      sourceApp: 'life-game',
      sourceTab: 'profile',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'lifeGame.level',
        comparator: '>=',
        target: 10,
        description: '人生游戏成长等级达到 LV.10'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.lifeGame.level, 10, '级');
      }
    },
    {
      achievementId: 'badge_goal_complete_full',
      name: '愿景终成',
      description: '完整实现人生游戏中的一项长期愿景及其全部里程碑。',
      icon: 'fa-solid fa-trophy',
      category: 'treasured',
      points: 600,
      titleReward: '愿景实现者',
      sourceApp: 'life-game',
      sourceTab: 'goals',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'lifeGame.completedGoalsCount',
        comparator: '>=',
        target: 1,
        description: '完成 1 项长期愿景的所有里程碑'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.lifeGame.completedGoalsCount, 1, '项');
      },
      resolveOccurredAt: function(snap) { return snap.lifeGame.timestamps.firstGoalAt; }
    },
    {
      achievementId: 'badge_memento_collector_3',
      name: '光阴标本家',
      description: '在人生冒险手账中珍藏 3 张真实成长纪念卡。',
      icon: 'fa-solid fa-images',
      category: 'treasured',
      points: 280,
      titleReward: '岁月收藏家',
      sourceApp: 'life-game',
      sourceTab: 'history',
      isHidden: false,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'lifeGame.mementoCount',
        comparator: '>=',
        target: 3,
        description: '收集 3 张人生冒险手账成长纪念卡'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.lifeGame.mementoCount, 3, '张');
      },
      resolveOccurredAt: function(snap) { return snap.lifeGame.timestamps.thirdMementoAt; }
    },
    {
      achievementId: 'badge_treasured_focus_500',
      name: '博观约取',
      description: '厚积薄发，陪伴自习室真实专注总时长跨过 500 分钟门槛。',
      icon: 'fa-solid fa-gem',
      category: 'treasured',
      points: 700,
      titleReward: '沉潜大成者',
      sourceApp: 'study-room',
      sourceTab: 'report',
      isHidden: true,
      repeatable: false,
      charScoped: false,
      ruleVersion: RULE_VERSION,
      unlockCondition: {
        metric: 'studyRoom.totalMinutes',
        comparator: '>=',
        target: 500,
        description: '陪伴自习室累计真实专注达 500 分钟',
        hintWhenHidden: '一枚只留给漫长静心求学时光的珍藏之印'
      },
      progressCalculator: function(snap) {
        return makeProgress(snap.studyRoom.totalMinutes, 500, '分钟');
      },
      resolveOccurredAt: function(snap) { return snap.studyRoom.timestamps.treasured500At; }
    }
  ];

  // 里程碑重要程度 & 来源撤销策略映射 (Section 2.3 + Phase 3 重要成就边界)
  var MAJOR_MILESTONE_IDS = {
    badge_main_quest_1: true,
    badge_habit_21d: true,
    badge_level_5: true,
    badge_level_10: true,
    badge_stat_century: true,
    badge_focus_master_45: true,
    badge_focus_century: true,
    badge_treasured_focus_500: true,
    badge_calendar_chronos: true,
    badge_secret_echo: true,
    badge_love_space_open: true,
    badge_love_devotion: true,
    badge_love_wish_3: true,
    badge_goal_complete_full: true,
    badge_memento_collector_3: true
  };

  var REVOCABLE_CURRENT_STATE_IDS = {
    badge_companion_grant: true,
    badge_love_space_open: true
  };

  var DEFINITION_BY_ID = {};
  var DEFINITIONS_BY_SOURCE = {};
  ACHIEVEMENT_DEFINITIONS.forEach(function(def) {
    if (!def.revocationPolicy) {
      def.revocationPolicy = REVOCABLE_CURRENT_STATE_IDS[def.achievementId]
        ? 'revocable_current_state'
        : 'preserve_milestone';
    }
    if (def.isMajorMilestone === undefined) {
      def.isMajorMilestone = Boolean(MAJOR_MILESTONE_IDS[def.achievementId]);
    }
    DEFINITION_BY_ID[def.achievementId] = def;
    if (!DEFINITIONS_BY_SOURCE[def.sourceApp]) DEFINITIONS_BY_SOURCE[def.sourceApp] = [];
    DEFINITIONS_BY_SOURCE[def.sourceApp].push(def);
  });

  // ====================================================
  // 四、用户解锁记录仓储 & 跨实例事务/乐观锁队列 (AchievementHallStore)
  // ====================================================
  var _mutationQueue = Promise.resolve();
  var _lastSyncError = null;
  var _instanceId = 'ah_inst_' + Math.random().toString(36).slice(2, 8);
  var _broadcastChannel = null;

  function enqueueMutation(taskFn) {
    var resultPromise = _mutationQueue.then(function() {
      return taskFn();
    });
    // 保持后续队列不会因单次异常而永久卡死
    _mutationQueue = resultPromise.catch(function() {});
    return resultPromise;
  }

  async function runConfigTransaction(taskFn) {
    if (global.db && global.db.config && typeof global.db.transaction === 'function') {
      try {
        return await global.db.transaction('rw', global.db.config, function() {
          return taskFn();
        });
      } catch (e) {
        if (e && e.message && e.message.indexOf('transaction') === -1) throw e;
      }
    }
    return await taskFn();
  }

  function broadcastStateChange(kind, meta) {
    if (!_broadcastChannel) return;
    try {
      _broadcastChannel.postMessage({
        source: _instanceId,
        kind: kind || 'state_updated',
        meta: meta || null,
        at: Date.now()
      });
    } catch (_) {}
  }

  function recomputeTotalScore(state) {
    if (!state || !state.unlockRecords) return 0;
    var score = 0;
    Object.keys(state.unlockRecords).forEach(function(id) {
      var rec = state.unlockRecords[id];
      if (!rec || !rec.unlocked || rec.revoked) return;
      var def = DEFINITION_BY_ID[id];
      if (def) {
        score += Number(def.points) || 100;
      } else {
        var leg = safeArray(state.badges).find(function(b) { return b && String(b.id) === String(id); });
        score += (leg && Number(leg.points)) || 100;
      }
    });
    return score;
  }

  function mergeConcurrentStates(latestState, nextState, mergeOpts) {
    mergeOpts = mergeOpts || {};
    var merged = JSON.parse(JSON.stringify(latestState));

    // 1. 合并 unlockRecords：已解锁单调并集（保留最早达成时间），显式撤销或收藏变更优先尊重本次意图
    Object.keys(nextState.unlockRecords || {}).forEach(function(aid) {
      var incoming = nextState.unlockRecords[aid];
      var current = merged.unlockRecords[aid];
      if (!current) {
        merged.unlockRecords[aid] = Object.assign({}, incoming);
        return;
      }
      if (mergeOpts.revokedIds && mergeOpts.revokedIds[aid]) {
        merged.unlockRecords[aid] = Object.assign({}, incoming);
        return;
      }
      if (mergeOpts.favoriteToggledId === aid) {
        current.favorite = Boolean(incoming.favorite);
      } else if (incoming.favorite) {
        current.favorite = true;
      }
      if (incoming.unlocked && !current.unlocked && !(merged.revokedRecords && merged.revokedRecords[aid])) {
        merged.unlockRecords[aid] = Object.assign({}, incoming, { favorite: current.favorite });
      } else if (incoming.unlocked && current.unlocked) {
        current.unlockedAt = Math.min(current.unlockedAt || Infinity, incoming.unlockedAt || Infinity);
        if (!isFinite(current.unlockedAt)) current.unlockedAt = incoming.unlockedAt || current.unlockedAt;
        current.occurredAt = current.occurredAt || incoming.occurredAt || null;
        current.unlockCount = Math.max(Number(current.unlockCount) || 1, Number(incoming.unlockCount) || 1);
      }
    });

    // 2. 合并 charScopedUnlocks：按 charId 隔离合并
    Object.keys(nextState.charScopedUnlocks || {}).forEach(function(cid) {
      if (mergeOpts.deletedCharId && String(cid) === String(mergeOpts.deletedCharId)) {
        delete merged.charScopedUnlocks[cid];
        return;
      }
      if (!merged.charScopedUnlocks[cid]) merged.charScopedUnlocks[cid] = {};
      var inBucket = nextState.charScopedUnlocks[cid] || {};
      Object.keys(inBucket).forEach(function(aid) {
        var r = inBucket[aid];
        if (r && r.unlocked && !merged.charScopedUnlocks[cid][aid]) {
          merged.charScopedUnlocks[cid][aid] = Object.assign({}, r);
        }
      });
    });

    // 3. 合并持久去重账本 processedEvents 与撤销审计 revokedRecords
    Object.keys(nextState.processedEvents || {}).forEach(function(k) {
      if (nextState.processedEvents[k]) {
        merged.processedEvents[k] = merged.processedEvents[k] || nextState.processedEvents[k];
      }
    });
    if (!merged.revokedRecords) merged.revokedRecords = {};
    Object.keys(nextState.revokedRecords || {}).forEach(function(aid) {
      merged.revokedRecords[aid] = nextState.revokedRecords[aid];
    });
    Object.keys(merged.revokedRecords).forEach(function(aid) {
      if (merged.unlockRecords[aid] && merged.unlockRecords[aid].unlocked &&
          !(mergeOpts.revokedIds && mergeOpts.revokedIds[aid])) {
        delete merged.revokedRecords[aid];
      }
    });

    merged.ruleVersion = Math.max(Number(merged.ruleVersion) || 1, Number(nextState.ruleVersion) || 1);
    if (mergeOpts.titleEquipped) merged.equippedTitle = nextState.equippedTitle;
    if (nextState.lastBackfillAt && (!merged.lastBackfillAt || nextState.lastBackfillAt > merged.lastBackfillAt)) {
      merged.lastBackfillAt = nextState.lastBackfillAt;
      merged.lastBackfillSummary = nextState.lastBackfillSummary;
    }
    merged.totalScore = recomputeTotalScore(merged);
    merged.revision = Math.max(Number(latestState.revision) || 0, Number(nextState.revision) || 0) + 1;
    return merged;
  }

  function normalizeState(rawState, favoriteList) {
    var base = (rawState && typeof rawState === 'object') ? rawState : {};
    var favSet = {};
    safeArray(favoriteList).forEach(function(id) {
      if (id) favSet[String(id)] = true;
    });

    var records = {};
    var rawRecords = (base.unlockRecords && typeof base.unlockRecords === 'object') ? base.unlockRecords : {};

    Object.keys(rawRecords).forEach(function(id) {
      var rec = rawRecords[id];
      if (!rec || typeof rec !== 'object') return;
      var aid = String(rec.achievementId || id);
      records[aid] = {
        achievementId: aid,
        unlocked: Boolean(rec.unlocked),
        unlockedAt: rec.unlocked ? (rec.unlockedAt || null) : null,
        occurredAt: rec.unlocked ? (rec.occurredAt || rec.unlockedAt || null) : null,
        unlockCount: rec.unlocked ? Math.max(1, Number(rec.unlockCount) || 1) : 0,
        ruleVersionAtUnlock: rec.ruleVersionAtUnlock || RULE_VERSION,
        favorite: Boolean(rec.favorite || favSet[aid]),
        sourceApp: rec.sourceApp || (DEFINITION_BY_ID[aid] ? DEFINITION_BY_ID[aid].sourceApp : ''),
        charId: rec.charId ? String(rec.charId) : null,
        backfilled: Boolean(rec.backfilled),
        sourceRecordId: rec.sourceRecordId || null
      };
    });

    safeArray(base.badges).forEach(function(b) {
      if (!b || !b.id) return;
      var aid = String(b.id);
      if (!records[aid]) {
        records[aid] = {
          achievementId: aid,
          unlocked: Boolean(b.unlocked),
          unlockedAt: b.unlocked ? (b.unlockedAt || null) : null,
          occurredAt: b.unlocked ? (b.unlockedAt || null) : null,
          unlockCount: b.unlocked ? 1 : 0,
          ruleVersionAtUnlock: 1,
          favorite: Boolean(favSet[aid]),
          sourceApp: DEFINITION_BY_ID[aid] ? DEFINITION_BY_ID[aid].sourceApp : (b.category || ''),
          charId: null,
          backfilled: false,
          sourceRecordId: null
        };
      } else {
        if (b.unlocked && !records[aid].unlocked) {
          records[aid].unlocked = true;
          records[aid].unlockedAt = b.unlockedAt || records[aid].unlockedAt || null;
          records[aid].occurredAt = records[aid].occurredAt || records[aid].unlockedAt || null;
          records[aid].unlockCount = Math.max(1, records[aid].unlockCount);
        }
        if (favSet[aid]) {
          records[aid].favorite = true;
        }
      }
    });

    Object.keys(favSet).forEach(function(aid) {
      if (!records[aid]) {
        records[aid] = {
          achievementId: aid,
          unlocked: false,
          unlockedAt: null,
          occurredAt: null,
          unlockCount: 0,
          ruleVersionAtUnlock: null,
          favorite: true,
          sourceApp: DEFINITION_BY_ID[aid] ? DEFINITION_BY_ID[aid].sourceApp : '',
          charId: null,
          backfilled: false,
          sourceRecordId: null
        };
      } else {
        records[aid].favorite = true;
      }
    });

    var charScopedUnlocks = {};
    if (base.charScopedUnlocks && typeof base.charScopedUnlocks === 'object') {
      Object.keys(base.charScopedUnlocks).forEach(function(cid) {
        var bucket = base.charScopedUnlocks[cid];
        if (!bucket || typeof bucket !== 'object') return;
        charScopedUnlocks[String(cid)] = {};
        Object.keys(bucket).forEach(function(aid) {
          var r = bucket[aid];
          if (r && r.unlocked) {
            charScopedUnlocks[String(cid)][aid] = {
              achievementId: aid,
              charId: String(cid),
              unlocked: true,
              unlockedAt: r.unlockedAt || null,
              occurredAt: r.occurredAt || r.unlockedAt || null,
              unlockCount: Math.max(1, Number(r.unlockCount) || 1),
              ruleVersionAtUnlock: r.ruleVersionAtUnlock || RULE_VERSION,
              sourceApp: r.sourceApp || (DEFINITION_BY_ID[aid] ? DEFINITION_BY_ID[aid].sourceApp : ''),
              backfilled: Boolean(r.backfilled),
              sourceRecordId: r.sourceRecordId || null
            };
          }
        });
      });
    }

    var processedEvents = {};
    if (base.processedEvents && typeof base.processedEvents === 'object') {
      Object.keys(base.processedEvents).forEach(function(k) {
        if (base.processedEvents[k]) processedEvents[k] = base.processedEvents[k];
      });
    }

    var revokedRecords = {};
    if (base.revokedRecords && typeof base.revokedRecords === 'object') {
      Object.keys(base.revokedRecords).forEach(function(k) {
        if (base.revokedRecords[k]) revokedRecords[k] = base.revokedRecords[k];
      });
    }

    var normalized = {
      schemaVersion: SCHEMA_VERSION,
      ruleVersion: Number(base.ruleVersion) || 1,
      revision: Number(base.revision) || 0,
      equippedTitle: base.equippedTitle || '初涉尘寰的旅人',
      totalScore: typeof base.totalScore === 'number' ? base.totalScore : 0,
      unlockRecords: records,
      charScopedUnlocks: charScopedUnlocks,
      processedEvents: processedEvents,
      revokedRecords: revokedRecords,
      badges: safeArray(base.badges),
      fragments: safeArray(base.fragments),
      lastBackfillAt: base.lastBackfillAt || null,
      lastBackfillSummary: base.lastBackfillSummary || null,
      updatedAt: base.updatedAt || null
    };
    return normalized;
  }

  function syncLegacyBadgesArray(state) {
    var existingMap = {};
    safeArray(state.badges).forEach(function(b) {
      if (b && b.id) existingMap[String(b.id)] = b;
    });

    var merged = [];
    var seen = {};

    ACHIEVEMENT_DEFINITIONS.forEach(function(def) {
      var rec = state.unlockRecords[def.achievementId];
      var legacy = existingMap[def.achievementId] || {};
      var isUnlocked = Boolean(rec && rec.unlocked);
      seen[def.achievementId] = true;
      merged.push({
        id: def.achievementId,
        name: def.name,
        icon: def.icon,
        category: def.category,
        desc: def.description,
        points: def.points,
        unlocked: isUnlocked,
        unlockedAt: isUnlocked ? (rec.unlockedAt || legacy.unlockedAt || null) : null
      });
    });

    Object.keys(existingMap).forEach(function(id) {
      if (seen[id] || DEPRECATED_BADGE_IDS[id]) return;
      merged.push(existingMap[id]);
    });

    state.badges = merged;
    return state;
  }

  function applyUnlockToState(state, def, options) {
    options = options || {};
    var aid = def.achievementId;
    var charId = options.charId ? String(options.charId) : null;
    var existing = state.unlockRecords[aid];
    var now = Date.now();
    var occurredAt = parseTimestampSafe(options.occurredAt) || (options.backfilled ? null : now);

    if (state.revokedRecords && state.revokedRecords[aid]) {
      delete state.revokedRecords[aid];
    }

    // 针对多 Char 专属成就（charScoped === true）：按 charId 独立建账并隔离检查
    if (def.charScoped && charId) {
      if (!state.charScopedUnlocks[charId]) state.charScopedUnlocks[charId] = {};
      var existingForChar = state.charScopedUnlocks[charId][aid];
      if (existingForChar && existingForChar.unlocked && !def.repeatable) {
        return { granted: false, reason: 'already_unlocked_for_char' };
      }

      state.charScopedUnlocks[charId][aid] = {
        achievementId: aid,
        charId: charId,
        unlocked: true,
        unlockedAt: (existingForChar && existingForChar.unlockedAt) || now,
        occurredAt: (existingForChar && existingForChar.occurredAt) || occurredAt,
        unlockCount: existingForChar ? (Number(existingForChar.unlockCount) || 0) + 1 : 1,
        ruleVersionAtUnlock: def.ruleVersion,
        sourceApp: def.sourceApp,
        backfilled: Boolean(options.backfilled),
        sourceRecordId: options.sourceRecordId || null
      };

      var isFirstSummaryUnlock = !existing || !existing.unlocked;
      if (isFirstSummaryUnlock) {
        state.unlockRecords[aid] = {
          achievementId: aid,
          unlocked: true,
          unlockedAt: now,
          occurredAt: occurredAt,
          unlockCount: 1,
          ruleVersionAtUnlock: def.ruleVersion,
          favorite: Boolean(existing && existing.favorite),
          sourceApp: def.sourceApp,
          charId: charId,
          backfilled: Boolean(options.backfilled),
          sourceRecordId: options.sourceRecordId || null
        };
        state.totalScore = (Number(state.totalScore) || 0) + (Number(def.points) || 100);
      }
      return {
        granted: true,
        isFirstGlobalUnlock: isFirstSummaryUnlock,
        record: Object.assign({}, state.charScopedUnlocks[charId][aid])
      };
    }

    // 非多 Char 专属（或未指定 charId 的通用解锁）
    if (existing && existing.unlocked && !def.repeatable) {
      return { granted: false, reason: 'already_unlocked' };
    }

    var nextCount = existing ? (Number(existing.unlockCount) || 0) + 1 : 1;
    var firstUnlock = !existing || !existing.unlocked;
    state.unlockRecords[aid] = {
      achievementId: aid,
      unlocked: true,
      unlockedAt: (existing && existing.unlockedAt) || now,
      occurredAt: (existing && existing.occurredAt) || occurredAt,
      unlockCount: nextCount,
      ruleVersionAtUnlock: def.ruleVersion,
      favorite: Boolean(existing && existing.favorite),
      sourceApp: def.sourceApp,
      charId: charId,
      backfilled: Boolean(options.backfilled),
      sourceRecordId: options.sourceRecordId || null
    };
    if (firstUnlock) {
      state.totalScore = (Number(state.totalScore) || 0) + (Number(def.points) || 100);
    }
    return {
      granted: true,
      isFirstGlobalUnlock: firstUnlock,
      record: Object.assign({}, state.unlockRecords[aid])
    };
  }

  var AchievementHallStore = {
    async loadState() {
      var raw = await readConfigSafe(STORAGE_KEY, null);
      var favs = await readConfigSafe(FAVORITES_KEY, []);
      return normalizeState(raw, favs);
    },

    async saveState(state, saveOpts) {
      saveOpts = saveOpts || {};
      var self = this;
      return await runConfigTransaction(async function() {
        var expectedRev = saveOpts.expectedRevision;
        var finalState = state;

        if (expectedRev !== undefined && expectedRev !== null) {
          var latest = await self.loadState();
          if ((Number(latest.revision) || 0) !== Number(expectedRev)) {
            finalState = mergeConcurrentStates(latest, state, saveOpts.mergeOpts);
          } else {
            finalState.revision = (Number(expectedRev) || 0) + 1;
          }
        } else {
          finalState.revision = (Number(finalState.revision) || 0) + 1;
        }

        syncLegacyBadgesArray(finalState);
        finalState.schemaVersion = SCHEMA_VERSION;
        finalState.updatedAt = Date.now();
        var favIds = Object.keys(finalState.unlockRecords || {}).filter(function(id) {
          return finalState.unlockRecords[id] && finalState.unlockRecords[id].favorite;
        });
        await writeConfigSafe(STORAGE_KEY, finalState);
        await writeConfigSafe(FAVORITES_KEY, favIds);
        _lastSyncError = null;
        broadcastStateChange('state_saved', { revision: finalState.revision });
        return finalState;
      });
    },

    async unlockAchievement(achievementId, options) {
      options = options || {};
      var aid = String(achievementId || '');
      if (!aid) return { ok: false, reason: 'invalid_id' };
      var def = DEFINITION_BY_ID[aid];
      if (!def || DEPRECATED_BADGE_IDS[aid]) {
        return { ok: false, reason: 'unknown_or_deprecated_definition' };
      }

      var self = this;
      return enqueueMutation(async function() {
        try {
          var state = await self.loadState();
          var baseRev = state.revision;
          var applied = applyUnlockToState(state, def, options);
          if (!applied.granted) {
            return {
              ok: false,
              alreadyUnlocked: true,
              reason: applied.reason || 'already_unlocked',
              record: Object.assign({}, state.unlockRecords[aid] || {})
            };
          }

          var saved = await self.saveState(state, { expectedRevision: baseRev });
          if (global.WanwanSharedHub && typeof global.WanwanSharedHub.emit === 'function') {
            await global.WanwanSharedHub.emit('ACHIEVEMENT_UNLOCKED', {
              badge: {
                id: def.achievementId,
                achievementId: def.achievementId,
                name: def.name,
                points: def.points,
                category: def.category,
                sourceApp: def.sourceApp,
                isMajorMilestone: Boolean(def.isMajorMilestone),
                isHidden: Boolean(def.isHidden),
                charScoped: Boolean(def.charScoped)
              },
              charId: options.charId ? String(options.charId) : null,
              sourceRecordId: options.sourceRecordId || null,
              occurredAt: applied.record && applied.record.occurredAt,
              unlockedAt: applied.record && applied.record.unlockedAt,
              backfilled: Boolean(options.backfilled),
              totalScore: saved.totalScore
            });
          }
          return {
            ok: true,
            unlocked: true,
            alreadyUnlocked: false,
            record: applied.record,
            totalScore: saved.totalScore
          };
        } catch (err) {
          var msg = String((err && err.message) || err || 'storage_error');
          _lastSyncError = { message: msg, at: Date.now() };
          return { ok: false, reason: 'storage_error', error: msg };
        }
      });
    },

    async toggleFavorite(achievementId) {
      var aid = String(achievementId || '');
      if (!aid) return null;
      var self = this;
      return enqueueMutation(async function() {
        try {
          var state = await self.loadState();
          var baseRev = state.revision;
          var rec = state.unlockRecords[aid];
          if (!rec) {
            rec = {
              achievementId: aid,
              unlocked: false,
              unlockedAt: null,
              occurredAt: null,
              unlockCount: 0,
              ruleVersionAtUnlock: null,
              favorite: false,
              sourceApp: DEFINITION_BY_ID[aid] ? DEFINITION_BY_ID[aid].sourceApp : '',
              charId: null,
              backfilled: false,
              sourceRecordId: null
            };
            state.unlockRecords[aid] = rec;
          }
          rec.favorite = !rec.favorite;
          var saved = await self.saveState(state, {
            expectedRevision: baseRev,
            mergeOpts: { favoriteToggledId: aid }
          });
          return saved.unlockRecords[aid] ? saved.unlockRecords[aid].favorite : rec.favorite;
        } catch (err) {
          _lastSyncError = { message: String((err && err.message) || err), at: Date.now() };
          return null;
        }
      });
    },

    async equipTitle(title) {
      if (!title) return null;
      var self = this;
      return enqueueMutation(async function() {
        var state = await self.loadState();
        var baseRev = state.revision;
        state.equippedTitle = String(title);
        var saved = await self.saveState(state, {
          expectedRevision: baseRev,
          mergeOpts: { titleEquipped: true }
        });
        if (global.WanwanSharedHub && typeof global.WanwanSharedHub.emit === 'function') {
          await global.WanwanSharedHub.emit('TITLE_EQUIPPED', { title: saved.equippedTitle });
        }
        return saved.equippedTitle;
      });
    },

    // Section 2.3: 来源撤销 / 异常纠偏 / 角色删除处理（绝不修改人生游戏经验金币与等级）
    async revokeErroneousAchievement(achievementId, reason, opts) {
      opts = opts || {};
      var aid = String(achievementId || '');
      var def = DEFINITION_BY_ID[aid];
      if (!aid || !def) return { ok: false, reason: 'unknown_achievement' };

      if (def.revocationPolicy === 'preserve_milestone' && !opts.forceErroneousRevoke) {
        return {
          ok: false,
          preserved: true,
          policy: def.revocationPolicy,
          reason: 'preserve_milestone_policy'
        };
      }

      var self = this;
      return enqueueMutation(async function() {
        var state = await self.loadState();
        var baseRev = state.revision;
        var rec = state.unlockRecords[aid];
        if (!rec || !rec.unlocked) {
          return { ok: false, reason: 'not_unlocked' };
        }

        var now = Date.now();
        state.revokedRecords[aid] = {
          achievementId: aid,
          previousUnlockedAt: rec.unlockedAt,
          previousOccurredAt: rec.occurredAt,
          revokedAt: now,
          reason: String(reason || 'source_revoked_or_erroneous'),
          policy: def.revocationPolicy
        };
        rec.unlocked = false;
        rec.unlockedAt = null;
        rec.occurredAt = null;
        rec.unlockCount = 0;

        if (opts.charId && state.charScopedUnlocks[String(opts.charId)]) {
          delete state.charScopedUnlocks[String(opts.charId)][aid];
        } else if (def.charScoped) {
          Object.keys(state.charScopedUnlocks || {}).forEach(function(cid) {
            if (state.charScopedUnlocks[cid]) delete state.charScopedUnlocks[cid][aid];
          });
        }

        // 若当前佩戴头衔来自该被撤销成就，重置为默认头衔
        if (def.titleReward && state.equippedTitle === def.titleReward) {
          state.equippedTitle = '初涉尘寰的旅人';
        }
        state.totalScore = recomputeTotalScore(state);

        var revokedMap = {};
        revokedMap[aid] = true;
        var saved = await self.saveState(state, {
          expectedRevision: baseRev,
          mergeOpts: { revokedIds: revokedMap, titleEquipped: true }
        });

        if (global.WanwanSharedHub && typeof global.WanwanSharedHub.emit === 'function') {
          await global.WanwanSharedHub.emit('ACHIEVEMENT_REVOKED', {
            achievementId: aid,
            reason: state.revokedRecords[aid].reason,
            totalScore: saved.totalScore
          });
        }
        return {
          ok: true,
          achievementId: aid,
          revoked: true,
          totalScore: saved.totalScore
        };
      });
    },

    async reconcileSourceRevocation(options) {
      options = options || {};
      var self = this;
      return enqueueMutation(async function() {
        var state = await self.loadState();
        var baseRev = state.revision;
        var snapshot = await readSourceSnapshot({ charScope: 'all' });
        var preserved = [];
        var revoked = [];
        var revokedMap = {};

        ACHIEVEMENT_DEFINITIONS.forEach(function(def) {
          if (!def || DEPRECATED_BADGE_IDS[def.achievementId]) return;
          var aid = def.achievementId;
          var rec = state.unlockRecords[aid];
          if (!rec || !rec.unlocked) return;

          if (options.targetAchievementId && String(options.targetAchievementId) !== aid) return;
          if (options.sourceApp && def.sourceApp !== options.sourceApp) return;

          var stillMet = false;
          if (def.charScoped) {
            var charIds = Object.keys(snapshot.bondByChar || {});
            stillMet = charIds.some(function(cid) {
              var b = snapshot.bondByChar[cid];
              return evaluateCondition(def, Object.assign({}, snapshot, { bond: b }), null);
            });
          } else {
            stillMet = evaluateCondition(def, snapshot, null);
          }

          if (stillMet) return;

          if (def.revocationPolicy === 'preserve_milestone' && !options.forceErroneousRevoke) {
            preserved.push(aid);
            return;
          }

          state.revokedRecords[aid] = {
            achievementId: aid,
            previousUnlockedAt: rec.unlockedAt,
            revokedAt: Date.now(),
            reason: options.reason || 'current_state_revoked',
            policy: def.revocationPolicy
          };
          rec.unlocked = false;
          rec.unlockedAt = null;
          rec.occurredAt = null;
          rec.unlockCount = 0;
          if (def.charScoped && state.charScopedUnlocks) {
            Object.keys(state.charScopedUnlocks).forEach(function(cid) {
              if (state.charScopedUnlocks[cid] && state.charScopedUnlocks[cid][aid]) {
                delete state.charScopedUnlocks[cid][aid];
              }
            });
          }
          revokedMap[aid] = true;
          revoked.push(aid);
          if (def.titleReward && state.equippedTitle === def.titleReward) {
            state.equippedTitle = '初涉尘寰的旅人';
          }
        });

        if (revoked.length > 0) {
          state.totalScore = recomputeTotalScore(state);
          await self.saveState(state, {
            expectedRevision: baseRev,
            mergeOpts: { revokedIds: revokedMap, titleEquipped: true }
          });
        }

        return {
          ok: true,
          preserved: preserved,
          revoked: revoked,
          totalScore: state.totalScore
        };
      });
    },

    async handleCharacterDeleted(charId) {
      if (charId === undefined || charId === null || charId === '') return { ok: false, reason: 'invalid_char_id' };
      var cid = String(charId);
      var self = this;
      return enqueueMutation(async function() {
        var state = await self.loadState();
        var baseRev = state.revision;
        var clearedBadges = [];
        if (state.charScopedUnlocks && state.charScopedUnlocks[cid]) {
          clearedBadges = Object.keys(state.charScopedUnlocks[cid]);
          delete state.charScopedUnlocks[cid];
        }

        // 检查全局汇总记录里是否有仅归属该已删除 Char 且无其他活跃 Char 持有的 charScoped 勋章
        var revokedMap = {};
        ACHIEVEMENT_DEFINITIONS.forEach(function(def) {
          if (!def || !def.charScoped) return;
          var aid = def.achievementId;
          var rec = state.unlockRecords[aid];
          if (!rec || !rec.unlocked) return;
          var otherHasIt = Object.keys(state.charScopedUnlocks || {}).some(function(otherCid) {
            return otherCid !== cid && state.charScopedUnlocks[otherCid] && state.charScopedUnlocks[otherCid][aid] && state.charScopedUnlocks[otherCid][aid].unlocked;
          });
          if (!otherHasIt && (String(rec.charId || '') === cid || clearedBadges.indexOf(aid) !== -1)) {
            state.revokedRecords[aid] = {
              achievementId: aid,
              charId: cid,
              revokedAt: Date.now(),
              reason: 'char_deleted',
              policy: 'char_isolation_cleanup'
            };
            rec.unlocked = false;
            rec.unlockedAt = null;
            rec.occurredAt = null;
            rec.charId = null;
            revokedMap[aid] = true;
            if (def.titleReward && state.equippedTitle === def.titleReward) {
              state.equippedTitle = '初涉尘寰的旅人';
            }
          } else if (String(rec.charId || '') === cid && otherHasIt) {
            // 若还有其他独立授权 Char 拥有此徽章，仅解除已删 Char 的引用而不串联数据
            var fallbackCid = Object.keys(state.charScopedUnlocks).find(function(k) {
              return state.charScopedUnlocks[k] && state.charScopedUnlocks[k][aid] && state.charScopedUnlocks[k][aid].unlocked;
            });
            rec.charId = fallbackCid || null;
          }
        });

        state.totalScore = recomputeTotalScore(state);
        var saved = await self.saveState(state, {
          expectedRevision: baseRev,
          mergeOpts: { deletedCharId: cid, revokedIds: revokedMap, titleEquipped: true }
        });

        // 通知 Phase 3 伴侣与纪念卡服务清理该 Char 的授权、日志隔离与卡片展示范围
        if (global.AchievementHallCompanion && typeof global.AchievementHallCompanion.handleCharacterDeleted === 'function') {
          try {
            await global.AchievementHallCompanion.handleCharacterDeleted(cid);
          } catch (_) {}
        }

        return {
          ok: true,
          deletedCharId: cid,
          clearedBadges: clearedBadges,
          totalScore: saved.totalScore
        };
      });
    }
  };

  // ====================================================
  // 五、标准来源事件协议与跨 App 自动解锁引擎 (Phase 2)
  // ====================================================
  function normalizeSourceEvent(raw) {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, reason: 'invalid_payload' };
    }
    var payload = (raw.payload && typeof raw.payload === 'object') ? raw.payload : raw;

    // 严禁把 AI 生成对话文本、纯浏览视图操作或跨 App 只读投影当作真实达成凭据
    if (
      raw.isAiGeneratedChat === true || raw.fromAiText === true || raw.fromChatText === true || raw.viewOnly === true ||
      payload.isAiGeneratedChat === true || payload.fromAiText === true || payload.fromChatText === true ||
      payload.viewOnly === true || payload.readOnlyProjection === true
    ) {
      return { valid: false, reason: 'ai_or_view_event_rejected' };
    }

    var sourceApp = raw.sourceApp ? String(raw.sourceApp) : '';
    if (!sourceApp) {
      if (raw.durationMinutes !== undefined || raw.recordId !== undefined) sourceApp = 'study-room';
      else if (raw.taskId !== undefined || raw.habitId !== undefined || raw.level !== undefined) sourceApp = 'life-game';
    }
    if (!SOURCE_APP_LABELS[sourceApp]) {
      return { valid: false, reason: 'unknown_source_app' };
    }

    var eventType = String(raw.eventType || raw.type || 'generic_update');
    var sourceRecordId = raw.sourceRecordId || raw.recordId || payload.recordId || payload.taskId || payload.eventId || payload.todoId || payload.mistakeId || payload.wishId || '';
    var occurrenceKey = raw.occurrenceKey || (payload.occurrenceDate && sourceRecordId ? (sourceRecordId + '#' + payload.occurrenceDate) : '') || sourceRecordId || raw.eventId || '';
    var charId = (raw.charId !== undefined && raw.charId !== null && raw.charId !== '')
      ? String(raw.charId)
      : ((payload.charId !== undefined && payload.charId !== null && payload.charId !== '') ? String(payload.charId) : null);
    var occurredAt = parseTimestampSafe(raw.occurredAt || raw.timestamp || payload.occurredAt || payload.timestamp) || Date.now();
    var sourceRevision = raw.sourceRevision !== undefined ? String(raw.sourceRevision) : '';

    // 各来源真实性硬校验
    if (sourceApp === 'study-room') {
      if (eventType === 'focus_completed' || raw.durationMinutes !== undefined || payload.durationMinutes !== undefined) {
        if (payload.cancelled === true || payload.aborted === true || payload.status === 'cancelled' || payload.status === 'aborted' || payload.status === 'paused') {
          return { valid: false, reason: 'cancelled_or_paused_study_session' };
        }
        var mins = Number(payload.durationMinutes !== undefined ? payload.durationMinutes : raw.durationMinutes) || 0;
        if (mins <= 0) {
          return { valid: false, reason: 'non_positive_study_duration' };
        }
      }
    }

    if (sourceApp === 'time-calendar') {
      if (payload.readOnly === true || (payload.source && payload.source.app && payload.source.app !== 'timeCalendar' && payload.source.app !== 'time-calendar')) {
        return { valid: false, reason: 'calendar_projection_excluded' };
      }
    }

    if (sourceApp === 'love-diary') {
      if (!charId) {
        return { valid: false, reason: 'missing_char_id_for_bond_event' };
      }
    }

    var eventId = String(raw.eventId || (sourceApp + ':' + eventType + ':' + (occurrenceKey || occurredAt)));
    var dedupeKey = sourceApp + ':' + eventType + ':' + (occurrenceKey || eventId) + (sourceRevision ? '@r' + sourceRevision : '');

    return {
      valid: true,
      eventId: eventId,
      dedupeKey: dedupeKey,
      eventType: eventType,
      sourceApp: sourceApp,
      sourceRecordId: String(sourceRecordId || ''),
      occurrenceKey: String(occurrenceKey || ''),
      charId: charId,
      occurredAt: occurredAt,
      sourceRevision: sourceRevision,
      payload: payload
    };
  }

  function evaluateCondition(def, snapshot, eventMeta) {
    var cond = def.unlockCondition;
    if (!cond || !cond.metric) return false;
    var val = getByMetricPath(snapshot, cond.metric);
    var target = Number(cond.target) || 1;

    // 对时段类特别成就在实时事件中也核验真实事件时间点
    if (def.achievementId === 'badge_morning_glow' && eventMeta && isHealthyMorningTs(eventMeta.occurredAt)) {
      if (eventMeta.eventType === 'habit_checkin' || eventMeta.eventType === 'task_claimed') val = Math.max(val, 1);
    }
    if (def.achievementId === 'badge_peaceful_night' && eventMeta && isPeacefulEveningTs(eventMeta.occurredAt)) {
      if (eventMeta.eventType === 'habit_checkin' || eventMeta.eventType === 'task_claimed') val = Math.max(val, 1);
    }

    var cmp = cond.comparator || '>=';
    if (cmp === '>=') return val >= target;
    if (cmp === '>') return val > target;
    if (cmp === '===') return val === target;
    return val >= target;
  }

  function evaluateDefinitionsAgainstSnapshot(state, snapshot, options) {
    options = options || {};
    var defs = options.defs || ACHIEVEMENT_DEFINITIONS;
    var eventMeta = options.eventMeta || null;
    var newlyUnlocked = [];

    defs.forEach(function(def) {
      if (!def || DEPRECATED_BADGE_IDS[def.achievementId]) return;

      if (def.charScoped) {
        // 多 Char 羁绊成就：严格按各自 charId 独立评估，严禁跨角色串联
        var charIdsToEval = [];
        if (eventMeta && eventMeta.charId) {
          charIdsToEval = [String(eventMeta.charId)];
        } else {
          charIdsToEval = Object.keys(snapshot.bondByChar || {});
        }

        charIdsToEval.forEach(function(cid) {
          var charBond = snapshot.bondByChar && snapshot.bondByChar[cid];
          if (!charBond) return;
          var scopedSnapshot = Object.assign({}, snapshot, {
            bond: {
              scopeRestrictedToPersonal: false,
              hasAcceptedSpace: charBond.hasAcceptedSpace,
              daysTogether: charBond.daysTogether,
              lettersAndDiaries: charBond.lettersAndDiaries,
              completedWishes: charBond.completedWishes,
              chatCount: charBond.chatCount
            }
          });
          if (evaluateCondition(def, scopedSnapshot, eventMeta)) {
            var histTs = null;
            if (def.achievementId === 'badge_first_chat') histTs = charBond.timestamps.firstChatAt;
            else if (def.achievementId === 'badge_love_space_open') histTs = charBond.timestamps.spaceAcceptedAt;
            else if (def.achievementId === 'badge_love_devotion') histTs = charBond.timestamps.fifthLetterAt;
            else if (def.achievementId === 'badge_love_wish_3') histTs = charBond.timestamps.thirdWishAt;

            var applyCharRes = applyUnlockToState(state, def, {
              charId: cid,
              occurredAt: (eventMeta && eventMeta.occurredAt) || histTs || (options.backfilled ? null : Date.now()),
              backfilled: Boolean(options.backfilled),
              sourceRecordId: eventMeta ? eventMeta.sourceRecordId : null
            });
            if (applyCharRes.granted) {
              newlyUnlocked.push({
                achievementId: def.achievementId,
                name: def.name,
                points: def.points,
                charId: cid,
                occurredAt: applyCharRes.record.occurredAt,
                unlockedAt: applyCharRes.record.unlockedAt,
                isHidden: Boolean(def.isHidden),
                backfilled: Boolean(options.backfilled)
              });
            }
          }
        });
        return;
      }

      if (evaluateCondition(def, snapshot, eventMeta)) {
        var resolvedHistTs = typeof def.resolveOccurredAt === 'function' ? def.resolveOccurredAt(snapshot) : null;
        var applyRes = applyUnlockToState(state, def, {
          charId: null,
          occurredAt: (eventMeta && eventMeta.occurredAt) || resolvedHistTs || (options.backfilled ? null : Date.now()),
          backfilled: Boolean(options.backfilled),
          sourceRecordId: eventMeta ? eventMeta.sourceRecordId : null
        });
        if (applyRes.granted) {
          newlyUnlocked.push({
            achievementId: def.achievementId,
            name: def.name,
            points: def.points,
            charId: null,
            occurredAt: applyRes.record.occurredAt,
            unlockedAt: applyRes.record.unlockedAt,
            isHidden: Boolean(def.isHidden),
            backfilled: Boolean(options.backfilled)
          });
        }
      }
    });

    return newlyUnlocked;
  }

  async function ingestSourceEvent(rawEvent) {
    var norm = normalizeSourceEvent(rawEvent);
    if (!norm.valid) {
      return { ok: false, rejected: true, reason: norm.reason, newlyUnlocked: [] };
    }

    return enqueueMutation(async function() {
      try {
        var state = await AchievementHallStore.loadState();
        var baseRev = state.revision;

        // 幂等防刷：已处理过的权威事件直接拦截（即使在备份恢复之后亦保持持久幂等）
        if (norm.dedupeKey && state.processedEvents[norm.dedupeKey]) {
          return {
            ok: true,
            deduped: true,
            eventId: norm.eventId,
            dedupeKey: norm.dedupeKey,
            newlyUnlocked: [],
            totalScore: state.totalScore
          };
        }

        // 读取最新权威来源快照，并仅聚焦受该事件影响的成就分类子集（避免每次事件全量扫无关分类）
        var evalScope = norm.charId ? norm.charId : 'all';
        var snapshot = await readSourceSnapshot({ charScope: evalScope });
        var targetDefs = DEFINITIONS_BY_SOURCE[norm.sourceApp] || ACHIEVEMENT_DEFINITIONS;

        var newlyUnlocked = evaluateDefinitionsAgainstSnapshot(state, snapshot, {
          defs: targetDefs,
          eventMeta: norm,
          backfilled: false
        });

        state.processedEvents[norm.dedupeKey] = {
          eventId: norm.eventId,
          sourceApp: norm.sourceApp,
          sourceRecordId: norm.sourceRecordId,
          occurrenceKey: norm.occurrenceKey,
          occurredAt: norm.occurredAt,
          processedAt: Date.now(),
          unlockedIds: newlyUnlocked.map(function(u) { return u.achievementId; })
        };

        var saved = await AchievementHallStore.saveState(state, { expectedRevision: baseRev });

        if (global.WanwanSharedHub && typeof global.WanwanSharedHub.emit === 'function') {
          for (var i = 0; i < newlyUnlocked.length; i++) {
            var u = newlyUnlocked[i];
            var defObj = DEFINITION_BY_ID[u.achievementId];
            await global.WanwanSharedHub.emit('ACHIEVEMENT_UNLOCKED', {
              badge: {
                id: u.achievementId,
                achievementId: u.achievementId,
                name: u.name,
                points: u.points,
                category: defObj ? defObj.category : 'growth',
                sourceApp: defObj ? defObj.sourceApp : norm.sourceApp,
                isMajorMilestone: Boolean(defObj && defObj.isMajorMilestone),
                isHidden: Boolean(u.isHidden),
                charScoped: Boolean(defObj && defObj.charScoped)
              },
              charId: u.charId,
              sourceEventId: norm.eventId,
              sourceRecordId: norm.sourceRecordId,
              occurrenceKey: norm.occurrenceKey,
              sourceApp: norm.sourceApp,
              occurredAt: u.occurredAt,
              unlockedAt: u.unlockedAt,
              backfilled: false,
              totalScore: saved.totalScore
            });
          }
          await global.WanwanSharedHub.emit('ACHIEVEMENT_PROGRESS_UPDATED', {
            sourceApp: norm.sourceApp,
            eventId: norm.eventId,
            newlyUnlockedCount: newlyUnlocked.length,
            totalScore: saved.totalScore
          });
        }

        return {
          ok: true,
          deduped: false,
          eventId: norm.eventId,
          dedupeKey: norm.dedupeKey,
          newlyUnlocked: newlyUnlocked,
          totalScore: saved.totalScore
        };
      } catch (err) {
        var msg = String((err && err.message) || err || 'storage_error');
        _lastSyncError = { message: msg, at: Date.now() };
        return { ok: false, reason: 'storage_error', error: msg, newlyUnlocked: [] };
      }
    });
  }

  // 高频爆发事件合流节流器（避免短时间连续推送导致重复 UI 刷屏）
  var _coalescedQueue = {};
  function scheduleSourceEvent(rawEvent) {
    var norm = normalizeSourceEvent(rawEvent);
    if (!norm.valid) return Promise.resolve({ ok: false, rejected: true, reason: norm.reason, newlyUnlocked: [] });
    var bucketKey = norm.sourceApp + ':' + norm.eventType;
    if (!_coalescedQueue[bucketKey]) {
      _coalescedQueue[bucketKey] = { items: [], timer: null, waiters: [] };
    }
    var bucket = _coalescedQueue[bucketKey];
    bucket.items.push(rawEvent);

    return new Promise(function(resolve) {
      bucket.waiters.push(resolve);
      if (!bucket.timer) {
        bucket.timer = setTimeout(async function() {
          var batch = bucket.items.slice();
          var waiters = bucket.waiters.slice();
          delete _coalescedQueue[bucketKey];
          var allUnlocked = [];
          var lastRes = { ok: true, newlyUnlocked: [] };
          for (var i = 0; i < batch.length; i++) {
            lastRes = await ingestSourceEvent(batch[i]);
            if (lastRes.newlyUnlocked && lastRes.newlyUnlocked.length) {
              allUnlocked = allUnlocked.concat(lastRes.newlyUnlocked);
            }
          }
          var mergedRes = Object.assign({}, lastRes, { newlyUnlocked: allUnlocked });
          waiters.forEach(function(fn) { fn(mergedRes); });
        }, 16);
      }
    });
  }

  // ====================================================
  // 六、历史成就分批校准补算与规则版本升级 (Backfill)
  // 严格幂等、不重复发放、不触碰任何原 App 经验与金币
  // ====================================================
  async function backfillFromHistory(options) {
    options = options || {};
    var batchSize = Math.max(1, Number(options.batchSize) || 10);
    var startTime = Date.now();

    return enqueueMutation(async function() {
      try {
        var state = await AchievementHallStore.loadState();
        var baseRev = state.revision;
        var prevRuleVersion = state.ruleVersion || 1;
        var snapshot = await readSourceSnapshot({ charScope: 'all' });

        var newlyUnlocked = [];
        for (var i = 0; i < ACHIEVEMENT_DEFINITIONS.length; i += batchSize) {
          var chunk = ACHIEVEMENT_DEFINITIONS.slice(i, i + batchSize);
          var chunkRes = evaluateDefinitionsAgainstSnapshot(state, snapshot, {
            defs: chunk,
            eventMeta: null,
            backfilled: true
          });
          if (chunkRes.length) newlyUnlocked = newlyUnlocked.concat(chunkRes);
          if (i + batchSize < ACHIEVEMENT_DEFINITIONS.length) {
            await new Promise(function(r) { setTimeout(r, 0); });
          }
        }

        state.ruleVersion = RULE_VERSION;
        state.lastBackfillAt = Date.now();
        state.lastBackfillSummary = {
          checkedCount: ACHIEVEMENT_DEFINITIONS.length,
          newlyUnlockedCount: newlyUnlocked.length,
          upgradedFromRuleVersion: prevRuleVersion < RULE_VERSION ? prevRuleVersion : null,
          durationMs: Date.now() - startTime
        };

        var saved = await AchievementHallStore.saveState(state, { expectedRevision: baseRev });

        if (global.WanwanSharedHub && typeof global.WanwanSharedHub.emit === 'function') {
          await global.WanwanSharedHub.emit('ACHIEVEMENT_PROGRESS_UPDATED', {
            sourceApp: 'all',
            backfill: true,
            newlyUnlockedCount: newlyUnlocked.length,
            totalScore: saved.totalScore
          });
        }

        return {
          ok: true,
          upgradedFromRuleVersion: prevRuleVersion < RULE_VERSION ? prevRuleVersion : null,
          ruleVersion: saved.ruleVersion,
          newlyUnlocked: newlyUnlocked,
          newlyUnlockedCount: newlyUnlocked.length,
          totalScore: saved.totalScore,
          durationMs: state.lastBackfillSummary.durationMs
        };
      } catch (err) {
        var msg = String((err && err.message) || err || 'backfill_error');
        _lastSyncError = { message: msg, at: Date.now() };
        return { ok: false, reason: 'storage_error', error: msg, newlyUnlocked: [] };
      }
    });
  }

  // ====================================================
  // 七、单例事件监听绑定与安卓前后台恢复刷新
  // ====================================================
  var _listenersInitialized = false;
  var _visibilityBound = false;
  var _crossTabBound = false;
  var _uiRefreshTimer = null;
  var _handlerRefs = {};

  function queueActivePageRefresh(unlockedPayload) {
    var pageEl = (typeof document !== 'undefined') ? document.getElementById('achievement-page') : null;
    if (!pageEl) return;
    if (unlockedPayload && unlockedPayload.badge && !unlockedPayload.backfilled) {
      var comp = global.AchievementHallCompanion;
      if (comp && typeof comp.getSettings === 'function') {
        comp.getSettings().then(function(s) {
          if (!s || s.unlockToastEnabled !== false) {
            showInAppUnlockBanner(unlockedPayload.badge, {
              isMajor: comp.isAchievementMajor(unlockedPayload.badge.achievementId, s),
              majorPrompt: !s || s.majorMementoPromptEnabled !== false
            });
          }
        }).catch(function() {
          showInAppUnlockBanner(unlockedPayload.badge);
        });
      } else {
        showInAppUnlockBanner(unlockedPayload.badge);
      }
    }
    if (_uiRefreshTimer) clearTimeout(_uiRefreshTimer);
    _uiRefreshTimer = setTimeout(function() {
      _uiRefreshTimer = null;
      var currentEl = (typeof document !== 'undefined') ? document.getElementById('achievement-page') : null;
      if (currentEl) {
        refreshPage(currentEl);
      }
    }, 30);
  }

  function initAutoSync() {
    if (!_listenersInitialized && global.WanwanSharedHub && typeof global.WanwanSharedHub.on === 'function') {
      _handlerRefs.onSourceEvent = async function(ev) {
        await ingestSourceEvent(ev);
      };
      _handlerRefs.onFocusCompleted = async function(payload) {
        if (!payload || payload.cancelled || payload.aborted || payload.status === 'cancelled' || payload.status === 'paused') {
          return;
        }
        var mins = Number(payload.durationMinutes) || 0;
        if (mins <= 0) return;
        await ingestSourceEvent({
          eventId: payload.eventId || ('study_record_' + (payload.recordId || Date.now())),
          eventType: 'focus_completed',
          sourceApp: 'study-room',
          sourceRecordId: payload.recordId || '',
          occurrenceKey: payload.recordId || payload.eventId || '',
          occurredAt: payload.timestamp || Date.now(),
          charId: null, // 学习记录属用户个人资产，不锁死在单一角色
          payload: payload
        });
      };
      _handlerRefs.onLifeGameStateChanged = async function(payload) {
        if (!payload) return;
        if (payload.leveledUp || (payload.expGained && payload.expGained > 0)) {
          await ingestSourceEvent({
            eventId: 'lg_state_' + (payload.state && payload.state.level ? ('lv' + payload.state.level) : 'exp') + '_' + (payload.reason || 'gain'),
            eventType: payload.leveledUp ? 'level_up' : 'state_changed',
            sourceApp: 'life-game',
            sourceRecordId: payload.state && payload.state.level ? ('lv_' + payload.state.level) : '',
            occurrenceKey: payload.leveledUp ? ('level_' + payload.state.level) : ('exp_' + (payload.state ? payload.state.exp : Date.now())),
            occurredAt: Date.now(),
            payload: payload
          });
        }
      };
      _handlerRefs.onAchievementUnlockedUI = function(payload) {
        queueActivePageRefresh(payload);
      };
      _handlerRefs.onProgressUpdatedUI = function() {
        queueActivePageRefresh(null);
      };

      global.WanwanSharedHub.on('ACHIEVEMENT_SOURCE_EVENT', _handlerRefs.onSourceEvent);
      global.WanwanSharedHub.on('FOCUS_SESSION_COMPLETED', _handlerRefs.onFocusCompleted);
      global.WanwanSharedHub.on('LIFEGAME_STATE_CHANGED', _handlerRefs.onLifeGameStateChanged);
      global.WanwanSharedHub.on('ACHIEVEMENT_UNLOCKED', _handlerRefs.onAchievementUnlockedUI);
      global.WanwanSharedHub.on('ACHIEVEMENT_PROGRESS_UPDATED', _handlerRefs.onProgressUpdatedUI);
      _listenersInitialized = true;
    }

    if (!_visibilityBound && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      _handlerRefs.onVisibilityChange = function() {
        if (document.visibilityState === 'visible') {
          var pageEl = document.getElementById('achievement-page');
          if (pageEl) refreshPage(pageEl);
        }
      };
      document.addEventListener('visibilitychange', _handlerRefs.onVisibilityChange);
      _visibilityBound = true;
    }

    if (!_crossTabBound) {
      if (typeof global.BroadcastChannel === 'function') {
        try {
          _broadcastChannel = new global.BroadcastChannel(BROADCAST_CHANNEL_NAME);
          if (typeof _broadcastChannel.unref === 'function') {
            _broadcastChannel.unref();
          }
          _broadcastChannel.onmessage = function(ev) {
            if (!ev || !ev.data || ev.data.source === _instanceId) return;
            queueActivePageRefresh(null);
          };
        } catch (_) {
          _broadcastChannel = null;
        }
      }
      if (typeof global.addEventListener === 'function') {
        _handlerRefs.onStorageEvent = function(ev) {
          if (ev && ev.key === STORAGE_KEY) {
            queueActivePageRefresh(null);
          }
        };
        global.addEventListener('storage', _handlerRefs.onStorageEvent);
      }
      _crossTabBound = true;
    }
    return { listenersInitialized: _listenersInitialized, visibilityBound: _visibilityBound, crossTabBound: _crossTabBound };
  }

  function disposeAutoSync() {
    if (_listenersInitialized && global.WanwanSharedHub && typeof global.WanwanSharedHub.off === 'function') {
      global.WanwanSharedHub.off('ACHIEVEMENT_SOURCE_EVENT', _handlerRefs.onSourceEvent);
      global.WanwanSharedHub.off('FOCUS_SESSION_COMPLETED', _handlerRefs.onFocusCompleted);
      global.WanwanSharedHub.off('LIFEGAME_STATE_CHANGED', _handlerRefs.onLifeGameStateChanged);
      global.WanwanSharedHub.off('ACHIEVEMENT_UNLOCKED', _handlerRefs.onAchievementUnlockedUI);
      global.WanwanSharedHub.off('ACHIEVEMENT_PROGRESS_UPDATED', _handlerRefs.onProgressUpdatedUI);
      _listenersInitialized = false;
    }
    if (_visibilityBound && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', _handlerRefs.onVisibilityChange);
      _visibilityBound = false;
    }
    if (_crossTabBound) {
      if (_broadcastChannel && typeof _broadcastChannel.close === 'function') {
        try { _broadcastChannel.close(); } catch (_) {}
      }
      _broadcastChannel = null;
      if (_handlerRefs.onStorageEvent && typeof global.removeEventListener === 'function') {
        global.removeEventListener('storage', _handlerRefs.onStorageEvent);
      }
      _crossTabBound = false;
    }
  }

  // ====================================================
  // 八、展示模型与隐藏成就隐私脱敏 (ViewModel & Masking)
  // ====================================================
  function resolveScopedUnlockRecord(def, state, charScope) {
    if (!def || !state) return null;
    if (def.charScoped) {
      if (charScope === 'personal') {
        return null;
      }
      if (charScope && charScope !== 'all') {
        var bucket = state.charScopedUnlocks && state.charScopedUnlocks[String(charScope)];
        if (bucket && bucket[def.achievementId]) {
          return bucket[def.achievementId];
        }
        var summaryRec = state.unlockRecords && state.unlockRecords[def.achievementId];
        if (summaryRec && summaryRec.unlocked && summaryRec.charId && String(summaryRec.charId) === String(charScope)) {
          return summaryRec;
        }
        return null;
      }
    }
    return (state.unlockRecords && state.unlockRecords[def.achievementId]) || null;
  }

  function presentAchievementItem(def, record, snapshot) {
    if (!def) return null;
    var unlocked = Boolean(record && record.unlocked);
    var unlockedAt = unlocked ? (record.unlockedAt || null) : null;
    var occurredAt = unlocked ? (record.occurredAt || record.unlockedAt || null) : null;
    var favorite = Boolean(record && record.favorite);

    var rawProgress = { current: 0, target: 1, percent: unlocked ? 100 : 0, unit: '', text: unlocked ? '已达成' : '待探索', remainingText: '' };
    try {
      if (typeof def.progressCalculator === 'function') {
        rawProgress = def.progressCalculator(snapshot, unlocked) || rawProgress;
      }
    } catch (_) {
      rawProgress = { current: 0, target: 1, percent: unlocked ? 100 : 0, unit: '', text: '暂无进度', remainingText: '' };
    }

    if (unlocked) {
      rawProgress = Object.assign({}, rawProgress, {
        current: Math.max(Number(rawProgress.current) || 0, Number(rawProgress.target) || 1),
        percent: 100,
        remainingText: '已达成'
      });
    }

    var masked = Boolean(def.isHidden && !unlocked);
    var catMeta = getCategoryMeta(def.category);

    return {
      achievementId: def.achievementId,
      name: masked ? '？？？' : def.name,
      description: masked
        ? (def.unlockCondition && def.unlockCondition.hintWhenHidden
            ? def.unlockCondition.hintWhenHidden
            : '隐藏神秘成就，静待在特定契机中被发现。')
        : def.description,
      conditionText: masked
        ? '隐藏条件已保护（解锁后揭晓）'
        : ((def.unlockCondition && def.unlockCondition.description) || def.description),
      category: catMeta.key,
      categoryName: catMeta.name,
      categoryIcon: catMeta.icon,
      icon: masked ? 'fa-solid fa-question' : def.icon,
      points: def.points || 100,
      titleReward: masked ? null : (def.titleReward || null),
      sourceApp: def.sourceApp,
      sourceTab: def.sourceTab || '',
      sourceAppLabel: getSourceAppLabel(def.sourceApp),
      isHidden: Boolean(def.isHidden),
      isMasked: masked,
      isMajorMilestone: Boolean(def.isMajorMilestone),
      revocationPolicy: def.revocationPolicy || 'preserve_milestone',
      repeatable: Boolean(def.repeatable),
      charScoped: Boolean(def.charScoped),
      ruleVersion: def.ruleVersion || RULE_VERSION,
      unlocked: unlocked,
      unlockedAt: unlockedAt,
      occurredAt: occurredAt,
      backfilled: Boolean(record && record.backfilled),
      charId: (record && record.charId) || null,
      favorite: favorite,
      progress: masked
        ? { current: 0, target: 1, percent: 0, unit: '', text: '探索中', remainingText: '隐藏条件探索中' }
        : rawProgress
    };
  }

  async function buildHallViewModel(options) {
    options = options || {};
    var charScope = options.charScope || 'all';
    var state = await AchievementHallStore.loadState();
    var snapshot = await readSourceSnapshot({ charScope: charScope });

    var items = ACHIEVEMENT_DEFINITIONS.map(function(def) {
      var rec = resolveScopedUnlockRecord(def, state, charScope);
      // 保留通用收藏标志
      if (rec && state.unlockRecords[def.achievementId] && state.unlockRecords[def.achievementId].favorite) {
        rec = Object.assign({}, rec, { favorite: true });
      } else if (!rec && state.unlockRecords[def.achievementId] && state.unlockRecords[def.achievementId].favorite) {
        rec = { unlocked: false, favorite: true };
      }
      return presentAchievementItem(def, rec, snapshot);
    }).filter(Boolean);

    var totalCount = items.length;
    var unlockedItems = items.filter(function(item) { return item.unlocked; });
    var unlockedCount = unlockedItems.length;
    var progressPercent = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

    var recentUnlocks = unlockedItems
      .slice()
      .sort(function(a, b) { return (b.unlockedAt || 0) - (a.unlockedAt || 0); })
      .slice(0, 6);

    var availableTitles = ['初涉尘寰的旅人'];
    Object.keys(state.unlockRecords || {}).forEach(function(id) {
      var r = state.unlockRecords[id];
      var d = DEFINITION_BY_ID[id];
      if (r && r.unlocked && d && d.titleReward && availableTitles.indexOf(d.titleReward) === -1) {
        availableTitles.push(d.titleReward);
      }
    });

    var archivedCount = Object.keys(state.unlockRecords || {}).filter(function(id) {
      return !DEFINITION_BY_ID[id] && !DEPRECATED_BADGE_IDS[id] && state.unlockRecords[id].unlocked;
    }).length;

    var companionSettings = null;
    var wallPrefs = { layout: 'grid', featuredIds: [], customOrder: [] };
    var wallItems = [];
    var mementos = [];
    var congratLogs = [];
    var comp = global.AchievementHallCompanion;
    if (comp) {
      try {
        if (typeof comp.getSettings === 'function') companionSettings = await comp.getSettings();
        if (typeof comp.getWallPrefs === 'function') wallPrefs = await comp.getWallPrefs();
        if (typeof comp.buildWallItems === 'function') wallItems = comp.buildWallItems({ items: items }, wallPrefs);
        if (typeof comp.listMementoCards === 'function') mementos = await comp.listMementoCards(charScope);
        if (typeof comp.loadLogs === 'function') congratLogs = await comp.loadLogs();
      } catch (_) {}
    }

    return {
      charScope: charScope,
      characters: snapshot.characters,
      categories: ACHIEVEMENT_CATEGORIES.slice(),
      equippedTitle: state.equippedTitle || '初涉尘寰的旅人',
      availableTitles: availableTitles,
      totalScore: state.totalScore || 0,
      totalCount: totalCount,
      unlockedCount: unlockedCount,
      lockedCount: Math.max(0, totalCount - unlockedCount),
      progressPercent: progressPercent,
      recentUnlocks: recentUnlocks,
      items: items,
      archivedCount: archivedCount,
      ruleVersion: state.ruleVersion || 1,
      latestRuleVersion: RULE_VERSION,
      needsRuleUpgrade: (state.ruleVersion || 1) < RULE_VERSION,
      lastBackfillAt: state.lastBackfillAt || null,
      lastSyncError: _lastSyncError,
      companionSettings: companionSettings,
      wallPrefs: wallPrefs,
      wallItems: wallItems,
      mementos: mementos,
      congratLogs: congratLogs
    };
  }

  function getAchievementDetailById(achievementId, state, snapshot, charScope) {
    var def = DEFINITION_BY_ID[String(achievementId || '')];
    if (!def || DEPRECATED_BADGE_IDS[def.achievementId]) {
      return null;
    }
    var rec = resolveScopedUnlockRecord(def, state, charScope || 'all');
    return presentAchievementItem(def, rec, snapshot);
  }

  // ====================================================
  // 九、来源 App 安全跳转
  // ====================================================
  async function navigateToSourceApp(item) {
    if (!item || !item.sourceApp) {
      if (global.toast) global.toast('暂未配置来源软件入口');
      return { ok: false, reason: 'missing_source' };
    }
    var app = item.sourceApp;
    var tab = item.sourceTab || '';

    try {
      if (app === 'life-game') {
        if (global.showLifeGamePage) {
          await global.showLifeGamePage({ tab: tab || 'tasks', fromApp: 'achievement-hall' });
          return { ok: true, app: 'life-game' };
        }
      } else if (app === 'study-room') {
        if (global.showStudyRoomPage) {
          await global.showStudyRoomPage({ tab: tab || 'duo', preserveTimer: true, fromApp: 'achievement-hall' });
          return { ok: true, app: 'study-room' };
        }
      } else if (app === 'time-calendar') {
        if (global.showTimeCalendarPage) {
          await global.showTimeCalendarPage({ tab: tab || 'calendar', fromApp: 'achievement-hall' });
          return { ok: true, app: 'time-calendar' };
        }
      } else if (app === 'love-diary') {
        if (global.showLoveDiaryPage) {
          await global.showLoveDiaryPage({ tab: tab || 'album', fromApp: 'achievement-hall' });
          return { ok: true, app: 'love-diary' };
        }
      } else if (app === 'wechat') {
        if (global.showWechatPage) {
          await global.showWechatPage();
          return { ok: true, app: 'wechat' };
        }
      } else if (app === 'our-home') {
        if (global.showOurHomePage) {
          await global.showOurHomePage();
          return { ok: true, app: 'our-home' };
        }
      }
    } catch (err) {
      if (global.toast) global.toast('跳转来源软件失败，请稍后再试');
      return { ok: false, reason: 'nav_error', error: String(err && err.message || err) };
    }

    if (global.toast) global.toast(getSourceAppLabel(app) + ' 模块暂未就绪');
    return { ok: false, reason: 'module_unavailable', app: app };
  }

  // ====================================================
  // 十、成就馆页面 UI 渲染与交互控制 (含 Phase 3 四入口、勋章墙、纪念卡、祝贺设置)
  // ====================================================
  var _uiState = {
    activeTab: 'gallery', // 'gallery' | 'wall' | 'mementos' | 'settings'
    categoryFilter: 'all',
    statusFilter: 'all',
    onlyFavorites: false,
    charScope: 'all',
    viewModel: null,
    isOpening: false,
    isCalibrating: false,
    selectedCharForBlessing: ''
  };

  function closeModalByClass(cls) {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    var existing = document.querySelectorAll('.' + cls);
    existing.forEach(function(el) { el.remove(); });
  }

  function showInAppUnlockBanner(badge, opts) {
    if (typeof document === 'undefined' || !document.body) return;
    opts = opts || {};
    closeModalByClass('ah-live-toast');
    var el = document.createElement('div');
    el.className = 'ah-live-toast';
    el.setAttribute('role', 'status');
    var subText = '+' + (badge.points || 100) + ' 荣誉点已自动收录' +
      (opts.isMajor && opts.majorPrompt ? ' · 重要里程碑可生成纪念卡' : '');
    el.innerHTML =
      '<div class="ah-live-toast-icon"><i class="fa-solid fa-trophy"></i></div>' +
      '<div class="ah-live-toast-body">' +
        '<div class="ah-live-toast-title">新成就解锁 · ' + esc(badge.name) + '</div>' +
        '<div class="ah-live-toast-sub">' + esc(subText) + '</div>' +
      '</div>';
    document.body.appendChild(el);
    setTimeout(function() {
      if (el && el.remove) el.remove();
    }, 3200);
  }

  function copyTextSafe(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(function() { return true; }).catch(function() { return false; });
    }
    try {
      if (typeof document !== 'undefined' && document.createElement) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand && document.execCommand('copy');
        ta.remove();
        return Promise.resolve(Boolean(ok));
      }
    } catch (_) {}
    return Promise.resolve(false);
  }

  function renderCharScopeBarHTML(vm) {
    if (!vm.characters || vm.characters.length === 0) return '';
    return (
      '<div class="ah-char-bar" role="tablist" aria-label="成就视角筛选">' +
        '<button type="button" class="ah-char-btn ' + (_uiState.charScope === 'all' ? 'active' : '') + '" data-ah-char="all">全部视角</button>' +
        '<button type="button" class="ah-char-btn ' + (_uiState.charScope === 'personal' ? 'active' : '') + '" data-ah-char="personal">仅看个人</button>' +
        vm.characters.map(function(c) {
          var cid = String(c.id);
          var cname = c.nick || c.nickname || c.name || ('角色 ' + cid);
          return '<button type="button" class="ah-char-btn ' + (_uiState.charScope === cid ? 'active' : '') + '" data-ah-char="' + esc(cid) + '">' + esc(cname) + '</button>';
        }).join('') +
      '</div>'
    );
  }

  function renderBadgesHTML(vm) {
    var list = vm.items.filter(function(item) {
      if (_uiState.categoryFilter !== 'all' && item.category !== _uiState.categoryFilter) return false;
      if (_uiState.statusFilter === 'unlocked' && !item.unlocked) return false;
      if (_uiState.statusFilter === 'locked' && item.unlocked) return false;
      if (_uiState.onlyFavorites && !item.favorite) return false;
      return true;
    });

    if (list.length === 0) {
      return (
        '<div class="ah-empty-grid">' +
          '当前筛选条件下暂无成就勋章。<br>' +
          '可以切换「全部 / 未解锁」或查看其它分类。' +
        '</div>'
      );
    }

    return '<div class="ah-badge-grid">' + list.map(function(item) {
      var cls = 'ah-badge-card ' + (item.unlocked ? 'is-unlocked' : 'is-locked') + (item.isMasked ? ' is-hidden-locked' : '');
      return (
        '<button type="button" class="' + cls + '" data-ah-id="' + esc(item.achievementId) + '">' +
          '<div class="ah-badge-card-top">' +
            '<div class="ah-badge-emblem"><i class="' + esc(item.icon) + '"></i></div>' +
            '<div class="ah-badge-top-right">' +
              (item.favorite ? '<span class="ah-badge-pin" aria-label="已收藏置顶"><i class="fa-solid fa-star"></i></span>' : '') +
              '<span>' + (item.unlocked ? '已解锁' : (item.isMasked ? '隐藏' : '待解锁')) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="ah-badge-name">' + esc(item.name) + '</div>' +
          '<div class="ah-badge-desc">' + esc(item.description) + '</div>' +
          '<div class="ah-badge-foot">' +
            '<div class="ah-mini-progress">' +
              '<div class="ah-mini-progress-fill" style="width:' + item.progress.percent + '%"></div>' +
            '</div>' +
            '<div class="ah-badge-meta-line">' +
              '<span>' + esc(item.sourceAppLabel) + '</span>' +
              '<span>' + esc(item.progress.text) + '</span>' +
            '</div>' +
          '</div>' +
        '</button>'
      );
    }).join('') + '</div>';
  }

  function renderGalleryTabHTML(vm) {
    var recentHTML = vm.recentUnlocks.length > 0
      ? '<div class="ah-recent-strip">' +
          vm.recentUnlocks.map(function(item) {
            return (
              '<button type="button" class="ah-recent-card" data-ah-id="' + esc(item.achievementId) + '">' +
                '<div class="ah-recent-icon"><i class="' + esc(item.icon) + '"></i></div>' +
                '<div class="ah-recent-info">' +
                  '<div class="ah-recent-name">' + esc(item.name) + '</div>' +
                  '<div class="ah-recent-date">' + esc(formatDateShort(item.unlockedAt) || '已达成') + '</div>' +
                '</div>' +
              '</button>'
            );
          }).join('') +
        '</div>'
      : '<div class="ah-empty-banner">尚未点亮任何勋章。若在其它软件已积累过往记录，可点击上方「校准历史成就」进行一次性实绩核验。</div>';

    var calibrateHintText = vm.needsRuleUpgrade
      ? ('检测到规则版本更新 (v' + vm.ruleVersion + ' → v' + vm.latestRuleVersion + ')，可校准补算新成就')
      : (vm.lastBackfillAt
          ? ('上次校准：' + formatDateTime(vm.lastBackfillAt))
          : '根据人生游戏、自习室、日历与恋爱记真实记录同步补算');

    return (
      '<section class="ah-overview-card" aria-label="成就总览">' +
        '<div class="ah-overview-top">' +
          '<div>' +
            '<div class="ah-overview-count-label">已解锁成就</div>' +
            '<div class="ah-overview-count">' +
              '<span class="ah-overview-count-num">' + vm.unlockedCount + '</span>' +
              '<span class="ah-overview-count-total">/ ' + vm.totalCount + ' 枚</span>' +
            '</div>' +
          '</div>' +
          '<div class="ah-overview-rate">' +
            '<div class="ah-overview-rate-num">' + vm.progressPercent + '%</div>' +
            '<div class="ah-overview-rate-label">收集进度</div>' +
          '</div>' +
        '</div>' +
        '<div class="ah-progress-track">' +
          '<div class="ah-progress-fill" style="width:' + vm.progressPercent + '%"></div>' +
        '</div>' +
        '<div class="ah-title-row">' +
          '<div class="ah-title-meta">' +
            '<div class="ah-title-label">当前佩戴头衔</div>' +
            '<div class="ah-title-value">' + esc(vm.equippedTitle) + '</div>' +
          '</div>' +
          '<button type="button" class="ah-title-btn" id="ah-btn-title-picker">更换头衔</button>' +
        '</div>' +
        '<div class="ah-calibrate-row">' +
          '<div class="ah-calibrate-hint">' + esc(calibrateHintText) + '</div>' +
          '<button type="button" class="ah-calibrate-btn" id="ah-btn-calibrate" ' + (_uiState.isCalibrating ? 'disabled' : '') + '>' +
            '<i class="fa-solid fa-rotate"></i><span>' + (_uiState.isCalibrating ? '校准中' : '校准历史成就') + '</span>' +
          '</button>' +
        '</div>' +
      '</section>' +

      '<section class="ah-section-block" aria-label="最近获得">' +
        '<div class="ah-section-head">' +
          '<div class="ah-section-title"><i class="fa-solid fa-clock-rotate-left"></i> 最近获得</div>' +
          '<div class="ah-section-sub">' + (vm.recentUnlocks.length > 0 ? ('共 ' + vm.unlockedCount + ' 枚记录') : '待点亮') + '</div>' +
        '</div>' +
        recentHTML +
      '</section>' +

      renderCharScopeBarHTML(vm) +

      '<section class="ah-filter-stack" aria-label="成就筛选">' +
        '<div class="ah-status-row">' +
          '<div class="ah-segmented" role="tablist">' +
            '<button type="button" class="ah-seg-btn ' + (_uiState.statusFilter === 'all' ? 'active' : '') + '" data-ah-status="all">全部 (' + vm.totalCount + ')</button>' +
            '<button type="button" class="ah-seg-btn ' + (_uiState.statusFilter === 'unlocked' ? 'active' : '') + '" data-ah-status="unlocked">已解锁 (' + vm.unlockedCount + ')</button>' +
            '<button type="button" class="ah-seg-btn ' + (_uiState.statusFilter === 'locked' ? 'active' : '') + '" data-ah-status="locked">未解锁 (' + vm.lockedCount + ')</button>' +
          '</div>' +
          '<button type="button" class="ah-fav-filter-btn ' + (_uiState.onlyFavorites ? 'active' : '') + '" id="ah-btn-fav-filter" title="仅看收藏置顶">' +
            '<i class="fa-solid fa-star"></i>' +
          '</button>' +
        '</div>' +

        '<div class="ah-cat-tabs" role="tablist">' +
          '<button type="button" class="ah-cat-tab ' + (_uiState.categoryFilter === 'all' ? 'active' : '') + '" data-ah-cat="all">全部</button>' +
          vm.categories.map(function(cat) {
            return (
              '<button type="button" class="ah-cat-tab ' + (_uiState.categoryFilter === cat.key ? 'active' : '') + '" data-ah-cat="' + esc(cat.key) + '">' +
                '<i class="' + esc(cat.icon) + '"></i><span>' + esc(cat.name) + '</span>' +
              '</button>'
            );
          }).join('') +
        '</div>' +
      '</section>' +

      '<section class="ah-section-block" aria-label="勋章陈列">' +
        renderBadgesHTML(vm) +
      '</section>'
    );
  }

  function renderWallTabHTML(vm) {
    var prefs = vm.wallPrefs || { layout: 'grid', featuredIds: [], customOrder: [] };
    var layout = prefs.layout || 'grid';
    var items = vm.wallItems || [];

    var layoutControls =
      '<div class="ah-wall-toolbar">' +
        '<div class="ah-segmented ah-wall-layout-seg" role="tablist" aria-label="勋章墙布局">' +
          '<button type="button" class="ah-seg-btn ' + (layout === 'grid' ? 'active' : '') + '" data-wall-layout="grid">宫格</button>' +
          '<button type="button" class="ah-seg-btn ' + (layout === 'showcase' ? 'active' : '') + '" data-wall-layout="showcase">展示台</button>' +
          '<button type="button" class="ah-seg-btn ' + (layout === 'compact' ? 'active' : '') + '" data-wall-layout="compact">紧凑</button>' +
        '</div>' +
        '<button type="button" class="ah-title-btn" id="ah-wall-reset-order">默认排序</button>' +
      '</div>';

    var bodyHTML = '';
    if (items.length === 0) {
      bodyHTML =
        '<div class="ah-empty-grid">' +
          '当前视角暂无已解锁勋章可陈列在勋章墙上。<br>' +
          '完成真实日常积累或切换上方视角后即可点亮专属勋章墙。' +
        '</div>';
    } else {
      bodyHTML = '<div class="ah-wall-list is-' + esc(layout) + '">' +
        items.map(function(item, idx) {
          var metaLine = esc(item.sourceAppLabel) + ' · ' + esc(formatDateShort(item.occurredAt || item.unlockedAt) || '已达成') + ' · +' + item.points + ' 荣誉点';
          var featLabel = item.isFeaturedOnWall ? '取消精选' : '设精选';
          return (
            '<div class="ah-wall-card ' + (item.isFeaturedOnWall ? 'is-featured' : '') + '">' +
              '<button type="button" class="ah-wall-card-main" data-ah-id="' + esc(item.achievementId) + '">' +
                '<div class="ah-badge-emblem"><i class="' + esc(item.icon) + '"></i></div>' +
                '<div class="ah-wall-card-info">' +
                  '<div class="ah-wall-card-title">' +
                    (item.isFeaturedOnWall ? '<i class="fa-solid fa-bookmark ah-wall-feat-icon"></i> ' : '') +
                    esc(item.name) +
                  '</div>' +
                  '<div class="ah-wall-card-meta">' + metaLine + '</div>' +
                '</div>' +
              '</button>' +
              '<div class="ah-wall-card-controls">' +
                '<button type="button" class="ah-wall-ctrl-btn ' + (item.isFeaturedOnWall ? 'active' : '') + '" data-wall-feat="' + esc(item.achievementId) + '">' + featLabel + '</button>' +
                '<button type="button" class="ah-wall-ctrl-btn" data-wall-move="up" data-wall-id="' + esc(item.achievementId) + '" ' + (idx === 0 ? 'disabled' : '') + ' aria-label="上移"><i class="fa-solid fa-arrow-up"></i></button>' +
                '<button type="button" class="ah-wall-ctrl-btn" data-wall-move="down" data-wall-id="' + esc(item.achievementId) + '" ' + (idx === items.length - 1 ? 'disabled' : '') + ' aria-label="下移"><i class="fa-solid fa-arrow-down"></i></button>' +
                '<button type="button" class="ah-wall-ctrl-btn" data-wall-move="top" data-wall-id="' + esc(item.achievementId) + '" ' + (idx === 0 ? 'disabled' : '') + '>置顶</button>' +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>';
    }

    return (
      '<section class="ah-overview-card ah-compact-intro">' +
        '<div class="ah-section-head">' +
          '<div class="ah-section-title"><i class="fa-solid fa-award"></i> 我的勋章墙</div>' +
          '<div class="ah-section-sub">已陈列 ' + items.length + ' 枚已解锁成就</div>' +
        '</div>' +
        '<div class="ah-calibrate-hint">仅展示真实已解锁勋章，支持精选置顶与自由排序；严守角色视角隔离，无任何付费展示柜。</div>' +
        layoutControls +
      '</section>' +
      renderCharScopeBarHTML(vm) +
      '<section class="ah-section-block" aria-label="勋章墙陈列">' + bodyHTML + '</section>'
    );
  }

  function renderMementosTabHTML(vm) {
    var cards = vm.mementos || [];
    var bodyHTML = '';
    if (cards.length === 0) {
      bodyHTML =
        '<div class="ah-empty-grid">' +
          '当前视角下尚未保存任何成长纪念卡。<br>' +
          '可在已解锁成就详情中点击「生成成长纪念卡」，保存并导出专属纪念图。' +
          (vm.unlockedCount > 0
            ? '<div style="margin-top:12px;"><button type="button" class="ah-title-btn" id="ah-memento-go-unlocked">查看已解锁成就</button></div>'
            : '') +
        '</div>';
    } else {
      bodyHTML = '<div class="ah-memento-list">' +
        cards.map(function(card) {
          var themeClass = 'theme-' + esc(card.theme || 'paper');
          var dateStr = formatDateShort(card.occurredAt || card.unlockedAt) || '已解锁';
          var wishSourceTag = card.wishSource === 'offline_template'
            ? '心意寄语'
            : (card.wishSource === 'ai' ? 'AI 祝贺' : '');
          return (
            '<article class="ah-memento-card ' + themeClass + '">' +
              '<div class="ah-memento-head">' +
                '<span class="ah-memento-kicker">' + esc(card.sourceAppLabel) + ' · ' + esc(dateStr) + '</span>' +
                '<span class="ah-memento-kicker">+' + (card.points || 100) + ' 荣誉点</span>' +
              '</div>' +
              '<div class="ah-memento-body">' +
                '<div class="ah-memento-title">' + esc(card.achievementName) + '</div>' +
                '<div class="ah-memento-desc">' + esc(card.milestoneDesc) + '</div>' +
                (card.wishText ? (
                  '<div class="ah-memento-wish">' +
                    '<div class="ah-memento-wish-meta">' +
                      esc(card.charName || '伴侣寄语') +
                      (wishSourceTag ? (' · ' + wishSourceTag) : '') +
                    '</div>' +
                    '<div class="ah-memento-wish-text">' + esc(card.wishText) + '</div>' +
                  '</div>'
                ) : '') +
              '</div>' +
              '<div class="ah-memento-actions">' +
                '<button type="button" class="ah-wall-ctrl-btn" data-memento-open="' + esc(card.cardId) + '">预览 / 导出</button>' +
                '<button type="button" class="ah-wall-ctrl-btn ' + (card.favorite ? 'active' : '') + '" data-memento-fav="' + esc(card.cardId) + '">' + (card.favorite ? '已珍藏' : '珍藏') + '</button>' +
                '<button type="button" class="ah-wall-ctrl-btn" data-memento-del="' + esc(card.cardId) + '">删除</button>' +
              '</div>' +
            '</article>'
          );
        }).join('') +
      '</div>';
    }

    return (
      '<section class="ah-overview-card ah-compact-intro">' +
        '<div class="ah-section-head">' +
          '<div class="ah-section-title"><i class="fa-regular fa-id-card"></i> 成长纪念卡册</div>' +
          '<div class="ah-section-sub">共 ' + cards.length + ' 张真实纪念卡</div>' +
        '</div>' +
        '<div class="ah-calibrate-hint">所有纪念卡严格绑定真实已解锁成就，支持本地 PNG 导出与手动分享；删除纪念卡不会影响已获得的勋章与经验。</div>' +
      '</section>' +
      renderCharScopeBarHTML(vm) +
      '<section class="ah-section-block" aria-label="纪念卡列表">' + bodyHTML + '</section>'
    );
  }

  function renderSwitchRowHTML(idAttr, title, subtitle, checked) {
    return (
      '<label class="ah-setting-row" for="' + esc(idAttr) + '">' +
        '<div class="ah-setting-info">' +
          '<div class="ah-setting-title">' + esc(title) + '</div>' +
          (subtitle ? '<div class="ah-setting-sub">' + esc(subtitle) + '</div>' : '') +
        '</div>' +
        '<span class="ah-switch-wrap">' +
          '<input type="checkbox" class="ah-switch-input" id="' + esc(idAttr) + '" ' + (checked ? 'checked' : '') + ' />' +
          '<span class="ah-switch-track" aria-hidden="true"></span>' +
        '</span>' +
      '</label>'
    );
  }

  function renderSettingsTabHTML(vm) {
    var comp = global.AchievementHallCompanion;
    var s = vm.companionSettings;
    if (!comp || !s) {
      return '<div class="ah-empty-grid">祝贺设置模块加载中或暂不可用。</div>';
    }

    var globalSection =
      '<section class="ah-overview-card">' +
        '<div class="ah-section-head">' +
          '<div class="ah-section-title"><i class="fa-solid fa-sliders"></i> 陪伴与推送总控</div>' +
          '<div class="ah-section-sub">安全默认严格关闭</div>' +
        '</div>' +
        renderSwitchRowHTML('ah-set-toast', '成就解锁馆内提醒', '在成就馆内实时解锁新成就时展示轻量祝贺横幅', s.unlockToastEnabled !== false) +
        renderSwitchRowHTML('ah-set-memento-prompt', '重要成就纪念卡提示', '解锁重要里程碑后提示可前往生成专属成长纪念卡', s.majorMementoPromptEnabled !== false) +
        renderSwitchRowHTML('ah-set-char-blessing', '开启 Char 专属祝贺', '总开关关闭时任何角色都不会读取成就摘要或生成祝贺词', Boolean(s.allowCharBlessing)) +
        renderSwitchRowHTML('ah-set-wechat-proactive', '允许微信主动发送祝贺', '默认严格关闭；仅当同时开启总开关、单角色微信授权且成就设为主动渠道时发送', Boolean(s.allowWechatProactive)) +
        renderSwitchRowHTML('ah-set-offline-fallback', 'AI 失败时允许「心意寄语」模板', '关闭后 AI 失败将直接记录失败并支持馆内重试，绝不伪装成实时 AI', s.allowOfflineFallback !== false) +
        renderSwitchRowHTML('ah-set-study-focus', '自习室专注期间不打扰', '自习室计时运行期间拦截所有微信主动祝贺消息', s.respectStudyFocus !== false) +
        renderSwitchRowHTML('ah-set-quiet-enabled', '夜间免打扰保护', '夜间免打扰时段内暂停主动微信推送，保留馆内查看', s.quietHoursEnabled !== false) +
        '<div class="ah-time-range-row">' +
          '<span class="ah-setting-sub">免打扰时段</span>' +
          '<div class="ah-time-inputs">' +
            '<input type="time" class="ah-time-input" id="ah-set-quiet-start" value="' + esc(s.quietHoursStart || '23:00') + '" aria-label="免打扰开始时间" />' +
            '<span class="ah-setting-sub">至</span>' +
            '<input type="time" class="ah-time-input" id="ah-set-quiet-end" value="' + esc(s.quietHoursEnd || '08:00') + '" aria-label="免打扰结束时间" />' +
          '</div>' +
        '</div>' +
      '</section>';

    var charsHTML = '';
    if (!vm.characters || vm.characters.length === 0) {
      charsHTML = '<div class="ah-empty-banner">当前暂无微信角色档案，在微信创建或导入陪伴角色后可在此单独授权。</div>';
    } else {
      charsHTML = vm.characters.map(function(c) {
        var cid = String(c.id);
        var cname = c.nick || c.nickname || c.name || ('角色 ' + cid);
        var conf = comp.getCharConfig(cid, s);
        return (
          '<div class="ah-char-auth-card">' +
            '<div class="ah-char-auth-head">' +
              '<div class="ah-char-auth-name">' + esc(cname) + '</div>' +
              '<div class="ah-section-sub">每日最多 ' + conf.dailyLimit + ' 条 · 每周最多 ' + conf.weeklyLimit + ' 条</div>' +
            '</div>' +
            renderSwitchRowHTML('ah-char-enabled-' + cid, '允许该角色发送成就祝贺', '总开关与本开关均开启才生成祝贺', Boolean(conf.enabled)) +
            renderSwitchRowHTML('ah-char-read-' + cid, '允许读取我的成就摘要', '仅传递本次成就名称与达成日期，严禁跨角色串联', Boolean(conf.allowReadSummary)) +
            renderSwitchRowHTML('ah-char-wechat-' + cid, '允许通过微信主动祝贺', '关闭时仅限在成就馆内查看该角色祝贺', Boolean(conf.allowWechatPush)) +
            '<div class="ah-char-auth-selects">' +
              '<label class="ah-inline-field">' +
                '<span>口吻风格</span>' +
                '<select class="ah-select" data-char-style="' + esc(cid) + '">' +
                  '<option value="warm" ' + (conf.stylePreference === 'warm' ? 'selected' : '') + '>温暖贴心</option>' +
                  '<option value="gentle" ' + (conf.stylePreference === 'gentle' ? 'selected' : '') + '>温柔克制</option>' +
                  '<option value="restrained" ' + (conf.stylePreference === 'restrained' ? 'selected' : '') + '>沉静内敛</option>' +
                  '<option value="playful" ' + (conf.stylePreference === 'playful' ? 'selected' : '') + '>轻快灵动</option>' +
                '</select>' +
              '</label>' +
              '<label class="ah-inline-field">' +
                '<span>每日上限</span>' +
                '<select class="ah-select" data-char-daily="' + esc(cid) + '">' +
                  [1, 2, 3, 5].map(function(n) {
                    return '<option value="' + n + '" ' + (conf.dailyLimit === n ? 'selected' : '') + '>' + n + ' 条/天</option>';
                  }).join('') +
                '</select>' +
              '</label>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    }

    var channelListHTML = (vm.items || []).map(function(item) {
      var aid = item.achievementId;
      var isMajor = comp.isAchievementMajor(aid, s);
      var ch = comp.getAchievementChannel(aid, s);
      var majorText = item.isMajorMilestone
        ? '系统重要里程碑'
        : (isMajor ? '已设为个人重要成就' : '普通成就（默认仅馆内记录）');
      return (
        '<div class="ah-channel-row">' +
          '<div class="ah-channel-info">' +
            '<div class="ah-channel-name">' + esc(item.isMasked ? '隐藏成就（解锁前保护）' : item.name) + '</div>' +
            '<div class="ah-setting-sub">' + esc(majorText) + '</div>' +
          '</div>' +
          '<div class="ah-channel-controls">' +
            (!item.isMajorMilestone ? (
              '<button type="button" class="ah-wall-ctrl-btn ' + (isMajor ? 'active' : '') + '" data-ah-toggle-major="' + esc(aid) + '">' +
                (isMajor ? '取消重要' : '设为重要') +
              '</button>'
            ) : '') +
            (isMajor ? (
              '<select class="ah-select" data-ah-channel="' + esc(aid) + '" aria-label="祝贺渠道">' +
                '<option value="hall_only" ' + (ch === 'hall_only' ? 'selected' : '') + '>仅馆内记录</option>' +
                '<option value="in_hall_char" ' + (ch === 'in_hall_char' ? 'selected' : '') + '>馆内 Char 祝贺</option>' +
                '<option value="wechat_proactive" ' + (ch === 'wechat_proactive' ? 'selected' : '') + '>微信主动祝贺</option>' +
              '</select>'
            ) : '') +
          '</div>' +
        '</div>'
      );
    }).join('');

    var logs = (vm.congratLogs || []).slice(0, 20);
    var STATUS_LABELS = {
      delivered: '已发微信',
      in_hall: '馆内祝贺',
      skipped: '已跳过',
      aborted: '已中止',
      failed: '生成失败'
    };
    var logsHTML = logs.length === 0
      ? '<div class="ah-empty-banner">暂无祝贺发送或生成记录。</div>'
      : logs.map(function(lg) {
          var stLabel = STATUS_LABELS[lg.status] || lg.status;
          var srcTag = lg.isOfflineTemplate ? '心意寄语' : (lg.source === 'ai' ? 'AI 生成' : '');
          var reasonStr = lg.reason ? (' · ' + lg.reason) : '';
          var timeStr = lg.createdAt ? formatDateTime(lg.createdAt) : '';
          var showRetry = Boolean(lg.canRetry || lg.status === 'failed');
          return (
            '<div class="ah-log-row">' +
              '<div class="ah-log-main">' +
                '<div class="ah-log-title">' + esc(lg.achievementName || lg.achievementId) + ' · ' + esc(lg.charName || lg.charId) + '</div>' +
                '<div class="ah-setting-sub">' + esc(stLabel) + (srcTag ? (' · ' + srcTag) : '') + esc(reasonStr) + (timeStr ? (' · ' + timeStr) : '') + '</div>' +
                (lg.content ? '<div class="ah-log-preview">' + esc(lg.content) + '</div>' : '') +
              '</div>' +
              (showRetry ? (
                '<button type="button" class="ah-wall-ctrl-btn" data-ah-retry-aid="' + esc(lg.achievementId) + '" data-ah-retry-cid="' + esc(lg.charId) + '">重试</button>'
              ) : '') +
            '</div>'
          );
        }).join('');

    return (
      globalSection +
      '<section class="ah-section-block">' +
        '<div class="ah-section-head">' +
          '<div class="ah-section-title"><i class="fa-solid fa-user-shield"></i> 多 Char 独立授权</div>' +
          '<div class="ah-section-sub">严格按角色隔离</div>' +
        '</div>' +
        charsHTML +
      '</section>' +
      '<section class="ah-overview-card">' +
        '<div class="ah-section-head">' +
          '<div class="ah-section-title"><i class="fa-regular fa-bell"></i> 重要程度与推送渠道</div>' +
          '<div class="ah-section-sub">普通成就默认防打扰</div>' +
        '</div>' +
        '<div class="ah-calibrate-hint">可自选将普通成就标记为「重要」后再开放祝贺渠道，不影响荣誉点数与解锁规则。</div>' +
        '<div class="ah-channel-list">' + channelListHTML + '</div>' +
      '</section>' +
      '<section class="ah-overview-card">' +
        '<div class="ah-section-head">' +
          '<div class="ah-section-title"><i class="fa-solid fa-clock-rotate-left"></i> 最近祝贺记录</div>' +
          '<div class="ah-section-sub">' + logs.length + ' 条</div>' +
        '</div>' +
        '<div class="ah-log-list">' + logsHTML + '</div>' +
      '</section>'
    );
  }

  function renderPageHTML(vm) {
    var errorBannerHTML = vm.lastSyncError
      ? '<div class="ah-sync-banner" role="alert">' +
          '<div class="ah-sync-banner-text">最近一次成就记录保存异常，本地原软件数据不受影响。可重试重新核验。</div>' +
          '<button type="button" class="ah-sync-retry-btn" id="ah-btn-retry-sync">重新校准</button>' +
        '</div>'
      : '';

    var tabContentHTML = '';
    if (_uiState.activeTab === 'wall') {
      tabContentHTML = renderWallTabHTML(vm);
    } else if (_uiState.activeTab === 'mementos') {
      tabContentHTML = renderMementosTabHTML(vm);
    } else if (_uiState.activeTab === 'settings') {
      tabContentHTML = renderSettingsTabHTML(vm);
    } else {
      tabContentHTML = renderGalleryTabHTML(vm);
    }

    return (
      '<div class="ah-shell">' +
        '<header class="ah-header">' +
          '<div class="ah-header-left">' +
            '<button type="button" class="ah-back-btn" id="ah-btn-back" aria-label="返回桌面">' +
              '<i class="fa fa-angle-left"></i><span>返回</span>' +
            '</button>' +
            '<div class="ah-title">成就馆</div>' +
          '</div>' +
          '<div class="ah-header-right">' +
            '<div class="ah-score-chip" title="成就馆累计荣誉点">' +
              '<i class="fa-solid fa-star"></i><span>' + vm.totalScore + '</span>' +
            '</div>' +
          '</div>' +
        '</header>' +

        '<nav class="ah-subnav" role="tablist" aria-label="成就馆功能分区">' +
          '<button type="button" role="tab" aria-selected="' + (_uiState.activeTab === 'gallery') + '" class="ah-subnav-btn ' + (_uiState.activeTab === 'gallery' ? 'active' : '') + '" data-ah-tab="gallery">陈列</button>' +
          '<button type="button" role="tab" aria-selected="' + (_uiState.activeTab === 'wall') + '" class="ah-subnav-btn ' + (_uiState.activeTab === 'wall' ? 'active' : '') + '" data-ah-tab="wall">勋章墙</button>' +
          '<button type="button" role="tab" aria-selected="' + (_uiState.activeTab === 'mementos') + '" class="ah-subnav-btn ' + (_uiState.activeTab === 'mementos' ? 'active' : '') + '" data-ah-tab="mementos">纪念卡</button>' +
          '<button type="button" role="tab" aria-selected="' + (_uiState.activeTab === 'settings') + '" class="ah-subnav-btn ' + (_uiState.activeTab === 'settings' ? 'active' : '') + '" data-ah-tab="settings">祝贺设置</button>' +
        '</nav>' +

        '<div class="ah-scroll">' +
          errorBannerHTML +
          tabContentHTML +
        '</div>' +
      '</div>'
    );
  }

  async function openMementoPreviewSheet(card, vm, onRefresh) {
    var comp = global.AchievementHallCompanion;
    if (!comp || !card) return;
    closeModalByClass('ah-sheet-backdrop');

    var overlay = document.createElement('div');
    overlay.className = 'ah-sheet-backdrop';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    var aliveChars = (vm && vm.characters) ? vm.characters : await comp.listAvailablePartnerChars();
    var shareEligibleChars = aliveChars.filter(function(c) {
      if (card.charId && String(card.charId) !== String(c.id)) return false;
      return true;
    });

    function paintPreview() {
      var themeCls = 'theme-' + esc(card.theme || 'paper');
      var dateStr = formatDateShort(card.occurredAt || card.unlockedAt) || '已达成';
      var wishLabel = card.wishSource === 'offline_template' ? '心意寄语' : (card.wishSource === 'ai' ? 'AI 祝贺' : '');

      overlay.innerHTML =
        '<div class="ah-sheet-card">' +
          '<div class="ah-sheet-head">' +
            '<span style="font-size:14px;font-weight:700;">成长纪念卡</span>' +
            '<button type="button" class="ah-sheet-close" id="ah-memento-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +

          '<div class="ah-memento-preview ' + themeCls + '">' +
            '<div class="ah-memento-head">' +
              '<span class="ah-memento-kicker">弯弯成就馆</span>' +
              '<span class="ah-memento-kicker">' + esc(card.sourceAppLabel) + '</span>' +
            '</div>' +
            '<div class="ah-memento-preview-emblem"><i class="' + esc(card.achievementIcon || 'fa-solid fa-award') + '"></i></div>' +
            '<div class="ah-memento-preview-title">' + esc(card.achievementName) + '</div>' +
            '<div class="ah-memento-preview-sub">解锁于 ' + esc(dateStr) + ' · +' + (card.points || 100) + ' 荣誉点</div>' +
            '<div class="ah-memento-preview-desc">' + esc(card.milestoneDesc || card.conditionText) + '</div>' +
            (card.wishText ? (
              '<div class="ah-memento-wish">' +
                '<div class="ah-memento-wish-meta">' + esc(card.charName || '伴侣寄语') + (wishLabel ? (' · ' + wishLabel) : '') + '</div>' +
                '<div class="ah-memento-wish-text">' + esc(card.wishText) + '</div>' +
              '</div>'
            ) : '') +
          '</div>' +

          '<div class="ah-theme-picker">' +
            ['paper', 'ink', 'monochrome'].map(function(tk) {
              var tMeta = comp.MEMENTO_THEMES[tk];
              return '<button type="button" class="ah-wall-ctrl-btn ' + (card.theme === tk ? 'active' : '') + '" data-preview-theme="' + esc(tk) + '">' + esc(tMeta ? tMeta.name : tk) + '</button>';
            }).join('') +
          '</div>' +

          (shareEligibleChars.length > 0 ? (
            '<div class="ah-share-wechat-row">' +
              '<select class="ah-select" id="ah-memento-share-char" aria-label="选择分享角色">' +
                shareEligibleChars.map(function(c) {
                  var cname = c.nick || c.nickname || c.name || ('角色 ' + c.id);
                  return '<option value="' + esc(c.id) + '">' + esc(cname) + '</option>';
                }).join('') +
              '</select>' +
              '<button type="button" class="ah-btn-secondary" id="ah-memento-share-wechat" style="flex:0 0 auto;padding:0 14px;">发至微信</button>' +
            '</div>'
          ) : '') +

          '<div class="ah-sheet-actions">' +
            '<div class="ah-action-row">' +
              '<button type="button" class="ah-btn-secondary" id="ah-memento-copy"><i class="fa-regular fa-copy"></i><span>复制文案</span></button>' +
              '<button type="button" class="ah-btn-primary" id="ah-memento-export"><i class="fa-solid fa-download"></i><span>导出 PNG</span></button>' +
            '</div>' +
          '</div>' +
        '</div>';

      var closeBtn = overlay.querySelector('#ah-memento-close');
      if (closeBtn) closeBtn.onclick = function() { overlay.remove(); };

      overlay.querySelectorAll('[data-preview-theme]').forEach(function(btn) {
        btn.onclick = async function() {
          var nextTheme = btn.getAttribute('data-preview-theme');
          var updated = await comp.switchMementoTheme(card.cardId, nextTheme);
          if (updated) {
            card = updated;
            paintPreview();
            if (typeof onRefresh === 'function') await onRefresh();
          }
        };
      });

      var copyBtn = overlay.querySelector('#ah-memento-copy');
      if (copyBtn) {
        copyBtn.onclick = async function() {
          var txt = comp.buildCardShareText(card);
          var ok = await copyTextSafe(txt);
          if (global.toast) global.toast(ok ? '已复制成长纪念分享文案' : '请长按卡片文字手动复制');
        };
      }

      var expBtn = overlay.querySelector('#ah-memento-export');
      if (expBtn) {
        expBtn.onclick = function() {
          var res = comp.exportCardPng(card);
          if (global.toast) {
            global.toast(res && res.ok ? '已生成成长纪念卡 PNG 图片' : '当前环境不支持 PNG 下载');
          }
        };
      }

      var shareWechatBtn = overlay.querySelector('#ah-memento-share-wechat');
      if (shareWechatBtn) {
        shareWechatBtn.onclick = async function() {
          var sel = overlay.querySelector('#ah-memento-share-char');
          var targetCid = sel ? sel.value : '';
          if (!targetCid) return;
          shareWechatBtn.disabled = true;
          try {
            var res = await comp.shareCardToAuthorizedWechat(card.cardId, targetCid);
            if (global.toast) {
              global.toast(res && res.ok ? '已将纪念卡发送至对应角色微信聊天' : '发送受限，请确认角色状态');
            }
          } finally {
            shareWechatBtn.disabled = false;
          }
        };
      }
    }

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
    paintPreview();
  }

  async function openDetailSheet(pageEl, item, onRefresh) {
    closeModalByClass('ah-sheet-backdrop');
    if (!item) return;

    var comp = global.AchievementHallCompanion;
    var blessings = [];
    var companionSettings = _uiState.viewModel && _uiState.viewModel.companionSettings;
    if (comp) {
      try {
        if (!companionSettings && typeof comp.getSettings === 'function') {
          companionSettings = await comp.getSettings();
        }
        if (item.unlocked && typeof comp.getInHallBlessingsForAchievement === 'function') {
          blessings = await comp.getInHallBlessingsForAchievement(item.achievementId, _uiState.charScope);
        }
      } catch (_) {}
    }

    var overlay = document.createElement('div');
    overlay.className = 'ah-sheet-backdrop';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    var canEquip = Boolean(item.unlocked && item.titleReward);
    var occurredStr = item.occurredAt ? formatDateTime(item.occurredAt) : '';
    var unlockedStr = item.unlockedAt ? formatDateTime(item.unlockedAt) : '';
    var isMajor = comp && companionSettings ? comp.isAchievementMajor(item.achievementId, companionSettings) : item.isMajorMilestone;

    var aliveChars = (_uiState.viewModel && _uiState.viewModel.characters) || [];
    var authorizedChars = [];
    if (comp && companionSettings && companionSettings.allowCharBlessing) {
      authorizedChars = aliveChars.filter(function(c) {
        if (item.charScoped && item.charId && String(c.id) !== String(item.charId)) return false;
        if (_uiState.charScope !== 'all' && _uiState.charScope !== 'personal' && String(c.id) !== String(_uiState.charScope)) return false;
        var conf = comp.getCharConfig(c.id, companionSettings);
        return conf.enabled && conf.allowReadSummary;
      });
    }

    var blessingsHTML = '';
    if (item.unlocked && comp) {
      var blessingItemsHTML = blessings.length > 0
        ? blessings.map(function(b) {
            var srcLabel = b.isOfflineTemplate ? '心意寄语 · 离线模板' : 'AI 个性化生成';
            return (
              '<div class="ah-detail-blessing-item">' +
                '<div class="ah-detail-blessing-head">' +
                  '<span>' + esc(b.charName) + '</span>' +
                  '<span class="ah-setting-sub">' + esc(srcLabel) + '</span>' +
                '</div>' +
                '<div class="ah-detail-blessing-text">' + esc(b.text) + '</div>' +
              '</div>'
            );
          }).join('')
        : '<div class="ah-setting-sub">尚未生成该成就的馆内 Char 祝贺。</div>';

      var reqAreaHTML = authorizedChars.length > 0
        ? (
          '<div class="ah-detail-blessing-req">' +
            (authorizedChars.length > 1 ? (
              '<select class="ah-select" id="ah-detail-bless-char" aria-label="选择祝贺角色">' +
                authorizedChars.map(function(c) {
                  var cname = c.nick || c.nickname || c.name || ('角色 ' + c.id);
                  return '<option value="' + esc(c.id) + '">' + esc(cname) + '</option>';
                }).join('') +
              '</select>'
            ) : '<input type="hidden" id="ah-detail-bless-char" value="' + esc(authorizedChars[0].id) + '" />') +
            '<button type="button" class="ah-btn-secondary" id="ah-detail-bless-btn" style="flex:1;min-height:44px;">' +
              '<i class="fa-regular fa-comment-dots"></i><span>' + (blessings.length > 0 ? '重新生成祝贺' : '邀请 Char 写祝贺') + '</span>' +
            '</button>' +
          '</div>'
        )
        : (
          '<div class="ah-detail-blessing-req">' +
            '<span class="ah-setting-sub" style="flex:1;">需先在「祝贺设置」开启总开关与角色授权后方可生成祝贺。</span>' +
            '<button type="button" class="ah-wall-ctrl-btn" id="ah-detail-go-settings">前往设置</button>' +
          '</div>'
        );

      blessingsHTML =
        '<div class="ah-detail-panel">' +
          '<div class="ah-detail-row">' +
            '<span class="ah-detail-row-label">陪伴祝贺</span>' +
            '<span class="ah-detail-row-val">' + (isMajor ? '重要里程碑' : '普通成就') + '</span>' +
          '</div>' +
          blessingItemsHTML +
          reqAreaHTML +
        '</div>';
    }

    overlay.innerHTML =
      '<div class="ah-sheet-card">' +
        '<div class="ah-sheet-head">' +
          '<span style="font-size:12px;font-weight:600;color:var(--c-sub);">' + esc(item.categoryName) + ' · ' + esc(item.sourceAppLabel) + '</span>' +
          '<button type="button" class="ah-sheet-close" id="ah-detail-close" aria-label="关闭详情"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +

        '<div class="ah-detail-hero">' +
          '<div class="ah-detail-emblem ' + (item.unlocked ? 'is-unlocked' : '') + '"><i class="' + esc(item.icon) + '"></i></div>' +
          '<div class="ah-detail-name">' + esc(item.name) + '</div>' +
          '<div class="ah-detail-status">' +
            (item.unlocked
              ? ('已于 ' + esc(unlockedStr || '既往记录') + ' 收录解锁')
              : (item.isMasked ? '隐藏成就 · 未解锁前条件已保护' : '尚未解锁 · ' + esc(item.progress.remainingText || '继续积累即可点亮'))) +
          '</div>' +
        '</div>' +

        '<div class="ah-detail-panel">' +
          '<div>' + esc(item.description) + '</div>' +
          '<div class="ah-detail-row">' +
            '<span class="ah-detail-row-label">解锁条件</span>' +
            '<span class="ah-detail-row-val">' + esc(item.conditionText) + '</span>' +
          '</div>' +
          '<div class="ah-detail-row">' +
            '<span class="ah-detail-row-label">当前进度</span>' +
            '<span class="ah-detail-row-val">' + esc(item.progress.text) + ' (' + item.progress.percent + '%)</span>' +
          '</div>' +
          '<div class="ah-progress-track">' +
            '<div class="ah-progress-fill" style="width:' + item.progress.percent + '%"></div>' +
          '</div>' +
          (item.unlocked && occurredStr ? (
            '<div class="ah-detail-row">' +
              '<span class="ah-detail-row-label">达成发生时间</span>' +
              '<span class="ah-detail-row-val">' + esc(occurredStr) + '</span>' +
            '</div>'
          ) : '') +
          (item.unlocked ? (
            '<div class="ah-detail-row">' +
              '<span class="ah-detail-row-label">触发来源</span>' +
              '<span class="ah-detail-row-val">' + (item.backfilled ? '历史校准补算' : '实时事件联动') + '</span>' +
            '</div>'
          ) : '') +
          '<div class="ah-detail-row">' +
            '<span class="ah-detail-row-label">来源模块</span>' +
            '<span class="ah-detail-row-val">' + esc(item.sourceAppLabel) + '</span>' +
          '</div>' +
          '<div class="ah-detail-row">' +
            '<span class="ah-detail-row-label">纪念荣誉</span>' +
            '<span class="ah-detail-row-val">+' + item.points + ' 点</span>' +
          '</div>' +
          (item.titleReward ? (
            '<div class="ah-detail-row">' +
              '<span class="ah-detail-row-label">关联头衔</span>' +
              '<span class="ah-detail-row-val">' + esc(item.titleReward) + '</span>' +
            '</div>'
          ) : '') +
        '</div>' +

        blessingsHTML +

        '<div class="ah-sheet-actions">' +
          '<div class="ah-action-row">' +
            '<button type="button" class="ah-btn-secondary" id="ah-detail-fav">' +
              '<i class="fa-solid fa-star"></i><span>' + (item.favorite ? '取消收藏' : '收藏置顶') + '</span>' +
            '</button>' +
            (canEquip ? (
              '<button type="button" class="ah-btn-secondary" id="ah-detail-equip">' +
                '<i class="fa-solid fa-crown"></i><span>佩戴头衔</span>' +
              '</button>'
            ) : '') +
          '</div>' +
          (item.unlocked && comp ? (
            '<button type="button" class="ah-btn-secondary" id="ah-detail-create-memento">' +
              '<i class="fa-regular fa-id-card"></i><span>生成成长纪念卡</span>' +
            '</button>'
          ) : '') +
          '<button type="button" class="ah-btn-primary" id="ah-detail-jump">' +
            '<i class="fa-solid fa-arrow-up-right-from-square"></i><span>前往' + esc(item.sourceAppLabel) + '</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
    var closeBtn = overlay.querySelector('#ah-detail-close');
    if (closeBtn) closeBtn.onclick = function() { overlay.remove(); };

    var favBtn = overlay.querySelector('#ah-detail-fav');
    if (favBtn) {
      favBtn.onclick = async function() {
        var res = await AchievementHallStore.toggleFavorite(item.achievementId);
        if (res === null) return;
        item.favorite = res;
        favBtn.innerHTML = '<i class="fa-solid fa-star"></i><span>' + (res ? '取消收藏' : '收藏置顶') + '</span>';
        if (global.toast) global.toast(res ? '已置顶收藏该成就' : '已取消置顶收藏');
        if (typeof onRefresh === 'function') await onRefresh();
      };
    }

    var equipBtn = overlay.querySelector('#ah-detail-equip');
    if (equipBtn && canEquip) {
      equipBtn.onclick = async function() {
        await AchievementHallStore.equipTitle(item.titleReward);
        if (global.toast) global.toast('已佩戴头衔：' + item.titleReward);
        overlay.remove();
        if (typeof onRefresh === 'function') await onRefresh();
      };
    }

    var goSettingsBtn = overlay.querySelector('#ah-detail-go-settings');
    if (goSettingsBtn) {
      goSettingsBtn.onclick = function() {
        overlay.remove();
        _uiState.activeTab = 'settings';
        refreshPage(pageEl);
      };
    }

    var blessBtn = overlay.querySelector('#ah-detail-bless-btn');
    if (blessBtn && comp) {
      blessBtn.onclick = async function() {
        var sel = overlay.querySelector('#ah-detail-bless-char');
        var targetCid = sel ? sel.value : '';
        if (!targetCid) return;
        blessBtn.disabled = true;
        try {
          var res = await comp.requestOrRetryInHallBlessing(item.achievementId, targetCid);
          if (res && res.ok) {
            if (global.toast) {
              global.toast(res.blessing && res.blessing.isOfflineTemplate
                ? '已附带「心意寄语」离线祝福'
                : '已生成专属陪伴祝贺');
            }
            if (typeof onRefresh === 'function') await onRefresh();
            openDetailSheet(pageEl, item, onRefresh);
          } else {
            if (global.toast) {
              global.toast('AI 暂未响应，可在开启兜底或稍后点击重试');
            }
            if (typeof onRefresh === 'function') await onRefresh();
          }
        } finally {
          blessBtn.disabled = false;
        }
      };
    }

    var createMemBtn = overlay.querySelector('#ah-detail-create-memento');
    if (createMemBtn && comp) {
      createMemBtn.onclick = async function() {
        var latestBlessing = blessings && blessings[0] ? blessings[0] : null;
        var cardCharId = item.charScoped
          ? (item.charId || (_uiState.charScope !== 'all' && _uiState.charScope !== 'personal' ? _uiState.charScope : null))
          : (latestBlessing ? latestBlessing.charId : (_uiState.charScope !== 'all' && _uiState.charScope !== 'personal' ? _uiState.charScope : null));
        var res = await comp.createMementoCard({
          achievementId: item.achievementId,
          charId: cardCharId,
          wishText: latestBlessing ? latestBlessing.text : '',
          wishSource: latestBlessing ? latestBlessing.source : 'none',
          theme: 'paper'
        });
        if (!res || !res.ok) {
          if (global.toast) global.toast('纪念卡生成受限：请确认该成就在当前视角已真实解锁');
          return;
        }
        if (typeof onRefresh === 'function') await onRefresh();
        await openMementoPreviewSheet(res.card, _uiState.viewModel, onRefresh);
      };
    }

    var jumpBtn = overlay.querySelector('#ah-detail-jump');
    if (jumpBtn) {
      jumpBtn.onclick = async function() {
        overlay.remove();
        await navigateToSourceApp(item);
      };
    }
  }

  function openTitlePickerSheet(vm, onRefresh) {
    closeModalByClass('ah-sheet-backdrop');
    var overlay = document.createElement('div');
    overlay.className = 'ah-sheet-backdrop';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML =
      '<div class="ah-sheet-card">' +
        '<div class="ah-sheet-head">' +
          '<span style="font-size:15px;font-weight:700;">选择佩戴头衔</span>' +
          '<button type="button" class="ah-sheet-close" id="ah-title-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--c-sub);">随已解锁成就自动收录更多纪念头衔。</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
          vm.availableTitles.map(function(title) {
            var active = title === vm.equippedTitle;
            return (
              '<button type="button" class="ah-title-option ' + (active ? 'active' : '') + '" data-ah-title="' + esc(title) + '">' +
                '<span>' + esc(title) + '</span>' +
                (active ? '<i class="fa-solid fa-check"></i>' : '') +
              '</button>'
            );
          }).join('') +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
    var closeBtn = overlay.querySelector('#ah-title-close');
    if (closeBtn) closeBtn.onclick = function() { overlay.remove(); };

    overlay.querySelectorAll('[data-ah-title]').forEach(function(btn) {
      btn.onclick = async function() {
        var chosen = btn.getAttribute('data-ah-title');
        await AchievementHallStore.equipTitle(chosen);
        if (global.toast) global.toast('已切换头衔：' + chosen);
        overlay.remove();
        if (typeof onRefresh === 'function') await onRefresh();
      };
    });
  }

  async function handleCalibrateClick(pageEl) {
    if (_uiState.isCalibrating) return;
    _uiState.isCalibrating = true;
    renderIntoPage(pageEl, _uiState.viewModel);
    try {
      var res = await backfillFromHistory({ batchSize: 10 });
      await refreshPage(pageEl);
      if (global.toast) {
        if (!res.ok) {
          global.toast('成就校准存储异常，稍后可重试');
        } else if (res.newlyUnlockedCount > 0) {
          global.toast('校准完成！新补算解锁 ' + res.newlyUnlockedCount + ' 枚成就');
        } else {
          global.toast('已完成真实记录核验，当前成就均已同步');
        }
      }
    } finally {
      _uiState.isCalibrating = false;
      if (document.getElementById('achievement-page')) {
        await refreshPage(document.getElementById('achievement-page'));
      }
    }
  }

  function bindSettingsEvents(pageEl) {
    var comp = global.AchievementHallCompanion;
    if (!comp || !_uiState.viewModel || !_uiState.viewModel.companionSettings) return;

    async function patchGlobalSetting(patch) {
      var cur = await comp.getSettings();
      await comp.saveSettings(Object.assign({}, cur, patch));
      await refreshPage(pageEl);
    }

    var mapSwitch = [
      ['#ah-set-toast', 'unlockToastEnabled'],
      ['#ah-set-memento-prompt', 'majorMementoPromptEnabled'],
      ['#ah-set-char-blessing', 'allowCharBlessing'],
      ['#ah-set-wechat-proactive', 'allowWechatProactive'],
      ['#ah-set-offline-fallback', 'allowOfflineFallback'],
      ['#ah-set-study-focus', 'respectStudyFocus'],
      ['#ah-set-quiet-enabled', 'quietHoursEnabled']
    ];
    mapSwitch.forEach(function(pair) {
      var el = pageEl.querySelector(pair[0]);
      if (el) {
        el.onchange = function() {
          var patch = {};
          patch[pair[1]] = Boolean(el.checked);
          patchGlobalSetting(patch);
        };
      }
    });

    var qs = pageEl.querySelector('#ah-set-quiet-start');
    if (qs) qs.onchange = function() { patchGlobalSetting({ quietHoursStart: qs.value || '23:00' }); };
    var qe = pageEl.querySelector('#ah-set-quiet-end');
    if (qe) qe.onchange = function() { patchGlobalSetting({ quietHoursEnd: qe.value || '08:00' }); };

    (_uiState.viewModel.characters || []).forEach(function(c) {
      var cid = String(c.id);
      var enEl = pageEl.querySelector('#ah-char-enabled-' + cid);
      if (enEl) enEl.onchange = async function() { await comp.updateCharConfig(cid, { enabled: Boolean(enEl.checked) }); await refreshPage(pageEl); };
      var rdEl = pageEl.querySelector('#ah-char-read-' + cid);
      if (rdEl) rdEl.onchange = async function() { await comp.updateCharConfig(cid, { allowReadSummary: Boolean(rdEl.checked) }); await refreshPage(pageEl); };
      var wcEl = pageEl.querySelector('#ah-char-wechat-' + cid);
      if (wcEl) wcEl.onchange = async function() { await comp.updateCharConfig(cid, { allowWechatPush: Boolean(wcEl.checked) }); await refreshPage(pageEl); };
    });

    pageEl.querySelectorAll('[data-char-style]').forEach(function(sel) {
      sel.onchange = async function() {
        await comp.updateCharConfig(sel.getAttribute('data-char-style'), { stylePreference: sel.value });
        await refreshPage(pageEl);
      };
    });
    pageEl.querySelectorAll('[data-char-daily]').forEach(function(sel) {
      sel.onchange = async function() {
        await comp.updateCharConfig(sel.getAttribute('data-char-daily'), { dailyLimit: Number(sel.value) || 2 });
        await refreshPage(pageEl);
      };
    });

    pageEl.querySelectorAll('[data-ah-toggle-major]').forEach(function(btn) {
      btn.onclick = async function() {
        var aid = btn.getAttribute('data-ah-toggle-major');
        var curSettings = await comp.getSettings();
        var nextMajor = !comp.isAchievementMajor(aid, curSettings);
        await comp.setCustomMajorAchievement(aid, nextMajor);
        await refreshPage(pageEl);
      };
    });

    pageEl.querySelectorAll('[data-ah-channel]').forEach(function(sel) {
      sel.onchange = async function() {
        var aid = sel.getAttribute('data-ah-channel');
        await comp.setAchievementChannel(aid, sel.value);
        await refreshPage(pageEl);
      };
    });

    pageEl.querySelectorAll('[data-ah-retry-aid]').forEach(function(btn) {
      btn.onclick = async function() {
        var aid = btn.getAttribute('data-ah-retry-aid');
        var cid = btn.getAttribute('data-ah-retry-cid');
        btn.disabled = true;
        try {
          var res = await comp.requestOrRetryInHallBlessing(aid, cid);
          if (global.toast) {
            global.toast(res && res.ok ? '祝贺已重新生成并保存在馆内' : '重试失败，请检查 AI 或授权状态');
          }
          await refreshPage(pageEl);
        } finally {
          btn.disabled = false;
        }
      };
    });
  }

  function bindPageEvents(pageEl) {
    var comp = global.AchievementHallCompanion;

    var backBtn = pageEl.querySelector('#ah-btn-back');
    if (backBtn) {
      backBtn.onclick = function() {
        closeModalByClass('ah-sheet-backdrop');
        closeModalByClass('ah-live-toast');
        if (global.closePage) global.closePage('achievement-page');
        else pageEl.remove();
      };
    }

    pageEl.querySelectorAll('[data-ah-tab]').forEach(function(btn) {
      btn.onclick = function() {
        var nextTab = btn.getAttribute('data-ah-tab') || 'gallery';
        if (nextTab === _uiState.activeTab) return;
        _uiState.activeTab = nextTab;
        refreshPage(pageEl);
      };
    });

    var titlePickerBtn = pageEl.querySelector('#ah-btn-title-picker');
    if (titlePickerBtn) {
      titlePickerBtn.onclick = function() {
        if (!_uiState.viewModel) return;
        openTitlePickerSheet(_uiState.viewModel, function() { return refreshPage(pageEl); });
      };
    }

    var calibrateBtn = pageEl.querySelector('#ah-btn-calibrate');
    if (calibrateBtn) calibrateBtn.onclick = function() { handleCalibrateClick(pageEl); };
    var retrySyncBtn = pageEl.querySelector('#ah-btn-retry-sync');
    if (retrySyncBtn) retrySyncBtn.onclick = function() { handleCalibrateClick(pageEl); };

    pageEl.querySelectorAll('[data-ah-char]').forEach(function(btn) {
      btn.onclick = function() {
        var nextScope = btn.getAttribute('data-ah-char') || 'all';
        if (nextScope === _uiState.charScope) return;
        _uiState.charScope = nextScope;
        refreshPage(pageEl);
      };
    });

    pageEl.querySelectorAll('[data-ah-status]').forEach(function(btn) {
      btn.onclick = function() {
        _uiState.statusFilter = btn.getAttribute('data-ah-status') || 'all';
        renderIntoPage(pageEl, _uiState.viewModel);
      };
    });

    var favFilterBtn = pageEl.querySelector('#ah-btn-fav-filter');
    if (favFilterBtn) {
      favFilterBtn.onclick = function() {
        _uiState.onlyFavorites = !_uiState.onlyFavorites;
        renderIntoPage(pageEl, _uiState.viewModel);
      };
    }

    pageEl.querySelectorAll('[data-ah-cat]').forEach(function(btn) {
      btn.onclick = function() {
        _uiState.categoryFilter = btn.getAttribute('data-ah-cat') || 'all';
        renderIntoPage(pageEl, _uiState.viewModel);
      };
    });

    pageEl.querySelectorAll('[data-ah-id]').forEach(function(card) {
      card.onclick = function() {
        var aid = card.getAttribute('data-ah-id');
        if (!_uiState.viewModel) return;
        var item = _uiState.viewModel.items.find(function(it) { return it.achievementId === aid; });
        if (item) {
          openDetailSheet(pageEl, item, function() { return refreshPage(pageEl); });
        }
      };
    });

    // 勋章墙交互事件
    if (comp) {
      pageEl.querySelectorAll('[data-wall-layout]').forEach(function(btn) {
        btn.onclick = async function() {
          await comp.setWallLayout(btn.getAttribute('data-wall-layout'));
          await refreshPage(pageEl);
        };
      });
      var resetOrderBtn = pageEl.querySelector('#ah-wall-reset-order');
      if (resetOrderBtn) {
        resetOrderBtn.onclick = async function() {
          await comp.resetWallOrder();
          await refreshPage(pageEl);
          if (global.toast) global.toast('已恢复勋章墙默认排序');
        };
      }
      pageEl.querySelectorAll('[data-wall-feat]').forEach(function(btn) {
        btn.onclick = async function() {
          await comp.toggleFeaturedOnWall(btn.getAttribute('data-wall-feat'));
          await refreshPage(pageEl);
        };
      });
      pageEl.querySelectorAll('[data-wall-move]').forEach(function(btn) {
        btn.onclick = async function() {
          var dir = btn.getAttribute('data-wall-move');
          var aid = btn.getAttribute('data-wall-id');
          var curOrder = (_uiState.viewModel && _uiState.viewModel.wallItems || []).map(function(it) { return it.achievementId; });
          await comp.moveWallBadgeOrder(aid, dir, curOrder);
          await refreshPage(pageEl);
        };
      });

      // 纪念卡列表交互事件
      var goUnlockedBtn = pageEl.querySelector('#ah-memento-go-unlocked');
      if (goUnlockedBtn) {
        goUnlockedBtn.onclick = function() {
          _uiState.activeTab = 'gallery';
          _uiState.statusFilter = 'unlocked';
          renderIntoPage(pageEl, _uiState.viewModel);
        };
      }
      pageEl.querySelectorAll('[data-memento-open]').forEach(function(btn) {
        btn.onclick = function() {
          var cid = btn.getAttribute('data-memento-open');
          var card = (_uiState.viewModel && _uiState.viewModel.mementos || []).find(function(c) { return c.cardId === cid; });
          if (card) openMementoPreviewSheet(card, _uiState.viewModel, function() { return refreshPage(pageEl); });
        };
      });
      pageEl.querySelectorAll('[data-memento-fav]').forEach(function(btn) {
        btn.onclick = async function() {
          await comp.toggleFavoriteMemento(btn.getAttribute('data-memento-fav'));
          await refreshPage(pageEl);
        };
      });
      pageEl.querySelectorAll('[data-memento-del]').forEach(function(btn) {
        btn.onclick = async function() {
          await comp.deleteMementoCard(btn.getAttribute('data-memento-del'));
          if (global.toast) global.toast('已删除该纪念卡（不影响已解锁勋章与经验）');
          await refreshPage(pageEl);
        };
      });

      if (_uiState.activeTab === 'settings') {
        bindSettingsEvents(pageEl);
      }
    }
  }

  function renderIntoPage(pageEl, vm) {
    if (!pageEl || !vm) return;
    var scrollEl = pageEl.querySelector ? pageEl.querySelector('.ah-scroll') : null;
    var savedScroll = scrollEl ? scrollEl.scrollTop : 0;
    _uiState.viewModel = vm;
    pageEl.innerHTML = renderPageHTML(vm);
    bindPageEvents(pageEl);
    var nextScrollEl = pageEl.querySelector ? pageEl.querySelector('.ah-scroll') : null;
    if (nextScrollEl && savedScroll > 0) {
      nextScrollEl.scrollTop = savedScroll;
    }
  }

  async function refreshPage(pageEl) {
    var vm = await buildHallViewModel({ charScope: _uiState.charScope });
    renderIntoPage(pageEl, vm);
    return vm;
  }

  async function openAchievementHallPage(options) {
    if (_uiState.isOpening) return;
    _uiState.isOpening = true;
    try {
      options = options || {};
      if (options.tab) _uiState.activeTab = options.tab;
      if (options.category) _uiState.categoryFilter = options.category;
      if (options.status) _uiState.statusFilter = options.status;
      if (options.charScope) _uiState.charScope = options.charScope;

      initAutoSync();

      closeModalByClass('ah-sheet-backdrop');
      var existing = document.getElementById('achievement-page');
      if (existing) existing.remove();

      var page = document.createElement('div');
      page.id = 'achievement-page';
      page.className = 'full-page';

      var vm = await buildHallViewModel({ charScope: _uiState.charScope });
      renderIntoPage(page, vm);

      if (typeof global.openPage === 'function') {
        global.openPage(page);
      } else {
        var appEl = document.getElementById('app') || document.body;
        appEl.appendChild(page);
      }
      return page;
    } finally {
      _uiState.isOpening = false;
    }
  }

  // ====================================================
  // 十一、全局导出与初始化自检
  // ====================================================
  var AchievementHallAPI = {
    VERSION: '1.0.0-phase3',
    SCHEMA_VERSION: SCHEMA_VERSION,
    RULE_VERSION: RULE_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    CATEGORIES: ACHIEVEMENT_CATEGORIES,
    DEFINITIONS: ACHIEVEMENT_DEFINITIONS,
    getCategories: function() { return ACHIEVEMENT_CATEGORIES.slice(); },
    getDefinitions: function() { return ACHIEVEMENT_DEFINITIONS.slice(); },
    getDefinition: function(achievementId) {
      return DEFINITION_BY_ID[String(achievementId || '')] || null;
    },
    getCategoryMeta: getCategoryMeta,
    loadState: function() { return AchievementHallStore.loadState(); },
    saveState: function(state, opts) { return AchievementHallStore.saveState(state, opts); },
    unlockAchievement: function(id, opts) { return AchievementHallStore.unlockAchievement(id, opts); },
    toggleFavorite: function(id) { return AchievementHallStore.toggleFavorite(id); },
    equipTitle: function(title) { return AchievementHallStore.equipTitle(title); },
    revokeErroneousAchievement: function(id, reason, opts) {
      return AchievementHallStore.revokeErroneousAchievement(id, reason, opts);
    },
    reconcileSourceRevocation: function(opts) {
      return AchievementHallStore.reconcileSourceRevocation(opts);
    },
    onCharacterDeleted: function(charId) {
      return AchievementHallStore.handleCharacterDeleted(charId);
    },
    readSourceSnapshot: readSourceSnapshot,
    getHallViewModel: buildHallViewModel,
    getAchievementDetail: getAchievementDetailById,
    presentAchievementItem: presentAchievementItem,
    navigateToSourceApp: navigateToSourceApp,
    normalizeSourceEvent: normalizeSourceEvent,
    ingestEvent: ingestSourceEvent,
    scheduleEvent: scheduleSourceEvent,
    backfillFromHistory: backfillFromHistory,
    initAutoSync: initAutoSync,
    disposeAutoSync: disposeAutoSync,
    getSyncState: function() {
      return {
        listenersInitialized: _listenersInitialized,
        visibilityBound: _visibilityBound,
        crossTabBound: _crossTabBound,
        lastSyncError: _lastSyncError
      };
    },
    open: openAchievementHallPage
  };

  global.AchievementHall = AchievementHallAPI;
  global.AchievementHallApp = AchievementHallAPI;
  global.showAchievementPage = openAchievementHallPage;
  global.showAchievementApp = openAchievementHallPage;

  // 模块加载时单例初始化跨 App 自动同步监听
  initAutoSync();

})(typeof window !== 'undefined' ? window : globalThis);
