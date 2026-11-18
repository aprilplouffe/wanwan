// js/fan-community-chat.js — 同好社区 · 捡手机文学创作模块
// 功能：多作品列表与安全迁移、新建与重命名作品、独立聊天记录、文字/图片/表情包/日期/撤回管理、
//       转账卡片、语音消息、语音通话与视频通话卡片、独立人设与外观设置、持久化恢复。

(function(global) {
  'use strict';

  var STORAGE_KEY = 'wanwan-phone-messages-v3';
  var WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  var DEFAULT_APPEARANCE = {
    bgType: 'color',
    bgColor: '#abc6d9',
    bgImageAssetId: '',
    bgImageFit: 'cover',
    userBubbleColor: '#fff133',
    charBubbleColor: '#ffffff',
    appearanceVersion: 2
  };

  var BG_COLOR_PRESETS = [
    { id: 'default', label: '原版晴空蓝', color: '#abc6d9' },
    { id: 'mistBlue', label: '浅雾海盐蓝', color: '#cfe0eb' },
    { id: 'cream', label: '暖奶油白', color: '#f6f1e7' },
    { id: 'sage', label: '浅灰豆绿', color: '#e8ede8' },
    { id: 'lilac', label: '淡雾丁香', color: '#ede9f2' },
    { id: 'deepNight', label: '夜读深海蓝', color: '#273644' }
  ];

  var BUBBLE_PAIR_PRESETS = [
    { id: 'default', label: '原版黄白', user: '#fff133', char: '#ffffff' },
    { id: 'sky', label: '晴雾蓝白', user: '#d6e7f5', char: '#ffffff' },
    { id: 'sageCream', label: '柔绿奶油', user: '#d9e3d2', char: '#fffefa' },
    { id: 'oatmeal', label: '暖杏奶咖', user: '#efe3d0', char: '#fffdf9' },
    { id: 'nightSlate', label: '夜读深蓝', user: '#365874', char: '#24313d' }
  ];

  var USER_BUBBLE_PRESETS = ['#fff133', '#d6e7f5', '#d9e3d2', '#efe3d0', '#eedce0', '#365874'];
  var CHAR_BUBBLE_PRESETS = ['#ffffff', '#fffefa', '#f4f8fb', '#f4f2ec', '#edf1ea', '#24313d'];

  var DEFAULT_CREATION_MODE = 'manual';

  var CREATION_MODE_LIST = [
    {
      id: 'manual',
      title: '手动创作',
      desc: '自己编辑双方聊天消息',
      isAi: false,
      noticeText: ''
    },
    {
      id: 'ai_roleplay',
      title: 'AI 角色互动',
      desc: '自己发送消息，AI 扮演指定角色回复',
      isAi: true,
      noticeText: 'AI 角色互动接口暂未接入，当前版本不会发起真实 AI 请求；您仍可正常使用下方输入框与工具手动创作，已有聊天记录不会丢失。'
    },
    {
      id: 'ai_story',
      title: 'AI 剧情生成',
      desc: '根据设定自动生成双方聊天剧情',
      isAi: true,
      noticeText: 'AI 剧情生成接口暂未接入，当前版本不会自动生成剧情内容；您仍可正常使用下方工具手动创作，已有聊天记录不会丢失。'
    }
  ];

  function normalizeMode(raw) {
    var wApi = worksApi();
    if (wApi && typeof wApi.normalizeCreationMode === 'function') {
      return wApi.normalizeCreationMode(raw);
    }
    var val = typeof raw === 'string' ? raw.trim() : '';
    for (var i = 0; i < CREATION_MODE_LIST.length; i++) {
      if (CREATION_MODE_LIST[i].id === val) return val;
    }
    return DEFAULT_CREATION_MODE;
  }

  function getCreationModeDef(modeId) {
    var normalized = normalizeMode(modeId);
    for (var i = 0; i < CREATION_MODE_LIST.length; i++) {
      if (CREATION_MODE_LIST[i].id === normalized) {
        return CREATION_MODE_LIST[i];
      }
    }
    return CREATION_MODE_LIST[0];
  }

  var AI_REPLY_LENGTH_OPTIONS = [
    { id: 'short', label: '简短' },
    { id: 'medium', label: '适中' },
    { id: 'detailed', label: '详细' }
  ];

  var AI_LANGUAGE_STYLE_OPTIONS = [
    { id: 'natural', label: '自然聊天' },
    { id: 'emotional', label: '细腻情感' },
    { id: 'dramatic', label: '戏剧化' }
  ];

  function createDefaultAiSettings(defaultCharName) {
    var wApi = worksApi();
    if (wApi && typeof wApi.createDefaultAiSettings === 'function') {
      return wApi.createDefaultAiSettings(defaultCharName);
    }
    var charName = String(defaultCharName || '').trim() || '对方';
    return {
      aiRole: {
        name: charName,
        personality: '',
        background: '',
        speakingStyle: '',
        relationshipToUser: ''
      },
      userRole: {
        identityBackground: '',
        personality: '',
        relationshipNotes: ''
      },
      story: {
        worldBackground: '',
        currentPlot: '',
        plotDirection: '',
        avoidContent: ''
      },
      preferences: {
        replyLength: 'medium',
        languageStyle: 'natural',
        allowAdvancePlot: true
      }
    };
  }

  function getAiSettings(raw, defaultCharName) {
    var wApi = worksApi();
    if (wApi && typeof wApi.normalizeAiSettings === 'function') {
      return wApi.normalizeAiSettings(raw, defaultCharName);
    }
    var base = createDefaultAiSettings(defaultCharName);
    if (!raw || typeof raw !== 'object') return base;
    var aiRole = raw.aiRole && typeof raw.aiRole === 'object' ? raw.aiRole : {};
    var userRole = raw.userRole && typeof raw.userRole === 'object' ? raw.userRole : {};
    var story = raw.story && typeof raw.story === 'object' ? raw.story : {};
    var prefs = raw.preferences && typeof raw.preferences === 'object' ? raw.preferences : {};
    return {
      aiRole: {
        name: String(aiRole.name || '').trim() || base.aiRole.name,
        personality: typeof aiRole.personality === 'string' ? aiRole.personality : '',
        background: typeof aiRole.background === 'string' ? aiRole.background : '',
        speakingStyle: typeof aiRole.speakingStyle === 'string' ? aiRole.speakingStyle : '',
        relationshipToUser: typeof aiRole.relationshipToUser === 'string' ? aiRole.relationshipToUser : ''
      },
      userRole: {
        identityBackground: typeof userRole.identityBackground === 'string' ? userRole.identityBackground : '',
        personality: typeof userRole.personality === 'string' ? userRole.personality : '',
        relationshipNotes: typeof userRole.relationshipNotes === 'string' ? userRole.relationshipNotes : ''
      },
      story: {
        worldBackground: typeof story.worldBackground === 'string' ? story.worldBackground : '',
        currentPlot: typeof story.currentPlot === 'string' ? story.currentPlot : '',
        plotDirection: typeof story.plotDirection === 'string' ? story.plotDirection : '',
        avoidContent: typeof story.avoidContent === 'string' ? story.avoidContent : ''
      },
      preferences: {
        replyLength: ['short', 'medium', 'detailed'].indexOf(prefs.replyLength) !== -1 ? prefs.replyLength : 'medium',
        languageStyle: ['natural', 'emotional', 'dramatic'].indexOf(prefs.languageStyle) !== -1 ? prefs.languageStyle : 'natural',
        allowAdvancePlot: prefs.allowAdvancePlot !== false
      }
    };
  }

  var INITIAL_STATE = {
    title: '捡手机文学',
    char: '对方',
    user: '我',
    charAvatarAssetId: '',
    userAvatarAssetId: '',
    appearance: {
      bgType: 'color',
      bgColor: '#abc6d9',
      bgImageAssetId: '',
      bgImageFit: 'cover',
      userBubbleColor: '#fff133',
      charBubbleColor: '#ffffff',
      appearanceVersion: 2
    },
    creationMode: DEFAULT_CREATION_MODE,
    boundPersonaId: '',
    boundRoleRef: null,
    aiSettings: createDefaultAiSettings('对方'),
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

  function personasApi() {
    return global.FanCommunityPersonas || null;
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
    var clean = normalizeHex(hex, '#ffffff');
    if (isDarkHex(clean)) {
      return {
        bg: clean,
        fg: '#f7f9fb',
        sub: '#cfdbe5',
        recallBg: hexToRgba(clean, 0.8),
        recallBorder: 'rgba(247, 249, 251, 0.36)'
      };
    }
    return {
      bg: clean,
      fg: '#22262a',
      sub: '#5b6b77',
      recallBg: hexToRgba(clean, 0.78),
      recallBorder: 'rgba(104, 128, 145, 0.45)'
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
    var bgColor = normalizeHex(src.bgColor, DEFAULT_APPEARANCE.bgColor);
    var userBubbleColor = normalizeHex(src.userBubbleColor, DEFAULT_APPEARANCE.userBubbleColor);
    var charBubbleColor = normalizeHex(src.charBubbleColor, DEFAULT_APPEARANCE.charBubbleColor);
    var isLegacyUnmodified = Number(src.appearanceVersion) < 2 &&
      bgType === 'color' &&
      !bgImageAssetId &&
      bgColor === '#e8ede8' &&
      userBubbleColor === '#d9e3d2' &&
      charBubbleColor === '#fffefa';
    if (isLegacyUnmodified) {
      bgColor = DEFAULT_APPEARANCE.bgColor;
      userBubbleColor = DEFAULT_APPEARANCE.userBubbleColor;
      charBubbleColor = DEFAULT_APPEARANCE.charBubbleColor;
    }
    return {
      bgType: bgType,
      bgColor: bgColor,
      bgImageAssetId: bgImageAssetId,
      bgImageFit: src.bgImageFit === 'contain' ? 'contain' : 'cover',
      userBubbleColor: userBubbleColor,
      charBubbleColor: charBubbleColor,
      appearanceVersion: 2
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

    var titleGroup = el('div', 'fc-works-title-group');
    var brandLink = el('button', 'fc-works-brand-link', '同好社区');
    brandLink.type = 'button';
    brandLink.dataset.fcHomeTrigger = '1';
    brandLink.setAttribute('aria-label', '点击同好社区返回弯弯机桌面');
    var titleEl = el('b', 'fc-works-title', '捡手机文学');
    titleGroup.appendChild(brandLink);
    titleGroup.appendChild(titleEl);

    var newBtn = el('button', 'fc-works-new-btn', '＋ 新建');
    newBtn.type = 'button';
    newBtn.id = 'fc-works-new-btn';

    head.appendChild(backBtn);
    head.appendChild(titleGroup);
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
        var modeDef = getCreationModeDef(work.creationMode);
        var modeTag = el('span', 'fc-work-mode-tag' + (modeDef.isAi ? ' is-ai' : ''), modeDef.title);
        titleRow.appendChild(modeTag);
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
    _state.creationMode = normalizeMode(_state.creationMode);
    _sendSide = 'right';
    _panelMode = '';
    _selectedIndex = -1;
    _expandedVoices = Object.create(null);

    container.replaceChildren();
    var app = el('div', 'fc-chat-app');

    var _searchQuery = '';
    var _searchMatches = [];
    var _searchCursor = -1;

    function createSvgIcon(svgMarkup) {
      var holder = document.createElement('span');
      holder.className = 'fc-svg-wrap';
      holder.setAttribute('aria-hidden', 'true');
      holder.innerHTML = svgMarkup;
      return holder;
    }

    // 顶部栏：严格保留原版结构（左返回、中角色名、右搜索 + 三横线菜单）
    var head = el('header', 'fc-chat-head');
    var backBtn = el('button', 'fc-chat-back');
    backBtn.type = 'button';
    backBtn.id = 'fc-chat-back';
    backBtn.setAttribute('aria-label', '返回作品列表');
    backBtn.appendChild(createSvgIcon('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>'));

    var titleEl = el('b', 'fc-chat-title', (_state && _state.char) || INITIAL_STATE.char);
    titleEl.id = 'fc-chat-title';

    var headActions = el('div', 'fc-chat-head-actions');
    var searchBtn = el('button', 'fc-chat-head-icon-btn');
    searchBtn.type = 'button';
    searchBtn.id = 'fc-chat-search-btn';
    searchBtn.setAttribute('title', '搜索聊天内容');
    searchBtn.setAttribute('aria-label', '搜索聊天内容');
    searchBtn.appendChild(createSvgIcon('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="20" y1="20" x2="16.2" y2="16.2"></line></svg>'));

    var menuBtn = el('button', 'fc-chat-head-icon-btn');
    menuBtn.type = 'button';
    menuBtn.id = 'fc-chat-menu-btn';
    menuBtn.setAttribute('title', '更多功能与设置');
    menuBtn.setAttribute('aria-label', '打开设置菜单');
    menuBtn.appendChild(createSvgIcon('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><line x1="4" y1="6.5" x2="20" y2="6.5"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17.5" x2="20" y2="17.5"></line></svg>'));

    headActions.appendChild(searchBtn);
    headActions.appendChild(menuBtn);

    head.appendChild(backBtn);
    head.appendChild(titleEl);
    head.appendChild(headActions);

    // 可折叠聊天搜索条（默认收起，不打扰主聊天区）
    var searchBar = el('div', 'fc-chat-search-bar');
    searchBar.id = 'fc-chat-search-bar';
    searchBar.hidden = true;

    var searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = 'fc-chat-search-input';
    searchInput.className = 'fc-chat-search-input';
    searchInput.placeholder = '搜索聊天关键词…';
    searchInput.setAttribute('aria-label', '搜索聊天关键词');

    var searchCountEl = el('span', 'fc-chat-search-count', '');
    searchCountEl.id = 'fc-chat-search-count';

    var searchPrevBtn = el('button', 'fc-chat-search-nav', '‹');
    searchPrevBtn.type = 'button';
    searchPrevBtn.id = 'fc-chat-search-prev';
    searchPrevBtn.setAttribute('aria-label', '上一条匹配');

    var searchNextBtn = el('button', 'fc-chat-search-nav', '›');
    searchNextBtn.type = 'button';
    searchNextBtn.id = 'fc-chat-search-next';
    searchNextBtn.setAttribute('aria-label', '下一条匹配');

    var searchCloseBtn = el('button', 'fc-chat-search-close', '完成');
    searchCloseBtn.type = 'button';
    searchCloseBtn.id = 'fc-chat-search-close';

    searchBar.appendChild(searchInput);
    searchBar.appendChild(searchCountEl);
    searchBar.appendChild(searchPrevBtn);
    searchBar.appendChild(searchNextBtn);
    searchBar.appendChild(searchCloseBtn);

    // 消息流与独立背景图层
    var streamWrap = el('div', 'fc-chat-stream-wrap');
    var bgLayer = el('div', 'fc-chat-bg-layer');
    bgLayer.id = 'fc-chat-bg-layer';
    var streamEl = el('div', 'fc-chat-stream');
    streamEl.id = 'fc-chat-stream';
    streamWrap.appendChild(bgLayer);
    streamWrap.appendChild(streamEl);

    // 底部原版输入与功能栏
    var bottom = el('div', 'fc-chat-bottom');

    var roleWrap = el('div', 'fc-chat-role');
    var roleBtn = el('button', 'fc-chat-role-btn');
    roleBtn.type = 'button';
    roleBtn.id = 'fc-chat-role-btn';
    roleBtn.setAttribute('title', '切换消息发送身份');
    roleWrap.appendChild(roleBtn);

    var compose = el('div', 'fc-chat-compose');

    var voiceBtn = el('button', 'fc-chat-icon-btn voice');
    voiceBtn.type = 'button';
    voiceBtn.id = 'fc-chat-voice-btn';
    voiceBtn.setAttribute('aria-label', '发送语音消息');
    voiceBtn.setAttribute('title', '发送语音消息');
    voiceBtn.appendChild(createSvgIcon('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"></circle><path d="M9.5 10.2v3.6M12 8.4v7.2M14.5 10.2v3.6"></path></svg>'));

    var input = el('textarea', 'fc-chat-input');
    input.id = 'fc-chat-input';
    input.rows = 1;
    input.placeholder = '发消息……';

    var emojiBtn = el('button', 'fc-chat-icon-btn emoji');
    emojiBtn.type = 'button';
    emojiBtn.id = 'fc-chat-emoji-btn';
    emojiBtn.setAttribute('aria-label', '表情包');
    emojiBtn.appendChild(createSvgIcon('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"></circle><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"></circle><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"></circle><path d="M8.5 14.3a4.3 4.3 0 0 0 7 0"></path></svg>'));

    var moreBtn = el('button', 'fc-chat-icon-btn plus');
    moreBtn.type = 'button';
    moreBtn.id = 'fc-chat-more-btn';
    moreBtn.setAttribute('aria-label', '更多创作工具');
    moreBtn.appendChild(createSvgIcon('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"><circle cx="12" cy="12" r="9.2"></circle><line x1="12" y1="8.2" x2="12" y2="15.8"></line><line x1="8.2" y1="12" x2="15.8" y2="12"></line></svg>'));

    var sendBtn = el('button', 'fc-chat-send', '发送');
    sendBtn.type = 'button';
    sendBtn.id = 'fc-chat-send';

    compose.appendChild(voiceBtn);
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

    // 右上角三横线功能菜单浮层
    var menuMask = el('div', 'fc-chat-menu-mask');
    menuMask.id = 'fc-chat-menu-mask';
    menuMask.setAttribute('aria-hidden', 'true');
    var menuPanel = el('section', 'fc-chat-menu-panel');
    menuPanel.id = 'fc-chat-menu-panel';
    menuPanel.setAttribute('role', 'dialog');
    menuPanel.setAttribute('aria-label', '聊天设置与创作菜单');
    menuMask.appendChild(menuPanel);

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

    // 二级设置页（角色与身份 / 聊天外观 / 作品管理）
    var settingsPanel = el('section', 'fc-chat-settings-panel');
    settingsPanel.id = 'fc-chat-settings-panel';
    settingsPanel.setAttribute('aria-hidden', 'true');

    // AI 设定二级设置页
    var aiSettingsPanel = el('section', 'fc-chat-settings-panel fc-ai-settings-panel');
    aiSettingsPanel.id = 'fc-chat-ai-settings-panel';
    aiSettingsPanel.setAttribute('aria-hidden', 'true');

    // 长按 / 右键消息操作浮层菜单
    var ctxMask = el('div', 'fc-chat-context-mask');
    ctxMask.id = 'fc-chat-context-mask';
    ctxMask.setAttribute('aria-hidden', 'true');
    var ctxMenu = el('div', 'fc-chat-context-menu');
    ctxMenu.id = 'fc-chat-context-menu';
    ctxMenu.setAttribute('role', 'menu');
    ctxMask.appendChild(ctxMenu);

    app.appendChild(head);
    app.appendChild(searchBar);
    app.appendChild(streamWrap);
    app.appendChild(bottom);
    app.appendChild(stickerBatchInput);
    app.appendChild(menuMask);
    app.appendChild(sheetBack);
    app.appendChild(settingsPanel);
    app.appendChild(aiSettingsPanel);
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
        app.style.setProperty('--fc-stream-name-fg', '#e3ebf2');
        app.style.setProperty('--fc-empty-title-fg', '#f3f7fa');
        app.style.setProperty('--fc-empty-sub-fg', '#c6d4e0');
      } else {
        app.classList.remove('has-dark-bg');
        app.style.setProperty('--fc-stream-name-fg', '#4d6172');
        app.style.setProperty('--fc-empty-title-fg', '#3e5364');
        app.style.setProperty('--fc-empty-sub-fg', '#5f7688');
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

    function syncHeaderTitle() {
      titleEl.textContent = currentCharName();
    }

    function syncRoleButton() {
      var isUser = _sendSide === 'right';
      var labelName = isUser ? (currentUserName() + ' · User') : (currentCharName() + ' · Char');
      roleBtn.textContent = labelName + ' ⌄';
      roleBtn.classList.toggle('is-char', !isUser);
      syncHeaderTitle();
    }

    function getWorkBoundRoleRef() {
      if (!_state) return null;
      var pApi = personasApi();
      if (pApi && typeof pApi.normalizeRoleRef === 'function') {
        return pApi.normalizeRoleRef(_state.boundRoleRef, _state.boundPersonaId);
      }
      var wApi = worksApi();
      if (wApi && typeof wApi.normalizeBoundRoleRef === 'function') {
        return wApi.normalizeBoundRoleRef(_state.boundRoleRef, _state.boundPersonaId);
      }
      return null;
    }

    function setWorkBoundRoleRef(ref) {
      if (!_state) return;
      if (ref && ref.source && ref.id) {
        _state.boundRoleRef = { source: String(ref.source), id: String(ref.id) };
        _state.boundPersonaId = _state.boundRoleRef.source === 'community_persona' ? _state.boundRoleRef.id : '';
      } else {
        _state.boundRoleRef = null;
        _state.boundPersonaId = '';
      }
    }

    function getBoundPersona() {
      var ref = getWorkBoundRoleRef();
      if (!ref || ref.source !== 'community_persona') return null;
      var pApi = personasApi();
      if (!pApi || typeof pApi.getPersona !== 'function') return null;
      return pApi.getPersona(ref.id);
    }

    function syncBoundPersonaUi() {
      // 仅确保旧字段 boundPersonaId 与 boundRoleRef 保持一致，不自动清除缺失角色的引用以便安全提示用户重新选择
      if (!_state) return;
      var ref = getWorkBoundRoleRef();
      _state.boundRoleRef = ref;
      _state.boundPersonaId = (ref && ref.source === 'community_persona') ? ref.id : '';
    }

    function countRecalledMessages() {
      var items = Array.isArray(_state && _state.items) ? _state.items : [];
      var count = 0;
      items.forEach(function(it) {
        if (!it) return;
        if (it.fakeRecall || it.type === 'withdraw') count += 1;
      });
      return count;
    }

    function countVisibleMessages() {
      var items = Array.isArray(_state && _state.items) ? _state.items : [];
      var count = 0;
      items.forEach(function(it) {
        if (!it) return;
        if (it.fakeRecall || it.type === 'withdraw') return;
        count += 1;
      });
      return count;
    }

    function openPersonaPickerSheet(onChanged) {
      closeMessageContextMenu();
      closeChatMenu();
      if (_panelMode) setPanelMode('');
      var pApi = personasApi();
      var currentRef = getWorkBoundRoleRef();
      var activeSource = (currentRef && (currentRef.source === 'char' || currentRef.source === 'npc'))
        ? 'archive'
        : 'community_persona';
      var activeArchiveType = (currentRef && currentRef.source === 'npc') ? 'npc' : 'char';
      var searchQuery = '';
      var drawSeq = 0;

      openSheet('选择绑定角色', function(body) {
        var note = el('p', 'fc-mode-sheet-sub', '仅记录角色稳定 ID 引用（公共人设库与弯弯机 Char/NPC 并存），不会修改原角色档案，也不会覆盖本作品昵称与 AI 补充设定。');
        body.appendChild(note);

        if (!pApi || typeof pApi.listPersonas !== 'function') {
          body.appendChild(el('p', 'fc-chat-sheet-note', '角色服务模块暂未就绪，请刷新后重试。'));
          var fallbackAct = el('div', 'fc-chat-sheet-actions');
          var fallbackClose = el('button', 'fc-chat-btn alt', '关闭');
          fallbackClose.type = 'button';
          fallbackClose.onclick = closeSheet;
          fallbackAct.appendChild(fallbackClose);
          body.appendChild(fallbackAct);
          return;
        }

        // 来源切换：来源 A（公共人设库） vs 来源 B（弯弯机角色档案）
        var sourceTabs = el('div', 'fc-role-source-tabs');
        sourceTabs.id = 'fc-role-source-tabs';
        sourceTabs.setAttribute('role', 'tablist');

        var srcPersonaBtn = el('button', 'fc-role-source-tab', '公共人设库');
        srcPersonaBtn.type = 'button';
        srcPersonaBtn.id = 'fc-role-tab-community';
        srcPersonaBtn.dataset.roleSource = 'community_persona';

        var srcArchiveBtn = el('button', 'fc-role-source-tab', '弯弯机角色档案');
        srcArchiveBtn.type = 'button';
        srcArchiveBtn.id = 'fc-role-tab-archive';
        srcArchiveBtn.dataset.roleSource = 'archive';

        sourceTabs.appendChild(srcPersonaBtn);
        sourceTabs.appendChild(srcArchiveBtn);
        body.appendChild(sourceTabs);

        // 来源 B 下的 Char / NPC 分类切换（不将两类数据混在一起）
        var archiveTypeBar = el('div', 'fc-role-archive-tabs');
        archiveTypeBar.id = 'fc-role-archive-tabs';
        archiveTypeBar.hidden = activeSource !== 'archive';

        var charTypeBtn = el('button', 'fc-role-archive-tab', 'Char');
        charTypeBtn.type = 'button';
        charTypeBtn.id = 'fc-role-archive-char';
        charTypeBtn.dataset.archiveType = 'char';

        var npcTypeBtn = el('button', 'fc-role-archive-tab', 'NPC');
        npcTypeBtn.type = 'button';
        npcTypeBtn.id = 'fc-role-archive-npc';
        npcTypeBtn.dataset.archiveType = 'npc';

        archiveTypeBar.appendChild(charTypeBtn);
        archiveTypeBar.appendChild(npcTypeBtn);
        body.appendChild(archiveTypeBar);

        var searchWrap = el('div', 'fc-persona-picker-search-wrap');
        var searchInputEl = document.createElement('input');
        searchInputEl.type = 'search';
        searchInputEl.id = 'fc-persona-picker-search';
        searchInputEl.className = 'fc-settings-input';
        searchInputEl.placeholder = '按角色姓名查找…';
        searchInputEl.setAttribute('aria-label', '按角色姓名查找角色');
        searchWrap.appendChild(searchInputEl);
        body.appendChild(searchWrap);

        var listBox = el('div', 'fc-persona-picker-list');
        listBox.id = 'fc-persona-picker-list';
        body.appendChild(listBox);

        function syncTabButtons() {
          srcPersonaBtn.classList.toggle('is-active', activeSource === 'community_persona');
          srcPersonaBtn.setAttribute('aria-selected', activeSource === 'community_persona' ? 'true' : 'false');
          srcArchiveBtn.classList.toggle('is-active', activeSource === 'archive');
          srcArchiveBtn.setAttribute('aria-selected', activeSource === 'archive' ? 'true' : 'false');
          archiveTypeBar.hidden = activeSource !== 'archive';
          charTypeBtn.classList.toggle('is-active', activeArchiveType === 'char');
          npcTypeBtn.classList.toggle('is-active', activeArchiveType === 'npc');
        }

        function bindSelectedRole(ref, displayName, sourceLabel) {
          if (!_state) return;
          setWorkBoundRoleRef(ref);
          saveState(_state);
          syncBoundPersonaUi();
          if (typeof onChanged === 'function') onChanged(ref);
          closeSheet();
          notify('已绑定' + sourceLabel + '：' + displayName);
        }

        function buildRoleCard(opts) {
          var isCurrent = Boolean(currentRef && currentRef.source === opts.source && currentRef.id === opts.id);
          var card = el('button', 'fc-persona-picker-card' + (isCurrent ? ' is-active' : ''));
          card.type = 'button';
          card.dataset.roleSource = opts.source;
          card.dataset.roleId = opts.id;
          if (opts.source === 'community_persona') {
            card.dataset.personaId = opts.id;
          } else {
            card.dataset.archiveId = opts.id;
          }

          var avEl = el('div', 'fc-persona-picker-avatar');
          if (typeof pApi.renderRoleAvatarBox === 'function') {
            pApi.renderRoleAvatarBox(avEl, opts.avatarRoleObj, function() {
              return sheetBack.classList.contains('show') && document.body.contains(card);
            });
          } else if (opts.source === 'community_persona') {
            pApi.renderAvatarBox(avEl, opts.avatarAssetId || '', function() {
              return sheetBack.classList.contains('show') && document.body.contains(card);
            });
          }

          var infoEl = el('div', 'fc-persona-picker-info');
          var topLine = el('div', 'fc-persona-picker-top');
          topLine.appendChild(el('strong', 'fc-persona-picker-name', opts.name));
          topLine.appendChild(el('span', 'fc-role-source-tag ' + opts.sourceClass, opts.sourceLabel));
          topLine.appendChild(el('span', 'fc-persona-picker-id', opts.idLabel));
          if (isCurrent) {
            topLine.appendChild(el('span', 'fc-mode-card-tag is-current', '当前绑定'));
          }
          infoEl.appendChild(topLine);
          infoEl.appendChild(el('p', 'fc-persona-picker-desc', opts.desc || '暂无详细设定描述'));

          var pickActionLabel = el('span', 'fc-role-pick-action', isCurrent ? '已选' : '选择');

          card.appendChild(avEl);
          card.appendChild(infoEl);
          card.appendChild(pickActionLabel);
          card.onclick = function() {
            bindSelectedRole({ source: opts.source, id: opts.id }, opts.name, opts.sourceLabel);
          };
          return card;
        }

        async function drawPickerList() {
          var token = ++drawSeq;
          syncTabButtons();
          listBox.replaceChildren();

          if (activeSource === 'community_persona') {
            var allCommunity = pApi.listPersonas();
            if (!allCommunity.length) {
              var emptyBox = el('div', 'fc-persona-picker-empty');
              emptyBox.appendChild(el('strong', '', '公共人设库暂无角色'));
              emptyBox.appendChild(el('p', '', '可切换上方「弯弯机角色档案」直接选用已有 Char / NPC，或前往「同好社区 → 设置 → 人设库」新建公共人设。'));
              listBox.appendChild(emptyBox);
              return;
            }
            var items = pApi.searchPersonas(searchQuery);
            if (!items.length) {
              listBox.appendChild(el('p', 'fc-chat-sheet-note', '未找到姓名匹配「' + String(searchQuery || '').trim() + '」的公共人设。'));
              return;
            }
            items.forEach(function(persona) {
              var descBits = [];
              if (persona.background) descBits.push(persona.background);
              if (persona.personality) descBits.push(persona.personality);
              if (persona.notes) descBits.push('备注：' + persona.notes);
              listBox.appendChild(buildRoleCard({
                source: 'community_persona',
                sourceLabel: '公共人设',
                sourceClass: 'is-persona',
                id: persona.id,
                idLabel: 'ID ' + persona.id.slice(-6),
                name: persona.name,
                desc: descBits.join(' · '),
                avatarAssetId: persona.avatarAssetId || '',
                avatarRoleObj: {
                  source: 'community_persona',
                  name: persona.name,
                  avatarAssetId: persona.avatarAssetId || ''
                }
              }));
            });
            return;
          }

          // 来源 B：直接只读读取弯弯机原有 Char / NPC
          listBox.appendChild(el('p', 'fc-chat-sheet-note', '正在读取弯弯机角色档案…'));
          var allChars = typeof pApi.listArchiveRoles === 'function' ? await pApi.listArchiveRoles('char', '') : [];
          var allNpcs = typeof pApi.listArchiveRoles === 'function' ? await pApi.listArchiveRoles('npc', '') : [];
          if (token !== drawSeq || !sheetBack.classList.contains('show')) return;

          charTypeBtn.textContent = 'Char (' + allChars.length + ')';
          npcTypeBtn.textContent = 'NPC (' + allNpcs.length + ')';

          listBox.replaceChildren();
          var sourceRows = activeArchiveType === 'npc' ? allNpcs : allChars;
          if (!sourceRows.length) {
            var arcEmpty = el('div', 'fc-persona-picker-empty');
            arcEmpty.appendChild(el('strong', '', '弯弯机暂无 ' + (activeArchiveType === 'npc' ? 'NPC' : 'Char') + ' 角色'));
            arcEmpty.appendChild(el('p', '', '在弯弯机「角色档案」中创建角色后，即可在此直接绑定引用。'));
            listBox.appendChild(arcEmpty);
            return;
          }

          var q = String(searchQuery || '').trim().toLowerCase();
          var filteredArchive = q
            ? sourceRows.filter(function(item) {
                return String(item.name || '').toLowerCase().indexOf(q) !== -1;
              })
            : sourceRows;

          if (!filteredArchive.length) {
            listBox.appendChild(el('p', 'fc-chat-sheet-note', '未找到姓名匹配「' + String(searchQuery || '').trim() + '」的 ' + (activeArchiveType === 'npc' ? 'NPC' : 'Char') + ' 角色。'));
            return;
          }

          filteredArchive.forEach(function(item) {
            var metaBits = [];
            if (item.nick) metaBits.push('昵称：' + item.nick);
            if (item.role) metaBits.push(item.role);
            if (item.group) metaBits.push(item.group);
            if (item.description) metaBits.push(item.description);
            listBox.appendChild(buildRoleCard({
              source: item.source,
              sourceLabel: item.sourceLabel,
              sourceClass: item.source === 'npc' ? 'is-npc' : 'is-char',
              id: item.id,
              idLabel: 'ID #' + item.id,
              name: item.name,
              desc: metaBits.join(' · '),
              avatarRoleObj: item
            }));
          });
        }

        srcPersonaBtn.onclick = function() {
          if (activeSource === 'community_persona') return;
          activeSource = 'community_persona';
          drawPickerList();
        };
        srcArchiveBtn.onclick = function() {
          if (activeSource === 'archive') return;
          activeSource = 'archive';
          drawPickerList();
        };
        charTypeBtn.onclick = function() {
          if (activeArchiveType === 'char') return;
          activeArchiveType = 'char';
          drawPickerList();
        };
        npcTypeBtn.onclick = function() {
          if (activeArchiveType === 'npc') return;
          activeArchiveType = 'npc';
          drawPickerList();
        };
        searchInputEl.addEventListener('input', function() {
          searchQuery = searchInputEl.value;
          drawPickerList();
        });
        drawPickerList();

        var actions = el('div', 'fc-chat-sheet-actions');
        if (currentRef) {
          var clearBtn = el('button', 'fc-chat-btn alt', '解除绑定');
          clearBtn.type = 'button';
          clearBtn.id = 'fc-persona-picker-unbind';
          clearBtn.onclick = function() {
            if (!_state) return;
            setWorkBoundRoleRef(null);
            saveState(_state);
            syncBoundPersonaUi();
            if (typeof onChanged === 'function') onChanged(null);
            closeSheet();
            notify('已解除当前作品的角色绑定');
          };
          actions.appendChild(clearBtn);
        }
        var closeBtn = el('button', 'fc-chat-btn alt', '关闭');
        closeBtn.type = 'button';
        closeBtn.id = 'fc-persona-picker-close';
        closeBtn.onclick = closeSheet;
        actions.appendChild(closeBtn);
        body.appendChild(actions);
      });
    }

    function syncCreationModeUi() {
      getCreationModeDef(_state && _state.creationMode);
      syncBoundPersonaUi();
    }

    function openCreationModeSheet() {
      closeMessageContextMenu();
      closeChatMenu();
      if (_panelMode) setPanelMode('');
      openSheet('创作模式', function(body) {
        var curId = normalizeMode(_state && _state.creationMode);
        var sub = el('p', 'fc-mode-sheet-sub', '每部作品独立保存创作模式，切换模式不会清空已有聊天记录或已绑定的角色。');
        var cards = el('div', 'fc-mode-cards');
        cards.id = 'fc-mode-cards';

        CREATION_MODE_LIST.forEach(function(def) {
          var isActive = def.id === curId;
          var card = el('button', 'fc-mode-card' + (isActive ? ' is-active' : '') + (def.isAi ? ' is-ai' : ''));
          card.type = 'button';
          card.dataset.creationMode = def.id;

          var top = el('div', 'fc-mode-card-top');
          var titleWrap = el('div', 'fc-mode-card-title-wrap');
          titleWrap.appendChild(el('span', 'fc-mode-card-radio'));
          titleWrap.appendChild(el('strong', 'fc-mode-card-title', def.title));
          top.appendChild(titleWrap);

          var badges = el('div', 'fc-mode-card-badges');
          if (def.isAi) {
            badges.appendChild(el('span', 'fc-mode-card-tag is-pending', '待接入 AI'));
          }
          if (isActive) {
            badges.appendChild(el('span', 'fc-mode-card-tag is-current', '当前'));
          }
          top.appendChild(badges);

          var desc = el('p', 'fc-mode-card-desc', def.desc);

          card.appendChild(top);
          card.appendChild(desc);

          card.onclick = function() {
            if (!_state) return;
            _state.creationMode = def.id;
            saveState(_state);
            syncCreationModeUi();
            closeSheet();
            notify('已切换为「' + def.title + '」');
          };

          cards.appendChild(card);
        });

        var actions = el('div', 'fc-chat-sheet-actions');
        var aiEntryBtn = el('button', 'fc-chat-btn', 'AI 设定 / 选择角色');
        aiEntryBtn.type = 'button';
        aiEntryBtn.id = 'fc-mode-open-ai-settings-btn';
        aiEntryBtn.onclick = function() {
          closeSheet();
          openAiSettingsPanel();
        };

        var closeBtn = el('button', 'fc-chat-btn alt', '关闭');
        closeBtn.type = 'button';
        closeBtn.id = 'fc-mode-sheet-close';
        closeBtn.onclick = closeSheet;
        actions.appendChild(aiEntryBtn);
        actions.appendChild(closeBtn);

        body.appendChild(sub);
        body.appendChild(cards);
        body.appendChild(actions);
      });
    }

    function applySearchHighlight() {
      var rows = streamEl.querySelectorAll('[data-msg-index]');
      Array.prototype.forEach.call(rows, function(node) {
        node.classList.remove('fc-msg-search-hit');
      });
      if (!_searchMatches.length || _searchCursor < 0 || _searchCursor >= _searchMatches.length) {
        return;
      }
      var targetIdx = _searchMatches[_searchCursor];
      var hitRow = streamEl.querySelector('[data-msg-index="' + targetIdx + '"]');
      if (hitRow) {
        hitRow.classList.add('fc-msg-search-hit');
        try {
          hitRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (_) {
          hitRow.scrollIntoView();
        }
      }
    }

    function runMessageSearch(queryText, resetCursor) {
      _searchQuery = String(queryText || '').trim();
      _searchMatches = [];
      if (!_searchQuery) {
        _searchCursor = -1;
        searchCountEl.textContent = '';
        applySearchHighlight();
        return;
      }
      var lower = _searchQuery.toLowerCase();
      var items = Array.isArray(_state && _state.items) ? _state.items : [];
      items.forEach(function(item, idx) {
        if (!item || item.fakeRecall || item.type === 'withdraw') return;
        var textPool = [item.text, item.note, item.amount, item.alt].filter(Boolean).join(' ').toLowerCase();
        if (textPool.indexOf(lower) !== -1) {
          _searchMatches.push(idx);
        }
      });
      if (!_searchMatches.length) {
        _searchCursor = -1;
        searchCountEl.textContent = '0/0';
        applySearchHighlight();
        return;
      }
      if (resetCursor || _searchCursor < 0 || _searchCursor >= _searchMatches.length) {
        _searchCursor = _searchMatches.length - 1;
      }
      searchCountEl.textContent = (_searchCursor + 1) + '/' + _searchMatches.length;
      applySearchHighlight();
    }

    function stepSearchMatch(delta) {
      if (!_searchMatches.length) return;
      _searchCursor = (_searchCursor + delta + _searchMatches.length) % _searchMatches.length;
      searchCountEl.textContent = (_searchCursor + 1) + '/' + _searchMatches.length;
      applySearchHighlight();
    }

    function openSearchBar() {
      closeChatMenu();
      closeMessageContextMenu();
      searchBar.hidden = false;
      searchBtn.classList.add('active');
      setTimeout(function() {
        searchInput.focus();
      }, 30);
    }

    function closeSearchBar() {
      searchBar.hidden = true;
      searchBtn.classList.remove('active');
      searchInput.value = '';
      runMessageSearch('', true);
    }

    syncCreationModeUi();

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
      var pApi = personasApi();
      if (!api) return;
      var usedElsewhere = wApi ? wApi.isAssetReferencedInOtherWorks(assetId, _currentWorkId) : false;
      var usedInPersona = pApi && typeof pApi.isAssetReferenced === 'function' ? pApi.isAssetReferenced(assetId) : false;
      if (usedElsewhere || usedInPersona) return;

      api.getAsset(assetId).then(function(record) {
        if (!record) return;
        if (allowedKind && record.kind !== allowedKind) return;
        if (isAssetUsedInCurrentState(assetId)) return;
        var stillOther = wApi ? wApi.isAssetReferencedInOtherWorks(assetId, _currentWorkId) : false;
        var stillPersona = pApi && typeof pApi.isAssetReferenced === 'function' ? pApi.isAssetReferenced(assetId) : false;
        if (!stillOther && !stillPersona) {
          return api.deleteAsset(assetId);
        }
      }).catch(function() {});
    }

    function closeChatMenu() {
      menuMask.classList.remove('show');
      menuMask.setAttribute('aria-hidden', 'true');
      menuPanel.replaceChildren();
    }

    function openChatMenu() {
      closeMessageContextMenu();
      closeSheet();
      if (_panelMode) setPanelMode('');
      menuPanel.replaceChildren();

      var modeDef = getCreationModeDef(_state && _state.creationMode);
      var boundRef = getWorkBoundRoleRef();
      var boundPersona = getBoundPersona();
      var ap = getAppearance(_state && _state.appearance);
      var visibleCount = countVisibleMessages();
      var recalledCount = countRecalledMessages();

      var mHead = el('div', 'fc-menu-head');
      var mTitleWrap = el('div', 'fc-menu-head-text');
      mTitleWrap.appendChild(el('strong', 'fc-menu-head-title', _state.title || '未命名作品'));
      mTitleWrap.appendChild(el('span', 'fc-menu-head-sub', currentCharName() + ' · ' + modeDef.title));
      var mCloseBtn = el('button', 'fc-menu-close', '×');
      mCloseBtn.type = 'button';
      mCloseBtn.id = 'fc-chat-menu-close';
      mCloseBtn.setAttribute('aria-label', '关闭菜单');
      mCloseBtn.onclick = closeChatMenu;
      mHead.appendChild(mTitleWrap);
      mHead.appendChild(mCloseBtn);
      menuPanel.appendChild(mHead);

      var mScroll = el('div', 'fc-menu-scroll');

      function makeGroup(groupTitle, rows) {
        var group = el('section', 'fc-menu-group');
        group.appendChild(el('div', 'fc-menu-group-title', groupTitle));
        var list = el('div', 'fc-menu-group-list');
        rows.forEach(function(cfg) {
          var rowBtn = el('button', 'fc-menu-row');
          rowBtn.type = 'button';
          rowBtn.id = cfg.id;
          var iconBox = el('span', 'fc-menu-row-icon', cfg.icon);
          var copyCol = el('div', 'fc-menu-row-copy');
          copyCol.appendChild(el('strong', 'fc-menu-row-title', cfg.title));
          copyCol.appendChild(el('span', 'fc-menu-row-sub', cfg.sub));
          var rightCol = el('div', 'fc-menu-row-right');
          if (cfg.badge) {
            rightCol.appendChild(el('span', 'fc-menu-row-badge', cfg.badge));
          }
          rightCol.appendChild(el('span', 'fc-menu-row-arrow', '›'));
          rowBtn.appendChild(iconBox);
          rowBtn.appendChild(copyCol);
          rowBtn.appendChild(rightCol);
          rowBtn.onclick = function() {
            closeChatMenu();
            cfg.onClick();
          };
          list.appendChild(rowBtn);
        });
        group.appendChild(list);
        return group;
      }

      var initialAiSub = '角色人设 · 剧情背景 · 公共/弯弯机角色档案';
      var initialAiBadge = '';
      if (boundRef) {
        if (boundRef.source === 'community_persona') {
          if (boundPersona) {
            initialAiSub = '已绑定公共人设：' + boundPersona.name;
            initialAiBadge = '已绑定';
          } else {
            initialAiSub = '原角色已不存在，请重新选择';
            initialAiBadge = '需重选';
          }
        } else {
          initialAiSub = '正在读取弯弯机角色档案…';
          initialAiBadge = boundRef.source === 'npc' ? 'NPC' : 'Char';
        }
      }

      mScroll.appendChild(makeGroup('创作与 AI', [
        {
          id: 'fc-menu-item-mode',
          icon: '✦',
          title: '创作模式',
          sub: '手动创作 / AI 角色互动 / AI 剧情生成',
          badge: modeDef.title,
          onClick: openCreationModeSheet
        },
        {
          id: 'fc-menu-item-ai',
          icon: '◈',
          title: 'AI 设定',
          sub: initialAiSub,
          badge: initialAiBadge,
          onClick: openAiSettingsPanel
        }
      ]));

      var apSummary = ap.bgType === 'image' && ap.bgImageAssetId
        ? ('图片背景（' + (ap.bgImageFit === 'contain' ? '完整显示' : '铺满') + '）')
        : (ap.bgColor === DEFAULT_APPEARANCE.bgColor ? '原版晴空蓝' : ('纯色 ' + ap.bgColor));

      mScroll.appendChild(makeGroup('角色与外观', [
        {
          id: 'fc-menu-item-role',
          icon: '☺',
          title: '角色与身份',
          sub: '我：' + currentUserName() + ' · 对方：' + currentCharName(),
          onClick: openRoleIdentityPanel
        },
        {
          id: 'fc-menu-item-appearance',
          icon: '◐',
          title: '聊天外观',
          sub: apSummary + ' · 气泡配色',
          onClick: openAppearancePanel
        }
      ]));

      mScroll.appendChild(makeGroup('作品管理', [
        {
          id: 'fc-menu-item-works',
          icon: '▤',
          title: '作品管理',
          sub: '重命名 · 已撤回消息(' + recalledCount + ') · 导出导入记录',
          badge: visibleCount + ' 条',
          onClick: openWorkManagePanel
        }
      ]));

      menuPanel.appendChild(mScroll);
      menuMask.classList.add('show');
      menuMask.setAttribute('aria-hidden', 'false');

      if (boundRef && boundRef.source !== 'community_persona') {
        var pApiMenu = personasApi();
        if (pApiMenu && typeof pApiMenu.resolveRoleRef === 'function') {
          pApiMenu.resolveRoleRef(boundRef).then(function(res) {
            if (!menuMask.classList.contains('show')) return;
            var aiRow = menuPanel.querySelector('#fc-menu-item-ai');
            if (!aiRow) return;
            var subEl = aiRow.querySelector('.fc-menu-row-sub');
            var badgeEl = aiRow.querySelector('.fc-menu-row-badge');
            if (res.status === 'ok' && res.role) {
              if (subEl) subEl.textContent = '已绑定 ' + res.sourceLabel + '：' + res.role.name;
              if (badgeEl) badgeEl.textContent = res.sourceLabel;
            } else if (res.status === 'missing') {
              if (subEl) subEl.textContent = '原角色已不存在（' + res.sourceLabel + ' · ID #' + res.ref.id + '）';
              if (badgeEl) badgeEl.textContent = '已缺失';
            }
          }).catch(function() {});
        }
      }
    }

    menuMask.addEventListener('click', function(e) {
      if (e.target === menuMask) closeChatMenu();
    });

    function closeSecondarySettingsPanel() {
      settingsPanel.classList.remove('show');
      settingsPanel.setAttribute('aria-hidden', 'true');
      settingsPanel.replaceChildren();
    }

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

    function openRoleIdentityPanel() {
      if (_panelMode) setPanelMode('');
      closeSheet();
      closeChatMenu();
      settingsPanel.replaceChildren();

      var draft = {
        user: {
          name: currentUserName(),
          mode: 'keep',
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
        }
      };
      var panelOpenToken = ++_activeResolveSeq;

      var sHead = el('header', 'fc-settings-head');
      var sBackBtn = el('button', 'fc-settings-back');
      sBackBtn.type = 'button';
      sBackBtn.id = 'fc-chat-settings-back';
      sBackBtn.appendChild(el('span', 'fc-works-back-chevron', '‹'));
      sBackBtn.appendChild(el('span', '', '返回'));
      sBackBtn.onclick = closeSecondarySettingsPanel;

      var sTitle = el('b', 'fc-settings-title', '角色与身份');
      var sSpacer = el('div', 'fc-settings-head-spacer');
      sHead.appendChild(sBackBtn);
      sHead.appendChild(sTitle);
      sHead.appendChild(sSpacer);

      var sBody = el('div', 'fc-settings-body');

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

      sBody.appendChild(buildRoleCard('user', '我的身份', '右侧气泡', '输入我的昵称（默认：我）', true));
      sBody.appendChild(buildRoleCard('char', '对方身份', '左侧气泡 · 顶部标题', '输入对方昵称（默认：对方）', false));
      sBody.appendChild(el('p', 'fc-settings-note', '说明：每部作品的昵称与头像完全独立；对方昵称会同步显示在聊天页顶部居中标题及消息列表中。'));

      var sFoot = el('div', 'fc-settings-foot');
      var footBackBtn = el('button', 'fc-chat-btn alt', '返回');
      footBackBtn.type = 'button';
      footBackBtn.id = 'fc-chat-settings-cancel';
      footBackBtn.onclick = closeSecondarySettingsPanel;

      var saveBtn = el('button', 'fc-chat-btn', '保存设置');
      saveBtn.type = 'button';
      saveBtn.id = 'fc-chat-settings-save';
      saveBtn.onclick = async function() {
        var api = assetsApi();
        var oldUserAvatarId = (_state && _state.userAvatarAssetId) || '';
        var oldCharAvatarId = (_state && _state.charAvatarAssetId) || '';
        var nextUserAvatarId = oldUserAvatarId;
        var nextCharAvatarId = oldCharAvatarId;

        var needsAssets = draft.user.mode === 'replace' || draft.char.mode === 'replace';
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

          var prevCharName = currentCharName();
          var nextCharName = String(draft.char.name || '').trim() || INITIAL_STATE.char;
          _state.user = String(draft.user.name || '').trim() || INITIAL_STATE.user;
          _state.char = nextCharName;
          if (_state.aiSettings && _state.aiSettings.aiRole) {
            var curAiName = String(_state.aiSettings.aiRole.name || '').trim();
            if (!curAiName || curAiName === prevCharName) {
              _state.aiSettings.aiRole.name = nextCharName;
            }
          }
          _state.userAvatarAssetId = nextUserAvatarId;
          _state.charAvatarAssetId = nextCharAvatarId;

          if (!saveState(_state)) {
            saveBtn.disabled = false;
            return;
          }

          closeSecondarySettingsPanel();
          syncRoleButton();
          renderMessages(false);
          notify('已保存角色与身份设置');

          if (oldUserAvatarId && oldUserAvatarId !== nextUserAvatarId) {
            cleanupUnreferencedAsset(oldUserAvatarId, 'avatar');
          }
          if (oldCharAvatarId && oldCharAvatarId !== nextCharAvatarId && oldCharAvatarId !== oldUserAvatarId) {
            cleanupUnreferencedAsset(oldCharAvatarId, 'avatar');
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

    function openAppearancePanel() {
      if (_panelMode) setPanelMode('');
      closeSheet();
      closeChatMenu();
      settingsPanel.replaceChildren();

      var curAp = getAppearance(_state && _state.appearance);
      var draftAppearance = {
        bgType: curAp.bgType,
        bgColor: curAp.bgColor,
        bgImageMode: curAp.bgType === 'image' && curAp.bgImageAssetId ? 'keep' : 'clear',
        existingBgAssetId: curAp.bgImageAssetId || '',
        bgDataUrl: '',
        bgFileName: '',
        bgImageFit: curAp.bgImageFit,
        userBubbleColor: curAp.userBubbleColor,
        charBubbleColor: curAp.charBubbleColor
      };
      var panelOpenToken = ++_activeResolveSeq;

      var sHead = el('header', 'fc-settings-head');
      var sBackBtn = el('button', 'fc-settings-back');
      sBackBtn.type = 'button';
      sBackBtn.id = 'fc-appearance-settings-back';
      sBackBtn.appendChild(el('span', 'fc-works-back-chevron', '‹'));
      sBackBtn.appendChild(el('span', '', '返回'));
      sBackBtn.onclick = closeSecondarySettingsPanel;

      var sTitle = el('b', 'fc-settings-title', '聊天外观');
      var resetAppearBtn = el('button', 'fc-settings-mini-btn', '恢复默认');
      resetAppearBtn.type = 'button';
      resetAppearBtn.id = 'fc-settings-appearance-reset';
      sHead.appendChild(sBackBtn);
      sHead.appendChild(sTitle);
      sHead.appendChild(resetAppearBtn);

      var sBody = el('div', 'fc-settings-body');

      // 实时预览卡片
      var previewCard = el('div', 'fc-appearance-preview');
      previewCard.id = 'fc-settings-appearance-preview';

      var previewLeftRow = el('div', 'fc-preview-row');
      previewLeftRow.appendChild(el('span', 'fc-preview-dot'));
      var previewCharBubble = el('div', 'fc-preview-bubble', currentCharName() + '：今天的晚风好像很温柔。');
      previewCharBubble.id = 'fc-settings-preview-char-bubble';
      previewLeftRow.appendChild(previewCharBubble);

      var previewRightRow = el('div', 'fc-preview-row right');
      previewRightRow.appendChild(el('span', 'fc-preview-dot'));
      var previewUserBubble = el('div', 'fc-preview-bubble', currentUserName() + '：刚买好冰美式，这就来找你。');
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
      var bgStatusTag = el('span', 'fc-settings-card-tag', '原版晴空蓝');
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
          draftAppearance.bgType = 'color';
          draftAppearance.bgColor = preset.color;
          draftAppearance.bgImageMode = 'clear';
          draftAppearance.bgDataUrl = '';
          draftAppearance.bgFileName = '';
          syncAppearanceUi();
        };
        bgPresetBtns.push(sw);
        bgSwatchRow.appendChild(sw);
      });

      var bgPickerChip = el('label', 'fc-color-picker-chip');
      var bgColorInput = document.createElement('input');
      bgColorInput.type = 'color';
      bgColorInput.id = 'fc-settings-bg-color';
      bgColorInput.value = draftAppearance.bgColor;
      var bgColorHexText = el('span', '', draftAppearance.bgColor);
      bgColorHexText.id = 'fc-settings-bg-color-label';
      bgPickerChip.appendChild(bgColorInput);
      bgPickerChip.appendChild(el('span', '', '自定义 '));
      bgPickerChip.appendChild(bgColorHexText);
      bgColorInput.addEventListener('input', function() {
        draftAppearance.bgType = 'color';
        draftAppearance.bgColor = normalizeHex(bgColorInput.value, DEFAULT_APPEARANCE.bgColor);
        draftAppearance.bgImageMode = 'clear';
        draftAppearance.bgDataUrl = '';
        draftAppearance.bgFileName = '';
        syncAppearanceUi();
      });
      bgSwatchRow.appendChild(bgPickerChip);
      bgColorSub.appendChild(bgSwatchRow);
      bgCard.appendChild(bgColorSub);

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

      var bgResetBtn = el('button', 'fc-settings-mini-btn', '恢复默认背景');
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
      bubbleHead.appendChild(el('span', 'fc-settings-card-tag', '高对比可读'));
      bubbleCard.appendChild(bubbleHead);

      var pairSub = el('div', 'fc-settings-subblock');
      var pairSubHead = el('div', 'fc-settings-subhead');
      pairSubHead.appendChild(el('span', 'fc-settings-subhead-title', '快捷配色组合'));
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
          draftAppearance.userBubbleColor = pair.user;
          draftAppearance.charBubbleColor = pair.char;
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
        '我的消息气泡（默认 #fff133）',
        'fc-settings-user-bubble-color',
        'fc-settings-user-bubble-label',
        USER_BUBBLE_PRESETS,
        function() { return draftAppearance.userBubbleColor; },
        function(val) { draftAppearance.userBubbleColor = val; }
      );

      var syncCharBubblePicker = buildBubbleColorPicker(
        '对方消息气泡（默认 #ffffff）',
        'fc-settings-char-bubble-color',
        'fc-settings-char-bubble-label',
        CHAR_BUBBLE_PRESETS,
        function() { return draftAppearance.charBubbleColor; },
        function(val) { draftAppearance.charBubbleColor = val; }
      );

      sBody.appendChild(bubbleCard);

      var cachedBgDataUrl = '';
      if (draftAppearance.bgImageMode === 'keep' && draftAppearance.existingBgAssetId) {
        var bgApi = assetsApi();
        cachedBgDataUrl = bgApi ? bgApi.getCachedSrc(draftAppearance.existingBgAssetId) : '';
        if (!cachedBgDataUrl && bgApi) {
          bgApi.getAsset(draftAppearance.existingBgAssetId).then(function(record) {
            if (!settingsPanel.classList.contains('show') || panelOpenToken !== _activeResolveSeq) return;
            if (draftAppearance.bgImageMode !== 'keep') return;
            if (record && record.src) {
              cachedBgDataUrl = record.src;
              syncAppearanceUi();
            }
          }).catch(function() {});
        }
      }

      function syncAppearanceUi() {
        var ap = draftAppearance;
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
          bgStatusTag.textContent = '原版晴空蓝';
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
          draftAppearance.bgType = 'image';
          draftAppearance.bgImageMode = 'replace';
          draftAppearance.bgDataUrl = dataUrl;
          draftAppearance.bgFileName = file.name || '聊天背景';
          syncAppearanceUi();
        } catch (err) {
          bgFileInput.value = '';
          notify(err && err.message ? err.message : '背景图片读取失败');
        }
      });

      bgClearImgBtn.onclick = function() {
        draftAppearance.bgType = 'color';
        draftAppearance.bgImageMode = 'clear';
        draftAppearance.bgDataUrl = '';
        draftAppearance.bgFileName = '';
        syncAppearanceUi();
      };

      bgResetBtn.onclick = function() {
        draftAppearance.bgType = 'color';
        draftAppearance.bgColor = DEFAULT_APPEARANCE.bgColor;
        draftAppearance.bgImageMode = 'clear';
        draftAppearance.bgDataUrl = '';
        draftAppearance.bgFileName = '';
        draftAppearance.bgImageFit = 'cover';
        syncAppearanceUi();
      };

      fitCoverBtn.onclick = function() {
        draftAppearance.bgImageFit = 'cover';
        syncAppearanceUi();
      };

      fitContainBtn.onclick = function() {
        draftAppearance.bgImageFit = 'contain';
        syncAppearanceUi();
      };

      resetAppearBtn.onclick = function() {
        draftAppearance.bgType = DEFAULT_APPEARANCE.bgType;
        draftAppearance.bgColor = DEFAULT_APPEARANCE.bgColor;
        draftAppearance.bgImageMode = 'clear';
        draftAppearance.bgDataUrl = '';
        draftAppearance.bgFileName = '';
        draftAppearance.bgImageFit = DEFAULT_APPEARANCE.bgImageFit;
        draftAppearance.userBubbleColor = DEFAULT_APPEARANCE.userBubbleColor;
        draftAppearance.charBubbleColor = DEFAULT_APPEARANCE.charBubbleColor;
        syncAppearanceUi();
      };

      syncAppearanceUi();
      sBody.appendChild(el('p', 'fc-settings-note', '背景图片保存在本地 IndexedDB，各作品互相独立，调整后点击「保存外观」生效。'));

      var sFoot = el('div', 'fc-settings-foot');
      var footBackBtn = el('button', 'fc-chat-btn alt', '返回');
      footBackBtn.type = 'button';
      footBackBtn.id = 'fc-appearance-settings-cancel';
      footBackBtn.onclick = closeSecondarySettingsPanel;

      var saveBtn = el('button', 'fc-chat-btn', '保存外观');
      saveBtn.type = 'button';
      saveBtn.id = 'fc-appearance-settings-save';
      saveBtn.onclick = async function() {
        var api = assetsApi();
        var oldBgAssetId = (_state && _state.appearance && _state.appearance.bgImageAssetId) || '';
        var nextBgAssetId = oldBgAssetId;
        var needsAssets = draftAppearance.bgType === 'image' && draftAppearance.bgImageMode === 'replace';
        if (needsAssets && !api) {
          notify('本地素材存储模块不可用');
          return;
        }

        saveBtn.disabled = true;
        try {
          if (draftAppearance.bgType === 'image') {
            if (draftAppearance.bgImageMode === 'replace' && draftAppearance.bgDataUrl) {
              var savedBgImg = await api.putAsset({
                id: api.uid('bg_'),
                name: draftAppearance.bgFileName || '聊天背景',
                src: draftAppearance.bgDataUrl,
                kind: 'bg'
              });
              nextBgAssetId = savedBgImg.id;
            } else if (draftAppearance.bgImageMode === 'clear') {
              nextBgAssetId = '';
            }
          } else {
            nextBgAssetId = '';
          }

          _state.appearance = getAppearance({
            bgType: draftAppearance.bgType === 'image' && nextBgAssetId ? 'image' : 'color',
            bgColor: draftAppearance.bgColor,
            bgImageAssetId: nextBgAssetId,
            bgImageFit: draftAppearance.bgImageFit,
            userBubbleColor: draftAppearance.userBubbleColor,
            charBubbleColor: draftAppearance.charBubbleColor,
            appearanceVersion: 2
          });

          if (!saveState(_state)) {
            saveBtn.disabled = false;
            return;
          }

          closeSecondarySettingsPanel();
          applyChatAppearance();
          notify('已保存聊天外观');

          if (oldBgAssetId && oldBgAssetId !== nextBgAssetId) {
            cleanupUnreferencedAsset(oldBgAssetId, 'bg');
          }
        } catch (err) {
          notify(err && err.message ? err.message : '保存外观失败');
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

    function openWorkManagePanel() {
      if (_panelMode) setPanelMode('');
      closeSheet();
      closeChatMenu();
      settingsPanel.replaceChildren();

      var sHead = el('header', 'fc-settings-head');
      var sBackBtn = el('button', 'fc-settings-back');
      sBackBtn.type = 'button';
      sBackBtn.id = 'fc-work-manage-back';
      sBackBtn.appendChild(el('span', 'fc-works-back-chevron', '‹'));
      sBackBtn.appendChild(el('span', '', '返回'));
      sBackBtn.onclick = closeSecondarySettingsPanel;

      var sTitle = el('b', 'fc-settings-title', '作品管理');
      var sSpacer = el('div', 'fc-settings-head-spacer');
      sHead.appendChild(sBackBtn);
      sHead.appendChild(sTitle);
      sHead.appendChild(sSpacer);

      var sBody = el('div', 'fc-settings-body');
      sBody.id = 'fc-work-manage-body';

      // 1. 作品信息与重命名
      var infoCard = el('section', 'fc-settings-card');
      var infoHead = el('div', 'fc-settings-card-head');
      infoHead.appendChild(el('span', 'fc-settings-card-title', '作品信息'));
      var modeDef = getCreationModeDef(_state && _state.creationMode);
      infoHead.appendChild(el('span', 'fc-settings-card-tag', modeDef.title));
      infoCard.appendChild(infoHead);

      var nameLabel = el('label', 'fc-settings-field-label', '作品名称');
      nameLabel.setAttribute('for', 'fc-work-manage-title-input');
      var titleRow = el('div', 'fc-work-manage-rename-row');
      var titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.id = 'fc-work-manage-title-input';
      titleInput.className = 'fc-settings-input';
      titleInput.maxLength = 60;
      titleInput.value = (_state && _state.title) || '';
      titleInput.placeholder = '输入作品名称';

      var renameSaveBtn = el('button', 'fc-settings-mini-btn primary', '更新名称');
      renameSaveBtn.type = 'button';
      renameSaveBtn.id = 'fc-work-manage-title-save';
      renameSaveBtn.onclick = function() {
        var nextTitle = titleInput.value.trim();
        if (!nextTitle) {
          notify('作品名称不能为空');
          return;
        }
        var wApi = worksApi();
        if (wApi && _currentWorkId) {
          var res = wApi.renameWork(_currentWorkId, nextTitle);
          if (!res.ok) {
            notify(res.error || '更新名称失败');
            return;
          }
        }
        _state.title = nextTitle;
        saveState(_state);
        notify('作品名称已更新');
      };

      titleRow.appendChild(titleInput);
      titleRow.appendChild(renameSaveBtn);
      infoCard.appendChild(nameLabel);
      infoCard.appendChild(titleRow);

      var statLine = el('p', 'fc-settings-note', '当前显示 ' + countVisibleMessages() + ' 条消息，另有 ' + countRecalledMessages() + ' 条已撤回消息隐藏保留在记录中。');
      statLine.style.marginTop = '10px';
      infoCard.appendChild(statLine);

      // 常驻消息编辑工具开关
      var toolsRow = el('div', 'fc-ai-switch-row');
      var toolsCopy = el('div', 'fc-ai-switch-copy');
      toolsCopy.appendChild(el('strong', 'fc-ai-switch-title', '常驻显示消息编辑按钮'));
      toolsCopy.appendChild(el('span', 'fc-ai-switch-sub', '开启后每条消息下方将直接显示「撤回 / 改写 / 删除」快捷按钮'));
      var toolsSwitchBtn = el('button', 'fc-ai-switch-btn' + (_state.showTools ? ' is-on' : ''));
      toolsSwitchBtn.type = 'button';
      toolsSwitchBtn.id = 'fc-work-manage-tools-toggle';
      toolsSwitchBtn.textContent = _state.showTools ? '已开启' : '已关闭';
      toolsSwitchBtn.onclick = function() {
        _state.showTools = !_state.showTools;
        saveState(_state);
        renderMessages(false);
        toolsSwitchBtn.classList.toggle('is-on', Boolean(_state.showTools));
        toolsSwitchBtn.textContent = _state.showTools ? '已开启' : '已关闭';
        notify(_state.showTools ? '已展开每条消息工具栏' : '已收起常驻工具栏');
      };
      toolsRow.appendChild(toolsCopy);
      toolsRow.appendChild(toolsSwitchBtn);
      infoCard.appendChild(toolsRow);
      sBody.appendChild(infoCard);

      // 2. 已撤回消息列表（撤回后消息彻底在主聊天区隐藏，此处保留原文并支持改写或恢复显示）
      var recallCard = el('section', 'fc-settings-card');
      recallCard.id = 'fc-work-manage-recalled-card';
      var recallListEl = el('div', 'fc-recalled-list');

      function drawRecalledList() {
        recallCard.replaceChildren();
        recallListEl.replaceChildren();

        var items = Array.isArray(_state && _state.items) ? _state.items : [];
        var recalledEntries = [];
        items.forEach(function(it, idx) {
          if (!it) return;
          if (it.fakeRecall || it.type === 'withdraw') {
            var textVal = it.type === 'withdraw' && it.original ? it.original.text : it.text;
            var sideVal = it.type === 'withdraw' && it.original ? (it.side || it.original.side) : it.side;
            recalledEntries.push({
              index: idx,
              side: sideVal === 'right' ? 'right' : 'left',
              text: textVal || '[消息]'
            });
          }
        });

        var rHead = el('div', 'fc-settings-card-head');
        rHead.appendChild(el('span', 'fc-settings-card-title', '已撤回消息'));
        rHead.appendChild(el('span', 'fc-settings-card-tag', recalledEntries.length + ' 条'));
        recallCard.appendChild(rHead);

        if (!recalledEntries.length) {
          recallCard.appendChild(el('p', 'fc-settings-note', '当前没有已撤回消息。长按聊天消息点击「撤回」后，消息会从聊天界面直接消失，但原始内容仍保存在这里以便恢复或改写。'));
          return;
        }

        recalledEntries.slice().reverse().forEach(function(entry) {
          var itemBox = el('div', 'fc-recalled-item');
          itemBox.dataset.recalledIndex = String(entry.index);
          var senderName = entry.side === 'right' ? currentUserName() : currentCharName();
          var metaLine = el('div', 'fc-recalled-item-meta', senderName + (entry.side === 'right' ? '（我）' : '（对方）'));
          var textLine = el('div', 'fc-recalled-item-text', entry.text);
          var ops = el('div', 'fc-recalled-item-ops');

          var rewriteBtn = el('button', 'fc-settings-mini-btn', '改写');
          rewriteBtn.type = 'button';
          rewriteBtn.onclick = function() {
            closeSecondarySettingsPanel();
            openRewriteSheet(entry.index);
          };

          var restoreBtn = el('button', 'fc-settings-mini-btn primary', '恢复显示');
          restoreBtn.type = 'button';
          restoreBtn.onclick = function() {
            toggleRecall(entry.index);
            drawRecalledList();
            statLine.textContent = '当前显示 ' + countVisibleMessages() + ' 条消息，另有 ' + countRecalledMessages() + ' 条已撤回消息隐藏保留在记录中。';
          };

          ops.appendChild(rewriteBtn);
          ops.appendChild(restoreBtn);
          itemBox.appendChild(metaLine);
          itemBox.appendChild(textLine);
          itemBox.appendChild(ops);
          recallListEl.appendChild(itemBox);
        });
        recallCard.appendChild(recallListEl);
      }

      drawRecalledList();
      sBody.appendChild(recallCard);

      // 3. 聊天记录导入导出
      var ioCard = el('section', 'fc-settings-card');
      var ioHead = el('div', 'fc-settings-card-head');
      ioHead.appendChild(el('span', 'fc-settings-card-title', '聊天记录备份'));
      ioHead.appendChild(el('span', 'fc-settings-card-tag', 'JSON'));
      ioCard.appendChild(ioHead);
      ioCard.appendChild(el('p', 'fc-settings-note', '可导出当前作品的完整文字与结构数据，或从 JSON 文件导入消息记录。'));

      var ioBtns = el('div', 'fc-settings-avatar-btns');
      ioBtns.style.marginTop = '12px';

      var exportBtn = el('button', 'fc-settings-mini-btn primary', '导出当前作品 JSON');
      exportBtn.type = 'button';
      exportBtn.id = 'fc-work-export-btn';
      exportBtn.onclick = function() {
        try {
          var payload = JSON.stringify(_state, null, 2);
          var blob = new Blob([payload], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = ((_state && _state.title) || '捡手机文学') + '.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
          notify('已导出作品 JSON 数据');
        } catch (err) {
          notify('导出失败');
        }
      };

      var importInput = document.createElement('input');
      importInput.type = 'file';
      importInput.accept = '.json,application/json';
      importInput.hidden = true;
      importInput.id = 'fc-work-import-file';

      var importBtn = el('button', 'fc-settings-mini-btn', '导入聊天记录 JSON');
      importBtn.type = 'button';
      importBtn.id = 'fc-work-import-btn';
      importBtn.onclick = function() {
        importInput.value = '';
        importInput.click();
      };

      importInput.addEventListener('change', function() {
        var file = importInput.files && importInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function() {
          try {
            var parsed = JSON.parse(String(reader.result || ''));
            var nextItems = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.items) ? parsed.items : null);
            if (!nextItems) {
              notify('JSON 格式不正确，未找到消息列表');
              return;
            }
            _state.items = nextItems;
            if (parsed && !Array.isArray(parsed)) {
              if (typeof parsed.char === 'string' && parsed.char.trim()) _state.char = parsed.char.trim();
              if (typeof parsed.user === 'string' && parsed.user.trim()) _state.user = parsed.user.trim();
            }
            saveState(_state);
            syncRoleButton();
            renderMessages(true);
            closeSecondarySettingsPanel();
            notify('已导入 ' + nextItems.length + ' 条聊天记录');
          } catch (_) {
            notify('解析 JSON 文件失败，请检查文件内容');
          }
        };
        reader.readAsText(file, 'utf-8');
      });

      ioBtns.appendChild(exportBtn);
      ioBtns.appendChild(importBtn);
      ioCard.appendChild(ioBtns);
      ioCard.appendChild(importInput);
      sBody.appendChild(ioCard);

      var sFoot = el('div', 'fc-settings-foot');
      var footCloseBtn = el('button', 'fc-chat-btn', '完成返回');
      footCloseBtn.type = 'button';
      footCloseBtn.id = 'fc-work-manage-done';
      footCloseBtn.onclick = closeSecondarySettingsPanel;
      sFoot.appendChild(footCloseBtn);

      settingsPanel.appendChild(sHead);
      settingsPanel.appendChild(sBody);
      settingsPanel.appendChild(sFoot);
      settingsPanel.classList.add('show');
      settingsPanel.setAttribute('aria-hidden', 'false');
    }

    function closeAiSettingsPanel() {
      aiSettingsPanel.classList.remove('show');
      aiSettingsPanel.setAttribute('aria-hidden', 'true');
      aiSettingsPanel.replaceChildren();
    }

    function openAiSettingsPanel() {
      if (_panelMode) setPanelMode('');
      closeSheet();
      closeChatMenu();
      closeSecondarySettingsPanel();
      aiSettingsPanel.replaceChildren();

      var fallbackChar = currentCharName();
      var draft = clone(getAiSettings(_state && _state.aiSettings, fallbackChar));

      var aHead = el('header', 'fc-settings-head');
      var aBackBtn = el('button', 'fc-settings-back');
      aBackBtn.type = 'button';
      aBackBtn.id = 'fc-ai-settings-back';
      aBackBtn.appendChild(el('span', 'fc-works-back-chevron', '‹'));
      aBackBtn.appendChild(el('span', '', '取消'));
      aBackBtn.onclick = closeAiSettingsPanel;

      var aTitle = el('b', 'fc-settings-title', 'AI 设定');

      var aResetBtn = el('button', 'fc-settings-mini-btn', '恢复默认');
      aResetBtn.type = 'button';
      aResetBtn.id = 'fc-ai-settings-reset';

      aHead.appendChild(aBackBtn);
      aHead.appendChild(aTitle);
      aHead.appendChild(aResetBtn);

      var aBody = el('div', 'fc-settings-body fc-ai-settings-body');
      aBody.id = 'fc-ai-settings-body';

      var fieldRegistry = [];

      function scrollFieldOnFocus(control) {
        control.addEventListener('focus', function() {
          setTimeout(function() {
            if (!aiSettingsPanel.classList.contains('show')) return;
            try {
              control.scrollIntoView({ block: 'center', behavior: 'smooth' });
            } catch (_) {
              control.scrollIntoView();
            }
          }, 200);
        });
      }

      function createTextField(opts) {
        var group = el('div', 'fc-ai-field-group');
        var labelEl = el('label', 'fc-settings-field-label', opts.label);
        labelEl.setAttribute('for', opts.id);

        var control;
        if (opts.multiline) {
          control = document.createElement('textarea');
          control.className = 'fc-settings-input fc-ai-textarea';
          control.rows = opts.rows || 3;
          control.maxLength = opts.maxLength || 1500;
        } else {
          control = document.createElement('input');
          control.type = 'text';
          control.className = 'fc-settings-input';
          control.maxLength = opts.maxLength || 40;
        }
        control.id = opts.id;
        control.placeholder = opts.placeholder || '';
        control.value = opts.getValue();
        control.addEventListener('input', function() {
          opts.setValue(control.value);
        });
        scrollFieldOnFocus(control);

        group.appendChild(labelEl);
        group.appendChild(control);
        if (opts.hint) {
          group.appendChild(el('p', 'fc-ai-field-hint', opts.hint));
        }

        fieldRegistry.push(function() {
          control.value = opts.getValue();
        });
        return group;
      }

      var curModeDef = getCreationModeDef(_state && _state.creationMode);
      var modeHintCard = el('div', 'fc-ai-settings-banner');
      modeHintCard.appendChild(el('span', 'fc-ai-settings-banner-tag', '共用设定 · ' + curModeDef.title));
      modeHintCard.appendChild(el('p', 'fc-ai-settings-banner-text', '此设定由当前作品的「AI 角色互动」与「AI 剧情生成」共同使用；仅本地保存，不会自动覆盖聊天昵称、头像或触发 AI 请求。'));
      aBody.appendChild(modeHintCard);

      // 角色档案绑定状态卡（支持同好社区公共人设库 + 弯弯机 Char/NPC，只读引用，不写回原档案，也不覆盖下方作品 aiSettings）
      var refPersonaCard = el('section', 'fc-settings-card fc-ai-bound-card');
      refPersonaCard.id = 'fc-ai-bound-persona-card';
      var bindRenderSeq = 0;

      function paintRefCardState(stateObj) {
        refPersonaCard.replaceChildren();
        refPersonaCard.classList.toggle('is-missing', stateObj.status === 'missing');
        var pApi = personasApi();

        var refHead = el('div', 'fc-settings-card-head');
        refHead.appendChild(el('span', 'fc-settings-card-title', '引用的 AI 角色档案'));
        var tagText = stateObj.status === 'ok'
          ? stateObj.sourceLabel
          : (stateObj.status === 'missing' ? '原角色已不存在' : '可选绑定');
        var tagEl = el('span', 'fc-settings-card-tag' + (stateObj.status === 'missing' ? ' is-warn' : ''), tagText);
        refHead.appendChild(tagEl);
        refPersonaCard.appendChild(refHead);

        var row = el('div', 'fc-ai-bound-row');
        var avBox = el('div', 'fc-chat-bound-avatar');
        var infoBox = el('div', 'fc-chat-bound-info');

        if (stateObj.status === 'ok' && stateObj.role) {
          var role = stateObj.role;
          var idLabel = role.source === 'community_persona' ? ('ID ' + role.id.slice(-6)) : ('ID #' + role.id);
          infoBox.appendChild(el('strong', 'fc-chat-bound-name', role.name + '（' + stateObj.sourceLabel + ' · ' + idLabel + '）'));
          var liveDesc = role.description || role.background || role.personality || '暂无详细设定';
          infoBox.appendChild(el('span', 'fc-chat-bound-sub', liveDesc));
          if (pApi && typeof pApi.renderRoleAvatarBox === 'function') {
            pApi.renderRoleAvatarBox(avBox, role, function() {
              return aiSettingsPanel.classList.contains('show') && document.body.contains(avBox);
            });
          } else if (pApi && typeof pApi.renderAvatarBox === 'function' && role.avatarAssetId) {
            pApi.renderAvatarBox(avBox, role.avatarAssetId, function() {
              return aiSettingsPanel.classList.contains('show') && document.body.contains(avBox);
            });
          }
        } else if (stateObj.status === 'missing' && stateObj.ref) {
          var missIdLabel = stateObj.ref.source === 'community_persona' ? ('ID ' + stateObj.ref.id.slice(-6)) : ('ID #' + stateObj.ref.id);
          infoBox.appendChild(el('strong', 'fc-chat-bound-name', '原角色已不存在（' + stateObj.sourceLabel + ' · ' + missIdLabel + '）'));
          infoBox.appendChild(el('span', 'fc-chat-bound-sub', '原档案可能已被删除；本作品聊天记录与下方补充设定已完整保留，请重新选择或解除绑定'));
        } else if (stateObj.status === 'loading') {
          infoBox.appendChild(el('strong', 'fc-chat-bound-name', '正在读取角色档案…'));
          infoBox.appendChild(el('span', 'fc-chat-bound-sub', '实时同步原角色资料中'));
        } else {
          infoBox.appendChild(el('strong', 'fc-chat-bound-name', '尚未引用角色档案（可选）'));
          infoBox.appendChild(el('span', 'fc-chat-bound-sub', '支持从「公共人设库」或「弯弯机 Char / NPC」绑定 1 位角色，下方作品设定可随时独立补充'));
        }
        row.appendChild(avBox);
        row.appendChild(infoBox);

        var opsRow = el('div', 'fc-ai-bound-ops');
        var chooseLabel = stateObj.status === 'missing' ? '重新选择' : '从人设库选择';
        var chooseBtn = el('button', 'fc-settings-mini-btn primary', chooseLabel);
        chooseBtn.type = 'button';
        chooseBtn.id = 'fc-ai-pick-persona-btn';
        chooseBtn.onclick = function() {
          openPersonaPickerSheet(function() {
            renderRefPersonaCard();
          });
        };
        opsRow.appendChild(chooseBtn);

        if (stateObj.status === 'ok' || stateObj.status === 'missing') {
          var clearBindBtn = el('button', 'fc-settings-mini-btn', '解除绑定');
          clearBindBtn.type = 'button';
          clearBindBtn.id = 'fc-ai-unbind-persona-btn';
          clearBindBtn.onclick = function() {
            if (!_state) return;
            setWorkBoundRoleRef(null);
            saveState(_state);
            syncBoundPersonaUi();
            renderRefPersonaCard();
            notify('已解除当前作品的角色绑定');
          };
          opsRow.appendChild(clearBindBtn);
        }

        refPersonaCard.appendChild(row);
        refPersonaCard.appendChild(opsRow);
        if (stateObj.status === 'ok') {
          refPersonaCard.appendChild(el('p', 'fc-ai-field-hint', '基础人设实时读取自原档案；下方「AI 角色设定」与「剧情设定」仅作用于本作品补充，不会修改原档案。'));
        }
      }

      function renderRefPersonaCard() {
        var seq = ++bindRenderSeq;
        var pApi = personasApi();
        var ref = getWorkBoundRoleRef();
        if (!ref) {
          paintRefCardState({ status: 'unbound' });
          return;
        }
        if (pApi && typeof pApi.resolveRoleRef === 'function') {
          paintRefCardState({ status: 'loading' });
          pApi.resolveRoleRef(ref).then(function(res) {
            if (seq !== bindRenderSeq || !aiSettingsPanel.classList.contains('show')) return;
            paintRefCardState(res);
          }).catch(function() {
            if (seq !== bindRenderSeq || !aiSettingsPanel.classList.contains('show')) return;
            paintRefCardState({
              status: 'missing',
              ref: ref,
              sourceLabel: pApi.getRoleSourceLabel ? pApi.getRoleSourceLabel(ref.source) : '角色'
            });
          });
        } else {
          var bound = getBoundPersona();
          paintRefCardState(bound
            ? { status: 'ok', ref: ref, sourceLabel: '公共人设', role: bound }
            : { status: 'missing', ref: ref, sourceLabel: '公共人设' });
        }
      }
      renderRefPersonaCard();
      aBody.appendChild(refPersonaCard);

      // 1. AI 角色设定
      var aiRoleCard = el('section', 'fc-settings-card');
      var aiRoleHead = el('div', 'fc-settings-card-head');
      aiRoleHead.appendChild(el('span', 'fc-settings-card-title', '1. AI 角色设定'));
      aiRoleHead.appendChild(el('span', 'fc-settings-card-tag', '对方人设'));
      aiRoleCard.appendChild(aiRoleHead);

      aiRoleCard.appendChild(createTextField({
        id: 'fc-ai-role-name',
        label: '角色姓名',
        multiline: false,
        maxLength: 40,
        placeholder: '默认使用对方昵称：' + fallbackChar,
        hint: '默认带入当前作品的「对方昵称」，可独立修改，不会影响聊天页头像与昵称。',
        getValue: function() { return draft.aiRole.name; },
        setValue: function(v) { draft.aiRole.name = v; }
      }));
      aiRoleCard.appendChild(createTextField({
        id: 'fc-ai-role-personality',
        label: '角色性格',
        multiline: true,
        rows: 3,
        maxLength: 1200,
        placeholder: '例如：表面冷淡克制，私下细心嘴硬，偶尔会吃醋……',
        getValue: function() { return draft.aiRole.personality; },
        setValue: function(v) { draft.aiRole.personality = v; }
      }));
      aiRoleCard.appendChild(createTextField({
        id: 'fc-ai-role-background',
        label: '角色背景与经历',
        multiline: true,
        rows: 3,
        maxLength: 2000,
        placeholder: '角色的职业、过往经历、生活习惯或重要背景信息……',
        getValue: function() { return draft.aiRole.background; },
        setValue: function(v) { draft.aiRole.background = v; }
      }));
      aiRoleCard.appendChild(createTextField({
        id: 'fc-ai-role-speaking-style',
        label: '说话风格',
        multiline: true,
        rows: 2,
        maxLength: 1000,
        placeholder: '例如：喜欢发短句、很少用感叹号、熟人面前会带点调侃……',
        getValue: function() { return draft.aiRole.speakingStyle; },
        setValue: function(v) { draft.aiRole.speakingStyle = v; }
      }));
      aiRoleCard.appendChild(createTextField({
        id: 'fc-ai-role-relationship',
        label: '角色与「我」的关系',
        multiline: true,
        rows: 2,
        maxLength: 1000,
        placeholder: '例如：暗恋多年的竹马、合租室友、上下级或前任……',
        getValue: function() { return draft.aiRole.relationshipToUser; },
        setValue: function(v) { draft.aiRole.relationshipToUser = v; }
      }));
      aBody.appendChild(aiRoleCard);

      // 2. 我的角色设定
      var userRoleCard = el('section', 'fc-settings-card');
      var userRoleHead = el('div', 'fc-settings-card-head');
      userRoleHead.appendChild(el('span', 'fc-settings-card-title', '2. 我的角色设定'));
      userRoleHead.appendChild(el('span', 'fc-settings-card-tag', '我的视角'));
      userRoleCard.appendChild(userRoleHead);

      userRoleCard.appendChild(createTextField({
        id: 'fc-ai-user-identity',
        label: '我的身份与背景',
        multiline: true,
        rows: 3,
        maxLength: 1500,
        placeholder: '我在故事中的职业、身份或当前处境……',
        getValue: function() { return draft.userRole.identityBackground; },
        setValue: function(v) { draft.userRole.identityBackground = v; }
      }));
      userRoleCard.appendChild(createTextField({
        id: 'fc-ai-user-personality',
        label: '我的性格',
        multiline: true,
        rows: 2,
        maxLength: 1000,
        placeholder: '例如：直球坦率、有点怕麻烦但重感情……',
        getValue: function() { return draft.userRole.personality; },
        setValue: function(v) { draft.userRole.personality = v; }
      }));
      userRoleCard.appendChild(createTextField({
        id: 'fc-ai-user-relationship-notes',
        label: '我和 AI 角色之间的关系补充',
        multiline: true,
        rows: 2,
        maxLength: 1000,
        placeholder: '双方近期相处默契、隐藏心结或彼此称呼习惯……',
        getValue: function() { return draft.userRole.relationshipNotes; },
        setValue: function(v) { draft.userRole.relationshipNotes = v; }
      }));
      aBody.appendChild(userRoleCard);

      // 3. 剧情设定
      var storyCard = el('section', 'fc-settings-card');
      var storyHead = el('div', 'fc-settings-card-head');
      storyHead.appendChild(el('span', 'fc-settings-card-title', '3. 剧情设定'));
      storyHead.appendChild(el('span', 'fc-settings-card-tag', '世界观与走势'));
      storyCard.appendChild(storyHead);

      storyCard.appendChild(createTextField({
        id: 'fc-ai-story-world',
        label: '故事背景',
        multiline: true,
        rows: 3,
        maxLength: 2000,
        placeholder: '时间地点、世界观设定或故事发生的大环境……',
        getValue: function() { return draft.story.worldBackground; },
        setValue: function(v) { draft.story.worldBackground = v; }
      }));
      storyCard.appendChild(createTextField({
        id: 'fc-ai-story-current',
        label: '当前剧情',
        multiline: true,
        rows: 3,
        maxLength: 2000,
        placeholder: '对话开始前刚刚发生的事或当下所处的节点……',
        getValue: function() { return draft.story.currentPlot; },
        setValue: function(v) { draft.story.currentPlot = v; }
      }));
      storyCard.appendChild(createTextField({
        id: 'fc-ai-story-direction',
        label: '剧情发展方向',
        multiline: true,
        rows: 2,
        maxLength: 1500,
        placeholder: '期待接下来发生的互动氛围、转折或关系推进方向……',
        getValue: function() { return draft.story.plotDirection; },
        setValue: function(v) { draft.story.plotDirection = v; }
      }));
      storyCard.appendChild(createTextField({
        id: 'fc-ai-story-avoid',
        label: '需要避免的剧情内容',
        multiline: true,
        rows: 2,
        maxLength: 1500,
        placeholder: '例如：避免 OOC、避免强行虐恋或特定雷区元素……',
        getValue: function() { return draft.story.avoidContent; },
        setValue: function(v) { draft.story.avoidContent = v; }
      }));
      aBody.appendChild(storyCard);

      // 4. AI 创作偏好
      var prefCard = el('section', 'fc-settings-card');
      var prefHead = el('div', 'fc-settings-card-head');
      prefHead.appendChild(el('span', 'fc-settings-card-title', '4. AI 创作偏好'));
      prefHead.appendChild(el('span', 'fc-settings-card-tag', '表达与节奏'));
      prefCard.appendChild(prefHead);

      var replyLenBlock = el('div', 'fc-ai-pref-block');
      replyLenBlock.appendChild(el('span', 'fc-settings-field-label', '回复长度'));
      var replyLenRow = el('div', 'fc-ai-seg-group');
      replyLenRow.id = 'fc-ai-pref-reply-length';
      var replyLenBtns = [];
      AI_REPLY_LENGTH_OPTIONS.forEach(function(opt) {
        var btn = el('button', 'fc-ai-seg-btn', opt.label);
        btn.type = 'button';
        btn.dataset.replyLength = opt.id;
        btn.onclick = function() {
          draft.preferences.replyLength = opt.id;
          syncPrefControls();
        };
        replyLenBtns.push({ id: opt.id, btn: btn });
        replyLenRow.appendChild(btn);
      });
      replyLenBlock.appendChild(replyLenRow);
      prefCard.appendChild(replyLenBlock);

      var langStyleBlock = el('div', 'fc-ai-pref-block');
      langStyleBlock.appendChild(el('span', 'fc-settings-field-label', '语言风格'));
      var langStyleRow = el('div', 'fc-ai-seg-group');
      langStyleRow.id = 'fc-ai-pref-language-style';
      var langStyleBtns = [];
      AI_LANGUAGE_STYLE_OPTIONS.forEach(function(opt) {
        var btn = el('button', 'fc-ai-seg-btn', opt.label);
        btn.type = 'button';
        btn.dataset.languageStyle = opt.id;
        btn.onclick = function() {
          draft.preferences.languageStyle = opt.id;
          syncPrefControls();
        };
        langStyleBtns.push({ id: opt.id, btn: btn });
        langStyleRow.appendChild(btn);
      });
      langStyleBlock.appendChild(langStyleRow);
      prefCard.appendChild(langStyleBlock);

      var advanceBlock = el('div', 'fc-ai-switch-row');
      var advanceText = el('div', 'fc-ai-switch-copy');
      advanceText.appendChild(el('strong', 'fc-ai-switch-title', '允许 AI 主动推动剧情'));
      advanceText.appendChild(el('span', 'fc-ai-switch-sub', '开启后 AI 可在对话中主动引出新事件或推进场景节奏'));
      var advanceBtn = el('button', 'fc-ai-switch-btn');
      advanceBtn.type = 'button';
      advanceBtn.id = 'fc-ai-pref-advance-plot';
      advanceBtn.setAttribute('role', 'switch');
      advanceBtn.onclick = function() {
        draft.preferences.allowAdvancePlot = !draft.preferences.allowAdvancePlot;
        syncPrefControls();
      };
      advanceBlock.appendChild(advanceText);
      advanceBlock.appendChild(advanceBtn);
      prefCard.appendChild(advanceBlock);

      function syncPrefControls() {
        replyLenBtns.forEach(function(item) {
          var active = draft.preferences.replyLength === item.id;
          item.btn.classList.toggle('is-active', active);
          item.btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        langStyleBtns.forEach(function(item) {
          var active = draft.preferences.languageStyle === item.id;
          item.btn.classList.toggle('is-active', active);
          item.btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        var allow = draft.preferences.allowAdvancePlot !== false;
        advanceBtn.classList.toggle('is-on', allow);
        advanceBtn.setAttribute('aria-checked', allow ? 'true' : 'false');
        advanceBtn.textContent = allow ? '已开启' : '已关闭';
      }

      function syncAllAiFormControls() {
        fieldRegistry.forEach(function(fn) { fn(); });
        syncPrefControls();
      }

      aResetBtn.onclick = function() {
        draft = clone(createDefaultAiSettings(currentCharName()));
        syncAllAiFormControls();
        notify('已恢复默认 AI 设定，点击「保存设定」后生效');
      };

      syncAllAiFormControls();
      aBody.appendChild(prefCard);

      var aFoot = el('div', 'fc-settings-foot');
      var aCancelBtn = el('button', 'fc-chat-btn alt', '取消');
      aCancelBtn.type = 'button';
      aCancelBtn.id = 'fc-ai-settings-cancel';
      aCancelBtn.onclick = closeAiSettingsPanel;

      var aSaveBtn = el('button', 'fc-chat-btn', '保存设定');
      aSaveBtn.type = 'button';
      aSaveBtn.id = 'fc-ai-settings-save';
      aSaveBtn.onclick = function() {
        if (!_state) return;
        _state.aiSettings = getAiSettings(draft, currentCharName());
        var ok = saveState(_state);
        if (!ok) return;
        closeAiSettingsPanel();
        notify('已保存 AI 设定');
      };

      aFoot.appendChild(aCancelBtn);
      aFoot.appendChild(aSaveBtn);

      aiSettingsPanel.appendChild(aHead);
      aiSettingsPanel.appendChild(aBody);
      aiSettingsPanel.appendChild(aFoot);
      aiSettingsPanel.classList.add('show');
      aiSettingsPanel.setAttribute('aria-hidden', 'false');
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

    function toggleRecall(index) {
      var m = unwrapWithdrawIfNeeded(index);
      if (!m || m.type !== 'text') return;
      if (_state.items[index] === m) {
        m.fakeRecall = !m.fakeRecall;
      }
      if (_selectedIndex === index) _selectedIndex = -1;
      saveState(_state);
      renderMessages(false);
      notify(m.fakeRecall ? '已撤回该消息' : '已恢复消息显示');
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
          label: recalled ? '已撤回消息' : '文字消息',
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
        ['✎', '消息工具', function() {
          _state.showTools = !_state.showTools;
          saveState(_state);
          renderMessages(false);
          notify(_state.showTools ? '已展开每条消息快捷工具' : '已收起常驻工具，长按气泡仍可操作');
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
        var recallBtn = el('button', 'fc-chat-mini-btn', '撤回');
        recallBtn.type = 'button';
        recallBtn.onclick = function(e) {
          e.stopPropagation();
          toggleRecall(index);
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
      var visibleCount = 0;

      items.forEach(function(rawItem, index) {
        var item = rawItem;
        if (!item) return;

        // 撤回消息不在聊天界面显示任何气泡或提示文字，底层保留数据供作品管理恢复或改写
        if (item.fakeRecall || item.type === 'withdraw') {
          return;
        }
        visibleCount += 1;

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
          var bubble = el('div', 'fc-chat-bubble');
          bubble.textContent = item.text || '';

          bubble.addEventListener('click', function(e) {
            e.stopPropagation();
            _selectedIndex = _selectedIndex === index ? -1 : index;
            renderMessages(false);
          });

          wrap.appendChild(bubble);
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

      if (visibleCount === 0) {
        var emptyBox = el('div', 'fc-chat-stream-empty');
        emptyBox.appendChild(el('strong', '', '还没有聊天内容'));
        emptyBox.appendChild(el('span', '', '可以在下方输入文字，或点击 ⊕ 更多工具添加图片、表情包、转账、语音与通话卡片'));
        streamEl.appendChild(emptyBox);
      }

      if (_searchQuery && !searchBar.hidden) {
        runMessageSearch(_searchQuery, false);
      }

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
      if (sheetBack.classList.contains('show') || settingsPanel.classList.contains('show') || aiSettingsPanel.classList.contains('show') || menuMask.classList.contains('show') || lightbox.classList.contains('show')) {
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
            onClick: function() { toggleRecall(index); }
          }));
        } else {
          listEl.appendChild(buildMenuActionButton({
            action: 'edit',
            icon: '✎',
            label: '编辑',
            onClick: function() { openEditTextSheet(index); }
          }));
          listEl.appendChild(buildMenuActionButton({
            action: 'recall',
            icon: '↩',
            label: '撤回',
            onClick: function() { toggleRecall(index); }
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
      if (sheetBack.classList.contains('show') || settingsPanel.classList.contains('show') || aiSettingsPanel.classList.contains('show') || menuMask.classList.contains('show') || lightbox.classList.contains('show')) {
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

    searchBtn.addEventListener('click', function() {
      if (searchBar.hidden) openSearchBar();
      else closeSearchBar();
    });

    searchInput.addEventListener('input', function() {
      runMessageSearch(searchInput.value, true);
    });
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        stepSearchMatch(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSearchBar();
      }
    });
    searchPrevBtn.addEventListener('click', function() { stepSearchMatch(-1); });
    searchNextBtn.addEventListener('click', function() { stepSearchMatch(1); });
    searchCloseBtn.addEventListener('click', closeSearchBar);

    menuBtn.addEventListener('click', function() {
      if (menuMask.classList.contains('show')) closeChatMenu();
      else openChatMenu();
    });

    voiceBtn.addEventListener('click', function() {
      closeMessageContextMenu();
      if (_panelMode) setPanelMode('');
      openVoiceSheet();
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
      } else if (aiSettingsPanel.classList.contains('show')) {
        closeAiSettingsPanel();
      } else if (settingsPanel.classList.contains('show')) {
        closeSecondarySettingsPanel();
      } else if (menuMask.classList.contains('show')) {
        closeChatMenu();
      } else if (lightbox.classList.contains('show')) {
        closeLightbox();
      } else if (sheetBack.classList.contains('show')) {
        closeSheet();
      } else if (!searchBar.hidden) {
        closeSearchBar();
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
        } else if (aiSettingsPanel.classList.contains('show') &&
          document.activeElement &&
          aiSettingsPanel.contains(document.activeElement)) {
          try {
            document.activeElement.scrollIntoView({ block: 'nearest' });
          } catch (_) {}
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
