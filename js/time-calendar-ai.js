// js/time-calendar-ai.js — 时光日历 2.0 阶段 2
// AI 智能日程管家 × 自然语言创建 × 确定性冲突检测 × 动态排期建议
// 核心原则：
// 1. AI 仅生成建议，必须用户确认才写入数据库；
// 2. 本地确定性算法为主检测冲突，不黑盒依赖 AI；
// 3. 复用已有 window.callAI，无 Key 时无缝降级高精度本地规则解析引擎；
// 4. 单一权威数据源，跨 App 数据严格隔离；
// 5. 极简黑白灰美学，大圆角卡片，小屏/Android 友好，防重幂等写入。

(function(global) {
  'use strict';

  // ===== 1. 常量与偏好存储键 =====
  var STORAGE_KEYS = {
    EVENTS: 'time_calendar_events',
    AI_PREFERENCES: 'time_calendar_ai_preferences_v2',
    DRAFT_SNAPSHOTS: 'time_calendar_ai_draft_snapshots'
  };

  // 默认日常休息与时间偏好 (用户可在设置中调整)
  var DEFAULT_PREFERENCES = {
    dayStartHour: 8,       // 08:00 开始日程
    dayEndHour: 22,        // 22:00 结束日程
    lunchBreakStart: '12:00',
    lunchBreakEnd: '13:30',
    nightRestStart: '23:00',
    nightRestEnd: '07:00',
    minBufferMinutes: 10,  // 日程间最少缓冲 10 分钟
    defaultDurationMinutes: 45 // 默认日程时长 45 分钟
  };

  var _activeParseToken = null;

  var _cachedPreferences = Object.assign({}, DEFAULT_PREFERENCES);

  function getAiPreferencesSync() {
    try {
      var item = localStorage.getItem(STORAGE_KEYS.AI_PREFERENCES);
      if (item) {
        var parsed = JSON.parse(item);
        _cachedPreferences = Object.assign({}, DEFAULT_PREFERENCES, parsed);
        return _cachedPreferences;
      }
    } catch (_) {}
    return Object.assign({}, _cachedPreferences);
  }

  async function loadAiPreferences() {
    try {
      if (window.db && db.config) {
        var row = await db.config.get(STORAGE_KEYS.AI_PREFERENCES);
        if (row && row.value) {
          _cachedPreferences = Object.assign({}, DEFAULT_PREFERENCES, row.value);
          return _cachedPreferences;
        }
      }
    } catch (_) {}
    return getAiPreferencesSync();
  }

  async function saveAiPreferences(prefs) {
    _cachedPreferences = Object.assign({}, DEFAULT_PREFERENCES, prefs || {});
    try {
      if (window.db && db.config) {
        await db.config.put({ key: STORAGE_KEYS.AI_PREFERENCES, value: _cachedPreferences });
      }
    } catch (_) {}
    try {
      localStorage.setItem(STORAGE_KEYS.AI_PREFERENCES, JSON.stringify(_cachedPreferences));
    } catch (_) {}
  }

  // 严密指纹计算：识别事件内容、更新时间、重复规则及跨 App 投影变化
  function computeCalendarFingerprint(events, crossAppItems) {
    var parts = [];
    (events || []).forEach(function(e) {
      if (!e) return;
      var rec = e.recurrence ? (e.recurrence.type + '_' + (e.recurrence.interval || 1) + '_' + (e.recurrence.endDate || '')) : 'none';
      parts.push(e.id + ':' + (e.updatedAt || 0) + ':' + e.date + ':' + (e.startTime || '') + ':' + (e.endTime || '') + ':' + (e.title || '') + ':' + rec);
    });
    (crossAppItems || []).forEach(function(c) {
      if (!c) return;
      parts.push('cross:' + c.id + ':' + c.date + ':' + (c.startTime || '') + ':' + (c.endTime || '') + ':' + (c.title || ''));
    });
    return parts.sort().join('|');
  }

  // ===== 2. 基础辅助函数 =====
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    return (prefix || 'tcai') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function parseLocalDate(str) {
    if (!str) return null;
    if (str instanceof Date) {
      return new Date(str.getFullYear(), str.getMonth(), str.getDate());
    }
    var clean = String(str).trim().slice(0, 10);
    var parts = clean.split('-');
    if (parts.length < 3) return null;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m, d);
  }

  function formatLocalDate(d) {
    if (!d) return '';
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    var dateObj = d instanceof Date ? d : parseLocalDate(d);
    if (!dateObj) return '';
    var y = dateObj.getFullYear();
    var m = String(dateObj.getMonth() + 1).padStart(2, '0');
    var day = String(dateObj.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function getTodayLocalDateStr() {
    return formatLocalDate(new Date());
  }

  function timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    var parts = timeStr.trim().split(':');
    var h = parseInt(parts[0], 10) || 0;
    var m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  }

  function minutesToTime(totalMins) {
    totalMins = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMins)));
    var h = Math.floor(totalMins / 60);
    var m = totalMins % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function getWeekdayName(dateStr) {
    var d = parseLocalDate(dateStr);
    if (!d) return '';
    var names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return names[d.getDay()];
  }

  // 提取清洗 JSON (支持去除 markdown 代码块包裹)
  function extractJson(raw) {
    if (!raw) return null;
    var text = String(raw).trim();
    if (text.indexOf('```') !== -1) {
      text = text.replace(/```(?:json)?([\s\S]*?)```/g, '$1').trim();
    }
    var firstOpen = text.indexOf('{');
    var lastClose = text.lastIndexOf('}');
    if (firstOpen !== -1 && lastClose > firstOpen) {
      text = text.substring(firstOpen, lastClose + 1);
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      console.warn('[TimeCalendarAI] extractJson parse error:', err, 'Raw:', raw);
      return null;
    }
  }

  // ===== 3. 本地高精度规则解析器 (Fallback Local Rule Engine) =====
  // 当网络离线、API 未配置、超时或返回非法数据时，100% 确保可用
  function fallbackLocalParser(inputText, baseDateStr) {
    var baseDate = parseLocalDate(baseDateStr) || new Date();
    var text = String(inputText || '').trim();
    if (!text) return { drafts: [], explanation: '请输入日程需求' };

    var drafts = [];
    var targetDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    var isAllDay = false;
    var startTime = '';
    var endTime = '';
    var recurrence = { type: 'none' };
    var category = 'other';
    var reminderRules = [{ advanceMinutes: 15, enabled: true }];
    var needsConfirmation = false;
    var unspecifiedFields = [];

    // 1. 日期匹配
    if (/大后天/.test(text)) {
      targetDate.setDate(targetDate.getDate() + 3);
    } else if (/后天/.test(text)) {
      targetDate.setDate(targetDate.getDate() + 2);
    } else if (/明天/.test(text)) {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (/今天/.test(text)) {
      // 保持基准日期
    } else if (/周末/.test(text)) {
      var day = targetDate.getDay();
      var daysUntilSat = (6 - day + 7) % 7 || 7;
      targetDate.setDate(targetDate.getDate() + daysUntilSat);
    } else {
      // 星期匹配
      var weekMatch = text.match(/(?:下周|这周|本周|周|星期)([一二三四五六日天1-7])/);
      if (weekMatch) {
        var numMap = { '一': 1, '1': 1, '二': 2, '2': 2, '三': 3, '3': 3, '四': 4, '4': 4, '五': 5, '5': 5, '六': 6, '6': 6, '日': 0, '天': 0, '7': 0 };
        var targetDayOfWeek = numMap[weekMatch[1]];
        var currentDayOfWeek = targetDate.getDay();
        var diff = targetDayOfWeek - currentDayOfWeek;
        if (/下周/.test(text)) diff += 7;
        else if (diff <= 0) diff += 7;
        targetDate.setDate(targetDate.getDate() + diff);
      } else {
        // 月日匹配 如 5月10日, 11-15
        var mdMatch = text.match(/(\d{1,2})[月\.\-](\d{1,2})[日号]?/);
        if (mdMatch) {
          var monthVal = parseInt(mdMatch[1], 10) - 1;
          var dayVal = parseInt(mdMatch[2], 10);
          targetDate.setMonth(monthVal);
          targetDate.setDate(dayVal);
        } else {
          unspecifiedFields.push('date');
          needsConfirmation = true;
        }
      }
    }

    // 2. 时间匹配 (支持阿拉伯数字与中文数字 如 "三点", "下午3点", "晚上8点半")
    function parseChineseNum(str) {
      if (!str) return null;
      str = String(str).trim();
      if (/^\d+$/.test(str)) return parseInt(str, 10);
      var map = {
        '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
        '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        '十一': 11, '十二': 12
      };
      return map[str] !== undefined ? map[str] : null;
    }

    var timeMatch = text.match(/(?:(早上|上午|中午|下午|晚上|夜间|清晨|傍晚|凌晨)\s*)?(\d{1,2}|[一二两三四五六七八九十]{1,2})(?:[:点时](\d{1,2}|半)?|点半)/);
    if (timeMatch && timeMatch[2]) {
      var period = timeMatch[1] || '';
      var hourVal = parseChineseNum(timeMatch[2]);
      if (hourVal !== null) {
        var hour = hourVal;
        var min = 0;
        if (text.includes(timeMatch[0] + '半') || (timeMatch[0] && timeMatch[0].includes('半')) || timeMatch[3] === '半') {
          min = 30;
        } else if (timeMatch[3] && /^\d+$/.test(timeMatch[3])) {
          min = parseInt(timeMatch[3], 10) || 0;
        }

        if ((period === '下午' || period === '晚上' || period === '夜间') && hour < 12) {
          hour += 12;
        } else if (period === '中午' && hour < 11) {
          hour += 12;
        }
        startTime = String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0');

        // 持续时长匹配 如 40分钟, 2小时, 两个小时, 半小时
        var durationMins = 60;
        var durMatch = text.match(/(\d+|[一二两三四五六七八九十])\s*(?:个)?(分钟|小时|个半小时)|半小时/);
        if (durMatch) {
          if (durMatch[0] === '半小时') {
            durationMins = 30;
          } else {
            var num = parseChineseNum(durMatch[1]) || 1;
            var unit = durMatch[2];
            if (unit === '分钟') durationMins = num;
            else if (unit === '小时') durationMins = num * 60;
            else if (unit === '个半小时') durationMins = num * 60 + 30;
          }
        }
        endTime = minutesToTime(timeToMinutes(startTime) + durationMins);
      }
    }

    if (!startTime) {
      if (/全天|整天/.test(text)) {
        isAllDay = true;
      } else {
        startTime = '09:00';
        endTime = '10:00';
        unspecifiedFields.push('startTime');
        needsConfirmation = true;
      }
    }

    // 3. 重复规则
    if (/每天|每日/.test(text)) {
      recurrence = { type: 'daily', interval: 1 };
    } else if (/每周/.test(text)) {
      recurrence = { type: 'weekly', interval: 1 };
    } else if (/每月/.test(text)) {
      recurrence = { type: 'monthly', interval: 1 };
    } else if (/每年/.test(text)) {
      recurrence = { type: 'yearly', interval: 1 };
    }

    // 4. 分类提炼
    if (/工作|开会|汇报|项目|客户|周会/.test(text)) category = 'work';
    else if (/学习|复习|背单词|做题|考试|阅读|刷题/.test(text)) category = 'study';
    else if (/运动|健身|跑步|散步|游泳|瑜伽/.test(text)) category = 'life';
    else if (/约会|逛街|电影|礼物|纪念/.test(text)) category = 'love';
    else category = 'life';

    // 5. 提炼纯净标题
    var cleanTitle = text
      .replace(/^(提醒我|帮我|请帮我|安排|新建|添加|创建)/, '')
      .replace(/(明天|后天|今天|大后天|下周[一二三四五六日天]|本周[一二三四五六日天]|周末|周[一二三四五六日天])/, '')
      .replace(/(早上|上午|中午|下午|晚上|夜间)?\s*\d{1,2}(?:[:点时]\d{1,2}?|点半)?/, '')
      .replace(/(\d+)\s*(分钟|小时|个半小时)/, '')
      .replace(/(提醒我|提前\d+分钟|提前半小时|全天|整天)/, '')
      .replace(/^(去|在|做|要)/, '')
      .trim();

    if (!cleanTitle) cleanTitle = text.slice(0, 15);

    drafts.push({
      id: uid('draft'),
      title: cleanTitle,
      date: formatLocalDate(targetDate),
      startTime: isAllDay ? '' : startTime,
      endTime: isAllDay ? '' : endTime,
      isAllDay: isAllDay,
      category: category,
      recurrence: recurrence,
      reminderRules: reminderRules,
      notes: '由自然语言快速解析生成',
      needsConfirmation: needsConfirmation,
      unspecifiedFields: unspecifiedFields,
      source: { app: 'timeCalendar', isAIGenerated: true }
    });

    return {
      drafts: drafts,
      explanation: needsConfirmation ? '已完成初步解析，部分时间/日期为默认推荐，请在卡片中核对确认' : '已成功解析日程要素，请核对预览卡片'
    };
  }

  // ===== 4. 确定性冲突检测算法 (Deterministic Local Conflict Detection Engine) =====
  // 严格依据本地日历数据 + 阶段 1 重复引擎展开 + 跨 App 排期 + 用户作息偏好
  var TimeConflictEngine = {
    // 检测单个草案或日程与现有所有日程的冲突
    checkEventConflict: function(targetEvent, allExistingEvents, crossAppItems, preferences) {
      preferences = Object.assign({}, DEFAULT_PREFERENCES, preferences || {});
      var conflicts = [];
      if (!targetEvent || !targetEvent.date) {
        return { hasConflict: false, severity: 'none', conflicts: [] };
      }

      var targetDateStr = targetEvent.date;
      var isAllDay = !!targetEvent.isAllDay;
      var targetStartMins = isAllDay ? 0 : timeToMinutes(targetEvent.startTime || '00:00');
      var targetEndMins = isAllDay ? 1440 : timeToMinutes(targetEvent.endTime || targetEvent.startTime || '01:00');
      if (targetEndMins <= targetStartMins && !isAllDay) {
        targetEndMins = targetStartMins + 60; // 兜底防御
      }

      // 4.1 检查是否处于用户设置的静息时段 (软冲突)
      if (!isAllDay) {
        var nightStartMins = timeToMinutes(preferences.nightRestStart);
        var nightEndMins = timeToMinutes(preferences.nightRestEnd);
        var lunchStartMins = timeToMinutes(preferences.lunchBreakStart);
        var lunchEndMins = timeToMinutes(preferences.lunchBreakEnd);

        // 睡眠时间区间 (跨午夜)
        var inSleepHours = (targetStartMins >= nightStartMins || targetStartMins < nightEndMins) ||
                           (targetEndMins > nightStartMins || (targetEndMins <= nightEndMins && targetEndMins > 0));
        if (inSleepHours) {
          conflicts.push({
            level: 'soft',
            title: '作息休息时段',
            timeRange: preferences.nightRestStart + ' ~ 次日 ' + preferences.nightRestEnd,
            sourceApp: 'systemPreference',
            reason: '该日程落入预设的深度睡眠与休息时段，建议调整至白天进行'
          });
        }

        // 午休时段
        var inLunchBreak = (targetStartMins < lunchEndMins && targetEndMins > lunchStartMins);
        if (inLunchBreak) {
          conflicts.push({
            level: 'soft',
            title: '午休时段',
            timeRange: preferences.lunchBreakStart + ' ~ ' + preferences.lunchBreakEnd,
            sourceApp: 'systemPreference',
            reason: '该日程占用午休缓冲时间，请确认是否有充沛精力'
          });
        }
      }

      // 4.2 收集待检测的日期窗口 (若自身为重复日程，必须覆盖未来合理时间窗口，如45天/8次以内发生日)
      var checkDates = [targetDateStr];
      var maxWindowDays = 45;
      var maxOccurrences = 8;
      var isRecurringTarget = !!(targetEvent.recurrence && targetEvent.recurrence.type && targetEvent.recurrence.type !== 'none');
      var windowMeta = {
        isRecurring: isRecurringTarget,
        maxWindowDays: maxWindowDays,
        maxOccurrences: maxOccurrences,
        checkedOccurrences: 1,
        checkedUntilDate: targetDateStr,
        truncatedByWindow: false,
        truncationReason: ''
      };

      if (isRecurringTarget && global.TimeCalendarRecurrence) {
        var baseD = parseLocalDate(targetDateStr);
        var recEndDate = targetEvent.recurrence.endDate || '';
        if (baseD) {
          var lastWindowDateStr = formatLocalDate(new Date(baseD.getFullYear(), baseD.getMonth(), baseD.getDate() + maxWindowDays));
          var hitCap = false;
          for (var dayOffset = 1; dayOffset <= maxWindowDays; dayOffset++) {
            var futureD = new Date(baseD.getFullYear(), baseD.getMonth(), baseD.getDate() + dayOffset);
            var futureDateStr = formatLocalDate(futureD);
            if (global.TimeCalendarRecurrence.isOccurringOnDate(targetEvent, futureDateStr)) {
              if (checkDates.length >= maxOccurrences) {
                hitCap = true;
                break;
              }
              checkDates.push(futureDateStr);
            }
          }
          windowMeta.checkedOccurrences = checkDates.length;
          windowMeta.checkedUntilDate = checkDates[checkDates.length - 1] || targetDateStr;
          // 判断重复周期是否超出 45 天 / 8 次校验上限
          if (hitCap || !recEndDate || recEndDate > lastWindowDateStr) {
            windowMeta.truncatedByWindow = true;
            windowMeta.truncationReason = '重复周期超出 ' + maxWindowDays + ' 天（或前 ' + maxOccurrences + ' 次）检测上限，本次仅校验至 ' + windowMeta.checkedUntilDate + '，更远期日期暂未逐一检测';
          }
        }
      }

      // 4.3 跨午夜日程支持：若 endTime < startTime，标记跨午夜
      var isCrossMidnight = !!targetEvent.isCrossMidnight || (!isAllDay && targetEndMins < targetStartMins);

      checkDates.forEach(function(curDateStr) {
        var isOriginDate = (curDateStr === targetDateStr);

        // 收集该日期所有实际生效事件 (普通日程 + 重复日程动态展开)
        var dayEvents = [];
        (allExistingEvents || []).forEach(function(ev) {
          if (!ev || ev.id === targetEvent.id || ev.id === targetEvent.masterEventId) return;

          // 如果是重复日程，使用 Phase 1 暴露的 TimeCalendarRecurrence 动态判定
          if (ev.recurrence && ev.recurrence.type && ev.recurrence.type !== 'none') {
            if (global.TimeCalendarRecurrence && global.TimeCalendarRecurrence.isOccurringOnDate(ev, curDateStr)) {
              dayEvents.push(global.TimeCalendarRecurrence.createOccurrence(ev, curDateStr));
            }
          } else if (ev.date === curDateStr) {
            dayEvents.push(ev);
          }
        });

        // 收集跨 App 权威排期 (人生游戏任务、自习室考试)
        (crossAppItems || []).forEach(function(item) {
          if (!item || item.id === targetEvent.id) return;
          if (item.date === curDateStr) {
            dayEvents.push(item);
          }
        });

        // 逐一对比时间区间
        dayEvents.forEach(function(other) {
          var otherIsAllDay = !!other.isAllDay;
          var otherSourceApp = (other.source && other.source.app) || 'timeCalendar';
          var sourceLabel = otherSourceApp === 'lifeGame' ? '人生游戏委托' :
                            (otherSourceApp === 'studyRoom' ? '自习室考试/安排' : '现有日历日程');

          if (isAllDay || otherIsAllDay) {
            // 全天事件与定时事件属于信息提示 (info)，绝不判定为硬冲突
            conflicts.push({
              level: 'info',
              title: other.title || '未命名事项',
              timeRange: otherIsAllDay ? '全天' : ((other.startTime || '') + ' ~ ' + (other.endTime || '')),
              sourceApp: otherSourceApp,
              reason: (isOriginDate ? '当天' : curDateStr + ' ') + '已有' + (otherIsAllDay ? '全天事项' : '关联日程') + '「' + (other.title || '') + '」(' + sourceLabel + ')'
            });
            return;
          }

          // 定时事件严格时间段比对
          var otherStartMins = timeToMinutes(other.startTime || '00:00');
          var otherEndMins = timeToMinutes(other.endTime || other.startTime || '01:00');
          if (otherEndMins <= otherStartMins) otherEndMins = otherStartMins + 60;

          // 判断重叠：支持常规或跨午夜
          var hasOverlap = false;
          if (!isCrossMidnight) {
            hasOverlap = (targetStartMins < otherEndMins) && (otherStartMins < targetEndMins);
          } else {
            // 跨午夜：当天晚上 targetStartMins ~ 1440 与 otherStartMins ~ otherEndMins 重叠
            hasOverlap = (targetStartMins < otherEndMins);
          }

          if (hasOverlap) {
            var datePrefix = isOriginDate ? '' : ('重复周期于 ' + curDateStr + '：');
            conflicts.push({
              level: 'hard',
              title: other.title || '已有日程',
              timeRange: (other.startTime || '--:--') + ' ~ ' + (other.endTime || '--:--'),
              sourceApp: otherSourceApp,
              reason: datePrefix + '时间段与「' + (other.title || '') + '」重合 (' + sourceLabel + ')'
            });
          } else {
            // 紧凑安排检查 (间隙 < minBufferMinutes)
            var gap = Math.min(Math.abs(targetStartMins - otherEndMins), Math.abs(otherStartMins - targetEndMins));
            if (gap > 0 && gap < preferences.minBufferMinutes) {
              conflicts.push({
                level: 'soft',
                title: other.title || '相邻日程',
                timeRange: (other.startTime || '--:--') + ' ~ ' + (other.endTime || '--:--'),
                sourceApp: otherSourceApp,
                reason: (isOriginDate ? '' : curDateStr + ' ') + '与「' + (other.title || '') + '」间隔仅 ' + gap + ' 分钟，安排紧凑缺少缓冲'
              });
            }
          }
        });
      });

      // 若重复日程超出 45 天 / 8 次校验窗口，明确给出边界提示 (info 级别，不误报为无远期冲突)
      if (windowMeta.truncatedByWindow) {
        conflicts.push({
          level: 'info',
          code: 'recurrence_window_limit',
          title: '重复日程远期检测边界',
          timeRange: targetDateStr + ' ~ ' + windowMeta.checkedUntilDate,
          sourceApp: 'timeCalendar',
          reason: windowMeta.truncationReason
        });
      }

      // 计算最终严重级别
      var hasHard = conflicts.some(function(c) { return c.level === 'hard'; });
      var hasSoft = conflicts.some(function(c) { return c.level === 'soft'; });
      var hasInfo = conflicts.some(function(c) { return c.level === 'info'; });
      var severity = hasHard ? 'hard' : (hasSoft ? 'soft' : (hasInfo ? 'info' : 'none'));

      return {
        hasConflict: hasHard || hasSoft,
        severity: severity,
        conflicts: conflicts,
        windowMeta: windowMeta
      };
    },

    // 寻找最近的可用空闲时段建议 (Dynamic Free-Slot Finder)
    findFreeSlotSuggestion: function(targetEvent, allExistingEvents, preferences) {
      preferences = Object.assign({}, DEFAULT_PREFERENCES, preferences || {});
      var dateStr = targetEvent.date || getTodayLocalDateStr();
      var durationMins = 45;
      if (targetEvent.startTime && targetEvent.endTime) {
        durationMins = Math.max(15, timeToMinutes(targetEvent.endTime) - timeToMinutes(targetEvent.startTime));
      }

      var dayEvents = [];
      (allExistingEvents || []).forEach(function(ev) {
        if (!ev || ev.id === targetEvent.id) return;
        if (ev.isAllDay) return;
        if (ev.recurrence && ev.recurrence.type && ev.recurrence.type !== 'none') {
          if (global.TimeCalendarRecurrence && global.TimeCalendarRecurrence.isOccurringOnDate(ev, dateStr)) {
            dayEvents.push(ev);
          }
        } else if (ev.date === dateStr) {
          dayEvents.push(ev);
        }
      });

      // 转换为区间列表并排序
      var busyIntervals = [];
      // 避开午休
      busyIntervals.push({
        start: timeToMinutes(preferences.lunchBreakStart),
        end: timeToMinutes(preferences.lunchBreakEnd)
      });
      dayEvents.forEach(function(e) {
        if (e.startTime && e.endTime) {
          busyIntervals.push({
            start: timeToMinutes(e.startTime),
            end: timeToMinutes(e.endTime)
          });
        }
      });
      busyIntervals.sort(function(a, b) { return a.start - b.start; });

      // 从白天工作时段探索
      var searchStart = preferences.dayStartHour * 60;
      var searchEnd = preferences.dayEndHour * 60;
      var cursor = searchStart;

      for (var i = 0; i < busyIntervals.length; i++) {
        var b = busyIntervals[i];
        if (b.start > cursor) {
          var freeSpan = b.start - cursor;
          if (freeSpan >= durationMins + preferences.minBufferMinutes) {
            var slotStart = cursor + 5;
            var slotEnd = slotStart + durationMins;
            if (slotEnd <= b.start) {
              return {
                date: dateStr,
                startTime: minutesToTime(slotStart),
                endTime: minutesToTime(slotEnd),
                reason: '同日空闲时段 (' + minutesToTime(slotStart) + ' ~ ' + minutesToTime(slotEnd) + ')'
              };
            }
          }
        }
        cursor = Math.max(cursor, b.end + preferences.minBufferMinutes);
      }

      if (searchEnd - cursor >= durationMins) {
        return {
          date: dateStr,
          startTime: minutesToTime(cursor),
          endTime: minutesToTime(cursor + durationMins),
          reason: '同日空闲时段 (' + minutesToTime(cursor) + ' ~ ' + minutesToTime(cursor + durationMins) + ')'
        };
      }

      // 若同日无空闲，推荐次日上午同一时段
      var nextDate = parseLocalDate(dateStr);
      nextDate.setDate(nextDate.getDate() + 1);
      return {
        date: formatLocalDate(nextDate),
        startTime: '10:00',
        endTime: minutesToTime(600 + durationMins),
        reason: '次日空闲时段推荐 (10:00 ~ ' + minutesToTime(600 + durationMins) + ')'
      };
    }
  };

  // ===== 5. 结构化校验器 (Strict Structure Validator) =====
  function validateAndNormalizeDrafts(rawDrafts, baseDateStr) {
    baseDateStr = baseDateStr || getTodayLocalDateStr();
    if (!Array.isArray(rawDrafts)) return [];

    return rawDrafts.map(function(d) {
      var item = Object.assign({}, d);
      item.id = item.id || uid('draft');
      item.title = String(item.title || '新建日程').trim();
      if (!item.title) item.title = '新建日程';

      // 日期规范化
      if (!item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
        item.date = baseDateStr;
        item.needsConfirmation = true;
        item.unspecifiedFields = (item.unspecifiedFields || []).concat(['date']);
      }

      // 时间规范化
      item.isAllDay = !!item.isAllDay;
      if (item.isAllDay) {
        item.startTime = '';
        item.endTime = '';
      } else {
        if (!item.startTime || !/^\d{2}:\d{2}$/.test(item.startTime)) {
          item.startTime = '09:00';
          item.needsConfirmation = true;
          item.unspecifiedFields = (item.unspecifiedFields || []).concat(['startTime']);
        }
        // 跨午夜与结束时间支持
        if (timeToMinutes(item.endTime) < timeToMinutes(item.startTime)) {
          // 明确的跨午夜日程（如 23:00 ~ 02:00），保留用户指定的结束时间并标记跨午夜
          item.isCrossMidnight = true;
        } else if (timeToMinutes(item.endTime) === timeToMinutes(item.startTime)) {
          item.endTime = minutesToTime(timeToMinutes(item.startTime) + 60);
        }
      }

      // 分类规范化
      var validCats = ['work', 'study', 'life', 'love', 'exercise', 'meeting', 'other'];
      if (!item.category || validCats.indexOf(item.category) === -1) {
        item.category = 'life';
      }

      // 重复规则规范化
      if (!item.recurrence || typeof item.recurrence !== 'object') {
        item.recurrence = { type: 'none' };
      } else {
        var vTypes = ['none', 'daily', 'weekly', 'monthly', 'yearly', 'custom'];
        if (vTypes.indexOf(item.recurrence.type) === -1) item.recurrence.type = 'none';
      }

      // 提醒规范化
      if (!Array.isArray(item.reminderRules) || item.reminderRules.length === 0) {
        item.reminderRules = [{ id: uid('rule'), advanceMinutes: 15, enabled: true }];
      }

      item.completed = false;
      item.source = item.source || { app: 'timeCalendar', isAIGenerated: true };
      return item;
    });
  }

  // ===== 6. AI 自然语言解析中枢 (TimeCalendarAI Core) =====
  var TimeCalendarAI = {
    // 6.1 自然语言调用接口
    async parseNaturalLanguage(userPrompt, options) {
      options = options || {};
      var baseDateStr = options.baseDate || getTodayLocalDateStr();
      var existingEvents = options.existingEvents || [];
      var crossAppItems = options.crossAppItems || [];

      // 提取当日脱敏已有日程忙闲概况 (仅含时间段和类别，严禁透传微信聊天与私密日记)
      var busyOverview = [];
      existingEvents.slice(0, 8).forEach(function(ev) {
        if (ev.isAllDay) {
          busyOverview.push(ev.date + ' [全天已排期]');
        } else if (ev.startTime && ev.endTime) {
          busyOverview.push(ev.date + ' ' + ev.startTime + '~' + ev.endTime + ' (' + (ev.category || '已占用') + ')');
        }
      });

      var systemPrompt =
        '你是一位温暖、精准、懂生活节奏的「时光日历」AI 日程管家。\n' +
        '你的任务是根据用户输入的自然语言，解析出结构化的一条或多条日程安排。\n\n' +
        '【基准时空锚点】\n' +
        '今天日期：' + baseDateStr + ' (' + getWeekdayName(baseDateStr) + ')\n' +
        '近期已占用时间段：' + (busyOverview.length > 0 ? busyOverview.join('; ') : '暂无冲突排期') + '\n\n' +
        '【严格规则】\n' +
        '1. 必须完全输出纯合法 JSON 对象，严禁包裹任何 Markdown 标记以外的解释文字。\n' +
        '2. 格式规范：\n' +
        '   - date: 必须为 YYYY-MM-DD 格式。\n' +
        '   - startTime / endTime: 必须为 HH:mm 格式，且 endTime 必须晚于 startTime。\n' +
        '   - category: 可选 work (工作/会议), study (学习/考试), life (日常/生活/运动), love (情侣/恋爱), other (其他)。\n' +
        '   - isAllDay: 若为全天任务设为 true，此时 startTime/endTime 留空字符串。\n' +
        '   - recurrence: { type: "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom", interval: 1 }。\n' +
        '   - reminderRules: [{ advanceMinutes: 15, enabled: true }]。\n' +
        '   - needsConfirmation: 若用户未指定关键时间/日期，设为 true 并推荐合理时段。\n' +
        '   - unspecifiedFields: 包含未明确指定的字段名数组，如 ["startTime"]。\n' +
        '3. 模糊指令支持：如"这周安排3次运动各40分钟"，请拆分生成3条分散在不同工作日的合理日程。\n' +
        '4. 严禁凭空编造敏感信息，缺失信息通过 needsConfirmation 引导用户在预览卡片核对。';

      var userMessage =
        '用户输入指令：\n' +
        '「' + userPrompt + '」\n\n' +
        '请严格以如下 JSON 格式返回：\n' +
        '{\n' +
        '  "explanation": "简要说明解析意图",\n' +
        '  "drafts": [\n' +
        '    {\n' +
        '      "title": "日程标题",\n' +
        '      "date": "YYYY-MM-DD",\n' +
        '      "startTime": "HH:mm",\n' +
        '      "endTime": "HH:mm",\n' +
        '      "isAllDay": false,\n' +
        '      "category": "work",\n' +
        '      "recurrence": { "type": "none", "interval": 1 },\n' +
        '      "reminderRules": [{ "advanceMinutes": 15, "enabled": true }],\n' +
        '      "notes": "由自然语言安排",\n' +
        '      "needsConfirmation": false,\n' +
        '      "unspecifiedFields": []\n' +
        '    }\n' +
        '  ]\n' +
        '}';

      // 优先调用全局 AI 接口；若无接口或调用失败，无缝降级高精度本地规则解析
      try {
        if (window.callAI && typeof window.callAI === 'function') {
          var aiRes = await window.callAI(
            [{ role: 'user', content: userMessage }],
            { system: systemPrompt, temperature: 0.2 }
          );
          var parsed = extractJson(aiRes);
          if (parsed && Array.isArray(parsed.drafts) && parsed.drafts.length > 0) {
            var validated = validateAndNormalizeDrafts(parsed.drafts, baseDateStr);
            return {
              drafts: validated,
              explanation: parsed.explanation || '已成功为您生成日程草案',
              isFromAI: true
            };
          }
        }
      } catch (err) {
        console.warn('[TimeCalendarAI] window.callAI failed, falling back to local rule engine:', err);
      }

      // 本地兜底引擎解析
      var localResult = fallbackLocalParser(userPrompt, baseDateStr);
      var localValidated = validateAndNormalizeDrafts(localResult.drafts, baseDateStr);
      return {
        drafts: localValidated,
        explanation: localResult.explanation,
        isFromAI: false
      };
    },

    // 6.2 确定性冲突检测外部入口
    detectConflicts: function(drafts, existingEvents, crossAppItems, preferences) {
      var results = [];
      (drafts || []).forEach(function(d) {
        var res = TimeConflictEngine.checkEventConflict(d, existingEvents, crossAppItems, preferences);
        results.push({
          draftId: d.id,
          report: res
        });
      });
      return results;
    },

    // 6.3 寻找空闲调整建议外部入口
    getFreeSlotSuggestion: function(draft, existingEvents, preferences) {
      return TimeConflictEngine.findFreeSlotSuggestion(draft, existingEvents, preferences);
    },

    // 6.4 打开「✨ AI 帮我安排」交互抽屉 / 模态卡片
    showAICreateModal: function(options) {
      options = options || {};
      var baseDate = options.baseDate || getTodayLocalDateStr();

      // 移除旧有抽屉
      var old = document.getElementById('tc-ai-create-sheet');
      if (old) old.remove();

      var overlay = document.createElement('div');
      overlay.id = 'tc-ai-create-sheet';
      overlay.className = 'tc-modal-overlay tc-ai-modal-overlay';

      var quickPills = [
        '明天下午3点提醒我开会',
        '每周一、三、五晚上复习英语',
        '这周安排三次运动，每次40分钟',
        '周末给我留出两个小时整理房间',
        '帮我把今天剩余的学习任务安排好'
      ];

      var pillsHtml = quickPills.map(function(text) {
        return '<button type="button" class="tc-ai-quick-pill" data-prompt="' + esc(text) + '">' + esc(text) + '</button>';
      }).join('');

      overlay.innerHTML =
        '<div class="tc-ai-sheet-dialog">' +
          '<div class="tc-modal-header">' +
            '<div class="tc-modal-title" style="display: flex; align-items: center; gap: 6px;">' +
              '<i class="fa-solid fa-wand-magic-sparkles" style="color: var(--c-accent, #6366f1);"></i>' +
              '<span>AI 智能日程管家</span>' +
            '</div>' +
            '<button class="tc-modal-close-btn" id="tc-ai-sheet-close"><i class="fa fa-xmark"></i></button>' +
          '</div>' +
          '<div class="tc-modal-body tc-ai-sheet-body">' +
            '<div class="tc-ai-input-box">' +
              '<textarea class="tc-form-textarea" id="tc-ai-prompt-input" rows="3" placeholder="说出你想安排的事，如：明天下午三点开会，提前15分钟提醒；每周一三五晚上复习英语...">' + esc(options.initialPrompt || '') + '</textarea>' +
              '<div class="tc-ai-quick-pills-wrap">' +
                '<span class="tc-ai-pills-label">快捷灵感：</span>' +
                '<div class="tc-ai-pills-list">' + pillsHtml + '</div>' +
              '</div>' +
              '<div style="display: flex; justify-content: flex-end; margin-top: 8px;">' +
                '<button type="button" class="tc-btn tc-btn-primary" id="tc-ai-btn-parse" style="display: inline-flex; align-items: center; gap: 6px;">' +
                  '<i class="fa-solid fa-sparkles"></i><span>开始解析排期</span>' +
                '</button>' +
              '</div>' +
            '</div>' +

            '<!-- 解析中状态 -->' +
            '<div id="tc-ai-parsing-loader" style="display: none; padding: 30px 10px; text-align: center;">' +
              '<div class="tc-spinner"></div>' +
              '<div style="font-size: 13px; color: var(--c-text-muted); margin-top: 10px;">正在理解日程、计算时间与冲突检测中...</div>' +
            '</div>' +

            '<!-- 草案预览容器 -->' +
            '<div id="tc-ai-drafts-container" style="display: none; margin-top: 12px;">' +
              '<div class="tc-ai-drafts-header">' +
                '<span id="tc-ai-drafts-summary" style="font-weight: 600; font-size: 13px;"></span>' +
                '<span style="font-size: 11px; color: var(--c-text-muted);">可在卡片中直接修改，确认后写入</span>' +
              '</div>' +
              '<div id="tc-ai-drafts-list" class="tc-ai-drafts-list"></div>' +
            '</div>' +
          '</div>' +

          '<div class="tc-modal-footer tc-ai-sheet-footer" id="tc-ai-sheet-footer" style="display: none;">' +
            '<button class="tc-btn" id="tc-ai-btn-cancel">取消</button>' +
            '<button class="tc-btn tc-btn-primary" id="tc-ai-btn-confirm-all" style="flex: 1;">' +
              '<i class="fa-solid fa-calendar-check" style="margin-right: 4px;"></i>确认添加所选日程' +
            '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      // 绑定快捷短语点击
      overlay.querySelectorAll('.tc-ai-quick-pill').forEach(function(pill) {
        pill.addEventListener('click', function() {
          var input = overlay.querySelector('#tc-ai-prompt-input');
          input.value = pill.dataset.prompt;
          input.focus();
        });
      });

      // 关闭事件
      var closeSheet = function() { overlay.remove(); };
      overlay.querySelector('#tc-ai-sheet-close').addEventListener('click', closeSheet);
      overlay.querySelector('#tc-ai-btn-cancel').addEventListener('click', closeSheet);

      // 当前状态记录
      var currentDrafts = [];
      var calendarInitState = (global.TimeCalendarApp && global.TimeCalendarApp.state) || { events: [] };
      var initCrossApp = [].concat(calendarInitState.lifeGameTasks || [], calendarInitState.studyRoomExams || []);
      var snapshotFingerprint = computeCalendarFingerprint(calendarInitState.events, initCrossApp);
      var isSubmitting = false;

      // 解析触发
      var btnParse = overlay.querySelector('#tc-ai-btn-parse');
      btnParse.addEventListener('click', async function() {
        var promptText = overlay.querySelector('#tc-ai-prompt-input').value.trim();
        if (!promptText) {
          if (window.toast) window.toast('请输入日程内容');
          else alert('请输入日程内容');
          return;
        }

        var loader = overlay.querySelector('#tc-ai-parsing-loader');
        var draftsContainer = overlay.querySelector('#tc-ai-drafts-container');
        var footer = overlay.querySelector('#tc-ai-sheet-footer');

        loader.style.display = 'block';
        draftsContainer.style.display = 'none';
        footer.style.display = 'none';
        btnParse.disabled = true;

        var myParseToken = uid('ptok');
        _activeParseToken = myParseToken;

        try {
          var calendarState = (global.TimeCalendarApp && global.TimeCalendarApp.state) || { events: [] };
          var existingEvents = calendarState.events || [];
          var crossAppItems = [].concat(calendarState.lifeGameTasks || [], calendarState.studyRoomExams || []);

          var parseRes = await TimeCalendarAI.parseNaturalLanguage(promptText, {
            baseDate: baseDate,
            existingEvents: existingEvents,
            crossAppItems: crossAppItems
          });

          // 若已有更新的请求发生，抛弃迟到的响应
          if (_activeParseToken !== myParseToken) return;

          currentDrafts = parseRes.drafts || [];
          if (currentDrafts.length === 0) {
            loader.style.display = 'none';
            btnParse.disabled = false;
            if (window.toast) window.toast('未能识别到明确日程，请补充时间或日期');
            return;
          }

          renderDraftCards();
          loader.style.display = 'none';
          draftsContainer.style.display = 'block';
          footer.style.display = 'flex';
          btnParse.disabled = false;

          var summaryEl = overlay.querySelector('#tc-ai-drafts-summary');
          summaryEl.textContent = parseRes.explanation || ('已解析出 ' + currentDrafts.length + ' 条日程草案');

        } catch (parseErr) {
          console.error('[TimeCalendarAI] parse error:', parseErr);
          loader.style.display = 'none';
          btnParse.disabled = false;
          if (window.toast) window.toast('解析出现异常，请稍后重试');
        }
      });

      // 渲染草案卡片列表
      function renderDraftCards() {
        var listEl = overlay.querySelector('#tc-ai-drafts-list');
        var calendarState = (global.TimeCalendarApp && global.TimeCalendarApp.state) || { events: [] };
        var existingEvents = calendarState.events || [];
        var crossAppItems = [].concat(calendarState.lifeGameTasks || [], calendarState.studyRoomExams || []);

        // 重新运行确定性冲突检测
        var conflictReports = TimeCalendarAI.detectConflicts(currentDrafts, existingEvents, crossAppItems);

        var html = '';
        currentDrafts.forEach(function(draft, idx) {
          var reportObj = conflictReports.find(function(r) { return r.draftId === draft.id; });
          var report = reportObj ? reportObj.report : { hasConflict: false, severity: 'none', conflicts: [] };

          var badgeClass = 'tc-conflict-none';
          var badgeText = '✓ 时段充裕无冲突';
          var badgeIcon = 'fa-check';

          if (report.severity === 'hard') {
            badgeClass = 'tc-conflict-hard';
            badgeText = '⚠️ 存在时间冲突';
            badgeIcon = 'fa-triangle-exclamation';
          } else if (report.severity === 'soft') {
            badgeClass = 'tc-conflict-soft';
            badgeText = '⚡ 紧凑安排 / 休息时段';
            badgeIcon = 'fa-clock';
          } else if (draft.needsConfirmation) {
            badgeClass = 'tc-conflict-vague';
            badgeText = '❓ 待确认时间';
            badgeIcon = 'fa-circle-question';
          }

          var conflictsHtml = '';
          if (report.conflicts && report.conflicts.length > 0) {
            var hasAdjustable = report.conflicts.some(function(c) { return c.level === 'hard' || c.level === 'soft'; });
            conflictsHtml =
              '<div class="tc-draft-conflicts-box">' +
                report.conflicts.map(function(c) {
                  return '<div class="tc-draft-conflict-item ' + c.level + '"><i class="fa fa-info-circle"></i> <span>' + esc(c.reason) + ' (' + esc(c.timeRange) + ')</span></div>';
                }).join('') +
                (hasAdjustable ? (
                  '<div style="margin-top: 6px;">' +
                    '<button type="button" class="tc-btn-smart-adjust" data-draft-idx="' + idx + '"><i class="fa-solid fa-clock-rotate-left"></i> 一键采用推荐空闲时段</button>' +
                  '</div>'
                ) : '') +
              '</div>';
          }

          html +=
            '<div class="tc-ai-draft-card" data-idx="' + idx + '">' +
              '<div class="tc-draft-top-row">' +
                '<label class="tc-draft-checkbox-label">' +
                  '<input type="checkbox" class="tc-draft-select" data-draft-idx="' + idx + '" checked>' +
                  '<span style="font-weight: 600; font-size: 14px;">草案 ' + (idx + 1) + '</span>' +
                '</label>' +
                '<div class="tc-draft-badge ' + badgeClass + '">' +
                  '<i class="fa ' + badgeIcon + '" style="margin-right: 3px;"></i>' + badgeText +
                '</div>' +
                '<button type="button" class="tc-draft-del-btn" data-del-idx="' + idx + '" title="移除此草案"><i class="fa fa-trash"></i></button>' +
              '</div>' +

              '<div class="tc-draft-fields">' +
                '<div class="tc-form-group">' +
                  '<label class="tc-form-label">标题</label>' +
                  '<input type="text" class="tc-form-input tc-draft-input-title" data-draft-idx="' + idx + '" value="' + esc(draft.title) + '">' +
                '</div>' +

                '<div class="tc-form-row">' +
                  '<div class="tc-form-group">' +
                    '<label class="tc-form-label">日期</label>' +
                    '<input type="date" class="tc-form-input tc-draft-input-date" data-draft-idx="' + idx + '" value="' + esc(draft.date) + '">' +
                  '</div>' +
                  '<div class="tc-form-group">' +
                    '<label class="tc-form-label">分类</label>' +
                    '<select class="tc-form-select tc-draft-input-cat" data-draft-idx="' + idx + '">' +
                      '<option value="work" ' + (draft.category === 'work' ? 'selected' : '') + '>工作</option>' +
                      '<option value="study" ' + (draft.category === 'study' ? 'selected' : '') + '>学习</option>' +
                      '<option value="life" ' + (draft.category === 'life' ? 'selected' : '') + '>生活</option>' +
                      '<option value="love" ' + (draft.category === 'love' ? 'selected' : '') + '>恋爱</option>' +
                      '<option value="other" ' + (draft.category === 'other' ? 'selected' : '') + '>其他</option>' +
                    '</select>' +
                  '</div>' +
                '</div>' +

                '<div class="tc-toggle-row" style="margin-bottom: 6px;">' +
                  '<span class="tc-toggle-desc" style="font-size: 12px;">全天日程</span>' +
                  '<label class="tc-switch">' +
                    '<input type="checkbox" class="tc-draft-toggle-allday" data-draft-idx="' + idx + '" ' + (draft.isAllDay ? 'checked' : '') + '>' +
                    '<span class="tc-slider"></span>' +
                  '</label>' +
                '</div>' +

                '<div class="tc-form-row tc-draft-timerow" data-timerow-idx="' + idx + '" style="' + (draft.isAllDay ? 'display: none;' : '') + '">' +
                  '<div class="tc-form-group">' +
                    '<label class="tc-form-label">开始时间</label>' +
                    '<input type="time" class="tc-form-input tc-draft-input-start" data-draft-idx="' + idx + '" value="' + esc(draft.startTime || '09:00') + '">' +
                  '</div>' +
                  '<div class="tc-form-group">' +
                    '<label class="tc-form-label">结束时间</label>' +
                    '<input type="time" class="tc-form-input tc-draft-input-end" data-draft-idx="' + idx + '" value="' + esc(draft.endTime || '10:00') + '">' +
                  '</div>' +
                '</div>' +

                conflictsHtml +
              '</div>' +
            '</div>';
        });

        listEl.innerHTML = html;
        bindDraftInteractions();
      }

      function bindDraftInteractions() {
        // 输入改动即时同步
        overlay.querySelectorAll('.tc-draft-input-title').forEach(function(input) {
          input.addEventListener('input', function() {
            var idx = parseInt(input.dataset.draftIdx, 10);
            if (currentDrafts[idx]) currentDrafts[idx].title = input.value;
          });
        });

        overlay.querySelectorAll('.tc-draft-input-date').forEach(function(input) {
          input.addEventListener('change', function() {
            var idx = parseInt(input.dataset.draftIdx, 10);
            if (currentDrafts[idx]) {
              currentDrafts[idx].date = input.value;
              renderDraftCards();
            }
          });
        });

        overlay.querySelectorAll('.tc-draft-input-cat').forEach(function(sel) {
          sel.addEventListener('change', function() {
            var idx = parseInt(sel.dataset.draftIdx, 10);
            if (currentDrafts[idx]) currentDrafts[idx].category = sel.value;
          });
        });

        overlay.querySelectorAll('.tc-draft-toggle-allday').forEach(function(chk) {
          chk.addEventListener('change', function() {
            var idx = parseInt(chk.dataset.draftIdx, 10);
            if (currentDrafts[idx]) {
              currentDrafts[idx].isAllDay = chk.checked;
              renderDraftCards();
            }
          });
        });

        overlay.querySelectorAll('.tc-draft-input-start').forEach(function(input) {
          input.addEventListener('change', function() {
            var idx = parseInt(input.dataset.draftIdx, 10);
            if (currentDrafts[idx]) {
              currentDrafts[idx].startTime = input.value;
              renderDraftCards();
            }
          });
        });

        overlay.querySelectorAll('.tc-draft-input-end').forEach(function(input) {
          input.addEventListener('change', function() {
            var idx = parseInt(input.dataset.draftIdx, 10);
            if (currentDrafts[idx]) {
              currentDrafts[idx].endTime = input.value;
              renderDraftCards();
            }
          });
        });

        // 移除单项草案
        overlay.querySelectorAll('.tc-draft-del-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var idx = parseInt(btn.dataset.delIdx, 10);
            currentDrafts.splice(idx, 1);
            if (currentDrafts.length === 0) {
              overlay.querySelector('#tc-ai-drafts-container').style.display = 'none';
              overlay.querySelector('#tc-ai-sheet-footer').style.display = 'none';
            } else {
              renderDraftCards();
            }
          });
        });

        // 一键采用空闲时段
        overlay.querySelectorAll('.tc-btn-smart-adjust').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var idx = parseInt(btn.dataset.draftIdx, 10);
            var d = currentDrafts[idx];
            if (!d) return;

            var calendarState = (global.TimeCalendarApp && global.TimeCalendarApp.state) || { events: [] };
            var freeSlot = TimeCalendarAI.getFreeSlotSuggestion(d, calendarState.events);
            if (freeSlot) {
              d.date = freeSlot.date;
              d.startTime = freeSlot.startTime;
              d.endTime = freeSlot.endTime;
              d.isAllDay = false;
              renderDraftCards();
              if (window.toast) window.toast('已调整至 ' + freeSlot.reason);
            }
          });
        });
      }

      // 确认添加全部所选草案 (防重复提交 + 幂等安全 + 重新校验)
      var btnConfirm = overlay.querySelector('#tc-ai-btn-confirm-all');
      btnConfirm.addEventListener('click', async function() {
        if (isSubmitting) return;

        var selectedCheckboxes = overlay.querySelectorAll('.tc-draft-select:checked');
        if (selectedCheckboxes.length === 0) {
          if (window.toast) window.toast('请至少勾选一条日程');
          return;
        }

        var itemsToCreate = [];
        selectedCheckboxes.forEach(function(chk) {
          var idx = parseInt(chk.dataset.draftIdx, 10);
          if (currentDrafts[idx]) itemsToCreate.push(currentDrafts[idx]);
        });

        // 提交前快照安全复核：通过事件指纹精确比对内容、重复规则及跨 App 投影变动
        var calendarState = (global.TimeCalendarApp && global.TimeCalendarApp.state) || { events: [] };
        var curCrossApp = [].concat(calendarState.lifeGameTasks || [], calendarState.studyRoomExams || []);
        var currentFingerprint = computeCalendarFingerprint(calendarState.events, curCrossApp);

        if (currentFingerprint !== snapshotFingerprint) {
          var recheck = TimeCalendarAI.detectConflicts(itemsToCreate, calendarState.events, curCrossApp);
          var hasHard = recheck.some(function(r) { return r.report && r.report.severity === 'hard'; });
          if (hasHard) {
            if (window.toast) window.toast('检测到日历事件或跨 App 排期有更新且存在时间冲突，已为您刷新');
            snapshotFingerprint = currentFingerprint;
            renderDraftCards();
            return;
          }
        }

        isSubmitting = true;
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '<div class="tc-spinner-mini" style="display:inline-block; margin-right:4px;"></div> 正在写入日历...';

        try {
          var appEvents = calendarState.events || [];
          var createdCount = 0;
          var now = Date.now();

          for (var i = 0; i < itemsToCreate.length; i++) {
            var draftItem = itemsToCreate[i];
            var newEvent = {
              id: uid('tc_evt'),
              title: draftItem.title,
              date: draftItem.date,
              startTime: draftItem.isAllDay ? '' : draftItem.startTime,
              endTime: draftItem.isAllDay ? '' : draftItem.endTime,
              isAllDay: draftItem.isAllDay,
              category: draftItem.category || 'other',
              relationType: 'personal',
              charId: null,
              charName: '',
              recurrence: draftItem.recurrence || { type: 'none' },
              reminders: draftItem.reminderRules || [{ id: uid('rule'), advanceMinutes: 15, enabled: true }],
              reminderRules: draftItem.reminderRules || [{ id: uid('rule'), advanceMinutes: 15, enabled: true }],
              notes: draftItem.notes || '',
              completed: false,
              createdAt: now,
              updatedAt: now,
              source: { app: 'timeCalendar', isAIGenerated: true }
            };

            appEvents.push(newEvent);
            createdCount++;

            // 注册提醒系统
            if (window.TimeCalendarReminders && typeof window.TimeCalendarReminders.onEventCreated === 'function') {
              try { await window.TimeCalendarReminders.onEventCreated(newEvent); } catch (_) {}
            }
          }

          // 持久化保存
          if (window.db && db.config) {
            await db.config.put({ key: STORAGE_KEYS.EVENTS, value: appEvents });
          }
          try {
            localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(appEvents));
          } catch (_) {}

          // 刷新视图
          if (global.TimeCalendarApp && typeof global.TimeCalendarApp.refreshActiveTab === 'function') {
            global.TimeCalendarApp.refreshActiveTab();
          }

          overlay.remove();
          if (window.toast) window.toast('成功添加 ' + createdCount + ' 条日程 ✨');

        } catch (saveErr) {
          console.error('[TimeCalendarAI] save error:', saveErr);
          btnConfirm.disabled = false;
          btnConfirm.innerHTML = '重试添加';
          if (window.toast) window.toast('保存失败，请重试');
        } finally {
          isSubmitting = false;
        }
      });
    },

    // 6.5 动态冲突调整弹窗 (Dynamic Conflict Diff & Adjustment Modal)
    showConflictAdjustmentModal: function(conflictedEvent, options) {
      options = options || {};
      var old = document.getElementById('tc-conflict-adjust-modal');
      if (old) old.remove();

      var calendarState = (global.TimeCalendarApp && global.TimeCalendarApp.state) || { events: [] };
      var freeSlot = TimeCalendarAI.getFreeSlotSuggestion(conflictedEvent, calendarState.events);

      var overlay = document.createElement('div');
      overlay.id = 'tc-conflict-adjust-modal';
      overlay.className = 'tc-modal-overlay';

      var origTime = conflictedEvent.isAllDay ? '全天' : ((conflictedEvent.startTime || '--:--') + ' ~ ' + (conflictedEvent.endTime || '--:--'));
      var newTime = (freeSlot.startTime || '--:--') + ' ~ ' + (freeSlot.endTime || '--:--');

      overlay.innerHTML =
        '<div class="tc-modal-dialog" style="max-width: 360px;">' +
          '<div class="tc-modal-header">' +
            '<div class="tc-modal-title" style="display: flex; align-items: center; gap: 6px; color: #f59e0b;">' +
              '<i class="fa-solid fa-triangle-exclamation"></i><span>发现时间冲突</span>' +
            '</div>' +
            '<button class="tc-modal-close-btn" id="tc-conflict-close"><i class="fa fa-xmark"></i></button>' +
          '</div>' +
          '<div class="tc-modal-body" style="padding: 16px;">' +
            '<div style="font-size: 13px; color: var(--c-text-muted); margin-bottom: 12px; line-height: 1.5;">' +
              '日程「<strong>' + esc(conflictedEvent.title) + '</strong>」与已有排期冲突。AI 已根据您的空闲时段计算出最佳调整方案：' +
            '</div>' +

            '<div class="tc-diff-card">' +
              '<div class="tc-diff-row orig">' +
                '<span class="tc-diff-label">原定安排</span>' +
                '<span class="tc-diff-val">' + esc(conflictedEvent.date) + ' ' + origTime + '</span>' +
              '</div>' +
              '<div class="tc-diff-arrow"><i class="fa fa-arrow-down"></i></div>' +
              '<div class="tc-diff-row prop">' +
                '<span class="tc-diff-label">建议调整</span>' +
                '<span class="tc-diff-val" style="color: #10b981; font-weight: 600;">' + esc(freeSlot.date) + ' ' + newTime + '</span>' +
              '</div>' +
            '</div>' +

            '<div style="font-size: 12px; color: var(--c-text-muted); margin-top: 10px; line-height: 1.5;">' +
              '<i class="fa-solid fa-lightbulb" style="color: #f59e0b; margin-right: 4px;"></i>' + esc(freeSlot.reason) + '，提醒时间将同步平移。' +
            '</div>' +
          '</div>' +

          '<div class="tc-modal-footer">' +
            '<button class="tc-btn" id="tc-btn-keep-orig">仍保留原时间</button>' +
            '<button class="tc-btn tc-btn-primary" id="tc-btn-apply-slot">采纳调整建议</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      overlay.querySelector('#tc-conflict-close').addEventListener('click', function() { overlay.remove(); });
      overlay.querySelector('#tc-btn-keep-orig').addEventListener('click', function() {
        overlay.remove();
        if (typeof options.onKeep === 'function') options.onKeep();
      });

      overlay.querySelector('#tc-btn-apply-slot').addEventListener('click', function() {
        overlay.remove();
        if (typeof options.onApply === 'function') {
          options.onApply(freeSlot);
        }
      });
    },

    checkEventConflict: function(targetEvent, existingEvents, crossAppItems, preferences) {
      return TimeConflictEngine.checkEventConflict(targetEvent, existingEvents, crossAppItems, preferences);
    },
    getPreferences: getAiPreferencesSync,
    loadPreferences: loadAiPreferences,
    setPreferences: saveAiPreferences,
    computeCalendarFingerprint: computeCalendarFingerprint,
    computeFingerprint: computeCalendarFingerprint,
    validateAndNormalizeDrafts: validateAndNormalizeDrafts
  };

  // 暴露全局命名空间
  global.TimeCalendarAI = TimeCalendarAI;

})(typeof window !== 'undefined' ? window : this);
