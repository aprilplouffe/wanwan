// js/plugin-presets.js — 知屿 7-C2：插件预设组合管理与多端/多会话隔离
(function(global) {
  'use strict';

  var DEFAULT_PRESETS = [
    {
      id: 'preset_standard',
      name: '日常全能组合',
      description: '包含时间感知、随机骰子与计算器，满足日常陪伴与效率计算需要',
      pluginIds: ['builtin_time_utils', 'builtin_dice_roller', 'builtin_calculator'],
      isDefault: true,
      updatedAt: Date.now()
    },
    {
      id: 'preset_roleplay',
      name: '角色扮演沉浸组合',
      description: '包含随机事件与剧情状态整理，助力沉浸式故事推进',
      pluginIds: ['builtin_time_utils', 'builtin_rp_random_event', 'builtin_rp_story_state'],
      isDefault: false,
      updatedAt: Date.now()
    },
    {
      id: 'preset_light',
      name: '极简效率组合',
      description: '仅保留核心时间感知助理，轻量高效',
      pluginIds: ['builtin_time_utils'],
      isDefault: false,
      updatedAt: Date.now()
    }
  ];

  var STORAGE_KEY = 'aiw_plugin_presets_v1';
  var DEFAULT_PRESET_KEY = 'aiw_default_plugin_preset_id';

  function clone(val) {
    try {
      return JSON.parse(JSON.stringify(val));
    } catch (_) {
      return val;
    }
  }

  function sanitizePresetRecord(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var id = String(src.id || '').trim() || ('preset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
    var name = String(src.name || '').trim().slice(0, 50) || '未命名预设';
    var description = String(src.description || '').trim().slice(0, 200);
    var pluginIds = Array.isArray(src.pluginIds) ? src.pluginIds.map(String).filter(Boolean) : [];
    
    // Rule 7: 严禁在预设中保存 API Key、Token 等敏感信息
    var record = {
      id: id,
      name: name,
      description: description,
      pluginIds: Array.from(new Set(pluginIds)),
      isDefault: !!src.isDefault,
      updatedAt: Number(src.updatedAt) || Date.now()
    };
    
    // Explicitly strip any accidental keys
    delete record.apiKey;
    delete record.token;
    delete record.secret;
    delete record.authToken;
    delete record.password;
    return record;
  }

  async function getPluginPresets() {
    var store = global.AiWorkspaceStorage;
    var rawList = null;
    if (store && typeof store.getConfig === 'function') {
      try {
        rawList = await store.getConfig(STORAGE_KEY);
      } catch (_) {}
    }
    if (!rawList && global.localStorage) {
      try {
        var local = global.localStorage.getItem(STORAGE_KEY);
        if (local) rawList = JSON.parse(local);
      } catch (_) {}
    }

    var list = Array.isArray(rawList) ? rawList : null;
    if (!list || !list.length) {
      list = DEFAULT_PRESETS.map(sanitizePresetRecord);
      await savePluginPresetsList(list);
    } else {
      list = list.map(sanitizePresetRecord);
    }
    return list;
  }

  async function savePluginPresetsList(list) {
    var cleanList = (Array.isArray(list) ? list : []).map(sanitizePresetRecord);
    var store = global.AiWorkspaceStorage;
    if (store && typeof store.setConfig === 'function') {
      try {
        await store.setConfig(STORAGE_KEY, cleanList);
      } catch (_) {}
    }
    if (global.localStorage) {
      try {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanList));
      } catch (_) {}
    }
    return cleanList;
  }

  async function savePluginPreset(presetInput) {
    var norm = sanitizePresetRecord(presetInput);
    if (!norm.name) throw new Error('预设名称不能为空');
    var list = await getPluginPresets();
    var idx = list.findIndex(function(p) { return p.id === norm.id; });
    if (norm.isDefault) {
      list.forEach(function(p) { p.isDefault = false; });
    }
    if (idx >= 0) {
      list[idx] = norm;
    } else {
      list.push(norm);
    }
    await savePluginPresetsList(list);
    return norm;
  }

  async function deletePluginPreset(presetId) {
    var pid = String(presetId || '').trim();
    if (!pid) return;
    var list = await getPluginPresets();
    var next = list.filter(function(p) { return p.id !== pid; });
    await savePluginPresetsList(next);
  }

  async function getDefaultPresetId() {
    var store = global.AiWorkspaceStorage;
    var defId = '';
    if (store && typeof store.getConfig === 'function') {
      try { defId = await store.getConfig(DEFAULT_PRESET_KEY); } catch (_) {}
    }
    if (!defId && global.localStorage) {
      defId = global.localStorage.getItem(DEFAULT_PRESET_KEY) || '';
    }
    if (!defId) {
      var list = await getPluginPresets();
      var found = list.find(function(p) { return p.isDefault; });
      if (found) defId = found.id;
    }
    return defId || '';
  }

  async function setDefaultPreset(presetId) {
    var pid = String(presetId || '').trim();
    var list = await getPluginPresets();
    list.forEach(function(p) {
      p.isDefault = (p.id === pid);
    });
    await savePluginPresetsList(list);
    var store = global.AiWorkspaceStorage;
    if (store && typeof store.setConfig === 'function') {
      try { await store.setConfig(DEFAULT_PRESET_KEY, pid); } catch (_) {}
    }
    if (global.localStorage) {
      try { global.localStorage.setItem(DEFAULT_PRESET_KEY, pid); } catch (_) {}
    }
    if (typeof window.notifyToast === 'function') {
      window.notifyToast('已设为全局默认预设');
    }
  }

  // Rule 3 & 4: 应用预设到全局，更新对应插件的启停状态
  async function applyPresetGlobally(presetId) {
    var presets = await getPluginPresets();
    var preset = presets.find(function(p) { return p.id === presetId; });
    if (!preset) throw new Error('未找到该插件预设');

    var pApi = global.AiWorkspacePlugins;
    if (!pApi || typeof pApi.loadPluginSettings !== 'function') {
      throw new Error('插件系统未就绪');
    }

    var settings = await pApi.loadPluginSettings();
    var allPlugins = pApi.listPlugins('all') || [];
    var selectedSet = new Set(preset.pluginIds || []);

    allPlugins.forEach(function(plg) {
      var shouldEnable = selectedSet.has(plg.id);
      if (!settings.plugins[plg.id]) {
        settings.plugins[plg.id] = { enabled: shouldEnable, config: {} };
      } else {
        settings.plugins[plg.id].enabled = shouldEnable;
      }
    });

    await pApi.savePluginSettings(settings);
    if (typeof window.notifyToast === 'function') {
      window.notifyToast('已成功应用全局插件预设：' + preset.name);
    }
    return preset;
  }

  // Rule 3 & 4: 应用预设到当前聊天，不影响其他聊天的独立配置
  async function applyPresetToChat(chatId, presetId) {
    var cid = String(chatId || '').trim();
    if (!cid) throw new Error('未指定当前会话 ID');
    var presets = await getPluginPresets();
    var preset = presets.find(function(p) { return p.id === presetId; });
    if (!preset) throw new Error('未找到该插件预设');

    var pApi = global.AiWorkspacePlugins;
    if (!pApi || typeof pApi.loadPluginSettings !== 'function') {
      throw new Error('插件系统未就绪');
    }

    var settings = await pApi.loadPluginSettings();
    if (!settings.chatOverrides[cid]) {
      settings.chatOverrides[cid] = { enabled: null, plugins: {} };
    }
    var allPlugins = pApi.listPlugins('all') || [];
    var selectedSet = new Set(preset.pluginIds || []);

    allPlugins.forEach(function(plg) {
      settings.chatOverrides[cid].plugins[plg.id] = selectedSet.has(plg.id);
    });

    await pApi.savePluginSettings(settings);

    // Also update chat record if db available
    var store = global.AiWorkspaceStorage;
    if (store && typeof store.getChat === 'function' && typeof store.saveChat === 'function') {
      try {
        var chat = await store.getChat(cid);
        if (chat) {
          chat.pluginPresetId = presetId;
          await store.saveChat(chat);
        }
      } catch (_) {}
    }

    if (typeof window.notifyToast === 'function') {
      window.notifyToast('已为当前会话应用插件预设：' + preset.name);
    }
    return preset;
  }

  // Rule 5: 支持保存当前聊天的插件配置为新预设
  async function saveCurrentChatAsPreset(chatId, presetName) {
    var name = String(presetName || '').trim();
    if (!name) throw new Error('请输入预设名称');

    var pApi = global.AiWorkspacePlugins;
    if (!pApi || typeof pApi.loadPluginSettings !== 'function') {
      throw new Error('插件系统未就绪');
    }

    var settings = await pApi.loadPluginSettings();
    var cid = String(chatId || '').trim();
    var allPlugins = pApi.listPlugins('all') || [];
    var enabledIds = [];

    allPlugins.forEach(function(plg) {
      var state = pApi.resolvePluginEffectiveState(plg.id, settings, cid);
      if (state.effectiveEnabled) {
        enabledIds.push(plg.id);
      }
    });

    var newPreset = sanitizePresetRecord({
      id: 'preset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: name,
      description: '从当前会话（' + (cid ? cid.slice(0, 8) : '全局') + '）插件状态保存的组合',
      pluginIds: enabledIds,
      isDefault: false,
      updatedAt: Date.now()
    });

    await savePluginPreset(newPreset);
    if (typeof window.notifyToast === 'function') {
      window.notifyToast('成功保存当前配置为新预设：' + name);
    }
    return newPreset;
  }

  // Rule 6: MCP 插件不可用时给予提示，不影响其他插件
  function checkMcpAvailability() {
    var pApi = global.AiWorkspacePlugins;
    if (!pApi || typeof pApi.listPlugins !== 'function') return;
    try {
      var mcpPlugins = pApi.listPlugins('mcp') || [];
      var offlineCount = 0;
      mcpPlugins.forEach(function(m) {
        if (m.mcpMeta && !m.mcpMeta.connected) {
          offlineCount++;
        }
      });
      if (offlineCount > 0 && typeof window.notifyToast === 'function') {
        window.notifyToast('提示：检测到 ' + offlineCount + ' 个 MCP 插件当前未连接，不影响其他内置与自定义插件运行。');
      }
    } catch (_) {}
  }

  // ===== 预设管理中心 UI =====
  async function openPluginPresetsPage(options) {
    checkMcpAvailability();
    var opts = options && typeof options === 'object' ? options : {};
    var currentChatId = String(opts.chatId || '').trim();

    var page = document.createElement('div');
    page.id = 'plugin-presets-page';
    page.className = 'full-page plugin-presets-page';
    page.innerHTML =
      '<div class="page-header">' +
        '<button class="header-back" id="pp-btn-back"><i class="fa-solid fa-angle-left"></i></button>' +
        '<span class="header-title">插件预设组合管理</span>' +
        '<div class="tp-header-actions">' +
          (currentChatId ? '<button class="btn-pill pp-header-action" id="pp-btn-save-current" title="保存当前会话为预设"><i class="fa-solid fa-camera"></i> 保存当前</button>' : '') +
          '<button class="btn-icon pp-header-action" id="pp-btn-add" title="创建新预设"><i class="fa-solid fa-plus"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="pp-scroll" id="pp-list-container"></div>';

    if (typeof window.openPage === 'function') {
      window.openPage(page);
    } else {
      (document.getElementById('app') || document.body).appendChild(page);
    }

    page.querySelector('#pp-btn-back').addEventListener('click', function() {
      if (typeof window.closePage === 'function') window.closePage('plugin-presets-page');
      else page.remove();
    });

    var addBtn = page.querySelector('#pp-btn-add');
    if (addBtn) {
      addBtn.addEventListener('click', function() {
        openPluginPresetEditor(page, null);
      });
    }

    var saveCurrentBtn = page.querySelector('#pp-btn-save-current');
    if (saveCurrentBtn) {
      saveCurrentBtn.addEventListener('click', async function() {
        var presetName = prompt('请输入新预设名称：', '会话插件组合 ' + new Date().toLocaleTimeString());
        if (!presetName) return;
        try {
          await saveCurrentChatAsPreset(currentChatId, presetName);
          await renderPluginPresetsList(page, currentChatId);
        } catch (err) {
          if (typeof window.notifyToast === 'function') window.notifyToast('保存失败: ' + err.message);
        }
      });
    }

    await renderPluginPresetsList(page, currentChatId);
  }

  async function renderPluginPresetsList(page, chatId) {
    var container = page.querySelector('#pp-list-container');
    if (!container) return;
    var presets = await getPluginPresets();
    var defId = await getDefaultPresetId();
    var pApi = global.AiWorkspacePlugins;
    var allPlugins = pApi && typeof pApi.listPlugins === 'function' ? (pApi.listPlugins('all') || []) : [];

    var pluginMap = new Map();
    allPlugins.forEach(function(p) { pluginMap.set(p.id, p.name); });

    if (!presets.length) {
      container.innerHTML =
        '<div class="tp-empty">' +
          '<i class="fa-solid fa-wand-magic-sparkles tp-empty-icon"></i>' +
          '<div class="tp-empty-text">还没有插件预设</div>' +
          '<div class="tp-empty-sub">创建预设组合，一键切换多款工具与会话状态</div>' +
          '<button class="btn-pill" id="pp-empty-create">创建第一个预设</button>' +
        '</div>';
      var btn = container.querySelector('#pp-empty-create');
      if (btn) btn.addEventListener('click', function() { openPluginPresetEditor(page, null); });
      return;
    }

    container.innerHTML =
      '<div class="pp-list-wrap" style="padding:16px; display:flex; flex-direction:column; gap:14px; max-width:720px; margin:0 auto;">' +
        (chatId ? '<div style="background:rgba(236,72,153,0.08); border:1px solid rgba(236,72,153,0.2); padding:12px 16px; border-radius:12px; font-size:13px; color:var(--aiw-text); display:flex; align-items:center; justify-content:space-between;">' +
          '<span>当前正处于特定会话中，您可以将预设直接应用到当前会话或设为全局默认。</span>' +
        '</div>' : '') +
        '<div class="pp-cards" style="display:flex; flex-direction:column; gap:12px;">' +
          presets.map(function(pr) {
            var isDef = pr.id === defId;
            var pNames = (pr.pluginIds || []).map(function(id) { return pluginMap.get(id) || id; }).join('、');
            return '<div class="pp-card" data-preset-id="' + escapeHtml(pr.id) + '" style="background:#ffffff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:16px; display:flex; align-items:flex-start; gap:14px; box-shadow:0 2px 8px rgba(0,0,0,0.03);">' +
              '<div style="width:40px; height:40px; border-radius:10px; background:rgba(236,72,153,0.1); color:var(--aiw-pink-deep); display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;"><i class="fa-solid fa-layer-group"></i></div>' +
              '<div style="flex:1; min-width:0;">' +
                '<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">' +
                  '<span style="font-size:15px; font-weight:700; color:var(--aiw-text);">' + escapeHtml(pr.name) + '</span>' +
                  (isDef ? '<span style="font-size:10.5px; background:var(--aiw-pink-deep); color:#fff; padding:2px 8px; border-radius:6px; font-weight:600;">默认预设</span>' : '') +
                '</div>' +
                '<div style="font-size:13px; color:var(--aiw-sub); margin-bottom:8px; line-height:1.4;">' + escapeHtml(pr.description || '无描述') + '</div>' +
                '<div style="font-size:12px; color:var(--aiw-sub); background:#f9fafb; padding:6px 10px; border-radius:8px;">包含插件 (' + (pr.pluginIds || []).length + '): <strong>' + escapeHtml(pNames || '无') + '</strong></div>' +
              '</div>' +
              '<div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;">' +
                (chatId ? '<button type="button" class="btn-pill pp-btn-apply-chat" data-id="' + escapeHtml(pr.id) + '" style="font-size:12px; padding:6px 12px;">应用到会话</button>' : '') +
                '<button type="button" class="btn-pill pp-btn-apply-global" data-id="' + escapeHtml(pr.id) + '" style="font-size:12px; padding:6px 12px; background:#f4f4f6; color:#374151;">应用全局</button>' +
                (!isDef ? '<button type="button" class="btn-pill pp-btn-setdefault" data-id="' + escapeHtml(pr.id) + '" style="font-size:11px; padding:4px 8px; background:transparent; color:var(--aiw-sub);">设为默认</button>' : '') +
                '<div style="display:flex; gap:6px; margin-top:4px;">' +
                  '<button type="button" class="btn-icon pp-btn-edit" data-id="' + escapeHtml(pr.id) + '" title="编辑预设" style="width:30px; height:30px; font-size:12px;"><i class="fa-solid fa-pen"></i></button>' +
                  '<button type="button" class="btn-icon pp-btn-delete" data-id="' + escapeHtml(pr.id) + '" title="删除预设" style="width:30px; height:30px; font-size:12px; color:#ef4444;"><i class="fa-solid fa-trash"></i></button>' +
                '</div>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';

    container.querySelectorAll('.pp-btn-apply-chat').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.getAttribute('data-id');
        try {
          await applyPresetToChat(chatId, id);
        } catch (err) {
          if (typeof window.notifyToast === 'function') window.notifyToast('应用失败: ' + err.message);
        }
      });
    });

    container.querySelectorAll('.pp-btn-apply-global').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.getAttribute('data-id');
        try {
          await applyPresetGlobally(id);
        } catch (err) {
          if (typeof window.notifyToast === 'function') window.notifyToast('应用失败: ' + err.message);
        }
      });
    });

    container.querySelectorAll('.pp-btn-setdefault').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.getAttribute('data-id');
        try {
          await setDefaultPreset(id);
          await renderPluginPresetsList(page, chatId);
        } catch (err) {
          if (typeof window.notifyToast === 'function') window.notifyToast('设置失败: ' + err.message);
        }
      });
    });

    container.querySelectorAll('.pp-btn-edit').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.getAttribute('data-id');
        var presets = await getPluginPresets();
        var pr = presets.find(function(x) { return x.id === id; });
        if (pr) openPluginPresetEditor(page, pr, chatId);
      });
    });

    container.querySelectorAll('.pp-btn-delete').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.getAttribute('data-id');
        if (confirm('确定要删除这个插件预设吗？')) {
          await deletePluginPreset(id);
          if (typeof window.notifyToast === 'function') window.notifyToast('预设已删除');
          await renderPluginPresetsList(page, chatId);
        }
      });
    });
  }

  async function openPluginPresetEditor(listPage, existing, chatId) {
    var isEdit = Boolean(existing);
    var pr = existing || {
      id: 'preset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: '',
      description: '',
      pluginIds: []
    };

    var pApi = global.AiWorkspacePlugins;
    var allPlugins = pApi && typeof pApi.listPlugins === 'function' ? (pApi.listPlugins('all') || []) : [];
    var selectedSet = new Set(pr.pluginIds || []);

    var page = document.createElement('div');
    page.id = 'plugin-preset-editor';
    page.className = 'full-page plugin-preset-editor';
    page.innerHTML =
      '<div class="page-header">' +
        '<button class="header-back" id="ppe-btn-back"><i class="fa-solid fa-angle-left"></i></button>' +
        '<span class="header-title">' + (isEdit ? '编辑插件预设' : '创建插件预设') + '</span>' +
      '</div>' +
      '<div class="ppe-scroll" style="padding:20px; max-width:640px; margin:0 auto;">' +
        '<div style="background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:20px; display:flex; flex-direction:column; gap:16px;">' +
          '<div>' +
            '<label style="display:block; font-size:13px; font-weight:600; color:var(--aiw-text); margin-bottom:6px;">预设名称</label>' +
            '<input type="text" class="input-field" id="ppe-name" value="' + escapeHtml(pr.name) + '" placeholder="例如：日常创作组合" style="width:100%; padding:10px 14px; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:14px;">' +
          '</div>' +
          '<div>' +
            '<label style="display:block; font-size:13px; font-weight:600; color:var(--aiw-text); margin-bottom:6px;">预设描述</label>' +
            '<textarea class="input-field" id="ppe-desc" rows="2" placeholder="简要描述该预设的用途..." style="width:100%; padding:10px 14px; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:14px; resize:vertical;">' + escapeHtml(pr.description) + '</textarea>' +
          '</div>' +
          '<div>' +
            '<label style="display:block; font-size:13px; font-weight:600; color:var(--aiw-text); margin-bottom:8px;">选择包含的插件工具（支持内置、自定义、MCP 插件）</label>' +
            '<div id="ppe-checklist" style="display:flex; flex-direction:column; gap:8px; max-height:360px; overflow-y:auto; padding:4px;">' +
              allPlugins.map(function(plg) {
                var checked = selectedSet.has(plg.id) ? ' checked' : '';
                var catLabel = plg.categoryLabel || plg.category;
                var toolNames = (plg.tools || []).map(function(t) { return t.title || t.name; }).join('、');
                return '<label style="display:flex; align-items:center; gap:12px; background:#f8fafc; border:1px solid rgba(0,0,0,0.06); padding:10px 14px; border-radius:10px; cursor:pointer;">' +
                  '<input type="checkbox" data-plugin-id="' + escapeHtml(plg.id) + '"' + checked + ' style="width:16px; height:16px; accent-color:var(--aiw-pink-deep);">' +
                  '<div style="flex:1; min-width:0;">' +
                    '<div style="display:flex; align-items:center; gap:8px;">' +
                      '<span style="font-size:14px; font-weight:600; color:var(--aiw-text);">' + escapeHtml(plg.name) + '</span>' +
                      '<span style="font-size:10.5px; background:rgba(0,0,0,0.06); color:var(--aiw-sub); padding:2px 6px; border-radius:6px;">' + escapeHtml(catLabel) + '</span>' +
                    '</div>' +
                    '<div style="font-size:12px; color:var(--aiw-sub); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">工具：' + escapeHtml(toolNames || '无') + '</div>' +
                  '</div>' +
                '</label>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<button class="btn-pill btn-full" id="ppe-btn-save" type="button" style="margin-top:8px; padding:12px; font-size:14px; font-weight:600;">' + (isEdit ? '保存修改' : '立即创建') + '</button>' +
        '</div>' +
      '</div>';

    if (typeof window.openPage === 'function') {
      window.openPage(page);
    } else {
      (document.getElementById('app') || document.body).appendChild(page);
    }

    page.querySelector('#ppe-btn-back').addEventListener('click', function() {
      if (typeof window.closePage === 'function') window.closePage('plugin-preset-editor');
      else page.remove();
    });

    page.querySelector('#ppe-btn-save').addEventListener('click', async function() {
      var name = page.querySelector('#ppe-name').value.trim();
      var desc = page.querySelector('#ppe-desc').value.trim();
      if (!name) {
        if (typeof window.notifyToast === 'function') window.notifyToast('请输入预设名称');
        return;
      }
      var checkedIds = [];
      page.querySelectorAll('#ppe-checklist input[type="checkbox"]:checked').forEach(function(chk) {
        checkedIds.push(chk.getAttribute('data-plugin-id'));
      });

      pr.name = name;
      pr.description = desc;
      pr.pluginIds = checkedIds;

      try {
        await savePluginPreset(pr);
        if (typeof window.notifyToast === 'function') window.notifyToast(isEdit ? '预设已更新' : '预设已创建');
        if (typeof window.closePage === 'function') window.closePage('plugin-preset-editor');
        else page.remove();
        await renderPluginPresetsList(listPage, chatId);
      } catch (err) {
        if (typeof window.notifyToast === 'function') window.notifyToast('保存失败: ' + err.message);
      }
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

  global.PluginPresets = {
    getPluginPresets: getPluginPresets,
    savePluginPreset: savePluginPreset,
    deletePluginPreset: deletePluginPreset,
    applyPresetGlobally: applyPresetGlobally,
    applyPresetToChat: applyPresetToChat,
    saveCurrentChatAsPreset: saveCurrentChatAsPreset,
    setDefaultPreset: setDefaultPreset,
    getDefaultPresetId: getDefaultPresetId,
    checkMcpAvailability: checkMcpAvailability,
    openPluginPresetsPage: openPluginPresetsPage
  };

  global.openPluginPresetsPage = openPluginPresetsPage;

})(typeof window !== 'undefined' ? window : globalThis);
