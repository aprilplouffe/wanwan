// ai-workspace-settings.js — 知屿（AI 工作空间）第三阶段：个人设置中心、个性化、预设与提示词中心、外观与常规设置
(function(global) {
  'use strict';

  var ICON_CHOICES = [
    { icon: 'fa-solid fa-wand-magic-sparkles', label: '星芒' },
    { icon: 'fa-solid fa-feather-pointed', label: '羽笔' },
    { icon: 'fa-solid fa-compass', label: '罗盘' },
    { icon: 'fa-solid fa-code', label: '代码' },
    { icon: 'fa-solid fa-book-open', label: '阅读' },
    { icon: 'fa-solid fa-heart', label: '陪伴' },
    { icon: 'fa-solid fa-moon', label: '夜谈' },
    { icon: 'fa-solid fa-robot', label: '助手' }
  ];

  var AVATAR_IMAGE_CHOICES = [
    'img/ava-00.jpg',
    'img/ava-01.jpg',
    'img/ava-02.jpg',
    'img/ava-03.jpg',
    'img/ava-04.jpg'
  ];

  var TONE_OPTIONS = ['温和自然', '专业严谨', '活泼灵动', '简练冷静', '幽默风趣', '细腻陪伴'];
  var STYLE_OPTIONS = ['温和自然', '专业严谨', '细腻陪伴', '活泼灵动', '简练冷静', '创意脑暴'];
  var DETAIL_OPTIONS = ['精简', '适中', '详尽'];

  var APPEARANCE_LABELS = {
    system: '跟随系统',
    light: '浅色模式',
    dark: '深色模式'
  };

  var _ctx = {
    page: null,
    onStateChanged: null,
    viewStack: [],
    editingPresetId: null,
    editorDraft: null,
    profile: null,
    personalization: null,
    appearance: null,
    general: null,
    presets: [],
    customApi: null,
    effectiveApi: null,
    memorySettings: {
      shortTermContext: true,
      crossChatMemory: true,
      useMemory: true,
      autoMemory: true,
      referenceHistoryChats: true,
      strategy: 'natural',
      summaryTriggerChars: 3200,
      recentRawMessagesLimit: 6,
      maxMemoryRecallCount: 5,
      maxSingleMemoryLength: 260
    },
    memories: [],
    memoryTasks: [],
    chats: [],
    activeChatId: '',
    recentSelectedChatId: '',
    summarySelectedChatId: '',
    advancedMemoryOpen: false,
    memorySearchQuery: ''
  };

  function S() {
    return global.AiWorkspaceStorage;
  }

  function AI() {
    return global.AiWorkspaceAI;
  }

  function M() {
    return global.AiWorkspaceMemory;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function notifyToast(msg) {
    if (typeof global.toast === 'function') {
      global.toast(msg);
    } else if (typeof global.showToast === 'function') {
      global.showToast(msg);
    }
  }

  async function copyTextSafely(text) {
    var content = String(text == null ? '' : text);
    if (!content) {
      notifyToast('当前没有可复制的内容');
      return false;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
        notifyToast('已复制到剪贴板');
        return true;
      }
    } catch (_) {}

    try {
      var ta = document.createElement('textarea');
      ta.value = content;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      if (ok) {
        notifyToast('已复制到剪贴板');
        return true;
      }
    } catch (_) {}

    notifyToast('复制失败，请手动长按选择文本复制');
    return false;
  }

  function downloadTextFile(filename, text, mimeType) {
    try {
      var blob = new Blob([String(text == null ? '' : text)], { type: mimeType || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        a.remove();
        URL.revokeObjectURL(url);
      }, 400);
      notifyToast('已开始导出文件：' + filename);
      return true;
    } catch (_) {
      notifyToast('当前环境不支持直接下载，请使用复制导出');
      return false;
    }
  }

  function formatPresetAvatarHtml(preset, sizeClass) {
    var cls = 'aiw-preset-avatar' + (sizeClass ? ' ' + sizeClass : '');
    if (preset && preset.avatarType === 'image' && preset.avatarValue) {
      return '<span class="' + cls + ' is-image"><img src="' + escapeHtml(preset.avatarValue) + '" alt="预设头像"></span>';
    }
    var iconCls = (preset && preset.avatarValue) || 'fa-solid fa-wand-magic-sparkles';
    return '<span class="' + cls + '"><i class="' + escapeHtml(iconCls) + '"></i></span>';
  }

  function getAccentInfo(accentId) {
    var list = (S() && S().ACCENT_PRESETS) || [];
    return list.find(function(a) { return a.id === accentId; }) || { id: 'pink', label: '粉色', color: '#ec4899' };
  }

  async function refreshAllData() {
    var store = S();
    if (!store) return;
    var results = await Promise.all([
      store.getProfile(),
      store.getPersonalization(),
      store.getAppearance(),
      store.getGeneralSettings(),
      store.listPresets(),
      store.getCustomApiConfig(),
      typeof store.getMemorySettings === 'function'
        ? store.getMemorySettings()
        : Promise.resolve({
            shortTermContext: true,
            crossChatMemory: true,
            useMemory: true,
            autoMemory: true,
            referenceHistoryChats: true,
            strategy: 'natural',
            summaryTriggerChars: 3200,
            recentRawMessagesLimit: 6,
            maxMemoryRecallCount: 5,
            maxSingleMemoryLength: 260
          }),
      typeof store.listMemories === 'function' ? store.listMemories() : Promise.resolve([]),
      typeof store.listMemoryTasks === 'function' ? store.listMemoryTasks() : Promise.resolve([]),
      typeof store.listChats === 'function' ? store.listChats() : Promise.resolve([])
    ]);
    _ctx.profile = results[0];
    _ctx.personalization = results[1];
    _ctx.appearance = results[2];
    _ctx.general = results[3];
    _ctx.presets = results[4];
    _ctx.customApi = results[5];
    _ctx.memorySettings = results[6] || _ctx.memorySettings;
    _ctx.memories = results[7] || [];
    _ctx.memoryTasks = results[8] || [];
    _ctx.chats = results[9] || [];
    if (AI() && typeof AI().resolveEffectiveApiConfig === 'function') {
      _ctx.effectiveApi = await AI().resolveEffectiveApiConfig();
    }
  }

  function notifyWorkspaceStateChanged() {
    if (typeof _ctx.onStateChanged === 'function') {
      _ctx.onStateChanged({
        profile: _ctx.profile,
        appearance: _ctx.appearance,
        personalization: _ctx.personalization,
        general: _ctx.general,
        presets: _ctx.presets,
        customApi: _ctx.customApi,
        effectiveApi: _ctx.effectiveApi,
        memorySettings: _ctx.memorySettings,
        memories: _ctx.memories
      });
    }
  }

  function getLayer() {
    if (!_ctx.page) return null;
    return _ctx.page.querySelector('#aiw-settings-layer');
  }

  function closeLayer() {
    var layer = getLayer();
    if (!layer) return;
    layer.classList.remove('open');
    setTimeout(function() {
      if (layer && !layer.classList.contains('open')) {
        layer.innerHTML = '';
        layer.hidden = true;
      }
    }, 260);
    _ctx.viewStack = [];
    notifyWorkspaceStateChanged();
  }

  function closeModalOverlay() {
    var layer = getLayer();
    if (!layer) return;
    var overlay = layer.querySelector('.aiw-st-modal-backdrop');
    if (overlay) overlay.remove();
  }

  function showCustomModal(title, bodyHtml, footerHtml) {
    var layer = getLayer();
    if (!layer) return null;
    closeModalOverlay();

    var wrap = document.createElement('div');
    wrap.className = 'aiw-st-modal-backdrop';
    wrap.innerHTML =
      '<div class="aiw-st-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-st-modal-head">' +
          '<div class="aiw-st-modal-title">' + escapeHtml(title) + '</div>' +
          '<button type="button" class="aiw-st-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-st-modal-body">' + bodyHtml + '</div>' +
        (footerHtml ? '<div class="aiw-st-modal-foot">' + footerHtml + '</div>' : '') +
      '</div>';

    layer.appendChild(wrap);
    requestAnimationFrame(function() { wrap.classList.add('open'); });

    wrap.addEventListener('click', function(e) {
      if (e.target === wrap) closeModalOverlay();
    });
    var closeBtn = wrap.querySelector('.aiw-st-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModalOverlay);
    return wrap;
  }

  function showConfirmModal(title, message, confirmLabel, danger, onConfirm) {
    var modal = showCustomModal(
      title,
      '<p class="aiw-st-modal-msg">' + escapeHtml(message) + '</p>',
      '<button type="button" class="aiw-st-btn-secondary" id="aiw-confirm-cancel">取消</button>' +
      '<button type="button" class="' + (danger ? 'aiw-st-btn-danger' : 'aiw-st-btn-primary') + '" id="aiw-confirm-ok">' + escapeHtml(confirmLabel || '确认') + '</button>'
    );
    if (!modal) return;
    modal.querySelector('#aiw-confirm-cancel').addEventListener('click', closeModalOverlay);
    modal.querySelector('#aiw-confirm-ok').addEventListener('click', async function() {
      closeModalOverlay();
      if (typeof onConfirm === 'function') await onConfirm();
    });
  }

  // ===== 视图 1：个人设置中心（参考 ChatGPT 手机端截图 4 样式，去除 Plus/会员/订阅） =====
  function renderSettingsHomeHtml() {
    var profile = _ctx.profile || { name: '我', avatar: 'img/ava-00.jpg', bio: '本地工作空间' };
    var appearance = _ctx.appearance || { mode: 'system', accent: 'pink' };
    var accentInfo = getAccentInfo(appearance.accent);
    var defaultPreset = (_ctx.presets || []).find(function(p) { return p.isDefault; }) || (_ctx.presets && _ctx.presets[0]);
    var presetSummary = defaultPreset ? defaultPreset.name : '未设置';
    var customApi = _ctx.customApi || {};
    var apiStatusVal = customApi.complete
      ? ('专属 · ' + (customApi.model || '已配置'))
      : '使用主 API';
    var memSettings = _ctx.memorySettings || { shortTermContext: true, crossChatMemory: true, useMemory: true, autoMemory: true };
    var memCount = (_ctx.memories || []).length;
    var anyMemoryActive = !!(memSettings.shortTermContext || memSettings.crossChatMemory || memSettings.useMemory || memSettings.autoMemory);
    var memorySummary = anyMemoryActive ? (memCount + ' 条') : '已关闭';

    return (
      '<div class="aiw-st-topbar">' +
        '<button type="button" class="aiw-circle-btn" id="aiw-st-back-home" title="返回知屿" aria-label="返回知屿">' +
          '<i class="fa-solid fa-arrow-left"></i>' +
        '</button>' +
        '<div class="aiw-st-topbar-title">设置</div>' +
        '<div class="aiw-st-topbar-spacer"></div>' +
      '</div>' +

      '<div class="aiw-st-scroll">' +
        '<div class="aiw-st-profile-hero">' +
          '<div class="aiw-st-avatar-wrap" id="aiw-st-edit-profile" role="button" tabindex="0" aria-label="编辑个人资料">' +
            '<img class="aiw-st-avatar-img" src="' + escapeHtml(profile.avatar) + '" alt="用户头像">' +
            '<span class="aiw-st-avatar-edit"><i class="fa-solid fa-pen"></i></span>' +
          '</div>' +
          '<div class="aiw-st-profile-name">' + escapeHtml(profile.name) + '</div>' +
          '<div class="aiw-st-profile-bio">' + escapeHtml(profile.bio || '本地工作空间') + '</div>' +
        '</div>' +

        '<div class="aiw-st-group-title">模型与接口</div>' +
        '<div class="aiw-st-card">' +
          '<button type="button" class="aiw-st-row" data-st-nav="custom-api">' +
            '<span class="aiw-st-row-icon"><i class="fa-solid fa-plug"></i></span>' +
            '<span class="aiw-st-row-label">知屿专属 API</span>' +
            '<span class="aiw-st-row-val">' + escapeHtml(apiStatusVal) + '</span>' +
            '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-right"></i></span>' +
          '</button>' +
        '</div>' +

        '<div class="aiw-st-group-title">我的知屿</div>' +
        '<div class="aiw-st-card">' +
          '<button type="button" class="aiw-st-row" data-st-nav="personalization">' +
            '<span class="aiw-st-row-icon"><i class="fa-regular fa-face-smile"></i></span>' +
            '<span class="aiw-st-row-label">个性化</span>' +
            '<span class="aiw-st-row-val">' + (_ctx.personalization && _ctx.personalization.enabled ? '已启用' : '已关闭') + '</span>' +
            '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-right"></i></span>' +
          '</button>' +
          '<button type="button" class="aiw-st-row" data-st-nav="presets">' +
            '<span class="aiw-st-row-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></span>' +
            '<span class="aiw-st-row-label">预设与提示词</span>' +
            '<span class="aiw-st-row-val">' + escapeHtml(presetSummary) + '</span>' +
            '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-right"></i></span>' +
          '</button>' +
          '<button type="button" class="aiw-st-row" data-st-nav="memory">' +
            '<span class="aiw-st-row-icon"><i class="fa-regular fa-bookmark"></i></span>' +
            '<span class="aiw-st-row-label">记忆</span>' +
            '<span class="aiw-st-row-val">' + escapeHtml(memorySummary) + '</span>' +
            '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-right"></i></span>' +
          '</button>' +
          '<button type="button" class="aiw-st-row" data-st-action="plugins-entry">' +
            '<span class="aiw-st-row-icon"><i class="fa-solid fa-puzzle-piece"></i></span>' +
            '<span class="aiw-st-row-label">插件</span>' +
            '<span class="aiw-st-row-tag">待接入</span>' +
            '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-right"></i></span>' +
          '</button>' +
        '</div>' +

        '<div class="aiw-st-group-title">外观</div>' +
        '<div class="aiw-st-card">' +
          '<button type="button" class="aiw-st-row" id="aiw-st-appearance-row">' +
            '<span class="aiw-st-row-icon"><i class="fa-regular fa-sun"></i></span>' +
            '<span class="aiw-st-row-label">外观</span>' +
            '<span class="aiw-st-row-val">' + escapeHtml(APPEARANCE_LABELS[appearance.mode] || '跟随系统') + '</span>' +
            '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-down"></i></span>' +
          '</button>' +
          '<button type="button" class="aiw-st-row" id="aiw-st-accent-row">' +
            '<span class="aiw-st-row-icon"><i class="fa-solid fa-palette"></i></span>' +
            '<span class="aiw-st-row-label">强调色</span>' +
            '<span class="aiw-st-row-val aiw-st-accent-val">' +
              '<span class="aiw-accent-dot" style="background:' + escapeHtml(accentInfo.color) + '"></span>' +
              '<span>' + escapeHtml(accentInfo.label) + '</span>' +
            '</span>' +
            '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-down"></i></span>' +
          '</button>' +
        '</div>' +

        '<div class="aiw-st-group-title">应用</div>' +
        '<div class="aiw-st-card">' +
          '<button type="button" class="aiw-st-row" data-st-nav="general">' +
            '<span class="aiw-st-row-icon"><i class="fa-solid fa-gear"></i></span>' +
            '<span class="aiw-st-row-label">常规设置</span>' +
            '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-right"></i></span>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function openEditProfileModal() {
    var profile = _ctx.profile || { name: '我', avatar: 'img/ava-00.jpg', bio: '本地工作空间' };
    var draftAvatar = profile.avatar || 'img/ava-00.jpg';

    var thumbsHtml = AVATAR_IMAGE_CHOICES.map(function(src) {
      var activeCls = src === draftAvatar ? ' active' : '';
      return '<button type="button" class="aiw-avatar-pick-thumb' + activeCls + '" data-pick-avatar="' + escapeHtml(src) + '"><img src="' + escapeHtml(src) + '" alt="可选头像"></button>';
    }).join('');

    var bodyHtml =
      '<div class="aiw-profile-edit-form">' +
        '<div class="aiw-profile-edit-preview">' +
          '<img id="aiw-prof-preview-img" src="' + escapeHtml(draftAvatar) + '" alt="头像预览">' +
          '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-prof-pick-custom"><i class="fa-regular fa-image"></i> 自定义头像</button>' +
        '</div>' +
        '<div class="aiw-avatar-pick-strip">' + thumbsHtml + '</div>' +
        '<label class="aiw-field-label">昵称</label>' +
        '<input type="text" class="aiw-field-input" id="aiw-prof-name" maxlength="24" value="' + escapeHtml(profile.name) + '" placeholder="输入你的称呼">' +
        '<label class="aiw-field-label">个人简介 / 状态</label>' +
        '<input type="text" class="aiw-field-input" id="aiw-prof-bio" maxlength="48" value="' + escapeHtml(profile.bio || '') + '" placeholder="例如：本地工作空间">' +
      '</div>';

    var footerHtml =
      '<button type="button" class="aiw-st-btn-secondary" id="aiw-prof-cancel">取消</button>' +
      '<button type="button" class="aiw-st-btn-primary" id="aiw-prof-save">保存资料</button>';

    var modal = showCustomModal('个人资料', bodyHtml, footerHtml);
    if (!modal) return;

    var previewImg = modal.querySelector('#aiw-prof-preview-img');
    modal.querySelectorAll('[data-pick-avatar]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        draftAvatar = btn.getAttribute('data-pick-avatar');
        previewImg.src = draftAvatar;
        modal.querySelectorAll('[data-pick-avatar]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
      });
    });

    modal.querySelector('#aiw-prof-pick-custom').addEventListener('click', function() {
      if (typeof global.showImagePicker === 'function') {
        global.showImagePicker(function(url) {
          if (url) {
            draftAvatar = url;
            previewImg.src = draftAvatar;
            modal.querySelectorAll('[data-pick-avatar]').forEach(function(b) { b.classList.remove('active'); });
          }
        });
      } else {
        notifyToast('图片选择器暂不可用');
      }
    });

    modal.querySelector('#aiw-prof-cancel').addEventListener('click', closeModalOverlay);
    modal.querySelector('#aiw-prof-save').addEventListener('click', async function() {
      var nameVal = modal.querySelector('#aiw-prof-name').value.trim();
      var bioVal = modal.querySelector('#aiw-prof-bio').value.trim();
      if (!nameVal) {
        notifyToast('请输入昵称');
        return;
      }
      _ctx.profile = await S().saveProfile({
        name: nameVal,
        bio: bioVal || '本地工作空间',
        avatar: draftAvatar
      });
      closeModalOverlay();
      renderCurrentView();
      notifyWorkspaceStateChanged();
      notifyToast('个人资料已保存');
    });
  }

  function openAppearancePickerModal() {
    var current = (_ctx.appearance && _ctx.appearance.mode) || 'system';
    var options = [
      { id: 'light', label: '浅色模式', desc: '始终使用纯净极简浅色界面', icon: 'fa-regular fa-sun' },
      { id: 'dark', label: '深色模式', desc: '适配暗光环境的护眼深色界面', icon: 'fa-regular fa-moon' },
      { id: 'system', label: '跟随系统', desc: '随设备系统或弯弯机暗夜模式自动切换', icon: 'fa-solid fa-circle-half-stroke' }
    ];

    var html = '<div class="aiw-picker-list">' + options.map(function(opt) {
      var active = opt.id === current ? ' is-selected' : '';
      return (
        '<button type="button" class="aiw-picker-item' + active + '" data-mode="' + opt.id + '">' +
          '<span class="aiw-picker-icon"><i class="' + opt.icon + '"></i></span>' +
          '<div class="aiw-picker-text">' +
            '<div class="aiw-picker-title">' + opt.label + '</div>' +
            '<div class="aiw-picker-desc">' + opt.desc + '</div>' +
          '</div>' +
          '<span class="aiw-picker-check">' + (opt.id === current ? '<i class="fa-solid fa-check"></i>' : '') + '</span>' +
        '</button>'
      );
    }).join('') + '</div>';

    var modal = showCustomModal('外观模式', html, '');
    if (!modal) return;

    modal.querySelectorAll('[data-mode]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var mode = btn.getAttribute('data-mode');
        _ctx.appearance = await S().saveAppearance({ mode: mode });
        closeModalOverlay();
        notifyWorkspaceStateChanged();
        renderCurrentView();
        notifyToast('已切换为' + (APPEARANCE_LABELS[mode] || mode));
      });
    });
  }

  function openAccentPickerModal() {
    var current = (_ctx.appearance && _ctx.appearance.accent) || 'pink';
    var list = (S() && S().ACCENT_PRESETS) || [];

    var html = '<div class="aiw-accent-grid">' + list.map(function(item) {
      var active = item.id === current ? ' is-selected' : '';
      return (
        '<button type="button" class="aiw-accent-option' + active + '" data-accent="' + escapeHtml(item.id) + '">' +
          '<span class="aiw-accent-swatch" style="background:' + escapeHtml(item.color) + '">' +
            (item.id === current ? '<i class="fa-solid fa-check"></i>' : '') +
          '</span>' +
          '<span class="aiw-accent-label">' + escapeHtml(item.label) + '</span>' +
        '</button>'
      );
    }).join('') + '</div>';

    var modal = showCustomModal('强调色', html, '');
    if (!modal) return;

    modal.querySelectorAll('[data-accent]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var accent = btn.getAttribute('data-accent');
        _ctx.appearance = await S().saveAppearance({ accent: accent });
        closeModalOverlay();
        notifyWorkspaceStateChanged();
        renderCurrentView();
        notifyToast('已应用强调色：' + getAccentInfo(accent).label);
      });
    });
  }

  // ===== 视图 2：个性化设置 =====
  function renderPersonalizationHtml() {
    var ps = _ctx.personalization || {};
    var tone = ps.tone || '温和自然';
    var detail = ps.detailLevel || '适中';

    var toneChips = TONE_OPTIONS.map(function(opt) {
      return '<button type="button" class="aiw-chip-btn' + (opt === tone ? ' active' : '') + '" data-ps-tone="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
    }).join('');

    var detailSegs = DETAIL_OPTIONS.map(function(opt) {
      return '<button type="button" class="aiw-seg-btn' + (opt === detail ? ' active' : '') + '" data-ps-detail="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
    }).join('');

    return (
      '<div class="aiw-st-topbar">' +
        '<button type="button" class="aiw-circle-btn" id="aiw-st-sub-back" aria-label="返回设置">' +
          '<i class="fa-solid fa-arrow-left"></i>' +
        '</button>' +
        '<div class="aiw-st-topbar-title">个性化</div>' +
        '<button type="button" class="aiw-st-top-action" id="aiw-ps-save-top">保存</button>' +
      '</div>' +

      '<div class="aiw-st-scroll">' +
        '<div class="aiw-st-card">' +
          '<div class="aiw-st-row aiw-st-row-static">' +
            '<div class="aiw-st-row-col">' +
              '<div class="aiw-st-row-label">启用个性化</div>' +
              '<div class="aiw-st-row-desc">开启后将在知屿对话中自动注入自定义指令与用户偏好</div>' +
            '</div>' +
            '<label class="aiw-switch">' +
              '<input type="checkbox" id="aiw-ps-enabled"' + (ps.enabled ? ' checked' : '') + '>' +
              '<span class="aiw-switch-track"></span>' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<div class="aiw-st-group-title">回复风格配置</div>' +
        '<div class="aiw-st-card aiw-st-pad">' +
          '<label class="aiw-field-label">AI 回复语气</label>' +
          '<div class="aiw-chip-grid" id="aiw-ps-tone-group">' + toneChips + '</div>' +

          '<label class="aiw-field-label" style="margin-top:14px;">回复详细程度</label>' +
          '<div class="aiw-seg-control" id="aiw-ps-detail-group">' + detailSegs + '</div>' +
        '</div>' +

        '<div class="aiw-st-group-title">指令与用户偏好</div>' +
        '<div class="aiw-st-card aiw-st-pad">' +
          '<div class="aiw-field-head">' +
            '<label class="aiw-field-label" for="aiw-ps-instructions">自定义 AI 指令</label>' +
            '<span class="aiw-char-meta" id="aiw-ps-instr-count">' + String((ps.customInstructions || '').length) + ' 字符</span>' +
          '</div>' +
          '<textarea class="aiw-field-textarea" id="aiw-ps-instructions" rows="5" placeholder="例如：回答问题前先给出核心要点；若遇到不确定的内容请直说，不要编造。">' + escapeHtml(ps.customInstructions || '') + '</textarea>' +

          '<div class="aiw-field-head" style="margin-top:14px;">' +
            '<label class="aiw-field-label" for="aiw-ps-preferences">用户偏好</label>' +
            '<span class="aiw-char-meta" id="aiw-ps-pref-count">' + String((ps.userPreferences || '').length) + ' 字符</span>' +
          '</div>' +
          '<textarea class="aiw-field-textarea" id="aiw-ps-preferences" rows="4" placeholder="例如：可以叫我弯弯；平时偏好简体中文和清晰的列表排版。">' + escapeHtml(ps.userPreferences || '') + '</textarea>' +
        '</div>' +

        '<div class="aiw-st-bottom-bar">' +
          '<button type="button" class="aiw-st-btn-primary aiw-st-btn-block" id="aiw-ps-save-btn">保存个性化设置</button>' +
        '</div>' +
      '</div>'
    );
  }

  function bindPersonalizationEvents(layer) {
    var selectedTone = (_ctx.personalization && _ctx.personalization.tone) || '温和自然';
    var selectedDetail = (_ctx.personalization && _ctx.personalization.detailLevel) || '适中';

    layer.querySelectorAll('[data-ps-tone]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        selectedTone = btn.getAttribute('data-ps-tone');
        layer.querySelectorAll('[data-ps-tone]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
      });
    });

    layer.querySelectorAll('[data-ps-detail]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        selectedDetail = btn.getAttribute('data-ps-detail');
        layer.querySelectorAll('[data-ps-detail]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
      });
    });

    var instrEl = layer.querySelector('#aiw-ps-instructions');
    var prefEl = layer.querySelector('#aiw-ps-preferences');
    var instrCount = layer.querySelector('#aiw-ps-instr-count');
    var prefCount = layer.querySelector('#aiw-ps-pref-count');

    instrEl.addEventListener('input', function() {
      instrCount.textContent = instrEl.value.length + ' 字符';
    });
    prefEl.addEventListener('input', function() {
      prefCount.textContent = prefEl.value.length + ' 字符';
    });

    async function doSave() {
      var enabledEl = layer.querySelector('#aiw-ps-enabled');
      _ctx.personalization = await S().savePersonalization({
        enabled: !!(enabledEl && enabledEl.checked),
        tone: selectedTone,
        detailLevel: selectedDetail,
        customInstructions: instrEl.value,
        userPreferences: prefEl.value
      });
      notifyWorkspaceStateChanged();
      notifyToast('个性化设置已保存');
    }

    layer.querySelector('#aiw-ps-save-top').addEventListener('click', doSave);
    layer.querySelector('#aiw-ps-save-btn').addEventListener('click', doSave);
  }

  // ===== 视图 3：预设与提示词中心（列表） =====
  function renderPresetsListHtml() {
    var list = _ctx.presets || [];

    var cardsHtml = list.length
      ? list.map(function(p) {
          var promptLen = String(p.systemPrompt || '').length;
          return (
            '<div class="aiw-preset-card' + (p.isDefault ? ' is-default' : '') + '" data-preset-card="' + escapeHtml(p.id) + '">' +
              '<div class="aiw-preset-top">' +
                formatPresetAvatarHtml(p, '') +
                '<div class="aiw-preset-meta">' +
                  '<div class="aiw-preset-title-row">' +
                    '<span class="aiw-preset-name">' + escapeHtml(p.name) + '</span>' +
                    (p.isDefault ? '<span class="aiw-preset-default-badge">默认</span>' : '') +
                  '</div>' +
                  '<div class="aiw-preset-desc">' + escapeHtml(p.description || '暂无预设描述') + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="aiw-preset-tags">' +
                '<span class="aiw-preset-tag">风格：' + escapeHtml(p.replyStyle || '温和自然') + '</span>' +
                '<span class="aiw-preset-tag">详略：' + escapeHtml(p.detailLevel || '适中') + '</span>' +
                '<span class="aiw-preset-tag">提示词：' + promptLen + ' 字</span>' +
              '</div>' +
              '<div class="aiw-preset-actions">' +
                '<button type="button" class="aiw-preset-act" data-pr-act="edit" data-pr-id="' + escapeHtml(p.id) + '"><i class="fa-regular fa-pen-to-square"></i> 编辑</button>' +
                '<button type="button" class="aiw-preset-act' + (p.isDefault ? ' is-active' : '') + '" data-pr-act="default" data-pr-id="' + escapeHtml(p.id) + '">' +
                  '<i class="fa-solid fa-star"></i> ' + (p.isDefault ? '已设为默认' : '设为默认') +
                '</button>' +
                '<button type="button" class="aiw-preset-act" data-pr-act="duplicate" data-pr-id="' + escapeHtml(p.id) + '"><i class="fa-regular fa-copy"></i> 复制</button>' +
                '<button type="button" class="aiw-preset-act" data-pr-act="export" data-pr-id="' + escapeHtml(p.id) + '"><i class="fa-solid fa-arrow-up-from-bracket"></i> 导出</button>' +
                '<button type="button" class="aiw-preset-act is-danger" data-pr-act="delete" data-pr-id="' + escapeHtml(p.id) + '"><i class="fa-regular fa-trash-can"></i> 删除</button>' +
              '</div>' +
            '</div>'
          );
        }).join('')
      : (
        '<div class="aiw-preset-empty">' +
          '<div class="aiw-preset-empty-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>' +
          '<div class="aiw-preset-empty-title">还没有预设角色</div>' +
          '<div class="aiw-preset-empty-sub">创建不同性格与分工的 AI 角色，或从文件/文本导入提示词</div>' +
          '<button type="button" class="aiw-st-btn-primary" id="aiw-pr-empty-create">新建第一个预设</button>' +
        '</div>'
      );

    return (
      '<div class="aiw-st-topbar">' +
        '<button type="button" class="aiw-circle-btn" id="aiw-st-sub-back" aria-label="返回设置">' +
          '<i class="fa-solid fa-arrow-left"></i>' +
        '</button>' +
        '<div class="aiw-st-topbar-title">预设与提示词</div>' +
        '<button type="button" class="aiw-st-top-action" id="aiw-pr-new-btn"><i class="fa-solid fa-plus"></i> 新建</button>' +
      '</div>' +

      '<div class="aiw-st-scroll">' +
        '<div class="aiw-pr-toolbar">' +
          '<span class="aiw-pr-count">共 ' + list.length + ' 个角色预设（独立持久化）</span>' +
          '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-pr-import-btn">' +
            '<i class="fa-solid fa-file-import"></i> 导入预设/提示词' +
          '</button>' +
        '</div>' +
        '<div class="aiw-preset-list">' + cardsHtml + '</div>' +
      '</div>'
    );
  }

  function openExportPresetModal(preset) {
    if (!preset) return;
    var jsonStr = S().buildPresetExportJson(preset);
    var txtStr = String(preset.systemPrompt || '');

    var bodyHtml =
      '<div class="aiw-export-preview">' +
        '<div class="aiw-field-label">导出内容预览（支持完整 JSON 预设或纯文本提示词）</div>' +
        '<textarea class="aiw-field-textarea aiw-mono-ta" id="aiw-exp-preview-ta" rows="7" readonly>' + escapeHtml(jsonStr) + '</textarea>' +
      '</div>';

    var footerHtml =
      '<button type="button" class="aiw-st-btn-secondary" id="aiw-exp-copy-txt">复制提示词</button>' +
      '<button type="button" class="aiw-st-btn-secondary" id="aiw-exp-dl-txt">导出 .txt</button>' +
      '<button type="button" class="aiw-st-btn-primary" id="aiw-exp-dl-json">导出 .json</button>';

    var modal = showCustomModal('导出：' + preset.name, bodyHtml, footerHtml);
    if (!modal) return;

    modal.querySelector('#aiw-exp-copy-txt').addEventListener('click', function() {
      copyTextSafely(txtStr || jsonStr);
    });
    modal.querySelector('#aiw-exp-dl-txt').addEventListener('click', function() {
      downloadTextFile((preset.name || 'preset') + '-prompt.txt', txtStr, 'text/plain;charset=utf-8');
    });
    modal.querySelector('#aiw-exp-dl-json').addEventListener('click', function() {
      downloadTextFile((preset.name || 'preset') + '.json', jsonStr, 'application/json;charset=utf-8');
    });
  }

  function openImportPromptModal(mode, onImported) {
    var bodyHtml =
      '<div class="aiw-import-box">' +
        '<div class="aiw-import-file-row">' +
          '<input type="file" id="aiw-imp-file" accept=".json,.txt,.md,text/plain,application/json" style="display:none">' +
          '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-block" id="aiw-imp-pick-file">' +
            '<i class="fa-regular fa-folder-open"></i> 选择本地 .json / .txt / .md 文件' +
          '</button>' +
        '</div>' +
        '<label class="aiw-field-label" style="margin-top:12px;">或直接粘贴预设 JSON / 提示词文本</label>' +
        '<textarea class="aiw-field-textarea" id="aiw-imp-textarea" rows="7" placeholder="粘贴导出的预设 JSON，或直接粘贴纯文本 System Prompt..."></textarea>' +
      '</div>';

    var footerHtml =
      '<button type="button" class="aiw-st-btn-secondary" id="aiw-imp-cancel">取消</button>' +
      '<button type="button" class="aiw-st-btn-primary" id="aiw-imp-confirm">' + (mode === 'editor' ? '导入到编辑器' : '导入并创建预设') + '</button>';

    var modal = showCustomModal(mode === 'editor' ? '导入提示词' : '导入预设 / 提示词', bodyHtml, footerHtml);
    if (!modal) return;

    var fileInput = modal.querySelector('#aiw-imp-file');
    var ta = modal.querySelector('#aiw-imp-textarea');
    var chosenFileName = '';

    modal.querySelector('#aiw-imp-pick-file').addEventListener('click', function() {
      fileInput.click();
    });

    fileInput.addEventListener('change', function(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      chosenFileName = file.name || '';
      var reader = new FileReader();
      reader.onload = function() {
        ta.value = String(reader.result || '');
      };
      reader.readAsText(file, 'utf-8');
    });

    modal.querySelector('#aiw-imp-cancel').addEventListener('click', closeModalOverlay);
    modal.querySelector('#aiw-imp-confirm').addEventListener('click', async function() {
      var parsed = S().parseImportedPromptPayload(ta.value, chosenFileName);
      if (!parsed) {
        notifyToast('请先选择文件或粘贴有效的提示词内容');
        return;
      }
      closeModalOverlay();
      if (typeof onImported === 'function') {
        await onImported(parsed);
      }
    });
  }

  function openNewPresetEditor(initialData) {
    _ctx.editingPresetId = null;
    _ctx.editorDraft = Object.assign({
      name: '',
      avatarType: 'icon',
      avatarValue: 'fa-solid fa-wand-magic-sparkles',
      description: '',
      systemPrompt: '',
      replyStyle: '温和自然',
      detailLevel: '适中',
      isDefault: (_ctx.presets || []).length === 0
    }, initialData || {});
    pushView('preset-editor');
  }

  function openEditPresetEditor(preset) {
    if (!preset) return;
    _ctx.editingPresetId = preset.id;
    _ctx.editorDraft = Object.assign({}, preset);
    pushView('preset-editor');
  }

  function bindPresetsListEvents(layer) {
    var newBtn = layer.querySelector('#aiw-pr-new-btn');
    if (newBtn) {
      newBtn.addEventListener('click', function() { openNewPresetEditor(); });
    }
    var emptyCreateBtn = layer.querySelector('#aiw-pr-empty-create');
    if (emptyCreateBtn) {
      emptyCreateBtn.addEventListener('click', function() { openNewPresetEditor(); });
    }

    var importBtn = layer.querySelector('#aiw-pr-import-btn');
    if (importBtn) {
      importBtn.addEventListener('click', function() {
        openImportPromptModal('list', async function(parsed) {
          var payload = parsed.kind === 'preset'
            ? parsed.preset
            : {
                name: parsed.name || '导入的提示词',
                description: '从外部导入的提示词预设',
                systemPrompt: parsed.systemPrompt,
                replyStyle: '温和自然',
                detailLevel: '适中'
              };
          await S().createPreset(payload);
          _ctx.presets = await S().listPresets();
          notifyWorkspaceStateChanged();
          renderCurrentView();
          notifyToast('已导入并创建预设「' + payload.name + '」');
        });
      });
    }

    layer.querySelectorAll('[data-pr-act]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var act = btn.getAttribute('data-pr-act');
        var id = btn.getAttribute('data-pr-id');
        var preset = (_ctx.presets || []).find(function(p) { return p.id === id; });
        if (!preset) return;

        if (act === 'edit') {
          openEditPresetEditor(preset);
        } else if (act === 'default') {
          if (preset.isDefault) {
            notifyToast('「' + preset.name + '」已是当前默认预设');
            return;
          }
          await S().setDefaultPreset(id);
          _ctx.presets = await S().listPresets();
          notifyWorkspaceStateChanged();
          renderCurrentView();
          notifyToast('已将「' + preset.name + '」设为默认预设');
        } else if (act === 'duplicate') {
          var copied = await S().duplicatePreset(id);
          _ctx.presets = await S().listPresets();
          notifyWorkspaceStateChanged();
          renderCurrentView();
          if (copied) notifyToast('已复制创建「' + copied.name + '」');
        } else if (act === 'export') {
          openExportPresetModal(preset);
        } else if (act === 'delete') {
          showConfirmModal(
            '删除预设',
            '确定要删除「' + preset.name + '」吗？此操作会从本地存储永久移除该预设。',
            '确认删除',
            true,
            async function() {
              await S().deletePreset(id);
              _ctx.presets = await S().listPresets();
              notifyWorkspaceStateChanged();
              renderCurrentView();
              notifyToast('已删除预设「' + preset.name + '」');
            }
          );
        }
      });
    });
  }

  // ===== 视图 4：预设与提示词编辑器 =====
  function renderPresetEditorHtml() {
    var d = _ctx.editorDraft || {
      name: '',
      avatarType: 'icon',
      avatarValue: 'fa-solid fa-wand-magic-sparkles',
      description: '',
      systemPrompt: '',
      replyStyle: '温和自然',
      detailLevel: '适中',
      isDefault: false
    };
    var isEdit = !!_ctx.editingPresetId;
    var promptText = String(d.systemPrompt || '');

    var iconPicks = ICON_CHOICES.map(function(item) {
      var active = d.avatarType !== 'image' && d.avatarValue === item.icon ? ' active' : '';
      return '<button type="button" class="aiw-icon-pick-btn' + active + '" data-pe-icon="' + escapeHtml(item.icon) + '" title="' + escapeHtml(item.label) + '"><i class="' + escapeHtml(item.icon) + '"></i></button>';
    }).join('');

    var imgPicks = AVATAR_IMAGE_CHOICES.map(function(src) {
      var active = d.avatarType === 'image' && d.avatarValue === src ? ' active' : '';
      return '<button type="button" class="aiw-avatar-pick-thumb' + active + '" data-pe-img="' + escapeHtml(src) + '"><img src="' + escapeHtml(src) + '" alt="预设头像"></button>';
    }).join('');

    var styleChips = STYLE_OPTIONS.map(function(opt) {
      var active = d.replyStyle === opt ? ' active' : '';
      return '<button type="button" class="aiw-chip-btn' + active + '" data-pe-style="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
    }).join('');

    var detailSegs = DETAIL_OPTIONS.map(function(opt) {
      var active = d.detailLevel === opt ? ' active' : '';
      return '<button type="button" class="aiw-seg-btn' + active + '" data-pe-detail="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
    }).join('');

    return (
      '<div class="aiw-st-topbar">' +
        '<button type="button" class="aiw-circle-btn" id="aiw-st-sub-back" aria-label="返回预设列表">' +
          '<i class="fa-solid fa-arrow-left"></i>' +
        '</button>' +
        '<div class="aiw-st-topbar-title">' + (isEdit ? '编辑预设' : '新建预设') + '</div>' +
        '<button type="button" class="aiw-st-top-action" id="aiw-pe-save-top">保存</button>' +
      '</div>' +

      '<div class="aiw-st-scroll">' +
        '<div class="aiw-st-card aiw-st-pad">' +
          '<div class="aiw-pe-avatar-header">' +
            '<div id="aiw-pe-avatar-preview">' + formatPresetAvatarHtml(d, 'is-lg') + '</div>' +
            '<div class="aiw-pe-avatar-right">' +
              '<div class="aiw-field-label" style="margin-bottom:6px;">预设头像或图标</div>' +
              '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-pe-custom-img"><i class="fa-regular fa-image"></i> 上传/URL图片</button>' +
            '</div>' +
          '</div>' +
          '<div class="aiw-icon-pick-grid">' + iconPicks + '</div>' +
          '<div class="aiw-avatar-pick-strip" style="margin-top:8px;">' + imgPicks + '</div>' +

          '<label class="aiw-field-label" for="aiw-pe-name" style="margin-top:14px;">预设名称 *</label>' +
          '<input type="text" class="aiw-field-input" id="aiw-pe-name" maxlength="40" value="' + escapeHtml(d.name || '') + '" placeholder="例如：温柔写作编辑、代码架构师">' +

          '<label class="aiw-field-label" for="aiw-pe-desc" style="margin-top:12px;">预设描述</label>' +
          '<input type="text" class="aiw-field-input" id="aiw-pe-desc" maxlength="100" value="' + escapeHtml(d.description || '') + '" placeholder="简短说明这个 AI 角色的定位与擅长领域">' +
        '</div>' +

        '<div class="aiw-st-group-title">回复行为配置</div>' +
        '<div class="aiw-st-card aiw-st-pad">' +
          '<label class="aiw-field-label">回复风格</label>' +
          '<div class="aiw-chip-grid" id="aiw-pe-style-group">' + styleChips + '</div>' +
          '<input type="text" class="aiw-field-input" id="aiw-pe-style-input" style="margin-top:8px;" maxlength="20" value="' + escapeHtml(d.replyStyle || '温和自然') + '" placeholder="也可自定义输入回复风格">' +

          '<label class="aiw-field-label" style="margin-top:14px;">回复详细程度</label>' +
          '<div class="aiw-seg-control" id="aiw-pe-detail-group">' + detailSegs + '</div>' +

          '<div class="aiw-st-row aiw-st-row-static" style="padding:14px 0 2px; border-top:1px solid var(--aiw-border); margin-top:14px;">' +
            '<div class="aiw-st-row-col">' +
              '<div class="aiw-st-row-label">设为默认预设</div>' +
              '<div class="aiw-st-row-desc">新建对话时优先使用的默认角色</div>' +
            '</div>' +
            '<label class="aiw-switch">' +
              '<input type="checkbox" id="aiw-pe-default"' + (d.isDefault ? ' checked' : '') + '>' +
              '<span class="aiw-switch-track"></span>' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<div class="aiw-st-group-title">系统提示词（System Prompt）</div>' +
        '<div class="aiw-st-card aiw-st-pad">' +
          '<div class="aiw-field-head">' +
            '<span class="aiw-field-label" style="margin:0;">提示词编辑器（支持长文本）</span>' +
            '<span class="aiw-char-meta" id="aiw-pe-char-count">' + promptText.length + ' 字符</span>' +
          '</div>' +

          '<div class="aiw-editor-tools">' +
            '<button type="button" class="aiw-ed-tool-btn" id="aiw-pe-copy"><i class="fa-regular fa-copy"></i> 复制</button>' +
            '<button type="button" class="aiw-ed-tool-btn" id="aiw-pe-paste"><i class="fa-regular fa-paste"></i> 粘贴</button>' +
            '<button type="button" class="aiw-ed-tool-btn" id="aiw-pe-import"><i class="fa-solid fa-file-import"></i> 导入</button>' +
            '<button type="button" class="aiw-ed-tool-btn" id="aiw-pe-export"><i class="fa-solid fa-arrow-up-from-bracket"></i> 导出</button>' +
            '<button type="button" class="aiw-ed-tool-btn is-danger" id="aiw-pe-clear"><i class="fa-solid fa-eraser"></i> 清空</button>' +
          '</div>' +

          '<textarea class="aiw-field-textarea aiw-prompt-textarea" id="aiw-pe-prompt" rows="9" placeholder="在这里编写 System Prompt，定义角色背景、思考方式、输出结构与约束规则...">' + escapeHtml(promptText) + '</textarea>' +
        '</div>' +

        '<div class="aiw-st-bottom-bar">' +
          '<button type="button" class="aiw-st-btn-primary aiw-st-btn-block" id="aiw-pe-save-btn">' + (isEdit ? '保存修改' : '创建并保存预设') + '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function openManualPasteModal(onPasteText) {
    var modal = showCustomModal(
      '粘贴文本到提示词',
      '<label class="aiw-field-label">请在下方输入或长按粘贴文本：</label>' +
      '<textarea class="aiw-field-textarea" id="aiw-manual-paste-ta" rows="6" placeholder="在此粘贴提示词文本..."></textarea>',
      '<button type="button" class="aiw-st-btn-secondary" id="aiw-mp-cancel">取消</button>' +
      '<button type="button" class="aiw-st-btn-primary" id="aiw-mp-insert">插入/替换</button>'
    );
    if (!modal) return;
    var ta = modal.querySelector('#aiw-manual-paste-ta');
    setTimeout(function() { try { ta.focus(); } catch (_) {} }, 80);
    modal.querySelector('#aiw-mp-cancel').addEventListener('click', closeModalOverlay);
    modal.querySelector('#aiw-mp-insert').addEventListener('click', function() {
      var val = ta.value;
      closeModalOverlay();
      if (val && typeof onPasteText === 'function') onPasteText(val);
    });
  }

  function bindPresetEditorEvents(layer) {
    var draft = _ctx.editorDraft;
    var previewWrap = layer.querySelector('#aiw-pe-avatar-preview');
    var nameInput = layer.querySelector('#aiw-pe-name');
    var descInput = layer.querySelector('#aiw-pe-desc');
    var styleInput = layer.querySelector('#aiw-pe-style-input');
    var defaultToggle = layer.querySelector('#aiw-pe-default');
    var promptTa = layer.querySelector('#aiw-pe-prompt');
    var charCountEl = layer.querySelector('#aiw-pe-char-count');

    function syncAvatarPreview() {
      previewWrap.innerHTML = formatPresetAvatarHtml(draft, 'is-lg');
      layer.querySelectorAll('[data-pe-icon]').forEach(function(b) {
        b.classList.toggle('active', draft.avatarType !== 'image' && b.getAttribute('data-pe-icon') === draft.avatarValue);
      });
      layer.querySelectorAll('[data-pe-img]').forEach(function(b) {
        b.classList.toggle('active', draft.avatarType === 'image' && b.getAttribute('data-pe-img') === draft.avatarValue);
      });
    }

    function updateCharCount() {
      charCountEl.textContent = promptTa.value.length + ' 字符';
    }

    layer.querySelectorAll('[data-pe-icon]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        draft.avatarType = 'icon';
        draft.avatarValue = btn.getAttribute('data-pe-icon');
        syncAvatarPreview();
      });
    });

    layer.querySelectorAll('[data-pe-img]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        draft.avatarType = 'image';
        draft.avatarValue = btn.getAttribute('data-pe-img');
        syncAvatarPreview();
      });
    });

    layer.querySelector('#aiw-pe-custom-img').addEventListener('click', function() {
      if (typeof global.showImagePicker === 'function') {
        global.showImagePicker(function(url) {
          if (url) {
            draft.avatarType = 'image';
            draft.avatarValue = url;
            syncAvatarPreview();
          }
        });
      } else {
        notifyToast('图片选择器暂不可用');
      }
    });

    layer.querySelectorAll('[data-pe-style]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var val = btn.getAttribute('data-pe-style');
        draft.replyStyle = val;
        styleInput.value = val;
        layer.querySelectorAll('[data-pe-style]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
      });
    });

    styleInput.addEventListener('input', function() {
      draft.replyStyle = styleInput.value;
      layer.querySelectorAll('[data-pe-style]').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-pe-style') === styleInput.value.trim());
      });
    });

    layer.querySelectorAll('[data-pe-detail]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        draft.detailLevel = btn.getAttribute('data-pe-detail');
        layer.querySelectorAll('[data-pe-detail]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
      });
    });

    promptTa.addEventListener('input', updateCharCount);

    // 复制
    layer.querySelector('#aiw-pe-copy').addEventListener('click', function() {
      copyTextSafely(promptTa.value);
    });

    // 粘贴
    layer.querySelector('#aiw-pe-paste').addEventListener('click', async function() {
      var insertIntoPrompt = function(pasted) {
        var start = typeof promptTa.selectionStart === 'number' ? promptTa.selectionStart : promptTa.value.length;
        var end = typeof promptTa.selectionEnd === 'number' ? promptTa.selectionEnd : promptTa.value.length;
        var before = promptTa.value.slice(0, start);
        var after = promptTa.value.slice(end);
        promptTa.value = before + pasted + after;
        updateCharCount();
        notifyToast('已粘贴文本（共 ' + promptTa.value.length + ' 字符）');
      };

      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          var clip = await navigator.clipboard.readText();
          if (clip) {
            insertIntoPrompt(clip);
            return;
          }
          notifyToast('剪贴板为空，可手动粘贴');
        }
      } catch (_) {}

      openManualPasteModal(insertIntoPrompt);
    });

    // 导入
    layer.querySelector('#aiw-pe-import').addEventListener('click', function() {
      openImportPromptModal('editor', function(parsed) {
        if (parsed.kind === 'preset') {
          var p = parsed.preset;
          if (p.name && !nameInput.value.trim()) nameInput.value = p.name;
          if (p.description && !descInput.value.trim()) descInput.value = p.description;
          if (p.replyStyle) {
            draft.replyStyle = p.replyStyle;
            styleInput.value = p.replyStyle;
          }
          if (p.detailLevel) draft.detailLevel = p.detailLevel;
          promptTa.value = p.systemPrompt || '';
        } else {
          if (parsed.name && !nameInput.value.trim()) nameInput.value = parsed.name;
          promptTa.value = parsed.systemPrompt || '';
        }
        updateCharCount();
        notifyToast('提示词已导入编辑器');
      });
    });

    // 导出
    layer.querySelector('#aiw-pe-export').addEventListener('click', function() {
      var snapshot = Object.assign({}, draft, {
        name: nameInput.value.trim() || '未命名预设',
        description: descInput.value.trim(),
        replyStyle: styleInput.value.trim() || '温和自然',
        systemPrompt: promptTa.value
      });
      openExportPresetModal(snapshot);
    });

    // 清空
    layer.querySelector('#aiw-pe-clear').addEventListener('click', function() {
      if (!promptTa.value) {
        notifyToast('提示词已为空');
        return;
      }
      if (promptTa.value.length > 20) {
        showConfirmModal('清空提示词', '确定要清空当前编写的系统提示词内容吗？', '确认清空', true, function() {
          promptTa.value = '';
          updateCharCount();
          notifyToast('已清空提示词');
        });
      } else {
        promptTa.value = '';
        updateCharCount();
        notifyToast('已清空提示词');
      }
    });

    // 保存预设
    async function savePresetForm() {
      var nameVal = nameInput.value.trim();
      if (!nameVal) {
        notifyToast('请填写预设名称');
        nameInput.focus();
        return;
      }

      var payload = {
        name: nameVal,
        avatarType: draft.avatarType,
        avatarValue: draft.avatarValue,
        description: descInput.value.trim(),
        replyStyle: styleInput.value.trim() || '温和自然',
        detailLevel: draft.detailLevel || '适中',
        isDefault: !!(defaultToggle && defaultToggle.checked),
        systemPrompt: promptTa.value
      };

      if (_ctx.editingPresetId) {
        await S().updatePreset(_ctx.editingPresetId, payload);
        notifyToast('预设「' + nameVal + '」已更新保存');
      } else {
        await S().createPreset(payload);
        notifyToast('已创建预设「' + nameVal + '」');
      }

      _ctx.presets = await S().listPresets();
      notifyWorkspaceStateChanged();
      popView();
    }

    layer.querySelector('#aiw-pe-save-top').addEventListener('click', savePresetForm);
    layer.querySelector('#aiw-pe-save-btn').addEventListener('click', savePresetForm);
  }

  // ===== 视图 5：常规设置 =====
  function renderGeneralHtml() {
    var gen = _ctx.general || {};
    return (
      '<div class="aiw-st-topbar">' +
        '<button type="button" class="aiw-circle-btn" id="aiw-st-sub-back" aria-label="返回设置">' +
          '<i class="fa-solid fa-arrow-left"></i>' +
        '</button>' +
        '<div class="aiw-st-topbar-title">常规设置</div>' +
        '<div class="aiw-st-topbar-spacer"></div>' +
      '</div>' +

      '<div class="aiw-st-scroll">' +
        '<div class="aiw-st-group-title">输入与会话习惯</div>' +
        '<div class="aiw-st-card">' +
          '<div class="aiw-st-row aiw-st-row-static">' +
            '<div class="aiw-st-row-col">' +
              '<div class="aiw-st-row-label">回车键发送消息</div>' +
              '<div class="aiw-st-row-desc">开启后按 Enter 直接发送，Shift+Enter 换行</div>' +
            '</div>' +
            '<label class="aiw-switch">' +
              '<input type="checkbox" id="aiw-gen-enter"' + (gen.enterToSend !== false ? ' checked' : '') + '>' +
              '<span class="aiw-switch-track"></span>' +
            '</label>' +
          '</div>' +
          '<div class="aiw-st-row aiw-st-row-static">' +
            '<div class="aiw-st-row-col">' +
              '<div class="aiw-st-row-label">新对话自动使用默认预设</div>' +
              '<div class="aiw-st-row-desc">新建知屿对话时自动展示当前默认预设信息</div>' +
            '</div>' +
            '<label class="aiw-switch">' +
              '<input type="checkbox" id="aiw-gen-autopreset"' + (gen.autoUseDefaultPreset !== false ? ' checked' : '') + '>' +
              '<span class="aiw-switch-track"></span>' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<div class="aiw-st-group-title">本地工作空间数据</div>' +
        '<div class="aiw-st-card">' +
          '<button type="button" class="aiw-st-row" id="aiw-gen-export-all">' +
            '<span class="aiw-st-row-icon"><i class="fa-solid fa-download"></i></span>' +
            '<span class="aiw-st-row-label">导出知屿配置与预设备份</span>' +
            '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-right"></i></span>' +
          '</button>' +
        '</div>' +

        '<div class="aiw-st-footnote">知屿配置与预设保存在本地 WanWanDB 数据库中，不修改主数据库结构，也不影响原有弯弯机数据。</div>' +
      '</div>'
    );
  }

  function bindGeneralEvents(layer) {
    var enterEl = layer.querySelector('#aiw-gen-enter');
    var autoPresetEl = layer.querySelector('#aiw-gen-autopreset');

    enterEl.addEventListener('change', async function() {
      _ctx.general = await S().saveGeneralSettings({ enterToSend: enterEl.checked });
      notifyWorkspaceStateChanged();
      notifyToast(enterEl.checked ? '已开启回车发送' : '已关闭回车发送');
    });

    autoPresetEl.addEventListener('change', async function() {
      _ctx.general = await S().saveGeneralSettings({ autoUseDefaultPreset: autoPresetEl.checked });
      notifyWorkspaceStateChanged();
      notifyToast(autoPresetEl.checked ? '新对话将显示默认预设' : '已关闭新对话默认预设展示');
    });

    layer.querySelector('#aiw-gen-export-all').addEventListener('click', function() {
      var bundle = JSON.stringify({
        format: 'wanwan-aiw-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        profile: _ctx.profile,
        personalization: _ctx.personalization,
        appearance: _ctx.appearance,
        general: _ctx.general,
        presets: _ctx.presets
      }, null, 2);
      downloadTextFile('zhiyu-settings-backup.json', bundle, 'application/json;charset=utf-8');
    });
  }

  // ===== 视图 6：知屿专属 API 配置 =====
  function formatTempReadout(val) {
    var num = Number(val);
    if (!Number.isFinite(num)) num = 0.7;
    return num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  function renderCustomApiHtml() {
    var cfg = _ctx.customApi || { baseUrl: '', apiKey: '', model: '', fetchedModels: [], temperature: 0.7, complete: false };
    var models = Array.isArray(cfg.fetchedModels) ? cfg.fetchedModels.slice() : [];
    if (cfg.model && models.indexOf(cfg.model) === -1) {
      models.unshift(cfg.model);
    }
    var hasPartial = !cfg.complete && !!(cfg.baseUrl || cfg.apiKey || cfg.model);
    var statusBannerClass = cfg.complete ? 'is-custom' : (hasPartial ? 'is-partial' : 'is-primary');
    var statusTitle = cfg.complete
      ? '已启用知屿专属 API'
      : (hasPartial ? '专属 API 未配置完整（当前回退主 API）' : '未配置专属 API（当前使用弯弯机主 API）');
    var statusDesc = cfg.complete
      ? '知屿将严格优先使用下方专属接口；若请求失败会明确报错，不会偷偷切换回主 API，也不影响弯弯机其他应用。'
      : '只有 Base URL、API Key 与模型名称三项均填写完整后才会启用专属 API；留空或不完整时自动使用弯弯机现有主 API。';

    var modelOptionsHtml = '<option value="">拉取后选择模型</option>' + models.map(function(m) {
      var selected = cfg.model === m ? ' selected' : '';
      return '<option value="' + escapeHtml(m) + '"' + selected + '>' + escapeHtml(m) + '</option>';
    }).join('');

    return (
      '<div class="aiw-st-topbar">' +
        '<button type="button" class="aiw-circle-btn" id="aiw-st-sub-back" aria-label="返回设置">' +
          '<i class="fa-solid fa-arrow-left"></i>' +
        '</button>' +
        '<div class="aiw-st-topbar-title">知屿专属 API</div>' +
        '<button type="button" class="aiw-st-top-action" id="aiw-api-save-top">保存</button>' +
      '</div>' +

      '<div class="aiw-st-scroll">' +
        '<div class="aiw-api-status-banner ' + statusBannerClass + '" id="aiw-api-status-banner">' +
          '<div class="aiw-api-status-title"><i class="fa-solid fa-circle-info"></i> ' + escapeHtml(statusTitle) + '</div>' +
          '<div class="aiw-api-status-desc">' + escapeHtml(statusDesc) + '</div>' +
        '</div>' +

        '<div class="aiw-st-card aiw-st-pad">' +
          '<label class="aiw-field-label" for="aiw-api-base-url">Base URL</label>' +
          '<input type="url" class="aiw-field-input" id="aiw-api-base-url" autocomplete="off" spellcheck="false" value="' + escapeHtml(cfg.baseUrl || '') + '" placeholder="https://api.openai.com/v1">' +

          '<label class="aiw-field-label" for="aiw-api-key" style="margin-top:14px;">API Key</label>' +
          '<div class="aiw-api-key-row">' +
            '<input type="password" class="aiw-field-input" id="aiw-api-key" autocomplete="off" spellcheck="false" value="' + escapeHtml(cfg.apiKey || '') + '" placeholder="sk-...">' +
            '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-api-toggle-key">显示</button>' +
          '</div>' +

          '<label class="aiw-field-label" for="aiw-api-model-input" style="margin-top:14px;">模型名称（支持手动输入）</label>' +
          '<input type="text" class="aiw-field-input" id="aiw-api-model-input" autocomplete="off" spellcheck="false" value="' + escapeHtml(cfg.model || '') + '" placeholder="手动输入模型名，例如 gpt-4o-mini">' +

          '<label class="aiw-field-label" for="aiw-api-model-select" style="margin-top:14px;">拉取模型列表</label>' +
          '<div class="aiw-api-model-row">' +
            '<select class="aiw-field-input aiw-api-select" id="aiw-api-model-select">' + modelOptionsHtml + '</select>' +
            '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-api-fetch-models">' +
              '<i class="fa-solid fa-arrows-rotate"></i> 获取' +
            '</button>' +
          '</div>' +

          '<div class="aiw-api-temp-block">' +
            '<div class="aiw-field-head" style="margin-bottom:4px;">' +
              '<label class="aiw-field-label" for="aiw-api-temp" style="margin:0;">温度调节（Temperature）</label>' +
              '<span class="aiw-api-temp-val" id="aiw-api-temp-val">' + escapeHtml(formatTempReadout(cfg.temperature)) + '</span>' +
            '</div>' +
            '<input type="range" class="aiw-range-slider" id="aiw-api-temp" min="0" max="2" step="0.05" value="' + escapeHtml(String(cfg.temperature != null ? cfg.temperature : 0.7)) + '">' +
            '<div class="aiw-api-temp-hints"><span>0.0 严谨稳定</span><span>1.0 均衡自然</span><span>2.0 发散创意</span></div>' +
          '</div>' +

          '<div class="aiw-api-actions-row">' +
            '<button type="button" class="aiw-st-btn-secondary" id="aiw-api-test-btn">' +
              '<i class="fa-solid fa-plug-circle-check"></i> 连接测试' +
            '</button>' +
            '<button type="button" class="aiw-st-btn-primary" id="aiw-api-save-btn">' +
              '<i class="fa-solid fa-check"></i> 保存配置' +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div class="aiw-st-bottom-bar">' +
          '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-block aiw-btn-text-danger" id="aiw-api-clear-btn">' +
            '<i class="fa-regular fa-trash-can"></i> 清空知屿专属配置（切回主 API）' +
          '</button>' +
        '</div>' +

        '<div class="aiw-st-footnote">说明：此处的 API 配置仅作用于「知屿」，绝不会写入或改动弯弯机主设置中的全局 API 与模型。</div>' +
      '</div>'
    );
  }

  function bindCustomApiEvents(layer) {
    var urlInput = layer.querySelector('#aiw-api-base-url');
    var keyInput = layer.querySelector('#aiw-api-key');
    var toggleKeyBtn = layer.querySelector('#aiw-api-toggle-key');
    var modelInput = layer.querySelector('#aiw-api-model-input');
    var modelSelect = layer.querySelector('#aiw-api-model-select');
    var fetchBtn = layer.querySelector('#aiw-api-fetch-models');
    var tempSlider = layer.querySelector('#aiw-api-temp');
    var tempValEl = layer.querySelector('#aiw-api-temp-val');
    var testBtn = layer.querySelector('#aiw-api-test-btn');
    var saveBtn = layer.querySelector('#aiw-api-save-btn');
    var saveTopBtn = layer.querySelector('#aiw-api-save-top');
    var clearBtn = layer.querySelector('#aiw-api-clear-btn');

    var fetchedList = (_ctx.customApi && Array.isArray(_ctx.customApi.fetchedModels))
      ? _ctx.customApi.fetchedModels.slice()
      : [];

    function readFormDraft() {
      return {
        baseUrl: S().normalizeBaseUrl(urlInput.value),
        apiKey: String(keyInput.value || '').trim(),
        model: String(modelInput.value || '').trim(),
        temperature: S().normalizeTemperature(tempSlider.value, 0.7),
        fetchedModels: fetchedList
      };
    }

    function syncDropdownOptions(models, currentModel) {
      var list = Array.isArray(models) ? models.slice() : [];
      if (currentModel && list.indexOf(currentModel) === -1) {
        list.unshift(currentModel);
      }
      modelSelect.innerHTML = '<option value="">拉取后选择模型</option>' + list.map(function(m) {
        return '<option value="' + escapeHtml(m) + '">' + escapeHtml(m) + '</option>';
      }).join('');
      if (currentModel) {
        modelSelect.value = currentModel;
      }
    }

    toggleKeyBtn.addEventListener('click', function() {
      var showing = keyInput.type === 'text';
      keyInput.type = showing ? 'password' : 'text';
      toggleKeyBtn.textContent = showing ? '显示' : '隐藏';
    });

    tempSlider.addEventListener('input', function() {
      tempValEl.textContent = formatTempReadout(tempSlider.value);
    });

    modelSelect.addEventListener('change', function() {
      if (modelSelect.value) {
        modelInput.value = modelSelect.value;
      }
    });

    modelInput.addEventListener('input', function() {
      var v = modelInput.value.trim();
      for (var i = 0; i < modelSelect.options.length; i++) {
        if (modelSelect.options[i].value === v) {
          modelSelect.value = v;
          return;
        }
      }
      modelSelect.value = '';
    });

    fetchBtn.addEventListener('click', async function() {
      var draft = readFormDraft();
      if (!AI() || typeof AI().fetchModels !== 'function') {
        notifyToast('AI 引擎模块未就绪');
        return;
      }
      var prevHtml = fetchBtn.innerHTML;
      fetchBtn.disabled = true;
      fetchBtn.textContent = '获取中...';
      try {
        var models = await AI().fetchModels({ url: draft.baseUrl, key: draft.apiKey });
        fetchedList = models.slice();
        if (!modelInput.value.trim() && models.length) {
          modelInput.value = models[0];
        }
        syncDropdownOptions(fetchedList, modelInput.value.trim());
        notifyToast('已拉取 ' + models.length + ' 个模型');
      } catch (err) {
        var msg = (err && err.message) || '获取模型失败';
        if (err && err.hint) msg += '（' + err.hint + '）';
        notifyToast(msg);
      } finally {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = prevHtml;
      }
    });

    testBtn.addEventListener('click', async function() {
      var draft = readFormDraft();
      if (!AI() || typeof AI().testConnection !== 'function') {
        notifyToast('AI 引擎模块未就绪');
        return;
      }
      var prevHtml = testBtn.innerHTML;
      testBtn.disabled = true;
      testBtn.textContent = '测试中...';
      try {
        var res = await AI().testConnection({
          url: draft.baseUrl,
          key: draft.apiKey,
          model: draft.model,
          temperature: draft.temperature
        });
        showCustomModal(
          '专属 API 连接成功',
          '<p class="aiw-st-modal-msg">模型 <strong>' + escapeHtml(res.model) + '</strong> 响应正常（耗时 ' + res.durationMs + ' ms）。</p>' +
          '<div class="aiw-api-test-reply">' + escapeHtml(res.reply) + '</div>',
          '<button type="button" class="aiw-st-btn-primary" id="aiw-api-test-ok">我知道了</button>'
        );
      } catch (err) {
        var errMsg = (err && err.message) || '连接测试失败';
        var hintHtml = err && err.hint
          ? '<div class="aiw-api-test-hint">' + escapeHtml(err.hint) + '</div>'
          : '';
        showCustomModal(
          '专属 API 连接失败',
          '<p class="aiw-st-modal-msg" style="color:#ef4444;">' + escapeHtml(errMsg) + '</p>' + hintHtml,
          '<button type="button" class="aiw-st-btn-primary" id="aiw-api-test-ok">我知道了</button>'
        );
      } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = prevHtml;
        var okBtn = layer.querySelector('#aiw-api-test-ok');
        if (okBtn) okBtn.addEventListener('click', closeModalOverlay);
      }
    });

    async function doSaveCustomApi() {
      var draft = readFormDraft();
      var hasAny = !!(draft.baseUrl || draft.apiKey || draft.model);
      var isComplete = S().isCustomApiComplete(draft);

      _ctx.customApi = await S().saveCustomApiConfig(draft);
      if (_ctx.customApi.complete && _ctx.customApi.model) {
        await S().saveSelectedModel(_ctx.customApi.model);
      }
      if (AI() && typeof AI().resolveEffectiveApiConfig === 'function') {
        _ctx.effectiveApi = await AI().resolveEffectiveApiConfig();
      }
      notifyWorkspaceStateChanged();
      renderCurrentView();

      if (isComplete) {
        notifyToast('知屿专属 API 已保存并启用');
      } else if (hasAny) {
        notifyToast('已保存草稿（因未填完整，当前仍使用弯弯机主 API）');
      } else {
        notifyToast('已保存，当前使用弯弯机主 API');
      }
    }

    saveBtn.addEventListener('click', doSaveCustomApi);
    saveTopBtn.addEventListener('click', doSaveCustomApi);

    var okBtn = null;
    clearBtn.addEventListener('click', function() {
      showConfirmModal(
        '清空专属 API 配置',
        '确定要清空知屿专属 API 配置吗？清空后知屿将自动使用弯弯机现有的主 API，不会影响主设置。',
        '确认清空',
        true,
        async function() {
          _ctx.customApi = await S().clearCustomApiConfig();
          await S().saveSelectedModel('');
          if (AI() && typeof AI().resolveEffectiveApiConfig === 'function') {
            _ctx.effectiveApi = await AI().resolveEffectiveApiConfig();
          }
          notifyWorkspaceStateChanged();
          renderCurrentView();
          notifyToast('已清空知屿专属 API，已切回主 API');
        }
      );
    });
    void okBtn;
  }

  // ===== 视图 7：长期记忆管理（第五阶段） =====
  function formatMemoryDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var pad = function(n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function formatScopeLabel(scope) {
    if (scope === 'chat') return '仅当前对话';
    if (scope === 'project') return '项目记忆';
    return '跨窗口共享';
  }

  function getFilteredMemories() {
    var list = Array.isArray(_ctx.memories) ? _ctx.memories : [];
    var q = String(_ctx.memorySearchQuery || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(function(m) {
      return String(m.content || '').toLowerCase().indexOf(q) !== -1 ||
        String(m.category || '').toLowerCase().indexOf(q) !== -1 ||
        String(m.sourceChatTitle || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderMemoryCardsHtml(list) {
    if (!list.length) {
      var hasQuery = !!String(_ctx.memorySearchQuery || '').trim();
      return (
        '<div class="aiw-mem-empty">' +
          '<div class="aiw-mem-empty-icon"><i class="fa-regular fa-bookmark"></i></div>' +
          '<div class="aiw-mem-empty-title">' + (hasQuery ? '没有匹配的长期记忆' : '还没有保存任何长期记忆') + '</div>' +
          '<div class="aiw-mem-empty-sub">' +
            (hasQuery
              ? '换个关键词试试，或清空搜索查看全部记忆。'
              : '当开启「自动记忆」后，知屿会在对话中自动记住你的偏好、习惯、长期计划与重要决定，也可以点击右上角手动新增。') +
          '</div>' +
        '</div>'
      );
    }

    return list.map(function(m) {
      var sourceLabel = m.sourceChatTitle
        ? (m.sourceChatTitle === '手动添加' ? '来源：手动添加' : ('来源：' + m.sourceChatTitle))
        : (m.sourceChatId ? '来源：对话自动提取' : '来源：手动添加');
      if (m.factSource === 'context_resolved') sourceLabel += ' · 上下文指代消解';
      var timeLabel = formatMemoryDate(m.updatedAt || m.createdAt);
      var statusLabel = '';
      var st = String(m.status || 'active').toLowerCase();
      var ts = String(m.temporalState || 'current').toLowerCase();
      if (st === 'cancelled' || ts === 'cancelled') statusLabel = '已取消';
      else if (st === 'completed' || ts === 'completed') statusLabel = '已完成';
      else if (st === 'historical' || ts === 'past') statusLabel = '历史记录';
      else if (ts === 'future_plan') statusLabel = '计划中';

      var confPct = typeof m.confidence === 'number' && Number.isFinite(m.confidence)
        ? Math.round(m.confidence * 100) + '%'
        : '';
      var prevHint = m.previousContent ? ('变更自「' + m.previousContent + '」') : '';

      return (
        '<div class="aiw-mem-card" data-mem-id="' + escapeHtml(m.id) + '">' +
          '<div class="aiw-mem-card-top">' +
            '<div class="aiw-mem-badges">' +
              '<span class="aiw-mem-badge is-cat">' + escapeHtml(m.category || '备忘') + '</span>' +
              (statusLabel ? '<span class="aiw-mem-badge is-status">' + escapeHtml(statusLabel) + '</span>' : '') +
              '<span class="aiw-mem-badge is-scope">' + escapeHtml(formatScopeLabel(m.scope)) + '</span>' +
              '<span class="aiw-mem-badge is-imp">重要度 ' + escapeHtml(String(m.importance || 3)) + '/5</span>' +
              (confPct ? '<span class="aiw-mem-badge is-conf">置信 ' + escapeHtml(confPct) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="aiw-mem-content">' + escapeHtml(m.content) + '</div>' +
          (prevHint ? '<div class="aiw-mem-meta" style="margin-top:4px;"><span class="aiw-mem-source">' + escapeHtml(prevHint) + '</span></div>' : '') +
          '<div class="aiw-mem-meta">' +
            '<span class="aiw-mem-source">' + escapeHtml(sourceLabel) + '</span>' +
            (timeLabel ? '<span class="aiw-mem-time">' + escapeHtml(timeLabel) + '</span>' : '') +
          '</div>' +
          '<div class="aiw-mem-actions">' +
            '<button type="button" class="aiw-preset-act" data-mem-act="edit" data-mem-id="' + escapeHtml(m.id) + '"><i class="fa-regular fa-pen-to-square"></i> 编辑</button>' +
            '<button type="button" class="aiw-preset-act is-danger" data-mem-act="delete" data-mem-id="' + escapeHtml(m.id) + '"><i class="fa-regular fa-trash-can"></i> 删除</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  var MEMORY_TASK_STATUS_MAP = {
    pending: '等待中',
    running: '运行中',
    saved: '已保存',
    skipped: '已跳过',
    retry_waiting: '等待重试',
    failed: '失败'
  };

  var MEMORY_TASK_TYPE_MAP = {
    explicit_memory: '明确记住',
    explicit_update: '修改记忆',
    explicit_delete: '遗忘删除',
    extract_memory: '自动提取',
    summarize_chat: '短期摘要'
  };

  var DIAG_STAGE_MAP = {
    no_store: '存储未就绪',
    setting_disabled: '开关已关闭',
    privacy_guard: '敏感信息拦截',
    lightweight_filter: '轻量筛选跳过',
    deduplicate: '重复记忆去重',
    tombstone_guard: '已删除墓碑拦截',
    value_gate: '价值/置信度未达标',
    model_none: '模型判定无需保存',
    runtime_error: '执行异常'
  };

  var DIAG_SOURCE_MAP = {
    llm: '模型提取',
    high_certainty_rule: '高确定性规则',
    'llm+rule': '模型+规则补全',
    none: '无'
  };

  function renderTaskDiagnosticsStepsHtml(diag) {
    if (!diag || typeof diag !== 'object') return '';
    var stageLabel = diag.skipStage ? (DIAG_STAGE_MAP[diag.skipStage] || diag.skipStage) : '';
    var step2Val = stageLabel
      ? (diag.skipReason ? (stageLabel + '：' + diag.skipReason) : stageLabel)
      : '通过';
    var srcLabel = diag.candidateSource && diag.candidateSource !== 'none'
      ? ('（' + (DIAG_SOURCE_MAP[diag.candidateSource] || diag.candidateSource) + '）')
      : '';
    var candCount = diag.modelReturnedCandidates
      ? ((diag.candidateCount || 1) + ' 条' + srcLabel)
      : ((diag.candidateCount || 0) > 0 ? (diag.candidateCount + ' 条' + srcLabel) : '0 条');
    var writeResVal = !diag.dbWriteAttempted
      ? '未写入'
      : (diag.dbWriteSucceeded
          ? ('成功 · ' + (diag.writtenCount || 0) + ' 条' + (Array.isArray(diag.writtenMemoryIds) && diag.writtenMemoryIds.length ? (' (' + diag.writtenMemoryIds.join(', ') + ')') : ''))
          : '写入失败');

    var steps = [
      { idx: 1, label: '进入自动判断', val: diag.enteredAutoJudgment ? '是' : '否', ok: !!diag.enteredAutoJudgment },
      { idx: 2, label: '前置筛选/拦截', val: step2Val, ok: !stageLabel },
      { idx: 3, label: '请求提取模型', val: diag.modelRequested ? '已请求' : '未请求', ok: !!diag.modelRequested },
      { idx: 4, label: '候选结果', val: candCount, ok: !!(diag.modelReturnedCandidates || (diag.candidateCount || 0) > 0) },
      { idx: 5, label: '价值门槛判定', val: diag.passedValueGate ? '通过' : '未通过', ok: !!diag.passedValueGate },
      { idx: 6, label: '尝试写入库', val: diag.dbWriteAttempted ? '已执行' : '未执行', ok: !!diag.dbWriteAttempted },
      { idx: 7, label: '写库结果', val: writeResVal, ok: !!(diag.dbWriteAttempted && diag.dbWriteSucceeded) }
    ];

    return (
      '<div class="aiw-diag-steps">' +
        '<div class="aiw-diag-steps-title">七步诊断详情</div>' +
        '<div class="aiw-diag-step-grid">' +
          steps.map(function(st) {
            return (
              '<div class="aiw-diag-step-row">' +
                '<span class="aiw-diag-step-idx">' + st.idx + '</span>' +
                '<span class="aiw-diag-step-lbl">' + escapeHtml(st.label) + '</span>' +
                '<span class="aiw-diag-step-val' + (st.ok ? ' is-ok' : '') + '">' + escapeHtml(st.val) + '</span>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
      '</div>'
    );
  }

  function renderMemoryTasksHtml(tasks) {
    var list = Array.isArray(tasks) ? tasks : [];
    if (!list.length) {
      return (
        '<div id="aiw-mem-task-section">' +
          '<div class="aiw-mem-empty" id="aiw-mem-task-panel">' +
            '<div class="aiw-mem-empty-icon"><i class="fa-regular fa-rectangle-list"></i></div>' +
            '<div class="aiw-mem-empty-title">暂无记忆写入诊断记录</div>' +
            '<div class="aiw-mem-empty-sub">发送对话并触发记忆提取、明确记住或短期摘要任务后，这里会完整展示任务状态、失败原因与七步诊断详情。</div>' +
          '</div>' +
        '</div>'
      );
    }

    var failedCount = list.filter(function(t) { return t && (t.status === 'failed' || t.status === 'retry_waiting'); }).length;
    var savedCount = list.filter(function(t) { return t && t.status === 'saved'; }).length;

    var rowsHtml = list.map(function(t) {
      var typeLabel = MEMORY_TASK_TYPE_MAP[t.type] || '自动提取';
      var stLabel = MEMORY_TASK_STATUS_MAP[t.status] || t.status || '等待中';
      var timeText = formatMemoryDate(t.createdAt);
      var writtenLabel = t.memoryWritten
        ? ('已写入' + (t.savedMemoryIds && t.savedMemoryIds.length ? (' ' + t.savedMemoryIds.length + ' 条 (' + t.savedMemoryIds.join(', ') + ')') : ''))
        : '未写入';
      var errLine = (t.status === 'failed' || t.status === 'retry_waiting') && t.lastError
        ? ('<div class="aiw-mem-task-err">失败原因：' + escapeHtml(t.lastError) + '</div>')
        : '';
      var summaryLine = t.resultSummary
        ? ('<div class="aiw-mem-task-sub">' + escapeHtml(t.resultSummary) + '</div>')
        : '';
      var diagBlock = renderTaskDiagnosticsStepsHtml(t.diagnostics);

      return (
        '<div class="aiw-mem-task-item is-' + escapeHtml(t.status || 'pending') + '">' +
          '<div class="aiw-mem-task-top">' +
            '<span class="aiw-mem-task-type">' + escapeHtml(typeLabel) + ' · ' + escapeHtml(t.chatTitle || '对话') + '</span>' +
            '<span class="aiw-mem-task-badge is-' + escapeHtml(t.status || 'pending') + '">' + escapeHtml(stLabel) + (t.attempts ? (' · ' + t.attempts + '次') : '') + '</span>' +
          '</div>' +
          '<div class="aiw-mem-task-meta">' +
            '<span>创建时间：' + (timeText ? escapeHtml(timeText) : '刚刚') + '</span>' +
            '<span class="aiw-mem-task-write ' + (t.memoryWritten ? 'is-written' : 'is-unwritten') + '">' + escapeHtml(writtenLabel) + '</span>' +
          '</div>' +
          errLine +
          summaryLine +
          diagBlock +
        '</div>'
      );
    }).join('');

    return (
      '<div id="aiw-mem-task-section">' +
        '<div class="aiw-st-card aiw-st-pad" id="aiw-mem-task-panel">' +
          '<div class="aiw-mem-task-head">' +
            '<span class="aiw-pr-count">共 ' + list.length + ' 条记录 · 已保存 ' + savedCount + ' 条' + (failedCount ? (' · ' + failedCount + ' 条待重试/失败') : '') + '</span>' +
            '<div class="aiw-mem-task-btns">' +
              (failedCount
                ? '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-mem-retry-tasks"><i class="fa-solid fa-rotate-right"></i> 重试失败</button>'
                : '') +
              '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-mem-clear-tasks">清理已完成</button>' +
            '</div>' +
          '</div>' +
          '<div class="aiw-mem-task-list">' + rowsHtml + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function resolveRecentTargetChat() {
    var chats = Array.isArray(_ctx.chats) ? _ctx.chats : [];
    if (!chats.length) return null;
    var targetId = _ctx.recentSelectedChatId || _ctx.activeChatId;
    var found = targetId ? chats.find(function(c) { return c && c.id === targetId; }) : null;
    return found || chats[0];
  }

  function resolveSummaryTargetChat() {
    var chats = Array.isArray(_ctx.chats) ? _ctx.chats : [];
    if (!chats.length) return null;
    var targetId = _ctx.summarySelectedChatId || _ctx.activeChatId;
    var found = targetId ? chats.find(function(c) { return c && c.id === targetId; }) : null;
    return found || chats[0];
  }

  function getRecentSummaryBadgeText() {
    var chat = resolveRecentTargetChat();
    if (!chat) return '暂无对话';
    var msgs = (chat.messages || []).filter(function(m) { return m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim(); });
    var upTo = Math.min(msgs.length, Math.max(0, Number(chat.summaryUpToCount) || 0));
    var unsummarized = Math.max(0, msgs.length - upTo);
    return unsummarized + ' 条近期消息';
  }

  function getShortSummaryEntryBadgeText() {
    var chats = Array.isArray(_ctx.chats) ? _ctx.chats : [];
    if (!chats.length) return '暂无对话';
    var summarizedChats = chats.filter(function(c) { return c && String(c.summary || '').trim(); });
    var target = resolveSummaryTargetChat();
    if (target && String(target.summary || '').trim()) {
      return summarizedChats.length > 1 ? (summarizedChats.length + ' 份摘要') : '已生成';
    }
    if (summarizedChats.length > 0) {
      return summarizedChats.length + ' 份摘要';
    }
    return '暂无摘要';
  }

  function getLongMemoryEntryBadgeText() {
    var list = Array.isArray(_ctx.memories) ? _ctx.memories : [];
    return list.length + ' 条';
  }

  function getDiagnosticsEntryBadgeInfo() {
    var tasks = Array.isArray(_ctx.memoryTasks) ? _ctx.memoryTasks : [];
    if (!tasks.length) return { text: '暂无记录', isWarn: false };
    var failedCount = tasks.filter(function(t) { return t && (t.status === 'failed' || t.status === 'retry_waiting'); }).length;
    if (failedCount > 0) {
      return { text: failedCount + ' 条异常', isWarn: true };
    }
    return { text: tasks.length + ' 条记录', isWarn: false };
  }

  function renderMemoryPageHtml() {
    var ms = _ctx.memorySettings || {};
    var strategyPresets = (S() && S().MEMORY_STRATEGY_PRESETS) || {
      natural: { id: 'natural', label: '自然 · 推荐', desc: '平衡上下文与召回' },
      token_saver: { id: 'token_saver', label: '省 Token', desc: '更早压缩、少条召回' },
      recall_more: { id: 'recall_more', label: '记得更多', desc: '保留更多近期轮数与记忆' }
    };
    var bounds = (S() && S().MEMORY_SETTING_BOUNDS) || {
      summaryTriggerChars: { min: 400, max: 12000, def: 3200 },
      recentRawMessagesLimit: { min: 2, max: 24, def: 6 },
      maxMemoryRecallCount: { min: 1, max: 12, def: 5 },
      maxSingleMemoryLength: { min: 60, max: 500, def: 260 }
    };
    var currentStrategy = ms.strategy || 'natural';
    var diagBadge = getDiagnosticsEntryBadgeInfo();

    var strategyHtml = ['natural', 'token_saver', 'recall_more'].map(function(key) {
      var item = strategyPresets[key] || { id: key, label: key, desc: '' };
      var activeCls = currentStrategy === key ? ' active' : '';
      return (
        '<button type="button" class="aiw-mem-strategy-card' + activeCls + '" data-mem-strategy="' + escapeHtml(key) + '">' +
          '<div class="aiw-mem-strategy-title">' + escapeHtml(item.label) + '</div>' +
          '<div class="aiw-mem-strategy-desc">' + escapeHtml(item.desc) + '</div>' +
        '</button>'
      );
    }).join('');

    return (
      '<div class="aiw-st-topbar">' +
        '<button type="button" class="aiw-circle-btn" id="aiw-st-sub-back" aria-label="返回设置">' +
          '<i class="fa-solid fa-arrow-left"></i>' +
        '</button>' +
        '<div class="aiw-st-topbar-title">记忆</div>' +
        '<div class="aiw-st-topbar-spacer"></div>' +
      '</div>' +

      '<div class="aiw-st-scroll">' +
        '<div class="aiw-st-group-title">基础记忆开关</div>' +
        '<div class="aiw-st-card">' +
          '<div class="aiw-st-row aiw-st-row-static">' +
            '<div class="aiw-st-row-col">' +
              '<div class="aiw-st-row-label">短期上下文</div>' +
              '<div class="aiw-st-row-desc">保留当前对话近期原始消息，超长后自动生成阶段性摘要</div>' +
            '</div>' +
            '<label class="aiw-switch">' +
              '<input type="checkbox" id="aiw-mem-short-toggle"' + (ms.shortTermContext !== false ? ' checked' : '') + '>' +
              '<span class="aiw-switch-track"></span>' +
            '</label>' +
          '</div>' +
          '<div class="aiw-st-row aiw-st-row-static">' +
            '<div class="aiw-st-row-col">' +
              '<div class="aiw-st-row-label">跨窗口记忆</div>' +
              '<div class="aiw-st-row-desc">新建或切换对话时允许跨窗口共享用户级长期记忆</div>' +
            '</div>' +
            '<label class="aiw-switch">' +
              '<input type="checkbox" id="aiw-mem-cross-toggle"' + (ms.crossChatMemory !== false ? ' checked' : '') + '>' +
              '<span class="aiw-switch-track"></span>' +
            '</label>' +
          '</div>' +
          '<div class="aiw-st-row aiw-st-row-static">' +
            '<div class="aiw-st-row-col">' +
              '<div class="aiw-st-row-label">使用长期记忆</div>' +
              '<div class="aiw-st-row-desc">回答时自动检索长期记忆，并响应「帮我记住」等明确指令</div>' +
            '</div>' +
            '<label class="aiw-switch">' +
              '<input type="checkbox" id="aiw-mem-use-toggle"' + (ms.useMemory !== false ? ' checked' : '') + '>' +
              '<span class="aiw-switch-track"></span>' +
            '</label>' +
          '</div>' +
          '<div class="aiw-st-row aiw-st-row-static">' +
            '<div class="aiw-st-row-col">' +
              '<div class="aiw-st-row-label">自动记忆</div>' +
              '<div class="aiw-st-row-desc">普通聊天中自动识别偏好、习惯、计划与项目（绝不保存密钥）</div>' +
            '</div>' +
            '<label class="aiw-switch">' +
              '<input type="checkbox" id="aiw-mem-auto-toggle"' + (ms.autoMemory !== false ? ' checked' : '') + '>' +
              '<span class="aiw-switch-track"></span>' +
            '</label>' +
          '</div>' +
          '<div class="aiw-st-row aiw-st-row-static">' +
            '<div class="aiw-st-row-col">' +
              '<div class="aiw-st-row-label">参考历史聊天</div>' +
              '<div class="aiw-st-row-desc">检索其他聊天窗口的近期片段与摘要（独立于永久长期记忆库）</div>' +
            '</div>' +
            '<label class="aiw-switch">' +
              '<input type="checkbox" id="aiw-mem-ref-history-toggle"' + (ms.referenceHistoryChats !== false ? ' checked' : '') + '>' +
              '<span class="aiw-switch-track"></span>' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<div class="aiw-st-group-title" style="margin-top:16px;">记忆策略</div>' +
        '<div class="aiw-mem-strategy-grid">' + strategyHtml + '</div>' +

        '<div class="aiw-st-card" style="margin-top:12px;">' +
          '<button type="button" class="aiw-st-row" id="aiw-mem-adv-toggle">' +
            '<span class="aiw-st-row-icon"><i class="fa-solid fa-sliders"></i></span>' +
            '<div class="aiw-st-row-col">' +
              '<div class="aiw-st-row-label">高级设置</div>' +
              '<div class="aiw-st-row-desc">摘要阈值 ' + escapeHtml(String(ms.summaryTriggerChars || 3200)) + ' 字 · 近期 ' + escapeHtml(String(ms.recentRawMessagesLimit || 6)) + ' 条 · 召回 ' + escapeHtml(String(ms.maxMemoryRecallCount || 5)) + ' 条</div>' +
            '</div>' +
            '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-' + (_ctx.advancedMemoryOpen ? 'up' : 'down') + '"></i></span>' +
          '</button>' +
          '<div class="aiw-mem-adv-body" id="aiw-mem-adv-body"' + (_ctx.advancedMemoryOpen ? '' : ' hidden') + '>' +
            '<div class="aiw-mem-adv-grid">' +
              '<div class="aiw-mem-adv-field">' +
                '<label class="aiw-field-label" for="aiw-adv-trigger-chars">触发摘要字符阈值 (' + bounds.summaryTriggerChars.min + '-' + bounds.summaryTriggerChars.max + ')</label>' +
                '<input type="number" class="aiw-field-input" id="aiw-adv-trigger-chars" min="' + bounds.summaryTriggerChars.min + '" max="' + bounds.summaryTriggerChars.max + '" value="' + escapeHtml(String(ms.summaryTriggerChars || bounds.summaryTriggerChars.def)) + '">' +
              '</div>' +
              '<div class="aiw-mem-adv-field">' +
                '<label class="aiw-field-label" for="aiw-adv-recent-limit">近期原始消息条数 (' + bounds.recentRawMessagesLimit.min + '-' + bounds.recentRawMessagesLimit.max + ')</label>' +
                '<input type="number" class="aiw-field-input" id="aiw-adv-recent-limit" min="' + bounds.recentRawMessagesLimit.min + '" max="' + bounds.recentRawMessagesLimit.max + '" value="' + escapeHtml(String(ms.recentRawMessagesLimit || bounds.recentRawMessagesLimit.def)) + '">' +
              '</div>' +
              '<div class="aiw-mem-adv-field">' +
                '<label class="aiw-field-label" for="aiw-adv-recall-count">单次最多召回记忆 (' + bounds.maxMemoryRecallCount.min + '-' + bounds.maxMemoryRecallCount.max + ')</label>' +
                '<input type="number" class="aiw-field-input" id="aiw-adv-recall-count" min="' + bounds.maxMemoryRecallCount.min + '" max="' + bounds.maxMemoryRecallCount.max + '" value="' + escapeHtml(String(ms.maxMemoryRecallCount || bounds.maxMemoryRecallCount.def)) + '">' +
              '</div>' +
              '<div class="aiw-mem-adv-field">' +
                '<label class="aiw-field-label" for="aiw-adv-mem-len">单条记忆最大字符 (' + bounds.maxSingleMemoryLength.min + '-' + bounds.maxSingleMemoryLength.max + ')</label>' +
                '<input type="number" class="aiw-field-input" id="aiw-adv-mem-len" min="' + bounds.maxSingleMemoryLength.min + '" max="' + bounds.maxSingleMemoryLength.max + '" value="' + escapeHtml(String(ms.maxSingleMemoryLength || bounds.maxSingleMemoryLength.def)) + '">' +
              '</div>' +
            '</div>' +
            '<div class="aiw-mem-adv-actions">' +
              '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-mem-adv-reset">恢复默认设置</button>' +
              '<button type="button" class="aiw-st-btn-primary aiw-st-btn-sm" id="aiw-mem-adv-save">保存高级参数</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="aiw-st-group-title" style="margin-top:18px;">记忆管理</div>' +
        '<div class="aiw-mem-entry-list">' +
          '<div class="aiw-st-card aiw-mem-entry-card">' +
            '<button type="button" class="aiw-st-row" id="aiw-mem-open-recent">' +
              '<span class="aiw-st-row-icon"><i class="fa-regular fa-comments"></i></span>' +
              '<div class="aiw-st-row-col">' +
                '<div class="aiw-st-row-label">近期记忆</div>' +
                '<div class="aiw-st-row-desc">查看当前对话保留的近期原始消息</div>' +
              '</div>' +
              '<span class="aiw-st-row-val" id="aiw-mem-badge-recent">' + escapeHtml(getRecentSummaryBadgeText()) + '</span>' +
              '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-right"></i></span>' +
            '</button>' +
          '</div>' +

          '<div class="aiw-st-card aiw-mem-entry-card">' +
            '<button type="button" class="aiw-st-row" id="aiw-mem-open-summary">' +
              '<span class="aiw-st-row-icon"><i class="fa-regular fa-file-lines"></i></span>' +
              '<div class="aiw-st-row-col">' +
                '<div class="aiw-st-row-label">短期摘要</div>' +
                '<div class="aiw-st-row-desc">查看各对话的阶段性摘要与压缩进度</div>' +
              '</div>' +
              '<span class="aiw-st-row-val" id="aiw-mem-badge-summary">' + escapeHtml(getShortSummaryEntryBadgeText()) + '</span>' +
              '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-right"></i></span>' +
            '</button>' +
          '</div>' +

          '<div class="aiw-st-card aiw-mem-entry-card">' +
            '<button type="button" class="aiw-st-row" id="aiw-mem-open-long">' +
              '<span class="aiw-st-row-icon"><i class="fa-regular fa-bookmark"></i></span>' +
              '<div class="aiw-st-row-col">' +
                '<div class="aiw-st-row-label">长期记忆</div>' +
                '<div class="aiw-st-row-desc">查看、搜索与管理永久保存的长期记忆</div>' +
              '</div>' +
              '<span class="aiw-st-row-val" id="aiw-mem-badge-long">' + escapeHtml(getLongMemoryEntryBadgeText()) + '</span>' +
              '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-right"></i></span>' +
            '</button>' +
          '</div>' +

          '<div class="aiw-st-card aiw-mem-entry-card">' +
            '<button type="button" class="aiw-st-row" id="aiw-mem-open-diag">' +
              '<span class="aiw-st-row-icon"><i class="fa-regular fa-rectangle-list"></i></span>' +
              '<div class="aiw-st-row-col">' +
                '<div class="aiw-st-row-label">记忆诊断</div>' +
                '<div class="aiw-st-row-desc">查看记忆写入与摘要任务的七步诊断记录</div>' +
              '</div>' +
              '<span class="aiw-st-row-val' + (diagBadge.isWarn ? ' is-warn' : '') + '" id="aiw-mem-badge-diag">' + escapeHtml(diagBadge.text) + '</span>' +
              '<span class="aiw-st-row-arrow"><i class="fa-solid fa-angle-right"></i></span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderRecentMemoryHtml() {
    var ms = _ctx.memorySettings || {};
    var chats = Array.isArray(_ctx.chats) ? _ctx.chats : [];
    var targetChat = resolveRecentTargetChat();
    var limit = Math.max(2, Number(ms.recentRawMessagesLimit) || 6);
    var cleanMsgs = targetChat && Array.isArray(targetChat.messages)
      ? targetChat.messages.filter(function(m) { return m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim(); })
      : [];
    var summaryUpTo = targetChat ? Math.min(cleanMsgs.length, Math.max(0, Number(targetChat.summaryUpToCount) || 0)) : 0;
    var unsummarized = cleanMsgs.slice(summaryUpTo);
    var activeStartIdx = Math.max(0, unsummarized.length - limit);

    var selectorHtml = chats.length
      ? (
        '<div class="aiw-st-card aiw-st-pad" style="margin-top:12px;">' +
          '<label class="aiw-field-label" for="aiw-rm-chat-select">当前聊天</label>' +
          '<select class="aiw-api-select" id="aiw-rm-chat-select">' +
            chats.map(function(c) {
              var selected = targetChat && c.id === targetChat.id ? ' selected' : '';
              return '<option value="' + escapeHtml(c.id) + '"' + selected + '>' + escapeHtml(c.title || '新对话') + ' (' + ((c.messages || []).length) + ' 条)</option>';
            }).join('') +
          '</select>' +
        '</div>'
      )
      : '';

    var overviewBodyHtml = !targetChat
      ? '<div class="aiw-mem-task-empty">当前还没有历史对话记录。发起对话后，近期消息将在这里展示。</div>'
      : (
        '<div class="aiw-rm-stats-row is-compact">' +
          '<div class="aiw-rm-stat"><span class="aiw-rm-stat-num">' + unsummarized.length + '</span><span class="aiw-rm-stat-lbl">最近消息数量</span></div>' +
          '<div class="aiw-rm-stat"><span class="aiw-rm-stat-num">' + Math.min(limit, unsummarized.length) + ' / ' + limit + '</span><span class="aiw-rm-stat-lbl">保留原文窗口</span></div>' +
          '<div class="aiw-rm-stat"><span class="aiw-rm-stat-num">' + cleanMsgs.length + '</span><span class="aiw-rm-stat-lbl">当前对话总消息</span></div>' +
        '</div>'
      );

    var messagesHtml = !unsummarized.length
      ? '<div class="aiw-mem-empty"><div class="aiw-mem-empty-title">暂无近期消息</div><div class="aiw-mem-empty-sub">在对话中发送消息后，这里会展示短期上下文保留的近期对话内容。</div></div>'
      : unsummarized.slice().reverse().map(function(m, revIdx) {
          var origIdx = unsummarized.length - 1 - revIdx;
          var inWindow = origIdx >= activeStartIdx;
          var roleText = m.role === 'user' ? '用户' : '知屿';
          var timeText = formatMemoryDate(m.createdAt);
          return (
            '<div class="aiw-mem-card aiw-rm-msg-card">' +
              '<div class="aiw-mem-card-top">' +
                '<div class="aiw-mem-badges">' +
                  '<span class="aiw-mem-badge ' + (m.role === 'user' ? 'is-cat' : 'is-scope') + '">' + roleText + '</span>' +
                  '<span class="aiw-mem-badge ' + (inWindow ? 'is-active-win' : '') + '">' + (inWindow ? '将直接注入近期上下文' : '待下次摘要压缩') + '</span>' +
                '</div>' +
                (timeText ? '<span class="aiw-mem-time">' + escapeHtml(timeText) + '</span>' : '') +
              '</div>' +
              '<div class="aiw-mem-content">' + escapeHtml(String(m.content || '').slice(0, 600)) + '</div>' +
              '<div class="aiw-mem-meta"><span class="aiw-mem-source">所属聊天：' + escapeHtml((targetChat && targetChat.title) || '新对话') + '</span></div>' +
            '</div>'
          );
        }).join('');

    return (
      '<div class="aiw-st-topbar">' +
        '<button type="button" class="aiw-circle-btn" id="aiw-st-sub-back" aria-label="返回记忆设置">' +
          '<i class="fa-solid fa-arrow-left"></i>' +
        '</button>' +
        '<div class="aiw-st-topbar-title">近期记忆</div>' +
        '<div class="aiw-st-topbar-spacer"></div>' +
      '</div>' +

      '<div class="aiw-st-scroll">' +
        '<div class="aiw-rm-notice">' +
          '<i class="fa-solid fa-circle-info"></i>' +
          '<span>近期记忆仅展示当前对话保留的近期原始消息，不会自动沉淀为跨窗口永久长期记忆；阶段性摘要请在「短期摘要」中查看。</span>' +
        '</div>' +

        '<div class="aiw-st-card">' +
          '<div class="aiw-st-row aiw-st-row-static">' +
            '<div class="aiw-st-row-col">' +
              '<div class="aiw-st-row-label">启用短期上下文</div>' +
              '<div class="aiw-st-row-desc">同步控制当前对话是否携带近期原始消息作为上下文</div>' +
            '</div>' +
            '<label class="aiw-switch">' +
              '<input type="checkbox" id="aiw-rm-short-toggle"' + (ms.shortTermContext !== false ? ' checked' : '') + '>' +
              '<span class="aiw-switch-track"></span>' +
            '</label>' +
          '</div>' +
        '</div>' +

        selectorHtml +

        '<div class="aiw-st-group-title" style="margin-top:16px;">近期消息概览' + (targetChat ? (' · ' + escapeHtml(targetChat.title || '新对话')) : '') + '</div>' +
        '<div class="aiw-st-card aiw-st-pad">' + overviewBodyHtml + '</div>' +

        '<div class="aiw-st-group-title" style="margin-top:16px;">近期消息明细</div>' +
        '<div class="aiw-mem-list">' + messagesHtml + '</div>' +
      '</div>'
    );
  }

  function bindRecentMemoryEvents(layer) {
    var shortToggle = layer.querySelector('#aiw-rm-short-toggle');
    if (shortToggle) {
      shortToggle.addEventListener('change', async function() {
        _ctx.memorySettings = await S().saveMemorySettings({ shortTermContext: shortToggle.checked });
        notifyWorkspaceStateChanged();
        notifyToast(shortToggle.checked ? '已开启短期上下文' : '已关闭短期上下文');
      });
    }

    var chatSelect = layer.querySelector('#aiw-rm-chat-select');
    if (chatSelect) {
      chatSelect.addEventListener('change', function() {
        _ctx.recentSelectedChatId = chatSelect.value;
        renderCurrentView();
      });
    }
  }

  // ===== 视图 7B：短期摘要独立页面 =====
  function renderShortSummaryHtml() {
    var ms = _ctx.memorySettings || {};
    var chats = Array.isArray(_ctx.chats) ? _ctx.chats : [];
    var targetChat = resolveSummaryTargetChat();
    var cleanMsgs = targetChat && Array.isArray(targetChat.messages)
      ? targetChat.messages.filter(function(m) { return m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim(); })
      : [];
    var summaryUpTo = targetChat ? Math.min(cleanMsgs.length, Math.max(0, Number(targetChat.summaryUpToCount) || 0)) : 0;
    var unsummarizedCount = Math.max(0, cleanMsgs.length - summaryUpTo);
    var summaryText = targetChat ? String(targetChat.summary || '').trim() : '';
    var summaryTime = targetChat && targetChat.summaryUpdatedAt ? formatMemoryDate(targetChat.summaryUpdatedAt) : '';

    var chatSummaryTasks = targetChat
      ? (Array.isArray(_ctx.memoryTasks) ? _ctx.memoryTasks : []).filter(function(t) {
          return t && t.type === 'summarize_chat' && t.chatId === targetChat.id;
        })
      : [];
    var latestTask = chatSummaryTasks[0] || null;
    var taskStatusText = latestTask
      ? (MEMORY_TASK_STATUS_MAP[latestTask.status] || latestTask.status || '等待中')
      : (summaryText ? '已完成' : '未触发');
    var taskStatusCls = latestTask ? ('is-' + (latestTask.status || 'pending')) : (summaryText ? 'is-saved' : 'is-idle');

    var selectorHtml = chats.length
      ? (
        '<div class="aiw-st-card aiw-st-pad">' +
          '<label class="aiw-field-label" for="aiw-ss-chat-select">切换聊天查看摘要</label>' +
          '<select class="aiw-api-select" id="aiw-ss-chat-select">' +
            chats.map(function(c) {
              var selected = targetChat && c.id === targetChat.id ? ' selected' : '';
              var hasSum = !!(c && String(c.summary || '').trim());
              return '<option value="' + escapeHtml(c.id) + '"' + selected + '>' + escapeHtml(c.title || '新对话') + (hasSum ? '（已有摘要）' : '（暂无摘要）') + '</option>';
            }).join('') +
          '</select>' +
        '</div>'
      )
      : '';

    var mainBodyHtml = '';
    if (!targetChat) {
      mainBodyHtml = (
        '<div class="aiw-mem-empty" style="margin-top:12px;">' +
          '<div class="aiw-mem-empty-icon"><i class="fa-regular fa-file-lines"></i></div>' +
          '<div class="aiw-mem-empty-title">暂无可查看的对话</div>' +
          '<div class="aiw-mem-empty-sub">创建对话并发送消息后，达到摘要条件时系统会自动生成该对话的阶段性摘要。</div>' +
        '</div>'
      );
    } else {
      var summarizedRangeText = summaryUpTo > 0 ? ('第 1–' + summaryUpTo + ' 条') : '0 条';
      var summaryContentHtml = summaryText
        ? (
          '<div class="aiw-rm-summary-box">' +
            '<div class="aiw-rm-summary-head">' +
              '<span>阶段性摘要内容</span>' +
              '<span>' + (summaryTime ? ('生成于 ' + escapeHtml(summaryTime)) : '暂无时间记录') + '</span>' +
            '</div>' +
            '<div class="aiw-rm-summary-text">' + escapeHtml(summaryText) + '</div>' +
            '<div class="aiw-ss-meta-row">' +
              '<span>已摘要范围：' + escapeHtml(summarizedRangeText) + '（共 ' + summaryUpTo + ' 条）</span>' +
              '<span>尚未摘要：' + unsummarizedCount + ' 条</span>' +
            '</div>' +
          '</div>'
        )
        : (
          '<div class="aiw-mem-empty aiw-ss-empty-inner">' +
            '<div class="aiw-mem-empty-icon"><i class="fa-regular fa-file-lines"></i></div>' +
            '<div class="aiw-mem-empty-title">当前对话暂无短期摘要</div>' +
            '<div class="aiw-mem-empty-sub">当前对话尚未触发阶段性摘要（当累计内容超过 ' + escapeHtml(String(ms.summaryTriggerChars || 3200)) + ' 字或超出近期保留窗口时会自动生成）。</div>' +
          '</div>'
        );

      var taskHistoryHtml = chatSummaryTasks.length
        ? (
          '<div class="aiw-st-group-title" style="margin-top:16px;">该对话的摘要任务状态</div>' +
          '<div class="aiw-st-card aiw-st-pad">' +
            '<div class="aiw-mem-task-list">' +
              chatSummaryTasks.slice(0, 6).map(function(t) {
                var stText = MEMORY_TASK_STATUS_MAP[t.status] || t.status || '等待中';
                var tTime = formatMemoryDate(t.updatedAt || t.createdAt);
                return (
                  '<div class="aiw-mem-task-item is-' + escapeHtml(t.status || 'pending') + '">' +
                    '<div class="aiw-mem-task-top">' +
                      '<span class="aiw-mem-task-type">短期摘要任务' + (t.attempts ? (' · 第 ' + t.attempts + ' 次') : '') + '</span>' +
                      '<span class="aiw-mem-task-badge is-' + escapeHtml(t.status || 'pending') + '">' + escapeHtml(stText) + '</span>' +
                    '</div>' +
                    '<div class="aiw-mem-task-meta">' +
                      '<span>' + (tTime ? escapeHtml(tTime) : '刚刚') + '</span>' +
                      '<span>' + escapeHtml(t.resultSummary || (t.status === 'saved' ? '摘要已更新' : '等待执行')) + '</span>' +
                    '</div>' +
                    ((t.status === 'failed' || t.status === 'retry_waiting') && t.lastError
                      ? '<div class="aiw-mem-task-err">失败原因：' + escapeHtml(t.lastError) + '</div>'
                      : '') +
                  '</div>'
                );
              }).join('') +
            '</div>' +
          '</div>'
        )
        : '';

      mainBodyHtml = (
        '<div class="aiw-st-group-title" style="margin-top:16px;">摘要状态概览 · ' + escapeHtml(targetChat.title || '新对话') + '</div>' +
        '<div class="aiw-st-card aiw-st-pad">' +
          '<div class="aiw-rm-stats-row">' +
            '<div class="aiw-rm-stat"><span class="aiw-rm-stat-num">' + escapeHtml(summarizedRangeText) + '</span><span class="aiw-rm-stat-lbl">已摘要范围/条数</span></div>' +
            '<div class="aiw-rm-stat"><span class="aiw-rm-stat-num">' + unsummarizedCount + ' 条</span><span class="aiw-rm-stat-lbl">尚未摘要消息</span></div>' +
            '<div class="aiw-rm-stat"><span class="aiw-ss-status-pill ' + escapeHtml(taskStatusCls) + '">' + escapeHtml(taskStatusText) + '</span><span class="aiw-rm-stat-lbl">摘要任务状态</span></div>' +
          '</div>' +
          '<div class="aiw-ss-info-line">' +
            '<span>摘要生成时间</span>' +
            '<span>' + (summaryTime ? escapeHtml(summaryTime) : '尚未生成') + '</span>' +
          '</div>' +
        '</div>' +

        '<div class="aiw-st-group-title" style="margin-top:16px;">阶段性摘要</div>' +
        '<div class="aiw-st-card aiw-st-pad">' + summaryContentHtml + '</div>' +
        taskHistoryHtml
      );
    }

    return (
      '<div class="aiw-st-topbar">' +
        '<button type="button" class="aiw-circle-btn" id="aiw-st-sub-back" aria-label="返回记忆设置">' +
          '<i class="fa-solid fa-arrow-left"></i>' +
        '</button>' +
        '<div class="aiw-st-topbar-title">短期摘要</div>' +
        '<div class="aiw-st-topbar-spacer"></div>' +
      '</div>' +

      '<div class="aiw-st-scroll">' +
        selectorHtml +
        mainBodyHtml +
      '</div>'
    );
  }

  function bindShortSummaryEvents(layer) {
    var chatSelect = layer.querySelector('#aiw-ss-chat-select');
    if (chatSelect) {
      chatSelect.addEventListener('change', function() {
        _ctx.summarySelectedChatId = chatSelect.value;
        renderCurrentView();
      });
    }
  }

  // ===== 视图 7C：长期记忆独立页面 =====
  function renderLongMemoryHtml() {
    var allList = _ctx.memories || [];
    var filtered = getFilteredMemories();

    return (
      '<div class="aiw-st-topbar">' +
        '<button type="button" class="aiw-circle-btn" id="aiw-st-sub-back" aria-label="返回记忆设置">' +
          '<i class="fa-solid fa-arrow-left"></i>' +
        '</button>' +
        '<div class="aiw-st-topbar-title">长期记忆</div>' +
        '<button type="button" class="aiw-st-top-action" id="aiw-mem-add-btn"><i class="fa-solid fa-plus"></i> 新增</button>' +
      '</div>' +

      '<div class="aiw-st-scroll">' +
        '<div class="aiw-mem-toolbar is-top">' +
          '<div class="aiw-mem-search-wrap">' +
            '<i class="fa-solid fa-magnifying-glass"></i>' +
            '<input type="search" class="aiw-mem-search-input" id="aiw-mem-search" value="' + escapeHtml(_ctx.memorySearchQuery || '') + '" placeholder="搜索长期记忆内容、分类或来源对话">' +
          '</div>' +
        '</div>' +

        '<div class="aiw-mem-count-bar">' +
          '<span class="aiw-pr-count" id="aiw-mem-count-text">共 ' + allList.length + ' 条长期记忆' + (_ctx.memorySearchQuery ? ('（筛选出 ' + filtered.length + ' 条）') : '') + '</span>' +
          '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm aiw-btn-text-danger" id="aiw-mem-clear-all"' + (allList.length ? '' : ' disabled') + '>' +
            '<i class="fa-regular fa-trash-can"></i> 清空全部' +
          '</button>' +
        '</div>' +

        '<div class="aiw-mem-list" id="aiw-mem-list">' + renderMemoryCardsHtml(filtered) + '</div>' +
      '</div>'
    );
  }

  function bindLongMemoryEvents(layer) {
    var searchInput = layer.querySelector('#aiw-mem-search');
    var addBtn = layer.querySelector('#aiw-mem-add-btn');
    var clearAllBtn = layer.querySelector('#aiw-mem-clear-all');

    if (searchInput) {
      searchInput.addEventListener('input', function() {
        _ctx.memorySearchQuery = searchInput.value || '';
        var filtered = getFilteredMemories();
        var listEl = layer.querySelector('#aiw-mem-list');
        var countEl = layer.querySelector('#aiw-mem-count-text');
        if (listEl) listEl.innerHTML = renderMemoryCardsHtml(filtered);
        if (countEl) {
          countEl.textContent = '共 ' + (_ctx.memories || []).length + ' 条长期记忆' + (_ctx.memorySearchQuery ? ('（筛选出 ' + filtered.length + ' 条）') : '');
        }
        bindMemoryListItemEvents(layer);
      });
    }

    if (addBtn) {
      addBtn.addEventListener('click', function() {
        openMemoryEditorModal(layer, null);
      });
    }

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', function() {
        if (!(_ctx.memories || []).length) return;
        showConfirmModal(
          '清空全部长期记忆',
          '确定要清空知屿保存的全部 ' + _ctx.memories.length + ' 条长期记忆吗？此操作不可恢复。',
          '确认清空',
          true,
          async function() {
            await S().clearAllMemories();
            _ctx.memories = [];
            _ctx.memorySearchQuery = '';
            notifyWorkspaceStateChanged();
            renderCurrentView();
            notifyToast('已清空全部长期记忆');
          }
        );
      });
    }

    bindMemoryListItemEvents(layer);
  }

  // ===== 视图 7D：记忆诊断独立页面 =====
  function renderMemoryDiagnosticsHtml() {
    return (
      '<div class="aiw-st-topbar">' +
        '<button type="button" class="aiw-circle-btn" id="aiw-st-sub-back" aria-label="返回记忆设置">' +
          '<i class="fa-solid fa-arrow-left"></i>' +
        '</button>' +
        '<div class="aiw-st-topbar-title">记忆诊断</div>' +
        '<div class="aiw-st-topbar-spacer"></div>' +
      '</div>' +

      '<div class="aiw-st-scroll">' +
        '<div class="aiw-rm-notice">' +
          '<i class="fa-solid fa-circle-info"></i>' +
          '<span>此处记录自动提取、明确记住、修改删除及短期摘要任务的真实执行状态、失败原因与七步诊断详情，支持对失败任务发起重试。</span>' +
        '</div>' +
        renderMemoryTasksHtml(_ctx.memoryTasks) +
      '</div>'
    );
  }

  function bindMemoryDiagnosticsEvents(layer) {
    bindMemoryTaskActions(layer);
  }

  function openMemoryEditorModal(layer, existingMem) {
    var isEdit = !!(existingMem && existingMem.id);
    var categories = (S() && S().MEMORY_CATEGORIES) || ['偏好', '习惯', '长期计划', '项目', '决定', '备忘', '身份信息'];
    var draftCat = (existingMem && existingMem.category) || '偏好';
    var draftScope = (existingMem && existingMem.scope) || 'user';
    var draftImp = (existingMem && existingMem.importance) || 3;
    var maxSingleLen = (_ctx.memorySettings && _ctx.memorySettings.maxSingleMemoryLength) || 260;

    var catChips = categories.map(function(cat) {
      return '<button type="button" class="aiw-chip-btn' + (cat === draftCat ? ' active' : '') + '" data-mem-cat="' + escapeHtml(cat) + '">' + escapeHtml(cat) + '</button>';
    }).join('');

    var scopeChoices = [
      { id: 'user', label: '跨窗口共享' },
      { id: 'chat', label: '仅当前对话' }
    ];
    if (draftScope === 'project') {
      scopeChoices.push({ id: 'project', label: '项目记忆' });
    }
    var scopeSegs = scopeChoices.map(function(sc) {
      return '<button type="button" class="aiw-seg-btn' + (sc.id === draftScope ? ' active' : '') + '" data-mem-scope="' + sc.id + '">' + sc.label + '</button>';
    }).join('');

    var impBtns = [1, 2, 3, 4, 5].map(function(num) {
      return '<button type="button" class="aiw-seg-btn' + (num === draftImp ? ' active' : '') + '" data-mem-imp="' + num + '">' + num + '</button>';
    }).join('');

    var bodyHtml =
      '<label class="aiw-field-label" for="aiw-mem-ed-content">记忆内容 *</label>' +
      '<textarea class="aiw-field-textarea" id="aiw-mem-ed-content" rows="4" maxlength="' + escapeHtml(String(maxSingleLen)) + '" placeholder="例如：用户不喜欢香菜，点外卖或推荐食谱时请避开">' + escapeHtml(existingMem ? existingMem.content : '') + '</textarea>' +
      '<label class="aiw-field-label" style="margin-top:12px;">记忆分类</label>' +
      '<div class="aiw-chip-grid">' + catChips + '</div>' +
      '<label class="aiw-field-label" style="margin-top:12px;">适用范围</label>' +
      '<div class="aiw-seg-control">' + scopeSegs + '</div>' +
      '<label class="aiw-field-label" style="margin-top:12px;">重要程度（1-5）</label>' +
      '<div class="aiw-seg-control">' + impBtns + '</div>';

    var footerHtml =
      '<button type="button" class="aiw-st-btn-secondary" id="aiw-mem-ed-cancel">取消</button>' +
      '<button type="button" class="aiw-st-btn-primary" id="aiw-mem-ed-save">' + (isEdit ? '保存修改' : '添加记忆') + '</button>';

    var modal = showCustomModal(isEdit ? '编辑长期记忆' : '新增长期记忆', bodyHtml, footerHtml);
    if (!modal) return;

    modal.querySelectorAll('[data-mem-cat]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        draftCat = btn.getAttribute('data-mem-cat');
        modal.querySelectorAll('[data-mem-cat]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
      });
    });

    modal.querySelectorAll('[data-mem-scope]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        draftScope = btn.getAttribute('data-mem-scope');
        modal.querySelectorAll('[data-mem-scope]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
      });
    });

    modal.querySelectorAll('[data-mem-imp]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        draftImp = Number(btn.getAttribute('data-mem-imp')) || 3;
        modal.querySelectorAll('[data-mem-imp]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
      });
    });

    modal.querySelector('#aiw-mem-ed-cancel').addEventListener('click', closeModalOverlay);
    modal.querySelector('#aiw-mem-ed-save').addEventListener('click', async function() {
      var content = modal.querySelector('#aiw-mem-ed-content').value.trim();
      if (!content) {
        notifyToast('请输入记忆内容');
        return;
      }
      if (M() && typeof M().containsSensitiveSecret === 'function' && M().containsSensitiveSecret(content)) {
        notifyToast('为了安全，长期记忆不支持保存密码、API Key 或验证码等敏感信息');
        return;
      }
      if (isEdit) {
        await S().updateMemory(existingMem.id, {
          content: content,
          category: draftCat,
          scope: draftScope,
          importance: draftImp
        });
        notifyToast('记忆已更新');
      } else {
        if (typeof S().removeDeletedMemorySignatureByContent === 'function') {
          await S().removeDeletedMemorySignatureByContent(content);
        }
        await S().createMemory({
          content: content,
          category: draftCat,
          scope: draftScope,
          importance: draftImp,
          sourceChatTitle: '手动添加'
        });
        notifyToast('已添加长期记忆');
      }
      _ctx.memories = await S().listMemories();
      closeModalOverlay();
      notifyWorkspaceStateChanged();
      renderCurrentView();
    });
  }

  function bindMemoryListItemEvents(layer) {
    layer.querySelectorAll('[data-mem-act]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var act = btn.getAttribute('data-mem-act');
        var id = btn.getAttribute('data-mem-id');
        var mem = (_ctx.memories || []).find(function(m) { return m.id === id; });
        if (!mem) return;

        if (act === 'edit') {
          openMemoryEditorModal(layer, mem);
        } else if (act === 'delete') {
          showConfirmModal(
            '删除长期记忆',
            '确定要删除这条记忆吗？删除后将立即停止在对话中检索使用。',
            '确认删除',
            true,
            async function() {
              await S().deleteMemory(id);
              _ctx.memories = await S().listMemories();
              notifyWorkspaceStateChanged();
              renderCurrentView();
              notifyToast('记忆已删除');
            }
          );
        }
      });
    });
  }

  function bindMemoryTaskActions(layer) {
    var retryTasksBtn = layer.querySelector('#aiw-mem-retry-tasks');
    var clearTasksBtn = layer.querySelector('#aiw-mem-clear-tasks');

    if (retryTasksBtn) {
      retryTasksBtn.addEventListener('click', async function() {
        if (!M() || typeof M().retryFailedMemoryTasks !== 'function') return;
        retryTasksBtn.disabled = true;
        retryTasksBtn.textContent = '重试中...';
        try {
          var res = await M().retryFailedMemoryTasks(_ctx.effectiveApi);
          _ctx.memories = await S().listMemories();
          _ctx.memoryTasks = await S().listMemoryTasks();
          _ctx.chats = typeof S().listChats === 'function' ? await S().listChats() : _ctx.chats;
          notifyWorkspaceStateChanged();
          renderCurrentView();
          var savedTotal = (res.addedCount || 0) + (res.updatedCount || 0);
          if (res.failedTasks && res.failedTasks.length) {
            notifyToast('仍有 ' + res.failedTasks.length + ' 条任务失败，请检查 API 配置或网络');
          } else {
            notifyToast(savedTotal ? ('重试成功，已写入 ' + savedTotal + ' 条记忆') : '失败任务已重试完成');
          }
        } catch (err) {
          notifyToast((err && err.message) || '重试失败');
          renderCurrentView();
        }
      });
    }

    if (clearTasksBtn) {
      clearTasksBtn.addEventListener('click', async function() {
        if (typeof S().clearFinishedMemoryTasks === 'function') {
          _ctx.memoryTasks = await S().clearFinishedMemoryTasks();
          renderCurrentView();
          notifyToast('已清理已完成记录');
        }
      });
    }
  }

  function bindMemoryPageEvents(layer) {
    var openRecentBtn = layer.querySelector('#aiw-mem-open-recent');
    var openSummaryBtn = layer.querySelector('#aiw-mem-open-summary');
    var openLongBtn = layer.querySelector('#aiw-mem-open-long');
    var openDiagBtn = layer.querySelector('#aiw-mem-open-diag');
    var shortToggle = layer.querySelector('#aiw-mem-short-toggle');
    var crossToggle = layer.querySelector('#aiw-mem-cross-toggle');
    var useToggle = layer.querySelector('#aiw-mem-use-toggle');
    var autoToggle = layer.querySelector('#aiw-mem-auto-toggle');
    var refHistoryToggle = layer.querySelector('#aiw-mem-ref-history-toggle');
    var advToggle = layer.querySelector('#aiw-mem-adv-toggle');
    var advSaveBtn = layer.querySelector('#aiw-mem-adv-save');
    var advResetBtn = layer.querySelector('#aiw-mem-adv-reset');

    if (openRecentBtn) {
      openRecentBtn.addEventListener('click', function() {
        pushView('recent-memory');
      });
    }

    if (openSummaryBtn) {
      openSummaryBtn.addEventListener('click', function() {
        pushView('short-summary');
      });
    }

    if (openLongBtn) {
      openLongBtn.addEventListener('click', function() {
        pushView('long-memory');
      });
    }

    if (openDiagBtn) {
      openDiagBtn.addEventListener('click', function() {
        pushView('memory-diagnostics');
      });
    }

    if (shortToggle) {
      shortToggle.addEventListener('change', async function() {
        _ctx.memorySettings = await S().saveMemorySettings({ shortTermContext: shortToggle.checked });
        notifyWorkspaceStateChanged();
        notifyToast(shortToggle.checked ? '已开启短期上下文' : '已关闭短期上下文');
      });
    }

    if (crossToggle) {
      crossToggle.addEventListener('change', async function() {
        _ctx.memorySettings = await S().saveMemorySettings({ crossChatMemory: crossToggle.checked });
        notifyWorkspaceStateChanged();
        notifyToast(crossToggle.checked ? '已开启跨窗口记忆' : '已关闭跨窗口记忆');
      });
    }

    if (useToggle) {
      useToggle.addEventListener('change', async function() {
        _ctx.memorySettings = await S().saveMemorySettings({ useMemory: useToggle.checked });
        notifyWorkspaceStateChanged();
        notifyToast(useToggle.checked ? '已开启长期记忆' : '已关闭长期记忆');
      });
    }

    if (autoToggle) {
      autoToggle.addEventListener('change', async function() {
        _ctx.memorySettings = await S().saveMemorySettings({ autoMemory: autoToggle.checked });
        notifyWorkspaceStateChanged();
        notifyToast(autoToggle.checked ? '已开启自动记忆提取' : '已关闭自动记忆提取');
      });
    }

    if (refHistoryToggle) {
      refHistoryToggle.addEventListener('change', async function() {
        _ctx.memorySettings = await S().saveMemorySettings({ referenceHistoryChats: refHistoryToggle.checked });
        notifyWorkspaceStateChanged();
        notifyToast(refHistoryToggle.checked ? '已开启参考历史聊天' : '已关闭参考历史聊天');
      });
    }

    layer.querySelectorAll('[data-mem-strategy]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var stId = btn.getAttribute('data-mem-strategy');
        if (typeof S().applyMemoryStrategy === 'function') {
          _ctx.memorySettings = await S().applyMemoryStrategy(stId);
        } else {
          _ctx.memorySettings = await S().saveMemorySettings({ strategy: stId });
        }
        notifyWorkspaceStateChanged();
        renderCurrentView();
        var presets = S().MEMORY_STRATEGY_PRESETS || {};
        notifyToast('已切换策略：' + ((presets[stId] && presets[stId].label) || stId));
      });
    });

    if (advToggle) {
      advToggle.addEventListener('click', function() {
        _ctx.advancedMemoryOpen = !_ctx.advancedMemoryOpen;
        var body = layer.querySelector('#aiw-mem-adv-body');
        var arrowIcon = advToggle.querySelector('.aiw-st-row-arrow i');
        if (body) body.hidden = !_ctx.advancedMemoryOpen;
        if (arrowIcon) arrowIcon.className = 'fa-solid fa-angle-' + (_ctx.advancedMemoryOpen ? 'up' : 'down');
      });
    }

    if (advSaveBtn) {
      advSaveBtn.addEventListener('click', async function() {
        var bounds = S().MEMORY_SETTING_BOUNDS || {};
        var rawTrigger = Number(layer.querySelector('#aiw-adv-trigger-chars').value);
        var rawRecent = Number(layer.querySelector('#aiw-adv-recent-limit').value);
        var rawRecall = Number(layer.querySelector('#aiw-adv-recall-count').value);
        var rawMaxLen = Number(layer.querySelector('#aiw-adv-mem-len').value);

        if (!Number.isFinite(rawTrigger) || !Number.isFinite(rawRecent) || !Number.isFinite(rawRecall) || !Number.isFinite(rawMaxLen)) {
          notifyToast('请输入有效的数字参数');
          return;
        }
        var outOfRange =
          (bounds.summaryTriggerChars && (rawTrigger < bounds.summaryTriggerChars.min || rawTrigger > bounds.summaryTriggerChars.max)) ||
          (bounds.recentRawMessagesLimit && (rawRecent < bounds.recentRawMessagesLimit.min || rawRecent > bounds.recentRawMessagesLimit.max)) ||
          (bounds.maxMemoryRecallCount && (rawRecall < bounds.maxMemoryRecallCount.min || rawRecall > bounds.maxMemoryRecallCount.max)) ||
          (bounds.maxSingleMemoryLength && (rawMaxLen < bounds.maxSingleMemoryLength.min || rawMaxLen > bounds.maxSingleMemoryLength.max));

        _ctx.memorySettings = await S().saveMemorySettings({
          summaryTriggerChars: rawTrigger,
          recentRawMessagesLimit: rawRecent,
          maxMemoryRecallCount: rawRecall,
          maxSingleMemoryLength: rawMaxLen,
          applyStrategyPreset: false
        });
        notifyWorkspaceStateChanged();
        renderCurrentView();
        notifyToast(outOfRange ? '部分参数超出安全范围，已自动修正并保存' : '高级记忆参数已保存');
      });
    }

    if (advResetBtn) {
      advResetBtn.addEventListener('click', async function() {
        if (typeof S().resetMemorySettingsToDefaults === 'function') {
          _ctx.memorySettings = await S().resetMemorySettingsToDefaults();
        } else {
          _ctx.memorySettings = await S().saveMemorySettings(S().DEFAULT_MEMORY_SETTINGS || {});
        }
        notifyWorkspaceStateChanged();
        renderCurrentView();
        notifyToast('已恢复默认记忆设置');
      });
    }
  }

  // ===== 导航栈管理 =====
  function pushView(viewName) {
    _ctx.viewStack.push(viewName);
    renderCurrentView();
  }

  function popView() {
    if (_ctx.viewStack.length <= 1) {
      closeLayer();
      return;
    }
    _ctx.viewStack.pop();
    renderCurrentView();
  }

  function renderCurrentView() {
    var layer = getLayer();
    if (!layer) return;
    var view = _ctx.viewStack[_ctx.viewStack.length - 1] || 'home';

    if (view === 'home') {
      layer.innerHTML = renderSettingsHomeHtml();
      bindSettingsHomeEvents(layer);
    } else if (view === 'custom-api') {
      layer.innerHTML = renderCustomApiHtml();
      bindCustomApiEvents(layer);
    } else if (view === 'personalization') {
      layer.innerHTML = renderPersonalizationHtml();
      bindPersonalizationEvents(layer);
    } else if (view === 'presets') {
      layer.innerHTML = renderPresetsListHtml();
      bindPresetsListEvents(layer);
    } else if (view === 'preset-editor') {
      layer.innerHTML = renderPresetEditorHtml();
      bindPresetEditorEvents(layer);
    } else if (view === 'memory') {
      layer.innerHTML = renderMemoryPageHtml();
      bindMemoryPageEvents(layer);
    } else if (view === 'recent-memory') {
      layer.innerHTML = renderRecentMemoryHtml();
      bindRecentMemoryEvents(layer);
    } else if (view === 'short-summary') {
      layer.innerHTML = renderShortSummaryHtml();
      bindShortSummaryEvents(layer);
    } else if (view === 'long-memory') {
      layer.innerHTML = renderLongMemoryHtml();
      bindLongMemoryEvents(layer);
    } else if (view === 'memory-diagnostics') {
      layer.innerHTML = renderMemoryDiagnosticsHtml();
      bindMemoryDiagnosticsEvents(layer);
    } else if (view === 'general') {
      layer.innerHTML = renderGeneralHtml();
      bindGeneralEvents(layer);
    }

    var backHomeBtn = layer.querySelector('#aiw-st-back-home');
    if (backHomeBtn) backHomeBtn.addEventListener('click', closeLayer);

    var subBackBtn = layer.querySelector('#aiw-st-sub-back');
    if (subBackBtn) subBackBtn.addEventListener('click', popView);
  }

  function bindSettingsHomeEvents(layer) {
    var editProfileBtn = layer.querySelector('#aiw-st-edit-profile');
    if (editProfileBtn) {
      editProfileBtn.addEventListener('click', openEditProfileModal);
      editProfileBtn.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openEditProfileModal();
        }
      });
    }

    layer.querySelectorAll('[data-st-nav]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = btn.getAttribute('data-st-nav');
        pushView(target);
      });
    });

    layer.querySelectorAll('[data-st-action]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var act = btn.getAttribute('data-st-action');
        if (act === 'plugins-entry') {
          showCustomModal(
            '插件',
            '<p class="aiw-st-modal-msg">「插件」入口已预留，插件调用与扩展能力将在后续阶段正式接入。</p>',
            '<button type="button" class="aiw-st-btn-primary" id="aiw-placeholder-ok">我知道了</button>'
          );
        }
        var okBtn = layer.querySelector('#aiw-placeholder-ok');
        if (okBtn) okBtn.addEventListener('click', closeModalOverlay);
      });
    });

    var appRow = layer.querySelector('#aiw-st-appearance-row');
    if (appRow) appRow.addEventListener('click', openAppearancePickerModal);

    var accRow = layer.querySelector('#aiw-st-accent-row');
    if (accRow) accRow.addEventListener('click', openAccentPickerModal);
  }

  async function openSettingsCenter(pageEl, initialView, onStateChanged, options) {
    if (!pageEl || !S()) return;
    _ctx.page = pageEl;
    _ctx.onStateChanged = onStateChanged || null;
    _ctx.activeChatId = (options && options.activeChatId) || '';
    _ctx.recentSelectedChatId = _ctx.activeChatId || '';
    _ctx.summarySelectedChatId = _ctx.activeChatId || '';

    var layer = getLayer();
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'aiw-settings-layer';
      layer.className = 'aiw-settings-layer';
      pageEl.appendChild(layer);
    }
    layer.hidden = false;

    await refreshAllData();

    _ctx.viewStack = initialView && initialView !== 'home' ? ['home', initialView] : ['home'];
    renderCurrentView();
    requestAnimationFrame(function() {
      layer.classList.add('open');
    });
  }

  async function refreshMemoryViewsIfOpen() {
    var layer = getLayer();
    if (!layer || !layer.classList.contains('open') || !S()) return;
    var view = _ctx.viewStack[_ctx.viewStack.length - 1] || '';
    var memoryRelatedViews = ['home', 'memory', 'recent-memory', 'short-summary', 'long-memory', 'memory-diagnostics'];
    if (memoryRelatedViews.indexOf(view) === -1) return;

    var results = await Promise.all([
      typeof S().listMemories === 'function' ? S().listMemories() : Promise.resolve([]),
      typeof S().listMemoryTasks === 'function' ? S().listMemoryTasks() : Promise.resolve([]),
      typeof S().listChats === 'function' ? S().listChats() : Promise.resolve([]),
      typeof S().getMemorySettings === 'function' ? S().getMemorySettings() : Promise.resolve(_ctx.memorySettings)
    ]);
    _ctx.memories = results[0] || [];
    _ctx.memoryTasks = results[1] || [];
    _ctx.chats = results[2] || [];
    _ctx.memorySettings = results[3] || _ctx.memorySettings;

    if (layer.querySelector('.aiw-st-modal-backdrop')) return;

    if (view === 'memory') {
      var recentBadge = layer.querySelector('#aiw-mem-badge-recent');
      var summaryBadge = layer.querySelector('#aiw-mem-badge-summary');
      var longBadge = layer.querySelector('#aiw-mem-badge-long');
      var diagBadgeEl = layer.querySelector('#aiw-mem-badge-diag');
      if (recentBadge) recentBadge.textContent = getRecentSummaryBadgeText();
      if (summaryBadge) summaryBadge.textContent = getShortSummaryEntryBadgeText();
      if (longBadge) longBadge.textContent = getLongMemoryEntryBadgeText();
      if (diagBadgeEl) {
        var diagInfo = getDiagnosticsEntryBadgeInfo();
        diagBadgeEl.textContent = diagInfo.text;
        diagBadgeEl.classList.toggle('is-warn', !!diagInfo.isWarn);
      }
    } else if (view === 'long-memory') {
      var filtered = getFilteredMemories();
      var listEl = layer.querySelector('#aiw-mem-list');
      var countEl = layer.querySelector('#aiw-mem-count-text');
      var clearBtn = layer.querySelector('#aiw-mem-clear-all');
      if (listEl) {
        listEl.innerHTML = renderMemoryCardsHtml(filtered);
        bindMemoryListItemEvents(layer);
      }
      if (countEl) {
        countEl.textContent = '共 ' + _ctx.memories.length + ' 条长期记忆' + (_ctx.memorySearchQuery ? ('（筛选出 ' + filtered.length + ' 条）') : '');
      }
      if (clearBtn) clearBtn.disabled = !_ctx.memories.length;
    } else {
      renderCurrentView();
    }
  }

  global.AiWorkspaceSettings = {
    openSettingsCenter: openSettingsCenter,
    closeSettingsCenter: closeLayer,
    refreshMemoryViewsIfOpen: refreshMemoryViewsIfOpen
  };
})(window);
