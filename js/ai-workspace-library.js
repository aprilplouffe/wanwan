// ai-workspace-library.js — 知屿全局资料库（第一阶段：独立基础管理系统）
// 复用现有 AiWorkspaceStorage (WanWanDB) 与 AiWorkspaceProjects.parseUploadedFile，不混入项目来源，不接入 AI 自动注入。
(function(global) {
  'use strict';

  var UI_STATE_KEY = 'wanwan_aiw_library_ui_v1';
  var GLOBAL_CATEGORIES = ['全部文件', 'PDF', 'Word', 'TXT', 'Markdown', 'Excel', 'PowerPoint', '图片', '其他'];

  var _ui = {
    open: false,
    query: '',
    type: '',
    sourceType: '',
    category: '',
    sort: 'time_desc'
  };

  function S() {
    return global.AiWorkspaceStorage;
  }

  function P() {
    return global.AiWorkspaceProjects;
  }

  function notifyToast(msg) {
    if (typeof global.toast === 'function') global.toast(msg);
    else if (typeof global.showToast === 'function') global.showToast(msg);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatTime(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString();
    } catch (_) {
      return '';
    }
  }

  function loadUiState() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(UI_STATE_KEY) : null;
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        _ui.open = !!parsed.open;
        _ui.query = String(parsed.query || '');
        _ui.type = String(parsed.type || '');
        _ui.sourceType = String(parsed.sourceType || '');
        _ui.category = String(parsed.category || '');
        _ui.sort = String(parsed.sort || 'time_desc');
      }
    } catch (_) {}
  }

  function saveUiState() {
    try {
      if (!global.localStorage) return;
      global.localStorage.setItem(UI_STATE_KEY, JSON.stringify(_ui));
    } catch (_) {}
  }

  function shouldRestoreOnLoad() {
    loadUiState();
    return !!_ui.open;
  }

  function closePopoverMenu(page) {
    var root = page || document;
    var existing = root.querySelector('#aiw-lib-popover-menu');
    if (existing) {
      if (typeof existing._cleanup === 'function') existing._cleanup();
      existing.remove();
    }
  }

  function closeLibraryPage(page) {
    if (!page) return;
    closePopoverMenu(page);
    _ui.open = false;
    saveUiState();
    var stage = page.querySelector('#aiw-library-stage');
    if (stage) {
      stage.hidden = true;
      stage.innerHTML = '';
    }
    page.classList.remove('is-library-open');
  }


  function getSourceLabel(sourceType) {
    if (sourceType === 'project') return '来自项目';
    if (sourceType === 'chat') return '来自聊天';
    return '手动上传';
  }

  function renderSourceBadgeHtml(doc) {
    var st = (doc && doc.sourceType) || 'manual';
    var cls = st === 'project' ? 'is-src-project' : (st === 'chat' ? 'is-src-chat' : 'is-src-manual');
    var label = getSourceLabel(st);
    var extra = (doc && Array.isArray(doc.sourceRefs) && doc.sourceRefs.length > 1)
      ? (' +' + (doc.sourceRefs.length - 1))
      : '';
    return '<span class="aiw-lib-src-badge ' + cls + '">' + escapeHtml(label + extra) + '</span>';
  }

  function getFileIconClass(type, category) {
    var c = String(category || '');
    var t = String(type || '').toLowerCase();
    if (c === 'PDF' || t === 'pdf') return 'fa-solid fa-file-pdf';
    if (c === 'Word' || t === 'doc' || t === 'docx') return 'fa-solid fa-file-word';
    if (c === 'Markdown' || t === 'md' || t === 'markdown') return 'fa-solid fa-file-code';
    if (c === 'Excel' || t === 'xls' || t === 'xlsx' || t === 'csv') return 'fa-solid fa-file-excel';
    if (c === 'PowerPoint' || t === 'ppt' || t === 'pptx') return 'fa-solid fa-file-powerpoint';
    if (c === '图片' || t === 'png' || t === 'jpg' || t === 'jpeg' || t === 'webp' || t === 'gif') return 'fa-regular fa-image';
    return 'fa-solid fa-file-lines';
  }

  async function openGlobalDocPreviewModal(page, doc) {
    if (!page || !doc) return;
    if (doc.category === '图片' && doc.fileId && S() && typeof S().getFileAsset === 'function') {
      var imgAsset = await S().getFileAsset(doc.fileId);
      if (imgAsset && imgAsset.rawDataUrl) {
        var imgWrap = document.createElement('div');
        imgWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';
        imgWrap.innerHTML =
          '<div class="aiw-ws-modal aiw-projects-center-modal" role="dialog" aria-modal="true">' +
            '<div class="aiw-ws-modal-head">' +
              '<div class="aiw-ws-modal-title"><i class="fa-regular fa-image" style="color:var(--aiw-pink-deep); margin-right:8px;"></i>' + escapeHtml(doc.name) + '</div>' +
              '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div class="aiw-ws-modal-body" style="text-align:center;">' +
              '<img src="' + escapeHtml(imgAsset.rawDataUrl) + '" alt="' + escapeHtml(doc.name) + '" style="max-width:100%; max-height:58vh; border-radius:12px;">' +
            '</div>' +
            '<div class="aiw-ws-modal-foot"><button type="button" class="aiw-primary-btn" id="aiw-lib-img-close">关闭</button></div>' +
          '</div>';
        page.appendChild(imgWrap);
        imgWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { imgWrap.remove(); });
        imgWrap.querySelector('#aiw-lib-img-close').addEventListener('click', function() { imgWrap.remove(); });
        imgWrap.addEventListener('click', function(e) { if (e.target === imgWrap) imgWrap.remove(); });
        return;
      }
    }
    if (doc.parseStatus === 'failed' || doc.parseStatus === 'unsupported' || !String(doc.content || '').trim()) {
      var errWrap = document.createElement('div');
      errWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';
      errWrap.innerHTML =
        '<div class="aiw-ws-modal aiw-projects-delete-modal" role="dialog" aria-modal="true">' +
          '<div class="aiw-ws-modal-head">' +
            '<div class="aiw-ws-modal-title" style="color:#e11d48;"><i class="fa-solid fa-circle-exclamation" style="margin-right:6px;"></i>无法预览文件</div>' +
            '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div class="aiw-ws-modal-body">' +
            '<p class="aiw-st-modal-msg">文件「<strong>' + escapeHtml(doc.name) + '</strong>」解析失败或无可用文本：' + escapeHtml(doc.parseError || '文件内容为空') + '</p>' +
          '</div>' +
          '<div class="aiw-ws-modal-foot">' +
            '<button type="button" class="aiw-primary-btn" id="aiw-lib-err-close">关闭</button>' +
          '</div>' +
        '</div>';
      page.appendChild(errWrap);
      errWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { errWrap.remove(); });
      errWrap.querySelector('#aiw-lib-err-close').addEventListener('click', function() { errWrap.remove(); });
      errWrap.addEventListener('click', function(e) { if (e.target === errWrap) errWrap.remove(); });
      return;
    }

    var isPdfWithPages = doc.type === 'pdf' && Array.isArray(doc.pages) && doc.pages.length > 0;
    var viewMode = isPdfWithPages ? 'pages' : 'full';
    var currentPageIdx = 0;

    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';

    function renderBody() {
      var bodyEl = modalWrap.querySelector('#aiw-lib-preview-body');
      var modeBar = modalWrap.querySelector('#aiw-lib-pdf-bar');
      if (!bodyEl) return;

      if (isPdfWithPages && modeBar) {
        modeBar.hidden = false;
        var pageText = (doc.pages[currentPageIdx] && doc.pages[currentPageIdx].text) || '（本页无可提取文本）';
        var toggleBtn = modeBar.querySelector('#aiw-lib-pdf-mode-btn');
        var pagerEl = modeBar.querySelector('#aiw-lib-pdf-pager');
        if (toggleBtn) toggleBtn.textContent = viewMode === 'pages' ? '切换全文查看' : '切换分页预览';
        if (pagerEl) pagerEl.hidden = viewMode !== 'pages';
        var pageLabel = modeBar.querySelector('#aiw-lib-pdf-page-label');
        if (pageLabel) pageLabel.textContent = '第 ' + (currentPageIdx + 1) + ' / ' + doc.pages.length + ' 页';
        var prevBtn = modeBar.querySelector('#aiw-lib-pdf-prev');
        var nextBtn = modeBar.querySelector('#aiw-lib-pdf-next');
        if (prevBtn) prevBtn.disabled = currentPageIdx <= 0;
        if (nextBtn) nextBtn.disabled = currentPageIdx >= doc.pages.length - 1;

        bodyEl.textContent = viewMode === 'pages' ? pageText : (doc.content || '');
      } else {
        if (modeBar) modeBar.hidden = true;
        bodyEl.textContent = doc.content || '';
      }
    }

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-center-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title"><i class="' + getFileIconClass(doc.type, doc.category) + '" style="color:var(--aiw-pink-deep); margin-right:8px;"></i>' + escapeHtml(doc.name) + '</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div class="aiw-proj-detail-meta" style="margin-bottom:10px;">' +
            '<span>类型：' + escapeHtml((doc.type || 'txt').toUpperCase()) + '</span>' +
            '<span>大小：' + escapeHtml(formatBytes(doc.size)) + '</span>' +
            '<span>分类：' + escapeHtml(doc.category || '未分类') + '</span>' +
            (doc.pageCount ? ('<span>页数：' + doc.pageCount + ' 页</span>') : '') +
            '<span>上传于：' + escapeHtml(formatTime(doc.createdAt)) + '</span>' +
          '</div>' +
          '<div class="aiw-lib-pdf-bar" id="aiw-lib-pdf-bar" hidden>' +
            '<div class="aiw-lib-pdf-pager" id="aiw-lib-pdf-pager">' +
              '<button type="button" class="aiw-secondary-btn aiw-btn-sm" id="aiw-lib-pdf-prev">上一页</button>' +
              '<span class="aiw-lib-pdf-page-label" id="aiw-lib-pdf-page-label"></span>' +
              '<button type="button" class="aiw-secondary-btn aiw-btn-sm" id="aiw-lib-pdf-next">下一页</button>' +
            '</div>' +
            '<button type="button" class="aiw-secondary-btn aiw-btn-sm" id="aiw-lib-pdf-mode-btn"></button>' +
          '</div>' +
          '<div class="aiw-doc-preview-content" id="aiw-lib-preview-body"></div>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-primary-btn" id="aiw-lib-preview-close">关闭</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);
    renderBody();

    var prevBtn = modalWrap.querySelector('#aiw-lib-pdf-prev');
    var nextBtn = modalWrap.querySelector('#aiw-lib-pdf-next');
    var modeBtn = modalWrap.querySelector('#aiw-lib-pdf-mode-btn');
    if (prevBtn) prevBtn.addEventListener('click', function() { if (currentPageIdx > 0) { currentPageIdx--; renderBody(); } });
    if (nextBtn) nextBtn.addEventListener('click', function() { if (isPdfWithPages && currentPageIdx < doc.pages.length - 1) { currentPageIdx++; renderBody(); } });
    if (modeBtn) modeBtn.addEventListener('click', function() { viewMode = viewMode === 'pages' ? 'full' : 'pages'; renderBody(); });

    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-lib-preview-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });
  }

  function openGlobalDocRenameModal(page, doc, onDone) {
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';
    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-edit-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title">重命名资料</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label" for="aiw-lib-rename-input">文件名称</label>' +
            '<input type="text" class="aiw-field-input" id="aiw-lib-rename-input" value="' + escapeHtml(doc.name || '') + '" maxlength="120">' +
          '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-lib-ren-cancel">取消</button>' +
          '<button type="button" class="aiw-primary-btn" id="aiw-lib-ren-save">保存</button>' +
        '</div>' +
      '</div>';
    page.appendChild(modalWrap);
    var inputEl = modalWrap.querySelector('#aiw-lib-rename-input');
    setTimeout(function() { try { inputEl.focus(); inputEl.select(); } catch (_) {} }, 40);
    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-lib-ren-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });
    modalWrap.querySelector('#aiw-lib-ren-save').addEventListener('click', async function() {
      var clean = (inputEl.value || '').trim();
      if (!clean) {
        notifyToast('文件名不能为空');
        inputEl.focus();
        return;
      }
      await S().renameGlobalDocument(doc.id, clean);
      modalWrap.remove();
      notifyToast('资料已重命名');
      if (typeof onDone === 'function') onDone();
    });
  }

  function openGlobalDocDetailsModal(page, doc, onDone) {
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';
    var catOptions = GLOBAL_CATEGORIES.map(function(cat) {
      var sel = doc.category === cat ? ' selected' : '';
      return '<option value="' + escapeHtml(cat) + '"' + sel + '>' + escapeHtml(cat) + '</option>';
    }).join('');
    var statusText = doc.parseStatus === 'failed'
      ? ('解析失败：' + (doc.parseError || '未知错误'))
      : ('已解析（' + (Array.isArray(doc.chunks) ? doc.chunks.length : 0) + ' 个文本片段）');

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-edit-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title">资料详情</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div class="aiw-lib-detail-kv"><span>文件名称</span><strong>' + escapeHtml(doc.name) + '</strong></div>' +
          '<div class="aiw-lib-detail-kv"><span>原始名称</span><strong>' + escapeHtml(doc.originalName || doc.name) + '</strong></div>' +
          '<div class="aiw-lib-detail-kv"><span>来源类型</span><strong>' + renderSourceBadgeHtml(doc) + '</strong></div>' +
          (doc.sourceChatTitle || doc.sourceChatId ? '<div class="aiw-lib-detail-kv"><span>来源聊天</span><strong>' + escapeHtml((doc.sourceChatTitle || '未命名对话') + (doc.sourceChatId ? (' (' + doc.sourceChatId + ')') : '')) + '</strong></div>' : '') +
          (doc.sourceProjectName || doc.sourceProjectId ? '<div class="aiw-lib-detail-kv"><span>来源项目</span><strong>' + escapeHtml((doc.sourceProjectName || '项目') + (doc.sourceProjectId ? (' (' + doc.sourceProjectId + ')') : '')) + '</strong></div>' : '') +
          '<div class="aiw-lib-detail-kv"><span>访问权限</span><strong>全局资料库（仅归档记录，不自动授权跨项目读取）</strong></div>' +
          '<div class="aiw-lib-detail-kv"><span>文件类型</span><strong>' + escapeHtml((doc.type || 'txt').toUpperCase()) + '</strong></div>' +
          '<div class="aiw-lib-detail-kv"><span>文件大小</span><strong>' + escapeHtml(formatBytes(doc.size)) + '</strong></div>' +
          '<div class="aiw-lib-detail-kv"><span>解析状态</span><strong>' + escapeHtml(statusText) + '</strong></div>' +
          '<div class="aiw-lib-detail-kv"><span>上传时间</span><strong>' + escapeHtml(formatTime(doc.uploadTime || doc.createdAt)) + '</strong></div>' +
          ((Array.isArray(doc.sourceRefs) && doc.sourceRefs.length > 1)
            ? ('<div class="aiw-lib-refs-box"><div class="aiw-form-label" style="margin-bottom:6px;">全部关联来源（' + doc.sourceRefs.length + '）</div>' +
                doc.sourceRefs.map(function(ref) {
                  var refLabel = getSourceLabel(ref.sourceType);
                  var refDesc = ref.projectName ? ('项目「' + ref.projectName + '」') : '';
                  if (ref.chatTitle || ref.chatId) refDesc += (refDesc ? ' · ' : '') + '对话「' + (ref.chatTitle || ref.chatId) + '」';
                  if (!refDesc) refDesc = '资料库直接上传';
                  return '<div class="aiw-lib-ref-item"><span>' + escapeHtml(refLabel) + '</span><span>' + escapeHtml(refDesc) + '</span></div>';
                }).join('') +
              '</div>')
            : '') +
          '<div class="aiw-form-group" style="margin-top:12px;">' +
            '<label class="aiw-form-label" for="aiw-lib-cat-select">文件分类</label>' +
            '<select class="aiw-field-input" id="aiw-lib-cat-select">' + catOptions + '</select>' +
          '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-lib-det-cancel">关闭</button>' +
          '<button type="button" class="aiw-primary-btn" id="aiw-lib-det-save">保存分类</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);
    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-lib-det-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });
    modalWrap.querySelector('#aiw-lib-det-save').addEventListener('click', async function() {
      var cat = modalWrap.querySelector('#aiw-lib-cat-select').value;
      await S().updateGlobalDocumentMeta(doc.id, { category: cat });
      modalWrap.remove();
      notifyToast('分类已更新');
      if (typeof onDone === 'function') onDone();
    });
  }

  function openGlobalDocDeleteModal(page, doc, onDone) {
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';
    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-delete-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title" style="color:#e11d48;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i>删除全局资料</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<p class="aiw-st-modal-msg">确定要删除「<strong>' + escapeHtml(doc.name) + '</strong>」吗？' + ((Array.isArray(doc.sourceChatIds) && doc.sourceChatIds.length > 0) ? ('<br><span style="color:#d97706;">提示：该文件当前关联了 ' + doc.sourceChatIds.length + ' 个对话，删除后可能影响这些对话后续对该文件的访问。</span><br>') : '') + '删除后将同步清理原始内容、解析文本及关联数据，且不可恢复。</p>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-lib-del-cancel">取消</button>' +
          '<button type="button" class="aiw-danger-btn" id="aiw-lib-del-ok">确认删除</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);
    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-lib-del-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });
    modalWrap.querySelector('#aiw-lib-del-ok').addEventListener('click', async function() {
      await S().deleteGlobalDocument(doc.id);
      modalWrap.remove();
      notifyToast('资料已删除');
      if (typeof onDone === 'function') onDone();
    });
  }

  function openDocPopoverMenu(page, doc, triggerEl, onRefresh) {
    closePopoverMenu(page);
    var menu = document.createElement('div');
    menu.id = 'aiw-lib-popover-menu';
    menu.className = 'aiw-proj-popover';
    menu.setAttribute('role', 'menu');
    menu.innerHTML =
      '<button type="button" class="aiw-proj-popover-item" role="menuitem" data-lib-act="preview">' +
        '<i class="fa-solid fa-eye"></i><span>打开预览</span>' +
      '</button>' +
      '<button type="button" class="aiw-proj-popover-item" role="menuitem" data-lib-act="rename">' +
        '<i class="fa-solid fa-pen"></i><span>重命名</span>' +
      '</button>' +
      '<button type="button" class="aiw-proj-popover-item" role="menuitem" data-lib-act="details">' +
        '<i class="fa-solid fa-circle-info"></i><span>详情与分类</span>' +
      '</button>' +
      '<div class="aiw-proj-popover-divider"></div>' +
      '<button type="button" class="aiw-proj-popover-item is-danger" role="menuitem" data-lib-act="delete">' +
        '<i class="fa-regular fa-trash-can"></i><span>删除</span>' +
      '</button>';

    page.appendChild(menu);

    if (triggerEl && typeof triggerEl.getBoundingClientRect === 'function') {
      var pageRect = page.getBoundingClientRect();
      var btnRect = triggerEl.getBoundingClientRect();
      var menuW = menu.offsetWidth || 168;
      var menuH = menu.offsetHeight || 176;
      var left = btnRect.right - pageRect.left - menuW;
      if (left < 8) left = Math.max(8, btnRect.left - pageRect.left);
      if (left + menuW > pageRect.width - 8) left = Math.max(8, pageRect.width - menuW - 8);
      var top = btnRect.bottom - pageRect.top + 6;
      if (top + menuH > pageRect.height - 12) top = Math.max(8, btnRect.top - pageRect.top - menuH - 6);
      menu.style.left = Math.round(left) + 'px';
      menu.style.top = Math.round(top) + 'px';
    }

    function onDocClick(e) {
      if (!menu.contains(e.target) && (!triggerEl || !triggerEl.contains(e.target))) {
        closePopoverMenu(page);
      }
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') closePopoverMenu(page);
    }
    menu._cleanup = function() {
      document.removeEventListener('mousedown', onDocClick, true);
      document.removeEventListener('touchstart', onDocClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
    setTimeout(function() {
      document.addEventListener('mousedown', onDocClick, true);
      document.addEventListener('touchstart', onDocClick, true);
      document.addEventListener('keydown', onKeyDown, true);
    }, 0);

    menu.querySelector('[data-lib-act="preview"]').addEventListener('click', function() {
      closePopoverMenu(page);
      openGlobalDocPreviewModal(page, doc);
    });
    menu.querySelector('[data-lib-act="rename"]').addEventListener('click', function() {
      closePopoverMenu(page);
      openGlobalDocRenameModal(page, doc, onRefresh);
    });
    menu.querySelector('[data-lib-act="details"]').addEventListener('click', function() {
      closePopoverMenu(page);
      openGlobalDocDetailsModal(page, doc, onRefresh);
    });
    menu.querySelector('[data-lib-act="delete"]').addEventListener('click', function() {
      closePopoverMenu(page);
      openGlobalDocDeleteModal(page, doc, onRefresh);
    });
  }

  async function renderLibraryStage(page, opts) {
    if (!page || !S()) return;
    var stage = page.querySelector('#aiw-library-stage');
    if (!stage) return;

    var allDocs = await S().listGlobalDocuments();
    var catCounts = { '全部文件': allDocs.length };
    GLOBAL_CATEGORIES.forEach(function(c) { if (c !== '全部文件') catCounts[c] = 0; });
    allDocs.forEach(function(d) {
      var c = d && d.category ? d.category : '其他';
      if (catCounts[c] === undefined) c = '其他';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });
    var activeCat = _ui.category || '全部文件';
    var filteredDocs = await S().listGlobalDocuments({
      query: _ui.query,
      type: _ui.type,
      sourceType: _ui.sourceType,
      category: activeCat,
      sort: _ui.sort
    });

    var listHtml = '';
    if (allDocs.length === 0) {
      listHtml =
        '<div class="aiw-lib-empty">' +
          '<div class="aiw-lib-empty-icon"><i class="fa-regular fa-folder-open"></i></div>' +
          '<div class="aiw-lib-empty-title">这里是你的资料库</div>' +
          '<div class="aiw-lib-empty-desc">上传文件，整理和管理你的个人知识资料。</div>' +
          '<button type="button" class="aiw-primary-btn" id="aiw-lib-add-empty-btn"><i class="fa-solid fa-plus"></i> 添加资料</button>' +
        '</div>';
    } else if (filteredDocs.length === 0) {
      listHtml =
        '<div class="aiw-lib-empty">' +
          '<div class="aiw-lib-empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>' +
          '<div class="aiw-lib-empty-title">没有匹配的资料文件</div>' +
          '<div class="aiw-lib-empty-desc">尝试清空搜索关键词或调整类型、分类筛选条件。</div>' +
        '</div>';
    } else {
      var mobileCardsHtml =
        '<div class="aiw-lib-list aiw-lib-mobile-only">' +
          filteredDocs.map(function(doc) {
            var isFailed = doc.parseStatus === 'failed';
            var isUnsupported = doc.parseStatus === 'unsupported';
            var statusCls = isFailed ? 'is-failed' : (isUnsupported ? 'is-unsupported' : 'is-parsed');
            var statusLabel = isFailed ? '解析失败' : (isUnsupported ? '暂不支持解析' : '已解析');
            return (
              '<div class="aiw-lib-row" data-lib-doc-id="' + escapeHtml(doc.id) + '">' +
                '<div class="aiw-lib-row-main">' +
                  '<div class="aiw-lib-row-icon"><i class="' + getFileIconClass(doc.type, doc.category) + '"></i></div>' +
                  '<div class="aiw-lib-row-info">' +
                    '<div class="aiw-lib-row-title" title="' + escapeHtml(doc.name) + '">' + escapeHtml(doc.name) + '</div>' +
                    '<div class="aiw-lib-row-meta">' +
                      renderSourceBadgeHtml(doc) +
                      '<span class="aiw-lib-badge">' + escapeHtml((doc.type || 'txt').toUpperCase()) + '</span>' +
                      '<span>' + escapeHtml(formatBytes(doc.size)) + '</span>' +
                      '<span>' + escapeHtml(formatTime(doc.createdAt)) + '</span>' +
                      '<span class="aiw-lib-status ' + statusCls + '">' + statusLabel + '</span>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                '<button type="button" class="aiw-icon-btn aiw-lib-more-btn" data-lib-more="' + escapeHtml(doc.id) + '" aria-label="文件操作"><i class="fa-solid fa-ellipsis"></i></button>' +
              '</div>'
            );
          }).join('') +
        '</div>';

      var desktopTableHtml =
        '<div class="aiw-lib-table-wrap aiw-lib-desktop-only">' +
          '<table class="aiw-lib-table">' +
            '<thead>' +
              '<tr>' +
                '<th>文件名称</th>' +
                '<th>类型</th>' +
                '<th>大小</th>' +
                '<th>来源</th>' +
                '<th>上传时间</th>' +
                '<th>解析状态</th>' +
                '<th style="text-align:right;">操作</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' +
              filteredDocs.map(function(doc) {
                var isFailed = doc.parseStatus === 'failed';
                var isUnsupported = doc.parseStatus === 'unsupported';
                var statusCls = isFailed ? 'is-failed' : (isUnsupported ? 'is-unsupported' : 'is-parsed');
                var statusLabel = isFailed ? '解析失败' : (isUnsupported ? '暂不支持解析' : '已解析');
                return (
                  '<tr class="aiw-lib-table-row" data-lib-doc-id="' + escapeHtml(doc.id) + '">' +
                    '<td class="aiw-lib-td-name">' +
                      '<div class="aiw-lib-td-name-inner">' +
                        '<span class="aiw-lib-td-ic"><i class="' + getFileIconClass(doc.type, doc.category) + '"></i></span>' +
                        '<span class="aiw-lib-td-title" title="' + escapeHtml(doc.name) + '">' + escapeHtml(doc.name) + '</span>' +
                      '</div>' +
                    '</td>' +
                    '<td><span class="aiw-lib-badge">' + escapeHtml((doc.type || 'txt').toUpperCase()) + '</span></td>' +
                    '<td class="aiw-lib-td-muted">' + escapeHtml(formatBytes(doc.size)) + '</td>' +
                    '<td>' + renderSourceBadgeHtml(doc) + '</td>' +
                    '<td class="aiw-lib-td-muted">' + escapeHtml(formatTime(doc.createdAt)) + '</td>' +
                    '<td><span class="aiw-lib-status ' + statusCls + '">' + statusLabel + '</span></td>' +
                    '<td class="aiw-lib-td-act"><button type="button" class="aiw-icon-btn aiw-lib-more-btn" data-lib-more="' + escapeHtml(doc.id) + '" aria-label="文件操作"><i class="fa-solid fa-ellipsis"></i></button></td>' +
                  '</tr>'
                );
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>';

      listHtml = mobileCardsHtml + desktopTableHtml;
    }

    var catTabsHtml = GLOBAL_CATEGORIES.map(function(cat) {
      var isAct = activeCat === cat ? ' active' : '';
      var cnt = catCounts[cat] || 0;
      return '<button type="button" class="aiw-lib-cat-tab' + isAct + '" data-lib-cat-tab="' + escapeHtml(cat) + '">' + escapeHtml(cat) + ' <span>' + cnt + '</span></button>';
    }).join('');

    var sideCatItemsHtml = GLOBAL_CATEGORIES.map(function(cat) {
      var isAct = activeCat === cat ? ' active' : '';
      var cnt = catCounts[cat] || 0;
      return (
        '<button type="button" class="aiw-lib-side-item' + isAct + '" data-lib-cat-tab="' + escapeHtml(cat) + '">' +
          '<span class="aiw-lib-side-label">' + escapeHtml(cat) + '</span>' +
          '<span class="aiw-lib-side-count">' + cnt + '</span>' +
        '</button>'
      );
    }).join('');

    stage.innerHTML =
      '<div class="aiw-lib-wrap">' +
        '<div class="aiw-lib-layout">' +
          '<aside class="aiw-lib-side-nav" aria-label="资料分类">' +
            '<div class="aiw-lib-side-head">' +
              '<button type="button" class="aiw-circle-btn" id="aiw-lib-side-back-btn" title="返回对话" aria-label="返回对话"><i class="fa-solid fa-arrow-left"></i></button>' +
              '<span class="aiw-lib-side-title">文件分类</span>' +
            '</div>' +
            '<div class="aiw-lib-side-list">' + sideCatItemsHtml + '</div>' +
          '</aside>' +
          '<div class="aiw-lib-main">' +
            '<div class="aiw-lib-header">' +
              '<div class="aiw-lib-header-left">' +
                '<button type="button" class="aiw-circle-btn aiw-lib-mobile-back" id="aiw-lib-back-btn" title="返回对话" aria-label="返回对话"><i class="fa-solid fa-arrow-left"></i></button>' +
                '<div class="aiw-lib-titles">' +
                  '<h2 class="aiw-lib-title">资料库</h2>' +
                  '<div class="aiw-lib-subtitle">管理你的文件和知识资料</div>' +
                '</div>' +
              '</div>' +
              '<div class="aiw-lib-header-actions">' +
                '<input type="file" id="aiw-lib-file-input" multiple style="display:none;">' +
                '<button type="button" class="aiw-primary-btn aiw-btn-sm" id="aiw-lib-add-btn"><i class="fa-solid fa-plus"></i> 添加资料</button>' +
              '</div>' +
            '</div>' +

            '<div class="aiw-lib-upload-status" id="aiw-lib-upload-status" hidden></div>' +

            '<div class="aiw-lib-cat-nav" role="tablist">' + catTabsHtml + '</div>' +
            '<div class="aiw-lib-toolbar">' +
              '<div class="aiw-search-box aiw-lib-search">' +
                '<i class="fa-solid fa-magnifying-glass"></i>' +
                '<input type="search" id="aiw-lib-search-input" value="' + escapeHtml(_ui.query) + '" placeholder="按文件名称搜索..." aria-label="搜索资料">' +
              '</div>' +
              '<div class="aiw-lib-filters">' +
                '<select class="aiw-ph-sort-select" id="aiw-lib-type-filter" aria-label="文件类型筛选">' +
                  '<option value=""' + (_ui.type === '' ? ' selected' : '') + '>全部类型</option>' +
                  '<option value="pdf"' + (_ui.type === 'pdf' ? ' selected' : '') + '>PDF</option>' +
                  '<option value="docx"' + (_ui.type === 'docx' ? ' selected' : '') + '>DOCX</option>' +
                  '<option value="txt"' + (_ui.type === 'txt' ? ' selected' : '') + '>TXT</option>' +
                  '<option value="md"' + (_ui.type === 'md' ? ' selected' : '') + '>Markdown</option>' +
                  '<option value="xlsx"' + (_ui.type === 'xlsx' ? ' selected' : '') + '>Excel</option>' +
                  '<option value="pptx"' + (_ui.type === 'pptx' ? ' selected' : '') + '>PowerPoint</option>' +
                '</select>' +
                '<select class="aiw-ph-sort-select" id="aiw-lib-source-filter" aria-label="来源筛选">' +
                  '<option value=""' + (_ui.sourceType === '' ? ' selected' : '') + '>全部来源</option>' +
                  '<option value="manual"' + (_ui.sourceType === 'manual' ? ' selected' : '') + '>手动上传</option>' +
                  '<option value="chat"' + (_ui.sourceType === 'chat' ? ' selected' : '') + '>来自聊天</option>' +
                  '<option value="project"' + (_ui.sourceType === 'project' ? ' selected' : '') + '>来自项目</option>' +
                '</select>' +
                '<select class="aiw-ph-sort-select" id="aiw-lib-sort-select" aria-label="排序方式">' +
                  '<option value="time_desc"' + (_ui.sort === 'time_desc' ? ' selected' : '') + '>最新上传</option>' +
                  '<option value="time_asc"' + (_ui.sort === 'time_asc' ? ' selected' : '') + '>最早上传</option>' +
                  '<option value="name_asc"' + (_ui.sort === 'name_asc' ? ' selected' : '') + '>名称排序</option>' +
                  '<option value="size_desc"' + (_ui.sort === 'size_desc' ? ' selected' : '') + '>大小排序</option>' +
                '</select>' +
              '</div>' +
            '</div>' +

            '<div class="aiw-lib-body">' + listHtml + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    var backBtn = stage.querySelector('#aiw-lib-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        closeLibraryPage(page);
        if (opts && typeof opts.onBack === 'function') opts.onBack();
      });
    }
    var sideBackBtn = stage.querySelector('#aiw-lib-side-back-btn');
    if (sideBackBtn) {
      sideBackBtn.addEventListener('click', function() {
        closeLibraryPage(page);
        if (opts && typeof opts.onBack === 'function') opts.onBack();
      });
    }
    var srcSel = stage.querySelector('#aiw-lib-source-filter');
    if (srcSel) {
      srcSel.addEventListener('change', function() {
        _ui.sourceType = srcSel.value || '';
        saveUiState();
        renderLibraryStage(page, opts);
      });
    }

    var searchInput = stage.querySelector('#aiw-lib-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        _ui.query = searchInput.value || '';
        saveUiState();
        renderLibraryStage(page, opts);
      });
    }

    var typeSel = stage.querySelector('#aiw-lib-type-filter');
    if (typeSel) {
      typeSel.addEventListener('change', function() {
        _ui.type = typeSel.value || '';
        saveUiState();
        renderLibraryStage(page, opts);
      });
    }

    stage.querySelectorAll('[data-lib-cat-tab]').forEach(function(tabBtn) {
      tabBtn.addEventListener('click', function() {
        _ui.category = tabBtn.getAttribute('data-lib-cat-tab') || '全部文件';
        saveUiState();
        renderLibraryStage(page, opts);
      });
    });

    var sortSel = stage.querySelector('#aiw-lib-sort-select');
    if (sortSel) {
      sortSel.addEventListener('change', function() {
        _ui.sort = sortSel.value || 'time_desc';
        saveUiState();
        renderLibraryStage(page, opts);
      });
    }

    var fileInput = stage.querySelector('#aiw-lib-file-input');
    var addBtn = stage.querySelector('#aiw-lib-add-btn');
    var addEmptyBtn = stage.querySelector('#aiw-lib-add-empty-btn');
    if (fileInput) {
      if (addBtn) addBtn.addEventListener('click', function() { fileInput.click(); });
      if (addEmptyBtn) addEmptyBtn.addEventListener('click', function() { fileInput.click(); });
      fileInput.addEventListener('change', async function() {
        var files = fileInput.files;
        if (!files || files.length === 0) return;
        var statusBar = stage.querySelector('#aiw-lib-upload-status');
        var okCount = 0;
        var errors = [];
        var parser = P() && typeof P().parseUploadedFile === 'function' ? P().parseUploadedFile : null;
        if (!parser) {
          notifyToast('文件解析模块未就绪');
          return;
        }

        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          if (statusBar) {
            statusBar.hidden = false;
            statusBar.textContent = '正在解析 (' + (i + 1) + '/' + files.length + ')：' + (f && f.name ? f.name : '文件') + '...';
          }
          try {
            await S().archiveChatFileToGlobalLibrary(f, { userId: 'local_user' });
            okCount++;
          } catch (err) {
            errors.push((f && f.name ? f.name : '文件') + '：' + (err && err.message ? err.message : '解析失败'));
          }
        }

        fileInput.value = '';
        if (statusBar) {
          statusBar.hidden = true;
          statusBar.textContent = '';
        }
        if (okCount > 0) notifyToast('成功上传并解析 ' + okCount + ' 份全局资料');
        if (errors.length > 0) notifyToast('导入失败：' + errors[0]);
        renderLibraryStage(page, opts);
      });
    }

    stage.querySelectorAll('[data-lib-doc-id]').forEach(function(row) {
      row.addEventListener('click', async function(e) {
        if (e.target.closest('.aiw-lib-more-btn')) return;
        var did = row.getAttribute('data-lib-doc-id');
        var doc = await S().getGlobalDocument(did);
        if (doc) openGlobalDocPreviewModal(page, doc);
      });
    });

    stage.querySelectorAll('[data-lib-more]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var did = btn.getAttribute('data-lib-more');
        var doc = await S().getGlobalDocument(did);
        if (doc) {
          openDocPopoverMenu(page, doc, btn, function() {
            renderLibraryStage(page, opts);
          });
        }
      });
    });
  }

  async function openLibraryPage(page, opts) {
    if (!page) return;
    loadUiState();
    _ui.open = true;
    saveUiState();

    var stage = page.querySelector('#aiw-library-stage');
    if (!stage) return;
    stage.hidden = false;
    page.classList.add('is-library-open');
    await renderLibraryStage(page, opts || {});
  }

  global.AiWorkspaceLibrary = {
    openLibraryPage: openLibraryPage,
    closeLibraryPage: closeLibraryPage,
    shouldRestoreOnLoad: shouldRestoreOnLoad,
    openGlobalDocPreviewModal: openGlobalDocPreviewModal
  };

})(typeof window !== 'undefined' ? window : globalThis);
