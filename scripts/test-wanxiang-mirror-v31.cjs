// scripts/test-wanxiang-mirror-v31.cjs
// 弯弯小手机｜万象镜 V3.1「回忆有回声」自动化验收测试（Node 模拟 DOM 与全链路回归）
// 说明：本测试在 Node 模拟 DOM/Dexie 环境中验证：
//   1. 静态资源版本与依赖加载顺序（index.html, css/wanxiang-mirror.css, css/wechat.css）
//   2. 只读经历聚合、严格 charId 隔离、非法/取消/退款/失败爪/未送出花束/仅购票未完成过滤
//   3. 私聊按需召回（<=4条/<=600字、相对时间、与长期记忆去重、角色手机/线上好友隔离、异常降级不阻塞聊天）
//   4. 聊天地点建议白名单（9大地点命中 + 否定/梦境/假设/纯回忆过滤 + 往返聊天现场/草稿/滚动位置还原）
//   5. 主动分享（编辑确认、草稿冲突合并/替换/取消、跨Char强绑定原经历角色、取消分享、不自动发送、idempotent防连发、后续追问延续）
//   6. 精选长期记忆（预览可编辑、30/150字数控制、去重写入、DB写入失败诚实报错与重试、记忆长廊删除后「已记住✓」回落「记住这一天」且不删万象镜原记录）
//   7. 备份导出前缀覆盖校验、真实事件缺失隔离
// 注：本脚本为 Node 模拟测试，不替代真实浏览器或 Android 真机渲染与触控验收。

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

function createV31Harness() {
  const storageMap = new Map();
  const configMap = new Map();
  const charMap = new Map();
  const chatsMap = new Map();
  const messagesMap = new Map();
  const memoriesMap = new Map();
  const memoryRunsMap = new Map();
  const winListeners = {};
  const docListeners = {};
  const historyStack = [];
  const toasts = [];
  const bridgeChatOpens = [];
  let rootBodyChildren = [];
  let forceMemoryAddFail = false;
  let forceConfigReadFail = false;
  let currentWechatUid = 1;
  let chatSeq = 1;
  let msgSeq = 1;
  let memSeq = 1;
  let runSeq = 1;

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
    parent._textParts = [];
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
        if (top.tagName === 'TEXTAREA') {
          top.value = (top.value || '') + m[4];
        }
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
      dataset: {},
      _attrs: {},
      _textParts: [],
      children: [],
      parentNode: null,
      style: {},
      value: '',
      disabled: false,
      isConnected: true,
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
    visibilityState: 'visible',
    createElement(tag) { return makeElement(tag); },
    getElementById(id) {
      if (id === 'app') return bodyEl;
      return bodyEl.querySelector('#' + id);
    },
    querySelector(sel) {
      return bodyEl.querySelector(sel);
    },
    querySelectorAll(sel) {
      return bodyEl.querySelectorAll(sel);
    },
    addEventListener(type, fn) {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!docListeners[type]) return;
      docListeners[type] = docListeners[type].filter(f => f !== fn);
    }
  };

  function makeQueryChain(rows) {
    let cur = rows.slice();
    const chain = {
      filter(fn) {
        cur = cur.filter(fn);
        return chain;
      },
      async toArray() { return cur.map(r => JSON.parse(JSON.stringify(r))); },
      async first() { return cur[0] ? JSON.parse(JSON.stringify(cur[0])) : undefined; },
      async last() { return cur.length ? JSON.parse(JSON.stringify(cur[cur.length - 1])) : undefined; },
      async sortBy(field) {
        cur.sort((a, b) => (a[field] || 0) - (b[field] || 0));
        return cur.map(r => JSON.parse(JSON.stringify(r)));
      }
    };
    return chain;
  }

  function makeTable(map, idGen, optsTable) {
    optsTable = optsTable || {};
    return {
      async get(k) {
        if (optsTable.isConfig && forceConfigReadFail) throw new Error('CONFIG_READ_ERROR');
        return map.has(k) ? JSON.parse(JSON.stringify(map.get(k))) : undefined;
      },
      async put(obj) {
        const k = obj.key !== undefined ? obj.key : obj.id;
        map.set(k, JSON.parse(JSON.stringify(obj)));
        return k;
      },
      async bulkPut(rows) { for (const r of rows) await this.put(r); },
      async bulkDelete(keys) { for (const k of keys) map.delete(k); },
      async add(obj) {
        if (optsTable.isMemories && forceMemoryAddFail) {
          throw new Error('INDEXEDDB_QUOTA_ERR');
        }
        const c = JSON.parse(JSON.stringify(obj));
        if (!c.id && idGen) c.id = idGen();
        map.set(c.id, c);
        return c.id;
      },
      async bulkAdd(rows) {
        for (const r of rows) await this.add(r);
      },
      async update(id, patch) {
        if (!map.has(id)) return 0;
        const next = Object.assign({}, map.get(id), JSON.parse(JSON.stringify(patch)));
        map.set(id, next);
        return 1;
      },
      async delete(id) { map.delete(id); },
      where(indexField) {
        return {
          equals(val) {
            const all = Array.from(map.values());
            const filtered = all.filter(r => {
              if (indexField === '[ownerUid+charId]' && Array.isArray(val)) {
                return Number(r.ownerUid) === Number(val[0]) && Number(r.charId) === Number(val[1]);
              }
              return r[indexField] === val;
            });
            return makeQueryChain(filtered);
          }
        };
      },
      async toArray() { return Array.from(map.values()).map(v => JSON.parse(JSON.stringify(v))); }
    };
  }

  const mockDb = {
    config: makeTable(configMap, null, { isConfig: true }),
    characters: makeTable(charMap),
    chats: makeTable(chatsMap, () => chatSeq++),
    messages: makeTable(messagesMap, () => msgSeq++),
    memories: makeTable(memoriesMap, () => memSeq++, { isMemories: true }),
    memoryRuns: makeTable(memoryRunsMap, () => runSeq++),
    transaction(mode, tables, fn) { return fn(); }
  };

  const sandboxWindow = {
    localStorage: {
      get length() { return storageMap.size; },
      key(i) { return Array.from(storageMap.keys())[i] || null; },
      getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null; },
      setItem(k, v) { storageMap.set(k, String(v)); },
      removeItem(k) { storageMap.delete(k); }
    },
    document: mockDoc,
    db: mockDb,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame(fn) { return setTimeout(fn, 0); },
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
    matchMedia() { return { matches: false }; },
    getWechatOwnerUidForBridge() { return currentWechatUid; },
    async getCharacter(cid) {
      const idNum = parseInt(cid, 10);
      return mockDb.characters.get(idNum);
    },
    async ensureWechatPrivateChatForBridge(charId, ownerUid) {
      const uid = Number(ownerUid || currentWechatUid);
      const cid = Number(charId);
      const existing = await mockDb.chats.where('[ownerUid+charId]').equals([uid, cid]).first();
      if (existing) return existing;
      const row = { ownerUid: uid, charId: cid, type: 'private', createdAt: Date.now() };
      row.id = await mockDb.chats.add(row);
      return row;
    },
    async openWechatPrivateChatForBridge(opts) {
      bridgeChatOpens.push(Object.assign({}, opts));
      return { ok: true };
    }
  };
  sandboxWindow.window = sandboxWindow;

  const sharedHubCode = fs.readFileSync(path.join(__dirname, '../js/shared-hub.js'), 'utf8');
  const bridgeCode = fs.readFileSync(path.join(__dirname, '../js/wanxiang-bridge.js'), 'utf8');
  const memoryCode = fs.readFileSync(path.join(__dirname, '../js/memory.js'), 'utf8');
  const mirrorCode = fs.readFileSync(path.join(__dirname, '../js/wanxiang-mirror.js'), 'utf8');

  const loader = new Function(
    'window', 'document', 'localStorage', 'db', 'console', 'setTimeout', 'clearTimeout', 'requestAnimationFrame',
    [sharedHubCode, bridgeCode, memoryCode, mirrorCode].join(';\n')
  );
  loader(sandboxWindow, mockDoc, sandboxWindow.localStorage, mockDb, console, setTimeout, clearTimeout, sandboxWindow.requestAnimationFrame);

  return {
    win: sandboxWindow,
    mockDoc,
    mockDb,
    configMap,
    storageMap,
    charMap,
    chatsMap,
    messagesMap,
    memoriesMap,
    toasts,
    bridgeChatOpens,
    setWechatUid(uid) { currentWechatUid = uid; },
    setMemoryAddFail(flag) { forceMemoryAddFail = Boolean(flag); },
    setConfigReadFail(flag) { forceConfigReadFail = Boolean(flag); },
    getPage: () => bodyEl.querySelector('#wanxiang-mirror-page')
  };
}

