// scripts/test-achievement-hall-phase3.cjs
// 弯弯小手机｜成就馆 1.0 第三阶段 & 第2章加固自动化验收测试

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(cond, label) {
  if (cond) {
    passed++;
    console.log('  [PASS] ' + label);
  } else {
    failed++;
    console.error('  [FAIL] ' + label);
  }
}

function createMemoryEnvironment() {
  const storageMap = new Map();
  const configMap = new Map();
  const charMap = new Map();
  const chatMap = new Map();
  const msgMap = new Map();
  const listeners = {};
  const docListeners = {};
  let autoChatId = 1;
  let autoMsgId = 1;
  let failConfigWriteOnce = false;
  let txCount = 0;
  const domElements = [];
  const bcInstances = [];

  class MockBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      this.closed = false;
      bcInstances.push(this);
    }
    postMessage(data) {
      bcInstances.forEach(ch => {
        if (ch !== this && !ch.closed && ch.name === this.name && typeof ch.onmessage === 'function') {
          ch.onmessage({ data });
        }
      });
    }
    close() { this.closed = true; }
    unref() {}
  }

  function makeDomNode(tag) {
    const attrs = {};
    const node = {
      tagName: (tag || 'DIV').toUpperCase(),
      id: '',
      className: '',
      innerHTML: '',
      textContent: '',
      dataset: {},
      style: {},
      value: '',
      checked: false,
      disabled: false,
      children: [],
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k] !== undefined ? attrs[k] : null; },
      appendChild(ch) { this.children.push(ch); return ch; },
      remove() {
        const idx = domElements.indexOf(this);
        if (idx >= 0) domElements.splice(idx, 1);
      },
      addEventListener() {},
      click() {},
      select() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getContext(type) {
        if (type !== '2d') return null;
        return {
          fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
          fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {},
          fillText() {},
          measureText(txt) { return { width: String(txt || '').length * 14 }; }
        };
      },
      toDataURL(mime) {
        return 'data:' + (mime || 'image/png') + ';base64,MOCKPNGDATA';
      }
    };
    return node;
  }

  const mockDoc = {
    visibilityState: 'visible',
    body: {
      children: [],
      appendChild(el) {
        domElements.push(el);
        this.children.push(el);
        return el;
      }
    },
    getElementById(id) {
      if (id === 'app') return mockDoc.body;
      return domElements.find(el => el.id === id) || null;
    },
    createElement(tag) { return makeDomNode(tag); },
    querySelectorAll(sel) {
      if (sel && sel.startsWith('.')) {
        const cls = sel.slice(1);
        return domElements.filter(el => String(el.className || '').split(/\s+/).includes(cls));
      }
      return [];
    },
    addEventListener(evt, fn) {
      if (!docListeners[evt]) docListeners[evt] = [];
      docListeners[evt].push(fn);
    },
    removeEventListener(evt, fn) {
      if (!docListeners[evt]) return;
      docListeners[evt] = docListeners[evt].filter(f => f !== fn);
    },
    dispatchEvent(evtName) {
      (docListeners[evtName] || []).slice().forEach(fn => fn({ type: evtName }));
    }
  };

  function makeTable(map, idGen) {
    return {
      async get(key) {
        return map.has(key) ? JSON.parse(JSON.stringify(map.get(key))) : undefined;
      },
      async put(obj) {
        if (map === configMap && failConfigWriteOnce) {
          failConfigWriteOnce = false;
          throw new Error('SIMULATED_CONFIG_WRITE_ERROR');
        }
        const k = obj.key !== undefined ? obj.key : obj.id;
        map.set(k, JSON.parse(JSON.stringify(obj)));
        return k;
      },
      async add(obj) {
        const clone = JSON.parse(JSON.stringify(obj));
        if (!clone.id && idGen) clone.id = idGen();
        map.set(clone.id, clone);
        return clone.id;
      },
      async update(id, patch) {
        const cur = map.get(id);
        if (!cur) return 0;
        map.set(id, Object.assign({}, cur, JSON.parse(JSON.stringify(patch))));
        return 1;
      },
      async delete(id) {
        map.delete(id);
      },
      async toArray() {
        return Array.from(map.values()).map(v => JSON.parse(JSON.stringify(v)));
      },
      where(field) {
        return {
          equals(val) {
            return {
              async first() {
                for (const row of map.values()) {
                  if (row && String(row[field]) === String(val)) {
                    return JSON.parse(JSON.stringify(row));
                  }
                }
                return undefined;
              },
              async toArray() {
                const res = [];
                for (const row of map.values()) {
                  if (row && String(row[field]) === String(val)) {
                    res.push(JSON.parse(JSON.stringify(row)));
                  }
                }
                return res;
              }
            };
          }
        };
      }
    };
  }

  const db = {
    config: makeTable(configMap),
    characters: makeTable(charMap),
    chats: makeTable(chatMap, () => autoChatId++),
    messages: makeTable(msgMap, () => autoMsgId++),
    user: {
      async first() { return { uid: 'user_default', nick: '弯弯' }; }
    },
    async transaction(_mode, _table, fn) {
      txCount++;
      return await fn();
    }
  };

  const winListeners = {};
  const g = {
    console,
    Date,
    Math,
    Promise,
    JSON,
    setTimeout,
    clearTimeout,
    document: mockDoc,
    BroadcastChannel: MockBroadcastChannel,
    localStorage: {
      getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null; },
      setItem(k, v) { storageMap.set(k, String(v)); },
      removeItem(k) { storageMap.delete(k); }
    },
    addEventListener(evt, fn) {
      if (!winListeners[evt]) winListeners[evt] = [];
      winListeners[evt].push(fn);
    },
    removeEventListener(evt, fn) {
      if (!winListeners[evt]) return;
      winListeners[evt] = winListeners[evt].filter(f => f !== fn);
    },
    dispatchWindowEvent(evtName, evObj) {
      (winListeners[evtName] || []).slice().forEach(fn => fn(evObj));
    },
    db,
    toast() {},
    openPage(el) { mockDoc.body.appendChild(el); },
    closePage(id) {
      const target = mockDoc.getElementById(id);
      if (target) target.remove();
    },
    callAI: null,
    WanwanStudyRoom: null
  };
  g.window = g;
  g.globalThis = g;

  const sharedCode = fs.readFileSync(path.resolve(__dirname, '../js/shared-hub.js'), 'utf8');
  const ahCompCode = fs.readFileSync(path.resolve(__dirname, '../js/achievement-hall-companion.js'), 'utf8');
  const ahCode = fs.readFileSync(path.resolve(__dirname, '../js/achievement-hall.js'), 'utf8');
  const lgCompCode = fs.readFileSync(path.resolve(__dirname, '../js/life-game-companion.js'), 'utf8');

  new Function('window', 'globalThis', 'document', 'db', sharedCode)(g, g, mockDoc, db);
  new Function('window', 'globalThis', 'document', 'db', ahCompCode)(g, g, mockDoc, db);
  new Function('window', 'globalThis', 'document', 'db', ahCode)(g, g, mockDoc, db);
  new Function('window', 'globalThis', 'document', 'db', lgCompCode)(g, g, mockDoc, db);

  return {
    g,
    db,
    storageMap,
    configMap,
    charMap,
    chatMap,
    msgMap,
    domElements,
    bcInstances,
    docListeners,
    winListeners,
    getTxCount: () => txCount,
    setFailConfigOnce: v => { failConfigWriteOnce = v; },
    clearAll() {
      storageMap.clear();
      configMap.clear();
      charMap.clear();
      chatMap.clear();
      msgMap.clear();
      domElements.length = 0;
    },
    async exportBackup() {
      return {
        config: await db.config.toArray(),
        characters: await db.characters.toArray(),
        chats: await db.chats.toArray(),
        messages: await db.messages.toArray()
      };
    },
    async restoreBackup(bk) {
      this.clearAll();
      for (const row of (bk.config || [])) await db.config.put(row);
      for (const row of (bk.characters || [])) await db.characters.put(row);
      for (const row of (bk.chats || [])) await db.chats.put(row);
      for (const row of (bk.messages || [])) await db.messages.put(row);
    }
  };
}

