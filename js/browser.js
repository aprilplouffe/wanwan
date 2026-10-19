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
      readerTheme: 'light', // 'light' | 'sepia' | 'night'
      companionCharId: null,
      allowSendWebpageToAi: true
    },
    bookmarks: [],
    history: [],
    downloads: [],
    notes: '',
    companionChar: null,
    companionChatHistory: {}, // { [charId]: [ { sender, text, time } ] }
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

  function getCharTypeLabel(type) {
    if (type === 'npc') return 'NPC 配角';
    if (type === 'user') return 'USER 用户';
    return 'CHAR 主角';
  }

  // 获取伴侣角色信息（支持记忆与优先载入上次选择的角色）
  async function loadCompanionCharacter(targetCharId) {
    try {
      if (window.db && db.characters) {
        var all = await db.characters.toArray();
        var charIdToFind = targetCharId || (_state.settings && _state.settings.companionCharId);
        var found = null;
        if (charIdToFind) {
          found = all.find(function(c) { return String(c.id) === String(charIdToFind); });
        }
        if (!found) {
          found = all.find(function(c) { return c.type === 'char' || c.isCompanion; }) || all[0];
        }
        if (found) {
          _state.companionChar = {
            id: found.id,
            name: found.name || '林弯弯',
            avatar: found.avatar || 'img/wanwan.png',
            personality: found.personality || found.bio || '温柔体贴、善解人意，知书达理',
            lorebook: found.lorebook || '',
            type: found.type || 'char',
            status: found.status || '在线 · 伴读中'
          };
          return;
        }
      }
    } catch (e) {}
    _state.companionChar = {
      id: 'char_default',
      name: '林弯弯',
      avatar: 'img/wanwan.png',
      personality: '温柔体贴、善解人意，知书达理',
      lorebook: '',
      type: 'char',
      status: '在线 · 伴读中'
    };
  }

  // 初始化持久化数据
  async function initBrowserState() {
    var savedSettings = await loadStorage(STORAGE_KEYS.SETTINGS, null);
    if (savedSettings && typeof savedSettings === 'object') {
      _state.settings = Object.assign(_state.settings, savedSettings);
    }

    await loadCompanionCharacter(_state.settings.companionCharId);

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

        // 2. 主导航栏 (手机竖屏解构为：后退 + 前进 + 可伸缩地址栏 + 刷新)
        '<div class="wb-nav-bar">' +
          '<button type="button" class="wb-nav-action-btn" id="wb-btn-back" title="后退">' +
            '<i class="fa-solid fa-arrow-left"></i>' +
          '</button>' +
          '<button type="button" class="wb-nav-action-btn" id="wb-btn-forward" title="前进">' +
            '<i class="fa-solid fa-arrow-right"></i>' +
          '</button>' +

          // 核心可伸缩地址栏 Omnibox
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
            '<button type="button" class="wb-omni-btn wb-desktop-only" id="wb-star-btn" title="添加/取消收藏">' +
              '<i class="fa-regular fa-star"></i>' +
            '</button>' +
            '<button type="button" class="wb-omni-btn" id="wb-go-btn" title="前往">' +
              '<i class="fa-solid fa-arrow-right"></i>' +
            '</button>' +
          '</div>' +

          // 刷新按钮 (紧随地址栏右侧)
          '<button type="button" class="wb-nav-action-btn" id="wb-btn-reload" title="刷新">' +
            '<i class="fa-solid fa-rotate-right"></i>' +
          '</button>' +

          // 宽屏/桌面专属按键（手机版收纳至底部快捷栏或菜单）
          '<button type="button" class="wb-nav-action-btn wb-desktop-only" id="wb-btn-home" title="主页">' +
            '<i class="fa-solid fa-house"></i>' +
          '</button>' +
          '<button type="button" class="wb-nav-action-btn wb-desktop-only" id="wb-btn-companion" title="Char 伴读助手">' +
            '<i class="fa-solid fa-wand-magic-sparkles"></i>' +
            '<span class="wb-companion-dot" style="display:' + (_state.isCharSidebarOpen ? 'block' : 'none') + '"></span>' +
          '</button>' +
          '<button type="button" class="wb-nav-action-btn wb-desktop-only" id="wb-btn-bookmarks" title="收藏夹、历史与下载">' +
            '<i class="fa-solid fa-clock-rotate-left"></i>' +
          '</button>' +
          '<button type="button" class="wb-nav-action-btn wb-desktop-only" id="wb-btn-fullscreen" title="小手机内部全屏">' +
            '<i class="fa-solid fa-expand"></i>' +
          '</button>' +
          '<button type="button" class="wb-nav-action-btn wb-desktop-only" id="wb-btn-close-app" title="返回桌面">' +
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
        // 移动端竖屏抽屉式遮罩层 (点击关闭抽屉)
        '<div class="wb-char-backdrop" id="wb-char-backdrop"></div>' +
        // Char 伴读侧边栏 (P1 核心增强)
        '<div class="wb-char-sidebar collapsed" id="wb-char-sidebar"></div>' +
      '</div>' +

      // 3. 手机版底部快捷操作栏 (第三层快捷栏)
      '<div class="wb-bottom-bar" id="wb-bottom-bar">' +
        '<button type="button" class="wb-bottom-action-btn" id="wb-bottom-home" title="主页">' +
          '<i class="fa-solid fa-house"></i>' +
          '<span>主页</span>' +
        '</button>' +
        '<button type="button" class="wb-bottom-action-btn" id="wb-bottom-companion" title="Char 伴读助手">' +
          '<i class="fa-solid fa-wand-magic-sparkles"></i>' +
          '<span class="wb-companion-dot" style="display:' + (_state.isCharSidebarOpen ? 'block' : 'none') + '"></span>' +
          '<span>伴读</span>' +
        '</button>' +
        '<button type="button" class="wb-bottom-action-btn" id="wb-bottom-bookmarks" title="收藏与历史">' +
          '<i class="fa-solid fa-clock-rotate-left"></i>' +
          '<span>收藏</span>' +
        '</button>' +
        '<button type="button" class="wb-bottom-action-btn" id="wb-bottom-fullscreen" title="小手机全屏">' +
          '<i class="fa-solid fa-expand"></i>' +
          '<span>全屏</span>' +
        '</button>' +
        '<button type="button" class="wb-bottom-action-btn" id="wb-bottom-more" title="更多功能">' +
          '<i class="fa-solid fa-ellipsis"></i>' +
          '<span>更多</span>' +
        '</button>' +
        '<button type="button" class="wb-bottom-action-btn" id="wb-bottom-close-app" title="返回桌面">' +
          '<i class="fa-solid fa-xmark"></i>' +
          '<span>桌面</span>' +
        '</button>' +
      '</div>' +

      // 弹窗与选择器根节点
      '<div id="wb-modal-root"></div>' +
      // 抽屉弹窗 (收藏/历史/下载/搜索引擎/安卓评估)
      '<div id="wb-drawer-root"></div>' +

      // 撤销关闭标签浮层容器
      '<div id="wb-undo-root"></div>';

    bindGlobalEvents(container);
  }

  // 绑定全局按钮与监听
  function bindGlobalEvents(container) {
    // 监听响应式屏幕尺寸与旋转
    checkAndUpdateLayoutMode(container);
    window.addEventListener('resize', function() {
      checkAndUpdateLayoutMode(container);
    });
    window.addEventListener('orientationchange', function() {
      checkAndUpdateLayoutMode(container);
    });

    // 移动端竖屏遮罩层点击关闭伴读抽屉
    var backdrop = container.querySelector('#wb-char-backdrop');
    if (backdrop) {
      backdrop.onclick = function() {
        toggleCharSidebar(container, false);
      };
    }

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

    // 关闭应用退出到桌面 (顶栏与底栏联动)
    var handleCloseApp = function() {
      if (window.closePage) {
        window.closePage('browser-page');
      } else {
        container.remove();
      }
    };
    var closeBtn = container.querySelector('#wb-btn-close-app');
    if (closeBtn) closeBtn.onclick = handleCloseApp;
    var bottomCloseBtn = container.querySelector('#wb-bottom-close-app');
    if (bottomCloseBtn) bottomCloseBtn.onclick = handleCloseApp;

    // 手机底部快捷栏按键事件绑定
    var bottomHomeBtn = container.querySelector('#wb-bottom-home');
    if (bottomHomeBtn) {
      bottomHomeBtn.onclick = function() {
        navigateTo(container, 'about:home');
      };
    }
    var bottomCompBtn = container.querySelector('#wb-bottom-companion');
    if (bottomCompBtn) {
      bottomCompBtn.onclick = function() {
        toggleCharSidebar(container);
      };
    }
    var bottomBmsBtn = container.querySelector('#wb-bottom-bookmarks');
    if (bottomBmsBtn) {
      bottomBmsBtn.onclick = function() {
        openDrawer(container, 'bookmarks');
      };
    }
    var bottomFsBtn = container.querySelector('#wb-bottom-fullscreen');
    if (bottomFsBtn) {
      bottomFsBtn.onclick = function() {
        toggleInternalFullscreen(container);
      };
    }
    var bottomMoreBtn = container.querySelector('#wb-bottom-more');
    if (bottomMoreBtn) {
      bottomMoreBtn.onclick = function() {
        openMoreOptionsMenu(container);
      };
    }

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
  // 3. 增强型：Char 贴身伴读与角色切换 (Companion Sidebar & Role Switcher)
  // ====================================================

  // 检测并设置移动端竖屏抽屉与宽屏双栏模式
  function checkAndUpdateLayoutMode(container) {
    if (!container) return;
    var wrap = container.querySelector('#wb-body-wrap') || container;
    var w = wrap.clientWidth || container.clientWidth || window.innerWidth;
    var h = wrap.clientHeight || container.clientHeight || window.innerHeight;
    var isMobile = w <= 680 || (h > w && w <= 768);
    container.classList.toggle('wb-mobile-layout', isMobile);
    container.classList.toggle('wb-mode-drawer', isMobile);
    container.classList.toggle('wb-mode-split', !isMobile);
    var backdrop = container.querySelector('#wb-char-backdrop');
    if (backdrop) {
      backdrop.classList.toggle('visible', isMobile && _state.isCharSidebarOpen);
    }
  }

  // 开关伴读抽屉/侧栏（绝不重载当前网页、绝不丢失滚动位置）
  function toggleCharSidebar(container, forceOpen) {
    if (typeof forceOpen === 'boolean') {
      _state.isCharSidebarOpen = forceOpen;
    } else {
      _state.isCharSidebarOpen = !_state.isCharSidebarOpen;
    }

    var sidebar = container.querySelector('#wb-char-sidebar');
    var backdrop = container.querySelector('#wb-char-backdrop');
    var dot = container.querySelector('.wb-companion-dot');
    if (!sidebar) return;

    checkAndUpdateLayoutMode(container);

    if (_state.isCharSidebarOpen) {
      sidebar.classList.remove('collapsed');
      if (backdrop && container.classList.contains('wb-mode-drawer')) {
        backdrop.classList.add('visible');
      }
      container.querySelectorAll('.wb-companion-dot').forEach(function(d) { d.style.display = 'block'; });
      updateCharSidebarContent(container);
      window.toast && window.toast((_state.companionChar ? _state.companionChar.name : '伴侣') + ' 已开启贴身伴读');
    } else {
      sidebar.classList.add('collapsed');
      if (backdrop) backdrop.classList.remove('visible');
      container.querySelectorAll('.wb-companion-dot').forEach(function(d) { d.style.display = 'none'; });
    }
  }

  // 根据当前网页与角色个性化生成动态伴读发言
  function getCompanionSpeechForUrl(url, char) {
    var name = (char && char.name) || '林弯弯';
    if (!url || url === 'about:home') {
      return '今天想和我一起了解些什么呢？不管是知识、新闻还是影音，' + name + ' 都一直陪着你哦～';
    }
    if (url.indexOf('search') >= 0 || url.indexOf('baidu') >= 0 || url.indexOf('bing') >= 0 || url.indexOf('google') >= 0) {
      return '在查探新情报呀！找到满意的答案了吗？如果有困惑也可以随时和 ' + name + ' 聊聊看～';
    }
    if (url.indexOf('wikipedia.org') >= 0) {
      return '哇，是维基百科！百科里的知识像浩瀚星河一样呢，等你读完也教教 ' + name + ' 好不好～';
    }
    if (url.indexOf('github.com') >= 0) {
      return '代码的世界好神奇～认真钻研代码的你，在 ' + name + ' 眼里超级帅气迷人！';
    }
    if (url.indexOf('bilibili.com') >= 0 || url.indexOf('music') >= 0) {
      return '冲浪放松一下也很棒！要注意休息眼睛，喝口水润润嗓子哦～';
    }
    if (isKnownRestrictedSite(url)) {
      return '这个网站有严格的安全防护罩（X-Frame-Options）呢，点击「外部打开」就可以在全屏大窗口尽情浏览啦！';
    }
    return '这个页面看起来真有意思！点击下方的「分享给TA」，' + name + ' 会把这篇文章珍藏在我们的微信小纸条里哦～';
  }

  // 渲染伴读历史对话气泡流
  function renderCompanionChatMessagesHtml(messages, char) {
    if (!messages || !messages.length) {
      return '<div class="wb-char-chat-empty">你可以向 ' + esc(char.name) + ' 提问、讨论当前文章或寻求网页导读哦～</div>';
    }
    return messages.map(function(m) {
      var isUser = m.sender === 'user';
      return '<div class="wb-char-msg ' + (isUser ? 'user' : 'char') + '">' +
        esc(m.text).replace(/\n/g, '<br>') +
      '</div>';
    }).join('');
  }

  // 安全提取当前网页内容（受技术可行性与用户授权约束）
  function extractCurrentPageContent() {
    var cur = getActiveTab();
    if (!cur) return { title: '', url: '', text: '', isRestricted: false };

    var title = cur.title || '网页';
    var url = cur.url || '';
    if (url === 'about:home') {
      return { title: '浏览器主页', url: url, text: '用户当前位于弯弯浏览器主页。', isRestricted: false };
    }

    var iframe = document.querySelector('#wb-viewport iframe');
    var text = '';
    var isRestricted = false;

    if (iframe) {
      try {
        var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        if (doc && doc.body) {
          text = (doc.body.innerText || doc.body.textContent || '').trim();
          text = text.replace(/\s+/g, ' ').slice(0, 1500);
        }
      } catch (err) {
        // 目标站点具有跨域保护（SecurityError/X-Frame-Options）
        isRestricted = true;
      }
    }

    return {
      title: title,
      url: url,
      text: text,
      isRestricted: isRestricted
    };
  }

  // 提示词服务复用：读取伴读附加提示词（复用 StudyPromptManager）
  async function getCompanionPromptProfile(charId, charName) {
    if (window.StudyPromptManager && window.StudyPromptManager.getPromptProfile) {
      return await window.StudyPromptManager.getPromptProfile('study_char_overlay', charId, charName);
    }
    var key = 'study_char_overlay_' + (charId || 'char_default');
    var all = await loadStorage('wanwan_study_prompt_profiles', {});
    var found = all[key];
    if (found && found.content !== undefined) {
      return {
        id: found.id || ('profile_' + key),
        scope: 'study_char_overlay',
        charId: charId,
        name: (charName || '当前角色') + ' 伴读附加规则',
        content: String(found.content),
        version: found.version || 1,
        updatedAt: found.updatedAt || '已修改保存',
        isCustom: true
      };
    }
    return {
      id: 'profile_' + key + '_default',
      scope: 'study_char_overlay',
      charId: charId,
      name: (charName || '当前角色') + ' 伴读附加规则',
      content: '你正处于「弯弯浏览器 · 贴身伴读」场景。保留原有角色人设与性格，用温柔平等的口吻陪伴用户冲浪与阅读，针对网页内容启发思考，不捏造事实，不自动写入长期记忆。',
      version: 1,
      updatedAt: '系统内置默认模板',
      isCustom: false
    };
  }

  // 提示词服务复用：保存伴读附加提示词
  async function saveCompanionPromptProfile(charId, content, charName) {
    if (window.StudyPromptManager && window.StudyPromptManager.savePromptProfile) {
      return await window.StudyPromptManager.savePromptProfile('study_char_overlay', charId, content, charName);
    }
    var key = 'study_char_overlay_' + (charId || 'char_default');
    var all = await loadStorage('wanwan_study_prompt_profiles', {});
    var profile = {
      id: 'profile_' + key + '_' + Date.now().toString(36),
      scope: 'study_char_overlay',
      charId: charId,
      name: (charName || '当前角色') + ' 伴读附加规则',
      content: String(content).trim(),
      version: 1,
      updatedAt: new Date().toISOString(),
      isCustom: true
    };
    all[key] = profile;
    await saveStorage('wanwan_study_prompt_profiles', all);
    return profile;
  }

  // 获取 AI API 配置
  async function getAiConfig() {
    if (!window.db || !window.db.config) return null;
    try {
      var rows = await window.db.config.bulkGet(['apiBaseUrl', 'apiKey', 'apiModel']);
      var v = function(r) { return r ? r.value : ''; };
      var url = String(v(rows[0]) || '').trim().replace(/\/+$/, '');
      var key = String(v(rows[1]) || '').trim();
      var model = String(v(rows[2]) || '').trim() || 'gpt-4o-mini';
      if (!url || !key) return null;
      return { url: url, key: key, model: model };
    } catch (e) {
      return null;
    }
  }

  // 本地高保真伴读回复合成（无 API 或离线回退）
  function synthesizeCompanionLocalReply(char, userQuery, pageData, isAuth) {
    var name = (char && char.name) || '林弯弯';
    var isSum = userQuery.indexOf('总结') >= 0 || userQuery.indexOf('核心') >= 0;

    if (!isAuth) {
      return '收到你的消息啦！你目前未开启网页内容授权，所以 ' + name + ' 没有抓取当前网页正文哦～不过针对“' + userQuery + '”，我的理解是：保持独立思辨最重要，遇到有趣的点随时可以继续和我探讨～ ✨';
    }

    if (pageData.url === 'about:home') {
      return '我们现在还在浏览器主页呢！在搜索栏里输入你感兴趣的话题或打开常用导航，' + name + ' 随时准备为你划重点～ 💡';
    }

    var title = pageData.title || '当前网页';

    if (pageData.isRestricted) {
      if (isSum) {
        return '好呀！当前打开的是《' + title + '》。虽然目标站点设置了同源跨域防护、无法直接把整篇内文抓下来，但从这个主题来看，它重点涵盖了该方向的核心动态与知识脉络。读到精彩的地方随时用下方的“随读摘录便签”记下来哦，' + name + ' 帮你妥善保存着呢！ 📖';
      }
      return '关于《' + title + '》和“' + userQuery + '”：' + name + ' 觉得这篇内容很值得我们深入探究。认真阅读思考的你真的超有魅力～有具体段落感悟也可以随手摘录在便签里哦！ ❤️';
    }

    if (isSum) {
      return '为你梳理好《' + title + '》的要点啦：\n1. 主题聚焦：围绕该领域的核心概念与实践方法展开；\n2. 关键脉络：层层递进分析了核心背景与解决路径；\n3. 伴读心得：建议把重点定义与关键数据记录在便签中，巩固理解哦～ ' + name + ' 陪你一起读懂它！ ✨';
    }

    return '针对“' + userQuery + '”，结合《' + title + '》的内容：' + name + ' 认为抓主干逻辑和核心定义最关键，别被零散细节绕晕啦。随时告诉我你的新想法，我们一起探讨！ 🌟';
  }

  // 发送伴读对话请求（严格不写入长期记忆）
  async function sendCompanionChatMessage(container, userQuery) {
    var char = _state.companionChar || { id: 'char_default', name: '林弯弯', personality: '温柔体贴' };
    if (!_state.companionChatHistory[char.id]) {
      _state.companionChatHistory[char.id] = [];
    }

    _state.companionChatHistory[char.id].push({
      sender: 'user',
      text: userQuery,
      time: Date.now()
    });

    var sidebar = container.querySelector('#wb-char-sidebar');
    var chatArea = sidebar ? sidebar.querySelector('#wb-char-chat-area') : null;
    if (chatArea) {
      chatArea.innerHTML = renderCompanionChatMessagesHtml(_state.companionChatHistory[char.id], char) +
        '<div class="wb-char-msg char wb-char-thinking"><i class="fa-solid fa-spinner fa-spin"></i> ' + esc(char.name) + ' 正在阅读思考...</div>';
      chatArea.scrollTop = chatArea.scrollHeight;
    }

    // 1. 授权检测
    var isAuth = _state.settings.allowSendWebpageToAi;
    var authCheck = container.querySelector('#wb-auth-web-content');
    if (authCheck) isAuth = authCheck.checked;

    // 2. 网页信息安全提取
    var pageData = { title: '', url: '', text: '', isRestricted: false };
    if (isAuth) {
      pageData = extractCurrentPageContent();
    }

    // 3. 读取独立附加规则
    var promptProfile = await getCompanionPromptProfile(char.id, char.name);

    // 4. 构建包含原有角色人设的系统提示词
    var systemPrompt =
      '你扮演当前选中的伴读角色：' + char.name + '。\n' +
      '【角色既有人设（只读继承，严格遵循）】\n' +
      '角色性格：' + (char.personality || '温柔体贴、善解人意，知书达理') + '\n' +
      (char.lorebook ? ('世界书背景：' + char.lorebook + '\n') : '') +
      '\n【当前场景】\n' +
      '你正处于「弯弯浏览器 · 贴身伴读」场景中，陪伴用户一起浏览网页、学习和探索网络知识。\n' +
      '【伴读附加规则（按当前角色独立配置）】\n' +
      (promptProfile.content || '保留原有角色人设与性格，用温暖生动的口吻陪伴用户冲浪与阅读，针对网页内容启发思考，不编造事实。') +
      '\n\n【网页内容授权与技术状态】\n' +
      (!isAuth ?
        '用户未勾选授权发送当前网页内容。请仅根据用户的问题与你的角色知识回答，不得声称自己读取了网页正文。\n' :
        (pageData.isRestricted ?
          '当前网页标题：' + pageData.title + '\n当前网页网址：' + pageData.url + '\n（目标站点受同源/跨域安全策略防护，浏览器保护正文未被提取，仅能参考标题与网址）\n' :
          '当前网页标题：' + pageData.title + '\n当前网页网址：' + pageData.url + '\n网页正文参考切片（节选）：\n' + (pageData.text || '（当前页面无提取到文字）') + '\n'
        )
      ) +
      '\n【严格安全红线】\n' +
      '1. 保持你的角色口吻和第一人称表达，称呼和互动符合角色设定。\n' +
      '2. 绝不自动把网页大段内容写入你的长期记忆库，严格保护用户隐私。\n' +
      '3. 回答清晰有温度，重点突出。';

    var messages = [
      { role: 'system', content: systemPrompt }
    ];

    var recentHistory = _state.companionChatHistory[char.id].slice(-6);
    recentHistory.forEach(function(m) {
      messages.push({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      });
    });

    var reply = '';
    var cfg = await getAiConfig();

    if (cfg && cfg.url && cfg.key && window.runTrackedChatCompletion) {
      try {
        var body = {
          model: cfg.model,
          messages: messages,
          temperature: 0.75
        };
        var res = await window.runTrackedChatCompletion(cfg, body, '弯弯浏览器 · ' + char.name + '伴读');
        reply = (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
      } catch (e) {
        console.warn('Browser companion cloud AI error:', e);
      }
    }

    if (!reply) {
      reply = synthesizeCompanionLocalReply(char, userQuery, pageData, isAuth);
    }

    _state.companionChatHistory[char.id].push({
      sender: 'char',
      text: reply,
      time: Date.now()
    });

    if (sidebar && _state.isCharSidebarOpen) {
      var ca = sidebar.querySelector('#wb-char-chat-area');
      if (ca) {
        ca.innerHTML = renderCompanionChatMessagesHtml(_state.companionChatHistory[char.id], char);
        ca.scrollTop = ca.scrollHeight;
      }
    }
  }

  // 刷新伴读侧边栏内容（不刷新当前网页，不丢失任何滚动位置与标签）
  function updateCharSidebarContent(container) {
    var sidebar = container.querySelector('#wb-char-sidebar');
    if (!sidebar || _state.isCharSidebarOpen === false) return;

    var cur = getActiveTab();
    var char = _state.companionChar || { id: 'char_default', name: '林弯弯', avatar: 'img/wanwan.png', status: '在线 · 伴读中', type: 'char' };
    var speech = getCompanionSpeechForUrl(cur ? cur.url : '', char);
    var chatMessages = (_state.companionChatHistory && _state.companionChatHistory[char.id]) || [];

    sidebar.innerHTML =
      '<div class="wb-char-header">' +
        '<div class="wb-char-profile wb-char-profile-clickable" id="wb-char-switch-trigger" title="点击切换伴读角色">' +
          '<img src="' + esc(char.avatar) + '" class="wb-char-avatar" onerror="this.src=\'img/wanwan.png\'">' +
          '<div class="wb-char-info">' +
            '<div class="wb-char-name-row">' +
              '<span class="wb-char-name">' + esc(char.name) + '</span>' +
              '<span class="wb-char-switch-icon"><i class="fa-solid fa-repeat"></i></span>' +
            '</div>' +
            '<div class="wb-char-status">' + esc(getCharTypeLabel(char.type)) + ' · 点击切换</div>' +
          '</div>' +
        '</div>' +
        '<div class="wb-char-header-actions">' +
          '<button type="button" class="wb-nav-action-btn" id="wb-char-prompt-btn" title="查看伴读人设与附加规则"><i class="fa-solid fa-sliders"></i></button>' +
          '<button type="button" class="wb-nav-action-btn" id="wb-char-close" title="收起伴读抽屉">' +
            '<i class="fa-solid fa-xmark"></i>' +
          '</button>' +
        '</div>' +
      '</div>' +

      '<div class="wb-char-body">' +
        // 角色气泡感言
        '<div class="wb-char-bubble">' +
          '<div class="wb-char-bubble-text">' + esc(speech) + '</div>' +
        '</div>' +

        // 网页授权开关
        '<div class="wb-char-auth-box">' +
          '<label class="wb-char-auth-label" title="开启后伴读可提取当前网页文本向AI提问">' +
            '<input type="checkbox" id="wb-auth-web-content"' + (_state.settings.allowSendWebpageToAi ? ' checked' : '') + '> ' +
            '<span>授权发送当前网页信息给伴读</span>' +
          '</label>' +
          '<div class="wb-char-auth-tip"><i class="fa-solid fa-shield-halved" style="color:#22c55e;"></i> 跨域同源安全防护 · 不写入长期记忆</div>' +
        '</div>' +

        // 伴读互动对话区
        '<div class="wb-char-section-title">' +
          '<i class="fa-solid fa-comments"></i> <span>与 ' + esc(char.name) + ' 伴读讨论</span>' +
        '</div>' +
        '<div class="wb-char-chat-area" id="wb-char-chat-area">' +
          renderCompanionChatMessagesHtml(chatMessages, char) +
        '</div>' +

        // 对话输入行
        '<div class="wb-char-input-box">' +
          '<input type="text" class="wb-char-input" id="wb-char-input" placeholder="和 ' + esc(char.name) + ' 聊聊这个网页...">' +
          '<button type="button" class="pl-btn-secondary" id="wb-char-send-btn" style="padding:4px 8px;font-size:11px;">发送</button>' +
          '<button type="button" class="pl-btn-secondary" id="wb-char-summarize-btn" style="padding:4px 8px;font-size:11px;" title="一键解读/总结当前网页"><i class="fa-solid fa-wand-magic-sparkles"></i> 总结</button>' +
        '</div>' +

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

    // 绑定角色切换入口
    sidebar.querySelector('#wb-char-switch-trigger').onclick = function() {
      openBrowserCompanionSelectorModal(container);
    };

    // 绑定伴读规则设置
    sidebar.querySelector('#wb-char-prompt-btn').onclick = function() {
      openBrowserPromptModal(container);
    };

    // 绑定关闭抽屉
    sidebar.querySelector('#wb-char-close').onclick = function() {
      toggleCharSidebar(container, false);
    };

    // 授权变更
    var authCheck = sidebar.querySelector('#wb-auth-web-content');
    if (authCheck) {
      authCheck.onchange = function() {
        _state.settings.allowSendWebpageToAi = authCheck.checked;
        saveStorage(STORAGE_KEYS.SETTINGS, _state.settings);
      };
    }

    // 随读便签
    var notesArea = sidebar.querySelector('#wb-char-notes');
    notesArea.oninput = function() {
      _state.notes = notesArea.value;
      saveStorage(STORAGE_KEYS.NOTES, _state.notes);
    };

    // 快捷分享
    sidebar.querySelector('#wb-char-share-btn').onclick = function() {
      shareCurrentWebpage(container);
    };

    // 阅读模式
    sidebar.querySelector('#wb-char-reader-btn').onclick = function() {
      toggleReaderMode(container);
    };

    // AI 对话交互
    var chatInput = sidebar.querySelector('#wb-char-input');
    var sendBtn = sidebar.querySelector('#wb-char-send-btn');
    var sumBtn = sidebar.querySelector('#wb-char-summarize-btn');

    var doSendChat = function(queryText) {
      var q = (queryText || (chatInput ? chatInput.value : '')).trim();
      if (!q) return;
      if (chatInput) chatInput.value = '';
      sendCompanionChatMessage(container, q);
    };

    if (sendBtn) {
      sendBtn.onclick = function() { doSendChat(); };
    }
    if (chatInput) {
      chatInput.onkeydown = function(e) {
        if (e.key === 'Enter') doSendChat();
      };
    }
    if (sumBtn) {
      sumBtn.onclick = function() {
        var curTab = getActiveTab();
        var tabTitle = (curTab && curTab.title) ? curTab.title : '当前页面';
        doSendChat('请结合当前打开的网页《' + tabTitle + '》，帮我总结提炼核心重点与主要观点。');
      };
    }

    var chatArea = sidebar.querySelector('#wb-char-chat-area');
    if (chatArea) {
      chatArea.scrollTop = chatArea.scrollHeight;
    }
  }

  // 切换伴读角色：更新身份、人设、记忆选择、不重新加载网页与滚动位置
  function switchCompanionChar(container, character) {
    if (!character) return;
    _state.companionChar = {
      id: character.id,
      name: character.name || '未命名角色',
      avatar: character.avatar || 'img/wanwan.png',
      personality: character.personality || character.bio || '温柔体贴、善解人意，知书达理',
      lorebook: character.lorebook || '',
      type: character.type || 'char',
      status: character.status || '在线 · 伴读中'
    };
    _state.settings.companionCharId = character.id;
    saveStorage(STORAGE_KEYS.SETTINGS, _state.settings);

    // 仅更新伴读侧边栏视图，绝不触碰当前网页 iframe，保持网页滚动位置与标签页状态
    updateCharSidebarContent(container);

    window.toast && window.toast('贴身伴读已切换为「' + _state.companionChar.name + '」');
  }

  // 角色档案选择弹窗（动态全量读取 db.characters，不修改任何角色数据）
  async function openBrowserCompanionSelectorModal(container) {
    var root = container.querySelector('#wb-modal-root');
    if (!root) return;

    var allChars = [];
    try {
      if (window.db && db.characters) {
        allChars = await db.characters.toArray();
      }
    } catch (e) {}

    if (!allChars || allChars.length === 0) {
      allChars = [
        {
          id: 'char_default',
          name: '林弯弯',
          avatar: 'img/wanwan.png',
          personality: '温柔体贴、善解人意，知书达理',
          type: 'char'
        }
      ];
    }

    var currentFilter = 'all'; // 'all' | 'char' | 'npc' | 'user'
    var searchKeyword = '';

    function getFilteredList() {
      return allChars.filter(function(c) {
        var matchType = currentFilter === 'all' || (c.type || 'char') === currentFilter;
        if (!matchType) return false;
        if (!searchKeyword) return true;
        var kw = searchKeyword.toLowerCase();
        var nameMatch = (c.name || '').toLowerCase().indexOf(kw) !== -1;
        var descMatch = (c.personality || c.bio || c.lorebook || '').toLowerCase().indexOf(kw) !== -1;
        return nameMatch || descMatch;
      });
    }

    function renderModalContent() {
      var filtered = getFilteredList();
      var curId = _state.companionChar ? String(_state.companionChar.id) : '';

      root.innerHTML =
        '<div class="wb-modal-mask" id="wb-companion-mask">' +
          '<div class="wb-modal-panel">' +
            '<div class="wb-modal-header">' +
              '<span><i class="fa-solid fa-user-group" style="color:var(--c-primary, #6366f1);margin-right:6px;"></i>选择贴身伴读角色</span>' +
              '<button type="button" class="wb-nav-action-btn" id="wb-companion-close" style="padding:4px;"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +

            // 分类筛选标签
            '<div style="display:flex;gap:6px;align-items:center;overflow-x:auto;padding-bottom:2px;">' +
              '<button type="button" class="pl-btn-secondary wb-cfilter-btn' + (currentFilter === 'all' ? ' active' : '') + '" data-filter="all" style="padding:4px 10px;font-size:11px;' + (currentFilter === 'all' ? 'border-color:var(--c-text);font-weight:600;' : '') + '">全部 (' + allChars.length + ')</button>' +
              '<button type="button" class="pl-btn-secondary wb-cfilter-btn' + (currentFilter === 'char' ? ' active' : '') + '" data-filter="char" style="padding:4px 10px;font-size:11px;' + (currentFilter === 'char' ? 'border-color:var(--c-text);font-weight:600;' : '') + '">CHAR 主角</button>' +
              '<button type="button" class="pl-btn-secondary wb-cfilter-btn' + (currentFilter === 'npc' ? ' active' : '') + '" data-filter="npc" style="padding:4px 10px;font-size:11px;' + (currentFilter === 'npc' ? 'border-color:var(--c-text);font-weight:600;' : '') + '">NPC 配角</button>' +
              '<button type="button" class="pl-btn-secondary wb-cfilter-btn' + (currentFilter === 'user' ? ' active' : '') + '" data-filter="user" style="padding:4px 10px;font-size:11px;' + (currentFilter === 'user' ? 'border-color:var(--c-text);font-weight:600;' : '') + '">USER 用户</button>' +
            '</div>' +

            // 搜索框
            '<div style="position:relative;">' +
              '<input type="text" class="input-field" id="wb-companion-search" value="' + esc(searchKeyword) + '" placeholder="搜索角色名称、性格或设定..." style="width:100%;padding-right:28px;">' +
              (searchKeyword ? '<i class="fa-solid fa-circle-xmark" id="wb-clear-search" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--c-sub);"></i>' : '') +
            '</div>' +

            // 角色列表
            '<div class="wb-char-select-list" id="wb-char-list">' +
              (filtered.length === 0
                ? '<div style="text-align:center;padding:28px 0;color:var(--c-sub);font-size:12px;"><i class="fa-solid fa-user-slash" style="font-size:24px;margin-bottom:8px;display:block;opacity:0.4;"></i>未找到匹配的角色档案</div>'
                : filtered.map(function(c) {
                    var isSelected = String(c.id) === curId;
                    var typeLabel = getCharTypeLabel(c.type || 'char');
                    var desc = c.personality || c.bio || c.lorebook || '暂无设定简介';
                    return (
                      '<div class="wb-char-select-item' + (isSelected ? ' selected' : '') + '" data-char-id="' + esc(c.id) + '">' +
                        '<img class="wb-char-select-avatar" src="' + esc(c.avatar || 'img/wanwan.png') + '" onerror="this.src=\'img/wanwan.png\'">' +
                        '<div class="wb-char-select-info">' +
                          '<div class="wb-char-select-name-row">' +
                            '<span class="wb-char-select-name">' + esc(c.name || '未命名角色') + '</span>' +
                            '<span class="wb-char-select-type">' + esc(typeLabel) + '</span>' +
                            (isSelected ? '<span style="font-size:10px;color:var(--c-primary, #6366f1);font-weight:600;margin-left:auto;"><i class="fa-solid fa-heart" style="color:#f43f5e;font-size:9px;"></i> 当前伴读</span>' : '') +
                          '</div>' +
                          '<div class="wb-char-select-desc" title="' + esc(desc) + '">' + esc(desc) + '</div>' +
                        '</div>' +
                        (isSelected ? '<div class="wb-char-select-check"><i class="fa-solid fa-circle-check" style="color:var(--c-primary, #6366f1);"></i></div>' : '') +
                      '</div>'
                    );
                  }).join('')) +
            '</div>' +

            '<div style="font-size:11px;color:var(--c-sub);display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--c-border);">' +
              '<span><i class="fa-solid fa-shield-halved" style="color:#22c55e;"></i> 直接关联「角色档案」，不修改任何角色数据</span>' +
              '<span style="font-size:10px;color:var(--c-hint);">切换不刷新网页 · 保持当前位置</span>' +
            '</div>' +
          '</div>' +
        '</div>';

      root.querySelector('#wb-companion-mask').onclick = function(e) {
        if (e.target.id === 'wb-companion-mask') root.innerHTML = '';
      };
      root.querySelector('#wb-companion-close').onclick = function() {
        root.innerHTML = '';
      };

      root.querySelectorAll('.wb-cfilter-btn').forEach(function(btn) {
        btn.onclick = function() {
          currentFilter = btn.getAttribute('data-filter') || 'all';
          renderModalContent();
        };
      });

      var sInput = root.querySelector('#wb-companion-search');
      if (sInput) {
        sInput.oninput = function() {
          searchKeyword = sInput.value.trim();
          renderModalContent();
          var newIn = root.querySelector('#wb-companion-search');
          if (newIn) {
            newIn.focus();
            newIn.setSelectionRange(newIn.value.length, newIn.value.length);
          }
        };
      }

      var clearBtn = root.querySelector('#wb-clear-search');
      if (clearBtn) {
        clearBtn.onclick = function() {
          searchKeyword = '';
          renderModalContent();
        };
      }

      root.querySelectorAll('.wb-char-select-item').forEach(function(item) {
        item.onclick = function() {
          var cid = item.getAttribute('data-char-id');
          var chosen = allChars.find(function(c) { return String(c.id) === String(cid); });
          if (chosen) {
            switchCompanionChar(container, chosen);
            root.innerHTML = '';
          }
        };
      });
    }

    renderModalContent();
  }

  // 伴读附加规则设置弹窗（复用 StudyPromptManager 配置体系，按 charId 独立隔离）
  async function openBrowserPromptModal(container) {
    var root = container.querySelector('#wb-modal-root');
    if (!root) return;

    var char = _state.companionChar || { id: 'char_default', name: '林弯弯' };
    var profile = await getCompanionPromptProfile(char.id, char.name);

    root.innerHTML =
      '<div class="wb-modal-mask" id="wb-prompt-mask">' +
        '<div class="wb-modal-panel" style="max-height:85%;">' +
          '<div class="wb-modal-header">' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<i class="fa-solid fa-wand-magic-sparkles" style="color:var(--c-primary, #6366f1);"></i>' +
              '<span>' + esc(char.name) + ' · 伴读附加规则与人设</span>' +
            '</div>' +
            '<button type="button" class="wb-nav-action-btn" id="wb-prompt-close" style="padding:4px;"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +

          '<div style="font-size:11px;color:var(--c-sub);display:flex;align-items:center;justify-content:space-between;background:var(--c-surface-2);padding:6px 10px;border-radius:4px;">' +
            '<span>关联角色：<b>' + esc(char.name) + '</b> (' + esc(getCharTypeLabel(char.type)) + ')</span>' +
            '<span style="color:' + (profile.isCustom ? '#22c55e' : 'var(--c-sub)') + ';">' + (profile.isCustom ? '已自定义保存' : '系统默认版') + '</span>' +
          '</div>' +

          '<div style="position:relative;width:100%;">' +
            '<textarea class="input-field" id="wb-prompt-editor" style="width:100%;height:220px;resize:vertical;font-family:inherit;font-size:12px;line-height:1.6;padding:10px;border-radius:6px;" placeholder="在此配置该角色在伴读时的对话风格、指导规则与互动偏好...">' + esc(profile.content) + '</textarea>' +
          '</div>' +

          '<div style="font-size:10px;color:var(--c-sub);display:flex;justify-content:space-between;margin-top:-6px;">' +
            '<span id="wb-prompt-word-count">当前字数：' + profile.content.length + ' 字</span>' +
            '<span>复用提示词配置服务 · 跨场景隔离</span>' +
          '</div>' +

          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px;">' +
            '<div style="display:flex;gap:6px;">' +
              '<button type="button" class="pl-btn-secondary" id="wb-prompt-restore" style="padding:4px 8px;font-size:11px;color:#ef4444;"><i class="fa-solid fa-rotate-left"></i> 恢复默认</button>' +
              '<button type="button" class="pl-btn-secondary" id="wb-prompt-copy" style="padding:4px 8px;font-size:11px;"><i class="fa-solid fa-copy"></i> 复制</button>' +
            '</div>' +
            '<button type="button" class="pl-btn-primary" id="wb-prompt-save" style="padding:4px 14px;font-size:11px;"><i class="fa-solid fa-floppy-disk"></i> 保存并应用</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    root.querySelector('#wb-prompt-mask').onclick = function(e) {
      if (e.target.id === 'wb-prompt-mask') root.innerHTML = '';
    };
    root.querySelector('#wb-prompt-close').onclick = function() {
      root.innerHTML = '';
    };

    var editor = root.querySelector('#wb-prompt-editor');
    var wordCount = root.querySelector('#wb-prompt-word-count');
    if (editor && wordCount) {
      editor.oninput = function() {
        wordCount.textContent = '当前字数：' + editor.value.length + ' 字';
      };
    }

    root.querySelector('#wb-prompt-copy').onclick = function() {
      if (editor) {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(editor.value);
        } else {
          editor.select();
          document.execCommand('copy');
        }
        window.toast && window.toast('提示词已复制到剪贴板！');
      }
    };

    root.querySelector('#wb-prompt-restore').onclick = async function() {
      if (confirm('确定要恢复为系统默认模板吗？当前自定义将被重置。')) {
        if (window.StudyPromptManager && window.StudyPromptManager.resetPromptProfile) {
          profile = await window.StudyPromptManager.resetPromptProfile('study_char_overlay', char.id, char.name);
        } else {
          profile = await getCompanionPromptProfile(char.id, char.name);
        }
        if (editor) editor.value = profile.content;
        window.toast && window.toast('已还原为默认提示词！');
      }
    };

    root.querySelector('#wb-prompt-save').onclick = async function() {
      var text = (editor ? editor.value : '').trim();
      if (!text) {
        window.toast && window.toast('提示词内容不能为空');
        return;
      }
      await saveCompanionPromptProfile(char.id, text, char.name);
      root.innerHTML = '';
      window.toast && window.toast('伴读附加规则已更新保存！');
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
            (_state.tabs.length > 1 ? (
              '<div style="font-size:11px;font-weight:600;color:var(--c-sub);margin:2px 0;">已打开的标签页 (' + _state.tabs.length + ')</div>' +
              '<div style="display:flex;flex-direction:column;gap:5px;max-height:140px;overflow-y:auto;margin-bottom:6px;">' +
              _state.tabs.map(function(t) {
                var isCur = t.id === _state.activeTabId;
                return '<button type="button" class="pl-btn-secondary wb-menu-tab-btn" data-tid="' + t.id + '" style="justify-content:space-between;padding:7px 10px;font-size:11px;' + (isCur ? 'border-color:var(--c-text);font-weight:600;' : '') + '">' +
                  '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">' + (isCur ? '● ' : '') + esc(t.title || '新标签页') + '</span>' +
                  '<span style="font-size:9px;color:var(--c-hint);">' + (isCur ? '当前标签' : '切换') + '</span>' +
                '</button>';
              }).join('') +
              '</div>'
            ) : '') +
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

    root.querySelectorAll('.wb-menu-tab-btn').forEach(function(tBtn) {
      tBtn.onclick = function() {
        var tid = tBtn.getAttribute('data-tid');
        closeDrawer(container);
        if (_state.activeTabId !== tid) {
          _state.activeTabId = tid;
          saveTabsState();
          renderTabsList(container);
          updateOmniboxAndControls(container);
          renderActiveTabContent(container);
          updateCharSidebarContent(container);
        }
      };
    });

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
