// js/heartbeat-live.js — 心动直播 V1.0 正式引擎
// 集成真实 Char 人设、世界书、只读长期记忆与万象镜经历、真实 AI 对话、
// Minimax TTS、Web Speech API、共享经济礼物、ASMR 本地音频库与直播手账。

(function(global) {
  'use strict';

  var PAGE_ID = 'heartbeat-live-page';
  var THEME_KEYS = ['cloud', 'moon', 'garden', 'cafe'];
  var THEME_LABELS = { cloud: '云朵粉紫', moon: '月夜星空', garden: '四季花园', cafe: '暖光咖啡' };

  var REPLAY_PAGE_SIZE = 40;
  var AI_QUEUE_LIMIT = 4;

  var _state = {
    pageEl: null,
    activeView: 'home', // 'home' | 'live' | 'diary' | 'replay' | 'settings'
    chars: [],
    invitees: [], // Char + NPC 完整可邀请列表
    user: { id: 0, name: '我', avatar: '', description: '' },
    selectedCharId: '',
    selectedHostId: '',
    selectedCharManageId: '',
    settings: null,
    portraitOptions: {},
    followedChars: {},
    charVoices: {},
    asmrTracks: [],
    cloudCatalog: [],
    cloudManifestUrl: '',
    journals: [],
    customBgSrc: '',
    // 当前直播间运行时状态
    room: null,
    messagesAutoFollow: true,
    unreadWhileScrolled: 0,
    // 大音频导入与云端缓存任务状态
    importBusy: false,
    importProgressPct: 0,
    importProgressText: '',
    cloudSyncBusy: false,
    cloudCachingIds: {},
    // 悬浮小窗与回放状态
    minimized: false,
    miniEl: null,
    miniPos: null,
    replayJournal: null,
    replayReturnView: 'diary',
    replayIncludeSim: true,
    replayOffset: 0,
    replayLoaded: [],
    replayMeta: null,
    // 角色开播选择器与多人邀请/送礼筛选状态
    rolePickerFilter: 'all', // 'all' | 'char' | 'npc'
    rolePickerSearch: '',
    inviteFilterType: 'all', // 'all' | 'char' | 'npc'
    inviteSearchQuery: '',
    selectedGiftRecipientId: '',
    // 抽屉与弹窗
    openModal: '', // '' | 'planner' | 'rolePicker' | 'connect' | 'gift' | 'interact' | 'memory' | 'userHost' | 'summary'
    plannerPendingMode: 'char',
    plannerHostObj: null,
    plannerEditing: false,
    plannerProgram: 'chat',
    pendingConnectAfterInvite: false,
    selectedGiftId: 'free_spark',
    giftConfirmPending: null,
    giftSubmitting: false,
    memoryDraft: null,
    previewAudioId: '',
    // 连麦媒体与识别句柄
    connectionType: '', // '' | 'text' | 'voice' | 'video' | 'camera'
    connectionLayout: 'floating',
    micStream: null,
    cameraStream: null,
    recognition: null,
    recognizing: false,
    // AI 串行调度队列与定时器防竞态
    aiQueue: [],
    aiRunning: false,
    aiEpoch: 0,
    sessionSeq: 0,
    aiRequestSeq: 0,
    ttsRequestSeq: 0,
    asmrDeadlineMs: 0,
    asmrTimerId: null,
    asmrCurrentTrackIndex: 0,
    asmrDucking: false,
    pushedHistory: false,
    popHandler: null,
    visHandler: null,
    pageHideHandler: null,
    viewportHandler: null
  };

  var _asmrAudioEl = null;
  var _ttsAudioEl = null;
  var _ttsBlobUrl = '';
  var _previewAudioEl = null;
  var _toastTimer = null;
  var _logSaveTimer = null;
  var _importAbortCtrl = null;
  var _cloudAbortMap = {};

  function storage() { return global.HeartbeatLiveStorage; }
  function aiMod() { return global.HeartbeatLiveAI; }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeCssUrl(src) {
    return String(src || '').replace(/["\\()\r\n]/g, '');
  }

  function formatBytes(n) {
    var v = Number(n) || 0;
    if (v < 1024) return v + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
    return (v / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDuration(sec) {
    var s = Math.max(0, Math.round(Number(sec) || 0));
    if (!s) return '时长未知';
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m > 0 ? (m + '分' + (r ? r + '秒' : '')) : (r + '秒');
  }

  function $(sel) {
    return _state.pageEl ? _state.pageEl.querySelector(sel) : null;
  }

  function $$(sel) {
    return _state.pageEl ? Array.from(_state.pageEl.querySelectorAll(sel)) : [];
  }

  function showToast(msg) {
    var text = String(msg || '');
    var el = $('#hl-toast');
    if (!el) {
      if (typeof global.toast === 'function') global.toast(text);
      return;
    }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function() {
      var cur = $('#hl-toast');
      if (cur) cur.classList.remove('show');
    }, 2200);
  }

  function getActiveChar() {
    if (!_state.chars.length) {
      return { id: 'demo_char', rawId: null, roleType: 'char', name: '星野（示例）', avatar: '', emojiFallback: '🌸', gender: '', role: '陪伴者', description: '温柔陪伴型演示角色', status: '', isDemo: true };
    }
    var found = _state.chars.find(function(c) { return String(c.id) === String(_state.selectedCharId); });
    return found || _state.chars[0];
  }

  function getCharById(charId) {
    var cid = String(charId || '');
    return _state.invitees.find(function(c) { return String(c.id) === cid; }) ||
      _state.chars.find(function(c) { return String(c.id) === cid; }) ||
      getActiveChar();
  }

  function syncRoomDerivedFields(r) {
    if (!r) return;
    if (!Array.isArray(r.invitedViewers)) r.invitedViewers = [];
    if (r.hostMode !== 'user' && r.hostMode !== 'private' && r.hostMode !== 'npc') {
      r.hostMode = (r.hostCharObj && r.hostCharObj.roleType === 'npc') ? 'npc' : 'char';
    }
    if (!r.hostType || (r.hostType !== 'user' && r.hostType !== 'char' && r.hostType !== 'npc')) {
      r.hostType = r.hostMode === 'user' ? 'user' : r.hostMode === 'npc' ? 'npc' : 'char';
    }
    if (!r.hostId) {
      r.hostId = r.hostType === 'user'
        ? String((_state.user && _state.user.id) || 'user')
        : String((r.hostCharObj && r.hostCharObj.id) || '');
    }
    if (!r.hostName) {
      r.hostName = r.hostType === 'user'
        ? ((_state.user && _state.user.name) || '我')
        : ((r.hostCharObj && r.hostCharObj.name) || (r.hostType === 'npc' ? 'NPC' : 'Char'));
    }
    if (r.hostMode === 'user') {
      r.charObj = r.cohostCharObj ||
        r.invitedViewers.find(function(v) { return v && v.roleType === 'char'; }) ||
        r.invitedViewers[0] ||
        null;
    } else {
      r.charObj = r.hostCharObj || r.charObj || null;
    }
  }

  function getConnectionPartner(r) {
    if (!r) return null;
    if (r.hostMode === 'user') return r.cohostCharObj || null;
    return r.cohostCharObj || r.hostCharObj || r.charObj || null;
  }

  function getAllRoomActors(r) {
    if (!r) return [];
    var seen = {};
    var list = [];
    var pushUnique = function(item) {
      if (!item || item.id == null || item.id === '') return;
      var k = String(item.id);
      if (seen[k]) return;
      seen[k] = true;
      list.push(item);
    };
    if (r.hostMode !== 'user') {
      pushUnique(r.hostCharObj || r.charObj);
    }
    if (Array.isArray(r.invitedViewers)) {
      for (var i = 0; i < r.invitedViewers.length; i++) {
        pushUnique(r.invitedViewers[i]);
      }
    }
    return list;
  }

  function isActorActiveInRoom(r, actorId) {
    if (!r || !actorId) return false;
    var aid = String(actorId);
    if (Array.isArray(r.invitedViewers) && r.invitedViewers.some(function(v) { return v && String(v.id) === aid; })) {
      return true;
    }
    if (r.cohostCharObj && String(r.cohostCharObj.id) === aid) {
      return true;
    }
    if (r.hostMode !== 'user') {
      var host = r.hostCharObj || r.charObj;
      if (host && String(host.id) === aid) return true;
    }
    return false;
  }

  function getDefaultGiftRecipient(r) {
    if (!r) return null;
    var actors = getAllRoomActors(r);
    if (_state.selectedGiftRecipientId) {
      var picked = actors.find(function(v) { return v && String(v.id) === String(_state.selectedGiftRecipientId); });
      if (picked) return picked;
    }
    if (r.hostMode !== 'user') return r.hostCharObj || r.charObj || null;
    return r.cohostCharObj || actors[0] || null;
  }

  // ===== 音频与流式媒体清理 (硬要求：绝不残留轨道或内存泄漏) =====
  function stopTtsPlayback() {
    _state.ttsRequestSeq++;
    if (_ttsAudioEl) {
      try { _ttsAudioEl.pause(); _ttsAudioEl.src = ''; } catch (_) {}
      _ttsAudioEl = null;
    }
    if (_ttsBlobUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      try { URL.revokeObjectURL(_ttsBlobUrl); } catch (_) {}
    }
    _ttsBlobUrl = '';
    setAsmrDucking(false);
  }

  function stopPreviewAudio() {
    _state.previewAudioId = '';
    if (_previewAudioEl) {
      try { _previewAudioEl.pause(); _previewAudioEl.src = ''; } catch (_) {}
      _previewAudioEl = null;
    }
  }

  function stopAsmrTimerOnly() {
    _state.asmrDeadlineMs = 0;
    if (_state.asmrTimerId) {
      clearInterval(_state.asmrTimerId);
      _state.asmrTimerId = null;
    }
  }

  function stopAsmrPlayback() {
    stopAsmrTimerOnly();
    if (_asmrAudioEl) {
      try { _asmrAudioEl.pause(); _asmrAudioEl.src = ''; } catch (_) {}
      _asmrAudioEl = null;
    }
    _state.asmrDucking = false;
  }

  function syncAsmrVolume() {
    if (!_asmrAudioEl) return;
    var base = Math.max(0, Math.min(1, Number((_state.settings && _state.settings.ambient) || 65) / 100));
    var factor = (_state.asmrDucking && _state.settings && _state.settings.duck) ? 0.25 : 1;
    _asmrAudioEl.volume = Math.max(0, Math.min(1, base * factor));
  }

  function setAsmrDucking(active) {
    _state.asmrDucking = Boolean(active);
    syncAsmrVolume();
  }

  function stopSpeechRecognition() {
    _state.recognizing = false;
    if (_state.recognition) {
      try { _state.recognition.stop(); } catch (_) {}
      _state.recognition = null;
    }
    var dictBtn = $('#hl-voice-dictate');
    if (dictBtn) {
      dictBtn.classList.remove('is-recording');
      dictBtn.textContent = '🎙 语音转写发言';
    }
  }

  function stopMediaTracks() {
    stopSpeechRecognition();
    if (_state.micStream) {
      try { _state.micStream.getTracks().forEach(function(t) { t.stop(); }); } catch (_) {}
      _state.micStream = null;
    }
    if (_state.cameraStream) {
      try { _state.cameraStream.getTracks().forEach(function(t) { t.stop(); }); } catch (_) {}
      _state.cameraStream = null;
    }
    var camEl = $('#hl-user-camera');
    if (camEl) {
      try { camEl.srcObject = null; } catch (_) {}
      camEl.hidden = true;
    }
  }

  function clearAiQueue() {
    _state.aiEpoch++;
    _state.aiQueue = [];
    _state.aiRunning = false;
  }

  function abortAllAudioTransfers() {
    if (_importAbortCtrl) {
      try { _importAbortCtrl.abort(); } catch (_) {}
      _importAbortCtrl = null;
    }
    _state.importBusy = false;
    Object.keys(_cloudAbortMap).forEach(function(k) {
      if (_cloudAbortMap[k]) {
        try { _cloudAbortMap[k].abort(); } catch (_) {}
      }
      delete _cloudAbortMap[k];
    });
    _state.cloudCachingIds = {};
  }

  function cleanupAllMedia() {
    clearAiQueue();
    clearTimeout(_logSaveTimer);
    _logSaveTimer = null;
    abortAllAudioTransfers();
    stopMediaTracks();
    stopTtsPlayback();
    stopAsmrPlayback();
    stopPreviewAudio();
  }

  // ===== 页面视图切换 =====
  function switchView(viewName) {
    _state.activeView = viewName;
    $$('.hl-view').forEach(function(el) {
      el.classList.toggle('active', el.dataset.view === viewName);
    });
    $$('.hl-nav').forEach(function(el) {
      var navView = viewName === 'replay' ? 'diary' : viewName;
      el.classList.toggle('sel', el.dataset.view === navView);
    });
    var nav = $('#hl-nav');
    if (nav) nav.classList.toggle('hidden', viewName === 'live' || viewName === 'replay');
    if (viewName === 'diary') refreshDiaryView();
    if (viewName === 'settings') refreshSettingsView();
    if (viewName === 'home') renderLobbyView();
  }

  function openModal(name) {
    _state.openModal = name || '';
    $$('.hl-planner').forEach(function(el) {
      el.classList.toggle('open', el.dataset.modal === _state.openModal);
    });
  }

  function closeModal() {
    openModal('');
  }

  // ===== 直播大厅渲染 =====
  function renderCharAvatarHtml(c) {
    if (c && c.avatar) {
      return '<img src="' + esc(c.avatar) + '" alt="' + esc(c.name) + '">';
    }
    return esc((c && c.emojiFallback) || '🌸');
  }

  async function renderLobbyView() {
    var picker = $('#hl-char-picker');
    var grid = $('#hl-broadcasts');
    if (!grid) return;

    var chars = _state.chars;
    var invitees = (_state.invitees && _state.invitees.length) ? _state.invitees : chars;
    var active = getActiveChar();

    if (picker) {
      if (!invitees.length) {
        picker.innerHTML =
          '<div class="hl-note" style="width:100%">当前角色档案中尚未创建 Char 或 NPC，正在以本地示例展示。' +
          '<button type="button" class="hl-ghost" id="hl-goto-chars" style="margin-left:8px;padding:4px 9px;font-size:11px">前往新建角色</button></div>';
        var goBtn = $('#hl-goto-chars');
        if (goBtn) {
          goBtn.onclick = function() {
            close();
            if (typeof global.showCharacterPage === 'function') global.showCharacterPage();
          };
        }
      } else {
        var curHighlightId = _state.selectedHostId || active.id;
        picker.innerHTML = invitees.map(function(c) {
          var sel = String(c.id) === String(curHighlightId);
          var pill = c.roleType === 'npc' ? 'NPC' : 'Char';
          return '<button type="button" class="hl-char-chip' + (sel ? ' selected' : '') + '" data-pick-char="' + esc(c.id) + '" data-role-type="' + esc(c.roleType || 'char') + '">' +
            '<span class="hl-chip-avatar">' + renderCharAvatarHtml(c) + '</span>' +
            '<span>' + esc(c.name) + '</span>' +
            '<em class="hl-role-pill ' + esc(c.roleType === 'npc' ? 'npc' : 'char') + '">' + pill + '</em>' +
          '</button>';
        }).join('');
        $$('[data-pick-char]').forEach(function(btn) {
          btn.onclick = function() {
            var picked = invitees.find(function(x) { return String(x.id) === String(btn.dataset.pickChar); });
            if (!picked) return;
            _state.selectedHostId = String(picked.id);
            if (picked.roleType !== 'npc') {
              _state.selectedCharId = String(picked.id);
            }
            openPlannerModal(picked.roleType === 'npc' ? 'npc' : 'char', false, picked);
          };
        });
      }
    }

    var displayChars = chars.length ? chars.slice(0, 5) : [active];
    var cardHtml = [];
    for (var i = 0; i < displayChars.length; i++) {
      var c = displayChars[i];
      var customSrc = storage() ? await storage().loadPortraitSrc(c.id) : '';
      var coverSrc = customSrc || c.avatar || '';
      var thumbCls = 'hl-thumb' + (i % 3 === 1 ? ' t2' : i % 3 === 2 ? ' t3' : '');
      var subRole = c.role ? (c.role + ' · 随时开播') : '真实 Char 人设已连接';
      cardHtml.push(
        '<button type="button" class="hl-broadcast" data-start-char="' + esc(c.id) + '">' +
          '<div class="' + thumbCls + '">' +
            (coverSrc ? '<img class="hl-thumb-img" src="' + esc(coverSrc) + '" alt="' + esc(c.name) + '">' : '<span class="hl-avatar-glyph">' + esc(c.emojiFallback || '🌸') + '</span>') +
            '<div class="hl-thumb-scrim"></div>' +
            '<span class="hl-liveflag">LIVE</span>' +
            '<span class="hl-count">' + (c.isDemo ? '本地示例' : '可连麦') + '</span>' +
          '</div>' +
          '<div class="hl-meta">' +
            '<b>' + esc(c.name) + ' 的直播间</b>' +
            '<small>' + esc(subRole) + '</small>' +
          '</div>' +
        '</button>'
      );
    }

    var userSrc = storage() ? await storage().loadPortraitSrc('user') : '';
    var userCover = userSrc || (_state.user && _state.user.avatar) || '';
    cardHtml.push(
      '<button type="button" class="hl-broadcast" id="hl-card-user-live">' +
        '<div class="hl-thumb tuser">' +
          (userCover ? '<img class="hl-thumb-img" src="' + esc(userCover) + '" alt="我来开播">' : '<span class="hl-avatar-glyph">🎀</span>') +
          '<div class="hl-thumb-scrim"></div>' +
          '<span class="hl-count">🎤 我当主播</span>' +
        '</div>' +
        '<div class="hl-meta">' +
          '<b>换我来开播</b>' +
          '<small>直接开播 · 可随时邀请 Char</small>' +
        '</div>' +
      '</button>'
    );

    grid.innerHTML = cardHtml.join('');

    $$('[data-start-char]').forEach(function(btn) {
      btn.onclick = function() {
        _state.selectedCharId = btn.dataset.startChar;
        _state.selectedHostId = btn.dataset.startChar;
        var foundChar = _state.chars.find(function(x) { return String(x.id) === String(btn.dataset.startChar); }) || getActiveChar();
        openPlannerModal('char', false, foundChar);
      };
    });
    var uCard = $('#hl-card-user-live');
    if (uCard) {
      uCard.onclick = function() { startUserSoloLive(); };
    }
  }

  function getFilteredRolePickerList() {
    var list = Array.isArray(_state.invitees) ? _state.invitees : [];
    var fType = _state.rolePickerFilter || 'all';
    var q = String(_state.rolePickerSearch || '').trim().toLowerCase();
    return list.filter(function(item) {
      if (!item || !item.id || !item.name) return false;
      var roleType = item.roleType === 'npc' ? 'npc' : 'char';
      if (fType !== 'all' && roleType !== fType) return false;
      if (q) {
        var hay = (item.name + ' ' + (item.role || '') + ' ' + (item.group || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function renderRolePickerBody() {
    var listEl = $('#hl-rolepicker-list');
    var countEl = $('#hl-rolepicker-summary');
    if (!listEl) return;

    var allRoles = Array.isArray(_state.invitees) ? _state.invitees : [];
    var charCount = allRoles.filter(function(c) { return c && c.roleType !== 'npc'; }).length;
    var npcCount = allRoles.filter(function(c) { return c && c.roleType === 'npc'; }).length;
    if (countEl) {
      countEl.textContent = '共发现 ' + charCount + ' 位 Char、' + npcCount + ' 位 NPC（真实角色库数据，NPC 无需微信聊天也可独立开播）';
    }

    var filter = _state.rolePickerFilter || 'all';
    var filtered = getFilteredRolePickerList();
    if (!filtered.length) {
      var emptyMsg = filter === 'npc'
        ? (npcCount === 0
            ? '当前角色档案中还没有已创建的 NPC（type=npc），不会编造或伪造虚构 NPC；可先前往新建角色，或切换「Char」/「全部」查看已有角色。'
            : '没有搜索到匹配的 NPC，请清空搜索关键词试试。')
        : filter === 'char'
          ? (charCount === 0
              ? '当前角色档案中尚未创建 Char（type=char），请先前往新建角色。'
              : '没有搜索到匹配的 Char，请清空搜索关键词试试。')
          : (allRoles.length === 0
              ? '当前角色档案中尚未创建 Char 或 NPC，请先前往新建角色后再开播。'
              : '没有匹配的角色，请更换关键词或切换筛选页签。');
      listEl.innerHTML =
        '<div class="hl-empty-roles">' +
          '<p>' + esc(emptyMsg) + '</p>' +
          '<button type="button" class="hl-ghost" id="hl-rolepicker-goto-chars" style="padding:6px 11px;font-size:11px">前往角色管理</button>' +
        '</div>';
      var gotoBtn = $('#hl-rolepicker-goto-chars');
      if (gotoBtn) {
        gotoBtn.onclick = function() {
          closeModal();
          close(false);
          if (typeof global.showCharacterPage === 'function') global.showCharacterPage();
        };
      }
      return;
    }

    listEl.innerHTML = filtered.map(function(c) {
      var isNpc = c.roleType === 'npc';
      var typeBadge = isNpc ? 'NPC' : 'Char';
      var descLine = [c.role || c.group || '', isNpc ? '独立开播 · 不读 Char 私聊与记忆' : '真实档案 · 可连麦与手账'].filter(Boolean).join(' · ');
      return '<div class="hl-role-card" data-role-card="' + esc(c.id) + '" data-role-type="' + esc(c.roleType) + '">' +
        '<div class="hl-role-card-avatar">' + renderCharAvatarHtml(c) + '</div>' +
        '<div class="hl-role-card-info">' +
          '<div class="hl-role-card-head"><b>' + esc(c.name) + '</b><em class="hl-role-pill ' + esc(c.roleType) + '">' + typeBadge + '</em></div>' +
          '<small>' + esc(descLine) + '</small>' +
        '</div>' +
        '<button type="button" class="hl-pinkbtn hl-role-start-btn" data-role-start="' + esc(c.id) + '">开播</button>' +
      '</div>';
    }).join('');

    $$('[data-role-start]').forEach(function(btn) {
      btn.onclick = function() {
        var rid = btn.dataset.roleStart;
        var found = allRoles.find(function(c) { return String(c.id) === String(rid); });
        if (!found) {
          showToast('未找到该角色档案，请刷新角色列表');
          return;
        }
        _state.selectedHostId = String(found.id);
        if (found.roleType !== 'npc') {
          _state.selectedCharId = String(found.id);
        }
        closeModal();
        openPlannerModal(found.roleType === 'npc' ? 'npc' : 'char', false, found);
      };
    });
  }

  async function openRolePickerModal(presetFilter) {
    if (aiMod()) {
      _state.chars = await aiMod().loadAvailableChars();
      _state.invitees = typeof aiMod().loadAvailableInvitees === 'function'
        ? await aiMod().loadAvailableInvitees()
        : _state.chars.slice();
    }
    if (presetFilter && ['all', 'char', 'npc'].indexOf(presetFilter) >= 0) {
      _state.rolePickerFilter = presetFilter;
    }
    var searchEl = $('#hl-rolepicker-search');
    if (searchEl) searchEl.value = _state.rolePickerSearch || '';
    $$('[data-role-filter]').forEach(function(tab) {
      tab.classList.toggle('active', tab.dataset.roleFilter === (_state.rolePickerFilter || 'all'));
    });
    renderRolePickerBody();
    openModal('rolePicker');
  }

  function startUserSoloLive() {
    return startLiveRoom({
      hostMode: 'user',
      charObj: null,
      invitedViewers: [],
      program: 'chat',
      title: '我的个人直播间'
    });
  }

  function getFilteredInvitees() {
    var list = (_state.invitees && _state.invitees.length) ? _state.invitees : (_state.chars || []);
    var r = _state.room;
    var activeHostId = (r && r.hostMode !== 'user' && r.hostId) ? String(r.hostId) : '';
    var fType = _state.inviteFilterType || 'all';
    var q = String(_state.inviteSearchQuery || '').trim().toLowerCase();
    return list.filter(function(item) {
      if (!item) return false;
      if (activeHostId && String(item.id) === activeHostId) return false;
      var roleType = item.roleType === 'npc' ? 'npc' : 'char';
      if (fType !== 'all' && roleType !== fType) return false;
      if (q) {
        var hay = (item.name + ' ' + (item.role || '') + ' ' + (item.group || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  async function removeViewerFromUserRoom(actorId) {
    var r = _state.room;
    if (!r || r.hostMode === 'private') return;
    var aid = String(actorId || '');
    var idx = (r.invitedViewers || []).findIndex(function(v) { return String(v.id) === aid; });
    if (idx < 0) return;
    var removed = r.invitedViewers[idx];
    r.invitedViewers.splice(idx, 1);

    // 取消该角色的待发送队列并保护隐私不残留
    _state.aiQueue = (_state.aiQueue || []).filter(function(task) {
      return !task || !task.actor || String(task.actor.id) !== aid;
    });

    // 若该嘉宾正在连麦席位中，优雅断开连麦回到原主播单人舞台
    if (r.cohostCharObj && String(r.cohostCharObj.id) === aid) {
      r.cohostCharObj = null;
      if (_state.connectionType) {
        disconnectCall(true);
        appendRoomMessage({
          senderRole: 'system',
          sender: '连麦结束',
          messageType: 'cohost_event',
          source: 'cohost',
          text: removed.name + ' 已离开直播间，连麦席位已自动关闭。'
        });
      }
    }

    syncRoomDerivedFields(r);
    renderRoomIdentityChrome();
    updateRoomProgramChrome();
    await updateConnectionVisuals();
    updateMiniWindowChrome();

    appendRoomMessage({
      senderRole: 'system',
      sender: '嘉宾离开',
      messageType: 'invite_event',
      source: 'invite',
      text: '已将 ' + removed.name + '（' + (removed.roleType === 'npc' ? 'NPC' : 'Char') + '）移出直播间观众席。'
    });
    showToast('已移除 ' + removed.name);
    if (_state.openModal === 'userHost') renderUserHostModalBody();
  }

  async function inviteCharToUserRoom(actorOrId) {
    var r = _state.room;
    if (!r || r.hostMode === 'private' || !actorOrId) return;
    var actorObj = (typeof actorOrId === 'object')
      ? actorOrId
      : (_state.invitees || []).concat(_state.chars || []).find(function(x) {
          return x && String(x.id) === String(actorOrId);
        });
    if (!actorObj || !actorObj.id) return;
    var aid = String(actorObj.id);
    if (r.hostMode !== 'user' && String(r.hostId) === aid) {
      showToast(actorObj.name + ' 已经是本场主播啦');
      return;
    }
    if (!Array.isArray(r.invitedViewers)) r.invitedViewers = [];
    var already = r.invitedViewers.some(function(v) { return String(v.id) === aid; });
    if (r.hostMode === 'user' && actorObj.roleType !== 'npc') {
      _state.selectedCharId = aid;
    }

    if (!already) {
      var normalized = Object.assign({ joinedAt: Date.now(), roleType: 'char' }, actorObj);
      r.invitedViewers.push(normalized);
      // 重要：受邀观看不等于上麦，也不替换原有主播！
      syncRoomDerivedFields(r);
      renderRoomIdentityChrome();
      updateRoomProgramChrome();
      updateMiniWindowChrome();

      var badgeText = normalized.roleType === 'npc' ? 'NPC' : 'Char';
      var hostTitle = r.hostMode === 'user'
        ? (_state.user.name + ' 正在开个人直播')
        : (r.hostName + '（' + (r.hostType === 'npc' ? 'NPC 主播' : 'Char 主播') + '）正在开播');
      appendRoomMessage({
        senderRole: 'system',
        sender: '嘉宾进场',
        messageType: 'invite_event',
        source: 'invite',
        text: '💌 已邀请 ' + normalized.name + '（' + badgeText + '）进入观众席观看直播！（受邀观看不改变主播身份）'
      });
      showToast('已邀请 ' + normalized.name + ' ♡');
      var progInfo = (aiMod().PROGRAMS[r.program] || aiMod().PROGRAMS.chat);
      enqueueAiTurn(normalized, {
        triggerType: 'opening',
        userPrompt: hostTitle + '（节目：「' + progInfo.label + '」，标题：「' + r.title + '」），刚刚邀请你进入直播间前排观众席观看，请以受邀观众嘉宾视角自然打声招呼（请坚守观众身份，不要自称本场主播）。'
      });
    } else {
      showToast(actorObj.name + ' 已经在直播间观众席里啦 ♡');
    }

    if (_state.pendingConnectAfterInvite) {
      _state.pendingConnectAfterInvite = false;
      closeModal();
      openConnectModal();
    } else if (_state.openModal === 'userHost') {
      renderUserHostModalBody();
    }
  }

  function renderUserHostModalBody() {
    var selectedBar = $('#hl-invite-selected-bar');
    var list = $('#hl-userhost-list');
    if (!list) return;

    var r = _state.room;
    var invited = (r && r.hostMode !== 'private' && Array.isArray(r.invitedViewers))
      ? r.invitedViewers
      : [];

    if (selectedBar) {
      var hostTip = (r && r.hostMode !== 'user')
        ? ('当前主播：' + (r.hostName || '主播') + '（' + (r.hostType === 'npc' ? 'NPC 主播' : 'Char 主播') + '） · ')
        : '';
      if (!invited.length) {
        selectedBar.innerHTML = '<div class="hl-help" style="margin:0">' + esc(hostTip) + '当前还没有受邀观众嘉宾；可多选下方 Char 或 NPC 进入观众席。</div>';
      } else {
        selectedBar.innerHTML =
          '<div class="hl-invite-sel-title"><b>' + esc(hostTip) + '已受邀在本场（' + invited.length + ' 人 · 观众席）</b><button type="button" class="hl-smallbtn" id="hl-invite-clear-all">全部移出</button></div>' +
          '<div class="hl-invite-sel-chips">' +
            invited.map(function(v) {
              return '<span class="hl-invited-chip">' +
                '<em>' + (v.roleType === 'npc' ? 'NPC' : 'Char') + '</em>' +
                '<span>' + esc(v.name) + '</span>' +
                '<button type="button" data-remove-invite="' + esc(v.id) + '" aria-label="移除 ' + esc(v.name) + '">×</button>' +
              '</span>';
            }).join('') +
          '</div>';
        var clearAllBtn = $('#hl-invite-clear-all');
        if (clearAllBtn) {
          clearAllBtn.onclick = async function() {
            var copy = invited.slice();
            for (var i = 0; i < copy.length; i++) {
              await removeViewerFromUserRoom(copy[i].id);
            }
          };
        }
        $$('[data-remove-invite]').forEach(function(btn) {
          btn.onclick = function() {
            removeViewerFromUserRoom(btn.dataset.removeInvite);
          };
        });
      }
    }

    var allRoles = (_state.invitees && _state.invitees.length) ? _state.invitees : (_state.chars || []);
    if (!allRoles.length) {
      list.innerHTML =
        '<div class="hl-note" style="width:100%">当前角色档案中尚未创建 Char 或 NPC，暂无法邀请角色互动；你可以继续使用当前直播间，或前往新建角色。' +
        '<div style="margin-top:8px"><button type="button" class="hl-ghost" id="hl-invite-create-char" style="padding:6px 10px;font-size:11px">前往新建角色</button></div></div>';
      var goBtn = $('#hl-invite-create-char');
      if (goBtn) {
        goBtn.onclick = function() {
          _state.pendingConnectAfterInvite = false;
          closeModal();
          close(false);
          if (typeof global.showCharacterPage === 'function') global.showCharacterPage();
        };
      }
      return;
    }

    var filtered = getFilteredInvitees();
    if (!filtered.length) {
      list.innerHTML = '<div class="hl-help" style="width:100%;padding:8px 0">没有可邀请的其他 Char 或 NPC，请换个关键词或切换筛选标签。</div>';
      return;
    }

    list.innerHTML = filtered.map(function(c) {
      var isInvited = invited.some(function(v) { return String(v.id) === String(c.id); });
      var typeBadge = c.roleType === 'npc' ? 'NPC' : 'Char';
      return '<button type="button" class="hl-char-chip' + (isInvited ? ' selected' : '') + '" data-invite-char="' + esc(c.id) + '" data-role-type="' + esc(c.roleType) + '">' +
        '<span class="hl-chip-avatar">' + renderCharAvatarHtml(c) + '</span>' +
        '<span>' + esc(c.name) + '</span>' +
        '<em class="hl-role-pill ' + esc(c.roleType) + '">' + typeBadge + '</em>' +
        (isInvited ? '<small class="hl-chip-tick">✓</small>' : '') +
      '</button>';
    }).join('');

    $$('[data-invite-char]').forEach(function(btn) {
      btn.onclick = function() {
        var cid = btn.dataset.inviteChar;
        var found = allRoles.find(function(c) { return String(c.id) === String(cid); });
        if (!found) return;
        if (_state.room && _state.room.hostMode !== 'private') {
          var already = (_state.room.invitedViewers || []).some(function(v) { return String(v.id) === String(found.id); });
          if (already) {
            removeViewerFromUserRoom(found.id);
          } else {
            inviteCharToUserRoom(found);
          }
        } else {
          closeModal();
          if (found.roleType !== 'npc') _state.selectedCharId = String(found.id);
          startLiveRoom({
            hostMode: 'user',
            charObj: null,
            invitedViewers: [found],
            program: 'chat'
          });
        }
      };
    });
  }

  function openUserHostPicker() {
    var searchEl = $('#hl-invite-search');
    if (searchEl) searchEl.value = _state.inviteSearchQuery || '';
    $$('[data-invite-filter]').forEach(function(tab) {
      tab.classList.toggle('active', tab.dataset.inviteFilter === (_state.inviteFilterType || 'all'));
    });
    renderUserHostModalBody();
    openModal('userHost');
  }

  // ===== 直播消息独立滚动控制 (暂停自动跟随 + ↓最新消息) =====
  function isMessagesAtBottom(box) {
    if (!box) return true;
    var sh = Number(box.scrollHeight) || 0;
    var ch = Number(box.clientHeight) || 0;
    var st = Number(box.scrollTop) || 0;
    if (sh <= ch) return true;
    return (sh - st - ch) <= 18;
  }

  function syncLatestMsgButton() {
    var btn = $('#hl-latest-msg-btn');
    if (!btn) return;
    if (_state.messagesAutoFollow) {
      btn.hidden = true;
      btn.textContent = '↓ 最新消息';
    } else {
      btn.hidden = false;
      btn.textContent = _state.unreadWhileScrolled > 0
        ? ('↓ 最新消息 (' + _state.unreadWhileScrolled + ')')
        : '↓ 最新消息';
    }
  }

  function scrollMessagesToBottom() {
    var box = $('#hl-messages');
    _state.messagesAutoFollow = true;
    _state.unreadWhileScrolled = 0;
    if (box) {
      box.scrollTop = Number(box.scrollHeight) || 0;
    }
    syncLatestMsgButton();
  }

  // ===== 直播企划抽屉 (开播前 + 直播中热切换) =====
  function updatePlannerPreview() {
    var prog = (aiMod() && aiMod().PROGRAMS[_state.plannerProgram]) || { id: 'chat', label: '闲聊直播', icon: '💬', desc: '', defaultTitle: '' };
    $$('.hl-program').forEach(function(el) {
      el.classList.toggle('selected', el.dataset.program === prog.id);
    });
    var preview = $('#hl-plan-preview');
    if (preview) preview.textContent = prog.icon + ' ' + prog.label + '：' + prog.desc;

    var asmrBox = $('#hl-asmr-config');
    if (asmrBox) asmrBox.classList.toggle('visible', prog.id === 'asmr' || prog.id === 'radio');

    var trackSelect = $('#hl-plan-asmr-track');
    if (trackSelect) {
      var locals = _state.asmrTracks || [];
      var cloudPlaylist = (_state.cloudCatalog || []).filter(function(c) { return c.inPlaylist; });
      var allItems = locals.concat(cloudPlaylist);
      if (!allItems.length) {
        trackSelect.innerHTML = '<option value="">尚未导入或加入播放列表音频（仅定时静音陪伴）</option>';
      } else {
        trackSelect.innerHTML = '<option value="">按播放顺序自动选择（共 ' + allItems.length + ' 首）</option>' +
          allItems.map(function(t) {
            var tag = t.sourceType === 'cloud'
              ? (t.cachedLocally ? '[云端·已缓存] ' : '[云端] ')
              : (t.missingBinary ? '[文件缺失·请重导] ' : '[本地] ');
            var sizeNote = t.size ? (' (' + formatBytes(t.size) + ')') : '';
            var dis = t.missingBinary ? ' disabled' : '';
            return '<option value="' + esc(t.id) + '"' + dis + '>' + esc(tag + t.name + sizeNote) + '</option>';
          }).join('');
        trackSelect.value = (_state.settings && _state.settings.asmrSelectedTrackId) || '';
      }
    }
  }

  function openPlannerModal(hostMode, editing, explicitHostObj) {
    var r = _state.room;
    var c = null;
    if (editing && r) {
      c = r.hostMode === 'user' ? null : (r.hostCharObj || r.charObj || null);
    } else if (hostMode === 'user') {
      c = null;
    } else if (explicitHostObj && explicitHostObj.id) {
      c = explicitHostObj;
    } else if (hostMode === 'npc') {
      c = (_state.invitees || []).find(function(x) {
        return x && x.roleType === 'npc' && String(x.id) === String(_state.selectedHostId);
      }) || (_state.invitees || []).find(function(x) { return x && x.roleType === 'npc'; }) || null;
    } else {
      c = getActiveChar();
    }

    var resolvedMode = hostMode || 'char';
    if (resolvedMode !== 'user' && resolvedMode !== 'private' && c && c.roleType === 'npc') {
      resolvedMode = 'npc';
    }
    _state.plannerPendingMode = resolvedMode;
    _state.plannerHostObj = c || null;
    _state.plannerEditing = Boolean(editing);

    if (editing && r) {
      _state.plannerProgram = r.program || 'chat';
    } else {
      _state.plannerProgram = 'chat';
    }

    var prog = aiMod().PROGRAMS[_state.plannerProgram] || aiMod().PROGRAMS.chat;
    var avEl = $('#hl-plan-avatar');
    if (avEl) {
      if (_state.plannerPendingMode === 'user') {
        avEl.innerHTML = _state.user.avatar ? '<img src="' + esc(_state.user.avatar) + '" alt="我">' : '🎀';
      } else {
        avEl.innerHTML = renderCharAvatarHtml(c);
      }
    }
    var nameEl = $('#hl-plan-name');
    if (nameEl) {
      if (_state.plannerPendingMode === 'user') {
        nameEl.textContent = (_state.user.name + ' · 个人直播间');
      } else if (_state.plannerPendingMode === 'private') {
        nameEl.textContent = (c ? c.name : 'Char') + ' · 私人双人连线';
      } else if (_state.plannerPendingMode === 'npc') {
        nameEl.textContent = (c ? c.name : 'NPC') + ' 的独立直播（NPC 主播）';
      } else {
        nameEl.textContent = (c ? c.name : 'Char') + ' 的直播';
      }
    }
    var styleLabel = $('#hl-plan-style-label');
    if (styleLabel) {
      styleLabel.textContent = _state.plannerPendingMode === 'npc'
        ? 'NPC 互动节奏'
        : _state.plannerPendingMode === 'user'
          ? '受邀嘉宾互动节奏'
          : 'Char 互动节奏';
    }
    var headEl = $('#hl-planner-heading');
    if (headEl) headEl.textContent = editing ? '切换当前节目（不断开直播）' : '📺 本场直播企划';

    var titleEl = $('#hl-plan-title');
    if (titleEl) {
      titleEl.value = (editing && _state.room && _state.room.title) ? _state.room.title : prog.defaultTitle;
    }
    var styleEl = $('#hl-plan-style');
    if (styleEl) {
      styleEl.value = (editing && _state.room && _state.room.style) || (_state.settings && _state.settings.initiative) || 'natural';
    }
    var timerEl = $('#hl-asmr-timer');
    if (timerEl && _state.settings) {
      timerEl.value = _state.settings.timer && _state.settings.timer !== 'off' ? _state.settings.timer : '30';
    }
    var endActionEl = $('#hl-asmr-end-action');
    if (endActionEl && _state.settings) {
      endActionEl.value = _state.settings.asmrEndAction || 'stop_program';
    }
    var confirmBtn = $('#hl-plan-confirm');
    if (confirmBtn) confirmBtn.textContent = editing ? '应用并切换节目' : '进入直播间 ♡';

    updatePlannerPreview();
    openModal('planner');
  }

  function getPlannerAsmrDurationMs() {
    var timerEl = $('#hl-asmr-timer');
    var kind = timerEl ? timerEl.value : '0';
    if (kind === 'clock') {
      var clockEl = $('#hl-asmr-clock');
      var v = clockEl ? clockEl.value : '';
      if (!/^\d{2}:\d{2}$/.test(v)) return 0;
      var parts = v.split(':').map(Number);
      var d = new Date();
      d.setHours(parts[0], parts[1], 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
      return d.getTime() - Date.now();
    }
    if (kind === 'custom') {
      var h = Number(($('#hl-asmr-hours') || {}).value);
      var m = Number(($('#hl-asmr-minutes') || {}).value);
      if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59 || (h + m) === 0) return 0;
      return (h * 60 + m) * 60000;
    }
    return Math.max(0, Number(kind) || 0) * 60000;
  }

  // ===== 直播间 ASMR 与电台音频播放（本地 + 云端清单/缓存 + 自动回退） =====
  function getOrderedPlayCandidates(playlist, preferredId, playMode, startIdx) {
    if (!playlist.length) return [];
    var idx = -1;
    if (preferredId) {
      idx = playlist.findIndex(function(item) { return item && item.id === preferredId; });
    }
    if (idx < 0) {
      idx = playMode === 'random'
        ? Math.floor(Math.random() * playlist.length)
        : (Math.max(0, Number(startIdx) || 0) % playlist.length);
    }
    var ordered = [];
    for (var i = 0; i < playlist.length; i++) {
      var pos = (idx + i) % playlist.length;
      ordered.push({ item: playlist[pos], index: pos });
    }
    return ordered;
  }

  async function resolveNextPlayableCandidate(ordered, triedSet, allowCloud) {
    for (var i = 0; i < ordered.length; i++) {
      var pair = ordered[i];
      if (!pair || !pair.item || triedSet[pair.item.id]) continue;
      if (!allowCloud && pair.item.sourceType === 'cloud' && !pair.item.cachedLocally) continue;
      triedSet[pair.item.id] = true;
      var res = await storage().resolveAudioTrackPlaySource(pair.item);
      if (res && res.ok && res.url) {
        return { item: pair.item, index: pair.index, resolved: res };
      }
      if (res && res.reason === 'missing_binary') {
        appendRoomMessage({
          senderRole: 'system',
          sender: '音频缺失提醒',
          text: '「' + pair.item.name + '」本地音频文件缺失，已跳过（请到设置中重新导入同名音频恢复）。'
        });
      }
    }
    return null;
  }

  async function startAsmrAudioIfAvailable(selectedTrackId, opts) {
    opts = opts || {};
    var prevEl = _asmrAudioEl;
    _asmrAudioEl = null;
    if (prevEl) {
      try { prevEl.pause(); prevEl.src = ''; } catch (_) {}
    }

    var playlist = typeof storage().listPlayablePlaylistItems === 'function'
      ? await storage().listPlayablePlaylistItems()
      : await storage().listAsmrTracksWithStatus();

    var clouds = typeof storage().listCloudCatalog === 'function' ? await storage().listCloudCatalog() : [];
    var locals = playlist.filter(function(p) { return p && p.sourceType !== 'cloud'; });
    _state.asmrTracks = locals;

    if (selectedTrackId && !playlist.some(function(x) { return x && x.id === selectedTrackId; })) {
      var directCloud = clouds.find(function(x) { return x && x.id === selectedTrackId; });
      if (directCloud) playlist = [directCloud].concat(playlist);
    }

    var r = _state.room;
    if (!r || (r.program !== 'asmr' && r.program !== 'radio')) return false;

    if (!playlist.length) {
      if (r.program === 'asmr' && !opts.silentEmpty) {
        appendRoomMessage({
          senderRole: 'system',
          sender: 'ASMR 提示',
          text: '本地与播放列表暂无音轨，可在「直播设置 → 电台与 ASMR 音频库」导入大文件或同步云端音库；当前以静音定时陪伴继续。'
        });
      }
      return false;
    }

    var playMode = (_state.settings && _state.settings.asmrPlayMode) || 'loop';
    var preferredId = selectedTrackId || (_state.settings && _state.settings.asmrSelectedTrackId) || '';
    var ordered = getOrderedPlayCandidates(playlist, preferredId, playMode, _state.asmrCurrentTrackIndex);
    var tried = opts._triedIds || {};
    var chosen = await resolveNextPlayableCandidate(ordered, tried, true);

    if (!chosen && Object.keys(tried).length > 0) {
      // 若云端不可用，再单独尝试回退本地可用音频
      var localOrdered = getOrderedPlayCandidates(locals, '', playMode, 0);
      chosen = await resolveNextPlayableCandidate(localOrdered, {}, false);
    }

    if (!chosen) {
      if (r.program === 'asmr' || selectedTrackId) {
        appendRoomMessage({
          senderRole: 'system',
          sender: '音频提醒',
          text: '暂无可用的本地或在线音频（本地缺失或当前离线未缓存），已切换为静音陪伴，请重新导入音频或检查网络。'
        });
      }
      return false;
    }

    if (!_state.room || _state.room.sessionId !== r.sessionId || (_state.room.program !== 'asmr' && _state.room.program !== 'radio')) {
      return false;
    }

    _state.asmrCurrentTrackIndex = chosen.index;
    var track = chosen.item;
    var url = chosen.resolved.url;
    var sourceBadge = chosen.resolved.sourceType === 'cloud_cached'
      ? '云端·已缓存'
      : chosen.resolved.sourceType === 'cloud_stream'
        ? '云端在线'
        : '本地';

    if (typeof Audio === 'undefined') return false;
    var audio = new Audio(url);
    _asmrAudioEl = audio;
    audio.loop = playMode === 'single';
    syncAsmrVolume();

    var triggerFallbackToLocal = function(reasonText) {
      if (_asmrAudioEl !== audio) return;
      _asmrAudioEl = null;
      try { audio.pause(); audio.src = ''; } catch (_) {}
      var localPlayable = locals.find(function(l) { return l && !l.missingBinary && !tried[l.id]; });
      if (localPlayable) {
        appendRoomMessage({
          senderRole: 'system',
          sender: '音频回退',
          text: '「' + track.name + '」' + reasonText + '，已自动回退播放本地音轨「' + localPlayable.name + '」。'
        });
        showToast('云端播放失败，已回退本地音频');
        startAsmrAudioIfAvailable(localPlayable.id, { _triedIds: tried, silentEmpty: true });
      } else {
        appendRoomMessage({
          senderRole: 'system',
          sender: '音频提示',
          text: '「' + track.name + '」' + reasonText + '，且当前无可用本地音轨，已转为静音陪伴。'
        });
        showToast('音频加载失败，已停止播放');
      }
    };

    if (typeof audio.addEventListener === 'function') {
      audio.addEventListener('error', function() {
        if (_asmrAudioEl !== audio || !_state.room) return;
        triggerFallbackToLocal(chosen.resolved.sourceType === 'cloud_stream' ? '在线加载失败或处于离线状态' : '音频解码或读取失败');
      });

      audio.addEventListener('ended', function() {
        if (_asmrAudioEl !== audio || !_state.room) return;
        if (_state.room.program !== 'asmr' && _state.room.program !== 'radio') return;
        if (playMode === 'single') return;

        var curList = _state.asmrTracks.concat((_state.cloudCatalog || []).filter(function(c) { return c.inPlaylist; }));
        if (!curList.length) return;
        if (playMode === 'sequence') {
          if (_state.asmrCurrentTrackIndex + 1 >= curList.length) {
            stopAsmrPlayback();
            appendRoomMessage({
              senderRole: 'system',
              sender: '顺序播放',
              text: '本轮音频列表已全部顺序播放完毕 ♡'
            });
            updateMiniWindowChrome();
            return;
          }
          _state.asmrCurrentTrackIndex = _state.asmrCurrentTrackIndex + 1;
        } else if (playMode === 'random' && curList.length > 1) {
          _state.asmrCurrentTrackIndex = Math.floor(Math.random() * curList.length);
        } else {
          _state.asmrCurrentTrackIndex = (_state.asmrCurrentTrackIndex + 1) % curList.length;
        }
        var nextItem = curList[_state.asmrCurrentTrackIndex];
        if (nextItem) startAsmrAudioIfAvailable(nextItem.id, { silentEmpty: true });
      });
    }

    try {
      await audio.play();
      _state.room.asmrUsed = true;
      var modeLabelMap = { loop: '列表循环', single: '单曲循环', random: '随机播放', sequence: '顺序播放' };
      appendRoomMessage({
        senderRole: 'system',
        sender: r.program === 'radio' ? '电台背景音' : 'ASMR 正在播放',
        text: '🎵 ' + track.name + ' [' + sourceBadge + ']（' + (modeLabelMap[playMode] || '列表循环') + '）'
      });
      updateMiniWindowChrome();
      return true;
    } catch (_) {
      if (chosen.resolved.sourceType === 'cloud_stream') {
        triggerFallbackToLocal('在线播放受阻或网络异常');
        return false;
      }
      appendRoomMessage({
        senderRole: 'system',
        sender: '音频提示',
        text: '音频已就绪（「' + track.name + '」[' + sourceBadge + ']），受浏览器自动播放策略影响请轻触页面后重试。'
      });
      return false;
    }
  }

  function fadeOutAndStopAsmr() {
    if (!_asmrAudioEl) {
      stopAsmrPlayback();
      return;
    }
    var a = _asmrAudioEl;
    _asmrAudioEl = null;
    stopAsmrTimerOnly();
    var steps = 6;
    var startVol = a.volume;
    var i = 0;
    var fadeId = setInterval(function() {
      i++;
      try {
        a.volume = Math.max(0, startVol * (1 - i / steps));
      } catch (_) {}
      if (i >= steps) {
        clearInterval(fadeId);
        try { a.pause(); a.src = ''; } catch (_) {}
      }
    }, 150);
  }

  function checkAsmrTimer() {
    if (!_state.asmrDeadlineMs || !_state.room) return;
    var remaining = _state.asmrDeadlineMs - Date.now();
    var statusEl = $('#hl-program-status');
    if (remaining <= 0) {
      var endAction = (_state.room && _state.room.asmrEndAction) || (_state.settings && _state.settings.asmrEndAction) || 'stop_program';
      fadeOutAndStopAsmr();
      if (endAction === 'exit_room') {
        showToast('🌙 ASMR 定时已到，直播已自然收尾');
        finishAndLeaveRoom(true);
      } else {
        _state.room.program = 'chat';
        _state.room.title = aiMod().PROGRAMS.chat.defaultTitle;
        updateRoomProgramChrome();
        updateMiniWindowChrome();
        appendRoomMessage({
          senderRole: 'system',
          sender: 'ASMR 定时结束',
          messageType: 'program_switch',
          source: 'program',
          text: '已平滑淡出停止 ASMR 音景，切换回闲聊陪伴模式 ♡'
        });
        showToast('🌙 ASMR 定时结束，已停止播放');
      }
      return;
    }
    if (statusEl && _state.room.program === 'asmr') {
      var mins = Math.ceil(remaining / 60000);
      statusEl.textContent = '🎧 ASMR · 剩余 ' + mins + ' 分钟';
    }
    updateMiniWindowChrome();
  }

  // ===== 直播间创建与热切换 =====
  async function startLiveRoom(opts) {
    opts = opts || {};
    var requestedMode = opts.hostMode || 'char';
    var rawHostChar = opts.charObj !== undefined ? opts.charObj : (requestedMode === 'user' || requestedMode === 'npc' ? null : getActiveChar());
    if (requestedMode === 'npc') {
      if (!rawHostChar || !rawHostChar.id || rawHostChar.roleType !== 'npc') {
        showToast('未找到有效的 NPC 角色，无法以 NPC 身份开播');
        return null;
      }
    } else if (requestedMode === 'private') {
      if (!rawHostChar || !rawHostChar.id || rawHostChar.roleType === 'npc') {
        showToast('私人双人连线仅支持已创建的 Char 角色');
        return null;
      }
    } else if (requestedMode !== 'user' && rawHostChar && rawHostChar.roleType === 'npc') {
      requestedMode = 'npc';
    }

    cleanupAllMedia();
    removeMiniWindow();
    closeModal();
    _state.sessionSeq++;
    _state.pendingConnectAfterInvite = false;
    var sid = _state.sessionSeq;
    var startedAt = Date.now();
    var hostMode = requestedMode;
    var progId = opts.program || 'chat';
    var progInfo = aiMod().PROGRAMS[progId] || aiMod().PROGRAMS.chat;
    var defaultTitle = (hostMode === 'user' && progId === 'chat') ? '我的个人直播间' : progInfo.defaultTitle;
    var title = (opts.title || '').trim() || defaultTitle;
    var style = opts.style || (_state.settings && _state.settings.initiative) || 'natural';

    var hostCharObj = hostMode === 'user' ? null : rawHostChar;
    var hostType = hostMode === 'user' ? 'user' : hostMode === 'npc' ? 'npc' : 'char';
    var hostId = hostType === 'user'
      ? String((_state.user && _state.user.id) || 'user')
      : String((hostCharObj && hostCharObj.id) || '');
    var hostName = hostType === 'user'
      ? ((_state.user && _state.user.name) || '我')
      : ((hostCharObj && hostCharObj.name) || (hostType === 'npc' ? 'NPC' : 'Char'));

    if (hostType === 'npc' && hostId) {
      _state.selectedHostId = hostId;
    } else if (hostType === 'char' && hostId && (!hostCharObj || !hostCharObj.isDemo)) {
      _state.selectedHostId = hostId;
      _state.selectedCharId = hostId;
    }

    var initialInvited = [];
    if (hostMode !== 'private' && Array.isArray(opts.invitedViewers) && opts.invitedViewers.length) {
      var seenInit = {};
      for (var iv = 0; iv < opts.invitedViewers.length; iv++) {
        var v = opts.invitedViewers[iv];
        if (!v || !v.id) continue;
        var vid = String(v.id);
        if (hostType !== 'user' && vid === hostId) continue;
        if (seenInit[vid]) continue;
        seenInit[vid] = true;
        initialInvited.push(Object.assign({ joinedAt: startedAt, roleType: v.roleType === 'npc' ? 'npc' : 'char' }, v));
      }
    } else if (hostMode === 'user' && opts.charObj && opts.charObj.id) {
      initialInvited = [Object.assign({ joinedAt: startedAt, roleType: opts.charObj.roleType === 'npc' ? 'npc' : 'char' }, opts.charObj)];
    }

    _state.room = {
      sessionId: sid,
      logSessionId: 'hl_' + startedAt + '_' + sid + '_' + Math.random().toString(36).slice(2, 6),
      startedAt: startedAt,
      hostMode: hostMode,
      hostType: hostType,
      hostId: hostId,
      hostName: hostName,
      hostCharObj: hostCharObj,
      invitedViewers: initialInvited,
      cohostCharObj: null,
      charObj: null,
      program: progId,
      title: title,
      style: style,
      asmrEndAction: opts.asmrEndAction || (_state.settings && _state.settings.asmrEndAction) || 'stop_program',
      asmrTrackId: opts.asmrTrackId || '',
      asmrDurationMs: Number(opts.asmrDurationMs) || 0,
      likes: 0,
      giftsTotalCoins: 0,
      cohostUsed: false,
      asmrUsed: false,
      lastAiAudienceAt: 0,
      aiRoundRobinIndex: 0,
      messages: [],
      fullMessages: [],
      gameSession: { round: 0, score: 0, prompt: '' }
    };
    syncRoomDerivedFields(_state.room);
    _state.selectedGiftRecipientId = '';

    var msgsBox = $('#hl-messages');
    if (msgsBox) msgsBox.innerHTML = '';
    _state.messagesAutoFollow = true;
    _state.unreadWhileScrolled = 0;
    syncLatestMsgButton();

    renderRoomIdentityChrome();
    await applyRoomThemeAndBackground();
    await refreshRoomVisuals();
    switchView('live');
    await applyProgramToRoom(progId, title, style, opts, false);

    if (hostMode === 'user' && initialInvited.length === 0) {
      appendRoomMessage({
        senderRole: 'system',
        sender: '个人开播',
        messageType: 'system',
        source: 'system',
        text: '个人直播已开启 ♡ 可自由发消息、使用底部节目切换按钮更换节目或播放 ASMR；如需与 Char / NPC 互动或连麦，可随时点击顶部「+ 邀请」。'
      });
      return _state.room;
    }

    // 真实开场问候（区分 User 主播 / 私人连线 / Char 主播 / NPC 主播）
    var actors = getAllRoomActors(_state.room);
    for (var ai = 0; ai < actors.length; ai++) {
      var act = actors[ai];
      var isHostActor = hostMode !== 'user' && String(act.id) === hostId;
      var openingUserPrompt = hostMode === 'user'
        ? ('我刚刚开启了我的直播间（节目：「' + progInfo.label + '」，标题：「' + title + '」），邀请你进来前排观众席陪伴，请以观众视角自然打声招呼。')
        : hostMode === 'private'
          ? ('我刚刚进入我们的私人连线直播间（节目：「' + progInfo.label + '」，标题：「' + title + '」），请用贴合人设的语气跟我开场打个招呼。')
          : isHostActor
            ? (hostType === 'npc'
                ? ('你（NPC 主播 ' + act.name + '）刚刚独立开启了自己的直播间（节目：「' + progInfo.label + '」，标题：「' + title + '」），请贴合你的 NPC 身份向刚进来的 ' + _state.user.name + ' 自然开场打个招呼。')
                : ('你刚刚开启了直播（节目：「' + progInfo.label + '」，标题：「' + title + '」），请向刚进来的 ' + _state.user.name + ' 自然开场白。'))
            : (hostName + '（' + (hostType === 'npc' ? 'NPC 主播' : 'Char 主播') + '）正在开播（节目：「' + progInfo.label + '」，标题：「' + title + '」），你作为受邀观众嘉宾刚进入直播间，请以观众视角礼貌打声招呼。');
      enqueueAiTurn(act, {
        triggerType: 'opening',
        userPrompt: openingUserPrompt
      });
    }
    return _state.room;
  }

  function renderRoomIdentityChrome() {
    var r = _state.room;
    if (!r) return;
    syncRoomDerivedFields(r);
    var roomEl = $('#hl-room');
    if (roomEl) {
      roomEl.classList.toggle('private', r.hostMode === 'private');
    }
    var c = r.hostMode === 'user' ? r.cohostCharObj : r.hostCharObj;
    var invited = Array.isArray(r.invitedViewers) ? r.invitedViewers : [];
    var hostName = $('#hl-host-name');
    var hostStatus = $('#hl-host-status');
    var audience = $('#hl-audience');
    var followBtn = $('#hl-follow');
    var inviteBtn = $('#hl-invite-btn');
    var inputEl = $('#hl-message-input');

    if (hostName) {
      hostName.textContent = r.hostMode === 'user'
        ? (_state.user.name + '（我）')
        : (c ? (c.name + (r.hostType === 'npc' ? ' [NPC]' : '')) : (r.hostType === 'npc' ? 'NPC' : 'Char'));
    }
    if (hostStatus) {
      if (r.hostMode === 'private') {
        hostStatus.textContent = '私人双人连线';
      } else if (r.hostMode === 'user') {
        if (r.cohostCharObj) {
          hostStatus.textContent = '与 ' + r.cohostCharObj.name + ' 连麦中 · 在席 ' + invited.length + ' 人';
        } else if (invited.length > 0) {
          hostStatus.textContent = invited.length === 1
            ? ('在席：' + invited[0].name + (invited[0].roleType === 'npc' ? ' [NPC]' : ''))
            : ('在席 ' + invited.length + ' 位嘉宾');
        } else {
          hostStatus.textContent = '个人直播中';
        }
      } else if (r.hostType === 'npc') {
        hostStatus.textContent = _state.connectionType
          ? ('NPC 主播 · 连麦互动中')
          : (invited.length > 0 ? ('NPC 主播 · 在席 ' + invited.length + ' 位嘉宾') : 'NPC 独立开播中');
      } else {
        hostStatus.textContent = invited.length > 0
          ? ('Char 主播 · 在席 ' + invited.length + ' 位嘉宾')
          : '正在直播';
      }
    }
    if (audience) {
      if (r.hostMode === 'user') {
        var realCountText = invited.length > 0 ? ('受邀 ' + invited.length + ' 人') : '个人直播间';
        audience.textContent = '👁 ' + realCountText + (_state.settings && _state.settings.sim && invited.length ? ' · 含AI观众' : '');
      } else if (invited.length > 0) {
        audience.textContent = '👁 含 ' + invited.length + ' 位受邀嘉宾';
      } else {
        audience.textContent = _state.settings && _state.settings.sim ? '👁 模拟热度 1.2k' : '👁 仅你观看';
      }
    }
    if (followBtn) {
      followBtn.style.display = ((r.hostMode === 'char' || r.hostMode === 'npc') && c) ? '' : 'none';
      if (c) {
        var followed = Boolean(_state.followedChars[String(c.id)]);
        followBtn.textContent = followed ? '✓ 已关注' : '+ 关注';
        followBtn.classList.toggle('followed', followed);
      }
    }
    if (inviteBtn) {
      inviteBtn.style.display = r.hostMode !== 'private' ? '' : 'none';
      inviteBtn.textContent = invited.length > 0 ? ('嘉宾 · ' + invited.length + '人') : '+ 邀请';
      inviteBtn.classList.toggle('invited', invited.length > 0);
    }
    if (inputEl) {
      inputEl.placeholder = r.hostMode === 'private' && c
        ? ('和 ' + c.name + ' 说点什么…')
        : r.hostMode === 'user'
          ? (invited.length > 0 ? ('对 ' + (invited.length === 1 ? invited[0].name : (invited.length + ' 位嘉宾')) + ' 和直播间说点什么…') : '记录此刻或对观众说点什么…')
          : (r.hostType === 'npc' && c)
            ? ('给 NPC 主播 ' + c.name + ' 发一条弹幕…')
            : '发一条弹幕…';
    }
    var likeEl = $('#hl-like-count');
    if (likeEl) likeEl.textContent = r.likes ? String(r.likes) : '点赞';
    updateMiniWindowChrome();
  }

  function updateRoomProgramChrome() {
    var r = _state.room;
    if (!r) return;
    var c = r.hostMode === 'user' ? r.cohostCharObj : r.hostCharObj;
    var invited = Array.isArray(r.invitedViewers) ? r.invitedViewers : [];
    var prog = aiMod().PROGRAMS[r.program] || aiMod().PROGRAMS.chat;
    var statusEl = $('#hl-program-status');
    var roomTitleEl = $('#hl-room-title');
    var signEl = $('#hl-stage-caption');
    var noticeEl = $('#hl-notice');

    if (statusEl) {
      statusEl.textContent = prog.icon + ' 当前：' + prog.label + (r.program === 'asmr' && _state.asmrDeadlineMs ? ' · 定时中' : '');
    }
    if (roomTitleEl) {
      var prefix = r.hostMode === 'user'
        ? (invited.length > 0
            ? ('🎤 我的直播间 · 已邀 ' + invited.map(function(v) { return v.name; }).slice(0, 2).join('、') + (invited.length > 2 ? ' 等' + invited.length + '人' : ''))
            : ('🎤 ' + _state.user.name + ' 的个人直播间'))
        : r.hostMode === 'private'
          ? ('♡ 与 ' + (c ? c.name : 'Char') + ' 私人连线')
          : r.hostType === 'npc'
            ? ('🎭 ' + (c ? c.name : 'NPC') + ' [NPC] 的直播间')
            : ((c ? c.name : 'Char') + ' 的直播间');
      roomTitleEl.textContent = prefix + ' · ' + r.title;
    }
    if (signEl) {
      signEl.textContent = prog.icon + ' ' + r.title;
    }
    if (noticeEl) {
      if (r.hostMode === 'user' && invited.length === 0) {
        noticeEl.textContent = prog.label + ' · 个人开播中（可点击顶部「+ 邀请」邀 Char / NPC 陪伴）';
      } else if (r.hostType === 'npc') {
        var npcSimNote = (_state.settings && _state.settings.sim) ? '含 [AI观众] 气氛弹幕' : '仅真实受邀互动';
        noticeEl.textContent = prog.label + ' · NPC 独立开播（严格隔离，不读 Char 私聊与长期记忆 · ' + npcSimNote + '）';
      } else {
        var simNote = (_state.settings && _state.settings.sim && r.hostMode !== 'private') ? '含 [AI观众] 气氛弹幕' : '仅真实受邀互动';
        noticeEl.textContent = prog.label + ' · 真实角色隔离互动（' + simNote + '）';
      }
    }
    updateMiniWindowChrome();
  }

  async function applyProgramToRoom(progId, title, style, opts, isHotSwitch) {
    var r = _state.room;
    if (!r) return;
    opts = opts || {};
    stopAsmrPlayback();

    var prog = aiMod().PROGRAMS[progId] || aiMod().PROGRAMS.chat;
    r.program = prog.id;
    r.title = (title || '').trim() || prog.defaultTitle;
    if (style) r.style = style;
    if (opts.asmrEndAction) r.asmrEndAction = opts.asmrEndAction;

    updateRoomProgramChrome();

    appendRoomMessage({
      senderRole: 'system',
      sender: '节目切换',
      messageType: 'program_switch',
      source: 'program',
      text: prog.icon + ' ' + prog.label + '｜' + r.title + '（' + ({ natural: '自然主动', quiet: '安静陪伴', lively: '活跃互动' }[r.style] || '自然') + '）'
    });

    if (prog.id === 'asmr' || prog.id === 'radio') {
      await startAsmrAudioIfAvailable(opts.asmrTrackId || '', { silentEmpty: prog.id === 'radio' });
      var durMs = Number(opts.asmrDurationMs) || 0;
      if (durMs > 0) {
        _state.asmrDeadlineMs = Date.now() + durMs;
        _state.asmrTimerId = setInterval(checkAsmrTimer, 1000);
        checkAsmrTimer();
        var endStr = new Date(_state.asmrDeadlineMs).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        appendRoomMessage({
          senderRole: 'system',
          sender: prog.id === 'radio' ? '电台定时' : 'ASMR 定时',
          messageType: 'program_switch',
          source: 'program',
          text: '已设定本地时间 ' + endStr + (r.asmrEndAction === 'exit_room' ? ' 结束本场直播' : ' 平滑停止背景音景并切回闲聊')
        });
      }
    }

    if (isHotSwitch) {
      var responder = getConnectionPartner(r) || getAllRoomActors(r)[0] || null;
      if (responder) {
        enqueueAiTurn(responder, {
          triggerType: 'program_switch',
          userPrompt: '我们刚刚把直播节目切换到了「' + prog.label + '」（标题：「' + r.title + '」），请自然顺着这个新节目接一句。'
        });
      }
    }
  }

  // ===== 单人双视觉模式 (全屏 vs 煲电话) & 连麦画面 =====
  function getActiveStageTargetKey() {
    if (!_state.room) return String(getActiveChar().id);
    if (_state.room.hostMode === 'user') return 'user';
    var hc = _state.room.hostCharObj || _state.room.charObj;
    return hc ? String(hc.id) : String(getActiveChar().id);
  }

  async function refreshRoomVisuals() {
    var r = _state.room;
    if (!r) return;
    var targetKey = getActiveStageTargetKey();
    var opt = storage().normalizePortraitOption(_state.portraitOptions[targetKey]);
    var customSrc = await storage().loadPortraitSrc(targetKey);
    if (!_state.room || _state.room.sessionId !== r.sessionId) return;

    var hostActor = r.hostCharObj || r.charObj;
    var fallbackAvatar = r.hostMode === 'user' ? (_state.user.avatar || '') : ((hostActor && hostActor.avatar) || '');
    var defaultGlyph = r.hostMode === 'user' ? '🎀' : ((hostActor && hostActor.emojiFallback) || (r.hostType === 'npc' ? '🎭' : '🌸'));
    var src = customSrc || fallbackAvatar;
    var isCallVisual = opt.mode === 'call';

    var roomEl = $('#hl-room');
    var fullEl = $('#hl-charFullscreenArt');
    var stageAvatar = $('#hl-stageAvatar');
    var faceEl = $('#hl-host-face');
    var callToggle = $('#hl-callModeToggle');

    if (roomEl) {
      roomEl.classList.toggle('hl-call-visual', isCallVisual);
      roomEl.classList.toggle('hl-has-fullscreen-art', Boolean(src && !isCallVisual));
    }
    if (callToggle) {
      callToggle.textContent = isCallVisual ? '🖼 全屏' : '📞 通话';
      callToggle.style.display = r.hostMode === 'private' ? 'none' : '';
    }
    if (fullEl) {
      fullEl.classList.toggle('visible', Boolean(src && !isCallVisual));
      fullEl.style.backgroundImage = src && !isCallVisual ? 'url("' + safeCssUrl(src) + '")' : '';
      fullEl.style.backgroundSize = opt.fit || 'cover';
      fullEl.style.backgroundPosition = opt.position || 'center';
    }
    if (stageAvatar) {
      var showPortrait = Boolean(src && isCallVisual);
      stageAvatar.classList.toggle('portrait', showPortrait);
      stageAvatar.style.backgroundImage = showPortrait ? 'url("' + safeCssUrl(src) + '")' : '';
      stageAvatar.textContent = showPortrait ? '' : defaultGlyph;
    }
    if (faceEl) {
      faceEl.classList.toggle('portrait', Boolean(src));
      faceEl.style.backgroundImage = src ? 'url("' + safeCssUrl(src) + '")' : '';
      faceEl.textContent = src ? '' : defaultGlyph;
    }

    await updateConnectionVisuals();
  }

  async function applyRoomThemeAndBackground() {
    var s = _state.settings || storage().DEFAULT_SETTINGS;
    var roomEl = $('#hl-room');
    var previewEl = $('#hl-bgPreview');
    var previewLabel = $('#hl-bgPreviewLabel');
    var src = await storage().loadCustomBgSrc(s);
    _state.customBgSrc = src;

    if (roomEl) {
      THEME_KEYS.forEach(function(k) { roomEl.classList.remove(k); });
      roomEl.classList.add(s.theme || 'cloud');
      roomEl.style.backgroundImage = src
        ? 'linear-gradient(0deg, rgba(29,20,44,0.22), rgba(29,20,44,0.12)), url("' + safeCssUrl(src) + '")'
        : '';
    }
    if (previewEl) {
      previewEl.style.backgroundImage = src ? 'url("' + safeCssUrl(src) + '")' : '';
    }
    if (previewLabel) {
      previewLabel.textContent = src
        ? ('当前：自定义' + (s.customBgType === 'local' ? '本地图片' : 'URL 图片'))
        : ('当前：' + (THEME_LABELS[s.theme] || '云朵粉紫'));
    }
  }

  // ===== 连麦双布局 (经典小窗 <-> 双人并列PK, 不断流热切换) =====
  async function updateConnectionVisuals() {
    var partner = getConnectionPartner(_state.room);
    if (!_state.connectionType || !_state.room || !partner) return;
    var r = _state.room;
    var c = partner;
    var hostIsUser = r.hostMode === 'user';

    var hostKey = hostIsUser ? 'user' : String(c.id);
    var guestKey = hostIsUser ? String(c.id) : 'user';
    var hostLabel = hostIsUser
      ? (_state.user.name + ' · 主播')
      : (c.name + (c.roleType === 'npc' ? ' · NPC 主播' : ' · 主播'));
    var typeTag = { text: '文字连麦', voice: '语音连麦', video: '虚拟形象同框', camera: '本地摄像头预览' }[_state.connectionType] || '连麦中';
    var guestLabel = (hostIsUser ? c.name : _state.user.name) + ' · ' + typeTag;

    var mainLabelEl = $('#hl-main-conn-label');
    var guestLabelEl = $('#hl-conn-label');
    if (mainLabelEl) mainLabelEl.textContent = hostLabel;
    if (guestLabelEl) guestLabelEl.textContent = guestLabel;

    var hostSrc = (await storage().loadPortraitSrc(hostKey)) || (hostIsUser ? _state.user.avatar : c.avatar) || '';
    var guestSrc = (await storage().loadPortraitSrc(guestKey)) || (hostIsUser ? c.avatar : _state.user.avatar) || '';
    if (!_state.connectionType || !_state.room || _state.room.sessionId !== r.sessionId) return;

    var mainArt = $('#hl-main-conn-art');
    if (mainArt) {
      mainArt.classList.toggle('has-img', Boolean(hostSrc));
      mainArt.style.backgroundImage = hostSrc ? 'url("' + safeCssUrl(hostSrc) + '")' : '';
      mainArt.textContent = hostSrc ? '' : (hostIsUser ? '🎀' : (c.emojiFallback || (c.roleType === 'npc' ? '🎭' : '🌸')));
    }
    var guestArt = $('#hl-conn-art');
    if (guestArt) {
      guestArt.classList.toggle('has-img', Boolean(guestSrc));
      guestArt.style.backgroundImage = guestSrc ? 'url("' + safeCssUrl(guestSrc) + '")' : '';
      guestArt.textContent = guestSrc ? '' : (hostIsUser ? (c.emojiFallback || (c.roleType === 'npc' ? '🎭' : '🌸')) : '🎀');
    }
  }

  function applyConnectionLayout(layout) {
    var split = layout === 'split';
    _state.connectionLayout = split ? 'split' : 'floating';
    var roomEl = $('#hl-room');
    if (roomEl) {
      roomEl.classList.toggle('hl-connection-active', split);
    }
    var selectEl = $('#hl-connect-layout');
    if (selectEl) selectEl.value = _state.connectionLayout;

    // 只更新无障碍属性与高亮状态，绝不覆盖纯图标按钮的 SVG 结构
    var toggleBtn = $('#hl-layout-toggle');
    var swapBtn = $('#hl-swap-screens');
    if (toggleBtn) {
      var layoutTip = split ? '切换为主播大屏与连麦小窗布局' : '切换为双人左右并列布局';
      toggleBtn.setAttribute('title', layoutTip);
      toggleBtn.setAttribute('aria-label', layoutTip);
      toggleBtn.setAttribute('aria-pressed', split ? 'true' : 'false');
      toggleBtn.classList.toggle('hl-conn-btn-active', split);
    }
    if (swapBtn) {
      var swapTip = split ? '交换左右并列位置' : '交换连麦小窗位置';
      swapBtn.setAttribute('title', swapTip);
      swapBtn.setAttribute('aria-label', swapTip);
    }

    if (_state.settings && _state.settings.connectionLayout !== _state.connectionLayout) {
      _state.settings.connectionLayout = _state.connectionLayout;
      storage().saveSettings(_state.settings).catch(function() {});
    }
  }

  function disconnectCall(silent) {
    stopMediaTracks();
    var hadConn = Boolean(_state.connectionType);
    var prevPartner = _state.room && _state.room.hostMode === 'user' ? _state.room.cohostCharObj : null;
    if (_state.room && _state.room.hostMode === 'user') {
      _state.room.cohostCharObj = null;
      syncRoomDerivedFields(_state.room);
    }
    _state.connectionType = '';
    var overlay = $('#hl-connection-overlay');
    if (overlay) overlay.hidden = true;
    var textBox = $('#hl-text-call-composer');
    if (textBox) textBox.hidden = true;
    var voiceBox = $('#hl-voice-call-controls');
    if (voiceBox) voiceBox.hidden = true;
    var micBtn = $('#hl-mic-toggle');
    if (micBtn) micBtn.textContent = '开启麦克风';
    var voiceStatus = $('#hl-voice-call-status');
    if (voiceStatus) voiceStatus.textContent = '🎙 语音连麦 · 未开启麦克风';
    var guestArt = $('#hl-conn-art');
    if (guestArt) guestArt.hidden = false;
    var roomEl = $('#hl-room');
    if (roomEl) roomEl.classList.remove('hl-has-connection', 'hl-connection-active', 'hl-connection-swapped');
    var connBtn = $('#hl-connect-btn');
    if (connBtn) connBtn.classList.remove('active');
    if (_state.room && hadConn && !silent) {
      appendRoomMessage({
        senderRole: 'system',
        sender: '连麦结束',
        messageType: 'cohost_event',
        source: 'cohost',
        text: prevPartner ? ('已挂断与 ' + prevPartner.name + ' 的连麦，Ta 已回到观众席。') : '已挂断当前连麦，恢复单人画面。'
      });
    }
    if (_state.room) renderRoomIdentityChrome();
    if (!silent) showToast('已挂断连麦');
  }

  function resolveConnectCandidate(explicitTarget) {
    var r = _state.room;
    if (!r) return null;
    if (r.hostMode !== 'user') return r.hostCharObj || r.charObj || null;
    if (explicitTarget && explicitTarget.id) return explicitTarget;
    var selEl = $('#hl-connect-target');
    if (selEl && selEl.value) {
      var found = (r.invitedViewers || []).find(function(v) { return String(v.id) === String(selEl.value); });
      if (found) return found;
    }
    if (r.cohostCharObj) return r.cohostCharObj;
    if (r.invitedViewers && r.invitedViewers.length) return r.invitedViewers[0];
    return null;
  }

  function ensureCharBeforeConnect(explicitTarget) {
    if (!_state.room) return false;
    if (_state.room.hostMode !== 'user') {
      return Boolean(_state.room.hostCharObj || _state.room.charObj);
    }
    var hasInvited = Array.isArray(_state.room.invitedViewers) && _state.room.invitedViewers.length > 0;
    if (explicitTarget || hasInvited) return true;
    _state.pendingConnectAfterInvite = true;
    closeModal();
    openUserHostPicker();
    showToast('开启双人连麦前，请先选择要邀请的 Char 或 NPC ♡');
    return false;
  }

  function openConnectModal() {
    var r = _state.room;
    if (!r) return;
    if (!ensureCharBeforeConnect()) return;
    var targetWrap = $('#hl-connect-target-wrap');
    var targetSel = $('#hl-connect-target');
    if (targetWrap && targetSel) {
      if (r.hostMode === 'user') {
        var invited = r.invitedViewers || [];
        targetWrap.style.display = 'block';
        targetSel.innerHTML = invited.map(function(v) {
          return '<option value="' + esc(v.id) + '">' + esc(v.name) + '（' + (v.roleType === 'npc' ? 'NPC' : 'Char') + '）</option>';
        }).join('');
        var curId = (r.cohostCharObj && r.cohostCharObj.id) || (invited[0] && invited[0].id) || '';
        if (curId) targetSel.value = String(curId);
      } else {
        targetWrap.style.display = 'none';
      }
    }
    openModal('connect');
  }

  async function startConnection(type, explicitTarget) {
    if (!_state.room) return;
    if (!ensureCharBeforeConnect(explicitTarget)) return;
    var r = _state.room;
    var partner = resolveConnectCandidate(explicitTarget);
    if (!partner) return;

    if (r.hostMode === 'user') {
      r.cohostCharObj = partner;
      syncRoomDerivedFields(r);
    }

    // 若切换连麦类型，停止旧的麦克风/摄像头流（但切布局绝不调 startConnection）
    stopMediaTracks();
    _state.connectionType = type;
    r.cohostUsed = true;
    closeModal();

    var roomEl = $('#hl-room');
    var overlay = $('#hl-connection-overlay');
    var textBox = $('#hl-text-call-composer');
    var voiceBox = $('#hl-voice-call-controls');
    var connBtn = $('#hl-connect-btn');

    if (roomEl) roomEl.classList.add('hl-has-connection');
    if (overlay) overlay.hidden = false;
    if (textBox) textBox.hidden = type !== 'text';
    if (voiceBox) voiceBox.hidden = type !== 'voice';
    if (connBtn) connBtn.classList.add('active');

    var layoutSelect = $('#hl-connect-layout');
    var chosenLayout = (layoutSelect && layoutSelect.value) || (_state.settings && _state.settings.connectionLayout) || 'floating';
    applyConnectionLayout(chosenLayout);
    await updateConnectionVisuals();
    renderRoomIdentityChrome();

    var c = partner;
    if (type === 'text') {
      appendRoomMessage({
        senderRole: 'system',
        sender: '文字连麦',
        messageType: 'cohost_event',
        source: 'cohost',
        text: '已邀请 ' + c.name + ' 上麦开启文字连麦席位，在下方专属输入框发言将直接传送给 ' + c.name + ' ♡'
      });
    } else if (type === 'voice') {
      var hasAsr = Boolean(global.SpeechRecognition || global.webkitSpeechRecognition);
      var statusEl = $('#hl-voice-call-status');
      if (statusEl) {
        statusEl.textContent = hasAsr
          ? '🎙 语音连麦就绪 · 点击开启麦克风或语音转写'
          : '🎙 当前内核不支持实时语音识别 · 支持麦克风与文字补充';
      }
      var dictBtn = $('#hl-voice-dictate');
      if (dictBtn) dictBtn.style.display = hasAsr ? '' : 'none';
      appendRoomMessage({
        senderRole: 'system',
        sender: '语音连麦',
        messageType: 'cohost_event',
        source: 'cohost',
        text: hasAsr
          ? '已与 ' + c.name + ' 开启语音连麦面板，可授权本机麦克风并通过语音转写直接对话。'
          : '当前浏览器/WebView 不支持网页实时语音识别，已与 ' + c.name + ' 保留麦克风授权状态与文字补充输入。'
      });
    } else if (type === 'video') {
      appendRoomMessage({
        senderRole: 'system',
        sender: '同框画面',
        messageType: 'cohost_event',
        source: 'cohost',
        text: '已与 ' + c.name + ' 开启虚拟形象同框画面（以双方设置图片展示，非远程摄像头传输）。'
      });
    } else if (type === 'camera') {
      await enableLocalCamera(partner);
      return;
    }

    enqueueAiTurn(partner, {
      triggerType: 'cohost_join',
      userPrompt: _state.user.name + ' 刚刚邀请你上麦开启了「' + ({ text: '文字连麦', voice: '语音连麦', video: '同框连线' }[type] || '连麦') + '」，请自然迎一句。'
    });
  }

  async function toggleVoiceMic() {
    if (_state.connectionType !== 'voice') return;
    var statusEl = $('#hl-voice-call-status');
    var micBtn = $('#hl-mic-toggle');

    if (_state.micStream) {
      try { _state.micStream.getTracks().forEach(function(t) { t.stop(); }); } catch (_) {}
      _state.micStream = null;
      stopSpeechRecognition();
      if (micBtn) micBtn.textContent = '开启麦克风';
      if (statusEl) statusEl.textContent = '🎙 麦克风已静音/关闭';
      showToast('已关闭本机麦克风');
      return;
    }

    if (!global.navigator || !global.navigator.mediaDevices || typeof global.navigator.mediaDevices.getUserMedia !== 'function') {
      if (statusEl) statusEl.textContent = '🎙 当前环境不支持麦克风权限';
      showToast('当前环境无法访问麦克风，请使用支持麦克风的 HTTPS 页面');
      return;
    }

    try {
      var stream = await global.navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (_state.connectionType !== 'voice' || !_state.room) {
        stream.getTracks().forEach(function(t) { t.stop(); });
        return;
      }
      _state.micStream = stream;
      if (micBtn) micBtn.textContent = '关闭麦克风';
      var hasAsr = Boolean(global.SpeechRecognition || global.webkitSpeechRecognition);
      if (statusEl) {
        statusEl.textContent = hasAsr
          ? '🎙 麦克风已授权 · 可点击“语音转写发言”'
          : '🎙 麦克风已授权（无网页识别，可使用下方文字发送）';
      }
      showToast('本机麦克风已开启');
    } catch (_) {
      if (statusEl) statusEl.textContent = '🎙 未获得麦克风权限或设备不可用';
      showToast('未获得麦克风权限，可继续使用文字补充发言');
    }
  }

  function toggleVoiceDictation() {
    if (_state.connectionType !== 'voice') return;
    if (_state.recognizing) {
      stopSpeechRecognition();
      return;
    }
    var SpeechRecognition = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('当前浏览器/内核不支持实时语音识别，请直接输入文字发送');
      return;
    }
    try {
      var rec = new SpeechRecognition();
      rec.lang = 'zh-CN';
      rec.interimResults = true;
      rec.continuous = false;
      _state.recognition = rec;
      _state.recognizing = true;

      var dictBtn = $('#hl-voice-dictate');
      var statusEl = $('#hl-voice-call-status');
      var quickInput = $('#hl-voice-text-input');
      if (dictBtn) {
        dictBtn.classList.add('is-recording');
        dictBtn.textContent = '⏹ 停止识别';
      }
      if (statusEl) statusEl.textContent = '🎙 正在聆听语音转写…';

      var finalTranscript = '';
      rec.onresult = function(ev) {
        var interim = '';
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) finalTranscript += ev.results[i][0].transcript;
          else interim += ev.results[i][0].transcript;
        }
        if (quickInput) quickInput.value = (finalTranscript + interim).trim();
      };
      rec.onerror = function(ev) {
        stopSpeechRecognition();
        if (statusEl) statusEl.textContent = '🎙 语音识别结束（' + ((ev && ev.error) || '已停止') + '）';
      };
      rec.onend = function() {
        var spoken = finalTranscript.trim() || (quickInput && quickInput.value.trim()) || '';
        stopSpeechRecognition();
        if (spoken) {
          if (quickInput) quickInput.value = '';
          sendCohostMessage(spoken, 'voice');
        } else if (statusEl) {
          statusEl.textContent = '🎙 未识别到清晰语音，可直接下方输入文字';
        }
      };
      rec.start();
    } catch (_) {
      stopSpeechRecognition();
      showToast('语音识别启动失败，请直接输入文字发言');
    }
  }

  async function enableLocalCamera(explicitTarget) {
    if (!_state.room) return;
    if (!ensureCharBeforeConnect(explicitTarget)) return;
    var partner = resolveConnectCandidate(explicitTarget);
    if (!partner) return;
    if (_state.room.hostMode === 'user') {
      _state.room.cohostCharObj = partner;
      syncRoomDerivedFields(_state.room);
    }
    if (!global.navigator || !global.navigator.mediaDevices || typeof global.navigator.mediaDevices.getUserMedia !== 'function') {
      showToast('当前环境不支持摄像头预览，请使用 HTTPS 页面');
      return;
    }
    try {
      var stream = await global.navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (!_state.room || !isActorActiveInRoom(_state.room, partner.id)) {
        stream.getTracks().forEach(function(t) { t.stop(); });
        return;
      }
      stopMediaTracks();
      _state.connectionType = 'camera';
      _state.cameraStream = stream;
      _state.room.cohostUsed = true;
      closeModal();

      var roomEl = $('#hl-room');
      var overlay = $('#hl-connection-overlay');
      var textBox = $('#hl-text-call-composer');
      var voiceBox = $('#hl-voice-call-controls');
      var connBtn = $('#hl-connect-btn');
      var camEl = $('#hl-user-camera');
      var guestArt = $('#hl-conn-art');

      if (roomEl) roomEl.classList.add('hl-has-connection');
      if (overlay) overlay.hidden = false;
      if (textBox) textBox.hidden = true;
      if (voiceBox) voiceBox.hidden = true;
      if (connBtn) connBtn.classList.add('active');
      if (guestArt) guestArt.hidden = true;
      if (camEl) {
        camEl.srcObject = stream;
        camEl.hidden = false;
      }

      var layoutSelect = $('#hl-connect-layout');
      applyConnectionLayout((layoutSelect && layoutSelect.value) || 'floating');
      await updateConnectionVisuals();
      renderRoomIdentityChrome();
      appendRoomMessage({
        senderRole: 'system',
        sender: '本地摄像头',
        messageType: 'cohost_event',
        source: 'cohost',
        text: '仅本机画面预览，未向外部上传或发送任何视频流；挂断或退出即关闭摄像头。'
      });
      showToast('已开启本地摄像头预览');
      enqueueAiTurn(partner, {
        triggerType: 'camera_on',
        userPrompt: _state.user.name + ' 打开了本地摄像头连麦画面，请自然温柔地打招呼（不要编造具体隐私细节）。'
      });
    } catch (_) {
      showToast('未获得摄像头权限或设备不可用');
    }
  }

  // ===== 弹幕流、完整聊天日志持久化、多人 AI 队列与 Minimax TTS =====
  function filterLogMessagesForPersistence(fullMsgs) {
    var list = Array.isArray(fullMsgs) ? fullMsgs : [];
    var keepSim = !_state.settings || _state.settings.saveSimAudienceInLog !== false;
    return keepSim
      ? list
      : list.filter(function(m) { return !m.isSimAudience && m.senderType !== 'ai_audience' && m.senderRole !== 'ai_audience'; });
  }

  function scheduleSaveSessionChatLog(room) {
    if (!room || !room.logSessionId || !storage() || typeof storage().saveSessionChatLog !== 'function') return;
    clearTimeout(_logSaveTimer);
    var snapshotRoom = room;
    _logSaveTimer = setTimeout(function() {
      _logSaveTimer = null;
      if (!snapshotRoom || !snapshotRoom.logSessionId) return;
      storage().saveSessionChatLog(snapshotRoom.logSessionId, filterLogMessagesForPersistence(snapshotRoom.fullMessages)).catch(function() {});
    }, 280);
  }

  async function flushSessionChatLog(room) {
    clearTimeout(_logSaveTimer);
    _logSaveTimer = null;
    if (!room || !room.logSessionId || !storage() || typeof storage().saveSessionChatLog !== 'function') return null;
    var cleanMsgs = filterLogMessagesForPersistence(room.fullMessages);
    try {
      await storage().saveSessionChatLog(room.logSessionId, cleanMsgs);
      return cleanMsgs.length;
    } catch (_) {
      return cleanMsgs.length;
    }
  }

  function appendRoomMessage(msg) {
    if (!_state.room) return;
    var r = _state.room;
    var sRole = msg.senderRole || 'user';
    var ts = Date.now();
    var msgId = 'm_' + ts.toString(36) + '_' + Math.random().toString(36).slice(2, 5);
    var item = {
      id: msgId,
      messageId: msgId,
      sessionId: r.logSessionId || String(r.sessionId || ''),
      senderId: String(msg.senderId || ''),
      senderRole: sRole, // 'user' | 'user_cohost' | 'char' | 'npc' | 'ai_audience' | 'system' | 'gift'
      senderType: sRole,
      sender: String(msg.sender || '观众'),
      senderNameSnapshot: String(msg.sender || '观众'),
      messageType: msg.messageType || (sRole === 'gift' ? 'gift' : sRole === 'ai_audience' ? 'ai_audience' : sRole === 'system' ? 'system' : 'chat'),
      text: String(msg.text || ''),
      content: String(msg.text || ''),
      source: msg.source || 'live_room',
      isSimAudience: Boolean(msg.isSimAudience || sRole === 'ai_audience'),
      ts: ts,
      createdAt: ts,
      schemaVersion: 2
    };
    r.messages.push(item);
    if (r.messages.length > 120) {
      r.messages = r.messages.slice(-120);
    }
    if (!Array.isArray(r.fullMessages)) r.fullMessages = [];
    r.fullMessages.push(item);
    if (r.fullMessages.length > 1000) {
      r.fullMessages = r.fullMessages.slice(-1000);
    }
    scheduleSaveSessionChatLog(r);

    var box = $('#hl-messages');
    if (!box) return;
    var prevScrollTop = Number(box.scrollTop) || 0;
    var shouldFollow = _state.messagesAutoFollow && isMessagesAtBottom(box);

    var row = document.createElement('div');
    row.className = 'hl-line role-' + item.senderRole;

    var tagMap = {
      user: '我',
      user_cohost: '连麦',
      char: 'Char',
      npc: 'NPC',
      gift: '礼物',
      ai_audience: 'AI观众',
      system: '系统'
    };
    var tagEl = document.createElement('em');
    tagEl.className = 'hl-tag';
    tagEl.textContent = tagMap[item.senderRole] || '弹幕';

    var bEl = document.createElement('b');
    bEl.textContent = item.sender + '：';

    var spanEl = document.createElement('span');
    spanEl.textContent = item.text;

    row.appendChild(tagEl);
    row.appendChild(bEl);
    row.appendChild(spanEl);
    box.appendChild(row);
    while (box.children.length > 120) {
      box.removeChild(box.firstChild);
    }

    if (shouldFollow) {
      box.scrollTop = box.scrollHeight;
      _state.messagesAutoFollow = true;
      _state.unreadWhileScrolled = 0;
    } else {
      box.scrollTop = prevScrollTop;
      _state.messagesAutoFollow = false;
      _state.unreadWhileScrolled = (_state.unreadWhileScrolled || 0) + 1;
    }
    syncLatestMsgButton();
  }

  async function maybePlayCharTts(text, charId, guard) {
    var s = _state.settings || {};
    if (s.voice === 'text') return;
    var ttsSeq = ++_state.ttsRequestSeq;
    try {
      var res = await aiMod().speakCharLine(text, charId, s.voiceVol);
      if (guard.isStale() || ttsSeq !== _state.ttsRequestSeq) {
        if (res && res.blobUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
          try { URL.revokeObjectURL(res.blobUrl); } catch (_) {}
        }
        return;
      }
      if (!res || !res.played || !res.blobUrl) return;
      stopTtsPlayback();
      _state.ttsRequestSeq = ttsSeq;
      _ttsBlobUrl = res.blobUrl;
      if (typeof Audio !== 'undefined') {
        var audio = new Audio(res.blobUrl);
        _ttsAudioEl = audio;
        audio.volume = res.volume;
        setAsmrDucking(true);
        var clearTts = function() {
          if (_ttsAudioEl === audio) _ttsAudioEl = null;
          setAsmrDucking(false);
          if (_ttsBlobUrl === res.blobUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
            try { URL.revokeObjectURL(res.blobUrl); } catch (_) {}
            _ttsBlobUrl = '';
          }
        };
        audio.addEventListener('ended', clearTts);
        audio.addEventListener('error', clearTts);
        await audio.play().catch(clearTts);
      }
    } catch (_) {
      setAsmrDucking(false);
    }
  }

  function selectAiResponders(r, userText) {
    var actors = getAllRoomActors(r);
    if (!actors.length) return [];
    if (actors.length === 1) return [actors[0]];

    var lower = String(userText || '').toLowerCase();
    var mentioned = actors.filter(function(a) {
      return a && a.name && lower.indexOf(String(a.name).toLowerCase()) >= 0;
    });
    if (mentioned.length > 0) {
      return mentioned.slice(0, 2);
    }

    var partner = getConnectionPartner(r);
    if (partner) {
      var others = actors.filter(function(a) { return String(a.id) !== String(partner.id); });
      if (!others.length) return [partner];
      var otherPick = others[r.aiRoundRobinIndex % others.length];
      r.aiRoundRobinIndex = (r.aiRoundRobinIndex || 0) + 1;
      return [partner, otherPick].slice(0, 2);
    }

    // 轮转挑选最多 2 位受邀角色回应，防止群聊式刷屏和无限并发
    var count = Math.min(2, actors.length);
    var picks = [];
    var start = (r.aiRoundRobinIndex || 0) % actors.length;
    for (var i = 0; i < count; i++) {
      picks.push(actors[(start + i) % actors.length]);
    }
    r.aiRoundRobinIndex = (start + count) % actors.length;
    return picks;
  }

  function enqueueAiTurn(actorObj, opts) {
    var r = _state.room;
    if (!r || !actorObj || !actorObj.id) return;
    if (!isActorActiveInRoom(r, actorObj.id)) return;
    opts = opts || {};

    if (_state.aiQueue.length >= AI_QUEUE_LIMIT) {
      // 保留高优先级开场/送礼/连麦事件，裁剪旧的非定向排队任务
      var dropIdx = _state.aiQueue.findIndex(function(t) { return t && t.opts && t.opts.triggerType === 'chat'; });
      if (dropIdx >= 0) _state.aiQueue.splice(dropIdx, 1);
      else _state.aiQueue.shift();
    }

    _state.aiQueue.push({
      epoch: _state.aiEpoch,
      sessionId: r.sessionId,
      logSessionId: r.logSessionId,
      hostType: r.hostType || 'char',
      hostId: String(r.hostId || ''),
      actor: actorObj,
      opts: opts
    });
    if (!_state.aiRunning) {
      drainAiQueue();
    }
  }

  async function runSingleAiTask(task) {
    var r = _state.room;
    if (!r || !task || !task.actor || !task.actor.id) return;
    var actor = task.actor;
    var opts = task.opts || {};
    var mySession = task.sessionId;
    var myLogSession = task.logSessionId || '';
    var myHostType = task.hostType || 'char';
    var myHostId = String(task.hostId || '');
    var myEpoch = task.epoch;
    var myActorId = String(actor.id);
    var myReqSeq = ++_state.aiRequestSeq;

    var guard = {
      isStale: function() {
        return !_state.room ||
          _state.aiEpoch !== myEpoch ||
          _state.room.sessionId !== mySession ||
          (_state.room.logSessionId || '') !== myLogSession ||
          (_state.room.hostType || 'char') !== myHostType ||
          String(_state.room.hostId || '') !== myHostId ||
          !isActorActiveInRoom(_state.room, myActorId);
      },
      isLatest: function() {
        return !guard.isStale() && _state.aiRequestSeq === myReqSeq;
      }
    };

    if (guard.isStale()) return;

    var partner = getConnectionPartner(r);
    var isCohost = Boolean(_state.connectionType && partner && String(partner.id) === myActorId);
    var companionNames = getAllRoomActors(r)
      .filter(function(a) { return a && String(a.id) !== myActorId; })
      .map(function(a) { return a.name + (a.roleType === 'npc' ? '(NPC)' : '(Char)'); });

    var reply = await aiMod().generateCharLiveReply({
      charObj: actor,
      userObj: _state.user,
      hostMode: r.hostMode,
      hostType: r.hostType,
      hostId: r.hostId,
      hostName: r.hostName,
      program: r.program,
      programTitle: r.title,
      programStyle: r.style,
      connectionType: isCohost ? _state.connectionType : '',
      isCohost: isCohost,
      companionNames: companionNames,
      cameraActive: Boolean(_state.cameraStream && isCohost),
      settings: _state.settings,
      recentLines: r.messages,
      triggerType: opts.triggerType || 'chat',
      giftName: opts.giftName || '',
      userPrompt: opts.userPrompt || '',
      isStale: guard.isStale
    });

    if (!reply || reply.stale || reply.noChar || guard.isStale()) return;

    var msgRole = actor.roleType === 'npc' ? 'npc' : 'char';
    if (reply.speech) {
      if (_state.settings && _state.settings.voice === 'audio' && !_state.settings.captions) {
        var ttsCheck = actor.roleType === 'npc' ? { apiReady: false, voiceId: '' } : await aiMod().getMinimaxStatus(myActorId);
        if (guard.isStale()) return;
        if (!ttsCheck.apiReady || !ttsCheck.voiceId) {
          appendRoomMessage({
            senderRole: msgRole,
            senderId: myActorId,
            sender: actor.name,
            messageType: 'chat',
            source: msgRole,
            text: reply.speech
          });
        } else {
          appendRoomMessage({
            senderRole: msgRole,
            senderId: myActorId,
            sender: actor.name + '（语音）',
            messageType: 'chat',
            source: msgRole,
            text: '🔊 ' + reply.speech
          });
        }
      } else {
        appendRoomMessage({
          senderRole: msgRole,
          senderId: myActorId,
          sender: actor.name,
          messageType: 'chat',
          source: msgRole,
          text: reply.speech
        });
      }
      if (guard.isLatest() && actor.roleType !== 'npc') {
        maybePlayCharTts(reply.speech, myActorId, guard);
      }
    }

    // 节制型 AI 观众气氛弹幕（明确标注 isSimAudience，绝不冒充真人，间隔 >= 12s）
    if (reply.audience && _state.settings && _state.settings.sim && r.hostMode !== 'private') {
      var now = Date.now();
      if (now - (r.lastAiAudienceAt || 0) >= 12000) {
        r.lastAiAudienceAt = now;
        appendRoomMessage({
          senderRole: 'ai_audience',
          sender: aiMod().pickAudienceName(),
          messageType: 'ai_audience',
          source: 'ai_sim',
          isSimAudience: true,
          text: reply.audience
        });
      }
    }
  }

  async function drainAiQueue() {
    if (_state.aiRunning) return;
    _state.aiRunning = true;
    try {
      while (_state.aiQueue.length > 0) {
        var task = _state.aiQueue.shift();
        await runSingleAiTask(task);
      }
    } finally {
      _state.aiRunning = false;
    }
  }

  // 兼容旧单角色入口
  function triggerCharAiTurn(opts) {
    var r = _state.room;
    if (!r) return;
    var target = (opts && opts.targetActor) || getConnectionPartner(r) || getAllRoomActors(r)[0] || null;
    if (target) enqueueAiTurn(target, opts);
  }

  function sendRoomMessage() {
    var r = _state.room;
    var inputEl = $('#hl-message-input');
    if (!r || !inputEl) return;
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';

    var senderName = r.hostMode === 'user' ? (_state.user.name + '（主播）') : _state.user.name;
    appendRoomMessage({
      senderRole: 'user',
      senderId: _state.user.id,
      sender: senderName,
      messageType: 'chat',
      source: 'danmaku',
      text: text
    });

    var responders = selectAiResponders(r, text);
    for (var i = 0; i < responders.length; i++) {
      enqueueAiTurn(responders[i], { triggerType: 'chat', userPrompt: '' });
    }
  }

  function sendCohostMessage(text, sourceKind) {
    var r = _state.room;
    var clean = String(text || '').trim();
    if (!r || !clean) return;
    var isVoice = sourceKind === 'voice';
    var senderName = _state.user.name + (isVoice ? '（语音连麦）' : '（文字连麦）');
    appendRoomMessage({
      senderRole: 'user_cohost',
      senderId: _state.user.id,
      sender: senderName,
      messageType: isVoice ? 'cohost_voice_asr' : 'cohost_text',
      source: isVoice ? 'voice_asr' : 'text_call',
      text: clean
    });
    var partner = getConnectionPartner(r) || getAllRoomActors(r)[0] || null;
    if (partner) {
      enqueueAiTurn(partner, { triggerType: 'cohost', userPrompt: '' });
    }
  }

  // ===== 点赞、官方金币礼物 & 互动小游戏 =====
  function handleHeartClick() {
    if (!_state.room) return;
    _state.room.likes++;
    var likeEl = $('#hl-like-count');
    if (likeEl) likeEl.textContent = String(_state.room.likes);
    showToast('♡ 已点赞（免费互动）');
  }

  function spawnGiftBurst(text) {
    var roomEl = $('#hl-room');
    if (!roomEl) return;
    var el = document.createElement('div');
    el.className = 'hl-gift-burst';
    el.textContent = text;
    roomEl.appendChild(el);
    setTimeout(function() { el.remove(); }, 1850);
  }

  async function openGiftDrawer() {
    if (!_state.room) return;
    if (_state.room.hostMode === 'private') {
      showToast('私人连线不展示公开礼物打赏');
      return;
    }
    var r = _state.room;
    var actors = getAllRoomActors(r);
    if (!_state.selectedGiftRecipientId || !isActorActiveInRoom(r, _state.selectedGiftRecipientId)) {
      var def = getDefaultGiftRecipient(r);
      _state.selectedGiftRecipientId = def ? String(def.id) : '';
    }
    var recWrap = $('#hl-gift-recipient-wrap');
    var recSel = $('#hl-gift-recipient');
    if (recWrap && recSel) {
      if (actors.length > 1 || (r.hostMode === 'user' && actors.length > 0)) {
        recWrap.style.display = 'block';
        recSel.innerHTML = actors.map(function(a) {
          var isHostTag = (r.hostMode !== 'user' && String(a.id) === String(r.hostId)) ? ' · 主播' : '';
          return '<option value="' + esc(a.id) + '">' + esc(a.name) + '（' + (a.roleType === 'npc' ? 'NPC' : 'Char') + isHostTag + '）</option>';
        }).join('');
        recSel.value = _state.selectedGiftRecipientId || String(actors[0].id);
        recSel.onchange = function() {
          _state.selectedGiftRecipientId = recSel.value;
          _state.giftConfirmPending = null;
          updateGiftConfirmBar();
        };
      } else {
        recWrap.style.display = 'none';
      }
    }

    _state.giftConfirmPending = null;
    var bal = await aiMod().getEconomyBalance();
    var balEl = $('#hl-gift-balance');
    if (balEl) {
      balEl.textContent = bal == null ? '未连接金币钱包' : ('当前可用金币：' + bal + ' 枚');
    }
    var grid = $('#hl-gift-grid');
    if (grid) {
      grid.innerHTML = aiMod().GIFT_CATALOG.map(function(g) {
        var sel = g.id === _state.selectedGiftId;
        return '<button type="button" class="hl-gift-card' + (sel ? ' selected' : '') + '" data-gift-id="' + esc(g.id) + '">' +
          '<span class="hl-gift-icon">' + g.icon + '</span>' +
          '<span><b>' + esc(g.name) + '</b><small>' + (g.free ? '免费 · 0 金币' : (g.price + ' 金币')) + '</small></span>' +
        '</button>';
      }).join('');
      $$('[data-gift-id]').forEach(function(btn) {
        btn.onclick = function() {
          _state.selectedGiftId = btn.dataset.giftId;
          _state.giftConfirmPending = null;
          updateGiftConfirmBar();
          $$('[data-gift-id]').forEach(function(b) {
            b.classList.toggle('selected', b.dataset.giftId === _state.selectedGiftId);
          });
        };
      });
    }
    updateGiftConfirmBar();
    openModal('gift');
  }

  function updateGiftConfirmBar() {
    var gift = aiMod().GIFT_CATALOG.find(function(g) { return g.id === _state.selectedGiftId; }) || aiMod().GIFT_CATALOG[0];
    var btn = $('#hl-gift-send-btn');
    var tip = $('#hl-gift-tip');
    if (!btn || !tip) return;
    var rec = getDefaultGiftRecipient(_state.room);
    if (gift.free) {
      btn.textContent = '送出免费小心意 ' + gift.icon;
      tip.textContent = gift.desc;
    } else if (_state.room && _state.room.hostMode === 'user' && !rec) {
      btn.textContent = '需先邀请嘉宾才可送金币礼物';
      tip.textContent = '当前为个人独自开播，未邀请接收礼物的 Char / NPC；可发送免费小心意或先点击顶部「+ 邀请」。';
    } else if (_state.giftConfirmPending === gift.id) {
      btn.textContent = '确认支付 ' + gift.price + ' 金币送给 ' + (rec ? rec.name : '对方');
      tip.textContent = '⚠️ 再次点击将通过官方共享经济扣除 ' + gift.price + ' 金币';
    } else {
      btn.textContent = '送出「' + gift.name + '」（' + gift.price + ' 金币）';
      tip.textContent = '付费礼物需二次确认，扣除真实共享金币。';
    }
  }

  async function submitGiftClick() {
    if (!_state.room || _state.giftSubmitting) return;
    var gift = aiMod().GIFT_CATALOG.find(function(g) { return g.id === _state.selectedGiftId; }) || aiMod().GIFT_CATALOG[0];
    var recipient = getDefaultGiftRecipient(_state.room);
    if (!gift.free && _state.room.hostMode === 'user' && !recipient) {
      showToast('当前尚未邀请嘉宾，请先邀请 Char / NPC 后再送出金币礼物');
      return;
    }
    if (!gift.free && _state.giftConfirmPending !== gift.id) {
      _state.giftConfirmPending = gift.id;
      updateGiftConfirmBar();
      return;
    }

    _state.giftSubmitting = true;
    var sendBtn = $('#hl-gift-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    try {
      var res = await aiMod().sendGiftTransaction({ gift: gift, charObj: recipient });
      if (!res.ok) {
        showToast(res.msg || '送礼失败');
        return;
      }
      _state.giftConfirmPending = null;
      if (!res.free) {
        _state.room.giftsTotalCoins += Number(res.coinsSpent || 0);
      }
      closeModal();
      var toText = recipient ? (' 给 ' + recipient.name) : '';
      var label = gift.icon + ' ' + _state.user.name + ' 送出了「' + gift.name + '」' + toText + (res.free ? '（免费互动）' : '（-' + res.coinsSpent + ' 金币）');
      spawnGiftBurst(gift.icon + (recipient ? (' ' + recipient.name + ' 收到 ' + gift.name + '！') : (' 点亮了 ' + gift.name + '！')));
      appendRoomMessage({
        senderRole: 'gift',
        senderId: _state.user.id,
        sender: '心意礼物',
        messageType: 'gift',
        source: 'gift',
        text: label
      });
      showToast(res.free ? '已送出免费小心意 ✨' : ('送礼成功！剩余金币：' + res.remaining));

      if (recipient) {
        enqueueAiTurn(recipient, {
          triggerType: 'gift',
          giftName: gift.name,
          userPrompt: _state.user.name + ' 刚刚在直播间给你送出了「' + gift.name + '」，请开心又自然地道谢。'
        });
      }
    } finally {
      _state.giftSubmitting = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  // 轻量互动小游戏：心动默契问答 / 真心话挑战
  var INTERACT_PROMPTS = [
    '默契挑战：如果今晚可以一起瞬移去一个地方散步，你最想带我去哪里？',
    '快问快答：用三个词形容现在直播间里的氛围！',
    '真心话时刻：你今天最想悄悄对我说的一件小事是什么？',
    '接龙挑战：我先说前半句——“今晚的月亮看起来……”请你接下去！'
  ];

  function openInteractGameModal() {
    if (!_state.room) return;
    var gs = _state.room.gameSession;
    var promptText = INTERACT_PROMPTS[gs.round % INTERACT_PROMPTS.length];
    gs.prompt = promptText;
    var qEl = $('#hl-interact-prompt');
    var statEl = $('#hl-interact-stats');
    var customInput = $('#hl-interact-input');
    if (qEl) qEl.textContent = promptText;
    if (statEl) statEl.textContent = '本场已完成互动回合：' + gs.round + ' 次';
    if (customInput) customInput.value = '';
    openModal('interact');
  }

  function triggerInteractRound(customText) {
    if (!_state.room) return;
    var r = _state.room;
    var gs = r.gameSession;
    gs.round++;
    var msgText = customText && customText.trim() ? customText.trim() : gs.prompt;
    closeModal();
    appendRoomMessage({
      senderRole: 'user',
      senderId: _state.user.id,
      sender: _state.user.name + ' · 互动点单',
      messageType: 'chat',
      source: 'interact_game',
      text: msgText
    });
    var responders = selectAiResponders(r, msgText);
    if (responders.length) {
      for (var i = 0; i < responders.length; i++) {
        enqueueAiTurn(responders[i], {
          triggerType: 'interact_game',
          userPrompt: _state.user.name + ' 在直播间「互动游戏」环节向你发起了第 ' + gs.round + ' 轮挑战：' + msgText + '。请直接配合参与游戏并有趣地回应！'
        });
      }
    } else {
      appendRoomMessage({
        senderRole: 'system',
        sender: '互动提示',
        messageType: 'system',
        source: 'system',
        text: '已发布互动话题；点击顶部「+ 邀请」邀请 Char 或 NPC 后即可由 Ta 实时接招回应 ♡'
      });
    }
  }

  // ===== 应用内可拖动悬浮小窗 (仅应用内部页面显示，严格保留会话与音频状态) =====
  function getHostAppContainer() {
    if (!global.document) return null;
    return global.document.getElementById('app') || global.document.body;
  }

  function removeMiniWindow() {
    _state.minimized = false;
    if (_state.pageEl) _state.pageEl.classList.remove('hl-is-minimized');
    if (_state.miniEl && _state.miniEl.parentNode) {
      _state.miniEl.parentNode.removeChild(_state.miniEl);
    }
    _state.miniEl = null;
    if (global.document) {
      var stray = global.document.getElementById('hl-mini-window');
      if (stray && stray.parentNode) stray.parentNode.removeChild(stray);
    }
  }

  function clampMiniPosition(miniEl, left, top) {
    var container = getHostAppContainer();
    var cRect = container && typeof container.getBoundingClientRect === 'function' ? container.getBoundingClientRect() : null;
    var cw = (container && container.clientWidth) || (cRect && cRect.width) || Number(global.innerWidth || 375);
    var ch = (container && container.clientHeight) || (cRect && cRect.height) || Number(global.innerHeight || 667);
    var mw = miniEl.offsetWidth || 168;
    var mh = miniEl.offsetHeight || 96;
    var maxL = Math.max(8, cw - mw - 8);
    var maxT = Math.max(12, ch - mh - 14);
    var nextL = Math.max(8, Math.min(maxL, left));
    var nextT = Math.max(12, Math.min(maxT, top));
    miniEl.style.left = Math.round(nextL) + 'px';
    miniEl.style.top = Math.round(nextT) + 'px';
    miniEl.style.right = 'auto';
    miniEl.style.bottom = 'auto';
    _state.miniPos = { left: Math.round(nextL), top: Math.round(nextT) };
  }

  function getMiniAudioLabel(r) {
    var hasAsmrSound = Boolean(_asmrAudioEl && !_asmrAudioEl.paused && r && (r.program === 'asmr' || r.program === 'radio'));
    var hasMic = Boolean(_state.micStream);
    var ttsOn = Boolean(_state.settings && _state.settings.voice !== 'text');
    if (hasMic && hasAsmrSound) return '🎙 麦开 · 🎧 背景音';
    if (hasMic) return '🎙 麦已开启';
    if (hasAsmrSound) return (r && r.program === 'radio') ? '📻 电台音频中' : '🎧 ASMR 播放中';
    if (!ttsOn && !_state.cameraStream) return '🔇 静音字幕中';
    if (r && r.program === 'asmr') return '🔇 定时静音陪伴';
    return ttsOn ? '🔊 语音开' : '🔇 静音中';
  }

  function updateMiniWindowChrome() {
    var mini = _state.miniEl;
    var r = _state.room;
    if (!mini || !_state.minimized || !r) return;
    var prog = (aiMod() && aiMod().PROGRAMS[r.program]) || { icon: '💬', label: '直播中' };
    var titleEl = mini.querySelector('#hl-mini-title');
    var statusEl = mini.querySelector('#hl-mini-status');
    var audioEl = mini.querySelector('#hl-mini-audio');
    var avatarEl = mini.querySelector('#hl-mini-avatar');

    var hostLabel = r.hostMode === 'user'
      ? (_state.user.name + '（我）')
      : ((r.hostCharObj && r.hostCharObj.name) || r.hostName || (r.hostType === 'npc' ? 'NPC' : 'Char')) + (r.hostType === 'npc' ? ' [NPC]' : '');
    if (titleEl) titleEl.textContent = hostLabel;

    var statusText = prog.icon + ' ' + prog.label;
    if (r.program === 'asmr' && _state.asmrDeadlineMs > Date.now()) {
      statusText = '🎧 剩' + Math.ceil((_state.asmrDeadlineMs - Date.now()) / 60000) + '分';
    } else if (r.hostMode === 'user' && r.cohostCharObj) {
      statusText = '🎙 连麦 ' + r.cohostCharObj.name;
    } else if (r.invitedViewers && r.invitedViewers.length > 0) {
      statusText = prog.icon + ' ' + r.invitedViewers.length + '人观看';
    }
    if (statusEl) statusEl.textContent = statusText;
    if (audioEl) audioEl.textContent = getMiniAudioLabel(r);

    if (avatarEl) {
      var hostActor = r.hostMode === 'user' ? _state.user : r.hostCharObj;
      var src = (hostActor && hostActor.avatar) || '';
      if (src) {
        avatarEl.innerHTML = '<img src="' + esc(src) + '" alt="' + esc(hostLabel) + '">';
      } else {
        avatarEl.textContent = r.hostMode === 'user' ? '🎀' : ((hostActor && hostActor.emojiFallback) || (r.hostType === 'npc' ? '🎭' : '🌸'));
      }
    }
  }

  function bindMiniWindowInteractions(mini) {
    var startX = 0;
    var startY = 0;
    var originLeft = 0;
    var originTop = 0;
    var dragging = false;
    var moved = false;

    var getPoint = function(ev) {
      if (ev.touches && ev.touches[0]) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      return { x: Number(ev.clientX) || 0, y: Number(ev.clientY) || 0 };
    };

    var onStart = function(ev) {
      var tgt = ev.target;
      if (tgt && tgt.closest && tgt.closest('button')) return;
      var pt = getPoint(ev);
      dragging = true;
      moved = false;
      startX = pt.x;
      startY = pt.y;
      var parsedLeft = parseFloat(mini.style.left);
      var parsedTop = parseFloat(mini.style.top);
      originLeft = Number.isFinite(parsedLeft) ? parsedLeft : (mini.offsetLeft || 12);
      originTop = Number.isFinite(parsedTop) ? parsedTop : (mini.offsetTop || 12);
    };

    var onMove = function(ev) {
      if (!dragging) return;
      var pt = getPoint(ev);
      var dx = pt.x - startX;
      var dy = pt.y - startY;
      if (!moved && Math.hypot(dx, dy) > 6) moved = true;
      if (moved) {
        if (ev.cancelable) ev.preventDefault();
        clampMiniPosition(mini, originLeft + dx, originTop + dy);
      }
    };

    var onEnd = function() {
      if (!dragging) return;
      dragging = false;
      if (!moved) {
        restoreFromMiniWindow();
      }
    };

    mini.addEventListener('pointerdown', onStart);
    global.addEventListener('pointermove', onMove);
    global.addEventListener('pointerup', onEnd);
    mini.addEventListener('touchstart', onStart, { passive: true });
    mini.addEventListener('touchmove', onMove, { passive: false });
    mini.addEventListener('touchend', onEnd);

    var restoreBtn = mini.querySelector('#hl-mini-restore');
    var closeBtn = mini.querySelector('#hl-mini-close');
    if (restoreBtn) {
      restoreBtn.onclick = function(ev) {
        ev.stopPropagation();
        restoreFromMiniWindow();
      };
    }
    if (closeBtn) {
      closeBtn.onclick = async function(ev) {
        ev.stopPropagation();
        if (typeof global.confirm === 'function' && !global.confirm('关闭悬浮小窗并结束当前直播？（将自动保存直播手账与聊天记录）')) {
          return;
        }
        await finishAndLeaveRoom(false, { closeAppIfMinimized: true });
      };
    }

    mini._cleanupDrag = function() {
      global.removeEventListener('pointermove', onMove);
      global.removeEventListener('pointerup', onEnd);
    };
  }

  function minimizeLiveRoom() {
    if (!_state.room || !_state.pageEl) return;
    if (_state.minimized && _state.miniEl) return;
    closeModal();
    removeMiniWindow();
    _state.minimized = true;
    _state.pageEl.classList.add('hl-is-minimized');

    var container = getHostAppContainer();
    if (!container || !global.document) return;
    var mini = global.document.createElement('div');
    mini.id = 'hl-mini-window';
    mini.className = 'hl-mini-window';
    mini.setAttribute('role', 'region');
    mini.setAttribute('aria-label', '心动直播应用内悬浮小窗');
    mini.innerHTML =
      '<div class="hl-mini-head">' +
        '<span class="hl-mini-live-dot">LIVE</span>' +
        '<span class="hl-mini-scope">应用内小窗</span>' +
        '<div class="hl-mini-btns">' +
          '<button type="button" id="hl-mini-restore" class="hl-mini-btn" title="恢复全屏直播" aria-label="恢复直播间">⤢</button>' +
          '<button type="button" id="hl-mini-close" class="hl-mini-btn close" title="结束直播并关闭小窗" aria-label="结束直播">×</button>' +
        '</div>' +
      '</div>' +
      '<div class="hl-mini-body">' +
        '<div class="hl-mini-avatar" id="hl-mini-avatar">🌸</div>' +
        '<div class="hl-mini-info">' +
          '<b id="hl-mini-title">直播中</b>' +
          '<small id="hl-mini-status">💬 闲聊直播</small>' +
          '<span id="hl-mini-audio" class="hl-mini-audio">🔊 语音开</span>' +
        '</div>' +
      '</div>';

    container.appendChild(mini);
    _state.miniEl = mini;

    var cw = container.clientWidth || Number(global.innerWidth || 375);
    var ch = container.clientHeight || Number(global.innerHeight || 667);
    var defL = _state.miniPos ? _state.miniPos.left : Math.max(8, cw - 184);
    var defT = _state.miniPos ? _state.miniPos.top : Math.max(16, ch - 190);
    clampMiniPosition(mini, defL, defT);

    bindMiniWindowInteractions(mini);
    updateMiniWindowChrome();
    showToast('已缩小为应用内悬浮小窗，可拖动或浏览其他页面');
  }

  function restoreFromMiniWindow() {
    var mini = _state.miniEl;
    if (mini && typeof mini._cleanupDrag === 'function') {
      try { mini._cleanupDrag(); } catch (_) {}
    }
    removeMiniWindow();
    if (_state.pageEl) {
      _state.pageEl.classList.remove('hl-is-minimized');
      _state.pageEl.classList.add('open');
      // 若期间打开了其他高层全屏页面（如浏览器/时间页等），抬高本页层级到当前最高但低于全局弹窗(9000)
      try {
        var maxZ = 66;
        var hostContainer = getHostAppContainer();
        if (hostContainer && hostContainer.children && global.getComputedStyle) {
          Array.from(hostContainer.children).forEach(function(el) {
            if (!el || el === _state.pageEl || !el.classList || !el.classList.contains('full-page')) return;
            var z = parseInt(global.getComputedStyle(el).zIndex, 10);
            if (Number.isFinite(z) && z >= maxZ && z < 4000) maxZ = z + 1;
          });
        }
        _state.pageEl.style.zIndex = String(maxZ);
      } catch (_) {}
    }
    if (_state.room) {
      switchView('live');
      renderRoomIdentityChrome();
      updateRoomProgramChrome();
      checkAsmrTimer();
    }
  }

  // ===== 退出直播、完整聊天日志落盘、手账与长期记忆手动确认 =====
  async function finishAndLeaveRoom(autoFinished, leaveOpts) {
    leaveOpts = leaveOpts || {};
    var wasMinimized = Boolean(_state.minimized);
    var r = _state.room;
    var flushedCount = r ? await flushSessionChatLog(r) : 0;

    if (_state.miniEl && typeof _state.miniEl._cleanupDrag === 'function') {
      try { _state.miniEl._cleanupDrag(); } catch (_) {}
    }
    removeMiniWindow();
    cleanupAllMedia();
    _state.room = null;
    _state.connectionType = '';
    _state.pendingConnectAfterInvite = false;
    var roomEl = $('#hl-room');
    if (roomEl) roomEl.classList.remove('hl-kb-open', 'hl-has-connection', 'hl-connection-active', 'hl-connection-swapped');
    if (_state.pageEl) {
      _state.pageEl.style.height = '';
      _state.pageEl.style.maxHeight = '';
      _state.pageEl.style.zIndex = '';
    }

    var saved = null;
    if (r && ((r.fullMessages && r.fullMessages.length > 0) || r.messages.length > 0) && storage()) {
      var hostType = r.hostType || (r.hostMode === 'user' ? 'user' : r.hostMode === 'npc' ? 'npc' : 'char');
      var hostId = r.hostId || (hostType === 'user' ? String((_state.user && _state.user.id) || 'user') : String((r.hostCharObj && r.hostCharObj.id) || ''));
      var hostName = r.hostName || (hostType === 'user' ? ((_state.user && _state.user.name) || '我') : ((r.hostCharObj && r.hostCharObj.name) || 'Char'));
      var participants = getAllRoomActors(r).map(function(p) {
        return { id: String(p.id), name: p.name, roleType: p.roleType === 'npc' ? 'npc' : 'char' };
      });
      var realChars = participants.filter(function(p) { return p.roleType === 'char'; });
      var npcs = participants.filter(function(p) { return p.roleType === 'npc'; });
      var primaryChar = realChars[0] || participants[0] || null;
      var cId = hostType === 'user' ? (primaryChar ? primaryChar.id : '') : hostId;
      var cName = hostType === 'user'
        ? (participants.length > 1
            ? (participants.map(function(p) { return p.name; }).slice(0, 3).join('、') + (participants.length > 3 ? '等' + participants.length + '人' : ''))
            : (primaryChar ? primaryChar.name : '个人直播（未邀请嘉宾）'))
        : hostName;
      var charType = hostType === 'npc'
        ? 'npc'
        : realChars.length > 0 && npcs.length > 0
          ? 'mixed'
          : (realChars.length === 0 && npcs.length > 0) ? 'npc' : 'char';
      var hasRealChar = hostType === 'npc'
        ? false
        : (hostType === 'char' || (hostType === 'user' && realChars.length > 0));
      var endedAt = Date.now();
      var totalCount = Math.max(Number(flushedCount) || 0, (r.fullMessages && r.fullMessages.length) || r.messages.length);

      var draft = aiMod().buildJournalDraft({
        hostMode: r.hostMode,
        hostType: hostType,
        hostId: hostId,
        hostName: hostName,
        charId: cId,
        charName: cName,
        invitedParticipants: participants,
        program: r.program,
        title: r.title,
        startedAt: r.startedAt,
        endedAt: endedAt,
        msgCount: totalCount,
        giftsTotalCoins: r.giftsTotalCoins,
        cohostUsed: r.cohostUsed,
        asmrUsed: r.asmrUsed
      });
      saved = await storage().addJournalEntry({
        ownerUid: _state.user.id,
        sessionId: r.logSessionId,
        hasChatLog: true,
        logMessageCount: totalCount,
        hostMode: r.hostMode,
        hostType: hostType,
        hostId: hostId,
        hostName: hostName,
        charId: cId,
        charName: cName,
        charType: charType,
        invitedParticipants: participants,
        hasRealChar: hasRealChar,
        program: r.program,
        programLabel: (aiMod().PROGRAMS[r.program] || aiMod().PROGRAMS.chat).label,
        title: r.title,
        summary: draft.content,
        giftsTotalCoins: r.giftsTotalCoins,
        msgCount: totalCount,
        cohostUsed: r.cohostUsed,
        asmrUsed: r.asmrUsed,
        startedAt: r.startedAt,
        endedAt: endedAt
      });
      _state.journals = await storage().loadJournals();
    }

    if (wasMinimized && leaveOpts.closeAppIfMinimized) {
      close(false);
      if (saved) showToast('直播已结束，已保存手账与完整聊天记录 ♡');
      return;
    }

    switchView('home');
    if (saved && _state.settings && _state.settings.savePrompt) {
      openSessionSummaryModal(saved, autoFinished);
    }
  }

  function leaveLiveRoomWithConfirm() {
    if (!_state.room) {
      switchView('home');
      return;
    }
    if (typeof global.confirm === 'function' && !global.confirm('离开当前直播间？（正在连接的连麦、麦克风、摄像头与 ASMR 音景会立即停止）')) {
      return;
    }
    finishAndLeaveRoom(false);
  }

  function openSessionSummaryModal(journal, autoFinished) {
    var box = $('#hl-summary-body');
    var rememberBtn = $('#hl-summary-remember');
    var replayBtn = $('#hl-summary-replay');
    var isNpcHost = Boolean(journal && (journal.hostType === 'npc' || journal.hostMode === 'npc'));
    var canWriteMem = Boolean(journal && !isNpcHost && journal.charId && journal.hasRealChar !== false && journal.charType !== 'npc');
    if (box) {
      box.innerHTML =
        '<div class="hl-plan-preview">' +
          '<b>' + esc(journal.title) + '</b><br>' +
          esc(journal.summary) +
        '</div>' +
        '<p class="hl-help">' +
          (autoFinished ? 'ASMR 定时已圆满结束。' : '本场直播已记录到「直播手账」，并保存了完整聊天记录。') +
          (canWriteMem
            ? '是否顺便将它写入「长期记忆」？（需您审阅确认，绝不自动写入）'
            : isNpcHost
              ? '本场为 NPC 主播独立直播记录，仅保存在手账与聊天回放中，不会写入任何 Char 长期记忆。'
              : (journal && journal.charType === 'npc'
                  ? '本场仅含 NPC 嘉宾互动，将保存在手账与聊天回放中而不写入 Char 长期记忆。'
                  : '本场为未绑定 Char 的个人开播记录，将保存在手账与聊天回放中而不写入角色长期记忆。')) +
        '</p>';
    }
    if (rememberBtn) {
      rememberBtn.style.display = canWriteMem ? '' : 'none';
    }
    if (replayBtn) {
      replayBtn.style.display = journal ? '' : 'none';
      replayBtn.onclick = function() {
        closeModal();
        openReplayView(journal, 'diary');
      };
    }
    _state.memoryDraft = journal;
    openModal('summary');
  }

  function openMemoryConfirmModal(journal) {
    if (!journal) return;
    _state.memoryDraft = journal;
    var charWrap = $('#hl-mem-char-wrap');
    var charSel = $('#hl-mem-char-select');
    var eligibleChars = Array.isArray(journal.invitedParticipants)
      ? journal.invitedParticipants.filter(function(p) { return p && p.roleType === 'char' && p.id; })
      : [];
    if (charWrap && charSel) {
      if (eligibleChars.length > 1) {
        charWrap.style.display = 'block';
        charSel.innerHTML = eligibleChars.map(function(c) {
          return '<option value="' + esc(c.id) + '">' + esc(c.name) + '（Char）</option>';
        }).join('');
        charSel.value = String(journal.charId || eligibleChars[0].id);
      } else {
        charWrap.style.display = 'none';
        charSel.innerHTML = '';
      }
    }
    var titleEl = $('#hl-mem-title');
    var contentEl = $('#hl-mem-content');
    var kwEl = $('#hl-mem-keywords');
    if (titleEl) titleEl.value = String(journal.title || '').slice(0, 30);
    if (contentEl) contentEl.value = String(journal.summary || '').slice(0, 150);
    if (kwEl) kwEl.value = ['心动直播', journal.programLabel || '直播', journal.charName || ''].filter(Boolean).join(', ');
    openModal('memory');
  }

  async function submitMemoryConfirm() {
    var journal = _state.memoryDraft;
    if (!journal) return;
    var title = ($('#hl-mem-title') || {}).value || '';
    var content = ($('#hl-mem-content') || {}).value || '';
    var kwRaw = ($('#hl-mem-keywords') || {}).value || '';
    var keywords = kwRaw.split(/[,，\s]+/).map(function(s) { return s.trim(); }).filter(Boolean);
    var charSel = $('#hl-mem-char-select');
    var targetCharId = (charSel && charSel.value) || journal.charId || '';

    var btn = $('#hl-mem-confirm-btn');
    if (btn) btn.disabled = true;
    try {
      var res = await aiMod().saveJournalToLongMemory({
        journal: journal,
        charId: targetCharId,
        title: title,
        content: content,
        keywords: keywords
      });
      if (!res.ok) {
        showToast(res.error || '保存长期记忆失败');
        return;
      }
      _state.journals = await storage().loadJournals();
      closeModal();
      showToast(res.duplicate ? '该直播已在长期记忆中 ✓' : '已写入长期记忆 ♡');
      if (_state.activeView === 'diary') refreshDiaryView();
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ===== 直播回放 / 完整聊天记录查看页 =====
  function renderReplayListHtml(messages, journal) {
    var hostType = (journal && journal.hostType) || (journal && journal.hostMode === 'npc' ? 'npc' : journal && journal.hostMode === 'user' ? 'user' : 'char');
    var hostId = journal && journal.hostId ? String(journal.hostId) : '';
    var tagLabels = {
      user: hostType === 'user' ? '主播 我' : '观众 我',
      user_cohost: '连麦发言',
      char: hostType === 'char' ? 'Char 主播' : 'Char',
      npc: hostType === 'npc' ? 'NPC 主播' : 'NPC',
      gift: '礼物互动',
      system: '直播事件',
      ai_audience: 'AI观众'
    };
    return messages.map(function(m) {
      var timeStr = new Date(m.createdAt || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      var sType = m.senderType || 'system';
      var badge = tagLabels[sType] || '消息';
      if ((sType === 'char' || sType === 'npc') && hostId && m.senderId && String(m.senderId) !== hostId) {
        badge = sType === 'npc' ? 'NPC 嘉宾' : 'Char 嘉宾';
      }
      return '<div class="hl-replay-msg role-' + esc(sType) + '">' +
        '<div class="hl-replay-msg-head">' +
          '<span class="hl-replay-badge role-' + esc(sType) + '">' + esc(badge) + '</span>' +
          '<b>' + esc(m.senderNameSnapshot || '未知') + '</b>' +
          '<small>' + esc(timeStr) + '</small>' +
        '</div>' +
        '<div class="hl-replay-msg-body">' + esc(m.content || '') + '</div>' +
      '</div>';
    }).join('');
  }

  async function renderReplayChunk(reset) {
    var j = _state.replayJournal;
    var bodyEl = $('#hl-replay-list');
    var metaEl = $('#hl-replay-meta');
    var simToggleWrap = $('#hl-replay-sim-wrap');
    if (!bodyEl || !j) return;

    if (reset) {
      _state.replayOffset = 0;
      _state.replayLoaded = [];
      bodyEl.innerHTML = '<div class="hl-note">正在读取本场聊天记录…</div>';
    }

    var res = await storage().loadSessionChatLog(j.sessionId, {
      offset: _state.replayOffset,
      limit: REPLAY_PAGE_SIZE,
      includeSimAudience: _state.replayIncludeSim
    });
    _state.replayMeta = res;

    var startStr = new Date(j.startedAt || Date.now()).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    var endStr = j.endedAt ? new Date(j.endedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    var hostIdentityText = j.hostType === 'npc'
      ? ('NPC 主播 · ' + (j.hostName || j.charName || 'NPC'))
      : j.hostType === 'user'
        ? ('User 主播 · ' + (j.hostName || _state.user.name || '我'))
        : ('Char 主播 · ' + (j.hostName || j.charName || 'Char'));
    if (metaEl) {
      metaEl.textContent = startStr + (endStr ? ('-' + endStr) : '') + ' · ' + hostIdentityText + ' · ' + (j.programLabel || '直播') +
        (res.exists ? (' · 共 ' + res.totalCount + ' 条记录') : '');
    }
    if (simToggleWrap) {
      simToggleWrap.style.display = (res.exists && res.simAudienceCount > 0) ? 'flex' : 'none';
    }

    if (!res.exists) {
      bodyEl.innerHTML =
        '<div class="hl-diarycard">' +
          '<b>📜 旧版未保存完整聊天记录</b>' +
          '<p>本场手账由早期版本记录（仅保存了直播摘要与基础统计），无法回溯逐条弹幕与对话；绝不会 AI 补全或伪造历史对话。</p>' +
          '<div class="hl-plan-preview">' + esc(j.summary || '') + '</div>' +
        '</div>';
      return;
    }

    _state.replayLoaded = _state.replayLoaded.concat(res.messages);
    _state.replayOffset = _state.replayLoaded.length;

    if (!_state.replayLoaded.length) {
      bodyEl.innerHTML =
        '<div class="hl-diarycard">' +
          '<b>💬 暂无符合条件的聊天记录</b>' +
          '<p>' + (res.simAudienceCount > 0 && !_state.replayIncludeSim ? '当前已隐藏 [AI观众] 气氛弹幕，开启上方开关可查看。' : '本场直播暂未产生已保存的聊天记录。') + '</p>' +
        '</div>';
      return;
    }

    var listHtml = renderReplayListHtml(_state.replayLoaded, j);
    var moreHtml = res.hasMore
      ? ('<div class="hl-replay-more"><button type="button" class="hl-plainbtn" id="hl-replay-load-more">加载更早记录（剩余 ' + (res.filteredCount - _state.replayLoaded.length) + ' 条）</button></div>')
      : '<div class="hl-replay-end">—— 已显示全部 ' + _state.replayLoaded.length + ' 条记录 ——</div>';

    bodyEl.innerHTML = listHtml + moreHtml;
    var moreBtn = $('#hl-replay-load-more');
    if (moreBtn) {
      moreBtn.onclick = function() {
        renderReplayChunk(false);
      };
    }
  }

  async function openReplayView(journal, returnView) {
    if (!journal) return;
    _state.replayJournal = journal;
    _state.replayReturnView = returnView || 'diary';
    _state.replayIncludeSim = true;
    var simChk = $('#hl-replay-sim-toggle');
    if (simChk) simChk.checked = true;
    var headTitle = $('#hl-replay-title');
    if (headTitle) headTitle.textContent = journal.title || '本场聊天记录';
    switchView('replay');
    await renderReplayChunk(true);
  }

  // ===== 直播手账页面 =====
  async function refreshDiaryView() {
    var listEl = $('#hl-diary-list');
    if (!listEl) return;
    _state.journals = await storage().loadJournals();

    // 校验长期记忆是否存在（若用户在记忆长廊删除了该记忆，自动回退为未保存状态）
    var existingMemIds = new Set();
    try {
      if (global.db && global.db.memories) {
        var memRows = await global.db.memories.toArray();
        memRows.forEach(function(m) { if (m && m.id) existingMemIds.add(Number(m.id)); });
      }
    } catch (_) {}

    if (!_state.journals.length) {
      listEl.innerHTML =
        '<div class="hl-diarycard">' +
          '<b>📖 我的直播手账</b>' +
          '<p>这里只记录真实完成过的直播时刻（包含节目、多人陪伴、连麦、礼物与完整聊天回放），绝不伪造虚构记录。去大厅开一场直播吧 ♡</p>' +
        '</div>';
      return;
    }

    listEl.innerHTML = _state.journals.map(function(j) {
      var dateStr = new Date(j.startedAt || Date.now()).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      var endStr = j.endedAt ? new Date(j.endedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
      var timeRangeStr = endStr ? (dateStr + '~' + endStr) : dateStr;
      var memAlive = Boolean(j.memoryId && existingMemIds.has(Number(j.memoryId)));
      var isNpcHost = j.hostType === 'npc' || j.hostMode === 'npc';
      var hasEligibleChar = Boolean(!isNpcHost && j.charId && j.hasRealChar !== false && j.charType !== 'npc');
      var memBtnHtml = !hasEligibleChar
        ? '<span class="hl-plainbtn" style="padding:6px 11px;font-size:11px;color:#8e7994">' + (isNpcHost ? 'NPC主播·不写记忆' : (j.charType === 'npc' ? 'NPC陪伴·不写记忆' : '个人独播手账')) + '</span>'
        : memAlive
          ? '<span class="hl-plainbtn" style="padding:6px 11px;font-size:11px;color:#3d8462;border-color:#bfe2cf">✓ 已写入长期记忆</span>'
          : '<button type="button" class="hl-pinkbtn" style="padding:7px 12px;font-size:11px" data-jnl-remember="' + esc(j.id) + '">记住这场直播</button>';
      var hostBadge = isNpcHost
        ? '<span class="hl-tag hl-host-type-tag npc">NPC 主播</span>'
        : j.hostType === 'user'
          ? '<span class="hl-tag hl-host-type-tag user">User 主播</span>'
          : '<span class="hl-tag hl-host-type-tag char">Char 主播</span>';
      var typeBadge = j.charType === 'mixed'
        ? '<span class="hl-tag" style="background:#eaf5ef;color:#3a7a5c">多人</span>'
        : (j.invitedParticipants && j.invitedParticipants.length > 1)
          ? '<span class="hl-tag" style="background:#eaf5ef;color:#3a7a5c">多人</span>'
          : '';
      var hostDisplay = j.hostName || j.charName || '个人直播';
      var guestNames = Array.isArray(j.invitedParticipants)
        ? j.invitedParticipants.filter(function(p) { return p && String(p.id) !== String(j.hostId); }).map(function(p) { return p.name; })
        : [];
      var participantMeta = guestNames.length
        ? ('主播 ' + hostDisplay + '（同场：' + guestNames.slice(0, 3).join('、') + (guestNames.length > 3 ? '等' + guestNames.length + '人' : '') + '）')
        : (j.hostType === 'user' ? ('主播 ' + hostDisplay + (j.charName && j.charName !== hostDisplay ? (' · 嘉宾 ' + j.charName) : '')) : ('主播 ' + hostDisplay));
      return '<div class="hl-diarycard">' +
        '<div class="hl-diarycard-head"><b>' + esc(j.title) + '</b><div>' + hostBadge + typeBadge + '<span class="hl-tag" style="background:#f6e6ef;color:#935c7c">' + esc(j.programLabel) + '</span></div></div>' +
        '<div class="hl-diarycard-meta">' + esc(timeRangeStr) + ' · ' + esc(participantMeta) + ' · ' + (j.msgCount || 0) + ' 条互动' + (j.giftsTotalCoins ? ' · 礼物 ' + j.giftsTotalCoins + ' 金币' : '') + '</div>' +
        '<p>' + esc(j.summary) + '</p>' +
        '<div class="hl-diarycard-actions">' +
          '<button type="button" class="hl-plainbtn" style="padding:7px 12px;font-size:11px" data-jnl-replay="' + esc(j.id) + '">查看本场聊天记录</button>' +
          memBtnHtml +
          '<button type="button" class="hl-dangerbtn" data-jnl-del="' + esc(j.id) + '">删除手账</button>' +
        '</div>' +
      '</div>';
    }).join('');

    $$('[data-jnl-replay]').forEach(function(btn) {
      btn.onclick = function() {
        var found = _state.journals.find(function(x) { return x.id === btn.dataset.jnlReplay; });
        if (found) openReplayView(found, 'diary');
      };
    });
    $$('[data-jnl-remember]').forEach(function(btn) {
      btn.onclick = function() {
        var found = _state.journals.find(function(x) { return x.id === btn.dataset.jnlRemember; });
        if (found) openMemoryConfirmModal(found);
      };
    });
    $$('[data-jnl-del]').forEach(function(btn) {
      btn.onclick = async function() {
        if (typeof global.confirm === 'function' && !global.confirm('确定删除这条直播手账及对应的本场聊天记录吗？（删除后无法恢复）')) {
          return;
        }
        await storage().deleteJournalEntry(btn.dataset.jnlDel);
        showToast('已删除手账及本场聊天记录');
        refreshDiaryView();
      };
    });
  }

  // ===== 直播设置页面 =====
  async function refreshCharManagePreview() {
    var selectEl = $('#hl-char-img-select');
    var cid = (selectEl && selectEl.value) || _state.selectedCharManageId || getActiveChar().id;
    _state.selectedCharManageId = String(cid);
    var c = getCharById(cid);

    var opt = storage().normalizePortraitOption(_state.portraitOptions[cid]);
    var modeEl = $('#hl-char-img-mode');
    var fitEl = $('#hl-char-img-fit');
    var posEl = $('#hl-char-img-position');
    if (modeEl) modeEl.value = opt.mode;
    if (fitEl) fitEl.value = opt.fit;
    if (posEl) posEl.value = opt.position;

    var customSrc = await storage().loadPortraitSrc(cid);
    var showSrc = customSrc || c.avatar || '';
    var prev = $('#hl-char-img-preview');
    var prevText = $('#hl-char-img-preview-text');
    var urlInput = $('#hl-char-img-url');
    if (prev) {
      prev.style.backgroundImage = showSrc ? 'url("' + safeCssUrl(showSrc) + '")' : '';
      prev.style.backgroundSize = opt.fit;
      prev.style.backgroundPosition = opt.position;
    }
    if (prevText) {
      var roleTag = c.roleType === 'npc' ? ' [NPC]' : '';
      prevText.textContent = customSrc
        ? (c.name + roleTag + ' · 自定义直播形象')
        : c.avatar
          ? (c.name + roleTag + ' · 当前使用角色头像')
          : (c.name + roleTag + ' · 尚未上传立绘');
    }
    if (urlInput) urlInput.value = customSrc && customSrc.indexOf('https:') === 0 ? customSrc : '';

    var voiceEl = $('#hl-char-voice-id');
    var voiceStatusEl = $('#hl-char-voice-status');
    if (voiceEl) voiceEl.value = _state.charVoices[String(cid)] || '';
    if (voiceStatusEl) {
      if (c && c.roleType === 'npc') {
        voiceStatusEl.textContent = 'NPC 角色不使用微信单聊语音配置（直播中以文字字幕互动）';
      } else {
        var st = await aiMod().getMinimaxStatus(cid);
        voiceStatusEl.textContent = st.apiReady && st.voiceId
          ? ('✓ 语音就绪（来源：' + (st.voiceSource === 'live' ? '直播专用音色' : '微信聊天音色') + '）')
          : ('⚠ ' + (st.missingReason || '未就绪，将使用字幕回应'));
      }
    }
  }

  async function refreshUserPortraitPreview() {
    var opt = storage().normalizePortraitOption(_state.portraitOptions.user);
    var modeEl = $('#hl-user-img-mode');
    if (modeEl) modeEl.value = opt.mode;
    var customSrc = await storage().loadPortraitSrc('user');
    var showSrc = customSrc || _state.user.avatar || '';
    var prev = $('#hl-user-img-preview');
    var urlEl = $('#hl-user-img-url');
    if (prev) prev.style.backgroundImage = showSrc ? 'url("' + safeCssUrl(showSrc) + '")' : '';
    if (urlEl) urlEl.value = customSrc && customSrc.indexOf('https:') === 0 ? customSrc : '';
  }

  function renderImportProgressUi() {
    var wrap = $('#hl-asmr-import-progress');
    var textEl = $('#hl-asmr-progress-text');
    var fillEl = $('#hl-asmr-progress-fill');
    if (!wrap) return;
    wrap.hidden = !_state.importBusy;
    if (!_state.importBusy) return;
    var pct = Math.max(0, Math.min(100, Math.round(Number(_state.importProgressPct) || 0)));
    if (textEl) textEl.textContent = _state.importProgressText || ('正在导入… ' + pct + '%');
    if (fillEl) fillEl.style.width = pct + '%';
  }

  async function runLocalAudioImportFiles(files, fromPlanner) {
    if (!files || !files.length) return null;
    if (_importAbortCtrl) {
      try { _importAbortCtrl.abort(); } catch (_) {}
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : { signal: { aborted: false }, abort() { this.signal.aborted = true; } };
    _importAbortCtrl = ctrl;
    _state.importBusy = true;
    _state.importProgressPct = 2;
    _state.importProgressText = '准备校验音频文件…';
    renderImportProgressUi();

    var okCount = 0;
    var dupCount = 0;
    var lastAdded = null;
    var lastErr = '';
    var aborted = false;

    try {
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        try {
          lastAdded = await storage().addAsmrTrack(f, {
            signal: ctrl.signal,
            onProgress: function(p) {
              var pct = Math.max(0, Math.min(100, Math.round(Number(p && p.percent) || 0)));
              _state.importProgressPct = pct;
              _state.importProgressText = '[' + (i + 1) + '/' + files.length + '] ' + (f.name || '音频') + ' · ' + ((p && p.phase) || '写入中') + ' ' + pct + '%';
              renderImportProgressUi();
            }
          });
          okCount++;
        } catch (err) {
          if (err && err.name === 'AbortError') {
            aborted = true;
            break;
          }
          lastErr = (err && err.message) || '导入失败';
          if (lastErr.indexOf('已跳过重复导入') >= 0) dupCount++;
        }
      }
    } finally {
      if (_importAbortCtrl === ctrl) _importAbortCtrl = null;
      _state.importBusy = false;
      _state.importProgressPct = 0;
      _state.importProgressText = '';
      renderImportProgressUi();
    }

    await refreshAsmrLibraryUi();
    if (fromPlanner && lastAdded && _state.settings) {
      _state.settings = await storage().saveSettings(Object.assign({}, _state.settings, { asmrSelectedTrackId: lastAdded.id }));
      updatePlannerPreview();
    }
    if (aborted) {
      showToast(okCount > 0 ? ('已取消剩余导入（此前已完成 ' + okCount + ' 首）') : '已取消音频导入并清理未完成文件');
    } else if (okCount > 0) {
      showToast(dupCount > 0 ? ('已导入 ' + okCount + ' 首本地音频，已跳过 ' + dupCount + ' 首重复音轨') : ('已导入 ' + okCount + ' 首本地音频 ♡'));
    } else if (lastErr) {
      showToast(lastErr);
    }
    return lastAdded;
  }

  async function startPreviewPlayback(id, resolverFn) {
    if (_state.previewAudioId === id) {
      stopPreviewAudio();
      await refreshAsmrLibraryUi();
      return;
    }
    stopPreviewAudio();
    var res = await resolverFn();
    if (!res || !res.ok || !res.url) {
      if (res && res.reason === 'missing_binary') showToast('该本地音频文件缺失，请重新导入');
      else if (res && res.reason === 'offline_uncached') showToast('当前离线且未下载缓存，无法试听');
      else showToast('音频读取失败');
      return;
    }
    if (typeof Audio === 'undefined') return;
    _state.previewAudioId = id;
    _previewAudioEl = new Audio(res.url);
    _previewAudioEl.volume = Math.max(0, Math.min(1, Number((_state.settings && _state.settings.ambient) || 65) / 100));
    _previewAudioEl.onended = function() {
      stopPreviewAudio();
      refreshAsmrLibraryUi();
    };
    _previewAudioEl.onerror = function() {
      stopPreviewAudio();
      showToast('无法播放该音频，请检查文件完整性或网络');
      refreshAsmrLibraryUi();
    };
    _previewAudioEl.play().catch(function() {
      stopPreviewAudio();
      showToast('无法播放该音频');
      refreshAsmrLibraryUi();
    });
    await refreshAsmrLibraryUi();
  }

  function renderCloudCatalogUi() {
    var cloudListEl = $('#hl-cloud-catalog-list');
    var urlEl = $('#hl-cloud-manifest-url');
    if (urlEl && _state.cloudManifestUrl && !urlEl.value) {
      urlEl.value = _state.cloudManifestUrl;
    }
    if (!cloudListEl) return;
    var items = _state.cloudCatalog || [];
    if (!items.length) {
      cloudListEl.innerHTML = '<div class="hl-help">未配置云端音频清单（可选功能）；如需使用，请填入您的 HTTPS 清单 JSON 地址后同步。</div>';
      return;
    }
    cloudListEl.innerHTML = items.map(function(item) {
      var playing = _state.previewAudioId === item.id;
      var caching = Boolean(_state.cloudCachingIds[item.id]);
      var statusLabel = item.cachedLocally
        ? '云端·已缓存'
        : item.cacheMissing
          ? '云端·缓存文件缺失'
          : '云端在线';
      var metaLine = statusLabel + ' · ' + item.category +
        (item.durationSec ? (' · ' + formatDuration(item.durationSec)) : '') +
        (item.size ? (' · ' + formatBytes(item.size)) : '');
      var playlistLabel = item.inPlaylist ? '✓ 已在播放列表' : '+ 加入播放列表';
      var cacheBtn = caching
        ? '<button type="button" data-cloud-abort="' + esc(item.id) + '">取消下载</button>'
        : item.cachedLocally
          ? '<button type="button" data-cloud-uncache="' + esc(item.id) + '">删除缓存</button>'
          : '<button type="button" data-cloud-cache="' + esc(item.id) + '">缓存离线</button>';

      return '<div class="hl-asmr-item' + (item.cacheMissing ? ' is-missing' : '') + '">' +
        '<div class="hl-asmr-item-info"><b>' + esc(item.name) + '</b><small>' + esc(metaLine) + '</small></div>' +
        '<div class="hl-asmr-item-actions">' +
          '<button type="button" data-cloud-preview="' + esc(item.id) + '">' + (playing ? '⏹ 停止' : '▶ 试听') + '</button>' +
          '<button type="button" data-cloud-playlist="' + esc(item.id) + '">' + playlistLabel + '</button>' +
          cacheBtn +
        '</div>' +
      '</div>';
    }).join('');

    $$('[data-cloud-preview]').forEach(function(btn) {
      btn.onclick = function() {
        var cid = btn.dataset.cloudPreview;
        var entry = (_state.cloudCatalog || []).find(function(x) { return x.id === cid; });
        if (!entry) return;
        startPreviewPlayback(cid, function() { return storage().resolveAudioTrackPlaySource(entry); });
      };
    });

    $$('[data-cloud-playlist]').forEach(function(btn) {
      btn.onclick = async function() {
        var cid = btn.dataset.cloudPlaylist;
        var updated = await storage().toggleCloudTrackPlaylist(cid);
        await refreshAsmrLibraryUi();
        updatePlannerPreview();
        if (updated) {
          showToast(updated.inPlaylist ? ('已将「' + updated.name + '」加入播放列表') : ('已从播放列表移除「' + updated.name + '」'));
        }
      };
    });

    $$('[data-cloud-cache]').forEach(function(btn) {
      btn.onclick = async function() {
        var cid = btn.dataset.cloudCache;
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : { signal: { aborted: false }, abort() { this.signal.aborted = true; } };
        _cloudAbortMap[cid] = ctrl;
        _state.cloudCachingIds[cid] = true;
        renderCloudCatalogUi();
        var stEl = $('#hl-cloud-status');
        try {
          var cached = await storage().cacheCloudAudioTrack(cid, {
            signal: ctrl.signal,
            onProgress: function(p) {
              if (stEl) stEl.textContent = '正在下载缓存：' + Math.round(Number(p && p.percent) || 0) + '%';
            }
          });
          if (stEl) stEl.textContent = '已缓存离线音频：「' + cached.name + '」';
          showToast('已下载离线缓存：' + cached.name);
        } catch (err) {
          if (err && err.name === 'AbortError') {
            if (stEl) stEl.textContent = '已取消下载并清理半成品缓存';
            showToast('已取消下载缓存');
          } else {
            if (stEl) stEl.textContent = (err && err.message) || '下载缓存失败';
            showToast((err && err.message) || '下载缓存失败');
          }
        } finally {
          delete _cloudAbortMap[cid];
          delete _state.cloudCachingIds[cid];
          await refreshAsmrLibraryUi();
          updatePlannerPreview();
        }
      };
    });

    $$('[data-cloud-abort]').forEach(function(btn) {
      btn.onclick = function() {
        var cid = btn.dataset.cloudAbort;
        if (_cloudAbortMap[cid]) {
          try { _cloudAbortMap[cid].abort(); } catch (_) {}
        }
      };
    });

    $$('[data-cloud-uncache]').forEach(function(btn) {
      btn.onclick = async function() {
        var cid = btn.dataset.cloudUncache;
        if (_state.previewAudioId === cid) stopPreviewAudio();
        var res = await storage().uncacheCloudAudioTrack(cid);
        await refreshAsmrLibraryUi();
        updatePlannerPreview();
        if (res) showToast('已清理离线缓存（保留云端条目）：' + res.name);
      };
    });
  }

  async function refreshAsmrLibraryUi() {
    _state.asmrTracks = typeof storage().listAsmrTracksWithStatus === 'function'
      ? await storage().listAsmrTracksWithStatus()
      : await storage().listAsmrTracks();
    _state.cloudCatalog = typeof storage().listCloudCatalog === 'function'
      ? await storage().listCloudCatalog()
      : [];
    _state.cloudManifestUrl = typeof storage().getCloudManifestUrl === 'function'
      ? await storage().getCloudManifestUrl()
      : '';

    var stats = typeof storage().getAudioStorageStats === 'function'
      ? await storage().getAudioStorageStats()
      : null;

    var listEl = $('#hl-asmr-library-list');
    var selEl = $('#hl-asmr-default-track');
    var countEl = $('#hl-asmr-quota');
    var missingEl = $('#hl-asmr-missing-warning');

    if (countEl) {
      if (stats) {
        var quotaStr = (stats.quota && stats.quota.supported && stats.quota.availableBytes != null)
          ? ('设备可配额剩余约 ' + formatBytes(stats.quota.availableBytes))
          : '浏览器未上报实时配额（由真实写入校验）';
        countEl.textContent = '本地 ' + stats.localCount + ' 首（' + formatBytes(stats.localBytes) + '）· 云端缓存 ' + stats.cloudCachedCount + ' 首（' + formatBytes(stats.cloudCacheBytes) + '）· 存储：' + stats.backendPreferred + ' · ' + quotaStr;
      } else {
        var totalBytes = _state.asmrTracks.reduce(function(s, t) { return s + (Number(t.size) || 0); }, 0);
        countEl.textContent = '已导入 ' + _state.asmrTracks.length + ' 首音轨 · 占用 ' + formatBytes(totalBytes);
      }
    }

    if (missingEl) {
      var missCount = stats ? stats.missingLocalCount : _state.asmrTracks.filter(function(t) { return t.missingBinary; }).length;
      missingEl.hidden = missCount === 0;
      if (missCount > 0) {
        missingEl.textContent = '⚠ 检测到 ' + missCount + ' 首本地音频仅保留元数据而缺少真实音频文件（可能源自跨设备恢复或清理缓存），播放时会自动跳过；重新导入同名同大小音频即可自动无损修复。';
      }
    }

    renderImportProgressUi();

    var allSelectable = _state.asmrTracks.concat(_state.cloudCatalog.filter(function(c) { return c.inPlaylist; }));
    if (selEl) {
      selEl.innerHTML = '<option value="">跟随播放顺序自动选择</option>' +
        allSelectable.map(function(t) {
          var prefix = t.sourceType === 'cloud'
            ? (t.cachedLocally ? '[云端·已缓存] ' : '[云端] ')
            : (t.missingBinary ? '[缺失·需重导] ' : '[本地] ');
          return '<option value="' + esc(t.id) + '"' + (t.missingBinary ? ' disabled' : '') + '>' + esc(prefix + t.name) + '</option>';
        }).join('');
      selEl.value = (_state.settings && _state.settings.asmrSelectedTrackId) || '';
    }

    if (listEl) {
      if (!_state.asmrTracks.length) {
        listEl.innerHTML = '<div class="hl-help">尚未导入任何本地音频文件，点击上方按钮添加 MP3 / WAV / M4A / OGG / FLAC（不设硬编码体积上限，随设备空间而定）。</div>';
      } else {
        listEl.innerHTML = _state.asmrTracks.map(function(t) {
          var playing = _state.previewAudioId === t.id;
          var metaText = t.missingBinary
            ? ('本地 · 文件缺失·请重新导入 · ' + formatBytes(t.size))
            : ('本地' + (t.storageBackend === 'opfs' ? ' OPFS' : ' IDB') + ' · ' + formatDuration(t.durationSec) + ' · ' + formatBytes(t.size));
          return '<div class="hl-asmr-item' + (t.missingBinary ? ' is-missing' : '') + '">' +
            '<div class="hl-asmr-item-info"><b>' + esc(t.name) + '</b><small>' + esc(metaText) + '</small></div>' +
            '<div class="hl-asmr-item-actions">' +
              '<button type="button" data-asmr-preview="' + esc(t.id) + '">' + (t.missingBinary ? '缺失' : (playing ? '⏹ 停止' : '▶ 试听')) + '</button>' +
              '<button type="button" data-asmr-rename="' + esc(t.id) + '">改名</button>' +
              '<button type="button" data-asmr-del="' + esc(t.id) + '">删除</button>' +
            '</div>' +
          '</div>';
        }).join('');

        $$('[data-asmr-preview]').forEach(function(btn) {
          btn.onclick = function() {
            var tid = btn.dataset.asmrPreview;
            var track = _state.asmrTracks.find(function(x) { return x.id === tid; });
            if (!track) return;
            startPreviewPlayback(tid, function() { return storage().resolveAudioTrackPlaySource(track); });
          };
        });
        $$('[data-asmr-rename]').forEach(function(btn) {
          btn.onclick = async function() {
            var tid = btn.dataset.asmrRename;
            var cur = _state.asmrTracks.find(function(x) { return x.id === tid; });
            var nextName = typeof global.prompt === 'function' ? global.prompt('输入新的音轨名称：', (cur && cur.name) || '') : '';
            if (!nextName || !nextName.trim()) return;
            try {
              await storage().renameAsmrTrack(tid, nextName);
              showToast('音轨名称已更新');
              refreshAsmrLibraryUi();
              updatePlannerPreview();
            } catch (err) {
              showToast(err.message || '重命名失败');
            }
          };
        });
        $$('[data-asmr-del]').forEach(function(btn) {
          btn.onclick = async function() {
            var tid = btn.dataset.asmrDel;
            if (_state.previewAudioId === tid) stopPreviewAudio();
            await storage().deleteAsmrTrack(tid);
            if (_state.settings && _state.settings.asmrSelectedTrackId === tid) {
              _state.settings.asmrSelectedTrackId = '';
              await storage().saveSettings(_state.settings);
            }
            showToast('已删除该音轨');
            refreshAsmrLibraryUi();
            updatePlannerPreview();
          };
        });
      }
    }

    renderCloudCatalogUi();
  }

  async function refreshSettingsView() {
    var s = _state.settings;
    if (!s) return;

    var charSelect = $('#hl-char-img-select');
    if (charSelect) {
      var manageRoles = (_state.invitees && _state.invitees.length) ? _state.invitees : (_state.chars.length ? _state.chars : [getActiveChar()]);
      charSelect.innerHTML = manageRoles.map(function(c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.name) + (c.roleType === 'npc' ? ' (NPC)' : ' (Char)') + '</option>';
      }).join('');
      if (!manageRoles.some(function(c) { return String(c.id) === String(_state.selectedCharManageId); })) {
        _state.selectedCharManageId = String(manageRoles[0].id);
      }
      charSelect.value = _state.selectedCharManageId;
    }

    var bindVal = function(id, val, isCheck) {
      var el = $('#' + id);
      if (!el) return;
      if (isCheck) el.checked = Boolean(val);
      else el.value = String(val);
    };
    bindVal('hl-motion', s.motion, true);
    bindVal('hl-voice', s.voice, false);
    bindVal('hl-expression', s.expression, false);
    bindVal('hl-voice-vol', s.voiceVol, false);
    bindVal('hl-captions', s.captions, true);
    bindVal('hl-asmr-play-mode', s.asmrPlayMode, false);
    bindVal('hl-ambient', s.ambient, false);
    bindVal('hl-duck', s.duck, true);
    bindVal('hl-timer', s.timer, false);
    bindVal('hl-settings-end-action', s.asmrEndAction, false);
    bindVal('hl-backup-audio', s.includeAudioInBackup, true);
    bindVal('hl-initiative', s.initiative, false);
    bindVal('hl-thinking', s.thinking, false);
    bindVal('hl-context', s.context, true);
    bindVal('hl-sim', s.sim, true);
    bindVal('hl-save-sim-log', s.saveSimAudienceInLog, true);
    bindVal('hl-save-prompt', s.savePrompt, true);

    var vvLbl = $('#hl-voice-vol-label');
    var avLbl = $('#hl-ambient-label');
    if (vvLbl) vvLbl.textContent = s.voiceVol + '%';
    if (avLbl) avLbl.textContent = s.ambient + '%';

    $$('.hl-swatchbtn').forEach(function(btn) {
      btn.classList.toggle('selected', btn.dataset.theme === s.theme && !s.customBgType);
    });

    await applyRoomThemeAndBackground();
    await refreshCharManagePreview();
    await refreshUserPortraitPreview();
    await refreshAsmrLibraryUi();
  }

  // ===== 构造主 DOM 与绑定交互 =====
  function buildPageHtml() {
    return '' +
      '<div class="hl-shell">' +
        // 1. 直播大厅
        '<section class="hl-view active" id="hl-view-home" data-view="home">' +
          '<div class="hl-head"><div class="hl-hrow">' +
            '<button type="button" class="hl-title-back" id="hl-back-desktop" title="点击返回桌面" aria-label="点击心动直播返回桌面">' +
              '<small>WANWAN · LIVE</small><h1>心动直播 ♡</h1><p>今晚也有想见的人</p>' +
            '</button>' +
          '</div></div>' +
          '<div class="hl-home-content">' +
            '<div class="hl-subhead"><b>🔴 正在直播</b><span>点击卡片策划开播</span></div>' +
            '<div class="hl-broadcasts" id="hl-broadcasts"></div>' +
            '<div class="hl-subhead"><b>✨ 我要开播</b><span>直接开播 · 可选邀 Char / NPC</span></div>' +
            '<div class="hl-create"><div class="hl-ico">🎤</div><div><b>我的心动直播间</b><p>点击直接进入个人直播，播中可邀多人陪伴</p></div><button type="button" class="hl-pinkbtn" id="hl-go-live">开播</button></div>' +
            '<div class="hl-subhead"><b>💗 双人连线</b><span>仅你和 Char</span></div>' +
            '<div class="hl-create"><div class="hl-ico">💞</div><div><b>私人双人直播</b><p>闲聊 · ASMR · 睡前电台 · 云陪伴</p></div><button type="button" class="hl-pinkbtn" id="hl-private-start2">连线</button></div>' +
            '<div class="hl-subhead"><b>🎭 选择 Char 或 NPC</b><span>多角色独立开播</span></div>' +
            '<div class="hl-create"><div class="hl-ico">🌟</div><div><b>让 Char 或 NPC 来开播</b><p>支持全部 / Char / NPC 筛选，NPC 无需微信聊天即可独立开播</p></div><button type="button" class="hl-pinkbtn" id="hl-open-role-picker">选择 Char 或 NPC</button></div>' +
            '<div class="hl-char-picker-row" id="hl-char-picker"></div>' +
          '</div>' +
        '</section>' +

        // 2. 沉浸直播间
        '<section class="hl-view hl-view-room" id="hl-view-live" data-view="live">' +
          '<div class="hl-room cloud" id="hl-room">' +
            '<div class="hl-char-fullscreen-art" id="hl-charFullscreenArt" aria-hidden="true"></div>' +
            '<div class="hl-host-stage"><div class="hl-stage-halo"></div><div class="hl-bigavatar" id="hl-stageAvatar">🌸</div><div class="hl-stage-sign" id="hl-stage-caption">欢迎来到直播间 ♡</div></div>' +

            '<div class="hl-room-top-wrap">' +
              '<div class="hl-roomtop">' +
                '<div class="hl-host"><span class="hl-face" id="hl-host-face">🌸</span><span class="hl-hostinfo"><b id="hl-host-name">Char</b><small id="hl-host-status">正在直播</small></span></div>' +
                '<button type="button" class="hl-follow" id="hl-follow">+ 关注</button>' +
                '<button type="button" class="hl-invite-pill" id="hl-invite-btn" style="display:none">+ 邀请</button>' +
                '<button type="button" class="hl-top-pill" id="hl-connect-btn" title="连麦或视频">🎙 连麦</button>' +
                '<button type="button" class="hl-top-pill" id="hl-callModeToggle" title="切换全屏或煲电话模式">📞 通话</button>' +
                '<button type="button" class="hl-top-pill" id="hl-minimize-btn" title="缩小为应用内悬浮小窗" aria-label="缩小直播">↙ 缩小</button>' +
                '<span class="hl-audience" id="hl-audience">👁 模拟 1.2k</span>' +
                '<button type="button" class="hl-close-room" id="hl-exit-room" aria-label="退出直播间">×</button>' +
              '</div>' +
              '<div class="hl-room-title" id="hl-room-title">直播间</div>' +
              '<div class="hl-program-status" id="hl-program-status">💬 当前：闲聊直播</div>' +
            '</div>' +

            // 连麦双布局浮层 (小窗 & 双人并列PK，纯图标操作栏)
            '<div class="hl-connection-overlay" id="hl-connection-overlay" hidden>' +
              '<div class="hl-connection-pair">' +
                '<div class="hl-connection-tile hl-main-connection-tile"><div class="hl-connection-art" id="hl-main-conn-art">🌸</div><div class="hl-connection-label" id="hl-main-conn-label">主播</div></div>' +
                '<div class="hl-connection-tile" id="hl-conn-tile"><div class="hl-connection-art" id="hl-conn-art">🎀</div><div class="hl-connection-label" id="hl-conn-label">连麦中</div><video class="hl-user-camera" id="hl-user-camera" autoplay playsinline muted hidden></video></div>' +
              '</div>' +
              '<div class="hl-connection-controls" role="toolbar" aria-label="连麦画面控制">' +
                '<button type="button" id="hl-layout-toggle" title="切换连麦布局" aria-label="切换连麦布局">' +
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="7.5" height="16" rx="2"/><rect x="13.5" y="4" width="7.5" height="16" rx="2"/></svg>' +
                '</button>' +
                '<button type="button" id="hl-swap-screens" title="交换连麦位置" aria-label="交换连麦位置">' +
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 7H4m0 0l3.5-3.5M4 7l3.5 3.5"/><path d="M8 17h12m0 0l-3.5-3.5M20 17l-3.5 3.5"/></svg>' +
                '</button>' +
                '<button type="button" class="hl-conn-hangup" id="hl-disconnect" title="挂断连麦" aria-label="挂断连麦">' +
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 14.5c4.5-4.2 10.5-4.2 15 0"/><path d="M4.5 14.5l-1.5 2.2c-.3.5-.1 1.1.4 1.3l2.6 1c.5.2 1-.1 1.2-.6l.7-1.9"/><path d="M19.5 14.5l1.5 2.2c.3.5.1 1.1-.4 1.3l-2.6 1c-.5.2-1-.1-1.2-.6l-.7-1.9"/></svg>' +
                '</button>' +
              '</div>' +
            '</div>' +

            '<div class="hl-roomfooter">' +
              '<div class="hl-footer-upper">' +
                '<div class="hl-messages-wrap" id="hl-messages-wrap">' +
                  '<div class="hl-messages" id="hl-messages" aria-live="polite"></div>' +
                  '<button type="button" class="hl-latest-msg-btn" id="hl-latest-msg-btn" hidden aria-label="回到底部查看最新消息">↓ 最新消息</button>' +
                '</div>' +
                '<div class="hl-sideactions">' +
                  '<button type="button" id="hl-like" aria-label="点赞">♡</button><small id="hl-like-count">点赞</small>' +
                  '<button type="button" id="hl-gift" aria-label="送礼">🎁</button><small>礼物</small>' +
                  '<button type="button" id="hl-interact" aria-label="互动">🎮</button><small>互动</small>' +
                '</div>' +
              '</div>' +
              '<div id="hl-text-call-composer" class="hl-text-call-composer" hidden>' +
                '<input id="hl-text-call-input" maxlength="180" placeholder="在连麦席位对 Ta 说…" aria-label="文字连麦输入">' +
                '<button type="button" id="hl-text-call-send">连麦发送</button>' +
              '</div>' +
              '<div id="hl-voice-call-controls" class="hl-voice-call-controls" hidden>' +
                '<span id="hl-voice-call-status">🎙 语音连麦 · 未开启麦克风</span>' +
                '<div class="hl-voice-btn-row">' +
                  '<button type="button" id="hl-mic-toggle">开启麦克风</button>' +
                  '<button type="button" id="hl-voice-dictate">🎙 语音转写发言</button>' +
                '</div>' +
                '<div style="display:flex;gap:5px">' +
                  '<input id="hl-voice-text-input" maxlength="180" placeholder="语音转写结果或手动文字补充…" style="flex:1;min-width:0;border:0;border-radius:7px;padding:6px 8px;font-size:11px;color:#4a3552">' +
                  '<button type="button" id="hl-voice-text-send">发送</button>' +
                '</div>' +
              '</div>' +
              '<div class="hl-notice" id="hl-notice">真实 Char AI 互动</div>' +
              '<div class="hl-composer">' +
                '<input id="hl-message-input" maxlength="160" placeholder="发一条弹幕…" aria-label="弹幕输入">' +
                '<button type="button" class="hl-roundbtn" id="hl-send" aria-label="发送弹幕">➤</button>' +
                '<button type="button" class="hl-roundbtn hl-composer-program-btn" id="hl-quick-program-switch" title="切换节目" aria-label="切换节目">' +
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                    '<rect x="3" y="4" width="7.5" height="7.5" rx="1.6"/>' +
                    '<rect x="13.5" y="4" width="7.5" height="7.5" rx="1.6"/>' +
                    '<rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/>' +
                    '<rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>' +
                  '</svg>' +
                '</button>' +
                '<button type="button" class="hl-roundbtn" id="hl-quick-gift" aria-label="礼物">🎁</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</section>' +

        // 3. 直播手账
        '<section class="hl-view" id="hl-view-diary" data-view="diary">' +
          '<div class="hl-head"><div class="hl-hrow">' +
            '<div><small>OUR MOMENTS</small><h1>直播手账 ♡</h1><p>只记录真实发生并由你审阅的时刻</p></div>' +
            '<button type="button" class="hl-ghost" id="hl-back-from-diary">返回大厅</button>' +
          '</div></div>' +
          '<div class="hl-diary" id="hl-diary-list"></div>' +
        '</section>' +

        // 3.5 本场聊天记录回放
        '<section class="hl-view" id="hl-view-replay" data-view="replay">' +
          '<div class="hl-head"><div class="hl-hrow">' +
            '<div><small>LIVE TRANSCRIPT</small><h1 id="hl-replay-title">本场聊天记录</h1><p id="hl-replay-meta">正在加载…</p></div>' +
            '<button type="button" class="hl-ghost" id="hl-replay-back">返回手账</button>' +
          '</div></div>' +
          '<div class="hl-replay-wrap">' +
            '<div class="hl-replay-filter" id="hl-replay-sim-wrap" style="display:none">' +
              '<span>显示 [AI观众] 气氛弹幕</span>' +
              '<input type="checkbox" id="hl-replay-sim-toggle" checked>' +
            '</div>' +
            '<div class="hl-replay-list" id="hl-replay-list"></div>' +
          '</div>' +
        '</section>' +

        // 4. 直播设置
        '<section class="hl-view" id="hl-view-settings" data-view="settings">' +
          '<div class="hl-head"><div class="hl-hrow">' +
            '<div><small>CUSTOMIZE YOUR LIVE</small><h1>直播设置 ♡</h1><p>形象、背景、ASMR 音库与语音偏好</p></div>' +
            '<button type="button" class="hl-ghost" id="hl-back-settings">返回</button>' +
          '</div></div>' +
          '<div class="hl-settings">' +
            '<h2>🧑‍🎤 Char 直播形象与音色</h2>' +
            '<div class="hl-settingbox" style="padding:12px 14px">' +
              '<p class="hl-help">每个 Char 形象与显示模式按角色 ID 独立保存；未上传时回退角色的微信头像。</p>' +
              '<select id="hl-char-img-select" class="hl-plan-select"></select>' +
              '<div class="hl-custom-tools">' +
                '<label for="hl-char-img-file">🖼 上传 Char 图片<input type="file" id="hl-char-img-file" accept="image/*"></label>' +
                '<button type="button" id="hl-char-img-clear">恢复默认形象</button>' +
              '</div>' +
              '<div class="hl-url-row"><input id="hl-char-img-url" type="url" placeholder="https:// 图片直链"><button type="button" id="hl-char-img-url-apply">应用 URL</button></div>' +
              '<div class="hl-settingrow"><div><b>Char 直播画面模式</b><small>全屏直播 ↔ 煲电话模式随时切换</small></div><select id="hl-char-img-mode"><option value="fullscreen">🖼 全屏直播</option><option value="call">📞 煲电话模式</option></select></div>' +
              '<div class="hl-settingrow"><div><b>图片显示方式</b><small>铺满裁切或完整展示背景</small></div><select id="hl-char-img-fit"><option value="cover">全屏铺满</option><option value="contain">完整显示</option></select></div>' +
              '<div class="hl-settingrow"><div><b>画面位置</b><small>调整全屏形象焦点</small></div><select id="hl-char-img-position"><option value="center">居中</option><option value="center top">靠上</option><option value="center bottom">靠下</option></select></div>' +
              '<div class="hl-preview portrait-box" id="hl-char-img-preview"><span id="hl-char-img-preview-text">角色形象预览</span></div>' +
              '<div class="hl-settingrow" style="border-top:1px solid #f5eef2;margin-top:6px"><div><b>Char 直播专用音色 ID</b><small id="hl-char-voice-status">检测中…</small></div></div>' +
              '<div class="hl-url-row"><input id="hl-char-voice-id" placeholder="留空则沿用微信单聊 Minimax Voice ID"><button type="button" id="hl-char-voice-save">保存音色</button></div>' +
            '</div>' +

            '<h2>🎀 User 直播形象</h2>' +
            '<div class="hl-settingbox" style="padding:12px 14px">' +
              '<div class="hl-custom-tools">' +
                '<label for="hl-user-img-file">🖼 上传 User 图片<input type="file" id="hl-user-img-file" accept="image/*"></label>' +
                '<button type="button" id="hl-user-img-clear">恢复默认</button>' +
              '</div>' +
              '<div class="hl-url-row"><input id="hl-user-img-url" type="url" placeholder="https:// 图片直链"><button type="button" id="hl-user-img-url-apply">应用 URL</button></div>' +
              '<div class="hl-settingrow"><div><b>User 主播画面模式</b></div><select id="hl-user-img-mode"><option value="fullscreen">🖼 全屏直播</option><option value="call">📞 煲电话模式</option></select></div>' +
              '<div class="hl-preview" id="hl-user-img-preview"><span>我的直播形象预览</span></div>' +
            '</div>' +

            '<h2>🎨 直播背景</h2>' +
            '<div class="hl-settingbox">' +
              '<div class="hl-swatches">' +
                '<button type="button" class="hl-swatchbtn selected" data-theme="cloud"><i style="background:linear-gradient(135deg,#66658d,#e1afc4)"></i>云朵粉紫</button>' +
                '<button type="button" class="hl-swatchbtn" data-theme="moon"><i style="background:linear-gradient(135deg,#25253e,#9376aa)"></i>月夜星空</button>' +
                '<button type="button" class="hl-swatchbtn" data-theme="garden"><i style="background:linear-gradient(135deg,#5d857c,#e2b6a9)"></i>四季花园</button>' +
                '<button type="button" class="hl-swatchbtn" data-theme="cafe"><i style="background:linear-gradient(135deg,#806b77,#e3b197)"></i>暖光咖啡</button>' +
              '</div>' +
              '<div class="hl-custom-tools">' +
                '<label for="hl-bg-file">🖼 从相册选择背景<input type="file" id="hl-bg-file" accept="image/*"></label>' +
                '<button type="button" id="hl-clear-bg">恢复预设背景</button>' +
              '</div>' +
              '<div class="hl-url-row"><input id="hl-bg-url" type="url" placeholder="https:// 背景图片链接"><button type="button" id="hl-apply-bg-url">应用 URL</button></div>' +
              '<div class="hl-preview" id="hl-bgPreview"><span id="hl-bgPreviewLabel">当前：云朵粉紫</span></div>' +
              '<div class="hl-settingrow"><div><b>柔和背景动效</b><small>自动尊重系统减少动态设置</small></div><input type="checkbox" id="hl-motion"></div>' +
            '</div>' +

            '<h2>🎙️ Char 语音 (Minimax TTS)</h2>' +
            '<div class="hl-settingbox">' +
              '<div class="hl-settingrow"><div><b>语音输出方式</b><small>未配置 Minimax 或音色时自动回退文字</small></div><select id="hl-voice"><option value="both">语音 + 字幕</option><option value="text">纯文字</option><option value="audio">语音为主</option></select></div>' +
              '<div class="hl-settingrow"><div><b>情感演绎程度</b><small>贴合角色设定</small></div><select id="hl-expression"><option value="natural">自然情感</option><option value="calm">克制自然</option><option value="immersive">沉浸演绎</option></select></div>' +
              '<div class="hl-settingrow"><div><b>Char 语音音量</b><small id="hl-voice-vol-label">65%</small></div><input type="range" id="hl-voice-vol" min="0" max="100"></div>' +
              '<div class="hl-settingrow"><div><b>显示文字字幕</b><small>语音与文字保持一致</small></div><input type="checkbox" id="hl-captions"></div>' +
            '</div>' +

            '<h2>🎧 电台与个人 ASMR 音频库</h2>' +
            '<div class="hl-settingbox" style="padding:10px 14px">' +
              '<div class="hl-custom-tools">' +
                '<label for="hl-asmr-file">🎵 导入本地音频 (MP3/WAV/M4A/OGG/FLAC)<input type="file" id="hl-asmr-file" accept="audio/*" multiple></label>' +
              '</div>' +
              '<div class="hl-asmr-progress-wrap" id="hl-asmr-import-progress" hidden>' +
                '<div class="hl-asmr-progress-head"><span id="hl-asmr-progress-text">正在导入…</span><button type="button" class="hl-smallbtn" id="hl-asmr-cancel-import">取消导入</button></div>' +
                '<div class="hl-asmr-progress-bar"><div class="hl-asmr-progress-fill" id="hl-asmr-progress-fill"></div></div>' +
              '</div>' +
              '<div class="hl-warning-box" id="hl-asmr-missing-warning" hidden></div>' +
              '<p class="hl-help" id="hl-asmr-quota">正在读取本地存储配额…</p>' +
              '<div class="hl-asmr-list" id="hl-asmr-library-list"></div>' +
              '<div class="hl-cloud-subbox">' +
                '<h3>☁ 可选云端音频素材（HTTPS 清单与离线缓存）</h3>' +
                '<p class="hl-help">无内置云端地址或密钥；可填入您自己维护的 HTTPS 清单 JSON 链接（格式：[{ id, name, category, url, durationSec, size }]）。</p>' +
                '<div class="hl-url-row"><input id="hl-cloud-manifest-url" type="url" placeholder="https://.../audio-manifest.json"><button type="button" id="hl-cloud-sync-btn">同步清单</button></div>' +
                '<p class="hl-help" id="hl-cloud-status">云端音频条目按需在线试听或手动缓存，不会自动批量下载。</p>' +
                '<div class="hl-asmr-list" id="hl-cloud-catalog-list"></div>' +
              '</div>' +
              '<div class="hl-settingrow"><div><b>播放顺序</b></div><select id="hl-asmr-play-mode"><option value="loop">列表循环</option><option value="sequence">顺序播放</option><option value="single">单曲循环</option><option value="random">随机播放</option></select></div>' +
              '<div class="hl-settingrow"><div><b>默认音轨</b></div><select id="hl-asmr-default-track"></select></div>' +
              '<div class="hl-settingrow"><div><b>环境音音量</b><small id="hl-ambient-label">65%</small></div><input type="range" id="hl-ambient" min="0" max="100"></div>' +
              '<div class="hl-settingrow"><div><b>语音时自动闪避降低环境音</b><small>防止人声与背景音打架</small></div><input type="checkbox" id="hl-duck"></div>' +
              '<div class="hl-settingrow"><div><b>默认 ASMR 定时</b></div><select id="hl-timer"><option value="off">手动停止</option><option value="15">15 分钟</option><option value="30">30 分钟</option><option value="60">60 分钟</option></select></div>' +
              '<div class="hl-settingrow"><div><b>定时到点动作</b></div><select id="hl-settings-end-action"><option value="stop_program">停止 ASMR 返回闲聊</option><option value="exit_room">自动结束本场直播</option></select></div>' +
              '<div class="hl-settingrow"><div><b>整机 JSON 备份包含旧版小音频实体</b><small>常规备份默认仅保留音频元数据、播放清单与云端引用，不含大体积本地/云端缓存音频；跨设备恢复缺失时需重新导入或重新下载</small></div><input type="checkbox" id="hl-backup-audio"></div>' +
            '</div>' +

            '<h2>💕 互动与隐私</h2>' +
            '<div class="hl-settingbox">' +
              '<div class="hl-settingrow"><div><b>Char 主动节奏</b></div><select id="hl-initiative"><option value="natural">自然主动</option><option value="quiet">安静陪伴</option><option value="lively">活跃互动</option></select></div>' +
              '<div class="hl-settingrow"><div><b>游戏回应节奏</b></div><select id="hl-thinking"><option value="short">自然节奏</option><option value="immersive">沉浸思索</option><option value="fast">快速响应</option></select></div>' +
              '<div class="hl-settingrow"><div><b>联动真实经历上下文</b><small>只读参考长期记忆与万象镜经历，不篡改世界书</small></div><input type="checkbox" id="hl-context"></div>' +
              '<div class="hl-settingrow"><div><b>[AI观众] 气氛弹幕</b><small>明确标明 AI 观众，绝不冒充真人</small></div><input type="checkbox" id="hl-sim"></div>' +
              '<div class="hl-settingrow"><div><b>手账记录保存 [AI观众] 弹幕</b><small>关闭后本场聊天记录仅保留你、Char、NPC、礼物与系统事件</small></div><input type="checkbox" id="hl-save-sim-log"></div>' +
              '<div class="hl-settingrow"><div><b>关播后手账与记忆提醒</b><small>仅由您主动确认后才写入长期记忆</small></div><input type="checkbox" id="hl-save-prompt"></div>' +
            '</div>' +
            '<button type="button" class="hl-ghost" id="hl-reset-settings" style="width:100%;margin-top:16px">恢复直播默认设置</button>' +
          '</div>' +
        '</section>' +

        // 底部导航
        '<nav class="hl-bottomnav" id="hl-nav">' +
          '<button type="button" class="hl-nav sel" data-view="home"><span>⌂</span>直播大厅</button>' +
          '<button type="button" class="hl-nav" data-view="diary"><span>▤</span>直播手账</button>' +
          '<button type="button" class="hl-nav" data-view="settings"><span>⚙</span>直播设置</button>' +
        '</nav>' +

        // 抽屉 1：直播企划 (开播/热切换)
        '<div class="hl-planner" id="hl-planner" data-modal="planner" role="dialog" aria-modal="true">' +
          '<div class="hl-planner-sheet">' +
            '<div class="hl-plan-head"><b id="hl-planner-heading">📺 本场直播企划</b><button type="button" data-close-modal>×</button></div>' +
            '<div class="hl-plan-char"><div class="hl-plan-char-ico" id="hl-plan-avatar">🌸</div><div><b id="hl-plan-name">Char 的直播</b><small style="display:block;font-size:10px;color:#9d7d96;margin-top:2px">随时可切换节目，不会中断当前直播或连麦</small></div></div>' +
            '<label class="hl-plan-label">选择直播节目</label>' +
            '<div class="hl-program-grid">' +
              '<button type="button" class="hl-program selected" data-program="chat"><span class="symbol">💬</span><b>闲聊直播</b></button>' +
              '<button type="button" class="hl-program" data-program="game"><span class="symbol">🎮</span><b>游戏直播</b></button>' +
              '<button type="button" class="hl-program" data-program="music"><span class="symbol">🎵</span><b>音乐直播</b></button>' +
              '<button type="button" class="hl-program" data-program="radio"><span class="symbol">📻</span><b>睡前电台</b></button>' +
              '<button type="button" class="hl-program" data-program="asmr"><span class="symbol">🎧</span><b>ASMR</b></button>' +
              '<button type="button" class="hl-program" data-program="study"><span class="symbol">📚</span><b>云陪伴</b></button>' +
              '<button type="button" class="hl-program" data-program="special"><span class="symbol">✨</span><b>特别企划</b></button>' +
            '</div>' +
            '<label class="hl-plan-label" for="hl-plan-title">直播标题</label>' +
            '<input class="hl-plan-input" id="hl-plan-title" maxlength="36" placeholder="给今晚的直播起个名字">' +
            '<label class="hl-plan-label" id="hl-plan-style-label" for="hl-plan-style">Char 互动节奏</label>' +
            '<select class="hl-plan-select" id="hl-plan-style"><option value="natural">自然主动 · 推荐</option><option value="quiet">安静陪伴</option><option value="lively">活跃互动</option></select>' +
            '<div class="hl-asmr-config" id="hl-asmr-config">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
                '<label class="hl-plan-label" style="margin-top:0" for="hl-plan-asmr-track">🎵 播放音轨</label>' +
                '<label class="hl-smallbtn" style="font-size:10px;padding:4px 9px;cursor:pointer">＋ 导入本地音频<input type="file" id="hl-plan-asmr-import" accept="audio/*" multiple hidden></label>' +
              '</div>' +
              '<select class="hl-plan-select" id="hl-plan-asmr-track"></select>' +
              '<label class="hl-plan-label" for="hl-asmr-timer">🌙 睡前定时长度</label>' +
              '<select class="hl-plan-select" id="hl-asmr-timer"><option value="0">不定时 · 手动停止</option><option value="15">15 分钟后</option><option value="30" selected>30 分钟后</option><option value="60">1 小时后</option><option value="120">2 小时后</option><option value="custom">自定义时长</option><option value="clock">指定本地时刻</option></select>' +
              '<div id="hl-asmr-custom" style="display:none;margin-top:8px"><input id="hl-asmr-hours" type="number" min="0" max="23" value="1" style="width:66px;padding:7px;border:1px solid #ead5e5;border-radius:8px"> 时 <input id="hl-asmr-minutes" type="number" min="0" max="59" value="0" style="width:66px;padding:7px;border:1px solid #ead5e5;border-radius:8px"> 分</div>' +
              '<div id="hl-asmr-clock-wrap" style="display:none;margin-top:8px"><input id="hl-asmr-clock" type="time" value="23:30" style="padding:7px;border:1px solid #ead5e5;border-radius:8px"> <small>按设备本地时间校准</small></div>' +
              '<label class="hl-plan-label" for="hl-asmr-end-action">到点执行</label>' +
              '<select class="hl-plan-select" id="hl-asmr-end-action"><option value="stop_program">平滑停止 ASMR 并切回闲聊</option><option value="exit_room">自动结束本场直播</option></select>' +
            '</div>' +
            '<div class="hl-plan-preview" id="hl-plan-preview"></div>' +
            '<div class="hl-plan-buttons"><button type="button" class="hl-plainbtn" id="hl-plan-default">恢复默认</button><button type="button" class="hl-pinkbtn" id="hl-plan-confirm">进入直播间 ♡</button></div>' +
          '</div>' +
        '</div>' +

        // 抽屉 2：连麦与视频邀请
        '<div class="hl-planner" id="hl-connect-planner" data-modal="connect" role="dialog" aria-modal="true">' +
          '<div class="hl-planner-sheet">' +
            '<div class="hl-plan-head"><b>💗 直播连麦</b><button type="button" data-close-modal>×</button></div>' +
            '<div id="hl-connect-target-wrap" style="display:none">' +
              '<label class="hl-plan-label" for="hl-connect-target">选择上麦连麦嘉宾（受邀观众需点此才正式上麦）</label>' +
              '<select class="hl-plan-select" id="hl-connect-target"></select>' +
            '</div>' +
            '<label class="hl-plan-label" for="hl-connect-layout">连麦画面布局（直播中可随时无损切换）</label>' +
            '<select class="hl-plan-select" id="hl-connect-layout"><option value="floating">📺 主播大屏＋连麦小窗（经典版）</option><option value="split">👥 双人左右并列 PK（新版）</option></select>' +
            '<p class="hl-help">文字连麦无需麦克风；语音连麦支持授权本机麦克风、语音转写与 Minimax TTS；视频连麦默认以双方图片虚拟同框。</p>' +
            '<div class="hl-plan-buttons"><button type="button" class="hl-pinkbtn" id="hl-text-connect">💬 文字连麦</button><button type="button" class="hl-plainbtn" id="hl-voice-connect">🎙 语音连麦</button></div>' +
            '<div class="hl-plan-buttons"><button type="button" class="hl-plainbtn" id="hl-video-connect">📹 虚拟同框画面</button><button type="button" class="hl-plainbtn" id="hl-camera-connect">📷 我的摄像头（仅本地预览）</button></div>' +
          '</div>' +
        '</div>' +

        // 抽屉 3：官方金币礼物
        '<div class="hl-planner" id="hl-gift-planner" data-modal="gift" role="dialog" aria-modal="true">' +
          '<div class="hl-planner-sheet">' +
            '<div class="hl-plan-head"><b>🎁 送出心意礼物</b><button type="button" data-close-modal>×</button></div>' +
            '<p class="hl-help" id="hl-gift-balance">正在读取共享金币…</p>' +
            '<div id="hl-gift-recipient-wrap" style="display:none;margin-bottom:8px">' +
              '<label class="hl-plan-label" style="margin-top:4px" for="hl-gift-recipient">送给哪位嘉宾</label>' +
              '<select class="hl-plan-select" id="hl-gift-recipient"></select>' +
            '</div>' +
            '<div class="hl-gift-grid" id="hl-gift-grid"></div>' +
            '<p class="hl-help" id="hl-gift-tip"></p>' +
            '<div class="hl-plan-buttons"><button type="button" class="hl-pinkbtn" id="hl-gift-send-btn">送出礼物</button></div>' +
          '</div>' +
        '</div>' +

        // 抽屉 4：互动小游戏
        '<div class="hl-planner" id="hl-interact-planner" data-modal="interact" role="dialog" aria-modal="true">' +
          '<div class="hl-planner-sheet">' +
            '<div class="hl-plan-head"><b>🎮 直播间默契互动</b><button type="button" data-close-modal>×</button></div>' +
            '<p class="hl-help" id="hl-interact-stats">本场互动：0 次</p>' +
            '<div class="hl-plan-preview" id="hl-interact-prompt"></div>' +
            '<input class="hl-plan-input" id="hl-interact-input" maxlength="100" placeholder="也可以输入你想玩的题面或挑战（可选）">' +
            '<div class="hl-plan-buttons">' +
              '<button type="button" class="hl-plainbtn" id="hl-interact-next">换一题</button>' +
              '<button type="button" class="hl-pinkbtn" id="hl-interact-go">发起互动 ♡</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // 抽屉 5：User / 主播 直播中多人邀请 (Char + NPC)
        '<div class="hl-planner" id="hl-userhost-planner" data-modal="userHost" role="dialog" aria-modal="true">' +
          '<div class="hl-planner-sheet">' +
            '<div class="hl-plan-head"><b>🎤 邀请 Char / NPC 来直播间陪伴</b><button type="button" data-close-modal>×</button></div>' +
            '<div class="hl-invite-selected-bar" id="hl-invite-selected-bar"></div>' +
            '<input class="hl-plan-input hl-invite-search" id="hl-invite-search" maxlength="32" placeholder="搜索 Char 或 NPC 名称…">' +
            '<div class="hl-invite-tabs">' +
              '<button type="button" class="hl-invite-tab active" data-invite-filter="all">全部角色</button>' +
              '<button type="button" class="hl-invite-tab" data-invite-filter="char">Char</button>' +
              '<button type="button" class="hl-invite-tab" data-invite-filter="npc">NPC</button>' +
            '</div>' +
            '<div class="hl-char-picker-row" id="hl-userhost-list" style="margin:10px 0 12px;flex-wrap:wrap"></div>' +
            '<div class="hl-plan-buttons"><button type="button" class="hl-pinkbtn" data-close-modal>完成邀请</button></div>' +
          '</div>' +
        '</div>' +

        // 抽屉 5.5：选择 Char 或 NPC 独立开播面板
        '<div class="hl-planner" id="hl-rolepicker-planner" data-modal="rolePicker" role="dialog" aria-modal="true">' +
          '<div class="hl-planner-sheet">' +
            '<div class="hl-plan-head"><b>🌟 选择 Char 或 NPC 开播</b><button type="button" data-close-modal>×</button></div>' +
            '<p class="hl-help" id="hl-rolepicker-summary" style="margin-top:8px">正在读取真实角色库…</p>' +
            '<input class="hl-plan-input hl-invite-search" id="hl-rolepicker-search" maxlength="32" placeholder="搜索 Char 或 NPC 名称…">' +
            '<div class="hl-invite-tabs">' +
              '<button type="button" class="hl-invite-tab active" data-role-filter="all">全部</button>' +
              '<button type="button" class="hl-invite-tab" data-role-filter="char">Char</button>' +
              '<button type="button" class="hl-invite-tab" data-role-filter="npc">NPC</button>' +
            '</div>' +
            '<div class="hl-role-card-list" id="hl-rolepicker-list"></div>' +
            '<div class="hl-plan-buttons"><button type="button" class="hl-plainbtn" data-close-modal>关闭</button></div>' +
          '</div>' +
        '</div>' +

        // 抽屉 6：关播总结
        '<div class="hl-planner" id="hl-summary-planner" data-modal="summary" role="dialog" aria-modal="true">' +
          '<div class="hl-planner-sheet">' +
            '<div class="hl-plan-head"><b>📖 本场直播已收入手账</b><button type="button" data-close-modal>×</button></div>' +
            '<div id="hl-summary-body"></div>' +
            '<div class="hl-plan-buttons">' +
              '<button type="button" class="hl-plainbtn" data-close-modal>先留在手账里</button>' +
              '<button type="button" class="hl-plainbtn" id="hl-summary-replay">查看聊天记录</button>' +
              '<button type="button" class="hl-pinkbtn" id="hl-summary-remember">记住这场直播</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // 抽屉 7：手动审阅写入长期记忆
        '<div class="hl-planner" id="hl-memory-planner" data-modal="memory" role="dialog" aria-modal="true">' +
          '<div class="hl-planner-sheet">' +
            '<div class="hl-plan-head"><b>✨ 确认写入长期记忆</b><button type="button" data-close-modal>×</button></div>' +
            '<div id="hl-mem-char-wrap" style="display:none">' +
              '<label class="hl-plan-label" for="hl-mem-char-select">写入哪位 Char 的长期记忆</label>' +
              '<select class="hl-plan-select" id="hl-mem-char-select"></select>' +
            '</div>' +
            '<label class="hl-plan-label" for="hl-mem-title">记忆标题（最多 30 字）</label>' +
            '<input class="hl-plan-input" id="hl-mem-title" maxlength="30">' +
            '<label class="hl-plan-label" for="hl-mem-content">记忆摘要（最多 150 字）</label>' +
            '<textarea class="hl-plan-textarea" id="hl-mem-content" maxlength="150"></textarea>' +
            '<label class="hl-plan-label" for="hl-mem-keywords">关键词（逗号分隔）</label>' +
            '<input class="hl-plan-input" id="hl-mem-keywords" maxlength="60">' +
            '<p class="hl-help">确认后才会存入 Char 的长期记忆库（绝不会写入 NPC）；您随时可在「记忆」App 中查看或删除。</p>' +
            '<div class="hl-plan-buttons">' +
              '<button type="button" class="hl-plainbtn" data-close-modal>取消</button>' +
              '<button type="button" class="hl-pinkbtn" id="hl-mem-confirm-btn">确认保存记忆</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="hl-toast" id="hl-toast" role="status"></div>' +
      '</div>';
  }

  function bindAllEvents() {
    // 点击顶部「心动直播」返回桌面 & 页面内返回导航
    var backDesktop = $('#hl-back-desktop');
    if (backDesktop) backDesktop.onclick = function() { close(false); };
    var backSettings = $('#hl-back-settings');
    if (backSettings) backSettings.onclick = function() { switchView('home'); };
    var backDiary = $('#hl-back-from-diary');
    if (backDiary) backDiary.onclick = function() { switchView('home'); };
    var replayBack = $('#hl-replay-back');
    if (replayBack) replayBack.onclick = function() { switchView(_state.replayReturnView || 'diary'); };
    var replaySimToggle = $('#hl-replay-sim-toggle');
    if (replaySimToggle) {
      replaySimToggle.onchange = function() {
        _state.replayIncludeSim = Boolean(replaySimToggle.checked);
        renderReplayChunk(true);
      };
    }

    $$('.hl-nav').forEach(function(btn) {
      btn.onclick = function() { switchView(btn.dataset.view); };
    });

    // 大厅快捷开播
    var priv2 = $('#hl-private-start2');
    var goLive = $('#hl-go-live');
    var openRolePickerBtn = $('#hl-open-role-picker');
    if (priv2) priv2.onclick = function() { openPlannerModal('private', false, getActiveChar()); };
    if (goLive) goLive.onclick = function() { startUserSoloLive(); };
    if (openRolePickerBtn) openRolePickerBtn.onclick = function() { openRolePickerModal(); };

    var rolePickerSearch = $('#hl-rolepicker-search');
    if (rolePickerSearch) {
      rolePickerSearch.oninput = function() {
        _state.rolePickerSearch = rolePickerSearch.value || '';
        renderRolePickerBody();
      };
    }
    $$('[data-role-filter]').forEach(function(tab) {
      tab.onclick = function() {
        _state.rolePickerFilter = tab.dataset.roleFilter || 'all';
        $$('[data-role-filter]').forEach(function(t) {
          t.classList.toggle('active', t === tab);
        });
        renderRolePickerBody();
      };
    });

    // 抽屉通用关闭
    $$('[data-close-modal]').forEach(function(btn) {
      btn.onclick = function() {
        _state.pendingConnectAfterInvite = false;
        closeModal();
      };
    });
    $$('.hl-planner').forEach(function(backdrop) {
      backdrop.addEventListener('click', function(ev) {
        if (ev.target === backdrop) {
          _state.pendingConnectAfterInvite = false;
          closeModal();
        }
      });
    });

    // 企划抽屉事件
    $$('.hl-program').forEach(function(btn) {
      btn.onclick = function() {
        _state.plannerProgram = btn.dataset.program;
        var prog = aiMod().PROGRAMS[_state.plannerProgram] || aiMod().PROGRAMS.chat;
        var titleEl = $('#hl-plan-title');
        if (titleEl) titleEl.value = prog.defaultTitle;
        updatePlannerPreview();
      };
    });
    var asmrTimerSel = $('#hl-asmr-timer');
    if (asmrTimerSel) {
      asmrTimerSel.onchange = function() {
        var customEl = $('#hl-asmr-custom');
        var clockEl = $('#hl-asmr-clock-wrap');
        if (customEl) customEl.style.display = asmrTimerSel.value === 'custom' ? 'block' : 'none';
        if (clockEl) clockEl.style.display = asmrTimerSel.value === 'clock' ? 'block' : 'none';
      };
    }
    var planAsmrImport = $('#hl-plan-asmr-import');
    if (planAsmrImport) {
      planAsmrImport.onchange = async function(ev) {
        var files = ev.target.files ? Array.from(ev.target.files) : [];
        ev.target.value = '';
        if (!files.length) return;
        await runLocalAudioImportFiles(files, true);
      };
    }
    var planDefault = $('#hl-plan-default');
    if (planDefault) {
      planDefault.onclick = function() {
        _state.plannerProgram = 'chat';
        var titleEl = $('#hl-plan-title');
        var styleEl = $('#hl-plan-style');
        if (titleEl) titleEl.value = aiMod().PROGRAMS.chat.defaultTitle;
        if (styleEl) styleEl.value = 'natural';
        updatePlannerPreview();
      };
    }
    var planConfirm = $('#hl-plan-confirm');
    if (planConfirm) {
      planConfirm.onclick = async function() {
        var titleVal = (($('#hl-plan-title') || {}).value || '').trim();
        var styleVal = (($('#hl-plan-style') || {}).value || 'natural');
        var trackVal = (($('#hl-plan-asmr-track') || {}).value || '');
        var endActionVal = (($('#hl-asmr-end-action') || {}).value || 'stop_program');
        var durMs = _state.plannerProgram === 'asmr' ? getPlannerAsmrDurationMs() : 0;
        var timerMode = ($('#hl-asmr-timer') || {}).value || '0';
        if (_state.plannerProgram === 'asmr' && timerMode !== '0' && durMs <= 0) {
          showToast('自定义时长需大于 0 分钟');
          return;
        }
        closeModal();
        if (_state.plannerEditing && _state.room) {
          await applyProgramToRoom(_state.plannerProgram, titleVal, styleVal, {
            asmrTrackId: trackVal,
            asmrDurationMs: durMs,
            asmrEndAction: endActionVal
          }, true);
          showToast('已切换节目，直播继续 ♡');
        } else {
          var hostTarget = _state.plannerPendingMode === 'user'
            ? null
            : (_state.plannerHostObj || (_state.plannerPendingMode === 'npc' ? null : getActiveChar()));
          await startLiveRoom({
            hostMode: _state.plannerPendingMode,
            charObj: hostTarget,
            program: _state.plannerProgram,
            title: titleVal,
            style: styleVal,
            asmrTrackId: trackVal,
            asmrDurationMs: durMs,
            asmrEndAction: endActionVal
          });
        }
      };
    }

    // 直播间内控制
    var exitBtn = $('#hl-exit-room');
    if (exitBtn) exitBtn.onclick = leaveLiveRoomWithConfirm;

    var quickSwitch = $('#hl-quick-program-switch');
    if (quickSwitch) {
      quickSwitch.onclick = function() {
        if (_state.room) openPlannerModal(_state.room.hostMode, true, _state.room.hostCharObj);
      };
    }

    var callToggle = $('#hl-callModeToggle');
    if (callToggle) {
      callToggle.onclick = async function() {
        if (!_state.room || _state.room.hostMode === 'private') return;
        var k = getActiveStageTargetKey();
        var cur = storage().normalizePortraitOption(_state.portraitOptions[k]);
        var nextMode = cur.mode === 'fullscreen' ? 'call' : 'fullscreen';
        _state.portraitOptions[k] = await storage().savePortraitOption(k, Object.assign({}, cur, { mode: nextMode }));
        await refreshRoomVisuals();
        if (_state.selectedCharManageId === k) refreshCharManagePreview();
        showToast(nextMode === 'call' ? '已切换煲电话模式 📞' : '已切换全屏直播 🖼');
      };
    }

    var inviteBtn = $('#hl-invite-btn');
    if (inviteBtn) {
      inviteBtn.onclick = function() {
        if (!_state.room || _state.room.hostMode === 'private') return;
        _state.pendingConnectAfterInvite = false;
        openUserHostPicker();
      };
    }
    var minBtn = $('#hl-minimize-btn');
    if (minBtn) {
      minBtn.onclick = function() {
        minimizeLiveRoom();
      };
    }
    var inviteSearch = $('#hl-invite-search');
    if (inviteSearch) {
      inviteSearch.oninput = function() {
        _state.inviteSearchQuery = inviteSearch.value || '';
        renderUserHostModalBody();
      };
    }
    $$('[data-invite-filter]').forEach(function(tab) {
      tab.onclick = function() {
        _state.inviteFilterType = tab.dataset.inviteFilter || 'all';
        $$('[data-invite-filter]').forEach(function(t) {
          t.classList.toggle('active', t === tab);
        });
        renderUserHostModalBody();
      };
    });

    var followBtn = $('#hl-follow');
    if (followBtn) {
      followBtn.onclick = async function() {
        if (!_state.room || !_state.room.charObj) return;
        var followed = await storage().toggleFollowChar(_state.room.charObj.id);
        _state.followedChars[String(_state.room.charObj.id)] = followed;
        renderRoomIdentityChrome();
        showToast(followed ? '已关注 ' + _state.room.charObj.name : '已取消关注');
      };
    }

    // 弹幕流独立滑动与「↓ 最新消息」提示交互
    var msgsBox = $('#hl-messages');
    var latestBtn = $('#hl-latest-msg-btn');
    if (msgsBox) {
      msgsBox.addEventListener('scroll', function() {
        var atBottom = isMessagesAtBottom(msgsBox);
        if (atBottom) {
          _state.messagesAutoFollow = true;
          _state.unreadWhileScrolled = 0;
        } else {
          _state.messagesAutoFollow = false;
        }
        syncLatestMsgButton();
      });
      var markUserScrollIntent = function() {
        if (!isMessagesAtBottom(msgsBox)) {
          _state.messagesAutoFollow = false;
          syncLatestMsgButton();
        }
      };
      msgsBox.addEventListener('touchstart', markUserScrollIntent, { passive: true });
      msgsBox.addEventListener('wheel', markUserScrollIntent, { passive: true });
    }
    if (latestBtn) {
      latestBtn.onclick = function() {
        scrollMessagesToBottom();
      };
    }

    // 弹幕发送与快捷互动
    var sendBtn = $('#hl-send');
    var msgInput = $('#hl-message-input');
    if (sendBtn) sendBtn.onclick = sendRoomMessage;
    if (msgInput) {
      msgInput.onkeydown = function(ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); sendRoomMessage(); }
      };
    }
    var like1 = $('#hl-like');
    if (like1) like1.onclick = handleHeartClick;
    var gift1 = $('#hl-gift');
    var gift2 = $('#hl-quick-gift');
    if (gift1) gift1.onclick = openGiftDrawer;
    if (gift2) gift2.onclick = openGiftDrawer;
    var giftSend = $('#hl-gift-send-btn');
    if (giftSend) giftSend.onclick = submitGiftClick;

    var interactBtn = $('#hl-interact');
    var interactNext = $('#hl-interact-next');
    var interactGo = $('#hl-interact-go');
    if (interactBtn) interactBtn.onclick = openInteractGameModal;
    if (interactNext) {
      interactNext.onclick = function() {
        if (!_state.room) return;
        _state.room.gameSession.round++;
        openInteractGameModal();
      };
    }
    if (interactGo) {
      interactGo.onclick = function() {
        var inp = $('#hl-interact-input');
        triggerInteractRound(inp ? inp.value : '');
      };
    }

    // 连麦面板与操作
    var connectBtn = $('#hl-connect-btn');
    if (connectBtn) {
      connectBtn.onclick = openConnectModal;
    }
    var textConnBtn = $('#hl-text-connect');
    var voiceConnBtn = $('#hl-voice-connect');
    var videoConnBtn = $('#hl-video-connect');
    var camConnBtn = $('#hl-camera-connect');
    if (textConnBtn) textConnBtn.onclick = function() { startConnection('text'); };
    if (voiceConnBtn) voiceConnBtn.onclick = function() { startConnection('voice'); };
    if (videoConnBtn) videoConnBtn.onclick = function() { startConnection('video'); };
    if (camConnBtn) camConnBtn.onclick = enableLocalCamera;

    var layoutSel = $('#hl-connect-layout');
    if (layoutSel) {
      layoutSel.value = (_state.settings && _state.settings.connectionLayout) || 'floating';
      layoutSel.onchange = function() {
        if (_state.connectionType) applyConnectionLayout(layoutSel.value);
      };
    }

    var layoutToggle = $('#hl-layout-toggle');
    var swapScreens = $('#hl-swap-screens');
    var disconnectBtn = $('#hl-disconnect');
    if (layoutToggle) {
      layoutToggle.onclick = function() {
        if (!_state.connectionType) return;
        var next = $('#hl-room').classList.contains('hl-connection-active') ? 'floating' : 'split';
        applyConnectionLayout(next);
        showToast(next === 'split' ? '已切换双人并列（保持当前通话/连麦）' : '已切换主播大屏＋小窗');
      };
    }
    if (swapScreens) {
      swapScreens.onclick = function() {
        var rEl = $('#hl-room');
        if (rEl) rEl.classList.toggle('hl-connection-swapped');
      };
    }
    if (disconnectBtn) disconnectBtn.onclick = function() { disconnectCall(false); };

    var textCallSend = $('#hl-text-call-send');
    var textCallInput = $('#hl-text-call-input');
    if (textCallSend) {
      textCallSend.onclick = function() {
        if (!textCallInput) return;
        var v = textCallInput.value.trim();
        if (!v) return;
        textCallInput.value = '';
        sendCohostMessage(v, 'text');
      };
    }
    if (textCallInput) {
      textCallInput.onkeydown = function(ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); textCallSend && textCallSend.click(); }
      };
    }

    var micToggle = $('#hl-mic-toggle');
    var voiceDictate = $('#hl-voice-dictate');
    var voiceTextSend = $('#hl-voice-text-send');
    var voiceTextInput = $('#hl-voice-text-input');
    if (micToggle) micToggle.onclick = toggleVoiceMic;
    if (voiceDictate) voiceDictate.onclick = toggleVoiceDictation;
    if (voiceTextSend) {
      voiceTextSend.onclick = function() {
        if (!voiceTextInput) return;
        var v = voiceTextInput.value.trim();
        if (!v) return;
        voiceTextInput.value = '';
        sendCohostMessage(v, 'voice');
      };
    }
    if (voiceTextInput) {
      voiceTextInput.onkeydown = function(ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); voiceTextSend && voiceTextSend.click(); }
      };
    }

    // 摘要 & 长期记忆
    var sumRemember = $('#hl-summary-remember');
    if (sumRemember) {
      sumRemember.onclick = function() {
        if (_state.memoryDraft) openMemoryConfirmModal(_state.memoryDraft);
      };
    }
    var memConfirmBtn = $('#hl-mem-confirm-btn');
    if (memConfirmBtn) memConfirmBtn.onclick = submitMemoryConfirm;

    // ===== 设置页交互绑定 =====
    bindSettingsEvents();
  }

  function bindSettingsEvents() {
    var saveSettingPatch = async function(patch) {
      _state.settings = await storage().saveSettings(Object.assign({}, _state.settings, patch));
    };

    var charSelect = $('#hl-char-img-select');
    if (charSelect) {
      charSelect.onchange = function() {
        _state.selectedCharManageId = charSelect.value;
        refreshCharManagePreview();
      };
    }

    var saveCharOpt = async function() {
      var cid = _state.selectedCharManageId || getActiveChar().id;
      var nextOpt = {
        mode: ($('#hl-char-img-mode') || {}).value || 'fullscreen',
        fit: ($('#hl-char-img-fit') || {}).value || 'cover',
        position: ($('#hl-char-img-position') || {}).value || 'center'
      };
      _state.portraitOptions[cid] = await storage().savePortraitOption(cid, nextOpt);
      await refreshCharManagePreview();
      await refreshRoomVisuals();
    };
    ['hl-char-img-mode', 'hl-char-img-fit', 'hl-char-img-position'].forEach(function(id) {
      var el = $('#' + id);
      if (el) el.onchange = saveCharOpt;
    });

    var charImgFile = $('#hl-char-img-file');
    if (charImgFile) {
      charImgFile.onchange = async function(ev) {
        var f = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!f) return;
        var cid = _state.selectedCharManageId || getActiveChar().id;
        try {
          await storage().savePortraitFile(cid, f);
          await refreshCharManagePreview();
          await refreshRoomVisuals();
          showToast('Char 直播形象已保存 ♡');
        } catch (err) {
          showToast(err.message || '保存失败');
        }
      };
    }
    var charUrlApply = $('#hl-char-img-url-apply');
    if (charUrlApply) {
      charUrlApply.onclick = async function() {
        var cid = _state.selectedCharManageId || getActiveChar().id;
        var raw = ($('#hl-char-img-url') || {}).value || '';
        try {
          await storage().savePortraitUrl(cid, raw);
          await refreshCharManagePreview();
          await refreshRoomVisuals();
          showToast('Char 图片 URL 已应用 ♡');
        } catch (err) {
          showToast(err.message || '图片 URL 应用失败');
        }
      };
    }
    var charClear = $('#hl-char-img-clear');
    if (charClear) {
      charClear.onclick = async function() {
        var cid = _state.selectedCharManageId || getActiveChar().id;
        await storage().clearPortrait(cid);
        await refreshCharManagePreview();
        await refreshRoomVisuals();
        showToast('已恢复默认形象');
      };
    }

    var voiceSaveBtn = $('#hl-char-voice-save');
    if (voiceSaveBtn) {
      voiceSaveBtn.onclick = async function() {
        var cid = _state.selectedCharManageId || getActiveChar().id;
        var v = (($('#hl-char-voice-id') || {}).value || '').trim();
        await storage().saveCharVoiceId(cid, v);
        _state.charVoices = await storage().loadCharVoices();
        await refreshCharManagePreview();
        showToast(v ? '已保存 Char 直播音色' : '已恢复沿用微信单聊音色');
      };
    }

    // User 形象
    var userMode = $('#hl-user-img-mode');
    if (userMode) {
      userMode.onchange = async function() {
        var cur = storage().normalizePortraitOption(_state.portraitOptions.user);
        _state.portraitOptions.user = await storage().savePortraitOption('user', Object.assign({}, cur, { mode: userMode.value }));
        await refreshUserPortraitPreview();
        await refreshRoomVisuals();
      };
    }
    var userFile = $('#hl-user-img-file');
    if (userFile) {
      userFile.onchange = async function(ev) {
        var f = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!f) return;
        try {
          await storage().savePortraitFile('user', f);
          await refreshUserPortraitPreview();
          await refreshRoomVisuals();
          showToast('User 形象已保存');
        } catch (err) {
          showToast(err.message || '保存失败');
        }
      };
    }
    var userUrlApply = $('#hl-user-img-url-apply');
    if (userUrlApply) {
      userUrlApply.onclick = async function() {
        var raw = ($('#hl-user-img-url') || {}).value || '';
        try {
          await storage().savePortraitUrl('user', raw);
          await refreshUserPortraitPreview();
          await refreshRoomVisuals();
          showToast('User 图片 URL 已应用');
        } catch (err) {
          showToast(err.message || '图片加载失败');
        }
      };
    }
    var userClear = $('#hl-user-img-clear');
    if (userClear) {
      userClear.onclick = async function() {
        await storage().clearPortrait('user');
        await refreshUserPortraitPreview();
        await refreshRoomVisuals();
        showToast('已恢复 User 默认形象');
      };
    }

    // 背景预设与自定义
    $$('.hl-swatchbtn').forEach(function(btn) {
      btn.onclick = async function() {
        await saveSettingPatch({ theme: btn.dataset.theme, customBgType: '', customBgUrl: '' });
        await refreshSettingsView();
        showToast('直播背景已更新');
      };
    });
    var bgFile = $('#hl-bg-file');
    if (bgFile) {
      bgFile.onchange = async function(ev) {
        var f = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!f) return;
        try {
          await storage().saveCustomBgFile(f);
          await saveSettingPatch({ customBgType: 'local', customBgUrl: '' });
          await refreshSettingsView();
          showToast('本地背景已应用 ♡');
        } catch (err) {
          showToast(err.message || '保存失败');
        }
      };
    }
    var applyBgUrl = $('#hl-apply-bg-url');
    if (applyBgUrl) {
      applyBgUrl.onclick = async function() {
        var raw = (($('#hl-bg-url') || {}).value || '').trim();
        if (!storage().isHttpsUrl(raw)) {
          showToast('请输入 HTTPS 图片链接');
          return;
        }
        await saveSettingPatch({ customBgType: 'url', customBgUrl: raw });
        await refreshSettingsView();
        showToast('URL 背景已应用 ♡');
      };
    }
    var clearBg = $('#hl-clear-bg');
    if (clearBg) {
      clearBg.onclick = async function() {
        await storage().clearCustomBg();
        await saveSettingPatch({ customBgType: '', customBgUrl: '' });
        await refreshSettingsView();
        showToast('已恢复预设背景');
      };
    }

    // ASMR 本地大音频导入、取消导入与云端清单同步
    var asmrFile = $('#hl-asmr-file');
    if (asmrFile) {
      asmrFile.onchange = async function(ev) {
        var files = ev.target.files ? Array.from(ev.target.files) : [];
        ev.target.value = '';
        if (!files.length) return;
        await runLocalAudioImportFiles(files, false);
      };
    }
    var cancelImportBtn = $('#hl-asmr-cancel-import');
    if (cancelImportBtn) {
      cancelImportBtn.onclick = function() {
        if (_importAbortCtrl) {
          try { _importAbortCtrl.abort(); } catch (_) {}
        }
      };
    }
    var cloudSyncBtn = $('#hl-cloud-sync-btn');
    if (cloudSyncBtn) {
      cloudSyncBtn.onclick = async function() {
        var urlInp = $('#hl-cloud-manifest-url');
        var statusEl = $('#hl-cloud-status');
        var rawUrl = ((urlInp && urlInp.value) || '').trim();
        if (!rawUrl) {
          await storage().setCloudManifestUrl('');
          await storage().saveCloudCatalog([]);
          _state.cloudManifestUrl = '';
          _state.cloudCatalog = [];
          await refreshAsmrLibraryUi();
          updatePlannerPreview();
          if (statusEl) statusEl.textContent = '已清空云端清单地址（已缓存条目已从清单移除）。';
          showToast('已清空云端音频清单');
          return;
        }
        cloudSyncBtn.disabled = true;
        if (statusEl) statusEl.textContent = '正在请求云端 HTTPS 清单…';
        try {
          var items = await storage().fetchCloudManifest(rawUrl);
          _state.cloudManifestUrl = rawUrl;
          _state.cloudCatalog = items;
          await refreshAsmrLibraryUi();
          updatePlannerPreview();
          if (statusEl) statusEl.textContent = '同步成功：共发现 ' + items.length + ' 首可选云端音频';
          showToast('云端清单已同步（' + items.length + ' 首）♡');
        } catch (err) {
          if (statusEl) statusEl.textContent = (err && err.message) || '云端清单同步失败';
          showToast((err && err.message) || '同步失败');
        } finally {
          cloudSyncBtn.disabled = false;
        }
      };
    }

    // 常规开关与滑块
    var bindControl = function(id, key, isCheck) {
      var el = $('#' + id);
      if (!el) return;
      el.addEventListener('change', async function() {
        var patch = {};
        patch[key] = isCheck ? el.checked : (el.type === 'range' ? Number(el.value) : el.value);
        await saveSettingPatch(patch);
        if (key === 'voiceVol' && $('#hl-voice-vol-label')) $('#hl-voice-vol-label').textContent = _state.settings.voiceVol + '%';
        if (key === 'ambient') {
          if ($('#hl-ambient-label')) $('#hl-ambient-label').textContent = _state.settings.ambient + '%';
          syncAsmrVolume();
        }
        if (key === 'duck') syncAsmrVolume();
      });
      if (el.type === 'range') {
        el.addEventListener('input', function() {
          if (key === 'voiceVol' && $('#hl-voice-vol-label')) $('#hl-voice-vol-label').textContent = el.value + '%';
          if (key === 'ambient') {
            if ($('#hl-ambient-label')) $('#hl-ambient-label').textContent = el.value + '%';
            if (_state.settings) _state.settings.ambient = Number(el.value);
            syncAsmrVolume();
          }
        });
      }
    };

    bindControl('hl-motion', 'motion', true);
    bindControl('hl-voice', 'voice', false);
    bindControl('hl-expression', 'expression', false);
    bindControl('hl-voice-vol', 'voiceVol', false);
    bindControl('hl-captions', 'captions', true);
    bindControl('hl-asmr-play-mode', 'asmrPlayMode', false);
    bindControl('hl-asmr-default-track', 'asmrSelectedTrackId', false);
    bindControl('hl-ambient', 'ambient', false);
    bindControl('hl-duck', 'duck', true);
    bindControl('hl-timer', 'timer', false);
    bindControl('hl-settings-end-action', 'asmrEndAction', false);
    bindControl('hl-backup-audio', 'includeAudioInBackup', true);
    bindControl('hl-initiative', 'initiative', false);
    bindControl('hl-thinking', 'thinking', false);
    bindControl('hl-context', 'context', true);
    bindControl('hl-sim', 'sim', true);
    bindControl('hl-save-sim-log', 'saveSimAudienceInLog', true);
    bindControl('hl-save-prompt', 'savePrompt', true);

    var resetBtn = $('#hl-reset-settings');
    if (resetBtn) {
      resetBtn.onclick = async function() {
        if (typeof global.confirm === 'function' && !global.confirm('确定恢复心动直播默认设置？（不会删除已导入的 ASMR 音频与手账记录）')) {
          return;
        }
        _state.settings = await storage().saveSettings(storage().DEFAULT_SETTINGS);
        await refreshSettingsView();
        showToast('已恢复默认设置');
      };
    }
  }

  // ===== Android 返回栈与生命周期守护 =====
  function bindNavigationGuards() {
    unbindNavigationGuards();

    _state.visHandler = function() {
      if (global.document && global.document.visibilityState === 'visible') {
        checkAsmrTimer();
        updateMiniWindowChrome();
      }
    };
    _state.pageHideHandler = function() {
      cleanupAllMedia();
    };
    var baseHeight = Number((global.visualViewport && global.visualViewport.height) || global.innerHeight || 0);
    _state.viewportHandler = function() {
      var vv = global.visualViewport;
      var winH = Number(global.innerHeight || 0);
      var curH = Number((vv && vv.height) || winH || 0);
      if (winH > baseHeight) baseHeight = winH;
      var roomEl = $('#hl-room');
      if (_state.pageEl && curH > 0) {
        var vvShrank = Boolean(vv && winH > 0 && vv.height < winH - 90);
        var winShrank = Boolean(baseHeight > 0 && curH < baseHeight - 110);
        var kbLikely = vvShrank || winShrank;
        if (vvShrank && vv.height > 180) {
          var px = Math.round(vv.height) + 'px';
          _state.pageEl.style.height = px;
          _state.pageEl.style.maxHeight = px;
        } else {
          _state.pageEl.style.height = '';
          _state.pageEl.style.maxHeight = '';
        }
        if (roomEl) roomEl.classList.toggle('hl-kb-open', kbLikely);
      }
      if (_state.minimized && _state.miniEl && _state.miniPos) {
        clampMiniPosition(_state.miniEl, _state.miniPos.left, _state.miniPos.top);
      }
      var ae = global.document && global.document.activeElement;
      if (ae && _state.pageEl && _state.pageEl.contains(ae) && typeof ae.scrollIntoView === 'function') {
        setTimeout(function() {
          try { ae.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
        }, 80);
      }
    };

    if (global.document) {
      global.document.addEventListener('visibilitychange', _state.visHandler);
    }
    global.addEventListener('focus', _state.visHandler);
    global.addEventListener('pagehide', _state.pageHideHandler);
    global.addEventListener('resize', _state.viewportHandler);
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', _state.viewportHandler);
    }

    try {
      if (global.history && typeof global.history.pushState === 'function') {
        global.history.pushState({ heartbeatLive: true }, '');
        _state.pushedHistory = true;
        _state.popHandler = function() {
          if (!_state.pageEl) return;
          if (_state.minimized) return;
          if (_state.openModal) {
            closeModal();
            try { global.history.pushState({ heartbeatLive: true }, ''); } catch (_) {}
            return;
          }
          if (_state.activeView === 'replay') {
            switchView(_state.replayReturnView || 'diary');
            try { global.history.pushState({ heartbeatLive: true }, ''); } catch (_) {}
            return;
          }
          if (_state.activeView === 'live') {
            try { global.history.pushState({ heartbeatLive: true }, ''); } catch (_) {}
            leaveLiveRoomWithConfirm();
            return;
          }
          if (_state.activeView !== 'home') {
            switchView('home');
            try { global.history.pushState({ heartbeatLive: true }, ''); } catch (_) {}
            return;
          }
          _state.pushedHistory = false;
          close(true);
        };
        global.addEventListener('popstate', _state.popHandler);
      }
    } catch (_) {}
  }

  function unbindNavigationGuards() {
    if (_state.visHandler) {
      if (global.document) global.document.removeEventListener('visibilitychange', _state.visHandler);
      global.removeEventListener('focus', _state.visHandler);
      _state.visHandler = null;
    }
    if (_state.pageHideHandler) {
      global.removeEventListener('pagehide', _state.pageHideHandler);
      _state.pageHideHandler = null;
    }
    if (_state.viewportHandler) {
      global.removeEventListener('resize', _state.viewportHandler);
      if (global.visualViewport) {
        global.visualViewport.removeEventListener('resize', _state.viewportHandler);
      }
      _state.viewportHandler = null;
    }
    if (_state.popHandler) {
      global.removeEventListener('popstate', _state.popHandler);
      _state.popHandler = null;
    }
  }

  async function open(opts) {
    opts = opts || {};
    // 若当前存在应用内悬浮小窗缩小的活跃直播间，点击图标直接无损恢复而不重开或中断
    if (_state.room && _state.pageEl && _state.minimized) {
      restoreFromMiniWindow();
      return _state.pageEl;
    }

    if (_state.miniEl && typeof _state.miniEl._cleanupDrag === 'function') {
      try { _state.miniEl._cleanupDrag(); } catch (_) {}
    }
    removeMiniWindow();
    var existing = global.document && global.document.getElementById(PAGE_ID);
    if (existing) existing.remove();
    cleanupAllMedia();

    _state.chars = await aiMod().loadAvailableChars();
    _state.invitees = typeof aiMod().loadAvailableInvitees === 'function'
      ? await aiMod().loadAvailableInvitees()
      : _state.chars.slice();
    _state.user = await aiMod().loadCurrentUserProfile();
    _state.settings = await storage().loadSettings();
    _state.portraitOptions = await storage().loadPortraitOptions();
    _state.followedChars = await storage().loadFollowedChars();
    _state.charVoices = await storage().loadCharVoices();
    _state.asmrTracks = typeof storage().listAsmrTracksWithStatus === 'function'
      ? await storage().listAsmrTracksWithStatus()
      : await storage().listAsmrTracks();
    _state.cloudCatalog = typeof storage().listCloudCatalog === 'function'
      ? await storage().listCloudCatalog()
      : [];
    _state.cloudManifestUrl = typeof storage().getCloudManifestUrl === 'function'
      ? await storage().getCloudManifestUrl()
      : '';
    _state.journals = await storage().loadJournals();
    _state.room = null;
    _state.connectionType = '';
    _state.openModal = '';
    _state.connectionLayout = _state.settings.connectionLayout || 'floating';

    if (opts.charId) _state.selectedCharId = String(opts.charId);
    else if (!_state.selectedCharId && _state.chars.length) _state.selectedCharId = String(_state.chars[0].id);

    var page = global.document.createElement('div');
    page.id = PAGE_ID;
    page.className = 'full-page';
    page.innerHTML = buildPageHtml();
    _state.pageEl = page;

    if (typeof global.openPage === 'function') {
      global.openPage(page);
    } else {
      var appEl = global.document.getElementById('app') || global.document.body;
      appEl.appendChild(page);
    }

    bindAllEvents();
    bindNavigationGuards();
    await applyRoomThemeAndBackground();
    await renderLobbyView();
    switchView(opts.view || 'home');
    return page;
  }

  function close(fromPopstate) {
    _state.sessionSeq++;
    _state.aiRequestSeq++;
    clearAiQueue();
    if (_state.miniEl && typeof _state.miniEl._cleanupDrag === 'function') {
      try { _state.miniEl._cleanupDrag(); } catch (_) {}
    }
    removeMiniWindow();
    cleanupAllMedia();
    storage().revokeAllObjectUrls();
    unbindNavigationGuards();

    var p = _state.pageEl;
    _state.pageEl = null;
    _state.room = null;
    _state.openModal = '';

    if (!fromPopstate && _state.pushedHistory && global.history && typeof global.history.back === 'function') {
      _state.pushedHistory = false;
      try { global.history.back(); } catch (_) {}
    }
    if (p) {
      p.style.zIndex = '';
      if (typeof global.closePage === 'function') {
        global.closePage(PAGE_ID);
      } else {
        p.remove();
      }
    }
  }

  global.HeartbeatLiveApp = {
    PAGE_ID: PAGE_ID,
    open: open,
    close: close,
    switchView: switchView,
    startLiveRoom: startLiveRoom,
    applyProgramToRoom: applyProgramToRoom,
    startConnection: startConnection,
    openConnectModal: openConnectModal,
    openRolePickerModal: openRolePickerModal,
    disconnectCall: disconnectCall,
    applyConnectionLayout: applyConnectionLayout,
    checkAsmrTimer: checkAsmrTimer,
    minimizeLiveRoom: minimizeLiveRoom,
    restoreFromMiniWindow: restoreFromMiniWindow,
    removeMiniWindow: removeMiniWindow,
    inviteCharToUserRoom: inviteCharToUserRoom,
    inviteViewerToRoom: inviteCharToUserRoom,
    removeViewerFromUserRoom: removeViewerFromUserRoom,
    openReplayView: openReplayView,
    getState: function() { return _state; }
  };

  global.showHeartbeatLivePage = function(opts) {
    return open(opts);
  };
  global.showHeartbeatLiveApp = global.showHeartbeatLivePage;
})(typeof window !== 'undefined' ? window : globalThis);
