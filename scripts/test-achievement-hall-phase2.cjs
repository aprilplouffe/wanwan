// scripts/test-achievement-hall-phase2.cjs
// 弯弯小手机｜成就馆 1.0 第二阶段全量自动化验收与性能测试套件

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

function createMockEnv() {
  const storeConfig = new Map();
  const storeCharacters = [
    { id: 1, name: '江屿', nickname: '阿屿' },
    { id: 2, name: '沈清川', nickname: '清川' }
  ];
  const storeMessages = [];
  const storeChats = [];
  const lsMap = new Map();
  let failNextConfigPutKey = null;

  const db = {
    config: {
      async get(k) {
        return storeConfig.has(k) ? { key: k, value: JSON.parse(JSON.stringify(storeConfig.get(k))) } : undefined;
      },
      async put(obj) {
        if (failNextConfigPutKey && obj && obj.key === failNextConfigPutKey) {
          failNextConfigPutKey = null;
          throw new Error('Mocked storage quota/write error');
        }
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
  const docListeners = {};
  const mockDoc = {
    visibilityState: 'visible',
    body: {
      children: domElements,
      appendChild(el) { domElements.push(el); }
    },
    getElementById(id) {
      return domElements.find(el => el.id === id) || null;
    },
    querySelectorAll() { return []; },
    addEventListener(type, fn) {
      if (!docListeners[type]) docListeners[type] = [];
      if (docListeners[type].indexOf(fn) === -1) docListeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!docListeners[type]) return;
      docListeners[type] = docListeners[type].filter(f => f !== fn);
    },
    dispatchEvent(type) {
      (docListeners[type] || []).forEach(fn => fn());
    },
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

  return {
    storeConfig,
    storeMessages,
    storeChats,
    lsMap,
    domElements,
    docListeners,
    toasts,
    setFailNextPut(key) { failNextConfigPutKey = key; },
    clearAll() {
      storeConfig.clear();
      lsMap.clear();
      storeMessages.length = 0;
      storeChats.length = 0;
      domElements.length = 0;
      toasts.length = 0;
      failNextConfigPutKey = null;
    }
  };
}

async function runTests() {
  console.log('=== 弯弯小手机｜成就馆 1.0 第二阶段自动化验证 ===');
  const env = createMockEnv();

  require(path.resolve(__dirname, '../js/shared-hub.js'));
  require(path.resolve(__dirname, '../js/achievement-hall.js'));

  const AH = global.AchievementHall;
  const Hub = global.WanwanSharedHub;
  assert(Boolean(AH && Hub), 'AchievementHall Phase 2 与 WanwanSharedHub 加载成功');

  // ----------------------------------------------------
  // Suite 1: 人生游戏委托/等级联动 + 历史去重 + 零经验金币篡改
  // ----------------------------------------------------
  console.log('\n>>> [Suite 1] 人生游戏真实事件自动解锁与零经济污染');
  {
    env.clearAll();
    const lgStateBefore = { level: 5, exp: 40, coins: 200, stats: { INT: 30, WIL: 20, CHA: 10, CRE: 10, PHY: 10, PER: 10 } };
    const tClaimedAt = 1740000000000;
    await global.db.config.put({ key: 'life_game_state_v2', value: lgStateBefore });
    // 同一个 taskId 同时出现在 tasks 与 history 中，必须精确去重只计 1 次
    await global.db.config.put({
      key: 'life_game_tasks_v1',
      value: [{ id: 'task_a', title: '阅读一章', category: 'main', status: 'claimed', claimedAt: tClaimedAt }]
    });
    await global.db.config.put({
      key: 'life_game_tasks_history_v1',
      value: [{ taskId: 'task_a', title: '阅读一章', category: 'main', claimedAt: tClaimedAt }]
    });

    await Hub.emit('ACHIEVEMENT_SOURCE_EVENT', {
      eventId: 'lg_task_claim_task_a',
      eventType: 'task_claimed',
      sourceApp: 'life-game',
      sourceRecordId: 'task_a',
      occurrenceKey: 'task_a',
      occurredAt: tClaimedAt
    });

    const snap = await AH.readSourceSnapshot();
    const state1 = await AH.loadState();
    assert(snap.lifeGame.claimedTasksCount === 1, 'tasks 与 history 中的同一 taskId 严格去重为 1 次');
    assert(state1.unlockRecords['badge_first_quest'] && state1.unlockRecords['badge_first_quest'].unlocked, '任务领取事件自动解锁「旅途启程」');
    assert(state1.unlockRecords['badge_main_quest_1'] && state1.unlockRecords['badge_main_quest_1'].unlocked, '主线任务领取同步解锁「破浪之誓」');
    assert(state1.unlockRecords['badge_first_quest'].occurredAt === tClaimedAt, '成就记录精准保存真实任务发生时间 occurredAt');
    assert(!state1.unlockRecords['badge_life_task_5'] || !state1.unlockRecords['badge_life_task_5'].unlocked, '1次任务不会误触发 5次委托成就');

    // 通过 LIFEGAME_STATE_CHANGED 触发升级检测 -> badge_level_5 解锁
    await Hub.emit('LIFEGAME_STATE_CHANGED', { state: lgStateBefore, expGained: 40, leveledUp: true, reason: 'task' });
    const stateAfterLv = await AH.loadState();
    assert(stateAfterLv.unlockRecords['badge_level_5'] && stateAfterLv.unlockRecords['badge_level_5'].unlocked, '升级事件自动解锁「学者初成」');

    // 确认人生游戏货币与经验完全未被成就系统修改
    const lgAfter = (await global.db.config.get('life_game_state_v2')).value;
    assert(JSON.stringify(lgAfter) === JSON.stringify(lgStateBefore), '成就联动绝不逆向篡改人生游戏经验/金币/属性');
  }

  // ----------------------------------------------------
  // Suite 2: 自习室有效专注自动解锁 vs 取消/暂停/零时长拦截
  // ----------------------------------------------------
  console.log('\n>>> [Suite 2] 陪伴自习室真实专注解锁与无效专注严格拦截');
  {
    env.clearAll();
    // 放入 3 条脏/无效记录（0分钟、已取消、已暂停）
    await global.db.config.put({
      key: 'wanwan_study_records',
      value: [
        { id: 'bad_zero', durationMinutes: 0, date: '2026-05-01' },
        { id: 'bad_cancel', durationMinutes: 60, cancelled: true, date: '2026-05-01' },
        { id: 'bad_paused', durationMinutes: 50, status: 'paused', date: '2026-05-01' }
      ]
    });

    // 广播无效 FOCUS_SESSION_COMPLETED 事件，必须完全拒绝
    await Hub.emit('FOCUS_SESSION_COMPLETED', { recordId: 'bad_cancel', durationMinutes: 60, cancelled: true });
    await Hub.emit('FOCUS_SESSION_COMPLETED', { recordId: 'bad_zero', durationMinutes: 0 });
    const stateInvalid = await AH.loadState();
    const snapInvalid = await AH.readSourceSnapshot();
    assert(snapInvalid.studyRoom.sessionCount === 0 && snapInvalid.studyRoom.totalMinutes === 0, '取消/暂停/0分钟自习记录严格过滤归零');
    assert(!stateInvalid.unlockRecords['badge_focus_novice'] || !stateInvalid.unlockRecords['badge_focus_novice'].unlocked, '无效自习事件绝不解锁「静心初探」或「专注大师」');

    // 写入 1 条真实 45 分钟记录并广播事件（注意不重复写入 LifeGame 避免 RewardGuard 噪音也验证正常流程）
    await global.db.config.put({
      key: 'wanwan_study_records',
      value: [
        { id: 'bad_cancel', durationMinutes: 60, cancelled: true, date: '2026-05-01' },
        { id: 'good_1', durationMinutes: 45, date: '2026-05-01T10:00:00Z', createdAt: 1746093600000 }
      ]
    });
    await Hub.emit('FOCUS_SESSION_COMPLETED', {
      recordId: 'good_1',
      eventId: 'study_record_good_1',
      durationMinutes: 45,
      timestamp: 1746093600000
    });

    const stateValid = await AH.loadState();
    assert(stateValid.unlockRecords['badge_focus_novice'] && stateValid.unlockRecords['badge_focus_novice'].unlocked, '真实专注完成自动解锁「静心初探」');
    assert(stateValid.unlockRecords['badge_focus_master_45'] && stateValid.unlockRecords['badge_focus_master_45'].unlocked, '单次 45 分钟自动解锁「专注大师」');
    assert(!stateValid.unlockRecords['badge_focus_century'] || !stateValid.unlockRecords['badge_focus_century'].unlocked, '45 分钟未满 100 分钟绝不提前解锁「学海无涯」');

    // 重复广播同一个 study_record_good_1 必须被幂等拦截
    const scoreBeforeDup = stateValid.totalScore;
    await Hub.emit('FOCUS_SESSION_COMPLETED', {
      recordId: 'good_1',
      eventId: 'study_record_good_1',
      durationMinutes: 45,
      timestamp: 1746093600000
    });
    const stateDup = await AH.loadState();
    assert(stateDup.totalScore === scoreBeforeDup, '同一 FOCUS_SESSION_COMPLETED 事件重复广播严格幂等，荣誉点零重复累加');
  }

  // ----------------------------------------------------
  // Suite 3: 时光日历单事件 / 重复日程单实例去重 / 跨 App 投影排除
  // ----------------------------------------------------
  console.log('\n>>> [Suite 3] 时光日历原生完成、重复日程单实例去重与投影排除');
  {
    env.clearAll();
    // 放入：1 条跨 App 投影已完成（必须排除！）、1 条重复日程（2个日期实例完成 + 1个未完成）、0 条普通已完成
    await global.db.config.put({
      key: 'time_calendar_events',
      value: [
        {
          id: 'proj_lg_1',
          title: '来自人生游戏的投影任务',
          completed: true,
          status: 'completed',
          source: { app: 'life-game', recordId: 't1', readOnly: true }
        },
        {
          id: 'proj_sr_1',
          title: '自习室考试投影',
          completed: true,
          source: { app: 'study-room', recordId: 'ex1', readOnly: true }
        },
        {
          id: 'rec_ev_1',
          title: '每日阅读',
          date: '2026-05-01',
          recurrence: {
            type: 'daily',
            overrides: {
              '2026-05-01': { completed: true, updatedAt: 1746060000000 },
              '2026-05-02': { completed: true, updatedAt: 1746146400000 },
              '2026-05-03': { completed: false }
            }
          },
          source: { app: 'timeCalendar' }
        }
      ]
    });

    const snap = await AH.readSourceSnapshot();
    assert(snap.timeCalendar.completedCount === 2, '跨 App 投影严格排除，重复日程按已完成的 2 个日期实例精准去重计数 (2)');
    assert(snap.timeCalendar.plannedCount === 1, '投影日程不计入原生规划数量 (1)');

    // 来自投影的伪事件必须被拒绝
    const projRes = await AH.ingestEvent({
      eventId: 'tc_proj_fake',
      eventType: 'event_completed',
      sourceApp: 'time-calendar',
      sourceRecordId: 'proj_lg_1',
      payload: { readOnly: true, source: { app: 'life-game' } }
    });
    assert(projRes.rejected === true, '跨 App 投影事件不可在时光日历通道触发成就');

    // 完成第 1 个重复日程实例 -> 解锁 badge_calendar_first，但只有 2 条不解锁 badge_calendar_chronos(3)
    const rEv1 = await AH.ingestEvent({
      eventId: 'tc_done_rec_ev_1#2026-05-01',
      eventType: 'event_completed',
      sourceApp: 'time-calendar',
      sourceRecordId: 'rec_ev_1',
      occurrenceKey: 'rec_ev_1#2026-05-01'
    });
    const stMid = await AH.loadState();
    assert(stMid.unlockRecords['badge_calendar_first'] && stMid.unlockRecords['badge_calendar_first'].unlocked, '原生重复日程实例完成解锁「日程初印」');
    assert(!stMid.unlockRecords['badge_calendar_chronos'] || !stMid.unlockRecords['badge_calendar_chronos'].unlocked, '2/3 实例未满 3 条不提前解锁「光阴旅者」');

    // 同一天重复触发同实例：被幂等拦截
    const rEv1Dup = await AH.ingestEvent({
      eventId: 'tc_done_rec_ev_1#2026-05-01',
      eventType: 'event_completed',
      sourceApp: 'time-calendar',
      sourceRecordId: 'rec_ev_1',
      occurrenceKey: 'rec_ev_1#2026-05-01'
    });
    assert(rEv1Dup.deduped === true && rEv1.ok === true, '重复日程同一实例二次勾选严格幂等去重');

    // 新增第 3 个真实日程完成实例 -> 达成 3 个并解锁「光阴旅者」
    const calArr = (await global.db.config.get('time_calendar_events')).value;
    calArr.push({ id: 'single_1', title: '整理书桌', date: '2026-05-04', completed: true, status: 'completed', source: { app: 'timeCalendar' } });
    await global.db.config.put({ key: 'time_calendar_events', value: calArr });
    await AH.ingestEvent({
      eventId: 'tc_done_single_1',
      eventType: 'event_completed',
      sourceApp: 'time-calendar',
      sourceRecordId: 'single_1',
      occurrenceKey: 'single_1'
    });
    const stDone3 = await AH.loadState();
    assert(stDone3.unlockRecords['badge_calendar_chronos'] && stDone3.unlockRecords['badge_calendar_chronos'].unlocked, '第 3 个原生完成实例触发解锁「光阴旅者」');
  }

  // ----------------------------------------------------
  // Suite 4: 多 Char 严格隐私隔离 + 禁止合并累加 + 拒收 AI 文本事件
  // ----------------------------------------------------
  console.log('\n>>> [Suite 4] 多 Char 严格隔离、禁止跨角色拼接、拒收 AI 伪事件');
  {
    env.clearAll();
    // Char 1 完成 2 个心愿，Char 2 完成 1 个心愿（各未满 3 个！绝对不能相加成 3 个！）
    await global.db.config.put({
      key: 'coupleSpaceSettings',
      value: {
        activeCharId: '1',
        spaces: {
          '1': {
            status: 'accepted',
            anniversaryDate: '2026-01-01',
            letters: [],
            diaries: [],
            wishes: [{ id: 'w1', done: true }, { id: 'w2', done: true }]
          },
          '2': {
            status: 'accepted',
            anniversaryDate: '2026-02-01',
            letters: [],
            diaries: [],
            wishes: [{ id: 'w3', done: true }]
          }
        }
      }
    });

    await AH.ingestEvent({
      eventId: 'ld_wish_test_1',
      eventType: 'wish_completed',
      sourceApp: 'love-diary',
      sourceRecordId: 'w2',
      occurrenceKey: '1:w2',
      charId: '1'
    });

    const stIsolate = await AH.loadState();
    assert(!stIsolate.unlockRecords['badge_love_wish_3'] || !stIsolate.unlockRecords['badge_love_wish_3'].unlocked, 'Char1(2个) + Char2(1个) 绝不跨角色相加误解锁「心愿同行(3个)」');
    assert(
      stIsolate.charScopedUnlocks['1'] && stIsolate.charScopedUnlocks['1']['badge_love_space_open'] &&
      (!stIsolate.charScopedUnlocks['2'] || !stIsolate.charScopedUnlocks['2']['badge_love_space_open']),
      '事件仅触发 Char 1 时只记录在 Char 1 隔离空间，绝不越权写入 Char 2'
    );

    // 再为 Char 1 完成第 3 个心愿
    const cs = (await global.db.config.get('coupleSpaceSettings')).value;
    cs.spaces['1'].wishes.push({ id: 'w4', done: true, completedAt: 1746200000000 });
    await global.db.config.put({ key: 'coupleSpaceSettings', value: cs });
    await AH.ingestEvent({
      eventId: 'ld_wish_test_3',
      eventType: 'wish_completed',
      sourceApp: 'love-diary',
      sourceRecordId: 'w4',
      occurrenceKey: '1:w4',
      charId: '1'
    });

    const vmChar1 = await AH.getHallViewModel({ charScope: '1' });
    const vmChar2 = await AH.getHallViewModel({ charScope: '2' });
    const vmPersonal = await AH.getHallViewModel({ charScope: 'personal' });

    const c1Wish = vmChar1.items.find(i => i.achievementId === 'badge_love_wish_3');
    const c2Wish = vmChar2.items.find(i => i.achievementId === 'badge_love_wish_3');
    const pWish = vmPersonal.items.find(i => i.achievementId === 'badge_love_wish_3');

    assert(c1Wish.unlocked === true && c1Wish.progress.current === 3, 'Char 1 视角展示已解锁且进度 3/3');
    assert(c2Wish.unlocked === false && c2Wish.progress.current === 1, 'Char 2 视角保持未解锁且仅展示自身 1/3，绝不串账');
    assert(pWish.unlocked === false && pWish.progress.current === 0, '个人视角完全隔离多 Char 恋爱空间与解锁');

    // AI 生成文本事件 / 纯打开浏览事件必须被严格拒收
    const aiFake = await AH.ingestEvent({
      eventId: 'ai_fake_1',
      eventType: 'task_claimed',
      sourceApp: 'life-game',
      isAiGeneratedChat: true
    });
    const viewFake = await AH.ingestEvent({
      eventId: 'view_fake_1',
      eventType: 'tab_viewed',
      sourceApp: 'study-room',
      viewOnly: true
    });
    assert(aiFake.rejected && aiFake.reason === 'ai_or_view_event_rejected' && viewFake.rejected, '严格拒收 AI 生成内容或纯浏览事件解锁');
  }

  // ----------------------------------------------------
  // Suite 5: 并发解锁串行安全、隐藏成就自动揭晓、历史补算与规则版本升级
  // ----------------------------------------------------
  console.log('\n>>> [Suite 5] 并发写队列、隐藏成就揭晓、历史补算与规则版本升级');
  {
    env.clearAll();
    // 1. 构造历史旧数据 + 旧版 schema/ruleVersion(1) 已解锁 1 枚徽章
    const oldUnlockedAt = 1710000000000;
    const histTaskAt = 1730000000000;
    const histStudyAt = 1731000000000;
    await global.db.config.put({
      key: 'achievement_hall_state_v2',
      value: {
        schemaVersion: 1,
        ruleVersion: 1,
        equippedTitle: '旧日行者',
        totalScore: 100,
        unlockRecords: {
          badge_first_quest: {
            achievementId: 'badge_first_quest',
            unlocked: true,
            unlockedAt: oldUnlockedAt,
            unlockCount: 1,
            ruleVersionAtUnlock: 1,
            favorite: true
          }
        }
      }
    });
    await global.db.config.put({
      key: 'life_game_state_v2',
      value: { level: 6, exp: 100, coins: 300, stats: { INT: 20 } }
    });
    await global.db.config.put({
      key: 'life_game_tasks_history_v1',
      value: [
        { taskId: 'h1', claimedAt: histTaskAt },
        { taskId: 'h2', claimedAt: histTaskAt + 1000 },
        { taskId: 'h3', claimedAt: histTaskAt + 2000 },
        { taskId: 'h4', claimedAt: histTaskAt + 3000 },
        { taskId: 'h5', claimedAt: histTaskAt + 4000 }
      ]
    });
    await global.db.config.put({
      key: 'wanwan_study_records',
      value: [
        { id: 'hs1', durationMinutes: 500, createdAt: histStudyAt, date: '2024-11-07' },
        { id: 'hs2', durationMinutes: 30, createdAt: histStudyAt + 86400000, date: '2024-11-08' },
        { id: 'hs3', durationMinutes: 30, createdAt: histStudyAt + 172800000, date: '2024-11-09' }
      ]
    });

    // 确认校准前：隐藏成就 badge_treasured_focus_500 仍然脱敏遮罩
    const vmBeforeBackfill = await AH.getHallViewModel();
    const hiddenBefore = vmBeforeBackfill.items.find(i => i.achievementId === 'badge_treasured_focus_500');
    assert(hiddenBefore.isMasked === true && hiddenBefore.name === '？？？', '历史补算前隐藏成就严格脱敏');

    // 执行历史校准补算（并校验规则版本升级 1 -> 2）
    const bf1 = await AH.backfillFromHistory({ batchSize: 5 });
    const bf2 = await AH.backfillFromHistory({ batchSize: 5 });
    const afterBfState = await AH.loadState();

    assert(bf1.ok && bf1.upgradedFromRuleVersion === 1 && bf1.ruleVersion === AH.RULE_VERSION, 'ruleVersion 平滑从 v1 升级至 v' + AH.RULE_VERSION);
    assert(afterBfState.unlockRecords['badge_first_quest'].unlockedAt === oldUnlockedAt && afterBfState.unlockRecords['badge_first_quest'].favorite === true, '原有历史解锁记录、时间与收藏完整保留不重置');
    assert(afterBfState.unlockRecords['badge_life_task_5'].unlocked === true && afterBfState.unlockRecords['badge_life_task_5'].backfilled === true, '规则升级新增成就在历史补算后正确补解锁');
    assert(afterBfState.unlockRecords['badge_treasured_focus_500'].unlocked === true && afterBfState.unlockRecords['badge_treasured_focus_500'].occurredAt === histStudyAt, '历史补算区分 occurredAt(真实历史时间) 与 unlockedAt(本次校准时间)');
    assert(afterBfState.unlockRecords['badge_treasured_focus_500'].unlockedAt >= afterBfState.unlockRecords['badge_treasured_focus_500'].occurredAt, 'unlockedAt 不早于历史发生时间');
    assert(bf2.newlyUnlockedCount === 0 && bf2.totalScore === bf1.totalScore, '连续多次校准严格幂等，第二次补算新增解锁为 0、积分零重复');

    // 验证隐藏成就自动解锁后解除遮罩
    const vmAfterBf = await AH.getHallViewModel();
    const hiddenAfter = vmAfterBf.items.find(i => i.achievementId === 'badge_treasured_focus_500');
    assert(hiddenAfter.isMasked === false && hiddenAfter.name === '博观约取', '隐藏成就通过真实积累解锁后自动揭晓名称');

    // 备份恢复后重发旧事件，仍严格去重
    const backupDump = await global.db.config.toArray();
    env.clearAll();
    for (const row of backupDump) await global.db.config.put(row);
    const beforeBackupDupScore = (await AH.loadState()).totalScore;
    await AH.ingestEvent({
      eventId: 'hist_replay_lg',
      eventType: 'task_claimed',
      sourceApp: 'life-game',
      sourceRecordId: 'h1',
      occurrenceKey: 'h1'
    });
    const afterBackupDup = await AH.loadState();
    assert(afterBackupDup.totalScore === beforeBackupDupScore, '备份导出再还原后，重放旧来源事件不会重复计分或重发奖励');
  }

  // ----------------------------------------------------
  // Suite 6: 并发写入、异常恢复、单例监听、安卓前台刷新与性能基准
  // ----------------------------------------------------
  console.log('\n>>> [Suite 6] 并发写队列、存储异常保护、单例防重与 1,000 条记录性能校验');
  {
    env.clearAll();
    // 1. 高并发同时解锁 3 个不同成就 + 重复同时触发同一成就
    const concurrentResults = await Promise.all([
      AH.unlockAchievement('badge_first_quest'),
      AH.unlockAchievement('badge_focus_novice'),
      AH.unlockAchievement('badge_calendar_first'),
      AH.unlockAchievement('badge_first_quest')
    ]);
    const stConc = await AH.loadState();
    assert(
      stConc.unlockRecords['badge_first_quest'].unlocked &&
      stConc.unlockRecords['badge_focus_novice'].unlocked &&
      stConc.unlockRecords['badge_calendar_first'].unlocked &&
      stConc.totalScore === 350 &&
      concurrentResults.filter(r => r.ok).length === 3,
      '并发触发多枚不同与相同成就时串行写队列无丢写、无重复加分 (350分)'
    );

    // 2. 存储写入异常优雅保护与恢复
    env.setFailNextPut('achievement_hall_state_v2');
    const errRes = await AH.unlockAchievement('badge_level_5');
    const vmErr = await AH.getHallViewModel();
    assert(errRes.ok === false && errRes.reason === 'storage_error' && vmErr.lastSyncError !== null, '存储写入失败时安全返回错误并暴露恢复提示，不抛未捕获异常');
    const retryRes = await AH.unlockAchievement('badge_level_5');
    const vmRecovered = await AH.getHallViewModel();
    assert(retryRes.ok === true && vmRecovered.lastSyncError === null, '存储恢复后重试解锁立即成功并清除异常提示');

    // 3. 来源数据删空容错
    env.storeConfig.delete('wanwan_study_records');
    env.storeConfig.delete('time_calendar_events');
    const vmDeletedSource = await AH.getHallViewModel();
    assert(vmDeletedSource && vmDeletedSource.totalCount >= 30, '来源数据缺失或被清空后读取界面绝不崩溃');

    // 4. 监听器单例防重与前后台切换恢复
    const countBefore = Hub.listenerCount('ACHIEVEMENT_SOURCE_EVENT');
    AH.initAutoSync();
    AH.initAutoSync();
    await global.showAchievementPage();
    await global.showAchievementPage();
    const countAfter = Hub.listenerCount('ACHIEVEMENT_SOURCE_EVENT');
    const visCount = (env.docListeners['visibilitychange'] || []).length;
    assert(countBefore === 1 && countAfter === 1 && visCount === 1, '反复 initAutoSync 与打开成就馆，事件与前后台监听始终严格单例 (1)');

    // 模拟 Android 前台恢复刷新
    await AH.unlockAchievement('badge_stat_century');
    env.domElements[0].innerHTML = 'STALE_BEFORE_RESUME';
    global.document.visibilityState = 'visible';
    global.document.dispatchEvent('visibilitychange');
    await new Promise(r => setTimeout(r, 40));
    assert(env.domElements[0].innerHTML !== 'STALE_BEFORE_RESUME', '安卓前后台切换恢复 visible 时自动同步最新持久化展示');

    // 5. 1,000 条记录性能基准测试
    const largeStudy = [];
    for (let i = 0; i < 600; i++) {
      largeStudy.push({ id: 'perf_sr_' + i, durationMinutes: 25, date: '2026-01-01', createdAt: 1735689600000 + i * 60000 });
    }
    const largeCal = [];
    for (let j = 0; j < 400; j++) {
      largeCal.push({ id: 'perf_cal_' + j, title: '日程 ' + j, date: '2026-01-02', completed: true, status: 'completed', source: { app: 'timeCalendar' } });
    }
    await global.db.config.put({ key: 'wanwan_study_records', value: largeStudy });
    await global.db.config.put({ key: 'time_calendar_events', value: largeCal });

    const t0 = Date.now();
    const perfBackfill = await AH.backfillFromHistory({ batchSize: 10 });
    const elapsedMs = Date.now() - t0;
    assert(perfBackfill.ok && elapsedMs < 1500, '1,000 条真实源记录分批补算在 ' + elapsedMs + 'ms 内完成 (< 1500ms)');

    // 高频爆发事件合流调度测试
    const burst = await Promise.all([
      AH.scheduleEvent({ eventId: 'b1', eventType: 'event_created', sourceApp: 'time-calendar', sourceRecordId: 'c_b1' }),
      AH.scheduleEvent({ eventId: 'b2', eventType: 'event_created', sourceApp: 'time-calendar', sourceRecordId: 'c_b2' }),
      AH.scheduleEvent({ eventId: 'b3', eventType: 'event_created', sourceApp: 'time-calendar', sourceRecordId: 'c_b3' })
    ]);
    assert(burst.every(b => b && b.ok), '高频爆发来源事件通过节流合流器全部安全落库');
  }

  // ----------------------------------------------------
  // Suite 7: 边界红线检查（零微信主动祝贺/零商城抽奖/零定时轮询/移动端规范）
  // ----------------------------------------------------
  console.log('\n>>> [Suite 7] Phase 2 红线边界、零轮询与移动端 UI 静态检查');
  {
    const jsText = fs.readFileSync(path.resolve(__dirname, '../js/achievement-hall.js'), 'utf8');
    const cssText = fs.readFileSync(path.resolve(__dirname, '../css/achievement-hall.css'), 'utf8');

    assert(jsText.indexOf('setInterval(') === -1, 'achievement-hall.js 严格零 setInterval 轮询');
    assert(jsText.indexOf('db.messages.add') === -1 && jsText.indexOf('sendWechat') === -1 && jsText.indexOf('lottery') === -1, '未提前实现 Phase 3 微信主动发信或商城/抽奖逻辑');
    assert(cssText.indexOf('.ah-calibrate-btn') !== -1 && cssText.indexOf('tabular-nums') !== -1, 'CSS 包含 Phase 2 历史校准按钮及等宽数字排版样式');
  }

  console.log('\n=== 第二阶段测试总结: 通过 ' + passed + ' 项, 失败 ' + failed + ' 项 ===');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
