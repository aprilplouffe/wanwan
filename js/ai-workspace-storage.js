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
    SELECTED_MODEL: 'aiw_selected_model',
    CHAT_IDS: 'aiw_chat_ids',
    CHAT_PREFIX: 'aiw_chat:',
    MEMORY_SETTINGS: 'aiw_memory_settings',
    MEMORY_IDS: 'aiw_memory_ids',
    MEMORY_PREFIX: 'aiw_memory:',
    MEMORY_TASKS: 'aiw_memory_tasks',
    DELETED_MEMORY_SIGS: 'aiw_deleted_memory_sigs',
    WORLDBOOK_IDS: 'aiw_worldbook_ids',
    WORLDBOOK_PREFIX: 'aiw_worldbook:'
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

  function normalizeChatMessage(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var role = src.role === 'assistant' || src.role === 'system' ? src.role : 'user';
    return {
      id: String(src.id || generateMessageId()),
      role: role,
      content: String(src.content == null ? '' : src.content),
      createdAt: Number(src.createdAt) || Date.now(),
      model: src.model ? String(src.model) : '',
      error: src.error ? String(src.error) : '',
      aborted: !!src.aborted,
      deepThink: !!src.deepThink
    };
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
    var mergedFromIds = Array.isArray(raw.mergedFromIds)
      ? raw.mergedFromIds.filter(Boolean).map(String)
      : [];
    return {
      id: String(raw.id || ('sumseg_' + startIdx + '_' + endIdx + '_' + (idx || 0))).trim(),
      startMessageIndex: startIdx,
      endMessageIndex: endIdx,
      content: content,
      createdAt: Number(raw.createdAt) || 0,
      status: status,
      mergedFromIds: mergedFromIds
    };
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
      summaryReadWorldBook: typeof src.summaryReadWorldBook === 'boolean' ? src.summaryReadWorldBook : (prev.summaryReadWorldBook === true),
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
      return item && item.globalEnabled === true;
    });
  }

  function resolveEffectiveWorldBooksFromData(preset, allWorldBooks) {
    var booksList = Array.isArray(allWorldBooks) ? allWorldBooks : [];
    var byId = {};
    var globalBooks = [];
    for (var i = 0; i < booksList.length; i++) {
      var wb = booksList[i];
      if (!wb || !wb.id) continue;
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
    var p = patch && typeof patch === 'object' ? patch : {};
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
    buildAllWorldBooksZipBlob: buildAllWorldBooksZipBlob
  };
})(typeof window !== 'undefined' ? window : globalThis);
