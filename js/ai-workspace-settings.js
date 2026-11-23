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
    summaryApiConfig: null,
    summaryApiPanelOpen: false,
    summaryCustomPromptDraft: null,
    effectiveApi: null,
    memorySettings: {
      shortTermContext: true,
      autoSummary: true,
      crossChatMemory: true,
      useMemory: true,
      autoMemory: true,
      referenceHistoryChats: true,
      strategy: 'natural',
      summaryTriggerChars: 3200,
      recentRawMessagesLimit: 20,
      summaryIntervalMessages: 20,
      summaryMergeThreshold: 10,
      summaryModelMode: 'follow_chat',
      customSummaryPrompt: '',
      summaryReadWorldBook: false,
      maxMemoryRecallCount: 5,
      maxSingleMemoryLength: 260
    },
    memories: [],
    memoryTasks: [],
    worldbooks: [],
    activeWorldBookId: '',
    chats: [],
    activeChatId: '',
    recentSelectedChatId: '',
    summarySelectedChatId: '',
    advancedMemoryOpen: false,
    memorySearchQuery: '',
    memoryLifecycleTab: 'active',
    expiredPreview: null,
    expiredArchiveRunning: false,
    expiredArchiveResult: null,
    expiredPreviewEpoch: 0
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

  function Mgr() {
    return global.AiWorkspaceMemoryManager;
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

  function downloadBlobFile(filename, blob, successMsg) {
    try {
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
      }, 600);
      notifyToast(successMsg || ('已开始导出文件：' + filename));
      return true;
    } catch (_) {
      notifyToast('当前环境不支持直接下载压缩包，请稍后重试');
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
            autoSummary: true,
            crossChatMemory: true,
            useMemory: true,
            autoMemory: true,
            referenceHistoryChats: true,
            strategy: 'natural',
            summaryTriggerChars: 3200,
            recentRawMessagesLimit: 20,
            summaryIntervalMessages: 20,
            summaryMergeThreshold: 10,
            summaryModelMode: 'follow_chat',
            customSummaryPrompt: '',
            summaryReadWorldBook: false,
            maxMemoryRecallCount: 5,
            maxSingleMemoryLength: 260
          }),
      typeof store.listMemories === 'function' ? store.listMemories() : Promise.resolve([]),
      typeof store.listMemoryTasks === 'function' ? store.listMemoryTasks() : Promise.resolve([]),
      typeof store.listChats === 'function' ? store.listChats() : Promise.resolve([]),
      typeof store.getSummaryApiConfig === 'function'
        ? store.getSummaryApiConfig()
        : Promise.resolve({ baseUrl: '', apiKey: '', model: '', temperature: 0.1, complete: false }),
      typeof store.listWorldBooks === 'function' ? store.listWorldBooks() : Promise.resolve([])
    ]);
    _ctx.profile = results[0];
    _ctx.personalization = results[1];
    _ctx.appearance = results[2];
    _ctx.general = results[3];
    _ctx.presets = results[4];
    _ctx.customApi = results[5];
    _ctx.memorySettings = results[6] || _ctx.memorySettings;
    _ctx.summaryCustomPromptDraft = null;
    _ctx.memories = results[7] || [];
    _ctx.memoryTasks = results[8] || [];
    _ctx.chats = results[9] || [];
    _ctx.summaryApiConfig = results[10] || { baseUrl: '', apiKey: '', model: '', temperature: 0.1, complete: false };
    _ctx.worldbooks = results[11] || [];
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
        memories: _ctx.memories,
        worldbooks: _ctx.worldbooks
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
    _ctx.summaryApiPanelOpen = false;
    clearExpiredArchivePreviewState();
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
    var wbCount = (_ctx.worldbooks || []).length;
    var wbSummary = wbCount ? (wbCount + ' 本') : '暂无';

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
          '<button type="button" class="aiw-st-row" data-st-nav="worldbooks">' +
            '<span class="aiw-st-row-icon"><i class="fa-solid fa-book-open"></i></span>' +
            '<span class="aiw-st-row-label">世界书</span>' +
            '<span class="aiw-st-row-val">' + escapeHtml(wbSummary) + '</span>' +
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
    var wbList = Array.isArray(_ctx.worldbooks) ? _ctx.worldbooks : [];
    var wbIdSet = {};
    for (var wi = 0; wi < wbList.length; wi++) {
      if (wbList[wi] && wbList[wi].id) wbIdSet[wbList[wi].id] = true;
    }

    var cardsHtml = list.length
      ? list.map(function(p) {
          var promptLen = String(p.systemPrompt || '').length;
          var boundIds = Array.isArray(p.worldBookIds) ? p.worldBookIds : [];
          var validBoundCount = 0;
          var seenWb = {};
          for (var bi = 0; bi < boundIds.length; bi++) {
            var bid = boundIds[bi];
            if (bid && wbIdSet[bid] && !seenWb[bid]) {
              seenWb[bid] = true;
              validBoundCount++;
            }
          }
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
                (validBoundCount > 0 ? '<span class="aiw-preset-tag is-wb-bound-tag"><i class="fa-solid fa-book-open"></i> 绑定世界书：' + validBoundCount + ' 本</span>' : '') +
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

  function filterValidWorldBookIds(ids) {
    var wbList = Array.isArray(_ctx.worldbooks) ? _ctx.worldbooks : [];
    var wbIdSet = {};
    for (var i = 0; i < wbList.length; i++) {
      if (wbList[i] && wbList[i].id) wbIdSet[wbList[i].id] = true;
    }
    var src = Array.isArray(ids) ? ids : [];
    var seen = {};
    var out = [];
    for (var j = 0; j < src.length; j++) {
      var id = String(src[j] || '').trim();
      if (!id || !wbIdSet[id] || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  function openNewPresetEditor(initialData) {
    _ctx.editingPresetId = null;
    var base = Object.assign({
      name: '',
      avatarType: 'icon',
      avatarValue: 'fa-solid fa-wand-magic-sparkles',
      description: '',
      systemPrompt: '',
      replyStyle: '温和自然',
      detailLevel: '适中',
      isDefault: (_ctx.presets || []).length === 0,
      worldBookIds: []
    }, initialData || {});
    base.worldBookIds = filterValidWorldBookIds(base.worldBookIds);
    _ctx.editorDraft = base;
    pushView('preset-editor');
  }

  function openEditPresetEditor(preset) {
    if (!preset) return;
    _ctx.editingPresetId = preset.id;
    _ctx.editorDraft = Object.assign({}, preset, {
      worldBookIds: filterValidWorldBookIds(preset.worldBookIds)
    });
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
      isDefault: false,
      worldBookIds: []
    };
    var isEdit = !!_ctx.editingPresetId;
    var promptText = String(d.systemPrompt || '');
    var wbList = Array.isArray(_ctx.worldbooks) ? _ctx.worldbooks : [];
    var boundIds = filterValidWorldBookIds(d.worldBookIds);
    d.worldBookIds = boundIds;
    var boundSet = {};
    for (var bi = 0; bi < boundIds.length; bi++) {
      boundSet[boundIds[bi]] = true;
    }
    var globalWbCount = wbList.filter(function(wb) { return wb && wb.globalEnabled === true; }).length;

    var wbChecklistHtml = wbList.length
      ? (
        '<div class="aiw-pe-wb-list" id="aiw-pe-wb-list">' +
          wbList.map(function(wb) {
            var checked = !!boundSet[wb.id];
            var entryCount = Array.isArray(wb.entries) ? wb.entries.length : 0;
            var isGlobal = wb.globalEnabled === true;
            var subParts = ['词条 ' + entryCount + ' 条'];
            if (wb.description && String(wb.description).trim()) {
              subParts.push(String(wb.description).trim());
            }
            return (
              '<label class="aiw-pe-wb-item' + (checked ? ' is-checked' : '') + '">' +
                '<input type="checkbox" class="aiw-pe-wb-checkbox" data-pe-wb-id="' + escapeHtml(wb.id) + '"' + (checked ? ' checked' : '') + '>' +
                '<span class="aiw-pe-wb-check-box" aria-hidden="true"><i class="fa-solid fa-check"></i></span>' +
                '<div class="aiw-pe-wb-info">' +
                  '<div class="aiw-pe-wb-title-row">' +
                    '<span class="aiw-pe-wb-name">' + escapeHtml(wb.name || '未命名世界书') + '</span>' +
                    (isGlobal ? '<span class="aiw-wbe-badge is-global"><i class="fa-solid fa-globe"></i> 全局启用</span>' : '') +
                  '</div>' +
                  '<div class="aiw-pe-wb-sub">' + escapeHtml(subParts.join(' · ')) + '</div>' +
                '</div>' +
              '</label>'
            );
          }).join('') +
        '</div>'
      )
      : (
        '<div class="aiw-pe-wb-empty">' +
          '<i class="fa-solid fa-book-open"></i>' +
          '<span>暂无可绑定的世界书，可前往「设置 → 世界书」新建或导入</span>' +
        '</div>'
      );

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

        '<div class="aiw-st-group-title">绑定世界书</div>' +
        '<div class="aiw-st-card aiw-st-pad">' +
          '<div class="aiw-field-head">' +
            '<span class="aiw-field-label" style="margin:0;">选择该预设关联的世界书（支持多选）</span>' +
            '<span class="aiw-char-meta" id="aiw-pe-wb-count">已绑定 ' + boundIds.length + ' 本</span>' +
          '</div>' +
          '<div class="aiw-pe-wb-note" id="aiw-pe-wb-note">' +
            (isEdit ? '勾选变化将自动保存；' : '随预设创建一并保存；') +
            (globalWbCount > 0
              ? ('当前另有 ' + globalWbCount + ' 本全局世界书同时生效，重复世界书仅计算一次。')
              : '全局世界书与预设绑定可同时生效，重复世界书仅计算一次。') +
          '</div>' +
          wbChecklistHtml +
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

    var wbCountEl = layer.querySelector('#aiw-pe-wb-count');
    var wbCheckboxes = layer.querySelectorAll('[data-pe-wb-id]');

    function collectSelectedWorldBookIds() {
      var ids = [];
      wbCheckboxes.forEach(function(cb) {
        if (cb.checked) {
          var id = cb.getAttribute('data-pe-wb-id');
          if (id && ids.indexOf(id) === -1) ids.push(id);
        }
      });
      return ids;
    }

    wbCheckboxes.forEach(function(cb) {
      cb.addEventListener('change', async function() {
        var rowEl = cb.closest('.aiw-pe-wb-item');
        if (rowEl) rowEl.classList.toggle('is-checked', !!cb.checked);
        var nextIds = collectSelectedWorldBookIds();
        draft.worldBookIds = nextIds;
        if (wbCountEl) {
          wbCountEl.textContent = '已绑定 ' + nextIds.length + ' 本';
        }
        if (_ctx.editingPresetId && S() && typeof S().updatePreset === 'function') {
          try {
            await S().updatePreset(_ctx.editingPresetId, { worldBookIds: nextIds });
            _ctx.presets = await S().listPresets();
            notifyWorkspaceStateChanged();
            if (wbCountEl) {
              wbCountEl.textContent = '已绑定 ' + nextIds.length + ' 本 · 已自动保存';
            }
          } catch (_) {
            notifyToast('保存世界书绑定失败，请稍后重试');
          }
        }
      });
    });

    // 导出
    layer.querySelector('#aiw-pe-export').addEventListener('click', function() {
      var snapshot = Object.assign({}, draft, {
        name: nameInput.value.trim() || '未命名预设',
        description: descInput.value.trim(),
        replyStyle: styleInput.value.trim() || '温和自然',
        systemPrompt: promptTa.value,
        worldBookIds: filterValidWorldBookIds(draft.worldBookIds)
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
        systemPrompt: promptTa.value,
        worldBookIds: filterValidWorldBookIds(draft.worldBookIds)
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

  function isMemoryInLifecycleTab(mem, tab) {
    if (!mem) return false;
    var st = String(mem.status || 'active').toLowerCase();
    var isArchived = mem.archived === true;
    if (tab === 'active') return st === 'active' && !isArchived;
    if (tab === 'historical') return st !== 'active';
    if (tab === 'archived') return isArchived;
    return true;
  }

  function getMemoryLifecycleCounts(list) {
    var arr = Array.isArray(list) ? list : [];
    var counts = { active: 0, historical: 0, archived: 0, all: arr.length };
    for (var i = 0; i < arr.length; i++) {
      var m = arr[i];
      if (!m) continue;
      if (isMemoryInLifecycleTab(m, 'active')) counts.active++;
      if (isMemoryInLifecycleTab(m, 'historical')) counts.historical++;
      if (isMemoryInLifecycleTab(m, 'archived')) counts.archived++;
    }
    return counts;
  }

  function getFilteredMemories() {
    var list = Array.isArray(_ctx.memories) ? _ctx.memories : [];
    var tab = _ctx.memoryLifecycleTab || 'active';
    var q = String(_ctx.memorySearchQuery || '').trim().toLowerCase();
    return list.filter(function(m) {
      if (!isMemoryInLifecycleTab(m, tab)) return false;
      if (!q) return true;
      var entitiesStr = Array.isArray(m.entities) ? m.entities.join(' ') : '';
      return String(m.content || '').toLowerCase().indexOf(q) !== -1 ||
        String(m.category || '').toLowerCase().indexOf(q) !== -1 ||
        String(m.sourceChatTitle || '').toLowerCase().indexOf(q) !== -1 ||
        String(m.scenarioLabel || '').toLowerCase().indexOf(q) !== -1 ||
        String(m.archiveReason || '').toLowerCase().indexOf(q) !== -1 ||
        String(m.rawExpression || '').toLowerCase().indexOf(q) !== -1 ||
        entitiesStr.toLowerCase().indexOf(q) !== -1;
    });
  }

  function buildMemoryDecayDiagnostics(mem, nowTs) {
    var now = (typeof nowTs === 'number' && Number.isFinite(nowTs) && nowTs > 0) ? nowTs : Date.now();
    var m = mem && typeof mem === 'object' ? mem : null;
    var mgr = Mgr();
    var missingText = '暂无可靠记录';

    if (!m) {
      return {
        rawImportance: null,
        rawImportanceText: missingText,
        dynamicScore: null,
        dynamicScoreText: missingText,
        lastMentionAt: 0,
        lastMentionText: missingText,
        decayPenalty: null,
        decayPenaltyText: missingText,
        protectionReason: '',
        protectionText: missingText,
        protectionTone: 'neutral'
      };
    }

    var hasRawImp = m.importance != null && m.importance !== '' && Number.isFinite(Number(m.importance));
    var rawImp = hasRawImp ? Math.max(1, Math.min(5, Math.round(Number(m.importance)))) : null;
    var rawImportanceText = rawImp != null ? (rawImp + ' / 5') : missingText;

    var hasCalcFns = !!(
      mgr &&
      typeof mgr.computeDynamicScore === 'function' &&
      typeof mgr.computeTimeDecayPenalty === 'function' &&
      typeof mgr.getLastEffectiveMentionTimestamp === 'function'
    );

    if (!hasCalcFns) {
      return {
        rawImportance: rawImp,
        rawImportanceText: rawImportanceText,
        dynamicScore: null,
        dynamicScoreText: missingText,
        lastMentionAt: 0,
        lastMentionText: missingText,
        decayPenalty: null,
        decayPenaltyText: missingText,
        protectionReason: '',
        protectionText: missingText,
        protectionTone: 'neutral'
      };
    }

    var st = String(m.status || 'active').toLowerCase();
    var ts = String(m.temporalState || 'current').toLowerCase();
    var isArchived = m.archived === true;
    var isActive = st === 'active' && !isArchived &&
      ts !== 'cancelled' && ts !== 'completed' && ts !== 'past' && ts !== 'paused';

    var dynScore = mgr.computeDynamicScore(m, now);
    var lastMentionAt = mgr.getLastEffectiveMentionTimestamp(m, now);
    var decayInfo = mgr.computeTimeDecayPenalty(m, now);

    var formattedLastMention = lastMentionAt > 0 ? formatMemoryDate(lastMentionAt) : '';
    var lastMentionText = formattedLastMention || missingText;
    if (formattedLastMention && decayInfo && typeof decayInfo.daysSinceMention === 'number' && Number.isFinite(decayInfo.daysSinceMention)) {
      var wholeDays = Math.floor(decayInfo.daysSinceMention);
      if (wholeDays >= 1) {
        lastMentionText = formattedLastMention + '（' + wholeDays + '天前）';
      } else {
        lastMentionText = formattedLastMention + '（今天）';
      }
    }

    var penaltyVal = decayInfo && typeof decayInfo.penalty === 'number' && Number.isFinite(decayInfo.penalty)
      ? decayInfo.penalty
      : null;
    var decayPenaltyText = missingText;
    if (!isActive) {
      decayPenaltyText = '0 分（非活跃）';
    } else if (penaltyVal != null) {
      decayPenaltyText = penaltyVal > 0 ? ('-' + penaltyVal + ' 分') : '0 分';
    }

    var reason = (decayInfo && decayInfo.protectedReason) ? String(decayInfo.protectedReason) : '';
    var protectionText = '常规渐进衰减';
    var protectionTone = 'neutral';

    if (m.manualImportance === true || reason === 'manual_importance') {
      protectionText = '手动评分锁定（免衰减）';
      protectionTone = 'protected';
    } else if (!isActive) {
      protectionText = isArchived ? '已归档（状态降权）' : '非活跃状态（状态降权）';
      protectionTone = 'muted';
    } else if (reason === 'no_reliable_timestamp' || !(lastMentionAt > 0)) {
      protectionText = '无可靠时间戳（免衰减兜底）';
      protectionTone = 'muted';
    } else if (reason === 'core_importance_grace') {
      protectionText = '核心重要保护（30天免衰减）';
      protectionTone = 'protected';
    } else if (reason === 'core_importance_protected') {
      protectionText = '核心重要保护（低速衰减）';
      protectionTone = 'protected';
    } else if (reason === 'high_mention_protected') {
      protectionText = '高频提及保护（减缓衰减）';
      protectionTone = 'protected';
    } else if (reason === 'recent_grace_period') {
      protectionText = '近期宽限期（7天内免衰减）';
      protectionTone = 'safe';
    } else if (penaltyVal != null && penaltyVal > 0) {
      protectionText = '常规渐进衰减中';
      protectionTone = 'decaying';
    }

    return {
      rawImportance: rawImp,
      rawImportanceText: rawImportanceText,
      dynamicScore: dynScore,
      dynamicScoreText: Number.isFinite(dynScore) ? (Math.round(dynScore) + ' 分') : missingText,
      lastMentionAt: lastMentionAt,
      lastMentionText: lastMentionText,
      decayPenalty: isActive ? penaltyVal : 0,
      decayPenaltyText: decayPenaltyText,
      protectionReason: reason,
      protectionText: protectionText,
      protectionTone: protectionTone
    };
  }

  function renderMemoryCardsHtml(list, nowTs) {
    var allMemories = Array.isArray(_ctx.memories) ? _ctx.memories : [];
    var renderNow = (typeof nowTs === 'number' && Number.isFinite(nowTs) && nowTs > 0) ? nowTs : Date.now();
    var byId = {};
    for (var bi = 0; bi < allMemories.length; bi++) {
      if (allMemories[bi] && allMemories[bi].id) byId[allMemories[bi].id] = allMemories[bi];
    }

    if (!list.length) {
      var hasQuery = !!String(_ctx.memorySearchQuery || '').trim();
      var tab = _ctx.memoryLifecycleTab || 'active';
      var emptyTitle = hasQuery
        ? '没有匹配的长期记忆'
        : (tab === 'archived'
            ? '暂无已归档记忆'
            : (tab === 'historical' ? '暂无历史变更记忆' : '当前分类下暂无长期记忆'));
      var emptySub = hasQuery
        ? '换个关键词试试，或切换上方状态标签查看全部记忆。'
        : (tab === 'archived'
            ? '已完成项目、已取消计划、被替代的历史偏好或长期未使用的低价值备忘会自动归档于此，仍可随时检索与恢复。'
            : (tab === 'historical'
                ? '当你的偏好或计划状态发生变更时，旧记录会自动转入历史并保留完整演进脉络。'
                : '当开启「自动记忆」后，知屿会在对话中自动记住你的偏好、习惯、长期计划与重要决定，也可以点击右上角手动新增。'));
      return (
        '<div class="aiw-mem-empty">' +
          '<div class="aiw-mem-empty-icon"><i class="fa-regular fa-bookmark"></i></div>' +
          '<div class="aiw-mem-empty-title">' + escapeHtml(emptyTitle) + '</div>' +
          '<div class="aiw-mem-empty-sub">' + escapeHtml(emptySub) + '</div>' +
        '</div>'
      );
    }

    return list.map(function(m) {
      var sourceChats = Array.isArray(m.sourceChats) ? m.sourceChats : [];
      var sourceLabel = m.sourceChatTitle
        ? (m.sourceChatTitle === '手动添加' ? '来源：手动添加' : ('来源：' + m.sourceChatTitle))
        : (m.sourceChatId ? '来源：对话自动提取' : '来源：手动添加');
      if (sourceChats.length > 1) {
        sourceLabel += ' 等 ' + sourceChats.length + ' 个对话';
      }
      if (m.factSource === 'context_resolved') sourceLabel += ' · 上下文指代消解';
      var timeLabel = formatMemoryDate(m.updatedAt || m.createdAt);
      var statusLabel = '';
      var st = String(m.status || 'active').toLowerCase();
      var ts = String(m.temporalState || 'current').toLowerCase();
      if (st === 'cancelled' || ts === 'cancelled') statusLabel = '已取消';
      else if (st === 'paused' || ts === 'paused') statusLabel = '暂时搁置';
      else if (st === 'completed' || ts === 'completed') statusLabel = '已完成';
      else if (st === 'historical' || ts === 'past') statusLabel = '历史记录';
      else if (ts === 'future_plan') statusLabel = '计划中';

      var decayDiag = buildMemoryDecayDiagnostics(m, renderNow);
      var dynScore = decayDiag.dynamicScore != null
        ? Math.round(decayDiag.dynamicScore)
        : (typeof m.dynamicScore === 'number' && Number.isFinite(m.dynamicScore)
            ? Math.round(m.dynamicScore)
            : Math.round((Number(m.importance) || 3) * 18));
      var confPct = typeof m.confidence === 'number' && Number.isFinite(m.confidence)
        ? Math.round(m.confidence * 100) + '%'
        : '';

      var statsParts = [];
      if ((Number(m.mentionCount) || 1) > 1) statsParts.push('提及 ' + m.mentionCount + ' 次');
      if ((Number(m.usageCount) || 0) > 0) statsParts.push('召回 ' + m.usageCount + ' 次');
      var statsHint = statsParts.join(' · ');

      var rawExprHint = m.rawExpression && m.rawExpression !== m.content
        ? ('原句：' + m.rawExpression)
        : '';

      // 关联关系网络展示
      var rels = Array.isArray(m.relations) ? m.relations.filter(function(r) { return r && r.targetId && byId[r.targetId]; }) : [];
      var relationsHtml = '';
      if (rels.length > 0) {
        var relChips = rels.slice(0, 6).map(function(r) {
          var targetMem = byId[r.targetId];
          var relLabel = r.label || '关联';
          var snippet = targetMem ? String(targetMem.content || '').slice(0, 22) : '';
          if (targetMem && String(targetMem.content || '').length > 22) snippet += '…';
          return (
            '<span class="aiw-mem-rel-chip" title="' + escapeHtml(r.reason || relLabel) + '">' +
              '<span class="aiw-mem-rel-type">' + escapeHtml(relLabel) + '</span>' +
              '<span class="aiw-mem-rel-text">' + escapeHtml(snippet) + '</span>' +
            '</span>'
          );
        }).join('');
        relationsHtml = (
          '<div class="aiw-mem-rel-box">' +
            '<div class="aiw-mem-sub-title"><i class="fa-solid fa-diagram-project"></i> 记忆关联（' + rels.length + '）</div>' +
            '<div class="aiw-mem-rel-list">' + relChips + '</div>' +
          '</div>'
        );
      }

      // 合并与变更记录、归档原因展示
      var mergeRecs = Array.isArray(m.mergeRecords) ? m.mergeRecords : [];
      var histRecs = Array.isArray(m.history) ? m.history : [];
      var auditLines = [];
      if (m.archived && m.archiveReason) {
        auditLines.push('<div class="aiw-mem-audit-line is-archive"><i class="fa-solid fa-box-archive"></i> 归档原因：' + escapeHtml(m.archiveReason) + '</div>');
      }
      if (m.previousContent) {
        auditLines.push('<div class="aiw-mem-audit-line"><i class="fa-solid fa-clock-rotate-left"></i> 变更自：「' + escapeHtml(m.previousContent) + '」</div>');
      }
      if (mergeRecs.length > 0) {
        var latestMerge = mergeRecs[0];
        auditLines.push(
          '<div class="aiw-mem-audit-line"><i class="fa-solid fa-code-merge"></i> 合并记录（共 ' + mergeRecs.length + ' 次）：最近合并「' +
          escapeHtml((latestMerge.mergedContent || latestMerge.rawExpression || '').slice(0, 48)) + '」' +
          (latestMerge.sourceChatTitle ? ('（来自 ' + escapeHtml(latestMerge.sourceChatTitle) + '）') : '') +
          '</div>'
        );
      }
      if (histRecs.length > 0 && !m.previousContent) {
        auditLines.push('<div class="aiw-mem-audit-line"><i class="fa-solid fa-clock-rotate-left"></i> 历史记录（' + histRecs.length + ' 条）：曾为「' + escapeHtml(histRecs[0].content.slice(0, 48)) + '」</div>');
      }
      var auditHtml = auditLines.length ? ('<div class="aiw-mem-audit-box">' + auditLines.join('') + '</div>') : '';

      var decayDiagHtml = (
        '<div class="aiw-mem-decay-box" data-mem-decay-id="' + escapeHtml(m.id) + '">' +
          '<div class="aiw-mem-decay-head">' +
            '<span class="aiw-mem-decay-title"><i class="fa-regular fa-clock"></i> 时间衰减诊断</span>' +
            '<span class="aiw-mem-decay-status is-' + escapeHtml(decayDiag.protectionTone) + '">' + escapeHtml(decayDiag.protectionText) + '</span>' +
          '</div>' +
          '<div class="aiw-mem-decay-grid">' +
            '<div class="aiw-mem-decay-cell">' +
              '<span class="aiw-mem-decay-label">原始重要度</span>' +
              '<span class="aiw-mem-decay-val">' + escapeHtml(decayDiag.rawImportanceText) + '</span>' +
            '</div>' +
            '<div class="aiw-mem-decay-cell">' +
              '<span class="aiw-mem-decay-label">当前动态分</span>' +
              '<span class="aiw-mem-decay-val">' + escapeHtml(decayDiag.dynamicScoreText) + '</span>' +
            '</div>' +
            '<div class="aiw-mem-decay-cell">' +
              '<span class="aiw-mem-decay-label">时间衰减</span>' +
              '<span class="aiw-mem-decay-val' + (decayDiag.decayPenalty > 0 ? ' is-decayed' : '') + '">' + escapeHtml(decayDiag.decayPenaltyText) + '</span>' +
            '</div>' +
            '<div class="aiw-mem-decay-cell is-full">' +
              '<span class="aiw-mem-decay-label">最后有效提及</span>' +
              '<span class="aiw-mem-decay-val">' + escapeHtml(decayDiag.lastMentionText) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>'
      );

      var cardCls = 'aiw-mem-card' + (m.archived ? ' is-archived' : '') + (m.conflictState === 'pending_confirmation' ? ' is-conflict' : '');
      var isManualImp = m.manualImportance === true;
      var impModeLabel = isManualImp ? '手动锁定' : '自动管理';
      var impModeCls = isManualImp ? 'is-imp-manual' : 'is-imp-auto';
      var archiveBtnHtml = m.archived
        ? '<button type="button" class="aiw-preset-act" data-mem-act="unarchive" data-mem-id="' + escapeHtml(m.id) + '"><i class="fa-solid fa-box-open"></i> 恢复有效</button>'
        : '<button type="button" class="aiw-preset-act" data-mem-act="archive" data-mem-id="' + escapeHtml(m.id) + '"><i class="fa-solid fa-box-archive"></i> 归档</button>';

      return (
        '<div class="' + cardCls + '" data-mem-id="' + escapeHtml(m.id) + '">' +
          '<div class="aiw-mem-card-top">' +
            '<div class="aiw-mem-badges">' +
              '<span class="aiw-mem-badge is-cat">' + escapeHtml(m.category || '备忘') + '</span>' +
              (statusLabel ? '<span class="aiw-mem-badge is-status">' + escapeHtml(statusLabel) + '</span>' : '') +
              (m.archived ? '<span class="aiw-mem-badge is-archived-tag">已归档</span>' : '') +
              (m.scenarioLabel ? '<span class="aiw-mem-badge is-scene">' + escapeHtml(m.scenarioLabel) + '</span>' : '') +
              (m.conflictState === 'pending_confirmation' ? '<span class="aiw-mem-badge is-conflict-tag">待确认冲突</span>' : '') +
              '<span class="aiw-mem-badge is-scope">' + escapeHtml(formatScopeLabel(m.scope)) + '</span>' +
              '<span class="aiw-mem-badge is-imp">重要度 ' + escapeHtml(String(m.importance || 3)) + '/5 · ' + escapeHtml(String(dynScore)) + '分</span>' +
              '<span class="aiw-mem-badge ' + impModeCls + '" data-mem-imp-mode="' + (isManualImp ? 'manual' : 'auto') + '">' + impModeLabel + '</span>' +
              (confPct ? '<span class="aiw-mem-badge is-conf">置信 ' + escapeHtml(confPct) + '</span>' : '') +
              (m.userConfirmed ? '<span class="aiw-mem-badge is-active-win">已确认</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="aiw-mem-content">' + escapeHtml(m.content) + '</div>' +
          (rawExprHint ? '<div class="aiw-mem-meta" style="margin-top:4px;"><span class="aiw-mem-source">' + escapeHtml(rawExprHint) + '</span></div>' : '') +
          decayDiagHtml +
          relationsHtml +
          auditHtml +
          '<div class="aiw-mem-meta">' +
            '<span class="aiw-mem-source">' + escapeHtml(sourceLabel) + (statsHint ? (' · ' + escapeHtml(statsHint)) : '') + '</span>' +
            (timeLabel ? '<span class="aiw-mem-time">' + escapeHtml(timeLabel) + '</span>' : '') +
          '</div>' +
          '<div class="aiw-mem-actions">' +
            '<button type="button" class="aiw-preset-act" data-mem-act="edit" data-mem-id="' + escapeHtml(m.id) + '"><i class="fa-regular fa-pen-to-square"></i> 编辑</button>' +
            archiveBtnHtml +
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
    summarize_chat: '短期摘要',
    merge_summary: '摘要合并'
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
      recentRawMessagesLimit: { min: 2, max: 60, def: 20 },
      summaryIntervalMessages: { min: 4, max: 100, def: 20 },
      summaryMergeThreshold: { min: 2, max: 30, def: 10 },
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
              '<div class="aiw-st-row-desc">摘要阈值 ' + escapeHtml(String(ms.summaryTriggerChars || 3200)) + ' 字 · 近期 ' + escapeHtml(String(ms.recentRawMessagesLimit || 20)) + ' 条 · 召回 ' + escapeHtml(String(ms.maxMemoryRecallCount || 5)) + ' 条</div>' +
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
    var limit = Math.max(2, Number(ms.recentRawMessagesLimit) || 20);
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
    var bounds = (S() && S().MEMORY_SETTING_BOUNDS) || {
      recentRawMessagesLimit: { min: 2, max: 60, def: 20 },
      summaryIntervalMessages: { min: 4, max: 100, def: 20 },
      summaryMergeThreshold: { min: 2, max: 30, def: 10 }
    };
    var recentLimitVal = Number(ms.recentRawMessagesLimit) || bounds.recentRawMessagesLimit.def;
    var intervalVal = Number(ms.summaryIntervalMessages) || bounds.summaryIntervalMessages.def;
    var mergeThresholdVal = Number(ms.summaryMergeThreshold) || bounds.summaryMergeThreshold.def;
    var autoSummaryOn = ms.autoSummary !== false;
    var summaryReadWorldBookOn = ms.summaryReadWorldBook === true;
    var summaryApiCfg = (_ctx.summaryApiConfig && typeof _ctx.summaryApiConfig === 'object')
      ? _ctx.summaryApiConfig
      : { baseUrl: '', apiKey: '', model: '', temperature: 0.1, complete: false };
    var hasSavedSummaryKey = !!String(summaryApiCfg.apiKey || '').trim();
    var maskedSummaryKey = hasSavedSummaryKey
      ? ((AI() && typeof AI().maskApiKey === 'function') ? AI().maskApiKey(summaryApiCfg.apiKey) : '••••')
      : '';
    var independentModelReady = !!(
      summaryApiCfg.complete &&
      (typeof (S() && S().isSummaryApiComplete) !== 'function' || S().isSummaryApiComplete(summaryApiCfg))
    );
    var summaryModelMode = (ms.summaryModelMode === 'independent' && independentModelReady) ? 'independent' : 'follow_chat';
    var summaryApiTempVal = Number.isFinite(Number(summaryApiCfg.temperature)) ? Number(summaryApiCfg.temperature) : 0.1;
    var hasAnySummaryApiField = !!(summaryApiCfg.baseUrl || hasSavedSummaryKey || summaryApiCfg.model);
    var summaryApiPanelOpen = !!_ctx.summaryApiPanelOpen;
    var maxCustomPromptLen = (S() && Number(S().MAX_CUSTOM_SUMMARY_PROMPT_LENGTH)) || 1000;
    var customPromptVal = (_ctx.summaryCustomPromptDraft !== null && _ctx.summaryCustomPromptDraft !== undefined)
      ? String(_ctx.summaryCustomPromptDraft)
      : String(ms.customSummaryPrompt || '');
    var customPromptLen = customPromptVal.replace(/\r\n/g, '\n').length;
    var customPromptOver = customPromptLen > maxCustomPromptLen;

    var chats = Array.isArray(_ctx.chats) ? _ctx.chats : [];
    var targetChat = resolveSummaryTargetChat();
    var cleanMsgs = targetChat && Array.isArray(targetChat.messages)
      ? targetChat.messages.filter(function(m) { return m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim(); })
      : [];
    var summaryUpTo = targetChat ? Math.min(cleanMsgs.length, Math.max(0, Number(targetChat.summaryUpToCount) || 0)) : 0;
    var unsummarizedCount = Math.max(0, cleanMsgs.length - summaryUpTo);
    var summaryText = '';
    if (targetChat) {
      summaryText = (M() && typeof M().buildShortTermSummaryContext === 'function')
        ? M().buildShortTermSummaryContext(targetChat)
        : String(targetChat.summary || '').trim();
    }
    var summaryTime = targetChat && targetChat.summaryUpdatedAt ? formatMemoryDate(targetChat.summaryUpdatedAt) : '';

    var chatSegments = targetChat && Array.isArray(targetChat.summarySegments) ? targetChat.summarySegments : [];
    var activeSegmentCount = chatSegments.filter(function(s) { return s && s.status === 'active'; }).length;
    var mergedSegmentCount = chatSegments.filter(function(s) { return s && s.status === 'merged'; }).length;

    var chatSummaryTasks = targetChat
      ? (Array.isArray(_ctx.memoryTasks) ? _ctx.memoryTasks : []).filter(function(t) {
          return t && (t.type === 'summarize_chat' || t.type === 'merge_summary') && t.chatId === targetChat.id;
        })
      : [];
    var latestTask = chatSummaryTasks[0] || null;
    var taskStatusText = latestTask
      ? (MEMORY_TASK_STATUS_MAP[latestTask.status] || latestTask.status || '等待中')
      : (summaryText ? '已完成' : '未触发');
    var taskStatusCls = latestTask ? ('is-' + (latestTask.status || 'pending')) : (summaryText ? 'is-saved' : 'is-idle');

    var settingsCardHtml = (
      '<div class="aiw-st-group-title">摘要设置</div>' +
      '<div class="aiw-st-card">' +
        '<div class="aiw-st-row aiw-st-row-static">' +
          '<div class="aiw-st-row-col">' +
            '<div class="aiw-st-row-label">自动摘要</div>' +
            '<div class="aiw-st-row-desc">开启后按新消息增量自动生成与合并摘要；关闭后不影响读取已有摘要</div>' +
          '</div>' +
          '<label class="aiw-switch">' +
            '<input type="checkbox" id="aiw-ss-auto-summary"' + (autoSummaryOn ? ' checked' : '') + '>' +
            '<span class="aiw-switch-track"></span>' +
          '</label>' +
        '</div>' +
        '<div class="aiw-st-row aiw-st-row-static">' +
          '<div class="aiw-st-row-col">' +
            '<div class="aiw-st-row-label">摘要读取世界书</div>' +
            '<div class="aiw-st-row-desc">开启后，生成摘要时可参考当前聊天适用的世界书设定，不会将设定直接当作已发生的事件。</div>' +
          '</div>' +
          '<label class="aiw-switch">' +
            '<input type="checkbox" id="aiw-ss-read-worldbook"' + (summaryReadWorldBookOn ? ' checked' : '') + '>' +
            '<span class="aiw-switch-track"></span>' +
          '</label>' +
        '</div>' +
        '<div class="aiw-ss-settings-body">' +
          '<div class="aiw-ss-settings-grid">' +
            '<div class="aiw-ss-setting-field">' +
              '<label class="aiw-field-label" for="aiw-ss-recent-limit">最近原始消息（' + bounds.recentRawMessagesLimit.min + '-' + bounds.recentRawMessagesLimit.max + ' 条）</label>' +
              '<div class="aiw-ss-input-wrap">' +
                '<input type="number" inputmode="numeric" class="aiw-field-input" id="aiw-ss-recent-limit" min="' + bounds.recentRawMessagesLimit.min + '" max="' + bounds.recentRawMessagesLimit.max + '" value="' + escapeHtml(String(recentLimitVal)) + '">' +
                '<span class="aiw-ss-input-unit">条</span>' +
              '</div>' +
              '<div class="aiw-ss-field-hint">按实际消息条数保留直接带入上下文的最近原文</div>' +
            '</div>' +
            '<div class="aiw-ss-setting-field">' +
              '<label class="aiw-field-label" for="aiw-ss-interval-msgs">每 N 条新消息自动摘要（' + bounds.summaryIntervalMessages.min + '-' + bounds.summaryIntervalMessages.max + ' 条）</label>' +
              '<div class="aiw-ss-input-wrap">' +
                '<input type="number" inputmode="numeric" class="aiw-field-input" id="aiw-ss-interval-msgs" min="' + bounds.summaryIntervalMessages.min + '" max="' + bounds.summaryIntervalMessages.max + '" value="' + escapeHtml(String(intervalVal)) + '">' +
                '<span class="aiw-ss-input-unit">条</span>' +
              '</div>' +
              '<div class="aiw-ss-field-hint">超出近期保留窗口的未摘要新消息达到此条数时自动触发</div>' +
            '</div>' +
            '<div class="aiw-ss-setting-field">' +
              '<label class="aiw-field-label" for="aiw-ss-merge-threshold">每 N 条独立摘要合并（' + bounds.summaryMergeThreshold.min + '-' + bounds.summaryMergeThreshold.max + ' 条）</label>' +
              '<div class="aiw-ss-input-wrap">' +
                '<input type="number" inputmode="numeric" class="aiw-field-input" id="aiw-ss-merge-threshold" min="' + bounds.summaryMergeThreshold.min + '" max="' + bounds.summaryMergeThreshold.max + '" value="' + escapeHtml(String(mergeThresholdVal)) + '">' +
                '<span class="aiw-ss-input-unit">条</span>' +
              '</div>' +
              '<div class="aiw-ss-field-hint">未合并独立摘要段满此条数时自动压缩为综合摘要</div>' +
            '</div>' +
            '<div class="aiw-ss-setting-field">' +
              '<div class="aiw-ss-model-header">' +
                '<div class="aiw-field-label">摘要模型</div>' +
                '<button type="button" class="aiw-ss-model-expand-btn" id="aiw-ss-ind-toggle" aria-expanded="' + (summaryApiPanelOpen ? 'true' : 'false') + '">' +
                  (summaryApiPanelOpen ? '收起独立配置' : (independentModelReady ? '编辑独立配置' : '配置独立模型')) +
                '</button>' +
              '</div>' +
              '<div class="aiw-ss-model-radio-group" role="radiogroup" aria-label="摘要模型">' +
                '<label class="aiw-ss-model-option' + (summaryModelMode === 'follow_chat' ? ' is-active' : '') + '">' +
                  '<input type="radio" name="aiw-ss-model-mode" value="follow_chat"' + (summaryModelMode === 'follow_chat' ? ' checked' : '') + '>' +
                  '<span class="aiw-ss-model-option-body">' +
                    '<span class="aiw-ss-model-option-head">' +
                      '<span class="aiw-ss-model-option-title">跟随本对话</span>' +
                    '</span>' +
                    '<span class="aiw-ss-model-option-desc">按各对话自身使用的模型执行摘要与合并</span>' +
                  '</span>' +
                '</label>' +
                '<label class="aiw-ss-model-option' + (summaryModelMode === 'independent' ? ' is-active' : '') + (!independentModelReady ? ' is-disabled' : '') + '" id="aiw-ss-ind-option" aria-disabled="' + (!independentModelReady ? 'true' : 'false') + '">' +
                  '<input type="radio" name="aiw-ss-model-mode" value="independent"' + (summaryModelMode === 'independent' ? ' checked' : '') + (!independentModelReady ? ' disabled' : '') + '>' +
                  '<span class="aiw-ss-model-option-body">' +
                    '<span class="aiw-ss-model-option-head">' +
                      '<span class="aiw-ss-model-option-title">使用独立摘要模型</span>' +
                      (independentModelReady
                        ? '<span class="aiw-ss-model-badge is-ready">已配置</span>'
                        : '<span class="aiw-ss-coming-soon">未配置</span>') +
                    '</span>' +
                    '<span class="aiw-ss-model-option-desc">' +
                      (independentModelReady
                        ? ('已配置模型：' + escapeHtml(summaryApiCfg.model) + '（温度 ' + escapeHtml(String(summaryApiTempVal)) + '），与主聊天 API 隔离')
                        : '配置不完整时保持「跟随本对话」，请先完成下方独立模型配置') +
                    '</span>' +
                  '</span>' +
                '</label>' +
              '</div>' +
              (summaryApiPanelOpen
                ? (
                  '<div class="aiw-ss-model-panel" id="aiw-ss-ind-panel">' +
                    '<div class="aiw-ss-setting-field">' +
                      '<label class="aiw-field-label" for="aiw-ss-ind-baseurl">Base URL</label>' +
                      '<input type="url" class="aiw-field-input" id="aiw-ss-ind-baseurl" placeholder="https://api.openai.com/v1" autocomplete="off" value="' + escapeHtml(summaryApiCfg.baseUrl || '') + '">' +
                    '</div>' +
                    '<div class="aiw-ss-setting-field">' +
                      '<label class="aiw-field-label" for="aiw-ss-ind-apikey">API Key</label>' +
                      '<input type="password" class="aiw-field-input" id="aiw-ss-ind-apikey" placeholder="' + (hasSavedSummaryKey ? '留空保持已保存密钥，输入新值则更新' : '请输入独立摘要 API Key') + '" autocomplete="new-password" value="">' +
                      '<div class="aiw-ss-model-key-meta">' +
                        (hasSavedSummaryKey
                          ? ('<span>已保存：' + escapeHtml(maskedSummaryKey || '••••') + '（留空保存将保留原密钥）</span>' +
                             '<button type="button" class="aiw-ss-model-key-clear" id="aiw-ss-ind-clear-key">清除 API Key</button>')
                          : '<span>尚未保存 API Key</span>') +
                      '</div>' +
                    '</div>' +
                    '<div class="aiw-ss-setting-field">' +
                      '<label class="aiw-field-label" for="aiw-ss-ind-model">模型名称</label>' +
                      '<input type="text" class="aiw-field-input" id="aiw-ss-ind-model" placeholder="例如 gpt-4o-mini" autocomplete="off" value="' + escapeHtml(summaryApiCfg.model || '') + '">' +
                    '</div>' +
                    '<div class="aiw-ss-setting-field">' +
                      '<label class="aiw-field-label" for="aiw-ss-ind-temp">温度（0–2，默认 0.1）</label>' +
                      '<input type="number" inputmode="decimal" step="0.05" min="0" max="2" class="aiw-field-input" id="aiw-ss-ind-temp" value="' + escapeHtml(String(summaryApiTempVal)) + '">' +
                    '</div>' +
                    '<div class="aiw-ss-ind-actions">' +
                      (hasAnySummaryApiField
                        ? '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-ss-ind-clear-all">清空配置</button>'
                        : '<span></span>') +
                      '<button type="button" class="aiw-st-btn-primary aiw-st-btn-sm" id="aiw-ss-ind-save">保存独立配置</button>' +
                    '</div>' +
                  '</div>'
                )
                : '') +
            '</div>' +
            '<div class="aiw-ss-setting-field">' +
              '<div class="aiw-ss-prompt-header">' +
                '<label class="aiw-field-label" for="aiw-ss-custom-prompt">自定义摘要要求</label>' +
                '<span class="aiw-ss-prompt-counter' + (customPromptOver ? ' is-over' : '') + '" id="aiw-ss-custom-prompt-count">' + escapeHtml(String(customPromptLen)) + ' / ' + escapeHtml(String(maxCustomPromptLen)) + ' 字</span>' +
              '</div>' +
              '<textarea class="aiw-field-textarea aiw-ss-prompt-textarea' + (customPromptOver ? ' is-invalid' : '') + '" id="aiw-ss-custom-prompt" rows="4" placeholder="例如：重点记录人物关系、重要决定、未完成事项。">' + escapeHtml(customPromptVal) + '</textarea>' +
              '<div class="aiw-ss-field-hint' + (customPromptOver ? ' is-error' : '') + '" id="aiw-ss-custom-prompt-hint">' +
                (customPromptOver
                  ? ('已超出 ' + escapeHtml(String(maxCustomPromptLen)) + ' 字上限（超出 ' + escapeHtml(String(customPromptLen - maxCustomPromptLen)) + ' 字），请精简后再保存')
                  : ('可选，最多 ' + escapeHtml(String(maxCustomPromptLen)) + ' 字；留空时保持默认摘要行为')) +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="aiw-ss-settings-actions">' +
            '<span class="aiw-ss-settings-scope-hint">仅作用于知屿 · 修改阈值不会重复摘要已处理消息</span>' +
            '<button type="button" class="aiw-st-btn-primary aiw-st-btn-sm" id="aiw-ss-settings-save">保存摘要设置</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    var selectorHtml = chats.length
      ? (
        '<div class="aiw-st-card aiw-st-pad" style="margin-top:14px;">' +
          '<label class="aiw-field-label" for="aiw-ss-chat-select">切换聊天查看摘要</label>' +
          '<select class="aiw-api-select" id="aiw-ss-chat-select">' +
            chats.map(function(c) {
              var selected = targetChat && c.id === targetChat.id ? ' selected' : '';
              var hasSum = !!(c && (String(c.summary || '').trim() || (Array.isArray(c.summarySegments) && c.summarySegments.length > 0)));
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
      var emptyReasonText = autoSummaryOn
        ? ('当前对话尚未触发阶段性摘要（超出最近 ' + escapeHtml(String(recentLimitVal)) + ' 条原文窗口且累计新增满 ' + escapeHtml(String(intervalVal)) + ' 条消息时会自动生成）。')
        : '自动摘要当前已关闭，如需自动生成新摘要请在上方开启。';
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
            '<div class="aiw-mem-empty-sub">' + emptyReasonText + '</div>' +
          '</div>'
        );

      var segmentInfoHtml = (activeSegmentCount > 0 || mergedSegmentCount > 0)
        ? (
          '<div class="aiw-ss-info-line">' +
            '<span>分段摘要状态</span>' +
            '<span>独立段 ' + activeSegmentCount + ' / ' + mergeThresholdVal + ' 条' + (mergedSegmentCount > 0 ? (' · 已合并 ' + mergedSegmentCount + ' 组') : '') + '</span>' +
          '</div>'
        )
        : '';

      var taskHistoryHtml = chatSummaryTasks.length
        ? (
          '<div class="aiw-st-group-title" style="margin-top:16px;">该对话的摘要任务状态</div>' +
          '<div class="aiw-st-card aiw-st-pad">' +
            '<div class="aiw-mem-task-list">' +
              chatSummaryTasks.slice(0, 6).map(function(t) {
                var stText = MEMORY_TASK_STATUS_MAP[t.status] || t.status || '等待中';
                var tTime = formatMemoryDate(t.updatedAt || t.createdAt);
                var taskTitle = t.type === 'merge_summary' ? '摘要合并任务' : '短期摘要任务';
                return (
                  '<div class="aiw-mem-task-item is-' + escapeHtml(t.status || 'pending') + '">' +
                    '<div class="aiw-mem-task-top">' +
                      '<span class="aiw-mem-task-type">' + taskTitle + (t.attempts ? (' · 第 ' + t.attempts + ' 次') : '') + '</span>' +
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
          segmentInfoHtml +
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
        settingsCardHtml +
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

    var autoToggle = layer.querySelector('#aiw-ss-auto-summary');
    if (autoToggle && S() && typeof S().saveMemorySettings === 'function') {
      autoToggle.addEventListener('change', async function() {
        _ctx.memorySettings = await S().saveMemorySettings({
          autoSummary: autoToggle.checked,
          applyStrategyPreset: false
        });
        notifyWorkspaceStateChanged();
        renderCurrentView();
        notifyToast(autoToggle.checked ? '已开启自动摘要' : '已关闭自动摘要（已有摘要仍保留可用）');
      });
    }

    var worldBookToggle = layer.querySelector('#aiw-ss-read-worldbook');
    if (worldBookToggle && S() && typeof S().saveMemorySettings === 'function') {
      worldBookToggle.addEventListener('change', async function() {
        var nextChecked = !!worldBookToggle.checked;
        try {
          _ctx.memorySettings = await S().saveMemorySettings({
            summaryReadWorldBook: nextChecked,
            applyStrategyPreset: false
          });
          notifyWorkspaceStateChanged();
          renderCurrentView();
          notifyToast(nextChecked ? '已开启摘要读取世界书' : '已关闭摘要读取世界书');
        } catch (_) {
          worldBookToggle.checked = !nextChecked;
          notifyToast('保存摘要读取世界书设置失败，请稍后重试');
        }
      });
    }

    var maxCustomPromptLen = (S() && Number(S().MAX_CUSTOM_SUMMARY_PROMPT_LENGTH)) || 1000;
    var customPromptEl = layer.querySelector('#aiw-ss-custom-prompt');
    var customPromptCountEl = layer.querySelector('#aiw-ss-custom-prompt-count');
    var customPromptHintEl = layer.querySelector('#aiw-ss-custom-prompt-hint');
    if (customPromptEl) {
      var prevOverLimit = String(customPromptEl.value || '').replace(/\r\n/g, '\n').length > maxCustomPromptLen;
      customPromptEl.addEventListener('input', function() {
        var rawVal = String(customPromptEl.value || '');
        _ctx.summaryCustomPromptDraft = rawVal;
        var len = rawVal.replace(/\r\n/g, '\n').length;
        var isOver = len > maxCustomPromptLen;
        if (customPromptCountEl) {
          customPromptCountEl.textContent = len + ' / ' + maxCustomPromptLen + ' 字';
          customPromptCountEl.classList.toggle('is-over', isOver);
        }
        customPromptEl.classList.toggle('is-invalid', isOver);
        if (customPromptHintEl) {
          customPromptHintEl.classList.toggle('is-error', isOver);
          customPromptHintEl.textContent = isOver
            ? ('已超出 ' + maxCustomPromptLen + ' 字上限（超出 ' + (len - maxCustomPromptLen) + ' 字），请精简后再保存')
            : ('可选，最多 ' + maxCustomPromptLen + ' 字；留空时保持默认摘要行为');
        }
        if (!prevOverLimit && isOver) {
          notifyToast('自定义摘要要求最多 ' + maxCustomPromptLen + ' 字，请精简后再保存');
        }
        prevOverLimit = isOver;
      });
    }

    var saveBtn = layer.querySelector('#aiw-ss-settings-save');
    if (saveBtn && S() && typeof S().saveMemorySettings === 'function') {
      saveBtn.addEventListener('click', async function() {
        var bounds = S().MEMORY_SETTING_BOUNDS || {};
        var recentEl = layer.querySelector('#aiw-ss-recent-limit');
        var intervalEl = layer.querySelector('#aiw-ss-interval-msgs');
        var mergeEl = layer.querySelector('#aiw-ss-merge-threshold');
        var autoEl = layer.querySelector('#aiw-ss-auto-summary');
        var worldBookEl = layer.querySelector('#aiw-ss-read-worldbook');
        var promptEl = layer.querySelector('#aiw-ss-custom-prompt');
        var promptHintEl = layer.querySelector('#aiw-ss-custom-prompt-hint');

        var rawRecent = recentEl ? Number(recentEl.value) : NaN;
        var rawInterval = intervalEl ? Number(intervalEl.value) : NaN;
        var rawMerge = mergeEl ? Number(mergeEl.value) : NaN;

        if (!Number.isFinite(rawRecent) || !Number.isFinite(rawInterval) || !Number.isFinite(rawMerge)) {
          notifyToast('请输入有效的数字参数');
          return;
        }

        var rawCustomPrompt = promptEl ? String(promptEl.value || '') : '';
        var normalizedCustomPrompt = rawCustomPrompt.replace(/\r\n/g, '\n');
        if (normalizedCustomPrompt.length > maxCustomPromptLen) {
          _ctx.summaryCustomPromptDraft = rawCustomPrompt;
          if (promptEl) {
            promptEl.classList.add('is-invalid');
            promptEl.focus();
          }
          if (promptHintEl) {
            promptHintEl.classList.add('is-error');
            promptHintEl.textContent = '已超出 ' + maxCustomPromptLen + ' 字上限（超出 ' + (normalizedCustomPrompt.length - maxCustomPromptLen) + ' 字），请精简后再保存';
          }
          notifyToast('自定义摘要要求不能超过 ' + maxCustomPromptLen + ' 字，请精简后再保存');
          return;
        }

        var outOfRange =
          (bounds.recentRawMessagesLimit && (rawRecent < bounds.recentRawMessagesLimit.min || rawRecent > bounds.recentRawMessagesLimit.max)) ||
          (bounds.summaryIntervalMessages && (rawInterval < bounds.summaryIntervalMessages.min || rawInterval > bounds.summaryIntervalMessages.max)) ||
          (bounds.summaryMergeThreshold && (rawMerge < bounds.summaryMergeThreshold.min || rawMerge > bounds.summaryMergeThreshold.max));

        var checkedModeEl = layer.querySelector('input[name="aiw-ss-model-mode"]:checked');
        var selectedSummaryModelMode = (checkedModeEl && !checkedModeEl.disabled && checkedModeEl.value === 'independent')
          ? 'independent'
          : 'follow_chat';

        try {
          _ctx.memorySettings = await S().saveMemorySettings({
            autoSummary: autoEl ? autoEl.checked : true,
            summaryReadWorldBook: worldBookEl ? !!worldBookEl.checked : false,
            recentRawMessagesLimit: rawRecent,
            summaryIntervalMessages: rawInterval,
            summaryMergeThreshold: rawMerge,
            summaryModelMode: selectedSummaryModelMode,
            customSummaryPrompt: normalizedCustomPrompt.trim(),
            applyStrategyPreset: false
          });
          _ctx.summaryCustomPromptDraft = null;
          notifyWorkspaceStateChanged();
          renderCurrentView();
          notifyToast(outOfRange ? '部分参数超出安全范围，已自动修正并保存' : '摘要设置已保存');
        } catch (_) {
          _ctx.summaryCustomPromptDraft = rawCustomPrompt;
          if (promptHintEl) {
            promptHintEl.classList.add('is-error');
            promptHintEl.textContent = '保存失败，已保留当前输入，请稍后重试';
          }
          notifyToast('保存摘要设置失败，已保留当前输入，请稍后重试');
        }
      });
    }

    layer.querySelectorAll('input[name="aiw-ss-model-mode"]').forEach(function(radio) {
      radio.addEventListener('change', async function() {
        if (!radio.checked || radio.disabled) return;
        if (!S() || typeof S().saveMemorySettings !== 'function') return;
        var summaryApiReady = !!(_ctx.summaryApiConfig && _ctx.summaryApiConfig.complete);
        var nextMode = radio.value === 'independent' ? 'independent' : 'follow_chat';
        if (nextMode === 'independent' && !summaryApiReady) {
          _ctx.summaryApiPanelOpen = true;
          renderCurrentView();
          notifyToast('独立摘要配置不完整，请先完成配置');
          return;
        }
        try {
          _ctx.memorySettings = await S().saveMemorySettings({
            summaryModelMode: nextMode,
            applyStrategyPreset: false
          });
          notifyWorkspaceStateChanged();
          renderCurrentView();
          notifyToast(nextMode === 'independent' ? '摘要模型已切换为「使用独立摘要模型」' : '摘要模型已切换为「跟随本对话」');
        } catch (_) {
          notifyToast('保存摘要模型选择失败，请稍后重试');
        }
      });
    });

    var indToggleBtn = layer.querySelector('#aiw-ss-ind-toggle');
    if (indToggleBtn) {
      indToggleBtn.addEventListener('click', function() {
        _ctx.summaryApiPanelOpen = !_ctx.summaryApiPanelOpen;
        renderCurrentView();
      });
    }

    var indOptionEl = layer.querySelector('#aiw-ss-ind-option');
    if (indOptionEl) {
      indOptionEl.addEventListener('click', function() {
        var ready = !!(_ctx.summaryApiConfig && _ctx.summaryApiConfig.complete);
        if (!ready) {
          notifyToast('请先完成独立摘要模型配置（Base URL、API Key 与模型名称）');
          if (!_ctx.summaryApiPanelOpen) {
            _ctx.summaryApiPanelOpen = true;
            renderCurrentView();
          }
        }
      });
    }

    var indSaveBtn = layer.querySelector('#aiw-ss-ind-save');
    if (indSaveBtn && S() && typeof S().saveSummaryApiConfig === 'function') {
      indSaveBtn.addEventListener('click', async function() {
        var urlEl = layer.querySelector('#aiw-ss-ind-baseurl');
        var keyEl = layer.querySelector('#aiw-ss-ind-apikey');
        var modelEl = layer.querySelector('#aiw-ss-ind-model');
        var tempEl = layer.querySelector('#aiw-ss-ind-temp');

        var baseUrl = urlEl ? String(urlEl.value || '').trim().replace(/\/+$/, '') : '';
        var typedKey = keyEl ? String(keyEl.value || '').trim() : '';
        var modelName = modelEl ? String(modelEl.value || '').trim() : '';
        var tempRawStr = tempEl ? String(tempEl.value || '').trim() : '';
        var tempVal = tempRawStr === '' ? 0.1 : Number(tempRawStr);

        if (!Number.isFinite(tempVal) || tempVal < 0 || tempVal > 2) {
          notifyToast('温度需为 0 至 2 之间的数字');
          return;
        }
        if (baseUrl && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(baseUrl)) {
          notifyToast('Base URL 格式无效，需以 http:// 或 https:// 开头');
          return;
        }

        var patch = {
          baseUrl: baseUrl,
          model: modelName,
          temperature: Math.round(tempVal * 100) / 100
        };
        if (typedKey) {
          patch.apiKey = typedKey;
        }

        try {
          var saved = await S().saveSummaryApiConfig(patch);
          _ctx.summaryApiConfig = saved;
          if (!saved || !saved.complete) {
            if (typeof S().saveMemorySettings === 'function') {
              _ctx.memorySettings = await S().saveMemorySettings({
                summaryModelMode: 'follow_chat',
                applyStrategyPreset: false
              });
            }
            notifyWorkspaceStateChanged();
            renderCurrentView();
            notifyToast('配置已保存但尚不完整，请补全 Base URL、API Key 和模型名称，当前保持「跟随本对话」');
          } else {
            notifyWorkspaceStateChanged();
            renderCurrentView();
            notifyToast('独立摘要模型配置已保存，现可选择「使用独立摘要模型」');
          }
        } catch (_) {
          notifyToast('保存独立摘要配置失败，请稍后重试');
        }
      });
    }

    var indClearKeyBtn = layer.querySelector('#aiw-ss-ind-clear-key');
    if (indClearKeyBtn && S() && typeof S().saveSummaryApiConfig === 'function') {
      indClearKeyBtn.addEventListener('click', function() {
        showConfirmModal(
          '清除独立摘要 API Key',
          '确认清除已保存的独立摘要 API Key 吗？清除后配置将变为未完成状态，摘要模型会自动切回「跟随本对话」。',
          '确认清除',
          true,
          async function() {
            try {
              _ctx.summaryApiConfig = await S().saveSummaryApiConfig({ clearApiKey: true });
              if (typeof S().saveMemorySettings === 'function') {
                _ctx.memorySettings = await S().saveMemorySettings({
                  summaryModelMode: 'follow_chat',
                  applyStrategyPreset: false
                });
              }
              notifyWorkspaceStateChanged();
              renderCurrentView();
              notifyToast('已清除独立摘要 API Key，已切回「跟随本对话」');
            } catch (_) {
              notifyToast('清除 API Key 失败，请稍后重试');
            }
          }
        );
      });
    }

    var indClearAllBtn = layer.querySelector('#aiw-ss-ind-clear-all');
    if (indClearAllBtn && S() && typeof S().clearSummaryApiConfig === 'function') {
      indClearAllBtn.addEventListener('click', function() {
        showConfirmModal(
          '清空独立摘要配置',
          '确认清空独立摘要模型的 Base URL、API Key、模型名称与温度吗？清空后将切回「跟随本对话」。',
          '确认清空',
          true,
          async function() {
            try {
              _ctx.summaryApiConfig = await S().clearSummaryApiConfig();
              if (typeof S().saveMemorySettings === 'function') {
                _ctx.memorySettings = await S().saveMemorySettings({
                  summaryModelMode: 'follow_chat',
                  applyStrategyPreset: false
                });
              }
              notifyWorkspaceStateChanged();
              renderCurrentView();
              notifyToast('已清空独立摘要配置，已切回「跟随本对话」');
            } catch (_) {
              notifyToast('清空独立摘要配置失败，请稍后重试');
            }
          }
        );
      });
    }
  }

  // ===== 视图 7C：长期记忆独立页面 =====
  var EXPIRED_PREVIEW_MAX_DISPLAY = 10;
  var EXPIRED_PREVIEW_DEFAULT_REASON = '一次性计划日期已过，建议归档';

  function clearExpiredArchivePreviewState() {
    _ctx.expiredPreviewEpoch = (Number(_ctx.expiredPreviewEpoch) || 0) + 1;
    _ctx.expiredPreview = null;
    _ctx.expiredArchiveResult = null;
  }

  function isLongMemoryContextStillActive(expectedEpoch, expectedScopeKey) {
    if ((Number(_ctx.expiredPreviewEpoch) || 0) !== expectedEpoch) return false;
    var layer = getLayer();
    if (!layer || layer.hidden || !layer.classList.contains('open')) return false;
    var topView = _ctx.viewStack[_ctx.viewStack.length - 1] || '';
    if (topView !== 'long-memory') return false;
    var liveAccess = resolveTrustedMemoryAccessContext();
    if (!liveAccess.ok || liveAccess.scopeKey !== expectedScopeKey) return false;
    return true;
  }

  function formatExpiredArchiveResultMessage(archivedCount, skippedCount, failedCount) {
    var base = '成功归档 ' + archivedCount + ' 条、跳过 ' + skippedCount + ' 条、失败 ' + failedCount + ' 条';
    if (archivedCount === 0 && failedCount === 0 && skippedCount > 0) {
      return base + '。这些记忆可能已发生变化，请重新预览。';
    }
    if (failedCount > 0) {
      return base + '，可稍后重新预览重试。';
    }
    return base + '。';
  }

  function formatExpiredPlanDate(expirationAt) {
    var num = Number(expirationAt);
    if (!Number.isFinite(num) || num <= 0) return '未知日期';
    var d = new Date(num);
    if (isNaN(d.getTime())) return '未知日期';
    var pad = function(n) { return n < 10 ? '0' + n : String(n); };
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function formatExpiredPreviewSummary(content) {
    var clean = String(content || '')
      .replace(/\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{8,}\b/gi, '[已脱敏]')
      .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi, '[已脱敏]')
      .replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, '[已脱敏]')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return '（无内容摘要）';
    return clean.length > 72 ? (clean.slice(0, 72) + '…') : clean;
  }

  function buildExpiredArchivePreviewState(nowTs) {
    var mgrMod = Mgr();
    var access = resolveTrustedMemoryAccessContext();
    if (!access.ok || !mgrMod || typeof mgrMod.previewExpiredMemoryArchive !== 'function') {
      return {
        status: 'unavailable',
        scopeKey: access.scopeKey || '',
        totalCandidateCount: 0,
        displayedItems: [],
        remainingCount: 0
      };
    }

    var accessibleMemories = access.accessibleMemories;
    var effectiveNow = (typeof nowTs === 'number' && Number.isFinite(nowTs)) ? nowTs : Date.now();
    var previewRes = null;
    try {
      previewRes = mgrMod.previewExpiredMemoryArchive(accessibleMemories, effectiveNow);
    } catch (_) {
      return {
        status: 'unavailable',
        scopeKey: access.scopeKey,
        totalCandidateCount: 0,
        displayedItems: [],
        remainingCount: 0
      };
    }

    var rawCandidates = previewRes && Array.isArray(previewRes.candidates) ? previewRes.candidates : [];
    var accessibleById = new Map();
    for (var i = 0; i < accessibleMemories.length; i++) {
      var m = accessibleMemories[i];
      if (m && m.id) {
        accessibleById.set(String(m.id).trim(), m);
      }
    }

    var matchedItems = [];
    for (var j = 0; j < rawCandidates.length; j++) {
      var cand = rawCandidates[j];
      if (!cand || typeof cand !== 'object') continue;
      var memId = String(cand.memoryId || '').trim();
      if (!memId) continue;
      var mem = accessibleById.get(memId);
      if (!mem) continue;
      matchedItems.push({
        memoryId: memId,
        summary: formatExpiredPreviewSummary(mem.content),
        dateLabel: formatExpiredPlanDate(cand.expirationAt),
        reason: String(cand.reason || EXPIRED_PREVIEW_DEFAULT_REASON)
      });
    }

    var displayedItems = matchedItems.slice(0, EXPIRED_PREVIEW_MAX_DISPLAY);
    var remainingCount = Math.max(0, matchedItems.length - displayedItems.length);
    return {
      status: 'ready',
      scopeKey: access.scopeKey,
      totalCandidateCount: matchedItems.length,
      displayedItems: displayedItems,
      remainingCount: remainingCount
    };
  }

  function renderExpiredArchivePreviewHtml() {
    var liveAccess = resolveTrustedMemoryAccessContext();

    // 若刚完成一次确认归档且仍处于同一权限范围，展示简洁结果提示
    var resState = _ctx.expiredArchiveResult;
    if (resState && typeof resState === 'object') {
      if (!liveAccess.ok || liveAccess.scopeKey !== resState.scopeKey) {
        _ctx.expiredArchiveResult = null;
      } else if (!_ctx.expiredPreview) {
        var toneCls = resState.failedCount > 0 ? 'is-warn' : (resState.archivedCount > 0 ? 'is-ok' : 'is-neutral');
        return (
          '<div class="aiw-st-card aiw-st-pad aiw-expired-preview-card aiw-expired-result-card" id="aiw-expired-archive-result">' +
            '<div class="aiw-expired-preview-title-row">' +
              '<span class="aiw-expired-preview-title">' +
                '<i class="fa-solid fa-box-archive"></i> 归档执行结果' +
              '</span>' +
              '<button type="button" class="aiw-expired-preview-close" id="aiw-mem-expired-result-close" aria-label="关闭结果提示">收起</button>' +
            '</div>' +
            '<div class="aiw-expired-preview-state ' + toneCls + '" id="aiw-expired-archive-result-text">' +
              '<span>' + escapeHtml(resState.message || '') + '</span>' +
            '</div>' +
          '</div>'
        );
      }
    }

    var state = _ctx.expiredPreview;
    if (!state || typeof state !== 'object') return '';

    // 校验当前权限范围未发生变化，防止跨聊天/跨项目/切换用户后复用旧预演结果
    if (state.status === 'ready') {
      if (!liveAccess.ok || liveAccess.scopeKey !== state.scopeKey) {
        _ctx.expiredPreview = null;
        return '';
      }
    } else if (state.status === 'unavailable') {
      if (liveAccess.ok && state.scopeKey && liveAccess.scopeKey !== state.scopeKey) {
        _ctx.expiredPreview = null;
        return '';
      }
    }

    var headerHtml =
      '<div class="aiw-expired-preview-head">' +
        '<div class="aiw-expired-preview-title-row">' +
          '<span class="aiw-expired-preview-title">' +
            '<i class="fa-regular fa-clock"></i> 过期记忆预演' +
          '</span>' +
          '<button type="button" class="aiw-expired-preview-close" id="aiw-mem-expired-preview-close" aria-label="收起预演结果">收起</button>' +
        '</div>' +
        '<div class="aiw-expired-preview-note">仅只读预演，不会自动归档或修改任何记忆。</div>' +
      '</div>';

    if (state.status === 'unavailable') {
      return (
        '<div class="aiw-st-card aiw-st-pad aiw-expired-preview-card" id="aiw-expired-preview-card">' +
          headerHtml +
          '<div class="aiw-expired-preview-state is-unavailable" id="aiw-expired-preview-unavailable">' +
            '<i class="fa-solid fa-shield-halved"></i>' +
            '<span>当前无法安全预览记忆，请重新进入知屿后重试。</span>' +
          '</div>' +
        '</div>'
      );
    }

    var totalCount = Math.max(0, Number(state.totalCandidateCount) || 0);
    if (totalCount === 0) {
      return (
        '<div class="aiw-st-card aiw-st-pad aiw-expired-preview-card" id="aiw-expired-preview-card">' +
          headerHtml +
          '<div class="aiw-expired-preview-state is-empty" id="aiw-expired-preview-empty">' +
            '<i class="fa-regular fa-circle-check"></i>' +
            '<span>目前没有需要建议归档的一次性计划。</span>' +
          '</div>' +
        '</div>'
      );
    }

    var displayed = Array.isArray(state.displayedItems) ? state.displayedItems : [];
    var remaining = Math.max(0, Number(state.remainingCount) || 0);
    var itemsHtml = displayed.map(function(item, idx) {
      return (
        '<div class="aiw-expired-preview-item" data-preview-mem-id="' + escapeHtml(item.memoryId) + '">' +
          '<div class="aiw-expired-preview-item-top">' +
            '<span class="aiw-expired-preview-idx">#' + (idx + 1) + '</span>' +
            '<span class="aiw-expired-preview-date">' +
              '<i class="fa-regular fa-calendar"></i> 计划日期：' + escapeHtml(item.dateLabel) +
            '</span>' +
          '</div>' +
          '<div class="aiw-expired-preview-summary">' + escapeHtml(item.summary) + '</div>' +
          '<div class="aiw-expired-preview-reason">' + escapeHtml(item.reason) + '</div>' +
        '</div>'
      );
    }).join('');

    var moreHtml = remaining > 0
      ? '<div class="aiw-expired-preview-more" id="aiw-expired-preview-more">当前仅展示前 ' + displayed.length + ' 条，还有 ' + remaining + ' 条未展示。</div>'
      : '';

    var canExecute = !!(displayed.length > 0 && Mgr() && typeof Mgr().executeExpiredMemoryArchive === 'function');
    var batchCount = displayed.length;
    var confirmBtnLabel = _ctx.expiredArchiveRunning
      ? '正在归档...'
      : (remaining > 0 ? ('确认归档这 ' + batchCount + ' 条') : ('确认归档 ' + batchCount + ' 条'));
    var actionHtml = canExecute
      ? (
        '<div class="aiw-expired-preview-actions">' +
          '<div class="aiw-expired-preview-action-note">归档后记忆仍会保留，可在『已归档』中恢复。日期已过不代表任务已完成。</div>' +
          '<button type="button" class="aiw-st-btn-primary aiw-st-btn-sm aiw-expired-confirm-btn" id="aiw-mem-expired-confirm-btn"' + (_ctx.expiredArchiveRunning ? ' disabled' : '') + '>' +
            '<i class="fa-solid fa-box-archive"></i> ' + escapeHtml(confirmBtnLabel) +
          '</button>' +
        '</div>'
      )
      : '';

    return (
      '<div class="aiw-st-card aiw-st-pad aiw-expired-preview-card" id="aiw-expired-preview-card">' +
        headerHtml +
        '<div class="aiw-expired-preview-count" id="aiw-expired-preview-count">共找到 <strong>' + totalCount + '</strong> 条建议归档的过期一次性计划</div>' +
        '<div class="aiw-expired-preview-list" id="aiw-expired-preview-list">' + itemsHtml + '</div>' +
        moreHtml +
        actionHtml +
      '</div>'
    );
  }

  async function runConfirmedExpiredArchive(layer, expectedScopeKey, candidateIds, expectedEpoch) {
    if (_ctx.expiredArchiveRunning) return;

    var mgrMod = Mgr();
    if (!mgrMod || typeof mgrMod.executeExpiredMemoryArchive !== 'function') {
      notifyToast('当前无法执行归档，请稍后重试');
      return;
    }

    // 执行前重新获取当前可信权限上下文并比对 scopeKey，绝不直接信任旧预演上下文
    var liveAccess = resolveTrustedMemoryAccessContext();
    if (!liveAccess.ok) {
      clearExpiredArchivePreviewState();
      var slotUnavail = layer && layer.querySelector('#aiw-expired-preview-slot');
      if (slotUnavail) slotUnavail.innerHTML = '';
      notifyToast('当前无法安全预览记忆，请重新进入知屿后重试。');
      return;
    }
    if ((Number(_ctx.expiredPreviewEpoch) || 0) !== expectedEpoch || liveAccess.scopeKey !== expectedScopeKey) {
      clearExpiredArchivePreviewState();
      var slotChanged = layer && layer.querySelector('#aiw-expired-preview-slot');
      if (slotChanged) slotChanged.innerHTML = '';
      notifyToast('当前聊天或项目范围已变化，请重新预览后再试。');
      return;
    }

    // 仅允许提交当前展示批次（最多 10 条）的非空去重 ID
    var batchIds = [];
    var seenBatch = new Set();
    for (var i = 0; i < (Array.isArray(candidateIds) ? candidateIds.length : 0) && batchIds.length < EXPIRED_PREVIEW_MAX_DISPLAY; i++) {
      var idStr = String(candidateIds[i] || '').trim();
      if (!idStr || seenBatch.has(idStr)) continue;
      seenBatch.add(idStr);
      batchIds.push(idStr);
    }
    if (!batchIds.length) {
      clearExpiredArchivePreviewState();
      var slotEmpty = layer && layer.querySelector('#aiw-expired-preview-slot');
      if (slotEmpty) slotEmpty.innerHTML = '';
      notifyToast('没有可归档的候选记忆，请重新预览。');
      return;
    }

    _ctx.expiredArchiveRunning = true;
    var confirmBtn = layer && layer.querySelector('#aiw-mem-expired-confirm-btn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '正在归档...';
    }

    var runEpoch = expectedEpoch;
    var runScopeKey = liveAccess.scopeKey;
    var execRes = null;
    var execFailed = false;
    try {
      execRes = await mgrMod.executeExpiredMemoryArchive(batchIds, {
        userId: liveAccess.userId,
        chatId: liveAccess.chatId,
        projectId: liveAccess.projectId,
        allowCrossChat: liveAccess.allowCrossChat,
        nowTs: Date.now()
      });
    } catch (_) {
      execFailed = true;
    }

    try {
      // 若执行期间用户关闭设置、切换页面或切换聊天/项目，绝不将旧异步结果渲染到新页面或覆盖新状态
      if (!isLongMemoryContextStillActive(runEpoch, runScopeKey)) {
        return;
      }

      var archivedCount = (!execFailed && execRes && Array.isArray(execRes.archivedIds)) ? execRes.archivedIds.length : 0;
      var skippedCount = (!execFailed && execRes && Array.isArray(execRes.skippedIds)) ? execRes.skippedIds.length : 0;
      var failedCount = execFailed
        ? batchIds.length
        : ((execRes && Array.isArray(execRes.failedIds)) ? execRes.failedIds.length : 0);

      var freshMemories = (S() && typeof S().listMemories === 'function')
        ? await S().listMemories()
        : (_ctx.memories || []);

      if (!isLongMemoryContextStillActive(runEpoch, runScopeKey)) {
        return;
      }

      _ctx.memories = Array.isArray(freshMemories) ? freshMemories : [];
      _ctx.expiredPreview = null;
      var summaryMsg = formatExpiredArchiveResultMessage(archivedCount, skippedCount, failedCount);
      _ctx.expiredArchiveResult = {
        scopeKey: runScopeKey,
        archivedCount: archivedCount,
        skippedCount: skippedCount,
        failedCount: failedCount,
        message: summaryMsg
      };
      notifyWorkspaceStateChanged();
      renderCurrentView();
      notifyToast(summaryMsg);
    } finally {
      _ctx.expiredArchiveRunning = false;
    }
  }

  function openExpiredArchiveConfirmModal(layer) {
    if (_ctx.expiredArchiveRunning) return;

    var state = _ctx.expiredPreview;
    if (!state || state.status !== 'ready' || !Array.isArray(state.displayedItems) || !state.displayedItems.length) {
      return;
    }

    var liveAccess = resolveTrustedMemoryAccessContext();
    if (!liveAccess.ok) {
      clearExpiredArchivePreviewState();
      var slotUnavail = layer && layer.querySelector('#aiw-expired-preview-slot');
      if (slotUnavail) slotUnavail.innerHTML = '';
      notifyToast('当前无法安全预览记忆，请重新进入知屿后重试。');
      return;
    }
    if (liveAccess.scopeKey !== state.scopeKey) {
      clearExpiredArchivePreviewState();
      var slotChanged = layer && layer.querySelector('#aiw-expired-preview-slot');
      if (slotChanged) slotChanged.innerHTML = '';
      notifyToast('当前聊天或项目范围已变化，请重新预览后再试。');
      return;
    }

    // 仅提取当前展示的前 N 条（最多 10 条）候选 ID
    var visibleItems = state.displayedItems.slice(0, EXPIRED_PREVIEW_MAX_DISPLAY);
    var batchIds = visibleItems.map(function(it) { return it.memoryId; }).filter(Boolean);
    if (!batchIds.length) return;

    var batchCount = batchIds.length;
    var remaining = Math.max(0, Number(state.remainingCount) || 0);
    var expectedScopeKey = state.scopeKey;
    var expectedEpoch = Number(_ctx.expiredPreviewEpoch) || 0;

    var batchNote = remaining > 0
      ? ('本次最多尝试归档当前展示的 ' + batchCount + ' 条记忆（其余 ' + remaining + ' 条本次不会归档，可稍后重新预览分批处理）。')
      : ('本次最多尝试归档 ' + batchCount + ' 条记忆。');

    var bodyHtml =
      '<div class="aiw-expired-confirm-body">' +
        '<p class="aiw-st-modal-msg">' + escapeHtml(batchNote) + '</p>' +
        '<ul class="aiw-expired-confirm-list">' +
          '<li>执行前会逐条重新校验，仅归档仍符合条件的记忆。</li>' +
          '<li>不会删除记忆，也不会将其标记为已完成。</li>' +
          '<li>归档后可随时在「已归档」中查看和恢复。</li>' +
        '</ul>' +
      '</div>';

    var modal = showCustomModal(
      '确认归档过期记忆',
      bodyHtml,
      '<button type="button" class="aiw-st-btn-secondary" id="aiw-expired-confirm-cancel">取消</button>' +
      '<button type="button" class="aiw-st-btn-primary" id="aiw-expired-confirm-ok">确认归档</button>'
    );
    if (!modal) return;

    var handled = false;
    var cancelBtn = modal.querySelector('#aiw-expired-confirm-cancel');
    var okBtn = modal.querySelector('#aiw-expired-confirm-ok');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', closeModalOverlay);
    }
    if (okBtn) {
      okBtn.addEventListener('click', async function() {
        if (handled || _ctx.expiredArchiveRunning) return;
        handled = true;
        closeModalOverlay();
        await runConfirmedExpiredArchive(layer, expectedScopeKey, batchIds, expectedEpoch);
      });
    }
  }

  function bindExpiredPreviewEvents(layer) {
    if (!layer) return;
    var closeBtn = layer.querySelector('#aiw-mem-expired-preview-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        clearExpiredArchivePreviewState();
        var slotEl = layer.querySelector('#aiw-expired-preview-slot');
        if (slotEl) slotEl.innerHTML = '';
      });
    }
    var closeResultBtn = layer.querySelector('#aiw-mem-expired-result-close');
    if (closeResultBtn) {
      closeResultBtn.addEventListener('click', function() {
        _ctx.expiredArchiveResult = null;
        var slotEl = layer.querySelector('#aiw-expired-preview-slot');
        if (slotEl) slotEl.innerHTML = '';
      });
    }
    var confirmBtn = layer.querySelector('#aiw-mem-expired-confirm-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function() {
        openExpiredArchiveConfirmModal(layer);
      });
    }
  }

  function renderLongMemoryHtml() {
    var allList = _ctx.memories || [];
    var counts = getMemoryLifecycleCounts(allList);
    var curTab = _ctx.memoryLifecycleTab || 'active';
    var filtered = getFilteredMemories();

    var tabsSpec = [
      { id: 'active', label: '当前有效', count: counts.active },
      { id: 'historical', label: '历史记忆', count: counts.historical },
      { id: 'archived', label: '已归档', count: counts.archived },
      { id: 'all', label: '全部', count: counts.all }
    ];
    var tabsHtml = tabsSpec.map(function(t) {
      var activeCls = curTab === t.id ? ' active' : '';
      return (
        '<button type="button" class="aiw-mem-tab-btn' + activeCls + '" data-mem-tab="' + t.id + '">' +
          '<span>' + t.label + '</span>' +
          '<span class="aiw-mem-tab-num">' + t.count + '</span>' +
        '</button>'
      );
    }).join('');

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
            '<input type="search" class="aiw-mem-search-input" id="aiw-mem-search" value="' + escapeHtml(_ctx.memorySearchQuery || '') + '" placeholder="搜索长期记忆内容、场景、分类或来源对话">' +
          '</div>' +
        '</div>' +

        '<div class="aiw-mem-tabs" id="aiw-mem-tabs">' + tabsHtml + '</div>' +

        '<div class="aiw-mem-count-bar">' +
          '<span class="aiw-pr-count" id="aiw-mem-count-text">当前视图 ' + filtered.length + ' 条 / 共 ' + allList.length + ' 条</span>' +
          '<div class="aiw-mem-bar-btns">' +
            '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-mem-expired-preview-btn">' +
              '<i class="fa-regular fa-clock"></i> 预览过期记忆' +
            '</button>' +
            '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-mem-organize-btn"' + (allList.length ? '' : ' disabled') + '>' +
              '<i class="fa-solid fa-wand-magic-sparkles"></i> 智能整理' +
            '</button>' +
            '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm aiw-btn-text-danger" id="aiw-mem-clear-all"' + (allList.length ? '' : ' disabled') + '>' +
              '<i class="fa-regular fa-trash-can"></i> 清空全部' +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div class="aiw-expired-preview-slot" id="aiw-expired-preview-slot">' + renderExpiredArchivePreviewHtml() + '</div>' +

        '<div class="aiw-mem-list" id="aiw-mem-list">' + renderMemoryCardsHtml(filtered) + '</div>' +
      '</div>'
    );
  }

  function bindLongMemoryEvents(layer) {
    var searchInput = layer.querySelector('#aiw-mem-search');
    var addBtn = layer.querySelector('#aiw-mem-add-btn');
    var previewExpiredBtn = layer.querySelector('#aiw-mem-expired-preview-btn');
    var organizeBtn = layer.querySelector('#aiw-mem-organize-btn');
    var clearAllBtn = layer.querySelector('#aiw-mem-clear-all');

    layer.querySelectorAll('[data-mem-tab]').forEach(function(tabBtn) {
      tabBtn.addEventListener('click', function() {
        _ctx.memoryLifecycleTab = tabBtn.getAttribute('data-mem-tab') || 'active';
        renderCurrentView();
      });
    });

    if (searchInput) {
      searchInput.addEventListener('input', function() {
        _ctx.memorySearchQuery = searchInput.value || '';
        var filtered = getFilteredMemories();
        var listEl = layer.querySelector('#aiw-mem-list');
        var countEl = layer.querySelector('#aiw-mem-count-text');
        if (listEl) listEl.innerHTML = renderMemoryCardsHtml(filtered);
        if (countEl) {
          countEl.textContent = '当前视图 ' + filtered.length + ' 条 / 共 ' + (_ctx.memories || []).length + ' 条';
        }
        bindMemoryListItemEvents(layer);
      });
    }

    if (addBtn) {
      addBtn.addEventListener('click', function() {
        openMemoryEditorModal(layer, null);
      });
    }

    if (previewExpiredBtn) {
      previewExpiredBtn.addEventListener('click', function() {
        _ctx.expiredArchiveResult = null;
        _ctx.expiredPreview = buildExpiredArchivePreviewState(Date.now());
        var slotEl = layer.querySelector('#aiw-expired-preview-slot');
        if (slotEl) {
          slotEl.innerHTML = renderExpiredArchivePreviewHtml();
          bindExpiredPreviewEvents(layer);
        }
      });
    }

    if (organizeBtn) {
      organizeBtn.addEventListener('click', async function() {
        if (!Mgr() || typeof Mgr().runLifecycleMaintenance !== 'function') return;
        organizeBtn.disabled = true;
        try {
          var res = await Mgr().runLifecycleMaintenance({ userId: 'local_user' });
          _ctx.memories = await S().listMemories();
          clearExpiredArchivePreviewState();
          notifyWorkspaceStateChanged();
          renderCurrentView();
          var parts = [];
          if (res.mergedCount) parts.push('合并 ' + res.mergedCount + ' 条重复');
          if (res.archivedCount) parts.push('归档 ' + res.archivedCount + ' 条过时');
          if (res.rescoredCount) parts.push('更新 ' + res.rescoredCount + ' 条评分');
          if (res.linkedCount) parts.push('刷新 ' + res.linkedCount + ' 条关联');
          notifyToast(parts.length ? ('智能整理完成：' + parts.join('，')) : '记忆库状态整洁，无需额外调整');
        } catch (_) {
          organizeBtn.disabled = false;
          notifyToast('智能整理执行失败，请稍后重试');
        }
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
            clearExpiredArchivePreviewState();
            notifyWorkspaceStateChanged();
            renderCurrentView();
            notifyToast('已清空全部长期记忆');
          }
        );
      });
    }

    bindExpiredPreviewEvents(layer);
    bindMemoryListItemEvents(layer);
  }

  var RECALL_SOURCE_LABEL_MAP = {
    direct: '直接召回',
    semantic_fallback: '语义兜底',
    related: '关联补充'
  };

  var RECALL_RELATION_LABEL_MAP = {
    project_part: '同项目',
    supports_goal: '项目目标',
    uses_tech: '技术栈',
    related_plan: '关联计划',
    related_entity: '关联主题'
  };

  function formatRecallTimestamp(ts) {
    var num = Number(ts);
    if (!Number.isFinite(num) || num <= 0) return '暂无时间';
    var d = new Date(num);
    if (isNaN(d.getTime())) return '暂无时间';
    var pad = function(n) { return n < 10 ? '0' + n : String(n); };
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    );
  }

  function formatRecallRelationLabel(relationType) {
    var raw = String(relationType || '').trim();
    if (!raw) return '未标注关系';
    var mapped = RECALL_RELATION_LABEL_MAP[raw];
    return mapped ? (mapped + ' (' + raw + ')') : raw;
  }

  function getRecallSourceClass(source) {
    if (source === 'direct') return 'is-direct';
    if (source === 'semantic_fallback') return 'is-semantic';
    if (source === 'related') return 'is-related';
    return 'is-unknown';
  }

  function resolveSettingsTrustedUserId() {
    var store = S();
    if (!store) return '';
    if (typeof store.getCurrentUserId === 'function') {
      try {
        return String(store.getCurrentUserId() || '').trim();
      } catch (_) {
        return '';
      }
    }
    return 'local_user';
  }

  function resolveTrustedMemoryAccessContext() {
    var store = S();
    var memMod = M();
    if (!store || !memMod || typeof memMod.filterAccessibleMemories !== 'function') {
      return { ok: false, scopeKey: '', userId: '', chatId: '', projectId: '', allowCrossChat: false, accessibleMemories: [] };
    }

    var userId = resolveSettingsTrustedUserId();
    if (!userId || userId === '*' || userId.toLowerCase() === 'all' || userId.toLowerCase() === 'any') {
      return { ok: false, scopeKey: '', userId: '', chatId: '', projectId: '', allowCrossChat: false, accessibleMemories: [] };
    }

    var ms = _ctx.memorySettings;
    if (!ms || typeof ms !== 'object' || typeof ms.crossChatMemory !== 'boolean') {
      return { ok: false, scopeKey: '', userId: '', chatId: '', projectId: '', allowCrossChat: false, accessibleMemories: [] };
    }
    var allowCrossChat = ms.crossChatMemory;

    var rawActiveChatId = String(_ctx.activeChatId || '').trim();
    var chats = Array.isArray(_ctx.chats) ? _ctx.chats : [];
    var chatId = '';
    var projectId = '';

    if (rawActiveChatId) {
      var activeChat = chats.find(function(c) { return c && String(c.id || '').trim() === rawActiveChatId; });
      if (!activeChat) {
        return { ok: false, scopeKey: '', userId: '', chatId: '', projectId: '', allowCrossChat: false, accessibleMemories: [] };
      }
      if (activeChat.userId && String(activeChat.userId).trim() !== userId) {
        return { ok: false, scopeKey: '', userId: '', chatId: '', projectId: '', allowCrossChat: false, accessibleMemories: [] };
      }
      chatId = String(activeChat.id || '').trim();
      projectId = String(activeChat.projectId || '').trim();
    } else if (!allowCrossChat) {
      return { ok: false, scopeKey: '', userId: '', chatId: '', projectId: '', allowCrossChat: false, accessibleMemories: [] };
    }

    var allMemories = Array.isArray(_ctx.memories) ? _ctx.memories : [];
    var accessibleMemories = memMod.filterAccessibleMemories(allMemories, {
      userId: userId,
      chatId: chatId,
      projectId: projectId,
      allowCrossChat: allowCrossChat
    });

    return {
      ok: true,
      scopeKey: [userId, chatId, projectId, allowCrossChat ? '1' : '0'].join('|'),
      userId: userId,
      chatId: chatId,
      projectId: projectId,
      allowCrossChat: allowCrossChat,
      accessibleMemories: Array.isArray(accessibleMemories) ? accessibleMemories : []
    };
  }

  function buildRecallDiagnosticsFilter() {
    var memMod = M();
    if (!memMod || typeof memMod.getRecentRecallDiagnostics !== 'function') {
      return { ok: false, filter: null };
    }
    var access = resolveTrustedMemoryAccessContext();
    if (!access.ok) {
      return { ok: false, filter: null };
    }

    var validMemoryIds = [];
    for (var i = 0; i < access.accessibleMemories.length; i++) {
      if (access.accessibleMemories[i] && access.accessibleMemories[i].id) {
        validMemoryIds.push(String(access.accessibleMemories[i].id));
      }
    }

    return {
      ok: true,
      filter: {
        userId: access.userId,
        chatId: access.chatId,
        projectId: access.projectId,
        allowCrossChat: access.allowCrossChat,
        validMemoryIds: validMemoryIds
      }
    };
  }

  function renderRecentRecallDiagnosticsHtml() {
    var built = buildRecallDiagnosticsFilter();
    var headerHtml =
      '<div class="aiw-recall-diag-head">' +
        '<div class="aiw-recall-diag-title-row">' +
          '<span class="aiw-recall-diag-title"><i class="fa-solid fa-magnifying-glass-chart"></i> 最近召回诊断</span>' +
        '</div>' +
        '<div class="aiw-recall-diag-note">仅显示本次运行最近 5 次召回，不会永久保存。</div>' +
      '</div>';

    if (!built.ok) {
      return (
        '<div id="aiw-recall-diag-section" class="aiw-st-card aiw-st-pad aiw-recall-diag-card">' +
          headerHtml +
          '<div class="aiw-recall-diag-state is-unavailable" id="aiw-recall-diag-unavailable">' +
            '<i class="fa-solid fa-shield-halved"></i>' +
            '<span>当前无法读取召回诊断</span>' +
          '</div>' +
        '</div>'
      );
    }

    var snapshots = [];
    try {
      var raw = M().getRecentRecallDiagnostics(built.filter);
      snapshots = Array.isArray(raw) ? raw.slice() : [];
    } catch (_) {
      return (
        '<div id="aiw-recall-diag-section" class="aiw-st-card aiw-st-pad aiw-recall-diag-card">' +
          headerHtml +
          '<div class="aiw-recall-diag-state is-unavailable" id="aiw-recall-diag-unavailable">' +
            '<i class="fa-solid fa-shield-halved"></i>' +
            '<span>当前无法读取召回诊断</span>' +
          '</div>' +
        '</div>'
      );
    }

    if (!snapshots.length) {
      return (
        '<div id="aiw-recall-diag-section" class="aiw-st-card aiw-st-pad aiw-recall-diag-card">' +
          headerHtml +
          '<div class="aiw-recall-diag-state is-empty" id="aiw-recall-diag-empty">' +
            '<i class="fa-regular fa-clock"></i>' +
            '<span>本次运行暂无召回记录，发送消息后可查看。</span>' +
          '</div>' +
        '</div>'
      );
    }

    snapshots.sort(function(a, b) {
      return (Number(b && b.timestamp) || 0) - (Number(a && a.timestamp) || 0);
    });
    if (snapshots.length > 5) snapshots = snapshots.slice(0, 5);

    var snapsHtml = snapshots.map(function(snap, idx) {
      var timeText = formatRecallTimestamp(snap && snap.timestamp);
      var directCount = Math.max(0, Number(snap && snap.directCount) || 0);
      var semCount = Math.max(0, Number(snap && snap.semanticFallbackCount) || 0);
      var relCount = Math.max(0, Number(snap && snap.relatedCount) || 0);
      var items = Array.isArray(snap && snap.items) ? snap.items : [];

      var itemsHtml = items.length
        ? items.map(function(it) {
            var memId = String((it && it.memoryId) || '').trim();
            var src = String((it && it.source) || '').trim();
            var srcLabel = RECALL_SOURCE_LABEL_MAP[src] || src || '未知来源';
            var srcCls = getRecallSourceClass(src);
            var relExtraHtml = '';
            if (src === 'related') {
              var relLabel = formatRecallRelationLabel(it && it.relationType);
              var seedId = String((it && it.seedMemoryId) || '').trim();
              relExtraHtml =
                '<div class="aiw-recall-item-rel">' +
                  '<span class="aiw-recall-rel-type">关系：' + escapeHtml(relLabel) + '</span>' +
                  (seedId ? ('<span class="aiw-recall-rel-seed">起点：' + escapeHtml(seedId) + '</span>') : '') +
                '</div>';
            }
            return (
              '<div class="aiw-recall-item">' +
                '<div class="aiw-recall-item-main">' +
                  '<span class="aiw-recall-item-id">' + escapeHtml(memId || '未知ID') + '</span>' +
                  '<span class="aiw-recall-source-badge ' + srcCls + '">' + escapeHtml(srcLabel) + '</span>' +
                '</div>' +
                relExtraHtml +
              '</div>'
            );
          }).join('')
        : '<div class="aiw-recall-item-none">本次召回未命中可展示的长期记忆</div>';

      return (
        '<div class="aiw-recall-snap-item">' +
          '<div class="aiw-recall-snap-top">' +
            '<span class="aiw-recall-snap-idx">#' + (idx + 1) + '</span>' +
            '<span class="aiw-recall-snap-time">' + escapeHtml(timeText) + '</span>' +
          '</div>' +
          '<div class="aiw-recall-counts">' +
            '<div class="aiw-recall-count-cell is-direct">' +
              '<span class="aiw-recall-count-lbl">直接召回</span>' +
              '<span class="aiw-recall-count-val">' + directCount + '</span>' +
            '</div>' +
            '<div class="aiw-recall-count-cell is-semantic">' +
              '<span class="aiw-recall-count-lbl">语义兜底</span>' +
              '<span class="aiw-recall-count-val">' + semCount + '</span>' +
            '</div>' +
            '<div class="aiw-recall-count-cell is-related">' +
              '<span class="aiw-recall-count-lbl">关联补充</span>' +
              '<span class="aiw-recall-count-val">' + relCount + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="aiw-recall-items">' + itemsHtml + '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<div id="aiw-recall-diag-section" class="aiw-st-card aiw-st-pad aiw-recall-diag-card">' +
        headerHtml +
        '<div class="aiw-recall-snap-list">' + snapsHtml + '</div>' +
      '</div>'
    );
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
        renderRecentRecallDiagnosticsHtml() +
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

  function computeRestoredAutoImportance(existingMem, draftOverrides) {
    var base = existingMem && typeof existingMem === 'object' ? existingMem : {};
    var ov = draftOverrides && typeof draftOverrides === 'object' ? draftOverrides : {};
    var mgr = Mgr();
    var origContent = String(base.content || '').trim();
    var contentVal = ov.content != null ? String(ov.content).trim() : origContent;
    if (!contentVal) contentVal = origContent;
    var categoryVal = ov.category != null ? String(ov.category).trim() : String(base.category || '').trim();

    // 显式解除手动锁定并移除旧手动分，确保 evaluateInitialImportance 基于内容与语义重新计算
    var autoDraft = {
      category: categoryVal,
      content: contentVal,
      rawExpression: contentVal === origContent ? String(base.rawExpression || '') : '',
      temporalState: base.temporalState || 'current',
      status: base.status || 'active',
      factType: base.factType || 'direct_fact',
      userConfirmed: base.userConfirmed === true,
      manualImportance: false
    };

    var initialImp = (mgr && typeof mgr.evaluateInitialImportance === 'function')
      ? mgr.evaluateInitialImportance(autoDraft, {})
      : 3;
    initialImp = Number.isFinite(Number(initialImp))
      ? Math.max(1, Math.min(5, Math.round(Number(initialImp))))
      : 3;

    var indepCount = Math.max(1, Math.round(Number(base.independentMentionCount) || 1));
    var mentionBoost = (mgr && typeof mgr.getIndependentMentionBoost === 'function')
      ? (Number(mgr.getIndependentMentionBoost(indepCount)) || 0)
      : 0;
    var finalImp = Math.max(1, Math.min(5, Math.round(initialImp + mentionBoost)));

    return {
      initialImportance: initialImp,
      independentMentionCount: indepCount,
      mentionBoost: mentionBoost,
      importance: finalImp
    };
  }

  function openMemoryEditorModal(layer, existingMem) {
    var isEdit = !!(existingMem && existingMem.id);
    var categories = (S() && S().MEMORY_CATEGORIES) || ['偏好', '习惯', '长期计划', '项目', '决定', '备忘', '身份信息'];
    var draftCat = (existingMem && existingMem.category) || '偏好';
    var draftScope = (existingMem && existingMem.scope) || 'user';
    var draftImp = (existingMem && existingMem.importance) || 3;
    var draftManualImp = isEdit ? (existingMem.manualImportance === true) : true;
    var lastAutoRestoreInfo = null;
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

    var impHeaderHtml = isEdit
      ? (
        '<div class="aiw-mem-imp-head" style="margin-top:12px;">' +
          '<div class="aiw-mem-imp-title-wrap">' +
            '<label class="aiw-field-label" style="margin:0;">重要程度（1-5）</label>' +
            '<span class="aiw-mem-imp-mode ' + (draftManualImp ? 'is-manual' : 'is-auto') + '" id="aiw-mem-ed-imp-mode">' + (draftManualImp ? '手动锁定' : '自动评分') + '</span>' +
          '</div>' +
          '<button type="button" class="aiw-mem-imp-restore-btn" id="aiw-mem-ed-restore-auto"' + (draftManualImp ? '' : ' hidden') + '>' +
            '<i class="fa-solid fa-rotate-left"></i><span>恢复自动评分</span>' +
          '</button>' +
        '</div>'
      )
      : '<label class="aiw-field-label" style="margin-top:12px;">重要程度（1-5）</label>';

    var impHintHtml = isEdit
      ? '<div class="aiw-mem-imp-hint" id="aiw-mem-ed-imp-hint">' +
          (draftManualImp ? '当前为手动锁定评分，不受自动加权与时间衰减影响' : '当前为自动评分管理，将随重复提及与时间变化自动评估') +
        '</div>'
      : '';

    var bodyHtml =
      '<label class="aiw-field-label" for="aiw-mem-ed-content">记忆内容 *</label>' +
      '<textarea class="aiw-field-textarea" id="aiw-mem-ed-content" rows="4" maxlength="' + escapeHtml(String(maxSingleLen)) + '" placeholder="例如：用户不喜欢香菜，点外卖或推荐食谱时请避开">' + escapeHtml(existingMem ? existingMem.content : '') + '</textarea>' +
      '<label class="aiw-field-label" style="margin-top:12px;">记忆分类</label>' +
      '<div class="aiw-chip-grid">' + catChips + '</div>' +
      '<label class="aiw-field-label" style="margin-top:12px;">适用范围</label>' +
      '<div class="aiw-seg-control">' + scopeSegs + '</div>' +
      impHeaderHtml +
      '<div class="aiw-seg-control">' + impBtns + '</div>' +
      impHintHtml;

    var footerHtml =
      '<button type="button" class="aiw-st-btn-secondary" id="aiw-mem-ed-cancel">取消</button>' +
      '<button type="button" class="aiw-st-btn-primary" id="aiw-mem-ed-save">' + (isEdit ? '保存修改' : '添加记忆') + '</button>';

    var modal = showCustomModal(isEdit ? '编辑长期记忆' : '新增长期记忆', bodyHtml, footerHtml);
    if (!modal) return;

    function syncImportanceUi() {
      modal.querySelectorAll('[data-mem-imp]').forEach(function(b) {
        var val = Number(b.getAttribute('data-mem-imp')) || 3;
        b.classList.toggle('active', val === draftImp);
      });
      if (!isEdit) return;
      var modeEl = modal.querySelector('#aiw-mem-ed-imp-mode');
      var restoreBtn = modal.querySelector('#aiw-mem-ed-restore-auto');
      var hintEl = modal.querySelector('#aiw-mem-ed-imp-hint');
      if (modeEl) {
        modeEl.textContent = draftManualImp ? '手动锁定' : '自动评分';
        modeEl.classList.toggle('is-manual', draftManualImp);
        modeEl.classList.toggle('is-auto', !draftManualImp);
      }
      if (restoreBtn) {
        restoreBtn.hidden = !draftManualImp;
      }
      if (hintEl) {
        if (draftManualImp) {
          hintEl.textContent = '当前为手动锁定评分，不受自动加权与时间衰减影响';
        } else if (lastAutoRestoreInfo) {
          var boostPart = lastAutoRestoreInfo.mentionBoost > 0
            ? ('，含 ' + lastAutoRestoreInfo.independentMentionCount + ' 次独立提及 +' + lastAutoRestoreInfo.mentionBoost + ' 分')
            : '';
          hintEl.textContent = '已恢复自动评分，建议 ' + lastAutoRestoreInfo.importance + ' 分（基础 ' + lastAutoRestoreInfo.initialImportance + ' 分' + boostPart + '），保存后生效';
        } else {
          hintEl.textContent = '当前为自动评分管理，将随重复提及与时间变化自动评估';
        }
      }
    }

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
        // 主动点击评分按钮即视为明确手动评分操作，即使与原分值相同也进入手动锁定
        draftManualImp = true;
        lastAutoRestoreInfo = null;
        syncImportanceUi();
      });
    });

    var restoreAutoBtn = modal.querySelector('#aiw-mem-ed-restore-auto');
    if (restoreAutoBtn && isEdit) {
      restoreAutoBtn.addEventListener('click', function() {
        var contentEl = modal.querySelector('#aiw-mem-ed-content');
        var currentContent = contentEl ? contentEl.value.trim() : '';
        var calc = computeRestoredAutoImportance(existingMem, {
          content: currentContent || existingMem.content,
          category: draftCat
        });
        draftManualImp = false;
        draftImp = calc.importance;
        lastAutoRestoreInfo = calc;
        syncImportanceUi();
      });
    }

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
      var savedId = '';
      var mgr = Mgr();
      var sc = (mgr && typeof mgr.extractScenarioContext === 'function') ? mgr.extractScenarioContext(content) : { code: '', label: '' };
      var ents = (mgr && typeof mgr.extractConcreteEntities === 'function') ? mgr.extractConcreteEntities({ content: content, category: draftCat }) : [];
      if (isEdit) {
        var nextManualImp = draftManualImp === true;
        var updDraft = Object.assign({}, existingMem, {
          content: content,
          category: draftCat,
          scope: draftScope,
          importance: draftImp,
          manualImportance: nextManualImp,
          userConfirmed: true
        });
        var updScore = (mgr && typeof mgr.computeDynamicScore === 'function') ? mgr.computeDynamicScore(updDraft) : existingMem.dynamicScore;
        var editReason = (existingMem.manualImportance === true && !nextManualImp) ? '恢复自动评分' : '用户手动编辑';
        var updatedMem = await S().updateMemory(existingMem.id, {
          content: content,
          category: draftCat,
          scope: draftScope,
          importance: draftImp,
          manualImportance: nextManualImp,
          dynamicScore: updScore,
          userConfirmed: true,
          scenario: sc.code || existingMem.scenario || '',
          scenarioLabel: sc.label || existingMem.scenarioLabel || '',
          entities: ents
        }, { historyReason: editReason });
        savedId = updatedMem ? updatedMem.id : existingMem.id;
        notifyToast('记忆已更新');
      } else {
        if (typeof S().removeDeletedMemorySignatureByContent === 'function') {
          await S().removeDeletedMemorySignatureByContent(content);
        }
        var newDraft = { content: content, category: draftCat, importance: draftImp, manualImportance: true, userConfirmed: true, status: 'active' };
        var newScore = (mgr && typeof mgr.computeDynamicScore === 'function') ? mgr.computeDynamicScore(newDraft) : (draftImp * 18);
        var createdMem = await S().createMemory({
          content: content,
          category: draftCat,
          scope: draftScope,
          importance: draftImp,
          manualImportance: true,
          dynamicScore: newScore,
          userConfirmed: true,
          scenario: sc.code || '',
          scenarioLabel: sc.label || '',
          entities: ents,
          sourceChatTitle: '手动添加'
        });
        savedId = createdMem ? createdMem.id : '';
        notifyToast('已添加长期记忆');
      }
      if (savedId && mgr && typeof mgr.syncRelationsForMemory === 'function') {
        await mgr.syncRelationsForMemory(savedId, 'local_user');
      }
      _ctx.memories = await S().listMemories();
      clearExpiredArchivePreviewState();
      closeModalOverlay();
      notifyWorkspaceStateChanged();
      renderCurrentView();
    });
  }

  function bindMemoryListItemEvents(layer) {
    layer.querySelectorAll('[data-mem-act]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var act = btn.getAttribute('data-mem-act');
        var id = btn.getAttribute('data-mem-id');
        var mem = (_ctx.memories || []).find(function(m) { return m.id === id; });
        if (!mem) return;

        if (act === 'edit') {
          openMemoryEditorModal(layer, mem);
        } else if (act === 'archive') {
          if (Mgr() && typeof Mgr().archiveMemory === 'function') {
            await Mgr().archiveMemory(id, '用户手动归档留存');
          } else {
            await S().updateMemory(id, { archived: true, archivedAt: Date.now(), archiveReason: '用户手动归档留存' });
          }
          _ctx.memories = await S().listMemories();
          clearExpiredArchivePreviewState();
          notifyWorkspaceStateChanged();
          renderCurrentView();
          notifyToast('已归档该条记忆（仍可在「已归档」中查看和恢复）');
        } else if (act === 'unarchive') {
          if (Mgr() && typeof Mgr().unarchiveMemory === 'function') {
            await Mgr().unarchiveMemory(id);
          } else {
            await S().updateMemory(id, { archived: false, archivedAt: 0, archiveReason: '', status: 'active', temporalState: 'current' });
          }
          _ctx.memories = await S().listMemories();
          clearExpiredArchivePreviewState();
          notifyWorkspaceStateChanged();
          renderCurrentView();
          notifyToast('已恢复为当前有效记忆');
        } else if (act === 'delete') {
          showConfirmModal(
            '删除长期记忆',
            '确定要删除这条记忆吗？删除后将立即停止在对话中检索使用，并自动清理相关联记录中的断链。',
            '确认删除',
            true,
            async function() {
              await S().deleteMemory(id);
              _ctx.memories = await S().listMemories();
              clearExpiredArchivePreviewState();
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
    clearExpiredArchivePreviewState();
    _ctx.summaryApiPanelOpen = false;
    _ctx.viewStack.push(viewName);
    if (viewName === 'short-summary' && S() && typeof S().getSummaryApiConfig === 'function') {
      Promise.all([
        S().getSummaryApiConfig(),
        typeof S().getMemorySettings === 'function' ? S().getMemorySettings() : Promise.resolve(_ctx.memorySettings)
      ]).then(function(pair) {
        _ctx.summaryApiConfig = pair[0] || _ctx.summaryApiConfig;
        _ctx.memorySettings = pair[1] || _ctx.memorySettings;
        if ((_ctx.viewStack[_ctx.viewStack.length - 1] || '') === 'short-summary') {
          renderCurrentView();
        }
      }).catch(function() {});
    }
    renderCurrentView();
  }

  function popView() {
    clearExpiredArchivePreviewState();
    _ctx.summaryApiPanelOpen = false;
    if (_ctx.viewStack.length <= 1) {
      closeLayer();
      return;
    }
    _ctx.viewStack.pop();
    renderCurrentView();
  }

  // ===== 视图 4B：世界书管理（创建、列表展示、修改名称与简介、删除确认） =====
  function renderWorldBooksHtml() {
    var list = Array.isArray(_ctx.worldbooks) ? _ctx.worldbooks : [];
    var globalCount = list.filter(function(wb) { return wb && wb.globalEnabled === true; }).length;

    var cardsHtml = list.length
      ? list.map(function(wb) {
          var entryCount = Array.isArray(wb.entries) ? wb.entries.length : 0;
          var descText = String(wb.description || '').trim() || '暂无简介';
          var isGlobal = wb.globalEnabled === true;
          return (
            '<div class="aiw-preset-card' + (isGlobal ? ' is-wb-global' : '') + '" data-wb-card="' + escapeHtml(wb.id) + '" style="cursor:pointer;">' +
              '<div class="aiw-preset-top" data-wb-open="' + escapeHtml(wb.id) + '">' +
                '<span class="aiw-preset-avatar"><i class="fa-solid fa-book-open"></i></span>' +
                '<div class="aiw-preset-meta">' +
                  '<div class="aiw-preset-title-row">' +
                    '<span class="aiw-preset-name">' + escapeHtml(wb.name || '未命名世界书') + '</span>' +
                    (isGlobal ? '<span class="aiw-wbe-badge is-global"><i class="fa-solid fa-globe"></i> 全局启用</span>' : '') +
                  '</div>' +
                  '<div class="aiw-preset-desc">' + escapeHtml(descText) + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="aiw-preset-tags" data-wb-open="' + escapeHtml(wb.id) + '">' +
                '<span class="aiw-preset-tag">词条：' + escapeHtml(String(entryCount)) + ' 条</span>' +
                '<span class="aiw-preset-tag' + (isGlobal ? ' is-wb-global-tag' : '') + '">' + (isGlobal ? '范围：全局通用' : '范围：按预设绑定') + '</span>' +
              '</div>' +
              '<div class="aiw-wb-global-row">' +
                '<div class="aiw-wb-global-info">' +
                  '<span class="aiw-wb-global-label">全局启用</span>' +
                  '<span class="aiw-wb-global-hint">' + (isGlobal ? '所有聊天通用生效' : '关闭后仍可由预设单独绑定') + '</span>' +
                '</div>' +
                '<label class="aiw-switch" title="' + (isGlobal ? '已全局启用，点击关闭' : '未全局启用，点击开启') + '">' +
                  '<input type="checkbox" data-wb-global-toggle="' + escapeHtml(wb.id) + '"' + (isGlobal ? ' checked' : '') + '>' +
                  '<span class="aiw-switch-track"></span>' +
                '</label>' +
              '</div>' +
              '<div class="aiw-preset-actions">' +
                '<button type="button" class="aiw-preset-act" data-wb-act="entries" data-wb-id="' + escapeHtml(wb.id) + '">' +
                  '<i class="fa-solid fa-list-ul"></i> 词条管理' +
                '</button>' +
                '<button type="button" class="aiw-preset-act" data-wb-act="edit" data-wb-id="' + escapeHtml(wb.id) + '">' +
                  '<i class="fa-regular fa-pen-to-square"></i> 编辑信息' +
                '</button>' +
                '<button type="button" class="aiw-preset-act" data-wb-act="export" data-wb-id="' + escapeHtml(wb.id) + '">' +
                  '<i class="fa-solid fa-arrow-up-from-bracket"></i> 导出' +
                '</button>' +
                '<button type="button" class="aiw-preset-act is-danger" data-wb-act="delete" data-wb-id="' + escapeHtml(wb.id) + '">' +
                  '<i class="fa-regular fa-trash-can"></i> 删除' +
                '</button>' +
              '</div>' +
            '</div>'
          );
        }).join('')
      : (
        '<div class="aiw-preset-empty">' +
          '<div class="aiw-preset-empty-icon"><i class="fa-solid fa-book-open"></i></div>' +
          '<div class="aiw-preset-empty-title">还没有世界书</div>' +
          '<div class="aiw-preset-empty-sub">创建专属设定集，或导入知屿世界书 JSON / TXT / DOC / DOCX 文件</div>' +
          '<div style="display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;">' +
            '<button type="button" class="aiw-st-btn-secondary" id="aiw-wb-empty-import"><i class="fa-solid fa-file-import"></i> 导入世界书</button>' +
            '<button type="button" class="aiw-st-btn-primary" id="aiw-wb-empty-create">新建世界书</button>' +
          '</div>' +
        '</div>'
      );

    return (
      '<div class="aiw-st-topbar">' +
        '<button type="button" class="aiw-circle-btn" id="aiw-st-sub-back" aria-label="返回设置">' +
          '<i class="fa-solid fa-arrow-left"></i>' +
        '</button>' +
        '<div class="aiw-st-topbar-title">世界书</div>' +
        '<button type="button" class="aiw-st-top-action" id="aiw-wb-new-btn"><i class="fa-solid fa-plus"></i> 新建世界书</button>' +
      '</div>' +

      '<div class="aiw-st-scroll">' +
        '<input type="file" id="aiw-wb-import-file" accept=".json,.txt,.docx,.doc,application/json,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" style="display:none;">' +
        '<div class="aiw-pr-toolbar">' +
          '<span class="aiw-pr-count">共 ' + escapeHtml(String(list.length)) + ' 本世界书 · 全局启用 ' + escapeHtml(String(globalCount)) + ' 本</span>' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-wb-import-btn">' +
              '<i class="fa-solid fa-file-import"></i> 导入世界书' +
            '</button>' +
            '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-wb-export-all-btn">' +
              '<i class="fa-solid fa-file-zipper"></i> 导出全部' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="aiw-preset-list">' + cardsHtml + '</div>' +
      '</div>'
    );
  }

  function openWorldBookMetaModal(existingBook) {
    var isEdit = !!(existingBook && existingBook.id);
    var initName = isEdit ? String(existingBook.name || '') : '';
    var initDesc = isEdit ? String(existingBook.description || '') : '';

    var bodyHtml =
      '<div class="aiw-field-group">' +
        '<label class="aiw-field-label" for="aiw-wb-name-input">世界书名称</label>' +
        '<input type="text" class="aiw-field-input" id="aiw-wb-name-input" maxlength="80" placeholder="例如：浮光城设定集" value="' + escapeHtml(initName) + '">' +
      '</div>' +
      '<div class="aiw-field-group" style="margin-top:12px;">' +
        '<label class="aiw-field-label" for="aiw-wb-desc-input">简介（可选）</label>' +
        '<textarea class="aiw-field-textarea" id="aiw-wb-desc-input" rows="3" maxlength="500" placeholder="简要说明这本世界书的背景、人物或适用场景...">' + escapeHtml(initDesc) + '</textarea>' +
      '</div>';

    var footerHtml =
      '<button type="button" class="aiw-st-btn-secondary" id="aiw-wb-modal-cancel">取消</button>' +
      '<button type="button" class="aiw-st-btn-primary" id="aiw-wb-modal-save">' + (isEdit ? '保存修改' : '创建') + '</button>';

    var modal = showCustomModal(isEdit ? '修改世界书' : '新建世界书', bodyHtml, footerHtml);
    if (!modal) return;

    var nameInput = modal.querySelector('#aiw-wb-name-input');
    var descInput = modal.querySelector('#aiw-wb-desc-input');
    if (nameInput) {
      setTimeout(function() { nameInput.focus(); }, 60);
    }

    var cancelBtn = modal.querySelector('#aiw-wb-modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModalOverlay);

    var saveBtn = modal.querySelector('#aiw-wb-modal-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        var nameVal = nameInput ? String(nameInput.value || '').trim() : '';
        var descVal = descInput ? String(descInput.value || '').trim() : '';
        if (!nameVal) {
          notifyToast('请输入世界书名称');
          if (nameInput) nameInput.focus();
          return;
        }
        var store = S();
        if (!store) return;
        try {
          if (isEdit && typeof store.updateWorldBook === 'function') {
            await store.updateWorldBook(existingBook.id, {
              name: nameVal,
              description: descVal
            });
          } else if (typeof store.createWorldBook === 'function') {
            await store.createWorldBook({
              name: nameVal,
              description: descVal
            });
          }
          _ctx.worldbooks = typeof store.listWorldBooks === 'function' ? await store.listWorldBooks() : [];
          closeModalOverlay();
          notifyWorkspaceStateChanged();
          renderCurrentView();
          notifyToast(isEdit ? '已更新世界书信息' : '已创建世界书');
        } catch (_) {
          notifyToast(isEdit ? '保存世界书失败，请稍后重试' : '创建世界书失败，请稍后重试');
        }
      });
    }
  }

  function bindWorldBooksEvents(layer) {
    var newBtn = layer.querySelector('#aiw-wb-new-btn');
    var emptyCreateBtn = layer.querySelector('#aiw-wb-empty-create');
    var importBtn = layer.querySelector('#aiw-wb-import-btn');
    var emptyImportBtn = layer.querySelector('#aiw-wb-empty-import');
    var importFileInput = layer.querySelector('#aiw-wb-import-file');
    var exportAllBtn = layer.querySelector('#aiw-wb-export-all-btn');

    if (newBtn) {
      newBtn.addEventListener('click', function() {
        openWorldBookMetaModal(null);
      });
    }
    if (emptyCreateBtn) {
      emptyCreateBtn.addEventListener('click', function() {
        openWorldBookMetaModal(null);
      });
    }

    if (exportAllBtn) {
      exportAllBtn.addEventListener('click', async function() {
        var store = S();
        if (!store || typeof store.buildAllWorldBooksZipBlob !== 'function') {
          notifyToast('当前无法导出全部世界书');
          return;
        }
        try {
          var latestBooks = typeof store.listWorldBooks === 'function'
            ? await store.listWorldBooks()
            : (Array.isArray(_ctx.worldbooks) ? _ctx.worldbooks : []);
          if (!latestBooks || !latestBooks.length) {
            notifyToast('暂无可导出的世界书');
            return;
          }
          var result = await store.buildAllWorldBooksZipBlob(latestBooks);
          if (!result || !result.count || !result.blob) {
            notifyToast('暂无可导出的世界书');
            return;
          }
          var now = new Date();
          var y = String(now.getFullYear());
          var m = String(now.getMonth() + 1).padStart(2, '0');
          var d = String(now.getDate()).padStart(2, '0');
          var zipName = '知屿世界书-' + y + m + d + '.zip';
          downloadBlobFile(zipName, result.blob, '已导出全部 ' + result.count + ' 本世界书：' + zipName);
        } catch (_) {
          notifyToast('导出全部世界书失败，请稍后重试');
        }
      });
    }

    function triggerImportPicker() {
      if (!importFileInput) return;
      importFileInput.value = '';
      importFileInput.click();
    }
    if (importBtn) importBtn.addEventListener('click', triggerImportPicker);
    if (emptyImportBtn) emptyImportBtn.addEventListener('click', triggerImportPicker);

    if (importFileInput) {
      importFileInput.addEventListener('change', async function() {
        var file = importFileInput.files && importFileInput.files[0];
        importFileInput.value = '';
        if (!file) return;
        var store = S();
        if (!store) {
          notifyToast('当前无法导入世界书');
          return;
        }
        var fileName = String(file.name || '').trim();
        var fileMime = String(file.type || '').toLowerCase();
        var isDocxFile = /\.docx$/i.test(fileName) || fileMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        var isDocFile = !isDocxFile && (/\.doc$/i.test(fileName) || fileMime === 'application/msword');
        var isTxtFile = !isDocxFile && !isDocFile && (/\.txt$/i.test(fileName) || (fileMime === 'text/plain' && !/\.json$/i.test(fileName)));

        if (isDocxFile && typeof store.importWorldBookFromDocx !== 'function') {
          notifyToast('当前无法导入 DOCX 世界书');
          return;
        }
        if (isDocFile && typeof store.importWorldBookFromDoc !== 'function') {
          notifyToast('当前无法导入 DOC 世界书');
          return;
        }
        if (isTxtFile && typeof store.importWorldBookFromTxt !== 'function') {
          notifyToast('当前无法导入 TXT 世界书');
          return;
        }
        if (!isDocxFile && !isDocFile && !isTxtFile && typeof store.importWorldBookFromJson !== 'function') {
          notifyToast('当前无法导入世界书');
          return;
        }
        try {
          var res;
          if (isDocxFile || isDocFile) {
            var buf;
            if (typeof file.arrayBuffer === 'function') {
              buf = await file.arrayBuffer();
            } else {
              buf = await new Promise(function(resolve, reject) {
                var reader = new FileReader();
                reader.onload = function() { resolve(reader.result); };
                reader.onerror = function() { reject(new Error('文件读取失败')); };
                reader.readAsArrayBuffer(file);
              });
            }
            res = isDocxFile
              ? await store.importWorldBookFromDocx(buf, fileName)
              : await store.importWorldBookFromDoc(buf, fileName);
          } else {
            var rawText = '';
            if (typeof file.text === 'function') {
              rawText = await file.text();
            } else {
              rawText = await new Promise(function(resolve, reject) {
                var reader = new FileReader();
                reader.onload = function() { resolve(String(reader.result || '')); };
                reader.onerror = function() { reject(new Error('文件读取失败')); };
                reader.readAsText(file, 'utf-8');
              });
            }
            res = isTxtFile
              ? await store.importWorldBookFromTxt(rawText, fileName)
              : await store.importWorldBookFromJson(rawText);
          }
          if (!res || !res.ok) {
            notifyToast((res && res.error) || '导入失败：文件格式无效');
            return;
          }
          _ctx.worldbooks = typeof store.listWorldBooks === 'function' ? await store.listWorldBooks() : [];
          notifyWorkspaceStateChanged();
          renderCurrentView();
          notifyToast('已导入世界书「' + (res.book && res.book.name ? res.book.name : '未命名世界书') + '」（共 ' + (res.entryCount || 0) + ' 条词条）');
        } catch (_) {
          notifyToast('导入世界书失败，请检查文件后重试');
        }
      });
    }

    layer.querySelectorAll('.aiw-wb-global-row').forEach(function(row) {
      row.addEventListener('click', function(e) {
        if (e && e.stopPropagation) e.stopPropagation();
      });
    });

    layer.querySelectorAll('[data-wb-global-toggle]').forEach(function(input) {
      input.addEventListener('change', async function(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        var wbId = input.getAttribute('data-wb-global-toggle');
        if (!wbId) return;
        var nextGlobal = !!input.checked;
        var store = S();
        if (!store) {
          input.checked = !nextGlobal;
          notifyToast('当前无法更新全局世界书设置');
          return;
        }
        var targetBook = (_ctx.worldbooks || []).find(function(item) { return item && item.id === wbId; });
        try {
          if (typeof store.setWorldBookGlobalEnabled === 'function') {
            await store.setWorldBookGlobalEnabled(wbId, nextGlobal);
          } else if (typeof store.updateWorldBook === 'function') {
            await store.updateWorldBook(wbId, { globalEnabled: nextGlobal });
          } else {
            throw new Error('UNSUPPORTED');
          }
          _ctx.worldbooks = typeof store.listWorldBooks === 'function' ? await store.listWorldBooks() : [];
          notifyWorkspaceStateChanged();
          renderCurrentView();
          var bookLabel = (targetBook && targetBook.name) ? ('「' + targetBook.name + '」') : '该世界书';
          notifyToast(nextGlobal ? ('已全局启用 ' + bookLabel) : ('已关闭全局启用 ' + bookLabel));
        } catch (_) {
          input.checked = !nextGlobal;
          notifyToast('更新全局启用状态失败，请稍后重试');
        }
      });
    });

    layer.querySelectorAll('[data-wb-open]').forEach(function(el) {
      el.addEventListener('click', function() {
        var id = el.getAttribute('data-wb-open');
        if (!id) return;
        _ctx.activeWorldBookId = id;
        pushView('worldbook-entries');
      });
    });

    layer.querySelectorAll('[data-wb-act]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        var act = btn.getAttribute('data-wb-act');
        var id = btn.getAttribute('data-wb-id');
        var book = (_ctx.worldbooks || []).find(function(item) { return item && item.id === id; });
        if (!book) return;

        if (act === 'entries') {
          _ctx.activeWorldBookId = book.id;
          pushView('worldbook-entries');
        } else if (act === 'edit') {
          openWorldBookMetaModal(book);
        } else if (act === 'export') {
          var store = S();
          if (!store || typeof store.buildWorldBookExportJson !== 'function') {
            notifyToast('当前无法导出世界书');
            return;
          }
          try {
            var latestBook = (typeof store.getWorldBook === 'function' ? await store.getWorldBook(book.id) : null) || book;
            var jsonStr = store.buildWorldBookExportJson(latestBook);
            var filename = typeof store.buildWorldBookExportFilename === 'function'
              ? store.buildWorldBookExportFilename(latestBook)
              : ((latestBook.name || '世界书') + '.json');
            downloadTextFile(filename, jsonStr, 'application/json;charset=utf-8');
          } catch (_) {
            notifyToast('导出世界书失败，请稍后重试');
          }
        } else if (act === 'delete') {
          showConfirmModal(
            '删除世界书',
            '确定要删除世界书「' + (book.name || '未命名世界书') + '」吗？删除后将无法恢复。',
            '确认删除',
            true,
            async function() {
              var store = S();
              if (!store || typeof store.deleteWorldBook !== 'function') return;
              try {
                await store.deleteWorldBook(book.id);
                if (_ctx.activeWorldBookId === book.id) _ctx.activeWorldBookId = '';
                _ctx.worldbooks = typeof store.listWorldBooks === 'function' ? await store.listWorldBooks() : [];
                _ctx.presets = typeof store.listPresets === 'function' ? await store.listPresets() : _ctx.presets;
                notifyWorkspaceStateChanged();
                renderCurrentView();
                notifyToast('已删除世界书');
              } catch (_) {
                notifyToast('删除世界书失败，请稍后重试');
              }
            }
          );
        }
      });
    });
  }

  // ===== 视图 4C：世界书词条管理 =====
  function getActiveWorldBook() {
    var list = Array.isArray(_ctx.worldbooks) ? _ctx.worldbooks : [];
    return list.find(function(item) { return item && item.id === _ctx.activeWorldBookId; }) || null;
  }

  function renderWorldBookEntriesHtml() {
    var book = getActiveWorldBook();
    if (!book) {
      return (
        '<div class="aiw-st-topbar">' +
          '<button type="button" class="aiw-circle-btn" id="aiw-st-sub-back" aria-label="返回世界书列表">' +
            '<i class="fa-solid fa-arrow-left"></i>' +
          '</button>' +
          '<div class="aiw-st-topbar-title">词条管理</div>' +
          '<div class="aiw-st-topbar-spacer"></div>' +
        '</div>' +
        '<div class="aiw-st-scroll">' +
          '<div class="aiw-preset-empty">' +
            '<div class="aiw-preset-empty-icon"><i class="fa-solid fa-book-open"></i></div>' +
            '<div class="aiw-preset-empty-title">未找到该世界书</div>' +
            '<div class="aiw-preset-empty-sub">请返回世界书列表重新选择</div>' +
          '</div>' +
        '</div>'
      );
    }

    var entries = Array.isArray(book.entries) ? book.entries : [];
    var enabledCount = entries.filter(function(item) { return item && item.disable !== true; }).length;
    var cardsHtml = entries.length
      ? entries.map(function(entry) {
          var titleText = String(entry.comment || entry.name || '').trim() || '未命名词条';
          var contentText = String(entry.content || '').trim();
          var previewText = contentText
            ? (contentText.length > 140 ? contentText.slice(0, 140) + '…' : contentText)
            : '暂无词条内容';
          var isEnabled = entry.disable !== true;
          var isConstant = entry.constant === true;
          var keys = Array.isArray(entry.key) ? entry.key.filter(Boolean) : [];
          var orderVal = Number.isFinite(Number(entry.order)) ? Math.round(Number(entry.order)) : 100;
          var keysPreview = keys.length
            ? (keys.slice(0, 3).join('、') + (keys.length > 3 ? (' 等 ' + keys.length + ' 个') : ''))
            : '未设置关键词';
          return (
            '<div class="aiw-preset-card' + (isEnabled ? '' : ' is-wbe-disabled') + '" data-wbe-card="' + escapeHtml(entry.id) + '">' +
              '<div class="aiw-preset-top aiw-wbe-card-head">' +
                '<span class="aiw-preset-avatar"><i class="fa-regular fa-file-lines"></i></span>' +
                '<div class="aiw-preset-meta">' +
                  '<div class="aiw-preset-title-row">' +
                    '<span class="aiw-preset-name">' + escapeHtml(titleText) + '</span>' +
                    '<span class="aiw-wbe-badge ' + (isEnabled ? 'is-enabled' : 'is-disabled') + '">' + (isEnabled ? '已启用' : '已停用') + '</span>' +
                    '<span class="aiw-wbe-badge ' + (isConstant ? 'is-constant' : 'is-keyword') + '">' + (isConstant ? '常驻触发' : '关键词触发') + '</span>' +
                  '</div>' +
                  '<div class="aiw-preset-desc">' + escapeHtml(previewText) + '</div>' +
                '</div>' +
                '<label class="aiw-switch aiw-wbe-card-switch" title="' + (isEnabled ? '已启用，点击停用' : '已停用，点击启用') + '">' +
                  '<input type="checkbox" data-wbe-toggle="' + escapeHtml(entry.id) + '"' + (isEnabled ? ' checked' : '') + '>' +
                  '<span class="aiw-switch-track"></span>' +
                '</label>' +
              '</div>' +
              '<div class="aiw-preset-tags">' +
                '<span class="aiw-preset-tag">优先级：' + escapeHtml(String(orderVal)) + '</span>' +
                (!isConstant ? '<span class="aiw-preset-tag">关键词：' + escapeHtml(keysPreview) + '</span>' : '') +
                '<span class="aiw-preset-tag">内容：' + escapeHtml(String(contentText.length)) + ' 字</span>' +
              '</div>' +
              '<div class="aiw-preset-actions">' +
                '<button type="button" class="aiw-preset-act" data-wbe-act="edit" data-wbe-id="' + escapeHtml(entry.id) + '">' +
                  '<i class="fa-regular fa-pen-to-square"></i> 编辑' +
                '</button>' +
                '<button type="button" class="aiw-preset-act is-danger" data-wbe-act="delete" data-wbe-id="' + escapeHtml(entry.id) + '">' +
                  '<i class="fa-regular fa-trash-can"></i> 删除' +
                '</button>' +
              '</div>' +
            '</div>'
          );
        }).join('')
      : (
        '<div class="aiw-preset-empty">' +
          '<div class="aiw-preset-empty-icon"><i class="fa-regular fa-file-lines"></i></div>' +
          '<div class="aiw-preset-empty-title">还没有词条</div>' +
          '<div class="aiw-preset-empty-sub">为「' + escapeHtml(book.name || '未命名世界书') + '」添加人物、地点、规则或背景词条</div>' +
          '<button type="button" class="aiw-st-btn-primary" id="aiw-wbe-empty-create">新建词条</button>' +
        '</div>'
      );

    return (
      '<div class="aiw-st-topbar">' +
        '<button type="button" class="aiw-circle-btn" id="aiw-st-sub-back" aria-label="返回世界书列表">' +
          '<i class="fa-solid fa-arrow-left"></i>' +
        '</button>' +
        '<div class="aiw-st-topbar-title">' + escapeHtml(book.name || '世界书') + '</div>' +
        '<button type="button" class="aiw-st-top-action" id="aiw-wbe-new-btn"><i class="fa-solid fa-plus"></i> 新建词条</button>' +
      '</div>' +

      '<div class="aiw-st-scroll">' +
        '<div class="aiw-pr-toolbar">' +
          '<span class="aiw-pr-count">共 ' + escapeHtml(String(entries.length)) + ' 条词条 · 已启用 ' + escapeHtml(String(enabledCount)) + ' 条' + (book.description ? (' · ' + escapeHtml(book.description.slice(0, 20)) + (book.description.length > 20 ? '…' : '')) : '') + '</span>' +
        '</div>' +
        '<div class="aiw-preset-list">' + cardsHtml + '</div>' +
      '</div>'
    );
  }

  function parseKeywordsInput(rawText) {
    if (S() && typeof S().normalizeWorldBookKeywords === 'function') {
      return S().normalizeWorldBookKeywords(rawText);
    }
    var parts = String(rawText || '').split(/[\n,，、]+/);
    var seen = {};
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var k = parts[i].trim();
      if (!k || seen[k]) continue;
      seen[k] = true;
      out.push(k);
    }
    return out;
  }

  function openWorldBookEntryModal(book, existingEntry) {
    if (!book || !book.id) return;
    var isEdit = !!(existingEntry && existingEntry.id);
    var initName = isEdit ? String(existingEntry.comment || existingEntry.name || '') : '';
    var initContent = isEdit ? String(existingEntry.content || '') : '';
    var initEnabled = isEdit ? (existingEntry.disable !== true) : true;
    var initConstant = isEdit ? (existingEntry.constant === true) : false;
    var initKeys = isEdit && Array.isArray(existingEntry.key) ? existingEntry.key.join(', ') : '';
    var initOrder = isEdit && Number.isFinite(Number(existingEntry.order)) ? Math.round(Number(existingEntry.order)) : 100;

    var bodyHtml =
      '<div class="aiw-field-group">' +
        '<label class="aiw-field-label" for="aiw-wbe-name-input">词条名称</label>' +
        '<input type="text" class="aiw-field-input" id="aiw-wbe-name-input" maxlength="120" placeholder="例如：银月议会" value="' + escapeHtml(initName) + '">' +
      '</div>' +

      '<div class="aiw-wbe-switch-row">' +
        '<div class="aiw-wbe-switch-col">' +
          '<div class="aiw-wbe-switch-title">启用词条</div>' +
          '<div class="aiw-wbe-switch-desc">关闭后保留内容，但不参与触发</div>' +
        '</div>' +
        '<label class="aiw-switch">' +
          '<input type="checkbox" id="aiw-wbe-enabled-toggle"' + (initEnabled ? ' checked' : '') + '>' +
          '<span class="aiw-switch-track"></span>' +
        '</label>' +
      '</div>' +

      '<div class="aiw-field-group" style="margin-top:12px;">' +
        '<div class="aiw-field-label">触发方式</div>' +
        '<div class="aiw-wbe-mode-grid" role="radiogroup" aria-label="触发方式">' +
          '<label class="aiw-wbe-mode-card' + (!initConstant ? ' is-active' : '') + '">' +
            '<input type="radio" name="aiw-wbe-trigger-mode" value="keyword"' + (!initConstant ? ' checked' : '') + '>' +
            '<span class="aiw-wbe-mode-title">关键词触发</span>' +
            '<span class="aiw-wbe-mode-desc">命中关键词时生效</span>' +
          '</label>' +
          '<label class="aiw-wbe-mode-card' + (initConstant ? ' is-active' : '') + '">' +
            '<input type="radio" name="aiw-wbe-trigger-mode" value="constant"' + (initConstant ? ' checked' : '') + '>' +
            '<span class="aiw-wbe-mode-title">常驻触发</span>' +
            '<span class="aiw-wbe-mode-desc">始终生效，无需关键词</span>' +
          '</label>' +
        '</div>' +
      '</div>' +

      '<div class="aiw-field-group" id="aiw-wbe-keywords-group" style="margin-top:12px;' + (initConstant ? 'display:none;' : '') + '">' +
        '<label class="aiw-field-label" for="aiw-wbe-keywords-input">关键词</label>' +
        '<input type="text" class="aiw-field-input" id="aiw-wbe-keywords-input" placeholder="多个关键词用逗号分隔，例如：银月议会, 白塔" value="' + escapeHtml(initKeys) + '">' +
        '<div class="aiw-ss-field-hint">支持中英文逗号或顿号分隔多个关键词</div>' +
      '</div>' +

      '<div class="aiw-field-group" style="margin-top:12px;">' +
        '<label class="aiw-field-label" for="aiw-wbe-order-input">触发优先级</label>' +
        '<input type="number" inputmode="numeric" class="aiw-field-input" id="aiw-wbe-order-input" placeholder="100" value="' + escapeHtml(String(initOrder)) + '">' +
        '<div class="aiw-ss-field-hint">数字优先级，默认 100</div>' +
      '</div>' +

      '<div class="aiw-field-group" style="margin-top:12px;">' +
        '<label class="aiw-field-label" for="aiw-wbe-content-input">词条内容</label>' +
        '<textarea class="aiw-field-textarea" id="aiw-wbe-content-input" rows="5" placeholder="输入该词条的详细设定、背景说明或人物资料...">' + escapeHtml(initContent) + '</textarea>' +
      '</div>';

    var footerHtml =
      '<button type="button" class="aiw-st-btn-secondary" id="aiw-wbe-modal-cancel">取消</button>' +
      '<button type="button" class="aiw-st-btn-primary" id="aiw-wbe-modal-save">' + (isEdit ? '保存修改' : '保存词条') + '</button>';

    var modal = showCustomModal(isEdit ? '编辑词条' : '新建词条', bodyHtml, footerHtml);
    if (!modal) return;

    var nameInput = modal.querySelector('#aiw-wbe-name-input');
    var enabledToggle = modal.querySelector('#aiw-wbe-enabled-toggle');
    var keywordsGroup = modal.querySelector('#aiw-wbe-keywords-group');
    var keywordsInput = modal.querySelector('#aiw-wbe-keywords-input');
    var orderInput = modal.querySelector('#aiw-wbe-order-input');
    var contentInput = modal.querySelector('#aiw-wbe-content-input');
    var modeRadios = modal.querySelectorAll('input[name="aiw-wbe-trigger-mode"]');

    if (nameInput) {
      setTimeout(function() { nameInput.focus(); }, 60);
    }

    modeRadios.forEach(function(radio) {
      radio.addEventListener('change', function() {
        var isConst = radio.value === 'constant' && radio.checked;
        modal.querySelectorAll('.aiw-wbe-mode-card').forEach(function(card) {
          var r = card.querySelector('input[type="radio"]');
          card.classList.toggle('is-active', !!(r && r.checked));
        });
        if (keywordsGroup) {
          keywordsGroup.style.display = isConst ? 'none' : '';
        }
      });
    });

    var cancelBtn = modal.querySelector('#aiw-wbe-modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModalOverlay);

    var saveBtn = modal.querySelector('#aiw-wbe-modal-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        var nameVal = nameInput ? String(nameInput.value || '').trim() : '';
        var contentVal = contentInput ? String(contentInput.value || '').replace(/\r\n/g, '\n').trim() : '';
        var isEnabledVal = enabledToggle ? !!enabledToggle.checked : true;
        var checkedModeEl = modal.querySelector('input[name="aiw-wbe-trigger-mode"]:checked');
        var isConstantVal = !!(checkedModeEl && checkedModeEl.value === 'constant');
        var keywordsVal = parseKeywordsInput(keywordsInput ? keywordsInput.value : '');
        var rawOrderStr = orderInput ? String(orderInput.value || '').trim() : '';
        var orderVal = rawOrderStr === '' ? 100 : Number(rawOrderStr);

        if (!nameVal) {
          notifyToast('请输入词条名称');
          if (nameInput) nameInput.focus();
          return;
        }
        if (!Number.isFinite(orderVal)) {
          notifyToast('触发优先级必须为有效数字');
          if (orderInput) orderInput.focus();
          return;
        }
        if (!contentVal) {
          notifyToast('请输入词条内容');
          if (contentInput) contentInput.focus();
          return;
        }
        var store = S();
        if (!store) return;
        var payload = {
          comment: nameVal,
          content: contentVal,
          disable: !isEnabledVal,
          constant: isConstantVal,
          key: keywordsVal,
          order: Math.round(orderVal)
        };
        try {
          if (isEdit && typeof store.updateWorldBookEntry === 'function') {
            await store.updateWorldBookEntry(book.id, existingEntry.id, payload);
          } else if (typeof store.createWorldBookEntry === 'function') {
            await store.createWorldBookEntry(book.id, payload);
          }
          _ctx.worldbooks = typeof store.listWorldBooks === 'function' ? await store.listWorldBooks() : [];
          closeModalOverlay();
          notifyWorkspaceStateChanged();
          renderCurrentView();
          notifyToast(isEdit ? '已保存词条修改' : '已新建词条');
        } catch (_) {
          notifyToast(isEdit ? '保存词条失败，请稍后重试' : '新建词条失败，请稍后重试');
        }
      });
    }
  }

  function bindWorldBookEntriesEvents(layer) {
    var book = getActiveWorldBook();
    if (!book) return;

    var newBtn = layer.querySelector('#aiw-wbe-new-btn');
    var emptyCreateBtn = layer.querySelector('#aiw-wbe-empty-create');
    if (newBtn) {
      newBtn.addEventListener('click', function() {
        openWorldBookEntryModal(book, null);
      });
    }
    if (emptyCreateBtn) {
      emptyCreateBtn.addEventListener('click', function() {
        openWorldBookEntryModal(book, null);
      });
    }

    layer.querySelectorAll('[data-wbe-toggle]').forEach(function(input) {
      input.addEventListener('change', async function() {
        var entryId = input.getAttribute('data-wbe-toggle');
        var nextEnabled = !!input.checked;
        var store = S();
        if (!store || typeof store.updateWorldBookEntry !== 'function') return;
        try {
          await store.updateWorldBookEntry(book.id, entryId, { disable: !nextEnabled });
          _ctx.worldbooks = typeof store.listWorldBooks === 'function' ? await store.listWorldBooks() : [];
          notifyWorkspaceStateChanged();
          renderCurrentView();
          notifyToast(nextEnabled ? '已启用词条' : '已停用词条');
        } catch (_) {
          input.checked = !nextEnabled;
          notifyToast('更新词条状态失败，请稍后重试');
        }
      });
    });

    layer.querySelectorAll('[data-wbe-act]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var act = btn.getAttribute('data-wbe-act');
        var entryId = btn.getAttribute('data-wbe-id');
        var entries = Array.isArray(book.entries) ? book.entries : [];
        var entry = entries.find(function(item) { return item && item.id === entryId; });
        if (!entry) return;

        if (act === 'edit') {
          openWorldBookEntryModal(book, entry);
        } else if (act === 'delete') {
          showConfirmModal(
            '删除词条',
            '确定要删除词条「' + (entry.comment || entry.name || '未命名词条') + '」吗？删除后将无法恢复。',
            '确认删除',
            true,
            async function() {
              var store = S();
              if (!store || typeof store.deleteWorldBookEntry !== 'function') return;
              try {
                await store.deleteWorldBookEntry(book.id, entry.id);
                _ctx.worldbooks = typeof store.listWorldBooks === 'function' ? await store.listWorldBooks() : [];
                notifyWorkspaceStateChanged();
                renderCurrentView();
                notifyToast('已删除词条');
              } catch (_) {
                notifyToast('删除词条失败，请稍后重试');
              }
            }
          );
        }
      });
    });
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
    } else if (view === 'worldbooks') {
      layer.innerHTML = renderWorldBooksHtml();
      bindWorldBooksEvents(layer);
    } else if (view === 'worldbook-entries') {
      layer.innerHTML = renderWorldBookEntriesHtml();
      bindWorldBookEntriesEvents(layer);
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
    _ctx.summaryApiPanelOpen = false;
    clearExpiredArchivePreviewState();

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
      typeof S().getMemorySettings === 'function' ? S().getMemorySettings() : Promise.resolve(_ctx.memorySettings),
      typeof S().getSummaryApiConfig === 'function' ? S().getSummaryApiConfig() : Promise.resolve(_ctx.summaryApiConfig)
    ]);
    _ctx.memories = results[0] || [];
    _ctx.memoryTasks = results[1] || [];
    _ctx.chats = results[2] || [];
    _ctx.memorySettings = results[3] || _ctx.memorySettings;
    _ctx.summaryApiConfig = results[4] || _ctx.summaryApiConfig;

    if (layer.querySelector('.aiw-st-modal-backdrop')) return;
    if (view === 'short-summary' && _ctx.summaryApiPanelOpen) return;

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
      clearExpiredArchivePreviewState();
      var filtered = getFilteredMemories();
      var listEl = layer.querySelector('#aiw-mem-list');
      var countEl = layer.querySelector('#aiw-mem-count-text');
      var clearBtn = layer.querySelector('#aiw-mem-clear-all');
      var previewSlot = layer.querySelector('#aiw-expired-preview-slot');
      if (previewSlot) previewSlot.innerHTML = '';
      if (listEl) {
        listEl.innerHTML = renderMemoryCardsHtml(filtered);
        bindMemoryListItemEvents(layer);
      }
      if (countEl) {
        countEl.textContent = '共 ' + _ctx.memories.length + ' 条长期记忆' + (_ctx.memorySearchQuery ? ('（筛选出 ' + filtered.length + ' 条）') : '');
      }
      if (clearBtn) clearBtn.disabled = !_ctx.memories.length;
    } else {
      clearExpiredArchivePreviewState();
      renderCurrentView();
    }
  }

  global.AiWorkspaceSettings = {
    openSettingsCenter: openSettingsCenter,
    closeSettingsCenter: closeLayer,
    refreshMemoryViewsIfOpen: refreshMemoryViewsIfOpen,
    buildMemoryDecayDiagnostics: buildMemoryDecayDiagnostics,
    renderMemoryCardsHtml: renderMemoryCardsHtml,
    renderRecentRecallDiagnosticsHtml: renderRecentRecallDiagnosticsHtml,
    renderMemoryDiagnosticsHtml: renderMemoryDiagnosticsHtml,
    computeRestoredAutoImportance: computeRestoredAutoImportance,
    openMemoryEditorModal: openMemoryEditorModal
  };
})(window);
