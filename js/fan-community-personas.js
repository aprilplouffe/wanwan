// js/fan-community-personas.js — 同好社区 · 公共人设库模块（任务 13）
// 独立命名空间：wanwan-fan-community-personas-v1（供捡手机文学及后续论坛体、文游模拟器共用）
// 头像图片保存在 IndexedDB（FanCommunityAssets），localStorage 仅存结构化文本与素材 ID。

(function(global) {
  'use strict';

  var STORAGE_KEY = 'wanwan-fan-community-personas-v1';

  function storage() {
    return global.localStorage || null;
  }

  function assetsApi() {
    return global.FanCommunityAssets || null;
  }

  function worksApi() {
    return global.FanCommunityWorks || null;
  }

  function notify(msg) {
    if (typeof global.toast === 'function') {
      global.toast(msg);
    }
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function cleanText(val, maxLen) {
    if (typeof val !== 'string') return '';
    if (typeof maxLen === 'number' && maxLen > 0 && val.length > maxLen) {
      return val.slice(0, maxLen);
    }
    return val;
  }

  function generatePersonaId(existingList) {
    var used = Object.create(null);
    if (Array.isArray(existingList)) {
      for (var i = 0; i < existingList.length; i++) {
        if (existingList[i] && existingList[i].id) used[existingList[i].id] = true;
      }
    }
    for (var attempt = 0; attempt < 8; attempt++) {
      var candidate = 'persona_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      if (!used[candidate]) return candidate;
    }
    return 'persona_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function dedupeStringIds(list) {
    if (!Array.isArray(list)) return [];
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var id = String(list[i] || '').trim();
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  function normalizePersona(raw) {
    var now = Date.now();
    var src = raw && typeof raw === 'object' ? raw : {};
    return {
      id: String(src.id || ''),
      name: cleanText(String(src.name || ''), 40).trim() || '未命名角色',
      avatarAssetId: typeof src.avatarAssetId === 'string' ? src.avatarAssetId : '',
      personality: cleanText(src.personality, 1200),
      background: cleanText(src.background, 2000),
      speakingStyle: cleanText(src.speakingStyle, 1000),
      experience: cleanText(src.experience, 2000),
      notes: cleanText(src.notes, 1500),
      lorebookIds: dedupeStringIds(src.lorebookIds),
      createdAt: typeof src.createdAt === 'number' ? src.createdAt : now,
      updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : now
    };
  }

  async function readAvailableLorebooks() {
    try {
      if (typeof global.loadLorebooks === 'function') {
        var loaded = await global.loadLorebooks();
        return Array.isArray(loaded) ? loaded : [];
      }
      if (global.db && global.db.config) {
        var row = null;
        if (typeof global.runWanWanDBRead === 'function') {
          row = await global.runWanWanDBRead(function() {
            return global.db.config.get('lorebooks');
          });
        } else {
          row = await global.db.config.get('lorebooks');
        }
        return row && Array.isArray(row.value) ? row.value : [];
      }
    } catch (_) {}
    return [];
  }

  function sortPersonas(list) {
    return list.slice().sort(function(a, b) {
      var diff = (b.updatedAt || 0) - (a.updatedAt || 0);
      if (diff !== 0) return diff;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function readStore() {
    var store = storage();
    if (!store) return { version: 1, personas: [] };
    var raw = store.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, personas: [] };
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.personas)) {
        return { version: 1, personas: [] };
      }
      var normalized = [];
      for (var i = 0; i < parsed.personas.length; i++) {
        var item = parsed.personas[i];
        if (!item || !item.id) continue;
        normalized.push(normalizePersona(item));
      }
      return {
        version: 1,
        personas: sortPersonas(normalized)
      };
    } catch (_) {
      return { version: 1, personas: [] };
    }
  }

  function writeStore(data) {
    var store = storage();
    if (!store) return false;
    try {
      store.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        personas: sortPersonas(data.personas || [])
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function listPersonas() {
    return readStore().personas;
  }

  function getPersona(personaId) {
    if (!personaId) return null;
    var list = readStore().personas;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === personaId) return list[i];
    }
    return null;
  }

  function searchPersonas(query) {
    var list = listPersonas();
    var q = String(query || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(function(p) {
      return String(p.name || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function isAssetReferenced(assetId, excludePersonaId) {
    if (!assetId) return false;
    var list = listPersonas();
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || p.id === excludePersonaId) continue;
      if (p.avatarAssetId === assetId) return true;
    }
    return false;
  }

  function cleanupUnusedPersonaAvatar(assetId, excludePersonaId) {
    if (!assetId) return;
    if (isAssetReferenced(assetId, excludePersonaId)) return;
    var wApi = worksApi();
    if (wApi && typeof wApi.isAssetReferencedInOtherWorks === 'function') {
      if (wApi.isAssetReferencedInOtherWorks(assetId, '')) return;
    }
    var aApi = assetsApi();
    if (!aApi) return;
    aApi.getAsset(assetId).then(function(record) {
      if (!record) return;
      if (record.kind !== 'persona_avatar' && record.kind !== 'avatar') return;
      if (isAssetReferenced(assetId, excludePersonaId)) return;
      if (wApi && typeof wApi.isAssetReferencedInOtherWorks === 'function') {
        if (wApi.isAssetReferencedInOtherWorks(assetId, '')) return;
      }
      return aApi.deleteAsset(assetId);
    }).catch(function() {});
  }

  function createPersona(payload) {
    var name = cleanText(String((payload && payload.name) || ''), 40).trim();
    if (!name) {
      return { ok: false, error: '请输入角色姓名' };
    }
    var data = readStore();
    var now = Date.now();
    var id = generatePersonaId(data.personas);
    var persona = normalizePersona(Object.assign({}, payload, {
      id: id,
      name: name,
      createdAt: now,
      updatedAt: now
    }));
    data.personas.unshift(persona);
    if (!writeStore(data)) {
      return { ok: false, error: '存储空间不足，保存人设失败' };
    }
    return { ok: true, persona: persona };
  }

  function updatePersona(personaId, payload) {
    if (!personaId) return { ok: false, error: '无效的角色 ID' };
    var name = cleanText(String((payload && payload.name) || ''), 40).trim();
    if (!name) {
      return { ok: false, error: '请输入角色姓名' };
    }
    var data = readStore();
    var targetIdx = -1;
    for (var i = 0; i < data.personas.length; i++) {
      if (data.personas[i].id === personaId) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx < 0) {
      return { ok: false, error: '未找到对应人设' };
    }
    var prev = data.personas[targetIdx];
    var next = normalizePersona(Object.assign({}, prev, payload, {
      id: prev.id,
      name: name,
      createdAt: prev.createdAt,
      updatedAt: Date.now()
    }));
    data.personas[targetIdx] = next;
    if (!writeStore(data)) {
      return { ok: false, error: '存储空间不足，更新人设失败' };
    }
    if (prev.avatarAssetId && prev.avatarAssetId !== next.avatarAssetId) {
      cleanupUnusedPersonaAvatar(prev.avatarAssetId, next.id);
    }
    return { ok: true, persona: next };
  }

  function deletePersona(personaId) {
    if (!personaId) return { ok: false, error: '无效的角色 ID' };
    var data = readStore();
    var removed = null;
    var nextList = [];
    for (var i = 0; i < data.personas.length; i++) {
      if (data.personas[i].id === personaId) {
        removed = data.personas[i];
      } else {
        nextList.push(data.personas[i]);
      }
    }
    if (!removed) {
      return { ok: false, error: '未找到对应人设' };
    }
    data.personas = nextList;
    if (!writeStore(data)) {
      return { ok: false, error: '删除人设失败' };
    }

    var unboundCount = 0;
    var wApi = worksApi();
    if (wApi && typeof wApi.unbindPersonaAcrossWorks === 'function') {
      unboundCount = wApi.unbindPersonaAcrossWorks(personaId);
    }

    if (removed.avatarAssetId) {
      cleanupUnusedPersonaAvatar(removed.avatarAssetId, '');
    }

    return { ok: true, removed: removed, unboundCount: unboundCount };
  }

  function formatTime(ts) {
    if (!ts) return '刚刚';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '刚刚';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return y + '/' + m + '/' + day + ' ' + hh + ':' + mm;
  }

  function renderAvatarBox(boxEl, assetId, tokenCheckFn) {
    boxEl.replaceChildren();
    boxEl.classList.remove('has-img');
    if (!assetId) return;
    var aApi = assetsApi();
    if (!aApi) return;

    function mountImg(src) {
      if (!src) return;
      boxEl.replaceChildren();
      var img = document.createElement('img');
      img.src = src;
      img.alt = '角色头像';
      img.onerror = function() {
        boxEl.replaceChildren();
        boxEl.classList.remove('has-img');
      };
      boxEl.classList.add('has-img');
      boxEl.appendChild(img);
    }

    var cached = aApi.getCachedSrc(assetId);
    if (cached) {
      mountImg(cached);
      return;
    }
    aApi.getAsset(assetId).then(function(record) {
      if (typeof tokenCheckFn === 'function' && !tokenCheckFn()) return;
      if (record && record.src) {
        mountImg(record.src);
      }
    }).catch(function() {});
  }

  var VALID_ROLE_SOURCES = ['community_persona', 'char', 'npc'];

  function normalizeRoleRef(rawRef, legacyPersonaId) {
    if (rawRef && typeof rawRef === 'object') {
      var src = typeof rawRef.source === 'string' ? rawRef.source.trim() : '';
      var idStr = rawRef.id !== undefined && rawRef.id !== null ? String(rawRef.id).trim() : '';
      if (VALID_ROLE_SOURCES.indexOf(src) !== -1 && idStr) {
        return { source: src, id: idStr };
      }
    }
    var legacyId = typeof legacyPersonaId === 'string' ? legacyPersonaId.trim() : '';
    if (legacyId) {
      return { source: 'community_persona', id: legacyId };
    }
    return null;
  }

  function getRoleSourceLabel(source) {
    if (source === 'char') return 'Char';
    if (source === 'npc') return 'NPC';
    return '公共人设';
  }

  async function readRawWanwanCharacters() {
    var rows = [];
    try {
      if (global.db && global.db.characters) {
        if (typeof global.runWanWanDBRead === 'function') {
          rows = await global.runWanWanDBRead(function() {
            return global.db.characters.toArray();
          });
        } else {
          rows = await global.db.characters.toArray();
        }
      } else if (global._charCache && typeof global._charCache === 'object') {
        rows = Object.keys(global._charCache).map(function(k) {
          return global._charCache[k];
        });
      }
    } catch (_) {
      rows = [];
    }
    if (!Array.isArray(rows)) return [];
    return rows.filter(function(c) {
      return c && !c.deleted && (c.type === 'char' || c.type === 'npc') && c.id !== undefined && c.id !== null;
    });
  }

  function summarizeArchiveRelations(relations) {
    if (!Array.isArray(relations) || !relations.length) return '';
    var parts = [];
    for (var i = 0; i < relations.length && parts.length < 8; i++) {
      var r = relations[i];
      if (!r || typeof r !== 'object') continue;
      var typeStr = cleanText(String(r.type || ''), 40).trim();
      var descStr = cleanText(String(r.desc || ''), 100).trim();
      var targetName = cleanText(String(r.charName || r.name || ''), 40).trim();
      if (!typeStr && !descStr) continue;
      var piece = (targetName ? (targetName + '：') : '') + typeStr + (descStr ? ('（' + descStr + '）') : '');
      if (piece) parts.push(piece);
    }
    return parts.join('；');
  }

  function projectArchiveRole(raw) {
    var src = raw.type === 'npc' ? 'npc' : 'char';
    var identityObj = raw.identity && typeof raw.identity === 'object' ? raw.identity : null;
    var safeAccount = identityObj && typeof identityObj.account === 'string' ? cleanText(identityObj.account, 60).trim() : '';
    return {
      source: src,
      sourceLabel: src === 'npc' ? 'NPC' : 'Char',
      id: String(raw.id),
      rawId: raw.id,
      name: String(raw.name || '').trim() || '未命名角色',
      nick: String(raw.nick || '').trim(),
      gender: String(raw.gender || '').trim(),
      role: String(raw.role || '').trim(),
      group: String(raw.group || '').trim(),
      description: String(raw.description || '').trim(),
      personality: cleanText(String(raw.personality || ''), 1200).trim(),
      background: cleanText(String(raw.background || ''), 2000).trim(),
      speakingStyle: cleanText(String(raw.speakingStyle || raw.style || ''), 1000).trim(),
      experience: cleanText(String(raw.experience || ''), 2000).trim(),
      notes: cleanText(String(raw.notes || ''), 1500).trim(),
      accountHandle: safeAccount,
      relationsSummary: summarizeArchiveRelations(raw.relations),
      avatar: typeof raw.avatar === 'string' ? raw.avatar : '',
      avatarAssetId: ''
    };
  }

  async function listArchiveRoles(typeFilter, queryText) {
    var rows = await readRawWanwanCharacters();
    var targetType = typeFilter === 'char' || typeFilter === 'npc' ? typeFilter : '';
    var q = String(queryText || '').trim().toLowerCase();
    var projected = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (targetType && r.type !== targetType) continue;
      var item = projectArchiveRole(r);
      if (q && item.name.toLowerCase().indexOf(q) === -1) continue;
      projected.push(item);
    }
    projected.sort(function(a, b) {
      var na = Number(a.id);
      var nb = Number(b.id);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return String(a.id).localeCompare(String(b.id));
    });
    return projected;
  }

  async function getArchiveRole(source, id) {
    var idStr = id !== undefined && id !== null ? String(id).trim() : '';
    if (!idStr) return null;
    var found = null;
    try {
      if (global.db && global.db.characters) {
        var numId = Number(idStr);
        if (Number.isFinite(numId) && String(numId) === idStr) {
          if (typeof global.runWanWanDBRead === 'function') {
            found = await global.runWanWanDBRead(function() {
              return global.db.characters.get(numId);
            });
          } else {
            found = await global.db.characters.get(numId);
          }
        }
        if (!found) {
          var all = await readRawWanwanCharacters();
          for (var i = 0; i < all.length; i++) {
            if (String(all[i].id) === idStr) {
              found = all[i];
              break;
            }
          }
        }
      } else if (global._charCache && typeof global._charCache === 'object') {
        found = global._charCache[idStr] || global._charCache[Number(idStr)] || null;
      }
    } catch (_) {
      found = null;
    }
    if (!found || found.deleted) return null;
    if (found.type !== 'char' && found.type !== 'npc') return null;
    return projectArchiveRole(found);
  }

  async function resolveRoleRef(rawRef, legacyPersonaId) {
    var ref = normalizeRoleRef(rawRef, legacyPersonaId);
    if (!ref) {
      return { status: 'unbound', ref: null, sourceLabel: '', role: null };
    }
    if (ref.source === 'community_persona') {
      var p = getPersona(ref.id);
      if (!p) {
        return { status: 'missing', ref: ref, sourceLabel: '公共人设', role: null };
      }
      var descParts = [];
      if (p.background) descParts.push(p.background);
      if (p.personality) descParts.push(p.personality);
      return {
        status: 'ok',
        ref: ref,
        sourceLabel: '公共人设',
        role: {
          source: 'community_persona',
          sourceLabel: '公共人设',
          id: p.id,
          name: p.name,
          avatar: '',
          avatarAssetId: p.avatarAssetId || '',
          description: descParts.join(' · '),
          personality: p.personality || '',
          background: p.background || '',
          speakingStyle: p.speakingStyle || '',
          experience: p.experience || '',
          notes: p.notes || '',
          lorebookIds: Array.isArray(p.lorebookIds) ? p.lorebookIds.slice() : []
        }
      };
    }

    var arc = await getArchiveRole(ref.source, ref.id);
    var srcLabel = getRoleSourceLabel(ref.source);
    if (!arc) {
      return { status: 'missing', ref: ref, sourceLabel: srcLabel, role: null };
    }
    return {
      status: 'ok',
      ref: { source: arc.source, id: arc.id },
      sourceLabel: arc.sourceLabel,
      role: arc
    };
  }

  function renderRoleAvatarBox(boxEl, role, tokenCheckFn) {
    if (!boxEl) return;
    if (!role) {
      boxEl.replaceChildren();
      boxEl.classList.remove('has-img');
      return;
    }
    if (role.source === 'community_persona') {
      renderAvatarBox(boxEl, role.avatarAssetId, tokenCheckFn);
      return;
    }
    boxEl.replaceChildren();
    boxEl.classList.remove('has-img');
    var src = typeof role.avatar === 'string' ? role.avatar.trim() : '';
    if (!src) return;
    var img = document.createElement('img');
    img.src = src;
    img.alt = (role.name || '角色') + '头像';
    img.referrerPolicy = 'no-referrer';
    img.onerror = function() {
      boxEl.replaceChildren();
      boxEl.classList.remove('has-img');
    };
    boxEl.classList.add('has-img');
    boxEl.appendChild(img);
  }

  // 打开「同好社区 → 设置 → 人设库」独立管理界面
  function openLibrary(container, options) {
    if (!container) return;
    options = options || {};
    var onBack = typeof options.onBack === 'function' ? options.onBack : function() {};
    var renderSeq = 0;
    var searchQuery = '';

    container.replaceChildren();
    var app = el('div', 'fc-persona-app');

    var head = el('header', 'fc-works-head');
    var backBtn = el('button', 'fc-works-back');
    backBtn.type = 'button';
    backBtn.id = 'fc-persona-back-btn';
    backBtn.setAttribute('aria-label', '返回社区设置');
    backBtn.appendChild(el('span', 'fc-works-back-chevron', '‹'));
    backBtn.appendChild(el('span', '', '设置'));

    var titleGroup = el('div', 'fc-works-title-group');
    var brandLink = el('button', 'fc-works-brand-link', '同好社区');
    brandLink.type = 'button';
    brandLink.dataset.fcHomeTrigger = '1';
    brandLink.setAttribute('aria-label', '点击同好社区返回弯弯机桌面');
    var titleEl = el('b', 'fc-works-title', '公共人设库');
    titleGroup.appendChild(brandLink);
    titleGroup.appendChild(titleEl);

    var newBtn = el('button', 'fc-works-new-btn', '＋ 新建');
    newBtn.type = 'button';
    newBtn.id = 'fc-persona-new-btn';

    head.appendChild(backBtn);
    head.appendChild(titleGroup);
    head.appendChild(newBtn);

    var searchWrap = el('div', 'fc-persona-search-wrap');
    var searchBox = el('div', 'fc-persona-search-box');
    var searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = 'fc-persona-search-input';
    searchInput.className = 'fc-persona-search-input';
    searchInput.placeholder = '通过角色姓名查找人设…';
    searchInput.setAttribute('aria-label', '通过角色姓名查找人设');

    var clearSearchBtn = el('button', 'fc-persona-search-clear', '×');
    clearSearchBtn.type = 'button';
    clearSearchBtn.id = 'fc-persona-search-clear';
    clearSearchBtn.setAttribute('aria-label', '清空搜索');
    clearSearchBtn.hidden = true;

    searchBox.appendChild(searchInput);
    searchBox.appendChild(clearSearchBtn);
    searchWrap.appendChild(searchBox);

    var scrollEl = el('div', 'fc-works-scroll');
    scrollEl.id = 'fc-persona-scroll';

    // 编辑 / 新建人设全屏面板
    var editorPanel = el('section', 'fc-chat-settings-panel fc-persona-editor-panel');
    editorPanel.id = 'fc-persona-editor-panel';
    editorPanel.setAttribute('aria-hidden', 'true');

    // 删除二次确认 Sheet
    var sheetBack = el('div', 'fc-chat-sheet-back');
    sheetBack.id = 'fc-persona-sheet-back';
    var sheetBox = el('section', 'fc-chat-sheet');
    var sheetTitle = el('h3', '', '');
    var sheetBody = el('div', '');
    sheetBox.appendChild(sheetTitle);
    sheetBox.appendChild(sheetBody);
    sheetBack.appendChild(sheetBox);

    function openSheet(titleText, buildFn) {
      sheetTitle.textContent = titleText;
      sheetBody.replaceChildren();
      buildFn(sheetBody);
      sheetBack.classList.add('show');
    }

    function closeSheet() {
      sheetBack.classList.remove('show');
      sheetBody.replaceChildren();
    }

    sheetBack.addEventListener('click', function(e) {
      if (e.target === sheetBack) closeSheet();
    });

    function closeEditor() {
      editorPanel.classList.remove('show');
      editorPanel.setAttribute('aria-hidden', 'true');
      editorPanel.replaceChildren();
    }

    function openEditor(existingPersona) {
      var isEdit = Boolean(existingPersona && existingPersona.id);
      var draft = {
        name: existingPersona ? (existingPersona.name || '') : '',
        avatarMode: 'keep', // 'keep' | 'replace' | 'clear'
        existingAvatarId: existingPersona ? (existingPersona.avatarAssetId || '') : '',
        avatarDataUrl: '',
        avatarFileName: '',
        personality: existingPersona ? (existingPersona.personality || '') : '',
        background: existingPersona ? (existingPersona.background || '') : '',
        speakingStyle: existingPersona ? (existingPersona.speakingStyle || '') : '',
        experience: existingPersona ? (existingPersona.experience || '') : '',
        notes: existingPersona ? (existingPersona.notes || '') : '',
        lorebookIds: existingPersona && Array.isArray(existingPersona.lorebookIds)
          ? dedupeStringIds(existingPersona.lorebookIds)
          : []
      };
      var editorToken = ++renderSeq;

      editorPanel.replaceChildren();

      var eHead = el('header', 'fc-settings-head');
      var eBack = el('button', 'fc-settings-back');
      eBack.type = 'button';
      eBack.id = 'fc-persona-editor-cancel-top';
      eBack.appendChild(el('span', 'fc-works-back-chevron', '‹'));
      eBack.appendChild(el('span', '', '取消'));
      eBack.onclick = closeEditor;

      var eTitle = el('b', 'fc-settings-title', isEdit ? '编辑人设' : '新建人设');
      var eSpacer = el('div', 'fc-settings-head-spacer');
      eHead.appendChild(eBack);
      eHead.appendChild(eTitle);
      eHead.appendChild(eSpacer);

      var eBody = el('div', 'fc-settings-body fc-ai-settings-body');
      eBody.id = 'fc-persona-editor-body';

      // 头像与基础姓名卡片
      var basicCard = el('section', 'fc-settings-card');
      var basicHead = el('div', 'fc-settings-card-head');
      basicHead.appendChild(el('span', 'fc-settings-card-title', '基础身份'));
      basicHead.appendChild(el('span', 'fc-settings-card-tag', '社区通用'));
      basicCard.appendChild(basicHead);

      var avatarRow = el('div', 'fc-settings-avatar-row');
      var previewBox = el('div', 'fc-settings-avatar-preview');
      previewBox.id = 'fc-persona-avatar-preview';

      var opsCol = el('div', 'fc-settings-avatar-ops');
      opsCol.appendChild(el('span', 'fc-settings-avatar-label', '角色头像（保存在本地 IndexedDB）'));

      var btnRow = el('div', 'fc-settings-avatar-btns');
      var uploadLabel = document.createElement('label');
      uploadLabel.className = 'fc-settings-mini-btn primary fc-persona-upload-label';
      uploadLabel.id = 'fc-persona-avatar-upload-btn';
      uploadLabel.textContent = '上传头像';
      uploadLabel.setAttribute('for', 'fc-persona-avatar-file');

      var clearAvatarBtn = el('button', 'fc-settings-mini-btn', '恢复默认');
      clearAvatarBtn.type = 'button';
      clearAvatarBtn.id = 'fc-persona-avatar-clear-btn';

      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*,.png,.jpg,.jpeg,.webp,.gif';
      fileInput.className = 'fc-sr-file-input';
      fileInput.id = 'fc-persona-avatar-file';
      fileInput.setAttribute('aria-label', '选择角色头像图片');
      fileInput.addEventListener('click', function() {
        fileInput.value = '';
      });

      function syncAvatarButtons() {
        var hasCustom = (draft.avatarMode === 'replace' && Boolean(draft.avatarDataUrl)) ||
          (draft.avatarMode === 'keep' && Boolean(draft.existingAvatarId));
        clearAvatarBtn.disabled = !hasCustom;
      }

      if (draft.existingAvatarId) {
        renderAvatarBox(previewBox, draft.existingAvatarId, function() {
          return editorPanel.classList.contains('show') && editorToken === renderSeq && draft.avatarMode === 'keep';
        });
      }
      syncAvatarButtons();

      fileInput.addEventListener('change', async function() {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        var aApi = assetsApi();
        if (!aApi) {
          notify('本地素材模块不可用');
          return;
        }
        try {
          var dataUrl = await aApi.readImageFile(file, 8);
          draft.avatarMode = 'replace';
          draft.avatarDataUrl = dataUrl;
          draft.avatarFileName = file.name || '角色头像';
          previewBox.replaceChildren();
          var img = document.createElement('img');
          img.src = dataUrl;
          img.alt = '角色头像预览';
          previewBox.classList.add('has-img');
          previewBox.appendChild(img);
          syncAvatarButtons();
        } catch (err) {
          fileInput.value = '';
          notify(err && err.message ? err.message : '头像读取失败');
        }
      });

      clearAvatarBtn.onclick = function() {
        draft.avatarMode = 'clear';
        draft.avatarDataUrl = '';
        draft.avatarFileName = '';
        previewBox.replaceChildren();
        previewBox.classList.remove('has-img');
        syncAvatarButtons();
      };

      btnRow.appendChild(uploadLabel);
      btnRow.appendChild(clearAvatarBtn);
      opsCol.appendChild(btnRow);
      avatarRow.appendChild(previewBox);
      avatarRow.appendChild(opsCol);
      avatarRow.appendChild(fileInput);
      basicCard.appendChild(avatarRow);

      function addField(parentCard, opts) {
        var group = el('div', 'fc-ai-field-group');
        var lbl = el('label', 'fc-settings-field-label', opts.label);
        lbl.setAttribute('for', opts.id);
        var ctrl;
        if (opts.multiline) {
          ctrl = document.createElement('textarea');
          ctrl.className = 'fc-settings-input fc-ai-textarea';
          ctrl.rows = opts.rows || 3;
          ctrl.maxLength = opts.maxLength || 2000;
        } else {
          ctrl = document.createElement('input');
          ctrl.type = 'text';
          ctrl.className = 'fc-settings-input';
          ctrl.maxLength = opts.maxLength || 40;
        }
        ctrl.id = opts.id;
        ctrl.placeholder = opts.placeholder || '';
        ctrl.value = opts.getValue();
        ctrl.addEventListener('input', function() {
          opts.setValue(ctrl.value);
        });
        ctrl.addEventListener('focus', function() {
          setTimeout(function() {
            if (!editorPanel.classList.contains('show')) return;
            try {
              ctrl.scrollIntoView({ block: 'center', behavior: 'smooth' });
            } catch (_) {
              ctrl.scrollIntoView();
            }
          }, 200);
        });
        group.appendChild(lbl);
        group.appendChild(ctrl);
        parentCard.appendChild(group);
      }

      addField(basicCard, {
        id: 'fc-persona-field-name',
        label: '角色姓名 *',
        multiline: false,
        maxLength: 40,
        placeholder: '输入角色姓名（支持重名角色，系统以唯一 ID 区分）',
        getValue: function() { return draft.name; },
        setValue: function(v) { draft.name = v; }
      });

      eBody.appendChild(basicCard);

      var detailCard = el('section', 'fc-settings-card');
      var detailHead = el('div', 'fc-settings-card-head');
      detailHead.appendChild(el('span', 'fc-settings-card-title', '人物设定档案'));
      detailHead.appendChild(el('span', 'fc-settings-card-tag', '多作品复用'));
      detailCard.appendChild(detailHead);

      addField(detailCard, {
        id: 'fc-persona-field-personality',
        label: '性格',
        multiline: true,
        rows: 3,
        maxLength: 1200,
        placeholder: '性格特点、处事习惯、情绪反差……',
        getValue: function() { return draft.personality; },
        setValue: function(v) { draft.personality = v; }
      });
      addField(detailCard, {
        id: 'fc-persona-field-background',
        label: '身份背景',
        multiline: true,
        rows: 3,
        maxLength: 2000,
        placeholder: '职业身份、所属组织、生活环境或社会关系……',
        getValue: function() { return draft.background; },
        setValue: function(v) { draft.background = v; }
      });
      addField(detailCard, {
        id: 'fc-persona-field-speaking',
        label: '说话风格',
        multiline: true,
        rows: 2,
        maxLength: 1000,
        placeholder: '口头禅、用词偏好、打字或表达节奏……',
        getValue: function() { return draft.speakingStyle; },
        setValue: function(v) { draft.speakingStyle = v; }
      });
      addField(detailCard, {
        id: 'fc-persona-field-experience',
        label: '角色经历',
        multiline: true,
        rows: 3,
        maxLength: 2000,
        placeholder: '关键人生经历、重要转折或过往事件……',
        getValue: function() { return draft.experience; },
        setValue: function(v) { draft.experience = v; }
      });
      addField(detailCard, {
        id: 'fc-persona-field-notes',
        label: '备注',
        multiline: true,
        rows: 2,
        maxLength: 1500,
        placeholder: '补充标签、雷区提醒或适用题材备注……',
        getValue: function() { return draft.notes; },
        setValue: function(v) { draft.notes = v; }
      });
      eBody.appendChild(detailCard);

      // 世界书绑定卡片（全局自动继承 + 自主挂载局部世界书）
      var loreCard = el('section', 'fc-settings-card fc-persona-lorebook-card');
      loreCard.id = 'fc-persona-lorebook-card';
      var loreHead = el('div', 'fc-settings-card-head');
      loreHead.appendChild(el('span', 'fc-settings-card-title', '世界书'));
      loreHead.appendChild(el('span', 'fc-settings-card-tag', '全局继承 · 局部挂载'));
      loreCard.appendChild(loreHead);

      var globalBlock = el('div', 'fc-persona-lb-global-box');
      var globalTitleRow = el('div', 'fc-persona-lb-row-top');
      globalTitleRow.appendChild(el('strong', 'fc-persona-lb-subtitle', '全局世界书'));
      var globalStatusPill = el('span', 'fc-persona-lb-status-pill is-auto', '自动继承');
      globalStatusPill.id = 'fc-persona-lb-global-count';
      globalTitleRow.appendChild(globalStatusPill);
      globalBlock.appendChild(globalTitleRow);
      globalBlock.appendChild(el('p', 'fc-persona-lb-desc', '弯弯机中已开启的全局世界书将由公共人设自动继承生效，与角色名称无关。'));
      loreCard.appendChild(globalBlock);

      var localSubhead = el('div', 'fc-settings-subhead fc-persona-lb-local-head');
      localSubhead.appendChild(el('span', 'fc-settings-subhead-title', '局部世界书'));
      var addLorebookBtn = el('button', 'fc-settings-mini-btn primary', '＋ 添加局部世界书');
      addLorebookBtn.type = 'button';
      addLorebookBtn.id = 'fc-persona-add-lorebook-btn';
      localSubhead.appendChild(addLorebookBtn);
      loreCard.appendChild(localSubhead);

      var boundListEl = el('div', 'fc-persona-lb-list');
      boundListEl.id = 'fc-persona-lorebook-list';
      loreCard.appendChild(boundListEl);

      async function refreshWorldbookSection() {
        var books = await readAvailableLorebooks();
        if (!editorPanel.classList.contains('show') || editorToken !== renderSeq) return;

        var enabledGlobalCount = 0;
        var bookMap = Object.create(null);
        for (var i = 0; i < books.length; i++) {
          var b = books[i];
          if (!b || !b.id) continue;
          bookMap[String(b.id)] = b;
          if (b.scope === 'global' && b.enabled) {
            enabledGlobalCount++;
          }
        }
        globalStatusPill.textContent = enabledGlobalCount > 0
          ? ('自动继承 · ' + enabledGlobalCount + ' 本已启用')
          : '自动继承（当前 0 本启用）';

        boundListEl.replaceChildren();
        draft.lorebookIds = dedupeStringIds(draft.lorebookIds);

        if (!draft.lorebookIds.length) {
          var emptyNote = el('div', 'fc-persona-lb-empty', '暂未挂载局部世界书，可点击右上角「添加局部世界书」进行多选关联。');
          boundListEl.appendChild(emptyNote);
          return;
        }

        draft.lorebookIds.forEach(function(bookId) {
          var matched = bookMap[String(bookId)] || null;
          var itemEl = el('div', 'fc-persona-lb-item');
          itemEl.dataset.lorebookId = bookId;

          var mainCol = el('div', 'fc-persona-lb-item-main');
          var titleRow = el('div', 'fc-persona-lb-item-title-row');

          if (!matched) {
            itemEl.classList.add('is-stale');
            titleRow.appendChild(el('strong', 'fc-persona-lb-item-name', '原世界书已删除'));
            var staleBadge = el('span', 'fc-persona-lb-status-pill is-warn', '已失效');
            titleRow.appendChild(staleBadge);
            mainCol.appendChild(titleRow);
            mainCol.appendChild(el('div', 'fc-persona-lb-item-meta', '原关联世界书（ID ' + String(bookId).slice(-8) + '）已不存在，AI 请求时会自动跳过。'));
          } else if (matched.scope !== 'personal') {
            titleRow.appendChild(el('strong', 'fc-persona-lb-item-name', matched.name || '未命名世界书'));
            var globalChangedBadge = el('span', 'fc-persona-lb-status-pill is-auto', '已改为全局');
            titleRow.appendChild(globalChangedBadge);
            mainCol.appendChild(titleRow);
            var gCount = Array.isArray(matched.entries) ? matched.entries.length : 0;
            mainCol.appendChild(el('div', 'fc-persona-lb-item-meta', gCount + ' 个条目 · 已转为全局世界书自动继承'));
          } else {
            titleRow.appendChild(el('strong', 'fc-persona-lb-item-name', matched.name || '未命名局部世界书'));
            var stateBadge = el('span', 'fc-persona-lb-status-pill ' + (matched.enabled ? 'is-enabled' : 'is-disabled'), matched.enabled ? '已启用' : '已关闭');
            titleRow.appendChild(stateBadge);
            mainCol.appendChild(titleRow);
            var entryCount = Array.isArray(matched.entries) ? matched.entries.length : 0;
            var metaText = entryCount + ' 个条目' + (matched.enabled ? ' · 每次生成自动读取最新内容' : ' · 当前已关闭，生成时跳过生效');
            mainCol.appendChild(el('div', 'fc-persona-lb-item-meta', metaText));
          }

          var unbindBtn = el('button', 'fc-persona-lb-unbind-btn', matched ? '解除挂载' : '移除关联');
          unbindBtn.type = 'button';
          unbindBtn.setAttribute('aria-label', '解除世界书挂载');
          unbindBtn.onclick = function() {
            draft.lorebookIds = draft.lorebookIds.filter(function(id) { return String(id) !== String(bookId); });
            refreshWorldbookSection();
          };

          itemEl.appendChild(mainCol);
          itemEl.appendChild(unbindBtn);
          boundListEl.appendChild(itemEl);
        });
      }

      async function openLorebookPickerSheet() {
        var books = await readAvailableLorebooks();
        var personalBooks = books.filter(function(b) {
          return b && b.id && b.scope === 'personal';
        });
        var selectedSet = Object.create(null);
        dedupeStringIds(draft.lorebookIds).forEach(function(id) {
          selectedSet[String(id)] = true;
        });
        var pickerQuery = '';

        openSheet('选择局部世界书', function(body) {
          body.appendChild(el('p', 'fc-chat-sheet-note fc-persona-lb-picker-tip', '从弯弯机世界书库挑选要挂载到该公共人设的局部世界书（支持多选，不改变原世界书绑定对象）。'));

          var searchWrapEl = el('div', 'fc-persona-lb-picker-search-wrap');
          var searchInputEl = document.createElement('input');
          searchInputEl.type = 'search';
          searchInputEl.id = 'fc-persona-lb-search';
          searchInputEl.className = 'fc-persona-lb-picker-search';
          searchInputEl.placeholder = '按世界书名称筛选…';
          searchInputEl.setAttribute('aria-label', '按世界书名称筛选');
          searchWrapEl.appendChild(searchInputEl);
          body.appendChild(searchWrapEl);

          var listWrap = el('div', 'fc-persona-lb-picker-list');
          listWrap.id = 'fc-persona-lb-picker-list';
          body.appendChild(listWrap);

          var actions = el('div', 'fc-chat-sheet-actions');
          var pickerCancel = el('button', 'fc-chat-btn alt', '取消');
          pickerCancel.type = 'button';
          pickerCancel.onclick = closeSheet;

          var pickerConfirm = el('button', 'fc-chat-btn', '确认挂载');
          pickerConfirm.type = 'button';
          pickerConfirm.id = 'fc-persona-lb-confirm';
          actions.appendChild(pickerCancel);
          actions.appendChild(pickerConfirm);
          body.appendChild(actions);

          function countSelected() {
            var c = 0;
            Object.keys(selectedSet).forEach(function(k) {
              if (selectedSet[k]) c++;
            });
            return c;
          }

          function syncConfirmLabel() {
            var n = countSelected();
            pickerConfirm.textContent = n > 0 ? ('确认挂载 (' + n + ')') : '确认挂载';
          }

          function drawPickerRows() {
            listWrap.replaceChildren();
            if (!personalBooks.length) {
              var emptyState = el('div', 'fc-persona-lb-picker-empty', '弯弯机世界书库中暂无局部（personal）世界书，请先在「世界书」中创建。');
              listWrap.appendChild(emptyState);
              return;
            }
            var q = pickerQuery.trim().toLowerCase();
            var filteredBooks = personalBooks.filter(function(b) {
              if (!q) return true;
              var nameMatch = String(b.name || '').toLowerCase().indexOf(q) !== -1;
              if (nameMatch) return true;
              var entries = Array.isArray(b.entries) ? b.entries : [];
              for (var j = 0; j < entries.length; j++) {
                var en = entries[j];
                if (en && String(en.title || '').toLowerCase().indexOf(q) !== -1) return true;
              }
              return false;
            });

            if (!filteredBooks.length) {
              listWrap.appendChild(el('div', 'fc-persona-lb-picker-empty', '未找到名称包含「' + pickerQuery.trim() + '」的局部世界书。'));
              return;
            }

            filteredBooks.forEach(function(book) {
              var bid = String(book.id);
              var isSelected = Boolean(selectedSet[bid]);
              var optBtn = el('button', 'fc-persona-lb-option' + (isSelected ? ' is-selected' : ''));
              optBtn.type = 'button';
              optBtn.dataset.pickBookId = bid;

              var checkBox = el('span', 'fc-persona-lb-check', isSelected ? '✓' : '');
              checkBox.setAttribute('aria-hidden', 'true');

              var info = el('div', 'fc-persona-lb-option-main');
              var rowTop = el('div', 'fc-persona-lb-item-title-row');
              rowTop.appendChild(el('strong', 'fc-persona-lb-item-name', book.name || '未命名世界书'));
              rowTop.appendChild(el('span', 'fc-persona-lb-status-pill ' + (book.enabled ? 'is-enabled' : 'is-disabled'), book.enabled ? '已启用' : '已关闭'));
              info.appendChild(rowTop);

              var entryCount = Array.isArray(book.entries) ? book.entries.length : 0;
              var enabledEntries = Array.isArray(book.entries)
                ? book.entries.filter(function(en) { return en && en.enabled; }).length
                : 0;
              info.appendChild(el('div', 'fc-persona-lb-item-meta', '共 ' + entryCount + ' 条（' + enabledEntries + ' 条已开启）'));

              optBtn.appendChild(checkBox);
              optBtn.appendChild(info);
              optBtn.onclick = function() {
                if (selectedSet[bid]) {
                  delete selectedSet[bid];
                } else {
                  selectedSet[bid] = true;
                }
                optBtn.classList.toggle('is-selected', Boolean(selectedSet[bid]));
                checkBox.textContent = selectedSet[bid] ? '✓' : '';
                syncConfirmLabel();
              };
              listWrap.appendChild(optBtn);
            });
          }

          searchInputEl.addEventListener('input', function() {
            pickerQuery = searchInputEl.value || '';
            drawPickerRows();
          });

          pickerConfirm.onclick = function() {
            var nextIds = [];
            // 保留原本存在但已失效/改为全局的顺序，同时按当前选择更新有效局部世界书
            var personalIdMap = Object.create(null);
            personalBooks.forEach(function(b) { personalIdMap[String(b.id)] = true; });

            personalBooks.forEach(function(b) {
              var bid = String(b.id);
              if (selectedSet[bid]) nextIds.push(bid);
            });
            draft.lorebookIds.forEach(function(oldId) {
              var oid = String(oldId);
              if (!personalIdMap[oid] && selectedSet[oid]) {
                nextIds.push(oid);
              }
            });
            draft.lorebookIds = dedupeStringIds(nextIds);
            closeSheet();
            refreshWorldbookSection();
          };

          syncConfirmLabel();
          drawPickerRows();
        });
      }

      addLorebookBtn.onclick = function() {
        openLorebookPickerSheet();
      };

      eBody.appendChild(loreCard);
      refreshWorldbookSection();

      var eFoot = el('div', 'fc-settings-foot');
      var cancelBtn = el('button', 'fc-chat-btn alt', '取消');
      cancelBtn.type = 'button';
      cancelBtn.id = 'fc-persona-editor-cancel';
      cancelBtn.onclick = closeEditor;

      var saveBtn = el('button', 'fc-chat-btn', isEdit ? '保存修改' : '保存人设');
      saveBtn.type = 'button';
      saveBtn.id = 'fc-persona-editor-save';
      saveBtn.onclick = async function() {
        var cleanName = String(draft.name || '').trim();
        if (!cleanName) {
          notify('请输入角色姓名');
          var nameInputEl = document.getElementById('fc-persona-field-name');
          if (nameInputEl) nameInputEl.focus();
          return;
        }

        var nextAvatarAssetId = draft.existingAvatarId || '';
        saveBtn.disabled = true;
        try {
          if (draft.avatarMode === 'replace' && draft.avatarDataUrl) {
            var aApi = assetsApi();
            if (!aApi) {
              notify('本地素材存储模块不可用');
              return;
            }
            var savedAsset = await aApi.putAsset({
              id: aApi.uid('avt_'),
              name: draft.avatarFileName || cleanName,
              src: draft.avatarDataUrl,
              kind: 'persona_avatar'
            });
            nextAvatarAssetId = savedAsset.id;
          } else if (draft.avatarMode === 'clear') {
            nextAvatarAssetId = '';
          }

          var payload = {
            name: cleanName,
            avatarAssetId: nextAvatarAssetId,
            personality: draft.personality,
            background: draft.background,
            speakingStyle: draft.speakingStyle,
            experience: draft.experience,
            notes: draft.notes,
            lorebookIds: dedupeStringIds(draft.lorebookIds)
          };

          var res = isEdit ? updatePersona(existingPersona.id, payload) : createPersona(payload);
          if (!res.ok) {
            notify(res.error || '保存失败');
            return;
          }

          closeEditor();
          drawPersonas();
          notify(isEdit ? '已更新人设资料' : '已创建公共人设');
        } catch (err) {
          notify(err && err.message ? err.message : '保存人设失败');
        } finally {
          saveBtn.disabled = false;
        }
      };

      eFoot.appendChild(cancelBtn);
      eFoot.appendChild(saveBtn);

      editorPanel.appendChild(eHead);
      editorPanel.appendChild(eBody);
      editorPanel.appendChild(eFoot);
      editorPanel.classList.add('show');
      editorPanel.setAttribute('aria-hidden', 'false');
    }

    function openDeleteConfirmSheet(persona) {
      var wApi = worksApi();
      var refCount = wApi && typeof wApi.countWorksUsingPersona === 'function'
        ? wApi.countWorksUsingPersona(persona.id)
        : 0;

      openSheet('删除公共人设', function(body) {
        var preview = el('div', 'fc-chat-confirm-preview');
        preview.appendChild(el('strong', '', persona.name));
        if (persona.background || persona.personality) {
          preview.appendChild(el('p', 'fc-persona-confirm-sub', (persona.background || persona.personality).slice(0, 60)));
        }

        var warnText = refCount > 0
          ? ('当前有 ' + refCount + ' 部「捡手机文学」作品正在引用该角色。删除后将安全解除引用绑定，不会删除任何作品的聊天记录或作品专属 AI 设定。')
          : '删除后将从同好社区公共人设库中移除该角色资料，不会影响已有作品的聊天记录。';

        var actions = el('div', 'fc-chat-sheet-actions');
        var cancelBtn = el('button', 'fc-chat-btn alt', '取消');
        cancelBtn.type = 'button';
        cancelBtn.onclick = closeSheet;

        var confirmBtn = el('button', 'fc-chat-btn danger', '确认删除');
        confirmBtn.type = 'button';
        confirmBtn.id = 'fc-persona-delete-confirm';
        confirmBtn.onclick = function() {
          var res = deletePersona(persona.id);
          closeSheet();
          if (!res.ok) {
            notify(res.error || '删除失败');
            return;
          }
          drawPersonas();
          if (res.unboundCount > 0) {
            notify('已删除人设，并安全解除 ' + res.unboundCount + ' 部作品的绑定');
          } else {
            notify('已删除公共人设');
          }
        };

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);

        body.appendChild(preview);
        body.appendChild(el('p', 'fc-chat-sheet-note', warnText));
        body.appendChild(actions);
      });
    }

    function drawPersonas() {
      var token = ++renderSeq;
      scrollEl.replaceChildren();
      var allPersonas = listPersonas();
      var filtered = searchPersonas(searchQuery);

      var intro = el('div', 'fc-works-intro');
      var introLeft = el('div', '');
      introLeft.appendChild(el('div', 'fc-works-eyebrow', 'COMMUNITY PERSONA LIBRARY'));
      introLeft.appendChild(el('div', 'fc-works-sub', '整个同好社区共用的基础角色资料库'));
      intro.appendChild(introLeft);
      intro.appendChild(el('span', 'fc-works-count', '共 ' + allPersonas.length + ' 位'));
      scrollEl.appendChild(intro);

      if (!allPersonas.length) {
        var empty = el('div', 'fc-works-empty');
        empty.appendChild(el('h3', '', '还没有公共人设'));
        empty.appendChild(el('p', '', '创建一个可重复使用的角色人设，供捡手机文学与后续社区模块随时引用。'));
        var cta = el('button', 'fc-works-empty-btn', '＋ 创建第一个人设');
        cta.type = 'button';
        cta.id = 'fc-persona-empty-new-btn';
        cta.onclick = function() { openEditor(null); };
        empty.appendChild(cta);
        scrollEl.appendChild(empty);
        return;
      }

      if (!filtered.length) {
        var noMatch = el('div', 'fc-works-empty');
        noMatch.appendChild(el('h3', '', '未找到匹配的角色'));
        noMatch.appendChild(el('p', '', '没有姓名包含「' + searchQuery.trim() + '」的人设，可以清空搜索词查看全部角色。'));
        var resetSearchBtn = el('button', 'fc-works-empty-btn', '查看全部人设');
        resetSearchBtn.type = 'button';
        resetSearchBtn.onclick = function() {
          searchQuery = '';
          searchInput.value = '';
          clearSearchBtn.hidden = true;
          drawPersonas();
        };
        noMatch.appendChild(resetSearchBtn);
        scrollEl.appendChild(noMatch);
        return;
      }

      var listEl = el('div', 'fc-persona-list');
      listEl.id = 'fc-persona-list';

      var wApi = worksApi();

      filtered.forEach(function(persona) {
        var card = el('article', 'fc-persona-card');
        card.dataset.personaId = persona.id;

        var topRow = el('div', 'fc-persona-card-top');
        var avatarBox = el('div', 'fc-persona-avatar');
        renderAvatarBox(avatarBox, persona.avatarAssetId, function() {
          return token === renderSeq && document.body.contains(app);
        });

        var infoCol = el('div', 'fc-persona-info');
        var nameRow = el('div', 'fc-persona-name-row');
        nameRow.appendChild(el('strong', 'fc-persona-name', persona.name));

        var refCount = wApi && typeof wApi.countWorksUsingPersona === 'function'
          ? wApi.countWorksUsingPersona(persona.id)
          : 0;
        if (refCount > 0) {
          nameRow.appendChild(el('span', 'fc-persona-ref-meta', '已关联 ' + refCount + ' 部作品'));
        }
        var lbCount = Array.isArray(persona.lorebookIds) ? persona.lorebookIds.length : 0;
        if (lbCount > 0) {
          nameRow.appendChild(el('span', 'fc-persona-ref-meta is-lorebook', '世界书 ' + lbCount));
        }
        infoCol.appendChild(nameRow);

        var summaryParts = [];
        if (persona.background) summaryParts.push(persona.background);
        if (persona.personality) summaryParts.push(persona.personality);
        var summaryText = summaryParts.join(' · ') || '暂无性格与身份背景描述';
        infoCol.appendChild(el('p', 'fc-persona-summary', summaryText));

        var metaLine = '更新于 ' + formatTime(persona.updatedAt) + ' · ID ' + persona.id.slice(-6);
        infoCol.appendChild(el('div', 'fc-persona-meta', metaLine));

        topRow.appendChild(avatarBox);
        topRow.appendChild(infoCol);

        var cardActions = el('div', 'fc-persona-card-actions');
        var editBtn = el('button', 'fc-work-rename-btn fc-persona-edit-btn', '编辑');
        editBtn.type = 'button';
        editBtn.onclick = function() {
          openEditor(persona);
        };

        var delBtn = el('button', 'fc-persona-delete-btn', '删除');
        delBtn.type = 'button';
        delBtn.onclick = function() {
          openDeleteConfirmSheet(persona);
        };

        cardActions.appendChild(editBtn);
        cardActions.appendChild(delBtn);

        card.appendChild(topRow);
        card.appendChild(cardActions);
        listEl.appendChild(card);
      });

      scrollEl.appendChild(listEl);
    }

    searchInput.addEventListener('input', function() {
      searchQuery = searchInput.value;
      clearSearchBtn.hidden = !searchQuery;
      drawPersonas();
    });

    clearSearchBtn.addEventListener('click', function() {
      searchQuery = '';
      searchInput.value = '';
      clearSearchBtn.hidden = true;
      drawPersonas();
      searchInput.focus();
    });

    backBtn.onclick = function() {
      container.replaceChildren();
      onBack();
    };

    newBtn.onclick = function() {
      openEditor(null);
    };

    app.appendChild(head);
    app.appendChild(searchWrap);
    app.appendChild(scrollEl);
    app.appendChild(editorPanel);
    app.appendChild(sheetBack);
    container.appendChild(app);

    drawPersonas();
  }

  global.FanCommunityPersonas = {
    STORAGE_KEY: STORAGE_KEY,
    VALID_ROLE_SOURCES: VALID_ROLE_SOURCES.slice(),
    normalizeRoleRef: normalizeRoleRef,
    getRoleSourceLabel: getRoleSourceLabel,
    listPersonas: listPersonas,
    getPersona: getPersona,
    searchPersonas: searchPersonas,
    listArchiveRoles: listArchiveRoles,
    getArchiveRole: getArchiveRole,
    resolveRoleRef: resolveRoleRef,
    renderRoleAvatarBox: renderRoleAvatarBox,
    createPersona: createPersona,
    updatePersona: updatePersona,
    deletePersona: deletePersona,
    isAssetReferenced: isAssetReferenced,
    renderAvatarBox: renderAvatarBox,
    openLibrary: openLibrary
  };
})(window);
