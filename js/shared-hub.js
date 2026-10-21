// shared-hub.js — 阶段 6｜共享数据与全域联动枢纽 (WanwanSharedHub)
// 核心原则：统一数据源 (Single Source of Truth) + 全域事件总线 + 防刷机制 + 零孤岛联动
// 数据源对照：
// - 角色身份、人设、关系：原角色系统 / 世界书
// - 日程、日期、倒计时：时光日历 (双向编辑同步，区分删除事件 vs 取消倒计时展示)
// - 任务、打卡、经验、等级：人生游戏 (每日上限、去重、防刷)
// - 金币账户、背包与交易：共享经济服务 (人生游戏、商城、家园、农场统一记账)
// - 徽章、碎片、图鉴：成就馆 (全域事件自动判定，解锁弹窗与头衔佩戴)
// - 学习资料、索引、错题：陪伴自习室 (Char 答疑、学习助手直接使用)
// - 浏览器标签、收藏、历史：弯弯浏览器 (独立浏览器与自习室共享)
// - 恋爱事件与纪念日来源：恋爱记 (双向联动日历与成就馆)
// - 农场经营数据：弯弯农场 (产出入背包、联动任务与成就)
// - IF 世界状态：平行来信独立存档 (严格隔离，仅 IF 读取，主线不得直接读取)

