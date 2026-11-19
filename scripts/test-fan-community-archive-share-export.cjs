#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    key(i) { return Array.from(map.keys())[i] || null; },
    get length() { return map.size; },
    _dump() { return Object.fromEntries(map.entries()); }
  };
}

function createMockDb() {
  let nextChatId = 100;
  let nextMsgId = 1000;
  const characters = [
    { id: 1, type: 'user', name: '林晚', nick: '晚晚', avatar: '' },
    { id: 2, type: 'char', name: '陆沉', nick: '陆沉', avatar: 'data:image/png;base64,char2' },
    { id: 3, type: 'char', name: '江屿', nick: '江屿', avatar: 'data:image/png;base64,char3' }
  ];
  const chats = [
    { id: 101, ownerUid: 1, charId: 2, updatedAt: 1000, lastMessage: '早安', unread: 0 }
  ];
  const messages = [];

  function makeWhere(list, field) {
    return {
      equals(val) {
        const match = () => {
          if (field === '[ownerUid+charId]') {
            return list.filter(x => x.ownerUid === val[0] && x.charId === val[1]);
          }
          return list.filter(x => x[field] === val);
        };
        return {
          first: async () => match()[0] || undefined,
          toArray: async () => match()
        };
      },
      notEqual(val) {
        return {
          toArray: async () => list.filter(x => x[field] !== val)
        };
      }
    };
  }

  return {
    _state: { characters, chats, messages },
    characters: {
      get: async id => characters.find(c => c.id === id),
      where: f => makeWhere(characters, f)
    },
    chats: {
      get: async id => chats.find(c => c.id === id),
      where: f => makeWhere(chats, f),
      add: async row => {
        const id = ++nextChatId;
        chats.push(Object.assign({ id }, row));
        return id;
      },
      update: async (id, patch) => {
        const found = chats.find(c => c.id === id);
        if (found) Object.assign(found, patch);
        return 1;
      }
    },
    messages: {
      get: async id => messages.find(m => m.id === id),
      add: async row => {
        const id = ++nextMsgId;
        messages.push(Object.assign({ id }, row));
        return id;
      }
    }
  };
}

function loadSandbox(mockDb, mockAssets) {
  const localStorage = createMemoryStorage();
  localStorage.setItem('wanwan_wechat_uid', '1');

  const sandbox = {
    window: null,
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Array,
    Object,
    Boolean,
    RegExp,
    Promise,
    Set,
    Map,
    Intl,
    localStorage,
    db: mockDb,
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    Blob: class MockBlob { constructor(parts, opts) { this.parts = parts; this.opts = opts; } },
    setTimeout,
    clearTimeout,
    document: {
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, click() {} }),
      body: { appendChild() {}, removeChild() {} }
    },
    FanCommunityAssets: mockAssets || {
      getCachedSrc: id => (mockAssets && mockAssets._map[id] ? mockAssets._map[id].src : ''),
      getAsset: async id => (mockAssets && mockAssets._map[id] ? mockAssets._map[id] : null)
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('js/fan-community-works.js'), sandbox, { filename: 'js/fan-community-works.js' });
  vm.runInContext(read('js/fan-community-export.js'), sandbox, { filename: 'js/fan-community-export.js' });
  return sandbox;
}

