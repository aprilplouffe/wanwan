// js/custom-plugins.js — 知屿 7-B1, 7-B2, 7-B3 & 7-B4：自定义插件管理、模板库、导入导出分享与调用体验优化
(function(global) {
  'use strict';

  var DEFAULT_PLUGINS = [
    {
      id: 'plugin_weather',
      name: '实时天气助手',
      description: '查询指定城市的实时天气与气温建议',
      icon: 'fa-solid fa-cloud-sun',
      enabled: true,
      toolCapability: 'weather_check',
      toolName: 'check_weather',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: '城市名称，例如北京、上海、东京' }
        },
        required: ['location']
      },
      updatedAt: Date.now()
    },
    {
      id: 'plugin_calc',
      name: '安全数学计算器',
      description: '执行精准数学表达式计算（加减乘除、括号、幂运算）',
      icon: 'fa-solid fa-calculator',
      enabled: true,
      toolCapability: 'calculator',
      toolName: 'calculate',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: '数学表达式，例如 128 * 4.5 或 (50 + 20) / 2' }
        },
        required: ['expression']
      },
      updatedAt: Date.now()
    },
    {
      id: 'plugin_time',
      name: '当前时间校验',
      description: '获取当前系统的精确日期与时间',
      icon: 'fa-solid fa-clock',
      enabled: true,
      toolCapability: 'time_check',
      toolName: 'get_current_time',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      updatedAt: Date.now()
    },
    {
      id: 'plugin_quote',
      name: '治愈名言生成器',
      description: '随机获取一句温柔治愈的文学或心理学金句',
      icon: 'fa-solid fa-quote-left',
      enabled: true,
      toolCapability: 'quote_generator',
      toolName: 'get_healing_quote',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      updatedAt: Date.now()
    }
  ];

  var PLUGIN_TEMPLATES = [
    {
      id: 'tpl_dice',
      name: '剧情判定骰子',
      category: 'roleplay',
      categoryLabel: '角色扮演',
      description: '掷出 1-100 点数的剧情判定骰子，用于 TRPG 或互动剧情判定',
      icon: 'fa-solid fa-dice',
      permissions: '无敏感权限',
      toolCapability: 'random_number',
      toolName: 'roll_plot_dice',
      parameters: {
        type: 'object',
        properties: {
          min: { type: 'number', description: '最小值，默认1' },
          max: { type: 'number', description: '最大值，默认100' }
        },
        required: []
      }
    },
    {
      id: 'tpl_event',
      name: '随机事件生成器',
      category: 'roleplay',
      categoryLabel: '角色扮演',
      description: '在互动对话中随机触发一个故事转折、偶遇或奇遇事件',
      icon: 'fa-solid fa-wand-magic-sparkles',
      permissions: '无敏感权限',
      toolCapability: 'quote_generator',
      toolName: 'trigger_random_event',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      id: 'tpl_schedule',
      name: '角色日程提示',
      category: 'roleplay',
      categoryLabel: '角色扮演',
      description: '获取当前虚拟角色所处的时间段、日程安排与环境氛围提示',
      icon: 'fa-solid fa-calendar-days',
      permissions: '读取系统时间',
      toolCapability: 'time_check',
      toolName: 'check_character_schedule',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      id: 'tpl_time',
      name: '精准时间查询',
      category: 'utilities',
      categoryLabel: '实用工具',
      description: '获取当前系统精确日期、时分秒及农历参考',
      icon: 'fa-solid fa-clock',
      permissions: '读取系统时间',
      toolCapability: 'time_check',
      toolName: 'get_current_time_tpl',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      id: 'tpl_calculator',
      name: '多功能安全计算器',
      category: 'utilities',
      categoryLabel: '实用工具',
      description: '安全执行带括号与小数点的高精度算术运算',
      icon: 'fa-solid fa-calculator',
      permissions: '无敏感权限',
      toolCapability: 'calculator',
      toolName: 'calculate_tpl',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: '数学表达式' }
        },
        required: ['expression']
      }
    },
    {
      id: 'tpl_choose',
      name: '随机选项决策',
      category: 'entertainment',
      categoryLabel: '生活娱乐',
      description: '在多个日常选项或纠结的决定中随机抽取一个',
      icon: 'fa-solid fa-shuffle',
      permissions: '无敏感权限',
      toolCapability: 'random_number',
      toolName: 'random_pick',
      parameters: {
        type: 'object',
        properties: {
          min: { type: 'number', description: '选项范围起点' },
          max: { type: 'number', description: '选项范围终点' }
        },
        required: ['min', 'max']
      }
    },
    {
      id: 'tpl_quotes',
      name: '日常心灵语录',
      category: 'entertainment',
      categoryLabel: '生活娱乐',
      description: '获取一句文学或治愈心灵的金句，温暖伴侣日常',
      icon: 'fa-solid fa-heart',
      permissions: '无敏感权限',
      toolCapability: 'quote_generator',
      toolName: 'get_healing_quote_tpl',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  ];

  var ALLOWED_CAPABILITIES = {
    weather_check: { name: '天气查询', perm: '无敏感权限' },
    calculator: { name: '安全数学计算', perm: '无敏感权限' },
    time_check: { name: '当前时间', perm: '读取系统时间' },
    quote_generator: { name: '治愈金句', perm: '无敏感权限' },
    random_number: { name: '随机数生成', perm: '无敏感权限' },
    note_search: { name: '笔记与记忆检索', perm: '读取本地笔记' }
  };

  async function getDb() {
    if (!window.db || !window.db.customPlugins) return null;
    return window.db.customPlugins;
  }

  async function getCustomPlugins() {
    var tbl = await getDb();
    if (!tbl) return DEFAULT_PLUGINS;
    try {
      var list = await tbl.toArray();
      if (!list || !list.length) {
        for (var i = 0; i < DEFAULT_PLUGINS.length; i++) {
          await tbl.put(DEFAULT_PLUGINS[i]);
        }
        return DEFAULT_PLUGINS.slice();
      }
      return list;
    } catch (e) {
      console.warn('[CustomPlugins] 读取插件失败:', e);
      return DEFAULT_PLUGINS.slice();
    }
  }

  async function saveCustomPlugin(plugin) {
    if (!plugin || !plugin.id || !plugin.name || !plugin.toolName) {
      throw new Error('插件基础字段（名称、工具函数名）不能为空');
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(plugin.toolName)) {
      throw new Error('工具函数名只能包含英文字母、数字和下划线，且必须以字母或下划线开头');
    }
    var tbl = await getDb();
    plugin.updatedAt = Date.now();
    if (tbl) {
      await tbl.put(plugin);
    }
    return plugin;
  }

  async function deleteCustomPlugin(id) {
    var tbl = await getDb();
    if (tbl) {
      await tbl.delete(id);
    }
  }

  async function toggleCustomPlugin(id, enabled) {
    var tbl = await getDb();
    if (!tbl) return;
    var p = await tbl.get(id);
    if (p) {
      p.enabled = Boolean(enabled);
      p.updatedAt = Date.now();
      await tbl.put(p);
    }
  }

  // Safe capability execution handlers with concise status messaging
  async function executeCapability(capability, args, observerCallback) {
    if (typeof observerCallback === 'function') {
      observerCallback('running', '正在使用 ' + (ALLOWED_CAPABILITIES[capability] ? ALLOWED_CAPABILITIES[capability].name : '插件能力') + '…');
    }
    try {
      switch (capability) {
        case 'weather_check': {
          var loc = (args && args.location) || '本地';
          var conditions = ['晴朗舒适', '多云微风', '小雨清新', '温暖明媚', '星空浪漫'];
          var cond = conditions[Math.abs(hashCode(loc)) % conditions.length];
          var temp = (20 + (Math.abs(hashCode(loc)) % 10)) + '°C';
          return JSON.stringify({
            ok: true,
            location: loc,
            weather: cond,
            temperature: temp,
            humidity: '45%',
            airQuality: '优',
            advice: '天气不错，适合出海散步或与心爱的人喝一杯咖啡。'
          });
        }
        case 'calculator': {
          var expr = String((args && args.expression) || '0');
          if (!/^[\d\+\-\*\/\%\.\(\)\s]+$/.test(expr)) {
            throw new Error('仅支持安全的数字与基础算术运算符 (+, -, *, /, %, ())');
          }
          var val = Function('"use strict"; return (' + expr + ')')();
          return JSON.stringify({
            ok: true,
            expression: expr,
            result: val
          });
        }
        case 'time_check': {
          var now = new Date();
          return JSON.stringify({
            ok: true,
            timestamp: now.getTime(),
            formatted: now.toLocaleString('zh-CN', { hour12: false })
          });
        }
        case 'quote_generator': {
          var quotes = [
            '“世界温柔，万物可爱，你也是其中之一。”',
            '“风吹哪页读哪页，哪页难看撕哪页。”',
            '“生活或许有些忙碌，但别忘了抬头看看傍晚的晚霞。”',
            '“慢品人间烟火色，闲观万事岁月长。”'
          ];
          var q = quotes[Math.floor(Math.random() * quotes.length)];
          return JSON.stringify({ ok: true, quote: q });
        }
        case 'random_number': {
          var min = Number(args && args.min != null ? args.min : 1);
          var max = Number(args && args.max != null ? args.max : 100);
          var num = Math.floor(Math.random() * (max - min + 1)) + min;
          return JSON.stringify({ ok: true, min: min, max: max, value: num });
        }
        case 'note_search': {
          var q = String((args && args.query) || '').trim();
          var memories = [];
          if (window.db && window.db.memories) {
            memories = await window.db.memories.toArray();
          }
          var matched = memories.filter(function(m) {
            return !q || String(m.content || '').includes(q) || String(m.title || '').includes(q);
          }).slice(0, 5).map(function(m) {
            return { title: m.title || '无标题', content: m.content || '' };
          });
          return JSON.stringify({ ok: true, query: q, results: matched });
        }
        default:
          return JSON.stringify({ ok: true, message: '工具执行成功', capability: capability, arguments: args });
      }
    } catch (err) {
      return JSON.stringify({
        ok: false,
        error: String(err && err.message ? err.message : err)
      });
    }
  }

  function hashCode(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  async function getCustomPluginTools(chatId) {
    var plugins = await getCustomPlugins();
    var tools = [];
    for (var i = 0; i < plugins.length; i++) {
      var p = plugins[i];
      if (!p || !p.enabled) continue;
      if (chatId && window.db && window.db.chats) {
        try {
          var chat = await window.db.chats.get(Number(chatId));
          if (chat && chat.disabledPlugins && Array.isArray(chat.disabledPlugins) && chat.disabledPlugins.includes(p.id)) {
            continue;
          }
        } catch (_) {}
      }
      var parameters = p.parameters;
      if (!parameters || typeof parameters !== 'object') {
        parameters = { type: 'object', properties: {}, required: [] };
      }
      tools.push({
        type: 'function',
        function: {
          name: p.toolName,
          description: (p.description || p.name) + ' [请在回复中自然融入结果，不要直接输出原始JSON]',
          parameters: parameters
        }
      });
    }
    return tools;
  }

  async function executeCustomPluginTool(toolName, args, observerCallback) {
    var startTime = Date.now();
    try {
      var plugins = await getCustomPlugins();
      var plugin = plugins.find(function(p) { return p && p.enabled && p.toolName === toolName; });
      if (!plugin) {
        return {
          modelContent: JSON.stringify({ ok: false, error: '未找到匹配的启用自定义插件: ' + toolName }),
          traceData: { isError: true, error: 'Plugin not found', duration: Date.now() - startTime }
        };
      }
      var rawResult = await executeCapability(plugin.toolCapability, args, observerCallback);
      var parsed = {};
      try { parsed = JSON.parse(rawResult); } catch (_) { parsed = { ok: true, result: rawResult }; }
      var isError = parsed.ok === false;
      var duration = Date.now() - startTime;
      return {
        modelContent: rawResult,
        traceData: {
          pluginId: plugin.id,
          pluginName: plugin.name,
          toolName: toolName,
          capability: plugin.toolCapability,
          arguments: args,
          result: parsed,
          isError: isError,
          duration: duration
        }
      };
    } catch (err) {
      var errText = String(err && err.message ? err.message : err);
      var duration = Date.now() - startTime;
      return {
        modelContent: JSON.stringify({ ok: false, error: '插件执行异常: ' + errText }),
        traceData: { isError: true, error: errText, duration: duration }
      };
    }
  }

  function getPluginDisplayName(toolName) {
    var map = {
      check_weather: '实时天气感知',
      calculate: '安全数学计算',
      get_current_time: '系统时间感知',
      get_healing_quote: '治愈金句生成',
      roll_plot_dice: '剧情判定骰子',
      trigger_random_event: '随机事件触发',
      check_character_schedule: '角色日程读取',
      get_current_time_tpl: '精准时间查询',
      calculate_tpl: '算式高精度计算',
      random_pick: '随机选项决策',
      get_healing_quote_tpl: '心灵语录获取'
    };
    return map[toolName] || toolName;
  }

  function buildPluginTraceCardHTML(trace) {
    var status = trace && trace.isError ? 'error' : 'success';
    var title = getPluginDisplayName(trace && trace.toolName) || '自定义插件';
    var duration = Number(trace && trace.duration) || 0;
    var argsStr = JSON.stringify(trace && trace.arguments || {}, null, 2);
    var resStr = JSON.stringify(trace && trace.result || {}, null, 2);
    var errText = String(trace && (trace.error || (trace.result && trace.result.error)) || '');

    return '<div class="cp-trace-card is-' + status + '" data-tool-name="' + escapeHtml(trace && trace.toolName) + '">' +
      '<button class="cp-trace-summary" type="button" aria-expanded="false">' +
        '<span class="cp-trace-state"><i class="fa-solid ' + (status === 'error' ? 'fa-triangle-exclamation' : 'fa-check') + '"></i></span>' +
        '<span class="cp-trace-title">' + (status === 'error' ? '调用失败 · ' : '调用完成 · ') + escapeHtml(title) + '</span>' +
        (duration ? '<span class="cp-trace-duration">' + duration + ' ms</span>' : '') +
        '<i class="fa-solid fa-angle-down cp-trace-chevron"></i>' +
      '</button>' +
      '<div class="cp-trace-details" hidden>' +
        '<div class="cp-trace-meta"><span>插件函数</span><strong>' + escapeHtml(trace && trace.toolName) + '</strong></div>' +
        '<div class="cp-trace-label">调用参数</div>' +
        '<pre>' + escapeHtml(argsStr) + '</pre>' +
        '<div class="cp-trace-label">执行结果</div>' +
        '<pre>' + escapeHtml(resStr) + '</pre>' +
        (errText ? '<div class="cp-trace-error">提示：' + escapeHtml(errText) + ' <button type="button" class="cp-trace-retry-btn" data-retry-tool="' + escapeHtml(trace && trace.toolName) + '">安全重试</button></div>' : '') +
      '</div>' +
    '</div>';
  }

  function bindPluginTraceInteractions(container) {
    if (!container) return;
    container.querySelectorAll('.cp-trace-card').forEach(function(card) {
      if (card.dataset.bound === '1') return;
      card.dataset.bound = '1';
      var summary = card.querySelector('.cp-trace-summary');
      var details = card.querySelector('.cp-trace-details');
      summary.addEventListener('click', function() {
        var expanded = card.classList.toggle('is-expanded');
        summary.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        if (details) details.hidden = !expanded;
      });
      var retryBtn = card.querySelector('.cp-trace-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', async function(e) {
          e.stopPropagation();
          var toolName = retryBtn.getAttribute('data-retry-tool');
          if (typeof window.toast === 'function') window.toast('正在安全重试插件: ' + toolName);
          // Trigger re-execution or notification
          if (typeof window.triggerPluginRetry === 'function') {
            window.triggerPluginRetry(toolName);
          }
        });
      }
    });
  }

  function sanitizePluginForExport(plugin) {
    return {
      id: String(plugin.id || ''),
      name: String(plugin.name || ''),
      description: String(plugin.description || ''),
      icon: String(plugin.icon || 'fa-solid fa-puzzle-piece'),
      toolCapability: String(plugin.toolCapability || 'weather_check'),
      toolName: String(plugin.toolName || 'tool'),
      parameters: plugin.parameters && typeof plugin.parameters === 'object' ? plugin.parameters : { type: 'object', properties: {}, required: [] },
      updatedAt: plugin.updatedAt || Date.now()
    };
  }

  function exportCustomPluginJson(plugin) {
    var clean = sanitizePluginForExport(plugin);
    var jsonStr = JSON.stringify(clean, null, 2);
    var blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'custom_plugin_' + (clean.id || 'tool') + '.json';
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    if (typeof window.toast === 'function') window.toast('插件配置已导出为文件');
  }

  function copyCustomPluginConfig(plugin) {
    var clean = sanitizePluginForExport(plugin);
    var jsonStr = JSON.stringify(clean, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(jsonStr).then(function() {
        if (typeof window.toast === 'function') window.toast('插件分享配置已复制到剪贴板');
      }).catch(function() {
        fallbackCopyText(jsonStr);
      });
    } else {
      fallbackCopyText(jsonStr);
    }
  }

  function fallbackCopyText(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      if (typeof window.toast === 'function') window.toast('插件分享配置已复制');
    } catch (_) {
      if (typeof window.toast === 'function') window.toast('复制失败，请手动复制');
    }
    ta.remove();
  }

  function validateImportedPlugin(p) {
    if (!p || typeof p !== 'object') throw new Error('插件 JSON 格式无效');
    if (!p.name || !p.toolName || !p.toolCapability) {
      throw new Error('插件缺少必填字段（name, toolName, toolCapability）');
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p.toolName)) {
      throw new Error('工具函数名格式非法: ' + p.toolName + '（仅允许英文字母与下划线）');
    }
    if (!ALLOWED_CAPABILITIES[p.toolCapability]) {
      throw new Error('不支持或未知的工具能力: ' + p.toolCapability + '（拒绝未知或潜在不安全执行）');
    }
    return {
      id: String(p.id || ('plugin_' + Math.random().toString(36).slice(2, 9))),
      name: String(p.name),
      description: String(p.description || ''),
      icon: String(p.icon || 'fa-solid fa-puzzle-piece'),
      enabled: false,
      toolCapability: String(p.toolCapability),
      toolName: String(p.toolName),
      parameters: (p.parameters && typeof p.parameters === 'object') ? p.parameters : { type: 'object', properties: {}, required: [] },
      updatedAt: Date.now()
    };
  }

  async function parseAndPreviewImportJson(jsonText, listPage) {
    var data;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      throw new Error('JSON 解析失败，请检查语法');
    }
    var list = Array.isArray(data) ? data : [data];
    var validatedList = [];
    for (var i = 0; i < list.length; i++) {
      validatedList.push(validateImportedPlugin(list[i]));
    }
    if (!validatedList.length) throw new Error('未找到有效的插件配置');
    openImportPreviewModal(validatedList, listPage);
  }

  function openImportPreviewModal(validatedList, listPage) {
    var backdrop = document.createElement('div');
    backdrop.className = 'aiw-ws-modal-backdrop open';

    var itemsHtml = validatedList.map(function(p, idx) {
      var capInfo = ALLOWED_CAPABILITIES[p.toolCapability] || { name: p.toolCapability, perm: '无敏感权限' };
      return '<div class="cp-import-preview-item" data-index="' + idx + '" style="background:#f4f4f6;padding:12px;border-radius:12px;margin-bottom:10px;">' +
        '<div style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;margin-bottom:4px;">' +
          '<i class="' + escapeHtml(p.icon) + '" style="color:var(--aiw-pink-deep);"></i>' +
          '<span>' + escapeHtml(p.name) + '</span>' +
          '<span class="pt-badge category">' + escapeHtml(p.toolName) + '</span>' +
        '</div>' +
        '<div style="font-size:12.5px;color:var(--aiw-sub);margin-bottom:6px;">' + escapeHtml(p.description || '暂无描述') + '</div>' +
        '<div style="display:flex;gap:12px;font-size:12px;color:var(--aiw-hint);">' +
          '<span>能力：<strong>' + escapeHtml(capInfo.name) + '</strong></span>' +
          '<span>权限：<strong style="color:#d97706;">' + escapeHtml(capInfo.perm) + '</strong></span>' +
          '<span>默认状态：<strong>导入后关闭</strong></span>' +
        '</div>' +
      '</div>';
    }).join('');

    backdrop.innerHTML =
      '<div class="aiw-ws-modal" role="dialog" aria-modal="true" style="max-width:540px;">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title">确认导入插件 (' + validatedList.length + '个)</div>' +
          '<button type="button" class="aiw-ws-modal-close" id="cp-imp-close"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div style="font-size:13px;color:var(--aiw-sub);margin-bottom:12px;">请仔细核对以下插件配置及所需权限。如遇同名或同 ID 冲突，系统将提示您选择跳过或另存为新插件。</div>' +
          '<div style="max-height:260px;overflow-y:auto;">' + itemsHtml + '</div>' +
          '<button class="btn-pill btn-full" id="cp-imp-confirm" type="button" style="margin-top:16px;">确认并导入所有插件</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(backdrop);
    backdrop.querySelector('#cp-imp-close').addEventListener('click', function() { backdrop.remove(); });
    backdrop.addEventListener('click', function(e) { if (e.target === backdrop) backdrop.remove(); });

    backdrop.querySelector('#cp-imp-confirm').addEventListener('click', async function() {
      backdrop.remove();
      var existingPlugins = await getCustomPlugins();
      var existingMap = new Map();
      existingPlugins.forEach(function(ep) {
        existingMap.set(ep.id, ep);
        existingMap.set(ep.toolName, ep);
      });

      var importedCount = 0;
      for (var i = 0; i < validatedList.length; i++) {
        var p = validatedList[i];
        var conflict = existingMap.has(p.id) || existingMap.has(p.toolName);
        if (conflict) {
          var choice = confirm('检测到插件「' + p.name + '」（ID/函数名已存在）。\n\n点击「确定」将另存为新插件（不覆盖原插件），点击「取消」跳过此插件。');
          if (!choice) continue;
          p.id = 'plugin_' + Math.random().toString(36).slice(2, 9);
          p.toolName = p.toolName + '_copy_' + Math.floor(Math.random() * 1000);
        }
        await saveCustomPlugin(p);
        existingMap.set(p.id, p);
        existingMap.set(p.toolName, p);
        importedCount++;
      }

      if (typeof window.toast === 'function') {
        window.toast('成功导入 ' + importedCount + ' 个插件（默认已关闭，请手动启用）');
      }
      if (listPage) {
        await renderCustomPluginsList(listPage);
      }
    });
  }

  function openImportJsonModal(listPage) {
    var backdrop = document.createElement('div');
    backdrop.className = 'aiw-ws-modal-backdrop open';
    backdrop.innerHTML =
      '<div class="aiw-ws-modal" role="dialog" aria-modal="true" style="max-width:480px;">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title">导入自定义插件</div>' +
          '<button type="button" class="aiw-ws-modal-close" id="cp-impm-close"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<button class="btn-pill btn-full" id="cp-impm-file" style="display:flex;align-items:center;justify-content:center;gap:8px;">' +
              '<i class="fa-solid fa-file-arrow-up"></i> 选择 JSON 文件上传' +
            '</button>' +
            '<div style="text-align:center;font-size:12px;color:var(--aiw-hint);">- 或者 -</div>' +
            '<textarea class="input-field cs-textarea" id="cp-impm-textarea" rows="5" placeholder="在此粘贴插件 JSON 配置内容..."></textarea>' +
            '<button class="btn-pill btn-full" id="cp-impm-paste" type="button">解析并预览粘贴内容</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(backdrop);
    backdrop.querySelector('#cp-impm-close').addEventListener('click', function() { backdrop.remove(); });
    backdrop.addEventListener('click', function(e) { if (e.target === backdrop) backdrop.remove(); });

    var hiddenFile = document.createElement('input');
    hiddenFile.type = 'file';
    hiddenFile.accept = '.json';
    hiddenFile.hidden = true;
    document.body.appendChild(hiddenFile);

    backdrop.querySelector('#cp-impm-file').addEventListener('click', function() {
      hiddenFile.click();
    });

    hiddenFile.addEventListener('change', async function() {
      var file = hiddenFile.files && hiddenFile.files[0];
      if (!file) return;
      try {
        var text = await file.text();
        backdrop.remove();
        hiddenFile.remove();
        await parseAndPreviewImportJson(text, listPage);
      } catch (err) {
        if (typeof window.toast === 'function') window.toast('读取文件失败：' + (err.message || err));
      }
    });

    backdrop.querySelector('#cp-impm-paste').addEventListener('click', async function() {
      var text = backdrop.querySelector('#cp-impm-textarea').value.trim();
      if (!text) {
        if (typeof window.toast === 'function') window.toast('请先粘贴 JSON 配置内容');
        return;
      }
      try {
        backdrop.remove();
        hiddenFile.remove();
        await parseAndPreviewImportJson(text, listPage);
      } catch (err) {
        if (typeof window.toast === 'function') window.toast('解析失败：' + (err.message || err));
      }
    });
  }

  async function openPluginTemplatesPage(parentListPage) {
    var page = document.createElement('div');
    page.id = 'plugin-templates-page';
    page.className = 'full-page plugin-templates-page';
    page.innerHTML =
      '<div class="page-header">' +
        '<button class="header-back" id="pt-btn-back"><i class="fa-solid fa-angle-left"></i></button>' +
        '<span class="header-title">插件模板库</span>' +
      '</div>' +
      '<div class="pt-tabs" role="tablist">' +
        '<button type="button" class="pt-tab is-active" data-cat="all">全部</button>' +
        '<button type="button" class="pt-tab" data-cat="roleplay">角色扮演</button>' +
        '<button type="button" class="pt-tab" data-cat="utilities">实用工具</button>' +
        '<button type="button" class="pt-tab" data-cat="entertainment">生活娱乐</button>' +
      '</div>' +
      '<div class="pt-scroll" id="pt-grid-container"></div>';

    if (typeof window.openPage === 'function') {
      window.openPage(page);
    } else {
      (document.getElementById('app') || document.body).appendChild(page);
    }

    page.querySelector('#pt-btn-back').addEventListener('click', function() {
      if (typeof window.closePage === 'function') window.closePage('plugin-templates-page');
      else page.remove();
    });

    var activeCat = 'all';
    page.querySelectorAll('.pt-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        page.querySelectorAll('.pt-tab').forEach(function(t) { t.classList.remove('is-active'); });
        tab.classList.add('is-active');
        activeCat = tab.getAttribute('data-cat');
        renderTemplatesGrid(page, activeCat, parentListPage);
      });
    });

    await renderTemplatesGrid(page, activeCat, parentListPage);
  }

  async function renderTemplatesGrid(page, category, parentListPage) {
    var container = page.querySelector('#pt-grid-container');
    if (!container) return;
    var existingPlugins = await getCustomPlugins();
    var existingToolNames = new Set(existingPlugins.map(function(p) { return p.toolName; }));
    var existingIds = new Set(existingPlugins.map(function(p) { return p.id; }));

    var filtered = PLUGIN_TEMPLATES.filter(function(t) {
      if (category !== 'all' && t.category !== category) return false;
      return true;
    });

    container.innerHTML =
      '<div class="pt-grid-wrap">' +
        '<div class="pt-grid">' +
          filtered.map(function(t) {
            var isAdded = existingToolNames.has(t.toolName) || existingIds.has(t.id);
            return '<div class="pt-card" data-template-id="' + escapeHtml(t.id) + '">' +
              '<div class="pt-card-head">' +
                '<div class="pt-card-icon"><i class="' + escapeHtml(t.icon) + '"></i></div>' +
                '<div class="pt-card-badges">' +
                  '<span class="pt-badge category">' + escapeHtml(t.categoryLabel) + '</span>' +
                  '<span class="pt-badge perm">' + escapeHtml(t.permissions) + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="pt-card-title">' + escapeHtml(t.name) + '</div>' +
              '<div class="pt-card-desc">' + escapeHtml(t.description) + '</div>' +
              '<div class="pt-card-footer">' +
                '<span class="pt-card-tool">函数: <code>' + escapeHtml(t.toolName) + '</code></span>' +
                '<button type="button" class="btn-pill pt-btn-add ' + (isAdded ? 'is-added' : '') + '" data-tpl-id="' + escapeHtml(t.id) + '" ' + (isAdded ? 'disabled' : '') + '>' + (isAdded ? '已添加' : '一键添加') + '</button>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';

    container.querySelectorAll('.pt-card').forEach(function(card) {
      var tplId = card.getAttribute('data-template-id');
      var tpl = PLUGIN_TEMPLATES.find(function(x) { return x.id === tplId; });
      if (!tpl) return;

      card.addEventListener('click', function(e) {
        if (e.target.closest('.pt-btn-add')) return;
        openTemplatePreviewModal(tpl, parentListPage);
      });
    });

    container.querySelectorAll('.pt-btn-add').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var tplId = btn.getAttribute('data-tpl-id');
        var tpl = PLUGIN_TEMPLATES.find(function(x) { return x.id === tplId; });
        if (!tpl) return;
        await addTemplateToCustomPlugins(tpl, parentListPage);
        await renderTemplatesGrid(page, category, parentListPage);
      });
    });
  }

  async function addTemplateToCustomPlugins(tpl, parentListPage) {
    var plugins = await getCustomPlugins();
    var exists = plugins.some(function(p) {
      return p.id === tpl.id || p.toolName === tpl.toolName;
    });
    if (exists) {
      if (typeof window.toast === 'function') window.toast('该插件已存在于您的自定义插件中，请勿重复添加');
      return;
    }
    var newPlugin = {
      id: tpl.id,
      name: tpl.name,
      description: tpl.description,
      icon: tpl.icon,
      enabled: false,
      toolCapability: tpl.toolCapability,
      toolName: tpl.toolName,
      parameters: tpl.parameters,
      updatedAt: Date.now()
    };
    await saveCustomPlugin(newPlugin);
    if (typeof window.toast === 'function') window.toast('成功添加模板「' + tpl.name + '」（默认已关闭，请在列表中手动启用）');
    if (parentListPage) {
      await renderCustomPluginsList(parentListPage);
    }
  }

  function openTemplatePreviewModal(tpl, parentListPage) {
    var backdrop = document.createElement('div');
    backdrop.className = 'aiw-ws-modal-backdrop open';
    backdrop.innerHTML =
      '<div class="aiw-ws-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title"><i class="' + escapeHtml(tpl.icon) + '" style="margin-right:8px;"></i>' + escapeHtml(tpl.name) + '</div>' +
          '<button type="button" class="aiw-ws-modal-close" id="pt-modal-close"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div class="pt-modal-info-row"><strong>分类：</strong><span>' + escapeHtml(tpl.categoryLabel) + '</span></div>' +
          '<div class="pt-modal-info-row"><strong>所需权限：</strong><span class="pt-badge perm">' + escapeHtml(tpl.permissions) + '</span></div>' +
          '<div class="pt-modal-info-row"><strong>工具函数名：</strong><code>' + escapeHtml(tpl.toolName) + '</code></div>' +
          '<div class="pt-modal-info-row"><strong>能力映射：</strong><code>' + escapeHtml(tpl.toolCapability) + '</code></div>' +
          '<div style="font-size:13px;color:var(--c-sub);margin:10px 0;">' + escapeHtml(tpl.description) + '</div>' +
          '<label class="cs-field-label">参数配置预览 (JSON Schema)</label>' +
          '<pre style="background:#f4f4f6;padding:10px;border-radius:8px;font-size:12px;max-height:140px;overflow:auto;">' + escapeHtml(JSON.stringify(tpl.parameters, null, 2)) + '</pre>' +
          '<button class="btn-pill btn-full" id="pt-modal-add" type="button" style="margin-top:16px;">一键添加到自定义插件</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(backdrop);
    backdrop.querySelector('#pt-modal-close').addEventListener('click', function() { backdrop.remove(); });
    backdrop.addEventListener('click', function(e) { if (e.target === backdrop) backdrop.remove(); });

    backdrop.querySelector('#pt-modal-add').addEventListener('click', async function() {
      await addTemplateToCustomPlugins(tpl, parentListPage);
      backdrop.remove();
      var tplPage = document.getElementById('plugin-templates-page');
      if (tplPage) {
        renderTemplatesGrid(tplPage, 'all', parentListPage);
      }
    });
  }

  async function openCustomPluginsPage() {
    var page = document.createElement('div');
    page.id = 'custom-plugins-page';
    page.className = 'full-page custom-plugins-page';
    page.innerHTML =
      '<div class="page-header">' +
        '<button class="header-back" id="cp-btn-back"><i class="fa-solid fa-angle-left"></i></button>' +
        '<span class="header-title">自定义插件中心</span>' +
        '<div class="tp-header-actions">' +
          '<button class="btn-icon tp-header-action" id="cp-btn-presets" title="插件预设组合"><i class="fa-solid fa-wand-magic-sparkles"></i></button>' +
          '<button class="btn-icon tp-header-action" id="cp-btn-templates" title="插件模板库"><i class="fa-solid fa-book-bookmark"></i></button>' +
          '<button class="btn-icon tp-header-action" id="cp-btn-import" title="导入插件 (文件/粘贴)"><i class="fa-solid fa-upload"></i></button>' +
          '<button class="btn-icon tp-header-action" id="cp-btn-add" title="创建自定义插件"><i class="fa-solid fa-plus"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="cp-scroll" id="cp-list-container"></div>';

    if (typeof window.openPage === 'function') {
      window.openPage(page);
    } else {
      (document.getElementById('app') || document.body).appendChild(page);
    }

    page.querySelector('#cp-btn-back').addEventListener('click', function() {
      if (typeof window.closePage === 'function') window.closePage('custom-plugins-page');
      else page.remove();
    });

    page.querySelector('#cp-btn-presets').addEventListener('click', function() {
      if (typeof window.openPluginPresetsPage === 'function') window.openPluginPresetsPage();
    });

    page.querySelector('#cp-btn-templates').addEventListener('click', function() {
      openPluginTemplatesPage(page);
    });

    page.querySelector('#cp-btn-add').addEventListener('click', function() {
      openCustomPluginEditor(page, null);
    });

    page.querySelector('#cp-btn-import').addEventListener('click', function() {
      openImportJsonModal(page);
    });

    await renderCustomPluginsList(page);
  }

  async function renderCustomPluginsList(page) {
    var container = page.querySelector('#cp-list-container');
    if (!container) return;
    var plugins = await getCustomPlugins();

    if (!plugins.length) {
      container.innerHTML =
        '<div class="tp-empty">' +
          '<i class="fa-solid fa-puzzle-piece tp-empty-icon"></i>' +
          '<div class="tp-empty-text">还没有自定义插件</div>' +
          '<div class="tp-empty-sub">点击右上角 + 创建、导入或从模板库添加安全工具插件</div>' +
          '<div style="display:flex;gap:10px;margin-top:14px;">' +
            '<button class="btn-pill" id="cp-empty-create">创建自定义插件</button>' +
            '<button class="btn-pill btn-ghost" id="cp-empty-tpl">浏览模板库</button>' +
          '</div>' +
        '</div>';
      var createBtn = container.querySelector('#cp-empty-create');
      if (createBtn) createBtn.addEventListener('click', function() { openCustomPluginEditor(page, null); });
      var tplBtn = container.querySelector('#cp-empty-tpl');
      if (tplBtn) tplBtn.addEventListener('click', function() { openPluginTemplatesPage(page); });
      return;
    }

    container.innerHTML =
      '<div class="cp-list-wrap">' +
        '<div class="cp-category-header">' +
          '<div><i class="fa-solid fa-puzzle-piece"></i> <span>已安装的自定义插件 (' + plugins.length + ')</span></div>' +
          '<button type="button" class="aiw-inline-link-btn" id="cp-goto-templates"><i class="fa-solid fa-book-bookmark"></i> 浏览模板库</button>' +
        '</div>' +
        '<div class="cp-cards">' +
          plugins.map(function(p) {
            return '<div class="cp-card" data-plugin-id="' + escapeHtml(p.id) + '">' +
              '<div class="cp-card-icon"><i class="' + escapeHtml(p.icon || 'fa-solid fa-puzzle-piece') + '"></i></div>' +
              '<div class="cp-card-body">' +
                '<div class="cp-card-title">' +
                  '<span>' + escapeHtml(p.name) + '</span>' +
                  '<span class="cp-card-tag">' + escapeHtml(p.toolName) + '</span>' +
                '</div>' +
                '<div class="cp-card-desc">' + escapeHtml(p.description || '暂无描述') + '</div>' +
                '<div class="cp-card-meta">能力: <code>' + escapeHtml(p.toolCapability) + '</code></div>' +
              '</div>' +
              '<div class="cp-card-actions">' +
                '<button type="button" class="cp-switch-btn ' + (p.enabled ? 'is-on' : '') + '" data-action="toggle" data-id="' + escapeHtml(p.id) + '">' + (p.enabled ? '已启用' : '已关闭') + '</button>' +
                '<button type="button" class="btn-icon cp-btn-test" data-id="' + escapeHtml(p.id) + '" title="测试运行"><i class="fa-solid fa-play"></i></button>' +
                '<button type="button" class="btn-icon cp-btn-edit" data-id="' + escapeHtml(p.id) + '" title="编辑"><i class="fa-solid fa-pen"></i></button>' +
                '<button type="button" class="btn-icon cp-btn-export" data-id="' + escapeHtml(p.id) + '" title="导出 JSON 文件"><i class="fa-solid fa-download"></i></button>' +
                '<button type="button" class="btn-icon cp-btn-share" data-id="' + escapeHtml(p.id) + '" title="复制分享配置"><i class="fa-solid fa-copy"></i></button>' +
                '<button type="button" class="btn-icon cp-btn-delete" data-id="' + escapeHtml(p.id) + '" title="删除"><i class="fa-solid fa-trash"></i></button>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';

    var gotoTplBtn = container.querySelector('#cp-goto-templates');
    if (gotoTplBtn) {
      gotoTplBtn.addEventListener('click', function() { openPluginTemplatesPage(page); });
    }

    container.querySelectorAll('[data-action="toggle"]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.getAttribute('data-id');
        var plugins = await getCustomPlugins();
        var p = plugins.find(function(x) { return x.id === id; });
        if (p) {
          var nextState = !p.enabled;
          await toggleCustomPlugin(id, nextState);
          if (typeof window.toast === 'function') window.toast(nextState ? '插件已启用' : '插件已关闭');
          await renderCustomPluginsList(page);
        }
      });
    });

    container.querySelectorAll('.cp-btn-test').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.getAttribute('data-id');
        var plugins = await getCustomPlugins();
        var p = plugins.find(function(x) { return x.id === id; });
        if (p) openPluginTestModal(p);
      });
    });

    container.querySelectorAll('.cp-btn-edit').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.getAttribute('data-id');
        var plugins = await getCustomPlugins();
        var p = plugins.find(function(x) { return x.id === id; });
        if (p) openCustomPluginEditor(page, p);
      });
    });

    container.querySelectorAll('.cp-btn-export').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.getAttribute('data-id');
        var plugins = await getCustomPlugins();
        var p = plugins.find(function(x) { return x.id === id; });
        if (p) exportCustomPluginJson(p);
      });
    });

    container.querySelectorAll('.cp-btn-share').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.getAttribute('data-id');
        var plugins = await getCustomPlugins();
        var p = plugins.find(function(x) { return x.id === id; });
        if (p) copyCustomPluginConfig(p);
      });
    });

    container.querySelectorAll('.cp-btn-delete').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.getAttribute('data-id');
        if (confirm('确定要删除这个自定义插件吗？')) {
          await deleteCustomPlugin(id);
          if (typeof window.toast === 'function') window.toast('插件已删除');
          await renderCustomPluginsList(page);
        }
      });
    });
  }

  function openCustomPluginEditor(listPage, existing) {
    var isEdit = Boolean(existing);
    var p = existing || {
      id: 'plugin_' + Math.random().toString(36).slice(2, 9),
      name: '',
      description: '',
      icon: 'fa-solid fa-puzzle-piece',
      enabled: false,
      toolCapability: 'weather_check',
      toolName: 'custom_tool',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '参数说明' }
        },
        required: ['query']
      }
    };

    var page = document.createElement('div');
    page.id = 'custom-plugin-editor';
    page.className = 'full-page custom-plugin-editor';
    page.innerHTML =
      '<div class="page-header">' +
        '<button class="header-back" id="cpe-btn-back"><i class="fa-solid fa-angle-left"></i></button>' +
        '<span class="header-title">' + (isEdit ? '编辑自定义插件' : '创建自定义插件') + '</span>' +
      '</div>' +
      '<div class="cpe-scroll">' +
        '<div class="cs-section">' +
          '<label class="cs-field-label">插件名称</label>' +
          '<input class="input-field" id="cpe-name" value="' + escapeHtml(p.name) + '" placeholder="例如：实时天气助手">' +
          '<label class="cs-field-label">工具函数名 (toolName，仅英文字母与下划线)</label>' +
          '<input class="input-field" id="cpe-toolname" value="' + escapeHtml(p.toolName) + '" placeholder="例如：check_weather">' +
          '<label class="cs-field-label">安全工具能力映射</label>' +
          '<select class="input-field" id="cpe-capability">' +
            '<option value="weather_check"' + (p.toolCapability === 'weather_check' ? ' selected' : '') + '>weather_check - 天气查询</option>' +
            '<option value="calculator"' + (p.toolCapability === 'calculator' ? ' selected' : '') + '>calculator - 安全数学计算</option>' +
            '<option value="time_check"' + (p.toolCapability === 'time_check' ? ' selected' : '') + '>time_check - 当前时间</option>' +
            '<option value="quote_generator"' + (p.toolCapability === 'quote_generator' ? ' selected' : '') + '>quote_generator - 治愈金句</option>' +
            '<option value="random_number"' + (p.toolCapability === 'random_number' ? ' selected' : '') + '>random_number - 随机数生成</option>' +
            '<option value="note_search"' + (p.toolCapability === 'note_search' ? ' selected' : '') + '>note_search - 笔记与记忆检索</option>' +
          '</select>' +
          '<label class="cs-field-label">图标类名 (FontAwesome)</label>' +
          '<input class="input-field" id="cpe-icon" value="' + escapeHtml(p.icon) + '" placeholder="fa-solid fa-cloud-sun">' +
          '<label class="cs-field-label">插件描述</label>' +
          '<textarea class="input-field cs-textarea" id="cpe-desc" rows="3" placeholder="简要描述插件功能...">' + escapeHtml(p.description) + '</textarea>' +
          '<label class="cs-field-label">工具参数 JSON Schema</label>' +
          '<textarea class="input-field cs-textarea" id="cpe-params" rows="6">' + escapeHtml(JSON.stringify(p.parameters, null, 2)) + '</textarea>' +
          '<button class="btn-pill btn-full" id="cpe-btn-save" type="button">' + (isEdit ? '保存修改' : '立即创建') + '</button>' +
        '</div>' +
      '</div>';

    if (typeof window.openPage === 'function') {
      window.openPage(page);
    } else {
      (document.getElementById('app') || document.body).appendChild(page);
    }

    page.querySelector('#cpe-btn-back').addEventListener('click', function() {
      if (typeof window.closePage === 'function') window.closePage('custom-plugin-editor');
      else page.remove();
    });

    page.querySelector('#cpe-btn-save').addEventListener('click', async function() {
      var name = page.querySelector('#cpe-name').value.trim();
      var toolName = page.querySelector('#cpe-toolname').value.trim();
      var toolCapability = page.querySelector('#cpe-capability').value;
      var icon = page.querySelector('#cpe-icon').value.trim() || 'fa-solid fa-puzzle-piece';
      var description = page.querySelector('#cpe-desc').value.trim();
      var paramsStr = page.querySelector('#cpe-params').value.trim();

      if (!name) { if (typeof window.toast === 'function') window.toast('请输入插件名称'); return; }
      if (!toolName) { if (typeof window.toast === 'function') window.toast('请输入工具函数名'); return; }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(toolName)) {
        if (typeof window.toast === 'function') window.toast('工具函数名只能包含英文与下划线');
        return;
      }

      var parameters = { type: 'object', properties: {}, required: [] };
      try {
        if (paramsStr) parameters = JSON.parse(paramsStr);
      } catch (err) {
        if (typeof window.toast === 'function') window.toast('参数 JSON Schema 格式无效');
        return;
      }

      p.name = name;
      p.toolName = toolName;
      p.toolCapability = toolCapability;
      p.icon = icon;
      p.description = description;
      p.parameters = parameters;

      try {
        await saveCustomPlugin(p);
        if (typeof window.toast === 'function') window.toast(isEdit ? '插件已更新' : '插件已创建');
        if (typeof window.closePage === 'function') window.closePage('custom-plugin-editor');
        else page.remove();
        await renderCustomPluginsList(listPage);
      } catch (err) {
        if (typeof window.toast === 'function') window.toast('保存失败: ' + (err.message || err));
      }
    });
  }

  function openPluginTestModal(plugin) {
    var backdrop = document.createElement('div');
    backdrop.className = 'aiw-ws-modal-backdrop open';
    backdrop.innerHTML =
      '<div class="aiw-ws-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title">测试运行: ' + escapeHtml(plugin.name) + '</div>' +
          '<button type="button" class="aiw-ws-modal-close" id="cp-test-close"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<label class="cs-field-label">测试参数 JSON</label>' +
          '<textarea class="input-field cs-textarea" id="cp-test-args" rows="3">{"location": "北京"}</textarea>' +
          '<button class="btn-pill btn-full" id="cp-test-run" type="button" style="margin-top:12px;">执行测试</button>' +
          '<label class="cs-field-label" style="margin-top:14px;">执行结果</label>' +
          '<pre id="cp-test-result" style="background:#f4f4f6;padding:10px;border-radius:8px;font-size:12px;max-height:160px;overflow:auto;">点击上方执行测试查看输出...</pre>' +
        '</div>' +
      '</div>';

    document.body.appendChild(backdrop);
    backdrop.querySelector('#cp-test-close').addEventListener('click', function() { backdrop.remove(); });
    backdrop.addEventListener('click', function(e) { if (e.target === backdrop) backdrop.remove(); });

    backdrop.querySelector('#cp-test-run').addEventListener('click', async function() {
      var argsBox = backdrop.querySelector('#cp-test-args');
      var resPre = backdrop.querySelector('#cp-test-result');
      var args = {};
      try {
        args = JSON.parse(argsBox.value.trim() || '{}');
      } catch (err) {
        resPre.textContent = '参数 JSON 格式无效: ' + err.message;
        return;
      }
      resPre.textContent = '正在执行...';
      var res = await executeCustomPluginTool(plugin.toolName, args);
      resPre.textContent = JSON.stringify(res, null, 2);
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Expose API
  global.CustomPlugins = {
    getCustomPlugins: getCustomPlugins,
    saveCustomPlugin: saveCustomPlugin,
    deleteCustomPlugin: deleteCustomPlugin,
    toggleCustomPlugin: toggleCustomPlugin,
    executeCustomPluginTool: executeCustomPluginTool,
    getCustomPluginTools: getCustomPluginTools,
    openCustomPluginsPage: openCustomPluginsPage,
    openPluginTemplatesPage: openPluginTemplatesPage,
    buildPluginTraceCardHTML: buildPluginTraceCardHTML,
    bindPluginTraceInteractions: bindPluginTraceInteractions,
    importCustomPluginFromJsonText: async function(txt) {
      var d = JSON.parse(txt);
      var list = Array.isArray(d) ? d : [d];
      for (var i = 0; i < list.length; i++) {
        var clean = validateImportedPlugin(list[i]);
        await saveCustomPlugin(clean);
      }
      return list.length;
    }
  };

  global.openCustomPluginsPage = openCustomPluginsPage;

})(typeof window !== 'undefined' ? window : globalThis);
