/**
 * Automated verification for Fan Community「捡手机文学」rich message upgrades:
 * - Fake recall (keep original bubble + restore/red-cross side capsule + recall tip + unified「撤回」menu wording)
 * - Voice messages (no audio playback; voice bar + duration + click to toggle text; AI reads & sends)
 * - Text-based image cards (no local image picker; image card displays text inside; AI understands as image & sends)
 * - Custom location cards (place name + detailed address; no geolocation API; AI understands & sends)
 * - Both「AI 角色互动」(ai_roleplay) and「AI 剧情生成」(ai_story) modes + pure online chat rules + bubble count + worldbook
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const lsStore = new Map();
global.localStorage = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => lsStore.set(k, String(v)),
  removeItem: (k) => lsStore.delete(k)
};
global.window = global;
global.navigator = { userAgent: 'NodeTest/1.0' };

require('../js/fan-community-works.js');
require('../js/fan-community-prompts.js');
require('../js/fan-community-ai.js');

async function runTests() {
  const works = global.window.FanCommunityWorks;
  const prompts = global.window.FanCommunityPrompts;
  const ai = global.window.FanCommunityAi;

  const mockStickerCatalog = [
    {
      id: 'stk_cat_1',
      name: '猫猫探头',
      description: '橘猫从门缝探出头偷看，表示好奇试探',
      tags: ['好奇']
    }
  ];
  const mockStickerIdMap = { stk_cat_1: mockStickerCatalog[0] };

  global.window.FanCommunityAssets = {
    buildAiStickerCatalog: async () => ({
      catalog: mockStickerCatalog,
      idMap: mockStickerIdMap,
      totalCount: 1
    })
  };

  // =========================================================================
  // 1. User messages serialization into AI context:
  //    fakeRecall, text_voice, text-image card, location card
  // =========================================================================
  const workState = {
    id: 'work_rich_test',
    title: '夜雨偶遇',
    char: '沈砚',
    user: '林夏',
    creationMode: 'ai_roleplay',
    aiReplyPrefs: { minMessages: 1, maxMessages: 5 },
    items: [
      {
        id: 'm1',
        type: 'text',
        side: 'right',
        text: '骗子一个，我都没见过你的精神体好吧',
        fakeRecall: true
      },
      {
        id: 'm2',
        type: 'text_voice',
        side: 'right',
        text: '喂，你现在到底在不在训练场啊',
        content: '喂，你现在到底在不在训练场啊',
        duration: 7
      },
      {
        id: 'm3',
        type: 'image',
        isTextImage: true,
        side: 'right',
        text: '雨夜训练场花坛边，一只白色小狐狸蜷在伞下发抖',
        alt: '雨夜训练场花坛边，一只白色小狐狸蜷在伞下发抖'
      },
      {
        id: 'm4',
        type: 'location',
        side: 'right',
        name: '训练场东门花坛',
        address: '银港学院西区 3 号训练馆旁'
      },
      {
        id: 'm5',
        type: 'withdraw',
        side: 'left',
        original: { type: 'text', side: 'left', text: '其实我一直在等你' }
      }
    ],
    aiSettings: works.createDefaultAiSettings('沈砚'),
    emotionState: works.createDefaultEmotionState(),
    aiMemory: works.createDefaultAiMemory()
  };

  const payload = prompts.assemblePromptPayload({
    mode: 'ai_roleplay',
    workState,
    stickerCatalog: mockStickerCatalog,
    stickerIdMap: mockStickerIdMap
  });

  // Pure online rules & rich message schema present in system prompt
  assert(payload.system.includes('纯线上手机聊天模拟器'), 'Pure online chat rule must remain');
  assert(payload.system.includes('绝对禁止旁白腔'), 'No narration rule must remain');
  assert(payload.system.includes('图片卡片（type="image"）'), 'System prompt must describe image card output');
  assert(payload.system.includes('定位卡片（type="location"）'), 'System prompt must describe location card output');
  assert(payload.system.includes('假撤回（"recalled": true）'), 'System prompt must describe fake recall output');

  const historyJoined = payload.messages.map((m) => m.content).join('\n');
  assert(
    historyJoined.includes('[撤回了这条消息，撤回前原内容仍可见]：骗子一个，我都没见过你的精神体好吧'),
    'Fake-recalled user message must remain in AI context with recall mark & original text'
  );
  assert(
    historyJoined.includes('[撤回了这条消息，撤回前原内容仍可见]：其实我一直在等你'),
    'Legacy withdraw message with original must serialize cleanly as fake recall'
  );
  assert(
    historyJoined.includes('[发送了语音消息 7″，语音内容：喂，你现在到底在不在训练场啊]'),
    'Voice bar must serialize as a voice message with spoken text'
  );
  assert(
    historyJoined.includes('[发送了一张图片，图片画面内容：雨夜训练场花坛边，一只白色小狐狸蜷在伞下发抖]'),
    'Text image card must serialize clearly as an image depicting visual content'
  );
  assert(
    historyJoined.includes('[发送了定位卡片：地点「训练场东门花坛」｜详细地址：银港学院西区 3 号训练馆旁]'),
    'Location card must serialize with place name and detailed address'
  );

  // =========================================================================
  // 2. AI Roleplay mode: proactive sending of fake-recall, voice, image card,
  //    location card, and sticker + worldbook scanning
  // =========================================================================
  let capturedWbScan = [];
  global.window.resolveLorebookContext = async (params) => {
    capturedWbScan = params.scanTexts || [];
    return {
      segments: { before: '', middle: '', after: '' },
      mergedText: '',
      matchedCount: 0,
      totalMatchedBeforeBudget: 0,
      truncatedByBudget: false,
      matchedMeta: []
    };
  };

  global.window.callAI = async () => JSON.stringify({
    messages: [
      { type: 'text', content: '行，我马上出来找你', recalled: true },
      { type: 'text_voice', content: '撤回晚了我都看到了，站在原地别乱跑', duration: 6 },
      { type: 'image', content: '一把黑色长柄伞靠在训练馆玻璃门边，门外雨幕密集' },
      { type: 'location', name: '3号训练馆正门', address: '银港学院西区主干道北侧' },
      { type: 'sticker', assetId: 'stk_cat_1' }
    ],
    emotionUpdate: { shouldChangeRelationship: false, currentEmotion: '无奈又急切', emotionIntensity: 68 },
    summaryNote: ''
  });

  const roleplayTurn = await ai.requestAiTurn({ workState });
  assert.strictEqual(roleplayTurn.messages.length, 5, 'All 5 rich message types must pass count validation');
  assert.strictEqual(roleplayTurn.replyCountMeta.actualCount, 5);

  // Verify worldbook scanned recalled text, voice text, image card content, and location name/address
  const wbJoined = capturedWbScan.join('\n');
  assert(wbJoined.includes('骗子一个'), 'Worldbook should scan fake-recalled message text');
  assert(wbJoined.includes('白色小狐狸'), 'Worldbook should scan text-image card description');
  assert(wbJoined.includes('训练场东门花坛') && wbJoined.includes('银港学院西区'), 'Worldbook should scan location name and address');

  // Verify parsed message shapes
  assert.strictEqual(roleplayTurn.messages[0].type, 'text');
  assert.strictEqual(roleplayTurn.messages[0].fakeRecall, true);
  assert.strictEqual(roleplayTurn.messages[0].side, 'left');

  assert.strictEqual(roleplayTurn.messages[1].type, 'text_voice');
  assert.strictEqual(roleplayTurn.messages[1].text, '撤回晚了我都看到了，站在原地别乱跑');
  assert.strictEqual(roleplayTurn.messages[1].duration, 6);

  assert.strictEqual(roleplayTurn.messages[2].type, 'image');
  assert.strictEqual(roleplayTurn.messages[2].isTextImage, true);
  assert(!roleplayTurn.messages[2].isSticker, 'Text image card must not be flagged as sticker');
  assert.strictEqual(roleplayTurn.messages[2].text, '一把黑色长柄伞靠在训练馆玻璃门边，门外雨幕密集');

  assert.strictEqual(roleplayTurn.messages[3].type, 'location');
  assert.strictEqual(roleplayTurn.messages[3].name, '3号训练馆正门');
  assert.strictEqual(roleplayTurn.messages[3].address, '银港学院西区主干道北侧');

  assert.strictEqual(roleplayTurn.messages[4].type, 'image');
  assert.strictEqual(roleplayTurn.messages[4].isSticker, true);
  assert.strictEqual(roleplayTurn.messages[4].assetId, 'stk_cat_1');

  // =========================================================================
  // 3. AI Story mode (ai_story): both sides sending recall, voice, image card, location
  // =========================================================================
  const storyWork = Object.assign({}, workState, {
    creationMode: 'ai_story',
    aiReplyPrefs: { minMessages: 4, maxMessages: 6 }
  });

  let storySystem = '';
  global.window.callAI = async (msgs, opts) => {
    storySystem = opts.system;
    return JSON.stringify({
      messages: [
        { side: 'right', type: 'recall', content: '你跑慢点别淋湿了' },
        { side: 'left', type: 'location', name: '东门便利店屋檐下', address: '训练场东门斜对面 50 米' },
        { side: 'left', type: 'image', content: '两杯冒热气的姜茶放在便利店木质吧台上' },
        { side: 'right', type: 'voice', content: '好，我就在花坛这边马上过去', duration: 5 }
      ],
      emotionUpdate: { shouldChangeRelationship: false, currentEmotion: '温和', emotionIntensity: 55 },
      summaryNote: ''
    });
  };

  const storyTurn = await ai.requestAiTurn({ workState: storyWork });
  assert(storySystem.includes('AI 剧情生成'), 'Story mode prompt must activate');
  assert(storySystem.includes('定位卡片'), 'Story mode must describe location card');
  assert(storySystem.includes('图片卡片'), 'Story mode must describe image card');
  assert.strictEqual(storyTurn.messages.length, 4);

  assert.strictEqual(storyTurn.messages[0].side, 'right');
  assert.strictEqual(storyTurn.messages[0].type, 'text');
  assert.strictEqual(storyTurn.messages[0].fakeRecall, true);

  assert.strictEqual(storyTurn.messages[1].side, 'left');
  assert.strictEqual(storyTurn.messages[1].type, 'location');
  assert.strictEqual(storyTurn.messages[1].name, '东门便利店屋檐下');

  assert.strictEqual(storyTurn.messages[2].side, 'left');
  assert.strictEqual(storyTurn.messages[2].type, 'image');
  assert.strictEqual(storyTurn.messages[2].isTextImage, true);

  assert.strictEqual(storyTurn.messages[3].side, 'right');
  assert.strictEqual(storyTurn.messages[3].type, 'text_voice');
  assert.strictEqual(storyTurn.messages[3].duration, 5);

  // =========================================================================
  // 4. Frontend UI contract verification in fan-community-chat.js & CSS
  // =========================================================================
  const chatJs = fs.readFileSync(path.join(__dirname, '../js/fan-community-chat.js'), 'utf8');
  const chatCss = fs.readFileSync(path.join(__dirname, '../css/fan-community-chat.css'), 'utf8');

  // 4A. Fake recall UI
  assert(chatJs.includes('function buildFakeRecallBadge(index)'), 'Must render side fake-recall capsule');
  assert(chatJs.includes('fc-chat-recall-restore'), 'Must render restore icon button');
  assert(chatJs.includes('fc-chat-recall-del'), 'Must render red cross icon button');
  assert(chatJs.includes('fc-chat-recall-tip'), 'Must display recall hint below recalled bubble');
  assert(!chatJs.includes("label: '假撤回'"), 'Operation menu must unify wording to「撤回」');
  assert(chatJs.includes("label: '撤回'"), 'Context menu must use「撤回」');

  // 4B. Voice message audio playback completely removed
  assert(!chatJs.includes('speechSynthesis'), 'Voice must not use speechSynthesis playback');
  assert(!chatJs.includes('new Audio('), 'Voice must not play audio files');
  assert(!chatJs.includes('fc-chat-voice-file'), 'Voice sheet must not ask for local audio file');
  assert(chatJs.includes('_expandedTextVoices[index] = !_expandedTextVoices[index]'), 'Voice bar click must toggle expand/collapse');

  // 4C. Image message text card (local image upload removed for regular images, kept for stickers)
  assert(!chatJs.includes('fc-chat-image-file'), 'Regular image sheet must not have local file upload');
  assert(chatJs.includes('fc-chat-image-text'), 'Regular image sheet must have image text input');
  assert(chatJs.includes('fc-chat-imgcard'), 'Must render image card in chat stream');
  assert(chatJs.includes('fc-chat-imgcard-text'), 'Image card must display text inside card');
  assert(chatJs.includes('isTextImage: true'), 'Sent image message must set isTextImage');

  // 4D. Custom location card (no real geolocation)
  assert(chatJs.includes('function openLocationSheet()'), 'Must provide custom location sheet');
  assert(chatJs.includes("['◎', '定位', openLocationSheet]"), 'More tools panel must include 定位');
  assert(chatJs.includes('fc-chat-location-name') && chatJs.includes('fc-chat-location-address'), 'Location sheet must support place name and detailed address');
  assert(chatJs.includes('fc-chat-location') && chatJs.includes('fc-chat-loc-map'), 'Must render location card in chat stream');
  assert(!chatJs.includes('navigator.geolocation'), 'Must not invoke real geolocation service');

  // 4E. CSS rules present
  assert(chatCss.includes('.fc-chat-fake-recall'), 'CSS must style fake-recall side capsule');
  assert(chatCss.includes('.fc-chat-recall-tip'), 'CSS must style recall tip');
  assert(chatCss.includes('.fc-chat-imgcard'), 'CSS must style image text card');
  assert(chatCss.includes('.fc-chat-location'), 'CSS must style location card');

  console.log('ALL_RICH_MESSAGE_TESTS_PASSED');
}

runTests().catch((err) => {
  console.error('RICH_MESSAGE_TEST_FAILED:', err);
  process.exit(1);
});
