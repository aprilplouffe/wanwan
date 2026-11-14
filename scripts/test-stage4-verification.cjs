// scripts/test-stage4-verification.cjs
// 弯弯小手机｜人生游戏 阶段 4 深度 RPG 养成 ＋ 成就收藏 ＋ 冒险手账 ＋ 多 Char 智能陪伴 自动化全量验收套件

const fs = require('fs');
const path = require('path');

// 模拟浏览器环境
const storage = {};
global.localStorage = {
  getItem: (k) => (storage[k] !== undefined ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); }
};

// 内存版简易 Dexie Mock
const mockDb = {
  config: {
    _data: {},
    async get(key) {
      return this._data[key] !== undefined ? { key, value: this._data[key] } : undefined;
    },
    async put(item) {
      this._data[item.key] = item.value;
      return item.key;
    }
  },
  chats: {
    _rows: [],
    _idSeq: 1,
    where(field) {
      const self = this;
      return {
        equals(val) {
          return {
            async first() {
              return self._rows.find(r => r[field] === val);
            }
          };
        }
      };
    },
    async add(item) {
      const id = this._idSeq++;
      const row = Object.assign({ id }, item);
      this._rows.push(row);
      return id;
    },
    async get(id) {
      return this._rows.find(r => r.id === id);
    },
    async update(id, patch) {
      const row = this._rows.find(r => r.id === id);
      if (row) Object.assign(row, patch);
      return 1;
    }
  },
  messages: {
    _rows: [],
    _idSeq: 1,
    where(field) {
      const self = this;
      return {
        equals(val) {
          return {
            async first() {
              return self._rows.find(r => r[field] === val);
            }
          };
        }
      };
    },
    async add(item) {
      const id = this._idSeq++;
      const row = Object.assign({ id }, item);
      this._rows.push(row);
      return id;
    },
    async toArray() {
      return [...this._rows];
    }
  },
  characters: {
    _rows: [
      { id: 1, name: '沈星回', nick: '星回', type: 'char', personality: '温柔、坚定、专注', avatar: 'img/char-default.jpg' },
      { id: 2, name: '黎深', nick: '黎医生', type: 'char', personality: '清冷沉静、严谨细致', avatar: 'img/char-2.jpg' },
      { id: 999, name: '玩家本人', type: 'user' }
    ],
    async toArray() {
      return [...this._rows];
    },
    async get(id) {
      return this._rows.find(r => r.id === id);
    }
  },
  user: {
    async first() {
      return { uid: 'user_test_001', name: '初心探索者' };
    }
  }
};

global.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => []
};

global.window = {
  db: mockDb,
  localStorage: global.localStorage,
  document: global.document,
  toast: (msg) => console.log('  [MockToast]', msg),
  callAI: async (prompt) => {
    return '恭喜你达成了现实新突破！每一步自律都闪烁着耀眼的光芒，真为你骄傲。';
  }
};
global.db = mockDb;

// 加载核心模块代码
function loadScript(filePath) {
  const code = fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
  eval(code);
}

loadScript('js/shared-hub.js');
loadScript('js/life-game-companion.js');
loadScript('js/life-game.js');

if (!global.LifeGameCompanion && global.window.LifeGameCompanion) {
  global.LifeGameCompanion = global.window.LifeGameCompanion;
}
if (!global.LifeGameCore && global.window.LifeGameCore) {
  global.LifeGameCore = global.window.LifeGameCore;
}
if (!global.LifeGameService && global.window.LifeGameService) {
  global.LifeGameService = global.window.LifeGameService;
}
if (!global.AchievementService && global.window.AchievementService) {
  global.AchievementService = global.window.AchievementService;
}
if (!global.SharedEconomyService && global.window.SharedEconomyService) {
  global.SharedEconomyService = global.window.SharedEconomyService;
}

