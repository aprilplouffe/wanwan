// ai-workspace.js — 知屿 (弯弯机 AI 工作空间) 第四阶段：真实流式 AI 对话、历史持久化与预设/模型切换控制器
(function(global) {
  'use strict';

  var PAGE_ID = 'ai-workspace-page';

  // 最小化图标 SVG（极简黑灰线性风格）
  var SVG_MENU_LINES =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<line x1="4" y1="8.5" x2="20" y2="8.5"></line>' +
      '<line x1="4" y1="15.5" x2="14.5" y2="15.5"></line>' +
    '</svg>';

  var SVG_VOICE_WAVES =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<line x1="5" y1="10" x2="5" y2="14"></line>' +
      '<line x1="9.5" y1="6.5" x2="9.5" y2="17.5"></line>' +
      '<line x1="14.5" y1="8.5" x2="14.5" y2="15.5"></line>' +
      '<line x1="19" y1="10.5" x2="19" y2="13.5"></line>' +
    '</svg>';

  var SVG_ZHIYU_MARK =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12 2.5C12.7 7.6 16.4 11.3 21.5 12C16.4 12.7 12.7 16.4 12 21.5C11.3 16.4 7.6 12.7 2.5 12C7.6 11.3 11.3 7.6 12 2.5Z"></path>' +
    '</svg>';

  var _state = {
    sidebarOpen: false,
    attachOpen: false,
    moreNavOpen: false,
    deepThinkEnabled: false,
    searchQuery: '',
    chats: [],
    projects: [],
    projectsSectionCollapsed: false,
    expandedProjects: {},
    projectVisibleLimit: {},
    activeProjectHomeId: null,
    activeProjectHomeTab: 'chats',
    activeProjectHomeDocSort: 'time_desc',
    activeChatId: null,
    activeChat: null,
    messages: [],
    selectedModel: '',
    activePreset: null,
    explicitNoPreset: false,
    presets: [],
    worldbooks: [],
    effectiveWorldBooks: [],
    effectiveWorldBooksInfo: null,
    personalization: null,
    effectiveApi: null,
    isStreaming: false,
    abortController: null,
    favorites: [],
    quotedMessage: null,
    translatingMap: {},
    activeTranslationLangMap: {},
    userProfile: {
      name: '我',
      avatar: 'img/ava-00.jpg',
      bio: '本地工作空间'
    },
    appearance: {
      mode: 'system',
      accent: 'pink'
    },
    general: {
      enterToSend: true,
      autoUseDefaultPreset: true,
      showCharCount: true
    },
    defaultPreset: null
  };


  var SIDEBAR_PROJ_UI_KEY = 'wanwan_aiw_sidebar_proj_ui_v1';
  var PROJ_HOME_UI_KEY = 'wanwan_aiw_project_home_ui_v1';

  function loadProjectHomeUiState() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(PROJ_HOME_UI_KEY) : null;
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.tab === 'chats' || parsed.tab === 'sources') {
          _state.activeProjectHomeTab = parsed.tab;
        }
        if (parsed.docSort) {
          _state.activeProjectHomeDocSort = String(parsed.docSort);
        }
        return parsed.projectId ? String(parsed.projectId) : '';
      }
    } catch (_) {}
    return null;
  }

  function saveProjectHomeUiState() {
    try {
      if (!global.localStorage) return;
      global.localStorage.setItem(PROJ_HOME_UI_KEY, JSON.stringify({
        projectId: _state.activeProjectHomeId || '',
        tab: _state.activeProjectHomeTab || 'chats',
        docSort: _state.activeProjectHomeDocSort || 'time_desc'
      }));
    } catch (_) {}
  }

  function loadSidebarProjUiState() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(SIDEBAR_PROJ_UI_KEY) : null;
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        _state.projectsSectionCollapsed = !!parsed.collapsed;
        if (parsed.expanded && typeof parsed.expanded === 'object') {
          _state.expandedProjects = parsed.expanded;
        }
      }
    } catch (_) {}
  }

  function saveSidebarProjUiState() {
    try {
      if (!global.localStorage) return;
      global.localStorage.setItem(SIDEBAR_PROJ_UI_KEY, JSON.stringify({
        collapsed: !!_state.projectsSectionCollapsed,
        expanded: _state.expandedProjects || {}
      }));
    } catch (_) {}
  }

  var _mediaQuery = null;
  var _mediaListener = null;

  function S() {
    return global.AiWorkspaceStorage;
  }

  function AI() {
    return global.AiWorkspaceAI;
  }

  function M() {
    return global.AiWorkspaceMemory;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function notifyToast(msg) {
    if (typeof global.toast === 'function') {
      global.toast(msg);
    } else if (typeof global.showToast === 'function') {
      global.showToast(msg);
    }
  }

  async function copyTextSafely(text) {
    var content = String(text == null ? '' : text);
    if (!content) {
      notifyToast('当前没有可复制的内容');
      return false;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
        notifyToast('已复制到剪贴板');
        return true;
      }
    } catch (_) {}

    try {
      var ta = document.createElement('textarea');
      ta.value = content;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      if (ok) {
        notifyToast('已复制到剪贴板');
        return true;
      }
    } catch (_) {}

    notifyToast('复制失败，请手动长按选择复制');
    return false;
  }

  // ===== 安全 Markdown 与代码块渲染器（防 XSS，支持长文本与流式未闭合代码块） =====
  function sanitizeUrl(rawUrl) {
    var url = String(rawUrl || '').trim();
    if (/^https?:\/\//i.test(url)) return url;
    return '';
  }

  function renderInlineMarkdown(escapedText) {
    var codeTokens = [];
    var text = escapedText.replace(/`([^`\n]+)`/g, function(_, code) {
      var token = '@@AIW_INLINECODE_' + codeTokens.length + '@@';
      codeTokens.push('<code class="aiw-md-inline-code">' + code + '</code>');
      return token;
    });

    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function(_, label, rawHref) {
      var unescapedHref = rawHref.replace(/&amp;/g, '&');
      var safeHref = sanitizeUrl(unescapedHref);
      if (!safeHref) return label;
      return '<a class="aiw-md-link" href="' + escapeHtml(safeHref) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });

    text = text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

    text = text.replace(/@@AIW_INLINECODE_(\d+)@@/g, function(_, idx) {
      return codeTokens[Number(idx)] || '';
    });
    return text;
  }

  function buildCodeBlockHtml(lang, rawCode, blockIndex) {
    var cleanLang = String(lang || '').trim() || 'code';
    var encodedCode = escapeHtml(rawCode);
    return (
      '<div class="aiw-code-block" data-code-idx="' + blockIndex + '">' +
        '<div class="aiw-code-head">' +
          '<span class="aiw-code-lang">' + escapeHtml(cleanLang) + '</span>' +
          '<button type="button" class="aiw-code-copy-btn" data-copy-code="' + escapeHtml(encodeURIComponent(rawCode)) + '">' +
            '<i class="fa-regular fa-copy"></i> 复制' +
          '</button>' +
        '</div>' +
        '<pre class="aiw-code-pre"><code>' + encodedCode + '</code></pre>' +
      '</div>'
    );
  }

  function renderPlainMarkdownBlock(textBlock) {
    var lines = String(textBlock || '').split(/\r?\n/);
    var out = [];
    var i = 0;

    function isTableSeparator(line) {
      return /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(line);
    }

    function splitTableCells(line) {
      return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function(c) {
        return renderInlineMarkdown(escapeHtml(c.trim()));
      });
    }

    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        out.push('<hr class="aiw-md-hr">');
        i++;
        continue;
      }

      var hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (hMatch) {
        var lvl = hMatch[1].length;
        out.push('<h' + lvl + ' class="aiw-md-h' + lvl + '">' + renderInlineMarkdown(escapeHtml(hMatch[2])) + '</h' + lvl + '>');
        i++;
        continue;
      }

      if (trimmed.charAt(0) === '>' && (trimmed.length === 1 || trimmed.charAt(1) === ' ')) {
        var quoteLines = [];
        while (i < lines.length && lines[i].trim().charAt(0) === '>') {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        out.push('<blockquote class="aiw-md-quote">' + renderInlineMarkdown(escapeHtml(quoteLines.join('\n'))).replace(/\n/g, '<br>') + '</blockquote>');
        continue;
      }

      // GFM Table
      if (trimmed.indexOf('|') !== -1 && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        var headers = splitTableCells(lines[i]);
        i += 2;
        var rowsHtml = [];
        while (i < lines.length && lines[i].trim().indexOf('|') !== -1) {
          var cells = splitTableCells(lines[i]);
          rowsHtml.push('<tr>' + cells.map(function(c) { return '<td>' + c + '</td>'; }).join('') + '</tr>');
          i++;
        }
        out.push(
          '<div class="aiw-md-table-wrap"><table class="aiw-md-table"><thead><tr>' +
          headers.map(function(h) { return '<th>' + h + '</th>'; }).join('') +
          '</tr></thead><tbody>' + rowsHtml.join('') + '</tbody></table></div>'
        );
        continue;
      }

      // Unordered list
      if (/^[-*+]\s+/.test(trimmed)) {
        var ulItems = [];
        while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
          ulItems.push('<li>' + renderInlineMarkdown(escapeHtml(lines[i].trim().replace(/^[-*+]\s+/, ''))) + '</li>');
          i++;
        }
        out.push('<ul class="aiw-md-list">' + ulItems.join('') + '</ul>');
        continue;
      }

      // Ordered list
      if (/^\d+\.\s+/.test(trimmed)) {
        var olItems = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          olItems.push('<li>' + renderInlineMarkdown(escapeHtml(lines[i].trim().replace(/^\d+\.\s+/, ''))) + '</li>');
          i++;
        }
        out.push('<ol class="aiw-md-list">' + olItems.join('') + '</ol>');
        continue;
      }

      // Paragraph
      var paraLines = [];
      while (i < lines.length) {
        var cur = lines[i];
        var ct = cur.trim();
        if (!ct || /^(#{1,4})\s+/.test(ct) || /^(?:-{3,}|\*{3,}|_{3,})$/.test(ct) || ct.charAt(0) === '>' || /^[-*+]\s+/.test(ct) || /^\d+\.\s+/.test(ct)) {
          break;
        }
        if (ct.indexOf('|') !== -1 && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
          break;
        }
        paraLines.push(cur);
        i++;
      }
      if (paraLines.length) {
        out.push('<p class="aiw-md-p">' + renderInlineMarkdown(escapeHtml(paraLines.join('\n'))).replace(/\n/g, '<br>') + '</p>');
      }
    }

    return out.join('');
  }

  function renderMarkdownHtml(markdown) {
    var src = String(markdown == null ? '' : markdown).replace(/\r\n/g, '\n');
    if (!src.trim()) return '';

    var parts = [];
    var codeIndex = 0;
    var fenceRegex = /```([a-zA-Z0-9_+#.-]*)\n([\s\S]*?)```/g;
    var lastIndex = 0;
    var match;

    while ((match = fenceRegex.exec(src)) !== null) {
      if (match.index > lastIndex) {
        parts.push(renderPlainMarkdownBlock(src.slice(lastIndex, match.index)));
      }
      parts.push(buildCodeBlockHtml(match[1], match[2].replace(/\n$/, ''), codeIndex++));
      lastIndex = fenceRegex.lastIndex;
    }

    var tail = src.slice(lastIndex);
    if (tail) {
      // 支持流式输出过程中尚未闭合的代码块
      var openFence = tail.match(/^([\s\S]*?)```([a-zA-Z0-9_+#.-]*)\n([\s\S]*)$/);
      if (openFence) {
        if (openFence[1]) parts.push(renderPlainMarkdownBlock(openFence[1]));
        parts.push(buildCodeBlockHtml(openFence[2], openFence[3], codeIndex++));
      } else {
        parts.push(renderPlainMarkdownBlock(tail));
      }
    }

    return '<div class="aiw-md">' + parts.join('') + '</div>';
  }

  // ===== 外观与主题兼容 =====
  function resolveEffectiveDarkMode(mode) {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    var mediaDark = !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    var rootDark = !!(document.documentElement && document.documentElement.classList.contains('theme-dark'));
    return mediaDark || rootDark;
  }

  function applyWorkspaceAppearance(page, appearance) {
    if (!page) return;
    var cfg = appearance || _state.appearance || { mode: 'system', accent: 'pink' };
    var isDark = resolveEffectiveDarkMode(cfg.mode || 'system');
    page.classList.toggle('aiw-theme-dark', isDark);
    page.classList.toggle('aiw-theme-light', !isDark);
    page.setAttribute('data-aiw-mode', cfg.mode || 'system');
    page.setAttribute('data-aiw-accent', cfg.accent || 'pink');
  }

  function detachAppearanceMediaListener() {
    if (_mediaQuery && _mediaListener) {
      try {
        if (_mediaQuery.removeEventListener) _mediaQuery.removeEventListener('change', _mediaListener);
        else if (_mediaQuery.removeListener) _mediaQuery.removeListener(_mediaListener);
      } catch (_) {}
    }
    _mediaQuery = null;
    _mediaListener = null;
  }

  function attachAppearanceMediaListener(page) {
    detachAppearanceMediaListener();
    if (!global.matchMedia) return;
    _mediaQuery = global.matchMedia('(prefers-color-scheme: dark)');
    _mediaListener = function() {
      var curPage = document.getElementById(PAGE_ID);
      if (curPage && _state.appearance && _state.appearance.mode === 'system') {
        applyWorkspaceAppearance(curPage, _state.appearance);
      }
    };
    if (_mediaQuery.addEventListener) _mediaQuery.addEventListener('change', _mediaListener);
    else if (_mediaQuery.addListener) _mediaQuery.addListener(_mediaListener);
  }

  function resolveEffectivePresetForState() {
    if (_state.activeChat) {
      if (_state.activeChat.presetSnapshot) {
        return _state.activeChat.presetSnapshot;
      }
      if (_state.activeChat.presetId) {
        var matched = (_state.presets || []).find(function(p) { return p.id === _state.activeChat.presetId; });
        if (matched) return matched;
      }
      return null;
    }
    if (_state.explicitNoPreset) {
      return null;
    }
    if (_state.activePreset) return _state.activePreset;
    if (_state.general && _state.general.autoUseDefaultPreset === false) {
      return null;
    }
    return _state.defaultPreset || (_state.presets && _state.presets[0]) || null;
  }

  function resolveLatestPresetForWorldBooks() {
    var current = resolveEffectivePresetForState();
    if (!current) return null;
    if (current.id && Array.isArray(_state.presets) && _state.presets.length) {
      var latest = _state.presets.find(function(p) { return p && p.id === current.id; });
      if (latest) return latest;
    }
    return current;
  }

  function syncEffectiveWorldBooksForState() {
    var preset = resolveLatestPresetForWorldBooks();
    var allBooks = Array.isArray(_state.worldbooks) ? _state.worldbooks : [];
    var info;
    if (S() && typeof S().resolveEffectiveWorldBooksFromData === 'function') {
      info = S().resolveEffectiveWorldBooksFromData(preset, allBooks);
    } else {
      info = { books: [], globalBooks: [], presetBooks: [], globalCount: 0, presetCount: 0, effectiveCount: 0 };
    }
    _state.effectiveWorldBooksInfo = info;
    _state.effectiveWorldBooks = info.books || [];
    return info;
  }

  async function refreshEffectiveApi() {
    if (!AI() || typeof AI().resolveEffectiveApiConfig !== 'function') {
      _state.effectiveApi = null;
      return null;
    }
    var chatModel = _state.activeChat && _state.activeChat.model ? _state.activeChat.model : '';
    var resolved = await AI().resolveEffectiveApiConfig({
      overrideModel: _state.selectedModel || '',
      chatModel: chatModel
    });
    _state.effectiveApi = resolved;
    return resolved;
  }

  async function loadWorkspaceState() {
    if (S()) {
      try {
        var results = await Promise.all([
          S().getProfile(),
          S().getAppearance(),
          S().getGeneralSettings(),
          S().getPersonalization(),
          S().listPresets(),
          S().getSelectedModel(),
          S().listChats(),
          typeof S().listWorldBooks === 'function' ? S().listWorldBooks() : Promise.resolve([]),
          typeof S().listFavorites === 'function' ? S().listFavorites() : Promise.resolve([]),
          typeof S().listProjects === 'function' ? S().listProjects() : Promise.resolve([])
        ]);
        _state.userProfile = results[0];
        _state.appearance = results[1];
        _state.general = results[2];
        _state.personalization = results[3];
        _state.presets = results[4] || [];
        _state.selectedModel = results[5] || '';
        _state.chats = results[6] || [];
        _state.worldbooks = results[7] || [];
        _state.favorites = results[8] || [];
        _state.projects = results[9] || [];
        loadSidebarProjUiState();
        _state.defaultPreset = _state.presets.find(function(p) { return p.isDefault; }) || _state.presets[0] || null;
        if (!_state.activePreset && (!_state.general || _state.general.autoUseDefaultPreset !== false)) {
          _state.activePreset = _state.defaultPreset;
        }
        syncEffectiveWorldBooksForState();
        await refreshEffectiveApi();
        return;
      } catch (_) {}
    }
    try {
      if (!global.db || !global.db.characters) return;
      var op = function() {
        return global.db.characters.where('type').equals('user').first();
      };
      var user = typeof global.runWanWanDBRead === 'function'
        ? await global.runWanWanDBRead(op)
        : await op();
      if (user) {
        _state.userProfile = {
          name: String(user.name || user.nick || '我'),
          avatar: String(user.avatar || 'img/ava-00.jpg'),
          bio: '本地工作空间'
        };
      }
    } catch (_) {}
  }

  async function syncSidebarMemoryBadge(page) {
    if (!page || !S() || typeof S().listMemories !== 'function') return;
    var badgeEl = page.querySelector('#aiw-nav-memory-count');
    if (!badgeEl) return;
    try {
      var list = await S().listMemories();
      badgeEl.textContent = list.length ? (list.length + ' 条') : '';
    } catch (_) {}
  }

  function syncSidebarAccountDom(page) {
    if (!page) return;
    var avatarEl = page.querySelector('#aiw-account-avatar');
    var nameEl = page.querySelector('#aiw-account-name');
    var subEl = page.querySelector('#aiw-account-sub');
    if (avatarEl) avatarEl.src = _state.userProfile.avatar || 'img/ava-00.jpg';
    if (nameEl) nameEl.textContent = _state.userProfile.name || '我';
    if (subEl) subEl.textContent = (_state.userProfile.bio || '本地工作空间') + ' · 设置中心';
    syncSidebarMemoryBadge(page);
  }

  function buildPageHtml() {
    return (
      '<div class="aiw-topbar">' +
        '<div class="aiw-topbar-left">' +
          '<button type="button" class="aiw-circle-btn" id="aiw-sidebar-btn" title="打开侧边栏" aria-label="打开侧边栏">' +
            SVG_MENU_LINES +
          '</button>' +
        '</div>' +
        '<div class="aiw-topbar-center">' +
          '<span class="aiw-brand-pill" id="aiw-topbar-title">知屿</span>' +
        '</div>' +
        '<div class="aiw-topbar-right">' +
          '<button type="button" class="aiw-circle-btn" id="aiw-new-chat-btn" title="新对话" aria-label="新对话">' +
            '<i class="fa-regular fa-pen-to-square"></i>' +
          '</button>' +
          '<button type="button" class="aiw-circle-btn" id="aiw-close-btn" title="返回桌面" aria-label="返回桌面">' +
            '<i class="fa-solid fa-xmark"></i>' +
          '</button>' +
        '</div>' +
      '</div>' +

      '<div class="aiw-context-strip" id="aiw-context-strip">' +
        '<button type="button" class="aiw-ctx-pill aiw-ctx-proj-pill" id="aiw-ctx-project-btn" title="返回项目主页" hidden>' +
          '<i class="fa-regular fa-folder"></i>' +
          '<span class="aiw-ctx-label" id="aiw-ctx-project-label">项目</span>' +
        '</button>' +
        '<button type="button" class="aiw-ctx-pill" id="aiw-ctx-model-btn" title="切换模型">' +
          '<span class="aiw-ctx-dot" id="aiw-ctx-model-dot"></span>' +
          '<span class="aiw-ctx-label" id="aiw-ctx-model-label">加载模型...</span>' +
          '<i class="fa-solid fa-angle-down"></i>' +
        '</button>' +
        '<button type="button" class="aiw-ctx-pill" id="aiw-ctx-preset-btn" title="切换预设角色">' +
          '<i class="fa-solid fa-wand-magic-sparkles"></i>' +
          '<span class="aiw-ctx-label" id="aiw-ctx-preset-label">默认预设</span>' +
          '<i class="fa-solid fa-angle-down"></i>' +
        '</button>' +
      '</div>' +

      '<div class="aiw-main" id="aiw-main-scroll">' +
        '<div class="aiw-empty-stage" id="aiw-empty-stage">' +
          '<div class="aiw-empty-mark">' + SVG_ZHIYU_MARK + '</div>' +
          '<div class="aiw-empty-title" id="aiw-empty-title">有什么可以帮你的？</div>' +
          '<div class="aiw-empty-sub" id="aiw-empty-sub"></div>' +
          '<button type="button" class="aiw-empty-api-cta" id="aiw-empty-api-cta" hidden>' +
            '<i class="fa-solid fa-plug"></i> 配置知屿专属 API' +
          '</button>' +
        '</div>' +
        '<div class="aiw-project-home-stage" id="aiw-project-home-stage" hidden></div>' +
        '<div class="aiw-message-list" id="aiw-message-list" hidden></div>' +
      '</div>' +

      '<div class="aiw-composer-wrap">' +
        '<div class="aiw-quote-bar" id="aiw-quote-bar" hidden>' +
          '<div class="aiw-quote-bar-body">' +
            '<div class="aiw-quote-bar-role" id="aiw-quote-bar-role">引用消息</div>' +
            '<div class="aiw-quote-bar-text" id="aiw-quote-bar-text"></div>' +
          '</div>' +
          '<button type="button" class="aiw-quote-bar-close" id="aiw-quote-clear" aria-label="取消引用" title="取消引用">' +
            '<i class="fa-solid fa-xmark"></i>' +
          '</button>' +
        '</div>' +
        '<div class="aiw-mode-chip-bar" id="aiw-mode-chip-bar" hidden>' +
          '<button type="button" class="aiw-mode-chip" id="aiw-chip-deep-think" title="点击取消深入思考">' +
            '<i class="fa-regular fa-lightbulb"></i>' +
            '<span>深入思考</span>' +
            '<i class="fa-solid fa-xmark"></i>' +
          '</button>' +
        '</div>' +
        '<div class="aiw-composer">' +
          '<button type="button" class="aiw-attach-btn" id="aiw-attach-btn" title="添加附件或能力" aria-label="打开附件菜单">' +
            '<i class="fa-solid fa-plus"></i>' +
          '</button>' +
          '<textarea class="aiw-input" id="aiw-input" rows="1" placeholder="问点什么..." aria-label="输入消息"></textarea>' +
          '<div class="aiw-composer-actions">' +
            '<button type="button" class="aiw-mic-btn" id="aiw-mic-btn" title="语音输入" aria-label="语音输入">' +
              '<i class="fa-solid fa-microphone"></i>' +
            '</button>' +
            '<button type="button" class="aiw-send-btn" id="aiw-send-btn" title="发送" aria-label="发送" hidden>' +
              '<i class="fa-solid fa-arrow-up"></i>' +
            '</button>' +
            '<button type="button" class="aiw-stop-btn" id="aiw-stop-btn" title="停止生成" aria-label="停止生成" hidden>' +
              '<i class="fa-solid fa-stop"></i>' +
            '</button>' +
            '<button type="button" class="aiw-voice-btn" id="aiw-voice-btn" title="语音通话" aria-label="语音对话">' +
              SVG_VOICE_WAVES +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="aiw-sidebar-backdrop" id="aiw-sidebar-backdrop"></div>' +
      '<aside class="aiw-sidebar" id="aiw-sidebar" aria-label="工作空间侧边栏">' +
        '<div class="aiw-sidebar-head">' +
          '<div class="aiw-search-box">' +
            '<i class="fa-solid fa-magnifying-glass"></i>' +
            '<input type="search" class="aiw-search-input" id="aiw-search-input" placeholder="搜索聊天" aria-label="搜索聊天">' +
          '</div>' +
          '<button type="button" class="aiw-sidebar-close-btn" id="aiw-sidebar-close" title="关闭侧边栏" aria-label="关闭侧边栏">' +
            '<i class="fa-solid fa-xmark"></i>' +
          '</button>' +
        '</div>' +

        '<div class="aiw-sidebar-scroll" id="aiw-sidebar-scroll">' +
          '<div class="aiw-nav-group">' +
            '<button type="button" class="aiw-nav-item" data-nav="image">' +
              '<span class="aiw-nav-item-icon"><i class="fa-regular fa-image"></i></span>' +
              '<span class="aiw-nav-item-label">图像</span>' +
            '</button>' +
            '<button type="button" class="aiw-nav-item" data-nav="library">' +
              '<span class="aiw-nav-item-icon"><i class="fa-regular fa-folder-open"></i></span>' +
              '<span class="aiw-nav-item-label">资料库</span>' +
            '</button>' +

            '<button type="button" class="aiw-nav-item" data-nav="remote">' +
              '<span class="aiw-nav-item-icon"><i class="fa-solid fa-globe"></i></span>' +
              '<span class="aiw-nav-item-label">Remote</span>' +
            '</button>' +
            '<button type="button" class="aiw-nav-item" data-nav="tasks">' +
              '<span class="aiw-nav-item-icon"><i class="fa-regular fa-clock"></i></span>' +
              '<span class="aiw-nav-item-label">定时任务</span>' +
            '</button>' +
            '<button type="button" class="aiw-nav-item" id="aiw-nav-more-btn">' +
              '<span class="aiw-nav-item-icon"><i class="fa-solid fa-ellipsis"></i></span>' +
              '<span class="aiw-nav-item-label">查看更多</span>' +
              '<span class="aiw-nav-item-tag" id="aiw-nav-more-chevron"><i class="fa-solid fa-angle-down"></i></span>' +
            '</button>' +
            '<div class="aiw-more-panel" id="aiw-more-panel" hidden>' +
              '<button type="button" class="aiw-nav-item" data-nav="plugins">' +
                '<span class="aiw-nav-item-icon"><i class="fa-solid fa-puzzle-piece"></i></span>' +
                '<span class="aiw-nav-item-label">插件扩展</span>' +
              '</button>' +
              '<button type="button" class="aiw-nav-item" data-nav="memory">' +
                '<span class="aiw-nav-item-icon"><i class="fa-regular fa-bookmark"></i></span>' +
                '<span class="aiw-nav-item-label">记忆空间</span>' +
                '<span class="aiw-nav-item-tag" id="aiw-nav-memory-count"></span>' +
              '</button>' +
            '</div>' +
          '</div>' +

          '<div class="aiw-chat-section aiw-sb-projects-section" id="aiw-sb-projects-section">' +
            '<div class="aiw-sb-projects-header">' +
              '<button type="button" class="aiw-sb-projects-toggle" id="aiw-sb-projects-toggle" aria-expanded="true">' +
                '<span>项目</span>' +
                '<i class="fa-solid fa-angle-down aiw-sb-projects-chevron" id="aiw-sb-projects-chevron"></i>' +
              '</button>' +
              '<button type="button" class="aiw-sb-proj-head-btn" id="aiw-sb-projects-manage" title="我的项目 / 管理项目">' +
                '<i class="fa-solid fa-folder-plus"></i>' +
              '</button>' +
            '</div>' +
            '<div class="aiw-sb-projects-list" id="aiw-sb-projects-list"></div>' +
          '</div>' +

          '<div class="aiw-chat-section" id="aiw-pinned-section">' +
            '<div class="aiw-chat-section-title">置顶聊天</div>' +
            '<div class="aiw-chat-list" id="aiw-pinned-list"></div>' +
          '</div>' +

          '<div class="aiw-chat-section" id="aiw-recent-section">' +
            '<div class="aiw-chat-section-title">最近聊天</div>' +
            '<div class="aiw-chat-list" id="aiw-recent-list"></div>' +
          '</div>' +
        '</div>' +

        '<div class="aiw-sidebar-foot">' +
          '<button type="button" class="aiw-account-btn" id="aiw-account-btn">' +
            '<img class="aiw-account-avatar" id="aiw-account-avatar" src="' + escapeHtml(_state.userProfile.avatar) + '" alt="用户头像">' +
            '<div class="aiw-account-info">' +
              '<div class="aiw-account-name" id="aiw-account-name">' + escapeHtml(_state.userProfile.name) + '</div>' +
              '<div class="aiw-account-sub" id="aiw-account-sub">' + escapeHtml((_state.userProfile.bio || '本地工作空间') + ' · 设置中心') + '</div>' +
            '</div>' +
            '<span class="aiw-account-chevron"><i class="fa-solid fa-gear"></i></span>' +
          '</button>' +
        '</div>' +
      '</aside>' +

      '<div class="aiw-attach-backdrop" id="aiw-attach-backdrop"></div>' +
      '<div class="aiw-attach-sheet" id="aiw-attach-sheet" role="dialog" aria-modal="true" aria-label="附件与工具菜单">' +
        '<div class="aiw-sheet-handle"></div>' +
        '<div class="aiw-attach-grid">' +
          '<button type="button" class="aiw-attach-tile" data-attach="camera">' +
            '<i class="fa-solid fa-camera"></i>' +
            '<span>拍照</span>' +
          '</button>' +
          '<button type="button" class="aiw-attach-tile" data-attach="photos">' +
            '<i class="fa-regular fa-image"></i>' +
            '<span>照片</span>' +
          '</button>' +
          '<button type="button" class="aiw-attach-tile" data-attach="files">' +
            '<i class="fa-regular fa-file-lines"></i>' +
            '<span>文件</span>' +
          '</button>' +
        '</div>' +
        '<div class="aiw-attach-rows">' +
          '<button type="button" class="aiw-attach-row" data-attach="plugins">' +
            '<span class="aiw-attach-row-icon"><i class="fa-solid fa-puzzle-piece"></i></span>' +
            '<div class="aiw-attach-row-body">' +
              '<div class="aiw-attach-row-title">插件</div>' +
              '<div class="aiw-attach-row-desc">扩展工具与外部连接能力</div>' +
            '</div>' +
            '<span class="aiw-attach-row-state">未接入</span>' +
          '</button>' +
          '<button type="button" class="aiw-attach-row" id="aiw-attach-deep-think" data-attach="deepThink">' +
            '<span class="aiw-attach-row-icon"><i class="fa-regular fa-lightbulb"></i></span>' +
            '<div class="aiw-attach-row-body">' +
              '<div class="aiw-attach-row-title">深入思考</div>' +
              '<div class="aiw-attach-row-desc">在推理复杂问题时加强分步思考提示</div>' +
            '</div>' +
            '<span class="aiw-attach-row-state" id="aiw-deep-think-state">关闭</span>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function closeInlineModal(page) {
    if (!page) return;
    var existing = page.querySelector('.aiw-ws-modal-backdrop');
    if (existing) existing.remove();
  }

  function showInlineModal(page, title, bodyHtml, footerHtml) {
    if (!page) return null;
    closeInlineModal(page);
    var wrap = document.createElement('div');
    wrap.className = 'aiw-ws-modal-backdrop';
    wrap.innerHTML =
      '<div class="aiw-ws-modal" role="dialog" aria-modal="true">' +
        '<div class="aiw-ws-modal-head">' +
          '<div class="aiw-ws-modal-title">' + escapeHtml(title) + '</div>' +
          '<button type="button" class="aiw-ws-modal-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="aiw-ws-modal-body">' + bodyHtml + '</div>' +
        (footerHtml ? '<div class="aiw-ws-modal-foot">' + footerHtml + '</div>' : '') +
      '</div>';
    page.appendChild(wrap);
    requestAnimationFrame(function() { wrap.classList.add('open'); });
    wrap.addEventListener('click', function(e) {
      if (e.target === wrap) closeInlineModal(page);
    });
    var closeBtn = wrap.querySelector('.aiw-ws-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { closeInlineModal(page); });
    return wrap;
  }

  function openSettingsView(page, initialView) {
    if (!global.AiWorkspaceSettings || typeof global.AiWorkspaceSettings.openSettingsCenter !== 'function') {
      notifyToast('设置中心模块加载中');
      return;
    }
    global.AiWorkspaceSettings.openSettingsCenter(page, initialView || 'home', async function(nextState) {
      if (nextState) {
        if (nextState.profile) _state.userProfile = nextState.profile;
        if (nextState.appearance) _state.appearance = nextState.appearance;
        if (nextState.general) _state.general = nextState.general;
        if (nextState.personalization) _state.personalization = nextState.personalization;
        if (Array.isArray(nextState.presets)) {
          _state.presets = nextState.presets;
          _state.defaultPreset = nextState.presets.find(function(p) { return p.isDefault; }) || nextState.presets[0] || null;
          if (_state.activePreset && _state.activePreset.id) {
            var refreshedActive = nextState.presets.find(function(p) { return p && p.id === _state.activePreset.id; });
            _state.activePreset = refreshedActive || null;
          }
          if (!_state.activeChat && !_state.explicitNoPreset && !_state.activePreset) {
            _state.activePreset = (!_state.general || _state.general.autoUseDefaultPreset !== false)
              ? _state.defaultPreset
              : null;
          }
        }
        if (Array.isArray(nextState.worldbooks)) {
          _state.worldbooks = nextState.worldbooks;
        }
        if (Array.isArray(nextState.chats)) {
          _state.chats = nextState.chats;
        }
        if (Array.isArray(nextState.favorites)) {
          _state.favorites = nextState.favorites;
        }
      }
      if (S()) {
        _state.selectedModel = await S().getSelectedModel();
        if (!nextState || !Array.isArray(nextState.worldbooks)) {
          if (typeof S().listWorldBooks === 'function') {
            _state.worldbooks = await S().listWorldBooks();
          }
        }
        if (!nextState || !Array.isArray(nextState.chats)) {
          if (typeof S().listChats === 'function') {
            _state.chats = await S().listChats();
          }
        }
        if (!nextState || !Array.isArray(nextState.favorites)) {
          if (typeof S().listFavorites === 'function') {
            _state.favorites = await S().listFavorites();
          }
        }
        if (_state.activeChatId) {
          var refreshedActiveChat = typeof S().getChat === 'function' ? await S().getChat(_state.activeChatId) : null;
          if (refreshedActiveChat) {
            _state.activeChat = refreshedActiveChat;
            _state.messages = Array.isArray(refreshedActiveChat.messages) ? refreshedActiveChat.messages.slice() : [];
            if (refreshedActiveChat.presetId || refreshedActiveChat.presetSnapshot) {
              _state.explicitNoPreset = false;
              _state.activePreset = (_state.presets || []).find(function(p) { return p && p.id === refreshedActiveChat.presetId; }) || refreshedActiveChat.presetSnapshot || null;
            }
          } else {
            _state.activeChatId = null;
            _state.activeChat = null;
            _state.messages = [];
            _state.explicitNoPreset = false;
            _state.activePreset = (!_state.general || _state.general.autoUseDefaultPreset !== false)
              ? _state.defaultPreset
              : null;
          }
        }
      }
      await refreshEffectiveApi();
      applyWorkspaceAppearance(page, _state.appearance);
      syncSidebarAccountDom(page);
      syncSidebarMemoryBadge(page);
      renderSidebarProjects(page);
    renderSidebarChats(page);
      syncContextStrip(page);
      updateMainStage(page);
    }, {
      activeChatId: _state.activeChat ? _state.activeChat.id : '',
      onNavigateToChatMessage: async function(target) {
        await navigateToChatMessage(page, target);
      }
    });
  }

  async function navigateToChatMessage(page, target) {
    if (!page || !target || !S()) return;
    if (_state.isStreaming) {
      notifyToast('请先停止当前生成后再跳转');
      return;
    }
    var chatId = String(target.chatId || '').trim();
    var msgId = String(target.messageId || '').trim();
    if (!chatId) {
      notifyToast('该收藏缺少来源对话信息');
      return;
    }
    var loaded = typeof S().getChat === 'function' ? await S().getChat(chatId) : null;
    if (!loaded) {
      notifyToast('原对话已被删除，暂无法跳转定位');
      return;
    }

    if (global.AiWorkspaceSettings && typeof global.AiWorkspaceSettings.closeSettingsCenter === 'function') {
      global.AiWorkspaceSettings.closeSettingsCenter();
    }

    _state.activeChatId = loaded.id;
    _state.activeChat = loaded;
    _state.messages = Array.isArray(loaded.messages) ? loaded.messages.slice() : [];
    _state.quotedMessage = null;
    syncQuoteBarUI(page);
    if (loaded.presetId || loaded.presetSnapshot) {
      _state.explicitNoPreset = false;
      _state.activePreset = (_state.presets || []).find(function(p) { return p && p.id === loaded.presetId; }) || loaded.presetSnapshot || null;
    } else {
      _state.explicitNoPreset = true;
      _state.activePreset = null;
    }
    if (loaded.model) {
      _state.selectedModel = loaded.model;
      await S().saveSelectedModel(loaded.model);
    }
    await refreshEffectiveApi();
    setSidebarOpen(page, false);
    syncContextStrip(page);
    updateMainStage(page, { preserveScroll: true });
    renderSidebarProjects(page);
    renderSidebarChats(page);

    if (msgId) {
      var targetRow = Array.from(page.querySelectorAll('.aiw-msg-row')).find(function(el) {
        return el.getAttribute('data-msg-id') === msgId;
      });
      if (targetRow) {
        requestAnimationFrame(function() {
          try {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch (_) {
            targetRow.scrollIntoView(true);
          }
          targetRow.classList.remove('aiw-msg-highlight');
          void targetRow.offsetWidth;
          targetRow.classList.add('aiw-msg-highlight');
          setTimeout(function() {
            if (targetRow) targetRow.classList.remove('aiw-msg-highlight');
          }, 2400);
        });
      } else {
        notifyToast('原消息已从该对话中移除，已为您打开所在对话');
      }
    }
  }

  function syncContextStrip(page) {
    if (!page) return;
    var projBtn = page.querySelector('#aiw-ctx-project-btn');
    var projLabel = page.querySelector('#aiw-ctx-project-label');
    if (projBtn && projLabel) {
      var chatProjId = (_state.activeChat && _state.activeChat.projectId) ? String(_state.activeChat.projectId).trim() : '';
      if (chatProjId) {
        var matchedP = (_state.projects || []).find(function(p) { return p && p.id === chatProjId; });
        projLabel.textContent = matchedP ? matchedP.name : '项目主页';
        projBtn.hidden = false;
        projBtn.setAttribute('data-back-project-id', chatProjId);
      } else {
        projBtn.hidden = true;
        projBtn.removeAttribute('data-back-project-id');
      }
    }

    var dotEl = page.querySelector('#aiw-ctx-model-dot');
    var modelLabel = page.querySelector('#aiw-ctx-model-label');
    var presetLabel = page.querySelector('#aiw-ctx-preset-label');

    var api = _state.effectiveApi;
    if (dotEl) {
      dotEl.className = 'aiw-ctx-dot ' + (!api || !api.configured ? 'is-unconfigured' : (api.source === 'custom' ? 'is-custom' : 'is-primary'));
    }
    if (modelLabel) {
      var mName = (api && api.model) || _state.selectedModel || '';
      if (!api || !api.configured) {
        modelLabel.textContent = mName ? (mName + ' (未配置API)') : '未配置模型/API';
      } else {
        modelLabel.textContent = mName;
      }
    }

    var preset = resolveEffectivePresetForState();
    var wbInfo = syncEffectiveWorldBooksForState();
    if (presetLabel) {
      var baseLabel = preset ? preset.name : '自由对话（无预设）';
      presetLabel.textContent = baseLabel;
      if (wbInfo && wbInfo.effectiveCount > 0) {
        presetLabel.title = baseLabel + '（当前生效世界书：' + wbInfo.effectiveCount + ' 本）';
      } else {
        presetLabel.title = baseLabel;
      }
    }
  }

  // ===== 模型切换弹窗 =====
  async function openModelPickerModal(page) {
    await refreshEffectiveApi();
    var api = _state.effectiveApi || { source: 'primary', sourceLabel: '弯弯机主 API', model: '', defaultModel: '', fetchedModels: [] };
    var currentModel = api.model || '';

    var candidates = [];
    var pushCandidate = function(m) {
      var clean = String(m || '').trim();
      if (clean && candidates.indexOf(clean) === -1) candidates.push(clean);
    };
    pushCandidate(currentModel);
    pushCandidate(api.defaultModel);
    (api.fetchedModels || []).forEach(pushCandidate);

    function renderCandidateButtons(list) {
      if (!list.length) {
        return '<div class="aiw-picker-empty">暂无缓存模型，可点击右上角「拉取列表」或在下方手动输入模型名。</div>';
      }
      return list.map(function(m) {
        var active = m === currentModel ? ' is-selected' : '';
        return (
          '<button type="button" class="aiw-picker-item' + active + '" data-pick-model="' + escapeHtml(m) + '">' +
            '<span class="aiw-picker-icon"><i class="fa-solid fa-microchip"></i></span>' +
            '<div class="aiw-picker-text">' +
              '<div class="aiw-picker-title">' + escapeHtml(m) + '</div>' +
            '</div>' +
            '<span class="aiw-picker-check">' + (m === currentModel ? '<i class="fa-solid fa-check"></i>' : '') + '</span>' +
          '</button>'
        );
      }).join('');
    }

    var bodyHtml =
      '<div class="aiw-model-picker-source">' +
        '<span>当前通道：<strong>' + escapeHtml(api.sourceLabel || '弯弯机主 API') + '</strong></span>' +
        '<button type="button" class="aiw-inline-link-btn" id="aiw-mp-goto-api">API 设置</button>' +
      '</div>' +
      '<div class="aiw-model-manual-row">' +
        '<input type="text" class="aiw-field-input" id="aiw-mp-manual-input" value="' + escapeHtml(currentModel) + '" placeholder="手动输入模型名称并应用...">' +
        '<button type="button" class="aiw-st-btn-primary aiw-st-btn-sm" id="aiw-mp-apply-manual">切换</button>' +
      '</div>' +
      '<div class="aiw-model-list-head">' +
        '<span>可选模型</span>' +
        '<button type="button" class="aiw-inline-link-btn" id="aiw-mp-refresh-models"><i class="fa-solid fa-arrows-rotate"></i> 拉取列表</button>' +
      '</div>' +
      '<div class="aiw-picker-list aiw-model-picker-list" id="aiw-mp-list">' + renderCandidateButtons(candidates) + '</div>';

    var modal = showInlineModal(page, '选择知屿模型', bodyHtml, '');
    if (!modal) return;

    async function applyChosenModel(modelName) {
      var clean = String(modelName || '').trim();
      if (!clean) {
        notifyToast('请输入或选择有效模型名称');
        return;
      }
      _state.selectedModel = clean;
      if (S()) await S().saveSelectedModel(clean);
      if (_state.activeChat) {
        _state.activeChat.model = clean;
        if (S()) {
          _state.activeChat = await S().saveChat({
            id: _state.activeChat.id,
            model: clean,
            updatedAt: Date.now()
          });
        }
      }
      await refreshEffectiveApi();
      syncContextStrip(page);
      closeInlineModal(page);
      notifyToast('已切换知屿模型：' + clean);
    }

    function bindListClicks() {
      modal.querySelectorAll('[data-pick-model]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          applyChosenModel(btn.getAttribute('data-pick-model'));
        });
      });
    }
    bindListClicks();

    modal.querySelector('#aiw-mp-apply-manual').addEventListener('click', function() {
      applyChosenModel(modal.querySelector('#aiw-mp-manual-input').value);
    });

    modal.querySelector('#aiw-mp-goto-api').addEventListener('click', function() {
      closeInlineModal(page);
      openSettingsView(page, 'custom-api');
    });

    var refreshBtn = modal.querySelector('#aiw-mp-refresh-models');
    refreshBtn.addEventListener('click', async function() {
      if (!AI() || typeof AI().fetchModels !== 'function') return;
      if (!api.url || !api.key) {
        notifyToast('请先配置 API 的 Base URL 和 Key');
        return;
      }
      var oldHtml = refreshBtn.innerHTML;
      refreshBtn.disabled = true;
      refreshBtn.textContent = '拉取中...';
      try {
        var models = await AI().fetchModels({ url: api.url, key: api.key });
        if (api.source === 'custom' && S()) {
          await S().saveCustomApiConfig({ fetchedModels: models });
        }
        models.forEach(pushCandidate);
        modal.querySelector('#aiw-mp-list').innerHTML = renderCandidateButtons(candidates);
        bindListClicks();
        notifyToast('已加载 ' + models.length + ' 个模型');
      } catch (err) {
        notifyToast((err && err.message) || '拉取模型失败');
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = oldHtml;
      }
    });
  }

  // ===== 预设切换弹窗（新建对话与聊天中均可切换） =====
  async function openPresetPickerModal(page) {
    if (S()) {
      _state.presets = await S().listPresets();
      _state.defaultPreset = _state.presets.find(function(p) { return p.isDefault; }) || _state.presets[0] || null;
      if (typeof S().listWorldBooks === 'function') {
        _state.worldbooks = await S().listWorldBooks();
      }
    }
    var currentPreset = resolveEffectivePresetForState();
    var currentId = currentPreset ? currentPreset.id : '';
    var list = _state.presets || [];

    var itemsHtml = list.map(function(p) {
      var active = p.id === currentId ? ' is-selected' : '';
      var wbInfo = (S() && typeof S().resolveEffectiveWorldBooksFromData === 'function')
        ? S().resolveEffectiveWorldBooksFromData(p, _state.worldbooks)
        : { presetCount: 0, effectiveCount: 0 };
      var wbBadge = wbInfo.presetCount > 0
        ? (' <span class="aiw-mini-badge">世界书 ' + wbInfo.presetCount + '</span>')
        : '';
      return (
        '<button type="button" class="aiw-picker-item' + active + '" data-pick-preset="' + escapeHtml(p.id) + '">' +
          '<span class="aiw-picker-icon">' +
            (p.avatarType === 'image' && p.avatarValue
              ? '<img class="aiw-picker-avatar-img" src="' + escapeHtml(p.avatarValue) + '" alt="预设">'
              : '<i class="' + escapeHtml(p.avatarValue || 'fa-solid fa-wand-magic-sparkles') + '"></i>') +
          '</span>' +
          '<div class="aiw-picker-text">' +
            '<div class="aiw-picker-title">' + escapeHtml(p.name) + (p.isDefault ? ' <span class="aiw-mini-badge">默认</span>' : '') + wbBadge + '</div>' +
            '<div class="aiw-picker-desc">' + escapeHtml(p.description || ('风格：' + (p.replyStyle || '温和自然'))) + '</div>' +
          '</div>' +
          '<span class="aiw-picker-check">' + (p.id === currentId ? '<i class="fa-solid fa-check"></i>' : '') + '</span>' +
        '</button>'
      );
    }).join('');

    var bodyHtml =
      '<div class="aiw-model-picker-source">' +
        '<span>选择当前对话使用的角色预设与系统提示词</span>' +
        '<button type="button" class="aiw-inline-link-btn" id="aiw-pp-manage">管理预设</button>' +
      '</div>' +
      '<div class="aiw-picker-list">' +
        itemsHtml +
        '<button type="button" class="aiw-picker-item' + (!currentPreset ? ' is-selected' : '') + '" data-pick-preset="__none__">' +
          '<span class="aiw-picker-icon"><i class="fa-regular fa-comment"></i></span>' +
          '<div class="aiw-picker-text">' +
            '<div class="aiw-picker-title">自由对话（不使用预设）</div>' +
            '<div class="aiw-picker-desc">仅保留基础规则与个性化设置</div>' +
          '</div>' +
          '<span class="aiw-picker-check">' + (!currentPreset ? '<i class="fa-solid fa-check"></i>' : '') + '</span>' +
        '</button>' +
      '</div>';

    var modal = showInlineModal(page, '切换角色预设', bodyHtml, '');
    if (!modal) return;

    modal.querySelector('#aiw-pp-manage').addEventListener('click', function() {
      closeInlineModal(page);
      openSettingsView(page, 'presets');
    });

    modal.querySelectorAll('[data-pick-preset]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var pid = btn.getAttribute('data-pick-preset');
        var chosen = pid === '__none__' ? null : list.find(function(p) { return p.id === pid; }) || null;
        _state.activePreset = chosen;
        _state.explicitNoPreset = (pid === '__none__');

        if (_state.activeChat && S()) {
          _state.activeChat = await S().saveChat({
            id: _state.activeChat.id,
            presetId: chosen ? chosen.id : '',
            presetSnapshot: chosen ? S().buildPresetSnapshot(chosen) : null,
            updatedAt: Date.now()
          });
        }

        syncContextStrip(page);
        var wbInfo = _state.effectiveWorldBooksInfo;
        if (_state.messages.length === 0) updateMainStage(page);
        closeInlineModal(page);
        if (chosen) {
          var wbSuffix = wbInfo && wbInfo.effectiveCount > 0
            ? ('（已关联 ' + wbInfo.effectiveCount + ' 本世界书）')
            : '';
          notifyToast('已切换预设：' + chosen.name + wbSuffix);
        } else {
          notifyToast('已切换为自由对话');
        }
      });
    });
  }

  // ===== 侧边栏聊天历史列表渲染与管理 =====
  async function reloadChatList(page) {
    if (!S()) return;
    var q = String(_state.searchQuery || '').trim();
    _state.chats = q ? await S().searchChats(q) : await S().listChats();
    if (typeof S().listProjects === 'function') {
      _state.projects = await S().listProjects();
    }
    renderSidebarProjects(page);
    renderSidebarProjects(page);
    renderSidebarChats(page);
  }

  function openChatActionsModal(page, chat) {
    if (!chat) return;
    var bodyHtml =
      '<div class="aiw-picker-list">' +
        '<button type="button" class="aiw-picker-item" data-chat-op="rename">' +
          '<span class="aiw-picker-icon"><i class="fa-regular fa-pen-to-square"></i></span>' +
          '<div class="aiw-picker-text"><div class="aiw-picker-title">重命名标题</div></div>' +
        '</button>' +
        '<button type="button" class="aiw-picker-item" data-chat-op="pin">' +
          '<span class="aiw-picker-icon"><i class="fa-solid fa-thumbtack"></i></span>' +
          '<div class="aiw-picker-text"><div class="aiw-picker-title">' + (chat.pinned ? '取消置顶' : '置顶对话') + '</div></div>' +
        '</button>' +
        '<button type="button" class="aiw-picker-item" data-chat-op="project">' +
          '<span class="aiw-picker-icon"><i class="fa-regular fa-folder"></i></span>' +
          '<div class="aiw-picker-text"><div class="aiw-picker-title">' + (chat.projectId ? '变更所属项目 / 移出' : '移动到项目') + '</div></div>' +
        '</button>' +
        '<button type="button" class="aiw-picker-item is-danger-item" data-chat-op="delete">' +
          '<span class="aiw-picker-icon"><i class="fa-regular fa-trash-can"></i></span>' +
          '<div class="aiw-picker-text"><div class="aiw-picker-title">删除对话</div></div>' +
        '</button>' +
      '</div>';

    var modal = showInlineModal(page, chat.title || '对话操作', bodyHtml, '');
    if (!modal) return;

    modal.querySelector('[data-chat-op="rename"]').addEventListener('click', function() {
      var renameModal = showInlineModal(
        page,
        '重命名对话',
        '<label class="aiw-field-label" for="aiw-rename-input">对话标题</label>' +
        '<input type="text" class="aiw-field-input" id="aiw-rename-input" maxlength="80" value="' + escapeHtml(chat.title || '') + '" placeholder="输入新标题">',
        '<button type="button" class="aiw-st-btn-secondary" id="aiw-ren-cancel">取消</button>' +
        '<button type="button" class="aiw-st-btn-primary" id="aiw-ren-save">保存</button>'
      );
      if (!renameModal) return;
      var inputEl = renameModal.querySelector('#aiw-rename-input');
      setTimeout(function() { try { inputEl.focus(); inputEl.select(); } catch (_) {} }, 60);
      renameModal.querySelector('#aiw-ren-cancel').addEventListener('click', function() { closeInlineModal(page); });
      renameModal.querySelector('#aiw-ren-save').addEventListener('click', async function() {
        var nextTitle = inputEl.value.trim();
        if (!nextTitle) {
          notifyToast('标题不能为空');
          return;
        }
        var updated = await S().renameChat(chat.id, nextTitle);
        if (_state.activeChat && _state.activeChat.id === chat.id && updated) {
          _state.activeChat = updated;
          updateMainStage(page);
        }
        closeInlineModal(page);
        await reloadChatList(page);
        notifyToast('已重命名');
      });
    });

    modal.querySelector('[data-chat-op="pin"]').addEventListener('click', async function() {
      var updated = await S().togglePinChat(chat.id);
      if (_state.activeChat && _state.activeChat.id === chat.id && updated) {
        _state.activeChat = updated;
      }
      closeInlineModal(page);
      await reloadChatList(page);
      notifyToast(updated && updated.pinned ? '已置顶对话' : '已取消置顶');
    });

    var projOpBtn = modal.querySelector('[data-chat-op="project"]');
    if (projOpBtn) {
      projOpBtn.addEventListener('click', function() {
        closeInlineModal(page);
        if (global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.openChatAssignProjectModal === 'function') {
          global.AiWorkspaceProjects.openChatAssignProjectModal(page, chat, async function() {
            await reloadChatList(page);
          });
        } else {
          notifyToast('项目模块尚未加载');
        }
      });
    }

    modal.querySelector('[data-chat-op="delete"]').addEventListener('click', function() {
      var confirmModal = showInlineModal(
        page,
        '删除对话',
        '<p class="aiw-st-modal-msg">确定要删除「' + escapeHtml(chat.title || '该对话') + '」吗？删除后无法恢复，但不会影响弯弯机微信记录。</p>',
        '<button type="button" class="aiw-st-btn-secondary" id="aiw-del-cancel">取消</button>' +
        '<button type="button" class="aiw-st-btn-danger" id="aiw-del-ok">确认删除</button>'
      );
      if (!confirmModal) return;
      confirmModal.querySelector('#aiw-del-cancel').addEventListener('click', function() { closeInlineModal(page); });
      confirmModal.querySelector('#aiw-del-ok').addEventListener('click', async function() {
        await S().deleteChat(chat.id);
        if (_state.activeChatId === chat.id) {
          if (_state.isStreaming && _state.abortController) {
            try { _state.abortController.abort(); } catch (_) {}
          }
          _state.activeChatId = null;
          _state.activeChat = null;
          _state.messages = [];
          _state.explicitNoPreset = false;
          _state.activePreset = (!_state.general || _state.general.autoUseDefaultPreset !== false)
            ? _state.defaultPreset
            : null;
          await refreshEffectiveApi();
          syncContextStrip(page);
          updateMainStage(page);
        }
        closeInlineModal(page);
        await reloadChatList(page);
        notifyToast('对话已删除');
      });
    });
  }

  function renderSidebarProjects(page) {
    if (!page) return;
    var listEl = page.querySelector('#aiw-sb-projects-list');
    var toggleBtn = page.querySelector('#aiw-sb-projects-toggle');
    var chevEl = page.querySelector('#aiw-sb-projects-chevron');
    if (!listEl) return;

    var collapsed = !!_state.projectsSectionCollapsed;
    listEl.hidden = collapsed;
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (chevEl) chevEl.className = 'fa-solid ' + (collapsed ? 'fa-angle-right' : 'fa-angle-down') + ' aiw-sb-projects-chevron';
    if (collapsed) return;

    var projects = Array.isArray(_state.projects) ? _state.projects : [];
    var allChats = Array.isArray(_state.chats) ? _state.chats : [];
    var q = String(_state.searchQuery || '').trim().toLowerCase();

    if (projects.length === 0) {
      listEl.innerHTML =
        '<button type="button" class="aiw-sb-proj-create-hint" id="aiw-sb-proj-empty-manage">' +
          '<i class="fa-solid fa-plus"></i> 创建第一个项目' +
        '</button>';
      var emptyBtn = listEl.querySelector('#aiw-sb-proj-empty-manage');
      if (emptyBtn) {
        emptyBtn.addEventListener('click', function() {
          setSidebarOpen(page, false);
          if (global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.openProjectsCenter === 'function') {
            global.AiWorkspaceProjects.openProjectsCenter(page);
          }
        });
      }
      return;
    }

    var iconRenderer = (global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.renderProjectIconHtml === 'function')
      ? global.AiWorkspaceProjects.renderProjectIconHtml
      : function(ic) { return '<i class="' + escapeHtml(ic || 'fa-solid fa-folder') + '"></i>'; };

    var html = projects.map(function(proj) {
      var projChats = allChats.filter(function(c) { return c && c.projectId === proj.id; });
      var isExpanded = !!_state.expandedProjects[proj.id] || (!!q && projChats.length > 0);
      var hasActive = (_state.activeProjectHomeId === proj.id) || projChats.some(function(c) { return c.id === _state.activeChatId; });
      var color = proj.color || '#ec4899';
      var limit = Number(_state.projectVisibleLimit[proj.id]) || 5;
      var visibleChats = projChats.slice(0, limit);
      var remaining = Math.max(0, projChats.length - visibleChats.length);

      var chatsHtml = '';
      if (isExpanded) {
        if (visibleChats.length === 0) {
          chatsHtml = '<div class="aiw-sb-proj-chats"><div class="aiw-sb-proj-empty">暂无聊天</div></div>';
        } else {
          chatsHtml =
            '<div class="aiw-sb-proj-chats">' +
              visibleChats.map(function(c) {
                var activeCls = _state.activeChatId === c.id ? ' active' : '';
                return (
                  '<div class="aiw-chat-row aiw-sb-proj-chat-row' + activeCls + '">' +
                    '<button type="button" class="aiw-chat-item' + activeCls + '" data-proj-chat-id="' + escapeHtml(c.id) + '">' +
                      '<span class="aiw-chat-item-title">' + escapeHtml(c.title || '新对话') + '</span>' +
                      (c.pinned ? '<span class="aiw-chat-item-pin" title="已置顶"><i class="fa-solid fa-thumbtack"></i></span>' : '') +
                    '</button>' +
                    '<button type="button" class="aiw-chat-more-btn" data-chat-more="' + escapeHtml(c.id) + '" aria-label="对话操作">' +
                      '<i class="fa-solid fa-ellipsis"></i>' +
                    '</button>' +
                  '</div>'
                );
              }).join('') +
              (remaining > 0
                ? '<button type="button" class="aiw-sb-proj-show-more" data-proj-show-more="' + escapeHtml(proj.id) + '">显示更多（还有 ' + remaining + ' 条）</button>'
                : '') +
            '</div>';
        }
      }

      return (
        '<div class="aiw-sb-proj-group' + (isExpanded ? ' is-expanded' : '') + (hasActive ? ' has-active' : '') + '" data-sb-proj-id="' + escapeHtml(proj.id) + '">' +
          '<div class="aiw-sb-proj-row' + (hasActive ? ' is-active' : '') + '">' +
            '<button type="button" class="aiw-sb-proj-main" data-proj-toggle="' + escapeHtml(proj.id) + '" aria-expanded="' + (isExpanded ? 'true' : 'false') + '">' +
              '<span class="aiw-sb-proj-icon" style="color:' + escapeHtml(color) + ';">' + iconRenderer(proj.icon) + '</span>' +
              '<span class="aiw-sb-proj-name">' + escapeHtml(proj.name) + '</span>' + (proj.pinned ? '<span class="aiw-sb-proj-pin" title="已置顶"><i class="fa-solid fa-thumbtack"></i></span>' : '') +
            '</button>' +
            '<div class="aiw-sb-proj-actions">' +
              '<button type="button" class="aiw-sb-proj-action-btn" data-proj-new-chat="' + escapeHtml(proj.id) + '" title="在项目中新建聊天"><i class="fa-regular fa-pen-to-square"></i></button>' +
              '<button type="button" class="aiw-sb-proj-action-btn" data-proj-more="' + escapeHtml(proj.id) + '" title="项目操作"><i class="fa-solid fa-ellipsis"></i></button>' +
            '</div>' +
          '</div>' +
          chatsHtml +
        '</div>'
      );
    }).join('');

    listEl.innerHTML = html;

    listEl.querySelectorAll('[data-proj-toggle]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var pid = btn.getAttribute('data-proj-toggle');
        _state.expandedProjects[pid] = !_state.expandedProjects[pid];
        saveSidebarProjUiState();
        renderSidebarProjects(page);
      });
    });

    listEl.querySelectorAll('[data-proj-new-chat]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var pid = btn.getAttribute('data-proj-new-chat');
        _state.expandedProjects[pid] = true;
        saveSidebarProjUiState();
        setSidebarOpen(page, false);
        await createNewChatInProject(page, pid);
      });
    });

    listEl.querySelectorAll('[data-proj-more]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var pid = btn.getAttribute('data-proj-more');
        var proj = projects.find(function(p) { return p && p.id === pid; });
        if (!proj || !global.AiWorkspaceProjects) return;
        if (typeof global.AiWorkspaceProjects.openProjectPopoverMenu === 'function') {
          global.AiWorkspaceProjects.openProjectPopoverMenu(page, proj, btn, {
            onOpenHome: function(targetPid) {
              setSidebarOpen(page, false);
              openProjectHome(page, targetPid);
            },
            onDone: function() {
              reloadChatList(page);
              if (_state.activeProjectHomeId === proj.id) {
                renderProjectHomeStage(page);
              }
            },
            onDeleted: function() {
              if (_state.activeProjectHomeId === proj.id) {
                _state.activeProjectHomeId = null;
                startNewChat(page, true);
              }
              reloadChatList(page);
            }
          });
        } else if (typeof global.AiWorkspaceProjects.openProjectQuickActionsModal === 'function') {
          global.AiWorkspaceProjects.openProjectQuickActionsModal(page, proj, function() {
            reloadChatList(page);
          });
        }
      });
    });

    listEl.querySelectorAll('[data-proj-show-more]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var pid = btn.getAttribute('data-proj-show-more');
        var cur = Number(_state.projectVisibleLimit[pid]) || 5;
        _state.projectVisibleLimit[pid] = cur + 10;
        renderSidebarProjects(page);
      });
    });

    listEl.querySelectorAll('[data-proj-chat-id]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        if (_state.isStreaming) {
          notifyToast('请先停止当前回答再切换对话');
          return;
        }
        var cid = btn.getAttribute('data-proj-chat-id');
        setSidebarOpen(page, false);
        await loadChatIntoState(page, cid);
      });
    });

    listEl.querySelectorAll('.aiw-chat-more-btn[data-chat-more]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var cid = btn.getAttribute('data-chat-more');
        var target = allChats.find(function(c) { return c && c.id === cid; });
        if (target) openChatActionsModal(page, target);
      });
    });
  }

  function renderSidebarChats(page) {
    if (!page) return;
    var list = Array.isArray(_state.chats) ? _state.chats : [];
    // 项目聊天仅在所属项目下展示，不在普通聊天分区重复出现
    var normalList = list.filter(function(item) { return item && !item.projectId; });
    var pinned = normalList.filter(function(item) { return item.pinned; });
    var recent = normalList.filter(function(item) { return !item.pinned; });

    var pinnedList = page.querySelector('#aiw-pinned-list');
    var recentList = page.querySelector('#aiw-recent-list');
    var pinnedSec = page.querySelector('#aiw-pinned-section');
    var recentSec = page.querySelector('#aiw-recent-section');

    function renderItems(items) {
      return items.map(function(item) {
        var activeCls = _state.activeChatId === item.id ? ' active' : '';
        return (
          '<div class="aiw-chat-row' + activeCls + '">' +
            '<button type="button" class="aiw-chat-item' + activeCls + '" data-chat-id="' + escapeHtml(item.id) + '">' +
              '<span class="aiw-chat-item-title">' + escapeHtml(item.title || '新对话') + '</span>' +
              (item.pinned ? '<span class="aiw-chat-item-pin" title="已置顶"><i class="fa-solid fa-thumbtack"></i></span>' : '') +
            '</button>' +
            '<button type="button" class="aiw-chat-more-btn" data-chat-more="' + escapeHtml(item.id) + '" aria-label="对话操作">' +
              '<i class="fa-solid fa-ellipsis"></i>' +
            '</button>' +
          '</div>'
        );
      }).join('');
    }

    if (pinnedList) pinnedList.innerHTML = pinned.length ? renderItems(pinned) : '';
    if (pinnedSec) pinnedSec.hidden = pinned.length === 0;

    if (recentList) {
      if (recent.length) {
        recentList.innerHTML = renderItems(recent);
      } else if (!pinned.length) {
        recentList.innerHTML = '<div class="aiw-chat-empty">' + (_state.searchQuery.trim() ? '没有匹配的聊天记录' : '暂无历史对话，发送消息即自动保存') + '</div>';
      } else {
        recentList.innerHTML = '';
      }
    }
    if (recentSec) {
      recentSec.hidden = recent.length === 0 && pinned.length > 0;
    }

    page.querySelectorAll('.aiw-chat-item[data-chat-id]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        if (_state.isStreaming) {
          notifyToast('请先停止当前回答再切换对话');
          return;
        }
        var chatId = btn.getAttribute('data-chat-id');
        var loaded = S() ? await S().getChat(chatId) : null;
        if (!loaded) return;
        _state.activeProjectHomeId = null;
        _state.activeChatId = loaded.id;
        _state.activeChat = loaded;
        _state.messages = Array.isArray(loaded.messages) ? loaded.messages.slice() : [];
        _state.quotedMessage = null;
        syncQuoteBarUI(page);
        if (loaded.presetId || loaded.presetSnapshot) {
          _state.explicitNoPreset = false;
          _state.activePreset = (_state.presets || []).find(function(p) { return p && p.id === loaded.presetId; }) || loaded.presetSnapshot || null;
        } else {
          _state.explicitNoPreset = true;
          _state.activePreset = null;
        }
        if (loaded.model) {
          _state.selectedModel = loaded.model;
          if (S()) await S().saveSelectedModel(loaded.model);
        }
        await refreshEffectiveApi();
        setSidebarOpen(page, false);
        syncContextStrip(page);
        updateMainStage(page);
        renderSidebarProjects(page);
    renderSidebarChats(page);
      });
    });

    page.querySelectorAll('#aiw-pinned-list .aiw-chat-more-btn[data-chat-more], #aiw-recent-list .aiw-chat-more-btn[data-chat-more]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var chatId = btn.getAttribute('data-chat-more');
        var target = list.find(function(c) { return c.id === chatId; });
        if (target) openChatActionsModal(page, target);
      });
    });
  }

  // ===== 主聊天区渲染与单条流式消息更新 =====
  var TRANSLATION_TARGETS = [
    { lang: 'zh-CN', label: '简体中文', hint: 'Chinese (Simplified)' },
    { lang: 'en', label: 'English（英文）', hint: 'English' },
    { lang: 'zh-TW', label: '繁體中文', hint: 'Chinese (Traditional)' },
    { lang: 'ja', label: '日本語（日语）', hint: 'Japanese' },
    { lang: 'ko', label: '한국어（韩语）', hint: 'Korean' },
    { lang: 'fr', label: 'Français（法语）', hint: 'French' },
    { lang: 'de', label: 'Deutsch（德语）', hint: 'German' },
    { lang: 'es', label: 'Español（西班牙语）', hint: 'Spanish' }
  ];

  function isMessageFavoritedInState(msgId) {
    if (!msgId) return false;
    var activeChatId = _state.activeChat ? _state.activeChat.id : '';
    return (_state.favorites || []).some(function(fav) {
      if (!fav) return false;
      if (activeChatId && fav.chatId) {
        return fav.chatId === activeChatId && fav.messageId === msgId;
      }
      return fav.messageId === msgId;
    });
  }

  function renderTranslationPanelHtml(m) {
    if (!m || m.role !== 'assistant' || m.streaming) return '';
    var pending = _state.translatingMap && _state.translatingMap[m.id];
    if (pending) {
      return (
        '<div class="aiw-msg-trans-card is-loading">' +
          '<div class="aiw-msg-trans-head">' +
            '<span class="aiw-msg-trans-title"><i class="fa-solid fa-language"></i> 正在翻译为 ' + escapeHtml(pending.label) + '...</span>' +
          '</div>' +
          '<div class="aiw-msg-trans-loading"><span class="aiw-pulse-dot"></span><span>保持原文不变，正在生成译文</span></div>' +
        '</div>'
      );
    }

    var translations = m.translations && typeof m.translations === 'object' ? m.translations : null;
    if (!translations) return '';
    var langKeys = Object.keys(translations);
    if (!langKeys.length) return '';

    var activePref = _state.activeTranslationLangMap && _state.activeTranslationLangMap[m.id];
    if (activePref === '__hidden__') return '';

    var activeLang = activePref && translations[activePref] ? activePref : '';
    if (!activeLang) {
      langKeys.sort(function(a, b) {
        return (translations[b].updatedAt || 0) - (translations[a].updatedAt || 0);
      });
      activeLang = langKeys[0];
    }
    var item = translations[activeLang];
    if (!item || !item.text) return '';

    var langPills = langKeys.length > 1
      ? '<div class="aiw-msg-trans-langs">' + langKeys.map(function(lk) {
          var t = translations[lk];
          return '<button type="button" class="aiw-msg-trans-lang-pill' + (lk === activeLang ? ' is-active' : '') + '" data-msg-act="switch-trans-lang" data-msg-id="' + escapeHtml(m.id) + '" data-trans-lang="' + escapeHtml(lk) + '">' + escapeHtml((t && t.langLabel) || lk) + '</button>';
        }).join('') + '</div>'
      : '';

    return (
      '<div class="aiw-msg-trans-card">' +
        '<div class="aiw-msg-trans-head">' +
          '<span class="aiw-msg-trans-title"><i class="fa-solid fa-language"></i> 译文 · ' + escapeHtml(item.langLabel || activeLang) + '</span>' +
          '<div class="aiw-msg-trans-ops">' +
            '<button type="button" class="aiw-msg-trans-op" data-msg-act="translate" data-msg-id="' + escapeHtml(m.id) + '" title="选择目标语言或重新翻译">切换语言</button>' +
            '<button type="button" class="aiw-msg-trans-op" data-msg-act="copy-trans" data-msg-id="' + escapeHtml(m.id) + '" data-trans-lang="' + escapeHtml(activeLang) + '" title="复制译文">复制译文</button>' +
            '<button type="button" class="aiw-msg-trans-op" data-msg-act="hide-trans" data-msg-id="' + escapeHtml(m.id) + '" title="收起译文">收起</button>' +
          '</div>' +
        '</div>' +
        langPills +
        '<div class="aiw-msg-trans-body">' + renderMarkdownHtml(item.text) + '</div>' +
      '</div>'
    );
  }

  function renderMessageItemHtml(m, idx, totalCount) {
    if (m.role === 'user') {
      var badge = m.deepThink
        ? '<div class="aiw-msg-badge"><i class="fa-regular fa-lightbulb"></i><span>深入思考</span></div>'
        : '';
      var quoteHtml = '';
      if (m.quote && m.quote.content) {
        var qRole = m.quote.role === 'assistant' ? '引用知屿回复' : '引用先前消息';
        var qText = m.quote.content.length > 90 ? (m.quote.content.slice(0, 90) + '…') : m.quote.content;
        quoteHtml =
          '<div class="aiw-msg-quote-ref">' +
            '<div class="aiw-msg-quote-ref-role"><i class="fa-solid fa-reply"></i> ' + escapeHtml(qRole) + '</div>' +
            '<div class="aiw-msg-quote-ref-text">' + escapeHtml(qText) + '</div>' +
          '</div>';
      }
      var userMetaHtml = m.editedAt ? '<span class="aiw-msg-edited-tag">已编辑</span>' : '';
      var userActionsHtml =
        '<div class="aiw-msg-actions is-user-actions">' +
          userMetaHtml +
          '<button type="button" class="aiw-msg-act-btn" data-msg-act="copy" data-msg-id="' + escapeHtml(m.id) + '" title="复制消息"><i class="fa-regular fa-copy"></i> 复制</button>' +
          '<button type="button" class="aiw-msg-act-btn" data-msg-act="edit" data-msg-id="' + escapeHtml(m.id) + '" title="编辑消息"><i class="fa-regular fa-pen-to-square"></i> 编辑</button>' +
          '<button type="button" class="aiw-msg-act-btn is-more-btn" data-msg-act="more" data-msg-id="' + escapeHtml(m.id) + '" title="更多消息操作" aria-label="更多消息操作"><i class="fa-solid fa-ellipsis"></i></button>' +
        '</div>';
      return (
        '<div class="aiw-msg-row is-user" data-msg-id="' + escapeHtml(m.id) + '">' +
          badge +
          quoteHtml +
          '<div class="aiw-msg-bubble">' + escapeHtml(m.content) + '</div>' +
          userActionsHtml +
        '</div>'
      );
    }

    var bodyHtml = '';
    if (m.content) {
      bodyHtml = renderMarkdownHtml(m.content);
    } else if (m.streaming) {
      bodyHtml = '<div class="aiw-streaming-placeholder"><span class="aiw-pulse-dot"></span><span>正在思考并生成回答...</span></div>';
    }

    var statusLine = '';
    if (m.streaming && m.content) {
      statusLine = '<div class="aiw-msg-status"><span class="aiw-pulse-dot"></span><span>正在输出...</span></div>';
    } else if (m.aborted) {
      statusLine = '<div class="aiw-msg-status is-aborted"><i class="fa-regular fa-circle-stop"></i><span>已停止生成</span></div>';
    }

    var errorHtml = '';
    if (m.error) {
      errorHtml =
        '<div class="aiw-msg-error-card">' +
          '<div class="aiw-msg-error-head"><i class="fa-solid fa-triangle-exclamation"></i><span>请求出错</span></div>' +
          '<div class="aiw-msg-error-text">' + escapeHtml(m.error) + '</div>' +
          '<button type="button" class="aiw-msg-retry-btn" data-msg-act="regen" data-msg-id="' + escapeHtml(m.id) + '">' +
            '<i class="fa-solid fa-rotate-right"></i> 重试生成' +
          '</button>' +
        '</div>';
    }

    var toolCallsHtml = renderToolCallsHtml(m);
    var translationHtml = renderTranslationPanelHtml(m);

    var actionsHtml = '';
    if (!m.streaming) {
      var isLastAssistant = idx === totalCount - 1;
      var editedBadge = m.editedAt ? '<span class="aiw-msg-edited-tag">已编辑</span>' : '';
      actionsHtml =
        '<div class="aiw-msg-actions">' +
          '<button type="button" class="aiw-msg-act-btn" data-msg-act="copy" data-msg-id="' + escapeHtml(m.id) + '" title="复制回复"><i class="fa-regular fa-copy"></i> 复制</button>' +
          '<button type="button" class="aiw-msg-act-btn' + (isLastAssistant ? ' is-primary-act' : '') + '" data-msg-act="regen" data-msg-id="' + escapeHtml(m.id) + '" title="重新生成回答"><i class="fa-solid fa-rotate-right"></i> 重新生成</button>' +
          '<button type="button" class="aiw-msg-act-btn" data-msg-act="translate" data-msg-id="' + escapeHtml(m.id) + '" title="翻译此回复（保留原文）"><i class="fa-solid fa-language"></i> 翻译</button>' +
          '<button type="button" class="aiw-msg-act-btn is-more-btn" data-msg-act="more" data-msg-id="' + escapeHtml(m.id) + '" title="更多消息操作" aria-label="更多消息操作"><i class="fa-solid fa-ellipsis"></i></button>' +
          editedBadge +
          (m.model ? '<span class="aiw-msg-model-tag">' + escapeHtml(m.model) + '</span>' : '') +
        '</div>';
    }

    return (
      '<div class="aiw-msg-row is-assistant" data-msg-id="' + escapeHtml(m.id) + '">' +
        toolCallsHtml +
        '<div class="aiw-msg-bubble" id="aiw-msg-bubble-' + escapeHtml(m.id) + '">' + bodyHtml + '</div>' +
        statusLine +
        errorHtml +
        translationHtml +
        actionsHtml +
      '</div>'
    );
  }

  function downloadWorkspaceTextFile(filename, text, mimeType) {
    try {
      var blob = new Blob([String(text == null ? '' : text)], { type: mimeType || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        a.remove();
        URL.revokeObjectURL(url);
      }, 1200);
      notifyToast('已开始下载：' + filename);
      return true;
    } catch (_) {
      notifyToast('当前环境不支持下载，请使用复制功能');
      return false;
    }
  }

  function syncQuoteBarUI(page) {
    if (!page) return;
    var bar = page.querySelector('#aiw-quote-bar');
    var roleEl = page.querySelector('#aiw-quote-bar-role');
    var textEl = page.querySelector('#aiw-quote-bar-text');
    if (!bar) return;
    var q = _state.quotedMessage;
    if (!q || !q.content) {
      bar.hidden = true;
      if (textEl) textEl.textContent = '';
      return;
    }
    bar.hidden = false;
    if (roleEl) roleEl.textContent = q.role === 'assistant' ? '引用知屿回复' : '引用我的消息';
    if (textEl) textEl.textContent = q.content.replace(/\s+/g, ' ').slice(0, 120);
  }

  function quoteMessageAction(page, msg) {
    if (!msg) return;
    var text = String(msg.content || '').trim();
    if (!text) {
      notifyToast('该消息暂无可引用的正文内容');
      return;
    }
    _state.quotedMessage = {
      id: msg.id,
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: text.slice(0, 600)
    };
    syncQuoteBarUI(page);
    var input = page.querySelector('#aiw-input');
    if (input) {
      try { input.focus(); } catch (_) {}
    }
    notifyToast('已添加到引用栏');
  }

  function openSelectTextModal(page, msg) {
    if (!msg) return;
    var content = String(msg.content || msg.error || '');
    if (!content) {
      notifyToast('该消息暂无可选择的文本内容');
      return;
    }
    var modal = showInlineModal(
      page,
      '选择文本',
      '<div class="aiw-msg-op-tip">支持自由拖动或点击下方按钮选取所需片段并复制：</div>' +
      '<textarea class="aiw-select-textarea" id="aiw-select-ta" readonly>' + escapeHtml(content) + '</textarea>',
      '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-sel-all">全选</button>' +
      '<button type="button" class="aiw-st-btn-primary aiw-st-btn-sm" id="aiw-sel-copy">复制选中 / 全文</button>'
    );
    if (!modal) return;
    var ta = modal.querySelector('#aiw-select-ta');
    modal.querySelector('#aiw-sel-all').addEventListener('click', function() {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(0, ta.value.length);
    });
    modal.querySelector('#aiw-sel-copy').addEventListener('click', async function() {
      if (!ta) return;
      var start = ta.selectionStart;
      var end = ta.selectionEnd;
      var slice = (typeof start === 'number' && typeof end === 'number' && end > start)
        ? ta.value.slice(start, end)
        : ta.value;
      await copyTextSafely(slice);
    });
  }

  function openEditMessageModal(page, msg) {
    if (!msg) return;
    if (_state.isStreaming) {
      notifyToast('请先停止当前回答后再编辑消息');
      return;
    }
    var isUser = msg.role === 'user';
    var footer =
      '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-ed-cancel">取消</button>' +
      (isUser ? '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-ed-save-regen">保存并重新生成</button>' : '') +
      '<button type="button" class="aiw-st-btn-primary aiw-st-btn-sm" id="aiw-ed-save">保存修改</button>';

    var modal = showInlineModal(
      page,
      isUser ? '编辑我的消息' : '编辑 AI 回复',
      '<textarea class="aiw-edit-textarea" id="aiw-edit-ta" placeholder="输入消息内容...">' + escapeHtml(msg.content || '') + '</textarea>',
      footer
    );
    if (!modal) return;
    var footEl = modal.querySelector('.aiw-ws-modal-foot');
    if (footEl) footEl.classList.add('aiw-bk-modal-foot');

    var ta = modal.querySelector('#aiw-edit-ta');
    setTimeout(function() {
      if (ta) {
        try {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        } catch (_) {}
      }
    }, 50);

    async function saveEditedContent(andRegen) {
      var nextText = String(ta ? ta.value : '').trim();
      if (!nextText) {
        notifyToast('消息内容不能为空');
        return;
      }
      var target = _state.messages.find(function(m) { return m.id === msg.id; });
      if (!target) {
        closeInlineModal(page);
        return;
      }
      target.content = nextText;
      target.editedAt = Date.now();
      target.error = '';
      target.aborted = false;
      if (_state.quotedMessage && _state.quotedMessage.id === target.id) {
        _state.quotedMessage.content = nextText.slice(0, 600);
        syncQuoteBarUI(page);
      }
      await persistCurrentChatMessages();
      if (S() && typeof S().syncFavoriteMessageContent === 'function' && _state.activeChat) {
        await S().syncFavoriteMessageContent(_state.activeChat.id, target.id, nextText, _state.activeChat.title);
        if (typeof S().listFavorites === 'function') {
          _state.favorites = await S().listFavorites();
        }
      }
      closeInlineModal(page);
      updateMainStage(page, { preserveScroll: true });
      notifyToast('已更新消息内容');
      if (andRegen) {
        await regenerateAtMessage(page, target.id);
      }
    }

    modal.querySelector('#aiw-ed-cancel').addEventListener('click', function() { closeInlineModal(page); });
    modal.querySelector('#aiw-ed-save').addEventListener('click', function() { saveEditedContent(false); });
    var regenBtn = modal.querySelector('#aiw-ed-save-regen');
    if (regenBtn) {
      regenBtn.addEventListener('click', function() { saveEditedContent(true); });
    }
  }

  function confirmDeleteMessage(page, msg) {
    if (!msg) return;
    if (_state.isStreaming) {
      notifyToast('请先停止当前回答后再删除消息');
      return;
    }
    var snippet = String(msg.content || msg.error || '').replace(/\s+/g, ' ').trim();
    if (snippet.length > 60) snippet = snippet.slice(0, 60) + '…';
    var modal = showInlineModal(
      page,
      '删除消息',
      '<p class="aiw-st-modal-msg">确定要删除这条' + (msg.role === 'user' ? '用户消息' : 'AI 回复') + '吗？删除后将从当前聊天记录中移除且无法恢复。</p>' +
      (snippet ? '<div class="aiw-msg-delete-preview">' + escapeHtml(snippet) + '</div>' : ''),
      '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-mdel-cancel">取消</button>' +
      '<button type="button" class="aiw-st-btn-danger aiw-st-btn-sm" id="aiw-mdel-ok">确认删除</button>'
    );
    if (!modal) return;
    modal.querySelector('#aiw-mdel-cancel').addEventListener('click', function() { closeInlineModal(page); });
    modal.querySelector('#aiw-mdel-ok').addEventListener('click', async function() {
      var idx = _state.messages.findIndex(function(m) { return m.id === msg.id; });
      if (idx !== -1) {
        _state.messages.splice(idx, 1);
      }
      if (_state.quotedMessage && _state.quotedMessage.id === msg.id) {
        _state.quotedMessage = null;
        syncQuoteBarUI(page);
      }
      if (_state.translatingMap) delete _state.translatingMap[msg.id];
      if (_state.activeTranslationLangMap) delete _state.activeTranslationLangMap[msg.id];
      await persistCurrentChatMessages();
      closeInlineModal(page);
      updateMainStage(page, { preserveScroll: true });
      notifyToast('已删除消息');
    });
  }

  async function toggleFavoriteMessageAction(page, msg) {
    if (!msg || !S() || typeof S().toggleMessageFavorite !== 'function') return;
    var text = String(msg.content || '').trim();
    if (!text) {
      notifyToast('该消息暂无正文内容，无法收藏');
      return;
    }
    var chatId = _state.activeChat ? _state.activeChat.id : '';
    var chatTitle = (_state.activeChat && _state.activeChat.title) || '当前对话';
    var res = await S().toggleMessageFavorite({
      chatId: chatId,
      chatTitle: chatTitle,
      messageId: msg.id,
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: text,
      model: msg.model || '',
      messageCreatedAt: msg.createdAt || Date.now()
    });
    _state.favorites = res.favorites || [];
    notifyToast(res.favorited ? '已添加到「我的收藏」' : '已取消收藏');
  }

  async function branchChatFromMessage(page, msg) {
    if (!msg || !S()) return;
    if (_state.isStreaming) {
      notifyToast('请先停止当前回答后再创建分支');
      return;
    }
    var idx = _state.messages.findIndex(function(m) { return m.id === msg.id; });
    if (idx === -1) return;

    var baseChat = _state.activeChat;
    var baseTitle = (baseChat && baseChat.title) ? baseChat.title : '新对话';
    var branchTitle = baseTitle.replace(/\s*·\s*分支(?:\s*\d+)?$/, '') + ' · 分支';
    var clonedMessages = _state.messages.slice(0, idx + 1).map(function(item, mIdx) {
      var cloned = {
        id: S().generateMessageId() + '_b' + mIdx,
        role: item.role,
        content: String(item.content || ''),
        createdAt: Number(item.createdAt) || Date.now(),
        model: item.model ? String(item.model) : '',
        error: item.error ? String(item.error) : '',
        aborted: !!item.aborted,
        deepThink: !!item.deepThink
      };
      if (item.quote) cloned.quote = Object.assign({}, item.quote);
      if (item.editedAt) cloned.editedAt = item.editedAt;
      if (item.translations) cloned.translations = JSON.parse(JSON.stringify(item.translations));
      return cloned;
    });

    var preset = resolveEffectivePresetForState();
    var newBranch = await S().createChat({
      title: branchTitle,
      model: (baseChat && baseChat.model) || _state.selectedModel || '',
      presetId: (baseChat && baseChat.presetId) || (preset ? preset.id : ''),
      presetSnapshot: (baseChat && baseChat.presetSnapshot)
        ? JSON.parse(JSON.stringify(baseChat.presetSnapshot))
        : (preset ? S().buildPresetSnapshot(preset) : null),
      projectId: (baseChat && baseChat.projectId) || '',
      branchedFromChatId: (baseChat && baseChat.id) || '',
      branchedFromMessageId: msg.id,
      messages: clonedMessages
    });

    _state.activeChatId = newBranch.id;
    _state.activeChat = newBranch;
    _state.messages = Array.isArray(newBranch.messages) ? newBranch.messages.slice() : [];
    _state.quotedMessage = null;
    syncQuoteBarUI(page);
    await reloadChatList(page);
    await refreshEffectiveApi();
    syncContextStrip(page);
    updateMainStage(page);
    notifyToast('已创建分支对话，原对话保持不变');
  }

  async function openForwardMessageModal(page, msg) {
    if (!msg) return;
    var text = String(msg.content || msg.error || '').trim();
    if (!text) {
      notifyToast('该消息暂无可转发的内容');
      return;
    }
    var allChats = S() && typeof S().listChats === 'function' ? await S().listChats() : (_state.chats || []);
    var currentChatId = _state.activeChat ? _state.activeChat.id : '';

    function renderChatTargetsHtml(filterText) {
      var q = String(filterText || '').trim().toLowerCase();
      var list = allChats.filter(function(c) {
        if (!c) return false;
        if (!q) return true;
        return String(c.title || '').toLowerCase().indexOf(q) !== -1;
      });
      if (!list.length) {
        return '<div class="aiw-picker-empty">没有匹配的对话，可直接点击下方「新建对话并转发」。</div>';
      }
      return list.map(function(c) {
        var isCurrent = c.id === currentChatId;
        var msgCount = Array.isArray(c.messages) ? c.messages.length : 0;
        return (
          '<button type="button" class="aiw-picker-item" data-fwd-chat="' + escapeHtml(c.id) + '">' +
            '<span class="aiw-picker-icon"><i class="fa-regular fa-comments"></i></span>' +
            '<div class="aiw-picker-text">' +
              '<div class="aiw-picker-title">' + escapeHtml(c.title || '新对话') + (isCurrent ? ' <span class="aiw-mini-badge">当前</span>' : '') + '</div>' +
              '<div class="aiw-picker-desc">共 ' + msgCount + ' 条消息</div>' +
            '</div>' +
            '<span class="aiw-picker-check"><i class="fa-solid fa-paper-plane"></i></span>' +
          '</button>'
        );
      }).join('');
    }

    var snippet = text.length > 100 ? (text.slice(0, 100) + '…') : text;
    var bodyHtml =
      '<div class="aiw-msg-fwd-preview">' + escapeHtml(snippet) + '</div>' +
      '<div class="aiw-msg-fwd-mode-row">' +
        '<label class="aiw-msg-fwd-radio"><input type="radio" name="aiw-fwd-mode" value="append" checked> 直接存入目标对话</label>' +
        '<label class="aiw-msg-fwd-radio"><input type="radio" name="aiw-fwd-mode" value="draft"> 填入目标输入框</label>' +
      '</div>' +
      '<input type="search" class="aiw-field-input" id="aiw-fwd-search" placeholder="搜索知屿对话...">' +
      '<div class="aiw-picker-list aiw-model-picker-list" id="aiw-fwd-list" style="margin-top:8px">' +
        renderChatTargetsHtml('') +
      '</div>';

    var footerHtml =
      '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-fwd-copy">复制转发文本</button>' +
      '<button type="button" class="aiw-st-btn-primary aiw-st-btn-sm" id="aiw-fwd-new-chat">新建对话并转发</button>';

    var modal = showInlineModal(page, '转发消息', bodyHtml, footerHtml);
    if (!modal) return;
    var footEl = modal.querySelector('.aiw-ws-modal-foot');
    if (footEl) footEl.classList.add('aiw-bk-modal-foot');

    function getFwdMode() {
      var checked = modal.querySelector('input[name="aiw-fwd-mode"]:checked');
      return checked ? checked.value : 'append';
    }

    async function forwardToChat(targetChatId) {
      if (_state.isStreaming) {
        notifyToast('请先停止当前回答后再切换对话');
        return;
      }
      var mode = getFwdMode();
      var targetChat = targetChatId ? await S().getChat(targetChatId) : null;
      if (!targetChat) {
        var preset = resolveEffectivePresetForState();
        targetChat = await S().createChat({
          title: '转发：' + (S().generateChatTitle(text)),
          model: _state.selectedModel || '',
          presetId: preset ? preset.id : '',
          presetSnapshot: preset ? S().buildPresetSnapshot(preset) : null,
          messages: []
        });
      }
      if (mode === 'append') {
        var nextMsgs = Array.isArray(targetChat.messages) ? targetChat.messages.slice() : [];
        nextMsgs.push({
          id: S().generateMessageId(),
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: text,
          createdAt: Date.now(),
          model: msg.role === 'assistant' ? (msg.model || '') : '',
          quote: {
            id: msg.id,
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: '转发自「' + ((_state.activeChat && _state.activeChat.title) || '原对话') + '」'
          }
        });
        targetChat = await S().saveChat({
          id: targetChat.id,
          messages: nextMsgs,
          updatedAt: Date.now()
        });
      }
      _state.activeChatId = targetChat.id;
      _state.activeChat = targetChat;
      _state.messages = Array.isArray(targetChat.messages) ? targetChat.messages.slice() : [];
      _state.quotedMessage = null;
      syncQuoteBarUI(page);
      closeInlineModal(page);
      await reloadChatList(page);
      await refreshEffectiveApi();
      syncContextStrip(page);
      updateMainStage(page);
      if (mode === 'draft') {
        var inputEl = page.querySelector('#aiw-input');
        if (inputEl) {
          inputEl.value = text;
          syncComposerButtons(page);
          try { inputEl.focus(); } catch (_) {}
        }
        notifyToast('已填入目标对话输入框');
      } else {
        notifyToast('已转发到「' + (targetChat.title || '新对话') + '」');
      }
    }

    function bindChatClicks() {
      modal.querySelectorAll('[data-fwd-chat]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          forwardToChat(btn.getAttribute('data-fwd-chat'));
        });
      });
    }
    bindChatClicks();

    var searchEl = modal.querySelector('#aiw-fwd-search');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        var listEl = modal.querySelector('#aiw-fwd-list');
        if (listEl) {
          listEl.innerHTML = renderChatTargetsHtml(searchEl.value);
          bindChatClicks();
        }
      });
    }

    modal.querySelector('#aiw-fwd-new-chat').addEventListener('click', function() {
      forwardToChat('');
    });
    modal.querySelector('#aiw-fwd-copy').addEventListener('click', async function() {
      var ok = await copyTextSafely(text);
      if (ok) closeInlineModal(page);
    });
  }

  function openShareMessageModal(page, msg) {
    if (!msg) return;
    var text = String(msg.content || msg.error || '').trim();
    if (!text) {
      notifyToast('该消息暂无可分享的内容');
      return;
    }
    var chatTitle = (_state.activeChat && _state.activeChat.title) || '知屿对话';
    var roleLabel = msg.role === 'user' ? '我的提问' : ('知屿回复' + (msg.model ? (' · ' + msg.model) : ''));
    var formattedText = '【' + chatTitle + '】\n' + roleLabel + '：\n\n' + text;
    var canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    var bodyHtml =
      '<div class="aiw-msg-share-card">' +
        '<div class="aiw-msg-share-meta">' + escapeHtml(chatTitle) + ' · ' + escapeHtml(roleLabel) + '</div>' +
        '<div class="aiw-msg-share-body">' + escapeHtml(text.length > 420 ? (text.slice(0, 420) + '…') : text) + '</div>' +
      '</div>' +
      '<div class="aiw-picker-list" style="margin-top:10px">' +
        '<button type="button" class="aiw-picker-item" id="aiw-share-copy">' +
          '<span class="aiw-picker-icon"><i class="fa-regular fa-copy"></i></span>' +
          '<div class="aiw-picker-text"><div class="aiw-picker-title">复制带来源的分享文本</div><div class="aiw-picker-desc">适合粘贴到微信、备忘录或文档</div></div>' +
        '</button>' +
        '<button type="button" class="aiw-picker-item" id="aiw-share-md">' +
          '<span class="aiw-picker-icon"><i class="fa-brands fa-markdown"></i></span>' +
          '<div class="aiw-picker-text"><div class="aiw-picker-title">导出为 Markdown (.md)</div><div class="aiw-picker-desc">保留完整排版与代码块格式</div></div>' +
        '</button>' +
        '<button type="button" class="aiw-picker-item" id="aiw-share-txt">' +
          '<span class="aiw-picker-icon"><i class="fa-regular fa-file-lines"></i></span>' +
          '<div class="aiw-picker-text"><div class="aiw-picker-title">导出为纯文本 (.txt)</div><div class="aiw-picker-desc">通用纯文本归档文件</div></div>' +
        '</button>' +
        (canNativeShare
          ? '<button type="button" class="aiw-picker-item" id="aiw-share-native">' +
              '<span class="aiw-picker-icon"><i class="fa-solid fa-share-nodes"></i></span>' +
              '<div class="aiw-picker-text"><div class="aiw-picker-title">调用系统分享</div><div class="aiw-picker-desc">通过设备系统分享面板发送</div></div>' +
            '</button>'
          : '') +
      '</div>';

    var modal = showInlineModal(page, '分享消息', bodyHtml, '');
    if (!modal) return;
    var safeSlug = chatTitle.replace(/[\\/:*?"<>|]/g, '_').slice(0, 24) || 'zhiyu-message';

    modal.querySelector('#aiw-share-copy').addEventListener('click', async function() {
      var ok = await copyTextSafely(formattedText);
      if (ok) closeInlineModal(page);
    });
    modal.querySelector('#aiw-share-md').addEventListener('click', function() {
      var mdDoc = '# ' + chatTitle + '\n\n> ' + roleLabel + '\n\n' + text + '\n';
      downloadWorkspaceTextFile(safeSlug + '.md', mdDoc, 'text/markdown;charset=utf-8');
      closeInlineModal(page);
    });
    modal.querySelector('#aiw-share-txt').addEventListener('click', function() {
      downloadWorkspaceTextFile(safeSlug + '.txt', formattedText, 'text/plain;charset=utf-8');
      closeInlineModal(page);
    });
    var nativeBtn = modal.querySelector('#aiw-share-native');
    if (nativeBtn) {
      nativeBtn.addEventListener('click', async function() {
        try {
          await navigator.share({ title: chatTitle, text: formattedText });
          closeInlineModal(page);
        } catch (err) {
          if (!err || err.name !== 'AbortError') {
            notifyToast('系统分享不可用，已为您复制文本');
            await copyTextSafely(formattedText);
          }
        }
      });
    }
  }

  function extractWebPreviewPayload(rawContent, isDarkTheme) {
    var src = String(rawContent || '');
    var htmlBlocks = [];
    var fenceRe = /```(html|htm|svg)\s*\n([\s\S]*?)```/gi;
    var match;
    while ((match = fenceRe.exec(src)) !== null) {
      if (match[2] && match[2].trim()) {
        htmlBlocks.push(match[2].trim());
      }
    }

    var modeLabel = 'Markdown 安全排版视图';
    var rawSourceHtml = '';
    var extractedCode = '';
    if (htmlBlocks.length) {
      modeLabel = 'HTML / SVG 安全沙箱渲染（共 ' + htmlBlocks.length + ' 段）';
      extractedCode = htmlBlocks.join('\n\n');
    } else if (/^\s*(?:<!doctype\s+html|<html\b|<div\b|<section\b|<main\b|<article\b|<table\b|<svg\b|<style\b)/i.test(src)) {
      modeLabel = 'HTML 原文安全沙箱渲染';
      extractedCode = src.trim();
    }

    var cspMeta = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; img-src data: blob:; font-src data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\';">';
    var baseStyle =
      '<style>' +
        'html,body{margin:0;padding:14px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.65;word-break:break-word;' +
        (isDarkTheme ? 'background:#16171a;color:#f2f2f3;' : 'background:#ffffff;color:#1f2328;') + '}' +
        'pre{overflow:auto;padding:10px 12px;border-radius:10px;background:' + (isDarkTheme ? '#222429' : '#f4f4f5') + ';}' +
        'code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;}' +
        'table{border-collapse:collapse;width:100%;margin:8px 0;}th,td{border:1px solid ' + (isDarkTheme ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.12)') + ';padding:6px 10px;text-align:left;}' +
        'blockquote{margin:8px 0;padding:4px 12px;border-left:3px solid #ec4899;opacity:.9;}' +
        'img,svg{max-width:100%;height:auto;}' +
      '</style>';

    if (extractedCode) {
      rawSourceHtml = extractedCode;
      // 剥离原文档中可能削弱隔离策略的 meta CSP 或 base 标签
      var cleaned = extractedCode
        .replace(/<meta[^>]*http-equiv\s*=\s*['"]?Content-Security-Policy['"]?[^>]*>/gi, '')
        .replace(/<base\b[^>]*>/gi, '');
      var srcdoc = '';
      if (/<html[\s>]/i.test(cleaned)) {
        if (/<head[\s>]/i.test(cleaned)) {
          srcdoc = cleaned.replace(/<head([^>]*)>/i, '<head$1>' + cspMeta);
        } else {
          srcdoc = cleaned.replace(/<html([^>]*)>/i, '<html$1><head>' + cspMeta + '</head>');
        }
      } else {
        srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8">' + cspMeta + baseStyle + '</head><body>' + cleaned + '</body></html>';
      }
      return { modeLabel: modeLabel, srcdoc: srcdoc, sourceCode: rawSourceHtml };
    }

    var renderedMd = renderMarkdownHtml(src);
    rawSourceHtml = renderedMd;
    var mdDoc = '<!DOCTYPE html><html><head><meta charset="utf-8">' + cspMeta + baseStyle +
      '<style>.aiw-code-copy-btn{display:none;}.aiw-code-block{margin:10px 0;border:1px solid ' + (isDarkTheme ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.09)') + ';border-radius:10px;overflow:hidden;}.aiw-code-head{padding:5px 10px;font-size:11px;opacity:.75;border-bottom:1px solid ' + (isDarkTheme ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.07)') + ';}</style>' +
      '</head><body>' + renderedMd + '</body></html>';
    return { modeLabel: modeLabel, srcdoc: mdDoc, sourceCode: rawSourceHtml };
  }

  function openWebViewRenderModal(page, msg) {
    if (!msg) return;
    var content = String(msg.content || msg.error || '').trim();
    if (!content) {
      notifyToast('该消息暂无可渲染的内容');
      return;
    }
    var isDark = page.classList.contains('aiw-theme-dark');
    var payload = extractWebPreviewPayload(content, isDark);

    var bodyHtml =
      '<div class="aiw-webview-banner">' +
        '<i class="fa-solid fa-shield-halved"></i>' +
        '<span>' + escapeHtml(payload.modeLabel) + ' · 沙箱隔离（禁止访问本地数据与网络）</span>' +
      '</div>' +
      '<div class="aiw-webview-tabs">' +
        '<button type="button" class="aiw-webview-tab is-active" data-wv-tab="preview">渲染预览</button>' +
        '<button type="button" class="aiw-webview-tab" data-wv-tab="source">HTML 源码</button>' +
      '</div>' +
      '<div class="aiw-webview-stage" id="aiw-wv-preview-pane">' +
        '<iframe class="aiw-webview-iframe" id="aiw-wv-iframe" sandbox="allow-scripts" referrerpolicy="no-referrer" title="安全网页视图预览"></iframe>' +
      '</div>' +
      '<pre class="aiw-webview-source" id="aiw-wv-source-pane" hidden>' + escapeHtml(payload.sourceCode) + '</pre>';

    var footerHtml =
      '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-wv-copy-src">复制源码</button>' +
      '<button type="button" class="aiw-st-btn-primary aiw-st-btn-sm" id="aiw-wv-close">关闭</button>';

    var modal = showInlineModal(page, '网页视图渲染', bodyHtml, footerHtml);
    if (!modal) return;
    var dialogEl = modal.querySelector('.aiw-ws-modal');
    if (dialogEl) dialogEl.classList.add('aiw-webview-modal');

    var iframeEl = modal.querySelector('#aiw-wv-iframe');
    if (iframeEl) {
      iframeEl.srcdoc = payload.srcdoc;
    }

    var previewPane = modal.querySelector('#aiw-wv-preview-pane');
    var sourcePane = modal.querySelector('#aiw-wv-source-pane');
    modal.querySelectorAll('[data-wv-tab]').forEach(function(tabBtn) {
      tabBtn.addEventListener('click', function() {
        var tab = tabBtn.getAttribute('data-wv-tab');
        modal.querySelectorAll('[data-wv-tab]').forEach(function(b) {
          b.classList.toggle('is-active', b === tabBtn);
        });
        if (previewPane) previewPane.hidden = tab !== 'preview';
        if (sourcePane) sourcePane.hidden = tab !== 'source';
      });
    });

    modal.querySelector('#aiw-wv-copy-src').addEventListener('click', function() {
      copyTextSafely(payload.sourceCode);
    });
    modal.querySelector('#aiw-wv-close').addEventListener('click', function() {
      closeInlineModal(page);
    });
  }

  function detectPreferredTranslationTarget(text) {
    var src = String(text || '');
    var zhCount = (src.match(/[\u4e00-\u9fff]/g) || []).length;
    var enCount = (src.match(/[a-zA-Z]/g) || []).length;
    if (zhCount >= 4 && zhCount >= enCount * 0.25) {
      return TRANSLATION_TARGETS[1]; // 英文
    }
    return TRANSLATION_TARGETS[0]; // 简体中文
  }

  async function translateMessageToLanguage(page, msg, langCode, langLabel, langHint) {
    if (!msg) return;
    var text = String(msg.content || '').trim();
    if (!text) {
      notifyToast('该消息暂无可翻译的正文内容');
      return;
    }
    if (!AI() || typeof AI().requestChatCompletion !== 'function') {
      notifyToast('AI 引擎尚未就绪');
      return;
    }

    var effective = await refreshEffectiveApi();
    if (!effective || !effective.configured) {
      var warnModal = showInlineModal(
        page,
        '尚未配置可用的 AI API',
        '<p class="aiw-st-modal-msg">翻译功能需要调用模型接口，请先在弯弯机设置或「知屿专属 API」中完成配置。</p>',
        '<button type="button" class="aiw-st-btn-secondary aiw-st-btn-sm" id="aiw-tr-noapi-cancel">取消</button>' +
        '<button type="button" class="aiw-st-btn-primary aiw-st-btn-sm" id="aiw-tr-noapi-go">前往配置</button>'
      );
      if (warnModal) {
        warnModal.querySelector('#aiw-tr-noapi-cancel').addEventListener('click', function() { closeInlineModal(page); });
        warnModal.querySelector('#aiw-tr-noapi-go').addEventListener('click', function() {
          closeInlineModal(page);
          openSettingsView(page, 'custom-api');
        });
      }
      return;
    }

    _state.translatingMap[msg.id] = { lang: langCode, label: langLabel };
    updateMainStage(page, { preserveScroll: true });

    try {
      var targetDesc = langHint ? (langLabel + ' (' + langHint + ')') : langLabel;
      var res = await AI().requestChatCompletion({
        apiConfig: effective,
        model: effective.model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: '你是专业翻译助手。请将用户提供的全部文本准确、自然地翻译为「' + targetDesc + '」。要求：严格保留原有 Markdown 结构、代码块（代码变量名与代码本身不要篡改）、列表和换行排版；只输出翻译结果本身，不要附带任何前言、解释或额外说明。'
          },
          {
            role: 'user',
            content: text
          }
        ]
      });
      var translatedText = String((res && res.content) || '').trim();
      if (!translatedText) {
        throw new Error('模型未返回有效译文');
      }
      var liveMsg = _state.messages.find(function(m) { return m.id === msg.id; });
      if (liveMsg) {
        if (!liveMsg.translations || typeof liveMsg.translations !== 'object') {
          liveMsg.translations = {};
        }
        liveMsg.translations[langCode] = {
          lang: langCode,
          langLabel: langLabel,
          text: translatedText,
          model: (res && res.model) || effective.model || '',
          updatedAt: Date.now()
        };
        _state.activeTranslationLangMap[liveMsg.id] = langCode;
        await persistCurrentChatMessages();
      }
      notifyToast('已翻译为' + langLabel + '（已保留原文）');
    } catch (err) {
      notifyToast('翻译失败：' + String((err && err.message) || '请稍后重试'));
    } finally {
      delete _state.translatingMap[msg.id];
      updateMainStage(page, { preserveScroll: true });
    }
  }

  function openTranslateTargetModal(page, msg) {
    if (!msg) return;
    if (!String(msg.content || '').trim()) {
      notifyToast('该消息暂无可翻译的正文内容');
      return;
    }
    var recommended = detectPreferredTranslationTarget(msg.content);
    var existingMap = (msg.translations && typeof msg.translations === 'object') ? msg.translations : {};

    var quickBtnsHtml = TRANSLATION_TARGETS.map(function(t) {
      var isRec = t.lang === recommended.lang;
      var hasCached = !!(existingMap[t.lang] && existingMap[t.lang].text);
      return (
        '<button type="button" class="aiw-picker-item' + (isRec ? ' is-selected' : '') + '" data-tr-lang="' + escapeHtml(t.lang) + '" data-tr-label="' + escapeHtml(t.label) + '" data-tr-hint="' + escapeHtml(t.hint) + '">' +
          '<span class="aiw-picker-icon"><i class="fa-solid fa-language"></i></span>' +
          '<div class="aiw-picker-text">' +
            '<div class="aiw-picker-title">' + escapeHtml(t.label) +
              (isRec ? ' <span class="aiw-mini-badge">推荐</span>' : '') +
              (hasCached ? ' <span class="aiw-mini-badge">已译</span>' : '') +
            '</div>' +
            '<div class="aiw-picker-desc">' + (hasCached ? '点击重新翻译或刷新译文' : '翻译为 ' + escapeHtml(t.hint) + '（不覆盖原文）') + '</div>' +
          '</div>' +
        '</button>'
      );
    }).join('');

    var bodyHtml =
      '<div class="aiw-msg-op-tip">选择目标语言，译文将在原回复下方独立展示，不会覆盖原文。</div>' +
      '<div class="aiw-model-manual-row">' +
        '<input type="text" class="aiw-field-input" id="aiw-tr-custom-input" placeholder="或输入其他目标语言（如：俄语 / 泰语）...">' +
        '<button type="button" class="aiw-st-btn-primary aiw-st-btn-sm" id="aiw-tr-custom-go">翻译</button>' +
      '</div>' +
      '<div class="aiw-picker-list aiw-model-picker-list">' + quickBtnsHtml + '</div>';

    var modal = showInlineModal(page, '翻译回复', bodyHtml, '');
    if (!modal) return;

    modal.querySelectorAll('[data-tr-lang]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var lang = btn.getAttribute('data-tr-lang');
        var label = btn.getAttribute('data-tr-label') || lang;
        var hint = btn.getAttribute('data-tr-hint') || label;
        closeInlineModal(page);
        translateMessageToLanguage(page, msg, lang, label, hint);
      });
    });

    modal.querySelector('#aiw-tr-custom-go').addEventListener('click', function() {
      var customEl = modal.querySelector('#aiw-tr-custom-input');
      var customLang = String(customEl ? customEl.value : '').trim();
      if (!customLang) {
        notifyToast('请输入目标语言名称');
        return;
      }
      closeInlineModal(page);
      translateMessageToLanguage(page, msg, 'custom:' + customLang, customLang, customLang);
    });
  }

  function openMessageMoreMenu(page, msg) {
    if (!page || !msg) return;
    var isFav = isMessageFavoritedInState(msg.id);
    var roleText = msg.role === 'user' ? '我的消息' : '知屿回复';
    var preview = String(msg.content || msg.error || '').replace(/\s+/g, ' ').trim();
    if (preview.length > 72) preview = preview.slice(0, 72) + '…';

    var menuItems = [
      { act: 'copy', icon: 'fa-regular fa-copy', label: '复制' },
      { act: 'quote', icon: 'fa-solid fa-reply', label: '引用' },
      { act: 'forward', icon: 'fa-solid fa-share', label: '转发' },
      { act: 'select-text', icon: 'fa-solid fa-i-cursor', label: '选择文本' },
      { act: 'edit', icon: 'fa-regular fa-pen-to-square', label: '编辑' },
      { act: 'delete', icon: 'fa-regular fa-trash-can', label: '删除', danger: true },
      { act: 'regen', icon: 'fa-solid fa-rotate-right', label: '重新生成' },
      { act: 'favorite', icon: isFav ? 'fa-solid fa-star' : 'fa-regular fa-star', label: isFav ? '取消收藏' : '添加收藏', active: isFav },
      { act: 'share', icon: 'fa-solid fa-arrow-up-from-bracket', label: '分享' },
      { act: 'branch', icon: 'fa-solid fa-code-branch', label: '创建分支' },
      { act: 'web-preview', icon: 'fa-solid fa-globe', label: '网页视图渲染' }
    ];

    var gridHtml = menuItems.map(function(item) {
      var cls = 'aiw-msg-menu-item' +
        (item.danger ? ' is-danger' : '') +
        (item.active ? ' is-active' : '');
      return (
        '<button type="button" class="' + cls + '" data-menu-act="' + escapeHtml(item.act) + '">' +
          '<span class="aiw-msg-menu-icon"><i class="' + escapeHtml(item.icon) + '"></i></span>' +
          '<span class="aiw-msg-menu-label">' + escapeHtml(item.label) + '</span>' +
        '</button>'
      );
    }).join('');

    var bodyHtml =
      '<div class="aiw-msg-menu-preview">' +
        '<span class="aiw-msg-menu-role">' + escapeHtml(roleText) + '</span>' +
        '<div class="aiw-msg-menu-snippet">' + escapeHtml(preview || '（空白消息）') + '</div>' +
      '</div>' +
      '<div class="aiw-msg-menu-grid">' + gridHtml + '</div>';

    var modal = showInlineModal(page, '消息操作', bodyHtml, '');
    if (!modal) return;
    var dialog = modal.querySelector('.aiw-ws-modal');
    if (dialog) dialog.classList.add('aiw-msg-menu-dialog');

    modal.querySelectorAll('[data-menu-act]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var act = btn.getAttribute('data-menu-act');
        closeInlineModal(page);
        if (act === 'copy') {
          await copyTextSafely(msg.content || msg.error || '');
        } else if (act === 'quote') {
          quoteMessageAction(page, msg);
        } else if (act === 'forward') {
          await openForwardMessageModal(page, msg);
        } else if (act === 'select-text') {
          openSelectTextModal(page, msg);
        } else if (act === 'edit') {
          openEditMessageModal(page, msg);
        } else if (act === 'delete') {
          confirmDeleteMessage(page, msg);
        } else if (act === 'regen') {
          await regenerateAtMessage(page, msg.id);
        } else if (act === 'favorite') {
          await toggleFavoriteMessageAction(page, msg);
        } else if (act === 'share') {
          openShareMessageModal(page, msg);
        } else if (act === 'branch') {
          await branchChatFromMessage(page, msg);
        } else if (act === 'web-preview') {
          openWebViewRenderModal(page, msg);
        }
      });
    });
  }

  function bindMessageListDelegation(page) {
    var msgList = page.querySelector('#aiw-message-list');
    if (!msgList || msgList._aiwBound) return;
    msgList._aiwBound = true;

    msgList.addEventListener('click', function(e) {
      var copyCodeBtn = e.target.closest && e.target.closest('.aiw-code-copy-btn');
      if (copyCodeBtn) {
        var encoded = copyCodeBtn.getAttribute('data-copy-code') || '';
        try {
          copyTextSafely(decodeURIComponent(encoded));
        } catch (_) {
          copyTextSafely(encoded);
        }
        return;
      }

      var retryBtn = e.target.closest && e.target.closest('.aiw-tool-retry-btn');
      if (retryBtn) {
        var msgId = retryBtn.getAttribute('data-msg-id');
        var toolId = retryBtn.getAttribute('data-tool-id');
        retryToolCall(page, msgId, toolId);
        return;
      }

      var actBtn = e.target.closest && e.target.closest('[data-msg-act]');
      if (!actBtn) return;
      var act = actBtn.getAttribute('data-msg-act');
      var msgId = actBtn.getAttribute('data-msg-id');
      var targetMsg = _state.messages.find(function(m) { return m.id === msgId; });
      if (!targetMsg) return;

      if (act === 'copy') {
        copyTextSafely(targetMsg.content || targetMsg.error || '');
      } else if (act === 'edit') {
        openEditMessageModal(page, targetMsg);
      } else if (act === 'regen') {
        regenerateAtMessage(page, msgId);
      } else if (act === 'translate') {
        openTranslateTargetModal(page, targetMsg);
      } else if (act === 'more') {
        openMessageMoreMenu(page, targetMsg);
      } else if (act === 'copy-trans') {
        var lang = actBtn.getAttribute('data-trans-lang') || '';
        var tObj = targetMsg.translations && targetMsg.translations[lang];
        if (tObj && tObj.text) copyTextSafely(tObj.text);
      } else if (act === 'hide-trans') {
        _state.activeTranslationLangMap[targetMsg.id] = '__hidden__';
        updateMainStage(page, { preserveScroll: true });
      } else if (act === 'switch-trans-lang') {
        var nextLang = actBtn.getAttribute('data-trans-lang') || '';
        if (nextLang) {
          _state.activeTranslationLangMap[targetMsg.id] = nextLang;
          updateMainStage(page, { preserveScroll: true });
        }
      }
    });
  }

  async function retryToolCall(page, msgId, toolId) {
    var targetMsg = _state.messages.find(function(m) { return m.id === msgId; });
    if (!targetMsg || !Array.isArray(targetMsg.toolCalls)) return;
    var tc = targetMsg.toolCalls.find(function(t) { return t.id === toolId; });
    if (!tc) return;

    var pluginApi = global.AiWorkspacePlugins || null;
    if (!pluginApi || typeof pluginApi.invokeTool !== 'function') {
      notifyToast('插件系统不可用');
      return;
    }

    tc.status = 'running';
    tc.summaryText = '正在重新使用 ' + (tc.toolLabel || tc.name || '工具') + '…';
    tc.error = '';
    updateMainStage(page, { preserveScroll: true });

    var activeChatId = _state.activeChat ? _state.activeChat.id : '';
    var parsedArgs = {};
    try {
      parsedArgs = tc.argumentsText ? JSON.parse(tc.argumentsText) : {};
    } catch (_) {}

    var startedAt = Date.now();
    try {
      var invokeRes = await pluginApi.invokeTool(tc.fullName || tc.name, parsedArgs, {
        chatId: activeChatId,
        source: 'user_retry'
      });
      var duration = Math.max(0, Date.now() - startedAt);
      tc.durationMs = duration;
      var resData = invokeRes ? (invokeRes.data !== undefined ? invokeRes.data : invokeRes.result) : null;
      if (invokeRes && invokeRes.ok) {
        tc.status = 'success';
        tc.error = '';
        try {
          tc.resultText = JSON.stringify(resData, null, 2);
        } catch (_) {
          tc.resultText = String(resData || '');
        }
        tc.summaryText = formatToolCallSummary(tc.fullName || tc.name, resData, '');
        notifyToast('工具重试成功');
      } else {
        tc.status = 'error';
        tc.error = (invokeRes && invokeRes.error) ? String(invokeRes.error) : '工具执行失败';
        tc.summaryText = tc.error;
        tc.resultText = JSON.stringify({ ok: false, error: tc.error });
        notifyToast('工具重试失败：' + tc.error);
      }
    } catch (err) {
      tc.status = 'error';
      tc.error = (err && err.message) ? err.message : '工具执行异常';
      tc.summaryText = tc.error;
      tc.resultText = JSON.stringify({ ok: false, error: tc.error });
      notifyToast('工具重试异常');
    }

    updateMainStage(page, { preserveScroll: true });
    await persistCurrentChatMessages();
  }

  function formatToolCallSummary(fullName, resData, errMsg) {
    if (errMsg) return String(errMsg);
    if (!resData || typeof resData !== 'object') return '已完成';
    if (fullName === 'builtin_time_utils.get_current_datetime') {
      return (resData.date || '') + ' ' + (resData.weekday || '') + ' ' + (resData.time || '') + (resData.utcOffset ? (' (' + resData.utcOffset + ')') : '');
    }
    if (fullName === 'builtin_dice_roller.roll_dice') {
      var rollsStr = Array.isArray(resData.rolls) ? ('[' + resData.rolls.join(', ') + ']') : '';
      return (resData.notation || '骰子') + ' → ' + rollsStr + ' = ' + (resData.total != null ? resData.total : '');
    }
    if (fullName === 'builtin_calculator.calculate_expression') {
      return (resData.expression || '') + ' = ' + (resData.result != null ? resData.result : '');
    }
    if (fullName === 'builtin_rp_random_event.generate_random_event') {
      return (resData.eventTitle ? ('[' + resData.eventTitle + '] ') : '') + (resData.eventSuggestion || '已生成随机事件建议');
    }
    if (fullName === 'builtin_rp_story_state.get_story_state') {
      var relN = Array.isArray(resData.relationships) ? resData.relationships.length : 0;
      var locN = Array.isArray(resData.locations) ? resData.locations.length : 0;
      var evtN = Array.isArray(resData.currentEvents) ? resData.currentEvents.length : 0;
      var unrN = Array.isArray(resData.unresolvedItems) ? resData.unresolvedItems.length : 0;
      return '人物关系 ' + relN + ' · 地点 ' + locN + ' · 事件 ' + evtN + ' · 待解决 ' + unrN;
    }
    if (resData.text) {
      var txt = String(resData.text).trim();
      return txt.length > 90 ? (txt.slice(0, 90) + '…') : txt;
    }
    return '已完成';
  }

  function renderToolCallsHtml(msg) {
    var list = msg && Array.isArray(msg.toolCalls) ? msg.toolCalls : [];
    if (!list.length) return '';
    var itemsHtml = list.map(function(tc) {
      var statusCls = tc.status === 'error' ? ' is-error' : (tc.status === 'running' ? ' is-running' : ' is-success');
      var statusText = tc.status === 'error' ? '失败' : (tc.status === 'running' ? '调用中' : '已完成');
      var titleText = tc.pluginName ? (tc.pluginName + ' · ' + (tc.toolLabel || tc.name)) : (tc.toolLabel || tc.name || '内置工具');
      var summary = tc.summaryText || statusText;
      var detailBody = '';
      if (tc.argumentsText || tc.resultText || tc.error) {
        detailBody =
          '<details class="aiw-tool-call-details">' +
            '<summary>查看详情' + (tc.durationMs ? (' (' + tc.durationMs + 'ms)') : '') + '</summary>' +
            (tc.argumentsText ? ('<div class="aiw-tool-call-kv"><span>参数：</span><code>' + escapeHtml(tc.argumentsText) + '</code></div>') : '') +
            (tc.resultText ? ('<div class="aiw-tool-call-kv"><span>结果：</span><pre>' + escapeHtml(tc.resultText) + '</pre></div>') : '') +
          '</details>';
      }
      var retryBtnHtml = '';
      if (tc.status === 'error') {
        retryBtnHtml = '<button type="button" class="aiw-tool-retry-btn" data-msg-id="' + escapeHtml(msg.id) + '" data-tool-id="' + escapeHtml(tc.id) + '"><i class="fa-solid fa-rotate-right"></i> 重试工具</button>';
      }
      return (
        '<div class="aiw-tool-call-item' + statusCls + '">' +
          '<div class="aiw-tool-call-head">' +
            '<span class="aiw-tool-call-name"><i class="fa-solid fa-puzzle-piece"></i> ' + escapeHtml(titleText) + '</span>' +
            '<span class="aiw-tool-call-badge' + statusCls + '">' + escapeHtml(statusText) + '</span>' +
          '</div>' +
          '<div class="aiw-tool-call-summary">' + escapeHtml(summary) + '</div>' +
          detailBody +
          retryBtnHtml +
        '</div>'
      );
    }).join('');
    return '<div class="aiw-tool-calls-wrap" aria-label="插件调用记录">' + itemsHtml + '</div>';
  }

  function updateStreamingBubbleDom(page, msg) {
    if (!page || !msg) return;
    var row = Array.from(page.querySelectorAll('.aiw-msg-row')).find(function(el) {
      return el.getAttribute('data-msg-id') === msg.id;
    });
    if (!row) {
      updateMainStage(page);
      return;
    }
    var existingToolWrap = row.querySelector('.aiw-tool-calls-wrap');
    var nextToolHtml = renderToolCallsHtml(msg);
    if (nextToolHtml) {
      var tempDiv = document.createElement('div');
      tempDiv.innerHTML = nextToolHtml;
      var nextToolEl = tempDiv.firstElementChild;
      if (existingToolWrap) {
        existingToolWrap.replaceWith(nextToolEl);
      } else {
        var bubbleRef = row.querySelector('.aiw-msg-bubble');
        if (bubbleRef) row.insertBefore(nextToolEl, bubbleRef);
      }
    } else if (existingToolWrap) {
      existingToolWrap.remove();
    }
    var bubble = row.querySelector('.aiw-msg-bubble');
    if (bubble) {
      bubble.innerHTML = msg.content
        ? renderMarkdownHtml(msg.content)
        : '<div class="aiw-streaming-placeholder"><span class="aiw-pulse-dot"></span><span>正在思考并生成回答...</span></div>';
    }
    var statusEl = row.querySelector('.aiw-msg-status');
    if (msg.content && !statusEl) {
      var st = document.createElement('div');
      st.className = 'aiw-msg-status';
      st.innerHTML = '<span class="aiw-pulse-dot"></span><span>正在输出...</span>';
      row.appendChild(st);
    }

    var scrollEl = page.querySelector('#aiw-main-scroll');
    if (scrollEl) {
      var distFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (distFromBottom < 120) {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      }
    }
  }

  function syncComposerPlaceholder(page) {
    if (!page) return;
    var inputEl = page.querySelector('#aiw-input');
    if (!inputEl) return;
    if (_state.activeProjectHomeId && !_state.activeChat) {
      var proj = (_state.projects || []).find(function(p) { return p && p.id === _state.activeProjectHomeId; });
      inputEl.placeholder = proj ? ('在 ' + proj.name + ' 中开始新聊天') : '在项目中开始新聊天';
    } else {
      inputEl.placeholder = '问点什么...';
    }
  }

  function restoreComposerToBottom(page) {
    if (!page) return;
    var composerWrap = page.querySelector('.aiw-composer-wrap');
    var mainScroll = page.querySelector('#aiw-main-scroll');
    if (!composerWrap || !mainScroll || !mainScroll.parentNode) return;
    if (composerWrap.parentNode !== page) {
      mainScroll.insertAdjacentElement('afterend', composerWrap);
    }
    page.classList.remove('is-project-home');
  }

  async function renderProjectHomeStage(page) {
    if (!page || !_state.activeProjectHomeId) return;
    var host = page.querySelector('#aiw-project-home-stage');
    if (!host) return;
    var pid = _state.activeProjectHomeId;
    var proj = S() && typeof S().getProject === 'function'
      ? await S().getProject(pid)
      : ((_state.projects || []).find(function(p) { return p && p.id === pid; }) || null);

    // 异步校验：若在等待期间切换了项目或离开了项目主页，直接中止渲染
    if (_state.activeProjectHomeId !== pid) return;
    if (!proj) {
      _state.activeProjectHomeId = null;
      saveProjectHomeUiState();
      restoreComposerToBottom(page);
      syncComposerPlaceholder(page);
      updateMainStage(page);
      return;
    }

    var color = proj.color || '#ec4899';
    var iconRenderer = (global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.renderProjectIconHtml === 'function')
      ? global.AiWorkspaceProjects.renderProjectIconHtml
      : function(ic) { return '<i class="' + escapeHtml(ic || 'fa-solid fa-folder') + '"></i>'; };
    var formatTimeFn = (global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.formatTime === 'function')
      ? global.AiWorkspaceProjects.formatTime
      : function(ts) { return ts ? new Date(ts).toLocaleString() : ''; };
    var formatBytesFn = (global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.formatBytes === 'function')
      ? global.AiWorkspaceProjects.formatBytes
      : function(b) { return (b || 0) + ' B'; };

    var allChats = S() ? await S().listChats() : (_state.chats || []);
    var projDocs = (S() && typeof S().listProjectDocuments === 'function')
      ? await S().listProjectDocuments(pid)
      : [];

    if (_state.activeProjectHomeId !== pid) return;

    var projChats = allChats.filter(function(c) { return c && c.projectId === pid; })
      .sort(function(a, b) { return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0); });

    var docSort = _state.activeProjectHomeDocSort || 'time_desc';
    var sortedDocs = projDocs.slice().sort(function(a, b) {
      if (docSort === 'name_asc') {
        return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
      }
      if (docSort === 'size_desc') {
        return (Number(b.size) || 0) - (Number(a.size) || 0);
      }
      return (Number(b.createdAt || b.updatedAt) || 0) - (Number(a.createdAt || a.updatedAt) || 0);
    });

    var activeTab = _state.activeProjectHomeTab === 'sources' ? 'sources' : 'chats';

    var listBodyHtml = '';
    if (activeTab === 'chats') {
      if (projChats.length === 0) {
        listBodyHtml =
          '<div class="aiw-proj-home-empty">' +
            '<div class="aiw-proj-home-empty-icon"><i class="fa-regular fa-comments"></i></div>' +
            '<div class="aiw-proj-home-empty-title">暂无聊天记录</div>' +
            '<div class="aiw-proj-home-empty-text">在上方输入框发送消息，即可在本项目中开始新聊天。</div>' +
          '</div>';
      } else {
        listBodyHtml =
          '<div class="aiw-proj-home-list">' +
            projChats.map(function(c) {
              var msgCount = Array.isArray(c.messages) ? c.messages.length : 0;
              var timeStr = formatTimeFn(c.updatedAt || c.createdAt);
              return (
                '<div class="aiw-proj-home-row" data-ph-chat-id="' + escapeHtml(c.id) + '">' +
                  '<div class="aiw-proj-home-row-main">' +
                    '<div class="aiw-proj-home-row-title">' +
                      (c.pinned ? '<i class="fa-solid fa-thumbtack" style="color:var(--aiw-pink-deep); margin-right:5px;"></i>' : '') +
                      escapeHtml(c.title || '新对话') +
                    '</div>' +
                    '<div class="aiw-proj-home-row-sub">' + msgCount + ' 条消息 · ' + escapeHtml(timeStr) + '</div>' +
                  '</div>' +
                  '<div class="aiw-proj-home-row-actions">' +
                    '<button type="button" class="aiw-icon-btn" data-ph-chat-pin="' + escapeHtml(c.id) + '" title="' + (c.pinned ? '取消置顶' : '置顶聊天') + '"><i class="fa-solid fa-thumbtack' + (c.pinned ? ' is-pinned-ic' : '') + '"></i></button>' +
                    '<button type="button" class="aiw-icon-btn" data-ph-chat-rename="' + escapeHtml(c.id) + '" title="重命名"><i class="fa-solid fa-pen"></i></button>' +
                    '<button type="button" class="aiw-icon-btn" data-ph-chat-move="' + escapeHtml(c.id) + '" title="移动到其他项目 / 移出"><i class="fa-solid fa-share-from-square"></i></button>' +
                    '<button type="button" class="aiw-icon-btn is-danger" data-ph-chat-del="' + escapeHtml(c.id) + '" title="删除"><i class="fa-regular fa-trash-can"></i></button>' +
                  '</div>' +
                '</div>'
              );
            }).join('') +
          '</div>';
      }
    } else {
      listBodyHtml =
        '<input type="file" id="aiw-ph-doc-input" accept=".txt,.md,.markdown,.pdf,.docx" multiple style="display:none;">' +
        (sortedDocs.length === 0
          ? '<div class="aiw-proj-home-empty">' +
              '<div class="aiw-proj-home-empty-icon"><i class="fa-regular fa-file-lines"></i></div>' +
              '<div class="aiw-proj-home-empty-title">为项目添加资料</div>' +
              '<div class="aiw-proj-home-empty-text">上传文件，让项目中的 AI 聊天能够参考这些内容。</div>' +
              '<button type="button" class="aiw-primary-btn aiw-btn-sm" id="aiw-ph-doc-upload-empty" style="background-color:' + escapeHtml(color) + '; margin-top:4px;"><i class="fa-solid fa-plus"></i> 添加来源</button>' +
            '</div>'
          : '<div class="aiw-proj-home-sources-bar">' +
              '<select class="aiw-ph-sort-select" id="aiw-ph-doc-sort" aria-label="排序方式">' +
                '<option value="time_desc"' + (docSort === 'time_desc' ? ' selected' : '') + '>按上传时间（最新）</option>' +
                '<option value="name_asc"' + (docSort === 'name_asc' ? ' selected' : '') + '>按文件名称</option>' +
                '<option value="size_desc"' + (docSort === 'size_desc' ? ' selected' : '') + '>按文件大小</option>' +
              '</select>' +
              '<button type="button" class="aiw-primary-btn aiw-btn-sm" id="aiw-ph-doc-upload" style="background-color:' + escapeHtml(color) + ';"><i class="fa-solid fa-plus"></i> 添加来源</button>' +
            '</div>' +
            '<div class="aiw-proj-home-list">' +
              sortedDocs.map(function(doc) {
                var iconCls = 'fa-solid fa-file-lines';
                if (doc.type === 'pdf') iconCls = 'fa-solid fa-file-pdf';
                else if (doc.type === 'docx') iconCls = 'fa-solid fa-file-word';
                else if (doc.type === 'md' || doc.type === 'markdown') iconCls = 'fa-solid fa-file-code';
                return (
                  '<div class="aiw-proj-home-row" data-ph-doc-id="' + escapeHtml(doc.id) + '">' +
                    '<div class="aiw-proj-home-row-main aiw-proj-home-doc-main">' +
                      '<span class="aiw-proj-home-doc-ic" style="color:' + escapeHtml(color) + ';"><i class="' + iconCls + '"></i></span>' +
                      '<div style="min-width:0; flex:1;">' +
                        '<div class="aiw-proj-home-row-title">' + escapeHtml(doc.name) + '</div>' +
                        '<div class="aiw-proj-home-row-sub">' + escapeHtml((doc.type || 'txt').toUpperCase()) + ' · ' + escapeHtml(formatBytesFn(doc.size)) + ' · ' + escapeHtml(formatTimeFn(doc.createdAt)) + '</div>' +
                      '</div>' +
                    '</div>' +
                    '<div class="aiw-proj-home-row-actions">' +
                      '<button type="button" class="aiw-icon-btn" data-ph-doc-view="' + escapeHtml(doc.id) + '" title="预览"><i class="fa-solid fa-eye"></i></button>' +
                      '<button type="button" class="aiw-icon-btn" data-ph-doc-rename="' + escapeHtml(doc.id) + '" title="重命名"><i class="fa-solid fa-pen"></i></button>' +
                      '<button type="button" class="aiw-icon-btn is-danger" data-ph-doc-del="' + escapeHtml(doc.id) + '" title="删除"><i class="fa-regular fa-trash-can"></i></button>' +
                    '</div>' +
                  '</div>'
                );
              }).join('') +
            '</div>');
    }

    // 保留现有 .aiw-composer-wrap DOM 节点（不重新创建输入组件）
    var composerWrap = page.querySelector('.aiw-composer-wrap');
    if (composerWrap && composerWrap.parentNode === host) {
      page.appendChild(composerWrap);
    }

    host.innerHTML =
      '<div class="aiw-proj-home-wrap">' +
        '<div class="aiw-proj-home-head">' +
          '<div class="aiw-proj-home-title-row">' +
            '<div class="aiw-proj-home-icon" style="background:' + escapeHtml(color) + '1a; color:' + escapeHtml(color) + ';">' + iconRenderer(proj.icon) + '</div>' +
            '<div class="aiw-proj-home-title-meta">' +
              '<h2 class="aiw-proj-home-title">' + escapeHtml(proj.name) + '</h2>' +
              (proj.description ? '<div class="aiw-proj-home-desc">' + escapeHtml(proj.description) + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<button type="button" class="aiw-icon-btn" id="aiw-proj-home-more-btn" title="更多操作"><i class="fa-solid fa-ellipsis"></i></button>' +
        '</div>' +
        '<div class="aiw-proj-home-composer-slot" id="aiw-proj-home-composer-slot"></div>' +
        '<div class="aiw-proj-home-tabs" role="tablist">' +
          '<button type="button" class="aiw-proj-home-tab' + (activeTab === 'chats' ? ' active' : '') + '" data-proj-home-tab="chats" role="tab">聊天 <span>' + projChats.length + '</span></button>' +
          '<button type="button" class="aiw-proj-home-tab' + (activeTab === 'sources' ? ' active' : '') + '" data-proj-home-tab="sources" role="tab">来源 <span>' + projDocs.length + '</span></button>' +
        '</div>' +
        '<div class="aiw-proj-home-body">' + listBodyHtml + '</div>' +
      '</div>';

    var slotEl = host.querySelector('#aiw-proj-home-composer-slot');
    if (composerWrap && slotEl) {
      slotEl.appendChild(composerWrap);
      page.classList.add('is-project-home');
    }

    var moreBtn = host.querySelector('#aiw-proj-home-more-btn');
    if (moreBtn && global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.openProjectPopoverMenu === 'function') {
      moreBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        global.AiWorkspaceProjects.openProjectPopoverMenu(page, proj, moreBtn, {
          mode: 'home',
          onDone: function() {
            reloadChatList(page);
            renderProjectHomeStage(page);
          },
          onDeleted: function() {
            _state.activeProjectHomeId = null;
            saveProjectHomeUiState();
            startNewChat(page, true);
            reloadChatList(page);
          }
        });
      });
    }

    host.querySelectorAll('[data-proj-home-tab]').forEach(function(tabBtn) {
      tabBtn.addEventListener('click', function() {
        _state.activeProjectHomeTab = tabBtn.getAttribute('data-proj-home-tab') || 'chats';
        saveProjectHomeUiState();
        renderProjectHomeStage(page);
      });
    });

    host.querySelectorAll('[data-ph-chat-id]').forEach(function(row) {
      row.addEventListener('click', async function(e) {
        if (e.target.closest('.aiw-proj-home-row-actions')) return;
        var cid = row.getAttribute('data-ph-chat-id');
        await loadChatIntoState(page, cid);
      });
    });

    host.querySelectorAll('[data-ph-chat-pin]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var cid = btn.getAttribute('data-ph-chat-pin');
        if (S() && typeof S().togglePinChat === 'function') {
          var updated = await S().togglePinChat(cid);
          notifyToast(updated && updated.pinned ? '已置顶对话' : '已取消置顶');
          await reloadChatList(page);
          renderProjectHomeStage(page);
        }
      });
    });

    host.querySelectorAll('[data-ph-chat-rename]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var cid = btn.getAttribute('data-ph-chat-rename');
        var target = await S().getChat(cid);
        if (target && global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.openChatRenameModal === 'function') {
          global.AiWorkspaceProjects.openChatRenameModal(page, target, async function() {
            await reloadChatList(page);
            renderProjectHomeStage(page);
          });
        }
      });
    });

    host.querySelectorAll('[data-ph-chat-move]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var cid = btn.getAttribute('data-ph-chat-move');
        var target = await S().getChat(cid);
        if (target && global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.openChatAssignProjectModal === 'function') {
          global.AiWorkspaceProjects.openChatAssignProjectModal(page, target, async function() {
            await reloadChatList(page);
            renderProjectHomeStage(page);
          });
        }
      });
    });

    host.querySelectorAll('[data-ph-chat-del]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var cid = btn.getAttribute('data-ph-chat-del');
        var target = await S().getChat(cid);
        if (target && global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.openChatDeleteConfirmModal === 'function') {
          global.AiWorkspaceProjects.openChatDeleteConfirmModal(page, target, async function() {
            await reloadChatList(page);
            renderProjectHomeStage(page);
          });
        }
      });
    });

    var sortSel = host.querySelector('#aiw-ph-doc-sort');
    if (sortSel) {
      sortSel.addEventListener('change', function() {
        _state.activeProjectHomeDocSort = sortSel.value || 'time_desc';
        saveProjectHomeUiState();
        renderProjectHomeStage(page);
      });
    }

    var docUploadBtn = host.querySelector('#aiw-ph-doc-upload');
    var docUploadEmptyBtn = host.querySelector('#aiw-ph-doc-upload-empty');
    var docInput = host.querySelector('#aiw-ph-doc-input');
    if (docInput) {
      if (docUploadBtn) docUploadBtn.addEventListener('click', function() { docInput.click(); });
      if (docUploadEmptyBtn) docUploadEmptyBtn.addEventListener('click', function() { docInput.click(); });
      docInput.addEventListener('change', async function() {
        var files = docInput.files;
        if (!files || files.length === 0) return;
        var uploadTargetPid = pid;
        var okCount = 0;
        var errs = [];
        for (var i = 0; i < files.length; i++) {
          try {
            var parsed = await global.AiWorkspaceProjects.parseUploadedFile(files[i]);
            await S().saveProjectDocument({
              projectId: uploadTargetPid,
              name: parsed.name,
              type: parsed.type,
              size: parsed.size,
              content: parsed.content
            });
            okCount++;
          } catch (err) {
            errs.push((files[i] && files[i].name ? files[i].name : '文件') + '：' + (err && err.message ? err.message : '解析失败'));
          }
        }
        docInput.value = '';
        if (okCount > 0) notifyToast('成功上传并解析 ' + okCount + ' 份资料');
        if (errs.length > 0) notifyToast('部分文件未能导入：' + errs[0]);
        if (_state.activeProjectHomeId === uploadTargetPid) {
          renderProjectHomeStage(page);
        }
      });
    }

    host.querySelectorAll('[data-ph-doc-view]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var did = btn.getAttribute('data-ph-doc-view');
        var doc = await S().getProjectDocument(did, pid);
        if (doc && global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.openDocPreviewModal === 'function') {
          global.AiWorkspaceProjects.openDocPreviewModal(page, doc);
        }
      });
    });

    host.querySelectorAll('[data-ph-doc-rename]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var did = btn.getAttribute('data-ph-doc-rename');
        var doc = await S().getProjectDocument(did, pid);
        if (doc && global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.openDocRenameModal === 'function') {
          global.AiWorkspaceProjects.openDocRenameModal(page, proj, doc, function() {
            if (_state.activeProjectHomeId === pid) renderProjectHomeStage(page);
          });
        }
      });
    });

    host.querySelectorAll('[data-ph-doc-del]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var did = btn.getAttribute('data-ph-doc-del');
        var doc = await S().getProjectDocument(did, pid);
        if (doc && global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.openDocDeleteConfirmModal === 'function') {
          global.AiWorkspaceProjects.openDocDeleteConfirmModal(page, proj, doc, function() {
            if (_state.activeProjectHomeId === pid) renderProjectHomeStage(page);
          });
        }
      });
    });
  }

  async function openProjectHome(page, projectId, options) {
    if (!page || !projectId) return;
    if (_state.isStreaming) {
      notifyToast('请先停止当前回答再切换项目');
      return;
    }
    var proj = S() && typeof S().getProject === 'function' ? await S().getProject(projectId) : null;
    if (!proj) {
      notifyToast('项目不存在或已被删除');
      _state.activeProjectHomeId = null;
      saveProjectHomeUiState();
      return;
    }
    _state.activeProjectHomeId = projectId;
    if (options && options.tab) {
      _state.activeProjectHomeTab = options.tab;
    }
    saveProjectHomeUiState();
    _state.activeChatId = null;
    _state.activeChat = null;
    _state.messages = [];
    _state.quotedMessage = null;
    _state.explicitNoPreset = false;

    var preset = null;
    if (proj.defaultPresetId && S()) {
      var allPresets = await S().listPresets();
      preset = allPresets.find(function(p) { return p && p.id === proj.defaultPresetId; }) || null;
    }
    if (!preset) {
      preset = (!_state.general || _state.general.autoUseDefaultPreset !== false)
        ? _state.defaultPreset
        : null;
    }
    _state.activePreset = preset;

    syncQuoteBarUI(page);
    await refreshEffectiveApi();
    syncContextStrip(page);
    syncComposerPlaceholder(page);
    updateMainStage(page);
    renderSidebarProjects(page);
    renderSidebarChats(page);
  }

  function updateMainStage(page, options) {
    if (!page) return;
    var preserveScroll = !!(options && options.preserveScroll);
    var scrollEl = page.querySelector('#aiw-main-scroll');
    var prevScrollTop = scrollEl ? scrollEl.scrollTop : 0;

    var emptyStage = page.querySelector('#aiw-empty-stage');
    var projHomeStage = page.querySelector('#aiw-project-home-stage');
    var msgList = page.querySelector('#aiw-message-list');
    var emptyTitle = page.querySelector('#aiw-empty-title');
    var emptySub = page.querySelector('#aiw-empty-sub');
    var emptyCta = page.querySelector('#aiw-empty-api-cta');
    var topbarTitle = page.querySelector('#aiw-topbar-title');

    if (topbarTitle) {
      if (_state.activeChat && _state.activeChat.title) {
        topbarTitle.textContent = _state.activeChat.title;
      } else if (_state.activeProjectHomeId) {
        var homeProj = (_state.projects || []).find(function(p) { return p && p.id === _state.activeProjectHomeId; });
        topbarTitle.textContent = homeProj ? homeProj.name : '项目主页';
      } else {
        topbarTitle.textContent = '知屿';
      }
    }

    syncComposerPlaceholder(page);

    if (_state.messages.length === 0 && _state.activeProjectHomeId && !_state.activeChat) {
      if (emptyStage) emptyStage.hidden = true;
      if (msgList) {
        msgList.hidden = true;
        msgList.innerHTML = '';
      }
      if (projHomeStage) {
        projHomeStage.hidden = false;
        renderProjectHomeStage(page);
      }
      return;
    }

    restoreComposerToBottom(page);
    if (projHomeStage) {
      projHomeStage.hidden = true;
      projHomeStage.innerHTML = '';
    }

    if (_state.messages.length === 0) {
      if (emptyStage) emptyStage.hidden = false;
      if (msgList) {
        msgList.hidden = true;
        msgList.innerHTML = '';
      }
      if (emptyTitle) {
        emptyTitle.textContent = (_state.activeChat && _state.activeChat.title)
          ? _state.activeChat.title
          : '有什么可以帮你的？';
      }
      var api = _state.effectiveApi;
      var preset = resolveEffectivePresetForState();
      if (emptySub) {
        if (!api || !api.configured) {
          emptySub.textContent = '请先在弯弯机设置或「知屿专属 API」中配置接口与模型后开始对话。';
        } else {
          var subParts = [api.sourceLabel + ' · ' + api.model];
          if (preset) subParts.push('预设：' + preset.name);
          emptySub.textContent = subParts.join('  |  ');
        }
      }
      if (emptyCta) {
        emptyCta.hidden = !!(api && api.configured);
      }
      return;
    }

    if (emptyStage) emptyStage.hidden = true;
    if (msgList) {
      msgList.hidden = false;
      var total = _state.messages.length;
      msgList.innerHTML = _state.messages.map(function(m, idx) {
        return renderMessageItemHtml(m, idx, total);
      }).join('');
    }

    if (scrollEl) {
      scrollEl.scrollTop = preserveScroll ? prevScrollTop : scrollEl.scrollHeight;
    }
  }

  function setSidebarOpen(page, open) {
    if (!page) return;
    _state.sidebarOpen = !!open;
    var backdrop = page.querySelector('#aiw-sidebar-backdrop');
    var sidebar = page.querySelector('#aiw-sidebar');
    if (backdrop) backdrop.classList.toggle('open', _state.sidebarOpen);
    if (sidebar) sidebar.classList.toggle('open', _state.sidebarOpen);
    if (_state.sidebarOpen && _state.attachOpen) {
      setAttachOpen(page, false);
    }
  }

  function setAttachOpen(page, open) {
    if (!page) return;
    _state.attachOpen = !!open;
    var backdrop = page.querySelector('#aiw-attach-backdrop');
    var sheet = page.querySelector('#aiw-attach-sheet');
    if (backdrop) backdrop.classList.toggle('open', _state.attachOpen);
    if (sheet) sheet.classList.toggle('open', _state.attachOpen);
    if (_state.attachOpen && _state.sidebarOpen) {
      setSidebarOpen(page, false);
    }
  }

  function syncDeepThinkUI(page) {
    if (!page) return;
    var chipBar = page.querySelector('#aiw-mode-chip-bar');
    var row = page.querySelector('#aiw-attach-deep-think');
    var stateEl = page.querySelector('#aiw-deep-think-state');
    if (chipBar) chipBar.hidden = !_state.deepThinkEnabled;
    if (row) row.classList.toggle('is-active', _state.deepThinkEnabled);
    if (stateEl) stateEl.textContent = _state.deepThinkEnabled ? '已开启' : '关闭';
  }

  function syncComposerButtons(page) {
    if (!page) return;
    var input = page.querySelector('#aiw-input');
    var sendBtn = page.querySelector('#aiw-send-btn');
    var stopBtn = page.querySelector('#aiw-stop-btn');
    var voiceBtn = page.querySelector('#aiw-voice-btn');
    var micBtn = page.querySelector('#aiw-mic-btn');
    if (!input) return;

    input.style.height = 'auto';
    input.style.height = Math.min(116, Math.max(24, input.scrollHeight)) + 'px';

    if (_state.isStreaming) {
      if (stopBtn) stopBtn.hidden = false;
      if (sendBtn) sendBtn.hidden = true;
      if (voiceBtn) voiceBtn.hidden = true;
      if (micBtn) micBtn.hidden = true;
      return;
    }

    if (stopBtn) stopBtn.hidden = true;
    if (micBtn) micBtn.hidden = false;

    var hasText = input.value.trim().length > 0;
    if (sendBtn) sendBtn.hidden = !hasText;
    if (voiceBtn) voiceBtn.hidden = hasText;
  }

  // ===== 核心：真实流式发送与重新生成 =====
  function buildQuotedPromptText(userText, quoteObj) {
    if (!quoteObj || !quoteObj.content) return userText;
    var roleLabel = quoteObj.role === 'assistant' ? '知屿先前的回复' : '先前的消息';
    var quotedLines = String(quoteObj.content).replace(/\r?\n/g, '\n> ');
    return '【引用' + roleLabel + '】\n> ' + quotedLines + '\n\n' + userText;
  }

  async function persistCurrentChatMessages() {
    if (!S() || !_state.activeChat) return null;
    var cleanMessages = _state.messages.map(function(m) {
      var item = {
        id: m.id,
        role: m.role,
        content: m.content || '',
        createdAt: m.createdAt || Date.now(),
        model: m.model || '',
        error: m.error || '',
        aborted: !!m.aborted,
        deepThink: !!m.deepThink
      };
      if (m.quote && m.quote.content) item.quote = m.quote;
      if (m.editedAt) item.editedAt = m.editedAt;
      if (m.translations && typeof m.translations === 'object') item.translations = m.translations;
      if (Array.isArray(m.toolCalls) && m.toolCalls.length > 0) item.toolCalls = m.toolCalls;
      return item;
    });
    _state.activeChat = await S().saveChat({
      id: _state.activeChat.id,
      title: _state.activeChat.title,
      model: _state.activeChat.model,
      presetId: _state.activeChat.presetId,
      presetSnapshot: _state.activeChat.presetSnapshot,
      messages: cleanMessages,
      updatedAt: Date.now()
    });
    await reloadChatList(document.getElementById(PAGE_ID));
    return _state.activeChat;
  }

  function triggerBackgroundMemoryQueue(effectiveApi) {
    if (!M() || typeof M().processMemoryTaskQueue !== 'function') return;
    M().processMemoryTaskQueue(effectiveApi).then(function(qRes) {
      if (!qRes) return;
      if (Array.isArray(qRes.summarizedChats) && _state.activeChat) {
        var matchedSum = qRes.summarizedChats.find(function(c) { return c && c.id === _state.activeChat.id; });
        if (matchedSum) {
          _state.activeChat.summary = matchedSum.summary || '';
          _state.activeChat.summaryLegacyBase = matchedSum.summaryLegacyBase || '';
          _state.activeChat.summarySegments = Array.isArray(matchedSum.summarySegments) ? matchedSum.summarySegments.slice() : [];
          _state.activeChat.summaryUpToCount = matchedSum.summaryUpToCount || 0;
          _state.activeChat.summaryUpdatedAt = matchedSum.summaryUpdatedAt || 0;
        }
      }
      var addedCount = qRes.addedCount || 0;
      var updatedCount = qRes.updatedCount || 0;
      var deletedCount = qRes.deletedCount || 0;
      if (addedCount > 0 || updatedCount > 0 || deletedCount > 0) {
        syncSidebarMemoryBadge(document.getElementById(PAGE_ID));
        if (deletedCount > 0 && addedCount === 0 && updatedCount === 0) {
          notifyToast('已遗忘并删除 ' + deletedCount + ' 条长期记忆');
        } else {
          notifyToast('已自动记住 ' + (addedCount + updatedCount) + ' 条长期记忆');
        }
      }
      var shouldRefreshSettings = addedCount > 0 || updatedCount > 0 || deletedCount > 0 ||
        (qRes.processed || 0) > 0 ||
        (Array.isArray(qRes.summarizedChats) && qRes.summarizedChats.length > 0) ||
        (Array.isArray(qRes.failedTasks) && qRes.failedTasks.length > 0);
      if (shouldRefreshSettings && global.AiWorkspaceSettings && typeof global.AiWorkspaceSettings.refreshMemoryViewsIfOpen === 'function') {
        global.AiWorkspaceSettings.refreshMemoryViewsIfOpen();
      }
    }).catch(function(err) {
      console.warn('[AiWorkspace] background memory queue error:', err && err.message ? err.message : err);
    });
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('aiw:memory-queue-updated', function(ev) {
      var qRes = (ev && ev.detail) || {};
      if (Array.isArray(qRes.summarizedChats) && _state.activeChat) {
        var matchedRetrySum = qRes.summarizedChats.find(function(c) { return c && c.id === _state.activeChat.id; });
        if (matchedRetrySum) {
          _state.activeChat.summary = matchedRetrySum.summary || '';
          _state.activeChat.summaryLegacyBase = matchedRetrySum.summaryLegacyBase || '';
          _state.activeChat.summarySegments = Array.isArray(matchedRetrySum.summarySegments) ? matchedRetrySum.summarySegments.slice() : [];
          _state.activeChat.summaryUpToCount = matchedRetrySum.summaryUpToCount || 0;
          _state.activeChat.summaryUpdatedAt = matchedRetrySum.summaryUpdatedAt || 0;
        }
      }
      var addedCount = qRes.addedCount || 0;
      var updatedCount = qRes.updatedCount || 0;
      var deletedCount = qRes.deletedCount || 0;
      var page = document.getElementById(PAGE_ID);
      if (addedCount > 0 || updatedCount > 0 || deletedCount > 0) {
        if (page) syncSidebarMemoryBadge(page);
        if (deletedCount > 0 && addedCount === 0 && updatedCount === 0) {
          notifyToast('已遗忘并删除 ' + deletedCount + ' 条长期记忆');
        } else {
          notifyToast('后台重试后已自动记住 ' + (addedCount + updatedCount) + ' 条长期记忆');
        }
      }
      if (global.AiWorkspaceSettings && typeof global.AiWorkspaceSettings.refreshMemoryViewsIfOpen === 'function') {
        global.AiWorkspaceSettings.refreshMemoryViewsIfOpen();
      }
    });
  }

  function sanitizeErrorText(raw) {
    return String(raw || '')
      .replace(/\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{8,}\b/gi, 'sk-***')
      .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi, 'Bearer ***')
      .replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, 'AIza***');
  }


  function buildProjectSourceTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'search_project_sources',
          description: '在当前项目的已上传来源文件中检索与问题相关的片段。仅限当前项目，无需也不可指定 projectId。',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '检索关键词或自然语言问题' },
              limit: { type: 'number', description: '最多返回片段数（1-6，默认 4）' },
              fileName: { type: 'string', description: '可选：限定按指定文件名过滤检索' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_project_sources',
          description: '列出当前项目已上传的所有来源文件元数据（文件名、类型、大小、总分段数）。',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'read_project_source_segment',
          description: '分段读取当前项目中指定来源文件的内容（适合总结或跨文件对比）。',
          parameters: {
            type: 'object',
            properties: {
              fileName: { type: 'string', description: '来源文件名称' },
              startChunk: { type: 'number', description: '起始片段编号（从 1 开始，默认 1）' },
              count: { type: 'number', description: '连续读取片段数（1-3，默认 2）' }
            },
            required: ['fileName']
          }
        }
      }
    ];
  }

  async function executeBuiltInProjectSourceTool(toolName, rawArgs, trustedChatId, trustedProjectId, callState) {
    var pid = String(trustedProjectId || '').trim();
    if (!pid || !S()) {
      return { ok: false, fullName: toolName, pluginName: '项目来源', toolLabel: toolName, error: '当前对话未绑定项目，无权访问项目来源' };
    }

    // 每次工具调用实时校验当前对话与项目归属，严禁模型参数覆盖 projectId
    if (trustedChatId && typeof S().getChat === 'function') {
      var liveChat = await S().getChat(trustedChatId);
      if (!liveChat || String(liveChat.projectId || '').trim() !== pid) {
        return { ok: false, fullName: toolName, pluginName: '项目来源', toolLabel: toolName, error: '对话归属已变更，已拒绝跨项目来源访问' };
      }
    }
    if (typeof S().getProject === 'function') {
      var liveProj = await S().getProject(pid);
      if (!liveProj) {
        return { ok: false, fullName: toolName, pluginName: '项目来源', toolLabel: toolName, error: '所属项目不存在或已删除' };
      }
    }

    if (callState) {
      callState.count = (callState.count || 0) + 1;
      if (callState.count > 5) {
        return { ok: false, fullName: toolName, pluginName: '项目来源', toolLabel: toolName, error: '单轮来源检索已达次数上限（5 次），请基于已获取片段作答' };
      }
    }

    var args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};

    if (toolName === 'list_project_sources') {
      var manifest = typeof S().listProjectDocumentManifest === 'function'
        ? await S().listProjectDocumentManifest(pid)
        : [];
      var fileNames = manifest.map(function(d) { return d.name; });
      return {
        ok: true,
        fullName: toolName,
        pluginName: '项目来源',
        toolLabel: '查看项目来源列表',
        result: {
          found: manifest.length > 0,
          totalFiles: manifest.length,
          files: manifest.map(function(d) {
            return { name: d.name, type: d.type, size: d.size, totalChunks: d.totalChunks };
          })
        },
        summaryText: manifest.length ? ('已列出 ' + manifest.length + ' 份项目来源：' + fileNames.slice(0, 4).join('、')) : '当前项目暂无上传来源文件'
      };
    }

    if (toolName === 'read_project_source_segment') {
      var fileName = String(args.fileName || '').trim();
      var startChunk = Math.max(1, Number(args.startChunk) || 1);
      var count = Math.max(1, Math.min(3, Number(args.count) || 2));
      var segRes = typeof S().readProjectDocumentSegment === 'function'
        ? await S().readProjectDocumentSegment(pid, fileName, startChunk, count)
        : null;
      if (!segRes || !segRes.segments || segRes.segments.length === 0) {
        return {
          ok: true,
          fullName: toolName,
          pluginName: '项目来源',
          toolLabel: '分段读取来源',
          result: { found: false, message: '未在当前项目中找到指定文件或片段，请勿编造内容' },
          summaryText: '未找到指定来源文件'
        };
      }
      return {
        ok: true,
        fullName: toolName,
        pluginName: '项目来源',
        toolLabel: '分段读取来源',
        result: {
          found: true,
          fileName: segRes.docName,
          totalChunks: segRes.totalChunks,
          hasMore: segRes.hasMore,
          nextStartChunk: segRes.nextStartChunk,
          segments: segRes.segments
        },
        summaryText: '已读取《' + segRes.docName + '》' + segRes.segments.length + ' 个片段'
      };
    }

    // search_project_sources
    var query = String(args.query || '').trim();
    var limit = Math.max(1, Math.min(6, Number(args.limit) || 4));
    var fileFilter = String(args.fileName || '').trim();
    var hits = typeof S().searchProjectDocuments === 'function'
      ? await S().searchProjectDocuments(pid, query, { maxChunks: limit, maxTotalChars: 2000, fileName: fileFilter })
      : [];
    if (!hits.length) {
      return {
        ok: true,
        fullName: toolName,
        pluginName: '项目来源',
        toolLabel: '检索项目来源',
        result: { found: false, query: query, sources: [], message: '未找到相关来源内容，请如实告知用户，不得编造文件内容' },
        summaryText: '未检索到匹配来源片段'
      };
    }
    var hitNames = [];
    hits.forEach(function(h) { if (hitNames.indexOf(h.docName) === -1) hitNames.push(h.docName); });
    return {
      ok: true,
      fullName: toolName,
      pluginName: '项目来源',
      toolLabel: '检索项目来源',
      result: {
        found: true,
        query: query,
        sources: hits.map(function(h) {
          return {
            fileName: h.docName,
            chunkPosition: h.totalChunks > 1 ? ((h.chunkIndex + 1) + '/' + h.totalChunks) : '全文',
            content: h.snippet
          };
        })
      },
      summaryText: '已检索 ' + hits.length + ' 条来源片段（' + hitNames.slice(0, 3).join('、') + '）'
    };
  }

  async function executeStreamingTurn(page, historyBeforeTurn, userText, assistantMsg, effectiveApi, turnOpts) {
    var turnChatId = _state.activeChat ? _state.activeChat.id : '';
    var turnProjectId = (_state.activeChat && _state.activeChat.projectId) ? String(_state.activeChat.projectId).trim() : '';
    var preset = resolveEffectivePresetForState();
    var personalization = _state.personalization || (S() ? await S().getPersonalization() : null);

    var memContext = {
      memories: [],
      crossChatContexts: [],
      shortTermSummary: '',
      summaryUpToCount: 0,
      useShortTermHistory: true,
      maxRecentMessages: 14
    };
    if (M() && typeof M().retrieveWorkspaceContext === 'function') {
      try {
        memContext = await M().retrieveWorkspaceContext({
          query: userText,
          historyMessages: historyBeforeTurn,
          activeChat: _state.activeChat,
          chatId: _state.activeChat ? _state.activeChat.id : '',
          projectId: (_state.activeChat && _state.activeChat.projectId) || '',
          apiConfig: effectiveApi,
          userId: 'local_user'
        });
      } catch (memErr) {
        console.warn('[AiWorkspace] workspace context retrieval skipped:', memErr);
      }
    } else if (M() && typeof M().retrieveRelevantMemories === 'function') {
      try {
        memContext.memories = await M().retrieveRelevantMemories({
          query: userText,
          historyMessages: historyBeforeTurn,
          chatId: _state.activeChat ? _state.activeChat.id : '',
          projectId: (_state.activeChat && _state.activeChat.projectId) || '',
          userId: 'local_user'
        });
      } catch (memErrFallback) {
        console.warn('[AiWorkspace] memory retrieval skipped:', memErrFallback);
      }
    }

    var matchedWorldBookEntries = [];
    if (AI() && typeof AI().matchWorldBooksForReply === 'function') {
      try {
        var presetForWorldBook = resolveLatestPresetForWorldBooks();
        var wbMatchRes = await AI().matchWorldBooksForReply({
          preset: presetForWorldBook,
          messages: memContext.useShortTermHistory ? historyBeforeTurn : [],
          userInput: userText
        });
        if (wbMatchRes && Array.isArray(wbMatchRes.matchedEntries)) {
          matchedWorldBookEntries = wbMatchRes.matchedEntries;
        }
      } catch (wbErr) {
        console.warn('[AiWorkspace] worldbook match skipped:', wbErr);
      }
    }

    var activeProjectInstructions = '';
    var activeProjectDocsSnippet = '';
    var activeProjectId = (_state.activeChat && _state.activeChat.projectId) ? String(_state.activeChat.projectId).trim() : '';
    if (activeProjectId && S()) {
      if (typeof S().getProject === 'function') {
        try {
          var activeProj = await S().getProject(activeProjectId);
          if (activeProj && activeProj.instructions) {
            activeProjectInstructions = String(activeProj.instructions).trim();
          }
        } catch (projErr) {
          console.warn('[AiWorkspace] load project instructions skipped:', projErr);
        }
      }
      if (typeof S().searchProjectDocuments === 'function' && userText) {
        try {
          var docSearchQuery = userText;
          if (docSearchQuery.length <= 18 && Array.isArray(historyBeforeTurn) && historyBeforeTurn.length > 0) {
            for (var dh = historyBeforeTurn.length - 1; dh >= 0; dh--) {
              if (historyBeforeTurn[dh] && historyBeforeTurn[dh].role === 'user' && historyBeforeTurn[dh].content) {
                docSearchQuery += ' ' + String(historyBeforeTurn[dh].content).slice(0, 80);
                break;
              }
            }
          }
          var docParts = [];
          var isSourceMetaQuery = /(?:资料|文件|来源|上传|总结|概括|比较|对比|区别|有哪些|文档)/.test(userText);
          if (isSourceMetaQuery && typeof S().listProjectDocumentManifest === 'function') {
            var manifest = await S().listProjectDocumentManifest(activeProjectId);
            if (Array.isArray(manifest) && manifest.length > 0) {
              var manifestLine = manifest.slice(0, 10).map(function(d) {
                return '《' + d.name + '》(' + (d.type || 'txt').toUpperCase() + ', ' + d.totalChunks + '段)';
              }).join('、');
              docParts.push('[当前项目已上传来源清单：' + manifestLine + ']');
            }
          }
          var docHits = await S().searchProjectDocuments(activeProjectId, docSearchQuery, {
            maxChunks: 4,
            maxTotalChars: 1700
          });
          if (Array.isArray(docHits) && docHits.length > 0) {
            docHits.forEach(function(hit) {
              var posTag = (hit.totalChunks > 1)
                ? ('片段 ' + (hit.chunkIndex + 1) + '/' + hit.totalChunks)
                : '全文';
              docParts.push('[来源：' + hit.docName + ' | ' + posTag + ']\n' + hit.snippet);
            });
          }
          if (docParts.length > 0) {
            activeProjectDocsSnippet = docParts.join('\n\n');
          }
        } catch (docErr) {
          console.warn('[AiWorkspace] search project documents skipped:', sanitizeErrorText(docErr && docErr.message || docErr));
        }
      }
    }

    var composed = AI().composeMessages({
      historyMessages: memContext.useShortTermHistory ? historyBeforeTurn : [],
      shortTermSummary: memContext.shortTermSummary || '',
      summaryUpToCount: memContext.summaryUpToCount || 0,
      maxRecentMessages: memContext.maxRecentMessages != null ? memContext.maxRecentMessages : 6,
      userContent: userText,
      personalization: personalization,
      preset: preset,
      projectInstructions: activeProjectInstructions,
      projectDocsSnippet: activeProjectDocsSnippet,
      worldBookEntries: matchedWorldBookEntries,
      memories: memContext.memories || [],
      crossChatContexts: memContext.crossChatContexts || [],
      deepThink: _state.deepThinkEnabled,
      memoryTurnNotice: (turnOpts && turnOpts.memoryTurnNotice) || '',
      strategy: (memContext.settings && memContext.settings.strategy) || 'natural'
    });

    var currentChatIdAfterPrep = _state.activeChat ? _state.activeChat.id : '';
    var currentProjectIdAfterPrep = (_state.activeChat && _state.activeChat.projectId) ? String(_state.activeChat.projectId).trim() : '';
    if (currentChatIdAfterPrep !== turnChatId || currentProjectIdAfterPrep !== turnProjectId) {
      assistantMsg.streaming = false;
      assistantMsg.aborted = true;
      return { completedNormally: false, aborted: true };
    }

    var controller = new AbortController();
    _state.isStreaming = true;
    _state.abortController = controller;
    syncComposerButtons(page);

    var completedNormally = false;
    var activeChatId = _state.activeChat ? _state.activeChat.id : '';
    var pluginApi = global.AiWorkspacePlugins || null;
    var enabledToolsRes = { tools: [], nameMap: {} };
    if (pluginApi && typeof pluginApi.getEnabledOpenAiTools === 'function') {
      try {
        enabledToolsRes = await pluginApi.getEnabledOpenAiTools({ chatId: activeChatId });
      } catch (plgLoadErr) {
        console.warn('[AiWorkspace] load enabled tools skipped:', plgLoadErr);
      }
    }

    var sourceToolCallState = { count: 0 };
    var builtInSourceTools = turnProjectId ? buildProjectSourceTools() : [];
    var builtInSourceToolNames = {
      search_project_sources: true,
      list_project_sources: true,
      read_project_source_segment: true
    };
    var mergedTools = (enabledToolsRes.tools || []).concat(builtInSourceTools);

    try {
      var res;
      if (mergedTools.length > 0 && typeof AI().runChatCompletionWithTools === 'function') {
        res = await AI().runChatCompletionWithTools({
          apiConfig: effectiveApi,
          model: effectiveApi.model,
          temperature: effectiveApi.temperature,
          messages: composed,
          tools: mergedTools,
          allowToolFallback: true,
          signal: controller.signal,
          onDelta: function(_, fullText) {
            assistantMsg.content = fullText;
            if ((_state.activeChat ? _state.activeChat.id : '') === turnChatId) {
              updateStreamingBubbleDom(page, assistantMsg);
            }
          },
          onToolCallUpdate: function(records) {
            assistantMsg.toolCalls = records;
            if ((_state.activeChat ? _state.activeChat.id : '') === turnChatId) {
              updateStreamingBubbleDom(page, assistantMsg);
            }
          },
          executeTool: async function(tc, parsedArgs) {
            var rawName = (tc && tc.function && tc.function.name) || '';
            if (builtInSourceToolNames[rawName]) {
              return executeBuiltInProjectSourceTool(rawName, parsedArgs, turnChatId, turnProjectId, sourceToolCallState);
            }
            if (!pluginApi) {
              return { ok: false, fullName: rawName, pluginName: '插件系统', toolLabel: rawName, error: '插件系统不可用' };
            }
            var resolvedFullName = pluginApi.resolveToolFullName
              ? pluginApi.resolveToolFullName(rawName, enabledToolsRes.nameMap)
              : (enabledToolsRes.nameMap[rawName] || rawName);
            if (!resolvedFullName || (!enabledToolsRes.nameMap[rawName] && Object.values(enabledToolsRes.nameMap).indexOf(resolvedFullName) === -1)) {
              return {
                ok: false,
                fullName: resolvedFullName || rawName,
                pluginName: '插件系统',
                toolLabel: rawName,
                error: '该插件未启用或不可调用'
              };
            }
            var invokeRes = await pluginApi.invokeTool(resolvedFullName, parsedArgs, {
              chatId: activeChatId,
              source: 'ai_auto',
              requestConfirmation: function(req) {
                return new Promise(function(resolve) {
                  var settled = false;
                  function finish(val) {
                    if (settled) return;
                    settled = true;
                    closeInlineModal(page);
                    resolve(!!val);
                  }
                  var srvName = (req && req.server && req.server.name) || (req && req.plugin && req.plugin.name) || '外部 MCP 服务';
                  var srvOrigin = (req && req.server && req.server.origin) ? (' (' + req.server.origin + ')') : '';
                  var toolTitle = (req && req.title) || (req && req.toolName) || resolvedFullName;
                  var argsPretty = '{}';
                  try { argsPretty = JSON.stringify((req && req.params) || {}, null, 2); } catch (_) {}
                  var bodyHtml =
                    '<div class="aiw-mcp-confirm-box">' +
                      '<div class="aiw-mcp-confirm-warn"><i class="fa-solid fa-shield-halved"></i> 该外部工具可能涉及数据修改或外部操作，请确认后执行：</div>' +
                      '<div class="aiw-mcp-confirm-meta"><strong>服务：</strong>' + escapeHtml(srvName + srvOrigin) + '</div>' +
                      '<div class="aiw-mcp-confirm-meta"><strong>工具：</strong><code>' + escapeHtml(toolTitle) + '</code></div>' +
                      '<div class="aiw-mcp-confirm-meta"><strong>参数：</strong></div>' +
                      '<pre class="aiw-mcp-confirm-pre">' + escapeHtml(argsPretty) + '</pre>' +
                    '</div>';
                  var footerHtml =
                    '<button type="button" class="aiw-st-btn-secondary" id="aiw-mcp-confirm-deny">拒绝执行</button>' +
                    '<button type="button" class="aiw-st-btn-primary" id="aiw-mcp-confirm-allow">允许执行</button>';
                  var modal = showInlineModal(page, '外部工具执行确认', bodyHtml, footerHtml);
                  if (!modal) {
                    resolve(false);
                    return;
                  }
                  var allowBtn = modal.querySelector('#aiw-mcp-confirm-allow');
                  var denyBtn = modal.querySelector('#aiw-mcp-confirm-deny');
                  if (allowBtn) allowBtn.addEventListener('click', function() { finish(true); });
                  if (denyBtn) denyBtn.addEventListener('click', function() { finish(false); });
                  var closeBtn = modal.querySelector('.aiw-ws-modal-close');
                  if (closeBtn) closeBtn.addEventListener('click', function() { finish(false); });
                });
              }
            });
            var resData = invokeRes ? (invokeRes.data !== undefined ? invokeRes.data : invokeRes.result) : null;
            var plgMeta = (invokeRes && invokeRes.plugin) || (invokeRes && invokeRes.pluginId && pluginApi.getPlugin ? pluginApi.getPlugin(invokeRes.pluginId) : null);
            var toolMeta = (plgMeta && Array.isArray(plgMeta.tools))
              ? plgMeta.tools.find(function(t) { return t.fullName === resolvedFullName; })
              : null;
            return {
              ok: !!(invokeRes && invokeRes.ok),
              fullName: resolvedFullName,
              pluginName: (plgMeta && plgMeta.name) || '',
              toolLabel: (toolMeta && (toolMeta.title || toolMeta.name)) || resolvedFullName,
              result: resData,
              error: invokeRes ? invokeRes.error : '工具执行失败',
              summaryText: formatToolCallSummary(
                resolvedFullName,
                resData,
                (invokeRes && !invokeRes.ok) ? invokeRes.error : ''
              )
            };
          }
        });
        if (res && Array.isArray(res.toolCalls) && res.toolCalls.length > 0) {
          assistantMsg.toolCalls = res.toolCalls;
        }
      } else {
        res = await AI().streamChatCompletion({
          apiConfig: effectiveApi,
          model: effectiveApi.model,
          temperature: effectiveApi.temperature,
          messages: composed,
          signal: controller.signal,
          onDelta: function(_, fullText) {
            assistantMsg.content = fullText;
            updateStreamingBubbleDom(page, assistantMsg);
          }
        });
      }

      assistantMsg.streaming = false;
      assistantMsg.content = res.content || assistantMsg.content || '';
      assistantMsg.model = res.model || effectiveApi.model;
      if (!assistantMsg.content.trim()) {
        assistantMsg.error = '模型未返回任何文本内容，请检查模型名称或稍后重试。';
      } else {
        completedNormally = true;
      }
    } catch (err) {
      assistantMsg.streaming = false;
      if (err && err.name === 'AbortError') {
        assistantMsg.aborted = true;
        if (err.partialContent && !assistantMsg.content) {
          assistantMsg.content = err.partialContent;
        }
      } else {
        assistantMsg.error = (err && err.message) ? sanitizeErrorText(err.message) : '请求失败，请检查网络连接与 API 配置';
      }
    } finally {
      if (Array.isArray(assistantMsg.toolCalls)) {
        assistantMsg.toolCalls.forEach(function(tc) {
          if (tc && tc.status === 'running') {
            tc.status = 'error';
            tc.error = assistantMsg.aborted ? '已中断' : '未完成';
            tc.summaryText = tc.error;
          }
        });
      }
      _state.isStreaming = false;
      _state.abortController = null;
      syncComposerButtons(page);
      updateMainStage(page);
      await persistCurrentChatMessages();
    }

    if (completedNormally && M()) {
      var turnChatId = _state.activeChat ? _state.activeChat.id : '';
      var turnChatTitle = _state.activeChat ? _state.activeChat.title : '';
      var turnProjectId = (_state.activeChat && _state.activeChat.projectId) || '';
      var skipAutoMem = !!(turnOpts && turnOpts.skipAutoMemory);

      if (typeof M().enqueueTurnMemoryTasks === 'function' && typeof M().processMemoryTaskQueue === 'function') {
        try {
          await M().enqueueTurnMemoryTasks({
            userMsgId: (turnOpts && turnOpts.userMsgId) || '',
            userText: userText,
            assistantText: assistantMsg.content,
            historyMessages: historyBeforeTurn,
            chatId: turnChatId,
            chatTitle: turnChatTitle,
            projectId: turnProjectId,
            userId: 'local_user',
            skipAutoMemory: skipAutoMem
          });
          triggerBackgroundMemoryQueue(effectiveApi);
        } catch (queueErr) {
          console.warn('[AiWorkspace] enqueue memory tasks failed:', queueErr);
        }
      } else if (!skipAutoMem && typeof M().extractAndSaveFromTurn === 'function') {
        M().extractAndSaveFromTurn({
          userText: userText,
          assistantText: assistantMsg.content,
          chatId: turnChatId,
          chatTitle: turnChatTitle,
          projectId: turnProjectId,
          apiConfig: effectiveApi,
          userId: 'local_user'
        }).then(function(memRes) {
          if (!memRes) return;
          var addedCount = memRes.added ? memRes.added.length : 0;
          var updatedCount = memRes.updated ? memRes.updated.length : 0;
          if (addedCount > 0 || updatedCount > 0) {
            syncSidebarMemoryBadge(document.getElementById(PAGE_ID));
            notifyToast('已自动记住 ' + (addedCount + updatedCount) + ' 条长期记忆');
          }
        }).catch(function() {});
      }
    }
  }

  async function handleSendMessage(page) {
    if (_state.isStreaming) {
      notifyToast('正在生成回答中，可点击停止按钮中断');
      return;
    }
    var input = page.querySelector('#aiw-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    var effective = await refreshEffectiveApi();
    syncContextStrip(page);

    if (!effective || !effective.configured) {
      var warnModal = showInlineModal(
        page,
        '尚未配置可用的 AI API',
        '<p class="aiw-st-modal-msg">当前知屿专属 API 与弯弯机主 API 均未完整配置，无法发起对话。你可以前往「知屿专属 API」进行配置。</p>',
        '<button type="button" class="aiw-st-btn-secondary" id="aiw-noapi-cancel">取消</button>' +
        '<button type="button" class="aiw-st-btn-primary" id="aiw-noapi-go">前往配置</button>'
      );
      if (warnModal) {
        warnModal.querySelector('#aiw-noapi-cancel').addEventListener('click', function() { closeInlineModal(page); });
        warnModal.querySelector('#aiw-noapi-go').addEventListener('click', function() {
          closeInlineModal(page);
          openSettingsView(page, 'custom-api');
        });
      }
      return;
    }

    var preset = resolveEffectivePresetForState();
    if (!_state.activeChat) {
      var pendingProjectId = _state.activeProjectHomeId ? String(_state.activeProjectHomeId).trim() : '';
      var autoTitle = S() ? S().generateChatTitle(text) : text.slice(0, 22);
      _state.activeChat = await S().createChat({
        title: autoTitle,
        projectId: pendingProjectId,
        model: effective.model,
        presetId: preset ? preset.id : '',
        presetSnapshot: preset ? S().buildPresetSnapshot(preset) : null,
        messages: []
      });
      _state.activeChatId = _state.activeChat.id;
      if (pendingProjectId) {
        _state.activeProjectHomeId = null;
        _state.expandedProjects[pendingProjectId] = true;
        saveSidebarProjUiState();
        syncComposerPlaceholder(page);
      }
    } else if (_state.messages.length === 0 && (!_state.activeChat.title || _state.activeChat.title === '新对话')) {
      _state.activeChat.title = S().generateChatTitle(text);
    }

    var historyBeforeTurn = _state.messages.slice();
    var activeQuote = _state.quotedMessage
      ? { id: _state.quotedMessage.id, role: _state.quotedMessage.role, content: _state.quotedMessage.content }
      : null;
    var promptForAI = buildQuotedPromptText(text, activeQuote);
    var userMsg = {
      id: S() ? S().generateMessageId() : ('msg_' + Date.now() + '_u'),
      role: 'user',
      content: text,
      createdAt: Date.now(),
      deepThink: _state.deepThinkEnabled
    };
    if (activeQuote) userMsg.quote = activeQuote;

    var assistantMsg = {
      id: S() ? S().generateMessageId() : ('msg_' + Date.now() + '_a'),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      model: effective.model,
      streaming: true
    };

    _state.messages.push(userMsg);
    input.value = '';
    _state.quotedMessage = null;
    syncQuoteBarUI(page);
    await persistCurrentChatMessages();

    // 方式 A：智能语义记忆意图即时识别与落库（save / update / delete / clarify）
    var explicitRes = { isExplicit: false, intent: 'none', saved: false };
    var memoryTurnNotice = '';
    if (M() && typeof M().handleExplicitMemoryCommand === 'function') {
      try {
        explicitRes = await M().handleExplicitMemoryCommand({
          userText: text,
          userMsgId: userMsg.id,
          historyMessages: historyBeforeTurn,
          chatId: _state.activeChat ? _state.activeChat.id : '',
          chatTitle: _state.activeChat ? _state.activeChat.title : '',
          projectId: (_state.activeChat && _state.activeChat.projectId) || '',
          userId: 'local_user',
          apiConfig: effective
        });
        if (explicitRes && explicitRes.isExplicit) {
          if (explicitRes.needsClarification) {
            var clarText = explicitRes.clarificationMessage || '当前对话里还不够明确，请再说明具体想记住或修改的内容。';
            notifyToast(clarText);
            memoryTurnNotice = '记忆系统未自动保存：指代对象不明确，需要向用户确认。请礼貌追问用户具体想记住/修改/遗忘哪件事（参考提示：' + clarText + '），切勿凭空猜测或假装已经记住。';
          } else if (explicitRes.deletedCount > 0) {
            syncSidebarMemoryBadge(page);
            notifyToast('已遗忘并删除 ' + explicitRes.deletedCount + ' 条长期记忆');
            memoryTurnNotice = '记忆系统已真实从长期记忆库中删除并遗忘了 ' + explicitRes.deletedCount + ' 条相关记忆，可自然向用户确认已忘掉该信息。';
          } else if (explicitRes.saved) {
            syncSidebarMemoryBadge(page);
            if (explicitRes.intent === 'update' || (explicitRes.updated && explicitRes.updated.length > 0)) {
              notifyToast('已更新长期记忆');
              memoryTurnNotice = '记忆系统已真实更新用户的长期记忆。';
            } else {
              notifyToast('已记住（已写入长期记忆）');
              memoryTurnNotice = '记忆系统已真实将本条信息写入用户的长期记忆。';
            }
          } else if (explicitRes.blockedBySetting) {
            notifyToast('长期记忆已关闭，本次未保存');
            memoryTurnNotice = '注意：用户的「长期记忆」开关当前已关闭，系统并未保存任何长期记忆。请如实告知用户长期记忆已关闭、无法持久化保存，切勿假装已经记住。';
          } else if (explicitRes.blockedSecret) {
            notifyToast('检测到密码或密钥等敏感信息，已安全拦截');
            memoryTurnNotice = '注意：检测到敏感隐私信息（如密码/密钥/验证码），记忆系统已安全拦截且未保存。请提醒用户系统不会保存敏感凭证。';
          } else if (explicitRes.alreadyExists) {
            notifyToast('该内容已在长期记忆中');
          } else if (explicitRes.error) {
            notifyToast('记忆保存失败：' + explicitRes.error);
            memoryTurnNotice = '注意：本轮长期记忆写入失败（' + explicitRes.error + '），并未真正保存成功。请如实向用户说明未能写入记忆，切勿谎称已记住。';
          } else if (explicitRes.reason) {
            notifyToast(explicitRes.reason);
            if (explicitRes.intent === 'delete') {
              memoryTurnNotice = '记忆系统未在当前长期记忆库中找到可删除的匹配记录（' + explicitRes.reason + '），请如实告知用户，不要假装删除了不存在的记录。';
            }
          }
          if (global.AiWorkspaceSettings && typeof global.AiWorkspaceSettings.refreshMemoryViewsIfOpen === 'function') {
            global.AiWorkspaceSettings.refreshMemoryViewsIfOpen();
          }
        }
      } catch (expErr) {
        var expMsg = (expErr && expErr.message) || '未知错误';
        notifyToast('记忆保存失败：' + expMsg);
        memoryTurnNotice = '注意：本轮长期记忆处理发生异常（' + expMsg + '），未保存成功，请勿假装已经记住。';
      }
    }

    var capNotice = (explicitRes && explicitRes.capabilityNotice) || '';
    if (!capNotice && M() && typeof M().detectUnsupportedMonitoringOrReminderRequest === 'function') {
      var capProbe = M().detectUnsupportedMonitoringOrReminderRequest(text);
      if (capProbe && capProbe.needsCapabilityCheck) {
        capNotice = capProbe.capabilityNotice || '';
      }
    }
    if (capNotice) {
      memoryTurnNotice = memoryTurnNotice ? (memoryTurnNotice + '\n' + capNotice) : capNotice;
    }

    _state.messages.push(assistantMsg);
    syncComposerButtons(page);
    updateMainStage(page);

    await executeStreamingTurn(page, historyBeforeTurn, promptForAI, assistantMsg, effective, {
      userMsgId: userMsg.id,
      skipAutoMemory: !!(explicitRes && (explicitRes.isExplicit || explicitRes.intent === 'clarify')),
      memoryTurnNotice: memoryTurnNotice
    });
  }

  async function regenerateAtMessage(page, msgId) {
    if (_state.isStreaming) {
      notifyToast('正在生成回答，请稍候或先停止');
      return;
    }
    var targetIdx = _state.messages.findIndex(function(m) { return m.id === msgId; });
    if (targetIdx === -1) return;

    var targetMsg = _state.messages[targetIdx];
    var userIdx = -1;
    if (targetMsg.role === 'user') {
      userIdx = targetIdx;
    } else {
      for (var i = targetIdx - 1; i >= 0; i--) {
        if (_state.messages[i].role === 'user') {
          userIdx = i;
          break;
        }
      }
    }
    if (userIdx === -1) {
      notifyToast('未找到对应的用户提问，无法重新生成');
      return;
    }

    var effective = await refreshEffectiveApi();
    syncContextStrip(page);
    if (!effective || !effective.configured) {
      notifyToast('请先配置有效的 API 与模型');
      return;
    }

    var userMsgObj = _state.messages[userIdx];
    var userPrompt = buildQuotedPromptText(userMsgObj.content, userMsgObj.quote);
    var historyBeforeTurn = _state.messages.slice(0, userIdx);
    var assistantMsg = {
      id: S() ? S().generateMessageId() : ('msg_' + Date.now() + '_a'),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      model: effective.model,
      streaming: true
    };

    _state.messages = _state.messages.slice(0, userIdx + 1);
    _state.messages.push(assistantMsg);
    updateMainStage(page);
    await persistCurrentChatMessages();

    await executeStreamingTurn(page, historyBeforeTurn, userPrompt, assistantMsg, effective, {
      userMsgId: userMsgObj.id,
      skipAutoMemory: true
    });
  }

  async function startNewChat(page, silent) {
    if (_state.isStreaming && _state.abortController) {
      try { _state.abortController.abort(); } catch (_) {}
    }
    _state.activeChatId = null;
    _state.activeChat = null;
    _state.messages = [];
    _state.quotedMessage = null;
    _state.explicitNoPreset = false;
    if (!_state.general || _state.general.autoUseDefaultPreset !== false) {
      _state.activePreset = _state.defaultPreset;
    } else {
      _state.activePreset = null;
    }
    syncQuoteBarUI(page);
    await refreshEffectiveApi();
    syncContextStrip(page);
    updateMainStage(page);
    renderSidebarProjects(page);
    renderSidebarChats(page);
    if (!silent) notifyToast('已开启新对话');
  }

  function bindEvents(page) {
    bindMessageListDelegation(page);

    page.querySelector('#aiw-sidebar-btn').addEventListener('click', function() {
      setSidebarOpen(page, true);
    });

    page.querySelector('#aiw-new-chat-btn').addEventListener('click', function() {
      startNewChat(page, false);
    });

    page.querySelector('#aiw-close-btn').addEventListener('click', function() {
      closeAiWorkspacePage();
    });

    var ctxProjBtn = page.querySelector('#aiw-ctx-project-btn');
    if (ctxProjBtn) {
      ctxProjBtn.addEventListener('click', function() {
        var pid = ctxProjBtn.getAttribute('data-back-project-id');
        if (pid) openProjectHome(page, pid);
      });
    }

    page.querySelector('#aiw-ctx-model-btn').addEventListener('click', function() {
      openModelPickerModal(page);
    });

    page.querySelector('#aiw-ctx-preset-btn').addEventListener('click', function() {
      openPresetPickerModal(page);
    });

    page.querySelector('#aiw-empty-api-cta').addEventListener('click', function() {
      openSettingsView(page, 'custom-api');
    });

    page.querySelector('#aiw-sidebar-backdrop').addEventListener('click', function() {
      setSidebarOpen(page, false);
    });

    page.querySelector('#aiw-sidebar-close').addEventListener('click', function() {
      setSidebarOpen(page, false);
    });

    var searchInput = page.querySelector('#aiw-search-input');
    searchInput.addEventListener('input', function() {
      _state.searchQuery = searchInput.value || '';
      reloadChatList(page);
    });

    // 侧边栏占位导航项（第五阶段起实现的能力诚实保留提示）
    var NAV_LABELS = {
      image: '图像',
      library: '资料库',
      projects: '项目',
      remote: 'Remote',
      tasks: '定时任务',
      plugins: '插件扩展',
      memory: '记忆空间'
    };

    page.querySelectorAll('.aiw-nav-item[data-nav]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key = btn.getAttribute('data-nav');
        if (key === 'memory') {
          setSidebarOpen(page, false);
          openSettingsView(page, 'memory');
          return;
        }
        if (key === 'plugins') {
          setSidebarOpen(page, false);
          openSettingsView(page, 'plugins');
          return;
        }
        if (key === 'projects') {
          setSidebarOpen(page, false);
          if (global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.openProjectsCenter === 'function') {
            global.AiWorkspaceProjects.openProjectsCenter(page);
          } else {
            notifyToast('项目模块尚未加载');
          }
          return;
        }
        var label = NAV_LABELS[key] || '该功能';
        notifyToast('「' + label + '」将在后续阶段接入');
      });
    });

    var sbProjToggle = page.querySelector('#aiw-sb-projects-toggle');
    if (sbProjToggle) {
      sbProjToggle.addEventListener('click', function() {
        _state.projectsSectionCollapsed = !_state.projectsSectionCollapsed;
        saveSidebarProjUiState();
        renderSidebarProjects(page);
      });
    }

    var sbProjManage = page.querySelector('#aiw-sb-projects-manage');
    if (sbProjManage) {
      sbProjManage.addEventListener('click', function(e) {
        e.stopPropagation();
        setSidebarOpen(page, false);
        if (global.AiWorkspaceProjects && typeof global.AiWorkspaceProjects.openProjectsCenter === 'function') {
          global.AiWorkspaceProjects.openProjectsCenter(page, {
            onClose: function() { reloadChatList(page); }
          });
        } else {
          notifyToast('项目模块尚未加载');
        }
      });
    }

    page.querySelector('#aiw-nav-more-btn').addEventListener('click', function() {
      _state.moreNavOpen = !_state.moreNavOpen;
      var morePanel = page.querySelector('#aiw-more-panel');
      var chev = page.querySelector('#aiw-nav-more-chevron i');
      if (morePanel) morePanel.hidden = !_state.moreNavOpen;
      if (chev) {
        chev.className = _state.moreNavOpen ? 'fa-solid fa-angle-up' : 'fa-solid fa-angle-down';
      }
    });

    page.querySelector('#aiw-account-btn').addEventListener('click', function() {
      setSidebarOpen(page, false);
      openSettingsView(page, 'home');
    });

    var input = page.querySelector('#aiw-input');
    input.addEventListener('input', function() {
      syncComposerButtons(page);
    });
    input.addEventListener('keydown', function(e) {
      var enterSend = !_state.general || _state.general.enterToSend !== false;
      if (e.key === 'Enter' && !e.shiftKey && enterSend) {
        e.preventDefault();
        handleSendMessage(page);
      }
    });

    page.querySelector('#aiw-send-btn').addEventListener('click', function() {
      handleSendMessage(page);
    });

    page.querySelector('#aiw-stop-btn').addEventListener('click', function() {
      if (_state.isStreaming && _state.abortController) {
        _state.abortController.abort();
      }
    });

    page.querySelector('#aiw-mic-btn').addEventListener('click', function() {
      notifyToast('语音输入将在后续阶段接入');
    });

    page.querySelector('#aiw-voice-btn').addEventListener('click', function() {
      notifyToast('实时语音对话将在后续阶段接入');
    });

    page.querySelector('#aiw-attach-btn').addEventListener('click', function() {
      setAttachOpen(page, true);
    });

    page.querySelector('#aiw-attach-backdrop').addEventListener('click', function() {
      setAttachOpen(page, false);
    });

    page.querySelector('#aiw-chip-deep-think').addEventListener('click', function() {
      _state.deepThinkEnabled = false;
      syncDeepThinkUI(page);
    });

    var quoteClearBtn = page.querySelector('#aiw-quote-clear');
    if (quoteClearBtn) {
      quoteClearBtn.addEventListener('click', function() {
        _state.quotedMessage = null;
        syncQuoteBarUI(page);
      });
    }

    var ATTACH_LABELS = {
      camera: '拍照',
      photos: '照片',
      files: '文件',
      plugins: '插件'
    };

    page.querySelectorAll('[data-attach]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var type = btn.getAttribute('data-attach');
        if (type === 'deepThink') {
          _state.deepThinkEnabled = !_state.deepThinkEnabled;
          syncDeepThinkUI(page);
          setAttachOpen(page, false);
          notifyToast(_state.deepThinkEnabled ? '已开启深入思考提示' : '已关闭深入思考');
          return;
        }
        if (type === 'plugins') {
          setAttachOpen(page, false);
          openSettingsView(page, 'plugins');
          return;
        }
        setAttachOpen(page, false);
        notifyToast('「' + (ATTACH_LABELS[type] || '该附件功能') + '」将在后续阶段接入');
      });
    });
  }

  function closeAiWorkspacePage() {
    if (_state.isStreaming && _state.abortController) {
      try { _state.abortController.abort(); } catch (_) {}
      _state.isStreaming = false;
      _state.abortController = null;
    }
    detachAppearanceMediaListener();
    var page = document.getElementById(PAGE_ID);
    if (!page) return;
    if (typeof global.closePage === 'function') {
      global.closePage(PAGE_ID);
    } else {
      page.remove();
    }
  }

  async function showAiWorkspacePage() {
    var existing = document.getElementById(PAGE_ID);
    if (existing) existing.remove();

    _state.sidebarOpen = false;
    _state.attachOpen = false;
    _state.moreNavOpen = false;
    _state.searchQuery = '';
    _state.isStreaming = false;
    _state.abortController = null;

    await loadWorkspaceState();

    var savedProjHomePid = loadProjectHomeUiState();
    if (!_state.activeChatId && savedProjHomePid && S() && typeof S().getProject === 'function') {
      var restoredHomeProj = await S().getProject(savedProjHomePid);
      if (restoredHomeProj) {
        _state.activeProjectHomeId = restoredHomeProj.id;
      } else {
        _state.activeProjectHomeId = null;
        saveProjectHomeUiState();
      }
    }

    // 若之前正在查看某条历史对话，重新打开时从存储刷新该对话数据
    if (_state.activeChatId && S()) {
      var refreshedChat = await S().getChat(_state.activeChatId);
      if (refreshedChat) {
        _state.activeChat = refreshedChat;
        _state.messages = refreshedChat.messages.slice();
        if (refreshedChat.presetId || refreshedChat.presetSnapshot) {
          _state.explicitNoPreset = false;
          _state.activePreset = (_state.presets || []).find(function(p) { return p && p.id === refreshedChat.presetId; }) || refreshedChat.presetSnapshot || null;
        } else {
          _state.explicitNoPreset = true;
          _state.activePreset = null;
        }
      } else {
        _state.activeChatId = null;
        _state.activeChat = null;
        _state.messages = [];
        _state.explicitNoPreset = false;
      }
      await refreshEffectiveApi();
    }

    var page = document.createElement('div');
    page.id = PAGE_ID;
    page.className = 'full-page';
    applyWorkspaceAppearance(page, _state.appearance);
    page.innerHTML = buildPageHtml();

    if (typeof global.openPage === 'function') {
      global.openPage(page);
    } else {
      (document.getElementById('app') || document.body).appendChild(page);
    }

    attachAppearanceMediaListener(page);
    renderSidebarProjects(page);
    renderSidebarChats(page);
    syncDeepThinkUI(page);
    syncQuoteBarUI(page);
    syncComposerButtons(page);
    syncSidebarAccountDom(page);
    syncContextStrip(page);
    updateMainStage(page);
    bindEvents(page);
    if (_state.effectiveApi && _state.effectiveApi.configured) {
      triggerBackgroundMemoryQueue(_state.effectiveApi);
    }
  }

  async function createNewChatInProject(page, projectId) {
    if (_state.isStreaming && _state.abortController) {
      try { _state.abortController.abort(); } catch (_) {}
    }
    var proj = S() ? await S().getProject(projectId) : null;
    var preset = null;
    if (proj && proj.defaultPresetId && S()) {
      var allPresets = await S().listPresets();
      preset = allPresets.find(function(p) { return p.id === proj.defaultPresetId; }) || null;
    }
    if (!preset) {
      preset = resolveEffectivePresetForState();
    }

    _state.activeProjectHomeId = null;
    saveProjectHomeUiState();
    _state.activeChatId = null;
    _state.activeChat = await S().createChat({
      title: '新对话' + (proj ? ('（' + proj.name + '）') : ''),
      projectId: projectId || '',
      presetId: preset ? preset.id : '',
      presetSnapshot: preset ? S().buildPresetSnapshot(preset) : null,
      messages: []
    });
    _state.activeChatId = _state.activeChat.id;
    _state.messages = [];
    _state.quotedMessage = null;
    _state.explicitNoPreset = false;
    _state.activePreset = preset;

    syncQuoteBarUI(page);
    await reloadChatList(page);
    await refreshEffectiveApi();
    syncContextStrip(page);
    updateMainStage(page);
    notifyToast(proj ? ('已在项目「' + proj.name + '」中创建新对话') : '已开启新对话');
  }

  async function loadChatIntoState(page, chatId) {
    if (_state.isStreaming && _state.abortController) {
      try { _state.abortController.abort(); } catch (_) {}
    }
    var chat = S() ? await S().getChat(chatId) : null;
    if (!chat) {
      notifyToast('未找到该对话记录');
      return;
    }
    _state.activeProjectHomeId = null;
    saveProjectHomeUiState();
    _state.activeChat = chat;
    _state.activeChatId = chat.id;
    _state.messages = Array.isArray(chat.messages) ? chat.messages.slice() : [];
    _state.quotedMessage = null;
    if (chat.presetId || chat.presetSnapshot) {
      _state.explicitNoPreset = false;
      _state.activePreset = (_state.presets || []).find(function(p) { return p && p.id === chat.presetId; }) || chat.presetSnapshot || null;
    } else {
      _state.explicitNoPreset = true;
      _state.activePreset = null;
    }
    await refreshEffectiveApi();
    syncQuoteBarUI(page);
    syncContextStrip(page);
    updateMainStage(page);
    renderSidebarProjects(page);
    renderSidebarChats(page);
    notifyToast('已打开对话：' + (chat.title || '新对话'));
  }

  async function syncAfterProjectChange() {
    var page = document.getElementById('ai-workspace-page');
    if (!page) return;
    if (_state.activeChatId && S()) {
      var latest = await S().getChat(_state.activeChatId);
      if (!latest) {
        if (_state.isStreaming && _state.abortController) {
          try { _state.abortController.abort(); } catch (_) {}
        }
        _state.activeChatId = null;
        _state.activeChat = null;
        _state.messages = [];
        _state.quotedMessage = null;
        _state.explicitNoPreset = false;
        _state.activePreset = (!_state.general || _state.general.autoUseDefaultPreset !== false)
          ? _state.defaultPreset
          : null;
        syncQuoteBarUI(page);
        await refreshEffectiveApi();
        syncContextStrip(page);
        updateMainStage(page);
      } else {
        _state.activeChat = latest;
        updateMainStage(page);
      }
    }
    await reloadChatList(page);
    if (_state.activeProjectHomeId) {
      await renderProjectHomeStage(page);
    }
  }

  global.showAiWorkspacePage = showAiWorkspacePage;
  global.showZhiyuPage = showAiWorkspacePage;
  global.AiWorkspace = {
    createNewChatInProject: createNewChatInProject,
    loadChatIntoState: loadChatIntoState,
    openProjectHome: openProjectHome,
    buildProjectSourceTools: buildProjectSourceTools,
    executeBuiltInProjectSourceTool: executeBuiltInProjectSourceTool,
    syncAfterProjectChange: syncAfterProjectChange,
    reloadChatList: reloadChatList
  };
})(typeof window !== 'undefined' ? window : globalThis);