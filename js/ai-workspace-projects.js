// ai-workspace-projects.js — 知屿（AI 工作空间）8-A1 项目基础管理模块
// 包含：项目列表（创建/搜索/重命名/编辑/删除）、项目详情、项目内新建聊天、已有聊天移入/移出、安全删除确认及后续扩展预留接口。
(function(global) {
  'use strict';

  function S() {
    return global.AiWorkspaceStorage;
  }

  function W() {
    return global.AiWorkspace;
  }

  function notifyToast(msg) {
    if (typeof global.toast === 'function') {
      global.toast(msg);
    } else if (typeof global.showToast === 'function') {
      global.showToast(msg);
    }
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function formatTime(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString();
    } catch (_) {
      return '';
    }
  }

  var PROJECT_ICONS = [
    { id: 'fa-solid fa-folder', label: '默认文件夹' },
    { id: 'fa-solid fa-briefcase', label: '工作业务' },
    { id: 'fa-solid fa-book', label: '学习资料' },
    { id: 'fa-solid fa-laptop-code', label: '技术开发' },
    { id: 'fa-solid fa-compass', label: '规划探索' },
    { id: 'fa-solid fa-star', label: '核心目标' },
    { id: 'fa-solid fa-heart', label: '生活灵感' },
    { id: 'fa-solid fa-lightbulb', label: '创意头脑' },
    { id: '🌐', label: '浏览器/网络' },
    { id: '🌿', label: '杂集/自然' },
    { id: '💜', label: '人设/情感' },
    { id: '🌸', label: '素材/灵感' },
    { id: '📚', label: '论文/阅读' },
    { id: '🐾', label: '小软件/宠物' },
    { id: '🚀', label: '效率/发布' },
    { id: '🎯', label: '目标/计划' }
  ];

  function renderProjectIconHtml(iconVal) {
    var ic = String(iconVal || 'fa-solid fa-folder').trim() || 'fa-solid fa-folder';
    if (ic.indexOf('fa-') !== -1) {
      return '<i class="' + escapeHtml(ic) + '"></i>';
    }
    return '<span class="aiw-proj-emoji-icon">' + escapeHtml(ic) + '</span>';
  }

  var PROJECT_COLORS = [
    { id: '#ec4899', label: '粉红' },
    { id: '#e11d48', label: '珊瑚红' },
    { id: '#2563eb', label: '晴空蓝' },
    { id: '#059669', label: '鼠尾草' },
    { id: '#d97706', label: '琥珀金' },
    { id: '#7c3aed', label: '优雅紫' },
    { id: '#27272a', label: '极简黑' }
  ];

  // 为后续阶段（8-A2/8-A3+）预留的扩展能力契约（本阶段暂不实现对应 UI 与引擎）
  var RESERVED_EXTENSIONS = {
    systemPrompt: { field: 'instructions', label: '项目专属提示词', stage: '8-A2', implemented: true },
    projectFiles: { field: 'documentIds', label: '项目资料文件', stage: '8-A4', implemented: true },
    projectMemory: { field: 'memoryConfig', label: '项目专属记忆', stage: '8-A3', implemented: true },
    sharedContext: { field: 'sharedContext', label: '项目共享上下文', stage: 'future', implemented: false },
    pluginSettings: { field: 'pluginSettings', label: '项目级插件设置', stage: 'future', implemented: false }
  };

  function getReservedExtensionsSchema() {
    return JSON.parse(JSON.stringify(RESERVED_EXTENSIONS));
  }

  async function syncWorkspaceState(detail) {
    if (W() && typeof W().syncAfterProjectChange === 'function') {
      await W().syncAfterProjectChange(detail || {});
    }
  }

  function closeProjectsModal(page) {
    if (!page) return;
    var existing = page.querySelector('#aiw-projects-modal-wrap');
    if (existing) existing.remove();
  }

  function openProjectsCenter(page, options) {
    if (!page || !S()) return;
    var opts = options && typeof options === 'object' ? options : {};
    var initialProjectId = opts.projectId || '';

    if (initialProjectId) {
      openProjectDetail(page, initialProjectId, opts);
      return;
    }

    renderProjectsHome(page, opts);
  }

  async function renderProjectsHome(page, opts) {
    opts = opts || {};
    closeProjectsModal(page);
    var projects = await S().listProjects();
    var allChats = await S().listChats();

    var chatCountMap = {};
    for (var i = 0; i < allChats.length; i++) {
      var c = allChats[i];
      if (c && c.projectId) {
        chatCountMap[c.projectId] = (chatCountMap[c.projectId] || 0) + 1;
      }
    }

    var unassignedCount = allChats.filter(function(c) { return !c || !c.projectId; }).length;

    var wrap = document.createElement('div');
    wrap.id = 'aiw-projects-modal-wrap';
    wrap.className = 'aiw-ws-modal-backdrop open';

    var projectsHtml = projects.length === 0 ? (
      '<div class="aiw-empty-state">' +
        '<div class="aiw-empty-icon"><i class="fa-regular fa-folder-open"></i></div>' +
        '<div class="aiw-empty-title">还没有创建任何项目</div>' +
        '<div class="aiw-empty-desc">项目可将相关的多个 AI 聊天归类管理，保持工作空间井然有序。</div>' +
        '<button type="button" class="aiw-primary-btn" id="aiw-proj-create-first-btn">' +
          '<i class="fa-solid fa-plus"></i> 创建第一个项目' +
        '</button>' +
      '</div>'
    ) : (
      '<div class="aiw-projects-grid" id="aiw-projects-grid">' +
        projects.map(function(p) {
          var count = chatCountMap[p.id] || 0;
          var color = p.color || '#ec4899';
          return (
            '<div class="aiw-project-card" data-project-id="' + escapeHtml(p.id) + '" data-search-text="' + escapeHtml((p.name + ' ' + (p.description || '')).toLowerCase()) + '" style="border-left-color: ' + escapeHtml(color) + ';">' +
              '<div class="aiw-project-card-head">' +
                '<div class="aiw-project-card-icon" style="background-color: ' + escapeHtml(color) + '1a; color: ' + escapeHtml(color) + ';">' +
                  renderProjectIconHtml(p.icon) +
                '</div>' +
                '<div class="aiw-project-card-meta">' +
                  '<div class="aiw-project-card-title">' + escapeHtml(p.name) + '</div>' +
                  '<div class="aiw-project-card-subtitle">' + count + ' 个聊天对话</div>' +
                '</div>' +
                '<div class="aiw-project-card-actions">' +
                  '<button type="button" class="aiw-icon-btn aiw-proj-rename-btn" data-proj-id="' + escapeHtml(p.id) + '" title="重命名"><i class="fa-solid fa-i-cursor"></i></button>' +
                  '<button type="button" class="aiw-icon-btn aiw-proj-edit-btn" data-proj-id="' + escapeHtml(p.id) + '" title="编辑项目"><i class="fa-solid fa-pen"></i></button>' +
                  '<button type="button" class="aiw-icon-btn aiw-proj-delete-quick-btn" data-proj-id="' + escapeHtml(p.id) + '" title="删除项目"><i class="fa-regular fa-trash-can"></i></button>' +
                '</div>' +
              '</div>' +
              (p.description ? '<div class="aiw-project-card-desc">' + escapeHtml(p.description) + '</div>' : '<div class="aiw-project-card-desc is-empty">暂无项目简介</div>') +
              '<div class="aiw-project-card-foot">' +
                '<span class="aiw-project-card-tag" style="color: ' + escapeHtml(color) + ';">进入项目</span>' +
                '<i class="fa-solid fa-angle-right" style="color: ' + escapeHtml(color) + ';"></i>' +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>' +
      '<div class="aiw-empty-state" id="aiw-proj-search-empty" style="display:none;">' +
        '<div class="aiw-empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>' +
        '<div class="aiw-empty-title">没有匹配的项目</div>' +
        '<div class="aiw-empty-desc">请尝试更换搜索关键词，或新建一个项目。</div>' +
      '</div>'
    );

    wrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-center-modal" role="dialog" aria-modal="true" aria-label="我的项目">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title"><i class="fa-regular fa-folder" style="margin-right: 8px; color: var(--aiw-pink-deep);"></i>我的项目 (' + projects.length + ')</div>' +
          '<div class="aiw-modal-head-right">' +
            '<button type="button" class="aiw-primary-btn aiw-btn-sm" id="aiw-proj-new-btn"><i class="fa-solid fa-plus"></i> 新建项目</button>' +
            '<button type="button" class="aiw-ws-modal-close" id="aiw-proj-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-body aiw-projects-body">' +
          '<div class="aiw-projects-toolbar">' +
            '<div class="aiw-search-box aiw-projects-search">' +
              '<i class="fa-solid fa-magnifying-glass"></i>' +
              '<input type="search" id="aiw-proj-search-input" placeholder="搜索项目名称或简介..." aria-label="搜索项目">' +
            '</div>' +
            '<div class="aiw-projects-summary">未归类普通聊天: <strong>' + unassignedCount + '</strong> 个</div>' +
          '</div>' +
          '<div class="aiw-projects-list-container" id="aiw-projects-list-wrap">' +
            projectsHtml +
          '</div>' +
        '</div>' +
      '</div>';

    page.appendChild(wrap);

    wrap.querySelector('#aiw-proj-modal-close').addEventListener('click', function() {
      closeProjectsModal(page);
      if (typeof opts.onClose === 'function') opts.onClose();
    });

    wrap.addEventListener('click', function(e) {
      if (e.target === wrap) {
        closeProjectsModal(page);
        if (typeof opts.onClose === 'function') opts.onClose();
      }
    });

    var newBtn = wrap.querySelector('#aiw-proj-new-btn');
    if (newBtn) {
      newBtn.addEventListener('click', function() {
        openProjectEditModal(page, null, function() {
          renderProjectsHome(page, opts);
        });
      });
    }

    var firstBtn = wrap.querySelector('#aiw-proj-create-first-btn');
    if (firstBtn) {
      firstBtn.addEventListener('click', function() {
        openProjectEditModal(page, null, function() {
          renderProjectsHome(page, opts);
        });
      });
    }

    wrap.querySelectorAll('.aiw-proj-rename-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var pid = btn.getAttribute('data-proj-id');
        S().getProject(pid).then(function(proj) {
          if (proj) {
            openProjectRenameModal(page, proj, function() {
              renderProjectsHome(page, opts);
            });
          }
        });
      });
    });

    wrap.querySelectorAll('.aiw-proj-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var pid = btn.getAttribute('data-proj-id');
        S().getProject(pid).then(function(proj) {
          if (proj) {
            openProjectEditModal(page, proj, function() {
              renderProjectsHome(page, opts);
            }, function() {
              renderProjectsHome(page, opts);
            });
          }
        });
      });
    });

    wrap.querySelectorAll('.aiw-proj-delete-quick-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var pid = btn.getAttribute('data-proj-id');
        S().getProject(pid).then(function(proj) {
          if (proj) {
            openProjectDeleteConfirmModal(page, proj, function() {
              renderProjectsHome(page, opts);
            });
          }
        });
      });
    });

    wrap.querySelectorAll('.aiw-project-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var pid = card.getAttribute('data-project-id');
        openProjectDetail(page, pid, opts);
      });
    });

    var searchInput = wrap.querySelector('#aiw-proj-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        var q = (searchInput.value || '').trim().toLowerCase();
        var visibleCount = 0;
        wrap.querySelectorAll('.aiw-project-card').forEach(function(card) {
          var text = card.getAttribute('data-search-text') || card.textContent.toLowerCase();
          var matched = !q || text.indexOf(q) !== -1;
          card.style.display = matched ? '' : 'none';
          if (matched) visibleCount++;
        });
        var emptyEl = wrap.querySelector('#aiw-proj-search-empty');
        var gridEl = wrap.querySelector('#aiw-projects-grid');
        if (emptyEl) emptyEl.style.display = (projects.length > 0 && visibleCount === 0) ? 'flex' : 'none';
        if (gridEl) gridEl.style.display = visibleCount === 0 ? 'none' : '';
      });
    }
  }

  async function openProjectDetail(page, projectId, opts) {
    opts = opts || {};
    var project = await S().getProject(projectId);
    if (!project) {
      notifyToast('项目不存在或已被删除');
      renderProjectsHome(page, opts);
      return;
    }

    closeProjectsModal(page);
    var allChats = await S().listChats();
    var projectChats = allChats.filter(function(c) { return c && c.projectId === projectId; });
    var allPresets = typeof S().listPresets === 'function' ? await S().listPresets() : [];
    var projectDocs = typeof S().listProjectDocuments === 'function' ? await S().listProjectDocuments(projectId) : [];
    var projPresetLabel = '跟随全局默认预设';
    if (project.defaultPresetId) {
      var matchedPreset = allPresets.find(function(p) { return p && p.id === project.defaultPresetId; });
      projPresetLabel = matchedPreset ? matchedPreset.name : '原预设已删除（自动回退）';
    }
    var hasProjInst = !!(project.instructions && String(project.instructions).trim());

    var wrap = document.createElement('div');
    wrap.id = 'aiw-projects-modal-wrap';
    wrap.className = 'aiw-ws-modal-backdrop open';

    var color = project.color || '#ec4899';
    var chatsHtml = projectChats.length === 0 ? (
      '<div class="aiw-empty-state">' +
        '<div class="aiw-empty-icon" style="color: ' + escapeHtml(color) + ';"><i class="' + escapeHtml(project.icon || 'fa-solid fa-folder') + '"></i></div>' +
        '<div class="aiw-empty-title">该项目下暂无聊天</div>' +
        '<div class="aiw-empty-desc">点击下方按钮在本项目中新建 AI 对话，或将已有普通聊天移动到本项目中。</div>' +
        '<div class="aiw-empty-actions">' +
          '<button type="button" class="aiw-primary-btn" id="aiw-proj-new-chat-empty-btn" style="background-color: ' + escapeHtml(color) + ';"><i class="fa-solid fa-plus"></i> 新建聊天</button>' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-proj-add-existing-empty-btn"><i class="fa-solid fa-file-arrow-down"></i> 移动已有聊天</button>' +
        '</div>' +
      '</div>'
    ) : (
      '<div class="aiw-proj-chat-list">' +
        projectChats.map(function(c) {
          var msgCount = Array.isArray(c.messages) ? c.messages.length : 0;
          var dateStr = formatTime(c.updatedAt || c.createdAt || Date.now());
          return (
            '<div class="aiw-proj-chat-item" data-chat-id="' + escapeHtml(c.id) + '">' +
              '<div class="aiw-proj-chat-info">' +
                '<div class="aiw-proj-chat-title">' + (c.pinned ? '<i class="fa-solid fa-thumbtack" style="color:var(--aiw-pink-deep); margin-right:5px;"></i>' : '') + escapeHtml(c.title || '新对话') + '</div>' +
                '<div class="aiw-proj-chat-sub">' + msgCount + ' 条消息 · ' + escapeHtml(dateStr) + '</div>' +
              '</div>' +
              '<div class="aiw-proj-chat-actions">' +
                '<button type="button" class="aiw-icon-btn aiw-proj-open-chat" data-chat-id="' + escapeHtml(c.id) + '" title="打开并对话"><i class="fa-solid fa-comments"></i></button>' +
                '<button type="button" class="aiw-icon-btn aiw-proj-rename-chat" data-chat-id="' + escapeHtml(c.id) + '" title="重命名聊天"><i class="fa-solid fa-pen"></i></button>' +
                '<button type="button" class="aiw-icon-btn aiw-proj-moveout-chat" data-chat-id="' + escapeHtml(c.id) + '" title="移出项目"><i class="fa-solid fa-share-from-square"></i></button>' +
                '<button type="button" class="aiw-icon-btn is-danger aiw-proj-delete-chat" data-chat-id="' + escapeHtml(c.id) + '" title="删除聊天"><i class="fa-regular fa-trash-can"></i></button>' +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );

    wrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-center-modal" role="dialog" aria-modal="true" aria-label="项目详情">' +
        '<div class="aiw-ws-modal-head" style="border-bottom: 2px solid ' + escapeHtml(color) + '33;">' +
          '<div class="aiw-proj-detail-head-left">' +
            '<button type="button" class="aiw-icon-btn" id="aiw-proj-back-btn" title="返回我的项目"><i class="fa-solid fa-arrow-left"></i></button>' +
            '<div class="aiw-proj-detail-badge" style="background-color: ' + escapeHtml(color) + '1a; color: ' + escapeHtml(color) + ';">' +
              renderProjectIconHtml(project.icon) +
            '</div>' +
            '<div class="aiw-ws-modal-title">' + escapeHtml(project.name) + '</div>' +
          '</div>' +
          '<div class="aiw-modal-head-right">' +
            '<button type="button" class="aiw-primary-btn aiw-btn-sm" id="aiw-proj-new-chat-btn" style="background-color: ' + escapeHtml(color) + ';"><i class="fa-solid fa-plus"></i> 新建聊天</button>' +
            '<button type="button" class="aiw-secondary-btn aiw-btn-sm" id="aiw-proj-docs-btn"><i class="fa-solid fa-file-lines"></i> 项目资料 (' + projectDocs.length + ')</button>' +
            '<button type="button" class="aiw-secondary-btn aiw-btn-sm" id="aiw-proj-add-existing-btn"><i class="fa-solid fa-file-arrow-down"></i> 移动聊天</button>' +
            '<button type="button" class="aiw-secondary-btn aiw-btn-sm" id="aiw-proj-settings-btn"><i class="fa-solid fa-gear"></i> 设置</button>' +
            '<button type="button" class="aiw-ws-modal-close" id="aiw-proj-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-body aiw-projects-body">' +
          '<div class="aiw-proj-detail-info-card">' +
            '<div class="aiw-proj-detail-desc">' + (project.description ? escapeHtml(project.description) : '<span style="color:var(--aiw-hint);">暂无项目简介</span>') + '</div>' +
            '<div class="aiw-proj-detail-meta">' +
              '<span><i class="fa-regular fa-comments"></i> ' + projectChats.length + ' 个对话</span>' +
              '<span><i class="fa-regular fa-file-lines"></i> ' + projectDocs.length + ' 份资料</span>' +
              '<span class="aiw-proj-meta-pill"><i class="fa-solid fa-sliders"></i> 预设：' + escapeHtml(projPresetLabel) + '</span>' +
              '<span class="aiw-proj-meta-pill' + (hasProjInst ? ' is-active' : '') + '"><i class="fa-solid fa-scroll"></i> ' + (hasProjInst ? '已配置项目指令' : '未配置项目指令') + '</span>' +
              '<span><i class="fa-regular fa-clock"></i> 创建于 ' + escapeHtml(formatTime(project.createdAt)) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="aiw-projects-toolbar">' +
            '<div class="aiw-projects-summary">项目内聊天列表 (<strong>' + projectChats.length + '</strong>)</div>' +
          '</div>' +
          '<div class="aiw-projects-list-container">' +
            chatsHtml +
          '</div>' +
        '</div>' +
      '</div>';

    page.appendChild(wrap);

    wrap.querySelector('#aiw-proj-modal-close').addEventListener('click', function() {
      closeProjectsModal(page);
      if (typeof opts.onClose === 'function') opts.onClose();
    });

    wrap.querySelector('#aiw-proj-back-btn').addEventListener('click', function() {
      renderProjectsHome(page, opts);
    });

    wrap.addEventListener('click', function(e) {
      if (e.target === wrap) {
        closeProjectsModal(page);
        if (typeof opts.onClose === 'function') opts.onClose();
      }
    });

    async function handleCreateChatInProject() {
      closeProjectsModal(page);
      if (W() && typeof W().createNewChatInProject === 'function') {
        await W().createNewChatInProject(page, project.id);
      } else {
        var defPreset = typeof S().getDefaultPreset === 'function' ? await S().getDefaultPreset() : null;
        var newChat = await S().createChat({
          title: '新对话（' + project.name + '）',
          projectId: project.id,
          presetId: defPreset ? defPreset.id : '',
          presetSnapshot: defPreset ? S().buildPresetSnapshot(defPreset) : null
        });
        if (W() && typeof W().loadChatIntoState === 'function') {
          await W().loadChatIntoState(page, newChat.id);
        }
      }
    }

    var newChatBtn = wrap.querySelector('#aiw-proj-new-chat-btn');
    if (newChatBtn) newChatBtn.addEventListener('click', handleCreateChatInProject);
    var newChatEmptyBtn = wrap.querySelector('#aiw-proj-new-chat-empty-btn');
    if (newChatEmptyBtn) newChatEmptyBtn.addEventListener('click', handleCreateChatInProject);

    function handleOpenMoveChats() {
      openMoveChatsModal(page, project, function() {
        openProjectDetail(page, projectId, opts);
      });
    }

    var docsBtn = wrap.querySelector('#aiw-proj-docs-btn');
    if (docsBtn) {
      docsBtn.addEventListener('click', function() {
        openProjectDocumentsModal(page, project, function() {
          openProjectDetail(page, projectId, opts);
        });
      });
    }

    var addExistingBtn = wrap.querySelector('#aiw-proj-add-existing-btn');
    if (addExistingBtn) addExistingBtn.addEventListener('click', handleOpenMoveChats);
    var addExistingEmptyBtn = wrap.querySelector('#aiw-proj-add-existing-empty-btn');
    if (addExistingEmptyBtn) addExistingEmptyBtn.addEventListener('click', handleOpenMoveChats);

    var settingsBtn = wrap.querySelector('#aiw-proj-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function() {
        openProjectEditModal(
          page,
          project,
          function() { openProjectDetail(page, projectId, opts); },
          function() { renderProjectsHome(page, opts); }
        );
      });
    }

    wrap.querySelectorAll('.aiw-proj-open-chat').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var cid = btn.getAttribute('data-chat-id');
        closeProjectsModal(page);
        if (W() && typeof W().loadChatIntoState === 'function') {
          await W().loadChatIntoState(page, cid);
        }
      });
    });

    wrap.querySelectorAll('.aiw-proj-chat-item').forEach(function(itemEl) {
      itemEl.addEventListener('click', async function(e) {
        if (e.target.closest('.aiw-proj-chat-actions')) return;
        var cid = itemEl.getAttribute('data-chat-id');
        closeProjectsModal(page);
        if (W() && typeof W().loadChatIntoState === 'function') {
          await W().loadChatIntoState(page, cid);
        }
      });
    });

    wrap.querySelectorAll('.aiw-proj-rename-chat').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var cid = btn.getAttribute('data-chat-id');
        var chat = await S().getChat(cid);
        if (!chat) return;
        openChatRenameModal(page, chat, async function() {
          await syncWorkspaceState({ renamedChatId: cid });
          openProjectDetail(page, projectId, opts);
        });
      });
    });

    wrap.querySelectorAll('.aiw-proj-moveout-chat').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var cid = btn.getAttribute('data-chat-id');
        var updated = await S().removeChatFromProject(cid);
        if (updated) {
          await syncWorkspaceState({ movedChatId: cid, nextProjectId: '' });
          notifyToast('已将聊天移出项目');
          openProjectDetail(page, projectId, opts);
        }
      });
    });

    wrap.querySelectorAll('.aiw-proj-delete-chat').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var cid = btn.getAttribute('data-chat-id');
        var chat = await S().getChat(cid);
        if (!chat) return;
        openChatDeleteConfirmModal(page, chat, async function() {
          await syncWorkspaceState({ deletedChatId: cid });
          openProjectDetail(page, projectId, opts);
        });
      });
    });
  }

  function openProjectRenameModal(page, project, onRenamed) {
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';
    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-edit-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title">重命名项目</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label" for="aiw-proj-rename-input">项目名称</label>' +
            '<input type="text" class="aiw-field-input" id="aiw-proj-rename-input" value="' + escapeHtml(project.name || '') + '" maxlength="50" placeholder="输入新的项目名称">' +
          '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-proj-ren-cancel">取消</button>' +
          '<button type="button" class="aiw-primary-btn" id="aiw-proj-ren-save">保存</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);
    var inputEl = modalWrap.querySelector('#aiw-proj-rename-input');
    setTimeout(function() { try { inputEl.focus(); inputEl.select(); } catch (_) {} }, 40);

    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-proj-ren-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });

    modalWrap.querySelector('#aiw-proj-ren-save').addEventListener('click', async function() {
      var nextName = (inputEl.value || '').trim();
      if (!nextName) {
        notifyToast('请输入项目名称');
        inputEl.focus();
        return;
      }
      await S().renameProject(project.id, nextName);
      await syncWorkspaceState({ updatedProjectId: project.id });
      modalWrap.remove();
      notifyToast('项目已重命名');
      if (typeof onRenamed === 'function') onRenamed();
    });
  }

  function openChatRenameModal(page, chat, onRenamed) {
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';
    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-edit-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title">重命名聊天</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label" for="aiw-proj-chat-rename-input">聊天标题</label>' +
            '<input type="text" class="aiw-field-input" id="aiw-proj-chat-rename-input" value="' + escapeHtml(chat.title || '') + '" maxlength="80" placeholder="输入新的聊天标题">' +
          '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-proj-chat-ren-cancel">取消</button>' +
          '<button type="button" class="aiw-primary-btn" id="aiw-proj-chat-ren-save">保存</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);
    var inputEl = modalWrap.querySelector('#aiw-proj-chat-rename-input');
    setTimeout(function() { try { inputEl.focus(); inputEl.select(); } catch (_) {} }, 40);

    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-proj-chat-ren-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });

    modalWrap.querySelector('#aiw-proj-chat-ren-save').addEventListener('click', async function() {
      var nextTitle = (inputEl.value || '').trim();
      if (!nextTitle) {
        notifyToast('标题不能为空');
        inputEl.focus();
        return;
      }
      await S().renameChat(chat.id, nextTitle);
      modalWrap.remove();
      notifyToast('聊天已重命名');
      if (typeof onRenamed === 'function') onRenamed();
    });
  }

  function openChatDeleteConfirmModal(page, chat, onDeleted) {
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';
    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-delete-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title" style="color: #e11d48;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i>删除聊天</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<p class="aiw-st-modal-msg">确定要删除「<strong>' + escapeHtml(chat.title || '该对话') + '</strong>」吗？删除后不可恢复，但不会影响弯弯机微信聊天记录。</p>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-proj-chat-del-cancel">取消</button>' +
          '<button type="button" class="aiw-danger-btn" id="aiw-proj-chat-del-ok">确认删除</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);
    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-proj-chat-del-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });

    modalWrap.querySelector('#aiw-proj-chat-del-ok').addEventListener('click', async function() {
      await S().deleteChat(chat.id);
      modalWrap.remove();
      notifyToast('聊天已删除');
      if (typeof onDeleted === 'function') onDeleted();
    });
  }

  async function openProjectEditModal(page, existingProject, onSaved, onDeleted) {
    var isEdit = !!existingProject;
    var presets = typeof S().listPresets === 'function' ? await S().listPresets() : [];
    var globalDefaultPreset = typeof S().getDefaultPreset === 'function' ? await S().getDefaultPreset() : null;
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';

    var nameVal = isEdit ? existingProject.name : '';
    var descVal = isEdit ? (existingProject.description || '') : '';
    var iconVal = isEdit ? (existingProject.icon || 'fa-solid fa-folder') : 'fa-solid fa-folder';
    var colorVal = isEdit ? (existingProject.color || '#ec4899') : '#ec4899';
    var defaultPresetIdVal = isEdit ? (existingProject.defaultPresetId || '') : '';
    var instructionsVal = isEdit ? (existingProject.instructions || '') : '';
    var allowGlobalLibVal = isEdit ? Boolean(existingProject.allowGlobalLibrary) : false;
    var missingSavedPreset = !!(defaultPresetIdVal && !presets.some(function(p) { return p && p.id === defaultPresetIdVal; }));

    var presetOptionsHtml = '<option value="">跟随知屿全局默认预设' + (globalDefaultPreset ? ('（' + escapeHtml(globalDefaultPreset.name) + '）') : '') + '</option>' +
      presets.map(function(p) {
        var sel = p.id === defaultPresetIdVal ? ' selected' : '';
        return '<option value="' + escapeHtml(p.id) + '"' + sel + '>' + escapeHtml(p.name) + '</option>';
      }).join('');

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-edit-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title">' + (isEdit ? '项目设置' : '新建项目') + '</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label" for="aiw-proj-form-name">项目名称</label>' +
            '<input type="text" class="aiw-field-input" id="aiw-proj-form-name" value="' + escapeHtml(nameVal) + '" placeholder="例如：小说大纲创作、课程学习、工作整理..." maxlength="50">' +
          '</div>' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label" for="aiw-proj-form-desc">项目简介（选填）</label>' +
            '<textarea class="aiw-field-textarea" id="aiw-proj-form-desc" rows="3" placeholder="简要描述本项目的目标与范围..." maxlength="200">' + escapeHtml(descVal) + '</textarea>' +
          '</div>' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label" for="aiw-proj-form-preset">项目默认预设（复用现有预设）</label>' +
            '<select class="aiw-field-input" id="aiw-proj-form-preset">' + presetOptionsHtml + '</select>' +
            (missingSavedPreset ? '<div class="aiw-proj-field-hint is-warn">原绑定的默认预设已被删除，新建聊天将自动回退到全局默认预设，已有聊天仍保留原快照。</div>' : '<div class="aiw-proj-field-hint">仅影响本项目后续新建聊天，不覆盖已有聊天预设。</div>') +
          '</div>' +
          '<div class="aiw-form-group">' +
            '<div class="aiw-proj-inst-head">' +
              '<label class="aiw-form-label" for="aiw-proj-form-instructions">项目指令（Project Instructions）</label>' +
              '<button type="button" class="aiw-proj-clear-btn" id="aiw-proj-clear-inst-btn">清空指令</button>' +
            '</div>' +
            '<textarea class="aiw-field-textarea" id="aiw-proj-form-instructions" rows="4" placeholder="规定项目背景、目标、工作规范、特定限制及项目内的回答要求..."></textarea>' +
            '<div class="aiw-proj-field-hint">仅作用于当前项目的后续 AI 请求，不会污染普通聊天或其他项目，且不可覆盖安全规则。</div>' +
            '<div class="aiw-proj-conflict-banner" id="aiw-proj-conflict-tip" style="display:none;"></div>' +
          '</div>' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label">图标选择</label>' +
            '<div class="aiw-proj-icon-grid" id="aiw-proj-form-icons">' +
              PROJECT_ICONS.map(function(ic) {
                var active = ic.id === iconVal ? ' active' : '';
                return '<button type="button" class="aiw-proj-icon-opt' + active + '" data-icon-id="' + escapeHtml(ic.id) + '" title="' + escapeHtml(ic.label) + '"><i class="' + escapeHtml(ic.id) + '"></i></button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label">主题色</label>' +
            '<div class="aiw-proj-color-grid" id="aiw-proj-form-colors">' +
              PROJECT_COLORS.map(function(cl) {
                var active = cl.id === colorVal ? ' active' : '';
                return '<button type="button" class="aiw-proj-color-opt' + active + '" data-color-id="' + escapeHtml(cl.id) + '" style="background-color: ' + escapeHtml(cl.id) + ';" title="' + escapeHtml(cl.label) + '"></button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-checkbox-label">' +
              '<input type="checkbox" id="aiw-proj-form-allow-global-lib"' + (allowGlobalLibVal ? ' checked' : '') + '>' +
              '<span>允许本项目内的聊天访问「全局资料库」（默认关闭，开启后仍不可访问其他项目来源）</span>' +
            '</label>' +
          '</div>' +
          (isEdit ? '<div class="aiw-form-group aiw-proj-danger-zone"><button type="button" class="aiw-danger-btn" id="aiw-proj-delete-btn"><i class="fa-regular fa-trash-can"></i> 删除项目...</button></div>' : '') +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-proj-form-cancel">取消</button>' +
          '<button type="button" class="aiw-primary-btn" id="aiw-proj-form-save">保存项目</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);

    var instEl = modalWrap.querySelector('#aiw-proj-form-instructions');
    var presetSel = modalWrap.querySelector('#aiw-proj-form-preset');
    var clearInstBtn = modalWrap.querySelector('#aiw-proj-clear-inst-btn');
    var conflictTip = modalWrap.querySelector('#aiw-proj-conflict-tip');
    if (instEl) instEl.value = instructionsVal;

    function refreshConflictBanner() {
      if (!conflictTip || !instEl) return;
      var pid = presetSel ? presetSel.value : '';
      var targetPreset = pid ? presets.find(function(p) { return p && p.id === pid; }) : globalDefaultPreset;
      var detector = global.AiWorkspaceAI && typeof global.AiWorkspaceAI.detectPresetInstructionConflict === 'function'
        ? global.AiWorkspaceAI.detectPresetInstructionConflict
        : null;
      if (!detector || !targetPreset) {
        conflictTip.style.display = 'none';
        conflictTip.textContent = '';
        return;
      }
      var res = detector(targetPreset, instEl.value);
      if (res && res.hasConflict) {
        conflictTip.style.display = 'block';
        conflictTip.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 配置提醒：' + escapeHtml(res.reasons.join('；')) + '。系统不会改写原预设，运行时将优先遵循安全规则。';
      } else {
        conflictTip.style.display = 'none';
        conflictTip.textContent = '';
      }
    }

    if (instEl) instEl.addEventListener('input', refreshConflictBanner);
    if (presetSel) presetSel.addEventListener('change', refreshConflictBanner);
    if (clearInstBtn && instEl) {
      clearInstBtn.addEventListener('click', function() {
        instEl.value = '';
        refreshConflictBanner();
        notifyToast('已清空项目指令编辑框，保存后生效');
      });
    }
    refreshConflictBanner();

    var currentSelectedIcon = iconVal;
    var currentSelectedColor = colorVal;

    modalWrap.querySelectorAll('.aiw-proj-icon-opt').forEach(function(btn) {
      btn.addEventListener('click', function() {
        modalWrap.querySelectorAll('.aiw-proj-icon-opt').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentSelectedIcon = btn.getAttribute('data-icon-id');
      });
    });

    modalWrap.querySelectorAll('.aiw-proj-color-opt').forEach(function(btn) {
      btn.addEventListener('click', function() {
        modalWrap.querySelectorAll('.aiw-proj-color-opt').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentSelectedColor = btn.getAttribute('data-color-id');
      });
    });

    function isFormDirty() {
      var curName = (modalWrap.querySelector('#aiw-proj-form-name').value || '').trim();
      var curDesc = (modalWrap.querySelector('#aiw-proj-form-desc').value || '').trim();
      var curPreset = presetSel ? presetSel.value : '';
      var curInst = instEl ? instEl.value.trim() : '';
      return (
        curName !== String(nameVal || '').trim() ||
        curDesc !== String(descVal || '').trim() ||
        curPreset !== String(defaultPresetIdVal || '') ||
        curInst !== String(instructionsVal || '').trim() ||
        currentSelectedIcon !== iconVal ||
        currentSelectedColor !== colorVal ||
        (modalWrap.querySelector('#aiw-proj-form-allow-global-lib') ? modalWrap.querySelector('#aiw-proj-form-allow-global-lib').checked : false) !== allowGlobalLibVal
      );
    }

    function requestCloseEditModal() {
      if (!isFormDirty()) {
        modalWrap.remove();
        return;
      }
      var discardWrap = document.createElement('div');
      discardWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';
      discardWrap.style.zIndex = '68';
      discardWrap.innerHTML =
        '<div class="aiw-ws-modal aiw-projects-delete-modal" role="dialog" aria-modal="true">' +
          '<div class="aiw-ws-modal-head">' +
            '<div class="aiw-ws-modal-title">放弃未保存的更改？</div>' +
            '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div class="aiw-ws-modal-body">' +
            '<p class="aiw-st-modal-msg">当前项目设置中有尚未保存的修改，确定要放弃并关闭吗？</p>' +
          '</div>' +
          '<div class="aiw-ws-modal-foot">' +
            '<button type="button" class="aiw-secondary-btn" id="aiw-proj-discard-no">继续编辑</button>' +
            '<button type="button" class="aiw-danger-btn" id="aiw-proj-discard-yes">放弃更改</button>' +
          '</div>' +
        '</div>';
      page.appendChild(discardWrap);
      discardWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { discardWrap.remove(); });
      discardWrap.querySelector('#aiw-proj-discard-no').addEventListener('click', function() { discardWrap.remove(); });
      discardWrap.addEventListener('click', function(e) { if (e.target === discardWrap) discardWrap.remove(); });
      discardWrap.querySelector('#aiw-proj-discard-yes').addEventListener('click', function() {
        discardWrap.remove();
        modalWrap.remove();
      });
    }

    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', requestCloseEditModal);
    modalWrap.querySelector('#aiw-proj-form-cancel').addEventListener('click', requestCloseEditModal);
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) requestCloseEditModal(); });

    modalWrap.querySelector('#aiw-proj-form-save').addEventListener('click', async function() {
      var nameInput = modalWrap.querySelector('#aiw-proj-form-name');
      var descInput = modalWrap.querySelector('#aiw-proj-form-desc');
      var name = (nameInput.value || '').trim();
      if (!name) {
        notifyToast('请输入项目名称');
        nameInput.focus();
        return;
      }

      var payload = {
        name: name,
        description: (descInput.value || '').trim(),
        defaultPresetId: presetSel ? presetSel.value : '',
        instructions: instEl ? instEl.value.trim() : '',
        allowGlobalLibrary: !!(modalWrap.querySelector('#aiw-proj-form-allow-global-lib') && modalWrap.querySelector('#aiw-proj-form-allow-global-lib').checked),
        icon: currentSelectedIcon,
        color: currentSelectedColor
      };

      if (isEdit) {
        await S().updateProject(existingProject.id, payload);
        await syncWorkspaceState({ updatedProjectId: existingProject.id });
        notifyToast('项目已更新');
      } else {
        var createdProj = await S().createProject(payload);
        await syncWorkspaceState({ createdProjectId: createdProj && createdProj.id });
        notifyToast('项目已创建');
      }

      modalWrap.remove();
      if (typeof onSaved === 'function') onSaved();
    });

    var delBtn = modalWrap.querySelector('#aiw-proj-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', function() {
        modalWrap.remove();
        openProjectDeleteConfirmModal(page, existingProject, onDeleted || onSaved);
      });
    }
  }

  async function openProjectDeleteConfirmModal(page, project, onDeleted) {
    var projectChats = typeof S().listProjectChats === 'function'
      ? await S().listProjectChats(project.id)
      : (await S().listChats()).filter(function(c) { return c && c.projectId === project.id; });
    var chatCount = projectChats.length;

    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-delete-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title" style="color: #e11d48;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i>删除项目：' + escapeHtml(project.name) + '</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div class="aiw-form-group">' +
            '<div class="aiw-del-desc">该项目当前包含 <strong>' + chatCount + '</strong> 个聊天记录。删除项目将同时清理该项目的专属记忆、独立记忆设置与待处理记忆任务（不影响普通聊天）。请选择聊天记录处理方式：</div>' +
            '<label class="aiw-radio-label">' +
              '<input type="radio" name="del_proj_chats" value="keep" checked>' +
              '<span>保留聊天并移出项目（转为普通聊天，不删除记录）</span>' +
            '</label>' +
            '<label class="aiw-radio-label">' +
              '<input type="radio" name="del_proj_chats" value="delete">' +
              '<span style="color:#e11d48;">同时删除项目及项目内全部聊天记录</span>' +
            '</label>' +
          '</div>' +
          '<div class="aiw-form-group aiw-delete-confirm-box" id="aiw-del-confirm-box" style="display:none;">' +
            '<label class="aiw-checkbox-label">' +
              '<input type="checkbox" id="aiw-del-chats-confirm-checkbox">' +
              '<span>二次确认：我已知晓此操作将永久删除该项目及 ' + chatCount + ' 个关联聊天，且不可撤销</span>' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-proj-del-cancel">取消</button>' +
          '<button type="button" class="aiw-danger-btn" id="aiw-proj-del-confirm">确认删除</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);

    modalWrap.querySelectorAll('input[name="del_proj_chats"]').forEach(function(radio) {
      radio.addEventListener('change', function() {
        var confirmBox = modalWrap.querySelector('#aiw-del-confirm-box');
        if (confirmBox) {
          confirmBox.style.display = (radio.value === 'delete' && radio.checked) ? 'block' : 'none';
        }
      });
    });

    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-proj-del-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });

    modalWrap.querySelector('#aiw-proj-del-confirm').addEventListener('click', async function() {
      var selectedEl = modalWrap.querySelector('input[name="del_proj_chats"]:checked');
      var deleteChatsFlag = selectedEl && selectedEl.value === 'delete';

      if (deleteChatsFlag) {
        var chk = modalWrap.querySelector('#aiw-del-chats-confirm-checkbox');
        if (!chk || !chk.checked) {
          notifyToast('请先勾选二次确认复选框');
          return;
        }
      }

      await S().deleteProject(project.id, deleteChatsFlag);
      await syncWorkspaceState({ deletedProjectId: project.id, deleteChatsFlag: deleteChatsFlag });
      notifyToast(deleteChatsFlag ? '项目及关联聊天已全部删除' : '项目已删除，聊天已保留并移出项目');
      modalWrap.remove();
      if (typeof onDeleted === 'function') onDeleted();
    });
  }

  async function openMoveChatsModal(page, project, onMoved) {
    var allChats = await S().listChats();
    var allProjects = await S().listProjects();
    var projNameMap = {};
    allProjects.forEach(function(p) { projNameMap[p.id] = p.name; });

    var candidateChats = allChats.filter(function(c) { return c && c.projectId !== project.id; });

    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';

    var chatsListHtml = candidateChats.length === 0 ? (
      '<div class="aiw-empty-state"><div class="aiw-empty-desc">没有可移动的其他聊天</div></div>'
    ) : (
      candidateChats.map(function(c) {
        var fromLabel = c.projectId
          ? ('当前归属：' + (projNameMap[c.projectId] || '其他项目'))
          : '普通聊天（未归类）';
        return (
          '<label class="aiw-move-chat-item">' +
            '<input type="checkbox" class="aiw-move-chat-chk" value="' + escapeHtml(c.id) + '">' +
            '<div class="aiw-move-chat-info">' +
              '<div class="aiw-move-chat-title">' + escapeHtml(c.title || '新对话') + '</div>' +
              '<div class="aiw-move-chat-sub">' + escapeHtml(fromLabel) + '</div>' +
            '</div>' +
          '</label>'
        );
      }).join('')
    );

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-move-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title">移动聊天到项目：' + escapeHtml(project.name) + '</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body aiw-move-chat-body">' +
          '<div class="aiw-move-chat-hint">每个聊天最多归属一个项目，移动后将自动从原项目解除关联。</div>' +
          '<div class="aiw-move-chat-list">' + chatsListHtml + '</div>' +
          (project.defaultPresetId ? '<label class="aiw-checkbox-label" style="margin-top:10px;"><input type="checkbox" id="aiw-move-apply-proj-preset"> <span>同时改用该项目的默认预设（默认保留聊天原有预设）</span></label>' : '') +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-proj-move-cancel">取消</button>' +
          '<button type="button" class="aiw-primary-btn" id="aiw-proj-move-confirm">确认移动</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);

    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-proj-move-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });

    modalWrap.querySelector('#aiw-proj-move-confirm').addEventListener('click', async function() {
      var checkedBoxes = modalWrap.querySelectorAll('.aiw-move-chat-chk:checked');
      if (checkedBoxes.length === 0) {
        notifyToast('请至少选择一个聊天');
        return;
      }

      var applyChk = modalWrap.querySelector('#aiw-move-apply-proj-preset');
      var applyPreset = !!(applyChk && applyChk.checked);
      for (var i = 0; i < checkedBoxes.length; i++) {
        var cid = checkedBoxes[i].value;
        await S().assignChatToProject(cid, project.id, { applyProjectPreset: applyPreset });
      }

      await syncWorkspaceState({ movedToProjectId: project.id });
      notifyToast('已将 ' + checkedBoxes.length + ' 个聊天移动到本项目');
      modalWrap.remove();
      if (typeof onMoved === 'function') onMoved();
    });
  }

  // 从侧边栏聊天操作菜单快速设置/变更单个聊天的所属项目
  async function openChatAssignProjectModal(page, chat, onChanged) {
    if (!page || !chat || !S()) return;
    var projects = await S().listProjects();

    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';

    var optionsHtml =
      '<label class="aiw-move-chat-item">' +
        '<input type="radio" name="assign_proj_id" value=""' + (!chat.projectId ? ' checked' : '') + '>' +
        '<div class="aiw-move-chat-info">' +
          '<div class="aiw-move-chat-title">普通聊天（不归属任何项目）</div>' +
          '<div class="aiw-move-chat-sub">独立于所有项目</div>' +
        '</div>' +
      '</label>' +
      projects.map(function(p) {
        var checked = chat.projectId === p.id ? ' checked' : '';
        return (
          '<label class="aiw-move-chat-item">' +
            '<input type="radio" name="assign_proj_id" value="' + escapeHtml(p.id) + '"' + checked + '>' +
            '<div class="aiw-move-chat-info">' +
              '<div class="aiw-move-chat-title"><i class="' + escapeHtml(p.icon || 'fa-solid fa-folder') + '" style="color:' + escapeHtml(p.color || '#ec4899') + '; margin-right:6px;"></i>' + escapeHtml(p.name) + '</div>' +
              (p.description ? '<div class="aiw-move-chat-sub">' + escapeHtml(p.description) + '</div>' : '') +
            '</div>' +
          '</label>'
        );
      }).join('');

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-move-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title">设置所属项目</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body aiw-move-chat-body">' +
          '<div class="aiw-move-chat-hint">对话：<strong>' + escapeHtml(chat.title || '新对话') + '</strong></div>' +
          '<div class="aiw-move-chat-list">' + optionsHtml + '</div>' +
          '<label class="aiw-checkbox-label" style="margin-top:10px;"><input type="checkbox" id="aiw-assign-apply-proj-preset"> <span>若目标项目设置了默认预设，则改用项目默认预设（默认保留原预设）</span></label>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-proj-assign-cancel">取消</button>' +
          '<button type="button" class="aiw-primary-btn" id="aiw-proj-assign-save">保存</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);
    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-proj-assign-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });

    modalWrap.querySelector('#aiw-proj-assign-save').addEventListener('click', async function() {
      var selectedEl = modalWrap.querySelector('input[name="assign_proj_id"]:checked');
      var targetProjectId = selectedEl ? selectedEl.value : '';
      var applyChk = modalWrap.querySelector('#aiw-assign-apply-proj-preset');
      var applyPreset = !!(applyChk && applyChk.checked);
      await S().assignChatToProject(chat.id, targetProjectId, { applyProjectPreset: applyPreset });
      await syncWorkspaceState({ movedChatId: chat.id, nextProjectId: targetProjectId });
      modalWrap.remove();
      notifyToast(targetProjectId ? '已移动到所选项目' : '已移出项目');
      if (typeof onChanged === 'function') onChanged(targetProjectId);
    });
  }


  var MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async function parseUploadedFile(file) {
    if (!file) throw new Error('无效文件');
    var name = file.name || '未命名文件';
    var ext = name.indexOf('.') !== -1 ? name.split('.').pop().toLowerCase() : '';
    var size = Number(file.size) || 0;

    if (size > MAX_UPLOAD_BYTES) {
      throw new Error('文件体积超过 15MB 上限');
    }

    if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
      var text = await file.text();
      if (!String(text || '').trim()) {
        throw new Error('文件内容为空');
      }
      return { name: name, type: ext, size: size, content: text };
    }

    if (ext === 'docx') {
      if (typeof global.mammoth === 'undefined') {
        throw new Error('DOCX 解析库未加载，无法解析该文件');
      }
      var arrayBuffer = await file.arrayBuffer();
      var result = await global.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      var docText = result && result.value ? result.value : '';
      if (!docText.trim()) {
        throw new Error('DOCX 文件内容为空或无法提取文字');
      }
      return { name: name, type: ext, size: size, content: docText };
    }

    if (ext === 'pdf') {
      if (typeof global.pdfjsLib === 'undefined') {
        throw new Error('PDF 解析库未加载，无法解析该文件');
      }
      var pdfBuf = await file.arrayBuffer();
      var loadingTask = global.pdfjsLib.getDocument({ data: pdfBuf });
      var pdfDoc = await loadingTask.promise;
      var maxPages = pdfDoc.numPages || 0;
      var textParts = [];
      var pagesArr = [];
      for (var i = 1; i <= maxPages; i++) {
        var pdfPage = await pdfDoc.getPage(i);
        var textContent = await pdfPage.getTextContent();
        var pageText = (textContent.items || []).map(function(item) { return item.str || ''; }).join(' ').trim();
        pagesArr.push({ page: i, text: pageText });
        if (pageText) textParts.push(pageText);
        if (i % 5 === 0) {
          await new Promise(function(r) { setTimeout(r, 0); });
        }
      }
      var pdfText = textParts.join('\n\n').trim();
      if (!pdfText) {
        throw new Error('PDF 文件无可用文本（可能是纯扫描图片）');
      }
      return { name: name, type: ext, size: size, content: pdfText, pageCount: maxPages, pages: pagesArr };
    }

    throw new Error('不支持的文件格式（.' + (ext || '未知') + '），目前仅支持 TXT、Markdown、PDF、DOCX');
  }

  function openDocRenameModal(page, project, doc, onRenamed) {
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
            '<label class="aiw-form-label" for="aiw-doc-rename-input">文件名称</label>' +
            '<input type="text" class="aiw-field-input" id="aiw-doc-rename-input" value="' + escapeHtml(doc.name || '') + '" maxlength="100">' +
          '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-doc-ren-cancel">取消</button>' +
          '<button type="button" class="aiw-primary-btn" id="aiw-doc-ren-save">保存</button>' +
        '</div>' +
      '</div>';
    page.appendChild(modalWrap);
    var inputEl = modalWrap.querySelector('#aiw-doc-rename-input');
    setTimeout(function() { try { inputEl.focus(); inputEl.select(); } catch (_) {} }, 40);
    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-doc-ren-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });
    modalWrap.querySelector('#aiw-doc-ren-save').addEventListener('click', async function() {
      var clean = (inputEl.value || '').trim();
      if (!clean) {
        notifyToast('文件名不能为空');
        inputEl.focus();
        return;
      }
      await S().renameProjectDocument(doc.id, clean, project.id);
      modalWrap.remove();
      notifyToast('资料已重命名');
      if (typeof onRenamed === 'function') onRenamed();
    });
  }

  function openDocDeleteConfirmModal(page, project, doc, onDeleted) {
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';
    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-delete-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title" style="color: #e11d48;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i>删除项目资料</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<p class="aiw-st-modal-msg">确定要删除资料「<strong>' + escapeHtml(doc.name) + '</strong>」吗？删除后后续对话将不再检索其内容。</p>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-doc-del-cancel">取消</button>' +
          '<button type="button" class="aiw-danger-btn" id="aiw-doc-del-ok">确认删除</button>' +
        '</div>' +
      '</div>';
    page.appendChild(modalWrap);
    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-doc-del-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });
    modalWrap.querySelector('#aiw-doc-del-ok').addEventListener('click', async function() {
      await S().deleteProjectDocument(doc.id, project.id);
      modalWrap.remove();
      notifyToast('资料已删除');
      if (typeof onDeleted === 'function') onDeleted();
    });
  }

  function openDocPreviewModal(page, doc) {
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';
    var chunkCount = Array.isArray(doc.chunks) ? doc.chunks.length : 0;
    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-center-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title"><i class="fa-solid fa-file-lines" style="color:var(--aiw-pink-deep); margin-right:8px;"></i>' + escapeHtml(doc.name) + '</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div class="aiw-proj-detail-meta" style="margin-bottom:10px;">' +
            '<span>类型：' + escapeHtml((doc.type || 'txt').toUpperCase()) + '</span>' +
            '<span>大小：' + escapeHtml(formatBytes(doc.size)) + '</span>' +
            '<span>切片数：' + chunkCount + '</span>' +
            '<span>上传于：' + escapeHtml(formatTime(doc.createdAt)) + '</span>' +
          '</div>' +
          '<div class="aiw-doc-preview-content">' + escapeHtml(doc.content || '') + '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-primary-btn" id="aiw-doc-preview-close">关闭</button>' +
        '</div>' +
      '</div>';
    page.appendChild(modalWrap);
    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-doc-preview-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });
  }

  async function openProjectDocumentsModal(page, project, onBack) {
    var docs = await S().listProjectDocuments(project.id);
    var color = project.color || '#ec4899';

    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';

    function renderDocsContent() {
      var bodyEl = modalWrap.querySelector('#aiw-doc-list-container');
      if (!bodyEl) return;

      if (docs.length === 0) {
        bodyEl.innerHTML =
          '<div class="aiw-empty-state">' +
            '<div class="aiw-empty-icon" style="color: ' + escapeHtml(color) + ';"><i class="fa-solid fa-file-lines"></i></div>' +
            '<div class="aiw-empty-title">当前项目暂无资料文件</div>' +
            '<div class="aiw-empty-desc">支持上传 TXT、Markdown、PDF、DOCX 格式文件（支持多选）。资料仅作用于本项目对话检索，与长期记忆完全独立。</div>' +
            '<button type="button" class="aiw-primary-btn" id="aiw-doc-upload-empty-btn" style="background-color: ' + escapeHtml(color) + ';"><i class="fa-solid fa-upload"></i> 上传资料文件</button>' +
          '</div>';

        var upEmptyBtn = bodyEl.querySelector('#aiw-doc-upload-empty-btn');
        if (upEmptyBtn) {
          upEmptyBtn.addEventListener('click', function() {
            modalWrap.querySelector('#aiw-doc-file-input').click();
          });
        }
      } else {
        bodyEl.innerHTML =
          '<div class="aiw-proj-chat-list">' +
            docs.map(function(doc) {
              var dateStr = formatTime(doc.createdAt || doc.updatedAt || Date.now());
              var sizeStr = formatBytes(doc.size);
              var iconClass = 'fa-solid fa-file-lines';
              if (doc.type === 'pdf') iconClass = 'fa-solid fa-file-pdf';
              else if (doc.type === 'docx') iconClass = 'fa-solid fa-file-word';
              else if (doc.type === 'md' || doc.type === 'markdown') iconClass = 'fa-solid fa-file-code';

              return (
                '<div class="aiw-proj-chat-item" data-doc-id="' + escapeHtml(doc.id) + '">' +
                  '<div class="aiw-proj-doc-row-left">' +
                    '<div class="aiw-proj-detail-badge" style="background:' + escapeHtml(color) + '1a; color:' + escapeHtml(color) + ';"><i class="' + iconClass + '"></i></div>' +
                    '<div class="aiw-proj-chat-info">' +
                      '<div class="aiw-proj-chat-title" title="' + escapeHtml(doc.name) + '">' + escapeHtml(doc.name) + '</div>' +
                      '<div class="aiw-proj-chat-sub">' + escapeHtml((doc.type || 'txt').toUpperCase()) + ' · ' + escapeHtml(sizeStr) + ' · ' + escapeHtml(dateStr) + '</div>' +
                    '</div>' +
                  '</div>' +
                  '<div class="aiw-proj-chat-actions">' +
                    '<button type="button" class="aiw-icon-btn aiw-doc-view-btn" data-doc-id="' + escapeHtml(doc.id) + '" title="查看"><i class="fa-solid fa-eye"></i></button>' +
                    '<button type="button" class="aiw-icon-btn aiw-doc-rename-btn" data-doc-id="' + escapeHtml(doc.id) + '" title="重命名"><i class="fa-solid fa-pen"></i></button>' +
                    '<button type="button" class="aiw-icon-btn is-danger aiw-doc-delete-btn" data-doc-id="' + escapeHtml(doc.id) + '" title="删除"><i class="fa-regular fa-trash-can"></i></button>' +
                  '</div>' +
                '</div>'
              );
            }).join('') +
          '</div>';

        modalWrap.querySelectorAll('.aiw-doc-view-btn').forEach(function(btn) {
          btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            var did = btn.getAttribute('data-doc-id');
            var doc = await S().getProjectDocument(did, project.id);
            if (doc) openDocPreviewModal(page, doc);
          });
        });

        modalWrap.querySelectorAll('.aiw-doc-rename-btn').forEach(function(btn) {
          btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            var did = btn.getAttribute('data-doc-id');
            var doc = await S().getProjectDocument(did, project.id);
            if (!doc) return;
            openDocRenameModal(page, project, doc, async function() {
              docs = await S().listProjectDocuments(project.id);
              renderDocsContent();
            });
          });
        });

        modalWrap.querySelectorAll('.aiw-doc-delete-btn').forEach(function(btn) {
          btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            var did = btn.getAttribute('data-doc-id');
            var doc = await S().getProjectDocument(did, project.id);
            if (!doc) return;
            openDocDeleteConfirmModal(page, project, doc, async function() {
              docs = await S().listProjectDocuments(project.id);
              renderDocsContent();
            });
          });
        });
      }

      var countEl = modalWrap.querySelector('#aiw-doc-count-badge');
      if (countEl) countEl.textContent = String(docs.length);
    }

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-center-modal" role="dialog" aria-modal="true" aria-label="项目资料">' +
        '<div class="aiw-ws-modal-head" style="border-bottom: 2px solid ' + escapeHtml(color) + '33;">' +
          '<div class="aiw-proj-detail-head-left">' +
            '<button type="button" class="aiw-icon-btn" id="aiw-doc-back-btn" title="返回项目详情"><i class="fa-solid fa-arrow-left"></i></button>' +
            '<div class="aiw-ws-modal-title">项目资料：' + escapeHtml(project.name) + ' <span class="aiw-proj-meta-pill" id="aiw-doc-count-badge">' + docs.length + '</span></div>' +
          '</div>' +
          '<div class="aiw-modal-head-right">' +
            '<input type="file" id="aiw-doc-file-input" accept=".txt,.md,.markdown,.pdf,.docx" multiple style="display:none;">' +
            '<button type="button" class="aiw-primary-btn aiw-btn-sm" id="aiw-doc-upload-btn" style="background-color: ' + escapeHtml(color) + ';"><i class="fa-solid fa-upload"></i> 上传资料</button>' +
            '<button type="button" class="aiw-ws-modal-close" id="aiw-doc-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-body aiw-projects-body">' +
          '<div class="aiw-projects-summary">支持 TXT、Markdown、PDF、DOCX；仅作用于本项目问答检索，不写入长期记忆。</div>' +
          '<div class="aiw-projects-list-container" id="aiw-doc-list-container"></div>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);
    renderDocsContent();

    function closeAndBack() {
      modalWrap.remove();
      if (typeof onBack === 'function') onBack();
    }

    modalWrap.querySelector('#aiw-doc-modal-close').addEventListener('click', closeAndBack);
    modalWrap.querySelector('#aiw-doc-back-btn').addEventListener('click', closeAndBack);
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) closeAndBack(); });

    var uploadBtn = modalWrap.querySelector('#aiw-doc-upload-btn');
    var fileInput = modalWrap.querySelector('#aiw-doc-file-input');
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', function() { fileInput.click(); });
      fileInput.addEventListener('change', async function() {
        var files = fileInput.files;
        if (!files || files.length === 0) return;
        var successCount = 0;
        var errors = [];

        for (var i = 0; i < files.length; i++) {
          var file = files[i];
          try {
            var parsed = await parseUploadedFile(file);
            await S().saveProjectDocument({
              projectId: project.id,
              name: parsed.name,
              type: parsed.type,
              size: parsed.size,
              content: parsed.content
            });
            successCount++;
          } catch (err) {
            errors.push((file && file.name ? file.name : '文件') + '：' + (err && err.message ? err.message : '解析失败'));
          }
        }

        fileInput.value = '';
        docs = await S().listProjectDocuments(project.id);
        renderDocsContent();

        if (successCount > 0) {
          notifyToast('成功上传并解析 ' + successCount + ' 份资料');
        }
        if (errors.length > 0) {
          notifyToast('部分文件未能导入：' + errors[0]);
        }
      });
    }
  }


  function openProjectQuickActionsModal(page, project, onDone) {
    if (!page || !project) return;
    var color = project.color || '#ec4899';
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open aiw-proj-submodal-backdrop';
    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-edit-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-proj-detail-head-left">' +
            '<div class="aiw-proj-detail-badge" style="background:' + escapeHtml(color) + '1a; color:' + escapeHtml(color) + ';">' +
              renderProjectIconHtml(project.icon) +
            '</div>' +
            '<div class="aiw-ws-modal-title">' + escapeHtml(project.name) + '</div>' +
          '</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div class="aiw-picker-list">' +
            '<button type="button" class="aiw-picker-item" data-proj-act="rename">' +
              '<span class="aiw-picker-icon"><i class="fa-solid fa-i-cursor"></i></span>' +
              '<div class="aiw-picker-text"><div class="aiw-picker-title">重命名项目</div></div>' +
            '</button>' +
            '<button type="button" class="aiw-picker-item" data-proj-act="edit">' +
              '<span class="aiw-picker-icon"><i class="fa-solid fa-palette"></i></span>' +
              '<div class="aiw-picker-text"><div class="aiw-picker-title">编辑图标、颜色与项目设置</div></div>' +
            '</button>' +
            '<button type="button" class="aiw-picker-item" data-proj-act="detail">' +
              '<span class="aiw-picker-icon"><i class="fa-regular fa-folder-open"></i></span>' +
              '<div class="aiw-picker-text"><div class="aiw-picker-title">打开项目详情（聊天与资料库）</div></div>' +
            '</button>' +
            '<button type="button" class="aiw-picker-item is-danger-item" data-proj-act="delete">' +
              '<span class="aiw-picker-icon"><i class="fa-regular fa-trash-can"></i></span>' +
              '<div class="aiw-picker-text"><div class="aiw-picker-title">删除项目</div></div>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);
    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });

    modalWrap.querySelector('[data-proj-act="rename"]').addEventListener('click', function() {
      modalWrap.remove();
      openProjectRenameModal(page, project, onDone);
    });
    modalWrap.querySelector('[data-proj-act="edit"]').addEventListener('click', function() {
      modalWrap.remove();
      openProjectEditModal(page, project, onDone, onDone);
    });
    modalWrap.querySelector('[data-proj-act="detail"]').addEventListener('click', function() {
      modalWrap.remove();
      openProjectDetail(page, project.id, {});
    });
    modalWrap.querySelector('[data-proj-act="delete"]').addEventListener('click', function() {
      modalWrap.remove();
      openProjectDeleteConfirmModal(page, project, onDone);
    });
  }


  function closeProjectPopoverMenu(page) {
    var root = page || document;
    var existing = root.querySelector('#aiw-proj-popover-menu');
    if (existing) {
      if (typeof existing._cleanup === 'function') existing._cleanup();
      existing.remove();
    }
  }

  function openProjectPopoverMenu(page, project, triggerEl, handlers) {
    if (!page || !project) return;
    var opts = handlers && typeof handlers === 'object' ? handlers : {};
    closeProjectPopoverMenu(page);

    var menu = document.createElement('div');
    menu.id = 'aiw-proj-popover-menu';
    menu.className = 'aiw-proj-popover';
    menu.setAttribute('role', 'menu');

    var isHomeMode = opts.mode === 'home';
    var pinLabel = project.pinned ? '取消置顶' : '置顶项目';

    var itemsHtml = '';
    if (!isHomeMode) {
      itemsHtml +=
        '<button type="button" class="aiw-proj-popover-item" role="menuitem" data-pop-act="rename">' +
          '<i class="fa-solid fa-i-cursor"></i><span>重命名项目</span>' +
        '</button>' +
        '<button type="button" class="aiw-proj-popover-item" role="menuitem" data-pop-act="settings">' +
          '<i class="fa-solid fa-gear"></i><span>项目设置</span>' +
        '</button>' +
        '<button type="button" class="aiw-proj-popover-item" role="menuitem" data-pop-act="home">' +
          '<i class="fa-regular fa-compass"></i><span>项目主页</span>' +
        '</button>' +
        '<button type="button" class="aiw-proj-popover-item" role="menuitem" data-pop-act="pin">' +
          '<i class="fa-solid fa-thumbtack"></i><span>' + pinLabel + '</span>' +
        '</button>' +
        '<div class="aiw-proj-popover-divider"></div>' +
        '<button type="button" class="aiw-proj-popover-item is-danger" role="menuitem" data-pop-act="delete">' +
          '<i class="fa-regular fa-trash-can"></i><span>删除项目</span>' +
        '</button>';
    } else {
      itemsHtml +=
        '<button type="button" class="aiw-proj-popover-item" role="menuitem" data-pop-act="settings">' +
          '<i class="fa-solid fa-gear"></i><span>项目设置</span>' +
        '</button>' +
        '<button type="button" class="aiw-proj-popover-item" role="menuitem" data-pop-act="pin">' +
          '<i class="fa-solid fa-thumbtack"></i><span>' + pinLabel + '</span>' +
        '</button>';
    }

    menu.innerHTML = itemsHtml;
    page.appendChild(menu);

    // 定位到触发按钮附近，并在空间不足时自动翻转
    if (triggerEl && typeof triggerEl.getBoundingClientRect === 'function') {
      var pageRect = page.getBoundingClientRect();
      var btnRect = triggerEl.getBoundingClientRect();
      var menuW = menu.offsetWidth || 176;
      var menuH = menu.offsetHeight || 200;
      var left = btnRect.right - pageRect.left - menuW;
      if (left < 8) left = Math.max(8, btnRect.left - pageRect.left);
      if (left + menuW > pageRect.width - 8) left = Math.max(8, pageRect.width - menuW - 8);
      var top = btnRect.bottom - pageRect.top + 6;
      if (top + menuH > pageRect.height - 12) {
        top = Math.max(8, btnRect.top - pageRect.top - menuH - 6);
      }
      menu.style.left = Math.round(left) + 'px';
      menu.style.top = Math.round(top) + 'px';
    }

    function onDocClick(e) {
      if (!menu.contains(e.target) && (!triggerEl || !triggerEl.contains(e.target))) {
        closeProjectPopoverMenu(page);
      }
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        closeProjectPopoverMenu(page);
      }
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

    var doneCb = function() {
      if (typeof opts.onDone === 'function') opts.onDone();
    };

    var renBtn = menu.querySelector('[data-pop-act="rename"]');
    if (renBtn) renBtn.addEventListener('click', function() {
      closeProjectPopoverMenu(page);
      openProjectRenameModal(page, project, doneCb);
    });

    var setBtn = menu.querySelector('[data-pop-act="settings"]');
    if (setBtn) setBtn.addEventListener('click', function() {
      closeProjectPopoverMenu(page);
      openProjectEditModal(page, project, doneCb, function() {
        if (typeof opts.onDeleted === 'function') opts.onDeleted();
        else doneCb();
      });
    });

    var homeBtn = menu.querySelector('[data-pop-act="home"]');
    if (homeBtn) homeBtn.addEventListener('click', function() {
      closeProjectPopoverMenu(page);
      if (typeof opts.onOpenHome === 'function') {
        opts.onOpenHome(project.id);
      } else if (W() && typeof W().openProjectHome === 'function') {
        W().openProjectHome(page, project.id);
      }
    });

    var pinBtn = menu.querySelector('[data-pop-act="pin"]');
    if (pinBtn) pinBtn.addEventListener('click', async function() {
      closeProjectPopoverMenu(page);
      if (S() && typeof S().togglePinProject === 'function') {
        var updated = await S().togglePinProject(project.id);
        await syncWorkspaceState({ updatedProjectId: project.id });
        notifyToast(updated && updated.pinned ? '已置顶项目' : '已取消置顶');
        doneCb();
      }
    });

    var delBtn = menu.querySelector('[data-pop-act="delete"]');
    if (delBtn) delBtn.addEventListener('click', function() {
      closeProjectPopoverMenu(page);
      openProjectDeleteConfirmModal(page, project, function() {
        if (typeof opts.onDeleted === 'function') opts.onDeleted();
        else doneCb();
      });
    });
  }

  global.AiWorkspaceProjects = {
    openProjectsCenter: openProjectsCenter,
    openProjectDetail: openProjectDetail,
    openProjectQuickActionsModal: openProjectQuickActionsModal,
    openProjectPopoverMenu: openProjectPopoverMenu,
    closeProjectPopoverMenu: closeProjectPopoverMenu,
    openProjectRenameModal: openProjectRenameModal,
    openProjectEditModal: openProjectEditModal,
    openProjectDeleteConfirmModal: openProjectDeleteConfirmModal,
    openChatRenameModal: openChatRenameModal,
    openChatDeleteConfirmModal: openChatDeleteConfirmModal,
    openDocPreviewModal: openDocPreviewModal,
    openDocRenameModal: openDocRenameModal,
    openDocDeleteConfirmModal: openDocDeleteConfirmModal,
    renderProjectIconHtml: renderProjectIconHtml,
    formatBytes: formatBytes,
    formatTime: formatTime,
    openProjectDocumentsModal: openProjectDocumentsModal,
    parseUploadedFile: parseUploadedFile,
    closeProjectsModal: closeProjectsModal,
    openChatAssignProjectModal: openChatAssignProjectModal,
    getReservedExtensionsSchema: getReservedExtensionsSchema
  };

})(typeof window !== 'undefined' ? window : globalThis);
