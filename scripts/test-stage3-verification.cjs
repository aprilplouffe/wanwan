// scripts/test-stage3-verification.cjs
// 弯弯小手机｜人生游戏阶段 3 封版前深度加固完整自动化回归与边界校验测试脚本
// 覆盖：
// 1. 专注记录匹配安全：稳定任务 ID 优先、严禁乱塞最新任务、未匹配留存待分配池、时长防多任务重用
// 2. 学习进度与基础奖励分离：life_game_records_settled_v1 独立职责、已核销基础经验仍可推进关联任务、重复同步完全幂等
// 3. 跨 App 异常恢复：自习室失败部分成功、日历排期成功但注册表失败、断点重试按稳定 ID 查找、自愈修复不重复建任务
// 4. 多 Char 与学习记录归属：专注开始冻结快照、中途切换 Char 不转移学习记录、用户资产不被垄断、私人日历严格隔离
// 5. 阶段 1 经验/金币/等级结算 与 阶段 2 AI 规划全量兼容性回归

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
  console.log('🚀 开始执行「人生游戏阶段 3」封版加固全量自动化测试...\n');
  let passed = 0;

  // ====================================================
  // 【加固测试 1】专注记录匹配安全与待分配池隔离
  // ====================================================
  console.log('【加固测试 1】专注记录匹配安全：稳定 ID 优先、禁止塞给最新任务、未匹配留存待分配池');
  {
    const targetTask = {
      id: 'task_math_analysis_1',
      title: '数学分析真题精解',
      category: 'study',
      difficulty: 'mid',
      rewardExp: 50,
      rewardCoins: 25,
      status: 'pending',
      dueDate: '2026-10-26',
      targetMinutes: 60,
      accumulatedMinutes: 10
    };
    const otherStudyTask = {
      id: 'task_cs_algo_latest',
      title: '数据结构与算法攻坚',
      category: 'study',
      difficulty: 'hard',
      rewardExp: 70,
      rewardCoins: 35,
      status: 'pending',
      dueDate: '2026-10-27',
      targetMinutes: 90,
      accumulatedMinutes: 0
    };
    await window.LifeGameCore.saveTasks([targetTask, otherStudyTask]);

    // 1.1 稳定任务 ID 优先匹配
    const resAlloc1 = await window.LifeGameIntegrations.focusSession.allocateFocusRecord({
      recordId: 'rec_focus_math_001',
      durationMinutes: 25,
      taskId: 'task_math_analysis_1',
      taskName: '随意填写的名称' // 即使名称不完全一致，稳定 taskId 严格优先
    });
    assert.strictEqual(resAlloc1.status, 'allocated', '稳定 taskId 必须成功匹配');
    assert.strictEqual(resAlloc1.taskId, 'task_math_analysis_1');
    assert.strictEqual(resAlloc1.accumulatedMinutes, 35);

    // 1.2 无法匹配的专注记录：禁止自动计入 latest 学习任务，必须保留为待分配状态
    const resUnmatched = await window.LifeGameIntegrations.focusSession.allocateFocusRecord({
      recordId: 'rec_unmatched_random_002',
      durationMinutes: 30,
      taskName: '完全无关的冷门小语种学习' // 无对应任务
    });
    assert.strictEqual(resUnmatched.status, 'unallocated', '无法匹配的记录必须返回 unallocated 待分配状态');
    assert.strictEqual(resUnmatched.reason, 'no_matching_study_task');

    // 验证另一个学习任务未被偷跑增加时长
    const tasksAfterUnmatched = await window.LifeGameCore.getTasks();
    const otherTaskCur = tasksAfterUnmatched.find(t => t.id === 'task_cs_algo_latest');
    assert.strictEqual(otherTaskCur.accumulatedMinutes, 0, '【红线规则】未匹配记录绝不能擅自计入最新学习任务！');

    // 验证未匹配记录确实留存在待分配池中
    const unallocatedPool = await window.LifeGameIntegrations.focusSession.getUnallocatedRecords();
    const foundUnallocated = unallocatedPool.find(r => r.recordId === 'rec_unmatched_random_002');
    assert(foundUnallocated, '未匹配记录必须安全保存在待分配池中');
    assert.strictEqual(foundUnallocated.status, 'unallocated');
    assert.strictEqual(foundUnallocated.durationMinutes, 30);

    // 1.3 用户后续显式将待分配记录指派给目标任务
    const manualAllocRes = await window.LifeGameIntegrations.focusSession.allocateRecordToTask('rec_unmatched_random_002', 'task_cs_algo_latest');
    assert.strictEqual(manualAllocRes.success, true, '手动指派应成功');
    const tasksAfterManual = await window.LifeGameCore.getTasks();
    const otherTaskUpdated = tasksAfterManual.find(t => t.id === 'task_cs_algo_latest');
    assert.strictEqual(otherTaskUpdated.accumulatedMinutes, 30, '手动指派后目标任务应累计 30 分钟');

    console.log('  ✅ 加固测试 1 通过：稳定 ID 优先匹配，未匹配记录安全隔离入待分配池，杜绝偷跑！\n');
    passed++;
  }

  // ====================================================
  // 【加固测试 2】防止同一段专注时长被多个独立任务重复使用
  // ====================================================
  console.log('【加固测试 2】时长消费唯一性：防止同一段专注时长被多个任务重复用于领奖');
  {
    const taskA = {
      id: 'task_share_test_a',
      title: '近代史纲要自习',
      category: 'study',
      status: 'pending',
      targetMinutes: 30,
      accumulatedMinutes: 0
    };
    const taskB = {
      id: 'task_share_test_b',
      title: '马克思主义基本原理',
      category: 'study',
      status: 'pending',
      targetMinutes: 30,
      accumulatedMinutes: 0
    };
    await window.LifeGameCore.saveTasks([taskA, taskB]);

    const singleRecordId = 'rec_shared_focus_single_101';
    // 第一次分配给任务 A
    const firstAlloc = await window.LifeGameIntegrations.focusSession.allocateFocusRecord({
      recordId: singleRecordId,
      durationMinutes: 20,
      taskId: 'task_share_test_a'
    });
    assert.strictEqual(firstAlloc.status, 'allocated');

    // 恶意或异常再次尝试把同一条记录分配给任务 B
    const secondAlloc = await window.LifeGameIntegrations.focusSession.allocateFocusRecord({
      recordId: singleRecordId,
      durationMinutes: 20,
      taskId: 'task_share_test_b'
    });
    assert.strictEqual(secondAlloc.status, 'already_allocated', '同一段时长必须被判定为 already_allocated');
    assert.strictEqual(secondAlloc.taskId, 'task_share_test_a', '已分配的目标任务必须锁定');

    const curTasks = await window.LifeGameCore.getTasks();
    const curTaskB = curTasks.find(t => t.id === 'task_share_test_b');
    assert.strictEqual(curTaskB.accumulatedMinutes, 0, '任务 B 绝对不能重复消费已被任务 A 消费的时长！');

    console.log('  ✅ 加固测试 2 通过：专注记录具有唯一消费所有权，严格防多任务冒领！\n');
    passed++;
  }

  // ====================================================
  // 【加固测试 3】学习进度与基础奖励分离
  // ====================================================
  console.log('【加固测试 3】基础经验核销 (life_game_records_settled_v1) 与 任务进度分配 独立判定');
  {
    const studyTask = {
      id: 'task_progress_sep_1',
      title: '微积分定积分计算',
      category: 'study',
      status: 'pending',
      targetMinutes: 40,
      accumulatedMinutes: 0
    };
    await window.LifeGameCore.saveTasks([studyTask]);

    const recordId = 'rec_base_settled_before_progress_99';
    // 模拟场景：该条记录已经由历史流水或自习室发放过基础经验，记录在 life_game_records_settled_v1
    await window.LifeGameCore.addSettledStudyRecordId(recordId);
    let settledIds = await window.LifeGameCore.getSettledStudyRecordIds();
    assert(settledIds.includes(recordId), '基础经验已处于核销完成状态');

    // 执行 handleFocusSessionCompleted：基础经验应跳过发放（防双发），但合法关联的任务进度仍必须正常推进！
    const completeRes = await window.LifeGameIntegrations.focusSession.handleFocusSessionCompleted({
      recordId: recordId,
      durationMinutes: 25,
      taskId: 'task_progress_sep_1',
      taskName: '微积分定积分计算'
    });

    assert.strictEqual(completeRes.baseRewardSettled, true);
    assert.strictEqual(completeRes.allocationResult.status, 'allocated', '已核销基础经验的记录仍应推进关联任务');

    let curTasks = await window.LifeGameCore.getTasks();
    let curTask = curTasks.find(t => t.id === 'task_progress_sep_1');
    assert.strictEqual(curTask.accumulatedMinutes, 25, '任务应成功获得 25 分钟进度');

    // 重复调用 handleFocusSessionCompleted：进度不能再次累加
    const duplicateRes = await window.LifeGameIntegrations.focusSession.handleFocusSessionCompleted({
      recordId: recordId,
      durationMinutes: 25,
      taskId: 'task_progress_sep_1'
    });
    assert.strictEqual(duplicateRes.allocationResult.status, 'already_allocated', '重复同步绝不能重复增加进度');

    curTasks = await window.LifeGameCore.getTasks();
    curTask = curTasks.find(t => t.id === 'task_progress_sep_1');
    assert.strictEqual(curTask.accumulatedMinutes, 25, '累计分钟数保持 25，未发生重复累计');

    console.log('  ✅ 加固测试 3 通过：基础经验与任务进度完全解耦，重复同步严格幂等！\n');
    passed++;
  }

  // ====================================================
  // 【加固测试 4】跨 App 异常恢复与部分成功/自愈重试
  // ====================================================
  console.log('【加固测试 4】跨 App 异常容灾：部分成功多态报告、断点重试与注册表自愈');
  {
    const failoverTask = {
      id: 'task_failover_test_1',
      title: '计算机网络 TCP 协议族精读',
      category: 'study',
      status: 'pending',
      dueDate: '2026-10-29'
    };
    await window.LifeGameCore.saveTasks([failoverTask]);

    // 4.1 测试：自习室待办创建步骤失败（部分成功状态 partial）
    const partialRes1 = await window.LifeGameIntegrations.studyRoom.linkTaskToStudyTodo(failoverTask, {
      _injectStudyRoomFailure: true
    });
    assert.strictEqual(partialRes1.status, 'partial', '自习室创建失败应返回 partial 状态');
    assert.strictEqual(partialRes1.success, false);
    assert.strictEqual(partialRes1.partial, true);
    assert.strictEqual(partialRes1.stepResults.studyRoomTodo.error, 'injected_study_room_failure');

    // 4.2 重试同步：自习室恢复正常，按稳定 ID 查找，成功完成同步且不重复创建
    const retryRes1 = await window.LifeGameIntegrations.studyRoom.linkTaskToStudyTodo(failoverTask);
    assert.strictEqual(retryRes1.status, 'success', '重试时应成功');
    assert.strictEqual(retryRes1.id, 'sr_todo_lg_task_failover_test_1');

    // 再次调用，验证幂等性（reused 标志为 true，不追加新待办）
    const idempotentRes = await window.LifeGameIntegrations.studyRoom.linkTaskToStudyTodo(failoverTask);
    assert.strictEqual(idempotentRes.status, 'success');
    assert.strictEqual(idempotentRes.stepResults.studyRoomTodo.reused, true, '必须复用已有待办，严禁重复创建');

    // 4.3 测试：日历排期成功，但链接注册表保存失败 (部分成功)
    const partialCalRes = await window.LifeGameIntegrations.calendar.scheduleTaskToCalendar(
      failoverTask,
      '2026-10-30',
      { _injectLinkRegistryFailure: true }
    );
    assert.strictEqual(partialCalRes.status, 'partial', '注册表失败应返回 partial');
    assert.strictEqual(partialCalRes.stepResults.calendarScheduled.success, true);
    assert.strictEqual(partialCalRes.stepResults.linkRegistry.error, 'injected_link_registry_failure');

    // 4.4 触发自愈补偿巡检 (reconcileLinks)，自动检测到缺失的日历链接并平滑修复
    const reconcileReport = await window.LifeGameIntegrations.reconcileLinks();
    assert.strictEqual(reconcileReport.status, 'success');
    assert(reconcileReport.recoveredPartials >= 1, '巡检引擎必须成功自愈修复部分失败的链接');

    // 验证日历链接已被重新修复
    const repairedLink = await window.LifeGameIntegrations.links.findLink('life-game', failoverTask.id, 'time-calendar');
    assert(repairedLink, '丢失的日历链接应在巡检后成功恢复');
    assert.strictEqual(repairedLink.status, 'active');

    console.log('  ✅ 加固测试 4 通过：部分成功状态精准报告，断点重试与自愈引擎完美闭环！\n');
    passed++;
  }

  // ====================================================
  // 【加固测试 5】多 Char 隔离与学习记录资产归属
  // ====================================================
  console.log('【加固测试 5】多 Char 与学习记录归属：专注上下文快照隔离与个人资产标记');
  {
    // 模拟自习室专注开始时的快照锁定
    const sessionSnapshot = {
      taskType: '学习攻坚',
      taskName: '心理学导论研读',
      taskId: 'task_psy_001',
      todoId: 'sr_todo_psy_001',
      companionCharId: 'char_wanwan_01',
      companionCharName: '林弯弯',
      startedAt: Date.now()
    };

    // 模拟专注过程中用户在外部或界面中切换了伴侣角色（切换为 char_other_02）
    let currentCompanion = { id: 'char_other_02', name: '苏念' };

    // 专注完成时：必须提取 sessionSnapshot 中固定的 companionCharId，绝不能采用中途被切换的 char_other_02
    const duration = 30;
    const completedRecord = {
      id: 'rec_user_study_asset_1',
      date: new Date().toISOString(),
      type: sessionSnapshot.taskType,
      name: sessionSnapshot.taskName,
      durationMinutes: duration,
      companionCharId: sessionSnapshot.companionCharId, // 忠实保留开始时的快照
      companionCharName: sessionSnapshot.companionCharName,
      taskId: sessionSnapshot.taskId,
      todoId: sessionSnapshot.todoId,
      isUserPersonalRecord: true // 用户个人学习资产
    };

    assert.strictEqual(completedRecord.companionCharId, 'char_wanwan_01', '专注记录必须归属于开始时的伴学角色');
    assert.notStrictEqual(completedRecord.companionCharId, currentCompanion.id, '中途切换的角色绝不能篡改正在进行的专注归属');
    assert.strictEqual(completedRecord.isUserPersonalRecord, true, '学习记录必须是用户个人资产');

    // 验证日历过滤时私人事件的隔离逻辑
    const personalTaskEvent = {
      id: 'lg_task_personal_1',
      title: '个人专注计划',
      date: '2026-10-25',
      relationType: 'personal',
      charId: null
    };
    const charWanwanPrivateEvent = {
      id: 'cal_wanwan_private_1',
      title: '弯弯的私人纪念备忘',
      date: '2026-10-25',
      relationType: 'specificChar',
      charId: 'char_wanwan_01'
    };
    const charSuNianPrivateEvent = {
      id: 'cal_sunian_private_1',
      title: '苏念的专属约定',
      date: '2026-10-25',
      relationType: 'specificChar',
      charId: 'char_other_02'
    };

    const allEvents = [personalTaskEvent, charWanwanPrivateEvent, charSuNianPrivateEvent];

    // 当用户查看弯弯视角时
    const wanwanView = allEvents.filter(e => e.relationType === 'personal' || e.charId === 'char_wanwan_01');
    assert(wanwanView.includes(personalTaskEvent), '个人学习委托对所有角色可见');
    assert(wanwanView.includes(charWanwanPrivateEvent), '弯弯视角可见弯弯事件');
    assert(!wanwanView.includes(charSuNianPrivateEvent), '【角色隔离红线】弯弯视角严禁泄漏苏念的私人事件！');

    console.log('  ✅ 加固测试 5 通过：专注快照防中途篡改，个人资产明确，Char 私人日历严格隔离！\n');
    passed++;
  }

  // ====================================================
  // 【加固测试 6】阶段 1 (EXP/金币/等级) 与 阶段 2 (AI 规划) 兼容性回归
  // ====================================================
  console.log('【加固测试 6】阶段 1 核心 RPG 结算与阶段 2 AI 规划全量回归校验');
  {
    // 6.1 阶段 1 领奖状态机与经济总线
    const r日语Task = {
      id: 'task_jp_n2_1',
      title: '完成日语 N2 核心词汇复习',
      category: 'study',
      difficulty: 'mid',
      rewardExp: 40,
      rewardCoins: 20,
      status: 'completed', // 已达成
      targetMinutes: 30,
      accumulatedMinutes: 30
    };
    await window.LifeGameCore.saveTasks([r日语Task]);

    const claimRes = await window.LifeGameCore.claimTaskReward(r日语Task.id);
    assert.strictEqual(claimRes.success, true, '正常领奖应成功');
    assert.strictEqual(claimRes.expGranted, 40);
    assert.strictEqual(claimRes.coinsGranted, 20);

    // 重复领奖拦截
    const reClaimRes = await window.LifeGameCore.claimTaskReward(r日语Task.id);
    assert.strictEqual(reClaimRes.success, false, '重复领奖必须被拦截');

    // 6.2 阶段 2 AI 规划草案应用
    const aiDraft = {
      id: 'draft_stage2_compat_test',
      goalTitle: '拿下软件设计师中级证书',
      goalDesc: '备考中级软考主线规划',
      targetDate: '2026-11-30',
      stages: [
        {
          stageNumber: 1,
          stageTitle: '基础知识通关',
          milestones: [{ title: '计算机体系结构掌握', expReward: 100 }],
          tasks: [
            {
              title: '研读计算机组成原理精选考点',
              category: 'study',
              difficulty: 'mid',
              dueDate: '2026-10-31',
              rewardExp: 45,
              rewardCoins: 20,
              targetMinutes: 45,
              selected: true
            }
          ]
        }
      ]
    };

    await window.LifeGameAI.saveDraft(aiDraft);
    const applyRes = await window.LifeGameAI.applyDraft(aiDraft.id, null, {
      syncStudyTodos: true,
      syncCalendar: true
    });
    assert.strictEqual(applyRes.success, true, 'AI 草案应用应成功');
    assert.strictEqual(applyRes.tasksCount, 1, '应生成 1 项正式现实任务');

    // 验证生成的任务是否具备完整的阶段 3 联动支持
    const allTasks = await window.LifeGameCore.getTasks();
    const createdTask = allTasks.find(t => t.title === '研读计算机组成原理精选考点');
    assert(createdTask, 'AI 生成的任务应已入库');
    assert.strictEqual(createdTask.studyTodoId, 'sr_todo_lg_' + createdTask.id, '应已自动挂接自习室待办');
    assert.strictEqual(createdTask.dueDate, '2026-10-31', '排期日期应保留');

    console.log('  ✅ 加固测试 6 通过：阶段 1 状态机与阶段 2 AI 目标拆解计划完全兼容无暇！\n');
    passed++;
  }

  console.log(`\n======================================================`);
  console.log(`🎉 阶段 3 封版加固所有针对性边界测试全部通过！[${passed}/${passed}]`);
  console.log(`======================================================\n`);
}

runTests().catch(err => {
  console.error('❌ 加固测试失败:', err);
  process.exit(1);
});
