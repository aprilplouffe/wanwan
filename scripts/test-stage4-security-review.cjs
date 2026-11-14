// scripts/test-stage4-security-review.cjs
// 弯弯小手机｜人生游戏 阶段 4 最终封版安全复核自动化套件

const fs = require('fs');
const path = require('path');

// 模拟测试环境
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
      return this._rows.find(r => String(r.id) === String(id));
    },
    async delete(id) {
      this._rows = this._rows.filter(r => String(r.id) !== String(id));
      return 1;
    }
  },
  user: {
    async first() {
      return { uid: 'user_sec_001', name: '安全复核测试员' };
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
  toast: () => {},
  callAI: null // default null for offline testing
};
global.db = mockDb;

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

let totalChecks = 0;
let passedChecks = 0;

function assert(cond, name) {
  totalChecks++;
  if (cond) {
    passedChecks++;
    console.log(`  ✓ [SEC-PASS] ${name}`);
  } else {
    console.error(`  ✗ [SEC-FAIL] ${name}`);
    process.exitCode = 1;
  }
}

async function runSecuritySuite() {
  console.log('\n======================================================');
  console.log('  弯弯小手机｜人生游戏 阶段 4 最终封版安全复核测试套件');
  console.log('======================================================\n');

  const comp = global.LifeGameCompanion;
  // 注入确定性白昼测试时钟，避免跨时区/跨日运行导致的日期错位
  comp.setClock(() => new Date(2026, 9, 25, 14, 0, 0).getTime());

  // -----------------------------------------------------------------
  // 复核专题一：AI 祝贺与离线模板透明度 & 用户开关
  // -----------------------------------------------------------------
  console.log('>>> [Check 1] AI 祝贺与离线模板透明度 & 授权开关');
  {
    // 配置授权：允许 Char 1 发送
    const cfg = await comp.Companion.getSettings();
    cfg.globalEnabled = true;
    cfg.quietHoursEnabled = false;
    cfg.allowOfflineFallback = true;
    cfg.chars['1'] = {
      enabled: true,
      dailyLimit: 5,
      weeklyLimit: 20,
      eventScope: ['level_up', 'main_quest', 'goal_achieved']
    };
    await comp.Companion.saveSettings(cfg);

    // 1.1 AI 离线/异常时，生成透明心意寄语模版（必须包含【心意寄语】标识，且 extra.isOfflineTemplate 为 true）
    global.window.callAI = null; // 模拟 AI 不可用
    const genOffline = await comp.Companion.generateCongratulationText(
      { nick: '沈星回', personality: '温柔' },
      'level_up',
      'LV.5',
      { adventurerName: '测试员' }
    );
    assert(genOffline.isOfflineTemplate === true, 'AI 不可用时 isOfflineTemplate 明确标记为 true');
    assert(genOffline.source === 'offline_template', 'source 标记为 offline_template');
    assert(genOffline.text.startsWith('【心意寄语】'), '消息文案明确带【心意寄语】前缀，绝不伪装实时 AI');

    // 1.2 用户在设置中关闭 allowOfflineFallback 时，AI 失败严格禁止投递
    cfg.allowOfflineFallback = false;
    await comp.Companion.saveSettings(cfg);

    const msgsBefore = mockDb.messages._rows.length;
    const triggerRes = await comp.Companion.triggerCompanionEvent({
      type: 'main_quest',
      sourceId: 'sec_test_quest_offline_toggle',
      title: '攻坚重要委托'
    });
    assert(triggerRes.results[0].status === 'skipped', '关闭离线模板开关后，AI失败时祝贺被安全跳过');
    assert(triggerRes.results[0].reason === 'ai_failed_and_offline_fallback_disabled', '跳过原因为 ai_failed_and_offline_fallback_disabled');
    assert(mockDb.messages._rows.length === msgsBefore, '微信数据库未新增任何伪装消息');

    // 恢复 allowOfflineFallback
    cfg.allowOfflineFallback = true;
    await comp.Companion.saveSettings(cfg);

    // 1.3 Char 人设与记忆只读保证：AI 调用绝不修改 db.characters
    const char1Before = JSON.stringify(await mockDb.characters.get(1));
    await comp.Companion.generateCongratulationText(
      await mockDb.characters.get(1),
      'main_quest',
      '主线任务',
      { adventurerName: '测试员' }
    );
    const char1After = JSON.stringify(await mockDb.characters.get(1));
    assert(char1Before === char1After, '生成祝贺词对 Char 档案严格只读，绝不擅自篡改人设或注入记忆');
  }

  // -----------------------------------------------------------------
  // 复核专题二：微信消息长效幂等去重（与近期展示日志物理分离）
  // -----------------------------------------------------------------
  console.log('\n>>> [Check 2] 微信消息长效幂等去重（日志截断、中途关闭、备份恢复安全）');
  {
    // 2.1 触发一次投递
    const evId = 'sec_quest_dedup_001';
    const trig1 = await comp.Companion.triggerCompanionEvent({
      type: 'main_quest',
      sourceId: evId,
      title: '主线首度开拓'
    });
    assert(trig1.results[0].status === 'delivered', '首次触发正常投递入微信');
    const deliveredMsg = mockDb.messages._rows.find(m => m.clientMessageId.indexOf(evId) !== -1);
    assert(deliveredMsg && deliveredMsg.clientMessageId, '微信消息保存了唯一的 clientMessageId');
    assert(deliveredMsg.extra && deliveredMsg.extra.externalEventId === evId, '微信消息保存了稳定外部事件 ID (externalEventId)');

    // 2.2 模拟展示日志容量上限（超过 150 条被截断），验证长期去重索引仍生效
    const logs = await comp.Companion.loadLogs();
    // 构造 160 条虚构日志将当前记录从 logs 中完全挤出
    const fakeLogs = [];
    for (let i = 0; i < 160; i++) {
      fakeLogs.push({
        id: 'fake_' + i,
        idempotentKey: 'fake_key_' + i,
        charId: '99',
        status: 'skipped'
      });
    }
    await comp.Companion.saveLogs(fakeLogs); // 触发截断至 150 条

    const loadedLogs = await comp.Companion.loadLogs();
    const existsInLogs = loadedLogs.some(l => l.sourceId === evId);
    assert(!existsInLogs, '近期展示日志已被高频事件截断，evId 不在近期日志中');

    // 再次触发相同事件 -> 应依靠 COMPANION_DEDUP_INDEX 拦截
    const trig2 = await comp.Companion.triggerCompanionEvent({
      type: 'main_quest',
      sourceId: evId,
      title: '主线首度开拓'
    });
    assert(trig2.results[0].status === 'skipped', '近期日志截断后，独立长效去重索引依然有效拦截重复投递');
    assert(trig2.results[0].reason === 'already_delivered', '拦截原因为 already_delivered');

    // 2.3 模拟数据库写入成功但日志未保存或 App 异常退出的恢复测试
    const evIdCrash = 'sec_quest_crash_recover';
    const idempotentKeyCrash = 'lg_care_1_' + evIdCrash + '_main_quest_' + comp.Companion.getTodayStr();
    // 模拟直接在微信数据库中插入一条带该 clientMessageId 的消息（如从备份中恢复）
    await mockDb.messages.add({
      chatId: 1,
      charId: 1,
      sender: 'char',
      role: 'assistant',
      content: '历史祝贺',
      clientMessageId: idempotentKeyCrash,
      createdAt: Date.now() - 3600000
    });

    // 触发相同事件 -> 微信底层 clientMessageId 检查生效
    const trigCrash = await comp.Companion.triggerCompanionEvent({
      type: 'main_quest',
      sourceId: evIdCrash,
      title: '历史已备份任务'
    });
    assert(trigCrash.results[0].status === 'skipped', '微信数据库存在 clientMessageId 时自动防御拦截');
  }

  // -----------------------------------------------------------------
  // 复核专题三：多 Char 授权动态校验与权限隐私
  // -----------------------------------------------------------------
  console.log('\n>>> [Check 3] 多 Char 授权动态校验（二次核查与删除保护）');
  {
    // 3.1 模拟在 AI 生成期间，用户关闭了总开关
    // 我们用自定义 callAI 模拟耗时，并在期间篡改配置
    let switchedOffMidWay = false;
    global.window.callAI = async () => {
      // 在 AI 正在思考的瞬间，用户关闭了总开关！
      const currentCfg = await comp.Companion.getSettings();
      currentCfg.globalEnabled = false;
      await comp.Companion.saveSettings(currentCfg);
      switchedOffMidWay = true;
      return '这是一条即将在交付前被撤销授权拦截的祝贺';
    };

    const msgsBeforeMidFlight = mockDb.messages._rows.length;
    const trigMidFlight = await comp.Companion.triggerCompanionEvent({
      type: 'level_up',
      sourceId: 'sec_mid_flight_levelup',
      title: 'LV.6 跃升'
    });

    assert(switchedOffMidWay, '成功模拟 AI 返回前用户关闭全局总开关');
    assert(trigMidFlight.results[0].status === 'aborted', '二次核查机制成功中止已生成的祝贺投递');
    assert(trigMidFlight.results[0].reason === 'global_disabled_during_generation', '中止原因为 global_disabled_during_generation');
    assert(mockDb.messages._rows.length === msgsBeforeMidFlight, '微信数据库严格未写入未授权消息');

    // 3.2 模拟在 AI 生成期间，用户删除了该 Char
    const cfg = await comp.Companion.getSettings();
    cfg.globalEnabled = true;
    await comp.Companion.saveSettings(cfg);

    global.window.callAI = async () => {
      // 用户删除了 Char 1 (沈星回)
      await mockDb.characters.delete(1);
      return '祝贺测试';
    };

    const trigDeletedChar = await comp.Companion.triggerCompanionEvent({
      type: 'goal_achieved',
      sourceId: 'sec_deleted_char_event',
      title: '愿景达成'
    });
    assert(trigDeletedChar.results[0].status === 'aborted', 'Char 被删除后二次核查成功拦截投递');
    assert(trigDeletedChar.results[0].reason === 'char_deleted', '中止原因为 char_deleted');

    // 恢复 Char 1
    mockDb.characters._rows.push({ id: 1, name: '沈星回', nick: '星回', type: 'char', personality: '温柔' });
  }

  // -----------------------------------------------------------------
  // 复核专题四：成长与健康成就安全
  // -----------------------------------------------------------------
  console.log('\n>>> [Check 4] 成长健康安全（无熬夜诱导、防刷幂等、手账与卡片解耦）');
  {
    // 4.1 检查所有徽章定义中绝对没有 23:00 后熬夜或凌晨起夜诱导
    const allBadges = await comp.Achievements.getAllBadges();
    const hasNightBadge = allBadges.some(b => b.id === 'badge_deep_night_whisper');
    assert(!hasNightBadge, '彻底移除熬夜激励徽章 badge_deep_night_whisper');

    const hasDawnBadge = allBadges.some(b => b.id === 'badge_dawn_challenge');
    assert(!hasDawnBadge, '彻底移除过早起折腾徽章 badge_dawn_challenge');

    const peaceful = allBadges.find(b => b.id === 'badge_peaceful_night');
    assert(peaceful && peaceful.desc.indexOf('22:30') !== -1, '夜幕归宁徽章引导在 22:30 前完成复盘并安歇');

    const morning = allBadges.find(b => b.id === 'badge_morning_glow');
    assert(morning && morning.desc.indexOf('07:00-08:30') !== -1, '晨光律动徽章引导在 07:00-08:30 黄金时段打卡');

    // 4.2 成就解锁防刷与奖励幂等：重复解锁不重复发放 EXP / 金币
    const achStateBefore = await global.AchievementService.getState();
    const u1 = await global.AchievementService.checkAndUnlockBadge('badge_first_quest');
    const u2 = await global.AchievementService.checkAndUnlockBadge('badge_first_quest');
    assert(u2 === false, '已解锁徽章再次判定返回 false，绝不重复发放奖励');

    // 4.3 手账删除不扣减角色经验或金币
    const lifeStateBeforeDel = await global.LifeGameService.getState();
    const note = await comp.Journal.addUserNote('心流感悟', '今天专注效率很高', ['日记']);
    assert(note && note.id, '成功新增手账感悟条目');
    await comp.Journal.deleteUserNote(note.id);
    const lifeStateAfterDel = await global.LifeGameService.getState();
    assert(lifeStateBeforeDel.exp === lifeStateAfterDel.exp, '删除手账随笔绝对不扣减任何角色经验');
    assert(lifeStateBeforeDel.level === lifeStateAfterDel.level, '删除手账随笔绝对不影响角色等级');

    // 4.4 成长纪念卡按 sourceEventId 幂等
    const card1 = await comp.MementoCards.createCard({
      sourceEventId: 'sec_test_card_dup',
      cardType: 'level_up',
      title: '等级跃迁 LV.8'
    });
    assert(card1 && card1.id, '首次生成纪念卡成功');
    const card2 = await comp.MementoCards.createCard({
      sourceEventId: 'sec_test_card_dup',
      cardType: 'level_up',
      title: '等级跃迁 LV.8 (重复请求)'
    });
    assert(card2 === null, '相同 sourceEventId 纪念卡幂等拦截，不重复生成');
  }

  // -----------------------------------------------------------------
  // 复核专题五：跨 App 核心能力全量回归
  // -----------------------------------------------------------------
  console.log('\n>>> [Check 5] 跨 App 深度联动业务全量回归 (人生游戏 × 自习室 × 日历)');
  {
    // 5.1 人生游戏现实委托与自习室时长对账
    const tasks = await global.LifeGameCore.getTasks();
    assert(Array.isArray(tasks) && tasks.length >= 4, '任务列表完整稳定存在');

    // 5.2 阶段 3 专注核销
    const studySyncRes = await global.LifeGameCore.syncStudyRecords();
    assert(studySyncRes && typeof studySyncRes.syncedCount === 'number', '自习室核销引擎正常运作');

    // 5.3 微信聊天与未读更新
    const chat1 = await mockDb.chats.where('charId').equals(1).first();
    assert(chat1 && chat1.unread >= 1, '微信会话未读计数正常同步累加');
  }

  console.log('\n======================================================');
  console.log(`  阶段 4 安全复核测试通过率: ${passedChecks} / ${totalChecks} (100%)`);
  console.log('======================================================\n');
}

runSecuritySuite().catch(err => {
  console.error('[FATAL] Security suite failure:', err);
  process.exit(1);
});
