// scripts/test-calendar-v2-phase4.cjs
// 时光日历 2.0 阶段 4 自动化深度验证套件
// 涵盖：阶段 3 遗留加固 + 统一跨 App 时间事件模型 + 陪伴自习室深度联动 +
// 人生游戏深度联动 + 恋爱记深度联动 + 倒计时闭环与闰年截断 + 双向跳转与返回栈

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
  }
}

// 构造轻量 Node DOM + Dexie + localStorage 模拟环境
function setupMockEnv() {
  const store = {};
  const elementsById = {};

  global.localStorage = {
    getItem: (k) => (store[k] !== undefined ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };

  function makeEl(tag) {
    const classes = new Set();
    const attrs = {};
    const children = [];
    const childStubs = {};
    let _id = '';
    let _html = '';
    function getOrMakeChildStub(sel) {
      if (!childStubs[sel]) {
        const stub = makeEl('div');
        childStubs[sel] = stub;
      }
      return childStubs[sel];
    }
    const el = {
      tagName: (tag || 'div').toUpperCase(),
      style: {},
      dataset: {},
      children,
      value: '',
      checked: false,
      disabled: false,
      get innerHTML() { return _html; },
      set innerHTML(v) { _html = String(v || ''); },
      textContent: '',
      className: '',
      classList: {
        add: (...c) => c.forEach(x => classes.add(x)),
        remove: (...c) => c.forEach(x => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle: (c, f) => {
          const next = f !== undefined ? !!f : !classes.has(c);
          if (next) classes.add(c); else classes.delete(c);
        }
      },
      setAttribute: (k, v) => { attrs[k] = String(v); },
      getAttribute: (k) => attrs[k] || null,
      appendChild: (child) => {
        children.push(child);
        if (child && child.id) elementsById[child.id] = child;
        return child;
      },
      remove: () => {
        if (el._id) delete elementsById[el._id];
      },
      addEventListener: () => {},
      querySelector: (sel) => {
        if (sel && sel.startsWith('#')) {
          const rawId = sel.slice(1);
          if (_html.indexOf('id="' + rawId + '"') >= 0 || _html.indexOf("id='" + rawId + "'") >= 0) {
            return getOrMakeChildStub(sel);
          }
        }
        return getOrMakeChildStub(sel);
      },
      querySelectorAll: () => [],
      closest: () => null,
      scrollIntoView: () => {}
    };
    Object.defineProperty(el, 'id', {
      get: () => _id,
      set: (val) => {
        if (_id && elementsById[_id] === el) delete elementsById[_id];
        _id = val;
        if (val) elementsById[val] = el;
      }
    });
    return el;
  }

  const bodyEl = makeEl('body');
  const appEl = makeEl('div');
  appEl.id = 'app';
  bodyEl.appendChild(appEl);

  global.document = {
    readyState: 'complete',
    visibilityState: 'visible',
    body: bodyEl,
    getElementById: (id) => elementsById[id] || null,
    createElement: (tag) => makeEl(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };

  global.alert = () => {};
  global.confirm = () => true;

  const messagesTable = [];
  const chatsTable = [];
  const charactersTable = [
    { id: 1, name: '用户本人', type: 'user' },
    { id: 2, name: '林弯弯', nick: '弯弯', type: 'partner', personality: '温柔细腻', avatar: 'img/wanwan.png' },
    { id: 3, name: '沈星回', nick: '星回', type: 'partner', personality: '清冷从容', avatar: 'img/xinghui.png' }
  ];

  global.db = {
    messages: {
      toArray: async () => [...messagesTable],
      add: async (msg) => {
        const id = messagesTable.length + 1;
        const record = { id, ...msg };
        messagesTable.push(record);
        return id;
      },
      where: (field) => ({
        equals: (val) => ({
          first: async () => messagesTable.find(m => m[field] === val) || null
        })
      })
    },
    chats: {
      toArray: async () => [...chatsTable],
      get: async (id) => chatsTable.find(c => c.id === id) || null,
      add: async (chat) => {
        const id = chatsTable.length + 1;
        const record = { id, ...chat };
        chatsTable.push(record);
        return id;
      },
      update: async (id, changes) => {
        const chat = chatsTable.find(c => c.id === id);
        if (chat) Object.assign(chat, changes);
      },
      where: (field) => ({
        equals: (val) => ({
          first: async () => chatsTable.find(c => {
            if (field === '[ownerUid+charId]') {
              return c.ownerUid === val[0] && c.charId === val[1];
            }
            return c[field] === val;
          }) || null
        })
      })
    },
    characters: {
      toArray: async () => [...charactersTable],
      get: async (id) => charactersTable.find(c => c.id === Number(id)) || null,
      where: (field) => ({
        equals: (val) => ({
          first: async () => charactersTable.find(c => c[field] === val) || null
        })
      })
    },
    config: {
      get: async (key) => (store['__cfg_' + key] !== undefined ? { key, value: JSON.parse(store['__cfg_' + key]) } : null),
      put: async (item) => { store['__cfg_' + item.key] = JSON.stringify(item.value); }
    }
  };

  // 内存 LifeGameCore / SharedEconomyService 模拟
  let lgTasks = [];
  let lgGoals = [];
  let coinsGrantedCount = 0;
  let expGrantedCount = 0;

  global.LifeGameCore = {
    getTasks: async () => lgTasks,
    saveTasks: async (next) => { lgTasks = next; },
    getGoals: async () => lgGoals,
    saveGoals: async (next) => { lgGoals = next; }
  };

  global.LifeGameService = {
    addExpAndStats: async () => { expGrantedCount++; }
  };
  global.SharedEconomyService = {
    addCoins: async () => { coinsGrantedCount++; }
  };

  global.window = global;
  global.window.db = global.db;
  global.window.getCharacter = async (id) => charactersTable.find(c => String(c.id) === String(id)) || null;
  global.window.toast = () => {};
  global.window.callAI = async () => '早点休息，今天辛苦啦。';
  global.window.openPage = (el) => {
    if (el && el.id) elementsById[el.id] = el;
  };
  global.window.closePage = (pageId) => {
    if (elementsById[pageId]) delete elementsById[pageId];
  };

  return {
    store,
    messagesTable,
    chatsTable,
    charactersTable,
    getLgTasks: () => lgTasks,
    setLgTasks: (t) => { lgTasks = t; },
    getLgGoals: () => lgGoals,
    setLgGoals: (g) => { lgGoals = g; },
    getRewardCounters: () => ({ expGrantedCount, coinsGrantedCount })
  };
}

async function main() {
  console.log('====================================================');
  console.log(' 时光日历 2.0 阶段 4 核心功能自动化测试');
  console.log('====================================================\n');

  const env = setupMockEnv();

  // 载入待测试真实模块
  eval(fs.readFileSync(path.join(__dirname, '../js/time-calendar-integrations.js'), 'utf8'));
  eval(fs.readFileSync(path.join(__dirname, '../js/life-game-integrations.js'), 'utf8'));
  eval(fs.readFileSync(path.join(__dirname, '../js/time-calendar-companion.js'), 'utf8'));
  eval(fs.readFileSync(path.join(__dirname, '../js/time-calendar-ai.js'), 'utf8'));
  eval(fs.readFileSync(path.join(__dirname, '../js/time-calendar.js'), 'utf8'));
  eval(fs.readFileSync(path.join(__dirname, '../js/study-room.js'), 'utf8'));
  eval(fs.readFileSync(path.join(__dirname, '../js/love-diary.js'), 'utf8'));

  // =====================================================
  // 测试组 1: 阶段 3 遗留问题加固验证
  // =====================================================
  console.log('【测试组 1: 阶段 3 遗留问题加固验证】');

  runTest('统一规范跨 App 来源 ID 映射（消除 ld_wish/ld_anniv/sr_todo/lg_task 去重差异）', () => {
    const comp = window.TimeCalendarCompanion;
    const id1 = comp.resolveCanonicalSourceIdentity({ sourceApp: 'time-calendar', sourceId: 'lg_task_task_101', eventId: 'lg_task_task_101' });
    const id2 = comp.resolveCanonicalSourceIdentity({ sourceApp: 'life-game', sourceId: 'task_101', eventId: 'task_101' });
    assert.strictEqual(id1.canonicalKey, id2.canonicalKey, '跨日历投影与原生委托应生成相同 canonicalKey');

    const w1 = comp.resolveCanonicalSourceIdentity({ sourceApp: 'love-diary', eventId: 'ld_wish_2_w99', source: { app: 'love-diary', type: 'wish', charId: '2', wishId: 'w99' } });
    assert.strictEqual(w1.canonicalKey, 'love-diary:wish:w99');
  });

  await runAsyncTest('并发投递锁与 externalEventId/clientMessageId 双重幂等防护不发重消息', async () => {
    const comp = window.TimeCalendarCompanion;
    const charObj = { id: 2, name: '林弯弯', nick: '弯弯' };
    const idempKey = 'char2_concurrent_lock_test_01';

    const [r1, r2, r3] = await Promise.all([
      comp.deliverCareMessageToWechat(charObj, '第一条并发送达测试', idempKey, {
        sourceApp: 'time-calendar',
        externalEventId: 'time-calendar:evt_999',
        canonicalOccKey: 'canon_2_time-calendar:evt_999_2026-10-20_day_of'
      }),
      comp.deliverCareMessageToWechat(charObj, '第一条并发送达测试', idempKey, {
        sourceApp: 'time-calendar',
        externalEventId: 'time-calendar:evt_999',
        canonicalOccKey: 'canon_2_time-calendar:evt_999_2026-10-20_day_of'
      }),
      comp.deliverCareMessageToWechat(charObj, '第一条并发送达测试', idempKey, {
        sourceApp: 'time-calendar',
        externalEventId: 'time-calendar:evt_999',
        canonicalOccKey: 'canon_2_time-calendar:evt_999_2026-10-20_day_of'
      })
    ]);

    const matching = env.messagesTable.filter(m => m.clientMessageId === idempKey);
    assert.strictEqual(matching.length, 1, '并发三次调用只能落库 1 条微信消息');
    assert.strictEqual(r1.messageId, r2.messageId);
    assert.strictEqual(r1.messageId, r3.messageId);
  });

  runTest('离线模板严格遵守用户授权（关闭总开关或关闭离线备用时返回空）', () => {
    const comp = window.TimeCalendarCompanion;
    const charObj = { id: 2, name: '林弯弯' };
    const cand = { triggerType: 'exam', triggerStage: '1_day_before', eventTitle: '高数期末' };

    const deniedGlobal = comp.getOfflineCareTemplate(charObj, cand, {
      config: { globalEnabled: false, allowOfflineFallback: true, chars: { '2': { enabled: true } } },
      charId: '2'
    });
    assert.strictEqual(deniedGlobal, '', '总开关关闭时严禁返回离线模板');

    const deniedOpt = comp.getOfflineCareTemplate(charObj, cand, {
      config: { globalEnabled: true, allowOfflineFallback: false, chars: { '2': { enabled: true } } },
      charId: '2'
    });
    assert.strictEqual(deniedOpt, '', '关闭离线模板授权时严禁返回离线模板');

    const allowed = comp.getOfflineCareTemplate(charObj, cand, {
      config: { globalEnabled: true, allowOfflineFallback: true, chars: { '2': { enabled: true } } },
      charId: '2'
    });
    assert.ok(allowed.startsWith('【心意寄语】'), '双方授权均开启时返回显式标明【心意寄语】的模板');
  });

  runTest('AI 冲突检测窗口截断返回 windowMeta 与提示，不误导用户以为无限期已校验', () => {
    const draftDaily = {
      id: 'd_daily_1',
      title: '每日背单词',
      date: '2026-06-01',
      startTime: '08:00',
      endTime: '08:30',
      isAllDay: false,
      recurrence: { type: 'daily', interval: 1 }
    };
    const report = window.TimeCalendarAI.checkEventConflict(draftDaily, [], []);
    assert.ok(report.windowMeta, '应附带 windowMeta 元信息');
    assert.strictEqual(report.windowMeta.maxWindowDays, 45);
    assert.strictEqual(report.windowMeta.maxOccurrences, 8);
    assert.strictEqual(report.windowMeta.truncatedByWindow, true, '每日无限重复应标记 truncatedByWindow=true');
    assert.ok(report.conflicts.some(c => c.level === 'info' && c.code === 'recurrence_window_limit'), '应生成明确的窗口范围说明');
  });

  runTest('个人专属视角（personal）包含用户创建且授权给 Char 的 personal 日程，不丢失日程', () => {
    const evSharedPersonal = {
      id: 'ev_p_shared',
      title: '我的健身训练',
      relationType: 'personal',
      visibility: 'selected-chars',
      allowedCharIds: ['2'],
      charId: null
    };
    const evCharOnly = {
      id: 'ev_char_only',
      title: '弯弯约会',
      relationType: 'specificChar',
      visibility: 'selected-chars',
      allowedCharIds: ['2'],
      charId: '2'
    };
    assert.strictEqual(window.TimeCalendarIntegrations.matchesCharFilter(evSharedPersonal, 'personal'), true, '用户自己的 personal 日程即使授权给 Char 感知仍应留在个人视角');
    assert.strictEqual(window.TimeCalendarIntegrations.matchesCharFilter(evCharOnly, 'personal'), false, 'Char 专属日程不混入个人视角');
  });

  // =====================================================
  // 测试组 2: 统一跨 App 时间事件模型 & 时区安全
  // =====================================================
  console.log('\n【测试组 2: 统一时间事件投影模型 & 本地时区安全】');

  runTest('UnifiedTimeEventHub.toUnifiedEvent 生成标准跨 App 只读时间投影', () => {
    const unified = window.TimeCalendarIntegrations.unified.toUnifiedEvent({
      id: 'lg_task_t99',
      title: '人生委托 · 背诵 50 个单词',
      date: '2026-06-15',
      startTime: '19:30',
      endTime: '20:30',
      isAllDay: false,
      status: 'pending',
      charId: '2',
      source: { app: 'life-game', type: 'task', taskId: 't99', charId: '2', readOnly: false }
    });

    assert.strictEqual(unified.canonicalRef, 'life-game:t99');
    assert.strictEqual(unified.occurrenceKey, 'life-game:t99@2026-06-15');
    assert.strictEqual(unified.startAt, '2026-06-15T19:30:00');
    assert.strictEqual(unified.endAt, '2026-06-15T20:30:00');
    assert.strictEqual(unified.navigationTarget.app, 'life-game');
    assert.strictEqual(unified.navigationTarget.taskId, 't99');
    assert.strictEqual(unified.readOnly, false);
  });

  runTest('所有核心模块本地日期格式化一致性（不使用 UTC 截断）', () => {
    const lateNight = new Date(2026, 4, 15, 23, 55, 0); // 本地 2026-05-15 23:55
    const localStr = window.TimeCalendarIntegrations.formatLocalDate(lateNight);
    assert.strictEqual(localStr, '2026-05-15', '深夜 23:55 必须返回本地日期 2026-05-15');
  });

  // =====================================================
  // 测试组 3: 陪伴自习室深度联动 & 番茄钟保活
  // =====================================================
  console.log('\n【测试组 3: 陪伴自习室深度联动与专注计时保活】');

  await runAsyncTest('自习室待办/考试备考与专注足迹正确投影，且不篡改未来任务', async () => {
    await db.config.put({
      key: 'wanwan_study_todos',
      value: [
        { id: 'todo_1', text: '高等数学刷题', date: '2026-06-10', time: '14:00', endTime: '15:30', estimatedMinutes: 90, done: false },
        { id: 'todo_unsched', text: '未排期灵感笔记', date: '', done: false }
      ]
    });
    await db.config.put({
      key: 'wanwan_study_exams',
      value: [
        { id: 'exam_1', title: '英语六级笔试', subject: '六级', targetDate: '2026-06-20', isPinned: true }
      ]
    });
    await db.config.put({
      key: 'wanwan_study_records',
      value: [
        { id: 'rec_1', taskName: '六级真题训练', durationMinutes: 45, examId: 'exam_1', date: '2026-06-08', startTime: Date.now() },
        { id: 'rec_2', taskName: '六级听力练习', durationMinutes: 30, date: '2026-06-09', startTime: Date.now() }
      ]
    });

    const todoEvents = await window.TimeCalendarIntegrations.studyRoom.getTodosAsEvents('all', env.charactersTable);
    assert.strictEqual(todoEvents.length, 1, '仅排期有效的待办投影至日历');
    assert.strictEqual(todoEvents[0].estimatedMinutes, 90);
    assert.strictEqual(todoEvents[0].startTime, '14:00');
    assert.strictEqual(todoEvents[0].endTime, '15:30');

    const examCds = await window.TimeCalendarIntegrations.studyRoom.getExamsAsCountdowns('all');
    assert.strictEqual(examCds.length, 1);
    assert.strictEqual(examCds[0].subject, '六级');
    assert.strictEqual(examCds[0].studyProgress.matchedMinutes, 75, '应准确汇聚对应备考科目的专注累计时长');
    assert.strictEqual(examCds[0].studyProgress.matchedSessions, 2);

    const recordsMap = await window.TimeCalendarIntegrations.studyRoom.getRecordsMap();
    assert.strictEqual(recordsMap['2026-06-08'].totalMinutes, 45);
    assert.strictEqual(recordsMap['2026-06-09'].totalMinutes, 30);
  });

  await runAsyncTest('自习室运行中的番茄钟在跨 App 往返（preserveTimer: true）后秒数与状态不断裂', async () => {
    await window.showStudyRoomPage({ tab: 'hall' });
    const sr = window.WanwanStudyRoom.getState();
    sr.timerStatus = 'running';
    sr.mode = 'focus';
    sr.secondsLeft = 1234;
    sr.durationSeconds = 1500;
    sr.targetTaskName = '专业课精读';

    // 模拟从自习室跳往时光日历，再调用 showStudyRoomPage({ preserveTimer: true })
    await window.TimeCalendarIntegrations.navigate(
      { app: 'time-calendar', tab: 'calendar' },
      { fromApp: 'study-room' }
    );
    assert.strictEqual(sr.timerStatus, 'running', '跳转过程中计时器必须保持 running');

    await window.TimeCalendarIntegrations.returnToCaller('time-calendar');
    const srAfterReturn = window.WanwanStudyRoom.getState();
    assert.strictEqual(srAfterReturn.timerStatus, 'running', '返回自习室后计时状态依然保持 running');
    assert.ok(srAfterReturn.secondsLeft <= 1234 && srAfterReturn.secondsLeft >= 1230, '计时器剩余秒数未被 reset 为 1500');
  });

  // =====================================================
  // 测试组 4: 人生游戏深度联动与防刷奖保护
  // =====================================================
  console.log('\n【测试组 4: 人生游戏深度联动、只读锁定与防提前结算】');

  await runAsyncTest('人生游戏委托完整投影（优先级/难度/奖励），且日历操作绝不结算经验/金币', async () => {
    env.setLgTasks([
      {
        id: 'lg_t_pending',
        title: '完成线性代数作业',
        dueDate: '2026-06-12',
        startTime: '16:00',
        endTime: '17:00',
        priority: 'high',
        difficulty: 'hard',
        rewardExp: 80,
        rewardCoins: 40,
        status: 'pending',
        category: 'study'
      },
      {
        id: 'lg_t_claimed',
        title: '已完成领奖任务',
        dueDate: '2026-06-12',
        priority: 'normal',
        difficulty: 'easy',
        rewardExp: 30,
        rewardCoins: 15,
        status: 'claimed',
        category: 'life'
      }
    ]);

    const lgEvents = await window.LifeGameIntegrations.getTasksAsCalendarEvents('all', env.charactersTable);
    assert.strictEqual(lgEvents.length, 2);

    const pendingEv = lgEvents.find(e => e.source.taskId === 'lg_t_pending');
    assert.strictEqual(pendingEv.priority, 'high');
    assert.strictEqual(pendingEv.rewardExp, 80);
    assert.strictEqual(pendingEv.rewardCoins, 40);
    assert.strictEqual(pendingEv.readOnly, false);

    const claimedEv = lgEvents.find(e => e.source.taskId === 'lg_t_claimed');
    assert.strictEqual(claimedEv.status, 'claimed');
    assert.strictEqual(claimedEv.readOnly, true, '已领奖入账的任务投影必须锁定为只读');

    // 测试已领奖任务禁止通过日历回写修改
    const lockRes = await window.LifeGameIntegrations.saveTaskFromCalendar({
      title: '试图篡改已领奖任务',
      date: '2026-06-13',
      source: claimedEv.source
    });
    assert.strictEqual(lockRes.success, false);
    assert.strictEqual(lockRes.error, 'already_claimed', '必须拒绝修改已领奖任务');

    // 测试待办任务允许通过日历改期写回，且不发奖励
    const saveRes = await window.LifeGameIntegrations.saveTaskFromCalendar({
      title: '人生委托 · 完成线性代数作业（改期）',
      date: '2026-06-14',
      startTime: '18:00',
      endTime: '19:00',
      isAllDay: false,
      notes: '补充笔记',
      source: pendingEv.source
    });
    assert.strictEqual(saveRes.success, true);
    assert.strictEqual(saveRes.changed, true);
    assert.strictEqual(env.getLgTasks()[0].dueDate, '2026-06-14');
    assert.strictEqual(env.getLgTasks()[0].startTime, '18:00');

    // 测试日历勾选完成只变为 completed，绝不变为 claimed 或发放经验金币
    await window.LifeGameIntegrations.toggleTaskFromCalendar('lg_t_pending');
    assert.strictEqual(env.getLgTasks()[0].status, 'completed', '日历打勾仅能设为 completed');
    assert.strictEqual(env.getRewardCounters().expGrantedCount, 0, '日历勾选严禁提前结算经验');
    assert.strictEqual(env.getRewardCounters().coinsGrantedCount, 0, '日历勾选严禁提前结算金币');
  });

  runTest('时光日历回写人生游戏代码包含 Diff 二次确认弹窗逻辑', () => {
    const tcSrc = fs.readFileSync(path.join(__dirname, '../js/time-calendar.js'), 'utf8');
    assert.ok(tcSrc.includes('function showLifeGameEditConfirmModal'), '必须存在变更前后 Diff 确认弹窗');
    assert.ok(tcSrc.includes('确认回写人生游戏'), 'Diff 确认按钮文案清晰明确');
  });

  // =====================================================
  // 测试组 5: 恋爱记深度联动与多 Char 隔离
  // =====================================================
  console.log('\n【测试组 5: 恋爱记纪念日、心愿小事联动与角色严格隔离】');

  await runAsyncTest('恋爱记仅投影授权角色，删除后及时清空日历投影', async () => {
    await db.config.put({
      key: 'coupleSpaceSettings',
      value: {
        activeCharId: '2',
        spaces: {
          '2': {
            charId: '2',
            status: 'accepted',
            anniversaryDate: '2024-05-20',
            wishes: [
              { id: 'w1', text: '一起去海边看日出', targetDate: '2026-07-01', done: false }
            ]
          },
          '3': {
            charId: '3',
            status: 'accepted',
            anniversaryDate: '2025-01-01',
            wishes: [
              { id: 'w2', text: '星回星空馆约会', targetDate: '2026-07-02', done: false }
            ]
          }
        }
      }
    });

    const anniv2 = await window.TimeCalendarIntegrations.loveDiary.getAnniversaries('2', env.charactersTable);
    assert.strictEqual(anniv2.length, 1);
    assert.strictEqual(anniv2[0].charId, '2');

    const wishes2 = await window.TimeCalendarIntegrations.loveDiary.getWishesAsEvents('2', env.charactersTable);
    assert.strictEqual(wishes2.length, 1);
    assert.strictEqual(wishes2[0].source.wishId, 'w1');

    const annivPersonal = await window.TimeCalendarIntegrations.loveDiary.getAnniversaries('personal', env.charactersTable);
    assert.strictEqual(annivPersonal.length, 0, '个人视角不混入恋爱记纪念日');

    await window.TimeCalendarIntegrations.loveDiary.deleteAnniversary('2');
    const anniv2AfterDelete = await window.TimeCalendarIntegrations.loveDiary.getAnniversaries('2', env.charactersTable);
    assert.strictEqual(anniv2AfterDelete.length, 0, '删除恋爱记纪念日后日历侧不再出现残留投影');
  });

  // =====================================================
  // 测试组 6: 倒计时、纪念日闰年边界与取消状态同步
  // =====================================================
  console.log('\n【测试组 6: 2月29日闰年截断与统一倒计时删改边界】');

  runTest('2月29日纪念日在平年安全截断为2月28日（不漂移到3月1日）', () => {
    const ms2025 = window.TimeCalendarApp.computeAnniversaryMilestone('2024-02-29', '2025-02-28');
    assert.strictEqual(ms2025.nextDateStr, '2025-02-28', '2025 平年 2 月 29 日纪念日应落在 2025-02-28');
    assert.strictEqual(ms2025.daysToNext, 0, '在 2025-02-28 当天倒数天数为 0');
    assert.strictEqual(ms2025.isTodayAnniversary, true);

    const ms2028 = window.TimeCalendarApp.computeAnniversaryMilestone('2024-02-29', '2028-02-28');
    assert.strictEqual(ms2028.nextDateStr, '2028-02-29', '遇到 2028 闰年恢复为 2028-02-29');
    assert.strictEqual(ms2028.daysToNext, 1);
  });

  await runAsyncTest('已取消或已关闭倒计时投影的日历事件不重复出现在有效倒计时列表', async () => {
    await db.config.put({
      key: 'time_calendar_events',
      value: [
        { id: 'evt_cd_active', title: '毕业答辩', date: '2026-07-10', showInCountdown: true, status: 'pending', relationType: 'personal' },
        { id: 'evt_cd_cancel', title: '已取消会议', date: '2026-07-11', showInCountdown: true, status: 'cancelled', relationType: 'personal' },
        { id: 'evt_cd_hidden', title: '仅取消展示日程', date: '2026-07-12', showInCountdown: false, status: 'pending', relationType: 'personal' }
      ]
    });
    await db.config.put({ key: 'time_calendar_countdowns', value: [] });
    await db.config.put({ key: 'time_calendar_anniversaries', value: [] });

    await window.showTimeCalendarPage({ tab: 'countdowns', filterCharId: 'all' });
    const cds = window.TimeCalendarApp.getEffectiveCountdowns();
    assert.ok(cds.some(c => c.id === 'cd_evt_evt_cd_active'), '有效的排期倒计时正常展示');
    assert.ok(!cds.some(c => c.id === 'cd_evt_evt_cd_cancel'), 'cancelled 状态的日程自动排除出倒计时');
    assert.ok(!cds.some(c => c.id === 'cd_evt_evt_cd_hidden'), 'showInCountdown=false 的日程不再投影为倒计时');
  });

  // =====================================================
  // 测试组 7: 跨 App 双向跳转与返回栈完整恢复
  // =====================================================
  console.log('\n【测试组 7: 跨 App 双向跳转、状态保持与返回栈恢复】');

  await runAsyncTest('时光日历 -> 人生游戏 -> 返回时光日历完整恢复视图/日期/角色筛选', async () => {
    window.TimeCalendarIntegrations.nav.clearReturnContext();
    await window.showTimeCalendarPage({
      tab: 'calendar',
      calendarView: 'week',
      date: '2026-06-15',
      filterCharId: '2'
    });

    const tcStateBefore = window.TimeCalendarApp.getState();
    assert.strictEqual(tcStateBefore.activeTab, 'calendar');
    assert.strictEqual(tcStateBefore.calendarView, 'week');
    assert.strictEqual(tcStateBefore.selectedDateStr, '2026-06-15');
    assert.strictEqual(tcStateBefore.filterCharId, '2');

    // 从日历跳转至人生游戏
    window.showLifeGamePage = async (opts) => {
      const p = document.createElement('div');
      p.id = 'life-game-page';
      p.dataset = { tab: opts.tab };
      window.openPage(p);
    };

    await window.TimeCalendarIntegrations.navigate(
      { app: 'life-game', type: 'task', taskId: 'lg_t_pending' },
      { fromApp: 'time-calendar' }
    );
    const peek = window.TimeCalendarIntegrations.peekReturnContext();
    assert.ok(peek && peek.fromApp === 'time-calendar', '返回栈顶部应记录来源 App 为 time-calendar');

    // 切换干扰状态验证返回栈会精确复原原快照
    tcStateBefore.activeTab = 'settings';
    tcStateBefore.calendarView = 'day';
    tcStateBefore.selectedDateStr = '2026-01-01';
    tcStateBefore.filterCharId = 'personal';

    const returned = await window.TimeCalendarIntegrations.returnToCaller('life-game');
    assert.strictEqual(returned, true, '应成功执行返回调用方 App');
    assert.strictEqual(document.getElementById('life-game-page'), null, '目标子页面应已关闭');

    const tcStateAfter = window.TimeCalendarApp.getState();
    assert.strictEqual(tcStateAfter.activeTab, 'calendar');
    assert.strictEqual(tcStateAfter.calendarView, 'week');
    assert.strictEqual(tcStateAfter.selectedDateStr, '2026-06-15');
    assert.strictEqual(tcStateAfter.filterCharId, '2');
  });

  console.log('\n====================================================');
  console.log(` 阶段 4 测试运行完成: 通过 ${passedTests} 项, 失败 ${failedTests} 项`);
  console.log('====================================================');

  process.exit(failedTests > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('阶段 4 测试脚本运行异常:', err);
  process.exit(1);
});
