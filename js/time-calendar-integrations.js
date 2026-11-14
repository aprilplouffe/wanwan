// js/time-calendar-integrations.js — 恋爱记＋陪伴自习室跨软件双向联动适配层 (阶段 3)
// 遵循原则：单一权威数据源、最小侵入、双向同步、角色隔离、跨软件跳转与数据安全

(function() {
  'use strict';

  var STORAGE_KEYS = {
    COUPLE_SPACE: 'coupleSpaceSettings',
    STUDY_TODOS: 'wanwan_study_todos',
    STUDY_RECORDS: 'wanwan_study_records',
    STUDY_EXAMS: 'wanwan_study_exams',
    CALENDAR_EVENTS: 'time_calendar_events',
    CALENDAR_ANNIVERSARIES: 'time_calendar_anniversaries',
    CALENDAR_COUNTDOWNS: 'time_calendar_countdowns'
  };

  // 本地时区日期辅助 (严禁使用 UTC toISOString().slice(0,10) 导致跨日偏差)
  function formatLocalDate(d) {
    if (!d) return '';
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    var y = dt.getFullYear();
    var m = String(dt.getMonth() + 1).padStart(2, '0');
    var day = String(dt.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function getTodayLocalDateStr() {
    return formatLocalDate(new Date());
  }

  function getLocalTimezoneName() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
    } catch (_) {
      return 'Asia/Shanghai';
    }
  }

  function buildIsoLocalDateTime(dateStr, timeStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
    var t = (timeStr && /^\d{2}:\d{2}/.test(timeStr)) ? timeStr.slice(0, 5) : '00:00';
    return dateStr + 'T' + t + ':00';
  }

  // 跨应用事件总线
  var _listeners = {};
  var _returnStack = [];

  function on(eventName, handler) {
    if (!_listeners[eventName]) _listeners[eventName] = [];
    _listeners[eventName].push(handler);
  }

  function off(eventName, handler) {
    if (!_listeners[eventName]) return;
    _listeners[eventName] = _listeners[eventName].filter(function(h) { return h !== handler; });
  }

  function emit(eventName, data) {
    if (_listeners[eventName]) {
      _listeners[eventName].forEach(function(h) {
        try { h(data); } catch (e) { console.warn('[TimeCalendarIntegrations] listener error:', e); }
      });
    }
  }

  // 存储持久化通用辅助
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

  // ==========================================
  // 一、恋爱记适配服务 (LoveDiaryAdapter)
  // 权威源：coupleSpaceSettings.spaces[charId]
  // ==========================================
  var LoveDiaryAdapter = {
    async loadCoupleConfig() {
      if (window.loadAllCoupleSpaces && typeof window.loadAllCoupleSpaces === 'function') {
        return await window.loadAllCoupleSpaces();
      }
      return await loadConfig(STORAGE_KEYS.COUPLE_SPACE, { activeCharId: null, spaces: {} });
    },

    async saveCoupleConfig(config) {
      if (window.saveAllCoupleSpaces && typeof window.saveAllCoupleSpaces === 'function') {
        await window.saveAllCoupleSpaces(config);
      } else {
        await saveConfig(STORAGE_KEYS.COUPLE_SPACE, config);
      }
    },

    // 1. 读取恋爱纪念日 (生成日历可展示的纪念日数据)
    async getAnniversaries(filterCharId, allCharacters) {
      var config = await this.loadCoupleConfig();
      var result = [];
      if (!config || !config.spaces) return result;

      var charMap = {};
      (allCharacters || []).forEach(function(c) {
        if (c && c.id) charMap[String(c.id)] = c;
      });

      Object.keys(config.spaces).forEach(function(charId) {
        // 多 Char 角色隔离筛选
        if (filterCharId && filterCharId !== 'all' && filterCharId !== 'personal' && String(filterCharId) !== String(charId)) {
          return;
        }
        if (filterCharId === 'personal') {
          return; // 个人视角不显示角色专属恋爱纪念日
        }

        var space = config.spaces[charId];
        if (space && space.status === 'accepted' && space.anniversaryDate && /^\d{4}-\d{2}-\d{2}$/.test(String(space.anniversaryDate))) {
          var charObj = charMap[String(charId)];
          var charName = charObj ? (charObj.nick || charObj.name || 'TA') : '林弯弯';

          result.push({
            id: 'ld_anniv_' + charId,
            title: charName + ' 的恋爱纪念日',
            startDate: String(space.anniversaryDate),
            category: 'love',
            relationType: 'specificChar',
            charId: String(charId),
            ownerCharId: String(charId),
            charName: charName,
            isPinned: true,
            notes: space.quote || '愿每一秒心动，都有回音 ✨',
            sourceRevision: space.updatedAt || space.acceptedAt || 1,
            source: {
              app: 'love-diary',
              type: 'anniversary',
              charId: String(charId),
              recordId: 'couple_space_' + charId,
              readOnly: false // 阶段3/4支持显式写回权威源
            }
          });
        }
      });

      return result;
    },

    // 2. 双向同步：日历修改恋爱记纪念日，写回权威源
    async saveAnniversary(item) {
      if (!item || !item.charId) return false;
      var config = await this.loadCoupleConfig();
      if (!config.spaces) config.spaces = {};
      var now = Date.now();
      if (!config.spaces[item.charId]) {
        config.spaces[item.charId] = {
          charId: item.charId,
          status: 'accepted',
          anniversaryDate: item.startDate,
          quote: item.notes || '',
          updatedAt: now
        };
      } else {
        config.spaces[item.charId].anniversaryDate = item.startDate;
        if (item.notes !== undefined) config.spaces[item.charId].quote = item.notes;
        config.spaces[item.charId].updatedAt = now;
      }

      await this.saveCoupleConfig(config);

      // 如果恋爱记页面当前正在前台打开，同步更新界面 DOM
      var lovePage = document.getElementById('love-diary-page');
      if (lovePage) {
        var anniversaryTextEl = lovePage.querySelector('#ld-anniversary-text');
        if (anniversaryTextEl) {
          anniversaryTextEl.innerHTML = '<i class="fa fa-calendar-heart" style="margin-right:4px;"></i>纪念日：' + item.startDate;
        }
      }

      emit('anniversary_changed', { charId: item.charId, anniversaryDate: item.startDate });
      return true;
    },

    // 3. 删除或解绑恋爱记纪念日
    async deleteAnniversary(charId) {
      var config = await this.loadCoupleConfig();
      if (config.spaces && config.spaces[charId]) {
        config.spaces[charId].anniversaryDate = '';
        config.spaces[charId].updatedAt = Date.now();
        await this.saveCoupleConfig(config);
      }
      emit('anniversary_changed', { charId: charId, anniversaryDate: '' });
      return true;
    },

    // 4. 读取具有日期的心愿 / 约定 (转化为日历日程任务)
    async getWishesAsEvents(filterCharId, allCharacters) {
      var config = await this.loadCoupleConfig();
      var events = [];
      if (!config || !config.spaces) return events;

      var charMap = {};
      (allCharacters || []).forEach(function(c) {
        if (c && c.id) charMap[String(c.id)] = c;
      });

      Object.keys(config.spaces).forEach(function(charId) {
        // 多 Char 隔离
        if (filterCharId && filterCharId !== 'all' && filterCharId !== 'personal' && String(filterCharId) !== String(charId)) {
          return;
        }
        if (filterCharId === 'personal') return;

        var space = config.spaces[charId];
        if (!space || space.status !== 'accepted' || !Array.isArray(space.wishes)) return;

        var charObj = charMap[String(charId)];
        var charName = charObj ? (charObj.nick || charObj.name || 'TA') : '林弯弯';

        space.wishes.forEach(function(wish, idx) {
          if (!wish) return;
          // 如果心愿带有 targetDate，或者有设定履行日期
          var wishDate = wish.targetDate || wish.date;
          if (wishDate && /^\d{4}-\d{2}-\d{2}$/.test(wishDate)) {
            events.push({
              id: 'ld_wish_' + charId + '_' + (wish.id || idx),
              title: '心愿 · ' + wish.text,
              date: wishDate,
              isAllDay: true,
              startTime: wish.startTime || '',
              endTime: wish.endTime || '',
              category: 'love',
              relationType: 'specificChar',
              charId: String(charId),
              ownerCharId: String(charId),
              charName: charName,
              notes: wish.notes || ('恋爱记专属心愿小事：' + wish.text),
              showInCountdown: !!wish.showInCountdown,
              completed: !!wish.done,
              status: wish.done ? 'completed' : 'pending',
              isPinned: false,
              sourceRevision: wish.updatedAt || wish.createdAt || 1,
              createdAt: wish.createdAt || Date.now(),
              updatedAt: wish.updatedAt || Date.now(),
              source: {
                app: 'love-diary',
                type: 'wish',
                charId: String(charId),
                wishId: wish.id || String(idx),
                readOnly: false
              }
            });
          }
        });
      });

      return events;
    },

    // 5. 双向切换心愿完成状态
    async toggleWish(charId, wishId) {
      var config = await this.loadCoupleConfig();
      if (!config.spaces || !config.spaces[charId] || !Array.isArray(config.spaces[charId].wishes)) {
        return false;
      }

      var wishes = config.spaces[charId].wishes;
      var targetWish = wishes.find(function(w, idx) {
        return String(w.id) === String(wishId) || String(idx) === String(wishId);
      });

      if (!targetWish) return false;
      targetWish.done = !targetWish.done;
      targetWish.updatedAt = Date.now();

      await this.saveCoupleConfig(config);

      // 若恋爱记处于心愿页面，刷新 DOM
      var lovePage = document.getElementById('love-diary-page');
      if (lovePage && window.loadAllCoupleSpaces) {
        var contentArea = lovePage.querySelector('#ld-content-area');
        if (contentArea && contentArea.querySelector('.ld-wish-item')) {
          var wishItems = contentArea.querySelectorAll('.ld-wish-item');
          var wishIndex = wishes.indexOf(targetWish);
          if (wishIndex >= 0 && wishItems[wishIndex]) {
            if (targetWish.done) wishItems[wishIndex].classList.add('done');
            else wishItems[wishIndex].classList.remove('done');
          }
        }
      }

      emit('wish_toggled', { charId: charId, wishId: wishId, done: targetWish.done });
      return targetWish.done;
    },

    // 6. 保存/修改心愿内容及目标履约日期
    async saveWish(charId, wishId, updatedData) {
      var config = await this.loadCoupleConfig();
      if (!config.spaces || !config.spaces[charId]) return false;
      var wishes = config.spaces[charId].wishes;
      if (!Array.isArray(wishes)) config.spaces[charId].wishes = [];

      var targetWish = config.spaces[charId].wishes.find(function(w, idx) {
        return String(w.id) === String(wishId) || String(idx) === String(wishId);
      });

      if (targetWish) {
        if (updatedData.title) {
          // 去除前缀 "心愿 · "
          targetWish.text = updatedData.title.replace(/^心愿\s*[·:]\s*/, '').trim();
        }
        if (updatedData.date !== undefined) targetWish.targetDate = updatedData.date;
        if (updatedData.completed !== undefined) targetWish.done = !!updatedData.completed;
        if (updatedData.notes !== undefined) targetWish.notes = updatedData.notes;
        targetWish.updatedAt = Date.now();
      }

      await this.saveCoupleConfig(config);
      emit('wish_changed', { charId: charId, wishId: wishId });
      return true;
    }
  };

  // ==========================================
  // 二、陪伴自习室适配服务 (StudyRoomAdapter)
  // 权威源：wanwan_study_todos, wanwan_study_exams, wanwan_study_records
  // ==========================================
  var StudyRoomAdapter = {
    // 1. 读取自习室待办
    async getTodos() {
      return await loadConfig(STORAGE_KEYS.STUDY_TODOS, []);
    },

    async saveTodos(todos) {
      await saveConfig(STORAGE_KEYS.STUDY_TODOS, todos);
      // 同步全局运行时如果自习室已经加载
      if (window.WanwanStudyRoom && typeof window.WanwanStudyRoom.getState === 'function') {
        var st = window.WanwanStudyRoom.getState();
        if (st) st.todos = todos;
      }
    },

    // 2. 将自习室待办转换为日历日程事件
    async getTodosAsEvents(filterCharId, allCharacters) {
      var todos = await this.getTodos();
      var events = [];
      if (!Array.isArray(todos)) return events;

      todos.forEach(function(t) {
        if (!t || !t.id) return;
        // 严格遵循规范：仅有效 YYYY-MM-DD 格式作为排期日期，未排期任务保持为空，避免错误归入今天
        var todoDate = (t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) ? t.date : '';
        if (!todoDate) return;

        // 角色筛选
        if (filterCharId && filterCharId !== 'all' && filterCharId !== 'personal' && t.charId && String(t.charId) !== String(filterCharId)) {
          return;
        }
        if (filterCharId === 'personal' && t.charId) {
          return;
        }

        var estMins = Number(t.estimatedMinutes) || 0;
        var extraNote = estMins > 0 ? ('预计专注 ' + estMins + ' 分钟') : '陪伴自习室学习待办事项';

        events.push({
          id: 'sr_todo_' + t.id,
          title: '自习待办 · ' + (t.text || '专注任务'),
          date: todoDate,
          isAllDay: !t.time,
          startTime: t.time || '',
          endTime: t.endTime || '',
          estimatedMinutes: estMins,
          category: 'study',
          relationType: t.charId ? 'specificChar' : 'personal',
          charId: t.charId || null,
          charName: t.charName || '',
          notes: t.notes || extraNote,
          showInCountdown: false,
          completed: !!t.done,
          status: t.done ? 'completed' : 'pending',
          isPinned: false,
          sourceRevision: t.updatedAt || t.createdAt || 1,
          createdAt: t.createdAt || Date.now(),
          updatedAt: t.updatedAt || Date.now(),
          source: {
            app: 'study-room',
            type: 'todo',
            todoId: t.id,
            readOnly: false
          }
        });
      });

      return events;
    },

    // 3. 双向同步：切换自习室待办完成状态
    async toggleTodo(todoId) {
      var todos = await this.getTodos();
      var target = todos.find(function(t) { return String(t.id) === String(todoId); });
      if (!target) return false;

      target.done = !target.done;
      target.updatedAt = Date.now();
      await this.saveTodos(todos);

      // 若自习室页面处于开启状态，同步 DOM
      var studyPage = document.getElementById('study-room-page');
      if (studyPage) {
        var todoEl = studyPage.querySelector('.sr-todo-item[data-id="' + todoId + '"]');
        if (todoEl) {
          if (target.done) todoEl.classList.add('done');
          else todoEl.classList.remove('done');
          var cb = todoEl.querySelector('input[type="checkbox"]');
          if (cb) cb.checked = target.done;
        }
      }

      emit('todo_toggled', { todoId: todoId, done: target.done });
      return target.done;
    },

    // 4. 保存/编辑自习待办
    async saveTodo(todoId, updatedData) {
      var todos = await this.getTodos();
      var target = todos.find(function(t) { return String(t.id) === String(todoId); });
      if (target) {
        if (updatedData.title) {
          target.text = updatedData.title.replace(/^自习待办\s*[·:]\s*/, '').trim();
        }
        if (updatedData.date !== undefined) target.date = updatedData.date;
        if (updatedData.completed !== undefined) target.done = !!updatedData.completed;
        if (updatedData.notes !== undefined) target.notes = updatedData.notes;
        if (updatedData.startTime !== undefined) target.time = updatedData.startTime;
        if (updatedData.endTime !== undefined) target.endTime = updatedData.endTime;
        target.updatedAt = Date.now();
        await this.saveTodos(todos);
        emit('todo_changed', { todoId: todoId });
        return true;
      }
      return false;
    },

    // 5. 考试备考计划与日历倒计时双向联动
    // 权威源：wanwan_study_exams
    async getExams() {
      return await loadConfig(STORAGE_KEYS.STUDY_EXAMS, [
        {
          id: 'exam_default_1',
          title: '期末专业课考核',
          targetDate: getFutureDate(30),
          category: 'exam',
          subject: '专业课复习',
          notes: '自习室重点冲刺科目',
          isPinned: true
        }
      ]);
    },

    async saveExams(exams) {
      await saveConfig(STORAGE_KEYS.STUDY_EXAMS, exams);
      emit('exam_changed', exams);
    },

    async getExamsAsCountdowns(filterCharId) {
      var exams = await this.getExams();
      var records = await loadConfig(STORAGE_KEYS.STUDY_RECORDS, []);
      var countdowns = [];
      if (!Array.isArray(exams)) return countdowns;

      var totalStudyMinsAll = 0;
      var totalSessionsAll = 0;
      if (Array.isArray(records)) {
        records.forEach(function(r) {
          if (!r) return;
          totalStudyMinsAll += (Number(r.durationMinutes) || Math.round((Number(r.durationSeconds) || 0) / 60) || 0);
          totalSessionsAll += 1;
        });
      }

      exams.forEach(function(ex) {
        if (!ex || !ex.id || !ex.targetDate) return;
        if (filterCharId && filterCharId !== 'all' && filterCharId !== 'personal' && ex.charId && String(ex.charId) !== String(filterCharId)) {
          return;
        }
        if (filterCharId === 'personal' && ex.charId) return;

        // 统计与该考试关键词匹配或累计自习时长摘要 (纯投影，不改写原始记录)
        var examMins = 0;
        var examSessions = 0;
        var keyword = (ex.subject || ex.title || '').trim();
        if (Array.isArray(records) && keyword) {
          records.forEach(function(r) {
            if (!r) return;
            var tName = String(r.taskName || r.subject || '');
            if (r.examId && String(r.examId) === String(ex.id)) {
              examMins += (Number(r.durationMinutes) || 0);
              examSessions += 1;
            } else if (tName && (tName.indexOf(keyword) >= 0 || keyword.indexOf(tName) >= 0)) {
              examMins += (Number(r.durationMinutes) || 0);
              examSessions += 1;
            }
          });
        }

        countdowns.push({
          id: 'sr_exam_' + ex.id,
          title: ex.title || '考试备考',
          targetDate: ex.targetDate,
          startTime: ex.startTime || '',
          category: 'exam',
          subject: ex.subject || '',
          studyProgress: {
            matchedMinutes: examMins,
            matchedSessions: examSessions,
            totalStudyMinutes: totalStudyMinsAll,
            totalStudySessions: totalSessionsAll
          },
          relationType: ex.charId ? 'specificChar' : 'personal',
          charId: ex.charId || null,
          charName: ex.charName || '',
          isPinned: !!ex.isPinned,
          completed: !!ex.completed,
          status: ex.status || (ex.completed ? 'completed' : 'pending'),
          notes: ex.notes || '陪伴自习室备战考试计划',
          sourceRevision: ex.updatedAt || ex.createdAt || 1,
          source: {
            app: 'study-room',
            type: 'exam',
            examId: ex.id,
            readOnly: false
          }
        });
      });

      return countdowns;
    },

    async saveExam(item) {
      var exams = await this.getExams();
      var rawId = item.source && item.source.examId ? item.source.examId : (item.id || '').replace(/^sr_exam_/, '');
      var found = exams.find(function(e) { return String(e.id) === String(rawId); });

      if (found) {
        found.title = item.title;
        found.targetDate = item.targetDate;
        if (item.subject !== undefined) found.subject = item.subject;
        found.notes = item.notes;
        found.isPinned = !!item.isPinned;
        found.charId = item.charId || null;
        if (item.completed !== undefined) found.completed = !!item.completed;
        found.updatedAt = Date.now();
      } else {
        exams.push({
          id: rawId || ('exam_' + Date.now()),
          title: item.title,
          targetDate: item.targetDate,
          subject: item.subject || '',
          category: 'exam',
          notes: item.notes || '',
          isPinned: !!item.isPinned,
          charId: item.charId || null,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }

      await this.saveExams(exams);
      return true;
    },

    // 6. 自习室专注记录与日历统计联动 (严格使用本地日期，仅作每日专注足迹展示)
    // 权威源：wanwan_study_records
    async getRecordsMap() {
      var records = await loadConfig(STORAGE_KEYS.STUDY_RECORDS, []);
      var map = {};
      if (!Array.isArray(records)) return map;

      records.forEach(function(r) {
        if (!r) return;
        var dateStr = '';
        if (r.date && /^\d{4}-\d{2}-\d{2}/.test(String(r.date))) {
          dateStr = String(r.date).slice(0, 10);
        } else if (r.startTime) {
          dateStr = formatLocalDate(new Date(r.startTime));
        }
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;

        if (!map[dateStr]) {
          map[dateStr] = {
            totalMinutes: 0,
            count: 0,
            records: []
          };
        }

        var duration = Number(r.durationMinutes) || Math.round((Number(r.durationSeconds) || 0) / 60) || 0;
        map[dateStr].totalMinutes += duration;
        map[dateStr].count += 1;
        map[dateStr].records.push(r);
      });

      return map;
    }
  };

  function getFutureDate(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return formatLocalDate(d);
  }

  // ==========================================
  // 三、统一跨 App 时间事件投影模型 (UnifiedTimeEventHub)
  // 原则：轻量只读适配层，绝不创建第二份权威数据库
  // ==========================================
  function normalizeUnifiedSourceApp(app) {
    if (!app) return 'time-calendar';
    var s = String(app).toLowerCase();
    if (s === 'timecalendar' || s === 'time_calendar' || s === 'time-calendar') return 'time-calendar';
    if (s === 'studyroom' || s === 'study_room' || s === 'study-room') return 'study-room';
    if (s === 'lifegame' || s === 'life_game' || s === 'life-game') return 'life-game';
    if (s === 'lovediary' || s === 'love_diary' || s === 'love-diary') return 'love-diary';
    return s;
  }

  function extractRawSourceId(raw) {
    if (!raw) return '';
    if (raw.source) {
      if (raw.source.taskId) return String(raw.source.taskId);
      if (raw.source.todoId) return String(raw.source.todoId);
      if (raw.source.examId) return String(raw.source.examId);
      if (raw.source.wishId) return String(raw.source.wishId);
      if (raw.source.recordId) return String(raw.source.recordId);
    }
    var id = String(raw.masterEventId || raw.id || '');
    return id.replace(/^(lg_task_|sr_todo_|sr_exam_|ld_anniv_|ld_wish_[^_]+_)/, '');
  }

  function matchesCharFilter(ev, filterCharId) {
    if (!ev) return false;
    if (!filterCharId || filterCharId === 'all') return true;
    if (filterCharId === 'personal') {
      if (ev.visibility === 'private') return true;
      // 用户本人创建的个人日程（即使授权给了某些 Char 感知，仍属于用户的个人时间安排，必须在「个人视角」中可见）
      if (ev.relationType === 'personal' && !ev.charId) return true;
      if (ev.visibility === 'selected-chars' && ev.relationType !== 'specificChar' && !ev.charId) return true;
      if (!ev.charId && (!ev.source || !ev.source.charId) && ev.relationType !== 'specificChar') return true;
      return false;
    }
    var targetId = String(filterCharId);
    // 1. 私密日程严格隔离，对任何 Char 均绝对不可见
    if (ev.visibility === 'private') return false;
    // 2. 授权开放给特定 Char 的日程
    if (ev.visibility === 'selected-chars' && Array.isArray(ev.allowedCharIds)) {
      return ev.allowedCharIds.map(String).indexOf(targetId) >= 0;
    }
    // 3. 特定角色关联日程
    if (ev.relationType === 'specificChar' && ev.charId && String(ev.charId) === targetId) return true;
    if (ev.ownerCharId && String(ev.ownerCharId) === targetId) return true;
    if (ev.charId && String(ev.charId) === targetId) return true;
    if (ev.source && ev.source.charId && String(ev.source.charId) === targetId) return true;
    return false;
  }

  var UnifiedTimeEventHub = {
    getCanonicalRef: function(raw) {
      var app = normalizeUnifiedSourceApp(raw && raw.source && raw.source.app);
      var sourceEventId = extractRawSourceId(raw);
      return app + ':' + sourceEventId;
    },

    toUnifiedEvent: function(raw, fallbackSourceApp) {
      if (!raw) return null;
      var sourceApp = normalizeUnifiedSourceApp((raw.source && raw.source.app) || fallbackSourceApp || 'time-calendar');
      var sourceEventId = extractRawSourceId(raw) || String(raw.id || '');
      var eventType = (raw.source && raw.source.type) || raw.eventType || (raw.startDate ? 'anniversary' : 'schedule');
      var dateStr = raw.date || raw.targetDate || raw.startDate || '';
      var isAllDay = raw.isAllDay !== undefined ? !!raw.isAllDay : !raw.startTime;
      var tz = raw.timezone || getLocalTimezoneName();
      var startAt = isAllDay ? buildIsoLocalDateTime(dateStr, '00:00') : buildIsoLocalDateTime(dateStr, raw.startTime || '09:00');
      var endAt = isAllDay ? buildIsoLocalDateTime(dateStr, '23:59') : buildIsoLocalDateTime(dateStr, raw.endTime || raw.startTime || '10:00');
      var occurrenceDate = raw.occurrenceDate || dateStr || '';
      var occurrenceKey = sourceApp + ':' + sourceEventId + '@' + (occurrenceDate || 'unscheduled');

      var status = raw.status || (raw.completed ? 'completed' : 'pending');
      if (raw.status === 'claimed') status = 'claimed';
      if (raw.status === 'cancelled') status = 'cancelled';

      var ownerCharId = raw.ownerCharId || raw.charId || (raw.source && raw.source.charId) || null;
      if (ownerCharId !== null && ownerCharId !== undefined) ownerCharId = String(ownerCharId);

      var visibility = raw.visibility || (ownerCharId ? 'selected-chars' : 'private');
      var readOnly = !!(raw.readOnly || (raw.source && raw.source.readOnly) || status === 'claimed' || eventType === 'focus-footprint');

      var navTarget = {
        app: sourceApp,
        type: eventType,
        charId: ownerCharId,
        date: dateStr,
        taskId: raw.source && raw.source.taskId ? raw.source.taskId : (sourceApp === 'life-game' ? sourceEventId : undefined),
        todoId: raw.source && raw.source.todoId ? raw.source.todoId : (sourceApp === 'study-room' && eventType === 'todo' ? sourceEventId : undefined),
        examId: raw.source && raw.source.examId ? raw.source.examId : (sourceApp === 'study-room' && eventType === 'exam' ? sourceEventId : undefined),
        wishId: raw.source && raw.source.wishId ? raw.source.wishId : (sourceApp === 'love-diary' && eventType === 'wish' ? sourceEventId : undefined),
        recordId: (raw.source && raw.source.recordId) || sourceEventId
      };

      return {
        id: raw.id || (sourceApp + ':' + sourceEventId),
        canonicalRef: sourceApp + ':' + sourceEventId,
        sourceApp: sourceApp,
        sourceEventId: sourceEventId,
        occurrenceKey: occurrenceKey,
        eventType: eventType,
        title: raw.title || '',
        date: dateStr,
        startTime: raw.startTime || '',
        endTime: raw.endTime || '',
        isAllDay: isAllDay,
        startAt: startAt,
        endAt: endAt,
        timezone: tz,
        status: status,
        completed: status === 'completed' || status === 'claimed',
        readOnly: readOnly,
        ownerCharId: ownerCharId,
        visibility: visibility,
        allowedCharIds: Array.isArray(raw.allowedCharIds) ? raw.allowedCharIds.map(String) : (ownerCharId ? [ownerCharId] : []),
        sourceRevision: raw.sourceRevision || raw.updatedAt || raw.createdAt || 1,
        navigationTarget: navTarget,
        raw: raw
      };
    },

    projectList: function(rawList, fallbackSourceApp, filterCharId) {
      var self = this;
      var out = [];
      (rawList || []).forEach(function(item) {
        if (!item) return;
        if (filterCharId && !matchesCharFilter(item, filterCharId)) return;
        var unified = self.toUnifiedEvent(item, fallbackSourceApp);
        if (unified) out.push(unified);
      });
      return out;
    }
  };

  // ==========================================
  // 四、跨应用双向导航与返回栈服务 (CrossAppNavigator)
  // ==========================================
  function captureCurrentPageContext(fromApp) {
    try {
      if (fromApp === 'time-calendar' && window.TimeCalendarApp && typeof window.TimeCalendarApp.getState === 'function') {
        var tc = window.TimeCalendarApp.getState();
        return {
          fromApp: 'time-calendar',
          state: {
            activeTab: tc.activeTab,
            calendarView: tc.calendarView,
            selectedDateStr: tc.selectedDateStr,
            viewYear: tc.viewYear,
            viewMonth: tc.viewMonth,
            filterCharId: tc.filterCharId,
            anniversarySubTab: tc.anniversarySubTab
          }
        };
      }
      if (fromApp === 'study-room' && window.WanwanStudyRoom && typeof window.WanwanStudyRoom.getState === 'function') {
        var sr = window.WanwanStudyRoom.getState();
        return {
          fromApp: 'study-room',
          state: {
            activeTab: sr.activeTab || 'duo',
            timerStatus: sr.timerStatus
          }
        };
      }
      if (fromApp === 'life-game' && window.LifeGameApp && typeof window.LifeGameApp.getViewState === 'function') {
        return {
          fromApp: 'life-game',
          state: window.LifeGameApp.getViewState()
        };
      }
      if (fromApp === 'love-diary' && window.LoveDiaryApp && typeof window.LoveDiaryApp.getViewState === 'function') {
        return {
          fromApp: 'love-diary',
          state: window.LoveDiaryApp.getViewState()
        };
      }
    } catch (_) {}
    return fromApp ? { fromApp: fromApp, state: {} } : null;
  }

  var CrossAppNavigator = {
    pushReturnContext: function(ctx) {
      if (!ctx || !ctx.fromApp) return;
      _returnStack.push(Object.assign({ pushedAt: Date.now() }, ctx));
      if (_returnStack.length > 10) _returnStack.shift();
    },

    popReturnContext: function() {
      return _returnStack.length > 0 ? _returnStack.pop() : null;
    },

    peekReturnContext: function() {
      return _returnStack.length > 0 ? _returnStack[_returnStack.length - 1] : null;
    },

    clearReturnContext: function() {
      _returnStack = [];
    },

    async returnToCaller(currentApp) {
      var ctx = this.popReturnContext();
      if (!ctx) return false;

      // 关闭当前目标页，使下层或恢复目标页显现
      var pageIdMap = {
        'study-room': 'study-room-page',
        'life-game': 'life-game-page',
        'love-diary': 'love-diary-page',
        'time-calendar': 'time-calendar-page'
      };
      var curPageId = currentApp && pageIdMap[currentApp];
      if (curPageId && window.closePage) {
        try { window.closePage(curPageId); } catch (_) {}
      } else if (curPageId) {
        var curEl = document.getElementById(curPageId);
        if (curEl) curEl.remove();
      }

      if (ctx.fromApp === 'time-calendar' && window.showTimeCalendarPage) {
        var st = ctx.state || {};
        await window.showTimeCalendarPage({
          preserveView: true,
          tab: st.activeTab,
          calendarView: st.calendarView,
          date: st.selectedDateStr,
          filterCharId: st.filterCharId,
          anniversarySubTab: st.anniversarySubTab
        });
        return true;
      }

      if (ctx.fromApp === 'study-room' && window.showStudyRoomPage) {
        var srSt = ctx.state || {};
        await window.showStudyRoomPage({
          tab: srSt.activeTab || 'duo',
          preserveTimer: true
        });
        return true;
      }

      if (ctx.fromApp === 'life-game' && window.showLifeGamePage) {
        var lgSt = ctx.state || {};
        await window.showLifeGamePage({
          tab: lgSt.activeTab || 'tasks'
        });
        return true;
      }

      if (ctx.fromApp === 'love-diary' && window.showLoveDiaryPage) {
        var ldSt = ctx.state || {};
        await window.showLoveDiaryPage({
          charId: ldSt.charId,
          tab: ldSt.activeTab || 'album'
        });
        return true;
      }

      return false;
    },

    async navigateTo(source, navOptions) {
      if (!source || !source.app) return;
      navOptions = navOptions || {};
      var fromApp = navOptions.fromApp || (document.getElementById('time-calendar-page') ? 'time-calendar' : '');
      var returnCtx = navOptions.returnContext || captureCurrentPageContext(fromApp);
      if (returnCtx && returnCtx.fromApp !== source.app) {
        CrossAppNavigator.pushReturnContext(returnCtx);
      }

      // 1. 跳转至恋爱记
      if (source.app === 'love-diary') {
        var charId = source.charId;
        var tab = source.tab || ((source.type === 'wish') ? 'wishes' : 'album');

        if (window.showLoveDiaryPage) {
          await window.showLoveDiaryPage({
            charId: charId,
            tab: tab,
            targetWishId: source.wishId,
            fromApp: fromApp,
            returnContext: returnCtx
          });
          if (window.toast) window.toast('已跳转至恋爱记' + (tab === 'wishes' ? '心愿清单' : '情侣空间'));
        } else {
          alert('恋爱记模块未就绪');
        }
        return;
      }

      // 2. 跳转至陪伴自习室 (若计时器正在运行，严格保留计时状态！)
      if (source.app === 'study-room') {
        var targetTab = source.tab || 'duo';
        if (!source.tab) {
          if (source.type === 'exam') targetTab = 'resources';
          else if (source.type === 'record' || source.type === 'focus-footprint') targetTab = 'report';
          else if (source.type === 'todo') targetTab = 'hall';
          else targetTab = 'duo';
        }

        if (window.showStudyRoomPage) {
          await window.showStudyRoomPage({
            tab: targetTab,
            targetTodoId: source.todoId,
            targetExamId: source.examId,
            preserveTimer: true,
            fromApp: fromApp,
            returnContext: returnCtx
          });
          if (window.toast) window.toast('已跳转至陪伴自习室');
        } else {
          alert('陪伴自习室模块未就绪');
        }
        return;
      }

      // 3. 跳转至人生游戏 (阶段 3/4 联动)
      if (source.app === 'life-game') {
        var lgOpts = {
          tab: source.type === 'goal' ? 'goals' : 'tasks',
          targetTaskId: source.taskId || null,
          targetGoalId: source.goalId || null,
          fromApp: fromApp,
          returnContext: returnCtx
        };
        if (window.LifeGameIntegrations && typeof window.LifeGameIntegrations.navigateToLifeGame === 'function') {
          await window.LifeGameIntegrations.navigateToLifeGame(lgOpts);
        } else if (window.showLifeGamePage) {
          await window.showLifeGamePage(lgOpts);
          if (window.toast) window.toast('已跳转至人生游戏');
        } else {
          alert('人生游戏模块未就绪');
        }
        return;
      }

      // 4. 跳转至时光日历
      if (source.app === 'time-calendar' && window.showTimeCalendarPage) {
        await window.showTimeCalendarPage({
          tab: source.tab || 'calendar',
          calendarView: source.calendarView,
          date: source.date || null,
          eventId: source.eventId || null,
          charId: source.charId || null,
          fromApp: fromApp,
          returnContext: returnCtx
        });
        if (window.toast) window.toast('已跳转至时光日历');
        return;
      }
    }
  };

  // ==========================================
  // 五、对外公开接口与单例挂载
  // ==========================================
  window.TimeCalendarIntegrations = {
    on: on,
    off: off,
    emit: emit,
    loveDiary: LoveDiaryAdapter,
    studyRoom: StudyRoomAdapter,
    unified: UnifiedTimeEventHub,
    nav: CrossAppNavigator,
    navigate: CrossAppNavigator.navigateTo,
    pushReturnContext: CrossAppNavigator.pushReturnContext,
    popReturnContext: CrossAppNavigator.popReturnContext,
    peekReturnContext: CrossAppNavigator.peekReturnContext,
    returnToCaller: function(curApp) { return CrossAppNavigator.returnToCaller(curApp); },
    captureCurrentPageContext: captureCurrentPageContext,
    matchesCharFilter: matchesCharFilter,
    formatLocalDate: formatLocalDate,
    getTodayLocalDateStr: getTodayLocalDateStr,
    getLocalTimezoneName: getLocalTimezoneName,

    // 辅助检查是否为跨应用联动记录
    isLinkedEvent: function(ev) {
      return !!(ev && ev.source && (ev.source.app === 'love-diary' || ev.source.app === 'study-room' || ev.source.app === 'life-game'));
    },

    // 统一保存方法：识别来源权威源并准确回写
    async saveLinkedItem(item, type) {
      if (!item || !item.source) return false;
      var src = item.source;

      if (src.app === 'love-diary') {
        if (src.type === 'anniversary') {
          return await LoveDiaryAdapter.saveAnniversary(item);
        } else if (src.type === 'wish') {
          return await LoveDiaryAdapter.saveWish(src.charId, src.wishId, item);
        }
      } else if (src.app === 'study-room') {
        if (src.type === 'todo') {
          return await StudyRoomAdapter.saveTodo(src.todoId, item);
        } else if (src.type === 'exam') {
          return await StudyRoomAdapter.saveExam(item);
        }
      } else if (src.app === 'life-game') {
        if (window.LifeGameIntegrations && typeof window.LifeGameIntegrations.saveTaskFromCalendar === 'function') {
          return await window.LifeGameIntegrations.saveTaskFromCalendar(item);
        }
      }
      return false;
    },

    // 统一切换完成状态方法
    async toggleLinkedItem(item) {
      if (!item || !item.source) return false;
      var src = item.source;

      if (src.app === 'love-diary' && src.type === 'wish') {
        return await LoveDiaryAdapter.toggleWish(src.charId, src.wishId);
      }
      if (src.app === 'study-room' && src.type === 'todo') {
        return await StudyRoomAdapter.toggleTodo(src.todoId);
      }
      if (src.app === 'life-game') {
        if (window.LifeGameIntegrations && typeof window.LifeGameIntegrations.toggleTaskFromCalendar === 'function') {
          return await window.LifeGameIntegrations.toggleTaskFromCalendar(src.taskId);
        }
      }
      return false;
    }
  };

})();
