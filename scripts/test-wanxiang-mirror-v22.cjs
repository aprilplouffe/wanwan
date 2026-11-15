// scripts/test-wanxiang-mirror-v22.cjs
// 弯弯小手机｜万象镜 V2.2「花语与湖畔之约」自动化验收测试（Node 模拟 DOM 与业务闭环回归）
// 说明：本测试在 Node 模拟 DOM 环境中验证 V2.2 四季花园、花束制作/赠礼/补偿、湖畔步道、
//       跨地点同行上下文、纪念分类、边界/幂等/隔离与数据备份恢复。
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

function createV22Harness() {
  const storageMap = new Map();
  const configMap = new Map();
  const charMap = new Map();
  const memoriesMap = new Map();
  const winListeners = {};
  const historyStack = [];
  const toasts = [];
  let rootBodyChildren = [];
  let forceStorageFail = false;

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
    setStorageFail(flag) { forceStorageFail = Boolean(flag); }
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
  // [1] 静态配置、版本参数、未开放地点边界与 CSS 规则
  // ----------------------------------------------------
  console.log('\n[1] 静态资源、地点边界与 V2.2 CSS 验收');
  check(/css\/wanxiang-mirror\.css\?v=(2|3)\.\d+\.\d+/.test(indexHtml) && /js\/wanxiang-mirror\.js\?v=(2|3)\.\d+\.\d+/.test(indexHtml),
    'index.html 已具备 V2.x/V3.x 资源版本参数');
  check(
    cssCode.includes('.wx-season-bar') && cssCode.includes('.wx-flower-grid') &&
    cssCode.includes('.wx-bouquet-preview') && cssCode.includes('.wx-walk-stage') &&
    cssCode.includes('.wx-choice-card') && cssCode.includes('.wx-memento-card'),
    'css/wanxiang-mirror.css 包含花园、花束预览、湖畔选项与纪念卡片样式'
  );
  check(
    cssCode.includes('@media (max-width: 374px)') && cssCode.includes('@media (prefers-reduced-motion: reduce)'),
    'CSS 保持 320px 窄屏与 prefers-reduced-motion 兼容'
  );
  check(
    dataCode.includes("configPrefixes: ['wanxiang_mirror_'") && dataCode.includes("localPrefixes: ['wanxiang_mirror_'"),
    'js/data.js 备份与选择性清除规则自动覆盖 V2.2 新增 wanxiang_mirror_* 存储键'
  );

  {
    const h = createV22Harness();
    const { win } = h;
    await win.WanxiangMirror.open();
    const gLoc = win.WanxiangMirror.getLocationById('four_seasons_garden');
    const lLoc = win.WanxiangMirror.getLocationById('lakeside_walk');
    const spLoc = win.WanxiangMirror.getLocationById('starlight_park');
    const stLoc = win.WanxiangMirror.getLocationById('starwish_station');
    check(
      win.WanxiangMirror.LOCATIONS.length === 9 &&
      gLoc.status === 'open' && lLoc.status === 'open' &&
      spLoc.status === 'open' && stLoc.status === 'available',
      '四季花园、湖畔步道、星光游乐场与星愿列车站均已开放'
    );

    await win.WanxiangMirror.openLocationSheet('starlight_park', 'intro');
    const spBtn = h.getPage().querySelector('.wx-btn-primary');
    await win.WanxiangMirror.openLocationSheet('starwish_station', 'intro');
    const stBtn = h.getPage().querySelector('.wx-btn-primary');
    check(spBtn && !spBtn.disabled && stBtn && !stBtn.disabled,
      '星光游乐场与星愿列车站主 CTA 均已启用');
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [2] 四季花园：8 种花材、季节判定、每日 3 次限额、并发/幂等与时钟回拨防护
  // ----------------------------------------------------
  console.log('\n[2] 四季花园花材定义、季节权重、每日免费3次采集与时钟回拨防护');
  {
    const h = createV22Harness();
    const { win } = h;
    const expectedIds = ['rose', 'tulip', 'sunflower', 'daisy', 'lavender', 'cherry_blossom', 'hydrangea', 'lily_of_the_valley'];
    check(
      win.WanxiangMirror.FLOWERS.length === 8 &&
      expectedIds.every(id => win.WanxiangMirror.FLOWERS.some(f => f.id === id && f.name && f.meaning)),
      '8 种基础花材具备稳定英文 ID、中文展示名与独立花语'
    );

    win.WanxiangMirror.setClock(() => new Date(2026, 3, 10, 12, 0, 0).getTime()); // 4月 春
    check(win.WanxiangMirror.getLocalSeasonInfo().key === 'spring', '4 月本地日期判定为春季');
    win.WanxiangMirror.setClock(() => new Date(2026, 6, 15, 22, 0, 0).getTime()); // 7月 夏
    check(win.WanxiangMirror.getLocalSeasonInfo().key === 'summer', '7 月本地日期判定为夏季');
    win.WanxiangMirror.setClock(() => new Date(2026, 9, 20, 9, 0, 0).getTime()); // 10月 秋
    check(win.WanxiangMirror.getLocalSeasonInfo().key === 'autumn', '10 月本地日期判定为秋季');
    win.WanxiangMirror.setClock(() => new Date(2026, 0, 5, 19, 0, 0).getTime()); // 1月 冬
    check(win.WanxiangMirror.getLocalSeasonInfo().key === 'winter', '1 月本地日期判定为冬季');

    // 验证季节不随 timePreview 改变
    await win.WanxiangMirror.saveMirrorState({ timePreview: 'night' });
    win.WanxiangMirror.setClock(() => new Date(2026, 3, 15, 13, 0, 0).getTime()); // 春季白昼
    await win.WanxiangMirror.open();
    check(
      win.WanxiangMirror.getRuntimeSnapshot().timePreview === 'night' &&
      win.WanxiangMirror.getLocalSeasonInfo().key === 'spring',
      '手动切换昼夜视觉预览绝不改变当前季节判定'
    );

    // 验证春季权重倾斜：3x vs 1x
    const countsByFlower = {};
    for (let i = 0; i < 100; i++) {
      // Deterministic evenly-spaced pseudo-rolls covering [0,1)
      const rollVal = (i + 0.5) / 100;
      h.configMap.delete(win.WanxiangMirror.STORAGE_KEYS.GARDEN_V22);
      win.localStorage.removeItem(win.WanxiangMirror.STORAGE_KEYS.GARDEN_V22);
      const res = await win.WanxiangMirror.collectDailyFlower('w_' + i, () => rollVal);
      if (res.ok) countsByFlower[res.flower.id] = (countsByFlower[res.flower.id] || 0) + 1;
    }
    check(
      (countsByFlower.rose || 0) > (countsByFlower.sunflower || 0),
      '春季加权下当季花材（玫瑰）抽取频次高于非当季花材（向日葵）',
      `rose=${countsByFlower.rose}, sunflower=${countsByFlower.sunflower}`
    );

    // 清零重测每日 3 次限额 + 同 requestId 幂等 + 并发 10 次 + Char 切换不重置 + 回拨拦截
    h.configMap.delete(win.WanxiangMirror.STORAGE_KEYS.GARDEN_V22);
    win.localStorage.removeItem(win.WanxiangMirror.STORAGE_KEYS.GARDEN_V22);
    const ecoBefore = (await win.SharedEconomyService.getState()).coins;

    const rSame1 = await win.WanxiangMirror.collectDailyFlower('same_col_req', () => 0.05);
    const rSame2 = await win.WanxiangMirror.collectDailyFlower('same_col_req', () => 0.05);
    const gsAfterSame = await win.WanxiangMirror.loadGardenState();
    const usedAfterSame = win.WanxiangMirror.getGardenDailyCollectionStatus(gsAfterSame).used;
    check(rSame1.ok && rSame2.idempotent === true && usedAfterSame === 1,
      '同一 requestId 重复采集幂等拦截：仅计数 1 次、仅入篮 1 朵');

    // 并发 10 次不同 requestId：最多再成功 2 次，总计 3 次
    const batch = [];
    for (let k = 0; k < 10; k++) batch.push(win.WanxiangMirror.collectDailyFlower('burst_' + k, () => 0.1 * (k % 9)));
    const batchRes = await Promise.all(batch);
    const succCount = batchRes.filter(x => x.ok).length;
    const gsAfterBurst = await win.WanxiangMirror.loadGardenState();
    const totalFlowers = Object.values(gsAfterBurst.flowers).reduce((s, n) => s + n, 0);
    check(succCount === 2 && totalFlowers === 3 && win.WanxiangMirror.getGardenDailyCollectionStatus(gsAfterBurst).remaining === 0,
      '快速连点/并发 10 次严格限制每日最多 3 次采集，不透支次日额度');

    // 切换 Char 不重置采集次数
    await win.db.characters.put({ id: 1, name: '夏知意' });
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '1' });
    const rAfterCharSwitch = await win.WanxiangMirror.collectDailyFlower('after_char_switch');
    check(rAfterCharSwitch.ok === false && rAfterCharSwitch.reason === 'daily_limit',
      '切换同行 Char 后今日已用 3/3 采集次数保持锁定不重置');

    // 时钟回拨防护
    win.WanxiangMirror.setClock(() => new Date(2026, 3, 14, 10, 0, 0).getTime());
    const rRollback = await win.WanxiangMirror.collectDailyFlower('rollback_try');
    check(rRollback.ok === false && rRollback.reason === 'clock_rollback',
      '设备日期回拨早于 lastProcessedDate 时安全锁定采集');

    // 跨天恢复
    win.WanxiangMirror.setClock(() => new Date(2026, 3, 16, 8, 0, 0).getTime());
    const rNextDay = await win.WanxiangMirror.collectDailyFlower('next_day_try');
    const ecoAfter = (await win.SharedEconomyService.getState()).coins;
    check(rNextDay.ok === true && rNextDay.remaining === 2 && ecoAfter === ecoBefore,
      '次日 0 点后自动刷新 3 次免费采集额度，全过程零金币扣费');
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [3] 花束制作：1-3种共3份、包装丝带、自定义名字清洗、取消不扣、跨存储补偿、配额失败
  // ----------------------------------------------------
  console.log('\n[3] 花束搭配制作、Layer 5 二次确认、XSS 清洗、跨存储补偿与配额失败保护');
  {
    const h = createV22Harness();
    const { win } = h;
    // 预置花材：rose 3, tulip 2, lavender 1
    await win.db.config.put({
      key: win.WanxiangMirror.STORAGE_KEYS.GARDEN_V22,
      value: {
        schemaVersion: 22,
        flowers: { rose: 3, tulip: 2, lavender: 1, sunflower: 0, daisy: 0, cherry_blossom: 0, hydrangea: 0, lily_of_the_valley: 0 },
        bouquets: [],
        processedRequests: {}
      }
    });

    // 非法数量 / 库存不足拦截
    const badTotal = await win.WanxiangMirror.craftBouquet({ counts: { rose: 2 }, requestId: 'bad_tot' });
    const badStock = await win.WanxiangMirror.craftBouquet({ counts: { rose: 1, sunflower: 2 }, requestId: 'bad_stk' });
    check(!badTotal.ok && !badStock.ok, '花材总数非 3 份或库存不足时禁止制作且零扣除');

    // UI 制作确认层：取消不扣花材 -> 确认制作成功 + 清洗名字与 24 字符截断
    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('four_seasons_garden', 'garden');
    const page = h.getPage();
    await page.querySelector('[data-wx-garden-tab="craft"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-garden-tab="craft"]') });

    // 选择 1 玫瑰 + 1 郁金香 + 1 薰衣草
    for (const fid of ['rose', 'tulip', 'lavender']) {
      const incBtn = page.querySelector('[data-wx-craft-inc="' + fid + '"]');
      await incBtn.dispatchEvent({ type: 'click', target: incBtn });
    }
    await page.querySelector('[data-wx-wrap-id="lavender_mist"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-wrap-id="lavender_mist"]') });
    await page.querySelector('[data-wx-ribbon-id="rose_pink"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-ribbon-id="rose_pink"]') });

    const nameInput = page.querySelector('#wx-bouquet-name-input');
    nameInput.value = '<script>alert(1)</script>春天送你的温柔小花束ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    await nameInput.dispatchEvent({ type: 'input', target: nameInput });

    const confirmCraftBtn = page.querySelector('[data-wx-action="garden-craft-confirm"]');
    await confirmCraftBtn.dispatchEvent({ type: 'click', target: confirmCraftBtn });
    check(win.WanxiangMirror.getRuntimeSnapshot().confirmOpen === true, '点击制作花束先弹出 Layer 5 确认层');

    // 取消制作
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-close]') });
    let gs = await win.WanxiangMirror.loadGardenState();
    check(gs.flowers.rose === 3 && gs.bouquets.length === 0, '取消制作确认层后花材库存保持原样、零花束生成');

    // 再次弹出并确认制作
    page.querySelector('#wx-bouquet-name-input').value = '<script>春风与星光之约花束超过二十四字测试截断尾巴';
    await page.querySelector('[data-wx-action="garden-craft-confirm"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="garden-craft-confirm"]') });
    await page.querySelector('[data-wx-confirm-exec]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-exec]') });

    gs = await win.WanxiangMirror.loadGardenState();
    const eco = await win.SharedEconomyService.getState();
    const createdBq = gs.bouquets[0];
    const cpLen = Array.from(createdBq.name).length;
    check(
      gs.bouquets.length === 1 &&
      !createdBq.name.includes('<') && !createdBq.name.includes('>') &&
      cpLen <= 24 &&
      gs.flowers.rose === 2 && gs.flowers.tulip === 1 && gs.flowers.lavender === 0 &&
      eco.inventory.some(i => i.itemId === 'wx_bouquet_' + createdBq.bouquetId && i.count === 1),
      '确认制作扣减花材、过滤标签并截断至≤24字符、同步入共享背包'
    );

    // 同一 requestId 重复调用幂等不重扣
    const dup1 = await win.WanxiangMirror.craftBouquet({ counts: { rose: 2, tulip: 1 }, requestId: 'dup_crf_1' });
    const dup2 = await win.WanxiangMirror.craftBouquet({ counts: { rose: 2, tulip: 1 }, requestId: 'dup_crf_1' });
    gs = await win.WanxiangMirror.loadGardenState();
    check(dup1.ok && dup2.idempotent === true && gs.flowers.rose === 0 && gs.flowers.tulip === 0 && gs.bouquets.length === 2,
      '同一 requestId 重复制作花束仅生效 1 次，绝不双倍扣花材');

    // 补花测试跨存储补偿与 storage 配额异常
    await win.db.config.put({
      key: win.WanxiangMirror.STORAGE_KEYS.GARDEN_V22,
      value: Object.assign({}, gs, { flowers: Object.assign({}, gs.flowers, { rose: 3 }) })
    });
    const origAdd = win.SharedEconomyService.addItem;
    win.SharedEconomyService.addItem = async function() { throw new Error('MOCK_SHARED_BAG_ERR'); };
    const compRes = await win.WanxiangMirror.craftBouquet({ counts: { rose: 3 }, requestId: 'comp_test_1' });
    win.SharedEconomyService.addItem = origAdd;
    gs = await win.WanxiangMirror.loadGardenState();
    check(compRes.ok === false && compRes.reason === 'inventory_sync_failed' && gs.flowers.rose === 3 && gs.bouquets.length === 2,
      '同步共享背包失败时自动触发跨存储补偿，退回全部花材且不留脏花束');

    h.win.setStorageFail(true);
    const quotaRes = await win.WanxiangMirror.craftBouquet({ counts: { rose: 3 }, requestId: 'quota_test_1' });
    h.win.setStorageFail(false);
    gs = await win.WanxiangMirror.loadGardenState();
    check(quotaRes.ok === false && quotaRes.reason === 'storage_failed' && gs.flowers.rose === 3 && gs.bouquets.length === 2,
      '写入存储失败时真实报错返回，绝不假称成功或扣除花材');
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [4] 花束送礼、AI 失败不丢状态 & 重试不重扣、切角防串送、花语纪念去重、背包直赠同步
  // ----------------------------------------------------
  console.log('\n[4] 花束送礼、AI 重试不重扣、切角中止、背包一致性与花语纪念去重');
  {
    const h = createV22Harness();
    const { win } = h;
    await win.db.characters.put({ id: 11, nick: '温宁', name: '温宁', personality: '安静温和' });
    await win.db.characters.put({ id: 12, nick: '陆离', name: '陆离', personality: '直接坦率' });
    await win.db.config.put({
      key: win.WanxiangMirror.STORAGE_KEYS.GARDEN_V22,
      value: {
        schemaVersion: 22,
        flowers: { rose: 6, tulip: 0, sunflower: 0, daisy: 0, lavender: 0, cherry_blossom: 0, hydrangea: 0, lily_of_the_valley: 0 },
        bouquets: [],
        processedRequests: {}
      }
    });
    const b1 = (await win.WanxiangMirror.craftBouquet({ counts: { rose: 3 }, name: '心动玫瑰束', requestId: 'bq_g1' })).bouquet;
    const b2 = (await win.WanxiangMirror.craftBouquet({ counts: { rose: 3 }, name: '第二束玫瑰', requestId: 'bq_g2' })).bouquet;

    await win.WanxiangMirror.saveMirrorState({ activeCharId: '11' });
    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('four_seasons_garden', 'garden');
    const page = h.getPage();

    // 切到花束与纪念标签，测试取消送花不消耗
    await page.querySelector('[data-wx-garden-tab="mementos"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-garden-tab="mementos"]') });
    await page.querySelector('[data-wx-gift-bouquet="' + b1.bouquetId + '"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-gift-bouquet="' + b1.bouquetId + '"]') });
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-close]') });
    let gs = await win.WanxiangMirror.loadGardenState();
    check(gs.bouquets.find(x => x.bouquetId === b1.bouquetId).status === 'owned', '取消送花确认层后花束保持未送出状态');

    // 送花时模拟 AI 失败，应依然完成送礼且提供重试按钮；重试时成功不重扣花束
    let aiMode = 'fail';
    win.callAI = async () => {
      if (aiMode === 'fail') throw new Error('AI_TIMEOUT');
      return '谢谢这束玫瑰，颜色很温柔。';
    };
    await page.querySelector('[data-wx-gift-bouquet="' + b1.bouquetId + '"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-gift-bouquet="' + b1.bouquetId + '"]') });
    await page.querySelector('[data-wx-confirm-exec]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-exec]') });
    await page.querySelector('[data-wx-confirm-close]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-close]') });

    gs = await win.WanxiangMirror.loadGardenState();
    const b1After = gs.bouquets.find(x => x.bouquetId === b1.bouquetId);
    const ecoAfterG1 = await win.SharedEconomyService.getState();
    const retryGiftBtn = page.querySelector('[data-wx-retry-gift-ai="' + b1.bouquetId + '"]');
    check(
      b1After.status === 'gifted' && b1After.giftedToCharId === '11' && b1After.aiFailed === true &&
      !ecoAfterG1.inventory.some(i => i.itemId === 'wx_bouquet_' + b1.bouquetId) &&
      Boolean(retryGiftBtn),
      'AI 超时失败时不回滚已完成赠礼，不残留在共享背包，并展示重试回应按钮'
    );

    aiMode = 'ok';
    await retryGiftBtn.dispatchEvent({ type: 'click', target: retryGiftBtn });
    gs = await win.WanxiangMirror.loadGardenState();
    const b1Retried = gs.bouquets.find(x => x.bouquetId === b1.bouquetId);
    check(b1Retried.aiFailed === false && b1Retried.charReplySummary.includes('温柔'),
      '点击重试赠礼 AI 成功补充回应且未重复消耗花束');

    // 已送出花束不可重复送出
    const dupGift = await win.WanxiangMirror.giftBouquetToActiveChar(b1.bouquetId, '11', 'another_req');
    check(dupGift.ok === false && dupGift.reason === 'already_gifted', '已送出花束不可二次赠送');

    // 保存花语纪念卡并验证 giftEventId 去重
    const fm1 = await win.WanxiangMirror.saveFlowerMemento(b1.bouquetId);
    const fm2 = await win.WanxiangMirror.saveFlowerMemento(b1.bouquetId);
    const mems = await win.WanxiangMirror.loadMementos();
    check(
      fm1.ok && fm1.duplicate === false && fm2.ok && fm2.duplicate === true &&
      mems.filter(m => m.sourceType === 'flower_language').length === 1,
      '花语纪念卡按 giftEventId 严格去重，不生成重复卡片'
    );

    // 赠礼中途切换 Char 校验 expectedCharId 防串送
    const switchGuardRes = await win.WanxiangMirror.giftBouquetToActiveChar(b2.bouquetId, '12', 'guard_req');
    check(switchGuardRes.ok === false && switchGuardRes.reason === 'char_changed',
      '预期赠礼 Char 与当前同行 Char 不一致时中止赠礼且保留原花束');

    // 从统一「背包」分页直接赠送 b2：应同步更新花园状态为 gifted
    await win.WanxiangMirror.closeSheetOnly();
    win.WanxiangMirror.switchTab('bag');
    await new Promise(r => setTimeout(r, 20));
    const bagGiftBtn = page.querySelector('[data-wx-gift-item="wx_bouquet_' + b2.bouquetId + '"]');
    await bagGiftBtn.dispatchEvent({ type: 'click', target: bagGiftBtn });
    await page.querySelector('[data-wx-confirm-exec]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-confirm-exec]') });
    gs = await win.WanxiangMirror.loadGardenState();
    const b2AfterBag = gs.bouquets.find(x => x.bouquetId === b2.bouquetId);
    check(b2AfterBag.status === 'gifted' && b2AfterBag.giftedToCharId === '11',
      '通过全局共享背包赠出定制花束时同步将四季花园花束状态标为已送出');

    // 补充 V2.2 收尾异常测试：
    // (a) 共享背包扣减成功但花园写入失败 -> 回补共享背包且花束仍可赠出
    await win.db.config.put({
      key: win.WanxiangMirror.STORAGE_KEYS.GARDEN_V22,
      value: { schemaVersion: 22, flowers: { rose: 3, tulip: 0, sunflower: 0, daisy: 0, lavender: 0, cherry_blossom: 0, hydrangea: 0, lily_of_the_valley: 0 }, bouquets: [], processedRequests: {} }
    });
    const b3 = (await win.WanxiangMirror.craftBouquet({ counts: { rose: 3 }, name: '异常补偿花束', requestId: 'bq_g3' })).bouquet;
    let putCalls = 0;
    const origConfigPut = win.db.config.put;
    win.db.config.put = async function(row) {
      if (row && row.key === win.WanxiangMirror.STORAGE_KEYS.GARDEN_V22) {
        putCalls++;
        // 第1次为 gifting 预写，第2次为最终 gifted 落盘 -> 让第2次失败触发补偿
        if (putCalls === 2) throw new Error('MOCK_GARDEN_FINAL_WRITE_FAIL');
      }
      return await origConfigPut.call(win.db.config, row);
    };
    const origLsSet = win.localStorage.setItem;
    let lsGardenCalls = 0;
    win.localStorage.setItem = function(k, v) {
      if (k === win.WanxiangMirror.STORAGE_KEYS.GARDEN_V22) {
        lsGardenCalls++;
        if (lsGardenCalls === 2) throw new Error('MOCK_LS_GARDEN_FAIL');
      }
      return origLsSet.call(win.localStorage, k, v);
    };
    const abnRes1 = await win.WanxiangMirror.giftBouquetToActiveChar(b3.bouquetId, '11', 'abn_gift_1');
    win.db.config.put = origConfigPut;
    win.localStorage.setItem = origLsSet;
    const ecoAbn = await win.SharedEconomyService.getState();
    const gsAbn = await win.WanxiangMirror.loadGardenState();
    const b3AfterAbn = gsAbn.bouquets.find(x => x.bouquetId === b3.bouquetId);
    check(
      abnRes1.ok === false &&
      ecoAbn.inventory.some(i => i.itemId === 'wx_bouquet_' + b3.bouquetId && i.count === 1) &&
      b3AfterAbn && b3AfterAbn.status === 'owned' && !b3AfterAbn.giftEventId,
      'V2.2 异常测试：共享背包扣减成功但花园终态写入失败时，自动回补背包且花束维持 owned'
    );

    // (b) 赠送中途状态卡在 status==="gifting" 且无 giftEventId -> 可恢复并成功送出，不丢失不重送
    b3AfterAbn.status = 'gifting';
    b3AfterAbn.giftEventId = null;
    await win.db.config.put({ key: win.WanxiangMirror.STORAGE_KEYS.GARDEN_V22, value: gsAbn });
    const recRes = await win.WanxiangMirror.giftBouquetToActiveChar(b3.bouquetId, '11', 'abn_recover_1');
    const recDup = await win.WanxiangMirror.giftBouquetToActiveChar(b3.bouquetId, '11', 'abn_recover_2');
    check(
      recRes.ok === true && recDup.ok === false && recDup.reason === 'already_gifted',
      'V2.2 异常测试：中断停留在 gifting（无 giftEventId）的花束可安全恢复送出且之后禁止重送'
    );
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [5] 湖畔步道：6 情境×3 分支、需选 Char、预览不改时间、草稿续接/放弃/隔离、AI 失败不伪装记录、纪念去重
  // ----------------------------------------------------
  console.log('\n[5] 湖畔步道情境分支、草稿续接隔离、非强制收尾与湖畔纪念去重');
  {
    const h = createV22Harness();
    const { win } = h;
    check(
      win.WanxiangMirror.LAKESIDE_EVENTS.length === 6 &&
      win.WanxiangMirror.LAKESIDE_EVENTS.every(ev => Array.isArray(ev.options) && ev.options.length === 3),
      '湖畔步道包含 6 个情境且每个情境恰好 3 个分支选项'
    );

    await win.db.characters.put({ id: 21, nick: '林栖', name: '林栖' });
    await win.db.characters.put({ id: 22, nick: '顾屿', name: '顾屿' });

    // 未选 Char 时阻止直接散步
    const noCharStart = await win.WanxiangMirror.startLakesideWalk(null, 'no_char_1');
    check(noCharStart.ok === false, '未选择同行 Char 时不允许隐式指定错误角色开始散步');

    // 白昼手动预览夜晚：visualPeriod 变为 night/isPreview=true，真实 startedAt 不被篡改
    const fixedTime = new Date(2026, 4, 15, 13, 30, 0).getTime();
    win.WanxiangMirror.setClock(() => fixedTime);
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '21', timePreview: 'night' });
    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('lakeside_walk', 'lakeside');
    const page = h.getPage();

    await page.querySelector('[data-wx-action="lake-start"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="lake-start"]') });
    let ls = await win.WanxiangMirror.loadLakesideState();
    const draft21 = ls.activeWalksByChar['21'];
    check(
      Boolean(draft21) && draft21.visualPeriod === 'night' && draft21.isPreview === true && draft21.startedAt === fixedTime,
      '手动预览夜晚仅影响湖畔抽取视觉时段，真实时间与 startedAt 不被篡改'
    );

    // 关闭页面重开后草稿可恢复，且切换至 Char 22 完全隔离不串草稿
    await win.WanxiangMirror.closeSheetOnly();
    await win.WanxiangMirror.openLocationSheet('lakeside_walk', 'lakeside');
    check(h.getPage().querySelectorAll('[data-wx-lake-choice]').length === 3, '中断离开再返回湖畔后自动续接当前散步草稿');

    await win.WanxiangMirror.saveMirrorState({ activeCharId: '22' });
    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('lakeside_walk', 'lakeside');
    ls = await win.WanxiangMirror.loadLakesideState();
    check(
      !ls.activeWalksByChar['22'] && Boolean(ls.activeWalksByChar['21']) &&
      Boolean(h.getPage().querySelector('[data-wx-action="lake-start"]')),
      '切换到 Char 22 时不展示 Char 21 未完成散步草稿，两者严格隔离'
    );

    // 切回 Char 21，模拟 AI 失败下选择分支 B：不得将报错文案写入真实 charReply
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '21' });
    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('lakeside_walk', 'lakeside');
    let lakeAiFail = true;
    win.callAI = async () => {
      if (lakeAiFail) throw new Error('LAKESIDE_AI_DOWN');
      return '湖风吹过来，刚才那一幕确实很有趣。';
    };
    const optB = h.getPage().querySelector('[data-wx-lake-choice="B"]');
    await optB.dispatchEvent({ type: 'click', target: optB });

    ls = await win.WanxiangMirror.loadLakesideState();
    const afterOpt = ls.activeWalksByChar['21'];
    check(
      afterOpt.stage === 'choice_done' && afterOpt.aiFailed === true && afterOpt.charReply === '' &&
      Boolean(h.getPage().querySelector('[data-wx-retry-walk-ai="' + afterOpt.walkId + '"]')),
      '湖畔 AI 失败时展示自然备用文案与重试按钮，绝不把报错或假对话存为真实 Char 回复'
    );

    // 重试 AI 成功并结束散步 -> 验证非强制结束界面 & 幂等结算 & 纪念去重
    lakeAiFail = false;
    const retryWalkBtn = h.getPage().querySelector('[data-wx-retry-walk-ai="' + afterOpt.walkId + '"]');
    await retryWalkBtn.dispatchEvent({ type: 'click', target: retryWalkBtn });
    const finBtn = h.getPage().querySelector('[data-wx-lake-finish="' + afterOpt.walkId + '"]');
    await finBtn.dispatchEvent({ type: 'click', target: finBtn });
    const dupFin = await win.WanxiangMirror.finishLakesideWalk(afterOpt.walkId, 'extra_fin');
    check(
      dupFin.idempotent === true &&
      h.getPage().querySelector('#wx-sheet').textContent.includes('要把这段时光收藏起来吗') &&
      Boolean(h.getPage().querySelector('[data-wx-save-lake-mem="' + afterOpt.walkId + '"]')) &&
      Boolean(h.getPage().querySelector('[data-wx-action="lake-skip-memento"]')),
      '结束散步后提供非强制「收藏纪念 / 暂不收藏 / 返回小镇」，且同一 walkId 幂等结算不重复'
    );

    // 收藏纪念并校验 walkId 去重
    await h.getPage().querySelector('[data-wx-save-lake-mem="' + afterOpt.walkId + '"]').dispatchEvent({
      type: 'click', target: h.getPage().querySelector('[data-wx-save-lake-mem="' + afterOpt.walkId + '"]')
    });
    const lmDup = await win.WanxiangMirror.saveLakesideMemento(afterOpt.walkId);
    const allMems = await win.WanxiangMirror.loadMementos();
    check(
      lmDup.duplicate === true && allMems.filter(m => m.sourceType === 'lakeside_walk').length === 1,
      '湖畔纪念卡按 walkId 严格去重，不生成重复收藏'
    );

    // 新开一次后测试「放弃草稿」以及「暂不收藏」
    await win.WanxiangMirror.abandonLakesideWalk('21');
    const st2 = await win.WanxiangMirror.startLakesideWalk('21', 'walk_skip_test');
    await win.WanxiangMirror.chooseLakesideOption(st2.walk.walkId, 'A', 'opt_skip');
    await win.WanxiangMirror.finishLakesideWalk(st2.walk.walkId, 'fin_skip');
    const memCountBeforeSkip = (await win.WanxiangMirror.loadMementos()).length;
    check(memCountBeforeSkip === 1, '选择暂不收藏或未点击收藏时不会强制写入湖畔纪念');
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [6] 跨地点同行情境联动、上下文长度上限、Char 隔离、迟到 AI 作废与零记忆篡改
  // ----------------------------------------------------
  console.log('\n[6] 跨地点同行情境联动、Char 隔离、Prompt 上限与零长期记忆篡改');
  {
    const h = createV22Harness();
    const { win } = h;
    await win.db.characters.put({ id: 31, nick: '沈知行', name: '沈知行' });
    await win.db.characters.put({ id: 32, nick: '江暮', name: '江暮' });
    await win.db.config.put({
      key: win.WanxiangMirror.STORAGE_KEYS.GARDEN_V22,
      value: {
        schemaVersion: 22,
        flowers: { rose: 3, sunflower: 2, tulip: 0, daisy: 0, lavender: 0, cherry_blossom: 0, hydrangea: 0, lily_of_the_valley: 0 },
        bouquets: [],
        processedRequests: {}
      }
    });

    const bq31 = (await win.WanxiangMirror.craftBouquet({ counts: { rose: 3 }, name: '知行专属玫瑰束', requestId: 'ctx_bq1' })).bouquet;
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '31' });
    await win.WanxiangMirror.giftBouquetToActiveChar(bq31.bouquetId, '31', 'ctx_gift_1');

    let promptFor31 = '';
    let promptFor32 = '';
    win.callAI = async (msgs) => {
      const txt = msgs[0].content;
      if (txt.includes('沈知行')) promptFor31 = txt;
      if (txt.includes('江暮')) promptFor32 = txt;
      return '嗯，一起走走吧。';
    };

    // Char 31 在湖畔说话 -> Prompt 应包含刚收到的玫瑰花束，绝不包含未送出的向日葵
    await win.WanxiangMirror.requestCharReaction({ locationName: '湖畔步道', actionDesc: '沿湖散步聊起今天的事' });
    check(
      promptFor31.includes('知行专属玫瑰束') && !promptFor31.includes('向日葵'),
      'Char 31 湖畔回应 Prompt 引用同一同伴刚收到的花束，且不泄露未送出的花篮库存'
    );

    // 切换 Char 32 -> Prompt 不含 Char 31 的花束记录
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '32' });
    await win.WanxiangMirror.requestCharReaction({ locationName: '湖畔步道', actionDesc: '沿湖散步' });
    check(
      promptFor32.includes('江暮') && !promptFor32.includes('知行专属玫瑰束'),
      'Char 32 的同行上下文严格隔离，绝不读取 Char 31 的赠花事件'
    );

    // 写入 15 条事件验证 getCompanionContextForChar 有界上限 (<= 6)
    for (let i = 0; i < 15; i++) {
      await win.WanxiangMirror.recordCompanionEvent('32', 'lakeside_walk', 'lakeside_walk_completed', {
        eventTitle: '事件_' + i, choiceLabel: '选项_' + i
      });
    }
    const bounded = await win.WanxiangMirror.getCompanionContextForChar('32', 6);
    check(bounded.length === 6 && bounded[0].summary.includes('事件_14'),
      '跨地点同行上下文切片严格限制最近 6 条，防 Prompt 无限膨胀');

    // 迟到 AI 在切换 Char 后作废
    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('four_seasons_garden', 'charPicker');
    let resolveSlow;
    win.callAI = () => new Promise(res => { resolveSlow = res; });
    const slowReq = win.WanxiangMirror.requestCharReaction({ locationName: '四季花园', actionDesc: '等待回应' });
    await new Promise(r => setTimeout(r, 10));
    // 通过 UI 选人按钮触发 _aiSeq 自增与切角
    const pick31 = h.getPage().querySelector('[data-wx-pick-char="31"]');
    await pick31.dispatchEvent({ type: 'click', target: pick31 });
    resolveSlow('属于32号的迟到文本');
    const slowRes = await slowReq;
    check(slowRes.ok === false && slowRes.aborted === true,
      '切换同行 Char 后旧角色的在途 AI 回复自动作废不串台');

    // 验证 db.memories 全程未被改写
    const dbMems = await h.memoriesMap.size;
    check(dbMems === 0, '花园、湖畔与跨地点同行联动全程零篡改 db.memories 角色长期记忆');
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [7] 纪念分类筛选（保留咖啡馆留影）、旧存档升级、完整备份恢复与 Android 多层返回
  // ----------------------------------------------------
  console.log('\n[7] 留影与纪念分类筛选、旧存档兼容、备份恢复往返与 Android 返回键');
  {
    const h = createV22Harness();
    const { win, configMap, storageMap } = h;
    await win.db.characters.put({ id: 51, nick: '顾言', name: '顾言' });

    // 预置 V2.0/V2.1 老存档 + 一条无 sourceType 的老咖啡馆留影
    await configMap.set('shared_economy_state_v2', {
      key: 'shared_economy_state_v2',
      value: { coins: 777, diamonds: 10, inventory: [{ itemId: 'item_vinyl', name: '复古黑胶唱机', count: 1 }], logs: [] }
    });
    await configMap.set('wanxiang_mirror_state_v1', {
      key: 'wanxiang_mirror_state_v1',
      value: { schemaVersion: 2, timePreview: 'day', activeCharId: '51', visitedLocations: { mirror_plaza: 111 } }
    });
    await configMap.set('wanxiang_mirror_mementos_v1', {
      key: 'wanxiang_mirror_mementos_v1',
      value: [{
        id: 'legacy_cafe_1',
        locationId: 'afternoon_cafe',
        locationName: '午后咖啡馆',
        charId: '51',
        charName: '顾言',
        periodLabel: '白昼',
        note: '旧版咖啡馆留影记录',
        dateStr: '2026-05-01',
        createdAt: 1000
      }]
    });

    await win.WanxiangMirror.open();
    const gsInit = await win.WanxiangMirror.loadGardenState();
    const lsInit = await win.WanxiangMirror.loadLakesideState();
    check(
      gsInit.flowers.rose === 0 && gsInit.bouquets.length === 0 && Object.keys(lsInit.activeWalksByChar).length === 0,
      'V2.0/V2.1 老存档升级至 V2.2 自动安全补齐花园与湖畔默认值且保留旧留影'
    );

    // 再生成 1 条花语纪念 + 1 条湖畔纪念
    await win.db.config.put({
      key: win.WanxiangMirror.STORAGE_KEYS.GARDEN_V22,
      value: { schemaVersion: 22, flowers: { rose: 3 }, bouquets: [], processedRequests: {} }
    });
    const bq = (await win.WanxiangMirror.craftBouquet({ counts: { rose: 3 }, name: '旧档新花束', requestId: 'up_bq' })).bouquet;
    await win.WanxiangMirror.giftBouquetToActiveChar(bq.bouquetId, '51', 'up_gf');
    await win.WanxiangMirror.saveFlowerMemento(bq.bouquetId);

    const wk = (await win.WanxiangMirror.startLakesideWalk('51', 'up_ws')).walk;
    await win.WanxiangMirror.chooseLakesideOption(wk.walkId, 'A', 'up_wo');
    await win.WanxiangMirror.finishLakesideWalk(wk.walkId, 'up_wf');
    await win.WanxiangMirror.saveLakesideMemento(wk.walkId);

    // 验证全屏「留影」分栏四分类筛选
    win.WanxiangMirror.switchTab('mementos');
    await new Promise(r => setTimeout(r, 20));
    const page = h.getPage();
    check(
      page.querySelector('#wx-subpage').textContent.includes('旧版咖啡馆留影记录') &&
      page.querySelector('#wx-subpage').textContent.includes('花语纪念') &&
      page.querySelector('#wx-subpage').textContent.includes('湖畔纪念'),
      '万象镜「留影」分栏同时完整保留咖啡馆旧留影与 V2.2 花语/湖畔纪念'
    );

    await page.querySelector('[data-wx-mem-filter="flower_language"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-mem-filter="flower_language"]')
    });
    const flHtml = page.querySelector('#wx-subpage').textContent;
    check(flHtml.includes('旧档新花束') && !flHtml.includes('旧版咖啡馆留影记录'),
      '「花语纪念」分类筛选准确过滤出花语卡片');

    await page.querySelector('[data-wx-mem-filter="lakeside_walk"]').dispatchEvent({
      type: 'click', target: page.querySelector('[data-wx-mem-filter="lakeside_walk"]')
    });
    const lkHtml = page.querySelector('#wx-subpage').textContent;
    check(lkHtml.includes('湖畔纪念') && !lkHtml.includes('旧档新花束'),
      '「湖畔纪念」分类筛选准确过滤出湖畔卡片');

    // 完整备份导出 -> 清空 -> 导入恢复 -> 验证恢复后去重与数据一致性
    await win.WanxiangMirror.collectDailyFlower('bk_col_1');
    const exportedCfg = await h.win.db.config.toArray();
    const exportedLS = {};
    for (let i = 0; i < storageMap.size; i++) {
      const k = win.localStorage.key(i);
      exportedLS[k] = win.localStorage.getItem(k);
    }
    configMap.clear();
    storageMap.clear();
    await h.win.db.config.bulkPut(exportedCfg);
    Object.keys(exportedLS).forEach(k => win.localStorage.setItem(k, exportedLS[k]));

    const restoredGarden = await win.WanxiangMirror.loadGardenState();
    const restoredMems = await win.WanxiangMirror.loadMementos();
    const restoredComp = await win.WanxiangMirror.getCompanionContextForChar('51', 6);
    const reSavedFm = await win.WanxiangMirror.saveFlowerMemento(bq.bouquetId);
    const reSavedLm = await win.WanxiangMirror.saveLakesideMemento(wk.walkId);
    const replayCraft = await win.WanxiangMirror.craftBouquet({ counts: { rose: 3 }, name: '旧档新花束', requestId: 'up_bq' });
    const replayGift = await win.WanxiangMirror.giftBouquetToActiveChar(bq.bouquetId, '51', 'up_gf');
    check(
      restoredMems.length === 3 &&
      win.WanxiangMirror.getGardenDailyCollectionStatus(restoredGarden).used === 1 &&
      restoredComp.length >= 2 &&
      reSavedFm.duplicate === true && reSavedLm.duplicate === true &&
      replayCraft.idempotent === true && replayGift.idempotent === true,
      '完整备份恢复往返保留花园/湖畔/同行上下文/三类纪念，且恢复后重放旧 requestId 幂等不重复'
    );

    // 验证地图异常兜底 + Android 多层 popstate 返回链
    win.WanxiangMirror.switchTab('map');
    const imgEl = page.querySelector('#wx-map-img');
    await imgEl.dispatchEvent({ type: 'error' });
    check(page.querySelector('#wx-map-fallback').classList.contains('is-visible') && page.querySelectorAll('.wx-hotspot').length === 9,
      '地图底图异常加载失败时显示兜底提示且九大地点热区依旧可点击');

    await win.WanxiangMirror.openLocationSheet('four_seasons_garden', 'intro');
    await page.querySelector('[data-wx-action="enter-location"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="enter-location"]') });
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetSubView === 'garden' && win.WanxiangMirror.getRuntimeSnapshot().canStepBack === true,
      '进入四季花园二级页，canStepBack=true');
    await win.triggerWindowEvent('popstate');
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetSubView === 'intro', '第 1 次返回从花园子视图退回花园简介卡');
    await win.triggerWindowEvent('popstate');
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetOpen === false && Boolean(h.getPage()), '第 2 次返回关闭地点卡片保留地图');
    await win.triggerWindowEvent('popstate');
    check(h.getPage() === null, '第 3 次返回退出万象镜回到桌面');
  }

  console.log('\n====================================');
  console.log('V2.2 测试汇总: 通过 ' + passed + ' 项, 失败 ' + failed + ' 项');
  console.log('====================================');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
