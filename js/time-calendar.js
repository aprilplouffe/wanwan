// js/time-calendar.js — 时光日历独立 App (阶段 1 基础版)
// 包含基础日历、月/周/日三视图、日程管理、倒计时、纪念日、多 Char 隔离以及恋爱记与自习室只读联动

(function() {
  'use strict';

  // ===== 常量与配置键名 (独立保存于 db.config，绝不覆盖其他已有键) =====
  var STORAGE_KEYS = {
    EVENTS: 'time_calendar_events',
    ANNIVERSARIES: 'time_calendar_anniversaries',
    COUNTDOWNS: 'time_calendar_countdowns',
    SETTINGS: 'time_calendar_settings',
    CHAR_SETTINGS: 'time_calendar_char_settings'
  };

  // 联动源数据键名 (只读读取)
  var LINKAGE_KEYS = {
    LOVE_DIARY: 'coupleSpaceSettings',
    STUDY_RECORDS: 'wanwan_study_records',
    STUDY_TODOS: 'wanwan_study_todos'
  };

  // ===== 本地日期纯算法核心 (坚决避免 UTC 偏移造成日期差 1 天) =====
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

  // 计算本地日期差 (targetDate - baseDate)
  // 0: 就是今天; >0: 还有 X 天; <0: 已过去 X 天
  function getLocalDaysDiff(targetDateStr, baseDateStr) {
    var tDate = parseLocalDate(targetDateStr);
    var bDate = baseDateStr ? parseLocalDate(baseDateStr) : parseLocalDate(getTodayLocalDateStr());
    if (!tDate || !bDate) return 0;
    var tMs = Date.UTC(tDate.getFullYear(), tDate.getMonth(), tDate.getDate());
    var bMs = Date.UTC(bDate.getFullYear(), bDate.getMonth(), bDate.getDate());
    return Math.round((tMs - bMs) / 86400000);
  }

  function getWeekdayName(dateStr, short) {
    var d = parseLocalDate(dateStr);
    if (!d) return '';
    var names = short ? ['日', '一', '二', '三', '四', '五', '六'] : ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return names[d.getDay()];
  }

  function uid(prefix) {
    return (prefix || 'tc') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
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

  // ===== 持久化层 (优先 db.config，安全降级 localStorage) =====
  async function loadConfigKey(key, fallback) {
    try {
      if (window.db && db.config) {
        var row = await db.config.get(key);
        if (row && row.value !== undefined) return row.value;
      }
    } catch (e) {
      console.warn('[TimeCalendar] loadConfigKey error for', key, e);
    }
    try {
      var item = localStorage.getItem(key);
      if (item !== null) return JSON.parse(item);
    } catch (_) {}
    return fallback;
  }

  async function saveConfigKey(key, value) {
    try {
      if (window.db && db.config) {
        await db.config.put({ key: key, value: value });
      }
    } catch (e) {
      console.warn('[TimeCalendar] saveConfigKey error for', key, e);
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  // ===== 状态管理 =====
  var _state = {
    // 页面活跃 Tab: 'calendar' (日历) | 'countdowns' (倒计时) | 'anniversaries' (纪念日) | 'schedules' (日程)
    activeTab: 'calendar',
    // 日历视图: 'month' (月视图) | 'week' (周视图) | 'day' (日视图)
    calendarView: 'month',
    // 浏览指针年月与选定日期 (本地字符串)
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth() + 1, // 1 - 12
    selectedDateStr: getTodayLocalDateStr(),
    // 过滤与角色关联
    filterCharId: 'all', // 'all' (全部) | 'personal' (仅个人) | charId (特定角色)
    activeChar: null, // 当前系统伴侣角色
    allCharacters: [], // 所有角色列表
    // 业务数据池
    events: [],
    anniversaries: [],
    countdowns: [],
    settings: {
      defaultView: 'month',
      firstDayOfWeek: 1,
      showStudyRoomRecords: true,
      showLoveDiaryAnniversaries: true
    },
    // 阶段 3 跨软件双向联动数据池
    loveDiaryAnniversaries: [],
    loveDiaryWishes: [],
    studyRoomTodos: [],
    studyRoomExams: [],
    studyRoomRecordsMap: {}, // 'YYYY-MM-DD' -> { totalMinutes, count, records }
    studyRoomTodosMap: {}, // 'YYYY-MM-DD' -> [ todos ]
    // 倒计时与日程筛选条件
    countdownCategoryFilter: 'all',
    scheduleSearchQuery: '',
    scheduleCategoryFilter: 'all',
    scheduleStatusFilter: 'all', // 'all' | 'pending' | 'completed'
    // UI 引用
    pageEl: null
  };

  // ===== 周年与倒计时核心计算 =====
  function computeAnniversaryMilestone(startDateStr, baseDateStr) {
    var todayStr = baseDateStr || getTodayLocalDateStr();
    var diff = getLocalDaysDiff(todayStr, startDateStr);
    var daysPassed = Math.max(1, diff + 1); // 相守第 1 天开始计算

    var sDate = parseLocalDate(startDateStr);
    var bDate = parseLocalDate(todayStr);
    if (!sDate || !bDate) {
      return { daysPassed: daysPassed, nextYears: 1, daysToNext: 0, nextDateStr: todayStr };
    }

    var startYear = sDate.getFullYear();
    var curYear = bDate.getFullYear();

    // 计算当年的周年日期
    var thisYearTargetStr = curYear + '-' + String(sDate.getMonth() + 1).padStart(2, '0') + '-' + String(sDate.getDate()).padStart(2, '0');
    var daysToThisYear = getLocalDaysDiff(thisYearTargetStr, todayStr);

    var targetYears = curYear - startYear;
    var nextDateStr = thisYearTargetStr;
    var daysToNext = daysToThisYear;

    if (daysToThisYear < 0) {
      // 当年已过，算下一年
      targetYears = (curYear + 1) - startYear;
      nextDateStr = (curYear + 1) + '-' + String(sDate.getMonth() + 1).padStart(2, '0') + '-' + String(sDate.getDate()).padStart(2, '0');
      daysToNext = getLocalDaysDiff(nextDateStr, todayStr);
    } else if (daysToThisYear === 0) {
      // 今天正好是周年日！
      targetYears = curYear - startYear;
      daysToNext = 0;
    }

    // 百天纪念节点 (100, 200, 300, 500, 1000...)
    var nextHundred = Math.ceil(daysPassed / 100) * 100;
    if (nextHundred === daysPassed) nextHundred += 100;
    var daysToNextHundred = nextHundred - daysPassed;

    return {
      daysPassed: daysPassed,
      nextYears: Math.max(1, targetYears),
      daysToNext: daysToNext,
      nextDateStr: nextDateStr,
      isTodayAnniversary: daysToNext === 0,
      nextHundred: nextHundred,
      daysToNextHundred: daysToNextHundred
    };
  }

  // ===== 1. 加载角色与联动数据 (严格遵循禁止修改原则) =====
  async function loadAllCharacters() {
    try {
      if (window.db && db.characters) {
        var list = await db.characters.toArray();
        _state.allCharacters = list.filter(function(c) { return c && c.id && c.type !== 'user'; });
      }
    } catch (e) {
      console.warn('[TimeCalendar] loadAllCharacters error:', e);
      _state.allCharacters = [];
    }
    // 确定当前伴侣角色
    if (!_state.activeChar) {
      var mainChar = _state.allCharacters.find(function(c) { return c.type === 'char' || c.isCompanion; }) || _state.allCharacters[0];
      if (mainChar) {
        _state.activeChar = {
          id: String(mainChar.id),
          name: mainChar.name || '林弯弯',
          avatar: mainChar.avatar || 'img/wanwan.png'
        };
      } else {
        _state.activeChar = { id: 'char_default', name: '林弯弯', avatar: 'img/wanwan.png' };
      }
    }
  }

  async function loadLoveDiaryLinkage() {
    _state.loveDiaryAnniversaries = [];
    _state.loveDiaryWishes = [];
    try {
      if (window.TimeCalendarIntegrations && window.TimeCalendarIntegrations.loveDiary) {
        _state.loveDiaryAnniversaries = await window.TimeCalendarIntegrations.loveDiary.getAnniversaries(_state.filterCharId, _state.allCharacters);
        _state.loveDiaryWishes = await window.TimeCalendarIntegrations.loveDiary.getWishesAsEvents(_state.filterCharId, _state.allCharacters);
      } else {
        var coupleConfig = null;
        if (window.loadAllCoupleSpaces && typeof window.loadAllCoupleSpaces === 'function') {
          coupleConfig = await window.loadAllCoupleSpaces();
        } else {
          coupleConfig = await loadConfigKey(LINKAGE_KEYS.LOVE_DIARY, null);
        }

        if (coupleConfig && coupleConfig.spaces) {
          Object.keys(coupleConfig.spaces).forEach(function(charId) {
            var sp = coupleConfig.spaces[charId];
            if (sp && sp.status === 'accepted' && sp.anniversaryDate) {
              var charObj = _state.allCharacters.find(function(c) { return String(c.id) === String(charId); });
              var charName = charObj ? charObj.name : 'TA';
              _state.loveDiaryAnniversaries.push({
                id: 'ld_anniv_' + charId,
                title: charName + ' 的恋爱纪念日',
                startDate: sp.anniversaryDate,
                category: 'love',
                relationType: 'specificChar',
                charId: String(charId),
                charName: charName,
                isPinned: true,
                notes: sp.quote || '恋爱记情侣空间记录',
                source: {
                  app: 'love-diary',
                  recordId: 'couple_space_' + charId,
                  type: 'anniversary',
                  readOnly: false
                }
              });
            }
          });
        }
      }
    } catch (e) {
      console.warn('[TimeCalendar] loadLoveDiaryLinkage error:', e);
    }
  }

  async function loadStudyRoomLinkage() {
    _state.studyRoomRecordsMap = {};
    _state.studyRoomTodos = [];
    _state.studyRoomExams = [];
    _state.studyRoomTodosMap = {};
    try {
      if (window.TimeCalendarIntegrations && window.TimeCalendarIntegrations.studyRoom) {
        _state.studyRoomTodos = await window.TimeCalendarIntegrations.studyRoom.getTodosAsEvents(_state.filterCharId, _state.allCharacters);
        _state.studyRoomExams = await window.TimeCalendarIntegrations.studyRoom.getExamsAsCountdowns(_state.filterCharId);
        _state.studyRoomRecordsMap = await window.TimeCalendarIntegrations.studyRoom.getRecordsMap();
      } else {
        var records = await loadConfigKey(LINKAGE_KEYS.STUDY_RECORDS, []);
        if (Array.isArray(records)) {
          records.forEach(function(r) {
            if (!r) return;
            var dateStr = '';
            if (r.startTime) {
              dateStr = formatLocalDate(new Date(r.startTime));
            } else if (r.date) {
              dateStr = formatLocalDate(r.date);
            }
            if (dateStr) {
              if (!_state.studyRoomRecordsMap[dateStr]) {
                _state.studyRoomRecordsMap[dateStr] = { totalMinutes: 0, count: 0, records: [] };
              }
              _state.studyRoomRecordsMap[dateStr].totalMinutes += (Number(r.durationMinutes) || 0);
              _state.studyRoomRecordsMap[dateStr].count += 1;
              _state.studyRoomRecordsMap[dateStr].records.push(r);
            }
          });
        }
      }
    } catch (e) {
      console.warn('[TimeCalendar] loadStudyRoomLinkage error:', e);
    }
  }

  async function loadTimeCalendarData() {
    _state.events = await loadConfigKey(STORAGE_KEYS.EVENTS, []);
    _state.anniversaries = await loadConfigKey(STORAGE_KEYS.ANNIVERSARIES, []);
    _state.countdowns = await loadConfigKey(STORAGE_KEYS.COUNTDOWNS, []);
    var savedSettings = await loadConfigKey(STORAGE_KEYS.SETTINGS, null);
    if (savedSettings) {
      _state.settings = Object.assign(_state.settings, savedSettings);
      if (_state.settings.defaultView) _state.calendarView = _state.settings.defaultView;
    }
  }

  // ===== 2. 多 Char 隔离与合并数据读取 =====
  function getEffectiveAnniversaries() {
    var list = [];
    if (_state.settings.showLoveDiaryAnniversaries) {
      list = list.concat(_state.loveDiaryAnniversaries || []);
    }
    list = list.concat(_state.anniversaries || []);

    if (_state.filterCharId === 'personal') {
      return list.filter(function(a) { return a.relationType === 'personal'; });
    } else if (_state.filterCharId !== 'all') {
      var targetId = String(_state.filterCharId);
      return list.filter(function(a) {
        return a.relationType === 'personal' || (a.charId && String(a.charId) === targetId);
      });
    }
    return list;
  }

  function getEffectiveCountdowns() {
    var list = [].concat(_state.countdowns || []);

    // 阶段 3: 混入自习室备考计划倒计时
    if (_state.studyRoomExams && _state.studyRoomExams.length) {
      list = list.concat(_state.studyRoomExams);
    }

    // 同时把勾选了 showInCountdown 的日程也作为倒计时展示
    _state.events.forEach(function(ev) {
      if (ev.showInCountdown && ev.date) {
        list.push({
          id: 'cd_evt_' + ev.id,
          title: ev.title,
          targetDate: ev.date,
          category: ev.category || 'life',
          relationType: ev.relationType || 'personal',
          charId: ev.charId,
          charName: ev.charName,
          isPinned: !!ev.isPinned,
          notes: ev.notes,
          source: ev.source || { app: 'timeCalendar', recordId: ev.id, readOnly: false }
        });
      }
    });

    // 把纪念日也作为下一次周年倒计时计入
    var annivs = getEffectiveAnniversaries();
    annivs.forEach(function(an) {
      var milestone = computeAnniversaryMilestone(an.startDate);
      list.push({
        id: 'cd_anniv_' + an.id,
        title: an.title + ' (' + milestone.nextYears + '周年)',
        targetDate: milestone.nextDateStr,
        category: 'anniversary',
        relationType: an.relationType,
        charId: an.charId,
        charName: an.charName,
        isPinned: an.isPinned,
        notes: '相守第 ' + milestone.daysPassed + ' 天 · 下一次周年',
        source: an.source || { app: 'timeCalendar', recordId: an.id, readOnly: false }
      });
    });

    // 筛选隔离
    if (_state.filterCharId === 'personal') {
      list = list.filter(function(c) { return c.relationType === 'personal'; });
    } else if (_state.filterCharId !== 'all') {
      var targetId = String(_state.filterCharId);
      list = list.filter(function(c) {
        return c.relationType === 'personal' || (c.charId && String(c.charId) === targetId);
      });
    }
    return list;
  }

  function getEffectiveEvents(dateFilter) {
    var list = [].concat(_state.events || []);

    // 阶段 3: 混入来自恋爱记具有日期的心愿
    if (_state.loveDiaryWishes && _state.loveDiaryWishes.length) {
      list = list.concat(_state.loveDiaryWishes);
    }
    // 阶段 3: 混入来自自习室的待办事项
    if (_state.studyRoomTodos && _state.studyRoomTodos.length) {
      list = list.concat(_state.studyRoomTodos);
    }

    if (dateFilter) {
      list = list.filter(function(ev) { return ev.date === dateFilter; });
    }
    // 角色隔离
    if (_state.filterCharId === 'personal') {
      list = list.filter(function(ev) { return ev.relationType === 'personal'; });
    } else if (_state.filterCharId !== 'all') {
      var targetId = String(_state.filterCharId);
      list = list.filter(function(ev) {
        return ev.relationType === 'personal' || (ev.charId && String(ev.charId) === targetId);
      });
    }
    return list;
  }

  // ===== 3. 渲染主壳容器与底部四入口 =====
  function renderAppShell() {
    var existing = document.getElementById('time-calendar-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'time-calendar-page';

    page.innerHTML =
      '<div class="tc-header">' +
        '<div class="tc-header-left">' +
          '<button class="tc-back-btn" id="tc-btn-back">' +
            '<i class="fa fa-angle-left"></i><span>桌面</span>' +
          '</button>' +
          '<div class="tc-title-group">' +
            '<div class="tc-icon-mini"><i class="fa-solid fa-calendar-days"></i></div>' +
            '<div class="tc-title-text">时光日历</div>' +
          '</div>' +
        '</div>' +
        '<div class="tc-header-right">' +
          '<div class="tc-char-pill" id="tc-char-selector" title="切换角色与筛选">' +
            '<img class="tc-char-avatar" id="tc-char-avatar" src="' + esc(_state.activeChar ? _state.activeChar.avatar : 'img/wanwan.png') + '">' +
            '<span id="tc-char-name">' + esc(_state.filterCharId === 'all' ? '全部视角' : (_state.filterCharId === 'personal' ? '个人' : (_state.activeChar ? _state.activeChar.name : '林弯弯'))) + '</span>' +
            '<i class="fa fa-chevron-down" style="font-size: 10px; color: var(--c-text-muted);"></i>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="tc-view-switcher" id="tc-view-switcher">' +
        '<div class="tc-nav-cluster">' +
          '<button class="tc-nav-btn" id="tc-nav-prev" title="前一个周期"><i class="fa fa-chevron-left"></i></button>' +
          '<button class="tc-today-btn" id="tc-nav-today">今天</button>' +
          '<button class="tc-nav-btn" id="tc-nav-next" title="后一个周期"><i class="fa fa-chevron-right"></i></button>' +
          '<span class="tc-current-period-title" id="tc-period-title"></span>' +
        '</div>' +
        '<div class="tc-segmented-control" id="tc-view-segments">' +
          '<button class="tc-seg-btn ' + (_state.calendarView === 'month' ? 'active' : '') + '" data-view="month">月</button>' +
          '<button class="tc-seg-btn ' + (_state.calendarView === 'week' ? 'active' : '') + '" data-view="week">周</button>' +
          '<button class="tc-seg-btn ' + (_state.calendarView === 'day' ? 'active' : '') + '" data-view="day">日</button>' +
        '</div>' +
      '</div>' +
      '<div class="tc-content-scroll" id="tc-content-scroll"></div>' +
      '<button class="tc-fab" id="tc-fab" title="新建"><i class="fa fa-plus"></i></button>' +
      '<div class="tc-bottom-bar">' +
        '<button class="tc-tab-btn ' + (_state.activeTab === 'calendar' ? 'active' : '') + '" data-tab="calendar">' +
          '<i class="fa-solid fa-calendar-days"></i><span>日历</span>' +
        '</button>' +
        '<button class="tc-tab-btn ' + (_state.activeTab === 'countdowns' ? 'active' : '') + '" data-tab="countdowns">' +
          '<i class="fa-solid fa-hourglass-half"></i><span>倒计时</span>' +
        '</button>' +
        '<button class="tc-tab-btn ' + (_state.activeTab === 'anniversaries' ? 'active' : '') + '" data-tab="anniversaries">' +
          '<i class="fa-solid fa-heart"></i><span>纪念日</span>' +
        '</button>' +
        '<button class="tc-tab-btn ' + (_state.activeTab === 'schedules' ? 'active' : '') + '" data-tab="schedules">' +
          '<i class="fa-solid fa-list-check"></i><span>日程</span>' +
        '</button>' +
      '</div>';

    _state.pageEl = page;
    bindShellEvents(page);
    return page;
  }

  function bindShellEvents(page) {
    // 返回桌面生命周期
    page.querySelector('#tc-btn-back').addEventListener('click', function() {
      if (window.closePage) {
        window.closePage('time-calendar-page');
      } else {
        page.remove();
      }
    });

    // 底部 4 入口 Tab 切换
    page.querySelectorAll('.tc-tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tab = btn.dataset.tab;
        _state.activeTab = tab;
        page.querySelectorAll('.tc-tab-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === tab); });
        // 在非日历 Tab 下收起顶部的月/周/日切换条
        var switcher = page.querySelector('#tc-view-switcher');
        if (switcher) {
          switcher.style.display = tab === 'calendar' ? 'flex' : 'none';
        }
        renderActiveTabContent();
      });
    });

    // 视图切换器: 月 / 周 / 日
    page.querySelectorAll('.tc-seg-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var view = btn.dataset.view;
        _state.calendarView = view;
        page.querySelectorAll('.tc-seg-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.view === view); });
        renderCalendarView();
      });
    });

    // 前进、后退、返回今天
    page.querySelector('#tc-nav-prev').addEventListener('click', function() { navigatePeriod(-1); });
    page.querySelector('#tc-nav-next').addEventListener('click', function() { navigatePeriod(1); });
    page.querySelector('#tc-nav-today').addEventListener('click', function() {
      var now = new Date();
      _state.viewYear = now.getFullYear();
      _state.viewMonth = now.getMonth() + 1;
      _state.selectedDateStr = getTodayLocalDateStr();
      renderActiveTabContent();
    });

    // 角色筛选弹窗
    page.querySelector('#tc-char-selector').addEventListener('click', showCharFilterModal);

    // FAB 快速新建
    page.querySelector('#tc-fab').addEventListener('click', function() {
      if (_state.activeTab === 'countdowns') {
        showAddCountdownModal();
      } else if (_state.activeTab === 'anniversaries') {
        showAddAnniversaryModal();
      } else {
        showAddEventModal(_state.selectedDateStr);
      }
    });
  }

  function navigatePeriod(step) {
    if (_state.calendarView === 'month') {
      _state.viewMonth += step;
      if (_state.viewMonth > 12) {
        _state.viewMonth = 1;
        _state.viewYear += 1;
      } else if (_state.viewMonth < 1) {
        _state.viewMonth = 12;
        _state.viewYear -= 1;
      }
      var curD = parseLocalDate(_state.selectedDateStr);
      var targetDay = curD ? curD.getDate() : 1;
      var maxDaysInNewMonth = new Date(_state.viewYear, _state.viewMonth, 0).getDate();
      var finalDay = Math.min(targetDay, maxDaysInNewMonth);
      _state.selectedDateStr = _state.viewYear + '-' + String(_state.viewMonth).padStart(2, '0') + '-' + String(finalDay).padStart(2, '0');
    } else if (_state.calendarView === 'week') {
      var curDate = parseLocalDate(_state.selectedDateStr) || new Date();
      curDate.setDate(curDate.getDate() + (step * 7));
      _state.selectedDateStr = formatLocalDate(curDate);
      _state.viewYear = curDate.getFullYear();
      _state.viewMonth = curDate.getMonth() + 1;
    } else if (_state.calendarView === 'day') {
      var d = parseLocalDate(_state.selectedDateStr) || new Date();
      d.setDate(d.getDate() + step);
      _state.selectedDateStr = formatLocalDate(d);
      _state.viewYear = d.getFullYear();
      _state.viewMonth = d.getMonth() + 1;
    }
    renderActiveTabContent();
  }

  // ===== 4. 渲染各 Tab 内容 =====
  function renderActiveTabContent() {
    var switcher = _state.pageEl.querySelector('#tc-view-switcher');
    if (switcher) switcher.style.display = _state.activeTab === 'calendar' ? 'flex' : 'none';

    if (_state.activeTab === 'calendar') {
      renderCalendarView();
    } else if (_state.activeTab === 'countdowns') {
      renderCountdownsTab();
    } else if (_state.activeTab === 'anniversaries') {
      renderAnniversariesTab();
    } else if (_state.activeTab === 'schedules') {
      renderSchedulesTab();
    }
  }

  // 渲染 Char 伴侣关怀卡片 (根据当天日程、自习时长、恋爱天数规则生成，真实可靠绝无虚假 AI 冒充)
  function buildCompanionCardHtml() {
    var charName = _state.activeChar ? _state.activeChar.name : '林弯弯';
    var charAvatar = _state.activeChar ? _state.activeChar.avatar : 'img/wanwan.png';

    var todayStr = getTodayLocalDateStr();
    var studyInfo = _state.studyRoomRecordsMap[todayStr];
    var todayStudyMin = studyInfo ? studyInfo.totalMinutes : 0;
    var dayEvents = getEffectiveEvents(todayStr);
    var pendingCount = dayEvents.filter(function(e) { return !e.completed; }).length;

    // 获取最近的一条恋爱纪念日
    var annivs = getEffectiveAnniversaries();
    var loveAnniv = annivs.find(function(a) { return a.category === 'love'; }) || annivs[0];

    var greetingHeadline = charName + ' · 陪伴中';
    var subTextParts = [];

    if (loveAnniv) {
      var ms = computeAnniversaryMilestone(loveAnniv.startDate, todayStr);
      subTextParts.push('相守第 ' + ms.daysPassed + ' 天');
      if (ms.isTodayAnniversary) {
        subTextParts.push('🎉 今天是 ' + ms.nextYears + ' 周年纪念日');
      } else {
        subTextParts.push('距 ' + ms.nextYears + ' 周年还有 ' + ms.daysToNext + ' 天');
      }
    }

    if (todayStudyMin > 0) {
      subTextParts.push('今日已专注 ' + todayStudyMin + ' 分钟');
    }

    if (pendingCount > 0) {
      subTextParts.push('待办日程 ' + pendingCount + ' 项');
    } else if (dayEvents.length > 0) {
      subTextParts.push('今日日程已全部完成 ✨');
    } else {
      subTextParts.push('今天也是美好充实的一天');
    }

    return (
      '<div class="tc-companion-card">' +
        '<div class="tc-companion-avatar-wrap">' +
          '<img class="tc-companion-avatar-img" src="' + esc(charAvatar) + '">' +
          '<div class="tc-companion-badge-heart"><i class="fa fa-heart"></i></div>' +
        '</div>' +
        '<div class="tc-companion-info">' +
          '<div class="tc-companion-headline">' +
            '<span>' + esc(greetingHeadline) + '</span>' +
          '</div>' +
          '<div class="tc-companion-sub">' + esc(subTextParts.join(' · ')) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ===== 5. 渲染日历主视图 (月 / 周 / 日) =====
  function renderCalendarView() {
    var container = _state.pageEl.querySelector('#tc-content-scroll');
    var titleEl = _state.pageEl.querySelector('#tc-period-title');

    var html = '';
    // 插入陪伴卡片
    html += buildCompanionCardHtml();

    if (_state.calendarView === 'month') {
      titleEl.textContent = _state.viewYear + '年' + _state.viewMonth + '月';
      html += renderMonthGridHtml();
    } else if (_state.calendarView === 'week') {
      var selDate = parseLocalDate(_state.selectedDateStr) || new Date();
      titleEl.textContent = selDate.getFullYear() + '年' + (selDate.getMonth() + 1) + '月 (周视图)';
      html += renderWeekViewHtml();
    } else if (_state.calendarView === 'day') {
      var sDate = parseLocalDate(_state.selectedDateStr) || new Date();
      titleEl.textContent = sDate.getFullYear() + '年' + (sDate.getMonth() + 1) + '月' + sDate.getDate() + '日 (' + getWeekdayName(_state.selectedDateStr, true) + ')';
      html += renderDayViewHtml();
    }

    // 选中日期的详细安排与重要倒计时
    html += renderSelectedDateOverviewHtml();

    container.innerHTML = html;
    bindCalendarViewEvents(container);
  }

  // 渲染月日历网格
  function renderMonthGridHtml() {
    var y = _state.viewYear;
    var m = _state.viewMonth;

    var firstDayWeekday = new Date(y, m - 1, 1).getDay(); // 0 是周日
    var firstDayIndex = firstDayWeekday === 0 ? 6 : firstDayWeekday - 1; // 转换为周一为起始 (0 - 6)
    var daysInCurrentMonth = new Date(y, m, 0).getDate();
    var daysInPrevMonth = new Date(y, m - 1, 0).getDate();

    // 汇总有事件、纪念日或自习打卡的日期集合
    var eventDatesMap = {};
    getEffectiveEvents().forEach(function(ev) {
      if (ev.date) eventDatesMap[ev.date] = true;
    });

    var annivDatesMap = {};
    getEffectiveAnniversaries().forEach(function(an) {
      if (an.startDate) {
        // 标记每月对应的相合日期
        var p = an.startDate.split('-');
        if (p.length >= 3) {
          var targetDay = p[2];
          var thisMonthDateStr = y + '-' + String(m).padStart(2, '0') + '-' + targetDay;
          annivDatesMap[thisMonthDateStr] = true;
        }
      }
    });

    var todayStr = getTodayLocalDateStr();

    var html =
      '<div class="tc-calendar-card">' +
        '<div class="tc-weekday-row">' +
          '<div class="tc-weekday-cell">一</div>' +
          '<div class="tc-weekday-cell">二</div>' +
          '<div class="tc-weekday-cell">三</div>' +
          '<div class="tc-weekday-cell">四</div>' +
          '<div class="tc-weekday-cell">五</div>' +
          '<div class="tc-weekday-cell weekend">六</div>' +
          '<div class="tc-weekday-cell weekend">日</div>' +
        '</div>' +
        '<div class="tc-month-grid">';

    // 上个月余白
    for (var i = firstDayIndex - 1; i >= 0; i--) {
      var prevDayNum = daysInPrevMonth - i;
      html += '<div class="tc-day-cell other-month"><span class="tc-day-num">' + prevDayNum + '</span></div>';
    }

    // 当月天数
    for (var d = 1; d <= daysInCurrentMonth; d++) {
      var dateStr = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var isToday = (dateStr === todayStr);
      var isSelected = (dateStr === _state.selectedDateStr);

      var hasEvent = !!eventDatesMap[dateStr];
      var hasAnniv = !!annivDatesMap[dateStr];
      var hasStudy = !!(_state.studyRoomRecordsMap[dateStr] && _state.studyRoomRecordsMap[dateStr].totalMinutes > 0);

      var dotsHtml = '<div class="tc-day-dots">';
      if (hasEvent) dotsHtml += '<span class="tc-dot event"></span>';
      if (hasAnniv) dotsHtml += '<span class="tc-dot anniv"></span>';
      if (hasStudy) dotsHtml += '<span class="tc-dot study"></span>';
      dotsHtml += '</div>';

      html +=
        '<div class="tc-day-cell ' + (isToday ? 'is-today ' : '') + (isSelected ? 'is-selected' : '') + '" data-date="' + dateStr + '">' +
          '<span class="tc-day-num">' + d + '</span>' +
          dotsHtml +
        '</div>';
    }

    // 下个月余白，补齐 35 或 42 格
    var totalCells = firstDayIndex + daysInCurrentMonth;
    var remainder = totalCells % 7;
    var nextMonthDays = remainder > 0 ? 7 - remainder : 0;
    for (var nd = 1; nd <= nextMonthDays; nd++) {
      html += '<div class="tc-day-cell other-month"><span class="tc-day-num">' + nd + '</span></div>';
    }

    html += '</div></div>';
    return html;
  }

  // 渲染周视图
  function renderWeekViewHtml() {
    var cur = parseLocalDate(_state.selectedDateStr) || new Date();
    var dayOfWeek = cur.getDay(); // 0 是周日
    var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    var monday = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + mondayOffset);

    var html = '<div class="tc-week-container"><div class="tc-week-strip">';
    var todayStr = getTodayLocalDateStr();

    for (var i = 0; i < 7; i++) {
      var d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      var dStr = formatLocalDate(d);
      var isSel = (dStr === _state.selectedDateStr);
      var isToday = (dStr === todayStr);
      var dayLabel = ['一', '二', '三', '四', '五', '六', '日'][i];

      var studyMin = _state.studyRoomRecordsMap[dStr] ? _state.studyRoomRecordsMap[dStr].totalMinutes : 0;
      var badgeText = studyMin > 0 ? studyMin + 'm' : (isToday ? '今' : '');

      html +=
        '<div class="tc-week-day-box ' + (isSel ? 'is-selected' : '') + '" data-date="' + dStr + '">' +
          '<span class="tc-week-day-label">' + dayLabel + '</span>' +
          '<span class="tc-week-day-number">' + d.getDate() + '</span>' +
          (badgeText ? '<span class="tc-week-day-badge">' + badgeText + '</span>' : '') +
        '</div>';
    }
    html += '</div></div>';
    return html;
  }

  // 渲染日视图
  function renderDayViewHtml() {
    var sDate = parseLocalDate(_state.selectedDateStr) || new Date();
    var weekday = getWeekdayName(_state.selectedDateStr);
    var dayEvents = getEffectiveEvents(_state.selectedDateStr);
    var studyInfo = _state.studyRoomRecordsMap[_state.selectedDateStr];

    var html =
      '<div class="tc-dayview-container">' +
        '<div class="tc-dayview-banner">' +
          '<div class="tc-dayview-banner-left">' +
            '<div class="tc-dayview-title">' + sDate.getDate() + '日 · ' + weekday + '</div>' +
            '<div class="tc-dayview-sub">' +
              (dayEvents.length > 0 ? '共有 ' + dayEvents.length + ' 项日程安排' : '今日暂无日程安排') +
              (studyInfo ? ' · 自习专注 ' + studyInfo.totalMinutes + ' 分钟' : '') +
            '</div>' +
          '</div>' +
          '<button class="tc-btn tc-btn-primary" id="tc-btn-add-today-event"><i class="fa fa-plus"></i> 新建</button>' +
        '</div>' +
      '</div>';
    return html;
  }

  // 渲染选中日期的具体安排与重要倒计时
  function renderSelectedDateOverviewHtml() {
    var dateStr = _state.selectedDateStr;
    var dayEvents = getEffectiveEvents(dateStr);
    var todayStudy = _state.studyRoomRecordsMap[dateStr];
    var todayTodos = _state.studyRoomTodosMap[dateStr] || [];

    // 检查此日期是否恰逢纪念日
    var todayAnnivs = getEffectiveAnniversaries().filter(function(an) {
      if (!an.startDate) return false;
      var p = an.startDate.split('-');
      var curP = dateStr.split('-');
      return (p[1] === curP[1] && p[2] === curP[2]);
    });

    var html = '<div class="tc-section-card">';
    html +=
      '<div class="tc-section-header">' +
        '<div class="tc-section-title">' +
          '<i class="fa fa-calendar-check"></i>' +
          '<span>' + esc(dateStr) + ' (' + getWeekdayName(dateStr, true) + ') 安排</span>' +
        '</div>' +
        '<button class="tc-btn" id="tc-btn-card-add-event" style="padding: 4px 10px; font-size: 11px;">' +
          '<i class="fa fa-plus"></i> 加日程' +
        '</button>' +
      '</div>';

    // 1. 若有纪念日展示置顶浪漫横幅
    if (todayAnnivs.length > 0) {
      todayAnnivs.forEach(function(an) {
        var ms = computeAnniversaryMilestone(an.startDate, dateStr);
        var jumpLoveBtn = (an.source && an.source.app === 'love-diary') ?
          '<span class="tc-source-badge tc-badge-love" data-action="jump-source-an" data-id="' + an.id + '" title="来自恋爱记 · 点击跳转"><i class="fa-solid fa-heart"></i> 恋爱记</span>' : '';

        html +=
          '<div class="tc-event-item" style="border-left: 3px solid #ff477e; background: var(--c-surface);">' +
            '<i class="fa-solid fa-heart" style="color: #ff477e; font-size: 14px; margin-top: 3px;"></i>' +
            '<div class="tc-event-info">' +
              '<div class="tc-event-title-row">' +
                '<span class="tc-event-title-text" style="font-weight: 600;">' + esc(an.title) + '</span>' +
                '<span class="tc-tag tag-anniv">' + ms.nextYears + ' 周年</span>' +
                jumpLoveBtn +
              '</div>' +
              '<div class="tc-event-meta-row">' +
                '<span>相守第 ' + ms.daysPassed + ' 天 · 起始于 ' + esc(an.startDate) + '</span>' +
              '</div>' +
            '</div>' +
            (an.source && an.source.app === 'love-diary' ?
              '<div class="tc-event-actions"><button class="tc-icon-action-btn" data-action="jump-source-an" data-id="' + an.id + '" title="前往恋爱记"><i class="fa fa-arrow-up-right-from-square"></i></button></div>' : '') +
          '</div>';
      });
    }

    // 2. 自习室今日专注成就交互卡片 (阶段 3)
    if (todayStudy && todayStudy.totalMinutes > 0) {
      html +=
        '<div class="tc-study-achievement-card">' +
          '<div class="tc-study-achievement-header">' +
            '<div class="tc-study-achievement-title"><i class="fa-solid fa-hourglass-half"></i> 陪伴自习室 · 今日专注成就</div>' +
            '<button type="button" class="tc-btn-jump-pill" data-action="jump-study-today" title="前往陪伴自习室"><i class="fa fa-book-open"></i> 进入自习室</button>' +
          '</div>' +
          '<div class="tc-study-achievement-body">' +
            '<div class="tc-study-stat-item"><span class="tc-study-stat-val">' + todayStudy.totalMinutes + '</span><span class="tc-study-stat-label">专注分钟</span></div>' +
            '<div class="tc-study-stat-item"><span class="tc-study-stat-val">' + todayStudy.count + '</span><span class="tc-study-stat-label">完成番茄</span></div>' +
          '</div>' +
        '</div>';
    }

    // 3. 用户日程条目 (包含恋爱记心愿与自习室待办)
    if (dayEvents.length === 0 && !todayStudy && todayAnnivs.length === 0) {
      html +=
        '<div class="tc-empty-state">' +
          '<i class="fa fa-mug-saucer"></i>' +
          '<span>这一天暂时没有日程，点击上方按钮添加吧</span>' +
        '</div>';
    } else if (dayEvents.length > 0) {
      html += '<div class="tc-item-list">';
      dayEvents.forEach(function(ev) {
        var catClass = 'tag-' + (ev.category || 'other');
        var catLabel = getCategoryLabel(ev.category);
        var timeLabel = ev.isAllDay ? '全天' : ((ev.startTime || '--:--') + ' ~ ' + (ev.endTime || '--:--'));
        var charBadge = ev.charName ? '<span class="tc-tag">' + esc(ev.charName) + '</span>' : '';

        var hasReminder = (Array.isArray(ev.reminders) && ev.reminders.some(function(r) { return r && r.enabled !== false; })) || (ev.reminder && ev.reminder.enabled);
        var hasRepeat = ev.recurrence && ev.recurrence.type && ev.recurrence.type !== 'none';
        var reminderBadge = hasReminder ? '<span class="tc-meta-badge has-reminder" title="已设置提醒"><i class="fa fa-bell" style="font-size: 10px;"></i></span>' : '';
        var repeatBadge = hasRepeat ? '<span class="tc-meta-badge has-repeat" title="重复日程"><i class="fa fa-rotate" style="font-size: 10px;"></i></span>' : '';

        var sourceBadge = '';
        var jumpBtn = '';
        if (ev.source && ev.source.app === 'love-diary') {
          sourceBadge = '<span class="tc-source-badge tc-badge-love" data-action="jump-source-evt" data-id="' + ev.id + '" title="来自恋爱记 · 点击跳转"><i class="fa-solid fa-heart"></i> 恋爱记</span>';
          jumpBtn = '<button class="tc-icon-action-btn" data-action="jump-source-evt" data-id="' + ev.id + '" title="前往恋爱记"><i class="fa fa-arrow-up-right-from-square"></i></button>';
        } else if (ev.source && ev.source.app === 'study-room') {
          sourceBadge = '<span class="tc-source-badge tc-badge-study" data-action="jump-source-evt" data-id="' + ev.id + '" title="来自陪伴自习室 · 点击跳转"><i class="fa-solid fa-book-open"></i> 自习室</span>';
          jumpBtn = '<button class="tc-icon-action-btn" data-action="jump-source-evt" data-id="' + ev.id + '" title="前往自习室"><i class="fa fa-arrow-up-right-from-square"></i></button>';
        }

        html +=
          '<div class="tc-event-item ' + (ev.completed ? 'completed' : '') + '" data-id="' + ev.id + '">' +
            '<div class="tc-checkbox ' + (ev.completed ? 'checked' : '') + '" data-action="toggle-complete" data-id="' + ev.id + '" title="完成/未完成">' +
              '<i class="fa fa-check"></i>' +
            '</div>' +
            '<div class="tc-event-info">' +
              '<div class="tc-event-title-row">' +
                '<span class="tc-event-title-text">' + esc(ev.title) + '</span>' +
                '<span class="tc-tag ' + catClass + '">' + catLabel + '</span>' +
                charBadge +
                sourceBadge +
                reminderBadge +
                repeatBadge +
              '</div>' +
              '<div class="tc-event-meta-row">' +
                '<span><i class="fa fa-clock" style="font-size: 10px;"></i> ' + timeLabel + '</span>' +
                (ev.notes ? '<span>· ' + esc(ev.notes) + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="tc-event-actions">' +
              jumpBtn +
              '<button class="tc-icon-action-btn" data-action="edit-event" data-id="' + ev.id + '" title="编辑"><i class="fa fa-pen"></i></button>' +
              '<button class="tc-icon-action-btn btn-delete" data-action="delete-event" data-id="' + ev.id + '" title="删除"><i class="fa fa-trash"></i></button>' +
            '</div>' +
          '</div>';
      });
      html += '</div>';
    }

    html += '</div>';

    // 5. 插入「近期重要日期」卡片
    html += renderUpcomingCountdownsSectionHtml();

    return html;
  }

  // 渲染近期重要日期摘要
  function renderUpcomingCountdownsSectionHtml() {
    var list = getEffectiveCountdowns();
    // 过滤出未来的倒计时并按天数升序排序
    var futureList = list.filter(function(cd) {
      return getLocalDaysDiff(cd.targetDate) >= 0;
    }).sort(function(a, b) {
      return getLocalDaysDiff(a.targetDate) - getLocalDaysDiff(b.targetDate);
    }).slice(0, 3); // 仅展示前 3 个

    if (futureList.length === 0) return '';

    var html = '<div class="tc-section-card">';
    html +=
      '<div class="tc-section-header">' +
        '<div class="tc-section-title"><i class="fa-solid fa-flag"></i><span>即将到来的重要日期</span></div>' +
        '<span class="tc-section-badge">倒计时</span>' +
      '</div>' +
      '<div class="tc-item-list">';

    futureList.forEach(function(cd) {
      var diff = getLocalDaysDiff(cd.targetDate);
      html +=
        '<div class="tc-countdown-card ' + (cd.isPinned ? 'is-pinned' : '') + '">' +
          '<div class="tc-countdown-left">' +
            '<div class="tc-countdown-title">' +
              (cd.isPinned ? '<i class="fa fa-thumbtack" style="font-size: 11px;"></i>' : '') +
              '<span>' + esc(cd.title) + '</span>' +
            '</div>' +
            '<div class="tc-countdown-date">目标日期：' + esc(cd.targetDate) + (cd.charName ? ' · ' + esc(cd.charName) : '') + '</div>' +
          '</div>' +
          '<div class="tc-countdown-right">' +
            '<div class="tc-countdown-badge-box">' +
              '<span class="tc-countdown-prefix">' + (diff === 0 ? '就是' : '还有') + '</span>' +
              '<span class="tc-countdown-num">' + (diff === 0 ? '今' : diff) + '</span>' +
              '<span class="tc-countdown-unit">' + (diff === 0 ? '天' : '天') + '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
    });

    html += '</div></div>';
    return html;
  }

  function bindCalendarViewEvents(container) {
    // 日期点击选中
    container.querySelectorAll('.tc-day-cell[data-date], .tc-week-day-box[data-date]').forEach(function(el) {
      el.addEventListener('click', function() {
        var dStr = el.dataset.date;
        if (dStr) {
          _state.selectedDateStr = dStr;
          renderCalendarView();
        }
      });
    });

    // 日期安排中的快速新建
    var btnAdd = container.querySelector('#tc-btn-card-add-event');
    if (btnAdd) {
      btnAdd.addEventListener('click', function() { showAddEventModal(_state.selectedDateStr); });
    }
    var btnTodayAdd = container.querySelector('#tc-btn-add-today-event');
    if (btnTodayAdd) {
      btnTodayAdd.addEventListener('click', function() { showAddEventModal(_state.selectedDateStr); });
    }

    // 自习室今日卡片快速进入
    container.querySelectorAll('[data-action="jump-study-today"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.TimeCalendarIntegrations) {
          window.TimeCalendarIntegrations.navigate({ app: 'study-room', type: 'duo' });
        }
      });
    });

    // 来源应用跳转
    container.querySelectorAll('[data-action="jump-source-an"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        var an = getEffectiveAnniversaries().find(function(a) { return a.id === id; });
        if (an && an.source && window.TimeCalendarIntegrations) {
          window.TimeCalendarIntegrations.navigate(an.source);
        }
      });
    });

    container.querySelectorAll('[data-action="jump-source-evt"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        var ev = getEffectiveEvents().find(function(e) { return e.id === id; });
        if (ev && ev.source && window.TimeCalendarIntegrations) {
          window.TimeCalendarIntegrations.navigate(ev.source);
        }
      });
    });

    // 完成/未完成切换
    container.querySelectorAll('[data-action="toggle-complete"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        toggleEventCompletion(id);
      });
    });

    // 编辑日程 (支持本地日程与联动心愿/待办)
    container.querySelectorAll('[data-action="edit-event"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        var ev = getEffectiveEvents().find(function(item) { return item.id === id; });
        if (ev) showEditEventModal(ev);
      });
    });

    // 删除日程
    container.querySelectorAll('[data-action="delete-event"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        deleteEvent(id);
      });
    });
  }

  // ===== 6. 渲染倒计时 Tab =====
  function renderCountdownsTab() {
    var container = _state.pageEl.querySelector('#tc-content-scroll');
    var list = getEffectiveCountdowns();

    // 分类筛选
    if (_state.countdownCategoryFilter !== 'all') {
      if (_state.countdownCategoryFilter === 'pinned') {
        list = list.filter(function(c) { return c.isPinned; });
      } else {
        list = list.filter(function(c) { return c.category === _state.countdownCategoryFilter; });
      }
    }

    // 排序：置顶优先，其次按距今绝对天数排序
    list.sort(function(a, b) {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      var diffA = Math.abs(getLocalDaysDiff(a.targetDate));
      var diffB = Math.abs(getLocalDaysDiff(b.targetDate));
      return diffA - diffB;
    });

    var categories = [
      { id: 'all', name: '全部' },
      { id: 'pinned', name: '置顶' },
      { id: 'exam', name: '考试' },
      { id: 'target', name: '目标' },
      { id: 'anniversary', name: '纪念日' },
      { id: 'birthday', name: '生日' },
      { id: 'life', name: '生活' }
    ];

    var html =
      '<div class="tc-filter-strip">' +
        categories.map(function(cat) {
          var active = _state.countdownCategoryFilter === cat.id ? 'active' : '';
          return '<button class="tc-filter-chip ' + active + '" data-cd-cat="' + cat.id + '">' + cat.name + '</button>';
        }).join('') +
      '</div>';

    if (list.length === 0) {
      html +=
        '<div class="tc-empty-state" style="padding: 60px 20px;">' +
          '<i class="fa fa-hourglass-half"></i>' +
          '<span>暂无倒计时，点击右下角「+」新建一个重要日子吧</span>' +
        '</div>';
    } else {
      html += '<div class="tc-item-list" style="margin-top: 10px;">';
      list.forEach(function(cd) {
        var diff = getLocalDaysDiff(cd.targetDate);
        var isPast = diff < 0;
        var isToday = diff === 0;

        var prefix = isToday ? '就是' : (isPast ? '已过去' : '还有');
        var absDays = Math.abs(diff);

        var isReadOnly = cd.source && cd.source.readOnly;

        html +=
          '<div class="tc-countdown-card ' + (cd.isPinned ? 'is-pinned' : '') + '">' +
            '<div class="tc-countdown-left">' +
              '<div class="tc-countdown-title">' +
                (cd.isPinned ? '<i class="fa fa-thumbtack" style="font-size: 11px;"></i>' : '') +
                '<span>' + esc(cd.title) + '</span>' +
                (cd.charName ? '<span class="tc-tag">' + esc(cd.charName) + '</span>' : '') +
                (isReadOnly ? '<span class="tc-tag tag-source-love">联动 (只读)</span>' : '') +
              '</div>' +
              '<div class="tc-countdown-date">目标日期：' + esc(cd.targetDate) + ' · ' + getWeekdayName(cd.targetDate) + (cd.notes ? ' · ' + esc(cd.notes) : '') + '</div>' +
            '</div>' +
            '<div class="tc-countdown-right">' +
              '<div class="tc-countdown-badge-box">' +
                '<span class="tc-countdown-prefix">' + prefix + '</span>' +
                '<span class="tc-countdown-num">' + (isToday ? '今' : absDays) + '</span>' +
                '<span class="tc-countdown-unit">' + (isToday ? '天' : '天') + '</span>' +
              '</div>' +
              (!isReadOnly ? (
                '<div style="display: flex; gap: 4px; margin-top: 4px;">' +
                  '<button class="tc-icon-action-btn" data-action="toggle-pin-cd" data-id="' + cd.id + '" title="' + (cd.isPinned ? '取消置顶' : '置顶') + '"><i class="fa fa-thumbtack"></i></button>' +
                  '<button class="tc-icon-action-btn" data-action="edit-cd" data-id="' + cd.id + '" title="编辑"><i class="fa fa-pen"></i></button>' +
                  '<button class="tc-icon-action-btn btn-delete" data-action="delete-cd" data-id="' + cd.id + '" title="删除"><i class="fa fa-trash"></i></button>' +
                '</div>'
              ) : '') +
            '</div>' +
          '</div>';
      });
      html += '</div>';
    }

    container.innerHTML = html;
    bindCountdownsTabEvents(container);
  }

  function bindCountdownsTabEvents(container) {
    container.querySelectorAll('[data-cd-cat]').forEach(function(chip) {
      chip.addEventListener('click', function() {
        _state.countdownCategoryFilter = chip.dataset.cdCat;
        renderCountdownsTab();
      });
    });

    container.querySelectorAll('[data-action="toggle-pin-cd"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        var cd = _state.countdowns.find(function(c) { return c.id === id; });
        if (cd) {
          cd.isPinned = !cd.isPinned;
          cd.updatedAt = Date.now();
          saveConfigKey(STORAGE_KEYS.COUNTDOWNS, _state.countdowns);
          renderCountdownsTab();
        }
      });
    });

    container.querySelectorAll('[data-action="edit-cd"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        var cd = _state.countdowns.find(function(c) { return c.id === id; });
        if (cd) showEditCountdownModal(cd);
      });
    });

    container.querySelectorAll('[data-action="delete-cd"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        deleteCountdown(id);
      });
    });
  }

  // ===== 7. 渲染纪念日 Tab =====
  function renderAnniversariesTab() {
    var container = _state.pageEl.querySelector('#tc-content-scroll');
    var list = getEffectiveAnniversaries();

    // 排序：置顶优先，其次按距今相守天数降序排序
    list.sort(function(a, b) {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      var msA = computeAnniversaryMilestone(a.startDate);
      var msB = computeAnniversaryMilestone(b.startDate);
      return msB.daysPassed - msA.daysPassed;
    });

    var html = '';
    // 顶部角色隔离筛选
    html +=
      '<div class="tc-filter-strip">' +
        '<button class="tc-filter-chip ' + (_state.filterCharId === 'all' ? 'active' : '') + '" data-char-filter="all">全部纪念日</button>' +
        '<button class="tc-filter-chip ' + (_state.filterCharId === 'personal' ? 'active' : '') + '" data-char-filter="personal">仅个人</button>' +
        _state.allCharacters.map(function(c) {
          var active = String(_state.filterCharId) === String(c.id) ? 'active' : '';
          return '<button class="tc-filter-chip ' + active + '" data-char-filter="' + c.id + '">' + esc(c.name) + '</button>';
        }).join('') +
      '</div>';

    if (list.length === 0) {
      html +=
        '<div class="tc-empty-state" style="padding: 60px 20px;">' +
          '<i class="fa fa-heart"></i>' +
          '<span>暂无纪念日，点击右下角「+」记录属于你们的第一天吧</span>' +
        '</div>';
    } else {
      html += '<div class="tc-item-list" style="margin-top: 10px;">';
      list.forEach(function(an) {
        var ms = computeAnniversaryMilestone(an.startDate);
        var isReadOnly = an.source && an.source.readOnly;

        html +=
          '<div class="tc-anniv-card ' + (an.isPinned ? 'is-pinned' : '') + '">' +
            '<div class="tc-anniv-top">' +
              '<div class="tc-anniv-title-box">' +
                (an.isPinned ? '<i class="fa fa-thumbtack" style="font-size: 11px; color: #ff477e;"></i>' : '') +
                '<span class="tc-anniv-title">' + esc(an.title) + '</span>' +
                (an.charName ? '<span class="tc-tag">' + esc(an.charName) + '</span>' : '') +
                (isReadOnly ? '<span class="tc-tag tag-source-love"><i class="fa fa-link"></i> 恋爱记联动 (只读)</span>' : '') +
              '</div>' +
              (!isReadOnly ? (
                '<div style="display: flex; gap: 4px;">' +
                  '<button class="tc-icon-action-btn" data-action="toggle-pin-an" data-id="' + an.id + '" title="' + (an.isPinned ? '取消置顶' : '置顶') + '"><i class="fa fa-thumbtack"></i></button>' +
                  '<button class="tc-icon-action-btn" data-action="edit-an" data-id="' + an.id + '" title="编辑"><i class="fa fa-pen"></i></button>' +
                  '<button class="tc-icon-action-btn btn-delete" data-action="delete-an" data-id="' + an.id + '" title="删除"><i class="fa fa-trash"></i></button>' +
                '</div>'
              ) : '') +
            '</div>' +
            '<div class="tc-anniv-calc-row">' +
              '<div class="tc-anniv-days-total">' +
                '已相守 <span>' + ms.daysPassed + '</span> 天' +
              '</div>' +
              '<div class="tc-anniv-next-milestone">' +
                (ms.isTodayAnniversary ? '🎉 今天是 ' + ms.nextYears + ' 周年！' : '距 ' + ms.nextYears + ' 周年还有 ' + ms.daysToNext + ' 天') +
              '</div>' +
            '</div>' +
            '<div style="font-size: 11px; color: var(--c-text-muted); display: flex; justify-content: space-between;">' +
              '<span>起始日期：' + esc(an.startDate) + '</span>' +
              '<span>下一个百天（' + ms.nextHundred + '天）：还剩 ' + ms.daysToNextHundred + ' 天</span>' +
            '</div>' +
            (an.notes ? '<div style="font-size: 12px; color: var(--c-text); background: var(--c-surface); padding: 6px 10px; border-radius: 4px;">' + esc(an.notes) + '</div>' : '') +
          '</div>';
      });
      html += '</div>';
    }

    container.innerHTML = html;
    bindAnniversariesTabEvents(container);
  }

  function bindAnniversariesTabEvents(container) {
    container.querySelectorAll('[data-char-filter]').forEach(function(chip) {
      chip.addEventListener('click', function() {
        _state.filterCharId = chip.dataset.charFilter;
        // 同步顶部小胶囊名称
        updateHeaderCharPill();
        renderAnniversariesTab();
      });
    });

    container.querySelectorAll('[data-action="toggle-pin-an"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        var an = _state.anniversaries.find(function(item) { return item.id === id; });
        if (an) {
          an.isPinned = !an.isPinned;
          an.updatedAt = Date.now();
          saveConfigKey(STORAGE_KEYS.ANNIVERSARIES, _state.anniversaries);
          renderAnniversariesTab();
        }
      });
    });

    container.querySelectorAll('[data-action="edit-an"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        var an = _state.anniversaries.find(function(item) { return item.id === id; });
        if (an) showEditAnniversaryModal(an);
      });
    });

    container.querySelectorAll('[data-action="delete-an"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        deleteAnniversary(id);
      });
    });
  }

  // ===== 8. 渲染日程 Tab (全能日程管理) =====
  function renderSchedulesTab() {
    var container = _state.pageEl.querySelector('#tc-content-scroll');
    var list = [].concat(_state.events);

    // 1. 角色筛选
    if (_state.filterCharId === 'personal') {
      list = list.filter(function(e) { return e.relationType === 'personal'; });
    } else if (_state.filterCharId !== 'all') {
      var tId = String(_state.filterCharId);
      list = list.filter(function(e) { return e.relationType === 'personal' || String(e.charId) === tId; });
    }

    // 2. 状态筛选
    if (_state.scheduleStatusFilter === 'pending') {
      list = list.filter(function(e) { return !e.completed; });
    } else if (_state.scheduleStatusFilter === 'completed') {
      list = list.filter(function(e) { return e.completed; });
    }

    // 3. 分类筛选
    if (_state.scheduleCategoryFilter !== 'all') {
      list = list.filter(function(e) { return e.category === _state.scheduleCategoryFilter; });
    }

    // 4. 搜索检索
    if (_state.scheduleSearchQuery.trim()) {
      var q = _state.scheduleSearchQuery.trim().toLowerCase();
      list = list.filter(function(e) {
        return (e.title && e.title.toLowerCase().indexOf(q) !== -1) ||
               (e.notes && e.notes.toLowerCase().indexOf(q) !== -1);
      });
    }

    // 排序：按日期升序，其次按时间
    list.sort(function(a, b) {
      if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
      return (a.startTime || '').localeCompare(b.startTime || '');
    });

    var todayStr = getTodayLocalDateStr();
    var pendingTotal = _state.events.filter(function(e) { return !e.completed; }).length;
    var completedTotal = _state.events.filter(function(e) { return e.completed; }).length;

    var html =
      '<div style="display: flex; gap: 8px; align-items: center;">' +
        '<div class="tc-search-box" style="flex: 1;">' +
          '<i class="fa fa-search"></i>' +
          '<input class="tc-search-input" id="tc-schedule-search" placeholder="搜索日程标题或备注..." value="' + esc(_state.scheduleSearchQuery) + '">' +
        '</div>' +
        '<button class="tc-btn" id="tc-btn-open-reminders" style="padding: 6px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; border-radius: var(--r-pill); background: var(--c-surface); border: 1px solid var(--c-border); color: var(--c-text); cursor: pointer;" title="智能提醒管理与免打扰设置">' +
          '<i class="fa-solid fa-bell"></i><span>提醒管理</span>' +
        '</button>' +
      '</div>' +
      '<div class="tc-filter-strip" style="margin-top: 8px;">' +
        '<button class="tc-filter-chip ' + (_state.scheduleStatusFilter === 'all' ? 'active' : '') + '" data-status="all">全部 (' + _state.events.length + ')</button>' +
        '<button class="tc-filter-chip ' + (_state.scheduleStatusFilter === 'pending' ? 'active' : '') + '" data-status="pending">待办 (' + pendingTotal + ')</button>' +
        '<button class="tc-filter-chip ' + (_state.scheduleStatusFilter === 'completed' ? 'active' : '') + '" data-status="completed">已完成 (' + completedTotal + ')</button>' +
      '</div>' +
      '<div class="tc-filter-strip" style="margin-top: 4px;">' +
        '<button class="tc-filter-chip ' + (_state.scheduleCategoryFilter === 'all' ? 'active' : '') + '" data-cat="all">全部分类</button>' +
        '<button class="tc-filter-chip ' + (_state.scheduleCategoryFilter === 'work' ? 'active' : '') + '" data-cat="work">工作</button>' +
        '<button class="tc-filter-chip ' + (_state.scheduleCategoryFilter === 'study' ? 'active' : '') + '" data-cat="study">学习</button>' +
        '<button class="tc-filter-chip ' + (_state.scheduleCategoryFilter === 'life' ? 'active' : '') + '" data-cat="life">生活</button>' +
        '<button class="tc-filter-chip ' + (_state.scheduleCategoryFilter === 'love' ? 'active' : '') + '" data-cat="love">恋爱</button>' +
        '<button class="tc-filter-chip ' + (_state.scheduleCategoryFilter === 'other' ? 'active' : '') + '" data-cat="other">其他</button>' +
      '</div>';

    if (list.length === 0) {
      html +=
        '<div class="tc-empty-state" style="padding: 60px 20px;">' +
          '<i class="fa fa-calendar-check"></i>' +
          '<span>暂无符合条件的日程，点击右下角「+」新建吧</span>' +
        '</div>';
    } else {
      html += '<div class="tc-item-list" style="margin-top: 10px;">';
      list.forEach(function(ev) {
        var catClass = 'tag-' + (ev.category || 'other');
        var catLabel = getCategoryLabel(ev.category);
        var timeLabel = ev.isAllDay ? '全天' : ((ev.startTime || '--:--') + ' ~ ' + (ev.endTime || '--:--'));
        var isToday = ev.date === todayStr;

        var hasReminder = (Array.isArray(ev.reminders) && ev.reminders.some(function(r) { return r && r.enabled !== false; })) || (ev.reminder && ev.reminder.enabled);
        var hasRepeat = ev.recurrence && ev.recurrence.type && ev.recurrence.type !== 'none';
        var reminderBadge = hasReminder ? '<span class="tc-meta-badge has-reminder" title="已设置提醒"><i class="fa fa-bell" style="font-size: 10px;"></i></span>' : '';
        var repeatBadge = hasRepeat ? '<span class="tc-meta-badge has-repeat" title="重复日程"><i class="fa fa-rotate" style="font-size: 10px;"></i></span>' : '';

        html +=
          '<div class="tc-event-item ' + (ev.completed ? 'completed' : '') + '" data-id="' + ev.id + '">' +
            '<div class="tc-checkbox ' + (ev.completed ? 'checked' : '') + '" data-action="toggle-complete" data-id="' + ev.id + '" title="完成/未完成">' +
              '<i class="fa fa-check"></i>' +
            '</div>' +
            '<div class="tc-event-info">' +
              '<div class="tc-event-title-row">' +
                '<span class="tc-event-title-text">' + esc(ev.title) + '</span>' +
                '<span class="tc-tag ' + catClass + '">' + catLabel + '</span>' +
                (isToday ? '<span class="tc-tag" style="background: var(--c-text); color: var(--c-bg);">今天</span>' : '') +
                (ev.charName ? '<span class="tc-tag">' + esc(ev.charName) + '</span>' : '') +
                reminderBadge +
                repeatBadge +
              '</div>' +
              '<div class="tc-event-meta-row">' +
                '<span><i class="fa fa-calendar-day" style="font-size: 10px;"></i> ' + esc(ev.date) + '</span>' +
                '<span><i class="fa fa-clock" style="font-size: 10px;"></i> ' + timeLabel + '</span>' +
                (ev.notes ? '<span>· ' + esc(ev.notes) + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="tc-event-actions">' +
              '<button class="tc-icon-action-btn" data-action="edit-event" data-id="' + ev.id + '" title="编辑"><i class="fa fa-pen"></i></button>' +
              '<button class="tc-icon-action-btn btn-delete" data-action="delete-event" data-id="' + ev.id + '" title="删除"><i class="fa fa-trash"></i></button>' +
            '</div>' +
          '</div>';
      });
      html += '</div>';
    }

    container.innerHTML = html;
    bindSchedulesTabEvents(container);
  }

  function bindSchedulesTabEvents(container) {
    var remindersBtn = container.querySelector('#tc-btn-open-reminders');
    if (remindersBtn) {
      remindersBtn.addEventListener('click', function() {
        showReminderCenterModal();
      });
    }

    var searchInput = container.querySelector('#tc-schedule-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        _state.scheduleSearchQuery = searchInput.value;
        renderSchedulesTab();
        // 保持聚焦
        var reInput = container.querySelector('#tc-schedule-search');
        if (reInput) {
          reInput.focus();
          reInput.setSelectionRange(reInput.value.length, reInput.value.length);
        }
      });
    }

    container.querySelectorAll('[data-status]').forEach(function(chip) {
      chip.addEventListener('click', function() {
        _state.scheduleStatusFilter = chip.dataset.status;
        renderSchedulesTab();
      });
    });

    container.querySelectorAll('[data-cat]').forEach(function(chip) {
      chip.addEventListener('click', function() {
        _state.scheduleCategoryFilter = chip.dataset.cat;
        renderSchedulesTab();
      });
    });

    container.querySelectorAll('[data-action="toggle-complete"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        toggleEventCompletion(id);
      });
    });

    container.querySelectorAll('[data-action="edit-event"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        var ev = _state.events.find(function(item) { return item.id === id; });
        if (ev) showEditEventModal(ev);
      });
    });

    container.querySelectorAll('[data-action="delete-event"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        deleteEvent(id);
      });
    });
  }

  // ===== 9. 日程操作 (增删改查) =====
  async function toggleEventCompletion(id) {
    // 检查是否为恋爱记心愿
    var linkedWish = _state.loveDiaryWishes && _state.loveDiaryWishes.find(function(w) { return w.id === id; });
    if (linkedWish && window.TimeCalendarIntegrations) {
      var nextDone = await window.TimeCalendarIntegrations.toggleLinkedItem(linkedWish);
      linkedWish.completed = nextDone;
      renderActiveTabContent();
      if (window.toast) window.toast(nextDone ? '已在恋爱记中完成心愿 🎉' : '心愿状态已重置');
      return;
    }

    // 检查是否为自习室待办
    var linkedTodo = _state.studyRoomTodos && _state.studyRoomTodos.find(function(t) { return t.id === id; });
    if (linkedTodo && window.TimeCalendarIntegrations) {
      var nextDone = await window.TimeCalendarIntegrations.toggleLinkedItem(linkedTodo);
      linkedTodo.completed = nextDone;
      renderActiveTabContent();
      if (window.toast) window.toast(nextDone ? '已在自习室中打勾完成待办 ✍️' : '自习待办状态已重置');
      return;
    }

    var ev = _state.events.find(function(e) { return e.id === id; });
    if (!ev) return;
    ev.completed = !ev.completed;
    ev.updatedAt = Date.now();
    await saveConfigKey(STORAGE_KEYS.EVENTS, _state.events);
    renderActiveTabContent();
    if (window.toast) window.toast(ev.completed ? '已完成日程「' + ev.title + '」' : '已重置为待办');
  }

  async function deleteEvent(id) {
    var linkedWish = _state.loveDiaryWishes && _state.loveDiaryWishes.find(function(w) { return w.id === id; });
    if (linkedWish) {
      if (!confirm('该任务对应恋爱记心愿小事。确定要在恋爱记中取消该心愿的履约日期关联吗？')) return;
      if (window.TimeCalendarIntegrations) {
        await window.TimeCalendarIntegrations.loveDiary.saveWish(linkedWish.source.charId, linkedWish.source.wishId, { date: '' });
      }
      await loadLoveDiaryLinkage();
      renderActiveTabContent();
      if (window.toast) window.toast('心愿日历关联已解除');
      return;
    }

    var linkedTodo = _state.studyRoomTodos && _state.studyRoomTodos.find(function(t) { return t.id === id; });
    if (linkedTodo) {
      if (!confirm('该事项来自陪伴自习室。确定要在自习室待办清单中删除吗？')) return;
      if (window.TimeCalendarIntegrations) {
        var allTodos = await window.TimeCalendarIntegrations.studyRoom.getTodos();
        var nextTodos = allTodos.filter(function(t) { return String(t.id) !== String(linkedTodo.source.todoId); });
        await window.TimeCalendarIntegrations.studyRoom.saveTodos(nextTodos);
      }
      await loadStudyRoomLinkage();
      renderActiveTabContent();
      if (window.toast) window.toast('自习室待办已删除');
      return;
    }

    var ev = _state.events.find(function(e) { return e.id === id; });
    if (!ev) return;
    if (!confirm('确定删除日程「' + ev.title + '」吗？')) return;
    _state.events = _state.events.filter(function(e) { return e.id !== id; });
    await saveConfigKey(STORAGE_KEYS.EVENTS, _state.events);
    if (window.TimeCalendarReminders && typeof window.TimeCalendarReminders.onEventDeleted === 'function') {
      await window.TimeCalendarReminders.onEventDeleted(id);
    }
    renderActiveTabContent();
    if (window.toast) window.toast('日程已删除');
  }

  async function deleteCountdown(id) {
    var srExam = _state.studyRoomExams && _state.studyRoomExams.find(function(e) { return e.id === id; });
    if (srExam) {
      if (!confirm('该倒计时来自陪伴自习室备考计划。确定要在自习室中删除该考试计划吗？')) return;
      if (window.TimeCalendarIntegrations) {
        var allExams = await window.TimeCalendarIntegrations.studyRoom.getExams();
        var nextExams = allExams.filter(function(e) { return String(e.id) !== String(srExam.source.examId); });
        await window.TimeCalendarIntegrations.studyRoom.saveExams(nextExams);
      }
      await loadStudyRoomLinkage();
      renderCountdownsTab();
      if (window.toast) window.toast('自习室考试备考计划已删除');
      return;
    }

    var cd = _state.countdowns.find(function(c) { return c.id === id; });
    if (!cd) return;
    if (!confirm('确定删除倒计时「' + cd.title + '」吗？')) return;
    _state.countdowns = _state.countdowns.filter(function(c) { return c.id !== id; });
    await saveConfigKey(STORAGE_KEYS.COUNTDOWNS, _state.countdowns);
    renderCountdownsTab();
    if (window.toast) window.toast('倒计时已删除');
  }

  async function deleteAnniversary(id) {
    var ldAn = _state.loveDiaryAnniversaries && _state.loveDiaryAnniversaries.find(function(a) { return a.id === id; });
    if (ldAn) {
      if (!confirm('该纪念日为恋爱记情侣空间专属纪念日。确定要在恋爱记中清空该纪念日吗？')) return;
      if (window.TimeCalendarIntegrations) {
        await window.TimeCalendarIntegrations.loveDiary.deleteAnniversary(ldAn.charId);
      }
      await loadLoveDiaryLinkage();
      renderAnniversariesTab();
      if (window.toast) window.toast('恋爱记纪念日已清空');
      return;
    }

    var an = _state.anniversaries.find(function(a) { return a.id === id; });
    if (!an) return;
    if (!confirm('确定删除纪念日「' + an.title + '」吗？')) return;
    _state.anniversaries = _state.anniversaries.filter(function(a) { return a.id !== id; });
    await saveConfigKey(STORAGE_KEYS.ANNIVERSARIES, _state.anniversaries);
    renderAnniversariesTab();
    if (window.toast) window.toast('纪念日已删除');
  }

  // ===== 10. 弹窗表单 (日程、倒计时、纪念日、角色筛选) =====

  // 1. 新增/编辑日程弹窗
  function showAddEventModal(defaultDateStr) {
    showEditEventModal({
      id: '',
      title: '',
      date: defaultDateStr || _state.selectedDateStr || getTodayLocalDateStr(),
      isAllDay: true,
      startTime: '09:00',
      endTime: '10:00',
      category: 'work',
      relationType: 'personal',
      charId: null,
      notes: '',
      showInCountdown: false,
      completed: false
    });
  }

  function renderReminderRuleRowHtml(rule) {
    var ruleId = rule.id || uid('rule');
    var mins = typeof rule.advanceMinutes === 'number' ? rule.advanceMinutes : 15;
    var isCustom = [0, 5, 15, 30, 60, 1440, 4320].indexOf(mins) < 0;
    var selVal = isCustom ? 'custom' : String(mins);

    return (
      '<div class="tc-reminder-rule-item" data-rule-id="' + ruleId + '">' +
        '<div class="tc-reminder-rule-left">' +
          '<i class="fa-solid fa-bell"></i>' +
          '<select class="tc-rule-select">' +
            '<option value="0" ' + (selVal === '0' ? 'selected' : '') + '>事件开始时</option>' +
            '<option value="5" ' + (selVal === '5' ? 'selected' : '') + '>提前 5 分钟</option>' +
            '<option value="15" ' + (selVal === '15' ? 'selected' : '') + '>提前 15 分钟</option>' +
            '<option value="30" ' + (selVal === '30' ? 'selected' : '') + '>提前 30 分钟</option>' +
            '<option value="60" ' + (selVal === '60' ? 'selected' : '') + '>提前 1 小时</option>' +
            '<option value="1440" ' + (selVal === '1440' ? 'selected' : '') + '>提前 1 天</option>' +
            '<option value="4320" ' + (selVal === '4320' ? 'selected' : '') + '>提前 3 天</option>' +
            '<option value="custom" ' + (selVal === 'custom' ? 'selected' : '') + '>自定义提前时间...</option>' +
          '</select>' +
          '<input type="number" class="tc-rule-custom-input tc-form-input" style="width: 70px; padding: 2px 6px; font-size: 12px; display: ' + (isCustom ? 'inline-block' : 'none') + ';" placeholder="分钟" min="1" max="43200" value="' + (isCustom ? mins : '15') + '">' +
        '</div>' +
        '<button type="button" class="tc-rule-delete-btn" title="删除此条提醒"><i class="fa fa-trash-can"></i></button>' +
      '</div>'
    );
  }

  function showEditEventModal(ev) {
    var isNew = !ev.id;
    var overlay = document.createElement('div');
    overlay.className = 'tc-modal-overlay';

    var currentReminders = [];
    if (Array.isArray(ev.reminders) && ev.reminders.length > 0) {
      currentReminders = JSON.parse(JSON.stringify(ev.reminders));
    } else if (ev.reminder && ev.reminder.enabled) {
      currentReminders = [{
        id: uid('rule'),
        advanceMinutes: typeof ev.reminder.advanceMinutes === 'number' ? ev.reminder.advanceMinutes : 15,
        enabled: true
      }];
    }
    var currentRecurrence = ev.recurrence || { type: 'none', interval: 1, endDate: '' };

    var charOptionsHtml = '<option value="personal">个人事件 (不关联特定角色)</option>';
    _state.allCharacters.forEach(function(c) {
      var sel = (ev.relationType === 'specificChar' && String(ev.charId) === String(c.id)) ? 'selected' : '';
      charOptionsHtml += '<option value="' + c.id + '" ' + sel + '>指定角色：' + esc(c.name) + '</option>';
    });

    var rulesHtml = '';
    currentReminders.forEach(function(r) {
      rulesHtml += renderReminderRuleRowHtml(r);
    });

    var linkedBannerHtml = '';
    if (ev.source && ev.source.app === 'love-diary') {
      linkedBannerHtml =
        '<div class="tc-linked-source-banner love-diary">' +
          '<span><i class="fa-solid fa-heart"></i> 来自「恋爱记」心愿清单 · 权威源双向联动</span>' +
          '<button type="button" class="tc-btn-jump" id="tc-jump-source-modal">前往恋爱记 <i class="fa fa-arrow-up-right-from-square"></i></button>' +
        '</div>';
    } else if (ev.source && ev.source.app === 'study-room') {
      linkedBannerHtml =
        '<div class="tc-linked-source-banner study-room">' +
          '<span><i class="fa-solid fa-book-open"></i> 来自「陪伴自习室」待办清单 · 权威源双向联动</span>' +
          '<button type="button" class="tc-btn-jump" id="tc-jump-source-modal">前往自习室 <i class="fa fa-arrow-up-right-from-square"></i></button>' +
        '</div>';
    }

    overlay.innerHTML =
      '<div class="tc-modal-dialog">' +
        '<div class="tc-modal-header">' +
          '<div class="tc-modal-title">' + (isNew ? '新建日程' : '编辑日程') + '</div>' +
          '<button class="tc-modal-close-btn" id="tc-modal-close"><i class="fa fa-xmark"></i></button>' +
        '</div>' +
        '<div class="tc-modal-body">' +
          linkedBannerHtml +
          '<div class="tc-form-group">' +
            '<label class="tc-form-label">日程标题 *</label>' +
            '<input class="tc-form-input" id="tc-evt-title" placeholder="如：复习高数第三章、与林弯弯看电影..." value="' + esc(ev.title) + '">' +
          '</div>' +
          '<div class="tc-form-row">' +
            '<div class="tc-form-group">' +
              '<label class="tc-form-label">日期 *</label>' +
              '<input type="date" class="tc-form-input" id="tc-evt-date" value="' + esc(ev.date) + '">' +
            '</div>' +
            '<div class="tc-form-group">' +
              '<label class="tc-form-label">分类</label>' +
              '<select class="tc-form-select" id="tc-evt-cat">' +
                '<option value="work" ' + (ev.category === 'work' ? 'selected' : '') + '>工作</option>' +
                '<option value="study" ' + (ev.category === 'study' ? 'selected' : '') + '>学习</option>' +
                '<option value="life" ' + (ev.category === 'life' ? 'selected' : '') + '>生活</option>' +
                '<option value="love" ' + (ev.category === 'love' ? 'selected' : '') + '>恋爱</option>' +
                '<option value="anniversary" ' + (ev.category === 'anniversary' ? 'selected' : '') + '>纪念</option>' +
                '<option value="other" ' + (ev.category === 'other' ? 'selected' : '') + '>其他</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="tc-toggle-row">' +
            '<span class="tc-toggle-desc">全天事件</span>' +
            '<label class="tc-switch">' +
              '<input type="checkbox" id="tc-evt-allday" ' + (ev.isAllDay ? 'checked' : '') + '>' +
              '<span class="tc-slider"></span>' +
            '</label>' +
          '</div>' +
          '<div class="tc-form-row" id="tc-time-range-row" style="' + (ev.isAllDay ? 'display: none;' : '') + '">' +
            '<div class="tc-form-group">' +
              '<label class="tc-form-label">开始时间</label>' +
              '<input type="time" class="tc-form-input" id="tc-evt-start" value="' + esc(ev.startTime || '09:00') + '">' +
            '</div>' +
            '<div class="tc-form-group">' +
              '<label class="tc-form-label">结束时间</label>' +
              '<input type="time" class="tc-form-input" id="tc-evt-end" value="' + esc(ev.endTime || '10:00') + '">' +
            '</div>' +
          '</div>' +

          '<!-- 重复设置 -->' +
          '<div class="tc-recurrence-panel">' +
            '<div class="tc-form-row">' +
              '<div class="tc-form-group">' +
                '<label class="tc-form-label">重复规则</label>' +
                '<select class="tc-form-select" id="tc-evt-rec-type">' +
                  '<option value="none" ' + (currentRecurrence.type === 'none' ? 'selected' : '') + '>不重复</option>' +
                  '<option value="daily" ' + (currentRecurrence.type === 'daily' ? 'selected' : '') + '>每天</option>' +
                  '<option value="weekly" ' + (currentRecurrence.type === 'weekly' ? 'selected' : '') + '>每周</option>' +
                  '<option value="monthly" ' + (currentRecurrence.type === 'monthly' ? 'selected' : '') + '>每月</option>' +
                  '<option value="yearly" ' + (currentRecurrence.type === 'yearly' ? 'selected' : '') + '>每年</option>' +
                  '<option value="custom" ' + (currentRecurrence.type === 'custom' ? 'selected' : '') + '>自定义天数间隔</option>' +
                '</select>' +
              '</div>' +
              '<div class="tc-form-group" id="tc-rec-interval-group" style="' + (currentRecurrence.type === 'custom' ? '' : 'display: none;') + '">' +
                '<label class="tc-form-label">间隔天数</label>' +
                '<input type="number" min="1" class="tc-form-input" id="tc-evt-rec-interval" value="' + (currentRecurrence.interval || 1) + '">' +
              '</div>' +
            '</div>' +
            '<div class="tc-form-group" id="tc-rec-end-group" style="' + (currentRecurrence.type && currentRecurrence.type !== 'none' ? '' : 'display: none;') + '">' +
              '<label class="tc-form-label">重复截止日期 (选填，留空永不结束)</label>' +
              '<input type="date" class="tc-form-input" id="tc-evt-rec-end" value="' + esc(currentRecurrence.endDate || '') + '">' +
            '</div>' +
          '</div>' +

          '<!-- 智能多提醒规则设置 -->' +
          '<div class="tc-reminders-section">' +
            '<div class="tc-reminders-section-header">' +
              '<span><i class="fa-solid fa-bell" style="margin-right: 4px;"></i>日程提醒</span>' +
              '<button type="button" class="tc-btn-add-reminder" id="tc-btn-add-rule"><i class="fa fa-plus"></i> 添加提醒</button>' +
            '</div>' +
            '<div id="tc-rules-container" style="display: flex; flex-direction: column; gap: 6px;">' +
              rulesHtml +
            '</div>' +
            '<div style="font-size: 11px; color: var(--c-text-muted); margin-top: 2px;">' +
              '<i class="fa fa-circle-info"></i> 全天事件将以系统 09:00 作为基准计算提醒时间；可添加多个提前提醒节点。' +
            '</div>' +
          '</div>' +

          '<div class="tc-form-group" style="margin-top: 10px;">' +
            '<label class="tc-form-label">角色关联</label>' +
            '<select class="tc-form-select" id="tc-evt-char">' +
              charOptionsHtml +
            '</select>' +
          '</div>' +
          '<div class="tc-toggle-row">' +
            '<span class="tc-toggle-desc">同步在「倒计时」中展示</span>' +
            '<label class="tc-switch">' +
              '<input type="checkbox" id="tc-evt-countdown" ' + (ev.showInCountdown ? 'checked' : '') + '>' +
              '<span class="tc-slider"></span>' +
            '</label>' +
          '</div>' +
          '<div class="tc-form-group">' +
            '<label class="tc-form-label">备注</label>' +
            '<textarea class="tc-form-textarea" id="tc-evt-notes" rows="2" placeholder="输入相关补充信息或准备事项...">' + esc(ev.notes || '') + '</textarea>' +
          '</div>' +
        '</div>' +
        '<div class="tc-modal-footer">' +
          '<button class="tc-btn" id="tc-modal-cancel">取消</button>' +
          '<button class="tc-btn tc-btn-primary" id="tc-modal-save">保存</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var allDayToggle = overlay.querySelector('#tc-evt-allday');
    var timeRow = overlay.querySelector('#tc-time-range-row');
    allDayToggle.addEventListener('change', function() {
      timeRow.style.display = allDayToggle.checked ? 'none' : 'flex';
    });

    // 重复类型联动
    var recTypeSelect = overlay.querySelector('#tc-evt-rec-type');
    var recIntervalGroup = overlay.querySelector('#tc-rec-interval-group');
    var recEndGroup = overlay.querySelector('#tc-rec-end-group');
    recTypeSelect.addEventListener('change', function() {
      var val = recTypeSelect.value;
      recEndGroup.style.display = (val !== 'none') ? 'block' : 'none';
      recIntervalGroup.style.display = (val === 'custom') ? 'block' : 'none';
    });

    // 提醒规则绑定
    var rulesContainer = overlay.querySelector('#tc-rules-container');
    function bindRuleItemEvents(item) {
      var sel = item.querySelector('.tc-rule-select');
      var customInput = item.querySelector('.tc-rule-custom-input');
      var delBtn = item.querySelector('.tc-rule-delete-btn');

      sel.addEventListener('change', function() {
        customInput.style.display = (sel.value === 'custom') ? 'inline-block' : 'none';
      });

      delBtn.addEventListener('click', function() {
        item.remove();
      });
    }

    rulesContainer.querySelectorAll('.tc-reminder-rule-item').forEach(bindRuleItemEvents);

    overlay.querySelector('#tc-btn-add-rule').addEventListener('click', function() {
      var temp = document.createElement('div');
      temp.innerHTML = renderReminderRuleRowHtml({ id: uid('rule'), advanceMinutes: 15, enabled: true });
      var newEl = temp.firstElementChild;
      rulesContainer.appendChild(newEl);
      bindRuleItemEvents(newEl);
    });

    var jumpSourceBtn = overlay.querySelector('#tc-jump-source-modal');
    if (jumpSourceBtn) {
      jumpSourceBtn.addEventListener('click', function() {
        overlay.remove();
        if (window.TimeCalendarIntegrations) {
          window.TimeCalendarIntegrations.navigate(ev.source);
        }
      });
    }

    overlay.querySelector('#tc-modal-close').addEventListener('click', function() { overlay.remove(); });
    overlay.querySelector('#tc-modal-cancel').addEventListener('click', function() { overlay.remove(); });

    overlay.querySelector('#tc-modal-save').addEventListener('click', async function() {
      var title = overlay.querySelector('#tc-evt-title').value.trim();
      var date = overlay.querySelector('#tc-evt-date').value;
      if (!title) {
        alert('请输入日程标题');
        return;
      }
      if (!date) {
        alert('请选择日程日期');
        return;
      }

      var isAllDay = allDayToggle.checked;
      var startTime = isAllDay ? '' : overlay.querySelector('#tc-evt-start').value;
      var endTime = isAllDay ? '' : overlay.querySelector('#tc-evt-end').value;
      var cat = overlay.querySelector('#tc-evt-cat').value;
      var charVal = overlay.querySelector('#tc-evt-char').value;
      var showCd = overlay.querySelector('#tc-evt-countdown').checked;
      var notes = overlay.querySelector('#tc-evt-notes').value.trim();

      var relType = charVal === 'personal' ? 'personal' : 'specificChar';
      var charId = charVal === 'personal' ? null : charVal;
      var charObj = charId ? _state.allCharacters.find(function(c) { return String(c.id) === String(charId); }) : null;
      var charName = charObj ? charObj.name : '';

      // 提取重复规则
      var rType = recTypeSelect.value;
      var rInterval = parseInt(overlay.querySelector('#tc-evt-rec-interval').value, 10) || 1;
      var rEndDate = overlay.querySelector('#tc-evt-rec-end').value || '';
      var recurrence = {
        type: rType,
        interval: rInterval,
        endDate: rEndDate
      };

      // 提取提醒规则
      var reminderRules = [];
      rulesContainer.querySelectorAll('.tc-reminder-rule-item').forEach(function(item) {
        var rId = item.dataset.ruleId || uid('rule');
        var selVal = item.querySelector('.tc-rule-select').value;
        var adv = 15;
        if (selVal === 'custom') {
          adv = parseInt(item.querySelector('.tc-rule-custom-input').value, 10);
          if (isNaN(adv) || adv < 0) adv = 15;
        } else {
          adv = parseInt(selVal, 10);
        }
        reminderRules.push({
          id: rId,
          advanceMinutes: adv,
          enabled: true
        });
      });

      // 阶段 3: 权威数据源联动写回拦截 (不污染本地 events 造成双份拷贝)
      if (ev && ev.source && ev.source.app === 'love-diary') {
        if (window.TimeCalendarIntegrations) {
          await window.TimeCalendarIntegrations.saveLinkedItem({
            source: ev.source,
            title: title,
            date: date,
            notes: notes,
            completed: ev.completed
          });
        }
        await loadLoveDiaryLinkage();
        overlay.remove();
        renderActiveTabContent();
        if (window.toast) window.toast('心愿已同步更新至恋爱记');
        return;
      }

      if (ev && ev.source && ev.source.app === 'study-room') {
        if (window.TimeCalendarIntegrations) {
          await window.TimeCalendarIntegrations.saveLinkedItem({
            source: ev.source,
            title: title,
            date: date,
            notes: notes,
            startTime: startTime,
            completed: ev.completed
          });
        }
        await loadStudyRoomLinkage();
        overlay.remove();
        renderActiveTabContent();
        if (window.toast) window.toast('自习待办已同步更新至自习室');
        return;
      }

      var now = Date.now();
      if (isNew) {
        var newEvent = {
          id: uid('tc_evt'),
          title: title,
          date: date,
          isAllDay: isAllDay,
          startTime: startTime,
          endTime: endTime,
          category: cat,
          relationType: relType,
          charId: charId,
          charName: charName,
          notes: notes,
          showInCountdown: showCd,
          completed: false,
          isPinned: false,
          createdAt: now,
          updatedAt: now,
          reminders: reminderRules,
          recurrence: recurrence,
          reminder: {
            enabled: reminderRules.length > 0,
            type: 'notification',
            advanceMinutes: reminderRules[0] ? reminderRules[0].advanceMinutes : 15
          },
          source: { app: 'timeCalendar', recordId: '', readOnly: false },
          care: { lastCheckedAt: 0, note: '' }
        };
        _state.events.push(newEvent);
      } else {
        ev.title = title;
        ev.date = date;
        ev.isAllDay = isAllDay;
        ev.startTime = startTime;
        ev.endTime = endTime;
        ev.category = cat;
        ev.relationType = relType;
        ev.charId = charId;
        ev.charName = charName;
        ev.notes = notes;
        ev.showInCountdown = showCd;
        ev.updatedAt = now;
        ev.reminders = reminderRules;
        ev.recurrence = recurrence;
        ev.reminder = {
          enabled: reminderRules.length > 0,
          type: 'notification',
          advanceMinutes: reminderRules[0] ? reminderRules[0].advanceMinutes : 15
        };
      }

      await saveConfigKey(STORAGE_KEYS.EVENTS, _state.events);
      if (window.TimeCalendarReminders) {
        if (typeof window.TimeCalendarReminders.onEventUpdated === 'function') {
          await window.TimeCalendarReminders.onEventUpdated(isNew ? newEvent.id : ev.id, date, reminderRules);
        } else {
          window.TimeCalendarReminders.checkReminders();
        }
      }

      overlay.remove();
      renderActiveTabContent();
      if (window.toast) window.toast(isNew ? '日程已创建' : '日程已更新');
    });
  }

  // 3. 提醒管理中心弹窗
  async function showReminderCenterModal() {
    var overlay = document.createElement('div');
    overlay.className = 'tc-modal-overlay';

    var reminderEngine = window.TimeCalendarReminders;
    var settings = reminderEngine ? reminderEngine.getSettings() : {
      dndEnabled: false,
      dndStart: '23:00',
      dndEnd: '08:00',
      dndAction: 'defer',
      allDayReminderTime: '09:00',
      soundEnabled: true
    };

    var currentTab = 'upcoming'; // 'upcoming' | 'delivered' | 'expired' | 'disabled'

    overlay.innerHTML =
      '<div class="tc-modal-dialog tc-reminder-center-dialog">' +
        '<div class="tc-modal-header">' +
          '<div class="tc-modal-title"><i class="fa-solid fa-bell" style="margin-right: 6px;"></i>智能提醒管理</div>' +
          '<button class="tc-modal-close-btn" id="tc-reminder-center-close"><i class="fa fa-xmark"></i></button>' +
        '</div>' +
        '<div class="tc-reminder-center-body">' +
          '<!-- 免打扰与提醒基础配置卡片 -->' +
          '<div class="tc-dnd-card">' +
            '<div class="tc-dnd-header">' +
              '<span class="tc-dnd-title"><i class="fa-solid fa-moon"></i> 免打扰模式 (DND)</span>' +
              '<label class="tc-switch">' +
                '<input type="checkbox" id="tc-dnd-toggle" ' + (settings.dndEnabled ? 'checked' : '') + '>' +
                '<span class="tc-slider"></span>' +
              '</label>' +
            '</div>' +
            '<div class="tc-dnd-body" id="tc-dnd-details">' +
              '<div class="tc-dnd-time-row">' +
                '<span>免打扰区间：</span>' +
                '<input type="time" class="tc-form-input" id="tc-dnd-start" style="width: 80px; padding: 2px 6px; font-size: 12px;" value="' + esc(settings.dndStart || '23:00') + '">' +
                '<span>至</span>' +
                '<input type="time" class="tc-form-input" id="tc-dnd-end" style="width: 80px; padding: 2px 6px; font-size: 12px;" value="' + esc(settings.dndEnd || '08:00') + '">' +
              '</div>' +
              '<div style="display: flex; align-items: center; gap: 8px;">' +
                '<span>期间策略：</span>' +
                '<select class="tc-form-select" id="tc-dnd-action" style="flex: 1; padding: 3px 6px; font-size: 12px;">' +
                  '<option value="defer" ' + (settings.dndAction === 'defer' ? 'selected' : '') + '>顺延至免打扰结束后提醒 (推荐)</option>' +
                  '<option value="silent" ' + (settings.dndAction === 'silent' ? 'selected' : '') + '>静默记入记录，不弹出打扰</option>' +
                '</select>' +
              '</div>' +
              '<div style="display: flex; align-items: center; justify-content: space-between; padding-top: 4px; border-top: 1px dashed var(--c-border);">' +
                '<span>全天事件默认提醒时间：</span>' +
                '<input type="time" class="tc-form-input" id="tc-allday-time" style="width: 80px; padding: 2px 6px; font-size: 12px;" value="' + esc(settings.allDayReminderTime || '09:00') + '">' +
              '</div>' +
              '<div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">' +
                '<button class="tc-btn" id="tc-btn-test-notif" style="padding: 4px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">' +
                  '<i class="fa fa-paper-plane"></i> 测试通知与音效' +
                '</button>' +
                '<button class="tc-btn tc-btn-primary" id="tc-btn-save-dnd" style="padding: 4px 12px; font-size: 11px;">保存配置</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<!-- 四状态筛选标签 -->' +
          '<div class="tc-reminder-tabs">' +
            '<button class="tc-reminder-tab-btn active" data-tab="upcoming">即将提醒</button>' +
            '<button class="tc-reminder-tab-btn" data-tab="delivered">已提醒</button>' +
            '<button class="tc-reminder-tab-btn" data-tab="expired">已过期</button>' +
            '<button class="tc-reminder-tab-btn" data-tab="disabled">已关闭</button>' +
          '</div>' +

          '<!-- 提醒列表内容容器 -->' +
          '<div id="tc-reminders-list-container" style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">' +
          '</div>' +
        '</div>' +
        '<div class="tc-modal-footer">' +
          '<button class="tc-btn tc-btn-primary" id="tc-reminder-center-done">完成</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var listContainer = overlay.querySelector('#tc-reminders-list-container');

    async function renderReminderList() {
      listContainer.innerHTML = '<div class="tc-empty-state"><i class="fa fa-spinner fa-spin"></i><span>正在载入提醒数据...</span></div>';
      var allItems = reminderEngine ? (await reminderEngine.getReminderManagementData()) : [];
      var filtered = allItems.filter(function(item) {
        return item.status === currentTab;
      });

      if (filtered.length === 0) {
        var emptyLabels = {
          upcoming: '暂无即将提醒的日程',
          delivered: '暂无已触发提醒记录',
          expired: '暂无已过期或错过的提醒',
          disabled: '暂无已关闭的提醒规则'
        };
        listContainer.innerHTML =
          '<div class="tc-empty-state" style="padding: 40px 10px;">' +
            '<i class="fa-regular fa-bell-slash"></i>' +
            '<span>' + (emptyLabels[currentTab] || '暂无数据') + '</span>' +
          '</div>';
        return;
      }

      var html = '';
      filtered.forEach(function(item) {
        var advText = '';
        if (item.advanceMinutes === 0) advText = '开始时提醒';
        else if (item.advanceMinutes < 60) advText = '提前 ' + item.advanceMinutes + ' 分钟';
        else if (item.advanceMinutes < 1440) advText = '提前 ' + Math.round(item.advanceMinutes / 60) + ' 小时';
        else advText = '提前 ' + Math.round(item.advanceMinutes / 1440) + ' 天';

        var catLabel = getCategoryLabel(item.category);

        html +=
          '<div class="tc-reminder-item-card" data-event-id="' + item.eventId + '" data-rule-id="' + item.ruleId + '" data-key="' + item.key + '">' +
            '<div class="tc-reminder-item-info">' +
              '<div class="tc-reminder-item-title-row">' +
                '<span class="tc-reminder-item-title">' + esc(item.eventTitle) + '</span>' +
                '<span class="tc-tag tag-' + (item.category || 'other') + '">' + catLabel + '</span>' +
                (item.recurrence && item.recurrence.type !== 'none' ? '<span class="tc-tag"><i class="fa fa-rotate" style="font-size: 10px;"></i> 重复</span>' : '') +
              '</div>' +
              '<div class="tc-reminder-item-meta">' +
                '<span><i class="fa-regular fa-calendar" style="font-size: 11px;"></i> ' + esc(item.occurrenceDate) + ' ' + (item.isAllDay ? '全天' : item.timeStr) + '</span>' +
                '<span>· ' + esc(advText) + '</span>' +
                '<span>· <b style="color: var(--c-text); font-weight: 500;">' + esc(item.statusLabel) + '</b></span>' +
              '</div>' +
            '</div>' +
            '<div class="tc-reminder-item-actions">' +
              (currentTab === 'upcoming' || currentTab === 'delivered' ?
                '<button class="tc-btn" data-action="snooze-15" style="padding: 3px 8px; font-size: 11px;" title="延后 15 分钟提醒"><i class="fa-solid fa-clock-rotate-left"></i> 稍后</button>' : '') +
              (currentTab !== 'disabled' ?
                '<button class="tc-btn" data-action="toggle-rule" data-enabled="false" style="padding: 3px 8px; font-size: 11px;" title="关闭此提醒规则"><i class="fa fa-pause"></i> 关闭</button>' :
                '<button class="tc-btn" data-action="toggle-rule" data-enabled="true" style="padding: 3px 8px; font-size: 11px;" title="重新开启此提醒规则"><i class="fa fa-play"></i> 开启</button>') +
              '<button class="tc-icon-action-btn btn-delete" data-action="delete-rule" title="删除此条提醒规则 (不删除原日程)"><i class="fa fa-trash"></i></button>' +
              '<button class="tc-icon-action-btn" data-action="edit-event" title="编辑原日程"><i class="fa fa-arrow-up-right-from-square"></i></button>' +
            '</div>' +
          '</div>';
      });

      listContainer.innerHTML = html;
      bindReminderListCardEvents();
    }

    function bindReminderListCardEvents() {
      listContainer.querySelectorAll('[data-action="snooze-15"]').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var card = btn.closest('.tc-reminder-item-card');
          var key = card.dataset.key;
          if (reminderEngine) {
            await reminderEngine.applySnooze(key, 15);
            renderReminderList();
          }
        });
      });

      listContainer.querySelectorAll('[data-action="toggle-rule"]').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var card = btn.closest('.tc-reminder-item-card');
          var evId = card.dataset.eventId;
          var ruleId = card.dataset.ruleId;
          var toEnable = btn.dataset.enabled === 'true';
          if (reminderEngine) {
            await reminderEngine.toggleRuleEnabled(evId, ruleId, toEnable);
            await loadTimeCalendarData();
            renderReminderList();
            if (window.toast) window.toast(toEnable ? '提醒规则已开启' : '提醒规则已关闭');
          }
        });
      });

      listContainer.querySelectorAll('[data-action="delete-rule"]').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var card = btn.closest('.tc-reminder-item-card');
          var evId = card.dataset.eventId;
          var ruleId = card.dataset.ruleId;
          if (!confirm('确定删除该日程的这条提醒规则吗？(原日程不会被删除)')) return;
          if (reminderEngine) {
            await reminderEngine.deleteRule(evId, ruleId);
            await loadTimeCalendarData();
            renderReminderList();
            if (window.toast) window.toast('提醒规则已删除');
          }
        });
      });

      listContainer.querySelectorAll('[data-action="edit-event"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var card = btn.closest('.tc-reminder-item-card');
          var evId = card.dataset.eventId;
          var ev = _state.events.find(function(item) { return item.id === evId; });
          if (ev) {
            overlay.remove();
            showEditEventModal(ev);
          }
        });
      });
    }

    // 切换标签
    overlay.querySelectorAll('.tc-reminder-tab-btn').forEach(function(tabBtn) {
      tabBtn.addEventListener('click', function() {
        overlay.querySelectorAll('.tc-reminder-tab-btn').forEach(function(b) { b.classList.remove('active'); });
        tabBtn.classList.add('active');
        currentTab = tabBtn.dataset.tab;
        renderReminderList();
      });
    });

    // 保存免打扰配置
    overlay.querySelector('#tc-btn-save-dnd').addEventListener('click', async function() {
      var dndOn = overlay.querySelector('#tc-dnd-toggle').checked;
      var dndStart = overlay.querySelector('#tc-dnd-start').value;
      var dndEnd = overlay.querySelector('#tc-dnd-end').value;
      var dndAction = overlay.querySelector('#tc-dnd-action').value;
      var allDayTime = overlay.querySelector('#tc-allday-time').value;

      if (reminderEngine) {
        await reminderEngine.updateSettings({
          dndEnabled: dndOn,
          dndStart: dndStart,
          dndEnd: dndEnd,
          dndAction: dndAction,
          allDayReminderTime: allDayTime
        });
      }
      if (window.toast) window.toast('提醒与免打扰设置已保存');
    });

    // 测试提醒通知
    overlay.querySelector('#tc-btn-test-notif').addEventListener('click', async function() {
      if (reminderEngine) {
        await reminderEngine.testReminderNotification();
      }
    });

    overlay.querySelector('#tc-reminder-center-close').addEventListener('click', function() { overlay.remove(); });
    overlay.querySelector('#tc-reminder-center-done').addEventListener('click', function() { overlay.remove(); });

    // 初始渲染列表
    renderReminderList();
  }

  // 2. 新增/编辑倒计时弹窗
  function showAddCountdownModal() {
    showEditCountdownModal({
      id: '',
      title: '',
      targetDate: getTodayLocalDateStr(),
      category: 'exam',
      relationType: 'personal',
      charId: null,
      isPinned: false,
      notes: ''
    });
  }

  function showEditCountdownModal(cd) {
    var isNew = !cd.id;
    var overlay = document.createElement('div');
    overlay.className = 'tc-modal-overlay';

    var charOptionsHtml = '<option value="personal">仅个人</option>';
    _state.allCharacters.forEach(function(c) {
      var sel = (cd.relationType === 'specificChar' && String(cd.charId) === String(c.id)) ? 'selected' : '';
      charOptionsHtml += '<option value="' + c.id + '" ' + sel + '>专属角色：' + esc(c.name) + '</option>';
    });

    var linkedBannerHtml = '';
    if (cd && cd.source && cd.source.app === 'study-room') {
      linkedBannerHtml =
        '<div class="tc-linked-source-banner study-room">' +
          '<span><i class="fa-solid fa-book-open"></i> 来自「陪伴自习室」备考计划 · 倒计时双向联动</span>' +
          '<button type="button" class="tc-btn-jump" id="tc-jump-source-cd-modal">前往自习室 <i class="fa fa-arrow-up-right-from-square"></i></button>' +
        '</div>';
    }

    overlay.innerHTML =
      '<div class="tc-modal-dialog">' +
        '<div class="tc-modal-header">' +
          '<div class="tc-modal-title">' + (isNew ? '新建倒计时' : '编辑倒计时') + '</div>' +
          '<button class="tc-modal-close-btn" id="tc-modal-close"><i class="fa fa-xmark"></i></button>' +
        '</div>' +
        '<div class="tc-modal-body">' +
          linkedBannerHtml +
          '<div class="tc-form-group">' +
            '<label class="tc-form-label">事件名称 *</label>' +
            '<input class="tc-form-input" id="tc-cd-title" placeholder="如：期末考试、考研倒计时、元旦假期..." value="' + esc(cd.title) + '">' +
          '</div>' +
          '<div class="tc-form-row">' +
            '<div class="tc-form-group">' +
              '<label class="tc-form-label">目标日期 *</label>' +
              '<input type="date" class="tc-form-input" id="tc-cd-date" value="' + esc(cd.targetDate) + '">' +
            '</div>' +
            '<div class="tc-form-group">' +
              '<label class="tc-form-label">分类</label>' +
              '<select class="tc-form-select" id="tc-cd-cat">' +
                '<option value="exam" ' + (cd.category === 'exam' ? 'selected' : '') + '>考试</option>' +
                '<option value="target" ' + (cd.category === 'target' ? 'selected' : '') + '>目标</option>' +
                '<option value="anniversary" ' + (cd.category === 'anniversary' ? 'selected' : '') + '>纪念日</option>' +
                '<option value="birthday" ' + (cd.category === 'birthday' ? 'selected' : '') + '>生日</option>' +
                '<option value="life" ' + (cd.category === 'life' ? 'selected' : '') + '>生活</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="tc-form-group">' +
            '<label class="tc-form-label">角色关联</label>' +
            '<select class="tc-form-select" id="tc-cd-char">' +
              charOptionsHtml +
            '</select>' +
          '</div>' +
          '<div class="tc-toggle-row">' +
            '<span class="tc-toggle-desc">置顶显示</span>' +
            '<label class="tc-switch">' +
              '<input type="checkbox" id="tc-cd-pin" ' + (cd.isPinned ? 'checked' : '') + '>' +
              '<span class="tc-slider"></span>' +
            '</label>' +
          '</div>' +
          '<div class="tc-form-group">' +
            '<label class="tc-form-label">备注</label>' +
            '<textarea class="tc-form-textarea" id="tc-cd-notes" rows="2" placeholder="输入备注...">' + esc(cd.notes || '') + '</textarea>' +
          '</div>' +
        '</div>' +
        '<div class="tc-modal-footer">' +
          '<button class="tc-btn" id="tc-modal-cancel">取消</button>' +
          '<button class="tc-btn tc-btn-primary" id="tc-modal-save">保存</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var jumpCdBtn = overlay.querySelector('#tc-jump-source-cd-modal');
    if (jumpCdBtn) {
      jumpCdBtn.addEventListener('click', function() {
        overlay.remove();
        if (window.TimeCalendarIntegrations) {
          window.TimeCalendarIntegrations.navigate(cd.source);
        }
      });
    }

    overlay.querySelector('#tc-modal-close').addEventListener('click', function() { overlay.remove(); });
    overlay.querySelector('#tc-modal-cancel').addEventListener('click', function() { overlay.remove(); });

    overlay.querySelector('#tc-modal-save').addEventListener('click', async function() {
      var title = overlay.querySelector('#tc-cd-title').value.trim();
      var targetDate = overlay.querySelector('#tc-cd-date').value;
      if (!title) {
        alert('请输入倒计时名称');
        return;
      }
      if (!targetDate) {
        alert('请选择目标日期');
        return;
      }

      var cat = overlay.querySelector('#tc-cd-cat').value;
      var charVal = overlay.querySelector('#tc-cd-char').value;
      var isPinned = overlay.querySelector('#tc-cd-pin').checked;
      var notes = overlay.querySelector('#tc-cd-notes').value.trim();

      var relType = charVal === 'personal' ? 'personal' : 'specificChar';
      var charId = charVal === 'personal' ? null : charVal;
      var charObj = charId ? _state.allCharacters.find(function(c) { return String(c.id) === String(charId); }) : null;
      var charName = charObj ? charObj.name : '';

      // 阶段 3: 自习室备考计划权威源联动保存
      if (cd && cd.source && cd.source.app === 'study-room') {
        if (window.TimeCalendarIntegrations) {
          await window.TimeCalendarIntegrations.studyRoom.saveExam({
            source: cd.source,
            id: cd.id,
            title: title,
            targetDate: targetDate,
            notes: notes,
            isPinned: isPinned,
            charId: charId
          });
        }
        await loadStudyRoomLinkage();
        overlay.remove();
        renderCountdownsTab();
        if (window.toast) window.toast('备考计划已同步更新至自习室');
        return;
      }

      var now = Date.now();
      if (isNew) {
        var newCd = {
          id: uid('tc_cd'),
          title: title,
          targetDate: targetDate,
          category: cat,
          relationType: relType,
          charId: charId,
          charName: charName,
          isPinned: isPinned,
          notes: notes,
          createdAt: now,
          updatedAt: now,
          source: { app: 'timeCalendar', recordId: '', readOnly: false }
        };
        _state.countdowns.push(newCd);
      } else {
        cd.title = title;
        cd.targetDate = targetDate;
        cd.category = cat;
        cd.relationType = relType;
        cd.charId = charId;
        cd.charName = charName;
        cd.isPinned = isPinned;
        cd.notes = notes;
        cd.updatedAt = now;
      }

      await saveConfigKey(STORAGE_KEYS.COUNTDOWNS, _state.countdowns);
      overlay.remove();
      renderCountdownsTab();
      if (window.toast) window.toast(isNew ? '倒计时已创建' : '倒计时已更新');
    });
  }

  // 3. 新增/编辑纪念日弹窗
  function showAddAnniversaryModal() {
    showEditAnniversaryModal({
      id: '',
      title: '',
      startDate: getTodayLocalDateStr(),
      category: 'love',
      relationType: _state.activeChar ? 'specificChar' : 'personal',
      charId: _state.activeChar ? _state.activeChar.id : null,
      isPinned: true,
      notes: ''
    });
  }

  function showEditAnniversaryModal(an) {
    var isNew = !an.id;
    var overlay = document.createElement('div');
    overlay.className = 'tc-modal-overlay';

    var charOptionsHtml = '<option value="personal">个人纪念日</option>';
    _state.allCharacters.forEach(function(c) {
      var sel = (an.relationType === 'specificChar' && String(an.charId) === String(c.id)) ? 'selected' : '';
      charOptionsHtml += '<option value="' + c.id + '" ' + sel + '>角色专属：' + esc(c.name) + '</option>';
    });

    var linkedBannerHtml = '';
    if (an && an.source && an.source.app === 'love-diary') {
      linkedBannerHtml =
        '<div class="tc-linked-source-banner love-diary">' +
          '<span><i class="fa-solid fa-heart"></i> 来自「恋爱记」情侣空间 · 恋爱纪念日双向同步</span>' +
          '<button type="button" class="tc-btn-jump" id="tc-jump-source-an-modal">前往恋爱记 <i class="fa fa-arrow-up-right-from-square"></i></button>' +
        '</div>';
    }

    overlay.innerHTML =
      '<div class="tc-modal-dialog">' +
        '<div class="tc-modal-header">' +
          '<div class="tc-modal-title">' + (isNew ? '新建纪念日' : '编辑纪念日') + '</div>' +
          '<button class="tc-modal-close-btn" id="tc-modal-close"><i class="fa fa-xmark"></i></button>' +
        '</div>' +
        '<div class="tc-modal-body">' +
          linkedBannerHtml +
          '<div class="tc-form-group">' +
            '<label class="tc-form-label">纪念日名称 *</label>' +
            '<input class="tc-form-input" id="tc-an-title" placeholder="如：相恋第一天、第一次看海、成为好朋友..." value="' + esc(an.title) + '">' +
          '</div>' +
          '<div class="tc-form-row">' +
            '<div class="tc-form-group">' +
              '<label class="tc-form-label">起始日期 *</label>' +
              '<input type="date" class="tc-form-input" id="tc-an-date" value="' + esc(an.startDate) + '">' +
            '</div>' +
            '<div class="tc-form-group">' +
              '<label class="tc-form-label">分类</label>' +
              '<select class="tc-form-select" id="tc-an-cat">' +
                '<option value="love" ' + (an.category === 'love' ? 'selected' : '') + '>恋爱</option>' +
                '<option value="friend" ' + (an.category === 'friend' ? 'selected' : '') + '>友情</option>' +
                '<option value="personal" ' + (an.category === 'personal' ? 'selected' : '') + '>个人</option>' +
                '<option value="work" ' + (an.category === 'work' ? 'selected' : '') + '>事业</option>' +
                '<option value="other" ' + (an.category === 'other' ? 'selected' : '') + '>其他</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="tc-form-group">' +
            '<label class="tc-form-label">角色专属隔离</label>' +
            '<select class="tc-form-select" id="tc-an-char">' +
              charOptionsHtml +
            '</select>' +
          '</div>' +
          '<div class="tc-toggle-row">' +
            '<span class="tc-toggle-desc">置顶显示</span>' +
            '<label class="tc-switch">' +
              '<input type="checkbox" id="tc-an-pin" ' + (an.isPinned ? 'checked' : '') + '>' +
              '<span class="tc-slider"></span>' +
            '</label>' +
          '</div>' +
          '<div class="tc-form-group">' +
            '<label class="tc-form-label">纪念寄语 / 备注</label>' +
            '<textarea class="tc-form-textarea" id="tc-an-notes" rows="2" placeholder="记录关于这一天的专属心动瞬间...">' + esc(an.notes || '') + '</textarea>' +
          '</div>' +
        '</div>' +
        '<div class="tc-modal-footer">' +
          '<button class="tc-btn" id="tc-modal-cancel">取消</button>' +
          '<button class="tc-btn tc-btn-primary" id="tc-modal-save">保存</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var jumpAnBtn = overlay.querySelector('#tc-jump-source-an-modal');
    if (jumpAnBtn) {
      jumpAnBtn.addEventListener('click', function() {
        overlay.remove();
        if (window.TimeCalendarIntegrations) {
          window.TimeCalendarIntegrations.navigate(an.source);
        }
      });
    }

    overlay.querySelector('#tc-modal-close').addEventListener('click', function() { overlay.remove(); });
    overlay.querySelector('#tc-modal-cancel').addEventListener('click', function() { overlay.remove(); });

    overlay.querySelector('#tc-modal-save').addEventListener('click', async function() {
      var title = overlay.querySelector('#tc-an-title').value.trim();
      var startDate = overlay.querySelector('#tc-an-date').value;
      if (!title) {
        alert('请输入纪念日名称');
        return;
      }
      if (!startDate) {
        alert('请选择起始日期');
        return;
      }

      var cat = overlay.querySelector('#tc-an-cat').value;
      var charVal = overlay.querySelector('#tc-an-char').value;
      var isPinned = overlay.querySelector('#tc-an-pin').checked;
      var notes = overlay.querySelector('#tc-an-notes').value.trim();

      var relType = charVal === 'personal' ? 'personal' : 'specificChar';
      var charId = charVal === 'personal' ? null : charVal;
      var charObj = charId ? _state.allCharacters.find(function(c) { return String(c.id) === String(charId); }) : null;
      var charName = charObj ? charObj.name : '';

      // 阶段 3: 恋爱记纪念日权威源联动保存
      if (an && an.source && an.source.app === 'love-diary') {
        if (window.TimeCalendarIntegrations) {
          await window.TimeCalendarIntegrations.loveDiary.saveAnniversary({
            charId: an.charId,
            startDate: startDate,
            notes: notes
          });
        }
        await loadLoveDiaryLinkage();
        overlay.remove();
        renderAnniversariesTab();
        if (window.toast) window.toast('恋爱纪念日已同步更新至恋爱记');
        return;
      }

      var now = Date.now();
      if (isNew) {
        var newAn = {
          id: uid('tc_an'),
          title: title,
          startDate: startDate,
          category: cat,
          relationType: relType,
          charId: charId,
          charName: charName,
          isPinned: isPinned,
          notes: notes,
          createdAt: now,
          updatedAt: now,
          source: { app: 'timeCalendar', recordId: '', readOnly: false }
        };
        _state.anniversaries.push(newAn);
      } else {
        an.title = title;
        an.startDate = startDate;
        an.category = cat;
        an.relationType = relType;
        an.charId = charId;
        an.charName = charName;
        an.isPinned = isPinned;
        an.notes = notes;
        an.updatedAt = now;
      }

      await saveConfigKey(STORAGE_KEYS.ANNIVERSARIES, _state.anniversaries);
      overlay.remove();
      renderAnniversariesTab();
      if (window.toast) window.toast(isNew ? '纪念日已创建' : '纪念日已更新');
    });
  }

  // 4. 角色筛选弹窗 (多 Char 独立视角切换)
  function showCharFilterModal() {
    var overlay = document.createElement('div');
    overlay.className = 'tc-modal-overlay';

    var options = [
      { id: 'all', name: '全部视角 (不限制角色)', avatar: 'img/wanwan.png' },
      { id: 'personal', name: '仅个人独立事件', avatar: 'img/wanwan.png' }
    ];
    _state.allCharacters.forEach(function(c) {
      options.push({
        id: String(c.id),
        name: (c.name || '未命名') + ' 视角',
        avatar: c.avatar || 'img/wanwan.png'
      });
    });

    var itemsHtml = options.map(function(opt) {
      var isCur = String(_state.filterCharId) === opt.id;
      return (
        '<div class="tc-event-item" style="cursor: pointer; ' + (isCur ? 'border-color: var(--c-text); background: var(--c-surface-2);' : '') + '" data-select-char="' + opt.id + '">' +
          '<img src="' + esc(opt.avatar) + '" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid var(--c-border);">' +
          '<div class="tc-event-info" style="justify-content: center;">' +
            '<span style="font-size: 14px; font-weight: ' + (isCur ? '600' : '400') + ';">' + esc(opt.name) + '</span>' +
          '</div>' +
          (isCur ? '<i class="fa fa-check" style="color: var(--c-text); margin-top: 8px;"></i>' : '') +
        '</div>'
      );
    }).join('');

    overlay.innerHTML =
      '<div class="tc-modal-dialog">' +
        '<div class="tc-modal-header">' +
          '<div class="tc-modal-title">切换角色筛选视角</div>' +
          '<button class="tc-modal-close-btn" id="tc-modal-close"><i class="fa fa-xmark"></i></button>' +
        '</div>' +
        '<div class="tc-modal-body">' +
          '<div style="font-size: 12px; color: var(--c-text-muted); margin-bottom: 6px;">选择后时光日历将仅展示该角色的专属纪念日与日程，实现多角色数据隔离。</div>' +
          '<div class="tc-item-list">' + itemsHtml + '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector('#tc-modal-close').addEventListener('click', function() { overlay.remove(); });

    overlay.querySelectorAll('[data-select-char]').forEach(function(item) {
      item.addEventListener('click', function() {
        var charId = item.dataset.selectChar;
        _state.filterCharId = charId;

        // 如果选中具体角色，同时更新当前伴侣角色
        if (charId !== 'all' && charId !== 'personal') {
          var matched = _state.allCharacters.find(function(c) { return String(c.id) === charId; });
          if (matched) {
            _state.activeChar = {
              id: String(matched.id),
              name: matched.name || '林弯弯',
              avatar: matched.avatar || 'img/wanwan.png'
            };
          }
        }

        updateHeaderCharPill();
        overlay.remove();
        renderActiveTabContent();
        if (window.toast) window.toast('已切换视角');
      });
    });
  }

  function updateHeaderCharPill() {
    if (!_state.pageEl) return;
    var nameEl = _state.pageEl.querySelector('#tc-char-name');
    var avEl = _state.pageEl.querySelector('#tc-char-avatar');
    if (!nameEl || !avEl) return;

    if (_state.filterCharId === 'all') {
      nameEl.textContent = '全部视角';
      avEl.src = _state.activeChar ? _state.activeChar.avatar : 'img/wanwan.png';
    } else if (_state.filterCharId === 'personal') {
      nameEl.textContent = '个人视角';
      avEl.src = 'img/wanwan.png';
    } else {
      var matched = _state.allCharacters.find(function(c) { return String(c.id) === String(_state.filterCharId); });
      nameEl.textContent = matched ? matched.name : '林弯弯';
      avEl.src = (matched && matched.avatar) ? matched.avatar : (_state.activeChar ? _state.activeChar.avatar : 'img/wanwan.png');
    }
  }

  function getCategoryLabel(cat) {
    var map = {
      work: '工作',
      study: '学习',
      life: '生活',
      love: '恋爱',
      anniversary: '纪念',
      exam: '考试',
      target: '目标',
      birthday: '生日',
      other: '其他'
    };
    return map[cat] || '日常';
  }

  // ===== 11. 页面打开与外部接管入口 =====
  async function openTimeCalendar(options) {
    if (window.waitForDB) {
      try { await window.waitForDB(); } catch (_) {}
    }
    // 1. 读取基础角色、持久化配置与联动数据
    await loadAllCharacters();
    await loadTimeCalendarData();
    await loadLoveDiaryLinkage();
    await loadStudyRoomLinkage();

    var targetEventId = options && options.eventId;
    var targetDate = options && options.date;

    if (targetEventId) {
      var found = _state.events.find(function(e) { return e.id === targetEventId; });
      if (found) {
        targetDate = targetDate || found.date;
      }
    }

    if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      _state.selectedDateStr = targetDate;
      var p = targetDate.split('-');
      _state.viewYear = parseInt(p[0], 10);
      _state.viewMonth = parseInt(p[1], 10);
    }

    // 2. 渲染 UI
    var page = renderAppShell();
    renderActiveTabContent();

    // 3. 打开页面生命周期
    if (window.openPage) {
      window.openPage(page);
    } else {
      (document.getElementById('app') || document.body).appendChild(page);
    }

    // 4. 定位并高亮对应日程事件
    if (targetEventId) {
      setTimeout(function() {
        var eventCard = page.querySelector('.tc-event-item[data-id="' + targetEventId + '"]');
        if (eventCard) {
          eventCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          eventCard.classList.add('tc-event-highlight');
          setTimeout(function() {
            eventCard.classList.remove('tc-event-highlight');
          }, 3000);
        }
      }, 350);
    }
  }

  function closeTimeCalendar() {
    if (window.closePage) {
      window.closePage('time-calendar-page');
    } else {
      var existing = document.getElementById('time-calendar-page');
      if (existing) existing.remove();
    }
  }

  // ===== 12. 挂载到全局，确保占位函数无法覆盖 =====
  window.TimeCalendarApp = {
    open: openTimeCalendar,
    close: closeTimeCalendar,
    getState: function() { return _state; },
    reload: openTimeCalendar,
    openReminderCenter: showReminderCenterModal
  };

  window.showTimeCalendarPage = openTimeCalendar;
  window.showTimeCalendarApp = openTimeCalendar;
  window.showTimeCalendarReminderCenter = showReminderCenterModal;

  // ===== 13. 阶段 3: 响应恋爱记与陪伴自习室的实时变更事件 =====
  if (window.TimeCalendarIntegrations && typeof window.TimeCalendarIntegrations.on === 'function') {
    window.TimeCalendarIntegrations.on('anniversary_changed', async function() {
      await loadLoveDiaryLinkage();
      if (document.getElementById('time-calendar-page')) {
        renderActiveTabContent();
      }
    });
    window.TimeCalendarIntegrations.on('wish_changed', async function() {
      await loadLoveDiaryLinkage();
      if (document.getElementById('time-calendar-page')) {
        renderActiveTabContent();
      }
    });
    window.TimeCalendarIntegrations.on('todo_changed', async function() {
      await loadStudyRoomLinkage();
      if (document.getElementById('time-calendar-page')) {
        renderActiveTabContent();
      }
    });
    window.TimeCalendarIntegrations.on('todo_toggled', async function() {
      await loadStudyRoomLinkage();
      if (document.getElementById('time-calendar-page')) {
        renderActiveTabContent();
      }
    });
    window.TimeCalendarIntegrations.on('exam_changed', async function() {
      await loadStudyRoomLinkage();
      if (document.getElementById('time-calendar-page')) {
        renderActiveTabContent();
      }
    });
    window.TimeCalendarIntegrations.on('record_added', async function() {
      await loadStudyRoomLinkage();
      if (document.getElementById('time-calendar-page')) {
        renderActiveTabContent();
      }
    });
  }

})();
