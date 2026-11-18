// js/fan-community-chat.js — 同好社区 · 捡手机文学创作模块（任务 03 ~ 任务 06）
// 功能：多作品列表与安全迁移、新建与重命名作品、独立聊天记录、文字/图片/表情包/日期/假撤回、
//       转账卡片、语音消息、语音通话与视频通话卡片、持久化恢复。

(function(global) {
  'use strict';

  var STORAGE_KEY = 'wanwan-phone-messages-v3';
  var WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  var DEFAULT_APPEARANCE = {
    bgType: 'color',
    bgColor: '#e8ede8',
    bgImageAssetId: '',
    bgImageFit: 'cover',
    userBubbleColor: '#d9e3d2',
    charBubbleColor: '#fffefa'
  };

  var BG_COLOR_PRESETS = [
    { id: 'default', label: '默认浅灰绿', color: '#e8ede8' },
    { id: 'cream', label: '暖奶油白', color: '#f6f1e7' },
    { id: 'mistBlue', label: '柔雾晴蓝', color: '#e6edf2' },
    { id: 'lilac', label: '淡雾丁香', color: '#ede9f2' },
    { id: 'peach', label: '杏桃奶茶', color: '#f5eae3' },
    { id: 'deepMoss', label: '静谧深苔', color: '#2f3a32' }
  ];

  var BUBBLE_PAIR_PRESETS = [
    { id: 'default', label: '默认柔绿', user: '#d9e3d2', char: '#fffefa' },
    { id: 'oatmeal', label: '暖杏奶咖', user: '#efe3d0', char: '#fffdf9' },
    { id: 'sky', label: '晴雾蓝白', user: '#d6e4ee', char: '#fcfdff' },
    { id: 'blush', label: '淡藕粉灰', user: '#eedce0', char: '#fffbfc' },
    { id: 'nightMoss', label: '夜读苔绿', user: '#3f5243', char: '#2d342e' }
  ];

  var USER_BUBBLE_PRESETS = ['#d9e3d2', '#efe3d0', '#d6e4ee', '#eedce0', '#dce6dc', '#3f5243'];
  var CHAR_BUBBLE_PRESETS = ['#fffefa', '#fffdf9', '#fcfdff', '#f4f2ec', '#edf1ea', '#2d342e'];

  var INITIAL_STATE = {
    title: '捡手机文学',
    char: '对方',
    user: '我',
    charAvatarAssetId: '',
    userAvatarAssetId: '',
    appearance: {
      bgType: 'color',
      bgColor: '#e8ede8',
      bgImageAssetId: '',
      bgImageFit: 'cover',
      userBubbleColor: '#d9e3d2',
      charBubbleColor: '#fffefa'
    },
    topic: '',
    join: true,
    showTools: false,
    items: []
  };

  var _state = null;
  var _currentWorkId = '';
  var _activeContainer = null;
  var _onBackToCommunity = function() {};
  var _sendSide = 'right';
  var _panelMode = ''; // '' | 'emoji' | 'more'
  var _selectedIndex = -1;
  var _cleanupViewport = null;
  var _activeResolveSeq = 0;
  var _activeBgSeq = 0;
  var _stickerRenderSeq = 0;
  var _importingStickers = false;
  var _playingVoiceIndex = -1;
  var _activeAudio = null;
  var _expandedVoices = Object.create(null);
  var _cleanupDoc = null;

  function assetsApi() {
    return global.FanCommunityAssets || null;
  }

  function worksApi() {
    return global.FanCommunityWorks || null;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function normalizeHex(val, fallback) {
    if (typeof val !== 'string') return fallback;
    var trimmed = val.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
    if (/^#[0-9a-f]{3}$/.test(trimmed)) {
      return '#' + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3];
    }
    return fallback;
  }

  function hexToRgb(hex) {
    var clean = normalizeHex(hex, '#ffffff').slice(1);
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  function hexToRgba(hex, alpha) {
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
  }

  function getRelativeLuminance(hex) {
    var rgb = hexToRgb(hex);
    var vals = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map(function(c) {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2];
  }

  function isDarkHex(hex) {
    return getRelativeLuminance(hex) < 0.34;
  }

  function computeBubbleTokens(hex) {
    var clean = normalizeHex(hex, '#fffefa');
    if (isDarkHex(clean)) {
      return {
        bg: clean,
        fg: '#f7f8f5',
        sub: '#cfd7ce',
        recallBg: hexToRgba(clean, 0.8),
        recallBorder: 'rgba(247, 248, 245, 0.36)'
      };
    }
    return {
      bg: clean,
      fg: '#354139',
      sub: '#6c796c',
      recallBg: hexToRgba(clean, 0.74),
      recallBorder: 'rgba(138, 152, 136, 0.5)'
    };
  }

  function getAppearance(raw) {
    var wApi = worksApi();
    if (wApi && typeof wApi.normalizeAppearance === 'function') {
      return wApi.normalizeAppearance(raw);
    }
    var src = raw && typeof raw === 'object' ? raw : {};
    var bgImageAssetId = typeof src.bgImageAssetId === 'string' ? src.bgImageAssetId : '';
    var bgType = src.bgType === 'image' && bgImageAssetId ? 'image' : 'color';
    return {
      bgType: bgType,
      bgColor: normalizeHex(src.bgColor, DEFAULT_APPEARANCE.bgColor),
      bgImageAssetId: bgImageAssetId,
      bgImageFit: src.bgImageFit === 'contain' ? 'contain' : 'cover',
      userBubbleColor: normalizeHex(src.userBubbleColor, DEFAULT_APPEARANCE.userBubbleColor),
      charBubbleColor: normalizeHex(src.charBubbleColor, DEFAULT_APPEARANCE.charBubbleColor)
    };
  }

  function notify(msg) {
    if (typeof global.toast === 'function') {
      global.toast(msg);
    }
  }

  function loadWorkState(workId) {
    var wApi = worksApi();
    if (wApi && workId) {
      var data = wApi.getWorkData(workId);
      if (data) return data;
    }
    return clone(INITIAL_STATE);
  }

  function saveState(state) {
    var wApi = worksApi();
    if (wApi && _currentWorkId) {
      var ok = wApi.saveWorkData(_currentWorkId, state, { touchUpdatedAt: true });
      if (!ok) {
        notify('存储空间不足，消息保存失败');
      }
      return ok;
    }
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
      return true;
    } catch (_) {
      notify('存储空间不足，消息保存失败');
      return false;
    }
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function formatDateAndTime(dateVal, timeVal) {
    if (!dateVal) return '';
    var parts = dateVal.split('-');
    if (parts.length !== 3) return dateVal + (timeVal ? ' ' + timeVal : '');
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var d = Number(parts[2]);
    var dt = new Date(y, m - 1, d);
    var weekday = WEEKDAYS[dt.getDay()] || '';
    var datePart = y + '年' + m + '月' + d + '日' + (weekday ? ' ' + weekday : '');
    return timeVal ? datePart + ' ' + timeVal : datePart;
  }

  function formatUpdatedTime(ts) {
    if (!ts) return '刚刚';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '刚刚';
    var y = String(d.getFullYear());
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return y + '/' + m + '/' + day + ' ' + hh + ':' + mm;
  }

  function todayDateString() {
    var now = new Date();
    var y = String(now.getFullYear());
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function nowTimeString() {
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, '0');
    var mm = String(now.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }

  function open(container, options) {
    if (!container) return;
    options = options || {};
    _activeContainer = container;
    _onBackToCommunity = typeof options.onBack === 'function' ? options.onBack : function() {};
    renderWorksListView();
  }

  function renderWorksListView() {
    if (!_activeContainer) return;
    close();
    _currentWorkId = '';
    _state = null;

    var container = _activeContainer;
    container.replaceChildren();

    var wrap = el('div', 'fc-works-app');

    var head = el('header', 'fc-works-head');
    var backBtn = el('button', 'fc-works-back');
    backBtn.type = 'button';
    backBtn.id = 'fc-works-back-btn';
    backBtn.setAttribute('aria-label', '返回同好社区首页');
    backBtn.appendChild(el('span', 'fc-works-back-chevron', '‹'));
    backBtn.appendChild(el('span', '', '社区'));

    var titleEl = el('b', 'fc-works-title', '捡手机文学');

    var newBtn = el('button', 'fc-works-new-btn', '＋ 新建');
    newBtn.type = 'button';
    newBtn.id = 'fc-works-new-btn';

    head.appendChild(backBtn);
    head.appendChild(titleEl);
    head.appendChild(newBtn);

    var scrollEl = el('div', 'fc-works-scroll');
    scrollEl.id = 'fc-works-scroll';

    // 复用韩系奶油风底部弹窗 Sheet
    var sheetBack = el('div', 'fc-chat-sheet-back');
    sheetBack.id = 'fc-works-sheet-back';
    var sheetBox = el('section', 'fc-chat-sheet');
    var sheetTitle = el('h3', '', '');
    var sheetBody = el('div', '');
    sheetBox.appendChild(sheetTitle);
    sheetBox.appendChild(sheetBody);
    sheetBack.appendChild(sheetBox);

    function openWorkSheet(titleText, buildFn) {
      sheetTitle.textContent = titleText;
      sheetBody.replaceChildren();
      buildFn(sheetBody);
      sheetBack.classList.add('show');
    }

    function closeWorkSheet() {
      sheetBack.classList.remove('show');
      sheetBody.replaceChildren();
    }

    sheetBack.addEventListener('click', function(e) {
      if (e.target === sheetBack) closeWorkSheet();
    });

    function openCreateWorkSheet() {
      openWorkSheet('新建捡手机作品', function(body) {
        var label = el('label', '', '作品名称');
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.id = 'fc-work-create-input';
        nameInput.placeholder = '例如：训练场风波、夜班对话';

        var note = el('p', 'fc-chat-sheet-note', '新作品拥有完全独立的聊天记录，初始为空，创建后将直接进入创作。');

        var actions = el('div', 'fc-chat-sheet-actions');
        var cancelBtn = el('button', 'fc-chat-btn alt', '取消');
        cancelBtn.type = 'button';
        cancelBtn.onclick = closeWorkSheet;

        var createBtn = el('button', 'fc-chat-btn', '创建并进入');
        createBtn.type = 'button';
        createBtn.id = 'fc-work-create-submit';
        createBtn.onclick = function() {
          var wApi = worksApi();
          if (!wApi) {
            notify('作品存储模块不可用');
            return;
          }
          var res = wApi.createWork(nameInput.value);
          if (!res.ok) {
            notify(res.error || '创建作品失败');
            return;
          }
          closeWorkSheet();
          openWorkChat(res.work.id);
        };

        nameInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            createBtn.click();
          }
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(createBtn);
        body.appendChild(label);
        body.appendChild(nameInput);
        body.appendChild(note);
        body.appendChild(actions);
        setTimeout(function() { nameInput.focus(); }, 30);
      });
    }

    function openRenameWorkSheet(work) {
      openWorkSheet('重命名作品', function(body) {
        var label = el('label', '', '新的作品名称');
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.id = 'fc-work-rename-input';
        nameInput.value = work.title || '';
        nameInput.placeholder = '输入新的作品名称';

        var actions = el('div', 'fc-chat-sheet-actions');
        var cancelBtn = el('button', 'fc-chat-btn alt', '取消');
        cancelBtn.type = 'button';
        cancelBtn.onclick = closeWorkSheet;

        var saveBtn = el('button', 'fc-chat-btn', '保存名称');
        saveBtn.type = 'button';
        saveBtn.id = 'fc-work-rename-submit';
        saveBtn.onclick = function() {
          var wApi = worksApi();
          if (!wApi) return;
          var res = wApi.renameWork(work.id, nameInput.value);
          if (!res.ok) {
            notify(res.error || '重命名失败');
            return;
          }
          closeWorkSheet();
          drawWorks();
          notify('作品名称已更新');
        };

        nameInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            saveBtn.click();
          }
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        body.appendChild(label);
        body.appendChild(nameInput);
        body.appendChild(actions);
        setTimeout(function() {
          nameInput.focus();
          nameInput.select();
        }, 30);
      });
    }

    function drawWorks() {
      scrollEl.replaceChildren();
      var wApi = worksApi();
      var res = wApi ? wApi.listWorks() : { ok: false, works: [], error: '存储模块未就绪' };
      var works = Array.isArray(res.works) ? res.works : [];

      var intro = el('div', 'fc-works-intro');
      var introLeft = el('div', '');
      introLeft.appendChild(el('div', 'fc-works-eyebrow', 'PHONE FICTION WORKS'));
      introLeft.appendChild(el('div', 'fc-works-sub', '每部作品拥有独立聊天记录，按最近编辑时间排序'));
      intro.appendChild(introLeft);
      intro.appendChild(el('span', 'fc-works-count', '共 ' + works.length + ' 部'));
      scrollEl.appendChild(intro);

      if (!res.ok && res.error) {
        var errBox = el('div', 'fc-works-empty');
        errBox.appendChild(el('h3', '', '读取作品数据提示'));
        errBox.appendChild(el('p', '', res.error));
        scrollEl.appendChild(errBox);
        return;
      }

      if (!works.length) {
        var empty = el('div', 'fc-works-empty');
        empty.appendChild(el('h3', '', '还没有捡手机作品'));
        empty.appendChild(el('p', '', '为每段脑洞建立单独的聊天空间，彼此互不干扰，随时切换续写。'));
        var cta = el('button', 'fc-works-empty-btn', '＋ 新建第一部作品');
        cta.type = 'button';
        cta.id = 'fc-works-empty-new-btn';
        cta.onclick = openCreateWorkSheet;
        empty.appendChild(cta);
        scrollEl.appendChild(empty);
        return;
      }

      var list = el('div', 'fc-works-list');
      list.id = 'fc-works-list';

      works.forEach(function(work) {
        var card = el('article', 'fc-work-card');
        card.dataset.workId = work.id;

        var mainBtn = el('button', 'fc-work-main');
        mainBtn.type = 'button';

        var titleRow = el('div', 'fc-work-title-row');
        titleRow.appendChild(el('strong', 'fc-work-title', work.title || '未命名作品'));
        if (work.isLegacy) {
          titleRow.appendChild(el('span', 'fc-work-legacy-tag', '旧版'));
        }
        mainBtn.appendChild(titleRow);

        var countText = (work.messageCount || 0) + ' 条消息';
        var timeText = '最近编辑 ' + formatUpdatedTime(work.updatedAt);
        mainBtn.appendChild(el('div', 'fc-work-meta', countText + ' · ' + timeText));
        mainBtn.onclick = function() {
          openWorkChat(work.id);
        };

        var actions = el('div', 'fc-work-actions');
        var renameBtn = el('button', 'fc-work-rename-btn', '重命名');
        renameBtn.type = 'button';
        renameBtn.onclick = function(e) {
          e.stopPropagation();
          openRenameWorkSheet(work);
        };

        var enterBtn = el('button', 'fc-work-enter-btn', '›');
        enterBtn.type = 'button';
        enterBtn.setAttribute('aria-label', '打开作品');
        enterBtn.onclick = function() {
          openWorkChat(work.id);
        };

        actions.appendChild(renameBtn);
        actions.appendChild(enterBtn);

        card.appendChild(mainBtn);
        card.appendChild(actions);
        list.appendChild(card);
      });

      scrollEl.appendChild(list);
    }

    backBtn.onclick = function() {
      close();
      container.replaceChildren();
      _onBackToCommunity();
    };
    newBtn.onclick = openCreateWorkSheet;

    wrap.appendChild(head);
    wrap.appendChild(scrollEl);
    wrap.appendChild(sheetBack);
    container.appendChild(wrap);
    drawWorks();
  }

  function openWorkChat(workId) {
    if (!_activeContainer || !workId) return;
    var container = _activeContainer;
    var wApi = worksApi();
    var loaded = wApi ? wApi.getWorkData(workId) : clone(INITIAL_STATE);
    if (!loaded) {
      notify('未能读取该作品数据，请重试');
      return;
    }

    close();
    _currentWorkId = workId;
    if (wApi) {
      wApi.setActiveWorkId(workId);
    }
    _state = loaded;
    _sendSide = 'right';
    _panelMode = '';
    _selectedIndex = -1;
    _expandedVoices = Object.create(null);

    container.replaceChildren();
    var app = el('div', 'fc-chat-app');

    // 顶部栏（保持任务 03~05 既有视觉，返回作品列表）
    var head = el('header', 'fc-chat-head');
    var backBtn = el('button', 'fc-chat-back');
    backBtn.type = 'button';
    backBtn.setAttribute('aria-label', '返回作品列表');
    backBtn.appendChild(el('span', 'fc-chat-back-chevron', '‹'));
    backBtn.appendChild(el('span', '', '作品'));

    var titleEl = el('b', 'fc-chat-title', _state.title || INITIAL_STATE.title);

    var headActions = el('div', 'fc-chat-head-actions');
    var toolsToggleBtn = el('button', 'fc-chat-head-tool', '工具');
    toolsToggleBtn.type = 'button';
    toolsToggleBtn.id = 'fc-chat-tools-toggle';
    toolsToggleBtn.setAttribute('title', '显示/隐藏消息创作操作栏');
    toolsToggleBtn.classList.toggle('active', Boolean(_state.showTools));

    var settingsBtn = el('button', 'fc-chat-head-tool', '设置');
    settingsBtn.type = 'button';
    settingsBtn.id = 'fc-chat-settings-btn';
    settingsBtn.setAttribute('title', '设置角色昵称、头像与聊天外观');

    headActions.appendChild(toolsToggleBtn);
    headActions.appendChild(settingsBtn);

    head.appendChild(backBtn);
    head.appendChild(titleEl);
    head.appendChild(headActions);

    // 消息流与独立背景图层
    var streamWrap = el('div', 'fc-chat-stream-wrap');
    var bgLayer = el('div', 'fc-chat-bg-layer');
    bgLayer.id = 'fc-chat-bg-layer';
    var streamEl = el('div', 'fc-chat-stream');
    streamEl.id = 'fc-chat-stream';
    streamWrap.appendChild(bgLayer);
    streamWrap.appendChild(streamEl);

    // 底部 QQ 风格输入与工具栏
    var bottom = el('div', 'fc-chat-bottom');

    var roleWrap = el('div', 'fc-chat-role');
    var roleBtn = el('button', 'fc-chat-role-btn');
    roleBtn.type = 'button';
    roleBtn.id = 'fc-chat-role-btn';
    roleBtn.setAttribute('title', '切换消息发送身份');
    roleWrap.appendChild(roleBtn);

    var compose = el('div', 'fc-chat-compose');
    var input = el('textarea', 'fc-chat-input');
    input.id = 'fc-chat-input';
    input.rows = 1;
    input.placeholder = '发消息……';

    var emojiBtn = el('button', 'fc-chat-icon-btn', '☺');
    emojiBtn.type = 'button';
    emojiBtn.id = 'fc-chat-emoji-btn';
    emojiBtn.setAttribute('aria-label', '表情包');

    var moreBtn = el('button', 'fc-chat-icon-btn plus', '⊕');
    moreBtn.type = 'button';
    moreBtn.id = 'fc-chat-more-btn';
    moreBtn.setAttribute('aria-label', '更多创作工具');

    var sendBtn = el('button', 'fc-chat-send', '发送');
    sendBtn.type = 'button';
    sendBtn.id = 'fc-chat-send';

    compose.appendChild(input);
    compose.appendChild(emojiBtn);
    compose.appendChild(moreBtn);
    compose.appendChild(sendBtn);

    var panelEl = el('div', 'fc-chat-panel');
    panelEl.id = 'fc-chat-panel';
    panelEl.hidden = true;

    bottom.appendChild(roleWrap);
    bottom.appendChild(compose);
    bottom.appendChild(panelEl);

    // 视觉隐藏但可被原生 <label for> 调起的文件选择器（避免 iOS/WebView 拦截 display:none 的 .click()）
    var stickerBatchInput = document.createElement('input');
    stickerBatchInput.type = 'file';
    stickerBatchInput.accept = 'image/*,.png,.jpg,.jpeg,.webp,.gif';
    stickerBatchInput.multiple = true;
    stickerBatchInput.className = 'fc-sr-file-input';
    stickerBatchInput.id = 'fc-chat-sticker-batch-input';
    stickerBatchInput.setAttribute('aria-label', '选择本地表情包图片');
    stickerBatchInput.addEventListener('click', function() {
      stickerBatchInput.value = '';
    });

    // 底部弹窗 Sheet
    var sheetBack = el('div', 'fc-chat-sheet-back');
    sheetBack.id = 'fc-chat-sheet-back';
    var sheetBox = el('section', 'fc-chat-sheet');
    var sheetTitle = el('h3', '', '');
    var sheetBody = el('div', '');
    sheetBox.appendChild(sheetTitle);
    sheetBox.appendChild(sheetBody);
    sheetBack.appendChild(sheetBox);

    // 图片放大查看 Lightbox
    var lightbox = el('div', 'fc-chat-lightbox');
    lightbox.id = 'fc-chat-lightbox';
    var lightboxImg = document.createElement('img');
    lightboxImg.alt = '图片预览';
    var lightboxClose = el('button', 'fc-chat-lightbox-close', '×');
    lightboxClose.type = 'button';
    lightboxClose.setAttribute('aria-label', '关闭图片预览');
    lightbox.appendChild(lightboxImg);
    lightbox.appendChild(lightboxClose);

    // 角色与聊天外观设置面板
    var settingsPanel = el('section', 'fc-chat-settings-panel');
    settingsPanel.id = 'fc-chat-settings-panel';
    settingsPanel.setAttribute('aria-hidden', 'true');

    // 长按 / 右键消息操作浮层菜单
    var ctxMask = el('div', 'fc-chat-context-mask');
    ctxMask.id = 'fc-chat-context-mask';
    ctxMask.setAttribute('aria-hidden', 'true');
    var ctxMenu = el('div', 'fc-chat-context-menu');
    ctxMenu.id = 'fc-chat-context-menu';
    ctxMenu.setAttribute('role', 'menu');
    ctxMask.appendChild(ctxMenu);

    app.appendChild(head);
    app.appendChild(streamWrap);
    app.appendChild(bottom);
    app.appendChild(stickerBatchInput);
    app.appendChild(sheetBack);
    app.appendChild(settingsPanel);
    app.appendChild(ctxMask);
    app.appendChild(lightbox);
    container.appendChild(app);

    function currentUserName() {
      return (_state && _state.user) || INITIAL_STATE.user;
    }

    function currentCharName() {
      return (_state && _state.char) || INITIAL_STATE.char;
    }

    function applyChatAppearance() {
      var ap = getAppearance(_state && _state.appearance);
      var userTokens = computeBubbleTokens(ap.userBubbleColor);
      var charTokens = computeBubbleTokens(ap.charBubbleColor);

      app.style.setProperty('--fc-chat-bg-color', ap.bgColor);
      app.style.setProperty('--fc-user-bubble-bg', userTokens.bg);
      app.style.setProperty('--fc-user-bubble-fg', userTokens.fg);
      app.style.setProperty('--fc-user-bubble-sub', userTokens.sub);
      app.style.setProperty('--fc-user-bubble-recall-bg', userTokens.recallBg);
      app.style.setProperty('--fc-user-bubble-recall-border', userTokens.recallBorder);

      app.style.setProperty('--fc-char-bubble-bg', charTokens.bg);
      app.style.setProperty('--fc-char-bubble-fg', charTokens.fg);
      app.style.setProperty('--fc-char-bubble-sub', charTokens.sub);
      app.style.setProperty('--fc-char-bubble-recall-bg', charTokens.recallBg);
      app.style.setProperty('--fc-char-bubble-recall-border', charTokens.recallBorder);

      if (isDarkHex(ap.bgColor)) {
        app.classList.add('has-dark-bg');
        app.style.setProperty('--fc-stream-name-fg', '#e3e8e0');
        app.style.setProperty('--fc-empty-title-fg', '#f3f5f0');
        app.style.setProperty('--fc-empty-sub-fg', '#cfd5ce');
      } else {
        app.classList.remove('has-dark-bg');
        app.style.setProperty('--fc-stream-name-fg', '#7a887e');
        app.style.setProperty('--fc-empty-title-fg', '#5b685b');
        app.style.setProperty('--fc-empty-sub-fg', '#889487');
      }

      var bgSeq = ++_activeBgSeq;
      bgLayer.style.backgroundSize = ap.bgImageFit === 'contain' ? 'contain' : 'cover';

      if (ap.bgType === 'image' && ap.bgImageAssetId) {
        var api = assetsApi();
        var cachedBg = api ? api.getCachedSrc(ap.bgImageAssetId) : '';
        if (cachedBg) {
          bgLayer.style.backgroundImage = 'url("' + cachedBg + '")';
          app.classList.add('has-bg-image');
        } else {
          bgLayer.style.backgroundImage = 'none';
          app.classList.remove('has-bg-image');
          if (api) {
            api.getAsset(ap.bgImageAssetId).then(function(record) {
              if (bgSeq !== _activeBgSeq || !document.body.contains(app)) return;
              if (record && record.src) {
                bgLayer.style.backgroundImage = 'url("' + record.src + '")';
                app.classList.add('has-bg-image');
              }
            }).catch(function() {});
          }
        }
      } else {
        bgLayer.style.backgroundImage = 'none';
        app.classList.remove('has-bg-image');
      }
    }

    function syncRoleButton() {
      var isUser = _sendSide === 'right';
      var labelName = isUser ? (currentUserName() + ' · User') : (currentCharName() + ' · Char');
      roleBtn.textContent = labelName + ' ⌄';
      roleBtn.classList.toggle('is-char', !isUser);
    }

    function autoResizeInput() {
      input.style.height = 'auto';
      var next = Math.min(96, Math.max(38, input.scrollHeight));
      input.style.height = next + 'px';
    }

    function openLightbox(src, alt) {
      if (!src) return;
      lightboxImg.src = src;
      lightboxImg.alt = alt || '图片预览';
      lightbox.classList.add('show');
    }

    function closeLightbox() {
      lightbox.classList.remove('show');
      lightboxImg.removeAttribute('src');
    }

    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function(e) {
      if (e.target === lightbox) closeLightbox();
    });

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

    function isAssetUsedInCurrentState(assetId) {
      if (!assetId || !_state) return false;
      if (_state.userAvatarAssetId === assetId || _state.charAvatarAssetId === assetId) {
        return true;
      }
      if (_state.appearance && _state.appearance.bgImageAssetId === assetId) {
        return true;
      }
      var api = assetsApi();
      return api ? api.isAssetReferenced(assetId, _state.items || []) : false;
    }

    function cleanupUnreferencedAsset(assetId, allowedKind) {
      if (!assetId) return;
      if (isAssetUsedInCurrentState(assetId)) return;
      var api = assetsApi();
      var wApi = worksApi();
      if (!api) return;
      var usedElsewhere = wApi ? wApi.isAssetReferencedInOtherWorks(assetId, _currentWorkId) : false;
      if (usedElsewhere) return;

      api.getAsset(assetId).then(function(record) {
        if (!record) return;
        if (allowedKind && record.kind !== allowedKind) return;
        if (isAssetUsedInCurrentState(assetId)) return;
        var stillOther = wApi ? wApi.isAssetReferencedInOtherWorks(assetId, _currentWorkId) : false;
        if (!stillOther) {
          return api.deleteAsset(assetId);
        }
      }).catch(function() {});
    }

    function closeRoleSettingsPanel() {
      settingsPanel.classList.remove('show');
      settingsPanel.setAttribute('aria-hidden', 'true');
      settingsPanel.replaceChildren();
    }

    function openRoleSettingsPanel() {
      if (_panelMode) setPanelMode('');
      closeSheet();
      settingsPanel.replaceChildren();

      var curAp = getAppearance(_state && _state.appearance);
      var draft = {
        user: {
          name: currentUserName(),
          mode: 'keep', // 'keep' | 'replace' | 'clear'
          existingAssetId: (_state && _state.userAvatarAssetId) || '',
          dataUrl: '',
          fileName: ''
        },
        char: {
          name: currentCharName(),
          mode: 'keep',
          existingAssetId: (_state && _state.charAvatarAssetId) || '',
          dataUrl: '',
          fileName: ''
        },
        appearance: {
          bgType: curAp.bgType,
          bgColor: curAp.bgColor,
          bgImageMode: curAp.bgType === 'image' && curAp.bgImageAssetId ? 'keep' : 'clear', // 'keep' | 'replace' | 'clear'
          existingBgAssetId: curAp.bgImageAssetId || '',
          bgDataUrl: '',
          bgFileName: '',
          bgImageFit: curAp.bgImageFit,
          userBubbleColor: curAp.userBubbleColor,
          charBubbleColor: curAp.charBubbleColor
        }
      };
      var panelOpenToken = ++_activeResolveSeq;

      var sHead = el('header', 'fc-settings-head');
      var sBackBtn = el('button', 'fc-settings-back');
      sBackBtn.type = 'button';
      sBackBtn.id = 'fc-chat-settings-back';
      sBackBtn.appendChild(el('span', 'fc-works-back-chevron', '‹'));
      sBackBtn.appendChild(el('span', '', '返回'));
      sBackBtn.onclick = closeRoleSettingsPanel;

      var sTitle = el('b', 'fc-settings-title', '聊天设置');
      var sSpacer = el('div', 'fc-settings-head-spacer');
      sHead.appendChild(sBackBtn);
      sHead.appendChild(sTitle);
      sHead.appendChild(sSpacer);

      var sBody = el('div', 'fc-settings-body');

      function applyPreviewImage(previewBox, src) {
        previewBox.replaceChildren();
        if (src) {
          var img = document.createElement('img');
          img.src = src;
          img.alt = '头像预览';
          img.onerror = function() {
            previewBox.replaceChildren();
            previewBox.classList.remove('has-img');
          };
          previewBox.classList.add('has-img');
          previewBox.appendChild(img);
        } else {
          previewBox.classList.remove('has-img');
        }
      }

      function buildRoleCard(roleKey, cardTitle, tagText, placeholderText, isUserSide) {
        var roleDraft = draft[roleKey];
        var card = el('section', 'fc-settings-card');

        var cardHead = el('div', 'fc-settings-card-head');
        cardHead.appendChild(el('span', 'fc-settings-card-title', cardTitle));
        cardHead.appendChild(el('span', 'fc-settings-card-tag', tagText));
        card.appendChild(cardHead);

        var avatarRow = el('div', 'fc-settings-avatar-row');
        var previewBox = el('div', 'fc-settings-avatar-preview' + (isUserSide ? ' is-user' : ''));
        previewBox.id = 'fc-settings-' + roleKey + '-avatar-preview';

        var opsCol = el('div', 'fc-settings-avatar-ops');
        opsCol.appendChild(el('span', 'fc-settings-avatar-label', isUserSide ? '我的头像' : '对方头像'));

        var btnRow = el('div', 'fc-settings-avatar-btns');
        var uploadBtn = el('button', 'fc-settings-mini-btn primary', '选择本地头像');
        uploadBtn.type = 'button';
        uploadBtn.id = 'fc-settings-' + roleKey + '-avatar-upload';

        var clearBtn = el('button', 'fc-settings-mini-btn', '恢复默认');
        clearBtn.type = 'button';
        clearBtn.id = 'fc-settings-' + roleKey + '-avatar-clear';

        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.hidden = true;
        fileInput.id = 'fc-settings-' + roleKey + '-avatar-file';

        function syncAvatarControls() {
          var hasCustom = (roleDraft.mode === 'replace' && Boolean(roleDraft.dataUrl)) ||
            (roleDraft.mode === 'keep' && Boolean(roleDraft.existingAssetId));
          clearBtn.disabled = !hasCustom;
        }

        if (roleDraft.existingAssetId) {
          var api = assetsApi();
          var cached = api ? api.getCachedSrc(roleDraft.existingAssetId) : '';
          if (cached) {
            applyPreviewImage(previewBox, cached);
          } else if (api) {
            api.getAsset(roleDraft.existingAssetId).then(function(record) {
              if (!settingsPanel.classList.contains('show') || panelOpenToken !== _activeResolveSeq) return;
              if (roleDraft.mode !== 'keep') return;
              if (record && record.src) {
                applyPreviewImage(previewBox, record.src);
              }
            }).catch(function() {});
          }
        }
        syncAvatarControls();

        uploadBtn.onclick = function() {
          fileInput.value = '';
          fileInput.click();
        };

        fileInput.addEventListener('change', async function() {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          var api = assetsApi();
          if (!api) {
            notify('本地素材存储模块不可用');
            return;
          }
          try {
            var dataUrl = await api.readImageFile(file, 8);
            roleDraft.mode = 'replace';
            roleDraft.dataUrl = dataUrl;
            roleDraft.fileName = file.name || (isUserSide ? '我的头像' : '对方头像');
            applyPreviewImage(previewBox, dataUrl);
            syncAvatarControls();
          } catch (err) {
            fileInput.value = '';
            notify(err && err.message ? err.message : '头像读取失败');
          }
        });

        clearBtn.onclick = function() {
          roleDraft.mode = 'clear';
          roleDraft.dataUrl = '';
          roleDraft.fileName = '';
          applyPreviewImage(previewBox, '');
          syncAvatarControls();
        };

        btnRow.appendChild(uploadBtn);
        btnRow.appendChild(clearBtn);
        opsCol.appendChild(btnRow);
        avatarRow.appendChild(previewBox);
        avatarRow.appendChild(opsCol);
        avatarRow.appendChild(fileInput);
        card.appendChild(avatarRow);

        var nameLabel = el('label', 'fc-settings-field-label', isUserSide ? '我的昵称' : '对方昵称');
        nameLabel.setAttribute('for', 'fc-settings-' + roleKey + '-name');
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'fc-settings-input';
        nameInput.id = 'fc-settings-' + roleKey + '-name';
        nameInput.maxLength = 40;
        nameInput.value = roleDraft.name;
        nameInput.placeholder = placeholderText;
        nameInput.addEventListener('input', function() {
          roleDraft.name = nameInput.value;
        });

        card.appendChild(nameLabel);
        card.appendChild(nameInput);
        return card;
      }

      var roleSectionBar = el('div', 'fc-settings-section-bar');
      roleSectionBar.appendChild(el('span', 'fc-settings-section-label', '角色与头像'));
      sBody.appendChild(roleSectionBar);
      sBody.appendChild(buildRoleCard('user', '我的身份', '右侧气泡', '输入我的昵称（默认：我）', true));
      sBody.appendChild(buildRoleCard('char', '对方身份', '左侧气泡', '输入对方昵称（默认：对方）', false));

      // —— 聊天外观区域 ——
      var appearSectionBar = el('div', 'fc-settings-section-bar');
      appearSectionBar.appendChild(el('span', 'fc-settings-section-label', '聊天外观'));
      var resetAppearBtn = el('button', 'fc-settings-mini-btn', '恢复默认外观');
      resetAppearBtn.type = 'button';
      resetAppearBtn.id = 'fc-settings-appearance-reset';
      appearSectionBar.appendChild(resetAppearBtn);
      sBody.appendChild(appearSectionBar);

      // 实时预览卡片
      var previewCard = el('div', 'fc-appearance-preview');
      previewCard.id = 'fc-settings-appearance-preview';

      var previewLeftRow = el('div', 'fc-preview-row');
      previewLeftRow.appendChild(el('span', 'fc-preview-dot'));
      var previewCharBubble = el('div', 'fc-preview-bubble', '对方：今天的晚风好像很温柔。');
      previewCharBubble.id = 'fc-settings-preview-char-bubble';
      previewLeftRow.appendChild(previewCharBubble);

      var previewRightRow = el('div', 'fc-preview-row right');
      previewRightRow.appendChild(el('span', 'fc-preview-dot'));
      var previewUserBubble = el('div', 'fc-preview-bubble', '我：刚买好冰美式，这就来找你。');
      previewUserBubble.id = 'fc-settings-preview-user-bubble';
      previewRightRow.appendChild(previewUserBubble);

      previewCard.appendChild(previewLeftRow);
      previewCard.appendChild(previewRightRow);
      sBody.appendChild(previewCard);

      // 背景设置卡片
      var bgCard = el('section', 'fc-settings-card');
      bgCard.id = 'fc-settings-bg-card';
      var bgCardHead = el('div', 'fc-settings-card-head');
      bgCardHead.appendChild(el('span', 'fc-settings-card-title', '聊天背景'));
      var bgStatusTag = el('span', 'fc-settings-card-tag', '默认浅灰绿');
      bgStatusTag.id = 'fc-settings-bg-status-tag';
      bgCardHead.appendChild(bgStatusTag);
      bgCard.appendChild(bgCardHead);

      var bgColorSub = el('div', 'fc-settings-subblock');
      var bgColorSubHead = el('div', 'fc-settings-subhead');
      bgColorSubHead.appendChild(el('span', 'fc-settings-subhead-title', '背景颜色预设与自定义'));
      bgColorSub.appendChild(bgColorSubHead);

      var bgSwatchRow = el('div', 'fc-swatch-row');
      var bgPresetBtns = [];
      BG_COLOR_PRESETS.forEach(function(preset) {
        var sw = el('button', 'fc-color-swatch');
        sw.type = 'button';
        sw.title = preset.label;
        sw.setAttribute('aria-label', preset.label);
        sw.dataset.bgPreset = preset.color;
        sw.style.backgroundColor = preset.color;
        sw.onclick = function() {
          draft.appearance.bgType = 'color';
          draft.appearance.bgColor = preset.color;
          draft.appearance.bgImageMode = 'clear';
          draft.appearance.bgDataUrl = '';
          draft.appearance.bgFileName = '';
          syncAppearanceUi();
        };
        bgPresetBtns.push(sw);
        bgSwatchRow.appendChild(sw);
      });

      var bgPickerChip = el('label', 'fc-color-picker-chip');
      var bgColorInput = document.createElement('input');
      bgColorInput.type = 'color';
      bgColorInput.id = 'fc-settings-bg-color';
      bgColorInput.value = draft.appearance.bgColor;
      var bgColorHexText = el('span', '', draft.appearance.bgColor);
      bgColorHexText.id = 'fc-settings-bg-color-label';
      bgPickerChip.appendChild(bgColorInput);
      bgPickerChip.appendChild(el('span', '', '自定义 '));
      bgPickerChip.appendChild(bgColorHexText);
      bgColorInput.addEventListener('input', function() {
        draft.appearance.bgType = 'color';
        draft.appearance.bgColor = normalizeHex(bgColorInput.value, DEFAULT_APPEARANCE.bgColor);
        draft.appearance.bgImageMode = 'clear';
        draft.appearance.bgDataUrl = '';
        draft.appearance.bgFileName = '';
        syncAppearanceUi();
      });
      bgSwatchRow.appendChild(bgPickerChip);
      bgColorSub.appendChild(bgSwatchRow);
      bgCard.appendChild(bgColorSub);

      // 背景图片子区域
      var bgImgSub = el('div', 'fc-settings-subblock');
      var bgImgSubHead = el('div', 'fc-settings-subhead');
      bgImgSubHead.appendChild(el('span', 'fc-settings-subhead-title', '相册背景图片与显示方式'));
      bgImgSub.appendChild(bgImgSubHead);

      var bgImgBtns = el('div', 'fc-settings-avatar-btns');
      var bgUploadBtn = el('button', 'fc-settings-mini-btn primary', '上传背景图片');
      bgUploadBtn.type = 'button';
      bgUploadBtn.id = 'fc-settings-bg-image-upload';

      var bgClearImgBtn = el('button', 'fc-settings-mini-btn', '清除背景图');
      bgClearImgBtn.type = 'button';
      bgClearImgBtn.id = 'fc-settings-bg-image-clear';

      var bgResetBtn = el('button', 'fc-settings-mini-btn', '一键恢复默认背景');
      bgResetBtn.type = 'button';
      bgResetBtn.id = 'fc-settings-bg-reset';

      var bgFileInput = document.createElement('input');
      bgFileInput.type = 'file';
      bgFileInput.accept = 'image/*';
      bgFileInput.hidden = true;
      bgFileInput.id = 'fc-settings-bg-image-file';

      bgImgBtns.appendChild(bgUploadBtn);
      bgImgBtns.appendChild(bgClearImgBtn);
      bgImgBtns.appendChild(bgResetBtn);
      bgImgSub.appendChild(bgImgBtns);
      bgImgSub.appendChild(bgFileInput);

      var bgFitGroup = el('div', 'fc-bg-fit-group');
      bgFitGroup.appendChild(el('span', 'fc-settings-subhead-title', '图片适配：'));
      var fitCoverBtn = el('button', 'fc-settings-mini-btn', '铺满');
      fitCoverBtn.type = 'button';
      fitCoverBtn.id = 'fc-settings-bg-fit-cover';
      fitCoverBtn.dataset.bgFit = 'cover';

      var fitContainBtn = el('button', 'fc-settings-mini-btn', '完整显示');
      fitContainBtn.type = 'button';
      fitContainBtn.id = 'fc-settings-bg-fit-contain';
      fitContainBtn.dataset.bgFit = 'contain';

      bgFitGroup.appendChild(fitCoverBtn);
      bgFitGroup.appendChild(fitContainBtn);
      bgImgSub.appendChild(bgFitGroup);
      bgCard.appendChild(bgImgSub);
      sBody.appendChild(bgCard);

      // 气泡颜色设置卡片
      var bubbleCard = el('section', 'fc-settings-card');
      bubbleCard.id = 'fc-settings-bubble-card';
      var bubbleHead = el('div', 'fc-settings-card-head');
      bubbleHead.appendChild(el('span', 'fc-settings-card-title', '消息气泡颜色'));
      bubbleHead.appendChild(el('span', 'fc-settings-card-tag', '自动文字高对比'));
      bubbleCard.appendChild(bubbleHead);

      var pairSub = el('div', 'fc-settings-subblock');
      var pairSubHead = el('div', 'fc-settings-subhead');
      pairSubHead.appendChild(el('span', 'fc-settings-subhead-title', '韩系柔和配色组合'));
      pairSub.appendChild(pairSubHead);

      var pairList = el('div', 'fc-bubble-preset-list');
      var pairBtns = [];
      BUBBLE_PAIR_PRESETS.forEach(function(pair) {
        var pBtn = el('button', 'fc-bubble-preset-btn');
        pBtn.type = 'button';
        pBtn.dataset.bubblePair = pair.id;
        var dots = el('span', 'fc-bubble-preset-dots');
        var dotChar = document.createElement('i');
        dotChar.style.backgroundColor = pair.char;
        var dotUser = document.createElement('i');
        dotUser.style.backgroundColor = pair.user;
        dots.appendChild(dotChar);
        dots.appendChild(dotUser);
        pBtn.appendChild(dots);
        pBtn.appendChild(el('span', '', pair.label));
        pBtn.onclick = function() {
          draft.appearance.userBubbleColor = pair.user;
          draft.appearance.charBubbleColor = pair.char;
          syncAppearanceUi();
        };
        pairBtns.push({ btn: pBtn, pair: pair });
        pairList.appendChild(pBtn);
      });
      pairSub.appendChild(pairList);
      bubbleCard.appendChild(pairSub);

      function buildBubbleColorPicker(titleText, inputId, labelId, presets, getColor, setColor) {
        var sub = el('div', 'fc-settings-subblock');
        var subHead = el('div', 'fc-settings-subhead');
        subHead.appendChild(el('span', 'fc-settings-subhead-title', titleText));
        sub.appendChild(subHead);

        var row = el('div', 'fc-swatch-row');
        var swatches = [];
        presets.forEach(function(hex) {
          var sw = el('button', 'fc-color-swatch');
          sw.type = 'button';
          sw.title = hex;
          sw.setAttribute('aria-label', titleText + ' ' + hex);
          sw.style.backgroundColor = hex;
          sw.onclick = function() {
            setColor(hex);
            syncAppearanceUi();
          };
          swatches.push({ el: sw, hex: hex });
          row.appendChild(sw);
        });

        var pickerChip = el('label', 'fc-color-picker-chip');
        var colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.id = inputId;
        colorInput.value = getColor();
        var hexLabel = el('span', '', getColor());
        hexLabel.id = labelId;
        pickerChip.appendChild(colorInput);
        pickerChip.appendChild(el('span', '', '自定义 '));
        pickerChip.appendChild(hexLabel);

        colorInput.addEventListener('input', function() {
          setColor(normalizeHex(colorInput.value, getColor()));
          syncAppearanceUi();
        });
        row.appendChild(pickerChip);
        sub.appendChild(row);
        bubbleCard.appendChild(sub);

        return function syncRow() {
          var cur = getColor();
          colorInput.value = cur;
          hexLabel.textContent = cur;
          swatches.forEach(function(item) {
            item.el.classList.toggle('active', item.hex === cur);
          });
        };
      }

      var syncUserBubblePicker = buildBubbleColorPicker(
        '我的消息气泡（默认 #d9e3d2）',
        'fc-settings-user-bubble-color',
        'fc-settings-user-bubble-label',
        USER_BUBBLE_PRESETS,
        function() { return draft.appearance.userBubbleColor; },
        function(val) { draft.appearance.userBubbleColor = val; }
      );

      var syncCharBubblePicker = buildBubbleColorPicker(
        '对方消息气泡（默认 #fffefa）',
        'fc-settings-char-bubble-color',
        'fc-settings-char-bubble-label',
        CHAR_BUBBLE_PRESETS,
        function() { return draft.appearance.charBubbleColor; },
        function(val) { draft.appearance.charBubbleColor = val; }
      );

      sBody.appendChild(bubbleCard);

      var cachedBgDataUrl = '';
      if (draft.appearance.bgImageMode === 'keep' && draft.appearance.existingBgAssetId) {
        var bgApi = assetsApi();
        cachedBgDataUrl = bgApi ? bgApi.getCachedSrc(draft.appearance.existingBgAssetId) : '';
        if (!cachedBgDataUrl && bgApi) {
          bgApi.getAsset(draft.appearance.existingBgAssetId).then(function(record) {
            if (!settingsPanel.classList.contains('show') || panelOpenToken !== _activeResolveSeq) return;
            if (draft.appearance.bgImageMode !== 'keep') return;
            if (record && record.src) {
              cachedBgDataUrl = record.src;
              syncAppearanceUi();
            }
          }).catch(function() {});
        }
      }

      function syncAppearanceUi() {
        var ap = draft.appearance;
        var hasBgImage = ap.bgType === 'image' && (
          (ap.bgImageMode === 'replace' && Boolean(ap.bgDataUrl)) ||
          (ap.bgImageMode === 'keep' && Boolean(ap.existingBgAssetId))
        );
        var activeBgSrc = ap.bgImageMode === 'replace' ? ap.bgDataUrl : cachedBgDataUrl;

        previewCard.style.backgroundColor = ap.bgColor;
        if (hasBgImage && activeBgSrc) {
          previewCard.style.backgroundImage = 'url("' + activeBgSrc + '")';
          previewCard.style.backgroundSize = ap.bgImageFit === 'contain' ? 'contain' : 'cover';
        } else {
          previewCard.style.backgroundImage = 'none';
        }

        var previewCharTokens = computeBubbleTokens(ap.charBubbleColor);
        var previewUserTokens = computeBubbleTokens(ap.userBubbleColor);
        previewCharBubble.style.backgroundColor = previewCharTokens.bg;
        previewCharBubble.style.color = previewCharTokens.fg;
        previewUserBubble.style.backgroundColor = previewUserTokens.bg;
        previewUserBubble.style.color = previewUserTokens.fg;

        bgColorInput.value = ap.bgColor;
        bgColorHexText.textContent = ap.bgColor;
        bgPresetBtns.forEach(function(sw) {
          sw.classList.toggle('active', !hasBgImage && sw.dataset.bgPreset === ap.bgColor);
        });

        bgClearImgBtn.disabled = !hasBgImage;
        fitCoverBtn.disabled = !hasBgImage;
        fitContainBtn.disabled = !hasBgImage;
        fitCoverBtn.classList.toggle('active', hasBgImage && ap.bgImageFit === 'cover');
        fitContainBtn.classList.toggle('active', hasBgImage && ap.bgImageFit === 'contain');

        if (hasBgImage) {
          bgStatusTag.textContent = ap.bgImageFit === 'contain' ? '图片 · 完整显示' : '图片 · 铺满';
        } else if (ap.bgColor === DEFAULT_APPEARANCE.bgColor) {
          bgStatusTag.textContent = '默认浅灰绿';
        } else {
          bgStatusTag.textContent = '纯色 ' + ap.bgColor;
        }

        pairBtns.forEach(function(entry) {
          var matched = entry.pair.user === ap.userBubbleColor && entry.pair.char === ap.charBubbleColor;
          entry.btn.classList.toggle('active', matched);
        });

        syncUserBubblePicker();
        syncCharBubblePicker();
      }

      bgUploadBtn.onclick = function() {
        bgFileInput.value = '';
        bgFileInput.click();
      };

      bgFileInput.addEventListener('change', async function() {
        var file = bgFileInput.files && bgFileInput.files[0];
        if (!file) return;
        var api = assetsApi();
        if (!api) {
          notify('本地素材存储模块不可用');
          return;
        }
        try {
          var dataUrl = await api.readImageFile(file, 8);
          draft.appearance.bgType = 'image';
          draft.appearance.bgImageMode = 'replace';
          draft.appearance.bgDataUrl = dataUrl;
          draft.appearance.bgFileName = file.name || '聊天背景';
          syncAppearanceUi();
        } catch (err) {
          bgFileInput.value = '';
          notify(err && err.message ? err.message : '背景图片读取失败');
        }
      });

      bgClearImgBtn.onclick = function() {
        draft.appearance.bgType = 'color';
        draft.appearance.bgImageMode = 'clear';
        draft.appearance.bgDataUrl = '';
        draft.appearance.bgFileName = '';
        syncAppearanceUi();
      };

      bgResetBtn.onclick = function() {
        draft.appearance.bgType = 'color';
        draft.appearance.bgColor = DEFAULT_APPEARANCE.bgColor;
        draft.appearance.bgImageMode = 'clear';
        draft.appearance.bgDataUrl = '';
        draft.appearance.bgFileName = '';
        draft.appearance.bgImageFit = 'cover';
        syncAppearanceUi();
      };

      fitCoverBtn.onclick = function() {
        draft.appearance.bgImageFit = 'cover';
        syncAppearanceUi();
      };

      fitContainBtn.onclick = function() {
        draft.appearance.bgImageFit = 'contain';
        syncAppearanceUi();
      };

      resetAppearBtn.onclick = function() {
        draft.appearance.bgType = DEFAULT_APPEARANCE.bgType;
        draft.appearance.bgColor = DEFAULT_APPEARANCE.bgColor;
        draft.appearance.bgImageMode = 'clear';
        draft.appearance.bgDataUrl = '';
        draft.appearance.bgFileName = '';
        draft.appearance.bgImageFit = DEFAULT_APPEARANCE.bgImageFit;
        draft.appearance.userBubbleColor = DEFAULT_APPEARANCE.userBubbleColor;
        draft.appearance.charBubbleColor = DEFAULT_APPEARANCE.charBubbleColor;
        syncAppearanceUi();
      };

      syncAppearanceUi();

      sBody.appendChild(el('p', 'fc-settings-note', '说明：每部作品的角色、头像与聊天外观完全独立；支持中文、英文、数字及常见符号。头像与背景图片保存在浏览器 IndexedDB 中，调整后需点击「保存设置」生效。'));

      var sFoot = el('div', 'fc-settings-foot');
      var footBackBtn = el('button', 'fc-chat-btn alt', '返回');
      footBackBtn.type = 'button';
      footBackBtn.id = 'fc-chat-settings-cancel';
      footBackBtn.onclick = closeRoleSettingsPanel;

      var saveBtn = el('button', 'fc-chat-btn', '保存设置');
      saveBtn.type = 'button';
      saveBtn.id = 'fc-chat-settings-save';
      saveBtn.onclick = async function() {
        var api = assetsApi();
        var oldUserAvatarId = (_state && _state.userAvatarAssetId) || '';
        var oldCharAvatarId = (_state && _state.charAvatarAssetId) || '';
        var oldBgAssetId = (_state && _state.appearance && _state.appearance.bgImageAssetId) || '';
        var nextUserAvatarId = oldUserAvatarId;
        var nextCharAvatarId = oldCharAvatarId;
        var nextBgAssetId = oldBgAssetId;

        var needsAssets = draft.user.mode === 'replace' || draft.char.mode === 'replace' ||
          (draft.appearance.bgType === 'image' && draft.appearance.bgImageMode === 'replace');
        if (needsAssets && !api) {
          notify('本地素材存储模块不可用');
          return;
        }

        saveBtn.disabled = true;
        try {
          if (draft.user.mode === 'replace' && draft.user.dataUrl) {
            var savedUserAvatar = await api.putAsset({
              id: api.uid('avt_'),
              name: draft.user.fileName || '我的头像',
              src: draft.user.dataUrl,
              kind: 'avatar'
            });
            nextUserAvatarId = savedUserAvatar.id;
          } else if (draft.user.mode === 'clear') {
            nextUserAvatarId = '';
          }

          if (draft.char.mode === 'replace' && draft.char.dataUrl) {
            var savedCharAvatar = await api.putAsset({
              id: api.uid('avt_'),
              name: draft.char.fileName || '对方头像',
              src: draft.char.dataUrl,
              kind: 'avatar'
            });
            nextCharAvatarId = savedCharAvatar.id;
          } else if (draft.char.mode === 'clear') {
            nextCharAvatarId = '';
          }

          if (draft.appearance.bgType === 'image') {
            if (draft.appearance.bgImageMode === 'replace' && draft.appearance.bgDataUrl) {
              var savedBgImg = await api.putAsset({
                id: api.uid('bg_'),
                name: draft.appearance.bgFileName || '聊天背景',
                src: draft.appearance.bgDataUrl,
                kind: 'bg'
              });
              nextBgAssetId = savedBgImg.id;
            } else if (draft.appearance.bgImageMode === 'clear') {
              nextBgAssetId = '';
            }
          } else {
            nextBgAssetId = '';
          }

          _state.user = String(draft.user.name || '').trim() || INITIAL_STATE.user;
          _state.char = String(draft.char.name || '').trim() || INITIAL_STATE.char;
          _state.userAvatarAssetId = nextUserAvatarId;
          _state.charAvatarAssetId = nextCharAvatarId;
          _state.appearance = getAppearance({
            bgType: draft.appearance.bgType === 'image' && nextBgAssetId ? 'image' : 'color',
            bgColor: draft.appearance.bgColor,
            bgImageAssetId: nextBgAssetId,
            bgImageFit: draft.appearance.bgImageFit,
            userBubbleColor: draft.appearance.userBubbleColor,
            charBubbleColor: draft.appearance.charBubbleColor
          });

          var savedOk = saveState(_state);
          if (!savedOk) {
            saveBtn.disabled = false;
            return;
          }

          closeRoleSettingsPanel();
          syncRoleButton();
          applyChatAppearance();
          renderMessages(false);
          notify('已保存聊天设置');

          if (oldUserAvatarId && oldUserAvatarId !== nextUserAvatarId) {
            cleanupUnreferencedAsset(oldUserAvatarId, 'avatar');
          }
          if (oldCharAvatarId && oldCharAvatarId !== nextCharAvatarId && oldCharAvatarId !== oldUserAvatarId) {
            cleanupUnreferencedAsset(oldCharAvatarId, 'avatar');
          }
          if (oldBgAssetId && oldBgAssetId !== nextBgAssetId) {
            cleanupUnreferencedAsset(oldBgAssetId, 'bg');
          }
        } catch (err) {
          notify(err && err.message ? err.message : '保存设置失败');
        } finally {
          saveBtn.disabled = false;
        }
      };

      sFoot.appendChild(footBackBtn);
      sFoot.appendChild(saveBtn);

      settingsPanel.appendChild(sHead);
      settingsPanel.appendChild(sBody);
      settingsPanel.appendChild(sFoot);
      settingsPanel.classList.add('show');
      settingsPanel.setAttribute('aria-hidden', 'false');
    }

    function setPanelMode(mode) {
      _panelMode = mode || '';
      panelEl.hidden = !_panelMode;
      emojiBtn.classList.toggle('active', _panelMode === 'emoji');
      moreBtn.classList.toggle('active', _panelMode === 'more');
      if (_panelMode === 'emoji') {
        renderStickerPanel();
      } else if (_panelMode === 'more') {
        renderMorePanel();
      } else {
        panelEl.replaceChildren();
      }
    }

    function togglePanelMode(mode) {
      setPanelMode(_panelMode === mode ? '' : mode);
    }

    function unwrapWithdrawIfNeeded(index) {
      var m = _state.items[index];
      if (!m) return null;
      if (m.type === 'withdraw' && m.original) {
        var unwrapped = Object.assign({}, clone(m.original), {
          side: m.side || m.original.side,
          fakeRecall: true
        });
        _state.items[index] = unwrapped;
        return unwrapped;
      }
      return m;
    }

    function toggleFakeRecall(index) {
      var m = unwrapWithdrawIfNeeded(index);
      if (!m || m.type !== 'text') return;
      if (_state.items[index] === m) {
        m.fakeRecall = !m.fakeRecall;
      }
      saveState(_state);
      renderMessages(false);
      notify(m.fakeRecall ? '已设为假撤回状态' : '已恢复消息显示');
    }

    function openEditTextSheet(index) {
      var m = _state.items[index];
      if (!m || m.type !== 'text') return;
      openSheet('编辑消息', function(body) {
        var label = el('label', '', '修改消息内容');
        var textarea = document.createElement('textarea');
        textarea.id = 'fc-chat-edit-input';
        textarea.value = m.text || '';

        var actions = el('div', 'fc-chat-sheet-actions');
        var cancelBtn = el('button', 'fc-chat-btn alt', '取消');
        cancelBtn.type = 'button';
        cancelBtn.onclick = closeSheet;

        var saveBtn = el('button', 'fc-chat-btn', '保存修改');
        saveBtn.type = 'button';
        saveBtn.id = 'fc-chat-edit-save';
        saveBtn.onclick = function() {
          var nextText = textarea.value.trim();
          if (!nextText) {
            notify('消息内容不能为空');
            return;
          }
          m.text = nextText;
          _selectedIndex = -1;
          saveState(_state);
          closeSheet();
          renderMessages(false);
          notify('已修改消息内容');
        };

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        body.appendChild(label);
        body.appendChild(textarea);
        body.appendChild(actions);
        setTimeout(function() { textarea.focus(); }, 30);
      });
    }

    function openRewriteSheet(index) {
      var m = unwrapWithdrawIfNeeded(index);
      if (!m || m.type !== 'text') return;
      openSheet('改写消息', function(body) {
        var label = el('label', '', '修改后的消息内容（保存后将重新显示）');
        var textarea = document.createElement('textarea');
        textarea.id = 'fc-chat-rewrite-input';
        textarea.value = m.text || '';

        var actions = el('div', 'fc-chat-sheet-actions');
        var cancelBtn = el('button', 'fc-chat-btn alt', '取消');
        cancelBtn.type = 'button';
        cancelBtn.onclick = closeSheet;

        var saveBtn = el('button', 'fc-chat-btn', '保存并显示');
        saveBtn.type = 'button';
        saveBtn.id = 'fc-chat-rewrite-save';
        saveBtn.onclick = function() {
          var nextText = textarea.value.trim();
          if (!nextText) {
            notify('消息内容不能为空');
            return;
          }
          m.text = nextText;
          m.fakeRecall = false;
          _selectedIndex = -1;
          saveState(_state);
          closeSheet();
          renderMessages(false);
          notify('消息已改写并重新显示');
        };

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        body.appendChild(label);
        body.appendChild(textarea);
        body.appendChild(actions);
        setTimeout(function() { textarea.focus(); }, 30);
      });
    }

    function isTransferClaimed(item) {
      if (!item) return false;
      return item.status === 'claimed' || item.claimed === true || item.received === true;
    }

    function toggleTransferStatus(index) {
      var m = _state.items[index];
      if (!m || m.type !== 'transfer') return;
      var nextClaimed = !isTransferClaimed(m);
      m.status = nextClaimed ? 'claimed' : 'unclaimed';
      delete m.claimed;
      delete m.received;
      saveState(_state);
      renderMessages(false);
      notify(nextClaimed ? '已切换为「已领取」状态' : '已切换为「未领取」状态');
    }

    function refreshVoicePlayUI() {
      var buttons = streamEl.querySelectorAll('.fc-chat-voice');
      Array.prototype.forEach.call(buttons, function(btn) {
        var idx = Number(btn.dataset.msgIndex);
        var active = idx === _playingVoiceIndex;
        btn.classList.toggle('is-playing', active);
        var icon = btn.querySelector('.fc-chat-voice-icon');
        if (icon) icon.textContent = active ? '❚❚' : '▶';
      });
    }

    async function playVoiceMessage(index, item) {
      if (!item) return;
      if (_playingVoiceIndex === index) {
        stopVoicePlayback();
        refreshVoicePlayUI();
        return;
      }

      stopVoicePlayback();
      _playingVoiceIndex = index;
      refreshVoicePlayUI();

      var audioSrc = item.audio || '';
      var api = assetsApi();
      if (!audioSrc && item.assetId && api) {
        audioSrc = api.getCachedSrc(item.assetId);
        if (!audioSrc) {
          try {
            var record = await api.getAsset(item.assetId);
            if (_playingVoiceIndex !== index) return;
            audioSrc = (record && record.src) || '';
          } catch (_) {
            audioSrc = '';
          }
        }
      }

      if (audioSrc) {
        try {
          var audio = new Audio(audioSrc);
          _activeAudio = audio;
          audio.onended = function() {
            if (_activeAudio === audio) {
              _activeAudio = null;
              _playingVoiceIndex = -1;
              refreshVoicePlayUI();
            }
          };
          audio.onerror = function() {
            if (_activeAudio === audio) {
              _activeAudio = null;
              _playingVoiceIndex = -1;
              refreshVoicePlayUI();
            }
            notify('本地音频播放失败');
          };
          await audio.play();
          return;
        } catch (_) {
          _activeAudio = null;
          _playingVoiceIndex = -1;
          refreshVoicePlayUI();
          if (!item.text || !('speechSynthesis' in global)) {
            notify('音频播放被拦截或格式不支持');
            return;
          }
        }
      }

      if (item.text && 'speechSynthesis' in global && typeof global.SpeechSynthesisUtterance === 'function') {
        try {
          global.speechSynthesis.cancel();
          var utter = new global.SpeechSynthesisUtterance(item.text);
          utter.lang = 'zh-CN';
          utter.onend = function() {
            if (_playingVoiceIndex === index) {
              _playingVoiceIndex = -1;
              refreshVoicePlayUI();
            }
          };
          utter.onerror = function() {
            if (_playingVoiceIndex === index) {
              _playingVoiceIndex = -1;
              refreshVoicePlayUI();
            }
          };
          global.speechSynthesis.speak(utter);
          notify('正在使用浏览器语音朗读');
          return;
        } catch (_) {}
      }

      _playingVoiceIndex = -1;
      refreshVoicePlayUI();
      notify(item.text ? '当前浏览器不支持 speechSynthesis 朗读，可展开查看文字' : '暂无可播放音频');
    }

    function deleteMessageAt(index) {
      if (index < 0 || index >= _state.items.length) return;
      if (_playingVoiceIndex === index) {
        stopVoicePlayback();
      } else if (_playingVoiceIndex > index) {
        _playingVoiceIndex -= 1;
      }

      var nextExpanded = Object.create(null);
      Object.keys(_expandedVoices).forEach(function(key) {
        var idx = Number(key);
        if (idx < index) nextExpanded[idx] = _expandedVoices[key];
        else if (idx > index) nextExpanded[idx - 1] = _expandedVoices[key];
      });
      _expandedVoices = nextExpanded;

      var removed = _state.items.splice(index, 1)[0];
      if (_selectedIndex === index) _selectedIndex = -1;
      else if (_selectedIndex > index) _selectedIndex -= 1;

      saveState(_state);
      renderMessages(false);
      notify('已删除消息');

      // 删除某条消息时保护当前作品（含头像、背景与消息）与所有其他作品仍在引用的素材
      var api = assetsApi();
      var wApi = worksApi();
      var usedAsWorkAsset = _state && removed && (
        removed.assetId === _state.userAvatarAssetId ||
        removed.assetId === _state.charAvatarAssetId ||
        (_state.appearance && removed.assetId === _state.appearance.bgImageAssetId)
      );
      if (api && removed && removed.assetId && !removed.isSticker && !usedAsWorkAsset) {
        var usedLocally = api.isAssetReferenced(removed.assetId, _state.items);
        var usedElsewhere = wApi ? wApi.isAssetReferencedInOtherWorks(removed.assetId, _currentWorkId) : false;
        if (!usedLocally && !usedElsewhere) {
          api.getAsset(removed.assetId).then(function(record) {
            if (!record || record.kind === 'sticker') return;
            var stillWorkAsset = _state && (
              removed.assetId === _state.userAvatarAssetId ||
              removed.assetId === _state.charAvatarAssetId ||
              (_state.appearance && removed.assetId === _state.appearance.bgImageAssetId)
            );
            var stillLocal = api.isAssetReferenced(removed.assetId, _state.items);
            var stillOther = wApi ? wApi.isAssetReferencedInOtherWorks(removed.assetId, _currentWorkId) : false;
            if (!stillWorkAsset && !stillLocal && !stillOther) {
              return api.deleteAsset(removed.assetId);
            }
          }).catch(function() {});
        }
      }
    }

    function describeMessageForMenu(rawItem) {
      if (!rawItem) return { kind: 'unknown', label: '消息', preview: '', isRecalled: false, copyText: '' };
      var item = rawItem;
      var fromWithdraw = false;
      if (rawItem.type === 'withdraw' && rawItem.original) {
        item = Object.assign({}, rawItem.original, {
          side: rawItem.side || rawItem.original.side,
          fakeRecall: true
        });
        fromWithdraw = true;
      }
      if (item.type === 'text') {
        var txt = String(item.text || '');
        var shortTxt = txt.length > 18 ? (txt.slice(0, 18) + '…') : txt;
        var recalled = Boolean(item.fakeRecall || fromWithdraw);
        return {
          kind: 'text',
          label: recalled ? '假撤回消息' : '文字消息',
          preview: shortTxt || '(空内容)',
          isRecalled: recalled,
          copyText: txt
        };
      }
      if (item.type === 'image') {
        return {
          kind: 'image',
          label: item.isSticker ? '表情包' : '图片消息',
          preview: item.alt || (item.isSticker ? '表情包' : '本地图片'),
          isRecalled: false,
          copyText: ''
        };
      }
      if (item.type === 'voice') {
        return {
          kind: 'voice',
          label: '语音消息',
          preview: (item.duration || '8') + '″',
          isRecalled: false,
          copyText: ''
        };
      }
      if (item.type === 'transfer') {
        return {
          kind: 'transfer',
          label: '转账卡片',
          preview: (item.amount || '0') + (item.note ? (' · ' + item.note) : ''),
          isRecalled: false,
          copyText: ''
        };
      }
      if (item.type === 'call') {
        return {
          kind: 'call',
          label: item.video ? '视频通话' : '语音通话',
          preview: item.status || '已接通',
          isRecalled: false,
          copyText: ''
        };
      }
      if (item.type === 'date') {
        return {
          kind: 'date',
          label: '日期分隔',
          preview: item.text || '',
          isRecalled: false,
          copyText: ''
        };
      }
      if (item.type === 'withdraw') {
        return {
          kind: 'withdraw',
          label: '撤回提示',
          preview: '撤回记录',
          isRecalled: true,
          copyText: ''
        };
      }
      return {
        kind: item.type || 'other',
        label: '消息',
        preview: item.text || item.alt || '',
        isRecalled: false,
        copyText: ''
      };
    }

    function copyTextFallback(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (_) {
        ok = false;
      }
      document.body.removeChild(ta);
      return ok;
    }

    async function copyMessageText(text) {
      var str = String(text || '');
      if (!str) {
        notify('没有可复制的文字内容');
        return;
      }
      if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === 'function') {
        try {
          await global.navigator.clipboard.writeText(str);
          notify('已复制消息内容');
          return;
        } catch (_) {}
      }
      if (copyTextFallback(str)) {
        notify('已复制消息内容');
      } else {
        notify('当前环境不支持自动复制');
      }
    }

    function moveMessage(index, delta) {
      var items = Array.isArray(_state && _state.items) ? _state.items : [];
      var target = index + delta;
      if (index < 0 || index >= items.length || target < 0 || target >= items.length) return;

      var tmp = items[index];
      items[index] = items[target];
      items[target] = tmp;

      var expA = Boolean(_expandedVoices[index]);
      var expB = Boolean(_expandedVoices[target]);
      if (expB) _expandedVoices[index] = true;
      else delete _expandedVoices[index];
      if (expA) _expandedVoices[target] = true;
      else delete _expandedVoices[target];

      if (_playingVoiceIndex === index) _playingVoiceIndex = target;
      else if (_playingVoiceIndex === target) _playingVoiceIndex = index;

      if (_selectedIndex === index) _selectedIndex = target;
      else if (_selectedIndex === target) _selectedIndex = index;

      saveState(_state);
      renderMessages(false);
      notify(delta < 0 ? '已上移一条消息' : '已下移一条消息');
    }

    function confirmDeleteMessageSheet(index) {
      var items = Array.isArray(_state && _state.items) ? _state.items : [];
      if (index < 0 || index >= items.length) return;
      var meta = describeMessageForMenu(items[index]);

      openSheet('确认删除消息', function(body) {
        var desc = el('div', 'fc-chat-confirm-preview', meta.label + (meta.preview ? ('：' + meta.preview) : ''));
        var note = el('p', 'fc-chat-sheet-note', '删除后将从当前作品的聊天记录中移除，此操作无法撤销。');

        var actions = el('div', 'fc-chat-sheet-actions');
        var cancelBtn = el('button', 'fc-chat-btn alt', '取消');
        cancelBtn.type = 'button';
        cancelBtn.id = 'fc-chat-delete-cancel';
        cancelBtn.onclick = closeSheet;

        var confirmBtn = el('button', 'fc-chat-btn danger', '确认删除');
        confirmBtn.type = 'button';
        confirmBtn.id = 'fc-chat-delete-confirm';
        confirmBtn.onclick = function() {
          closeSheet();
          deleteMessageAt(index);
        };

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        body.appendChild(desc);
        body.appendChild(note);
        body.appendChild(actions);
      });
    }

    function openImageSendSheet() {
      var chosenSide = _sendSide;
      var pickedFile = null;
      var pickedDataUrl = '';

      openSheet('发送本地图片', function(body) {
        var sideLabel = el('label', '', '发送身份');
        var sideSelect = buildSideSelect('fc-chat-image-side');
        sideSelect.value = chosenSide;

        var fileLabel = el('label', '', '选择本地图片');
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.id = 'fc-chat-image-file';

        var previewWrap = el('div', 'fc-chat-sheet-preview');
        previewWrap.hidden = true;
        var previewImg = document.createElement('img');
        previewImg.alt = '图片预览';
        previewWrap.appendChild(previewImg);

        fileInput.addEventListener('change', async function() {
          var file = fileInput.files && fileInput.files[0];
          if (!file) {
            pickedFile = null;
            pickedDataUrl = '';
            previewWrap.hidden = true;
            return;
          }
          var api = assetsApi();
          if (!api) return;
          try {
            pickedDataUrl = await api.readImageFile(file, 8);
            pickedFile = file;
            previewImg.src = pickedDataUrl;
            previewWrap.hidden = false;
          } catch (err) {
            pickedFile = null;
            pickedDataUrl = '';
            fileInput.value = '';
            previewWrap.hidden = true;
            notify(err && err.message ? err.message : '图片读取失败');
          }
        });

        var note = el('p', 'fc-chat-sheet-note', '本地图片将保存在浏览器 IndexedDB 中，刷新后仍可查看。');

        var actions = el('div', 'fc-chat-sheet-actions');
        var cancelBtn = el('button', 'fc-chat-btn alt', '取消');
        cancelBtn.type = 'button';
        cancelBtn.onclick = closeSheet;

        var submitBtn = el('button', 'fc-chat-btn', '发送图片');
        submitBtn.type = 'button';
        submitBtn.id = 'fc-chat-image-submit';
        submitBtn.onclick = async function() {
          if (!pickedDataUrl) {
            notify('请先选择一张本地图片');
            return;
          }
          var api = assetsApi();
          if (!api) {
            notify('本地素材存储模块不可用');
            return;
          }
          submitBtn.disabled = true;
          try {
            var asset = await api.putAsset({
              id: api.uid('img_'),
              name: (pickedFile && pickedFile.name) || '聊天图片',
              src: pickedDataUrl,
              kind: 'image'
            });
            _state.items.push({
              type: 'image',
              side: sideSelect.value === 'left' ? 'left' : 'right',
              assetId: asset.id,
              alt: asset.name
            });
            saveState(_state);
            closeSheet();
            setPanelMode('');
            renderMessages(true);
          } catch (err) {
            notify(err && err.message ? err.message : '图片发送失败');
          } finally {
            submitBtn.disabled = false;
          }
        };

        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);
        body.appendChild(sideLabel);
        body.appendChild(sideSelect);
        body.appendChild(fileLabel);
        body.appendChild(fileInput);
        body.appendChild(previewWrap);
        body.appendChild(note);
        body.appendChild(actions);
      });
    }

    function openDateSheet() {
      openSheet('插入日期分隔', function(body) {
        var dtLabel = el('label', '', '选择日期与时间');
        var dtRow = el('div', 'fc-chat-datetime-row');

        var dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.id = 'fc-chat-date-input';
        dateInput.value = todayDateString();

        var timeInput = document.createElement('input');
        timeInput.type = 'time';
        timeInput.id = 'fc-chat-time-input';
        timeInput.value = nowTimeString();

        dtRow.appendChild(dateInput);
        dtRow.appendChild(timeInput);

        var textLabel = el('label', '', '显示文字（可微调）');
        var textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.id = 'fc-chat-date-text';
        textInput.value = formatDateAndTime(dateInput.value, timeInput.value);

        function syncDateText() {
          textInput.value = formatDateAndTime(dateInput.value, timeInput.value);
        }
        dateInput.addEventListener('change', syncDateText);
        timeInput.addEventListener('change', syncDateText);

        var actions = el('div', 'fc-chat-sheet-actions');
        var cancelBtn = el('button', 'fc-chat-btn alt', '取消');
        cancelBtn.type = 'button';
        cancelBtn.onclick = closeSheet;

        var insertBtn = el('button', 'fc-chat-btn', '插入日期');
        insertBtn.type = 'button';
        insertBtn.id = 'fc-chat-date-submit';
        insertBtn.onclick = function() {
          var val = textInput.value.trim();
          if (!val) {
            notify('请输入日期文字');
            return;
          }
          _state.items.push({ type: 'date', text: val });
          saveState(_state);
          closeSheet();
          setPanelMode('');
          renderMessages(true);
        };

        actions.appendChild(cancelBtn);
        actions.appendChild(insertBtn);
        body.appendChild(dtLabel);
        body.appendChild(dtRow);
        body.appendChild(textLabel);
        body.appendChild(textInput);
        body.appendChild(actions);
      });
    }

    function buildSideSelect(id) {
      var sideSelect = document.createElement('select');
      sideSelect.id = id;
      [
        ['right', currentUserName() + ' · User（右侧）'],
        ['left', currentCharName() + ' · Char（左侧）']
      ].forEach(function(pair) {
        var opt = document.createElement('option');
        opt.value = pair[0];
        opt.textContent = pair[1];
        sideSelect.appendChild(opt);
      });
      sideSelect.value = _sendSide;
      return sideSelect;
    }

    function openTransferSheet() {
      openSheet('发送模拟转账', function(body) {
        var sideLabel = el('label', '', '发送身份');
        var sideSelect = buildSideSelect('fc-chat-transfer-side');

        var amountLabel = el('label', '', '转账金额');
        var amountInput = document.createElement('input');
        amountInput.type = 'text';
        amountInput.id = 'fc-chat-transfer-amount';
        amountInput.value = '520';
        amountInput.placeholder = '输入金额，例如 520';

        var noteLabel = el('label', '', '转账备注');
        var noteInput = document.createElement('input');
        noteInput.type = 'text';
        noteInput.id = 'fc-chat-transfer-note';
        noteInput.value = '转账';
        noteInput.placeholder = '例如：奶茶钱、精神疏导费';

        var statusLabel = el('label', '', '初始领取状态');
        var statusSelect = document.createElement('select');
        statusSelect.id = 'fc-chat-transfer-status';
        [
          ['unclaimed', '未领取'],
          ['claimed', '已领取']
        ].forEach(function(pair) {
          var opt = document.createElement('option');
          opt.value = pair[0];
          opt.textContent = pair[1];
          statusSelect.appendChild(opt);
        });
        statusSelect.value = 'unclaimed';

        var note = el('p', 'fc-chat-sheet-note', '仅用于虚构聊天展示，不涉及真实支付；发送后点击转账卡片即可切换已领取 / 未领取状态。');

        var actions = el('div', 'fc-chat-sheet-actions');
        var cancelBtn = el('button', 'fc-chat-btn alt', '取消');
        cancelBtn.type = 'button';
        cancelBtn.onclick = closeSheet;

        var submitBtn = el('button', 'fc-chat-btn', '发送转账');
        submitBtn.type = 'button';
        submitBtn.id = 'fc-chat-transfer-submit';
        submitBtn.onclick = function() {
          var amt = amountInput.value.trim();
          if (!amt) {
            notify('请输入转账金额');
            return;
          }
          _state.items.push({
            type: 'transfer',
            side: sideSelect.value === 'left' ? 'left' : 'right',
            amount: amt,
            note: noteInput.value.trim() || '转账',
            status: statusSelect.value === 'claimed' ? 'claimed' : 'unclaimed'
          });
          saveState(_state);
          closeSheet();
          setPanelMode('');
          renderMessages(true);
        };

        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);
        body.appendChild(sideLabel);
        body.appendChild(sideSelect);
        body.appendChild(amountLabel);
        body.appendChild(amountInput);
        body.appendChild(noteLabel);
        body.appendChild(noteInput);
        body.appendChild(statusLabel);
        body.appendChild(statusSelect);
        body.appendChild(note);
        body.appendChild(actions);
      });
    }

    function openVoiceSheet() {
      var pickedFile = null;
      var pickedAudioData = '';
      var userEditedDuration = false;

      openSheet('发送语音消息', function(body) {
        var sideLabel = el('label', '', '发送身份');
        var sideSelect = buildSideSelect('fc-chat-voice-side');

        var modeLabel = el('label', '', '播放方式');
        var modeSelect = document.createElement('select');
        modeSelect.id = 'fc-chat-voice-mode';
        [
          ['tts', '浏览器朗读语音文字（speechSynthesis）'],
          ['audio', '导入本地音频文件（IndexedDB 持久保存）']
        ].forEach(function(pair) {
          var opt = document.createElement('option');
          opt.value = pair[0];
          opt.textContent = pair[1];
          modeSelect.appendChild(opt);
        });
        modeSelect.value = 'tts';

        var textLabel = el('label', '', '语音文字内容');
        var textInput = document.createElement('textarea');
        textInput.id = 'fc-chat-voice-text';
        textInput.placeholder = '输入语音对应的文字内容（用于朗读及在聊天气泡下方展开查看）';

        var fileWrap = document.createElement('div');
        fileWrap.id = 'fc-chat-voice-file-wrap';
        fileWrap.hidden = true;
        var fileLabel = el('label', '', '选择本地音频文件');
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'audio/*';
        fileInput.id = 'fc-chat-voice-file';
        var fileStatus = el('p', 'fc-chat-sheet-note', '支持 mp3 / wav / m4a / ogg 等音频格式（不超过 12MB），保存在浏览器 IndexedDB 中。');
        fileWrap.appendChild(fileLabel);
        fileWrap.appendChild(fileInput);
        fileWrap.appendChild(fileStatus);

        var durLabel = el('label', '', '语音时长（秒）');
        var durInput = document.createElement('input');
        durInput.type = 'text';
        durInput.id = 'fc-chat-voice-duration';
        durInput.value = '8';
        durInput.placeholder = '例如 8';
        durInput.addEventListener('input', function() {
          userEditedDuration = true;
        });

        function syncModeUi() {
          fileWrap.hidden = modeSelect.value !== 'audio';
        }
        modeSelect.addEventListener('change', syncModeUi);

        fileInput.addEventListener('change', async function() {
          var file = fileInput.files && fileInput.files[0];
          if (!file) {
            pickedFile = null;
            pickedAudioData = '';
            return;
          }
          var api = assetsApi();
          if (!api) return;
          try {
            pickedAudioData = await api.readAudioFile(file, 12);
            pickedFile = file;
            fileStatus.textContent = '已选择音频：' + file.name;
            if (!userEditedDuration && typeof global.URL === 'function' && global.URL.createObjectURL) {
              var objUrl = global.URL.createObjectURL(file);
              var probe = new Audio(objUrl);
              probe.addEventListener('loadedmetadata', function() {
                if (isFinite(probe.duration) && probe.duration > 0 && !userEditedDuration) {
                  durInput.value = String(Math.max(1, Math.round(probe.duration)));
                }
                global.URL.revokeObjectURL(objUrl);
              }, { once: true });
              probe.addEventListener('error', function() {
                global.URL.revokeObjectURL(objUrl);
              }, { once: true });
            }
          } catch (err) {
            pickedFile = null;
            pickedAudioData = '';
            fileInput.value = '';
            notify(err && err.message ? err.message : '音频读取失败');
          }
        });

        var actions = el('div', 'fc-chat-sheet-actions');
        var cancelBtn = el('button', 'fc-chat-btn alt', '取消');
        cancelBtn.type = 'button';
        cancelBtn.onclick = closeSheet;

        var submitBtn = el('button', 'fc-chat-btn', '发送语音');
        submitBtn.type = 'button';
        submitBtn.id = 'fc-chat-voice-submit';
        submitBtn.onclick = async function() {
          var mode = modeSelect.value === 'audio' ? 'audio' : 'tts';
          var transcript = textInput.value.trim();
          var durVal = durInput.value.trim().replace(/[^\d]/g, '') || '8';

          if (mode === 'tts' && !transcript) {
            notify('请输入语音文字内容');
            return;
          }
          if (mode === 'audio' && !pickedAudioData) {
            notify('请先选择一个本地音频文件');
            return;
          }

          var msg = {
            type: 'voice',
            side: sideSelect.value === 'left' ? 'left' : 'right',
            mode: mode,
            text: transcript,
            duration: durVal
          };

          if (mode === 'audio') {
            var api = assetsApi();
            if (!api) {
              notify('本地素材存储模块不可用');
              return;
            }
            submitBtn.disabled = true;
            try {
              var asset = await api.putAsset({
                id: api.uid('aud_'),
                name: (pickedFile && pickedFile.name) || '语音消息',
                src: pickedAudioData,
                kind: 'audio'
              });
              msg.assetId = asset.id;
            } catch (err) {
              submitBtn.disabled = false;
              notify(err && err.message ? err.message : '音频保存失败');
              return;
            }
            submitBtn.disabled = false;
          }

          _state.items.push(msg);
          saveState(_state);
          closeSheet();
          setPanelMode('');
          renderMessages(true);
        };

        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);
        body.appendChild(sideLabel);
        body.appendChild(sideSelect);
        body.appendChild(modeLabel);
        body.appendChild(modeSelect);
        body.appendChild(textLabel);
        body.appendChild(textInput);
        body.appendChild(fileWrap);
        body.appendChild(durLabel);
        body.appendChild(durInput);
        body.appendChild(actions);
      });
    }

    function openCallSheet(isVideo) {
      var labelTitle = isVideo ? '视频通话' : '语音通话';
      var touchedDuration = false;

      openSheet('发送' + labelTitle + '卡片', function(body) {
        var sideLabel = el('label', '', '发起身份');
        var sideSelect = buildSideSelect('fc-chat-call-side');

        var statusLabel = el('label', '', '通话状态');
        var statusSelect = document.createElement('select');
        statusSelect.id = 'fc-chat-call-status';
        [
          ['已接通', '已接通'],
          ['未接听', '未接听'],
          ['已取消', '已取消'],
          ['已结束', '已结束']
        ].forEach(function(pair) {
          var opt = document.createElement('option');
          opt.value = pair[0];
          opt.textContent = pair[1];
          statusSelect.appendChild(opt);
        });
        statusSelect.value = '已接通';

        var durLabel = el('label', '', '通话时长（未接听或已取消可留空）');
        var durInput = document.createElement('input');
        durInput.type = 'text';
        durInput.id = 'fc-chat-call-duration';
        durInput.value = '02:36';
        durInput.placeholder = '例如 02:36';
        durInput.addEventListener('input', function() {
          touchedDuration = true;
        });

        statusSelect.addEventListener('change', function() {
          if (touchedDuration) return;
          if (statusSelect.value === '未接听' || statusSelect.value === '已取消') {
            durInput.value = '';
          } else if (!durInput.value) {
            durInput.value = '02:36';
          }
        });

        var note = el('p', 'fc-chat-sheet-note', isVideo
          ? '仅生成模拟视频通话记录卡片，不会调用摄像头或发起真实视频通话。'
          : '仅生成模拟语音通话记录卡片，不会进行真实拨号或网络通话。');

        var actions = el('div', 'fc-chat-sheet-actions');
        var cancelBtn = el('button', 'fc-chat-btn alt', '取消');
        cancelBtn.type = 'button';
        cancelBtn.onclick = closeSheet;

        var submitBtn = el('button', 'fc-chat-btn', '添加到聊天');
        submitBtn.type = 'button';
        submitBtn.id = 'fc-chat-call-submit';
        submitBtn.onclick = function() {
          var statusVal = statusSelect.value || '已接通';
          var durVal = durInput.value.trim();
          _state.items.push({
            type: 'call',
            side: sideSelect.value === 'left' ? 'left' : 'right',
            video: Boolean(isVideo),
            status: statusVal,
            duration: durVal
          });
          saveState(_state);
          closeSheet();
          setPanelMode('');
          renderMessages(true);
        };

        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);
        body.appendChild(sideLabel);
        body.appendChild(sideSelect);
        body.appendChild(statusLabel);
        body.appendChild(statusSelect);
        body.appendChild(durLabel);
        body.appendChild(durInput);
        body.appendChild(note);
        body.appendChild(actions);
      });
    }

    function renderMorePanel() {
      panelEl.replaceChildren();
      var grid = el('div', 'fc-chat-grid');
      var entries = [
        ['▧', '图片', openImageSendSheet],
        ['♡', '表情包', function() { setPanelMode('emoji'); }],
        ['♫', '语音消息', openVoiceSheet],
        ['¥', '转账', openTransferSheet],
        ['☎', '语音通话', function() { openCallSheet(false); }],
        ['▤', '视频通话', function() { openCallSheet(true); }],
        ['▦', '插入日期', openDateSheet],
        ['✎', '创作工具', function() {
          _state.showTools = !_state.showTools;
          toolsToggleBtn.classList.toggle('active', Boolean(_state.showTools));
          saveState(_state);
          renderMessages(false);
          notify(_state.showTools ? '已展开每条消息创作工具' : '已收起常驻工具，点击气泡仍可操作');
        }]
      ];

      entries.forEach(function(item) {
        var btn = el('button', 'fc-chat-tool');
        btn.type = 'button';
        btn.dataset.fcTool = item[1];
        btn.appendChild(el('span', 'fc-chat-tool-icon', item[0]));
        btn.appendChild(el('span', '', item[1]));
        btn.onclick = item[2];
        grid.appendChild(btn);
      });

      panelEl.appendChild(grid);
    }

    function bindStickerPickerTrigger(labelEl) {
      labelEl.setAttribute('for', stickerBatchInput.id);
      labelEl.setAttribute('role', 'button');
      labelEl.tabIndex = 0;
      labelEl.addEventListener('click', function(e) {
        if (_importingStickers) {
          e.preventDefault();
          notify('正在导入表情包，请稍候…');
        }
      });
      labelEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (_importingStickers) {
            notify('正在导入表情包，请稍候…');
            return;
          }
          stickerBatchInput.value = '';
          stickerBatchInput.click();
        }
      });
    }

    function formatDiagBytes(bytes) {
      var n = Number(bytes || 0);
      if (!n) return '0 B';
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function openStickerDiagnosticSheet() {
      var api = assetsApi();
      openSheet('表情包导入诊断（仅本地查看）', function(body) {
        if (!api || typeof api.getDiagnostics !== 'function') {
          body.appendChild(el('p', 'fc-chat-sheet-note', '本地素材模块未提供诊断信息。'));
          var fallbackAct = el('div', 'fc-chat-sheet-actions');
          var closeOnly = el('button', 'fc-chat-btn', '关闭');
          closeOnly.type = 'button';
          closeOnly.onclick = closeSheet;
          fallbackAct.appendChild(closeOnly);
          body.appendChild(fallbackAct);
          return;
        }

        var snapshot = api.getDiagnostics();
        var env = snapshot.env || {};
        var entries = snapshot.entries || [];

        var list = el('div', 'fc-diag-list');
        list.id = 'fc-sticker-diag-list';

        var envCard = el('div', 'fc-diag-card');
        var envHead = el('div', 'fc-diag-head');
        envHead.appendChild(el('span', '', '设备与浏览器支持'));
        envHead.appendChild(el('span', 'fc-diag-badge', env.indexedDB ? 'IDB 可用' : 'IDB 不可用'));
        envCard.appendChild(envHead);
        envCard.appendChild(el('div', 'fc-diag-line', '系统/内核：' + (env.platform || '未知') + ' · ' + (env.userAgent || '未知')));
        envCard.appendChild(el('div', 'fc-diag-line',
          '能力：FileReader=' + (env.fileReader ? '是' : '否') +
          ' / ObjectURL=' + (env.objectURL ? '是' : '否') +
          ' / ImageBitmap=' + (env.imageBitmap ? '是' : '否') +
          ' / Canvas=' + (env.canvas2d ? '是' : '否') +
          ' / WebP编码=' + (env.webpEncode ? '是' : '否')
        ));
        list.appendChild(envCard);

        if (!entries.length) {
          list.appendChild(el('p', 'fc-chat-sheet-note', '暂无导入或读取记录，请先尝试选择图片导入表情包。'));
        } else {
          entries.forEach(function(item) {
            var hasError = Boolean(item.failedStage || item.errorMessage);
            var card = el('div', 'fc-diag-card' + (hasError ? ' is-error' : ''));
            var head = el('div', 'fc-diag-head');
            head.appendChild(el('span', '', (item.fileName || item.action || '记录') + (item.ext ? ' (.' + item.ext + ')' : '')));
            var badgeText = hasError ? ('失败: ' + (item.failedStage || 'error')) : '通过';
            head.appendChild(el('span', 'fc-diag-badge' + (hasError ? ' fail' : ''), badgeText));
            card.appendChild(head);

            if (item.action === 'stickerImport' || item.action === 'imageImport' || item.fileName) {
              card.appendChild(el('div', 'fc-diag-line',
                '原始：type=' + (item.rawFileType || '(空)') +
                ' · 魔数=' + (item.magicMime || '(未识别)') +
                ' · 判定=' + (item.effectiveMime || '(未知)') +
                ' · 大小=' + formatDiagBytes(item.sizeBytes)
              ));
              card.appendChild(el('div', 'fc-diag-line',
                '阶段：读取=' + (item.readOk ? '成功' : '未完成') +
                ' / 解码=' + (item.decodeOk ? ('成功(' + (item.decodePath || '') + (item.dimensions ? ' ' + item.dimensions : '') + ')') : '失败') +
                ' / 保存IDB=' + (item.saveOk === null ? '未执行' : (item.saveOk ? '成功' : '失败'))
              ));
              if (item.outputMime || item.notes) {
                card.appendChild(el('div', 'fc-diag-line',
                  '输出：' + (item.outputMime || '-') +
                  (item.outputBytes ? (' · 约' + formatDiagBytes(item.outputBytes)) : '') +
                  (item.notes ? (' · ' + item.notes) : '')
                ));
              }
            } else if (item.notes) {
              card.appendChild(el('div', 'fc-diag-line', item.notes));
            }
            if (hasError) {
              card.appendChild(el('div', 'fc-diag-line',
                '错误：[' + (item.errorName || 'Error') + '] ' + (item.errorMessage || '未知错误')
              ));
            }
            list.appendChild(card);
          });
        }

        var note = el('p', 'fc-chat-sheet-note', '诊断信息仅缓存在本地内存，不上传服务器，也不包含图片内容或 base64 数据。');
        var actions = el('div', 'fc-chat-sheet-actions');

        var clearBtn = el('button', 'fc-chat-btn alt', '清空');
        clearBtn.type = 'button';
        clearBtn.onclick = function() {
          api.clearDiagnostics();
          openStickerDiagnosticSheet();
        };

        var copyBtn = el('button', 'fc-chat-btn alt', '复制诊断');
        copyBtn.type = 'button';
        copyBtn.id = 'fc-sticker-diag-copy';
        copyBtn.onclick = function() {
          var lines = [
            '[Env] platform=' + (env.platform || '') + ', ua=' + (env.userAgent || ''),
            '[Caps] idb=' + env.indexedDB + ', fr=' + env.fileReader + ', objUrl=' + env.objectURL + ', bmp=' + env.imageBitmap + ', canvas=' + env.canvas2d + ', webpEnc=' + env.webpEncode
          ];
          entries.forEach(function(it, idx) {
            lines.push(
              '#' + (idx + 1) + ' ' + (it.fileName || it.action) +
              ' | rawType=' + (it.rawFileType || 'empty') +
              ' | magic=' + (it.magicMime || 'none') +
              ' | eff=' + (it.effectiveMime || 'none') +
              ' | size=' + it.sizeBytes +
              ' | read=' + it.readOk +
              ' | decode=' + it.decodeOk + '(' + (it.decodePath || '-') + ' ' + (it.dimensions || '') + ')' +
              ' | save=' + it.saveOk +
              (it.failedStage ? (' | failStage=' + it.failedStage + ' | err=' + it.errorName + ': ' + it.errorMessage) : '') +
              (it.notes ? (' | notes=' + it.notes) : '')
            );
          });
          copyMessageText(lines.join('\n'));
        };

        var closeBtn = el('button', 'fc-chat-btn', '关闭');
        closeBtn.type = 'button';
        closeBtn.onclick = closeSheet;

        actions.appendChild(clearBtn);
        actions.appendChild(copyBtn);
        actions.appendChild(closeBtn);
        body.appendChild(list);
        body.appendChild(note);
        body.appendChild(actions);
      });
    }

    async function renderStickerPanel() {
      var renderSeq = ++_stickerRenderSeq;
      panelEl.replaceChildren();

      var headRow = el('div', 'fc-chat-panel-head');
      headRow.appendChild(el('span', 'fc-chat-panel-title', '我的表情包'));

      var headRight = el('div', 'fc-chat-panel-actions');
      var diagBtn = el('button', 'fc-chat-panel-action subtle', '诊断');
      diagBtn.type = 'button';
      diagBtn.id = 'fc-chat-sticker-diag-btn';
      diagBtn.title = '查看表情包本地导入与解码诊断信息';
      diagBtn.onclick = openStickerDiagnosticSheet;

      var importBtn = document.createElement('label');
      importBtn.className = 'fc-chat-panel-action' + (_importingStickers ? ' is-busy' : '');
      importBtn.id = 'fc-chat-sticker-import-btn';
      importBtn.textContent = _importingStickers ? '导入中…' : '＋ 批量导入';
      bindStickerPickerTrigger(importBtn);

      headRight.appendChild(diagBtn);
      headRight.appendChild(importBtn);
      headRow.appendChild(headRight);
      panelEl.appendChild(headRow);

      var grid = el('div', 'fc-chat-stickers');
      grid.appendChild(el('p', 'fc-chat-empty', '正在读取表情包…'));
      panelEl.appendChild(grid);

      var api = assetsApi();
      if (!api) {
        grid.replaceChildren();
        var missingErr = el('div', 'fc-chat-sticker-error');
        missingErr.appendChild(el('span', '', '表情包存储模块不可用，请刷新页面后重试'));
        grid.appendChild(missingErr);
        notify('表情包存储模块不可用');
        return;
      }

      var stickers = [];
      try {
        stickers = await api.listAssets('sticker');
      } catch (err) {
        if (typeof api.recordDiagnostic === 'function') {
          api.recordDiagnostic({
            action: 'listStickers',
            readOk: false,
            decodeOk: false,
            saveOk: null,
            failedStage: 'indexeddb_list',
            errorName: (err && (err.code || err.name)) || 'IndexedDBError',
            errorMessage: (err && err.message) ? err.message : '读取表情包库失败'
          });
        }
        if (renderSeq !== _stickerRenderSeq || _panelMode !== 'emoji' || !document.body.contains(app)) return;
        var errMsg = (err && err.message) ? err.message : '读取表情包库失败';
        grid.replaceChildren();
        var errBox = el('div', 'fc-chat-sticker-error');
        errBox.appendChild(el('span', '', '读取表情包失败：' + errMsg));
        var retryBtn = el('button', 'fc-chat-panel-action', '重试读取');
        retryBtn.type = 'button';
        retryBtn.onclick = function() {
          renderStickerPanel();
        };
        errBox.appendChild(retryBtn);
        grid.appendChild(errBox);
        notify('读取表情包失败：' + errMsg);
        return;
      }

      if (renderSeq !== _stickerRenderSeq || _panelMode !== 'emoji' || !document.body.contains(app)) return;
      grid.replaceChildren();

      if (!stickers.length) {
        grid.appendChild(el('p', 'fc-chat-empty', '还没有表情包，点击右上角或下方 ＋ 从本地批量导入'));
      }

      stickers.forEach(function(sticker) {
        if (!sticker || !sticker.id) return;
        var tile = el('div', 'fc-chat-sticker');
        tile.dataset.stickerId = sticker.id;

        var sendTileBtn = el('button', 'fc-chat-sticker-btn');
        sendTileBtn.type = 'button';
        sendTileBtn.setAttribute('aria-label', '发送表情包 ' + (sticker.name || '表情包'));

        if (sticker.src) {
          var img = document.createElement('img');
          img.src = sticker.src;
          img.alt = sticker.name || '表情包';
          img.onerror = function() {
            img.replaceWith(el('div', 'fc-chat-sticker-fallback', '无法显示'));
          };
          sendTileBtn.appendChild(img);
        } else {
          sendTileBtn.appendChild(el('div', 'fc-chat-sticker-fallback', '无图片'));
        }
        sendTileBtn.appendChild(el('span', '', sticker.name || '表情包'));

        sendTileBtn.onclick = function() {
          if (!Array.isArray(_state.items)) _state.items = [];
          _state.items.push({
            type: 'image',
            isSticker: true,
            side: _sendSide,
            assetId: sticker.id,
            alt: sticker.name || '表情包'
          });
          saveState(_state);
          setPanelMode('');
          renderMessages(true);
        };

        var delBtn = el('button', 'fc-chat-sticker-del', '×');
        delBtn.type = 'button';
        delBtn.title = '从表情包库移除';
        delBtn.setAttribute('aria-label', '从表情包库移除 ' + (sticker.name || '表情包'));
        delBtn.onclick = async function(e) {
          e.stopPropagation();
          try {
            var wApi = worksApi();
            var allItems = wApi ? wApi.getAllReferencedItems() : (_state.items || []);
            await api.removeStickerSafely(sticker.id, allItems);
            notify('已从表情包库移除');
            if (_panelMode === 'emoji') {
              renderStickerPanel();
            }
          } catch (err) {
            notify('删除表情包失败：' + ((err && err.message) || '未知错误'));
          }
        };

        tile.appendChild(sendTileBtn);
        tile.appendChild(delBtn);
        grid.appendChild(tile);
      });

      var plusTile = document.createElement('label');
      plusTile.className = 'fc-chat-addsticker' + (_importingStickers ? ' is-busy' : '');
      plusTile.textContent = '＋';
      plusTile.title = '批量导入本地表情包';
      plusTile.setAttribute('aria-label', '批量导入本地表情包');
      bindStickerPickerTrigger(plusTile);
      grid.appendChild(plusTile);
    }

    stickerBatchInput.addEventListener('change', async function() {
      var files = Array.prototype.slice.call(stickerBatchInput.files || []);
      if (!files.length) return;
      var api = assetsApi();
      if (!api) {
        stickerBatchInput.value = '';
        notify('表情包存储模块不可用，无法导入');
        return;
      }
      if (_importingStickers) {
        notify('正在导入表情包，请稍候…');
        return;
      }

      _importingStickers = true;
      var importBtnNode = document.getElementById('fc-chat-sticker-import-btn');
      if (importBtnNode) {
        importBtnNode.classList.add('is-busy');
        importBtnNode.textContent = '导入中…';
      }

      var added = 0;
      var failed = 0;
      var lastErrorMsg = '';
      try {
        for (var i = 0; i < files.length; i++) {
          var latestDiag = null;
          try {
            var dataUrl = await api.readImageFile(files[i], 15, {
              purpose: 'sticker',
              maxDimension: 960,
              action: 'stickerImport',
              onDiagnostic: function(entry) {
                latestDiag = entry;
              }
            });
            try {
              var savedAsset = await api.putAsset({
                id: api.uid('stk_'),
                name: files[i].name || '表情包',
                src: dataUrl,
                kind: 'sticker'
              });
              if (typeof api.updateDiagnosticSaveStatus === 'function') {
                api.updateDiagnosticSaveStatus(latestDiag, true, savedAsset && savedAsset.id);
              }
              added += 1;
            } catch (dbErr) {
              if (typeof api.updateDiagnosticSaveStatus === 'function') {
                api.updateDiagnosticSaveStatus(latestDiag, false, '', dbErr);
              }
              throw dbErr;
            }
          } catch (err) {
            failed += 1;
            if (err && err.message) {
              lastErrorMsg = err.message;
            }
          }
        }
      } finally {
        _importingStickers = false;
        stickerBatchInput.value = '';
      }

      if (_panelMode === 'emoji') {
        renderStickerPanel();
      }

      if (added > 0 && failed === 0) {
        notify('已批量导入 ' + added + ' 个表情包');
      } else if (added > 0) {
        notify('已导入 ' + added + ' 个表情包（' + failed + ' 个失败' + (lastErrorMsg ? '：' + lastErrorMsg : '') + '）');
      } else {
        notify(lastErrorMsg ? ('导入失败：' + lastErrorMsg) : '导入失败，请确认选择的是支持的图片文件');
      }
    });

    function buildInlineControls(index, item) {
      var controls = el('div', 'fc-chat-controls');
      if (item.type === 'text') {
        var recallBtn = el('button', 'fc-chat-mini-btn', item.fakeRecall ? '恢复显示' : '假撤回');
        recallBtn.type = 'button';
        recallBtn.onclick = function(e) {
          e.stopPropagation();
          toggleFakeRecall(index);
        };
        var rewriteBtn = el('button', 'fc-chat-mini-btn', '改写');
        rewriteBtn.type = 'button';
        rewriteBtn.onclick = function(e) {
          e.stopPropagation();
          openRewriteSheet(index);
        };
        controls.appendChild(recallBtn);
        controls.appendChild(rewriteBtn);
      } else if (item.type === 'transfer') {
        var claimed = isTransferClaimed(item);
        var claimBtn = el('button', 'fc-chat-mini-btn', claimed ? '设为未领取' : '设为已领取');
        claimBtn.type = 'button';
        claimBtn.onclick = function(e) {
          e.stopPropagation();
          toggleTransferStatus(index);
        };
        controls.appendChild(claimBtn);
      }

      var delBtn = el('button', 'fc-chat-mini-btn del', '删除');
      delBtn.type = 'button';
      delBtn.onclick = function(e) {
        e.stopPropagation();
        deleteMessageAt(index);
      };
      controls.appendChild(delBtn);
      return controls;
    }

    function attachAvatarImg(avatarEl, src, altText) {
      if (!avatarEl || !src) return;
      avatarEl.replaceChildren();
      var img = document.createElement('img');
      img.src = src;
      img.alt = altText || '头像';
      img.onerror = function() {
        avatarEl.replaceChildren();
        avatarEl.classList.remove('has-img');
      };
      avatarEl.classList.add('has-img');
      avatarEl.appendChild(img);
    }

    function resolveMissingAssets(pendingImgs, seq) {
      if (!pendingImgs.length) return;
      var api = assetsApi();
      if (!api) return;

      pendingImgs.forEach(function(entry) {
        api.getAsset(entry.assetId).then(function(record) {
          if (seq !== _activeResolveSeq) return;
          if (entry.kind === 'avatar') {
            if (record && record.src) {
              attachAvatarImg(entry.avatarEl, record.src, entry.alt);
            }
            return;
          }
          if (!record || !record.src) {
            entry.holder.replaceWith(el('div', 'fc-chat-image-placeholder', entry.alt || '图片素材不可用'));
            return;
          }
          var img = document.createElement('img');
          img.src = record.src;
          img.alt = entry.alt || '聊天图片';
          img.onerror = function() {
            img.replaceWith(el('div', 'fc-chat-image-placeholder', '图片无法显示'));
          };
          img.onclick = function(e) {
            e.stopPropagation();
            openLightbox(record.src, entry.alt);
          };
          entry.holder.replaceWith(img);
        }).catch(function() {
          if (seq !== _activeResolveSeq) return;
          if (entry.kind === 'avatar') return;
          entry.holder.replaceWith(el('div', 'fc-chat-image-placeholder', '图片加载失败'));
        });
      });
    }

    function renderMessages(scrollToBottom) {
      var oldTop = streamEl.scrollTop;
      streamEl.replaceChildren();
      var pendingAssets = [];
      var resolveSeq = ++_activeResolveSeq;
      var api = assetsApi();
      var userDisplayName = currentUserName();
      var charDisplayName = currentCharName();
      var userAvatarAssetId = (_state && _state.userAvatarAssetId) || '';
      var charAvatarAssetId = (_state && _state.charAvatarAssetId) || '';

      var items = Array.isArray(_state.items) ? _state.items : [];
      if (!items.length) {
        var emptyBox = el('div', 'fc-chat-stream-empty');
        emptyBox.appendChild(el('strong', '', '还没有聊天内容'));
        emptyBox.appendChild(el('span', '', '可以在下方输入文字，或点击 ⊕ 更多工具添加图片、转账、语音与通话卡片'));
        streamEl.appendChild(emptyBox);
      }

      items.forEach(function(rawItem, index) {
        var item = rawItem;
        if (!item) return;

        // 兼容旧版 withdraw + original 格式
        if (item.type === 'withdraw' && item.original) {
          item = Object.assign({}, item.original, {
            side: item.side || item.original.side,
            fakeRecall: true
          });
        }

        if (item.type === 'withdraw') {
          var recallRow = el('div', 'fc-chat-recall-row');
          recallRow.dataset.msgIndex = String(index);
          recallRow.dataset.msgKind = 'withdraw';
          var noticeText = item.side === 'right' ? '你撤回了一条消息' : (charDisplayName + '撤回了一条消息');
          recallRow.appendChild(el('div', 'fc-chat-recall-notice', noticeText));
          streamEl.appendChild(recallRow);
          return;
        }

        if (item.type === 'date') {
          var dateRow = el('div', 'fc-chat-date');
          dateRow.dataset.msgIndex = String(index);
          dateRow.dataset.msgKind = 'date';
          dateRow.appendChild(el('span', '', item.text || ''));
          if (_state.showTools) {
            var dateTools = el('div', 'fc-chat-controls');
            dateTools.style.justifyContent = 'center';
            var delDateBtn = el('button', 'fc-chat-mini-btn del', '删除日期');
            delDateBtn.type = 'button';
            delDateBtn.onclick = function() { deleteMessageAt(index); };
            dateTools.appendChild(delDateBtn);
            dateRow.appendChild(dateTools);
          }
          streamEl.appendChild(dateRow);
          return;
        }

        var side = item.side === 'right' ? 'right' : 'left';
        var row = el('div', 'fc-chat-msg ' + side);
        row.dataset.msgIndex = String(index);
        row.dataset.msgKind = item.type || 'other';

        var roleName = side === 'right' ? userDisplayName : charDisplayName;
        var avatarAssetId = side === 'right' ? userAvatarAssetId : charAvatarAssetId;
        var avatarEl = el('div', 'fc-chat-avatar');
        if (avatarAssetId) {
          var cachedAvatarSrc = api ? api.getCachedSrc(avatarAssetId) : '';
          if (cachedAvatarSrc) {
            attachAvatarImg(avatarEl, cachedAvatarSrc, roleName + '的头像');
          } else {
            pendingAssets.push({
              kind: 'avatar',
              assetId: avatarAssetId,
              avatarEl: avatarEl,
              alt: roleName + '的头像'
            });
          }
        }
        row.appendChild(avatarEl);

        var body = el('div', 'fc-chat-msgbody');
        body.appendChild(el('div', 'fc-chat-name', roleName));

        if (item.type === 'transfer') {
          var claimed = isTransferClaimed(item);
          var card = el('button', 'fc-chat-transfer' + (claimed ? ' is-claimed' : ''));
          card.type = 'button';
          card.title = '点击切换已领取 / 未领取状态';
          card.appendChild(el('div', 'fc-chat-transfer-amount', '⇄  ' + (item.amount || '0')));
          card.appendChild(el('div', 'fc-chat-transfer-label', item.note || '转账'));
          card.appendChild(document.createElement('hr'));
          var foot = el('div', 'fc-chat-transfer-foot');
          foot.appendChild(el('span', '', '转账'));
          foot.appendChild(el('span', 'fc-chat-transfer-status', claimed ? '已领取' : '未领取'));
          card.appendChild(foot);
          card.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleTransferStatus(index);
          });
          body.appendChild(card);
        } else if (item.type === 'voice') {
          var voiceWrap = el('div', 'fc-chat-voice-wrap');
          var voiceRow = el('div', 'fc-chat-voice-row');
          var isPlaying = _playingVoiceIndex === index;
          var voiceBtn = el('button', 'fc-chat-voice' + (isPlaying ? ' is-playing' : ''));
          voiceBtn.type = 'button';
          voiceBtn.dataset.msgIndex = String(index);
          voiceBtn.setAttribute('aria-label', '播放语音消息');
          voiceBtn.appendChild(el('span', 'fc-chat-voice-icon', isPlaying ? '❚❚' : '▶'));
          voiceBtn.appendChild(el('span', 'fc-chat-voice-wave', '···'));
          voiceBtn.appendChild(el('span', 'fc-chat-voice-dur', (item.duration || '8') + '″'));
          voiceBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            playVoiceMessage(index, item);
          });
          voiceRow.appendChild(voiceBtn);

          var hasTranscript = Boolean(item.text && String(item.text).trim());
          var isExpanded = Boolean(_expandedVoices[index]);
          if (hasTranscript) {
            var toggleTextBtn = el('button', 'fc-chat-voice-text-btn' + (isExpanded ? ' active' : ''), isExpanded ? '收起文字' : '查看文字');
            toggleTextBtn.type = 'button';
            toggleTextBtn.addEventListener('click', function(e) {
              e.stopPropagation();
              _expandedVoices[index] = !_expandedVoices[index];
              renderMessages(false);
            });
            voiceRow.appendChild(toggleTextBtn);
          }

          voiceWrap.appendChild(voiceRow);
          if (hasTranscript && isExpanded) {
            voiceWrap.appendChild(el('div', 'fc-chat-voice-transcript', item.text));
          }
          body.appendChild(voiceWrap);
        } else if (item.type === 'call') {
          var statusText = item.status || '已接通';
          var statusCls = '';
          if (statusText.indexOf('未接') >= 0) statusCls = ' is-missed';
          else if (statusText.indexOf('取消') >= 0) statusCls = ' is-canceled';

          var callCard = el('div', 'fc-chat-call' + statusCls);
          callCard.appendChild(el('div', 'fc-chat-call-icon', item.video ? '▣' : '☎'));
          var callInfo = el('div', 'fc-chat-call-info');
          callInfo.appendChild(el('div', 'fc-chat-call-title', item.video ? '视频通话' : '语音通话'));
          var metaText = statusText + (item.duration ? ' · ' + item.duration : '');
          callInfo.appendChild(el('div', 'fc-chat-call-meta', metaText));
          callCard.appendChild(callInfo);
          callCard.addEventListener('click', function(e) {
            e.stopPropagation();
            _selectedIndex = _selectedIndex === index ? -1 : index;
            renderMessages(false);
          });
          body.appendChild(callCard);
        } else if (item.type === 'image') {
          var imgBubble = el('div', 'fc-chat-bubble fc-chat-imagebubble' + (item.isSticker ? ' is-sticker' : ''));
          var directSrc = item.src || (api && item.assetId ? api.getCachedSrc(item.assetId) : '');
          if (directSrc) {
            var img = document.createElement('img');
            img.src = directSrc;
            img.alt = item.alt || '聊天图片';
            img.onerror = function() {
              img.replaceWith(el('div', 'fc-chat-image-placeholder', '图片无法显示'));
            };
            img.onclick = function(e) {
              e.stopPropagation();
              openLightbox(directSrc, item.alt);
            };
            imgBubble.appendChild(img);
          } else if (item.assetId) {
            var loadingBox = el('div', 'fc-chat-image-placeholder', '加载中…');
            imgBubble.appendChild(loadingBox);
            pendingAssets.push({
              assetId: item.assetId,
              alt: item.alt || '图片',
              holder: loadingBox
            });
          } else {
            imgBubble.appendChild(el('div', 'fc-chat-image-placeholder', item.alt || '图片'));
          }
          body.appendChild(imgBubble);
        } else if (item.type === 'text') {
          var wrap = el('div', 'fc-chat-bubble-wrap');
          var bubble = el('div', 'fc-chat-bubble' + (item.fakeRecall ? ' is-recalled' : ''));

          if (item.fakeRecall) {
            var tagText = side === 'right' ? '你撤回了一条消息（假撤回）' : '对方撤回了一条消息（假撤回）';
            bubble.appendChild(el('span', 'fc-chat-recall-tag', tagText));
            bubble.appendChild(el('span', 'fc-chat-recall-text', item.text || ''));
          } else {
            bubble.textContent = item.text || '';
          }

          bubble.addEventListener('click', function(e) {
            e.stopPropagation();
            _selectedIndex = _selectedIndex === index ? -1 : index;
            renderMessages(false);
          });

          if (item.fakeRecall) {
            var flag = el('span', 'fc-chat-fake-recall');
            var againBtn = el('button', 'fc-recall-again', '↻ 改写');
            againBtn.type = 'button';
            againBtn.title = '改写并重新显示';
            againBtn.onclick = function(e) {
              e.stopPropagation();
              openRewriteSheet(index);
            };

            var crossBtn = el('button', 'fc-recall-cross', '×');
            crossBtn.type = 'button';
            crossBtn.title = '删除这条消息';
            crossBtn.onclick = function(e) {
              e.stopPropagation();
              deleteMessageAt(index);
            };

            flag.appendChild(againBtn);
            flag.appendChild(crossBtn);
            if (side === 'right') {
              wrap.appendChild(flag);
              wrap.appendChild(bubble);
            } else {
              wrap.appendChild(bubble);
              wrap.appendChild(flag);
            }
          } else {
            wrap.appendChild(bubble);
          }
          body.appendChild(wrap);
        } else {
          var summary = item.text || item.alt || (
            item.type === 'voice' ? '[语音消息]' :
            item.type === 'call' ? (item.video ? '[视频通话]' : '[语音通话]') :
            item.type === 'video' ? '[视频消息]' : '[消息]'
          );
          body.appendChild(el('div', 'fc-chat-bubble fc-chat-fallback', summary));
        }

        if (_state.showTools || _selectedIndex === index) {
          body.appendChild(buildInlineControls(index, item));
        }

        row.appendChild(body);
        streamEl.appendChild(row);
      });

      if (scrollToBottom) {
        streamEl.scrollTop = streamEl.scrollHeight;
      } else {
        streamEl.scrollTop = oldTop;
      }

      resolveMissingAssets(pendingAssets, resolveSeq);
    }

    syncRoleButton();
    applyChatAppearance();
    renderMessages(true);
    requestAnimationFrame(function() {
      streamEl.scrollTop = streamEl.scrollHeight;
    });

    var _contextMenuOpen = false;
    var _suppressUntilFreshPointerDown = false;
    var _maskSawPointerDown = false;
    var _holdTimer = null;
    var _holdPointerId = null;
    var _holdStartX = 0;
    var _holdStartY = 0;
    var _holdIndex = -1;

    function clearHoldTimer() {
      if (_holdTimer) {
        clearTimeout(_holdTimer);
        _holdTimer = null;
      }
      _holdPointerId = null;
      _holdIndex = -1;
    }

    function clearHoldHighlights() {
      var highlighted = streamEl.querySelectorAll('.fc-msg-hold-active');
      Array.prototype.forEach.call(highlighted, function(node) {
        node.classList.remove('fc-msg-hold-active');
      });
    }

    function closeMessageContextMenu() {
      _contextMenuOpen = false;
      _maskSawPointerDown = false;
      _suppressUntilFreshPointerDown = false;
      ctxMask.classList.remove('show');
      ctxMask.setAttribute('aria-hidden', 'true');
      ctxMenu.replaceChildren();
      clearHoldHighlights();
    }

    function buildMenuActionButton(cfg) {
      var btn = el('button', 'fc-ctx-item' + (cfg.danger ? ' danger' : ''));
      btn.type = 'button';
      btn.dataset.ctxAction = cfg.action;
      btn.setAttribute('role', 'menuitem');
      if (cfg.disabled) btn.disabled = true;
      btn.appendChild(el('span', 'fc-ctx-icon', cfg.icon));
      btn.appendChild(el('span', '', cfg.label));
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (btn.disabled) return;
        closeMessageContextMenu();
        cfg.onClick();
      });
      return btn;
    }

    function openMessageContextMenu(index, clientX, clientY) {
      var items = Array.isArray(_state && _state.items) ? _state.items : [];
      if (index < 0 || index >= items.length) return;
      if (sheetBack.classList.contains('show') || settingsPanel.classList.contains('show') || lightbox.classList.contains('show')) {
        return;
      }

      closeMessageContextMenu();
      var rawItem = items[index];
      var meta = describeMessageForMenu(rawItem);

      var targetRow = null;
      Array.prototype.some.call(streamEl.children, function(child) {
        if (child.dataset && child.dataset.msgIndex === String(index)) {
          targetRow = child;
          return true;
        }
        return false;
      });
      if (targetRow) {
        targetRow.classList.add('fc-msg-hold-active');
      }

      var headText = meta.label + (meta.preview ? (' · ' + meta.preview) : '');
      ctxMenu.appendChild(el('div', 'fc-ctx-head', headText));

      var listEl = el('div', 'fc-ctx-list');

      if (meta.kind === 'text') {
        listEl.appendChild(buildMenuActionButton({
          action: 'copy',
          icon: '⎘',
          label: '复制',
          onClick: function() { copyMessageText(meta.copyText); }
        }));

        if (meta.isRecalled) {
          listEl.appendChild(buildMenuActionButton({
            action: 'rewrite',
            icon: '↻',
            label: '改写',
            onClick: function() { openRewriteSheet(index); }
          }));
          listEl.appendChild(buildMenuActionButton({
            action: 'restore',
            icon: '↺',
            label: '恢复显示',
            onClick: function() { toggleFakeRecall(index); }
          }));
        } else {
          listEl.appendChild(buildMenuActionButton({
            action: 'edit',
            icon: '✎',
            label: '编辑',
            onClick: function() { openEditTextSheet(index); }
          }));
          listEl.appendChild(buildMenuActionButton({
            action: 'fakeRecall',
            icon: '◌',
            label: '假撤回',
            onClick: function() { toggleFakeRecall(index); }
          }));
        }
        listEl.appendChild(el('div', 'fc-ctx-divider'));
      }

      listEl.appendChild(buildMenuActionButton({
        action: 'moveUp',
        icon: '↑',
        label: '上移一条',
        disabled: index <= 0,
        onClick: function() { moveMessage(index, -1); }
      }));
      listEl.appendChild(buildMenuActionButton({
        action: 'moveDown',
        icon: '↓',
        label: '下移一条',
        disabled: index >= items.length - 1,
        onClick: function() { moveMessage(index, 1); }
      }));

      listEl.appendChild(el('div', 'fc-ctx-divider'));
      listEl.appendChild(buildMenuActionButton({
        action: 'delete',
        icon: '✕',
        label: '删除',
        danger: true,
        onClick: function() { confirmDeleteMessageSheet(index); }
      }));

      ctxMenu.appendChild(listEl);

      ctxMenu.style.visibility = 'hidden';
      ctxMenu.style.left = '0px';
      ctxMenu.style.top = '0px';
      ctxMask.classList.add('show');
      ctxMask.setAttribute('aria-hidden', 'false');
      _contextMenuOpen = true;

      var appRect = app.getBoundingClientRect();
      var menuW = ctxMenu.offsetWidth || 224;
      var menuH = ctxMenu.offsetHeight || 220;
      var margin = 10;

      var localX = (typeof clientX === 'number' && clientX > 0) ? (clientX - appRect.left) : (appRect.width / 2);
      var localY = (typeof clientY === 'number' && clientY > 0) ? (clientY - appRect.top) : (appRect.height / 2);

      var left = localX - menuW / 2;
      var maxLeft = Math.max(margin, appRect.width - menuW - margin);
      left = Math.max(margin, Math.min(maxLeft, left));

      var top = localY + 12;
      if (top + menuH > appRect.height - margin) {
        top = localY - menuH - 12;
      }
      var maxTop = Math.max(margin, appRect.height - menuH - margin);
      top = Math.max(margin, Math.min(maxTop, top));

      ctxMenu.style.left = Math.round(left) + 'px';
      ctxMenu.style.top = Math.round(top) + 'px';
      ctxMenu.style.visibility = 'visible';
    }

    function findMessageRowFromEventTarget(target) {
      if (!target || typeof target.closest !== 'function') return null;
      if (target.closest('.fc-chat-controls, .fc-chat-fake-recall, .fc-chat-voice-text-btn')) {
        return null;
      }
      var cur = target.closest('[data-msg-index]');
      while (cur && cur !== streamEl && cur.parentElement !== streamEl) {
        cur = cur.parentElement ? cur.parentElement.closest('[data-msg-index]') : null;
      }
      if (!cur || cur.parentElement !== streamEl) return null;
      return cur;
    }

    ctxMask.addEventListener('pointerdown', function(e) {
      _maskSawPointerDown = (e.target === ctxMask);
    });

    ctxMask.addEventListener('click', function(e) {
      if (e.target === ctxMask && _maskSawPointerDown) {
        e.stopPropagation();
        closeMessageContextMenu();
      }
    });

    ctxMask.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      if (e.target === ctxMask) {
        closeMessageContextMenu();
      }
    });

    streamEl.addEventListener('click', function(e) {
      if (_suppressUntilFreshPointerDown) {
        _suppressUntilFreshPointerDown = false;
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
      }
    }, true);

    streamEl.addEventListener('pointerdown', function(e) {
      _suppressUntilFreshPointerDown = false;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (_contextMenuOpen) return;
      if (sheetBack.classList.contains('show') || settingsPanel.classList.contains('show') || lightbox.classList.contains('show')) {
        return;
      }
      var row = findMessageRowFromEventTarget(e.target);
      if (!row) return;
      var idx = Number(row.dataset.msgIndex);
      if (isNaN(idx)) return;

      clearHoldTimer();
      _holdPointerId = e.pointerId;
      _holdStartX = e.clientX;
      _holdStartY = e.clientY;
      _holdIndex = idx;

      _holdTimer = setTimeout(function() {
        var openIdx = _holdIndex;
        var sx = _holdStartX;
        var sy = _holdStartY;
        clearHoldTimer();
        if (openIdx < 0) return;
        openMessageContextMenu(openIdx, sx, sy);
        _suppressUntilFreshPointerDown = true;
      }, 500);
    });

    streamEl.addEventListener('pointermove', function(e) {
      if (!_holdTimer || e.pointerId !== _holdPointerId) return;
      if (Math.hypot(e.clientX - _holdStartX, e.clientY - _holdStartY) > 10) {
        clearHoldTimer();
      }
    });

    app.addEventListener('pointerup', clearHoldTimer, true);
    app.addEventListener('pointercancel', clearHoldTimer, true);

    streamEl.addEventListener('scroll', function() {
      clearHoldTimer();
    }, { passive: true });

    streamEl.addEventListener('contextmenu', function(e) {
      var row = findMessageRowFromEventTarget(e.target);
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      clearHoldTimer();
      if (_contextMenuOpen && _suppressUntilFreshPointerDown) {
        return;
      }
      var idx = Number(row.dataset.msgIndex);
      if (isNaN(idx)) return;
      openMessageContextMenu(idx, e.clientX, e.clientY);
    });

    function handleSend() {
      var text = input.value.trim();
      if (!text) return;
      if (!Array.isArray(_state.items)) _state.items = [];
      _state.items.push({
        type: 'text',
        side: _sendSide,
        text: text
      });
      input.value = '';
      autoResizeInput();
      saveState(_state);
      renderMessages(true);
    }

    streamEl.addEventListener('click', function() {
      if (_selectedIndex !== -1) {
        _selectedIndex = -1;
        renderMessages(false);
      }
      if (_panelMode) {
        setPanelMode('');
      }
    });

    toolsToggleBtn.addEventListener('click', function() {
      closeMessageContextMenu();
      _state.showTools = !_state.showTools;
      toolsToggleBtn.classList.toggle('active', Boolean(_state.showTools));
      saveState(_state);
      renderMessages(false);
      notify(_state.showTools ? '已展开每条消息创作工具' : '已收起常驻工具');
    });

    settingsBtn.addEventListener('click', function() {
      closeMessageContextMenu();
      openRoleSettingsPanel();
    });

    roleBtn.addEventListener('click', function() {
      _sendSide = _sendSide === 'right' ? 'left' : 'right';
      syncRoleButton();
      notify(_sendSide === 'right' ? ('当前身份：' + currentUserName() + ' · User') : ('当前身份：' + currentCharName() + ' · Char'));
    });

    emojiBtn.addEventListener('click', function() {
      togglePanelMode('emoji');
    });

    moreBtn.addEventListener('click', function() {
      togglePanelMode('more');
    });

    sendBtn.addEventListener('click', handleSend);

    input.addEventListener('input', autoResizeInput);

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        handleSend();
      }
    });

    input.addEventListener('focus', function() {
      closeMessageContextMenu();
      if (_panelMode) setPanelMode('');
      setTimeout(function() {
        streamEl.scrollTop = streamEl.scrollHeight;
      }, 180);
    });

    var onDocKeyDown = function(e) {
      if (e.key !== 'Escape') return;
      if (_contextMenuOpen) {
        closeMessageContextMenu();
      } else if (lightbox.classList.contains('show')) {
        closeLightbox();
      } else if (sheetBack.classList.contains('show')) {
        closeSheet();
      }
    };
    document.addEventListener('keydown', onDocKeyDown);
    _cleanupDoc = function() {
      clearHoldTimer();
      closeMessageContextMenu();
      document.removeEventListener('keydown', onDocKeyDown);
    };

    if (global.visualViewport) {
      var onViewportResize = function() {
        if (!document.body.contains(app)) {
          close();
          return;
        }
        if (document.activeElement === input) {
          streamEl.scrollTop = streamEl.scrollHeight;
        }
      };
      global.visualViewport.addEventListener('resize', onViewportResize, { passive: true });
      _cleanupViewport = function() {
        global.visualViewport.removeEventListener('resize', onViewportResize);
      };
    }

    backBtn.addEventListener('click', function() {
      renderWorksListView();
    });
  }

  function stopVoicePlayback() {
    if (_activeAudio) {
      try {
        _activeAudio.onended = null;
        _activeAudio.onerror = null;
        _activeAudio.pause();
      } catch (_) {}
      _activeAudio = null;
    }
    if ('speechSynthesis' in global && typeof global.speechSynthesis.cancel === 'function') {
      try {
        global.speechSynthesis.cancel();
      } catch (_) {}
    }
    _playingVoiceIndex = -1;
  }

  function close() {
    _activeResolveSeq += 1;
    _stickerRenderSeq += 1;
    stopVoicePlayback();
    _expandedVoices = Object.create(null);
    if (typeof _cleanupDoc === 'function') {
      _cleanupDoc();
      _cleanupDoc = null;
    }
    if (typeof _cleanupViewport === 'function') {
      _cleanupViewport();
      _cleanupViewport = null;
    }
  }

  global.FanCommunityChat = {
    STORAGE_KEY: STORAGE_KEY,
    open: open,
    openWorksList: renderWorksListView,
    openWorkChat: openWorkChat,
    close: close
  };
})(window);
