/**
 * Automated verification for Fan Community「捡手机文学」sticker optimization:
 * 1. Sticker metadata creation, editing (name + description + tags), original asset ID linkage,
 *    and AI catalog building with description prioritization.
 * 2. User sticker semantics passed into AI chat history context (live metadata via assetId +
 *    fallback snapshot when downgraded/removed from sticker library).
 * 3. Every AI request supplies available stickers' ID, name, and text description to the model
 *    in both「AI 角色互动」(ai_roleplay) and「AI 剧情生成」(ai_story) modes.
 * 4. Char can send stickers alone or paired with text/text_voice; model returns assetId,
 *    structured parser resolves it into image sticker bubbles; invalid/fabricated IDs are rejected;
 *    bubble count rules (aiReplyPrefs) remain enforced.
 * 5. Worldbook linkage scans sent sticker name/description while never scanning unsent library stickers.
 * 6. Chat UI source verification: sticker chat bubbles render ONLY the image (no description text),
 *    manual-only AI trigger preserved, and sticker manage + batch upload metadata UIs exist.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ---- Minimal in-memory IndexedDB shim for FanCommunityAssets ----
function createMockIndexedDB() {
  const stores = new Map();

  function makeReq(executor) {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    setImmediate(() => {
      try {
        req.result = executor();
        if (typeof req.onsuccess === 'function') req.onsuccess({ target: req });
      } catch (err) {
        req.error = err;
        if (typeof req.onerror === 'function') req.onerror({ target: req });
      }
    });
    return req;
  }

  function makeStore(storeName) {
    if (!stores.has(storeName)) stores.set(storeName, new Map());
    const map = stores.get(storeName);
    return {
      put(val) {
        return makeReq(() => {
          map.set(val.id, JSON.parse(JSON.stringify(val)));
          return val.id;
        });
      },
      get(key) {
        return makeReq(() => {
          const hit = map.get(key);
          return hit ? JSON.parse(JSON.stringify(hit)) : undefined;
        });
      },
      getAll() {
        return makeReq(() => Array.from(map.values()).map((v) => JSON.parse(JSON.stringify(v))));
      },
      delete(key) {
        return makeReq(() => {
          map.delete(key);
          return undefined;
        });
      },
      index(indexName) {
        return {
          getAll(val) {
            return makeReq(() =>
              Array.from(map.values())
                .filter((item) => item && item[indexName] === val)
                .map((v) => JSON.parse(JSON.stringify(v)))
            );
          }
        };
      },
      createIndex() {}
    };
  }

  return {
    open(dbName, version) {
      const req = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      const db = {
        name: dbName,
        version,
        objectStoreNames: {
          contains(name) {
            return stores.has(name);
          }
        },
        createObjectStore(name) {
          return makeStore(name);
        },
        transaction(storeName) {
          const tx = {
            error: null,
            oncomplete: null,
            onerror: null,
            onabort: null,
            objectStore(name) {
              return makeStore(name || storeName);
            }
          };
          setImmediate(() => {
            setImmediate(() => {
              if (typeof tx.oncomplete === 'function') tx.oncomplete({ target: tx });
            });
          });
          return tx;
        }
      };
      setImmediate(() => {
        req.result = db;
        if (typeof req.onupgradeneeded === 'function') {
          req.onupgradeneeded({ target: req });
        }
        if (typeof req.onsuccess === 'function') {
          req.onsuccess({ target: req });
        }
      });
      return req;
    }
  };
}

// ---- Bootstrap browser globals ----
const lsStore = new Map();
global.localStorage = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => lsStore.set(k, String(v)),
  removeItem: (k) => lsStore.delete(k)
};
global.window = global;
global.navigator = { userAgent: 'NodeTest/1.0' };
global.indexedDB = createMockIndexedDB();

// Load real Fan Community modules
require('../js/fan-community-works.js');
require('../js/fan-community-assets.js');
require('../js/fan-community-prompts.js');
require('../js/fan-community-ai.js');

async function runTests() {
  const assets = global.window.FanCommunityAssets;
  const prompts = global.window.FanCommunityPrompts;
  const ai = global.window.FanCommunityAi;
  const works = global.window.FanCommunityWorks;

  assert(assets && prompts && ai && works, 'All FanCommunity modules should load cleanly');

  // =========================================================================
  // 1. Sticker metadata creation, editing, ID preservation, catalog building
  // =========================================================================
  const stk1Id = assets.uid('stk');
  const stk2Id = assets.uid('stk');
  const stk3Id = assets.uid('stk');

  await assets.putAsset({
    id: stk1Id,
    kind: 'sticker',
    name: '猫猫叹气.png',
    description: '',
    tags: [],
    src: 'data:image/png;base64,CAT_SIGH_BYTES',
    createdAt: 1000
  });
  await assets.putAsset({
    id: stk2Id,
    kind: 'sticker',
    name: '小狗贴贴',
    description: '软乎乎的小狗蹭脸撒娇，表达很想你、求安慰',
    tags: ['撒娇', '想你'],
    src: 'data:image/png;base64,PUPPY_HUG_BYTES',
    createdAt: 2000
  });
  await assets.putAsset({
    id: stk3Id,
    kind: 'sticker',
    name: '星轨密语',
    description: '夜空里的紫色星轨微微发亮，暗示彼此之间未说出口的约定',
    tags: ['星轨', '心动'],
    src: 'data:image/png;base64,STAR_SECRET_BYTES',
    createdAt: 3000
  });

  // Edit stk1 metadata and confirm original id + src + kind are preserved
  const updated1 = await assets.updateStickerMeta(stk1Id, {
    name: '无语猫猫',
    description: '白猫翻白眼叹气，表示拿你没办法、带点嫌弃又纵容',
    tags: '无语，纵容、调侃'
  });
  assert.strictEqual(updated1.id, stk1Id, 'Sticker asset ID must remain unchanged after edit');
  assert.strictEqual(updated1.src, 'data:image/png;base64,CAT_SIGH_BYTES', 'Original image src must be preserved');
  assert.strictEqual(updated1.kind, 'sticker', 'Sticker kind must remain sticker');
  assert.strictEqual(updated1.name, '无语猫猫');
  assert.strictEqual(updated1.description, '白猫翻白眼叹气，表示拿你没办法、带点嫌弃又纵容');
  assert.deepStrictEqual(updated1.tags, ['无语', '纵容', '调侃']);

  // Verify buildAiStickerCatalog prioritizes described stickers when exceeding limit
  const extraUndescribedId = assets.uid('stk');
  await assets.putAsset({
    id: extraUndescribedId,
    kind: 'sticker',
    name: '空白图',
    description: '',
    src: 'data:image/png;base64,EMPTY',
    createdAt: 9999999999999
  });
  const limitedCat = await assets.buildAiStickerCatalog(3);
  assert.strictEqual(limitedCat.catalog.length, 3, 'Catalog should honor limit');
  assert(
    limitedCat.catalog.every((entry) => entry.description && entry.description.length > 0),
    'Catalog should prioritize stickers with descriptions over undescribed ones when capped'
  );
  assert(limitedCat.idMap[extraUndescribedId], 'idMap should still include all stickers');
  await assets.deleteAsset(extraUndescribedId);

  const fullCat = await assets.buildAiStickerCatalog(40);
  assert.strictEqual(fullCat.totalCount, 3);
  assert.strictEqual(fullCat.idMap[stk1Id].name, '无语猫猫');
  assert.strictEqual(fullCat.idMap[stk1Id].description, '白猫翻白眼叹气，表示拿你没办法、带点嫌弃又纵容');

  // =========================================================================
  // 2. User sticker semantics in AI context + fallback when removed
  // =========================================================================
  const removedStickerId = 'stk_removed_legacy';
  const baseWorkState = {
    id: 'work_sticker_test',
    title: '深夜聊天',
    char: '沈砚',
    user: '林夏',
    creationMode: 'ai_roleplay',
    aiReplyPrefs: { minMessages: 1, maxMessages: 3 },
    items: [
      { id: 'm1', type: 'text', side: 'left', text: '这么晚还不睡？' },
      { id: 'm2', type: 'image', isSticker: true, side: 'right', assetId: stk1Id, alt: '旧名称.png' },
      {
        id: 'm3',
        type: 'image',
        isSticker: true,
        side: 'right',
        assetId: removedStickerId,
        alt: '已删表情',
        stickerDesc: '低头搓手手表示有点不好意思'
      }
    ],
    aiSettings: works.createDefaultAiSettings('沈砚'),
    emotionState: works.createDefaultEmotionState(),
    aiMemory: works.createDefaultAiMemory()
  };

  const payloadRoleplay = prompts.assemblePromptPayload({
    mode: 'ai_roleplay',
    workState: baseWorkState,
    stickerCatalog: fullCat.catalog,
    stickerIdMap: fullCat.idMap
  });

  // Check system prompt contains sticker catalog with id, name, description
  assert(payloadRoleplay.system.includes(`id="${stk1Id}"`), 'System prompt must include stk1 ID');
  assert(payloadRoleplay.system.includes('名称="无语猫猫"'), 'System prompt must include updated stk1 name');
  assert(
    payloadRoleplay.system.includes('描述="白猫翻白眼叹气，表示拿你没办法、带点嫌弃又纵容"'),
    'System prompt must include updated stk1 description'
  );
  assert(payloadRoleplay.system.includes(`id="${stk2Id}"`), 'System prompt must include stk2 ID');
  assert(payloadRoleplay.system.includes('描述="软乎乎的小狗蹭脸撒娇，表达很想你、求安慰"'));

  // Check user's sent stickers in chat context include live name+description and fallback description
  const joinedMessages = payloadRoleplay.messages.map((m) => m.content).join('\n');
  assert(
    joinedMessages.includes('[表情包：无语猫猫；描述：白猫翻白眼叹气，表示拿你没办法、带点嫌弃又纵容；标签：无语/纵容/调侃]'),
    'User sent sticker must serialize with live edited name and description via assetId'
  );
  assert(
    joinedMessages.includes('[表情包：已删表情；描述：低头搓手手表示有点不好意思]'),
    'Removed sticker should fall back cleanly to snapshotted alt and stickerDesc'
  );

  // =========================================================================
  // 3. AI Roleplay mode: sticker alone, sticker + text, invalid ID rejection,
  //    snake_case alias, bubble count & worldbook linkage
  // =========================================================================
  let capturedWorldbookCall = null;
  let capturedCallAIArgs = null;

  global.window.resolveLorebookContext = async (params) => {
    capturedWorldbookCall = params;
    const joined = (params.scanTexts || []).join('\n');
    const matched = joined.includes('无语猫猫') && joined.includes('翻白眼叹气');
    return {
      segments: {
        before: matched ? '【设定命中】林夏发猫猫翻白眼时，沈砚总会嘴硬心软地哄她。' : '',
        middle: '',
        after: ''
      },
      mergedText: matched ? '【设定命中】林夏发猫猫翻白眼时，沈砚总会嘴硬心软地哄她。' : '',
      matchedCount: matched ? 1 : 0,
      totalMatchedBeforeBudget: matched ? 1 : 0,
      truncatedByBudget: false,
      matchedMeta: []
    };
  };

  // Case 3A: Char sends ONLY a sticker (1 bubble)
  global.window.callAI = async (messages, opts) => {
    capturedCallAIArgs = { messages, opts };
    return JSON.stringify({
      messages: [{ type: 'sticker', assetId: stk2Id }],
      emotionUpdate: { shouldChangeRelationship: false, currentEmotion: '纵容', emotionIntensity: 55 },
      summaryNote: ''
    });
  };

  const turnAlone = await ai.requestAiTurn({
    workState: Object.assign({}, baseWorkState, {
      aiReplyPrefs: { minMessages: 1, maxMessages: 3 }
    })
  });

  // Verify worldbook scanned sent sticker semantics (stk1) and did NOT scan unsent library sticker (stk3)
  assert(capturedWorldbookCall, 'Worldbook resolver must be invoked');
  const wbScanJoined = capturedWorldbookCall.scanTexts.join('\n');
  assert(wbScanJoined.includes('无语猫猫') && wbScanJoined.includes('白猫翻白眼叹气'), 'Worldbook must scan sent sticker name & description');
  assert(!wbScanJoined.includes('星轨密语'), 'Worldbook must NOT scan unsent library stickers');
  assert(capturedCallAIArgs.opts.system.includes('沈砚总会嘴硬心软地哄她'), 'Matched worldbook entry must enter system prompt');
  assert(capturedCallAIArgs.opts.system.includes(`id="${stk2Id}"`), 'AI request system prompt must include available sticker catalog');

  assert.strictEqual(turnAlone.messages.length, 1, 'Char should be able to send a standalone sticker');
  assert.strictEqual(turnAlone.messages[0].type, 'image');
  assert.strictEqual(turnAlone.messages[0].isSticker, true);
  assert.strictEqual(turnAlone.messages[0].side, 'left');
  assert.strictEqual(turnAlone.messages[0].assetId, stk2Id);
  assert.strictEqual(turnAlone.messages[0].alt, '小狗贴贴');
  assert.strictEqual(turnAlone.messages[0].stickerDesc, '软乎乎的小狗蹭脸撒娇，表达很想你、求安慰');

  // Case 3B: Char pairs text + sticker + text_voice (3 bubbles, snake_case asset_id alias)
  global.window.callAI = async () => JSON.stringify({
    messages: [
      { type: 'text', content: '又发这个表情糊弄我？' },
      { type: 'sticker', asset_id: stk1Id },
      { type: 'text_voice', content: '行吧行吧，赶紧睡，明天见。', duration: 4 }
    ],
    emotionUpdate: { shouldChangeRelationship: false, currentEmotion: '无奈又宠溺', emotionIntensity: 62 },
    summaryNote: ''
  });

  const turnPaired = await ai.requestAiTurn({
    workState: Object.assign({}, baseWorkState, {
      aiReplyPrefs: { minMessages: 2, maxMessages: 4 }
    })
  });
  assert.strictEqual(turnPaired.messages.length, 3);
  assert.strictEqual(turnPaired.messages[0].type, 'text');
  assert.strictEqual(turnPaired.messages[1].type, 'image');
  assert.strictEqual(turnPaired.messages[1].isSticker, true);
  assert.strictEqual(turnPaired.messages[1].assetId, stk1Id);
  assert.strictEqual(turnPaired.messages[2].type, 'text_voice');
  assert.strictEqual(turnPaired.replyCountMeta.actualCount, 3);

  // Case 3C: Fabricated sticker ID must be dropped and never rendered as a broken sticker
  const parsedBad = ai.parseStructuredResponse(
    JSON.stringify({
      messages: [
        { type: 'sticker', assetId: 'stk_hallucinated_999' },
        { type: 'text', content: '晚安。' }
      ]
    }),
    { mode: 'ai_roleplay', stickerIdMap: fullCat.idMap }
  );
  assert.strictEqual(parsedBad.droppedInvalidStickers, 1, 'Fabricated assetId must be dropped');
  assert.strictEqual(parsedBad.messages.length, 1, 'Only valid message should survive');
  assert.strictEqual(parsedBad.messages[0].type, 'text');

  // =========================================================================
  // 4. AI Story mode (ai_story): both left & right stickers + text + bubble count
  // =========================================================================
  const storyWorkState = Object.assign({}, baseWorkState, {
    creationMode: 'ai_story',
    aiReplyPrefs: { minMessages: 3, maxMessages: 5 }
  });

  let storySystemPrompt = '';
  global.window.callAI = async (messages, opts) => {
    storySystemPrompt = opts.system;
    return JSON.stringify({
      messages: [
        { side: 'left', type: 'text', content: '别装可怜了，把手机放下。' },
        { side: 'right', type: 'sticker', assetId: stk2Id },
        { side: 'left', type: 'sticker', assetId: stk3Id },
        { side: 'right', type: 'text', content: '好好好，我这就闭眼。' }
      ],
      emotionUpdate: { shouldChangeRelationship: false, currentEmotion: '温和', emotionIntensity: 50 },
      summaryNote: ''
    });
  };

  const storyTurn = await ai.requestAiTurn({ workState: storyWorkState });
  assert(storySystemPrompt.includes(`id="${stk1Id}"`), 'AI story mode must inject sticker catalog');
  assert(storySystemPrompt.includes('AI 剧情生成'), 'System prompt must reflect ai_story mode');
  assert.strictEqual(storyTurn.messages.length, 4, 'Story mode should return 4 bubbles within 3~5 range');
  assert.strictEqual(storyTurn.messages[1].side, 'right');
  assert.strictEqual(storyTurn.messages[1].isSticker, true);
  assert.strictEqual(storyTurn.messages[1].assetId, stk2Id);
  assert.strictEqual(storyTurn.messages[2].side, 'left');
  assert.strictEqual(storyTurn.messages[2].isSticker, true);
  assert.strictEqual(storyTurn.messages[2].assetId, stk3Id);

  // =========================================================================
  // 5. Empty sticker library guard
  // =========================================================================
  const emptyPayload = prompts.assemblePromptPayload({
    mode: 'ai_roleplay',
    workState: baseWorkState,
    stickerCatalog: [],
    stickerIdMap: {}
  });
  assert(
    emptyPayload.system.includes('当前表情包库为空。本轮严禁输出 type="sticker"'),
    'Empty sticker catalog must forbid sticker output'
  );

  // =========================================================================
  // 6. Frontend UI & interaction contract verification
  // =========================================================================
  const chatJs = fs.readFileSync(path.join(__dirname, '../js/fan-community-chat.js'), 'utf8');

  // 6A. Sticker management & upload metadata editors exist
  assert(chatJs.includes('function openStickerManageSheet()'), 'Sticker management sheet must exist');
  assert(chatJs.includes('function openBatchStickerMetaSheet(savedAssets)'), 'Batch upload metadata sheet must exist');
  assert(chatJs.includes('function openStickerEditSheet(sticker, opts)'), 'Single sticker edit sheet must exist');
  assert(chatJs.includes('fc-chat-sticker-manage-btn'), 'Sticker panel must expose manage button');
  assert(chatJs.includes('api.updateStickerMeta(sticker.id'), 'Single edit must save metadata linked to original asset ID');
  assert(chatJs.includes('api.updateStickerMeta(ent.id'), 'Batch upload edit must save metadata linked to original asset ID');

  // 6B. Chat stream displays ONLY the sticker image (never renders stickerDesc in chat bubbles)
  const imageBubbleSectionMatch = chatJs.match(/else if \(item\.type === 'image'\) \{[\s\S]*?else if \(item\.type === 'text'\)/);
  assert(imageBubbleSectionMatch, 'Should locate image/sticker message renderer');
  const imageBubbleCode = imageBubbleSectionMatch[0];
  assert(imageBubbleCode.includes("el('div', 'fc-chat-bubble fc-chat-imagebubble' + (item.isSticker ? ' is-sticker' : ''))"));
  assert(imageBubbleCode.includes('imgBubble.appendChild(img);'));
  assert(imageBubbleCode.includes('pendingAssets.push('), 'Should asynchronously resolve assetId from IndexedDB when uncached');
  assert(!imageBubbleCode.includes('stickerDesc'), 'Chat message bubble must NOT display sticker description text');

  // 6C. Manual AI reply trigger preserved: sending text or sticker never calls triggerAiTurn
  const sendHandlerMatch = chatJs.match(/function handleSend\(\) \{[\s\S]*?\n  \}/);
  assert(sendHandlerMatch, 'Should locate handleSend');
  assert(!sendHandlerMatch[0].includes('triggerAiTurn'), 'handleSend must not auto-trigger AI');

  const sendStickerMatch = chatJs.match(/sendTileBtn\.onclick = function\(\) \{[\s\S]*?\n        \};/);
  assert(sendStickerMatch, 'Should locate sticker send handler');
  assert(sendStickerMatch[0].includes('assetId: sticker.id'), 'Sending sticker must save assetId');
  assert(sendStickerMatch[0].includes('stickerDesc:'), 'Sending sticker must snapshot stickerDesc');
  assert(!sendStickerMatch[0].includes('triggerAiTurn'), 'Sending sticker must not auto-trigger AI');
  assert(chatJs.includes('fc-chat-ai-reply-btn'), 'Manual AI reply button must remain present');
  assert(!chatJs.includes('fc-chat-ai-bar'), 'Removed AI bar above compose box must not reappear');

  console.log('ALL_STICKER_TESTS_PASSED');
}

runTests().catch((err) => {
  console.error('STICKER_TEST_FAILED:', err);
  process.exit(1);
});
