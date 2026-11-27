// ai-workspace-plugins.js — 知屿（AI 工作空间）7-A1：统一插件框架（兼容内置插件与未来 MCP 插件）
// 本阶段仅提供统一注册、权限校验、配置持久化、全局/单聊天开关优先级与工具调用接口；
// 不接入真实 MCP 服务，不实现 AI 自动调用，默认禁止工具擅自修改聊天、记忆或外部数据。
(function(global) {
  'use strict';

  var CATEGORY_BUILTIN = 'builtin';
  var CATEGORY_MCP = 'mcp';
  var CATEGORY_CUSTOM = 'custom';
  var VALID_CATEGORIES = [CATEGORY_BUILTIN, CATEGORY_MCP, CATEGORY_CUSTOM];

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
      categoryLabel: category === CATEGORY_MCP ? 'MCP 插件' : (category === CATEGORY_CUSTOM ? '自定义插件' : '内置插件'),
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

    var cleanMcpServers = [];
    if (Array.isArray(src.mcpServers)) {
      src.mcpServers.forEach(function(item) {
        var normSrv = normalizeMcpServerRecord(item);
        if (normSrv) cleanMcpServers.push(normSrv);
      });
    }
    var cleanCustomPlugins = [];
    if (Array.isArray(src.customPlugins)) {
      src.customPlugins.forEach(function(item) {
        var normCp = normalizeCustomPluginRecord(item);
        if (normCp) cleanCustomPlugins.push(normCp);
      });
    }
    return {
      globalEnabled: src.globalEnabled !== false,
      plugins: pluginsMap,
      chatOverrides: chatOverrides,
      mcpServers: cleanMcpServers,
      customPlugins: cleanCustomPlugins,
      updatedAt: Number(src.updatedAt) || 0
    };
  }

  async function loadPluginSettings() {
    var store = S();
    var norm;
    if (store && typeof store.getPluginSettings === 'function') {
      norm = normalizePluginSettings(await store.getPluginSettings());
    } else {
      norm = normalizePluginSettings({});
    }
    syncMcpServersToRegistry(norm);
    syncCustomPluginsToRegistry(norm);
    return norm;
  }

  async function savePluginSettings(nextSettings) {
    var normalized = normalizePluginSettings(nextSettings);
    normalized.updatedAt = Date.now();
    var store = S();
    var saved = normalized;
    if (store && typeof store.savePluginSettings === 'function') {
      saved = normalizePluginSettings(await store.savePluginSettings(normalized));
    }
    syncMcpServersToRegistry(saved);
    syncCustomPluginsToRegistry(saved);
    return saved;
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
      var plgRef = _plugins[t.pluginId];
      var mcpDisabled = !!(t.mcpServerId && isMcpToolDisabledInSettings(settings, t.mcpServerId, t.name));
      var effectiveToolEnabled = st.effectiveEnabled && !mcpDisabled;
      if (onlyEnabled && !effectiveToolEnabled) return;
      list.push({
        pluginId: t.pluginId,
        category: t.category,
        pluginName: (plgRef && plgRef.name) || '',
        name: t.name,
        fullName: t.fullName,
        title: t.title,
        description: t.description,
        parameters: clone(t.parameters),
        permissions: clone(t.permissions),
        executable: typeof t.execute === 'function',
        mcpServerId: t.mcpServerId || '',
        mcpToolDisabled: mcpDisabled,
        enabled: effectiveToolEnabled
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
  function toApiToolName(fullName) {
    return String(fullName || '').trim().replace(/[^a-zA-Z0-9_-]/g, '__').slice(0, 64);
  }

  function resolveToolFullName(rawName, nameMap) {
    var key = String(rawName || '').trim();
    if (!key) return '';
    if (nameMap && nameMap[key]) return nameMap[key];
    if (_tools[key]) return key;
    var dotCandidate = key.replace(/__/g, '.');
    if (_tools[dotCandidate]) return dotCandidate;
    var matched = [];
    Object.keys(_tools).forEach(function(fullKey) {
      var tool = _tools[fullKey];
      if (tool && (tool.name === key || toApiToolName(tool.fullName) === key)) {
        matched.push(tool.fullName);
      }
    });
    return matched.length === 1 ? matched[0] : '';
  }

  async function invokeTool(toolFullName, params, options) {
    var rawKey = String(toolFullName || '').trim();
    var key = _tools[rawKey] ? rawKey : (resolveToolFullName(rawKey) || rawKey);
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

    if (tool.mcpServerId && isMcpToolDisabledInSettings(settings, tool.mcpServerId, tool.name)) {
      return {
        ok: false,
        error: '该 MCP 工具已单独停用',
        code: 'tool_disabled',
        reason: 'tool_disabled'
      };
    }

    if (tool.category === CATEGORY_MCP && (!(_plugins[tool.pluginId].mcpMeta && _plugins[tool.pluginId].mcpMeta.connected))) {
      return {
        ok: false,
        error: 'MCP 插件服务尚未连接或测试同步，请先在「MCP 插件」中测试连接',
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
      var rejectedByUser = false;
      var confirmFn = typeof opts.requestConfirmation === 'function'
        ? opts.requestConfirmation
        : (typeof opts.confirmHandler === 'function' ? opts.confirmHandler : null);
      if (!confirmed && confirmFn) {
        var srvInfo = getSanitizedMcpServer(tool.mcpServerId, settings);
        confirmed = !!(await confirmFn({
          pluginId: tool.pluginId,
          plugin: sanitizePluginSummary(_plugins[tool.pluginId]),
          toolName: tool.fullName,
          title: tool.title,
          description: tool.description,
          permissions: clone(perms),
          params: clone(check.params),
          server: srvInfo
        }));
        if (!confirmed) rejectedByUser = true;
      }
      if (!confirmed) {
        return {
          ok: false,
          blocked: true,
          requiresConfirmation: true,
          code: rejectedByUser ? 'user_rejected' : 'confirmation_required',
          error: rejectedByUser
            ? '用户拒绝执行该外部工具'
            : ('该操作涉及敏感或写入权限（' + perms.scopes.join(', ') + '），默认拦截，需用户明确确认后方可执行。')
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

  // ===== 第一批内置插件纯函数实现（无 eval / 无外部网络请求） =====
  function getSecureRandomInt(minInclusive, maxInclusive) {
    var span = maxInclusive - minInclusive + 1;
    if (span <= 1) return minInclusive;
    var cryptoObj = global.crypto || global.msCrypto;
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      var maxValid = Math.floor(0x100000000 / span) * span;
      var buf = new Uint32Array(1);
      for (var attempt = 0; attempt < 32; attempt++) {
        cryptoObj.getRandomValues(buf);
        if (buf[0] < maxValid) {
          return minInclusive + (buf[0] % span);
        }
      }
    }
    return minInclusive + Math.floor(Math.random() * span);
  }

  function parseDiceParams(params) {
    var p = params && typeof params === 'object' ? params : {};
    var count = p.count !== undefined && p.count !== '' ? Number(p.count) : 1;
    var sides = p.sides !== undefined && p.sides !== '' ? Number(p.sides) : 6;

    if (p.notation !== undefined && p.notation !== null && String(p.notation).trim() !== '') {
      var rawNotation = String(p.notation).trim().toLowerCase();
      var m = rawNotation.match(/^(\d*)d(\d+)$/);
      if (!m) {
        throw new Error('骰子表达式格式无效，请使用如 D6、D20 或 2D6');
      }
      count = m[1] ? Number(m[1]) : 1;
      sides = Number(m[2]);
    }

    if (!Number.isInteger(sides) || sides < 2 || sides > 10000) {
      throw new Error('骰子面数需为 2 至 10000 之间的整数');
    }
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      throw new Error('投掷次数需为 1 至 100 之间的整数');
    }
    return { sides: sides, count: count, notation: count + 'D' + sides };
  }

  // 纯手写递归下降数学表达式解析器（严格禁止 eval / new Function）
  function evaluateMathExpression(rawExpr) {
    var raw = String(rawExpr || '').trim();
    if (!raw) {
      throw new Error('请输入要计算的数学表达式');
    }
    var normalized = raw
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/\s+/g, '');

    if (/[^0-9.+\-*/()]/.test(normalized)) {
      throw new Error('表达式包含不支持的字符，仅支持数字、+ - * /、小数点与括号');
    }

    var pos = 0;
    var len = normalized.length;

    function peek() {
      return pos < len ? normalized.charAt(pos) : '';
    }

    function parseNumber() {
      var start = pos;
      var hasDot = false;
      var hasDigit = false;
      while (pos < len) {
        var ch = normalized.charAt(pos);
        if (ch >= '0' && ch <= '9') {
          hasDigit = true;
          pos++;
        } else if (ch === '.') {
          if (hasDot) {
            throw new Error('数字格式错误：存在多余的小数点');
          }
          hasDot = true;
          pos++;
        } else {
          break;
        }
      }
      if (!hasDigit) {
        throw new Error('表达式语法错误，缺少有效数字');
      }
      var numStr = normalized.slice(start, pos);
      var num = Number(numStr);
      if (!Number.isFinite(num)) {
        throw new Error('数值超出可计算范围');
      }
      return num;
    }

    function parseFactor() {
      var ch = peek();
      if (ch === '+') {
        pos++;
        return parseFactor();
      }
      if (ch === '-') {
        pos++;
        return -parseFactor();
      }
      if (ch === '(') {
        pos++;
        if (peek() === ')') {
          throw new Error('括号内不能为空');
        }
        var inner = parseExpr();
        if (peek() !== ')') {
          throw new Error('括号不匹配，缺少右括号 )');
        }
        pos++;
        return inner;
      }
      return parseNumber();
    }

    function parseTerm() {
      var left = parseFactor();
      while (pos < len) {
        var op = peek();
        if (op === '*' || op === '/') {
          pos++;
          var right = parseFactor();
          if (op === '/') {
            if (right === 0) {
              throw new Error('除数不能为零');
            }
            left = left / right;
          } else {
            left = left * right;
          }
          if (!Number.isFinite(left)) {
            throw new Error('计算结果溢出');
          }
        } else {
          break;
        }
      }
      return left;
    }

    function parseExpr() {
      var left = parseTerm();
      while (pos < len) {
        var op = peek();
        if (op === '+' || op === '-') {
          pos++;
          var right = parseTerm();
          left = op === '+' ? (left + right) : (left - right);
          if (!Number.isFinite(left)) {
            throw new Error('计算结果溢出');
          }
        } else {
          break;
        }
      }
      return left;
    }

    var value = parseExpr();
    if (pos < len) {
      throw new Error('表达式存在多余符号或未匹配的括号：' + normalized.slice(pos));
    }
    if (!Number.isFinite(value)) {
      throw new Error('计算结果无效');
    }
    var cleanValue = Object.is(value, -0) ? 0 : Number(value.toPrecision(12));
    return {
      expression: raw,
      normalizedExpression: normalized,
      result: cleanValue,
      formatted: String(cleanValue)
    };
  }

  function formatUtcOffset(dateObj) {
    var offsetMin = -dateObj.getTimezoneOffset();
    var sign = offsetMin >= 0 ? '+' : '-';
    var absMin = Math.abs(offsetMin);
    var hh = String(Math.floor(absMin / 60)).padStart(2, '0');
    var mm = String(absMin % 60).padStart(2, '0');
    return 'UTC' + sign + hh + ':' + mm;
  }

  // ===== 注册默认内置插件与 MCP 框架预留项 =====

  // ===== 7-A4: MCP Streamable HTTP 协议接入、SSRF 校验与工具同步 =====
  function maskSecret(secret) {
    var raw = String(secret || '').trim();
    if (!raw) return '';
    if (raw.length <= 8) return '••••';
    return raw.slice(0, 3) + '••••' + raw.slice(-4);
  }

  function isPrivateOrBlockedHostname(hostname, ipv4Override) {
    var h = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (!h) return true;
    if (
      h === 'localhost' ||
      h === 'ip6-localhost' ||
      h.endsWith('.localhost') ||
      h.endsWith('.local') ||
      h.endsWith('.internal') ||
      h.endsWith('.localdomain')
    ) {
      return true;
    }
    if (h === '::1' || h === '::' || h.indexOf('fe80:') === 0 || h.indexOf('fc') === 0 || h.indexOf('fd') === 0) {
      return true;
    }
    var ipStr = ipv4Override || h;
    if (ipStr.indexOf('::ffff:') === 0) {
      ipStr = ipStr.slice(7);
    }
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ipStr);
    if (m) {
      var a = Number(m[1]), b = Number(m[2]), c = Number(m[3]), d = Number(m[4]);
      if (a > 255 || b > 255 || c > 255 || d > 255) return true;
      if (a === 0 || a === 10 || a === 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
    }
    return false;
  }

  function validateMcpEndpointUrl(rawUrl, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var text = String(rawUrl || '').trim();
    if (!text) {
      return { ok: false, error: '请填写 MCP 服务器 URL' };
    }
    if (/^(stdio:|npx\s|uvx\s|node\s|python\s|ws:|wss:|file:|ftp:|javascript:|data:)/i.test(text)) {
      return {
        ok: false,
        code: 'unsupported_transport',
        error: '当前仅支持远程 MCP Streamable HTTP 协议（https://...），暂不支持本地 stdio / WebSocket 连接。'
      };
    }
    var parsed;
    try {
      parsed = new URL(text);
    } catch (_) {
      return { ok: false, code: 'invalid_url', error: 'MCP 服务器 URL 格式无效，请输入完整的 https:// 地址' };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        ok: false,
        code: 'unsupported_transport',
        error: '不支持的协议「' + parsed.protocol + '」，当前仅支持远程 MCP Streamable HTTP（https:// 或 http://）。'
      };
    }
    if (parsed.username || parsed.password) {
      return {
        ok: false,
        code: 'credentials_in_url',
        error: '安全校验拦截：禁止在 URL 中直接嵌入账号或密码，请使用下方认证信息字段。'
      };
    }
    if (!opts.allowPrivateNetwork && isPrivateOrBlockedHostname(parsed.hostname)) {
      return {
        ok: false,
        code: 'ssrf_blocked',
        error: '安全校验拦截：默认禁止访问本机或内网地址（防 SSRF），请使用公网 HTTPS MCP 服务地址。'
      };
    }
    return {
      ok: true,
      url: parsed.toString(),
      origin: parsed.origin
    };
  }

  function normalizeMcpCachedTool(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name = String(raw.name || '').trim();
    if (!name) return null;
    var ann = raw.annotations && typeof raw.annotations === 'object' ? raw.annotations : null;
    return {
      name: name,
      title: String(raw.title || name).trim(),
      description: String(raw.description || '').trim(),
      inputSchema: normalizeParameters(raw.inputSchema || raw.parameters),
      annotations: ann ? {
        readOnlyHint: ann.readOnlyHint === true,
        destructiveHint: ann.destructiveHint === true,
        idempotentHint: ann.idempotentHint === true,
        openWorldHint: ann.openWorldHint === true
      } : null
    };
  }

  function isMcpToolExplicitSafeReadOnly(toolDef) {
    var ann = toolDef && toolDef.annotations;
    if (!ann || typeof ann !== 'object') return false;
    return ann.readOnlyHint === true && ann.destructiveHint !== true && ann.openWorldHint !== true;
  }

  function normalizeMcpServerRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = String(raw.id || '').trim();
    if (!id) return null;
    var transport = String(raw.transport || 'streamable_http').trim().toLowerCase();
    if (transport !== 'streamable_http') transport = 'streamable_http';
    var authType = String(raw.authType || 'none').trim().toLowerCase();
    if (['none', 'bearer', 'header'].indexOf(authType) === -1) authType = 'none';
    var disabledTools = {};
    if (raw.disabledTools && typeof raw.disabledTools === 'object') {
      Object.keys(raw.disabledTools).forEach(function(k) {
        if (raw.disabledTools[k]) disabledTools[String(k)] = true;
      });
    }
    var cachedTools = [];
    if (Array.isArray(raw.cachedTools)) {
      raw.cachedTools.forEach(function(t) {
        var nt = normalizeMcpCachedTool(t);
        if (nt) cachedTools.push(nt);
      });
    }
    return {
      id: id,
      name: String(raw.name || 'MCP 服务器').trim().slice(0, 60),
      transport: transport,
      url: String(raw.url || '').trim(),
      authType: authType,
      authHeaderName: String(raw.authHeaderName || 'X-API-Key').trim().slice(0, 80) || 'X-API-Key',
      authToken: String(raw.authToken || ''),
      enabled: raw.enabled !== false,
      allowPrivateNetwork: !!raw.allowPrivateNetwork,
      disabledTools: disabledTools,
      cachedTools: cachedTools,
      lastSyncAt: Number(raw.lastSyncAt) || 0,
      lastError: String(raw.lastError || '').slice(0, 300),
      sessionId: String(raw.sessionId || '').slice(0, 200)
    };
  }

  function sanitizeMcpServer(srv) {
    if (!srv) return null;
    var origin = '';
    try { origin = srv.url ? new URL(srv.url).origin : ''; } catch (_) {}
    return {
      id: srv.id,
      name: srv.name,
      transport: srv.transport,
      url: srv.url,
      origin: origin,
      authType: srv.authType,
      authHeaderName: srv.authHeaderName,
      hasAuthToken: !!srv.authToken,
      authTokenMasked: maskSecret(srv.authToken),
      enabled: srv.enabled !== false,
      allowPrivateNetwork: !!srv.allowPrivateNetwork,
      disabledTools: clone(srv.disabledTools || {}),
      cachedTools: clone(srv.cachedTools || []),
      lastSyncAt: srv.lastSyncAt || 0,
      lastError: srv.lastError || ''
    };
  }

  function getSanitizedMcpServer(serverId, settings) {
    if (!serverId || !settings || !Array.isArray(settings.mcpServers)) return null;
    for (var i = 0; i < settings.mcpServers.length; i++) {
      if (settings.mcpServers[i].id === serverId) {
        return sanitizeMcpServer(settings.mcpServers[i]);
      }
    }
    return null;
  }

  function isMcpToolDisabledInSettings(settings, serverId, toolName) {
    if (!settings || !Array.isArray(settings.mcpServers)) return false;
    for (var i = 0; i < settings.mcpServers.length; i++) {
      var srv = settings.mcpServers[i];
      if (srv.id === serverId) {
        return !!(srv.disabledTools && srv.disabledTools[toolName]);
      }
    }
    return false;
  }

  function syncMcpServersToRegistry(settings) {
    var servers = (settings && Array.isArray(settings.mcpServers)) ? settings.mcpServers : [];
    Object.keys(_plugins).forEach(function(pid) {
      if (pid.indexOf('mcp_srv_') === 0) {
        var oldPlg = _plugins[pid];
        if (oldPlg && Array.isArray(oldPlg.tools)) {
          oldPlg.tools.forEach(function(t) { delete _tools[t.fullName]; });
        }
        delete _plugins[pid];
      }
    });

    if (servers.length > 0 && _plugins['mcp_reserved_gateway']) {
      var gw = _plugins['mcp_reserved_gateway'];
      if (Array.isArray(gw.tools)) {
        gw.tools.forEach(function(t) { delete _tools[t.fullName]; });
      }
      delete _plugins['mcp_reserved_gateway'];
    } else if (servers.length === 0 && !_plugins['mcp_reserved_gateway']) {
      registerReservedMcpPlaceholder();
    }

    servers.forEach(function(srv) {
      var origin = '';
      try { origin = srv.url ? new URL(srv.url).origin : srv.url; } catch (_) { origin = srv.url; }
      var toolsForReg = (srv.cachedTools || []).map(function(t) {
        var safeRo = isMcpToolExplicitSafeReadOnly(t);
        return {
          name: t.name,
          title: t.title || t.name,
          description: t.description || '外部 MCP 工具',
          parameters: normalizeParameters(t.inputSchema),
          mcpServerId: srv.id,
          permissions: {
            readOnly: safeRo,
            scopes: safeRo ? [PERMISSION_SCOPES.READ_ONLY] : [PERMISSION_SCOPES.EXTERNAL_ACTION],
            requiresConfirmation: !safeRo
          },
          execute: async function(params) {
            return await mcpCallRemoteTool(srv.id, t.name, params);
          }
        };
      });

      registerMcpDescriptor({
        id: srv.id,
        name: srv.name,
        description: '远程 MCP Streamable HTTP 服务（' + (origin || '未配置地址') + '）' + (srv.lastError ? (' · 上次异常：' + srv.lastError) : ''),
        version: 'MCP',
        author: origin || 'MCP Server',
        defaultEnabled: srv.enabled !== false,
        permissions: {
          readOnly: false,
          scopes: [PERMISSION_SCOPES.EXTERNAL_ACTION],
          requiresConfirmation: true
        },
        mcpMeta: {
          connected: srv.lastSyncAt > 0 && !srv.lastError,
          transport: 'streamable_http',
          endpoint: origin,
          serverId: srv.id,
          lastSyncAt: srv.lastSyncAt || 0,
          lastError: srv.lastError || ''
        },
        tools: toolsForReg
      });

      toolsForReg.forEach(function(td) {
        var fn = buildToolFullName(srv.id, td.name);
        if (_tools[fn]) {
          _tools[fn].mcpServerId = srv.id;
          _tools[fn].permissions = normalizePermissions(td.permissions);
        }
      });
    });
  }

  function buildMcpAuthHeaders(srv) {
    var headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    };
    if (srv.sessionId) {
      headers['Mcp-Session-Id'] = srv.sessionId;
    }
    var token = String(srv.authToken || '').trim();
    if (token) {
      if (srv.authType === 'bearer') {
        headers.Authorization = /^Bearer\s+/i.test(token) ? token : ('Bearer ' + token);
      } else if (srv.authType === 'header') {
        var hName = String(srv.authHeaderName || 'X-API-Key').trim();
        if (hName && !/^(host|content-length|connection)$/i.test(hName)) {
          headers[hName] = token;
        }
      }
    }
    return headers;
  }

  function parseMcpHttpResponseBody(rawText, contentType, expectedId) {
    var text = String(rawText || '').trim();
    if (!text) return null;
    if (/text\/event-stream/i.test(contentType || '') || /^\s*(event:|data:)/m.test(text)) {
      var lines = text.split(/\r?\n/);
      var matched = null;
      var lastJson = null;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.indexOf('data:') !== 0) continue;
        var payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          var parsed = JSON.parse(payload);
          lastJson = parsed;
          if (expectedId !== undefined && parsed && parsed.id === expectedId) {
            matched = parsed;
          }
        } catch (_) {}
      }
      return matched || lastJson;
    }
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  async function mcpJsonRpcRequest(srv, method, params, options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (srv.transport && srv.transport !== 'streamable_http') {
      throw new Error('不支持的 MCP 连接方式，当前仅支持远程 Streamable HTTP');
    }
    var check = validateMcpEndpointUrl(srv.url, { allowPrivateNetwork: !!srv.allowPrivateNetwork });
    if (!check.ok) {
      throw new Error(check.error);
    }
    var timeoutMs = Math.max(2000, Math.min(60000, Number(opts.timeoutMs) || 12000));
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function() { controller.abort(); }, timeoutMs) : null;
    var reqId = opts.isNotification ? undefined : (Date.now() + Math.floor(Math.random() * 1000));
    var payload = opts.isNotification
      ? { jsonrpc: '2.0', method: method, params: params || {} }
      : { jsonrpc: '2.0', id: reqId, method: method, params: params || {} };

    var res;
    try {
      res = await fetch(check.url, {
        method: 'POST',
        headers: buildMcpAuthHeaders(srv),
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      });
    } catch (netErr) {
      if (timer) clearTimeout(timer);
      if (netErr && netErr.name === 'AbortError') {
        throw new Error('MCP 请求超时（' + Math.round(timeoutMs / 1000) + ' 秒）');
      }
      throw new Error('无法连接到 MCP 服务器：' + (netErr && netErr.message ? netErr.message : '网络异常'));
    }
    if (timer) clearTimeout(timer);

    if (res.status === 401 || res.status === 403) {
      throw new Error('MCP 认证失败（HTTP ' + res.status + '），请检查认证方式或密钥配置');
    }
    if (!res.ok) {
      throw new Error('MCP 服务返回错误（HTTP ' + res.status + '）');
    }
    var nextSid = (res.headers && res.headers.get && res.headers.get('mcp-session-id')) || '';
    if (opts.isNotification) {
      return { ok: true, sessionId: nextSid };
    }
    var ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    var rawText = await res.text();
    var rpc = parseMcpHttpResponseBody(rawText, ct, reqId);
    if (!rpc) {
      throw new Error('MCP 服务返回了无法解析的响应内容');
    }
    if (rpc.error) {
      throw new Error('MCP 协议错误：' + ((rpc.error && rpc.error.message) || String(rpc.error)));
    }
    return { ok: true, result: rpc.result, sessionId: nextSid };
  }

  async function testAndSyncMcpServer(serverOrId, options) {
    var settings = await loadPluginSettings();
    var srv = null;
    if (typeof serverOrId === 'string') {
      srv = settings.mcpServers.find(function(item) { return item.id === serverOrId; }) || null;
    } else if (serverOrId && typeof serverOrId === 'object') {
      srv = normalizeMcpServerRecord(Object.assign({ id: serverOrId.id || 'mcp_srv_preview' }, serverOrId));
      if (srv && srv.id && !srv.authToken) {
        var existing = settings.mcpServers.find(function(item) { return item.id === srv.id; });
        if (existing && existing.authToken) srv.authToken = existing.authToken;
      }
    }
    if (!srv) return { ok: false, error: '未找到对应的 MCP 服务器配置' };

    var workSrv = Object.assign({}, srv, { sessionId: '' });
    try {
      var initRes = await mcpJsonRpcRequest(workSrv, 'initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'zhiyu-workspace', version: '1.0.0' }
      }, { timeoutMs: (options && options.timeoutMs) || 12000 });
      if (initRes.sessionId) workSrv.sessionId = initRes.sessionId;

      try {
        await mcpJsonRpcRequest(workSrv, 'notifications/initialized', {}, { isNotification: true, timeoutMs: 5000 });
      } catch (_) {}

      var listRes = await mcpJsonRpcRequest(workSrv, 'tools/list', {}, { timeoutMs: (options && options.timeoutMs) || 12000 });
      var rawTools = (listRes.result && Array.isArray(listRes.result.tools)) ? listRes.result.tools : [];
      var normTools = rawTools.map(normalizeMcpCachedTool).filter(Boolean);

      if (typeof serverOrId === 'string' || (options && options.persist && srv.id !== 'mcp_srv_preview')) {
        var idx = settings.mcpServers.findIndex(function(item) { return item.id === srv.id; });
        if (idx !== -1) {
          settings.mcpServers[idx].cachedTools = normTools;
          settings.mcpServers[idx].lastSyncAt = Date.now();
          settings.mcpServers[idx].lastError = '';
          settings.mcpServers[idx].sessionId = workSrv.sessionId || '';
          settings = await savePluginSettings(settings);
        }
      }
      return {
        ok: true,
        server: sanitizeMcpServer(Object.assign({}, workSrv, { cachedTools: normTools, lastSyncAt: Date.now(), lastError: '' })),
        tools: normTools,
        settings: settings
      };
    } catch (err) {
      var errMsg = (err && err.message) ? err.message : 'MCP 连接测试失败';
      if (typeof serverOrId === 'string') {
        var eIdx = settings.mcpServers.findIndex(function(item) { return item.id === srv.id; });
        if (eIdx !== -1) {
          settings.mcpServers[eIdx].lastError = errMsg;
          settings = await savePluginSettings(settings);
        }
      }
      return { ok: false, error: errMsg, settings: settings };
    }
  }

  async function mcpCallRemoteTool(serverId, toolName, params) {
    var settings = await loadPluginSettings();
    var srv = settings.mcpServers.find(function(item) { return item.id === serverId; });
    if (!srv) throw new Error('未找到对应的 MCP 服务器配置');
    var callRes = await mcpJsonRpcRequest(srv, 'tools/call', {
      name: toolName,
      arguments: (params && typeof params === 'object') ? params : {}
    }, { timeoutMs: 20000 });
    var result = callRes.result || {};
    if (result.isError) {
      var errContent = Array.isArray(result.content)
        ? result.content.map(function(c) { return c && c.text ? c.text : ''; }).filter(Boolean).join('\n')
        : '';
      throw new Error(errContent || 'MCP 工具返回执行错误');
    }
    var textParts = Array.isArray(result.content)
      ? result.content.map(function(c) { return (c && c.type === 'text' && c.text) ? c.text : ''; }).filter(Boolean)
      : [];
    return {
      text: textParts.join('\n'),
      content: result.content || [],
      structuredContent: result.structuredContent || null
    };
  }

  async function listMcpServers() {
    var settings = await loadPluginSettings();
    return (settings.mcpServers || []).map(sanitizeMcpServer);
  }

  async function saveMcpServer(serverInput) {
    var input = serverInput && typeof serverInput === 'object' ? serverInput : {};
    var check = validateMcpEndpointUrl(input.url, { allowPrivateNetwork: !!input.allowPrivateNetwork });
    if (!check.ok) {
      throw new Error(check.error);
    }
    var settings = await loadPluginSettings();
    var id = String(input.id || '').trim() || ('mcp_srv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
    var idx = settings.mcpServers.findIndex(function(item) { return item.id === id; });
    var existing = idx !== -1 ? settings.mcpServers[idx] : null;
    var nextAuthType = input.authType || 'none';
    var nextToken = nextAuthType === 'none'
      ? ''
      : ((input.authToken !== undefined && input.authToken !== '')
          ? String(input.authToken)
          : (input.clearAuthToken ? '' : (existing ? existing.authToken : '')));

    var record = normalizeMcpServerRecord({
      id: id,
      name: String(input.name || '').trim() || 'MCP 服务器',
      transport: input.transport || 'streamable_http',
      url: check.url,
      authType: input.authType || 'none',
      authHeaderName: input.authHeaderName || 'X-API-Key',
      authToken: nextToken,
      enabled: input.enabled !== undefined ? !!input.enabled : (existing ? existing.enabled : true),
      allowPrivateNetwork: input.allowPrivateNetwork !== undefined ? !!input.allowPrivateNetwork : (existing ? existing.allowPrivateNetwork : false),
      disabledTools: existing ? existing.disabledTools : {},
      cachedTools: Array.isArray(input.cachedTools) ? input.cachedTools : (existing ? existing.cachedTools : []),
      lastSyncAt: input.lastSyncAt !== undefined ? input.lastSyncAt : (existing ? existing.lastSyncAt : 0),
      lastError: input.lastError !== undefined ? input.lastError : (existing ? existing.lastError : ''),
      sessionId: ''
    });

    if (idx !== -1) {
      settings.mcpServers[idx] = record;
    } else {
      settings.mcpServers.push(record);
    }
    var saved = await savePluginSettings(settings);
    return {
      server: getSanitizedMcpServer(id, saved),
      settings: saved
    };
  }

  async function deleteMcpServer(serverId) {
    var settings = await loadPluginSettings();
    settings.mcpServers = (settings.mcpServers || []).filter(function(item) { return item.id !== serverId; });
    if (settings.plugins && settings.plugins[serverId]) {
      delete settings.plugins[serverId];
    }
    if (settings.chatOverrides) {
      Object.keys(settings.chatOverrides).forEach(function(cid) {
        if (settings.chatOverrides[cid] && settings.chatOverrides[cid].plugins) {
          delete settings.chatOverrides[cid].plugins[serverId];
        }
      });
    }
    return await savePluginSettings(settings);
  }

  async function setMcpToolEnabled(serverId, toolName, enabled) {
    var settings = await loadPluginSettings();
    var srv = (settings.mcpServers || []).find(function(item) { return item.id === serverId; });
    if (!srv) return settings;
    if (!srv.disabledTools || typeof srv.disabledTools !== 'object') srv.disabledTools = {};
    if (enabled) {
      delete srv.disabledTools[toolName];
    } else {
      srv.disabledTools[toolName] = true;
    }
    return await savePluginSettings(settings);
  }

  function registerStarterPlugins() {
    registerPlugin({
      id: 'builtin_time_utils',
      name: '时间感知',
      category: CATEGORY_BUILTIN,
      description: '获取当前本地日期、星期、具体时间及用户所在时区，纯只读不修改任何数据。',
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
          title: '获取当前日期时间与时区',
          description: '只读返回当前日期、星期、时间、用户时区与 UTC 偏移量。',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          },
          execute: async function(_params, ctx) {
            var now = new Date();
            var weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
            var hourFormat = (ctx && ctx.config && String(ctx.config.hourFormat || '').toLowerCase() === '12h') ? '12h' : '24h';
            var hh24 = now.getHours();
            var mm = String(now.getMinutes()).padStart(2, '0');
            var ss = String(now.getSeconds()).padStart(2, '0');
            var timeStr = hourFormat === '12h'
              ? ((hh24 >= 12 ? '下午 ' : '上午 ') + String(hh24 % 12 || 12).padStart(2, '0') + ':' + mm + ':' + ss)
              : (String(hh24).padStart(2, '0') + ':' + mm + ':' + ss);
            var tz = '';
            try {
              tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
            } catch (_) {}
            var utcOffset = formatUtcOffset(now);
            return {
              date: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'),
              weekday: weekdays[now.getDay()] || '',
              time: timeStr,
              timezone: tz || utcOffset,
              utcOffset: utcOffset,
              hourFormat: hourFormat,
              iso: now.toISOString()
            };
          }
        }
      ]
    });

    registerPlugin({
      id: 'builtin_dice_roller',
      name: '随机骰子',
      category: CATEGORY_BUILTIN,
      description: '支持 D6、D20 等常见骰子及自定义面数与投掷次数，使用加密级随机数生成。',
      version: '1.0.0',
      author: '知屿内置',
      defaultEnabled: true,
      permissions: {
        readOnly: true,
        scopes: [PERMISSION_SCOPES.READ_ONLY],
        requiresConfirmation: false
      },
      configSchema: [
        { key: 'defaultSides', label: '默认面数（如 6 或 20）', type: 'text', placeholder: '6' }
      ],
      defaultConfig: { defaultSides: '6' },
      tools: [
        {
          name: 'roll_dice',
          title: '投掷骰子',
          description: '支持传入 notation（如 2D6、D20）或 sides/count 自定义投掷，返回每次点数与总和。',
          parameters: {
            type: 'object',
            properties: {
              notation: { type: 'string', description: '骰子表达式，如 D6、D20、2D6' },
              sides: { type: 'number', description: '骰子面数（2~10000）' },
              count: { type: 'number', description: '投掷次数（1~100）' }
            },
            required: []
          },
          execute: async function(params, ctx) {
            var p = Object.assign({}, params || {});
            if ((p.sides === undefined || p.sides === '') && (!p.notation || !String(p.notation).trim())) {
              var defSides = Number(ctx && ctx.config && ctx.config.defaultSides);
              if (Number.isInteger(defSides) && defSides >= 2) p.sides = defSides;
            }
            var parsed = parseDiceParams(p);
            var rolls = [];
            var total = 0;
            var minRoll = parsed.sides;
            var maxRoll = 1;
            for (var i = 0; i < parsed.count; i++) {
              var val = getSecureRandomInt(1, parsed.sides);
              rolls.push(val);
              total += val;
              if (val < minRoll) minRoll = val;
              if (val > maxRoll) maxRoll = val;
            }
            return {
              notation: parsed.notation,
              sides: parsed.sides,
              count: parsed.count,
              rolls: rolls,
              total: total,
              min: minRoll,
              max: maxRoll
            };
          }
        }
      ]
    });

    registerPlugin({
      id: 'builtin_calculator',
      name: '计算器',
      category: CATEGORY_BUILTIN,
      description: '安全计算加减乘除四则运算、括号与小数，采用纯语法解析器，绝不使用 eval。',
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
          name: 'calculate_expression',
          title: '计算数学表达式',
          description: '支持 + - * /、括号与小数运算，禁止 eval。',
          parameters: {
            type: 'object',
            properties: {
              expression: { type: 'string', description: '数学表达式，如 (12.5 + 7.5) * 3 / 4' }
            },
            required: ['expression']
          },
          execute: async function(params) {
            return evaluateMathExpression(params && params.expression);
          }
        }
      ]
    });

    registerPlugin({
      id: 'builtin_rp_random_event',
      name: '随机事件',
      category: CATEGORY_BUILTIN,
      description: '结合当前聊天的角色、世界观与剧情上下文，生成不篡改既定剧情的随机事件建议。',
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
          name: 'generate_random_event',
          title: '生成随机事件建议',
          description: '读取当前聊天的角色设定、世界书与上下文，生成随机事件建议（仅作建议，不修改剧情）。',
          parameters: {
            type: 'object',
            properties: {
              sceneHint: { type: 'string', description: '可选：当前场景或方向提示，如“雨夜街头”' },
              tone: { type: 'string', description: '可选：期望氛围，如“日常”“悬疑”“温馨”' }
            },
            required: []
          },
          execute: async function(params, execContext) {
            var ctx = await collectChatRoleplayContext(execContext, params);
            return extractRoleplayRandomEventSuggestion(ctx, params);
          }
        }
      ]
    });

    registerPlugin({
      id: 'builtin_rp_story_state',
      name: '剧情状态',
      category: CATEGORY_BUILTIN,
      description: '只读整理当前聊天已有的人物关系、所在地点、当前事件与未解决事项，不编造也不修改记录。',
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
          name: 'get_story_state',
          title: '整理当前剧情状态',
          description: '读取当前聊天已有记录，只读整理人物关系、所在地点、当前事件与未解决事项。',
          parameters: {
            type: 'object',
            properties: {
              focus: { type: 'string', description: '可选：重点关注的方面，如“人物关系”“所在地点”“未解决事项”' }
            },
            required: []
          },
          execute: async function(params, execContext) {
            var ctx = await collectChatRoleplayContext(execContext, params);
            return extractRoleplayStoryState(ctx, params);
          }
        }
      ]
    });

    registerReservedMcpPlaceholder();
  }


  // ===== 7-A5: 角色扮演专属内置插件（严格绑定当前 chatId，只读不篡改剧情/记忆） =====
  async function collectChatRoleplayContext(execContext, params) {
    var ctx = execContext && typeof execContext === 'object' ? execContext : {};
    var p = params && typeof params === 'object' ? params : {};
    var targetChatId = String(ctx.chatId || p.chatId || '').trim();
    if (!targetChatId) {
      throw new Error('未绑定当前聊天（请先打开或选择一个对话后再使用该插件）');
    }
    var st = S();
    if (!st || typeof st.getChat !== 'function') {
      throw new Error('存储模块未就绪，无法读取当前聊天上下文');
    }
    var chat = await st.getChat(targetChatId);
    if (!chat) {
      throw new Error('未找到对应的聊天记录：' + targetChatId);
    }

    var preset = null;
    if (chat.presetId && typeof st.getPreset === 'function') {
      try { preset = await st.getPreset(chat.presetId); } catch (_) {}
    }
    if (!preset && chat.presetSnapshot) {
      preset = chat.presetSnapshot;
    }
    var profile = typeof st.getProfile === 'function' ? (await st.getProfile()) : null;

    var allMsgs = Array.isArray(chat.messages) ? chat.messages : [];
    var validMsgs = allMsgs.filter(function(m) {
      return m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim();
    });
    var recentMessages = validMsgs.slice(-12);

    var summaryText = String(chat.summary || '').trim();
    if (!summaryText && Array.isArray(chat.summarySegments) && chat.summarySegments.length) {
      summaryText = chat.summarySegments
        .filter(function(seg) { return seg && seg.status === 'active' && seg.content; })
        .map(function(seg) { return seg.content; })
        .join('\n');
    }

    var memories = [];
    if (typeof st.listMemories === 'function') {
      try {
        var allMems = await st.listMemories();
        memories = (allMems || []).filter(function(m) {
          if (!m || !m.content) return false;
          var mCid = String(m.chatId || m.sourceChatId || '').trim();
          return mCid === targetChatId;
        });
      } catch (_) {}
    }

    var worldBookEntries = [];
    var effectiveBooks = [];
    if (typeof st.matchWorldBookEntries === 'function') {
      try {
        var wbRes = await st.matchWorldBookEntries({
          preset: preset,
          messages: recentMessages,
          userInput: String(p.sceneHint || p.focus || '')
        });
        if (wbRes) {
          worldBookEntries = Array.isArray(wbRes.matchedEntries) ? wbRes.matchedEntries : [];
          effectiveBooks = Array.isArray(wbRes.effectiveBooks) ? wbRes.effectiveBooks : [];
        }
      } catch (_) {}
    }

    return {
      chatId: targetChatId,
      chat: chat,
      preset: preset,
      profile: profile,
      validMessageCount: validMsgs.length,
      recentMessages: recentMessages,
      summaryText: summaryText,
      memories: memories,
      worldBookEntries: worldBookEntries,
      effectiveBooks: effectiveBooks
    };
  }

  function extractRoleplayRandomEventSuggestion(ctx, params) {
    var p = params && typeof params === 'object' ? params : {};
    var sceneHint = String(p.sceneHint || '').trim();
    var tone = String(p.tone || '').trim();
    var charName = (ctx.preset && ctx.preset.name) ? String(ctx.preset.name).trim() : '角色';
    var userName = (ctx.profile && ctx.profile.name) ? String(ctx.profile.name).trim() : '你';

    var wbKeywords = [];
    var wbTitles = [];
    (ctx.worldBookEntries || []).slice(0, 5).forEach(function(e) {
      if (e && e.title) wbTitles.push(String(e.title));
      if (e && Array.isArray(e.keywords)) {
        e.keywords.slice(0, 2).forEach(function(k) {
          if (k) wbKeywords.push(String(k));
        });
      }
    });

    var anchorText = sceneHint ||
      (wbKeywords.length ? wbKeywords[0] : '') ||
      (ctx.recentMessages.length ? String(ctx.recentMessages[ctx.recentMessages.length - 1].content || '').replace(/\s+/g, ' ').slice(0, 28) : '') ||
      (ctx.chat.title || '当前场景');

    var templates = [
      {
        title: '环境细节变化',
        build: function() {
          return '围绕「' + anchorText + '」，周围突然出现轻微的氛围变化（如天气转折、灯光闪烁或远处的声响），给' + charName + '与' + userName + '一个自然接话或互动的契机。';
        }
      },
      {
        title: '意外线索或物件出现',
        build: function() {
          var refHint = wbTitles.length ? ('（可呼应设定「' + wbTitles[0] + '」）') : '';
          return '在当前情境中，' + charName + '或' + userName + '无意间留意到一件与「' + anchorText + '」相关的旧物、便签或微弱异常' + refHint + '，可供推进探索。';
        }
      },
      {
        title: '角色情绪与微动作呼应',
        build: function() {
          return charName + '因「' + anchorText + '」联想到过去的某段记忆或细节，神情或语气出现细微变化，等待' + userName + '察觉并追问。';
        }
      },
      {
        title: '突发小插曲',
        build: function() {
          return '一个不破坏主线的小插曲打断了原本的节奏（如路人经过、消息提示或时间节点临近），促使' + charName + '和' + userName + '做出即时反应。';
        }
      }
    ];

    var pickIdx = getSecureRandomInt(0, templates.length - 1);
    var picked = templates[pickIdx];
    return {
      chatId: ctx.chatId,
      isSuggestionOnly: true,
      mutatesStory: false,
      characterName: charName,
      userName: userName,
      tone: tone || '贴合当前氛围',
      sceneAnchor: anchorText,
      worldBookRefs: wbTitles,
      eventTitle: picked.title,
      eventSuggestion: picked.build(),
      integrationTip: '此事件仅为剧情建议，未修改既定剧情或聊天记录，可自然融入对话或忽略。'
    };
  }

  function extractRoleplayStoryState(ctx, params) {
    var p = params && typeof params === 'object' ? params : {};
    var focus = String(p.focus || '').trim();
    var charName = (ctx.preset && ctx.preset.name) ? String(ctx.preset.name).trim() : '';
    var userName = (ctx.profile && ctx.profile.name) ? String(ctx.profile.name).trim() : '';

    var corpusLines = [];
    if (ctx.summaryText) {
      ctx.summaryText.split(/\r?\n/).forEach(function(line) {
        var t = line.trim();
        if (t) corpusLines.push({ source: '短期摘要', text: t });
      });
    }
    (ctx.memories || []).forEach(function(m) {
      if (m && m.content) {
        corpusLines.push({ source: '聊天记忆', text: String(m.content).trim() });
      }
    });
    (ctx.recentMessages || []).forEach(function(m) {
      var speaker = m.role === 'assistant' ? (charName || '对方') : (userName || '用户');
      var snippet = String(m.content || '').replace(/\s+/g, ' ').trim();
      if (snippet) {
        corpusLines.push({ source: '近期对话(' + speaker + ')', text: snippet.slice(0, 140) });
      }
    });

    var relationships = [];
    if (charName || userName) {
      relationships.push((userName || '用户') + ' 与 ' + (charName || '当前角色') + '（当前对话双方）');
    }
    corpusLines.forEach(function(item) {
      if (/(关系|朋友|恋人|搭档|同事|师徒|兄妹|姐弟|同学|邻居|未婚|上司|下属|认识|约定)/.test(item.text)) {
        if (relationships.length < 6) relationships.push('[' + item.source + '] ' + item.text.slice(0, 100));
      }
    });

    var locations = [];
    corpusLines.forEach(function(item) {
      if (/(地点|位置|来到|回到|身处|位于|医院|学校|天台|咖啡|餐厅|公寓|房间|客厅|卧室|街道|公司|车站|酒吧|图书馆|公园|大厅)/.test(item.text)) {
        if (locations.length < 6) locations.push('[' + item.source + '] ' + item.text.slice(0, 100));
      }
    });

    var currentEvents = [];
    if (ctx.summaryText) {
      var plotMatch = ctx.summaryText.match(/【剧情经过】([\s\S]*?)(?=【|$)/);
      if (plotMatch && plotMatch[1] && plotMatch[1].trim()) {
        currentEvents.push('[短期摘要] ' + plotMatch[1].trim().slice(0, 180));
      }
    }
    ctx.recentMessages.slice(-3).forEach(function(m) {
      var sp = m.role === 'assistant' ? (charName || '对方') : (userName || '用户');
      currentEvents.push('[' + sp + '] ' + String(m.content || '').replace(/\s+/g, ' ').trim().slice(0, 100));
    });

    var unresolvedItems = [];
    if (ctx.summaryText) {
      var keyMatch = ctx.summaryText.match(/【(?:关键记忆|长期要紧)】([\s\S]*?)(?=【|$)/);
      if (keyMatch && keyMatch[1] && keyMatch[1].trim()) {
        unresolvedItems.push('[关键记忆] ' + keyMatch[1].trim().slice(0, 160));
      }
    }
    corpusLines.forEach(function(item) {
      if (/(待解决|未解决|还没|尚未|约定|明天|下周|计划|调查|秘密|需要|准备|？|\?)/.test(item.text)) {
        if (unresolvedItems.length < 6) unresolvedItems.push('[' + item.source + '] ' + item.text.slice(0, 100));
      }
    });

    return {
      chatId: ctx.chatId,
      chatTitle: ctx.chat.title || '',
      characterName: charName || '未绑定角色',
      focus: focus || '全部',
      readOnly: true,
      fabricated: false,
      sourceCounts: {
        validMessages: ctx.validMessageCount,
        hasSummary: !!ctx.summaryText,
        chatMemories: (ctx.memories || []).length,
        worldBookEntries: (ctx.worldBookEntries || []).length
      },
      relationships: relationships,
      locations: locations,
      currentEvents: currentEvents,
      unresolvedItems: unresolvedItems,
      note: '仅基于当前聊天的已有对话、摘要、本聊天记忆与世界书整理；未出现的项目不作编造。'
    };
  }

  function registerReservedMcpPlaceholder() {
    registerMcpDescriptor({
      id: 'mcp_reserved_gateway',
      name: 'MCP 扩展服务（预留）',
      description: '统一兼容未来外部 MCP Server 工具接入；当前仅预留协议接口与管理界面，暂不连接真实 MCP 服务。',
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

  async function getEnabledOpenAiTools(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var settings = opts.settings || (await loadPluginSettings());
    var all = await listTools({ settings: settings, chatId: opts.chatId || '' });
    var tools = [];
    var nameMap = {};
    for (var i = 0; i < all.length; i++) {
      var t = all[i];
      var rawTool = t ? _tools[t.fullName] : null;
      var rawPlugin = t ? _plugins[t.pluginId] : null;
      if (!t || !t.enabled || !rawTool || typeof rawTool.execute !== 'function') continue;
      var apiName = toApiToolName(t.fullName);
      nameMap[apiName] = t.fullName;
      var pName = (rawPlugin && rawPlugin.name) || '';
      tools.push({
        type: 'function',
        function: {
          name: apiName,
          description: (pName ? ('[' + pName + '] ') : '') + (t.description || t.title || t.name),
          parameters: t.parameters || { type: 'object', properties: {}, required: [] }
        }
      });
    }
    return {
      tools: tools,
      nameMap: nameMap,
      enabledCount: tools.length
    };
  }

  // ===== 自费/自研自定义插件管理与安全能力实现 =====
  function normalizeCustomPluginRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = String(raw.id || '').trim();
    if (!id) return null;
    var name = String(raw.name || '').trim().slice(0, 60) || '自定义插件';
    var description = String(raw.description || '').trim().slice(0, 300);
    var icon = String(raw.icon || 'fa-solid fa-wand-magic-sparkles').trim();
    var version = String(raw.version || '1.0.0').trim();
    var author = String(raw.author || '用户自定义').trim();
    var defaultEnabled = raw.defaultEnabled !== false;
    var capabilityType = String(raw.capabilityType || 'template').trim();
    var templateResponse = String(raw.templateResponse || '').trim();
    var toolDef = raw.tool && typeof raw.tool === 'object' ? raw.tool : {};
    var toolName = String(toolDef.name || 'custom_action').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    var toolTitle = String(toolDef.title || name).trim();
    var toolDesc = String(toolDef.description || description).trim();
    var parameters = normalizeParameters(toolDef.parameters);
    var permissions = normalizePermissions(toolDef.permissions);

    return {
      id: id,
      name: name,
      description: description,
      icon: icon,
      version: version,
      author: author,
      defaultEnabled: defaultEnabled,
      capabilityType: capabilityType,
      templateResponse: templateResponse,
      tool: {
        name: toolName,
        title: toolTitle,
        description: toolDesc,
        parameters: parameters,
        permissions: permissions
      }
    };
  }

  async function executeCustomPluginTool(customDef, params, execContext) {
    var cap = customDef.capabilityType;
    var p = params && typeof params === 'object' ? params : {};
    if (cap === 'calculator') {
      var expr = String(p.expression || p.query || p.value || '').trim();
      return evaluateMathExpression(expr);
    } else if (cap === 'dice') {
      var parsed = parseDiceParams(p);
      var rolls = [];
      var total = 0;
      var minRoll = parsed.sides;
      var maxRoll = 1;
      for (var i = 0; i < parsed.count; i++) {
        var val = getSecureRandomInt(1, parsed.sides);
        rolls.push(val);
        total += val;
        if (val < minRoll) minRoll = val;
        if (val > maxRoll) maxRoll = val;
      }
      return {
        notation: parsed.notation,
        sides: parsed.sides,
        count: parsed.count,
        rolls: rolls,
        total: total,
        min: minRoll,
        max: maxRoll
      };
    } else if (cap === 'time') {
      var now = new Date();
      return {
        iso: now.toISOString(),
        local: now.toLocaleString(),
        utcOffset: formatUtcOffset(now),
        timestamp: now.getTime()
      };
    } else {
      var tmpl = customDef.templateResponse || '自定义插件执行成功';
      var resultText = tmpl;
      Object.keys(p).forEach(function(k) {
        var rx = new RegExp('\\{' + k + '\\}', 'g');
        resultText = resultText.replace(rx, String(p[k] !== undefined ? p[k] : ''));
      });
      return {
        pluginId: customDef.id,
        pluginName: customDef.name,
        result: resultText,
        parameters: p
      };
    }
  }

  async function listCustomPlugins() {
    var settings = await loadPluginSettings();
    return (Array.isArray(settings.customPlugins) ? settings.customPlugins : []).map(normalizeCustomPluginRecord).filter(Boolean);
  }

  async function saveCustomPlugin(input) {
    var src = input && typeof input === 'object' ? input : {};
    var id = String(src.id || '').trim() || ('custom_plugin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
    var norm = normalizeCustomPluginRecord(Object.assign({}, src, { id: id }));
    if (!norm.name) throw new Error('插件名称不能为空');
    if (!norm.tool.name) throw new Error('工具标识名不能为空');

    var settings = await loadPluginSettings();
    var list = Array.isArray(settings.customPlugins) ? settings.customPlugins : [];
    var idx = list.findIndex(function(item) { return item && item.id === id; });
    if (idx >= 0) {
      list[idx] = norm;
    } else {
      list.push(norm);
    }
    settings.customPlugins = list;
    var savedSettings = await savePluginSettings(settings);
    return { plugin: norm, settings: savedSettings };
  }

  async function deleteCustomPlugin(customPluginId) {
    var pid = String(customPluginId || '').trim();
    if (!pid) return await loadPluginSettings();
    var settings = await loadPluginSettings();
    var list = Array.isArray(settings.customPlugins) ? settings.customPlugins : [];
    settings.customPlugins = list.filter(function(item) { return item && item.id !== pid; });

    var oldPlg = _plugins[pid];
    if (oldPlg && Array.isArray(oldPlg.tools)) {
      oldPlg.tools.forEach(function(t) { delete _tools[t.fullName]; });
    }
    delete _plugins[pid];
    var pIdx = _pluginOrder.indexOf(pid);
    if (pIdx >= 0) _pluginOrder.splice(pIdx, 1);

    return await savePluginSettings(settings);
  }

  function syncCustomPluginsToRegistry(settings) {
    Object.keys(_plugins).forEach(function(pid) {
      var plg = _plugins[pid];
      if (plg && plg.category === CATEGORY_CUSTOM) {
        if (Array.isArray(plg.tools)) {
          plg.tools.forEach(function(t) { delete _tools[t.fullName]; });
        }
        delete _plugins[pid];
        var oIdx = _pluginOrder.indexOf(pid);
        if (oIdx >= 0) _pluginOrder.splice(oIdx, 1);
      }
    });

    var customList = (settings && Array.isArray(settings.customPlugins)) ? settings.customPlugins : [];
    customList.forEach(function(raw) {
      var norm = normalizeCustomPluginRecord(raw);
      if (!norm) return;
      registerPlugin({
        id: norm.id,
        name: norm.name,
        category: CATEGORY_CUSTOM,
        description: norm.description,
        version: norm.version,
        author: norm.author,
        defaultEnabled: norm.defaultEnabled !== false,
        permissions: norm.tool.permissions,
        tools: [
          {
            name: norm.tool.name,
            title: norm.tool.title,
            description: norm.tool.description,
            parameters: norm.tool.parameters,
            permissions: norm.tool.permissions,
            execute: async function(params, execContext) {
              return await executeCustomPluginTool(norm, params, execContext);
            }
          }
        ]
      });
    });
  }

  var PLUGIN_TEMPLATES = [
    {
      id: 'tpl_story_dice',
      name: '剧情骰子',
      category: 'roleplay',
      categoryLabel: '角色扮演',
      description: '用于跑团或角色扮演的骰子投掷工具，支持 D6、D20 等面数与次数投掷。',
      icon: 'fa-solid fa-dice',
      capabilityType: 'dice',
      tool: {
        name: 'story_dice_roll',
        title: '剧情骰子投掷',
        description: '投掷指定面数与次数的骰子并返回结果。',
        parameters: {
          type: 'object',
          properties: {
            sides: { type: 'integer', description: '骰子面数，如 6、20、100' },
            count: { type: 'integer', description: '投掷次数，默认 1' }
          },
          required: []
        },
        permissions: { readOnly: true, scopes: ['read_only'], requiresConfirmation: false }
      }
    },
    {
      id: 'tpl_random_event',
      name: '随机事件',
      category: 'roleplay',
      categoryLabel: '角色扮演',
      description: '结合当前聊天氛围生成不破坏主线的随机事件建议。',
      icon: 'fa-solid fa-wand-magic-sparkles',
      capabilityType: 'template',
      templateResponse: '触发随机事件建议：在当前场景中，周边环境出现了一个自然而生的小插曲（如微风拂过、远处的声响或突发的互动契机），可供角色与用户自然延伸对话。',
      tool: {
        name: 'random_plot_event',
        title: '生成随机事件',
        description: '生成贴合当前情境的随机事件建议。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '当前场景或情境提示' }
          },
          required: ['query']
        },
        permissions: { readOnly: true, scopes: ['read_only'], requiresConfirmation: false }
      }
    },
    {
      id: 'tpl_char_schedule',
      name: '角色日程',
      category: 'roleplay',
      categoryLabel: '角色扮演',
      description: '查询或生成当前时间节点的角色日常活动与安排。',
      icon: 'fa-solid fa-calendar-days',
      capabilityType: 'template',
      templateResponse: '角色当前日程安排：上午处理核心事务，中午进行短暂休息与简餐，下午与用户进行互动或外出探索。',
      tool: {
        name: 'character_schedule',
        title: '查询角色日程',
        description: '获取角色的当前日程与活动安排。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '关注的时间段或事项' }
          },
          required: []
        },
        permissions: { readOnly: true, scopes: ['read_only'], requiresConfirmation: false }
      }
    },
    {
      id: 'tpl_time_query',
      name: '时间查询',
      category: 'utility',
      categoryLabel: '实用工具',
      description: '安全读取当前系统时间、日期、星期与用户时区。',
      icon: 'fa-solid fa-clock',
      capabilityType: 'time',
      tool: {
        name: 'current_time_query',
        title: '查询当前时间',
        description: '获取当前时间、日期与时区信息。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '可选参数' }
          },
          required: []
        },
        permissions: { readOnly: true, scopes: ['read_only'], requiresConfirmation: false }
      }
    },
    {
      id: 'tpl_calculator',
      name: '计算器',
      category: 'utility',
      categoryLabel: '实用工具',
      description: '安全计算加减乘除、括号与小数的数学表达式，绝不使用 eval。',
      icon: 'fa-solid fa-calculator',
      capabilityType: 'calculator',
      tool: {
        name: 'safe_calculator',
        title: '数学计算器',
        description: '计算数学表达式（支持加减乘除与括号）。',
        parameters: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: '数学表达式，如 (15 + 25) * 2' }
          },
          required: ['expression']
        },
        permissions: { readOnly: true, scopes: ['read_only'], requiresConfirmation: false }
      }
    },
    {
      id: 'tpl_random_choice',
      name: '随机选择',
      category: 'life',
      categoryLabel: '生活娱乐',
      description: '从备选方案或选项中通过安全随机机制抽选决策建议。',
      icon: 'fa-solid fa-shuffle',
      capabilityType: 'template',
      templateResponse: '随机选择结果：经过安全随机抽签，当前建议优先采纳方案 A 或按直觉推进。',
      tool: {
        name: 'random_choice_picker',
        title: '随机决策选择',
        description: '根据输入的内容进行随机抽签选择。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '待选择的选项或问题描述' }
          },
          required: ['query']
        },
        permissions: { readOnly: true, scopes: ['read_only'], requiresConfirmation: false }
      }
    },
    {
      id: 'tpl_healing_quotes',
      name: '治愈语录',
      category: 'life',
      categoryLabel: '生活娱乐',
      description: '获取一句温暖治愈的文字陪伴与正向鼓励语录。',
      icon: 'fa-solid fa-heart',
      capabilityType: 'template',
      templateResponse: '治愈陪伴语录：“星光不问赶路人，岁月不负有心人。愿你历经千帆，归来仍有热烈而温柔的初心。”',
      tool: {
        name: 'healing_quote',
        title: '获取治愈语录',
        description: '输出一句治愈心灵的正能量语录。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '心情或期望的主题' }
          },
          required: []
        },
        permissions: { readOnly: true, scopes: ['read_only'], requiresConfirmation: false }
      }
    }
  ];

  function listPluginTemplates() {
    return clone(PLUGIN_TEMPLATES);
  }

  global.AiWorkspacePlugins = {
    CATEGORY_BUILTIN: CATEGORY_BUILTIN,
    CATEGORY_MCP: CATEGORY_MCP,
    CATEGORY_CUSTOM: CATEGORY_CUSTOM,
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
    updatePluginConfig: updatePluginConfig,
    toApiToolName: toApiToolName,
    resolveToolFullName: resolveToolFullName,
    getEnabledOpenAiTools: getEnabledOpenAiTools,
    validateMcpEndpointUrl: validateMcpEndpointUrl,
    listMcpServers: listMcpServers,
    saveMcpServer: saveMcpServer,
    deleteMcpServer: deleteMcpServer,
    testAndSyncMcpServer: testAndSyncMcpServer,
    setMcpToolEnabled: setMcpToolEnabled,
    listCustomPlugins: listCustomPlugins,
    saveCustomPlugin: saveCustomPlugin,
    deleteCustomPlugin: deleteCustomPlugin,
    listPluginTemplates: listPluginTemplates
  };

  if (typeof Promise === 'function') {
    loadPluginSettings().catch(function() {});
  }
})(typeof window !== 'undefined' ? window : globalThis);