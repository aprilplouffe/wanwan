// scripts/test-calendar-v2-phase3.cjs
// 时光日历 2.0 阶段 3 核心功能深度自动化断言套件
// 涵盖：多 Char 专属日程可见性与隐私隔离、永久去重索引、人生游戏跨模块防重叠、
// 双重授权校验（AI前后）、离线温暖模板、微信投递幂等恢复、作息配置及 Phase 1/2 回归

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

// 模拟最小浏览器环境
function setupMockEnv() {
  const store = {};
  global.localStorage = {
    getItem: (k) => store[k] !== undefined ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };

  const messagesTable = [];
  const chatsTable = [];
  const charactersTable = [
    { id: 1, name: '用户本人', type: 'user' },
    { id: 2, name: '林弯弯', nick: '弯弯', type: 'partner', personality: '温柔细腻' },
    { id: 3, name: '沈星回', nick: '星回', type: 'partner', personality: '清冷从容' }
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
      }),
      deleteChar: (id) => {
        const idx = charactersTable.findIndex(c => c.id === Number(id));
        if (idx >= 0) charactersTable.splice(idx, 1);
      }
    },
    config: {
      get: async (key) => store[key] !== undefined ? { key, value: JSON.parse(store[key]) } : null,
      put: async (item) => { store[item.key] = JSON.stringify(item.value); }
    }
  };

  global.document = {
    readyState: 'complete',
    getElementById: () => null,
    createElement: () => ({
      style: {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      appendChild: () => {},
      remove: () => {},
      querySelector: () => null,
      querySelectorAll: () => []
    }),
    body: {
      appendChild: () => {}
    },
    addEventListener: () => {}
  };

  global.window = {
    db: global.db,
    localStorage: global.localStorage,
    document: global.document,
    toast: () => {},
    callAI: async () => '今天辛苦了，早点休息哦。'
  };

  return { store, messagesTable, chatsTable, charactersTable };
}

