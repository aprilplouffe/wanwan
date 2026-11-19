'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function createStorageMock(backingMap) {
  const map = backingMap || new Map();
  return {
    _map: map,
    getItem(k) {
      return map.has(String(k)) ? map.get(String(k)) : null;
    },
    setItem(k, v) {
      map.set(String(k), String(v));
    },
    removeItem(k) {
      map.delete(String(k));
    },
    clear() {
      map.clear();
    }
  };
}

function loadSandbox(storageBacking, callAiImpl) {
  const localStorage = createStorageMock(storageBacking);
  const windowObj = {
    localStorage,
    Intl,
    Date,
    Math,
    JSON,
    console,
    callAI: callAiImpl || (async () => JSON.stringify({ messages: [{ side: 'left', type: 'text', content: '收到' }] }))
  };
  windowObj.window = windowObj;
  windowObj.globalThis = windowObj;

  const ctx = vm.createContext(windowObj);
  for (const rel of [
    'js/fan-community-works.js',
    'js/fan-community-prompts.js',
    'js/fan-community-ai.js'
  ]) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  }
  return { ctx, window: windowObj, storageMap: localStorage._map };
}

async function runTests() {
  console.log('=== 测试 1：实时时间多时区格式化与独立作品持久化 ===');
  const sharedBacking = new Map();
  let env = loadSandbox(sharedBacking);
  const works = env.window.FanCommunityWorks;

  // 固定 UTC 时刻：2026-05-01T12:30:00.000Z
  const fixedUtcMs = Date.UTC(2026, 4, 1, 12, 30, 0);
  const shanghai = works.resolveWorkCurrentTime({ showBubbleTime: true, mode: 'realtime', timeZone: 'Asia/Shanghai' }, fixedUtcMs);
  const ny = works.resolveWorkCurrentTime({ showBubbleTime: true, mode: 'realtime', timeZone: 'America/New_York' }, fixedUtcMs);
  const utc = works.resolveWorkCurrentTime({ showBubbleTime: true, mode: 'realtime', timeZone: 'UTC' }, fixedUtcMs);

  assert.strictEqual(shanghai.full, '2026-05-01 20:30', '上海时区应为 UTC+8 (20:30)');
  assert.strictEqual(ny.full, '2026-05-01 08:30', '纽约夏令时应为 UTC-4 (08:30)');
  assert.strictEqual(utc.full, '2026-05-01 12:30', 'UTC 应为 12:30');
  console.log('✓ 实时时间多时区转换精确无误');

  // 创建三个不同模式的作品，独立配置时间设置
  const wManual = works.createWork('手动作品').work;
  const wRoleplay = works.createWork('角色互动作品').work;
  const wStory = works.createWork('剧情生成作品').work;

  const dManual = works.getWorkData(wManual.id);
  dManual.creationMode = 'manual';
  dManual.timeSettings = works.normalizeTimeSettings({
    showBubbleTime: true,
    mode: 'realtime',
    timeZone: 'Asia/Tokyo'
  });
  works.saveWorkData(wManual.id, dManual);

  const dRoleplay = works.getWorkData(wRoleplay.id);
  dRoleplay.creationMode = 'ai_roleplay';
  const t0 = 1770000000000;
  dRoleplay.timeSettings = works.resetVirtualClockStart(
    works.normalizeTimeSettings({ showBubbleTime: true, mode: 'virtual', virtualSpeed: 60 }, t0),
    '2025-12-31',
    '23:50',
    t0
  );
  dRoleplay.timeSettings.showBubbleTime = true;
  dRoleplay.timeSettings.mode = 'virtual';
  dRoleplay.timeSettings.virtualSpeed = 60;
  works.saveWorkData(wRoleplay.id, dRoleplay);

  const dStory = works.getWorkData(wStory.id);
  dStory.creationMode = 'ai_story';
  dStory.timeSettings = works.normalizeTimeSettings({
    showBubbleTime: false,
    mode: 'realtime',
    timeZone: 'Europe/London'
  });
  works.saveWorkData(wStory.id, dStory);

  // 模拟页面刷新：重新加载全新沙箱
  env = loadSandbox(sharedBacking);
  const worksReloaded = env.window.FanCommunityWorks;
  const rManual = worksReloaded.getWorkData(wManual.id);
  const rRoleplay = worksReloaded.getWorkData(wRoleplay.id);
  const rStory = worksReloaded.getWorkData(wStory.id);

  assert.strictEqual(rManual.timeSettings.showBubbleTime, true);
  assert.strictEqual(rManual.timeSettings.timeZone, 'Asia/Tokyo');
  assert.strictEqual(rRoleplay.timeSettings.mode, 'virtual');
  assert.strictEqual(rRoleplay.timeSettings.virtualSpeed, 60);
  assert.strictEqual(rRoleplay.timeSettings.virtualStartDate, '2025-12-31');
  assert.strictEqual(rRoleplay.timeSettings.virtualStartTime, '23:50');
  assert.strictEqual(rStory.timeSettings.showBubbleTime, false);
  assert.strictEqual(rStory.timeSettings.timeZone, 'Europe/London');
  console.log('✓ 三种创作模式时间设置按作品独立保存并在刷新后恢复');

  console.log('\n=== 测试 2：虚拟时间自动推进、暂停/继续、变速与已发送消息时间冻结 ===');
  // 真实经过 1 分钟（60_000 ms），60x 流速 => 虚拟推进 60 分钟 => 2026-01-01 00:50
  const t1 = t0 + 60 * 1000;
  const vAtT1 = worksReloaded.resolveWorkCurrentTime(rRoleplay.timeSettings, t1);
  assert.strictEqual(vAtT1.full, '2026-01-01 00:50', '60x 流速 1 分钟后应跨年到 2026-01-01 00:50');

  // 在 t1 发送消息 A，冻结时间戳应为 2026-01-01 00:50
  const msgA = worksReloaded.stampMessageTime({ id: 'm_a', type: 'text', side: 'right', text: '新年快乐！' }, rRoleplay.timeSettings, t1);
  assert.strictEqual(msgA.sentTime, '00:50');
  assert.strictEqual(msgA.sentTimeFull, '2026-01-01 00:50');

  // 在 t1 暂停虚拟时钟，再过 10 分钟真实时间 t2
  const pausedTs = worksReloaded.pauseVirtualClock(rRoleplay.timeSettings, t1);
  const t2 = t1 + 10 * 60 * 1000;
  const vAtT2Paused = worksReloaded.resolveWorkCurrentTime(pausedTs, t2);
  assert.strictEqual(vAtT2Paused.full, '2026-01-01 00:50', '暂停期间虚拟时间不得推进');
  assert.strictEqual(vAtT2Paused.paused, true);

  // 在 t2 恢复虚拟时钟并改流速为 10x，再过 1 分钟真实时间 t3 => 推进 10 分钟 => 01:00
  let resumedTs = worksReloaded.resumeVirtualClock(pausedTs, t2);
  resumedTs = worksReloaded.updateVirtualClockSpeed(resumedTs, 10, t2);
  const t3 = t2 + 60 * 1000;
  const vAtT3 = worksReloaded.resolveWorkCurrentTime(resumedTs, t3);
  assert.strictEqual(vAtT3.full, '2026-01-01 01:00', '恢复后按 10x 推进 1 分钟应为 01:00');

  // 发送消息 B，时间戳为 01:00，同时验证已发送的消息 A 绝不变更
  const msgB = worksReloaded.stampMessageTime({ id: 'm_b', type: 'text', side: 'left', text: '你也新年快乐' }, resumedTs, t3);
  worksReloaded.stampMessageTime(msgA, resumedTs, t3); // 再次调用不强制覆盖，保持原值
  assert.strictEqual(msgA.sentTime, '00:50', '已发送消息 A 必须保留发送时的时间');
  assert.strictEqual(msgA.sentTimeFull, '2026-01-01 00:50');
  assert.strictEqual(msgB.sentTime, '01:00');
  assert.strictEqual(msgB.sentTimeFull, '2026-01-01 01:00');
  console.log('✓ 虚拟时间推进、暂停/继续、变速与已发送消息时间冻结全部通过');

  console.log('\n=== 测试 3：隐藏楼层编号与移动到指定楼层（含持久化） ===');
  const msgC = worksReloaded.stampMessageTime({ id: 'm_c', type: 'text', side: 'right', text: '我在楼下等你' }, resumedTs, t3 + 30 * 1000);
  const msgD = worksReloaded.stampMessageTime({ id: 'm_d', type: 'text', side: 'left', text: '马上下来' }, resumedTs, t3 + 60 * 1000);

  rRoleplay.timeSettings = resumedTs;
  rRoleplay.items = worksReloaded.syncMessageFloors([msgA, msgB, msgC, msgD]);
  assert.deepStrictEqual(Array.from(rRoleplay.items, m => m.floor), [1, 2, 3, 4], '初始楼层应为 1..4');

  // 将第 4 楼 (msgD) 移动到第 2 楼
  const moveRes1 = worksReloaded.moveMessageToFloor(rRoleplay.items, 3, 2);
  assert.strictEqual(moveRes1.ok, true);
  assert.strictEqual(moveRes1.fromFloor, 4);
  assert.strictEqual(moveRes1.toFloor, 2);
  assert.deepStrictEqual(Array.from(moveRes1.items, m => m.id), ['m_a', 'm_d', 'm_b', 'm_c'], '其余消息顺序应自动顺延');
  assert.deepStrictEqual(Array.from(moveRes1.items, m => m.floor), [1, 2, 3, 4], '楼层编号应自动重新排为 1..4');

  // 非法楼层校验
  assert.strictEqual(worksReloaded.moveMessageToFloor(moveRes1.items, 0, 0).ok, false);
  assert.strictEqual(worksReloaded.moveMessageToFloor(moveRes1.items, 0, 5).ok, false);
  assert.strictEqual(worksReloaded.moveMessageToFloor(moveRes1.items, 0, 2.5).ok, false);

  // 保存并在刷新后恢复楼层顺序
  rRoleplay.items = moveRes1.items;
  worksReloaded.saveWorkData(wRoleplay.id, rRoleplay);

  const capturedCalls = [];
  env = loadSandbox(sharedBacking, async (messages, opts) => {
    capturedCalls.push({ messages, system: opts.system });
    return JSON.stringify({
      messages: [
        { side: 'left', type: 'text', content: '好呀，我看到你的顺序和时间了' }
      ]
    });
  });

  const reloadedAfterMove = env.window.FanCommunityWorks.getWorkData(wRoleplay.id);
  assert.deepStrictEqual(Array.from(reloadedAfterMove.items, m => m.id), ['m_a', 'm_d', 'm_b', 'm_c'], '刷新后调整过的楼层顺序必须保留');
  assert.deepStrictEqual(Array.from(reloadedAfterMove.items, m => m.floor), [1, 2, 3, 4]);
  console.log('✓ 隐藏楼层编号、移动到指定楼层、自动重排与刷新持久化通过');

  console.log('\n=== 测试 4：AI 按调整后楼层顺序及对应时间读取上下文（角色互动 & 剧情生成） ===');
  const aiApi = env.window.FanCommunityAi;
  await aiApi.requestAiTurn({
    workState: reloadedAfterMove,
    triggerType: 'user_message',
    currentChatTime: vAtT3
  });
  assert.strictEqual(capturedCalls.length, 1);
  const rpUserPrompt = capturedCalls[0].messages[0].content;
  const rpSystem = capturedCalls[0].system;

  assert.ok(rpSystem.includes('【当前聊天时钟与时间线】'), 'System prompt 应注入当前聊天时钟段落');
  assert.ok(rpSystem.includes('虚拟时间') && rpSystem.includes('2026-01-01 01:00'), 'System prompt 应包含当前虚拟时间');

  const idxA = rpUserPrompt.indexOf('[2026-01-01 00:50] 我：新年快乐！');
  const idxD = rpUserPrompt.indexOf('[2026-01-01 01:10] 对方：马上下来');
  const idxB = rpUserPrompt.indexOf('[2026-01-01 01:00] 对方：你也新年快乐');
  const idxC = rpUserPrompt.indexOf('[2026-01-01 01:05] 我：我在楼下等你');
  assert.ok(idxA !== -1 && idxD !== -1 && idxB !== -1 && idxC !== -1, '所有消息应附带各自的冻结发送时间传入 AI');
  assert.ok(idxA < idxD && idxD < idxB && idxB < idxC, 'AI 上下文必须严格遵循移动楼层后的新顺序 (A -> D -> B -> C)');

  // AI 剧情生成模式同样验证
  const storyWork = env.window.FanCommunityWorks.getWorkData(wStory.id);
  storyWork.items = env.window.FanCommunityWorks.syncMessageFloors([msgC, msgA]);
  await aiApi.requestAiTurn({
    workState: storyWork,
    userDirection: '两人继续聊跨年',
    currentChatTime: utc
  });
  assert.strictEqual(capturedCalls.length, 2);
  const storyPrompt = capturedCalls[1].messages[0].content;
  const storySystem = capturedCalls[1].system;
  assert.ok(storySystem.includes('实时时间') && storySystem.includes('2026-05-01 12:30'), 'AI 剧情模式应注入实时时间时钟');
  assert.ok(storyPrompt.indexOf('[2026-01-01 01:05] 我：我在楼下等你') < storyPrompt.indexOf('[2026-01-01 00:50] 我：新年快乐！'), 'AI 剧情模式也严格遵循楼层顺序与时间');
  console.log('✓ AI 角色互动与 AI 剧情生成均按楼层顺序与消息时间准确读取上下文');

  console.log('\n=== 测试 5：UI 与样式契约检查（开关、设置项、菜单项、聊天区不显楼层号） ===');
  const chatSrc = fs.readFileSync(path.join(ROOT, 'js/fan-community-chat.js'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(ROOT, 'css/fan-community-chat.css'), 'utf8');

  assert.ok(chatSrc.includes('气泡时间显示'), '捡手机设置中应有「气泡时间显示」开关');
  assert.ok(chatSrc.includes('fc-time-show-toggle'), '气泡时间显示开关 DOM ID 存在');
  assert.ok(chatSrc.includes('fc-time-mode-realtime') && chatSrc.includes('fc-time-mode-virtual'), '支持实时时间与虚拟时间切换');
  assert.ok(chatSrc.includes('fc-time-timezone-select'), '实时时间支持自选时区');
  assert.ok(chatSrc.includes('fc-time-virtual-date') && chatSrc.includes('fc-time-virtual-time') && chatSrc.includes('fc-time-virtual-speed') && chatSrc.includes('fc-time-virtual-pause-btn'), '虚拟时间支持自定义起始日期、时间、流速与暂停/继续');
  assert.ok(chatSrc.includes("action: 'moveFloor'") && chatSrc.includes("label: '移动到指定楼层'"), '长按菜单应包含「移动到指定楼层」');
  assert.ok(chatSrc.includes('fc-chat-move-floor-input') && chatSrc.includes('fc-chat-move-floor-submit'), '移动到指定楼层弹窗输入框与确认按钮存在');

  // 确认 renderMessages 聊天流中绝不渲染楼层号，仅在编辑操作中展示
  const renderFnStart = chatSrc.indexOf('function renderMessages(scrollToBottom)');
  const renderFnEnd = chatSrc.indexOf('syncRoleButton();', renderFnStart);
  const renderFnBody = chatSrc.slice(renderFnStart, renderFnEnd);
  assert.ok(renderFnBody.includes('showBubbleTime') && renderFnBody.includes('fc-chat-bubble-time'), '聊天流应根据 showBubbleTime 开关决定是否渲染气泡时间');
  assert.ok(!renderFnBody.includes('item.floor') && !renderFnBody.includes('楼'), '聊天界面 renderMessages 绝不显示楼层编号');

  assert.ok(cssSrc.includes('.fc-chat-side-meta') && cssSrc.includes('.fc-chat-bubble-time') && cssSrc.includes('.fc-time-switch'), 'CSS 样式完整包含气泡时间与设置控件');
  console.log('✓ UI 与 CSS 契约检查全部通过');

  console.log('\n🎉 全部消息时间显示与楼层排序测试通过！');
}

runTests().catch(err => {
  console.error('❌ 测试失败：', err);
  process.exit(1);
});
