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
        if (typeof this.onclick === 'function') this.onclick({ target: this, preventDefault() {} });
        this.dispatchEvent({ type: 'click', target: this, preventDefault() {} });
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
      this.src = src || '';
      this.volume = 1;
      this.loop = false;
      this.duration = 42;
      this.paused = true;
      this._events = {};
      audioInstances.push(this);
    }
    addEventListener(t, fn) { if (!this._events[t]) this._events[t] = []; this._events[t].push(fn); }
    play() {
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

  const win = {
    document: doc,
    Blob: FakeBlob,
    Audio: FakeAudio,
    URL: MockURL,
    localStorage: {
      getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null; },
      setItem(k, v) { storageMap.set(k, String(v)); },
      removeItem(k) { storageMap.delete(k); }
    },
    history: {
      pushState(s) { historyStack.push(s); },
      back() { historyStack.pop(); }
    },
    navigator: {
      mediaDevices: {
        async getUserMedia(constraints) {
          return createFakeStream(constraints.video ? 'video' : 'audio');
        }
      }
    },
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
      return charId === 101 ? '星野喜欢深夜看星空电台。' : '小屿住在海边小镇。';
    },
    WanWanMemory: {
      async getMemoryContext() { return '过去记忆：一起去过月光海岸。'; }
    },
    WanxiangMirrorBridge: {
      async buildChatExperienceContext() { return { text: '- [今天｜午后咖啡馆] 一起喝过拿铁。' }; }
    },
    async callAI(msgs, opts) {
      if (aiQueue.length) return await aiQueue.shift()(msgs, opts);
      return JSON.stringify({ speech: '默认真实AI回应', audience: '氛围不错呀' });
    }
  };

  charsMap.set(101, { id: 101, type: 'char', name: '星野', role: '电台主播', description: '温柔细腻', avatar: 'https://example.com/a1.png' });
  charsMap.set(102, { id: 102, type: 'char', name: '小屿', role: '海边画家', description: '安静直率', avatar: 'https://example.com/a2.png' });
  chatsMap.set(1, { id: 501, ownerUid: 1, charId: 101 });

  return {
    win, doc, appRoot, storageMap, configMap, memoriesMap, ecoLogs, revokedUrls, audioInstances, fakeTrackList,
    setConfirm(v) { confirmResult = v; },
    setEcoCoins(v) { ecoCoins = v; },
    getEcoCoins() { return ecoCoins; },
    pushAiHandler(fn) { aiQueue.push(fn); }
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
    localStorage: h.win.localStorage,
    history: h.win.history,
    navigator: h.win.navigator,
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
    Error
  }));

  for (const rel of ['js/heartbeat-live-storage.js', 'js/heartbeat-live-ai.js', 'js/heartbeat-live.js']) {
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

  let oversizeCaught = false;
  try { await store.addAsmrTrack({ name: 'huge.mp3', type: 'audio/mpeg', size: 26 * 1024 * 1024 }); } catch (_) { oversizeCaught = true; }
  check(oversizeCaught, '拒绝超过 25MB 的单个音频文件');

  // 备份排除校验
  check(h.configMap.has(store.KEYS.AUDIO_BLOB_PREFIX + addedTrack.id), '音频 Blob 存入主库受控前缀');
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

  // 7. 顶栏点击「心动直播」返回桌面且右上角无设置按钮
  check(!h.doc.getElementById('hl-settings-top'), '直播大厅右上角已移除设置按钮');
  const titleBackBtn = h.doc.getElementById('hl-back-desktop');
  check(Boolean(titleBackBtn) && titleBackBtn.textContent.includes('心动直播'), '大厅「心动直播」标题直接作为返回桌面入口');
  titleBackBtn.click();
  check(!h.doc.getElementById('heartbeat-live-page'), '点击「心动直播」标题已返回手机桌面');
  check(h.fakeTrackList.every(t => t.stopped === true), '退出心动直播时立即停止全部麦克风与摄像头轨道');
  check(h.revokedUrls.length > 0, '退出时回收所有临时 Blob URL');

  console.log('\n=== 测试结果：通过 ' + passed + ' 项，失败 ' + failed + ' 项 ===');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
