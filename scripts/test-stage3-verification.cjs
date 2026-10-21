// scripts/test-stage3-verification.cjs
// Stage 3 自动化回归与边界校验测试脚本
// 覆盖：待办双向联动、专注时长推进、考试愿景关联、日历排期双向同步、防循环防双领、自愈补偿

const assert = require('assert');

// 构造纯净轻量浏览器/Window模拟环境
global.window = global;
global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  getElementById: () => null,
  body: { appendChild: () => {} }
};
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};
global.toast = () => {};

// 加载核心模块
require('../js/shared-hub.js');
require('../js/life-game.js');
require('../js/life-game-ai.js');
require('../js/time-calendar-integrations.js');
require('../js/life-game-integrations.js');

async function runTests() {
  console.log('🚀 开始执行人生游戏阶段 3 深度联动自动化验证测试...\n');
  let passed = 0;

  // ----------------------------------------------------
  // 测试 1: 人生游戏现实任务与自习室待办双向绑定与状态同步
  // ----------------------------------------------------
  console.log('【测试 1】任务与自习室待办双向联动与「达成 vs 领奖」隔离');
  {
    const task = {
      id: 'task_test_sr_1',
      title: '精读线性代数第 4 章',
      category: 'study',
      difficulty: 'mid',
      rewardExp: 45,
      rewardCoins: 20,
      status: 'pending',
      dueDate: '2026-10-25',
      targetMinutes: 30,
      accumulatedMinutes: 0
    };

    // 1.1 保存任务并建立自习待办联动
    const tasks = [task];
    await window.LifeGameCore.saveTasks(tasks);
    const linkedTodo = await window.LifeGameIntegrations.studyRoom.linkTaskToStudyTodo(task);

    assert(linkedTodo, '应成功生成自习室待办');
    assert.strictEqual(linkedTodo.text, task.title, '待办文字应与任务标题一致');
    assert.strictEqual(linkedTodo.done, false, '初始状态应为未完成');

    // 1.2 模拟在自习室中打勾完成待办
    await window.LifeGameIntegrations.studyRoom.handleStudyTodoToggled(linkedTodo.id, true, 'study-room');

    const updatedTasks = await window.LifeGameCore.getTasks();
    const updatedTask = updatedTasks.find(t => t.id === task.id);

    assert(updatedTask, '任务应存在');
    assert.strictEqual(updatedTask.status, 'completed', '待办打勾后，任务应变为已达成(completed)');
    assert.notStrictEqual(updatedTask.status, 'claimed', '【关键安全规则】待办打勾绝不能直接变为已领奖(claimed)！');
    assert(updatedTask.completedAt, '应记录达成时间戳');

    // 1.3 模拟在自习室中反选取消勾选
    await window.LifeGameIntegrations.studyRoom.handleStudyTodoToggled(linkedTodo.id, false, 'study-room');
    const revertedTasks = await window.LifeGameCore.getTasks();
    const revertedTask = revertedTasks.find(t => t.id === task.id);
    assert.strictEqual(revertedTask.status, 'pending', '待办取消后，未领奖任务应恢复为 pending');

    console.log('  ✅ 测试 1 通过：待办打勾安全流转为 completed，严禁跳过领奖状态机\n');
    passed++;
  }

  // ----------------------------------------------------
  // 测试 2: 自习室专注时长自动推进 RPG 学习任务
  // ----------------------------------------------------
  console.log('【测试 2】自习室真实专注时长推进 RPG 学习任务进度');
  {
    const focusTask = {
      id: 'task_focus_test_1',
      title: '备战英语雅思听力',
      category: 'study',
      difficulty: 'mid',
      rewardExp: 45,
      rewardCoins: 20,
      status: 'pending',
      dueDate: '2026-10-26',
      targetMinutes: 40,
      accumulatedMinutes: 10
    };

    await window.LifeGameCore.saveTasks([focusTask]);

    // 2.1 模拟自习室完成 20 分钟专注会话
    await window.LifeGameIntegrations.focusSession.handleFocusSessionCompleted({
      recordId: 'rec_focus_test_001',
      durationMinutes: 20,
      taskName: '备战英语雅思听力'
    });

    let curTasks = await window.LifeGameCore.getTasks();
    let curTask = curTasks.find(t => t.id === focusTask.id);
    assert.strictEqual(curTask.accumulatedMinutes, 30, '累计时长应从 10 增加到 30 分钟');
    assert.strictEqual(curTask.status, 'pending', '30/40 分钟尚未达到目标，状态仍应为 pending');

    // 2.2 再完成 15 分钟专注会话 (累计突破 45 >= 40)
    await window.LifeGameIntegrations.focusSession.handleFocusSessionCompleted({
      recordId: 'rec_focus_test_002',
      durationMinutes: 15,
      taskName: '备战英语雅思听力'
    });

    curTasks = await window.LifeGameCore.getTasks();
    curTask = curTasks.find(t => t.id === focusTask.id);
    assert.strictEqual(curTask.accumulatedMinutes, 45, '累计时长应为 45 分钟');
    assert.strictEqual(curTask.status, 'completed', '达到 40 分钟目标后，任务应自动晋升为 completed');

    // 2.3 验证已结算记录去重池防重复计算
    const settledList = await window.LifeGameCore.getSettledStudyRecordIds();
    assert(settledList.includes('rec_focus_test_001'), '应将记录 1 记入已结算流水');
    assert(settledList.includes('rec_focus_test_002'), '应将记录 2 记入已结算流水');

    console.log('  ✅ 测试 2 通过：专注时长精准推进委托进度并在达标时自动标记达成\n');
    passed++;
  }

  // ----------------------------------------------------
  // 测试 3: 自习室考试计划与人生游戏长期愿景关联
  // ----------------------------------------------------
  console.log('【测试 3】考试计划与长期愿景关联及日期级联同步');
  {
    const goal = {
      id: 'goal_exam_test_1',
      title: '高分通过全国法考客观题',
      desc: '沉浸复习核心法律法规',
      targetDate: '2026-11-15',
      status: 'active',
      milestones: [{ id: 'ms_ex_1', title: '完成三遍真题', done: false, expReward: 100 }]
    };
    await window.LifeGameCore.saveGoals([goal]);

    // 3.1 关联考试计划
    const examItem = {
      id: 'exam_law_2026',
      title: '法律职业资格考试',
      targetDate: '2026-11-20',
      notes: '重点备考'
    };
    await window.TimeCalendarIntegrations.studyRoom.saveExams([examItem]);

    const linkRes = await window.LifeGameIntegrations.exams.linkGoalToExam(goal.id, examItem.id);
    assert.strictEqual(linkRes, true, '应成功关联考试');

    let curGoals = await window.LifeGameCore.getGoals();
    let curGoal = curGoals.find(g => g.id === goal.id);
    assert.strictEqual(curGoal.examId, examItem.id, '愿景应记录 examId');
    assert.strictEqual(curGoal.targetDate, '2026-11-20', '愿景目标达成日期应与考试日期同步');

    // 3.2 考试日期在日历或自习室中延期
    await window.LifeGameIntegrations.exams.handleExamChanged([
      { id: 'exam_law_2026', targetDate: '2026-11-28' }
    ]);

    curGoals = await window.LifeGameCore.getGoals();
    curGoal = curGoals.find(g => g.id === goal.id);
    assert.strictEqual(curGoal.targetDate, '2026-11-28', '考试日期更新应级联更新愿景日期');

    console.log('  ✅ 测试 3 通过：考试计划与愿景双向关联，日期变更平滑同步\n');
    passed++;
  }

  // ----------------------------------------------------
  // 测试 4: 时光日历排期投影与双向同步
  // ----------------------------------------------------
  console.log('【测试 4】时光日历日程投影、跨应用编辑与勾选');
  {
    const calTask = {
      id: 'task_cal_test_1',
      title: '撰写阶段 3 联调技术报告',
      desc: '梳理数据流图与边界用例',
      category: 'main',
      difficulty: 'hard',
      rewardExp: 80,
      rewardCoins: 40,
      status: 'pending',
      dueDate: '2026-10-24'
    };
    await window.LifeGameCore.saveTasks([calTask]);

    // 4.1 投射为日历日程事件
    const events = await window.LifeGameIntegrations.calendar.getTasksAsCalendarEvents('all', []);
    const projected = events.find(e => e.id === 'lg_task_' + calTask.id);

    assert(projected, '有 dueDate 的任务应投射为日历日程事件');
    assert.strictEqual(projected.title, '人生委托 · ' + calTask.title);
    assert.strictEqual(projected.date, '2026-10-24');
    assert.strictEqual(projected.source.app, 'life-game');
    assert.strictEqual(projected.source.taskId, calTask.id);

    // 4.2 从日历中修改日程日期和标题
    const editRes = await window.TimeCalendarIntegrations.saveLinkedItem({
      source: projected.source,
      title: '人生委托 · 撰写阶段 3 深度联调技术报告 (最终版)',
      date: '2026-10-28',
      notes: '更新了边界说明',
      completed: false
    });
    assert.strictEqual(editRes, true, '日历应能成功回写人生游戏委托');

    let curTasks = await window.LifeGameCore.getTasks();
    let curTask = curTasks.find(t => t.id === calTask.id);
    assert.strictEqual(curTask.title, '撰写阶段 3 深度联调技术报告 (最终版)', '任务标题应同步更新');
    assert.strictEqual(curTask.dueDate, '2026-10-28', '任务排期日期应同步更新');

    // 4.3 在日历中打勾完成委托
    const toggleRes = await window.TimeCalendarIntegrations.toggleLinkedItem(projected);
    assert.strictEqual(toggleRes, true, '日历打勾应返回 true');

    curTasks = await window.LifeGameCore.getTasks();
    curTask = curTasks.find(t => t.id === calTask.id);
    assert.strictEqual(curTask.status, 'completed', '日历打勾后任务应变为 completed 达成');
    assert.notStrictEqual(curTask.status, 'claimed', '日历打勾绝不能直接领奖！');

    // 4.4 从日历中移除排期
    await window.LifeGameIntegrations.unlinkTaskFromCalendar(calTask.id);
    curTasks = await window.LifeGameCore.getTasks();
    curTask = curTasks.find(t => t.id === calTask.id);
    assert.strictEqual(curTask.dueDate, '', '解除排期后任务 dueDate 应被清空');
    assert(curTask, '解除日历排期不应删除人生游戏中的任务本体');

    console.log('  ✅ 测试 4 通过：日历排期投影、编辑与勾选状态机完整闭环\n');
    passed++;
  }

  // ----------------------------------------------------
  // 测试 5: 自愈修复与异常隔离 (Reconciliation)
  // ----------------------------------------------------
  console.log('【测试 5】链接健康巡检与孤儿自愈机制 (Reconcile)');
  {
    const orphanTask = {
      id: 'task_orphan_test_1',
      title: '孤儿测试任务',
      category: 'study',
      status: 'pending',
      studyTodoId: 'non_existent_todo_9999' // 指向不存在的待办
    };
    await window.LifeGameCore.saveTasks([orphanTask]);

    const report = await window.LifeGameIntegrations.reconcileLinks();
    assert(report.checkedTasks > 0, '应巡检任务');
    assert(report.orphanedDetached >= 1, '应检测并优雅剥离不存在的孤儿待办引用');

    const curTasks = await window.LifeGameCore.getTasks();
    const curOrphan = curTasks.find(t => t.id === orphanTask.id);
    assert.strictEqual(curOrphan.studyTodoId, undefined, '孤儿待办引用应被安全移除');

    console.log('  ✅ 测试 5 通过：自愈巡检引擎自动清理孤儿索引，保障系统稳健\n');
    passed++;
  }

  console.log(`\n========================================`);
  console.log(`🎉 阶段 3 深度联动核心架构验证全部通过！[${passed}/${passed}]`);
  console.log(`========================================\n`);
}

runTests().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
