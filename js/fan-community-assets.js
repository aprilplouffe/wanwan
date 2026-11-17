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

  function openDb() {
    return new Promise(function(resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('当前浏览器不支持 IndexedDB'));
        return;
      }
      var req = global.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function() {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = function() {
        resolve(req.result);
      };
      req.onerror = function() {
        reject(req.error || new Error('IndexedDB 打开失败'));
      };
    });
  }

  async function putAsset(record) {
    var item = Object.assign({ id: uid('asset_'), createdAt: Date.now() }, record);
    var db = await openDb();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(item);
      tx.oncomplete = function() {
        db.close();
        if (item.id && item.src) {
          _memCache[item.id] = item.src;
        }
        resolve(item);
      };
      tx.onerror = function() {
        db.close();
        reject(tx.error || new Error('素材保存失败'));
      };
    });
  }

  async function getAsset(id) {
    if (!id) return null;
    var db = await openDb();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readonly');
      var req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = function() {
        db.close();
        var res = req.result || null;
        if (res && res.id && res.src) {
          _memCache[res.id] = res.src;
        }
        resolve(res);
      };
      req.onerror = function() {
        db.close();
        reject(req.error || new Error('素材读取失败'));
      };
    });
  }

  async function listAssets(kind) {
    var db = await openDb();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readonly');
      var req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = function() {
        db.close();
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
        db.close();
        reject(req.error || new Error('素材列表读取失败'));
      };
    });
  }

  async function deleteAsset(id) {
    if (!id) return;
    var db = await openDb();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = function() {
        db.close();
        delete _memCache[id];
        resolve();
      };
      tx.onerror = function() {
        db.close();
        reject(tx.error || new Error('素材删除失败'));
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

  function readImageFile(file, maxMb) {
    var limitMb = maxMb || 8;
    return new Promise(function(resolve, reject) {
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }
      if (file.type && file.type.indexOf('image/') !== 0) {
        reject(new Error('请选择图片文件'));
        return;
      }
      if (file.size > limitMb * 1024 * 1024) {
        reject(new Error('图片文件请小于 ' + limitMb + 'MB'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function() {
        resolve(String(reader.result || ''));
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
