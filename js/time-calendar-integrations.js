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

  // 跨应用事件总线
  var _listeners = {};

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
        if (space && space.status === 'accepted' && space.anniversaryDate) {
          var charObj = charMap[String(charId)];
          var charName = charObj ? (charObj.name || 'TA') : '林弯弯';

          result.push({
            id: 'ld_anniv_' + charId,
            title: charName + ' 的恋爱纪念日',
            startDate: space.anniversaryDate,
            category: 'love',
            relationType: 'specificChar',
            charId: String(charId),
            charName: charName,
            isPinned: true,
            notes: space.quote || '愿每一秒心动，都有回音 ✨',
            source: {
              app: 'love-diary',
              type: 'anniversary',
              charId: String(charId),
              recordId: 'couple_space_' + charId,
              readOnly: false // 阶段3支持双向编辑写回
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
      if (!config.spaces[item.charId]) {
        config.spaces[item.charId] = {
          charId: item.charId,
          status: 'accepted',
          anniversaryDate: item.startDate,
          quote: item.notes || ''
        };
      } else {
        config.spaces[item.charId].anniversaryDate = item.startDate;
        if (item.notes) config.spaces[item.charId].quote = item.notes;
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
        await this.saveCoupleConfig(config);
      }
      emit('anniversary_changed', { charId: charId, anniversaryDate: '' });
      return true;
    },

    // 4. 读取具有日期的心愿 (转化为日历日程任务)
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
        if (!space || !Array.isArray(space.wishes)) return;

        var charObj = charMap[String(charId)];
        var charName = charObj ? (charObj.name || 'TA') : '林弯弯';

        space.wishes.forEach(function(wish, idx) {
          // 如果心愿带有 targetDate，或者有设定履行日期
          var wishDate = wish.targetDate || wish.date;
          if (wishDate && /^\d{4}-\d{2}-\d{2}$/.test(wishDate)) {
            events.push({
              id: 'ld_wish_' + charId + '_' + (wish.id || idx),
              title: '心愿 · ' + wish.text,
              date: wishDate,
              isAllDay: true,
              startTime: '',
              endTime: '',
              category: 'love',
              relationType: 'specificChar',
              charId: String(charId),
              charName: charName,
              notes: wish.notes || ('恋爱记专属心愿小事：' + wish.text),
              showInCountdown: false,
              completed: !!wish.done,
              isPinned: false,
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

      var todayStr = new Date().toISOString().slice(0, 10);

      todos.forEach(function(t) {
        if (!t || !t.id) return;
        // 严格遵循规范：仅有效 YYYY-MM-DD 格式作为排期日期，未排期任务保持为空，避免错误归入今天
        var todoDate = (t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) ? t.date : '';

        // 角色筛选
        if (filterCharId && filterCharId !== 'all' && filterCharId !== 'personal' && t.charId && String(t.charId) !== String(filterCharId)) {
          return;
        }

        events.push({
          id: 'sr_todo_' + t.id,
          title: '自习待办 · ' + (t.text || '专注任务'),
          date: todoDate,
          isAllDay: !t.time,
          startTime: t.time || '',
          endTime: '',
          category: 'study',
          relationType: t.charId ? 'specificChar' : 'personal',
          charId: t.charId || null,
          charName: t.charName || '',
          notes: t.notes || '陪伴自习室学习待办事项',
          showInCountdown: false,
          completed: !!t.done,
          isPinned: false,
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
      var countdowns = [];
      if (!Array.isArray(exams)) return countdowns;

      exams.forEach(function(ex) {
        if (!ex || !ex.id || !ex.targetDate) return;
        if (filterCharId && filterCharId !== 'all' && filterCharId !== 'personal' && ex.charId && String(ex.charId) !== String(filterCharId)) {
          return;
        }

        countdowns.push({
          id: 'sr_exam_' + ex.id,
          title: ex.title || '考试备考',
          targetDate: ex.targetDate,
          category: 'exam',
          relationType: ex.charId ? 'specificChar' : 'personal',
          charId: ex.charId || null,
          charName: ex.charName || '',
          isPinned: !!ex.isPinned,
          notes: ex.notes || '陪伴自习室备战考试计划',
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
        found.notes = item.notes;
        found.isPinned = !!item.isPinned;
        found.charId = item.charId || null;
        found.updatedAt = Date.now();
      } else {
        exams.push({
          id: rawId || ('exam_' + Date.now()),
          title: item.title,
          targetDate: item.targetDate,
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

    // 6. 自习室专注记录与日历统计联动
    // 权威源：wanwan_study_records
    async getRecordsMap() {
      var records = await loadConfig(STORAGE_KEYS.STUDY_RECORDS, []);
      var map = {};
      if (!Array.isArray(records)) return map;

      records.forEach(function(r) {
        if (!r) return;
        var dateStr = '';
        if (r.startTime) {
          dateStr = new Date(r.startTime).toISOString().slice(0, 10);
        } else if (r.date) {
          dateStr = String(r.date).slice(0, 10);
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
    return d.toISOString().slice(0, 10);
  }

  // ==========================================
  // 三、跨应用导航服务 (CrossAppNavigator)
  // ==========================================
  var CrossAppNavigator = {
    async navigateTo(source) {
      if (!source || !source.app) return;

      // 1. 跳转至恋爱记
      if (source.app === 'love-diary') {
        var charId = source.charId;
        var tab = (source.type === 'wish') ? 'wishes' : 'album';

        // 先确保关闭当前日历或上层弹窗，避免层级冲突
        if (window.TimeCalendarApp && window.TimeCalendarApp.close) {
          // 可以保留日历在背景，也可以平滑切换
        }

        if (window.showLoveDiaryPage) {
          await window.showLoveDiaryPage({
            charId: charId,
            tab: tab,
            targetWishId: source.wishId
          });
          if (window.toast) window.toast('已跳转至恋爱记' + (tab === 'wishes' ? '心愿清单' : '情侣空间'));
        } else {
          alert('恋爱记模块未就绪');
        }
        return;
      }

      // 2. 跳转至陪伴自习室
      if (source.app === 'study-room') {
        var targetTab = 'duo';
        if (source.type === 'exam') targetTab = 'resources';
        else if (source.type === 'record') targetTab = 'report';
        else targetTab = 'duo';

        if (window.showStudyRoomPage) {
          await window.showStudyRoomPage({
            tab: targetTab,
            targetTodoId: source.todoId
          });
          if (window.toast) window.toast('已跳转至陪伴自习室');
        } else {
          alert('陪伴自习室模块未就绪');
        }
        return;
      }

      // 3. 跳转至人生游戏 (阶段 3 联动)
      if (source.app === 'life-game') {
        if (window.LifeGameIntegrations && typeof window.LifeGameIntegrations.navigateToLifeGame === 'function') {
          await window.LifeGameIntegrations.navigateToLifeGame({
            tab: source.type === 'goal' ? 'goals' : 'tasks',
            targetTaskId: source.taskId || null,
            targetGoalId: source.goalId || null
          });
        } else if (window.showLifeGamePage) {
          await window.showLifeGamePage({
            tab: source.type === 'goal' ? 'goals' : 'tasks',
            targetTaskId: source.taskId || null,
            targetGoalId: source.goalId || null
          });
          if (window.toast) window.toast('已跳转至人生游戏');
        } else {
          alert('人生游戏模块未就绪');
        }
        return;
      }
    }
  };

  // ==========================================
  // 四、对外公开接口与单例挂载
  // ==========================================
  window.TimeCalendarIntegrations = {
    on: on,
    off: off,
    emit: emit,
    loveDiary: LoveDiaryAdapter,
    studyRoom: StudyRoomAdapter,
    navigate: CrossAppNavigator.navigateTo,

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
