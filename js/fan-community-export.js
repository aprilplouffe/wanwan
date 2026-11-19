// js/fan-community-export.js — 同好社区 · 捡手机文学 转发微信 & HTML/PNG(分段)导出模块

(function(global) {
  'use strict';

  var FC_WORK_PREFIX = '__FCWORK__';
  var DEFAULT_BG_COLOR = '#9bb0c1';
  var DEFAULT_USER_BUBBLE = '#fff133';
  var DEFAULT_CHAR_BUBBLE = '#ffffff';

  function escHtml(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function sanitizeFilename(name, fallback) {
    var clean = String(name || '').trim()
      .replace(/[\\/:*?"<>|\r\n]+/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 64);
    return clean || (fallback || '捡手机文学');
  }

  function normalizeHex(val, fallback) {
    if (typeof val !== 'string') return fallback;
    var s = val.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^#[0-9a-f]{3}$/.test(s)) {
      return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    return fallback;
  }

  function hexToRgb(hex) {
    var h = normalizeHex(hex, '#ffffff').slice(1);
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function relativeLuminance(hex) {
    var rgb = hexToRgb(hex);
    var toLin = function(c) {
      var v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b);
  }

  function isDarkHex(hex) {
    return relativeLuminance(hex) < 0.34;
  }

  function computeBubbleTokens(hex) {
    var clean = normalizeHex(hex, '#ffffff');
    var dark = isDarkHex(clean);
    return {
      bg: clean,
      fg: dark ? '#f6f8fa' : '#1f2329',
      sub: dark ? 'rgba(246, 248, 250, 0.74)' : '#667481'
    };
  }

  function formatDateTime(ts) {
    var n = Number(ts);
    if (!n || !Number.isFinite(n)) return '';
    var d = new Date(n);
    if (Number.isNaN(d.getTime())) return '';
    var pad = function(x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function getEffectiveAppearance(workData) {
    var ap = (workData && workData.appearance) || {};
    return {
      bgType: ap.bgType === 'image' && ap.bgImageAssetId ? 'image' : 'color',
      bgColor: normalizeHex(ap.bgColor, DEFAULT_BG_COLOR),
      bgImageAssetId: typeof ap.bgImageAssetId === 'string' ? ap.bgImageAssetId : '',
      bgImageFit: ap.bgImageFit === 'contain' ? 'contain' : 'cover',
      userBubbleColor: normalizeHex(ap.userBubbleColor, DEFAULT_USER_BUBBLE),
      charBubbleColor: normalizeHex(ap.charBubbleColor, DEFAULT_CHAR_BUBBLE)
    };
  }

  function isTextImageItem(item) {
    if (!item || item.type !== 'image') return false;
    if (item.isSticker) return false;
    if (item.imageMode === 'text_card') return true;
    return Boolean(!item.assetId && !item.src && (item.text || item.alt));
  }

  function unwrapItem(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return null;
    if (rawItem.type === 'withdraw') {
      if (rawItem.original && typeof rawItem.original === 'object') {
        return {
          item: Object.assign({}, rawItem.original, {
            id: rawItem.id || rawItem.original.id,
            side: rawItem.side || rawItem.original.side,
            sentTime: rawItem.sentTime || rawItem.original.sentTime || '',
            sentTimeFull: rawItem.sentTimeFull || rawItem.original.sentTimeFull || '',
            fakeRecall: true
          }),
          isRecalled: true,
          legacyWithdrawOnly: false
        };
      }
      return {
        item: rawItem,
        isRecalled: true,
        legacyWithdrawOnly: true
      };
    }
    return {
      item: rawItem,
      isRecalled: Boolean(rawItem.fakeRecall),
      legacyWithdrawOnly: false
    };
  }

  function getSentTimeLabel(item, rawItem) {
    var t = String((item && item.sentTime) || (rawItem && rawItem.sentTime) || '').trim();
    if (t) return t;
    var full = String((item && item.sentTimeFull) || (rawItem && rawItem.sentTimeFull) || '').trim();
    var m = full.match(/(\d{2}:\d{2})/);
    return m ? m[1] : '';
  }

  async function resolveWorkAssets(workData) {
    var srcMap = Object.create(null);
    var metaMap = Object.create(null);
    var api = global.FanCommunityAssets || null;
    if (!workData || !api) {
      return { srcMap: srcMap, metaMap: metaMap };
    }

    var ids = Object.create(null);
    if (workData.userAvatarAssetId) ids[workData.userAvatarAssetId] = true;
    if (workData.charAvatarAssetId) ids[workData.charAvatarAssetId] = true;
    if (workData.appearance && workData.appearance.bgImageAssetId) {
      ids[workData.appearance.bgImageAssetId] = true;
    }
    var items = Array.isArray(workData.items) ? workData.items : [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      if (it.assetId) ids[it.assetId] = true;
      if (it.original && it.original.assetId) ids[it.original.assetId] = true;
    }

    var idList = Object.keys(ids);
    await Promise.all(idList.map(async function(assetId) {
      try {
        var cached = typeof api.getCachedSrc === 'function' ? api.getCachedSrc(assetId) : '';
        if (cached) srcMap[assetId] = cached;
        if (typeof api.getAsset === 'function') {
          var rec = await api.getAsset(assetId);
          if (rec) {
            if (rec.src) srcMap[assetId] = rec.src;
            metaMap[assetId] = {
              name: String(rec.name || '').trim(),
              description: String(rec.description || '').trim(),
              kind: String(rec.kind || '').trim()
            };
          }
        }
      } catch (_) {}
    }));

    return { srcMap: srcMap, metaMap: metaMap };
  }

  // ===== 1. 微信转发：构建作品结构化文本与分享卡片载荷 =====

  function buildWorkTranscriptItems(workData, assetMetaMap) {
    var items = Array.isArray(workData && workData.items) ? workData.items : [];
    var userName = String((workData && workData.user) || '我');
    var charName = String((workData && workData.char) || '对方');
    var metaMap = assetMetaMap || {};
    var out = [];

    for (var i = 0; i < items.length; i++) {
      var raw = items[i];
      var unwrapped = unwrapItem(raw);
      if (!unwrapped) continue;
      var it = unwrapped.item;

      if (unwrapped.legacyWithdrawOnly) {
        out.push({
          floor: i + 1,
          side: it.side === 'right' ? 'right' : 'left',
          speaker: it.side === 'right' ? userName : charName,
          type: 'recall_notice',
          text: (it.side === 'right' ? userName : charName) + '撤回了一条消息',
          time: getSentTimeLabel(it, raw),
          recalled: true
        });
        continue;
      }

      if (it.type === 'date') {
        out.push({
          floor: i + 1,
          side: 'center',
          speaker: '',
          type: 'date',
          text: String(it.text || '').trim(),
          time: '',
          recalled: false
        });
        continue;
      }

      var side = it.side === 'right' ? 'right' : 'left';
      var speaker = side === 'right' ? userName : charName;
      var timeLabel = getSentTimeLabel(it, raw);
      var entry = {
        floor: i + 1,
        side: side,
        speaker: speaker,
        type: it.type || 'text',
        text: '',
        time: timeLabel,
        recalled: Boolean(unwrapped.isRecalled)
      };

      if (it.type === 'text') {
        entry.text = String(it.text || '').trim();
      } else if (it.type === 'text_voice' || it.type === 'voice') {
        entry.type = 'voice';
        entry.duration = Number(it.duration) || 6;
        entry.text = String(it.text || it.content || '').trim() || '（语音消息）';
      } else if (it.type === 'image') {
        if (it.isSticker) {
          entry.type = 'sticker';
          var stMeta = (it.assetId && metaMap[it.assetId]) || null;
          var stName = String(it.stickerName || (stMeta && stMeta.name) || it.alt || '表情包').trim();
          var stDesc = String(it.stickerDesc || (stMeta && stMeta.description) || '').trim();
          entry.text = stDesc ? (stName + '：' + stDesc) : stName;
        } else {
          entry.type = 'image';
          entry.text = String(it.text || it.alt || '图片').trim();
        }
      } else if (it.type === 'location') {
        entry.type = 'location';
        entry.name = String(it.name || '位置分享').trim();
        entry.address = String(it.address || '').trim();
        entry.text = entry.address ? (entry.name + '（' + entry.address + '）') : entry.name;
      } else if (it.type === 'transfer') {
        entry.type = 'transfer';
        entry.amount = String(it.amount || '0');
        entry.note = String(it.note || '转账');
        entry.claimed = it.status === 'claimed' || Boolean(it.claimed);
        entry.text = '转账 ' + entry.amount + (entry.note ? (' · ' + entry.note) : '') + (entry.claimed ? '（已领取）' : '（未领取）');
      } else if (it.type === 'call') {
        entry.type = 'call';
        entry.video = Boolean(it.video);
        entry.text = (it.video ? '视频通话' : '语音通话') + ' · ' + String(it.status || '已接通') + (it.duration ? (' ' + it.duration) : '');
      } else {
        entry.text = String(it.text || it.alt || '[消息]').trim();
      }

      out.push(entry);
    }

    return out;
  }

  function buildFcWorkSharePayload(workData, assetMetaMap) {
    var transcript = buildWorkTranscriptItems(workData, assetMetaMap);
    var title = String((workData && workData.title) || '未命名作品').trim() || '未命名作品';
    var userName = String((workData && workData.user) || '我');
    var charName = String((workData && workData.char) || '对方');
    var excerpt = String((workData && workData.excerpt) || '').trim();
    if (!excerpt && global.FanCommunityWorks && typeof global.FanCommunityWorks.buildWorkExcerpt === 'function') {
      excerpt = global.FanCommunityWorks.buildWorkExcerpt(workData && workData.items);
    }
    if (!excerpt) {
      excerpt = transcript.filter(function(m) { return m.type !== 'date' && m.text; })
        .slice(0, 2)
        .map(function(m) { return m.speaker + '：' + m.text; })
        .join(' / ')
        .slice(0, 72);
    }

    // 保留完整剧情供微信 Char 阅读讨论（限制极端超长作品单条消息字节数以免超限）
    var trimmedMessages = transcript.slice(0, 180).map(function(m) {
      return {
        s: m.side === 'right' ? 'R' : (m.side === 'center' ? 'C' : 'L'),
        n: String(m.speaker || '').slice(0, 24),
        k: String(m.type || 'text').slice(0, 14),
        t: String(m.text || '').slice(0, 280),
        tm: m.time ? String(m.time).slice(0, 16) : '',
        r: m.recalled ? 1 : 0,
        d: m.duration ? Number(m.duration) : undefined
      };
    });

    return {
      v: 1,
      category: 'phone_fiction',
      categoryLabel: '同好社区 · 捡手机文学',
      archiveId: String((workData && (workData.archiveId || workData.lastArchiveId)) || ''),
      sourceWorkId: String((workData && (workData.sourceWorkId || workData.id)) || ''),
      title: title,
      userName: userName,
      charName: charName,
      messageCount: transcript.length,
      truncated: transcript.length > trimmedMessages.length,
      completedAt: Number((workData && (workData.completedAt || workData.archivedAt)) || Date.now()),
      showBubbleTime: Boolean(workData && workData.timeSettings && workData.timeSettings.showBubbleTime),
      excerpt: excerpt,
      messages: trimmedMessages
    };
  }

  function encodeFcWorkMessage(payload) {
    if (typeof global.buildFcWorkMessageContent === 'function') {
      return global.buildFcWorkMessageContent(payload);
    }
    return FC_WORK_PREFIX + JSON.stringify(payload || {});
  }

  async function resolveActiveWechatOwnerUid() {
    var database = global.db;
    if (!database || !database.characters) return null;
    try {
      var stored = global.localStorage ? global.localStorage.getItem('wanwan_wechat_uid') : null;
      if (stored) {
        var uid = parseInt(stored, 10);
        if (Number.isFinite(uid)) {
          var found = await database.characters.get(uid);
          if (found) return found.id;
        }
      }
      var firstUser = await database.characters.where('type').equals('user').first();
      if (firstUser) return firstUser.id;
    } catch (_) {}
    return null;
  }

  async function listWechatCharContacts() {
    var database = global.db;
    if (!database || !database.characters) return [];
    try {
      var raw = await database.characters.where('type').notEqual('user').toArray();
      var list = (raw || []).filter(function(c) {
        return c && c.type !== 'user';
      });
      var contacts = await Promise.all(list.map(async function(c) {
        var display = c;
        if (typeof global.getWechatDisplayCharacter === 'function') {
          try {
            var enriched = await global.getWechatDisplayCharacter(c.id);
            if (enriched) display = enriched;
          } catch (_) {}
        }
        var displayName = '';
        if (typeof global.getWechatDisplayName === 'function') {
          try { displayName = global.getWechatDisplayName(display); } catch (_) {}
        }
        if (!displayName) {
          displayName = display.remark || display.nick || display.name || ('角色 #' + c.id);
        }
        return {
          id: c.id,
          name: displayName,
          subName: display.name && display.name !== displayName ? display.name : (display.bio || ''),
          avatar: display.avatar || c.avatar || '',
          type: c.type || 'char'
        };
      }));
      contacts.sort(function(a, b) {
        return String(a.name).localeCompare(String(b.name), 'zh-CN');
      });
      return contacts;
    } catch (_) {
      return [];
    }
  }

  async function forwardWorkToWechatChars(workData, charIds) {
    var database = global.db;
    if (!database || !database.chats || !database.messages || !database.characters) {
      return { ok: false, error: '弯弯机微信数据库未就绪' };
    }
    var targetIds = Array.isArray(charIds) ? charIds.map(function(id) { return Number(id); }).filter(function(id) { return Number.isFinite(id); }) : [];
    if (!targetIds.length) {
      return { ok: false, error: '请至少选择一位微信联系人' };
    }

    var ownerUid = await resolveActiveWechatOwnerUid();
    if (!ownerUid) {
      return { ok: false, error: '请先在弯弯机微信中登录或创建一个用户身份' };
    }

    var assetsRes = await resolveWorkAssets(workData);
    var payload = buildFcWorkSharePayload(workData, assetsRes.metaMap);
    var msgContent = encodeFcWorkMessage(payload);
    var previewText = '[捡手机文学] ' + payload.title;
    var now = Date.now();
    var sent = [];

    for (var i = 0; i < targetIds.length; i++) {
      var charId = targetIds[i];
      var chat = null;
      try {
        chat = await database.chats.where('[ownerUid+charId]').equals([ownerUid, charId]).first();
      } catch (_) {
        var allChats = await database.chats.where('charId').equals(charId).toArray();
        chat = allChats.find(function(c) { return c && c.ownerUid === ownerUid; }) || null;
      }
      if (!chat) {
        var newChatId = await database.chats.add({
          charId: charId,
          ownerUid: ownerUid,
          createdAt: now + i,
          updatedAt: now + i,
          lastMessage: previewText,
          unread: 0
        });
        chat = { id: newChatId, charId: charId, ownerUid: ownerUid };
      }

      var msgId = await database.messages.add({
        chatId: chat.id,
        charId: charId,
        role: 'user',
        content: msgContent,
        createdAt: now + i
      });

      await database.chats.update(chat.id, {
        updatedAt: now + i,
        lastMessage: previewText
      });

      sent.push({ charId: charId, chatId: chat.id, messageId: msgId });
    }

    if (typeof global.refreshChatList === 'function') {
      try { global.refreshChatList(); } catch (_) {}
    }

    return {
      ok: true,
      count: sent.length,
      sent: sent,
      payload: payload
    };
  }

  // ===== 2. HTML 独立阅读文件导出 =====

  function buildExportHtml(workData, assetMap) {
    var map = assetMap || {};
    var ap = getEffectiveAppearance(workData);
    var userTokens = computeBubbleTokens(ap.userBubbleColor);
    var charTokens = computeBubbleTokens(ap.charBubbleColor);
    var darkBg = isDarkHex(ap.bgColor);
    var bgImageSrc = (ap.bgType === 'image' && ap.bgImageAssetId && map[ap.bgImageAssetId]) ? map[ap.bgImageAssetId] : '';
    var userAvatarSrc = (workData.userAvatarAssetId && map[workData.userAvatarAssetId]) ? map[workData.userAvatarAssetId] : '';
    var charAvatarSrc = (workData.charAvatarAssetId && map[workData.charAvatarAssetId]) ? map[workData.charAvatarAssetId] : '';
    var userName = String((workData && workData.user) || '我');
    var charName = String((workData && workData.char) || '对方');
    var title = String((workData && workData.title) || '未命名作品');
    var showBubbleTime = Boolean(workData && workData.timeSettings && workData.timeSettings.showBubbleTime);
    var items = Array.isArray(workData && workData.items) ? workData.items : [];
    var completedText = workData && workData.completedAt ? formatDateTime(workData.completedAt) : formatDateTime(Date.now());

    var avatarFallbackSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="#64a9a8"/><circle cx="20" cy="15" r="7" fill="#d9eeee"/><path d="M8 35c2.2-6.5 7-9.5 12-9.5s9.8 3 12 9.5" fill="#d9eeee"/></svg>'
    );

    var rowsHtml = [];
    for (var i = 0; i < items.length; i++) {
      var raw = items[i];
      var unwrapped = unwrapItem(raw);
      if (!unwrapped) continue;
      var item = unwrapped.item;
      var isRecalled = unwrapped.isRecalled;

      if (unwrapped.legacyWithdrawOnly) {
        var legacyTip = item.side === 'right' ? '你撤回了一条消息' : (charName + '撤回了一条消息');
        rowsHtml.push('<div class="fc-recall-tip">' + escHtml(legacyTip) + '</div>');
        continue;
      }

      if (item.type === 'date') {
        rowsHtml.push('<div class="fc-date"><span>' + escHtml(item.text || '') + '</span></div>');
        continue;
      }

      var side = item.side === 'right' ? 'right' : 'left';
      var roleName = side === 'right' ? userName : charName;
      var avSrc = (side === 'right' ? userAvatarSrc : charAvatarSrc) || avatarFallbackSvg;
      var sentTime = getSentTimeLabel(item, raw);

      var bubbleHtml = '';
      if (item.type === 'text') {
        bubbleHtml = '<div class="fc-bubble">' + escHtml(item.text || '').replace(/\n/g, '<br>') + '</div>';
      } else if (item.type === 'text_voice' || item.type === 'voice') {
        var dur = Number(item.duration) || 6;
        var vText = String(item.text || item.content || '').trim() || '（未填写语音文字）';
        var minW = Math.min(238, Math.max(126, 102 + dur * 4));
        bubbleHtml =
          '<div class="fc-voice is-expanded">' +
            '<button type="button" class="fc-voice-bar" style="min-width:' + minW + 'px" onclick="this.parentElement.classList.toggle(\'is-expanded\')">' +
              '<span class="fc-voice-ic">((•</span>' +
              '<span class="fc-voice-wave">··· ···</span>' +
              '<span class="fc-voice-dur">' + escHtml(String(dur)) + '″</span>' +
            '</button>' +
            '<div class="fc-voice-body">' + escHtml(vText).replace(/\n/g, '<br>') + '</div>' +
          '</div>';
      } else if (item.type === 'image') {
        if (isTextImageItem(item)) {
          bubbleHtml =
            '<div class="fc-imgcard">' +
              '<div class="fc-imgcard-head"><span>🖼</span><span>图片</span></div>' +
              '<div class="fc-imgcard-body">' + escHtml(item.text || item.alt || '图片内容').replace(/\n/g, '<br>') + '</div>' +
            '</div>';
        } else {
          var imgSrc = item.src || (item.assetId && map[item.assetId]) || '';
          if (imgSrc) {
            bubbleHtml = '<div class="fc-image' + (item.isSticker ? ' is-sticker' : '') + '"><img src="' + escHtml(imgSrc) + '" alt="' + escHtml(item.alt || '表情包') + '"></div>';
          } else {
            bubbleHtml = '<div class="fc-bubble">' + escHtml(item.isSticker ? '[表情包]' : ('[图片] ' + (item.text || item.alt || ''))) + '</div>';
          }
        }
      } else if (item.type === 'location') {
        bubbleHtml =
          '<div class="fc-location">' +
            '<div class="fc-loc-info">' +
              '<div class="fc-loc-name">' + escHtml(item.name || '位置分享') + '</div>' +
              (item.address ? '<div class="fc-loc-addr">' + escHtml(item.address) + '</div>' : '') +
            '</div>' +
            '<div class="fc-loc-map"><span class="fc-loc-pin">📍</span><span class="fc-loc-tag">位置</span></div>' +
          '</div>';
      } else if (item.type === 'transfer') {
        var claimed = item.status === 'claimed' || Boolean(item.claimed);
        bubbleHtml =
          '<div class="fc-transfer' + (claimed ? ' is-claimed' : '') + '">' +
            '<div class="fc-transfer-amt">⇄ ' + escHtml(item.amount || '0') + '</div>' +
            '<div class="fc-transfer-note">' + escHtml(item.note || '转账') + '</div>' +
            '<div class="fc-transfer-foot"><span>转账</span><span>' + (claimed ? '已领取' : '未领取') + '</span></div>' +
          '</div>';
      } else if (item.type === 'call') {
        bubbleHtml =
          '<div class="fc-call">' +
            '<div class="fc-call-ic">' + (item.video ? '▣' : '☎') + '</div>' +
            '<div><div class="fc-call-t">' + (item.video ? '视频通话' : '语音通话') + '</div>' +
            '<div class="fc-call-m">' + escHtml((item.status || '已接通') + (item.duration ? (' · ' + item.duration) : '')) + '</div></div>' +
          '</div>';
      } else {
        bubbleHtml = '<div class="fc-bubble">' + escHtml(item.text || item.alt || '[消息]') + '</div>';
      }

      var sideMetaParts = [];
      if (isRecalled) {
        sideMetaParts.push('<span class="fc-recall-badge" title="假撤回标记"><span class="r-ic">↻</span><span class="x-ic">✕</span></span>');
      }
      if (showBubbleTime && sentTime) {
        sideMetaParts.push('<span class="fc-time" title="' + escHtml(item.sentTimeFull || '') + '">' + escHtml(sentTime) + '</span>');
      }
      var sideMetaHtml = sideMetaParts.length ? ('<div class="fc-side-meta">' + sideMetaParts.join('') + '</div>') : '';
      var bubbleWrapHtml = side === 'right'
        ? ('<div class="fc-bubble-wrap">' + sideMetaHtml + bubbleHtml + '</div>')
        : ('<div class="fc-bubble-wrap">' + bubbleHtml + sideMetaHtml + '</div>');

      rowsHtml.push(
        '<div class="fc-msg ' + side + (isRecalled ? ' is-recalled' : '') + '">' +
          '<img class="fc-avatar" src="' + escHtml(avSrc) + '" alt="' + escHtml(roleName) + '">' +
          '<div class="fc-msgbody">' +
            '<div class="fc-name">' + escHtml(roleName) + '</div>' +
            bubbleWrapHtml +
          '</div>' +
        '</div>'
      );

      if (isRecalled) {
        var recallLine = side === 'right' ? '你撤回了一条消息' : (charName + '撤回了一条消息');
        rowsHtml.push('<div class="fc-recall-tip">' + escHtml(recallLine) + '</div>');
      }
    }

    var bgCssRule = bgImageSrc
      ? 'background-color:' + ap.bgColor + ';background-image:url("' + bgImageSrc + '");background-size:' + ap.bgImageFit + ';background-position:center;background-repeat:no-repeat;background-attachment:fixed;'
      : 'background-color:' + ap.bgColor + ';';

    return '<!DOCTYPE html>\n' +
      '<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      '<title>' + escHtml(title) + ' — 捡手机文学</title>\n' +
      '<style>\n' +
      '*{box-sizing:border-box;margin:0;padding:0}\n' +
      'body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f4f1ea;color:#222;min-height:100vh;display:flex;justify-content:center;padding:16px 10px}\n' +
      '.fc-export-shell{width:100%;max-width:460px;border-radius:18px;overflow:hidden;box-shadow:0 12px 36px rgba(34,42,50,.14);display:flex;flex-direction:column;background:' + ap.bgColor + '}\n' +
      '.fc-export-head{background:#fffefa;padding:14px 16px;border-bottom:1px solid #e7e1d6;display:flex;align-items:center;justify-content:space-between;gap:10px}\n' +
      '.fc-export-head h1{font-size:16px;font-weight:700;color:#2f322c;line-height:1.3}\n' +
      '.fc-export-sub{font-size:11px;color:#7a7f74;margin-top:3px}\n' +
      '.fc-voice-all-btn{border:1px solid #d9d2c5;background:#f9f7f2;color:#4a4e45;font-size:11px;padding:6px 10px;border-radius:8px;cursor:pointer;white-space:nowrap}\n' +
      '.fc-stream{padding:16px 12px 24px;display:flex;flex-direction:column;gap:12px;' + bgCssRule + '}\n' +
      '.fc-date{text-align:center;margin:4px 0}\n' +
      '.fc-date span{display:inline-block;padding:3px 10px;border-radius:10px;font-size:11px;background:rgba(0,0,0,.18);color:#fff}\n' +
      '.fc-recall-tip{text-align:center;font-size:11px;color:' + (darkBg ? 'rgba(255,255,255,.78)' : 'rgba(42,56,70,.72)') + ';margin:-4px 0 2px}\n' +
      '.fc-msg{display:flex;align-items:flex-start;gap:8px}\n' +
      '.fc-msg.right{flex-direction:row-reverse}\n' +
      '.fc-avatar{width:38px;height:38px;border-radius:50%;object-fit:cover;flex:0 0 38px;background:#64a9a8}\n' +
      '.fc-msgbody{display:flex;flex-direction:column;max-width:78%;min-width:0}\n' +
      '.fc-msg.right .fc-msgbody{align-items:flex-end}\n' +
      '.fc-name{font-size:11px;margin-bottom:4px;color:' + (darkBg ? '#e4ecf3' : '#4a5f70') + ';padding:0 2px}\n' +
      '.fc-bubble-wrap{display:flex;align-items:flex-end;gap:6px;max-width:100%}\n' +
      '.fc-side-meta{display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0}\n' +
      '.fc-time{font-size:10px;line-height:1;color:' + (darkBg ? 'rgba(240,245,250,.76)' : 'rgba(48,64,78,.72)') + ';white-space:nowrap}\n' +
      '.fc-recall-badge{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:10px;background:rgba(255,255,255,.92);box-shadow:0 1px 4px rgba(0,0,0,.1);font-size:11px;line-height:1}\n' +
      '.fc-recall-badge .r-ic{color:#2f3740;font-weight:700}\n' +
      '.fc-recall-badge .x-ic{color:#e05656;font-weight:700}\n' +
      '.fc-bubble{padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.5;word-break:break-word;white-space:pre-wrap;box-shadow:0 1px 2px rgba(0,0,0,.06)}\n' +
      '.fc-msg.left .fc-bubble{background:' + charTokens.bg + ';color:' + charTokens.fg + ';border-top-left-radius:4px}\n' +
      '.fc-msg.right .fc-bubble{background:' + userTokens.bg + ';color:' + userTokens.fg + ';border-top-right-radius:4px}\n' +
      '.fc-image img{display:block;max-width:168px;max-height:168px;border-radius:12px;object-fit:contain}\n' +
      '.fc-image.is-sticker img{max-width:132px;max-height:132px;background:transparent}\n' +
      '.fc-imgcard{width:214px;border-radius:13px;overflow:hidden;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08);border:1px solid rgba(0,0,0,.06)}\n' +
      '.fc-imgcard-head{display:flex;align-items:center;gap:6px;padding:7px 10px;background:#f4f7fa;font-size:11px;font-weight:600;color:#4f6272;border-bottom:1px solid #e7edf2}\n' +
      '.fc-imgcard-body{padding:11px 12px;font-size:13px;line-height:1.55;color:#28313a;white-space:pre-wrap;word-break:break-word}\n' +
      '.fc-voice{display:flex;flex-direction:column;gap:5px;max-width:248px}\n' +
      '.fc-voice-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;border-radius:14px;border:none;cursor:pointer;font-size:13px;box-shadow:0 1px 2px rgba(0,0,0,.06)}\n' +
      '.fc-msg.left .fc-voice-bar{background:' + charTokens.bg + ';color:' + charTokens.fg + '}\n' +
      '.fc-msg.right .fc-voice-bar{background:' + userTokens.bg + ';color:' + userTokens.fg + '}\n' +
      '.fc-voice-body{display:none;padding:8px 11px;border-radius:10px;background:rgba(255,255,255,.94);color:#2c333a;font-size:13px;line-height:1.5;word-break:break-word}\n' +
      '.fc-voice.is-expanded .fc-voice-body{display:block}\n' +
      '.fc-location{width:222px;border-radius:13px;overflow:hidden;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08);border:1px solid rgba(0,0,0,.06)}\n' +
      '.fc-loc-info{padding:9px 11px}\n' +
      '.fc-loc-name{font-size:13.5px;font-weight:700;color:#222a33}\n' +
      '.fc-loc-addr{font-size:11.5px;color:#6b7987;margin-top:2px;line-height:1.35}\n' +
      '.fc-loc-map{height:64px;background:linear-gradient(135deg,#e5f1ea 0%,#d7e7f2 100%);display:flex;align-items:center;justify-content:center;position:relative}\n' +
      '.fc-loc-pin{font-size:20px}\n' +
      '.fc-loc-tag{position:absolute;right:8px;bottom:6px;font-size:10px;color:#556b7d;background:rgba(255,255,255,.85);padding:1px 6px;border-radius:6px}\n' +
      '.fc-transfer{width:214px;border-radius:13px;padding:11px 12px 9px;background:#f39a3e;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08)}\n' +
      '.fc-transfer.is-claimed{opacity:.76}\n' +
      '.fc-transfer-amt{font-size:16px;font-weight:700}\n' +
      '.fc-transfer-note{font-size:12px;margin:4px 0 8px;opacity:.95}\n' +
      '.fc-transfer-foot{display:flex;justify-content:space-between;font-size:11px;padding-top:6px;border-top:1px solid rgba(255,255,255,.32)}\n' +
      '.fc-call{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:13px;background:#fff;color:#25303b;min-width:162px;box-shadow:0 1px 4px rgba(0,0,0,.08)}\n' +
      '.fc-call-ic{font-size:18px}\n' +
      '.fc-call-t{font-size:13px;font-weight:600}\n' +
      '.fc-call-m{font-size:11px;color:#687785;margin-top:2px}\n' +
      '.fc-export-foot{background:#fffefa;padding:10px 14px;border-top:1px solid #e7e1d6;font-size:11px;color:#82877c;text-align:center}\n' +
      '</style>\n</head>\n<body>\n' +
      '<main class="fc-export-shell">\n' +
      '  <header class="fc-export-head">\n' +
      '    <div><h1>' + escHtml(title) + '</h1><div class="fc-export-sub">同好社区 · 捡手机文学 · ' + escHtml(userName) + ' × ' + escHtml(charName) + ' · 共 ' + items.length + ' 条</div></div>\n' +
      '    <button type="button" class="fc-voice-all-btn" id="toggle-voices-btn">收起语音文字</button>\n' +
      '  </header>\n' +
      '  <section class="fc-stream">' + rowsHtml.join('\n') + '</section>\n' +
      '  <footer class="fc-export-foot">导出自同好社区「捡手机文学」' + (completedText ? (' · ' + escHtml(completedText)) : '') + '</footer>\n' +
      '</main>\n' +
      '<script>\n' +
      '(function(){var b=document.getElementById("toggle-voices-btn");if(!b)return;var open=true;b.onclick=function(){open=!open;document.querySelectorAll(".fc-voice").forEach(function(v){v.classList.toggle("is-expanded",open);});b.textContent=open?"收起语音文字":"展开语音文字";};})();\n' +
      '</script>\n</body>\n</html>';
  }

  function triggerBlobDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() {
      try { URL.revokeObjectURL(url); } catch (_) {}
    }, 1500);
  }

  async function exportWorkAsHtml(workData) {
    var assetsRes = await resolveWorkAssets(workData);
    var html = buildExportHtml(workData, assetsRes.srcMap);
    var filename = sanitizeFilename(workData && workData.title, '捡手机文学') + '.html';
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    triggerBlobDownload(blob, filename);
    return { ok: true, filename: filename, html: html };
  }

  // ===== 3. PNG 聊天长图导出（自动分段，不截断气泡） =====

  function planPngSegments(rows, options) {
    var opts = options || {};
    var maxSegHeight = Math.max(800, Number(opts.maxSegmentHeight) || 3000);
    var firstHeaderH = Number(opts.firstHeaderHeight) || 74;
    var contHeaderH = Number(opts.contHeaderHeight) || 44;
    var footerH = Number(opts.footerHeight) || 34;
    var padTop = Number(opts.paddingTop) || 14;
    var padBottom = Number(opts.paddingBottom) || 18;
    var gap = Number(opts.gap) || 12;

    var list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      return [{
        segmentIndex: 0,
        headerHeight: firstHeaderH,
        footerHeight: footerH,
        contentHeight: 100,
        totalHeight: firstHeaderH + padTop + 100 + padBottom + footerH,
        rows: []
      }];
    }

    var segments = [];
    var curRows = [];
    var curContentH = 0;

    function curHeaderH() {
      return segments.length === 0 ? firstHeaderH : contHeaderH;
    }

    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      var rowH = Math.max(20, Number(row && row.height) || 40);
      var addedH = curRows.length === 0 ? rowH : (gap + rowH);
      var projectedTotal = curHeaderH() + padTop + curContentH + addedH + padBottom + footerH;

      if (curRows.length > 0 && projectedTotal > maxSegHeight) {
        var hdr = curHeaderH();
        segments.push({
          segmentIndex: segments.length,
          headerHeight: hdr,
          footerHeight: footerH,
          contentHeight: curContentH,
          totalHeight: hdr + padTop + curContentH + padBottom + footerH,
          rows: curRows
        });
        curRows = [row];
        curContentH = rowH;
      } else {
        curRows.push(row);
        curContentH += addedH;
      }
    }

    if (curRows.length > 0) {
      var lastHdr = curHeaderH();
      segments.push({
        segmentIndex: segments.length,
        headerHeight: lastHdr,
        footerHeight: footerH,
        contentHeight: curContentH,
        totalHeight: lastHdr + padTop + curContentH + padBottom + footerH,
        rows: curRows
      });
    }

    return segments;
  }

  function loadImageSafe(src) {
    return new Promise(function(resolve) {
      if (!src) { resolve(null); return; }
      var img = new Image();
      img.onload = function() { resolve(img); };
      img.onerror = function() { resolve(null); };
      img.src = src;
    });
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    var paragraphs = String(text || '').split(/\r?\n/);
    var lines = [];
    for (var p = 0; p < paragraphs.length; p++) {
      var para = paragraphs[p];
      if (!para) {
        lines.push('');
        continue;
      }
      var cur = '';
      for (var i = 0; i < para.length; i++) {
        var ch = para[i];
        var next = cur + ch;
        if (cur && ctx.measureText(next).width > maxWidth) {
          lines.push(cur);
          cur = ch;
        } else {
          cur = next;
        }
      }
      if (cur) lines.push(cur);
    }
    return lines.length ? lines : [''];
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawAvatar(ctx, img, x, y, size) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (img && img.width && img.height) {
      var scale = Math.max(size / img.width, size / img.height);
      var dw = img.width * scale;
      var dh = img.height * scale;
      ctx.drawImage(img, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#64a9a8';
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = '#d9eeee';
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size * 0.37, size * 0.19, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size * 0.94, size * 0.34, Math.PI, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  async function renderWorkToPngSegments(workData, options) {
    var opts = options || {};
    var width = Number(opts.width) || 420;
    var scale = Number(opts.scale) || 2;
    var maxSegmentHeight = Number(opts.maxSegmentHeight) || 3000;
    var padX = 14;
    var padTop = 14;
    var padBottom = 18;
    var gap = 12;
    var avatarSize = 36;
    var avatarGap = 8;
    var maxBubbleW = 248;

    var ap = getEffectiveAppearance(workData);
    var userTokens = computeBubbleTokens(ap.userBubbleColor);
    var charTokens = computeBubbleTokens(ap.charBubbleColor);
    var darkBg = isDarkHex(ap.bgColor);
    var userName = String((workData && workData.user) || '我');
    var charName = String((workData && workData.char) || '对方');
    var title = String((workData && workData.title) || '未命名作品');
    var showBubbleTime = Boolean(workData && workData.timeSettings && workData.timeSettings.showBubbleTime);
    var items = Array.isArray(workData && workData.items) ? workData.items : [];

    var assetsRes = await resolveWorkAssets(workData);
    var srcMap = assetsRes.srcMap;
    var imgMap = Object.create(null);
    await Promise.all(Object.keys(srcMap).map(async function(assetId) {
      imgMap[assetId] = await loadImageSafe(srcMap[assetId]);
    }));

    var bgImg = (ap.bgType === 'image' && ap.bgImageAssetId) ? imgMap[ap.bgImageAssetId] : null;
    var userAvatarImg = workData.userAvatarAssetId ? imgMap[workData.userAvatarAssetId] : null;
    var charAvatarImg = workData.charAvatarAssetId ? imgMap[workData.charAvatarAssetId] : null;

    var measureCanvas = document.createElement('canvas');
    measureCanvas.width = width;
    measureCanvas.height = 100;
    var mctx = measureCanvas.getContext('2d');
    var fontBody = '14px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    var fontSub = '12px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    var fontSmall = '11px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    var fontBold = '700 14px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';

    var measuredRows = [];

    for (var i = 0; i < items.length; i++) {
      var raw = items[i];
      var unwrapped = unwrapItem(raw);
      if (!unwrapped) continue;
      var item = unwrapped.item;
      var isRecalled = unwrapped.isRecalled;

      if (unwrapped.legacyWithdrawOnly) {
        measuredRows.push({
          kind: 'recall_only',
          text: item.side === 'right' ? '你撤回了一条消息' : (charName + '撤回了一条消息'),
          height: 22
        });
        continue;
      }

      if (item.type === 'date') {
        measuredRows.push({
          kind: 'date',
          text: String(item.text || ''),
          height: 26
        });
        continue;
      }

      var side = item.side === 'right' ? 'right' : 'left';
      var roleName = side === 'right' ? userName : charName;
      var sentTime = showBubbleTime ? getSentTimeLabel(item, raw) : '';
      var recallTip = isRecalled ? (side === 'right' ? '你撤回了一条消息' : (charName + '撤回了一条消息')) : '';

      var rowLayout = {
        kind: 'msg',
        side: side,
        roleName: roleName,
        sentTime: sentTime,
        isRecalled: isRecalled,
        recallTip: recallTip,
        msgType: item.type || 'text',
        item: item,
        bubbleW: 120,
        bubbleH: 38,
        lines: [],
        extra: null,
        height: 60
      };

      if (item.type === 'text') {
        mctx.font = fontBody;
        var lines = wrapCanvasText(mctx, item.text || '', maxBubbleW - 24);
        var maxLineW = 0;
        for (var l = 0; l < lines.length; l++) {
          maxLineW = Math.max(maxLineW, mctx.measureText(lines[l]).width);
        }
        rowLayout.lines = lines;
        rowLayout.bubbleW = Math.min(maxBubbleW, Math.max(46, Math.ceil(maxLineW) + 24));
        rowLayout.bubbleH = Math.max(36, lines.length * 21 + 16);
      } else if (item.type === 'text_voice' || item.type === 'voice') {
        var dur = Number(item.duration) || 6;
        var vText = String(item.text || item.content || '').trim() || '（未填写语音文字）';
        mctx.font = fontSub;
        var vLines = wrapCanvasText(mctx, vText, maxBubbleW - 22);
        var barW = Math.min(220, Math.max(120, 98 + dur * 4));
        var vTextMaxW = 0;
        for (var vl = 0; vl < vLines.length; vl++) {
          vTextMaxW = Math.max(vTextMaxW, mctx.measureText(vLines[vl]).width);
        }
        var cardW = Math.min(maxBubbleW, Math.max(barW, Math.ceil(vTextMaxW) + 22));
        var textBoxH = vLines.length * 18 + 14;
        rowLayout.msgType = 'voice';
        rowLayout.bubbleW = cardW;
        rowLayout.bubbleH = 36 + 5 + textBoxH;
        rowLayout.extra = { dur: dur, barW: barW, vLines: vLines, textBoxH: textBoxH };
      } else if (item.type === 'image') {
        if (isTextImageItem(item)) {
          mctx.font = fontSub;
          var imgTextLines = wrapCanvasText(mctx, item.text || item.alt || '图片内容', 194);
          rowLayout.msgType = 'text_image';
          rowLayout.bubbleW = 218;
          rowLayout.bubbleH = 30 + imgTextLines.length * 19 + 18;
          rowLayout.lines = imgTextLines;
        } else {
          var loadedImg = (item.assetId && imgMap[item.assetId]) || null;
          var maxDim = item.isSticker ? 124 : 160;
          var drawW = 112;
          var drawH = 112;
          if (loadedImg && loadedImg.width && loadedImg.height) {
            var ratio = Math.min(maxDim / loadedImg.width, maxDim / loadedImg.height, 1);
            drawW = Math.max(48, Math.round(loadedImg.width * ratio));
            drawH = Math.max(48, Math.round(loadedImg.height * ratio));
          }
          rowLayout.msgType = 'img_asset';
          rowLayout.bubbleW = drawW;
          rowLayout.bubbleH = drawH;
          rowLayout.extra = { img: loadedImg, isSticker: Boolean(item.isSticker), alt: item.alt || (item.isSticker ? '表情包' : '图片') };
        }
      } else if (item.type === 'location') {
        mctx.font = fontBold;
        var locNameLines = wrapCanvasText(mctx, item.name || '位置分享', 196).slice(0, 2);
        mctx.font = fontSmall;
        var locAddrLines = item.address ? wrapCanvasText(mctx, item.address, 196).slice(0, 2) : [];
        var infoH = 14 + locNameLines.length * 18 + (locAddrLines.length ? (4 + locAddrLines.length * 15) : 0);
        rowLayout.msgType = 'location';
        rowLayout.bubbleW = 220;
        rowLayout.bubbleH = infoH + 58;
        rowLayout.extra = { nameLines: locNameLines, addrLines: locAddrLines, infoH: infoH };
      } else if (item.type === 'transfer') {
        rowLayout.msgType = 'transfer';
        rowLayout.bubbleW = 210;
        rowLayout.bubbleH = 82;
        rowLayout.extra = {
          amount: String(item.amount || '0'),
          note: String(item.note || '转账'),
          claimed: item.status === 'claimed' || Boolean(item.claimed)
        };
      } else if (item.type === 'call') {
        rowLayout.msgType = 'call';
        rowLayout.bubbleW = 180;
        rowLayout.bubbleH = 54;
        rowLayout.extra = {
          title: item.video ? '视频通话' : '语音通话',
          meta: String(item.status || '已接通') + (item.duration ? (' · ' + item.duration) : ''),
          video: Boolean(item.video)
        };
      } else {
        mctx.font = fontBody;
        var fbLines = wrapCanvasText(mctx, item.text || item.alt || '[消息]', maxBubbleW - 24);
        rowLayout.msgType = 'text';
        rowLayout.lines = fbLines;
        rowLayout.bubbleW = Math.min(maxBubbleW, 180);
        rowLayout.bubbleH = Math.max(36, fbLines.length * 21 + 16);
      }

      var nameH = 17;
      var recallTipH = isRecalled ? 20 : 0;
      rowLayout.height = Math.max(avatarSize, nameH + rowLayout.bubbleH) + recallTipH;
      measuredRows.push(rowLayout);
    }

    var segments = planPngSegments(measuredRows, {
      maxSegmentHeight: maxSegmentHeight,
      firstHeaderHeight: 74,
      contHeaderHeight: 44,
      footerHeight: 34,
      paddingTop: padTop,
      paddingBottom: padBottom,
      gap: gap
    });

    var totalSegs = segments.length;
    var rendered = [];

    for (var s = 0; s < totalSegs; s++) {
      var seg = segments[s];
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(seg.totalHeight * scale);
      var ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // 1. 聊天区背景（含纯色或背景图）
      ctx.fillStyle = ap.bgColor;
      ctx.fillRect(0, seg.headerHeight, width, seg.totalHeight - seg.headerHeight - seg.footerHeight);

      if (bgImg && bgImg.width && bgImg.height) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, seg.headerHeight, width, seg.totalHeight - seg.headerHeight - seg.footerHeight);
        ctx.clip();
        var areaH = seg.totalHeight - seg.headerHeight - seg.footerHeight;
        var imgScale = ap.bgImageFit === 'contain'
          ? Math.min(width / bgImg.width, areaH / bgImg.height)
          : Math.max(width / bgImg.width, areaH / bgImg.height);
        var dw = bgImg.width * imgScale;
        var dh = bgImg.height * imgScale;
        var dx = (width - dw) / 2;
        var dy = seg.headerHeight + (areaH - dh) / 2;
        ctx.drawImage(bgImg, dx, dy, dw, dh);
        ctx.restore();
      }

      // 2. 顶部标题栏
      ctx.fillStyle = '#fffefa';
      ctx.fillRect(0, 0, width, seg.headerHeight);
      ctx.fillStyle = '#e7e1d6';
      ctx.fillRect(0, seg.headerHeight - 1, width, 1);

      if (s === 0) {
        ctx.fillStyle = '#2f322c';
        ctx.font = '700 16px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText(title.slice(0, 22), 16, 30);
        ctx.fillStyle = '#7a7f74';
        ctx.font = fontSmall;
        var subHeader = '同好社区 · 捡手机文学 · ' + userName + ' × ' + charName + ' · 共 ' + items.length + ' 条';
        ctx.fillText(subHeader.slice(0, 42), 16, 52);
        if (totalSegs > 1) {
          ctx.fillStyle = '#6f8069';
          ctx.textAlign = 'right';
          ctx.fillText('第 1 / ' + totalSegs + ' 段', width - 16, 30);
          ctx.textAlign = 'left';
        }
      } else {
        ctx.fillStyle = '#4c5147';
        ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText('《' + title.slice(0, 18) + '》', 16, 27);
        ctx.fillStyle = '#6f8069';
        ctx.font = fontSmall;
        ctx.textAlign = 'right';
        ctx.fillText('续 · 第 ' + (s + 1) + ' / ' + totalSegs + ' 段', width - 16, 27);
        ctx.textAlign = 'left';
      }

      // 3. 绘制本段所有消息行
      var y = seg.headerHeight + padTop;
      for (var r = 0; r < seg.rows.length; r++) {
        var row = seg.rows[r];

        if (row.kind === 'date') {
          ctx.font = fontSmall;
          var tw = ctx.measureText(row.text).width + 20;
          var pillX = (width - tw) / 2;
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          drawRoundedRect(ctx, pillX, y + 2, tw, 20, 10);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(row.text, width / 2, y + 16);
          ctx.textAlign = 'left';
          y += row.height + gap;
          continue;
        }

        if (row.kind === 'recall_only') {
          ctx.font = fontSmall;
          ctx.fillStyle = darkBg ? 'rgba(255,255,255,0.78)' : 'rgba(42,56,70,0.74)';
          ctx.textAlign = 'center';
          ctx.fillText(row.text, width / 2, y + 14);
          ctx.textAlign = 'left';
          y += row.height + gap;
          continue;
        }

        var isRight = row.side === 'right';
        var avX = isRight ? (width - padX - avatarSize) : padX;
        drawAvatar(ctx, isRight ? userAvatarImg : charAvatarImg, avX, y, avatarSize);

        // 角色名
        ctx.font = fontSmall;
        ctx.fillStyle = darkBg ? '#e4ecf3' : '#4a5f70';
        var bodyEdgeX = isRight ? (avX - avatarGap) : (avX + avatarSize + avatarGap);
        if (isRight) {
          ctx.textAlign = 'right';
          ctx.fillText(row.roleName, bodyEdgeX, y + 11);
          ctx.textAlign = 'left';
        } else {
          ctx.fillText(row.roleName, bodyEdgeX, y + 11);
        }

        var bx = isRight ? (bodyEdgeX - row.bubbleW) : bodyEdgeX;
        var by = y + 17;
        var tokens = isRight ? userTokens : charTokens;

        if (row.msgType === 'text') {
          ctx.fillStyle = tokens.bg;
          drawRoundedRect(ctx, bx, by, row.bubbleW, row.bubbleH, 13);
          ctx.fill();
          ctx.fillStyle = tokens.fg;
          ctx.font = fontBody;
          for (var li = 0; li < row.lines.length; li++) {
            ctx.fillText(row.lines[li], bx + 12, by + 22 + li * 21);
          }
        } else if (row.msgType === 'voice') {
          var vEx = row.extra;
          var barX = isRight ? (bx + row.bubbleW - vEx.barW) : bx;
          ctx.fillStyle = tokens.bg;
          drawRoundedRect(ctx, barX, by, vEx.barW, 36, 13);
          ctx.fill();
          ctx.fillStyle = tokens.fg;
          ctx.font = fontSub;
          ctx.fillText('((•  ··· ···', barX + 12, by + 22);
          ctx.textAlign = 'right';
          ctx.fillText(vEx.dur + '″', barX + vEx.barW - 12, by + 22);
          ctx.textAlign = 'left';

          // 展开的语音文字框
          var tbY = by + 41;
          ctx.fillStyle = 'rgba(255,255,255,0.94)';
          drawRoundedRect(ctx, bx, tbY, row.bubbleW, vEx.textBoxH, 10);
          ctx.fill();
          ctx.fillStyle = '#2c333a';
          ctx.font = fontSub;
          for (var vli = 0; vli < vEx.vLines.length; vli++) {
            ctx.fillText(vEx.vLines[vli], bx + 11, tbY + 19 + vli * 18);
          }
        } else if (row.msgType === 'text_image') {
          ctx.fillStyle = '#ffffff';
          drawRoundedRect(ctx, bx, by, row.bubbleW, row.bubbleH, 12);
          ctx.fill();
          ctx.save();
          drawRoundedRect(ctx, bx, by, row.bubbleW, row.bubbleH, 12);
          ctx.clip();
          ctx.fillStyle = '#f3f7fa';
          ctx.fillRect(bx, by, row.bubbleW, 28);
          ctx.fillStyle = '#e5ecf2';
          ctx.fillRect(bx, by + 28, row.bubbleW, 1);
          ctx.fillStyle = '#4e6274';
          ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
          ctx.fillText('🖼  图片', bx + 10, by + 18);
          ctx.fillStyle = '#273038';
          ctx.font = fontSub;
          for (var ti = 0; ti < row.lines.length; ti++) {
            ctx.fillText(row.lines[ti], bx + 12, by + 48 + ti * 19);
          }
          ctx.restore();
        } else if (row.msgType === 'img_asset') {
          var iEx = row.extra;
          if (iEx.img) {
            ctx.save();
            drawRoundedRect(ctx, bx, by, row.bubbleW, row.bubbleH, iEx.isSticker ? 8 : 12);
            ctx.clip();
            ctx.drawImage(iEx.img, bx, by, row.bubbleW, row.bubbleH);
            ctx.restore();
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.88)';
            drawRoundedRect(ctx, bx, by, row.bubbleW, row.bubbleH, 10);
            ctx.fill();
            ctx.fillStyle = '#687785';
            ctx.font = fontSmall;
            ctx.textAlign = 'center';
            ctx.fillText('[' + iEx.alt + ']', bx + row.bubbleW / 2, by + row.bubbleH / 2 + 4);
            ctx.textAlign = 'left';
          }
        } else if (row.msgType === 'location') {
          var lEx = row.extra;
          ctx.fillStyle = '#ffffff';
          drawRoundedRect(ctx, bx, by, row.bubbleW, row.bubbleH, 12);
          ctx.fill();
          ctx.save();
          drawRoundedRect(ctx, bx, by, row.bubbleW, row.bubbleH, 12);
          ctx.clip();
          ctx.fillStyle = '#222a33';
          ctx.font = fontBold;
          for (var ln = 0; ln < lEx.nameLines.length; ln++) {
            ctx.fillText(lEx.nameLines[ln], bx + 11, by + 21 + ln * 18);
          }
          ctx.fillStyle = '#6b7987';
          ctx.font = fontSmall;
          var addrStart = by + 21 + lEx.nameLines.length * 18;
          for (var la = 0; la < lEx.addrLines.length; la++) {
            ctx.fillText(lEx.addrLines[la], bx + 11, addrStart + la * 15);
          }
          var mapY = by + lEx.infoH;
          ctx.fillStyle = '#dfeee7';
          ctx.fillRect(bx, mapY, row.bubbleW, 58);
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(bx, mapY + 18);
          ctx.lineTo(bx + row.bubbleW, mapY + 38);
          ctx.moveTo(bx + 65, mapY);
          ctx.lineTo(bx + 125, mapY + 58);
          ctx.stroke();
          // 红色定位针
          ctx.fillStyle = '#e65a52';
          ctx.beginPath();
          ctx.arc(bx + row.bubbleW / 2, mapY + 25, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(bx + row.bubbleW / 2, mapY + 25, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (row.msgType === 'transfer') {
          var tEx = row.extra;
          ctx.save();
          if (tEx.claimed) ctx.globalAlpha = 0.78;
          ctx.fillStyle = '#f39a3e';
          drawRoundedRect(ctx, bx, by, row.bubbleW, row.bubbleH, 12);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = '700 15px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
          ctx.fillText('⇄  ' + tEx.amount, bx + 12, by + 26);
          ctx.font = fontSub;
          ctx.fillText(tEx.note.slice(0, 18), bx + 12, by + 46);
          ctx.fillStyle = 'rgba(255,255,255,0.34)';
          ctx.fillRect(bx + 10, by + 56, row.bubbleW - 20, 1);
          ctx.fillStyle = '#ffffff';
          ctx.font = fontSmall;
          ctx.fillText('转账', bx + 12, by + 72);
          ctx.textAlign = 'right';
          ctx.fillText(tEx.claimed ? '已领取' : '未领取', bx + row.bubbleW - 12, by + 72);
          ctx.textAlign = 'left';
          ctx.restore();
        } else if (row.msgType === 'call') {
          var cEx = row.extra;
          ctx.fillStyle = '#ffffff';
          drawRoundedRect(ctx, bx, by, row.bubbleW, row.bubbleH, 12);
          ctx.fill();
          ctx.fillStyle = '#26313c';
          ctx.font = fontBold;
          ctx.fillText((cEx.video ? '▣ ' : '☎ ') + cEx.title, bx + 12, by + 23);
          ctx.fillStyle = '#687785';
          ctx.font = fontSmall;
          ctx.fillText(cEx.meta.slice(0, 20), bx + 12, by + 42);
        }

        // 旁侧：假撤回图标胶囊 + 发送时间
        var metaBottomY = by + row.bubbleH;
        if (row.sentTime) {
          ctx.font = '10px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
          ctx.fillStyle = darkBg ? 'rgba(240,245,250,0.78)' : 'rgba(46,62,76,0.72)';
          if (isRight) {
            ctx.textAlign = 'right';
            ctx.fillText(row.sentTime, bx - 6, metaBottomY - 3);
            ctx.textAlign = 'left';
          } else {
            ctx.fillText(row.sentTime, bx + row.bubbleW + 6, metaBottomY - 3);
          }
          metaBottomY -= 16;
        }
        if (row.isRecalled) {
          var pillW = 42;
          var pillH = 20;
          var px = isRight ? (bx - pillW - 6) : (bx + row.bubbleW + 6);
          var py = Math.max(by, metaBottomY - pillH);
          ctx.fillStyle = 'rgba(255,255,255,0.94)';
          drawRoundedRect(ctx, px, py, pillW, pillH, 10);
          ctx.fill();
          ctx.font = '700 11px -apple-system, sans-serif';
          ctx.fillStyle = '#2f3740';
          ctx.fillText('↻', px + 8, py + 14);
          ctx.fillStyle = '#e05656';
          ctx.fillText('✕', px + 24, py + 14);
        }

        if (row.recallTip) {
          ctx.font = fontSmall;
          ctx.fillStyle = darkBg ? 'rgba(255,255,255,0.78)' : 'rgba(42,56,70,0.72)';
          ctx.textAlign = 'center';
          ctx.fillText(row.recallTip, width / 2, y + row.height - 4);
          ctx.textAlign = 'left';
        }

        y += row.height + gap;
      }

      // 4. 底部页脚
      var footY = seg.totalHeight - seg.footerHeight;
      ctx.fillStyle = '#fffefa';
      ctx.fillRect(0, footY, width, seg.footerHeight);
      ctx.fillStyle = '#e7e1d6';
      ctx.fillRect(0, footY, width, 1);
      ctx.fillStyle = '#858a7f';
      ctx.font = fontSmall;
      ctx.textAlign = 'center';
      var footText = totalSegs > 1
        ? ('同好社区 · 捡手机文学 · 第 ' + (s + 1) + ' / ' + totalSegs + ' 段')
        : '同好社区 · 捡手机文学';
      ctx.fillText(footText, width / 2, footY + 21);
      ctx.textAlign = 'left';

      var blob = await new Promise(function(resolve) {
        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob(function(b) { resolve(b); }, 'image/png');
        } else {
          resolve(null);
        }
      });
      var dataUrl = '';
      try { dataUrl = canvas.toDataURL('image/png'); } catch (_) {}

      var baseName = sanitizeFilename(title, '捡手机文学');
      var fileName = totalSegs > 1
        ? (baseName + '_第' + (s + 1) + '段.png')
        : (baseName + '.png');

      rendered.push({
        index: s,
        total: totalSegs,
        width: canvas.width,
        height: canvas.height,
        filename: fileName,
        blob: blob,
        dataUrl: dataUrl
      });
    }

    return {
      ok: true,
      segments: rendered
    };
  }

  function downloadRenderedSegment(seg) {
    if (!seg) return;
    if (seg.blob) {
      triggerBlobDownload(seg.blob, seg.filename);
      return;
    }
    if (seg.dataUrl) {
      var a = document.createElement('a');
      a.href = seg.dataUrl;
      a.download = seg.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  // ===== 4. 通用弹窗 UI：微信 Char 联系人转发选择器 & 导出弹窗 =====

  function mountModalOverlay(hostEl) {
    var parent = hostEl || document.getElementById('app') || document.body;
    var back = el('div', 'fc-ext-sheet-back show');
    var box = el('section', 'fc-ext-sheet');
    back.appendChild(box);
    parent.appendChild(back);

    function close() {
      if (back.parentNode) back.parentNode.removeChild(back);
    }
    back.addEventListener('click', function(e) {
      if (e.target === back) close();
    });
    return { back: back, box: box, close: close };
  }

  async function openForwardToWechatSheet(workData, hostEl, notifyFn) {
    var notify = typeof notifyFn === 'function' ? notifyFn : function(msg) {
      if (typeof global.toast === 'function') global.toast(msg);
    };
    if (!workData) {
      notify('未找到可转发的作品内容');
      return;
    }

    var modal = mountModalOverlay(hostEl);
    var box = modal.box;
    box.id = 'fc-forward-wechat-sheet';

    var head = el('div', 'fc-ext-sheet-head');
    head.appendChild(el('h3', '', '转发给微信联系人'));
    var closeBtn = el('button', 'fc-ext-sheet-close', '×');
    closeBtn.type = 'button';
    closeBtn.onclick = modal.close;
    head.appendChild(closeBtn);
    box.appendChild(head);

    var workPreview = el('div', 'fc-forward-work-pill');
    workPreview.appendChild(el('strong', '', '《' + (workData.title || '未命名作品') + '》'));
    workPreview.appendChild(el('span', '', (workData.user || '我') + ' × ' + (workData.char || '对方') + ' · 共 ' + (Array.isArray(workData.items) ? workData.items.length : 0) + ' 条'));
    box.appendChild(workPreview);

    box.appendChild(el('p', 'fc-ext-sheet-note', '支持单选或多选弯弯机微信 Char。转发后将在微信显示作品分享卡片，Char 可阅读并与你讨论剧情，且与微信主线记忆保持独立。'));

    var searchRow = el('div', 'fc-forward-search-row');
    var searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'fc-ext-search-input';
    searchInput.id = 'fc-forward-search-input';
    searchInput.placeholder = '搜索微信联系人…';
    var selectAllBtn = el('button', 'fc-ext-mini-btn', '全选');
    selectAllBtn.type = 'button';
    selectAllBtn.id = 'fc-forward-select-all';
    searchRow.appendChild(searchInput);
    searchRow.appendChild(selectAllBtn);
    box.appendChild(searchRow);

    var listWrap = el('div', 'fc-forward-contact-list');
    listWrap.id = 'fc-forward-contact-list';
    listWrap.appendChild(el('div', 'fc-forward-empty', '正在读取微信联系人…'));
    box.appendChild(listWrap);

    var actions = el('div', 'fc-ext-sheet-actions');
    var cancelBtn = el('button', 'fc-ext-btn alt', '取消');
    cancelBtn.type = 'button';
    cancelBtn.onclick = modal.close;

    var confirmBtn = el('button', 'fc-ext-btn', '确认转发');
    confirmBtn.type = 'button';
    confirmBtn.id = 'fc-forward-confirm-btn';
    confirmBtn.disabled = true;
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    box.appendChild(actions);

    var contacts = await listWechatCharContacts();
    var selectedMap = Object.create(null);

    function selectedIds() {
      return Object.keys(selectedMap).filter(function(k) { return selectedMap[k]; }).map(function(k) { return Number(k); });
    }

    function syncConfirmState() {
      var ids = selectedIds();
      confirmBtn.disabled = ids.length === 0;
      confirmBtn.textContent = ids.length > 0 ? ('转发给 ' + ids.length + ' 位联系人') : '请选择联系人';
      var visible = getFilteredContacts();
      var allSelected = visible.length > 0 && visible.every(function(c) { return Boolean(selectedMap[c.id]); });
      selectAllBtn.textContent = allSelected ? '取消全选' : '全选';
    }

    function getFilteredContacts() {
      var q = String(searchInput.value || '').trim().toLowerCase();
      if (!q) return contacts;
      return contacts.filter(function(c) {
        return String(c.name || '').toLowerCase().indexOf(q) >= 0 || String(c.subName || '').toLowerCase().indexOf(q) >= 0;
      });
    }

    function renderList() {
      listWrap.replaceChildren();
      var filtered = getFilteredContacts();
      if (!filtered.length) {
        listWrap.appendChild(el('div', 'fc-forward-empty', contacts.length ? '未找到匹配的微信联系人' : '暂无可转发的微信 Char，请先在角色档案创建角色'));
        syncConfirmState();
        return;
      }

      filtered.forEach(function(c) {
        var row = el('button', 'fc-forward-contact-row' + (selectedMap[c.id] ? ' is-selected' : ''));
        row.type = 'button';
        row.dataset.charId = String(c.id);

        var av = el('span', 'fc-forward-avatar');
        if (c.avatar) {
          var img = document.createElement('img');
          img.src = c.avatar;
          img.alt = c.name;
          av.appendChild(img);
        } else {
          av.textContent = String(c.name || 'C').slice(0, 1);
        }

        var info = el('span', 'fc-forward-info');
        info.appendChild(el('strong', 'fc-forward-name', c.name));
        if (c.subName) {
          info.appendChild(el('small', 'fc-forward-sub', c.subName));
        }

        var check = el('span', 'fc-forward-check', selectedMap[c.id] ? '✓' : '');

        row.appendChild(av);
        row.appendChild(info);
        row.appendChild(check);

        row.onclick = function() {
          selectedMap[c.id] = !selectedMap[c.id];
          row.classList.toggle('is-selected', Boolean(selectedMap[c.id]));
          check.textContent = selectedMap[c.id] ? '✓' : '';
          syncConfirmState();
        };

        listWrap.appendChild(row);
      });
      syncConfirmState();
    }

    searchInput.addEventListener('input', renderList);
    selectAllBtn.onclick = function() {
      var visible = getFilteredContacts();
      if (!visible.length) return;
      var allSelected = visible.every(function(c) { return Boolean(selectedMap[c.id]); });
      visible.forEach(function(c) {
        selectedMap[c.id] = !allSelected;
      });
      renderList();
    };

    confirmBtn.onclick = async function() {
      var ids = selectedIds();
      if (!ids.length) return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = '转发中…';
      var res = await forwardWorkToWechatChars(workData, ids);
      if (!res.ok) {
        notify(res.error || '转发失败');
        syncConfirmState();
        return;
      }
      modal.close();
      notify('已转发给 ' + res.count + ' 位微信联系人');
    };

    renderList();
  }

  function openExportWorkSheet(workData, hostEl, notifyFn) {
    var notify = typeof notifyFn === 'function' ? notifyFn : function(msg) {
      if (typeof global.toast === 'function') global.toast(msg);
    };
    if (!workData) {
      notify('未找到可导出的作品');
      return;
    }

    var modal = mountModalOverlay(hostEl);
    var box = modal.box;
    box.id = 'fc-export-work-sheet';

    var head = el('div', 'fc-ext-sheet-head');
    head.appendChild(el('h3', '', '导出作品'));
    var closeBtn = el('button', 'fc-ext-sheet-close', '×');
    closeBtn.type = 'button';
    closeBtn.onclick = modal.close;
    head.appendChild(closeBtn);
    box.appendChild(head);

    var workPreview = el('div', 'fc-forward-work-pill');
    workPreview.appendChild(el('strong', '', '《' + (workData.title || '未命名作品') + '》'));
    workPreview.appendChild(el('span', '', '保留聊天背景、头像、气泡、表情包、文字语音条、时间与顺序'));
    box.appendChild(workPreview);

    var optList = el('div', 'fc-export-opt-list');

    var htmlBtn = el('button', 'fc-export-opt-card');
    htmlBtn.type = 'button';
    htmlBtn.id = 'fc-export-html-action';
    htmlBtn.innerHTML =
      '<div class="fc-export-opt-main">' +
        '<strong>导出 HTML 阅读文件</strong>' +
        '<span>独立网页文件，离线可打开，支持点击语音条展开/收起文字</span>' +
      '</div>' +
      '<span class="fc-export-opt-tag">HTML</span>';

    var pngBtn = el('button', 'fc-export-opt-card');
    pngBtn.type = 'button';
    pngBtn.id = 'fc-export-png-action';
    pngBtn.innerHTML =
      '<div class="fc-export-opt-main">' +
        '<strong>导出 PNG 聊天长图</strong>' +
        '<span>高清长图渲染，作品过长时自动按消息边界分段保存</span>' +
      '</div>' +
      '<span class="fc-export-opt-tag">PNG</span>';

    optList.appendChild(htmlBtn);
    optList.appendChild(pngBtn);
    box.appendChild(optList);

    var segResultBox = el('div', 'fc-export-segments-box');
    segResultBox.id = 'fc-export-segments-box';
    segResultBox.hidden = true;
    box.appendChild(segResultBox);

    htmlBtn.onclick = async function() {
      htmlBtn.disabled = true;
      try {
        var res = await exportWorkAsHtml(workData);
        notify('已导出 HTML 阅读文件：' + res.filename);
      } catch (err) {
        notify(err && err.message ? err.message : '导出 HTML 失败');
      } finally {
        htmlBtn.disabled = false;
      }
    };

    pngBtn.onclick = async function() {
      pngBtn.disabled = true;
      segResultBox.hidden = false;
      segResultBox.replaceChildren(el('p', 'fc-ext-sheet-note', '正在渲染高清聊天长图，请稍候…'));
      try {
        var res = await renderWorkToPngSegments(workData);
        var segs = res.segments || [];
        segResultBox.replaceChildren();

        if (!segs.length) {
          segResultBox.appendChild(el('p', 'fc-ext-sheet-note', '未能生成图片，请重试。'));
          return;
        }

        if (segs.length === 1) {
          downloadRenderedSegment(segs[0]);
          segResultBox.appendChild(el('p', 'fc-ext-sheet-note', '已生成 1 张高清 PNG 聊天长图（' + segs[0].width + '×' + segs[0].height + 'px），已开始保存。'));
          var redownBtn = el('button', 'fc-ext-mini-btn primary', '再次保存 ' + segs[0].filename);
          redownBtn.type = 'button';
          redownBtn.onclick = function() { downloadRenderedSegment(segs[0]); };
          segResultBox.appendChild(redownBtn);
          notify('已导出 PNG 聊天长图');
          return;
        }

        segResultBox.appendChild(el('p', 'fc-ext-sheet-note', '作品较长，已自动切分为 ' + segs.length + ' 段（按消息完整边界切分，不会截断气泡）。'));

        var saveAllBtn = el('button', 'fc-ext-btn', '依次保存全部 ' + segs.length + ' 段 PNG');
        saveAllBtn.type = 'button';
        saveAllBtn.id = 'fc-export-png-save-all';
        saveAllBtn.onclick = function() {
          segs.forEach(function(seg, idx) {
            setTimeout(function() {
              downloadRenderedSegment(seg);
            }, idx * 320);
          });
          notify('已开始依次保存 ' + segs.length + ' 段长图');
        };
        segResultBox.appendChild(saveAllBtn);

        var segList = el('div', 'fc-export-seg-list');
        segs.forEach(function(seg) {
          var row = el('div', 'fc-export-seg-row');
          row.appendChild(el('span', '', '第 ' + (seg.index + 1) + ' 段（' + seg.width + '×' + seg.height + '）'));
          var dlBtn = el('button', 'fc-ext-mini-btn', '保存');
          dlBtn.type = 'button';
          dlBtn.onclick = function() {
            downloadRenderedSegment(seg);
            notify('已保存第 ' + (seg.index + 1) + ' 段');
          };
          row.appendChild(dlBtn);
          segList.appendChild(row);
        });
        segResultBox.appendChild(segList);
        notify('长图已切分为 ' + segs.length + ' 段，可一键或逐段保存');
      } catch (err) {
        segResultBox.replaceChildren(el('p', 'fc-ext-sheet-note', '生成长图失败：' + (err && err.message ? err.message : '请重试')));
        notify('生成 PNG 长图失败');
      } finally {
        pngBtn.disabled = false;
      }
    };

    var actions = el('div', 'fc-ext-sheet-actions');
    var doneBtn = el('button', 'fc-ext-btn alt', '关闭');
    doneBtn.type = 'button';
    doneBtn.onclick = modal.close;
    actions.appendChild(doneBtn);
    box.appendChild(actions);
  }

  global.FanCommunityExport = {
    FC_WORK_PREFIX: FC_WORK_PREFIX,
    resolveWorkAssets: resolveWorkAssets,
    buildWorkTranscriptItems: buildWorkTranscriptItems,
    buildFcWorkSharePayload: buildFcWorkSharePayload,
    encodeFcWorkMessage: encodeFcWorkMessage,
    listWechatCharContacts: listWechatCharContacts,
    forwardWorkToWechatChars: forwardWorkToWechatChars,
    buildExportHtml: buildExportHtml,
    exportWorkAsHtml: exportWorkAsHtml,
    planPngSegments: planPngSegments,
    renderWorkToPngSegments: renderWorkToPngSegments,
    downloadRenderedSegment: downloadRenderedSegment,
    openForwardToWechatSheet: openForwardToWechatSheet,
    openExportWorkSheet: openExportWorkSheet
  };
})(window);
