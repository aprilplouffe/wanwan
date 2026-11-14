// scripts/test-achievement-hall-phase1.cjs
// 弯弯小手机｜成就馆 1.0 第一阶段自动化验证套件

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  [PASS] ' + msg);
  } else {
    failed++;
    console.error('  [FAIL] ' + msg);
  }
}

// ====================================================
// 轻量内存 Mock 环境（模拟 Dexie db + localStorage + DOM）
// ====================================================
function createMockEnv() {
  const storeConfig = new Map();
  const storeCharacters = [
    { id: 1, name: '江屿', nickname: '阿屿' },
    { id: 2, name: '沈清川', nickname: '清川' }
  ];
  const storeMessages = [];
  const storeChats = [];
  const lsMap = new Map();

  const db = {
    config: {
      async get(k) {
        return storeConfig.has(k) ? { key: k, value: JSON.parse(JSON.stringify(storeConfig.get(k))) } : undefined;
      },
      async put(obj) {
        storeConfig.set(obj.key, JSON.parse(JSON.stringify(obj.value)));
      },
      async toArray() {
        return Array.from(storeConfig.entries()).map(([key, value]) => ({
          key,
          value: JSON.parse(JSON.stringify(value))
        }));
      }
    },
    characters: {
      async toArray() { return JSON.parse(JSON.stringify(storeCharacters)); },
      async get(id) { return storeCharacters.find(c => String(c.id) === String(id)) || null; }
    },
    messages: {
      async toArray() { return JSON.parse(JSON.stringify(storeMessages)); }
    },
    chats: {
      async toArray() { return JSON.parse(JSON.stringify(storeChats)); }
    }
  };

  const localStorageMock = {
    getItem(k) { return lsMap.has(k) ? lsMap.get(k) : null; },
    setItem(k, v) { lsMap.set(k, String(v)); },
    removeItem(k) { lsMap.delete(k); }
  };

  const domElements = [];
  const mockDoc = {
    body: {
      children: domElements,
      appendChild(el) { domElements.push(el); }
    },
    getElementById(id) {
      return domElements.find(el => el.id === id) || null;
    },
    querySelectorAll() { return []; },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        innerHTML: '',
        style: {},
        attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        getAttribute(k) { return this.attrs[k] || ''; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        remove() {
          const idx = domElements.indexOf(this);
          if (idx >= 0) domElements.splice(idx, 1);
        }
      };
    }
  };

  const navCalls = [];
  const toasts = [];

  global.window = global;
  global.db = db;
  global.localStorage = localStorageMock;
  global.document = mockDoc;
  global.toast = (msg) => { toasts.push(String(msg)); };
  global.openPage = (el) => { mockDoc.body.appendChild(el); };
  global.closePage = (id) => {
    const el = mockDoc.getElementById(id);
    if (el) el.remove();
  };
  global.showLifeGamePage = async (opts) => { navCalls.push({ app: 'life-game', opts }); };
  global.showStudyRoomPage = async (opts) => { navCalls.push({ app: 'study-room', opts }); };
  global.showTimeCalendarPage = async (opts) => { navCalls.push({ app: 'time-calendar', opts }); };
  global.showLoveDiaryPage = async (opts) => { navCalls.push({ app: 'love-diary', opts }); };

  return {
    storeConfig,
    storeMessages,
    storeChats,
    lsMap,
    domElements,
    navCalls,
    toasts,
    clearAll() {
      storeConfig.clear();
      lsMap.clear();
      storeMessages.length = 0;
      storeChats.length = 0;
      domElements.length = 0;
      navCalls.length = 0;
      toasts.length = 0;
    }
  };
}

