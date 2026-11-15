// scripts/test-wanxiang-mirror-v23.cjs
// 弯弯小手机｜万象镜 V2.3「星光游乐场」自动化验收测试（Node 模拟 DOM 与业务闭环回归）
// 说明：本测试在 Node 模拟 DOM 环境中验证 V2.3 星光游乐场（抓娃娃机、星愿摩天轮、梦幻旋转木马）、
//       玩偶共享背包一致与赠礼、跨角色隔离、事务补偿与退款幂等、留影纪念筛选、旧档升级与备份恢复。
//       不替代真实桌面/手机 Chromium 或 Android 真机触摸/视觉验收。

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(cond, label, detail) {
  if (cond) {
    passed++;
    console.log('  [PASS] ' + label);
  } else {
    failed++;
    console.error('  [FAIL] ' + label + (detail ? ' -> ' + detail : ''));
  }
}

function createV23Harness(opts) {
  opts = opts || {};
  const storageMap = new Map();
  const configMap = new Map();
  const charMap = new Map();
  const memoriesMap = new Map();
  const winListeners = {};
  const historyStack = [];
  const toasts = [];
  let rootBodyChildren = [];
  let forceStorageFail = false;
  let reducedMotion = Boolean(opts.reducedMotion);
  let showGameHallPageCalls = 0;

  function makeClassList(node) {
    return {
      contains(cls) {
        return String(node.className || '').split(/\s+/).filter(Boolean).includes(cls);
      },
      add() {
        const set = new Set(String(node.className || '').split(/\s+/).filter(Boolean));
        for (let i = 0; i < arguments.length; i++) set.add(arguments[i]);
        node.className = Array.from(set).join(' ');
      },
      remove() {
        const rm = new Set(Array.from(arguments));
        node.className = String(node.className || '').split(/\s+/).filter(c => c && !rm.has(c)).join(' ');
      },
      toggle(cls, force) {
        const has = this.contains(cls);
        const want = force === undefined ? !has : Boolean(force);
        if (want) this.add(cls);
        else this.remove(cls);
        return want;
      }
    };
  }

  function parseHtmlToChildren(parent, html) {
    parent.children = [];
    if (!html || !String(html).trim()) return;
    const stack = [parent];
    const tagRegex = /<\/([a-zA-Z0-9-]+)>|<([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
    let m;
    while ((m = tagRegex.exec(String(html))) !== null) {
      if (m[1]) {
        if (stack.length > 1) stack.pop();
      } else if (m[2]) {
        const tag = m[2];
        const attrStr = m[3] || '';
        const selfClosing = /\/\s*$/.test(attrStr) || /^(img|input|br|hr)$/i.test(tag);
        const el = makeElement(tag);
        const attrRe = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g;
        let am;
        while ((am = attrRe.exec(attrStr)) !== null) {
          const k = am[1];
          if (k === '/') continue;
          const v = am[2] !== undefined ? am[2] : (am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : ''));
          if (k === 'id') el.id = v;
          else if (k === 'class') el.className = v;
          else if (k === 'disabled') el.disabled = true;
          else if (k === 'value') el.value = v;
          el._attrs[k] = v;
        }
        const top = stack[stack.length - 1];
        el.parentNode = top;
        top.children.push(el);
        if (!selfClosing) stack.push(el);
      } else if (m[4]) {
        const top = stack[stack.length - 1];
        top._textParts.push(m[4]);
      }
    }
  }

  function matchSingleSelector(el, sel) {
    if (!el || !sel) return false;
    sel = sel.trim();
    if (sel.startsWith('#')) return el.id === sel.slice(1);
    if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
    const attrMatch = sel.match(/^\[([a-zA-Z0-9_:-]+)(?:="([^"]*)")?\]$/);
    if (attrMatch) {
      const k = attrMatch[1];
      if (!(k in el._attrs)) return false;
      return attrMatch[2] === undefined ? true : el._attrs[k] === attrMatch[2];
    }
    return el.tagName.toLowerCase() === sel.toLowerCase();
  }

  function collectDescendants(root, sel, out) {
    for (const ch of root.children) {
      if (matchSingleSelector(ch, sel)) out.push(ch);
      collectDescendants(ch, sel, out);
    }
  }

  function makeElement(tag) {
    let _innerHTML = '';
    const el = {
      tagName: (tag || 'DIV').toUpperCase(),
      id: '',
      className: '',
      _attrs: {},
      _textParts: [],
      children: [],
      parentNode: null,
      style: {},
      value: '',
      disabled: false,
      _listeners: {},
      get innerHTML() { return _innerHTML; },
      set innerHTML(val) {
        _innerHTML = String(val || '');
        parseHtmlToChildren(this, _innerHTML);
      },
      get textContent() {
        return this._textParts.join('') + this.children.map(c => c.textContent).join('');
      },
      set textContent(v) {
        this.children = [];
        this._textParts = [String(v || '')];
      },
      setAttribute(k, v) {
        if (k === 'id') this.id = String(v);
        else if (k === 'class') this.className = String(v);
        else if (k === 'disabled') this.disabled = true;
        this._attrs[k] = String(v);
      },
      getAttribute(k) {
        if (k === 'id') return this.id || null;
        if (k === 'class') return this.className || null;
        return this._attrs[k] !== undefined ? this._attrs[k] : null;
      },
      appendChild(ch) {
        ch.parentNode = this;
        this.children.push(ch);
        return ch;
      },
      remove() {
        rootBodyChildren = rootBodyChildren.filter(n => n !== this);
        if (this.parentNode && Array.isArray(this.parentNode.children)) {
          this.parentNode.children = this.parentNode.children.filter(n => n !== this);
        }
      },
      querySelector(sel) {
        const res = [];
        collectDescendants(this, sel, res);
        return res[0] || null;
      },
      querySelectorAll(sel) {
        const res = [];
        collectDescendants(this, sel, res);
        return res;
      },
      closest(sel) {
        let cur = this;
        while (cur && cur.tagName) {
          if (matchSingleSelector(cur, sel)) return cur;
          cur = cur.parentNode;
        }
        return null;
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 390, height: 640 };
      },
      addEventListener(type, fn) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(fn);
      },
      async dispatchEvent(evtObj) {
        const ev = Object.assign({
          target: this,
          preventDefault() {},
          stopPropagation() {}
        }, evtObj || {});
        let cur = this;
        while (cur) {
          const list = (cur._listeners && cur._listeners[ev.type]) || [];
          for (const fn of list) {
            await fn(ev);
          }
          cur = cur.parentNode;
        }
      }
    };
    el.classList = makeClassList(el);
    return el;
  }

  const bodyEl = makeElement('BODY');
  bodyEl.id = 'app';

  const mockDoc = {
    body: bodyEl,
    createElement(tag) { return makeElement(tag); },
    getElementById(id) {
      if (id === 'app') return bodyEl;
      return bodyEl.querySelector('#' + id);
    }
  };

  function makeTable(map, idGen, isConfig) {
    return {
      async get(k) { return map.has(k) ? JSON.parse(JSON.stringify(map.get(k))) : undefined; },
      async put(obj) {
        if (isConfig && forceStorageFail) throw new Error('QUOTA_EXCEEDED_DB');
        const k = obj.key !== undefined ? obj.key : obj.id;
        map.set(k, JSON.parse(JSON.stringify(obj)));
        return k;
      },
      async bulkPut(rows) { for (const r of rows) await this.put(r); },
      async bulkDelete(keys) { for (const k of keys) map.delete(k); },
      async add(obj) {
        const c = JSON.parse(JSON.stringify(obj));
        if (!c.id && idGen) c.id = idGen();
        map.set(c.id, c);
        return c.id;
      },
      async toArray() { return Array.from(map.values()).map(v => JSON.parse(JSON.stringify(v))); }
    };
  }

  let memSeq = 1;
  const mockDb = {
    config: makeTable(configMap, null, true),
    characters: makeTable(charMap),
    memories: makeTable(memoriesMap, () => memSeq++),
    transaction(mode, tables, fn) { return fn(); }
  };

  const sandboxWindow = {
    localStorage: {
      get length() { return storageMap.size; },
      key(i) { return Array.from(storageMap.keys())[i] || null; },
      getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null; },
      setItem(k, v) {
        if (forceStorageFail) throw new Error('QUOTA_EXCEEDED_LS');
        storageMap.set(k, String(v));
      },
      removeItem(k) { storageMap.delete(k); }
    },
    document: mockDoc,
    db: mockDb,
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    toast(msg) { toasts.push(String(msg)); },
    openPage(el) {
      rootBodyChildren.push(el);
      bodyEl.appendChild(el);
    },
    closePage(id) {
      rootBodyChildren = rootBodyChildren.filter(n => n.id !== id);
      bodyEl.children = bodyEl.children.filter(n => n.id !== id);
    },
    showGameHallPage() { showGameHallPageCalls++; },
    history: {
      pushState(st) { historyStack.push(st); },
      back() { historyStack.pop(); }
    },
    addEventListener(type, fn) {
      if (!winListeners[type]) winListeners[type] = [];
      winListeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!winListeners[type]) return;
      winListeners[type] = winListeners[type].filter(f => f !== fn);
    },
    async triggerWindowEvent(type, extra) {
      const list = (winListeners[type] || []).slice();
      for (const fn of list) await fn(extra || {});
    },
    matchMedia(q) { return { matches: q && q.includes('prefers-reduced-motion') ? reducedMotion : false }; },
    setReducedMotion(flag) { reducedMotion = Boolean(flag); },
    setStorageFail(flag) { forceStorageFail = Boolean(flag); },
    getShowGameHallCalls() { return showGameHallPageCalls; }
  };
  sandboxWindow.window = sandboxWindow;

  const sharedHubCode = fs.readFileSync(path.join(__dirname, '../js/shared-hub.js'), 'utf8');
  const mirrorCode = fs.readFileSync(path.join(__dirname, '../js/wanxiang-mirror.js'), 'utf8');

  const loader = new Function(
    'window', 'document', 'localStorage', 'db', 'console', 'setTimeout', 'clearTimeout',
    sharedHubCode + '\n' + mirrorCode
  );
  loader(sandboxWindow, mockDoc, sandboxWindow.localStorage, mockDb, console, setTimeout, clearTimeout);

  return {
    win: sandboxWindow,
    configMap,
    storageMap,
    charMap,
    memoriesMap,
    toasts,
    historyStack,
    getPage: () => bodyEl.querySelector('#wanxiang-mirror-page')
  };
}

