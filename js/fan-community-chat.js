// js/fan-community-chat.js — 同好社区 · 捡手机文学创作模块（任务 03 ~ 任务 06）
// 功能：多作品列表与安全迁移、新建与重命名作品、独立聊天记录、文字/图片/表情包/日期/假撤回、
//       转账卡片、语音消息、语音通话与视频通话卡片、持久化恢复。

(function(global) {
  'use strict';

  var STORAGE_KEY = 'wanwan-phone-messages-v3';
  var WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  var INITIAL_STATE = {
    title: '捡手机文学',
    char: '对方',
    user: '我',
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
  var _playingVoiceIndex = -1;
  var _activeAudio = null;
  var _expandedVoices = Object.create(null);

  function assetsApi() {
    return global.FanCommunityAssets || null;
  }

  function worksApi() {
    return global.FanCommunityWorks || null;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
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
    headActions.appendChild(toolsToggleBtn);

    head.appendChild(backBtn);
    head.appendChild(titleEl);
    head.appendChild(headActions);

    // 消息流
    var streamEl = el('div', 'fc-chat-stream');
    streamEl.id = 'fc-chat-stream';

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

    // 隐藏文件选择器（批量导入表情包）
    var stickerBatchInput = document.createElement('input');
    stickerBatchInput.type = 'file';
    stickerBatchInput.accept = 'image/*';
    stickerBatchInput.multiple = true;
    stickerBatchInput.hidden = true;
    stickerBatchInput.id = 'fc-chat-sticker-batch-input';

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

    app.appendChild(head);
    app.appendChild(streamEl);
    app.appendChild(bottom);
    app.appendChild(stickerBatchInput);
    app.appendChild(sheetBack);
    app.appendChild(lightbox);
    container.appendChild(app);

    function syncRoleButton() {
      var isUser = _sendSide === 'right';
      roleBtn.textContent = (isUser ? '我 · User' : '对方 · Char') + ' ⌄';
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

    function toggleFakeRecall(index) {
      var m = _state.items[index];
      if (!m) return;
      if (m.type === 'withdraw' && m.original) {
        _state.items[index] = Object.assign({}, clone(m.original), { fakeRecall: true });
      } else if (m.type === 'text') {
        m.fakeRecall = !m.fakeRecall;
      } else {
        return;
      }
      saveState(_state);
      renderMessages(false);
      notify(_state.items[index].fakeRecall ? '已设为假撤回状态' : '已恢复消息显示');
    }

    function openRewriteSheet(index) {
      var m = _state.items[index];
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

      // 删除某条消息时保护当前作品与所有其他作品仍在引用的素材（图片 / 表情包 / 音频）
      var api = assetsApi();
      var wApi = worksApi();
      if (api && removed && removed.assetId && !removed.isSticker) {
        var usedLocally = api.isAssetReferenced(removed.assetId, _state.items);
        var usedElsewhere = wApi ? wApi.isAssetReferencedInOtherWorks(removed.assetId, _currentWorkId) : false;
        if (!usedLocally && !usedElsewhere) {
          api.getAsset(removed.assetId).then(function(record) {
            if (!record || record.kind === 'sticker') return;
            var stillLocal = api.isAssetReferenced(removed.assetId, _state.items);
            var stillOther = wApi ? wApi.isAssetReferencedInOtherWorks(removed.assetId, _currentWorkId) : false;
            if (!stillLocal && !stillOther) {
              return api.deleteAsset(removed.assetId);
            }
          }).catch(function() {});
        }
      }
    }

    function openImageSendSheet() {
      var chosenSide = _sendSide;
      var pickedFile = null;
      var pickedDataUrl = '';

      openSheet('发送本地图片', function(body) {
        var sideLabel = el('label', '', '发送身份');
        var sideSelect = document.createElement('select');
        sideSelect.id = 'fc-chat-image-side';
        [
          ['right', '我 · User（右侧）'],
          ['left', '对方 · Char（左侧）']
        ].forEach(function(pair) {
          var opt = document.createElement('option');
          opt.value = pair[0];
          opt.textContent = pair[1];
          sideSelect.appendChild(opt);
        });
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
        ['right', '我 · User（右侧）'],
        ['left', '对方 · Char（左侧）']
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

    async function renderStickerPanel() {
      panelEl.replaceChildren();
      var headRow = el('div', 'fc-chat-panel-head');
      headRow.appendChild(el('span', 'fc-chat-panel-title', '我的表情包'));

      var importBtn = el('button', 'fc-chat-panel-action', '＋ 批量导入');
      importBtn.type = 'button';
      importBtn.id = 'fc-chat-sticker-import-btn';
      importBtn.onclick = function() {
        stickerBatchInput.value = '';
        stickerBatchInput.click();
      };
      headRow.appendChild(importBtn);
      panelEl.appendChild(headRow);

      var grid = el('div', 'fc-chat-stickers');
      panelEl.appendChild(grid);

      var api = assetsApi();
      var stickers = [];
      if (api) {
        try {
          stickers = await api.listAssets('sticker');
        } catch (_) {
          stickers = [];
        }
      }

      if (!stickers.length) {
        grid.appendChild(el('p', 'fc-chat-empty', '还没有表情包，点击右上角或下方 ＋ 从本地批量导入'));
      }

      stickers.forEach(function(sticker) {
        var tile = el('button', 'fc-chat-sticker');
        tile.type = 'button';
        tile.dataset.stickerId = sticker.id;

        var img = document.createElement('img');
        img.src = sticker.src;
        img.alt = sticker.name || '表情包';
        tile.appendChild(img);
        tile.appendChild(el('span', '', sticker.name || '表情包'));

        tile.onclick = function() {
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
        delBtn.onclick = async function(e) {
          e.stopPropagation();
          if (!api) return;
          try {
            var wApi = worksApi();
            var allItems = wApi ? wApi.getAllReferencedItems() : _state.items;
            await api.removeStickerSafely(sticker.id, allItems);
            if (_panelMode === 'emoji') {
              renderStickerPanel();
            }
          } catch (_) {
            notify('删除表情包失败');
          }
        };

        tile.appendChild(delBtn);
        grid.appendChild(tile);
      });

      var plusTile = el('button', 'fc-chat-addsticker', '＋');
      plusTile.type = 'button';
      plusTile.title = '批量导入本地表情包';
      plusTile.onclick = function() {
        stickerBatchInput.value = '';
        stickerBatchInput.click();
      };
      grid.appendChild(plusTile);
    }

    stickerBatchInput.addEventListener('change', async function() {
      var files = Array.prototype.slice.call(stickerBatchInput.files || []);
      if (!files.length) return;
      var api = assetsApi();
      if (!api) return;

      var added = 0;
      var failed = 0;
      for (var i = 0; i < files.length; i++) {
        try {
          var dataUrl = await api.readImageFile(files[i], 6);
          await api.putAsset({
            id: api.uid('stk_'),
            name: files[i].name || '表情包',
            src: dataUrl,
            kind: 'sticker'
          });
          added += 1;
        } catch (_) {
          failed += 1;
        }
      }
      stickerBatchInput.value = '';
      if (_panelMode === 'emoji') {
        renderStickerPanel();
      }
      if (added > 0 && failed === 0) {
        notify('已批量导入 ' + added + ' 个表情包');
      } else if (added > 0) {
        notify('已导入 ' + added + ' 个表情包（' + failed + ' 个文件跳过）');
      } else {
        notify('导入失败，请确认选择的是小于 6MB 的图片');
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

    function resolveMissingAssets(pendingImgs, seq) {
      if (!pendingImgs.length) return;
      var api = assetsApi();
      if (!api) return;

      pendingImgs.forEach(function(entry) {
        api.getAsset(entry.assetId).then(function(record) {
          if (seq !== _activeResolveSeq) return;
          if (!record || !record.src) {
            entry.holder.replaceWith(el('div', 'fc-chat-image-placeholder', entry.alt || '图片素材不可用'));
            return;
          }
          var img = document.createElement('img');
          img.src = record.src;
          img.alt = entry.alt || '聊天图片';
          img.onclick = function(e) {
            e.stopPropagation();
            openLightbox(record.src, entry.alt);
          };
          entry.holder.replaceWith(img);
        }).catch(function() {
          if (seq !== _activeResolveSeq) return;
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
          var noticeText = item.side === 'right' ? '你撤回了一条消息' : '对方撤回了一条消息';
          recallRow.appendChild(el('div', 'fc-chat-recall-notice', noticeText));
          streamEl.appendChild(recallRow);
          return;
        }

        if (item.type === 'date') {
          var dateRow = el('div', 'fc-chat-date');
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
        if (side !== 'right') {
          row.appendChild(el('div', 'fc-chat-avatar'));
        }

        var body = el('div', 'fc-chat-msgbody');
        if (side !== 'right') {
          body.appendChild(el('div', 'fc-chat-name', _state.char || INITIAL_STATE.char));
        }

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
    renderMessages(true);
    requestAnimationFrame(function() {
      streamEl.scrollTop = streamEl.scrollHeight;
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
      _state.showTools = !_state.showTools;
      toolsToggleBtn.classList.toggle('active', Boolean(_state.showTools));
      saveState(_state);
      renderMessages(false);
      notify(_state.showTools ? '已展开每条消息创作工具' : '已收起常驻工具');
    });

    roleBtn.addEventListener('click', function() {
      _sendSide = _sendSide === 'right' ? 'left' : 'right';
      syncRoleButton();
      notify(_sendSide === 'right' ? '当前身份：我 · User' : '当前身份：对方 · Char');
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
      if (_panelMode) setPanelMode('');
      setTimeout(function() {
        streamEl.scrollTop = streamEl.scrollHeight;
      }, 180);
    });

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
    stopVoicePlayback();
    _expandedVoices = Object.create(null);
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
