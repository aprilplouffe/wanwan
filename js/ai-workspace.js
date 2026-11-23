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
    activeChatId: null,
    activeChat: null,
    messages: [],
    selectedModel: '',
    activePreset: null,
    presets: [],
    worldbooks: [],
    effectiveWorldBooks: [],
    effectiveWorldBooksInfo: null,
    personalization: null,
    effectiveApi: null,
    isStreaming: false,
    abortController: null,
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
    if (_state.activeChat && _state.activeChat.presetSnapshot) {
      return _state.activeChat.presetSnapshot;
    }
    if (_state.activeChat && _state.activeChat.presetId) {
      var matched = (_state.presets || []).find(function(p) { return p.id === _state.activeChat.presetId; });
      if (matched) return matched;
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
          typeof S().listWorldBooks === 'function' ? S().listWorldBooks() : Promise.resolve([])
        ]);
        _state.userProfile = results[0];
        _state.appearance = results[1];
        _state.general = results[2];
        _state.personalization = results[3];
        _state.presets = results[4] || [];
        _state.selectedModel = results[5] || '';
        _state.chats = results[6] || [];
        _state.worldbooks = results[7] || [];
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
        '<div class="aiw-message-list" id="aiw-message-list" hidden></div>' +
      '</div>' +

      '<div class="aiw-composer-wrap">' +
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
            '<button type="button" class="aiw-nav-item" data-nav="projects">' +
              '<span class="aiw-nav-item-icon"><i class="fa-regular fa-folder"></i></span>' +
              '<span class="aiw-nav-item-label">项目</span>' +
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
                '<span class="aiw-nav-item-tag">待接入</span>' +
              '</button>' +
              '<button type="button" class="aiw-nav-item" data-nav="memory">' +
                '<span class="aiw-nav-item-icon"><i class="fa-regular fa-bookmark"></i></span>' +
                '<span class="aiw-nav-item-label">记忆空间</span>' +
                '<span class="aiw-nav-item-tag" id="aiw-nav-memory-count"></span>' +
              '</button>' +
            '</div>' +
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
            if (refreshedActive) _state.activePreset = refreshedActive;
          }
          if (!_state.activeChat) {
            _state.activePreset = (!_state.general || _state.general.autoUseDefaultPreset !== false)
              ? _state.defaultPreset
              : null;
          }
        }
        if (Array.isArray(nextState.worldbooks)) {
          _state.worldbooks = nextState.worldbooks;
        }
      }
      if (S()) {
        _state.selectedModel = await S().getSelectedModel();
        if (!nextState || !Array.isArray(nextState.worldbooks)) {
          if (typeof S().listWorldBooks === 'function') {
            _state.worldbooks = await S().listWorldBooks();
          }
        }
      }
      await refreshEffectiveApi();
      applyWorkspaceAppearance(page, _state.appearance);
      syncSidebarAccountDom(page);
      syncContextStrip(page);
      updateMainStage(page);
    }, {
      activeChatId: _state.activeChat ? _state.activeChat.id : ''
    });
  }

  function syncContextStrip(page) {
    if (!page) return;
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

  function renderSidebarChats(page) {
    if (!page) return;
    var list = Array.isArray(_state.chats) ? _state.chats : [];
    var pinned = list.filter(function(item) { return item.pinned; });
    var recent = list.filter(function(item) { return !item.pinned; });

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
        _state.activeChatId = loaded.id;
        _state.activeChat = loaded;
        _state.messages = Array.isArray(loaded.messages) ? loaded.messages.slice() : [];
        if (loaded.model) {
          _state.selectedModel = loaded.model;
          if (S()) await S().saveSelectedModel(loaded.model);
        }
        await refreshEffectiveApi();
        setSidebarOpen(page, false);
        syncContextStrip(page);
        updateMainStage(page);
        renderSidebarChats(page);
      });
    });

    page.querySelectorAll('.aiw-chat-more-btn[data-chat-more]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var chatId = btn.getAttribute('data-chat-more');
        var target = list.find(function(c) { return c.id === chatId; });
        if (target) openChatActionsModal(page, target);
      });
    });
  }

  // ===== 主聊天区渲染与单条流式消息更新 =====
  function renderMessageItemHtml(m, idx, totalCount) {
    if (m.role === 'user') {
      var badge = m.deepThink
        ? '<div class="aiw-msg-badge"><i class="fa-regular fa-lightbulb"></i><span>深入思考</span></div>'
        : '';
      return (
        '<div class="aiw-msg-row is-user" data-msg-id="' + escapeHtml(m.id) + '">' +
          badge +
          '<div class="aiw-msg-bubble">' + escapeHtml(m.content) + '</div>' +
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

    var actionsHtml = '';
    if (!m.streaming) {
      var isLastAssistant = idx === totalCount - 1;
      actionsHtml =
        '<div class="aiw-msg-actions">' +
          (m.content
            ? '<button type="button" class="aiw-msg-act-btn" data-msg-act="copy" data-msg-id="' + escapeHtml(m.id) + '" title="复制回复"><i class="fa-regular fa-copy"></i> 复制</button>'
            : '') +
          '<button type="button" class="aiw-msg-act-btn' + (isLastAssistant ? ' is-primary-act' : '') + '" data-msg-act="regen" data-msg-id="' + escapeHtml(m.id) + '" title="重新生成回答"><i class="fa-solid fa-rotate-right"></i> 重新生成</button>' +
          (m.model ? '<span class="aiw-msg-model-tag">' + escapeHtml(m.model) + '</span>' : '') +
        '</div>';
    }

    return (
      '<div class="aiw-msg-row is-assistant" data-msg-id="' + escapeHtml(m.id) + '">' +
        '<div class="aiw-msg-bubble" id="aiw-msg-bubble-' + escapeHtml(m.id) + '">' + bodyHtml + '</div>' +
        statusLine +
        errorHtml +
        actionsHtml +
      '</div>'
    );
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

      var actBtn = e.target.closest && e.target.closest('[data-msg-act]');
      if (!actBtn) return;
      var act = actBtn.getAttribute('data-msg-act');
      var msgId = actBtn.getAttribute('data-msg-id');
      var targetMsg = _state.messages.find(function(m) { return m.id === msgId; });
      if (!targetMsg) return;

      if (act === 'copy') {
        copyTextSafely(targetMsg.content || '');
      } else if (act === 'regen') {
        regenerateAtMessage(page, msgId);
      }
    });
  }

  function updateStreamingBubbleDom(page, msg) {
    if (!page || !msg) return;
    var row = page.querySelector('.aiw-msg-row[data-msg-id="' + msg.id + '"]');
    if (!row) {
      updateMainStage(page);
      return;
    }
    var bubble = row.querySelector('#aiw-msg-bubble-' + msg.id);
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

  function updateMainStage(page) {
    if (!page) return;
    var emptyStage = page.querySelector('#aiw-empty-stage');
    var msgList = page.querySelector('#aiw-message-list');
    var emptyTitle = page.querySelector('#aiw-empty-title');
    var emptySub = page.querySelector('#aiw-empty-sub');
    var emptyCta = page.querySelector('#aiw-empty-api-cta');
    var topbarTitle = page.querySelector('#aiw-topbar-title');

    if (topbarTitle) {
      topbarTitle.textContent = (_state.activeChat && _state.activeChat.title) ? _state.activeChat.title : '知屿';
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

    var scrollEl = page.querySelector('#aiw-main-scroll');
    if (scrollEl) {
      scrollEl.scrollTop = scrollEl.scrollHeight;
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
  async function persistCurrentChatMessages() {
    if (!S() || !_state.activeChat) return null;
    var cleanMessages = _state.messages.map(function(m) {
      return {
        id: m.id,
        role: m.role,
        content: m.content || '',
        createdAt: m.createdAt || Date.now(),
        model: m.model || '',
        error: m.error || '',
        aborted: !!m.aborted,
        deepThink: !!m.deepThink
      };
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

  async function executeStreamingTurn(page, historyBeforeTurn, userText, assistantMsg, effectiveApi, turnOpts) {
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
          messages: historyBeforeTurn,
          userInput: userText
        });
        if (wbMatchRes && Array.isArray(wbMatchRes.matchedEntries)) {
          matchedWorldBookEntries = wbMatchRes.matchedEntries;
        }
      } catch (wbErr) {
        console.warn('[AiWorkspace] worldbook match skipped:', wbErr);
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
      worldBookEntries: matchedWorldBookEntries,
      memories: memContext.memories || [],
      crossChatContexts: memContext.crossChatContexts || [],
      deepThink: _state.deepThinkEnabled,
      memoryTurnNotice: (turnOpts && turnOpts.memoryTurnNotice) || ''
    });

    var controller = new AbortController();
    _state.isStreaming = true;
    _state.abortController = controller;
    syncComposerButtons(page);

    var completedNormally = false;
    try {
      var res = await AI().streamChatCompletion({
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
        assistantMsg.error = (err && err.message) ? err.message : '请求失败，请检查网络连接与 API 配置';
      }
    } finally {
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
      var autoTitle = S() ? S().generateChatTitle(text) : text.slice(0, 22);
      _state.activeChat = await S().createChat({
        title: autoTitle,
        model: effective.model,
        presetId: preset ? preset.id : '',
        presetSnapshot: preset ? S().buildPresetSnapshot(preset) : null,
        messages: []
      });
      _state.activeChatId = _state.activeChat.id;
    } else if (_state.messages.length === 0 && (!_state.activeChat.title || _state.activeChat.title === '新对话')) {
      _state.activeChat.title = S().generateChatTitle(text);
    }

    var historyBeforeTurn = _state.messages.slice();
    var userMsg = {
      id: S() ? S().generateMessageId() : ('msg_' + Date.now() + '_u'),
      role: 'user',
      content: text,
      createdAt: Date.now(),
      deepThink: _state.deepThinkEnabled
    };
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

    await executeStreamingTurn(page, historyBeforeTurn, text, assistantMsg, effective, {
      userMsgId: userMsg.id,
      skipAutoMemory: !!(explicitRes && (explicitRes.isExplicit || explicitRes.intent === 'clarify')),
      memoryTurnNotice: memoryTurnNotice
    });
  }

  async function regenerateAtMessage(page, msgId) {
    if (_state.isStreaming) return;
    var targetIdx = _state.messages.findIndex(function(m) { return m.id === msgId; });
    if (targetIdx === -1) return;

    var userIdx = -1;
    for (var i = targetIdx - 1; i >= 0; i--) {
      if (_state.messages[i].role === 'user') {
        userIdx = i;
        break;
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

    var userPrompt = _state.messages[userIdx].content;
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

    await executeStreamingTurn(page, historyBeforeTurn, userPrompt, assistantMsg, effective, { skipAutoMemory: true });
  }

  async function startNewChat(page, silent) {
    if (_state.isStreaming && _state.abortController) {
      try { _state.abortController.abort(); } catch (_) {}
    }
    _state.activeChatId = null;
    _state.activeChat = null;
    _state.messages = [];
    if (!_state.general || _state.general.autoUseDefaultPreset !== false) {
      _state.activePreset = _state.defaultPreset;
    } else {
      _state.activePreset = null;
    }
    await refreshEffectiveApi();
    syncContextStrip(page);
    updateMainStage(page);
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
        var label = NAV_LABELS[key] || '该功能';
        notifyToast('「' + label + '」将在后续阶段接入');
      });
    });

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

    // 若之前正在查看某条历史对话，重新打开时从存储刷新该对话数据
    if (_state.activeChatId && S()) {
      var refreshedChat = await S().getChat(_state.activeChatId);
      if (refreshedChat) {
        _state.activeChat = refreshedChat;
        _state.messages = refreshedChat.messages.slice();
      } else {
        _state.activeChatId = null;
        _state.activeChat = null;
        _state.messages = [];
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
    renderSidebarChats(page);
    syncDeepThinkUI(page);
    syncComposerButtons(page);
    syncSidebarAccountDom(page);
    syncContextStrip(page);
    updateMainStage(page);
    bindEvents(page);
    if (_state.effectiveApi && _state.effectiveApi.configured) {
      triggerBackgroundMemoryQueue(_state.effectiveApi);
    }
  }

  global.showAiWorkspacePage = showAiWorkspacePage;
  global.showZhiyuPage = showAiWorkspacePage;
})(typeof window !== 'undefined' ? window : globalThis);
