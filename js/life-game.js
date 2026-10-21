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
          return d.toISOString().slice(0, 10);
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
          return d.toISOString().slice(0, 10);
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

        for (var i = 0; i < srRecords.length; i++) {
          var rec = srRecords[i];
          var recId = rec.id || ('sr_rec_' + (rec.timestamp || rec.date || i));
          if (settledList.indexOf(recId) === -1) {
            var duration = Number(rec.durationMinutes) || 0;
            if (duration > 0) {
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
          }
        }

        if (newlySettledMinutes === 0) {
          return { syncedCount: 0, totalMinutes: 0, expGranted: 0, msg: '所有专注记录已完成结算，无需重复入账' };
        }

        // 推进自习相关委托任务
        var tasks = await this.getTasks();
        var taskChanged = false;
        var pendingStudyTask = tasks.find(function(t) { return t.category === 'study' && t.status === 'pending'; });
        if (pendingStudyTask) {
          var targetMins = pendingStudyTask.targetMinutes || 30;
          pendingStudyTask.accumulatedMinutes = (pendingStudyTask.accumulatedMinutes || 0) + newlySettledMinutes;
          if (pendingStudyTask.accumulatedMinutes >= targetMins) {
            pendingStudyTask.status = 'completed';
            pendingStudyTask.completedAt = Date.now();
          }
          taskChanged = true;
        }
        if (taskChanged) {
          await this.saveTasks(tasks);
        }

        return {
          syncedCount: newlySettledCount,
          totalMinutes: newlySettledMinutes,
          expGranted: totalExpGranted,
          coinsGranted: totalCoinsGranted,
          msg: '成功同步 ' + newlySettledCount + ' 条记录（共 ' + newlySettledMinutes + ' 分钟），入账 +' + totalExpGranted + ' EXP！'
        };
      } finally {
        delete _inFlightClaimLocks[lockKey];
      }
    }
  };

  // ===== 5. UI 渲染与交互架构 (LifeGameApp) =====
  var _activeTab = 'profile'; // profile | tasks | habits | goals | achievements | history
  var _taskFilter = 'all';    // all | pending | completed | study

  var LifeGameApp = {
    async open(options) {
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

    close() {
      var el = document.getElementById('life-game-page');
      if (el) el.remove();
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

      var html =
        // 1. 顶部 Header (与自习室 .sr-header 一致)
        '<header class="lg-header">' +
          '<div class="lg-header-left">' +
            '<button type="button" class="lg-back-btn" id="lg-btn-back">' +
              '<i class="fa fa-angle-left"></i><span>桌面</span>' +
            '</button>' +
            '<div class="lg-title-group">' +
              '<div class="lg-icon-mini"><i class="fa-solid fa-gamepad"></i></div>' +
              '<div class="lg-header-title">人生游戏</div>' +
            '</div>' +
          '</div>' +
          '<div class="lg-header-right">' +
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
          '<div class="lg-tab-item ' + (_activeTab === 'achievements' ? 'active' : '') + '" data-tab="achievements"><i class="fa-solid fa-trophy"></i> 成就馆</div>' +
          '<div class="lg-tab-item ' + (_activeTab === 'history' ? 'active' : '') + '" data-tab="history"><i class="fa-solid fa-clock-rotate-left"></i> 成长记录</div>' +
        '</nav>' +

        // 4. 内容主体滚动区域
        '<main class="lg-content" id="lg-tab-content">' +
          // 异步加载对应 Tab 内容
        '</main>';

      page.innerHTML = html;

      // 绑定返回桌面
      var backBtn = page.querySelector('#lg-btn-back');
      if (backBtn) {
        backBtn.onclick = function() {
          LifeGameApp.close();
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

    // ===== Tab 1: 角色档案与六维属性 =====
    async renderProfileTab(container, lifeState, reqExp, expPercent, char) {
      var stats = lifeState.stats || { INT: 74, CHA: 82, WIL: 68, PHY: 62, PER: 88, INS: 91 };
      var companionQuote = (char.name || 'Ta') + ' 正在身边注视着你的现实点滴。每一个细微自律的脚印，都会汇聚成闪闪发光的超维力量。';

      var html =
        // 角色英雄卡
        '<section class="lg-profile-hero">' +
          '<div class="lg-profile-top">' +
            '<div class="lg-profile-char">' +
              '<div class="lg-avatar-box">' +
                '<img class="lg-avatar-img" src="' + (char.avatar || 'img/char-default.jpg') + '" alt="Avatar" onerror="this.src=\'img/char-default.jpg\'">' +
              '</div>' +
              '<div class="lg-profile-names">' +
                '<div class="lg-user-name">玩家现实成长档案</div>' +
                '<div class="lg-user-title">称号 · ' + escapeHtml(lifeState.title || '见习探索者') + '</div>' +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div class="lg-level-large">LV.' + lifeState.level + '</div>' +
              '<div class="lg-level-sub">Level Status</div>' +
            '</div>' +
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

          // 六维成长属性网格 (带灰度进度条，黑白灰规范)
          '<div class="lg-section-title" style="margin-top:6px;"><i class="fa-solid fa-chart-pie"></i> 六维成长属性 (Hex-Stats)</div>' +
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

        // 伴侣同行卡片
        '<section class="lg-companion-card">' +
          '<img class="lg-companion-avatar" src="' + (char.avatar || 'img/char-default.jpg') + '" onerror="this.src=\'img/char-default.jpg\'">' +
          '<div class="lg-companion-body">' +
            '<div class="lg-companion-title"><i class="fa-regular fa-heart"></i> 伴侣同行 · ' + escapeHtml(char.name || 'Ta') + '</div>' +
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

      var todayAiBtn = container.querySelector('#lg-btn-today-ai');
      if (todayAiBtn) {
        todayAiBtn.onclick = function() {
          if (window.LifeGameAIUI) {
            window.LifeGameAIUI.showTodayRecommendModal();
          }
        };
      }

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
              window.LifeGameIntegrations.navigateToStudyRoom({ tab: 'duo', targetTodoId: t.studyTodoId });
            }
            return;
          } else if (action === 'nav-tc') {
            if (window.LifeGameIntegrations) {
              window.LifeGameIntegrations.navigateToTimeCalendar({ tab: 'schedule', date: t.dueDate });
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
              window.LifeGameIntegrations.navigateToStudyRoom({ tab: 'resources' });
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
              }
            } else {
              window.toast && window.toast(guard.msg || '里程碑已达成');
            }

            LifeGameApp.render();
          }
        };
      });
    },

    // ===== Tab 5: 成就馆与称号佩戴 =====
    async renderAchievementsTab(container) {
      var achState = window.AchievementService ? await window.AchievementService.getState() : { equippedTitle: '初涉尘寰的旅人', badges: [], totalScore: 0 };
      var badges = achState.badges || [];

      var html =
        '<div class="lg-section-header">' +
          '<div class="lg-section-title"><i class="fa-solid fa-trophy"></i> 荣誉勋章与佩戴头衔</div>' +
          '<div style="font-size:11px;font-weight:600;color:var(--c-sub);"><i class="fa-solid fa-award"></i> 总荣誉积分: ' + (achState.totalScore || 0) + '</div>' +
        '</div>' +

        // 当前穿戴头衔
        '<div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--r-md);padding:14px;display:flex;align-items:center;justify-content:space-between;box-shadow:var(--shadow-sm);">' +
          '<div>' +
            '<div style="font-size:11px;color:var(--c-sub);">当前佩戴头衔</div>' +
            '<div style="font-size:14px;font-weight:700;color:var(--c-text);margin-top:2px;">【' + escapeHtml(achState.equippedTitle || '见习探索者') + '】</div>' +
          '</div>' +
          '<button type="button" class="lg-btn-secondary" id="lg-btn-change-title">更换头衔</button>' +
        '</div>' +

        // 勋章徽章卡片网格
        '<div class="lg-achievements-grid" style="margin-top:10px;">';

      badges.forEach(function(badge) {
        var isUnlocked = badge.unlocked;

        html +=
          '<div class="lg-badge-card ' + (isUnlocked ? '' : 'locked') + '">' +
            '<div class="lg-badge-icon"><i class="' + (badge.icon || 'fa-solid fa-medal') + '"></i></div>' +
            '<div class="lg-badge-name">' + escapeHtml(badge.name) + '</div>' +
            '<div class="lg-badge-desc">' + escapeHtml(badge.desc) + '</div>' +
            '<div class="lg-badge-points">+' + (badge.points || 100) + ' 荣誉点</div>' +
            (isUnlocked ? '<span style="font-size:10px;color:var(--c-text);"><i class="fa-solid fa-check"></i> 已解锁</span>' : '<span style="font-size:10px;color:var(--c-hint);">未达成</span>') +
          '</div>';
      });

      html += '</div>';
      container.innerHTML = html;

      var changeTitleBtn = container.querySelector('#lg-btn-change-title');
      if (changeTitleBtn) {
        changeTitleBtn.onclick = async function() {
          var titles = ['初涉尘寰的旅人', '自律进阶学者', '敏锐深空探秘家', '博识大贤者', '超维传奇缔造者'];
          var selected = prompt('请选择想要佩戴的头衔序号：\n1. 初涉尘寰的旅人\n2. 自律进阶学者\n3. 敏锐深空探秘家\n4. 博识大贤者\n5. 超维传奇缔造者');
          var idx = parseInt(selected, 10) - 1;
          if (idx >= 0 && idx < titles.length) {
            var newT = titles[idx];
            if (window.AchievementService) {
              await window.AchievementService.equipTitle(newT);
            }
            window.toast && window.toast('👑 已成功佩戴头衔：【' + newT + '】');
            LifeGameApp.render();
          }
        };
      }
    },

    // ===== Tab 6: 成长记录 (Growth Log) =====
    async renderHistoryTab(container) {
      var history = await LifeGameCore.getTasksHistory();
      var settledIds = await LifeGameCore.getSettledStudyRecordIds();
      var habits = await LifeGameCore.getHabits();
      var totalStreaks = habits.reduce(function(sum, h) { return sum + (h.streak || 0); }, 0);

      var html =
        '<div class="lg-section-header">' +
          '<div class="lg-section-title"><i class="fa-solid fa-clock-rotate-left"></i> 现实成长与行动足迹</div>' +
          '<button type="button" class="lg-btn-ai" id="lg-btn-weekly-review"><i class="fa-solid fa-feather"></i> 每周成长复盘</button>' +
        '</div>' +

        // 概览卡片 (与自习室报告 .sr-report-grid 一致)
        '<div class="lg-history-stats-grid">' +
          '<div class="lg-history-stat-card">' +
            '<div class="lg-history-stat-val">' + history.length + '</div>' +
            '<div class="lg-history-stat-lbl">完成委托</div>' +
          '</div>' +
          '<div class="lg-history-stat-card">' +
            '<div class="lg-history-stat-val">' + settledIds.length + '</div>' +
            '<div class="lg-history-stat-lbl">自习核销</div>' +
          '</div>' +
          '<div class="lg-history-stat-card">' +
            '<div class="lg-history-stat-val">' + totalStreaks + '</div>' +
            '<div class="lg-history-stat-lbl">习惯连胜</div>' +
          '</div>' +
        '</div>' +

        '<div class="lg-section-title" style="margin-top:6px;"><i class="fa-solid fa-list-check"></i> 最近奖励审计流水</div>' +
        '<div class="lg-history-timeline">';

      if (history.length === 0) {
        html += '<div style="text-align:center;padding:40px 20px;color:var(--c-sub);font-size:12px;"><i class="fa-regular fa-calendar-check" style="font-size:24px;margin-bottom:8px;display:block;"></i>暂无完成记录，去达成你的第一个委托吧！</div>';
      } else {
        history.forEach(function(item) {
          html +=
            '<div class="lg-history-item">' +
              '<div class="lg-history-item-left">' +
                '<div class="lg-history-item-icon"><i class="fa-solid fa-check"></i></div>' +
                '<div>' +
                  '<div class="lg-history-item-title">' + escapeHtml(item.title) + '</div>' +
                  '<div class="lg-history-item-time">' + formatTimeShort(item.claimedAt || item.completedAt) + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="lg-history-item-exp">+' + (item.expGranted || 0) + ' EXP</div>' +
            '</div>';
        });
      }

      html += '</div>';
      container.innerHTML = html;

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
            '<input type="date" class="lg-input" id="modal-goal-date" value="' + (isEdit ? (goalToEdit.targetDate || '') : (function() { var d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })()) + '">' +
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
