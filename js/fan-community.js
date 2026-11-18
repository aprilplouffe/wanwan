// js/fan-community.js — 同好社区正式模块（任务 02：韩系奶油极简风社区首页与基础导航）
// 使用弯弯机 window.openPage / window.closePage 原生全屏页面机制挂载与返回。

(function(global) {
  'use strict';

  var PAGE_ID = 'fan-community-page';
  var _activeTab = 'create';

  function notify(msg) {
    if (typeof global.toast === 'function') {
      global.toast(msg);
    }
  }

  function closeFanCommunityPage() {
    if (global.FanCommunityChat && typeof global.FanCommunityChat.close === 'function') {
      global.FanCommunityChat.close();
    }
    if (typeof global.closePage === 'function') {
      global.closePage(PAGE_ID);
      return;
    }
    var page = document.getElementById(PAGE_ID);
    if (page) page.remove();
  }

  function buildHomeMarkup() {
    return '' +
      '<div class="fc-frame">' +
        '<div class="fc-home-shell" id="fc-home-shell">' +
          '<div class="fc-main" id="fc-main-scroll">' +
          '<div class="fc-topbar">' +
            '<button type="button" class="fc-back-btn" id="fc-back-btn" aria-label="返回桌面">' +
              '<span class="fc-back-chevron">‹</span><span>桌面</span>' +
            '</button>' +
          '</div>' +

          '<section class="fc-view" data-fc-view="create">' +
            '<div class="fc-eyebrow">WANWAN · FAN COMMUNITY</div>' +
            '<h1 class="fc-heading">同好社区 ✦</h1>' +
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
    var backBtn = page.querySelector('#fc-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', closeFanCommunityPage);
    }

    page.querySelectorAll('[data-fc-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        switchTab(page, btn.dataset.fcTab || 'create');
      });
    });

    var homeShell = page.querySelector('#fc-home-shell');
    var subviewHost = page.querySelector('#fc-subview-host');

    function showHomeFromSubview() {
      if (subviewHost) subviewHost.hidden = true;
      if (homeShell) homeShell.hidden = false;
      updateSettingsStats(page);
    }

    var personaLibBtn = page.querySelector('#fc-open-persona-lib-btn');
    if (personaLibBtn) {
      personaLibBtn.addEventListener('click', function() {
        if (global.FanCommunityPersonas && typeof global.FanCommunityPersonas.openLibrary === 'function' && subviewHost && homeShell) {
          homeShell.hidden = true;
          subviewHost.hidden = false;
          global.FanCommunityPersonas.openLibrary(subviewHost, { onBack: showHomeFromSubview });
          return;
        }
        notify('公共人设库模块加载中，请稍后再试');
      });
    }

    var entryLabels = {
      chat: '捡手机文学',
      forum: '论坛体',
      game: '文游模拟器'
    };
    page.querySelectorAll('[data-fc-entry]').forEach(function(card) {
      card.addEventListener('click', function() {
        var key = card.dataset.fcEntry;
        if (key === 'chat' && global.FanCommunityChat && typeof global.FanCommunityChat.open === 'function' && subviewHost && homeShell) {
          homeShell.hidden = true;
          subviewHost.hidden = false;
          global.FanCommunityChat.open(subviewHost, { onBack: showHomeFromSubview });
          return;
        }
        var label = entryLabels[key] || '该模块';
        notify('「' + label + '」将在后续阶段接入');
      });
    });
  }

  function showFanCommunityPage() {
    var existing = document.getElementById(PAGE_ID);
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = PAGE_ID;
    page.className = 'full-page';
    page.innerHTML = buildHomeMarkup();

    _activeTab = 'create';
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
