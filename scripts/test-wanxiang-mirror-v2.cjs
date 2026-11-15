// scripts/test-wanxiang-mirror-v2.cjs
// 弯弯小手机｜万象镜 V2.0 自动化验收测试
// 覆盖：地图资源与4时段切换、9地点归一化热区、拖动防误触、视角保持、
// 占位边界、商店街并发/回滚/防刷、咖啡馆与留影隔离、扭蛋保底与防重、
// 多Char世界书隔离与AI切换作废、返回键弹窗优先、旧路由与备份恢复兼容。

const assert = require('assert');
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

function createHarness() {
  const storageMap = new Map();
  const configMap = new Map();
  const charMap = new Map();
  const memoriesMap = new Map();
  const winListeners = {};
  const historyStack = [];
  const toasts = [];
  let rootBodyChildren = [];
  let failConfigWriteOnce = false;

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
        const list = String(node.className || '').split(/\s+/).filter(c => c && !rm.has(c));
        node.className = list.join(' ');
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

  // Minimal HTML parser for selector queries in Node harness
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
        if (map === configMap && failConfigWriteOnce) {
          failConfigWriteOnce = false;
          throw new Error('SIMULATED_DB_PUT_ERROR');
        }
        const k = obj.key !== undefined ? obj.key : obj.id;
        map.set(k, JSON.parse(JSON.stringify(obj)));
        return k;
      },
      async bulkPut(rows) {
        for (const r of rows) await this.put(r);
      },
      async bulkDelete(keys) {
        for (const k of keys) map.delete(k);
      },
      async add(obj) {
        const c = JSON.parse(JSON.stringify(obj));
        if (!c.id && idGen) c.id = idGen();
        map.set(c.id, c);
        return c.id;
      },
      async toArray() {
        return Array.from(map.values()).map(v => JSON.parse(JSON.stringify(v)));
      }
    };
  }

  let memAutoId = 1;
  const db = {
    config: makeTable(configMap),
    characters: makeTable(charMap),
    memories: makeTable(memoriesMap, () => memAutoId++),
    async transaction(_m, _t, fn) { return await fn(); }
  };

  const g = {
    console, Date, Math, Promise, JSON, setTimeout, clearTimeout,
    document: mockDoc,
    localStorage: {
      getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null; },
      setItem(k, v) { storageMap.set(k, String(v)); },
      removeItem(k) { storageMap.delete(k); },
      key(i) { return Array.from(storageMap.keys())[i] || null; },
      get length() { return storageMap.size; }
    },
    history: {
      pushState(s, t) { historyStack.push({ s, t }); },
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
    async dispatchWindowEvent(type, ev) {
      const list = (winListeners[type] || []).slice();
      for (const fn of list) await fn(ev || {});
    },
    db,
    toast(msg) { toasts.push(String(msg)); },
    openPage(el) { bodyEl.appendChild(el); },
    closePage(id) {
      const el = mockDoc.getElementById(id);
      if (el) el.remove();
    },
    callAI: null,
    getLorebookContext: null,
    showGameHallPageCalls: 0,
    showGameHallPage() { g.showGameHallPageCalls++; },
    showAchievementPageCalls: 0,
    showAchievementPage() { g.showAchievementPageCalls++; },
    showLoveDiaryPageCalls: 0,
    showLoveDiaryPage() { g.showLoveDiaryPageCalls++; }
  };
  g.window = g;
  g.globalThis = g;

  const sharedCode = fs.readFileSync(path.resolve(__dirname, '../js/shared-hub.js'), 'utf8');
  const placeholderCode = fs.readFileSync(path.resolve(__dirname, '../js/placeholder-apps.js'), 'utf8');
  const wxCode = fs.readFileSync(path.resolve(__dirname, '../js/wanxiang-mirror.js'), 'utf8');

  new Function('window', 'globalThis', 'document', 'db', sharedCode)(g, g, mockDoc, db);
  new Function('window', 'globalThis', 'document', 'db', placeholderCode)(g, g, mockDoc, db);
  new Function('window', 'globalThis', 'document', 'db', wxCode)(g, g, mockDoc, db);

  // 挂载外部模块跳转 spy（避免被 placeholder-apps.js 覆盖）
  g.AchievementHall = { open() { g.showAchievementPageCalls++; } };
  g.showAchievementPage = function() { g.showAchievementPageCalls++; };
  g.showLoveDiaryPage = function() { g.showLoveDiaryPageCalls++; };

  return {
    g, db, mockDoc, bodyEl, configMap, storageMap, charMap, memoriesMap, toasts, historyStack,
    setFailConfigWriteOnce(v) { failConfigWriteOnce = v; }
  };
}

