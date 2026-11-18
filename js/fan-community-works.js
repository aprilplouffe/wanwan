// js/fan-community-works.js — 同好社区 · 捡手机文学多作品存储与安全迁移模块（任务 06）
// 存储结构：
//   1. 作品索引：wanwan-phone-works-index-v1
//   2. 作品内容：wanwan-phone-work-data-v1:<workId>
//   3. 旧版数据：wanwan-phone-messages-v3（仅只读迁移，绝不清空或覆盖）

(function(global) {
  'use strict';

  var LEGACY_STORAGE_KEY = 'wanwan-phone-messages-v3';
  var WORKS_INDEX_KEY = 'wanwan-phone-works-index-v1';
  var WORK_DATA_PREFIX = 'wanwan-phone-work-data-v1:';
  var LEGACY_WORK_ID = 'work_legacy_v3';

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function storage() {
    return global.localStorage || null;
  }

  function workDataKey(workId) {
    return WORK_DATA_PREFIX + String(workId || '');
  }

  function generateWorkId() {
    var store = storage();
    for (var i = 0; i < 8; i++) {
      var candidate = 'work_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      if (!store || store.getItem(workDataKey(candidate)) === null) {
        return candidate;
      }
    }
    return 'work_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  var DEFAULT_CREATION_MODE = 'manual';
  var VALID_CREATION_MODES = ['manual', 'ai_roleplay', 'ai_story'];
  var CREATION_MODES = [
    {
      id: 'manual',
      title: '手动创作',
      description: '自己编辑双方聊天消息',
      pendingAi: false
    },
    {
      id: 'ai_roleplay',
      title: 'AI 角色互动',
      description: '自己发送消息，AI 扮演指定角色回复',
      pendingAi: true
    },
    {
      id: 'ai_story',
      title: 'AI 剧情生成',
      description: '根据设定自动生成双方聊天剧情',
      pendingAi: true
    }
  ];

  function normalizeCreationMode(raw) {
    var val = typeof raw === 'string' ? raw.trim() : '';
    return VALID_CREATION_MODES.indexOf(val) !== -1 ? val : DEFAULT_CREATION_MODE;
  }

  var AI_REPLY_LENGTHS = ['short', 'medium', 'detailed'];
  var AI_LANGUAGE_STYLES = ['natural', 'emotional', 'dramatic'];

  function cleanStr(val, maxLen) {
    if (typeof val !== 'string') return '';
    var s = val;
    if (typeof maxLen === 'number' && maxLen > 0 && s.length > maxLen) {
      s = s.slice(0, maxLen);
    }
    return s;
  }

  function createDefaultAiSettings(defaultCharName) {
    var charName = String(defaultCharName || '').trim() || '对方';
    return {
      aiRole: {
        name: charName,
        personality: '',
        background: '',
        speakingStyle: '',
        relationshipToUser: ''
      },
      userRole: {
        identityBackground: '',
        personality: '',
        relationshipNotes: ''
      },
      story: {
        worldBackground: '',
        currentPlot: '',
        plotDirection: '',
        avoidContent: ''
      },
      preferences: {
        replyLength: 'medium',
        languageStyle: 'natural',
        allowAdvancePlot: true
      }
    };
  }

  function normalizeAiSettings(raw, defaultCharName) {
    var fallbackChar = String(defaultCharName || '').trim() || '对方';
    var base = createDefaultAiSettings(fallbackChar);
    if (!raw || typeof raw !== 'object') return base;

    var aiRole = raw.aiRole && typeof raw.aiRole === 'object' ? raw.aiRole : {};
    var userRole = raw.userRole && typeof raw.userRole === 'object' ? raw.userRole : {};
    var story = raw.story && typeof raw.story === 'object' ? raw.story : {};
    var prefs = raw.preferences && typeof raw.preferences === 'object' ? raw.preferences : {};

    var rawRoleName = cleanStr(aiRole.name, 40).trim();
    var replyLen = typeof prefs.replyLength === 'string' && AI_REPLY_LENGTHS.indexOf(prefs.replyLength) !== -1
      ? prefs.replyLength
      : base.preferences.replyLength;
    var langStyle = typeof prefs.languageStyle === 'string' && AI_LANGUAGE_STYLES.indexOf(prefs.languageStyle) !== -1
      ? prefs.languageStyle
      : base.preferences.languageStyle;

    return {
      aiRole: {
        name: rawRoleName || fallbackChar,
        personality: cleanStr(aiRole.personality, 1200),
        background: cleanStr(aiRole.background, 2000),
        speakingStyle: cleanStr(aiRole.speakingStyle, 1000),
        relationshipToUser: cleanStr(aiRole.relationshipToUser, 1000)
      },
      userRole: {
        identityBackground: cleanStr(userRole.identityBackground, 1500),
        personality: cleanStr(userRole.personality, 1000),
        relationshipNotes: cleanStr(userRole.relationshipNotes, 1000)
      },
      story: {
        worldBackground: cleanStr(story.worldBackground, 2000),
        currentPlot: cleanStr(story.currentPlot, 2000),
        plotDirection: cleanStr(story.plotDirection, 1500),
        avoidContent: cleanStr(story.avoidContent, 1500)
      },
      preferences: {
        replyLength: replyLen,
        languageStyle: langStyle,
        allowAdvancePlot: prefs.allowAdvancePlot !== false
      }
    };
  }

  var DEFAULT_APPEARANCE = {
    bgType: 'color',
    bgColor: '#abc6d9',
    bgImageAssetId: '',
    bgImageFit: 'cover',
    userBubbleColor: '#fff133',
    charBubbleColor: '#ffffff',
    appearanceVersion: 2
  };

  function normalizeHexColor(val, fallback) {
    if (typeof val !== 'string') return fallback;
    var trimmed = val.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
    if (/^#[0-9a-f]{3}$/.test(trimmed)) {
      return '#' + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3];
    }
    return fallback;
  }

  function normalizeAppearance(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var bgImageAssetId = typeof src.bgImageAssetId === 'string' ? src.bgImageAssetId : '';
    var bgType = src.bgType === 'image' && bgImageAssetId ? 'image' : 'color';
    var bgColor = normalizeHexColor(src.bgColor, DEFAULT_APPEARANCE.bgColor);
    var userBubbleColor = normalizeHexColor(src.userBubbleColor, DEFAULT_APPEARANCE.userBubbleColor);
    var charBubbleColor = normalizeHexColor(src.charBubbleColor, DEFAULT_APPEARANCE.charBubbleColor);

    // 将历史版本未自定义过的旧默认外观自动升级为原版晴空蓝 + 白/黄气泡
    if (
      src.appearanceVersion !== 2 &&
      bgType === 'color' &&
      !bgImageAssetId &&
      bgColor === '#e8ede8' &&
      userBubbleColor === '#d9e3d2' &&
      charBubbleColor === '#fffefa'
    ) {
      bgColor = DEFAULT_APPEARANCE.bgColor;
      userBubbleColor = DEFAULT_APPEARANCE.userBubbleColor;
      charBubbleColor = DEFAULT_APPEARANCE.charBubbleColor;
    }

    return {
      bgType: bgType,
      bgColor: bgColor,
      bgImageAssetId: bgImageAssetId,
      bgImageFit: src.bgImageFit === 'contain' ? 'contain' : 'cover',
      userBubbleColor: userBubbleColor,
      charBubbleColor: charBubbleColor,
      appearanceVersion: 2
    };
  }

  function normalizeWorkData(raw, fallbackMeta) {
    var now = Date.now();
    var meta = fallbackMeta || {};
    var src = raw && typeof raw === 'object' ? raw : {};
    var resolvedChar = String(src.char || meta.char || '对方');
    return {
      id: String(src.id || meta.id || ''),
      title: String(src.title || meta.title || '未命名作品').trim() || '未命名作品',
      char: resolvedChar,
      user: String(src.user || meta.user || '我'),
      charAvatarAssetId: typeof src.charAvatarAssetId === 'string' ? src.charAvatarAssetId : (typeof meta.charAvatarAssetId === 'string' ? meta.charAvatarAssetId : ''),
      userAvatarAssetId: typeof src.userAvatarAssetId === 'string' ? src.userAvatarAssetId : (typeof meta.userAvatarAssetId === 'string' ? meta.userAvatarAssetId : ''),
      appearance: normalizeAppearance(src.appearance),
      creationMode: normalizeCreationMode(src.creationMode !== undefined ? src.creationMode : meta.creationMode),
      boundPersonaId: typeof src.boundPersonaId === 'string' ? src.boundPersonaId : (typeof meta.boundPersonaId === 'string' ? meta.boundPersonaId : ''),
      aiSettings: normalizeAiSettings(src.aiSettings, resolvedChar),
      topic: typeof src.topic === 'string' ? src.topic : '',
      join: src.join !== false,
      showTools: Boolean(src.showTools),
      isLegacy: Boolean(src.isLegacy || meta.isLegacy),
      createdAt: typeof src.createdAt === 'number' ? src.createdAt : (typeof meta.createdAt === 'number' ? meta.createdAt : now),
      updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : (typeof meta.updatedAt === 'number' ? meta.updatedAt : now),
      items: Array.isArray(src.items) ? src.items : []
    };
  }

  function toMeta(workData) {
    return {
      id: workData.id,
      title: workData.title,
      char: workData.char || '对方',
      user: workData.user || '我',
      creationMode: normalizeCreationMode(workData.creationMode),
      boundPersonaId: typeof workData.boundPersonaId === 'string' ? workData.boundPersonaId : '',
      messageCount: Array.isArray(workData.items) ? workData.items.length : 0,
      createdAt: workData.createdAt,
      updatedAt: workData.updatedAt,
      isLegacy: Boolean(workData.isLegacy)
    };
  }

  function sortWorks(works) {
    return works.slice().sort(function(a, b) {
      var diff = (b.updatedAt || 0) - (a.updatedAt || 0);
      if (diff !== 0) return diff;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function readIndexRaw() {
    var store = storage();
    if (!store) {
      return { exists: false, data: { version: 1, migratedFromV3: false, activeWorkId: '', works: [] } };
    }
    var raw = store.getItem(WORKS_INDEX_KEY);
    if (!raw) {
      return { exists: false, data: { version: 1, migratedFromV3: false, activeWorkId: '', works: [] } };
    }
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.works)) {
      throw new Error('作品索引数据格式异常');
    }
    return {
      exists: true,
      data: {
        version: parsed.version || 1,
        migratedFromV3: Boolean(parsed.migratedFromV3),
        activeWorkId: parsed.activeWorkId ? String(parsed.activeWorkId) : '',
        works: parsed.works.slice()
      }
    };
  }

  function writeIndex(indexObj) {
    var store = storage();
    if (!store) return;
    store.setItem(WORKS_INDEX_KEY, JSON.stringify({
      version: 1,
      migratedFromV3: Boolean(indexObj.migratedFromV3),
      activeWorkId: indexObj.activeWorkId || '',
      works: sortWorks(indexObj.works || [])
    }));
  }

  function deriveLegacyTitle(legacyObj) {
    var orig = legacyObj && typeof legacyObj.title === 'string' ? legacyObj.title.trim() : '';
    if (orig && orig !== '捡手机文学' && orig !== '旧版作品') {
      return '旧版作品 · ' + orig;
    }
    return '旧版作品';
  }

  // 安全、幂等的旧版数据迁移：
  // - 仅当存在未迁移的 wanwan-phone-messages-v3 且索引内尚无旧版作品时执行
  // - 绝不清除或修改 wanwan-phone-messages-v3 原键
  // - 写入失败时回滚本次新建键，保留原始状态
  function ensureInitialized() {
    var store = storage();
    if (!store) {
      return { ok: true, index: { version: 1, migratedFromV3: true, activeWorkId: '', works: [] } };
    }

    var readRes;
    try {
      readRes = readIndexRaw();
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : '读取作品索引失败' };
    }

    var index = readRes.data;
    var hasLegacyWork = index.works.some(function(w) {
      return w && (w.id === LEGACY_WORK_ID || w.isLegacy === true);
    });

    if (index.migratedFromV3 || hasLegacyWork) {
      if (!index.migratedFromV3 && hasLegacyWork) {
        index.migratedFromV3 = true;
        try { writeIndex(index); } catch (_) {}
      }
      return { ok: true, index: index };
    }

    var legacyRaw = store.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) {
      index.migratedFromV3 = true;
      if (readRes.exists) {
        try { writeIndex(index); } catch (_) {}
      }
      return { ok: true, index: index };
    }

    var legacyObj;
    try {
      legacyObj = JSON.parse(legacyRaw);
    } catch (err) {
      return { ok: false, error: '旧版聊天记录格式解析失败，已保留原始数据' };
    }

    if (!legacyObj || typeof legacyObj !== 'object' || !Array.isArray(legacyObj.items)) {
      index.migratedFromV3 = true;
      if (readRes.exists) {
        try { writeIndex(index); } catch (_) {}
      }
      return { ok: true, index: index };
    }

    // 只有旧记录非空时迁移为「旧版作品」
    if (legacyObj.items.length === 0) {
      index.migratedFromV3 = true;
      if (readRes.exists) {
        try { writeIndex(index); } catch (_) {}
      }
      return { ok: true, index: index };
    }

    var targetKey = workDataKey(LEGACY_WORK_ID);
    var existingLegacyWorkRaw = store.getItem(targetKey);
    var wroteLegacyDataHere = false;
    var legacyData = null;

    if (existingLegacyWorkRaw) {
      try {
        legacyData = normalizeWorkData(JSON.parse(existingLegacyWorkRaw), {
          id: LEGACY_WORK_ID,
          title: deriveLegacyTitle(legacyObj),
          isLegacy: true
        });
      } catch (_) {
        return { ok: false, error: '读取已迁移旧版作品失败，已终止写入' };
      }
    } else {
      var now = Date.now();
      legacyData = normalizeWorkData(clone(legacyObj), {
        id: LEGACY_WORK_ID,
        title: deriveLegacyTitle(legacyObj),
        isLegacy: true,
        createdAt: now,
        updatedAt: now
      });
      legacyData.id = LEGACY_WORK_ID;
      legacyData.title = deriveLegacyTitle(legacyObj);
      legacyData.isLegacy = true;
    }

    try {
      if (!existingLegacyWorkRaw) {
        store.setItem(targetKey, JSON.stringify(legacyData));
        wroteLegacyDataHere = true;
      }
      index.works.push(toMeta(legacyData));
      index.migratedFromV3 = true;
      if (!index.activeWorkId) {
        index.activeWorkId = legacyData.id;
      }
      writeIndex(index);
      return { ok: true, index: index, migrated: true };
    } catch (err) {
      if (wroteLegacyDataHere) {
        try { store.removeItem(targetKey); } catch (_) {}
      }
      return { ok: false, error: err && err.message ? err.message : '迁移存储失败，已保留原始数据' };
    }
  }

  function listWorks() {
    var res = ensureInitialized();
    if (!res.ok) {
      return { ok: false, error: res.error, works: [] };
    }
    return {
      ok: true,
      works: sortWorks(res.index.works || []),
      activeWorkId: res.index.activeWorkId || ''
    };
  }

  function createWork(title) {
    var cleanTitle = String(title || '').trim();
    if (!cleanTitle) {
      return { ok: false, error: '请输入作品名称' };
    }
    var initRes = ensureInitialized();
    if (!initRes.ok) {
      return { ok: false, error: initRes.error };
    }

    var store = storage();
    var index = initRes.index;
    var now = Date.now();
    var workId = generateWorkId();
    var workData = {
      id: workId,
      title: cleanTitle,
      char: '对方',
      user: '我',
      charAvatarAssetId: '',
      userAvatarAssetId: '',
      appearance: clone(DEFAULT_APPEARANCE),
      creationMode: DEFAULT_CREATION_MODE,
      boundPersonaId: '',
      aiSettings: createDefaultAiSettings('对方'),
      topic: '',
      join: true,
      showTools: false,
      isLegacy: false,
      createdAt: now,
      updatedAt: now,
      items: []
    };

    var key = workDataKey(workId);
    var wroteWorkData = false;
    try {
      if (store) {
        store.setItem(key, JSON.stringify(workData));
        wroteWorkData = true;
      }
      index.works.push(toMeta(workData));
      index.activeWorkId = workId;
      writeIndex(index);
      return { ok: true, work: toMeta(workData), data: workData };
    } catch (err) {
      if (store && wroteWorkData) {
        try { store.removeItem(key); } catch (_) {}
      }
      return { ok: false, error: '存储空间不足，新建作品失败' };
    }
  }

  function getWorkData(workId) {
    if (!workId) return null;
    var initRes = ensureInitialized();
    if (!initRes.ok) return null;

    var meta = null;
    var works = initRes.index.works || [];
    for (var i = 0; i < works.length; i++) {
      if (works[i] && works[i].id === workId) {
        meta = works[i];
        break;
      }
    }

    var store = storage();
    if (!store) return meta ? normalizeWorkData({}, meta) : null;
    try {
      var raw = store.getItem(workDataKey(workId));
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return normalizeWorkData(parsed, meta);
    } catch (_) {
      return null;
    }
  }

  function setActiveWorkId(workId) {
    var initRes = ensureInitialized();
    if (!initRes.ok) return false;
    initRes.index.activeWorkId = workId || '';
    try {
      writeIndex(initRes.index);
      return true;
    } catch (_) {
      return false;
    }
  }

  function saveWorkData(workId, stateObj, options) {
    if (!workId || !stateObj) return false;
    options = options || {};
    var touchUpdatedAt = options.touchUpdatedAt !== false;

    var initRes = ensureInitialized();
    if (!initRes.ok) return false;

    var store = storage();
    var index = initRes.index;
    var metaIdx = -1;
    for (var i = 0; i < index.works.length; i++) {
      if (index.works[i] && index.works[i].id === workId) {
        metaIdx = i;
        break;
      }
    }

    var existingMeta = metaIdx >= 0 ? index.works[metaIdx] : null;
    var now = Date.now();
    var payload = normalizeWorkData(stateObj, existingMeta || { id: workId });
    payload.id = workId;
    if (touchUpdatedAt) {
      payload.updatedAt = now;
    }

    try {
      if (store) {
        store.setItem(workDataKey(workId), JSON.stringify(payload));
      }
      var nextMeta = toMeta(payload);
      if (metaIdx >= 0) {
        index.works[metaIdx] = nextMeta;
      } else {
        index.works.push(nextMeta);
      }
      index.activeWorkId = workId;
      writeIndex(index);
      return true;
    } catch (_) {
      return false;
    }
  }

  function renameWork(workId, nextTitle) {
    var cleanTitle = String(nextTitle || '').trim();
    if (!workId || !cleanTitle) {
      return { ok: false, error: '作品名称不能为空' };
    }
    var data = getWorkData(workId);
    if (!data) {
      return { ok: false, error: '未找到对应作品' };
    }
    data.title = cleanTitle;
    var ok = saveWorkData(workId, data, { touchUpdatedAt: true });
    if (!ok) {
      return { ok: false, error: '保存重命名失败' };
    }
    return { ok: true, work: toMeta(data) };
  }

  // 收集所有作品的消息项，供素材引用安全检查使用
  function getAllReferencedItems() {
    var listed = listWorks();
    if (!listed.ok) return [];
    var store = storage();
    if (!store) return [];

    var combined = [];
    listed.works.forEach(function(w) {
      if (!w || !w.id) return;
      try {
        var raw = store.getItem(workDataKey(w.id));
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (parsed) {
          if (parsed.charAvatarAssetId) combined.push({ assetId: parsed.charAvatarAssetId });
          if (parsed.userAvatarAssetId) combined.push({ assetId: parsed.userAvatarAssetId });
          if (parsed.appearance && parsed.appearance.bgImageAssetId) {
            combined.push({ assetId: parsed.appearance.bgImageAssetId });
          }
          if (Array.isArray(parsed.items)) {
            for (var i = 0; i < parsed.items.length; i++) {
              combined.push(parsed.items[i]);
            }
          }
        }
      } catch (_) {}
    });
    return combined;
  }

  function isAssetReferencedInOtherWorks(assetId, excludeWorkId) {
    if (!assetId) return false;
    var listed = listWorks();
    if (!listed.ok) return true; // 读取索引失败时保守返回 true，绝不误删素材
    var store = storage();
    if (!store) return false;

    for (var i = 0; i < listed.works.length; i++) {
      var w = listed.works[i];
      if (!w || !w.id || w.id === excludeWorkId) continue;
      try {
        var raw = store.getItem(workDataKey(w.id));
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        if (parsed && (
          parsed.charAvatarAssetId === assetId ||
          parsed.userAvatarAssetId === assetId ||
          (parsed.appearance && parsed.appearance.bgImageAssetId === assetId)
        )) {
          return true;
        }
        var items = parsed && Array.isArray(parsed.items) ? parsed.items : [];
        for (var j = 0; j < items.length; j++) {
          var m = items[j];
          if (!m) continue;
          if (m.assetId === assetId) return true;
          if (m.original && m.original.assetId === assetId) return true;
        }
      } catch (_) {
        return true; // 任意作品解析异常时保守保护素材
      }
    }
    return false;
  }

  function countWorksUsingPersona(personaId) {
    if (!personaId) return 0;
    var listed = listWorks();
    if (!listed.ok) return 0;
    var store = storage();
    var count = 0;
    listed.works.forEach(function(w) {
      if (!w || !w.id) return;
      if (w.boundPersonaId === personaId) {
        count += 1;
        return;
      }
      if (!store) return;
      try {
        var raw = store.getItem(workDataKey(w.id));
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (parsed && parsed.boundPersonaId === personaId) {
          count += 1;
        }
      } catch (_) {}
    });
    return count;
  }

  function unbindPersonaAcrossWorks(personaId) {
    if (!personaId) return 0;
    var initRes = ensureInitialized();
    if (!initRes.ok) return 0;
    var store = storage();
    var index = initRes.index;
    var changedCount = 0;

    for (var i = 0; i < index.works.length; i++) {
      var meta = index.works[i];
      if (!meta || !meta.id) continue;
      var matched = meta.boundPersonaId === personaId;
      var parsedData = null;
      if (store) {
        try {
          var raw = store.getItem(workDataKey(meta.id));
          if (raw) {
            parsedData = JSON.parse(raw);
            if (parsedData && parsedData.boundPersonaId === personaId) {
              matched = true;
            }
          }
        } catch (_) {}
      }
      if (!matched) continue;
      changedCount += 1;
      meta.boundPersonaId = '';
      if (parsedData && typeof parsedData === 'object') {
        parsedData.boundPersonaId = '';
        if (store) {
          try {
            store.setItem(workDataKey(meta.id), JSON.stringify(parsedData));
          } catch (_) {}
        }
      }
    }

    if (changedCount > 0) {
      try {
        writeIndex(index);
      } catch (_) {}
    }
    return changedCount;
  }

  global.FanCommunityWorks = {
    LEGACY_STORAGE_KEY: LEGACY_STORAGE_KEY,
    WORKS_INDEX_KEY: WORKS_INDEX_KEY,
    WORK_DATA_PREFIX: WORK_DATA_PREFIX,
    LEGACY_WORK_ID: LEGACY_WORK_ID,
    DEFAULT_CREATION_MODE: DEFAULT_CREATION_MODE,
    CREATION_MODES: clone(CREATION_MODES),
    normalizeCreationMode: normalizeCreationMode,
    createDefaultAiSettings: createDefaultAiSettings,
    normalizeAiSettings: normalizeAiSettings,
    DEFAULT_APPEARANCE: clone(DEFAULT_APPEARANCE),
    normalizeAppearance: normalizeAppearance,
    ensureInitialized: ensureInitialized,
    listWorks: listWorks,
    createWork: createWork,
    getWorkData: getWorkData,
    saveWorkData: saveWorkData,
    setActiveWorkId: setActiveWorkId,
    renameWork: renameWork,
    countWorksUsingPersona: countWorksUsingPersona,
    unbindPersonaAcrossWorks: unbindPersonaAcrossWorks,
    getAllReferencedItems: getAllReferencedItems,
    isAssetReferencedInOtherWorks: isAssetReferencedInOtherWorks
  };
})(window);
