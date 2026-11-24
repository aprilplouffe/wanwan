// ai-workspace-plugins.js — 知屿（AI 工作空间）7-A1：统一插件框架（兼容内置插件与未来 MCP 插件）
// 本阶段仅提供统一注册、权限校验、配置持久化、全局/单聊天开关优先级与工具调用接口；
// 不接入真实 MCP 服务，不实现 AI 自动调用，默认禁止工具擅自修改聊天、记忆或外部数据。
(function(global) {
  'use strict';

  var CATEGORY_BUILTIN = 'builtin';
  var CATEGORY_MCP = 'mcp';
  var VALID_CATEGORIES = [CATEGORY_BUILTIN, CATEGORY_MCP];

  var PERMISSION_SCOPES = {
    READ_ONLY: 'read_only',
    MODIFY_CHAT: 'modify_chat',
    MODIFY_MEMORY: 'modify_memory',
    EXTERNAL_ACTION: 'external_action'
  };

  var SENSITIVE_SCOPES = [
    PERMISSION_SCOPES.MODIFY_CHAT,
    PERMISSION_SCOPES.MODIFY_MEMORY,
    PERMISSION_SCOPES.EXTERNAL_ACTION
  ];

  var _plugins = Object.create(null);
  var _pluginOrder = [];
  var _tools = Object.create(null); // fullName ("pluginId.toolName") -> toolRecord

  function S() {
    return global.AiWorkspaceStorage || null;
  }

  function clone(val) {
    try {
      return JSON.parse(JSON.stringify(val));
    } catch (_) {
      return val;
    }
  }

  function normalizeCategory(raw) {
    var c = String(raw || '').trim().toLowerCase();
    return VALID_CATEGORIES.indexOf(c) !== -1 ? c : CATEGORY_BUILTIN;
  }

  function normalizePermissions(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var scopes = Array.isArray(src.scopes)
      ? src.scopes.map(function(s) { return String(s || '').trim(); }).filter(Boolean)
      : [];
    if (!scopes.length) {
      scopes = [PERMISSION_SCOPES.READ_ONLY];
    }
    var hasSensitiveScope = scopes.some(function(sc) {
      return SENSITIVE_SCOPES.indexOf(sc) !== -1;
    });
    var readOnly = src.readOnly !== undefined ? (!!src.readOnly && !hasSensitiveScope) : !hasSensitiveScope;
    var requiresConfirmation = hasSensitiveScope || !!src.requiresConfirmation || !readOnly;
    return {
      readOnly: readOnly,
      scopes: Array.from(new Set(scopes)),
      requiresConfirmation: requiresConfirmation
    };
  }

  function normalizeParameters(raw) {
    if (!raw || typeof raw !== 'object') {
      return { type: 'object', properties: {}, required: [] };
    }
    return {
      type: 'object',
      properties: raw.properties && typeof raw.properties === 'object' ? clone(raw.properties) : {},
      required: Array.isArray(raw.required) ? raw.required.map(String) : []
    };
  }

  function buildToolFullName(pluginId, toolName) {
    return String(pluginId || '').trim() + '.' + String(toolName || '').trim();
  }

  function registerTool(pluginId, toolDef) {
    var pid = String(pluginId || '').trim();
    var plugin = _plugins[pid];
    if (!plugin) {
      throw new Error('插件未注册：' + pid);
    }
    var def = toolDef && typeof toolDef === 'object' ? toolDef : {};
    var name = String(def.name || '').trim();
    if (!name) {
      throw new Error('工具名称不能为空');
    }
    var perms = normalizePermissions(def.permissions || plugin.permissions);
    var fullName = buildToolFullName(pid, name);
    var record = {
      pluginId: pid,
      category: plugin.category,
      name: name,
      fullName: fullName,
      title: String(def.title || name).trim(),
      description: String(def.description || '').trim(),
      parameters: normalizeParameters(def.parameters),
      permissions: perms,
      execute: typeof def.execute === 'function' ? def.execute : null
    };
    _tools[fullName] = record;

    var existingIdx = plugin.tools.findIndex(function(t) { return t.name === name; });
    if (existingIdx >= 0) {
      plugin.tools[existingIdx] = record;
    } else {
      plugin.tools.push(record);
    }
    return record;
  }

  function registerPlugin(pluginDef) {
    var def = pluginDef && typeof pluginDef === 'object' ? pluginDef : {};
    var id = String(def.id || '').trim();
    if (!id) {
      throw new Error('插件 ID 不能为空');
    }
    var category = normalizeCategory(def.category);
    var permissions = normalizePermissions(def.permissions);
    var record = {
      id: id,
      name: String(def.name || id).trim(),
      category: category,
      categoryLabel: category === CATEGORY_MCP ? 'MCP 插件' : '内置插件',
      description: String(def.description || '').trim(),
      version: String(def.version || '1.0.0').trim(),
      author: String(def.author || '知屿').trim(),
      defaultEnabled: def.defaultEnabled !== false,
      permissions: permissions,
      configSchema: Array.isArray(def.configSchema) ? clone(def.configSchema) : [],
      defaultConfig: def.defaultConfig && typeof def.defaultConfig === 'object' ? clone(def.defaultConfig) : {},
      mcpMeta: category === CATEGORY_MCP
        ? Object.assign({ connected: false, transport: 'reserved', endpoint: '' }, def.mcpMeta || {})
        : null,
      tools: []
    };

    _plugins[id] = record;
    if (_pluginOrder.indexOf(id) === -1) {
      _pluginOrder.push(id);
    }

    if (Array.isArray(def.tools)) {
      def.tools.forEach(function(t) {
        registerTool(id, t);
      });
    }
    return record;
  }

  function registerMcpDescriptor(mcpDef) {
    var src = mcpDef && typeof mcpDef === 'object' ? mcpDef : {};
    return registerPlugin(Object.assign({}, src, {
      category: CATEGORY_MCP,
      defaultEnabled: src.defaultEnabled === true
    }));
  }

  function sanitizePluginSummary(plugin) {
    if (!plugin) return null;
    return {
      id: plugin.id,
      name: plugin.name,
      category: plugin.category,
      categoryLabel: plugin.categoryLabel,
      description: plugin.description,
      version: plugin.version,
      author: plugin.author,
      defaultEnabled: plugin.defaultEnabled,
      permissions: clone(plugin.permissions),
      configSchema: clone(plugin.configSchema),
      defaultConfig: clone(plugin.defaultConfig),
      mcpMeta: plugin.mcpMeta ? clone(plugin.mcpMeta) : null,
      tools: plugin.tools.map(function(t) {
        return {
          pluginId: t.pluginId,
          category: t.category,
          name: t.name,
          fullName: t.fullName,
          title: t.title,
          description: t.description,
          parameters: clone(t.parameters),
          permissions: clone(t.permissions),
          executable: typeof t.execute === 'function'
        };
      })
    };
  }

  function listPlugins(categoryFilter) {
    var cat = categoryFilter ? String(categoryFilter).trim().toLowerCase() : '';
    return _pluginOrder.map(function(id) {
      return _plugins[id];
    }).filter(function(p) {
      if (!p) return false;
      if (cat && cat !== 'all' && p.category !== cat) return false;
      return true;
    }).map(sanitizePluginSummary);
  }

  function getPlugin(pluginId) {
    var p = _plugins[String(pluginId || '').trim()];
    return sanitizePluginSummary(p);
  }

  function normalizePluginSettings(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var pluginsMap = {};
    var rawPlugins = src.plugins && typeof src.plugins === 'object' ? src.plugins : {};
    Object.keys(rawPlugins).forEach(function(pid) {
      var entry = rawPlugins[pid];
      if (!entry || typeof entry !== 'object') return;
      pluginsMap[pid] = {
        enabled: typeof entry.enabled === 'boolean' ? entry.enabled : true,
        config: entry.config && typeof entry.config === 'object' ? clone(entry.config) : {}
      };
    });

    var chatOverrides = {};
    var rawChats = src.chatOverrides && typeof src.chatOverrides === 'object' ? src.chatOverrides : {};
    Object.keys(rawChats).forEach(function(cid) {
      var cEntry = rawChats[cid];
      if (!cEntry || typeof cEntry !== 'object') return;
      var pluginOverrides = {};
      if (cEntry.plugins && typeof cEntry.plugins === 'object') {
        Object.keys(cEntry.plugins).forEach(function(pid) {
          var v = cEntry.plugins[pid];
          if (typeof v === 'boolean') {
            pluginOverrides[pid] = v;
          }
        });
      }
      var hasMaster = typeof cEntry.enabled === 'boolean';
      if (hasMaster || Object.keys(pluginOverrides).length > 0) {
        chatOverrides[cid] = {
          enabled: hasMaster ? cEntry.enabled : null,
          plugins: pluginOverrides
        };
      }
    });

    return {
      globalEnabled: src.globalEnabled !== false,
      plugins: pluginsMap,
      chatOverrides: chatOverrides,
      updatedAt: Number(src.updatedAt) || 0
    };
  }

  async function loadPluginSettings() {
    var store = S();
    if (store && typeof store.getPluginSettings === 'function') {
      return normalizePluginSettings(await store.getPluginSettings());
    }
    return normalizePluginSettings({});
  }

  async function savePluginSettings(nextSettings) {
    var normalized = normalizePluginSettings(nextSettings);
    normalized.updatedAt = Date.now();
    var store = S();
    if (store && typeof store.savePluginSettings === 'function') {
      return normalizePluginSettings(await store.savePluginSettings(normalized));
    }
    return normalized;
  }

  // 明确优先级解析：
  // 1) 单聊天总开关（chatOverrides[chatId].enabled，boolean）优先于全局总开关（globalEnabled）；
  // 2) 单聊天插件开关（chatOverrides[chatId].plugins[pluginId]，boolean）优先于全局插件开关（plugins[pluginId].enabled）；
  // 3) 未配置单聊天覆盖时继承全局配置，未配置全局插件记录时取 plugin.defaultEnabled。
  function resolvePluginEffectiveState(pluginId, settings, chatId) {
    var pid = String(pluginId || '').trim();
    var plugin = _plugins[pid];
    var cfg = normalizePluginSettings(settings);
    var cid = String(chatId || '').trim();

    var globalMasterEnabled = cfg.globalEnabled !== false;
    var chatOv = (cid && cfg.chatOverrides[cid]) ? cfg.chatOverrides[cid] : null;
    var chatMasterOverride = (chatOv && typeof chatOv.enabled === 'boolean') ? chatOv.enabled : null;
    var masterEnabled = chatMasterOverride !== null ? chatMasterOverride : globalMasterEnabled;

    var pStored = cfg.plugins[pid];
    var globalPluginEnabled = (pStored && typeof pStored.enabled === 'boolean')
      ? pStored.enabled
      : (plugin ? plugin.defaultEnabled !== false : false);
    var chatPluginOverride = (chatOv && chatOv.plugins && typeof chatOv.plugins[pid] === 'boolean')
      ? chatOv.plugins[pid]
      : null;
    var pluginLevelEnabled = chatPluginOverride !== null ? chatPluginOverride : globalPluginEnabled;

    var effectiveEnabled = !!(plugin && masterEnabled && pluginLevelEnabled);
    var reason = 'ok';
    if (!plugin) reason = 'not_registered';
    else if (chatMasterOverride === false) reason = 'disabled_by_chat_master';
    else if (!masterEnabled) reason = 'disabled_by_global_master';
    else if (chatPluginOverride === false) reason = 'disabled_by_chat_plugin';
    else if (!pluginLevelEnabled) reason = 'disabled_by_global_plugin';

    var mergedConfig = Object.assign(
      {},
      (plugin && plugin.defaultConfig) || {},
      (pStored && pStored.config) || {}
    );

    return {
      pluginId: pid,
      chatId: cid,
      effectiveEnabled: effectiveEnabled,
      reason: reason,
      masterEnabled: masterEnabled,
      globalMasterEnabled: globalMasterEnabled,
      chatMasterOverride: chatMasterOverride,
      globalPluginEnabled: globalPluginEnabled,
      chatPluginOverride: chatPluginOverride,
      config: mergedConfig
    };
  }

  async function setGlobalMasterEnabled(enabled) {
    var cur = await loadPluginSettings();
    cur.globalEnabled = !!enabled;
    return await savePluginSettings(cur);
  }

  async function setChatMasterOverride(chatId, state) {
    var cid = String(chatId || '').trim();
    if (!cid) return await loadPluginSettings();
    var cur = await loadPluginSettings();
    if (state === null || state === undefined) {
      if (cur.chatOverrides[cid]) {
        cur.chatOverrides[cid].enabled = null;
      }
    } else {
      if (!cur.chatOverrides[cid]) cur.chatOverrides[cid] = { enabled: null, plugins: {} };
      cur.chatOverrides[cid].enabled = !!state;
    }
    return await savePluginSettings(cur);
  }

  async function setPluginEnabled(pluginId, enabled, options) {
    var pid = String(pluginId || '').trim();
    if (!_plugins[pid]) throw new Error('未知插件：' + pid);
    var opts = options && typeof options === 'object' ? options : {};
    var cid = String(opts.chatId || '').trim();
    var cur = await loadPluginSettings();

    if (cid && opts.scope === 'chat') {
      if (!cur.chatOverrides[cid]) cur.chatOverrides[cid] = { enabled: null, plugins: {} };
      if (enabled === null || enabled === undefined) {
        delete cur.chatOverrides[cid].plugins[pid];
      } else {
        cur.chatOverrides[cid].plugins[pid] = !!enabled;
      }
    } else {
      if (!cur.plugins[pid]) {
        cur.plugins[pid] = { enabled: !!enabled, config: clone(_plugins[pid].defaultConfig || {}) };
      } else {
        cur.plugins[pid].enabled = !!enabled;
      }
    }
    return await savePluginSettings(cur);
  }

  async function updatePluginConfig(pluginId, configPatch) {
    var pid = String(pluginId || '').trim();
    if (!_plugins[pid]) throw new Error('未知插件：' + pid);
    var cur = await loadPluginSettings();
    var prev = cur.plugins[pid] || { enabled: _plugins[pid].defaultEnabled !== false, config: clone(_plugins[pid].defaultConfig || {}) };
    cur.plugins[pid] = {
      enabled: prev.enabled,
      config: Object.assign({}, _plugins[pid].defaultConfig || {}, prev.config || {}, configPatch || {})
    };
    return await savePluginSettings(cur);
  }

  async function listTools(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var settings = opts.settings || await loadPluginSettings();
    var cid = String(opts.chatId || '').trim();
    var onlyEnabled = !!opts.onlyEnabled;
    var category = opts.category ? String(opts.category).trim().toLowerCase() : '';

    var list = [];
    Object.keys(_tools).forEach(function(fullName) {
      var t = _tools[fullName];
      if (!t) return;
      if (category && category !== 'all' && t.category !== category) return;
      var st = resolvePluginEffectiveState(t.pluginId, settings, cid);
      if (onlyEnabled && !st.effectiveEnabled) return;
      list.push({
        pluginId: t.pluginId,
        category: t.category,
        name: t.name,
        fullName: t.fullName,
        title: t.title,
        description: t.description,
        parameters: clone(t.parameters),
        permissions: clone(t.permissions),
        enabled: st.effectiveEnabled
      });
    });
    return list;
  }

  function validateToolParams(tool, params) {
    var p = params && typeof params === 'object' ? params : {};
    var schema = tool.parameters || { properties: {}, required: [] };
    var required = Array.isArray(schema.required) ? schema.required : [];
    for (var i = 0; i < required.length; i++) {
      var key = required[i];
      if (p[key] === undefined || p[key] === null || String(p[key]).trim() === '') {
        return { ok: false, error: '缺少必填参数：' + key };
      }
    }
    return { ok: true, params: p };
  }

  // 统一工具调用接口（内置插件与未来 MCP 插件共用）：
  // - 校验插件与工具注册状态
  // - 校验全局/单聊天启用状态
  // - 校验参数
  // - 默认拦截所有非只读或敏感权限操作，必须获得显式用户确认后方可执行
  async function invokeTool(toolFullName, params, options) {
    var key = String(toolFullName || '').trim();
    var tool = _tools[key];
    if (!tool) {
      return { ok: false, error: '未找到工具：' + key, code: 'tool_not_found' };
    }
    var opts = options && typeof options === 'object' ? options : {};
    var settings = opts.settings || await loadPluginSettings();
    var state = resolvePluginEffectiveState(tool.pluginId, settings, opts.chatId);

    if (!state.effectiveEnabled) {
      return {
        ok: false,
        error: '插件未启用（' + state.reason + '）',
        code: 'plugin_disabled',
        reason: state.reason
      };
    }

    if (tool.category === CATEGORY_MCP && (!(_plugins[tool.pluginId].mcpMeta && _plugins[tool.pluginId].mcpMeta.connected))) {
      return {
        ok: false,
        error: 'MCP 插件服务尚未连接（当前仅预留统一协议框架）',
        code: 'mcp_not_connected'
      };
    }

    var check = validateToolParams(tool, params);
    if (!check.ok) {
      return { ok: false, error: check.error, code: 'invalid_params' };
    }

    var perms = tool.permissions || normalizePermissions();
    var needsConfirm = !perms.readOnly || perms.requiresConfirmation || perms.scopes.some(function(sc) {
      return SENSITIVE_SCOPES.indexOf(sc) !== -1;
    });

    if (needsConfirm) {
      var confirmed = opts.confirmed === true;
      if (!confirmed && typeof opts.requestConfirmation === 'function') {
        confirmed = !!(await opts.requestConfirmation({
          pluginId: tool.pluginId,
          toolName: tool.fullName,
          title: tool.title,
          permissions: clone(perms),
          params: clone(check.params)
        }));
      }
      if (!confirmed) {
        return {
          ok: false,
          blocked: true,
          requiresConfirmation: true,
          code: 'confirmation_required',
          error: '该操作涉及敏感或写入权限（' + perms.scopes.join(', ') + '），默认拦截，需用户明确确认后方可执行。'
        };
      }
    }

    if (typeof tool.execute !== 'function') {
      return { ok: false, error: '该工具未实现可执行方法', code: 'not_executable' };
    }

    try {
      var data = await tool.execute(check.params, {
        pluginId: tool.pluginId,
        chatId: state.chatId,
        config: clone(state.config),
        permissions: clone(perms)
      });
      return {
        ok: true,
        pluginId: tool.pluginId,
        tool: tool.fullName,
        category: tool.category,
        data: data
      };
    } catch (err) {
      return {
        ok: false,
        error: (err && err.message) ? err.message : String(err || '工具执行失败'),
        code: 'execution_error'
      };
    }
  }

  // ===== 注册默认内置插件与 MCP 框架预留项 =====
  function registerStarterPlugins() {
    registerPlugin({
      id: 'builtin_time_utils',
      name: '日期与时间助手',
      category: CATEGORY_BUILTIN,
      description: '提供当前本地日期、星期与时间戳只读查询，不修改任何数据。',
      version: '1.0.0',
      author: '知屿内置',
      defaultEnabled: true,
      permissions: {
        readOnly: true,
        scopes: [PERMISSION_SCOPES.READ_ONLY],
        requiresConfirmation: false
      },
      configSchema: [
        { key: 'hourFormat', label: '时间格式（24h / 12h）', type: 'text', placeholder: '24h' }
      ],
      defaultConfig: { hourFormat: '24h' },
      tools: [
        {
          name: 'get_current_datetime',
          title: '获取当前时间',
          description: '只读返回当前本地日期、星期及时间字符串。',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          },
          execute: async function(_params, ctx) {
            var now = new Date();
            var weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
            return {
              iso: now.toISOString(),
              date: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'),
              weekday: weekdays[now.getDay()] || '',
              hourFormat: (ctx && ctx.config && ctx.config.hourFormat) || '24h'
            };
          }
        }
      ]
    });

    registerPlugin({
      id: 'builtin_workspace_reader',
      name: '工作空间只读概览',
      category: CATEGORY_BUILTIN,
      description: '只读统计当前知屿已创建的对话、记忆与插件数量，绝不修改聊天或记忆数据。',
      version: '1.0.0',
      author: '知屿内置',
      defaultEnabled: true,
      permissions: {
        readOnly: true,
        scopes: [PERMISSION_SCOPES.READ_ONLY],
        requiresConfirmation: false
      },
      tools: [
        {
          name: 'get_workspace_overview',
          title: '查询工作空间概览',
          description: '只读统计当前知屿对话数与长期记忆条数。',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          },
          execute: async function() {
            var store = S();
            var chats = (store && typeof store.listChats === 'function') ? await store.listChats() : [];
            var memories = (store && typeof store.listMemories === 'function') ? await store.listMemories() : [];
            return {
              chatCount: Array.isArray(chats) ? chats.length : 0,
              memoryCount: Array.isArray(memories) ? memories.length : 0,
              registeredPluginCount: _pluginOrder.length
            };
          }
        }
      ]
    });

    registerPlugin({
      id: 'builtin_sensitive_guard_sample',
      name: '敏感写入权限守卫示例',
      category: CATEGORY_BUILTIN,
      description: '声明了修改记忆的敏感权限，默认停用且必须由用户明确确认后才允许调用。',
      version: '1.0.0',
      author: '知屿内置',
      defaultEnabled: false,
      permissions: {
        readOnly: false,
        scopes: [PERMISSION_SCOPES.MODIFY_MEMORY],
        requiresConfirmation: true
      },
      tools: [
        {
          name: 'guarded_action_preview',
          title: '受保护写入校验',
          description: '仅在用户确认后返回授权校验结果，不擅自修改记忆。',
          parameters: {
            type: 'object',
            properties: {
              note: { type: 'string', description: '操作说明' }
            },
            required: ['note']
          },
          execute: async function(params) {
            return { authorized: true, note: String(params.note || '') };
          }
        }
      ]
    });

    registerMcpDescriptor({
      id: 'mcp_reserved_gateway',
      name: 'MCP 扩展服务（预留）',
      description: '统一兼容未来外部 MCP Server 工具接入；7-A1 阶段仅预留协议接口与管理界面，暂不连接真实 MCP 服务。',
      version: '0.1.0',
      author: 'MCP Protocol',
      defaultEnabled: false,
      permissions: {
        readOnly: false,
        scopes: [PERMISSION_SCOPES.EXTERNAL_ACTION],
        requiresConfirmation: true
      },
      configSchema: [
        { key: 'serverLabel', label: '服务名称备注（预留）', type: 'text', placeholder: '例如：本地知识库 MCP' },
        { key: 'endpoint', label: 'MCP Endpoint（预留，暂不发起连接）', type: 'text', placeholder: 'https://...' }
      ],
      defaultConfig: { serverLabel: '', endpoint: '' },
      mcpMeta: {
        connected: false,
        transport: 'reserved',
        endpoint: ''
      },
      tools: [
        {
          name: 'mcp_tool_placeholder',
          title: 'MCP 工具协议槽位',
          description: '与内置插件共用统一工具注册与调用接口，待后续阶段接入真实 MCP 传输。',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '请求参数示例' }
            },
            required: []
          }
        }
      ]
    });
  }

  registerStarterPlugins();

  global.AiWorkspacePlugins = {
    CATEGORY_BUILTIN: CATEGORY_BUILTIN,
    CATEGORY_MCP: CATEGORY_MCP,
    PERMISSION_SCOPES: clone(PERMISSION_SCOPES),
    registerPlugin: registerPlugin,
    registerMcpDescriptor: registerMcpDescriptor,
    registerTool: registerTool,
    listPlugins: listPlugins,
    getPlugin: getPlugin,
    listTools: listTools,
    invokeTool: invokeTool,
    loadPluginSettings: loadPluginSettings,
    savePluginSettings: savePluginSettings,
    resolvePluginEffectiveState: resolvePluginEffectiveState,
    setGlobalMasterEnabled: setGlobalMasterEnabled,
    setChatMasterOverride: setChatMasterOverride,
    setPluginEnabled: setPluginEnabled,
    updatePluginConfig: updatePluginConfig
  };
})(typeof window !== 'undefined' ? window : globalThis);