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
          '<header class="fc-topbar">' +
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
              '<h2>故事存档</h2>' +
              '<p>为当前社区创作保存一个快照，随时回来继续写。</p>' +
            '</div>' +
            '<div class="fc-panel-card">' +
              '<h3>本地存档管理</h3>' +
              '<p>存档与导入导出功能将在后续任务中接入。</p>' +
            '</div>' +
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

  function switchTab(page, tab) {
    _activeTab = tab;
    page.querySelectorAll('[data-fc-view]').forEach(function(section) {
      section.hidden = section.dataset.fcView !== tab;
    });
    page.querySelectorAll('[data-fc-tab]').forEach(function(btn) {
      btn.classList.toggle('nav-active', btn.dataset.fcTab === tab);
    });
    if (tab === 'settings') {
      updateSettingsStats(page);
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
    }

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
