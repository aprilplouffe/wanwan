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
    SELECTED_MODEL: 'aiw_selected_model',
    CHAT_IDS: 'aiw_chat_ids',
    CHAT_PREFIX: 'aiw_chat:',
    MEMORY_SETTINGS: 'aiw_memory_settings',
    MEMORY_IDS: 'aiw_memory_ids',
    MEMORY_PREFIX: 'aiw_memory:',
    MEMORY_TASKS: 'aiw_memory_tasks',
    DELETED_MEMORY_SIGS: 'aiw_deleted_memory_sigs'
  };

  var MEMORY_STRATEGY_PRESETS = {
    natural: {
      id: 'natural',
      label: '自然 · 推荐',
      summary: '兼顾上下文连贯与开销控制，适合日常绝大多数对话',
      summaryTriggerChars: 3200,
      recentRawMessagesLimit: 6,
      maxMemoryRecallCount: 5,
      maxSingleMemoryLength: 260
    },
    token_saver: {
      id: 'token_saver',
      label: '省 Token',
      summary: '更早触发阶段摘要并精简近期原文与记忆召回条数，减少上下文占用',
      summaryTriggerChars: 1400,
      recentRawMessagesLimit: 4,
      maxMemoryRecallCount: 2,
      maxSingleMemoryLength: 140
    },
    recall_more: {
      id: 'recall_more',
      label: '记得更多',
      summary: '保留更多近期原始消息与历史记忆召回条数，适合复杂长程协作',
      summaryTriggerChars: 5600,
      recentRawMessagesLimit: 12,
      maxMemoryRecallCount: 8,
      maxSingleMemoryLength: 380
    }
  };

  var MEMORY_SETTING_BOUNDS = {
    summaryTriggerChars: { min: 400, max: 12000, def: 3200 },
    recentRawMessagesLimit: { min: 2, max: 24, def: 6 },
    maxMemoryRecallCount: { min: 1, max: 12, def: 5 },
    maxSingleMemoryLength: { min: 60, max: 500, def: 260 }
  };

  var DEFAULT_MEMORY_SETTINGS = {
    shortTermContext: true,
    crossChatMemory: true,
    useMemory: true,
    autoMemory: true,
    referenceHistoryChats: true,
    strategy: 'natural',
    summaryTriggerChars: 3200,
    recentRawMessagesLimit: 6,
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
        detailLevel: p.detailLevel
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
              detailLevel: ['精简', '适中', '详尽'].indexOf(src.detailLevel) !== -1 ? src.detailLevel : '适中'
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

  function normalizeChatRecord(raw, forcedId) {
    var now = Date.now();
    var src = raw && typeof raw === 'object' ? raw : {};
    var msgs = Array.isArray(src.messages) ? src.messages.map(normalizeChatMessage) : [];
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
    var n = Math.round(Number(rawVal));
    if (!Number.isFinite(n)) {
      return typeof fallbackVal === 'number' && Number.isFinite(fallbackVal) ? fallbackVal : spec.def;
    }
    if (n < spec.min) return spec.min;
    if (n > spec.max) return spec.max;
    return n;
  }

  function sanitizeMemorySettings(raw, base) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var prev = base && typeof base === 'object' ? base : DEFAULT_MEMORY_SETTINGS;
    var strategy = src.strategy != null ? String(src.strategy) : String(prev.strategy || 'natural');
    if (!MEMORY_STRATEGY_PRESETS[strategy]) strategy = 'natural';

    return {
      shortTermContext: typeof src.shortTermContext === 'boolean' ? src.shortTermContext : (prev.shortTermContext !== false),
      crossChatMemory: typeof src.crossChatMemory === 'boolean' ? src.crossChatMemory : (prev.crossChatMemory !== false),
      useMemory: typeof src.useMemory === 'boolean' ? src.useMemory : (prev.useMemory !== false),
      autoMemory: typeof src.autoMemory === 'boolean' ? src.autoMemory : (prev.autoMemory !== false),
      referenceHistoryChats: typeof src.referenceHistoryChats === 'boolean' ? src.referenceHistoryChats : (prev.referenceHistoryChats !== false),
      strategy: strategy,
      summaryTriggerChars: clampMemoryNumericSetting('summaryTriggerChars', src.summaryTriggerChars, prev.summaryTriggerChars),
      recentRawMessagesLimit: clampMemoryNumericSetting('recentRawMessagesLimit', src.recentRawMessagesLimit, prev.recentRawMessagesLimit),
      maxMemoryRecallCount: clampMemoryNumericSetting('maxMemoryRecallCount', src.maxMemoryRecallCount, prev.maxMemoryRecallCount),
      maxSingleMemoryLength: clampMemoryNumericSetting('maxSingleMemoryLength', src.maxSingleMemoryLength, prev.maxSingleMemoryLength),
      updatedAt: Number(src.updatedAt) || Number(prev.updatedAt) || 0
    };
  }

  async function getMemorySettings() {
    var saved = await dbGetConfig(KEYS.MEMORY_SETTINGS);
    return sanitizeMemorySettings(saved, DEFAULT_MEMORY_SETTINGS);
  }

  async function saveMemorySettings(patch) {
    var current = await getMemorySettings();
    var p = patch && typeof patch === 'object' ? patch : {};
    var nextInput = Object.assign({}, current, p, { updatedAt: Date.now() });
    if (p.strategy && MEMORY_STRATEGY_PRESETS[p.strategy] && p.applyStrategyPreset !== false) {
      var preset = MEMORY_STRATEGY_PRESETS[p.strategy];
      if (p.summaryTriggerChars === undefined) nextInput.summaryTriggerChars = preset.summaryTriggerChars;
      if (p.recentRawMessagesLimit === undefined) nextInput.recentRawMessagesLimit = preset.recentRawMessagesLimit;
      if (p.maxMemoryRecallCount === undefined) nextInput.maxMemoryRecallCount = preset.maxMemoryRecallCount;
      if (p.maxSingleMemoryLength === undefined) nextInput.maxSingleMemoryLength = preset.maxSingleMemoryLength;
    }
    var next = sanitizeMemorySettings(nextInput, current);
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
      payload: src.payload && typeof src.payload === 'object' ? src.payload : {},
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

  global.AiWorkspaceStorage = {
    KEYS: KEYS,
    ACCENT_PRESETS: ACCENT_PRESETS,
    MEMORY_CATEGORIES: MEMORY_CATEGORIES,
    MEMORY_SCOPES: MEMORY_SCOPES,
    MEMORY_STRATEGY_PRESETS: MEMORY_STRATEGY_PRESETS,
    MEMORY_SETTING_BOUNDS: MEMORY_SETTING_BOUNDS,
    DEFAULT_MEMORY_SETTINGS: DEFAULT_MEMORY_SETTINGS,
    normalizeBaseUrl: normalizeBaseUrl,
    normalizeTemperature: normalizeTemperature,
    isCustomApiComplete: isCustomApiComplete,
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
    clearFinishedMemoryTasks: clearFinishedMemoryTasks
  };
})(typeof window !== 'undefined' ? window : globalThis);