async function runTests() {
  console.log('=== 弯弯小手机｜成就馆 1.0 第一阶段自动化验证 ===');
  const env = createMockEnv();

  // 加载 shared-hub 与 achievement-hall
  require(path.resolve(__dirname, '../js/shared-hub.js'));
  require(path.resolve(__dirname, '../js/achievement-hall.js'));

  const AH = global.AchievementHall;
  assert(Boolean(AH), 'AchievementHall 全局模块加载成功');

  // ----------------------------------------------------
  // Suite 1: 成就定义唯一 ID、6 大分类与健康规范校验
  // ----------------------------------------------------
  console.log('\n>>> [Suite 1] 定义目录唯一 ID、6大分类、健康作息规范');
  {
    const defs = AH.getDefinitions();
    const ids = defs.map(d => d.achievementId);
    const uniqueIds = new Set(ids);
    assert(ids.length >= 24 && ids.length === uniqueIds.size, '所有成就定义均具备唯一 achievementId (' + ids.length + ' 条)');

    const names = defs.map(d => d.name);
    const hasUniqueNames = new Set(names).size === names.length;
    assert(hasUniqueNames, '成就名称互不混淆，但核心存储严格以 achievementId 为键');

    const cats = AH.getCategories();
    const expectedCats = ['growth', 'study', 'time', 'bond', 'special', 'treasured'];
    assert(
      cats.length === 6 && expectedCats.every(k => cats.some(c => c.key === k)),
      '完整支持 6 大规划分类: growth/study/time/bond/special/treasured'
    );
    expectedCats.forEach(k => {
      assert(defs.some(d => d.category === k), '分类 [' + k + '] 至少包含真实成就定义');
    });

    // 未知/可扩展分类兼容
    const unknownCat = AH.getCategoryMeta('future_festival_category');
    assert(unknownCat && unknownCat.key === 'future_festival_category' && unknownCat.name === 'future_festival_category', '未来新增分类无需硬改核心模型即可优雅识别');

    // 不健康熬夜成就严禁出现在活跃目录
    const hasBadNight = defs.some(d => d.achievementId === 'badge_deep_night_whisper' || /夜深\s*2\s*点|熬夜/.test(d.description));
    assert(!hasBadNight, '活跃成就目录绝不包含熬夜或凌晨不健康引导');
  }

  // ----------------------------------------------------
  // Suite 2: 空数据/首次进入初始化 & 重复进页面零刷奖
  // ----------------------------------------------------
  console.log('\n>>> [Suite 2] 空数据初始化与防重复进页面刷奖');
  {
    env.clearAll();
    const vm1 = await AH.getHallViewModel();
    assert(vm1.unlockedCount === 0, '空数据库首次打开成就馆：已解锁数量严格为 0（不伪造已解锁）');
    assert(vm1.totalCount >= 24 && vm1.progressPercent === 0, '空数据库总体收集进度为 0% 且正常渲染全部定义');
    assert(vm1.recentUnlocks.length === 0, '空数据时最近获得列表为空');

    // 模拟反复打开与关闭页面 5 次
    for (let i = 0; i < 5; i++) {
      await global.showAchievementPage();
    }
    const pageCount = env.domElements.filter(el => el.id === 'achievement-page').length;
    assert(pageCount === 1, '反复打开成就馆时 DOM 严格防重（始终仅挂载 1 个 #achievement-page）');

    const vmAfterOpen = await AH.getHallViewModel();
    assert(vmAfterOpen.unlockedCount === 0 && vmAfterOpen.totalScore === 0, '重复打开页面绝不刷取任何成就或荣誉点数');
  }

  // ----------------------------------------------------
  // Suite 3: 隐藏成就隐私脱敏（未解锁遮罩 vs 解锁揭晓）
  // ----------------------------------------------------
  console.log('\n>>> [Suite 3] 隐藏成就脱敏保护（未解锁不泄密，解锁后揭晓）');
  {
    env.clearAll();
    const vmLocked = await AH.getHallViewModel();
    const hiddenItem = vmLocked.items.find(i => i.achievementId === 'badge_peaceful_night');
    assert(hiddenItem && hiddenItem.isHidden === true && hiddenItem.isMasked === true, '隐藏成就未解锁前标记为 isMasked');
    assert(hiddenItem.name === '？？？', '隐藏成就未解锁前标题严格遮罩为「？？？」，不泄漏「夜幕归宁」');
    assert(hiddenItem.description.indexOf('22:30') === -1 && hiddenItem.conditionText.indexOf('22:30') === -1, '隐藏成就未解锁前不泄漏秘密时间或条件');

    // 显式解锁该隐藏成就后再次查询展示
    await AH.unlockAchievement('badge_peaceful_night');
    const vmUnlocked = await AH.getHallViewModel();
    const revealedItem = vmUnlocked.items.find(i => i.achievementId === 'badge_peaceful_night');
    assert(revealedItem && revealedItem.unlocked === true && revealedItem.isMasked === false, '隐藏成就解锁后解除遮罩');
    assert(revealedItem.name === '夜幕归宁' && revealedItem.conditionText.indexOf('22:30') !== -1, '解锁后完整展示真实名称与条件');
  }

  // ----------------------------------------------------
  // Suite 4: 只读进度计算边界（0% / 进行中 / 封顶 100% / 缺源容错）
  // ----------------------------------------------------
  console.log('\n>>> [Suite 4] 真实数据进度计算边界与缺失数据容错');
  {
    env.clearAll();
    // 设置部分自习记录（30 分钟，小于目标 45 和 100）+ 超越目标的等级 LV.15（目标 LV.5 / LV.10）
    await global.db.config.put({
      key: 'wanwan_study_records',
      value: [
        { id: 'r1', durationMinutes: 30, createdAt: Date.now() },
        { id: 'r2', durationMinutes: 25, createdAt: Date.now() },
        null, // 脏条目容错
        { id: 'r_bad', durationMinutes: -10 } // 负数边界
      ]
    });
    await global.db.config.put({
      key: 'life_game_state_v2',
      value: { level: 15, exp: 999, coins: 888, stats: { INT: 50 } }
    });
    // 故意不写入 time_calendar_events 与 coupleSpaceSettings，模拟部分 App 无数据

    const vm = await AH.getHallViewModel();
    const focus100 = vm.items.find(i => i.achievementId === 'badge_focus_century');
    const lv5 = vm.items.find(i => i.achievementId === 'badge_level_5');
    const calChronos = vm.items.find(i => i.achievementId === 'badge_calendar_chronos');

    assert(focus100 && focus100.progress.current === 55 && focus100.progress.percent === 55, '自习室真实累计分钟进度计算准确 (55/100 => 55%)');
    assert(lv5 && lv5.progress.percent === 100 && lv5.unlocked === false, '超越目标时进度百分比严格封顶 100%，且 Phase 1 只读展示不越权自动解锁');
    assert(calChronos && calChronos.progress.current === 0 && calChronos.progress.percent === 0, '缺失时光日历数据时安全降级为 0% 不报错');
  }

  // ----------------------------------------------------
  // Suite 5: 重复解锁防护、并发锁、收藏置顶与废弃定义容错
  // ----------------------------------------------------
  console.log('\n>>> [Suite 5] 重复解锁防护、并发去重与已删除定义容错');
  {
    env.clearAll();
    const [r1, r2] = await Promise.all([
      AH.unlockAchievement('badge_focus_novice'),
      AH.unlockAchievement('badge_focus_novice')
    ]);
    assert((r1.ok && !r2.ok) || (!r1.ok && r2.ok), '并发同时触发同一成就解锁时互斥锁精准拦截重复请求');

    const stateAfterFirst = await AH.loadState();
    const firstTime = stateAfterFirst.unlockRecords['badge_focus_novice'].unlockedAt;
    const scoreFirst = stateAfterFirst.totalScore;

    const r3 = await AH.unlockAchievement('badge_focus_novice');
    const achSvcDup = await global.AchievementService.checkAndUnlockBadge('badge_focus_novice');
    assert(r3.ok === false && r3.alreadyUnlocked === true && achSvcDup === false, '已解锁成就不允许重复解锁');

    const stateAfterDup = await AH.loadState();
    assert(stateAfterDup.unlockRecords['badge_focus_novice'].unlockedAt === firstTime, '重复触发不覆盖首次解锁时间');
    assert(stateAfterDup.totalScore === scoreFirst, '重复触发绝不重复累加荣誉点');

    // 已删除或废弃 ID 的详情读取与历史兼容容错
    await global.db.config.put({
      key: 'achievement_hall_state_v2',
      value: {
        equippedTitle: '旧旅人',
        totalScore: 500,
        badges: [
          { id: 'removed_old_badge_xyz', name: '已下线徽章', unlocked: true, unlockedAt: 1700000000000 },
          { id: 'badge_deep_night_whisper', name: '熬夜旧徽章', unlocked: true, unlockedAt: 1700000000000 }
        ]
      }
    });
    const vmLegacySafe = await AH.getHallViewModel();
    const detailRemoved = AH.getAchievementDetail('removed_old_badge_xyz', await AH.loadState(), await AH.readSourceSnapshot());
    assert(vmLegacySafe && vmLegacySafe.archivedCount === 1, '已下线历史成就定义读取绝不崩溃且可安全统计归档');
    assert(detailRemoved === null, '未知/已废弃成就详情查询安全返回 null 不抛异常');

    // 收藏置顶切换
    const f1 = await AH.toggleFavorite('badge_focus_novice');
    const f2 = await AH.toggleFavorite('badge_focus_novice');
    assert(f1 === true && f2 === false, '收藏置顶与取消置顶持久化一致');
  }

  // ----------------------------------------------------
  // Suite 6: 旧数据迁移 & 完整备份恢复一致性
  // ----------------------------------------------------
  console.log('\n>>> [Suite 6] 旧版数据结构迁移与备份恢复链路一致性');
  {
    env.clearAll();
    const oldTs = 1710000000000;
    await global.db.config.put({
      key: 'achievement_hall_state_v2',
      value: {
        equippedTitle: '远航者',
        totalScore: 300,
        badges: [
          { id: 'badge_calendar_chronos', name: '光阴旅者', category: 'life', unlocked: true, unlockedAt: oldTs },
          { id: 'badge_first_chat', name: '初遇之光', category: 'bond', unlocked: false, unlockedAt: null }
        ],
        fragments: [{ id: 'frag_custom', title: '碎片记忆', pieceCurrent: 4, pieceTotal: 4, unlocked: true }]
      }
    });
    await global.db.config.put({
      key: 'life_game_favorite_badges_v1',
      value: ['badge_calendar_chronos']
    });

    const migrated = await AH.loadState();
    assert(
      migrated.unlockRecords['badge_calendar_chronos'] &&
      migrated.unlockRecords['badge_calendar_chronos'].unlocked === true &&
      migrated.unlockRecords['badge_calendar_chronos'].unlockedAt === oldTs &&
      migrated.unlockRecords['badge_calendar_chronos'].favorite === true,
      '旧版 badges 与 favorite 数组无损迁移至新版 unlockRecords'
    );

    // 模拟备份导出 -> 清空 -> 备份还原
    await AH.unlockAchievement('badge_study_todo_5');
    const backupSnapshot = await global.db.config.toArray();
    env.clearAll();
    const emptyVm = await AH.getHallViewModel();
    assert(emptyVm.unlockedCount === 0, '清空数据库后状态归零');

    for (const row of backupSnapshot) {
      await global.db.config.put(row);
    }
    const restoredVm = await AH.getHallViewModel();
    const chronos = restoredVm.items.find(i => i.achievementId === 'badge_calendar_chronos');
    const todo5 = restoredVm.items.find(i => i.achievementId === 'badge_study_todo_5');
    assert(
      chronos && chronos.unlocked && chronos.favorite &&
      todo5 && todo5.unlocked &&
      restoredVm.equippedTitle === '远航者',
      '备份恢复后所有解锁记录、收藏置顶、解锁时间与佩戴头衔完整还原'
    );
  }

  // ----------------------------------------------------
  // Suite 7: 权威数据源零污染校验 (人生游戏 / 自习室 / 时光日历)
  // ----------------------------------------------------
  console.log('\n>>> [Suite 7] 权威数据源只读零污染边界验证');
  {
    env.clearAll();
    const lgSnapshotBefore = { level: 3, exp: 120, coins: 450, stats: { INT: 18, WIL: 15, CHA: 10, CRE: 12, PHY: 14, PER: 11 } };
    const lgTasksBefore = [{ id: 't1', title: '复习', status: 'pending', rewardExp: 30, rewardCoins: 20 }];
    const studyRecordsBefore = [{ id: 's1', durationMinutes: 40, subject: '高数' }];
    const studyTodosBefore = [{ id: 'td1', text: '背单词', done: false }];
    const calEventsBefore = [{ id: 'e1', title: '周会', date: '2026-05-01', status: 'pending' }];
    const calAnnsBefore = [{ id: 'a1', title: '纪念日', date: '2025-05-20' }];

    await global.db.config.put({ key: 'life_game_state_v2', value: lgSnapshotBefore });
    await global.db.config.put({ key: 'life_game_tasks_v1', value: lgTasksBefore });
    await global.db.config.put({ key: 'wanwan_study_records', value: studyRecordsBefore });
    await global.db.config.put({ key: 'wanwan_study_todos', value: studyTodosBefore });
    await global.db.config.put({ key: 'time_calendar_events', value: calEventsBefore });
    await global.db.config.put({ key: 'time_calendar_anniversaries', value: calAnnsBefore });

    // 执行多次读取、打开页面、解锁与切换收藏操作
    await global.showAchievementPage();
    await AH.getHallViewModel();
    await AH.unlockAchievement('badge_focus_novice');
    await AH.toggleFavorite('badge_focus_novice');

    const lgAfter = (await global.db.config.get('life_game_state_v2')).value;
    const lgTasksAfter = (await global.db.config.get('life_game_tasks_v1')).value;
    const studyRecAfter = (await global.db.config.get('wanwan_study_records')).value;
    const studyTodoAfter = (await global.db.config.get('wanwan_study_todos')).value;
    const calEventsAfter = (await global.db.config.get('time_calendar_events')).value;
    const calAnnsAfter = (await global.db.config.get('time_calendar_anniversaries')).value;

    assert(JSON.stringify(lgAfter) === JSON.stringify(lgSnapshotBefore), '完全不修改人生游戏经验、金币、等级与六维属性');
    assert(JSON.stringify(lgTasksAfter) === JSON.stringify(lgTasksBefore), '完全不修改人生游戏任务状态');
    assert(JSON.stringify(studyRecAfter) === JSON.stringify(studyRecordsBefore) && JSON.stringify(studyTodoAfter) === JSON.stringify(studyTodosBefore), '完全不污染自习室专注记录与待办');
    assert(JSON.stringify(calEventsAfter) === JSON.stringify(calEventsBefore) && JSON.stringify(calAnnsAfter) === JSON.stringify(calAnnsBefore), '完全不篡改时光日历日程与纪念日');
  }

  // ----------------------------------------------------
  // Suite 8: 多 Char 隐私隔离 & 来源 App 跳转测试
  // ----------------------------------------------------
  console.log('\n>>> [Suite 8] 多 Char 数据严格隔离与来源 App 安全跳转');
  {
    env.clearAll();
    // 仅为 Char 1 开通情侣空间与 4 项已完成心愿；Char 2 未开通任何内容
    await global.db.config.put({
      key: 'coupleSpaceSettings',
      value: {
        activeCharId: '1',
        spaces: {
          '1': {
            status: 'accepted',
            anniversaryDate: '2026-01-01',
            letters: [{ id: 'l1' }, { id: 'l2' }],
            diaries: [{ id: 'd1' }],
            wishes: [{ id: 'w1', done: true }, { id: 'w2', done: true }, { id: 'w3', done: true }]
          }
        }
      }
    });
    await global.db.config.put({
      key: 'time_calendar_events',
      value: [
        { id: 'c1', title: 'Char1专属约会', status: 'completed', charId: '1', relationType: 'specificChar' },
        { id: 'c2', title: '个人私密日程', status: 'completed', visibility: 'private' }
      ]
    });

    const vmChar1 = await AH.getHallViewModel({ charScope: '1' });
    const vmChar2 = await AH.getHallViewModel({ charScope: '2' });
    const vmPersonal = await AH.getHallViewModel({ charScope: 'personal' });

    const c1Wish = vmChar1.items.find(i => i.achievementId === 'badge_love_wish_3');
    const c2Wish = vmChar2.items.find(i => i.achievementId === 'badge_love_wish_3');
    const pWish = vmPersonal.items.find(i => i.achievementId === 'badge_love_wish_3');
    const c2Cal = vmChar2.items.find(i => i.achievementId === 'badge_calendar_chronos');

    assert(c1Wish.progress.current === 3 && c1Wish.progress.percent === 100, 'Char 1 视角准确读取自身情侣心愿进度 (3/3)');
    assert(c2Wish.progress.current === 0 && c2Wish.progress.percent === 0, 'Char 2 视角绝不泄漏 Char 1 的恋爱记心愿数据');
    assert(pWish.progress.current === 0 && pWish.progress.text.indexOf('隔离') !== -1, '仅看个人视角严格隔离角色情侣空间隐私');
    assert(c2Cal.progress.current === 0, 'Char 2 视角绝不泄漏 Char 1 日程与个人 private 日程');

    // 来源 App 跳转测试
    const jumpStudy = await AH.navigateToSourceApp({ sourceApp: 'study-room', sourceTab: 'report' });
    const jumpCal = await AH.navigateToSourceApp({ sourceApp: 'time-calendar', sourceTab: 'schedule' });
    const jumpLg = await AH.navigateToSourceApp({ sourceApp: 'life-game', sourceTab: 'tasks' });
    const jumpLove = await AH.navigateToSourceApp({ sourceApp: 'love-diary', sourceTab: 'wishes' });
    assert(
      jumpStudy.ok && jumpCal.ok && jumpLg.ok && jumpLove.ok && env.navCalls.length === 4,
      '支持跳转至自习室/时光日历/人生游戏/恋爱记四类真实来源模块'
    );

    // 缺失模块降级提示
    const origOurHome = global.showOurHomePage;
    delete global.showOurHomePage;
    const jumpMissing = await AH.navigateToSourceApp({ sourceApp: 'our-home' });
    assert(jumpMissing.ok === false && env.toasts.some(t => t.indexOf('暂未就绪') !== -1), '目标模块未就绪时友好降级提示不崩溃');
    global.showOurHomePage = origOurHome;
  }

  // ----------------------------------------------------
  // Suite 9: CSS 主题、移动端 360-430px、触控尺寸与动效降级静态验证
  // ----------------------------------------------------
  console.log('\n>>> [Suite 9] 移动端 CSS 适配、主题变量与触控安全检查');
  {
    const cssText = fs.readFileSync(path.resolve(__dirname, '../css/achievement-hall.css'), 'utf8');
    const jsText = fs.readFileSync(path.resolve(__dirname, '../js/achievement-hall.js'), 'utf8');
    const htmlText = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

    assert(cssText.indexOf('var(--c-bg)') !== -1 && cssText.indexOf('var(--c-text)') !== -1 && cssText.indexOf('var(--c-surface)') !== -1, 'CSS 全面使用 base.css 明暗主题变量，天然适配浅色与深色模式');
    assert(cssText.indexOf('overflow-x: hidden') !== -1 && cssText.indexOf('minmax(0, 1fr)') !== -1, 'CSS 明确约束横向防溢出与 2 列弹性网格适配 360px–430px 屏幕');
    assert(cssText.indexOf('min-height: 44px') !== -1 && cssText.indexOf('min-width: 44px') !== -1, '按钮及卡片交互热区满足 >= 44px 移动端触控标准');
    assert(cssText.indexOf('prefers-reduced-motion: reduce') !== -1, 'CSS 尊重 prefers-reduced-motion 无障碍动效降级');
    assert(htmlText.indexOf('css/achievement-hall.css') !== -1 && htmlText.indexOf('js/achievement-hall.js') !== -1, 'index.html 正确引入成就馆独立样式与脚本');
    assert(jsText.indexOf('showAchievementPage') !== -1 && jsText.indexOf('closePage') !== -1, '成就馆接入全局 page 生命周期打开与返回机制');
  }

  console.log('\n=== 测试总结: 通过 ' + passed + ' 项, 失败 ' + failed + ' 项 ===');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