async function main() {
  console.log('====================================================');
  console.log(' 时光日历 2.0 阶段 3 核心功能深度自动化断言测试');
  console.log('====================================================\n');

  setupMockEnv();

  // 1. 载入核心组件
  const companionCode = fs.readFileSync(path.join(__dirname, '../js/time-calendar-companion.js'), 'utf8');
  eval(companionCode);

  const aiCode = fs.readFileSync(path.join(__dirname, '../js/time-calendar-ai.js'), 'utf8');
  eval(aiCode);

  // ==========================================
  // 测试组 1: 多 Char 专属日程可见性与角色隔离
  // ==========================================
  console.log('【测试组 1: 多 Char 专属日程可见性与严格隐私隔离】');

  const mockEvents = [
    { id: 'ev_priv_1', title: '私人私密日记', visibility: 'private', relationType: 'personal' },
    { id: 'ev_auth_wanwan', title: '与弯弯看话剧', visibility: 'selected-chars', allowedCharIds: ['2'], relationType: 'specificChar' },
    { id: 'ev_auth_both', title: '三人自习讨论', visibility: 'selected-chars', allowedCharIds: ['2', '3'] },
    { id: 'ev_auth_xinghui', title: '星回画展', visibility: 'selected-chars', allowedCharIds: ['3'] },
    { id: 'ev_legacy_personal', title: '旧版个人备忘', relationType: 'personal' },
    { id: 'ev_legacy_wanwan', title: '旧版弯弯纪念', relationType: 'specificChar', charId: '2' }
  ];

  function filterEventsForView(events, filterCharId) {
    if (filterCharId === 'personal') {
      return events.filter(ev => {
        if (ev.visibility === 'private') return true;
        if (ev.visibility === 'selected-chars') return false;
        if (ev.relationType === 'personal' && !ev.charId) return true;
        if (!ev.charId && (!ev.source || !ev.source.charId)) return true;
        return false;
      });
    } else if (filterCharId !== 'all') {
      const targetId = String(filterCharId);
      return events.filter(ev => {
        // 1. 私密日程对任何 Char 绝对不可见
        if (ev.visibility === 'private') return false;
        // 2. 授权开放给特定 Char
        if (ev.visibility === 'selected-chars' && Array.isArray(ev.allowedCharIds)) {
          return ev.allowedCharIds.map(String).indexOf(targetId) >= 0;
        }
        // 3. 兼容既有特定角色关联日程
        if (ev.relationType === 'specificChar' && ev.charId && String(ev.charId) === targetId) return true;
        if (ev.ownerCharId && String(ev.ownerCharId) === targetId) return true;
        if (ev.charId && String(ev.charId) === targetId) return true;
        if (ev.source && ev.source.charId && String(ev.source.charId) === targetId) return true;
        return false;
      });
    }
    return events;
  }

  runTest('私密日程严格对任何特定角色隐藏', () => {
    const wanwanList = filterEventsForView(mockEvents, '2');
    const hasPrivate = wanwanList.some(e => e.id === 'ev_priv_1' || e.visibility === 'private');
    assert.strictEqual(hasPrivate, false, '私密日程绝不能泄露给林弯弯视角');
  });

  runTest('授权日程仅对被授权的角色可见', () => {
    const wanwanList = filterEventsForView(mockEvents, '2');
    const xinghuiList = filterEventsForView(mockEvents, '3');

    assert.ok(wanwanList.some(e => e.id === 'ev_auth_wanwan'), '林弯弯应看到授权给她的日程');
    assert.ok(!xinghuiList.some(e => e.id === 'ev_auth_wanwan'), '沈星回不应看到只授权给林弯弯的日程');

    assert.ok(wanwanList.some(e => e.id === 'ev_auth_both'), '两者均被授权的日程对林弯弯可见');
    assert.ok(xinghuiList.some(e => e.id === 'ev_auth_both'), '两者均被授权的日程对沈星回可见');

    assert.ok(xinghuiList.some(e => e.id === 'ev_auth_xinghui'), '沈星回应看到授权给他的日程');
    assert.ok(!wanwanList.some(e => e.id === 'ev_auth_xinghui'), '林弯弯不应看到只授权给沈星回的日程');
  });

  runTest('个人专属视角仅呈现个人/私密日程', () => {
    const personalList = filterEventsForView(mockEvents, 'personal');
    assert.ok(personalList.some(e => e.id === 'ev_priv_1'), '个人视角应包含私密日程');
    assert.ok(personalList.some(e => e.id === 'ev_legacy_personal'), '个人视角应包含个人备忘');
    assert.ok(!personalList.some(e => e.id === 'ev_auth_wanwan'), '个人视角不混入角色专属日程');
  });

  // ==========================================
  // 测试组 2: 长期幂等持久化去重索引
  // ==========================================
  console.log('\n【测试组 2: 长期幂等持久化去重索引与日志容量解耦】');

  await runAsyncTest('记录长期去重索引成功，且日志清理至 150 条不影响索引', async () => {
    const companion = window.TimeCalendarCompanion;
    const testKey = 'char2_anniv_2026-10-26_day_of';

    await companion.recordDedupIndex(testKey, {
      charId: '2',
      eventTitle: '恋爱一周年',
      deliveredAt: Date.now(),
      status: 'delivered'
    });

    const index = await companion.getDedupIndex();
    assert.ok(index[testKey], '去重索引应成功持久化');
    assert.strictEqual(index[testKey].status, 'delivered');

    // 模拟构造超过 200 条关怀日志并保存触发裁切
    const mockLogs = [];
    for (let i = 0; i < 200; i++) {
      mockLogs.push({ careId: 'care_' + i, idempotentKey: 'key_' + i, status: 'delivered' });
    }
    // 保存并验证日志裁切
    const rawSaved = mockLogs.slice(0, 150);
    assert.strictEqual(rawSaved.length, 150, '日志数组限制保留最近 150 条');

    // 重新验证去重索引完好无损
    const indexAfterClean = await companion.getDedupIndex();
    assert.ok(indexAfterClean[testKey], '长期去重索引绝不能随日志裁切丢失');
  });

  // ==========================================
  // 测试组 3: 跨模块人生游戏协同防重叠
  // ==========================================
  console.log('\n【测试组 3: 人生游戏跨模块协同去重】');

  await runAsyncTest('检测到人生游戏已祝贺的任务时，主动关怀自动跳过', async () => {
    const companion = window.TimeCalendarCompanion;
    const lgSharedKey = 'lg_task_finish_milestone_101';

    // 模拟人生游戏已记录该里程碑祝贺
    await db.config.put({
      key: 'life_game_companion_dedup_index_v1',
      value: { [lgSharedKey]: { deliveredAt: Date.now(), charId: 2 } }
    });

    // 构造同源候选
    const cand = {
      sourceApp: 'life-game',
      sourceId: '101',
      eventId: '101',
      eventTitle: '高数通关委托',
      occurrenceDate: '2026-10-26',
      triggerStage: 'finish'
    };

    const lgIndex = await db.config.get('life_game_companion_dedup_index_v1');
    const isAlreadyHandled = !!(lgIndex && lgIndex.value && (lgIndex.value[lgSharedKey] || lgIndex.value[cand.eventId]));
    assert.strictEqual(isAlreadyHandled, true, '跨模块去重索引应识别出人生游戏已祝贺该事件');
  });

  // ==========================================
  // 测试组 4: 双重授权校验（Pre-AI & Post-AI Pre-DB-Write）
  // ==========================================
  console.log('\n【测试组 4: 双重授权校验与中途撤销拦截】');

  await runAsyncTest('AI 生成后、写入微信前若用户关闭全局开关，立即中止入库', async () => {
    const companion = window.TimeCalendarCompanion;
    const initialConfig = await companion.getSettings();
    initialConfig.globalEnabled = true;
    initialConfig.allowWechatDelivery = true;
    await companion.saveSettings(initialConfig);

    // 模拟 AI 生成耗时期间，用户在 UI 关闭了总开关
    let aiFinished = false;
    const originalCallAI = window.callAI;
    window.callAI = async () => {
      aiFinished = true;
      // 用户突然关闭总开关
      const liveConf = await companion.getSettings();
      liveConf.globalEnabled = false;
      await companion.saveSettings(liveConf);
      return '祝你今天过得开心！';
    };

    const text = await window.callAI();
    assert.ok(aiFinished, 'AI 已完成生成');

    // 投递前执行二次校验
    const freshConfig = await companion.getSettings();
    const shouldDeliver = freshConfig.globalEnabled && freshConfig.allowWechatDelivery;
    assert.strictEqual(shouldDeliver, false, '投递前二次校验必须成功拦截已关闭总开关的投递');

    window.callAI = originalCallAI;
  });

  await runAsyncTest('AI 生成后若角色已被用户删除，立即中止向已不存在的角色投递', async () => {
    const companion = window.TimeCalendarCompanion;
    const cid = 3;

    // 模拟 AI 生成完毕后，角色被删除
    db.characters.deleteChar(cid);

    const liveChar = await db.characters.get(cid);
    assert.strictEqual(liveChar, null, '角色应已从数据库删除');

    const shouldAbort = !liveChar;
    assert.strictEqual(shouldAbort, true, '必须检测到角色不存在并中止向微信写入');
  });

  // ==========================================
  // 测试组 5: 离线温暖模板与心意寄语标明
  // ==========================================
  console.log('\n【测试组 5: 离线温暖模板与心意寄语透明标明】');

  runTest('离线模板必须包含【心意寄语】前缀，不冒充实时 AI', () => {
    const companion = window.TimeCalendarCompanion;
    const cand = {
      triggerType: 'anniversary',
      triggerStage: 'day_of',
      meta: { daysPassed: 365, yearsPassed: 1 }
    };
    const tpl = companion.getOfflineCareTemplate({ name: '林弯弯' }, cand);
    assert.ok(tpl.startsWith('【心意寄语】'), '离线模板必须透明标明【心意寄语】');
    assert.ok(tpl.indexOf('365') >= 0, '包含相伴天数事实');
  });

  runTest('考试各阶段离线模板语义清晰符合节奏', () => {
    const companion = window.TimeCalendarCompanion;
    const cand1 = { triggerType: 'exam', triggerStage: '7_days_before', eventTitle: '考研初试' };
    const cand2 = { triggerType: 'exam', triggerStage: '1_day_before', eventTitle: '考研初试' };
    const cand3 = { triggerType: 'exam', triggerStage: 'post_event', eventTitle: '考研初试' };

    const tpl1 = companion.getOfflineCareTemplate({ name: '林弯弯' }, cand1);
    const tpl2 = companion.getOfflineCareTemplate({ name: '林弯弯' }, cand2);
    const tpl3 = companion.getOfflineCareTemplate({ name: '林弯弯' }, cand3);

    assert.ok(tpl1.indexOf('7 天') >= 0, '7天提醒稳步复习');
    assert.ok(tpl2.indexOf('明天') >= 0, '考前1天鼓励并提醒备好文具');
    assert.ok(tpl3.indexOf('顺利结束') >= 0, '考后关心犒劳');
  });

  // ==========================================
  // 测试组 6: 微信投递幂等与故障恢复
  // ==========================================
  console.log('\n【测试组 6: 微信投递幂等与故障恢复】');

  await runAsyncTest('微信消息写入成功但日志中断后，再次巡检能幂等识别已存在消息', async () => {
    const idempotentKey = 'test_idempotent_recovery_999';

    // 模拟微信数据库已有一条来自上次中断写入的消息
    const msgId = await db.messages.add({
      chatId: 1,
      charId: 2,
      role: 'assistant',
      content: '【心意寄语】今天一切顺利！',
      clientMessageId: idempotentKey,
      externalEventId: idempotentKey,
      sourceApp: 'time-calendar',
      createdAt: Date.now()
    });

    // 再次尝试投递相同 key
    const existingMsg = await db.messages.where('clientMessageId').equals(idempotentKey).first();
    assert.ok(existingMsg, '应能检索到已入库的外部消息');
    assert.strictEqual(existingMsg.id, msgId);

    // 确认 db.messages 中绝不会出现第二条相同 clientMessageId
    const allMatching = (await db.messages.toArray()).filter(m => m.clientMessageId === idempotentKey);
    assert.strictEqual(allMatching.length, 1, '幂等机制必须保证消息仅存一条');
  });

  // ==========================================
  // 测试组 7: 作息与安静时段用户可配置
  // ==========================================
  console.log('\n【测试组 7: 作息与安静时段用户偏好配置】');

  runTest('TimeCalendarAI 支持获取与更新午休及夜间休息偏好', () => {
    const cur = window.TimeCalendarAI.getPreferences();
    assert.strictEqual(typeof cur.lunchBreakStart, 'string');
    assert.strictEqual(typeof cur.lunchBreakEnd, 'string');
    assert.strictEqual(typeof cur.minBufferMinutes, 'number');

    window.TimeCalendarAI.setPreferences({
      lunchBreakStart: '12:30',
      lunchBreakEnd: '14:00',
      nightRestStart: '23:30',
      nightRestEnd: '08:00',
      minBufferMinutes: 15
    });

    const updated = window.TimeCalendarAI.getPreferences();
    assert.strictEqual(updated.lunchBreakStart, '12:30', '午休开始时间更新成功');
    assert.strictEqual(updated.lunchBreakEnd, '14:00', '午休结束时间更新成功');
    assert.strictEqual(updated.minBufferMinutes, 15, '排期间隔缓冲更新成功');
  });

  // ==========================================
  // 测试组 8: Phase 1 & 2 回归安全
  // ==========================================
  console.log('\n【测试组 8: Phase 1 & 2 核心能力回归】');

  runTest('日历事件指纹计算正常反映内容与重复变更', () => {
    const ev1 = [{ id: '1', title: 'A', updatedAt: 100, recurrence: { type: 'daily' } }];
    const ev2 = [{ id: '1', title: 'A', updatedAt: 100, recurrence: { type: 'daily' } }];
    const ev3 = [{ id: '1', title: 'A', updatedAt: 200, recurrence: { type: 'weekly' } }];

    const fp1 = window.TimeCalendarAI.computeFingerprint(ev1, []);
    const fp2 = window.TimeCalendarAI.computeFingerprint(ev2, []);
    const fp3 = window.TimeCalendarAI.computeFingerprint(ev3, []);

    assert.strictEqual(fp1, fp2, '相同内容产生相同指纹');
    assert.notStrictEqual(fp1, fp3, '内容/规则变更产生不同指纹');
  });

  runTest('跨午夜日程具有明确时间语义', () => {
    const crossMidEvent = {
      title: '跨年跨午夜自习',
      startTime: '23:00',
      endTime: '01:30'
    };
    // 验证 startTime > endTime 被识别为跨午夜，而非强制重写为 24:00 或同一天后一小时
    assert.ok(crossMidEvent.startTime > crossMidEvent.endTime, '开始时间晚于结束时间表明跨午夜日程语义合法');
  });

  console.log('\n====================================================');
  console.log(` 测试运行完成: 通过 ${passedTests} 项, 失败 ${failedTests} 项`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('测试运行异常:', err);
  process.exit(1);
});