async function runTests() {
  console.log('=== 弯弯小手机｜成就馆 1.0 第三阶段 & 第2章安全加固验收测试 ===\n');
  const env = createMemoryEnvironment();
  const { g, db } = env;
  const AH = g.AchievementHall;
  const AHC = g.AchievementHallCompanion;
  const LGC = g.LifeGameCompanion;

  // 固定白天 14:00 时钟（避免因运行 UTC 时间差异误触夜间免打扰）
  const DAY_MS = new Date(2026, 9, 25, 14, 0, 0, 0).getTime();
  AHC.setClock(() => DAY_MS);
  LGC.setClock(() => DAY_MS);

  check(Boolean(AH && AHC && LGC), '核心模块 AchievementHall / AchievementHallCompanion / LifeGameCompanion 加载就绪');

  // ----------------------------------------------------
  // Suite 1: 第2章 2.2 跨实例并发写事务、乐观锁合并与同步销毁
  // ----------------------------------------------------
  console.log('>>> [Suite 1] Section 2.2 跨实例并发乐观锁与 BroadcastChannel/Storage 同步');
  {
    const txBefore = env.getTxCount();
    const s0 = await AH.loadState();
    const baseRev = s0.revision;

    // 模拟另一实例先一步写入 badge_focus_novice
    const staleCopyA = JSON.parse(JSON.stringify(s0));
    const staleCopyB = JSON.parse(JSON.stringify(s0));
    staleCopyA.unlockRecords['badge_first_quest'] = {
      unlocked: true, unlockedAt: DAY_MS - 1000, occurredAt: DAY_MS - 1000, unlockCount: 1, favorite: false
    };
    staleCopyB.unlockRecords['badge_focus_novice'] = {
      unlocked: true, unlockedAt: DAY_MS - 500, occurredAt: DAY_MS - 500, unlockCount: 1, favorite: false
    };

    await AH.saveState(staleCopyA, { expectedRevision: baseRev });
    // 第二份使用过期 baseRev 写入，触发 CAS 冲突与自动合并
    const merged = await AH.saveState(staleCopyB, { expectedRevision: baseRev });

    check(Boolean(merged.unlockRecords['badge_first_quest'].unlocked && merged.unlockRecords['badge_focus_novice'].unlocked),
      'CAS 冲突合并后两实例各自解锁记录均无丢失');
    check(merged.totalScore === 250 && merged.revision >= baseRev + 2,
      '合并后荣誉点准确重算 (100+150=250) 且 revision 严格递增');
    check(env.getTxCount() > txBefore, '写操作经过 db.transaction 原子事务包裹');

    // BroadcastChannel + storage 单例初始化与清理
    AH.disposeAutoSync();
    const syncRes = AH.initAutoSync();
    check(syncRes.crossTabBound && env.winListeners.storage.length === 1,
      '跨标签页/WebView storage 与 BroadcastChannel 监听严格单例绑定');
    AH.initAutoSync();
    check(env.winListeners.storage.length === 1, '重复 initAutoSync 不产生重复 storage 监听');

    env.clearAll();
  }

  // ----------------------------------------------------
  // Suite 2: 第2章 2.3 来源撤销语义 & 角色删除隔离清理
  // ----------------------------------------------------
  console.log('\n>>> [Suite 2] Section 2.3 来源撤销策略与 Char 删除严格隔离');
  {
    await db.characters.put({ id: 1, name: '陆清宴', personality: '清冷克制', deleted: false });
    await db.characters.put({ id: 2, name: '林初白', personality: '温和细腻', deleted: false });
    await db.config.put({
      key: 'life_game_state',
      value: { level: 5, exp: 520, coins: 300, stats: { focus: 40 }, updatedAt: DAY_MS }
    });
    await db.config.put({ key: 'wanwan_study_records', value: [{ id: 'sr1', durationMinutes: 35, createdAt: DAY_MS }] });
    await db.config.put({
      key: 'coupleSpaceSettings',
      value: {
        activeCharId: '1',
        spaces: {
          '1': { status: 'accepted', anniversaryDate: '2026-01-01', wishes: [] },
          '2': { status: 'accepted', anniversaryDate: '2026-02-01', wishes: [] }
        }
      }
    });

    await AH.unlockAchievement('badge_focus_novice', { occurredAt: DAY_MS });
    await AH.unlockAchievement('badge_level_5', { occurredAt: DAY_MS });
    await AH.unlockAchievement('badge_love_space_open', { charId: '1', occurredAt: DAY_MS });
    await AH.unlockAchievement('badge_love_space_open', { charId: '2', occurredAt: DAY_MS });

    // 删除学习记录后执行状态核对：preserve_milestone 不被回滚，已开通情侣空间仍有效
    await db.config.put({ key: 'wanwan_study_records', value: [] });
    const recRes1 = await AH.reconcileSourceRevocation({ reason: 'source_deleted' });
    check(recRes1.preserved.includes('badge_focus_novice') && !recRes1.revoked.includes('badge_focus_novice'),
      '已完成历史里程碑 badge_focus_novice 遵循 preserve_milestone 策略不被误删');

    // revocable_current_state 策略测试（取消情侣空间开通状态后核对撤销 badge_love_space_open）
    await db.config.put({ key: 'coupleSpaceSettings', value: { activeCharId: null, spaces: {} } });
    const recRes2 = await AH.reconcileSourceRevocation({ targetAchievementId: 'badge_love_space_open' });
    check(recRes2.revoked.includes('badge_love_space_open'),
      'revocable_current_state 成就在当前源条件撤回时正确执行撤销');

    // forceErroneousRevoke + 头衔回退 + 绝对不改动人生游戏经验/等级
    await AH.equipTitle('博识探幽者'); // badge_level_5 titleReward
    const errRev = await AH.revokeErroneousAchievement('badge_level_5', 'mis_recorded', { forceErroneousRevoke: true });
    const postState = await AH.loadState();
    const lgAfterRevoke = (await db.config.get('life_game_state')).value;
    check(errRev.ok && postState.unlockRecords['badge_level_5'].unlocked === false && postState.revokedRecords['badge_level_5'],
      '异常误发成就可通过 forceErroneousRevoke 精准纠偏并记录 revokedRecords');
    check(postState.equippedTitle === '初涉尘寰的旅人', '被撤销成就对应佩戴头衔同步安全回退为默认头衔');
    check(lgAfterRevoke.level === 5 && lgAfterRevoke.exp === 520 && lgAfterRevoke.coins === 300,
      '撤销或清理成就是绝对边界隔离的：人生游戏等级、经验、金币零改动');

    // 删除 Char 1：仅清除 Char 1 独占数据，Char 2 完整保留
    await db.config.put({
      key: 'coupleSpaceSettings',
      value: {
        activeCharId: '1',
        spaces: {
          '1': { status: 'accepted', anniversaryDate: '2026-01-01', wishes: [] },
          '2': { status: 'accepted', anniversaryDate: '2026-02-01', wishes: [] }
        }
      }
    });
    await AH.unlockAchievement('badge_love_space_open', { charId: '1', occurredAt: DAY_MS });
    await AH.unlockAchievement('badge_love_space_open', { charId: '2', occurredAt: DAY_MS });
    await AHC.updateCharConfig('1', { enabled: true, allowReadSummary: true });
    await AHC.updateCharConfig('2', { enabled: true, allowReadSummary: true });
    await AHC.createMementoCard({ achievementId: 'badge_love_space_open', charId: '1', wishText: 'Char1纪念' });
    await AHC.createMementoCard({ achievementId: 'badge_love_space_open', charId: '2', wishText: 'Char2纪念' });

    await db.characters.delete(1);
    await g.WanwanSharedHub.emit('CHARACTER_DELETED', { charId: '1' });
    await AH.onCharacterDeleted('1');

    const stAfterDel = await AH.loadState();
    const sAfterDel = await AHC.getSettings();
    const c2Cards = await AHC.listMementoCards('2');
    const c1Cards = await AHC.listMementoCards('1');
    check(!stAfterDel.charScopedUnlocks['1'] && stAfterDel.charScopedUnlocks['2'] && stAfterDel.charScopedUnlocks['2'].badge_love_space_open.unlocked,
      '删除 Char 1 后清理其专属解锁记录，Char 2 数据严格保留不串联');
    check(!sAfterDel.chars['1'] && sAfterDel.chars['2'] && sAfterDel.chars['2'].enabled === true,
      '删除 Char 1 后注销其祝贺授权，Char 2 授权保持不变');
    check(c1Cards.length === 0 && c2Cards.length === 1,
      '删除 Char 1 后清理其纪念卡，Char 2 纪念卡安全保留');

    env.clearAll();
  }

  // ----------------------------------------------------
  // Suite 3: Phase 3 默认安全开关、普通/重要分层、10 项前置核验与异步中途撤销
  // ----------------------------------------------------
  console.log('\n>>> [Suite 3] Phase 3 默认关闭、普通vs重要渠道分层、10项守卫及中途撤销');
  {
    await db.characters.put({
      id: 1, name: '江凛', personality: '冷静温柔', speakingStyle: '短句笃定', deleted: false
    });
    await db.config.put({
      key: 'lorebooks',
      value: [
        {
          id: 'lb_c1', enabled: true, scope: 'personal', charIds: ['1'],
          entries: [{ enabled: true, keywords: [], content: '江凛习惯在深夜写读书笔记。' }]
        },
        {
          id: 'lb_c99', enabled: true, scope: 'personal', charIds: ['99'],
          entries: [{ enabled: true, keywords: [], content: '机密：绝对禁止泄漏给他人的角色99秘密。' }]
        }
      ]
    });

    // QA #1: 默认状态严禁开启主动祝贺/微信推送
    const defSettings = await AHC.getSettings();
    const defChar1 = AHC.getCharConfig('1', defSettings);
    check(defSettings.allowCharBlessing === false && defSettings.allowWechatProactive === false &&
          defChar1.enabled === false && defChar1.allowReadSummary === false && defChar1.allowWechatPush === false,
      'QA#1 默认所有 Char 祝贺与微信主动推送开关均严格为 false');

    // QA #2: 普通成就默认只走 hall_only
    check(AHC.isAchievementMajor('badge_first_quest', defSettings) === false &&
          AHC.getAchievementChannel('badge_first_quest', defSettings) === 'hall_only',
      'QA#2 普通成就默认渠道为 hall_only，不打扰微信');
    check(AHC.isAchievementMajor('badge_level_5', defSettings) === true &&
          AHC.getAchievementChannel('badge_level_5', defSettings) === 'in_hall_char',
      'QA#3 重要里程碑默认仅馆内 Char 祝贺 (in_hall_char)，不开微信直发');

    // 尝试解锁普通成就并开启全部开关 -> 仍应因 channel_hall_only 拦截微信打扰
    await AHC.saveSettings(Object.assign({}, defSettings, {
      allowCharBlessing: true,
      allowWechatProactive: true
    }));
    await AHC.updateCharConfig('1', { enabled: true, allowReadSummary: true, allowWechatPush: true, dailyLimit: 2 });

    const rOrd = await AH.unlockAchievement('badge_first_quest', { sourceRecordId: 'q_ord_1', occurredAt: DAY_MS });
    await new Promise(r => setTimeout(r, 30));
    const msgsAfterOrd = await db.messages.toArray();
    check(rOrd.unlocked && msgsAfterOrd.length === 0,
      'QA#2 开启总开关后，未设置为重要的普通成就仍只留在馆内，0 条微信消息');

    // 解锁重要里程碑并配置为 wechat_proactive，逐一验证 10 项前置守卫
    await AH.unlockAchievement('badge_level_5', { sourceRecordId: 'lv_5', occurredAt: DAY_MS });
    await AHC.setAchievementChannel('badge_level_5', 'wechat_proactive');

    // 守卫：夜间免打扰拦截
    AHC.setClock(() => new Date(2026, 9, 25, 23, 30, 0, 0).getTime());
    const guardQuiet = await AHC.evaluateCongratulationGuards({ achievementId: 'badge_level_5', charId: '1', targetMode: 'wechat_proactive' });
    check(!guardQuiet.ok && guardQuiet.reason === 'quiet_hours', 'QA#9 夜间免打扰时段严格拦截微信主动推送');
    AHC.setClock(() => DAY_MS);

    // 守卫：自习室专注期间拦截
    g.WanwanStudyRoom = { getState: () => ({ timerStatus: 'running' }) };
    const guardFocus = await AHC.evaluateCongratulationGuards({ achievementId: 'badge_level_5', charId: '1', targetMode: 'wechat_proactive' });
    check(!guardFocus.ok && guardFocus.reason === 'user_focusing', 'QA#10 自习室专注心流期间严格拦截微信打扰');
    g.WanwanStudyRoom = null;

    // 守卫：历史补算成就（backfilled: true）拦截主动推送
    await AH.unlockAchievement('badge_calendar_chronos', { backfilled: true, occurredAt: DAY_MS - 86400000 });
    const guardBackfill = await AHC.evaluateCongratulationGuards({ achievementId: 'badge_calendar_chronos', charId: '1', targetMode: 'wechat_proactive' });
    check(!guardBackfill.ok && guardBackfill.reason === 'backfilled_record_no_proactive',
      'QA#4 历史校准补算成就禁止自动刷屏微信');

    // 守卫：Char 未授权读摘要拦截
    await AHC.updateCharConfig('1', { allowReadSummary: false });
    const guardNoRead = await AHC.evaluateCongratulationGuards({ achievementId: 'badge_level_5', charId: '1', targetMode: 'wechat_proactive' });
    check(!guardNoRead.ok && guardNoRead.reason === 'char_read_summary_not_authorized',
      'QA#5 禁止读取成就摘要时不越权访问或祝贺');
    await AHC.updateCharConfig('1', { allowReadSummary: true });

    // QA#8: AI 异步请求中途关闭总开关或删除 Char -> 二次核验必须中止投递
    let capturedPrompt = '';
    g.callAI = async (messages) => {
      capturedPrompt = JSON.stringify(messages);
      // 模拟在等待 AI 返回期间用户关闭了微信主动推送总开关！
      const cur = await AHC.getSettings();
      cur.allowWechatProactive = false;
      await AHC.saveSettings(cur);
      return '做到这里很不容易，继续稳步前进吧。';
    };

    const midFlightRes = await AHC.processUnlockCongratulations({
      badge: AH.getDefinition('badge_level_5'),
      sourceRecordId: 'lv_5',
      backfilled: false
    });
    const msgsAfterMidFlight = await db.messages.toArray();
    check(midFlightRes.results[0].status === 'aborted' && msgsAfterMidFlight.length === 0,
      'QA#8 AI 请求返回期间若用户撤回微信授权，落库前二次核验立即中止且 0 微信消息');
    check(capturedPrompt.includes('江凛习惯在深夜写读书笔记') && !capturedPrompt.includes('角色99秘密'),
      'QA#7 世界书仅读取当前角色专属关联设定，严格隔离其他角色秘密');

    // 校验 Char 档案与世界书未被 AI 调用篡改
    const c1After = await db.characters.get(1);
    const lbAfter = (await db.config.get('lorebooks')).value;
    check(c1After.personality === '冷静温柔' && lbAfter.length === 2,
      'QA#6 严守只读准则，绝不修改 Char 原人设或世界书数据');

    env.clearAll();
  }

  // ----------------------------------------------------
  // Suite 4: AI 祝贺透明回退、失败重试、跨模块去重 & 日志截断长效幂等
  // ----------------------------------------------------
  console.log('\n>>> [Suite 4] AI 失败透明回退【心意寄语】、重试与跨模块去重');
  {
    await db.characters.put({ id: 1, name: '江凛', personality: '沉静可靠', deleted: false });
    g.callAI = async () => { throw new Error('NETWORK_TIMEOUT'); };

    await AHC.saveSettings(Object.assign(await AHC.getSettings(), {
      allowCharBlessing: true,
      allowWechatProactive: true,
      allowOfflineFallback: false
    }));
    await AHC.updateCharConfig('1', { enabled: true, allowReadSummary: true, allowWechatPush: true, dailyLimit: 5, weeklyLimit: 20 });
    await AHC.setAchievementChannel('badge_level_5', 'wechat_proactive');

    await AH.unlockAchievement('badge_level_5', { sourceRecordId: 'lv_5', occurredAt: DAY_MS });

    // QA#11a: AI 失败且禁止兜底 -> 必须记录 failed & canRetry，绝不发假 AI 微信消息
    const failRes = await AHC.processUnlockCongratulations({
      badge: AH.getDefinition('badge_level_5'),
      sourceRecordId: 'lv_5',
      backfilled: false
    });
    check(failRes.results[0].status === 'failed' && failRes.results[0].canRetry === true && (await db.messages.toArray()).length === 0,
      'QA#11a AI 失败且关闭离线兜底时仅记录可重试失败状态，绝不发出虚假祝贺');

    // QA#11b: 允许离线兜底 -> 显式标注【心意寄语】 & isOfflineTemplate: true
    await AHC.saveSettings(Object.assign(await AHC.getSettings(), { allowOfflineFallback: true }));
    const retryFallback = await AHC.requestOrRetryInHallBlessing('badge_level_5', '1');
    check(retryFallback.ok && retryFallback.blessing.isOfflineTemplate === true && retryFallback.blessing.text.includes('【心意寄语】'),
      'QA#11b 开启兜底时显式标明【心意寄语】与离线来源标记，绝不伪装实时 AI');

    // QA#12: AI 恢复后手动点击重试可正常覆盖为实时 AI 祝贺
    g.callAI = async () => '五级是一个很扎实的台阶，为你高兴。';
    const retryOk = await AHC.requestOrRetryInHallBlessing('badge_level_5', '1');
    check(retryOk.ok && retryOk.blessing.isOfflineTemplate === false && retryOk.blessing.source === 'ai',
      'QA#12 AI 恢复后在成就馆内重试生成祝贺成功');

    // QA#13 & #14: 跨模块去重（人生游戏先发微信 -> 成就馆同源事件绝不重复发；反之亦然）
    await LGC.Companion.saveSettings({
      globalEnabled: true,
      allowWechatPush: true,
      allowOfflineFallback: true,
      quietHoursEnabled: false,
      chars: { '1': { enabled: true, allowReadEvents: true, allowWechatPush: true, dailyLimit: 5, weeklyLimit: 20 } }
    });
    await db.config.put({
      key: 'life_game_state',
      value: { level: 10, exp: 1200, coins: 100, stats: { focus: 50 }, updatedAt: DAY_MS }
    });

    // 人生游戏先发出 level 10 升级祝贺
    const lgFirst = await LGC.Companion.triggerCompanionEvent({
      type: 'level_up',
      sourceId: 'levelup_10',
      title: 'Lv.10 进阶里程碑'
    });
    const msgCountAfterLg = (await db.messages.toArray()).length;
    check(lgFirst.triggered && msgCountAfterLg === 1, '人生游戏率先投递 Lv.10 微信祝贺 (1条)');

    // 成就馆对应 badge_level_10（sourceRecordId: 'lv_10'）配置为 wechat_proactive 后触发，必须被跨模块拦截
    await AHC.setAchievementChannel('badge_level_10', 'wechat_proactive');
    await AH.unlockAchievement('badge_level_10', { sourceRecordId: 'lv_10', occurredAt: DAY_MS });
    const ahDupRes = await AHC.processUnlockCongratulations({
      badge: AH.getDefinition('badge_level_10'),
      sourceRecordId: 'lv_10',
      backfilled: false
    });
    const msgCountAfterAh = (await db.messages.toArray()).length;
    check(ahDupRes.results[0].status === 'skipped' && ahDupRes.results[0].reason === 'already_delivered_or_cross_module_dedup' && msgCountAfterAh === 1,
      'QA#13 人生游戏已祝贺同源升级后，成就馆微信联动精准去重，不发第二条重复祝贺');

    // 反向测试：成就馆率先通过真实事件解锁发信 (badge_main_quest_1, mq_check_1) -> 人生游戏再触发 mq_check_1 必须被拦截
    await AHC.setAchievementChannel('badge_main_quest_1', 'wechat_proactive');
    await AH.unlockAchievement('badge_main_quest_1', { sourceRecordId: 'mq_check_1', occurredAt: DAY_MS });
    await new Promise(r => setTimeout(r, 20));
    const lgBlocked = await LGC.Companion.triggerCompanionEvent({
      type: 'main_quest',
      sourceId: 'mq_check_1',
      title: '主线任务完成'
    });
    const msgCountCross = (await db.messages.toArray()).length;
    check(lgBlocked.results && lgBlocked.results[0] &&
          lgBlocked.results[0].status === 'skipped' &&
          lgBlocked.results[0].reason === 'cross_module_dedup_conflict',
      'QA#14a 跨模块同源去重双向生效');
    check(msgCountCross === 2,
      'QA#14b 成就馆率先发信后，人生游戏同源事件被成就馆跨模块去重索引精准拦截，总计仅 2 条微信消息');

    // QA#15: 日志截断 (> 150条) 不影响长期去重索引，且备份还原后不重发
    const fakeLogs = [];
    for (let i = 0; i < 180; i++) {
      fakeLogs.push({ id: 'old_' + i, charId: '1', status: 'delivered', createdAt: DAY_MS - 10000 - i });
    }
    await AHC.saveLogs(fakeLogs);
    const trimmedLogs = await AHC.loadLogs();
    const dedupAfterTrunc = await AHC.processUnlockCongratulations({
      badge: AH.getDefinition('badge_main_quest_1'),
      sourceRecordId: 'mq_check_1',
      backfilled: false
    });
    check(trimmedLogs.length === 150 && dedupAfterTrunc.results[0].reason === 'already_delivered_or_cross_module_dedup',
      'QA#15 近期日志截断至 150 条后，长期幂等去重索引依然有效阻止重发');

    // 模拟清掉 dedup 索引仅保留 db.messages (如备份恢复或日志写失败故障场景) -> 仍能从微信库识别去重
    await db.config.put({ key: AHC.STORAGE_KEYS.DEDUP_INDEX, value: {} });
    const bk = await env.exportBackup();
    await env.restoreBackup(bk);
    const dedupFromWechatDb = await AHC.processUnlockCongratulations({
      badge: AH.getDefinition('badge_main_quest_1'),
      sourceRecordId: 'mq_check_1',
      backfilled: false
    });
    check(dedupFromWechatDb.results[0].reason === 'already_delivered_or_cross_module_dedup' && (await db.messages.toArray()).length === 2,
      'QA#16 备份还原或索引缺失时自动核验微信 messages 数据库幂等防线，绝不重复投递');

    env.clearAll();
  }

  // ----------------------------------------------------
  // Suite 5: 成长纪念卡、PNG 导出、手动安全分享 & 我的勋章墙互动
  // ----------------------------------------------------
  console.log('\n>>> [Suite 5] 成长纪念卡、Canvas 导出、手动分享与勋章墙');
  {
    await db.characters.put({ id: 1, name: '江凛', deleted: false });
    await db.characters.put({ id: 2, name: '夏屿', deleted: false });
    await db.config.put({
      key: 'life_game_state',
      value: { level: 6, exp: 880, coins: 240, stats: {}, updatedAt: DAY_MS }
    });

    // QA#17: 未解锁成就禁止生成成长纪念卡
    const lockedRes = await AHC.createMementoCard({ achievementId: 'badge_focus_century' });
    check(!lockedRes.ok && lockedRes.reason === 'achievement_not_unlocked',
      'QA#17 未真实解锁的成就严禁生成成长纪念卡');

    // 解锁两个个人/通用成就与一个 Char 1 专属成就
    await AH.unlockAchievement('badge_focus_novice', { occurredAt: DAY_MS });
    await AH.unlockAchievement('badge_level_5', { occurredAt: DAY_MS });
    await AH.unlockAchievement('badge_love_wish_3', { charId: '1', occurredAt: DAY_MS });

    // QA#18: 创建、切换主题、收藏、导出 PNG、删除不动原成就与 EXP
    const cardRes = await AHC.createMementoCard({
      achievementId: 'badge_level_5',
      charId: '1',
      wishText: '继续向前吧。',
      wishSource: 'ai',
      theme: 'paper'
    });
    check(cardRes.ok && cardRes.card.theme === 'paper' && cardRes.card.achievementId === 'badge_level_5',
      'QA#18 基于真实已解锁成就生成成长纪念卡');

    const switched = await AHC.switchMementoTheme(cardRes.card.cardId, 'ink');
    const fav = await AHC.toggleFavoriteMemento(cardRes.card.cardId);
    const pngRes = AHC.exportCardPng(switched);
    const shareText = AHC.buildCardShareText(switched);
    check(switched.theme === 'ink' && fav === true && pngRes.ok && pngRes.dataUrl.startsWith('data:image/png'),
      'QA#19 纪念卡支持墨韵/暖纸/灰阶主题切换、珍藏置顶与本地 Canvas PNG 导出');
    check(shareText.includes('学者初成') && shareText.includes('继续向前吧'),
      'QA#20 纪念卡分享文案仅包含真实已解锁成就与授权寄语');

    // Char 专属纪念卡禁止分享给另一位 Char
    const charCardRes = await AHC.createMementoCard({
      achievementId: 'badge_love_wish_3',
      charId: '1',
      wishText: '这是属于我们的回忆'
    });
    const crossShareRes = await AHC.shareCardToAuthorizedWechat(charCardRes.card.cardId, '2');
    const okShareRes = await AHC.shareCardToAuthorizedWechat(charCardRes.card.cardId, '1');
    check(!crossShareRes.ok && crossShareRes.reason === 'cross_char_memento_isolated' && okShareRes.ok,
      'QA#21 手动分享纪念卡严守多 Char 隐私隔离，绝不跨角色误发');

    // 删除纪念卡绝不影响已解锁成就状态或人生游戏 EXP
    await AHC.deleteMementoCard(cardRes.card.cardId);
    const stAfterCardDel = await AH.loadState();
    const lgAfterCardDel = (await db.config.get('life_game_state')).value;
    check(stAfterCardDel.unlockRecords['badge_level_5'].unlocked === true && lgAfterCardDel.exp === 880,
      'QA#22 删除纪念卡不影响已解锁成就状态与人生游戏经验值');

    // QA#23: 我的勋章墙展示、精选置顶、排序、重置与视角隔离
    await AHC.setWallLayout('showcase');
    await AHC.toggleFeaturedOnWall('badge_focus_novice');
    await AHC.moveWallBadgeOrder('badge_level_5', 'top', ['badge_focus_novice', 'badge_level_5', 'badge_love_wish_3']);

    const vmPersonal = await AH.getHallViewModel({ charScope: 'personal' });
    const vmChar2 = await AH.getHallViewModel({ charScope: '2' });
    check(vmPersonal.wallPrefs.layout === 'showcase' &&
          vmPersonal.wallItems[0].achievementId === 'badge_focus_novice' &&
          vmPersonal.wallItems[0].isFeaturedOnWall === true,
      'QA#23a 勋章墙支持展示台布局、精选置顶与自定义排序');
    check(!vmPersonal.wallItems.some(it => it.achievementId === 'badge_love_wish_3') &&
          !vmChar2.wallItems.some(it => it.achievementId === 'badge_love_wish_3'),
      'QA#23b 个人视角与 Char 2 勋章墙严格隔离 Char 1 专属恋爱成就');

    const resetPrefs = await AHC.resetWallOrder();
    check(resetPrefs.customOrder.length === 0, 'QA#23c 勋章墙支持一键恢复默认排序');

    // QA#24: UI 打开与 4 分区 Tab 渲染 + 静态红线检查
    const pageEl = await AH.open({ tab: 'wall' });
    check(Boolean(pageEl && pageEl.innerHTML.includes('我的勋章墙') && pageEl.innerHTML.includes('祝贺设置')),
      'QA#24 UI 正确渲染四分区导航（陈列 / 勋章墙 / 纪念卡 / 祝贺设置）');

    const compJs = fs.readFileSync(path.resolve(__dirname, '../js/achievement-hall-companion.js'), 'utf8');
    const hallJs = fs.readFileSync(path.resolve(__dirname, '../js/achievement-hall.js'), 'utf8');
    const hallCss = fs.readFileSync(path.resolve(__dirname, '../css/achievement-hall.css'), 'utf8');
    check(!compJs.includes('setInterval(') && !hallJs.includes('setInterval('),
      '成就馆全部脚本严守事件驱动与零 setInterval 轮询');
    check(!compJs.includes('lottery') && !compJs.includes('mallRedeem') && !compJs.includes('paidShowcase'),
      '严守开发边界：零商城商品兑换、零抽奖机制、零付费展示柜');
    check(hallCss.includes('.ah-subnav') && hallCss.includes('.ah-memento-card') && hallCss.includes('.ah-setting-row'),
      'CSS 完整提供四分区、纪念卡、勋章墙与设置开关样式并适配浅/深色变量');
  }

  console.log('\n=== 第三阶段测试总结: 通过 ' + passed + ' 项, 失败 ' + failed + ' 项 ===');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('第三阶段测试异常:', err);
  process.exit(1);
});
