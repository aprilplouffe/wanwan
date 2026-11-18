// js/fan-community-assets.js — 同好社区专用本地素材存储模块（IndexedDB: wanwan-message-assets-v1）
// 用于持久化保存捡手机文学图片与表情包素材，避免占用 localStorage 空间。

(function(global) {
  'use strict';

  var DB_NAME = 'wanwan-message-assets-v1';
  var STORE_NAME = 'assets';
  var _memCache = Object.create(null);

  function uid(prefix) {
    return (prefix || 'a') + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function formatDbError(err, fallbackMsg) {
    if (err && err.name === 'QuotaExceededError') {
      return new Error('本地存储空间已满，无法保存更多素材');
    }
    if (err instanceof Error && err.message) {
      return err;
    }
    if (err && err.message) {
      return new Error(String(err.message));
    }
    return new Error(fallbackMsg || '本地素材操作失败');
  }

  function openDb() {
    return new Promise(function(resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('当前浏览器不支持 IndexedDB'));
        return;
      }
      var settled = false;
      var req;
      try {
        req = global.indexedDB.open(DB_NAME, 1);
      } catch (err) {
        reject(formatDbError(err, 'IndexedDB 打开失败'));
        return;
      }
      req.onupgradeneeded = function() {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = function() {
        if (settled) return;
        settled = true;
        resolve(req.result);
      };
      req.onerror = function() {
        if (settled) return;
        settled = true;
        reject(formatDbError(req.error, 'IndexedDB 打开失败'));
      };
      req.onblocked = function() {
        if (settled) return;
        settled = true;
        reject(new Error('IndexedDB 被其他标签页占用，请关闭多余标签页后重试'));
      };
    });
  }

  async function putAsset(record) {
    var item = Object.assign({ id: uid('asset_'), createdAt: Date.now() }, record);
    var db = await openDb();
    return new Promise(function(resolve, reject) {
      var settled = false;
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(item);
      tx.oncomplete = function() {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (_) {}
        if (item.id && item.src) {
          _memCache[item.id] = item.src;
        }
        resolve(item);
      };
      tx.onerror = function() {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (_) {}
        reject(formatDbError(tx.error, '素材保存失败'));
      };
      tx.onabort = function() {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (_) {}
        reject(formatDbError(tx.error, '素材保存被中断'));
      };
    });
  }

  async function getAsset(id) {
    if (!id) return null;
    var db = await openDb();
    return new Promise(function(resolve, reject) {
      var settled = false;
      var tx = db.transaction(STORE_NAME, 'readonly');
      var req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = function() {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (_) {}
        var res = req.result || null;
        if (res && res.id && res.src) {
          _memCache[res.id] = res.src;
        }
        resolve(res);
      };
      req.onerror = function() {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (_) {}
        reject(formatDbError(req.error || tx.error, '素材读取失败'));
      };
      tx.onabort = function() {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (_) {}
        reject(formatDbError(tx.error, '素材读取被中断'));
      };
    });
  }

  async function listAssets(kind) {
    var db = await openDb();
    return new Promise(function(resolve, reject) {
      var settled = false;
      var tx = db.transaction(STORE_NAME, 'readonly');
      var req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = function() {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (_) {}
        var all = Array.isArray(req.result) ? req.result : [];
        all.forEach(function(item) {
          if (item && item.id && item.src) {
            _memCache[item.id] = item.src;
          }
        });
        if (kind) {
          all = all.filter(function(item) { return item && item.kind === kind; });
        }
        all.sort(function(a, b) {
          return (a.createdAt || 0) - (b.createdAt || 0);
        });
        resolve(all);
      };
      req.onerror = function() {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (_) {}
        reject(formatDbError(req.error || tx.error, '素材列表读取失败'));
      };
      tx.onabort = function() {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (_) {}
        reject(formatDbError(tx.error, '素材列表读取被中断'));
      };
    });
  }

  async function deleteAsset(id) {
    if (!id) return;
    var db = await openDb();
    return new Promise(function(resolve, reject) {
      var settled = false;
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = function() {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (_) {}
        delete _memCache[id];
        resolve();
      };
      tx.onerror = function() {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (_) {}
        reject(formatDbError(tx.error, '素材删除失败'));
      };
      tx.onabort = function() {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (_) {}
        reject(formatDbError(tx.error, '素材删除被中断'));
      };
    });
  }

  function isAssetReferenced(assetId, items) {
    if (!assetId || !Array.isArray(items)) return false;
    for (var i = 0; i < items.length; i++) {
      var m = items[i];
      if (!m) continue;
      if (m.assetId === assetId) return true;
      if (m.original && m.original.assetId === assetId) return true;
    }
    return false;
  }

  // 删除表情包库项时保护仍被聊天记录引用的素材：若被引用则降级为普通图片素材保留，不被物理删除
  async function removeStickerSafely(id, chatItems) {
    if (!id) return;
    if (isAssetReferenced(id, chatItems)) {
      var existing = await getAsset(id);
      if (existing) {
        await putAsset(Object.assign({}, existing, { kind: 'image' }));
      }
      return;
    }
    await deleteAsset(id);
  }

  function getCachedSrc(id) {
    return (id && _memCache[id]) || '';
  }

  var EXT_MIME_MAP = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    avif: 'image/avif',
    svg: 'image/svg+xml'
  };

  function inferImageMime(file) {
    var rawType = (file && file.type ? String(file.type) : '').trim().toLowerCase();
    if (rawType.indexOf('image/') === 0) {
      return rawType;
    }
    var name = (file && file.name ? String(file.name) : '').trim().toLowerCase();
    var m = name.match(/\.([a-z0-9]+)$/);
    if (m && EXT_MIME_MAP[m[1]]) {
      return EXT_MIME_MAP[m[1]];
    }
    return '';
  }

  function normalizeImageDataUrl(rawUrl, fallbackMime) {
    var s = String(rawUrl || '');
    if (!s) return '';
    if (s.indexOf('data:image/') === 0) return s;
    if (fallbackMime && /^data:(application\/octet-stream|text\/plain)?;base64,/i.test(s)) {
      return s.replace(/^data:(?:application\/octet-stream|text\/plain)?;base64,/i, 'data:' + fallbackMime + ';base64,');
    }
    return s;
  }

  function verifyImageDecodable(dataUrl) {
    return new Promise(function(resolve, reject) {
      if (typeof global.Image !== 'function') {
        resolve(dataUrl);
        return;
      }
      var probe = new global.Image();
      probe.onload = function() {
        resolve(dataUrl);
      };
      probe.onerror = function() {
        reject(new Error('图片已损坏或浏览器暂不支持该格式'));
      };
      probe.src = dataUrl;
    });
  }

  function readImageFile(file, maxMb) {
    var limitMb = maxMb || 8;
    return new Promise(function(resolve, reject) {
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }
      var rawType = (file.type ? String(file.type) : '').trim().toLowerCase();
      var inferredMime = inferImageMime(file);
      var isGenericMime = !rawType || rawType === 'application/octet-stream';
      if (!inferredMime || (rawType && rawType.indexOf('image/') !== 0 && !isGenericMime)) {
        reject(new Error('请选择图片文件（支持 PNG / JPG / WebP / GIF）'));
        return;
      }
      if (!file.size) {
        reject(new Error('选择的图片文件为空'));
        return;
      }
      if (file.size > limitMb * 1024 * 1024) {
        reject(new Error('图片文件请小于 ' + limitMb + 'MB'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function() {
        var normalized = normalizeImageDataUrl(reader.result, inferredMime);
        if (!normalized || normalized.indexOf('data:image/') !== 0) {
          reject(new Error('无法识别该图片文件内容'));
          return;
        }
        verifyImageDecodable(normalized).then(resolve, reject);
      };
      reader.onerror = function() {
        reject(new Error('图片读取失败'));
      };
      reader.readAsDataURL(file);
    });
  }

  function readAudioFile(file, maxMb) {
    var limitMb = maxMb || 12;
    return new Promise(function(resolve, reject) {
      if (!file) {
        reject(new Error('未选择音频文件'));
        return;
      }
      var hasAudioMime = file.type && file.type.indexOf('audio/') === 0;
      var hasAudioExt = /\.(mp3|wav|m4a|ogg|aac|flac|webm|opus)$/i.test(file.name || '');
      if (!hasAudioMime && !hasAudioExt) {
        reject(new Error('请选择音频文件（如 mp3 / wav / m4a / ogg）'));
        return;
      }
      if (file.size > limitMb * 1024 * 1024) {
        reject(new Error('音频文件请小于 ' + limitMb + 'MB'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function() {
        resolve(String(reader.result || ''));
      };
      reader.onerror = function() {
        reject(new Error('音频读取失败'));
      };
      reader.readAsDataURL(file);
    });
  }

  global.FanCommunityAssets = {
    DB_NAME: DB_NAME,
    uid: uid,
    putAsset: putAsset,
    getAsset: getAsset,
    listAssets: listAssets,
    deleteAsset: deleteAsset,
    removeStickerSafely: removeStickerSafely,
    isAssetReferenced: isAssetReferenced,
    getCachedSrc: getCachedSrc,
    readImageFile: readImageFile,
    readAudioFile: readAudioFile
  };
})(window);
