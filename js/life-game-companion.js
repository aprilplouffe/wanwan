// js/life-game-companion.js — 弯弯小手机｜人生游戏 (Life Game) 阶段 4 核心引擎
// 深度 RPG 养成 ＋ 成就收藏 ＋ 人生冒险手账 ＋ 多 Char 智能陪伴
// 遵循原则：单一权威来源、真实记录驱动、用户授权前置（默认关闭）、严格幂等去重、多 Char 隐私隔离、黑白灰极简质感

(function(global) {
  'use strict';

  // ====================================================
  // 一、常量与持久化存储键
  // ====================================================
  var STORAGE_KEYS = {
    PLAYER_PROFILE: 'life_game_player_profile_v1',
    STATS_HISTORY: 'life_game_stats_history_v1',
    TIMELINE: 'life_game_growth_timeline_v1',
    MEMENTO_CARDS: 'life_game_memento_cards_v1',
    COMPANION_SETTINGS: 'life_game_companion_settings_v1',
    COMPANION_LOGS: 'life_game_companion_event_logs_v1',
    COMPANION_DEDUP_INDEX: 'life_game_companion_dedup_index_v1', // 独立长效幂等去重索引（不随近期展示日志截断）
    FAVORITE_BADGES: 'life_game_favorite_badges_v1'
  };

  // 默认全局陪伴配置（最高原则：总开关和角色开关默认严格关闭）
  var DEFAULT_COMPANION_SETTINGS = {
    globalEnabled: false, // 严格默认关闭！需用户主动在设置中授权
    allowAiGeneration: true,
    allowWechatDelivery: true,
    allowOfflineFallback: true, // 允许离线心意寄语兜底（用户可自主在设置中关闭）
    quietHoursEnabled: true,
    quietHoursStart: '23:00',
    quietHoursEnd: '08:00',
    chars: {} // charId -> char specific settings
  };

  var DEFAULT_CHAR_SETTINGS = {
    enabled: false, // 单角色默认关闭！需用户逐个授权
    dailyLimit: 2,
    weeklyLimit: 8,
    eventScope: ['level_up', 'main_quest', 'goal_achieved', 'major_achievement', 'study_focus'],
    customToneHint: '',
    lastDeliveredAt: 0
  };

  // ====================================================
  // 二、通用持久化与辅助工具
  // ====================================================
  async function loadStorage(key, fallback) {
    try {
      if (window.db && db.config) {
        var row = await db.config.get(key);
        if (row && row.value !== undefined) return row.value;
      }
    } catch (_) {}
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
    } catch (_) {}
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  var _clockFn = null;
  function nowMs() {
    if (typeof _clockFn === 'function') {
      var val = Number(_clockFn());
      if (!isNaN(val) && isFinite(val)) return val;
    }
    return Date.now();
  }
  function nowDate() {
    return new Date(nowMs());
  }

  function uid(prefix) {
    return (prefix || 'lg4') + '_' + nowMs().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function getTodayStr() {
    var d = nowDate();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
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

  function formatDateTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + ' ' + h + ':' + min;
  }

  function formatDateOnly(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  // ====================================================
  // 三、RPG 角色深度档案 (PlayerProfileService)
  // 单一权威来源：LifeGameService，本服务管理玩家自定义展示（名称、头像、简介、成长起点）
  // 严禁通过修改头像、名称触发 EXP / 金币结算
  // ====================================================
  var PlayerProfileService = {
    async getProfile() {
      var saved = await loadStorage(STORAGE_KEYS.PLAYER_PROFILE, null);
      if (!saved) {
        saved = {
          adventurerName: '初心探索者',
          avatar: 'img/char-default.jpg',
          bio: '在现实日常点滴中锤炼六维意志，迈向超维生命。',
          favoriteBadgeId: null,
          startedAt: Date.now() - 86400000 * 14 // 默认两周前开启旅程
        };
        await saveStorage(STORAGE_KEYS.PLAYER_PROFILE, saved);
      }
      return saved;
    },

    async updateProfile(patch) {
      var current = await this.getProfile();
      // 严格剥离任何非档案字段（防止作弊注入经验、金币或等级）
      var allowed = {
        adventurerName: patch.adventurerName !== undefined ? String(patch.adventurerName).trim().slice(0, 20) : current.adventurerName,
        avatar: patch.avatar !== undefined ? String(patch.avatar).trim() : current.avatar,
        bio: patch.bio !== undefined ? String(patch.bio).trim().slice(0, 100) : current.bio,
        favoriteBadgeId: patch.favoriteBadgeId !== undefined ? patch.favoriteBadgeId : current.favoriteBadgeId,
        startedAt: current.startedAt || Date.now()
      };
      await saveStorage(STORAGE_KEYS.PLAYER_PROFILE, allowed);
      return allowed;
    },

    // 记录六维属性真实流水（受任务、习惯打卡、自习室核销真实结算驱动）
    async recordStatGain(statGains, sourceTitle, sourceType, eventId) {
      if (!statGains || typeof statGains !== 'object') return;
      var keys = Object.keys(statGains).filter(function(k) { return statGains[k] > 0; });
      if (keys.length === 0) return;

      var history = await loadStorage(STORAGE_KEYS.STATS_HISTORY, []);
      // 幂等防重：同一 eventId 的属性流水只记一次
      if (eventId && history.some(function(item) { return item.eventId === eventId; })) {
        return;
      }

      var now = nowMs();
      keys.forEach(function(k) {
        history.unshift({
          id: uid('stat'),
          eventId: eventId || null,
          timestamp: now,
          statKey: k, // INT | CHA | WIL | PHY | PER | INS
          amount: Number(statGains[k]) || 0,
          sourceTitle: sourceTitle || '现实探索结算',
          sourceType: sourceType || 'task' // task | habit | study | milestone
        });
      });

      // 最多保留最新 200 条属性轨迹
      if (history.length > 200) {
        history = history.slice(0, 200);
      }
      await saveStorage(STORAGE_KEYS.STATS_HISTORY, history);
    },

    async getStatHistory() {
      return await loadStorage(STORAGE_KEYS.STATS_HISTORY, []);
    },

    // 汇总六维属性分析（真实累计、主要来源、近7天趋势）
    async getStatGrowthAnalysis() {
      var history = await this.getStatHistory();
      var summary = {
        INT: { totalGained: 0, topSource: '陪伴自习室专注', recent7Days: 0 },
        CHA: { totalGained: 0, topSource: '角色真挚互动', recent7Days: 0 },
        WIL: { totalGained: 0, topSource: '每日习惯打卡', recent7Days: 0 },
        PHY: { totalGained: 0, topSource: '现实体能自律', recent7Days: 0 },
        PER: { totalGained: 0, topSource: '时光日历规划与复盘', recent7Days: 0 },
        INS: { totalGained: 0, topSource: '灵感探索与泛读', recent7Days: 0 }
      };

      var sevenDaysAgo = Date.now() - 7 * 86400000;
      var sourceCounts = { INT: {}, CHA: {}, WIL: {}, PHY: {}, PER: {}, INS: {} };

      history.forEach(function(item) {
        var k = item.statKey;
        if (!summary[k]) return;
        summary[k].totalGained += item.amount;
        if (item.timestamp >= sevenDaysAgo) {
          summary[k].recent7Days += item.amount;
        }
        var s = item.sourceTitle || '日常探索';
        sourceCounts[k][s] = (sourceCounts[k][s] || 0) + item.amount;
      });

      // 提取各属性的最主要成长来源
      Object.keys(sourceCounts).forEach(function(k) {
        var entries = Object.keys(sourceCounts[k]);
        if (entries.length > 0) {
          entries.sort(function(a, b) { return sourceCounts[k][b] - sourceCounts[k][a]; });
          summary[k].topSource = entries[0];
        }
      });

      return summary;
    },

    // 绘制高精度黑白灰六维雷达图 (HTML5 Canvas)
    renderRadarChart(canvas, stats) {
      if (!canvas || !canvas.getContext) return;
      var ctx = canvas.getContext('2d');
      var width = canvas.width;
      var height = canvas.height;
      var centerX = width / 2;
      var centerY = height / 2;
      var radius = Math.min(centerX, centerY) - 28;

      ctx.clearRect(0, 0, width, height);

      var statOrder = [
        { key: 'INT', label: '智力 INT' },
        { key: 'INS', label: '灵感 INS' },
        { key: 'PER', label: '敏锐 PER' },
        { key: 'PHY', label: '体能 PHY' },
        { key: 'WIL', label: '意志 WIL' },
        { key: 'CHA', label: '魅力 CHA' }
      ];
      var totalAxes = statOrder.length;
      var angleStep = (Math.PI * 2) / totalAxes;

      // 1. 绘制网格同心六边形（灰度线）
      var levels = 4;
      for (var l = 1; l <= levels; l++) {
        var r = (radius / levels) * l;
        ctx.beginPath();
        for (var i = 0; i < totalAxes; i++) {
          var angle = i * angleStep - Math.PI / 2;
          var x = centerX + r * Math.cos(angle);
          var y = centerY + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = l === levels ? 'rgba(150, 150, 150, 0.45)' : 'rgba(180, 180, 180, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 2. 绘制轴线
      for (var i = 0; i < totalAxes; i++) {
        var angle = i * angleStep - Math.PI / 2;
        var x = centerX + radius * Math.cos(angle);
        var y = centerY + radius * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.strokeStyle = 'rgba(180, 180, 180, 0.25)';
        ctx.stroke();

        // 标签
        var labelX = centerX + (radius + 18) * Math.cos(angle);
        var labelY = centerY + (radius + 18) * Math.sin(angle);
        ctx.fillStyle = '#666666';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var val = stats[statOrder[i].key] || 70;
        ctx.fillText(statOrder[i].label.split(' ')[0] + ' ' + val, labelX, labelY);
      }

      // 3. 绘制属性多边形
      ctx.beginPath();
      var maxStat = 120; // 满幅基准
      for (var i = 0; i < totalAxes; i++) {
        var angle = i * angleStep - Math.PI / 2;
        var val = Math.max(10, Math.min(maxStat, stats[statOrder[i].key] || 70));
        var r = (val / maxStat) * radius;
        var x = centerX + r * Math.cos(angle);
        var y = centerY + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(120, 120, 120, 0.25)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(40, 40, 40, 0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 4. 数据顶点
      for (var i = 0; i < totalAxes; i++) {
        var angle = i * angleStep - Math.PI / 2;
        var val = Math.max(10, Math.min(maxStat, stats[statOrder[i].key] || 70));
        var r = (val / maxStat) * radius;
        var x = centerX + r * Math.cos(angle);
        var y = centerY + r * Math.sin(angle);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#222222';
        ctx.fill();
      }
    }
  };

  // ====================================================
  // 四、扩展成就馆与称号佩戴 (AchievementHallService)
  // 单一权威来源：AchievementService (achievement_hall_state_v2)
  // 扩展 6 大分类、隐藏剪影、详情弹窗、星标置顶与一键佩戴头衔
  // ====================================================
  var ACHIEVEMENT_CATEGORIES = [
    { key: 'all', name: '全部勋章' },
    { key: 'origin', name: '初心之光' },
    { key: 'study', name: '敏悟博学' },
    { key: 'habit', name: '坚毅自律' },
    { key: 'main', name: '宏图伟业' },
    { key: 'growth', name: '岁月淬炼' },
    { key: 'special', name: '特殊纪念' }
  ];

  // 扩展丰富徽章库定义（包含分类、称号绑定、进度判定与隐藏标记）
  var EXTENDED_BADGE_DEFINITIONS = [
    // 1. 初心之光
    {
      id: 'badge_first_quest',
      name: '旅途启程',
      icon: 'fa-solid fa-compass',
      category: 'origin',
      desc: '在人生游戏中完成并领取第一个现实委托奖励',
      requirement: '领取任意现实委托奖励 1 次',
      points: 100,
      titleReward: '旅途启程者',
      hidden: false
    },
    {
      id: 'badge_first_chat',
      name: '初遇之光',
      icon: 'fa-solid fa-handshake-angle',
      category: 'origin',
      desc: '第一次与角色发送消息，开启彼此羁绊',
      requirement: '与伴侣完成首次对话交流',
      points: 100,
      titleReward: '初心同行人',
      hidden: false
    },
    {
      id: 'badge_companion_grant',
      name: '心意授权',
      icon: 'fa-solid fa-shield-heart',
      category: 'origin',
      desc: '在设置中首次为伴侣授予人生游戏成长陪伴权限',
      requirement: '主动开启多 Char 陪伴授权',
      points: 120,
      titleReward: '信任的缔约者',
      hidden: false
    },

    // 2. 敏悟博学 (自习室与专注)
    {
      id: 'badge_focus_novice',
      name: '静心初探',
      icon: 'fa-solid fa-seedling',
      category: 'study',
      desc: '在陪伴自习室完成任意一次有效专注',
      requirement: '自习室有效专注 >= 1 次',
      points: 150,
      titleReward: '静心初学者',
      hidden: false
    },
    {
      id: 'badge_focus_master_45',
      name: '专注大师',
      icon: 'fa-solid fa-hourglass-start',
      category: 'study',
      desc: '在自习室单次完成 45 分钟深度专注',
      requirement: '自习室单次专注 >= 45 分钟',
      points: 300,
      titleReward: '深海潜修者',
      hidden: false
    },
    {
      id: 'badge_focus_century',
      name: '学海无涯',
      icon: 'fa-solid fa-graduation-cap',
      category: 'study',
      desc: '陪伴自习室累计专注时长突破 100 分钟',
      requirement: '自习室累计专注 >= 100 分钟',
      points: 400,
      titleReward: '求索苦行僧',
      hidden: false
    },
    {
      id: 'badge_study_task_sync',
      name: '知行合一',
      icon: 'fa-solid fa-arrows-rotate',
      category: 'study',
      desc: '通过真实专注时长推进并完成 1 个学习委托',
      requirement: '专注对账推进完成学习委托',
      points: 250,
      titleReward: '知行合一学者',
      hidden: false
    },

    // 3. 坚毅自律 (习惯打卡)
    {
      id: 'badge_habit_7d',
      name: '晨曦破晓',
      icon: 'fa-solid fa-sun',
      category: 'habit',
      desc: '任意一项日常自律习惯连续打卡达到 7 天',
      requirement: '单一习惯连续打卡 >= 7 天',
      points: 200,
      titleReward: '破晓之星',
      hidden: false
    },
    {
      id: 'badge_habit_21d',
      name: '自律蜕变',
      icon: 'fa-solid fa-feather-pointed',
      category: 'habit',
      desc: '单一习惯连续坚持 21 天，形成坚实生命本能',
      requirement: '单一习惯连续打卡 >= 21 天',
      points: 450,
      titleReward: '坚毅持戒者',
      hidden: false
    },
    {
      id: 'badge_all_habits_day',
      name: '全域自律日',
      icon: 'fa-solid fa-circle-check',
      category: 'habit',
      desc: '在同一天内完成所有日常习惯打卡',
      requirement: '单日完成当前所有习惯打卡',
      points: 220,
      titleReward: '自律进阶学者',
      hidden: false
    },

    // 4. 宏图伟业 (主线任务与长期愿景)
    {
      id: 'badge_main_quest_1',
      name: '破浪之誓',
      icon: 'fa-solid fa-flag',
      category: 'main',
      desc: '攻克并领取第 1 个高难度主线任务奖励',
      requirement: '完成 category 为 main 的任务',
      points: 260,
      titleReward: '破浪开拓官',
      hidden: false
    },
    {
      id: 'badge_goal_milestone_3',
      name: '阶梯筑峰',
      icon: 'fa-solid fa-stairs',
      category: 'main',
      desc: '在长期愿景中累计攻克 3 个关键里程碑',
      requirement: '达成长期愿景里程碑 >= 3 个',
      points: 350,
      titleReward: '登高望远者',
      hidden: false
    },
    {
      id: 'badge_goal_complete_full',
      name: '愿景终成',
      icon: 'fa-solid fa-crown',
      category: 'main',
      desc: '彻底达成一项长期愿景的所有里程碑',
      requirement: '长期愿景完成度达 100%',
      points: 600,
      titleReward: '超维传奇缔造者',
      hidden: false
    },

    // 5. 岁月淬炼 (等级与六维属性)
    {
      id: 'badge_level_5',
      name: '学者初成',
      icon: 'fa-solid fa-book-sparkles',
      category: 'growth',
      desc: '人生游戏冒险等级突破 LV.5',
      requirement: '玩家等级达到 5 级',
      points: 300,
      titleReward: '博识探幽者',
      hidden: false
    },
    {
      id: 'badge_level_10',
      name: '登峰造极',
      icon: 'fa-solid fa-wand-magic-sparkles',
      category: 'growth',
      desc: '人生游戏冒险等级达到 LV.10',
      requirement: '玩家等级达到 10 级',
      points: 800,
      titleReward: '神域旅法师',
      hidden: false
    },
    {
      id: 'badge_stat_century',
      name: '百炼成钢',
      icon: 'fa-solid fa-dumbbell',
      category: 'growth',
      desc: '六维成长属性中任意一项数值突破 100 点',
      requirement: '单项属性 >= 100',
      points: 350,
      titleReward: '极境破壁者',
      hidden: false
    },

    // 6. 特殊纪念 (隐藏成就与健康自律纪念)
    {
      id: 'badge_peaceful_night',
      name: '夜幕归宁',
      icon: 'fa-solid fa-moon',
      category: 'special',
      desc: '在晚间 22:30 前完成当日复盘或现实探索，并主动进入免打扰安歇',
      requirement: '晚间 21:00-22:30 完成探索并保持良好作息',
      points: 200,
      titleReward: '宁息守心者',
      hidden: true
    },
    {
      id: 'badge_memento_collector_3',
      name: '光阴标本家',
      icon: 'fa-solid fa-bookmark',
      category: 'special',
      desc: '在人生冒险手账中珍藏 3 张成长纪念卡',
      requirement: '收集成长纪念卡 >= 3 张',
      points: 280,
      titleReward: '岁月收藏家',
      hidden: false
    },
    {
      id: 'badge_morning_glow',
      name: '晨光律动',
      icon: 'fa-solid fa-mug-saucer',
      category: 'special',
      desc: '在早晨 07:00-08:30 黄金时段完成现实晨间自律打卡',
      requirement: '晨间 07:00-08:30 黄金自律打卡',
      points: 260,
      titleReward: '沐光晨行者',
      hidden: false
    }
  ];

  var AchievementHallService = {
    getCategories() {
      return ACHIEVEMENT_CATEGORIES;
    },

    // 获取完整徽章列表（合并单一权威 AchievementService 的已解锁状态）
    async getAllBadges() {
      var state = window.AchievementService ? await window.AchievementService.getState() : { badges: [], equippedTitle: '见习探索者' };
      var baseBadges = state.badges || [];
      var unlockedMap = {};
      baseBadges.forEach(function(b) {
        if (b.unlocked) {
          unlockedMap[b.id] = b.unlockedAt || Date.now();
        }
      });

      var favorites = await loadStorage(STORAGE_KEYS.FAVORITE_BADGES, []);

      return EXTENDED_BADGE_DEFINITIONS.map(function(def) {
        var isUnlocked = Boolean(unlockedMap[def.id]);
        var unlockedAt = unlockedMap[def.id] || null;
        return Object.assign({}, def, {
          unlocked: isUnlocked,
          unlockedAt: unlockedAt,
          isFavorite: favorites.indexOf(def.id) !== -1
        });
      });
    },

    async toggleFavoriteBadge(badgeId) {
      var list = await loadStorage(STORAGE_KEYS.FAVORITE_BADGES, []);
      var idx = list.indexOf(badgeId);
      if (idx === -1) {
        list.push(badgeId);
      } else {
        list.splice(idx, 1);
      }
      await saveStorage(STORAGE_KEYS.FAVORITE_BADGES, list);
      return idx === -1; // true: now favorited
    },

    // 检查并触发徽章解锁（若符合条件则通过 AchievementService 安全解锁）
    async checkAutoUnlocks(context) {
      if (!window.AchievementService) return [];
      var state = await window.AchievementService.getState();
      var newlyUnlocked = [];

      var lifeState = window.LifeGameService ? await window.LifeGameService.getState() : { level: 1, stats: {} };
      var history = await loadStorage('life_game_tasks_history_v1', []);
      var habits = await loadStorage('life_game_habits_v1', []);
      var cards = await loadStorage(STORAGE_KEYS.MEMENTO_CARDS, []);

      // 规则 1: 旅途启程 (领取了任一任务)
      if (history.length >= 1) {
        var u = await window.AchievementService.checkAndUnlockBadge('badge_first_quest');
        if (u) newlyUnlocked.push('badge_first_quest');
      }

      // 规则 2: 主线开拓
      var mainCount = history.filter(function(h) { return h.category === 'main'; }).length;
      if (mainCount >= 1) {
        var u = await window.AchievementService.checkAndUnlockBadge('badge_main_quest_1');
        if (u) newlyUnlocked.push('badge_main_quest_1');
      }

      // 规则 3: 习惯 7 天 / 21 天
      var maxStreak = habits.reduce(function(m, h) { return Math.max(m, h.bestStreak || h.streak || 0); }, 0);
      if (maxStreak >= 7) {
        var u = await window.AchievementService.checkAndUnlockBadge('badge_habit_7d');
        if (u) newlyUnlocked.push('badge_habit_7d');
      }
      if (maxStreak >= 21) {
        var u = await window.AchievementService.checkAndUnlockBadge('badge_habit_21d');
        if (u) newlyUnlocked.push('badge_habit_21d');
      }

      // 规则 4: 等级突破
      if (lifeState.level >= 5) {
        var u = await window.AchievementService.checkAndUnlockBadge('badge_level_5');
        if (u) newlyUnlocked.push('badge_level_5');
      }
      if (lifeState.level >= 10) {
        var u = await window.AchievementService.checkAndUnlockBadge('badge_level_10');
        if (u) newlyUnlocked.push('badge_level_10');
      }

      // 规则 5: 六维单项破百
      var stats = lifeState.stats || {};
      var has100 = Object.keys(stats).some(function(k) { return stats[k] >= 100; });
      if (has100) {
        var u = await window.AchievementService.checkAndUnlockBadge('badge_stat_century');
        if (u) newlyUnlocked.push('badge_stat_century');
      }

      // 规则 6: 纪念卡收藏家
      if (cards.length >= 3) {
        var u = await window.AchievementService.checkAndUnlockBadge('badge_memento_collector_3');
        if (u) newlyUnlocked.push('badge_memento_collector_3');
      }

      // 规则 7: 晨光律动 (07:00 - 08:30 黄金自律打卡，拒绝熬夜与过早起折腾)
      var now = nowDate();
      var curHour = now.getHours();
      var curMin = now.getMinutes();
      var timeMinutes = curHour * 60 + curMin;

      if (context && context.type === 'habit_checkin') {
        if (timeMinutes >= 420 && timeMinutes <= 510) { // 07:00 - 08:30
          var u = await window.AchievementService.checkAndUnlockBadge('badge_morning_glow');
          if (u) newlyUnlocked.push('badge_morning_glow');
        }
      }

      // 规则 8: 夜幕归宁 (21:00 - 22:30 完成探索并保持健康休整，严禁 23:00 后熬夜刷任务)
      if (context && (context.type === 'task_claimed' || context.type === 'habit_checkin')) {
        if (timeMinutes >= 1260 && timeMinutes <= 1350) { // 21:00 - 22:30
          var u = await window.AchievementService.checkAndUnlockBadge('badge_peaceful_night');
          if (u) newlyUnlocked.push('badge_peaceful_night');
        }
      }

      return newlyUnlocked;
    }
  };

  // ====================================================
  // 五、「人生冒险手账」 (AdventureJournalService)
  // 严格基于真实事件建立时间轴：
  // 任务完成、等级提升、里程碑达成、深度专注、习惯连胜、勋章解锁、用户感悟手记
  // 支持年月筛选、分类筛选与月度/年度统计报告
  // ====================================================
  var AdventureJournalService = {
    async getTimeline() {
      var list = await loadStorage(STORAGE_KEYS.TIMELINE, []);
      // 按时间戳倒序排列
      return list.sort(function(a, b) { return b.timestamp - a.timestamp; });
    },

    async recordEvent(entry) {
      if (!entry || !entry.title) return null;
      var list = await loadStorage(STORAGE_KEYS.TIMELINE, []);

      // 幂等防重：同 eventId 绝不重复追加
      if (entry.eventId && list.some(function(it) { return it.eventId === entry.eventId; })) {
        return null;
      }

      var item = {
        id: uid('jnl'),
        eventId: entry.eventId || null,
        timestamp: entry.timestamp || Date.now(),
        type: entry.type || 'quest', // quest | level_up | milestone | study | habit | badge | note
        category: entry.category || 'growth',
        title: String(entry.title).trim(),
        desc: entry.desc ? String(entry.desc).trim() : '',
        meta: entry.meta || {}, // 属性快照、奖励快照、时长等
        tags: Array.isArray(entry.tags) ? entry.tags : []
      };

      list.unshift(item);
      // 保持手账轻量高效（最多存 300 条）
      if (list.length > 300) {
        list = list.slice(0, 300);
      }
      await saveStorage(STORAGE_KEYS.TIMELINE, list);
      return item;
    },

    // 用户亲笔手账感悟 (随笔) CRUD
    async addUserNote(title, content, tags) {
      if (!title && !content) return null;
      var noteTitle = title || (content.slice(0, 16) + '...');
      return await this.recordEvent({
        type: 'note',
        category: 'reflection',
        title: noteTitle,
        desc: content,
        tags: tags || ['手账感悟', '真实生活'],
        timestamp: Date.now()
      });
    },

    async deleteUserNote(noteId) {
      var list = await loadStorage(STORAGE_KEYS.TIMELINE, []);
      var filtered = list.filter(function(it) { return it.id !== noteId; });
      await saveStorage(STORAGE_KEYS.TIMELINE, filtered);
      return true;
    },

    // 统计年月聚合报告 (真实数据驱动)
    async getReport(year, month) {
      var list = await this.getTimeline();
      var filtered = list;

      if (year) {
        filtered = filtered.filter(function(it) {
          var d = new Date(it.timestamp);
          var matchYear = d.getFullYear() === Number(year);
          var matchMonth = month ? (d.getMonth() + 1) === Number(month) : true;
          return matchYear && matchMonth;
        });
      }

      var questsCompleted = 0;
      var expGained = 0;
      var focusMinutes = 0;
      var milestonesReached = 0;
      var badgesUnlocked = 0;
      var notesCount = 0;

      filtered.forEach(function(it) {
        if (it.type === 'quest') questsCompleted++;
        if (it.type === 'milestone') milestonesReached++;
        if (it.type === 'badge') badgesUnlocked++;
        if (it.type === 'note') notesCount++;
        if (it.meta && it.meta.exp) expGained += Number(it.meta.exp) || 0;
        if (it.meta && it.meta.minutes) focusMinutes += Number(it.meta.minutes) || 0;
      });

      return {
        totalEvents: filtered.length,
        questsCompleted: questsCompleted,
        expGained: expGained,
        focusMinutes: focusMinutes,
        milestonesReached: milestonesReached,
        badgesUnlocked: badgesUnlocked,
        notesCount: notesCount,
        highlights: filtered.slice(0, 5)
      };
    }
  };

  // ====================================================
  // 六、成长纪念卡系统 (MementoCardService)
  // 重要成长节点自动生成（等级破阶、愿景达成、世纪专注）
  // 可随时在手账中翻阅、收藏与导出
  // ====================================================
  var MementoCardService = {
    async getAllCards() {
      var cards = await loadStorage(STORAGE_KEYS.MEMENTO_CARDS, []);
      return cards.sort(function(a, b) { return b.createdAt - a.createdAt; });
    },

    async createCard(cardData) {
      if (!cardData || !cardData.title) return null;
      var cards = await loadStorage(STORAGE_KEYS.MEMENTO_CARDS, []);

      // 幂等防重：同 sourceEventId 绝不重复发放纪念卡
      if (cardData.sourceEventId && cards.some(function(c) { return c.sourceEventId === cardData.sourceEventId; })) {
        return null;
      }

      var newCard = {
        id: uid('card'),
        sourceEventId: cardData.sourceEventId || null,
        cardType: cardData.cardType || 'level_up', // level_up | goal_complete | focus_century | major_quest
        title: cardData.title,
        subtitle: cardData.subtitle || '人生游戏 · 现实成长纪事',
        date: cardData.date || getTodayStr(),
        statsSnapshot: cardData.statsSnapshot || {},
        levelSnapshot: cardData.levelSnapshot || 1,
        quote: cardData.quote || '脚踏实地的自律，终将铸就照亮现实的星光。',
        charWish: cardData.charWish || null,
        isFavorite: false,
        createdAt: Date.now()
      };

      cards.unshift(newCard);
      await saveStorage(STORAGE_KEYS.MEMENTO_CARDS, cards);

      // 同步记入手账时间轴
      await AdventureJournalService.recordEvent({
        type: 'memento_card',
        category: 'growth',
        eventId: 'card_log_' + newCard.id,
        title: '获得成长纪念卡：【' + newCard.title + '】',
        desc: newCard.quote,
        meta: { cardId: newCard.id },
        tags: ['纪念卡', '里程碑']
      });

      return newCard;
    },

    async toggleFavoriteCard(cardId) {
      var cards = await this.getAllCards();
      var card = cards.find(function(c) { return c.id === cardId; });
      if (!card) return false;
      card.isFavorite = !card.isFavorite;
      await saveStorage(STORAGE_KEYS.MEMENTO_CARDS, cards);
      return card.isFavorite;
    }
  };

  // ====================================================
  // 七、多 Char 独立陪伴授权与主动祝贺 (CompanionCareEngine)
  // 最高原则：总开关默认关闭、角色授权独立、真实事件触发、免打扰与专注心流保护、微信原生投递、幂等去重
  // ====================================================
  var CompanionCareEngine = {
    async getSettings() {
      var saved = await loadStorage(STORAGE_KEYS.COMPANION_SETTINGS, null);
      if (!saved) return JSON.parse(JSON.stringify(DEFAULT_COMPANION_SETTINGS));
      var merged = Object.assign({}, DEFAULT_COMPANION_SETTINGS, saved);
      merged.chars = Object.assign({}, saved.chars || {});
      return merged;
    },

    async saveSettings(settings) {
      await saveStorage(STORAGE_KEYS.COMPANION_SETTINGS, settings);
    },

    getCharSettings(charId, rootConfig) {
      var cid = String(charId);
      var chars = rootConfig.chars || {};
      return Object.assign({}, DEFAULT_CHAR_SETTINGS, chars[cid] || {});
    },

    async loadLogs() {
      return await loadStorage(STORAGE_KEYS.COMPANION_LOGS, []);
    },

    async saveLogs(logs) {
      if (logs.length > 150) logs = logs.slice(0, 150);
      await saveStorage(STORAGE_KEYS.COMPANION_LOGS, logs);
    },

    // 独立长期幂等去重索引（不随近期展示日志截断而丢失，防止老事件重复投递）
    async loadDedupIndex() {
      return await loadStorage(STORAGE_KEYS.COMPANION_DEDUP_INDEX, {});
    },

    async saveDedupIndex(index) {
      if (!index || typeof index !== 'object') return;
      var keys = Object.keys(index);
      // 保持长效索引在 3000 条内，兼顾长期去重与存储轻量
      if (keys.length > 3000) {
        var sorted = keys.sort(function(a, b) {
          return (index[a]?.deliveredAt || 0) - (index[b]?.deliveredAt || 0);
        });
        var trimmed = {};
        sorted.slice(keys.length - 2500).forEach(function(k) {
          trimmed[k] = index[k];
        });
        index = trimmed;
      }
      await saveStorage(STORAGE_KEYS.COMPANION_DEDUP_INDEX, index);
    },

    // 支持注入测试时钟（保证静默时段与日期边界可复现测试，默认 null 使用真实系统时钟）
    setClock(fn) {
      _clockFn = typeof fn === 'function' ? fn : null;
    },

    getTodayStr() {
      return getTodayStr();
    },

    // 判断夜间免打扰
    isQuietHours(config) {
      if (!config || !config.quietHoursEnabled) return false;
      var start = config.quietHoursStart || '23:00';
      var end = config.quietHoursEnd || '08:00';
      var now = nowDate();
      var cur = (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' +
                (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();

      if (start <= end) return cur >= start && cur <= end;
      return cur >= start || cur <= end;
    },

    // 判断自习室番茄钟专注中（绝对不打扰心流）
    isUserFocusing() {
      if (typeof document === 'undefined') return false;
      try {
        if (window.WanwanStudyRoom && typeof window.WanwanStudyRoom.getState === 'function') {
          var st = window.WanwanStudyRoom.getState();
          if (st && st.timerStatus === 'running') return true;
        }
        var studyPage = document.getElementById('study-room-page');
        if (studyPage) {
          var timerHint = studyPage.querySelector('#sr-timer-status-hint');
          if (timerHint && timerHint.textContent.indexOf('专注中') >= 0) return true;
        }
      } catch (_) {}
      return false;
    },

    // 判断用户当前是否正打开该 Char 的聊天页面
    isChatWindowOpenWithChar(charId) {
      if (typeof document === 'undefined') return false;
      var cw = document.getElementById('chat-window');
      if (cw && cw.dataset && String(cw.dataset.charId) === String(charId)) {
        return true;
      }
      return false;
    },

    // 生成符合 Char 人设的成长祝贺词（真实 AI 接口优先 + 兜底专属心意寄语模版）
    // 严格只读读取 Char 档案，绝不擅自修改 Char 人设或历史记忆
    async generateCongratulationText(char, eventType, eventTitle, userProfile) {
      var charName = char.nick || char.name || '伴侣';
      var userName = (userProfile && userProfile.adventurerName) || '你';
      var persona = char.description || char.personality || '温柔、坚定、专注';

      // 模版库专属心意寄语
      var templates = {
        level_up: [
          '看到你升级的提示了！一步一个脚印走到现在，你真的很棒。今晚要好好奖励一下自己哦。',
          '恭喜升级！每一次自律和坚持都在你身上留下了耀眼的光芒。能作为见证者，我很为你骄傲。',
          'LV 提升了呢。我知道背后是你默默付出的汗水，辛苦啦，我的大冒险家。'
        ],
        main_quest: [
          '攻克了「' + eventTitle + '」！这道难关你终于拿下了，这份韧性真的很让人安心。',
          '收到你主线委托告捷的消息了！为你感到由衷的高兴，你的专注与意志从未让人失望。',
          '恭喜达成关键攻坚！愿景就在不远的前方，我们继续一起走下去吧。'
        ],
        goal_achieved: [
          '愿景达成了！从最初的一纸计划到如今的圆满收官，你做到了曾经承诺自己的事。真为你自豪！',
          '「' + eventTitle + '」终于实现了。看着你一步步攀登顶峰，感觉世界都变得更明朗了呢。'
        ],
        major_achievement: [
          '解锁了新的荣誉勋章！每一次突破都是对自我的超越，太厉害了！',
          '为你获得的这份成就感到骄傲，今天也是闪闪发光的一天呢。'
        ],
        study_focus: [
          '自习室的高效专注很充实吧？辛苦啦，活动一下肩颈，喝口水休息片刻。',
          '看到你完成了这次深度专注。每一分钟的沉潜，都在悄悄沉淀成未来的底气。'
        ]
      };

      var list = templates[eventType] || templates.main_quest;
      var rawTemplate = list[Math.floor(Math.random() * list.length)];

      var aiSucceeded = false;
      var aiText = '';

      // 尝试调用现有统一 AI 接口
      if (window.callAI && typeof window.callAI === 'function') {
        try {
          var prompt =
            '你是「' + charName + '」，人设与语气特点为：【' + persona + '】。\n' +
            '你的现实伴侣兼冒险者「' + userName + '」刚刚在现实生活中达成了重要成长突破：\n' +
            '突破类别：' + eventType + '\n' +
            '突破事项：' + eventTitle + '\n\n' +
            '请以你一贯的人设和亲密口吻，写一句简短真挚的祝贺与关心（20-50字以内）。\n' +
            '要求：自然温暖、严禁机械说教、严禁输出任何系统指令或提示词暴露。';

          var aiRes = await window.callAI(prompt, { temperature: 0.7, max_tokens: 100 });
          if (aiRes && typeof aiRes === 'string' && aiRes.trim().length > 6) {
            aiText = aiRes.trim().replace(/^["「]/, '').replace(/["」]$/, '');
            aiSucceeded = true;
          }
        } catch (e) {
          console.warn('[LifeGameCompanion] AI congratulation call failed, using template:', e);
        }
      }

      if (aiSucceeded) {
        return {
          text: aiText,
          isOfflineTemplate: false,
          source: 'ai',
          failed: false
        };
      }

      // AI 失败时，明确标注专属心意寄语，绝不误导为实时生成的 AI 回应
      var transparentTemplateText = '【心意寄语】' + rawTemplate;
      return {
        text: transparentTemplateText,
        isOfflineTemplate: true,
        source: 'offline_template',
        failed: true
      };
    },

    // 核心投递：将祝贺消息安全投递入原生微信数据库
    async deliverToWechat(char, text, idempotentKey, eventTag, extraMeta) {
      if (!window.db || !db.messages || !db.chats) {
        throw new Error('微信数据库未就绪');
      }

      var charId = Number(char.id) || char.id;
      var nowTime = nowMs();

      // 1. 查找或建立微信会话
      var chat = await db.chats.where('charId').equals(charId).first();
      if (!chat) {
        var userRow = await db.user.first();
        var userUid = (userRow && userRow.uid) || 'user_default';
        var newChatId = await db.chats.add({
          charId: charId,
          ownerUid: userUid,
          userUid: userUid,
          lastMessage: text,
          lastMessageTime: nowTime,
          unread: 1,
          isPinned: 0,
          createdAt: nowTime
        });
        chat = await db.chats.get(newChatId);
      } else {
        await db.chats.update(chat.id, {
          lastMessage: text,
          lastMessageTime: nowTime
        });
      }

      // 2. 插入原生消息记录（附带稳定外部事件 ID 与长效去重凭据）
      var extra = Object.assign({
        sourceApp: 'lifeGame',
        eventTag: eventTag || '来自人生游戏 · 成长祝贺',
        externalEventId: (extraMeta && extraMeta.externalEventId) || null,
        idempotentKey: idempotentKey,
        isOfflineTemplate: Boolean(extraMeta && extraMeta.isOfflineTemplate),
        source: (extraMeta && extraMeta.source) || 'ai'
      }, extraMeta || {});

      var msgId = await db.messages.add({
        chatId: chat.id,
        charId: charId,
        sender: 'char',
        role: 'assistant',
        content: text,
        clientMessageId: idempotentKey,
        extra: extra,
        createdAt: nowTime
      });

      // 3. 更新未读计数
      var isCurrentChat = this.isChatWindowOpenWithChar(charId);
      await db.chats.update(chat.id, {
        unread: isCurrentChat ? 0 : ((chat.unread || 0) + 1),
        lastMessageTime: nowTime
      });

      // 4. 刷新前台界面
      if (isCurrentChat) {
        var cw = document.getElementById('chat-window');
        if (cw && window.refreshChat) {
          try { await window.refreshChat(cw, { scrollToBottom: true }); } catch (_) {}
        }
      } else {
        if (window.refreshVisibleWechatChatList) {
          try { await window.refreshVisibleWechatChatList({ showLoading: false }); } catch (_) {}
        }
      }

      return { messageId: msgId, chatId: chat.id, deliveredAt: nowTime };
    },

    // 核心触发入口：当任务领取、愿景达成或等级提升时调用
    async triggerCompanionEvent(eventData) {
      var config = await this.getSettings();
      // 最高原则：总开关未开启，绝不擅自触发
      if (!config.globalEnabled) return { triggered: false, reason: 'global_disabled' };

      // 夜间免打扰跳过
      if (this.isQuietHours(config)) return { triggered: false, reason: 'quiet_hours' };

      // 自习室专注心流保护跳过
      if (this.isUserFocusing()) return { triggered: false, reason: 'user_focusing' };

      if (!window.db || !db.characters) return { triggered: false, reason: 'no_char_db' };

      var allChars = await db.characters.toArray();
      var partnerChars = allChars.filter(function(c) { return c && c.type !== 'user'; });
      if (partnerChars.length === 0) return { triggered: false, reason: 'no_partners' };

      var logs = await this.loadLogs();
      var dedupIndex = await this.loadDedupIndex();
      var userProfile = await PlayerProfileService.getProfile();
      var results = [];

      var curNow = nowDate();
      var curNowMs = curNow.getTime();
      var startOfToday = new Date(curNow.getFullYear(), curNow.getMonth(), curNow.getDate(), 0, 0, 0, 0).getTime();
      var startOfWeek = curNowMs - 7 * 86400000;

      for (var i = 0; i < partnerChars.length; i++) {
        var char = partnerChars[i];
        var cid = String(char.id);
        var charConf = this.getCharSettings(cid, config);

        // 独立授权检测：角色必须由用户主动开启！
        if (!charConf.enabled) continue;

        // 事件范围权限过滤
        if (charConf.eventScope && charConf.eventScope.indexOf(eventData.type) === -1) {
          continue;
        }

        // 幂等键：角色ID + 事件来源ID + 事件类别 + 当天日期
        var idempotentKey = 'lg_care_' + cid + '_' + eventData.sourceId + '_' + eventData.type + '_' + getTodayStr();

        // 1. 长期独立去重索引检查（即使近期日志被截断淘汰也永不失效）
        if (dedupIndex[idempotentKey]) {
          results.push({ charId: cid, status: 'skipped', reason: 'already_delivered' });
          continue;
        }

        // 2. 近期日志辅助检查
        var existingInLogs = logs.find(function(l) { return l.idempotentKey === idempotentKey; });
        if (existingInLogs && existingInLogs.status === 'delivered') {
          dedupIndex[idempotentKey] = { deliveredAt: existingInLogs.deliveredAt || Date.now(), charId: cid };
          results.push({ charId: cid, status: 'skipped', reason: 'already_delivered' });
          continue;
        }

        // 3. 微信底层数据库实体验证（防备份恢复后或中途重启后的重复投递）
        if (window.db && db.messages && typeof db.messages.where === 'function') {
          try {
            var msgInDb = await db.messages.where('clientMessageId').equals(idempotentKey).first();
            if (msgInDb) {
              dedupIndex[idempotentKey] = { deliveredAt: msgInDb.createdAt || nowMs(), charId: cid };
              results.push({ charId: cid, status: 'skipped', reason: 'already_delivered' });
              continue;
            }
          } catch (_) {}
        }

        // 4. 跨模块协调防重（检查成就馆独立去重索引，避免同一任务/升级/里程碑重复轰炸微信）
        if (window.AchievementHallCompanion && typeof window.AchievementHallCompanion.hasHandledCrossModule === 'function') {
          try {
            var ahHandled = await window.AchievementHallCompanion.hasHandledCrossModule(cid, eventData.sourceId, null);
            if (ahHandled) {
              results.push({ charId: cid, status: 'skipped', reason: 'cross_module_dedup_conflict' });
              continue;
            }
          } catch (_) {}
        }

        // 频次上限检查
        var todayCount = logs.filter(function(l) {
          return l.charId === cid && l.status === 'delivered' && l.deliveredAt >= startOfToday;
        }).length;

        if (todayCount >= charConf.dailyLimit) {
          logs.unshift({
            id: uid('clog'),
            idempotentKey: idempotentKey,
            charId: cid,
            charName: char.name,
            sourceId: eventData.sourceId,
            eventType: eventData.type,
            eventTitle: eventData.title,
            status: 'skipped',
            skipReason: '今日关心频次已达上限 (' + charConf.dailyLimit + '条)',
            createdAt: Date.now()
          });
          results.push({ charId: cid, status: 'skipped', reason: 'daily_limit' });
          continue;
        }

        var weekCount = logs.filter(function(l) {
          return l.charId === cid && l.status === 'delivered' && l.deliveredAt >= startOfWeek;
        }).length;

        if (weekCount >= charConf.weeklyLimit) {
          logs.unshift({
            id: uid('clog'),
            idempotentKey: idempotentKey,
            charId: cid,
            charName: char.name,
            sourceId: eventData.sourceId,
            eventType: eventData.type,
            eventTitle: eventData.title,
            status: 'skipped',
            skipReason: '本周关心频次已达上限 (' + charConf.weeklyLimit + '条)',
            createdAt: Date.now()
          });
          results.push({ charId: cid, status: 'skipped', reason: 'weekly_limit' });
          continue;
        }

        // 尝试生成祝贺词
        var genResult = await this.generateCongratulationText(char, eventData.type, eventData.title, userProfile);

        // 如果 AI 失败且用户在设置中关闭了离线模版兜底，严格禁止发送
        if (genResult.failed && config.allowOfflineFallback === false) {
          logs.unshift({
            id: uid('clog'),
            idempotentKey: idempotentKey,
            charId: cid,
            charName: char.name,
            sourceId: eventData.sourceId,
            eventType: eventData.type,
            eventTitle: eventData.title,
            status: 'skipped',
            skipReason: 'AI祝贺异常且用户已关闭离线心意寄语兜底',
            createdAt: Date.now()
          });
          results.push({ charId: cid, status: 'skipped', reason: 'ai_failed_and_offline_fallback_disabled' });
          continue;
        }

        // 关键安全防线：AI 请求返回后、微信消息落库前，再次二次核查授权与角色存活（防止生成期间用户撤销授权或删除 Char）
        var latestConfig = await this.getSettings();
        if (!latestConfig.globalEnabled) {
          results.push({ charId: cid, status: 'aborted', reason: 'global_disabled_during_generation' });
          continue;
        }

        var latestCharConf = this.getCharSettings(cid, latestConfig);
        if (!latestCharConf.enabled || (latestCharConf.eventScope && latestCharConf.eventScope.indexOf(eventData.type) === -1)) {
          results.push({ charId: cid, status: 'aborted', reason: 'char_permission_revoked_during_generation' });
          continue;
        }

        // 验证该 Char 是否在角色数据库中已被删除
        var charInDb = await db.characters.get(Number(char.id) || char.id);
        if (!charInDb || charInDb.type === 'user') {
          results.push({ charId: cid, status: 'aborted', reason: 'char_deleted' });
          continue;
        }

        // 验证用户在 AI 期间是否刚刚开启了自习室专注心流
        if (this.isUserFocusing()) {
          results.push({ charId: cid, status: 'aborted', reason: 'user_entered_focus' });
          continue;
        }

        // 安全投递至微信原生数据库
        try {
          var eventTag = genResult.isOfflineTemplate ?
            '来自人生游戏 · 成长祝贺 (心意寄语)' :
            ('来自人生游戏 · ' + (eventData.type === 'level_up' ? '升级纪念' : (eventData.type === 'goal_achieved' ? '愿景达成' : '委托完成')));

          var delivery = await this.deliverToWechat(char, genResult.text, idempotentKey, eventTag, {
            externalEventId: eventData.sourceId,
            isOfflineTemplate: genResult.isOfflineTemplate,
            source: genResult.source
          });

          // 无论日志是否截断，原子更新长期独立去重索引
          dedupIndex[idempotentKey] = {
            deliveredAt: delivery.deliveredAt,
            charId: cid,
            sourceId: eventData.sourceId,
            eventType: eventData.type,
            isOfflineTemplate: genResult.isOfflineTemplate
          };

          logs.unshift({
            id: uid('clog'),
            idempotentKey: idempotentKey,
            charId: cid,
            charName: char.name,
            sourceId: eventData.sourceId,
            eventType: eventData.type,
            eventTitle: eventData.title,
            status: 'delivered',
            deliveredAt: delivery.deliveredAt,
            messageId: delivery.messageId,
            content: genResult.text,
            isOfflineTemplate: genResult.isOfflineTemplate,
            source: genResult.source,
            createdAt: Date.now()
          });

          results.push({
            charId: cid,
            status: 'delivered',
            text: genResult.text,
            isOfflineTemplate: genResult.isOfflineTemplate,
            source: genResult.source
          });
        } catch (delivErr) {
          console.error('[LifeGameCompanion] Deliver congratulation failed for char:', cid, delivErr);
          logs.unshift({
            id: uid('clog'),
            idempotentKey: idempotentKey,
            charId: cid,
            charName: char.name,
            sourceId: eventData.sourceId,
            eventType: eventData.type,
            eventTitle: eventData.title,
            status: 'failed',
            skipReason: delivErr.message || '投递异常',
            createdAt: Date.now()
          });
        }
      }

      await this.saveDedupIndex(dedupIndex);
      await this.saveLogs(logs);
      return { triggered: true, results: results };
    }
  };

  // ====================================================
  // 八、对外部暴露的核心命名空间 (LifeGameCompanion)
  // ====================================================
  var LifeGameCompanion = {
    PlayerProfile: PlayerProfileService,
    Achievements: AchievementHallService,
    Journal: AdventureJournalService,
    MementoCards: MementoCardService,
    Companion: CompanionCareEngine,
    setClock: function(fn) {
      _clockFn = typeof fn === 'function' ? fn : null;
    },

    // 核心生命周期钩子：当任务被领取时调用
    async onTaskClaimed(task, expResult) {
      if (!task) return;
      var exp = (expResult && expResult.expGranted) || task.rewardExp || 0;

      // 1. 记入六维属性真实轨迹
      if (task.statBonus) {
        await PlayerProfileService.recordStatGain(
          task.statBonus,
          task.title,
          'task',
          'task_stat_' + task.id + '_' + (task.claimedAt || Date.now())
        );
      }

      // 2. 记入冒险手账真实时间轴
      await AdventureJournalService.recordEvent({
        type: 'quest',
        category: task.category || 'daily',
        eventId: 'jnl_task_' + task.id,
        title: task.title,
        desc: task.desc || '',
        meta: {
          exp: exp,
          coins: task.rewardCoins || 0,
          stats: task.statBonus || {},
          category: task.category
        },
        tags: [task.category === 'main' ? '主线委托' : '现实委托']
      });

      // 3. 检查成就解锁
      await AchievementHallService.checkAutoUnlocks({ type: 'task_claimed', task: task });

      // 4. 触发纪念卡与伴侣祝贺
      if (task.category === 'main') {
        // 主线完成生成纪念卡
        await MementoCardService.createCard({
          sourceEventId: 'card_task_' + task.id,
          cardType: 'major_quest',
          title: '主线开拓：' + task.title,
          subtitle: '现实主线重要里程碑攻坚完成',
          quote: '迈过现实重峦，终见云开月明。每一步跨越都是超维成长的见证。'
        });

        // 尝试触发伴侣祝贺
        await CompanionCareEngine.triggerCompanionEvent({
          type: 'main_quest',
          sourceId: task.id,
          title: task.title
        });
      }

      // 若发生升级
      if (expResult && expResult.leveledUp) {
        await this.onLevelUp(expResult.newLevel);
      }
    },

    // 核心生命周期钩子：当等级提升时调用
    async onLevelUp(newLevel) {
      var lifeState = window.LifeGameService ? await window.LifeGameService.getState() : { stats: {} };

      // 1. 记入手账
      await AdventureJournalService.recordEvent({
        type: 'level_up',
        category: 'growth',
        eventId: 'jnl_levelup_' + newLevel + '_' + Date.now(),
        title: '冒险等级突破至 LV.' + newLevel + '！',
        desc: '六维潜能全面跃迁，获得全新成长称号。',
        meta: { level: newLevel, stats: lifeState.stats },
        tags: ['升级纪念', '破阶跃迁']
      });

      // 2. 自动生成升级纪念卡
      await MementoCardService.createCard({
        sourceEventId: 'card_levelup_' + newLevel,
        cardType: 'level_up',
        title: '等级跃升 · LV.' + newLevel,
        subtitle: '冒险者突破全新境界',
        levelSnapshot: newLevel,
        statsSnapshot: lifeState.stats,
        quote: '现实的汗水凝结为星辰，前路漫漫，步履不停。'
      });

      // 3. 检查成就
      await AchievementHallService.checkAutoUnlocks({ type: 'level_up', level: newLevel });

      // 4. 触发伴侣祝贺
      await CompanionCareEngine.triggerCompanionEvent({
        type: 'level_up',
        sourceId: 'levelup_' + newLevel,
        title: '冒险者等级跃升至 LV.' + newLevel
      });
    },

    // 核心生命周期钩子：当愿景里程碑或最终目标达成时调用
    async onGoalMilestoneClaimed(goal, milestone, expResult) {
      if (!goal || !milestone) return;

      // 1. 记录属性轨迹
      if (milestone.statBonus) {
        await PlayerProfileService.recordStatGain(
          milestone.statBonus,
          '达成里程碑：' + milestone.title,
          'milestone',
          'ms_stat_' + milestone.id
        );
      }

      // 2. 记入手账
      await AdventureJournalService.recordEvent({
        type: 'milestone',
        category: 'main',
        eventId: 'jnl_ms_' + milestone.id,
        title: '愿景里程碑攻克：' + milestone.title,
        desc: '属于长期目标【' + goal.title + '】的关键攻坚节点',
        meta: {
          goalTitle: goal.title,
          exp: milestone.expReward || 60
        },
        tags: ['长期愿景', '关键里程碑']
      });

      // 3. 检查是否全目标达成
      var allDone = (goal.milestones || []).every(function(m) { return m.done; });
      if (allDone) {
        await MementoCardService.createCard({
          sourceEventId: 'card_goal_' + goal.id,
          cardType: 'goal_complete',
          title: '宏图愿景圆满：' + goal.title,
          subtitle: '长期愿景全里程碑征服纪念',
          quote: '最初的梦想，终在今日化为现实。所有坚持都是对时光最好的答卷。'
        });

        await CompanionCareEngine.triggerCompanionEvent({
          type: 'goal_achieved',
          sourceId: goal.id,
          title: goal.title
        });
      }

      // 4. 检查成就
      await AchievementHallService.checkAutoUnlocks({ type: 'milestone_claimed' });
    }
  };

  // 挂载至全局
  global.LifeGameCompanion = LifeGameCompanion;

})(typeof window !== 'undefined' ? window : this);
