// js/time-calendar-reminders.js — 时光日历智能提醒系统 (阶段 2)
// 包含提醒调度核心、多提醒规则、重复事件发生序列、免打扰(DND)、稍后提醒(Snooze)、
// 持久化执行日志与防重复机制、小手机通知与 Android/Capacitor 适配。

(function() {
  'use strict';

  // ===== 常量与存储键名 =====
  var REMINDER_KEYS = {
    EVENTS: 'time_calendar_events',
    SETTINGS: 'time_calendar_settings',
    LOGS: 'time_calendar_reminder_logs'
  };

  // 默认免打扰与提醒配置
  var DEFAULT_SETTINGS = {
    allDayReminderTime: '09:00', // 全天事件默认提醒时间
    dndEnabled: false,           // 免打扰开关
    dndStart: '23:00',           // 免打扰开始时间
    dndEnd: '08:00',             // 免打扰结束时间
    dndAction: 'defer',          // 'defer' (顺延到免打扰结束) | 'silent' (静默计入记录)
    soundEnabled: true,          // 提醒音效开关 (Web Audio 柔和铃音)
    vibrateEnabled: true         // 震动提示
  };

  // 常用提前提醒选项 (分钟数映射)
  var ADVANCE_OPTIONS = [
    { label: '事件开始时', minutes: 0 },
    { label: '提前 5 分钟', minutes: 5 },
    { label: '提前 15 分钟', minutes: 15 },
    { label: '提前 30 分钟', minutes: 30 },
    { label: '提前 1 小时', minutes: 60 },
    { label: '提前 1 天', minutes: 1440 },
    { label: '提前 3 天', minutes: 4320 }
  ];

  // ===== 本地日期与时间工具 =====
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

  function formatLocalTime(d) {
    var dateObj = d instanceof Date ? d : new Date();
    var h = String(dateObj.getHours()).padStart(2, '0');
    var m = String(dateObj.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }

  function parseDateTime(dateStr, timeStr) {
    var d = parseLocalDate(dateStr);
    if (!d) return null;
    var t = timeStr || '09:00';
    var parts = t.split(':');
    var hh = parseInt(parts[0], 10) || 0;
    var mm = parseInt(parts[1], 10) || 0;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
  }

  function uid(prefix) {
    return (prefix || 'rem') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ===== 存储访问 =====
  async function loadStorage(key, fallback) {
    try {
      if (window.db && window.db.config) {
        var row = await window.db.config.get(key);
        if (row && row.value !== undefined) return row.value;
      }
    } catch (e) {
      console.warn('[TimeCalendarReminders] loadStorage error for', key, e);
    }
    try {
      var item = localStorage.getItem(key);
      if (item !== null) return JSON.parse(item);
    } catch (_) {}
    return fallback;
  }

  async function saveStorage(key, value) {
    try {
      if (window.db && window.db.config) {
        await window.db.config.put({ key: key, value: value });
      }
    } catch (e) {
      console.warn('[TimeCalendarReminders] saveStorage error for', key, e);
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  // ===== 柔和声音与震动反馈 =====
  function playReminderChime() {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var ctx = new AudioCtx();
      var now = ctx.currentTime;

      // 简谐两音阶清脆提示 (C5 -> G5)
      var osc1 = ctx.createOscillator();
      var gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      var osc2 = ctx.createOscillator();
      var gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now + 0.15); // G5
      gain2.gain.setValueAtTime(0.15, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.6);
    } catch (err) {
      // 浏览器未交互时静默
    }
  }

  function triggerVibrate() {
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate([120, 80, 160]);
      }
    } catch (_) {}
  }

  // ===== 调度器核心状态 =====
  var _remindersState = {
    settings: Object.assign({}, DEFAULT_SETTINGS),
    logs: {}, // occurrenceKey -> { status, deliveredAt, snoozeUntil, ruleId, eventId, occurrenceDate }
    pollTimer: null,
    isChecking: false,
    activeBannerEl: null
  };

  // ===== 1. 重复事件发生序列算法 =====
  // 根据事件的 recurrence 配置，计算在 [rangeStart, rangeEnd] 日期范围内的全部 occurrence 日期
  function getEventOccurrencesInRange(ev, rangeStartDateStr, rangeEndDateStr) {
    var baseDateStr = ev.date;
    if (!baseDateStr) return [];
    var r = ev.recurrence;
    var baseDate = parseLocalDate(baseDateStr);
    var rangeStart = parseLocalDate(rangeStartDateStr);
    var rangeEnd = parseLocalDate(rangeEndDateStr);
    if (!baseDate || !rangeStart || !rangeEnd) return [baseDateStr];

    // 非重复事件
    if (!r || !r.type || r.type === 'none') {
      if (baseDate >= rangeStart && baseDate <= rangeEnd) {
        return [baseDateStr];
      }
      return [];
    }

    var occurrences = [];
    var recType = r.type; // 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
    var interval = parseInt(r.interval, 10) || 1;
    var repeatUntilDate = r.endDate ? parseLocalDate(r.endDate) : null;

    // 起点从 baseDate 开始迭代
    var cur = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    var maxCount = 200; // 防死循环安全保护
    var count = 0;

    while (cur <= rangeEnd && count < maxCount) {
      count++;
      if (repeatUntilDate && cur > repeatUntilDate) break;

      if (cur >= rangeStart && cur <= rangeEnd) {
        occurrences.push(formatLocalDate(cur));
      }

      // 下一次步进
      if (recType === 'daily') {
        cur.setDate(cur.getDate() + interval);
      } else if (recType === 'weekly') {
        cur.setDate(cur.getDate() + (7 * interval));
      } else if (recType === 'monthly') {
        var stepMonths = count * interval;
        var totalMonths = baseDate.getFullYear() * 12 + baseDate.getMonth() + stepMonths;
        var y = Math.floor(totalMonths / 12);
        var m = totalMonths % 12;
        var maxDayInTargetMonth = new Date(y, m + 1, 0).getDate();
        var d = Math.min(baseDate.getDate(), maxDayInTargetMonth);
        cur = new Date(y, m, d);
      } else if (recType === 'yearly') {
        var yStep = baseDate.getFullYear() + (count * interval);
        var maxD = new Date(yStep, baseDate.getMonth() + 1, 0).getDate();
        cur = new Date(yStep, baseDate.getMonth(), Math.min(baseDate.getDate(), maxD));
      } else if (recType === 'custom') {
        var days = parseInt(r.customDays, 10) || interval;
        cur.setDate(cur.getDate() + days);
      } else {
        break;
      }
    }

    return occurrences;
  }

  // ===== 2. 免打扰 (DND) 判断与时间修正 =====
  function isWithinDND(nowDate, settings) {
    if (!settings.dndEnabled) return false;
    var startParts = (settings.dndStart || '23:00').split(':');
    var endParts = (settings.dndEnd || '08:00').split(':');
    var sh = parseInt(startParts[0], 10);
    var sm = parseInt(startParts[1], 10);
    var eh = parseInt(endParts[0], 10);
    var em = parseInt(endParts[1], 10);

    var curMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
    var startMinutes = sh * 60 + sm;
    var endMinutes = eh * 60 + em;

    if (startMinutes <= endMinutes) {
      // 当天区间，如 13:00 到 14:00
      return curMinutes >= startMinutes && curMinutes < endMinutes;
    } else {
      // 跨天区间，如 23:00 到 次日 08:00
      return curMinutes >= startMinutes || curMinutes < endMinutes;
    }
  }

  function getDndNextAvailableTime(nowDate, settings) {
    var endParts = (settings.dndEnd || '08:00').split(':');
    var eh = parseInt(endParts[0], 10);
    var em = parseInt(endParts[1], 10);
    var target = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), eh, em, 0, 0);
    if (target.getTime() <= nowDate.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime();
  }

  // ===== 3. 解析事件提醒项并提取调度任务 =====
  function extractEventReminderRules(ev) {
    var rules = [];
    if (!ev) return rules;

    // 格式 1: 新多提醒 rules 数组: [{ id, advanceMinutes, enabled }]
    if (Array.isArray(ev.reminders) && ev.reminders.length > 0) {
      ev.reminders.forEach(function(r) {
        if (r && r.enabled !== false) {
          rules.push({
            id: r.id || uid('rule'),
            advanceMinutes: typeof r.advanceMinutes === 'number' ? r.advanceMinutes : 15,
            enabled: true
          });
        }
      });
    } else if (ev.reminder && ev.reminder.enabled) {
      // 格式 2: 阶段 1 预留的单提醒格式
      rules.push({
        id: 'legacy_rule',
        advanceMinutes: typeof ev.reminder.advanceMinutes === 'number' ? ev.reminder.advanceMinutes : 15,
        enabled: true
      });
    }

    return rules;
  }

  // 生成一个独立发生项的唯一 key (事件ID + 发生日期 + 提醒规则ID)
  function makeOccurrenceKey(eventId, occurrenceDateStr, ruleId) {
    return eventId + '__' + occurrenceDateStr + '__' + ruleId;
  }

  // ===== 4. 提醒调度核心巡检 =====
  async function checkReminders() {
    if (_remindersState.isChecking) return;
    _remindersState.isChecking = true;

    try {
      var events = await loadStorage(REMINDER_KEYS.EVENTS, []);
      if (!Array.isArray(events) || events.length === 0) {
        _remindersState.isChecking = false;
        return;
      }

      var now = Date.now();
      var nowDate = new Date(now);
      var todayStr = getTodayLocalDateStr();

      // 扫描过去 2 天至未来 7 天的发生范围
      var rangeStartObj = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 2);
      var rangeEndObj = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + 7);
      var rangeStartStr = formatLocalDate(rangeStartObj);
      var rangeEndStr = formatLocalDate(rangeEndObj);

      var logsUpdated = false;
      var inDnd = isWithinDND(nowDate, _remindersState.settings);

      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        if (ev.completed) continue; // 已完成日程不提醒

        var rules = extractEventReminderRules(ev);
        if (rules.length === 0) continue;

        var occurrences = getEventOccurrencesInRange(ev, rangeStartStr, rangeEndStr);
        for (var o = 0; o < occurrences.length; o++) {
          var occDateStr = occurrences[o];

          // 计算此发生项的基础开始时间
          var timeStr = ev.isAllDay ? (_remindersState.settings.allDayReminderTime || '09:00') : (ev.startTime || '09:00');
          var eventStartTime = parseDateTime(occDateStr, timeStr);
          if (!eventStartTime) continue;

          for (var r = 0; r < rules.length; r++) {
            var rule = rules[r];
            var key = makeOccurrenceKey(ev.id, occDateStr, rule.id);
            var log = _remindersState.logs[key];

            // 目标触发时间
            var targetTimeMs = eventStartTime.getTime() - (rule.advanceMinutes * 60 * 1000);

            // 检查稍后提醒 (Snooze)
            if (log && log.status === 'snoozed' && log.snoozeUntil) {
              targetTimeMs = log.snoozeUntil;
            }

            // 1. 如果已处理 (delivered 或 dismissed)，跳过
            if (log && (log.status === 'delivered' || log.status === 'dismissed')) {
              continue;
            }

            // 2. 如果已过期较久 (> 30分钟前) 且从未触发过，标记为 missed/expired，避免开屏狂弹几十条
            if (!log && now - targetTimeMs > 30 * 60 * 1000) {
              _remindersState.logs[key] = {
                status: 'missed',
                deliveredAt: 0,
                ruleId: rule.id,
                eventId: ev.id,
                occurrenceDate: occDateStr,
                scheduledAt: targetTimeMs,
                missedAt: now
              };
              logsUpdated = true;
              continue;
            }

            // 3. 达到提醒时间判定区间 (-15秒 <= target <= now + 60秒，或在过去24小时内未触发)
            if (now >= targetTimeMs) {
              // 处于免打扰模式
              if (inDnd) {
                if (_remindersState.settings.dndAction === 'defer') {
                  // 顺延至 DND 结束时间
                  var nextAvailable = getDndNextAvailableTime(nowDate, _remindersState.settings);
                  _remindersState.logs[key] = {
                    status: 'snoozed',
                    snoozeUntil: nextAvailable,
                    ruleId: rule.id,
                    eventId: ev.id,
                    occurrenceDate: occDateStr,
                    scheduledAt: targetTimeMs,
                    dndDeferred: true
                  };
                  logsUpdated = true;
                  continue;
                } else if (_remindersState.settings.dndAction === 'silent') {
                  // 静默计入已触发，不发系统弹窗与音效
                  _remindersState.logs[key] = {
                    status: 'delivered',
                    deliveredAt: now,
                    ruleId: rule.id,
                    eventId: ev.id,
                    occurrenceDate: occDateStr,
                    scheduledAt: targetTimeMs,
                    silent: true
                  };
                  logsUpdated = true;
                  continue;
                }
              }

              // 正常触发提醒！
              await dispatchReminderNotification(ev, occDateStr, rule, targetTimeMs, key);
              _remindersState.logs[key] = {
                status: 'delivered',
                deliveredAt: now,
                ruleId: rule.id,
                eventId: ev.id,
                occurrenceDate: occDateStr,
                scheduledAt: targetTimeMs
              };
              logsUpdated = true;
            }
          }
        }
      }

      // 清理超过 30 天的陈旧日志
      var thirtyDaysAgo = now - (30 * 86400000);
      Object.keys(_remindersState.logs).forEach(function(k) {
        var entry = _remindersState.logs[k];
        if (entry && (entry.deliveredAt || entry.scheduledAt || 0) < thirtyDaysAgo) {
          delete _remindersState.logs[k];
          logsUpdated = true;
        }
      });

      if (logsUpdated) {
        await saveStorage(REMINDER_KEYS.LOGS, _remindersState.logs);
      }
    } catch (err) {
      console.warn('[TimeCalendarReminders] checkReminders error:', err);
    } finally {
      _remindersState.isChecking = false;
    }
  }

  // ===== 5. 分发提醒通知 (Web通知 / Android Capacitor / App 内弹层) =====
  async function dispatchReminderNotification(ev, occDateStr, rule, scheduledAt, occurrenceKey) {
    var title = '日程提醒 · ' + (ev.title || '无标题日程');
    var timeDesc = ev.isAllDay ? (occDateStr + ' 全天') : (occDateStr + ' ' + (ev.startTime || '09:00'));
    var advanceText = '';
    if (rule.advanceMinutes === 0) {
      advanceText = '现在开始';
    } else if (rule.advanceMinutes < 60) {
      advanceText = rule.advanceMinutes + ' 分钟后开始';
    } else if (rule.advanceMinutes < 1440) {
      advanceText = Math.round(rule.advanceMinutes / 60) + ' 小时后开始';
    } else {
      advanceText = Math.round(rule.advanceMinutes / 1440) + ' 天后开始';
    }

    var body = timeDesc + ' (' + advanceText + ')' + (ev.notes ? ('\n' + ev.notes) : '');

    // 1. Android Capacitor 原生本地通知适配
    var sentNative = false;
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        var notifId = Math.abs((occurrenceKey.split('').reduce(function(a, b) { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0))) % 1000000;
        await window.Capacitor.Plugins.LocalNotifications.schedule({
          notifications: [
            {
              id: notifId,
              title: title,
              body: body,
              extra: { eventId: ev.id, occurrenceKey: occurrenceKey },
              smallIcon: 'ic_stat_name'
            }
          ]
        });
        sentNative = true;
      }
    } catch (capErr) {
      console.warn('[TimeCalendarReminders] Capacitor LocalNotifications error:', capErr);
    }

    // 2. 弯弯系统级 Web / Service Worker 通知
    if (!sentNative && window.sendWanWanNotification) {
      try {
        await window.sendWanWanNotification(body, {
          title: title,
          tag: 'tc-remind-' + occurrenceKey,
          data: {
            url: './#time-calendar',
            app: 'timeCalendar',
            eventId: ev.id,
            occurrenceKey: occurrenceKey
          }
        });
      } catch (swErr) {
        console.warn('[TimeCalendarReminders] sendWanWanNotification error:', swErr);
      }
    }

    // 3. 柔和音效与触觉反馈
    if (_remindersState.settings.soundEnabled) {
      playReminderChime();
    }
    if (_remindersState.settings.vibrateEnabled) {
      triggerVibrate();
    }

    // 4. 应用内高保真顶部悬浮横幅 (支持免打扰、稍后提醒和立即查看)
    showInAppReminderBanner(ev, occDateStr, advanceText, occurrenceKey);
  }

  // ===== 6. 应用内高保真顶部横幅卡片与稍后提醒交互 =====
  function showInAppReminderBanner(ev, occDateStr, advanceText, occurrenceKey) {
    if (_remindersState.activeBannerEl) {
      try { _remindersState.activeBannerEl.remove(); } catch (_) {}
      _remindersState.activeBannerEl = null;
    }

    var banner = document.createElement('div');
    banner.className = 'tc-reminder-banner';
    banner.setAttribute('role', 'alert');

    var catLabel = {
      work: '工作',
      study: '学习',
      life: '生活',
      love: '恋爱',
      anniversary: '纪念',
      other: '其他'
    }[ev.category] || '日程';

    banner.innerHTML =
      '<div class="tc-reminder-banner-inner">' +
        '<div class="tc-reminder-banner-icon">' +
          '<i class="fa-solid fa-bell"></i>' +
        '</div>' +
        '<div class="tc-reminder-banner-content">' +
          '<div class="tc-reminder-banner-title-row">' +
            '<span class="tc-reminder-banner-title">' + esc(ev.title) + '</span>' +
            '<span class="tc-reminder-banner-tag">' + catLabel + '</span>' +
          '</div>' +
          '<div class="tc-reminder-banner-desc">' +
            '<span><i class="fa-regular fa-clock" style="font-size: 11px;"></i> ' + esc(occDateStr) + ' ' + (ev.isAllDay ? '全天' : (ev.startTime || '09:00')) + ' · ' + esc(advanceText) + '</span>' +
            (ev.notes ? ('<div class="tc-reminder-banner-notes">' + esc(ev.notes) + '</div>') : '') +
          '</div>' +
        '</div>' +
        '<div class="tc-reminder-banner-actions">' +
          '<button class="tc-reminder-btn tc-reminder-btn-snooze" id="tc-banner-btn-snooze" title="稍后提醒">' +
            '<i class="fa-solid fa-clock-rotate-left"></i><span>稍后</span>' +
          '</button>' +
          '<button class="tc-reminder-btn tc-reminder-btn-view" id="tc-banner-btn-view" title="查看日程">' +
            '<i class="fa-solid fa-arrow-right"></i>' +
          '</button>' +
          '<button class="tc-reminder-btn tc-reminder-btn-close" id="tc-banner-btn-dismiss" title="关闭">' +
            '<i class="fa-solid fa-xmark"></i>' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(banner);
    _remindersState.activeBannerEl = banner;
    _remindersState.activeBannerEventId = ev.id;

    // 触发动画
    requestAnimationFrame(function() {
      banner.classList.add('visible');
    });

    // 绑定交互
    var dismissBtn = banner.querySelector('#tc-banner-btn-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeBanner();
      });
    }

    var snoozeBtn = banner.querySelector('#tc-banner-btn-snooze');
    if (snoozeBtn) {
      snoozeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        showSnoozePickerModal(occurrenceKey, ev.title);
        closeBanner();
      });
    }

    var viewBtn = banner.querySelector('#tc-banner-btn-view');
    if (viewBtn) {
      viewBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeBanner();
        if (window.TimeCalendarApp && typeof window.TimeCalendarApp.open === 'function') {
          window.TimeCalendarApp.open({ eventId: ev.id, date: occDateStr });
        }
      });
    }

    function closeBanner() {
      if (!banner) return;
      banner.classList.remove('visible');
      setTimeout(function() {
        try { banner.remove(); } catch (_) {}
        if (_remindersState.activeBannerEl === banner) {
          _remindersState.activeBannerEl = null;
          _remindersState.activeBannerEventId = null;
        }
      }, 300);
    }

    // 15 秒后自动平滑收起
    setTimeout(function() {
      closeBanner();
    }, 15000);
  }

  // 稍后提醒 (Snooze) 快捷弹窗
  function showSnoozePickerModal(occurrenceKey, eventTitle) {
    var overlay = document.createElement('div');
    overlay.className = 'tc-modal-overlay';
    overlay.innerHTML =
      '<div class="tc-modal-dialog tc-snooze-dialog">' +
        '<div class="tc-modal-header">' +
          '<div class="tc-modal-title"><i class="fa-solid fa-clock-rotate-left" style="margin-right: 6px;"></i>稍后提醒</div>' +
          '<button class="tc-modal-close-btn" id="tc-snooze-close"><i class="fa fa-xmark"></i></button>' +
        '</div>' +
        '<div class="tc-modal-body">' +
          '<div style="font-size: 13px; color: var(--c-text-muted); margin-bottom: 12px;">' +
            '为「' + esc(eventTitle || '当前日程') + '」延后提醒时间：' +
          '</div>' +
          '<div class="tc-snooze-options-grid">' +
            '<button class="tc-snooze-chip" data-mins="5">5 分钟后</button>' +
            '<button class="tc-snooze-chip" data-mins="10">10 分钟后</button>' +
            '<button class="tc-snooze-chip active" data-mins="15">15 分钟后</button>' +
            '<button class="tc-snooze-chip" data-mins="30">30 分钟后</button>' +
            '<button class="tc-snooze-chip" data-mins="60">1 小时后</button>' +
            '<button class="tc-snooze-chip" data-mins="1440">明天同一时间</button>' +
          '</div>' +
          '<div class="tc-custom-snooze-row">' +
            '<span style="font-size: 12px; color: var(--c-text-muted);">自定义延迟：</span>' +
            '<input type="number" id="tc-custom-snooze-val" class="tc-form-input" style="width: 70px; padding: 4px 8px; font-size: 13px;" min="1" max="1440" placeholder="分钟">' +
            '<button class="tc-btn" id="tc-custom-snooze-btn" style="padding: 4px 12px; font-size: 12px;">确定</button>' +
          '</div>' +
        '</div>' +
        '<div class="tc-modal-footer">' +
          '<button class="tc-btn" id="tc-snooze-cancel">取消</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector('#tc-snooze-close').addEventListener('click', function() { overlay.remove(); });
    overlay.querySelector('#tc-snooze-cancel').addEventListener('click', function() { overlay.remove(); });

    overlay.querySelectorAll('.tc-snooze-chip').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var mins = parseInt(btn.dataset.mins, 10);
        await applySnooze(occurrenceKey, mins);
        overlay.remove();
      });
    });

    var customBtn = overlay.querySelector('#tc-custom-snooze-btn');
    if (customBtn) {
      customBtn.addEventListener('click', async function() {
        var val = parseInt(overlay.querySelector('#tc-custom-snooze-val').value, 10);
        if (isNaN(val) || val <= 0) {
          alert('请输入有效的延迟分钟数');
          return;
        }
        await applySnooze(occurrenceKey, val);
        overlay.remove();
      });
    }
  }

  async function applySnooze(occurrenceKey, minutes) {
    var now = Date.now();
    var snoozeUntil = now + (minutes * 60 * 1000);
    _remindersState.logs[occurrenceKey] = Object.assign({}, _remindersState.logs[occurrenceKey] || {}, {
      status: 'snoozed',
      snoozeUntil: snoozeUntil,
      snoozedAt: now
    });
    await saveStorage(REMINDER_KEYS.LOGS, _remindersState.logs);
    if (window.toast) {
      window.toast('已延后 ' + minutes + ' 分钟提醒');
    }
  }

  // ===== 7. 提醒管理数据视图 (供 UI 层调用) =====
  // 返回四种状态分组: upcoming | delivered | expired | disabled
  async function getReminderManagementData() {
    var events = await loadStorage(REMINDER_KEYS.EVENTS, []);
    var now = Date.now();
    var todayStr = getTodayLocalDateStr();

    var rangeStartObj = new Date(Date.now() - (7 * 86400000));
    var rangeEndObj = new Date(Date.now() + (30 * 86400000));
    var rangeStartStr = formatLocalDate(rangeStartObj);
    var rangeEndStr = formatLocalDate(rangeEndObj);

    var list = [];

    events.forEach(function(ev) {
      var rules = extractEventReminderRules(ev);
      // 如果没有规则，但也检查是否曾有设置过但关闭了
      if (Array.isArray(ev.reminders)) {
        ev.reminders.forEach(function(r) {
          if (r && r.enabled === false) {
            list.push({
              key: ev.id + '__disabled__' + r.id,
              eventId: ev.id,
              eventTitle: ev.title,
              category: ev.category || 'other',
              occurrenceDate: ev.date,
              timeStr: ev.isAllDay ? '全天' : (ev.startTime || '09:00'),
              ruleId: r.id,
              advanceMinutes: r.advanceMinutes,
              status: 'disabled',
              statusLabel: '已关闭',
              scheduledAt: 0,
              isAllDay: ev.isAllDay,
              completed: !!ev.completed,
              recurrence: ev.recurrence
            });
          }
        });
      }

      if (rules.length === 0) return;

      var occurrences = getEventOccurrencesInRange(ev, rangeStartStr, rangeEndStr);
      occurrences.forEach(function(occDateStr) {
        var timeStr = ev.isAllDay ? (_remindersState.settings.allDayReminderTime || '09:00') : (ev.startTime || '09:00');
        var eventStartTime = parseDateTime(occDateStr, timeStr);
        if (!eventStartTime) return;

        rules.forEach(function(r) {
          var key = makeOccurrenceKey(ev.id, occDateStr, r.id);
          var log = _remindersState.logs[key];
          var scheduledAt = eventStartTime.getTime() - (r.advanceMinutes * 60 * 1000);

          var status = 'upcoming';
          var statusLabel = '即将提醒';

          if (ev.completed) {
            status = 'delivered';
            statusLabel = '日程已完成';
          } else if (log && log.status === 'snoozed' && log.snoozeUntil) {
            status = 'upcoming';
            statusLabel = '稍后提醒中 (' + formatLocalTime(new Date(log.snoozeUntil)) + ')';
            scheduledAt = log.snoozeUntil;
          } else if (log && log.status === 'delivered') {
            status = 'delivered';
            statusLabel = '已提醒 (' + formatLocalDate(new Date(log.deliveredAt)) + ' ' + formatLocalTime(new Date(log.deliveredAt)) + ')';
          } else if (log && log.status === 'dismissed') {
            status = 'delivered';
            statusLabel = '已确认关闭';
          } else if (log && log.status === 'missed') {
            status = 'expired';
            statusLabel = '已过期/错过';
          } else if (now > scheduledAt + (15 * 60 * 1000)) {
            status = 'expired';
            statusLabel = '已过期';
          }

          list.push({
            key: key,
            eventId: ev.id,
            eventTitle: ev.title,
            category: ev.category || 'other',
            occurrenceDate: occDateStr,
            timeStr: ev.isAllDay ? '全天' : (ev.startTime || '09:00'),
            ruleId: r.id,
            advanceMinutes: r.advanceMinutes,
            status: status,
            statusLabel: statusLabel,
            scheduledAt: scheduledAt,
            isAllDay: ev.isAllDay,
            completed: !!ev.completed,
            recurrence: ev.recurrence
          });
        });
      });
    });

    // 排序：即将提醒按时间升序；已提醒/已过期按时间降序
    list.sort(function(a, b) {
      return a.scheduledAt - b.scheduledAt;
    });

    return list;
  }

  // ===== 8. 对外公共控制方法 =====
  async function toggleRuleEnabled(eventId, ruleId, enabled) {
    var events = await loadStorage(REMINDER_KEYS.EVENTS, []);
    var ev = events.find(function(e) { return e.id === eventId; });
    if (!ev) return;
    if (Array.isArray(ev.reminders)) {
      var r = ev.reminders.find(function(item) { return item.id === ruleId; });
      if (r) {
        r.enabled = enabled;
        ev.updatedAt = Date.now();
        await saveStorage(REMINDER_KEYS.EVENTS, events);
        await checkReminders();
      }
    }
  }

  async function deleteRule(eventId, ruleId) {
    var events = await loadStorage(REMINDER_KEYS.EVENTS, []);
    var ev = events.find(function(e) { return e.id === eventId; });
    if (!ev) return;
    if (Array.isArray(ev.reminders)) {
      ev.reminders = ev.reminders.filter(function(item) { return item.id !== ruleId; });
      ev.updatedAt = Date.now();
      await saveStorage(REMINDER_KEYS.EVENTS, events);
    }
  }

  async function updateSettings(newSettings) {
    _remindersState.settings = Object.assign({}, _remindersState.settings, newSettings);
    await saveStorage(REMINDER_KEYS.SETTINGS, _remindersState.settings);
  }

  // 日程删除生命周期联动 (立即关闭悬浮横幅并清理该日程的执行日志)
  async function onEventDeleted(eventId) {
    if (_remindersState.activeBannerEl && _remindersState.activeBannerEventId === eventId) {
      try { _remindersState.activeBannerEl.remove(); } catch (_) {}
      _remindersState.activeBannerEl = null;
      _remindersState.activeBannerEventId = null;
    }

    var updated = false;
    Object.keys(_remindersState.logs).forEach(function(k) {
      if (k.indexOf(eventId + '__') === 0 || (_remindersState.logs[k] && _remindersState.logs[k].eventId === eventId)) {
        delete _remindersState.logs[k];
        updated = true;
      }
    });

    if (updated) {
      await saveStorage(REMINDER_KEYS.LOGS, _remindersState.logs);
    }
    await checkReminders();
  }

  // 日程修改生命周期联动 (清理失效孤立规则的日志并立即触发巡检)
  async function onEventUpdated(eventId, newDateStr, newRules) {
    var updated = false;
    var activeRuleIds = (newRules || []).map(function(r) { return r.id; });

    Object.keys(_remindersState.logs).forEach(function(k) {
      var entry = _remindersState.logs[k];
      if (entry && entry.eventId === eventId) {
        if (activeRuleIds.indexOf(entry.ruleId) < 0) {
          delete _remindersState.logs[k];
          updated = true;
        }
      }
    });

    if (updated) {
      await saveStorage(REMINDER_KEYS.LOGS, _remindersState.logs);
    }
    await checkReminders();
  }

  // 测试触发提醒 (用户在设置中点击时验证)
  async function testReminderNotification() {
    var mockEvent = {
      id: 'test_evt',
      title: '提醒系统测试日程',
      category: 'study',
      isAllDay: false,
      startTime: formatLocalTime(new Date()),
      notes: '恭喜！时光日历智能提醒系统运行正常。'
    };
    var mockRule = { id: 'test_rule', advanceMinutes: 0 };
    await dispatchReminderNotification(mockEvent, getTodayLocalDateStr(), mockRule, Date.now(), 'test_' + Date.now());
  }

  // ===== 9. 初始化与生命周期注册 =====
  async function init() {
    // 载入持久化设置
    var savedSettings = await loadStorage(REMINDER_KEYS.SETTINGS, null);
    if (savedSettings) {
      _remindersState.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);
    }

    // 载入持久化执行日志
    var savedLogs = await loadStorage(REMINDER_KEYS.LOGS, null);
    if (savedLogs) {
      _remindersState.logs = savedLogs;
    }

    // 首次立即巡检
    setTimeout(function() {
      checkReminders();
    }, 1500);

    // 周期性定时轮询 (每 20 秒巡检一次)
    if (_remindersState.pollTimer) clearInterval(_remindersState.pollTimer);
    _remindersState.pollTimer = setInterval(function() {
      checkReminders();
    }, 20000);

    // 监听页面前台唤醒与窗口可见性恢复
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        checkReminders();
      }
    });

    if (window.addEventListener) {
      window.addEventListener('focus', function() {
        checkReminders();
      });
    }

    // 监听 Service Worker 消息 (通知点击时页面定位)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function(event) {
        var msg = event.data || {};
        if (msg.type === 'wanwan-notification-click') {
          var data = msg.data || {};
          if (window.TimeCalendarApp && typeof window.TimeCalendarApp.open === 'function') {
            window.TimeCalendarApp.open({ eventId: data.eventId, date: data.occurrenceDate });
          }
        }
      });
    }

    console.log('[TimeCalendarReminders] 智能提醒系统已初始化就绪');
  }

  // 自动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 导出到 window
  window.TimeCalendarReminders = {
    init: init,
    checkReminders: checkReminders,
    getSettings: function() { return _remindersState.settings; },
    updateSettings: updateSettings,
    getReminderManagementData: getReminderManagementData,
    toggleRuleEnabled: toggleRuleEnabled,
    deleteRule: deleteRule,
    applySnooze: applySnooze,
    showSnoozePickerModal: showSnoozePickerModal,
    testReminderNotification: testReminderNotification,
    onEventDeleted: onEventDeleted,
    onEventUpdated: onEventUpdated,
    ADVANCE_OPTIONS: ADVANCE_OPTIONS,
    extractEventReminderRules: extractEventReminderRules,
    getEventOccurrencesInRange: getEventOccurrencesInRange
  };

})();