async function runTests() {
  const cssCode = fs.readFileSync(path.join(__dirname, '../css/wanxiang-mirror.css'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const dataCode = fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8');

  // ----------------------------------------------------
  // [1] V2.3 静态资源、地点边界、CSS 规则与备份键覆盖
  // ----------------------------------------------------
  console.log('\n[1] V2.3 静态资源、星光游乐场开放状态、星愿列车站边界与 CSS 适配');
  check(
    /css\/wanxiang-mirror\.css\?v=(2|3)\.\d+\.\d+/.test(indexHtml) &&
    /js\/wanxiang-mirror\.js\?v=(2|3)\.\d+\.\d+/.test(indexHtml),
    'index.html 已更新至 V2.x/V3.x 资源版本参数'
  );
  check(
    cssCode.includes('.wx-claw-stage') &&
    cssCode.includes('.wx-claw-controls') &&
    cssCode.includes('.wx-act-stepper') &&
    cssCode.includes('.wx-carousel-ring') &&
    cssCode.includes('@media (max-width: 374px)') &&
    cssCode.includes('@media (prefers-reduced-motion: reduce)'),
    'css/wanxiang-mirror.css 具备抓娃娃机、摩天轮步骤条、旋转木马、320px 适配与减少动态支持'
  );
  check(
    dataCode.includes("configPrefixes: ['wanxiang_mirror_'") &&
    dataCode.includes("localPrefixes: ['wanxiang_mirror_'"),
    'js/data.js 自动覆盖 V2.3 新增 wanxiang_mirror_* 存储键（备份与选择性清空）'
  );

  {
    const h = createV23Harness();
    const { win } = h;
    await win.WanxiangMirror.open();
    const sp = win.WanxiangMirror.getLocationById('starlight_park');
    const st = win.WanxiangMirror.getLocationById('starwish_station');
    check(
      win.WanxiangMirror.LOCATIONS.length === 9 &&
      sp && sp.status === 'open' && sp.openLabel === '已开放' &&
      st && (st.status === 'available' || st.status === 'open') && st.openLabel === '已开放',
      '星光游乐场与星愿列车站均已正式开放'
    );

    await win.WanxiangMirror.openLocationSheet('starlight_park', 'intro');
    const spCta = h.getPage().querySelector('.wx-btn-primary');
    const gameFeat = h.getPage().querySelector('[data-wx-feature="park_minigame"]');
    await gameFeat.dispatchEvent({ type: 'click', target: gameFeat });
    check(
      spCta && !spCta.disabled && win.getShowGameHallCalls() === 1,
      '星光游乐场主进入按钮可用，且保留「前往游戏大厅」入口兼容'
    );

    await win.WanxiangMirror.openLocationSheet('starwish_station', 'intro');
    const stCta = h.getPage().querySelector('.wx-btn-primary');
    check(stCta && !stCta.disabled, '星愿列车站主 CTA 已在 V2.4 启用');
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [2] 抓娃娃机：概率表严格校验、操控、扣费、幂等、并发、补偿退款与异常
  // ----------------------------------------------------
  console.log('\n[2] 抓娃娃机概率、操作、防连点、幂等、跨存储补偿退款与边界校验');
  {
    const h = createV23Harness();
    const { win } = h;
    const cfg = win.WanxiangMirror.CLAW_CONFIG;
    const weightSum = cfg.plushies.reduce((s, p) => s + p.weight, 0);
    check(
      cfg.cost === 20 && cfg.successRate === 0.6 && cfg.missRate === 0.4 &&
      cfg.plushies.length === 6 && weightSum === 100,
      '抓娃娃机配置：20 币/次、60% 抓中 / 40% 失手、6 款玩偶权重合计 100%'
    );

    // 确定性抽样覆盖失手与全部 6 款玩偶
    const seenPlushIds = new Set();
    let sawMiss = false;
    const missRoll = (() => {
      const seq = [0.75]; let idx = 0; return () => seq[idx++ % seq.length];
    })();
    if (!win.WanxiangMirror.rollClawOutcome(missRoll).success) sawMiss = true;
    const weightMidpoints = [0.1, 0.35, 0.6, 0.8, 0.9, 0.97];
    for (const r2Val of weightMidpoints) {
      let c = 0;
      const out = win.WanxiangMirror.rollClawOutcome(() => (c++ === 0 ? 0.1 : r2Val));
      if (out.success && out.plush) seenPlushIds.add(out.plush.id);
    }
    check(sawMiss && seenPlushIds.size === 6, '抓娃娃机概率抽样覆盖失手与全部 6 款玩偶（含5%特别款星梦鲸）');

    // UI 左右移动、概率公示展示、取消确认不扣费、余额不足禁止扣费
    const initCoins2 = (await win.SharedEconomyService.getState()).coins;
    if (initCoins2 !== 15) {
      if (initCoins2 > 15) await win.SharedEconomyService.spendCoins(initCoins2 - 15, '测试初始化到15币', 'test');
      else await win.SharedEconomyService.addCoins(15 - initCoins2, '测试初始化到15币', 'test');
    }
    const ecoLowBefore = (await win.SharedEconomyService.getState()).coins;
    const lowRes = await win.WanxiangMirror.playClawAttempt({ requestId: 'claw_low_1' });
    const ecoLowAfter = (await win.SharedEconomyService.getState()).coins;
    check(
      lowRes.ok === false && lowRes.reason === 'insufficient_coins' &&
      ecoLowAfter === ecoLowBefore && ecoLowAfter === 15,
      '金币不足 20 时禁止抓娃娃，余额保持非负'
    );

    // 充值至 65 币测试 UI 确认/取消、左右移动、抓取与并发边界
    await win.SharedEconomyService.addCoins(50, '补足65币', 'test');
    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('starlight_park', 'park');
    const page = h.getPage();
    await page.querySelector('[data-wx-park-view="claw"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-park-view="claw"]') });
    check(page.querySelector('#wx-sheet').textContent.includes('60%') && page.querySelector('#wx-sheet').textContent.includes('星梦鲸 5%'),
      '抓娃娃机页面明确展示透明概率规则（无隐藏保底 / 无 AI 干预）');

    const posBefore = win.WanxiangMirror.getRuntimeSnapshot().clawPos;
    await page.querySelector('[data-wx-action="claw-left"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="claw-left"]') });
    const posLeft = win.WanxiangMirror.getRuntimeSnapshot().clawPos;
    await page.querySelector('[data-wx-action="claw-right"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="claw-right"]') });
    const posRight = win.WanxiangMirror.getRuntimeSnapshot().clawPos;
    check(posLeft < posBefore && posRight === posBefore, '爪子左右微调按钮正常响应并更新位置');

    await page.querySelector('[data-wx-action="claw-drop"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="claw-drop"]') });
    check(win.WanxiangMirror.getRuntimeSnapshot().confirmOpen === true, '点击落爪先弹出 Layer 5 二次确认框');
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-close]') });
    check((await win.SharedEconomyService.getState()).coins === 65, '取消落爪确认框零扣费、零发奖');

    // 同一 requestId 重复执行仅扣一次费且仅发放一次玩偶
    let rollCall = 0;
    const rngHitWhale = () => (rollCall++ === 0 ? 0.1 : 0.98);
    const cr1 = await win.WanxiangMirror.playClawAttempt({ requestId: 'claw_dup_1', rngFn: rngHitWhale });
    const cr2 = await win.WanxiangMirror.playClawAttempt({ requestId: 'claw_dup_1', rngFn: rngHitWhale });
    const ecoAfterDup = await win.SharedEconomyService.getState();
    const csAfterDup = await win.WanxiangMirror.loadClawState();
    check(
      cr1.ok && cr1.plush && cr1.plush.plushId === 'dream_whale' && cr2.idempotent === true &&
      ecoAfterDup.coins === 45 && csAfterDup.plushies.length === 1 &&
      ecoAfterDup.inventory.some(i => i.itemId === 'wx_plush_' + cr1.plush.plushInstanceId && i.count === 1),
      '同一 requestId 重放抓娃娃仅扣 20 币并仅发 1 只玩偶（同步共享背包）'
    );

    // 并发测试（剩余 45 币但并发 2 次只剩 25 -> 改成先调成 25 币并发两次只能成功 1 次）
    await win.SharedEconomyService.spendCoins(20, '调至25币测并发', 'test');
    const [race1, race2] = await Promise.all([
      win.WanxiangMirror.playClawAttempt({ requestId: 'claw_race_1', rngFn: () => 0.8 }),
      win.WanxiangMirror.playClawAttempt({ requestId: 'claw_race_2', rngFn: () => 0.8 })
    ]);
    const ecoAfterRace = await win.SharedEconomyService.getState();
    check(
      [race1.ok, race2.ok].filter(Boolean).length === 1 && ecoAfterRace.coins === 5,
      '25 币并发落爪 2 次仅成功 1 次、剩余 5 币不出现负余额'
    );

    // 同步共享背包 addItem 失败 -> 补偿移除玩偶并仅执行 1 次退款；重放 requestId 不二次退款
    await win.SharedEconomyService.addCoins(40, '补足45币测异常退款', 'test');
    const origAdd = win.SharedEconomyService.addItem;
    win.SharedEconomyService.addItem = async () => { throw new Error('BAG_SYNC_FAIL'); };
    const failBagRes = await win.WanxiangMirror.playClawAttempt({ requestId: 'claw_bag_fail', rngFn: () => 0.1 });
    const replayFailBag = await win.WanxiangMirror.playClawAttempt({ requestId: 'claw_bag_fail', rngFn: () => 0.1 });
    win.SharedEconomyService.addItem = origAdd;
    const ecoAfterRefund = await win.SharedEconomyService.getState();
    const csAfterRefund = await win.WanxiangMirror.loadClawState();
    check(
      failBagRes.ok === false && failBagRes.reason === 'inventory_sync_failed' && failBagRes.refunded === true &&
      replayFailBag.refunded === true && replayFailBag.refundExecuted === false &&
      ecoAfterRefund.coins === 45 && csAfterRefund.plushies.length === 1,
      '玩偶写入共享背包失败时自动移除脏玩偶并单次幂等退款（重放不双倍退款）'
    );

    // 存储配额写入失败 -> 单次退款且返回失败提示
    win.setStorageFail(true);
    const quotaFailRes = await win.WanxiangMirror.playClawAttempt({ requestId: 'claw_quota_fail', rngFn: () => 0.8 });
    win.setStorageFail(false);
    check(
      quotaFailRes.ok === false && quotaFailRes.reason === 'storage_failed' && quotaFailRes.refunded === true &&
      (await win.SharedEconomyService.getState()).coins === 45,
      '抓娃娃状态落盘失败时真实报错并单次退还 20 金币'
    );

    // 模拟崩溃恢复：addCoins 退款已写入共享账本 [ref:] 但 CLAW_V23 的 status='refunded' 尚未写入前崩溃，重放绝不双倍退款
    const crashReqKey = 'claw_crash_ref_1';
    await win.SharedEconomyService.spendCoins(20, '星光游乐场：抓娃娃机 [tx:' + crashReqKey + ']', 'wanxiangMirrorPark');
    await win.SharedEconomyService.addCoins(20, '抓娃娃入包失败补偿退款 [ref:' + crashReqKey + ']', 'wanxiangMirrorPark');
    const csCrash = await win.WanxiangMirror.loadClawState();
    csCrash.processedRequests[crashReqKey] = { attemptId: 'att_crash_1', plushInstanceId: null, status: 'compensation_pending', attempt: { attemptId: 'att_crash_1', status: 'compensation_pending' } };
    csCrash.pendingCompensations.push({ requestKey: crashReqKey, attemptId: 'att_crash_1', amount: 20, status: 'compensation_pending', createdAt: Date.now() });
    await win.db.config.put({ key: win.WanxiangMirror.STORAGE_KEYS.CLAW_V23, value: csCrash });
    win.localStorage.setItem(win.WanxiangMirror.STORAGE_KEYS.CLAW_V23, JSON.stringify(csCrash));

    // 在全新沙盒实例加载相同存储（内存 _refundedRequestKeys 为空）再重放 requestId
    const hCrashReload = createV23Harness();
    for (const [k, v] of h.configMap.entries()) await hCrashReload.configMap.set(k, JSON.parse(JSON.stringify(v)));
    for (const [k, v] of h.storageMap.entries()) hCrashReload.storageMap.set(k, v);
    const coinsBeforeCrashRetry = (await hCrashReload.win.SharedEconomyService.getState()).coins;
    const crashRetryRes = await hCrashReload.win.WanxiangMirror.playClawAttempt({ requestId: 'crash_ref_1', rngFn: () => 0.1 });
    const coinsAfterCrashRetry = (await hCrashReload.win.SharedEconomyService.getState()).coins;
    check(
      crashRetryRes.refunded === true && crashRetryRes.refundExecuted === false &&
      coinsBeforeCrashRetry === coinsAfterCrashRetry,
      '退款入账后标记落盘前发生崩溃，重启恢复重放绝不二次退款（[ref:] 账本校验生效）'
    );
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [3] 玩偶赠礼：唯一消费、背包一致、切角保护、AI 失败不回滚与重试
  // ----------------------------------------------------
  console.log('\n[3] 玩偶赠礼唯一性、背包一致、Char 校验、AI 失败保留与重试回应');
  {
    const h = createV23Harness();
    const { win } = h;
    await win.db.characters.put({ id: 11, nick: '温宁', name: '温宁' });
    await win.db.characters.put({ id: 12, nick: '陆离', name: '陆离' });
    await win.SharedEconomyService.addCoins(200, '玩偶赠礼测试币', 'test');

    const p1Res = await win.WanxiangMirror.playClawAttempt({ requestId: 'g_pl_1', rngFn: () => 0.05 });
    const p2Res = await win.WanxiangMirror.playClawAttempt({ requestId: 'g_pl_2', rngFn: () => 0.05 });
    const p1 = p1Res.plush;
    const p2 = p2Res.plush;

    await win.WanxiangMirror.saveMirrorState({ activeCharId: '11' });
    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('starlight_park', 'park');
    const page = h.getPage();
    await page.querySelector('[data-wx-park-view="plushies"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-park-view="plushies"]') });

    let plushAiFail = true;
    win.callAI = async () => {
      if (plushAiFail) throw new Error('PLUSH_AI_TIMEOUT');
      return '好可爱的玩偶，谢谢你专门夹来送给我。';
    };

    await page.querySelector('[data-wx-gift-plush="' + p1.plushInstanceId + '"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-gift-plush="' + p1.plushInstanceId + '"]')
    });
    await page.querySelector('[data-wx-confirm-exec]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-exec]') });
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-close]') });

    let cs = await win.WanxiangMirror.loadClawState();
    let p1After = cs.plushies.find(x => x.plushInstanceId === p1.plushInstanceId);
    const ecoG1 = await win.SharedEconomyService.getState();
    const retryPlBtn = page.querySelector('[data-wx-retry-plush-ai="' + p1.plushInstanceId + '"]');
    check(
      p1After.status === 'gifted' && p1After.giftedToCharId === '11' && p1After.aiFailed === true &&
      !ecoG1.inventory.some(i => i.itemId === 'wx_plush_' + p1.plushInstanceId) &&
      Boolean(retryPlBtn),
      'AI 超时失败时不回滚已送出玩偶、同步扣减共享背包，并提供重试回应按钮'
    );

    plushAiFail = false;
    await retryPlBtn.dispatchEvent({ type: 'click', target: retryPlBtn });
    cs = await win.WanxiangMirror.loadClawState();
    p1After = cs.plushies.find(x => x.plushInstanceId === p1.plushInstanceId);
    check(p1After.aiFailed === false && p1After.charReplySummary.includes('可爱的玩偶'),
      '重试玩偶回应成功补充 Char 台词且不重复消耗玩偶');

    const dupGift = await win.WanxiangMirror.giftPlushToActiveChar(p1.plushInstanceId, '11', 'dup_pl_g');
    const guardGift = await win.WanxiangMirror.giftPlushToActiveChar(p2.plushInstanceId, '12', 'guard_pl_g');
    check(
      dupGift.ok === false && dupGift.reason === 'already_gifted' &&
      guardGift.ok === false && guardGift.reason === 'char_changed',
      '已送出玩偶禁止二次赠送；预期 Char 与当前 Char 不一致时中止赠送并保留玩偶'
    );

    // 从统一共享背包直接赠送 p2
    await win.WanxiangMirror.closeSheetOnly();
    win.WanxiangMirror.switchTab('bag');
    await new Promise(r => setTimeout(r, 20));
    await page.querySelector('[data-wx-gift-item="wx_plush_' + p2.plushInstanceId + '"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-gift-item="wx_plush_' + p2.plushInstanceId + '"]')
    });
    await page.querySelector('[data-wx-confirm-exec]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-exec]') });
    cs = await win.WanxiangMirror.loadClawState();
    check(cs.plushies.find(x => x.plushInstanceId === p2.plushInstanceId).status === 'gifted',
      '通过全局共享背包直接赠出玩偶时同步更新游乐场玩偶为已送出');
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [4] 星愿摩天轮：需选 Char、单次 30 币三幕、续接不重扣、Char 严格隔离、在途 AI 作废、非强制纪念
  // ----------------------------------------------------
  console.log('\n[4] 星愿摩天轮三幕流程、中途退出续接不重扣、多 Char 隔离与非强制纪念');
  {
    const h = createV23Harness();
    const { win } = h;
    await win.db.characters.put({ id: 21, nick: '林栖', name: '林栖' });
    await win.db.characters.put({ id: 22, nick: '顾屿', name: '顾屿' });
    const initCoins4 = (await win.SharedEconomyService.getState()).coins;
    if (initCoins4 > 100) await win.SharedEconomyService.spendCoins(initCoins4 - 100, '摩天轮测试初始化100币', 'test');
    else if (initCoins4 < 100) await win.SharedEconomyService.addCoins(100 - initCoins4, '摩天轮测试初始化100币', 'test');

    // 未选 Char 禁止直接乘坐
    const noCharFr = await win.WanxiangMirror.startFerrisRide(null, 'no_char_fr');
    check(noCharFr.ok === false && noCharFr.reason === 'no_char', '未选择同行 Char 时不隐式指定角色开始摩天轮');

    // 选择 Char 21 -> 打开摩天轮确认框 -> 取消不扣费
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '21' });
    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('starlight_park', 'park');
    const page = h.getPage();
    await page.querySelector('[data-wx-park-view="ferris"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-park-view="ferris"]') });
    await page.querySelector('[data-wx-action="ferris-start"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="ferris-start"]') });
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-close]') });
    check((await win.SharedEconomyService.getState()).coins === 100, '取消摩天轮确认框零扣费');

    // 确认乘坐（扣 30 币 -> 剩 70 币）
    let ferrisAiFail = true;
    win.callAI = async () => {
      if (ferrisAiFail) throw new Error('FERRIS_AI_FAIL');
      return '从最高点望下去，游乐场的灯串亮得像星河。';
    };
    await page.querySelector('[data-wx-action="ferris-start"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="ferris-start"]') });
    await page.querySelector('[data-wx-confirm-exec]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-exec]') });
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-close]') });
    check((await win.SharedEconomyService.getState()).coins === 70, '确认乘坐星愿摩天轮单次扣费 30 金币');

    // 第 1 幕 AI 失败仍展示自然文本，可重试也可推进第 2 幕
    await page.querySelector('[data-wx-ferris-choice="A"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-ferris-choice="A"]') });
    let fs = await win.WanxiangMirror.loadFerrisState();
    const r21 = fs.activeRidesByChar['21'];
    const retryF1 = page.querySelector('[data-wx-retry-ferris-ai="' + r21.rideId + '"]');
    check(r21.actReplies.act1.aiFailed === true && r21.actReplies.act1.text === '' && Boolean(retryF1),
      '摩天轮第 1 幕 AI 失败时展示自然备用回应与重试按钮，不写入假对话');

    ferrisAiFail = false;
    await retryF1.dispatchEvent({ type: 'click', target: retryF1 });
    const nextF1Btn = page.querySelector('[data-wx-ferris-next="' + r21.rideId + '"]');
    await nextF1Btn.dispatchEvent({ type: 'click', target: nextF1Btn });

    // 退出重进不重扣 30 币，并自动续接第 2 幕
    await win.WanxiangMirror.closeSheetOnly();
    await win.WanxiangMirror.openLocationSheet('starlight_park', 'park');
    await page.querySelector('[data-wx-park-view="ferris"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-park-view="ferris"]') });
    fs = await win.WanxiangMirror.loadFerrisState();
    check(
      fs.activeRidesByChar['21'].currentAct === 2 &&
      (await win.SharedEconomyService.getState()).coins === 70 &&
      page.querySelector('#wx-sheet').textContent.includes('第二幕'),
      '第 2 幕中途退出再进入自动续接草稿，绝不二次扣费'
    );

    // 切换至 Char 22：不展示 Char 21 的摩天轮草稿，严格隔离
    await win.WanxiangMirror.openLocationSheet('starlight_park', 'charPicker');
    await page.querySelector('[data-wx-pick-char="22"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-pick-char="22"]') });
    await page.querySelector('[data-wx-action="enter-location"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="enter-location"]') });
    await page.querySelector('[data-wx-park-view="ferris"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-park-view="ferris"]') });
    check(Boolean(page.querySelector('[data-wx-action="ferris-start"]')) && Boolean((await win.WanxiangMirror.loadFerrisState()).activeRidesByChar['21']),
      '切换 Char 22 时完全隔离 Char 21 摩天轮草稿，且 Char 21 草稿安全保留');

    // 在途 AI 切换 Char 作废验证
    await win.WanxiangMirror.openLocationSheet('starlight_park', 'charPicker');
    let resolveLateFerrisAi;
    win.callAI = () => new Promise(res => { resolveLateFerrisAi = res; });
    const lateReq = win.WanxiangMirror.requestCharReaction({ locationName: '星愿摩天轮', actionDesc: '等待迟到回应' });
    await new Promise(r => setTimeout(r, 10));
    await page.querySelector('[data-wx-pick-char="21"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-pick-char="21"]') });
    resolveLateFerrisAi('迟到的旧角色台词');
    const lateRes = await lateReq;
    check(lateRes.ok === false && lateRes.aborted === true, '摩天轮切角后旧 Char 在途 AI 请求自动作废');

    // 切回 Char 21 恢复第 2 幕，走完第 2、3 幕并保存纪念（dedupe by rideId）
    win.callAI = async () => '嗯，下一站再来吧。';
    await page.querySelector('[data-wx-action="enter-location"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="enter-location"]') });
    await page.querySelector('[data-wx-park-view="ferris"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-park-view="ferris"]') });
    await page.querySelector('[data-wx-ferris-choice="B"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-ferris-choice="B"]') });
    await page.querySelector('[data-wx-ferris-next="' + r21.rideId + '"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-ferris-next="' + r21.rideId + '"]') });
    await page.querySelector('[data-wx-ferris-choice="C"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-ferris-choice="C"]') });
    await page.querySelector('[data-wx-ferris-finish="' + r21.rideId + '"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-ferris-finish="' + r21.rideId + '"]') });

    const sheetTxtFin = page.querySelector('#wx-sheet').textContent;
    check(
      sheetTxtFin.includes('收藏成纪念吗') &&
      Boolean(page.querySelector('[data-wx-save-park-mem="ferris_wheel:' + r21.rideId + '"]')) &&
      Boolean(page.querySelector('[data-wx-action="ferris-skip-memento"]')),
      '摩天轮第三幕结束后提供非强制「收藏摩天轮纪念 / 暂不收藏 / 返回小镇」选择'
    );

    const fMem1 = await win.WanxiangMirror.saveAmusementMemento({ kind: 'ferris_wheel', sourceId: r21.rideId });
    const fMem2 = await win.WanxiangMirror.saveAmusementMemento({ kind: 'ferris_wheel', sourceId: r21.rideId });
    check(
      fMem1.ok && fMem1.duplicate === false && fMem2.duplicate === true &&
      (await win.SharedEconomyService.getState()).coins === 70,
      '摩天轮三幕全流程仅扣一次 30 币，且摩天轮纪念按 rideId 严格去重'
    );
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [5] 梦幻旋转木马：座位/氛围、不改写人设、动画可跳过与减少动态、防重与非强制纪念
  // ----------------------------------------------------
  console.log('\n[5] 梦幻旋转木马主题氛围、动画跳过、减少动态与纪念去重');
  {
    const h = createV23Harness();
    const { win } = h;
    await win.db.characters.put({ id: 31, nick: '沈知行', name: '沈知行', personality: '沉稳克制' });
    const initCoins5 = (await win.SharedEconomyService.getState()).coins;
    if (initCoins5 > 50) await win.SharedEconomyService.spendCoins(initCoins5 - 50, '木马测试初始化50币', 'test');
    else if (initCoins5 < 50) await win.SharedEconomyService.addCoins(50 - initCoins5, '木马测试初始化50币', 'test');
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '31' });

    let capturedCarouselPrompt = '';
    win.callAI = async (msgs) => {
      capturedCarouselPrompt = msgs[0].content;
      return '木马上的风很温和，氛围刚刚好。';
    };

    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('starlight_park', 'park');
    const page = h.getPage();
    await page.querySelector('[data-wx-park-view="carousel"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-park-view="carousel"]') });

    // 选择座位和氛围
    await page.querySelector('[data-wx-carousel-seat="sakura_unicorn"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-carousel-seat="sakura_unicorn"]') });
    await page.querySelector('[data-wx-carousel-mood="quiet_dream"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-carousel-mood="quiet_dream"]') });

    // 取消确认不扣费
    await page.querySelector('[data-wx-action="carousel-start"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="carousel-start"]') });
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-close]') });
    check((await win.SharedEconomyService.getState()).coins === 50, '取消旋转木马确认框零扣费');

    // 确认乘坐（扣 10 币 -> 40 币），开启旋转动画并测试立刻「跳过动画」
    await page.querySelector('[data-wx-action="carousel-start"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="carousel-start"]') });
    await page.querySelector('[data-wx-confirm-exec]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-exec]') });
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-close]') });

    const snapSpin = win.WanxiangMirror.getRuntimeSnapshot();
    const skipBtn = page.querySelector('[data-wx-action="carousel-skip-anim"]');
    check(snapSpin.carouselPlaying === true && Boolean(skipBtn) && (await win.SharedEconomyService.getState()).coins === 40,
      '旋转木马提交 10 币交易后进入可跳过旋转动画状态');

    await skipBtn.dispatchEvent({ type: 'click', target: skipBtn });
    const csCar = await win.WanxiangMirror.loadCarouselState();
    const lastRide = csCar.rides[0];
    check(
      win.WanxiangMirror.getRuntimeSnapshot().carouselPlaying === false &&
      lastRide && lastRide.animationSkipped === true &&
      (capturedCarouselPrompt.includes('不改写') || capturedCarouselPrompt.includes('严格保持角色原本性格')),
      '点击跳过动画立即停止旋转状态且不影响已提交记录；氛围仅作提示不改写 Char 人设'
    );

    // 相同 requestId 重放不重复扣费
    const dupCar1 = await win.WanxiangMirror.commitCarouselRide({ seatId: 'star_pumpkin', moodId: 'lively_joy', requestId: 'car_dup_1' });
    const dupCar2 = await win.WanxiangMirror.commitCarouselRide({ seatId: 'star_pumpkin', moodId: 'lively_joy', requestId: 'car_dup_1' });
    check(
      dupCar1.ok && dupCar2.idempotent === true && (await win.SharedEconomyService.getState()).coins === 30,
      '旋转木马同 requestId 重放幂等仅扣一次 10 币'
    );

    // 非强制纪念按 carouselRideId 去重；暂不收藏则不生成第二条纪念
    const cMem1 = await win.WanxiangMirror.saveAmusementMemento({ kind: 'carousel', sourceId: lastRide.carouselRideId });
    const cMem2 = await win.WanxiangMirror.saveAmusementMemento({ kind: 'carousel', sourceId: lastRide.carouselRideId });
    check(cMem1.ok && cMem1.duplicate === false && cMem2.duplicate === true,
      '木马纪念按 carouselRideId 严格去重，不强制写入第二条');

    // reduced-motion 模式不开启旋转动画定时器
    win.setReducedMotion(true);
    await page.querySelector('[data-wx-action="carousel-start"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="carousel-start"]') });
    await page.querySelector('[data-wx-confirm-exec]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-exec]') });
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-close]') });
    check(win.WanxiangMirror.getRuntimeSnapshot().carouselPlaying === false && (await win.SharedEconomyService.getState()).coins === 20,
      'prefers-reduced-motion 下跳过木马旋转动效且交易正常落盘');
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [6] 跨地点同行上下文 6 个事件、Char 隔离、零篡改 db.memories 与游乐场纪念二级筛选
  // ----------------------------------------------------
  console.log('\n[6] 同行上下文 6 种新事件、Char 隔离、零长期记忆篡改与纪念册二次筛选');
  {
    const h = createV23Harness();
    const { win } = h;
    await win.db.characters.put({ id: 41, nick: '江暮', name: '江暮' });
    await win.db.characters.put({ id: 42, nick: '温宁', name: '温宁' });
    await win.SharedEconomyService.addCoins(300, '综合测试币', 'test');
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '41' });

    const clRes = await win.WanxiangMirror.playClawAttempt({ requestId: 'ctx_cl_1', rngFn: () => 0.1 });
    await win.WanxiangMirror.giftPlushToActiveChar(clRes.plush.plushInstanceId, '41', 'ctx_gp_1');
    const frRes = await win.WanxiangMirror.startFerrisRide('41', 'ctx_fr_1');
    await win.WanxiangMirror.chooseFerrisActOption(frRes.ride.rideId, 1, 'A', 'ctx_fo_1');
    await win.WanxiangMirror.advanceFerrisAct(frRes.ride.rideId);
    await win.WanxiangMirror.chooseFerrisActOption(frRes.ride.rideId, 2, 'B', 'ctx_fo_2');
    await win.WanxiangMirror.advanceFerrisAct(frRes.ride.rideId);
    await win.WanxiangMirror.chooseFerrisActOption(frRes.ride.rideId, 3, 'C', 'ctx_fo_3');
    await win.WanxiangMirror.finishFerrisRide(frRes.ride.rideId, 'ctx_ff_1');
    const carRes = await win.WanxiangMirror.commitCarouselRide({ seatId: 'moon_white_horse', moodId: 'gentle_romantic', requestId: 'ctx_cr_1' });

    await win.WanxiangMirror.saveAmusementMemento({ kind: 'plush', sourceId: clRes.plush.plushInstanceId });
    await win.WanxiangMirror.saveAmusementMemento({ kind: 'ferris_wheel', sourceId: frRes.ride.rideId });
    await win.WanxiangMirror.saveAmusementMemento({ kind: 'carousel', sourceId: carRes.ride.carouselRideId });

    const ctx41 = await win.WanxiangMirror.getCompanionContextForChar('41', 10);
    const ctx42 = await win.WanxiangMirror.getCompanionContextForChar('42', 10);
    const types41 = new Set(ctx41.map(e => e.eventType));
    check(
      types41.has('claw_attempt_completed') &&
      types41.has('plush_won') &&
      types41.has('plush_gifted') &&
      types41.has('ferris_ride_completed') &&
      types41.has('carousel_ride_completed') &&
      types41.has('amusement_memento_saved') &&
      ctx42.length === 0 &&
      h.memoriesMap.size === 0,
      '全部 6 个游乐场事件进入同行上下文并严格按 Char 隔离，且零修改 db.memories'
    );

    // 验证全屏「留影」分页新增「游乐场纪念」与「玩偶 / 摩天轮 / 旋转木马」子筛选
    await win.WanxiangMirror.open({ tab: 'mementos' });
    const page = h.getPage();
    await page.querySelector('[data-wx-mem-filter="amusement_park"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-mem-filter="amusement_park"]')
    });
    check(page.querySelectorAll('[data-wx-amuse-sub]').length === 4,
      '「游乐场纪念」主筛选下展示全部/玩偶/摩天轮/旋转木马四个子筛选');

    await page.querySelector('[data-wx-amuse-sub="plush"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-amuse-sub="plush"]')
    });
    const plushTxt = page.querySelector('#wx-subpage').textContent;
    check(plushTxt.includes('玩偶纪念') && !plushTxt.includes('摩天轮纪念') && !plushTxt.includes('木马纪念'),
      '「玩偶」子筛选精准过滤玩偶纪念卡片');

    await page.querySelector('[data-wx-amuse-sub="ferris_wheel"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-amuse-sub="ferris_wheel"]')
    });
    const ferrisTxt = page.querySelector('#wx-subpage').textContent;
    check(ferrisTxt.includes('摩天轮纪念') && !ferrisTxt.includes('玩偶纪念'),
      '「摩天轮」子筛选精准过滤摩天轮纪念卡片');

    await page.querySelector('[data-wx-amuse-sub="carousel"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-amuse-sub="carousel"]')
    });
    const carTxt = page.querySelector('#wx-subpage').textContent;
    check(carTxt.includes('木马纪念') && !carTxt.includes('摩天轮纪念'),
      '「旋转木马」子筛选精准过滤木马纪念卡片');
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [7] V2.0-V2.2 旧存档升级、备份恢复往返（含重放）、地图失败兜底与多层 popstate 返回
  // ----------------------------------------------------
  console.log('\n[7] 旧档升级、备份恢复往返、地图兜底与 Android 多层 popstate 返回链');
  {
    const h = createV23Harness();
    const { win, configMap, storageMap } = h;
    await win.db.characters.put({ id: 51, nick: '顾言', name: '顾言' });

    // 预置 V2.0-V2.2 旧存档
    await configMap.set('shared_economy_state_v2', {
      key: 'shared_economy_state_v2',
      value: { coins: 666, diamonds: 5, inventory: [{ itemId: 'item_vinyl', name: '复古黑胶唱机', count: 1 }], logs: [] }
    });
    await configMap.set('wanxiang_mirror_state_v1', {
      key: 'wanxiang_mirror_state_v1',
      value: { schemaVersion: 2, timePreview: 'night', activeCharId: '51', visitedLocations: { mirror_plaza: 100 } }
    });
    await configMap.set('wanxiang_mirror_mementos_v1', {
      key: 'wanxiang_mirror_mementos_v1',
      value: [{ id: 'old_cafe_1', locationId: 'afternoon_cafe', locationName: '午后咖啡馆', charId: '51', charName: '顾言', note: '旧留影' }]
    });

    await win.WanxiangMirror.open();
    const csInit = await win.WanxiangMirror.loadClawState();
    const fsInit = await win.WanxiangMirror.loadFerrisState();
    const carInit = await win.WanxiangMirror.loadCarouselState();
    check(
      (await win.SharedEconomyService.getState()).coins === 666 &&
      csInit.plushies.length === 0 &&
      Object.keys(fsInit.activeRidesByChar).length === 0 &&
      carInit.rides.length === 0,
      'V2.0-V2.2 旧档升级至 V2.3 完整保留金币/背包/旧留影并安全补齐游乐场默认值'
    );

    // 创建 V2.3 数据后执行备份 -> 清空 -> 恢复 -> 重放旧 requestId
    const clBk = await win.WanxiangMirror.playClawAttempt({ requestId: 'bk_claw_1', rngFn: () => 0.1 });
    const carBk = await win.WanxiangMirror.commitCarouselRide({ seatId: 'moon_white_horse', moodId: 'gentle_romantic', requestId: 'bk_car_1' });
    await win.WanxiangMirror.saveAmusementMemento({ kind: 'plush', sourceId: clBk.plush.plushInstanceId });

    const exportedCfg = await win.db.config.toArray();
    const exportedLS = {};
    for (let i = 0; i < storageMap.size; i++) {
      const k = win.localStorage.key(i);
      exportedLS[k] = win.localStorage.getItem(k);
    }
    configMap.clear();
    storageMap.clear();
    await win.db.config.bulkPut(exportedCfg);
    Object.keys(exportedLS).forEach(k => win.localStorage.setItem(k, exportedLS[k]));

    const coinsBeforeReplay = (await win.SharedEconomyService.getState()).coins;
    const replayClaw = await win.WanxiangMirror.playClawAttempt({ requestId: 'bk_claw_1', rngFn: () => 0.1 });
    const replayCar = await win.WanxiangMirror.commitCarouselRide({ seatId: 'moon_white_horse', moodId: 'gentle_romantic', requestId: 'bk_car_1' });
    const replayMem = await win.WanxiangMirror.saveAmusementMemento({ kind: 'plush', sourceId: clBk.plush.plushInstanceId });
    check(
      replayClaw.idempotent === true && replayCar.idempotent === true && replayMem.duplicate === true &&
      (await win.SharedEconomyService.getState()).coins === coinsBeforeReplay &&
      (await win.WanxiangMirror.loadMementos()).length === 2,
      '备份恢复后完整保留 V2.3 游乐场数据，且重放旧 requestId 与纪念保存均保持幂等不重复'
    );

    // 验证地图异常兜底 + 5 层 popstate 返回链：claw -> hub -> intro -> close sheet -> exit page
    const page = h.getPage();
    await page.querySelector('#wx-map-img').dispatchEvent({ type: 'error' });
    check(page.querySelector('#wx-map-fallback').classList.contains('is-visible') && page.querySelectorAll('.wx-hotspot').length === 9,
      '地图底图异常时展示兜底提示且九大地点热区可点击');

    await win.WanxiangMirror.openLocationSheet('starlight_park', 'intro');
    await page.querySelector('[data-wx-action="enter-location"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="enter-location"]') });
    await page.querySelector('[data-wx-park-view="claw"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-park-view="claw"]') });
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetSubView === 'park' && win.WanxiangMirror.getRuntimeSnapshot().parkView === 'claw',
      '已进入星光游乐场抓娃娃机二级玩法页');

    await win.triggerWindowEvent('popstate');
    check(win.WanxiangMirror.getRuntimeSnapshot().parkView === 'hub', '第 1 次返回从抓娃娃机退回游乐场总览');
    await win.triggerWindowEvent('popstate');
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetSubView === 'intro', '第 2 次返回从游乐场总览退回星光游乐场简介卡');
    await win.triggerWindowEvent('popstate');
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetOpen === false && Boolean(h.getPage()), '第 3 次返回关闭弹窗保留小镇地图');
    await win.triggerWindowEvent('popstate');
    check(h.getPage() === null, '第 4 次返回退出万象镜回到桌面');
  }

  console.log('\n====================================');
  console.log('V2.3 测试汇总: 通过 ' + passed + ' 项, 失败 ' + failed + ' 项');
  console.log('====================================');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
