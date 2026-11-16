// scripts/test-heartbeat-live.cjs
// 弯弯小手机｜心动直播 V1.0 自动化验收测试（Node 模拟 DOM / Dexie / SharedEconomy / 媒体流环境）

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
  const memoriesMap = new Map();
  const chatsMap = new Map();
  const charsMap = new Map();
  const winListeners = {};
  const docListeners = {};
  const historyStack = [];
  const revokedUrls = [];
  const audioInstances = [];
  let urlSeq = 1;
  let memSeq = 1;
  let confirmResult = true;
  let promptResult = '新音轨名';
  let ecoCoins = 150;
  const ecoLogs = [];
  let aiQueue = [];

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

  function makeElement(tag) {
    const el = {
      tagName: String(tag || 'DIV').toUpperCase(),
      id: '',
      className: '',
      children: [],
      parentNode: null,
      style: {},
      dataset: {},
      _attrs: {},
      _textParts: [],
      _listeners: {},
      value: '',
      checked: false,
      disabled: false,
      hidden: false,
      srcObject: null,
      scrollTop: 0,
      scrollHeight: 200,
      offsetWidth: 172,
      offsetHeight: 96,
      offsetLeft: 0,
      offsetTop: 0,
      clientWidth: 375,
      clientHeight: 844,
      getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth || 375, height: this.clientHeight || 844 }; },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (matchChain(cur, sel)) return cur;
          cur = cur.parentNode;
        }
        return null;
      },
      setAttribute(k, v) {
        if (k === 'id') this.id = String(v);
        else if (k === 'class') this.className = String(v);
        else if (k === 'hidden') this.hidden = true;
        else if (k.startsWith('data-')) {
          const dk = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
          this.dataset[dk] = String(v);
        }
        this._attrs[k] = String(v);
      },
      getAttribute(k) { return this._attrs[k]; },
      addEventListener(evt, fn) {
        if (!this._listeners[evt]) this._listeners[evt] = [];
        this._listeners[evt].push(fn);
      },
      removeEventListener(evt, fn) {
        if (!this._listeners[evt]) return;
        this._listeners[evt] = this._listeners[evt].filter(f => f !== fn);
      },
      dispatchEvent(evt) {
        const list = this._listeners[evt.type] || [];
        list.forEach(fn => fn(evt));
      },
      click() {
        if (this.disabled) return;
        if (typeof this.onclick === 'function') this.onclick({ target: this, preventDefault() {}, stopPropagation() {} });
        this.dispatchEvent({ type: 'click', target: this, preventDefault() {}, stopPropagation() {} });
      },
      appendChild(child) {
        if (child) { child.parentNode = this; this.children.push(child); }
        return child;
      },
      removeChild(child) {
        this.children = this.children.filter(c => c !== child);
        return child;
      },
      remove() {
        if (this.parentNode) this.parentNode.removeChild(this);
      },
      scrollIntoView() {},
      contains(target) {
        let cur = target;
        while (cur) {
          if (cur === this) return true;
          cur = cur.parentNode;
        }
        return false;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const out = [];
        const parts = String(sel || '').split(',').map(s => s.trim()).filter(Boolean);
        function walk(n) {
          for (const ch of n.children || []) {
            if (parts.some(p => matchChain(ch, p))) out.push(ch);
            walk(ch);
          }
        }
        walk(this);
        return out;
      }
    };
    el.classList = makeClassList(el);
    Object.defineProperty(el, 'firstChild', {
      get() { return el.children[0] || null; }
    });
    Object.defineProperty(el, 'textContent', {
      get() {
        if (el._textParts.length && !el.children.length) return el._textParts.join('');
        return (el._textParts.join('') + el.children.map(c => c.textContent).join(''));
      },
      set(v) {
        el.children = [];
        el._textParts = [String(v == null ? '' : v)];
      }
    });
    Object.defineProperty(el, 'innerHTML', {
      get() { return el._innerHtml || el.textContent; },
      set(html) {
        el._innerHtml = String(html || '');
        parseHtmlToChildren(el, el._innerHtml);
      }
    });
    return el;
  }

  function matchSingle(el, sel) {
    if (!el || !sel) return false;
    let s = sel.trim();
    const attrMatches = [];
    s = s.replace(/\[([^\]]+)\]/g, (_, inside) => {
      const eqIdx = inside.indexOf('=');
      if (eqIdx < 0) attrMatches.push({ k: inside.trim(), v: null });
      else attrMatches.push({ k: inside.slice(0, eqIdx).trim(), v: inside.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '') });
      return '';
    });
    const tokens = s.match(/(?:#[a-zA-Z0-9_-]+|\.[a-zA-Z0-9_-]+|^[a-zA-Z0-9_-]+)/g) || [];
    for (const tk of tokens) {
      if (tk.startsWith('#')) { if (el.id !== tk.slice(1)) return false; }
      else if (tk.startsWith('.')) { if (!el.classList.contains(tk.slice(1))) return false; }
      else { if (el.tagName !== tk.toUpperCase()) return false; }
    }
    for (const am of attrMatches) {
      if (am.k.startsWith('data-')) {
        const dk = am.k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        if (el.dataset[dk] === undefined) return false;
        if (am.v !== null && el.dataset[dk] !== am.v) return false;
      } else if (am.v !== null && String(el._attrs[am.k] || '') !== am.v) {
        return false;
      }
    }
    return tokens.length > 0 || attrMatches.length > 0;
  }

  function matchChain(el, sel) {
    const parts = sel.trim().split(/\s+/);
    if (!matchSingle(el, parts[parts.length - 1])) return false;
    let cur = el.parentNode;
    for (let i = parts.length - 2; i >= 0; i--) {
      while (cur && !matchSingle(cur, parts[i])) cur = cur.parentNode;
      if (!cur) return false;
      cur = cur.parentNode;
    }
    return true;
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
          el.setAttribute(k, v);
          if (k === 'value') el.value = v;
          if (k === 'disabled') el.disabled = true;
          if (k === 'selected') el.selected = true;
        }
        const top = stack[stack.length - 1];
        top.appendChild(el);
        if (!selfClosing) stack.push(el);
      } else if (m[4]) {
        const top = stack[stack.length - 1];
        top._textParts.push(m[4]);
        if (top.tagName === 'TEXTAREA') top.value = (top.value || '') + m[4];
      }
    }
  }

  const appRoot = makeElement('div');
  appRoot.id = 'app';

  const doc = {
    visibilityState: 'visible',
    activeElement: null,
    body: makeElement('body'),
    getElementById(id) {
      if (id === 'app') return appRoot;
      return appRoot.querySelector('#' + id) || doc.body.querySelector('#' + id);
    },
    querySelector(sel) {
      return appRoot.querySelector(sel) || doc.body.querySelector(sel);
    },
    querySelectorAll(sel) {
      return appRoot.querySelectorAll(sel).concat(doc.body.querySelectorAll(sel));
    },
    createElement(tag) { return makeElement(tag); },
    addEventListener(evt, fn) {
      if (!docListeners[evt]) docListeners[evt] = [];
      docListeners[evt].push(fn);
    },
    removeEventListener(evt, fn) {
      if (!docListeners[evt]) return;
      docListeners[evt] = docListeners[evt].filter(f => f !== fn);
    },
    dispatchEvent(evt) { (docListeners[evt.type] || []).forEach(fn => fn(evt)); }
  };

  class FakeBlob {
    constructor(parts, opts) {
      this.parts = parts || [];
      this.type = (opts && opts.type) || '';
      this.size = (opts && opts._forceSize) || this.parts.reduce((s, p) => s + String(p).length, 0);
    }
  }

  class FakeAudio {
    constructor(src) {
      this._src = '';
      this.volume = 1;
      this.loop = false;
      this.duration = 42;
      this.paused = true;
      this._events = {};
      this.onloadedmetadata = null;
      this.onerror = null;
      this.onended = null;
      audioInstances.push(this);
      if (src) this.src = src;
    }
    get src() { return this._src; }
    set src(v) {
      this._src = String(v || '');
      if (!this._src) return;
      setTimeout(() => {
        if (!this._src) return;
        if (this._src.includes('bad_audio')) {
          if (typeof this.onerror === 'function') this.onerror(new Error('decode error'));
          (this._events.error || []).forEach(fn => fn());
        } else {
          if (typeof this.onloadedmetadata === 'function') this.onloadedmetadata();
          (this._events.loadedmetadata || []).forEach(fn => fn());
        }
      }, 1);
    }
    addEventListener(t, fn) { if (!this._events[t]) this._events[t] = []; this._events[t].push(fn); }
    emit(t) {
      if (t === 'ended' && typeof this.onended === 'function') this.onended();
      if (t === 'error' && typeof this.onerror === 'function') this.onerror();
      (this._events[t] || []).forEach(fn => fn());
    }
    play() {
      if (this._src.includes('cloud_fail')) {
        this.paused = true;
        return Promise.reject(new Error('network error'));
      }
      this.paused = false;
      return Promise.resolve();
    }
    pause() { this.paused = true; }
  }

  const fakeTrackList = [];
  function createFakeStream(kind) {
    const track = { kind, stopped: false, stop() { this.stopped = true; } };
    fakeTrackList.push(track);
    return { getTracks() { return [track]; } };
  }

  class MockURL extends globalThis.URL {
    static createObjectURL() { return 'blob:hl-mock-' + (urlSeq++); }
    static revokeObjectURL(u) { revokedUrls.push(u); }
  }

  const lorebookCalls = [];
  const memReadCalls = [];
  const wxReadCalls = [];
  const capturedAiCalls = [];

  let quotaState = { quota: 2 * 1024 * 1024 * 1024, usage: 50 * 1024 * 1024 };
  let onlineState = true;
  let opfsEnabled = true;
  const opfsFiles = new Map();
  let fetchHandler = async () => ({ ok: false, status: 404, async json() { return {}; }, async blob() { return new FakeBlob([]); } });

  function makeOpfsDir(prefix) {
    return {
      async getDirectoryHandle(sub) {
        return makeOpfsDir((prefix ? prefix + '/' : '') + sub);
      },
      async getFileHandle(name, opts) {
        const key = (prefix ? prefix + '/' : '') + name;
        if (!opfsFiles.has(key) && !(opts && opts.create)) {
          throw new Error('NotFoundError');
        }
        return {
          async getFile() {
            const val = opfsFiles.get(key);
            if (!val) throw new Error('NotFoundError');
            return val;
          },
          async createWritable() {
            let writtenSize = 0;
            let writtenType = 'audio/mpeg';
            let aborted = false;
            return {
              async write(chunk) {
                if (aborted) return;
                if (chunk && typeof chunk === 'object') {
                  writtenSize += Number(chunk.size || chunk.byteLength || chunk.length || 0);
                  if (chunk.type) writtenType = chunk.type;
                } else {
                  writtenSize += String(chunk || '').length;
                }
              },
              async abort() {
                aborted = true;
                opfsFiles.delete(key);
              },
              async close() {
                if (!aborted) {
                  opfsFiles.set(key, new FakeBlob([], { type: writtenType, _forceSize: writtenSize }));
                }
              }
            };
          }
        };
      },
      async removeEntry(name, opts) {
        const key = (prefix ? prefix + '/' : '') + name;
        if (opts && opts.recursive) {
          for (const k of Array.from(opfsFiles.keys())) {
            if (k === key || k.startsWith(key + '/')) opfsFiles.delete(k);
          }
        } else {
          opfsFiles.delete(key);
        }
      }
    };
  }

    const navObj = {
      get onLine() { return onlineState; },
      mediaDevices: {
        async getUserMedia(constraints) {
          return createFakeStream(constraints.video ? 'video' : 'audio');
        }
      },
      storage: {
        async estimate() { return { quota: quotaState.quota, usage: quotaState.usage }; },
        async getDirectory() {
          if (!opfsEnabled) throw new Error('OPFS disabled');
          return makeOpfsDir('');
        }
      }
    };

    const win = {
    document: doc,
    innerWidth: 375,
    innerHeight: 844,
    getComputedStyle(el) {
      return { zIndex: (el && el.style && el.style.zIndex) || '0' };
    },
    Blob: FakeBlob,
    Audio: FakeAudio,
    URL: MockURL,
    fetch: async function(u, o) { return await fetchHandler(u, o); },
    localStorage: {
      getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null; },
      setItem(k, v) { storageMap.set(k, String(v)); },
      removeItem(k) { storageMap.delete(k); }
    },
    history: {
      pushState(s) { historyStack.push(s); },
      back() { historyStack.pop(); }
    },
    navigator: navObj,
    confirm() { return confirmResult; },
    prompt() { return promptResult; },
    addEventListener(evt, fn) {
      if (!winListeners[evt]) winListeners[evt] = [];
      winListeners[evt].push(fn);
    },
    removeEventListener(evt, fn) {
      if (!winListeners[evt]) return;
      winListeners[evt] = winListeners[evt].filter(f => f !== fn);
    },
    dispatchEvent(evt) { (winListeners[evt.type] || []).forEach(fn => fn(evt)); },
    openPage(p) { appRoot.appendChild(p); },
    closePage(id) {
      const el = doc.getElementById(id);
      if (el) el.remove();
    },
    _wechatUid: 1,
    _wechatUser: { id: 1, name: '小弯', nick: '小弯', avatar: '', description: '温和的用户' },
    db: {
      config: {
        async get(k) { return configMap.get(k); },
        async put(row) { configMap.set(row.key, row); },
        async delete(k) { configMap.delete(k); },
        async toArray() { return Array.from(configMap.values()); }
      },
      characters: {
        async toArray() { return Array.from(charsMap.values()); }
      },
      chats: {
        where() {
          return {
            equals([uid, cid]) {
              return {
                async first() {
                  return Array.from(chatsMap.values()).find(c => c.ownerUid === uid && c.charId === cid) || null;
                }
              };
            }
          };
        },
        async toArray() { return Array.from(chatsMap.values()); }
      },
      memories: {
        async add(row) {
          const id = memSeq++;
          memoriesMap.set(id, Object.assign({ id }, row));
          return id;
        },
        async delete(id) { memoriesMap.delete(id); },
        async toArray() { return Array.from(memoriesMap.values()); }
      }
    },
    SharedEconomyService: {
      async getState() { return { coins: ecoCoins, logs: ecoLogs }; },
      async spendCoins(amount, reason, sourceApp) {
        if (ecoCoins < amount) return { success: false, msg: '金币余额不足' };
        ecoCoins -= amount;
        ecoLogs.push({ amount, reason, sourceApp });
        return { success: true, remaining: ecoCoins };
      }
    },
    async getLorebookContext(charId) {
      lorebookCalls.push(charId);
      if (charId === 101) return '星野喜欢深夜看星空电台。';
      if (charId === 201) return '阿茶是小镇转角咖啡馆的值班店员。';
      return '小屿住在海边小镇。';
    },
    WanWanMemory: {
      async getMemoryContext(cid) {
        memReadCalls.push(cid);
        return 'Char_' + cid + '_私有秘密记忆：一起去过月光海岸。';
      }
    },
    WanxiangMirrorBridge: {
      async buildChatExperienceContext(cid) {
        wxReadCalls.push(cid);
        return { text: '- [今天｜午后咖啡馆] 与 Char_' + cid + ' 喝过拿铁。' };
      }
    },
    async callAI(msgs, opts) {
      capturedAiCalls.push({ msgs, opts });
      if (aiQueue.length) return await aiQueue.shift()(msgs, opts);
      return JSON.stringify({ speech: '默认真实AI回应', audience: '氛围不错呀' });
    }
  };

  charsMap.set(101, { id: 101, type: 'char', name: '星野', role: '电台主播', description: '温柔细腻', avatar: 'https://example.com/a1.png' });
  charsMap.set(102, { id: 102, type: 'char', name: '小屿', role: '海边画家', description: '安静直率', avatar: 'https://example.com/a2.png' });
  charsMap.set(201, { id: 201, type: 'npc', name: '阿茶', role: '咖啡店员', description: '嘴硬心软的小镇店员', group: '小镇居民', avatar: 'https://example.com/npc1.png' });
  chatsMap.set(1, { id: 501, ownerUid: 1, charId: 101 });

  return {
    win, doc, appRoot, storageMap, configMap, memoriesMap, charsMap, ecoLogs, revokedUrls, audioInstances, fakeTrackList,
    lorebookCalls, memReadCalls, wxReadCalls, capturedAiCalls, opfsFiles,
    setConfirm(v) { confirmResult = v; },
    setEcoCoins(v) { ecoCoins = v; },
    getEcoCoins() { return ecoCoins; },
    setQuota(q, u) { quotaState = { quota: q, usage: u }; },
    setOnline(v) { onlineState = Boolean(v); },
    setOpfsEnabled(v) { opfsEnabled = Boolean(v); },
    setFetchHandler(fn) { fetchHandler = fn; },
    pushAiHandler(fn) { aiQueue.push(fn); },
    clearAiQueue() { aiQueue.length = 0; }
  };
}

