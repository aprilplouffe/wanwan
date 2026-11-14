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
    FOCUS_ALLOCATIONS: 'life_game_focus_allocations_v1',
    UNALLOCATED_FOCUS_RECORDS: 'life_game_unallocated_focus_records_v1',
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

  function formatLocalDate(d) {
    if (!d) return '';
    var dateObj = d instanceof Date ? d : new Date(d);
    if (isNaN(dateObj.getTime())) return '';
    return dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + String(dateObj.getDate()).padStart(2, '0');
  }

  function getTodayStr() {
    if (global.TimeCalendarIntegrations && typeof global.TimeCalendarIntegrations.getTodayLocalDateStr === 'function') {
      return global.TimeCalendarIntegrations.getTodayLocalDateStr();
    }
    return formatLocalDate(new Date());
  }

  function computeEndTimeFromStart(startTime, durationMins) {
    if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) return '';
    var p = startTime.split(':');
    var total = parseInt(p[0], 10) * 60 + parseInt(p[1], 10) + (Math.max(15, parseInt(durationMins, 10) || 60));
    if (total >= 24 * 60) total = 23 * 60 + 59;
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
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
    // 2.1 将人生游戏委托关联/同步至自习室待办 (幂等查找、防重复创建、支持成功/部分成功/失败多态状态)
    async linkTaskToStudyTodo(task, options) {
      options = options || {};
      if (!task || !task.id) {
        return {
          status: 'failed',
          success: false,
          partial: false,
          stepResults: { lifeGameTask: { success: false, error: 'task_missing' } },
          error: 'task_missing'
        };
      }
      var lockKey = 'sr_todo_sync_' + task.id;
      if (!acquireLock(lockKey)) {
        return {
          status: 'failed',
          success: false,
          partial: false,
          stepResults: { lifeGameTask: { success: true, taskId: task.id }, lock: { acquired: false } },
          error: 'locked'
        };
      }

      var stepResults = {
        lifeGameTask: { success: true, taskId: task.id },
        studyRoomTodo: { success: false },
        linkRegistry: { success: false }
      };

      try {
        var todos = await loadConfig(STORAGE_KEYS.STUDY_TODOS, []);
        if (!Array.isArray(todos)) todos = [];

        // 核心加固：按稳定来源 ID 与任务 ID 查找已有记录，重试或修复时绝不重复创建
        var stableTodoId = 'sr_todo_lg_' + task.id;
        var existingLink = await LinkRegistry.findLink('life-game', task.id, 'study-room');
        var targetTodo = null;

        if (existingLink && existingLink.targetId) {
          targetTodo = todos.find(function(t) { return String(t.id) === String(existingLink.targetId); });
        }
        if (!targetTodo && task.studyTodoId) {
          targetTodo = todos.find(function(t) { return String(t.id) === String(task.studyTodoId); });
        }
        if (!targetTodo) {
          targetTodo = todos.find(function(t) {
            return String(t.id) === stableTodoId ||
              (t.source && t.source.app === 'life-game' && String(t.source.taskId) === String(task.id));
          });
        }

        // 故障注入测试点：测试人生游戏任务保存成功、自习室待办创建失败
        if (options._injectStudyRoomFailure) {
          stepResults.studyRoomTodo.error = 'injected_study_room_failure';
          await LinkRegistry.logSync('linkTaskToStudyTodo_partial_fail', { taskId: task.id, step: 'studyRoomTodo' });
          return {
            status: 'partial',
            success: false,
            partial: true,
            stepResults: stepResults,
            error: 'study_room_creation_failed'
          };
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
          stepResults.studyRoomTodo = { success: true, todoId: targetTodo.id, reused: true };
        } else {
          targetTodo = {
            id: stableTodoId,
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
          stepResults.studyRoomTodo = { success: true, todoId: targetTodo.id, created: true };
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
          if (global.LifeGameCore && options.saveTaskDirectly) {
            var tasks = await global.LifeGameCore.getTasks();
            var cur = tasks.find(function(t) { return t.id === task.id; });
            if (cur) {
              cur.studyTodoId = targetTodo.id;
              cur.linkedSource = 'studyRoom';
              await global.LifeGameCore.saveTasks(tasks);
            }
          }
        }

        // 故障注入测试点：测试自习室创建成功、链接注册表保存失败（部分成功状态）
        if (options._injectLinkRegistryFailure) {
          stepResults.linkRegistry.error = 'injected_link_registry_failure';
          await LinkRegistry.logSync('linkTaskToStudyTodo_partial_fail', { taskId: task.id, step: 'linkRegistry' });
          return Object.assign(targetTodo, {
            status: 'partial',
            success: false,
            partial: true,
            stepResults: stepResults,
            todo: targetTodo,
            error: 'link_registry_save_failed'
          });
        }

        // 注册关联映射
        var linkRecord = await LinkRegistry.createOrUpdateLink({
          sourceApp: 'life-game',
          sourceType: 'task',
          sourceId: task.id,
          targetApp: 'study-room',
          targetType: 'todo',
          targetId: targetTodo.id,
          charId: task.charId || null
        });
        stepResults.linkRegistry = { success: true, linkId: linkRecord.linkId };

        await LinkRegistry.logSync('linkTaskToStudyTodo', { taskId: task.id, todoId: targetTodo.id });

        // 触发自习室界面刷新事件
        if (global.TimeCalendarIntegrations && typeof global.TimeCalendarIntegrations.emit === 'function') {
          global.TimeCalendarIntegrations.emit('todo_changed', { todoId: targetTodo.id, originApp: 'life-game' });
        }

        // 返回兼具 Todo 实体属性与显式状态报告的对象（既完全兼容老代码直接读 .id/.text，又提供 .status）
        return Object.assign(targetTodo, {
          status: 'success',
          success: true,
          partial: false,
          stepResults: stepResults,
          todo: targetTodo
        });
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
  // 3. 自习室真实专注时长自动推进 RPG 学习任务 (加固版)
  // 核心安全原则：稳定任务 ID 优先、严禁乱计入最新任务、未匹配留存待分配池、时长防多任务重用、基础经验与任务进度独立判定
  // ==========================================
  var StudyFocusSessionIntegration = {
    // 读取任务时长分配注册表 { [recordId]: { taskId, taskTitle, durationMinutes, allocatedAt } }
    async getAllocations() {
      return await loadConfig(STORAGE_KEYS.FOCUS_ALLOCATIONS, {});
    },

    async saveAllocations(allocations) {
      await saveConfig(STORAGE_KEYS.FOCUS_ALLOCATIONS, allocations);
    },

    // 读取待分配专注记录池
    async getUnallocatedRecords() {
      return await loadConfig(STORAGE_KEYS.UNALLOCATED_FOCUS_RECORDS, []);
    },

    async saveUnallocatedRecords(records) {
      await saveConfig(STORAGE_KEYS.UNALLOCATED_FOCUS_RECORDS, records);
    },

    // 内部方法：将无法匹配的专注记录记入待分配池（防重复添加）
    async _recordAsUnallocated(payload, recId, duration) {
      try {
        var unallocated = await this.getUnallocatedRecords();
        if (!Array.isArray(unallocated)) unallocated = [];
        var exists = unallocated.some(function(r) { return r.recordId === recId; });
        if (!exists) {
          unallocated.unshift({
            recordId: recId,
            durationMinutes: duration,
            taskName: (payload.taskName || payload.name || '').trim(),
            todoId: payload.todoId || null,
            charId: payload.companionCharId || (payload.companionChar && payload.companionChar.id) || null,
            charName: payload.companionCharName || (payload.companionChar && payload.companionChar.name) || '',
            status: 'unallocated',
            timestamp: payload.timestamp || Date.now(),
            createdAt: Date.now()
          });
          if (unallocated.length > 100) unallocated = unallocated.slice(0, 100);
          await this.saveUnallocatedRecords(unallocated);
          await LinkRegistry.logSync('focusRecordUnallocated', { recordId: recId, duration: duration, taskName: payload.taskName });
        }
      } catch (e) {
        console.warn('[LifeGameIntegrations] _recordAsUnallocated error:', e);
      }
    },

    // 内部方法：从待分配池中移除已分配记录
    async _removeUnallocatedRecord(recId) {
      try {
        var unallocated = await this.getUnallocatedRecords();
        if (!Array.isArray(unallocated)) return;
        var filtered = unallocated.filter(function(r) { return r.recordId !== recId; });
        if (filtered.length !== unallocated.length) {
          await this.saveUnallocatedRecords(filtered);
        }
      } catch (_) {}
    },

    // 核心推进引擎：为具体任务分配专注进度
    async allocateFocusRecord(payload, options) {
      options = options || {};
      if (!payload || !payload.durationMinutes) return { status: 'ignored', reason: 'invalid_duration' };
      var duration = Number(payload.durationMinutes) || 0;
      if (duration <= 0) return { status: 'ignored', reason: 'invalid_duration' };

      var recId = payload.recordId || payload.id || ('focus_' + (payload.timestamp || Date.now()) + '_' + duration);

      // 1. 防重复消费：检查该段专注时长是否已被分配给任务
      var allocations = await this.getAllocations();
      if (allocations && allocations[recId]) {
        return {
          status: 'already_allocated',
          taskId: allocations[recId].taskId,
          allocatedMinutes: allocations[recId].durationMinutes,
          taskTitle: allocations[recId].taskTitle
        };
      }

      if (!global.LifeGameCore) return { status: 'failed', reason: 'core_unavailable' };
      var tasks = await global.LifeGameCore.getTasks();
      if (!Array.isArray(tasks) || tasks.length === 0) {
        await this._recordAsUnallocated(payload, recId, duration);
        return { status: 'unallocated', recordId: recId, reason: 'no_tasks' };
      }

      var targetTask = null;
      var taskName = (payload.taskName || payload.name || '').trim();

      // 规则 A：稳定任务 ID 严格优先
      if (payload.taskId) {
        targetTask = tasks.find(function(t) {
          return String(t.id) === String(payload.taskId) && (t.status === 'pending' || (options.allowCompleted && t.status === 'completed'));
        });
      }

      // 规则 B：关联的自习待办 ID 匹配
      if (!targetTask && payload.todoId) {
        targetTask = tasks.find(function(t) {
          return (t.status === 'pending' || (options.allowCompleted && t.status === 'completed')) && String(t.studyTodoId) === String(payload.todoId);
        });
      }

      // 规则 C：严格规范化的学习类任务标题匹配 (必须包含或完全吻合)
      if (!targetTask && taskName) {
        targetTask = tasks.find(function(t) {
          if (t.status !== 'pending' && !(options.allowCompleted && t.status === 'completed')) return false;
          if (t.category !== 'study') return false;
          var cleanTitle = t.title.trim().toLowerCase();
          var cleanTarget = taskName.toLowerCase();
          return cleanTitle === cleanTarget || cleanTitle.indexOf(cleanTarget) >= 0 || cleanTarget.indexOf(cleanTitle) >= 0;
        });
      }

      // 严格安全屏障：禁止将无法匹配的专注记录自动计入最新学习任务！未匹配记录保留为待分配状态
      if (!targetTask) {
        await this._recordAsUnallocated(payload, recId, duration);
        return {
          status: 'unallocated',
          recordId: recId,
          reason: 'no_matching_study_task'
        };
      }

      // 记录任务消费绑定（防止同一段专注时长被后续其他任务冒领）
      allocations[recId] = {
        taskId: targetTask.id,
        taskTitle: targetTask.title,
        durationMinutes: duration,
        allocatedAt: Date.now()
      };
      await this.saveAllocations(allocations);

      // 推进任务 accumulatedMinutes
      targetTask.accumulatedMinutes = (targetTask.accumulatedMinutes || 0) + duration;
      var targetMins = targetTask.targetMinutes || 30;
      var justCompleted = false;
      if (targetTask.accumulatedMinutes >= targetMins && targetTask.status === 'pending') {
        targetTask.status = 'completed';
        targetTask.completedAt = Date.now();
        justCompleted = true;
      }

      await global.LifeGameCore.saveTasks(tasks);

      // 若此前留存在待分配池，清除待分配状态
      await this._removeUnallocatedRecord(recId);

      await LinkRegistry.logSync('focusRecordAllocated', {
        recordId: recId,
        taskId: targetTask.id,
        duration: duration,
        accumulatedMinutes: targetTask.accumulatedMinutes,
        status: targetTask.status
      });

      return {
        status: 'allocated',
        taskId: targetTask.id,
        allocatedMinutes: duration,
        accumulatedMinutes: targetTask.accumulatedMinutes,
        completed: targetTask.status === 'completed',
        justCompleted: justCompleted,
        task: targetTask
      };
    },

    // 手动/显式将待分配记录指派给目标任务
    async allocateRecordToTask(recordId, taskId) {
      if (!recordId || !taskId) return { success: false, msg: '参数不全' };
      var unallocated = await this.getUnallocatedRecords();
      var rec = unallocated.find(function(r) { return r.recordId === recordId; });
      if (!rec) return { success: false, msg: '未在待分配池中找到该专注记录' };

      var allocRes = await this.allocateFocusRecord({
        recordId: rec.recordId,
        durationMinutes: rec.durationMinutes,
        taskName: rec.taskName,
        taskId: taskId
      });

      return {
        success: allocRes.status === 'allocated',
        result: allocRes
      };
    },

    // 全域专注结束统一接收入口
    // 关键架构：基础经验核销 (life_game_records_settled_v1) 与 任务进度分配 (life_game_focus_allocations_v1) 独立判定！
    async handleFocusSessionCompleted(payload) {
      if (!payload || !payload.durationMinutes) return;
      var duration = Number(payload.durationMinutes) || 0;
      if (duration <= 0) return;

      var recId = payload.recordId || ('focus_' + (payload.timestamp || Date.now()) + '_' + duration);
      var lockKey = 'focus_progression_' + recId;
      if (!acquireLock(lockKey)) return;

      try {
        // ----------------------------------------------------
        // 步骤 1: 基础经验核销独立判定
        // ----------------------------------------------------
        var settledIds = global.LifeGameCore && typeof global.LifeGameCore.getSettledStudyRecordIds === 'function' ?
          await global.LifeGameCore.getSettledStudyRecordIds() : [];

        var isBaseSettled = settledIds.indexOf(recId) !== -1;
        if (!isBaseSettled) {
          var eventId = 'study_record_' + recId;
          var expReq = Math.round(duration * 1.2);
          var coinsReq = Math.round(duration * 0.5);

          var guard = global.WanwanSharedHub && global.WanwanSharedHub.RewardGuard ?
            await global.WanwanSharedHub.RewardGuard.validateAndGrant(eventId, expReq, coinsReq, duration) :
            { allowed: true, expGranted: expReq, coinsGranted: coinsReq };

          if (guard.allowed) {
            if (global.LifeGameService && guard.expGranted > 0) {
              await global.LifeGameService.addExpAndStats(
                guard.expGranted,
                { INT: Math.max(1, Math.round(duration / 25)), WIL: Math.max(1, Math.round(duration / 35)) },
                '自习室专注 ' + duration + ' 分钟',
                eventId,
                { alreadyValidated: true }
              );
            }
            if (global.SharedEconomyService && guard.coinsGranted > 0) {
              await global.SharedEconomyService.addCoins(guard.coinsGranted, '自习室专注结算收益', 'studyRoom');
            }
          }

          if (global.LifeGameCore && typeof global.LifeGameCore.addSettledStudyRecordId === 'function') {
            await global.LifeGameCore.addSettledStudyRecordId(recId);
          }
        }

        // ----------------------------------------------------
        // 步骤 2: 任务进度分配独立判定 (即使已核销基础经验，未分配进度的合法任务依然必须推进)
        // ----------------------------------------------------
        var allocResult = await this.allocateFocusRecord(payload);

        if (allocResult.status === 'allocated' && allocResult.justCompleted) {
          if (global.toast) {
            global.toast('🎯 现实委托「' + (allocResult.task ? allocResult.task.title : '学习任务') + '」已达成！前往人生游戏领取丰厚奖励！');
          }
        }

        var page = document.getElementById('life-game-page');
        if (page && global.LifeGameApp) {
          global.LifeGameApp.render();
        }

        return {
          baseRewardSettled: true,
          allocationResult: allocResult
        };
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
        var isClaimed = task.status === 'claimed';
        var charObj = task.charId ? charMap[String(task.charId)] : null;
        var charName = charObj ? (charObj.name || '') : (task.charName || '');
        var hasStartTime = !!(task.startTime && /^\d{2}:\d{2}$/.test(String(task.startTime)));
        var startTime = hasStartTime ? String(task.startTime) : '';
        var plannedDuration = Number(task.plannedDuration || task.targetMinutes || 0);
        var endTime = (task.endTime && /^\d{2}:\d{2}$/.test(String(task.endTime)))
          ? String(task.endTime)
          : (hasStartTime ? computeEndTimeFromStart(startTime, plannedDuration || 60) : '');

        events.push({
          id: 'lg_task_' + task.id,
          title: '人生委托 · ' + (task.title || '现实委托'),
          date: taskDate,
          isAllDay: !hasStartTime,
          startTime: startTime,
          endTime: endTime,
          category: task.category === 'study' ? 'study' : 'other',
          relationType: task.charId ? 'specificChar' : 'personal',
          charId: task.charId || null,
          charName: charName,
          priority: task.priority || 'normal',
          difficulty: task.difficulty || 'mid',
          plannedDuration: plannedDuration,
          rewardExp: Number(task.rewardExp || 35),
          rewardCoins: Number(task.rewardCoins || 0),
          status: task.status || 'pending',
          readOnly: isClaimed,
          sourceRevision: task.updatedAt || task.createdAt || 1,
          notes: (task.desc || '') + ' [难度: ' + (task.difficulty || 'mid') + ' | 奖励: +' + (task.rewardExp || 35) + 'EXP' + (task.rewardCoins ? ' +' + task.rewardCoins + '金币' : '') + ']',
          showInCountdown: false,
          completed: isDone,
          isPinned: false,
          createdAt: task.createdAt || Date.now(),
          updatedAt: task.updatedAt || Date.now(),
          source: {
            app: 'life-game',
            type: 'task',
            taskId: task.id,
            charId: task.charId || null,
            readOnly: isClaimed
          }
        });
      });

      return events;
    },

    // 5.2 日历中修改委托任务（标题、排期日期、起止时间、说明）时回写权威源 (LifeGameCore)
    async saveTaskFromCalendar(item) {
      if (!item || !item.source || item.source.app !== 'life-game' || !global.LifeGameCore) {
        return { success: false, changed: false, error: 'invalid_source', message: '无效的人生游戏任务来源' };
      }
      var taskId = item.source.taskId;
      var lockKey = 'tc_task_edit_' + taskId;
      if (!acquireLock(lockKey)) {
        return { success: false, changed: false, error: 'locked', message: '同步操作正在进行，请稍后再试' };
      }

      try {
        var tasks = await global.LifeGameCore.getTasks();
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) {
          return { success: false, changed: false, error: 'not_found', message: '人生游戏原委托不存在或已删除' };
        }

        if (task.status === 'claimed') {
          return {
            success: false,
            changed: false,
            error: 'already_claimed',
            message: '已领奖入账的任务不可通过日历改期或修改'
          };
        }

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

        if (item.startTime !== undefined) {
          var nextStart = item.isAllDay ? '' : (item.startTime || '');
          if (nextStart !== (task.startTime || '')) {
            task.startTime = nextStart;
            changed = true;
          }
        }

        if (item.endTime !== undefined) {
          var nextEnd = item.isAllDay ? '' : (item.endTime || '');
          if (nextEnd !== (task.endTime || '')) {
            task.endTime = nextEnd;
            changed = true;
          }
        }

        if (item.notes !== undefined) {
          // 清除附带的 [难度: ... | 奖励: ...] 后缀避免重复嵌套
          var cleanDesc = String(item.notes).replace(/\s*\[难度:[^\]]+\]\s*$/, '').trim();
          if (cleanDesc !== (task.desc || '')) {
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

          await LinkRegistry.logSync('saveTaskFromCalendar', {
            taskId: task.id,
            title: task.title,
            date: task.dueDate,
            startTime: task.startTime || '',
            endTime: task.endTime || ''
          });

          var page = document.getElementById('life-game-page');
          if (page && global.LifeGameApp) {
            global.LifeGameApp.render();
          }
        }

        return { success: true, changed: changed, task: task };
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

    // 5.4 显式将任务排期到日历 (支持成功/部分成功/失败多态报告与断点重试)
    async scheduleTaskToCalendar(task, date, options) {
      options = options || {};
      if (!task || !task.id) {
        return {
          status: 'failed',
          success: false,
          partial: false,
          stepResults: { task: { success: false, error: 'task_missing' } },
          error: 'task_missing'
        };
      }
      var lockKey = 'tc_schedule_' + task.id;
      if (!acquireLock(lockKey)) {
        return {
          status: 'failed',
          success: false,
          partial: false,
          stepResults: { task: { success: true, taskId: task.id }, lock: { acquired: false } },
          error: 'locked'
        };
      }

      var stepResults = {
        calendarScheduled: { success: false, date: date },
        linkRegistry: { success: false }
      };

      try {
        task.dueDate = date;
        if (global.LifeGameCore && options.saveTaskDirectly) {
          var allTasks = await global.LifeGameCore.getTasks();
          var curT = allTasks.find(function(t) { return t.id === task.id; });
          if (curT) {
            curT.dueDate = date;
            await global.LifeGameCore.saveTasks(allTasks);
          }
        }
        stepResults.calendarScheduled = { success: true, date: date, eventId: 'lg_task_' + task.id };

        // 故障注入测试点：排期成功，链接注册表保存失败 (部分成功状态)
        if (options._injectLinkRegistryFailure) {
          stepResults.linkRegistry.error = 'injected_link_registry_failure';
          return {
            status: 'partial',
            success: false,
            partial: true,
            stepResults: stepResults,
            error: 'link_registry_save_failed'
          };
        }

        var linkRecord = await LinkRegistry.createOrUpdateLink({
          sourceApp: 'life-game',
          sourceType: 'task',
          sourceId: task.id,
          targetApp: 'time-calendar',
          targetType: 'calendar-event',
          targetId: 'lg_task_' + task.id,
          charId: task.charId || null
        });
        stepResults.linkRegistry = { success: true, linkId: linkRecord.linkId };

        await LinkRegistry.logSync('scheduleTaskToCalendar', { taskId: task.id, date: date });

        return {
          status: 'success',
          success: true,
          partial: false,
          stepResults: stepResults
        };
      } catch (e) {
        return {
          status: 'failed',
          success: false,
          partial: false,
          stepResults: stepResults,
          error: e.message || String(e)
        };
      } finally {
        releaseLock(lockKey);
      }
    },

    // 5.5 从日历中移除排期 (解除日期，不删除人生游戏任务实体)
    async unlinkTaskFromCalendar(taskId) {
      if (!taskId || !global.LifeGameCore) return false;
      var tasks = await global.LifeGameCore.getTasks();
      var task = tasks.find(function(t) { return t.id === taskId; });
      if (!task) return false;

      task.dueDate = '';
      await global.LifeGameCore.saveTasks(tasks);

      var existingLink = await LinkRegistry.findLink('life-game', taskId, 'time-calendar');
      if (existingLink) {
        await LinkRegistry.removeLink(existingLink.linkId);
      }

      await LinkRegistry.logSync('unlinkTaskFromCalendar', { taskId: taskId });
      return true;
    }
  };

  // ==========================================
  // 6. 三个 App 之间安全跳转与深度链接 (CrossAppNav)
  // ==========================================
  var CrossAppNav = {
    // 6.1 跳转至陪伴自习室 (记录返回上下文并保留计时器状态)
    async navigateToStudyRoom(options) {
      options = options || {};
      var targetTab = options.tab || 'duo';
      var fromApp = options.fromApp || (document.getElementById('life-game-page') ? 'life-game' : '');
      if (fromApp && fromApp !== 'study-room' && global.TimeCalendarIntegrations && typeof global.TimeCalendarIntegrations.pushReturnContext === 'function') {
        var ctx = options.returnContext || global.TimeCalendarIntegrations.captureCurrentPageContext(fromApp);
        if (ctx) global.TimeCalendarIntegrations.pushReturnContext(ctx);
      }
      if (global.showStudyRoomPage) {
        await global.showStudyRoomPage({
          tab: targetTab,
          targetTodoId: options.targetTodoId || null,
          targetExamId: options.targetExamId || null,
          preserveTimer: true,
          fromApp: fromApp
        });
        if (global.toast) global.toast('已跳转至陪伴自习室');
      } else {
        alert('陪伴自习室模块未就绪');
      }
    },

    // 6.2 跳转至时光日历 (记录返回上下文并定位目标日程)
    async navigateToTimeCalendar(options) {
      options = options || {};
      var fromApp = options.fromApp || (document.getElementById('life-game-page') ? 'life-game' : '');
      if (fromApp && fromApp !== 'time-calendar' && global.TimeCalendarIntegrations && typeof global.TimeCalendarIntegrations.pushReturnContext === 'function') {
        var ctx = options.returnContext || global.TimeCalendarIntegrations.captureCurrentPageContext(fromApp);
        if (ctx) global.TimeCalendarIntegrations.pushReturnContext(ctx);
      }
      if (global.showTimeCalendarPage) {
        await global.showTimeCalendarPage({
          tab: options.tab || 'schedule',
          date: options.date || null,
          eventId: options.eventId || null,
          fromApp: fromApp
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
          targetGoalId: options.targetGoalId || null,
          fromApp: options.fromApp || '',
          returnContext: options.returnContext || null
        });
        if (global.toast) global.toast('已跳转至人生游戏');
      } else {
        alert('人生游戏模块未就绪');
      }
    }
  };

  // ==========================================
  // 7. 异常自愈与补偿机制 (Self-Healing & Reconcile 加固版)
  // 覆盖：部分成功恢复、孤儿引用优雅剥离、稳定 ID 重新对齐、防二次重复创建
  // ==========================================
  async function reconcileLinks() {
    var report = {
      status: 'success',
      checkedTasks: 0,
      checkedGoals: 0,
      repairedLinks: 0,
      orphanedDetached: 0,
      recoveredPartials: 0
    };
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

      // 1. 校验任务的自习待办链接真实性与部分成功自愈
      var tasksModified = false;
      for (var i = 0; i < tasks.length; i++) {
        var t = tasks[i];

        // 场景 A: 任务有 studyTodoId
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
            if (todo.done && t.status === 'pending') {
              t.status = 'completed';
              t.completedAt = Date.now();
              tasksModified = true;
              report.repairedLinks++;
            }

            // 检查 LinkRegistry 是否缺失（部分成功恢复）
            var activeLink = await LinkRegistry.findLink('life-game', t.id, 'study-room');
            if (!activeLink) {
              await LinkRegistry.createOrUpdateLink({
                sourceApp: 'life-game',
                sourceType: 'task',
                sourceId: t.id,
                targetApp: 'study-room',
                targetType: 'todo',
                targetId: todo.id,
                charId: t.charId || null
              });
              report.recoveredPartials++;
            }
          }
        } else {
          // 场景 B: 任务自身没记 studyTodoId，但自习室中存在稳定 ID 的 todo (例如中途崩溃)
          var stableTodoId = 'sr_todo_lg_' + t.id;
          if (todoMap[stableTodoId]) {
            t.studyTodoId = stableTodoId;
            t.linkedSource = 'studyRoom';
            tasksModified = true;
            await LinkRegistry.createOrUpdateLink({
              sourceApp: 'life-game',
              sourceType: 'task',
              sourceId: t.id,
              targetApp: 'study-room',
              targetType: 'todo',
              targetId: stableTodoId,
              charId: t.charId || null
            });
            report.recoveredPartials++;
          }
        }

        // 场景 C: 任务有 dueDate，但 LinkRegistry 缺失日历日程关联
        if (t.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)) {
          var calLink = await LinkRegistry.findLink('life-game', t.id, 'time-calendar');
          if (!calLink) {
            await LinkRegistry.createOrUpdateLink({
              sourceApp: 'life-game',
              sourceType: 'task',
              sourceId: t.id,
              targetApp: 'time-calendar',
              targetType: 'calendar-event',
              targetId: 'lg_task_' + t.id,
              charId: t.charId || null
            });
            report.recoveredPartials++;
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
      report.status = 'partial';
      report.error = err.message || String(err);
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
    scheduleTaskToCalendar: CalendarScheduleIntegration.scheduleTaskToCalendar,
    unlinkTaskFromCalendar: CalendarScheduleIntegration.unlinkTaskFromCalendar,

    allocateFocusRecord: StudyFocusSessionIntegration.allocateFocusRecord.bind(StudyFocusSessionIntegration),
    allocateRecordToTask: StudyFocusSessionIntegration.allocateRecordToTask.bind(StudyFocusSessionIntegration),
    getUnallocatedRecords: StudyFocusSessionIntegration.getUnallocatedRecords.bind(StudyFocusSessionIntegration),

    navigateToStudyRoom: CrossAppNav.navigateToStudyRoom,
    navigateToTimeCalendar: CrossAppNav.navigateToTimeCalendar,
    navigateToLifeGame: CrossAppNav.navigateToLifeGame,

    reconcileLinks: reconcileLinks
  };

})(typeof window !== 'undefined' ? window : this);
