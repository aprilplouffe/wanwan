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

  var MAX_DIAGNOSTICS = 30;
  var _diagnostics = [];
  var _cachedWebpEncode = null;

  function checkWebpEncodeSupport() {
    if (_cachedWebpEncode !== null) return _cachedWebpEncode;
    try {
      if (typeof document === 'undefined') {
        _cachedWebpEncode = false;
        return false;
      }
      var c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      if (!c.getContext || !c.getContext('2d')) {
        _cachedWebpEncode = false;
        return false;
      }
      _cachedWebpEncode = c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (_) {
      _cachedWebpEncode = false;
    }
    return _cachedWebpEncode;
  }

  function sanitizeDiagString(str) {
    if (!str) return '';
    return String(str).replace(/data:[^;\s]+;base64,[A-Za-z0-9+/=]+/gi, '[data-url-omitted]');
  }

  function recordDiagnostic(entry) {
    if (!entry || typeof entry !== 'object') return null;
    var clean = {
      id: uid('diag_'),
      timestamp: new Date().toISOString(),
      action: sanitizeDiagString(entry.action || 'import'),
      fileName: sanitizeDiagString(entry.fileName || ''),
      ext: sanitizeDiagString(entry.ext || ''),
      rawFileType: sanitizeDiagString(entry.rawFileType || ''),
      magicMime: sanitizeDiagString(entry.magicMime || ''),
      effectiveMime: sanitizeDiagString(entry.effectiveMime || ''),
      sizeBytes: Number(entry.sizeBytes || 0),
      dimensions: sanitizeDiagString(entry.dimensions || ''),
      decodePath: sanitizeDiagString(entry.decodePath || ''),
      outputMime: sanitizeDiagString(entry.outputMime || ''),
      outputBytes: Number(entry.outputBytes || 0),
      readOk: Boolean(entry.readOk),
      decodeOk: Boolean(entry.decodeOk),
      saveOk: (entry.saveOk === undefined || entry.saveOk === null) ? null : Boolean(entry.saveOk),
      assetId: sanitizeDiagString(entry.assetId || ''),
      failedStage: sanitizeDiagString(entry.failedStage || ''),
      errorName: sanitizeDiagString(entry.errorName || ''),
      errorMessage: sanitizeDiagString(entry.errorMessage || ''),
      notes: sanitizeDiagString(entry.notes || '')
    };
    _diagnostics.push(clean);
    if (_diagnostics.length > MAX_DIAGNOSTICS) {
      _diagnostics.splice(0, _diagnostics.length - MAX_DIAGNOSTICS);
    }
    return clean;
  }

  function getEnvironmentInfo() {
    var nav = global.navigator || {};
    var canvasOk = false;
    try {
      var testCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      canvasOk = Boolean(testCanvas && testCanvas.getContext && testCanvas.getContext('2d'));
    } catch (_) {
      canvasOk = false;
    }
    return {
      userAgent: String(nav.userAgent || ''),
      platform: String(nav.platform || ''),
      indexedDB: Boolean(global.indexedDB),
      fileReader: typeof global.FileReader === 'function',
      objectURL: Boolean(global.URL && typeof global.URL.createObjectURL === 'function'),
      imageBitmap: typeof global.createImageBitmap === 'function',
      canvas2d: canvasOk,
      webpEncode: checkWebpEncodeSupport()
    };
  }

  function getDiagnostics() {
    return {
      env: getEnvironmentInfo(),
      entries: _diagnostics.slice().reverse()
    };
  }

  function clearDiagnostics() {
    _diagnostics = [];
  }

  var EXT_MIME_MAP = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    jpe: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    heic: 'image/heic',
    heif: 'image/heic'
  };

  function getFileExt(name) {
    var s = (name ? String(name) : '').trim().toLowerCase();
    var m = s.match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function normalizeMime(raw) {
    var t = (raw ? String(raw) : '').trim().toLowerCase();
    if (t === 'image/jpg' || t === 'image/pjpeg') return 'image/jpeg';
    if (t === 'image/x-png') return 'image/png';
    if (t === 'image/x-webp') return 'image/webp';
    if (t === 'image/heif' || t === 'image/heic-sequence' || t === 'image/heif-sequence') return 'image/heic';
    return t;
  }

  function readBlobSliceBuffer(blob, start, end) {
    var sliced = blob.slice(start, end);
    if (typeof sliced.arrayBuffer === 'function') {
      return sliced.arrayBuffer();
    }
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() {
        resolve(reader.result || new ArrayBuffer(0));
      };
      reader.onerror = function() {
        reject(reader.error || new Error('文件头读取失败'));
      };
      reader.readAsArrayBuffer(sliced);
    });
  }

  function bytesToAscii(bytes, start, end) {
    var out = '';
    var max = Math.min(bytes.length, end);
    for (var i = start; i < max; i++) {
      var code = bytes[i];
      out += (code >= 32 && code <= 126) ? String.fromCharCode(code) : ' ';
    }
    return out;
  }

  function detectMagicMime(buffer) {
    if (!buffer || !buffer.byteLength) return '';
    var b = new Uint8Array(buffer);
    if (b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
      b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) {
      return 'image/png';
    }
    if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) {
      return 'image/jpeg';
    }
    if (b.length >= 6) {
      var gifHead = bytesToAscii(b, 0, 6);
      if (gifHead === 'GIF87a' || gifHead === 'GIF89a') {
        return 'image/gif';
      }
    }
    if (b.length >= 12 && bytesToAscii(b, 0, 4) === 'RIFF' && bytesToAscii(b, 8, 12) === 'WEBP') {
      return 'image/webp';
    }
    if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4D) {
      return 'image/bmp';
    }
    if (b.length >= 12 && bytesToAscii(b, 4, 8) === 'ftyp') {
      var brandRegion = bytesToAscii(b, 8, Math.min(b.length, 64)).toLowerCase();
      if (/(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1|heif)/.test(brandRegion)) {
        return 'image/heic';
      }
      if (/(avif|avis)/.test(brandRegion)) {
        return 'image/avif';
      }
    }
    var textHead = bytesToAscii(b, 0, Math.min(b.length, 64)).trim().toLowerCase();
    if (textHead.indexOf('<svg') === 0 || (textHead.indexOf('<?xml') === 0 && textHead.indexOf('svg') >= 0)) {
      return 'image/svg+xml';
    }
    return '';
  }

  function readBlobAsDataUrl(blob, fallbackMime) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() {
        var s = String(reader.result || '');
        if (!s) {
          reject(new Error('图片数据读取为空'));
          return;
        }
        if (s.indexOf('data:image/') !== 0 && fallbackMime && /^data:([^;]*);base64,/i.test(s)) {
          s = s.replace(/^data:([^;]*);base64,/i, 'data:' + fallbackMime + ';base64,');
        }
        if (s.indexOf('data:image/') !== 0) {
          reject(new Error('无法识别的图片 DataURL 格式'));
          return;
        }
        resolve(s);
      };
      reader.onerror = function() {
        reject(reader.error || new Error('FileReader 读取图片失败'));
      };
      reader.readAsDataURL(blob);
    });
  }

  function loadImageFromSrc(src, isSvg) {
    return new Promise(function(resolve, reject) {
      if (typeof global.Image !== 'function') {
        reject(new Error('当前环境不支持 Image 解码'));
        return;
      }
      var settled = false;
      var img = new global.Image();
      img.onload = function() {
        if (settled) return;
        settled = true;
        var w = img.naturalWidth || img.width || 0;
        var h = img.naturalHeight || img.height || 0;
        if (!isSvg && (w <= 0 || h <= 0)) {
          reject(new Error('图片尺寸无效（0×0）'));
          return;
        }
        resolve({ img: img, width: w, height: h });
      };
      img.onerror = function() {
        if (settled) return;
        settled = true;
        reject(new Error('Image 解码触发 onerror'));
      };
      img.src = src;
    });
  }

  async function decodeImageBlob(blob, effectiveMime) {
    var isSvg = effectiveMime === 'image/svg+xml';
    var errors = [];

    // 路径 1：优先使用 URL.createObjectURL(blob)，避免移动端 WebKit 对大尺寸 DataURL 的解码内存限制
    if (global.URL && typeof global.URL.createObjectURL === 'function') {
      var objUrl = '';
      try {
        objUrl = global.URL.createObjectURL(blob);
        var loadedObj = await loadImageFromSrc(objUrl, isSvg);
        return {
          source: loadedObj.img,
          width: loadedObj.width,
          height: loadedObj.height,
          path: 'objectUrl',
          cleanup: function() {
            try { global.URL.revokeObjectURL(objUrl); } catch (_) {}
          }
        };
      } catch (err1) {
        if (objUrl) {
          try { global.URL.revokeObjectURL(objUrl); } catch (_) {}
        }
        errors.push('ObjectURL: ' + (err1 && err1.message ? err1.message : '失败'));
      }
    }

    // 路径 2：部分安卓/移动端 WebView 可通过 createImageBitmap 直接硬件解码 Blob
    if (!isSvg && typeof global.createImageBitmap === 'function') {
      try {
        var bitmap = await global.createImageBitmap(blob);
        if (bitmap && bitmap.width > 0 && bitmap.height > 0) {
          return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            path: 'imageBitmap',
            cleanup: function() {
              try { if (typeof bitmap.close === 'function') bitmap.close(); } catch (_) {}
            }
          };
        }
        if (bitmap && typeof bitmap.close === 'function') {
          try { bitmap.close(); } catch (_) {}
        }
        errors.push('ImageBitmap: 尺寸无效');
      } catch (err2) {
        errors.push('ImageBitmap: ' + (err2 && err2.message ? err2.message : '失败'));
      }
    }

    // 路径 3：若运行环境限制 blob: URL（如部分 WebView CSP），回退为 DataURL + Image
    try {
      var rawDataUrl = await readBlobAsDataUrl(blob, effectiveMime);
      var loadedData = await loadImageFromSrc(rawDataUrl, isSvg);
      return {
        source: loadedData.img,
        width: loadedData.width,
        height: loadedData.height,
        path: 'dataUrl',
        preReadDataUrl: rawDataUrl,
        cleanup: function() {}
      };
    } catch (err3) {
      errors.push('DataURL: ' + (err3 && err3.message ? err3.message : '失败'));
    }

    var finalErr = new Error(errors.join('；') || '图片解码失败');
    finalErr.name = 'ImageDecodeError';
    throw finalErr;
  }

  function canvasToBlobPromise(canvas, mime, quality) {
    return new Promise(function(resolve, reject) {
      if (typeof canvas.toBlob === 'function') {
        try {
          canvas.toBlob(function(blob) {
            if (blob && blob.size > 0) {
              resolve(blob);
            } else {
              reject(new Error('canvas.toBlob 返回空数据'));
            }
          }, mime, quality);
          return;
        } catch (err) {
          reject(err);
          return;
        }
      }
      try {
        var url = canvas.toDataURL(mime, quality);
        var parts = url.split(',');
        var byteStr = atob(parts[1] || '');
        var arr = new Uint8Array(byteStr.length);
        for (var i = 0; i < byteStr.length; i++) {
          arr[i] = byteStr.charCodeAt(i);
        }
        var mimeMatch = (parts[0] || '').match(/data:([^;]+);/i);
        resolve(new Blob([arr], { type: (mimeMatch && mimeMatch[1]) || mime }));
      } catch (err2) {
        reject(err2);
      }
    });
  }

  async function renderToCompatibleDataUrl(decoded, sourceBlob, effectiveMime, options) {
    var purpose = (options && options.purpose) || 'image';
    var maxDimension = Number(options && options.maxDimension) || (purpose === 'sticker' ? 960 : 1800);
    var isHeic = effectiveMime === 'image/heic';
    var isGif = effectiveMime === 'image/gif';
    var isSvg = effectiveMime === 'image/svg+xml';

    // 保留 GIF 动画帧与矢量 SVG，不经由 Canvas 栅格化破坏动画
    if (isGif || isSvg) {
      if (decoded.preReadDataUrl) {
        return { dataUrl: decoded.preReadDataUrl, outputMime: effectiveMime, notes: isGif ? '保留 GIF 动画原图' : '保留 SVG 原图' };
      }
      var directDataUrl = await readBlobAsDataUrl(sourceBlob, effectiveMime);
      return { dataUrl: directDataUrl, outputMime: effectiveMime, notes: isGif ? '保留 GIF 动画原图' : '保留 SVG 原图' };
    }

    var w = decoded.width || 0;
    var h = decoded.height || 0;
    var sizeThreshold = purpose === 'sticker' ? (420 * 1024) : (1536 * 1024);
    var needsTranscode = isHeic ||
      effectiveMime === 'image/bmp' ||
      effectiveMime === 'image/avif' ||
      w > maxDimension ||
      h > maxDimension ||
      sourceBlob.size > sizeThreshold;

    if (!needsTranscode) {
      if (decoded.preReadDataUrl) {
        return { dataUrl: decoded.preReadDataUrl, outputMime: effectiveMime, notes: '原图尺寸适中，直接保存' };
      }
      var origUrl = await readBlobAsDataUrl(sourceBlob, effectiveMime);
      return { dataUrl: origUrl, outputMime: effectiveMime, notes: '原图尺寸适中，直接保存' };
    }

    var scale = Math.min(1, maxDimension / Math.max(w || 1, h || 1));
    var targetW = Math.max(1, Math.round((w || 1) * scale));
    var targetH = Math.max(1, Math.round((h || 1) * scale));

    var canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      if (isHeic) {
        throw new Error('当前浏览器不支持 Canvas 转码 HEIC 图片');
      }
      var fallbackUrl = decoded.preReadDataUrl || await readBlobAsDataUrl(sourceBlob, effectiveMime);
      return { dataUrl: fallbackUrl, outputMime: effectiveMime, notes: 'Canvas 不可用，回退原图' };
    }

    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) {
      ctx.imageSmoothingQuality = 'high';
    }
    ctx.drawImage(decoded.source, 0, 0, targetW, targetH);

    var targetMime = 'image/png';
    var quality = 0.92;
    if (effectiveMime === 'image/jpeg' || effectiveMime === 'image/bmp' || isHeic) {
      targetMime = 'image/jpeg';
      quality = 0.9;
    } else if (effectiveMime === 'image/webp' && checkWebpEncodeSupport()) {
      targetMime = 'image/webp';
      quality = 0.9;
    }

    var outBlob = await canvasToBlobPromise(canvas, targetMime, quality);
    if (targetMime === 'image/png' && outBlob.size > 1200 * 1024 && checkWebpEncodeSupport()) {
      try {
        var webpBlob = await canvasToBlobPromise(canvas, 'image/webp', 0.92);
        if (webpBlob.size > 0 && webpBlob.size < outBlob.size) {
          outBlob = webpBlob;
        }
      } catch (_) {}
    }

    var actualMime = normalizeMime(outBlob.type) || targetMime;
    var outDataUrl = await readBlobAsDataUrl(outBlob, actualMime);
    return {
      dataUrl: outDataUrl,
      outputMime: actualMime,
      notes: '已真实重编码为 ' + actualMime + '（' + targetW + '×' + targetH + '）'
    };
  }

  async function readImageFile(file, maxMb, options) {
    var opts = options || {};
    var limitMb = maxMb || 12;
    var actionName = opts.action || (opts.purpose === 'sticker' ? 'stickerImport' : 'imageImport');

    var diag = {
      action: actionName,
      fileName: file && file.name ? String(file.name) : '',
      ext: getFileExt(file && file.name),
      rawFileType: file && file.type ? String(file.type) : '',
      magicMime: '',
      effectiveMime: '',
      sizeBytes: file && typeof file.size === 'number' ? file.size : 0,
      dimensions: '',
      decodePath: '',
      outputMime: '',
      outputBytes: 0,
      readOk: false,
      decodeOk: false,
      saveOk: null,
      failedStage: '',
      errorName: '',
      errorMessage: '',
      notes: ''
    };

    function fail(stage, err) {
      diag.failedStage = stage;
      diag.errorName = (err && (err.code || err.name)) || 'Error';
      diag.errorMessage = (err && err.message) || '图片处理失败';
      var savedDiag = recordDiagnostic(diag);
      if (typeof opts.onDiagnostic === 'function') {
        try { opts.onDiagnostic(savedDiag); } catch (_) {}
      }
      throw err;
    }

    if (!file) {
      fail('validate', new Error('未选择文件'));
    }
    if (!file.size) {
      fail('validate', new Error('选择的图片文件为空（0 字节）'));
    }
    if (file.size > limitMb * 1024 * 1024) {
      fail('validate', new Error('图片文件请小于 ' + limitMb + 'MB'));
    }

    var headerBuf = null;
    try {
      headerBuf = await readBlobSliceBuffer(file, 0, Math.min(file.size, 64));
      diag.readOk = true;
    } catch (readErr) {
      fail('read', new Error('无法读取本地文件内容：' + ((readErr && readErr.message) || '文件不可访问')));
    }

    var magicMime = detectMagicMime(headerBuf);
    var declaredMime = normalizeMime(file.type);
    var extMime = EXT_MIME_MAP[diag.ext] || '';
    diag.magicMime = magicMime;

    var isHeic = (magicMime === 'image/heic') ||
      (!magicMime && (declaredMime === 'image/heic' || extMime === 'image/heic'));

    var effectiveMime = magicMime ||
      (declaredMime && declaredMime.indexOf('image/') === 0 ? declaredMime : '') ||
      extMime;
    diag.effectiveMime = effectiveMime;

    if (!effectiveMime || effectiveMime.indexOf('image/') !== 0) {
      fail('header', new Error('请选择图片文件（支持 PNG / JPG / WebP / GIF）'));
    }

    var typedBlob = (normalizeMime(file.type) === effectiveMime && file.type)
      ? file
      : file.slice(0, file.size, effectiveMime);

    var decoded = null;
    try {
      decoded = await decodeImageBlob(typedBlob, effectiveMime);
      diag.decodeOk = true;
      diag.decodePath = decoded.path || '';
      diag.dimensions = (decoded.width || 0) + '×' + (decoded.height || 0);
    } catch (decErr) {
      if (isHeic) {
        var heicErr = new Error('暂不支持苹果 HEIC 格式，请截图或转为 JPG/PNG 后导入');
        heicErr.code = 'HEIC_UNSUPPORTED';
        diag.notes = '检测到苹果相册 HEIC/HEIF 高效格式且当前浏览器无法直接解码；请在系统相册设为「兼容性最佳」或截图后重试。';
        fail('decode', heicErr);
      }
      var userDecodeErr = new Error('图片无法解析（' + effectiveMime + '），请尝试转为 PNG 或 JPG');
      userDecodeErr.code = (decErr && (decErr.code || decErr.name)) || 'ImageDecodeError';
      diag.notes = (decErr && decErr.message) || '';
      fail('decode', userDecodeErr);
    }

    var result = null;
    try {
      result = await renderToCompatibleDataUrl(decoded, typedBlob, effectiveMime, opts);
      diag.outputMime = result.outputMime || effectiveMime;
      diag.outputBytes = Math.round(((result.dataUrl || '').length * 3) / 4);
      diag.notes = result.notes || '';
    } catch (compErr) {
      fail('compress', compErr instanceof Error ? compErr : new Error('图片格式兼容处理失败'));
    } finally {
      if (decoded && typeof decoded.cleanup === 'function') {
        decoded.cleanup();
      }
    }

    var savedDiag = recordDiagnostic(diag);
    if (typeof opts.onDiagnostic === 'function') {
      try { opts.onDiagnostic(savedDiag); } catch (_) {}
    }
    return result.dataUrl;
  }

  function updateDiagnosticSaveStatus(diagEntry, ok, assetId, err) {
    if (!diagEntry) return;
    diagEntry.saveOk = Boolean(ok);
    if (assetId) diagEntry.assetId = sanitizeDiagString(assetId);
    if (!ok && err) {
      diagEntry.failedStage = 'indexeddb_put';
      diagEntry.errorName = sanitizeDiagString((err.code || err.name) || 'IndexedDBError');
      diagEntry.errorMessage = sanitizeDiagString(err.message || 'IndexedDB 保存失败');
    }
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
    readAudioFile: readAudioFile,
    recordDiagnostic: recordDiagnostic,
    updateDiagnosticSaveStatus: updateDiagnosticSaveStatus,
    getDiagnostics: getDiagnostics,
    clearDiagnostics: clearDiagnostics,
    getEnvironmentInfo: getEnvironmentInfo
  };
})(window);
