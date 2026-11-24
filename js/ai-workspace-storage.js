// ai-workspace-storage.js — 知屿（AI 工作空间）持久化存储层（配置、预设、专属 API 与独立聊天记录）
// 严格复用现有 WanWanDB 的 db.config 键值表（不修改 db.js 数据库版本，不混入微信 db.chats/db.messages），并辅以 localStorage 兜底镜像。
(function(global) {
  'use strict';

  var CACHE_STORAGE_KEY = 'wanwan_aiw_storage_cache_v1';

  var KEYS = {
    PROFILE: 'aiw_profile',
    PERSONALIZATION: 'aiw_personalization',
    APPEARANCE: 'aiw_appearance',
    GENERAL: 'aiw_general',
    PRESET_IDS: 'aiw_preset_ids',
    PRESET_PREFIX: 'aiw_preset:',
    PRESETS_INIT: 'aiw_presets_initialized',
    DEFAULT_PRESET_ID: 'aiw_default_preset_id',
    API_CONFIG: 'aiw_api_config',
    SUMMARY_API_CONFIG: 'aiw_summary_api_config',
    API_PRESETS: 'aiw_api_presets',
    SELECTED_MODEL: 'aiw_selected_model',
    CHAT_IDS: 'aiw_chat_ids',
    CHAT_PREFIX: 'aiw_chat:',
    MEMORY_SETTINGS: 'aiw_memory_settings',
    MEMORY_IDS: 'aiw_memory_ids',
    MEMORY_PREFIX: 'aiw_memory:',
    MEMORY_TASKS: 'aiw_memory_tasks',
    DELETED_MEMORY_SIGS: 'aiw_deleted_memory_sigs',
    WORLDBOOK_IDS: 'aiw_worldbook_ids',
    WORLDBOOK_PREFIX: 'aiw_worldbook:',
    FAVORITES: 'aiw_favorites'
  };

  var MEMORY_STRATEGY_PRESETS = {
    natural: {
      id: 'natural',
      label: '自然 · 推荐',
      summary: '兼顾上下文连贯与开销控制，适合日常绝大多数对话',
      summaryTriggerChars: 3200,
      recentRawMessagesLimit: 20,
      maxMemoryRecallCount: 5,
      maxSingleMemoryLength: 260
    },
    token_saver: {
      id: 'token_saver',
      label: '省 Token',
      summary: '更早触发阶段摘要并精简近期原文与记忆召回条数，减少上下文占用',
      summaryTriggerChars: 1400,
      recentRawMessagesLimit: 8,
      maxMemoryRecallCount: 2,
      maxSingleMemoryLength: 140
    },
    recall_more: {
      id: 'recall_more',
      label: '记得更多',
      summary: '保留更多近期原始消息与历史记忆召回条数，适合复杂长程协作',
      summaryTriggerChars: 5600,
      recentRawMessagesLimit: 32,
      maxMemoryRecallCount: 8,
      maxSingleMemoryLength: 380
    }
  };

  var MEMORY_SETTING_BOUNDS = {
    summaryTriggerChars: { min: 400, max: 12000, def: 3200 },
    recentRawMessagesLimit: { min: 2, max: 60, def: 20 },
    summaryIntervalMessages: { min: 4, max: 100, def: 20 },
    summaryMergeThreshold: { min: 2, max: 30, def: 10 },
    maxMemoryRecallCount: { min: 1, max: 12, def: 5 },
    maxSingleMemoryLength: { min: 60, max: 500, def: 260 }
  };

  var MAX_CUSTOM_SUMMARY_PROMPT_LENGTH = 1000;

  var DEFAULT_MEMORY_SETTINGS = {
    shortTermContext: true,
    autoSummary: true,
    summaryModelMode: 'follow_chat',
    customSummaryPrompt: '',
    summaryReadWorldBook: false,
    crossChatMemory: true,
    useMemory: true,
    autoMemory: true,
    referenceHistoryChats: true,
    strategy: 'natural',
    summaryTriggerChars: 3200,
    recentRawMessagesLimit: 20,
    summaryIntervalMessages: 20,
    summaryMergeThreshold: 10,
    maxMemoryRecallCount: 5,
    maxSingleMemoryLength: 260,
    updatedAt: 0
  };

  var MEMORY_CATEGORIES = ['偏好', '习惯', '长期计划', '项目', '决定', '备忘', '身份信息'];
  var MEMORY_SCOPES = ['user', 'chat', 'project'];

  var ACCENT_PRESETS = [
    { id: 'pink', label: '粉色', color: '#ec4899' },
    { id: 'coral', label: '珊瑚红', color: '#e11d48' },
    { id: 'blue', label: '晴空蓝', color: '#2563eb' },
    { id: 'green', label: '鼠尾草', color: '#059669' },
    { id: 'amber', label: '琥珀金', color: '#d97706' },
    { id: 'ink', label: '极简黑', color: '#27272a' }
  ];

  var DEFAULT_PERSONALIZATION = {
    enabled: true,
    customInstructions: '',
    tone: '温和自然',
    detailLevel: '适中',
    userPreferences: '',
    updatedAt: 0
  };

  var DEFAULT_APPEARANCE = {
    mode: 'system',
    accent: 'pink',
    updatedAt: 0
  };

  var DEFAULT_GENERAL = {
    enterToSend: true,
    autoUseDefaultPreset: true,
    showCharCount: true,
    updatedAt: 0
  };

  var DEFAULT_STARTER_PRESETS = [
    {
      id: 'preset_zhiyu_general',
      name: '知屿 · 通用助手',
      avatarType: 'icon',
      avatarValue: 'fa-solid fa-wand-magic-sparkles',
      description: '温和可靠的全能伙伴，适合日常问答、梳理想法与轻度创作。',
      systemPrompt: '你是「知屿」，弯弯机工作空间中的个人 AI 助手。请以清晰、真诚、富有条理的方式回应用户的提问；在必要时先给出结论，再补充关键步骤与温和的建议。',
      replyStyle: '温和自然',
      detailLevel: '适中',
      isDefault: true
    },
    {
      id: 'preset_zhiyu_writer',
      name: '文字润色与创作编辑',
      avatarType: 'icon',
      avatarValue: 'fa-solid fa-feather-pointed',
      description: '擅长长文润色、结构重排、情绪表达与多种文风改写。',
      systemPrompt: '你是一位审美细腻、文字功底扎实的中文编辑。请帮助用户打磨文稿结构、提炼核心表达并优化语感；在修改时保留作者原本的情绪与个人风格，避免空洞套话。',
      replyStyle: '细腻陪伴',
      detailLevel: '详尽',
      isDefault: false
    },
    {
      id: 'preset_zhiyu_planner',
      name: '冷静结构化顾问',
      avatarType: 'icon',
      avatarValue: 'fa-solid fa-compass',
      description: '聚焦逻辑拆解、计划制定与高效决策，结论直截了当。',
      systemPrompt: '你是一位严谨冷静的结构化顾问。面对复杂问题时，请帮助用户拆解目标、识别关键约束与风险，并给出可执行、分优先级的行动清单。',
      replyStyle: '专业严谨',
      detailLevel: '精简',
      isDefault: false
    }
  ];

  function deepClone(obj) {
    if (obj === undefined || obj === null) return obj;
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (_) {
      return Object.assign({}, obj);
    }
  }

  function generatePresetId() {
    return 'preset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function readLocalCache() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(CACHE_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeLocalCacheKey(key, value) {
    try {
      if (!global.localStorage) return;
      var cache = readLocalCache();
      if (value === undefined) {
        delete cache[key];
      } else {
        cache[key] = value;
      }
      global.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
    } catch (_) {}
  }

  async function waitForConfigDB(timeoutMs) {
    if (global.db && global.db.config) return global.db;
    var maxWait = typeof timeoutMs === 'number' ? timeoutMs : 1200;
    var started = Date.now();
    while (Date.now() - started < maxWait) {
      if (global.db && global.db.config) return global.db;
      await new Promise(function(resolve) { setTimeout(resolve, 40); });
    }
    return (global.db && global.db.config) ? global.db : null;
  }

  async function dbGetConfig(key) {
    var dbRef = await waitForConfigDB(600);
    if (dbRef && dbRef.config) {
      try {
        var op = function() { return dbRef.config.get(key); };
        var row = typeof global.runWanWanDBRead === 'function'
          ? await global.runWanWanDBRead(op)
          : await op();
        if (row && row.value !== undefined) {
          writeLocalCacheKey(key, row.value);
          return deepClone(row.value);
        }
      } catch (err) {
        console.warn('[AiWorkspaceStorage] dbGetConfig fallback to cache:', key, err);
      }
    }
    var cache = readLocalCache();
    return cache[key] !== undefined ? deepClone(cache[key]) : undefined;
  }

  async function dbPutConfig(key, value) {
    var payload = deepClone(value);
    writeLocalCacheKey(key, payload);
    var dbRef = await waitForConfigDB(1200);
    if (dbRef && dbRef.config) {
      var op = function() {
        return dbRef.config.put({ key: key, value: payload });
      };
      if (typeof global.runWanWanDBIdempotentWrite === 'function') {
        await global.runWanWanDBIdempotentWrite(op);
      } else {
        await op();
      }
    }
    return payload;
  }

  async function dbDeleteConfig(key) {
    writeLocalCacheKey(key, undefined);
    var dbRef = await waitForConfigDB(1200);
    if (dbRef && dbRef.config) {
      var op = function() {
        return dbRef.config.delete(key);
      };
      if (typeof global.runWanWanDBIdempotentWrite === 'function') {
        await global.runWanWanDBIdempotentWrite(op);
      } else {
        await op();
      }
    }
  }

  // ===== 1. 个人资料（优先读取 aiw_profile，兜底只读 db.characters 用户记录） =====
  async function getMainUserFallback() {
    var fallback = { name: '我', avatar: 'img/ava-00.jpg', bio: '本地工作空间' };
    try {
      var dbRef = await waitForConfigDB(500);
      if (!dbRef || !dbRef.characters) return fallback;
      var op = function() {
        return dbRef.characters.where('type').equals('user').first();
      };
      var user = typeof global.runWanWanDBRead === 'function'
        ? await global.runWanWanDBRead(op)
        : await op();
      if (user) {
        fallback.name = String(user.name || user.nick || '我');
        fallback.avatar = String(user.avatar || 'img/ava-00.jpg');
      }
    } catch (_) {}
    return fallback;
  }

  async function getProfile() {
    var saved = await dbGetConfig(KEYS.PROFILE);
    var base = await getMainUserFallback();
    if (!saved || typeof saved !== 'object') {
      return Object.assign({}, base, { updatedAt: 0 });
    }
    return {
      name: String(saved.name || base.name || '我').trim() || '我',
      avatar: String(saved.avatar || base.avatar || 'img/ava-00.jpg'),
      bio: saved.bio != null ? String(saved.bio) : base.bio,
      updatedAt: Number(saved.updatedAt) || 0
    };
  }

  async function saveProfile(patch) {
    var current = await getProfile();
    var next = {
      name: String((patch && patch.name != null ? patch.name : current.name) || '我').trim() || '我',
      avatar: String((patch && patch.avatar != null ? patch.avatar : current.avatar) || 'img/ava-00.jpg'),
      bio: patch && patch.bio != null ? String(patch.bio).trim() : (current.bio || ''),
      updatedAt: Date.now()
    };
    return await dbPutConfig(KEYS.PROFILE, next);
  }

  // ===== 2. 个性化设置 =====
  async function getPersonalization() {
    var saved = await dbGetConfig(KEYS.PERSONALIZATION);
    return Object.assign({}, DEFAULT_PERSONALIZATION, saved && typeof saved === 'object' ? saved : {});
  }

  async function savePersonalization(patch) {
    var current = await getPersonalization();
    var next = {
      enabled: patch && typeof patch.enabled === 'boolean' ? patch.enabled : !!current.enabled,
      customInstructions: patch && patch.customInstructions != null ? String(patch.customInstructions) : current.customInstructions,
      tone: patch && patch.tone != null ? String(patch.tone) : current.tone,
      detailLevel: patch && patch.detailLevel != null ? String(patch.detailLevel) : current.detailLevel,
      userPreferences: patch && patch.userPreferences != null ? String(patch.userPreferences) : current.userPreferences,
      updatedAt: Date.now()
    };
    return await dbPutConfig(KEYS.PERSONALIZATION, next);
  }

  // ===== 3. 外观设置 =====
  async function getAppearance() {
    var saved = await dbGetConfig(KEYS.APPEARANCE);
    var merged = Object.assign({}, DEFAULT_APPEARANCE, saved && typeof saved === 'object' ? saved : {});
    if (['system', 'light', 'dark'].indexOf(merged.mode) === -1) merged.mode = 'system';
    var validAccent = ACCENT_PRESETS.some(function(a) { return a.id === merged.accent; });
    if (!validAccent) merged.accent = 'pink';
    return merged;
  }

  async function saveAppearance(patch) {
    var current = await getAppearance();
    var mode = patch && patch.mode ? String(patch.mode) : current.mode;
    if (['system', 'light', 'dark'].indexOf(mode) === -1) mode = 'system';
    var accent = patch && patch.accent ? String(patch.accent) : current.accent;
    if (!ACCENT_PRESETS.some(function(a) { return a.id === accent; })) accent = 'pink';
    var next = {
      mode: mode,
      accent: accent,
      updatedAt: Date.now()
    };
    return await dbPutConfig(KEYS.APPEARANCE, next);
  }

  // ===== 4. 常规设置 =====
  async function getGeneralSettings() {
    var saved = await dbGetConfig(KEYS.GENERAL);
    return Object.assign({}, DEFAULT_GENERAL, saved && typeof saved === 'object' ? saved : {});
  }

  async function saveGeneralSettings(patch) {
    var current = await getGeneralSettings();
    var next = {
      enterToSend: patch && typeof patch.enterToSend === 'boolean' ? patch.enterToSend : !!current.enterToSend,
      autoUseDefaultPreset: patch && typeof patch.autoUseDefaultPreset === 'boolean' ? patch.autoUseDefaultPreset : !!current.autoUseDefaultPreset,
      showCharCount: patch && typeof patch.showCharCount === 'boolean' ? patch.showCharCount : !!current.showCharCount,
      updatedAt: Date.now()
    };
    return await dbPutConfig(KEYS.GENERAL, next);
  }

  // ===== 5. 预设与提示词中心（每个预设独立存储于 db.config: 'aiw_preset:<id>'） =====
  function normalizeWorldBookIdList(raw) {
    if (!Array.isArray(raw)) return [];
    var seen = {};
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var id = String(raw[i] == null ? '' : raw[i]).trim();
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  function normalizePreset(raw, forcedId) {
    var now = Date.now();
    var id = String(forcedId || (raw && raw.id) || generatePresetId());
    return {
      id: id,
      name: String((raw && raw.name) || '未命名预设').trim() || '未命名预设',
      avatarType: (raw && raw.avatarType === 'image') ? 'image' : 'icon',
      avatarValue: String((raw && raw.avatarValue) || 'fa-solid fa-wand-magic-sparkles'),
      description: raw && raw.description != null ? String(raw.description) : '',
      systemPrompt: raw && raw.systemPrompt != null ? String(raw.systemPrompt) : '',
      replyStyle: String((raw && raw.replyStyle) || '温和自然'),
      detailLevel: ['精简', '适中', '详尽'].indexOf(raw && raw.detailLevel) !== -1 ? raw.detailLevel : '适中',
      isDefault: !!(raw && raw.isDefault),
      worldBookIds: normalizeWorldBookIdList(raw && raw.worldBookIds),
      createdAt: Number(raw && raw.createdAt) || now,
      updatedAt: Number(raw && raw.updatedAt) || now
    };
  }

  async function ensureStarterPresetsInitialized() {
    var initialized = await dbGetConfig(KEYS.PRESETS_INIT);
    if (initialized === true) return;

    var existingIds = await dbGetConfig(KEYS.PRESET_IDS);
    if (Array.isArray(existingIds) && existingIds.length > 0) {
      await dbPutConfig(KEYS.PRESETS_INIT, true);
      return;
    }

    var ids = [];
    var defaultId = '';
    for (var i = 0; i < DEFAULT_STARTER_PRESETS.length; i++) {
      var item = normalizePreset(DEFAULT_STARTER_PRESETS[i], DEFAULT_STARTER_PRESETS[i].id);
      await dbPutConfig(KEYS.PRESET_PREFIX + item.id, item);
      ids.push(item.id);
      if (item.isDefault) defaultId = item.id;
    }
    await dbPutConfig(KEYS.PRESET_IDS, ids);
    if (defaultId) {
      await dbPutConfig(KEYS.DEFAULT_PRESET_ID, defaultId);
    }
    await dbPutConfig(KEYS.PRESETS_INIT, true);
  }

  async function listPresets() {
    await ensureStarterPresetsInitialized();
    var ids = await dbGetConfig(KEYS.PRESET_IDS);
    if (!Array.isArray(ids)) ids = [];
    var defaultId = await dbGetConfig(KEYS.DEFAULT_PRESET_ID);

    var presets = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var item = await dbGetConfig(KEYS.PRESET_PREFIX + id);
      if (item && typeof item === 'object') {
        var norm = normalizePreset(item, id);
        if (defaultId) {
          norm.isDefault = norm.id === defaultId;
        }
        presets.push(norm);
      }
    }
    return presets;
  }

  async function getPreset(id) {
    if (!id) return null;
    await ensureStarterPresetsInitialized();
    var item = await dbGetConfig(KEYS.PRESET_PREFIX + id);
    if (!item || typeof item !== 'object') return null;
    var defaultId = await dbGetConfig(KEYS.DEFAULT_PRESET_ID);
    var norm = normalizePreset(item, id);
    if (defaultId) norm.isDefault = norm.id === defaultId;
    return norm;
  }

  async function getDefaultPreset() {
    var list = await listPresets();
    if (!list.length) return null;
    var found = list.find(function(p) { return p.isDefault; });
    return found || list[0];
  }

  async function setDefaultPreset(id) {
    var presets = await listPresets();
    var target = presets.find(function(p) { return p.id === id; });
    if (!target) return null;

    for (var i = 0; i < presets.length; i++) {
      var item = presets[i];
      var shouldBeDefault = item.id === id;
      if (item.isDefault !== shouldBeDefault) {
        item.isDefault = shouldBeDefault;
        item.updatedAt = Date.now();
        await dbPutConfig(KEYS.PRESET_PREFIX + item.id, item);
      }
    }
    await dbPutConfig(KEYS.DEFAULT_PRESET_ID, id);
    target.isDefault = true;
    return target;
  }

  async function createPreset(data) {
    await ensureStarterPresetsInitialized();
    var ids = await dbGetConfig(KEYS.PRESET_IDS);
    if (!Array.isArray(ids)) ids = [];

    var now = Date.now();
    var preset = normalizePreset(Object.assign({}, data || {}, {
      id: generatePresetId(),
      createdAt: now,
      updatedAt: now
    }));

    // 若目前没有任何预设，自动将新建的设为默认，或尊重显式指定
    if (ids.length === 0 && data && data.isDefault !== false) {
      preset.isDefault = true;
    }

    await dbPutConfig(KEYS.PRESET_PREFIX + preset.id, preset);
    ids.unshift(preset.id);
    await dbPutConfig(KEYS.PRESET_IDS, ids);

    if (preset.isDefault) {
      await setDefaultPreset(preset.id);
    }
    return preset;
  }

  async function updatePreset(id, patch) {
    if (!id) return null;
    var existing = await getPreset(id);
    if (!existing) return null;

    var updated = normalizePreset(Object.assign({}, existing, patch || {}, {
      id: id,
      createdAt: existing.createdAt,
      updatedAt: Date.now()
    }), id);

    await dbPutConfig(KEYS.PRESET_PREFIX + id, updated);

    if (patch && typeof patch.isDefault === 'boolean') {
      if (patch.isDefault) {
        await setDefaultPreset(id);
      } else {
        var currentDef = await dbGetConfig(KEYS.DEFAULT_PRESET_ID);
        if (currentDef === id) {
          await dbPutConfig(KEYS.DEFAULT_PRESET_ID, '');
        }
      }
    }
    return await getPreset(id);
  }

  async function duplicatePreset(id) {
    var src = await getPreset(id);
    if (!src) return null;
    var copyData = deepClone(src);
    copyData.name = src.name + '（副本）';
    copyData.isDefault = false;
    delete copyData.id;
    return await createPreset(copyData);
  }

  async function deletePreset(id) {
    if (!id) return false;
    await ensureStarterPresetsInitialized();
    var ids = await dbGetConfig(KEYS.PRESET_IDS);
    if (!Array.isArray(ids)) ids = [];

    var idx = ids.indexOf(id);
    if (idx === -1) return false;

    ids.splice(idx, 1);
    await dbDeleteConfig(KEYS.PRESET_PREFIX + id);
    await dbPutConfig(KEYS.PRESET_IDS, ids);

    var currentDef = await dbGetConfig(KEYS.DEFAULT_PRESET_ID);
    if (currentDef === id) {
      if (ids.length > 0) {
        await setDefaultPreset(ids[0]);
      } else {
        await dbPutConfig(KEYS.DEFAULT_PRESET_ID, '');
      }
    }
    return true;
  }

  // ===== 6. 提示词与预设导入/导出解析 =====
  function buildPresetExportJson(preset) {
    var p = normalizePreset(preset, preset && preset.id);
    return JSON.stringify({
      format: 'wanwan-aiw-preset',
      version: 1,
      exportedAt: new Date().toISOString(),
      preset: {
        name: p.name,
        avatarType: p.avatarType,
        avatarValue: p.avatarValue,
        description: p.description,
        systemPrompt: p.systemPrompt,
        replyStyle: p.replyStyle,
        detailLevel: p.detailLevel,
        worldBookIds: p.worldBookIds
      }
    }, null, 2);
  }

  function parseImportedPromptPayload(rawText, fileName) {
    var text = String(rawText == null ? '' : rawText).trim();
    if (!text) return null;

    // 尝试 JSON 解析（支持完整预设包或普通 JSON 对象）
    if (text.charAt(0) === '{') {
      try {
        var obj = JSON.parse(text);
        var src = obj && obj.preset && typeof obj.preset === 'object' ? obj.preset : obj;
        if (src && (typeof src.systemPrompt === 'string' || typeof src.prompt === 'string' || typeof src.name === 'string')) {
          return {
            kind: 'preset',
            preset: {
              name: String(src.name || '').trim() || '导入的预设',
              avatarType: src.avatarType === 'image' ? 'image' : 'icon',
              avatarValue: String(src.avatarValue || 'fa-solid fa-wand-magic-sparkles'),
              description: String(src.description || ''),
              systemPrompt: String(src.systemPrompt != null ? src.systemPrompt : (src.prompt || '')),
              replyStyle: String(src.replyStyle || '温和自然'),
              detailLevel: ['精简', '适中', '详尽'].indexOf(src.detailLevel) !== -1 ? src.detailLevel : '适中',
              worldBookIds: normalizeWorldBookIdList(src.worldBookIds)
            }
          };
        }
      } catch (_) {
        // 回退按纯文本提示词导入
      }
    }

    var fallbackName = fileName ? String(fileName).replace(/\.[^/.]+$/, '').trim() : '';
    return {
      kind: 'prompt',
      name: fallbackName || '导入的提示词',
      systemPrompt: text
    };
  }

  // ===== 7. 知屿专属 API 配置（与弯弯机主 API 完全隔离，不写入 apiBaseUrl/apiKey/apiModel） =====
  function normalizeBaseUrl(url) {
    return String(url == null ? '' : url).trim().replace(/\/+$/, '');
  }

  function normalizeTemperature(val, fallback) {
    var num = Number(val);
    if (!Number.isFinite(num)) return typeof fallback === 'number' ? fallback : 0.7;
    if (num < 0) num = 0;
    if (num > 2) num = 2;
    return Math.round(num * 100) / 100;
  }

  function isCustomApiComplete(cfg) {
    if (!cfg || typeof cfg !== 'object') return false;
    return !!(
      normalizeBaseUrl(cfg.baseUrl || cfg.url) &&
      String(cfg.apiKey || cfg.key || '').trim() &&
      String(cfg.model || '').trim()
    );
  }

  async function getCustomApiConfig() {
    var saved = await dbGetConfig(KEYS.API_CONFIG);
    var src = saved && typeof saved === 'object' ? saved : {};
    var normalized = {
      baseUrl: normalizeBaseUrl(src.baseUrl || src.url || ''),
      apiKey: String(src.apiKey || src.key || '').trim(),
      model: String(src.model || '').trim(),
      fetchedModels: Array.isArray(src.fetchedModels) ? src.fetchedModels.filter(Boolean).map(String) : [],
      temperature: normalizeTemperature(src.temperature, 0.7),
      updatedAt: Number(src.updatedAt) || 0
    };
    normalized.complete = isCustomApiComplete(normalized);
    return normalized;
  }

  async function saveCustomApiConfig(patch) {
    var current = await getCustomApiConfig();
    var p = patch && typeof patch === 'object' ? patch : {};
    var next = {
      baseUrl: p.baseUrl !== undefined ? normalizeBaseUrl(p.baseUrl) : current.baseUrl,
      apiKey: p.apiKey !== undefined ? String(p.apiKey || '').trim() : current.apiKey,
      model: p.model !== undefined ? String(p.model || '').trim() : current.model,
      fetchedModels: Array.isArray(p.fetchedModels)
        ? p.fetchedModels.filter(Boolean).map(String)
        : current.fetchedModels,
      temperature: p.temperature !== undefined
        ? normalizeTemperature(p.temperature, 0.7)
        : current.temperature,
      updatedAt: Date.now()
    };
    next.complete = isCustomApiComplete(next);
    await dbPutConfig(KEYS.API_CONFIG, next);
    return next;
  }

  async function clearCustomApiConfig() {
    var empty = {
      baseUrl: '',
      apiKey: '',
      model: '',
      fetchedModels: [],
      temperature: 0.7,
      updatedAt: Date.now(),
      complete: false
    };
    await dbDeleteConfig(KEYS.API_CONFIG);
    return empty;
  }

  // ===== 7B. 知屿独立摘要模型配置（复用现有 API 校验与 db.config 存储，与 KEYS.API_CONFIG 相互隔离） =====
  function isSummaryApiComplete(cfg) {
    return isCustomApiComplete(cfg);
  }

  async function getSummaryApiConfig() {
    var saved = await dbGetConfig(KEYS.SUMMARY_API_CONFIG);
    var src = saved && typeof saved === 'object' ? saved : {};
    var normalized = {
      baseUrl: normalizeBaseUrl(src.baseUrl || src.url || ''),
      apiKey: String(src.apiKey || src.key || '').trim(),
      model: String(src.model || '').trim(),
      temperature: normalizeTemperature(src.temperature, 0.1),
      updatedAt: Number(src.updatedAt) || 0
    };
    normalized.complete = isSummaryApiComplete(normalized);
    return normalized;
  }

  async function saveSummaryApiConfig(patch) {
    var current = await getSummaryApiConfig();
    var p = patch && typeof patch === 'object' ? patch : {};
    var nextApiKey = current.apiKey;
    if (p.clearApiKey === true) {
      nextApiKey = '';
    } else if (p.apiKey !== undefined) {
      nextApiKey = String(p.apiKey || '').trim();
    }
    var next = {
      baseUrl: p.baseUrl !== undefined ? normalizeBaseUrl(p.baseUrl) : current.baseUrl,
      apiKey: nextApiKey,
      model: p.model !== undefined ? String(p.model || '').trim() : current.model,
      temperature: p.temperature !== undefined
        ? normalizeTemperature(p.temperature, 0.1)
        : current.temperature,
      updatedAt: Date.now()
    };
    next.complete = isSummaryApiComplete(next);
    await dbPutConfig(KEYS.SUMMARY_API_CONFIG, next);
    return next;
  }

  async function clearSummaryApiConfig() {
    var empty = {
      baseUrl: '',
      apiKey: '',
      model: '',
      temperature: 0.1,
      updatedAt: Date.now(),
      complete: false
    };
    await dbDeleteConfig(KEYS.SUMMARY_API_CONFIG);
    return empty;
  }

  // ===== 7C. 知屿专属 API 预设管理（独立存储在 aiw_api_presets，不影响弯弯机全局 apiPresets） =====
  function generateApiPresetId() {
    return 'ap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function normalizeApiPresetRecord(raw, fallbackId) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var id = String(src.id || fallbackId || generateApiPresetId()).trim() || generateApiPresetId();
    var name = String(src.name || '').trim();
    var baseUrl = normalizeBaseUrl(src.baseUrl || src.url || '');
    var apiKey = String(src.apiKey || src.key || '').trim();
    var model = String(src.model || '').trim();
    var fetchedModels = Array.isArray(src.fetchedModels)
      ? src.fetchedModels.filter(Boolean).map(function(m) { return String(m).trim(); }).filter(Boolean)
      : [];
    if (model && fetchedModels.indexOf(model) === -1) {
      fetchedModels.unshift(model);
    }
    var temperature = normalizeTemperature(src.temperature, 0.7);
    var now = Date.now();
    return {
      id: id,
      name: name,
      baseUrl: baseUrl,
      apiKey: apiKey,
      model: model,
      fetchedModels: fetchedModels,
      temperature: temperature,
      createdAt: Number(src.createdAt) || now,
      updatedAt: Number(src.updatedAt) || Number(src.createdAt) || now
    };
  }

  function buildApiPresetDedupKey(preset) {
    if (!preset || typeof preset !== 'object') return '';
    return [
      String(preset.name || '').trim().toLowerCase(),
      normalizeBaseUrl(preset.baseUrl || preset.url || '').toLowerCase(),
      String(preset.model || '').trim().toLowerCase(),
      String(preset.apiKey || preset.key || '').trim()
    ].join('::');
  }

  async function listApiPresets() {
    var saved = await dbGetConfig(KEYS.API_PRESETS);
    if (!Array.isArray(saved)) return [];
    var seen = {};
    var result = [];
    for (var i = 0; i < saved.length; i++) {
      var item = saved[i];
      if (!item || typeof item !== 'object') continue;
      var norm = normalizeApiPresetRecord(item, item.id);
      if (!norm.name || seen[norm.id]) continue;
      seen[norm.id] = true;
      result.push(norm);
    }
    return result;
  }

  async function saveApiPreset(input) {
    var src = input && typeof input === 'object' ? input : {};
    var name = String(src.name || '').trim();
    if (!name) {
      throw new Error('请输入预设名称');
    }
    var baseUrl = normalizeBaseUrl(src.baseUrl || src.url || '');
    var apiKey = String(src.apiKey || src.key || '').trim();
    var model = String(src.model || '').trim();
    if (!baseUrl || !apiKey || !model) {
      throw new Error('请填写完整的 Base URL、API Key 和模型名称');
    }

    var list = await listApiPresets();
    var targetId = String(src.id || '').trim();
    var idx = -1;
    if (targetId) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === targetId) {
          idx = i;
          break;
        }
      }
    }

    var now = Date.now();
    var savedItem = normalizeApiPresetRecord({
      id: idx >= 0 ? list[idx].id : generateApiPresetId(),
      name: name,
      baseUrl: baseUrl,
      apiKey: apiKey,
      model: model,
      fetchedModels: Array.isArray(src.fetchedModels) ? src.fetchedModels : (idx >= 0 ? list[idx].fetchedModels : []),
      temperature: src.temperature !== undefined ? src.temperature : (idx >= 0 ? list[idx].temperature : 0.7),
      createdAt: idx >= 0 ? list[idx].createdAt : now,
      updatedAt: now
    });

    if (idx >= 0) {
      list[idx] = savedItem;
    } else {
      list.push(savedItem);
    }
    await dbPutConfig(KEYS.API_PRESETS, list);
    return deepClone(savedItem);
  }

  async function deleteApiPreset(presetId) {
    var targetId = String(presetId || '').trim();
    var list = await listApiPresets();
    if (!targetId) return false;
    var nextList = list.filter(function(item) { return item.id !== targetId; });
    if (nextList.length === list.length) return false;
    await dbPutConfig(KEYS.API_PRESETS, nextList);
    return true;
  }

  // ===== 8. 知屿记住的模型选择（仅作用于知屿，不影响其他应用） =====
  async function getSelectedModel() {
    var saved = await dbGetConfig(KEYS.SELECTED_MODEL);
    if (saved && typeof saved === 'object') {
      return String(saved.model || '').trim();
    }
    return typeof saved === 'string' ? saved.trim() : '';
  }

  async function saveSelectedModel(modelName) {
    var clean = String(modelName || '').trim();
    await dbPutConfig(KEYS.SELECTED_MODEL, {
      model: clean,
      updatedAt: Date.now()
    });
    return clean;
  }

  // ===== 9. 独立聊天历史记录（存储于 aiw_chat_ids / aiw_chat:<id>，绝不混入 db.chats/db.messages） =====
  function generateChatId() {
    return 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function generateMessageId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function buildPresetSnapshot(preset) {
    if (!preset || typeof preset !== 'object') return null;
    return {
      id: String(preset.id || ''),
      name: String(preset.name || '未命名预设'),
      avatarType: preset.avatarType === 'image' ? 'image' : 'icon',
      avatarValue: String(preset.avatarValue || 'fa-solid fa-wand-magic-sparkles'),
      description: String(preset.description || ''),
      systemPrompt: String(preset.systemPrompt || ''),
      replyStyle: String(preset.replyStyle || '温和自然'),
      detailLevel: ['精简', '适中', '详尽'].indexOf(preset.detailLevel) !== -1 ? preset.detailLevel : '适中',
      worldBookIds: normalizeWorldBookIdList(preset.worldBookIds),
      capturedAt: Number(preset.capturedAt) || Date.now()
    };
  }

  function generateChatTitle(firstText) {
    var clean = String(firstText || '')
      .replace(/\r?\n+/g, ' ')
      .replace(/^[#>*`\-\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return '新对话';
    if (clean.length <= 22) return clean;
    return clean.slice(0, 22) + '…';
  }

  function normalizeMessageQuote(rawQuote) {
    if (!rawQuote || typeof rawQuote !== 'object') return null;
    var qContent = String(rawQuote.content == null ? '' : rawQuote.content).trim();
    if (!qContent) return null;
    return {
      id: String(rawQuote.id || '').trim(),
      role: rawQuote.role === 'assistant' ? 'assistant' : 'user',
      content: qContent.slice(0, 600)
    };
  }

  function normalizeMessageTranslations(rawTrans) {
    if (!rawTrans || typeof rawTrans !== 'object' || Array.isArray(rawTrans)) return null;
    var out = {};
    var keys = Object.keys(rawTrans);
    var count = 0;
    for (var i = 0; i < keys.length && count < 12; i++) {
      var k = String(keys[i] || '').trim();
      if (!k || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      var item = rawTrans[k];
      if (!item || typeof item !== 'object') continue;
      var text = String(item.text == null ? '' : item.text).trim();
      if (!text) continue;
      out[k] = {
        lang: String(item.lang || k).trim() || k,
        langLabel: String(item.langLabel || k).trim() || k,
        text: text,
        model: item.model ? String(item.model).trim() : '',
        updatedAt: Number(item.updatedAt) || 0
      };
      count++;
    }
    return count > 0 ? out : null;
  }

  function normalizeChatMessage(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var role = src.role === 'assistant' || src.role === 'system' ? src.role : 'user';
    var msg = {
      id: String(src.id || generateMessageId()),
      role: role,
      content: String(src.content == null ? '' : src.content),
      createdAt: Number(src.createdAt) || Date.now(),
      model: src.model ? String(src.model) : '',
      error: src.error ? String(src.error) : '',
      aborted: !!src.aborted,
      deepThink: !!src.deepThink
    };
    var quote = normalizeMessageQuote(src.quote);
    if (quote) msg.quote = quote;
    var editedAt = Number(src.editedAt);
    if (Number.isFinite(editedAt) && editedAt > 0) msg.editedAt = editedAt;
    var translations = normalizeMessageTranslations(src.translations);
    if (translations) msg.translations = translations;
    return msg;
  }

  function normalizeSummarySegment(raw, idx) {
    if (!raw || typeof raw !== 'object') return null;
    var startIdx = Math.max(0, Math.floor(Number(raw.startMessageIndex) || 0));
    var endIdx = Math.max(startIdx, Math.floor(Number(raw.endMessageIndex) || startIdx));
    var status = String(raw.status || 'active').trim().toLowerCase();
    if (['active', 'merged', 'compacted'].indexOf(status) === -1) {
      status = 'active';
    }
    var content = String(raw.content || '').trim().slice(0, 1200);
    if (!content) return null;
    var id = String(raw.id || ('sumseg_' + startIdx + '_' + endIdx + '_' + (idx || 0))).trim();
    var mergedFromIds = Array.isArray(raw.mergedFromIds)
      ? raw.mergedFromIds.filter(Boolean).map(String)
      : [];
    var mergedFromIndices = Array.isArray(raw.mergedFromIndices)
      ? Array.from(new Set(raw.mergedFromIndices.map(function(n) {
          return Math.floor(Number(n) || 0);
        }).filter(function(n) { return n >= 1; }))).sort(function(a, b) { return a - b; })
      : [];
    var segmentNumber = Math.floor(Number(raw.segmentNumber) || 0);
    var mergedSourceCount = Math.floor(Number(raw.mergedSourceCount) || 0);
    var isManualWritten = !!(raw.isManualWritten || raw.source === 'manual_written' || id.indexOf('manual_') === 0);
    var source = String(raw.source || '').trim();
    if (!source) {
      if (isManualWritten) {
        source = 'manual_written';
      } else if (status === 'merged' || id.indexOf('summerge_') === 0) {
        source = 'merged';
      } else {
        source = 'ai';
      }
    }
    var updatedAt = Number(raw.updatedAt) || 0;
    var normalized = {
      id: id,
      startMessageIndex: startIdx,
      endMessageIndex: endIdx,
      content: content,
      createdAt: Number(raw.createdAt) || 0,
      status: status,
      source: source,
      isManualWritten: isManualWritten,
      mergedFromIds: mergedFromIds
    };
    if (segmentNumber >= 1) {
      normalized.segmentNumber = segmentNumber;
    }
    if (mergedFromIndices.length > 0) {
      normalized.mergedFromIndices = mergedFromIndices;
    }
    if (mergedSourceCount >= 1) {
      normalized.mergedSourceCount = mergedSourceCount;
    }
    if (updatedAt > 0) {
      normalized.updatedAt = updatedAt;
    }
    return normalized;
  }

  function normalizeChatRecord(raw, forcedId) {
    var now = Date.now();
    var src = raw && typeof raw === 'object' ? raw : {};
    var msgs = Array.isArray(src.messages) ? src.messages.map(normalizeChatMessage) : [];
    var segments = Array.isArray(src.summarySegments)
      ? src.summarySegments.map(normalizeSummarySegment).filter(Boolean)
      : [];
    return {
      id: String(forcedId || src.id || generateChatId()),
      title: String(src.title || '新对话').trim() || '新对话',
      pinned: !!src.pinned,
      messages: msgs,
      createdAt: Number(src.createdAt) || now,
      updatedAt: Number(src.updatedAt) || now,
      model: String(src.model || '').trim(),
      presetId: String(src.presetId || '').trim(),
      presetSnapshot: src.presetSnapshot ? buildPresetSnapshot(src.presetSnapshot) : null,
      projectId: String(src.projectId || '').trim(),
      branchedFromChatId: String(src.branchedFromChatId || '').trim(),
      branchedFromMessageId: String(src.branchedFromMessageId || '').trim(),
      summary: String(src.summary || '').trim(),
      summaryLegacyBase: String(src.summaryLegacyBase || '').trim(),
      summarySegments: segments,
      summaryUpToCount: Math.max(0, Number(src.summaryUpToCount) || 0),
      summaryUpdatedAt: Number(src.summaryUpdatedAt) || 0,
      lastMemoryMessageId: String(src.lastMemoryMessageId || '').trim()
    };
  }

  async function listChats() {
    var ids = await dbGetConfig(KEYS.CHAT_IDS);
    if (!Array.isArray(ids)) ids = [];
    var items = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var raw = await dbGetConfig(KEYS.CHAT_PREFIX + id);
      if (raw && typeof raw === 'object') {
        items.push(normalizeChatRecord(raw, id));
      }
    }
    items.sort(function(a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    return items;
  }

  async function getChat(id) {
    if (!id) return null;
    var raw = await dbGetConfig(KEYS.CHAT_PREFIX + id);
    if (!raw || typeof raw !== 'object') return null;
    return normalizeChatRecord(raw, id);
  }

  async function createChat(data) {
    var ids = await dbGetConfig(KEYS.CHAT_IDS);
    if (!Array.isArray(ids)) ids = [];
    var now = Date.now();
    var src = data && typeof data === 'object' ? data : {};
    var chat = normalizeChatRecord(Object.assign({}, src, {
      id: src.id || generateChatId(),
      createdAt: now,
      updatedAt: now
    }));
    await dbPutConfig(KEYS.CHAT_PREFIX + chat.id, chat);
    if (ids.indexOf(chat.id) === -1) {
      ids.unshift(chat.id);
      await dbPutConfig(KEYS.CHAT_IDS, ids);
    }
    return chat;
  }

  async function saveChat(chatData) {
    if (!chatData || !chatData.id) {
      return await createChat(chatData || {});
    }
    var existing = await getChat(chatData.id);
    if (!existing) {
      return await createChat(chatData);
    }
    var updated = normalizeChatRecord(Object.assign({}, existing, chatData, {
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Number(chatData.updatedAt) || Date.now()
    }), existing.id);
    await dbPutConfig(KEYS.CHAT_PREFIX + updated.id, updated);
    return updated;
  }

  async function renameChat(id, title) {
    var cleanTitle = String(title || '').trim();
    if (!id || !cleanTitle) return null;
    var chat = await getChat(id);
    if (!chat) return null;
    chat.title = cleanTitle.slice(0, 80);
    chat.updatedAt = Date.now();
    return await saveChat(chat);
  }

  async function togglePinChat(id) {
    if (!id) return null;
    var chat = await getChat(id);
    if (!chat) return null;
    chat.pinned = !chat.pinned;
    chat.updatedAt = Date.now();
    return await saveChat(chat);
  }

  async function deleteChat(id) {
    if (!id) return false;
    var ids = await dbGetConfig(KEYS.CHAT_IDS);
    if (!Array.isArray(ids)) ids = [];
    var idx = ids.indexOf(id);
    if (idx !== -1) {
      ids.splice(idx, 1);
      await dbPutConfig(KEYS.CHAT_IDS, ids);
    }
    await dbDeleteConfig(KEYS.CHAT_PREFIX + id);
    return true;
  }

  async function searchChats(query) {
    var list = await listChats();
    var q = String(query || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(function(chat) {
      if ((chat.title || '').toLowerCase().indexOf(q) !== -1) return true;
      return (chat.messages || []).some(function(m) {
        return String(m.content || '').toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  // ===== 9.5 独立消息收藏存储（aiw_favorites，持久化并纳入知屿完整备份） =====
  function generateFavoriteId() {
    return 'fav_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function normalizeFavoriteRecord(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var role = src.role === 'user' ? 'user' : 'assistant';
    return {
      id: String(src.id || generateFavoriteId()).trim(),
      chatId: String(src.chatId || '').trim(),
      chatTitle: String(src.chatTitle || '未命名对话').trim() || '未命名对话',
      messageId: String(src.messageId || '').trim(),
      role: role,
      content: String(src.content == null ? '' : src.content),
      model: String(src.model || '').trim(),
      messageCreatedAt: Number(src.messageCreatedAt) || 0,
      createdAt: Number(src.createdAt) || Date.now()
    };
  }

  function buildFavoriteLookupKey(chatId, messageId, role, content) {
    var cid = String(chatId || '').trim();
    var mid = String(messageId || '').trim();
    if (cid && mid) return 'cm:' + cid + '::' + mid;
    if (mid) return 'm:' + mid;
    return 'rc:' + (role === 'user' ? 'user' : 'assistant') + '::' + String(content || '').trim();
  }

  async function listFavorites() {
    var raw = await dbGetConfig(KEYS.FAVORITES);
    if (!Array.isArray(raw)) return [];
    var seen = {};
    var items = [];
    for (var i = 0; i < raw.length; i++) {
      if (!raw[i] || typeof raw[i] !== 'object') continue;
      var norm = normalizeFavoriteRecord(raw[i]);
      if (!norm.content.trim()) continue;
      var k = buildFavoriteLookupKey(norm.chatId, norm.messageId, norm.role, norm.content);
      if (seen[k]) continue;
      seen[k] = true;
      items.push(norm);
    }
    items.sort(function(a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    return items;
  }

  async function saveFavoritesList(list) {
    var arr = Array.isArray(list) ? list : [];
    await dbPutConfig(KEYS.FAVORITES, arr);
    return arr;
  }

  async function isMessageFavorited(chatId, messageId) {
    var cid = String(chatId || '').trim();
    var mid = String(messageId || '').trim();
    if (!mid) return false;
    var list = await listFavorites();
    return list.some(function(item) {
      if (cid && item.chatId) {
        return item.chatId === cid && item.messageId === mid;
      }
      return item.messageId === mid;
    });
  }

  async function addFavorite(data) {
    var norm = normalizeFavoriteRecord(data);
    if (!norm.content.trim()) return { added: false, item: null, favorites: await listFavorites() };
    var list = await listFavorites();
    var targetKey = buildFavoriteLookupKey(norm.chatId, norm.messageId, norm.role, norm.content);
    var existing = list.find(function(it) {
      return buildFavoriteLookupKey(it.chatId, it.messageId, it.role, it.content) === targetKey;
    });
    if (existing) {
      return { added: false, item: existing, favorites: list };
    }
    list.unshift(norm);
    await saveFavoritesList(list);
    return { added: true, item: norm, favorites: list };
  }

  async function removeFavoriteById(favId) {
    var cleanId = String(favId || '').trim();
    if (!cleanId) return { removed: false, favorites: await listFavorites() };
    var list = await listFavorites();
    var next = list.filter(function(it) { return it.id !== cleanId; });
    if (next.length !== list.length) {
      await saveFavoritesList(next);
      return { removed: true, favorites: next };
    }
    return { removed: false, favorites: list };
  }

  async function removeFavoriteByMessage(chatId, messageId) {
    var cid = String(chatId || '').trim();
    var mid = String(messageId || '').trim();
    if (!mid) return { removed: false, favorites: await listFavorites() };
    var list = await listFavorites();
    var next = list.filter(function(it) {
      if (cid && it.chatId) {
        return !(it.chatId === cid && it.messageId === mid);
      }
      return it.messageId !== mid;
    });
    if (next.length !== list.length) {
      await saveFavoritesList(next);
      return { removed: true, favorites: next };
    }
    return { removed: false, favorites: list };
  }

  async function toggleMessageFavorite(data) {
    var norm = normalizeFavoriteRecord(data);
    var list = await listFavorites();
    var targetKey = buildFavoriteLookupKey(norm.chatId, norm.messageId, norm.role, norm.content);
    var idx = list.findIndex(function(it) {
      if (norm.messageId && it.messageId === norm.messageId && (!norm.chatId || !it.chatId || it.chatId === norm.chatId)) {
        return true;
      }
      return buildFavoriteLookupKey(it.chatId, it.messageId, it.role, it.content) === targetKey;
    });
    if (idx !== -1) {
      list.splice(idx, 1);
      await saveFavoritesList(list);
      return { favorited: false, item: null, favorites: list };
    }
    if (!norm.content.trim()) {
      return { favorited: false, item: null, favorites: list };
    }
    list.unshift(norm);
    await saveFavoritesList(list);
    return { favorited: true, item: norm, favorites: list };
  }

  async function searchFavorites(query) {
    var list = await listFavorites();
    var q = String(query || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(function(item) {
      return (item.content || '').toLowerCase().indexOf(q) !== -1 ||
        (item.chatTitle || '').toLowerCase().indexOf(q) !== -1 ||
        (item.model || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  async function syncFavoriteMessageContent(chatId, messageId, nextContent, nextChatTitle) {
    var mid = String(messageId || '').trim();
    if (!mid) return false;
    var cid = String(chatId || '').trim();
    var list = await listFavorites();
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it.messageId === mid && (!cid || !it.chatId || it.chatId === cid)) {
        if (nextContent !== undefined && nextContent !== null) {
          it.content = String(nextContent);
        }
        if (nextChatTitle) {
          it.chatTitle = String(nextChatTitle);
        }
        changed = true;
      }
    }
    if (changed) await saveFavoritesList(list);
    return changed;
  }

  // ===== 10. 独立长期记忆存储（aiw_memory_ids / aiw_memory:<id>，绝不混入 db.memories） =====
  function generateMemoryId() {
    return 'mem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function normalizeMemoryCategory(cat) {
    var val = String(cat || '').trim();
    if (MEMORY_CATEGORIES.indexOf(val) !== -1) return val;
    if (/偏好|喜好|口味|风格/.test(val)) return '偏好';
    if (/习惯|作息|日常/.test(val)) return '习惯';
    if (/计划|目标|规划/.test(val)) return '长期计划';
    if (/项目|工作|开发|任务/.test(val)) return '项目';
    if (/决定|选择|约定/.test(val)) return '决定';
    if (/身份|职业|背景|个人/.test(val)) return '身份信息';
    return '备忘';
  }

  function normalizeMemoryScope(scope) {
    var val = String(scope || '').trim().toLowerCase();
    return MEMORY_SCOPES.indexOf(val) !== -1 ? val : 'user';
  }

  function normalizeImportance(val) {
    var n = Math.round(Number(val));
    if (!Number.isFinite(n)) return 3;
    return Math.max(1, Math.min(5, n));
  }

  function normalizeTemporalState(val, statusHint) {
    var v = String(val || '').trim().toLowerCase();
    if (['current', 'past', 'future_plan', 'completed', 'cancelled', 'paused'].indexOf(v) !== -1) return v;
    var st = String(statusHint || '').trim().toLowerCase();
    if (st === 'paused') return 'paused';
    if (st === 'historical') return 'past';
    if (st === 'completed') return 'completed';
    if (st === 'cancelled') return 'cancelled';
    return 'current';
  }

  function normalizeMemoryStatus(val, temporalState) {
    var v = String(val || '').trim().toLowerCase();
    if (['active', 'historical', 'completed', 'cancelled', 'paused'].indexOf(v) !== -1) return v;
    if (temporalState === 'paused') return 'paused';
    if (temporalState === 'past') return 'historical';
    if (temporalState === 'completed') return 'completed';
    if (temporalState === 'cancelled') return 'cancelled';
    return 'active';
  }

  function normalizeConfidenceValue(val) {
    if (val === undefined || val === null || val === '') return 0.85;
    var n = Number(val);
    if (!Number.isFinite(n)) return 0.85;
    if (n > 1 && n <= 100) n = n / 100;
    return Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
  }

  function normalizeConflictState(val) {
    var v = String(val || '').trim().toLowerCase();
    if (['none', 'superseded', 'pending_confirmation', 'temporary_override'].indexOf(v) !== -1) return v;
    return 'none';
  }

  function normalizeMemoryRelations(rawRelations, selfId) {
    if (!Array.isArray(rawRelations)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < rawRelations.length && out.length < 16; i++) {
      var r = rawRelations[i];
      if (!r || typeof r !== 'object') continue;
      var targetId = String(r.targetId || '').trim();
      if (!targetId || (selfId && targetId === selfId)) continue;
      var type = String(r.type || 'related_entity').trim() || 'related_entity';
      var key = targetId + ':' + type;
      if (seen[key]) continue;
      seen[key] = true;
      out.push({
        targetId: targetId,
        type: type,
        label: String(r.label || '').trim().slice(0, 32),
        reason: String(r.reason || '').trim().slice(0, 100),
        updatedAt: Number(r.updatedAt) || Date.now()
      });
    }
    return out;
  }

  function normalizeMergeRecords(rawRecords) {
    if (!Array.isArray(rawRecords)) return [];
    var out = [];
    for (var i = 0; i < rawRecords.length && out.length < 8; i++) {
      var rec = rawRecords[i];
      if (!rec || typeof rec !== 'object') continue;
      var mc = String(rec.mergedContent || '').trim();
      var re = String(rec.rawExpression || '').trim();
      if (!mc && !re) continue;
      out.push({
        mergedAt: Number(rec.mergedAt) || Date.now(),
        mergedContent: mc.slice(0, 260),
        rawExpression: re.slice(0, 260),
        sourceChatId: String(rec.sourceChatId || '').trim(),
        sourceChatTitle: String(rec.sourceChatTitle || '').trim().slice(0, 80),
        reason: String(rec.reason || '').trim().slice(0, 100)
      });
    }
    return out;
  }

  function normalizeSourceChats(rawList, fallbackChatId, fallbackChatTitle, fallbackTime) {
    var out = [];
    var seen = {};
    function pushItem(chatId, chatTitle, mentionedAt) {
      var cid = String(chatId || '').trim();
      var title = String(chatTitle || '').trim().slice(0, 80);
      if (!cid && !title) return;
      var key = cid || ('title:' + title);
      if (seen[key]) return;
      seen[key] = true;
      out.push({
        chatId: cid,
        chatTitle: title,
        mentionedAt: Number(mentionedAt) || Date.now()
      });
    }
    if (Array.isArray(rawList)) {
      for (var i = 0; i < rawList.length && out.length < 8; i++) {
        var it = rawList[i];
        if (it && typeof it === 'object') {
          pushItem(it.chatId, it.chatTitle, it.mentionedAt);
        }
      }
    }
    if (!out.length && (fallbackChatId || fallbackChatTitle)) {
      pushItem(fallbackChatId, fallbackChatTitle, fallbackTime);
    }
    return out;
  }

  function normalizeEntityList(rawEntities) {
    if (!Array.isArray(rawEntities)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < rawEntities.length && out.length < 12; i++) {
      var e = String(rawEntities[i] || '').trim().toLowerCase();
      if (!e || e.length < 2 || seen[e]) continue;
      seen[e] = true;
      out.push(e.slice(0, 40));
    }
    return out;
  }

  function computeDefaultDynamicScore(importance, status, archived) {
    var base = Math.max(1, Math.min(5, Number(importance) || 3)) * 18;
    if (status === 'cancelled') base -= 24;
    else if (status === 'completed') base -= 16;
    else if (status === 'historical') base -= 14;
    else if (status === 'paused') base -= 8;
    if (archived) base -= 10;
    return Math.max(5, Math.min(100, Math.round(base)));
  }

  function normalizeMemoryRecord(raw, forcedId) {
    var now = Date.now();
    var src = raw && typeof raw === 'object' ? raw : {};
    var id = String(forcedId || src.id || generateMemoryId());
    var temporalState = normalizeTemporalState(src.temporalState, src.status);
    var status = normalizeMemoryStatus(src.status, temporalState);
    var createdAt = Number(src.createdAt) || now;
    var mentionedAt = Number(src.mentionedAt) || createdAt;
    var importance = normalizeImportance(src.importance);
    var archived = src.archived === true;
    var historyList = Array.isArray(src.history) ? src.history.slice(0, 6).map(function(h) {
      if (!h || typeof h !== 'object') return null;
      var hc = String(h.content || '').trim();
      if (!hc) return null;
      return {
        content: hc.slice(0, 260),
        updatedAt: Number(h.updatedAt) || now,
        temporalState: normalizeTemporalState(h.temporalState, h.status),
        status: normalizeMemoryStatus(h.status, h.temporalState),
        reason: String(h.reason || '').trim().slice(0, 100)
      };
    }).filter(Boolean) : [];

    var conflictWithIds = Array.isArray(src.conflictWithIds)
      ? src.conflictWithIds.filter(function(cid) { return cid && String(cid) !== id; }).map(String).filter(function(v, idx, arr) { return arr.indexOf(v) === idx; }).slice(0, 8)
      : [];

    var rawDynScore = Number(src.dynamicScore);
    var dynamicScore = Number.isFinite(rawDynScore) && rawDynScore > 0
      ? Math.max(5, Math.min(100, Math.round(rawDynScore)))
      : computeDefaultDynamicScore(importance, status, archived);

    var sourceChatId = String(src.sourceChatId || '').trim();
    var sourceChatTitle = String(src.sourceChatTitle || '').trim();

    return {
      id: id,
      content: String(src.content || '').trim(),
      category: normalizeMemoryCategory(src.category),
      createdAt: createdAt,
      updatedAt: Number(src.updatedAt) || now,
      mentionedAt: mentionedAt,
      rawExpression: String(src.rawExpression || '').trim().slice(0, 260),
      sourceChatId: sourceChatId,
      sourceChatTitle: sourceChatTitle,
      sourceChats: normalizeSourceChats(src.sourceChats, sourceChatId, sourceChatTitle, mentionedAt),
      importance: importance,
      manualImportance: src.manualImportance === true,
      dynamicScore: dynamicScore,
      scope: normalizeMemoryScope(src.scope),
      userId: String(src.userId || 'local_user').trim() || 'local_user',
      projectId: String(src.projectId || '').trim(),
      confidence: normalizeConfidenceValue(src.confidence),
      temporalState: temporalState,
      status: status,
      archived: archived,
      archivedAt: archived ? (Number(src.archivedAt) || Number(src.updatedAt) || now) : 0,
      archiveReason: archived ? String(src.archiveReason || '').trim().slice(0, 140) : '',
      manualRestoredAt: archived ? 0 : (Number.isFinite(Number(src.manualRestoredAt)) ? Math.max(0, Math.floor(Number(src.manualRestoredAt))) : 0),
      scenario: String(src.scenario || '').trim().slice(0, 60),
      scenarioLabel: String(src.scenarioLabel || '').trim().slice(0, 40),
      conflictState: normalizeConflictState(src.conflictState),
      conflictWithIds: conflictWithIds,
      factType: String(src.factType || 'direct_fact').trim() || 'direct_fact',
      factSource: String(src.factSource || 'user_statement').trim() || 'user_statement',
      userConfirmed: src.userConfirmed === true,
      semanticKey: String(src.semanticKey || '').trim().slice(0, 120),
      relation: String(src.relation || 'new').trim() || 'new',
      supersedesId: String(src.supersedesId || '').trim(),
      supersededById: String(src.supersededById || '').trim(),
      previousContent: String(src.previousContent || '').trim().slice(0, 260),
      mentionCount: Math.max(1, Math.round(Number(src.mentionCount) || 1)),
      independentMentionCount: (Number.isFinite(Number(src.independentMentionCount)) && Number(src.independentMentionCount) >= 1)
        ? Math.max(1, Math.round(Number(src.independentMentionCount)))
        : 1,
      usageCount: Math.max(0, Math.round(Number(src.usageCount) || 0)),
      lastUsedAt: Math.max(0, Number(src.lastUsedAt) || 0),
      entities: normalizeEntityList(src.entities),
      relations: normalizeMemoryRelations(src.relations, id),
      mergeRecords: normalizeMergeRecords(src.mergeRecords),
      history: historyList
    };
  }

  function clampMemoryNumericSetting(key, rawVal, fallbackVal) {
    var spec = MEMORY_SETTING_BOUNDS[key];
    if (!spec) return Number(rawVal) || 0;
    var resolvedFallback = (typeof fallbackVal === 'number' && Number.isFinite(fallbackVal))
      ? Math.min(spec.max, Math.max(spec.min, Math.round(fallbackVal)))
      : spec.def;
    if (rawVal === undefined || rawVal === null || rawVal === '') {
      return resolvedFallback;
    }
    var n = Math.round(Number(rawVal));
    if (!Number.isFinite(n)) {
      return resolvedFallback;
    }
    if (n < spec.min) return spec.min;
    if (n > spec.max) return spec.max;
    return n;
  }

  function sanitizeMemorySettings(raw, base, options) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var prev = base && typeof base === 'object' ? base : DEFAULT_MEMORY_SETTINGS;
    var strategy = src.strategy != null ? String(src.strategy) : String(prev.strategy || 'natural');
    if (!MEMORY_STRATEGY_PRESETS[strategy]) strategy = 'natural';
    var allowIndependent = !!(options && options.summaryApiComplete === true);
    var rawSummaryModelMode = src.summaryModelMode != null ? String(src.summaryModelMode).trim() : String(prev.summaryModelMode || 'follow_chat');
    var summaryModelMode = (rawSummaryModelMode === 'independent' && allowIndependent)
      ? 'independent'
      : 'follow_chat';

    var rawCustomSummaryPrompt = src.customSummaryPrompt != null
      ? String(src.customSummaryPrompt)
      : String(prev.customSummaryPrompt || '');
    var customSummaryPrompt = rawCustomSummaryPrompt
      .replace(/\r\n/g, '\n')
      .trim()
      .slice(0, MAX_CUSTOM_SUMMARY_PROMPT_LENGTH);

    return {
      shortTermContext: typeof src.shortTermContext === 'boolean' ? src.shortTermContext : (prev.shortTermContext !== false),
      autoSummary: typeof src.autoSummary === 'boolean' ? src.autoSummary : (prev.autoSummary !== false),
      summaryModelMode: summaryModelMode,
      customSummaryPrompt: customSummaryPrompt,
      summaryReadWorldBook: false,
      crossChatMemory: typeof src.crossChatMemory === 'boolean' ? src.crossChatMemory : (prev.crossChatMemory !== false),
      useMemory: typeof src.useMemory === 'boolean' ? src.useMemory : (prev.useMemory !== false),
      autoMemory: typeof src.autoMemory === 'boolean' ? src.autoMemory : (prev.autoMemory !== false),
      referenceHistoryChats: typeof src.referenceHistoryChats === 'boolean' ? src.referenceHistoryChats : (prev.referenceHistoryChats !== false),
      strategy: strategy,
      summaryTriggerChars: clampMemoryNumericSetting('summaryTriggerChars', src.summaryTriggerChars, prev.summaryTriggerChars),
      recentRawMessagesLimit: clampMemoryNumericSetting('recentRawMessagesLimit', src.recentRawMessagesLimit, prev.recentRawMessagesLimit),
      summaryIntervalMessages: clampMemoryNumericSetting('summaryIntervalMessages', src.summaryIntervalMessages, prev.summaryIntervalMessages),
      summaryMergeThreshold: clampMemoryNumericSetting('summaryMergeThreshold', src.summaryMergeThreshold, prev.summaryMergeThreshold),
      maxMemoryRecallCount: clampMemoryNumericSetting('maxMemoryRecallCount', src.maxMemoryRecallCount, prev.maxMemoryRecallCount),
      maxSingleMemoryLength: clampMemoryNumericSetting('maxSingleMemoryLength', src.maxSingleMemoryLength, prev.maxSingleMemoryLength),
      updatedAt: Number(src.updatedAt) || Number(prev.updatedAt) || 0
    };
  }

  async function getMemorySettings() {
    var saved = await dbGetConfig(KEYS.MEMORY_SETTINGS);
    var summaryApi = await getSummaryApiConfig();
    return sanitizeMemorySettings(saved, DEFAULT_MEMORY_SETTINGS, {
      summaryApiComplete: !!(summaryApi && summaryApi.complete)
    });
  }

  async function saveMemorySettings(patch) {
    var current = await getMemorySettings();
    var summaryApi = await getSummaryApiConfig();
    var p = patch && typeof patch === 'object' ? patch : {};
    var nextInput = Object.assign({}, current, p, { updatedAt: Date.now() });
    if (p.strategy && MEMORY_STRATEGY_PRESETS[p.strategy] && p.applyStrategyPreset !== false) {
      var preset = MEMORY_STRATEGY_PRESETS[p.strategy];
      if (p.summaryTriggerChars === undefined) nextInput.summaryTriggerChars = preset.summaryTriggerChars;
      if (p.recentRawMessagesLimit === undefined) nextInput.recentRawMessagesLimit = preset.recentRawMessagesLimit;
      if (p.maxMemoryRecallCount === undefined) nextInput.maxMemoryRecallCount = preset.maxMemoryRecallCount;
      if (p.maxSingleMemoryLength === undefined) nextInput.maxSingleMemoryLength = preset.maxSingleMemoryLength;
    }
    var next = sanitizeMemorySettings(nextInput, current, {
      summaryApiComplete: !!(summaryApi && summaryApi.complete)
    });
    next.updatedAt = Date.now();
    return await dbPutConfig(KEYS.MEMORY_SETTINGS, next);
  }

  async function applyMemoryStrategy(strategyId) {
    var preset = MEMORY_STRATEGY_PRESETS[strategyId] || MEMORY_STRATEGY_PRESETS.natural;
    return await saveMemorySettings({
      strategy: preset.id,
      summaryTriggerChars: preset.summaryTriggerChars,
      recentRawMessagesLimit: preset.recentRawMessagesLimit,
      maxMemoryRecallCount: preset.maxMemoryRecallCount,
      maxSingleMemoryLength: preset.maxSingleMemoryLength
    });
  }

  async function resetMemorySettingsToDefaults() {
    var next = Object.assign({}, DEFAULT_MEMORY_SETTINGS, { updatedAt: Date.now() });
    return await dbPutConfig(KEYS.MEMORY_SETTINGS, next);
  }

  async function listMemories(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var ids = await dbGetConfig(KEYS.MEMORY_IDS);
    if (!Array.isArray(ids)) ids = [];
    var items = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var raw = await dbGetConfig(KEYS.MEMORY_PREFIX + id);
      if (raw && typeof raw === 'object') {
        var norm = normalizeMemoryRecord(raw, id);
        if (norm.content) {
          if (opts.userId && norm.userId !== opts.userId) continue;
          if (opts.scope && norm.scope !== opts.scope) continue;
          items.push(norm);
        }
      }
    }
    items.sort(function(a, b) {
      return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    });
    return items;
  }

  async function getMemory(id) {
    if (!id) return null;
    var raw = await dbGetConfig(KEYS.MEMORY_PREFIX + id);
    if (!raw || typeof raw !== 'object') return null;
    return normalizeMemoryRecord(raw, id);
  }

  async function createMemory(data) {
    var ids = await dbGetConfig(KEYS.MEMORY_IDS);
    if (!Array.isArray(ids)) ids = [];
    var now = Date.now();
    var src = data && typeof data === 'object' ? data : {};
    var mem = normalizeMemoryRecord(Object.assign({}, src, {
      id: src.id || generateMemoryId(),
      createdAt: Number(src.createdAt) || now,
      updatedAt: Number(src.updatedAt) || now
    }));
    if (!mem.content) return null;

    await dbPutConfig(KEYS.MEMORY_PREFIX + mem.id, mem);
    if (ids.indexOf(mem.id) === -1) {
      ids.unshift(mem.id);
      await dbPutConfig(KEYS.MEMORY_IDS, ids);
    }
    return mem;
  }

  async function updateMemory(id, patch, options) {
    if (!id) return null;
    var existing = await getMemory(id);
    if (!existing) return null;
    var p = patch && typeof patch === 'object' ? patch : {};
    var opts = options && typeof options === 'object' ? options : {};
    var nextHistory = Array.isArray(p.history) ? p.history.slice(0, 6) : (Array.isArray(existing.history) ? existing.history.slice(0, 6) : []);
    var prevContent = existing.previousContent || '';
    if (p.content && String(p.content).trim() !== existing.content && !opts.skipHistoryPush) {
      prevContent = existing.content;
      nextHistory.unshift({
        content: existing.content,
        updatedAt: existing.updatedAt || existing.createdAt,
        temporalState: existing.temporalState || 'current',
        status: existing.status || 'active',
        reason: String(opts.historyReason || p.historyReason || '').trim().slice(0, 100)
      });
      nextHistory = nextHistory.slice(0, 6);
    }
    var next = normalizeMemoryRecord(Object.assign({}, existing, p, {
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: opts.preserveUpdatedAt ? (existing.updatedAt || existing.createdAt) : Date.now(),
      previousContent: p.previousContent != null ? p.previousContent : prevContent,
      history: nextHistory
    }), existing.id);
    if (!next.content) return null;
    await dbPutConfig(KEYS.MEMORY_PREFIX + existing.id, next);
    return next;
  }

  function normalizeDeletedSignatureText(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/^[-*•\d.)\s]+/, '')
      .replace(/[\s，。！？、；：“”"'‘’（）()【】\[\],.!?;:~`「」]+/g, '')
      .trim();
  }

  async function listDeletedMemorySignatures() {
    var list = await dbGetConfig(KEYS.DELETED_MEMORY_SIGS);
    return Array.isArray(list) ? list : [];
  }

  async function addDeletedMemorySignature(mem) {
    if (!mem || !mem.content) return [];
    var norm = normalizeDeletedSignatureText(mem.content);
    if (!norm) return await listDeletedMemorySignatures();
    var list = await listDeletedMemorySignatures();
    var filtered = list.filter(function(item) { return item && item.norm !== norm; });
    filtered.unshift({
      norm: norm,
      content: String(mem.content || '').slice(0, 120),
      sourceChatId: String(mem.sourceChatId || ''),
      deletedAt: Date.now()
    });
    if (filtered.length > 100) filtered = filtered.slice(0, 100);
    return await dbPutConfig(KEYS.DELETED_MEMORY_SIGS, filtered);
  }

  async function removeDeletedMemorySignatureByContent(content) {
    var norm = normalizeDeletedSignatureText(content);
    if (!norm) return;
    var list = await listDeletedMemorySignatures();
    var next = list.filter(function(item) { return item && item.norm !== norm; });
    if (next.length !== list.length) {
      await dbPutConfig(KEYS.DELETED_MEMORY_SIGS, next);
    }
  }

  async function cleanupDanglingMemoryReferences(deletedId) {
    if (!deletedId) return 0;
    var all = await listMemories();
    var touched = 0;
    for (var i = 0; i < all.length; i++) {
      var mem = all[i];
      if (!mem || mem.id === deletedId) continue;
      var changed = false;
      var nextRelations = (Array.isArray(mem.relations) ? mem.relations : []).filter(function(r) {
        if (r && r.targetId === deletedId) {
          changed = true;
          return false;
        }
        return true;
      });
      var nextConflicts = (Array.isArray(mem.conflictWithIds) ? mem.conflictWithIds : []).filter(function(cid) {
        if (cid === deletedId) {
          changed = true;
          return false;
        }
        return true;
      });
      var nextSupersedesId = mem.supersedesId === deletedId ? '' : mem.supersedesId;
      var nextSupersededById = mem.supersededById === deletedId ? '' : mem.supersededById;
      if (nextSupersedesId !== mem.supersedesId || nextSupersededById !== mem.supersededById) {
        changed = true;
      }
      var nextConflictState = mem.conflictState;
      if (nextConflictState === 'pending_confirmation' && nextConflicts.length === 0) {
        nextConflictState = 'none';
        changed = true;
      }
      if (changed) {
        await updateMemory(mem.id, {
          relations: nextRelations,
          conflictWithIds: nextConflicts,
          conflictState: nextConflictState,
          supersedesId: nextSupersedesId,
          supersededById: nextSupersededById
        }, { preserveUpdatedAt: true, skipHistoryPush: true });
        touched++;
      }
    }
    return touched;
  }

  async function deleteMemory(id) {
    if (!id) return false;
    var existing = await getMemory(id);
    if (existing) {
      await addDeletedMemorySignature(existing);
    }
    var ids = await dbGetConfig(KEYS.MEMORY_IDS);
    if (!Array.isArray(ids)) ids = [];
    var idx = ids.indexOf(id);
    if (idx !== -1) {
      ids.splice(idx, 1);
      await dbPutConfig(KEYS.MEMORY_IDS, ids);
    }
    await dbDeleteConfig(KEYS.MEMORY_PREFIX + id);
    try {
      if (global.AiWorkspaceMemoryManager && typeof global.AiWorkspaceMemoryManager.cleanupRelationsAfterDelete === 'function') {
        await global.AiWorkspaceMemoryManager.cleanupRelationsAfterDelete(id, existing ? existing.userId : 'local_user');
      } else {
        await cleanupDanglingMemoryReferences(id);
      }
    } catch (_) {
      try { await cleanupDanglingMemoryReferences(id); } catch (_2) {}
    }
    return true;
  }

  async function clearAllMemories() {
    var existingList = await listMemories();
    for (var k = 0; k < existingList.length; k++) {
      await addDeletedMemorySignature(existingList[k]);
    }
    var ids = await dbGetConfig(KEYS.MEMORY_IDS);
    if (!Array.isArray(ids)) ids = [];
    for (var i = 0; i < ids.length; i++) {
      await dbDeleteConfig(KEYS.MEMORY_PREFIX + ids[i]);
    }
    await dbPutConfig(KEYS.MEMORY_IDS, []);
    return true;
  }

  // ===== 11. 持久化记忆与摘要任务队列（防止切换聊天/刷新丢失，支持失败记录与重试） =====
  function generateTaskId() {
    return 'memtask_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function sanitizeTaskErrorText(rawErr) {
    var s = String(rawErr || '').trim();
    if (!s) return '';
    return s
      .replace(/\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{8,}\b/gi, 'sk-***')
      .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi, 'Bearer ***')
      .replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, 'AIza***')
      .slice(0, 220);
  }

  function normalizeMemoryTaskRecord(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var status = String(src.status || 'pending');
    if (status === 'done') {
      status = src.memoryWritten ? 'saved' : 'skipped';
    }
    if (['pending', 'running', 'saved', 'skipped', 'failed', 'retry_waiting'].indexOf(status) === -1) {
      status = 'pending';
    }
    var savedIds = Array.isArray(src.savedMemoryIds) ? src.savedMemoryIds.filter(Boolean).map(String) : [];
    return {
      id: String(src.id || generateTaskId()),
      type: String(src.type || 'extract_memory'),
      turnKey: String(src.turnKey || '').trim(),
      chatId: String(src.chatId || ''),
      chatTitle: String(src.chatTitle || ''),
      projectId: String(src.projectId || ''),
      userId: String(src.userId || 'local_user'),
      payload: src.payload && typeof src.payload === 'object' ? deepClone(src.payload) : {},
      status: status,
      attempts: Math.max(0, Number(src.attempts) || 0),
      maxAttempts: Math.max(1, Number(src.maxAttempts) || 3),
      memoryWritten: typeof src.memoryWritten === 'boolean' ? src.memoryWritten : (savedIds.length > 0),
      savedMemoryIds: savedIds,
      lastError: sanitizeTaskErrorText(src.lastError),
      resultSummary: String(src.resultSummary || '').slice(0, 200),
      diagnostics: src.diagnostics && typeof src.diagnostics === 'object' ? deepClone(src.diagnostics) : null,
      createdAt: Number(src.createdAt) || Date.now(),
      updatedAt: Number(src.updatedAt) || Date.now(),
      nextRetryAt: Number(src.nextRetryAt) || 0
    };
  }

  async function listMemoryTasks() {
    var tasks = await dbGetConfig(KEYS.MEMORY_TASKS);
    return Array.isArray(tasks) ? tasks.map(normalizeMemoryTaskRecord) : [];
  }

  async function saveMemoryTasks(tasks) {
    var arr = Array.isArray(tasks) ? tasks.slice(0, 40).map(normalizeMemoryTaskRecord) : [];
    return await dbPutConfig(KEYS.MEMORY_TASKS, arr);
  }

  async function enqueueMemoryTask(taskData) {
    var src = taskData && typeof taskData === 'object' ? taskData : {};
    var tasks = await listMemoryTasks();
    var turnKey = String(src.turnKey || '').trim();
    if (turnKey) {
      var dup = tasks.find(function(t) {
        return t && t.turnKey === turnKey && (
          t.status === 'pending' || t.status === 'running' || t.status === 'saved' || t.status === 'skipped'
        );
      });
      if (dup) return dup;
    }
    var now = Date.now();
    var task = normalizeMemoryTaskRecord({
      id: src.id || generateTaskId(),
      type: src.type || 'extract_memory',
      turnKey: turnKey,
      chatId: src.chatId || '',
      chatTitle: src.chatTitle || '',
      projectId: src.projectId || '',
      userId: src.userId || 'local_user',
      payload: src.payload || {},
      status: src.status || 'pending',
      attempts: src.attempts || 0,
      maxAttempts: Math.max(1, Number(src.maxAttempts) || 3),
      memoryWritten: !!src.memoryWritten,
      savedMemoryIds: Array.isArray(src.savedMemoryIds) ? src.savedMemoryIds : [],
      lastError: src.lastError || '',
      resultSummary: src.resultSummary || '',
      diagnostics: src.diagnostics && typeof src.diagnostics === 'object' ? src.diagnostics : null,
      createdAt: src.createdAt || now,
      updatedAt: src.updatedAt || now,
      nextRetryAt: src.nextRetryAt || 0
    });
    tasks.unshift(task);
    await saveMemoryTasks(tasks);
    return task;
  }

  async function updateMemoryTask(taskId, patch) {
    if (!taskId) return null;
    var tasks = await listMemoryTasks();
    var idx = tasks.findIndex(function(t) { return t && t.id === taskId; });
    if (idx === -1) return null;
    var merged = Object.assign({}, tasks[idx], patch || {}, {
      id: tasks[idx].id,
      updatedAt: Date.now()
    });
    if (patch && patch.diagnostics && typeof patch.diagnostics === 'object') {
      merged.diagnostics = Object.assign({}, tasks[idx].diagnostics || {}, patch.diagnostics);
    }
    if (patch && patch.lastError !== undefined) {
      merged.lastError = sanitizeTaskErrorText(patch.lastError);
    }
    var next = normalizeMemoryTaskRecord(merged);
    tasks[idx] = next;
    await saveMemoryTasks(tasks);
    return next;
  }

  async function clearFinishedMemoryTasks() {
    var tasks = await listMemoryTasks();
    var active = tasks.filter(function(t) {
      return t && (t.status === 'pending' || t.status === 'running' || t.status === 'retry_waiting');
    });
    await saveMemoryTasks(active);
    return active;
  }

  // ===== 9. 世界书持久化存储（独立隔离于记忆、摘要、预设及主库其他模块） =====
  function generateWorldBookId() {
    return 'wb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function generateWorldBookEntryId() {
    return 'wbe_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function getNextWorldBookEntryUid(entries) {
    var list = Array.isArray(entries) ? entries : [];
    var used = {};
    for (var i = 0; i < list.length; i++) {
      var u = list[i] && Number(list[i].uid);
      if (Number.isInteger(u) && u >= 0) used[u] = true;
    }
    var next = 0;
    while (used[next]) next++;
    return next;
  }

  function normalizeWorldBookKeywords(raw) {
    var list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (typeof raw === 'string') {
      list = raw.split(/[\n,，、]+/);
    }
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var item = String(list[i] == null ? '' : list[i]).trim();
      if (!item || seen[item]) continue;
      seen[item] = true;
      out.push(item);
    }
    return out;
  }

  function normalizeWorldBookEntry(raw, fallbackUid) {
    var src = raw && typeof raw === 'object' ? deepClone(raw) : {};
    var now = Date.now();
    var id = String(src.id || generateWorldBookEntryId()).trim();
    var uidNum = Number(src.uid);
    var uid = (Number.isInteger(uidNum) && uidNum >= 0) ? uidNum : (Number.isInteger(fallbackUid) && fallbackUid >= 0 ? fallbackUid : 0);
    var comment = String(src.comment != null ? src.comment : (src.name != null ? src.name : '')).trim().slice(0, 120);
    var content = String(src.content != null ? src.content : '').replace(/\r\n/g, '\n');
    var disable = typeof src.disable === 'boolean'
      ? src.disable
      : (typeof src.enabled === 'boolean' ? !src.enabled : false);
    var constant = src.constant === true;
    var key = normalizeWorldBookKeywords(src.key !== undefined ? src.key : src.keys);
    var rawOrder = src.order !== undefined ? src.order : src.insertion_order;
    var orderNum = (rawOrder !== '' && rawOrder !== null && rawOrder !== undefined) ? Number(rawOrder) : NaN;
    var order = Number.isFinite(orderNum) ? Math.round(orderNum) : 100;
    var createdAt = Number(src.createdAt) || now;
    var updatedAt = Number(src.updatedAt) || createdAt;
    return Object.assign(src, {
      id: id,
      uid: uid,
      comment: comment,
      content: content,
      disable: disable,
      constant: constant,
      key: key,
      order: order,
      createdAt: createdAt,
      updatedAt: updatedAt
    });
  }

  function normalizeWorldBookRecord(raw, fallbackId) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var now = Date.now();
    var id = String(src.id || fallbackId || generateWorldBookId()).trim();
    var name = String(src.name || '').trim().slice(0, 80) || '未命名世界书';
    var description = String(src.description || '').replace(/\r\n/g, '\n').trim().slice(0, 500);
    var rawEntries = Array.isArray(src.entries) ? src.entries : [];
    var seenIds = {};
    var entries = [];
    for (var i = 0; i < rawEntries.length; i++) {
      if (!rawEntries[i] || typeof rawEntries[i] !== 'object') continue;
      var normEntry = normalizeWorldBookEntry(rawEntries[i], i);
      if (seenIds[normEntry.id]) {
        normEntry.id = generateWorldBookEntryId();
      }
      seenIds[normEntry.id] = true;
      entries.push(normEntry);
    }
    var extraFields = src.extraFields && typeof src.extraFields === 'object' && !Array.isArray(src.extraFields)
      ? deepClone(src.extraFields)
      : {};
    var createdAt = Number(src.createdAt) || now;
    var updatedAt = Number(src.updatedAt) || createdAt;
    return {
      id: id,
      name: name,
      description: description,
      enabled: src.enabled !== false,
      globalEnabled: src.globalEnabled === true,
      entries: entries,
      extraFields: extraFields,
      createdAt: createdAt,
      updatedAt: updatedAt
    };
  }

  async function listWorldBooks() {
    var ids = await dbGetConfig(KEYS.WORLDBOOK_IDS);
    if (!Array.isArray(ids)) ids = [];
    var items = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!id) continue;
      var raw = await dbGetConfig(KEYS.WORLDBOOK_PREFIX + id);
      if (raw && typeof raw === 'object') {
        items.push(normalizeWorldBookRecord(raw, id));
      }
    }
    items.sort(function(a, b) {
      return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    });
    return items;
  }

  async function getWorldBook(id) {
    if (!id) return null;
    var raw = await dbGetConfig(KEYS.WORLDBOOK_PREFIX + id);
    if (!raw || typeof raw !== 'object') return null;
    return normalizeWorldBookRecord(raw, id);
  }

  async function createWorldBook(data) {
    var ids = await dbGetConfig(KEYS.WORLDBOOK_IDS);
    if (!Array.isArray(ids)) ids = [];
    var now = Date.now();
    var src = data && typeof data === 'object' ? data : {};
    var record = normalizeWorldBookRecord(Object.assign({}, src, {
      id: src.id || generateWorldBookId(),
      entries: Array.isArray(src.entries) ? src.entries : [],
      createdAt: Number(src.createdAt) || now,
      updatedAt: Number(src.updatedAt) || now
    }));
    await dbPutConfig(KEYS.WORLDBOOK_PREFIX + record.id, record);
    if (ids.indexOf(record.id) === -1) {
      ids.unshift(record.id);
      await dbPutConfig(KEYS.WORLDBOOK_IDS, ids);
    }
    return record;
  }

  async function updateWorldBook(id, patch) {
    if (!id) return null;
    var existing = await getWorldBook(id);
    if (!existing) return null;
    var p = patch && typeof patch === 'object' ? patch : {};
    var merged = Object.assign({}, existing, p, {
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now()
    });
    var next = normalizeWorldBookRecord(merged, existing.id);
    await dbPutConfig(KEYS.WORLDBOOK_PREFIX + next.id, next);
    return next;
  }

  async function deleteWorldBook(id) {
    if (!id) return false;
    var ids = await dbGetConfig(KEYS.WORLDBOOK_IDS);
    if (!Array.isArray(ids)) ids = [];
    var nextIds = ids.filter(function(item) { return item !== id; });
    await dbDeleteConfig(KEYS.WORLDBOOK_PREFIX + id);
    await dbPutConfig(KEYS.WORLDBOOK_IDS, nextIds);

    // 同步清理所有预设中指向已删除世界书的失效绑定，不影响其他绑定
    try {
      var presetIds = await dbGetConfig(KEYS.PRESET_IDS);
      if (Array.isArray(presetIds) && presetIds.length) {
        for (var i = 0; i < presetIds.length; i++) {
          var pid = presetIds[i];
          if (!pid) continue;
          var rawPreset = await dbGetConfig(KEYS.PRESET_PREFIX + pid);
          if (!rawPreset || typeof rawPreset !== 'object') continue;
          var oldWbIds = normalizeWorldBookIdList(rawPreset.worldBookIds);
          if (oldWbIds.indexOf(id) !== -1) {
            var nextPreset = normalizePreset(Object.assign({}, rawPreset, {
              worldBookIds: oldWbIds.filter(function(wbId) { return wbId !== id; })
            }), pid);
            await dbPutConfig(KEYS.PRESET_PREFIX + pid, nextPreset);
          }
        }
      }
    } catch (_) {}

    return true;
  }

  async function setWorldBookEnabled(id, enabled) {
    if (!id) return null;
    var existing = await getWorldBook(id);
    if (!existing) return null;
    var next = normalizeWorldBookRecord(Object.assign({}, existing, {
      id: existing.id,
      enabled: enabled !== false,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt
    }), existing.id);
    await dbPutConfig(KEYS.WORLDBOOK_PREFIX + next.id, next);
    return next;
  }

  async function setWorldBookGlobalEnabled(id, globalEnabled) {
    if (!id) return null;
    var existing = await getWorldBook(id);
    if (!existing) return null;
    var next = normalizeWorldBookRecord(Object.assign({}, existing, {
      id: existing.id,
      globalEnabled: globalEnabled === true,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt
    }), existing.id);
    await dbPutConfig(KEYS.WORLDBOOK_PREFIX + next.id, next);
    return next;
  }

  async function listGlobalWorldBooks() {
    var list = await listWorldBooks();
    return list.filter(function(item) {
      return item && item.enabled !== false && item.globalEnabled === true;
    });
  }

  function resolveEffectiveWorldBooksFromData(preset, allWorldBooks) {
    var booksList = Array.isArray(allWorldBooks) ? allWorldBooks : [];
    var byId = {};
    var globalBooks = [];
    for (var i = 0; i < booksList.length; i++) {
      var wb = booksList[i];
      if (!wb || !wb.id) continue;
      if (wb.enabled === false) continue;
      byId[wb.id] = wb;
      if (wb.globalEnabled === true) {
        globalBooks.push(wb);
      }
    }

    var boundIds = normalizeWorldBookIdList(preset && preset.worldBookIds);
    var presetBooks = [];
    for (var j = 0; j < boundIds.length; j++) {
      var matched = byId[boundIds[j]];
      if (matched) {
        presetBooks.push(matched);
      }
    }

    var seen = {};
    var mergedBooks = [];
    for (var g = 0; g < globalBooks.length; g++) {
      var gb = globalBooks[g];
      if (!seen[gb.id]) {
        seen[gb.id] = true;
        mergedBooks.push(gb);
      }
    }
    for (var p = 0; p < presetBooks.length; p++) {
      var pb = presetBooks[p];
      if (!seen[pb.id]) {
        seen[pb.id] = true;
        mergedBooks.push(pb);
      }
    }

    return {
      books: mergedBooks,
      globalBooks: globalBooks,
      presetBooks: presetBooks,
      globalCount: globalBooks.length,
      presetCount: presetBooks.length,
      effectiveCount: mergedBooks.length
    };
  }

  async function resolveEffectiveWorldBooksForPreset(presetOrId, allWorldBooksOpt) {
    var preset = null;
    if (typeof presetOrId === 'string' && presetOrId.trim()) {
      preset = await getPreset(presetOrId.trim());
    } else if (presetOrId && typeof presetOrId === 'object') {
      preset = presetOrId;
    }
    var allBooks = Array.isArray(allWorldBooksOpt) ? allWorldBooksOpt : await listWorldBooks();
    return resolveEffectiveWorldBooksFromData(preset, allBooks);
  }

  function buildWorldBookMatchHaystack(options) {
    if (typeof options === 'string') {
      return options.trim();
    }
    var opts = options && typeof options === 'object' ? options : {};
    var parts = [];
    var messages = Array.isArray(opts.messages) ? opts.messages : [];
    if (messages.length) {
      var rawDepth = opts.scanDepth;
      var scanDepth = rawDepth === 'all' || rawDepth === 0
        ? messages.length
        : (Number.isFinite(Number(rawDepth)) && Number(rawDepth) > 0 ? Math.floor(Number(rawDepth)) : 6);
      var startIdx = Math.max(0, messages.length - scanDepth);
      for (var i = startIdx; i < messages.length; i++) {
        var msg = messages[i];
        if (msg && typeof msg === 'object' && msg.role === 'system') continue;
        var msgText = typeof msg === 'string'
          ? msg
          : (msg && msg.content != null ? String(msg.content) : '');
        msgText = msgText.trim();
        if (msgText) parts.push(msgText);
      }
    }
    var directTexts = [opts.text, opts.userInput, opts.query];
    for (var j = 0; j < directTexts.length; j++) {
      var dt = directTexts[j] != null ? String(directTexts[j]).trim() : '';
      if (dt) parts.push(dt);
    }
    return parts.join('\n').trim();
  }

  function formatMatchedWorldBookEntries(matchedEntries) {
    var list = Array.isArray(matchedEntries) ? matchedEntries : [];
    if (!list.length) return '';
    var blocks = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || !item.content) continue;
      var title = String(item.comment || '').trim();
      var content = String(item.content || '').trim();
      if (!content) continue;
      blocks.push(title ? ('[' + title + ']\n' + content) : content);
    }
    return blocks.join('\n\n');
  }

  function matchWorldBookEntriesFromData(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var preset = opts.preset && typeof opts.preset === 'object' ? opts.preset : null;
    var allWorldBooks = Array.isArray(opts.worldBooks) ? opts.worldBooks : [];

    var effectiveInfo = Array.isArray(opts.effectiveWorldBooks)
      ? {
          books: opts.effectiveWorldBooks,
          globalBooks: opts.effectiveWorldBooks.filter(function(b) { return b && b.globalEnabled === true; }),
          presetBooks: opts.effectiveWorldBooks.filter(function(b) { return b && b.globalEnabled !== true; })
        }
      : resolveEffectiveWorldBooksFromData(preset, allWorldBooks);

    var globalIdSet = {};
    var presetIdSet = {};
    var rawGlobal = Array.isArray(effectiveInfo.globalBooks) ? effectiveInfo.globalBooks : [];
    var rawPreset = Array.isArray(effectiveInfo.presetBooks) ? effectiveInfo.presetBooks : [];
    for (var gi = 0; gi < rawGlobal.length; gi++) {
      if (rawGlobal[gi] && rawGlobal[gi].id) globalIdSet[rawGlobal[gi].id] = true;
    }
    for (var pi = 0; pi < rawPreset.length; pi++) {
      if (rawPreset[pi] && rawPreset[pi].id) presetIdSet[rawPreset[pi].id] = true;
    }

    // 仅保留已启用且去重后的有效世界书
    var enabledBooks = [];
    var seenBookIds = {};
    var enabledGlobalCount = 0;
    var enabledPresetCount = 0;
    var rawBooks = Array.isArray(effectiveInfo.books) ? effectiveInfo.books : [];
    for (var bi = 0; bi < rawBooks.length; bi++) {
      var wb = rawBooks[bi];
      if (!wb || typeof wb !== 'object' || !wb.id) continue;
      if (wb.enabled === false) continue;
      if (seenBookIds[wb.id]) continue;
      seenBookIds[wb.id] = true;
      enabledBooks.push(wb);
      if (globalIdSet[wb.id]) enabledGlobalCount++;
      if (presetIdSet[wb.id]) enabledPresetCount++;
    }

    var haystack = buildWorldBookMatchHaystack(opts);
    var haystackLower = haystack.toLowerCase();

    var seenEntryKeys = {};
    var rawMatched = [];
    var seq = 0;

    for (var i = 0; i < enabledBooks.length; i++) {
      var book = enabledBooks[i];
      var isInGlobal = !!globalIdSet[book.id];
      var isInPreset = !!presetIdSet[book.id];
      var bookSource = (isInGlobal && isInPreset) ? 'both' : (isInGlobal ? 'global' : 'preset');
      var entries = Array.isArray(book.entries) ? book.entries : [];

      for (var ei = 0; ei < entries.length; ei++) {
        var rawEntry = entries[ei];
        if (!rawEntry || typeof rawEntry !== 'object') continue;
        var entry = normalizeWorldBookEntry(rawEntry, ei);

        // 仅匹配已启用且正文非空的词条
        if (entry.disable === true) continue;
        var trimmedContent = String(entry.content || '').trim();
        if (!trimmedContent) continue;

        // 防止同一词条重复匹配
        var entryDedupKey = book.id + '::' + (entry.id || ('uid_' + entry.uid));
        if (seenEntryKeys[entryDedupKey]) continue;

        var matched = false;
        var triggerType = 'keyword';
        var matchedKeywords = [];

        if (entry.constant === true) {
          matched = true;
          triggerType = 'constant';
        } else if (haystackLower) {
          var keywords = normalizeWorldBookKeywords(entry.key);
          for (var ki = 0; ki < keywords.length; ki++) {
            var kw = keywords[ki];
            if (!kw) continue;
            if (haystackLower.indexOf(kw.toLowerCase()) !== -1) {
              matchedKeywords.push(kw);
            }
          }
          if (matchedKeywords.length > 0) {
            matched = true;
            triggerType = 'keyword';
          }
        }

        if (!matched) continue;

        seenEntryKeys[entryDedupKey] = true;
        rawMatched.push({
          id: entry.id,
          uid: entry.uid,
          bookId: book.id,
          bookName: book.name || '未命名世界书',
          bookSource: bookSource,
          comment: entry.comment || '',
          content: trimmedContent,
          order: Number.isFinite(Number(entry.order)) ? Math.round(Number(entry.order)) : 100,
          constant: entry.constant === true,
          triggerType: triggerType,
          matchedKeywords: matchedKeywords,
          _seq: seq++
        });
      }
    }

    var sortDesc = opts.sortDirection === 'desc';
    rawMatched.sort(function(a, b) {
      var diff = sortDesc ? (b.order - a.order) : (a.order - b.order);
      if (diff !== 0) return diff;
      return a._seq - b._seq;
    });

    var constantCount = 0;
    var keywordCount = 0;
    var matchedEntries = rawMatched.map(function(item) {
      if (item.triggerType === 'constant') constantCount++;
      else keywordCount++;
      return {
        id: item.id,
        uid: item.uid,
        bookId: item.bookId,
        bookName: item.bookName,
        bookSource: item.bookSource,
        comment: item.comment,
        content: item.content,
        order: item.order,
        constant: item.constant,
        triggerType: item.triggerType,
        matchedKeywords: item.matchedKeywords.slice()
      };
    });

    return {
      presetId: preset ? String(preset.id || '') : '',
      presetName: preset ? String(preset.name || '') : '',
      effectiveBooks: enabledBooks,
      effectiveBookIds: enabledBooks.map(function(b) { return b.id; }),
      effectiveBookCount: enabledBooks.length,
      globalBookCount: enabledGlobalCount,
      presetBookCount: enabledPresetCount,
      matchedEntries: matchedEntries,
      matchedCount: matchedEntries.length,
      constantCount: constantCount,
      keywordCount: keywordCount,
      formattedText: formatMatchedWorldBookEntries(matchedEntries)
    };
  }

  async function matchWorldBookEntries(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var preset = null;
    if (opts.preset && typeof opts.preset === 'object') {
      preset = opts.preset;
      if (preset.id && !Array.isArray(preset.worldBookIds)) {
        var latestPreset = await getPreset(String(preset.id).trim());
        if (latestPreset) preset = latestPreset;
      }
    } else if (typeof opts.presetId === 'string' && opts.presetId.trim()) {
      preset = await getPreset(opts.presetId.trim());
    }
    var worldBooks = Array.isArray(opts.worldBooks) ? opts.worldBooks : await listWorldBooks();
    return matchWorldBookEntriesFromData(Object.assign({}, opts, {
      preset: preset,
      worldBooks: worldBooks
    }));
  }

  async function createWorldBookEntry(bookId, data) {
    if (!bookId) return null;
    var book = await getWorldBook(bookId);
    if (!book) return null;
    var entries = Array.isArray(book.entries) ? book.entries.slice() : [];
    var src = data && typeof data === 'object' ? data : {};
    var now = Date.now();
    var nextUid = getNextWorldBookEntryUid(entries);
    var entry = normalizeWorldBookEntry(Object.assign({}, src, {
      id: src.id || generateWorldBookEntryId(),
      uid: (src.uid != null && Number.isInteger(Number(src.uid)) && Number(src.uid) >= 0) ? Number(src.uid) : nextUid,
      createdAt: Number(src.createdAt) || now,
      updatedAt: Number(src.updatedAt) || now
    }), nextUid);
    entries.unshift(entry);
    var updatedBook = await updateWorldBook(bookId, { entries: entries });
    return { book: updatedBook, entry: entry };
  }

  async function updateWorldBookEntry(bookId, entryId, patch) {
    if (!bookId || !entryId) return null;
    var book = await getWorldBook(bookId);
    if (!book) return null;
    var entries = Array.isArray(book.entries) ? book.entries.slice() : [];
    var idx = entries.findIndex(function(item) { return item && item.id === entryId; });
    if (idx === -1) return null;
    var existing = entries[idx];
    var p = patch && typeof patch === 'object' ? Object.assign({}, patch) : {};
    if (typeof p.disable !== 'boolean' && typeof p.enabled === 'boolean') {
      p.disable = !p.enabled;
    }
    var nextEntry = normalizeWorldBookEntry(Object.assign({}, existing, p, {
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now()
    }), existing.uid);
    entries[idx] = nextEntry;
    var updatedBook = await updateWorldBook(bookId, { entries: entries });
    return { book: updatedBook, entry: nextEntry };
  }

  async function deleteWorldBookEntry(bookId, entryId) {
    if (!bookId || !entryId) return null;
    var book = await getWorldBook(bookId);
    if (!book) return null;
    var entries = Array.isArray(book.entries) ? book.entries : [];
    var nextEntries = entries.filter(function(item) { return item && item.id !== entryId; });
    if (nextEntries.length === entries.length) return null;
    return await updateWorldBook(bookId, { entries: nextEntries });
  }

  function buildWorldBookExportFilename(book) {
    var rawName = String((book && book.name) || '').trim();
    var safeName = rawName
      .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
      .replace(/^\.+|\.+$/g, '')
      .trim()
      .slice(0, 64);
    return (safeName || '世界书') + '.json';
  }

  function buildWorldBookExportJson(book) {
    var norm = normalizeWorldBookRecord(book || {});
    var payload = {
      format: 'zhiyu_worldbook',
      version: 1,
      exportedAt: Date.now(),
      worldbook: {
        name: norm.name,
        description: norm.description,
        enabled: norm.enabled !== false,
        globalEnabled: norm.globalEnabled === true,
        entries: norm.entries.map(function(entry, idx) {
          return normalizeWorldBookEntry(entry, idx);
        })
      }
    };
    return JSON.stringify(payload, null, 2);
  }

  function stripUnsafeJsonKeys(val) {
    if (Array.isArray(val)) {
      return val.map(stripUnsafeJsonKeys);
    }
    if (val && typeof val === 'object') {
      var out = {};
      var keys = Object.keys(val);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        out[k] = stripUnsafeJsonKeys(val[k]);
      }
      return out;
    }
    return val;
  }

  function parseWorldBookImportJson(rawText) {
    var text = String(rawText == null ? '' : rawText).trim();
    if (!text) {
      return { ok: false, error: '导入失败：文件内容为空' };
    }
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      return { ok: false, error: '导入失败：JSON 文件格式无效' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: '导入失败：文件内容不是有效的 JSON 对象' };
    }
    var safeParsed = stripUnsafeJsonKeys(parsed);
    if (safeParsed.format !== 'zhiyu_worldbook' || Number(safeParsed.version) !== 1) {
      return { ok: false, error: '导入失败：仅支持知屿世界书 JSON 格式（zhiyu_worldbook v1）' };
    }
    var wb = safeParsed.worldbook;
    if (!wb || typeof wb !== 'object' || Array.isArray(wb)) {
      return { ok: false, error: '导入失败：缺少有效的 worldbook 数据结构' };
    }
    var bookName = String(wb.name || '').trim();
    if (!bookName) {
      return { ok: false, error: '导入失败：世界书名称缺失' };
    }
    if (!Array.isArray(wb.entries)) {
      return { ok: false, error: '导入失败：词条列表格式无效' };
    }
    var normalizedEntries = [];
    for (var i = 0; i < wb.entries.length; i++) {
      var rawEntry = wb.entries[i];
      if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
        return { ok: false, error: '导入失败：第 ' + (i + 1) + ' 条词条格式无效' };
      }
      var clonedEntry = Object.assign({}, rawEntry, {
        id: generateWorldBookEntryId()
      });
      normalizedEntries.push(normalizeWorldBookEntry(clonedEntry, i));
    }
    return {
      ok: true,
      book: {
        name: bookName.slice(0, 80),
        description: String(wb.description || '').replace(/\r\n/g, '\n').trim().slice(0, 500),
        enabled: wb.enabled !== false,
        globalEnabled: wb.globalEnabled === true,
        entries: normalizedEntries,
        extraFields: wb.extraFields && typeof wb.extraFields === 'object' && !Array.isArray(wb.extraFields)
          ? deepClone(wb.extraFields)
          : {}
      }
    };
  }

  async function importWorldBookFromJson(rawText) {
    var parsed = parseWorldBookImportJson(rawText);
    if (!parsed.ok) {
      return parsed;
    }
    var created = await createWorldBook({
      id: generateWorldBookId(),
      name: parsed.book.name,
      description: parsed.book.description,
      enabled: parsed.book.enabled,
      globalEnabled: parsed.book.globalEnabled === true,
      entries: parsed.book.entries,
      extraFields: parsed.book.extraFields
    });
    return {
      ok: true,
      book: created,
      entryCount: Array.isArray(created.entries) ? created.entries.length : 0
    };
  }

  async function importWorldBookFromTxt(rawText, filename) {
    var content = String(rawText == null ? '' : rawText)
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .trim();
    if (!content) {
      return { ok: false, error: '导入失败：TXT 文件内容为空' };
    }
    var rawFilename = String(filename || '').split(/[\\/]/).pop() || '';
    var bookName = rawFilename.replace(/\.txt$/i, '').trim().slice(0, 80) || '未命名世界书';
    var now = Date.now();
    var entry = normalizeWorldBookEntry({
      id: generateWorldBookEntryId(),
      uid: 0,
      comment: '正文',
      content: content,
      disable: false,
      constant: true,
      key: [],
      order: 100,
      createdAt: now,
      updatedAt: now
    }, 0);
    var created = await createWorldBook({
      id: generateWorldBookId(),
      name: bookName,
      description: '',
      enabled: true,
      entries: [entry],
      extraFields: {}
    });
    return {
      ok: true,
      book: created,
      entryCount: Array.isArray(created.entries) ? created.entries.length : 0
    };
  }

  function decodeXmlEntities(str) {
    return String(str || '')
      .replace(/&#x([0-9a-fA-F]+);/g, function(_, hex) {
        var code = parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      })
      .replace(/&#(\d+);/g, function(_, dec) {
        var code = parseInt(dec, 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      })
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, '\'')
      .replace(/&amp;/g, '&');
  }

  function extractTextFromWordXml(xmlStr) {
    var src = String(xmlStr || '');
    if (!src.trim()) return '';

    if (typeof global.DOMParser === 'function') {
      try {
        var parser = new global.DOMParser();
        var doc = parser.parseFromString(src, 'application/xml');
        var parseErr = doc && doc.getElementsByTagName ? doc.getElementsByTagName('parsererror') : null;
        if (parseErr && parseErr.length > 0) {
          throw new Error('XML_PARSE_ERROR');
        }
        var getLocal = function(node) {
          return String((node && (node.localName || node.nodeName)) || '').replace(/^.*:/, '').toLowerCase();
        };
        var collectParagraphText = function(pNode) {
          var buf = '';
          var walkInline = function(node) {
            if (!node || node.nodeType !== 1) return;
            var tag = getLocal(node);
            if (tag === 'del' || tag === 'instrtext' || tag === 'fallback' || tag === 'ppr' || tag === 'rpr') {
              return;
            }
            if (tag === 't') {
              buf += String(node.textContent || '');
              return;
            }
            if (tag === 'br' || tag === 'cr') {
              buf += '\n';
              return;
            }
            if (tag === 'tab') {
              buf += '\t';
              return;
            }
            var children = node.childNodes || [];
            for (var i = 0; i < children.length; i++) {
              walkInline(children[i]);
            }
          };
          walkInline(pNode);
          return buf.replace(/\r\n?/g, '\n');
        };

        var lines = [];
        var walkBlocks = function(container) {
          if (!container || !container.childNodes) return;
          for (var i = 0; i < container.childNodes.length; i++) {
            var child = container.childNodes[i];
            if (!child || child.nodeType !== 1) continue;
            var tag = getLocal(child);
            if (tag === 'del' || tag === 'fallback' || tag === 'sectpr' || tag === 'tblpr' || tag === 'tblgrid') {
              continue;
            }
            if (tag === 'p') {
              lines.push(collectParagraphText(child));
            } else if (tag === 'tbl') {
              var rows = child.childNodes || [];
              for (var r = 0; r < rows.length; r++) {
                var rowNode = rows[r];
                if (!rowNode || rowNode.nodeType !== 1 || getLocal(rowNode) !== 'tr') continue;
                var cellTexts = [];
                var cells = rowNode.childNodes || [];
                for (var c = 0; c < cells.length; c++) {
                  var cellNode = cells[c];
                  if (!cellNode || cellNode.nodeType !== 1 || getLocal(cellNode) !== 'tc') continue;
                  var cellParas = [];
                  var cellChildren = cellNode.childNodes || [];
                  for (var cp = 0; cp < cellChildren.length; cp++) {
                    var cc = cellChildren[cp];
                    if (cc && cc.nodeType === 1 && getLocal(cc) === 'p') {
                      var pt = collectParagraphText(cc).trim();
                      if (pt) cellParas.push(pt);
                    }
                  }
                  if (cellParas.length) cellTexts.push(cellParas.join('\n'));
                }
                if (cellTexts.length) lines.push(cellTexts.join('\t'));
              }
            } else {
              walkBlocks(child);
            }
          }
        };

        var bodyNodes = doc.getElementsByTagName ? doc.getElementsByTagName('w:body') : null;
        var rootEl = (bodyNodes && bodyNodes.length > 0) ? bodyNodes[0] : doc.documentElement;
        if (rootEl) {
          walkBlocks(rootEl);
          return lines
            .join('\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        }
      } catch (err) {
        if (err && err.message === 'XML_PARSE_ERROR') {
          throw err;
        }
      }
    }

    // 兜底 XML 段落提取（无 DOMParser 环境）
    var cleaned = src
      .replace(/<w:del\b[\s\S]*?<\/w:del>/gi, '')
      .replace(/<w:instrText\b[\s\S]*?<\/w:instrText>/gi, '');
    var pMatches = cleaned.match(/<w:p\b[\s\S]*?<\/w:p>/gi) || [];
    var fallbackLines = [];
    for (var idx = 0; idx < pMatches.length; idx++) {
      var pXml = pMatches[idx]
        .replace(/<w:(?:br|cr)\b[^>]*\/>/gi, '\n')
        .replace(/<w:tab\b[^>]*\/>/gi, '\t');
      var pieces = [];
      var tokenRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|(\n|\t)/gi;
      var m;
      while ((m = tokenRe.exec(pXml)) !== null) {
        if (m[1] !== undefined) {
          pieces.push(decodeXmlEntities(m[1]));
        } else if (m[2] !== undefined) {
          pieces.push(m[2]);
        }
      }
      fallbackLines.push(pieces.join(''));
    }
    return fallbackLines
      .join('\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function importWorldBookFromDocx(arrayBuffer, filename) {
    var JSZipCtor = global.JSZip;
    if (typeof JSZipCtor !== 'function') {
      return { ok: false, error: '导入失败：未检测到 DOCX 解压组件，请刷新页面后重试' };
    }
    if (!arrayBuffer || (arrayBuffer.byteLength !== undefined && arrayBuffer.byteLength === 0)) {
      return { ok: false, error: '导入失败：DOCX 文件为空' };
    }
    var zip;
    try {
      zip = await JSZipCtor.loadAsync(arrayBuffer);
    } catch (_) {
      return { ok: false, error: '导入失败：无法解析该 DOCX 文件，请确认文件未损坏' };
    }
    var docEntry = zip.file('word/document.xml');
    if (!docEntry && zip.files) {
      var zipKeys = Object.keys(zip.files);
      for (var i = 0; i < zipKeys.length; i++) {
        if (String(zipKeys[i]).toLowerCase() === 'word/document.xml') {
          docEntry = zip.files[zipKeys[i]];
          break;
        }
      }
    }
    if (!docEntry) {
      return { ok: false, error: '导入失败：DOCX 文件缺少正文内容（word/document.xml）' };
    }
    var xmlText = '';
    try {
      xmlText = await docEntry.async('string');
    } catch (_) {
      return { ok: false, error: '导入失败：读取 DOCX 正文失败' };
    }
    var extractedText = '';
    try {
      extractedText = extractTextFromWordXml(xmlText);
    } catch (_) {
      return { ok: false, error: '导入失败：DOCX 文档结构损坏，无法提取正文' };
    }
    if (!extractedText) {
      return { ok: false, error: '导入失败：DOCX 文档中没有可提取的正文内容' };
    }

    var rawFilename = String(filename || '').split(/[\\/]/).pop() || '';
    var bookName = rawFilename.replace(/\.docx$/i, '').trim().slice(0, 80) || '未命名世界书';
    var now = Date.now();
    var entry = normalizeWorldBookEntry({
      id: generateWorldBookEntryId(),
      uid: 0,
      comment: '正文',
      content: extractedText,
      disable: false,
      constant: true,
      key: [],
      order: 100,
      createdAt: now,
      updatedAt: now
    }, 0);
    var created = await createWorldBook({
      id: generateWorldBookId(),
      name: bookName,
      description: '',
      enabled: true,
      entries: [entry],
      extraFields: {}
    });
    return {
      ok: true,
      book: created,
      entryCount: Array.isArray(created.entries) ? created.entries.length : 0
    };
  }

  var CP1252_HIGH_MAP = {
    0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026,
    0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160,
    0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019,
    0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
    0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153,
    0x9E: 0x017E, 0x9F: 0x0178
  };

  function decodeCp1252Bytes(bytes, start, length) {
    var end = Math.min(bytes.length, start + length);
    var out = '';
    for (var i = start; i < end; i++) {
      var b = bytes[i];
      out += String.fromCharCode(CP1252_HIGH_MAP[b] || b);
    }
    return out;
  }

  function decodeUtf16LeBytes(bytes, start, byteLength) {
    var end = Math.min(bytes.length, start + byteLength);
    var chunks = [];
    var buf = '';
    for (var i = start; i + 1 < end; i += 2) {
      var code = bytes[i] | (bytes[i + 1] << 8);
      buf += String.fromCharCode(code);
      if (buf.length >= 4096) {
        chunks.push(buf);
        buf = '';
      }
    }
    if (buf) chunks.push(buf);
    return chunks.join('');
  }

  function cleanMsDocExtractedText(rawText) {
    var src = String(rawText || '');
    // 处理 Word 域代码：\x13（开始）... \x14（分隔）... \x15（结束），仅保留可见显示文本
    var out = '';
    var stack = [];
    for (var i = 0; i < src.length; i++) {
      var ch = src[i];
      var code = src.charCodeAt(i);
      if (code === 0x13) {
        stack.push({ visible: false });
        continue;
      }
      if (code === 0x14) {
        if (stack.length) stack[stack.length - 1].visible = true;
        continue;
      }
      if (code === 0x15) {
        if (stack.length) stack.pop();
        continue;
      }
      var inHiddenInstr = false;
      for (var s = 0; s < stack.length; s++) {
        if (!stack[s].visible) {
          inHiddenInstr = true;
          break;
        }
      }
      if (!inHiddenInstr) out += ch;
    }

    return out
      .replace(/\r\n/g, '\n')
      .replace(/\x07\x07/g, '\n')
      .replace(/\x07/g, '\t')
      .replace(/\r/g, '\n')
      .replace(/\x0B/g, '\n')
      .replace(/\x0C/g, '\n\n')
      .replace(/[\x00-\x08\x0E-\x1F\x7F]/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function parseOle2Streams(bytes) {
    if (!bytes || bytes.length < 512) {
      return { ok: false, error: '导入失败：DOC 文件损坏或长度不足' };
    }
    var sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    for (var si = 0; si < 8; si++) {
      if (bytes[si] !== sig[si]) {
        return { ok: false, error: 'NOT_OLE2' };
      }
    }
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var sectorShift = view.getUint16(0x1E, true);
    var miniSectorShift = view.getUint16(0x20, true);
    if (sectorShift < 7 || sectorShift > 16 || miniSectorShift < 4 || miniSectorShift > sectorShift) {
      return { ok: false, error: '导入失败：DOC 文件头参数无效' };
    }
    var sectorSize = 1 << sectorShift;
    var miniSectorSize = 1 << miniSectorShift;
    var firstDirSector = view.getUint32(0x30, true);
    var miniCutoff = view.getUint32(0x38, true);
    var firstMiniFatSector = view.getUint32(0x3C, true);
    var numMiniFatSectors = view.getUint32(0x40, true);
    var firstDifatSector = view.getUint32(0x44, true);
    var numDifatSectors = view.getUint32(0x48, true);
    var ENDOFCHAIN = 0xFFFFFFFE;
    var FREESECT = 0xFFFFFFFF;
    var MAXREGSECT = 0xFFFFFFFA;

    var sectorOffset = function(secId) {
      return (secId + 1) * sectorSize;
    };

    var fatSectorIds = [];
    for (var d = 0; d < 109; d++) {
      var sid = view.getUint32(0x4C + d * 4, true);
      if (sid <= MAXREGSECT) fatSectorIds.push(sid);
    }
    var curDifat = firstDifatSector;
    var difatGuard = 0;
    var entriesPerDifat = (sectorSize / 4) - 1;
    while (curDifat <= MAXREGSECT && difatGuard < numDifatSectors + 64) {
      difatGuard++;
      var doff = sectorOffset(curDifat);
      if (doff + sectorSize > bytes.length) break;
      for (var j = 0; j < entriesPerDifat; j++) {
        var fsid = view.getUint32(doff + j * 4, true);
        if (fsid <= MAXREGSECT) fatSectorIds.push(fsid);
      }
      curDifat = view.getUint32(doff + entriesPerDifat * 4, true);
    }

    var fat = [];
    var intsPerSector = sectorSize / 4;
    for (var fi = 0; fi < fatSectorIds.length; fi++) {
      var foff = sectorOffset(fatSectorIds[fi]);
      if (foff + sectorSize > bytes.length) continue;
      for (var k = 0; k < intsPerSector; k++) {
        fat.push(view.getUint32(foff + k * 4, true));
      }
    }

    var readChain = function(startSec, maxBytes) {
      if (startSec > MAXREGSECT) return new Uint8Array(0);
      var chunks = [];
      var total = 0;
      var cur = startSec;
      var seen = {};
      var limit = typeof maxBytes === 'number' && maxBytes >= 0 ? maxBytes : bytes.length;
      while (cur <= MAXREGSECT && !seen[cur] && total < limit) {
        seen[cur] = true;
        var off = sectorOffset(cur);
        if (off >= bytes.length) break;
        var take = Math.min(sectorSize, bytes.length - off, limit - total);
        chunks.push(bytes.subarray(off, off + take));
        total += take;
        cur = cur < fat.length ? fat[cur] : ENDOFCHAIN;
      }
      var merged = new Uint8Array(total);
      var pos = 0;
      for (var ci = 0; ci < chunks.length; ci++) {
        merged.set(chunks[ci], pos);
        pos += chunks[ci].length;
      }
      return merged;
    };

    var dirBytes = readChain(firstDirSector, bytes.length);
    if (dirBytes.length < 128) {
      return { ok: false, error: '导入失败：DOC 目录结构损坏' };
    }
    var dirView = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
    var dirEntries = [];
    var rootEntry = null;
    for (var off = 0; off + 128 <= dirBytes.length; off += 128) {
      var nameLen = dirView.getUint16(off + 0x40, true);
      var objType = dirBytes[off + 0x42];
      if (objType === 0 || nameLen < 2 || nameLen > 64) continue;
      var name = decodeUtf16LeBytes(dirBytes, off, nameLen - 2);
      var startSector = dirView.getUint32(off + 0x74, true);
      var streamSize = dirView.getUint32(off + 0x78, true);
      var item = { name: name, type: objType, startSector: startSector, size: streamSize };
      dirEntries.push(item);
      if (objType === 5 && !rootEntry) rootEntry = item;
    }

    var miniFat = [];
    if (firstMiniFatSector <= MAXREGSECT && numMiniFatSectors > 0) {
      var mfBytes = readChain(firstMiniFatSector, numMiniFatSectors * sectorSize);
      var mfView = new DataView(mfBytes.buffer, mfBytes.byteOffset, mfBytes.byteLength);
      for (var mi = 0; mi + 4 <= mfBytes.length; mi += 4) {
        miniFat.push(mfView.getUint32(mi, true));
      }
    }
    var miniStream = (rootEntry && rootEntry.startSector <= MAXREGSECT && rootEntry.size > 0)
      ? readChain(rootEntry.startSector, rootEntry.size)
      : new Uint8Array(0);

    var readMiniChain = function(startSec, size) {
      if (startSec > MAXREGSECT || !miniStream.length || !size) return new Uint8Array(0);
      var merged = new Uint8Array(size);
      var pos = 0;
      var cur = startSec;
      var seen = {};
      while (cur <= MAXREGSECT && !seen[cur] && pos < size) {
        seen[cur] = true;
        var moff = cur * miniSectorSize;
        if (moff >= miniStream.length) break;
        var take = Math.min(miniSectorSize, miniStream.length - moff, size - pos);
        merged.set(miniStream.subarray(moff, moff + take), pos);
        pos += take;
        cur = cur < miniFat.length ? miniFat[cur] : ENDOFCHAIN;
        if (cur === FREESECT) break;
      }
      return pos < size ? merged.subarray(0, pos) : merged;
    };

    var streams = {};
    for (var ei = 0; ei < dirEntries.length; ei++) {
      var de = dirEntries[ei];
      if (de.type !== 2) continue;
      streams[de.name] = de.size < miniCutoff
        ? readMiniChain(de.startSector, de.size)
        : readChain(de.startSector, de.size);
    }
    return { ok: true, streams: streams };
  }

  function extractTextFromOle2Doc(bytes) {
    var ole = parseOle2Streams(bytes);
    if (!ole.ok) return ole;
    var wordDoc = ole.streams.WordDocument;
    if (!wordDoc || wordDoc.length < 0x1B0) {
      return { ok: false, error: '导入失败：该文件不是有效的 Word .doc 文档（缺少 WordDocument 流）' };
    }
    var wdView = new DataView(wordDoc.buffer, wordDoc.byteOffset, wordDoc.byteLength);
    var flags = wdView.getUint16(0x0A, true);
    if (flags & 0x0100) {
      return { ok: false, error: '导入失败：该 .doc 文档已加密，无法直接提取正文' };
    }
    var useTable1 = !!(flags & 0x0200);
    var tableStream = ole.streams[useTable1 ? '1Table' : '0Table'] || ole.streams['1Table'] || ole.streams['0Table'];
    var ccpText = wdView.getUint32(0x4C, true);

    if (tableStream && wordDoc.length >= 0x1AA) {
      var fcClx = wdView.getUint32(0x01A2, true);
      var lcbClx = wdView.getUint32(0x01A6, true);
      if (lcbClx > 0 && fcClx + lcbClx <= tableStream.length) {
        var tView = new DataView(tableStream.buffer, tableStream.byteOffset, tableStream.byteLength);
        var pos = fcClx;
        var clxEnd = fcClx + lcbClx;
        while (pos < clxEnd && tableStream[pos] === 0x01) {
          if (pos + 3 > clxEnd) break;
          var cbGrpprl = tView.getUint16(pos + 1, true);
          pos += 3 + cbGrpprl;
        }
        if (pos + 5 <= clxEnd && tableStream[pos] === 0x02) {
          var plcSize = tView.getUint32(pos + 1, true);
          var plcStart = pos + 5;
          if (plcSize >= 16 && plcStart + plcSize <= tableStream.length) {
            var pieceCount = Math.floor((plcSize - 4) / 12);
            var pcdBase = plcStart + (pieceCount + 1) * 4;
            var parts = [];
            for (var pi = 0; pi < pieceCount; pi++) {
              var cpStart = tView.getUint32(plcStart + pi * 4, true);
              var cpEnd = tView.getUint32(plcStart + (pi + 1) * 4, true);
              if (ccpText > 0 && cpStart >= ccpText) break;
              var effEnd = (ccpText > 0 && cpEnd > ccpText) ? ccpText : cpEnd;
              if (effEnd <= cpStart) continue;
              var charCount = effEnd - cpStart;
              var pcdOff = pcdBase + pi * 8;
              if (pcdOff + 8 > tableStream.length) break;
              var fcRaw = tView.getUint32(pcdOff + 2, true);
              var isCompressed = !!(fcRaw & 0x40000000);
              var fcMasked = fcRaw & 0x3FFFFFFF;
              if (isCompressed) {
                var byteOff = fcMasked >>> 1;
                if (byteOff < wordDoc.length) {
                  parts.push(decodeCp1252Bytes(wordDoc, byteOff, charCount));
                }
              } else {
                var uOff = fcMasked;
                if (uOff < wordDoc.length) {
                  parts.push(decodeUtf16LeBytes(wordDoc, uOff, charCount * 2));
                }
              }
            }
            var pieceText = cleanMsDocExtractedText(parts.join(''));
            if (pieceText) {
              return { ok: true, text: pieceText };
            }
          }
        }
      }
    }

    // Word 6.0 / 95 简单文档兜底（无 Piece Table 时按 fcMin..fcMac 读取）
    var fcMin = wdView.getUint32(0x18, true);
    var fcMac = wdView.getUint32(0x1C, true);
    if (fcMac > fcMin && fcMac <= wordDoc.length) {
      var legacyRaw = decodeCp1252Bytes(wordDoc, fcMin, Math.min(fcMac - fcMin, 2 * 1024 * 1024));
      var legacyText = cleanMsDocExtractedText(legacyRaw);
      if (legacyText) {
        return { ok: true, text: legacyText };
      }
    }

    return { ok: false, error: '导入失败：DOC 文档中未提取到有效正文内容' };
  }

  function decodeBytesSmart(bytes) {
    if (typeof global.TextDecoder === 'function') {
      try {
        var utf8 = new global.TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (utf8) return utf8;
      } catch (_) {}
      try {
        var gbk = new global.TextDecoder('gb18030').decode(bytes);
        if (gbk) return gbk;
      } catch (_) {}
      try {
        return new global.TextDecoder('utf-8').decode(bytes);
      } catch (_) {}
    }
    return decodeCp1252Bytes(bytes, 0, bytes.length);
  }

  function extractTextFromRtf(rtfText) {
    var src = String(rtfText || '');
    var skipDestinations = {
      fonttbl: true, colortbl: true, stylesheet: true, info: true, pict: true,
      object: true, header: true, footer: true, headerl: true, headerr: true,
      footerl: true, footerr: true, listtable: true, listoverridetable: true,
      revtbl: true, rsidtbl: true, mmathPr: true, generator: true, datafield: true,
      fldinst: true, themedata: true, colorschememapping: true, latentstyles: true
    };
    var stack = [{ uc: 1, skip: false }];
    var out = '';
    var hexRun = [];
    var flushHex = function() {
      if (!hexRun.length) return;
      var arr = new Uint8Array(hexRun);
      hexRun = [];
      if (typeof global.TextDecoder === 'function') {
        try {
          out += new global.TextDecoder('gb18030').decode(arr);
          return;
        } catch (_) {}
      }
      out += decodeCp1252Bytes(arr, 0, arr.length);
    };

    var i = 0;
    while (i < src.length) {
      var ch = src[i];
      var top = stack[stack.length - 1];
      if (ch === '{') {
        flushHex();
        stack.push({ uc: top.uc, skip: top.skip });
        i++;
        continue;
      }
      if (ch === '}') {
        flushHex();
        if (stack.length > 1) stack.pop();
        i++;
        continue;
      }
      if (ch === '\r' || ch === '\n') {
        i++;
        continue;
      }
      if (ch === '\\') {
        i++;
        if (i >= src.length) break;
        var next = src[i];
        if (next === '\\' || next === '{' || next === '}') {
          flushHex();
          if (!top.skip) out += next;
          i++;
          continue;
        }
        if (next === '~') {
          flushHex();
          if (!top.skip) out += ' ';
          i++;
          continue;
        }
        if (next === '*' && i + 1 < src.length) {
          flushHex();
          top.skip = true;
          i++;
          continue;
        }
        if (next === '\'') {
          var hexStr = src.slice(i + 1, i + 3);
          var byteVal = parseInt(hexStr, 16);
          if (!top.skip && Number.isFinite(byteVal)) {
            hexRun.push(byteVal);
          }
          i += 3;
          continue;
        }
        flushHex();
        var wordMatch = /^([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i, i + 40));
        if (wordMatch) {
          var word = wordMatch[1];
          var param = wordMatch[2] !== undefined ? parseInt(wordMatch[2], 10) : null;
          i += wordMatch[0].length;
          if (skipDestinations[word]) {
            top.skip = true;
          } else if (word === 'uc' && param !== null) {
            top.uc = Math.max(0, param);
          } else if (word === 'u' && param !== null) {
            var codePoint = param < 0 ? param + 65536 : param;
            if (!top.skip) out += String.fromCharCode(codePoint);
            // 跳过紧随其后的 uc 个替代字符
            var skipChars = top.uc;
            while (skipChars > 0 && i < src.length) {
              if (src[i] === '\\' && src[i + 1] === '\'') {
                i += 4;
              } else {
                i++;
              }
              skipChars--;
            }
          } else if (!top.skip) {
            if (word === 'par' || word === 'line') out += '\n';
            else if (word === 'tab') out += '\t';
            else if (word === 'emdash') out += '—';
            else if (word === 'endash') out += '–';
            else if (word === 'lquote') out += '‘';
            else if (word === 'rquote') out += '’';
            else if (word === 'ldblquote') out += '“';
            else if (word === 'rdblquote') out += '”';
          }
        } else {
          i++;
        }
        continue;
      }
      flushHex();
      if (!top.skip) out += ch;
      i++;
    }
    flushHex();
    return out
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function extractTextFromHtmlDoc(htmlStr) {
    var cleaned = String(htmlStr || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<head\b[\s\S]*?<\/head>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, '\n')
      .replace(/<\/(?:td|th)>/gi, '\t')
      .replace(/<[^>]+>/g, '');
    return decodeXmlEntities(cleaned)
      .replace(/&nbsp;/gi, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function importWorldBookFromDoc(arrayBuffer, filename) {
    if (!arrayBuffer || (arrayBuffer.byteLength !== undefined && arrayBuffer.byteLength === 0)) {
      return { ok: false, error: '导入失败：DOC 文件为空' };
    }
    var bytes = arrayBuffer instanceof Uint8Array
      ? arrayBuffer
      : new Uint8Array(arrayBuffer);

    // 1) 兼容扩展名为 .doc 但实际内容为 ZIP/.docx 的文档
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
      var zipRes = await importWorldBookFromDocx(arrayBuffer, String(filename || '').replace(/\.doc$/i, '.docx'));
      return zipRes;
    }

    var extractedText = '';
    // 2) 标准 Word 97-2003 OLE2 二进制 .doc
    if (bytes.length >= 8 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
      var oleRes = extractTextFromOle2Doc(bytes);
      if (!oleRes.ok) {
        return oleRes;
      }
      extractedText = oleRes.text;
    } else {
      // 3) 兼容常见以 .doc 后缀保存的 RTF 或 HTML 文档
      var headAscii = decodeCp1252Bytes(bytes, 0, Math.min(bytes.length, 512)).trim();
      if (/^\{\\rtf/i.test(headAscii)) {
        extractedText = extractTextFromRtf(decodeCp1252Bytes(bytes, 0, bytes.length));
      } else if (/^<(?:!doctype|html|head|body|meta|\?xml)/i.test(headAscii) || /<html\b/i.test(headAscii)) {
        extractedText = extractTextFromHtmlDoc(decodeBytesSmart(bytes));
      } else {
        return { ok: false, error: '导入失败：无法识别该 .doc 文件格式，请确认文件未损坏' };
      }
    }

    if (!extractedText) {
      return { ok: false, error: '导入失败：DOC 文档中没有可提取的正文内容' };
    }

    var rawFilename = String(filename || '').split(/[\\/]/).pop() || '';
    var bookName = rawFilename.replace(/\.doc$/i, '').trim().slice(0, 80) || '未命名世界书';
    var now = Date.now();
    var entry = normalizeWorldBookEntry({
      id: generateWorldBookEntryId(),
      uid: 0,
      comment: '正文',
      content: extractedText,
      disable: false,
      constant: true,
      key: [],
      order: 100,
      createdAt: now,
      updatedAt: now
    }, 0);
    var created = await createWorldBook({
      id: generateWorldBookId(),
      name: bookName,
      description: '',
      enabled: true,
      entries: [entry],
      extraFields: {}
    });
    return {
      ok: true,
      book: created,
      entryCount: Array.isArray(created.entries) ? created.entries.length : 0
    };
  }

  async function buildAllWorldBooksZipBlob(booksInput) {
    var JSZipCtor = global.JSZip;
    if (typeof JSZipCtor !== 'function') {
      throw new Error('未检测到 ZIP 打包组件');
    }
    var list = Array.isArray(booksInput) ? booksInput : await listWorldBooks();
    var zip = new JSZipCtor();
    var usedLowerNames = {};
    var filenames = [];

    for (var i = 0; i < list.length; i++) {
      var book = list[i];
      if (!book || typeof book !== 'object') continue;
      var baseFilename = buildWorldBookExportFilename(book);
      var stem = baseFilename.replace(/\.json$/i, '') || '世界书';
      var candidate = stem + '.json';
      var suffix = 2;
      while (usedLowerNames[candidate.toLowerCase()]) {
        candidate = stem + ' (' + suffix + ').json';
        suffix++;
      }
      usedLowerNames[candidate.toLowerCase()] = true;
      var jsonStr = buildWorldBookExportJson(book);
      zip.file(candidate, jsonStr);
      filenames.push(candidate);
    }

    var blob = await zip.generateAsync({ type: 'blob' });
    return {
      blob: blob,
      count: filenames.length,
      filenames: filenames
    };
  }

  // ===== 12. 知屿完整备份导出（汇总全部知屿数据，绝不混入或读取其他无关应用数据） =====
  async function buildFullBackupPayload() {
    var results = await Promise.all([
      getProfile(),
      getPersonalization(),
      getAppearance(),
      getGeneralSettings(),
      listPresets(),
      listWorldBooks(),
      listChats(),
      getMemorySettings(),
      listMemories(),
      listMemoryTasks(),
      listDeletedMemorySignatures(),
      getCustomApiConfig(),
      getSummaryApiConfig(),
      getSelectedModel(),
      dbGetConfig(KEYS.DEFAULT_PRESET_ID),
      dbGetConfig(KEYS.PRESET_IDS),
      dbGetConfig(KEYS.PRESETS_INIT),
      dbGetConfig(KEYS.WORLDBOOK_IDS),
      dbGetConfig(KEYS.CHAT_IDS),
      dbGetConfig(KEYS.MEMORY_IDS),
      dbGetConfig(KEYS.SELECTED_MODEL),
      listFavorites(),
      listApiPresets()
    ]);

    var profile = results[0];
    var personalization = results[1];
    var appearance = results[2];
    var general = results[3];
    var presets = Array.isArray(results[4]) ? results[4] : [];
    var worldbooks = Array.isArray(results[5]) ? results[5] : [];
    var chats = Array.isArray(results[6]) ? results[6] : [];
    var memorySettings = results[7];
    var memories = Array.isArray(results[8]) ? results[8] : [];
    var memoryTasks = Array.isArray(results[9]) ? results[9] : [];
    var deletedSignatures = Array.isArray(results[10]) ? results[10] : [];
    var customApi = results[11];
    var summaryApi = results[12];
    var selectedModel = results[13];
    var rawDefaultPresetId = results[14];
    var rawPresetIds = results[15];
    var rawPresetsInit = results[16];
    var rawWorldbookIds = results[17];
    var rawChatIds = results[18];
    var rawMemoryIds = results[19];
    var rawSelectedModel = results[20];
    var favorites = Array.isArray(results[21]) ? results[21] : [];
    var apiPresets = Array.isArray(results[22]) ? results[22] : [];

    var defaultPreset = presets.find(function(p) { return p && p.isDefault; }) || null;
    var defaultPresetId = String(rawDefaultPresetId || (defaultPreset && defaultPreset.id) || '').trim();

    var globalWorldBookIds = [];
    var enabledGlobalWorldBookIds = [];
    var worldbookEntryCount = 0;
    for (var wi = 0; wi < worldbooks.length; wi++) {
      var wb = worldbooks[wi];
      if (!wb || !wb.id) continue;
      if (Array.isArray(wb.entries)) worldbookEntryCount += wb.entries.length;
      if (wb.globalEnabled === true) {
        globalWorldBookIds.push(wb.id);
        if (wb.enabled !== false) {
          enabledGlobalWorldBookIds.push(wb.id);
        }
      }
    }

    var presetBindings = presets.map(function(p) {
      return {
        presetId: p.id,
        presetName: p.name,
        worldBookIds: normalizeWorldBookIdList(p.worldBookIds)
      };
    });

    var totalMessages = 0;
    var chatBindings = chats.map(function(c) {
      var msgLen = Array.isArray(c.messages) ? c.messages.length : 0;
      totalMessages += msgLen;
      return {
        chatId: c.id,
        chatTitle: c.title,
        presetId: String(c.presetId || '').trim(),
        presetSnapshotWorldBookIds: (c.presetSnapshot && Array.isArray(c.presetSnapshot.worldBookIds))
          ? normalizeWorldBookIdList(c.presetSnapshot.worldBookIds)
          : []
      };
    });

    var nowMs = Date.now();
    return {
      format: 'wanwan-aiw-backup',
      version: 2,
      scope: 'full',
      exportedAt: new Date(nowMs).toISOString(),
      exportedAtMs: nowMs,
      profile: deepClone(profile),
      personalization: deepClone(personalization),
      appearance: deepClone(appearance),
      general: deepClone(general),
      presets: deepClone(presets),
      presetOrder: Array.isArray(rawPresetIds) ? rawPresetIds.slice() : presets.map(function(p) { return p.id; }),
      defaultPresetId: defaultPresetId,
      presetsInitialized: rawPresetsInit === true,
      worldbooks: deepClone(worldbooks),
      worldbookOrder: Array.isArray(rawWorldbookIds) ? rawWorldbookIds.slice() : worldbooks.map(function(w) { return w.id; }),
      worldbookAssociations: {
        globalWorldBookIds: globalWorldBookIds,
        enabledGlobalWorldBookIds: enabledGlobalWorldBookIds,
        presetBindings: presetBindings,
        chatBindings: chatBindings
      },
      chats: deepClone(chats),
      chatOrder: Array.isArray(rawChatIds) ? rawChatIds.slice() : chats.map(function(c) { return c.id; }),
      favorites: deepClone(favorites),
      memory: {
        settings: deepClone(memorySettings),
        memories: deepClone(memories),
        memoryOrder: Array.isArray(rawMemoryIds) ? rawMemoryIds.slice() : memories.map(function(m) { return m.id; }),
        tasks: deepClone(memoryTasks),
        deletedSignatures: deepClone(deletedSignatures)
      },
      apiConfig: {
        customApi: deepClone(customApi),
        summaryApi: deepClone(summaryApi),
        selectedModel: String(selectedModel || '').trim(),
        selectedModelDetail: rawSelectedModel && typeof rawSelectedModel === 'object' ? deepClone(rawSelectedModel) : null,
        apiPresets: deepClone(apiPresets)
      },
      counts: {
        chats: chats.length,
        messages: totalMessages,
        favorites: favorites.length,
        memories: memories.length,
        memoryTasks: memoryTasks.length,
        deletedMemorySignatures: deletedSignatures.length,
        presets: presets.length,
        apiPresets: apiPresets.length,
        worldbooks: worldbooks.length,
        worldbookEntries: worldbookEntryCount
      }
    };
  }

  async function buildFullBackupJson() {
    var payload = await buildFullBackupPayload();
    return {
      payload: payload,
      json: JSON.stringify(payload, null, 2)
    };
  }

  // ===== 13. 知屿备份解析、校验、事务快照与双模式导入（合并去重 / 覆盖恢复，严格隔离 aiw_*） =====
  function isPlainObject(val) {
    return !!(val && typeof val === 'object' && !Array.isArray(val));
  }

  function isZhiyuStorageKey(key) {
    return typeof key === 'string' && key.indexOf('aiw_') === 0;
  }

  function parseFullBackupJson(rawText) {
    var text = String(rawText == null ? '' : rawText).trim();
    if (!text) {
      return { ok: false, error: '导入失败：备份文件内容为空' };
    }
    var rawParsed;
    try {
      rawParsed = JSON.parse(text);
    } catch (_) {
      return { ok: false, error: '导入失败：JSON 文件格式无效，请确认选择了正确的备份文件' };
    }
    if (!isPlainObject(rawParsed)) {
      return { ok: false, error: '导入失败：备份文件内容不是有效的 JSON 对象' };
    }

    var safe = stripUnsafeJsonKeys(rawParsed);
    if (safe.format !== 'wanwan-aiw-backup') {
      return { ok: false, error: '导入失败：不支持的文件格式（仅支持知屿备份 wanwan-aiw-backup JSON）' };
    }

    var version = Number(safe.version);
    if (!Number.isInteger(version) || (version !== 1 && version !== 2)) {
      return { ok: false, error: '导入失败：不支持的知屿备份版本（version=' + String(safe.version) + '）' };
    }

    var optionalObjFields = ['profile', 'personalization', 'appearance', 'general', 'worldbookAssociations', 'memory', 'apiConfig'];
    for (var oi = 0; oi < optionalObjFields.length; oi++) {
      var ofName = optionalObjFields[oi];
      if (safe[ofName] !== undefined && safe[ofName] !== null && !isPlainObject(safe[ofName])) {
        return { ok: false, error: '导入失败：备份字段 ' + ofName + ' 格式无效' };
      }
    }

    var optionalArrFields = ['presets', 'worldbooks', 'chats', 'favorites'];
    for (var ai = 0; ai < optionalArrFields.length; ai++) {
      var afName = optionalArrFields[ai];
      if (safe[afName] !== undefined && safe[afName] !== null && !Array.isArray(safe[afName])) {
        return { ok: false, error: '导入失败：备份字段 ' + afName + ' 应为数组格式' };
      }
    }

    var hasAnySection = !!(
      safe.profile !== undefined ||
      safe.personalization !== undefined ||
      safe.appearance !== undefined ||
      safe.general !== undefined ||
      safe.presets !== undefined ||
      safe.worldbooks !== undefined ||
      safe.chats !== undefined ||
      safe.favorites !== undefined ||
      safe.memory !== undefined ||
      safe.apiConfig !== undefined
    );
    if (!hasAnySection) {
      return { ok: false, error: '导入失败：备份文件中未包含任何有效知屿数据' };
    }

    // 校验并规范化 presets
    var presets = [];
    var hasPresetsSection = Array.isArray(safe.presets);
    if (hasPresetsSection) {
      for (var pi = 0; pi < safe.presets.length; pi++) {
        if (!isPlainObject(safe.presets[pi])) {
          return { ok: false, error: '导入失败：第 ' + (pi + 1) + ' 条预设格式无效' };
        }
        presets.push(normalizePreset(safe.presets[pi], safe.presets[pi].id));
      }
    }

    // 校验并规范化 worldbooks
    var worldbooks = [];
    var hasWorldbooksSection = Array.isArray(safe.worldbooks);
    var worldbookEntryCount = 0;
    if (hasWorldbooksSection) {
      for (var wi = 0; wi < safe.worldbooks.length; wi++) {
        var rawWb = safe.worldbooks[wi];
        if (!isPlainObject(rawWb)) {
          return { ok: false, error: '导入失败：第 ' + (wi + 1) + ' 本世界书格式无效' };
        }
        if (rawWb.entries !== undefined && !Array.isArray(rawWb.entries)) {
          return { ok: false, error: '导入失败：第 ' + (wi + 1) + ' 本世界书的词条列表格式无效' };
        }
        if (Array.isArray(rawWb.entries)) {
          for (var wei = 0; wei < rawWb.entries.length; wei++) {
            if (!isPlainObject(rawWb.entries[wei])) {
              return { ok: false, error: '导入失败：第 ' + (wi + 1) + ' 本世界书第 ' + (wei + 1) + ' 条词条格式无效' };
            }
          }
        }
        var normWb = normalizeWorldBookRecord(rawWb, rawWb.id);
        worldbookEntryCount += normWb.entries.length;
        worldbooks.push(normWb);
      }
    }

    // 校验并规范化 worldbookAssociations
    var worldbookAssociations = isPlainObject(safe.worldbookAssociations) ? safe.worldbookAssociations : null;
    if (worldbookAssociations) {
      if (worldbookAssociations.presetBindings !== undefined && !Array.isArray(worldbookAssociations.presetBindings)) {
        return { ok: false, error: '导入失败：worldbookAssociations.presetBindings 格式无效' };
      }
      if (worldbookAssociations.globalWorldBookIds !== undefined && !Array.isArray(worldbookAssociations.globalWorldBookIds)) {
        return { ok: false, error: '导入失败：worldbookAssociations.globalWorldBookIds 格式无效' };
      }
    }

    // 校验并规范化 chats 与 messages
    var chats = [];
    var hasChatsSection = Array.isArray(safe.chats);
    var messagesCount = 0;
    if (hasChatsSection) {
      for (var ci = 0; ci < safe.chats.length; ci++) {
        var rawChat = safe.chats[ci];
        if (!isPlainObject(rawChat)) {
          return { ok: false, error: '导入失败：第 ' + (ci + 1) + ' 个对话格式无效' };
        }
        if (rawChat.messages !== undefined && !Array.isArray(rawChat.messages)) {
          return { ok: false, error: '导入失败：第 ' + (ci + 1) + ' 个对话的消息列表格式无效' };
        }
        if (Array.isArray(rawChat.messages)) {
          for (var mi = 0; mi < rawChat.messages.length; mi++) {
            if (!isPlainObject(rawChat.messages[mi])) {
              return { ok: false, error: '导入失败：第 ' + (ci + 1) + ' 个对话第 ' + (mi + 1) + ' 条消息格式无效' };
            }
          }
        }
        var normChat = normalizeChatRecord(rawChat, rawChat.id);
        messagesCount += normChat.messages.length;
        chats.push(normChat);
      }
    }

    // 校验并规范化 favorites
    var favorites = [];
    var hasFavoritesSection = Array.isArray(safe.favorites);
    if (hasFavoritesSection) {
      for (var fvi = 0; fvi < safe.favorites.length; fvi++) {
        if (!isPlainObject(safe.favorites[fvi])) {
          return { ok: false, error: '导入失败：第 ' + (fvi + 1) + ' 条收藏记录格式无效' };
        }
        var normFav = normalizeFavoriteRecord(safe.favorites[fvi]);
        if (normFav.content.trim()) {
          favorites.push(normFav);
        }
      }
    }

    // 校验并规范化 memory
    var hasMemorySection = isPlainObject(safe.memory);
    var memoryData = {
      settings: null,
      memories: [],
      memoryOrder: [],
      tasks: [],
      deletedSignatures: []
    };
    if (hasMemorySection) {
      var rawMemObj = safe.memory;
      if (rawMemObj.settings !== undefined && rawMemObj.settings !== null && !isPlainObject(rawMemObj.settings)) {
        return { ok: false, error: '导入失败：memory.settings 格式无效' };
      }
      if (rawMemObj.memories !== undefined && rawMemObj.memories !== null && !Array.isArray(rawMemObj.memories)) {
        return { ok: false, error: '导入失败：memory.memories 应为数组格式' };
      }
      if (rawMemObj.tasks !== undefined && rawMemObj.tasks !== null && !Array.isArray(rawMemObj.tasks)) {
        return { ok: false, error: '导入失败：memory.tasks 应为数组格式' };
      }
      if (rawMemObj.deletedSignatures !== undefined && rawMemObj.deletedSignatures !== null && !Array.isArray(rawMemObj.deletedSignatures)) {
        return { ok: false, error: '导入失败：memory.deletedSignatures 应为数组格式' };
      }
      if (Array.isArray(rawMemObj.memories)) {
        for (var mri = 0; mri < rawMemObj.memories.length; mri++) {
          if (!isPlainObject(rawMemObj.memories[mri])) {
            return { ok: false, error: '导入失败：第 ' + (mri + 1) + ' 条记忆格式无效' };
          }
          var normMem = normalizeMemoryRecord(rawMemObj.memories[mri], rawMemObj.memories[mri].id);
          if (normMem.content) {
            memoryData.memories.push(normMem);
          }
        }
      }
      if (Array.isArray(rawMemObj.tasks)) {
        for (var ti = 0; ti < rawMemObj.tasks.length; ti++) {
          if (!isPlainObject(rawMemObj.tasks[ti])) {
            return { ok: false, error: '导入失败：第 ' + (ti + 1) + ' 条记忆任务格式无效' };
          }
          memoryData.tasks.push(normalizeMemoryTaskRecord(rawMemObj.tasks[ti]));
        }
      }
      if (Array.isArray(rawMemObj.deletedSignatures)) {
        for (var dsi = 0; dsi < rawMemObj.deletedSignatures.length; dsi++) {
          var ds = rawMemObj.deletedSignatures[dsi];
          if (isPlainObject(ds) && ds.norm) {
            memoryData.deletedSignatures.push({
              norm: String(ds.norm),
              content: String(ds.content || '').slice(0, 120),
              sourceChatId: String(ds.sourceChatId || ''),
              deletedAt: Number(ds.deletedAt) || Date.now()
            });
          }
        }
      }
      if (Array.isArray(rawMemObj.memoryOrder)) {
        memoryData.memoryOrder = rawMemObj.memoryOrder.filter(Boolean).map(String);
      }
      if (isPlainObject(rawMemObj.settings)) {
        memoryData.settings = rawMemObj.settings;
      }
    }

    // 校验并规范化 apiConfig
    var hasApiSection = isPlainObject(safe.apiConfig);
    var apiData = {
      customApi: null,
      summaryApi: null,
      selectedModel: '',
      apiPresets: [],
      hasApiPresetsSection: false
    };
    if (hasApiSection) {
      var rawApi = safe.apiConfig;
      if (rawApi.customApi !== undefined && rawApi.customApi !== null) {
        if (!isPlainObject(rawApi.customApi)) {
          return { ok: false, error: '导入失败：apiConfig.customApi 格式无效' };
        }
        var ca = rawApi.customApi;
        apiData.customApi = {
          baseUrl: normalizeBaseUrl(ca.baseUrl || ca.url || ''),
          apiKey: String(ca.apiKey || ca.key || '').trim(),
          model: String(ca.model || '').trim(),
          fetchedModels: Array.isArray(ca.fetchedModels) ? ca.fetchedModels.filter(Boolean).map(String) : [],
          temperature: normalizeTemperature(ca.temperature, 0.7),
          updatedAt: Number(ca.updatedAt) || 0
        };
        apiData.customApi.complete = isCustomApiComplete(apiData.customApi);
      }
      if (rawApi.summaryApi !== undefined && rawApi.summaryApi !== null) {
        if (!isPlainObject(rawApi.summaryApi)) {
          return { ok: false, error: '导入失败：apiConfig.summaryApi 格式无效' };
        }
        var sa = rawApi.summaryApi;
        apiData.summaryApi = {
          baseUrl: normalizeBaseUrl(sa.baseUrl || sa.url || ''),
          apiKey: String(sa.apiKey || sa.key || '').trim(),
          model: String(sa.model || '').trim(),
          temperature: normalizeTemperature(sa.temperature, 0.1),
          updatedAt: Number(sa.updatedAt) || 0
        };
        apiData.summaryApi.complete = isSummaryApiComplete(apiData.summaryApi);
      }
      if (rawApi.selectedModel != null) {
        apiData.selectedModel = String(rawApi.selectedModel).trim();
      } else if (isPlainObject(rawApi.selectedModelDetail) && rawApi.selectedModelDetail.model != null) {
        apiData.selectedModel = String(rawApi.selectedModelDetail.model).trim();
      }
      if (rawApi.apiPresets !== undefined && rawApi.apiPresets !== null) {
        if (!Array.isArray(rawApi.apiPresets)) {
          return { ok: false, error: '导入失败：apiConfig.apiPresets 应为数组格式' };
        }
        apiData.hasApiPresetsSection = true;
        for (var apiIdx = 0; apiIdx < rawApi.apiPresets.length; apiIdx++) {
          var rawAp = rawApi.apiPresets[apiIdx];
          if (!isPlainObject(rawAp)) {
            return { ok: false, error: '导入失败：第 ' + (apiIdx + 1) + ' 条 API 预设格式无效' };
          }
          var normAp = normalizeApiPresetRecord(rawAp, rawAp.id);
          if (!normAp.name && (normAp.baseUrl || normAp.apiKey || normAp.model)) {
            normAp.name = '导入 API 预设 ' + (apiIdx + 1);
          }
          if (normAp.name) {
            apiData.apiPresets.push(normAp);
          }
        }
      }
    }

    // 校验并规范化基础配置（profile / personalization / appearance / general）
    var profile = isPlainObject(safe.profile) ? {
      name: String(safe.profile.name || '我').trim() || '我',
      avatar: String(safe.profile.avatar || 'img/ava-00.jpg'),
      bio: safe.profile.bio != null ? String(safe.profile.bio) : '',
      updatedAt: Number(safe.profile.updatedAt) || 0
    } : null;

    var personalization = isPlainObject(safe.personalization) ? {
      enabled: typeof safe.personalization.enabled === 'boolean' ? safe.personalization.enabled : true,
      customInstructions: safe.personalization.customInstructions != null ? String(safe.personalization.customInstructions) : '',
      tone: safe.personalization.tone != null ? String(safe.personalization.tone) : '温和自然',
      detailLevel: safe.personalization.detailLevel != null ? String(safe.personalization.detailLevel) : '适中',
      userPreferences: safe.personalization.userPreferences != null ? String(safe.personalization.userPreferences) : '',
      updatedAt: Number(safe.personalization.updatedAt) || 0
    } : null;

    var appearance = null;
    if (isPlainObject(safe.appearance)) {
      var modeVal = String(safe.appearance.mode || 'system');
      if (['system', 'light', 'dark'].indexOf(modeVal) === -1) modeVal = 'system';
      var accentVal = String(safe.appearance.accent || 'pink');
      if (!ACCENT_PRESETS.some(function(a) { return a.id === accentVal; })) accentVal = 'pink';
      appearance = {
        mode: modeVal,
        accent: accentVal,
        updatedAt: Number(safe.appearance.updatedAt) || 0
      };
    }

    var general = isPlainObject(safe.general) ? {
      enterToSend: typeof safe.general.enterToSend === 'boolean' ? safe.general.enterToSend : true,
      autoUseDefaultPreset: typeof safe.general.autoUseDefaultPreset === 'boolean' ? safe.general.autoUseDefaultPreset : true,
      showCharCount: typeof safe.general.showCharCount === 'boolean' ? safe.general.showCharCount : true,
      updatedAt: Number(safe.general.updatedAt) || 0
    } : null;

    var isLegacyBackup = version === 1 && !hasChatsSection && !hasWorldbooksSection && !hasMemorySection && !hasApiSection && !hasFavoritesSection;

    return {
      ok: true,
      version: version,
      isLegacyBackup: isLegacyBackup,
      exportedAt: safe.exportedAt ? String(safe.exportedAt) : '',
      summary: {
        version: version,
        isLegacyBackup: isLegacyBackup,
        exportedAt: safe.exportedAt ? String(safe.exportedAt) : '',
        chatsCount: chats.length,
        messagesCount: messagesCount,
        favoritesCount: favorites.length,
        memoriesCount: memoryData.memories.length,
        memoryTasksCount: memoryData.tasks.length,
        presetsCount: presets.length,
        apiPresetsCount: apiData.apiPresets.length,
        worldbooksCount: worldbooks.length,
        worldbookEntriesCount: worldbookEntryCount,
        hasProfile: !!profile,
        hasPersonalization: !!personalization,
        hasAppearance: !!appearance,
        hasGeneral: !!general,
        hasApiConfig: !!(apiData.customApi || apiData.summaryApi || apiData.selectedModel || apiData.apiPresets.length)
      },
      data: {
        profile: profile,
        personalization: personalization,
        appearance: appearance,
        general: general,
        presets: presets,
        hasPresetsSection: hasPresetsSection,
        presetOrder: Array.isArray(safe.presetOrder) ? safe.presetOrder.filter(Boolean).map(String) : presets.map(function(p) { return p.id; }),
        defaultPresetId: safe.defaultPresetId ? String(safe.defaultPresetId).trim() : '',
        worldbooks: worldbooks,
        hasWorldbooksSection: hasWorldbooksSection,
        worldbookOrder: Array.isArray(safe.worldbookOrder) ? safe.worldbookOrder.filter(Boolean).map(String) : worldbooks.map(function(w) { return w.id; }),
        worldbookAssociations: worldbookAssociations,
        chats: chats,
        hasChatsSection: hasChatsSection,
        chatOrder: Array.isArray(safe.chatOrder) ? safe.chatOrder.filter(Boolean).map(String) : chats.map(function(c) { return c.id; }),
        favorites: favorites,
        hasFavoritesSection: hasFavoritesSection,
        memory: memoryData,
        hasMemorySection: hasMemorySection,
        apiConfig: apiData,
        hasApiSection: hasApiSection
      }
    };
  }

  async function collectAllZhiyuConfigKeys() {
    var keySet = {};
    var fixedKeys = [
      KEYS.PROFILE,
      KEYS.PERSONALIZATION,
      KEYS.APPEARANCE,
      KEYS.GENERAL,
      KEYS.PRESET_IDS,
      KEYS.PRESETS_INIT,
      KEYS.DEFAULT_PRESET_ID,
      KEYS.API_CONFIG,
      KEYS.SUMMARY_API_CONFIG,
      KEYS.API_PRESETS,
      KEYS.SELECTED_MODEL,
      KEYS.CHAT_IDS,
      KEYS.MEMORY_SETTINGS,
      KEYS.MEMORY_IDS,
      KEYS.MEMORY_TASKS,
      KEYS.DELETED_MEMORY_SIGS,
      KEYS.WORLDBOOK_IDS,
      KEYS.FAVORITES
    ];
    for (var fi = 0; fi < fixedKeys.length; fi++) {
      keySet[fixedKeys[fi]] = true;
    }

    var idMapPrefixes = [
      { indexKey: KEYS.PRESET_IDS, prefix: KEYS.PRESET_PREFIX },
      { indexKey: KEYS.WORLDBOOK_IDS, prefix: KEYS.WORLDBOOK_PREFIX },
      { indexKey: KEYS.CHAT_IDS, prefix: KEYS.CHAT_PREFIX },
      { indexKey: KEYS.MEMORY_IDS, prefix: KEYS.MEMORY_PREFIX }
    ];
    for (var pi = 0; pi < idMapPrefixes.length; pi++) {
      var list = await dbGetConfig(idMapPrefixes[pi].indexKey);
      if (Array.isArray(list)) {
        for (var li = 0; li < list.length; li++) {
          if (list[li]) keySet[idMapPrefixes[pi].prefix + String(list[li])] = true;
        }
      }
    }

    var cache = readLocalCache();
    var cacheKeys = Object.keys(cache);
    for (var ci = 0; ci < cacheKeys.length; ci++) {
      if (isZhiyuStorageKey(cacheKeys[ci])) {
        keySet[cacheKeys[ci]] = true;
      }
    }

    var dbRef = await waitForConfigDB(600);
    if (dbRef && dbRef.config && typeof dbRef.config.toArray === 'function') {
      try {
        var op = function() { return dbRef.config.toArray(); };
        var rows = typeof global.runWanWanDBRead === 'function'
          ? await global.runWanWanDBRead(op)
          : await op();
        if (Array.isArray(rows)) {
          for (var ri = 0; ri < rows.length; ri++) {
            if (rows[ri] && isZhiyuStorageKey(rows[ri].key)) {
              keySet[rows[ri].key] = true;
            }
          }
        }
      } catch (_) {}
    }

    return Object.keys(keySet);
  }

  async function snapshotAllWorkspaceKeys() {
    var keys = await collectAllZhiyuConfigKeys();
    var entries = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var val = await dbGetConfig(k);
      if (val !== undefined) {
        entries[k] = deepClone(val);
      }
    }
    var rawLocalCache = null;
    try {
      if (global.localStorage) {
        rawLocalCache = global.localStorage.getItem(CACHE_STORAGE_KEY);
      }
    } catch (_) {}
    return {
      entries: entries,
      rawLocalCache: rawLocalCache
    };
  }

  async function clearAllZhiyuWorkspaceKeys() {
    var keys = await collectAllZhiyuConfigKeys();
    for (var i = 0; i < keys.length; i++) {
      await dbDeleteConfig(keys[i]);
    }
    try {
      if (global.localStorage) {
        global.localStorage.removeItem(CACHE_STORAGE_KEY);
      }
    } catch (_) {}
  }

  async function restoreWorkspaceSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    await clearAllZhiyuWorkspaceKeys();
    var entries = snapshot.entries || {};
    var keys = Object.keys(entries);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!isZhiyuStorageKey(k)) continue;
      await dbPutConfig(k, entries[k]);
    }
    try {
      if (global.localStorage) {
        if (snapshot.rawLocalCache === null || snapshot.rawLocalCache === undefined) {
          global.localStorage.removeItem(CACHE_STORAGE_KEY);
        } else {
          global.localStorage.setItem(CACHE_STORAGE_KEY, snapshot.rawLocalCache);
        }
      }
    } catch (_) {}
  }

  function buildWorldBookSignature(wb) {
    var entries = Array.isArray(wb && wb.entries) ? wb.entries : [];
    var parts = entries.map(function(e) {
      return [
        String(e.comment || '').trim(),
        String(e.content || '').trim(),
        e.constant ? '1' : '0',
        e.disable ? '1' : '0',
        normalizeWorldBookKeywords(e.key).join(',')
      ].join('|');
    });
    return String((wb && wb.name) || '').trim() + '::' + parts.join(';;');
  }

  function buildPresetSignature(p) {
    return [
      String((p && p.name) || '').trim(),
      String((p && p.systemPrompt) || '').trim(),
      String((p && p.replyStyle) || '').trim(),
      String((p && p.detailLevel) || '').trim()
    ].join('\u0000');
  }

  function buildChatFingerprint(c) {
    var msgs = Array.isArray(c && c.messages) ? c.messages : [];
    var first = msgs[0] ? (String(msgs[0].role || '') + ':' + String(msgs[0].content || '').slice(0, 80)) : '';
    return String((c && c.title) || '').trim() + '|' + String((c && c.createdAt) || 0) + '|' + first;
  }

  function buildMemoryDedupKey(m) {
    return [
      String((m && m.category) || '备忘'),
      String((m && m.scope) || 'user'),
      normalizeDeletedSignatureText(m && m.content)
    ].join('|');
  }

  function collectExtraPresetBindingsMap(associations) {
    var map = {};
    if (!associations || !Array.isArray(associations.presetBindings)) return map;
    for (var i = 0; i < associations.presetBindings.length; i++) {
      var item = associations.presetBindings[i];
      if (!item || !item.presetId) continue;
      map[String(item.presetId)] = normalizeWorldBookIdList(item.worldBookIds);
    }
    return map;
  }

  function remapIdList(ids, idMap, validSet) {
    var list = Array.isArray(ids) ? ids : [];
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var raw = String(list[i] || '').trim();
      if (!raw) continue;
      var mapped = (idMap && idMap[raw]) ? idMap[raw] : raw;
      if (validSet && !validSet[mapped]) continue;
      if (seen[mapped]) continue;
      seen[mapped] = true;
      out.push(mapped);
    }
    return out;
  }

  function mergeWorldBookEntriesDedup(existingEntries, incomingEntries) {
    var result = Array.isArray(existingEntries) ? existingEntries.map(function(e, i) { return normalizeWorldBookEntry(e, i); }) : [];
    var byId = {};
    var bySig = {};
    var usedIds = {};
    for (var i = 0; i < result.length; i++) {
      var ex = result[i];
      byId[ex.id] = i;
      usedIds[ex.id] = true;
      bySig[String(ex.comment || '').trim() + '\n' + String(ex.content || '').trim()] = i;
    }

    var added = 0;
    var src = Array.isArray(incomingEntries) ? incomingEntries : [];
    for (var j = 0; j < src.length; j++) {
      var inc = normalizeWorldBookEntry(src[j], j);
      var sig = String(inc.comment || '').trim() + '\n' + String(inc.content || '').trim();
      if (byId[inc.id] !== undefined || bySig[sig] !== undefined) {
        continue;
      }
      if (usedIds[inc.id]) inc.id = generateWorldBookEntryId();
      usedIds[inc.id] = true;
      inc.uid = getNextWorldBookEntryUid(result);
      result.push(inc);
      byId[inc.id] = result.length - 1;
      bySig[sig] = result.length - 1;
      added++;
    }
    return { entries: result, added: added };
  }

  function mergeChatRecordsDedup(existingChat, incomingChat, remappedPresetId, remappedSnapshot) {
    var mergedMsgs = Array.isArray(existingChat.messages) ? existingChat.messages.map(normalizeChatMessage) : [];
    var msgIdSet = {};
    var msgSigSet = {};
    for (var i = 0; i < mergedMsgs.length; i++) {
      var em = mergedMsgs[i];
      msgIdSet[em.id] = true;
      msgSigSet[em.role + '|' + em.createdAt + '|' + em.content] = true;
    }

    var addedMessages = 0;
    var incMsgs = Array.isArray(incomingChat.messages) ? incomingChat.messages : [];
    for (var j = 0; j < incMsgs.length; j++) {
      var im = normalizeChatMessage(incMsgs[j]);
      var sig = im.role + '|' + im.createdAt + '|' + im.content;
      if (msgIdSet[im.id] || msgSigSet[sig]) continue;
      mergedMsgs.push(im);
      msgIdSet[im.id] = true;
      msgSigSet[sig] = true;
      addedMessages++;
    }

    mergedMsgs.sort(function(a, b) {
      return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
    });

    // 合并分段摘要并去重
    var mergedSegments = Array.isArray(existingChat.summarySegments) ? existingChat.summarySegments.slice() : [];
    var segKeySet = {};
    for (var si = 0; si < mergedSegments.length; si++) {
      var es = mergedSegments[si];
      segKeySet[es.id] = true;
      segKeySet[es.startMessageIndex + ':' + es.endMessageIndex + ':' + es.content] = true;
    }
    var incSegments = Array.isArray(incomingChat.summarySegments) ? incomingChat.summarySegments : [];
    for (var sj = 0; sj < incSegments.length; sj++) {
      var iseg = incSegments[sj];
      var sKey = iseg.startMessageIndex + ':' + iseg.endMessageIndex + ':' + iseg.content;
      if (segKeySet[iseg.id] || segKeySet[sKey]) continue;
      mergedSegments.push(iseg);
      segKeySet[iseg.id] = true;
      segKeySet[sKey] = true;
    }

    var useIncomingSummary = (!existingChat.summary && incomingChat.summary) ||
      (incomingChat.summary && (incomingChat.summaryUpdatedAt || 0) > (existingChat.summaryUpdatedAt || 0));

    var updated = normalizeChatRecord(Object.assign({}, existingChat, {
      pinned: !!(existingChat.pinned || incomingChat.pinned),
      messages: mergedMsgs,
      model: existingChat.model || incomingChat.model || '',
      presetId: existingChat.presetId || remappedPresetId || '',
      presetSnapshot: existingChat.presetSnapshot || remappedSnapshot || null,
      summary: useIncomingSummary ? incomingChat.summary : existingChat.summary,
      summaryLegacyBase: existingChat.summaryLegacyBase || incomingChat.summaryLegacyBase || '',
      summarySegments: mergedSegments,
      summaryUpToCount: Math.max(Number(existingChat.summaryUpToCount) || 0, Number(incomingChat.summaryUpToCount) || 0),
      summaryUpdatedAt: Math.max(Number(existingChat.summaryUpdatedAt) || 0, Number(incomingChat.summaryUpdatedAt) || 0),
      lastMemoryMessageId: existingChat.lastMemoryMessageId || incomingChat.lastMemoryMessageId || '',
      updatedAt: Math.max(Number(existingChat.updatedAt) || 0, Number(incomingChat.updatedAt) || 0)
    }), existingChat.id);

    return { chat: updated, addedMessages: addedMessages };
  }

  function mergeMemoryRecordsDedup(existingMem, incomingMem, chatIdMap) {
    var existingSources = Array.isArray(existingMem.sourceChats) ? existingMem.sourceChats.slice() : [];
    var sourceSeen = {};
    for (var si = 0; si < existingSources.length; si++) {
      var sk = existingSources[si].chatId || ('title:' + existingSources[si].chatTitle);
      if (sk) sourceSeen[sk] = true;
    }
    var incSources = Array.isArray(incomingMem.sourceChats) ? incomingMem.sourceChats : [];
    for (var sj = 0; sj < incSources.length; sj++) {
      var isrc = incSources[sj];
      var mappedCid = (chatIdMap && chatIdMap[isrc.chatId]) ? chatIdMap[isrc.chatId] : isrc.chatId;
      var k = mappedCid || ('title:' + isrc.chatTitle);
      if (!k || sourceSeen[k]) continue;
      sourceSeen[k] = true;
      existingSources.push({
        chatId: mappedCid,
        chatTitle: isrc.chatTitle,
        mentionedAt: isrc.mentionedAt
      });
    }

    var entityList = (existingMem.entities || []).concat(incomingMem.entities || []);
    var historyList = (existingMem.history || []).slice();
    var histSeen = {};
    for (var hi = 0; hi < historyList.length; hi++) {
      histSeen[historyList[hi].content + '|' + historyList[hi].updatedAt] = true;
    }
    var incHist = incomingMem.history || [];
    for (var hj = 0; hj < incHist.length; hj++) {
      var hk = incHist[hj].content + '|' + incHist[hj].updatedAt;
      if (!histSeen[hk]) {
        histSeen[hk] = true;
        historyList.push(incHist[hj]);
      }
    }

    var preferIncoming = (incomingMem.updatedAt || 0) > (existingMem.updatedAt || 0);
    return normalizeMemoryRecord(Object.assign({}, existingMem, {
      sourceChats: existingSources,
      entities: entityList,
      history: historyList,
      mentionCount: Math.max(Number(existingMem.mentionCount) || 1, Number(incomingMem.mentionCount) || 1),
      independentMentionCount: Math.max(Number(existingMem.independentMentionCount) || 1, Number(incomingMem.independentMentionCount) || 1),
      usageCount: Math.max(Number(existingMem.usageCount) || 0, Number(incomingMem.usageCount) || 0),
      lastUsedAt: Math.max(Number(existingMem.lastUsedAt) || 0, Number(incomingMem.lastUsedAt) || 0),
      importance: preferIncoming ? incomingMem.importance : existingMem.importance,
      updatedAt: Math.max(Number(existingMem.updatedAt) || 0, Number(incomingMem.updatedAt) || 0)
    }), existingMem.id);
  }

  async function importBackupFromJson(rawText, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var mode = opts.mode === 'overwrite' ? 'overwrite' : 'merge';

    // 1) 导入前先完整解析与校验；失败时直接返回，绝不修改任何现有数据
    var parsed = parseFullBackupJson(rawText);
    if (!parsed.ok) {
      return parsed;
    }

    // 2) 创建知屿数据事务快照，任何写入失败都会自动回滚，绝不影响弯弯机其他应用数据
    var snapshot = await snapshotAllWorkspaceKeys();
    var data = parsed.data;

    try {
      if (mode === 'overwrite') {
        await clearAllZhiyuWorkspaceKeys();

        // 基础配置
        if (data.profile) await dbPutConfig(KEYS.PROFILE, data.profile);
        if (data.personalization) await dbPutConfig(KEYS.PERSONALIZATION, data.personalization);
        if (data.appearance) await dbPutConfig(KEYS.APPEARANCE, data.appearance);
        if (data.general) await dbPutConfig(KEYS.GENERAL, data.general);

        // 世界书（含全局开关与关联）
        var validWbSet = {};
        var wbIds = [];
        var wbById = {};
        for (var wi = 0; wi < data.worldbooks.length; wi++) {
          var wb = normalizeWorldBookRecord(data.worldbooks[wi], data.worldbooks[wi].id);
          if (wbById[wb.id]) continue;
          wbById[wb.id] = wb;
          validWbSet[wb.id] = true;
          wbIds.push(wb.id);
        }
        if (data.worldbookAssociations && Array.isArray(data.worldbookAssociations.globalWorldBookIds)) {
          for (var gi = 0; gi < data.worldbookAssociations.globalWorldBookIds.length; gi++) {
            var gid = String(data.worldbookAssociations.globalWorldBookIds[gi] || '').trim();
            if (wbById[gid]) wbById[gid].globalEnabled = true;
          }
        }
        var orderedWbIds = [];
        var seenWbOrder = {};
        for (var woi = 0; woi < data.worldbookOrder.length; woi++) {
          var woid = data.worldbookOrder[woi];
          if (wbById[woid] && !seenWbOrder[woid]) {
            seenWbOrder[woid] = true;
            orderedWbIds.push(woid);
          }
        }
        for (var wbi = 0; wbi < wbIds.length; wbi++) {
          if (!seenWbOrder[wbIds[wbi]]) orderedWbIds.push(wbIds[wbi]);
          await dbPutConfig(KEYS.WORLDBOOK_PREFIX + wbIds[wbi], wbById[wbIds[wbi]]);
        }
        await dbPutConfig(KEYS.WORLDBOOK_IDS, orderedWbIds);

        // 预设与世界书关联
        var extraBindings = collectExtraPresetBindingsMap(data.worldbookAssociations);
        var presetById = {};
        var presetIds = [];
        var resolvedDefaultPresetId = data.defaultPresetId || '';
        for (var pi = 0; pi < data.presets.length; pi++) {
          var p = normalizePreset(data.presets[pi], data.presets[pi].id);
          var combinedWbIds = normalizeWorldBookIdList((p.worldBookIds || []).concat(extraBindings[p.id] || []));
          p.worldBookIds = combinedWbIds.filter(function(id) { return !!validWbSet[id]; });
          if (presetById[p.id]) continue;
          presetById[p.id] = p;
          presetIds.push(p.id);
          if (!resolvedDefaultPresetId && p.isDefault) resolvedDefaultPresetId = p.id;
        }
        if (resolvedDefaultPresetId && !presetById[resolvedDefaultPresetId]) {
          resolvedDefaultPresetId = presetIds[0] || '';
        }
        var orderedPresetIds = [];
        var seenPOrder = {};
        for (var poi = 0; poi < data.presetOrder.length; poi++) {
          var poid = data.presetOrder[poi];
          if (presetById[poid] && !seenPOrder[poid]) {
            seenPOrder[poid] = true;
            orderedPresetIds.push(poid);
          }
        }
        for (var pbi = 0; pbi < presetIds.length; pbi++) {
          var pid = presetIds[pbi];
          if (!seenPOrder[pid]) orderedPresetIds.push(pid);
          presetById[pid].isDefault = pid === resolvedDefaultPresetId;
          await dbPutConfig(KEYS.PRESET_PREFIX + pid, presetById[pid]);
        }
        await dbPutConfig(KEYS.PRESET_IDS, orderedPresetIds);
        await dbPutConfig(KEYS.DEFAULT_PRESET_ID, resolvedDefaultPresetId);
        await dbPutConfig(KEYS.PRESETS_INIT, true);

        // 接口与模型配置（优先写入，以便后续 sanitizeMemorySettings 正确校验 summaryModelMode）
        if (data.apiConfig.customApi) {
          await dbPutConfig(KEYS.API_CONFIG, data.apiConfig.customApi);
        }
        if (data.apiConfig.summaryApi) {
          await dbPutConfig(KEYS.SUMMARY_API_CONFIG, data.apiConfig.summaryApi);
        }
        if (data.apiConfig.selectedModel) {
          await dbPutConfig(KEYS.SELECTED_MODEL, {
            model: data.apiConfig.selectedModel,
            updatedAt: Date.now()
          });
        }
        var restoredApiPresets = [];
        if (data.apiConfig.hasApiPresetsSection || (data.apiConfig.apiPresets && data.apiConfig.apiPresets.length)) {
          var apOverwriteSeen = {};
          for (var apiOi = 0; apiOi < data.apiConfig.apiPresets.length; apiOi++) {
            var apItem = normalizeApiPresetRecord(data.apiConfig.apiPresets[apiOi], data.apiConfig.apiPresets[apiOi].id);
            if (!apItem.name || apOverwriteSeen[apItem.id]) continue;
            apOverwriteSeen[apItem.id] = true;
            restoredApiPresets.push(apItem);
          }
          await dbPutConfig(KEYS.API_PRESETS, restoredApiPresets);
        }

        // 记忆相关数据
        if (data.memory.settings) {
          var summaryComplete = !!(data.apiConfig.summaryApi && data.apiConfig.summaryApi.complete);
          var cleanMemSettings = sanitizeMemorySettings(data.memory.settings, DEFAULT_MEMORY_SETTINGS, {
            summaryApiComplete: summaryComplete
          });
          await dbPutConfig(KEYS.MEMORY_SETTINGS, cleanMemSettings);
        }
        var memById = {};
        var memIds = [];
        for (var mi = 0; mi < data.memory.memories.length; mi++) {
          var mem = normalizeMemoryRecord(data.memory.memories[mi], data.memory.memories[mi].id);
          if (!mem.content || memById[mem.id]) continue;
          memById[mem.id] = mem;
          memIds.push(mem.id);
        }
        var orderedMemIds = [];
        var seenMOrder = {};
        for (var moi = 0; moi < data.memory.memoryOrder.length; moi++) {
          var moid = data.memory.memoryOrder[moi];
          if (memById[moid] && !seenMOrder[moid]) {
            seenMOrder[moid] = true;
            orderedMemIds.push(moid);
          }
        }
        for (var mbi = 0; mbi < memIds.length; mbi++) {
          if (!seenMOrder[memIds[mbi]]) orderedMemIds.push(memIds[mbi]);
          await dbPutConfig(KEYS.MEMORY_PREFIX + memIds[mbi], memById[memIds[mbi]]);
        }
        await dbPutConfig(KEYS.MEMORY_IDS, orderedMemIds);
        await dbPutConfig(KEYS.MEMORY_TASKS, data.memory.tasks.slice(0, 40));
        await dbPutConfig(KEYS.DELETED_MEMORY_SIGS, data.memory.deletedSignatures.slice(0, 100));

        // 对话会话与消息记录
        var chatById = {};
        var chatIds = [];
        var restoredMsgCount = 0;
        for (var ci = 0; ci < data.chats.length; ci++) {
          var chat = normalizeChatRecord(data.chats[ci], data.chats[ci].id);
          if (chat.presetSnapshot && Array.isArray(chat.presetSnapshot.worldBookIds)) {
            chat.presetSnapshot.worldBookIds = chat.presetSnapshot.worldBookIds.filter(function(id) {
              return !!validWbSet[id];
            });
          }
          if (chatById[chat.id]) continue;
          chatById[chat.id] = chat;
          chatIds.push(chat.id);
          restoredMsgCount += chat.messages.length;
        }
        var orderedChatIds = [];
        var seenCOrder = {};
        for (var coi = 0; coi < data.chatOrder.length; coi++) {
          var coid = data.chatOrder[coi];
          if (chatById[coid] && !seenCOrder[coid]) {
            seenCOrder[coid] = true;
            orderedChatIds.push(coid);
          }
        }
        for (var cbi = 0; cbi < chatIds.length; cbi++) {
          if (!seenCOrder[chatIds[cbi]]) orderedChatIds.push(chatIds[cbi]);
          await dbPutConfig(KEYS.CHAT_PREFIX + chatIds[cbi], chatById[chatIds[cbi]]);
        }
        await dbPutConfig(KEYS.CHAT_IDS, orderedChatIds);

        // 收藏消息列表
        var favSeen = {};
        var restoredFavorites = [];
        for (var fvi = 0; fvi < data.favorites.length; fvi++) {
          var favItem = normalizeFavoriteRecord(data.favorites[fvi]);
          if (!favItem.content.trim()) continue;
          var fk = buildFavoriteLookupKey(favItem.chatId, favItem.messageId, favItem.role, favItem.content);
          if (favSeen[fk]) continue;
          favSeen[fk] = true;
          restoredFavorites.push(favItem);
        }
        restoredFavorites.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        if (restoredFavorites.length > 0 || data.hasFavoritesSection) {
          await saveFavoritesList(restoredFavorites);
        }

        return {
          ok: true,
          mode: 'overwrite',
          version: parsed.version,
          isLegacyBackup: parsed.isLegacyBackup,
          stats: {
            chatsAdded: chatIds.length,
            chatsMerged: 0,
            messagesAdded: restoredMsgCount,
            favoritesAdded: restoredFavorites.length,
            memoriesAdded: memIds.length,
            presetsAdded: presetIds.length,
            apiPresetsAdded: restoredApiPresets.length,
            worldbooksAdded: wbIds.length
          }
        };
      }

      // ===== 合并导入模式（保留现有数据，合并备份内容并去重） =====
      // 1. 世界书合并与去重
      var existingWbs = await listWorldBooks();
      var existingWbIds = await dbGetConfig(KEYS.WORLDBOOK_IDS);
      if (!Array.isArray(existingWbIds)) existingWbIds = existingWbs.map(function(w) { return w.id; });
      var wbIdMap = {};
      var wbByIdMap = {};
      var wbBySigMap = {};
      for (var ew = 0; ew < existingWbs.length; ew++) {
        wbByIdMap[existingWbs[ew].id] = existingWbs[ew];
        wbBySigMap[buildWorldBookSignature(existingWbs[ew])] = existingWbs[ew];
      }
      var wbAddedCount = 0;
      for (var iw = 0; iw < data.worldbooks.length; iw++) {
        var incWb = normalizeWorldBookRecord(data.worldbooks[iw], data.worldbooks[iw].id);
        var incWbSig = buildWorldBookSignature(incWb);
        if (wbByIdMap[incWb.id]) {
          var exWb = wbByIdMap[incWb.id];
          var mergedEntryInfo = mergeWorldBookEntriesDedup(exWb.entries, incWb.entries);
          if (mergedEntryInfo.added > 0 || (!exWb.description && incWb.description)) {
            var updatedWb = normalizeWorldBookRecord(Object.assign({}, exWb, {
              description: exWb.description || incWb.description,
              entries: mergedEntryInfo.entries
            }), exWb.id);
            await dbPutConfig(KEYS.WORLDBOOK_PREFIX + updatedWb.id, updatedWb);
            wbByIdMap[updatedWb.id] = updatedWb;
          }
          wbIdMap[incWb.id] = exWb.id;
        } else if (wbBySigMap[incWbSig]) {
          wbIdMap[incWb.id] = wbBySigMap[incWbSig].id;
        } else {
          await dbPutConfig(KEYS.WORLDBOOK_PREFIX + incWb.id, incWb);
          if (existingWbIds.indexOf(incWb.id) === -1) existingWbIds.unshift(incWb.id);
          wbByIdMap[incWb.id] = incWb;
          wbBySigMap[incWbSig] = incWb;
          wbIdMap[incWb.id] = incWb.id;
          wbAddedCount++;
        }
      }
      await dbPutConfig(KEYS.WORLDBOOK_IDS, existingWbIds);
      var allValidWbIds = {};
      Object.keys(wbByIdMap).forEach(function(id) { allValidWbIds[id] = true; });

      // 2. 预设与世界书关联聚合、合并与去重
      var existingPresets = await listPresets();
      var existingPresetIds = await dbGetConfig(KEYS.PRESET_IDS);
      if (!Array.isArray(existingPresetIds)) existingPresetIds = existingPresets.map(function(p) { return p.id; });
      var currentDefaultPresetId = await dbGetConfig(KEYS.DEFAULT_PRESET_ID);
      var presetIdMap = {};
      var presetByIdMap = {};
      var presetBySigMap = {};
      for (var ep = 0; ep < existingPresets.length; ep++) {
        presetByIdMap[existingPresets[ep].id] = existingPresets[ep];
        presetBySigMap[buildPresetSignature(existingPresets[ep])] = existingPresets[ep];
        if (!currentDefaultPresetId && existingPresets[ep].isDefault) {
          currentDefaultPresetId = existingPresets[ep].id;
        }
      }
      var extraPresetBindings = collectExtraPresetBindingsMap(data.worldbookAssociations);
      var presetAddedCount = 0;
      for (var ip = 0; ip < data.presets.length; ip++) {
        var incP = normalizePreset(data.presets[ip], data.presets[ip].id);
        var combinedIncWb = (incP.worldBookIds || []).concat(extraPresetBindings[incP.id] || []);
        var remappedWbIds = remapIdList(combinedIncWb, wbIdMap, allValidWbIds);
        var incPSig = buildPresetSignature(incP);

        if (presetByIdMap[incP.id]) {
          var exP = presetByIdMap[incP.id];
          var unionWbIds = normalizeWorldBookIdList((exP.worldBookIds || []).concat(remappedWbIds));
          if (unionWbIds.length !== (exP.worldBookIds || []).length) {
            var updP = normalizePreset(Object.assign({}, exP, { worldBookIds: unionWbIds }), exP.id);
            await dbPutConfig(KEYS.PRESET_PREFIX + updP.id, updP);
            presetByIdMap[updP.id] = updP;
          }
          presetIdMap[incP.id] = exP.id;
        } else if (presetBySigMap[incPSig]) {
          var sigP = presetBySigMap[incPSig];
          var sigUnionWb = normalizeWorldBookIdList((sigP.worldBookIds || []).concat(remappedWbIds));
          if (sigUnionWb.length !== (sigP.worldBookIds || []).length) {
            var updSigP = normalizePreset(Object.assign({}, sigP, { worldBookIds: sigUnionWb }), sigP.id);
            await dbPutConfig(KEYS.PRESET_PREFIX + updSigP.id, updSigP);
            presetByIdMap[updSigP.id] = updSigP;
            presetBySigMap[incPSig] = updSigP;
          }
          presetIdMap[incP.id] = sigP.id;
        } else {
          var shouldBeDefault = !currentDefaultPresetId && (incP.isDefault || incP.id === data.defaultPresetId);
          var newP = normalizePreset(Object.assign({}, incP, {
            worldBookIds: remappedWbIds,
            isDefault: shouldBeDefault
          }), incP.id);
          await dbPutConfig(KEYS.PRESET_PREFIX + newP.id, newP);
          if (existingPresetIds.indexOf(newP.id) === -1) existingPresetIds.unshift(newP.id);
          presetByIdMap[newP.id] = newP;
          presetBySigMap[incPSig] = newP;
          presetIdMap[incP.id] = newP.id;
          if (shouldBeDefault) currentDefaultPresetId = newP.id;
          presetAddedCount++;
        }
      }
      await dbPutConfig(KEYS.PRESET_IDS, existingPresetIds);
      if (currentDefaultPresetId) {
        await dbPutConfig(KEYS.DEFAULT_PRESET_ID, currentDefaultPresetId);
      }
      await dbPutConfig(KEYS.PRESETS_INIT, true);

      // 3. 对话会话与消息合并去重
      var existingChats = await listChats();
      var existingChatIds = await dbGetConfig(KEYS.CHAT_IDS);
      if (!Array.isArray(existingChatIds)) existingChatIds = existingChats.map(function(c) { return c.id; });
      var chatIdMap = {};
      var chatByIdMap = {};
      var chatByFpMap = {};
      for (var ec = 0; ec < existingChats.length; ec++) {
        chatByIdMap[existingChats[ec].id] = existingChats[ec];
        chatByFpMap[buildChatFingerprint(existingChats[ec])] = existingChats[ec];
      }
      var chatsAddedCount = 0;
      var chatsMergedCount = 0;
      var messagesAddedCount = 0;
      for (var ic = 0; ic < data.chats.length; ic++) {
        var incChat = normalizeChatRecord(data.chats[ic], data.chats[ic].id);
        var mappedPresetId = presetIdMap[incChat.presetId] || incChat.presetId || '';
        var mappedSnapshot = incChat.presetSnapshot ? buildPresetSnapshot(incChat.presetSnapshot) : null;
        if (mappedSnapshot) {
          if (mappedSnapshot.id && presetIdMap[mappedSnapshot.id]) {
            mappedSnapshot.id = presetIdMap[mappedSnapshot.id];
          }
          mappedSnapshot.worldBookIds = remapIdList(mappedSnapshot.worldBookIds, wbIdMap, allValidWbIds);
        }
        var incFp = buildChatFingerprint(incChat);
        var matchedChat = chatByIdMap[incChat.id] || chatByFpMap[incFp] || null;

        if (matchedChat) {
          var mergeChatRes = mergeChatRecordsDedup(matchedChat, incChat, mappedPresetId, mappedSnapshot);
          await dbPutConfig(KEYS.CHAT_PREFIX + matchedChat.id, mergeChatRes.chat);
          chatByIdMap[matchedChat.id] = mergeChatRes.chat;
          chatIdMap[incChat.id] = matchedChat.id;
          chatsMergedCount++;
          messagesAddedCount += mergeChatRes.addedMessages;
        } else {
          var newChat = normalizeChatRecord(Object.assign({}, incChat, {
            presetId: mappedPresetId,
            presetSnapshot: mappedSnapshot
          }), incChat.id);
          await dbPutConfig(KEYS.CHAT_PREFIX + newChat.id, newChat);
          if (existingChatIds.indexOf(newChat.id) === -1) existingChatIds.unshift(newChat.id);
          chatByIdMap[newChat.id] = newChat;
          chatByFpMap[incFp] = newChat;
          chatIdMap[incChat.id] = newChat.id;
          chatsAddedCount++;
          messagesAddedCount += newChat.messages.length;
        }
      }
      await dbPutConfig(KEYS.CHAT_IDS, existingChatIds);

      // 4. 接口与模型配置（合并模式：保留现有已配置项，空白项由备份补全）
      if (data.hasApiSection) {
        var exCustomApi = await getCustomApiConfig();
        if (data.apiConfig.customApi) {
          var incCA = data.apiConfig.customApi;
          var unionFetched = exCustomApi.fetchedModels.slice();
          for (var fmi = 0; fmi < incCA.fetchedModels.length; fmi++) {
            if (unionFetched.indexOf(incCA.fetchedModels[fmi]) === -1) {
              unionFetched.push(incCA.fetchedModels[fmi]);
            }
          }
          if (!exCustomApi.complete && !exCustomApi.baseUrl && !exCustomApi.apiKey) {
            await dbPutConfig(KEYS.API_CONFIG, Object.assign({}, incCA, { fetchedModels: unionFetched }));
          } else if (unionFetched.length !== exCustomApi.fetchedModels.length) {
            await dbPutConfig(KEYS.API_CONFIG, Object.assign({}, exCustomApi, { fetchedModels: unionFetched }));
          }
        }
        var exSummaryApi = await getSummaryApiConfig();
        if (data.apiConfig.summaryApi && !exSummaryApi.complete && !exSummaryApi.baseUrl && !exSummaryApi.apiKey) {
          await dbPutConfig(KEYS.SUMMARY_API_CONFIG, data.apiConfig.summaryApi);
        }
        var exSelectedModel = await getSelectedModel();
        if (!exSelectedModel && data.apiConfig.selectedModel) {
          await saveSelectedModel(data.apiConfig.selectedModel);
        }
      }
      var apiPresetsAddedCount = 0;
      if (data.hasApiSection && Array.isArray(data.apiConfig.apiPresets) && data.apiConfig.apiPresets.length) {
        var existingApiPresets = await listApiPresets();
        var apIdSet = {};
        var apSigSet = {};
        for (var eapi = 0; eapi < existingApiPresets.length; eapi++) {
          var eap = existingApiPresets[eapi];
          apIdSet[eap.id] = true;
          apSigSet[buildApiPresetDedupKey(eap)] = true;
        }
        for (var iapi = 0; iapi < data.apiConfig.apiPresets.length; iapi++) {
          var incAp = normalizeApiPresetRecord(data.apiConfig.apiPresets[iapi], data.apiConfig.apiPresets[iapi].id);
          if (!incAp.name) continue;
          var incApSig = buildApiPresetDedupKey(incAp);
          if (apSigSet[incApSig]) continue;
          if (apIdSet[incAp.id]) {
            incAp.id = generateApiPresetId();
          }
          existingApiPresets.push(incAp);
          apIdSet[incAp.id] = true;
          apSigSet[incApSig] = true;
          apiPresetsAddedCount++;
        }
        if (apiPresetsAddedCount > 0) {
          await dbPutConfig(KEYS.API_PRESETS, existingApiPresets);
        }
      }

      // 5. 记忆相关数据合并与去重
      var memAddedCount = 0;
      if (data.hasMemorySection) {
        if (data.memory.settings) {
          var exMemSettings = await getMemorySettings();
          if (!exMemSettings.updatedAt) {
            var latestSummaryApi = await getSummaryApiConfig();
            var mergedMemSettings = sanitizeMemorySettings(data.memory.settings, exMemSettings, {
              summaryApiComplete: !!(latestSummaryApi && latestSummaryApi.complete)
            });
            await dbPutConfig(KEYS.MEMORY_SETTINGS, mergedMemSettings);
          }
        }

        var existingMems = await listMemories();
        var existingMemIds = await dbGetConfig(KEYS.MEMORY_IDS);
        if (!Array.isArray(existingMemIds)) existingMemIds = existingMems.map(function(m) { return m.id; });
        var memByIdMap = {};
        var memByKeyMap = {};
        for (var em = 0; em < existingMems.length; em++) {
          memByIdMap[existingMems[em].id] = existingMems[em];
          memByKeyMap[buildMemoryDedupKey(existingMems[em])] = existingMems[em];
        }
        var memIdMap = {};
        var touchedNewMemIds = [];
        for (var im = 0; im < data.memory.memories.length; im++) {
          var incMem = normalizeMemoryRecord(data.memory.memories[im], data.memory.memories[im].id);
          if (!incMem.content) continue;
          if (incMem.sourceChatId && chatIdMap[incMem.sourceChatId]) {
            incMem.sourceChatId = chatIdMap[incMem.sourceChatId];
          }
          var mDedupKey = buildMemoryDedupKey(incMem);
          var matchedMem = memByIdMap[incMem.id] || memByKeyMap[mDedupKey] || null;
          if (matchedMem) {
            var mergedMem = mergeMemoryRecordsDedup(matchedMem, incMem, chatIdMap);
            await dbPutConfig(KEYS.MEMORY_PREFIX + matchedMem.id, mergedMem);
            memByIdMap[matchedMem.id] = mergedMem;
            memIdMap[incMem.id] = matchedMem.id;
          } else {
            await dbPutConfig(KEYS.MEMORY_PREFIX + incMem.id, incMem);
            if (existingMemIds.indexOf(incMem.id) === -1) existingMemIds.unshift(incMem.id);
            memByIdMap[incMem.id] = incMem;
            memByKeyMap[mDedupKey] = incMem;
            memIdMap[incMem.id] = incMem.id;
            touchedNewMemIds.push(incMem.id);
            memAddedCount++;
          }
        }
        // 修正新增记忆的关系引用 ID
        for (var tmi = 0; tmi < touchedNewMemIds.length; tmi++) {
          var nm = memByIdMap[touchedNewMemIds[tmi]];
          if (!nm) continue;
          var relChanged = false;
          var nextRels = (nm.relations || []).map(function(r) {
            var mappedT = memIdMap[r.targetId] || r.targetId;
            if (mappedT !== r.targetId) relChanged = true;
            return Object.assign({}, r, { targetId: mappedT });
          });
          var nextConf = remapIdList(nm.conflictWithIds, memIdMap, memByIdMap);
          if (nextConf.length !== (nm.conflictWithIds || []).length) relChanged = true;
          var nextSup = nm.supersedesId ? (memIdMap[nm.supersedesId] || nm.supersedesId) : '';
          var nextSupBy = nm.supersededById ? (memIdMap[nm.supersededById] || nm.supersededById) : '';
          if (nextSup !== nm.supersedesId || nextSupBy !== nm.supersededById) relChanged = true;
          if (relChanged) {
            var fixedNm = normalizeMemoryRecord(Object.assign({}, nm, {
              relations: nextRels,
              conflictWithIds: nextConf,
              supersedesId: nextSup,
              supersededById: nextSupBy
            }), nm.id);
            await dbPutConfig(KEYS.MEMORY_PREFIX + fixedNm.id, fixedNm);
          }
        }
        await dbPutConfig(KEYS.MEMORY_IDS, existingMemIds);

        // 合并记忆任务与去重
        var exTasks = await listMemoryTasks();
        var taskKeySet = {};
        var mergedTasks = [];
        for (var eti = 0; eti < exTasks.length; eti++) {
          var et = exTasks[eti];
          mergedTasks.push(et);
          taskKeySet[et.id] = true;
          if (et.turnKey) taskKeySet['tk:' + et.turnKey] = true;
        }
        for (var iti = 0; iti < data.memory.tasks.length; iti++) {
          var it = data.memory.tasks[iti];
          if (taskKeySet[it.id] || (it.turnKey && taskKeySet['tk:' + it.turnKey])) continue;
          if (it.chatId && chatIdMap[it.chatId]) it.chatId = chatIdMap[it.chatId];
          mergedTasks.push(it);
          taskKeySet[it.id] = true;
          if (it.turnKey) taskKeySet['tk:' + it.turnKey] = true;
        }
        await saveMemoryTasks(mergedTasks);

        // 合并已删除记忆签名与去重
        var exSigs = await listDeletedMemorySignatures();
        var sigNormSet = {};
        var mergedSigs = [];
        for (var esi = 0; esi < exSigs.length; esi++) {
          if (exSigs[esi] && exSigs[esi].norm && !sigNormSet[exSigs[esi].norm]) {
            sigNormSet[exSigs[esi].norm] = true;
            mergedSigs.push(exSigs[esi]);
          }
        }
        for (var isi = 0; isi < data.memory.deletedSignatures.length; isi++) {
          var isig = data.memory.deletedSignatures[isi];
          if (isig && isig.norm && !sigNormSet[isig.norm]) {
            sigNormSet[isig.norm] = true;
            mergedSigs.push(isig);
          }
        }
        mergedSigs.sort(function(a, b) { return (b.deletedAt || 0) - (a.deletedAt || 0); });
        await dbPutConfig(KEYS.DELETED_MEMORY_SIGS, mergedSigs.slice(0, 100));
      }

      // 5.5 收藏消息合并与去重
      var favAddedCount = 0;
      if (data.favorites && data.favorites.length) {
        var existingFavs = await listFavorites();
        var favKeySet = {};
        var favIdSet = {};
        for (var efi = 0; efi < existingFavs.length; efi++) {
          var ef = existingFavs[efi];
          favIdSet[ef.id] = true;
          favKeySet[buildFavoriteLookupKey(ef.chatId, ef.messageId, ef.role, ef.content)] = true;
        }
        for (var ifi = 0; ifi < data.favorites.length; ifi++) {
          var incFav = normalizeFavoriteRecord(data.favorites[ifi]);
          if (!incFav.content.trim()) continue;
          if (incFav.chatId && chatIdMap[incFav.chatId]) {
            incFav.chatId = chatIdMap[incFav.chatId];
          }
          var incFavKey = buildFavoriteLookupKey(incFav.chatId, incFav.messageId, incFav.role, incFav.content);
          if (favKeySet[incFavKey] || favIdSet[incFav.id]) continue;
          existingFavs.push(incFav);
          favIdSet[incFav.id] = true;
          favKeySet[incFavKey] = true;
          favAddedCount++;
        }
        if (favAddedCount > 0) {
          existingFavs.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
          await saveFavoritesList(existingFavs);
        }
      }

      // 6. 个人资料、个性化、外观、常规设置（保留本地已修改项，未配置项由备份补全）
      if (data.profile) {
        var exProfileRaw = await dbGetConfig(KEYS.PROFILE);
        if (!exProfileRaw || !Number(exProfileRaw.updatedAt)) {
          await dbPutConfig(KEYS.PROFILE, data.profile);
        }
      }
      if (data.personalization) {
        var exPers = await getPersonalization();
        if (!exPers.updatedAt && !exPers.customInstructions && !exPers.userPreferences) {
          await dbPutConfig(KEYS.PERSONALIZATION, data.personalization);
        }
      }
      if (data.appearance) {
        var exApp = await getAppearance();
        if (!exApp.updatedAt) {
          await dbPutConfig(KEYS.APPEARANCE, data.appearance);
        }
      }
      if (data.general) {
        var exGen = await getGeneralSettings();
        if (!exGen.updatedAt) {
          await dbPutConfig(KEYS.GENERAL, data.general);
        }
      }

      return {
        ok: true,
        mode: 'merge',
        version: parsed.version,
        isLegacyBackup: parsed.isLegacyBackup,
        stats: {
          chatsAdded: chatsAddedCount,
          chatsMerged: chatsMergedCount,
          messagesAdded: messagesAddedCount,
          favoritesAdded: favAddedCount,
          memoriesAdded: memAddedCount,
          presetsAdded: presetAddedCount,
          apiPresetsAdded: apiPresetsAddedCount,
          worldbooksAdded: wbAddedCount
        }
      };
    } catch (err) {
      // 任何写入异常均自动回滚知屿快照，确保原有知屿数据与其他应用数据零损失
      try {
        await restoreWorkspaceSnapshot(snapshot);
      } catch (rbErr) {
        console.error('[AiWorkspaceStorage] rollback failed:', rbErr);
      }
      return {
        ok: false,
        rolledBack: true,
        error: '导入过程中发生异常，已自动恢复原数据：' + String((err && err.message) || '未知错误')
      };
    }
  }

  global.AiWorkspaceStorage = {
    KEYS: KEYS,
    ACCENT_PRESETS: ACCENT_PRESETS,
    MEMORY_CATEGORIES: MEMORY_CATEGORIES,
    MEMORY_SCOPES: MEMORY_SCOPES,
    MEMORY_STRATEGY_PRESETS: MEMORY_STRATEGY_PRESETS,
    MEMORY_SETTING_BOUNDS: MEMORY_SETTING_BOUNDS,
    MAX_CUSTOM_SUMMARY_PROMPT_LENGTH: MAX_CUSTOM_SUMMARY_PROMPT_LENGTH,
    DEFAULT_MEMORY_SETTINGS: DEFAULT_MEMORY_SETTINGS,
    normalizeBaseUrl: normalizeBaseUrl,
    normalizeTemperature: normalizeTemperature,
    isCustomApiComplete: isCustomApiComplete,
    isSummaryApiComplete: isSummaryApiComplete,
    getProfile: getProfile,
    saveProfile: saveProfile,
    getPersonalization: getPersonalization,
    savePersonalization: savePersonalization,
    getAppearance: getAppearance,
    saveAppearance: saveAppearance,
    getGeneralSettings: getGeneralSettings,
    saveGeneralSettings: saveGeneralSettings,
    listPresets: listPresets,
    getPreset: getPreset,
    getDefaultPreset: getDefaultPreset,
    setDefaultPreset: setDefaultPreset,
    createPreset: createPreset,
    updatePreset: updatePreset,
    duplicatePreset: duplicatePreset,
    deletePreset: deletePreset,
    buildPresetExportJson: buildPresetExportJson,
    parseImportedPromptPayload: parseImportedPromptPayload,
    getCustomApiConfig: getCustomApiConfig,
    saveCustomApiConfig: saveCustomApiConfig,
    clearCustomApiConfig: clearCustomApiConfig,
    getSummaryApiConfig: getSummaryApiConfig,
    saveSummaryApiConfig: saveSummaryApiConfig,
    clearSummaryApiConfig: clearSummaryApiConfig,
    listApiPresets: listApiPresets,
    saveApiPreset: saveApiPreset,
    deleteApiPreset: deleteApiPreset,
    getSelectedModel: getSelectedModel,
    saveSelectedModel: saveSelectedModel,
    buildPresetSnapshot: buildPresetSnapshot,
    generateChatTitle: generateChatTitle,
    generateMessageId: generateMessageId,
    listChats: listChats,
    getChat: getChat,
    createChat: createChat,
    saveChat: saveChat,
    renameChat: renameChat,
    togglePinChat: togglePinChat,
    deleteChat: deleteChat,
    searchChats: searchChats,
    sanitizeMemorySettings: sanitizeMemorySettings,
    getMemorySettings: getMemorySettings,
    saveMemorySettings: saveMemorySettings,
    applyMemoryStrategy: applyMemoryStrategy,
    resetMemorySettingsToDefaults: resetMemorySettingsToDefaults,
    listMemories: listMemories,
    getMemory: getMemory,
    createMemory: createMemory,
    updateMemory: updateMemory,
    deleteMemory: deleteMemory,
    clearAllMemories: clearAllMemories,
    listDeletedMemorySignatures: listDeletedMemorySignatures,
    addDeletedMemorySignature: addDeletedMemorySignature,
    removeDeletedMemorySignatureByContent: removeDeletedMemorySignatureByContent,
    listMemoryTasks: listMemoryTasks,
    saveMemoryTasks: saveMemoryTasks,
    enqueueMemoryTask: enqueueMemoryTask,
    updateMemoryTask: updateMemoryTask,
    clearFinishedMemoryTasks: clearFinishedMemoryTasks,
    listWorldBooks: listWorldBooks,
    listGlobalWorldBooks: listGlobalWorldBooks,
    getWorldBook: getWorldBook,
    createWorldBook: createWorldBook,
    updateWorldBook: updateWorldBook,
    setWorldBookEnabled: setWorldBookEnabled,
    setWorldBookGlobalEnabled: setWorldBookGlobalEnabled,
    deleteWorldBook: deleteWorldBook,
    normalizeWorldBookIdList: normalizeWorldBookIdList,
    resolveEffectiveWorldBooksFromData: resolveEffectiveWorldBooksFromData,
    resolveEffectiveWorldBooksForPreset: resolveEffectiveWorldBooksForPreset,
    buildWorldBookMatchHaystack: buildWorldBookMatchHaystack,
    formatMatchedWorldBookEntries: formatMatchedWorldBookEntries,
    matchWorldBookEntriesFromData: matchWorldBookEntriesFromData,
    matchWorldBookEntries: matchWorldBookEntries,
    normalizeWorldBookKeywords: normalizeWorldBookKeywords,
    createWorldBookEntry: createWorldBookEntry,
    updateWorldBookEntry: updateWorldBookEntry,
    deleteWorldBookEntry: deleteWorldBookEntry,
    buildWorldBookExportFilename: buildWorldBookExportFilename,
    buildWorldBookExportJson: buildWorldBookExportJson,
    parseWorldBookImportJson: parseWorldBookImportJson,
    importWorldBookFromJson: importWorldBookFromJson,
    importWorldBookFromTxt: importWorldBookFromTxt,
    importWorldBookFromDocx: importWorldBookFromDocx,
    importWorldBookFromDoc: importWorldBookFromDoc,
    buildAllWorldBooksZipBlob: buildAllWorldBooksZipBlob,
    buildFullBackupPayload: buildFullBackupPayload,
    buildFullBackupJson: buildFullBackupJson,
    parseFullBackupJson: parseFullBackupJson,
    importBackupFromJson: importBackupFromJson,
    listFavorites: listFavorites,
    isMessageFavorited: isMessageFavorited,
    addFavorite: addFavorite,
    removeFavoriteById: removeFavoriteById,
    removeFavoriteByMessage: removeFavoriteByMessage,
    toggleMessageFavorite: toggleMessageFavorite,
    searchFavorites: searchFavorites,
    syncFavoriteMessageContent: syncFavoriteMessageContent
  };
})(typeof window !== 'undefined' ? window : globalThis);
