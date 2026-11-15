// scripts/test-wanxiang-mirror-v30.cjs
// 弯弯小手机｜万象镜 V3.0「会呼吸的小镇」自动化验收测试（Node 模拟 DOM 与全链路回归）
// 说明：本测试在 Node 模拟 DOM 环境中验证 V3.0 小镇时段氛围、Char 主动邀约与防打扰、
//       小镇来信与生活设置、四季生活事件与跨年冬季归属、跨地点真实经历联动、
//       旧档迁移、备份恢复、存储异常诚实报错及多层返回键。
//       不替代真实桌面/手机 Chromium 浏览器或 Android 真机真触控/视觉验收。

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

function createV30Harness(opts) {
  opts = opts || {};
  const storageMap = new Map();
  const configMap = new Map();
  const charMap = new Map();
  const memoriesMap = new Map();
  const winListeners = {};
  const docListeners = {};
  const historyStack = [];
  const toasts = [];
  let rootBodyChildren = [];
  let forceStorageFail = false;
  let forceStorageFailKey = null;
  let reducedMotion = Boolean(opts.reducedMotion);
  let docVisibility = 'visible';

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
    activeElement: null,
    get visibilityState() { return docVisibility; },
    createElement(tag) { return makeElement(tag); },
    getElementById(id) {
      if (id === 'app') return bodyEl;
      return bodyEl.querySelector('#' + id);
    },
    addEventListener(type, fn) {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!docListeners[type]) return;
      docListeners[type] = docListeners[type].filter(f => f !== fn);
    },
    async triggerDocEvent(type, extra) {
      const list = (docListeners[type] || []).slice();
      for (const fn of list) await fn(extra || {});
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
    setInterval,
    clearInterval,
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
    setDocVisibility(val) { docVisibility = val; },
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
    mockDoc,
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
  const mirrorSrc = fs.readFileSync(path.join(__dirname, '../js/wanxiang-mirror.js'), 'utf8');

  // ----------------------------------------------------
  // [1] V3.0 静态资源、CSS、边界约束与数据隔离检查
  // ----------------------------------------------------
  console.log('\n[1] V3.0 静态资源、CSS、九地点边界与禁止项合规检查');
  check(
    /css\/wanxiang-mirror\.css\?v=3\.\d+\.\d+/.test(indexHtml) &&
    /js\/wanxiang-mirror\.js\?v=3\.\d+\.\d+/.test(indexHtml),
    'index.html 已升级至 V3.x 资源版本参数'
  );
  check(
    cssCode.includes('.wx-atmosphere-bar') &&
    cssCode.includes('.wx-letters-btn') &&
    cssCode.includes('.wx-invite-note') &&
    cssCode.includes('.wx-letter-card') &&
    cssCode.includes('.wx-life-setting-row') &&
    cssCode.includes('.wx-seasonal-hint-banner') &&
    cssCode.includes('.wx-seasonal-card') &&
    cssCode.includes('.wx-map-stage.is-dusk-tint::after') &&
    cssCode.includes('.wx-map-stage.is-season-spring::before') &&
    cssCode.includes('.wx-map-stage.is-season-winter::before') &&
    cssCode.includes('@media (max-width: 374px)') &&
    cssCode.includes('@media (prefers-reduced-motion: reduce)'),
    'css/wanxiang-mirror.css 包含完整 V3.0 氛围条、来信、小纸条、季节样式及窄屏/减少动态适配'
  );
  check(
    dataCode.includes("configPrefixes: ['wanxiang_mirror_'") &&
    dataCode.includes("localPrefixes: ['wanxiang_mirror_'"),
    'js/data.js 自动涵盖 wanxiang_mirror_life_v30 与 wanxiang_mirror_invitations_v30 备份及清理'
  );
  check(
    !mirrorSrc.includes('Notification.requestPermission') &&
    !mirrorSrc.includes('new Notification') &&
    !mirrorSrc.includes('serviceWorker'),
    'V3.0 未引入系统通知、Service Worker 或后台轮询 AI 守护进程'
  );

  // ----------------------------------------------------
  // [2] 小镇时段氛围系统：真实时段边界、非 AI 欢迎语、与预览解耦、恢复时间、静默刷新门槛
  // ----------------------------------------------------
  console.log('\n[2] 小镇时段氛围系统、真实/预览解耦与无打扰刷新门禁');
  {
    const h = createV30Harness();
    const { win, mockDoc } = h;

    check(win.WanxiangMirror.LOCATIONS.length === 9, '万象镜严格维持 9 大既有地点（未新增第 10 地点）');

    const boundaryCases = [
      [new Date(2026, 4, 10, 4, 59, 0), 'night'],
      [new Date(2026, 4, 10, 5, 0, 0), 'morning'],
      [new Date(2026, 4, 10, 10, 59, 0), 'morning'],
      [new Date(2026, 4, 10, 11, 0, 0), 'afternoon'],
      [new Date(2026, 4, 10, 16, 59, 0), 'afternoon'],
      [new Date(2026, 4, 10, 17, 0, 0), 'dusk'],
      [new Date(2026, 4, 10, 19, 59, 0), 'dusk'],
      [new Date(2026, 4, 10, 20, 0, 0), 'night'],
      [new Date(2026, 4, 10, 0, 0, 0), 'night']
    ];
    check(
      boundaryCases.every(([dt, exp]) => win.WanxiangMirror.getRealTimeSlotKey(dt) === exp),
      '4 个真实时段边界（05:00/10:59/11:00/16:59/17:00/19:59/20:00/04:59）全部精确命中'
    );

    const slots = ['morning', 'afternoon', 'dusk', 'night'];
    check(
      slots.every(s => Array.isArray(win.WanxiangMirror.WELCOME_GREETINGS[s]) && win.WanxiangMirror.WELCOME_GREETINGS[s].length >= 5),
      '4 个真实时段均配置 >= 5 条固定非 AI 欢迎语'
    );

    // 真实清晨(08:00) + 手动预览黄昏 -> realTimeSlot=morning, displayKey=dusk, isPreview=true, dusk 使用 map-morning + .is-dusk-tint
    win.WanxiangMirror.setClock(() => new Date(2026, 4, 10, 8, 0, 0).getTime());
    await win.WanxiangMirror.saveMirrorState({ timePreview: 'dusk' });
    const page = await win.WanxiangMirror.open();
    const snapPreview = win.WanxiangMirror.getRuntimeSnapshot();
    const atmoSnap = win.WanxiangMirror.getTownAtmosphereSnapshot('dusk');
    const stageEl = page.querySelector('#wx-map-stage');
    const restoreBtn = page.querySelector('[data-wx-atmo-restore]');
    check(
      snapPreview.realTimeSlot === 'morning' && snapPreview.timePreview === 'dusk' &&
      atmoSnap.realTimeSlot === 'morning' && atmoSnap.displayKey === 'dusk' && atmoSnap.isPreview === true &&
      page.querySelector('#wx-map-img').getAttribute('src').includes('map-morning.png') &&
      stageEl.classList.contains('is-dusk-tint') &&
      Boolean(restoreBtn) &&
      page.querySelector('#wx-atmosphere-bar').textContent.includes('清晨'),
      '手动预览黄昏时渲染浅暖暮色滤镜且不篡改 realTimeSlot，顶部展示「跟随当前时间」恢复入口'
    );

    // 点击「跟随当前时间」恢复 auto
    await restoreBtn.dispatchEvent({ type: 'click', target: restoreBtn });
    check(
      win.WanxiangMirror.getRuntimeSnapshot().timePreview === 'auto' &&
      !stageEl.classList.contains('is-dusk-tint') &&
      !page.querySelector('[data-wx-atmo-restore]'),
      '点击「跟随当前时间」立即恢复真实时钟视觉并隐藏恢复按钮'
    );

    // 关闭小镇氛围开关 -> 隐藏氛围条
    await win.WanxiangMirror.saveLifeSettings({ atmosphereEnabled: false });
    await win.WanxiangMirror.saveMirrorState({ timePreview: 'auto' });
    await win.WanxiangMirror.openLocationSheet('mirror_plaza', 'lifeSettings');
    await page.querySelector('[data-wx-action="close-sheet"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-action="close-sheet"]') });
    check(
      page.querySelector('#wx-atmosphere-bar').classList.contains('is-hidden') === true,
      '关闭「小镇时段氛围与欢迎语」设置后地图氛围条安全隐藏'
    );

    // 测试 visibilitychange 与 isInviteUiIdle() 门禁：确认层或弹窗打开时 isInviteUiIdle() 必须为 false
    await win.WanxiangMirror.saveLifeSettings({ atmosphereEnabled: true });
    await win.WanxiangMirror.openLocationSheet('mirror_plaza', 'intro');
    check(win.WanxiangMirror.isInviteUiIdle() === false, '地点弹窗打开期间 isInviteUiIdle() 返回 false，防止氛围刷新/纸条打断');
    await mockDoc.triggerDocEvent('visibilitychange');
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetLocationId === 'mirror_plaza', '弹窗开启时触发 visibilitychange 不干扰当前弹窗内容');

    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [3] Char 主动邀约生成规则：显式 Char、勿扰/总开关、低频7d/72h vs 常规72h/24h、时钟回拨、周期幂等、7天静默过期
  // ----------------------------------------------------
  console.log('\n[3] Char 主动邀约双冷却、无AI确定性生成、防重入、时钟回拨与7天静默过期');
  {
    const h = createV30Harness();
    const { win } = h;
    await win.db.characters.put({ id: 101, nick: '林栖', name: '林栖' });
    await win.db.characters.put({ id: 102, nick: '顾屿', name: '顾屿' });

    const T0 = new Date(2026, 4, 1, 9, 30, 0).getTime(); // 2026-05-01 09:30
    const HOUR = 3600 * 1000;
    const DAY = 24 * HOUR;
    win.WanxiangMirror.setClock(() => T0);

    // 未选择 activeCharId -> 严禁生成或兜底首位角色
    const noCharRes = await win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_no_char' });
    check(noCharRes.ok === false && noCharRes.reason === 'no_active_char', '未选择 activeCharId 时绝不隐式指定首位角色生成邀约');

    // 选择 Char 101，但开关关闭或勿扰 -> 拦截
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '101' });
    await win.WanxiangMirror.saveLifeSettings({ invitationsEnabled: false });
    const offRes = await win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_off' });
    await win.WanxiangMirror.saveLifeSettings({ invitationsEnabled: true, dndMode: true });
    const dndRes = await win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_dnd' });
    check(offRes.reason === 'invitations_disabled' && dndRes.reason === 'dnd_enabled', '关闭主动邀约或开启勿扰模式时严格阻止生成');

    // 恢复开关，未配置 callAI 时前台确定性非 AI 模板生成，且同 cycleKey 并发 10 次至多 1 条
    await win.WanxiangMirror.saveLifeSettings({ invitationsEnabled: true, dndMode: false, invitationFrequency: 'low' });
    const burst = await Promise.all(
      Array.from({ length: 10 }, () => win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_burst_1' }))
    );
    const createdOnes = burst.filter(r => r.ok === true && !r.idempotent);
    const firstInv = createdOnes[0] && createdOnes[0].invitation;
    check(
      createdOnes.length === 1 &&
      Boolean(firstInv) &&
      firstInv.status === 'pending' &&
      firstInv.charId === '101' &&
      Boolean(win.WanxiangMirror.getLocationById(firstInv.locationId)) &&
      firstInv.expiresAt === T0 + 7 * DAY,
      '无 AI 离线环境下确定性生成有效邀约，同周期并发 10 次严格幂等仅生成 1 条'
    );

    // 存在非终态(pending) 时新 cycle 不可再为同 Char 生成
    const nonTermRes = await win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_nonterm' });
    check(nonTermRes.ok === false && nonTermRes.reason === 'existing_non_terminal', '单 Char 存在未结束邀约(pending)时禁止生成第二条');

    // 婉拒后验证低频双冷却：48h 后切 Char 102 受 72h 全局冷却拦截；73h 后 Char 102 可生成；75h 后切回 Char 101 受 7 天单人冷却拦截
    await win.WanxiangMirror.dismissInvitation(firstInv.inviteId, '101');
    win.WanxiangMirror.setClock(() => T0 + 48 * HOUR);
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '102' });
    const globalBlocked = await win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_48h' });

    win.WanxiangMirror.setClock(() => T0 + 73 * HOUR);
    const char102Ok = await win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_73h' });

    win.WanxiangMirror.setClock(() => T0 + 75 * HOUR + 73 * HOUR); // 仅举例：让全局冷却已过去(>=72h after 73h -> 145h), 但距 101 上次仅 145h < 168h(7d)
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '101' });
    const char101Cooldown = await win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_145h' });
    check(
      globalBlocked.reason === 'global_cooldown' &&
      char102Ok.ok === true && char102Ok.invitation.charId === '102' &&
      char101Cooldown.reason === 'char_cooldown',
      '低频模式严格执行双冷却（72h 全局冷却 + 7 天单 Char 冷却）'
    );

    // 常规模式（72h/Char + 24h/global）测试
    await win.WanxiangMirror.saveLifeSettings({ invitationFrequency: 'standard' });
    win.WanxiangMirror.setClock(() => T0 + 180 * HOUR); // 距 101 已 180h >= 72h, 距 102(73h) 已 107h >= 24h
    const std101Ok = await win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_std_101' });
    await win.WanxiangMirror.dismissInvitation(std101Ok.invitation.inviteId, '101');
    win.WanxiangMirror.setClock(() => T0 + 205 * HOUR); // 距 101 已 25h (<72h for 101, >=24h global for 102)
    const std101StillCd = await win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_std_101_cd' });
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '102' });
    await win.WanxiangMirror.dismissInvitation(char102Ok.invitation.inviteId, '102');
    const std102Ok = await win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_std_102_ok' });
    check(
      std101Ok.ok === true && std101StillCd.reason === 'char_cooldown' && std102Ok.ok === true,
      '常规模式准确切换为 72h 单 Char + 24h 全局双冷却'
    );

    // 时钟回拨防护
    win.WanxiangMirror.setClock(() => T0 + 10 * HOUR);
    const rollbackRes = await win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_rollback' });
    check(rollbackRes.ok === false && rollbackRes.reason === 'clock_rollback', '设备时间回拨时拒绝解锁冷却或重复生成邀约');

    // 7 天未处理静默过期，不触发惩罚且不写入 db.memories
    win.WanxiangMirror.setClock(() => T0 + 205 * HOUR + 8 * DAY);
    const bucket102 = await win.WanxiangMirror.getInvitationsForChar('102');
    const expInv = bucket102.history.find(x => x.inviteId === std102Ok.invitation.inviteId);
    check(
      expInv && expInv.status === 'expired' && bucket102.active.length === 0 && h.memoriesMap.size === 0,
      '超过 7 天未处理的邀约静默过期进入历史记录，零负向惩罚且零改写长期记忆'
    );
  }

  // ----------------------------------------------------
  // [4] 小纸条 UI、来信弹窗、状态流转、仅真实已提交事件完成邀约、角色隔离与 AI 润色防串台
  // ----------------------------------------------------
  console.log('\n[4] 邀约小纸条、来信页面、状态流转、仅真实交互完成与跨角色隔离');
  {
    const h = createV30Harness();
    const { win } = h;
    await win.db.characters.put({ id: 201, nick: '沈知行', name: '沈知行' });
    await win.db.characters.put({ id: 202, nick: '温宁', name: '温宁' });
    await setCoinsExact(win, 100);

    const T1 = new Date(2026, 4, 15, 14, 0, 0).getTime();
    win.WanxiangMirror.setClock(() => T1);
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '201' });

    const page = await win.WanxiangMirror.open();
    const noteEl = page.querySelector('#wx-invite-note');
    const bucket201 = await win.WanxiangMirror.getInvitationsForChar('201');
    const activeInv = bucket201.pending[0];
    check(
      Boolean(activeInv) && !noteEl.classList.contains('is-hidden') &&
      noteEl.textContent.includes(activeInv.locationName) &&
      page.querySelector('#wx-letters-count').textContent === '1',
      '进入空闲地图后展示非阻断左下角小纸条并同步顶部「小镇来信」角标'
    );

    // 点击「稍后再说」-> 变为 deferred，小纸条隐藏，来信页「稍后再看」可见
    const deferBtn = noteEl.querySelector('[data-wx-invite-act="defer"]');
    await deferBtn.dispatchEvent({ type: 'click', target: deferBtn });
    const afterDefer = await win.WanxiangMirror.getInvitationsForChar('201');
    check(
      noteEl.classList.contains('is-hidden') &&
      afterDefer.deferred.length === 1 && afterDefer.deferred[0].status === 'deferred',
      '点击「稍后再说」温和收起小纸条并转入「稍后再看」分类'
    );

    // 跨角色隔离检查：Char 202 不得操作或看到 Char 201 的邀约
    const crossAccept = await win.WanxiangMirror.acceptInvitation(activeInv.inviteId, '202');
    check(crossAccept.ok === false && crossAccept.reason === 'char_mismatch', '跨 Char 接受另一角色邀约被严格拦截');

    // 打开「小镇来信」接受邀约 -> 仅跳转到对应地点介绍卡，绝不自动扣费
    await page.querySelector('#wx-letters-btn').dispatchEvent({ type: 'click', target: page.querySelector('#wx-letters-btn') });
    await page.querySelector('[data-wx-letters-tab="deferred"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-letters-tab="deferred"]') });
    await page.querySelector('[data-wx-open-letter="' + activeInv.inviteId + '"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-open-letter="' + activeInv.inviteId + '"]') });
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetSubView === 'letterDetail', '可进入单个来信详情页');

    const detailAccept = page.querySelector('[data-wx-letter-op="accept"]');
    await detailAccept.dispatchEvent({ type: 'click', target: detailAccept });
    const snapOnEnter = win.WanxiangMirror.getRuntimeSnapshot();
    const afterEnterBucket = await win.WanxiangMirror.getInvitationsForChar('201');
    check(
      snapOnEnter.sheetOpen === true &&
      snapOnEnter.sheetLocationId === activeInv.locationId &&
      (await win.SharedEconomyService.getState()).coins === 100 &&
      afterEnterBucket.accepted.length === 1 &&
      afterEnterBucket.history.filter(x => x.status === 'completed').length === 0,
      '点击「一起去」仅打开对应地点卡片且零自动扣费；单纯进入地点绝不误算完成邀约'
    );

    // 验证其他地点动作不能误完成 targetLocId 的邀约
    await win.WanxiangMirror.completeAcceptedInvitationForChar('201', 'nonexistent_loc', 'fake_evt_1', '无效地点');
    let midBucket = await win.WanxiangMirror.getInvitationsForChar('201');
    check(midBucket.accepted.length === 1, '非目标地点或未真实提交的事件不会完成该邀约');

    // 根据 activeInv.locationId 触发对应的真实已提交行为，并校验 completionEventId 去重与完成态
    const targetLoc = activeInv.locationId;
    if (targetLoc === 'afternoon_cafe') {
      await win.WanxiangMirror.orderAtCafe('drink', 'cafe_latte');
    } else if (targetLoc === 'mirror_plaza') {
      await win.WanxiangMirror.claimPlazaWish();
    } else if (targetLoc === 'four_seasons_garden') {
      await win.WanxiangMirror.collectDailyFlower('inv_comp_flower');
    } else if (targetLoc === 'lakeside_walk') {
      const wk = await win.WanxiangMirror.startLakesideWalk('201', 'inv_wk_1');
      await win.WanxiangMirror.chooseLakesideOption(wk.walk.walkId, 'A', 'inv_wk_o1');
      await win.WanxiangMirror.finishLakesideWalk(wk.walk.walkId, 'inv_wk_fin');
    } else if (targetLoc === 'starlight_park') {
      await win.WanxiangMirror.playClawAttempt({ requestId: 'inv_claw_1', rngFn: () => 0.8 });
    } else if (targetLoc === 'shopping_street') {
      await win.WanxiangMirror.purchaseShopGood('item_sticky_notes');
    }
    // 再重放一次相同 completionEventId
    const compReplay = await win.WanxiangMirror.completeAcceptedInvitationForChar('201', targetLoc, activeInv.completionEventId || 'replay_dummy', '重放测试');
    const doneBucket = await win.WanxiangMirror.getInvitationsForChar('201');
    const completedItem = doneBucket.history.find(x => x.inviteId === activeInv.inviteId);
    check(
      completedItem && completedItem.status === 'completed' &&
      doneBucket.accepted.length === 0 &&
      (completedItem.completionEventId ? (await win.WanxiangMirror.completeAcceptedInvitationForChar('201', targetLoc, completedItem.completionEventId)).idempotent === true : compReplay.ok === false),
      '仅在目标地点真实提交一次有效互动后将邀约标为 completed，且 completionEventId 幂等'
    );

    // 验证 accept -> abandonAcceptedInvitation -> 温和结束同行
    win.WanxiangMirror.setClock(() => T1 + 8 * 24 * 3600 * 1000);
    const inv2Res = await win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_abandon_test' });
    await win.WanxiangMirror.acceptInvitation(inv2Res.invitation.inviteId, '201');
    await win.WanxiangMirror.abandonAcceptedInvitation(inv2Res.invitation.inviteId, '201');
    const abBucket = await win.WanxiangMirror.getInvitationsForChar('201');
    check(
      abBucket.accepted.length === 0 &&
      abBucket.history.some(x => x.inviteId === inv2Res.invitation.inviteId && x.status === 'dismissed'),
      '已接受的邀约支持温和取消同行，不卡死后续状态'
    );

    // AI 润色在途切角作废验证
    win.WanxiangMirror.setClock(() => T1 + 16 * 24 * 3600 * 1000);
    const inv3Res = await win.WanxiangMirror.checkAndGenerateActiveInvitation({ cycleKey: 'c_polish_abort' });
    let resolvePolish;
    win.callAI = () => new Promise(res => { resolvePolish = res; });
    try {
      const polP = win.WanxiangMirror.polishInvitationWithAI(inv3Res.invitation.inviteId, '201');
      await new Promise(r => setTimeout(r, 15));
      await win.WanxiangMirror.saveMirrorState({ activeCharId: '202' });
      resolvePolish('迟到的润色便签');
      const polRes = await polP;
      const b201AfterAbort = await win.WanxiangMirror.getInvitationsForChar('201');
      const rawInv3 = b201AfterAbort.pending.find(x => x.inviteId === inv3Res.invitation.inviteId);
      check(
        polRes.ok === false && polRes.aborted === true && rawInv3 && rawInv3.aiPolished === false,
        '邀约 AI 润色期间切换 Char 时在途回复自动作废，绝不串写回旧角色邀约'
      );
    } finally {
      delete win.callAI;
    }

    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [5] 季节生活事件：跨年冬季归属、4 季地点与选项、跨季草稿保留、纪念去重与边界隔离
  // ----------------------------------------------------
  console.log('\n[5] 季节生活事件、跨年冬季归属、跨季在途续接、纪念去重与边界隔离');
  {
    const h = createV30Harness();
    const { win } = h;
    await win.db.characters.put({ id: 301, nick: '夏知意', name: '夏知意' });
    await win.db.characters.put({ id: 302, nick: '江暮', name: '江暮' });

    // 跨年冬季 seasonYear 验证：2026-12 与 2027-01/02 同归 2026；2027-03 归 2027
    check(
      win.WanxiangMirror.getSeasonalYear(new Date(2026, 11, 25)) === 2026 &&
      win.WanxiangMirror.getSeasonalYear(new Date(2027, 0, 15)) === 2026 &&
      win.WanxiangMirror.getSeasonalYear(new Date(2027, 1, 20)) === 2026 &&
      win.WanxiangMirror.getSeasonalYear(new Date(2027, 2, 1)) === 2027,
      '跨年冬季（12 月及次年 1–2 月）统一锚定 12 月所在 seasonYear，3 月正确切换新年春'
    );

    const sKeys = ['spring', 'summer', 'autumn', 'winter'];
    check(
      sKeys.every(k => {
        const ev = win.WanxiangMirror.SEASONAL_EVENTS_V30[k];
        return ev && ev.options.length === 3 && Boolean(win.WanxiangMirror.getLocationById(ev.locationId));
      }),
      '春/夏/秋/冬 4 个季节生活事件均映射至既有地点且每季含 3 个互动选项'
    );

    // 未选 Char 禁止开启季节事件
    const noCharSeas = await win.WanxiangMirror.startSeasonalEventInteraction(null, 'no_char_s');
    check(noCharSeas.ok === false && noCharSeas.reason === 'no_char', '未选同行 Char 时禁止开启季节互动');

    // 5月春季开启草稿 -> 跨季进入 6 月夏季后仍保留春季草稿并可完成 & 收藏纪念卡
    win.WanxiangMirror.setClock(() => new Date(2026, 4, 31, 23, 50, 0).getTime());
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '301' });
    const startSpring = await win.WanxiangMirror.startSeasonalEventInteraction('301', 'sp_cross_1');
    check(startSpring.ok && startSpring.draft.seasonId === 'spring' && startSpring.draft.seasonYear === 2026,
      '5 月末开启春季「春日花信日」草稿并锁定 seasonYear=2026');

    win.WanxiangMirror.setClock(() => new Date(2026, 5, 1, 0, 10, 0).getTime()); // 6 月夏季！
    await win.WanxiangMirror.open();
    await win.WanxiangMirror.openLocationSheet('four_seasons_garden', 'garden');
    const page = h.getPage();
    const bannerInGarden = page.querySelector('[data-wx-open-seasonal="four_seasons_garden"]');
    check(
      Boolean(bannerInGarden) && bannerInGarden.textContent.includes('继续季节互动'),
      '跨月进入夏季后，进行中的春季草稿在四季花园仍保留入口供继续完成，绝不强行销毁'
    );

    await bannerInGarden.dispatchEvent({ type: 'click', target: bannerInGarden });
    let failSeasAi = true;
    win.callAI = async () => {
      if (failSeasAi) throw new Error('SEAS_AI_DOWN');
      return '那两片花瓣现在还静静夹在页角呢。';
    };
    try {
      await page.querySelector('[data-wx-seasonal-choice="A"]').dispatchEvent({
        type: 'click', target: page.querySelector('[data-wx-seasonal-choice="A"]')
      });
      let lifeAfterFail = await win.WanxiangMirror.loadLifeState();
      const draftFail = lifeAfterFail.activeSeasonalDrafts['301'];
      const retryBtn = page.querySelector('[data-wx-seasonal-retry-ai="' + draftFail.draftId + '"]');
      check(
        draftFail.status === 'completed' && draftFail.aiFailed === true && draftFail.charReply === '' && Boolean(retryBtn),
        '季节互动选择后若 AI 失败仍保留真实结果并提供重试按钮，绝不存假对话'
      );

      failSeasAi = false;
      await retryBtn.dispatchEvent({ type: 'click', target: retryBtn });
      await page.querySelector('[data-wx-save-seasonal-mem="' + draftFail.draftId + '"]').dispatchEvent({
        type: 'click', target: page.querySelector('[data-wx-save-seasonal-mem="' + draftFail.draftId + '"]')
      });
      const dupSave = await win.WanxiangMirror.saveSeasonalMemento(draftFail.draftId);
      const mems = await win.WanxiangMirror.loadMementos();
      const seasMems = mems.filter(m => m.sourceType === 'seasonal_event');
      check(
        dupSave.duplicate === true && seasMems.length === 1 &&
        seasMems[0].seasonId === 'spring' && seasMems[0].seasonYear === 2026 &&
        seasMems[0].charReplySummary.includes('花瓣'),
        '季节纪念卡按 charId:seasonYear:seasonId:eventId 严格去重，跨季完成仍正确归档春季 2026'
      );
    } finally {
      delete win.callAI;
    }

    // 边界检查：Char 302 参与夏季「夏夜星灯会」不会免费赠送游乐场抓娃娃/摩天轮/木马次数，也不会更改花园采花每日3次限制
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '302' });
    await setCoinsExact(win, 0);
    const sumStart = await win.WanxiangMirror.startSeasonalEventInteraction('302', 'sum_302');
    await win.WanxiangMirror.selectSeasonalEventOption(sumStart.draft.draftId, 'B', 'sum_opt_302');
    const sumMem = await win.WanxiangMirror.saveSeasonalMemento(sumStart.draft.draftId);
    const gsAfterSeas = await win.WanxiangMirror.loadGardenState();
    check(
      sumMem.ok && !sumMem.duplicate &&
      (await win.SharedEconomyService.getState()).coins === 0 &&
      win.WanxiangMirror.getGardenDailyCollectionStatus(gsAfterSeas).remaining === 3 &&
      h.memoriesMap.size === 0,
      '季节事件绝不发放免费金币、不绕过花园每日3次/游乐场收费限制、不篡改 db.memories'
    );
    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [6] 跨地点真实经历联动：合法性过滤、排除取消/退款、防连续复读、Prompt 分层与跨角色隔离
  // ----------------------------------------------------
  console.log('\n[6] 跨地点真实经历上下文过滤、防机械重复开场、分层 Prompt 与零污染检查');
  {
    const h = createV30Harness();
    const { win } = h;
    await win.db.characters.put({ id: 401, nick: '陆离', name: '陆离', personality: '温和直接' });
    await win.db.characters.put({ id: 402, nick: '江暮', name: '江暮', personality: '细腻沉静' });
    await win.db.config.put({
      key: 'lorebooks',
      value: [
        { id: 'lb401', scope: 'personal', charIds: [401], enabled: true, entries: [{ enabled: true, content: '陆离偏爱无糖美式' }] },
        { id: 'lb402', scope: 'personal', charIds: [402], enabled: true, entries: [{ enabled: true, content: '江暮喜欢深夜听旧黑胶' }] }
      ]
    });

    // 注入真实事件 + 脏事件（非法 locationId / refunded / abandoned）
    await win.WanxiangMirror.recordCompanionEvent('401', 'invalid_city_xyz', 'lakeside_walk_completed', { eventTitle: '幻觉地点事件', choiceLabel: 'A' });
    await win.WanxiangMirror.recordCompanionEvent('401', 'starlight_park', 'claw_attempt_refunded', { summary: '被退款作废事件', refunded: true });
    await win.WanxiangMirror.recordCompanionEvent('401', 'starwish_station', 'train_journey_abandoned', { summary: '主动放弃行程', abandoned: true });
    const valid1 = await win.WanxiangMirror.recordCompanionEvent('401', 'afternoon_cafe', 'cafe_order', { itemName: '香草桂花乌龙' });
    const valid2 = await win.WanxiangMirror.recordCompanionEvent('401', 'lakeside_walk', 'lakeside_walk_completed', { eventTitle: '白鹅与睡莲', choiceLabel: '停下来看一会儿' });

    const ctxNoEx = await win.WanxiangMirror.getCompanionContextForChar('401', { limit: 6 });
    const ctxWithEx = await win.WanxiangMirror.getCompanionContextForChar('401', { limit: 6, excludeEventId: ctxNoEx[0].eventId });
    check(
      ctxNoEx.length === 2 &&
      !ctxNoEx.some(e => e.summary.includes('幻觉') || e.summary.includes('退款') || e.summary.includes('放弃')) &&
      ctxWithEx[0].eventId === valid1.eventId,
      'getCompanionContextForChar 严格过滤非法地点与退款/取消记录，且 excludeEventId 避免连续以同一条为主导记忆'
    );

    // 验证 requestCharReaction 分层 Prompt & 跨 Char 隔离
    const capturedPrompts = {};
    win.callAI = async (msgs) => {
      const txt = msgs[0].content;
      if (txt.includes('陆离')) capturedPrompts['401'] = txt;
      if (txt.includes('江暮')) capturedPrompts['402'] = txt;
      return '记得那杯桂花乌龙很香。';
    };
    try {
      await win.WanxiangMirror.saveMirrorState({ activeCharId: '401' });
      await win.WanxiangMirror.requestCharReaction({ locationName: '镜心广场', actionDesc: '傍晚路过喷泉边' });
      await win.WanxiangMirror.saveMirrorState({ activeCharId: '402' });
      await win.WanxiangMirror.requestCharReaction({ locationName: '镜心广场', actionDesc: '傍晚路过喷泉边' });

      const p401 = capturedPrompts['401'] || '';
      const p402 = capturedPrompts['402'] || '';
      check(
        p401.includes('【角色基础人设与风格】') &&
        p401.includes('【最近一起经历的真实小镇互动') &&
        p401.includes('【当前小镇时段与场景】') &&
        p401.includes('【当前实际发生】') &&
        p401.includes('香草桂花乌龙') && !p401.includes('深夜听旧黑胶') &&
        p402.includes('江暮') && !p402.includes('香草桂花乌龙') && !p402.includes('无糖美式'),
        'Prompt 按人设/世界书/近期真实互动/当前场景分层拼装，严格隔离跨角色事件与世界书'
      );
    } finally {
      delete win.callAI;
    }
  }

  // ----------------------------------------------------
  // [7] V2.4 旧档迁移、备份恢复往返、存储失败诚实提示、留影季节筛选与多层 popstate 返回
  // ----------------------------------------------------
  console.log('\n[7] V2.4 旧档升级、备份恢复往返、存储异常诚实返回、留影季节筛选与多层返回链');
  {
    const h = createV30Harness();
    const { win, configMap, storageMap } = h;
    await win.db.characters.put({ id: 501, nick: '林栖', name: '林栖' });
    await configMap.set('shared_economy_state_v2', {
      key: 'shared_economy_state_v2',
      value: { coins: 888, diamonds: 12, inventory: [{ itemId: 'item_vinyl', name: '复古黑胶唱机', count: 1 }], logs: [] }
    });
    await configMap.set('wanxiang_mirror_state_v1', {
      key: 'wanxiang_mirror_state_v1',
      value: { schemaVersion: 2, timePreview: 'day', activeCharId: '501', visitedLocations: { starwish_station: 200 } }
    });

    win.WanxiangMirror.setClock(() => new Date(2026, 9, 12, 17, 30, 0).getTime()); // 秋季黄昏
    await win.WanxiangMirror.open();
    const lifeInit = await win.WanxiangMirror.loadLifeState();
    check(
      (await win.SharedEconomyService.getState()).coins === 888 &&
      lifeInit.schemaVersion === 30 &&
      lifeInit.settings.invitationFrequency === 'low',
      'V2.4 已有金币、背包、状态无损升级至 V3.0 并安全补齐默认生活设置（默认低频）'
    );

    // 开启一次秋季互动并存纪念 + 验证留影页 'seasonal_event' 筛选
    const sRes = await win.WanxiangMirror.startSeasonalEventInteraction('501', 'bk_s1');
    await win.WanxiangMirror.selectSeasonalEventOption(sRes.draft.draftId, 'A', 'bk_so1');
    await win.WanxiangMirror.saveSeasonalMemento(sRes.draft.draftId);
    await win.WanxiangMirror.saveCafeMemento('咖啡旧纪念');

    // 导出 -> 清空 -> 恢复往返校验
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

    const lifeBk = await win.WanxiangMirror.loadLifeState();
    const invBk = await win.WanxiangMirror.loadInvitationsState();
    const memBk = await win.WanxiangMirror.loadMementos();
    check(
      Object.keys(lifeBk.seasonalMementosIndex).length === 1 &&
      invBk.invitations.length >= 1 &&
      memBk.some(m => m.sourceType === 'seasonal_event') &&
      memBk.some(m => m.sourceType === 'cafe_photo'),
      '全量备份/清空/恢复往返完整保留 V3.0 来信状态、季节记录与历史留影'
    );

    // 存储配额写入失败诚实返回
    win.setStorageFail(true, win.WanxiangMirror.STORAGE_KEYS.LIFE_V30);
    const failSaveSettings = await win.WanxiangMirror.saveLifeSettings({ dndMode: true });
    win.setStorageFail(false);
    check(
      Boolean(failSaveSettings && failSaveSettings.ok === false && failSaveSettings.reason === 'storage_failed'),
      '存储配额失败时 saveLifeSettings 真实返回 { ok:false, reason:"storage_failed" }，绝不伪造成功'
    );

    // 留影页新增「季节纪念」筛选（保留咖啡馆等旧分类）
    win.WanxiangMirror.switchTab('mementos');
    await new Promise(r => setTimeout(r, 20));
    const page = h.getPage();
    const seasFilterBtn = page.querySelector('[data-wx-mem-filter="seasonal_event"]');
    await seasFilterBtn.dispatchEvent({ type: 'click', target: seasFilterBtn });
    const subTxt = page.querySelector('#wx-subpage').textContent;
    check(
      Boolean(seasFilterBtn) && subTxt.includes('秋叶湖畔漫步') && !subTxt.includes('咖啡旧纪念'),
      '留影页「季节纪念」筛选正确展示季节纪念卡且保留旧分类'
    );

    // 多层 Android popstate 返回：letters -> lifeSettings -> pop -> letters -> pop -> map -> pop -> desktop
    win.WanxiangMirror.switchTab('map');
    await new Promise(r => setTimeout(r, 15));
    await page.querySelector('#wx-letters-btn').dispatchEvent({ type: 'click', target: page.querySelector('#wx-letters-btn') });
    await page.querySelector('[data-wx-open-life-settings="letters"]').dispatchEvent({ type: 'click', target: page.querySelector('[data-wx-open-life-settings="letters"]') });
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetSubView === 'lifeSettings', '已从「小镇来信」进入「生活与邀约设置」');

    await win.triggerWindowEvent('popstate');
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetSubView === 'letters', '第 1 次 popstate 从生活设置退回小镇来信');
    await win.triggerWindowEvent('popstate');
    check(win.WanxiangMirror.getRuntimeSnapshot().sheetOpen === false && Boolean(h.getPage()), '第 2 次 popstate 从来信退回小镇地图');
    await win.triggerWindowEvent('popstate');
    check(h.getPage() === null, '第 3 次 popstate 退出万象镜回到小手机桌面');
  }

  console.log('\n====================================');
  console.log('V3.0 测试汇总: 通过 ' + passed + ' 项, 失败 ' + failed + ' 项');
  console.log('====================================');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
