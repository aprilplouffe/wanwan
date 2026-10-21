// js/life-game-integrations.js — 人生游戏 × 陪伴自习室 × 时光日历深度联动中枢 (阶段 3)
// 核心原则：单一权威数据源、跨软件安全排期、防循环更新、完成与领奖严格分离、多角色隔离、自愈补偿

(function(global) {
  'use strict';

  var STORAGE_KEYS = {
    LINKS: 'life_game_integrations_links_v1',
    SYNC_LOGS: 'life_game_integrations_sync_logs_v1',
    STUDY_TODOS: 'wanwan_study_todos',
    STUDY_EXAMS: 'wanwan_study_exams',
    STUDY_RECORDS: 'wanwan_study_records',
    SETTLED_STUDY: 'life_game_records_settled_v1',
    CALENDAR_EVENTS: 'time_calendar_events',
    TASKS: 'life_game_tasks_v1',
    GOALS: 'life_game_goals_v1'
  };

  // 并发防循环与防重入锁字典 (operation locks)
  var _syncLocks = {};
  var LOCK_TIMEOUT_MS = 2000;

  function acquireLock(key) {
    var now = Date.now();
    if (_syncLocks[key] && (now - _syncLocks[key]) < LOCK_TIMEOUT_MS) {
      return false; // 锁处于活跃状态，拦截防循环
    }
    _syncLocks[key] = now;
    return true;
  }

  function releaseLock(key) {
    delete _syncLocks[key];
  }

  // 通用持久化存储加载/保存 (优先 Dexie db.config，降级 localStorage)
  async function loadConfig(key, fallback) {
    try {
      if (global.db && global.db.config) {
        var row = await global.db.config.get(key);
        if (row && row.value !== undefined) return row.value;
      }
    } catch (_) {}
    try {
      var raw = localStorage.getItem('lg_' + key) || localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return fallback;
  }

  async function saveConfig(key, value) {
    try {
      if (global.db && global.db.config) {
        await global.db.config.put({ key: key, value: value });
      }
    } catch (_) {}
    try {
      localStorage.setItem('lg_' + key, JSON.stringify(value));
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function uid(prefix) {
    return (prefix || 'link') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  // ==========================================
  // 1. 跨软件映射索引管理 (Link Registry)
  // ==========================================
  var LinkRegistry = {
    async getLinks() {
      return await loadConfig(STORAGE_KEYS.LINKS, []);
    },

    async saveLinks(links) {
      await saveConfig(STORAGE_KEYS.LINKS, links);
    },

    async findLink(sourceApp, sourceId, targetApp) {
      var links = await this.getLinks();
      return links.find(function(l) {
        return l.status === 'active' &&
          l.sourceApp === sourceApp &&
          String(l.sourceId) === String(sourceId) &&
          (!targetApp || l.targetApp === targetApp);
      }) || null;
    },

    async findLinkByTarget(targetApp, targetId, sourceApp) {
      var links = await this.getLinks();
      return links.find(function(l) {
        return l.status === 'active' &&
          l.targetApp === targetApp &&
          String(l.targetId) === String(targetId) &&
          (!sourceApp || l.sourceApp === sourceApp);
      }) || null;
    },

    async createOrUpdateLink(linkObj) {
      var links = await this.getLinks();
      var linkId = linkObj.linkId || ('link_' + linkObj.sourceApp + '_' + linkObj.sourceId + '_' + linkObj.targetApp);
      var idx = links.findIndex(function(l) { return l.linkId === linkId; });

      var linkRecord = Object.assign({
        linkId: linkId,
        sourceApp: linkObj.sourceApp,
        sourceType: linkObj.sourceType,
        sourceId: linkObj.sourceId,
        targetApp: linkObj.targetApp,
        targetType: linkObj.targetType,
        targetId: linkObj.targetId,
        charId: linkObj.charId || null,
        syncVersion: 1,
        sourceUpdatedAt: Date.now(),
        lastSyncedAt: Date.now(),
        status: 'active'
      }, linkObj);

      if (idx >= 0) {
        links[idx] = linkRecord;
      } else {
        links.push(linkRecord);
      }

      await this.saveLinks(links);
      return linkRecord;
    },

    async removeLink(linkId) {
      var links = await this.getLinks();
      var target = links.find(function(l) { return l.linkId === linkId; });
      if (target) {
        target.status = 'detached';
        target.lastSyncedAt = Date.now();
        await this.saveLinks(links);
      }
    },

    async logSync(action, detail) {
      try {
        var logs = await loadConfig(STORAGE_KEYS.SYNC_LOGS, []);
        logs.unshift({
          id: uid('synclog'),
          action: action,
          detail: detail,
          timestamp: Date.now()
        });
        if (logs.length > 80) logs = logs.slice(0, 80);
        await saveConfig(STORAGE_KEYS.SYNC_LOGS, logs);
      } catch (_) {}
    }
  };

  // ==========================================
  // 2. 人生游戏 × 陪伴自习室待办双向联动
  // ==========================================
  var StudyTodoIntegration = {
    // 2.1 将人生游戏委托关联/同步至自习室待办
    async linkTaskToStudyTodo(task, options) {
      if (!task || !task.id) return null;
      var lockKey = 'sr_todo_sync_' + task.id;
      if (!acquireLock(lockKey)) return null;

      try {
        var todos = await loadConfig(STORAGE_KEYS.STUDY_TODOS, []);
        if (!Array.isArray(todos)) todos = [];

        var existingLink = await LinkRegistry.findLink('life-game', task.id, 'study-room');
        var targetTodo = null;

        if (existingLink && existingLink.targetId) {
          targetTodo = todos.find(function(t) { return String(t.id) === String(existingLink.targetId); });
        } else if (task.studyTodoId) {
          targetTodo = todos.find(function(t) { return String(t.id) === String(task.studyTodoId); });
        }

        var todoDate = task.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) ? task.dueDate : getTodayStr();
        var isDone = task.status === 'completed' || task.status === 'claimed';

        if (targetTodo) {
          // 仅在属性有真实差异时更新，避免无意义写盘
          if (targetTodo.text !== task.title || targetTodo.date !== todoDate || targetTodo.done !== isDone) {
            targetTodo.text = task.title;
            targetTodo.date = todoDate;
            targetTodo.done = isDone;
            targetTodo.updatedAt = Date.now();
          }
        } else {
          var newTodoId = 'sr_todo_lg_' + task.id;
          targetTodo = {
            id: newTodoId,
            text: task.title,
            date: todoDate,
            done: isDone,
            charId: task.charId || null,
            charName: task.charName || '',
            createdAt: task.createdAt || Date.now(),
            updatedAt: Date.now(),
            source: {
              app: 'life-game',
              type: 'task',
              taskId: task.id,
              readOnly: false
            }
          };
          todos.push(targetTodo);
        }

        await saveConfig(STORAGE_KEYS.STUDY_TODOS, todos);

        // 同步自习室运行时 state
        if (global.WanwanStudyRoom && typeof global.WanwanStudyRoom.getState === 'function') {
          var srState = global.WanwanStudyRoom.getState();
          if (srState) srState.todos = todos;
        }

        // 更新 task 本身的 studyTodoId 标记
        if (task.studyTodoId !== targetTodo.id) {
          task.studyTodoId = targetTodo.id;
          task.linkedSource = 'studyRoom';
          if (global.LifeGameCore && options && options.saveTaskDirectly) {
            var tasks = await global.LifeGameCore.getTasks();
            var cur = tasks.find(function(t) { return t.id === task.id; });
            if (cur) {
              cur.studyTodoId = targetTodo.id;
              cur.linkedSource = 'studyRoom';
              await global.LifeGameCore.saveTasks(tasks);
            }
          }
        }

        // 注册关联映射
        await LinkRegistry.createOrUpdateLink({
          sourceApp: 'life-game',
          sourceType: 'task',
          sourceId: task.id,
          targetApp: 'study-room',
          targetType: 'todo',
          targetId: targetTodo.id,
          charId: task.charId || null
        });

        await LinkRegistry.logSync('linkTaskToStudyTodo', { taskId: task.id, todoId: targetTodo.id });

        // 触发自习室界面刷新事件
        if (global.TimeCalendarIntegrations && typeof global.TimeCalendarIntegrations.emit === 'function') {
          global.TimeCalendarIntegrations.emit('todo_changed', { todoId: targetTodo.id, originApp: 'life-game' });
        }

        return targetTodo;
      } finally {
        releaseLock(lockKey);
      }
    },

    // 2.2 解除人生游戏任务与自习室待办的关联
    async unlinkTaskFromStudyTodo(taskId) {
      var lockKey = 'sr_todo_sync_' + taskId;
      if (!acquireLock(lockKey)) return false;

      try {
        var existingLink = await LinkRegistry.findLink('life-game', taskId, 'study-room');
        if (existingLink) {
          await LinkRegistry.removeLink(existingLink.linkId);
        }

        if (global.LifeGameCore) {
          var tasks = await global.LifeGameCore.getTasks();
          var t = tasks.find(function(item) { return item.id === taskId; });
          if (t && t.studyTodoId) {
            delete t.studyTodoId;
            if (t.linkedSource === 'studyRoom') t.linkedSource = 'user';
            await global.LifeGameCore.saveTasks(tasks);
          }
        }

        await LinkRegistry.logSync('unlinkTaskFromStudyTodo', { taskId: taskId });
        return true;
      } finally {
        releaseLock(lockKey);
      }
    },

    // 2.3 自习室待办被勾选/取消勾选时的回调处理
    // 关键安全机制：待办完成 → 任务标记为已达成(completed)，但绝不自动领奖(claimed)！
    async handleStudyTodoToggled(todoId, done, originApp) {
      if (originApp === 'life-game') return; // 防自身回环
      var lockKey = 'sr_todo_toggle_' + todoId;
      if (!acquireLock(lockKey)) return;

      try {
        var link = await LinkRegistry.findLinkByTarget('study-room', todoId, 'life-game');
        var taskId = link ? link.sourceId : null;

        // 若索引未命中，通过 id 命名惯例或 tasks 属性后备匹配
        if (!taskId && global.LifeGameCore) {
          var allTasks = await global.LifeGameCore.getTasks();
          var matched = allTasks.find(function(t) {
            return t.studyTodoId === todoId || t.id === String(todoId).replace(/^sr_todo_lg_/, '');
          });
          if (matched) taskId = matched.id;
        }

        if (!taskId || !global.LifeGameCore) return;

        var tasks = await global.LifeGameCore.getTasks();
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) return;

        var changed = false;
        if (done) {
          if (task.status === 'pending') {
            task.status = 'completed';
            task.completedAt = Date.now();
            changed = true;
          }
        } else {
          // 若处于 completed 且未领奖，则允许撤销回 pending；若已领奖则不可回退
          if (task.status === 'completed') {
            task.status = 'pending';
            task.completedAt = null;
            changed = true;
          }
        }

        if (changed) {
          await global.LifeGameCore.saveTasks(tasks);
          await LinkRegistry.logSync('studyTodoToggledSync', { taskId: task.id, todoId: todoId, done: done, status: task.status });

          // 刷新人生游戏界面
          var page = document.getElementById('life-game-page');
          if (page && global.LifeGameApp) {
            global.LifeGameApp.render();
          }
        }
      } finally {
        releaseLock(lockKey);
      }
    },

    // 2.4 自习室待办被修改（标题/日期）时的回调处理
    async handleStudyTodoChanged(todoId, updatedData, originApp) {
      if (originApp === 'life-game') return;
      var lockKey = 'sr_todo_change_' + todoId;
      if (!acquireLock(lockKey)) return;

      try {
        var link = await LinkRegistry.findLinkByTarget('study-room', todoId, 'life-game');
        var taskId = link ? link.sourceId : null;
        if (!taskId && global.LifeGameCore) {
          var allTasks = await global.LifeGameCore.getTasks();
          var matched = allTasks.find(function(t) {
            return t.studyTodoId === todoId || t.id === String(todoId).replace(/^sr_todo_lg_/, '');
          });
          if (matched) taskId = matched.id;
        }

        if (!taskId || !global.LifeGameCore) return;

        var tasks = await global.LifeGameCore.getTasks();
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) return;

        var changed = false;
        if (updatedData && updatedData.text && updatedData.text !== task.title) {
          task.title = updatedData.text;
          changed = true;
        }
        if (updatedData && updatedData.date && updatedData.date !== task.dueDate) {
          task.dueDate = updatedData.date;
          changed = true;
        }

        if (changed) {
          await global.LifeGameCore.saveTasks(tasks);
          await LinkRegistry.logSync('studyTodoChangedSync', { taskId: task.id, todoId: todoId });

          var page = document.getElementById('life-game-page');
          if (page && global.LifeGameApp) {
            global.LifeGameApp.render();
          }
        }
      } finally {
        releaseLock(lockKey);
      }
    }
  };

  // ==========================================
  // 3. 自习室真实专注时长自动推进 RPG 学习任务
  // ==========================================
  var StudyFocusSessionIntegration = {
    async handleFocusSessionCompleted(payload) {
      if (!payload || !payload.durationMinutes) return;
      var duration = Number(payload.durationMinutes) || 0;
      if (duration <= 0) return;

      var recId = payload.recordId || ('focus_' + (payload.timestamp || Date.now()) + '_' + duration);
      var lockKey = 'focus_progression_' + recId;
      if (!acquireLock(lockKey)) return;

      try {
        // 1. 记入已结算专注流水，防止手动核销重复累加
        if (global.LifeGameCore && typeof global.LifeGameCore.addSettledStudyRecordId === 'function') {
          await global.LifeGameCore.addSettledStudyRecordId(recId);
        }

        if (!global.LifeGameCore) return;
        var tasks = await global.LifeGameCore.getTasks();
        if (!Array.isArray(tasks) || tasks.length === 0) return;

        var taskName = (payload.taskName || '').trim();
        var targetTask = null;

        // 匹配逻辑优先级：
        // A. 具有相同 studyTodoId 或关联记录的任务
        if (payload.todoId) {
          targetTask = tasks.find(function(t) {
            return t.status === 'pending' && t.studyTodoId === payload.todoId;
          });
        }
        // B. 标题包含自习室当前任务名的学习类任务
        if (!targetTask && taskName) {
          targetTask = tasks.find(function(t) {
            return t.status === 'pending' && t.category === 'study' && (t.title.indexOf(taskName) >= 0 || taskName.indexOf(t.title) >= 0);
          });
        }
        // C. 任意第一个待完成的学习攻坚任务
        if (!targetTask) {
          targetTask = tasks.find(function(t) {
            return t.status === 'pending' && t.category === 'study';
          });
        }

        if (targetTask) {
          var targetMins = targetTask.targetMinutes || 30;
          targetTask.accumulatedMinutes = (targetTask.accumulatedMinutes || 0) + duration;

          var justCompleted = false;
          if (targetTask.accumulatedMinutes >= targetMins && targetTask.status === 'pending') {
            targetTask.status = 'completed';
            targetTask.completedAt = Date.now();
            justCompleted = true;
          }

          await global.LifeGameCore.saveTasks(tasks);

          await LinkRegistry.logSync('focusSessionProgression', {
            taskId: targetTask.id,
            duration: duration,
            accumulated: targetTask.accumulatedMinutes,
            status: targetTask.status
          });

          // 如果任务刚好达成，触发轻提示引导用户到人生游戏领奖
          if (justCompleted && global.toast) {
            global.toast('🎯 现实委托「' + targetTask.title + '」已达成！前往人生游戏领取丰厚奖励！');
          }

          var page = document.getElementById('life-game-page');
          if (page && global.LifeGameApp) {
            global.LifeGameApp.render();
          }
        }
      } finally {
        releaseLock(lockKey);
      }
    }
  };

  // ==========================================
  // 4. 自习室考试计划 × 人生游戏长期愿景关联
  // ==========================================
  var ExamGoalIntegration = {
    // 4.1 获取可供关联的自习室备考计划列表
    async getAvailableExams() {
      if (global.TimeCalendarIntegrations && global.TimeCalendarIntegrations.studyRoom) {
        return await global.TimeCalendarIntegrations.studyRoom.getExams();
      }
      return await loadConfig(STORAGE_KEYS.STUDY_EXAMS, []);
    },

    // 4.2 关联愿景与考试计划
    async linkGoalToExam(goalId, examId) {
      if (!goalId || !examId || !global.LifeGameCore) return false;
      var lockKey = 'exam_goal_link_' + goalId;
      if (!acquireLock(lockKey)) return false;

      try {
        var goals = await global.LifeGameCore.getGoals();
        var goal = goals.find(function(g) { return g.id === goalId; });
        if (!goal) return false;

        var exams = await this.getAvailableExams();
        var exam = exams.find(function(e) { return String(e.id) === String(examId); });
        if (!exam) return false;

        goal.examId = exam.id;
        // 考试日期自动同步为愿景的目标达成日期
        if (exam.targetDate) {
          goal.targetDate = exam.targetDate;
        }

        await global.LifeGameCore.saveGoals(goals);

        await LinkRegistry.createOrUpdateLink({
          sourceApp: 'life-game',
          sourceType: 'goal',
          sourceId: goal.id,
          targetApp: 'study-room',
          targetType: 'exam',
          targetId: exam.id,
          charId: goal.charId || null
        });

        await LinkRegistry.logSync('linkGoalToExam', { goalId: goal.id, examId: exam.id });
        return true;
      } finally {
        releaseLock(lockKey);
      }
    },

    // 4.3 解除愿景与考试计划关联
    async unlinkGoalFromExam(goalId) {
      if (!goalId || !global.LifeGameCore) return false;
      var goals = await global.LifeGameCore.getGoals();
      var goal = goals.find(function(g) { return g.id === goalId; });
      if (!goal) return false;

      delete goal.examId;
      await global.LifeGameCore.saveGoals(goals);

      var link = await LinkRegistry.findLink('life-game', goalId, 'study-room');
      if (link && link.targetType === 'exam') {
        await LinkRegistry.removeLink(link.linkId);
      }

      await LinkRegistry.logSync('unlinkGoalFromExam', { goalId: goalId });
      return true;
    },

    // 4.4 考试计划在自习室或日历倒计时中修改时的自动联动同步
    async handleExamChanged(exams) {
      if (!Array.isArray(exams) || !global.LifeGameCore) return;
      var lockKey = 'exam_changed_sync';
      if (!acquireLock(lockKey)) return;

      try {
        var goals = await global.LifeGameCore.getGoals();
        var anyChanged = false;

        goals.forEach(function(goal) {
          if (goal.examId) {
            var matchedExam = exams.find(function(e) { return String(e.id) === String(goal.examId); });
            if (matchedExam && matchedExam.targetDate && matchedExam.targetDate !== goal.targetDate) {
              goal.targetDate = matchedExam.targetDate;
              anyChanged = true;
            }
          }
        });

        if (anyChanged) {
          await global.LifeGameCore.saveGoals(goals);
          await LinkRegistry.logSync('examChangedGoalSync', { goalsCount: goals.length });

          var page = document.getElementById('life-game-page');
          if (page && global.LifeGameApp) {
            global.LifeGameApp.render();
          }
        }
      } finally {
        releaseLock(lockKey);
      }
    }
  };

  // ==========================================
  // 5. 人生游戏 × 时光日历双向排期联动
  // ==========================================
  var CalendarScheduleIntegration = {
    // 5.1 将人生游戏中具有有效截止/排期日期的任务投射为日历日程事件
    async getTasksAsCalendarEvents(filterCharId, allCharacters) {
      if (!global.LifeGameCore) return [];
      var tasks = await global.LifeGameCore.getTasks();
      var events = [];
      if (!Array.isArray(tasks)) return events;

      var charMap = {};
      (allCharacters || []).forEach(function(c) {
        if (c && c.id) charMap[String(c.id)] = c;
      });

      tasks.forEach(function(task) {
        if (!task || !task.id) return;
        var taskDate = (task.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) ? task.dueDate : '';
        // 严格遵循规范：未设定具体有效排期日期的任务不强行投射，避免错误污染「今日」
        if (!taskDate) return;

        // 多角色隔离过滤
        if (filterCharId && filterCharId !== 'all' && filterCharId !== 'personal' && task.charId && String(task.charId) !== String(filterCharId)) {
          return;
        }

        var isDone = task.status === 'completed' || task.status === 'claimed';
        var charObj = task.charId ? charMap[String(task.charId)] : null;
        var charName = charObj ? (charObj.name || '') : (task.charName || '');

        events.push({
          id: 'lg_task_' + task.id,
          title: '人生委托 · ' + (task.title || '现实委托'),
          date: taskDate,
          isAllDay: true,
          startTime: task.startTime || '',
          endTime: '',
          category: 'other',
          relationType: task.charId ? 'specificChar' : 'personal',
          charId: task.charId || null,
          charName: charName,
          notes: (task.desc || '') + ' [难度: ' + (task.difficulty || 'mid') + ' | 奖励: +' + (task.rewardExp || 35) + 'EXP]',
          showInCountdown: false,
          completed: isDone,
          isPinned: false,
          createdAt: task.createdAt || Date.now(),
          updatedAt: task.updatedAt || Date.now(),
          source: {
            app: 'life-game',
            type: 'task',
            taskId: task.id,
            readOnly: false
          }
        });
      });

      return events;
    },

    // 5.2 日历中修改委托任务（标题、排期日期、说明）时回写权威源 (LifeGameCore)
    async saveTaskFromCalendar(item) {
      if (!item || !item.source || item.source.app !== 'life-game' || !global.LifeGameCore) return false;
      var taskId = item.source.taskId;
      var lockKey = 'tc_task_edit_' + taskId;
      if (!acquireLock(lockKey)) return false;

      try {
        var tasks = await global.LifeGameCore.getTasks();
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) return false;

        var changed = false;
        if (item.title) {
          var cleanTitle = item.title.replace(/^人生委托\s*[·:]\s*/, '').trim();
          if (cleanTitle && cleanTitle !== task.title) {
            task.title = cleanTitle;
            changed = true;
          }
        }

        if (item.date !== undefined && item.date !== task.dueDate) {
          task.dueDate = item.date;
          changed = true;
        }

        if (item.notes !== undefined) {
          // 清除附带的 [难度: ... | 奖励: ...] 后缀避免重复嵌套
          var cleanDesc = item.notes.replace(/\s*\[难度:[^\]]+\]\s*$/, '').trim();
          if (cleanDesc !== task.desc) {
            task.desc = cleanDesc;
            changed = true;
          }
        }

        if (changed) {
          task.updatedAt = Date.now();
          await global.LifeGameCore.saveTasks(tasks);

          // 若任务同时关联了自习室待办，协同更新待办
          if (task.studyTodoId) {
            await StudyTodoIntegration.linkTaskToStudyTodo(task);
          }

          await LinkRegistry.logSync('saveTaskFromCalendar', { taskId: task.id, title: task.title, date: task.dueDate });

          var page = document.getElementById('life-game-page');
          if (page && global.LifeGameApp) {
            global.LifeGameApp.render();
          }
        }

        return true;
      } finally {
        releaseLock(lockKey);
      }
    },

    // 5.3 日历中打勾切换委托任务的完成状态
    // 关键安全机制：日历勾选 → 人生游戏任务状态标记为 completed (达成)，绝不提前领奖！
    async toggleTaskFromCalendar(taskId) {
      if (!taskId || !global.LifeGameCore) return false;
      var lockKey = 'tc_task_toggle_' + taskId;
      if (!acquireLock(lockKey)) return false;

      try {
        var tasks = await global.LifeGameCore.getTasks();
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) return false;

        if (task.status === 'claimed') {
          // 已领奖任务不可在日历中随意反选或重复领奖
          return true;
        }

        var isNowCompleted = false;
        if (task.status === 'completed') {
          task.status = 'pending';
          task.completedAt = null;
          isNowCompleted = false;
        } else {
          task.status = 'completed';
          task.completedAt = Date.now();
          isNowCompleted = true;
        }

        await global.LifeGameCore.saveTasks(tasks);

        // 同步自习室待办
        if (task.studyTodoId) {
          await StudyTodoIntegration.linkTaskToStudyTodo(task);
        }

        await LinkRegistry.logSync('toggleTaskFromCalendar', { taskId: task.id, status: task.status });

        var page = document.getElementById('life-game-page');
        if (page && global.LifeGameApp) {
          global.LifeGameApp.render();
        }

        return isNowCompleted;
      } finally {
        releaseLock(lockKey);
      }
    },

    // 5.4 从日历中移除排期 (解除日期，不删除人生游戏任务实体)
    async unlinkTaskFromCalendar(taskId) {
      if (!taskId || !global.LifeGameCore) return false;
      var tasks = await global.LifeGameCore.getTasks();
      var task = tasks.find(function(t) { return t.id === taskId; });
      if (!task) return false;

      task.dueDate = '';
      await global.LifeGameCore.saveTasks(tasks);

      await LinkRegistry.logSync('unlinkTaskFromCalendar', { taskId: taskId });
      return true;
    }
  };

  // ==========================================
  // 6. 三个 App 之间安全跳转与深度链接 (CrossAppNav)
  // ==========================================
  var CrossAppNav = {
    // 6.1 跳转至陪伴自习室
    async navigateToStudyRoom(options) {
      options = options || {};
      var targetTab = options.tab || 'duo';
      if (global.showStudyRoomPage) {
        await global.showStudyRoomPage({
          tab: targetTab,
          targetTodoId: options.targetTodoId || null
        });
        if (global.toast) global.toast('已跳转至陪伴自习室');
      } else {
        alert('陪伴自习室模块未就绪');
      }
    },

    // 6.2 跳转至时光日历
    async navigateToTimeCalendar(options) {
      options = options || {};
      if (global.showTimeCalendarPage) {
        await global.showTimeCalendarPage({
          tab: options.tab || 'schedule',
          date: options.date || null,
          eventId: options.eventId || null
        });
        if (global.toast) global.toast('已跳转至时光日历');
      } else {
        alert('时光日历模块未就绪');
      }
    },

    // 6.3 跳转至人生游戏 (带参数自动切换 tab 并定位目标任务/愿景)
    async navigateToLifeGame(options) {
      options = options || {};
      if (global.showLifeGamePage) {
        await global.showLifeGamePage({
          tab: options.tab || 'tasks',
          targetTaskId: options.targetTaskId || null,
          targetGoalId: options.targetGoalId || null
        });
        if (global.toast) global.toast('已跳转至人生游戏');
      } else {
        alert('人生游戏模块未就绪');
      }
    }
  };

  // ==========================================
  // 7. 异常自愈与补偿机制 (Self-Healing & Reconcile)
  // ==========================================
  async function reconcileLinks() {
    var report = { checkedTasks: 0, checkedGoals: 0, repairedLinks: 0, orphanedDetached: 0 };
    if (!global.LifeGameCore) return report;

    try {
      var tasks = await global.LifeGameCore.getTasks();
      var goals = await global.LifeGameCore.getGoals();
      var todos = await loadConfig(STORAGE_KEYS.STUDY_TODOS, []);
      var exams = await ExamGoalIntegration.getAvailableExams();
      var links = await LinkRegistry.getLinks();

      report.checkedTasks = tasks.length;
      report.checkedGoals = goals.length;

      var todoMap = {};
      (todos || []).forEach(function(t) { if (t && t.id) todoMap[String(t.id)] = t; });

      var examMap = {};
      (exams || []).forEach(function(e) { if (e && e.id) examMap[String(e.id)] = e; });

      // 1. 校验任务的自习待办链接真实性
      var tasksModified = false;
      for (var i = 0; i < tasks.length; i++) {
        var t = tasks[i];
        if (t.studyTodoId) {
          if (!todoMap[String(t.studyTodoId)]) {
            // 目标待办已在自习室物理删除，优雅解除引用而不损坏任务
            delete t.studyTodoId;
            if (t.linkedSource === 'studyRoom') t.linkedSource = 'user';
            tasksModified = true;
            report.orphanedDetached++;
          } else {
            // 状态自愈同步
            var todo = todoMap[String(t.studyTodoId)];
            var tDone = t.status === 'completed' || t.status === 'claimed';
            if (todo.done && t.status === 'pending') {
              t.status = 'completed';
              t.completedAt = Date.now();
              tasksModified = true;
              report.repairedLinks++;
            }
          }
        }
      }
      if (tasksModified) {
        await global.LifeGameCore.saveTasks(tasks);
      }

      // 2. 校验愿景的考试链接真实性
      var goalsModified = false;
      for (var j = 0; j < goals.length; j++) {
        var g = goals[j];
        if (g.examId) {
          if (!examMap[String(g.examId)]) {
            delete g.examId;
            goalsModified = true;
            report.orphanedDetached++;
          } else {
            var ex = examMap[String(g.examId)];
            if (ex.targetDate && ex.targetDate !== g.targetDate) {
              g.targetDate = ex.targetDate;
              goalsModified = true;
              report.repairedLinks++;
            }
          }
        }
      }
      if (goalsModified) {
        await global.LifeGameCore.saveGoals(goals);
      }

      await LinkRegistry.logSync('reconcileLinks', report);
    } catch (err) {
      console.warn('[LifeGameIntegrations] reconcile error:', err);
    }

    return report;
  }

  // ==========================================
  // 8. 全域事件总线监听与主动注册
  // ==========================================
  function setupEventListeners() {
    // 监听自习室待办事件
    if (global.TimeCalendarIntegrations && typeof global.TimeCalendarIntegrations.on === 'function') {
      global.TimeCalendarIntegrations.on('todo_toggled', function(data) {
        if (data && data.todoId) {
          StudyTodoIntegration.handleStudyTodoToggled(data.todoId, data.done, data.originApp);
        }
      });

      global.TimeCalendarIntegrations.on('todo_changed', function(data) {
        if (data && data.todoId) {
          StudyTodoIntegration.handleStudyTodoChanged(data.todoId, data, data.originApp);
        }
      });

      global.TimeCalendarIntegrations.on('exam_changed', function(exams) {
        ExamGoalIntegration.handleExamChanged(exams);
      });
    }

    // 监听全域专注完成事件
    if (global.WanwanSharedHub && typeof global.WanwanSharedHub.on === 'function') {
      global.WanwanSharedHub.on('FOCUS_SESSION_COMPLETED', function(payload) {
        StudyFocusSessionIntegration.handleFocusSessionCompleted(payload);
      });
    }
  }

  // 立即或在 DOM 加载完成后挂载监听
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEventListeners);
  } else {
    setupEventListeners();
  }

  // ==========================================
  // 9. 对外暴露全局单例
  // ==========================================
  global.LifeGameIntegrations = {
    links: LinkRegistry,
    studyRoom: StudyTodoIntegration,
    focusSession: StudyFocusSessionIntegration,
    exams: ExamGoalIntegration,
    calendar: CalendarScheduleIntegration,
    nav: CrossAppNav,

    // 顶层便捷门面方法
    linkTaskToStudyTodo: StudyTodoIntegration.linkTaskToStudyTodo,
    unlinkTaskFromStudyTodo: StudyTodoIntegration.unlinkTaskFromStudyTodo,
    getAvailableExams: ExamGoalIntegration.getAvailableExams,
    linkGoalToExam: ExamGoalIntegration.linkGoalToExam,
    unlinkGoalFromExam: ExamGoalIntegration.unlinkGoalFromExam,
    getTasksAsCalendarEvents: CalendarScheduleIntegration.getTasksAsCalendarEvents,
    saveTaskFromCalendar: CalendarScheduleIntegration.saveTaskFromCalendar,
    toggleTaskFromCalendar: CalendarScheduleIntegration.toggleTaskFromCalendar,
    unlinkTaskFromCalendar: CalendarScheduleIntegration.unlinkTaskFromCalendar,

    navigateToStudyRoom: CrossAppNav.navigateToStudyRoom,
    navigateToTimeCalendar: CrossAppNav.navigateToTimeCalendar,
    navigateToLifeGame: CrossAppNav.navigateToLifeGame,

    reconcileLinks: reconcileLinks
  };

})(typeof window !== 'undefined' ? window : this);
