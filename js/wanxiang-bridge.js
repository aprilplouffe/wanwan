// js/wanxiang-bridge.js — 弯弯小手机｜万象镜 V3.1「回忆有回声」双向联动桥接层
// 职责：
// 1. 只读汇总按 charId 严格隔离且已真实提交的万象镜共同经历（不读取未完成/已取消/已退款/作废记录）
// 2. 为普通私聊提供按相关性、相对时间、防重复与 Token 预算裁剪的经历上下文（绝不写死全量灌入）
// 3. 本地白名单地点建议识别（带否定/梦境/过去回顾/假设过滤），不直接扣费或自动完成游玩
// 4. 主动「分享给 Char」草稿冲突检测（合并/覆盖/取消）、跨 Char 纠偏与 shareRequestId 幂等发消息
// 5. 「记住这一天」精选长期记忆预览、字数规范与双向删除同步
// 6. 聊天 <-> 万象镜双向跳转上下文保存与精确恢复（原聊天窗口、原草稿、原滚动位置）

(function(global) {
  'use strict';

  var STORAGE_KEY = 'wanxiang_mirror_bridge_v31';
  var SCHEMA_VERSION = 31;
  var NAV_TTL_MS = 24 * 60 * 60 * 1000;
  var MAX_CONTEXT_ITEMS = 4;
  var MAX_CONTEXT_CHARS = 600;

  var MIRROR_KEYS = {
    COMPANION_V22: 'wanxiang_mirror_companion_v22',
    MEMENTOS: 'wanxiang_mirror_mementos_v1',
    GARDEN_V22: 'wanxiang_mirror_garden_v22',
    LAKESIDE_V22: 'wanxiang_mirror_lakeside_v22',
    CLAW_V23: 'wanxiang_mirror_claw_v23',
    FERRIS_V23: 'wanxiang_mirror_ferris_v23',
    CAROUSEL_V23: 'wanxiang_mirror_carousel_v23',
    JOURNEYS_V24: 'wanxiang_mirror_journeys_v24',
    LIFE_V30: 'wanxiang_mirror_life_v30'
  };

  var LOCATION_CATALOG = {
    mirror_plaza: {
      id: 'mirror_plaza',
      name: '镜心广场',
      aliases: ['镜心广场', '许愿池', '喷泉广场', '中央广场']
    },
    shopping_street: {
      id: 'shopping_street',
      name: '心动商店街',
      aliases: ['心动商店街', '商店街', '礼物屋', '杂货街', '逛街买礼物']
    },
    afternoon_cafe: {
      id: 'afternoon_cafe',
      name: '午后咖啡馆',
      aliases: ['午后咖啡馆', '咖啡馆', '咖啡店', '甜点店', '喝咖啡']
    },
    gacha_house: {
      id: 'gacha_house',
      name: '奇遇扭蛋屋',
      aliases: ['奇遇扭蛋屋', '扭蛋屋', '扭蛋机', '抽扭蛋']
    },
    mirror_gallery: {
      id: 'mirror_gallery',
      name: '镜中留影馆',
      aliases: ['镜中留影馆', '留影馆', '万象镜留影', '纪念册']
    },
    four_seasons_garden: {
      id: 'four_seasons_garden',
      name: '四季花园',
      aliases: ['四季花园', '花园', '花束', '采花', '扎花束', '做花束']
    },
    starlight_park: {
      id: 'starlight_park',
      name: '星光游乐场',
      aliases: ['星光游乐场', '游乐场', '抓娃娃', '娃娃机', '摩天轮', '星愿摩天轮', '旋转木马', '梦幻旋转木马']
    },
    starwish_station: {
      id: 'starwish_station',
      name: '星愿列车站',
      aliases: ['星愿列车站', '列车站', '火车站', '星愿列车', '梦境列车', '坐列车', '坐火车', '月光海岸', '樱雾花谷', '星眠天文台', '云端小镇']
    },
    lakeside_walk: {
      id: 'lakeside_walk',
      name: '湖畔步道',
      aliases: ['湖畔步道', '睡莲湖畔', '湖畔散步', '湖边散步', '湖畔', '湖边走走']
    }
  };

  var INTENT_RULES = [
    {
      locationId: 'lakeside_walk',
      locationName: '湖畔步道',
      patterns: [/湖畔步道/, /睡莲湖畔/, /(?:去|到|沿着).{0,4}湖(?:畔|边)(?:散步|走走|逛逛)?/, /去湖畔/]
    },
    {
      locationId: 'afternoon_cafe',
      locationName: '午后咖啡馆',
      patterns: [/午后咖啡馆/, /(?:去|到).{0,3}咖啡馆/, /(?:一起|陪我)?去喝(?:杯)?咖啡/]
    },
    {
      locationId: 'four_seasons_garden',
      locationName: '四季花园',
      patterns: [/四季花园/, /(?:去|到).{0,3}花园(?:看看|逛逛|采花)?/, /(?:一起|去)做(?:一束)?花束/, /(?:一起|去)扎花束/]
    },
    {
      locationId: 'starlight_park',
      locationName: '星光游乐场',
      patterns: [/星光游乐场/, /(?:去|到).{0,3}游乐场/, /(?:一起|去)坐(?:星愿)?摩天轮/, /(?:一起|去)抓娃娃/, /(?:一起|去)坐(?:梦幻)?旋转木马/]
    },
    {
      locationId: 'starwish_station',
      locationName: '星愿列车站',
      patterns: [/星愿列车站/, /(?:去|到).{0,3}(?:列车站|火车站)/, /(?:一起|去)坐(?:星愿|梦境)?(?:列车|火车)/, /(?:搭|乘)梦境列车/]
    },
    {
      locationId: 'gacha_house',
      locationName: '奇遇扭蛋屋',
      patterns: [/奇遇扭蛋屋/, /(?:去|到).{0,3}扭蛋屋/, /(?:一起|去)抽扭蛋/]
    },
    {
      locationId: 'shopping_street',
      locationName: '心动商店街',
      patterns: [/心动商店街/, /(?:去|到).{0,3}商店街/]
    },
    {
      locationId: 'mirror_plaza',
      locationName: '镜心广场',
      patterns: [/镜心广场/, /(?:去|到).{0,3}许愿池/]
    },
    {
      locationId: 'mirror_gallery',
      locationName: '镜中留影馆',
      patterns: [/镜中留影馆/, /(?:去|到).{0,3}留影馆/]
    }
  ];

  var _clockFn = null;
  var _txChain = Promise.resolve();

  function nowMs() {
    return _clockFn ? Number(_clockFn()) : Date.now();
  }

  function nowDate() {
    return new Date(nowMs());
  }

  function runBridgeTx(fn) {
    var next = _txChain.then(fn, fn);
    _txChain = next.catch(function() {});
    return next;
  }

  function uid(prefix) {
    var r = Math.random().toString(36).slice(2, 7);
    return String(prefix || 'wxb') + '_' + nowMs().toString(36) + '_' + r;
  }

  function sanitizeText(str, maxLen) {
    var s = String(str == null ? '' : str).replace(/[\u0000-\u001f]+/g, ' ').trim();
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }

  function formatDateYmd(ts) {
    var d = new Date(Number(ts) || nowMs());
    if (isNaN(d.getTime())) return '';
    var p = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function formatRelativeDateLabel(ts, refNowMs) {
    var cur = new Date(refNowMs || nowMs());
    var target = new Date(Number(ts) || 0);
    if (isNaN(target.getTime())) return '不久前';
    var curDay = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()).getTime();
    var targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
    var diffDays = Math.round((curDay - targetDay) / 86400000);
    if (diffDays <= 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays === 2) return '前天';
    if (diffDays <= 30) return diffDays + '天前';
    return (target.getMonth() + 1) + '月' + target.getDate() + '日';
  }

  function getPeriodLabelFromTs(ts) {
    var d = new Date(Number(ts) || nowMs());
    if (isNaN(d.getTime())) return '';
    var h = d.getHours();
    if (h >= 5 && h < 11) return '清晨';
    if (h >= 11 && h < 17) return '白昼';
    if (h >= 17 && h < 20) return '黄昏';
    return '夜晚';
  }

  async function readConfigSafe(key, fallbackVal) {
    try {
      if (global.db && global.db.config) {
        var row = await global.db.config.get(key);
        if (row && row.value !== undefined) return row.value;
      }
    } catch (_) {}
    try {
      if (global.localStorage) {
        var raw = global.localStorage.getItem('__wx_mirror_cfg_' + key);
        if (raw) return JSON.parse(raw);
      }
    } catch (_) {}
    return fallbackVal;
  }

  async function writeConfigSafe(key, value) {
    var wroteDb = false;
    try {
      if (global.db && global.db.config) {
        await global.db.config.put({ key: key, value: value });
        wroteDb = true;
      }
    } catch (_) {}
    try {
      if (global.localStorage) {
        global.localStorage.setItem('__wx_mirror_cfg_' + key, JSON.stringify(value));
      }
    } catch (_) {}
    return wroteDb;
  }

  function defaultBridgeState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      shareRecordsById: {},
      pendingDraftsByChatKey: {},
      memoryLinksByKey: {},
      navigationContexts: {},
      lastNavId: '',
      updatedAt: nowMs()
    };
  }

  function normalizeBridgeState(raw) {
    var def = defaultBridgeState();
    if (!raw || typeof raw !== 'object') return def;
    return {
      schemaVersion: SCHEMA_VERSION,
      shareRecordsById: (raw.shareRecordsById && typeof raw.shareRecordsById === 'object' && !Array.isArray(raw.shareRecordsById)) ? raw.shareRecordsById : {},
      pendingDraftsByChatKey: (raw.pendingDraftsByChatKey && typeof raw.pendingDraftsByChatKey === 'object' && !Array.isArray(raw.pendingDraftsByChatKey)) ? raw.pendingDraftsByChatKey : {},
      memoryLinksByKey: (raw.memoryLinksByKey && typeof raw.memoryLinksByKey === 'object' && !Array.isArray(raw.memoryLinksByKey)) ? raw.memoryLinksByKey : {},
      navigationContexts: (raw.navigationContexts && typeof raw.navigationContexts === 'object' && !Array.isArray(raw.navigationContexts)) ? raw.navigationContexts : {},
      lastNavId: typeof raw.lastNavId === 'string' ? raw.lastNavId : '',
      updatedAt: Number(raw.updatedAt) || nowMs()
    };
  }

  async function loadBridgeState() {
    var raw = await readConfigSafe(STORAGE_KEY, null);
    return normalizeBridgeState(raw);
  }

  async function saveBridgeState(st) {
    var norm = normalizeBridgeState(st);
    norm.updatedAt = nowMs();
    await writeConfigSafe(STORAGE_KEY, norm);
    return norm;
  }

  function getLocationMeta(locId) {
    return LOCATION_CATALOG[String(locId || '')] || null;
  }

  function getLocationName(locId) {
    var m = getLocationMeta(locId);
    return m ? m.name : '镜中小镇';
  }

  function buildChatKey(ownerUid, chatId) {
    return String(ownerUid || '0') + '::' + String(chatId || '0');
  }

  function buildMemoryLinkKey(ownerUid, charId, experienceId) {
    return String(ownerUid || '0') + '::' + String(charId || '0') + '::' + String(experienceId || '');
  }

  async function resolveCurrentOwnerUid() {
    try {
      if (typeof global.getWechatOwnerUidForBridge === 'function') {
        var u = global.getWechatOwnerUidForBridge();
        if (u) return Number(u);
      }
    } catch (_) {}
    try {
      if (global.localStorage) {
        var stored = parseInt(global.localStorage.getItem('wanwan_wechat_uid') || '0', 10);
        if (stored) return stored;
      }
    } catch (_) {}
    return null;
  }

  async function resolvePrivateChatForChar(charId, explicitOwnerUid) {
    var cid = parseInt(charId, 10);
    if (!cid || !global.db) return { ownerUid: null, chatId: null, chat: null };
    var ownerUid = parseInt(explicitOwnerUid || await resolveCurrentOwnerUid() || '0', 10) || null;
    if (!ownerUid) return { ownerUid: null, chatId: null, chat: null };
    var chat = null;
    try {
      if (global.db.chats && global.db.chats.where) {
        chat = await global.db.chats.where('[ownerUid+charId]').equals([ownerUid, cid]).first();
      }
    } catch (_) {}
    if (!chat && global.db.chats && global.db.chats.toArray) {
      try {
        var all = await global.db.chats.toArray();
        chat = all.find(function(c) {
          return c && Number(c.ownerUid) === ownerUid && Number(c.charId) === cid;
        }) || null;
      } catch (_) {}
    }
    if (!chat && typeof global.ensureWechatPrivateChatForBridge === 'function') {
      try {
        chat = await global.ensureWechatPrivateChatForBridge(cid, ownerUid);
      } catch (_) {}
    }
    return {
      ownerUid: ownerUid,
      chatId: chat && chat.id ? Number(chat.id) : null,
      chat: chat || null
    };
  }

  async function resolveCharName(charId, fallback) {
    if (fallback) return String(fallback);
    try {
      if (typeof global.getCharacter === 'function') {
        var ch = await global.getCharacter(Number(charId) || charId);
        if (ch) return ch.nick || ch.name || '同行伙伴';
      } else if (global.db && global.db.characters) {
        var row = await global.db.characters.get(Number(charId) || charId);
        if (row) return row.nick || row.name || '同行伙伴';
      }
    } catch (_) {}
    return '同行伙伴';
  }

  function isExcludedStatus(obj) {
    if (!obj || typeof obj !== 'object') return true;
    if (obj.cancelled || obj.abandoned || obj.refunded) return true;
    var s = String(obj.status || '').toLowerCase();
    return s === 'cancelled' || s === 'abandoned' || s === 'refunded' || s === 'invalidated';
  }

  function normalizeExperienceFromCompanionEvent(ev, stores, charName) {
    if (!ev || !ev.eventId || !ev.charId) return null;
    var locId = String(ev.locationId || '');
    var locMeta = getLocationMeta(locId);
    if (!locMeta) return null;
    var et = String(ev.eventType || '');
    if (et === 'train_ticket_purchased' || et === 'train_journey_started') return null;
    if (et.indexOf('cancelled') !== -1 || et.indexOf('abandoned') !== -1 || et.indexOf('refunded') !== -1) return null;

    var p = ev.payload || {};
    if (isExcludedStatus(p)) return null;

    var lifeSt = stores.life || {};
    if (lifeSt.invalidatedEvents && lifeSt.invalidatedEvents[ev.eventId]) return null;

    var createdAt = Number(ev.createdAt) || nowMs();
    var dateStr = formatDateYmd(createdAt);
    var periodLabel = sanitizeText(p.periodLabel || getPeriodLabelFromTs(createdAt), 12);
    var locName = locMeta.name;
    var normalizedType = et;
    var title = '';
    var summary = '';
    var shareText = '';
    var memoryTitle = '';
    var memoryContent = '';
    var keywords = locMeta.aliases.slice();
    var canRemember = true;
    var canShare = true;
    var sourceEventId = String(ev.eventId);

    if (et === 'bouquet_gifted') {
      var bqName = sanitizeText(p.name || '心意花束', 28);
      var flowers = Array.isArray(p.flowerNames) ? p.flowerNames.join('、') : '';
      var meanings = sanitizeText(p.meanings || '', 48);
      // Cross-check garden bouquets if bouquetId is stored
      if (p.bouquetId && Array.isArray(stores.garden && stores.garden.bouquets)) {
        var bqRow = stores.garden.bouquets.find(function(b) { return b && b.bouquetId === p.bouquetId; });
        if (bqRow && bqRow.status !== 'gifted') return null;
      }
      title = '四季花园赠花「' + bqName + '」';
      summary = '在四季花园送给你一束「' + bqName + '」' + (flowers ? '（花材：' + flowers + '）' : '') + (meanings ? '，花语是「' + meanings + '」' : '');
      shareText = '今天在四季花园把「' + bqName + '」送给你啦' + (flowers ? '，里面搭了' + flowers : '') + '，还记得那句花语吗？';
      memoryTitle = '四季花园·' + bqName;
      memoryContent = dateStr + ' 在四季花园把亲手搭配的「' + bqName + '」送给' + charName + (flowers ? '（花材：' + flowers + '）' : '') + (meanings ? '，花语：' + meanings : '') + '。';
      if (bqName) keywords.push(bqName);
      if (Array.isArray(p.flowerNames)) p.flowerNames.forEach(function(fn) { if (fn) keywords.push(fn); });
      if (meanings) keywords.push(meanings);
    } else if (et === 'lakeside_walk_completed') {
      if (p.walkId && stores.lakeside) {
        if (Array.isArray(stores.lakeside.abandonedWalkIds) && stores.lakeside.abandonedWalkIds.indexOf(p.walkId) !== -1) return null;
      }
      var evTitle = sanitizeText(p.eventTitle || '湖畔散步', 30);
      var choiceLbl = sanitizeText(p.choiceLabel || '', 32);
      title = '湖畔步道·' + evTitle;
      summary = '在湖畔步道一起经历了「' + evTitle + '」' + (choiceLbl ? '，选择了「' + choiceLbl + '」' : '');
      shareText = '刚才在湖畔步道一起散步时遇到了「' + evTitle + '」' + (choiceLbl ? '，我们选择了「' + choiceLbl + '」' : '') + '，风吹过湖面的时候好温柔。';
      memoryTitle = '湖畔步道·' + evTitle;
      memoryContent = dateStr + ' 与' + charName + '在湖畔步道散步，经历「' + evTitle + '」' + (choiceLbl ? '，选择了「' + choiceLbl + '」' : '') + '。';
      if (evTitle) keywords.push(evTitle);
      if (choiceLbl) keywords.push(choiceLbl);
    } else if (et === 'cafe_order') {
      var itemName = sanitizeText(p.itemName || '咖啡与甜点', 28);
      title = '午后咖啡馆·' + itemName;
      summary = '在午后咖啡馆一起点了「' + itemName + '」';
      shareText = '想起我们在午后咖啡馆点过的「' + itemName + '」，那时候坐在一起特别舒服。';
      memoryTitle = '午后咖啡馆·' + itemName;
      memoryContent = dateStr + ' 和' + charName + '在午后咖啡馆一起点了「' + itemName + '」。';
      if (itemName) keywords.push(itemName);
    } else if (et === 'gift_sent') {
      var giftName = sanitizeText(p.itemName || '小镇礼物', 28);
      title = '心动商店街赠礼·' + giftName;
      summary = '在心动商店街把「' + giftName + '」作为礼物送给了你';
      shareText = '之前在心动商店街挑的「' + giftName + '」送给你之后，我还挺想知道你喜不喜欢。';
      memoryTitle = '心动赠礼·' + giftName;
      memoryContent = dateStr + ' 在心动商店街送给' + charName + '一份「' + giftName + '」。';
      if (giftName) keywords.push(giftName);
    } else if (et === 'claw_attempt_completed') {
      if (!p.success) {
        normalizedType = 'claw_attempt_failed';
        canRemember = false;
        title = '星光游乐场·抓娃娃差一点';
        summary = '在星光游乐场抓娃娃机试了一次手气，这次差一点点没抓到';
        shareText = '刚才在星光游乐场抓娃娃差一点点就夹上来了，下次再去试试看！';
        memoryTitle = '';
        memoryContent = '';
      } else {
        normalizedType = 'plush_won';
        var plushW = sanitizeText(p.plushName || '小玩偶', 24);
        title = '星光游乐场·抓到' + plushW;
        summary = '在星光游乐场抓娃娃机成功抓到了「' + plushW + '」';
        shareText = '今天在星光游乐场抓到了「' + plushW + '」，感觉运气真不错！';
        memoryTitle = '游乐场抓到·' + plushW;
        memoryContent = dateStr + ' 在星光游乐场抓娃娃机成功抓到了「' + plushW + '」。';
        if (plushW) keywords.push(plushW);
      }
    } else if (et === 'plush_won') {
      var plushName = sanitizeText(p.plushName || '小玩偶', 24);
      var rLbl = sanitizeText(p.rarityLabel || '', 12);
      title = '星光游乐场·抓到' + plushName;
      summary = '在星光游乐场抓到了' + (rLbl ? '【' + rLbl + '】' : '') + '玩偶「' + plushName + '」';
      shareText = '在星光游乐场抓到了一只「' + plushName + '」，现在还记得落爪那一刻！';
      memoryTitle = '抓到玩偶·' + plushName;
      memoryContent = dateStr + ' 与' + charName + '在星光游乐场抓到了玩偶「' + plushName + '」' + (rLbl ? '（' + rLbl + '）' : '') + '。';
      if (plushName) keywords.push(plushName);
    } else if (et === 'plush_gifted') {
      var gpName = sanitizeText(p.plushName || '玩偶', 24);
      title = '星光游乐场·赠予' + gpName;
      summary = '在星光游乐场把抓到的「' + gpName + '」送给了你';
      shareText = '今天在星光游乐场把抓到的「' + gpName + '」送给你，希望它能一直陪着你~';
      memoryTitle = '赠予玩偶·' + gpName;
      memoryContent = dateStr + ' 在星光游乐场把玩偶「' + gpName + '」送给了' + charName + '。';
      if (gpName) keywords.push(gpName);
    } else if (et === 'ferris_ride_completed') {
      if (p.rideId && stores.ferris) {
        if (Array.isArray(stores.ferris.abandonedRideIds) && stores.ferris.abandonedRideIds.indexOf(p.rideId) !== -1) return null;
      }
      var actsSummary = sanitizeText(p.actsSummary || '', 48);
      title = '星愿摩天轮三幕之旅';
      summary = '在星光游乐场一起乘完星愿摩天轮三幕' + (actsSummary ? '（' + actsSummary + '）' : '');
      shareText = '刚才和你在星光游乐场坐完了一整圈星愿摩天轮，在最高点看小镇灯光的时候真安静呀。';
      memoryTitle = '星愿摩天轮之约';
      memoryContent = dateStr + ' 与' + charName + '在星光游乐场共乘星愿摩天轮三幕' + (actsSummary ? '（' + actsSummary + '）' : '') + '。';
      keywords.push('摩天轮', '最高点', '星愿摩天轮');
      if (actsSummary) keywords.push(actsSummary);
    } else if (et === 'carousel_ride_completed') {
      var seatName = sanitizeText(p.seatName || '梦幻木马', 24);
      var moodName = sanitizeText(p.moodName || '', 16);
      title = '梦幻旋转木马·' + seatName;
      summary = '在星光游乐场一起乘坐了「' + seatName + '」' + (moodName ? '（' + moodName + '氛围）' : '');
      shareText = '今天一起坐了梦幻旋转木马的「' + seatName + '」，金色灯光转起来的时候像回到童话里。';
      memoryTitle = '旋转木马·' + seatName;
      memoryContent = dateStr + ' 与' + charName + '在星光游乐场共乘梦幻旋转木马「' + seatName + '」' + (moodName ? '（' + moodName + '）' : '') + '。';
      keywords.push('旋转木马', seatName);
    } else if (et === 'train_journey_completed') {
      if (p.journeyId && stores.journeys) {
        if (Array.isArray(stores.journeys.abandonedJourneyIds) && stores.journeys.abandonedJourneyIds.indexOf(p.journeyId) !== -1) return null;
        var jMatch = Array.isArray(stores.journeys.completedJourneys)
          ? stores.journeys.completedJourneys.find(function(j) { return j && j.journeyId === p.journeyId; })
          : null;
        if (jMatch && isExcludedStatus(jMatch)) return null;
      }
      var destName = sanitizeText(p.destinationName || '远方站台', 24);
      var destId = sanitizeText(p.destinationId || '', 30);
      var highlights = sanitizeText(p.highlights || '', 50);
      title = '星愿列车·开往' + destName;
      summary = '在星愿列车站一起乘梦境列车抵达「' + destName + '」' + (highlights ? '（途经：' + highlights + '）' : '');
      shareText = '今天和你坐着星愿列车去了「' + destName + '」' + (destId === 'moonlight_coast' ? '，海风和灯塔真让人难忘' : '') + (highlights ? '（' + highlights + '）' : '') + '，你还记得窗外的风景吗？';
      memoryTitle = '星愿列车·' + destName;
      memoryContent = dateStr + ' 与' + charName + '乘星愿列车前往「' + destName + '」' + (highlights ? '（' + highlights + '）' : '') + '。';
      keywords.push('星愿列车', '梦境列车', destName);
      if (destId === 'moonlight_coast') keywords.push('海风', '灯塔', '浪声', '海岸');
      if (destId === 'sakura_valley') keywords.push('樱花', '花瓣', '花谷');
      if (destId === 'starry_observatory') keywords.push('星空', '天文台', '星眠');
      if (destId === 'cloud_town') keywords.push('云海', '云端');
      if (highlights) keywords.push(highlights);
    } else if (et === 'train_postcard_saved') {
      var pcDest = sanitizeText(p.destinationName || '远方站台', 24);
      var pcMsg = sanitizeText(p.postcardMessage || '', 48);
      title = '星愿明信片·' + pcDest;
      summary = '为「' + pcDest + '」列车之旅写下明信片' + (pcMsg ? '：“' + pcMsg + '”' : '');
      shareText = '把去「' + pcDest + '」那趟星愿列车的明信片收好啦' + (pcMsg ? '，上面写着“' + pcMsg + '”' : '') + '。';
      memoryTitle = '旅行明信片·' + pcDest;
      memoryContent = dateStr + ' 收藏了与' + charName + '共乘星愿列车前往「' + pcDest + '」的明信片' + (pcMsg ? '：“' + pcMsg + '”' : '') + '。';
      keywords.push('明信片', pcDest);
      if (pcMsg) keywords.push(pcMsg);
    } else if (et === 'seasonal_event_completed') {
      var sTitle = sanitizeText(p.title || '季节生活事件', 26);
      var sSeason = sanitizeText(p.seasonLabel || '', 10);
      var sChoice = sanitizeText(p.choiceLabel || '', 30);
      title = (sSeason ? sSeason + '·' : '') + sTitle;
      summary = '在' + locName + '一起经历了' + (sSeason ? sSeason + '季节事件' : '') + '「' + sTitle + '」' + (sChoice ? '，选择了「' + sChoice + '」' : '');
      shareText = '在' + locName + '的' + (sSeason || '') + '限定时刻里，我们一起经历了「' + sTitle + '」，感觉特别贴合现在的天气。';
      memoryTitle = (sSeason ? sSeason + '·' : '') + sTitle;
      memoryContent = dateStr + ' 在' + locName + '与' + charName + '经历「' + sTitle + '」' + (sChoice ? '（选择了「' + sChoice + '」）' : '') + '。';
      if (sTitle) keywords.push(sTitle);
      if (sChoice) keywords.push(sChoice);
      if (sSeason) keywords.push(sSeason);
    } else if (et === 'memento_saved') {
      var memTitle = sanitizeText(p.title || '万象镜留影', 28);
      title = '万象镜留影·' + memTitle;
      summary = '在' + locName + '留下了一张「' + memTitle + '」纪念';
      shareText = '在镜中留影馆翻到了我们的「' + memTitle + '」，要不要再一起回忆一下那天？';
      memoryTitle = memTitle;
      memoryContent = dateStr + ' 在' + locName + '与' + charName + '留下纪念「' + memTitle + '」。';
      if (memTitle) keywords.push(memTitle);
    } else if (et === 'invitation_completed') {
      var invTitle = sanitizeText(p.title || (locName + '之约'), 28);
      title = '小镇赴约·' + invTitle;
      summary = '应邀一起前往' + locName + '完成了「' + invTitle + '」';
      shareText = '还记得前两天我们约好去' + locName + '吗？能和你一起赴约真的很开心。';
      memoryTitle = '赴约·' + locName;
      memoryContent = dateStr + ' 与' + charName + '应邀同游' + locName + '（' + invTitle + '）。';
      if (invTitle) keywords.push(invTitle);
    } else {
      return null;
    }

    return {
      experienceId: 'exp:' + sourceEventId,
      sourceEventId: sourceEventId,
      charId: String(ev.charId),
      charName: charName,
      locationId: locId,
      locationName: locName,
      eventType: normalizedType,
      title: sanitizeText(title, 44),
      summary: sanitizeText(summary, 140),
      shareText: sanitizeText(shareText, 140),
      memoryTitle: sanitizeText(memoryTitle, 30),
      memoryContent: sanitizeText(memoryContent, 150),
      keywords: keywords.filter(Boolean).slice(0, 14),
      canShare: canShare,
      canRemember: canRemember,
      createdAt: createdAt,
      dateStr: dateStr,
      periodLabel: periodLabel,
      payload: p
    };
  }

  function normalizeExperienceFromMemento(m, charName) {
    if (!m || !m.id || !m.charId) return null;
    var locId = String(m.locationId || 'mirror_gallery');
    var locMeta = getLocationMeta(locId) || getLocationMeta('mirror_gallery');
    var locName = sanitizeText(m.locationName || locMeta.name, 20);
    var createdAt = Number(m.createdAt) || nowMs();
    var dateStr = sanitizeText(m.dateStr || formatDateYmd(createdAt), 16);
    var periodLabel = sanitizeText(m.periodLabel || getPeriodLabelFromTs(createdAt), 12);
    var title = sanitizeText(m.title || (locName + '留影'), 38);
    var st = String(m.sourceType || 'cafe_photo');
    var extraDetail = sanitizeText(m.postcardMessage || m.summary || m.note || m.ingredientsText || '', 90);
    var summary = '在' + locName + '保存了纪念「' + title + '」' + (extraDetail ? '（' + extraDetail + '）' : '');
    var shareText = st === 'starwish_train'
      ? ('在万象镜留影馆看到了我们去「' + (m.destinationName || title) + '」的旅行明信片' + (m.postcardMessage ? '，写着“' + m.postcardMessage + '”' : '') + '，好怀念那趟车程！')
      : ('翻到了我们在' + locName + '留下的「' + title + '」' + (extraDetail ? '（' + extraDetail + '）' : '') + '，想拿给你再看看~');
    var memContent = sanitizeText(
      dateStr + ' 在' + locName + '与' + charName + '珍藏「' + title + '」' + (extraDetail ? '：' + extraDetail : '') + '。',
      150
    );
    var sourceEventId = String(
      m.sourceEventId || m.giftEventId || m.walkId || m.rideId || m.carouselRideId || m.journeyId || m.seasonalDedupKey || m.id
    );
    var kws = (locMeta ? locMeta.aliases.slice() : []).concat([locName, title]);
    if (m.destinationName) kws.push(m.destinationName);
    if (m.bouquetName) kws.push(m.bouquetName);
    if (m.plushName) kws.push(m.plushName);
    if (m.destinationId === 'moonlight_coast') kws.push('海风', '灯塔');
    return {
      experienceId: 'mem:' + String(m.id),
      mementoId: String(m.id),
      sourceEventId: sourceEventId,
      charId: String(m.charId),
      charName: charName,
      locationId: locMeta ? locMeta.id : 'mirror_gallery',
      locationName: locName,
      eventType: 'memento_saved',
      sourceType: st,
      title: title,
      summary: sanitizeText(summary, 140),
      shareText: sanitizeText(shareText, 140),
      memoryTitle: sanitizeText(title, 30),
      memoryContent: memContent,
      keywords: kws.filter(Boolean).slice(0, 14),
      canShare: true,
      canRemember: true,
      createdAt: createdAt,
      dateStr: dateStr,
      periodLabel: periodLabel,
      payload: { mementoId: String(m.id), sourceType: st, destinationName: m.destinationName || '' }
    };
  }

  async function getExperiencesForChar(charId) {
    if (!charId) return [];
    var cid = String(charId);
    var results = await Promise.all([
      readConfigSafe(MIRROR_KEYS.COMPANION_V22, null),
      readConfigSafe(MIRROR_KEYS.MEMENTOS, []),
      readConfigSafe(MIRROR_KEYS.GARDEN_V22, null),
      readConfigSafe(MIRROR_KEYS.LAKESIDE_V22, null),
      readConfigSafe(MIRROR_KEYS.FERRIS_V23, null),
      readConfigSafe(MIRROR_KEYS.JOURNEYS_V24, null),
      readConfigSafe(MIRROR_KEYS.LIFE_V30, null),
      resolveCharName(cid, '')
    ]);
    var companion = results[0];
    var mementos = Array.isArray(results[1]) ? results[1] : [];
    var stores = {
      garden: results[2],
      lakeside: results[3],
      ferris: results[4],
      journeys: results[5],
      life: results[6]
    };
    var charName = results[7];

    var out = [];
    var seenSourceKeys = {};

    var events = (companion && companion.eventsByScope && Array.isArray(companion.eventsByScope[cid]))
      ? companion.eventsByScope[cid]
      : [];

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev || String(ev.charId || '') !== cid) continue;
      var norm = normalizeExperienceFromCompanionEvent(ev, stores, charName);
      if (!norm) continue;
      out.push(norm);
      if (norm.sourceEventId) seenSourceKeys[norm.sourceEventId] = true;
      var p = ev.payload || {};
      if (p.walkId) seenSourceKeys[String(p.walkId)] = true;
      if (p.rideId) seenSourceKeys[String(p.rideId)] = true;
      if (p.carouselRideId) seenSourceKeys[String(p.carouselRideId)] = true;
      if (p.journeyId) seenSourceKeys[String(p.journeyId)] = true;
      if (p.giftEventId) seenSourceKeys[String(p.giftEventId)] = true;
    }

    for (var j = 0; j < mementos.length; j++) {
      var mem = mementos[j];
      if (!mem || String(mem.charId || '') !== cid) continue;
      if (mem.sourceEventId && seenSourceKeys[String(mem.sourceEventId)]) continue;
      if (mem.walkId && seenSourceKeys[String(mem.walkId)]) continue;
      if (mem.rideId && seenSourceKeys[String(mem.rideId)]) continue;
      if (mem.journeyId && seenSourceKeys[String(mem.journeyId)]) continue;
      var normMem = normalizeExperienceFromMemento(mem, charName);
      if (!normMem) continue;
      if (normMem.sourceEventId && seenSourceKeys[normMem.sourceEventId]) continue;
      out.push(normMem);
      if (normMem.sourceEventId) seenSourceKeys[normMem.sourceEventId] = true;
    }

    out.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return out;
  }

  async function getExperienceById(experienceId, charId) {
    if (!experienceId || !charId) return null;
    var list = await getExperiencesForChar(charId);
    var eid = String(experienceId);
    return list.find(function(x) {
      return x.experienceId === eid || x.sourceEventId === eid || x.mementoId === eid;
    }) || null;
  }

  async function getExistingWanxiangMemoriesForChar(ownerUid, charId) {
    if (!global.db || !global.db.memories || !charId) return [];
    var cid = parseInt(charId, 10);
    var uidNum = ownerUid ? parseInt(ownerUid, 10) : null;
    try {
      var rows = await global.db.memories.toArray();
      return rows.filter(function(m) {
        if (!m || m.sourceType !== 'wanxiang_mirror') return false;
        if (parseInt(m.charId, 10) !== cid) return false;
        if (uidNum && parseInt(m.ownerUid, 10) !== uidNum) return false;
        return true;
      });
    } catch (_) {
      return [];
    }
  }

  function extractQueryDateHint(text, refNowMs) {
    var s = String(text || '');
    var cur = new Date(refNowMs || nowMs());
    var curMid = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()).getTime();
    if (/昨天|昨晚|昨儿/.test(s)) return formatDateYmd(curMid - 86400000);
    if (/前天/.test(s)) return formatDateYmd(curMid - 2 * 86400000);
    if (/今天|刚刚|刚才|这会儿/.test(s)) return formatDateYmd(curMid);
    var daysAgo = s.match(/(\d+)\s*天前/);
    if (daysAgo && daysAgo[1]) {
      var d = Math.max(0, Math.min(365, parseInt(daysAgo[1], 10)));
      return formatDateYmd(curMid - d * 86400000);
    }
    var ymd = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymd) {
      return ymd[1] + '-' + String(ymd[2]).padStart(2, '0') + '-' + String(ymd[3]).padStart(2, '0');
    }
    var md = s.match(/(\d{1,2})月(\d{1,2})[日号]/);
    if (md) {
      return cur.getFullYear() + '-' + String(md[1]).padStart(2, '0') + '-' + String(md[2]).padStart(2, '0');
    }
    return '';
  }

  function hasRecallTrigger(text) {
    return /(万象镜|小镇|咖啡馆|四季花园|花束|湖畔|散步|游乐场|摩天轮|抓娃娃|玩偶|旋转木马|星愿列车|梦境列车|月光海岸|樱雾花谷|天文台|云端小镇|扭蛋|商店街|留影馆|明信片|灯塔|记得|上次|上回|那天|昨天|前天|天前|那次|一起去)/.test(String(text || ''));
  }

  async function buildChatExperienceContext(opts) {
    opts = opts || {};
    try {
      var charId = opts.charId ? String(opts.charId) : '';
      if (!charId) return { text: '', items: [], matchedCount: 0 };
      var ownerUid = opts.ownerUid ? Number(opts.ownerUid) : await resolveCurrentOwnerUid();
      var recentMessages = Array.isArray(opts.recentMessages) ? opts.recentMessages : [];
      var memoryCtx = String(opts.memoryCtx || '');

      var experiences = await getExperiencesForChar(charId);
      if (!experiences.length) return { text: '', items: [], matchedCount: 0 };

      var tailMsgs = recentMessages.slice(-8);
      var queryText = tailMsgs.map(function(m) { return String(m && m.content || ''); }).join('\n');
      var lastUserMsg = '';
      for (var u = tailMsgs.length - 1; u >= 0; u--) {
        if (tailMsgs[u] && tailMsgs[u].role === 'user') {
          lastUserMsg = String(tailMsgs[u].content || '');
          break;
        }
      }

      // 追踪最近消息里引用或分享过的 experienceId（支持后续追问灯塔/海风等细节连续接话）
      var referencedExpIds = {};
      for (var r = 0; r < tailMsgs.length; r++) {
        var msg = tailMsgs[r];
        if (!msg) continue;
        if (msg.wxExperienceShare && msg.wxExperienceShare.experienceId) {
          referencedExpIds[String(msg.wxExperienceShare.experienceId)] = true;
        }
        if (msg.wxExperienceShare && msg.wxExperienceShare.sourceEventId) {
          referencedExpIds[String(msg.wxExperienceShare.sourceEventId)] = true;
        }
      }

      var hasReferenced = Object.keys(referencedExpIds).length > 0;
      var triggered = hasReferenced || hasRecallTrigger(queryText) || hasRecallTrigger(lastUserMsg);
      if (!triggered) {
        return { text: '', items: [], matchedCount: 0 };
      }

      var curNow = nowMs();
      var hintDate = extractQueryDateHint(lastUserMsg || queryText, curNow);

      // 与已存在的长期记忆去重，避免重复占满上下文
      var existingMemories = await getExistingWanxiangMemoriesForChar(ownerUid, charId);
      var dedupEventSet = {};
      existingMemories.forEach(function(m) {
        if (m.sourceEventId) dedupEventSet[String(m.sourceEventId)] = true;
        if (m.experienceId) dedupEventSet[String(m.experienceId)] = true;
      });

      var scored = [];
      for (var i = 0; i < experiences.length; i++) {
        var exp = experiences[i];
        var isAlreadyInLongMemory = Boolean(
          dedupEventSet[exp.sourceEventId] ||
          dedupEventSet[exp.experienceId] ||
          (memoryCtx && exp.memoryTitle && memoryCtx.indexOf(exp.memoryTitle) !== -1)
        );
        var isReferenced = Boolean(referencedExpIds[exp.experienceId] || referencedExpIds[exp.sourceEventId]);

        // 若已通过长期记忆注入且当前并非追问该条分享细节，跳过防重复
        if (isAlreadyInLongMemory && !isReferenced) continue;

        var score = 0;
        if (isReferenced) score += 120;
        if (hintDate && exp.dateStr === hintDate) score += 70;
        else if (hintDate && exp.dateStr !== hintDate) score -= 15;

        var kwList = exp.keywords || [];
        for (var k = 0; k < kwList.length; k++) {
          var kw = kwList[k];
          if (!kw) continue;
          if (lastUserMsg && lastUserMsg.indexOf(kw) !== -1) score += 35;
          else if (queryText.indexOf(kw) !== -1) score += 18;
        }
        if (lastUserMsg && exp.locationName && lastUserMsg.indexOf(exp.locationName) !== -1) score += 30;

        // 微弱时效加权，但不让无关旧记录硬挤入
        var ageHours = Math.max(0, (curNow - (exp.createdAt || curNow)) / 3600000);
        if (score > 0 || !hintDate) {
          score += Math.max(0, 8 - Math.min(8, Math.floor(ageHours / 24)));
        }

        if (score >= 15 || (!hintDate && i < 2 && /万象镜|小镇|最近一起/.test(lastUserMsg))) {
          scored.push({ exp: exp, score: score, isReferenced: isReferenced });
        }
      }

      scored.sort(function(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return (b.exp.createdAt || 0) - (a.exp.createdAt || 0);
      });

      var picked = scored.slice(0, MAX_CONTEXT_ITEMS);
      if (!picked.length) return { text: '', items: [], matchedCount: 0 };

      var lines = [];
      var totalLen = 0;
      var ruleNote = '（以上为真实发生的万象镜经历；未列出的地点或细节请如实说记不清或还没去过，不要编造。）';
      var budget = MAX_CONTEXT_CHARS - ruleNote.length - 12;

      for (var pIdx = 0; pIdx < picked.length; pIdx++) {
        var item = picked[pIdx].exp;
        var relTime = formatRelativeDateLabel(item.createdAt, curNow);
        var timePart = relTime + '（' + item.dateStr + (item.periodLabel ? '·' + item.periodLabel : '') + '）';
        var line = '- [' + timePart + '｜' + item.locationName + '] ' + item.summary;
        if (totalLen + line.length + 1 > budget) break;
        lines.push(line);
        totalLen += line.length + 1;
      }

      if (!lines.length) return { text: '', items: [], matchedCount: 0 };
      var fullText = lines.join('\n') + '\n' + ruleNote;
      return {
        text: fullText,
        items: picked.slice(0, lines.length).map(function(x) { return x.exp; }),
        matchedCount: lines.length
      };
    } catch (err) {
      return { text: '', items: [], matchedCount: 0, error: err && err.message || String(err) };
    }
  }

  function detectChatLocationSuggestion(text) {
    var raw = String(text || '').trim();
    if (!raw || raw.length < 2) return null;

    // 否定句过滤：不去 / 不想去 / 别去 / 没去 / 去不了 / 改天再说 / 算了 / 不打算去
    if (/(不去|不想去|别去|没去|不要去|去不了|不用去|不打算去|改天再说|算了不去)/.test(raw)) {
      return null;
    }

    // 梦境、假设、引用或单纯回忆过去事件过滤（除非带明确“再去/一起去/走起”等当次邀请词）
    var hasCurrentInvite = /(一起去|我们去|陪我去|带我去|再去(?:一次)?|去逛逛|去走走|去看看|去坐|走起)/.test(raw);
    if (/(梦见|做梦|梦里|梦到了|如果去|要是能去|假设去|假如去|听说过)/.test(raw)) {
      return null;
    }
    if (!hasCurrentInvite && /(以前去过|昨天去了|前天去了|上次去了|刚刚去了|刚才去了|那天去了|记得.{0,8}吗|当时.{0,6}点)/.test(raw)) {
      return null;
    }

    for (var i = 0; i < INTENT_RULES.length; i++) {
      var rule = INTENT_RULES[i];
      for (var j = 0; j < rule.patterns.length; j++) {
        if (rule.patterns[j].test(raw)) {
          return {
            locationId: rule.locationId,
            locationName: rule.locationName,
            promptLabel: '一起去' + rule.locationName
          };
        }
      }
    }
    return null;
  }

  async function prepareShareDraft(opts) {
    opts = opts || {};
    var exp = opts.experience;
    if (!exp || !exp.charId || !exp.canShare) {
      return { ok: false, reason: 'invalid_experience', msg: '该条记录暂不支持分享给 Char' };
    }
    var charId = String(exp.charId);
    var resolved = await resolvePrivateChatForChar(charId, opts.ownerUid);
    if (!resolved.ownerUid || !resolved.chatId) {
      return {
        ok: false,
        reason: 'no_wechat_session',
        msg: '请先登录微信并打开与该角色的私聊后再分享'
      };
    }

    var shareText = sanitizeText(opts.customText || exp.shareText || exp.summary, 240);
    if (!shareText) {
      return { ok: false, reason: 'empty_share_text', msg: '分享内容不能为空' };
    }

    var shareRequestId = uid('wxshare');
    return await runBridgeTx(async function() {
      var st = await loadBridgeState();
      var record = {
        shareRequestId: shareRequestId,
        ownerUid: resolved.ownerUid,
        charId: charId,
        chatId: resolved.chatId,
        experienceId: exp.experienceId,
        sourceEventId: exp.sourceEventId || exp.experienceId,
        locationId: exp.locationId,
        locationName: exp.locationName,
        summarySnapshot: exp.summary,
        draftText: shareText,
        status: 'pending',
        messageId: null,
        createdAt: nowMs(),
        updatedAt: nowMs()
      };
      st.shareRecordsById[shareRequestId] = record;
      await saveBridgeState(st);
      return {
        ok: true,
        shareRecord: record,
        ownerUid: resolved.ownerUid,
        chatId: resolved.chatId,
        charId: charId
      };
    });
  }

  async function checkShareDraftConflict(opts) {
    opts = opts || {};
    var chatKey = buildChatKey(opts.ownerUid, opts.chatId);
    var st = await loadBridgeState();
    var existing = st.pendingDraftsByChatKey[chatKey] || null;
    var live = sanitizeText(opts.liveInputText || '', 600);
    var storedText = existing ? sanitizeText(existing.draftText || '', 600) : '';
    var text = live || storedText;
    if (!text) return { hasConflict: false, existingText: '' };
    return {
      hasConflict: true,
      existingText: text,
      existingShareRequestId: existing ? (existing.activeShareRequestId || '') : ''
    };
  }

  async function applyShareDraftToChat(opts) {
    opts = opts || {};
    var ownerUid = Number(opts.ownerUid || 0);
    var chatId = Number(opts.chatId || 0);
    var charId = String(opts.charId || '');
    var shareRecord = opts.shareRecord || null;
    var mode = opts.mode || 'replace'; // 'replace' | 'merge'
    if (!ownerUid || !chatId || !shareRecord) {
      return { ok: false, msg: '缺少分享目标会话信息' };
    }
    if (String(shareRecord.charId) !== charId) {
      return { ok: false, msg: '目标聊天角色与原经历角色不一致，已阻止发送' };
    }

    return await runBridgeTx(async function() {
      var st = await loadBridgeState();
      var chatKey = buildChatKey(ownerUid, chatId);
      var prev = st.pendingDraftsByChatKey[chatKey];
      var baseText = sanitizeText(opts.existingText || (prev && prev.draftText) || '', 600);
      var incoming = sanitizeText(opts.draftText || shareRecord.draftText || '', 300);
      var finalDraft = incoming;
      if (mode === 'merge' && baseText) {
        if (baseText.indexOf(incoming) === -1) {
          finalDraft = baseText + '\n' + incoming;
        } else {
          finalDraft = baseText;
        }
      }
      st.pendingDraftsByChatKey[chatKey] = {
        chatId: chatId,
        charId: charId,
        ownerUid: ownerUid,
        draftText: finalDraft,
        activeShareRequestId: shareRecord.shareRequestId,
        shareLocationName: shareRecord.locationName || '',
        shareExperienceId: shareRecord.experienceId || '',
        updatedAt: nowMs()
      };
      if (st.shareRecordsById[shareRecord.shareRequestId]) {
        st.shareRecordsById[shareRecord.shareRequestId].draftText = incoming;
        st.shareRecordsById[shareRecord.shareRequestId].updatedAt = nowMs();
      }
      await saveBridgeState(st);
      return {
        ok: true,
        draft: st.pendingDraftsByChatKey[chatKey]
      };
    });
  }

  async function getPendingChatDraft(opts) {
    opts = opts || {};
    if (!opts.ownerUid || !opts.chatId) return null;
    var st = await loadBridgeState();
    return st.pendingDraftsByChatKey[buildChatKey(opts.ownerUid, opts.chatId)] || null;
  }

  async function savePendingChatDraft(opts) {
    opts = opts || {};
    if (!opts.ownerUid || !opts.chatId) return null;
    var ownerUid = Number(opts.ownerUid);
    var chatId = Number(opts.chatId);
    var charId = String(opts.charId || '');
    var chatKey = buildChatKey(ownerUid, chatId);
    var txt = String(opts.draftText || '');
    return await runBridgeTx(async function() {
      var st = await loadBridgeState();
      var prev = st.pendingDraftsByChatKey[chatKey] || {};
      if (!txt.trim() && !prev.activeShareRequestId) {
        delete st.pendingDraftsByChatKey[chatKey];
      } else {
        st.pendingDraftsByChatKey[chatKey] = {
          chatId: chatId,
          charId: charId || prev.charId || '',
          ownerUid: ownerUid,
          draftText: txt,
          activeShareRequestId: opts.activeShareRequestId !== undefined ? (opts.activeShareRequestId || '') : (prev.activeShareRequestId || ''),
          shareLocationName: prev.shareLocationName || '',
          shareExperienceId: prev.shareExperienceId || '',
          updatedAt: nowMs()
        };
      }
      await saveBridgeState(st);
      return st.pendingDraftsByChatKey[chatKey] || null;
    });
  }

  async function cancelPendingShareDraft(opts) {
    opts = opts || {};
    if (!opts.ownerUid || !opts.chatId) return { ok: true };
    var chatKey = buildChatKey(opts.ownerUid, opts.chatId);
    return await runBridgeTx(async function() {
      var st = await loadBridgeState();
      var cur = st.pendingDraftsByChatKey[chatKey];
      if (cur && cur.activeShareRequestId && st.shareRecordsById[cur.activeShareRequestId]) {
        if (st.shareRecordsById[cur.activeShareRequestId].status === 'pending') {
          st.shareRecordsById[cur.activeShareRequestId].status = 'cancelled';
          st.shareRecordsById[cur.activeShareRequestId].updatedAt = nowMs();
        }
      }
      if (opts.clearDraftText) {
        delete st.pendingDraftsByChatKey[chatKey];
      } else if (cur) {
        cur.activeShareRequestId = '';
        cur.shareLocationName = '';
        cur.shareExperienceId = '';
        cur.updatedAt = nowMs();
        if (!String(cur.draftText || '').trim()) {
          delete st.pendingDraftsByChatKey[chatKey];
        }
      }
      await saveBridgeState(st);
      return { ok: true };
    });
  }

  async function consumeShareOnSend(opts) {
    opts = opts || {};
    if (!opts.ownerUid || !opts.chatId) return { hasShare: false };
    var chatKey = buildChatKey(opts.ownerUid, opts.chatId);
    return await runBridgeTx(async function() {
      var st = await loadBridgeState();
      var cur = st.pendingDraftsByChatKey[chatKey];
      var reqId = String(opts.shareRequestId || (cur && cur.activeShareRequestId) || '');
      if (!reqId) {
        if (cur) {
          delete st.pendingDraftsByChatKey[chatKey];
          await saveBridgeState(st);
        }
        return { hasShare: false };
      }
      var rec = st.shareRecordsById[reqId];
      if (!rec) return { hasShare: false };
      if (rec.status === 'sent') {
        return { hasShare: true, duplicate: true, shareRecord: rec };
      }
      if (rec.status === 'cancelled') {
        return { hasShare: false };
      }
      if (String(rec.charId) !== String(opts.charId || rec.charId)) {
        return { hasShare: false, charMismatch: true };
      }
      return {
        hasShare: true,
        duplicate: false,
        shareRequestId: rec.shareRequestId,
        shareMeta: {
          shareRequestId: rec.shareRequestId,
          experienceId: rec.experienceId,
          sourceEventId: rec.sourceEventId,
          locationId: rec.locationId,
          locationName: rec.locationName,
          charId: rec.charId,
          summarySnapshot: rec.summarySnapshot
        }
      };
    });
  }

  async function markShareSent(opts) {
    opts = opts || {};
    if (!opts.shareRequestId && (!opts.ownerUid || !opts.chatId)) return { ok: true };
    return await runBridgeTx(async function() {
      var st = await loadBridgeState();
      if (opts.shareRequestId && st.shareRecordsById[opts.shareRequestId]) {
        st.shareRecordsById[opts.shareRequestId].status = 'sent';
        st.shareRecordsById[opts.shareRequestId].messageId = opts.messageId || null;
        st.shareRecordsById[opts.shareRequestId].updatedAt = nowMs();
      }
      if (opts.ownerUid && opts.chatId) {
        var chatKey = buildChatKey(opts.ownerUid, opts.chatId);
        delete st.pendingDraftsByChatKey[chatKey];
      }
      await saveBridgeState(st);
      return { ok: true };
    });
  }

  async function saveChatNavigationContext(opts) {
    opts = opts || {};
    var ownerUid = Number(opts.ownerUid || await resolveCurrentOwnerUid() || 0);
    var chatId = Number(opts.sourceChatId || 0);
    var charId = String(opts.charId || '');
    if (!ownerUid || !chatId || !charId) {
      return { ok: false, msg: '缺少原聊天会话上下文' };
    }
    var charName = await resolveCharName(charId, opts.charName || '');
    var navId = uid('wxnav');
    return await runBridgeTx(async function() {
      var st = await loadBridgeState();
      var now = nowMs();
      // 清理过期上下文，防止无限膨胀
      Object.keys(st.navigationContexts).forEach(function(k) {
        var item = st.navigationContexts[k];
        if (!item || (item.expiresAt && item.expiresAt < now)) {
          delete st.navigationContexts[k];
        }
      });
      var ctx = {
        navId: navId,
        ownerUid: ownerUid,
        charId: charId,
        charName: charName,
        sourceChatId: chatId,
        targetLocationId: String(opts.targetLocationId || ''),
        targetLocationName: String(opts.targetLocationName || getLocationName(opts.targetLocationId)),
        draftText: String(opts.draftText || ''),
        scrollTop: Math.max(0, Number(opts.scrollTop) || 0),
        active: true,
        createdAt: now,
        expiresAt: now + NAV_TTL_MS
      };
      st.navigationContexts[navId] = ctx;
      st.lastNavId = navId;
      await saveBridgeState(st);
      return { ok: true, navId: navId, context: ctx };
    });
  }

  async function getNavigationContext(navId) {
    if (!navId) return null;
    var st = await loadBridgeState();
    var ctx = st.navigationContexts[String(navId)];
    if (!ctx || !ctx.active) return null;
    if (ctx.expiresAt && ctx.expiresAt < nowMs()) return null;
    return ctx;
  }

  async function clearNavigationContext(navId) {
    if (!navId) return { ok: true };
    return await runBridgeTx(async function() {
      var st = await loadBridgeState();
      if (st.navigationContexts[String(navId)]) {
        st.navigationContexts[String(navId)].active = false;
        delete st.navigationContexts[String(navId)];
      }
      if (st.lastNavId === String(navId)) st.lastNavId = '';
      await saveBridgeState(st);
      return { ok: true };
    });
  }

  function buildMemoryCandidate(exp) {
    if (!exp || !exp.canRemember) return null;
    return {
      title: sanitizeText(exp.memoryTitle || exp.title, 30),
      content: sanitizeText(exp.memoryContent || exp.summary, 150),
      keywords: (exp.keywords || []).slice(0, 8),
      sourceType: 'wanxiang_mirror',
      sourceEventId: exp.sourceEventId || exp.experienceId,
      experienceId: exp.experienceId,
      locationId: exp.locationId,
      locationName: exp.locationName,
      charId: exp.charId,
      sourceAt: exp.createdAt || nowMs(),
      importance: 7
    };
  }

  async function checkMemorySavedStatus(opts) {
    opts = opts || {};
    var exp = opts.experience;
    if (!exp || !exp.charId) return { saved: false, memoryId: null };
    var ownerUid = Number(opts.ownerUid || await resolveCurrentOwnerUid() || 0);
    var charId = String(exp.charId);
    var st = await loadBridgeState();
    var key = buildMemoryLinkKey(ownerUid, charId, exp.experienceId);
    var link = st.memoryLinksByKey[key] || null;
    var existing = null;

    if (global.WanWanMemory && typeof global.WanWanMemory.findBridgeMemory === 'function') {
      try {
        existing = await global.WanWanMemory.findBridgeMemory({
          memoryId: link && link.memoryId,
          ownerUid: ownerUid || undefined,
          charId: charId,
          sourceEventId: exp.sourceEventId,
          experienceId: exp.experienceId
        });
      } catch (_) {}
    }

    if (existing && existing.id) {
      if (!link || Number(link.memoryId) !== Number(existing.id)) {
        await runBridgeTx(async function() {
          var latest = await loadBridgeState();
          latest.memoryLinksByKey[key] = {
            ownerUid: ownerUid,
            charId: charId,
            experienceId: exp.experienceId,
            sourceEventId: exp.sourceEventId || exp.experienceId,
            memoryId: existing.id,
            title: existing.title || '',
            createdAt: link ? link.createdAt : nowMs(),
            updatedAt: nowMs()
          };
          await saveBridgeState(latest);
        });
      }
      return { saved: true, memoryId: existing.id, memory: existing };
    }

    // 若记忆长廊里已被用户手动删除，同步自愈清理桥接链接
    if (link) {
      await runBridgeTx(async function() {
        var latest = await loadBridgeState();
        delete latest.memoryLinksByKey[key];
        await saveBridgeState(latest);
      });
    }
    return { saved: false, memoryId: null, memory: null };
  }

  async function confirmSaveMemory(opts) {
    opts = opts || {};
    var exp = opts.experience;
    if (!exp || !exp.charId || !exp.canRemember) {
      return { ok: false, reason: 'not_eligible', error: '该条记录不支持保存为长期记忆' };
    }
    var title = sanitizeText(opts.title !== undefined ? opts.title : (exp.memoryTitle || exp.title), 30);
    var content = sanitizeText(opts.content !== undefined ? opts.content : (exp.memoryContent || exp.summary), 150);
    if (!title) return { ok: false, reason: 'empty_title', error: '记忆标题不能为空' };
    if (!content) return { ok: false, reason: 'empty_content', error: '记忆内容不能为空' };

    var resolved = await resolvePrivateChatForChar(exp.charId, opts.ownerUid);
    if (!resolved.ownerUid || !resolved.chatId) {
      return {
        ok: false,
        reason: 'no_wechat_session',
        error: '请先登录微信并建立与该角色的聊天后再记住这一天'
      };
    }

    if (!global.WanWanMemory || typeof global.WanWanMemory.saveBridgeMemory !== 'function') {
      return { ok: false, reason: 'memory_api_missing', error: '长期记忆模块未就绪，请重试' };
    }

    var saveRes = await global.WanWanMemory.saveBridgeMemory({
      ownerUid: resolved.ownerUid,
      charId: Number(exp.charId),
      chatId: resolved.chatId,
      sourceEventId: exp.sourceEventId || exp.experienceId,
      experienceId: exp.experienceId,
      locationId: exp.locationId,
      sourceAt: exp.createdAt || nowMs(),
      title: title,
      content: content,
      keywords: (exp.keywords || []).slice(0, 8),
      importance: 7
    });

    if (!saveRes || !saveRes.ok) {
      return {
        ok: false,
        reason: (saveRes && saveRes.reason) || 'save_failed',
        error: (saveRes && saveRes.error) || '写入长期记忆失败，请稍后重试'
      };
    }

    var key = buildMemoryLinkKey(resolved.ownerUid, exp.charId, exp.experienceId);
    await runBridgeTx(async function() {
      var st = await loadBridgeState();
      st.memoryLinksByKey[key] = {
        ownerUid: resolved.ownerUid,
        charId: String(exp.charId),
        experienceId: exp.experienceId,
        sourceEventId: exp.sourceEventId || exp.experienceId,
        memoryId: saveRes.memoryId,
        title: title,
        createdAt: nowMs(),
        updatedAt: nowMs()
      };
      await saveBridgeState(st);
    });

    return {
      ok: true,
      duplicate: Boolean(saveRes.duplicate),
      memoryId: saveRes.memoryId,
      memory: saveRes.memory
    };
  }

  async function onMemoryDeleted(memoryId) {
    var mid = Number(memoryId);
    if (!mid) return { ok: true, removed: 0 };
    return await runBridgeTx(async function() {
      var st = await loadBridgeState();
      var removed = 0;
      Object.keys(st.memoryLinksByKey).forEach(function(k) {
        var link = st.memoryLinksByKey[k];
        if (link && Number(link.memoryId) === mid) {
          delete st.memoryLinksByKey[k];
          removed++;
        }
      });
      if (removed > 0) await saveBridgeState(st);
      return { ok: true, removed: removed };
    });
  }

  var WanxiangExperienceBridge = {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    LOCATION_CATALOG: LOCATION_CATALOG,
    setClock: function(fn) { _clockFn = typeof fn === 'function' ? fn : null; },
    loadBridgeState: loadBridgeState,
    saveBridgeState: saveBridgeState,
    getLocationMeta: getLocationMeta,
    getLocationName: getLocationName,
    getExperiencesForChar: getExperiencesForChar,
    getExperienceById: getExperienceById,
    buildChatExperienceContext: buildChatExperienceContext,
    detectChatLocationSuggestion: detectChatLocationSuggestion,
    prepareShareDraft: prepareShareDraft,
    checkShareDraftConflict: checkShareDraftConflict,
    applyShareDraftToChat: applyShareDraftToChat,
    getPendingChatDraft: getPendingChatDraft,
    savePendingChatDraft: savePendingChatDraft,
    cancelPendingShareDraft: cancelPendingShareDraft,
    consumeShareOnSend: consumeShareOnSend,
    markShareSent: markShareSent,
    saveChatNavigationContext: saveChatNavigationContext,
    getNavigationContext: getNavigationContext,
    clearNavigationContext: clearNavigationContext,
    buildMemoryCandidate: buildMemoryCandidate,
    checkMemorySavedStatus: checkMemorySavedStatus,
    confirmSaveMemory: confirmSaveMemory,
    onMemoryDeleted: onMemoryDeleted,
    resolvePrivateChatForChar: resolvePrivateChatForChar
  };

  global.WanxiangExperienceBridge = WanxiangExperienceBridge;
})(typeof window !== 'undefined' ? window : this);
