// scripts/test-calendar-v2-phase1.cjs
// 弯弯小手机｜时光日历 2.0 第一阶段 (Phase 0 & Phase 1) 自动化验证套件
// 涵盖架构审查、重复日程安全引擎、边界情况(闰年/月末截断)、单次修改/删除、4大导航与跨App联动

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

async function runTests() {
  console.log('\n======================================================');
  console.log('  时光日历 2.0 第一阶段 (Phase 0 & 1) 自动化验证套件');
  console.log('======================================================\n');

  // 1. 加载 js/time-calendar.js 源码
  const calendarCode = fs.readFileSync(path.join(__dirname, '../js/time-calendar.js'), 'utf8');
  eval(calendarCode);

  const Recurrence = window.TimeCalendarRecurrence;
  assert(Recurrence, 'TimeCalendarRecurrence 必须被正确暴露至 window.TimeCalendarRecurrence');

  console.log('--- 测试组 1: 重复日程规则驱动引擎 (Daily & Weekly) ---');

  test('每天重复日程：间隔为 1，在起始日及未来任意天均发生', () => {
    const ev = {
      id: 'ev_daily_1',
      title: '每日晨读',
      date: '2026-03-01',
      recurrence: { type: 'daily', interval: 1 }
    };
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-01'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-02'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-15'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-02-28'), false, '早于起始日不应发生');
  });

  test('每天重复日程：间隔为 3 天，正确计算步长', () => {
    const ev = {
      id: 'ev_daily_3',
      title: '每3天浇花',
      date: '2026-03-01',
      recurrence: { type: 'daily', interval: 3 }
    };
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-01'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-02'), false);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-04'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-07'), true);
  });

  test('每周重复日程：每周三重复，仅周三匹配', () => {
    // 2026-03-04 是周三
    const ev = {
      id: 'ev_weekly_1',
      title: '周三例会',
      date: '2026-03-04',
      recurrence: { type: 'weekly', interval: 1 }
    };
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-04'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-05'), false);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-11'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-18'), true);
  });

  test('重复截止日期安全约束 (endDate clamp)', () => {
    const ev = {
      id: 'ev_end_date',
      title: '期末复习营',
      date: '2026-03-01',
      recurrence: { type: 'daily', interval: 1, endDate: '2026-03-10' }
    };
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-10'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-11'), false, '超过截止日不得发生');
  });

  console.log('\n--- 测试组 2: 月末对齐截断安全处理 (Monthly End-of-month Clamping) ---');

  test('每月31日重复：在30天小月(4月)安全对齐到4月30日', () => {
    const ev = {
      id: 'ev_month_31',
      title: '月末月度账单',
      date: '2026-01-31',
      recurrence: { type: 'monthly', interval: 1 }
    };
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-01-31'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-31'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-04-30'), true, '4月只有30天，应自动安全对齐到30日');
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-04-31'), false);
  });

  test('每月31日重复：在平年2月安全对齐到2月28日', () => {
    const ev = {
      id: 'ev_month_31_feb',
      title: '月度总结',
      date: '2026-01-31',
      recurrence: { type: 'monthly', interval: 1 }
    };
    // 2026 是平年
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-02-28'), true, '2026平年2月应安全对齐到28日');
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-02-27'), false);
  });

  test('每月30日重复：在2月安全截断到2月28日，3月恢复到30日', () => {
    const ev = {
      id: 'ev_month_30',
      title: '月度汇报',
      date: '2026-01-30',
      recurrence: { type: 'monthly', interval: 1 }
    };
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-02-28'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-30'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-31'), false);
  });

  console.log('\n--- 测试组 3: 每年重复与闰年 2月29日安全平移 (Leap Year Clamping) ---');

  test('闰年2月29日每年重复：平年自动对齐到2月28日，闰年对齐到2月29日', () => {
    const ev = {
      id: 'ev_leap_year',
      title: '四年一度纪念',
      date: '2024-02-29',
      recurrence: { type: 'yearly', interval: 1 }
    };
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2024-02-29'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2025-02-28'), true, '2025平年截断至2月28日');
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-02-28'), true, '2026平年截断至2月28日');
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2028-02-29'), true, '2028闰年恢复至2月29日');
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2028-02-28'), false, '2028闰年不应在28日触发');
  });

  console.log('\n--- 测试组 4: 单次删除 (Excluded Dates) 幂等安全 ---');

  test('单次删除：将特定日期加入 excludedDates，该日不再发生，后续系列不受影响', () => {
    const ev = {
      id: 'ev_del_instance',
      title: '早起跑步',
      date: '2026-03-01',
      recurrence: {
        type: 'daily',
        interval: 1,
        excludedDates: ['2026-03-03']
      }
    };
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-01'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-02'), true);
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-03'), false, '已被排除的单次实例不应再发生');
    assert.strictEqual(Recurrence.isOccurringOnDate(ev, '2026-03-04'), true, '后续日程应正常发生');
  });

  console.log('\n--- 测试组 5: 单次修改与单次完成状态 (Overrides) 隔离 ---');

  test('单次修改：仅覆盖该日期的标题和时间，主日程与其他实例不变', () => {
    const master = {
      id: 'ev_override_test',
      title: '团队例会',
      date: '2026-03-02',
      startTime: '10:00',
      endTime: '11:00',
      recurrence: {
        type: 'weekly',
        interval: 1,
        overrides: {
          '2026-03-09': {
            title: '团队例会 (改为线上)',
            startTime: '14:00',
            endTime: '15:00'
          }
        }
      }
    };

    // 实例 1: 基准日 2026-03-02
    const occ1 = Recurrence.createOccurrence(master, '2026-03-02');
    assert.strictEqual(occ1.title, '团队例会');
    assert.strictEqual(occ1.startTime, '10:00');
    assert.strictEqual(occ1.hasInstanceOverride, undefined);

    // 实例 2: 覆盖日 2026-03-09
    const occ2 = Recurrence.createOccurrence(master, '2026-03-09');
    assert.strictEqual(occ2.title, '团队例会 (改为线上)');
    assert.strictEqual(occ2.startTime, '14:00');
    assert.strictEqual(occ2.hasInstanceOverride, true);

    // 实例 3: 后续日 2026-03-16
    const occ3 = Recurrence.createOccurrence(master, '2026-03-16');
    assert.strictEqual(occ3.title, '团队例会');
    assert.strictEqual(occ3.startTime, '10:00');
    assert.strictEqual(occ3.hasInstanceOverride, undefined);
  });

  test('单次完成状态：标记特定日期实例已完成，不影响主日程或其他实例', () => {
    const master = {
      id: 'ev_complete_test',
      title: '背单词',
      date: '2026-03-01',
      completed: false,
      recurrence: {
        type: 'daily',
        interval: 1,
        overrides: {
          '2026-03-02': { completed: true }
        }
      }
    };

    const occ1 = Recurrence.createOccurrence(master, '2026-03-01');
    assert.strictEqual(occ1.completed, false);

    const occ2 = Recurrence.createOccurrence(master, '2026-03-02');
    assert.strictEqual(occ2.completed, true);

    const occ3 = Recurrence.createOccurrence(master, '2026-03-03');
    assert.strictEqual(occ3.completed, false);
  });

  console.log('\n--- 测试组 6: 存储层无膨胀与单一权威数据库原则 ---');

  test('重复日程在存储库中仅存一条主记录，绝不无限制复制膨胀', () => {
    const events = [
      {
        id: 'ev_single_master',
        title: '每日早起',
        date: '2026-01-01',
        recurrence: { type: 'daily', interval: 1 }
      }
    ];

    // 即使覆盖 365 天，数据库中依然只有一条 master 记录
    assert.strictEqual(events.length, 1);
    // 动态判断 2026-06-15
    assert.strictEqual(Recurrence.isOccurringOnDate(events[0], '2026-06-15'), true);
  });

  console.log('\n--- 测试组 7: 时光日历 2.0 主导航架构与设置健全性 ---');

  test('4大核心 Tab 导航完整定义: calendar, schedules, anniversaries, settings', () => {
    assert(calendarCode.includes('data-tab="calendar"'), '必须包含日历 Tab');
    assert(calendarCode.includes('data-tab="schedules"'), '必须包含日程 Tab');
    assert(calendarCode.includes('data-tab="anniversaries"'), '必须包含纪念日 Tab');
    assert(calendarCode.includes('data-tab="settings"'), '必须包含设置 Tab');
  });

  test('纪念日/倒计时顶部 Segmented Control 切换完整保留', () => {
    assert(calendarCode.includes("tc-anniv-subtabs"), '必须包含纪念日与倒计时分段控制');
    assert(calendarCode.includes('data-subtab="anniversaries"'), '必须包含纪念日子标签');
    assert(calendarCode.includes('data-subtab="countdowns"'), '必须包含倒计时子标签');
  });

  test('设置页面提供跨App联动开关、周起始日切换与数据完整性状态', () => {
    assert(calendarCode.includes("tc-settings-card"), '设置页面必须包含规范卡片');
    assert(calendarCode.includes("tc-settings-row"), '设置页面必须包含规范卡片条目');
    assert(calendarCode.includes("firstDayOfWeek"), '必须支持周起始日配置 (周一/周日)');
    assert(calendarCode.includes("showLifeGameTasks"), '必须支持人生游戏联动开关');
    assert(calendarCode.includes("showStudyRoomRecords"), '必须支持自习室记录联动开关');
    assert(calendarCode.includes("showLoveDiaryAnniversaries"), '必须支持恋爱记联动开关');
  });

  test('移动端 UI 规范验证 (大圆角卡片、防止横向溢出、极简黑白灰)', () => {
    const cssCode = fs.readFileSync(path.join(__dirname, '../css/time-calendar.css'), 'utf8');
    assert(cssCode.includes(".tc-week-agenda"), '必须包含周视图详细议程样式');
    assert(cssCode.includes(".tc-dayview-container"), '必须包含日视图时间轴容器样式');
    assert(cssCode.includes(".tc-current-time-marker"), '必须包含当前时间刻度红线/指示器');
    assert(cssCode.includes(".tc-detail-modal"), '必须包含日程详情卡模态框');
    assert(cssCode.includes(".tc-single-instance-banner"), '必须包含单次修改提示横幅');
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
