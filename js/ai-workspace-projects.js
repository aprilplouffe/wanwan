// ai-workspace-projects.js — 知屿（AI 工作空间）项目管理模块（项目列表、详情、聊天归属隔离、新建/移动聊天及安全删除）
(function(global) {
  'use strict';

  function S() {
    return global.AiWorkspaceStorage;
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

  var PROJECT_ICONS = [
    { id: 'fa-solid fa-folder', label: '默认文件夹' },
    { id: 'fa-solid fa-briefcase', label: '工作业务' },
    { id: 'fa-solid fa-book', label: '学习资料' },
    { id: 'fa-solid fa-laptop-code', label: '技术开发' },
    { id: 'fa-solid fa-compass', label: '规划探索' },
    { id: 'fa-solid fa-star', label: '核心目标' },
    { id: 'fa-solid fa-heart', label: '生活灵感' },
    { id: 'fa-solid fa-lightbulb', label: '创意头脑' }
  ];

  var PROJECT_COLORS = [
    { id: '#ec4899', label: '粉红' },
    { id: '#e11d48', label: '珊瑚红' },
    { id: '#2563eb', label: '晴空蓝' },
    { id: '#059669', label: '鼠尾草' },
    { id: '#d97706', label: '琥珀金' },
    { id: '#7c3aed', label: '优雅紫' },
    { id: '#27272a', label: '极简黑' }
  ];

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
    closeProjectsModal(page);
    var projects = await S().listProjects();
    var allChats = await S().listChats();

    // 计算每个项目的聊天数
    var chatCountMap = {};
    for (var i = 0; i < allChats.length; i++) {
      var c = allChats[i];
      if (c.projectId) {
        chatCountMap[c.projectId] = (chatCountMap[c.projectId] || 0) + 1;
      }
    }

    var unassignedCount = allChats.filter(function(c) { return !c.projectId; }).length;

    var wrap = document.createElement('div');
    wrap.id = 'aiw-projects-modal-wrap';
    wrap.className = 'aiw-ws-modal-backdrop open';

    var projectsHtml = projects.length === 0 ? (
      '<div class="aiw-empty-state">' +
        '<div class="aiw-empty-icon"><i class="fa-regular fa-folder-open"></i></div>' +
        '<div class="aiw-empty-title">还没有创建任何项目</div>' +
        '<div class="aiw-empty-desc">项目可将相关的多个聊天归类管理，保持工作空间井然有序。</div>' +
        '<button type="button" class="aiw-primary-btn" id="aiw-proj-create-first-btn">' +
          '<i class="fa-solid fa-plus"></i> 创建第一个项目' +
        '</button>' +
      '</div>'
    ) : (
      '<div class="aiw-projects-grid">' +
        projects.map(function(p) {
          var count = chatCountMap[p.id] || 0;
          var color = p.color || '#ec4899';
          return (
            '<div class="aiw-project-card" data-project-id="' + escapeHtml(p.id) + '" style="border-left-color: ' + escapeHtml(color) + ';">' +
              '<div class="aiw-project-card-head">' +
                '<div class="aiw-project-card-icon" style="background-color: ' + escapeHtml(color) + '22; color: ' + escapeHtml(color) + ';">' +
                  '<i class="' + escapeHtml(p.icon || 'fa-solid fa-folder') + '"></i>' +
                '</div>' +
                '<div class="aiw-project-card-meta">' +
                  '<div class="aiw-project-card-title">' + escapeHtml(p.name) + '</div>' +
                  '<div class="aiw-project-card-subtitle">' + count + ' 个聊天对话</div>' +
                '</div>' +
                '<div class="aiw-project-card-actions">' +
                  '<button type="button" class="aiw-icon-btn aiw-proj-edit-btn" data-proj-id="' + escapeHtml(p.id) + '" title="编辑项目"><i class="fa-solid fa-pen"></i></button>' +
                '</div>' +
              '</div>' +
              (p.description ? '<div class="aiw-project-card-desc">' + escapeHtml(p.description) + '</div>' : '') +
              '<div class="aiw-project-card-foot">' +
                '<span class="aiw-project-card-tag" style="color: ' + escapeHtml(color) + ';">进入项目</span>' +
                '<i class="fa-solid fa-angle-right" style="color: ' + escapeHtml(color) + ';"></i>' +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );

    wrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-center-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title"><i class="fa-regular fa-folder" style="margin-right: 8px; color: var(--aiw-accent);"></i>我的项目 (' + projects.length + ')</div>' +
          '<div class="aiw-modal-head-right">' +
            '<button type="button" class="aiw-secondary-btn" id="aiw-proj-new-btn"><i class="fa-solid fa-plus"></i> 新建项目</button>' +
            '<button type="button" class="aiw-ws-modal-close" id="aiw-proj-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-body aiw-projects-body">' +
          '<div class="aiw-projects-toolbar">' +
            '<div class="aiw-search-box aiw-projects-search">' +
              '<i class="fa-solid fa-magnifying-glass"></i>' +
              '<input type="search" id="aiw-proj-search-input" placeholder="搜索项目名称或简介..." aria-label="搜索项目">' +
            '</div>' +
            '<div class="aiw-projects-summary">未归类聊天: <strong>' + unassignedCount + '</strong> 个</div>' +
          '</div>' +
          '<div class="aiw-projects-list-container" id="aiw-projects-list-wrap">' +
            projectsHtml +
          '</div>' +
        '</div>' +
      '</div>';

    page.appendChild(wrap);

    // 事件绑定
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

    wrap.querySelectorAll('.aiw-proj-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var pid = btn.getAttribute('data-proj-id');
        S().getProject(pid).then(function(proj) {
          if (proj) {
            openProjectEditModal(page, proj, function() {
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
        wrap.querySelectorAll('.aiw-project-card').forEach(function(card) {
          var text = card.textContent.toLowerCase();
          card.style.display = (!q || text.indexOf(q) !== -1) ? '' : 'none';
        });
      });
    }
  }

  async function openProjectDetail(page, projectId, opts) {
    var project = await S().getProject(projectId);
    if (!project) {
      notifyToast('项目不存在或已被删除');
      renderProjectsHome(page, opts);
      return;
    }

    closeProjectsModal(page);
    var allChats = await S().listChats();
    var projectChats = allChats.filter(function(c) { return c.projectId === projectId; });

    var wrap = document.createElement('div');
    wrap.id = 'aiw-projects-modal-wrap';
    wrap.className = 'aiw-ws-modal-backdrop open';

    var color = project.color || '#ec4899';
    var chatsHtml = projectChats.length === 0 ? (
      '<div class="aiw-empty-state">' +
        '<div class="aiw-empty-icon" style="color: ' + escapeHtml(color) + ';"><i class="' + escapeHtml(project.icon || 'fa-solid fa-folder') + '"></i></div>' +
        '<div class="aiw-empty-title">该项目下暂无聊天</div>' +
        '<div class="aiw-empty-desc">您可以点击下方按钮在本项目中新建 AI 对话，或将已有聊天移动到本项目中。</div>' +
        '<div class="aiw-empty-actions">' +
          '<button type="button" class="aiw-primary-btn" id="aiw-proj-new-chat-btn" style="background-color: ' + escapeHtml(color) + ';"><i class="fa-solid fa-plus"></i> 新建项目聊天</button>' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-proj-add-existing-btn"><i class="fa-solid fa-file-arrow-down"></i> 移动已有聊天</button>' +
        '</div>' +
      '</div>'
    ) : (
      '<div class="aiw-proj-chat-list">' +
        projectChats.map(function(c) {
          var msgCount = Array.isArray(c.messages) ? c.messages.length : 0;
          var dateStr = new Date(c.updatedAt || c.createdAt || Date.now()).toLocaleString();
          return (
            '<div class="aiw-proj-chat-item" data-chat-id="' + escapeHtml(c.id) + '">' +
              '<div class="aiw-proj-chat-info">' +
                '<div class="aiw-proj-chat-title">' + (c.pinned ? '<i class="fa-solid fa-thumbtack" style="color:var(--aiw-accent); margin-right:4px;"></i>' : '') + escapeHtml(c.title || '新对话') + '</div>' +
                '<div class="aiw-proj-chat-sub">' + msgCount + ' 条消息 · ' + escapeHtml(dateStr) + '</div>' +
              '</div>' +
              '<div class="aiw-proj-chat-actions">' +
                '<button type="button" class="aiw-icon-btn aiw-proj-open-chat" data-chat-id="' + escapeHtml(c.id) + '" title="打开并对话"><i class="fa-solid fa-comments"></i></button>' +
                '<button type="button" class="aiw-icon-btn aiw-proj-moveout-chat" data-chat-id="' + escapeHtml(c.id) + '" title="移出项目"><i class="fa-solid fa-share-from-square"></i></button>' +
                '<button type="button" class="aiw-icon-btn aiw-proj-delete-chat" data-chat-id="' + escapeHtml(c.id) + '" title="删除聊天"><i class="fa-regular fa-trash-can"></i></button>' +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );

    wrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-center-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head" style="border-bottom: 2px solid ' + escapeHtml(color) + '33;">' +
          '<div class="aiw-proj-detail-head-left">' +
            '<button type="button" class="aiw-icon-btn" id="aiw-proj-back-btn" title="返回项目列表"><i class="fa-solid fa-arrow-left"></i></button>' +
            '<div class="aiw-ws-modal-title">' +
              '<span style="color: ' + escapeHtml(color) + '; margin-right: 8px;"><i class="' + escapeHtml(project.icon || 'fa-solid fa-folder') + '"></i></span>' +
              escapeHtml(project.name) +
            '</div>' +
          '</div>' +
          '<div class="aiw-modal-head-right">' +
            '<button type="button" class="aiw-primary-btn" id="aiw-proj-new-chat-btn" style="background-color: ' + escapeHtml(color) + ';"><i class="fa-solid fa-plus"></i> 新建聊天</button>' +
            '<button type="button" class="aiw-secondary-btn" id="aiw-proj-docs-btn"><i class="fa-solid fa-file-lines"></i> 项目资料库</button>' +
            '<button type="button" class="aiw-secondary-btn" id="aiw-proj-add-existing-btn"><i class="fa-solid fa-file-arrow-down"></i> 移动聊天</button>' +
            '<button type="button" class="aiw-secondary-btn" id="aiw-proj-settings-btn"><i class="fa-solid fa-gear"></i> 设置</button>' +
            '<button type="button" class="aiw-ws-modal-close" id="aiw-proj-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-body aiw-projects-body">' +
          (project.description ? '<div class="aiw-proj-detail-desc">' + escapeHtml(project.description) + '</div>' : '') +
          '<div class="aiw-projects-toolbar">' +
            '<div class="aiw-projects-summary">项目内聊天列表 (<strong>' + projectChats.length + '</strong>)</div>' +
          '</div>' +
          '<div class="aiw-projects-list-container">' +
            chatsHtml +
          '</div>' +
        '</div>' +
      '</div>';

    page.appendChild(wrap);

    // 事件绑定
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

    var newChatBtns = wrap.querySelectorAll('#aiw-proj-new-chat-btn');
    newChatBtns.forEach(function(btn) {
      btn.addEventListener('click', async function() {
        closeProjectsModal(page);
        if (typeof global.AiWorkspace === 'object' && typeof global.AiWorkspace.createNewChatInProject === 'function') {
          await global.AiWorkspace.createNewChatInProject(page, project.id);
        } else {
          // Fallback
          var defPreset = typeof S().getDefaultPreset === 'function' ? await S().getDefaultPreset() : null;
          var newChat = await S().createChat({
            title: '新对话（' + project.name + '）',
            projectId: project.id,
            presetId: defPreset ? defPreset.id : '',
            presetSnapshot: defPreset ? S().buildPresetSnapshot(defPreset) : null
          });
          if (typeof global.AiWorkspace === 'object' && typeof global.AiWorkspace.loadChatIntoState === 'function') {
            await global.AiWorkspace.loadChatIntoState(page, newChat.id);
          }
        }
      });
    });

    var addExistingBtn = wrap.querySelector('#aiw-proj-add-existing-btn');
    if (addExistingBtn) {
      addExistingBtn.addEventListener('click', function() {
        openMoveChatsModal(page, project, function() {
          openProjectDetail(page, projectId, opts);
        });
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

    var settingsBtn = wrap.querySelector('#aiw-proj-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function() {
        openProjectEditModal(page, project, function() {
          openProjectDetail(page, projectId, opts);
        });
      });
    }

    wrap.querySelectorAll('.aiw-proj-open-chat').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var cid = btn.getAttribute('data-chat-id');
        closeProjectsModal(page);
        if (typeof global.AiWorkspace === 'object' && typeof global.AiWorkspace.loadChatIntoState === 'function') {
          await global.AiWorkspace.loadChatIntoState(page, cid);
        }
      });
    });

    wrap.querySelectorAll('.aiw-proj-moveout-chat').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var cid = btn.getAttribute('data-chat-id');
        var chat = await S().getChat(cid);
        if (chat) {
          chat.projectId = '';
          chat.updatedAt = Date.now();
          await S().saveChat(chat);
          notifyToast('已将聊天移出项目');
          openProjectDetail(page, projectId, opts);
        }
      });
    });

    wrap.querySelectorAll('.aiw-proj-delete-chat').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var cid = btn.getAttribute('data-chat-id');
        if (confirm('确定要删除该聊天吗？删除后不可恢复。')) {
          await S().deleteChat(cid);
          notifyToast('聊天已删除');
          openProjectDetail(page, projectId, opts);
        }
      });
    });
  }

  async function openProjectEditModal(page, existingProject, onSaved) {
    var isEdit = !!existingProject;
    var presets = typeof S().listPresets === 'function' ? await S().listPresets() : [];
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open';

    var nameVal = isEdit ? existingProject.name : '';
    var descVal = isEdit ? (existingProject.description || '') : '';
    var iconVal = isEdit ? (existingProject.icon || 'fa-solid fa-folder') : 'fa-solid fa-folder';
    var colorVal = isEdit ? (existingProject.color || '#ec4899') : '#ec4899';
    var defaultPresetIdVal = isEdit ? (existingProject.defaultPresetId || '') : '';
    var instructionsVal = isEdit ? (existingProject.instructions || '') : '';

    var presetOptionsHtml = '<option value="">跟随知屿全局默认预设</option>' + presets.map(function(p) {
      var sel = p.id === defaultPresetIdVal ? ' selected' : '';
      return '<option value="' + escapeHtml(p.id) + '"' + sel + '>' + escapeHtml(p.name) + '</option>';
    }).join('');

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-edit-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title">' + (isEdit ? '编辑项目与专属指令' : '新建项目') + '</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label">项目名称</label>' +
            '<input type="text" class="aiw-input" id="aiw-proj-form-name" value="' + escapeHtml(nameVal) + '" placeholder="例如：小说大纲创作、产品原型研究..." maxlength="50">' +
          '</div>' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label">项目简介 (选填)</label>' +
            '<textarea class="aiw-input" id="aiw-proj-form-desc" rows="2" placeholder="简要描述本项目的目标与范围..." maxlength="200">' + escapeHtml(descVal) + '</textarea>' +
          '</div>' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label">项目默认预设</label>' +
            '<select class="aiw-input" id="aiw-proj-form-preset">' + presetOptionsHtml + '</select>' +
            '<div style="font-size:11.5px; color:var(--aiw-hint); margin-top:4px;">本项目内新建聊天将自动继承此预设，已有聊天不受影响。</div>' +
          '</div>' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label">项目专属指令 (Prompt / 背景设定 / 工作规范)</label>' +
            '<textarea class="aiw-input" id="aiw-proj-form-instructions" rows="4" placeholder="规定项目背景、目标、工作规范、特定限制及项目内的回答要求..."></textarea>' +
            '<div style="font-size:11.5px; color:var(--aiw-hint); margin-top:4px;">项目指令将自动注入本项目内所有对话的 AI 上下文中，且严格与普通聊天隔离。</div>' +
          '</div>' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label">图标选择</label>' +
            '<div class="aiw-proj-icon-grid" id="aiw-proj-form-icons">' +
              PROJECT_ICONS.map(function(ic) {
                var active = ic.id === iconVal ? 'active' : '';
                return '<button type="button" class="aiw-proj-icon-opt ' + active + '" data-icon-id="' + escapeHtml(ic.id) + '" title="' + escapeHtml(ic.label) + '"><i class="' + escapeHtml(ic.id) + '"></i></button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="aiw-form-group">' +
            '<label class="aiw-form-label">主题色</label>' +
            '<div class="aiw-proj-color-grid" id="aiw-proj-form-colors">' +
              PROJECT_COLORS.map(function(cl) {
                var active = cl.id === colorVal ? 'active' : '';
                return '<button type="button" class="aiw-proj-color-opt ' + active + '" data-color-id="' + escapeHtml(cl.id) + '" style="background-color: ' + escapeHtml(cl.id) + ';" title="' + escapeHtml(cl.label) + '"></button>';
              }).join('') +
            '</div>' +
          '</div>' +
          (isEdit ? '<div class="aiw-form-group" style="margin-top: 24px; border-top: 1px solid var(--aiw-border); padding-top: 16px;"><button type="button" class="aiw-danger-btn" id="aiw-proj-delete-btn"><i class="fa-regular fa-trash-can"></i> 删除项目...</button></div>' : '') +
        '</div>' +
        '<div class="aiw-ws-modal-foot">' +
          '<button type="button" class="aiw-secondary-btn" id="aiw-proj-form-cancel">取消</button>' +
          '<button type="button" class="aiw-primary-btn" id="aiw-proj-form-save">保存项目</button>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);

    var instTa = modalWrap.querySelector('#aiw-proj-form-instructions');
    if (instTa) instTa.value = instructionsVal;

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

    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-proj-form-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });

    modalWrap.querySelector('#aiw-proj-form-save').addEventListener('click', async function() {
      var nameInput = modalWrap.querySelector('#aiw-proj-form-name');
      var descInput = modalWrap.querySelector('#aiw-proj-form-desc');
      var presetSelect = modalWrap.querySelector('#aiw-proj-form-preset');
      var instInput = modalWrap.querySelector('#aiw-proj-form-instructions');
      var name = (nameInput.value || '').trim();
      if (!name) {
        notifyToast('请输入项目名称');
        nameInput.focus();
        return;
      }

      var payload = {
        name: name,
        description: (descInput.value || '').trim(),
        defaultPresetId: presetSelect ? presetSelect.value : '',
        instructions: instInput ? instInput.value : '',
        icon: currentSelectedIcon,
        color: currentSelectedColor
      };

      if (isEdit) {
        await S().updateProject(existingProject.id, payload);
        notifyToast('项目及指令已更新');
      } else {
        await S().createProject(payload);
        notifyToast('项目已创建');
      }

      modalWrap.remove();
      if (typeof onSaved === 'function') onSaved();
    });

    var delBtn = modalWrap.querySelector('#aiw-proj-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', function() {
        modalWrap.remove();
        openProjectDeleteConfirmModal(page, existingProject, onSaved);
      });
    }
  }

  function openProjectDeleteConfirmModal(page, project, onDeleted) {
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open';

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-delete-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title" style="color: #e11d48;"><i class="fa-solid fa-triangle-exclamation"></i> 删除项目：' + escapeHtml(project.name) + '</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' +
          '<div class="aiw-form-group">' +
            '<div class="aiw-del-desc">请选择如何处理该项目下的聊天记录：</div>' +
            '<label class="aiw-radio-label"><input type="radio" name="del_proj_chats" value="keep" checked> <span>保留项目下的聊天并移出项目（不删除聊天）</span></label>' +
            '<label class="aiw-radio-label"><input type="radio" name="del_proj_chats" value="delete"> <span style="color:#e11d48;">同时删除项目及项目内所有聊天记录</span></label>' +
          '</div>' +
          '<div class="aiw-form-group aiw-delete-confirm-box" id="aiw-del-confirm-box" style="display:none; margin-top:12px; background:var(--aiw-card-bg); padding:12px; border-radius:8px; border:1px solid #e11d4844;">' +
            '<label class="aiw-checkbox-label"><input type="checkbox" id="aiw-del-chats-confirm-checkbox"> <span>我已确认删除该项目及全部关联聊天，此操作无法撤销</span></label>' +
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
        if (radio.value === 'delete' && radio.checked) {
          confirmBox.style.display = 'block';
        } else {
          confirmBox.style.display = 'none';
        }
      });
    });

    modalWrap.querySelector('.aiw-ws-modal-close').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.querySelector('#aiw-proj-del-cancel').addEventListener('click', function() { modalWrap.remove(); });
    modalWrap.addEventListener('click', function(e) { if (e.target === modalWrap) modalWrap.remove(); });

    modalWrap.querySelector('#aiw-proj-del-confirm').addEventListener('click', async function() {
      var selected = modalWrap.querySelector('input[name="del_proj_chats"]:checked').value;
      var deleteChatsFlag = selected === 'delete';

      if (deleteChatsFlag) {
        var chk = modalWrap.querySelector('#aiw-del-chats-confirm-checkbox');
        if (!chk.checked) {
          notifyToast('请先勾选二次确认复选框');
          return;
        }
      }

      await S().deleteProject(project.id, deleteChatsFlag);
      notifyToast(deleteChatsFlag ? '项目及关联聊天已全部删除' : '项目已删除，聊天已移出项目');
      modalWrap.remove();
      if (typeof onDeleted === 'function') onDeleted();
    });
  }

  async function openMoveChatsModal(page, project, onMoved) {
    var allChats = await S().listChats();
    var unassignedChats = allChats.filter(function(c) { return c.projectId !== project.id; });

    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open';

    var chatsListHtml = unassignedChats.length === 0 ? (
      '<div class="aiw-empty-state"><div class="aiw-empty-desc">没有可添加的其他聊天</div></div>'
    ) : (
      unassignedChats.map(function(c) {
        return (
          '<label class="aiw-move-chat-item">' +
            '<input type="checkbox" class="aiw-move-chat-chk" value="' + escapeHtml(c.id) + '">' +
            '<div class="aiw-move-chat-info">' +
              '<div class="aiw-move-chat-title">' + escapeHtml(c.title || '新对话') + '</div>' +
              '<div class="aiw-move-chat-sub">' + (c.projectId ? '当前属于其他项目' : '未归类聊天') + '</div>' +
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
          '<div class="aiw-form-group">' +
            '<div class="aiw-move-chat-list">' + chatsListHtml + '</div>' +
          '</div>' +
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

      for (var i = 0; i < checkedBoxes.length; i++) {
        var cid = checkedBoxes[i].value;
        var chat = await S().getChat(cid);
        if (chat) {
          chat.projectId = project.id;
          chat.updatedAt = Date.now();
          await S().saveChat(chat);
        }
      }

      notifyToast('成功将 ' + checkedBoxes.length + ' 个聊天移动到本项目');
      modalWrap.remove();
      if (typeof onMoved === 'function') onMoved();
    });
  }

  async function parseUploadedFile(file) {
    var name = file.name || '未命名文件';
    var ext = name.split('.').pop().toLowerCase();
    var size = file.size || 0;

    if (ext === 'txt' || ext === 'md' || ext === 'markdown' || ext === 'json' || ext === 'csv' || ext === 'log') {
      var text = await file.text();
      return { name: name, type: ext, size: size, content: text };
    }

    if (ext === 'docx') {
      if (typeof window.mammoth === 'undefined') {
        throw new Error('DOCX 解析库未加载');
      }
      var arrayBuffer = await file.arrayBuffer();
      var result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      var text = result && result.value ? result.value : '';
      if (!text.trim()) {
        throw new Error('DOCX 文件内容为空或无法解析文字');
      }
      return { name: name, type: ext, size: size, content: text };
    }

    if (ext === 'pdf') {
      if (typeof window.pdfjsLib === 'undefined') {
        throw new Error('PDF 解析库未加载');
      }
      var arrayBuffer = await file.arrayBuffer();
      var loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
      var pdfDoc = await loadingTask.promise;
      var maxPages = pdfDoc.numPages;
      var textParts = [];
      for (var i = 1; i <= maxPages; i++) {
        var page = await pdfDoc.getPage(i);
        var textContent = await page.getTextContent();
        var pageText = textContent.items.map(function(item) { return item.str; }).join(' ');
        textParts.push(pageText);
      }
      var text = textParts.join('\n\n').trim();
      if (!text) {
        throw new Error('PDF 文件内容为空或无法提取文本');
      }
      return { name: name, type: ext, size: size, content: text };
    }

    throw new Error('不支持的文件格式（.' + ext + '），目前仅支持 TXT, Markdown, PDF, DOCX');
  }

  function formatBytes(bytes) {
    if (bytes === 0 || !bytes) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async function openProjectDocumentsModal(page, project, onBack) {
    var docs = await S().listProjectDocuments(project.id);
    var color = project.color || '#ec4899';

    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open';

    function renderDocsContent() {
      var bodyEl = modalWrap.querySelector('#aiw-doc-list-container');
      if (!bodyEl) return;

      if (docs.length === 0) {
        bodyEl.innerHTML =
          '<div class="aiw-empty-state">' +
            '<div class="aiw-empty-icon" style="color: ' + escapeHtml(color) + ';"><i class="fa-solid fa-file-lines"></i></div>' +
            '<div class="aiw-empty-title">当前项目暂无参考资料</div>' +
            '<div class="aiw-empty-desc">支持上传 TXT、Markdown、PDF、DOCX 格式文件。上传后 AI 在本项目对话中将自动检索并参考相关资料。</div>' +
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
              var dateStr = new Date(doc.updatedAt || doc.createdAt || Date.now()).toLocaleString();
              var sizeStr = formatBytes(doc.size);
              var iconClass = 'fa-solid fa-file-lines';
              if (doc.type === 'pdf') iconClass = 'fa-solid fa-file-pdf';
              else if (doc.type === 'docx') iconClass = 'fa-solid fa-file-word';
              else if (doc.type === 'md' || doc.type === 'markdown') iconClass = 'fa-solid fa-file-code';

              return (
                '<div class="aiw-proj-chat-item" data-doc-id="' + escapeHtml(doc.id) + '">' +
                  '<div class="aiw-proj-chat-info" style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">' +
                    '<div style="width:36px; height:36px; border-radius:8px; background:' + escapeHtml(color) + '15; color:' + escapeHtml(color) + '; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="' + iconClass + '"></i></div>' +
                    '<div style="min-width:0; flex:1;">' +
                      '<div class="aiw-proj-chat-title" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + escapeHtml(doc.name) + '">' + escapeHtml(doc.name) + '</div>' +
                      '<div class="aiw-proj-chat-sub">' + escapeHtml(doc.type.toUpperCase()) + ' · ' + sizeStr + ' · ' + escapeHtml(dateStr) + '</div>' +
                    '</div>' +
                  '</div>' +
                  '<div class="aiw-proj-chat-actions">' +
                    '<button type="button" class="aiw-icon-btn aiw-doc-view-btn" data-doc-id="' + escapeHtml(doc.id) + '" title="查看全文与片段"><i class="fa-solid fa-eye"></i></button>' +
                    '<button type="button" class="aiw-icon-btn aiw-doc-rename-btn" data-doc-id="' + escapeHtml(doc.id) + '" title="重命名"><i class="fa-solid fa-pen"></i></button>' +
                    '<button type="button" class="aiw-icon-btn aiw-doc-delete-btn" data-doc-id="' + escapeHtml(doc.id) + '" title="删除资料"><i class="fa-regular fa-trash-can"></i></button>' +
                  '</div>' +
                '</div>'
              );
            }).join('') +
          '</div>';

        bindDocItemEvents();
      }

      var countEl = modalWrap.querySelector('#aiw-doc-count-badge');
      if (countEl) countEl.textContent = docs.length;
    }

    function bindDocItemEvents() {
      modalWrap.querySelectorAll('.aiw-doc-view-btn').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var did = btn.getAttribute('data-doc-id');
          var doc = await S().getProjectDocument(did);
          if (doc) {
            openDocPreviewModal(page, doc);
          }
        });
      });

      modalWrap.querySelectorAll('.aiw-doc-rename-btn').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var did = btn.getAttribute('data-doc-id');
          var doc = await S().getProjectDocument(did);
          if (!doc) return;
          var newName = prompt('重命名资料文件：', doc.name);
          if (newName !== null) {
            var clean = newName.trim();
            if (clean) {
              await S().renameProjectDocument(did, clean);
              docs = await S().listProjectDocuments(project.id);
              renderDocsContent();
              notifyToast('重命名成功');
            } else {
              notifyToast('文件名不能为空');
            }
          }
        });
      });

      modalWrap.querySelectorAll('.aiw-doc-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var did = btn.getAttribute('data-doc-id');
          if (confirm('确定要删除该参考资料吗？删除后 AI 将无法再检索其内容。')) {
            await S().deleteProjectDocument(did);
            docs = await S().listProjectDocuments(project.id);
            renderDocsContent();
            notifyToast('资料已删除');
          }
        });
      });
    }

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-center-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head" style="border-bottom: 2px solid ' + escapeHtml(color) + '33;">' +
          '<div class="aiw-proj-detail-head-left">' +
            '<button type="button" class="aiw-icon-btn" id="aiw-doc-back-btn" title="返回项目详情"><i class="fa-solid fa-arrow-left"></i></button>' +
            '<div class="aiw-ws-modal-title">' +
              '<span style="color: ' + escapeHtml(color) + '; margin-right: 8px;"><i class="fa-solid fa-file-lines"></i></span>' +
              '项目资料库：' + escapeHtml(project.name) +
              ' <span id="aiw-doc-count-badge" style="font-size:12px; background:' + escapeHtml(color) + '22; color:' + escapeHtml(color) + '; padding:2px 8px; border-radius:10px; margin-left:6px;">' + docs.length + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="aiw-modal-head-right">' +
            '<input type="file" id="aiw-doc-file-input" accept=".txt,.md,.markdown,.json,.csv,.log,.pdf,.docx" multiple style="display:none;">' +
            '<button type="button" class="aiw-primary-btn" id="aiw-doc-upload-btn" style="background-color: ' + escapeHtml(color) + ';"><i class="fa-solid fa-upload"></i> 上传资料</button>' +
            '<button type="button" class="aiw-ws-modal-close" id="aiw-doc-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="aiw-ws-modal-body aiw-projects-body">' +
          '<div class="aiw-projects-toolbar">' +
            '<div class="aiw-projects-summary">已上传的参考文档将作为 AI 本项目对话的私有知识参考源。</div>' +
          '</div>' +
          '<div class="aiw-projects-list-container" id="aiw-doc-list-container"></div>' +
        '</div>' +
      '</div>';

    page.appendChild(modalWrap);
    renderDocsContent();

    modalWrap.querySelector('#aiw-doc-modal-close').addEventListener('click', function() {
      modalWrap.remove();
      if (typeof onBack === 'function') onBack();
    });

    modalWrap.querySelector('#aiw-doc-back-btn').addEventListener('click', function() {
      modalWrap.remove();
      if (typeof onBack === 'function') onBack();
    });

    modalWrap.addEventListener('click', function(e) {
      if (e.target === modalWrap) {
        modalWrap.remove();
        if (typeof onBack === 'function') onBack();
      }
    });

    var uploadBtn = modalWrap.querySelector('#aiw-doc-upload-btn');
    var fileInput = modalWrap.querySelector('#aiw-doc-file-input');

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', function() {
        fileInput.click();
      });

      fileInput.addEventListener('change', async function() {
        var files = fileInput.files;
        if (!files || files.length === 0) return;

        var successCount = 0;
        var failCount = 0;

        for (var i = 0; i < files.length; i++) {
          var file = files[i];
          try {
            notifyToast('正在解析文件：' + file.name + '...');
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
            failCount++;
            console.warn('[AiWorkspaceDocs] parse/upload failed for:', file.name, err);
            notifyToast('文件 ' + file.name + ' 解析失败：' + (err.message || '未知错误'));
          }
        }

        fileInput.value = '';
        docs = await S().listProjectDocuments(project.id);
        renderDocsContent();

        if (successCount > 0) {
          notifyToast('成功上传并解析 ' + successCount + ' 个文件');
        }
      });
    }
  }

  function openDocPreviewModal(page, doc) {
    var modalWrap = document.createElement('div');
    modalWrap.className = 'aiw-ws-modal-backdrop open';

    modalWrap.innerHTML =
      '<div class="aiw-ws-modal aiw-projects-center-modal" role="dialog" aria-modal="true" style="max-width:700px;">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title"><i class="fa-solid fa-file-lines" style="color:var(--aiw-accent); margin-right:8px;"></i>' + escapeHtml(doc.name) + '</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body" style="max-height:65vh; overflow-y:auto; padding:16px;">' +
          '<div style="font-size:12px; color:var(--aiw-hint); margin-bottom:12px;">类型: ' + escapeHtml(doc.type.toUpperCase()) + ' | 大小: ' + formatBytes(doc.size) + ' | 文本切片数: ' + (doc.chunks ? doc.chunks.length : 0) + '</div>' +
          '<div style="white-space:pre-wrap; font-family:inherit; font-size:13.5px; line-height:1.6; background:var(--aiw-surface-2); padding:14px; border-radius:8px; border:1px solid var(--aiw-border);">' + escapeHtml(doc.content) + '</div>' +
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

  global.AiWorkspaceProjects = {
    openProjectsCenter: openProjectsCenter
  };

})(typeof window !== 'undefined' ? window : globalThis);