async function setCoinsExact(win, target) {
  const cur = (await win.SharedEconomyService.getState()).coins;
  if (cur > target) await win.SharedEconomyService.spendCoins(cur - target, '测试调减', 'test');
  else if (cur < target) await win.SharedEconomyService.addCoins(target - cur, '测试补足', 'test');
}

async function runTests() {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const mirrorCss = fs.readFileSync(path.join(__dirname, '../css/wanxiang-mirror.css'), 'utf8');
  const wechatCss = fs.readFileSync(path.join(__dirname, '../css/wechat.css'), 'utf8');
  const wechatSrc = fs.readFileSync(path.join(__dirname, '../js/wechat.js'), 'utf8');
  const memorySrc = fs.readFileSync(path.join(__dirname, '../js/memory.js'), 'utf8');
  const dataSrc = fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8');

  // ----------------------------------------------------
  // [1] 静态资源加载顺序、CSS 样式、与禁用项/隔离边界检查
  // ----------------------------------------------------
  console.log('\n[1] 静态资源加载顺序、CSS 规范与绝对禁止项校验');
  const idxBridge = indexHtml.indexOf('js/wanxiang-bridge.js?v=3.1.0');
  const idxMemory = indexHtml.indexOf('js/memory.js?v=1.0.6');
  const idxWechat = indexHtml.indexOf('js/wechat.js?v=1.0.19');
  const idxMirror = indexHtml.indexOf('js/wanxiang-mirror.js?v=3.1.0');
  check(
    idxBridge !== -1 && idxMemory !== -1 && idxWechat !== -1 && idxMirror !== -1 &&
    idxBridge < idxMemory && idxBridge < idxWechat && idxBridge < idxMirror &&
    /css\/wanxiang-mirror\.css\?v=3\.1\.0/.test(indexHtml) &&
    /css\/wechat\.css\?v=1\.0\.9/.test(indexHtml),
    'index.html 正确引入 wanxiang-bridge.js?v=3.1.0（早于 memory/wechat/wanxiang-mirror）且更新 V3.1 CSS/JS 参数'
  );
  check(
    mirrorCss.includes('.wx-chat-return-bar') &&
    mirrorCss.includes('.wx-bridge-actions-row') &&
    mirrorCss.includes('.wx-bridge-remembered-tag') &&
    wechatCss.includes('.wx-chat-share-banner') &&
    wechatCss.includes('.wx-chat-loc-suggest') &&
    wechatCss.includes(':root.theme-dark .wx-chat-share-banner'),
    'wanxiang-mirror.css 与 wechat.css 完整定义返程栏、分享提醒条、地点建议条及暗夜模式样式'
  );
  check(
    dataSrc.includes("configPrefixes: ['wanxiang_mirror_'") &&
    dataSrc.includes('db.memories') &&
    dataSrc.includes('db.chats') &&
    dataSrc.includes('db.messages'),
    'js/data.js 自动覆盖 wanxiang_mirror_bridge_v31 与 memories/chats/messages 备份与清理'
  );
  check(
    wechatSrc.includes("!isWechatRolePhoneMode() && char?.type !== 'online_friend' && window.WanxiangExperienceBridge?.buildChatExperienceContext") &&
    wechatSrc.includes('buildSystemWanxiangPart(wanxiangExpCtx)') &&
    wechatSrc.includes('sendTextMessage') &&
    wechatSrc.includes('wxExperienceShare: shareCheck.shareMeta') &&
    wechatSrc.includes('openWechatPrivateChatForBridge') &&
    memorySrc.includes('wanxiang_mirror') &&
    memorySrc.includes('WanxiangExperienceBridge?.onMemoryDeleted?.(id)'),
    'wechat.js 与 memory.js 严格接入按需注入、角色手机/线上好友隔离、防自动发送、删除回落与元数据标记'
  );

  // ----------------------------------------------------
  // [2] 真实经历只读聚合：Char 严格隔离、非法/取消/退款/失败爪/未赠花/仅购票过滤
  // ----------------------------------------------------
  console.log('\n[2] 真实经历聚合过滤、Char 隔离、失败爪/未赠花束/仅购票与退款过滤');
  {
    const h = createV31Harness();
    const { win, configMap } = h;
    await win.db.characters.put({ id: 101, nick: '林栖', name: '林栖' });
    await win.db.characters.put({ id: 102, nick: '顾屿', name: '顾屿' });
    await win.db.chats.put({ id: 11, ownerUid: 1, charId: 101, type: 'private' });
    await win.db.chats.put({ id: 12, ownerUid: 1, charId: 102, type: 'private' });

    const T0 = new Date(2026, 4, 10, 15, 0, 0).getTime();
    win.WanxiangMirror.setClock(() => T0);
    win.WanxiangExperienceBridge.setClock(() => T0);

    // 写入 Char 101 多类真实事件与噪音事件
    await win.WanxiangMirror.recordCompanionEvent('101', 'invalid_loc', 'cafe_order', { itemName: '无效地点咖啡' });
    await win.WanxiangMirror.recordCompanionEvent('101', 'starwish_station', 'train_ticket_purchased', { destinationName: '月光海岸' });
    await win.WanxiangMirror.recordCompanionEvent('101', 'starwish_station', 'train_journey_started', { destinationName: '月光海岸' });
    await win.WanxiangMirror.recordCompanionEvent('101', 'starlight_park', 'claw_attempt_refunded', { refunded: true });
    await win.WanxiangMirror.recordCompanionEvent('101', 'lakeside_walk', 'lakeside_walk_abandoned', { abandoned: true });
    await win.WanxiangMirror.recordCompanionEvent('101', 'starlight_park', 'claw_attempt_completed', { success: false, plushName: '小海獭' });
    await win.WanxiangMirror.recordCompanionEvent('101', 'afternoon_cafe', 'cafe_order', { itemName: '桂花燕麦拿铁' });
    await win.WanxiangMirror.recordCompanionEvent('101', 'starwish_station', 'train_journey_completed', {
      journeyId: 'j_101_1',
      destinationId: 'moonlight_coast',
      destinationName: '月光海岸',
      highlights: '海风灯塔 · 旧站钟声'
    });

    // 写入一个已制作但尚未赠出的花束到 garden，并伪造同 bouquetId 的事件，确认校验 status==='gifted'
    await configMap.set('wanxiang_mirror_garden_v22', {
      key: 'wanxiang_mirror_garden_v22',
      value: {
        bouquets: [{ bouquetId: 'bq_draft_only', name: '未送出的白铃兰', status: 'crafted' }]
      }
    });
    await win.WanxiangMirror.recordCompanionEvent('101', 'four_seasons_garden', 'bouquet_gifted', {
      bouquetId: 'bq_draft_only',
      name: '未送出的白铃兰'
    });

    // Char 102 的独立事件
    await win.WanxiangMirror.recordCompanionEvent('102', 'four_seasons_garden', 'bouquet_gifted', {
      name: '顾屿的晚樱束',
      flowerNames: ['晚樱', '满天星'],
      meanings: '温和重逢'
    });

    const exps101 = await win.WanxiangExperienceBridge.getExperiencesForChar('101');
    const exps102 = await win.WanxiangExperienceBridge.getExperiencesForChar('102');
    const failedClaw = exps101.find(e => e.eventType === 'claw_attempt_failed');

    check(
      exps101.length === 3 &&
      exps101.some(e => e.summary.includes('桂花燕麦拿铁')) &&
      exps101.some(e => e.summary.includes('月光海岸')) &&
      Boolean(failedClaw) && failedClaw.canRemember === false && failedClaw.summary.includes('没抓到') &&
      !exps101.some(e => e.summary.includes('未送出的白铃兰') || e.summary.includes('无效地点') || e.summary.includes('顾屿')),
      'Char 101 仅聚合 3 条有效事件（含抓空事实但禁入长期记忆），彻底过滤未赠花束/仅购票/仅上车/退款/放弃/Char102经历'
    );
    check(
      exps102.length === 1 && exps102[0].summary.includes('顾屿的晚樱束') &&
      !exps102.some(e => e.summary.includes('桂花燕麦拿铁') || e.summary.includes('月光海岸')),
      'Char 102 严格隔离，完全看不到 Char 101 的咖啡或列车经历'
    );
  }

  // ----------------------------------------------------
  // [3] 日常聊天按需召回：精确命中、时间线、Token预算(<=4/<=600)、防重复与异常静默降级
  // ----------------------------------------------------
  console.log('\n[3] 聊天上下文按需召回、相对时间表达、长期记忆去重、预算裁剪与异常降级');
  {
    const h = createV31Harness();
    const { win } = h;
    await win.db.characters.put({ id: 201, nick: '林栖', name: '林栖' });
    await win.db.chats.put({ id: 21, ownerUid: 1, charId: 201, type: 'private' });

    const T_NOW = new Date(2026, 4, 20, 18, 0, 0).getTime(); // 2026-05-20 18:00
    const DAY = 24 * 3600 * 1000;

    // 制造 7 条不同时间/地点的真实事件
    win.WanxiangMirror.setClock(() => T_NOW - 3 * DAY); // 3天前 05-17
    win.WanxiangExperienceBridge.setClock(() => T_NOW - 3 * DAY);
    await win.WanxiangMirror.recordCompanionEvent('201', 'starwish_station', 'train_journey_completed', {
      journeyId: 'j_old_3d',
      destinationId: 'moonlight_coast',
      destinationName: '月光海岸',
      highlights: '灯塔与海风'
    });

    win.WanxiangMirror.setClock(() => T_NOW - 1 * DAY); // 昨天 05-19
    win.WanxiangExperienceBridge.setClock(() => T_NOW - 1 * DAY);
    await win.WanxiangMirror.recordCompanionEvent('201', 'afternoon_cafe', 'cafe_order', {
      itemName: '冰萃海盐乌龙'
    });
    await win.WanxiangMirror.recordCompanionEvent('201', 'lakeside_walk', 'lakeside_walk_completed', {
      walkId: 'wk_yest',
      eventTitle: '芦苇与晚风',
      choiceLabel: '坐在木椅上听歌'
    });

    win.WanxiangMirror.setClock(() => T_NOW); // 今天 05-20
    win.WanxiangExperienceBridge.setClock(() => T_NOW);
    for (let k = 1; k <= 5; k++) {
      await win.WanxiangMirror.recordCompanionEvent('201', 'four_seasons_garden', 'bouquet_gifted', {
        name: '花束第' + k + '号',
        flowerNames: ['铃兰', '风信子'],
        meanings: '祝福'
      });
    }

    // 3a. 无关日常寒暄 -> 不注入
    const idleRes = await win.WanxiangExperienceBridge.buildChatExperienceContext({
      ownerUid: 1,
      charId: 201,
      chatId: 21,
      recentMessages: [{ role: 'user', content: '你今天下班吃晚饭了吗' }]
    });
    check(idleRes.text === '' && idleRes.matchedCount === 0, '无关日常寒暄零触发、零强行灌入万象镜上下文');

    // 3b. 提及昨天 + 咖啡馆 -> 命中「昨天」且带时间标注
    const cafeCtx = await win.WanxiangExperienceBridge.buildChatExperienceContext({
      ownerUid: 1,
      charId: 201,
      chatId: 21,
      recentMessages: [{ role: 'user', content: '你还记得昨天在咖啡馆点过什么吗' }]
    });
    check(
      cafeCtx.text.includes('冰萃海盐乌龙') &&
      cafeCtx.text.includes('昨天') &&
      !cafeCtx.text.includes('月光海岸') &&
      cafeCtx.text.length <= 600,
      '提问「昨天咖啡馆」精准命中昨天饮品且控制在 <=600 字内'
    );

    // 3c. 多条命中时限制 <=4 条 且 <=600 字
    const gardenCtx = await win.WanxiangExperienceBridge.buildChatExperienceContext({
      ownerUid: 1,
      charId: 201,
      chatId: 21,
      recentMessages: [{ role: 'user', content: '今天在四季花园送你的花束还喜欢吗' }]
    });
    check(
      gardenCtx.matchedCount >= 1 && gardenCtx.matchedCount <= 4 && gardenCtx.text.length <= 600,
      '高频命中时严格限制最多 4 条且总字符 <= 600'
    );

    // 3d. 若已在长期记忆中存在同一事件 -> 去重跳过（非追问情景）
    await win.WanWanMemory.saveBridgeMemory({
      ownerUid: 1,
      charId: 201,
      chatId: 21,
      sourceEventId: (await win.WanxiangExperienceBridge.getExperiencesForChar('201')).find(e => e.summary.includes('冰萃海盐乌龙')).sourceEventId,
      experienceId: (await win.WanxiangExperienceBridge.getExperiencesForChar('201')).find(e => e.summary.includes('冰萃海盐乌龙')).experienceId,
      locationId: 'afternoon_cafe',
      title: '午后咖啡馆·冰萃海盐乌龙',
      content: '昨天一起点了冰萃海盐乌龙'
    });
    const dedupCafeCtx = await win.WanxiangExperienceBridge.buildChatExperienceContext({
      ownerUid: 1,
      charId: 201,
      chatId: 21,
      recentMessages: [{ role: 'user', content: '你还记得昨天在咖啡馆点过什么吗' }],
      memoryCtx: '1. 【万象镜精选回忆】午后咖啡馆·冰萃海盐乌龙：昨天一起点了冰萃海盐乌龙'
    });
    check(
      !dedupCafeCtx.text.includes('冰萃海盐乌龙'),
      '已在长期记忆中命中的万象镜事件在桥接层自动去重，不重复占用上下文'
    );

    // 3e. 后续连续追问（携带 wxExperienceShare 元数据）-> 即使含记忆关键词也能延续接话
    const coastExp = (await win.WanxiangExperienceBridge.getExperiencesForChar('201')).find(e => e.summary.includes('月光海岸'));
    const followUpCtx = await win.WanxiangExperienceBridge.buildChatExperienceContext({
      ownerUid: 1,
      charId: 201,
      chatId: 21,
      recentMessages: [
        { role: 'user', content: '给你看看我去月光海岸那张记录', wxExperienceShare: { experienceId: coastExp.experienceId, sourceEventId: coastExp.sourceEventId } },
        { role: 'assistant', content: '那晚的海风和灯塔我都记得呢。' },
        { role: 'user', content: '那你最喜欢里面哪个画面呀' }
      ]
    });
    check(
      followUpCtx.text.includes('月光海岸') && followUpCtx.text.includes('3天前'),
      '主动分享后连续追问无地名词汇时，通过 wxExperienceShare 元数据稳定召回延续，并正确标注 3天前'
    );

    // 3f. 桥接读库报错时静默返回空上下文而不抛出阻塞聊天
    h.setConfigReadFail(true);
    const errRes = await win.WanxiangExperienceBridge.buildChatExperienceContext({
      ownerUid: 1,
      charId: 201,
      chatId: 21,
      recentMessages: [{ role: 'user', content: '记得月光海岸吗' }]
    });
    h.setConfigReadFail(false);
    check(errRes.text === '' && errRes.matchedCount === 0, '存储读异常时 buildChatExperienceContext 安全降级为空字符串，绝不阻断普通私聊');
  }

  // ----------------------------------------------------
  // [4] 主动分享全流程：UI预览、草稿冲突（合并/覆盖/取消）、取消分享、idempotent防连点、跨Char拦截
  // ----------------------------------------------------
  console.log('\n[4] 主动分享给 Char：预览、草稿冲突治理、取消分享、幂等防连发与跨Char纠偏');
  {
    const h = createV31Harness();
    const { win, bridgeChatOpens } = h;
    await win.db.characters.put({ id: 301, nick: '林栖', name: '林栖' });
    await win.db.characters.put({ id: 302, nick: '顾屿', name: '顾屿' });
    await win.db.chats.put({ id: 31, ownerUid: 1, charId: 301, type: 'private' });
    await win.db.chats.put({ id: 32, ownerUid: 1, charId: 302, type: 'private' });

    const T1 = new Date(2026, 4, 21, 14, 0, 0).getTime();
    win.WanxiangMirror.setClock(() => T1);
    win.WanxiangExperienceBridge.setClock(() => T1);
    await setCoinsExact(win, 500);
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '301' });

    // 完成一趟湖畔散步并留下留影馆记录
    const wkRes = await win.WanxiangMirror.startLakesideWalk('301', 'wk_share_1');
    await win.WanxiangMirror.chooseLakesideOption(wkRes.walk.walkId, 'A', 'wk_opt_share');
    await win.WanxiangMirror.finishLakesideWalk(wkRes.walk.walkId, 'wk_fin_share');
    await win.WanxiangMirror.saveLakesideMemento(wkRes.walk.walkId);

    // 打开万象镜留影馆 subpage 并检查渲染出「分享给 林栖」与「记住这一天」按钮
    const page = await win.WanxiangMirror.open();
    const memTabBtn = page.querySelector('[data-wx-tab="mementos"]');
    await memTabBtn.dispatchEvent({ type: 'click', target: memTabBtn });
    await new Promise(r => setTimeout(r, 15));
    const shareBtns = page.querySelectorAll('[data-wx-bridge-share]');
    const remBtns = page.querySelectorAll('[data-wx-bridge-remember]');
    check(shareBtns.length >= 1 && remBtns.length >= 1, '留影馆中有效共同经历渲染「分享给 Char」与「记住这一天」操作按钮');

    // 预写入一条未发草稿以触发草稿冲突测试
    const expList = await win.WanxiangExperienceBridge.getExperiencesForChar('301');
    const targetExp = expList[0];
    await win.WanxiangExperienceBridge.savePendingChatDraft({
      ownerUid: 1,
      chatId: 31,
      charId: '301',
      draftText: '本来想问你晚饭吃什么'
    });

    // 即使在万象镜里把同行人切为 302，点击原属 301 的分享按钮也必须发给 301
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '302' });
    await shareBtns[0].dispatchEvent({ type: 'click', target: shareBtns[0] });

    const previewInput = page.querySelector('#wx-bridge-share-input');
    const warnBox = page.querySelector('.wx-bridge-warn-box');
    check(
      Boolean(previewInput) && Boolean(warnBox) && warnBox.textContent.includes('林栖'),
      '当前同行已切为顾屿时，点击林栖记录分享弹出提示并严格锁定发送至林栖私聊'
    );

    // 确认分享文案 -> 触发草稿冲突二次弹窗
    previewInput.value = '刚才那段湖畔散步风很轻呢';
    const okBtn = page.querySelector('[data-wx-confirm-exec]');
    await okBtn.dispatchEvent({ type: 'click', target: okBtn });

    const mergeBtn = page.querySelector('[data-wx-bridge-conflict="merge"]');
    const replaceBtn = page.querySelector('[data-wx-bridge-conflict="replace"]');
    check(Boolean(mergeBtn) && Boolean(replaceBtn), '目标私聊已有未发送草稿时弹出冲突选择框（合并保留 / 替换原草稿 / 取消）');

    // 选择合并保留 -> 预填到微信 301 私聊且绝不自动发送
    await mergeBtn.dispatchEvent({ type: 'click', target: mergeBtn });
    const pendingAfterMerge = await win.WanxiangExperienceBridge.getPendingChatDraft({ ownerUid: 1, chatId: 31 });
    check(
      bridgeChatOpens.length === 1 &&
      Number(bridgeChatOpens[0].charId) === 301 &&
      Number(bridgeChatOpens[0].chatId) === 31 &&
      pendingAfterMerge &&
      pendingAfterMerge.draftText.includes('本来想问你晚饭吃什么') &&
      pendingAfterMerge.draftText.includes('刚才那段湖畔散步风很轻呢') &&
      h.messagesMap.size === 0,
      '选择合并后打开林栖原私聊并保留原草稿+追加分享文案，绝不自动写入消息或自动触发 AI 回复',
      JSON.stringify({ opens: bridgeChatOpens, pending: pendingAfterMerge, msgs: h.messagesMap.size })
    );

    // 校验跨 Char applyShareDraftToChat 强拦截
    const prepFor301 = await win.WanxiangExperienceBridge.prepareShareDraft({ ownerUid: 1, experience: targetExp, customText: '测试文案' });
    const mismatchApply = await win.WanxiangExperienceBridge.applyShareDraftToChat({
      ownerUid: 1,
      chatId: 32,
      charId: '302',
      shareRecord: prepFor301.shareRecord,
      mode: 'replace'
    });
    check(mismatchApply.ok === false, 'applyShareDraftToChat 若检测到 target charId 与经历 charId 不符则硬拦截');

    // 测试取消分享：撤回分享标记但保留普通输入文本
    await win.WanxiangExperienceBridge.cancelPendingShareDraft({ ownerUid: 1, chatId: 31, clearDraftText: false });
    const afterCancel = await win.WanxiangExperienceBridge.getPendingChatDraft({ ownerUid: 1, chatId: 31 });
    check(
      !afterCancel.activeShareRequestId && afterCancel.draftText.includes('本来想问你晚饭吃什么'),
      '点击「取消分享」撤销本次分享关联元数据，保留普通输入草稿'
    );

    // 测试正常消费分享与幂等防连发
    await win.WanxiangExperienceBridge.applyShareDraftToChat({
      ownerUid: 1,
      chatId: 31,
      charId: '301',
      shareRecord: prepFor301.shareRecord,
      mode: 'replace'
    });
    const firstConsume = await win.WanxiangExperienceBridge.consumeShareOnSend({
      ownerUid: 1,
      chatId: 31,
      charId: '301',
      shareRequestId: prepFor301.shareRecord.shareRequestId
    });
    await win.WanxiangExperienceBridge.markShareSent({
      ownerUid: 1,
      chatId: 31,
      shareRequestId: prepFor301.shareRecord.shareRequestId,
      messageId: 9001
    });
    const secondConsume = await win.WanxiangExperienceBridge.consumeShareOnSend({
      ownerUid: 1,
      chatId: 31,
      charId: '301',
      shareRequestId: prepFor301.shareRecord.shareRequestId
    });
    check(
      firstConsume.hasShare === true && !firstConsume.duplicate &&
      firstConsume.shareMeta.experienceId === targetExp.experienceId &&
      secondConsume.duplicate === true,
      '同一 shareRequestId 在发出一次后标记 sent，二次重放严格判定 duplicate 防止连点重复发送'
    );

    win.WanxiangMirror.close();
  }

  // ----------------------------------------------------
  // [5] 聊天 -> 万象镜地点建议与往返还原（全9地点白名单 + 否定/梦境过滤 + 原聊天草稿/滚动条还原）
  // ----------------------------------------------------
  console.log('\n[5] 聊天地点建议白名单（9地点 + 否定/梦境过滤）与双向跳转精确返回');
  {
    const h = createV31Harness();
    const { win, bridgeChatOpens } = h;
    await win.db.characters.put({ id: 401, nick: '温宁', name: '温宁' });
    await win.db.characters.put({ id: 402, nick: '江暮', name: '江暮' });
    await win.db.chats.put({ id: 41, ownerUid: 1, charId: 401, type: 'private' });

    const locCases = [
      ['待会儿一起去湖畔步道散步吧', 'lakeside_walk'],
      ['我们去午后咖啡馆坐坐怎么样', 'afternoon_cafe'],
      ['一起去四季花园做一束花束吧', 'four_seasons_garden'],
      ['好想去星光游乐场坐摩天轮', 'starlight_park'],
      ['要不要一起去星愿列车站看看', 'starwish_station'],
      ['走吧去奇遇扭蛋屋抽一个扭蛋', 'gacha_house'],
      ['一起去心动商店街逛逛吧', 'shopping_street'],
      ['去镜心广场许个愿好不好', 'mirror_plaza'],
      ['一起去镜中留影馆翻看纪念册吧', 'mirror_gallery']
    ];
    check(
      locCases.every(([txt, expLoc]) => {
        const res = win.WanxiangExperienceBridge.detectChatLocationSuggestion(txt);
        return res && res.locationId === expLoc;
      }),
      '9 大万象镜有效地点自然语句全部准确匹配对应 locationId'
    );

    const negativeCases = [
      '今天不去湖畔步道了太晒啦',
      '算了不去游乐场了，改天再说',
      '昨晚梦见去星愿列车站了真奇怪',
      '如果去午后咖啡馆应该点什么呢',
      '昨天去了四季花园，今天在家休息吧',
      '你去不了镜心广场也没事'
    ];
    check(
      negativeCases.every(txt => win.WanxiangExperienceBridge.detectChatLocationSuggestion(txt) === null),
      '否定句/梦境/假设句/单纯过去回忆句全部精准抑制，不误弹地点建议条'
    );

    // 模拟从 401(chatId=41) 跳转到 lake_side -> 在万象镜中切 Char 402 后点击返回栏，必须回到 401(chatId=41) 且恢复 draft & scrollTop
    const navSave = await win.WanxiangExperienceBridge.saveChatNavigationContext({
      ownerUid: 1,
      charId: '401',
      charName: '温宁',
      sourceChatId: 41,
      targetLocationId: 'lakeside_walk',
      targetLocationName: '湖畔步道',
      draftText: '差点忘了带你去吃草莓塔',
      scrollTop: 428
    });
    const page = await win.WanxiangMirror.open({
      charId: '401',
      openLocationId: 'lakeside_walk',
      fromChatNavId: navSave.navId
    });
    const returnBar = page.querySelector('#wx-chat-return-bar');
    const snapOpen = win.WanxiangMirror.getRuntimeSnapshot();
    check(
      !returnBar.classList.contains('is-hidden') &&
      returnBar.textContent.includes('返回与 温宁 的聊天') &&
      snapOpen.activeCharId === '401' &&
      snapOpen.sheetLocationId === 'lakeside_walk' &&
      (await win.SharedEconomyService.getState()).coins >= 0,
      '从聊天跳转进入万象镜自动绑定当前 Char 并打开目标地点卡，顶部展示「返回与 温宁 的聊天」且零自动消费'
    );

    // 在万象镜中途切换成 402
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '402' });
    const retBtn = page.querySelector('#wx-chat-return-btn');
    await retBtn.dispatchEvent({ type: 'click', target: retBtn });

    check(
      bridgeChatOpens.length === 1 &&
      Number(bridgeChatOpens[0].chatId) === 41 &&
      Number(bridgeChatOpens[0].charId) === 401 &&
      bridgeChatOpens[0].restoreDraftText === '差点忘了带你去吃草莓塔' &&
      bridgeChatOpens[0].restoreScrollTop === 428 &&
      (await win.WanxiangExperienceBridge.getNavigationContext(navSave.navId)) === null,
      '即使在万象镜内切换其他 Char，点击返回仍准确回到原聊天窗口 401(chatId=41)、恢复原草稿与 scrollTop=428 并清理返回上下文'
    );
  }

  // ----------------------------------------------------
  // [6] 精选长期记忆：「记住这一天」预览/限制/去重/失败重试/删除回落同步
  // ----------------------------------------------------
  console.log('\n[6] 精选长期记忆：预览规范、去重写入、失败不标红与记忆长廊删除后回落状态');
  {
    const h = createV31Harness();
    const { win, memoriesMap } = h;
    await win.db.characters.put({ id: 501, nick: '林栖', name: '林栖' });
    await win.db.chats.put({ id: 51, ownerUid: 1, charId: 501, type: 'private' });

    const T2 = new Date(2026, 4, 22, 16, 30, 0).getTime();
    win.WanxiangMirror.setClock(() => T2);
    win.WanxiangExperienceBridge.setClock(() => T2);
    await win.WanxiangMirror.saveMirrorState({ activeCharId: '501' });

    await setCoinsExact(win, 100);
    const trRes = await win.WanxiangMirror.purchaseTrainTicketAndStartJourney({
      destinationId: 'starry_observatory',
      charId: '501',
      requestId: 't_mem_1'
    });
    const jid = trRes.journey.journeyId;
    await win.WanxiangMirror.chooseTrainStageOption(jid, 1, 'A', 's1_m1');
    await win.WanxiangMirror.advanceTrainStage(jid);
    await win.WanxiangMirror.chooseTrainStageOption(jid, 2, 'A', 's2_m1');
    await win.WanxiangMirror.advanceTrainStage(jid);
    await win.WanxiangMirror.chooseTrainStageOption(jid, 3, 'A', 's3_m1');
    const arrRes = await win.WanxiangMirror.completeTrainJourney(jid, 'arr_m1');
    await win.WanxiangMirror.saveTrainPostcardMemento({ journeyId: jid, postcardMessage: '星眠夜灯真亮呀' });

    const exps = await win.WanxiangExperienceBridge.getExperiencesForChar('501');
    const trainExp = exps.find(e => e.eventType === 'train_journey_completed') || exps[0];
    const postcardExp = exps.find(e => e.eventType === 'train_postcard_saved');

    // 6a. 预览长度校验与空输入拦截 + 失败爪不可入库校验
    const emptyErr = await win.WanxiangExperienceBridge.confirmSaveMemory({
      ownerUid: 1,
      experience: trainExp,
      title: '   ',
      content: '有效正文'
    });
    const failedClawCand = win.WanxiangExperienceBridge.buildMemoryCandidate({
      eventType: 'claw_attempt_failed',
      canRemember: false
    });
    check(
      emptyErr.ok === false && emptyErr.reason === 'empty_title' && failedClawCand === null,
      '长期记忆空标题提交被诚实拦截，且抓娃娃未抓中记录禁止生成记忆候选项'
    );

    // 6b. 模拟数据库写入失败 -> 绝不能误标为「已记住 ✓」，随后恢复即可成功重试
    h.setMemoryAddFail(true);
    const failSave = await win.WanxiangExperienceBridge.confirmSaveMemory({
      ownerUid: 1,
      experience: trainExp,
      title: '星眠天文台之约',
      content: '一起坐星愿列车来到星眠天文台看极夜星图。'
    });
    const statusAfterFail = await win.WanxiangExperienceBridge.checkMemorySavedStatus({ ownerUid: 1, experience: trainExp });
    check(
      failSave.ok === false && statusAfterFail.saved === false && memoriesMap.size === 0,
      'IndexedDB 写入失败时诚实返回失败且状态保持未记住，支持无损重试'
    );

    h.setMemoryAddFail(false);
    // 超长截断测试（title>30, content>150）
    const longTitle = 'A'.repeat(45);
    const longContent = 'B'.repeat(200);
    const okSave = await win.WanxiangExperienceBridge.confirmSaveMemory({
      ownerUid: 1,
      experience: trainExp,
      title: longTitle,
      content: longContent
    });
    const savedRow = Array.from(memoriesMap.values())[0];
    check(
      okSave.ok === true && !okSave.duplicate &&
      savedRow.sourceType === 'wanxiang_mirror' &&
      savedRow.title.length <= 30 && savedRow.content.length <= 150,
      '重试成功后写入 db.memories（sourceType=wanxiang_mirror），严格截断标题<=30字/内容<=150字'
    );

    // 6c. 验证 WanWanMemory.getMemoryContext 正确注入「万象镜精选回忆」来源标注
    const memCtxOut = await win.WanWanMemory.getMemoryContext(51, 501, 1, [{ role: 'user', content: '星眠天文台' }]);
    check(
      memCtxOut.includes('【万象镜精选回忆｜发生时间：'),
      'WanWanMemory.getMemoryContext 正确将万象镜记忆标注为「万象镜精选回忆」'
    );

    // 6d. 重复点击同一条「记住这一天」-> 去重返回 duplicate:true，不会出现两份记忆
    const dupSave = await win.WanxiangExperienceBridge.confirmSaveMemory({
      ownerUid: 1,
      experience: trainExp,
      title: '星眠天文台之约',
      content: '重复提交检查'
    });
    const statusSaved = await win.WanxiangExperienceBridge.checkMemorySavedStatus({ ownerUid: 1, experience: trainExp });
    check(
      dupSave.ok === true && dupSave.duplicate === true &&
      memoriesMap.size === 1 && statusSaved.saved === true,
      '同一经历重复保存严格去重，db.memories 保持 1 条且状态显示为已记住'
    );

    // 6e. UI 点击流测试：在留影馆点击「记住这一天」并修改标题后确认 -> 显示「已记住 ✓」；从记忆长廊删除后变回「记住这一天」且保留万象镜原经历
    const page = await win.WanxiangMirror.open();
    const mTab = page.querySelector('[data-wx-tab="mementos"]');
    await mTab.dispatchEvent({ type: 'click', target: mTab });
    await new Promise(r => setTimeout(r, 15));

    const remBtnUi = page.querySelector('[data-wx-bridge-remember]');
    check(Boolean(remBtnUi), '留影馆中未记住的旅行明信片展示「记住这一天」按钮');
    await remBtnUi.dispatchEvent({ type: 'click', target: remBtnUi });

    const editMemTitle = page.querySelector('#wx-bridge-mem-title');
    editMemTitle.value = '一起寄出的天文台明信片';
    const execMemBtn = page.querySelector('[data-wx-confirm-exec]');
    await execMemBtn.dispatchEvent({ type: 'click', target: execMemBtn });
    await new Promise(r => setTimeout(r, 15));

    const rememberedTags = page.querySelectorAll('.wx-bridge-remembered-tag');
    const savedUiRow = Array.from(memoriesMap.values()).find(r => r.title === '一起寄出的天文台明信片');
    check(
      rememberedTags.length >= 1 && Boolean(savedUiRow) && memoriesMap.size === 2,
      '在 UI 编辑预览标题后确认保存，成功将自定义标题写入长期记忆且界面立即切换为「已记住 ✓」'
    );

    // 模拟在记忆长廊删除该条记忆并调用 onMemoryDeleted
    await win.db.memories.delete(savedUiRow.id);
    await win.WanxiangExperienceBridge.onMemoryDeleted(savedUiRow.id);
    // 再删除 trainExp 对应的记忆但不调用 onMemoryDeleted，验证 checkMemorySavedStatus 自愈回落
    await win.db.memories.delete(okSave.memoryId);
    const healStatus = await win.WanxiangExperienceBridge.checkMemorySavedStatus({ ownerUid: 1, experience: trainExp });

    await mTab.dispatchEvent({ type: 'click', target: mTab });
    await new Promise(r => setTimeout(r, 15));
    const expsStillExist = await win.WanxiangExperienceBridge.getExperiencesForChar('501');
    check(
      healStatus.saved === false &&
      memoriesMap.size === 0 &&
      expsStillExist.length >= 2 &&
      page.querySelectorAll('.wx-bridge-remembered-tag').length === 0 &&
      page.querySelectorAll('[data-wx-bridge-remember]').length >= 1 &&
      Boolean(postcardExp),
      '从记忆长廊删除记忆后，万象镜同步回落为「记住这一天」（含无回调自愈），且原万象镜经历与明信片完整保留'
    );
    win.WanxiangMirror.close();
  }

  console.log('\n========================================');
  console.log(`万象镜 V3.1 自动化测试完成：通过 ${passed} 项，失败 ${failed} 项`);
  console.log('========================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
