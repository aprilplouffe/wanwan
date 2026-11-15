// scripts/test-wanxiang-mirror-v21.cjs
// 弯弯小手机｜万象镜 V2.1 自动化验收测试（Node 模拟 DOM 与回归校验）
// 说明：本测试在 Node 模拟 DOM 环境中验证 V2.1 CSS 规则、状态机、交互层治理、
//       防穿透/防连点、多层级返回键、Char 互动面板、动画/异步作废与数据兼容。
//       不替代真实浏览器与 Android 真机视觉/触摸验收。

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

function createV21Harness() {
  const storageMap = new Map();
  const configMap = new Map();
  const charMap = new Map();
  const memoriesMap = new Map();
  const winListeners = {};
  const historyStack = [];
  const toasts = [];
  let rootBodyChildren = [];
  let delayNextPurchaseMs = 0;

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

  function makeTable(map, idGen) {
    return {
      async get(k) { return map.has(k) ? JSON.parse(JSON.stringify(map.get(k))) : undefined; },
      async put(obj) {
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
    config: makeTable(configMap),
    characters: makeTable(charMap),
    memories: makeTable(memoriesMap, () => memSeq++),
    transaction(mode, tables, fn) { return fn(); }
  };

  const sandboxWindow = {
    localStorage: {
      getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null; },
      setItem(k, v) { storageMap.set(k, String(v)); },
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
    matchMedia() { return { matches: false }; },
    setDelayNextConfigPut(ms) { delayNextPurchaseMs = ms; }
  };
  sandboxWindow.window = sandboxWindow;

  const sharedHubCode = fs.readFileSync(path.join(__dirname, '../js/shared-hub.js'), 'utf8');
  const mirrorCode = fs.readFileSync(path.join(__dirname, '../js/wanxiang-mirror.js'), 'utf8');

  const loader = new Function(
    'window', 'document', 'localStorage', 'db', 'console', 'setTimeout', 'clearTimeout',
    sharedHubCode + '\n' + mirrorCode
  );
  loader(sandboxWindow, mockDoc, sandboxWindow.localStorage, mockDb, console, setTimeout, clearTimeout);

  // Wrap SharedEconomyService.spendCoins cleanly if delay requested
  const origSpend = sandboxWindow.SharedEconomyService.spendCoins.bind(sandboxWindow.SharedEconomyService);
  sandboxWindow.SharedEconomyService.spendCoins = async function(amount, reason, source) {
    if (delayNextPurchaseMs > 0) {
      const ms = delayNextPurchaseMs;
      delayNextPurchaseMs = 0;
      await new Promise(r => setTimeout(r, ms));
    }
    return await origSpend(amount, reason, source);
  };

  return {
    win: sandboxWindow,
    configMap,
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

  console.log('\n[1] V2.1 CSS 与静态资源适配验收');
  check(/css\/wanxiang-mirror\.css\?v=(2|3)\.\d+\.\d+/.test(indexHtml) && /js\/wanxiang-mirror\.js\?v=(2|3)\.\d+\.\d+/.test(indexHtml),
    'index.html 已具备 V2.x/V3.x 资源版本参数');
  check(cssCode.includes('align-items: center;') && cssCode.includes('justify-content: center;') && cssCode.includes('width: min(90vw, 430px);'),
    '主弹窗改为居中游戏对话框（不再是底部半屏滑出 Sheet）');
  check(cssCode.includes('max(8px, var(--wx-top-safe))') && cssCode.includes('var(--android-bottom-inset'),
    '顶部采用 max(8px, var(--wx-top-safe)) 不叠加双重边距，底部适配 Android 手势/三键安全区');
  check(cssCode.includes('height: 100dvh;') && cssCode.includes('@media (max-width: 374px)') && cssCode.includes('@media (orientation: landscape) and (max-height: 520px)'),
    '具备 100dvh、320px 小屏与横屏双栏响应式样式规则');
  check(cssCode.includes('@media (prefers-reduced-motion: reduce)'),
    '支持 prefers-reduced-motion 减少动态效果');
  check(cssCode.includes('.wx-map-stage.is-dimmed') && cssCode.includes('pointer-events: none;'),
    '中置弹窗开启时地图画布自动降权禁用指针交互');

  console.log('\n[2] 九大地点卡片统一骨架、真实地图裁切插画与未开放边界');
  {
    const h = createV21Harness();
    const { win } = h;
    await win.SharedEconomyService.addCoins(500, '测试初始币', 'system');
    const page = await win.WanxiangMirror.open();
    const hotspots = page.querySelectorAll('.wx-hotspot');
    check(hotspots.length === 9, '地图挂载全部 9 个建筑热区');

    const locIds = win.WanxiangMirror.LOCATIONS.map(l => l.id);
    let allHeroesOk = true;
    let placeholdersStrict = true;
    for (const lid of locIds) {
      await win.WanxiangMirror.openLocationSheet(lid);
      const sheet = page.querySelector('#wx-sheet');
      const backdrop = page.querySelector('#wx-sheet-backdrop');
      const stage = page.querySelector('#wx-map-stage');
      const hero = sheet.querySelector('.wx-card-hero');
      const titleEl = sheet.querySelector('.wx-sheet-title');
      if (!backdrop.classList.contains('is-open') || !stage.classList.contains('is-dimmed') || !hero || !titleEl) {
        allHeroesOk = false;
      }
      const locMeta = win.WanxiangMirror.getLocationById(lid);
      if (locMeta.status === 'placeholder') {
        const primary = sheet.querySelector('.wx-btn-primary');
        const bodyTxt = sheet.textContent;
        if (!primary || !primary.disabled || !bodyTxt.includes('敬请期待') || !bodyTxt.includes('未来预告')) {
          placeholdersStrict = false;
        }
      }
    }
    check(allHeroesOk, '全部 9 个地点统一开启居中弹窗、地图背景虚化降权及同源地图裁切插画');
    check(placeholdersStrict, '未开放占位地点明确展示“敬请期待”与未来预告，主 CTA 置灰禁用');

    // 验证地图穿透拦截：弹窗开启时点击底部热区不会切地点、拖拽不会位移
    await win.WanxiangMirror.openLocationSheet('shopping_street');
    const beforeTx = win.WanxiangMirror.getRuntimeSnapshot().mapTransform.x;
    const stageEl = page.querySelector('#wx-map-stage');
    await stageEl.dispatchEvent({ type: 'pointerdown', pointerId: 1, clientX: 100, clientY: 100 });
    await stageEl.dispatchEvent({ type: 'pointermove', pointerId: 1, clientX: 200, clientY: 200 });
    await stageEl.dispatchEvent({ type: 'pointerup', pointerId: 1, clientX: 200, clientY: 200 });
    const plazaSpot = page.querySelector('[data-loc-id="mirror_plaza"]');
    await stageEl.dispatchEvent({ type: 'click', target: plazaSpot });
    const snapAfter = win.WanxiangMirror.getRuntimeSnapshot();
    check(snapAfter.sheetLocationId === 'shopping_street' && snapAfter.mapTransform.x === beforeTx,
      '弹窗开启时地图点击与拖动完全被拦截，不发生后台误触或漂移');
  }

  console.log('\n[3] 购买 / 赠礼 / 点单 / 扭蛋 二次确认与结果展示（防取消扣费 & 防连点）');
  {
    const h = createV21Harness();
    const { win } = h;
    await win.db.characters.put({ id: 1, name: '夏知意', personality: '元气开朗' });
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '1' });
    await win.SharedEconomyService.addCoins(600, '消费测试', 'system');
    const initEco = await win.SharedEconomyService.getState();
    const initCoins = initEco.coins;
    const initSticky = (initEco.inventory.find(i => i.itemId === 'item_sticky_notes') || {}).count || 0;
    const page = await win.WanxiangMirror.open();

    // 3a. 商店购买：点击商品 -> 打开确认弹层 -> 取消不扣费 -> 再次确认锁定防连点 -> 结果卡片
    await win.WanxiangMirror.openLocationSheet('shopping_street', 'shop');
    const buyBtn = page.querySelector('[data-wx-buy-good="item_sticky_notes"]'); // 60币
    await buyBtn.dispatchEvent({ type: 'click', target: buyBtn });
    check(win.WanxiangMirror.getRuntimeSnapshot().confirmOpen === true, '点击购买先弹出 Layer 5 购买确认框');

    const cancelBtn = page.querySelector('[data-wx-confirm-close]');
    await cancelBtn.dispatchEvent({ type: 'click', target: cancelBtn });
    let eco = await win.SharedEconomyService.getState();
    const afterCancelSticky = (eco.inventory.find(i => i.itemId === 'item_sticky_notes') || {}).count || 0;
    check(eco.coins === initCoins && afterCancelSticky === initSticky && !win.WanxiangMirror.getRuntimeSnapshot().confirmOpen,
      '取消购买确认框后零扣费、零入包');

    // 触发购买并模拟连点两次确认按钮
    await buyBtn.dispatchEvent({ type: 'click', target: buyBtn });
    win.setDelayNextConfigPut(25);
    const execBtn = page.querySelector('[data-wx-confirm-exec]');
    const p1 = execBtn.dispatchEvent({ type: 'click', target: execBtn });
    const p2 = execBtn.dispatchEvent({ type: 'click', target: execBtn });
    await Promise.all([p1, p2]);
    eco = await win.SharedEconomyService.getState();
    const stickyCount = (eco.inventory.find(i => i.itemId === 'item_sticky_notes') || {}).count || 0;
    const confirmCardText = page.querySelector('#wx-confirm-card').textContent;
    check(eco.coins === initCoins - 60 && stickyCount === initSticky + 1 && confirmCardText.includes('购买成功'),
      '确认购买并发连点仅扣费 1 次 (-60) 并展示购买成功结果卡');

    // 关闭结果卡
    const ackBtn = page.querySelector('[data-wx-confirm-close]');
    await ackBtn.dispatchEvent({ type: 'click', target: ackBtn });
    check(win.WanxiangMirror.getRuntimeSnapshot().confirmOpen === false, '点击“知道了”关闭结果层');

    // 3b. 赠礼二次确认（消耗刚刚购入的便签纸）
    const bagTab = page.querySelector('[data-wx-shop-cat="bag"]');
    await bagTab.dispatchEvent({ type: 'click', target: bagTab });
    const giftBtn = page.querySelector('[data-wx-gift-item="item_sticky_notes"]');
    await giftBtn.dispatchEvent({ type: 'click', target: giftBtn });
    check(win.WanxiangMirror.getRuntimeSnapshot().confirmOpen === true && page.querySelector('#wx-confirm-card').textContent.includes('赠礼确认'),
      '背包点击赠予 Char 弹出赠礼确认弹层');
    await page.querySelector('[data-wx-confirm-exec]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-exec]') });
    eco = await win.SharedEconomyService.getState();
    const afterGiftSticky = (eco.inventory.find(i => i.itemId === 'item_sticky_notes') || {}).count || 0;
    check(afterGiftSticky === initSticky && page.querySelector('#wx-confirm-card').textContent.includes('赠礼完成'),
      '确认赠礼后扣除物品并显示赠礼完成结果卡');
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-close]') });

    // 3c. 咖啡馆点单二次确认（取消不扣费 -> 确认扣费）
    await win.WanxiangMirror.openLocationSheet('afternoon_cafe', 'cafe');
    const orderBtn = page.querySelector('[data-wx-cafe-order="drink:cafe_latte"]'); // 18币
    await orderBtn.dispatchEvent({ type: 'click', target: orderBtn });
    check(win.WanxiangMirror.getRuntimeSnapshot().confirmOpen === true && page.querySelector('#wx-confirm-card').textContent.includes('点单确认'),
      '咖啡馆点击饮品弹出点单确认弹层');
    await page.querySelector('[data-wx-confirm-exec]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-exec]') });
    eco = await win.SharedEconomyService.getState();
    check(eco.coins === initCoins - 60 - 18 && page.querySelector('#wx-confirm-card').textContent.includes('下单成功'),
      '咖啡馆确认点单扣费 18 币并显示下单成功结果卡');
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-close]') });

    // 3d. 扭蛋机：点击抽取 -> 确认扣费 -> 防重仅抽 1 次
    await win.WanxiangMirror.openLocationSheet('gacha_house', 'gacha');
    const drawBtn = page.querySelector('[data-wx-gacha-draw="gift"]');
    await drawBtn.dispatchEvent({ type: 'click', target: drawBtn });
    check(win.WanxiangMirror.getRuntimeSnapshot().confirmOpen === true, '扭蛋屋点击抽取弹出扣费确认层');
    const execGacha = page.querySelector('[data-wx-confirm-exec]');
    await Promise.all([
      execGacha.dispatchEvent({ type: 'click', target: execGacha }),
      execGacha.dispatchEvent({ type: 'click', target: execGacha })
    ]);
    eco = await win.SharedEconomyService.getState();
    const gs = await win.WanxiangMirror.loadGachaState();
    check(eco.coins === initCoins - 60 - 18 - 40 && gs.totalPulls === 1 && page.querySelector('#wx-confirm-card').textContent.includes('扭蛋开启'),
      '扭蛋确认并发双击仅扣 40 币抽 1 次，且显示中奖结果弹层');
  }

  console.log('\n[4] 多层级返回键治理（Confirm -> SubView -> Intro -> CloseSheet -> ExitPage）');
  {
    const h = createV21Harness();
    const { win } = h;
    await win.SharedEconomyService.addCoins(300, '测试', 'system');
    const page = await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('shopping_street', 'intro');
    const enterBtn = page.querySelector('[data-wx-action="enter-location"]');
    await enterBtn.dispatchEvent({ type: 'click', target: enterBtn });
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetSubView === 'shop' && win.WanxiangMirror.getRuntimeSnapshot().canStepBack === true,
      '进入商店街二级货架视图，canStepBack=true');

    const buyBtn = page.querySelector('[data-wx-buy-good="item_sticky_notes"]');
    await buyBtn.dispatchEvent({ type: 'click', target: buyBtn });
    check(win.WanxiangMirror.getRuntimeSnapshot().confirmOpen === true, '已打开第 5 层确认框');

    await win.triggerWindowEvent('popstate');
    let snap = win.WanxiangMirror.getRuntimeSnapshot();
    check(!snap.confirmOpen && snap.sheetOpen && snap.sheetSubView === 'shop',
      '第 1 次返回：关闭确认层，保留商店街二级货架');

    await win.triggerWindowEvent('popstate');
    snap = win.WanxiangMirror.getRuntimeSnapshot();
    check(snap.sheetOpen && snap.sheetSubView === 'intro' && !snap.canStepBack,
      '第 2 次返回：从货架子视图退回地点主卡片');

    await win.triggerWindowEvent('popstate');
    snap = win.WanxiangMirror.getRuntimeSnapshot();
    check(!snap.sheetOpen && Boolean(h.getPage()),
      '第 3 次返回：关闭主弹窗，保留万象镜地图');

    await win.triggerWindowEvent('popstate');
    check(h.getPage() === null, '第 4 次返回：退出万象镜返回小手机桌面');
  }

  console.log('\n[5] P0 Char 同行互动面板、世界书隔离、切角/关窗作废 AI、重试与打字机开关');
  {
    const h = createV21Harness();
    const { win } = h;
    await win.db.characters.put({ id: 21, name: '林栖', personality: '温和细腻' });
    await win.db.characters.put({ id: 22, name: '顾屿', personality: '清冷毒舌' });
    await win.db.config.put({
      key: 'lorebooks',
      value: [
        { id: 'lb21', scope: 'personal', charIds: [21], enabled: true, entries: [{ enabled: true, content: '林栖喜欢手冲蓝山咖啡' }] },
        { id: 'lb22', scope: 'personal', charIds: [22], enabled: true, entries: [{ enabled: true, content: '顾屿对柠檬汽水过敏' }] }
      ]
    });

    let aiAttempt = 0;
    let sawPrivate22 = false;
    win.callAI = async (msgs) => {
      aiAttempt++;
      const text = msgs[0].content;
      if (text.includes('顾屿对柠檬汽水过敏')) sawPrivate22 = true;
      if (aiAttempt === 1) throw new Error('NETWORK_FAIL');
      if (aiAttempt === 2) return '这杯饮品香气正好，陪你多坐一会儿。';
      await new Promise(r => setTimeout(r, 40));
      return '迟到的第3次回复';
    };

    await win.WanxiangMirror.saveMirrorState({ activeCharId: '21' });
    const p2 = await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('afternoon_cafe', 'intro');
    check(aiAttempt === 1 && !sawPrivate22 && p2.querySelector('#wx-sheet').textContent.includes('重试回应'),
      '首次 AI 失败时降级陪伴提示，提供“重试回应”按钮，且未读取 Char 22 世界书');

    const retryBtn = p2.querySelector('[data-wx-action="retry-char-ai"]');
    await retryBtn.dispatchEvent({ type: 'click', target: retryBtn });
    await new Promise(r => setTimeout(r, 420));
    check(aiAttempt === 2 && p2.querySelector('.wx-char-strip-quote').textContent.includes('陪你多坐一会儿'),
      '点击重试成功拉取 AI 回应并完整显示打字机气泡');

    const twBtn = p2.querySelector('[data-wx-action="toggle-typewriter"]');
    await twBtn.dispatchEvent({ type: 'click', target: twBtn });
    const uiCfg = await win.WanxiangMirror.loadUiSettings();
    check(uiCfg.typewriterEnabled === false && h.configMap.has('wanxiang_mirror_ui_v21'),
      '逐字显示开关持久化至独立设置键 wanxiang_mirror_ui_v21');

    const chatOpenBtn = p2.querySelector('[data-wx-action="open-char-chat"]');
    await chatOpenBtn.dispatchEvent({ type: 'click', target: chatOpenBtn });
    const panelHtml = p2.querySelector('#wx-sheet').innerHTML;
    check(panelHtml.includes('点单菜单') && panelHtml.includes('拍一张留影') && !panelHtml.includes('去抽扭蛋'),
      'Char 互动面板仅展示当前地点真实支持的快捷动作');

    const input = p2.querySelector('#wx-char-panel-input');
    input.value = '今天真放松';
    const sendBtn = p2.querySelector('[data-wx-action="char-panel-send"]');
    const sendP = sendBtn.dispatchEvent({ type: 'click', target: sendBtn });
    await win.WanxiangMirror.closeSheetOnly();
    await sendP;
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetOpen === false,
      '关闭弹窗后才返回的在途 AI 回复被作废，不会重新弹起弹窗');

    const pA = win.WanxiangMirror.openLocationSheet('shopping_street');
    const pB = win.WanxiangMirror.openLocationSheet('mirror_plaza');
    await Promise.all([pA, pB]);
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetLocationId === 'mirror_plaza',
      '快速连切地点时后一次请求稳定胜出，不发生旧卡片回写覆盖');
  }

  console.log('\n[6] 存档迁移、备份恢复往返与选择性删除范围校验');
  {
    const h = createV21Harness();
    const { win, configMap } = h;
    await configMap.set('shared_economy_state_v2', {
      key: 'shared_economy_state_v2',
      value: { coins: 777, diamonds: 10, inventory: [{ itemId: 'item_vinyl', name: '复古黑胶唱机', count: 1 }], logs: [] }
    });
    await configMap.set('wanxiang_mirror_state_v1', {
      key: 'wanxiang_mirror_state_v1',
      value: { schemaVersion: 2, timePreview: 'night', activeCharId: null, visitedLocations: { mirror_plaza: 12345 } }
    });
    await configMap.set('wanxiang_mirror_gacha_v1', {
      key: 'wanxiang_mirror_gacha_v1',
      value: { giftPity: 4, adventurePity: 2, totalPulls: 6, logs: [{ id: 'g1', prizeName: '干花香薰包' }], collectedEncounters: [] }
    });

    await win.WanxiangMirror.open();
    const eco = await win.SharedEconomyService.getState();
    const st = await win.WanxiangMirror.loadMirrorState();
    const gs = await win.WanxiangMirror.loadGachaState();
    const ui = await win.WanxiangMirror.loadUiSettings();
    check(eco.coins === 777 && eco.inventory[0].itemId === 'item_vinyl' && st.timePreview === 'night' && gs.giftPity === 4 && ui.typewriterEnabled === true,
      'V2.0 已有金币、背包、时段、保底存档 100% 兼容继承，V2.1 UI 设置默认安全补齐');

    const dataCode = fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8');
    check(dataCode.includes("configPrefixes: ['wanxiang_mirror_'") && dataCode.includes("localPrefixes: ['wanxiang_mirror_'"),
      'js/data.js 选择性删除与备份范围自动覆盖 V2.1 新增键 wanxiang_mirror_ui_v21');
  }

  console.log('\n====================================');
  console.log('V2.1 测试汇总: 通过 ' + passed + ' 项, 失败 ' + failed + ' 项');
  console.log('====================================');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
