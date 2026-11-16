// js/heartbeat-live.js — 心动直播 V1.0 正式引擎
// 集成真实 Char 人设、世界书、只读长期记忆与万象镜经历、真实 AI 对话、
// Minimax TTS、Web Speech API、共享经济礼物、ASMR 本地音频库与直播手账。

(function(global) {
  'use strict';

  var PAGE_ID = 'heartbeat-live-page';
  var THEME_KEYS = ['cloud', 'moon', 'garden', 'cafe'];
  var THEME_LABELS = { cloud: '云朵粉紫', moon: '月夜星空', garden: '四季花园', cafe: '暖光咖啡' };

  var _state = {
    pageEl: null,
    activeView: 'home', // 'home' | 'live' | 'diary' | 'settings'
    chars: [],
    user: { id: 0, name: '我', avatar: '', description: '' },
    selectedCharId: '',
    selectedCharManageId: '',
    settings: null,
    portraitOptions: {},
    followedChars: {},
    charVoices: {},
    asmrTracks: [],
    journals: [],
    customBgSrc: '',
    // 当前直播间运行时状态
    room: null,
    // 抽屉与弹窗
    openModal: '', // '' | 'planner' | 'connect' | 'gift' | 'interact' | 'memory' | 'userHost' | 'summary'
    plannerPendingMode: 'char',
    plannerEditing: false,
    plannerProgram: 'chat',
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
    // 定时器与请求防护
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
      return { id: 'demo_char', rawId: null, name: '星野（示例）', avatar: '', emojiFallback: '🌸', gender: '', role: '陪伴者', description: '温柔陪伴型演示角色', status: '', isDemo: true };
    }
    var found = _state.chars.find(function(c) { return String(c.id) === String(_state.selectedCharId); });
    return found || _state.chars[0];
  }

  function getCharById(charId) {
    return _state.chars.find(function(c) { return String(c.id) === String(charId); }) || getActiveChar();
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

  function cleanupAllMedia() {
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
      el.classList.toggle('sel', el.dataset.view === viewName);
    });
    var nav = $('#hl-nav');
    if (nav) nav.classList.toggle('hidden', viewName === 'live');
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
    if (!picker || !grid) return;

    var chars = _state.chars;
    var active = getActiveChar();

    if (!chars.length) {
      picker.innerHTML =
        '<div class="hl-note" style="width:100%">当前角色档案中尚未创建 Char（type=char），正在以本地示例展示。' +
        '<button type="button" class="hl-ghost" id="hl-goto-chars" style="margin-left:8px;padding:4px 9px;font-size:11px">前往新建角色</button></div>';
      var goBtn = $('#hl-goto-chars');
      if (goBtn) {
        goBtn.onclick = function() {
          close();
          if (typeof global.showCharacterPage === 'function') global.showCharacterPage();
        };
      }
    } else {
      picker.innerHTML = chars.map(function(c) {
        var sel = String(c.id) === String(active.id);
        return '<button type="button" class="hl-char-chip' + (sel ? ' selected' : '') + '" data-pick-char="' + esc(c.id) + '">' +
          '<span class="hl-chip-avatar">' + renderCharAvatarHtml(c) + '</span>' +
          '<span>' + esc(c.name) + '</span>' +
        '</button>';
      }).join('');
      $$('[data-pick-char]').forEach(function(btn) {
        btn.onclick = function() {
          _state.selectedCharId = btn.dataset.pickChar;
          renderLobbyView();
        };
      });
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
          '<small>' + esc(active.name) + ' 来前排陪伴</small>' +
        '</div>' +
      '</button>'
    );

    grid.innerHTML = cardHtml.join('');

    $$('[data-start-char]').forEach(function(btn) {
      btn.onclick = function() {
        _state.selectedCharId = btn.dataset.startChar;
        openPlannerModal('char', false);
      };
    });
    var uCard = $('#hl-card-user-live');
    if (uCard) {
      uCard.onclick = function() { openUserHostPicker(); };
    }
  }

  function openUserHostPicker() {
    var list = $('#hl-userhost-list');
    if (!list) {
      openPlannerModal('user', false);
      return;
    }
    var active = getActiveChar();
    var chars = _state.chars.length ? _state.chars : [active];
    list.innerHTML = chars.map(function(c) {
      var sel = String(c.id) === String(active.id);
      return '<button type="button" class="hl-char-chip' + (sel ? ' selected' : '') + '" data-invite-char="' + esc(c.id) + '">' +
        '<span class="hl-chip-avatar">' + renderCharAvatarHtml(c) + '</span>' +
        '<span>' + esc(c.name) + '</span>' +
      '</button>';
    }).join('');
    $$('[data-invite-char]').forEach(function(btn) {
      btn.onclick = function() {
        _state.selectedCharId = btn.dataset.inviteChar;
        closeModal();
        openPlannerModal('user', false);
      };
    });
    openModal('userHost');
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
    if (asmrBox) asmrBox.classList.toggle('visible', prog.id === 'asmr');

    var trackSelect = $('#hl-plan-asmr-track');
    if (trackSelect) {
      var tracks = _state.asmrTracks || [];
      if (!tracks.length) {
        trackSelect.innerHTML = '<option value="">尚未导入本地音频（仅定时静音陪伴）</option>';
      } else {
        trackSelect.innerHTML = '<option value="">按播放模式自动选择（' + tracks.length + ' 首）</option>' +
          tracks.map(function(t) {
            return '<option value="' + esc(t.id) + '">' + esc(t.name) + ' (' + formatBytes(t.size) + ')</option>';
          }).join('');
        trackSelect.value = (_state.settings && _state.settings.asmrSelectedTrackId) || '';
      }
    }
  }

  function openPlannerModal(hostMode, editing) {
    var c = _state.room && editing ? _state.room.charObj : getActiveChar();
    _state.plannerPendingMode = hostMode || 'char';
    _state.plannerEditing = Boolean(editing);

    if (editing && _state.room) {
      _state.plannerProgram = _state.room.program || 'chat';
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
      nameEl.textContent = _state.plannerPendingMode === 'user'
        ? ('我开播 · 特邀 ' + c.name)
        : (_state.plannerPendingMode === 'private' ? (c.name + ' · 私人双人连线') : (c.name + ' 的直播'));
    }
    var headEl = $('#hl-planner-heading');
    if (headEl) headEl.textContent = editing ? '☷ 切换当前节目（不断开直播）' : '📺 本场直播企划';

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

  // ===== 直播间 ASMR 播放与绝对时间戳定时 =====
  async function startAsmrAudioIfAvailable(selectedTrackId) {
    stopAsmrPlayback();
    var tracks = _state.asmrTracks || [];
    if (!tracks.length) {
      appendRoomMessage({
        senderRole: 'system',
        sender: 'ASMR 提示',
        text: '本地 ASMR 音频库暂无音轨，可在「直播设置 → 电台与 ASMR」导入音频；当前以静音文字陪伴与定时继续。'
      });
      return false;
    }

    var playMode = (_state.settings && _state.settings.asmrPlayMode) || 'loop';
    var track = null;
    if (selectedTrackId) {
      track = tracks.find(function(t) { return t.id === selectedTrackId; }) || null;
    }
    if (!track && _state.settings && _state.settings.asmrSelectedTrackId) {
      track = tracks.find(function(t) { return t.id === _state.settings.asmrSelectedTrackId; }) || null;
    }
    if (!track) {
      if (playMode === 'random') {
        _state.asmrCurrentTrackIndex = Math.floor(Math.random() * tracks.length);
      } else {
        _state.asmrCurrentTrackIndex = _state.asmrCurrentTrackIndex % tracks.length;
      }
      track = tracks[_state.asmrCurrentTrackIndex];
    }
    if (!track) return false;

    var url = await storage().getAsmrTrackPlayUrl(track.id);
    if (!url || !_state.room || _state.room.program !== 'asmr') return false;

    if (typeof Audio === 'undefined') return false;
    var audio = new Audio(url);
    _asmrAudioEl = audio;
    audio.loop = playMode === 'single';
    syncAsmrVolume();

    audio.addEventListener('ended', function() {
      if (_asmrAudioEl !== audio || !_state.room || _state.room.program !== 'asmr') return;
      if (playMode === 'single') return;
      if (playMode === 'random' && _state.asmrTracks.length > 1) {
        var nextIdx = Math.floor(Math.random() * _state.asmrTracks.length);
        _state.asmrCurrentTrackIndex = nextIdx;
      } else {
        _state.asmrCurrentTrackIndex = (_state.asmrCurrentTrackIndex + 1) % Math.max(1, _state.asmrTracks.length);
      }
      var nextTrack = _state.asmrTracks[_state.asmrCurrentTrackIndex];
      if (nextTrack) startAsmrAudioIfAvailable(nextTrack.id);
    });

    try {
      await audio.play();
      _state.room.asmrUsed = true;
      appendRoomMessage({
        senderRole: 'system',
        sender: 'ASMR 正在播放',
        text: '🎵 ' + track.name + '（' + ({ loop: '列表循环', single: '单曲循环', random: '随机播放' }[playMode] || '循环') + '）'
      });
      return true;
    } catch (e) {
      appendRoomMessage({
        senderRole: 'system',
        sender: 'ASMR 提示',
        text: '音频已准备（「' + track.name + '」），受浏览器自动播放限制影响请再次点击页面或手动重播。'
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
        appendRoomMessage({ senderRole: 'system', sender: 'ASMR 定时结束', text: '已平滑淡出停止 ASMR 音景，切换回闲聊陪伴模式 ♡' });
        showToast('🌙 ASMR 定时结束，已停止播放');
      }
      return;
    }
    if (statusEl && _state.room.program === 'asmr') {
      var mins = Math.ceil(remaining / 60000);
      statusEl.textContent = '🎧 ASMR · 剩余 ' + mins + ' 分钟';
    }
  }

  // ===== 直播间创建与热切换 =====
  async function startLiveRoom(opts) {
    cleanupAllMedia();
    _state.sessionSeq++;
    var sid = _state.sessionSeq;
    var hostMode = opts.hostMode || 'char';
    var charObj = opts.charObj || getActiveChar();
    var progId = opts.program || 'chat';
    var progInfo = aiMod().PROGRAMS[progId] || aiMod().PROGRAMS.chat;
    var title = (opts.title || '').trim() || progInfo.defaultTitle;
    var style = opts.style || (_state.settings && _state.settings.initiative) || 'natural';

    _state.room = {
      sessionId: sid,
      startedAt: Date.now(),
      hostMode: hostMode,
      charObj: charObj,
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
      messages: [],
      gameSession: { round: 0, score: 0, prompt: '' }
    };

    var msgsBox = $('#hl-messages');
    if (msgsBox) msgsBox.innerHTML = '';

    renderRoomIdentityChrome();
    await applyRoomThemeAndBackground();
    await refreshRoomVisuals();
    switchView('live');
    await applyProgramToRoom(progId, title, style, opts, false);

    // 真实开场问候
    var openingUserPrompt = hostMode === 'user'
      ? ('我刚刚开启了我的直播间（节目：「' + progInfo.label + '」，标题：「' + title + '」），请作为刚进直播间的前排朋友兼特邀嘉宾自然打声招呼。')
      : hostMode === 'private'
        ? ('我刚刚进入我们的私人连线直播间（节目：「' + progInfo.label + '」，标题：「' + title + '」），请用贴合人设的语气跟我开场打个招呼。')
        : ('你刚刚开启了直播（节目：「' + progInfo.label + '」，标题：「' + title + '」），请向刚进来的 ' + _state.user.name + ' 自然开场白。');

    triggerCharAiTurn({
      triggerType: 'opening',
      userPrompt: openingUserPrompt
    });
  }

  function renderRoomIdentityChrome() {
    var r = _state.room;
    if (!r) return;
    var roomEl = $('#hl-room');
    if (roomEl) {
      roomEl.classList.toggle('private', r.hostMode === 'private');
    }
    var c = r.charObj;
    var hostName = $('#hl-host-name');
    var hostStatus = $('#hl-host-status');
    var audience = $('#hl-audience');
    var followBtn = $('#hl-follow');
    var modebar = $('#hl-modebar');
    var inputEl = $('#hl-message-input');

    if (hostName) hostName.textContent = r.hostMode === 'user' ? (_state.user.name + '（我）') : c.name;
    if (hostStatus) {
      hostStatus.textContent = r.hostMode === 'private' ? '私人双人连线' : r.hostMode === 'user' ? '用户主播中' : '正在直播';
    }
    if (audience) {
      audience.textContent = r.hostMode === 'user'
        ? ('👁 ' + c.name + (_state.settings && _state.settings.sim ? ' + AI观众' : ' 在看'))
        : (_state.settings && _state.settings.sim ? '👁 模拟热度 1.2k' : '👁 仅你观看');
    }
    if (followBtn) {
      var followed = Boolean(_state.followedChars[String(c.id)]);
      followBtn.textContent = followed ? '✓ 已关注' : '+ 关注';
      followBtn.classList.toggle('followed', followed);
    }
    if (modebar) modebar.style.display = r.hostMode === 'private' ? 'none' : 'flex';
    if (inputEl) {
      inputEl.placeholder = r.hostMode === 'private'
        ? ('和 ' + c.name + ' 说点什么…')
        : r.hostMode === 'user'
          ? '对直播间说点什么…'
          : '发一条弹幕…';
    }
    var likeEl = $('#hl-like-count');
    if (likeEl) likeEl.textContent = r.likes ? String(r.likes) : '点赞';
  }

  function updateRoomProgramChrome() {
    var r = _state.room;
    if (!r) return;
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
        ? ('🎤 我的直播间 · ' + r.charObj.name + '在看')
        : r.hostMode === 'private'
          ? ('♡ 与 ' + r.charObj.name + ' 私人连线')
          : (r.charObj.name + ' 的直播间');
      roomTitleEl.textContent = prefix + ' · ' + r.title;
    }
    if (signEl) {
      signEl.textContent = prog.icon + ' ' + r.title;
    }
    if (noticeEl) {
      var simNote = (_state.settings && _state.settings.sim && r.hostMode !== 'private') ? '含 [AI观众] 气氛弹幕' : '无外部模拟观众';
      noticeEl.textContent = prog.label + ' · 真实 Char AI 互动（' + simNote + '）';
    }
    $$('#hl-modebar [data-mode]').forEach(function(btn) {
      btn.classList.toggle('selected', btn.dataset.mode === r.program);
    });
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
      text: prog.icon + ' ' + prog.label + '｜' + r.title + '（' + ({ natural: '自然主动', quiet: '安静陪伴', lively: '活跃互动' }[r.style] || '自然') + '）'
    });

    if (prog.id === 'asmr') {
      await startAsmrAudioIfAvailable(opts.asmrTrackId || '');
      var durMs = Number(opts.asmrDurationMs) || 0;
      if (durMs > 0) {
        _state.asmrDeadlineMs = Date.now() + durMs;
        _state.asmrTimerId = setInterval(checkAsmrTimer, 1000);
        checkAsmrTimer();
        var endStr = new Date(_state.asmrDeadlineMs).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        appendRoomMessage({
          senderRole: 'system',
          sender: 'ASMR 定时',
          text: '已设定本地时间 ' + endStr + (r.asmrEndAction === 'exit_room' ? ' 结束本场直播' : ' 平滑停止 ASMR 并切回闲聊')
        });
      }
    }

    if (isHotSwitch) {
      triggerCharAiTurn({
        triggerType: 'program_switch',
        userPrompt: '我们刚刚把直播节目切换到了「' + prog.label + '」（标题：「' + r.title + '」），请自然顺着这个新节目接一句。'
      });
    }
  }

  // ===== 单人双视觉模式 (全屏 vs 煲电话) & 连麦画面 =====
  function getActiveStageTargetKey() {
    if (!_state.room) return String(getActiveChar().id);
    return _state.room.hostMode === 'user' ? 'user' : String(_state.room.charObj.id);
  }

  async function refreshRoomVisuals() {
    var r = _state.room;
    if (!r) return;
    var targetKey = getActiveStageTargetKey();
    var opt = storage().normalizePortraitOption(_state.portraitOptions[targetKey]);
    var customSrc = await storage().loadPortraitSrc(targetKey);
    if (!_state.room || _state.room.sessionId !== r.sessionId) return;

    var fallbackAvatar = r.hostMode === 'user' ? (_state.user.avatar || '') : (r.charObj.avatar || '');
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
      stageAvatar.textContent = showPortrait ? '' : (r.hostMode === 'user' ? '🎀' : (r.charObj.emojiFallback || '🌸'));
    }
    if (faceEl) {
      faceEl.classList.toggle('portrait', Boolean(src));
      faceEl.style.backgroundImage = src ? 'url("' + safeCssUrl(src) + '")' : '';
      faceEl.textContent = src ? '' : (r.hostMode === 'user' ? '🎀' : (r.charObj.emojiFallback || '🌸'));
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
    if (!_state.connectionType || !_state.room) return;
    var r = _state.room;
    var c = r.charObj;
    var hostIsUser = r.hostMode === 'user';

    var hostKey = hostIsUser ? 'user' : String(c.id);
    var guestKey = hostIsUser ? String(c.id) : 'user';
    var hostLabel = hostIsUser ? (_state.user.name + ' · 主播') : (c.name + ' · 主播');
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
      mainArt.textContent = hostSrc ? '' : (hostIsUser ? '🎀' : (c.emojiFallback || '🌸'));
    }
    var guestArt = $('#hl-conn-art');
    if (guestArt) {
      guestArt.classList.toggle('has-img', Boolean(guestSrc));
      guestArt.style.backgroundImage = guestSrc ? 'url("' + safeCssUrl(guestSrc) + '")' : '';
      guestArt.textContent = guestSrc ? '' : (hostIsUser ? (c.emojiFallback || '🌸') : '🎀');
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
    var toggleBtn = $('#hl-layout-toggle');
    var swapBtn = $('#hl-swap-screens');
    if (toggleBtn) toggleBtn.textContent = split ? '📺 切换小窗' : '👥 切换并列';
    if (swapBtn) swapBtn.textContent = split ? '⇄ 交换位置' : '⇄ 小窗位置';

    if (_state.settings && _state.settings.connectionLayout !== _state.connectionLayout) {
      _state.settings.connectionLayout = _state.connectionLayout;
      storage().saveSettings(_state.settings).catch(function() {});
    }
  }

  function disconnectCall(silent) {
    stopMediaTracks();
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
    if (roomEl) roomEl.classList.remove('hl-connection-active', 'hl-connection-swapped');
    var connBtn = $('#hl-connect-btn');
    if (connBtn) connBtn.classList.remove('active');
    if (!silent) showToast('已挂断连麦');
  }

  async function startConnection(type) {
    if (!_state.room) return;
    // 若切换连麦类型，停止旧的麦克风/摄像头流（但切布局绝不调 startConnection）
    stopMediaTracks();
    _state.connectionType = type;
    _state.room.cohostUsed = true;
    closeModal();

    var overlay = $('#hl-connection-overlay');
    var textBox = $('#hl-text-call-composer');
    var voiceBox = $('#hl-voice-call-controls');
    var connBtn = $('#hl-connect-btn');

    if (overlay) overlay.hidden = false;
    if (textBox) textBox.hidden = type !== 'text';
    if (voiceBox) voiceBox.hidden = type !== 'voice';
    if (connBtn) connBtn.classList.add('active');

    var layoutSelect = $('#hl-connect-layout');
    var chosenLayout = (layoutSelect && layoutSelect.value) || (_state.settings && _state.settings.connectionLayout) || 'floating';
    applyConnectionLayout(chosenLayout);
    await updateConnectionVisuals();

    var c = _state.room.charObj;
    if (type === 'text') {
      appendRoomMessage({ senderRole: 'system', sender: '文字连麦', text: '已接入连麦席位，在下方专属输入框发言将作为连麦对话传送给 ' + c.name + ' ♡' });
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
        text: hasAsr
          ? '已开启语音连麦面板，可授权本机麦克风并通过语音转写直接与 ' + c.name + ' 对话。'
          : '当前浏览器/WebView 不支持网页实时语音识别，已保留麦克风授权状态与语音连麦文字补充输入。'
      });
    } else if (type === 'video') {
      appendRoomMessage({ senderRole: 'system', sender: '同框画面', text: '已开启虚拟形象同框画面（以双方设置图片展示，非远程摄像头传输）。' });
    } else if (type === 'camera') {
      await enableLocalCamera();
      return;
    }

    triggerCharAiTurn({
      triggerType: 'cohost_join',
      userPrompt: _state.user.name + ' 刚刚开启了「' + ({ text: '文字连麦', voice: '语音连麦', video: '同框连线' }[type] || '连麦') + '」走进连麦席位，请自然迎一句。'
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

  async function enableLocalCamera() {
    if (!global.navigator || !global.navigator.mediaDevices || typeof global.navigator.mediaDevices.getUserMedia !== 'function') {
      showToast('当前环境不支持摄像头预览，请使用 HTTPS 页面');
      return;
    }
    try {
      var stream = await global.navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (!_state.room) {
        stream.getTracks().forEach(function(t) { t.stop(); });
        return;
      }
      stopMediaTracks();
      _state.connectionType = 'camera';
      _state.cameraStream = stream;
      _state.room.cohostUsed = true;
      closeModal();

      var overlay = $('#hl-connection-overlay');
      var textBox = $('#hl-text-call-composer');
      var voiceBox = $('#hl-voice-call-controls');
      var connBtn = $('#hl-connect-btn');
      var camEl = $('#hl-user-camera');
      var guestArt = $('#hl-conn-art');

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
      appendRoomMessage({ senderRole: 'system', sender: '本地摄像头', text: '仅本机画面预览，未向外部上传或发送任何视频流；挂断或退出即关闭摄像头。' });
      showToast('已开启本地摄像头预览');
      triggerCharAiTurn({
        triggerType: 'camera_on',
        userPrompt: _state.user.name + ' 打开了本地摄像头连麦画面，请自然温柔地打招呼（不要编造具体隐私细节）。'
      });
    } catch (_) {
      showToast('未获得摄像头权限或设备不可用');
    }
  }

  // ===== 弹幕流、AI 回复与 Minimax TTS =====
  function appendRoomMessage(msg) {
    if (!_state.room) return;
    var item = {
      id: 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
      senderRole: msg.senderRole || 'user', // 'user' | 'user_cohost' | 'char' | 'ai_audience' | 'system'
      sender: String(msg.sender || '观众'),
      text: String(msg.text || ''),
      ts: Date.now()
    };
    _state.room.messages.push(item);
    if (_state.room.messages.length > 60) {
      _state.room.messages = _state.room.messages.slice(-60);
    }

    var box = $('#hl-messages');
    if (!box) return;
    var row = document.createElement('div');
    row.className = 'hl-line role-' + item.senderRole;

    var tagMap = {
      user: '我',
      user_cohost: '连麦',
      char: 'Char',
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
    while (box.children.length > 18) {
      box.removeChild(box.firstChild);
    }
    box.scrollTop = box.scrollHeight;
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

  async function triggerCharAiTurn(opts) {
    var r = _state.room;
    if (!r) return;
    opts = opts || {};
    var mySession = r.sessionId;
    var myCharId = String(r.charObj.id);
    var myReqSeq = ++_state.aiRequestSeq;

    var guard = {
      isStale: function() {
        return !_state.room ||
          _state.room.sessionId !== mySession ||
          String(_state.room.charObj.id) !== myCharId;
      },
      isLatest: function() {
        return !guard.isStale() && _state.aiRequestSeq === myReqSeq;
      }
    };

    var reply = await aiMod().generateCharLiveReply({
      charObj: r.charObj,
      userObj: _state.user,
      hostMode: r.hostMode,
      program: r.program,
      programTitle: r.title,
      programStyle: r.style,
      connectionType: _state.connectionType,
      cameraActive: Boolean(_state.cameraStream),
      settings: _state.settings,
      recentLines: r.messages,
      triggerType: opts.triggerType || 'chat',
      giftName: opts.giftName || '',
      userPrompt: opts.userPrompt || '',
      isStale: guard.isStale
    });

    if (!reply || reply.stale || guard.isStale()) return;

    if (reply.speech) {
      if (_state.settings && _state.settings.voice === 'audio' && !_state.settings.captions) {
        // 语音为主且关闭字幕时，仅当确实能播语音才隐藏文字；否则回退文字显示以免无声无字
        var ttsCheck = await aiMod().getMinimaxStatus(myCharId);
        if (guard.isStale()) return;
        if (!ttsCheck.apiReady || !ttsCheck.voiceId) {
          appendRoomMessage({ senderRole: 'char', sender: r.charObj.name, text: reply.speech });
        } else {
          appendRoomMessage({ senderRole: 'char', sender: r.charObj.name + '（语音）', text: '🔊 ' + reply.speech });
        }
      } else {
        appendRoomMessage({ senderRole: 'char', sender: r.charObj.name, text: reply.speech });
      }
      if (guard.isLatest()) {
        maybePlayCharTts(reply.speech, myCharId, guard);
      }
    }

    // 节制型 AI 观众气氛弹幕（绝不冒充真人，间隔 >= 12s）
    if (reply.audience && _state.settings && _state.settings.sim && r.hostMode !== 'private') {
      var now = Date.now();
      if (now - (r.lastAiAudienceAt || 0) >= 12000) {
        r.lastAiAudienceAt = now;
        appendRoomMessage({
          senderRole: 'ai_audience',
          sender: aiMod().pickAudienceName(),
          text: reply.audience
        });
      }
    }
  }

  function sendRoomMessage() {
    var r = _state.room;
    var inputEl = $('#hl-message-input');
    if (!r || !inputEl) return;
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';

    var senderName = r.hostMode === 'user' ? (_state.user.name + '（主播）') : _state.user.name;
    appendRoomMessage({ senderRole: 'user', sender: senderName, text: text });
    triggerCharAiTurn({ triggerType: 'chat', userPrompt: '' });
  }

  function sendCohostMessage(text, sourceKind) {
    var r = _state.room;
    var clean = String(text || '').trim();
    if (!r || !clean) return;
    var senderName = _state.user.name + (sourceKind === 'voice' ? '（语音连麦）' : '（文字连麦）');
    appendRoomMessage({ senderRole: 'user_cohost', sender: senderName, text: clean });
    triggerCharAiTurn({ triggerType: 'cohost', userPrompt: '' });
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
    if (gift.free) {
      btn.textContent = '送出免费小心意 ' + gift.icon;
      tip.textContent = gift.desc;
    } else if (_state.giftConfirmPending === gift.id) {
      btn.textContent = '确认支付 ' + gift.price + ' 金币送出';
      tip.textContent = '⚠️ 再次点击将通过官方共享经济扣除 ' + gift.price + ' 金币';
    } else {
      btn.textContent = '送出「' + gift.name + '」（' + gift.price + ' 金币）';
      tip.textContent = '付费礼物需二次确认，扣除真实共享金币。';
    }
  }

  async function submitGiftClick() {
    if (!_state.room || _state.giftSubmitting) return;
    var gift = aiMod().GIFT_CATALOG.find(function(g) { return g.id === _state.selectedGiftId; }) || aiMod().GIFT_CATALOG[0];
    if (!gift.free && _state.giftConfirmPending !== gift.id) {
      _state.giftConfirmPending = gift.id;
      updateGiftConfirmBar();
      return;
    }

    _state.giftSubmitting = true;
    var sendBtn = $('#hl-gift-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    try {
      var res = await aiMod().sendGiftTransaction({ gift: gift, charObj: _state.room.charObj });
      if (!res.ok) {
        showToast(res.msg || '送礼失败');
        return;
      }
      _state.giftConfirmPending = null;
      if (!res.free) {
        _state.room.giftsTotalCoins += Number(res.coinsSpent || 0);
      }
      closeModal();
      var label = gift.icon + ' ' + _state.user.name + ' 送出了「' + gift.name + '」' + (res.free ? '（免费互动）' : '（-' + res.coinsSpent + ' 金币）');
      spawnGiftBurst(gift.icon + ' 感谢送出 ' + gift.name + '！');
      appendRoomMessage({ senderRole: 'system', sender: '礼物提醒', text: label });
      showToast(res.free ? '已送出免费小心意 ✨' : ('送礼成功！剩余金币：' + res.remaining));

      triggerCharAiTurn({
        triggerType: 'gift',
        giftName: gift.name,
        userPrompt: _state.user.name + ' 刚刚在直播间给你送出了「' + gift.name + '」，请开心又自然地道谢。'
      });
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
    var gs = _state.room.gameSession;
    gs.round++;
    var msgText = customText && customText.trim() ? customText.trim() : gs.prompt;
    closeModal();
    appendRoomMessage({ senderRole: 'user', sender: _state.user.name + ' · 互动点单', text: msgText });
    triggerCharAiTurn({
      triggerType: 'interact_game',
      userPrompt: _state.user.name + ' 在直播间「互动游戏」环节向你发起了第 ' + gs.round + ' 轮挑战：' + msgText + '。请直接配合参与游戏并有趣地回应！'
    });
  }

  // ===== 退出直播、直播手账与长期记忆手动确认 =====
  async function finishAndLeaveRoom(autoFinished) {
    var r = _state.room;
    cleanupAllMedia();
    _state.room = null;
    _state.connectionType = '';

    if (r && r.messages.length > 0 && storage()) {
      var draft = aiMod().buildJournalDraft({
        hostMode: r.hostMode,
        charId: r.charObj.id,
        charName: r.charObj.name,
        program: r.program,
        title: r.title,
        startedAt: r.startedAt,
        endedAt: Date.now(),
        msgCount: r.messages.length,
        giftsTotalCoins: r.giftsTotalCoins,
        cohostUsed: r.cohostUsed,
        asmrUsed: r.asmrUsed
      });
      var saved = await storage().addJournalEntry({
        ownerUid: _state.user.id,
        charId: r.charObj.id,
        charName: r.charObj.name,
        hostMode: r.hostMode,
        program: r.program,
        programLabel: (aiMod().PROGRAMS[r.program] || aiMod().PROGRAMS.chat).label,
        title: r.title,
        summary: draft.content,
        giftsTotalCoins: r.giftsTotalCoins,
        msgCount: r.messages.length,
        cohostUsed: r.cohostUsed,
        asmrUsed: r.asmrUsed,
        startedAt: r.startedAt,
        endedAt: Date.now()
      });
      _state.journals = await storage().loadJournals();
      switchView('home');
      if (saved && _state.settings && _state.settings.savePrompt) {
        openSessionSummaryModal(saved, autoFinished);
      }
      return;
    }
    switchView('home');
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
    if (box) {
      box.innerHTML =
        '<div class="hl-plan-preview">' +
          '<b>' + esc(journal.title) + '</b><br>' +
          esc(journal.summary) +
        '</div>' +
        '<p class="hl-help">' + (autoFinished ? 'ASMR 定时已圆满结束。' : '本场直播已记录到「直播手账」。') + '是否顺便将它写入「长期记忆」？（需您审阅确认，绝不自动写入）</p>';
    }
    _state.memoryDraft = journal;
    openModal('summary');
  }

  function openMemoryConfirmModal(journal) {
    if (!journal) return;
    _state.memoryDraft = journal;
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

    var btn = $('#hl-mem-confirm-btn');
    if (btn) btn.disabled = true;
    try {
      var res = await aiMod().saveJournalToLongMemory({
        journal: journal,
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
          '<p>这里只记录你与 Char 真实完成过的直播时刻（包含节目、连麦与赠送心意），绝不伪造虚构记录。去大厅开一场直播吧 ♡</p>' +
        '</div>';
      return;
    }

    listEl.innerHTML = _state.journals.map(function(j) {
      var dateStr = new Date(j.startedAt || Date.now()).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      var memAlive = j.memoryId && existingMemIds.has(Number(j.memoryId));
      return '<div class="hl-diarycard">' +
        '<div class="hl-diarycard-head"><b>' + esc(j.title) + '</b><span class="hl-tag" style="background:#f6e6ef;color:#935c7c">' + esc(j.programLabel) + '</span></div>' +
        '<div class="hl-diarycard-meta">' + esc(dateStr) + ' · ' + esc(j.charName) + ' · ' + (j.msgCount || 0) + ' 条互动' + (j.giftsTotalCoins ? ' · 礼物 ' + j.giftsTotalCoins + ' 金币' : '') + '</div>' +
        '<p>' + esc(j.summary) + '</p>' +
        '<div class="hl-diarycard-actions">' +
          (memAlive
            ? '<span class="hl-plainbtn" style="padding:6px 11px;font-size:11px;color:#3d8462;border-color:#bfe2cf">✓ 已写入长期记忆</span>'
            : '<button type="button" class="hl-pinkbtn" style="padding:7px 12px;font-size:11px" data-jnl-remember="' + esc(j.id) + '">记住这场直播</button>') +
          '<button type="button" class="hl-dangerbtn" data-jnl-del="' + esc(j.id) + '">删除手账</button>' +
        '</div>' +
      '</div>';
    }).join('');

    $$('[data-jnl-remember]').forEach(function(btn) {
      btn.onclick = function() {
        var found = _state.journals.find(function(x) { return x.id === btn.dataset.jnlRemember; });
        if (found) openMemoryConfirmModal(found);
      };
    });
    $$('[data-jnl-del]').forEach(function(btn) {
      btn.onclick = async function() {
        await storage().deleteJournalEntry(btn.dataset.jnlDel);
        showToast('已删除该条手账');
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
      prevText.textContent = customSrc
        ? (c.name + ' · 自定义直播形象')
        : c.avatar
          ? (c.name + ' · 当前使用微信角色头像')
          : (c.name + ' · 尚未上传立绘');
    }
    if (urlInput) urlInput.value = customSrc && customSrc.indexOf('https:') === 0 ? customSrc : '';

    var voiceEl = $('#hl-char-voice-id');
    var voiceStatusEl = $('#hl-char-voice-status');
    if (voiceEl) voiceEl.value = _state.charVoices[String(cid)] || '';
    if (voiceStatusEl) {
      var st = await aiMod().getMinimaxStatus(cid);
      voiceStatusEl.textContent = st.apiReady && st.voiceId
        ? ('✓ 语音就绪（来源：' + (st.voiceSource === 'live' ? '直播专用音色' : '微信聊天音色') + '）')
        : ('⚠ ' + (st.missingReason || '未就绪，将使用字幕回应'));
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

  async function refreshAsmrLibraryUi() {
    _state.asmrTracks = await storage().listAsmrTracks();
    var listEl = $('#hl-asmr-library-list');
    var selEl = $('#hl-asmr-default-track');
    var totalBytes = _state.asmrTracks.reduce(function(s, t) { return s + (Number(t.size) || 0); }, 0);
    var countEl = $('#hl-asmr-quota');
    if (countEl) {
      countEl.textContent = '已导入 ' + _state.asmrTracks.length + ' 首音轨 · 占用 ' + formatBytes(totalBytes) + ' / 120 MB';
    }
    if (selEl) {
      selEl.innerHTML = '<option value="">跟随播放模式自动选择</option>' +
        _state.asmrTracks.map(function(t) {
          return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>';
        }).join('');
      selEl.value = (_state.settings && _state.settings.asmrSelectedTrackId) || '';
    }
    if (!listEl) return;
    if (!_state.asmrTracks.length) {
      listEl.innerHTML = '<div class="hl-help">尚未导入任何本地音频文件，点击上方按钮添加 MP3 / WAV / M4A / OGG / FLAC。</div>';
      return;
    }
    listEl.innerHTML = _state.asmrTracks.map(function(t) {
      var playing = _state.previewAudioId === t.id;
      return '<div class="hl-asmr-item">' +
        '<div class="hl-asmr-item-info"><b>' + esc(t.name) + '</b><small>' + formatDuration(t.durationSec) + ' · ' + formatBytes(t.size) + '</small></div>' +
        '<div class="hl-asmr-item-actions">' +
          '<button type="button" data-asmr-preview="' + esc(t.id) + '">' + (playing ? '⏹ 停止' : '▶ 试听') + '</button>' +
          '<button type="button" data-asmr-rename="' + esc(t.id) + '">改名</button>' +
          '<button type="button" data-asmr-del="' + esc(t.id) + '">删除</button>' +
        '</div>' +
      '</div>';
    }).join('');

    $$('[data-asmr-preview]').forEach(function(btn) {
      btn.onclick = async function() {
        var tid = btn.dataset.asmrPreview;
        if (_state.previewAudioId === tid) {
          stopPreviewAudio();
          refreshAsmrLibraryUi();
          return;
        }
        stopPreviewAudio();
        var url = await storage().getAsmrTrackPlayUrl(tid);
        if (!url) {
          showToast('音频读取失败');
          return;
        }
        _state.previewAudioId = tid;
        _previewAudioEl = new Audio(url);
        _previewAudioEl.volume = Math.max(0, Math.min(1, Number((_state.settings && _state.settings.ambient) || 65) / 100));
        _previewAudioEl.onended = function() {
          stopPreviewAudio();
          refreshAsmrLibraryUi();
        };
        _previewAudioEl.play().catch(function() {
          stopPreviewAudio();
          showToast('无法播放该音频');
        });
        refreshAsmrLibraryUi();
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
      };
    });
  }

  async function refreshSettingsView() {
    var s = _state.settings;
    if (!s) return;

    var charSelect = $('#hl-char-img-select');
    if (charSelect) {
      var chars = _state.chars.length ? _state.chars : [getActiveChar()];
      charSelect.innerHTML = chars.map(function(c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
      }).join('');
      if (!chars.some(function(c) { return String(c.id) === String(_state.selectedCharManageId); })) {
        _state.selectedCharManageId = String(chars[0].id);
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
            '<div class="hl-featured"><b>一键进入直播间<br>和喜欢的 Char 见面</b><p>已接入真实 Char 档案、世界书、Minimax 语音与共享金币。</p><button type="button" class="hl-pinkbtn" id="hl-private-start">♡ 开始私人连线</button></div>' +
            '<div class="hl-subhead"><b>✨ 选择 Char</b><span>当前同伴切换</span></div>' +
            '<div class="hl-char-picker-row" id="hl-char-picker"></div>' +
            '<div class="hl-subhead"><b>🔴 正在直播</b><span>点击卡片策划开播</span></div>' +
            '<div class="hl-broadcasts" id="hl-broadcasts"></div>' +
            '<div class="hl-subhead"><b>✨ 我要开播</b><span>Char 来前排看你</span></div>' +
            '<div class="hl-create"><div class="hl-ico">🎤</div><div><b>我的心动直播间</b><p>你是主播，可随时与 Char 连麦或播 ASMR</p></div><button type="button" class="hl-pinkbtn" id="hl-go-live">开播</button></div>' +
            '<div class="hl-subhead"><b>💗 双人连线</b><span>仅你和 Char</span></div>' +
            '<div class="hl-create"><div class="hl-ico">💞</div><div><b>私人双人直播</b><p>闲聊 · ASMR · 睡前电台 · 云陪伴</p></div><button type="button" class="hl-pinkbtn" id="hl-private-start2">连线</button></div>' +
          '</div>' +
        '</section>' +

        // 2. 沉浸直播间
        '<section class="hl-view hl-view-room" id="hl-view-live" data-view="live">' +
          '<div class="hl-room cloud" id="hl-room">' +
            '<div class="hl-roomtop">' +
              '<div class="hl-host"><span class="hl-face" id="hl-host-face">🌸</span><span class="hl-hostinfo"><b id="hl-host-name">Char</b><small id="hl-host-status">正在直播</small></span></div>' +
              '<button type="button" class="hl-follow" id="hl-follow">+ 关注</button>' +
              '<button type="button" class="hl-top-pill" id="hl-connect-btn" title="连麦或视频">🎙 连麦</button>' +
              '<button type="button" class="hl-top-pill" id="hl-callModeToggle" title="切换全屏或煲电话模式">📞 通话</button>' +
              '<button type="button" class="hl-top-pill" id="hl-quick-program-switch" title="切换节目">☷ 切换</button>' +
              '<span class="hl-audience" id="hl-audience">👁 模拟 1.2k</span>' +
              '<button type="button" class="hl-close-room" id="hl-exit-room" aria-label="退出直播间">×</button>' +
            '</div>' +
            '<div class="hl-room-title" id="hl-room-title">直播间</div>' +
            '<div class="hl-program-status" id="hl-program-status">💬 当前：闲聊直播</div>' +
            '<div class="hl-modebar" id="hl-modebar">' +
              '<button type="button" data-mode="chat" class="selected">💬 聊天</button>' +
              '<button type="button" data-mode="game">🎮 游戏</button>' +
              '<button type="button" data-mode="radio">📻 电台</button>' +
              '<button type="button" data-mode="asmr">🎧 ASMR</button>' +
            '</div>' +
            '<div class="hl-char-fullscreen-art" id="hl-charFullscreenArt" aria-hidden="true"></div>' +
            '<div class="hl-host-stage"><div class="hl-stage-halo"></div><div class="hl-bigavatar" id="hl-stageAvatar">🌸</div><div class="hl-stage-sign" id="hl-stage-caption">欢迎来到直播间 ♡</div></div>' +

            // 连麦双布局浮层 (小窗 & 双人并列PK)
            '<div class="hl-connection-overlay" id="hl-connection-overlay" hidden>' +
              '<div class="hl-connection-pair">' +
                '<div class="hl-connection-tile hl-main-connection-tile"><div class="hl-connection-art" id="hl-main-conn-art">🌸</div><div class="hl-connection-label" id="hl-main-conn-label">主播</div></div>' +
                '<div class="hl-connection-tile" id="hl-conn-tile"><div class="hl-connection-art" id="hl-conn-art">🎀</div><div class="hl-connection-label" id="hl-conn-label">连麦中</div><video class="hl-user-camera" id="hl-user-camera" autoplay playsinline muted hidden></video></div>' +
              '</div>' +
              '<div class="hl-connection-controls">' +
                '<button type="button" id="hl-layout-toggle">👥 切换并列</button>' +
                '<button type="button" id="hl-swap-screens">⇄ 交换位置</button>' +
                '<button type="button" id="hl-disconnect">✕ 挂断</button>' +
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
            '</div>' +

            '<div class="hl-sideactions">' +
              '<button type="button" id="hl-like" aria-label="点赞">♡</button><small id="hl-like-count">点赞</small>' +
              '<button type="button" id="hl-gift" aria-label="送礼">🎁</button><small>礼物</small>' +
              '<button type="button" id="hl-interact" aria-label="互动">🎮</button><small>互动</small>' +
            '</div>' +

            '<div class="hl-roomfooter">' +
              '<div class="hl-messages" id="hl-messages" aria-live="polite"></div>' +
              '<div class="hl-notice" id="hl-notice">真实 Char AI 互动</div>' +
              '<div class="hl-composer">' +
                '<input id="hl-message-input" maxlength="160" placeholder="发一条弹幕…" aria-label="弹幕输入">' +
                '<button type="button" class="hl-roundbtn" id="hl-send" aria-label="发送弹幕">➤</button>' +
                '<button type="button" class="hl-roundbtn" id="hl-quick-heart" aria-label="点赞">♡</button>' +
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
              '<p class="hl-help" id="hl-asmr-quota">正在加载本地音频库…</p>' +
              '<div class="hl-asmr-list" id="hl-asmr-library-list"></div>' +
              '<div class="hl-settingrow"><div><b>播放顺序</b></div><select id="hl-asmr-play-mode"><option value="loop">列表循环</option><option value="single">单曲循环</option><option value="random">随机播放</option></select></div>' +
              '<div class="hl-settingrow"><div><b>默认音轨</b></div><select id="hl-asmr-default-track"></select></div>' +
              '<div class="hl-settingrow"><div><b>环境音音量</b><small id="hl-ambient-label">65%</small></div><input type="range" id="hl-ambient" min="0" max="100"></div>' +
              '<div class="hl-settingrow"><div><b>语音时自动闪避降低环境音</b><small>防止人声与背景音打架</small></div><input type="checkbox" id="hl-duck"></div>' +
              '<div class="hl-settingrow"><div><b>默认 ASMR 定时</b></div><select id="hl-timer"><option value="off">手动停止</option><option value="15">15 分钟</option><option value="30">30 分钟</option><option value="60">60 分钟</option></select></div>' +
              '<div class="hl-settingrow"><div><b>定时到点动作</b></div><select id="hl-settings-end-action"><option value="stop_program">停止 ASMR 返回闲聊</option><option value="exit_room">自动结束本场直播</option></select></div>' +
              '<div class="hl-settingrow"><div><b>整机备份包含 ASMR 音频文件</b><small>音频体积较大，默认仅备份清单以防移动端内存溢出</small></div><input type="checkbox" id="hl-backup-audio"></div>' +
            '</div>' +

            '<h2>💕 互动与隐私</h2>' +
            '<div class="hl-settingbox">' +
              '<div class="hl-settingrow"><div><b>Char 主动节奏</b></div><select id="hl-initiative"><option value="natural">自然主动</option><option value="quiet">安静陪伴</option><option value="lively">活跃互动</option></select></div>' +
              '<div class="hl-settingrow"><div><b>游戏回应节奏</b></div><select id="hl-thinking"><option value="short">自然节奏</option><option value="immersive">沉浸思索</option><option value="fast">快速响应</option></select></div>' +
              '<div class="hl-settingrow"><div><b>联动真实经历上下文</b><small>只读参考长期记忆与万象镜经历，不篡改世界书</small></div><input type="checkbox" id="hl-context"></div>' +
              '<div class="hl-settingrow"><div><b>[AI观众] 气氛弹幕</b><small>明确标明 AI 观众，绝不冒充真人</small></div><input type="checkbox" id="hl-sim"></div>' +
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
            '<label class="hl-plan-label" for="hl-plan-style">Char 互动节奏</label>' +
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

        // 抽屉 5：User 开播邀请 Char
        '<div class="hl-planner" id="hl-userhost-planner" data-modal="userHost" role="dialog" aria-modal="true">' +
          '<div class="hl-planner-sheet">' +
            '<div class="hl-plan-head"><b>🎤 选择要邀请来看你开播的 Char</b><button type="button" data-close-modal>×</button></div>' +
            '<div class="hl-char-picker-row" id="hl-userhost-list" style="margin:14px 0;flex-wrap:wrap"></div>' +
          '</div>' +
        '</div>' +

        // 抽屉 6：关播总结
        '<div class="hl-planner" id="hl-summary-planner" data-modal="summary" role="dialog" aria-modal="true">' +
          '<div class="hl-planner-sheet">' +
            '<div class="hl-plan-head"><b>📖 本场直播已收入手账</b><button type="button" data-close-modal>×</button></div>' +
            '<div id="hl-summary-body"></div>' +
            '<div class="hl-plan-buttons">' +
              '<button type="button" class="hl-plainbtn" data-close-modal>先留在手账里</button>' +
              '<button type="button" class="hl-pinkbtn" id="hl-summary-remember">记住这场直播</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // 抽屉 7：手动审阅写入长期记忆
        '<div class="hl-planner" id="hl-memory-planner" data-modal="memory" role="dialog" aria-modal="true">' +
          '<div class="hl-planner-sheet">' +
            '<div class="hl-plan-head"><b>✨ 确认写入长期记忆</b><button type="button" data-close-modal>×</button></div>' +
            '<label class="hl-plan-label" for="hl-mem-title">记忆标题（最多 30 字）</label>' +
            '<input class="hl-plan-input" id="hl-mem-title" maxlength="30">' +
            '<label class="hl-plan-label" for="hl-mem-content">记忆摘要（最多 150 字）</label>' +
            '<textarea class="hl-plan-textarea" id="hl-mem-content" maxlength="150"></textarea>' +
            '<label class="hl-plan-label" for="hl-mem-keywords">关键词（逗号分隔）</label>' +
            '<input class="hl-plan-input" id="hl-mem-keywords" maxlength="60">' +
            '<p class="hl-help">确认后才会存入 Char 的长期记忆库；您随时可在「记忆」App 中查看或删除。</p>' +
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

    $$('.hl-nav').forEach(function(btn) {
      btn.onclick = function() { switchView(btn.dataset.view); };
    });

    // 大厅快捷开播
    var priv1 = $('#hl-private-start');
    var priv2 = $('#hl-private-start2');
    var goLive = $('#hl-go-live');
    if (priv1) priv1.onclick = function() { openPlannerModal('private', false); };
    if (priv2) priv2.onclick = function() { openPlannerModal('private', false); };
    if (goLive) goLive.onclick = function() { openUserHostPicker(); };

    // 抽屉通用关闭
    $$('[data-close-modal]').forEach(function(btn) {
      btn.onclick = closeModal;
    });
    $$('.hl-planner').forEach(function(backdrop) {
      backdrop.addEventListener('click', function(ev) {
        if (ev.target === backdrop) closeModal();
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
        var lastAdded = null;
        var lastErr = '';
        for (var i = 0; i < files.length; i++) {
          try {
            lastAdded = await storage().addAsmrTrack(files[i]);
          } catch (err) {
            lastErr = err.message || '导入失败';
          }
        }
        await refreshAsmrLibraryUi();
        if (lastAdded && _state.settings) {
          _state.settings = await storage().saveSettings(Object.assign({}, _state.settings, { asmrSelectedTrackId: lastAdded.id }));
        }
        updatePlannerPreview();
        if (lastAdded) showToast('已导入并选中：' + lastAdded.name + ' ♡');
        else if (lastErr) showToast(lastErr);
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
          await startLiveRoom({
            hostMode: _state.plannerPendingMode,
            charObj: getActiveChar(),
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
        if (_state.room) openPlannerModal(_state.room.hostMode, true);
      };
    }

    $$('#hl-modebar [data-mode]').forEach(function(btn) {
      btn.onclick = function() {
        if (!_state.room) return;
        var m = btn.dataset.mode;
        if (m === 'asmr') {
          _state.plannerProgram = 'asmr';
          openPlannerModal(_state.room.hostMode, true);
          return;
        }
        applyProgramToRoom(m, '', _state.room.style, {}, true);
      };
    });

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

    var followBtn = $('#hl-follow');
    if (followBtn) {
      followBtn.onclick = async function() {
        if (!_state.room) return;
        var followed = await storage().toggleFollowChar(_state.room.charObj.id);
        _state.followedChars[String(_state.room.charObj.id)] = followed;
        renderRoomIdentityChrome();
        showToast(followed ? '已关注 ' + _state.room.charObj.name : '已取消关注');
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
    var like2 = $('#hl-quick-heart');
    if (like1) like1.onclick = handleHeartClick;
    if (like2) like2.onclick = handleHeartClick;
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
    if (connectBtn) connectBtn.onclick = function() { openModal('connect'); };
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

    // ASMR 本地音频导入
    var asmrFile = $('#hl-asmr-file');
    if (asmrFile) {
      asmrFile.onchange = async function(ev) {
        var files = ev.target.files ? Array.from(ev.target.files) : [];
        ev.target.value = '';
        if (!files.length) return;
        var okCount = 0;
        var lastErr = '';
        for (var i = 0; i < files.length; i++) {
          try {
            await storage().addAsmrTrack(files[i]);
            okCount++;
          } catch (err) {
            lastErr = err.message || '导入失败';
          }
        }
        await refreshAsmrLibraryUi();
        if (okCount > 0) showToast('已导入 ' + okCount + ' 首本地 ASMR 音频 ♡');
        else if (lastErr) showToast(lastErr);
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
      }
    };
    _state.pageHideHandler = function() {
      cleanupAllMedia();
    };
    _state.viewportHandler = function() {
      // Android 软键盘聚焦时确保直播间底部或弹窗输入框可见
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
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', _state.viewportHandler);
    }

    try {
      if (global.history && typeof global.history.pushState === 'function') {
        global.history.pushState({ heartbeatLive: true }, '');
        _state.pushedHistory = true;
        _state.popHandler = function() {
          if (!_state.pageEl) return;
          if (_state.openModal) {
            closeModal();
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
    if (_state.viewportHandler && global.visualViewport) {
      global.visualViewport.removeEventListener('resize', _state.viewportHandler);
      _state.viewportHandler = null;
    }
    if (_state.popHandler) {
      global.removeEventListener('popstate', _state.popHandler);
      _state.popHandler = null;
    }
  }

  async function open(opts) {
    opts = opts || {};
    var existing = global.document && global.document.getElementById(PAGE_ID);
    if (existing) existing.remove();
    cleanupAllMedia();

    _state.chars = await aiMod().loadAvailableChars();
    _state.user = await aiMod().loadCurrentUserProfile();
    _state.settings = await storage().loadSettings();
    _state.portraitOptions = await storage().loadPortraitOptions();
    _state.followedChars = await storage().loadFollowedChars();
    _state.charVoices = await storage().loadCharVoices();
    _state.asmrTracks = await storage().listAsmrTracks();
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
    disconnectCall: disconnectCall,
    applyConnectionLayout: applyConnectionLayout,
    checkAsmrTimer: checkAsmrTimer,
    getState: function() { return _state; }
  };

  global.showHeartbeatLivePage = function(opts) {
    return open(opts);
  };
  global.showHeartbeatLiveApp = global.showHeartbeatLivePage;
})(typeof window !== 'undefined' ? window : globalThis);
