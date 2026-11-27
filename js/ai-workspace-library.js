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
    tag: '',
    timeRange: '',
    sort: 'time_desc',
    selectMode: false,
    selectedIds: []
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
        _ui.tag = String(parsed.tag || '');
        _ui.timeRange = String(parsed.timeRange || '');
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

  function renderDocTagsHtml(doc) {
    var tags = (doc && Array.isArray(doc.tags)) ? doc.tags : [];
    if (!tags.length) return '';
    return '<div class="aiw-lib-tags-row">' + tags.slice(0, 4).map(function(t) {
      return '<span class="aiw-lib-tag-chip"><i class="fa-solid fa-tag"></i>' + escapeHtml(t) + '</span>';
    }).join('') + (tags.length > 4 ? ('<span class="aiw-lib-tag-chip is-more">+' + (tags.length - 4) + '</span>') : '') + '</div>';
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

  async function openGlobalDocDetailsModal(page, doc, onDone) {
    var allTags = (S() && typeof S().listGlobalTags === 'function') ? await S().listGlobalTags() : [];
    var docTagsLower = (Array.isArray(doc.tags) ? doc.tags : []).map(function(t) { return String(t || '').toLowerCase(); });
    var tagChecksHtml = allTags.length > 0
      ? '<div class="aiw-lib-tag-check-grid">' + allTags.map(function(t) {
          var checked = docTagsLower.indexOf(t.name.toLowerCase()) !== -1 ? ' checked' : '';
          return '<label class="aiw-lib-tag-check"><input type="checkbox" value="' + escapeHtml(t.name) + '"' + checked + '><span>' + escapeHtml(t.name) + '</span></label>';
        }).join('') + '</div>'
      : '<div style="font-size:12px; color:#6b7280;">暂无自定义标签，可在「管理标签」中新建</div>';
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
          '<div class="aiw-form-group" style="margin-top:10px;">' +
            '<label class="aiw-form-label">自定义标签</label>' +
            tagChecksHtml +
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
      var selectedTags = [];
      modalWrap.querySelectorAll('.aiw-lib-tag-check input[type="checkbox"]:checked').forEach(function(cb) {
        if (cb.value) selectedTags.push(cb.value);
      });
      await S().updateGlobalDocumentMeta(doc.id, { category: cat, tags: selectedTags });
      modalWrap.remove();
      notifyToast('资料分类与标签已更新');
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

  async function openGlobalTagManagerModal(page, onDone) {
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';

    async function renderTagList() {
      var tags = (S() && typeof S().listGlobalTags === 'function') ? await S().listGlobalTags() : [];
      var listEl = modalWrap.querySelector('#aiw-lib-tag-mgr-list');
      if (!listEl) return;
      if (!tags.length) {
        listEl.innerHTML = '<div style="font-size:13px; color:#6b7280; padding:12px 0;">暂无自定义标签</div>';
        return;
      }
      listEl.innerHTML = tags.map(function(t) {
        return (
          '<div class="aiw-lib-tag-mgr-row" data-tag-id="' + escapeHtml(t.id) + '" data-tag-name="' + escapeHtml(t.name) + '">' +
            '<span class="aiw-lib-tag-chip"><i class="fa-solid fa-tag"></i>' + escapeHtml(t.name) + '</span>' +
            '<div class="aiw-lib-tag-mgr-acts">' +
              '<button type="button" class="aiw-secondary-btn aiw-btn-sm" data-tag-act="rename">重命名</button>' +
              '<button type="button" class="aiw-danger-btn aiw-btn-sm" data-tag-act="delete">删除</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      listEl.querySelectorAll('[data-tag-act="rename"]').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var row = btn.closest('[data-tag-id]');
          var oldName = row.getAttribute('data-tag-name') || '';
          var nextName = window.prompt('输入新的标签名称：', oldName);
          if (nextName === null) return;
          var clean = String(nextName).trim();
          if (!clean) { notifyToast('标签名称不能为空'); return; }
          try {
            await S().renameGlobalTag(oldName, clean);
            if (_ui.tag && _ui.tag.toLowerCase() === oldName.toLowerCase()) {
              _ui.tag = clean;
              saveUiState();
            }
            notifyToast('标签已重命名');
            await renderTagList();
            if (typeof onDone === 'function') onDone();
          } catch (err) {
            notifyToast((err && err.message) || '重命名失败');
          }
        });
      });

      listEl.querySelectorAll('[data-tag-act="delete"]').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var row = btn.closest('[data-tag-id]');
          var tName = row.getAttribute('data-tag-name') || '';
          await S().deleteGlobalTag(tName);
          if (_ui.tag && _ui.tag.toLowerCase() === tName.toLowerCase()) {
            _ui.tag = '';
            saveUiState();
          }
          notifyToast('已删除标签「' + tName + '」（不会删除文件本身）');
          await renderTagList();
          if (typeof onDone === 'function') onDone();
        });
      });
    }

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-edit-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title"><i class="fa-solid fa-tags" style="color:var(--aiw-pink-deep); margin-right:6px;"></i>管理自定义标签</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div style="display:flex; gap:8px; margin-bottom:12px;">' +
            '<input type="text" class="aiw-field-input" id="aiw-lib-new-tag-input" placeholder="输入新标签名称（如：学习资料）" maxlength="32">' +
            '<button type="button" class="aiw-primary-btn aiw-btn-sm" id="aiw-lib-new-tag-btn" style="flex-shrink:0;">新建</button>' +
          '</div>' +
          '<div style="font-size:12px; color:#6b7280; margin-bottom:8px;">提示：标签与文件格式分类相互独立，删除标签不会删除文件本身。</div>' +
          '<div class="aiw-lib-tag-mgr-list" id="aiw-lib-tag-mgr-list"></div>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-primary-btn" id="aiw-lib-tag-mgr-close">完成</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);
    await renderTagList();

    var addInput = modalWrap.querySelector('#aiw-lib-new-tag-input');
    modalWrap.querySelector('#aiw-lib-new-tag-btn').addEventListener('click', async function() {
      var val = (addInput.value || '').trim();
      if (!val) { notifyToast('请输入标签名称'); addInput.focus(); return; }
      await S().createGlobalTag(val);
      addInput.value = '';
      notifyToast('已新建标签：' + val);
      await renderTagList();
      if (typeof onDone === 'function') onDone();
    });
    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-lib-tag-mgr-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });
  }

  async function openBatchTagModal(page, selectedIds, onDone) {
    if (!selectedIds || !selectedIds.length) return;
    var tags = (S() && typeof S().listGlobalTags === 'function') ? await S().listGlobalTags() : [];
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';

    var tagChecks = tags.map(function(t) {
      return '<label class="aiw-lib-tag-check"><input type="checkbox" value="' + escapeHtml(t.name) + '"><span>' + escapeHtml(t.name) + '</span></label>';
    }).join('');

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-edit-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title">批量管理标签（已选 ' + selectedIds.length + ' 项）</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label">操作方式</label>' +
            '<select class="aiw-field-input" id="aiw-lib-batch-tag-mode">' +
              '<option value="add">批量添加选中标签</option>' +
              '<option value="remove">批量移除选中标签</option>' +
            '</select>' +
          '</div>' +
          '<div class="aiw-form-group" style="margin-top:10px;">' +
            '<label class="aiw-form-label">选择标签</label>' +
            '<div class="aiw-lib-tag-check-grid">' + (tagChecks || '<span style="font-size:12px; color:#6b7280;">暂无标签</span>') + '</div>' +
          '</div>' +
          '<div class="aiw-form-group" style="margin-top:10px;">' +
            '<label class="aiw-form-label" for="aiw-lib-batch-new-tag">或直接输入新标签（仅添加模式）</label>' +
            '<input type="text" class="aiw-field-input" id="aiw-lib-batch-new-tag" placeholder="可选：输入新标签名称" maxlength="32">' +
          '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-lib-btag-cancel">取消</button>' +
          '<button type="button" class="aiw-primary-btn" id="aiw-lib-btag-ok">应用到选中文件</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);
    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-lib-btag-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });
    modalWrap.querySelector('#aiw-lib-btag-ok').addEventListener('click', async function() {
      var mode = modalWrap.querySelector('#aiw-lib-batch-tag-mode').value;
      var picked = [];
      modalWrap.querySelectorAll('.aiw-lib-tag-check input[type="checkbox"]:checked').forEach(function(cb) {
        if (cb.value) picked.push(cb.value);
      });
      var newTagVal = (modalWrap.querySelector('#aiw-lib-batch-new-tag').value || '').trim();
      if (mode === 'add' && newTagVal) picked.push(newTagVal);
      if (!picked.length) {
        notifyToast('请至少选择一个标签');
        return;
      }
      if (mode === 'remove') {
        await S().batchUpdateGlobalDocumentTags(selectedIds, { removeTags: picked });
        notifyToast('已从 ' + selectedIds.length + ' 份资料移除标签');
      } else {
        await S().batchUpdateGlobalDocumentTags(selectedIds, { addTags: picked });
        notifyToast('已为 ' + selectedIds.length + ' 份资料添加标签');
      }
      modalWrap.remove();
      if (typeof onDone === 'function') onDone();
    });
  }

  function openBatchDeleteModal(page, selectedDocs, onDone) {
    if (!selectedDocs || !selectedDocs.length) return;
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';
    var previewNames = selectedDocs.slice(0, 5).map(function(d) { return '「' + escapeHtml(d.name) + '」'; }).join('、');
    if (selectedDocs.length > 5) previewNames += ' 等共 ' + selectedDocs.length + ' 份文件';

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-delete-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title" style="color:#e11d48;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i>批量删除全局资料</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<p class="aiw-st-modal-msg">确定要删除选中的 <strong>' + selectedDocs.length + '</strong> 份全局资料（' + previewNames + '）吗？<br>删除后将同步清理原始内容、解析索引与缓存，AI 将无法继续读取这些资料，且不可恢复。</p>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-lib-bdel-cancel">取消</button>' +
          '<button type="button" class="aiw-danger-btn" id="aiw-lib-bdel-ok">确认批量删除</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);
    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-lib-bdel-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });
    modalWrap.querySelector('#aiw-lib-bdel-ok').addEventListener('click', async function() {
      var ids = selectedDocs.map(function(d) { return d.id; });
      await S().batchDeleteGlobalDocuments(ids);
      modalWrap.remove();
      notifyToast('已批量删除 ' + ids.length + ' 份资料');
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
    var allTags = (S() && typeof S().listGlobalTags === 'function') ? await S().listGlobalTags() : [];
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
      tag: _ui.tag,
      timeRange: _ui.timeRange,
      sort: _ui.sort
    });
    var validDocIdSet = {};
    filteredDocs.forEach(function(d) { validDocIdSet[d.id] = true; });
    _ui.selectedIds = (_ui.selectedIds || []).filter(function(id) { return !!validDocIdSet[id]; });
    var selectedMap = {};
    _ui.selectedIds.forEach(function(id) { selectedMap[id] = true; });
    var allSelected = filteredDocs.length > 0 && _ui.selectedIds.length === filteredDocs.length;

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
            var isSel = !!selectedMap[doc.id];
            var chkHtml = _ui.selectMode
              ? '<input type="checkbox" class="aiw-lib-checkbox" data-lib-select="' + escapeHtml(doc.id) + '"' + (isSel ? ' checked' : '') + ' aria-label="选择文件">'
              : '';
            return (
              '<div class="aiw-lib-row' + (isSel ? ' is-selected' : '') + '" data-lib-doc-id="' + escapeHtml(doc.id) + '">' +
                '<div class="aiw-lib-row-main">' +
                  chkHtml +
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
                    renderDocTagsHtml(doc) +
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
                (_ui.selectMode ? '<th style="width:36px;"><input type="checkbox" class="aiw-lib-checkbox" id="aiw-lib-table-select-all"' + (allSelected ? ' checked' : '') + ' aria-label="全选"></th>' : '') +
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
                var isSelRow = !!selectedMap[doc.id];
                return (
                  '<tr class="aiw-lib-table-row' + (isSelRow ? ' is-selected' : '') + '" data-lib-doc-id="' + escapeHtml(doc.id) + '">' +
                    (_ui.selectMode ? '<td><input type="checkbox" class="aiw-lib-checkbox" data-lib-select="' + escapeHtml(doc.id) + '"' + (isSelRow ? ' checked' : '') + ' aria-label="选择文件"></td>' : '') +
                    '<td class="aiw-lib-td-name">' +
                      '<div class="aiw-lib-td-name-inner">' +
                        '<span class="aiw-lib-td-ic"><i class="' + getFileIconClass(doc.type, doc.category) + '"></i></span>' +
                        '<div>' +
                          '<div class="aiw-lib-td-title" title="' + escapeHtml(doc.name) + '">' + escapeHtml(doc.name) + '</div>' +
                          renderDocTagsHtml(doc) +
                        '</div>' +
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
                '<button type="button" class="aiw-secondary-btn aiw-btn-sm" id="aiw-lib-tags-btn"><i class="fa-solid fa-tags"></i> 管理标签</button>' +
                '<button type="button" class="aiw-secondary-btn aiw-btn-sm' + (_ui.selectMode ? ' is-active' : '') + '" id="aiw-lib-batch-toggle"><i class="fa-regular fa-square-check"></i> ' + (_ui.selectMode ? '退出多选' : '批量管理') + '</button>' +
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
                '<select class="aiw-ph-sort-select" id="aiw-lib-tag-filter" aria-label="标签筛选">' +
                  '<option value=""' + (_ui.tag === '' ? ' selected' : '') + '>全部标签</option>' + allTags.map(function(t) { var sel = _ui.tag.toLowerCase() === t.name.toLowerCase() ? ' selected' : ''; return '<option value="' + escapeHtml(t.name) + '"' + sel + '>' + escapeHtml(t.name) + '</option>'; }).join('') +
                '</select>' +
                '<select class="aiw-ph-sort-select" id="aiw-lib-source-filter" aria-label="来源筛选">' +
                  '<option value=""' + (_ui.sourceType === '' ? ' selected' : '') + '>全部来源</option>' +
                  '<option value="manual"' + (_ui.sourceType === 'manual' ? ' selected' : '') + '>手动上传</option>' +
                  '<option value="chat"' + (_ui.sourceType === 'chat' ? ' selected' : '') + '>来自聊天</option>' +
                  '<option value="project"' + (_ui.sourceType === 'project' ? ' selected' : '') + '>来自项目</option>' +
                '</select>' +
                '<select class="aiw-ph-sort-select" id="aiw-lib-time-filter" aria-label="上传时间筛选">' +
                  '<option value=""' + (_ui.timeRange === '' ? ' selected' : '') + '>全部时间</option>' +
                  '<option value="today"' + (_ui.timeRange === 'today' ? ' selected' : '') + '>今天</option>' +
                  '<option value="7d"' + (_ui.timeRange === '7d' ? ' selected' : '') + '>近 7 天</option>' +
                  '<option value="30d"' + (_ui.timeRange === '30d' ? ' selected' : '') + '>近 30 天</option>' +
                '</select>' +
                '<select class="aiw-ph-sort-select" id="aiw-lib-sort-select" aria-label="排序方式">' +
                  '<option value="time_desc"' + (_ui.sort === 'time_desc' ? ' selected' : '') + '>最新上传</option>' +
                  '<option value="time_asc"' + (_ui.sort === 'time_asc' ? ' selected' : '') + '>最早上传</option>' +
                  '<option value="name_asc"' + (_ui.sort === 'name_asc' ? ' selected' : '') + '>名称排序</option>' +
                  '<option value="size_desc"' + (_ui.sort === 'size_desc' ? ' selected' : '') + '>大小排序</option>' +
                '</select>' +
              '</div>' +
            '</div>' +

            (_ui.selectMode
              ? ('<div class="aiw-lib-batch-bar">' +
                  '<div class="aiw-lib-batch-left">' +
                    '<button type="button" class="aiw-secondary-btn aiw-btn-sm" id="aiw-lib-select-all-btn">' + (allSelected ? '取消全选' : '全选') + '</button>' +
                    '<span class="aiw-lib-batch-count">已选 <strong>' + _ui.selectedIds.length + '</strong> / ' + filteredDocs.length + ' 项</span>' +
                  '</div>' +
                  '<div class="aiw-lib-batch-right">' +
                    '<button type="button" class="aiw-secondary-btn aiw-btn-sm" id="aiw-lib-batch-tag-btn"' + (_ui.selectedIds.length ? '' : ' disabled') + '><i class="fa-solid fa-tag"></i> 批量改标签</button>' +
                    '<button type="button" class="aiw-danger-btn aiw-btn-sm" id="aiw-lib-batch-del-btn"' + (_ui.selectedIds.length ? '' : ' disabled') + '><i class="fa-regular fa-trash-can"></i> 批量删除</button>' +
                  '</div>' +
                '</div>')
              : '') +
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

    var tagsMgrBtn = stage.querySelector('#aiw-lib-tags-btn');
    if (tagsMgrBtn) {
      tagsMgrBtn.addEventListener('click', function() {
        openGlobalTagManagerModal(page, function() { renderLibraryStage(page, opts); });
      });
    }

    var batchToggleBtn = stage.querySelector('#aiw-lib-batch-toggle');
    if (batchToggleBtn) {
      batchToggleBtn.addEventListener('click', function() {
        _ui.selectMode = !_ui.selectMode;
        if (!_ui.selectMode) _ui.selectedIds = [];
        renderLibraryStage(page, opts);
      });
    }

    var tagSel = stage.querySelector('#aiw-lib-tag-filter');
    if (tagSel) {
      tagSel.addEventListener('change', function() {
        _ui.tag = tagSel.value || '';
        saveUiState();
        renderLibraryStage(page, opts);
      });
    }

    var timeSel = stage.querySelector('#aiw-lib-time-filter');
    if (timeSel) {
      timeSel.addEventListener('change', function() {
        _ui.timeRange = timeSel.value || '';
        saveUiState();
        renderLibraryStage(page, opts);
      });
    }

    function toggleSelectAll() {
      if (allSelected) {
        _ui.selectedIds = [];
      } else {
        _ui.selectedIds = filteredDocs.map(function(d) { return d.id; });
      }
      renderLibraryStage(page, opts);
    }
    var selectAllBtn = stage.querySelector('#aiw-lib-select-all-btn');
    if (selectAllBtn) selectAllBtn.addEventListener('click', toggleSelectAll);
    var tableSelectAll = stage.querySelector('#aiw-lib-table-select-all');
    if (tableSelectAll) tableSelectAll.addEventListener('change', toggleSelectAll);

    var batchTagBtn = stage.querySelector('#aiw-lib-batch-tag-btn');
    if (batchTagBtn) {
      batchTagBtn.addEventListener('click', function() {
        openBatchTagModal(page, _ui.selectedIds.slice(), function() {
          renderLibraryStage(page, opts);
        });
      });
    }

    var batchDelBtn = stage.querySelector('#aiw-lib-batch-del-btn');
    if (batchDelBtn) {
      batchDelBtn.addEventListener('click', function() {
        var selDocs = filteredDocs.filter(function(d) { return !!selectedMap[d.id]; });
        openBatchDeleteModal(page, selDocs, function() {
          _ui.selectedIds = [];
          renderLibraryStage(page, opts);
        });
      });
    }

    stage.querySelectorAll('[data-lib-select]').forEach(function(cb) {
      cb.addEventListener('click', function(e) { e.stopPropagation(); });
      cb.addEventListener('change', function() {
        var sid = cb.getAttribute('data-lib-select');
        if (!sid) return;
        if (cb.checked) {
          if (_ui.selectedIds.indexOf(sid) === -1) _ui.selectedIds.push(sid);
        } else {
          _ui.selectedIds = _ui.selectedIds.filter(function(x) { return x !== sid; });
        }
        renderLibraryStage(page, opts);
      });
    });

    stage.querySelectorAll('[data-lib-doc-id]').forEach(function(row) {
      row.addEventListener('click', async function(e) {
        if (e.target.closest('.aiw-lib-more-btn') || e.target.closest('[data-lib-select]')) return;
        var did = row.getAttribute('data-lib-doc-id');
        if (_ui.selectMode) {
          if (_ui.selectedIds.indexOf(did) === -1) _ui.selectedIds.push(did);
          else _ui.selectedIds = _ui.selectedIds.filter(function(x) { return x !== did; });
          renderLibraryStage(page, opts);
          return;
        }
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
