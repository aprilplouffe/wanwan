// js/fan-community.js — 同好社区正式模块（韩系奶油极简风社区首页与导航）
// 使用弯弯机 window.openPage / window.closePage 原生全屏页面机制挂载与返回。

(function(global) {
  'use strict';

  var PAGE_ID = 'fan-community-page';
  var _activeTab = 'create';
  var _isClosing = false;

  function notify(msg) {
    if (typeof global.toast === 'function') {
      global.toast(msg);
    }
  }

  var CLOSE_SHIELD_ID = 'fc-close-shield';
  var _closeShieldTimer = 0;

  function clearCloseShield() {
    if (_closeShieldTimer) {
      clearTimeout(_closeShieldTimer);
      _closeShieldTimer = 0;
    }
    var oldShield = document.getElementById(CLOSE_SHIELD_ID);
    if (oldShield) oldShield.remove();
  }

  function mountCloseShield() {
    clearCloseShield();
    var host = document.getElementById('app') || document.body;
    if (!host) return;
    var shield = document.createElement('div');
    shield.id = CLOSE_SHIELD_ID;
    shield.className = 'fc-close-shield';
    shield.setAttribute('aria-hidden', 'true');
    shield.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }, true);
    host.appendChild(shield);
    _closeShieldTimer = setTimeout(clearCloseShield, 360);
  }

  function closeFanCommunityPage() {
    var page = document.getElementById(PAGE_ID);
    if (_isClosing || !page || page.classList.contains('is-closing')) return;
    _isClosing = true;
    mountCloseShield();

    if (global.FanCommunityChat && typeof global.FanCommunityChat.close === 'function') {
      try { global.FanCommunityChat.close(); } catch (_) {}
    }
    if (typeof page._fcCleanup === 'function') {
      try { page._fcCleanup(); } catch (_) {}
      page._fcCleanup = null;
    }
    var subviewHost = page.querySelector('#fc-subview-host');
    if (subviewHost) {
      subviewHost.replaceChildren();
    }
    _activeTab = 'create';

    if (typeof global.closePage === 'function') {
      global.closePage(PAGE_ID);
      return;
    }
    clearCloseShield();
    page.remove();
    _isClosing = false;
  }

  function buildHomeMarkup() {
    return '' +
      '<div class="fc-frame">' +
        '<div class="fc-home-shell" id="fc-home-shell">' +
          '<header class="fc-topbar" id="fc-topbar">' +
            '<button type="button" class="fc-brand-home-btn" id="fc-brand-home-btn" data-fc-home-trigger="1" aria-label="同好社区，点击返回弯弯机桌面" title="点击返回弯弯机桌面">' +
              '<span class="fc-brand-home-title">同好社区</span>' +
              '<span class="fc-brand-home-mark" aria-hidden="true">✦</span>' +
            '</button>' +
          '</header>' +
          '<div class="fc-main" id="fc-main-scroll">' +

          '<section class="fc-view" data-fc-view="create">' +
            '<div class="fc-eyebrow">WANWAN · FAN COMMUNITY</div>' +
            '<p class="fc-desc">故事不止一种打开方式。来这里，翻聊天、追热帖、走进不同的剧情世界。</p>' +
            '<div class="fc-card-list">' +
              '<button type="button" class="fc-entry-card" data-fc-entry="chat">' +
                '<span class="fc-symbol" aria-hidden="true">💬</span>' +
                '<strong class="fc-card-title">捡手机文学</strong>' +
                '<small class="fc-card-desc">沉浸式消息阅读 · QQ 风格功能栏 · 消息撤回 · 表情包 · 语音与视频</small>' +
              '</button>' +
              '<button type="button" class="fc-entry-card" data-fc-entry="forum">' +
                '<span class="fc-symbol" aria-hidden="true">📖</span>' +
                '<strong class="fc-card-title">论坛体</strong>' +
                '<small class="fc-card-desc">主楼 / 楼层 / 引用 / 匿名 / 角色续楼</small>' +
              '</button>' +
              '<button type="button" class="fc-entry-card" data-fc-entry="game">' +
                '<span class="fc-symbol" aria-hidden="true">🎮</span>' +
                '<strong class="fc-card-title">文游模拟器</strong>' +
                '<small class="fc-card-desc">主题与选项驱动的互动剧情</small>' +
              '</button>' +
            '</div>' +
            '<div class="fc-foot">创作、阅读与参与，都在同一个社区。</div>' +
          '</section>' +

          '<section class="fc-view" data-fc-view="archive" hidden>' +
            '<div class="fc-page-heading">' +
              '<small>MY STORY ARCHIVE</small>' +
              '<h2>作品存档</h2>' +
              '<p>已完结的同好社区作品会自动收录于此，随时点击阅读全文、转发给微信联系人或导出保存。</p>' +
            '</div>' +
            '<div id="fc-archive-list-host"></div>' +
          '</section>' +

          '<section class="fc-view" data-fc-view="settings" hidden>' +
            '<div class="fc-page-heading">' +
              '<small>COMMUNITY PREFERENCES</small>' +
              '<h2>社区设置</h2>' +
              '<p>管理整个同好社区共用的公共人设库与社区偏好设置。</p>' +
            '</div>' +
            '<button type="button" class="fc-settings-entry-card" id="fc-open-persona-lib-btn">' +
              '<span class="fc-settings-entry-icon" aria-hidden="true">🪪</span>' +
              '<div class="fc-settings-entry-main">' +
                '<div class="fc-settings-entry-head">' +
                  '<strong class="fc-settings-entry-title">人设库</strong>' +
                  '<span class="fc-settings-entry-badge" id="fc-persona-count-badge">0 位角色</span>' +
                '</div>' +
                '<p class="fc-settings-entry-desc">创建与管理社区公共角色人设，供捡手机文学、论坛体与文游模拟器共用</p>' +
              '</div>' +
              '<span class="fc-settings-entry-arrow" aria-hidden="true">›</span>' +
            '</button>' +
            '<div class="fc-panel-card">' +
              '<h3>字体与阅读偏好</h3>' +
              '<p>更多社区级字体与阅读偏好设置将在后续任务中接入。</p>' +
            '</div>' +
          '</section>' +
        '</div>' +

        '<nav class="fc-nav" aria-label="同好社区导航">' +
          '<button type="button" class="fc-nav-btn nav-active" data-fc-tab="create">' +
            '<span class="fc-nav-icon" aria-hidden="true">✎</span><span>创作</span>' +
          '</button>' +
          '<button type="button" class="fc-nav-btn" data-fc-tab="archive">' +
            '<span class="fc-nav-icon" aria-hidden="true">▣</span><span>存档</span>' +
          '</button>' +
          '<button type="button" class="fc-nav-btn" data-fc-tab="settings">' +
            '<span class="fc-nav-icon" aria-hidden="true">⚙</span><span>设置</span>' +
          '</button>' +
        '</nav>' +
        '</div>' +
        '<div class="fc-subview-host" id="fc-subview-host" hidden></div>' +
      '</div>';
  }

  function formatArchiveTime(ts) {
    var n = Number(ts);
    if (!n || !Number.isFinite(n)) return '';
    var d = new Date(n);
    if (Number.isNaN(d.getTime())) return '';
    var pad = function(x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function openArchiveDeleteConfirm(page, archiveMeta, onDeleted) {
    var old = page.querySelector('#fc-archive-del-back');
    if (old) old.remove();

    var back = document.createElement('div');
    back.id = 'fc-archive-del-back';
    back.className = 'fc-ext-sheet-back show';

    var sheet = document.createElement('section');
    sheet.className = 'fc-ext-sheet';

    var head = document.createElement('div');
    head.className = 'fc-ext-sheet-head';
    var h3 = document.createElement('h3');
    h3.textContent = '确认删除存档';
    head.appendChild(h3);

    var preview = document.createElement('div');
    preview.className = 'fc-forward-work-pill';
    var strong = document.createElement('strong');
    strong.textContent = '《' + (archiveMeta.title || '未命名作品') + '》';
    var sub = document.createElement('span');
    sub.textContent = (archiveMeta.user || '我') + ' × ' + (archiveMeta.char || '对方') + ' · 共 ' + (archiveMeta.messageCount || 0) + ' 条消息';
    preview.appendChild(strong);
    preview.appendChild(sub);

    var note = document.createElement('p');
    note.className = 'fc-ext-sheet-note';
    note.textContent = '删除后将从此存档列表中移除该完结快照，且无法恢复，确定要继续吗？';

    var acts = document.createElement('div');
    acts.className = 'fc-ext-sheet-actions';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'fc-ext-btn alt';
    cancelBtn.textContent = '取消';
    cancelBtn.onclick = function() { back.remove(); };

    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'fc-ext-btn fc-ext-btn-danger';
    confirmBtn.id = 'fc-archive-delete-confirm';
    confirmBtn.textContent = '确认删除';
    confirmBtn.onclick = function() {
      var wApi = global.FanCommunityWorks;
      if (!wApi || typeof wApi.deleteArchive !== 'function') {
        notify('存档模块未就绪');
        return;
      }
      var res = wApi.deleteArchive(archiveMeta.archiveId);
      if (!res.ok) {
        notify(res.error || '删除存档失败');
        return;
      }
      var aApi = global.FanCommunityAssets;
      if (aApi && typeof aApi.deleteAsset === 'function' && Array.isArray(res.orphanedAssetIds)) {
        res.orphanedAssetIds.forEach(function(id) {
          aApi.deleteAsset(id).catch(function() {});
        });
      }
      back.remove();
      notify('已删除存档《' + (archiveMeta.title || '未命名作品') + '》');
      if (typeof onDeleted === 'function') onDeleted();
    };

    acts.appendChild(cancelBtn);
    acts.appendChild(confirmBtn);
    sheet.appendChild(head);
    sheet.appendChild(preview);
    sheet.appendChild(note);
    sheet.appendChild(acts);
    back.appendChild(sheet);
    back.addEventListener('click', function(e) {
      if (e.target === back) back.remove();
    });
    page.appendChild(back);
  }

  function renderArchiveView(page) {
    if (!page) return;
    var host = page.querySelector('#fc-archive-list-host');
    if (!host) return;
    host.replaceChildren();

    var wApi = global.FanCommunityWorks;
    var listRes = (wApi && typeof wApi.listArchives === 'function')
      ? wApi.listArchives()
      : { ok: true, archives: [] };
    var archives = Array.isArray(listRes.archives) ? listRes.archives : [];

    var countRow = document.createElement('div');
    countRow.className = 'fc-archive-summary-bar';
    countRow.innerHTML = '<span>已收录完结作品</span><strong>共 ' + archives.length + ' 部</strong>';
    host.appendChild(countRow);

    if (!archives.length) {
      var emptyCard = document.createElement('div');
      emptyCard.className = 'fc-panel-card fc-archive-empty';
      emptyCard.innerHTML =
        '<h3>暂无完结作品存档</h3>' +
        '<p>进入「捡手机文学」任意作品，打开右上角菜单 →「捡手机设置」点击「完结作品」，即可自动收录完整聊天内容到这里。</p>';
      host.appendChild(emptyCard);
      return;
    }

    var listEl = document.createElement('div');
    listEl.className = 'fc-archive-list';
    listEl.id = 'fc-archive-list';

    archives.forEach(function(arch) {
      var card = document.createElement('article');
      card.className = 'fc-archive-card';
      card.dataset.archiveId = arch.archiveId;

      var mainBtn = document.createElement('button');
      mainBtn.type = 'button';
      mainBtn.className = 'fc-archive-card-main';
      mainBtn.dataset.archiveOpen = arch.archiveId;

      var topRow = document.createElement('div');
      topRow.className = 'fc-archive-card-top';
      var catTag = document.createElement('span');
      catTag.className = 'fc-archive-cat-tag';
      catTag.textContent = arch.categoryLabel || '捡手机文学';
      var doneTag = document.createElement('span');
      doneTag.className = 'fc-archive-done-tag';
      doneTag.textContent = '已完结';
      topRow.appendChild(catTag);
      topRow.appendChild(doneTag);

      var titleEl = document.createElement('h3');
      titleEl.className = 'fc-archive-card-title';
      titleEl.textContent = arch.title || '未命名作品';

      var metaEl = document.createElement('div');
      metaEl.className = 'fc-archive-card-meta';
      metaEl.textContent = (arch.user || '我') + ' × ' + (arch.char || '对方') + ' · ' + (arch.messageCount || 0) + ' 条 · 完结于 ' + formatArchiveTime(arch.completedAt || arch.archivedAt);

      mainBtn.appendChild(topRow);
      mainBtn.appendChild(titleEl);
      mainBtn.appendChild(metaEl);

      if (arch.excerpt) {
        var excerptEl = document.createElement('p');
        excerptEl.className = 'fc-archive-card-excerpt';
        excerptEl.textContent = arch.excerpt;
        mainBtn.appendChild(excerptEl);
      }

      mainBtn.onclick = function() {
        if (typeof page._fcOpenArchiveReader === 'function') {
          page._fcOpenArchiveReader(arch.archiveId);
        }
      };

      var ops = document.createElement('div');
      ops.className = 'fc-archive-card-ops';

      var readBtn = document.createElement('button');
      readBtn.type = 'button';
      readBtn.className = 'fc-archive-op-btn primary';
      readBtn.textContent = '阅读全文';
      readBtn.onclick = function() {
        if (typeof page._fcOpenArchiveReader === 'function') {
          page._fcOpenArchiveReader(arch.archiveId);
        }
      };

      var forwardBtn = document.createElement('button');
      forwardBtn.type = 'button';
      forwardBtn.className = 'fc-archive-op-btn';
      forwardBtn.dataset.archiveForward = arch.archiveId;
      forwardBtn.textContent = '转发';
      forwardBtn.onclick = function() {
        var exApi = global.FanCommunityExport;
        var fullData = wApi && typeof wApi.getArchiveData === 'function' ? wApi.getArchiveData(arch.archiveId) : null;
        if (!fullData) {
          notify('未能读取存档内容');
          return;
        }
        if (!exApi || typeof exApi.openForwardToWechatSheet !== 'function') {
          notify('微信转发模块未就绪');
          return;
        }
        exApi.openForwardToWechatSheet(fullData, page, notify);
      };

      var exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.className = 'fc-archive-op-btn';
      exportBtn.dataset.archiveExport = arch.archiveId;
      exportBtn.textContent = '导出';
      exportBtn.onclick = function() {
        var exApi = global.FanCommunityExport;
        var fullData = wApi && typeof wApi.getArchiveData === 'function' ? wApi.getArchiveData(arch.archiveId) : null;
        if (!fullData) {
          notify('未能读取存档内容');
          return;
        }
        if (!exApi || typeof exApi.openExportWorkSheet !== 'function') {
          notify('导出模块未就绪');
          return;
        }
        exApi.openExportWorkSheet(fullData, page, notify);
      };

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'fc-archive-op-btn danger';
      delBtn.dataset.archiveDelete = arch.archiveId;
      delBtn.textContent = '删除';
      delBtn.onclick = function() {
        openArchiveDeleteConfirm(page, arch, function() {
          renderArchiveView(page);
        });
      };

      ops.appendChild(readBtn);
      ops.appendChild(forwardBtn);
      ops.appendChild(exportBtn);
      ops.appendChild(delBtn);

      card.appendChild(mainBtn);
      card.appendChild(ops);
      listEl.appendChild(card);
    });

    host.appendChild(listEl);
  }

  function updateSettingsStats(page) {
    if (!page) return;
    var badge = page.querySelector('#fc-persona-count-badge');
    if (!badge) return;
    var count = 0;
    if (global.FanCommunityPersonas && typeof global.FanCommunityPersonas.listPersonas === 'function') {
      count = global.FanCommunityPersonas.listPersonas().length;
    }
    badge.textContent = count > 0 ? ('已保存 ' + count + ' 位') : '暂无角色';
  }

  function renderTopbar(page, tab) {
    var topbar = page && page.querySelector('#fc-topbar');
    if (!topbar) return;
    if (tab === 'archive') {
      topbar.innerHTML = '<h1 class="fc-topbar-plain-title" id="fc-topbar-title">存档</h1>';
      return;
    }
    if (tab === 'settings') {
      topbar.innerHTML = '<h1 class="fc-topbar-plain-title" id="fc-topbar-title">设置</h1>';
      return;
    }
    topbar.innerHTML =
      '<button type="button" class="fc-brand-home-btn" id="fc-brand-home-btn" data-fc-home-trigger="1" aria-label="同好社区，点击返回弯弯机桌面" title="点击返回弯弯机桌面">' +
        '<span class="fc-brand-home-title">同好社区</span>' +
        '<span class="fc-brand-home-mark" aria-hidden="true">✦</span>' +
      '</button>';
  }

  function switchTab(page, tab) {
    _activeTab = tab;
    renderTopbar(page, tab);
    page.querySelectorAll('[data-fc-view]').forEach(function(section) {
      section.hidden = section.dataset.fcView !== tab;
    });
    page.querySelectorAll('[data-fc-tab]').forEach(function(btn) {
      btn.classList.toggle('nav-active', btn.dataset.fcTab === tab);
    });
    if (tab === 'settings') {
      updateSettingsStats(page);
    } else if (tab === 'archive') {
      renderArchiveView(page);
    }
    var scroller = page.querySelector('#fc-main-scroll');
    if (scroller) scroller.scrollTop = 0;
  }

  function bindEvents(page) {
    var cleanupFns = [];

    function onPageClick(e) {
      var homeTrigger = e.target && e.target.closest ? e.target.closest('[data-fc-home-trigger]') : null;
      if (homeTrigger && page.contains(homeTrigger)) {
        e.preventDefault();
        e.stopPropagation();
        closeFanCommunityPage();
      }
    }
    page.addEventListener('click', onPageClick);
    cleanupFns.push(function() {
      page.removeEventListener('click', onPageClick);
    });

    page.querySelectorAll('[data-fc-tab]').forEach(function(btn) {
      var onTabClick = function() {
        if (_isClosing) return;
        switchTab(page, btn.dataset.fcTab || 'create');
      };
      btn.addEventListener('click', onTabClick);
      cleanupFns.push(function() {
        btn.removeEventListener('click', onTabClick);
      });
    });

    var homeShell = page.querySelector('#fc-home-shell');
    var subviewHost = page.querySelector('#fc-subview-host');

    function showHomeFromSubview() {
      if (_isClosing) return;
      if (subviewHost) subviewHost.hidden = true;
      if (homeShell) homeShell.hidden = false;
      updateSettingsStats(page);
      if (_activeTab === 'archive') {
        renderArchiveView(page);
      }
    }

    page._fcOpenArchiveReader = function(archiveId) {
      if (_isClosing || !archiveId) return;
      if (global.FanCommunityChat && typeof global.FanCommunityChat.openArchiveReader === 'function' && subviewHost && homeShell) {
        homeShell.hidden = true;
        subviewHost.hidden = false;
        global.FanCommunityChat.openArchiveReader(subviewHost, archiveId, { onBack: showHomeFromSubview });
        return;
      }
      notify('存档阅读模块加载中，请稍后再试');
    };

    var personaLibBtn = page.querySelector('#fc-open-persona-lib-btn');
    if (personaLibBtn) {
      var onOpenPersonaLib = function() {
        if (_isClosing) return;
        if (global.FanCommunityPersonas && typeof global.FanCommunityPersonas.openLibrary === 'function' && subviewHost && homeShell) {
          homeShell.hidden = true;
          subviewHost.hidden = false;
          global.FanCommunityPersonas.openLibrary(subviewHost, { onBack: showHomeFromSubview });
          return;
        }
        notify('公共人设库模块加载中，请稍后再试');
      };
      personaLibBtn.addEventListener('click', onOpenPersonaLib);
      cleanupFns.push(function() {
        personaLibBtn.removeEventListener('click', onOpenPersonaLib);
      });
    }

    var entryLabels = {
      chat: '捡手机文学',
      forum: '论坛体',
      game: '文游模拟器'
    };
    page.querySelectorAll('[data-fc-entry]').forEach(function(card) {
      var onEntryClick = function() {
        if (_isClosing) return;
        var key = card.dataset.fcEntry;
        if (key === 'chat' && global.FanCommunityChat && typeof global.FanCommunityChat.open === 'function' && subviewHost && homeShell) {
          homeShell.hidden = true;
          subviewHost.hidden = false;
          global.FanCommunityChat.open(subviewHost, { onBack: showHomeFromSubview });
          return;
        }
        var label = entryLabels[key] || '该模块';
        notify('「' + label + '」将在后续阶段接入');
      };
      card.addEventListener('click', onEntryClick);
      cleanupFns.push(function() {
        card.removeEventListener('click', onEntryClick);
      });
    });

    page._fcCleanup = function() {
      while (cleanupFns.length) {
        var fn = cleanupFns.pop();
        try { fn(); } catch (_) {}
      }
    };
  }

  function showFanCommunityPage() {
    clearCloseShield();
    var existing = document.getElementById(PAGE_ID);
    if (existing) {
      if (global.FanCommunityChat && typeof global.FanCommunityChat.close === 'function') {
        try { global.FanCommunityChat.close(); } catch (_) {}
      }
      if (typeof existing._fcCleanup === 'function') {
        try { existing._fcCleanup(); } catch (_) {}
      }
      existing.remove();
    }

    _isClosing = false;
    _activeTab = 'create';

    var page = document.createElement('div');
    page.id = PAGE_ID;
    page.className = 'full-page';
    page.innerHTML = buildHomeMarkup();

    bindEvents(page);
    updateSettingsStats(page);
    switchTab(page, 'create');

    if (typeof global.openPage === 'function') {
      global.openPage(page);
    } else {
      (document.getElementById('app') || document.body).appendChild(page);
    }
  }

  global.FanCommunityApp = {
    open: showFanCommunityPage,
    close: closeFanCommunityPage
  };
  global.showFanCommunityPage = showFanCommunityPage;
  global.showFanCommunityApp = showFanCommunityPage;
})(window);
