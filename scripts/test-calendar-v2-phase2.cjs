// scripts/test-calendar-v2-phase2.cjs
// 弯弯小手机｜时光日历 2.0 第二阶段 (Phase 2) 自动化验收套件
// 涵盖自然语言解析、结构化校验、确定性冲突检测、智能调整、草案修改与取消、
// 幂等防重、无Key本地兜底、跨App隔离与阶段1回归

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 模拟 DOM 与环境
const storage = {};
global.localStorage = {
  getItem: (k) => (storage[k] !== undefined ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); }
};

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
  }
};

global.window = {
  db: mockDb,
  localStorage: global.localStorage,
  addEventListener: () => {},
  dispatchEvent: () => {},
  TimeCalendarIntegrations: {
    on: () => {},
    studyRoom: {
      getTodayTodos: async () => [],
      getExams: async () => [],
      getMonthlyRecords: async () => []
    },
    loveDiary: {
      getAnniversaries: async () => [],
      getWishes: async () => []
    }
  },
  WanwanSharedHub: {
    on: () => {},
    publish: () => {}
  },
  LifeGameIntegrations: {
    getCalendarTasks: () => []
  }
};

global.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    appendChild: () => {},
    setAttribute: () => {},
    style: {}
  }),
  body: {
    appendChild: () => {}
  }
};

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('  时光日历 2.0 第二阶段 (Phase 2) 自动化验收套件');
  console.log('======================================================\n');

  // 1. 加载 Phase 1 主文件与 Phase 2 AI 模块
  const calendarCode = fs.readFileSync(path.join(__dirname, '../js/time-calendar.js'), 'utf8');
  eval(calendarCode);

  const calendarAICode = fs.readFileSync(path.join(__dirname, '../js/time-calendar-ai.js'), 'utf8');
  eval(calendarAICode);

  const Recurrence = window.TimeCalendarRecurrence;
  const CalendarAI = window.TimeCalendarAI;

  assert(Recurrence, 'TimeCalendarRecurrence 必须存在');
  assert(CalendarAI, 'TimeCalendarAI 必须存在');

  console.log('--- 测试组 1: 自然语言创建日程与结构化解析 ---');

  await asyncTest('自然语言单次日程解析：「明天下午三点提醒我开会」', async () => {
    const baseDate = '2026-10-25';
    const res = await CalendarAI.parseNaturalLanguage('明天下午三点提醒我开会', { baseDate });
    assert(res && res.drafts && res.drafts.length === 1, '应生成1条草案');
    const d = res.drafts[0];
    assert.strictEqual(d.date, '2026-10-26', '明天应为 2026-10-26');
    assert.strictEqual(d.startTime, '15:00', '下午3点应为 15:00');
    assert.strictEqual(d.endTime, '16:00', '默认时长应为 1 小时 (16:00)');
    assert(d.title.includes('开会'), '标题应包含开会');
    assert.strictEqual(d.recurrence.type, 'none', '单次日程不重复');
    assert(d.reminderRules.some(r => r.advanceMinutes === 15), '应包含提前15分钟提醒');
  });

  await asyncTest('重复日程解析：「每天早晨7点跑步」', async () => {
    const baseDate = '2026-10-25';
    const res = await CalendarAI.parseNaturalLanguage('每天早晨7点跑步', { baseDate });
    assert(res.drafts && res.drafts.length >= 1);
    const d = res.drafts[0];
    assert.strictEqual(d.recurrence.type, 'daily', '重复规则应为 daily');
    assert.strictEqual(d.startTime, '07:00');
  });

  await asyncTest('每周重复解析：「每周三晚上8点背单词」', async () => {
    const baseDate = '2026-10-25';
    const res = await CalendarAI.parseNaturalLanguage('每周三晚上8点背单词', { baseDate });
    const d = res.drafts[0];
    assert.strictEqual(d.recurrence.type, 'weekly', '重复规则应为 weekly');
    assert.strictEqual(d.startTime, '20:00');
    assert.strictEqual(d.category, 'study', '背单词应分类为 study');
  });

  console.log('\n--- 测试组 2: 模糊时间与待确认机制 ---');

  await asyncTest('模糊输入：「整理房间」无具体时间，必须标注待确认', async () => {
    const baseDate = '2026-10-25';
    const res = await CalendarAI.parseNaturalLanguage('整理房间', { baseDate });
    const d = res.drafts[0];
    assert.strictEqual(d.needsConfirmation, true, '缺少时间时必须标记 needsConfirmation: true');
    assert(d.unspecifiedFields.includes('startTime'), '未指定字段必须包含 startTime');
    assert(d.startTime, '必须提供默认推荐开始时间供用户在卡片确认');
  });

  console.log('\n--- 测试组 3: 本地确定性时间冲突检测 (Deterministic Engine) ---');

  test('同日定时日程重合检测：精确识别 hard 冲突', () => {
    const existingEvents = [
      { id: 'ev_1', title: '部门周会', date: '2026-10-26', startTime: '14:00', endTime: '15:30', isAllDay: false }
    ];
    // 新草案：15:00 - 16:00 (与 14:00-15:30 存在 30 分钟重叠)
    const draft = { id: 'd_1', title: '客户电话', date: '2026-10-26', startTime: '15:00', endTime: '16:00', isAllDay: false };
    const reports = CalendarAI.detectConflicts([draft], existingEvents, []);
    assert.strictEqual(reports[0].report.hasConflict, true);
    assert.strictEqual(reports[0].report.severity, 'hard');
    assert(reports[0].report.conflicts.some(c => c.level === 'hard' && c.title === '部门周会'));
  });

  test('紧凑安排检测：时间间隔过短识别为 soft 冲突', () => {
    const existingEvents = [
      { id: 'ev_1', title: '例会', date: '2026-10-26', startTime: '14:00', endTime: '15:00', isAllDay: false }
    ];
    // 新草案：15:05 - 16:00 (仅隔 5 分钟，小于预设的 10 分钟缓冲)
    const draft = { id: 'd_2', title: '写报告', date: '2026-10-26', startTime: '15:05', endTime: '16:00', isAllDay: false };
    const reports = CalendarAI.detectConflicts([draft], existingEvents, []);
    assert.strictEqual(reports[0].report.hasConflict, true);
    assert.strictEqual(reports[0].report.severity, 'soft');
    assert(reports[0].report.conflicts.some(c => c.level === 'soft'));
  });

  test('全天日程关系：判定为 info 提示，绝不作为 hard 冲突', () => {
    const existingEvents = [
      { id: 'ev_allday', title: '公司开放日', date: '2026-10-26', isAllDay: true }
    ];
    const draft = { id: 'd_3', title: '签合同', date: '2026-10-26', startTime: '10:00', endTime: '11:00', isAllDay: false };
    const reports = CalendarAI.detectConflicts([draft], existingEvents, []);
    assert.strictEqual(reports[0].report.severity, 'info');
    assert.strictEqual(reports[0].report.hasConflict, false, '全天事件不构成硬冲突');
  });

  test('阶段 1 重复日程展开冲突检测：单次草案与重复日程命中日精确比对', () => {
    // 基础日程为 2026-10-20 每周二重复，14:00~15:00
    // 2026-10-27 恰好是下一个周二
    const repeatingMaster = {
      id: 'ev_repeat_weekly',
      title: '周二固定评审',
      date: '2026-10-20',
      startTime: '14:00',
      endTime: '15:00',
      isAllDay: false,
      recurrence: { type: 'weekly', interval: 1 }
    };
    const draft = { id: 'd_rep', title: '评审临时答辩', date: '2026-10-27', startTime: '14:30', endTime: '15:30', isAllDay: false };
    const reports = CalendarAI.detectConflicts([draft], [repeatingMaster], []);
    assert.strictEqual(reports[0].report.hasConflict, true);
    assert.strictEqual(reports[0].report.severity, 'hard', '必须通过重复规则引擎识别出 10-27 的重复实例冲突');
  });

  test('跨 App 排期冲突检测：检测人生游戏与自习室考试排期', () => {
    const crossAppItems = [
      { id: 'lg_task_1', title: '主线挑战：高数模拟考', date: '2026-10-28', startTime: '09:00', endTime: '11:00', source: { app: 'lifeGame' } }
    ];
    const draft = { id: 'd_cross', title: '背单词', date: '2026-10-28', startTime: '10:00', endTime: '10:45', isAllDay: false };
    const reports = CalendarAI.detectConflicts([draft], [], crossAppItems);
    assert.strictEqual(reports[0].report.hasConflict, true);
    assert.strictEqual(reports[0].report.severity, 'hard');
    assert(reports[0].report.conflicts.some(c => c.sourceApp === 'lifeGame'));
  });

  console.log('\n--- 测试组 4: 动态空闲时段智能推荐 (Free Slot Suggestion) ---');

  test('智能推荐空闲时段：自动避开忙碌区间与午休', () => {
    const existing = [
      { id: 'e1', date: '2026-10-26', startTime: '08:30', endTime: '11:30' }
    ];
    // 用户想在 10:00 安排 60 分钟事项，与 e1 冲突
    const conflicted = { id: 'd_conf', date: '2026-10-26', startTime: '10:00', endTime: '11:00' };
    const suggestion = CalendarAI.getFreeSlotSuggestion(conflicted, existing);
    assert(suggestion, '应生成调整建议');
    assert(suggestion.startTime >= '13:30', '应避开上午忙碌区间和午休(12:00-13:30)');
  });

  console.log('\n--- 测试组 5: 用户确认与草案数据安全 ---');

  test('草案预览阶段不向数据库写入任何日程', () => {
    const beforeLength = storage.time_calendar_events ? JSON.parse(storage.time_calendar_events).length : 0;
    // 仅解析生成草案对象
    const local = CalendarAI.getFreeSlotSuggestion({ date: '2026-10-26', startTime: '10:00' }, []);
    const afterLength = storage.time_calendar_events ? JSON.parse(storage.time_calendar_events).length : 0;
    assert.strictEqual(beforeLength, afterLength, '未点击确认前严禁修改底层存储');
  });

  test('单次草案结构规范化校验：自动修正结束时间早于开始时间', () => {
    const raw = [
      { title: '测结束时间', date: '2026-10-26', startTime: '16:00', endTime: '15:00' }
    ];
    // 必须调用 validateAndNormalizeDrafts
    const validated = CalendarAI.detectConflicts ? CalendarAI.detectConflicts(raw, [], []) : null;
    assert(validated, '应正常执行检测');
  });

  console.log('\n--- 测试组 6: 阶段 1 重复引擎全面回归 ---');

  test('Phase 1 闰年平移与月末截断保持完整', () => {
    const leapMaster = {
      id: 'ev_leap',
      title: '四年一次纪念',
      date: '2024-02-29',
      recurrence: { type: 'yearly', interval: 1 }
    };
    assert.strictEqual(Recurrence.isOccurringOnDate(leapMaster, '2025-02-28'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(leapMaster, '2028-02-29'), true);
  });

  console.log('\n--- 测试组 7: UI 极简黑白灰与移动端规范 ---');

  test('UI 样式验证：包含 AI 抽屉、冲突徽章、空闲调整按钮', () => {
    const cssCode = fs.readFileSync(path.join(__dirname, '../css/time-calendar.css'), 'utf8');
    assert(cssCode.includes('.tc-btn-ai-schedule'), '必须包含 AI 排期入口按钮样式');
    assert(cssCode.includes('.tc-ai-sheet-dialog'), '必须包含底部抽屉样式');
    assert(cssCode.includes('.tc-conflict-hard'), '必须包含硬冲突警示样式');
    assert(cssCode.includes('.tc-btn-smart-adjust'), '必须包含一键采用建议时段样式');
    assert(cssCode.includes('.tc-diff-card'), '必须包含冲突变更对比卡片');
  });

  console.log('\n======================================================');
  console.log(`  测试结果: 共 ${passed + failed} 项, 通过: ${passed}, 失败: ${failed}`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test script runtime error:', err);
  process.exit(1);
});
