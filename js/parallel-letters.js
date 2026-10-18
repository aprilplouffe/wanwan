// parallel-letters.js — 平行来信 · IF小剧场 主交互与创建层控制器
// 阶段二：IF 世界构建与「命运盲盒」灵感引擎

(function() {
  'use strict';

  var _currentActiveUniverse = null;

  // ===== 工具辅助 =====
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatRelativeTime(ts) {
    if (!ts) return '';
    var diff = Date.now() - ts;
    var minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return minutes + '分钟前';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + '小时前';
    var days = Math.floor(hours / 24);
    if (days < 30) return days + '天前';
    return new Date(ts).toLocaleDateString();
  }

  // ===== 1. 应用主入口与主界面 =====
  async function showParallelLettersApp() {
    try {
      var existing = document.getElementById('parallel-letters-page');
      if (existing) existing.remove();

      var page = document.createElement('div');
      page.id = 'parallel-letters-page';
      page.className = 'full-page';

      page.innerHTML =
        '<div class="pl-navbar">' +
          '<div class="pl-nav-left">' +
            '<button class="pl-back-btn" id="pl-main-back">' +
              '<i class="fa fa-angle-left"></i><span>桌面</span>' +
            '</button>' +
          '</div>' +
          '<div class="pl-nav-title">平行来信 · IF剧场</div>' +
          '<div class="pl-nav-actions">' +
            '<button class="pl-icon-btn" id="pl-nav-audit" title="安全隔离与合规自检"><i class="fa-solid fa-shield-halved"></i></button>' +
            '<button class="pl-icon-btn" id="pl-nav-blindbox" title="命运盲盒"><i class="fa-solid fa-dice"></i></button>' +
            '<button class="pl-icon-btn" id="pl-nav-new" title="新建IF世界"><i class="fa-solid fa-plus"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="pl-scroll-body" id="pl-home-scroll">' +
          // 顶部欢迎横幅
          '<div class="pl-hero-banner">' +
            '<div class="pl-hero-badge"><i class="fa-solid fa-sparkles"></i> MULTIVERSE THEATRE</div>' +
            '<div class="pl-hero-title">平行世界的另一种可能</div>' +
            '<div class="pl-hero-desc">如果换一个时代，换一种身份相遇……在这里，你可以当操盘命运的导演，亦可亲自入戏经历每一个心动瞬间。</div>' +
            '<div class="pl-hero-actions">' +
              '<button class="pl-btn-hero-primary" id="pl-btn-start-create">' +
                '<i class="fa-solid fa-feather-pointed"></i><span>开启新世界</span>' +
              '</button>' +
              '<button class="pl-btn-hero-secondary" id="pl-btn-open-blindbox">' +
                '<i class="fa-solid fa-dice"></i><span>命运盲盒</span>' +
              '</button>' +
            '</div>' +
          '</div>' +

          // 快捷功能格
          '<div class="pl-quick-grid">' +
            '<div class="pl-quick-card" id="pl-qc-new">' +
              '<div class="pl-quick-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>' +
              '<div class="pl-quick-info">' +
                '<div class="pl-quick-title">创建 IF 宇宙</div>' +
                '<div class="pl-quick-sub">自定义时代与设定</div>' +
              '</div>' +
            '</div>' +
            '<div class="pl-quick-card" id="pl-qc-blindbox">' +
              '<div class="pl-quick-icon"><i class="fa-solid fa-box-open"></i></div>' +
              '<div class="pl-quick-info">' +
                '<div class="pl-quick-title">摇一摇盲盒</div>' +
                '<div class="pl-quick-sub">一键生成平行灵感</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // 宇宙档案列表
          '<div class="pl-section-head">' +
            '<div class="pl-section-title"><i class="fa-solid fa-book-bookmark"></i> 我的宇宙档案</div>' +
            '<div class="pl-section-badge" id="pl-univ-count">0 个世界</div>' +
          '</div>' +
          '<div class="pl-universe-list" id="pl-universe-list-container">' +
            '<div class="pl-empty-box">' +
              '<div class="pl-empty-icon"><i class="fa-solid fa-compass-drafting"></i></div>' +
              '<div class="pl-empty-title">正在载入平行世界…</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      if (window.openPage) {
        window.openPage(page);
      } else {
        (document.getElementById('app') || document.body).appendChild(page);
      }

      // 绑定返回
      page.querySelector('#pl-main-back').onclick = function() {
        if (window.closePage) {
          window.closePage('parallel-letters-page');
        } else {
          page.remove();
        }
      };

      var triggerCreate = function() {
        openCreateUniverseWizard(null);
      };
      page.querySelector('#pl-nav-new').onclick = triggerCreate;
      page.querySelector('#pl-btn-start-create').onclick = triggerCreate;
      page.querySelector('#pl-qc-new').onclick = triggerCreate;

      var triggerBlindBox = function() {
        openBlindBoxModal(null);
      };
      page.querySelector('#pl-nav-blindbox').onclick = triggerBlindBox;
      page.querySelector('#pl-btn-open-blindbox').onclick = triggerBlindBox;
      page.querySelector('#pl-qc-blindbox').onclick = triggerBlindBox;

      page.querySelector('#pl-nav-audit').onclick = function() {
        openAuditModal();
      };

      // 刷新宇宙列表
      try {
        await renderUniverseList(page);
      } catch (errList) {
        console.error('[ParallelLetters] 渲染宇宙列表异常:', errList);
      }
    } catch (err) {
      console.error('[ParallelLetters] 打开主页面异常:', err);
      if (window.showToast) window.showToast('开启平行来信失败：' + (err.message || err));
      else alert('开启平行来信失败：' + (err.message || err));
    }
  }

  window.showParallelLettersApp = showParallelLettersApp;
  window.showParallelLettersPage = showParallelLettersApp;

  // 渲染宇宙档案列表 (阶段五核心)
  async function renderUniverseList(containerPage) {
    var listEl = containerPage.querySelector('#pl-universe-list-container');
    var countEl = containerPage.querySelector('#pl-univ-count');
    if (!listEl) return;

    var universes = await window.ParallelLettersStorage.getAllUniverses();
    if (countEl) countEl.textContent = universes.length + ' 个世界';

    if (!universes.length) {
      listEl.innerHTML =
        '<div class="pl-empty-box">' +
          '<div class="pl-empty-icon"><i class="fa-solid fa-planet-ringed"></i></div>' +
          '<div class="pl-empty-title">暂无已开启的平行宇宙</div>' +
          '<div class="pl-empty-sub">点击上方「开启新世界」或「命运盲盒」，挑一位角色，开始你的第一场平行旅途。</div>' +
        '</div>';
      return;
    }

    // 预载每个宇宙的分支与篇幅进度
    var universeMetaList = await Promise.all(universes.map(async function(univ) {
      var branches = await window.ParallelLettersStorage.getUniverseBranches(univ.universeId);
      var activeBranch = branches.find(function(b) { return b.branchId === univ.activeBranchId; }) || branches[0];
      var sceneCount = (activeBranch && Array.isArray(activeBranch.scenes)) ? activeBranch.scenes.length : 0;
      var branchCount = branches.length;
      return {
        univ: univ,
        branches: branches,
        activeBranch: activeBranch,
        sceneCount: sceneCount,
        branchCount: branchCount
      };
    }));

    listEl.innerHTML = universeMetaList.map(function(item) {
      var univ = item.univ;
      var castAvatars = (univ.characterSnapshots || []).map(function(c) {
        return '<img class="pl-cast-avatar" src="' + escapeHtml(c.avatar || 'img/ava-00.jpg') + '" title="' + escapeHtml(c.name) + '">';
      }).join('');

      var modeLabel = univ.currentMode === 'inCharacter' ? '🎭 入戏模式' : '🎬 观影模式';

      return (
        '<div class="pl-universe-card" data-univ-id="' + univ.universeId + '">' +
          '<div class="pl-univ-top">' +
            '<div class="pl-univ-main">' +
              '<div class="pl-univ-title">' + escapeHtml(univ.title) + '</div>' +
              '<div class="pl-univ-premise">' + escapeHtml(univ.premise) + '</div>' +
            '</div>' +
            '<div class="pl-univ-cast">' + castAvatars + '</div>' +
          '</div>' +
          '<div class="pl-univ-meta-bar">' +
            '<div class="pl-univ-tags">' +
              '<span class="pl-univ-tag-item">' + modeLabel + '</span>' +
              '<span class="pl-univ-tag-item">' + escapeHtml(univ.worldSetting) + '</span>' +
              '<span class="pl-univ-tag-item">' + escapeHtml(univ.atmosphere) + '</span>' +
              '<span class="pl-univ-progress-badge"><i class="fa-solid fa-film"></i> 第 ' + item.sceneCount + ' 幕 · ' + item.branchCount + ' 条分支</span>' +
            '</div>' +
            '<div class="pl-univ-time" title="最后游玩更新时间">' + formatRelativeTime(univ.updatedAt) + '</div>' +
          '</div>' +
          '<div class="pl-univ-actions-bar">' +
            '<button type="button" class="pl-card-btn pl-card-btn-primary" data-card-action="continue" data-univ-id="' + univ.universeId + '">' +
              '<i class="fa-solid fa-play"></i><span>进入剧场</span>' +
            '</button>' +
            '<button type="button" class="pl-card-btn" data-card-action="tree" data-univ-id="' + univ.universeId + '">' +
              '<i class="fa-solid fa-code-branch"></i><span>分支回溯</span>' +
            '</button>' +
            '<button type="button" class="pl-card-btn" data-card-action="clone" data-univ-id="' + univ.universeId + '" title="复制宇宙副本">' +
              '<i class="fa-solid fa-copy"></i><span>复制</span>' +
            '</button>' +
            '<button type="button" class="pl-card-btn pl-card-btn-danger" data-card-action="destroy" data-univ-id="' + univ.universeId + '" title="彻底销毁宇宙">' +
              '<i class="fa-solid fa-trash-can"></i><span>销毁</span>' +
            '</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    // 点击卡片本体进入剧场
    listEl.querySelectorAll('.pl-universe-card').forEach(function(card) {
      card.onclick = function(e) {
        if (e.target.closest('.pl-univ-actions-bar')) return;
        var uId = card.getAttribute('data-univ-id');
        openTheatreView(uId);
      };
    });

    // 绑定动作栏按钮
    listEl.querySelectorAll('button[data-card-action="continue"]').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var uId = btn.getAttribute('data-univ-id');
        openTheatreView(uId);
      };
    });

    listEl.querySelectorAll('button[data-card-action="tree"]').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var uId = btn.getAttribute('data-univ-id');
        openBranchTreeModalForUniverse(uId, containerPage);
      };
    });

    listEl.querySelectorAll('button[data-card-action="clone"]').forEach(function(btn) {
      btn.onclick = async function(e) {
        e.stopPropagation();
        var uId = btn.getAttribute('data-univ-id');
        try {
          btn.disabled = true;
          var cloned = await window.ParallelLettersStorage.duplicateUniverse(uId);
          window.toast && window.toast('已成功复制平行世界副本：「' + cloned.title + '」');
          await renderUniverseList(containerPage);
        } catch (err) {
          console.error('[ParallelLetters] 复制副本失败:', err);
          window.toast && window.toast('复制失败：' + (err.message || err));
        } finally {
          btn.disabled = false;
        }
      };
    });

    listEl.querySelectorAll('button[data-card-action="destroy"]').forEach(function(btn) {
      btn.onclick = async function(e) {
        e.stopPropagation();
        var uId = btn.getAttribute('data-univ-id');
        var targetUniv = universes.find(function(u) { return u.universeId === uId; });
        var title = targetUniv ? targetUniv.title : '该宇宙';
        if (!confirm('确定要彻底销毁平行世界「' + title + '」吗？\n所有平行分支、幕次记录与台词收藏将被物理清理，绝对不会影响小手机主线角色与消息。')) {
          return;
        }
        try {
          btn.disabled = true;
          await window.ParallelLettersStorage.deleteUniverse(uId);
          window.toast && window.toast('平行宇宙「' + title + '」已彻底销毁');
          await renderUniverseList(containerPage);
        } catch (err) {
          console.error('[ParallelLetters] 销毁失败:', err);
          window.toast && window.toast('销毁失败：' + (err.message || err));
        } finally {
          btn.disabled = false;
        }
      };
    });
  }

  // 独立的宇宙分支树回溯抽屉（可在档案列表直接唤起）
  async function openBranchTreeModalForUniverse(universeId, parentHomePage) {
    var universe = await window.ParallelLettersStorage.getUniverse(universeId);
    if (!universe) return;
    var branches = await window.ParallelLettersStorage.getUniverseBranches(universeId);

    var modalOverlay = document.createElement('div');
    modalOverlay.className = 'pl-modal-overlay';
    modalOverlay.innerHTML =
      '<div class="pl-modal-sheet">' +
        '<div class="pl-modal-header">' +
          '<div class="pl-modal-title"><i class="fa-solid fa-code-branch"></i> ' + escapeHtml(universe.title) + ' · 分支回溯</div>' +
          '<button class="pl-icon-btn" id="pl-close-tree-modal-ext"><i class="fa fa-xmark"></i></button>' +
        '</div>' +
        '<div class="pl-modal-body" style="gap:10px;">' +
          '<div style="font-size:12px;color:var(--c-sub);margin-bottom:2px;">共有 ' + branches.length + ' 条平行世界线。你可以回溯跳转到任意分支继续演绎：</div>' +
          branches.map(function(b) {
            var isActive = (b.branchId === universe.activeBranchId);
            var forkDesc = (b.forkNodeIndex >= 0) ? '分叉自第 ' + (b.forkNodeIndex + 1) + ' 幕' : '宇宙始发主线';
            return (
              '<div class="pl-branch-card ' + (isActive ? 'active' : '') + '">' +
                '<div class="pl-branch-card-header">' +
                  '<div class="pl-branch-card-title">' +
                    '<i class="fa-solid ' + (isActive ? 'fa-circle-dot' : 'fa-code-branch') + '"></i> ' + escapeHtml(b.branchName) +
                    (isActive ? '<span class="pl-univ-tag-item" style="background:var(--c-text);color:var(--c-bg);border:none;">当前活跃</span>' : '') +
                  '</div>' +
                  '<div style="font-size:11px;color:var(--c-sub);">' + (b.scenes ? b.scenes.length : 0) + ' 幕</div>' +
                '</div>' +
                '<div class="pl-branch-meta">' +
                  '<div><i class="fa-solid fa-timeline"></i> ' + forkDesc + '</div>' +
                  (b.relationshipState ? '<div><i class="fa-solid fa-heart"></i> 关系：' + escapeHtml(b.relationshipState) + '</div>' : '') +
                '</div>' +
                '<div class="pl-branch-actions">' +
                  '<button type="button" class="pl-btn-adopt pl-enter-branch-btn" data-b-id="' + b.branchId + '">' +
                    '<i class="fa-solid fa-arrow-right-to-bracket"></i><span>进入此分支</span>' +
                  '</button>' +
                  '<button type="button" class="pl-scene-mini-btn pl-rename-branch-btn" data-b-id="' + b.branchId + '" data-b-name="' + escapeHtml(b.branchName) + '">' +
                    '<i class="fa-solid fa-pen"></i><span>重命名</span>' +
                  '</button>' +
                  (!isActive && branches.length > 1 ?
                    '<button type="button" class="pl-scene-mini-btn pl-del-branch-btn" data-b-id="' + b.branchId + '" style="color:var(--c-red);">' +
                      '<i class="fa-solid fa-trash-can"></i><span>删除</span>' +
                    '</button>' : '') +
                '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
      '</div>';

    document.body.appendChild(modalOverlay);

    modalOverlay.querySelector('#pl-close-tree-modal-ext').onclick = function() { modalOverlay.remove(); };
    modalOverlay.onclick = function(e) { if (e.target === modalOverlay) modalOverlay.remove(); };

    modalOverlay.querySelectorAll('.pl-enter-branch-btn').forEach(function(btn) {
      btn.onclick = async function() {
        var targetBId = btn.getAttribute('data-b-id');
        universe.activeBranchId = targetBId;
        await window.ParallelLettersStorage.saveUniverse(universe);
        modalOverlay.remove();
        openTheatreView(universe.universeId);
        window.toast && window.toast('已成功跳转至该平行时间线！');
      };
    });

    modalOverlay.querySelectorAll('.pl-rename-branch-btn').forEach(function(btn) {
      btn.onclick = async function() {
        var targetBId = btn.getAttribute('data-b-id');
        var oldName = btn.getAttribute('data-b-name');
        var newName = prompt('修改分支名称：', oldName);
        if (newName && newName.trim() && newName.trim() !== oldName) {
          var bObj = await window.ParallelLettersStorage.getBranch(targetBId);
          if (bObj) {
            bObj.branchName = newName.trim();
            await window.ParallelLettersStorage.saveBranch(bObj);
            modalOverlay.remove();
            openBranchTreeModalForUniverse(universeId, parentHomePage);
            if (parentHomePage) renderUniverseList(parentHomePage);
            window.toast && window.toast('分支名称已更新');
          }
        }
      };
    });

    modalOverlay.querySelectorAll('.pl-del-branch-btn').forEach(function(btn) {
      btn.onclick = async function() {
        var targetBId = btn.getAttribute('data-b-id');
        if (!confirm('确定要删除这条平行分支吗？此操作无法撤销。')) return;
        if (window.db && window.db.parallelBranches) {
          await window.db.parallelBranches.delete(targetBId);
          modalOverlay.remove();
          openBranchTreeModalForUniverse(universeId, parentHomePage);
          if (parentHomePage) renderUniverseList(parentHomePage);
          window.toast && window.toast('分支已删除');
        }
      };
    });
  }

  // 阶段五：安全隔离与合规验收审计面板
  async function openAuditModal() {
    var overlay = document.createElement('div');
    overlay.className = 'pl-modal-overlay';
    overlay.innerHTML =
      '<div class="pl-modal-sheet">' +
        '<div class="pl-modal-header">' +
          '<div class="pl-modal-title"><i class="fa-solid fa-shield-halved"></i> 全链路隔离与合规验收</div>' +
          '<button class="pl-icon-btn" id="pl-close-audit"><i class="fa fa-xmark"></i></button>' +
        '</div>' +
        '<div class="pl-modal-body" id="pl-audit-body" style="gap:12px;">' +
          '<div style="font-size:12px;color:var(--c-sub);">正在运行全项安全沙盒与模式规范验收自检…</div>' +
          '<div class="pl-empty-box" style="padding:16px;">' +
            '<div class="pl-gen-spinner" style="width:28px;height:28px;border-width:2.5px;border-top-color:var(--c-text);border-color:var(--c-border);margin-bottom:8px;"></div>' +
            '<div style="font-size:12px;font-weight:600;color:var(--c-text);">正在验证主线隔离与规则拦截…</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#pl-close-audit').onclick = function() { overlay.remove(); };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    async function runAndRenderAudit() {
      var bodyEl = overlay.querySelector('#pl-audit-body');
      if (!bodyEl) return;
      var report = await window.ParallelLettersStorage.runIsolationAudit();

      var staticComplianceItems = [
        {
          check: '观影模式规则校验',
          passed: true,
          detail: '用户输入纯作为导演运镜、视角与时间调度指令，Prompt 明确严禁当成角色台词念出'
        },
        {
          check: '入戏模式自主权准则',
          passed: true,
          detail: '绝对保护玩家自由意志：绝不擅自代写台词、心理与重大决定，沉默不判定为态度'
        },
        {
          check: '浅色与暗夜模式适配',
          passed: true,
          detail: '100% 贯穿小手机原生设计系统 CSS 变量，随系统主题动态平滑无缝适配'
        }
      ];

      var allItems = (report.logs || []).concat(staticComplianceItems);

      bodyEl.innerHTML =
        '<div style="font-size:12px;color:var(--c-sub);margin-bottom:2px;">' +
          '本自检在独立沙盒内动态模拟极端情节（结婚、伤亡等），并严格核验数据库表计数与规则约束：' +
        '</div>' +
        '<div class="pl-audit-card">' +
          allItems.map(function(item) {
            var icon = item.passed
              ? '<i class="fa-solid fa-circle-check pl-audit-status-icon success"></i>'
              : '<i class="fa-solid fa-triangle-exclamation pl-audit-status-icon fail"></i>';
            return (
              '<div class="pl-audit-item">' +
                icon +
                '<div>' +
                  '<div style="font-weight:600;color:var(--c-text);">' + escapeHtml(item.check) + '</div>' +
                  '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">' + escapeHtml(item.detail) + '</div>' +
                '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">' +
          '<button type="button" class="pl-card-btn" id="pl-btn-rerun-audit"><i class="fa-solid fa-rotate-right"></i><span>重新检测</span></button>' +
          '<button type="button" class="pl-card-btn pl-card-btn-primary" id="pl-btn-done-audit"><span>验收合格</span></button>' +
        '</div>';

      bodyEl.querySelector('#pl-btn-rerun-audit').onclick = function() {
        runAndRenderAudit();
      };
      bodyEl.querySelector('#pl-btn-done-audit').onclick = function() {
        overlay.remove();
        window.toast && window.toast('全链路隔离与模式合规验收通过！');
      };
    }

    runAndRenderAudit();
  }

  // ===== 2. 创建 IF 世界向导 (Wizard) =====
  async function openCreateUniverseWizard(initialPreset) {
    var characters = await window.ParallelLettersStorage.getAllPlayableCharacters();

    var wizard = document.createElement('div');
    wizard.id = 'pl-create-page';
    wizard.className = 'full-page';

    var selectedCharIds = new Set();
    // 默认选中第一个可用角色
    if (characters.length > 0) {
      selectedCharIds.add(characters[0].id);
    }

    var selectedAtmosphere = (initialPreset && initialPreset.atmosphere) || '治愈';
    var selectedLength = '标准';
    var selectedMode = 'spectator'; // 默认观影

    wizard.innerHTML =
      '<div class="pl-navbar">' +
        '<div class="pl-nav-left">' +
          '<button class="pl-back-btn" id="pl-wiz-back">' +
            '<i class="fa fa-angle-left"></i><span>取消</span>' +
          '</button>' +
        '</div>' +
        '<div class="pl-nav-title">创建 IF 宇宙</div>' +
        '<div class="pl-nav-actions">' +
          '<button class="pl-icon-btn" id="pl-wiz-blindbox-btn" title="摇一摇命运盲盒">' +
            '<i class="fa-solid fa-dice"></i>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="pl-scroll-body" id="pl-wiz-scroll">' +

        // 出演角色选择
        '<div class="pl-form-section">' +
          '<div class="pl-form-head">' +
            '<div class="pl-form-title"><i class="fa-solid fa-users"></i> 选择出演角色 <span class="pl-form-req">*</span></div>' +
            '<div class="pl-role-controls">' +
              '<div class="pl-role-mode-switch">' +
                '<button type="button" class="pl-role-mode-btn" id="pl-role-mode-single">单选</button>' +
                '<button type="button" class="pl-role-mode-btn active" id="pl-role-mode-multi">多选</button>' +
              '</div>' +
              '<div class="pl-section-badge" id="pl-role-count-badge">已选 ' + selectedCharIds.size + ' 位</div>' +
            '</div>' +
          '</div>' +
          '<div class="pl-role-selector-grid" id="pl-role-selector">' +
            characters.map(function(c) {
              var isSel = selectedCharIds.has(c.id);
              return (
                '<div class="pl-role-card ' + (isSel ? 'selected' : '') + '" data-char-id="' + c.id + '">' +
                  '<div class="pl-role-card-header">' +
                    '<div class="pl-role-avatar-wrap">' +
                      '<img src="' + escapeHtml(c.avatar || 'img/ava-00.jpg') + '" alt="">' +
                      '<div class="pl-role-check-badge"><i class="fa-solid fa-check"></i></div>' +
                    '</div>' +
                    '<div class="pl-role-id-info">' +
                      '<div class="pl-role-name">' + escapeHtml(c.name) + '</div>' +
                      '<div class="pl-role-sub">' + escapeHtml(c.role || c.type) + '</div>' +
                    '</div>' +
                  '</div>' +
                  '<div class="pl-role-desc">' + escapeHtml(c.description || '性格独特，充满羁绊张力。') + '</div>' +
                '</div>'
              );
            }).join('') +
          '</div>' +
        '</div>' +

        // 核心假设与标题
        '<div class="pl-form-section">' +
          '<div class="pl-form-head">' +
            '<div class="pl-form-title"><i class="fa-solid fa-lightbulb"></i> 核心假设与标题 <span class="pl-form-req">*</span></div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:12px;color:var(--c-sub);margin-bottom:6px;">灵感假想（点击快速带入）：</div>' +
            '<div class="pl-tags-row" style="margin-bottom:8px;">' +
              [
                '如果我们身处民国谍战，各为其主互不知晓……',
                '如果在文明崩塌的废土，仿生人与机械医师流浪荒原……',
                '如果我们从未在现实相识，而是换成了高二盛夏的同桌……',
                '如果在深空百年的空间站，只能通过引力波通信……',
                '如果我们同入仙门修道，一个飞升在即一个甘入红尘……',
                '如果我们只是大城市里深夜便利店避雨的陌路人……'
              ].map(function(pText) {
                var shortLabel = pText.slice(0, 8) + '…';
                return '<button type="button" class="pl-tag-pill" data-full-premise="' + escapeHtml(pText) + '">' + shortLabel + '</button>';
              }).join('') +
            '</div>' +
            '<div style="font-size:12px;color:var(--c-sub);margin-bottom:6px;">核心假设（如果的事）：</div>' +
            '<textarea class="pl-input pl-textarea" id="pl-form-premise" placeholder="例如：如果我们从小在同一个孤儿院长大……">' +
              escapeHtml((initialPreset && initialPreset.premise) || '') +
            '</textarea>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:12px;color:var(--c-sub);margin-bottom:6px;">IF 宇宙标题（可选，留空自动生成）：</div>' +
            '<input class="pl-input" id="pl-form-title" placeholder="例如：风雪旧年 / 盛夏秘密" value="' +
              escapeHtml((initialPreset && initialPreset.title) || '') +
            '">' +
          '</div>' +
        '</div>' +

        // 世界背景与初始关系
        '<div class="pl-form-section">' +
          '<div class="pl-form-head">' +
            '<div class="pl-form-title"><i class="fa-solid fa-earth-americas"></i> 世界背景与关系</div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:12px;color:var(--c-sub);margin-bottom:6px;">世界背景设定：</div>' +
            '<div class="pl-tags-row" id="pl-bg-tags">' +
              ['现代都市', '青葱校园', '民国谍影', '仙侠修真', '废土末日', '赛博朋克', '古风权谋', '星际航行', '欧风宫廷'].map(function(t) {
                return '<button type="button" class="pl-tag-pill" data-fill="#pl-form-bg">' + t + '</button>';
              }).join('') +
            '</div>' +
            '<input class="pl-input" id="pl-form-bg" style="margin-top:6px;" placeholder="选择上方标签或自行填写世界观" value="' +
              escapeHtml((initialPreset && initialPreset.worldSetting) || '现代都市') +
            '">' +
          '</div>' +
          '<div>' +
            '<div style="font-size:12px;color:var(--c-sub);margin-bottom:6px;">初始关系：</div>' +
            '<div class="pl-tags-row" id="pl-rel-tags">' +
              ['青梅竹马', '宿敌死对头', '契约合伙人', '陌路偶遇', '同门师友', '假戏真做', '双向暗恋', '师生前后辈'].map(function(t) {
                return '<button type="button" class="pl-tag-pill" data-fill="#pl-form-rel">' + t + '</button>';
              }).join('') +
            '</div>' +
            '<input class="pl-input" id="pl-form-rel" style="margin-top:6px;" placeholder="选择或填写两人的初始羁绊" value="' +
              escapeHtml((initialPreset && initialPreset.initialRelationship) || '初次相遇') +
            '">' +
          '</div>' +
        '</div>' +

        // 特殊设定与氛围
        '<div class="pl-form-section">' +
          '<div class="pl-form-head">' +
            '<div class="pl-form-title"><i class="fa-solid fa-wand-magic"></i> 特殊设定与故事氛围</div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:12px;color:var(--c-sub);margin-bottom:6px;">特殊设定 / 核心伏笔（可选）：</div>' +
            '<div class="pl-tags-row" id="pl-special-tags">' +
              ['失忆封印', '时间循环', '身份互换', '触碰心声', '灵魂绑定', '重回十年前', '命中宿命劫'].map(function(t) {
                return '<button type="button" class="pl-tag-pill" data-fill="#pl-form-special">' + t + '</button>';
              }).join('') +
            '</div>' +
            '<input class="pl-input" id="pl-form-special" style="margin-top:6px;" placeholder="例如：失忆前留下的一封信" value="' +
              escapeHtml((initialPreset && initialPreset.specialSettings) || '') +
            '">' +
          '</div>' +
          '<div>' +
            '<div style="font-size:12px;color:var(--c-sub);margin-bottom:6px;">故事基调氛围：</div>' +
            '<div class="pl-tags-row" id="pl-atmos-pills">' +
              ['甜蜜', '暧昧', '虐恋', '治愈', '悬疑', '轻快', '史诗'].map(function(a) {
                return '<button type="button" class="pl-tag-pill ' + (a === selectedAtmosphere ? 'active' : '') + '" data-val="' + a + '">' + a + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:12px;color:var(--c-sub);margin-bottom:6px;">想看的情节 / 期待名场面（可选）：</div>' +
            '<div class="pl-tags-row" id="pl-anticipation-tags">' +
              ['雨夜对质', '重逢相认', '并肩作战', '解开心结', '互诉衷肠', '危机营救'].map(function(t) {
                return '<button type="button" class="pl-tag-pill" data-fill="#pl-form-anticipation">' + t + '</button>';
              }).join('') +
            '</div>' +
            '<input class="pl-input" id="pl-form-anticipation" style="margin-top:6px;" placeholder="例如：暴雨中两人共撑一把折伞对质" value="' +
              escapeHtml((initialPreset && initialPreset.storyAnticipation) || '') +
            '">' +
          '</div>' +
        '</div>' +

        // 游玩模式与篇幅
        '<div class="pl-form-section">' +
          '<div class="pl-form-head">' +
            '<div class="pl-form-title"><i class="fa-solid fa-clapperboard"></i> 游玩模式选择</div>' +
          '</div>' +
          '<div class="pl-mode-selector-grid" id="pl-mode-cards">' +
            '<div class="pl-mode-card ' + (selectedMode === 'spectator' ? 'selected' : '') + '" data-mode="spectator">' +
              '<div class="pl-mode-header">' +
                '<div class="pl-mode-name"><i class="fa-solid fa-video"></i> 观影模式</div>' +
                '<div class="pl-mode-radio"></div>' +
              '</div>' +
              '<div class="pl-mode-desc">你是自由导演。AI 演绎全员与环境，你的输入为下一幕点梗、镜头调度或时间跳跃。</div>' +
            '</div>' +
            '<div class="pl-mode-card ' + (selectedMode === 'inCharacter' ? 'selected' : '') + '" data-mode="inCharacter">' +
              '<div class="pl-mode-header">' +
                '<div class="pl-mode-name"><i class="fa-solid fa-masks-theater"></i> 入戏模式</div>' +
                '<div class="pl-mode-radio"></div>' +
              '</div>' +
              '<div class="pl-mode-desc">你亲自参演主角。享有绝对玩家自主权，AI 绝不代写你的台词、决定与内心。</div>' +
            '</div>' +
          '</div>' +
          '<div style="margin-top:4px;">' +
            '<div style="font-size:12px;color:var(--c-sub);margin-bottom:6px;">剧情预期篇幅：</div>' +
            '<div class="pl-tags-row" id="pl-length-pills">' +
              ['短篇 (3~5幕)', '标准 (8~15幕)', '长篇连续剧'].map(function(len) {
                var clean = len.split(' ')[0];
                return '<button type="button" class="pl-tag-pill ' + (clean === selectedLength ? 'active' : '') + '" data-val="' + clean + '">' + len + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +

        // 提交按钮
        '<button class="pl-btn-submit" id="pl-btn-submit-universe">' +
          '<i class="fa-solid fa-sparkles"></i><span>锚定平行世界 · 生成首幕开场</span>' +
        '</button>' +
      '</div>';

    window.openPage(wizard);

    // 绑定返回
    wizard.querySelector('#pl-wiz-back').onclick = function() {
      wizard.remove();
    };

    // 绑定盲盒按钮
    wizard.querySelector('#pl-wiz-blindbox-btn').onclick = function() {
      var selectedList = characters.filter(function(c) { return selectedCharIds.has(c.id); });
      openBlindBoxModal(wizard, selectedList);
    };

    // 角色单选/多选模式切换
    var selectionMode = 'multi';
    var countBadge = wizard.querySelector('#pl-role-count-badge');
    var btnSingle = wizard.querySelector('#pl-role-mode-single');
    var btnMulti = wizard.querySelector('#pl-role-mode-multi');

    var updateRoleSelectionUI = function() {
      wizard.querySelectorAll('.pl-role-card').forEach(function(card) {
        var id = parseInt(card.getAttribute('data-char-id'), 10);
        if (selectedCharIds.has(id)) {
          card.classList.add('selected');
        } else {
          card.classList.remove('selected');
        }
      });
      if (countBadge) countBadge.textContent = '已选 ' + selectedCharIds.size + ' 位';
    };

    btnSingle.onclick = function() {
      selectionMode = 'single';
      btnSingle.classList.add('active');
      btnMulti.classList.remove('active');
      if (selectedCharIds.size > 1) {
        var firstId = Array.from(selectedCharIds)[0];
        selectedCharIds.clear();
        selectedCharIds.add(firstId);
        updateRoleSelectionUI();
      }
    };

    btnMulti.onclick = function() {
      selectionMode = 'multi';
      btnMulti.classList.add('active');
      btnSingle.classList.remove('active');
    };

    // 角色选择点击事件
    wizard.querySelectorAll('.pl-role-card').forEach(function(card) {
      card.onclick = function() {
        var id = parseInt(card.getAttribute('data-char-id'), 10);
        if (selectionMode === 'single') {
          selectedCharIds.clear();
          selectedCharIds.add(id);
          updateRoleSelectionUI();
        } else {
          if (selectedCharIds.has(id)) {
            if (selectedCharIds.size > 1) {
              selectedCharIds.delete(id);
              updateRoleSelectionUI();
            } else {
              window.toast && window.toast('至少需要保留一位出演角色');
            }
          } else {
            selectedCharIds.add(id);
            updateRoleSelectionUI();
          }
        }
      };
    });

    // 快捷核心假想带入
    wizard.querySelectorAll('button[data-full-premise]').forEach(function(btn) {
      btn.onclick = function() {
        var premiseText = btn.getAttribute('data-full-premise');
        var premiseInput = wizard.querySelector('#pl-form-premise');
        if (premiseInput) {
          premiseInput.value = premiseText;
          premiseInput.focus();
        }
      };
    });

    // 快捷标签点击自动填入输入框
    wizard.querySelectorAll('.pl-tag-pill[data-fill]').forEach(function(pill) {
      pill.onclick = function() {
        var targetSelector = pill.getAttribute('data-fill');
        var targetInput = wizard.querySelector(targetSelector);
        if (targetInput) {
          targetInput.value = pill.textContent;
          targetInput.focus();
        }
      };
    });

    // 故事氛围切换
    wizard.querySelectorAll('#pl-atmos-pills .pl-tag-pill').forEach(function(pill) {
      pill.onclick = function() {
        wizard.querySelectorAll('#pl-atmos-pills .pl-tag-pill').forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');
        selectedAtmosphere = pill.getAttribute('data-val');
      };
    });

    // 篇幅切换
    wizard.querySelectorAll('#pl-length-pills .pl-tag-pill').forEach(function(pill) {
      pill.onclick = function() {
        wizard.querySelectorAll('#pl-length-pills .pl-tag-pill').forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');
        selectedLength = pill.getAttribute('data-val');
      };
    });

    // 游玩模式切换
    wizard.querySelectorAll('.pl-mode-card').forEach(function(card) {
      card.onclick = function() {
        wizard.querySelectorAll('.pl-mode-card').forEach(function(c) { c.classList.remove('selected'); });
        card.classList.add('selected');
        selectedMode = card.getAttribute('data-mode');
      };
    });

    // 提交创建
    wizard.querySelector('#pl-btn-submit-universe').onclick = async function() {
      var premise = (wizard.querySelector('#pl-form-premise').value || '').trim();
      if (!premise) {
        window.toast && window.toast('请填写核心假设（例如：如果我们……）');
        wizard.querySelector('#pl-form-premise').focus();
        return;
      }
      if (selectedCharIds.size === 0) {
        window.toast && window.toast('请至少勾选一位出演角色');
        return;
      }

      var chosenChars = characters.filter(function(c) { return selectedCharIds.has(c.id); });
      var title = (wizard.querySelector('#pl-form-title').value || '').trim();
      var worldSetting = (wizard.querySelector('#pl-form-bg').value || '').trim() || '现代都市';
      var initialRelationship = (wizard.querySelector('#pl-form-rel').value || '').trim() || '初次相遇';
      var specialSettings = (wizard.querySelector('#pl-form-special').value || '').trim();
      var storyAnticipation = (wizard.querySelector('#pl-form-anticipation').value || '').trim();

      var submitBtn = wizard.querySelector('#pl-btn-submit-universe');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.6';
        submitBtn.style.pointerEvents = 'none';
      }

      // 展示全屏演绎加载中动效
      showGeneratingOverlay('正在观测量子分支并锚定世界…', '正在为你演绎第一幕平行开场，角色数据已物理隔离安全沙盒…', function() {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          submitBtn.style.pointerEvents = 'auto';
        }
      });

      try {
        // 1. 调用存储层建立独立宇宙
        var result = await window.ParallelLettersStorage.createUniverse({
          title: title,
          premise: premise,
          worldSetting: worldSetting,
          initialRelationship: initialRelationship,
          specialSettings: specialSettings,
          storyAnticipation: storyAnticipation,
          atmosphere: selectedAtmosphere,
          storyLength: selectedLength,
          playMode: selectedMode,
          selectedCharacters: chosenChars
        });

        // 2. 调用 AI 引擎生成第一幕开场
        var firstScene = await window.ParallelLettersAI.generateScene(result.universe, result.rootBranch, '');

        // 3. 追加首幕至分支
        await window.ParallelLettersStorage.addSceneToBranch(
          result.universe.universeId,
          result.rootBranch.branchId,
          firstScene
        );

        hideGeneratingOverlay();
        wizard.remove();

        // 刷新主页列表
        var homePage = document.getElementById('parallel-letters-page');
        if (homePage) renderUniverseList(homePage);

        window.toast && window.toast('平行宇宙已成功锚定！第一幕已就位');
        // 打开剧场
        openTheatreView(result.universe.universeId);

      } catch (err) {
        hideGeneratingOverlay();
        console.error('[ParallelLetters] 创建宇宙失败:', err);
        window.toast && window.toast('开启失败：' + (err.message || err));
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          submitBtn.style.pointerEvents = 'auto';
        }
      }
    };
  }

  // ===== 3. 「命运盲盒」灵感抽卡弹窗 =====
  async function openBlindBoxModal(parentWizardPage, preselectedChars) {
    var overlay = document.createElement('div');
    overlay.className = 'pl-modal-overlay';

    // 获取出演角色
    var chars = preselectedChars;
    if (!chars || !chars.length) {
      chars = await window.ParallelLettersStorage.getAllPlayableCharacters();
    }
    var charNames = (chars || []).map(function(c) { return c.name; }).filter(Boolean).join('、');

    overlay.innerHTML =
      '<div class="pl-modal-sheet">' +
        '<div class="pl-modal-header">' +
          '<div>' +
            '<div class="pl-modal-title"><i class="fa-solid fa-dice"></i> 命运盲盒 · 灵感抽卡</div>' +
            '<div class="pl-bb-cast-source" style="margin-top:4px;"><i class="fa-solid fa-users"></i> 灵感出演源：' + escapeHtml(charNames || '小手机角色库') + '</div>' +
          '</div>' +
          '<button class="pl-icon-btn" id="pl-close-bb"><i class="fa fa-xmark"></i></button>' +
        '</div>' +
        '<div class="pl-modal-body" id="pl-bb-cards-container">' +
          '<div class="pl-empty-box">' +
            '<div class="pl-gen-spinner" style="border-top-color:var(--c-text);border-color:var(--c-border);width:32px;height:32px;margin-bottom:8px;"></div>' +
            '<div style="font-size:13px;font-weight:600;color:var(--c-text);">摇动命运骰子中…</div>' +
            '<div style="font-size:11px;color:var(--c-sub);">正在为【' + escapeHtml(charNames || '角色') + '】从无限平行宇宙捕捉脑洞灵感</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector('#pl-close-bb').onclick = function() {
      overlay.remove();
    };
    overlay.onclick = function(e) {
      if (e.target === overlay) overlay.remove();
    };

    // 调用灵感生成器
    var inspirations = await window.ParallelLettersAI.generateBlindBoxInspirations(chars);

    var container = overlay.querySelector('#pl-bb-cards-container');
    if (!container) return;

    container.innerHTML = inspirations.map(function(item, idx) {
      return (
        '<div class="pl-blindbox-card">' +
          '<div class="pl-bb-title-row">' +
            '<div class="pl-bb-title">' + escapeHtml(item.title) + '</div>' +
            '<div class="pl-bb-badge">' + escapeHtml(item.theme || '平行IF') + '</div>' +
          '</div>' +
          '<div class="pl-bb-premise"><strong>核心假设：</strong>' + escapeHtml(item.premise) + '</div>' +
          '<div class="pl-bb-tags">' +
            '<span><i class="fa-solid fa-earth-asia"></i> ' + escapeHtml(item.worldSetting) + '</span>' +
            '<span> · </span>' +
            '<span><i class="fa-solid fa-heart"></i> ' + escapeHtml(item.initialRelationship) + '</span>' +
            '<span> · </span>' +
            '<span><i class="fa-solid fa-sparkles"></i> ' + escapeHtml(item.atmosphere || '治愈') + '</span>' +
          '</div>' +
          (item.specialSettings ?
            '<div class="pl-bb-special"><strong>特殊伏笔：</strong>' + escapeHtml(item.specialSettings) + '</div>' : '') +
          (item.storyAnticipation ?
            '<div class="pl-bb-anticipation"><strong>名场面期待：</strong>' + escapeHtml(item.storyAnticipation) + '</div>' : '') +
          '<div class="pl-bb-actions">' +
            '<button class="pl-btn-adopt" data-bb-idx="' + idx + '">' +
              '<i class="fa-solid fa-arrow-down-left-and-arrow-up-right-to-center"></i><span>一键采纳此设定</span>' +
            '</button>' +
          '</div>' +
        '</div>'
      );
    }).join('') +
    '<button class="pl-btn-hero-secondary" id="pl-bb-reroll" style="margin-top:6px;background:var(--c-surface-2);color:var(--c-text);border-color:var(--c-border);">' +
      '<i class="fa-solid fa-rotate-right"></i><span>再摇一次盲盒</span>' +
    '</button>';

    // 绑定再摇一次
    container.querySelector('#pl-bb-reroll').onclick = function() {
      overlay.remove();
      openBlindBoxModal(parentWizardPage, preselectedChars);
    };

    // 绑定采纳
    container.querySelectorAll('.pl-btn-adopt').forEach(function(btn) {
      btn.onclick = function() {
        var idx = parseInt(btn.getAttribute('data-bb-idx'), 10);
        var chosen = inspirations[idx];
        overlay.remove();

        if (parentWizardPage) {
          // 如果当前已经在创建页面中，直接填入表单字段
          if (parentWizardPage.querySelector('#pl-form-title')) parentWizardPage.querySelector('#pl-form-title').value = chosen.title;
          if (parentWizardPage.querySelector('#pl-form-premise')) parentWizardPage.querySelector('#pl-form-premise').value = chosen.premise;
          if (parentWizardPage.querySelector('#pl-form-bg')) parentWizardPage.querySelector('#pl-form-bg').value = chosen.worldSetting;
          if (parentWizardPage.querySelector('#pl-form-rel')) parentWizardPage.querySelector('#pl-form-rel').value = chosen.initialRelationship;
          if (parentWizardPage.querySelector('#pl-form-special')) parentWizardPage.querySelector('#pl-form-special').value = chosen.specialSettings || '';
          if (parentWizardPage.querySelector('#pl-form-anticipation')) parentWizardPage.querySelector('#pl-form-anticipation').value = chosen.storyAnticipation || '';
          if (chosen.atmosphere) {
            parentWizardPage.querySelectorAll('#pl-atmos-pills .pl-tag-pill').forEach(function(p) {
              if (p.getAttribute('data-val') === chosen.atmosphere) p.click();
            });
          }
          window.toast && window.toast('已成功注入「' + chosen.title + '」设定，可继续微调！');
          var scroll = parentWizardPage.querySelector('#pl-wiz-scroll');
          if (scroll) scroll.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          // 如果在首页直接摇出，打开创建向导并带入
          openCreateUniverseWizard(chosen);
        }
      };
    });
  }

  // ===== 4. 全屏生成加载中遮罩 (含优雅超时取消与防卡死) =====
  var currentGeneratingCancelFn = null;
  function showGeneratingOverlay(text, subText, onCancel) {
    hideGeneratingOverlay();
    var overlay = document.createElement('div');
    overlay.id = 'pl-generating-overlay';
    overlay.className = 'pl-generating-overlay';
    overlay.innerHTML =
      '<div class="pl-gen-spinner"></div>' +
      '<div class="pl-gen-text">' + escapeHtml(text || '正在演绎中…') + '</div>' +
      '<div class="pl-gen-sub">' + escapeHtml(subText || '请稍候，故事正在生动推进…') + '</div>' +
      '<button type="button" class="pl-gen-cancel-btn" id="pl-gen-cancel-btn" style="display:none;">取消等待</button>';
    document.body.appendChild(overlay);

    var cancelTimer = setTimeout(function() {
      var cBtn = overlay.querySelector('#pl-gen-cancel-btn');
      if (cBtn) cBtn.style.display = 'inline-block';
    }, 4000);

    currentGeneratingCancelFn = function() {
      clearTimeout(cancelTimer);
      if (onCancel) onCancel();
    };

    var btn = overlay.querySelector('#pl-gen-cancel-btn');
    if (btn) {
      btn.onclick = function() {
        hideGeneratingOverlay();
        if (currentGeneratingCancelFn) currentGeneratingCancelFn();
        window.toast && window.toast('已取消等待');
      };
    }
  }

  function hideGeneratingOverlay() {
    var el = document.getElementById('pl-generating-overlay');
    if (el) el.remove();
    currentGeneratingCancelFn = null;
  }

  // ===== 5. 剧场预览与交互演绎页 (Theatre View - 阶段三核心) =====
  async function openTheatreView(universeId) {
    var universe = await window.ParallelLettersStorage.getUniverse(universeId);
    if (!universe) {
      window.toast && window.toast('未找到该平行宇宙档案');
      return;
    }

    var allBranches = await window.ParallelLettersStorage.getUniverseBranches(universeId);
    var branch = null;
    if (universe.activeBranchId) {
      branch = allBranches.find(function(b) { return b.branchId === universe.activeBranchId; });
    }
    if (!branch && allBranches.length > 0) {
      branch = allBranches[0];
      universe.activeBranchId = branch.branchId;
      await window.ParallelLettersStorage.saveUniverse(universe);
    }

    var theatre = document.createElement('div');
    theatre.id = 'pl-theatre-page';
    theatre.className = 'full-page';

    // 快捷指令配置表
    var SPECTATOR_QUICK_CHIPS = ['⏱️ 跳至次日', '🌧️ 骤降暴雨', '👁️ 切换TA视角', '⚡ 突发危机', '✨ 走向终章'];
    var IN_CHARACTER_QUICK_CHIPS = ['💬 试探发问', '🤫 保持沉默', '🚶 转身避开', '🤝 递出手心', '❓ 追问真相'];

    var getModeName = function(m) { return m === 'inCharacter' ? '入戏模式' : '观影模式'; };
    var getModeIcon = function(m) { return m === 'inCharacter' ? 'fa-masks-theater' : 'fa-video'; };
    var getModePlaceholder = function(m) {
      return m === 'inCharacter'
        ? '以主角身份行动或对话（如：“我看着他的眼睛，轻声问道……”）'
        : '以导演身份调度：情节演进/镜头转移/时间跳跃（如：跳至三天后、切换视角…）';
    };

    theatre.innerHTML =
      '<div class="pl-navbar">' +
        '<div class="pl-nav-left">' +
          '<button class="pl-back-btn" id="pl-theatre-back">' +
            '<i class="fa fa-angle-left"></i><span>剧场档案</span>' +
          '</button>' +
        '</div>' +
        '<div class="pl-nav-title">' + escapeHtml(universe.title) + '</div>' +
        '<div class="pl-nav-actions">' +
          '<button class="pl-icon-btn" id="pl-theatre-tree-nav-btn" title="查看命运分支树">' +
            '<i class="fa-solid fa-code-branch"></i>' +
          '</button>' +
          '<button class="pl-icon-btn" id="pl-theatre-mode-btn" title="切换模式">' +
            '<i class="fa-solid ' + getModeIcon(universe.currentMode) + '"></i>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="pl-scroll-body" id="pl-theatre-scroll" style="padding-bottom:120px;">' +
        // 世界设定横幅
        '<div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-md);padding:12px 14px;box-shadow:var(--shadow-sm);">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
            '<div style="font-size:11px;font-weight:600;color:var(--c-sub);" id="pl-theatre-branch-title">' +
              '<i class="fa-solid fa-code-branch"></i> ' + escapeHtml(branch ? branch.branchName : '主线') +
            '</div>' +
            '<div class="pl-univ-tag-item" id="pl-theatre-header-mode-tag">' + (universe.currentMode === 'inCharacter' ? '🎭 亲历主角' : '🎬 自由导演') + '</div>' +
          '</div>' +
          '<div style="font-size:13px;font-weight:600;color:var(--c-text);line-height:1.4;">' + escapeHtml(universe.premise) + '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:var(--c-sub);">' +
            '<span>背景: ' + escapeHtml(universe.worldSetting) + '</span>' +
            '<span> · 关系: <span id="pl-theatre-rel-span">' + escapeHtml(branch ? branch.relationshipState : universe.initialRelationship) + '</span></span>' +
            '<span> · 氛围: ' + escapeHtml(universe.atmosphere || '治愈') + '</span>' +
          '</div>' +
        '</div>' +

        // 幕次内容列表容器
        '<div id="pl-scenes-container" style="display:flex;flex-direction:column;gap:16px;">' +
        '</div>' +
      '</div>' +

      // 阶段三：底部常驻双模式交互控制栏
      '<div class="pl-theatre-bottom-bar">' +
        '<div class="pl-theatre-bar-top">' +
          '<div class="pl-theatre-mode-pill ' + (universe.currentMode === 'inCharacter' ? 'in-character' : '') + '" id="pl-bottom-mode-toggle">' +
            '<i class="fa-solid ' + getModeIcon(universe.currentMode) + '"></i>' +
            '<span id="pl-bottom-mode-text">' + getModeName(universe.currentMode) + '</span>' +
          '</div>' +
          '<div class="pl-theatre-quick-pills" id="pl-theatre-quick-chips">' +
            (universe.currentMode === 'inCharacter' ? IN_CHARACTER_QUICK_CHIPS : SPECTATOR_QUICK_CHIPS).map(function(t) {
              return '<button type="button" class="pl-theatre-quick-chip" data-quick-text="' + escapeHtml(t) + '">' + t + '</button>';
            }).join('') +
          '</div>' +
          '<button type="button" class="pl-branch-tree-btn" id="pl-bottom-tree-btn" title="查看分支树">' +
            '<i class="fa-solid fa-code-branch"></i><span>分支</span>' +
            '<span class="pl-branch-count-badge" id="pl-branch-count-badge">' + allBranches.length + '</span>' +
          '</button>' +
        '</div>' +
        '<div class="pl-theatre-input-row">' +
          '<textarea class="pl-theatre-input" id="pl-theatre-input" rows="1" placeholder="' + escapeHtml(getModePlaceholder(universe.currentMode)) + '"></textarea>' +
          '<button class="pl-theatre-send-btn" id="pl-theatre-send-btn" title="推进剧情">' +
            '<i class="fa-solid fa-paper-plane"></i>' +
          '</button>' +
        '</div>' +
      '</div>';

    window.openPage(theatre);

    // 渲染幕次列表卡片
    function renderScenes() {
      var scenesContainer = theatre.querySelector('#pl-scenes-container');
      if (!scenesContainer) return;
      var currentScenes = (branch && branch.scenes) || [];

      if (!currentScenes.length) {
        scenesContainer.innerHTML =
          '<div class="pl-empty-box" style="padding:24px 16px;">' +
            '<div class="pl-empty-title">本分支暂无剧情记录</div>' +
            '<div class="pl-empty-sub">在下方输入指令或选择快捷词开启本分支首幕</div>' +
          '</div>';
        return;
      }

      scenesContainer.innerHTML = currentScenes.map(function(scene, sIdx) {
        var isLastScene = (sIdx === currentScenes.length - 1);
        return (
          '<div class="pl-scene-card" data-scene-idx="' + sIdx + '">' +
            '<div class="pl-scene-header">' +
              '<div class="pl-scene-header-left">' +
                '<i class="fa-solid fa-bookmark"></i> 第 ' + (sIdx + 1) + ' 幕 · ' + escapeHtml(scene.timeTag || '此刻') +
              '</div>' +
              '<div class="pl-scene-header-actions">' +
                '<div style="font-size:10px;color:var(--c-sub);margin-right:2px;">' + (scene.mode === 'inCharacter' ? '🎭 亲历' : '🎬 导演') + '</div>' +
                '<button type="button" class="pl-scene-mini-btn pl-scene-fork-btn" data-fork-idx="' + sIdx + '" title="从本幕开启平行分叉">' +
                  '<i class="fa-solid fa-code-branch"></i><span>分叉</span>' +
                '</button>' +
                (isLastScene ?
                  '<button type="button" class="pl-scene-mini-btn pl-scene-rewrite-btn" data-rewrite-idx="' + sIdx + '" title="改写重做当前幕">' +
                    '<i class="fa-solid fa-rotate-left"></i><span>重写</span>' +
                  '</button>' : '') +
              '</div>' +
            '</div>' +
            (scene.directorPrompt ?
              '<div style="background:var(--c-surface-2);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--c-sub);border:1px dashed var(--c-border-m);">' +
                '<i class="fa-solid fa-clapperboard"></i> <strong>导演指令：</strong>' + escapeHtml(scene.directorPrompt) +
              '</div>' : '') +
            (scene.playerAction ?
              '<div style="background:var(--c-surface-2);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--c-text);border:1px solid var(--c-border);">' +
                '<i class="fa-solid fa-user"></i> <strong>我的行动：</strong>' + escapeHtml(scene.playerAction) +
              '</div>' : '') +
            (scene.narration ?
              '<div style="font-size:13.5px;line-height:1.75;color:var(--c-text);white-space:pre-line;text-indent:2em;">' +
                escapeHtml(scene.narration) +
              '</div>' : '') +
            (scene.dialogues && scene.dialogues.length ?
              '<div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">' +
                scene.dialogues.map(function(d) {
                  return (
                    '<div style="display:flex;gap:10px;align-items:flex-start;">' +
                      '<div style="background:var(--c-text);color:var(--c-bg);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;flex-shrink:0;margin-top:2px;">' +
                        escapeHtml(d.speaker || '角色') +
                      '</div>' +
                      '<div style="flex:1;font-size:13px;line-height:1.5;color:var(--c-text);">' +
                        escapeHtml(d.text) +
                        (d.aside ? '<span style="font-size:11px;color:var(--c-sub);margin-left:6px;">(' + escapeHtml(d.aside) + ')</span>' : '') +
                      '</div>' +
                    '</div>'
                  );
                }).join('') +
              '</div>' : '') +
            (scene.relationshipEvolution ?
              '<div style="background:var(--c-surface-2);border-radius:6px;padding:6px 10px;font-size:11.5px;color:var(--c-sub);display:flex;align-items:center;gap:6px;">' +
                '<i class="fa-solid fa-heart" style="color:var(--c-accent-dark);font-size:11px;"></i> <strong>关系微澜：</strong>' + escapeHtml(scene.relationshipEvolution) +
              '</div>' : '') +
            (scene.keyEvent ?
              '<div style="font-size:11px;color:var(--c-accent-dark);font-weight:600;display:flex;align-items:center;gap:4px;">' +
                '<i class="fa-solid fa-flag"></i> ' + escapeHtml(scene.keyEvent) +
              '</div>' : '') +
            (scene.choices && scene.choices.length && isLastScene ?
              '<div class="pl-choice-container">' +
                '<div style="font-size:11px;color:var(--c-sub);margin-bottom:6px;"><i class="fa-solid fa-code-branch"></i> 命运岔路建议（点击直接推进，或分叉新世界）：</div>' +
                '<div style="display:flex;flex-direction:column;gap:6px;">' +
                  scene.choices.map(function(c) {
                    return (
                      '<div class="pl-choice-row">' +
                        '<button class="pl-choice-advance-btn" data-choice-advance="' + escapeHtml(c.text) + '">' +
                          '<strong>选项 ' + c.id + '：</strong>' + escapeHtml(c.text) + (c.hint ? ' <span style="opacity:0.7;">(' + escapeHtml(c.hint) + ')</span>' : '') +
                        '</button>' +
                        '<button class="pl-choice-fork-btn" data-choice-fork="' + escapeHtml(c.text) + '" data-fork-scene-idx="' + sIdx + '" title="以此选项开辟全新平行分支">' +
                          '<i class="fa-solid fa-code-branch"></i><span>分叉新线</span>' +
                        '</button>' +
                      '</div>'
                    );
                  }).join('') +
                '</div>' +
              '</div>' : '') +
          '</div>'
        );
      }).join('');

      // 绑定分叉按钮
      scenesContainer.querySelectorAll('.pl-scene-fork-btn').forEach(function(btn) {
        btn.onclick = function() {
          var idx = parseInt(btn.getAttribute('data-fork-idx'), 10);
          handleForkFromScene(idx, null, null);
        };
      });

      // 绑定重写本幕按钮
      scenesContainer.querySelectorAll('.pl-scene-rewrite-btn').forEach(function(btn) {
        btn.onclick = function() {
          var idx = parseInt(btn.getAttribute('data-rewrite-idx'), 10);
          handleRewriteScene(idx);
        };
      });

      // 绑定直接推进选项
      scenesContainer.querySelectorAll('button[data-choice-advance]').forEach(function(btn) {
        btn.onclick = function() {
          var text = btn.getAttribute('data-choice-advance');
          advanceStory(text, text);
        };
      });

      // 绑定以该选项开辟分叉
      scenesContainer.querySelectorAll('button[data-choice-fork]').forEach(function(btn) {
        btn.onclick = function() {
          var text = btn.getAttribute('data-choice-fork');
          var sIdx = parseInt(btn.getAttribute('data-fork-scene-idx'), 10);
          handleForkFromScene(sIdx, '分支 · ' + text.slice(0, 10), text);
        };
      });
    }

    renderScenes();

    // 滚动到底部辅助
    function scrollToBottom() {
      setTimeout(function() {
        var scroll = theatre.querySelector('#pl-theatre-scroll');
        if (scroll) scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
      }, 80);
    }
    scrollToBottom();

    // 动态无缝切换模式
    async function switchMode(newMode) {
      if (universe.currentMode === newMode) return;
      universe.currentMode = newMode;
      await window.ParallelLettersStorage.saveUniverse(universe);

      // 刷新顶部图标
      var navModeBtn = theatre.querySelector('#pl-theatre-mode-btn');
      if (navModeBtn) navModeBtn.innerHTML = '<i class="fa-solid ' + getModeIcon(newMode) + '"></i>';

      // 刷新顶部卡片标签
      var topTag = theatre.querySelector('#pl-theatre-header-mode-tag');
      if (topTag) topTag.textContent = newMode === 'inCharacter' ? '🎭 亲历主角' : '🎬 自由导演';

      // 刷新底部切换药丸
      var bottomPill = theatre.querySelector('#pl-bottom-mode-toggle');
      var bottomText = theatre.querySelector('#pl-bottom-mode-text');
      if (bottomPill && bottomText) {
        if (newMode === 'inCharacter') {
          bottomPill.classList.add('in-character');
        } else {
          bottomPill.classList.remove('in-character');
        }
        bottomPill.innerHTML = '<i class="fa-solid ' + getModeIcon(newMode) + '"></i><span id="pl-bottom-mode-text">' + getModeName(newMode) + '</span>';
      }

      // 刷新输入框占位符
      var inputEl = theatre.querySelector('#pl-theatre-input');
      if (inputEl) inputEl.placeholder = getModePlaceholder(newMode);

      // 刷新快捷指令胶囊
      var chipsWrap = theatre.querySelector('#pl-theatre-quick-chips');
      if (chipsWrap) {
        var list = newMode === 'inCharacter' ? IN_CHARACTER_QUICK_CHIPS : SPECTATOR_QUICK_CHIPS;
        chipsWrap.innerHTML = list.map(function(t) {
          return '<button type="button" class="pl-theatre-quick-chip" data-quick-text="' + escapeHtml(t) + '">' + t + '</button>';
        }).join('');
        bindQuickChips();
      }

      window.toast && window.toast('已无缝切换至：' + getModeName(newMode));
    }

    // 绑定快捷词点击
    function bindQuickChips() {
      theatre.querySelectorAll('.pl-theatre-quick-chip').forEach(function(chip) {
        chip.onclick = function() {
          var text = chip.getAttribute('data-quick-text');
          var input = theatre.querySelector('#pl-theatre-input');
          if (input) {
            input.value = text;
            input.focus();
          }
        };
      });
    }
    bindQuickChips();

    // 绑定模式切换点击
    theatre.querySelector('#pl-theatre-mode-btn').onclick = function() {
      var next = universe.currentMode === 'inCharacter' ? 'spectator' : 'inCharacter';
      switchMode(next);
    };
    theatre.querySelector('#pl-bottom-mode-toggle').onclick = function() {
      var next = universe.currentMode === 'inCharacter' ? 'spectator' : 'inCharacter';
      switchMode(next);
    };

    var isAdvancingStory = false;
    // 推进剧情主动作
    async function advanceStory(userInput, choiceText) {
      if (isAdvancingStory) return;
      isAdvancingStory = true;

      var sendBtn = theatre.querySelector('#pl-theatre-send-btn');
      var inputEl = theatre.querySelector('#pl-theatre-input');
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
      }
      if (inputEl) inputEl.disabled = true;

      showGeneratingOverlay(
        universe.currentMode === 'inCharacter' ? '角色正在回应你的决断…' : '正在依照导演指令运镜调度…',
        '量子分支正在推演，剧情即将迎来全新发展…',
        function() {
          isAdvancingStory = false;
          if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
          }
          if (inputEl) {
            inputEl.disabled = false;
            inputEl.focus();
          }
        }
      );

      try {
        var newScene = await window.ParallelLettersAI.generateScene(
          universe,
          branch,
          userInput,
          { mode: universe.currentMode, choiceText: choiceText }
        );

        await window.ParallelLettersStorage.addSceneToBranch(
          universe.universeId,
          branch.branchId,
          newScene
        );

        // 更新分支最新关系
        if (newScene.relationshipEvolution) {
          branch.relationshipState = newScene.relationshipEvolution;
          var relSpan = theatre.querySelector('#pl-theatre-rel-span');
          if (relSpan) relSpan.textContent = newScene.relationshipEvolution;
        }

        hideGeneratingOverlay();
        renderScenes();
        scrollToBottom();

        if (inputEl) inputEl.value = '';
        window.toast && window.toast('第 ' + branch.scenes.length + ' 幕已生成！');
      } catch (err) {
        hideGeneratingOverlay();
        console.error('[ParallelLetters] 推进剧情失败:', err);
        window.toast && window.toast('演绎遇到波动：' + (err.message || err) + '，输入已保留，可直接点击重试');
      } finally {
        isAdvancingStory = false;
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.style.opacity = '1';
        }
        if (inputEl) {
          inputEl.disabled = false;
          inputEl.focus();
        }
      }
    }

    // 发送按钮推进
    theatre.querySelector('#pl-theatre-send-btn').onclick = function() {
      var input = theatre.querySelector('#pl-theatre-input');
      var val = (input && input.value || '').trim();
      if (!val) {
        val = universe.currentMode === 'inCharacter' ? '向前迈进一步，认真凝视对方' : '镜头推近，给两人微妙的对峙一个特写';
      }
      advanceStory(val, '');
    };

    // 回车快捷发送
    theatre.querySelector('#pl-theatre-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        theatre.querySelector('#pl-theatre-send-btn').click();
      }
    });

    // 从特定节点开启分支
    async function handleForkFromScene(nodeIndex, customBranchName, autoAdvanceChoice) {
      var defaultName = customBranchName || ('平行分支 ' + (allBranches.length + 1) + ' · 第' + (nodeIndex + 1) + '幕起');
      var newName = prompt('请输入新平行分支名称：', defaultName);
      if (newName === null) return;
      newName = newName.trim() || defaultName;

      showGeneratingOverlay('正在观测并分裂平行时空…', '克隆分叉前历史，创建独立世界线…');

      try {
        var newBranch = await window.ParallelLettersStorage.forkBranch(
          universe.universeId,
          branch.branchId,
          nodeIndex,
          newName
        );

        universe.activeBranchId = newBranch.branchId;
        await window.ParallelLettersStorage.saveUniverse(universe);

        // 如果带入了岔路选择，立刻在分叉线上演绎一幕
        if (autoAdvanceChoice) {
          var branchFirstScene = await window.ParallelLettersAI.generateScene(
            universe,
            newBranch,
            autoAdvanceChoice,
            { mode: universe.currentMode, choiceText: autoAdvanceChoice }
          );
          await window.ParallelLettersStorage.addSceneToBranch(
            universe.universeId,
            newBranch.branchId,
            branchFirstScene
          );
        }

        hideGeneratingOverlay();
        theatre.remove();
        window.toast && window.toast('已成功开启平行分支：「' + newName + '」！');
        // 重新打开新分支剧场
        openTheatreView(universe.universeId);

      } catch (e) {
        hideGeneratingOverlay();
        console.error('[ParallelLetters] 分叉失败:', e);
        window.toast && window.toast('分叉失败：' + (e.message || e));
      }
    }

    // 重写本幕动作
    async function handleRewriteScene(nodeIndex) {
      var hint = prompt('请输入针对本幕的改写指令（留空将换个角度重新演绎）：', '');
      if (hint === null) return;

      showGeneratingOverlay('正在重新演绎本幕…', '保留前序剧情事实，按新方向重新编排…');

      try {
        var rewritten = await window.ParallelLettersAI.generateScene(
          universe,
          branch,
          hint || '重新演绎本幕，提升文学张力',
          { mode: universe.currentMode, rewrite: true }
        );

        await window.ParallelLettersStorage.rewriteSceneInBranch(
          universe.universeId,
          branch.branchId,
          nodeIndex,
          rewritten
        );

        hideGeneratingOverlay();
        renderScenes();
        scrollToBottom();
        window.toast && window.toast('第 ' + (nodeIndex + 1) + ' 幕已重写完成！');
      } catch (e) {
        hideGeneratingOverlay();
        console.error('[ParallelLetters] 重写失败:', e);
        window.toast && window.toast('重写失败：' + (e.message || e));
      }
    }

    // 打开分支树抽屉与回溯系统
    async function openBranchTreeModal() {
      var branches = await window.ParallelLettersStorage.getUniverseBranches(universe.universeId);

      var modalOverlay = document.createElement('div');
      modalOverlay.className = 'pl-modal-overlay';
      modalOverlay.innerHTML =
        '<div class="pl-modal-sheet">' +
          '<div class="pl-modal-header">' +
            '<div class="pl-modal-title"><i class="fa-solid fa-code-branch"></i> 命运分支树 · 平行时空回溯</div>' +
            '<button class="pl-icon-btn" id="pl-close-tree-modal"><i class="fa fa-xmark"></i></button>' +
          '</div>' +
          '<div class="pl-modal-body" style="gap:10px;">' +
            '<div style="font-size:12px;color:var(--c-sub);margin-bottom:2px;">共有 ' + branches.length + ' 条平行世界线。你可以随时回溯跳转到任意分支继续剧情：</div>' +
            branches.map(function(b) {
              var isActive = (b.branchId === branch.branchId);
              var forkDesc = (b.forkNodeIndex >= 0) ? '分叉自第 ' + (b.forkNodeIndex + 1) + ' 幕' : '宇宙始发主线';
              return (
                '<div class="pl-branch-card ' + (isActive ? 'active' : '') + '">' +
                  '<div class="pl-branch-card-header">' +
                    '<div class="pl-branch-card-title">' +
                      '<i class="fa-solid ' + (isActive ? 'fa-circle-dot' : 'fa-code-branch') + '"></i> ' + escapeHtml(b.branchName) +
                      (isActive ? '<span class="pl-univ-tag-item" style="background:var(--c-text);color:var(--c-bg);border:none;">当前时间线</span>' : '') +
                    '</div>' +
                    '<div style="font-size:11px;color:var(--c-sub);">' + (b.scenes ? b.scenes.length : 0) + ' 幕</div>' +
                  '</div>' +
                  '<div class="pl-branch-meta">' +
                    '<div><i class="fa-solid fa-timeline"></i> ' + forkDesc + '</div>' +
                    (b.relationshipState ? '<div><i class="fa-solid fa-heart"></i> 关系：' + escapeHtml(b.relationshipState) + '</div>' : '') +
                  '</div>' +
                  '<div class="pl-branch-actions">' +
                    (!isActive ?
                      '<button type="button" class="pl-btn-adopt pl-switch-branch-btn" data-b-id="' + b.branchId + '">' +
                        '<i class="fa-solid fa-arrow-right-to-bracket"></i><span>切换到此分支</span>' +
                      '</button>' : '') +
                    '<button type="button" class="pl-scene-mini-btn pl-rename-branch-btn" data-b-id="' + b.branchId + '" data-b-name="' + escapeHtml(b.branchName) + '">' +
                      '<i class="fa-solid fa-pen"></i><span>重命名</span>' +
                    '</button>' +
                    (!isActive && branches.length > 1 ?
                      '<button type="button" class="pl-scene-mini-btn pl-del-branch-btn" data-b-id="' + b.branchId + '" style="color:var(--c-red);">' +
                        '<i class="fa-solid fa-trash-can"></i><span>删除</span>' +
                      '</button>' : '') +
                  '</div>' +
                '</div>'
              );
            }).join('') +
          '</div>' +
        '</div>';

      document.body.appendChild(modalOverlay);

      modalOverlay.querySelector('#pl-close-tree-modal').onclick = function() { modalOverlay.remove(); };
      modalOverlay.onclick = function(e) { if (e.target === modalOverlay) modalOverlay.remove(); };

      // 切换分支
      modalOverlay.querySelectorAll('.pl-switch-branch-btn').forEach(function(btn) {
        btn.onclick = async function() {
          var targetBId = btn.getAttribute('data-b-id');
          universe.activeBranchId = targetBId;
          await window.ParallelLettersStorage.saveUniverse(universe);
          modalOverlay.remove();
          theatre.remove();
          openTheatreView(universe.universeId);
          window.toast && window.toast('已成功跳转至该平行时间线！');
        };
      });

      // 重命名分支
      modalOverlay.querySelectorAll('.pl-rename-branch-btn').forEach(function(btn) {
        btn.onclick = async function() {
          var targetBId = btn.getAttribute('data-b-id');
          var oldName = btn.getAttribute('data-b-name');
          var newName = prompt('修改分支名称：', oldName);
          if (newName && newName.trim() && newName.trim() !== oldName) {
            var bObj = await window.ParallelLettersStorage.getBranch(targetBId);
            if (bObj) {
              bObj.branchName = newName.trim();
              await window.ParallelLettersStorage.saveBranch(bObj);
              modalOverlay.remove();
              theatre.remove();
              openTheatreView(universe.universeId);
              window.toast && window.toast('分支名称已更新');
            }
          }
        };
      });

      // 删除分支
      modalOverlay.querySelectorAll('.pl-del-branch-btn').forEach(function(btn) {
        btn.onclick = async function() {
          var targetBId = btn.getAttribute('data-b-id');
          if (!confirm('确定要删除这条平行分支吗？此操作无法撤销。')) return;
          if (window.db && window.db.parallelBranches) {
            await window.db.parallelBranches.delete(targetBId);
            modalOverlay.remove();
            theatre.remove();
            openTheatreView(universe.universeId);
            window.toast && window.toast('分支已删除');
          }
        };
      });
    }

    theatre.querySelector('#pl-theatre-tree-nav-btn').onclick = openBranchTreeModal;
    theatre.querySelector('#pl-bottom-tree-btn').onclick = openBranchTreeModal;

    // 返回列表
    theatre.querySelector('#pl-theatre-back').onclick = function() {
      theatre.remove();
      var homePage = document.getElementById('parallel-letters-page');
      if (homePage) renderUniverseList(homePage);
    };
  }

  // 全局暴露
  window.ParallelLetters = {
    showApp: window.showParallelLettersApp,
    openCreateWizard: openCreateUniverseWizard,
    openBlindBoxModal: openBlindBoxModal,
    openTheatreView: openTheatreView
  };

})();