(async function main() {
  let passed = 0;
  function ok(label) {
    passed += 1;
    console.log('  PASS:', label);
  }

  console.log('=== Fan Community Works Delete / Archive / WeChat Forward / Export Tests ===');

  const assetStore = {
    _map: {
      av_user_1: { id: 'av_user_1', kind: 'avatar', name: '用户头像', src: 'data:image/png;base64,USER_AVATAR' },
      av_char_1: { id: 'av_char_1', kind: 'avatar', name: '角色头像', src: 'data:image/png;base64,CHAR_AVATAR' },
      bg_img_1: { id: 'bg_img_1', kind: 'bg', name: '夜空背景', src: 'data:image/png;base64,BG_IMAGE' },
      stk_cat: { id: 'stk_cat', kind: 'sticker', name: '偷笑小猫', description: '一只眯眼坏笑的小白猫', src: 'data:image/png;base64,STICKER_CAT' }
    },
    getCachedSrc(id) { return this._map[id] ? this._map[id].src : ''; },
    async getAsset(id) { return this._map[id] || null; }
  };

  const mockDb = createMockDb();
  const sb = loadSandbox(mockDb, assetStore);
  const Works = sb.FanCommunityWorks;
  const Export = sb.FanCommunityExport;

  // 1. Create works, complete & archive, verify snapshot persistence and asset protection on delete
  const w1 = Works.createWork('训练场风波');
  assert.strictEqual(w1.ok, true);
  const w2 = Works.createWork('草稿二号');
  assert.strictEqual(w2.ok, true);

  const w1Data = Works.getWorkData(w1.work.id);
  w1Data.user = '阿满';
  w1Data.char = '沈砚';
  w1Data.userAvatarAssetId = 'av_user_1';
  w1Data.charAvatarAssetId = 'av_char_1';
  w1Data.appearance = Object.assign({}, w1Data.appearance, {
    bgType: 'image',
    bgColor: '#9bb0c1',
    bgImageAssetId: 'bg_img_1',
    bgImageFit: 'cover',
    userBubbleColor: '#fff133',
    charBubbleColor: '#ffffff'
  });
  w1Data.timeSettings.showBubbleTime = true;
  w1Data.items = [
    { id: 'm1', type: 'date', text: '10月12日 21:00' },
    { id: 'm2', side: 'left', type: 'text', text: '你什么时候把我的精神体还回来', sentTime: '21:01' },
    { id: 'm3', side: 'right', type: 'text', text: '骗子一个，我都没见过', fakeRecall: true, sentTime: '21:02' },
    { id: 'm4', side: 'left', type: 'text_voice', duration: 9, text: '别装傻，训练场花坛边就是你抱走的', sentTime: '21:03' },
    { id: 'm5', side: 'right', type: 'image', imageMode: 'text_card', text: '一张毛绒绒白狐狸正趴在枕头上打盹的照片', sentTime: '21:04' },
    { id: 'm6', side: 'left', type: 'location', name: '第三训练场东门', address: '星港大道 88 号花坛旁', sentTime: '21:05' },
    { id: 'm7', side: 'right', type: 'image', isSticker: true, assetId: 'stk_cat', alt: '偷笑小猫', sentTime: '21:06' }
  ];
  Works.saveWorkData(w1.work.id, w1Data);

  const compRes = Works.completeAndArchiveWork(w1.work.id);
  assert.strictEqual(compRes.ok, true);
  assert.strictEqual(compRes.work.isCompleted, true);
  assert.ok(compRes.archive.archiveId);
  assert.strictEqual(Works.listArchives().archives.length, 1);

  const loadedArch = Works.getArchiveData(compRes.archive.archiveId);
  assert.strictEqual(loadedArch.title, '训练场风波');
  assert.strictEqual(loadedArch.items.length, 7);
  assert.strictEqual(loadedArch.items[2].fakeRecall, true);
  assert.strictEqual(loadedArch.timeSettings.showBubbleTime, true);
  ok('Work completion archives full snapshot with appearance, timestamps, and message order');

  // Updating an already-completed work updates existing archive rather than duplicating
  const compRes2 = Works.completeAndArchiveWork(w1.work.id);
  assert.strictEqual(compRes2.ok, true);
  assert.strictEqual(compRes2.updatedExisting, true);
  assert.strictEqual(Works.listArchives().archives.length, 1);
  ok('Re-completing updates existing archive snapshot without duplicates');

  // Deleting original draft work MUST protect assets still referenced by archive!
  const delW1 = Works.deleteWork(w1.work.id);
  assert.strictEqual(delW1.ok, true);
  assert.strictEqual(Works.getWorkData(w1.work.id), null);
  assert.strictEqual(Works.listWorks().works.length, 1);
  assert.strictEqual(delW1.orphanedAssetIds.length, 0, 'Assets used by archive must be protected');
  assert.ok(Works.getArchiveData(compRes.archive.archiveId), 'Archive snapshot remains intact after deleting draft');
  ok('Deleting draft work removes it cleanly while protecting archive snapshot and shared assets');

  // 2. WeChat Char listing & multi-select forwarding
  const contacts = await Export.listWechatCharContacts();
  assert.strictEqual(contacts.length, 2, 'Should list only non-user WeChat Chars');

  const fwdRes = await Export.forwardWorkToWechatChars(loadedArch, [2, 3]);
  assert.strictEqual(fwdRes.ok, true);
  assert.strictEqual(fwdRes.count, 2);
  assert.strictEqual(mockDb._state.messages.length, 2);
  assert.ok(mockDb._state.messages[0].content.startsWith('__FCWORK__'));
  assert.ok(mockDb._state.chats.find(c => c.charId === 2).lastMessage.includes('训练场风波'));
  assert.ok(mockDb._state.chats.find(c => c.charId === 3).lastMessage.includes('训练场风波'));
  ok('Multi-select forwarding inserts __FCWORK__ share cards into all selected WeChat Char chats');

  // 3. Verify WeChat parser, card renderer, AI transcript with fiction isolation, and Memory isolation
  const wechatSrc = read('js/wechat.js');
  const memorySrc = read('js/memory.js');

  // Extract pure functions from wechat.js by evaluating in a lightweight sandbox
  const wxSb = {
    window: null,
    console,
    JSON,
    Number,
    String,
    Array,
    Object,
    Boolean,
    RegExp,
    Math,
    Date,
    localStorage: createMemoryStorage(),
    document: { getElementById: () => null, createElement: () => ({}), body: { appendChild() {} } }
  };
  wxSb.window = wxSb;
  vm.createContext(wxSb);
  // Load helper wcEscHtml + parseFcWorkPayload/normalizeFcWorkPayload/buildFcWorkAIText/renderFcWorkCard directly
  const escMatch = wechatSrc.match(/function wcEscHtml\([\s\S]*?\n\}/);
  assert.ok(escMatch, 'wcEscHtml found');
  const fcBlockStart = wechatSrc.indexOf('// ===== 同好社区「捡手机文学」作品分享卡片 =====');
  const fcBlockEnd = wechatSrc.indexOf('// ===== 淘宝代付/赠送 卡片数据 =====');
  assert.ok(fcBlockStart > 0 && fcBlockEnd > fcBlockStart, 'fc-work block found in wechat.js');
  const renderCardStart = wechatSrc.indexOf('function renderFcWorkCard(');
  const renderCardEnd = wechatSrc.indexOf('function renderCallRecordBubble(');
  assert.ok(renderCardStart > 0 && renderCardEnd > renderCardStart, 'renderFcWorkCard found in wechat.js');

  vm.runInContext(
    escMatch[0] + '\n' +
    wechatSrc.slice(fcBlockStart, fcBlockEnd) + '\n' +
    wechatSrc.slice(renderCardStart, renderCardEnd),
    wxSb
  );

  const rawMsgContent = mockDb._state.messages[0].content;
  const parsedPayload = wxSb.parseFcWorkPayload(rawMsgContent.slice(10));
  assert.strictEqual(parsedPayload.title, '训练场风波');
  assert.strictEqual(parsedPayload.userName, '阿满');
  assert.strictEqual(parsedPayload.charName, '沈砚');
  assert.strictEqual(parsedPayload.messages.length, 7);

  const cardHtml = wxSb.renderFcWorkCard(parsedPayload, 'self', { id: 1001 });
  assert.ok(cardHtml.includes('fc-work-share-card'));
  assert.ok(cardHtml.includes('《训练场风波》'));
  assert.ok(cardHtml.includes('阿满 × 沈砚'));
  assert.ok(cardHtml.includes('data-fc-msg-id="1001"'));

  const aiText = wxSb.buildFcWorkAIText(parsedPayload);
  assert.ok(aiText.includes('虚构文学作品'), 'AI text marks shared work as fiction');
  assert.ok(aiText.includes('切勿将作品中的事件误认为你们两人真实发生过的经历'), 'AI text enforces memory/relationship isolation');
  assert.ok(aiText.includes('你什么时候把我的精神体还回来'), 'AI text includes story dialogue');
  assert.ok(aiText.includes('别装傻，训练场花坛边就是你抱走的'), 'AI text includes voice text');
  assert.ok(aiText.includes('白狐狸正趴在枕头上打盹'), 'AI text includes text image card');
  assert.ok(aiText.includes('第三训练场东门'), 'AI text includes location');
  assert.ok(aiText.includes('偷笑小猫：一只眯眼坏笑的小白猫'), 'AI text includes sticker metadata');
  assert.ok(aiText.includes('已假撤回'), 'AI text preserves fake recall info');
  ok('WeChat share card renders properly and feeds full story with strict fiction/memory isolation to AI');

  // Verify memory.js isolates __FCWORK__ from summary prompts
  const memBlockStart = memorySrc.indexOf('function sanitizeMessageForMemorySummary(');
  const memBlockEnd = memorySrc.indexOf('function buildMeetingSummaryPrompt(');
  assert.ok(memBlockStart > 0 && memBlockEnd > memBlockStart, 'memory sanitizer found');
  const memSb = { String, JSON };
  vm.createContext(memSb);
  vm.runInContext(memorySrc.slice(memBlockStart, memBlockEnd), memSb);
  const summaryPrompt = memSb.buildSummaryPrompt([
    { role: 'user', content: rawMsgContent },
    { role: 'assistant', content: '哈哈这篇写得挺有意思，白狐狸那段很可爱。' }
  ]);
  assert.ok(summaryPrompt.includes('虚构文学作品《训练场风波》'), 'Memory summary mentions shared work title only');
  assert.ok(!summaryPrompt.includes('你什么时候把我的精神体还回来'), 'Memory summary excludes story plot lines');
  assert.ok(summaryPrompt.includes('严禁提取为角色与用户的真实主线经历'), 'Memory summary prompt enforces boundary rule');
  ok('WeChat memory summarizer excludes fictional shared work plot from main memory');

  // 4. HTML export verification
  const resolved = await Export.resolveWorkAssets(loadedArch);
  const html = Export.buildExportHtml(loadedArch, resolved.srcMap);
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('训练场风波'));
  assert.ok(html.includes('data:image/png;base64,BG_IMAGE'), 'HTML preserves chat background image');
  assert.ok(html.includes('data:image/png;base64,USER_AVATAR'), 'HTML preserves user avatar');
  assert.ok(html.includes('data:image/png;base64,CHAR_AVATAR'), 'HTML preserves char avatar');
  assert.ok(html.includes('data:image/png;base64,STICKER_CAT'), 'HTML preserves sticker image');
  assert.ok(html.includes('#fff133'), 'HTML preserves user bubble color');
  assert.ok(html.includes('fc-voice-bar'), 'HTML preserves voice bar');
  assert.ok(html.includes('别装傻，训练场花坛边就是你抱走的'), 'HTML preserves voice text');
  assert.ok(html.includes('fc-imgcard'), 'HTML preserves text image card');
  assert.ok(html.includes('fc-location'), 'HTML preserves location card');
  assert.ok(html.includes('fc-recall-badge'), 'HTML preserves fake recall badge');
  assert.ok(html.includes('21:01') && html.includes('21:06'), 'HTML preserves bubble timestamps');
  assert.ok(html.indexOf('你什么时候把我的精神体还回来') < html.indexOf('第三训练场东门'), 'HTML preserves exact message order');
  ok('HTML export preserves background, avatars, bubbles, stickers, voice bars, cards, times, and order');

  // 5. PNG segmentation planner verification
  const shortRows = [{ index: 0, height: 80 }, { index: 1, height: 90 }, { index: 2, height: 110 }];
  const shortSegs = Export.planPngSegments(shortRows, { maxSegmentHeight: 2000 });
  assert.strictEqual(shortSegs.length, 1);
  assert.strictEqual(shortSegs[0].rows.length, 3);

  const longRows = Array.from({ length: 65 }, (_, idx) => ({ index: idx, height: 120 }));
  const longSegs = Export.planPngSegments(longRows, { maxSegmentHeight: 2400 });
  assert.ok(longSegs.length >= 3, 'Long work splits into multiple segments');
  const flattened = [];
  longSegs.forEach(seg => {
    assert.ok(seg.totalHeight <= 2400 || seg.rows.length === 1, 'Each segment respects max height without cutting rows');
    seg.rows.forEach(r => flattened.push(r.index));
  });
  assert.strictEqual(flattened.length, 65, 'No messages lost during segmentation');
  assert.deepStrictEqual(flattened, longRows.map(r => r.index), 'Exact message order preserved across all segments');
  ok('PNG long-image segmentation splits cleanly on message boundaries without losing or reordering rows');

  // 6. UI / wiring contract assertions
  const chatSrc = read('js/fan-community-chat.js');
  const fcSrc = read('js/fan-community.js');
  const indexSrc = read('index.html');

  assert.ok(chatSrc.includes('fc-work-delete-btn') && chatSrc.includes('openDeleteWorkConfirmSheet'), 'Works list has delete button + secondary confirmation');
  assert.ok(chatSrc.includes('id = \'fc-work-complete-btn\'') && chatSrc.includes('完结作品'), 'Phone settings has 「完结作品」 button');
  assert.ok(chatSrc.includes('fc-work-forward-btn') && chatSrc.includes('fc-work-export-html-btn') && chatSrc.includes('fc-work-export-png-btn'), 'Phone settings exposes forward & HTML/PNG export buttons');
  assert.ok(chatSrc.includes('openArchiveReader: openArchiveReader'), 'Archive full chat reader exported');
  assert.ok(fcSrc.includes('fc-archive-list-host') && fcSrc.includes('data-archive-forward') && fcSrc.includes('data-archive-export'), 'Archive tab lists completed works with reader, forward, and export actions');
  assert.ok(wechatSrc.includes("c.startsWith('__FCWORK__')") && wechatSrc.includes("parsed.type === 'fc-work'"), 'WeChat handles __FCWORK__ end-to-end');
  assert.ok(indexSrc.includes('js/fan-community-export.js'), 'index.html loads fan-community-export.js');
  ok('All UI & integration contracts verified across modules');

  // Delete archive cleanup verification
  const delArch = Works.deleteArchive(compRes.archive.archiveId);
  assert.strictEqual(delArch.ok, true);
  assert.strictEqual(Works.listArchives().archives.length, 0);
  assert.ok(delArch.orphanedAssetIds.includes('av_user_1'), 'Orphaned avatar reported once last archive reference removed');
  assert.ok(!delArch.orphanedAssetIds.includes('stk_cat'), 'Stickers in sticker library are never marked for deletion');
  ok('Deleting archive cleans up index and reports only non-sticker orphaned assets');

  console.log(`\nALL ${passed} TESTS PASSED!`);
})().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