(function(global) {
  'use strict';

  // ===== 1. 基础持久化助手 (优先 Dexie db.config，降级 localStorage) =====
  async function loadStorage(key, fallback) {
    try {
      if (window.db && db.config) {
        var row = await db.config.get(key);
        if (row && row.value !== undefined) return row.value;
      }
    } catch (e) {
      console.warn('[SharedHub] Dexie get error for key:', key, e);
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
      console.warn('[SharedHub] Dexie put error for key:', key, e);
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function uid(prefix) {
    return (prefix || 'hub') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function getTodayStr() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  // ====================================================
  // 2. 防刷安全舱 (RewardGuard: 统一奖励规则、每日上限、事件去重)
  // ====================================================
  var STORAGE_REWARD_GUARD = 'wanwan_reward_guard_v2';
  var DAILY_LIMITS = {
    MAX_EXP_PER_DAY: 600,
    MAX_COINS_PER_DAY: 300,
    MAX_FOCUS_REWARDED_MINS: 240 // 每日最多获得 240 分钟时长的经验金币折算
  };

  var _guardQueue = Promise.resolve();

  var RewardGuard = {
    async getTodayRecord() {
      var today = getTodayStr();
      var all = await loadStorage(STORAGE_REWARD_GUARD, {});
      if (!all._globalEventIds) {
        all._globalEventIds = [];
      }
      if (!all[today]) {
        all[today] = {
          date: today,
          expEarned: 0,
          coinsEarned: 0,
          focusMinutesRewarded: 0,
          processedEventIds: []
        };
        await saveStorage(STORAGE_REWARD_GUARD, all);
      }
      return { all: all, record: all[today] };
    },

    // 串行队列防止高并发重入
    async validateAndGrant(eventId, expRequested, coinsRequested, focusMins) {
      var self = this;
      return new Promise(function(resolve, reject) {
        _guardQueue = _guardQueue.then(async function() {
          try {
            var res = await self._doValidateAndGrant(eventId, expRequested, coinsRequested, focusMins);
            resolve(res);
          } catch (e) {
            reject(e);
          }
        });
      });
    },

    async _doValidateAndGrant(eventId, expRequested, coinsRequested, focusMins) {
      var ctx = await this.getTodayRecord();
      var rec = ctx.record;
      var all = ctx.all;

      // 1. 重复事件去重 (同时核查今日与全域持久化事件池)
      if (eventId) {
        if (rec.processedEventIds.indexOf(eventId) !== -1 || (all._globalEventIds && all._globalEventIds.indexOf(eventId) !== -1)) {
          return {
            allowed: false,
            reason: 'DUPLICATE_EVENT',
            expGranted: 0,
            coinsGranted: 0,
            msg: '该事件奖励已领取，不可重复入账'
          };
        }
      }

      // 2. 每日上限裁切
      var expAvailable = Math.max(0, DAILY_LIMITS.MAX_EXP_PER_DAY - rec.expEarned);
      var coinsAvailable = Math.max(0, DAILY_LIMITS.MAX_COINS_PER_DAY - rec.coinsEarned);

      var actualExp = Math.min(expRequested || 0, expAvailable);
      var actualCoins = Math.min(coinsRequested || 0, coinsAvailable);

      rec.expEarned += actualExp;
      rec.coinsEarned += actualCoins;
      if (focusMins) {
        rec.focusMinutesRewarded += focusMins;
      }
      if (eventId) {
        rec.processedEventIds.push(eventId);
        if (!all._globalEventIds) all._globalEventIds = [];
        if (all._globalEventIds.indexOf(eventId) === -1) {
          all._globalEventIds.push(eventId);
        }
      }

      await saveStorage(STORAGE_REWARD_GUARD, ctx.all);

      return {
        allowed: true,
        expGranted: actualExp,
        coinsGranted: actualCoins,
        isCapped: (actualExp < expRequested || actualCoins < coinsRequested),
        todayExpTotal: rec.expEarned,
        todayCoinsTotal: rec.coinsEarned
      };
    }
  };

  // ====================================================
  // 3. 全域统一事件总线 (WanwanSharedHub)
  // ====================================================
  var _eventListeners = {};

  var WanwanSharedHub = {
    RewardGuard: RewardGuard,

    on: function(event, callback) {
      if (!_eventListeners[event]) _eventListeners[event] = [];
      _eventListeners[event].push(callback);
    },

    off: function(event, callback) {
      if (!_eventListeners[event]) return;
      _eventListeners[event] = _eventListeners[event].filter(function(cb) { return cb !== callback; });
    },

    emit: async function(event, data) {
      console.log('[WanwanSharedHub Emit]', event, data);
      var list = _eventListeners[event] || [];
      for (var i = 0; i < list.length; i++) {
        try {
          await list[i](data);
        } catch (err) {
          console.error('[WanwanSharedHub Listener Error]', event, err);
        }
      }

      // 如果有内嵌到 iframe，支持向父级/跨窗广播
      if (window.parent && window.parent !== window) {
        try {
          window.parent.postMessage({
            source: 'WANWAN_SHARED_HUB',
            event: event,
            data: data
          }, '*');
        } catch (_) {}
      }
    }
  };

  // ====================================================
  // 4. 角色身份、人设、关系服务 (RoleWorldbookService)
  // 唯一来源：原角色系统 / 世界书
  // ====================================================
  var RoleWorldbookService = {
    async getActiveCharacter() {
      // 优先从伴侣选择或原系统读取
      try {
        if (window.db && db.characters) {
          var all = await db.characters.toArray();
          var companion = all.find(function(c) { return c.isCompanion; }) ||
                          all.find(function(c) { return c.type === 'char'; }) ||
                          all[0];
          if (companion) return companion;
        }
      } catch (e) {
        console.warn('getActiveCharacter error:', e);
      }
      return {
        id: 1,
        name: '沈星回',
        avatar: 'img/char-default.jpg',
        description: '光芒穿过夜空，落向你的身边。性格清澈沉静、温柔专注。',
        personality: '温柔、坚定、专注'
      };
    },

    async getCharacterById(charId) {
      try {
        if (window.db && db.characters) {
          var char = await db.characters.get(Number(charId) || charId);
          if (char) return char;
        }
      } catch (_) {}
      return this.getActiveCharacter();
    },

    // 根据角色人设与当前陪伴模式生成专注完成的专属反馈
    generateFocusFeedback(char, mode, durationMinutes, taskName) {
      var cName = (char && char.name) || 'Ta';
      var isLong = durationMinutes >= 40;
      var tName = taskName || '学习任务';

      if (mode === 'quiet') {
        // 安静陪伴：不突兀打断，仅通过体贴动作与静默欣慰回应
        return {
          type: 'action',
          speaker: cName,
          content: cName + ' 静静地递上一杯温热的红茶，唇角微弯，在便利贴上轻轻写下：「' + durationMinutes + '分钟的高效专注，辛苦啦。」'
        };
      } else if (mode === 'gentle') {
        // 温柔鼓励：专注时安静，结束时温柔关怀、提醒放松
        var quotes = [
          '「' + durationMinutes + '分钟达成！刚才你全神贯注写「' + tName + '」的样子真的特别迷人。快闭目养神休息一下吧，有我在呢。」',
          '「太棒啦，一眨眼完成了 ' + durationMinutes + ' 分钟的专注。转转脖子，我们一起看看窗外的风景吧~」',
          '「滴答！专注时间圆满收官。看你学得这么认真，我也觉得浑身充满了力量。」'
        ];
        return {
          type: 'dialogue',
          speaker: cName,
          content: quotes[Math.floor(Math.random() * quotes.length)]
        };
      } else {
        // 互动学习：可答疑、抽查、探讨
        var interactiveQuotes = [
          '「' + durationMinutes + ' 分钟深度学习完成！刚刚钻研的「' + tName + '」感觉怎么样？要不要我从刚才的资料库里抽一道重点题考考你？」',
          '「漂亮的连击！45分钟高强度攻坚结束。趁热打铁，有哪处疑难细节需要我帮你再梳理一遍吗？」',
          '「专注力拉满！知识点已经全在脑海里安家了吧？去喝口水，待会儿我们再继续冲刺下一章！」'
        ];
        return {
          type: 'dialogue',
          speaker: cName,
          content: interactiveQuotes[Math.floor(Math.random() * interactiveQuotes.length)]
        };
      }
    }
  };

  // ====================================================
  // 5. 时光日历服务 (TimeCalendarService)
  // 唯一来源：时光日历统一事件数据；双向编辑同步；倒计时只是事件的一种展示方式
  // 删除时严格区分「完全删除事件」与「取消倒计时展示」
  // 自动与恋爱记纪念日双向同步
  // ====================================================
  var STORAGE_CALENDAR_EVENTS = 'time_calendar_events_v2';

  var TimeCalendarService = {
    async getAllEvents() {
      var events = await loadStorage(STORAGE_CALENDAR_EVENTS, null);
      if (!events) {
        // 首次初始化默认标准事件
        var today = getTodayStr();
        events = [
          {
            id: 'ev_anniversary_love',
            title: '我们的相恋纪念日',
            date: today,
            time: '00:00',
            type: 'anniversary',
            sourceApp: 'loveDiary',
            showCountdown: true,
            repeat: 'yearly',
            note: '相濡以沫，心动如初。恋爱记同步来源。',
            createdAt: Date.now()
          },
          {
            id: 'ev_study_daily',
            title: '陪伴自习室每日深度专注',
            date: today,
            time: '20:00',
            type: 'schedule',
            sourceApp: 'studyRoom',
            showCountdown: false,
            repeat: 'daily',
            note: '保持良好自律节奏，每日 45 分钟',
            createdAt: Date.now()
          },
          {
            id: 'ev_birthday_char',
            title: 'Ta 的特别生日派对',
            date: (function() {
              var d = new Date();
              d.setDate(d.getDate() + 12);
              return d.toISOString().slice(0, 10);
            })(),
            time: '18:30',
            type: 'anniversary',
            sourceApp: 'timeCalendar',
            showCountdown: true,
            repeat: 'yearly',
            note: '准备充满心意的手写书信与定制蛋糕',
            createdAt: Date.now()
          }
        ];
        await saveStorage(STORAGE_CALENDAR_EVENTS, events);
      }

      // 与恋爱记双向读取补充
      await this._syncFromLoveDiary(events);

      return events;
    },

    async _syncFromLoveDiary(events) {
      try {
        if (window.db && db.config) {
          var row = await db.config.get('coupleSpaceSettings');
          if (row && row.value && row.value.spaces) {
            var activeCharId = row.value.activeCharId;
            var space = row.value.spaces[activeCharId];
            if (space && space.anniversaryDate) {
              var found = events.find(function(e) { return e.sourceApp === 'loveDiary' && e.type === 'anniversary'; });
              if (found) {
                if (found.date !== space.anniversaryDate) {
                  found.date = space.anniversaryDate;
                  await saveStorage(STORAGE_CALENDAR_EVENTS, events);
                }
              }
            }
          }
        }
      } catch (_) {}
    },

    async addEvent(eventData) {
      var events = await this.getAllEvents();
      var newEvent = Object.assign({
        id: uid('cal_ev'),
        title: '新日程',
        date: getTodayStr(),
        time: '12:00',
        type: 'schedule',
        sourceApp: 'timeCalendar',
        showCountdown: false,
        repeat: 'none',
        note: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }, eventData);

      events.unshift(newEvent);
      await saveStorage(STORAGE_CALENDAR_EVENTS, events);

      WanwanSharedHub.emit('CALENDAR_EVENT_CHANGED', { action: 'add', event: newEvent });
      return newEvent;
    },

    async updateEvent(id, patch) {
      var events = await this.getAllEvents();
      var idx = events.findIndex(function(e) { return e.id === id; });
      if (idx === -1) return null;

      var old = events[idx];
      var updated = Object.assign({}, old, patch, { updatedAt: Date.now() });
      events[idx] = updated;
      await saveStorage(STORAGE_CALENDAR_EVENTS, events);

      // 如果修改了恋爱记来源的纪念日，双向同步回恋爱记
      if (updated.sourceApp === 'loveDiary' && patch.date) {
        this._syncToLoveDiary(updated.date);
      }

      WanwanSharedHub.emit('CALENDAR_EVENT_CHANGED', { action: 'update', event: updated });
      return updated;
    },

    // 核心规则：仅取消倒计时展示（保留原日程事件）
    async toggleCountdownDisplay(id, showCountdown) {
      var updated = await this.updateEvent(id, { showCountdown: Boolean(showCountdown) });
      WanwanSharedHub.emit('CALENDAR_EVENT_CHANGED', { action: 'toggle_countdown', event: updated, showCountdown: showCountdown });
      return updated;
    },

    // 核心规则：彻底删除日程事件
    async deleteEvent(id) {
      var events = await this.getAllEvents();
      var deleted = events.find(function(e) { return e.id === id; });
      var remaining = events.filter(function(e) { return e.id !== id; });
      await saveStorage(STORAGE_CALENDAR_EVENTS, remaining);

      WanwanSharedHub.emit('CALENDAR_EVENT_CHANGED', { action: 'delete', eventId: id, deleted: deleted });
      return true;
    },

    async _syncToLoveDiary(newAnniversaryDate) {
      try {
        if (window.db && db.config) {
          var row = await db.config.get('coupleSpaceSettings');
          if (row && row.value && row.value.spaces) {
            var activeCharId = row.value.activeCharId;
            if (activeCharId && row.value.spaces[activeCharId]) {
              row.value.spaces[activeCharId].anniversaryDate = newAnniversaryDate;
              await db.config.put({ key: 'coupleSpaceSettings', value: row.value });
            }
          }
        }
      } catch (_) {}
    },

    getCountdownList(events) {
      var today = new Date(getTodayStr());
      return events
        .filter(function(e) { return e.showCountdown; })
        .map(function(e) {
          var target = new Date(e.date);
          var diffMs = target.getTime() - today.getTime();
          var diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          return Object.assign({}, e, {
            countdownDays: diffDays,
            isPassed: diffDays < 0,
            isToday: diffDays === 0
          });
        });
    }
  };

  // ====================================================
  // 6. 人生游戏服务 (LifeGameService)
  // 唯一来源：人生游戏状态库；管理任务、打卡、经验、六维属性与等级
  // 联动自习室专注、成就馆判定与社区展示；受防刷每日上限保护
  // ====================================================
  var STORAGE_LIFEGAME_STATE = 'life_game_state_v2';

  var LifeGameService = {
    async getState() {
      var state = await loadStorage(STORAGE_LIFEGAME_STATE, null);
      var today = getTodayStr();

      if (!state) {
        state = {
          level: 3,
          exp: 650,
          title: '见习探索者',
          stats: {
            INT: 74, // 智力
            CHA: 82, // 魅力
            WIL: 68, // 意志
            PHY: 62, // 体能
            PER: 88, // 敏锐
            INS: 91  // 灵感
          },
          lastResetDate: today,
          quests: this._generateDefaultQuests(today)
        };
        await saveStorage(STORAGE_LIFEGAME_STATE, state);
      } else if (state.lastResetDate !== today) {
        // 每日重置日常任务
        state.lastResetDate = today;
        state.quests = this._generateDefaultQuests(today);
        await saveStorage(STORAGE_LIFEGAME_STATE, state);
      }
      return state;
    },

    _generateDefaultQuests(today) {
      return [
        {
          id: 'quest_study_focus_30',
          title: '陪伴自习室专注满 30/45 分钟',
          desc: '与角色在自习室完成一次深度学习攻坚',
          target: 30,
          current: 0,
          rewardExp: 50,
          rewardCoins: 25,
          statBonus: { INT: 2, WIL: 1 },
          done: false,
          claimed: false,
          date: today
        },
        {
          id: 'quest_browser_study',
          title: '弯弯浏览器伴读或资料检索',
          desc: '在浏览器浏览干货网页并导入自习资料库',
          target: 1,
          current: 0,
          rewardExp: 35,
          rewardCoins: 15,
          statBonus: { INS: 2, INT: 1 },
          done: false,
          claimed: false,
          date: today
        },
        {
          id: 'quest_farm_care',
          title: '弯弯农场后院田园劳作',
          desc: '在我们的家园农场给作物浇水或收获果实',
          target: 1,
          current: 0,
          rewardExp: 30,
          rewardCoins: 10,
          statBonus: { PHY: 2, PER: 1 },
          done: false,
          claimed: false,
          date: today
        },
        {
          id: 'quest_morning_greet',
          title: '给心仪角色发送早安问候',
          desc: '开启一天的真挚羁绊与温暖寒暄',
          target: 1,
          current: 0,
          rewardExp: 20,
          rewardCoins: 10,
          statBonus: { CHA: 2 },
          done: false,
          claimed: false,
          date: today
        }
      ];
    },

    getExpToNextLevel(level) {
      return level * 350;
    },

    async addExpAndStats(exp, statGains, reason, eventId, opts) {
      var state = await this.getState();

      // 防刷验证 (若上层已校验，则跳过二次扣除每日配额)
      var actualExp = exp;
      if (!opts || !opts.alreadyValidated) {
        var guard = await RewardGuard.validateAndGrant(eventId, exp, 0, 0);
        if (!guard.allowed) {
          return { granted: false, reason: guard.reason, msg: guard.msg };
        }
        actualExp = guard.expGranted;
      }
      state.exp += actualExp;

      // 属性增益
      if (statGains) {
        Object.keys(statGains).forEach(function(k) {
          if (state.stats[k] !== undefined) {
            state.stats[k] += statGains[k];
          }
        });
      }

      // 升级结算
      var reqExp = this.getExpToNextLevel(state.level);
      var leveledUp = false;
      while (state.exp >= reqExp) {
        state.exp -= reqExp;
        state.level++;
        leveledUp = true;
        reqExp = this.getExpToNextLevel(state.level);
      }

      if (leveledUp) {
        state.title = this._getTitleForLevel(state.level);
      }

      await saveStorage(STORAGE_LIFEGAME_STATE, state);

      WanwanSharedHub.emit('LIFEGAME_STATE_CHANGED', {
        state: state,
        expGained: actualExp,
        leveledUp: leveledUp,
        reason: reason
      });

      return {
        granted: true,
        actualExp: actualExp,
        leveledUp: leveledUp,
        level: state.level,
        state: state
      };
    },

    _getTitleForLevel(level) {
      if (level >= 10) return '超维传奇缔造者';
      if (level >= 8) return '博识大贤者';
      if (level >= 6) return '敏锐深空探秘家';
      if (level >= 4) return '自律进阶学者';
      return '见习探索者';
    },

    // 打卡日常任务
    async claimQuest(questId) {
      var state = await this.getState();
      var q = state.quests.find(function(item) { return item.id === questId; });
      if (!q) return { success: false, msg: '任务不存在' };
      if (!q.done) return { success: false, msg: '任务尚未达成目标' };
      if (q.claimed) return { success: false, msg: '今日已领取该任务奖励' };

      // 申请发放经验与金币
      var eventId = 'quest_' + questId + '_' + getTodayStr();
      var guard = await RewardGuard.validateAndGrant(eventId, q.rewardExp, q.rewardCoins, 0);

      q.claimed = true;

      // 发放金币到统一经济账户
      if (guard.coinsGranted > 0) {
        await SharedEconomyService.addCoins(guard.coinsGranted, '完成任务：' + q.title, 'lifeGame');
      }

      // 发放经验与属性
      state.exp += guard.expGranted;
      if (q.statBonus) {
        Object.keys(q.statBonus).forEach(function(k) {
          if (state.stats[k] !== undefined) {
            state.stats[k] += q.statBonus[k];
          }
        });
      }

      // 检查升级
      var reqExp = this.getExpToNextLevel(state.level);
      while (state.exp >= reqExp) {
        state.exp -= reqExp;
        state.level++;
        reqExp = this.getExpToNextLevel(state.level);
      }
      state.title = this._getTitleForLevel(state.level);

      await saveStorage(STORAGE_LIFEGAME_STATE, state);

      WanwanSharedHub.emit('QUEST_COMPLETED', {
        questId: questId,
        title: q.title,
        exp: guard.expGranted,
        coins: guard.coinsGranted
      });

      return {
        success: true,
        exp: guard.expGranted,
        coins: guard.coinsGranted,
        state: state
      };
    },

    // 外部事件推进任务进度 (自习完成、农场收获等)
    async updateQuestProgress(questId, increment) {
      var state = await this.getState();
      var q = state.quests.find(function(item) { return item.id === questId; });
      if (!q || q.claimed) return;

      q.current = (q.current || 0) + (increment || 1);
      if (q.current >= q.target) {
        q.done = true;
      }
      await saveStorage(STORAGE_LIFEGAME_STATE, state);
      WanwanSharedHub.emit('LIFEGAME_STATE_CHANGED', { state: state });
    }
  };

  // ====================================================
  // 7. 共享经济服务 (SharedEconomyService)
  // 唯一来源：统一资产与背包仓库；供人生游戏、心动商城、我们的家、弯弯农场统一记账
  // 各 App 绝不重复发奖或割裂记账
  // ====================================================
  var STORAGE_ECONOMY_STATE = 'shared_economy_state_v2';

  var SharedEconomyService = {
    async getState() {
      var state = await loadStorage(STORAGE_ECONOMY_STATE, null);
      if (!state) {
        state = {
          coins: 520, // 初始心动金币
          diamonds: 50,
          inventory: [
            {
              id: 'inv_vinyl',
              itemId: 'item_vinyl',
              name: '复古黑胶唱机',
              icon: 'fa-solid fa-record-vinyl',
              category: 'furniture',
              count: 1,
              sourceApp: 'mall',
              desc: '放置在起居室，播放双人精选歌单'
            },
            {
              id: 'inv_seeds_strawberry',
              itemId: 'crop_strawberry_seed',
              name: '甜心草莓种子',
              icon: 'fa-solid fa-seedling',
              category: 'seed',
              count: 4,
              sourceApp: 'mall',
              desc: '可在弯弯农场种植，收获鲜美草莓'
            },
            {
              id: 'inv_study_notes',
              itemId: 'item_sticky_notes',
              name: '心动便签纸',
              icon: 'fa-solid fa-note-sticky',
              category: 'study_tool',
              count: 5,
              sourceApp: 'studyRoom',
              desc: '在自习室记录瞬时灵感'
            }
          ],
          logs: [
            { id: uid('eco'), time: Date.now(), type: 'income', amount: 520, reason: '初始迎新礼包', sourceApp: 'system' }
          ]
        };
        await saveStorage(STORAGE_ECONOMY_STATE, state);
      }
      return state;
    },

    async addCoins(amount, reason, sourceApp) {
      if (amount <= 0) return 0;
      var state = await this.getState();
      state.coins += amount;
      state.logs.unshift({
        id: uid('eco'),
        time: Date.now(),
        type: 'income',
        amount: amount,
        reason: reason || '日常收益',
        sourceApp: sourceApp || 'system'
      });
      if (state.logs.length > 50) state.logs = state.logs.slice(0, 50);
      await saveStorage(STORAGE_ECONOMY_STATE, state);

      WanwanSharedHub.emit('ECONOMY_CHANGED', { state: state, change: amount, type: 'income' });
      return state.coins;
    },

    async spendCoins(amount, reason, sourceApp) {
      var state = await this.getState();
      if (state.coins < amount) {
        return { success: false, msg: '金币余额不足 (当前: ' + state.coins + ')' };
      }
      state.coins -= amount;
      state.logs.unshift({
        id: uid('eco'),
        time: Date.now(),
        type: 'expense',
        amount: amount,
        reason: reason || '商城消费',
        sourceApp: sourceApp || 'mall'
      });
      if (state.logs.length > 50) state.logs = state.logs.slice(0, 50);
      await saveStorage(STORAGE_ECONOMY_STATE, state);

      WanwanSharedHub.emit('ECONOMY_CHANGED', { state: state, change: -amount, type: 'expense' });
      return { success: true, remaining: state.coins };
    },

    async addItem(itemData, count, sourceApp) {
      var state = await this.getState();
      var addCount = count || 1;
      var existing = state.inventory.find(function(it) { return it.itemId === itemData.itemId; });
      if (existing) {
        existing.count += addCount;
      } else {
        state.inventory.push(Object.assign({
          id: uid('inv'),
          itemId: itemData.itemId,
          name: itemData.name,
          icon: itemData.icon || 'fa-solid fa-box',
          category: itemData.category || 'misc',
          count: addCount,
          sourceApp: sourceApp || 'system',
          desc: itemData.desc || ''
        }, itemData));
      }
      await saveStorage(STORAGE_ECONOMY_STATE, state);
      WanwanSharedHub.emit('INVENTORY_CHANGED', { state: state, item: itemData, count: addCount });
      return state.inventory;
    },

    async consumeItem(itemId, count) {
      var state = await this.getState();
      var need = count || 1;
      var idx = state.inventory.findIndex(function(it) { return it.itemId === itemId; });
      if (idx === -1 || state.inventory[idx].count < need) {
        return { success: false, msg: '背包内道具不足' };
      }
      state.inventory[idx].count -= need;
      if (state.inventory[idx].count <= 0) {
        state.inventory.splice(idx, 1);
      }
      await saveStorage(STORAGE_ECONOMY_STATE, state);
      WanwanSharedHub.emit('INVENTORY_CHANGED', { state: state });
      return { success: true };
    }
  };

  // ====================================================
  // 8. 成就馆服务 (AchievementService)
  // 唯一来源：成就馆统一徽章、碎片、图鉴库
  // 供个人主页、社区、自习室佩戴
  // ====================================================
  var STORAGE_ACHIEVEMENT_STATE = 'achievement_hall_state_v2';

  var DEFAULT_BADGES = [
    {
      id: 'badge_first_chat',
      name: '初遇之光',
      icon: 'fa-solid fa-handshake-angle',
      category: 'bond',
      desc: '第一次与角色发送消息，开启彼此羁绊',
      points: 100,
      unlocked: true,
      unlockedAt: Date.now() - 86400000 * 2
    },
    {
      id: 'badge_focus_novice',
      name: '静心初探',
      icon: 'fa-solid fa-seedling',
      category: 'study',
      desc: '在陪伴自习室完成任意一次有效专注',
      points: 150,
      unlocked: true,
      unlockedAt: Date.now() - 86400000
    },
    {
      id: 'badge_focus_master_45',
      name: '专注大师',
      icon: 'fa-solid fa-hourglass-start',
      category: 'study',
      desc: '在自习室单次完成 45 分钟深度专注',
      points: 300,
      unlocked: false,
      unlockedAt: null
    },
    {
      id: 'badge_focus_century',
      name: '学海无涯',
      icon: 'fa-solid fa-graduation-cap',
      category: 'study',
      desc: '陪伴自习室累计专注时长突破 100 分钟',
      points: 400,
      unlocked: false,
      unlockedAt: null
    },
    {
      id: 'badge_quiz_master',
      name: '笔落惊风雨',
      icon: 'fa-solid fa-feather-pointed',
      category: 'study',
      desc: '智能题库测验获得 100% 正确率',
      points: 250,
      unlocked: false,
      unlockedAt: null
    },
    {
      id: 'badge_mistakes_conquered',
      name: '温故知新',
      icon: 'fa-solid fa-book-open-reader',
      category: 'study',
      desc: '在错题本中成功消灭 3 道顽固薄弱错题',
      points: 200,
      unlocked: false,
      unlockedAt: null
    },
    {
      id: 'badge_calendar_chronos',
      name: '光阴旅者',
      icon: 'fa-solid fa-calendar-check',
      category: 'life',
      desc: '在时光日历规划并完成 3 个心动日程',
      points: 200,
      unlocked: false,
      unlockedAt: null
    },
    {
      id: 'badge_farm_greenthumb',
      name: '田园牧歌',
      icon: 'fa-solid fa-wheat-awn',
      category: 'farm',
      desc: '在弯弯农场收获第一批丰硕的作物',
      points: 200,
      unlocked: false,
      unlockedAt: null
    },
    {
      id: 'badge_parallel_architect',
      name: '平行宇宙操盘手',
      icon: 'fa-solid fa-earth-americas',
      category: 'parallel',
      desc: '在平行来信开启第一个独立 IF 宇宙剧场',
      points: 250,
      unlocked: true,
      unlockedAt: Date.now() - 3600000
    },
    {
      id: 'badge_love_devotion',
      name: '命定之约',
      icon: 'fa-solid fa-heart-pulse',
      category: 'bond',
      desc: '恋爱记相伴天数累积达成里程碑',
      points: 350,
      unlocked: false,
      unlockedAt: null
    },
    {
      id: 'badge_browser_co_reader',
      name: '同游书海',
      icon: 'fa-solid fa-compass',
      category: 'browser',
      desc: '与伴侣在弯弯浏览器共同研读超过 3 篇网页',
      points: 180,
      unlocked: false,
      unlockedAt: null
    },
    {
      id: 'badge_deep_night_whisper',
      name: '心弦共振',
      icon: 'fa-solid fa-moon',
      category: 'bond',
      desc: '在夜深 2 点依然与 Ta 促膝长谈',
      points: 200,
      unlocked: false,
      unlockedAt: null
    }
  ];

  var AchievementService = {
    async getState() {
      var state = await loadStorage(STORAGE_ACHIEVEMENT_STATE, null);
      if (!state) {
        state = {
          equippedTitle: '初涉尘寰的旅人',
          badges: DEFAULT_BADGES,
          fragments: [
            { id: 'frag_1', title: '午后自习阳光', pieceCurrent: 3, pieceTotal: 4, unlocked: false, desc: '在图书馆窗前并肩做笔记的静谧剪影' },
            { id: 'frag_2', title: '夏夜星空烟火', pieceCurrent: 4, pieceTotal: 4, unlocked: true, desc: '那一年海边绽放的灿烂天际线' },
            { id: 'frag_3', title: '平行世界的回响', pieceCurrent: 2, pieceTotal: 4, unlocked: false, desc: '跨越千万光年的执念信笺' }
          ],
          totalScore: 700
        };
        await saveStorage(STORAGE_ACHIEVEMENT_STATE, state);
      }
      return state;
    },

    async checkAndUnlockBadge(badgeId) {
      var state = await this.getState();
      var b = state.badges.find(function(item) { return item.id === badgeId; });
      if (!b || b.unlocked) return false;

      b.unlocked = true;
      b.unlockedAt = Date.now();
      state.totalScore += (b.points || 100);
      await saveStorage(STORAGE_ACHIEVEMENT_STATE, state);

      // 解锁广播与提示
      WanwanSharedHub.emit('ACHIEVEMENT_UNLOCKED', { badge: b, totalScore: state.totalScore });
      this._showUnlockToast(b);
      return true;
    },

    async equipTitle(title) {
      var state = await this.getState();
      state.equippedTitle = title;
      await saveStorage(STORAGE_ACHIEVEMENT_STATE, state);
      WanwanSharedHub.emit('TITLE_EQUIPPED', { title: title });
      return title;
    },

    _showUnlockToast(badge) {
      if (window.toast) {
        window.toast('🏆 解锁成就勋章：【' + badge.name + '】！获得 +' + badge.points + ' 点荣誉点');
      }
    }
  };

  // ====================================================
  // 9. 弯弯农场经营服务 (WanwanFarmService)
  // 唯一来源：弯弯农场；产出入共享背包；联动人生游戏打卡与成就馆
  // ====================================================
  var STORAGE_FARM_STATE = 'wanwan_farm_state_v2';

  var CROPS_CONFIG = {
    crop_strawberry: {
      id: 'crop_strawberry',
      seedId: 'crop_strawberry_seed',
      name: '甜心草莓',
      icon: '🍓',
      growthSec: 25, // 演示便捷成长
      rewardCoins: 20,
      rewardCropCount: 3,
      desc: '香甜可口的当季草莓'
    },
    crop_sunflower: {
      id: 'crop_sunflower',
      seedId: 'crop_sunflower_seed',
      name: '晨光向日葵',
      icon: '🌻',
      growthSec: 40,
      rewardCoins: 35,
      rewardCropCount: 2,
      desc: '吸饱了金色阳光的花朵'
    },
    crop_pumpkin: {
      id: 'crop_pumpkin',
      seedId: 'crop_pumpkin_seed',
      name: '暖绒黄金南瓜',
      icon: '🎃',
      growthSec: 60,
      rewardCoins: 50,
      rewardCropCount: 1,
      desc: '沉甸甸的丰收馈赠'
    }
  };

  var WanwanFarmService = {
    CROPS_CONFIG: CROPS_CONFIG,

    async getState() {
      var state = await loadStorage(STORAGE_FARM_STATE, null);
      if (!state) {
        var now = Date.now();
        state = {
          farmLevel: 1,
          totalHarvests: 0,
          plots: [
            { id: 0, cropId: 'crop_strawberry', plantedAt: now - 30000, state: 'ripe' }, // 初始有一块成熟可收
            { id: 1, cropId: 'crop_sunflower', plantedAt: now - 10000, state: 'growing' },
            { id: 2, cropId: null, plantedAt: 0, state: 'empty' },
            { id: 3, cropId: null, plantedAt: 0, state: 'empty' }
          ]
        };
        await saveStorage(STORAGE_FARM_STATE, state);
      }

      // 刷新成长状态
      var nowTs = Date.now();
      var changed = false;
      state.plots.forEach(function(plot) {
        if (plot.cropId && plot.state === 'growing') {
          var cfg = CROPS_CONFIG[plot.cropId];
          if (cfg && (nowTs - plot.plantedAt) >= cfg.growthSec * 1000) {
            plot.state = 'ripe';
            changed = true;
          }
        }
      });
      if (changed) {
        await saveStorage(STORAGE_FARM_STATE, state);
      }
      return state;
    },

    async plant(plotIndex, cropId) {
      var state = await this.getState();
      var plot = state.plots[plotIndex];
      if (!plot) return { success: false, msg: '土地不存在' };
      if (plot.state !== 'empty') return { success: false, msg: '该土地已有作物' };

      var cfg = CROPS_CONFIG[cropId];
      if (!cfg) return { success: false, msg: '未知作物' };

      plot.cropId = cropId;
      plot.plantedAt = Date.now();
      plot.state = 'growing';

      await saveStorage(STORAGE_FARM_STATE, state);
      WanwanSharedHub.emit('FARM_ACTION', { action: 'plant', plotIndex: plotIndex, cropId: cropId });
      return { success: true, plot: plot };
    },

    async harvest(plotIndex) {
      var state = await this.getState();
      var plot = state.plots[plotIndex];
      if (!plot || plot.state !== 'ripe') return { success: false, msg: '尚未成熟或不可收获' };

      var cfg = CROPS_CONFIG[plot.cropId];
      plot.cropId = null;
      plot.plantedAt = 0;
      plot.state = 'empty';
      state.totalHarvests = (state.totalHarvests || 0) + 1;

      await saveStorage(STORAGE_FARM_STATE, state);

      // 1. 产出进入统一共享背包！
      if (cfg) {
        await SharedEconomyService.addItem({
          itemId: cfg.id,
          name: cfg.name,
          icon: cfg.icon,
          category: 'farm_crop',
          price: cfg.rewardCoins,
          desc: cfg.desc
        }, cfg.rewardCropCount, 'farm');
      }

      // 2. 联动人生游戏任务
      await LifeGameService.updateQuestProgress('quest_farm_care', 1);

      // 3. 联动成就馆
      await AchievementService.checkAndUnlockBadge('badge_farm_greenthumb');

      WanwanSharedHub.emit('FARM_ACTION', {
        action: 'harvest',
        plotIndex: plotIndex,
        crop: cfg,
        totalHarvests: state.totalHarvests
      });

      return { success: true, crop: cfg };
    }
  };

  // ====================================================
  // 10. 全域联动事件处理核心调度器 (Event Flow Orchestrator)
  // 完美满足阶段 6 验收示例：
  // 完成 45 分钟有效专注 → 自习室写入一次专注事件 → 人生游戏更新任务/经验
  // → 成就馆判断徽章 → Char 生成符合模式的反馈。各 App 不重复计时、记账或发奖。
  // ====================================================
  WanwanSharedHub.on('FOCUS_SESSION_COMPLETED', async function(payload) {
    console.log('[SharedHub Linkage] Handling FOCUS_SESSION_COMPLETED:', payload);
    var duration = payload.durationMinutes || 0;
    var taskName = payload.taskName || '日常专注';
    var studyMode = payload.studyMode || 'gentle';
    var char = payload.companionChar || (await RoleWorldbookService.getActiveCharacter());
    var recId = payload.recordId || ('focus_' + (payload.timestamp || Date.now()) + '_' + duration);
    var eventId = payload.eventId || ('study_record_' + recId);

    // 关键防重复：即时标记已结算记录，确保人生游戏「一键同步记录」不会重复入账
    if (window.LifeGameCore && recId) {
      try {
        await window.LifeGameCore.addSettledStudyRecordId(recId);
      } catch (_) {}
    }

    // 1. 人生游戏更新任务与经验 (防刷每日上限)
    var expToGrant = Math.min(60, Math.round(duration * 1.2));
    var lifeResult = await LifeGameService.addExpAndStats(
      expToGrant,
      { INT: 2, WIL: 1 },
      '陪伴自习室专注 ' + duration + ' 分钟',
      eventId
    );

    // 推进自习任务进度
    if (duration >= 25) {
      await LifeGameService.updateQuestProgress('quest_study_focus_30', duration);
    }

    // 2. 成就馆判断徽章
    if (duration >= 45) {
      await AchievementService.checkAndUnlockBadge('badge_focus_master_45');
    }
    await AchievementService.checkAndUnlockBadge('badge_focus_novice');

    // 检查累计时长是否突破 100 分钟
    try {
      var srRecords = await loadStorage('wanwan_study_records', []);
      var totalMinutes = srRecords.reduce(function(sum, r) { return sum + (r.durationMinutes || 0); }, 0);
      if (totalMinutes >= 100) {
        await AchievementService.checkAndUnlockBadge('badge_focus_century');
      }
    } catch (_) {}

    // 3. 生成符合当前角色人设与模式的专属反馈
    var feedback = RoleWorldbookService.generateFocusFeedback(char, studyMode, duration, taskName);

    // 4. 触发桌面/UI 专属通知与角色反馈
    if (feedback) {
      if (studyMode === 'quiet') {
        window.toast && window.toast('🌿 ' + feedback.content);
      } else {
        window.toast && window.toast('✨ ' + (feedback.speaker ? feedback.speaker + '：' : '') + feedback.content);
      }
    }
  });

  // 挂载到全局
  global.WanwanSharedHub = WanwanSharedHub;
  global.RoleWorldbookService = RoleWorldbookService;
  global.TimeCalendarService = TimeCalendarService;
  global.LifeGameService = LifeGameService;
  global.SharedEconomyService = SharedEconomyService;
  global.AchievementService = AchievementService;
  global.WanwanFarmService = WanwanFarmService;

})(typeof window !== 'undefined' ? window : this);
