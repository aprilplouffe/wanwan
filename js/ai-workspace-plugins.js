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
      if (t.permissions && t.permissions.requiresConfirmation) continue;
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
    updatePluginConfig: updatePluginConfig,
    toApiToolName: toApiToolName,
    resolveToolFullName: resolveToolFullName,
    getEnabledOpenAiTools: getEnabledOpenAiTools
  };
})(typeof window !== 'undefined' ? window : globalThis);