function loadScripts(h) {
  const vm = require('vm');
  const ctx = vm.createContext(Object.assign(h.win, {
    window: h.win,
    document: h.doc,
    URL: h.win.URL,
    Blob: h.win.Blob,
    Audio: h.win.Audio,
    fetch: h.win.fetch,
    localStorage: h.win.localStorage,
    history: h.win.history,
    navigator: h.win.navigator,
    AbortController: globalThis.AbortController,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    Promise,
    Set,
    Map,
    Array,
    Number,
    String,
    Boolean,
    Error,
    Uint8Array
  }));

  for (const rel of ['js/tts-provider.js', 'js/heartbeat-live-storage.js', 'js/heartbeat-live-ai.js', 'js/heartbeat-live.js']) {
    const code = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  }
  return ctx;
}

async function main() {
  console.log('=== 心动直播 V1.0 自动化验收测试 ===\n');

  // 1. 静态架构接入核验
  console.log('1. 静态接入与清理边界检查');
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const dataJs = fs.readFileSync('js/data.js', 'utf8');
  const placeholderJs = fs.readFileSync('js/placeholder-apps.js', 'utf8');
  const cssText = fs.readFileSync('css/heartbeat-live.css', 'utf8');

  check(indexHtml.includes('css/heartbeat-live.css'), 'index.html 已引入 heartbeat-live.css');
  check(indexHtml.includes('js/heartbeat-live-storage.js') && indexHtml.includes('js/heartbeat-live-ai.js') && indexHtml.includes('js/heartbeat-live.js'), 'index.html 已按依赖顺序引入心动直播三模块');
  check(dataJs.includes("id: 'heartbeatLive'") && dataJs.includes("'heartbeat_live_'") && dataJs.includes("'wanwan_heart_live_'"), 'data.js APP_DATA_DEFS 已登记心动直播专用数据前缀');
  check(dataJs.includes('isHeartbeatLiveAudioBackupExcluded'), 'data.js 已支持控制大体积 ASMR 音频备份开关');
  check(placeholderJs.includes('if (!window.HeartbeatLiveApp)'), 'placeholder-apps.js 已为正式 HeartbeatLiveApp 让路');
  check(cssText.includes('.hl-connection-active') && cssText.includes('.hl-call-visual') && cssText.includes('.hl-connection-overlay'), 'CSS 完整保留经典小窗、并列PK双连麦布局及全屏/煲电话模式');

  // 2. 存储隔离与配额校验
  console.log('\n2. 存储隔离、HTTPS 校验与 ASMR 音频库');
  const h = createHarness();
  const ctx = loadScripts(h);
  const FakeBlob = h.win.Blob;
  const store = ctx.HeartbeatLiveStorage;

  await store.savePortraitUrl('101', 'https://example.com/c101.png');
  await store.savePortraitOption('101', { mode: 'call', fit: 'contain', position: 'center top' });
  await store.savePortraitUrl('user', 'https://example.com/u1.png');
  check((await store.loadPortraitSrc('101')) === 'https://example.com/c101.png', 'Char 101 立绘独立保存');
  check((await store.loadPortraitSrc('102')) === '', 'Char 102 与 Char 101 立绘严格隔离');
  check((await store.loadPortraitSrc('user')) === 'https://example.com/u1.png', 'User 形象独立保存');

  let badUrlCaught = false;
  try { await store.savePortraitUrl('101', 'http://insecure.example.com/a.png'); } catch (_) { badUrlCaught = true; }
  check(badUrlCaught, '拒绝非 HTTPS 外部图片链接');

  const audioFile = { name: 'rain_night.mp3', type: 'audio/mpeg', size: 1024 * 512 };
  const addedTrack = await store.addAsmrTrack(audioFile);
  check(Boolean(addedTrack && addedTrack.id), 'ASMR 本地音频可导入并持久化');
  await store.renameAsmrTrack(addedTrack.id, '深夜雨声');
  check((await store.listAsmrTracks())[0].name === '深夜雨声', 'ASMR 音轨支持重命名');

  const largeAudio = {
    name: 'rain_long_35mb.mp3',
    type: 'audio/mpeg',
    size: 35 * 1024 * 1024,
    lastModified: 1700000100000,
    slice(s, e) { return new FakeBlob([], { type: 'audio/mpeg', _forceSize: e - s }); }
  };
  const addedLarge = await store.addAsmrTrack(largeAudio);
  check(Boolean(addedLarge && addedLarge.id) && addedLarge.storageBackend === 'opfs' && h.opfsFiles.has('heartbeat_live_audio/' + addedLarge.opfsFileName), '解除 25MB/120MB 固定限制：大于 25MB 的本地音频可分块写入 OPFS 持久化');

  h.setQuota(100 * 1024 * 1024, 90 * 1024 * 1024);
  let quotaExceededCaught = false;
  let quotaErrMsg = '';
  try {
    await store.addAsmrTrack({ name: 'too_big_for_disk.mp3', type: 'audio/mpeg', size: 60 * 1024 * 1024 });
  } catch (err) {
    quotaExceededCaught = true;
    quotaErrMsg = err.message || '';
  }
  check(quotaExceededCaught && quotaErrMsg.includes('空间不足'), '当真实设备存储配额不足时，拦截导入并明确提示空间不足');
  h.setQuota(2 * 1024 * 1024 * 1024, 50 * 1024 * 1024);

  // 备份排除校验
  check((await store.loadSettings()).includeAudioInBackup === false, '默认关闭大音频进整机 JSON 备份以防移动端 OOM');

  // 3. 直播开播、热切节目、单人双视觉模式与双布局连麦不断流
  console.log('\n3. 直播开播、节目热切、单人双模式与双布局连麦不断流');
  const app = ctx.HeartbeatLiveApp;
  await app.open();
  const homeGridBtns = h.doc.getElementById('heartbeat-live-page').querySelectorAll('.hl-broadcast');
  check(homeGridBtns.length === 3, '直播大厅渲染真实 Char 卡片与我来开播卡片');

  h.pushAiHandler(async () => JSON.stringify({ speech: '晚上好呀，欢迎来到星野的直播间！', audience: '星野晚上好！' }));
  await app.startLiveRoom({
    hostMode: 'char',
    charObj: ctx.HeartbeatLiveAI && (await ctx.HeartbeatLiveAI.loadAvailableChars())[0],
    program: 'chat',
    title: '夜谈小剧场',
    style: 'natural'
  });
  await new Promise(r => setTimeout(r, 20));
  const st = app.getState();
  check(st.room && st.room.messages.some(m => m.senderRole === 'char' && m.text.includes('晚上好')), '开播触发真实 Char AI 问候');
  check(st.room.messages.some(m => m.senderRole === 'ai_audience'), 'AI 观众弹幕以 ai_audience 独立标识展示');

  // 切换单人视觉模式：全屏 <-> 煲电话
  const roomEl = h.doc.getElementById('hl-room');
  const callModeToggle = h.doc.getElementById('hl-callModeToggle');
  check(roomEl.classList.contains('hl-call-visual') === true, 'Char 101 记住并应用了煲电话模式');
  callModeToggle.click();
  await new Promise(r => setTimeout(r, 20));
  check(roomEl.classList.contains('hl-call-visual') === false, '直播中可随时切换为全屏直播模式');

  // 开启语音连麦 + 麦克风授权 -> 热切换布局（经典小窗 <-> 双人并列PK）与交换位置
  await app.startConnection('voice');
  const micBtn = h.doc.getElementById('hl-mic-toggle');
  await micBtn.click();
  await new Promise(r => setTimeout(r, 20));
  check(Boolean(app.getState().micStream), '语音连麦已获取本机麦克风流');

  const prevMsgCount = app.getState().room.messages.length;
  h.doc.getElementById('hl-layout-toggle').click();
  check(roomEl.classList.contains('hl-connection-active') === true, '支持切换双人左右并列 PK 连麦布局');
  check(Boolean(app.getState().micStream) && app.getState().connectionType === 'voice', '切换并列布局时不挂断连麦、不断开麦克风');
  h.doc.getElementById('hl-swap-screens').click();
  check(roomEl.classList.contains('hl-connection-swapped') === true, '支持左右/小窗交换位置');
  h.doc.getElementById('hl-layout-toggle').click();
  check(roomEl.classList.contains('hl-connection-active') === false && Boolean(app.getState().micStream), '切换回经典主播大屏+小窗布局仍不断麦');

  // 直播中热切换节目，不断连麦不清空消息
  await app.applyProgramToRoom('asmr', '雨夜助眠', 'quiet', { asmrTrackId: addedTrack.id, asmrDurationMs: 60000, asmrEndAction: 'stop_program' }, true);
  await new Promise(r => setTimeout(r, 20));
  check(app.getState().room.program === 'asmr' && Boolean(app.getState().micStream) && app.getState().room.messages.length >= prevMsgCount, '直播中热切 ASMR 节目不断连麦也不丢失聊天记录');

  // ASMR 定时到期 -> 切屏校准停止 ASMR 返回 chat
  app.getState().asmrDeadlineMs = Date.now() - 1000;
  app.checkAsmrTimer();
  check(app.getState().room.program === 'chat', 'ASMR 绝对时间戳到期后平滑停止并返回闲聊模式');

  // 4. 过期 AI 请求隔离防串写
  console.log('\n4. 过期 AI 请求隔离与防串写');
  let resolveSlowAi;
  h.pushAiHandler(() => new Promise(resolve => { resolveSlowAi = resolve; }));
  h.doc.getElementById('hl-message-input').value = '听得到吗';
  h.doc.getElementById('hl-send').click();
  await new Promise(r => setTimeout(r, 15));
  // 在 AI 未返回前切换角色并重新开播
  const chars = await ctx.HeartbeatLiveAI.loadAvailableChars();
  await app.startLiveRoom({ hostMode: 'private', charObj: chars[1], program: 'radio', title: '海风电台' });
  if (resolveSlowAi) resolveSlowAi(JSON.stringify({ speech: '这是星野的延迟旧回复，绝对不能出现在小屿直播间！' }));
  await new Promise(r => setTimeout(r, 20));
  const leaked = app.getState().room.messages.some(m => m.text.includes('星野的延迟旧回复'));
  check(!leaked && typeof resolveSlowAi === 'function', '切 Char / 重开直播间后，旧请求返回的延迟回复被严格丢弃不串写');

  // 5. 礼物扣费与手动确认长期记忆闭环
  console.log('\n5. 共享金币礼物扣费与直播手账记忆闭环');
  const ecoBefore = h.getEcoCoins();
  const giftPaid = await ctx.HeartbeatLiveAI.sendGiftTransaction({
    gift: ctx.HeartbeatLiveAI.GIFT_CATALOG.find(g => g.id === 'rose'),
    charObj: chars[0]
  });
  check(giftPaid.ok && giftPaid.coinsSpent === 10 && h.getEcoCoins() === ecoBefore - 10, '付费礼物通过 SharedEconomyService 真实扣除 10 金币');

  const giftFree = await ctx.HeartbeatLiveAI.sendGiftTransaction({
    gift: ctx.HeartbeatLiveAI.GIFT_CATALOG[0],
    charObj: chars[0]
  });
  check(giftFree.ok && giftFree.free && h.getEcoCoins() === ecoBefore - 10, '免费小心意不扣除金币');

  h.setEcoCoins(5);
  const giftPoor = await ctx.HeartbeatLiveAI.sendGiftTransaction({
    gift: ctx.HeartbeatLiveAI.GIFT_CATALOG.find(g => g.id === 'crown'),
    charObj: chars[0]
  });
  check(!giftPoor.ok && h.getEcoCoins() === 5, '金币余额不足时拒绝送礼且不负扣');

  // 关闭时自动停止所有流 & 写入手账（不自动写长期记忆）
  const jnlBeforeMem = (await store.loadJournals()).length;
  check(h.memoriesMap.size === 0, '直播过程绝不自动篡改或写入长期记忆');
  await store.addJournalEntry({
    ownerUid: 1,
    charId: '101',
    charName: '星野',
    hostMode: 'char',
    program: 'chat',
    programLabel: '闲聊直播',
    title: '星夜陪伴',
    summary: '在星野直播间聊了天并送出玫瑰。',
    giftsTotalCoins: 10,
    msgCount: 6,
    startedAt: Date.now() - 120000,
    endedAt: Date.now()
  });
  const latestJnl = (await store.loadJournals())[0];
  const memRes = await ctx.HeartbeatLiveAI.saveJournalToLongMemory({
    journal: latestJnl,
    title: '星夜直播',
    content: latestJnl.summary,
    keywords: ['心动直播', '星野']
  });
  check(memRes.ok && h.memoriesMap.size === 1, '用户在手账确认后真实写入 db.memories');
  const dupRes = await ctx.HeartbeatLiveAI.saveJournalToLongMemory({ journal: latestJnl, title: '星夜直播', content: latestJnl.summary });
  check(dupRes.ok && dupRes.duplicate && h.memoriesMap.size === 1, '同一场手账重复点击保存记忆幂等去重');

  // 6. 删除长期记忆后手账实时校准 & exit_room ASMR 到点自动收播 & 返回栈验证
  console.log('\n6. 手账记忆联动校准、ASMR 到点收播与返回栈资源释放');
  const savedMemId = Array.from(h.memoriesMap.keys())[0];
  h.memoriesMap.delete(savedMemId);
  await app.switchView('diary');
  await new Promise(r => setTimeout(r, 20));
  const diaryEl = h.doc.getElementById('hl-diary-list');
  check(diaryEl.textContent.includes('记住这场直播') && !diaryEl.textContent.includes('已写入长期记忆'), '长期记忆在外部被删除后，手账卡片实时回退为可重新记住状态');

  // popstate 硬件返回测试：手账页 -> 大厅 -> 再次返回退出应用
  h.win.dispatchEvent({ type: 'popstate' });
  check(app.getState().activeView === 'home' && Boolean(h.doc.getElementById('heartbeat-live-page')), '在手账页按硬件返回先退回直播大厅');

  // 开启 ASMR 并设为 exit_room 到期自动收播
  await app.startLiveRoom({
    hostMode: 'char',
    charObj: chars[0],
    program: 'asmr',
    title: '夜雨晚安',
    style: 'quiet',
    asmrTrackId: addedTrack.id,
    asmrDurationMs: 60000,
    asmrEndAction: 'exit_room'
  });
  await app.startConnection('camera');
  check(Boolean(app.getState().cameraStream), '本地摄像头预览已建立流');
  app.getState().asmrDeadlineMs = Date.now() - 1000;
  await app.checkAsmrTimer();
  await new Promise(r => setTimeout(r, 20));
  check(!app.getState().room && h.fakeTrackList.every(t => t.stopped === true), 'ASMR exit_room 到点后自动结束本场直播并释放音频与摄像头流');

  // 7. V1.0.2 User 直接开播、移除节目快捷栏与纯图标连麦栏验收
  console.log('\n7. V1.0.2 User 直接开播、移除快捷栏与纯 SVG 连麦控制栏');
  check(!h.doc.getElementById('hl-modebar'), '直播间顶部已彻底移除四个节目快捷胶囊（#hl-modebar）');
  check(!cssText.includes('.hl-modebar') && cssText.includes('min-width: 44px') && cssText.includes('min-height: 44px') && cssText.includes('.hl-kb-open'), 'CSS 已移除 .hl-modebar 并保证连麦图标 44x44 热区与软键盘适配');

  // 点击「我的心动直播间 -> 开播」直接进入 User 个人直播间，不强制选 Char，不绑定错误角色
  let aiCallCount = 0;
  h.pushAiHandler(async () => { aiCallCount++; return JSON.stringify({ speech: '不应触发' }); });
  h.doc.getElementById('hl-go-live').click();
  await new Promise(r => setTimeout(r, 25));
  const soloRoom = app.getState().room;
  check(Boolean(soloRoom) && soloRoom.hostMode === 'user' && soloRoom.charObj === null && app.getState().openModal === '', 'User 点击「开播」直接进入个人直播间，无需预选 Char 且不默认绑定错误角色');
  check(aiCallCount === 0, 'User 独自开播时不误触发 Char AI 开场请求');

  // 独自开播期间支持发消息、热切换节目（如 ASMR）、禁止误扣金币向空角色送礼
  h.doc.getElementById('hl-message-input').value = '今晚我先一个人播一会儿';
  h.doc.getElementById('hl-send').click();
  await new Promise(r => setTimeout(r, 20));
  check(aiCallCount === 0 && soloRoom.messages.some(m => m.text.includes('今晚我先一个人播一会儿')), 'User 独自开播可正常发送消息且不误调 Char AI');
  await app.applyProgramToRoom('radio', '晚安随想', 'quiet', {}, true);
  check(app.getState().room.program === 'radio', '移除快捷栏后仍可通过节目切换机制热切节目');
  const poorSoloGift = await ctx.HeartbeatLiveAI.sendGiftTransaction({
    gift: ctx.HeartbeatLiveAI.GIFT_CATALOG.find(g => g.id === 'rose'),
    charObj: soloRoom.charObj
  });
  check(!poorSoloGift.ok, 'User 未邀请 Char 时阻止向空目标送出付费金币礼物');

  // 直播中通过顶栏「+ 邀请」主动邀请 Char，之后才能开启对话与连麦
  const inviteBtn = h.doc.getElementById('hl-invite-btn');
  check(Boolean(inviteBtn) && inviteBtn.style.display !== 'none', 'User 个人直播间顶部提供主动「+ 邀请」Char 入口');
  inviteBtn.click();
  check(app.getState().openModal === 'userHost', '点击邀请弹出直播中选角抽屉');
  h.clearAiQueue();
  h.pushAiHandler(async () => JSON.stringify({ speech: '哈喽，我收到邀请来前排陪你开播啦！', audience: '' }));
  h.doc.getElementById('hl-userhost-list').querySelector('[data-invite-char="101"]').click();
  await new Promise(r => setTimeout(r, 30));
  check(app.getState().room.charObj && app.getState().room.charObj.id === '101' && app.getState().room.messages.some(m => m.senderRole === 'char' && m.text.includes('收到邀请来前排陪你')), '直播中主动邀请 Char 后成功接入真实 Char AI 对话');

  // 开启文字连麦，检验纯 SVG 图标按钮与输入栏位置、双布局热切换与挂断恢复
  await app.startConnection('text');
  await new Promise(r => setTimeout(r, 20));
  const layoutBtn = h.doc.getElementById('hl-layout-toggle');
  const swapBtn = h.doc.getElementById('hl-swap-screens');
  const discBtn = h.doc.getElementById('hl-disconnect');
  const textCallBox = h.doc.getElementById('hl-text-call-composer');
  const footerEl = h.doc.getElementById('heartbeat-live-page').querySelector('.hl-roomfooter');
  check(Boolean(footerEl.querySelector('#hl-text-call-composer')) && !h.doc.getElementById('hl-connection-overlay').querySelector('#hl-text-call-composer'), '文字连麦输入框位于底栏内，与连麦画面和纯图标栏物理分离不互相遮挡');
  check(!textCallBox.hidden && layoutBtn.textContent.trim() === '' && swapBtn.textContent.trim() === '' && discBtn.textContent.trim() === '', '三个连麦操作按钮均不显示文字');
  check(Boolean(layoutBtn.querySelector('svg')) && Boolean(swapBtn.querySelector('svg')) && Boolean(discBtn.querySelector('svg')), '三个连麦操作按钮均使用内联 SVG 图标');
  check(Boolean(layoutBtn.getAttribute('aria-label')) && Boolean(swapBtn.getAttribute('title')) && Boolean(discBtn.getAttribute('aria-label')), '纯图标按钮保留 title 与 aria-label 无障碍属性');

  h.doc.getElementById('hl-text-call-input').value = '连麦中写了一半的文字';
  layoutBtn.click();
  swapBtn.click();
  check(roomEl.classList.contains('hl-connection-active') && roomEl.classList.contains('hl-connection-swapped'), '纯图标按钮可正常切换双人并列布局并交换位置');
  check(layoutBtn.textContent.trim() === '' && Boolean(layoutBtn.querySelector('svg')), '切换布局后按钮仍保持纯 SVG 图标不被文字覆盖');
  check(h.doc.getElementById('hl-text-call-input').value === '连麦中写了一半的文字', '切换连麦布局不清空正在编辑的连麦文字');

  discBtn.click();
  check(h.doc.getElementById('hl-connection-overlay').hidden === true && !roomEl.classList.contains('hl-has-connection') && !roomEl.classList.contains('hl-connection-active'), '点击挂断图标恢复单人直播画面并重置布局类');

  // 摄像头预览下切换布局不断流，且软键盘弹出触发 .hl-kb-open 避让
  await app.startConnection('camera');
  const camStreamBefore = app.getState().cameraStream;
  const camEl = h.doc.getElementById('hl-user-camera');
  layoutBtn.click();
  swapBtn.click();
  check(Boolean(camStreamBefore) && app.getState().cameraStream === camStreamBefore && camEl.srcObject === camStreamBefore && camEl.hidden === false, '摄像头连麦下切换并列布局与交换位置不破坏本地摄像头预览');
  h.win.innerHeight = 460;
  h.win.dispatchEvent({ type: 'resize' });
  check(roomEl.classList.contains('hl-kb-open'), 'Android WebView 软键盘压缩窗口高度时自动进入 .hl-kb-open 避让态');
  h.win.innerHeight = 844;
  h.win.dispatchEvent({ type: 'resize' });
  check(!roomEl.classList.contains('hl-kb-open'), '软键盘收起后自动解除 .hl-kb-open 紧缩态');
  discBtn.click();
  check(!app.getState().cameraStream && camEl.hidden === true && camEl.srcObject === null, '挂断摄像头连麦后释放预览流并恢复单人画面');

  // User 未邀请 Char 独自开播后退出，手账安全记录且不崩溃
  h.doc.getElementById('hl-exit-room').click();
  await new Promise(r => setTimeout(r, 20));
  await app.startLiveRoom({ hostMode: 'user', charObj: null, program: 'chat', title: '一个人的小夜曲' });
  h.doc.getElementById('hl-message-input').value = '晚安记录';
  h.doc.getElementById('hl-send').click();
  h.doc.getElementById('hl-exit-room').click();
  await new Promise(r => setTimeout(r, 20));
  const soloJournals = await store.loadJournals();
  check(soloJournals.some(j => j.title === '一个人的小夜曲' && j.charId === ''), 'User 未邀 Char 独自开播后退房安全保存手账，不崩溃且不绑定错误 Char');

  // 8. 顶栏点击「心动直播」返回桌面且右上角无设置按钮
  console.log('\n8. 顶栏返回桌面与退出资源释放');
  if (app.getState().openModal) {
    h.doc.getElementById('hl-summary-planner').querySelector('[data-close-modal]').click();
  }
  check(!h.doc.getElementById('hl-settings-top'), '直播大厅右上角已移除设置按钮');
  const titleBackBtn = h.doc.getElementById('hl-back-desktop');
  check(Boolean(titleBackBtn) && titleBackBtn.textContent.includes('心动直播'), '大厅「心动直播」标题直接作为返回桌面入口');
  titleBackBtn.click();
  check(!h.doc.getElementById('heartbeat-live-page'), '点击「心动直播」标题已返回手机桌面');
  check(h.fakeTrackList.every(t => t.stopped === true), '退出心动直播时立即停止全部麦克风与摄像头轨道');
  check(h.revokedUrls.length > 0, '退出时回收所有临时 Blob URL');

  // 9. 直播大厅精简去重与顺序调整（正在直播 -> 我要开播 -> 双人连线 -> 选择 Char 或 NPC）
  console.log('\n9. 直播大厅精简去重与模块顺序（正在直播 -> 我要开播 -> 双人连线 -> 选择 Char 或 NPC）');
  await app.open();
  const homeHtml = h.doc.getElementById('heartbeat-live-page').innerHTML;
  const idxBroadcasts = homeHtml.indexOf('id="hl-broadcasts"');
  const idxUserLive = homeHtml.indexOf('id="hl-go-live"');
  const idxPrivCard = homeHtml.indexOf('id="hl-private-start2"');
  const idxRolePickerBtn = homeHtml.indexOf('id="hl-open-role-picker"');
  const idxCharPicker = homeHtml.indexOf('id="hl-char-picker"');
  check(
    !h.doc.getElementById('hl-private-start') &&
    !homeHtml.includes('一键进入私人连线') &&
    !homeHtml.includes('hl-featured'),
    '已彻底删除重复的旧版大型双人连线卡片与专属类名'
  );
  check(
    homeHtml.split('id="hl-broadcasts"').length === 2 &&
    homeHtml.split('🔴 正在直播').length === 2,
    '「正在直播」模块仅存在唯一一份，无重复渲染'
  );
  check(
    idxBroadcasts > 0 && idxUserLive > idxBroadcasts && idxPrivCard > idxUserLive &&
    idxRolePickerBtn > idxPrivCard && idxCharPicker > idxRolePickerBtn,
    '直播大厅按「正在直播 -> 我要开播 -> 双人连线 -> 选择 Char 或 NPC」顺序渲染'
  );
  h.doc.getElementById('hl-private-start2').click();
  check(app.getState().openModal === 'planner' && app.getState().plannerPendingMode === 'private', '保留的「私人双人直播」仍正常进入私人连线企划');
  h.doc.getElementById('hl-planner').querySelector('[data-close-modal]').click();

  // 10. V1.1 应用内可拖动悬浮小窗生命周期
  console.log('\n10. V1.1 应用内可拖动悬浮小窗生命周期与状态保留');
  h.clearAiQueue();
  h.pushAiHandler(async () => JSON.stringify({ speech: '小窗测试欢迎！', audience: '' }));
  await app.startLiveRoom({
    hostMode: 'char',
    charObj: chars[0],
    program: 'asmr',
    title: '小窗雨声测试',
    style: 'quiet',
    asmrTrackId: addedTrack.id,
    asmrDurationMs: 120000,
    asmrEndAction: 'stop_program'
  });
  await new Promise(r => setTimeout(r, 25));
  const origSessionId = app.getState().room.sessionId;
  const origLogSessionId = app.getState().room.logSessionId;
  const origDeadline = app.getState().asmrDeadlineMs;
  const origMsgLen = app.getState().room.messages.length;

  h.doc.getElementById('hl-minimize-btn').click();
  const miniEl = h.doc.getElementById('hl-mini-window');
  const livePage = h.doc.getElementById('heartbeat-live-page');
  check(Boolean(miniEl) && app.getState().minimized === true && livePage.classList.contains('hl-is-minimized'), '点击「缩小」后挂载应用内悬浮小窗并隐藏全屏直播页');
  check(miniEl.parentNode === h.appRoot && miniEl.textContent.includes('应用内小窗') && !miniEl.querySelector('#hl-gift-grid'), '小窗挂载于 #app 顶层，标明应用内小窗且不含完整礼物/弹幕面板');
  check(app.getState().room && app.getState().room.sessionId === origSessionId && app.getState().asmrDeadlineMs === origDeadline, '缩成小窗时完整保留 sessionId 与 ASMR 定时');

  // 模拟拖动越界裁剪
  miniEl.dispatchEvent({ type: 'pointerdown', clientX: 50, clientY: 50, target: miniEl });
  h.win.dispatchEvent({ type: 'pointermove', clientX: 2500, clientY: -800, cancelable: true, preventDefault() {} });
  h.win.dispatchEvent({ type: 'pointerup' });
  const clampedLeft = parseInt(miniEl.style.left, 10);
  const clampedTop = parseInt(miniEl.style.top, 10);
  check(clampedLeft <= 375 - 172 && clampedTop >= 12, '悬浮小窗拖动范围被安全限制在应用视口内');

  // 模拟打开了其他全屏页面（zIndex: 1000），再从桌面图标点击恢复
  const otherPage = h.doc.createElement('div');
  otherPage.className = 'full-page';
  otherPage.style.zIndex = '1000';
  h.appRoot.appendChild(otherPage);
  h.win.dispatchEvent({ type: 'popstate' });
  check(app.getState().minimized === true && Boolean(app.getState().room), '小窗态下按其他页返回键不会误关后台直播间');

  h.clearAiQueue();
  let reopenAiHits = 0;
  h.pushAiHandler(async () => { reopenAiHits++; return JSON.stringify({ speech: '不应重复触发开场' }); });
  await app.open();
  check(!h.doc.getElementById('hl-mini-window') && !livePage.classList.contains('hl-is-minimized') && parseInt(livePage.style.zIndex, 10) > 1000, '点击心动直播入口无损恢复全屏并盖过期间打开的高层应用页');
  check(app.getState().room.sessionId === origSessionId && app.getState().room.messages.length === origMsgLen && reopenAiHits === 0, '恢复全屏后保留原会话状态且不重复触发开场 AI');

  // 再次缩小后点小窗关闭按钮：先测试取消、再测试确认关闭并落盘手账与聊天记录
  h.doc.getElementById('hl-minimize-btn').click();
  h.setConfirm(false);
  await h.doc.getElementById('hl-mini-close').click();
  check(Boolean(h.doc.getElementById('hl-mini-window')) && Boolean(app.getState().room), '关闭小窗弹窗点击取消后保持直播与小窗继续运行');
  h.setConfirm(true);
  await h.doc.getElementById('hl-mini-close').click();
  await new Promise(r => setTimeout(r, 25));
  check(!h.doc.getElementById('hl-mini-window') && !h.doc.getElementById('heartbeat-live-page') && !app.getState().room, '确认关闭悬浮小窗后结束本场直播并清理 DOM');
  const afterMiniLog = await store.loadSessionChatLog(origLogSessionId);
  check(afterMiniLog.exists && afterMiniLog.totalCount >= origMsgLen, '通过悬浮小窗结束直播仍完整保存本场手账聊天记录');
  otherPage.remove();

  // 11. V1.1 User 开播多人邀请 (Char + NPC)、观众 != 连麦、串行队列与隔离安全
  console.log('\n11. V1.1 User 开播多人邀请 (Char + NPC)、观众与连麦分离及 NPC 严格隔离');
  await app.open();
  h.lorebookCalls.length = 0;
  h.memReadCalls.length = 0;
  h.wxReadCalls.length = 0;
  h.capturedAiCalls.length = 0;
  h.clearAiQueue();

  h.doc.getElementById('hl-go-live').click();
  await new Promise(r => setTimeout(r, 20));
  h.doc.getElementById('hl-invite-btn').click();

  const uhList = h.doc.getElementById('hl-userhost-list');
  check(Boolean(uhList.querySelector('[data-invite-char="101"]')) && Boolean(uhList.querySelector('[data-invite-char="201"]')), '邀请列表同时展示 Char 与 NPC');
  check(uhList.textContent.includes('NPC') && uhList.textContent.includes('Char'), '邀请列表清晰区分 Char 与 NPC 身份标签');

  // 搜索与角色类型筛选
  const searchInp = h.doc.getElementById('hl-invite-search');
  searchInp.value = '阿茶';
  if (typeof searchInp.oninput === 'function') searchInp.oninput();
  check(Boolean(uhList.querySelector('[data-invite-char="201"]')) && !uhList.querySelector('[data-invite-char="101"]'), '搜索框可按名称实时筛选受邀角色');
  searchInp.value = '';
  if (typeof searchInp.oninput === 'function') searchInp.oninput();
  h.doc.querySelector('[data-invite-filter="npc"]').click();
  check(Boolean(uhList.querySelector('[data-invite-char="201"]')) && !uhList.querySelector('[data-invite-char="102"]'), '支持筛选仅看 NPC 角色');
  h.doc.querySelector('[data-invite-filter="all"]').click();

  // 依次邀请 Char 101、Char 102、NPC 201
  h.pushAiHandler(async () => JSON.stringify({ speech: '星野坐前排来啦', audience: '星野来了！' }));
  h.pushAiHandler(async () => JSON.stringify({ speech: '小屿也来蹲前排。', audience: '' }));
  h.pushAiHandler(async () => JSON.stringify({ speech: '咖啡店忙完来逛逛你的直播间~', audience: '' }));
  uhList.querySelector('[data-invite-char="101"]').click();
  uhList.querySelector('[data-invite-char="102"]').click();
  uhList.querySelector('[data-invite-char="201"]').click();
  await new Promise(r => setTimeout(r, 50));

  const multiRoom = app.getState().room;
  check(multiRoom.invitedViewers.length === 3, '支持同时邀请多位嘉宾（含 Char 与 NPC）进入直播间');
  check(multiRoom.cohostCharObj === null && app.getState().connectionType === '' && h.doc.getElementById('hl-connection-overlay').hidden === true, '受邀进入观众席绝不自动上麦或抢占 User 主播舞台');

  // 校验 NPC 与 Char 严格上下文隔离
  const npcCall = h.capturedAiCalls.find(c => c.opts && String(c.opts.system || '').includes('扮演 NPC 角色「阿茶」'));
  const charCall = h.capturedAiCalls.find(c => c.opts && String(c.opts.system || '').includes('扮演角色「星野」'));
  check(Boolean(npcCall) && !h.memReadCalls.includes('201') && !h.wxReadCalls.includes('201') && !JSON.stringify(npcCall).includes('私有秘密记忆'), 'NPC 发言绝不读取任何 Char 长期记忆与万象镜经历');
  check(Boolean(charCall) && String(charCall.opts.system).includes('<char_persona>') && String(npcCall.opts.system).includes('<npc_persona>'), 'Char 使用 <char_persona> 且 NPC 使用独立 <npc_persona> 模板');

  // User 发一条未指定角色的弹幕 -> 最多只选 2 名AI轮流串行回应，绝不三连轰炸或互相递归
  const callsBeforeUserTurn = h.capturedAiCalls.length;
  h.pushAiHandler(async () => JSON.stringify({ speech: '第一顺位回应', audience: '' }));
  h.pushAiHandler(async () => JSON.stringify({ speech: '第二顺位回应', audience: '' }));
  h.pushAiHandler(async () => JSON.stringify({ speech: '不该被触发的第三人', audience: '' }));
  h.doc.getElementById('hl-message-input').value = '今晚大家都来玩呀';
  h.doc.getElementById('hl-send').click();
  await new Promise(r => setTimeout(r, 50));
  check(h.capturedAiCalls.length - callsBeforeUserTurn === 2, '多人直播中单轮用户发言最多由 2 位受邀角色串行回应，防止刷屏与互相触发');

  // 主动选择 NPC 201 上麦文字连麦，挂断后退回观众席但仍保留在受邀观众列表
  h.doc.getElementById('hl-userhost-planner').querySelector('[data-close-modal]').click();
  app.openConnectModal();
  const targetSel = h.doc.getElementById('hl-connect-target');
  targetSel.value = '201';
  await app.startConnection('text');
  check(multiRoom.cohostCharObj && multiRoom.cohostCharObj.id === '201' && h.doc.getElementById('hl-connection-overlay').hidden === false, 'User 可从受邀名单手动点选 NPC 或 Char 上麦连麦');
  h.doc.getElementById('hl-text-call-input').value = '阿茶连麦测试句';
  h.doc.getElementById('hl-text-call-send').click();
  await new Promise(r => setTimeout(r, 30));
  h.doc.getElementById('hl-disconnect').click();
  check(multiRoom.cohostCharObj === null && multiRoom.invitedViewers.some(v => v.id === '201'), '挂断连麦后嘉宾仅下麦回到观众席，不丢失受邀观众身份');

  // 移出嘉宾 / 角色被删时，队列与在途回复严格丢弃
  h.clearAiQueue();
  let resolveRemovedCharAi;
  h.pushAiHandler(() => new Promise(res => { resolveRemovedCharAi = res; }));
  h.doc.getElementById('hl-message-input').value = '叫一下小屿';
  h.doc.getElementById('hl-send').click();
  await new Promise(r => setTimeout(r, 15));
  await app.removeViewerFromUserRoom('102');
  if (resolveRemovedCharAi) resolveRemovedCharAi(JSON.stringify({ speech: '已经被移出的小屿违规消息' }));
  await new Promise(r => setTimeout(r, 25));
  check(!multiRoom.messages.some(m => m.text.includes('已经被移出的小屿违规消息')), '移出观众后正在返回的该角色 AI 回复被丢弃不写入直播间');

  // 删除底层 db.characters 中的 NPC 记录，在途回复必须拦截
  let resolveDeletedNpcAi;
  h.clearAiQueue();
  h.pushAiHandler(() => new Promise(res => { resolveDeletedNpcAi = res; }));
  h.doc.getElementById('hl-message-input').value = '问问阿茶在吗';
  h.doc.getElementById('hl-send').click();
  await new Promise(r => setTimeout(r, 15));
  h.charsMap.delete(201);
  if (resolveDeletedNpcAi) resolveDeletedNpcAi(JSON.stringify({ speech: '已删除NPC的幽灵消息' }));
  await new Promise(r => setTimeout(r, 25));
  check(!multiRoom.messages.some(m => m.text.includes('已删除NPC的幽灵消息')), '底层角色库删除某角色后，未落地的 AI 回复被二次核验拦截');
  h.charsMap.set(201, { id: 201, type: 'npc', name: '阿茶', role: '咖啡店员', description: '嘴硬心软的小镇店员', group: '小镇居民', avatar: 'https://example.com/npc1.png' });

  // 送礼支持指定收礼人，并结束多人场次保存完整日志
  h.setEcoCoins(200);
  const giftTx = await ctx.HeartbeatLiveAI.sendGiftTransaction({
    gift: ctx.HeartbeatLiveAI.GIFT_CATALOG.find(g => g.id === 'rose'),
    charObj: multiRoom.invitedViewers[0]
  });
  check(giftTx.ok && h.getEcoCoins() === 190, '多人直播中可指定向受邀嘉宾送出共享金币礼物');
  const multiLogId = multiRoom.logSessionId;
  h.setConfirm(true);
  h.doc.getElementById('hl-exit-room').click();
  await new Promise(r => setTimeout(r, 30));

  // 纯 NPC 场次严禁写入 db.memories
  const memBeforeNpcOnly = h.memoriesMap.size;
  await app.startLiveRoom({
    hostMode: 'user',
    charObj: null,
    invitedViewers: [{ id: '201', roleType: 'npc', name: '阿茶', avatar: '' }],
    program: 'chat',
    title: '纯NPC闲聊测试'
  });
  await new Promise(r => setTimeout(r, 25));
  h.doc.getElementById('hl-exit-room').click();
  await new Promise(r => setTimeout(r, 25));
  const npcOnlyJnl = (await store.loadJournals()).find(j => j.title === '纯NPC闲聊测试');
  const npcMemAttempt = await ctx.HeartbeatLiveAI.saveJournalToLongMemory({ journal: npcOnlyJnl, title: '非法写入', content: '不应写入' });
  check(Boolean(npcOnlyJnl) && npcOnlyJnl.charType === 'npc' && !npcMemAttempt.ok && h.memoriesMap.size === memBeforeNpcOnly, '纯 NPC 陪伴场次保存为 npc 手账，且严禁写入 Char db.memories');

  // 12. V1.1 直播手账完整聊天记录回放、分页、旧档兼容与级联删除
  console.log('\n12. V1.1 直播手账完整聊天记录持久化、分页回放、旧版兼容与级联删除');
  const multiLogLoaded = await store.loadSessionChatLog(multiLogId, { includeSimAudience: true });
  check(multiLogId !== origLogSessionId && multiLogLoaded.exists && h.configMap.has(store.KEYS.CHAT_LOG_PREFIX + multiLogId), '不同直播场次按独立 sessionId 持久化聊天日志，互不覆盖');
  check(multiLogLoaded.messages.some(m => m.senderType === 'user_cohost' && m.content.includes('阿茶连麦测试句')), '完整日志包含连麦发言及结构化字段');

  // 切换开关控制是否持久化 [AI观众] 弹幕
  const curSets = await store.loadSettings();
  await store.saveSettings(Object.assign({}, curSets, { saveSimAudienceInLog: false }));
  const filteredSave = await store.saveSessionChatLog('sess_no_sim_test', [
    { senderRole: 'user', senderId: '1', sender: '小弯', text: '真实弹幕', createdAt: 1000 },
    { senderRole: 'ai_audience', senderId: 'ai_1', sender: 'AI观众A', isSimAudience: true, text: '模拟弹幕应被过滤', createdAt: 1001 }
  ]);
  const loadedNoSim = await store.loadSessionChatLog('sess_no_sim_test');
  check(Boolean(filteredSave && filteredSave.messages.length === 1) && loadedNoSim.messages.length === 1 && loadedNoSim.messages[0].content === '真实弹幕', '关闭 saveSimAudienceInLog 开关时不持久化 [AI观众] 气氛弹幕');
  await store.saveSettings(curSets);

  // 分页回放验证 (55 条消息，每页 40)
  const bulkMsgs = [];
  for (let bi = 1; bi <= 55; bi++) {
    bulkMsgs.push({
      senderRole: bi % 5 === 0 ? 'ai_audience' : (bi % 2 === 0 ? 'npc' : 'char'),
      senderId: bi % 2 === 0 ? '201' : '101',
      sender: bi % 5 === 0 ? '路人AI' : (bi % 2 === 0 ? '阿茶' : '星野'),
      isSimAudience: bi % 5 === 0,
      text: '第' + bi + '条测试历史消息',
      createdAt: 1000000 + bi * 1000
    });
  }
  await store.saveSessionChatLog('sess_bulk_55', bulkMsgs);
  const bulkJournal = await store.addJournalEntry({
    ownerUid: 1,
    sessionId: 'sess_bulk_55',
    hasChatLog: true,
    logMessageCount: 55,
    charId: '101',
    charName: '星野、阿茶',
    charType: 'mixed',
    hasRealChar: true,
    hostMode: 'user',
    program: 'chat',
    programLabel: '闲聊直播',
    title: '55条分页测试场次',
    summary: '共55条测试消息。',
    msgCount: 55,
    startedAt: Date.now() - 50000,
    endedAt: Date.now()
  });

  await app.switchView('diary');
  await new Promise(r => setTimeout(r, 20));
  const diaryBtns = h.doc.getElementById('hl-diary-list').querySelectorAll('[data-jnl-replay]');
  check(diaryBtns.length > 0 && h.doc.getElementById('hl-diary-list').textContent.includes('查看本场聊天记录'), '直播手账卡片展示「查看本场聊天记录」入口');

  await app.openReplayView(bulkJournal, 'diary');
  await new Promise(r => setTimeout(r, 20));
  const replayList = h.doc.getElementById('hl-replay-list');
  check(replayList.querySelectorAll('.hl-replay-msg').length === 40 && Boolean(h.doc.getElementById('hl-replay-load-more')), '55 条日志首屏分页加载前 40 条并提供「加载更早记录」');
  h.doc.getElementById('hl-replay-load-more').click();
  await new Promise(r => setTimeout(r, 20));
  check(replayList.querySelectorAll('.hl-replay-msg').length === 55 && replayList.textContent.includes('第55条测试历史消息'), '点击加载更多后按时间先后完整展现全部 55 条记录');

  // 过滤 [AI观众] 开关
  const replaySimChk = h.doc.getElementById('hl-replay-sim-toggle');
  replaySimChk.checked = false;
  if (typeof replaySimChk.onchange === 'function') replaySimChk.onchange();
  await new Promise(r => setTimeout(r, 20));
  check(replayList.querySelectorAll('.hl-replay-msg').length === 40 && !replayList.textContent.includes('AI观众'), '回放页切换隐藏 [AI观众] 开关生效');

  // 旧版 V1.0 无完整日志手账诚实兜底
  const legacyJournal = {
    id: 'legacy_v10_jnl_1',
    charId: '101',
    charName: '星野',
    programLabel: '闲聊直播',
    title: '旧版手账记录',
    summary: '早期V1.0记录的旧摘要',
    msgCount: 12,
    startedAt: Date.now() - 86400000
  };
  let legacyAiHits = 0;
  h.clearAiQueue();
  h.pushAiHandler(async () => { legacyAiHits++; return '不能AI补全'; });
  await app.openReplayView(legacyJournal, 'diary');
  await new Promise(r => setTimeout(r, 20));
  check(h.doc.getElementById('hl-replay-list').textContent.includes('旧版未保存完整聊天记录') && legacyAiHits === 0, '旧版无聊天记录的手账诚实提示「旧版未保存完整聊天记录」且不 AI 编造');

  // 删除手账先确认，确认后同步删除关联聊天记录
  h.doc.getElementById('hl-replay-back').click();
  await new Promise(r => setTimeout(r, 20));
  const delBulkBtn = h.doc.getElementById('hl-diary-list').querySelector('[data-jnl-del="' + bulkJournal.id + '"]');
  h.setConfirm(false);
  await delBulkBtn.click();
  check(h.configMap.has(store.KEYS.CHAT_LOG_PREFIX + 'sess_bulk_55'), '删除手账取消确认时保留手账及对应聊天记录');
  h.setConfirm(true);
  await delBulkBtn.click();
  await new Promise(r => setTimeout(r, 25));
  check(!h.configMap.has(store.KEYS.CHAT_LOG_PREFIX + 'sess_bulk_55') && !(await store.loadJournals()).some(j => j.id === bulkJournal.id), '确认删除手账后同步删除关联的本场聊天记录');

  // 13. V1.1.1 底部纯图标节目切换按钮 & 点赞结构策略
  console.log('\n13. V1.1.1 底部纯图标节目切换按钮与点赞入口策略');
  await app.startLiveRoom({ hostMode: 'user', charObj: null, program: 'chat', title: 'UI位置验证' });
  await new Promise(r => setTimeout(r, 20));
  const roomTopEl = h.doc.querySelector('.hl-roomtop');
  const composerEl = h.doc.querySelector('.hl-composer');
  const composerBtnIds = Array.from(composerEl.querySelectorAll('button')).map(b => b.id);
  const progSwitchBtns = h.doc.getElementById('heartbeat-live-page').querySelectorAll('#hl-quick-program-switch');
  const switchBtn = h.doc.getElementById('hl-quick-program-switch');
  check(!roomTopEl.querySelector('#hl-quick-program-switch'), '顶部 .hl-roomtop 已移除节目切换按钮');
  check(!h.doc.getElementById('hl-quick-heart') && composerBtnIds.join(',') === 'hl-send,hl-quick-program-switch,hl-quick-gift', '底部操作栏移除点赞按钮，保留「发送 -> 节目切换 -> 礼物」顺序');
  check(progSwitchBtns.length === 1 && switchBtn.textContent.trim() === '' && Boolean(switchBtn.querySelector('svg')), '全页仅保留唯一一个节目切换按钮，且为纯内联 SVG 图标不含“切换”文字');
  check(Boolean(switchBtn.getAttribute('aria-label')) && Boolean(switchBtn.getAttribute('title')) && cssText.includes('.hl-roundbtn') && cssText.includes('min-width: 44px') && cssText.includes('min-height: 44px'), '底部节目切换图标满足 44x44px 点击热区并含无障碍提示');
  const sideLikeBtn = h.doc.getElementById('hl-like');
  const likesBefore = app.getState().room.likes;
  sideLikeBtn.click();
  check(Boolean(sideLikeBtn) && app.getState().room.likes === likesBefore + 1, '侧边栏原有免费点赞按钮与点赞计数逻辑完整保留');
  switchBtn.click();
  check(app.getState().openModal === 'planner' && h.doc.querySelectorAll('.hl-program').length === 7, '点击底部切换按钮可打开原 7 种节目切换抽屉');
  h.doc.querySelector('[data-program="game"]').click();
  await h.doc.getElementById('hl-plan-confirm').click();
  await new Promise(r => setTimeout(r, 20));
  check(app.getState().room.program === 'game' && app.getState().openModal === '', '通过底部按钮可在直播中直接热切换 7 种节目');

  // 14. V1.1.1 直播消息独立上下滑动、暂停自动跟随与「↓ 最新消息」
  console.log('\n14. V1.1.1 直播消息独立上下滚动、暂停跟随与最新消息提示');
  check(!/\.hl-messages\s*\{[^}]*justify-content\s*:\s*flex-end/i.test(cssText), 'CSS .hl-messages 已移除阻断向上滚动的 justify-content: flex-end');
  check(cssText.includes('overscroll-behavior: contain') && cssText.includes('touch-action: pan-y') && cssText.includes('.hl-messages > :first-child'), 'CSS 为 .hl-messages 配置独立滚动、滚动链隔离及 first-child margin-top: auto');

  const msgBox = h.doc.getElementById('hl-messages');
  const latestBtn = h.doc.getElementById('hl-latest-msg-btn');
  const inputBox = h.doc.getElementById('hl-message-input');
  let focusCalls = 0;
  inputBox.focus = () => { focusCalls++; };
  msgBox.clientHeight = 140;
  msgBox.scrollHeight = 120;
  msgBox.scrollTop = 0;
  check(latestBtn.hidden === true, '处于底部跟随态时默认隐藏「↓ 最新消息」');

  const origAppendMsg = msgBox.appendChild.bind(msgBox);
  msgBox.appendChild = (child) => {
    const res = origAppendMsg(child);
    msgBox.scrollHeight += 28;
    return res;
  };
  for (let mi = 1; mi <= 26; mi++) {
    h.doc.getElementById('hl-message-input').value = '第' + mi + '条弹幕历史';
    h.doc.getElementById('hl-send').click();
  }
  check(msgBox.children.length > 18 && app.getState().room.messages.length >= 26, '直播间 DOM 保留多于 18 条消息记录供向上滑动回顾');
  check(msgBox.scrollTop === msgBox.scrollHeight && latestBtn.hidden === true, '停留在底部时新消息保持自动跟随');

  // 模拟用户向上滑动查看早期消息
  msgBox.scrollTop = 45;
  msgBox.dispatchEvent({ type: 'scroll' });
  check(app.getState().messagesAutoFollow === false && latestBtn.hidden === false, '向上滑动离开底部后暂停自动跟随并显示「↓ 最新消息」');

  // 来新消息时不拉回底部，也不抢输入焦点
  const stBeforeUnread = msgBox.scrollTop;
  h.doc.getElementById('hl-message-input').value = '新来一条未读弹幕';
  h.doc.getElementById('hl-send').click();
  check(msgBox.scrollTop === stBeforeUnread && latestBtn.hidden === false && latestBtn.textContent.includes('(1)') && focusCalls === 0, '上划浏览时到达新消息不强行拉回底部、不抢输入框焦点并累计新消息提示');

  // 点击「↓ 最新消息」回到底部恢复自动跟随
  latestBtn.click();
  check(app.getState().messagesAutoFollow === true && msgBox.scrollTop === msgBox.scrollHeight && latestBtn.hidden === true, '点击「↓ 最新消息」立即回到底部并隐藏按钮恢复跟随');

  // 切小窗验证悬浮小窗不含消息滑动控制与礼物弹幕面板
  h.doc.getElementById('hl-minimize-btn').click();
  const miniNow = h.doc.getElementById('hl-mini-window');
  check(Boolean(miniNow) && !miniNow.querySelector('#hl-latest-msg-btn') && !miniNow.querySelector('#hl-messages'), '悬浮小窗保持精简，不接入直播间消息滑动控件');
  h.doc.getElementById('hl-mini-restore').click();
  h.doc.getElementById('hl-exit-room').click();
  await new Promise(r => setTimeout(r, 20));
  if (app.getState().openModal) {
    h.doc.getElementById('hl-summary-planner').querySelector('[data-close-modal]').click();
  }

  // 15. V1.1.1 大体积 OPFS 导入、取消清理、去重修复、旧 IDB 兼容与备份恢复缺失提示
  console.log('\n15. V1.1.1 本地大文件音频库、取消导入清理、去重修复与备份缺失兜底');
  const superLarge = {
    name: 'forest_140mb.flac',
    type: 'audio/flac',
    size: 140 * 1024 * 1024,
    lastModified: 1700000200000,
    slice(s, e) { return new FakeBlob([], { type: 'audio/flac', _forceSize: e - s }); }
  };
  let lastProgressPct = 0;
  const added140 = await store.addAsmrTrack(superLarge, {
    onProgress(p) { if (p && typeof p.percent === 'number') lastProgressPct = p.percent; }
  });
  check(Boolean(added140 && added140.id) && added140.storageBackend === 'opfs' && lastProgressPct === 100, '支持导入超过 120MB 的超大本地音频至 OPFS 并上报完整进度');

  // 去重检查：同一文件不可重复占位
  let dupErrCaught = false;
  try { await store.addAsmrTrack(superLarge); } catch (e) { dupErrCaught = String(e.message).includes('已跳过重复导入'); }
  check(dupErrCaught, '重复导入已存在的同一音频文件时明确提示并跳过');

  // 取消导入检查：中途 Abort 必须清理未完成 OPFS 文件且不插入列表
  const cancelCtrl = new AbortController();
  const opfsBeforeAbort = h.opfsFiles.size;
  const listBeforeAbort = (await store.listAsmrTracks()).length;
  let abortCaught = false;
  try {
    await store.addAsmrTrack({
      name: 'cancel_me.wav',
      type: 'audio/wav',
      size: 40 * 1024 * 1024,
      slice(s, e) {
        if (s > 0) cancelCtrl.abort();
        return new FakeBlob([], { type: 'audio/wav', _forceSize: e - s });
      }
    }, { signal: cancelCtrl.signal });
  } catch (e) {
    abortCaught = e && e.name === 'AbortError';
  }
  check(abortCaught && h.opfsFiles.size === opfsBeforeAbort && (await store.listAsmrTracks()).length === listBeforeAbort, '取消导入后立即中止写入、清理半成品 OPFS 文件且不污染音轨列表');

  // 旧版 IndexedDB Blob 音频（不含 opfsFileName/storageBackend）兼容播放
  const legacyTrackId = 'asmr_legacy_idb_1';
  const curTracks = await store.listAsmrTracks();
  curTracks.push({ id: legacyTrackId, name: '旧版雨夜IDB音轨', mime: 'audio/mpeg', size: 204800, createdAt: Date.now() - 100000 });
  await h.win.db.config.put({ key: store.KEYS.ASMR_TRACKS, value: curTracks });
  await h.win.db.config.put({ key: store.KEYS.AUDIO_BLOB_PREFIX + legacyTrackId, value: new FakeBlob([], { type: 'audio/mpeg', _forceSize: 204800 }) });
  const legacyRes = await store.resolveAudioTrackPlaySource(legacyTrackId);
  check(legacyRes.ok && legacyRes.sourceType === 'local' && legacyRes.url.startsWith('blob:'), '旧版 IndexedDB Blob 音频保持 100% 兼容可播');

  // 跨设备恢复缺真实文件场景：清空 OPFS 二进制仅留元数据 -> 状态显式标 missingBinary 且自动修复
  h.opfsFiles.delete('heartbeat_live_audio/' + added140.opfsFileName);
  const statusList = await store.listAsmrTracksWithStatus();
  const missingEntry = statusList.find(t => t.id === added140.id);
  const missingPlayRes = await store.resolveAudioTrackPlaySource(added140.id);
  check(Boolean(missingEntry && missingEntry.missingBinary) && !missingPlayRes.ok && missingPlayRes.reason === 'missing_binary', '备份恢复仅含元数据缺真实文件时显式标注缺失而非伪装可播');

  // 重新导入同名同大小音频自动无损修复
  const repaired = await store.addAsmrTrack(superLarge);
  const repairedPlay = await store.resolveAudioTrackPlaySource(repaired.id);
  check(repaired.id === added140.id && repairedPlay.ok && h.opfsFiles.has('heartbeat_live_audio/' + repaired.opfsFileName), '重新导入同名音频可自动无损修复缺失条目');

  // 备份排除开关核验 (data.js 脚本静态 + 规则检查)
  check(
    dataJs.includes('heartbeat_live_audio_blob_') &&
    dataJs.includes('heartbeat_live_cloud_cache_') &&
    dataJs.includes('clearOpfsAudioDir'),
    'data.js 常规备份排除本地/云端音频缓存，清理应用数据时同步清理 OPFS 音频目录'
  );

  // 16. V1.1.1 可选 HTTPS 云端清单、离线缓存、删除缓存保留条目与断网自动回退本地音轨
  console.log('\n16. V1.1.1 可选云端音频清单、缓存清理与离线/异常自动回退本地');
  h.setFetchHandler(async (url) => {
    if (String(url).includes('manifest.json')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            tracks: [
              { id: 'cloud_night_wind', name: '云端林间夜风', category: '自然风声', url: 'https://cdn.example.com/wind.mp3', durationSec: 180, size: 1200000 },
              { id: 'cloud_stream_fail', name: '云端海浪', category: '白噪音', url: 'https://cdn.example.com/cloud_fail.mp3', durationSec: 95, size: 800000 }
            ]
          };
        }
      };
    }
    if (String(url).includes('wind.mp3')) {
      return {
        ok: true,
        status: 200,
        async blob() { return new FakeBlob([], { type: 'audio/mpeg', _forceSize: 1200000 }); }
      };
    }
    return { ok: false, status: 404, async blob() { return new FakeBlob([]); } };
  });

  let badManifestRejected = false;
  try { await store.fetchCloudManifest('http://insecure.example.com/manifest.json'); } catch (_) { badManifestRejected = true; }
  check(badManifestRejected, '云端音频清单严格拒绝非 HTTPS 地址');

  const cloudItems = await store.fetchCloudManifest('https://cdn.example.com/manifest.json');
  check(cloudItems.length === 2 && cloudItems.every(c => !c.cachedLocally && !c.inPlaylist), '同步 HTTPS 云端清单仅拉取元数据，不自动批量下载音频');

  await store.toggleCloudTrackPlaylist('cloud_night_wind', true);
  await store.toggleCloudTrackPlaylist('cloud_stream_fail', true);
  await store.cacheCloudAudioTrack('cloud_night_wind');
  const afterCache = (await store.listCloudCatalog()).find(c => c.id === 'cloud_night_wind');
  check(Boolean(afterCache && afterCache.cachedLocally && afterCache.storageBackend === 'opfs'), '主动下载缓存云端音频后真实落入 OPFS 本地缓存');

  // 离线状态：已缓存云端音频仍可离线播放；未缓存云端音频不可直接在线播并自动回退本地可用音轨
  h.setOnline(false);
  const offlineCachedPlay = await store.resolveAudioTrackPlaySource('cloud_night_wind');
  const offlineUncachedPlay = await store.resolveAudioTrackPlaySource('cloud_stream_fail');
  check(offlineCachedPlay.ok && offlineCachedPlay.sourceType === 'cloud_cached', '离线状态下已缓存云端音轨可正常离网播放');
  check(!offlineUncachedPlay.ok && offlineUncachedPlay.reason === 'offline_uncached', '离线状态下未缓存云端音轨明确阻止假播');

  // 删除云端缓存后：仅清本地缓存，保留云端列表条目与在线链接
  await store.uncacheCloudAudioTrack('cloud_night_wind');
  const afterUncache = (await store.listCloudCatalog()).find(c => c.id === 'cloud_night_wind');
  check(Boolean(afterUncache) && !afterUncache.cachedLocally && afterUncache.url === 'https://cdn.example.com/wind.mp3', '删除云端离线缓存后仅清理本地存储，仍保留云端条目');

  // 在线云端音轨 play() 失败 -> 自动回退到本地可用音轨
  h.setOnline(true);
  await app.startLiveRoom({
    hostMode: 'user',
    charObj: null,
    program: 'asmr',
    title: '云端失败回退测试',
    asmrTrackId: 'cloud_stream_fail'
  });
  await new Promise(r => setTimeout(r, 30));
  const fallbackMsgs = app.getState().room.messages.map(m => m.text).join('\n');
  check(fallbackMsgs.includes('自动回退播放本地音轨') && h.audioInstances.some(a => a.src.startsWith('blob:') && !a.paused), '在线云端音轨播放失败时自动回退至本地可用音轨并提示');

  await app.switchView('settings');
  await new Promise(r => setTimeout(r, 25));
  const quotaTxt = h.doc.getElementById('hl-asmr-quota').textContent;
  check(!quotaTxt.includes('/ 120 MB') && quotaTxt.includes('OPFS') && h.doc.getElementById('hl-cloud-catalog-list').textContent.includes('云端林间夜风'), '设置页正确展示真实存储配额及云端素材控制状态');

  h.doc.getElementById('hl-back-settings').click();
  await app.switchView('home');
  app.close(false);

  // 17. V1.1.2 多角色开播（选择 Char 或 NPC、NPC 独立开播、严格隔离、兼容旧档与移动端适配）
  console.log('\n17. V1.1.2 多角色开播（选择 Char 或 NPC、NPC 独立开播、严格隔离与回放兼容）');
  await app.open();

  // 17.1 角色选择面板：全部 / Char / NPC 筛选、搜索与真实角色读取
  const openRolePickerBtn = h.doc.getElementById('hl-open-role-picker');
  check(Boolean(openRolePickerBtn) && openRolePickerBtn.textContent.includes('选择 Char 或 NPC'), '大厅已升级为「选择 Char 或 NPC」入口');
  openRolePickerBtn.click();
  await new Promise(r => setTimeout(r, 20));
  check(app.getState().openModal === 'rolePicker', '点击「选择 Char 或 NPC」弹出独立角色选择面板');
  let roleCardsAll = h.doc.querySelectorAll('#hl-rolepicker-list .hl-role-card');
  check(roleCardsAll.length === 3, '默认「全部」列表展示 2 位 Char 与 1 位真实 NPC');

  const npcTab = h.doc.querySelector('[data-role-filter="npc"]');
  npcTab.click();
  let roleCardsNpc = h.doc.querySelectorAll('#hl-rolepicker-list .hl-role-card');
  check(roleCardsNpc.length === 1 && roleCardsNpc[0].textContent.includes('阿茶') && roleCardsNpc[0].textContent.includes('NPC'), '切换「NPC」筛选页签仅展示真实 NPC（阿茶）');

  const rpSearch = h.doc.getElementById('hl-rolepicker-search');
  rpSearch.value = '查无此人';
  if (typeof rpSearch.oninput === 'function') rpSearch.oninput();
  check(h.doc.querySelectorAll('#hl-rolepicker-list .hl-role-card').length === 0 && Boolean(h.doc.querySelector('#hl-rolepicker-list .hl-empty-roles')), '搜索无匹配 NPC 时展示明确提示且不伪造 NPC');
  rpSearch.value = '';
  if (typeof rpSearch.oninput === 'function') rpSearch.oninput();

  // 17.2 无 NPC 时诚实空状态，严禁编造虚构 NPC
  const savedNpc201 = h.charsMap.get(201);
  h.charsMap.delete(201);
  await app.openRolePickerModal('npc');
  const emptyNpcCards = h.doc.querySelectorAll('#hl-rolepicker-list .hl-role-card');
  const emptyNpcBox = h.doc.querySelector('#hl-rolepicker-list .hl-empty-roles');
  check(emptyNpcCards.length === 0 && Boolean(emptyNpcBox) && emptyNpcBox.textContent.includes('不会编造或伪造虚构 NPC'), '角色库无 NPC 时显示诚实空状态并严禁编造虚构 NPC');
  h.charsMap.set(201, savedNpc201);

  // 17.3 NPC 无需微信单聊即可独立开播（h.chats 中完全没有 201 的聊天记录）
  await app.openRolePickerModal('npc');
  const npcStartBtn = h.doc.querySelector('[data-role-start="201"]');
  check(Boolean(npcStartBtn), '真实 NPC 恢复后出现「开播」按钮');
  npcStartBtn.click();
  check(app.getState().openModal === 'planner' && app.getState().plannerPendingMode === 'npc' && app.getState().plannerHostObj && app.getState().plannerHostObj.id === '201', '点击 NPC「开播」进入 NPC 独立开播企划，未串为 Char');

  h.clearAiQueue();
  h.capturedAiCalls.length = 0;
  h.memReadCalls.length = 0;
  h.wxReadCalls.length = 0;
  h.lorebookCalls.length = 0;
  const memCountBeforeNpc = h.memoriesMap.size;
  h.pushAiHandler(async () => JSON.stringify({ speech: '欢迎光临转角咖啡馆的夜班直播，点杯热美式慢慢听我聊吧。', audience: '阿茶今天营业状态满分' }));

  h.doc.getElementById('hl-plan-title').value = '阿茶的夜班咖啡台';
  await h.doc.getElementById('hl-plan-confirm').click();
  await new Promise(r => setTimeout(r, 30));

  const npcRoom = app.getState().room;
  check(
    Boolean(npcRoom) &&
    npcRoom.hostMode === 'npc' &&
    npcRoom.hostType === 'npc' &&
    npcRoom.hostId === '201' &&
    npcRoom.hostName === '阿茶',
    '无微信单聊记录的 NPC（阿茶）成功进入独立直播间，统一主播身份为 hostType=npc'
  );
  check(
    h.doc.getElementById('hl-host-name').textContent.includes('阿茶') &&
    h.doc.getElementById('hl-host-name').textContent.includes('[NPC]') &&
    h.doc.getElementById('hl-host-status').textContent.includes('NPC') &&
    h.doc.getElementById('hl-room-title').textContent.includes('阿茶的夜班咖啡台'),
    '直播间顶栏与舞台准确显示 NPC 头像/名称与「NPC 主播」身份标记'
  );

  // 17.4 NPC 严格隔离校验：不读 Char 记忆、不读万象镜、不使用双语、绝不写入 db.memories
  h.pushAiHandler(async () => JSON.stringify({ speech: '店里刚磨好一壶耶加雪菲，你那边忙完了吗？', audience: '' }));
  h.doc.getElementById('hl-message-input').value = '我刚下班过来捧场';
  h.doc.getElementById('hl-send').click();
  await new Promise(r => setTimeout(r, 35));

  const npcAiCalls = h.capturedAiCalls.slice();
  const npcSysPrompt = npcAiCalls.map(c => String((c.opts && c.opts.system) || '')).join('\n');
  check(npcAiCalls.length >= 2 && npcSysPrompt.includes('<npc_persona>') && !npcSysPrompt.includes('<char_persona>'), 'NPC 直播提示词采用专属 <npc_persona> 块而非 Char <char_persona>');
  check(
    !h.memReadCalls.includes(201) && !h.memReadCalls.includes('201') &&
    !h.wxReadCalls.includes(201) && !h.wxReadCalls.includes('201') &&
    !npcSysPrompt.includes('月光海岸') && !npcSysPrompt.includes('Char_101') && !npcSysPrompt.includes('<bilingual_rule>'),
    'NPC 开播严格隔离：绝不读取 Char 长期记忆/万象镜经历/微信单聊/双语规则'
  );
  check(h.memoriesMap.size === memCountBeforeNpc, 'NPC 直播过程不会自动写入 Char 长期记忆 db.memories');

  // 17.5 NPC 直播间中可邀 Char 作为普通观众旁听，且不影响 NPC 作为本场主播，亦支持与用户双人连麦布局切换
  h.pushAiHandler(async () => JSON.stringify({ speech: '星野过来听阿茶煮咖啡啦。', audience: '' }));
  await app.inviteViewerToRoom('101');
  await new Promise(r => setTimeout(r, 25));
  check(
    app.getState().room.hostId === '201' &&
    app.getState().room.hostType === 'npc' &&
    app.getState().room.invitedViewers.some(v => v.id === '101'),
    'NPC 直播间可额外邀请 Char 作为观众互动，且不篡改 NPC 的主播身份'
  );

  h.doc.getElementById('hl-connect-btn').click();
  check(app.getState().openModal === 'connect', 'NPC 直播间点击连麦正常打开连麦方式选择');
  h.pushAiHandler(async () => JSON.stringify({ speech: '上麦啦，今天想点什么歌？', audience: '' }));
  h.doc.getElementById('hl-text-connect').click();
  await new Promise(r => setTimeout(r, 20));
  check(app.getState().connectionType === 'text' && app.getState().connectionLayout === 'floating', 'User 可与 NPC 主播发起双人连麦（默认经典小窗）');
  h.doc.getElementById('hl-layout-toggle').click();
  check(app.getState().connectionLayout === 'split', '与 NPC 连麦同样支持切换左右并列布局');
  h.doc.getElementById('hl-disconnect').click();
  check(!app.getState().connectionType, '挂断与 NPC 的连麦后恢复单主播舞台');

  // 17.6 结束 NPC 直播：保存为 NPC 主播手账，禁用长期记忆写入，支持回放过滤
  const npcLogId = app.getState().room.logSessionId;
  h.doc.getElementById('hl-exit-room').click();
  await new Promise(r => setTimeout(r, 30));

  const journalsAfterNpc = await store.loadJournals();
  const npcJournal = journalsAfterNpc.find(j => j.title === '阿茶的夜班咖啡台');
  check(
    Boolean(npcJournal) &&
    npcJournal.hostType === 'npc' &&
    npcJournal.hostId === '201' &&
    npcJournal.hostName === '阿茶' &&
    npcJournal.hasRealChar === false &&
    Boolean(npcJournal.startedAt) && Boolean(npcJournal.endedAt),
    'NPC 直播结束后生成带 hostType=npc、起止时间与 hasRealChar=false 的手账记录'
  );

  const npcMemSaveRes = await ctx.HeartbeatLiveAI.saveJournalToLongMemory({ journal: npcJournal, title: '非法写入测试', content: 'NPC不应写入' });
  check(Boolean(npcMemSaveRes && !npcMemSaveRes.ok) && h.memoriesMap.size === memCountBeforeNpc, 'NPC 主播手账严禁写入 Char 长期记忆（即使手动调用亦被拦截）');

  // 手账回放检查 NPC 主播与 User 观众角色区分
  await app.switchView('diary');
  await new Promise(r => setTimeout(r, 20));
  const diaryText = h.doc.getElementById('hl-diary-list').textContent;
  check(diaryText.includes('NPC 主播') && diaryText.includes('阿茶的夜班咖啡台'), '手账页明确标示「NPC 主播」徽章');
  const npcReplayBtn = h.doc.querySelector('[data-jnl-replay="' + npcJournal.id + '"]');
  check(Boolean(npcReplayBtn), 'NPC 直播手账提供「查看本场聊天记录」回放入口');
  npcReplayBtn.click();
  await new Promise(r => setTimeout(r, 25));
  const replayText = h.doc.getElementById('hl-replay-list').textContent;
  check(replayText.includes('NPC 主播') && replayText.includes('阿茶') && replayText.includes('观众 我'), 'NPC 直播回放清晰区分 NPC 主播与观众发言角色');
  h.doc.getElementById('hl-replay-back').click();

  // 17.7 双人连线与 Char 选中隔离：选择 NPC 不会污染「双人连线」默认 Char
  await app.switchView('home');
  check(app.getState().selectedHostId === '201' && app.getState().selectedCharId !== '201', '选择 NPC 主播仅更新 selectedHostId，不会把 NPC 混入 selectedCharId');
  h.doc.getElementById('hl-private-start2').click();
  check(
    app.getState().openModal === 'planner' &&
    app.getState().plannerPendingMode === 'private' &&
    app.getState().plannerHostObj &&
    app.getState().plannerHostObj.roleType !== 'npc',
    '点击「双人连线」始终只选择真实 Char，严格拒绝 NPC 混入私人连线'
  );
  h.doc.getElementById('hl-planner').querySelector('[data-close-modal]').click();

  // 17.8 跨主播异步防串台校验：NPC 房发出的延迟 AI 回复，切换为 Char 主播房间后自动丢弃
  let resolveDelayedNpc;
  const delayedNpcPromise = new Promise(r => { resolveDelayedNpc = r; });
  h.clearAiQueue();
  h.pushAiHandler(async () => JSON.stringify({ speech: '阿茶开播啦', audience: '' }));
  await app.startLiveRoom({ hostMode: 'npc', charObj: { id: '201', roleType: 'npc', name: '阿茶' }, title: '防串台NPC房', program: 'chat' });
  await new Promise(r => setTimeout(r, 15));
  h.pushAiHandler(async () => await delayedNpcPromise);
  h.doc.getElementById('hl-message-input').value = '等下回复我';
  h.doc.getElementById('hl-send').click();
  await new Promise(r => setTimeout(r, 10));

  // 不等阿茶 AI 回复落地，立刻切房为 Char 101 开播
  h.pushAiHandler(async () => JSON.stringify({ speech: '这里是星野的直播间', audience: '' }));
  await app.startLiveRoom({ hostMode: 'char', charObj: chars[0], title: '星野防串台房', program: 'chat' });
  await new Promise(r => setTimeout(r, 20));
  resolveDelayedNpc(JSON.stringify({ speech: '这是延迟落地的NPC串台句', audience: 'NPC延迟弹幕' }));
  await new Promise(r => setTimeout(r, 30));

  const charRoomMsgs = app.getState().room.messages.map(m => m.text).join('\n');
  check(!charRoomMsgs.includes('这是延迟落地的NPC串台句') && app.getState().room.hostId === '101', '跨主播切房后延迟返回的 NPC AI 回复被 session/hostId 防串台守卫彻底拦截');
  h.doc.getElementById('hl-exit-room').click();
  await new Promise(r => setTimeout(r, 25));

  // 17.9 旧版 V1.0 / V1.1 / V1.1.1 历史手账向下兼容（缺少 hostType/hostId/hostName）
  const legacyKey = store.KEYS.JOURNALS;
  const legacyRow = h.configMap.get(legacyKey);
  const legacyRaw = Array.isArray(legacyRow && legacyRow.value) ? legacyRow.value.slice() : [];
  legacyRaw.unshift({
    id: 'hl_legacy_v10',
    sessionId: 'hl_legacy_sess_1',
    charId: '',
    charName: '用户主播',
    hostMode: 'user',
    title: 'V1.0 早期用户独自直播',
    program: 'chat',
    programLabel: '闲聊',
    summary: '早期记录兼容测试',
    createdAt: Date.now() - 86400000
  });
  legacyRaw.unshift({
    id: 'hl_legacy_v10_char',
    sessionId: 'hl_legacy_sess_2',
    charId: '101',
    charName: '星野',
    hostMode: 'char',
    title: 'V1.0 早期 Char 直播',
    program: 'radio',
    programLabel: '电台',
    summary: '早期 Char 兼容测试',
    createdAt: Date.now() - 86500000
  });
  h.configMap.set(legacyKey, { key: legacyKey, value: legacyRaw });
  const compatJournals = await store.loadJournals();
  const compatUser = compatJournals.find(j => j.id === 'hl_legacy_v10');
  const compatChar = compatJournals.find(j => j.id === 'hl_legacy_v10_char');
  check(
    Boolean(compatUser && compatUser.hostType === 'user' && compatUser.hostName === '我') &&
    Boolean(compatChar && compatChar.hostType === 'char' && compatChar.hostId === '101' && compatChar.hostName === '星野'),
    '历史 V1.0/V1.1/V1.1.1 旧版手账缺少 hostType 时自动向下兼容补全，不报错不丢档'
  );
  await app.switchView('diary');
  await new Promise(r => setTimeout(r, 20));
  const compatDiaryHtml = h.doc.getElementById('hl-diary-list').textContent;
  check(compatDiaryHtml.includes('V1.0 早期用户独自直播') && compatDiaryHtml.includes('V1.0 早期 Char 直播'), '兼容补全后的历史旧版手账在手账列表正常渲染');

  // 17.10 移动端窄屏 CSS 响应式与防溢出规则核验
  const updatedCss = fs.readFileSync('css/heartbeat-live.css', 'utf8');
  check(
    updatedCss.includes('.hl-role-card') &&
    updatedCss.includes('.hl-empty-roles') &&
    updatedCss.includes('overflow-wrap: anywhere') &&
    updatedCss.includes('@media (max-width: 365px)') &&
    updatedCss.includes('@media (max-width: 335px)'),
    'CSS 已补齐选择面板卡片、角色徽章与 320px/360px 移动端窄屏防换行溢出规则'
  );

  app.close(false);

  // 18. Minimax + Fish Audio 全平台双语音服务、微信/直播隔离与 NPC 音色能力验收
  console.log('\n18. Minimax + Fish Audio 全平台双语音服务、微信/直播隔离与 NPC 音色验收');

  // 18.1 静态接入与全局/微信/数据备份边界核验
  const settingsJs = fs.readFileSync('js/settings.js', 'utf8');
  const wechatJs = fs.readFileSync('js/wechat.js', 'utf8');
  const ttsProviderJs = fs.readFileSync('js/tts-provider.js', 'utf8');

  check(indexHtml.includes('js/tts-provider.js'), 'index.html 已按序引入 js/tts-provider.js');
  check(
    settingsJs.includes('fishAudioAuthMode') &&
    settingsJs.includes('fishAudioProxyUrl') &&
    settingsJs.includes('fishAudioProxyToken') &&
    settingsJs.includes('saveFishAudioPersonalKey') &&
    settingsJs.includes('fishAudioModel') &&
    settingsJs.includes('fishAudioFormat') &&
    settingsJs.includes('defaultTtsProvider') &&
    settingsJs.includes('minimaxApiKey') &&
    settingsJs.includes('#row-fish-audio-config') &&
    settingsJs.includes('#row-default-tts-provider'),
    'settings.js 保留全部 Minimax 配置键并升级 Fish Audio 安全代理与全局默认语音服务配置入口'
  );
  check(
    wechatJs.includes('chatTtsProvider_') &&
    wechatJs.includes('chatVoiceId_') &&
    wechatJs.includes('chatFishVoiceId_') &&
    wechatJs.includes('resolveWechatChatTtsTarget') &&
    wechatJs.includes('callWechatTTS') &&
    wechatJs.includes('showVoiceErrorActionModal') &&
    wechatJs.includes('call-tts-error-bar'),
    'wechat.js 支持按 chatId 独立保存双服务音色、失败保留文字重试/切换弹窗与通话纠错栏'
  );
  check(
    ttsProviderJs.includes('/api/tts/fish') &&
    ttsProviderJs.includes('s2.1-pro') &&
    ttsProviderJs.includes('reference_id') &&
    ttsProviderJs.includes('redactSecrets') &&
    dataJs.includes("'fishAudioVaultKey'") &&
    dataJs.includes("'fishAudioSessionToken'") &&
    dataJs.includes("'fishAudioApiKey'"),
    'tts-provider.js 默认走同源/HTTPS Fish Audio 代理且 data.js 备份严格排除敏感密钥凭据'
  );

  // 18.2 WanWanTTS 底层引擎（Minimax hex 解码 + Fish Audio 二进制流 + CORS/HTTP 错误处理）
  const h2 = createHarness();
  const ctx2 = loadScripts(h2);
  const store2 = ctx2.HeartbeatLiveStorage;
  const ai2 = ctx2.HeartbeatLiveAI;
  const app2 = ctx2.HeartbeatLiveApp;
  const tts2 = ctx2.WanWanTTS;
  const FakeBlob2 = h2.win.Blob;

  await h2.win.db.config.put({ key: 'minimaxVersion', value: 'domestic' });
  await h2.win.db.config.put({ key: 'minimaxGroupId', value: 'grp_test' });
  await h2.win.db.config.put({ key: 'minimaxApiKey', value: 'mm_secret_test' });
  await h2.win.db.config.put({ key: 'minimaxModel', value: 'speech-2.8-hd' });
  await h2.win.db.config.put({ key: 'fishAudioAuthMode', value: 'byok_session' });
  await tts2.saveFishAudioPersonalKey('fish_secret_test');

  check((await tts2.getGlobalDefaultProvider()) === 'minimax', '默认全局语音服务安全回退为 minimax');

  const fetchCalls = [];
  let fishFailMode = '';
  h2.setFetchHandler(async (url, opts) => {
    fetchCalls.push({ url, opts });
    if (String(url).includes('minimax')) {
      return {
        ok: true,
        status: 200,
        async json() { return { base_resp: { status_code: 0 }, data: { audio: '494433' } }; }
      };
    }
    if (String(url).includes('/api/tts/fish/session')) {
      return {
        ok: true,
        status: 200,
        async json() { return { ok: true, sessionToken: 'opaque_sid_test', expiresInSec: 3600 }; }
      };
    }
    if (String(url).includes('/api/tts/fish')) {
      if (fishFailMode === 'http500') {
        return {
          ok: false,
          status: 500,
          async text() { return JSON.stringify({ error: 'upstream_server_5xx', message: 'upstream error' }); }
        };
      }
      if (fishFailMode === 'http401') {
        return {
          ok: false,
          status: 401,
          async text() { return JSON.stringify({ error: 'upstream_auth_401', message: 'Invalid Token Bearer fish_secret_test' }); }
        };
      }
      if (fishFailMode === 'http429') {
        return {
          ok: false,
          status: 429,
          async text() { return JSON.stringify({ error: 'upstream_rate_limit_429', message: 'Too Many Requests' }); }
        };
      }
      if (fishFailMode === 'network') {
        throw new TypeError('Failed to fetch');
      }
      if (fishFailMode === 'html200') {
        return {
          ok: true,
          status: 200,
          headers: { get() { return 'text/html; charset=utf-8'; } },
          async blob() { return new FakeBlob2(['<html></html>'], { type: 'text/html', _forceSize: 13 }); }
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get() { return 'audio/mpeg'; } },
        async blob() { return new FakeBlob2(['ID3_FISH_MOCK'], { type: 'audio/mpeg', _forceSize: 1024 }); }
      };
    }
    return { ok: false, status: 404, async json() { return {}; } };
  });

  const mmRes = await tts2.synthesize({ provider: 'minimax', text: '测试 Minimax', voiceId: 'mm_global_v1' });
  const fishRes = await tts2.synthesize({ provider: 'fish_audio', text: '测试 Fish Audio', referenceId: 'fish_ref_v1' });
  const fishReq = fetchCalls.find(c => String(c.url) === '/api/tts/fish');
  const fishReqBody = fishReq && fishReq.opts && fishReq.opts.body ? JSON.parse(fishReq.opts.body) : {};
  check(
    Boolean(mmRes.blobUrl && mmRes.provider === 'minimax') &&
    Boolean(fishRes.blobUrl && fishRes.provider === 'fish_audio') &&
    fishReq &&
    !fishReq.opts.headers.Authorization &&
    fishReq.opts.headers['X-Fish-Session'] === 'opaque_sid_test' &&
    fishReqBody.model === 's2.1-pro' &&
    fishReqBody.reference_id === 'fish_ref_v1' &&
    fishReqBody.normalize === true,
    'WanWanTTS 正确分发 Minimax 与 Fish Audio 同源代理（无浏览器明文 Authorization 头，改用不透明会话令牌）'
  );

  // 同源代理网络失败不再误判为 CORS；自定义跨域代理失败与 401/429/解码异常各自精准分类且密钥脱敏
  fishFailMode = 'network';
  let sameOriginErr = null;
  try { await tts2.callFishAudioTTS('本地代理异常', 'fish_ref_v1'); } catch (e) { sameOriginErr = e; }
  check(Boolean(sameOriginErr && sameOriginErr.code === 'network_error' && !sameOriginErr.message.includes('CORS')), '同源代理不可达时准确分类为 network_error，不误判为 CORS');

  let crossCorsErr = null;
  try { await tts2.callFishAudioTTS('跨域代理异常', 'fish_ref_v1', { proxyUrl: 'https://proxy.example.com/api/tts/fish' }); } catch (e) { crossCorsErr = e; }
  check(Boolean(crossCorsErr && crossCorsErr.code === 'cors_blocked'), '跨域自定义代理失败时准确识别 cors_blocked');

  fishFailMode = 'http401';
  let err401 = null;
  try { await tts2.callFishAudioTTS('鉴权失败', 'fish_ref_v1'); } catch (e) { err401 = e; }
  check(Boolean(err401 && err401.code === 'auth_401' && !err401.message.includes('fish_secret_test')), 'HTTP 401 准确识别为 auth_401 且彻底脱敏原始密钥');

  fishFailMode = 'http429';
  let err429 = null;
  try { await tts2.callFishAudioTTS('限流', 'fish_ref_v1'); } catch (e) { err429 = e; }
  check(Boolean(err429 && err429.code === 'rate_limit_429'), 'HTTP 429 准确识别为 rate_limit_429');

  fishFailMode = 'html200';
  let errDecode = null;
  try { await tts2.callFishAudioTTS('非音频响应', 'fish_ref_v1'); } catch (e) { errDecode = e; }
  check(Boolean(errDecode && errDecode.code === 'audio_decode_error'), '代理误返回 HTML/JSON 时拦截为 audio_decode_error');

  const directFishRejected = tts2.resolveFishProxyEndpoint('https://api.fish.audio/v1/tts');
  const insecureHttpRejected = tts2.resolveFishProxyEndpoint('http://external-proxy.example.com/api/tts/fish');
  check(!directFishRejected.ok && !insecureHttpRejected.ok && insecureHttpRejected.code === 'proxy_insecure_url', '拒绝直连 api.fish.audio 与非 HTTPS 外部代理地址');

  fishFailMode = '';

  // 18.3 微信端独立双音色逻辑实测（切换服务绝不互相覆盖，双语服务按 chatId 隔离解析）
  const wechatLines = wechatJs.split('\n');
  const wcSlice = wechatLines.slice(18988, 19065).join('\n') +
    '\nwindow.__wcTest = { resolveWechatChatTtsTarget, callWechatTTS };';
  const vm = require('vm');
  vm.runInContext(wcSlice, ctx2, { filename: 'wechat-tts-slice.js' });

  await h2.win.db.config.put({ key: 'chatVoiceId_501', value: 'wx_mm_char101' });
  await h2.win.db.config.put({ key: 'chatFishVoiceId_501', value: 'wx_fish_char101' });
  await h2.win.db.config.put({ key: 'chatTtsProvider_501', value: 'fish_audio' });

  const wcTargetFish = await ctx2.__wcTest.resolveWechatChatTtsTarget(501);
  const wcCallFish = await ctx2.__wcTest.callWechatTTS(501, '微信 Fish 测试');
  await h2.win.db.config.put({ key: 'chatTtsProvider_501', value: 'minimax' });
  const wcTargetMm = await ctx2.__wcTest.resolveWechatChatTtsTarget(501);
  check(
    wcTargetFish.provider === 'fish_audio' &&
    wcTargetFish.voiceId === 'wx_fish_char101' &&
    wcTargetFish.minimaxVoiceId === 'wx_mm_char101' &&
    wcCallFish && Boolean(wcCallFish.blobUrl) &&
    wcTargetMm.provider === 'minimax' &&
    wcTargetMm.voiceId === 'wx_mm_char101' &&
    wcTargetMm.fishReferenceId === 'wx_fish_char101',
    '微信端按 chatId 独立存储与解析双服务，切换服务绝不覆盖另一家音色 ID'
  );

  // 18.4 微信与心动直播严格隔离 + 旧版字符串格式无损迁移 + Char/NPC 同 ID 键名不冲突
  const liveIsoStatus = await ai2.getLiveTtsStatus({ id: '101', roleType: 'char' });
  check(
    !liveIsoStatus.voiceId &&
    liveIsoStatus.missingReason.includes('不自动复用微信音色'),
    '严格隔离：即使微信单聊已绑定音色，心动直播 Char 未单独配置时绝不读取微信 Voice ID'
  );

  await h2.win.db.config.put({
    key: store2.KEYS.CHAR_VOICES,
    value: { '101': 'legacy_mm_live_101' }
  });
  const migrated101 = await store2.getRoleVoiceConfig('101', 'char');
  check(
    migrated101.provider === 'minimax' &&
    migrated101.minimaxVoiceId === 'legacy_mm_live_101' &&
    migrated101.fishReferenceId === '',
    '旧版 heartbeat_live_char_voices_v1 字符串配置无损兼容升级为对象结构'
  );

  await store2.saveRoleVoiceConfig('101', 'npc', {
    provider: 'fish_audio',
    minimaxVoiceId: 'mm_npc_collide',
    fishReferenceId: 'fish_npc_collide'
  });
  const afterChar101 = await store2.getRoleVoiceConfig('101', 'char');
  const afterNpc101 = await store2.getRoleVoiceConfig('101', 'npc');
  check(
    afterChar101.minimaxVoiceId === 'legacy_mm_live_101' &&
    afterNpc101.provider === 'fish_audio' &&
    afterNpc101.fishReferenceId === 'fish_npc_collide',
    'Char 与 NPC 音色键严格分池（char_ / npc_），即使数字 ID 相同也互不覆盖'
  );

  // 18.5 直播设置 UI（Char + NPC 双音色编辑与独立试听）
  await app2.open();
  await app2.switchView('settings');
  await new Promise(r => setTimeout(r, 25));

  const roleSelect = h2.doc.getElementById('hl-char-img-select');
  roleSelect.value = '201';
  if (typeof roleSelect.onchange === 'function') roleSelect.onchange();
  await new Promise(r => setTimeout(r, 20));

  h2.doc.getElementById('hl-role-tts-provider').value = 'fish_audio';
  h2.doc.getElementById('hl-char-voice-id').value = 'mm_npc_201';
  h2.doc.getElementById('hl-role-fish-voice-id').value = 'fish_npc_201';
  await h2.doc.getElementById('hl-char-voice-save').click();
  await new Promise(r => setTimeout(r, 25));

  const savedNpc201Voice = await store2.getRoleVoiceConfig('201', 'npc');
  const statusAfterSave = h2.doc.getElementById('hl-char-voice-status').textContent;
  check(
    savedNpc201Voice.provider === 'fish_audio' &&
    savedNpc201Voice.minimaxVoiceId === 'mm_npc_201' &&
    savedNpc201Voice.fishReferenceId === 'fish_npc_201' &&
    statusAfterSave.includes('NPC') && statusAfterSave.includes('Fish Audio') && statusAfterSave.includes('就绪'),
    '直播设置页支持为 NPC 独立保存 Minimax 与 Fish Audio 双套音色且状态实时就绪'
  );

  fetchCalls.length = 0;
  h2.audioInstances.length = 0;
  h2.revokedUrls.length = 0;
  await h2.doc.getElementById('hl-role-voice-preview').click();
  await new Promise(r => setTimeout(r, 25));
  const previewCalledFish = fetchCalls.some(c => {
    if (String(c.url) !== '/api/tts/fish') return false;
    try { return JSON.parse(c.opts.body).reference_id === 'fish_npc_201'; } catch (_) { return false; }
  });
  check(
    previewCalledFish &&
    h2.audioInstances.length >= 1 &&
    h2.doc.getElementById('hl-role-voice-preview').textContent.includes('停止试听'),
    '点击设置页「独立试听」通过正式代理调用所选角色独立音色合成并播放'
  );
  // 再次点击停止试听并验证释放 Blob URL
  h2.doc.getElementById('hl-role-voice-preview').click();
  check(
    h2.doc.getElementById('hl-role-voice-preview').textContent.includes('独立试听') &&
    h2.revokedUrls.length >= 1,
    '再次点击停止试听后立即停播并释放试听 Blob URL'
  );

  // 18.6 NPC 开播语音合成（AI 队列 + ASMR 闪避 + 临时切换 + 打断暂停/恢复 + 错误降级文字）
  await store2.addAsmrTrack({ name: 'rain_duck.mp3', type: 'audio/mpeg', size: 102400 });
  h2.doc.getElementById('hl-back-settings').click();
  fetchCalls.length = 0;
  h2.audioInstances.length = 0;
  h2.clearAiQueue();
  h2.pushAiHandler(async () => JSON.stringify({ speech: '我是阿茶，欢迎来到夜间咖啡馆！', audience: '' }));

  await app2.startLiveRoom({
    hostMode: 'npc',
    charObj: { id: '201', roleType: 'npc', name: '阿茶' },
    program: 'asmr',
    title: '阿茶夜半耳语'
  });
  await new Promise(r => setTimeout(r, 40));

  const npcSpokeWithFish = fetchCalls.some(c => {
    if (String(c.url) !== '/api/tts/fish') return false;
    try { return JSON.parse(c.opts.body).reference_id === 'fish_npc_201'; } catch (_) { return false; }
  });
  const activeTtsAudio = h2.audioInstances[h2.audioInstances.length - 1];
  const pauseBtn = h2.doc.getElementById('hl-tts-playback-btn');
  check(
    npcSpokeWithFish &&
    Boolean(activeTtsAudio && !activeTtsAudio.paused) &&
    app2.getState().asmrDucking === true &&
    Boolean(pauseBtn && !pauseBtn.hidden),
    'NPC 开播后直接通过正式代理调用独立 Fish Audio 音色发声，并联动开启 ASMR 闪避与暂停控制'
  );

  // 用户打断发送弹幕 -> 暂停当前 TTS 语音并释放闪避，随后可一键恢复播放
  h2.pushAiHandler(async () => JSON.stringify({ speech: '收到，换 Minimax 音色和你聊！', audience: '' }));
  h2.doc.getElementById('hl-message-input').value = '打断一下先听我说';
  h2.doc.getElementById('hl-send').click();
  check(
    Boolean(activeTtsAudio && activeTtsAudio.paused) &&
    app2.getState().ttsPaused === true &&
    app2.getState().asmrDucking === false &&
    pauseBtn.textContent.includes('恢复语音'),
    '用户发言打断时平滑暂停 AI 语音并恢复背景音量，同时显示「▶ 恢复语音」按钮'
  );
  // 点击恢复播放当前被打断的语音
  pauseBtn.click();
  check(
    Boolean(activeTtsAudio && !activeTtsAudio.paused) &&
    app2.getState().ttsPaused === false &&
    app2.getState().asmrDucking === true &&
    pauseBtn.textContent.includes('暂停语音'),
    '点击「▶ 恢复语音」可无缝继续刚才被打断的 TTS 音频并重开环境音闪避'
  );

  // 本场临时切换为 Minimax，下一句 AI 回复使用 mm_npc_201
  fetchCalls.length = 0;
  await app2.setRoomTtsProviderOverride('minimax');
  await new Promise(r => setTimeout(r, 40));
  check(
    app2.getState().room.ttsProviderOverride === 'minimax' &&
    fetchCalls.some(c => String(c.url).includes('minimax') && JSON.parse(c.opts.body).voice_setting.voice_id === 'mm_npc_201'),
    '直播间内临时切换为 Minimax 后立即生效且不改动全局与设置页存储'
  );

  // 临时切回 Fish Audio 并模拟 Fish Audio 500 错误：安全降级保留文字且不报错中断
  await app2.setRoomTtsProviderOverride('fish_audio');
  fishFailMode = 'http500';
  h2.pushAiHandler(async () => JSON.stringify({ speech: '音频暂时故障但文字依然稳稳送达', audience: '' }));
  h2.doc.getElementById('hl-message-input').value = '测试语音失败文字降级';
  h2.doc.getElementById('hl-send').click();
  await new Promise(r => setTimeout(r, 40));
  fishFailMode = '';
  const hasFallbackMsg = app2.getState().room.messages.some(m => m.text.includes('音频暂时故障但文字依然稳稳送达'));
  check(hasFallbackMsg, 'TTS 合成失败时安全降级为文字字幕展示，不中断直播流');

  // 退出直播并重开新房间：验证临时语音覆盖已清空，默认回到角色独立设置
  h2.setConfirm(true);
  await h2.doc.getElementById('hl-exit-room').click();
  await new Promise(r => setTimeout(r, 25));
  h2.pushAiHandler(async () => JSON.stringify({ speech: '新场次开播', audience: '' }));
  await app2.startLiveRoom({ hostMode: 'npc', charObj: { id: '201', roleType: 'npc', name: '阿茶' }, program: 'chat', title: '重开检查' });
  await new Promise(r => setTimeout(r, 25));
  check(app2.getState().room.ttsProviderOverride === '', '关闭直播间后本场临时语音服务切换自动重置，不影响新场次');

  app2.close(false);

  console.log('\n=== 测试结果：通过 ' + passed + ' 项，失败 ' + failed + ' 项 ===');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
