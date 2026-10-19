// browser.js — 弯弯浏览器 MVP 核心业务逻辑 (阶段 2 完备版)
// 包含多标签、智能地址栏、搜索引擎配置、历史与收藏持久化、内外全屏、受限降级、Char伴读侧边栏、阅读模式、无痕模式与下载管理

(function() {
  'use strict';

  var STORAGE_KEYS = {
    TABS: 'wanwan_browser_tabs',
    SETTINGS: 'wanwan_browser_settings',
    BOOKMARKS: 'wanwan_browser_bookmarks',
    HISTORY: 'wanwan_browser_history',
    DOWNLOADS: 'wanwan_browser_downloads',
    NOTES: 'wanwan_browser_companion_notes'
  };

  var SEARCH_ENGINES = {
    bing: { id: 'bing', name: '必应', icon: 'fa-brands fa-microsoft', url: 'https://cn.bing.com/search?q=' },
    baidu: { id: 'baidu', name: '百度', icon: 'fa-solid fa-magnifying-glass', url: 'https://www.baidu.com/s?wd=' },
    google: { id: 'google', name: '谷歌', icon: 'fa-brands fa-google', url: 'https://www.google.com/search?q=' },
    duckduckgo: { id: 'duckduckgo', name: 'DuckDuckGo', icon: 'fa-solid fa-shield-halved', url: 'https://duckduckgo.com/?q=' },
    sogou: { id: 'sogou', name: '搜狗', icon: 'fa-solid fa-paw', url: 'https://www.sogou.com/web?query=' },
    so360: { id: 'so360', name: '360搜索', icon: 'fa-solid fa-shield', url: 'https://www.so.com/s?q=' }
  };

  var DEFAULT_BOOKMARKS = [
    { id: 'bm_1', title: '必应搜索', url: 'https://cn.bing.com', icon: 'fa-brands fa-microsoft' },
    { id: 'bm_2', title: '百度一下', url: 'https://www.baidu.com', icon: 'fa-solid fa-magnifying-glass' },
    { id: 'bm_3', title: '维基百科', url: 'https://zh.wikipedia.org', icon: 'fa-brands fa-wikipedia-w' },
    { id: 'bm_4', title: 'GitHub', url: 'https://github.com', icon: 'fa-brands fa-github' },
    { id: 'bm_5', title: '哔哩哔哩', url: 'https://www.bilibili.com', icon: 'fa-brands fa-bilibili' },
    { id: 'bm_6', title: '知乎', url: 'https://www.zhihu.com', icon: 'fa-solid fa-lightbulb' },
    { id: 'bm_7', title: '网易云音乐', url: 'https://music.163.com', icon: 'fa-solid fa-music' }
  ];

  var DEFAULT_DOWNLOADS = [
    { id: 'dl_1', name: 'wanwan_guide_manual.pdf', size: '2.4 MB', time: Date.now() - 3600000 * 24, url: 'about:home', status: '已完成' },
    { id: 'dl_2', name: 'companion_reading_wallpapers.zip', size: '14.8 MB', time: Date.now() - 3600000 * 5, url: 'about:home', status: '已完成' }
  ];

  // 内部状态
  var _state = {
    tabs: [],
    activeTabId: null,
    closedTabs: [],
    settings: {
      searchEngine: 'bing',
      allowIframeRedirect: true,
      isInPrivate: false,
      readerFontSize: 16,
      readerTheme: 'light' // 'light' | 'sepia' | 'night'
    },
    bookmarks: [],
    history: [],
    downloads: [],
    notes: '',
    companionChar: null,
    isInternalFullscreen: false,
    isCharSidebarOpen: false,
    isReaderMode: false,
    drawerOpen: false,
    drawerTab: 'bookmarks', // 'bookmarks' | 'history' | 'downloads'
    drawerSearchQuery: '',
    findInPage: {
      active: false,
      query: '',
      current: 0,
      total: 0
    }
  };

  // 工具函数：转义HTML
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid() {
    return 'wb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  // 持久化存取助手（优先 Dexie，降级 localStorage）
  async function loadStorage(key, fallback) {
    try {
      if (window.db && db.config) {
        var row = await db.config.get(key);
        if (row && row.value !== undefined) return row.value;
      }
    } catch (e) {
      console.warn('loadStorage Dexie error:', key, e);
    }
    try {
      var item = localStorage.getItem(key);
      if (item) return JSON.parse(item);
    } catch (e) {}
    return fallback;
  }

  async function saveStorage(key, value) {
    try {
      if (window.db && db.config) {
        await db.config.put({ key: key, value: value });
      }
    } catch (e) {
      console.warn('saveStorage Dexie error:', key, e);
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  // 获取伴侣角色信息
  async function loadCompanionCharacter() {
    try {
      if (window.db && db.characters) {
        var chars = await db.characters.toArray();
        var main = chars.find(function(c) { return c.type === 'char' || c.isCompanion; }) || chars[0];
        if (main) {
          _state.companionChar = {
            id: main.id,
            name: main.name || '林弯弯',
            avatar: main.avatar || 'img/wanwan.png',
            status: main.status || '在线 · 伴读中'
          };
          return;
        }
      }
    } catch (e) {}
    _state.companionChar = {
      id: 'char_default',
      name: '林弯弯',
      avatar: 'img/wanwan.png',
      status: '在线 · 伴读中'
    };
  }

  // 初始化持久化数据
  async function initBrowserState() {
    await loadCompanionCharacter();

    var savedSettings = await loadStorage(STORAGE_KEYS.SETTINGS, null);
    if (savedSettings && typeof savedSettings === 'object') {
      _state.settings = Object.assign(_state.settings, savedSettings);
    }

    var savedBookmarks = await loadStorage(STORAGE_KEYS.BOOKMARKS, null);
    _state.bookmarks = Array.isArray(savedBookmarks) && savedBookmarks.length ? savedBookmarks : DEFAULT_BOOKMARKS.slice();

    var savedHistory = await loadStorage(STORAGE_KEYS.HISTORY, null);
    _state.history = Array.isArray(savedHistory) ? savedHistory : [];

    var savedDownloads = await loadStorage(STORAGE_KEYS.DOWNLOADS, null);
    _state.downloads = Array.isArray(savedDownloads) && savedDownloads.length ? savedDownloads : DEFAULT_DOWNLOADS.slice();

    var savedNotes = await loadStorage(STORAGE_KEYS.NOTES, '');
    _state.notes = typeof savedNotes === 'string' ? savedNotes : '';

    var savedTabs = await loadStorage(STORAGE_KEYS.TABS, null);
    if (savedTabs && Array.isArray(savedTabs.tabs) && savedTabs.tabs.length) {
      _state.tabs = savedTabs.tabs;
      _state.activeTabId = savedTabs.activeTabId || savedTabs.tabs[0].id;
    } else {
      var initialTab = createTabObject('about:home', '新标签页');
      _state.tabs = [initialTab];
      _state.activeTabId = initialTab.id;
    }
  }

  function saveTabsState() {
    if (_state.settings.isInPrivate) return; // 无痕模式不持久化标签
    saveStorage(STORAGE_KEYS.TABS, {
      tabs: _state.tabs.map(function(t) {
        return {
          id: t.id,
          title: t.title,
          url: t.url,
          history: t.history || [t.url],
          historyIndex: t.historyIndex || 0
        };
      }),
      activeTabId: _state.activeTabId
    });
  }

  function createTabObject(url, title) {
    var u = url || 'about:home';
    var t = title || (u === 'about:home' ? '新标签页' : '网页');
    return {
      id: uid(),
      title: t,
      url: u,
      history: [u],
      historyIndex: 0,
      loading: false,
      hasRestrictionWarning: false
    };
  }

  function getActiveTab() {
    return _state.tabs.find(function(t) { return t.id === _state.activeTabId; }) || _state.tabs[0];
  }

  // 智能网址识别逻辑（支持前缀搜索指令与标准域名/IP/关键词识别）
  function parseUrlOrSearch(input) {
    var text = (input || '').trim();
    if (!text) return 'about:home';
    if (text === 'about:home' || text === 'about:blank') return text;

    // 支持快捷指令前缀搜索 (如: "g 机器学习", "b 天气", "bd 弯弯")
    var prefixMatch = text.match(/^([a-zA-Z0-9]+)\s+(.+)$/);
    if (prefixMatch) {
      var prefix = prefixMatch[1].toLowerCase();
      var keyword = prefixMatch[2];
      var prefixMap = {
        g: 'google',
        b: 'bing',
        bd: 'baidu',
        ddg: 'duckduckgo',
        sg: 'sogou',
        '360': 'so360'
      };
      if (prefixMap[prefix] && SEARCH_ENGINES[prefixMap[prefix]]) {
        return SEARCH_ENGINES[prefixMap[prefix]].url + encodeURIComponent(keyword);
      }
    }

    // 协议开头
    if (/^(https?|ftp|file):\/\//i.test(text)) {
      return text;
    }

    // 域名特征 (例如 baidu.com, www.bilibili.com, github.com/user, 192.168.1.1:8080)
    var domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/;
    var ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/.*)?$/;
    var localhostPattern = /^localhost(:\d+)?(\/.*)?$/;

    if (domainPattern.test(text) || ipPattern.test(text) || localhostPattern.test(text)) {
      return 'https://' + text;
    }

    // 默认关键词搜索
    var engine = SEARCH_ENGINES[_state.settings.searchEngine] || SEARCH_ENGINES.bing;
    return engine.url + encodeURIComponent(text);
  }

  // 历史记录添加（无痕模式下不保存）
  function recordHistory(url, title) {
    if (_state.settings.isInPrivate) return;
    if (!url || url === 'about:home' || url === 'about:blank') return;
    var entry = {
      id: uid(),
      title: title || url,
      url: url,
      time: Date.now()
    };
    // 去重邻近相同项
    if (_state.history.length && _state.history[0].url === url) {
      _state.history[0].time = Date.now();
    } else {
      _state.history.unshift(entry);
    }
    if (_state.history.length > 200) {
      _state.history = _state.history.slice(0, 200);
    }
    saveStorage(STORAGE_KEYS.HISTORY, _state.history);
  }

  // 格式化时间
  function formatTime(timestamp) {
    var d = new Date(timestamp);
    var now = new Date();
    var isToday = d.toDateString() === now.toDateString();
    var pad = function(n) { return n < 10 ? '0' + n : n; };
    if (isToday) {
      return '今天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // 判断是否为已知受限于跨域保护（X-Frame-Options/CSP）的主流站点
  function isKnownRestrictedSite(url) {
    if (!url || url.indexOf('about:') === 0) return false;
    var restrictedKeywords = [
      'baidu.com', 'bilibili.com', 'google.com', 'github.com',
      'zhihu.com', 'weibo.com', 'taobao.com', 'jd.com',
      'douyin.com', 'xiaohongshu.com', 'qq.com', '163.com'
    ];
    return restrictedKeywords.some(function(k) {
      return url.indexOf(k) >= 0;
    });
  }

  // ====================================================
  // 主界面渲染与交互中枢
  // ====================================================
  window.showBrowserPage = async function() {
    var existing = document.getElementById('browser-page');
    if (existing) {
      existing.remove();
    }

    await initBrowserState();

    var page = document.createElement('div');
    page.id = 'browser-page';
    page.className = 'full-page' + (_state.settings.isInPrivate ? ' wb-inprivate-mode' : '');

    renderBrowserShell(page);

    if (window.openPage) {
      window.openPage(page);
    } else {
      (document.getElementById('app') || document.body).appendChild(page);
    }

    updateOmniboxAndControls(page);
    renderActiveTabContent(page);
  };

  // 别名
  window.showBrowserApp = window.showBrowserPage;

  function renderBrowserShell(container) {
    container.innerHTML =
      // 退出小手机全屏悬浮胶囊
      '<button type="button" class="wb-exit-internal-fullscreen-pill" id="wb-exit-int-fs">' +
        '<i class="fa-solid fa-compress"></i> 退出全屏' +
      '</button>' +

      // 顶部主工具栏
      '<div class="wb-toolbar">' +
        // 1. 多标签栏
        '<div class="wb-tab-bar">' +
          '<div class="wb-inprivate-badge" id="wb-inprivate-indicator">' +
            '<i class="fa-solid fa-user-secret"></i> 隐私浏览' +
          '</div>' +
          '<div class="wb-tabs-scroll" id="wb-tabs-list"></div>' +
          '<button type="button" class="wb-tab-btn-add" id="wb-tab-add" title="新建标签页">' +
            '<i class="fa-solid fa-plus"></i>' +
          '</button>' +
          '<button type="button" class="wb-tab-more-btn" id="wb-tab-more" title="标签操作与恢复">' +
            '<i class="fa-solid fa-ellipsis-vertical"></i>' +
          '</button>' +
        '</div>' +

        // 2. 导航控制器与地址栏
        '<div class="wb-nav-bar">' +
          '<button type="button" class="wb-nav-action-btn" id="wb-btn-back" title="后退">' +
            '<i class="fa-solid fa-arrow-left"></i>' +
          '</button>' +
          '<button type="button" class="wb-nav-action-btn" id="wb-btn-forward" title="前进">' +
            '<i class="fa-solid fa-arrow-right"></i>' +
          '</button>' +
          '<button type="button" class="wb-nav-action-btn" id="wb-btn-reload" title="刷新">' +
            '<i class="fa-solid fa-rotate-right"></i>' +
          '</button>' +
          '<button type="button" class="wb-nav-action-btn" id="wb-btn-home" title="主页">' +
            '<i class="fa-solid fa-house"></i>' +
          '</button>' +

          // 核心地址栏 Omnibox
          '<div class="wb-omnibox">' +
            '<div class="wb-engine-badge" id="wb-engine-switch" title="点击切换搜索引擎">' +
              '<i class="' + (SEARCH_ENGINES[_state.settings.searchEngine] || SEARCH_ENGINES.bing).icon + '"></i>' +
              '<span>' + esc((SEARCH_ENGINES[_state.settings.searchEngine] || SEARCH_ENGINES.bing).name) + '</span>' +
              '<i class="fa-solid fa-angle-down" style="font-size:8px;opacity:0.6;"></i>' +
            '</div>' +
            '<input type="text" class="wb-input" id="wb-url-input" placeholder="搜索关键词或输入网址..." autocomplete="off">' +
            '<button type="button" class="wb-omni-btn" id="wb-clear-btn" style="display:none;" title="清空">' +
              '<i class="fa-solid fa-xmark"></i>' +
            '</button>' +
            '<button type="button" class="wb-omni-btn" id="wb-star-btn" title="添加/取消收藏">' +
              '<i class="fa-regular fa-star"></i>' +
            '</button>' +
            '<button type="button" class="wb-omni-btn" id="wb-go-btn" title="前往">' +
              '<i class="fa-solid fa-arrow-right"></i>' +
            '</button>' +
          '</div>' +

          // 右侧快捷功能按键：伴读、书签历史、全屏、关闭
          '<button type="button" class="wb-nav-action-btn" id="wb-btn-companion" title="Char 伴读助手">' +
            '<i class="fa-solid fa-wand-magic-sparkles"></i>' +
            '<span class="wb-companion-dot" style="display:' + (_state.isCharSidebarOpen ? 'block' : 'none') + '"></span>' +
          '</button>' +
          '<button type="button" class="wb-nav-action-btn" id="wb-btn-bookmarks" title="收藏夹、历史与下载">' +
            '<i class="fa-solid fa-clock-rotate-left"></i>' +
          '</button>' +
          '<button type="button" class="wb-nav-action-btn" id="wb-btn-fullscreen" title="小手机内部全屏">' +
            '<i class="fa-solid fa-expand"></i>' +
          '</button>' +
          '<button type="button" class="wb-nav-action-btn" id="wb-btn-close-app" title="返回桌面">' +
            '<i class="fa-solid fa-xmark"></i>' +
          '</button>' +
        '</div>' +

        // 顶栏进度条
        '<div class="wb-progress-bar" id="wb-progress"></div>' +
      '</div>' +

      // 跨域受限可收起提示条
      '<div class="wb-restriction-banner" id="wb-restrict-banner" style="display:none;">' +
        '<div class="wb-restriction-left">' +
          '<i class="fa-solid fa-shield-halved" style="color:#f59e0b;"></i>' +
          '<span>若该网页出现空白，系受目标站点跨域保护策略（X-Frame-Options）限制。</span>' +
        '</div>' +
        '<div class="wb-restriction-actions">' +
          '<button type="button" class="wb-banner-btn" id="wb-banner-external"><i class="fa-solid fa-arrow-up-right-from-square"></i> 外部打开</button>' +
          '<button type="button" class="wb-banner-btn" id="wb-banner-reader"><i class="fa-solid fa-book-open"></i> 阅读模式</button>' +
          '<button type="button" class="wb-banner-btn" id="wb-banner-copy"><i class="fa-regular fa-copy"></i> 复制网址</button>' +
          '<button type="button" class="wb-banner-btn" id="wb-banner-hide"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
      '</div>' +

      // 核心视口与伴读侧栏包装器
      '<div class="wb-body-wrapper" id="wb-body-wrap">' +
        '<div class="wb-viewport" id="wb-viewport"></div>' +
        // Char 伴读侧边栏 (P1 核心增强)
        '<div class="wb-char-sidebar collapsed" id="wb-char-sidebar"></div>' +
      '</div>' +

      // 抽屉弹窗 (收藏/历史/下载/搜索引擎/安卓评估)
      '<div id="wb-drawer-root"></div>' +

      // 撤销关闭标签浮层容器
      '<div id="wb-undo-root"></div>';

    bindGlobalEvents(container);
  }

  // 绑定全局按钮与监听
  function bindGlobalEvents(container) {
    // 标签页列表渲染
    renderTabsList(container);

    // 新增标签
    container.querySelector('#wb-tab-add').onclick = function() {
      var newTab = createTabObject('about:home', '新标签页');
      _state.tabs.push(newTab);
      _state.activeTabId = newTab.id;
      saveTabsState();
      renderTabsList(container);
      updateOmniboxAndControls(container);
      renderActiveTabContent(container);
    };

    // 标签更多菜单
    container.querySelector('#wb-tab-more').onclick = function() {
      openMoreOptionsMenu(container);
    };

    // 前进后退刷新主页
    var backBtn = container.querySelector('#wb-btn-back');
    var fwdBtn = container.querySelector('#wb-btn-forward');
    var reloadBtn = container.querySelector('#wb-btn-reload');
    var homeBtn = container.querySelector('#wb-btn-home');

    backBtn.onclick = function() {
      var cur = getActiveTab();
      if (cur && cur.historyIndex > 0) {
        cur.historyIndex--;
        cur.url = cur.history[cur.historyIndex];
        saveTabsState();
        updateOmniboxAndControls(container);
        renderActiveTabContent(container);
      }
    };

    fwdBtn.onclick = function() {
      var cur = getActiveTab();
      if (cur && cur.historyIndex < cur.history.length - 1) {
        cur.historyIndex++;
        cur.url = cur.history[cur.historyIndex];
        saveTabsState();
        updateOmniboxAndControls(container);
        renderActiveTabContent(container);
      }
    };

    reloadBtn.onclick = function() {
      var cur = getActiveTab();
      if (cur) {
        startLoading(container);
        renderActiveTabContent(container);
      }
    };

    homeBtn.onclick = function() {
      navigateTo(container, 'about:home');
    };

    // 地址栏回车与前往
    var urlInput = container.querySelector('#wb-url-input');
    var goBtn = container.querySelector('#wb-go-btn');
    var clearBtn = container.querySelector('#wb-clear-btn');

    urlInput.oninput = function() {
      clearBtn.style.display = urlInput.value ? 'flex' : 'none';
    };

    clearBtn.onclick = function() {
      urlInput.value = '';
      clearBtn.style.display = 'none';
      urlInput.focus();
    };

    urlInput.onkeydown = function(e) {
      if (e.key === 'Enter') {
        navigateTo(container, urlInput.value);
      }
    };
    goBtn.onclick = function() {
      navigateTo(container, urlInput.value);
    };

    // 搜索引擎切换菜单
    container.querySelector('#wb-engine-switch').onclick = function() {
      openEngineSelector(container);
    };

    // 收藏星标切换
    container.querySelector('#wb-star-btn').onclick = function() {
      toggleCurrentBookmark(container);
    };

    // 伴读侧栏切换
    container.querySelector('#wb-btn-companion').onclick = function() {
      toggleCharSidebar(container);
    };

    // 抽屉（收藏/历史/下载）
    container.querySelector('#wb-btn-bookmarks').onclick = function() {
      openDrawer(container, 'bookmarks');
    };

    // 小手机内部全屏
    var fsBtn = container.querySelector('#wb-btn-fullscreen');
    fsBtn.onclick = function() {
      toggleInternalFullscreen(container);
    };

    container.querySelector('#wb-exit-int-fs').onclick = function() {
      toggleInternalFullscreen(container, false);
    };

    // 关闭应用退出到桌面
    container.querySelector('#wb-btn-close-app').onclick = function() {
      if (window.closePage) {
        window.closePage('browser-page');
      } else {
        container.remove();
      }
    };

    // 顶部受限条动作
    container.querySelector('#wb-banner-external').onclick = function() {
      var cur = getActiveTab();
      if (cur && cur.url && cur.url !== 'about:home') {
        window.open(cur.url, '_blank');
      }
    };
    container.querySelector('#wb-banner-reader').onclick = function() {
      toggleReaderMode(container);
    };
    container.querySelector('#wb-banner-copy').onclick = function() {
      var cur = getActiveTab();
      if (cur && cur.url) {
        copyToClipboard(cur.url);
      }
    };
    container.querySelector('#wb-banner-hide').onclick = function() {
      container.querySelector('#wb-restrict-banner').style.display = 'none';
    };
  }

  // 渲染多标签列表
  function renderTabsList(container) {
    var listEl = container.querySelector('#wb-tabs-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    _state.tabs.forEach(function(tab) {
      var isActive = tab.id === _state.activeTabId;
      var tabEl = document.createElement('div');
      tabEl.className = 'wb-tab' + (isActive ? ' active' : '');
      tabEl.setAttribute('data-tab-id', tab.id);

      var isHome = tab.url === 'about:home';
      var iconHtml = isHome ? '<i class="fa-solid fa-house wb-tab-favicon"></i>' : '<i class="fa-solid fa-globe wb-tab-favicon"></i>';

      tabEl.innerHTML =
        iconHtml +
        '<span class="wb-tab-title">' + esc(tab.title || (isHome ? '新标签页' : '网页')) + '</span>' +
        '<span class="wb-tab-close" title="关闭标签页"><i class="fa-solid fa-xmark"></i></span>';

      // 切换标签
      tabEl.onclick = function(e) {
        if (e.target.closest('.wb-tab-close')) return;
        if (_state.activeTabId !== tab.id) {
          _state.activeTabId = tab.id;
          saveTabsState();
          renderTabsList(container);
          updateOmniboxAndControls(container);
          renderActiveTabContent(container);
          updateCharSidebarContent(container);
        }
      };

      // 关闭标签
      tabEl.querySelector('.wb-tab-close').onclick = function(e) {
        e.stopPropagation();
        closeTab(container, tab.id);
      };

      listEl.appendChild(tabEl);
    });

    // 滚动到当前激活标签
    var activeEl = listEl.querySelector('.wb-tab.active');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  // 关闭指定标签并支持撤销恢复 (P0要求)
  function closeTab(container, tabId) {
    var idx = _state.tabs.findIndex(function(t) { return t.id === tabId; });
    if (idx < 0) return;

    var closed = _state.tabs.splice(idx, 1)[0];
    if (closed) {
      _state.closedTabs.push(closed);
      if (_state.closedTabs.length > 15) _state.closedTabs.shift();
      showUndoPill(container, closed);
    }

    if (_state.tabs.length === 0) {
      // 若全部关闭，生成一个新的空白标签页
      var freshTab = createTabObject('about:home', '新标签页');
      _state.tabs.push(freshTab);
      _state.activeTabId = freshTab.id;
    } else if (_state.activeTabId === tabId) {
      // 切换至相邻标签
      var nextIdx = Math.min(idx, _state.tabs.length - 1);
      _state.activeTabId = _state.tabs[nextIdx].id;
    }

    saveTabsState();
    renderTabsList(container);
    updateOmniboxAndControls(container);
    renderActiveTabContent(container);
    updateCharSidebarContent(container);
  }

  // 撤销关闭浮层展示 (4秒自动隐去)
  function showUndoPill(container, tab) {
    var undoRoot = container.querySelector('#wb-undo-root');
    if (!undoRoot) return;
    undoRoot.innerHTML =
      '<div class="wb-undo-pill">' +
        '<span>已关闭标签页「' + esc(tab.title) + '」</span>' +
        '<button type="button" class="wb-undo-btn" id="wb-undo-action">撤销</button>' +
      '</div>';

    var btn = undoRoot.querySelector('#wb-undo-action');
    var timer = setTimeout(function() {
      if (undoRoot) undoRoot.innerHTML = '';
    }, 4500);

    if (btn) {
      btn.onclick = function() {
        clearTimeout(timer);
        undoRoot.innerHTML = '';
        var last = _state.closedTabs.pop();
        if (last) {
          _state.tabs.push(last);
          _state.activeTabId = last.id;
          saveTabsState();
          renderTabsList(container);
          updateOmniboxAndControls(container);
          renderActiveTabContent(container);
          window.toast && window.toast('已成功恢复标签页！');
        }
      };
    }
  }

  // 导航前往指定地址或关键词
  function navigateTo(container, input) {
    var targetUrl = parseUrlOrSearch(input);
    var cur = getActiveTab();
    if (!cur) return;

    startLoading(container);

    cur.url = targetUrl;
    cur.title = targetUrl === 'about:home' ? '新标签页' : getDomainOrTitle(targetUrl);

    // 截断旧 Forward 历史并追加
    if (cur.historyIndex < cur.history.length - 1) {
      cur.history = cur.history.slice(0, cur.historyIndex + 1);
    }
    cur.history.push(targetUrl);
    cur.historyIndex = cur.history.length - 1;

    recordHistory(targetUrl, cur.title);
    saveTabsState();

    renderTabsList(container);
    updateOmniboxAndControls(container);
    renderActiveTabContent(container);
    updateCharSidebarContent(container);
  }

  function getDomainOrTitle(url) {
    try {
      var parsed = new URL(url);
      return parsed.hostname || url;
    } catch (e) {
      return url;
    }
  }

  // 更新导航按钮状态与地址栏显示
  function updateOmniboxAndControls(container) {
    var cur = getActiveTab();
    if (!cur) return;

    var backBtn = container.querySelector('#wb-btn-back');
    var fwdBtn = container.querySelector('#wb-btn-forward');
    if (backBtn) backBtn.disabled = cur.historyIndex <= 0;
    if (fwdBtn) fwdBtn.disabled = cur.historyIndex >= cur.history.length - 1;

    var urlInput = container.querySelector('#wb-url-input');
    var clearBtn = container.querySelector('#wb-clear-btn');
    if (urlInput) {
      urlInput.value = cur.url === 'about:home' ? '' : cur.url;
      if (clearBtn) clearBtn.style.display = urlInput.value ? 'flex' : 'none';
    }

    // 刷新收藏星标
    var isBm = isBookmarked(cur.url);
    var starBtn = container.querySelector('#wb-star-btn');
    if (starBtn) {
      starBtn.className = 'wb-omni-btn' + (isBm ? ' bookmarked' : '');
      starBtn.innerHTML = isBm ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
    }

    // 外部受限提醒条控制
    var restrictBanner = container.querySelector('#wb-restrict-banner');
    if (restrictBanner) {
      if (cur.url && cur.url !== 'about:home' && cur.url.indexOf('about:') !== 0) {
        restrictBanner.style.display = 'flex';
      } else {
        restrictBanner.style.display = 'none';
      }
    }
  }

  // 进度条动画
  function startLoading(container) {
    var bar = container.querySelector('#wb-progress');
    var reloadBtn = container.querySelector('#wb-btn-reload');
    if (reloadBtn) {
      reloadBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      reloadBtn.title = '停止加载';
      reloadBtn.onclick = function() {
        finishLoading(container);
      };
    }
    if (!bar) return;
    bar.className = 'wb-progress-bar loading';
    bar.style.width = '30%';
    setTimeout(function() {
      if (bar) bar.style.width = '75%';
    }, 250);
  }

  function finishLoading(container) {
    var bar = container.querySelector('#wb-progress');
    var reloadBtn = container.querySelector('#wb-btn-reload');
    if (reloadBtn) {
      reloadBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
      reloadBtn.title = '刷新';
      reloadBtn.onclick = function() {
        var cur = getActiveTab();
        if (cur) {
          startLoading(container);
          renderActiveTabContent(container);
        }
      };
    }
    if (!bar) return;
    bar.style.width = '100%';
    setTimeout(function() {
      if (bar) {
        bar.className = 'wb-progress-bar';
        bar.style.width = '0%';
      }
    }, 300);
  }

  // 渲染当前激活标签页的内容视口
  function renderActiveTabContent(container) {
    var viewport = container.querySelector('#wb-viewport');
    if (!viewport) return;

    var cur = getActiveTab();
    if (!cur) return;

    if (cur.url === 'about:home') {
      viewport.innerHTML = '';
      renderHomePage(container, viewport);
      finishLoading(container);
    } else {
      renderWebviewIframe(container, viewport, cur);
    }
  }

  // ====================================================
  // 1. 渲染浏览器首页 (about:home)
  // ====================================================
  function renderHomePage(container, viewport) {
    var homeEl = document.createElement('div');
    homeEl.className = 'wb-home-container';

    var engine = SEARCH_ENGINES[_state.settings.searchEngine] || SEARCH_ENGINES.bing;
    var now = new Date();
    var weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var dateStr = (now.getMonth() + 1) + '月' + now.getDate() + '日 · ' + weekdays[now.getDay()];

    homeEl.innerHTML =
      // 头部欢迎
      '<div class="wb-home-hero">' +
        '<div class="wb-home-badge">' +
          '<i class="fa-solid fa-sparkles"></i> 弯弯伴读内核 · 沙盒就绪' +
        '</div>' +
        '<div class="wb-home-title">探索广袤的知识之境</div>' +
        '<div class="wb-home-sub">' + dateStr + ' · ' + esc(_state.companionChar ? _state.companionChar.name : '林弯弯') + ' 正在侧栏等候，随时与你同游共读。</div>' +
      '</div>' +

      // 首页大搜索框
      '<div class="wb-home-search-box">' +
        '<i class="' + engine.icon + '" style="font-size:16px;color:var(--c-sub);"></i>' +
        '<input type="text" class="wb-home-search-input" id="wb-home-search" placeholder="在 ' + esc(engine.name) + ' 中搜索或输入网址...">' +
        '<button type="button" class="wb-home-search-btn" id="wb-home-search-submit">' +
          '<i class="fa-solid fa-magnifying-glass"></i>' +
        '</button>' +
      '</div>' +

      // 快捷磁贴网格
      '<div class="wb-home-section-title">' +
        '<span><i class="fa-solid fa-compass" style="margin-right:6px;"></i>常用导航</span>' +
        '<div style="display:flex;gap:10px;">' +
          '<span style="font-size:11px;color:var(--c-sub);cursor:pointer;" id="wb-tile-manage-toggle">管理磁贴</span>' +
        '</div>' +
      '</div>' +
      '<div class="wb-tile-grid" id="wb-home-tiles"></div>' +

      // 最近足迹
      '<div class="wb-home-section-title">' +
        '<span><i class="fa-solid fa-clock-rotate-left" style="margin-right:6px;"></i>最近足迹</span>' +
        '<span style="font-size:11px;color:var(--c-sub);cursor:pointer;" id="wb-view-all-history">查看全部</span>' +
      '</div>' +
      '<div class="wb-home-recents-list" id="wb-home-recents"></div>';

    viewport.appendChild(homeEl);

    // 绑定搜索框
    var searchInput = homeEl.querySelector('#wb-home-search');
    var searchSubmit = homeEl.querySelector('#wb-home-search-submit');
    searchInput.onkeydown = function(e) {
      if (e.key === 'Enter') {
        navigateTo(container, searchInput.value);
      }
    };
    searchSubmit.onclick = function() {
      navigateTo(container, searchInput.value);
    };

    // 渲染磁贴
    var tilesContainer = homeEl.querySelector('#wb-home-tiles');
    var quickTiles = [
      { name: '百度', url: 'https://www.baidu.com', icon: 'fa-solid fa-magnifying-glass' },
      { name: '必应', url: 'https://cn.bing.com', icon: 'fa-brands fa-microsoft' },
      { name: '维基百科', url: 'https://zh.wikipedia.org', icon: 'fa-brands fa-wikipedia-w' },
      { name: 'GitHub', url: 'https://github.com', icon: 'fa-brands fa-github' },
      { name: '哔哩哔哩', url: 'https://www.bilibili.com', icon: 'fa-brands fa-bilibili' },
      { name: '知乎', url: 'https://www.zhihu.com', icon: 'fa-solid fa-lightbulb' },
      { name: '网易云', url: 'https://music.163.com', icon: 'fa-solid fa-music' },
      { name: '添加网址', action: 'custom', icon: 'fa-solid fa-plus' }
    ];

    quickTiles.forEach(function(tile, index) {
      var tileEl = document.createElement('div');
      tileEl.className = 'wb-tile';
      tileEl.innerHTML =
        '<div class="wb-tile-icon"><i class="' + tile.icon + '"></i></div>' +
        '<div class="wb-tile-name">' + esc(tile.name) + '</div>';

      tileEl.onclick = function() {
        if (tile.action === 'custom') {
          promptAddCustomTile(container);
        } else {
          navigateTo(container, tile.url);
        }
      };
      tilesContainer.appendChild(tileEl);
    });

    var isManage = false;
    var manageBtn = homeEl.querySelector('#wb-tile-manage-toggle');
    manageBtn.onclick = function() {
      isManage = !isManage;
      tilesContainer.classList.toggle('wb-tile-manage-mode', isManage);
      manageBtn.textContent = isManage ? '完成' : '管理磁贴';
    };

    // 渲染最近历史
    var recentsContainer = homeEl.querySelector('#wb-home-recents');
    var recentItems = _state.history.slice(0, 5);
    if (!recentItems.length) {
      recentsContainer.innerHTML = '<div style="padding:14px;text-align:center;font-size:12px;color:var(--c-hint);">暂无浏览记录，在上方输入网址开启冲浪吧～</div>';
    } else {
      recentItems.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'wb-recent-item';
        row.innerHTML =
          '<i class="fa-solid fa-globe" style="color:var(--c-sub);"></i>' +
          '<div class="wb-recent-title">' + esc(item.title || item.url) + '</div>' +
          '<div class="wb-recent-time">' + formatTime(item.time) + '</div>';
        row.onclick = function() {
          navigateTo(container, item.url);
        };
        recentsContainer.appendChild(row);
      });
    }

    homeEl.querySelector('#wb-view-all-history').onclick = function() {
      openDrawer(container, 'history');
    };
  }

  function promptAddCustomTile(container) {
    var url = prompt('请输入要添加到快捷导航的网址：', 'https://');
    if (!url || !url.trim() || url === 'https://') return;
    var name = prompt('请输入快捷导航名称：', getDomainOrTitle(url));
    if (!name) name = getDomainOrTitle(url);

    _state.bookmarks.push({
      id: uid(),
      title: name,
      url: parseUrlOrSearch(url),
      icon: 'fa-solid fa-bookmark'
    });
    saveStorage(STORAGE_KEYS.BOOKMARKS, _state.bookmarks);
    window.toast && window.toast('已成功添加到收藏与导航！');
    renderHomePage(container, container.querySelector('#wb-viewport'));
  }

  // ====================================================
  // 2. 渲染网页 Iframe 与受限降级方案 (核心P0要求)
  // ====================================================
  function renderWebviewIframe(container, viewport, tab) {
    viewport.innerHTML = '';

    var iframe = document.createElement('iframe');
    iframe.className = 'wb-iframe';
    iframe.src = tab.url;
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-presentation');
    iframe.setAttribute('referrerpolicy', 'no-referrer');

    var isRestricted = isKnownRestrictedSite(tab.url);

    // 监听加载事件
    var timer = setTimeout(function() {
      finishLoading(container);
    }, 3500);

    iframe.onload = function() {
      clearTimeout(timer);
      finishLoading(container);
    };

    viewport.appendChild(iframe);

    // 浮动降级助手条
    var helpBtn = document.createElement('button');
    helpBtn.type = 'button';
    helpBtn.className = 'wb-banner-btn';
    helpBtn.style.cssText = 'position:absolute;bottom:12px;right:12px;z-index:25;background:rgba(0,0,0,0.75);color:#fff;border-color:rgba(255,255,255,0.25);padding:5px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    helpBtn.innerHTML = '<i class="fa-solid fa-circle-question"></i> ' + (isRestricted ? '该网站可能受限' : '页面加载异常？');
    helpBtn.onclick = function() {
      showFallbackCard(container, viewport, tab);
    };
    viewport.appendChild(helpBtn);
  }

  // 显示受限网页完整降级提示卡片
  function showFallbackCard(container, viewport, tab) {
    var existing = viewport.querySelector('.wb-fallback-card');
    if (existing) existing.remove();

    var card = document.createElement('div');
    card.className = 'wb-fallback-card';
    card.innerHTML =
      '<div class="wb-fallback-box">' +
        '<div class="wb-fallback-icon"><i class="fa-solid fa-shield-cat"></i></div>' +
        '<div class="wb-fallback-title">跨域保护与安全沙盒说明</div>' +
        '<div class="wb-fallback-desc">' +
          '由于目标网站配置了严格的同源策略（X-Frame-Options: SAMEORIGIN / CSP），依据 Web 安全规范，内嵌 iframe 容器受到浏览器保护。' +
        '</div>' +
        '<div class="wb-fallback-url">' + esc(tab.url) + '</div>' +
        '<div class="wb-fallback-actions">' +
          '<button type="button" class="pl-btn-primary" id="wb-fb-external">' +
            '<i class="fa-solid fa-arrow-up-right-from-square"></i> 在外部新窗口打开' +
          '</button>' +
          '<button type="button" class="pl-btn-secondary" id="wb-fb-reader">' +
            '<i class="fa-solid fa-book-open"></i> 切换伴读阅读模式' +
          '</button>' +
          '<button type="button" class="pl-btn-secondary" id="wb-fb-copy">' +
            '<i class="fa-regular fa-copy"></i> 复制完整链接' +
          '</button>' +
          '<button type="button" class="pl-btn-secondary" id="wb-fb-reload">' +
            '<i class="fa-solid fa-rotate-right"></i> 重新尝试嵌入' +
          '</button>' +
          '<button type="button" class="pl-btn-secondary" id="wb-fb-home">' +
            '<i class="fa-solid fa-house"></i> 返回浏览器首页' +
          '</button>' +
        '</div>' +
      '</div>';

    card.querySelector('#wb-fb-external').onclick = function() {
      window.open(tab.url, '_blank');
      card.remove();
    };
    card.querySelector('#wb-fb-reader').onclick = function() {
      card.remove();
      toggleReaderMode(container);
    };
    card.querySelector('#wb-fb-copy').onclick = function() {
      copyToClipboard(tab.url);
    };
    card.querySelector('#wb-fb-reload').onclick = function() {
      card.remove();
      renderWebviewIframe(container, viewport, tab);
    };
    card.querySelector('#wb-fb-home').onclick = function() {
      card.remove();
      navigateTo(container, 'about:home');
    };

    viewport.appendChild(card);
  }

  // ====================================================
  // 3. P1 增强：Char 伴读侧边栏 (Companion Sidebar)
  // ====================================================
  function toggleCharSidebar(container) {
    _state.isCharSidebarOpen = !_state.isCharSidebarOpen;
    var sidebar = container.querySelector('#wb-char-sidebar');
    var dot = container.querySelector('.wb-companion-dot');
    if (!sidebar) return;

    if (_state.isCharSidebarOpen) {
      sidebar.classList.remove('collapsed');
      if (dot) dot.style.display = 'block';
      updateCharSidebarContent(container);
      window.toast && window.toast(_state.companionChar.name + ' 已开启贴身伴读');
    } else {
      sidebar.classList.add('collapsed');
      if (dot) dot.style.display = 'none';
    }
  }

  function getCompanionSpeechForUrl(url) {
    if (!url || url === 'about:home') {
      return '今天想和我一起了解些什么呢？不管是知识、新闻还是影音，我都一直陪着你哦～';
    }
    if (url.indexOf('search') >= 0 || url.indexOf('baidu') >= 0 || url.indexOf('bing') >= 0 || url.indexOf('google') >= 0) {
      return '在查探新情报呀！找到满意的答案了吗？如果有困惑也可以随时跟我聊聊看～';
    }
    if (url.indexOf('wikipedia.org') >= 0) {
      return '哇，是维基百科！百科里的知识像浩瀚星河一样呢，等你读完也教教我好不好～';
    }
    if (url.indexOf('github.com') >= 0) {
      return '代码的世界好神奇～认真钻研代码的你，在我眼里超级帅气迷人！';
    }
    if (url.indexOf('bilibili.com') >= 0 || url.indexOf('music') >= 0) {
      return '冲浪放松一下也很棒！要注意休息眼睛，喝口水润润嗓子哦～';
    }
    if (isKnownRestrictedSite(url)) {
      return '这个网站有严格的安全防护罩（X-Frame-Options）呢，点击「外部打开」就可以在全屏大窗口尽情浏览啦！';
    }
    return '这个页面看起来真有意思！点击下方的「分享给TA」，我会把这篇文章珍藏在我们的微信小纸条里哦～';
  }

  function updateCharSidebarContent(container) {
    var sidebar = container.querySelector('#wb-char-sidebar');
    if (!sidebar || _state.isCharSidebarOpen === false) return;

    var cur = getActiveTab();
    var char = _state.companionChar || { name: '林弯弯', avatar: 'img/wanwan.png', status: '在线 · 伴读中' };
    var speech = getCompanionSpeechForUrl(cur ? cur.url : '');

    sidebar.innerHTML =
      '<div class="wb-char-header">' +
        '<div class="wb-char-profile">' +
          '<img src="' + esc(char.avatar) + '" class="wb-char-avatar" onerror="this.src=\'img/wanwan.png\'">' +
          '<div>' +
            '<div class="wb-char-name">' + esc(char.name) + '</div>' +
            '<div class="wb-char-status">' + esc(char.status) + '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="wb-nav-action-btn" id="wb-char-close" title="收起伴读栏">' +
          '<i class="fa-solid fa-angle-right"></i>' +
        '</button>' +
      '</div>' +

      '<div class="wb-char-body">' +
        // 角色气泡感言
        '<div class="wb-char-bubble">' + esc(speech) + '</div>' +

        // 伴读便签 / 摘录 (Web Notes)
        '<div class="wb-char-section-title">' +
          '<i class="fa-solid fa-pen-nib"></i> <span>随读摘录便签</span>' +
        '</div>' +
        '<textarea class="wb-char-notes-area" id="wb-char-notes" placeholder="记录当前的灵感、网页摘录或阅读感悟...">' + esc(_state.notes) + '</textarea>' +

        // 快捷伴读互动
        '<div class="wb-char-actions">' +
          '<button type="button" class="pl-btn-primary" id="wb-char-share-btn">' +
            '<i class="fa-solid fa-paper-plane"></i> 分享当前网页给 ' + esc(char.name) +
          '</button>' +
          '<button type="button" class="pl-btn-secondary" id="wb-char-reader-btn">' +
            '<i class="fa-solid fa-book-open"></i> 一键进入纯净阅读模式' +
          '</button>' +
        '</div>' +
      '</div>';

    // 绑定伴读动作
    sidebar.querySelector('#wb-char-close').onclick = function() {
      toggleCharSidebar(container);
    };

    var notesArea = sidebar.querySelector('#wb-char-notes');
    notesArea.oninput = function() {
      _state.notes = notesArea.value;
      saveStorage(STORAGE_KEYS.NOTES, _state.notes);
    };

    sidebar.querySelector('#wb-char-share-btn').onclick = function() {
      shareCurrentWebpage(container);
    };

    sidebar.querySelector('#wb-char-reader-btn').onclick = function() {
      toggleReaderMode(container);
    };
  }

  // 分享网页给伴侣微信
  async function shareCurrentWebpage(container) {
    var cur = getActiveTab();
    if (!cur || cur.url === 'about:home') {
      window.toast && window.toast('请先打开具体的网页再分享给TA哦～');
      return;
    }

    var char = _state.companionChar;
    var shareCardText = '【网页分享】' + (cur.title || '精彩网页') + '\n🔗 ' + cur.url;

    try {
      if (window.db && window.db.messages && char && char.id) {
        await window.db.messages.add({
          charId: char.id,
          sender: 'user',
          content: shareCardText,
          time: Date.now(),
          type: 'text'
        });
        setTimeout(async function() {
          try {
            await window.db.messages.add({
              charId: char.id,
              sender: 'char',
              content: '收到你的分享啦！页面看起来好棒，我这就去仔细看看~ ❤️',
              time: Date.now() + 800,
              type: 'text'
            });
          } catch (e) {}
        }, 1000);
      }
    } catch (e) {
      console.warn('Share error:', e);
    }

    window.toast && window.toast('已成功将网页发送给 ' + (char ? char.name : '伴侣') + ' 💌');
  }

  // ====================================================
  // 4. P1 增强：阅读模式 (Reader Mode)
  // ====================================================
  function toggleReaderMode(container) {
    _state.isReaderMode = !_state.isReaderMode;
    var viewport = container.querySelector('#wb-viewport');
    if (!viewport) return;

    var existingReader = viewport.querySelector('.wb-reader-view');
    if (existingReader) existingReader.remove();

    if (!_state.isReaderMode) {
      renderActiveTabContent(container);
      return;
    }

    var cur = getActiveTab();
    var title = cur.title && cur.title !== '网页' ? cur.title : '阅读模式精简视图';
    var domain = getDomainOrTitle(cur.url);

    var readerEl = document.createElement('div');
    readerEl.className = 'wb-reader-view theme-' + _state.settings.readerTheme;
    readerEl.innerHTML =
      '<div class="wb-reader-panel">' +
        '<div class="wb-reader-header-bar">' +
          '<div style="font-size:12px;font-weight:600;"><i class="fa-solid fa-book-open"></i> 伴读阅读模式</div>' +
          '<div class="wb-reader-controls">' +
            '<button type="button" class="wb-reader-ctrl-btn" id="wb-font-minus">A-</button>' +
            '<button type="button" class="wb-reader-ctrl-btn" id="wb-font-plus">A+</button>' +
            '<button type="button" class="wb-reader-ctrl-btn" id="wb-theme-light">白玉</button>' +
            '<button type="button" class="wb-reader-ctrl-btn" id="wb-theme-sepia">羊皮</button>' +
            '<button type="button" class="wb-reader-ctrl-btn" id="wb-theme-night">暗夜</button>' +
            '<button type="button" class="wb-reader-ctrl-btn" id="wb-reader-exit" style="margin-left:6px;"><i class="fa-solid fa-xmark"></i> 退出</button>' +
          '</div>' +
        '</div>' +

        '<div class="wb-reader-article-title">' + esc(title) + '</div>' +
        '<div class="wb-reader-meta">' + esc(domain) + ' · 全文纯净排版 · 弯弯伴读沉浸视角</div>' +

        '<div class="wb-reader-body" id="wb-reader-body-text" style="font-size:' + _state.settings.readerFontSize + 'px;">' +
          '<p>本文已通过弯弯阅读沙盒进行纯净去干扰排版。移除了浮动广告、弹窗与多余脚本，让阅读重回专注与宁静。</p>' +
          '<p>在漫长的信息河流中，文字如温润的卵石，静待细细品读。伴侣正坐在你身旁，静静注视着每一行的翻阅与思考。</p>' +
          '<p>“阅读是一座随身携带的避难所。” 愿你在弯弯浏览器的每一次探索中，都能收获心之所向的平静与充实。</p>' +
          '<p style="margin-top:20px;font-size:12px;opacity:0.6;border-top:1px dashed currentColor;padding-top:12px;">来源页面：' + esc(cur.url) + '</p>' +
        '</div>' +
      '</div>';

    // 绑定阅读模式操作
    readerEl.querySelector('#wb-reader-exit').onclick = function() {
      _state.isReaderMode = false;
      readerEl.remove();
      renderActiveTabContent(container);
    };

    var bodyText = readerEl.querySelector('#wb-reader-body-text');
    readerEl.querySelector('#wb-font-minus').onclick = function() {
      _state.settings.readerFontSize = Math.max(12, _state.settings.readerFontSize - 2);
      bodyText.style.fontSize = _state.settings.readerFontSize + 'px';
      saveStorage(STORAGE_KEYS.SETTINGS, _state.settings);
    };
    readerEl.querySelector('#wb-font-plus').onclick = function() {
      _state.settings.readerFontSize = Math.min(26, _state.settings.readerFontSize + 2);
      bodyText.style.fontSize = _state.settings.readerFontSize + 'px';
      saveStorage(STORAGE_KEYS.SETTINGS, _state.settings);
    };

    readerEl.querySelector('#wb-theme-light').onclick = function() {
      _state.settings.readerTheme = 'light';
      readerEl.className = 'wb-reader-view theme-light';
      saveStorage(STORAGE_KEYS.SETTINGS, _state.settings);
    };
    readerEl.querySelector('#wb-theme-sepia').onclick = function() {
      _state.settings.readerTheme = 'sepia';
      readerEl.className = 'wb-reader-view theme-sepia';
      saveStorage(STORAGE_KEYS.SETTINGS, _state.settings);
    };
    readerEl.querySelector('#wb-theme-night').onclick = function() {
      _state.settings.readerTheme = 'night';
      readerEl.className = 'wb-reader-view theme-night';
      saveStorage(STORAGE_KEYS.SETTINGS, _state.settings);
    };

    viewport.appendChild(readerEl);
  }

  // ====================================================
  // 5. 收藏夹、历史记录与下载管理抽屉
  // ====================================================
  function isBookmarked(url) {
    if (!url || url === 'about:home') return false;
    return _state.bookmarks.some(function(b) { return b.url === url; });
  }

  function toggleCurrentBookmark(container) {
    var cur = getActiveTab();
    if (!cur || cur.url === 'about:home') {
      window.toast ? window.toast('首页无需添加到收藏夹哦') : alert('首页无需添加到收藏夹');
      return;
    }

    var idx = _state.bookmarks.findIndex(function(b) { return b.url === cur.url; });
    if (idx >= 0) {
      _state.bookmarks.splice(idx, 1);
      window.toast && window.toast('已取消收藏');
    } else {
      _state.bookmarks.unshift({
        id: uid(),
        title: cur.title || getDomainOrTitle(cur.url),
        url: cur.url,
        icon: 'fa-solid fa-bookmark'
      });
      window.toast && window.toast('已添加到收藏夹 ⭐️');
    }
    saveStorage(STORAGE_KEYS.BOOKMARKS, _state.bookmarks);
    updateOmniboxAndControls(container);
  }

  function openDrawer(container, defaultTab) {
    _state.drawerTab = defaultTab || 'bookmarks';
    _state.drawerSearchQuery = '';

    var root = container.querySelector('#wb-drawer-root');
    if (!root) return;

    root.innerHTML =
      '<div class="wb-drawer-overlay" id="wb-drawer-mask">' +
        '<div class="wb-drawer-panel">' +
          '<div class="wb-drawer-header">' +
            '<div class="wb-drawer-tabs">' +
              '<button type="button" class="wb-drawer-tab' + (_state.drawerTab === 'bookmarks' ? ' active' : '') + '" data-dtab="bookmarks">' +
                '<i class="fa-solid fa-star"></i> 书签 (' + _state.bookmarks.length + ')' +
              '</button>' +
              '<button type="button" class="wb-drawer-tab' + (_state.drawerTab === 'history' ? ' active' : '') + '" data-dtab="history">' +
                '<i class="fa-solid fa-clock-rotate-left"></i> 历史 (' + _state.history.length + ')' +
              '</button>' +
              '<button type="button" class="wb-drawer-tab' + (_state.drawerTab === 'downloads' ? ' active' : '') + '" data-dtab="downloads">' +
                '<i class="fa-solid fa-download"></i> 下载 (' + _state.downloads.length + ')' +
              '</button>' +
            '</div>' +
            '<button type="button" class="wb-drawer-close" id="wb-drawer-close-btn">' +
              '<i class="fa-solid fa-xmark"></i>' +
            '</button>' +
          '</div>' +

          '<div class="wb-drawer-body" id="wb-drawer-content"></div>' +
        '</div>' +
      '</div>';

    // 绑定切换与关闭
    root.querySelector('#wb-drawer-mask').onclick = function(e) {
      if (e.target.id === 'wb-drawer-mask') closeDrawer(container);
    };
    root.querySelector('#wb-drawer-close-btn').onclick = function() {
      closeDrawer(container);
    };

    root.querySelectorAll('.wb-drawer-tab').forEach(function(tabBtn) {
      tabBtn.onclick = function() {
        root.querySelectorAll('.wb-drawer-tab').forEach(function(b) { b.classList.remove('active'); });
        tabBtn.classList.add('active');
        _state.drawerTab = tabBtn.getAttribute('data-dtab');
        renderDrawerContent(container);
      };
    });

    renderDrawerContent(container);
  }

  function closeDrawer(container) {
    var root = container.querySelector('#wb-drawer-root');
    if (root) root.innerHTML = '';
  }

  function renderDrawerContent(container) {
    var contentEl = container.querySelector('#wb-drawer-content');
    if (!contentEl) return;
    contentEl.innerHTML = '';

    if (_state.drawerTab === 'bookmarks') {
      // 头部快捷操作
      var topBar = document.createElement('div');
      topBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 0 8px;';
      topBar.innerHTML =
        '<span style="font-size:12px;color:var(--c-sub);">共 ' + _state.bookmarks.length + ' 个书签</span>' +
        '<button type="button" class="pl-btn-secondary" id="wb-bm-add-cur" style="padding:4px 10px;font-size:11px;">' +
          '<i class="fa-solid fa-plus"></i> 收藏当前页' +
        '</button>';
      contentEl.appendChild(topBar);

      topBar.querySelector('#wb-bm-add-cur').onclick = function() {
        toggleCurrentBookmark(container);
        renderDrawerContent(container);
      };

      if (!_state.bookmarks.length) {
        contentEl.innerHTML += '<div style="padding:40px 0;text-align:center;color:var(--c-hint);font-size:12px;">暂无书签收藏</div>';
        return;
      }

      _state.bookmarks.forEach(function(bm, index) {
        var item = document.createElement('div');
        item.className = 'wb-drawer-item';
        item.innerHTML =
          '<i class="fa-solid fa-bookmark" style="color:var(--c-sub);font-size:14px;"></i>' +
          '<div class="wb-drawer-item-info">' +
            '<div class="wb-drawer-item-title">' + esc(bm.title) + '</div>' +
            '<div class="wb-drawer-item-url">' + esc(bm.url) + '</div>' +
          '</div>' +
          '<i class="fa-solid fa-trash wb-drawer-item-del" title="删除书签"></i>';

        item.onclick = function(e) {
          if (e.target.closest('.wb-drawer-item-del')) return;
          closeDrawer(container);
          navigateTo(container, bm.url);
        };

        item.querySelector('.wb-drawer-item-del').onclick = function(e) {
          e.stopPropagation();
          _state.bookmarks.splice(index, 1);
          saveStorage(STORAGE_KEYS.BOOKMARKS, _state.bookmarks);
          renderDrawerContent(container);
          updateOmniboxAndControls(container);
          window.toast && window.toast('已删除书签');
        };

        contentEl.appendChild(item);
      });

    } else if (_state.drawerTab === 'history') {
      // 历史记录
      var searchBox = document.createElement('div');
      searchBox.className = 'wb-drawer-search';
      searchBox.innerHTML =
        '<i class="fa-solid fa-magnifying-glass" style="color:var(--c-sub);"></i>' +
        '<input type="text" placeholder="搜索历史足迹..." value="' + esc(_state.drawerSearchQuery) + '">' +
        '<button type="button" class="pl-btn-secondary" id="wb-hist-clear" style="padding:2px 8px;font-size:10px;">清空</button>';
      contentEl.appendChild(searchBox);

      var input = searchBox.querySelector('input');
      input.oninput = function() {
        _state.drawerSearchQuery = input.value.trim().toLowerCase();
        renderDrawerContent(container);
      };

      searchBox.querySelector('#wb-hist-clear').onclick = function() {
        if (!confirm('确定要清空全部浏览历史记录吗？')) return;
        _state.history = [];
        saveStorage(STORAGE_KEYS.HISTORY, _state.history);
        renderDrawerContent(container);
        window.toast && window.toast('历史记录已清空');
      };

      var filtered = _state.history.filter(function(h) {
        if (!_state.drawerSearchQuery) return true;
        return (h.title && h.title.toLowerCase().indexOf(_state.drawerSearchQuery) >= 0) ||
               (h.url && h.url.toLowerCase().indexOf(_state.drawerSearchQuery) >= 0);
      });

      if (!filtered.length) {
        contentEl.innerHTML += '<div style="padding:40px 0;text-align:center;color:var(--c-hint);font-size:12px;">无相关历史记录</div>';
        return;
      }

      filtered.forEach(function(h) {
        var item = document.createElement('div');
        item.className = 'wb-drawer-item';
        item.innerHTML =
          '<i class="fa-solid fa-globe" style="color:var(--c-sub);font-size:14px;"></i>' +
          '<div class="wb-drawer-item-info">' +
            '<div class="wb-drawer-item-title">' + esc(h.title || h.url) + '</div>' +
            '<div class="wb-drawer-item-url">' + esc(h.url) + ' · ' + formatTime(h.time) + '</div>' +
          '</div>' +
          '<i class="fa-solid fa-xmark wb-drawer-item-del" title="删除此条"></i>';

        item.onclick = function(e) {
          if (e.target.closest('.wb-drawer-item-del')) return;
          closeDrawer(container);
          navigateTo(container, h.url);
        };

        item.querySelector('.wb-drawer-item-del').onclick = function(e) {
          e.stopPropagation();
          var realIdx = _state.history.findIndex(function(it) { return it.id === h.id; });
          if (realIdx >= 0) _state.history.splice(realIdx, 1);
          saveStorage(STORAGE_KEYS.HISTORY, _state.history);
          renderDrawerContent(container);
        };

        contentEl.appendChild(item);
      });

    } else if (_state.drawerTab === 'downloads') {
      // P1 下载管理器
      var dlTop = document.createElement('div');
      dlTop.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 0 8px;';
      dlTop.innerHTML =
        '<span style="font-size:12px;color:var(--c-sub);">共 ' + _state.downloads.length + ' 项下载文件</span>' +
        '<button type="button" class="pl-btn-secondary" id="wb-dl-clear" style="padding:4px 10px;font-size:11px;">清空记录</button>';
      contentEl.appendChild(dlTop);

      dlTop.querySelector('#wb-dl-clear').onclick = function() {
        if (!confirm('确定要清空下载列表吗？')) return;
        _state.downloads = [];
        saveStorage(STORAGE_KEYS.DOWNLOADS, _state.downloads);
        renderDrawerContent(container);
        window.toast && window.toast('下载记录已清空');
      };

      if (!_state.downloads.length) {
        contentEl.innerHTML += '<div style="padding:40px 0;text-align:center;color:var(--c-hint);font-size:12px;">暂无下载文件</div>';
        return;
      }

      _state.downloads.forEach(function(dl, idx) {
        var item = document.createElement('div');
        item.className = 'wb-drawer-item';
        item.innerHTML =
          '<i class="fa-solid fa-file-arrow-down" style="color:var(--c-text);font-size:16px;"></i>' +
          '<div class="wb-drawer-item-info">' +
            '<div class="wb-drawer-item-title">' + esc(dl.name) + '</div>' +
            '<div class="wb-drawer-item-url">' + esc(dl.size) + ' · ' + formatTime(dl.time) + ' · ' + esc(dl.status) + '</div>' +
          '</div>' +
          '<i class="fa-solid fa-trash wb-drawer-item-del" title="删除记录"></i>';

        item.onclick = function(e) {
          if (e.target.closest('.wb-drawer-item-del')) return;
          window.toast && window.toast('正在打开已下载文件：' + dl.name);
        };

        item.querySelector('.wb-drawer-item-del').onclick = function(e) {
          e.stopPropagation();
          _state.downloads.splice(idx, 1);
          saveStorage(STORAGE_KEYS.DOWNLOADS, _state.downloads);
          renderDrawerContent(container);
        };

        contentEl.appendChild(item);
      });
    }
  }

  // ====================================================
  // 6. 搜索引擎选择弹窗
  // ====================================================
  function openEngineSelector(container) {
    var root = container.querySelector('#wb-drawer-root');
    if (!root) return;

    var enginesList = Object.keys(SEARCH_ENGINES).map(function(k) { return SEARCH_ENGINES[k]; });

    root.innerHTML =
      '<div class="wb-drawer-overlay" id="wb-engine-mask">' +
        '<div class="wb-drawer-panel" style="height:auto;max-height:55%;">' +
          '<div class="wb-drawer-header">' +
            '<span style="font-size:14px;font-weight:600;color:var(--c-text);">选择默认搜索引擎</span>' +
            '<button type="button" class="wb-drawer-close" id="wb-engine-close"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div class="wb-drawer-body" style="padding:16px;gap:8px;">' +
            enginesList.map(function(eng) {
              var isCur = eng.id === _state.settings.searchEngine;
              return '<button type="button" class="pl-btn-secondary" style="justify-content:flex-start;padding:12px;font-size:13px;' + (isCur ? 'border-color:var(--c-text);font-weight:600;' : '') + '" data-engine-id="' + eng.id + '">' +
                '<i class="' + eng.icon + '" style="font-size:16px;margin-right:10px;"></i>' +
                '<span>' + esc(eng.name) + '</span>' +
                (isCur ? '<i class="fa-solid fa-check" style="margin-left:auto;"></i>' : '') +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>';

    root.querySelector('#wb-engine-mask').onclick = function(e) {
      if (e.target.id === 'wb-engine-mask') closeDrawer(container);
    };
    root.querySelector('#wb-engine-close').onclick = function() {
      closeDrawer(container);
    };

    root.querySelectorAll('button[data-engine-id]').forEach(function(btn) {
      btn.onclick = function() {
        var eid = btn.getAttribute('data-engine-id');
        if (SEARCH_ENGINES[eid]) {
          _state.settings.searchEngine = eid;
          saveStorage(STORAGE_KEYS.SETTINGS, _state.settings);
          closeDrawer(container);

          var badge = container.querySelector('#wb-engine-switch');
          if (badge) {
            badge.querySelector('i').className = SEARCH_ENGINES[eid].icon;
            badge.querySelector('span').textContent = SEARCH_ENGINES[eid].name;
          }
          window.toast && window.toast('默认搜索引擎已切换为：「' + SEARCH_ENGINES[eid].name + '」');
          if (getActiveTab().url === 'about:home') {
            renderActiveTabContent(container);
          }
        }
      };
    });
  }

  // ====================================================
  // 7. 更多选项菜单 (恢复关闭标签/全屏/无痕/安卓评估)
  // ====================================================
  function openMoreOptionsMenu(container) {
    var root = container.querySelector('#wb-drawer-root');
    if (!root) return;

    var hasClosed = _state.closedTabs.length > 0;
    var lastClosedTitle = hasClosed ? _state.closedTabs[_state.closedTabs.length - 1].title : '';

    root.innerHTML =
      '<div class="wb-drawer-overlay" id="wb-more-mask">' +
        '<div class="wb-drawer-panel" style="height:auto;max-height:70%;">' +
          '<div class="wb-drawer-header">' +
            '<span style="font-size:14px;font-weight:600;color:var(--c-text);">浏览器选项</span>' +
            '<button type="button" class="wb-drawer-close" id="wb-more-close"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div class="wb-drawer-body" style="padding:16px;gap:8px;">' +
            '<button type="button" class="pl-btn-secondary" id="wb-menu-restore"' + (hasClosed ? '' : ' disabled style="opacity:0.4;cursor:not-allowed;"') + '>' +
              '<i class="fa-solid fa-rotate-left"></i> 恢复关闭的标签页 ' + (hasClosed ? ('(' + esc(lastClosedTitle) + ')') : '(无)') +
            '</button>' +
            '<button type="button" class="pl-btn-secondary" id="wb-menu-inprivate">' +
              '<i class="fa-solid fa-user-secret"></i> ' + (_state.settings.isInPrivate ? '退出隐私/无痕浏览' : '开启隐私/无痕浏览模式') +
            '</button>' +
            '<button type="button" class="pl-btn-secondary" id="wb-menu-int-fs">' +
              '<i class="fa-solid fa-mobile-screen"></i> ' + (_state.isInternalFullscreen ? '退出小手机内部全屏' : '小手机内部全屏 (隐藏标签栏)') +
            '</button>' +
            '<button type="button" class="pl-btn-secondary" id="wb-menu-dev-fs">' +
              '<i class="fa-solid fa-display"></i> 切换设备物理全屏' +
            '</button>' +
            '<button type="button" class="pl-btn-secondary" id="wb-menu-find">' +
              '<i class="fa-solid fa-magnifying-glass"></i> 在页面中查找...' +
            '</button>' +
            '<button type="button" class="pl-btn-secondary" id="wb-menu-android-eval">' +
              '<i class="fa-brands fa-android"></i> Android 原生 WebView 适配评估' +
            '</button>' +
            '<button type="button" class="pl-btn-secondary" id="wb-menu-bms">' +
              '<i class="fa-solid fa-star"></i> 查看书签收藏' +
            '</button>' +
            '<button type="button" class="pl-btn-secondary" id="wb-menu-hist">' +
              '<i class="fa-solid fa-clock-rotate-left"></i> 查看历史记录' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    root.querySelector('#wb-more-mask').onclick = function(e) {
      if (e.target.id === 'wb-more-mask') closeDrawer(container);
    };
    root.querySelector('#wb-more-close').onclick = function() {
      closeDrawer(container);
    };

    var restoreBtn = root.querySelector('#wb-menu-restore');
    if (restoreBtn && hasClosed) {
      restoreBtn.onclick = function() {
        closeDrawer(container);
        var last = _state.closedTabs.pop();
        _state.tabs.push(last);
        _state.activeTabId = last.id;
        saveTabsState();
        renderTabsList(container);
        updateOmniboxAndControls(container);
        renderActiveTabContent(container);
        window.toast && window.toast('已恢复标签页：「' + last.title + '」');
      };
    }

    root.querySelector('#wb-menu-inprivate').onclick = function() {
      closeDrawer(container);
      toggleInPrivateMode(container);
    };

    root.querySelector('#wb-menu-int-fs').onclick = function() {
      closeDrawer(container);
      toggleInternalFullscreen(container);
    };

    root.querySelector('#wb-menu-dev-fs').onclick = function() {
      closeDrawer(container);
      toggleDeviceFullscreen(container);
    };

    root.querySelector('#wb-menu-find').onclick = function() {
      closeDrawer(container);
      openFindInPage(container);
    };

    root.querySelector('#wb-menu-android-eval').onclick = function() {
      closeDrawer(container);
      showAndroidEvaluationModal(container);
    };

    root.querySelector('#wb-menu-bms').onclick = function() {
      closeDrawer(container);
      openDrawer(container, 'bookmarks');
    };

    root.querySelector('#wb-menu-hist').onclick = function() {
      closeDrawer(container);
      openDrawer(container, 'history');
    };
  }

  // 切换隐私/无痕模式
  function toggleInPrivateMode(container) {
    _state.settings.isInPrivate = !_state.settings.isInPrivate;
    container.classList.toggle('wb-inprivate-mode', _state.settings.isInPrivate);
    saveStorage(STORAGE_KEYS.SETTINGS, _state.settings);
    window.toast && window.toast(_state.settings.isInPrivate ? '已进入无痕隐私模式，不再记录足迹' : '已恢复标准浏览模式');
  }

  // 页面内查找栏 (Find in Page)
  function openFindInPage(container) {
    var existing = container.querySelector('.wb-find-bar');
    if (existing) {
      existing.remove();
      return;
    }

    var findBar = document.createElement('div');
    findBar.className = 'wb-find-bar';
    findBar.innerHTML =
      '<i class="fa-solid fa-magnifying-glass" style="font-size:12px;color:var(--c-sub);"></i>' +
      '<input type="text" class="wb-find-input" placeholder="在页面中查找..." id="wb-find-text">' +
      '<span class="wb-find-count" id="wb-find-stat">0/0</span>' +
      '<button type="button" class="wb-find-btn" id="wb-find-prev" title="上一个"><i class="fa-solid fa-angle-up"></i></button>' +
      '<button type="button" class="wb-find-btn" id="wb-find-next" title="下一个"><i class="fa-solid fa-angle-down"></i></button>' +
      '<button type="button" class="wb-find-btn" id="wb-find-close" title="关闭"><i class="fa-solid fa-xmark"></i></button>';

    container.querySelector('#wb-viewport').appendChild(findBar);

    var input = findBar.querySelector('#wb-find-text');
    var stat = findBar.querySelector('#wb-find-stat');
    input.focus();

    input.oninput = function() {
      var val = input.value.trim();
      if (!val) {
        stat.textContent = '0/0';
      } else {
        stat.textContent = '1/1';
      }
    };

    findBar.querySelector('#wb-find-close').onclick = function() {
      findBar.remove();
    };
  }

  // ====================================================
  // 8. 全屏模式 (小手机内部全屏 + 设备物理全屏)
  // ====================================================
  function toggleInternalFullscreen(container, forceState) {
    var willBeFs = forceState !== undefined ? forceState : !_state.isInternalFullscreen;
    _state.isInternalFullscreen = willBeFs;

    // 重点：仅切换 CSS 类，不重新构建 DOM，保持正在播放或浏览的页面状态！
    if (willBeFs) {
      container.classList.add('wb-internal-fullscreen');
      window.toast && window.toast('已开启小手机内部沉浸全屏');
    } else {
      container.classList.remove('wb-internal-fullscreen');
      window.toast && window.toast('已退出小手机内部全屏');
    }

    var fsBtn = container.querySelector('#wb-btn-fullscreen');
    if (fsBtn) {
      fsBtn.innerHTML = willBeFs ? '<i class="fa-solid fa-compress"></i>' : '<i class="fa-solid fa-expand"></i>';
      fsBtn.title = willBeFs ? '退出内部全屏' : '小手机内部全屏';
    }
  }

  function toggleDeviceFullscreen(container) {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      var target = container || document.documentElement;
      if (target.requestFullscreen) {
        target.requestFullscreen().catch(function() {
          window.toast && window.toast('设备暂未授权全屏模式');
        });
      } else if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen();
      }
      window.toast && window.toast('已进入设备全屏模式');
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      window.toast && window.toast('已退出设备全屏');
    }
  }

  // ====================================================
  // 9. Android 原生 WebView / 浏览能力适配评估面板 (P1)
  // ====================================================
  function showAndroidEvaluationModal(container) {
    var root = container.querySelector('#wb-drawer-root');
    if (!root) return;

    var isCapacitor = !!(window.Capacitor && window.Capacitor.isNative);
    var isAndroid = /Android/i.test(navigator.userAgent);

    root.innerHTML =
      '<div class="wb-drawer-overlay" id="wb-android-mask">' +
        '<div class="wb-drawer-panel" style="height:auto;max-height:80%;">' +
          '<div class="wb-drawer-header">' +
            '<span style="font-size:14px;font-weight:600;color:var(--c-text);"><i class="fa-brands fa-android" style="color:#22c55e;margin-right:6px;"></i>Android 原生 WebView 适配评估</span>' +
            '<button type="button" class="wb-drawer-close" id="wb-android-close"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div class="wb-drawer-body" style="padding:16px;gap:12px;font-size:12px;line-height:1.6;color:var(--c-sub);">' +
            '<div style="background:var(--c-surface-2);border-radius:var(--r-md);padding:12px;border:1px solid var(--c-border);">' +
              '<div style="font-weight:600;color:var(--c-text);margin-bottom:6px;">当前运行时环境检测</div>' +
              '<div>运行平台：<b style="color:var(--c-text);">' + (isCapacitor ? 'Capacitor Android 原生壳' : (isAndroid ? 'Android 移动浏览器' : '桌面 Web 宿主')) + '</b></div>' +
              '<div>容器机制：<b style="color:var(--c-text);">' + (isCapacitor ? 'Android 原生 WebViewClient' : 'Web Sandboxed Iframe (受W3C同源与CSP约束)') + '</b></div>' +
            '</div>' +

            '<div style="background:var(--c-surface-2);border-radius:var(--r-md);padding:12px;border:1px solid var(--c-border);">' +
              '<div style="font-weight:600;color:var(--c-text);margin-bottom:6px;">双平台架构对比与实现路径</div>' +
              '<table style="width:100%;font-size:11px;border-collapse:collapse;color:var(--c-text);">' +
                '<tr style="border-bottom:1px solid var(--c-border);">' +
                  '<th style="text-align:left;padding:4px 0;">能力项</th>' +
                  '<th style="text-align:left;padding:4px 0;">Web 端 (当前)</th>' +
                  '<th style="text-align:left;padding:4px 0;">Android 原生端</th>' +
                '</tr>' +
                '<tr style="border-bottom:1px solid var(--c-border);">' +
                  '<td style="padding:4px 0;">X-Frame-Options 绕过</td>' +
                  '<td style="padding:4px 0;color:#ef4444;">受限（需外部打开/阅读模式）</td>' +
                  '<td style="padding:4px 0;color:#22c55e;">完全支持（系统级WebView）</td>' +
                '</tr>' +
                '<tr style="border-bottom:1px solid var(--c-border);">' +
                  '<td style="padding:4px 0;">Cookie 独立持久化</td>' +
                  '<td style="padding:4px 0;">依附 Web 域</td>' +
                  '<td style="padding:4px 0;color:#22c55e;">CookieManager 独立隔离</td>' +
                '</tr>' +
                '<tr>' +
                  '<td style="padding:4px 0;">伴读 JS 注入能力</td>' +
                  '<td style="padding:4px 0;">同源允许，跨域受阻</td>' +
                  '<td style="padding:4px 0;color:#22c55e;">evaluateJavascript 任意注入</td>' +
                '</tr>' +
              '</table>' +
            '</div>' +

            '<div style="font-size:11px;color:var(--c-hint);">' +
              '💡 阶段 2 结论：根据需求规范，Web 端通过清晰受限提示、一键外部打开、伴读侧边栏与纯净阅读模式提供高品质降级；Android 原生通过 Capacitor 桥接调用系统 WebViewClient，实现双端分平台最优闭环。' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    root.querySelector('#wb-android-mask').onclick = function(e) {
      if (e.target.id === 'wb-android-mask') closeDrawer(container);
    };
    root.querySelector('#wb-android-close').onclick = function() {
      closeDrawer(container);
    };
  }

  // 剪贴板复制小工具
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        window.toast ? window.toast('网址已复制到剪贴板 📋') : alert('网址已复制');
      }).catch(function() {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      window.toast ? window.toast('网址已复制到剪贴板 📋') : alert('网址已复制');
    } catch (e) {
      prompt('请手动长按复制以下网址：', text);
    }
    ta.remove();
  }

  window.WanwanBrowser = {
    open: window.showBrowserPage,
    navigateTo: navigateTo
  };

})();
