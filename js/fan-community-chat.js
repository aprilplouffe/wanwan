// js/fan-community-chat.js — 同好社区 · 捡手机文学创作模块（任务 03 + 任务 04）
// 功能：示例消息、文字发送、我/对方切换、本地图片消息（IndexedDB + 放大预览）、
//       批量表情包（IndexedDB + 引用保护）、日期时间分隔、假撤回 / 改写 / 删除、持久化恢复。

(function(global) {
  'use strict';

  var STORAGE_KEY = 'wanwan-phone-messages-v3';
  var WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  var INITIAL_STATE = {
    title: '胸肌很大的那个哨兵',
    char: '胸肌很大的那个哨兵',
    user: '我',
    topic: '一个哨兵误以为自己的精神体被向导偷走了。其实精神体只是太喜欢对方，偷偷跑去找他。',
    join: true,
    showTools: false,
    items: [
      { type: 'date', text: '2061年11月12日 星期六' },
      { type: 'text', side: 'left', text: '你好' },
      { type: 'text', side: 'right', text: '你好' },
      { type: 'text', side: 'right', text: '请问你加我有什么事吗？' },
      { type: 'text', side: 'left', text: '你为什么要抢走我的精神体？' },
      { type: 'text', side: 'right', text: '你是不是认错人了？' },
      { type: 'text', side: 'left', text: '没有，就是你拐走了我的精神体' },
      { type: 'text', side: 'left', text: '你的向导素是茉莉味，我没有认错人' },
      { type: 'text', side: 'right', text: '……' },
      { type: 'text', side: 'left', text: '你什么时候把我的精神体还回来' },
      { type: 'text', side: 'right', text: '不是，你先说清楚，我是什么时候拐走了你的精神体' },
      { type: 'text', side: 'left', text: '你是昨天晚上在训练场花坛边拐走我的精神体的' },
      { type: 'text', side: 'right', text: '还在骗我，那明明是我的精神体' },
      { type: 'text', side: 'left', text: '那个就是我的精神体……' },
      { type: 'text', side: 'right', text: '！！！' },
      { type: 'transfer', side: 'left', amount: '30000', note: '精神疏导费用' },
      { type: 'text', side: 'right', text: '好人，你的疏导费发得也太多了吧' }
    ]
  };

  var _state = null;
  var _sendSide = 'right';
  var _panelMode = ''; // '' | 'emoji' | 'more'
  var _selectedIndex = -1;
  var _cleanupViewport = null;
  var _activeResolveSeq = 0;

  function assetsApi() {
    return global.FanCommunityAssets || null;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function notify(msg) {
    if (typeof global.toast === 'function') {
      global.toast(msg);
    }
  }

  function loadState() {
    var fallback = clone(INITIAL_STATE);
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      var saved = JSON.parse(raw);
      if (saved && typeof saved === 'object' && Array.isArray(saved.items)) {
        if (!saved.title) saved.title = fallback.title;
        if (!saved.char) saved.char = fallback.char;
        if (!saved.user) saved.user = fallback.user;
        return saved;
      }
    } catch (_) {}
    return fallback;
  }

  function saveState(state) {
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
    var onBack = typeof options.onBack === 'function' ? options.onBack : function() {};

    close();
    _state = loadState();
    _sendSide = 'right';
    _panelMode = '';
    _selectedIndex = -1;

    container.replaceChildren();
    var app = el('div', 'fc-chat-app');

    // 顶部栏
    var head = el('header', 'fc-chat-head');
    var backBtn = el('button', 'fc-chat-back');
    backBtn.type = 'button';
    backBtn.setAttribute('aria-label', '返回同好社区');
    backBtn.appendChild(el('span', 'fc-chat-back-chevron', '‹'));
    backBtn.appendChild(el('span', '', '社区'));

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

    function deleteMessageAt(index) {
      if (index < 0 || index >= _state.items.length) return;
      var removed = _state.items.splice(index, 1)[0];
      if (_selectedIndex === index) _selectedIndex = -1;
      else if (_selectedIndex > index) _selectedIndex -= 1;

      saveState(_state);
      renderMessages(false);
      notify('已删除消息');

      // 删除某条消息时保护仍在使用的素材（包括表情包和被其他消息引用的图片）
      var api = assetsApi();
      if (api && removed && removed.assetId && !removed.isSticker) {
        if (!api.isAssetReferenced(removed.assetId, _state.items)) {
          api.getAsset(removed.assetId).then(function(record) {
            if (record && record.kind !== 'sticker' && !api.isAssetReferenced(removed.assetId, _state.items)) {
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

    function renderMorePanel() {
      panelEl.replaceChildren();
      var grid = el('div', 'fc-chat-grid');
      var entries = [
        ['▧', '图片', openImageSendSheet],
        ['♡', '表情包', function() { setPanelMode('emoji'); }],
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
            await api.removeStickerSafely(sticker.id, _state.items);
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
          var card = el('div', 'fc-chat-transfer');
          card.appendChild(el('div', 'fc-chat-transfer-amount', '⇄  ' + (item.amount || '0')));
          card.appendChild(el('div', 'fc-chat-transfer-label', item.note || '转账'));
          card.appendChild(document.createElement('hr'));
          card.appendChild(el('small', '', '转账'));
          body.appendChild(card);
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
      close();
      container.replaceChildren();
      onBack();
    });
  }

  function close() {
    _activeResolveSeq += 1;
    if (typeof _cleanupViewport === 'function') {
      _cleanupViewport();
      _cleanupViewport = null;
    }
  }

  global.FanCommunityChat = {
    STORAGE_KEY: STORAGE_KEY,
    open: open,
    close: close
  };
})(window);
