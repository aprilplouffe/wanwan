// scripts/test-wanxiang-mirror-v24.cjs
// 弯弯小手机｜万象镜 V2.4「星愿列车站」自动化验收测试（Node 模拟 DOM 与业务闭环回归）
// 说明：本测试在 Node 模拟 DOM 环境中验证 V2.4 星愿列车站（4 大目的地、购票防重、崩溃恢复、
//       三阶段旅行、AI 失败重试与在途作废、主动放弃不自动退票、旅行明信片与筛选、
//       同行上下文 4 种新事件、旧档迁移、备份恢复与多层 popstate 返回）。
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

function createV24Harness(opts) {
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
  let forceStorageFailKey = null;
  let reducedMotion = Boolean(opts.reducedMotion);

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
        const k = obj.key !== undefined ? obj.key : obj.id;
        if (isConfig && forceStorageFail && (!forceStorageFailKey || forceStorageFailKey === k)) {
          throw new Error('QUOTA_EXCEEDED_DB');
        }
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
        if (forceStorageFail && (!forceStorageFailKey || forceStorageFailKey === k)) {
          throw new Error('QUOTA_EXCEEDED_LS');
        }
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
    setStorageFail(flag, targetKey) {
      forceStorageFail = Boolean(flag);
      forceStorageFailKey = flag && targetKey ? String(targetKey) : null;
    }
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

async function setCoinsExact(win, target) {
  const cur = (await win.SharedEconomyService.getState()).coins;
  if (cur > target) await win.SharedEconomyService.spendCoins(cur - target, '测试余额调减', 'test');
  else if (cur < target) await win.SharedEconomyService.addCoins(target - cur, '测试余额补足', 'test');
}

async function runTests() {
  const cssCode = fs.readFileSync(path.join(__dirname, '../css/wanxiang-mirror.css'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const dataCode = fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8');

  // ----------------------------------------------------
  // [1] V2.4 静态资源、九大地点全部开放状态、中置弹窗与复古时刻牌
  // ----------------------------------------------------
  console.log('\n[1] V2.4 静态资源、九大地点全开放与星愿列车站居中弹窗 UI');
  check(
    /css\/wanxiang-mirror\.css\?v=(2\.4|3\.\d+)\.\d+/.test(indexHtml) &&
    /js\/wanxiang-mirror\.js\?v=(2\.4|3\.\d+)\.\d+/.test(indexHtml),
    'index.html 已升级至 V2.4+/V3.x 资源版本参数'
  );
  check(
    cssCode.includes('.wx-station-banner') &&
    cssCode.includes('.wx-timetable') &&
    cssCode.includes('.wx-dest-cards') &&
    cssCode.includes('.wx-ticket-card') &&
    cssCode.includes('.wx-train-window') &&
    cssCode.includes('.wx-postcard-card') &&
    cssCode.includes('@media (max-width: 374px)') &&
    cssCode.includes('@media (prefers-reduced-motion: reduce)'),
    'css/wanxiang-mirror.css 具备 V2.4 车站/时刻牌/车窗/明信片样式及 320px/reduced-motion 适配'
  );
  check(
    dataCode.includes("configPrefixes: ['wanxiang_mirror_'") &&
    dataCode.includes("localPrefixes: ['wanxiang_mirror_'"),
    'js/data.js 自动覆盖 V2.4 新增 wanxiang_mirror_station_v24 与 wanxiang_mirror_journeys_v24'
  );

  {
    const h = createV24Harness();
    const { win } = h;
    await win.WanxiangMirror.open();
    const allLocs = win.WanxiangMirror.LOCATIONS;
    const nonePlaceholder = allLocs.every(l => l.status !== 'placeholder');
    const stLoc = win.WanxiangMirror.getLocationById('starwish_station');
    check(
      allLocs.length === 9 && nonePlaceholder &&
      stLoc && stLoc.status === 'available' && stLoc.openLabel === '已开放',
      '万象镜九大地点全部开放或可交互，starwish_station 状态切换为 available（已开放）'
    );

    await win.WanxiangMirror.openLocationSheet('starwish_station', 'intro');
    const page = h.getPage();
    const stCta = page.querySelector('.wx-btn-primary');
    check(stCta && !stCta.disabled, '星愿列车站卡片主 CTA 可点击进入车站大厅');

    await stCta.dispatchEvent({ type: 'click', target: stCta });
    const sheetEl = page.querySelector('#wx-sheet');
    const sheetTxt = sheetEl.textContent;
    check(
      win.WanxiangMirror.getRuntimeSnapshot().sheetSubView === 'station' &&
      sheetTxt.includes('复古车站时刻牌') &&
      sheetTxt.includes('随时出发') &&
      page.querySelectorAll('.wx-dest-card').length === 4 &&
      Boolean(page.querySelector('[data-wx-station-view="tickets"]')) &&
      Boolean(page.querySelector('[data-wx-action="open-char-chat"]')) &&
      Boolean(page.querySelector('[data-wx-action="close-sheet"]')),
      '车站大厅采用居中弹窗并包含氛围时刻牌、4 个目的地卡片与底部三按钮'
    );
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [2] 购票风控：需选 Char、确认弹窗取消 0 扣费、余额不足、requestId 幂等、并发与崩溃补偿
  // ----------------------------------------------------
  console.log('\n[2] 购票扣费风控、requestId 幂等、并发抢购、存储失败退款与崩溃防重退');
  {
    const h = createV24Harness();
    const { win } = h;
    await win.db.characters.put({ id: 101, nick: '林栖', name: '林栖' });

    // 未选 Char 时禁止隐式绑定
    const noCharBuy = await win.WanxiangMirror.purchaseTrainTicketAndStartJourney({
      destinationId: 'sakura_valley',
      requestId: 'buy_no_char'
    });
    check(noCharBuy.ok === false && noCharBuy.reason === 'no_char', '未选择同行 Char 时不隐式指定角色并禁止购票');

    // 余额不足 30 时阻止扣费且不产生负余额
    await setCoinsExact(win, 20);
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '101' });
    const lowCoinsBuy = await win.WanxiangMirror.purchaseTrainTicketAndStartJourney({
      destinationId: 'sakura_valley',
      charId: '101',
      requestId: 'buy_low_coins'
    });
    check(
      lowCoinsBuy.ok === false && lowCoinsBuy.reason === 'insufficient_coins' &&
      (await win.SharedEconomyService.getState()).coins === 20,
      '金币不足 30 时阻止购票并保持余额非负（20 币）'
    );

    // 充值 50 币 -> 测试确认弹窗取消零扣费 & 并发两笔抢购仅成功一笔
    await setCoinsExact(win, 50);
    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('starwish_station', 'station');
    const page = h.getPage();
    await page.querySelector('[data-wx-station-buy="sakura_valley"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-station-buy="sakura_valley"]')
    });
    check(win.WanxiangMirror.getRuntimeSnapshot().confirmOpen === true, '点击购票先弹出 Layer 5 二次确认框');
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-confirm-close]')
    });
    check((await win.SharedEconomyService.getState()).coins === 50, '取消购票确认框零扣费、零发票');

    // 并发 2 次购票仅允许 1 次真实扣 30 币，剩 20 币
    const [race1, race2] = await Promise.all([
      win.WanxiangMirror.purchaseTrainTicketAndStartJourney({ destinationId: 'sakura_valley', charId: '101', requestId: 'tr_race_1' }),
      win.WanxiangMirror.purchaseTrainTicketAndStartJourney({ destinationId: 'moonlight_coast', charId: '101', requestId: 'tr_race_2' })
    ]);
    const ecoAfterRace = await win.SharedEconomyService.getState();
    check(
      race1.ok && race2.ok && race2.resumed === true && ecoAfterRace.coins === 20 &&
      (await win.WanxiangMirror.loadJourneysState()).tickets.length === 1,
      '并发购票同一 Char 仅扣费 1 次（30 币）并生成 1 张车票，其余自动接续'
    );

    // 同 requestId 重放绝对幂等
    const dupBuy = await win.WanxiangMirror.purchaseTrainTicketAndStartJourney({
      destinationId: 'sakura_valley', charId: '101', requestId: 'tr_race_1'
    });
    check(
      dupBuy.ok && dupBuy.idempotent === true && (await win.SharedEconomyService.getState()).coins === 20,
      '同一 requestId 重放购票绝不重复扣费与发票'
    );

    // 新建独立沙盒测：存储写入失败单次退款 & 退款入账后标记未落盘崩溃防双倍退款
    const hFail = createV24Harness();
    await hFail.win.db.characters.put({ id: 102, nick: '沈知行', name: '沈知行' });
    await setCoinsExact(hFail.win, 60);
    await hFail.win.WanxiangMirror.saveMirrorState({ activeCharId: '102' });
    hFail.win.setStorageFail(true, hFail.win.WanxiangMirror.STORAGE_KEYS.JOURNEYS_V24);
    const failSaveBuy = await hFail.win.WanxiangMirror.purchaseTrainTicketAndStartJourney({
      destinationId: 'cloud_town', charId: '102', requestId: 'tr_fail_save'
    });
    hFail.win.setStorageFail(false);
    const coinsAfterStorageFail = (await hFail.win.SharedEconomyService.getState()).coins;

    // 重放刚才崩溃/失败的 requestId（即使 journeys_v24 尚未落盘任何 processedRequests，共享账本已有 [tx:] 与 [ref:]）
    const hFailReload = createV24Harness();
    for (const [k, v] of hFail.charMap.entries()) hFailReload.charMap.set(k, JSON.parse(JSON.stringify(v)));
    for (const [k, v] of hFail.configMap.entries()) await hFailReload.configMap.set(k, JSON.parse(JSON.stringify(v)));
    for (const [k, v] of hFail.storageMap.entries()) hFailReload.storageMap.set(k, v);
    const replayFailCrash = await hFailReload.win.WanxiangMirror.purchaseTrainTicketAndStartJourney({
      destinationId: 'cloud_town', charId: '102', requestId: 'tr_fail_save'
    });
    const coinsAfterCrashReplay = (await hFailReload.win.SharedEconomyService.getState()).coins;

    check(
      failSaveBuy.ok === false && failSaveBuy.refunded === true && coinsAfterStorageFail === 60 &&
      replayFailCrash.refunded === true && replayFailCrash.refundExecuted === false && coinsAfterCrashReplay === 60,
      '购票状态落盘失败自动退还 30 币，重启后重放同 requestId 不重复扣费也不二次退款'
    );
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [3] 4 大目的地独立叙事、三阶段流程、AI 失败重试、断点续接与主动放弃不退票
  // ----------------------------------------------------
  console.log('\n[3] 4 个目的地三阶段剧情、非 AI / AI 重试、退出续接、主动放弃与未支付保护');
  {
    const h = createV24Harness();
    const { win } = h;
    await win.db.characters.put({ id: 201, nick: '顾屿', name: '顾屿', personality: '冷静温柔' });
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '201' });

    const dests = win.WanxiangMirror.TRAIN_DESTINATIONS;
    const distinctIds = new Set(dests.map(d => d.id));
    const distinctPrompts = new Set(dests.map(d => d.stage2.prompt + '|' + d.stage3.prompt));
    check(
      dests.length === 4 && distinctIds.size === 4 && distinctPrompts.size === 4 &&
      ['sakura_valley', 'moonlight_coast', 'starry_observatory', 'cloud_town'].every(id => distinctIds.has(id)),
      '4 个目的地拥有独立 ID、主题与专属三阶段旅行剧本'
    );

    // 测未购票 / 未完成三阶段禁止直接完成旅程
    const unPaidComplete = await win.WanxiangMirror.completeTrainJourney('jrn_fake_unpaid', 'unpaid_fin');
    check(unPaidComplete.ok === false, '未购票伪造 journeyId 禁止结算完成');

    await setCoinsExact(win, 120);
    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('starwish_station', 'station');
    const page = h.getPage();

    // 购票去星眠天文台 -> 120 - 30 = 90 币
    let stageAiFail = true;
    win.callAI = async () => {
      if (stageAiFail) throw new Error('STATION_AI_DOWN');
      return '夜空中那道流星划过的时候，我恰好看着同一方向。';
    };
    await page.querySelector('[data-wx-station-buy="starry_observatory"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-station-buy="starry_observatory"]')
    });
    await page.querySelector('[data-wx-confirm-exec]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-confirm-exec]')
    });
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-confirm-close]')
    });
    let js = await win.WanxiangMirror.loadJourneysState();
    const j1 = js.activeJourneysByChar['201'];
    check(
      Boolean(j1) && j1.destinationId === 'starry_observatory' &&
      (await win.SharedEconomyService.getState()).coins === 90,
      '购票成功扣费 30 金币并生成绑定票据的星眠天文台旅程'
    );

    // 未选当前阶段互动时禁止提前完结
    const earlyFin = await win.WanxiangMirror.completeTrainJourney(j1.journeyId, 'early_fin');
    check(earlyFin.ok === false && earlyFin.reason === 'incomplete_stages', '未经历完 3 个阶段禁止结算完成');

    // 第 1 阶段 AI 失败展示自然兜底且提供单阶段重试
    await page.querySelector('[data-wx-train-choice="A"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-train-choice="A"]')
    });
    js = await win.WanxiangMirror.loadJourneysState();
    const retryStg1 = page.querySelector('[data-wx-retry-train-ai="' + j1.journeyId + '"]');
    check(
      js.activeJourneysByChar['201'].stageReplies.stage1.aiFailed === true &&
      Boolean(retryStg1) &&
      (await win.SharedEconomyService.getState()).coins === 90,
      '第 1 阶段 AI 失败不扣费、不卡死、不丢失进度，并提供单阶段重试按钮'
    );

    // 重试第 1 阶段 AI 成功并推进到第 2 阶段 -> 退出再重进不重扣
    stageAiFail = false;
    await retryStg1.dispatchEvent({ type: 'click', target: retryStg1 });
    js = await win.WanxiangMirror.loadJourneysState();
    check(
      js.activeJourneysByChar['201'].stageReplies.stage1.aiFailed === false &&
      js.activeJourneysByChar['201'].stageReplies.stage1.text.includes('流星'),
      '单阶段重试 AI 回应成功补充该阶段角色台词'
    );

    await page.querySelector('[data-wx-train-next="' + j1.journeyId + '"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-train-next="' + j1.journeyId + '"]')
    });
    await win.WanxiangMirror.closeSheetOnly();
    await win.WanxiangMirror.openLocationSheet('starwish_station', 'station');
    await page.querySelector('[data-wx-action="station-resume-journey"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-action="station-resume-journey"]')
    });
    check(
      (await win.WanxiangMirror.loadJourneysState()).activeJourneysByChar['201'].currentStage === 2 &&
      (await win.SharedEconomyService.getState()).coins === 90 &&
      page.querySelector('#wx-sheet').textContent.includes('第二阶段'),
      '第 2 阶段退出并重进星愿列车站可接续未完成旅程，绝不二次扣费'
    );

    // 走完第 2、3 阶段抵达终点站
    await page.querySelector('[data-wx-train-choice="B"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-train-choice="B"]')
    });
    await page.querySelector('[data-wx-train-next="' + j1.journeyId + '"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-train-next="' + j1.journeyId + '"]')
    });
    await page.querySelector('[data-wx-train-choice="C"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-train-choice="C"]')
    });
    await page.querySelector('[data-wx-train-finish="' + j1.journeyId + '"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-train-finish="' + j1.journeyId + '"]')
    });
    check(
      page.querySelector('#wx-sheet').textContent.includes('是否收藏这趟旅行的明信片') &&
      Boolean(page.querySelector('[data-wx-action="station-skip-postcard"]')) &&
      Boolean(page.querySelector('[data-wx-save-train-postcard="' + j1.journeyId + '"]')),
      '完成第 3 阶段抵达终点后弹出非强制旅行明信片收藏提示'
    );

    // 测主动提前放弃旅程：弹警告确认框 + 不自动退款 + 票据状态改为 abandoned
    await page.querySelector('[data-wx-action="station-skip-postcard"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-action="station-skip-postcard"]')
    });
    await page.querySelector('[data-wx-station-buy="cloud_town"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-station-buy="cloud_town"]')
    });
    await page.querySelector('[data-wx-confirm-exec]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-confirm-exec]')
    });
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-confirm-close]')
    });
    // 目前余额 90 - 30 = 60 币，点击放弃 -> 仍为 60 币，不自动退票
    await page.querySelector('[data-wx-action="station-abandon-ask"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-action="station-abandon-ask"]')
    });
    const warnTxt = page.querySelector('#wx-confirm-card').textContent;
    await page.querySelector('[data-wx-confirm-exec]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-confirm-exec]')
    });
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-confirm-close]')
    });
    js = await win.WanxiangMirror.loadJourneysState();
    check(
      warnTxt.includes('不自动退还') &&
      !js.activeJourneysByChar['201'] &&
      js.abandonedJourneys.length === 1 &&
      js.tickets[0].status === 'abandoned' &&
      (await win.SharedEconomyService.getState()).coins === 60,
      '用户主动提前结束旅程经明确确认提示、不自动退款、且正确记录为已提前结束'
    );
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [4] 多 Char 严格隔离 & 切角作废在途 AI 请求
  // ----------------------------------------------------
  console.log('\n[4] 多 Char 旅程/车票隔离与切角在途 AI 请求作废');
  {
    const h = createV24Harness();
    const { win } = h;
    await win.db.characters.put({ id: 301, nick: 'CharA', name: 'CharA' });
    await win.db.characters.put({ id: 302, nick: 'CharB', name: 'CharB' });
    await setCoinsExact(win, 200);
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '301' });

    const buyA = await win.WanxiangMirror.purchaseTrainTicketAndStartJourney({
      destinationId: 'moonlight_coast', charId: '301', requestId: 'iso_buy_a'
    });
    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('starwish_station', 'station');
    const page = h.getPage();

    // 切换至 Char B
    await win.WanxiangMirror.openLocationSheet('starwish_station', 'charPicker');
    let resolveLateAi;
    win.callAI = () => new Promise(res => { resolveLateAi = res; });
    const lateReq = win.WanxiangMirror.requestCharReaction({ locationName: '星愿列车站', actionDesc: '等迟到回应' });
    await new Promise(r => setTimeout(r, 10));
    await page.querySelector('[data-wx-pick-char="302"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-pick-char="302"]')
    });
    resolveLateAi('旧 Char A 的迟到台词');
    const lateRes = await lateReq;
    win.callAI = async () => '换乘这趟风也挺好的。';

    await page.querySelector('[data-wx-action="enter-location"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-action="enter-location"]')
    });
    const sheetForB = page.querySelector('#wx-sheet').textContent;
    const mismatchChoice = await win.WanxiangMirror.chooseTrainStageOption(buyA.journey.journeyId, 1, 'A', 'bad_cross_char');

    // 切回 Char A 恢复
    await win.WanxiangMirror.openLocationSheet('starwish_station', 'charPicker');
    await page.querySelector('[data-wx-pick-char="301"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-pick-char="301"]')
    });
    await page.querySelector('[data-wx-action="enter-location"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-action="enter-location"]')
    });
    const sheetForA = page.querySelector('#wx-sheet').textContent;

    check(
      lateRes.ok === false && lateRes.aborted === true &&
      !sheetForB.includes('有一趟未完成的旅程') &&
      mismatchChoice.ok === false && mismatchChoice.reason === 'char_mismatch' &&
      sheetForA.includes('有一趟未完成的旅程') && sheetForA.includes('月光海岸'),
      '切角立即作废旧 Char 在途 AI，不展示其它 Char 旅程且切回后无损恢复'
    );
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [5] 旅行明信片：预设/自定义安全转义、按 journeyId 去重、留影页主/子筛选与 4 项同行事件 + 零篡改记忆
  // ----------------------------------------------------
  console.log('\n[5] 旅行明信片安全防重、留影筛选兼容与 4 项同行上下文隔离');
  {
    const h = createV24Harness();
    const { win } = h;
    await win.db.characters.put({ id: 401, nick: '江暮', name: '江暮' });
    await win.db.characters.put({ id: 402, nick: '陆离', name: '陆离' });
    await setCoinsExact(win, 200);
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '401' });

    // 先保存旧 V2.0/V2.2 纪念确保新版本筛选不丢失旧分类
    await win.WanxiangMirror.saveCafeMemento('咖啡馆旧记录');

    // 完成一趟「樱雾花谷」+ 一趟「月光海岸」
    const jSakura = await win.WanxiangMirror.purchaseTrainTicketAndStartJourney({
      destinationId: 'sakura_valley', charId: '401', requestId: 'pc_sakura'
    });
    await win.WanxiangMirror.chooseTrainStageOption(jSakura.journey.journeyId, 1, 'A', 'ps1');
    await win.WanxiangMirror.advanceTrainStage(jSakura.journey.journeyId);
    await win.WanxiangMirror.chooseTrainStageOption(jSakura.journey.journeyId, 2, 'B', 'ps2');
    await win.WanxiangMirror.advanceTrainStage(jSakura.journey.journeyId);
    await win.WanxiangMirror.chooseTrainStageOption(jSakura.journey.journeyId, 3, 'C', 'ps3');
    await win.WanxiangMirror.completeTrainJourney(jSakura.journey.journeyId, 'pfin1');

    const jMoon = await win.WanxiangMirror.purchaseTrainTicketAndStartJourney({
      destinationId: 'moonlight_coast', charId: '401', requestId: 'pc_moon'
    });
    await win.WanxiangMirror.chooseTrainStageOption(jMoon.journey.journeyId, 1, 'B', 'pm1');
    await win.WanxiangMirror.advanceTrainStage(jMoon.journey.journeyId);
    await win.WanxiangMirror.chooseTrainStageOption(jMoon.journey.journeyId, 2, 'A', 'pm2');
    await win.WanxiangMirror.advanceTrainStage(jMoon.journey.journeyId);
    await win.WanxiangMirror.chooseTrainStageOption(jMoon.journey.journeyId, 3, 'C', 'pm3');
    await win.WanxiangMirror.completeTrainJourney(jMoon.journey.journeyId, 'pfin2');

    // 收藏明信片：测试 XSS/长文本清洗 & 按 journeyId 去重
    const pc1 = await win.WanxiangMirror.saveTrainPostcardMemento({
      journeyId: jSakura.journey.journeyId,
      customMessage: '<script>alert(1)</script>春天樱花雨的这趟车真好呀'
    });
    const pc1Dup = await win.WanxiangMirror.saveTrainPostcardMemento({
      journeyId: jSakura.journey.journeyId,
      customMessage: '试图重复保存第二张'
    });
    const pc2 = await win.WanxiangMirror.saveTrainPostcardMemento({
      journeyId: jMoon.journey.journeyId,
      presetMessage: win.WanxiangMirror.TRAIN_CONFIG.presetMessages[1]
    });

    check(
      pc1.ok && !pc1.duplicate && pc1Dup.duplicate === true &&
      !pc1.memento.postcardMessage.includes('<script>') &&
      pc2.ok && !pc2.duplicate,
      '旅行明信片安全过滤危险字符、按 journeyId 严格去重'
    );

    // 检查 4 项同行上下文事件 & Char 隔离 & 零篡改 db.memories
    const ctx401 = await win.WanxiangMirror.getCompanionContextForChar('401', 10);
    const ctx402 = await win.WanxiangMirror.getCompanionContextForChar('402', 10);
    const evTypes = new Set(ctx401.map(e => e.eventType));
    check(
      evTypes.has('train_ticket_purchased') &&
      evTypes.has('train_journey_started') &&
      evTypes.has('train_journey_completed') &&
      evTypes.has('train_postcard_saved') &&
      ctx402.length === 0 &&
      h.memoriesMap.size === 0,
      '4 项列车同行上下文事件写入并与 Char 隔离，零修改 db.memories'
    );

    // 验证全屏「留影」页新增「旅行明信片」与 4 个目的地子筛选，且保留旧咖啡馆分类
    await win.WanxiangMirror.open({ tab: 'mementos' });
    const page = h.getPage();
    await page.querySelector('[data-wx-mem-filter="starwish_train"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-mem-filter="starwish_train"]')
    });
    check(page.querySelectorAll('[data-wx-train-dest]').length === 5,
      '「旅行明信片」主筛选下展示全部站点及 4 个目的地子筛选');

    await page.querySelector('[data-wx-train-dest="moonlight_coast"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-train-dest="moonlight_coast"]')
    });
    const moonListEl = page.querySelector('#wx-subpage').querySelector('.wx-list');
    const moonSubTxt = moonListEl ? moonListEl.textContent : '';
    await page.querySelector('[data-wx-mem-filter="cafe_photo"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-mem-filter="cafe_photo"]')
    });
    const cafeTxt = page.querySelector('#wx-subpage').textContent;
    check(
      moonSubTxt.includes('月光海岸') && !moonSubTxt.includes('樱雾花谷') &&
      cafeTxt.includes('咖啡馆旧记录'),
      '目的地子筛选精确过滤且保留过往版本全部留影分类'
    );
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [6] 旧档升级、备份恢复往返（含未完成与已完成旅程）与多层 Android popstate 返回
  // ----------------------------------------------------
  console.log('\n[6] V2.0-V2.3 旧档迁移、备份恢复往返与 Android popstate 返回链');
  {
    const h = createV24Harness();
    const { win, configMap, storageMap } = h;
    await win.db.characters.put({ id: 501, nick: '顾言', name: '顾言' });
    await configMap.set('shared_economy_state_v2', {
      key: 'shared_economy_state_v2',
      value: { coins: 777, diamonds: 9, inventory: [{ itemId: 'item_vinyl', name: '复古黑胶唱机', count: 1 }], logs: [] }
    });
    await configMap.set('wanxiang_mirror_state_v1', {
      key: 'wanxiang_mirror_state_v1',
      value: { schemaVersion: 2, timePreview: 'day', activeCharId: '501', visitedLocations: { starlight_park: 100 } }
    });

    await win.WanxiangMirror.open();
    const initSt = await win.WanxiangMirror.loadStationState();
    const initJrn = await win.WanxiangMirror.loadJourneysState();
    check(
      (await win.SharedEconomyService.getState()).coins === 777 &&
      Object.keys(initJrn.activeJourneysByChar).length === 0 &&
      initSt.schemaVersion === 24,
      'V2.0-V2.3 旧档迁移至 V2.4 保留原有金币/背包/访问记录并补齐列车站默认存储'
    );

    // 制造一笔进行中旅程并执行全量备份 -> 清空 -> 恢复 -> 重放购票与接续
    const bkBuy = await win.WanxiangMirror.purchaseTrainTicketAndStartJourney({
      destinationId: 'cloud_town', charId: '501', requestId: 'bk_tr_1'
    });
    await win.WanxiangMirror.chooseTrainStageOption(bkBuy.journey.journeyId, 1, 'A', 'bk_o1');

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

    const coinsBeforeBk = (await win.SharedEconomyService.getState()).coins;
    const replayBk = await win.WanxiangMirror.purchaseTrainTicketAndStartJourney({
      destinationId: 'cloud_town', charId: '501', requestId: 'bk_tr_1'
    });
    const jsAfterBk = await win.WanxiangMirror.loadJourneysState();
    check(
      replayBk.idempotent === true &&
      (await win.SharedEconomyService.getState()).coins === coinsBeforeBk &&
      jsAfterBk.activeJourneysByChar['501'] &&
      jsAfterBk.activeJourneysByChar['501'].choices.stage1.choiceId === 'A',
      '备份清空恢复后完整保留进行中列车阶段与车票，且重放旧 requestId 不重复扣费'
    );

    // 验证 Android popstate 多层返回：confirm -> journey -> station hub -> intro -> map -> desktop
    const page = h.getPage();
    await win.WanxiangMirror.openLocationSheet('starwish_station', 'intro');
    await page.querySelector('[data-wx-action="enter-location"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-action="enter-location"]')
    });
    await page.querySelector('[data-wx-action="station-resume-journey"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-action="station-resume-journey"]')
    });
    await page.querySelector('[data-wx-action="station-abandon-ask"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-action="station-abandon-ask"]')
    });
    check(
      win.WanxiangMirror.getRuntimeSnapshot().confirmOpen === true &&
      win.WanxiangMirror.getRuntimeSnapshot().stationView === 'journey',
      '已进入列车行程页且弹出 Layer 5 确认层'
    );

    await win.triggerWindowEvent('popstate');
    check(win.WanxiangMirror.getRuntimeSnapshot().confirmOpen === false, '第 1 次 popstate 关闭最顶层确认框');
    await win.triggerWindowEvent('popstate');
    check(win.WanxiangMirror.getRuntimeSnapshot().stationView === 'hub', '第 2 次 popstate 从列车车厢退回车站大厅');
    await win.triggerWindowEvent('popstate');
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetSubView === 'intro', '第 3 次 popstate 从车站大厅退回列车站简介卡');
    await win.triggerWindowEvent('popstate');
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetOpen === false && Boolean(h.getPage()), '第 4 次 popstate 关闭弹窗回到小镇地图');
    await win.triggerWindowEvent('popstate');
    check(h.getPage() === null, '第 5 次 popstate 退出万象镜回到桌面');
  }

  console.log('\n====================================');
  console.log('V2.4 测试汇总: 通过 ' + passed + ' 项, 失败 ' + failed + ' 项');
  console.log('====================================');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