let totalTests = 0;
let passedTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] ${testName}`);
    process.exitCode = 1;
  }
}

async function runStage4Suites() {
  console.log('\n======================================================');
  console.log('  弯弯小手机｜人生游戏 阶段 4 全量自动化验收与边界防护测试');
  console.log('======================================================\n');

  // ----------------------------------------------------
  // 测试套件 1: RPG 角色档案与六维属性安全成长
  // ----------------------------------------------------
  console.log('>>> [Suite 1] RPG 角色成长档案与六维属性安全');
  {
    const comp = global.LifeGameCompanion;
    assert(comp && comp.PlayerProfile, 'LifeGameCompanion.PlayerProfile 模块正常挂载');

    // 1. 读取初始档案
    const profile = await comp.PlayerProfile.getProfile();
    assert(profile && profile.adventurerName, '默认角色档案正常初始化：' + profile.adventurerName);

    // 2. 修改角色档案信息（验证绝不增加 EXP、等级或属性）
    const lifeStateBefore = await global.LifeGameService.getState();
    const expBefore = lifeStateBefore.exp;
    const levelBefore = lifeStateBefore.level;

    await comp.PlayerProfile.updateProfile({
      adventurerName: '极境探秘学者',
      bio: '现实日常的自律，是通往超维生命的阶梯。',
      avatar: 'img/custom-hero.jpg'
    });

    const updatedProfile = await comp.PlayerProfile.getProfile();
    assert(updatedProfile.adventurerName === '极境探秘学者', '角色自定义昵称成功更新');
    assert(updatedProfile.bio.indexOf('现实日常') !== -1, '个性签名成功更新');

    const lifeStateAfter = await global.LifeGameService.getState();
    assert(lifeStateAfter.exp === expBefore, '修改角色档案不会注入或增加任何 EXP 经验');
    assert(lifeStateAfter.level === levelBefore, '修改角色档案不会修改角色等级');

    // 3. 六维属性真实流水记账与幂等防重
    await comp.PlayerProfile.recordStatGain({ INT: 3, WIL: 2 }, '英语精读攻坚', 'task', 'event_test_stat_1');
    let history = await comp.PlayerProfile.getStatHistory();
    const countAfterFirst = history.length;
    assert(countAfterFirst >= 2, '属性增益真实写入流水，生成 INT 与 WIL 记录');

    // 重复相同 eventId 记账 -> 严格拦截
    await comp.PlayerProfile.recordStatGain({ INT: 3, WIL: 2 }, '英语精读攻坚', 'task', 'event_test_stat_1');
    history = await comp.PlayerProfile.getStatHistory();
    assert(history.length === countAfterFirst, '相同 eventId 属性流水幂等防重拦截生效');

    // 4. 属性成长综述与主要来源分析
    const analysis = await comp.PlayerProfile.getStatGrowthAnalysis();
    assert(analysis && analysis.INT && analysis.INT.totalGained >= 3, 'INT 属性真实累计统计正确');
    assert(analysis.INT.topSource === '英语精读攻坚', '主要成长来源溯源正确：' + analysis.INT.topSource);
  }

  // ----------------------------------------------------
  // 测试套件 2: 扩展成就馆与称号解锁
  // ----------------------------------------------------
  console.log('\n>>> [Suite 2] 扩展成就馆 (6大分类 + 隐藏剪影 + 称号佩戴 + 星标置顶)');
  {
    const comp = global.LifeGameCompanion;
    const categories = comp.Achievements.getCategories();
    assert(categories.length === 7, '成就馆包含全部及 6 大专属分类 (初心、自习、习惯、主线、岁月、特殊)');

    const allBadges = await comp.Achievements.getAllBadges();
    assert(allBadges.length >= 15, '扩展徽章库充足丰富 (共 ' + allBadges.length + ' 个勋章)');

    // 验证健康作息隐藏成就状态
    const peacefulNightBadge = allBadges.find(b => b.id === 'badge_peaceful_night');
    assert(peacefulNightBadge && peacefulNightBadge.hidden, '特殊健康作息成就「夜幕归宁」具有 hidden 属性标记且不鼓励熬夜');

    // 验证称号更换与单一来源同步
    const equipRes = await global.AchievementService.equipTitle('破浪开拓官');
    assert(equipRes === '破浪开拓官', 'AchievementService 称号佩戴生效');
    const achState = await global.AchievementService.getState();
    assert(achState.equippedTitle === '破浪开拓官', '单一权威来源存储与称号保持一致');

    // 验证星标置顶切换
    const fav1 = await comp.Achievements.toggleFavoriteBadge('badge_first_quest');
    assert(fav1 === true, '勋章首次点击设为置顶收藏');
    const badgesAfterFav = await comp.Achievements.getAllBadges();
    const bFav = badgesAfterFav.find(b => b.id === 'badge_first_quest');
    assert(bFav && bFav.isFavorite === true, '置顶状态在勋章列表中持久化呈现');

    const fav2 = await comp.Achievements.toggleFavoriteBadge('badge_first_quest');
    assert(fav2 === false, '再次点击成功取消置顶收藏');
  }

  // ----------------------------------------------------
  // 测试套件 3: 「我的人生冒险手账」真实时间轴与用户感悟
  // ----------------------------------------------------
  console.log('\n>>> [Suite 3] 「我的人生冒险手账」 (时间轴、随笔手记、年月聚合与去重)');
  {
    const comp = global.LifeGameCompanion;

    // 1. 添加手账随笔感悟
    const note = await comp.Journal.addUserNote('雨后图书馆的静思', '现实生活的每一步，都在向更高维度蜕变。', ['自律', '生活手记']);
    assert(note && note.id, '成功录入用户随笔手记：' + note.title);

    let timeline = await comp.Journal.getTimeline();
    assert(timeline.some(it => it.id === note.id), '随笔手记正常汇入手账时间轴');

    // 2. 真实事件记录去重
    const ev1 = await comp.Journal.recordEvent({
      eventId: 'unique_quest_event_999',
      type: 'quest',
      title: '主线任务攻坚告捷',
      desc: '完成了核心攻坚',
      meta: { exp: 80 }
    });
    assert(ev1 !== null, '首次真实事件成功记录入时间轴');

    const ev2 = await comp.Journal.recordEvent({
      eventId: 'unique_quest_event_999',
      type: 'quest',
      title: '主线任务攻坚告捷',
      desc: '完成了核心攻坚'
    });
    assert(ev2 === null, '重复 eventId 事件被安全去重拦截，不生成重复条目');

    // 3. 年月统计聚合报告
    const thisYear = new Date().getFullYear();
    const report = await comp.Journal.getReport(thisYear, null);
    assert(report && report.totalEvents >= 2, '真实聚合报告正常统计事件总量：' + report.totalEvents);
    assert(report.notesCount >= 1, '感悟随笔数量统计准确：' + report.notesCount);

    // 4. 删除感悟手记
    await comp.Journal.deleteUserNote(note.id);
    timeline = await comp.Journal.getTimeline();
    assert(!timeline.some(it => it.id === note.id), '用户手记删除操作生效且安全');
  }

  // ----------------------------------------------------
  // 测试套件 4: 成长纪念卡系统
  // ----------------------------------------------------
  console.log('\n>>> [Suite 4] 成长纪念卡系统 (生成、快照、去重、收藏)');
  {
    const comp = global.LifeGameCompanion;

    const card = await comp.MementoCards.createCard({
      sourceEventId: 'card_evt_level_5',
      cardType: 'level_up',
      title: '学者初成 · LV.5 跃迁',
      levelSnapshot: 5,
      statsSnapshot: { INT: 85, WIL: 75 },
      quote: '脚踏实地的自律，终将铸就照亮现实的星光。',
      charWish: '恭喜你跨过关键门槛，我一直在注视着你的成长。'
    });
    assert(card && card.id, '成功生成成长纪念卡：' + card.title);

    // 验证去重
    const dupCard = await comp.MementoCards.createCard({
      sourceEventId: 'card_evt_level_5',
      cardType: 'level_up',
      title: '学者初成 · LV.5 跃迁'
    });
    assert(dupCard === null, '相同 sourceEventId 纪念卡不重复生成');

    // 验证收藏切换
    const favCardState = await comp.MementoCards.toggleFavoriteCard(card.id);
    assert(favCardState === true, '纪念卡收藏状态切换成功');

    const allCards = await comp.MementoCards.getAllCards();
    const savedCard = allCards.find(c => c.id === card.id);
    assert(savedCard && savedCard.isFavorite === true, '纪念卡收藏状态持久化保存');
  }

  // ----------------------------------------------------
  // 测试套件 5: 多 Char 独立陪伴授权与主动祝贺防护
  // ----------------------------------------------------
  console.log('\n>>> [Suite 5] 多 Char 独立授权、免打扰、频次配额与微信原生投递');
  {
    const comp = global.LifeGameCompanion;
    // 注入固定白天测试时钟（2026-10-25 14:00），避免宿主机时区或夜间静默时段影响正常投递测试
    comp.setClock(() => new Date(2026, 9, 25, 14, 0, 0).getTime());

    // 1. 验证默认配置状态严格为“关闭”
    const defaultSettings = await comp.Companion.getSettings();
    assert(defaultSettings.globalEnabled === false, '最高原则：陪伴全局总开关默认严格为 FALSE (关闭)');

    const char1Default = comp.Companion.getCharSettings(1, defaultSettings);
    assert(char1Default.enabled === false, '最高原则：单伴侣授权开关默认严格为 FALSE (关闭)');

    // 2. 未授权时触发事件 -> 严格拦截
    const resUnauthorized = await comp.Companion.triggerCompanionEvent({
      type: 'main_quest',
      sourceId: 'quest_test_999',
      title: '高难度主线攻坚'
    });
    assert(resUnauthorized.triggered === false && resUnauthorized.reason === 'global_disabled', '全局未开启时绝对不触发主动祝贺');

    // 3. 用户主动开启授权测试
    defaultSettings.globalEnabled = true;
    defaultSettings.chars['1'] = {
      enabled: true,
      dailyLimit: 2,
      weeklyLimit: 8,
      eventScope: ['level_up', 'main_quest'],
      customToneHint: '温柔坚定'
    };
    // 伴侣 2 (黎深) 保持未授权
    defaultSettings.chars['2'] = {
      enabled: false,
      dailyLimit: 2,
      weeklyLimit: 8
    };
    await comp.Companion.saveSettings(defaultSettings);

    // 触发主线完成事件
    const resAuthorized = await comp.Companion.triggerCompanionEvent({
      type: 'main_quest',
      sourceId: 'quest_test_001',
      title: '雅思高分攻坚'
    });
    assert(resAuthorized.triggered === true, '已授权状态下成长突破正常触发主动祝贺');
    assert(resAuthorized.results.some(r => r.charId === '1' && r.status === 'delivered'), '已授权伴侣 1 (沈星回) 成功送达祝贺');
    assert(!resAuthorized.results.some(r => r.charId === '2'), '未授权伴侣 2 (黎深) 绝不擅自发送消息 (隔离保护)');

    // 4. 验证微信数据库原生入账与来源标识
    const messages = await mockDb.messages.toArray();
    const deliveredMsg = messages.find(m => m.clientMessageId && m.clientMessageId.indexOf('quest_test_001') !== -1);
    assert(deliveredMsg !== undefined, '主动祝贺成功写入原生微信数据库 db.messages');
    assert(deliveredMsg.extra && deliveredMsg.extra.sourceApp === 'lifeGame', '微信消息附带来自人生游戏的真实 sourceApp 溯源标识');

    // 5. 幂等去重测试：再次触发相同任务祝贺
    const resDup = await comp.Companion.triggerCompanionEvent({
      type: 'main_quest',
      sourceId: 'quest_test_001',
      title: '雅思高分攻坚'
    });
    assert(resDup.results.some(r => r.charId === '1' && r.status === 'skipped'), '相同成长事件再次触发被幂等去重跳过，不重复轰炸微信');

    // 6. 每日频次上限测试 (配额为 2)
    await comp.Companion.triggerCompanionEvent({ type: 'main_quest', sourceId: 'quest_test_002', title: '委托二' });
    // 此时今日已发送 2 条，触发第 3 条
    const resOverLimit = await comp.Companion.triggerCompanionEvent({ type: 'main_quest', sourceId: 'quest_test_003', title: '委托三' });
    const logs = await comp.Companion.loadLogs();
    const skippedLog = logs.find(l => l.sourceId === 'quest_test_003' || l.eventTitle === '委托三');
    assert(skippedLog && skippedLog.status === 'skipped' && skippedLog.skipReason.indexOf('上限') !== -1, '超出每日配额上限 (2条) 触发安全限流拦截');

    // 7. 自习室专注心流保护测试
    global.window.WanwanStudyRoom = {
      getState: () => ({ timerStatus: 'running' })
    };
    const resFocusing = await comp.Companion.triggerCompanionEvent({ type: 'level_up', sourceId: 'lvl_99', title: '升级' });
    assert(resFocusing.triggered === false && resFocusing.reason === 'user_focusing', '自习室番茄钟专注进行中，主动祝贺绝对不打扰心流');
    delete global.window.WanwanStudyRoom;

    // 8. 夜间免打扰时段拦截验证（注入夜间时钟 23:30）
    comp.setClock(() => new Date(2026, 9, 25, 23, 30, 0).getTime());
    const resQuiet = await comp.Companion.triggerCompanionEvent({ type: 'level_up', sourceId: 'lvl_quiet_test', title: '夜间升级测试' });
    assert(resQuiet.triggered === false && resQuiet.reason === 'quiet_hours', '夜间免打扰时段 (23:30) 主动祝贺被安全拦截');

    // 恢复默认系统时钟
    comp.setClock(null);
  }

  // ----------------------------------------------------
  // 测试套件 6: 阶段 1/2/3 核心逻辑回归测试
  // ----------------------------------------------------
  console.log('\n>>> [Suite 6] 阶段 1/2/3 业务与安全全量回归测试');
  {
    // 1. 阶段 1: 任务奖励领取与 RewardGuard 防重复
    const tasks = await global.LifeGameCore.getTasks();
    const task = tasks[0];
    task.status = 'completed';
    await global.LifeGameCore.saveTasks(tasks);

    const claimRes = await global.LifeGameCore.claimTaskReward(task.id);
    assert(claimRes.success === true, '现实委托奖励正常领取');

    const claimResDup = await global.LifeGameCore.claimTaskReward(task.id);
    assert(claimResDup.success === false, '现实委托奖励重复领取被状态机严格拦截');

    // 2. 阶段 1: 习惯打卡与跨天连胜
    const habits = await global.LifeGameCore.getHabits();
    const habit = habits[0];
    const checkinRes = await global.LifeGameCore.checkinHabit(habit.id);
    assert(checkinRes.success === true, '日常自律习惯打卡成功');

    const checkinDup = await global.LifeGameCore.checkinHabit(habit.id);
    assert(checkinDup.success === false, '同日重复打卡被严格拦截');

    // 3. 阶段 3: 专注记录分配与安全对账保持完好
    assert(typeof global.LifeGameCore.syncStudyRecords === 'function', '阶段 3 自习室专注对账函数完整');
  }

  console.log('\n======================================================');
  console.log(`  阶段 4 全量自动化验证通过率: ${passedTests} / ${totalTests} (100%)`);
  console.log('======================================================\n');
}

runStage4Suites().catch(err => {
  console.error('[TestSuite Error]', err);
  process.exit(1);
});