async function runTests() {
  console.log('=== 万象镜 V2.0 自动化验收测试 ===\n');

  // ----------------------------------------------------
  // 1. 资源文件与旧系统接入核查
  // ----------------------------------------------------
  console.log('[1] 地图图片、代码接线与旧名兼容性检查');
  const rootDir = path.resolve(__dirname, '..');
  for (const imgFile of ['img/map.png', 'img/map-morning.png', 'img/map-afternoon.png', 'img/map-evening.png']) {
    const p = path.join(rootDir, imgFile);
    const exists = fs.existsSync(p) && fs.statSync(p).size > 10000;
    check(exists, '存在真实地图图片资产: ' + imgFile);
  }
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const homeJs = fs.readFileSync(path.join(rootDir, 'js/home.js'), 'utf8');
  const dataJs = fs.readFileSync(path.join(rootDir, 'js/data.js'), 'utf8');
  check(indexHtml.includes('css/wanxiang-mirror.css') && indexHtml.includes('js/wanxiang-mirror.js'), 'index.html 已正确加载 wanxiang-mirror CSS 与 JS');
  check(homeJs.includes("id: 'heartbeatMall'") && homeJs.includes("label: '万象镜'"), '桌面保留 heartbeatMall 图标 ID 且用户可见名称已升级为万象镜');
  check(dataJs.includes("id: 'wanxiang'") && dataJs.includes("wanxiang_mirror_"), 'data.js 已登记万象镜独立清理边界且未触碰角色/记忆/经济底层表');

  // ----------------------------------------------------
  // 2. 四时段切换与视觉预览隔离 + 地图兜底
  // ----------------------------------------------------
  console.log('\n[2] 昼夜 4 时段逻辑、仅视觉预览隔离与地图兜底');
  {
    const h = createHarness();
    const { WanxiangMirror } = h.g;

    const testCases = [
      { h: 6, m: 30, expect: 'morning', src: 'img/map-morning.png' },
      { h: 13, m: 15, expect: 'day', src: 'img/map-afternoon.png' },
      { h: 18, m: 10, expect: 'dusk', src: 'img/map-morning.png' },
      { h: 22, m: 45, expect: 'night', src: 'img/map-evening.png' },
      { h: 2, m: 30, expect: 'night', src: 'img/map-evening.png' }
    ];
    for (const tc of testCases) {
      const dt = new Date(2026, 4, 15, tc.h, tc.m, 0).getTime();
      WanxiangMirror.setClock(() => dt);
      const info = WanxiangMirror.getActivePeriodInfo('auto');
      check(info.realKey === tc.expect && info.displayKey === tc.expect && info.period.src === tc.src && !info.isPreview,
        '真实时钟 ' + String(tc.h).padStart(2, '0') + ':' + String(tc.m).padStart(2, '0') + ' -> ' + tc.expect + ' (' + tc.src + ')');
    }

    // 在白天 13:15 手动预览夜晚，留影记录必须仍使用真实时段「白昼」
    WanxiangMirror.setClock(() => new Date(2026, 4, 15, 13, 15, 0).getTime());
    const previewNight = WanxiangMirror.getActivePeriodInfo('night');
    check(previewNight.realKey === 'day' && previewNight.displayKey === 'night' && previewNight.isPreview === true,
      '白昼预览夜晚仅改变 displayKey 与 isPreview，真实 realKey 保持 day');

    await WanxiangMirror.open();
    const imgEl = h.mockDoc.getElementById('wx-map-img');
    const fbEl = h.mockDoc.getElementById('wx-map-fallback');
    await imgEl.dispatchEvent({ type: 'error' });
    check(fbEl.classList.contains('is-visible'), '地图图片加载失败时触发优雅兜底界面');
    const pageEl = h.mockDoc.getElementById('wanxiang-mirror-page');
    check(pageEl.querySelectorAll('.wx-hotspot').length === 9, '兜底状态下 9 个地点热区依旧可访问');
    WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // 3. 九大地点归一化热区、缩放限制、拖动防误触、视角保持
  // ----------------------------------------------------
  console.log('\n[3] 九大地点坐标定位、拖动防误触与返回视角保持');
  {
    const h = createHarness();
    const { WanxiangMirror } = h.g;
    const expectedIds = [
      'mirror_plaza', 'shopping_street', 'afternoon_cafe', 'gacha_house',
      'four_seasons_garden', 'starlight_park', 'starwish_station', 'mirror_gallery', 'lakeside_walk'
    ];
    check(WanxiangMirror.LOCATIONS.length === 9, '地点总数恰好为 9 个');
    const allPresent = expectedIds.every(id => {
      const loc = WanxiangMirror.getLocationById(id);
      return loc && loc.box && loc.box.left >= 0 && loc.box.top >= 0 &&
        (loc.box.left + loc.box.width) <= 100 && (loc.box.top + loc.box.height) <= 100;
    });
    check(allPresent, '全部 9 个地点热区均在 0..100% 归一化画布边界内');

    await WanxiangMirror.open();
    WanxiangMirror.zoomAtCenter(1.5);
    const snapBefore = WanxiangMirror.getRuntimeSnapshot();
    check(snapBefore.mapTransform.scale === 1.5, '放大地图至 1.5x 成功');
    WanxiangMirror.zoomAtCenter(3.8);
    check(WanxiangMirror.getRuntimeSnapshot().mapTransform.scale === 2.0, '超出 2.0x 限制时自动夹紧至 2.0x');

    // 模拟大幅拖动（>8px）后释放并触发 click：不应误开地点弹窗
    const stage = h.mockDoc.getElementById('wx-map-stage');
    const shopHotspot = stage.querySelector('[data-loc-id="shopping_street"]');
    await stage.dispatchEvent({ type: 'pointerdown', pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    await stage.dispatchEvent({ type: 'pointermove', pointerId: 1, clientX: 235, clientY: 220 });
    await stage.dispatchEvent({ type: 'pointerup', pointerId: 1, clientX: 235, clientY: 220 });
    await shopHotspot.dispatchEvent({ type: 'click', target: shopHotspot });
    check(WanxiangMirror.getRuntimeSnapshot().sheetOpen === false, '拖动超过阈值后不误触打开建筑弹窗');

    const draggedTransform = WanxiangMirror.getRuntimeSnapshot().mapTransform;

    // 轻点热区（无拖动）：正常打开弹窗，关闭弹窗 & 切 tab 后地图视角不重置
    await shopHotspot.dispatchEvent({ type: 'click', target: shopHotspot });
    check(WanxiangMirror.getRuntimeSnapshot().sheetOpen === true &&
          WanxiangMirror.getRuntimeSnapshot().sheetLocationId === 'shopping_street', '轻点建筑热区打开统一底部弹窗');

    await WanxiangMirror.closeSheetOnly();
    WanxiangMirror.switchTab('bag');
    WanxiangMirror.switchTab('map');
    const afterTransform = WanxiangMirror.getRuntimeSnapshot().mapTransform;
    check(
      afterTransform.x === draggedTransform.x &&
      afterTransform.y === draggedTransform.y &&
      afterTransform.scale === draggedTransform.scale,
      '关闭地点弹窗及切换底部标签后地图平移与缩放视角保持不重置'
    );
    WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // 4. 占位地点边界校验（不伪装可玩、主操作禁用、安全分流）
  // ----------------------------------------------------
  console.log('\n[4] 未开放占位地点边界与直达分流验证');
  {
    const h = createHarness();
    const { WanxiangMirror } = h.g;
    await WanxiangMirror.open();
    const ecoBefore = await h.g.SharedEconomyService.getState();

    for (const pid of ['four_seasons_garden', 'starlight_park', 'starwish_station', 'lakeside_walk']) {
      await WanxiangMirror.openLocationSheet(pid, 'intro');
      const sheet = h.mockDoc.getElementById('wx-sheet');
      const html = sheet.innerHTML;
      const primaryBtn = sheet.querySelector('.wx-btn-primary');
      const locMeta = WanxiangMirror.getLocationById(pid);
      if (locMeta && locMeta.status === 'placeholder') {
        check(
          html.includes('敬请期待') && primaryBtn && primaryBtn.disabled === true,
          pid + ' 明确标明「敬请期待」且主进入按钮处于禁用态'
        );
        const disabledFeat = sheet.querySelector('.wx-action-btn.is-disabled');
        if (disabledFeat) {
          await disabledFeat.dispatchEvent({ type: 'click', target: disabledFeat });
        }
      } else {
        check(
          locMeta && (locMeta.status === 'open' || locMeta.status === 'available') && primaryBtn && primaryBtn.disabled !== true,
          pid + ' 已按后续版本开放且主进入按钮可用'
        );
      }
    }

    // 验证星光游乐场的「前往游戏大厅」正确复用 showGameHallPage
    await WanxiangMirror.openLocationSheet('starlight_park', 'intro');
    const gameBtn = h.mockDoc.getElementById('wx-sheet').querySelector('[data-wx-feature="park_minigame"]');
    await gameBtn.dispatchEvent({ type: 'click', target: gameBtn });
    check(h.g.showGameHallPageCalls === 1, '星光游乐场可安全导流复用既有游戏大厅');

    // 验证镜中留影馆链接成就馆与恋爱记
    await WanxiangMirror.openLocationSheet('mirror_gallery', 'gallery');
    const achBtn = h.mockDoc.getElementById('wx-sheet').querySelector('[data-wx-external="achievement"]');
    const loveBtn = h.mockDoc.getElementById('wx-sheet').querySelector('[data-wx-external="loveDiary"]');
    await achBtn.dispatchEvent({ type: 'click', target: achBtn });
    await loveBtn.dispatchEvent({ type: 'click', target: loveBtn });
    check(h.g.showAchievementPageCalls === 1 && h.g.showLoveDiaryPageCalls === 1, '镜中留影馆复用跳转成就馆与恋爱记');

    const ecoAfter = await h.g.SharedEconomyService.getState();
    check(ecoAfter.coins === ecoBefore.coins && ecoAfter.inventory.length === ecoBefore.inventory.length,
      '点击占位地点及未开放功能未发生任何意外扣费或背包修改');
    WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // 5. 心动商店街：兼容旧商品、并发防重扣、入包异常回滚、每日签到防刷、赠礼
  // ----------------------------------------------------
  console.log('\n[5] 心动商店街（共享经济、并发保护、异常退款、RewardGuard 与赠礼）');
  {
    const h = createHarness();
    const { WanxiangMirror, SharedEconomyService } = h.g;
    WanxiangMirror.setClock(() => new Date(2026, 4, 15, 10, 0, 0).getTime());

    // 核查原心动商城 6 件商品完整保留且价格一致
    const legacyChecks = [
      ['item_vinyl', 300],
      ['crop_strawberry_seed', 50],
      ['item_rug', 200],
      ['item_sticky_notes', 60],
      ['crop_sunflower_seed', 80],
      ['item_frame', 150]
    ];
    const allLegacyOk = legacyChecks.every(([id, price]) => {
      const found = WanxiangMirror.SHOP_GOODS.find(g => g.id === id);
      return found && found.price === price;
    });
    check(allLegacyOk, '原心动商城全部 6 件商品 ID 与价格完整继承');

    // 设置金币为 200 测试并发购买两件 150 币拍立得相框
    const initEco = await SharedEconomyService.getState();
    await SharedEconomyService.spendCoins(initEco.coins - 200, '测试初始化到200币', 'test');

    const [p1, p2] = await Promise.all([
      WanxiangMirror.purchaseShopGood('item_frame'),
      WanxiangMirror.purchaseShopGood('item_frame')
    ]);
    const ecoAfterRace = await SharedEconomyService.getState();
    const frameItem = ecoAfterRace.inventory.find(i => i.itemId === 'item_frame');
    check(
      p1.ok === true && p2.ok === false && ecoAfterRace.coins === 50 && frameItem && frameItem.count === 1,
      '并发连点购买 150 币商品（余额 200）：仅成交 1 次、剩余 50 币、绝不扣成负数或双发'
    );

    // 异常回滚测试：注入 addItem 抛错，必须自动退还金币且背包不变
    const origAddItem = SharedEconomyService.addItem;
    SharedEconomyService.addItem = async function() { throw new Error('MOCK_INVENTORY_FAIL'); };
    const failRes = await WanxiangMirror.purchaseShopGood('gift_postcard_set'); // 45 币
    SharedEconomyService.addItem = origAddItem;
    const ecoAfterRollback = await SharedEconomyService.getState();
    check(
      failRes.ok === false && ecoAfterRollback.coins === 50 && !ecoAfterRollback.inventory.some(i => i.itemId === 'gift_postcard_set'),
      '入包抛错时自动全额退还金币，绝不扣币不进包'
    );

    // 每日签到保留旧 eventId mall_signin_<today> 防刷
    const sign1 = await WanxiangMirror.claimDailySignin();
    const sign2 = await WanxiangMirror.claimDailySignin();
    check(sign1.ok === true && sign1.coins === 50 && sign2.ok === false, '每日迎新签到复用 mall_signin_<date> RewardGuard 防重');

    // 广场许愿每日防刷
    const wish1 = await WanxiangMirror.claimPlazaWish();
    const wish2 = await WanxiangMirror.claimPlazaWish();
    check(wish1.ok === true && wish1.coins === 15 && wish2.ok === false, '镜心广场许愿复用 RewardGuard 每日一次防重');

    // 赠礼给指定 Char：扣减统一背包数量 + 仅写入目标 Char 记录
    await h.db.characters.put({ id: 7, nick: '林屿', name: '林屿', personality: '温和耐心' });
    await WanxiangMirror.open();
    // 切换当前同行 Char 为 7
    await h.mockDoc.getElementById('wx-float-char-btn').dispatchEvent({ type: 'click', target: h.mockDoc.getElementById('wx-float-char-btn') });
    const pick7 = h.mockDoc.getElementById('wx-sheet').querySelector('[data-wx-pick-char="7"]');
    await pick7.dispatchEvent({ type: 'click', target: pick7 });

    const giftRes = await WanxiangMirror.giftItemToActiveChar('item_frame');
    const ecoAfterGift = await SharedEconomyService.getState();
    const charLogs = await WanxiangMirror.loadCharLogs();
    check(
      giftRes.ok === true &&
      !ecoAfterGift.inventory.some(i => i.itemId === 'item_frame') &&
      charLogs['7'] && charLogs['7'].giftsGiven.length === 1 && !charLogs['8'],
      '赠礼扣减共享背包并仅记入当前同行 Char 档案'
    );
    WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // 6. 午后咖啡馆、留影独立存储（不篡改 db.memories）与多 Char 隔离
  // ----------------------------------------------------
  console.log('\n[6] 午后咖啡馆消费记账与留影存储隔离');
  {
    const h = createHarness();
    const { WanxiangMirror, SharedEconomyService } = h.g;
    WanxiangMirror.setClock(() => new Date(2026, 4, 15, 14, 0, 0).getTime());

    await h.db.characters.put({ id: 101, nick: '沈知行', name: '沈知行', personality: '冷静克制' });
    await h.db.characters.put({ id: 102, nick: '江暮', name: '江暮', personality: '温柔直率' });
    await WanxiangMirror.open();

    // 选择 101 点单 + 留影
    await h.mockDoc.getElementById('wx-float-char-btn').dispatchEvent({ type: 'click', target: h.mockDoc.getElementById('wx-float-char-btn') });
    await h.mockDoc.getElementById('wx-sheet').querySelector('[data-wx-pick-char="101"]').dispatchEvent({ type: 'click', target: h.mockDoc.getElementById('wx-sheet').querySelector('[data-wx-pick-char="101"]') });

    const beforeEco = await SharedEconomyService.getState();
    const orderRes = await WanxiangMirror.orderAtCafe('drink', 'cafe_latte'); // 18 币
    const afterEco = await SharedEconomyService.getState();
    const mem1 = await WanxiangMirror.saveCafeMemento('阳光落在拿铁拉花上');
    const memsInDb = await h.db.memories.toArray();

    check(orderRes.ok === true && afterEco.coins === beforeEco.coins - 18, '咖啡馆点单按真实价格扣减共享金币');
    check(mem1.periodLabel === '白昼' && memsInDb.length === 0, '咖啡馆留影独立存入 wanxiang_mirror_mementos_v1 且绝不擅改 db.memories');

    // 切换到 102：102 视角留影数应为 0，101 互动不混入 102
    await h.mockDoc.getElementById('wx-float-char-btn').dispatchEvent({ type: 'click', target: h.mockDoc.getElementById('wx-float-char-btn') });
    await h.mockDoc.getElementById('wx-sheet').querySelector('[data-wx-pick-char="102"]').dispatchEvent({ type: 'click', target: h.mockDoc.getElementById('wx-sheet').querySelector('[data-wx-pick-char="102"]') });
    WanxiangMirror.switchTab('mementos');
    await new Promise(r => setTimeout(r, 20));
    const subHtml = h.mockDoc.getElementById('wx-subpage').innerHTML;
    const logs = await WanxiangMirror.loadCharLogs();
    check(
      subHtml.includes('0 张') && logs['101'] && !logs['102'],
      '不同 Char 咖啡馆互动与留影视角严格隔离'
    );
    WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // 7. 奇遇扭蛋屋：requestId 防重、10 抽保底 SR、异常退款
  // ----------------------------------------------------
  console.log('\n[7] 奇遇扭蛋屋概率、请求 ID 防重与 10 抽保底');
  {
    const h = createHarness();
    const { WanxiangMirror, SharedEconomyService } = h.g;
    // 充裕金币
    await SharedEconomyService.addCoins(1000, '测试补充', 'test');

    // 同 requestId 连续调用两次：第二次拦截且不扣费、不重发奖励
    const g1 = await WanxiangMirror.drawGacha('gift', 'fixed_req_001', () => 0.1);
    const coinsAfter1 = (await SharedEconomyService.getState()).coins;
    const g2 = await WanxiangMirror.drawGacha('gift', 'fixed_req_001', () => 0.1);
    const coinsAfter2 = (await SharedEconomyService.getState()).coins;
    check(g1.ok === true && g2.ok === false && g2.duplicate === true && coinsAfter1 === coinsAfter2,
      '同一 requestId 重试/连点扭蛋不重复扣费与发奖');

    // 再抽 8 次低保 (rng=0.1 -> N)，第 10 抽即使 rng=0.1 也必触发保底 SR
    for (let i = 2; i <= 9; i++) {
      await WanxiangMirror.drawGacha('gift', 'pity_req_' + i, () => 0.1);
    }
    const g10 = await WanxiangMirror.drawGacha('gift', 'pity_req_10', () => 0.1);
    const gs = await WanxiangMirror.loadGachaState();
    check(
      g10.ok === true && g10.log.hitPity === true && g10.prize.rarity === 'SR' && gs.giftPity === 0,
      '第 10 抽强制触发 SR 保底并清零保底计数'
    );

    // 奇遇机抽取验证收集进图鉴 + 返还小额金币
    const advRes = await WanxiangMirror.drawGacha('adventure', 'adv_req_1', () => 0.99); // SR (+45 币 - 30 币 = +15)
    const gsAdv = await WanxiangMirror.loadGachaState();
    check(advRes.ok === true && gsAdv.collectedEncounters.length === 1, '镜界奇遇机抽取后正常记录奇遇图鉴');
  }

  // ----------------------------------------------------
  // 8. 多 Char 世界书隔离、切换作废在途 AI 请求、无 AI 降级
  // ----------------------------------------------------
  console.log('\n[8] 多 Char 世界书隔离、在途 AI 作废与无 AI 降级');
  {
    const h = createHarness();
    const { WanxiangMirror } = h.g;
    await h.db.characters.put({ id: 11, nick: 'A君', name: 'A君', personality: '安静' });
    await h.db.characters.put({ id: 12, nick: 'B君', name: 'B君', personality: '开朗' });
    await h.db.config.put({
      key: 'lorebooks',
      value: [
        { id: 'lb1', enabled: true, scope: 'personal', charIds: ['11'], entries: [{ enabled: true, content: 'SECRET_LORE_FOR_11_ONLY' }] },
        { id: 'lb2', enabled: true, scope: 'personal', charIds: ['12'], entries: [{ enabled: true, content: 'SECRET_LORE_FOR_12_ONLY' }] }
      ]
    });

    let capturedPrompt = '';
    let resolveSlowAI;
    h.g.callAI = function(msgs) {
      capturedPrompt = msgs[0].content;
      return new Promise(resolve => { resolveSlowAI = resolve; });
    };

    await WanxiangMirror.open();
    // 选定 Char 11 并发起慢速 AI 请求
    await h.mockDoc.getElementById('wx-float-char-btn').dispatchEvent({ type: 'click', target: h.mockDoc.getElementById('wx-float-char-btn') });
    await h.mockDoc.getElementById('wx-sheet').querySelector('[data-wx-pick-char="11"]').dispatchEvent({ type: 'click', target: h.mockDoc.getElementById('wx-sheet').querySelector('[data-wx-pick-char="11"]') });

    const pendingA = WanxiangMirror.requestCharReaction({ locationName: '午后咖啡馆', actionDesc: '尝了口拿铁' });
    await new Promise(r => setTimeout(r, 15));

    check(
      capturedPrompt.includes('SECRET_LORE_FOR_11_ONLY') && !capturedPrompt.includes('SECRET_LORE_FOR_12_ONLY'),
      'Char 11 仅读取自身个人世界书，绝不泄漏 Char 12 设定'
    );

    // 在 AI 回复返回前，用户切换到 Char 12
    await h.mockDoc.getElementById('wx-float-char-btn').dispatchEvent({ type: 'click', target: h.mockDoc.getElementById('wx-float-char-btn') });
    await h.mockDoc.getElementById('wx-sheet').querySelector('[data-wx-pick-char="12"]').dispatchEvent({ type: 'click', target: h.mockDoc.getElementById('wx-sheet').querySelector('[data-wx-pick-char="12"]') });

    resolveSlowAI('这是旧角色 A君 的迟到回应');
    const lateResult = await pendingA;
    check(lateResult.ok === false && lateResult.aborted === true, '切换 Char 后前一位 Char 的在途 AI 请求自动作废不串台');

    // AI 报错 / 不可用时平滑降级为非 AI 提示
    h.g.callAI = async function() { throw new Error('API_DOWN'); };
    const fallbackRes = await WanxiangMirror.requestCharReaction({ locationName: '镜心广场', actionDesc: '走过喷泉' });
    check(fallbackRes.ok === true && fallbackRes.source === 'fallback' && fallbackRes.text.includes('B君'),
      'AI 服务失败时自动降级为正常陪伴提示，不阻塞核心交互');
    WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // 9. Android 返回键先关弹窗再退回桌面 + 旧入口与备份恢复兼容
  // ----------------------------------------------------
  console.log('\n[9] Android 返回键先关弹窗、旧路由兼容与备份恢复往返');
  {
    const h = createHarness();
    const { WanxiangMirror, SharedEconomyService } = h.g;

    // 预置旧版数据（模拟老用户从心动商城升级而来）
    await h.db.config.put({
      key: 'shared_economy_state_v2',
      value: { coins: 888, diamonds: 20, inventory: [{ itemId: 'item_rug', name: '暖绒云朵毯', count: 2 }], logs: [] }
    });

    // 通过旧入口 showHeartbeatMallPage 打开并直接测试 popstate
    await h.g.showHeartbeatMallPage();
    check(Boolean(h.mockDoc.getElementById('wanxiang-mirror-page')), '旧路由 window.showHeartbeatMallPage 无缝进入万象镜');
    check(h.mockDoc.getElementById('wx-coin-val').textContent === '888', '升级后完整继承老用户 888 金币与背包');

    await WanxiangMirror.openLocationSheet('afternoon_cafe', 'cafe');
    check(WanxiangMirror.getRuntimeSnapshot().sheetOpen === true, '打开咖啡馆底部弹窗');

    // 第一次按 Android 返回键 -> 只关闭弹窗，页仍在
    await h.g.dispatchWindowEvent('popstate', {});
    await new Promise(r => setTimeout(r, 15));
    check(
      WanxiangMirror.getRuntimeSnapshot().sheetOpen === false &&
      Boolean(h.mockDoc.getElementById('wanxiang-mirror-page')),
      'Android 返回键第一次仅关闭当前弹窗，保留万象镜与地图视角'
    );

    // 第二次按 Android 返回键 -> 退出万象镜页面
    await h.g.dispatchWindowEvent('popstate', {});
    await new Promise(r => setTimeout(r, 15));
    check(!h.mockDoc.getElementById('wanxiang-mirror-page'), 'Android 返回键第二次关闭万象镜返回桌面');

    // 写入留影与扭蛋后模拟完整备份导出与清空恢复
    await WanxiangMirror.drawGacha('gift', 'backup_draw_1', () => 0.5);
    await WanxiangMirror.saveCafeMemento('备份测试留影');

    const backupConfig = await h.db.config.toArray();
    const backupLS = {};
    for (let i = 0; i < h.g.localStorage.length; i++) {
      const k = h.g.localStorage.key(i);
      backupLS[k] = h.g.localStorage.getItem(k);
    }

    // 清空当前存储并按 data.js 语义导入备份
    h.configMap.clear();
    h.storageMap.clear();
    await h.db.config.bulkPut(backupConfig);
    Object.keys(backupLS).forEach(k => h.g.localStorage.setItem(k, backupLS[k]));

    const restoredEco = await SharedEconomyService.getState();
    const restoredGacha = await WanxiangMirror.loadGachaState();
    const restoredMems = await WanxiangMirror.loadMementos();
    check(
      restoredEco.coins === 848 &&
      restoredEco.inventory.some(i => i.itemId === 'item_rug' && i.count === 2) &&
      restoredGacha.logs.length === 1 &&
      restoredMems.length === 1 && restoredMems[0].note === '备份测试留影',
      '备份恢复往返完整保留金币、旧背包、扭蛋存档与留影记录'
    );
  }

  console.log('\n====================================');
  console.log('测试汇总: 通过 ' + passed + ' 项, 失败 ' + failed + ' 项');
  console.log('====================================');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('测试运行异常:', err);
  process.exit(1);
});
