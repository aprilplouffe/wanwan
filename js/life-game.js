// life-game.js — 弯弯小手机｜人生游戏 (Life Game) 阶段 1
// 与「陪伴自习室」视觉语言 100% 对齐 · 黑白灰极简质感 · 严格保留所有已终验的业务与安全逻辑

(function(global) {
  'use strict';

  // ===== 1. 持久化存储键 =====
  var STORAGE_TASKS = 'life_game_tasks_v1';
  var STORAGE_GOALS = 'life_game_goals_v1';
  var STORAGE_HABITS = 'life_game_habits_v1';
  var STORAGE_SETTLED_STUDY = 'life_game_records_settled_v1';
  var STORAGE_TASKS_HISTORY = 'life_game_tasks_history_v1';
  var STORAGE_INIT_FLAG = 'life_game_initialized_v1';

  // ===== 2. 持久化与工具函数 =====
  async function loadStorage(key, fallback) {
    try {
      if (window.db && db.config) {
        var row = await db.config.get(key);
        if (row && row.value !== undefined) return row.value;
      }
    } catch (e) {
      console.warn('[LifeGame] Dexie get error for key:', key, e);
    }
    try {
      var item = localStorage.getItem(key);
      if (item !== null && item !== undefined) return JSON.parse(item);
    } catch (_) {}
    return fallback;
  }

  async function saveStorage(key, value) {
    try {
      if (window.db && db.config) {
        await db.config.put({ key: key, value: value });
      }
    } catch (e) {
      console.warn('[LifeGame] Dexie put error for key:', key, e);
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function uid(prefix) {
    return (prefix || 'lg') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function getTodayStr() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function getYesterdayStr() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function formatTimeShort(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return m + '-' + day + ' ' + h + ':' + min;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 并发请求防重入锁字典
  var _inFlightClaimLocks = {};

  // ===== 3. 默认初始预设数据 =====
  function getDefaultTasks() {
    return [
      {
        id: 'task_default_1',
        title: '陪伴自习室专注 30 分钟',
        desc: '在自习室与伴侣开启一次沉浸式学习，攻坚重点考点',
        category: 'study', // main | daily | side | study
        difficulty: 'mid', // easy(+25) | mid(+45) | hard(+80)
        targetMinutes: 30,
        accumulatedMinutes: 0,
        rewardExp: 45,
        rewardCoins: 25,
        statBonus: { INT: 2, WIL: 1 },
        status: 'pending', // pending | completed | claimed
        dueDate: getTodayStr(),
        linkedSource: 'studyRoom',
        createdAt: Date.now() - 3600000
      },
      {
        id: 'task_default_2',
        title: '每日计划整理与复盘',
        desc: '在时光日历规划明日待办，并清空桌面琐碎杂务',
        category: 'daily',
        difficulty: 'easy',
        rewardExp: 25,
        rewardCoins: 15,
        statBonus: { PER: 2 },
        status: 'pending',
        dueDate: getTodayStr(),
        linkedSource: 'calendar',
        createdAt: Date.now() - 7200000
      },
      {
        id: 'task_default_3',
        title: '探访城市独立书店或艺术展',
        desc: '走出室内，漫步街巷寻找灵感与生活之美',
        category: 'side',
        difficulty: 'mid',
        rewardExp: 45,
        rewardCoins: 25,
        statBonus: { INS: 2, CHA: 1 },
        status: 'pending',
        dueDate: '',
        linkedSource: 'user',
        createdAt: Date.now() - 86400000
      },
      {
        id: 'task_default_4',
        title: '完成现实体能慢跑 2 公里',
        desc: '挥洒汗水，激活机体活力与意志韧性',
        category: 'daily',
        difficulty: 'mid',
        rewardExp: 40,
        rewardCoins: 20,
        statBonus: { PHY: 3, WIL: 1 },
        status: 'pending',
        dueDate: getTodayStr(),
        linkedSource: 'user',
        createdAt: Date.now() - 14400000
      }
    ];
  }

  function getDefaultGoals() {
    return [
      {
        id: 'goal_default_1',
        title: '自律生活跃迁与专注习惯养成',
        desc: '以 30 天为周期，构建稳定强大的行动力护城河与心流状态',
        targetDate: (function() {
          var d = new Date();
          d.setDate(d.getDate() + 30);
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        })(),
        status: 'active',
        milestones: [
          { id: 'ms_1', title: '自习室累计专注突破 10 小时', done: false, expReward: 100 },
          { id: 'ms_2', title: '连续早起打卡满 7 天', done: false, expReward: 80 },
          { id: 'ms_3', title: '完成一本深度专著的研读与笔记', done: false, expReward: 120 }
        ],
        createdAt: Date.now() - 86400000 * 3
      },
      {
        id: 'goal_default_2',
        title: '全栈独立创作与作品集突破',
        desc: '从构思到上线，打磨属于自己的精致应用',
        targetDate: (function() {
          var d = new Date();
          d.setDate(d.getDate() + 60);
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        })(),
        status: 'active',
        milestones: [
          { id: 'ms_4', title: '设计核心数据模型与流程架构', done: true, expReward: 90 },
          { id: 'ms_5', title: '完成核心交互与移动端适配', done: false, expReward: 110 },
          { id: 'ms_6', title: '邀请伴侣深度体验与联调反馈', done: false, expReward: 150 }
        ],
        createdAt: Date.now() - 86400000 * 5
      }
    ];
  }

  function getDefaultHabits() {
    return [
      {
        id: 'habit_1',
        name: '晨间温水与全身拉伸',
        icon: 'fa-solid fa-mug-hot',
        streak: 3,
        bestStreak: 7,
        lastCheckinDate: '',
        expReward: 20,
        statBonus: { PHY: 1 },
        checkinHistory: []
      },
      {
        id: 'habit_2',
        name: '陪伴自习室沉浸专注 30m',
        icon: 'fa-solid fa-hourglass-half',
        streak: 4,
        bestStreak: 12,
        lastCheckinDate: '',
        expReward: 35,
        statBonus: { INT: 1, WIL: 1 },
        checkinHistory: []
      },
      {
        id: 'habit_3',
        name: '睡前深呼吸与感恩复盘',
        icon: 'fa-solid fa-feather',
        streak: 2,
        bestStreak: 5,
        lastCheckinDate: '',
        expReward: 20,
        statBonus: { INS: 1 },
        checkinHistory: []
      },
      {
        id: 'habit_4',
        name: '向心仪角色发送问候',
        icon: 'fa-regular fa-heart',
        streak: 5,
        bestStreak: 15,
        lastCheckinDate: '',
        expReward: 25,
        statBonus: { CHA: 1 },
        checkinHistory: []
      }
    ];
  }

  // ===== 4. 人生游戏状态中枢 (LifeGameCore) =====
  var LifeGameCore = {
    // 首次启动及备份恢复防重基线检查
    async ensureBaselineInitialized() {
      var isInit = await loadStorage(STORAGE_INIT_FLAG, false);
      if (!isInit) {
        var srRecords = await loadStorage('wanwan_study_records', []);
        var existingSettled = await loadStorage(STORAGE_SETTLED_STUDY, []);
        if (Array.isArray(srRecords) && srRecords.length > 0) {
          srRecords.forEach(function(r) {
            var rId = r.id || ('sr_rec_' + (r.timestamp || r.date));
            if (existingSettled.indexOf(rId) === -1) {
              existingSettled.push(rId);
            }
          });
          await saveStorage(STORAGE_SETTLED_STUDY, existingSettled);
        }
        await saveStorage(STORAGE_INIT_FLAG, true);
      }
    },

    async getTasks() {
      await this.ensureBaselineInitialized();
      var tasks = await loadStorage(STORAGE_TASKS, null);
      if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
        tasks = getDefaultTasks();
        await saveStorage(STORAGE_TASKS, tasks);
      }
      return tasks;
    },

    async saveTasks(tasks) {
      await saveStorage(STORAGE_TASKS, tasks);
      if (window.WanwanSharedHub) {
        window.WanwanSharedHub.emit('LIFEGAME_TASKS_CHANGED', { tasks: tasks });
      }
    },

    async getGoals() {
      var goals = await loadStorage(STORAGE_GOALS, null);
      if (!goals || !Array.isArray(goals) || goals.length === 0) {
        goals = getDefaultGoals();
        await saveStorage(STORAGE_GOALS, goals);
      }
      return goals;
    },

    async saveGoals(goals) {
      await saveStorage(STORAGE_GOALS, goals);
      if (window.WanwanSharedHub) {
        window.WanwanSharedHub.emit('LIFEGAME_GOALS_CHANGED', { goals: goals });
      }
    },

    async getHabits() {
      var habits = await loadStorage(STORAGE_HABITS, null);
      if (!habits || !Array.isArray(habits) || habits.length === 0) {
        habits = getDefaultHabits();
        await saveStorage(STORAGE_HABITS, habits);
      }
      return habits;
    },

    async saveHabits(habits) {
      await saveStorage(STORAGE_HABITS, habits);
      if (window.WanwanSharedHub) {
        window.WanwanSharedHub.emit('LIFEGAME_HABITS_CHANGED', { habits: habits });
      }
    },

    async getSettledStudyRecordIds() {
      return await loadStorage(STORAGE_SETTLED_STUDY, []);
    },

    async addSettledStudyRecordId(id) {
      if (!id) return;
      var list = await this.getSettledStudyRecordIds();
      if (list.indexOf(id) === -1) {
        list.push(id);
        await saveStorage(STORAGE_SETTLED_STUDY, list);
      }
    },

    // 记录任务历史完成审计流水
    async recordTaskHistory(task) {
      try {
        var history = await loadStorage(STORAGE_TASKS_HISTORY, []);
        history.unshift({
          id: uid('hist'),
          taskId: task.id,
          title: task.title,
          category: task.category,
          expGranted: task.rewardExp,
          coinsGranted: task.rewardCoins,
          completedAt: task.completedAt || Date.now(),
          claimedAt: Date.now()
        });
        if (history.length > 100) history = history.slice(0, 100);
        await saveStorage(STORAGE_TASKS_HISTORY, history);
      } catch (e) {
        console.warn('[LifeGame] Failed to record task history:', e);
      }
    },

    async getTasksHistory() {
      return await loadStorage(STORAGE_TASKS_HISTORY, []);
    },

    // 领取任务奖励 (严格防刷、原子锁、状态机防篡改与单一经济账户)
    async claimTaskReward(taskId) {
      if (_inFlightClaimLocks[taskId]) {
        return { success: false, msg: '正在结算中，请勿频繁点击' };
      }
      _inFlightClaimLocks[taskId] = true;

      try {
        var tasks = await this.getTasks();
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) return { success: false, msg: '任务不存在' };

        // 状态机严格检验
        if (task.status === 'claimed') {
          return { success: false, msg: '该任务奖励已领取，不可重复入账' };
        }
        if (task.status !== 'completed') {
          return { success: false, msg: '任务尚未标记完成，无法领奖' };
        }

        var eventId = 'task_claim_' + task.id;

        // 1. 防刷检查与幂等去重
        var guard = window.WanwanSharedHub && window.WanwanSharedHub.RewardGuard ?
          await window.WanwanSharedHub.RewardGuard.validateAndGrant(eventId, task.rewardExp, task.rewardCoins, 0) :
          { allowed: true, expGranted: task.rewardExp, coinsGranted: task.rewardCoins };

        if (!guard.allowed) {
          return { success: false, msg: guard.msg || '该任务奖励已领取或达到今日上限' };
        }

        // 更新状态为 claimed
        task.status = 'claimed';
        task.claimedAt = Date.now();
        await this.saveTasks(tasks);

        // 2. 发放金币至单一权威来源 (SharedEconomyService)
        if (guard.coinsGranted > 0 && window.SharedEconomyService) {
          try {
            await window.SharedEconomyService.addCoins(guard.coinsGranted, '完成委托：' + task.title, 'lifeGame');
          } catch (ecoErr) {
            console.error('[LifeGame] SharedEconomyService error:', ecoErr);
          }
        }

        // 3. 结算经验与属性至单一来源 (LifeGameService)
        var expResult = null;
        if (window.LifeGameService) {
          expResult = await window.LifeGameService.addExpAndStats(
            guard.expGranted,
            task.statBonus,
            '完成现实委托：' + task.title,
            eventId,
            { alreadyValidated: true }
          );
        }

        // 4. 留存历史审计记录
        await this.recordTaskHistory(task);

        // 5. 阶段 4 深度联动：属性轨迹、冒险手账、纪念卡与伴侣祝贺
        if (window.LifeGameCompanion) {
          try {
            await window.LifeGameCompanion.onTaskClaimed(task, expResult);
          } catch (compErr) {
            console.warn('[LifeGame] LifeGameCompanion.onTaskClaimed error:', compErr);
          }
        }

        // 6. 成就馆 1.0 Phase 2：标准来源事件联动
        if (window.WanwanSharedHub && typeof window.WanwanSharedHub.emit === 'function') {
          try {
            await window.WanwanSharedHub.emit('ACHIEVEMENT_SOURCE_EVENT', {
              eventId: 'lg_task_claim_' + task.id,
              eventType: 'task_claimed',
              sourceApp: 'life-game',
              sourceRecordId: task.id,
              occurrenceKey: task.id,
              occurredAt: task.claimedAt || Date.now(),
              payload: { category: task.category || 'daily' }
            });
          } catch (_) {}
        }

        return {
          success: true,
          expGranted: guard.expGranted,
          coinsGranted: guard.coinsGranted,
          leveledUp: expResult ? expResult.leveledUp : false,
          newLevel: expResult ? expResult.level : 1,
          task: task
        };
      } catch (err) {
        console.error('[LifeGame] claimTaskReward exception:', err);
        return { success: false, msg: '奖励结算发生异常，请重试' };
      } finally {
        delete _inFlightClaimLocks[taskId];
      }
    },

    // 习惯打卡结算 (幂等防刷、跨天跨月严谨校验)
    async checkinHabit(habitId) {
      var lockKey = 'habit_lock_' + habitId;
      if (_inFlightClaimLocks[lockKey]) {
        return { success: false, msg: '正在打卡中...' };
      }
      _inFlightClaimLocks[lockKey] = true;

      try {
        var habits = await this.getHabits();
        var habit = habits.find(function(h) { return h.id === habitId; });
        if (!habit) return { success: false, msg: '习惯不存在' };

        var today = getTodayStr();

        // 1. 同一天重复打卡校验
        if (habit.lastCheckinDate === today || (habit.checkinHistory && habit.checkinHistory.indexOf(today) !== -1)) {
          return { success: false, msg: '今日已经打过卡啦，明天继续保持哦！' };
        }

        // 1.1 时钟回拨 / 设备时间倒退防刷检测
        if (habit.lastCheckinDate && today < habit.lastCheckinDate) {
          return { success: false, msg: '系统检测到设备时间异常，打卡被拦截' };
        }

        // 2. 连续打卡计算 (利用 Date 对象标准滚算)
        var yesterday = getYesterdayStr();
        if (habit.lastCheckinDate === yesterday) {
          habit.streak = (habit.streak || 0) + 1;
        } else {
          habit.streak = 1;
        }
        habit.bestStreak = Math.max(habit.bestStreak || 0, habit.streak);
        habit.lastCheckinDate = today;

        if (!habit.checkinHistory) habit.checkinHistory = [];
        if (habit.checkinHistory.indexOf(today) === -1) {
          habit.checkinHistory.push(today);
        }

        var eventId = 'habit_' + habit.id + '_' + today;
        var rewardExp = habit.expReward || 20;
        var rewardCoins = 10;

        // 3. 防刷验证
        var guard = window.WanwanSharedHub && window.WanwanSharedHub.RewardGuard ?
          await window.WanwanSharedHub.RewardGuard.validateAndGrant(eventId, rewardExp, rewardCoins, 0) :
          { allowed: true, expGranted: rewardExp, coinsGranted: rewardCoins };

        if (!guard.allowed) {
          return { success: false, msg: guard.msg || '今日该习惯奖励已达上限' };
        }

        await this.saveHabits(habits);

        if (guard.coinsGranted > 0 && window.SharedEconomyService) {
          try {
            await window.SharedEconomyService.addCoins(guard.coinsGranted, '习惯打卡：' + habit.name, 'lifeGame');
          } catch (_) {}
        }

        var expResult = null;
        if (window.LifeGameService) {
          expResult = await window.LifeGameService.addExpAndStats(
            guard.expGranted,
            habit.statBonus,
            '日常习惯打卡：' + habit.name,
            eventId,
            { alreadyValidated: true }
          );
        }

        // 阶段 4 深度联动：属性轨迹与冒险手账记账
        if (window.LifeGameCompanion) {
          try {
            if (habit.statBonus) {
              await window.LifeGameCompanion.PlayerProfile.recordStatGain(
                habit.statBonus,
                '习惯打卡：' + habit.name,
                'habit',
                'habit_stat_' + eventId
              );
            }
            await window.LifeGameCompanion.Journal.recordEvent({
              type: 'habit',
              category: 'habit',
              eventId: 'jnl_' + eventId,
              title: '习惯打卡：' + habit.name,
              desc: '坚持连续打卡 ' + habit.streak + ' 天',
              meta: { streak: habit.streak, exp: guard.expGranted },
              tags: ['日常习惯', habit.streak >= 7 ? '连胜突破' : '每日打卡']
            });
            if (expResult && expResult.leveledUp) {
              await window.LifeGameCompanion.onLevelUp(expResult.newLevel);
            }
            await window.LifeGameCompanion.Achievements.checkAutoUnlocks({ type: 'habit_checkin', habit: habit });
          } catch (compErr) {
            console.warn('[LifeGame] LifeGameCompanion habit hook error:', compErr);
          }
        }

        if (window.WanwanSharedHub && typeof window.WanwanSharedHub.emit === 'function') {
          try {
            await window.WanwanSharedHub.emit('ACHIEVEMENT_SOURCE_EVENT', {
              eventId: 'lg_habit_' + habit.id + '_' + today,
              eventType: 'habit_checkin',
              sourceApp: 'life-game',
              sourceRecordId: habit.id,
              occurrenceKey: habit.id + '#' + today,
              occurredAt: Date.now(),
              payload: { streak: habit.streak }
            });
          } catch (_) {}
        }

        return {
          success: true,
          streak: habit.streak,
          expGranted: guard.expGranted,
          coinsGranted: guard.coinsGranted,
          leveledUp: expResult ? expResult.leveledUp : false,
          newLevel: expResult ? expResult.level : 1,
          habit: habit
        };
      } catch (err) {
        console.error('[LifeGame] checkinHabit exception:', err);
        return { success: false, msg: '打卡异常，请重试' };
      } finally {
        delete _inFlightClaimLocks[lockKey];
      }
    },

    // 自习室专注记录安全联动同步 (只读自习室数据，逐条幂等核销)
    async syncStudyRecords() {
      var lockKey = 'study_sync_lock';
      if (_inFlightClaimLocks[lockKey]) {
        return { syncedCount: 0, totalMinutes: 0, expGranted: 0, msg: '同步进行中，请稍候...' };
      }
      _inFlightClaimLocks[lockKey] = true;

      try {
        var srRecords = await loadStorage('wanwan_study_records', []);
        if (!Array.isArray(srRecords) || srRecords.length === 0) {
          return { syncedCount: 0, totalMinutes: 0, expGranted: 0, msg: '自习室暂无专注记录' };
        }

        var settledList = await this.getSettledStudyRecordIds();
        var newlySettledMinutes = 0;
        var newlySettledCount = 0;
        var totalExpGranted = 0;
        var totalCoinsGranted = 0;
        var allocatedTasksCount = 0;

        for (var i = 0; i < srRecords.length; i++) {
          var rec = srRecords[i];
          var recId = rec.id || ('sr_rec_' + (rec.timestamp || rec.date || i));
          var duration = Number(rec.durationMinutes) || 0;
          if (duration <= 0) continue;

          // ----------------------------------------------------
          // 步骤 1: 独立判定基础经验核销 (life_game_records_settled_v1)
          // ----------------------------------------------------
          if (settledList.indexOf(recId) === -1) {
            var eventId = 'study_record_' + recId;
            var expReq = Math.round(duration * 1.2);
            var coinsReq = Math.round(duration * 0.5);

            var guard = window.WanwanSharedHub && window.WanwanSharedHub.RewardGuard ?
              await window.WanwanSharedHub.RewardGuard.validateAndGrant(eventId, expReq, coinsReq, duration) :
              { allowed: true, expGranted: expReq, coinsGranted: coinsReq };

            if (guard.allowed) {
              totalExpGranted += guard.expGranted;
              totalCoinsGranted += guard.coinsGranted;
              newlySettledMinutes += duration;
              newlySettledCount++;

              if (window.LifeGameService && guard.expGranted > 0) {
                await window.LifeGameService.addExpAndStats(
                  guard.expGranted,
                  { INT: Math.max(1, Math.round(duration / 25)), WIL: Math.max(1, Math.round(duration / 35)) },
                  '自习室专注 ' + duration + ' 分钟',
                  eventId,
                  { alreadyValidated: true }
                );
              }

              if (window.SharedEconomyService && guard.coinsGranted > 0) {
                await window.SharedEconomyService.addCoins(guard.coinsGranted, '自习室专注结算收益', 'studyRoom');
              }
            }

            await this.addSettledStudyRecordId(recId);
            settledList.push(recId);
          }

          // ----------------------------------------------------
          // 步骤 2: 独立判定学习任务进度分配 (安全分配引擎，严禁乱塞给最新任务)
          // ----------------------------------------------------
          if (window.LifeGameIntegrations && window.LifeGameIntegrations.focusSession) {
            var allocRes = await window.LifeGameIntegrations.focusSession.allocateFocusRecord({
              recordId: recId,
              durationMinutes: duration,
              taskName: rec.name || rec.taskName || '',
              todoId: rec.todoId || null,
              taskId: rec.taskId || null,
              charId: rec.companionCharId || rec.charId || null
            });
            if (allocRes && allocRes.status === 'allocated') {
              allocatedTasksCount++;
            }
          }
        }

        if (newlySettledCount === 0 && allocatedTasksCount === 0) {
          return { syncedCount: 0, totalMinutes: 0, expGranted: 0, msg: '所有专注记录已完成核销与分配，无需重复处理' };
        }

        return {
          syncedCount: newlySettledCount,
          totalMinutes: newlySettledMinutes,
          expGranted: totalExpGranted,
          coinsGranted: totalCoinsGranted,
          allocatedTasksCount: allocatedTasksCount,
          msg: newlySettledCount > 0 ?
            ('成功结算 ' + newlySettledCount + ' 条专注流水（+' + totalExpGranted + ' EXP），推进了 ' + allocatedTasksCount + ' 项关联委托！') :
            ('已将专注进度对齐至 ' + allocatedTasksCount + ' 项关联委托！')
        };
      } finally {
        delete _inFlightClaimLocks[lockKey];
      }
    }
  };

  // ===== 5. UI 渲染与交互架构 (LifeGameApp) =====
  var _activeTab = 'profile'; // profile | tasks | habits | goals | achievements | history
  var _taskFilter = 'all';    // all | pending | completed | study
  var _achFilter = 'all';     // all | origin | study | habit | main | growth | special
  var _journalFilter = 'all'; // all | quest | level_up | milestone | habit | note | memento_card

  var _lgIsClosing = false;
  var _lgCloseShieldTimer = 0;
  var LG_CLOSE_SHIELD_ID = 'lg-close-shield';

  function clearLgCloseShield() {
    if (_lgCloseShieldTimer) {
      clearTimeout(_lgCloseShieldTimer);
      _lgCloseShieldTimer = 0;
    }
    var oldShield = document.getElementById(LG_CLOSE_SHIELD_ID);
    if (oldShield) oldShield.remove();
  }

  function mountLgCloseShield() {
    clearLgCloseShield();
    var host = document.getElementById('app') || document.body;
    if (!host) return;
    var shield = document.createElement('div');
    shield.id = LG_CLOSE_SHIELD_ID;
    shield.className = 'lg-close-shield';
    shield.setAttribute('aria-hidden', 'true');
    shield.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }, true);
    host.appendChild(shield);
    _lgCloseShieldTimer = setTimeout(clearLgCloseShield, 360);
  }

  var LifeGameApp = {
    async open(options) {
      clearLgCloseShield();
      _lgIsClosing = false;
      var existing = document.getElementById('life-game-page');
      if (existing) existing.remove();

      if (options && options.tab) {
        _activeTab = options.tab;
      }

      var page = document.createElement('div');
      page.id = 'life-game-page';
      page.className = 'full-page';

      if (global.openPage) {
        global.openPage(page);
      } else {
        (document.getElementById('app') || document.body).appendChild(page);
      }
      await this.render();

      if (options && (options.targetTaskId || options.targetGoalId)) {
        setTimeout(function() {
          var targetId = options.targetTaskId || options.targetGoalId;
          var el = page.querySelector('[data-id="' + targetId + '"]');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.outline = '2px solid var(--c-text)';
            el.style.borderRadius = 'var(--r-md)';
            setTimeout(function() { el.style.outline = ''; }, 2500);
          }
        }, 350);
      }
    },

    getViewState() {
      return {
        activeTab: _activeTab,
        taskFilter: _taskFilter
      };
    },

    close() {
      var el = document.getElementById('life-game-page');
      if (_lgIsClosing || !el || el.classList.contains('is-closing')) return;
      _lgIsClosing = true;
      mountLgCloseShield();
      if (global.TimeCalendarIntegrations && typeof global.TimeCalendarIntegrations.clearReturnContext === 'function') {
        try { global.TimeCalendarIntegrations.clearReturnContext(); } catch (_) {}
      }
      if (global.closePage) {
        try { global.closePage('life-game-page'); } catch (_) {}
        setTimeout(function() { _lgIsClosing = false; }, 380);
        return;
      }
      clearLgCloseShield();
      el.remove();
      _lgIsClosing = false;
    },

    async render() {
      var page = document.getElementById('life-game-page');
      if (!page) return;

      var lifeState = window.LifeGameService ? await window.LifeGameService.getState() : { level: 1, exp: 0, title: '见习探索者', stats: {} };
      var economyState = window.SharedEconomyService ? await window.SharedEconomyService.getState() : { coins: 520 };
      var guardCtx = window.WanwanSharedHub && window.WanwanSharedHub.RewardGuard ?
        await window.WanwanSharedHub.RewardGuard.getTodayRecord() :
        { record: { expEarned: 0, coinsEarned: 0 } };
      var char = window.RoleWorldbookService ? await window.RoleWorldbookService.getActiveCharacter() : { name: '沈星回', avatar: 'img/char-default.jpg' };

      var reqExp = window.LifeGameService ? window.LifeGameService.getExpToNextLevel(lifeState.level) : 1000;
      var expPercent = Math.min(100, Math.round((lifeState.exp / reqExp) * 100));

      var retCtx = (global.TimeCalendarIntegrations && typeof global.TimeCalendarIntegrations.peekReturnContext === 'function')
        ? global.TimeCalendarIntegrations.peekReturnContext()
        : null;
      var hasCaller = !!(retCtx && retCtx.fromApp && retCtx.fromApp !== 'life-game');
      var backLabel = '';
      if (hasCaller) {
        if (retCtx.fromApp === 'time-calendar') backLabel = '返回日历';
        else if (retCtx.fromApp === 'study-room') backLabel = '返回自习室';
        else if (retCtx.fromApp === 'love-diary') backLabel = '返回恋爱记';
        else backLabel = '返回原应用';
      }

      var html =
        // 1. 顶部 Header (与自习室 .sr-header 一致)
        '<header class="lg-header">' +
          '<div class="lg-header-left">' +
            (hasCaller
              ? ('<button type="button" class="lg-back-btn" id="lg-btn-back">' +
                  '<i class="fa fa-angle-left"></i><span>' + backLabel + '</span>' +
                '</button>')
              : '') +
            '<button type="button" class="lg-title-home-btn" id="lg-title-home-btn" aria-label="人生游戏，点击返回桌面" title="点击返回桌面">' +
              '<span class="lg-icon-mini" aria-hidden="true"><i class="fa-solid fa-gamepad"></i></span>' +
              '<span class="lg-header-title">人生游戏</span>' +
            '</button>' +
          '</div>' +
          '<div class="lg-header-right">' +
            '<button type="button" class="lg-btn-icon-subtle" id="lg-btn-companion-settings" title="多 Char 深度陪伴与主动祝贺设置"><i class="fa-solid fa-user-shield"></i></button>' +
            '<div class="lg-coin-badge" title="全域心动金币余额">' +
              '<i class="fa-solid fa-coins"></i><span>' + (economyState.coins || 0) + '</span>' +
            '</div>' +
            '<div class="lg-level-badge">LV.' + lifeState.level + '</div>' +
          '</div>' +
        '</header>' +

        // 2. 防刷上限指示条
        '<div class="lg-guard-banner">' +
          '<div><i class="fa-solid fa-shield-halved"></i> 极简自律防护：</div>' +
          '<div>今日已获得 <strong>' + guardCtx.record.expEarned + ' / 600</strong> EXP · 金币 <strong>' + guardCtx.record.coinsEarned + ' / 300</strong></div>' +
        '</div>' +

        // 3. 横向胶囊导航栏 (与自习室 .sr-nav-tabs 一致)
        '<nav class="lg-nav-tabs">' +
          '<div class="lg-tab-item ' + (_activeTab === 'profile' ? 'active' : '') + '" data-tab="profile"><i class="fa-solid fa-id-card"></i> 角色档案</div>' +
          '<div class="lg-tab-item ' + (_activeTab === 'tasks' ? 'active' : '') + '" data-tab="tasks"><i class="fa-solid fa-scroll"></i> 现实委托</div>' +
          '<div class="lg-tab-item ' + (_activeTab === 'habits' ? 'active' : '') + '" data-tab="habits"><i class="fa-solid fa-fire"></i> 每日习惯</div>' +
          '<div class="lg-tab-item ' + (_activeTab === 'goals' ? 'active' : '') + '" data-tab="goals"><i class="fa-solid fa-bullseye"></i> 长期愿景</div>' +
          '<div class="lg-tab-item ' + (_activeTab === 'achievements' ? 'active' : '') + '" data-tab="achievements"><i class="fa-solid fa-trophy"></i> 荣誉勋章</div>' +
          '<div class="lg-tab-item ' + (_activeTab === 'history' ? 'active' : '') + '" data-tab="history"><i class="fa-solid fa-book-bookmark"></i> 冒险手账</div>' +
        '</nav>' +

        // 4. 内容主体滚动区域
        '<main class="lg-content" id="lg-tab-content">' +
          // 异步加载对应 Tab 内容
        '</main>';

      page.innerHTML = html;

      // 绑定点击标题「人生游戏」返回桌面
      var titleHomeBtn = page.querySelector('#lg-title-home-btn');
      if (titleHomeBtn) {
        titleHomeBtn.onclick = function() {
          LifeGameApp.close();
        };
      }

      // 跨应用来源返回按钮（仅跨应用跳转进入时存在）
      var backBtn = page.querySelector('#lg-btn-back');
      if (backBtn) {
        backBtn.onclick = async function() {
          if (global.TimeCalendarIntegrations && typeof global.TimeCalendarIntegrations.peekReturnContext === 'function') {
            var curRet = global.TimeCalendarIntegrations.peekReturnContext();
            if (curRet && curRet.fromApp && curRet.fromApp !== 'life-game') {
              var handled = await global.TimeCalendarIntegrations.returnToCaller('life-game');
              if (handled) return;
            }
          }
          LifeGameApp.close();
        };
      }

      // 绑定陪伴授权设置入口
      var compBtn = page.querySelector('#lg-btn-companion-settings');
      if (compBtn) {
        compBtn.onclick = function() {
          LifeGameApp.showCompanionSettingsModal();
        };
      }

      // 绑定 Tab 切换
      page.querySelectorAll('.lg-tab-item').forEach(function(tabEl) {
        tabEl.onclick = function() {
          _activeTab = tabEl.getAttribute('data-tab');
          LifeGameApp.render();
        };
      });

      // 渲染具体 Tab 内容
      var contentEl = page.querySelector('#lg-tab-content');
      if (contentEl) {
        if (_activeTab === 'profile') {
          await this.renderProfileTab(contentEl, lifeState, reqExp, expPercent, char);
        } else if (_activeTab === 'tasks') {
          await this.renderTasksTab(contentEl);
        } else if (_activeTab === 'habits') {
          await this.renderHabitsTab(contentEl);
        } else if (_activeTab === 'goals') {
          await this.renderGoalsTab(contentEl);
        } else if (_activeTab === 'achievements') {
          await this.renderAchievementsTab(contentEl);
        } else if (_activeTab === 'history') {
          await this.renderHistoryTab(contentEl);
        }
      }
    },

    // ===== Tab 1: 角色档案与六维属性 (深度 RPG 养成) =====
    async renderProfileTab(container, lifeState, reqExp, expPercent, char) {
      var stats = lifeState.stats || { INT: 74, CHA: 82, WIL: 68, PHY: 62, PER: 88, INS: 91 };
      var profile = window.LifeGameCompanion ?
        await window.LifeGameCompanion.PlayerProfile.getProfile() :
        { adventurerName: '初心探索者', avatar: 'img/char-default.jpg', bio: '在现实日常点滴中锤炼六维意志' };
      var achState = window.AchievementService ?
        await window.AchievementService.getState() :
        { equippedTitle: lifeState.title || '见习探索者' };
      var currentTitle = achState.equippedTitle || lifeState.title || '见习探索者';

      // 统计历经天数、完成主线、长期愿景达成、纪念卡收藏
      var history = await LifeGameCore.getTasksHistory();
      var goals = await LifeGameCore.getGoals();
      var cards = window.LifeGameCompanion ? await window.LifeGameCompanion.MementoCards.getAllCards() : [];
      var mainCount = history.filter(function(h) { return h.category === 'main'; }).length;
      var goalsDone = goals.filter(function(g) {
        return (g.milestones || []).length > 0 && (g.milestones || []).every(function(m) { return m.done; });
      }).length;
      var daysActive = Math.max(1, Math.ceil((Date.now() - (profile.startedAt || (Date.now() - 86400000 * 7))) / (1000 * 60 * 60 * 24)));

      // 陪伴授权状态
      var compSettings = window.LifeGameCompanion ? await window.LifeGameCompanion.Companion.getSettings() : { globalEnabled: false };
      var companionQuote = (char.name || 'Ta') + ' 正在身边注视着你的现实点滴。每一个细微自律的脚印，都会汇聚成闪闪发光的超维力量。';

      var html =
        // 1. 玩家现实成长档案卡片 (用户自定义名称/头像/称号/简介)
        '<section class="lg-profile-hero">' +
          '<div class="lg-profile-top">' +
            '<div class="lg-profile-char">' +
              '<div class="lg-avatar-box lg-avatar-clickable" id="lg-btn-profile-avatar" title="点击编辑冒险者形象">' +
                '<img class="lg-avatar-img" src="' + (profile.avatar || 'img/char-default.jpg') + '" alt="Avatar" onerror="this.src=\'img/char-default.jpg\'">' +
                '<div class="lg-avatar-edit-badge"><i class="fa-solid fa-pen"></i></div>' +
              '</div>' +
              '<div class="lg-profile-names">' +
                '<div style="display:flex;align-items:center;gap:6px;">' +
                  '<div class="lg-user-name">' + escapeHtml(profile.adventurerName || '初心探索者') + '</div>' +
                  '<button type="button" class="lg-btn-action-text" id="lg-btn-edit-profile" title="编辑玩家档案"><i class="fa-solid fa-user-pen"></i></button>' +
                '</div>' +
                '<div class="lg-user-title-wrap">' +
                  '<span class="lg-user-title">称号 · 【' + escapeHtml(currentTitle) + '】</span>' +
                  '<button type="button" class="lg-btn-action-text" id="lg-btn-change-title-quick" title="切换佩戴称号"><i class="fa-solid fa-crown"></i> 更换</button>' +
                '</div>' +
                '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">' + escapeHtml(profile.bio || '在现实日常点滴中锤炼六维意志') + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
              '<div class="lg-level-large">LV.' + lifeState.level + '</div>' +
              '<div class="lg-level-sub">现实阶位</div>' +
            '</div>' +
          '</div>' +

          // 核心历程摘要
          '<div class="lg-profile-stats-row">' +
            '<div class="lg-pstat-item"><span class="lg-pstat-num">' + daysActive + '</span><span class="lg-pstat-lbl">历练天数</span></div>' +
            '<div class="lg-pstat-item"><span class="lg-pstat-num">' + mainCount + '</span><span class="lg-pstat-lbl">攻克主线</span></div>' +
            '<div class="lg-pstat-item"><span class="lg-pstat-num">' + goalsDone + '</span><span class="lg-pstat-lbl">愿景圆满</span></div>' +
            '<div class="lg-pstat-item"><span class="lg-pstat-num">' + cards.length + '</span><span class="lg-pstat-lbl">纪念卡册</span></div>' +
          '</div>' +

          // 经验条
          '<div class="lg-exp-section">' +
            '<div class="lg-exp-labels">' +
              '<span>升级经验 (EXP)</span>' +
              '<span><strong>' + lifeState.exp + '</strong> / ' + reqExp + ' (' + expPercent + '%)</span>' +
            '</div>' +
            '<div class="lg-exp-track">' +
              '<div class="lg-exp-fill" style="width: ' + expPercent + '%;"></div>' +
            '</div>' +
          '</div>' +

          // 六维成长属性雷达图与六边形网格 (黑白灰规范)
          '<div class="lg-section-header" style="margin-top:10px;margin-bottom:6px;">' +
            '<div class="lg-section-title"><i class="fa-solid fa-chart-pie"></i> 六维成长潜能 (Hex-Stats)</div>' +
            '<button type="button" class="lg-btn-action-text" id="lg-btn-stat-history" title="查看属性成长轨迹与分析"><i class="fa-solid fa-timeline"></i> 详细轨迹</button>' +
          '</div>' +

          '<div class="lg-radar-container">' +
            '<canvas id="lg-profile-radar-canvas" width="280" height="210" class="lg-radar-canvas"></canvas>' +
          '</div>' +

          '<div class="lg-stats-grid">' +
            '<div class="lg-stat-card"><div class="lg-stat-val">' + (stats.INT || 70) + '</div><div class="lg-stat-label">智力 INT</div><div class="lg-stat-bar-track"><div class="lg-stat-bar-fill" style="width:' + Math.min(100, (stats.INT || 70)) + '%;"></div></div></div>' +
            '<div class="lg-stat-card"><div class="lg-stat-val">' + (stats.CHA || 80) + '</div><div class="lg-stat-label">魅力 CHA</div><div class="lg-stat-bar-track"><div class="lg-stat-bar-fill" style="width:' + Math.min(100, (stats.CHA || 80)) + '%;"></div></div></div>' +
            '<div class="lg-stat-card"><div class="lg-stat-val">' + (stats.WIL || 65) + '</div><div class="lg-stat-label">意志 WIL</div><div class="lg-stat-bar-track"><div class="lg-stat-bar-fill" style="width:' + Math.min(100, (stats.WIL || 65)) + '%;"></div></div></div>' +
            '<div class="lg-stat-card"><div class="lg-stat-val">' + (stats.PHY || 60) + '</div><div class="lg-stat-label">体能 PHY</div><div class="lg-stat-bar-track"><div class="lg-stat-bar-fill" style="width:' + Math.min(100, (stats.PHY || 60)) + '%;"></div></div></div>' +
            '<div class="lg-stat-card"><div class="lg-stat-val">' + (stats.PER || 85) + '</div><div class="lg-stat-label">敏锐 PER</div><div class="lg-stat-bar-track"><div class="lg-stat-bar-fill" style="width:' + Math.min(100, (stats.PER || 85)) + '%;"></div></div></div>' +
            '<div class="lg-stat-card"><div class="lg-stat-val">' + (stats.INS || 90) + '</div><div class="lg-stat-label">灵感 INS</div><div class="lg-stat-bar-track"><div class="lg-stat-bar-fill" style="width:' + Math.min(100, (stats.INS || 90)) + '%;"></div></div></div>' +
          '</div>' +
        '</section>' +

        // 今日冒险决策入口 (阶段 2)
        '<section class="lg-ai-feature-card" id="lg-btn-today-ai">' +
          '<div class="lg-ai-feature-left">' +
            '<div class="lg-ai-feature-icon"><i class="fa-solid fa-compass"></i></div>' +
            '<div>' +
              '<div class="lg-ai-feature-title">今天不知道做什么？</div>' +
              '<div class="lg-ai-feature-sub">AI 根据精力、可用时间与当前愿景，推荐今日关键行动</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="lg-btn-ai"><i class="fa-solid fa-wand-magic-sparkles"></i> 今日推荐</button>' +
        '</section>' +

        // 伴侣同行与智能陪伴授权入口卡片
        '<section class="lg-companion-card" id="lg-btn-goto-companion" title="点击管理多 Char 陪伴与授权">' +
          '<img class="lg-companion-avatar" src="' + (char.avatar || 'img/char-default.jpg') + '" onerror="this.src=\'img/char-default.jpg\'">' +
          '<div class="lg-companion-body">' +
            '<div class="lg-companion-title">' +
              '<span><i class="fa-regular fa-heart"></i> 伴侣同行 · ' + escapeHtml(char.name || 'Ta') + '</span>' +
              '<span class="lg-companion-auth-tag ' + (compSettings.globalEnabled ? 'active' : '') + '">' +
                (compSettings.globalEnabled ? '主动祝贺开启中' : '主动陪伴已免打扰') +
              '</span>' +
            '</div>' +
            '<div class="lg-companion-quote">「' + escapeHtml(companionQuote) + '」</div>' +
          '</div>' +
        '</section>' +

        // 自习室专注联动快捷条
        '<section class="lg-study-sync-card">' +
          '<div class="lg-study-sync-info">' +
            '<div class="lg-study-sync-icon"><i class="fa-solid fa-hourglass-start"></i></div>' +
            '<div>' +
              '<div class="lg-study-sync-title">陪伴自习室专注记录联动</div>' +
              '<div class="lg-study-sync-desc">严格只读原记录 · 幂等折算 EXP 与学习进度</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="lg-btn-study-sync" id="lg-btn-sync-study"><i class="fa-solid fa-arrows-rotate"></i> 同步记录</button>' +
        '</section>';

      container.innerHTML = html;

      // 绘制 Canvas 雷达图
      var canvas = container.querySelector('#lg-profile-radar-canvas');
      if (canvas && window.LifeGameCompanion) {
        window.LifeGameCompanion.PlayerProfile.renderRadarChart(canvas, stats);
      }

      // 绑定编辑档案
      var editProfileBtn = container.querySelector('#lg-btn-edit-profile');
      var avatarBtn = container.querySelector('#lg-btn-profile-avatar');
      var triggerEdit = function() { LifeGameApp.showEditProfileModal(profile); };
      if (editProfileBtn) editProfileBtn.onclick = triggerEdit;
      if (avatarBtn) avatarBtn.onclick = triggerEdit;

      // 更换佩戴头衔
      var changeTitleBtn = container.querySelector('#lg-btn-change-title-quick');
      if (changeTitleBtn) {
        changeTitleBtn.onclick = async function() {
          var badges = window.LifeGameCompanion ? await window.LifeGameCompanion.Achievements.getAllBadges() : [];
          var unlockedTitles = badges.filter(function(b) { return b.unlocked && b.titleReward; }).map(function(b) { return b.titleReward; });
          var baseTitles = ['初涉尘寰的旅人', '自律进阶学者', '敏锐深空探秘家', '博识大贤者', '超维传奇缔造者'];
          var allAvailable = Array.from(new Set(baseTitles.concat(unlockedTitles)));

          var promptText = '请选择想要佩戴的称号序号：\n' + allAvailable.map(function(t, idx) { return (idx + 1) + '. ' + t; }).join('\n');
          var selected = prompt(promptText);
          var idx = parseInt(selected, 10) - 1;
          if (idx >= 0 && idx < allAvailable.length) {
            var newT = allAvailable[idx];
            if (window.AchievementService) {
              await window.AchievementService.equipTitle(newT);
            }
            window.toast && window.toast('👑 已成功佩戴头衔：【' + newT + '】');
            LifeGameApp.render();
          }
        };
      }

      // 六维成长轨迹弹窗
      var statHistoryBtn = container.querySelector('#lg-btn-stat-history');
      if (statHistoryBtn) {
        statHistoryBtn.onclick = function() {
          LifeGameApp.showStatHistoryModal(stats);
        };
      }

      // 伴侣卡片点击 -> 伴侣陪伴设置
      var compCard = container.querySelector('#lg-btn-goto-companion');
      if (compCard) {
        compCard.onclick = function() {
          LifeGameApp.showCompanionSettingsModal();
        };
      }

      // 今日推荐
      var todayAiBtn = container.querySelector('#lg-btn-today-ai');
      if (todayAiBtn) {
        todayAiBtn.onclick = function() {
          if (window.LifeGameAIUI) {
            window.LifeGameAIUI.showTodayRecommendModal();
          }
        };
      }

      // 同步记录
      var syncBtn = container.querySelector('#lg-btn-sync-study');
      if (syncBtn) {
        syncBtn.onclick = async function() {
          syncBtn.disabled = true;
          syncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 同步中...';
          var res = await LifeGameCore.syncStudyRecords();
          window.toast && window.toast(res.msg);
          syncBtn.disabled = false;
          syncBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> 同步记录';
          LifeGameApp.render();
        };
      }
    },

    // ===== Tab 2: 现实委托与任务管理 =====
    async renderTasksTab(container) {
      var tasks = await LifeGameCore.getTasks();

      // 筛选
      var filtered = tasks.filter(function(t) {
        if (_taskFilter === 'pending') return t.status === 'pending';
        if (_taskFilter === 'completed') return t.status === 'completed' || t.status === 'claimed';
        if (_taskFilter === 'study') return t.category === 'study';
        return true;
      });

      var html =
        '<div class="lg-section-header">' +
          '<div class="lg-section-title"><i class="fa-solid fa-scroll"></i> 现实悬赏委托板 (' + tasks.length + ')</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<button type="button" class="lg-btn-ai-outline" id="lg-btn-tasks-today-ai"><i class="fa-solid fa-compass"></i> 今日建议</button>' +
            '<button type="button" class="lg-btn-add" id="lg-btn-add-task"><i class="fa-solid fa-plus"></i> 发布委托</button>' +
          '</div>' +
        '</div>' +

        // 筛选标签
        '<div class="lg-filter-chips">' +
          '<div class="lg-chip ' + (_taskFilter === 'all' ? 'active' : '') + '" data-filter="all">全部 (' + tasks.length + ')</div>' +
          '<div class="lg-chip ' + (_taskFilter === 'pending' ? 'active' : '') + '" data-filter="pending">进行中</div>' +
          '<div class="lg-chip ' + (_taskFilter === 'completed' ? 'active' : '') + '" data-filter="completed">已达成</div>' +
          '<div class="lg-chip ' + (_taskFilter === 'study' ? 'active' : '') + '" data-filter="study">自习攻坚</div>' +
        '</div>' +

        '<div class="lg-tasks-list">';

      if (filtered.length === 0) {
        html += '<div style="text-align:center;padding:40px 20px;color:var(--c-sub);font-size:12px;"><i class="fa-regular fa-clipboard" style="font-size:24px;margin-bottom:8px;display:block;"></i>暂无相关委托任务，点击右上角发布新委托</div>';
      } else {
        filtered.forEach(function(task) {
          var isDone = task.status === 'completed' || task.status === 'claimed';
          var isClaimed = task.status === 'claimed';
          var tagLabel = { main: '主线', daily: '日常', study: '自习', side: '支线' }[task.category] || '委托';

          var progressHint = '';
          if (task.category === 'study' && task.targetMinutes) {
            progressHint = '<span style="color:var(--c-sub);margin-left:6px;font-weight:normal;">(' + (task.accumulatedMinutes || 0) + '/' + task.targetMinutes + 'm)</span>';
          }

          var linkedBadgesHtml = '';
          if (task.studyTodoId || task.category === 'study' || task.linkedSource === 'studyRoom') {
            linkedBadgesHtml += '<span class="lg-link-badge" data-action="nav-sr" data-todoid="' + (task.studyTodoId || '') + '" data-id="' + task.id + '" title="已联动陪伴自习室待办，点击跳转"><i class="fa-solid fa-graduation-cap"></i> 自习待办 <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:9px;"></i></span>';
          }
          if (task.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) {
            linkedBadgesHtml += '<span class="lg-link-badge" data-action="nav-tc" data-date="' + task.dueDate + '" data-id="' + task.id + '" title="已排期至时光日历，点击跳转查看日程"><i class="fa-regular fa-calendar"></i> ' + task.dueDate + ' <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:9px;"></i></span>';
          }

          html +=
            '<div class="lg-task-card ' + (isDone ? 'completed' : '') + '" data-id="' + task.id + '">' +
              '<div class="lg-task-header">' +
                '<div class="lg-task-title-group">' +
                  '<div class="lg-task-checkbox ' + (isDone ? 'checked' : '') + '" data-action="toggle" data-id="' + task.id + '">' +
                    (isDone ? '<i class="fa-solid fa-check" style="font-size:11px;"></i>' : '') +
                  '</div>' +
                  '<div class="lg-task-title">' + escapeHtml(task.title) + progressHint + '</div>' +
                '</div>' +
                '<span class="lg-task-tag">' + tagLabel + '</span>' +
              '</div>' +

              (task.desc ? '<div class="lg-task-desc">' + escapeHtml(task.desc) + '</div>' : '') +

              (linkedBadgesHtml ? '<div class="lg-task-link-group">' + linkedBadgesHtml + '</div>' : '') +

              '<div class="lg-task-footer">' +
                '<div class="lg-task-rewards">' +
                  '<span class="lg-reward-item"><i class="fa-solid fa-star"></i> +' + task.rewardExp + ' EXP</span>' +
                  (task.rewardCoins ? '<span class="lg-reward-item"><i class="fa-solid fa-coins"></i> +' + task.rewardCoins + '</span>' : '') +
                  (task.dueDate ? '<span><i class="fa-regular fa-clock"></i> ' + task.dueDate + '</span>' : '') +
                '</div>' +

                '<div class="lg-task-actions">' +
                  (task.status === 'completed' ?
                    '<button type="button" class="lg-btn-claim" data-action="claim" data-id="' + task.id + '"><i class="fa-solid fa-gift"></i> 领取奖励</button>' +
                    '<button type="button" class="lg-btn-action-text" data-action="delete" data-id="' + task.id + '" title="删除委托"><i class="fa-solid fa-trash-can"></i></button>' :
                    (isClaimed ?
                      '<span style="color:var(--c-sub);font-size:11px;"><i class="fa-solid fa-circle-check"></i> 已入账</span>' +
                      '<button type="button" class="lg-btn-action-text" data-action="delete" data-id="' + task.id + '" title="清理已入账委托"><i class="fa-solid fa-trash-can"></i></button>' :
                      '<button type="button" class="lg-btn-action-text" data-action="edit" data-id="' + task.id + '" title="编辑委托"><i class="fa-solid fa-pen"></i></button>' +
                      '<button type="button" class="lg-btn-action-text" data-action="delete" data-id="' + task.id + '" title="删除委托"><i class="fa-solid fa-trash-can"></i></button>'
                    )
                  ) +
                '</div>' +
              '</div>' +
            '</div>';
        });
      }

      html += '</div>';
      container.innerHTML = html;

      // 绑定筛选
      container.querySelectorAll('.lg-chip').forEach(function(chip) {
        chip.onclick = function() {
          _taskFilter = chip.getAttribute('data-filter');
          LifeGameApp.renderTasksTab(container);
        };
      });

      // 绑定发布委托
      var addBtn = container.querySelector('#lg-btn-add-task');
      if (addBtn) {
        addBtn.onclick = function() {
          LifeGameApp.showTaskModal(null);
        };
      }

      var tasksTodayBtn = container.querySelector('#lg-btn-tasks-today-ai');
      if (tasksTodayBtn) {
        tasksTodayBtn.onclick = function() {
          if (window.LifeGameAIUI) {
            window.LifeGameAIUI.showTodayRecommendModal();
          }
        };
      }

      // 绑定任务项交互
      container.querySelectorAll('[data-action]').forEach(function(btn) {
        btn.onclick = async function(e) {
          e.stopPropagation();
          var action = btn.getAttribute('data-action');
          var id = btn.getAttribute('data-id');
          var allTasks = await LifeGameCore.getTasks();
          var t = allTasks.find(function(item) { return item.id === id; });
          if (!t) return;

          if (action === 'toggle') {
            if (t.status === 'claimed') {
              window.toast && window.toast('该任务奖励已入账，不可重新标记');
              return;
            }
            t.status = t.status === 'completed' ? 'pending' : 'completed';
            t.completedAt = t.status === 'completed' ? Date.now() : null;
            await LifeGameCore.saveTasks(allTasks);

            // 同步自习室待办
            if (t.studyTodoId && window.LifeGameIntegrations) {
              window.LifeGameIntegrations.studyRoom.linkTaskToStudyTodo(t);
            }

            LifeGameApp.renderTasksTab(container);
            if (t.status === 'completed') {
              window.toast && window.toast('🎉 任务达成！点击「领取奖励」领取 EXP 与金币！');
            }
          } else if (action === 'nav-sr') {
            if (window.LifeGameIntegrations) {
              window.LifeGameIntegrations.navigateToStudyRoom({ tab: 'hall', targetTodoId: t.studyTodoId, fromApp: 'life-game' });
            }
            return;
          } else if (action === 'nav-tc') {
            if (window.LifeGameIntegrations) {
              window.LifeGameIntegrations.navigateToTimeCalendar({ tab: 'calendar', date: t.dueDate, eventId: 'lg_task_' + t.id, fromApp: 'life-game' });
            }
            return;
          } else if (action === 'claim') {
            var claimRes = await LifeGameCore.claimTaskReward(id);
            if (claimRes.success) {
              window.toast && window.toast('✨ 获得 +' + claimRes.expGranted + ' EXP，+' + claimRes.coinsGranted + ' 金币！');
              if (claimRes.leveledUp) {
                LifeGameApp.showLevelUpModal(claimRes.newLevel);
              }
              LifeGameApp.render();
            } else {
              window.toast && window.toast(claimRes.msg);
            }
          } else if (action === 'edit') {
            LifeGameApp.showTaskModal(t);
          } else if (action === 'delete') {
            var confirmMsg = t.status === 'claimed' ?
              '确定要从委托列表清理此已入账委托吗？已获得的经验、金币与成长记录将完整保留。' :
              '确定要删除这条委托任务吗？';
            if (confirm(confirmMsg)) {
              if (t.studyTodoId && window.LifeGameIntegrations) {
                await window.LifeGameIntegrations.unlinkTaskFromStudyTodo(t.id);
              }
              var remaining = allTasks.filter(function(item) { return item.id !== id; });
              await LifeGameCore.saveTasks(remaining);
              window.toast && window.toast(t.status === 'claimed' ? '已清理委托' : '委托已删除');
              LifeGameApp.renderTasksTab(container);
            }
          }
        };
      });
    },

    // ===== Tab 3: 每日习惯与连续打卡 =====
    async renderHabitsTab(container) {
      var habits = await LifeGameCore.getHabits();
      var today = getTodayStr();

      var html =
        '<div class="lg-section-header">' +
          '<div class="lg-section-title"><i class="fa-solid fa-fire"></i> 每日习惯养成与连胜 (' + habits.length + ')</div>' +
          '<button type="button" class="lg-btn-add" id="lg-btn-add-habit"><i class="fa-solid fa-plus"></i> 新建习惯</button>' +
        '</div>' +
        '<div class="lg-habits-list">';

      habits.forEach(function(habit) {
        var isCheckedToday = habit.lastCheckinDate === today || (habit.checkinHistory && habit.checkinHistory.indexOf(today) !== -1);

        html +=
          '<div class="lg-habit-card" data-id="' + habit.id + '">' +
            '<div class="lg-habit-main">' +
              '<div class="lg-habit-icon-box"><i class="' + (habit.icon || 'fa-solid fa-check') + '"></i></div>' +
              '<div class="lg-habit-info">' +
                '<div class="lg-habit-name">' + escapeHtml(habit.name) + '</div>' +
                '<div class="lg-habit-streak">' +
                  '<i class="fa-solid fa-bolt"></i> 连续 ' + (habit.streak || 0) + ' 天 · 最佳 ' + (habit.bestStreak || 0) + ' 天' +
                '</div>' +
              '</div>' +
            '</div>' +

            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<button type="button" class="lg-btn-checkin ' + (isCheckedToday ? 'checked' : '') + '" ' + (isCheckedToday ? 'disabled' : '') + ' data-action="checkin" data-id="' + habit.id + '">' +
                (isCheckedToday ? '<i class="fa-solid fa-check"></i> 今日已打卡' : '<i class="fa-regular fa-circle-check"></i> 打卡 (+' + (habit.expReward || 20) + ' EXP)') +
              '</button>' +
              '<button type="button" class="lg-btn-action-text" data-action="edit-habit" data-id="' + habit.id + '" title="编辑习惯"><i class="fa-solid fa-pen"></i></button>' +
              '<button type="button" class="lg-btn-action-text" data-action="delete-habit" data-id="' + habit.id + '" title="删除习惯"><i class="fa-solid fa-trash-can"></i></button>' +
            '</div>' +
          '</div>';
      });

      html += '</div>';
      container.innerHTML = html;

      var addHabitBtn = container.querySelector('#lg-btn-add-habit');
      if (addHabitBtn) {
        addHabitBtn.onclick = function() {
          LifeGameApp.showHabitModal(null);
        };
      }

      container.querySelectorAll('[data-action]').forEach(function(btn) {
        btn.onclick = async function(e) {
          e.stopPropagation();
          var action = btn.getAttribute('data-action');
          var id = btn.getAttribute('data-id');
          var allHabits = await LifeGameCore.getHabits();
          var habit = allHabits.find(function(h) { return h.id === id; });
          if (!habit) return;

          if (action === 'checkin') {
            btn.disabled = true;
            var res = await LifeGameCore.checkinHabit(id);
            if (res.success) {
              window.toast && window.toast('🌟 打卡成功！连续 ' + res.streak + ' 天！获得 +' + res.expGranted + ' EXP！');
              if (res.leveledUp) {
                LifeGameApp.showLevelUpModal(res.newLevel);
              }
              LifeGameApp.render();
            } else {
              window.toast && window.toast(res.msg);
              btn.disabled = false;
            }
          } else if (action === 'edit-habit') {
            LifeGameApp.showHabitModal(habit);
          } else if (action === 'delete-habit') {
            if (confirm('确定要移除该习惯吗？已获得的经验与历史打卡记录将妥善留存。')) {
              var remaining = allHabits.filter(function(h) { return h.id !== id; });
              await LifeGameCore.saveHabits(remaining);
              window.toast && window.toast('习惯已移除');
              LifeGameApp.renderHabitsTab(container);
            }
          }
        };
      });
    },

    // ===== Tab 4: 长期主线愿景与里程碑 =====
    async renderGoalsTab(container) {
      var goals = await LifeGameCore.getGoals();

      var html =
        '<div class="lg-section-header">' +
          '<div class="lg-section-title"><i class="fa-solid fa-bullseye"></i> 长期主线愿景与里程碑 (' + goals.length + ')</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<button type="button" class="lg-btn-ai" id="lg-btn-ai-decompose"><i class="fa-solid fa-wand-magic-sparkles"></i> AI 帮我拆解目标</button>' +
            '<button type="button" class="lg-btn-add" id="lg-btn-add-goal"><i class="fa-solid fa-plus"></i> 新建目标</button>' +
          '</div>' +
        '</div>' +
        '<div class="lg-goals-list">';

      goals.forEach(function(goal) {
        var milestones = goal.milestones || [];
        var doneCount = milestones.filter(function(m) { return m.done; }).length;
        var percent = milestones.length > 0 ? Math.round((doneCount / milestones.length) * 100) : 0;

        var examBadgeHtml = '';
        if (goal.examId) {
          examBadgeHtml = '<span class="lg-link-badge" data-action="nav-exam" data-examid="' + goal.examId + '" title="已关联自习室备考计划，点击跳转"><i class="fa-solid fa-graduation-cap"></i> 备考联动 <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:9px;"></i></span>';
        }

        html +=
          '<div class="lg-goal-card" data-id="' + goal.id + '">' +
            '<div class="lg-goal-top">' +
              '<div>' +
                '<div class="lg-goal-title">' + escapeHtml(goal.title) + '</div>' +
                (goal.desc ? '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">' + escapeHtml(goal.desc) + '</div>' : '') +
                (examBadgeHtml ? '<div style="margin-top:4px;">' + examBadgeHtml + '</div>' : '') +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                (goal.targetDate ? '<div class="lg-goal-due"><i class="fa-regular fa-calendar-check"></i> ' + goal.targetDate + '</div>' : '') +
                '<button type="button" class="lg-btn-action-text" data-action="adjust-goal" data-id="' + goal.id + '" title="AI 评估与调整计划"><i class="fa-solid fa-sliders"></i></button>' +
                '<button type="button" class="lg-btn-action-text" data-action="edit-goal" data-id="' + goal.id + '" title="编辑目标"><i class="fa-solid fa-pen"></i></button>' +
                '<button type="button" class="lg-btn-action-text" data-action="delete-goal" data-id="' + goal.id + '" title="删除目标"><i class="fa-solid fa-trash-can"></i></button>' +
              '</div>' +
            '</div>' +

            // 进度条
            '<div>' +
              '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--c-sub);margin-bottom:3px;">' +
                '<span>达成进度</span><span>' + doneCount + ' / ' + milestones.length + ' (' + percent + '%)</span>' +
              '</div>' +
              '<div class="lg-exp-track">' +
                '<div class="lg-exp-fill" style="width:' + percent + '%;"></div>' +
              '</div>' +
            '</div>' +

            // 里程碑子列表
            '<div class="lg-milestones">' +
              milestones.map(function(ms) {
                return (
                  '<div class="lg-milestone-item ' + (ms.done ? 'done' : '') + '">' +
                    '<div class="lg-task-checkbox ' + (ms.done ? 'checked' : '') + '" data-action="toggle-ms" data-gid="' + goal.id + '" data-msid="' + ms.id + '">' +
                      (ms.done ? '<i class="fa-solid fa-check" style="font-size:10px;"></i>' : '') +
                    '</div>' +
                    '<span style="flex:1;">' + escapeHtml(ms.title) + '</span>' +
                    '<span style="font-size:10px;color:var(--c-sub);font-weight:600;">+' + (ms.expReward || 60) + ' EXP</span>' +
                  '</div>'
                );
              }).join('') +
            '</div>' +
          '</div>';
      });

      html += '</div>';
      container.innerHTML = html;

      var addGoalBtn = container.querySelector('#lg-btn-add-goal');
      if (addGoalBtn) {
        addGoalBtn.onclick = function() {
          LifeGameApp.showGoalModal(null);
        };
      }

      var aiDecomposeBtn = container.querySelector('#lg-btn-ai-decompose');
      if (aiDecomposeBtn) {
        aiDecomposeBtn.onclick = function() {
          if (window.LifeGameAIUI) {
            window.LifeGameAIUI.showDecomposeWizardModal();
          }
        };
      }

      container.querySelectorAll('[data-action]').forEach(function(btn) {
        btn.onclick = async function(e) {
          e.stopPropagation();
          var action = btn.getAttribute('data-action');
          var gid = btn.getAttribute('data-id') || btn.getAttribute('data-gid');
          var allGoals = await LifeGameCore.getGoals();
          var g = allGoals.find(function(item) { return item.id === gid; });
          if (!g) return;

          if (action === 'nav-exam') {
            if (window.LifeGameIntegrations) {
              window.LifeGameIntegrations.navigateToStudyRoom({ tab: 'resources', targetExamId: g.examId, fromApp: 'life-game' });
            }
            return;
          } else if (action === 'adjust-goal') {
            if (window.LifeGameAIUI) {
              window.LifeGameAIUI.showPlanAdjustModal(gid);
            }
          } else if (action === 'edit-goal') {
            LifeGameApp.showGoalModal(g);
          } else if (action === 'delete-goal') {
            if (confirm('确定要删除该长期愿景吗？已达成的里程碑经验与属性奖励将安全保留。')) {
              if (g.examId && window.LifeGameIntegrations) {
                await window.LifeGameIntegrations.unlinkGoalFromExam(g.id);
              }
              var remainingGoals = allGoals.filter(function(item) { return item.id !== gid; });
              await LifeGameCore.saveGoals(remainingGoals);
              window.toast && window.toast('长期愿景已删除');
              LifeGameApp.renderGoalsTab(container);
            }
          } else if (action === 'toggle-ms') {
            var msid = btn.getAttribute('data-msid');
            var ms = (g.milestones || []).find(function(item) { return item.id === msid; });
            if (!ms) return;

            if (ms.claimed) {
              window.toast && window.toast('该里程碑奖励已发放入账，无需重复领取');
              return;
            }

            ms.done = true;
            ms.claimed = true;
            ms.claimedAt = Date.now();
            await LifeGameCore.saveGoals(allGoals);

            var eventId = 'milestone_' + ms.id;
            var expReq = ms.expReward || 60;
            var coinsReq = 20;

            var guard = window.WanwanSharedHub && window.WanwanSharedHub.RewardGuard ?
              await window.WanwanSharedHub.RewardGuard.validateAndGrant(eventId, expReq, coinsReq, 0) :
              { allowed: true, expGranted: expReq, coinsGranted: coinsReq };

            if (guard.allowed) {
              if (guard.coinsGranted > 0 && window.SharedEconomyService) {
                try {
                  await window.SharedEconomyService.addCoins(guard.coinsGranted, '达成里程碑：' + ms.title, 'lifeGame');
                } catch (_) {}
              }
              if (window.LifeGameService && guard.expGranted > 0) {
                var res = await window.LifeGameService.addExpAndStats(
                  guard.expGranted,
                  { WIL: 2, INT: 1 },
                  '达成主线里程碑：' + ms.title,
                  eventId,
                  { alreadyValidated: true }
                );
                window.toast && window.toast('🎯 里程碑达成！获得 +' + guard.expGranted + ' EXP，+' + guard.coinsGranted + ' 金币！');
                if (res && res.leveledUp) {
                  LifeGameApp.showLevelUpModal(res.level);
                }
                // 阶段 4 深度联动：愿景里程碑手账与祝贺
                if (window.LifeGameCompanion) {
                  try {
                    await window.LifeGameCompanion.onGoalMilestoneClaimed(g, ms, res);
                  } catch (cErr) {
                    console.warn('[LifeGame] LifeGameCompanion milestone hook error:', cErr);
                  }
                }
                if (window.WanwanSharedHub && typeof window.WanwanSharedHub.emit === 'function') {
                  try {
                    await window.WanwanSharedHub.emit('ACHIEVEMENT_SOURCE_EVENT', {
                      eventId: 'lg_milestone_' + ms.id,
                      eventType: 'milestone_claimed',
                      sourceApp: 'life-game',
                      sourceRecordId: ms.id,
                      occurrenceKey: ms.id,
                      occurredAt: ms.claimedAt || Date.now(),
                      payload: { goalId: g.id }
                    });
                  } catch (_) {}
                }
              }
            } else {
              window.toast && window.toast(guard.msg || '里程碑已达成');
            }

            LifeGameApp.render();
          }
        };
      });
    },

    // ===== Tab 5: 成就馆与称号佩戴 (扩展 6 大分类 + 隐藏剪影 + 详情弹窗) =====
    async renderAchievementsTab(container) {
      var badges = window.LifeGameCompanion ?
        await window.LifeGameCompanion.Achievements.getAllBadges() :
        (window.AchievementService ? (await window.AchievementService.getState()).badges : []);
      var achState = window.AchievementService ?
        await window.AchievementService.getState() :
        { equippedTitle: '见习探索者', totalScore: 0 };
      var categories = window.LifeGameCompanion ?
        window.LifeGameCompanion.Achievements.getCategories() :
        [{ key: 'all', name: '全部勋章' }];

      // 分类筛选
      var filtered = badges;
      if (_achFilter && _achFilter !== 'all') {
        filtered = badges.filter(function(b) { return b.category === _achFilter; });
      }

      var unlockedCount = badges.filter(function(b) { return b.unlocked; }).length;

      var html =
        '<div class="lg-section-header">' +
          '<div class="lg-section-title"><i class="fa-solid fa-trophy"></i> 荣誉勋章与佩戴头衔</div>' +
          '<div style="font-size:11px;font-weight:600;color:var(--c-sub);"><i class="fa-solid fa-award"></i> 已解锁 ' + unlockedCount + ' / ' + badges.length + ' · 荣誉点: ' + (achState.totalScore || 0) + '</div>' +
        '</div>' +

        // 当前穿戴头衔横幅
        '<div class="lg-title-banner">' +
          '<div>' +
            '<div style="font-size:11px;color:var(--c-sub);">当前佩戴头衔</div>' +
            '<div style="font-size:14px;font-weight:700;color:var(--c-text);margin-top:2px;">【' + escapeHtml(achState.equippedTitle || '见习探索者') + '】</div>' +
          '</div>' +
          '<button type="button" class="lg-btn-secondary" id="lg-btn-change-title">更换头衔</button>' +
        '</div>' +

        // 6 大分类胶囊过滤栏
        '<div class="lg-category-pills">' +
          categories.map(function(c) {
            return '<div class="lg-cat-pill ' + (_achFilter === c.key ? 'active' : '') + '" data-ach-cat="' + c.key + '">' + escapeHtml(c.name) + '</div>';
          }).join('') +
        '</div>' +

        // 勋章网格 (支持剪影、锁、星标置顶)
        '<div class="lg-achievements-grid" style="margin-top:10px;">';

      filtered.forEach(function(badge) {
        var isUnlocked = badge.unlocked;
        var isHidden = badge.hidden && !isUnlocked;
        var displayName = isHidden ? '？？？' : badge.name;
        var displayDesc = isHidden ? '隐藏神秘成就，在特定生活契机中触发' : (badge.desc || '');

        html +=
          '<div class="lg-badge-card ' + (isUnlocked ? '' : 'locked') + ' ' + (badge.isFavorite ? 'favorite' : '') + '" data-badge-id="' + badge.id + '">' +
            (badge.isFavorite ? '<div class="lg-badge-pin-icon" title="个人主页置顶"><i class="fa-solid fa-star"></i></div>' : '') +
            '<div class="lg-badge-icon">' +
              (isHidden ? '<i class="fa-solid fa-question"></i>' : ('<i class="' + (badge.icon || 'fa-solid fa-medal') + '"></i>')) +
            '</div>' +
            '<div class="lg-badge-name">' + escapeHtml(displayName) + '</div>' +
            '<div class="lg-badge-desc">' + escapeHtml(displayDesc) + '</div>' +
            '<div class="lg-badge-points">+' + (badge.points || 100) + ' 荣誉点</div>' +
            (isUnlocked ?
              '<span class="lg-badge-status-unlocked"><i class="fa-solid fa-check"></i> 已达成</span>' :
              '<span class="lg-badge-status-locked"><i class="fa-solid fa-lock"></i> 待解锁</span>') +
          '</div>';
      });

      html += '</div>';
      container.innerHTML = html;

      // 绑定分类切换
      container.querySelectorAll('[data-ach-cat]').forEach(function(el) {
        el.onclick = function() {
          _achFilter = el.getAttribute('data-ach-cat');
          LifeGameApp.renderAchievementsTab(container);
        };
      });

      // 绑定点击查看详情弹窗
      container.querySelectorAll('.lg-badge-card').forEach(function(cardEl) {
        cardEl.onclick = function() {
          var bid = cardEl.getAttribute('data-badge-id');
          var b = badges.find(function(item) { return item.id === bid; });
          if (b) {
            LifeGameApp.showBadgeDetailModal(b);
          }
        };
      });

      // 更换头衔
      var changeTitleBtn = container.querySelector('#lg-btn-change-title');
      if (changeTitleBtn) {
        changeTitleBtn.onclick = async function() {
          var unlockedTitles = badges.filter(function(b) { return b.unlocked && b.titleReward; }).map(function(b) { return b.titleReward; });
          var baseTitles = ['初涉尘寰的旅人', '自律进阶学者', '敏锐深空探秘家', '博识大贤者', '超维传奇缔造者'];
          var allAvailable = Array.from(new Set(baseTitles.concat(unlockedTitles)));

          var promptText = '请选择想要佩戴的头衔序号：\n' + allAvailable.map(function(t, idx) { return (idx + 1) + '. ' + t; }).join('\n');
          var selected = prompt(promptText);
          var idx = parseInt(selected, 10) - 1;
          if (idx >= 0 && idx < allAvailable.length) {
            var newT = allAvailable[idx];
            if (window.AchievementService) {
              await window.AchievementService.equipTitle(newT);
            }
            window.toast && window.toast('👑 已成功佩戴头衔：【' + newT + '】');
            LifeGameApp.render();
          }
        };
      }
    },

    // ===== Tab 6: 「我的人生冒险手账」 (Adventure Journal) =====
    async renderHistoryTab(container) {
      var timeline = window.LifeGameCompanion ?
        await window.LifeGameCompanion.Journal.getTimeline() :
        [];
      var history = await LifeGameCore.getTasksHistory();
      var habits = await LifeGameCore.getHabits();
      var totalStreaks = habits.reduce(function(sum, h) { return sum + (h.streak || 0); }, 0);
      var cards = window.LifeGameCompanion ? await window.LifeGameCompanion.MementoCards.getAllCards() : [];

      // 筛选分类
      var filtered = timeline;
      if (_journalFilter && _journalFilter !== 'all') {
        filtered = timeline.filter(function(item) { return item.type === _journalFilter; });
      }

      var html =
        '<div class="lg-section-header">' +
          '<div class="lg-section-title"><i class="fa-solid fa-book-bookmark"></i> 我的人生冒险手账</div>' +
          '<div style="display:flex;gap:6px;">' +
            '<button type="button" class="lg-btn-secondary" id="lg-btn-add-note"><i class="fa-solid fa-pen-nib"></i> 随笔手记</button>' +
            '<button type="button" class="lg-btn-ai" id="lg-btn-weekly-review"><i class="fa-solid fa-feather"></i> 每周复盘</button>' +
          '</div>' +
        '</div>' +

        // 核心真实汇总网格
        '<div class="lg-history-stats-grid">' +
          '<div class="lg-history-stat-card">' +
            '<div class="lg-history-stat-val">' + history.length + '</div>' +
            '<div class="lg-history-stat-lbl">完成委托</div>' +
          '</div>' +
          '<div class="lg-history-stat-card">' +
            '<div class="lg-history-stat-val">' + cards.length + '</div>' +
            '<div class="lg-history-stat-lbl">成长纪念卡</div>' +
          '</div>' +
          '<div class="lg-history-stat-card">' +
            '<div class="lg-history-stat-val">' + totalStreaks + '</div>' +
            '<div class="lg-history-stat-lbl">习惯连胜</div>' +
          '</div>' +
        '</div>';

      // 成长纪念卡专架
      if (cards.length > 0) {
        html +=
          '<div class="lg-section-header" style="margin-top:10px;margin-bottom:6px;">' +
            '<div class="lg-section-title" style="font-size:12px;"><i class="fa-solid fa-id-badge"></i> 珍藏成长纪念卡 (' + cards.length + ')</div>' +
          '</div>' +
          '<div class="lg-cards-scroll-strip">';

        cards.forEach(function(card) {
          html +=
            '<div class="lg-mini-card ' + (card.isFavorite ? 'fav' : '') + '" data-card-id="' + card.id + '">' +
              '<div class="lg-mini-card-tag">' + escapeHtml(card.cardType === 'level_up' ? '破阶' : (card.cardType === 'major_quest' ? '主线' : '愿景')) + '</div>' +
              '<div class="lg-mini-card-title">' + escapeHtml(card.title) + '</div>' +
              '<div class="lg-mini-card-date">' + escapeHtml(card.date) + '</div>' +
            '</div>';
        });

        html += '</div>';
      }

      // 手账事件筛选器
      html +=
        '<div class="lg-journal-filter-bar">' +
          '<select class="lg-select-sm" id="lg-journal-filter-type">' +
            '<option value="all" ' + (_journalFilter === 'all' ? 'selected' : '') + '>全部足迹</option>' +
            '<option value="quest" ' + (_journalFilter === 'quest' ? 'selected' : '') + '>现实委托</option>' +
            '<option value="level_up" ' + (_journalFilter === 'level_up' ? 'selected' : '') + '>等级破阶</option>' +
            '<option value="milestone" ' + (_journalFilter === 'milestone' ? 'selected' : '') + '>愿景攻关</option>' +
            '<option value="habit" ' + (_journalFilter === 'habit' ? 'selected' : '') + '>习惯打卡</option>' +
            '<option value="note" ' + (_journalFilter === 'note' ? 'selected' : '') + '>感悟随笔</option>' +
            '<option value="memento_card" ' + (_journalFilter === 'memento_card' ? 'selected' : '') + '>纪念卡</option>' +
          '</select>' +
        '</div>' +

        '<div class="lg-journal-timeline">';

      if (filtered.length === 0) {
        html += '<div style="text-align:center;padding:40px 20px;color:var(--c-sub);font-size:12px;"><i class="fa-regular fa-calendar-check" style="font-size:24px;margin-bottom:8px;display:block;"></i>手账中暂无相关记录，行动起来谱写新的篇章吧！</div>';
      } else {
        filtered.forEach(function(item) {
          var typeIconMap = {
            quest: 'fa-solid fa-check',
            level_up: 'fa-solid fa-crown',
            milestone: 'fa-solid fa-flag',
            habit: 'fa-solid fa-fire',
            badge: 'fa-solid fa-trophy',
            note: 'fa-solid fa-quote-left',
            memento_card: 'fa-solid fa-id-badge'
          };
          var icon = typeIconMap[item.type] || 'fa-solid fa-circle-dot';

          html +=
            '<div class="lg-journal-item" data-id="' + item.id + '">' +
              '<div class="lg-journal-item-icon"><i class="' + icon + '"></i></div>' +
              '<div class="lg-journal-item-content">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;">' +
                  '<div class="lg-journal-item-title">' + escapeHtml(item.title) + '</div>' +
                  '<div class="lg-journal-item-time">' + formatTimeShort(item.timestamp) + '</div>' +
                '</div>' +
                (item.desc ? '<div class="lg-journal-item-desc">' + escapeHtml(item.desc) + '</div>' : '') +
                '<div class="lg-journal-tags">' +
                  (item.tags || []).map(function(t) { return '<span class="lg-jtag">' + escapeHtml(t) + '</span>'; }).join('') +
                  (item.type === 'note' ? '<button type="button" class="lg-btn-action-text" data-action="delete-note" data-id="' + item.id + '" title="删除手记"><i class="fa-solid fa-trash-can"></i></button>' : '') +
                '</div>' +
              '</div>' +
            '</div>';
        });
      }

      html += '</div>';
      container.innerHTML = html;

      // 绑定手记添加
      var addNoteBtn = container.querySelector('#lg-btn-add-note');
      if (addNoteBtn) {
        addNoteBtn.onclick = function() {
          LifeGameApp.showAddJournalNoteModal();
        };
      }

      // 绑定纪念卡点击
      container.querySelectorAll('.lg-mini-card').forEach(function(cardEl) {
        cardEl.onclick = async function() {
          var cid = cardEl.getAttribute('data-card-id');
          var allCards = window.LifeGameCompanion ? await window.LifeGameCompanion.MementoCards.getAllCards() : [];
          var c = allCards.find(function(item) { return item.id === cid; });
          if (c) {
            LifeGameApp.showMementoCardModal(c);
          }
        };
      });

      // 绑定筛选
      var filterSelect = container.querySelector('#lg-journal-filter-type');
      if (filterSelect) {
        filterSelect.onchange = function() {
          _journalFilter = filterSelect.value;
          LifeGameApp.renderHistoryTab(container);
        };
      }

      // 绑定删除随笔
      container.querySelectorAll('[data-action="delete-note"]').forEach(function(delBtn) {
        delBtn.onclick = async function(e) {
          e.stopPropagation();
          var nid = delBtn.getAttribute('data-id');
          if (confirm('确定要删除这篇生活感悟手记吗？')) {
            if (window.LifeGameCompanion) {
              await window.LifeGameCompanion.Journal.deleteUserNote(nid);
            }
            window.toast && window.toast('手记已删除');
            LifeGameApp.renderHistoryTab(container);
          }
        };
      });

      // 每周复盘
      var weeklyBtn = container.querySelector('#lg-btn-weekly-review');
      if (weeklyBtn) {
        weeklyBtn.onclick = function() {
          if (window.LifeGameAIUI) {
            window.LifeGameAIUI.showWeeklyReviewModal();
          }
        };
      }
    },

    // ===== 7. 模态弹窗系统 (Modals) =====
    showTaskModal(taskToEdit) {
      var isEdit = Boolean(taskToEdit);
      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      overlay.innerHTML =
        '<div class="lg-modal-card">' +
          '<div class="lg-modal-title">' +
            '<i class="fa-solid fa-scroll"></i>' +
            '<span>' + (isEdit ? '编辑委托任务' : '发布新的现实委托') + '</span>' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">委托标题 *</label>' +
            '<input type="text" class="lg-input" id="modal-task-title" placeholder="如：英语深度精读 45 分钟" value="' + (isEdit ? escapeHtml(taskToEdit.title) : '') + '">' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">任务描述</label>' +
            '<textarea class="lg-textarea" id="modal-task-desc" rows="2" placeholder="详细阐述具体行动内容与目标...">' + (isEdit ? escapeHtml(taskToEdit.desc || '') : '') + '</textarea>' +
          '</div>' +

          '<div style="display:flex;gap:8px;">' +
            '<div class="lg-form-group" style="flex:1;">' +
              '<label class="lg-form-label">任务类别</label>' +
              '<select class="lg-select" id="modal-task-category">' +
                '<option value="daily" ' + (isEdit && taskToEdit.category === 'daily' ? 'selected' : '') + '>日常委托</option>' +
                '<option value="study" ' + (isEdit && taskToEdit.category === 'study' ? 'selected' : '') + '>自习攻坚</option>' +
                '<option value="main" ' + (isEdit && taskToEdit.category === 'main' ? 'selected' : '') + '>主线任务</option>' +
                '<option value="side" ' + (isEdit && taskToEdit.category === 'side' ? 'selected' : '') + '>支线挑战</option>' +
              '</select>' +
            '</div>' +
            '<div class="lg-form-group" style="flex:1;">' +
              '<label class="lg-form-label">难度梯度</label>' +
              '<select class="lg-select" id="modal-task-diff">' +
                '<option value="easy" ' + (isEdit && taskToEdit.difficulty === 'easy' ? 'selected' : '') + '>初级 (+25 EXP)</option>' +
                '<option value="mid" ' + (!isEdit || taskToEdit.difficulty === 'mid' ? 'selected' : '') + '>进阶 (+45 EXP)</option>' +
                '<option value="hard" ' + (isEdit && taskToEdit.difficulty === 'hard' ? 'selected' : '') + '>高难度 (+80 EXP)</option>' +
              '</select>' +
            '</div>' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">排期日期 (同步时光日历)</label>' +
            '<input type="date" class="lg-input" id="modal-task-due" value="' + (isEdit ? taskToEdit.dueDate || '' : getTodayStr()) + '">' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--c-text);">' +
              '<input type="checkbox" id="modal-task-sync-study" ' + ((isEdit && (taskToEdit.studyTodoId || taskToEdit.linkedSource === 'studyRoom')) || (!isEdit && cat === 'study') ? 'checked' : '') + '> ' +
              '<span>同步关联至陪伴自习室待办清单</span>' +
            '</label>' +
          '</div>' +

          '<div class="lg-modal-footer">' +
            '<button type="button" class="lg-btn-secondary" id="modal-btn-cancel">取消</button>' +
            '<button type="button" class="lg-btn-primary" id="modal-btn-save">' + (isEdit ? '保存修改' : '确认发布') + '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      overlay.querySelector('#modal-btn-cancel').onclick = function() {
        overlay.remove();
      };

      overlay.querySelector('#modal-btn-save').onclick = async function() {
        var title = overlay.querySelector('#modal-task-title').value.trim();
        if (!title) {
          window.toast && window.toast('请输入委托标题');
          return;
        }
        var desc = overlay.querySelector('#modal-task-desc').value.trim();
        var cat = overlay.querySelector('#modal-task-category').value;
        var diff = overlay.querySelector('#modal-task-diff').value;
        var due = overlay.querySelector('#modal-task-due').value;
        var syncStudy = overlay.querySelector('#modal-task-sync-study').checked;

        var expMap = { easy: 25, mid: 45, hard: 80 };
        var coinMap = { easy: 10, mid: 20, hard: 40 };
        var statMap = {
          study: { INT: 2, WIL: 1 },
          daily: { PER: 1, WIL: 1 },
          main: { WIL: 2, CHA: 1 },
          side: { INS: 2, PHY: 1 }
        };

        var allTasks = await LifeGameCore.getTasks();

        var targetTask = null;
        if (isEdit) {
          taskToEdit.title = title;
          taskToEdit.desc = desc;
          taskToEdit.category = cat;
          taskToEdit.difficulty = diff;
          taskToEdit.rewardExp = expMap[diff] || 35;
          taskToEdit.rewardCoins = coinMap[diff] || 15;
          taskToEdit.statBonus = statMap[cat] || { WIL: 1 };
          taskToEdit.dueDate = due;
          targetTask = taskToEdit;
        } else {
          var newTask = {
            id: uid('task'),
            title: title,
            desc: desc,
            category: cat,
            difficulty: diff,
            targetMinutes: cat === 'study' ? 30 : 0,
            accumulatedMinutes: 0,
            rewardExp: expMap[diff] || 35,
            rewardCoins: coinMap[diff] || 15,
            statBonus: statMap[cat] || { WIL: 1 },
            status: 'pending',
            dueDate: due,
            linkedSource: syncStudy ? 'studyRoom' : 'user',
            createdAt: Date.now()
          };
          allTasks.unshift(newTask);
          targetTask = newTask;
        }

        await LifeGameCore.saveTasks(allTasks);

        // 跨应用自习室联动处理
        if (window.LifeGameIntegrations) {
          if (syncStudy) {
            await window.LifeGameIntegrations.linkTaskToStudyTodo(targetTask);
          } else if (isEdit && targetTask.studyTodoId) {
            await window.LifeGameIntegrations.unlinkTaskFromStudyTodo(targetTask.id);
          }
        }

        overlay.remove();
        window.toast && window.toast(isEdit ? '委托已更新' : '✨ 新委托发布成功！');
        LifeGameApp.render();
      };
    },

    showHabitModal(habitToEdit) {
      var isEdit = Boolean(habitToEdit);
      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      overlay.innerHTML =
        '<div class="lg-modal-card">' +
          '<div class="lg-modal-title">' +
            '<i class="fa-solid fa-fire"></i>' +
            '<span>' + (isEdit ? '编辑每日习惯' : '新增每日习惯') + '</span>' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">习惯名称 *</label>' +
            '<input type="text" class="lg-input" id="modal-habit-name" placeholder="如：晨读 20 分钟、晚间拉伸" value="' + (isEdit ? escapeHtml(habitToEdit.name) : '') + '">' +
          '</div>' +

          '<div style="display:flex;gap:8px;">' +
            '<div class="lg-form-group" style="flex:1;">' +
              '<label class="lg-form-label">习惯图标</label>' +
              '<select class="lg-select" id="modal-habit-icon">' +
                '<option value="fa-solid fa-fire" ' + (isEdit && habitToEdit.icon === 'fa-solid fa-fire' ? 'selected' : '') + '>🔥 自律热情</option>' +
                '<option value="fa-solid fa-hourglass-half" ' + (isEdit && habitToEdit.icon === 'fa-solid fa-hourglass-half' ? 'selected' : '') + '>⏳ 沉浸专注</option>' +
                '<option value="fa-solid fa-leaf" ' + (!isEdit || habitToEdit.icon === 'fa-solid fa-leaf' ? 'selected' : '') + '>🌿 健康律动</option>' +
                '<option value="fa-solid fa-book" ' + (isEdit && habitToEdit.icon === 'fa-solid fa-book' ? 'selected' : '') + '>📖 阅读研习</option>' +
                '<option value="fa-regular fa-heart" ' + (isEdit && habitToEdit.icon === 'fa-regular fa-heart' ? 'selected' : '') + '>🤍 羁绊温暖</option>' +
                '<option value="fa-solid fa-person-running" ' + (isEdit && habitToEdit.icon === 'fa-solid fa-person-running' ? 'selected' : '') + '>🏃 运动体能</option>' +
              '</select>' +
            '</div>' +
            '<div class="lg-form-group" style="flex:1;">' +
              '<label class="lg-form-label">单次打卡 EXP</label>' +
              '<select class="lg-select" id="modal-habit-exp">' +
                '<option value="20" ' + (!isEdit || habitToEdit.expReward === 20 ? 'selected' : '') + '>+20 EXP</option>' +
                '<option value="25" ' + (isEdit && habitToEdit.expReward === 25 ? 'selected' : '') + '>+25 EXP</option>' +
                '<option value="35" ' + (isEdit && habitToEdit.expReward === 35 ? 'selected' : '') + '>+35 EXP</option>' +
              '</select>' +
            '</div>' +
          '</div>' +

          '<div class="lg-modal-footer">' +
            '<button type="button" class="lg-btn-secondary" id="modal-habit-cancel">取消</button>' +
            '<button type="button" class="lg-btn-primary" id="modal-habit-save">' + (isEdit ? '保存修改' : '确认添加') + '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      overlay.querySelector('#modal-habit-cancel').onclick = function() {
        overlay.remove();
      };

      overlay.querySelector('#modal-habit-save').onclick = async function() {
        var name = overlay.querySelector('#modal-habit-name').value.trim();
        if (!name) {
          window.toast && window.toast('请输入习惯名称');
          return;
        }
        var icon = overlay.querySelector('#modal-habit-icon').value;
        var exp = parseInt(overlay.querySelector('#modal-habit-exp').value, 10) || 25;

        var allHabits = await LifeGameCore.getHabits();
        if (isEdit) {
          habitToEdit.name = name;
          habitToEdit.icon = icon;
          habitToEdit.expReward = exp;
        } else {
          allHabits.push({
            id: uid('habit'),
            name: name,
            icon: icon,
            streak: 0,
            bestStreak: 0,
            lastCheckinDate: '',
            expReward: exp,
            statBonus: { WIL: 1, PER: 1 },
            checkinHistory: []
          });
        }

        await LifeGameCore.saveHabits(allHabits);
        overlay.remove();
        window.toast && window.toast(isEdit ? '习惯已更新' : '🌿 新习惯已添加，坚持就是胜利！');
        LifeGameApp.render();
      };
    },

    async showGoalModal(goalToEdit) {
      var isEdit = Boolean(goalToEdit);
      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      var ms1Title = isEdit && goalToEdit.milestones && goalToEdit.milestones[0] ? goalToEdit.milestones[0].title : '阶段攻坚突破';
      var ms2Title = isEdit && goalToEdit.milestones && goalToEdit.milestones[1] ? goalToEdit.milestones[1].title : '全流程成果验收';

      var availableExams = [];
      if (window.LifeGameIntegrations && typeof window.LifeGameIntegrations.getAvailableExams === 'function') {
        try {
          availableExams = await window.LifeGameIntegrations.getAvailableExams();
        } catch (_) {}
      }

      overlay.innerHTML =
        '<div class="lg-modal-card">' +
          '<div class="lg-modal-title">' +
            '<i class="fa-solid fa-bullseye"></i>' +
            '<span>' + (isEdit ? '编辑长期愿景' : '新建长期愿景') + '</span>' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">愿景标题 *</label>' +
            '<input type="text" class="lg-input" id="modal-goal-title" placeholder="如：雅思 7.5 分突破、健身塑形" value="' + (isEdit ? escapeHtml(goalToEdit.title) : '') + '">' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">关联自习室备考计划 (可选)</label>' +
            '<select class="lg-select" id="modal-goal-exam">' +
              '<option value="">-- 不关联备考计划 --</option>' +
              availableExams.map(function(ex) {
                var isSel = isEdit && goalToEdit.examId === ex.id;
                return '<option value="' + ex.id + '" ' + (isSel ? 'selected' : '') + '>' + escapeHtml(ex.title) + (ex.targetDate ? ' (' + ex.targetDate + ')' : '') + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">愿景描述</label>' +
            '<textarea class="lg-textarea" id="modal-goal-desc" rows="2" placeholder="以专注与自律为梯，奔赴更高远的人生旅途...">' + (isEdit ? escapeHtml(goalToEdit.desc || '') : '') + '</textarea>' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">目标达成日期</label>' +
            '<input type="date" class="lg-input" id="modal-goal-date" value="' + (isEdit ? (goalToEdit.targetDate || '') : (function() { var d = new Date(); d.setDate(d.getDate() + 30); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()) + '">' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">阶段里程碑 1</label>' +
            '<input type="text" class="lg-input" id="modal-goal-ms1" value="' + escapeHtml(ms1Title) + '">' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">阶段里程碑 2</label>' +
            '<input type="text" class="lg-input" id="modal-goal-ms2" value="' + escapeHtml(ms2Title) + '">' +
          '</div>' +

          '<div class="lg-modal-footer">' +
            '<button type="button" class="lg-btn-secondary" id="modal-goal-cancel">取消</button>' +
            '<button type="button" class="lg-btn-primary" id="modal-goal-save">' + (isEdit ? '保存修改' : '确认建立') + '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      var examSelect = overlay.querySelector('#modal-goal-exam');
      if (examSelect) {
        examSelect.onchange = function() {
          var selId = examSelect.value;
          var matched = availableExams.find(function(e) { return String(e.id) === String(selId); });
          if (matched && matched.targetDate) {
            overlay.querySelector('#modal-goal-date').value = matched.targetDate;
          }
        };
      }

      overlay.querySelector('#modal-goal-cancel').onclick = function() {
        overlay.remove();
      };

      overlay.querySelector('#modal-goal-save').onclick = async function() {
        var title = overlay.querySelector('#modal-goal-title').value.trim();
        if (!title) {
          window.toast && window.toast('请输入愿景标题');
          return;
        }
        var desc = overlay.querySelector('#modal-goal-desc').value.trim();
        var targetDate = overlay.querySelector('#modal-goal-date').value;
        var selectedExamId = overlay.querySelector('#modal-goal-exam').value;
        var ms1 = overlay.querySelector('#modal-goal-ms1').value.trim() || '阶段攻坚突破';
        var ms2 = overlay.querySelector('#modal-goal-ms2').value.trim() || '全流程成果验收';

        var allGoals = await LifeGameCore.getGoals();

        var targetGoal = null;
        if (isEdit) {
          goalToEdit.title = title;
          goalToEdit.desc = desc;
          goalToEdit.targetDate = targetDate;
          if (!goalToEdit.milestones) goalToEdit.milestones = [];
          if (goalToEdit.milestones[0]) {
            goalToEdit.milestones[0].title = ms1;
          } else {
            goalToEdit.milestones.push({ id: uid('ms'), title: ms1, done: false, claimed: false, expReward: 80 });
          }
          if (goalToEdit.milestones[1]) {
            goalToEdit.milestones[1].title = ms2;
          } else {
            goalToEdit.milestones.push({ id: uid('ms'), title: ms2, done: false, claimed: false, expReward: 100 });
          }
          targetGoal = goalToEdit;
        } else {
          var newGoal = {
            id: uid('goal'),
            title: title,
            desc: desc || '以专注与自律为梯，奔赴更高远的人生旅途',
            targetDate: targetDate,
            status: 'active',
            milestones: [
              { id: uid('ms'), title: ms1, done: false, claimed: false, expReward: 80 },
              { id: uid('ms'), title: ms2, done: false, claimed: false, expReward: 100 }
            ],
            createdAt: Date.now()
          };
          allGoals.unshift(newGoal);
          targetGoal = newGoal;
        }

        await LifeGameCore.saveGoals(allGoals);

        // 联动备考计划
        if (window.LifeGameIntegrations) {
          if (selectedExamId) {
            await window.LifeGameIntegrations.linkGoalToExam(targetGoal.id, selectedExamId);
          } else if (isEdit && targetGoal.examId) {
            await window.LifeGameIntegrations.unlinkGoalFromExam(targetGoal.id);
          }
        }

        overlay.remove();
        window.toast && window.toast(isEdit ? '愿景已更新' : '🎯 长期愿景建立成功！一步一个脚印前行！');
        LifeGameApp.render();
      };
    },

    // 升级贺卡弹窗 (极简黑白灰仪式感)
    async showLevelUpModal(newLevel) {
      var char = window.RoleWorldbookService ? await window.RoleWorldbookService.getActiveCharacter() : { name: '沈星回' };
      var overlay = document.createElement('div');
      overlay.className = 'lg-levelup-overlay';

      overlay.innerHTML =
        '<div class="lg-levelup-card">' +
          '<div class="lg-levelup-icon"><i class="fa-solid fa-crown"></i></div>' +
          '<div class="lg-levelup-title">LEVEL UP! 升级啦</div>' +
          '<div class="lg-levelup-sub">现实角色等级突破至 LV.' + newLevel + '</div>' +
          '<div class="lg-levelup-stats">' +
            '<div>全属性成长提升</div>' +
            '<div>解锁新称号与更多高阶委托</div>' +
            '<div style="margin-top:6px;font-style:italic;color:var(--c-sub);">' +
              '「' + escapeHtml(char.name || 'Ta') + ' 递上定制饮品，眼底满是为你自豪的光芒。」' +
            '</div>' +
          '</div>' +
          '<button type="button" class="lg-levelup-btn" id="lg-levelup-confirm">继续前行</button>' +
        '</div>';

      document.body.appendChild(overlay);

      overlay.querySelector('#lg-levelup-confirm').onclick = function() {
        overlay.remove();
      };
    },

    // ===== 阶段 4: 多 Char 陪伴授权与主动祝贺设置弹窗 =====
    async showCompanionSettingsModal() {
      if (!window.LifeGameCompanion) return;
      var comp = window.LifeGameCompanion.Companion;
      var config = await comp.getSettings();
      var logs = await comp.loadLogs();
      var allChars = [];
      try {
        if (window.db && db.characters) {
          var list = await db.characters.toArray();
          allChars = list.filter(function(c) { return c && c.type !== 'user'; });
        }
      } catch (_) {}

      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      var html =
        '<div class="lg-modal-card lg-modal-card-lg">' +
          '<div class="lg-modal-title">' +
            '<i class="fa-solid fa-user-shield"></i>' +
            '<span>多 Char 智能陪伴与主动祝贺设置</span>' +
          '</div>' +

          '<div class="lg-notice-box">' +
            '<i class="fa-solid fa-circle-info"></i>' +
            '<span>陪伴机制严格基于真实成长突破（等级突破、主线告捷、愿景达成），默认关闭。需由您自主逐一授权，伴侣才会主动发送祝贺。</span>' +
          '</div>' +

          // 全局总开关
          '<div class="lg-form-group-card">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;">' +
              '<div>' +
                '<div style="font-size:13px;font-weight:700;color:var(--c-text);">人生游戏陪伴总开关</div>' +
                '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">开启后，已授权的角色将在关键成长突破时主动发送祝贺</div>' +
              '</div>' +
              '<label class="lg-toggle-switch">' +
                '<input type="checkbox" id="comp-global-toggle" ' + (config.globalEnabled ? 'checked' : '') + '>' +
                '<span class="lg-toggle-slider"></span>' +
              '</label>' +
            '</div>' +
          '</div>' +

          // 夜间免打扰与自习室保护
          '<div class="lg-form-group-card" style="margin-top:8px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;">' +
              '<div>' +
                '<div style="font-size:13px;font-weight:700;color:var(--c-text);">夜间免打扰时段</div>' +
                '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">在此时间段内，自动静音拦截所有主动陪伴消息</div>' +
              '</div>' +
              '<label class="lg-toggle-switch">' +
                '<input type="checkbox" id="comp-quiet-toggle" ' + (config.quietHoursEnabled ? 'checked' : '') + '>' +
                '<span class="lg-toggle-slider"></span>' +
              '</label>' +
            '</div>' +
            '<div style="display:flex;gap:12px;margin-top:10px;align-items:center;">' +
              '<div style="font-size:12px;color:var(--c-sub);">开始：</div>' +
              '<input type="time" class="lg-input-sm" id="comp-quiet-start" value="' + (config.quietHoursStart || '23:00') + '">' +
              '<div style="font-size:12px;color:var(--c-sub);">结束：</div>' +
              '<input type="time" class="lg-input-sm" id="comp-quiet-end" value="' + (config.quietHoursEnd || '08:00') + '">' +
            '</div>' +
          '</div>' +

          // 离线心意寄语兜底
          '<div class="lg-form-group-card" style="margin-top:8px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;">' +
              '<div>' +
                '<div style="font-size:13px;font-weight:700;color:var(--c-text);">允许离线心意寄语兜底</div>' +
                '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">当 AI 离线或服务异常时，以专属心意寄语送达。关闭后若 AI 失败则不发送</div>' +
              '</div>' +
              '<label class="lg-toggle-switch">' +
                '<input type="checkbox" id="comp-offline-toggle" ' + (config.allowOfflineFallback !== false ? 'checked' : '') + '>' +
                '<span class="lg-toggle-slider"></span>' +
              '</label>' +
            '</div>' +
          '</div>' +

          // 多角色独立授权列表
          '<div style="margin-top:12px;font-size:12px;font-weight:700;color:var(--c-text);display:flex;justify-content:space-between;align-items:center;">' +
            '<span>伴侣独立感知与陪伴授权</span>' +
            '<span style="font-size:11px;color:var(--c-sub);">' + allChars.length + ' 位可选伴侣</span>' +
          '</div>' +

          '<div class="lg-companion-settings-list">';

      if (allChars.length === 0) {
        html += '<div style="padding:16px;text-align:center;font-size:12px;color:var(--c-sub);">暂无可用伴侣角色</div>';
      } else {
        allChars.forEach(function(char) {
          var cid = String(char.id);
          var cConf = comp.getCharSettings(cid, config);

          html +=
            '<div class="lg-char-setting-card" data-cid="' + cid + '">' +
              '<div class="lg-char-setting-top">' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                  '<img src="' + (char.avatar || 'img/char-default.jpg') + '" class="lg-avatar-mini" onerror="this.src=\'img/char-default.jpg\'">' +
                  '<div>' +
                    '<div style="font-size:13px;font-weight:700;color:var(--c-text);">' + escapeHtml(char.name) + '</div>' +
                    '<div style="font-size:10px;color:var(--c-sub);">' + escapeHtml(char.personality || '专属伴侣') + '</div>' +
                  '</div>' +
                '</div>' +
                '<label class="lg-toggle-switch">' +
                  '<input type="checkbox" class="comp-char-toggle" data-cid="' + cid + '" ' + (cConf.enabled ? 'checked' : '') + '>' +
                  '<span class="lg-toggle-slider"></span>' +
                '</label>' +
              '</div>' +

              // 频次与事件范围 (折叠面板)
              '<div class="lg-char-setting-body ' + (cConf.enabled ? '' : 'disabled') + '" id="comp-body-' + cid + '">' +
                '<div style="display:flex;gap:10px;margin-top:8px;">' +
                  '<div style="flex:1;">' +
                    '<label class="lg-form-label">每日上限</label>' +
                    '<input type="number" min="1" max="5" class="lg-input-sm comp-char-daily" data-cid="' + cid + '" value="' + (cConf.dailyLimit || 2) + '">' +
                  '</div>' +
                  '<div style="flex:1;">' +
                    '<label class="lg-form-label">每周上限</label>' +
                    '<input type="number" min="2" max="20" class="lg-input-sm comp-char-weekly" data-cid="' + cid + '" value="' + (cConf.weeklyLimit || 8) + '">' +
                  '</div>' +
                '</div>' +

                '<div style="margin-top:8px;">' +
                  '<label class="lg-form-label">授权感知事件范围</label>' +
                  '<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:11px;">' +
                    '<label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" class="comp-scope-' + cid + '" value="level_up" ' + ((cConf.eventScope || []).indexOf('level_up') !== -1 ? 'checked' : '') + '> 等级破阶</label>' +
                    '<label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" class="comp-scope-' + cid + '" value="main_quest" ' + ((cConf.eventScope || []).indexOf('main_quest') !== -1 ? 'checked' : '') + '> 主线告捷</label>' +
                    '<label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" class="comp-scope-' + cid + '" value="goal_achieved" ' + ((cConf.eventScope || []).indexOf('goal_achieved') !== -1 ? 'checked' : '') + '> 愿景达成</label>' +
                    '<label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" class="comp-scope-' + cid + '" value="study_focus" ' + ((cConf.eventScope || []).indexOf('study_focus') !== -1 ? 'checked' : '') + '> 自习深潜</label>' +
                  '</div>' +
                '</div>' +

                '<div style="margin-top:8px;">' +
                  '<label class="lg-form-label">专属语气偏好 (可选)</label>' +
                  '<input type="text" class="lg-input-sm comp-char-tone" data-cid="' + cid + '" placeholder="如：清冷沉静、温柔宠溺、活泼好奇" value="' + escapeHtml(cConf.customToneHint || '') + '">' +
                '</div>' +
              '</div>' +
            '</div>';
        });
      }

      html +=
          '</div>' +

          // 审计日志预览按钮
          '<div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-size:11px;color:var(--c-sub);">已累计记录 ' + logs.length + ' 条陪伴事件</span>' +
            '<button type="button" class="lg-btn-action-text" id="comp-btn-logs-toggle"><i class="fa-solid fa-list-check"></i> 查看祝贺日志</button>' +
          '</div>' +

          // 审计日志预览容器
          '<div id="comp-logs-container" style="display:none;margin-top:8px;max-height:140px;overflow-y:auto;background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-sm);padding:8px;">' +
            (logs.length === 0 ?
              '<div style="font-size:11px;color:var(--c-sub);text-align:center;padding:10px;">暂无祝贺与触发日志</div>' :
              logs.map(function(l) {
                return (
                  '<div style="font-size:11px;padding:4px 0;border-bottom:1px dashed var(--c-border);display:flex;justify-content:space-between;">' +
                    '<div><strong>' + escapeHtml(l.charName || '伴侣') + '</strong> · ' + escapeHtml(l.eventTitle || l.eventType) + '</div>' +
                    '<div style="color:var(--c-sub);">' + (l.status === 'delivered' ? '已投递微信' : (l.skipReason || l.status)) + '</div>' +
                  '</div>'
                );
              }).join('')) +
          '</div>' +

          '<div class="lg-modal-footer">' +
            '<button type="button" class="lg-btn-secondary" id="comp-btn-cancel">取消</button>' +
            '<button type="button" class="lg-btn-primary" id="comp-btn-save">保存授权配置</button>' +
          '</div>' +
        '</div>';

      overlay.innerHTML = html;
      document.body.appendChild(overlay);

      // 切换角色面板禁用状态
      overlay.querySelectorAll('.comp-char-toggle').forEach(function(tg) {
        tg.onchange = function() {
          var cid = tg.getAttribute('data-cid');
          var bodyEl = overlay.querySelector('#comp-body-' + cid);
          if (bodyEl) {
            if (tg.checked) bodyEl.classList.remove('disabled');
            else bodyEl.classList.add('disabled');
          }
        };
      });

      // 切换日志显示
      var toggleLogBtn = overlay.querySelector('#comp-btn-logs-toggle');
      if (toggleLogBtn) {
        toggleLogBtn.onclick = function() {
          var box = overlay.querySelector('#comp-logs-container');
          if (box) {
            box.style.display = box.style.display === 'none' ? 'block' : 'none';
          }
        };
      }

      overlay.querySelector('#comp-btn-cancel').onclick = function() {
        overlay.remove();
      };

      overlay.querySelector('#comp-btn-save').onclick = async function() {
        var globalEn = overlay.querySelector('#comp-global-toggle').checked;
        var quietEn = overlay.querySelector('#comp-quiet-toggle').checked;
        var quietStart = overlay.querySelector('#comp-quiet-start').value;
        var quietEnd = overlay.querySelector('#comp-quiet-end').value;
        var offlineToggle = overlay.querySelector('#comp-offline-toggle');
        var offlineEn = offlineToggle ? offlineToggle.checked : true;

        config.globalEnabled = globalEn;
        config.quietHoursEnabled = quietEn;
        config.quietHoursStart = quietStart;
        config.quietHoursEnd = quietEnd;
        config.allowOfflineFallback = offlineEn;

        allChars.forEach(function(char) {
          var cid = String(char.id);
          var tg = overlay.querySelector('.comp-char-toggle[data-cid="' + cid + '"]');
          var dailyInput = overlay.querySelector('.comp-char-daily[data-cid="' + cid + '"]');
          var weeklyInput = overlay.querySelector('.comp-char-weekly[data-cid="' + cid + '"]');
          var toneInput = overlay.querySelector('.comp-char-tone[data-cid="' + cid + '"]');

          var scopes = [];
          overlay.querySelectorAll('.comp-scope-' + cid + ':checked').forEach(function(sc) {
            scopes.push(sc.value);
          });

          if (!config.chars) config.chars = {};
          config.chars[cid] = {
            enabled: tg ? tg.checked : false,
            dailyLimit: dailyInput ? (parseInt(dailyInput.value, 10) || 2) : 2,
            weeklyLimit: weeklyInput ? (parseInt(weeklyInput.value, 10) || 8) : 8,
            eventScope: scopes.length > 0 ? scopes : ['level_up', 'main_quest'],
            customToneHint: toneInput ? toneInput.value.trim() : ''
          };
        });

        await comp.saveSettings(config);

        // 如果用户首次授权了伴侣，检查解锁成就「心意授权」
        if (config.globalEnabled && Object.values(config.chars || {}).some(function(c) { return c.enabled; })) {
          if (window.AchievementService) {
            await window.AchievementService.checkAndUnlockBadge('badge_companion_grant');
          }
        }

        overlay.remove();
        window.toast && window.toast('伴侣陪伴授权配置已生效');
        LifeGameApp.render();
      };
    },

    // ===== 阶段 4: 编辑玩家冒险档案弹窗 =====
    async showEditProfileModal(currentProfile) {
      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      overlay.innerHTML =
        '<div class="lg-modal-card">' +
          '<div class="lg-modal-title">' +
            '<i class="fa-solid fa-user-pen"></i>' +
            '<span>编辑玩家现实成长档案</span>' +
          '</div>' +

          '<div class="lg-notice-box">' +
            '<i class="fa-solid fa-shield-halved"></i>' +
            '<span>档案仅用于个性化展示与手账署名。修改档案信息不会影响角色等级、属性或经验数值。</span>' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">冒险者昵称 *</label>' +
            '<input type="text" class="lg-input" id="profile-edit-name" maxlength="20" placeholder="如：初心探索者、极境行者" value="' + escapeHtml(currentProfile.adventurerName || '') + '">' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">个性签名 / 现实座右铭</label>' +
            '<textarea class="lg-textarea" id="profile-edit-bio" rows="2" maxlength="100" placeholder="写一句激励自己的现实座右铭...">' + escapeHtml(currentProfile.bio || '') + '</textarea>' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">头像图片路径 (支持本地相对路径或图片 URL)</label>' +
            '<input type="text" class="lg-input" id="profile-edit-avatar" placeholder="如：img/char-default.jpg" value="' + escapeHtml(currentProfile.avatar || '') + '">' +
          '</div>' +

          '<div class="lg-modal-footer">' +
            '<button type="button" class="lg-btn-secondary" id="profile-edit-cancel">取消</button>' +
            '<button type="button" class="lg-btn-primary" id="profile-edit-save">保存档案</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      overlay.querySelector('#profile-edit-cancel').onclick = function() {
        overlay.remove();
      };

      overlay.querySelector('#profile-edit-save').onclick = async function() {
        var name = overlay.querySelector('#profile-edit-name').value.trim();
        if (!name) {
          window.toast && window.toast('请输入冒险者昵称');
          return;
        }
        var bio = overlay.querySelector('#profile-edit-bio').value.trim();
        var avatar = overlay.querySelector('#profile-edit-avatar').value.trim() || 'img/char-default.jpg';

        if (window.LifeGameCompanion) {
          await window.LifeGameCompanion.PlayerProfile.updateProfile({
            adventurerName: name,
            bio: bio,
            avatar: avatar
          });
        }

        overlay.remove();
        window.toast && window.toast('玩家档案已更新');
        LifeGameApp.render();
      };
    },

    // ===== 阶段 4: 六维属性成长轨迹与分析弹窗 =====
    async showStatHistoryModal(currentStats) {
      var summary = window.LifeGameCompanion ?
        await window.LifeGameCompanion.PlayerProfile.getStatGrowthAnalysis() :
        {};
      var history = window.LifeGameCompanion ?
        await window.LifeGameCompanion.PlayerProfile.getStatHistory() :
        [];

      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      var statMeta = {
        INT: { label: '智力 (INT)', desc: '知识储备与深度求索', icon: 'fa-brain' },
        CHA: { label: '魅力 (CHA)', desc: '真挚共情与温暖表达', icon: 'fa-comments' },
        WIL: { label: '意志 (WIL)', desc: '长线自律与抗压韧性', icon: 'fa-shield-heart' },
        PHY: { label: '体能 (PHY)', desc: '机体活力与现实运动', icon: 'fa-person-running' },
        PER: { label: '敏锐 (PER)', desc: '日程洞察与生活复盘', icon: 'fa-eye' },
        INS: { label: '灵感 (INS)', desc: '创造力与多元泛读', icon: 'fa-lightbulb' }
      };

      var html =
        '<div class="lg-modal-card lg-modal-card-lg">' +
          '<div class="lg-modal-title">' +
            '<i class="fa-solid fa-chart-line"></i>' +
            '<span>六维属性成长轨迹与溯源</span>' +
          '</div>' +

          '<div class="lg-notice-box">' +
            '<i class="fa-solid fa-seedling"></i>' +
            '<span>属性轨迹完全来源于真实日常探索结算。历史若缺少细分流水将真实提示，绝不凭空伪造。</span>' +
          '</div>' +

          // 六维成长综述网格
          '<div class="lg-stat-analysis-grid">';

      Object.keys(statMeta).forEach(function(k) {
        var meta = statMeta[k];
        var s = summary[k] || { totalGained: 0, topSource: '现实自律', recent7Days: 0 };
        var curVal = currentStats[k] || 70;

        html +=
          '<div class="lg-stat-analysis-card">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div style="font-weight:700;font-size:13px;color:var(--c-text);"><i class="fa-solid ' + meta.icon + '"></i> ' + meta.label + '</div>' +
              '<div style="font-size:14px;font-weight:800;color:var(--c-text);">' + curVal + '</div>' +
            '</div>' +
            '<div style="font-size:10px;color:var(--c-sub);margin-top:2px;">' + meta.desc + '</div>' +
            '<div style="margin-top:6px;font-size:11px;color:var(--c-text);background:var(--c-bg);padding:4px 8px;border-radius:var(--r-sm);border:1px solid var(--c-border);">' +
              '<div>主来源：<strong>' + escapeHtml(s.topSource) + '</strong></div>' +
              '<div>近7天增益：<strong>+' + s.recent7Days + '</strong> · 累计轨迹：+' + s.totalGained + '</div>' +
            '</div>' +
          '</div>';
      });

      html +=
          '</div>' +

          // 最近流水
          '<div style="margin-top:14px;font-size:12px;font-weight:700;color:var(--c-text);"><i class="fa-solid fa-clock-rotate-left"></i> 最近属性入账审计明细</div>' +
          '<div style="margin-top:6px;max-height:160px;overflow-y:auto;background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-sm);padding:8px;">';

      if (history.length === 0) {
        html += '<div style="font-size:11px;color:var(--c-sub);text-align:center;padding:14px;">历史累计值，详细来源待补充（完成新委托后自动记账）</div>';
      } else {
        history.slice(0, 30).forEach(function(it) {
          html +=
            '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--c-border);font-size:11px;">' +
              '<div><strong>+' + it.amount + ' ' + it.statKey + '</strong> <span style="color:var(--c-sub);">· ' + escapeHtml(it.sourceTitle) + '</span></div>' +
              '<div style="color:var(--c-hint);">' + formatTimeShort(it.timestamp) + '</div>' +
            '</div>';
        });
      }

      html +=
          '</div>' +

          '<div class="lg-modal-footer">' +
            '<button type="button" class="lg-btn-primary" id="modal-stat-close" style="width:100%;">确认</button>' +
          '</div>' +
        '</div>';

      overlay.innerHTML = html;
      document.body.appendChild(overlay);

      overlay.querySelector('#modal-stat-close').onclick = function() {
        overlay.remove();
      };
    },

    // ===== 阶段 4: 勋章荣誉详情弹窗 =====
    async showBadgeDetailModal(badge) {
      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      var isUnlocked = badge.unlocked;
      var hasTitle = Boolean(badge.titleReward);

      overlay.innerHTML =
        '<div class="lg-modal-card">' +
          '<div style="text-align:center;padding-top:10px;">' +
            '<div class="lg-badge-icon-lg ' + (isUnlocked ? '' : 'locked') + '">' +
              '<i class="' + (badge.icon || 'fa-solid fa-medal') + '"></i>' +
            '</div>' +
            '<div style="font-size:16px;font-weight:700;margin-top:10px;color:var(--c-text);">' + escapeHtml(badge.name) + '</div>' +
            '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">所属分类：' + escapeHtml(badge.category) + ' · 荣誉点 +' + (badge.points || 100) + '</div>' +
          '</div>' +

          '<div style="margin-top:14px;background:var(--c-bg);padding:10px 12px;border-radius:var(--r-sm);border:1px solid var(--c-border);">' +
            '<div style="font-size:11px;font-weight:700;color:var(--c-text);">【达成条件】</div>' +
            '<div style="font-size:12px;color:var(--c-sub);margin-top:4px;">' + escapeHtml(badge.requirement || badge.desc || '完成现实特定自律目标') + '</div>' +
            '<div style="font-size:11px;font-weight:700;color:var(--c-text);margin-top:8px;">【勋章寄语】</div>' +
            '<div style="font-size:12px;color:var(--c-sub);margin-top:4px;">' + escapeHtml(badge.desc || '') + '</div>' +
            (badge.unlockedAt ?
              '<div style="font-size:10px;color:var(--c-hint);margin-top:8px;"><i class="fa-solid fa-clock"></i> 解锁于：' + formatTimeShort(badge.unlockedAt) + '</div>' :
              '<div style="font-size:10px;color:var(--c-hint);margin-top:8px;"><i class="fa-solid fa-lock"></i> 尚未达成，等待现实行动解锁</div>') +
          '</div>' +

          (hasTitle ?
            ('<div style="margin-top:10px;background:var(--c-surface-2);padding:10px;border-radius:var(--r-sm);border:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;">' +
              '<div>' +
                '<div style="font-size:10px;color:var(--c-sub);">专属解锁称号</div>' +
                '<div style="font-size:13px;font-weight:700;color:var(--c-text);">【' + escapeHtml(badge.titleReward) + '】</div>' +
              '</div>' +
              (isUnlocked ?
                '<button type="button" class="lg-btn-secondary" id="badge-modal-equip-title"><i class="fa-solid fa-crown"></i> 立即佩戴</button>' :
                '<span style="font-size:10px;color:var(--c-hint);">解锁后可佩戴</span>') +
            '</div>') : '') +

          '<div class="lg-modal-footer" style="margin-top:14px;">' +
            '<button type="button" class="lg-btn-secondary" id="badge-modal-fav">' +
              (badge.isFavorite ? '<i class="fa-solid fa-star" style="color:var(--c-text);"></i> 取消置顶' : '<i class="fa-regular fa-star"></i> 置顶到主页') +
            '</button>' +
            '<button type="button" class="lg-btn-primary" id="badge-modal-close">关闭</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      overlay.querySelector('#badge-modal-close').onclick = function() {
        overlay.remove();
      };

      var equipBtn = overlay.querySelector('#badge-modal-equip-title');
      if (equipBtn) {
        equipBtn.onclick = async function() {
          if (window.AchievementService) {
            await window.AchievementService.equipTitle(badge.titleReward);
            window.toast && window.toast('👑 已成功佩戴称号：【' + badge.titleReward + '】');
            overlay.remove();
            LifeGameApp.render();
          }
        };
      }

      var favBtn = overlay.querySelector('#badge-modal-fav');
      if (favBtn) {
        favBtn.onclick = async function() {
          if (window.LifeGameCompanion) {
            var nowFav = await window.LifeGameCompanion.Achievements.toggleFavoriteBadge(badge.id);
            window.toast && window.toast(nowFav ? '已设为个人主页代表勋章' : '已取消置顶');
            overlay.remove();
            LifeGameApp.render();
          }
        };
      }
    },

    // ===== 阶段 4: 成长纪念卡全屏赏阅弹窗 =====
    async showMementoCardModal(card) {
      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      var html =
        '<div class="lg-memento-card-modal">' +
          '<div class="lg-memento-card-inner">' +
            '<div class="lg-memento-card-badge"><i class="fa-solid fa-id-badge"></i> 成长纪念卡</div>' +
            '<div class="lg-memento-card-title">' + escapeHtml(card.title) + '</div>' +
            '<div class="lg-memento-card-sub">' + escapeHtml(card.subtitle || '现实成长足迹纪事') + '</div>' +
            '<div class="lg-memento-card-date">' + escapeHtml(card.date || '') + '</div>' +

            (card.levelSnapshot ?
              ('<div class="lg-memento-card-level">达成等级 · LV.' + card.levelSnapshot + '</div>') : '') +

            '<div class="lg-memento-card-quote">「' + escapeHtml(card.quote || '脚踏实地的自律，终将铸就照亮现实的星光。') + '」</div>' +

            (card.charWish ?
              ('<div class="lg-memento-card-wish">' +
                '<div style="font-size:10px;color:var(--c-sub);margin-bottom:2px;">伴侣同行赠言</div>' +
                '<div>' + escapeHtml(card.charWish) + '</div>' +
              '</div>') : '') +

            '<div class="lg-memento-card-footer">' +
              '<button type="button" class="lg-btn-secondary" id="memento-btn-copy"><i class="fa-regular fa-copy"></i> 复制纪事</button>' +
              '<button type="button" class="lg-btn-primary" id="memento-btn-close">珍藏收入</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      overlay.innerHTML = html;
      document.body.appendChild(overlay);

      overlay.querySelector('#memento-btn-close').onclick = function() {
        overlay.remove();
      };

      overlay.querySelector('#memento-btn-copy').onclick = function() {
        var copyText = '【人生游戏成长纪念卡】\n' + card.title + '\n日期：' + card.date + '\n寄语：' + card.quote;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(copyText).then(function() {
            window.toast && window.toast('成长纪念纪事已复制到剪贴板');
          });
        } else {
          prompt('请复制以下纪念卡内容：', copyText);
        }
      };
    },

    // ===== 阶段 4: 新增手账随笔手记弹窗 =====
    showAddJournalNoteModal() {
      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      overlay.innerHTML =
        '<div class="lg-modal-card">' +
          '<div class="lg-modal-title">' +
            '<i class="fa-solid fa-pen-nib"></i>' +
            '<span>写一篇人生冒险感悟手记</span>' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">手记标题 (可选)</label>' +
            '<input type="text" class="lg-input" id="journal-note-title" placeholder="如：攻克雅思精读后的静谧午后">' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">生活感悟与自律手记 *</label>' +
            '<textarea class="lg-textarea" id="journal-note-content" rows="4" placeholder="记录下当下现实里的微小胜利、思考或与伴侣同行的点滴心境..."></textarea>' +
          '</div>' +

          '<div class="lg-form-group">' +
            '<label class="lg-form-label">标签 (逗号分隔)</label>' +
            '<input type="text" class="lg-input" id="journal-note-tags" placeholder="生活手记, 深度专注, 自我超越">' +
          '</div>' +

          '<div class="lg-modal-footer">' +
            '<button type="button" class="lg-btn-secondary" id="journal-note-cancel">取消</button>' +
            '<button type="button" class="lg-btn-primary" id="journal-note-save">录入手账</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      overlay.querySelector('#journal-note-cancel').onclick = function() {
        overlay.remove();
      };

      overlay.querySelector('#journal-note-save').onclick = async function() {
        var content = overlay.querySelector('#journal-note-content').value.trim();
        if (!content) {
          window.toast && window.toast('请输入手记内容');
          return;
        }
        var title = overlay.querySelector('#journal-note-title').value.trim();
        var rawTags = overlay.querySelector('#journal-note-tags').value.trim();
        var tags = rawTags ? rawTags.split(/[,，]/).map(function(t) { return t.trim(); }).filter(Boolean) : ['生活感悟'];

        if (window.LifeGameCompanion) {
          await window.LifeGameCompanion.Journal.addUserNote(title, content, tags);
        }

        overlay.remove();
        window.toast && window.toast('✨ 随笔已收入人生冒险手账');
        LifeGameApp.render();
      };
    }
  };

  // ===== 8. 注册全域联动监听 (WanwanSharedHub) =====
  if (window.WanwanSharedHub) {
    // 监听自习室单次专注完成
    window.WanwanSharedHub.on('FOCUS_SESSION_COMPLETED', async function(payload) {
      console.log('[LifeGame] Received FOCUS_SESSION_COMPLETED in real-time');
      var duration = payload.durationMinutes || 0;
      if (duration > 0) {
        var tasks = await LifeGameCore.getTasks();
        var studyTask = tasks.find(function(t) { return t.category === 'study' && t.status === 'pending'; });
        if (studyTask) {
          var targetMins = studyTask.targetMinutes || 30;
          studyTask.accumulatedMinutes = (studyTask.accumulatedMinutes || 0) + duration;
          if (studyTask.accumulatedMinutes >= targetMins) {
            studyTask.status = 'completed';
            studyTask.completedAt = Date.now();
          }
          await LifeGameCore.saveTasks(tasks);
        }
      }
      var page = document.getElementById('life-game-page');
      if (page) {
        LifeGameApp.render();
      }
    });

    window.WanwanSharedHub.on('LIFEGAME_STATE_CHANGED', function() {
      var page = document.getElementById('life-game-page');
      if (page) {
        LifeGameApp.render();
      }
    });
  }

  // ===== 9. 挂载到全局 =====
  global.LifeGameCore = LifeGameCore;
  global.LifeGameApp = LifeGameApp;
  global.showLifeGamePage = function(options) {
    LifeGameApp.open(options);
  };
  global.showLifeGameApp = global.showLifeGamePage;

})(typeof window !== 'undefined' ? window : this);
