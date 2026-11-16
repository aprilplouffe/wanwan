// js/heartbeat-live-storage.js — 心动直播 V1.1.1 数据与大文件音频存储层
// 保留 V1.0-V1.1 全部配置/手账/日志/IndexedDB 兼容契约；
// V1.1.1 移除 25MB/120MB 人为上限，引入真实配额检测、OPFS 分块写入(回退 IDB Blob)、去重/取消与可选云端音频缓存。

(function(global) {
  'use strict';

  var CONFIG_PREFIX = 'heartbeat_live_';
  var LOCAL_PREFIX = 'wanwan_heart_live_';

  var KEYS = {
    SETTINGS: CONFIG_PREFIX + 'settings_v1',
    PORTRAIT_OPTS: CONFIG_PREFIX + 'portrait_opts_v1',
    BG_ASSET: CONFIG_PREFIX + 'bg_asset_v1',
    JOURNALS: CONFIG_PREFIX + 'journals_v1',
    ASMR_TRACKS: CONFIG_PREFIX + 'asmr_tracks_v1',
    FOLLOWED_CHARS: CONFIG_PREFIX + 'followed_chars_v1',
    CHAR_VOICES: CONFIG_PREFIX + 'char_voices_v1',
    CHAR_PORTRAIT_PREFIX: CONFIG_PREFIX + 'char_portrait_',
    AUDIO_BLOB_PREFIX: CONFIG_PREFIX + 'audio_blob_',
    CLOUD_MANIFEST_URL: CONFIG_PREFIX + 'cloud_manifest_url_v1',
    CLOUD_CATALOG: CONFIG_PREFIX + 'cloud_catalog_v1',
    CLOUD_CACHE_PREFIX: CONFIG_PREFIX + 'cloud_cache_',
    CHAT_LOG_PREFIX: CONFIG_PREFIX + 'log_',
    LOCAL_SETTINGS: LOCAL_PREFIX + 'settings_v1',
    LOCAL_LAYOUT: LOCAL_PREFIX + 'connection_layout',
    LOCAL_BACKUP_AUDIO: LOCAL_PREFIX + 'backup_audio'
  };

  var MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB 图片校验上限
  var MAX_SESSION_LOG_MESSAGES = 1000;
  var OPFS_AUDIO_DIR = 'heartbeat_live_audio';
  var CHUNK_BYTES = 1024 * 1024; // 1MB 分块，避免整文件读入内存

  var DEFAULT_SETTINGS = {
    theme: 'cloud',
    customBgType: '', // '' | 'local' | 'url'
    customBgUrl: '',
    motion: true,
    voice: 'both', // 'text' | 'both' | 'audio'
    expression: 'natural', // 'natural' | 'calm' | 'immersive'
    voiceVol: 65,
    captions: true,
    asmrPlayMode: 'loop', // 'random' | 'single' | 'loop' | 'sequence'
    asmrSelectedTrackId: '',
    ambient: 65,
    duck: true,
    timer: 'off',
    asmrEndAction: 'stop_program', // 'stop_program' | 'exit_room'
    initiative: 'natural', // 'natural' | 'quiet' | 'lively'
    thinking: 'short', // 'immersive' | 'short' | 'fast'
    context: true,
    sim: true,
    saveSimAudienceInLog: true,
    savePrompt: true,
    connectionLayout: 'floating', // 'floating' | 'split'
    includeAudioInBackup: false
  };

  var _objectUrlCache = new Map(); // cacheKey -> { url, ref }

  function sanitizeText(str, maxLen) {
    var s = String(str == null ? '' : str).replace(/[\u0000-\u001f]+/g, ' ').trim();
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }

  function isHttpsUrl(raw) {
    try {
      var u = new URL(String(raw || '').trim());
      return u.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function formatStorageBytes(n) {
    var v = Number(n) || 0;
    if (v < 1024) return v + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
    if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + ' MB';
    return (v / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function createAbortError(msg) {
    var err = new Error(msg || '已取消操作');
    err.name = 'AbortError';
    return err;
  }

  function throwIfAborted(signal, msg) {
    if (signal && signal.aborted) {
      throw createAbortError(msg || '已取消导入');
    }
  }

  async function dbReadConfig(key, fallbackVal) {
    try {
      if (global.db && global.db.config) {
        var op = function() { return global.db.config.get(key); };
        var row = typeof global.runWanWanDBRead === 'function'
          ? await global.runWanWanDBRead(op)
          : await op();
        if (row && row.value !== undefined) return row.value;
      }
    } catch (e) {
      console.warn('[HeartbeatLiveStorage] read config failed:', key, e);
    }
    return fallbackVal;
  }

  async function dbWriteConfig(key, value) {
    if (!global.db || !global.db.config) return false;
    var op = function() { return global.db.config.put({ key: key, value: value }); };
    if (typeof global.runWanWanDBIdempotentWrite === 'function') {
      await global.runWanWanDBIdempotentWrite(op);
    } else {
      await op();
    }
    return true;
  }

  async function dbDeleteConfig(key) {
    if (!global.db || !global.db.config) return false;
    var op = function() { return global.db.config.delete(key); };
    if (typeof global.runWanWanDBIdempotentWrite === 'function') {
      await global.runWanWanDBIdempotentWrite(op);
    } else {
      await op();
    }
    return true;
  }

  function normalizeSettings(raw) {
    var merged = Object.assign({}, DEFAULT_SETTINGS, raw && typeof raw === 'object' ? raw : {});
    if (['cloud', 'moon', 'garden', 'cafe'].indexOf(merged.theme) < 0) merged.theme = 'cloud';
    if (['', 'local', 'url'].indexOf(merged.customBgType) < 0) merged.customBgType = '';
    if (merged.customBgType === 'url' && !isHttpsUrl(merged.customBgUrl)) {
      merged.customBgType = '';
      merged.customBgUrl = '';
    }
    if (['text', 'both', 'audio'].indexOf(merged.voice) < 0) merged.voice = 'both';
    if (['natural', 'calm', 'immersive'].indexOf(merged.expression) < 0) merged.expression = 'natural';
    if (['random', 'single', 'loop', 'sequence'].indexOf(merged.asmrPlayMode) < 0) merged.asmrPlayMode = 'loop';
    if (['stop_program', 'exit_room'].indexOf(merged.asmrEndAction) < 0) merged.asmrEndAction = 'stop_program';
    if (['natural', 'quiet', 'lively'].indexOf(merged.initiative) < 0) merged.initiative = 'natural';
    if (['immersive', 'short', 'fast'].indexOf(merged.thinking) < 0) merged.thinking = 'short';
    if (['floating', 'split'].indexOf(merged.connectionLayout) < 0) merged.connectionLayout = 'floating';
    merged.voiceVol = Math.max(0, Math.min(100, Number(merged.voiceVol) || 0));
    merged.ambient = Math.max(0, Math.min(100, Number(merged.ambient) || 0));
    merged.motion = merged.motion !== false;
    merged.captions = merged.captions !== false;
    merged.duck = merged.duck !== false;
    merged.context = merged.context !== false;
    merged.sim = merged.sim !== false;
    merged.saveSimAudienceInLog = merged.saveSimAudienceInLog !== false;
    merged.savePrompt = merged.savePrompt !== false;
    merged.includeAudioInBackup = Boolean(merged.includeAudioInBackup);
    merged.asmrSelectedTrackId = String(merged.asmrSelectedTrackId || '');
    return merged;
  }

  async function loadSettings() {
    var fromDb = await dbReadConfig(KEYS.SETTINGS, null);
    if (fromDb && typeof fromDb === 'object') {
      return normalizeSettings(fromDb);
    }
    try {
      var raw = global.localStorage && global.localStorage.getItem(KEYS.LOCAL_SETTINGS);
      if (raw) return normalizeSettings(JSON.parse(raw));
    } catch (_) {}
    return normalizeSettings(null);
  }

  async function saveSettings(nextSettings) {
    var norm = normalizeSettings(nextSettings);
    try {
      if (global.localStorage) {
        global.localStorage.setItem(KEYS.LOCAL_SETTINGS, JSON.stringify(norm));
        global.localStorage.setItem(KEYS.LOCAL_LAYOUT, norm.connectionLayout);
        global.localStorage.setItem(KEYS.LOCAL_BACKUP_AUDIO, norm.includeAudioInBackup ? '1' : '0');
      }
    } catch (_) {}
    await dbWriteConfig(KEYS.SETTINGS, norm);
    return norm;
  }

  function normalizePortraitOption(opt) {
    var o = opt && typeof opt === 'object' ? opt : {};
    return {
      mode: o.mode === 'call' ? 'call' : 'fullscreen',
      fit: o.fit === 'contain' ? 'contain' : 'cover',
      position: ['center', 'center top', 'center bottom'].indexOf(o.position) >= 0 ? o.position : 'center'
    };
  }

  async function loadPortraitOptions() {
    var data = await dbReadConfig(KEYS.PORTRAIT_OPTS, {});
    return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
  }

  async function savePortraitOption(targetKey, option) {
    var key = String(targetKey || 'user');
    var all = await loadPortraitOptions();
    all[key] = normalizePortraitOption(option);
    await dbWriteConfig(KEYS.PORTRAIT_OPTS, all);
    return all[key];
  }

  function revokeCachedUrl(cacheKey) {
    var entry = _objectUrlCache.get(cacheKey);
    if (entry && entry.url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try { URL.revokeObjectURL(entry.url); } catch (_) {}
    }
    _objectUrlCache.delete(cacheKey);
  }

  function revokeAllObjectUrls() {
    var keys = Array.from(_objectUrlCache.keys());
    for (var i = 0; i < keys.length; i++) {
      revokeCachedUrl(keys[i]);
    }
  }

  function cacheBlobUrl(cacheKey, blob) {
    revokeCachedUrl(cacheKey);
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
    var url = URL.createObjectURL(blob);
    _objectUrlCache.set(cacheKey, { url: url, ref: blob });
    return url;
  }

  function validateImageDecodable(src) {
    if (typeof Image === 'undefined') return Promise.resolve();
    return new Promise(function(resolve, reject) {
      var img = new Image();
      var settled = false;
      var timer = setTimeout(function() {
        if (settled) return;
        settled = true;
        reject(new Error('图片加载超时，请重试'));
      }, 15000);
      img.onload = function() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!img.naturalWidth || !img.naturalHeight) {
          reject(new Error('图片尺寸无效'));
          return;
        }
        resolve();
      };
      img.onerror = function() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('图片无法加载，请检查图片或 HTTPS 链接'));
      };
      img.src = src;
    });
  }

  function validateAudioPlayable(src, opts) {
    opts = opts || {};
    if (typeof Audio === 'undefined') return Promise.resolve({ durationSec: 0 });
    return new Promise(function(resolve, reject) {
      if (opts.signal && opts.signal.aborted) {
        reject(createAbortError('已取消导入'));
        return;
      }
      var audio = new Audio();
      var settled = false;
      var onAbort = null;
      var cleanup = function() {
        if (onAbort && opts.signal && typeof opts.signal.removeEventListener === 'function') {
          try { opts.signal.removeEventListener('abort', onAbort); } catch (_) {}
        }
      };
      onAbort = function() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { audio.src = ''; } catch (_) {}
        cleanup();
        reject(createAbortError('已取消导入'));
      };
      if (opts.signal && typeof opts.signal.addEventListener === 'function') {
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
      var timer = setTimeout(function() {
        if (settled) return;
        settled = true;
        cleanup();
        try { audio.src = ''; } catch (_) {}
        resolve({ durationSec: 0 });
      }, 5000);
      audio.onloadedmetadata = function() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        var d = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0;
        try { audio.src = ''; } catch (_) {}
        resolve({ durationSec: d });
      };
      audio.onerror = function() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        try { audio.src = ''; } catch (_) {}
        reject(new Error('无法解码该音频文件，请使用 MP3/WAV/M4A/OGG/AAC/FLAC 格式'));
      };
      audio.src = src;
    });
  }

  function portraitKey(targetKey) {
    return KEYS.CHAR_PORTRAIT_PREFIX + String(targetKey);
  }

  async function loadPortraitSrc(targetKey) {
    var k = portraitKey(targetKey);
    var cached = _objectUrlCache.get(k);
    if (cached && cached.url) return cached.url;
    var val = await dbReadConfig(k, null);
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof Blob !== 'undefined' && val instanceof Blob) {
      return cacheBlobUrl(k, val);
    }
    if (val && val.url && typeof val.url === 'string') return val.url;
    return '';
  }

  async function savePortraitFile(targetKey, file) {
    if (!file || !file.type || String(file.type).indexOf('image/') !== 0) {
      throw new Error('请选择有效的图片文件');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error('图片大小不能超过 15MB');
    }
    var k = portraitKey(targetKey);
    var tempUrl = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(file) : '';
    try {
      if (tempUrl) await validateImageDecodable(tempUrl);
      await dbWriteConfig(k, file);
      if (tempUrl) {
        revokeCachedUrl(k);
        _objectUrlCache.set(k, { url: tempUrl, ref: file });
        return tempUrl;
      }
      return '';
    } catch (err) {
      if (tempUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        try { URL.revokeObjectURL(tempUrl); } catch (_) {}
      }
      throw err;
    }
  }

  async function savePortraitUrl(targetKey, urlStr) {
    var raw = String(urlStr || '').trim();
    if (!isHttpsUrl(raw)) throw new Error('请输入有效的 HTTPS 图片链接');
    await validateImageDecodable(raw);
    var k = portraitKey(targetKey);
    revokeCachedUrl(k);
    await dbWriteConfig(k, raw);
    return raw;
  }

  async function clearPortrait(targetKey) {
    var k = portraitKey(targetKey);
    revokeCachedUrl(k);
    await dbDeleteConfig(k);
  }

  async function loadCustomBgSrc(settings) {
    if (settings && settings.customBgType === 'url' && isHttpsUrl(settings.customBgUrl)) {
      return settings.customBgUrl;
    }
    if (settings && settings.customBgType === 'local') {
      var cached = _objectUrlCache.get(KEYS.BG_ASSET);
      if (cached && cached.url) return cached.url;
      var blob = await dbReadConfig(KEYS.BG_ASSET, null);
      if (typeof Blob !== 'undefined' && blob instanceof Blob) {
        return cacheBlobUrl(KEYS.BG_ASSET, blob);
      }
    }
    return '';
  }

  async function saveCustomBgFile(file) {
    if (!file || !file.type || String(file.type).indexOf('image/') !== 0) {
      throw new Error('请选择有效的图片文件');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error('背景图片大小不能超过 15MB');
    }
    var tempUrl = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(file) : '';
    try {
      if (tempUrl) await validateImageDecodable(tempUrl);
      await dbWriteConfig(KEYS.BG_ASSET, file);
      if (tempUrl) {
        revokeCachedUrl(KEYS.BG_ASSET);
        _objectUrlCache.set(KEYS.BG_ASSET, { url: tempUrl, ref: file });
        return tempUrl;
      }
      return '';
    } catch (err) {
      if (tempUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        try { URL.revokeObjectURL(tempUrl); } catch (_) {}
      }
      throw err;
    }
  }

  async function clearCustomBg() {
    revokeCachedUrl(KEYS.BG_ASSET);
    await dbDeleteConfig(KEYS.BG_ASSET);
  }

  // ===== V1.1.1 大文件音频存储引擎：OPFS (Origin Private File System) + IndexedDB Blob 回退 =====
  function getAudioStorageCapabilities() {
    var nav = global.navigator || {};
    var st = nav.storage || {};
    return {
      hasOpfs: typeof st.getDirectory === 'function',
      hasEstimate: typeof st.estimate === 'function',
      hasIndexedDb: Boolean(global.db && global.db.config)
    };
  }

  async function getAudioStorageQuota() {
    var caps = getAudioStorageCapabilities();
    if (!caps.hasEstimate) {
      return {
        supported: false,
        quota: null,
        usage: null,
        available: null,
        usableAvailable: null,
        headroomReserved: 0
      };
    }
    try {
      var est = await global.navigator.storage.estimate();
      var quota = Number(est && est.quota);
      var usage = Number(est && est.usage);
      if (!Number.isFinite(quota) || quota <= 0) {
        return { supported: false, quota: null, usage: null, available: null, usableAvailable: null, headroomReserved: 0 };
      }
      usage = Number.isFinite(usage) && usage >= 0 ? usage : 0;
      var available = Math.max(0, quota - usage);
      var headroom = Math.min(16 * 1024 * 1024, Math.floor(quota * 0.05));
      var usableAvailable = Math.max(0, available - headroom);
      return {
        supported: true,
        quota: quota,
        usage: usage,
        available: available,
        usableAvailable: usableAvailable,
        headroomReserved: headroom
      };
    } catch (_) {
      return { supported: false, quota: null, usage: null, available: null, usableAvailable: null, headroomReserved: 0 };
    }
  }

  async function ensureStorageSpaceForBytes(neededBytes) {
    var need = Math.max(0, Number(neededBytes) || 0);
    if (!need) return;
    var q = await getAudioStorageQuota();
    if (!q.supported || q.usableAvailable == null) return;
    if (need > q.usableAvailable) {
      throw new Error(
        '设备可用存储空间不足（需要 ' + formatStorageBytes(need) +
        '，当前剩余可用约 ' + formatStorageBytes(q.usableAvailable) + '）'
      );
    }
  }

  async function getOpfsAudioDir(create) {
    var caps = getAudioStorageCapabilities();
    if (!caps.hasOpfs) return null;
    try {
      var root = await global.navigator.storage.getDirectory();
      if (!root || typeof root.getDirectoryHandle !== 'function') return null;
      return await root.getDirectoryHandle(OPFS_AUDIO_DIR, { create: Boolean(create) });
    } catch (_) {
      return null;
    }
  }

  async function opfsExistsFile(fileName) {
    if (!fileName) return false;
    var dir = await getOpfsAudioDir(false);
    if (!dir || typeof dir.getFileHandle !== 'function') return false;
    try {
      await dir.getFileHandle(fileName, { create: false });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function opfsReadFile(fileName) {
    if (!fileName) return null;
    var dir = await getOpfsAudioDir(false);
    if (!dir || typeof dir.getFileHandle !== 'function') return null;
    try {
      var fh = await dir.getFileHandle(fileName, { create: false });
      if (!fh || typeof fh.getFile !== 'function') return null;
      return await fh.getFile();
    } catch (_) {
      return null;
    }
  }

  async function opfsDeleteFile(fileName) {
    if (!fileName) return false;
    var dir = await getOpfsAudioDir(false);
    if (!dir || typeof dir.removeEntry !== 'function') return false;
    try {
      await dir.removeEntry(fileName);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function clearOpfsAudioDir() {
    var caps = getAudioStorageCapabilities();
    if (!caps.hasOpfs) return false;
    try {
      var root = await global.navigator.storage.getDirectory();
      if (root && typeof root.removeEntry === 'function') {
        await root.removeEntry(OPFS_AUDIO_DIR, { recursive: true });
        return true;
      }
    } catch (_) {}
    return false;
  }

  async function writeBlobToOpfs(fileName, blobOrFile, opts) {
    opts = opts || {};
    var signal = opts.signal;
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    throwIfAborted(signal, '已取消写入');

    var dir = await getOpfsAudioDir(true);
    if (!dir) throw new Error('OPFS 目录不可用');

    var fh = await dir.getFileHandle(fileName, { create: true });
    var writable = await fh.createWritable();
    var total = Math.max(0, Number(blobOrFile && blobOrFile.size) || 0);
    var loaded = 0;

    try {
      if (blobOrFile && typeof blobOrFile.stream === 'function') {
        var reader = blobOrFile.stream().getReader();
        try {
          while (true) {
            throwIfAborted(signal, '已取消操作');
            var step = await reader.read();
            if (step.done) break;
            throwIfAborted(signal, '已取消操作');
            await writable.write(step.value);
            loaded += step.value ? (step.value.byteLength || step.value.length || 0) : 0;
            if (onProgress) onProgress({ loaded: loaded, total: total || loaded, percent: total ? Math.min(99, Math.round(loaded / total * 100)) : 50 });
          }
        } finally {
          try { reader.releaseLock(); } catch (_) {}
        }
      } else if (blobOrFile && typeof blobOrFile.slice === 'function' && total > 0) {
        var offset = 0;
        while (offset < total) {
          throwIfAborted(signal, '已取消操作');
          var end = Math.min(total, offset + CHUNK_BYTES);
          var slice = blobOrFile.slice(offset, end);
          await writable.write(slice);
          offset = end;
          loaded = offset;
          if (onProgress) onProgress({ loaded: loaded, total: total, percent: Math.min(99, Math.round(loaded / total * 100)) });
        }
      } else {
        throwIfAborted(signal, '已取消操作');
        await writable.write(blobOrFile);
        loaded = total;
        if (onProgress) onProgress({ loaded: total, total: total, percent: 95 });
      }
      throwIfAborted(signal, '已取消操作');
      await writable.close();
      if (onProgress) onProgress({ loaded: total || loaded, total: total || loaded, percent: 100 });
      return fileName;
    } catch (err) {
      try { if (typeof writable.abort === 'function') await writable.abort(); else await writable.close(); } catch (_) {}
      await opfsDeleteFile(fileName);
      if (err && err.name === 'QuotaExceededError') {
        throw new Error('设备可用存储空间不足，无法写入该音频文件');
      }
      throw err;
    }
  }

  // ===== 本地 ASMR 音频库 =====
  function isSupportedAudioFile(file) {
    if (!file) return false;
    var type = String(file.type || '').toLowerCase();
    var name = String(file.name || '').toLowerCase();
    if (/^audio\/(mpeg|mp3|wav|x-wav|wave|mp4|x-m4a|m4a|aac|ogg|vorbis|flac|x-flac|webm|opus)/.test(type)) {
      return true;
    }
    return /\.(mp3|wav|m4a|ogg|aac|flac|opus|webm)$/i.test(name);
  }

  function buildFileFingerprint(file) {
    if (!file) return '';
    var name = sanitizeText(String(file.name || ''), 120).toLowerCase();
    var size = Number(file.size) || 0;
    var mtime = Number(file.lastModified) || 0;
    return name + '::' + size + '::' + mtime;
  }

  function sanitizeOpfsSafeName(id, origName) {
    var extMatch = String(origName || '').match(/\.(mp3|wav|m4a|ogg|aac|flac|opus|webm)$/i);
    var ext = extMatch ? extMatch[0].toLowerCase() : '.audio';
    return String(id).replace(/[^a-zA-Z0-9_-]/g, '_') + ext;
  }

  async function listAsmrTracks() {
    var tracks = await dbReadConfig(KEYS.ASMR_TRACKS, []);
    return Array.isArray(tracks) ? tracks.filter(function(t) { return t && t.id; }) : [];
  }

  async function saveAsmrTrackList(tracks) {
    var clean = Array.isArray(tracks) ? tracks : [];
    await dbWriteConfig(KEYS.ASMR_TRACKS, clean);
    return clean;
  }

  async function checkLocalTrackBinaryExists(track) {
    if (!track || !track.id) return false;
    if (track.storageBackend === 'opfs' && track.opfsFileName) {
      if (await opfsExistsFile(track.opfsFileName)) return true;
    }
    var blob = await dbReadConfig(KEYS.AUDIO_BLOB_PREFIX + String(track.id), null);
    if (blob && ((typeof Blob !== 'undefined' && blob instanceof Blob) || typeof blob === 'string' || typeof blob === 'object')) {
      return true;
    }
    if (track.opfsFileName) {
      return await opfsExistsFile(track.opfsFileName);
    }
    return false;
  }

  async function listAsmrTracksWithStatus() {
    var tracks = await listAsmrTracks();
    var out = [];
    for (var i = 0; i < tracks.length; i++) {
      var t = tracks[i];
      var hasBinary = await checkLocalTrackBinaryExists(t);
      out.push(Object.assign({}, t, {
        sourceType: 'local',
        hasBinary: hasBinary,
        missingBinary: !hasBinary
      }));
    }
    return out;
  }

  async function findDuplicateLocalTrack(file, tracks) {
    var fp = buildFileFingerprint(file);
    var rawName = sanitizeText(String(file.name || '未命名音轨').replace(/\.[^.]+$/, ''), 40) || '未命名音轨';
    var fSize = Number(file.size) || 0;
    for (var i = 0; i < tracks.length; i++) {
      var t = tracks[i];
      if (!t) continue;
      var fpMatch = Boolean(t.fingerprint && fp && t.fingerprint === fp);
      var nameSizeMatch = Boolean(fSize > 0 && Number(t.size) === fSize && (t.originalFileName === file.name || t.name === rawName));
      if (fpMatch || nameSizeMatch) {
        var alive = await checkLocalTrackBinaryExists(t);
        return { track: t, hasBinary: alive };
      }
    }
    return null;
  }

  async function addAsmrTrack(file, opts) {
    opts = opts || {};
    var signal = opts.signal;
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    throwIfAborted(signal, '已取消导入');
    if (!isSupportedAudioFile(file)) {
      throw new Error('不支持该音频格式，请导入 MP3 / WAV / M4A / OGG / AAC / FLAC 文件');
    }

    var tracks = await listAsmrTracks();
    var dup = await findDuplicateLocalTrack(file, tracks);
    if (dup && dup.hasBinary) {
      throw new Error('「' + dup.track.name + '」已存在于本地音频库中，已跳过重复导入');
    }

    await ensureStorageSpaceForBytes(Number(file.size) || 0);
    throwIfAborted(signal, '已取消导入');

    if (onProgress) onProgress({ loaded: 0, total: Number(file.size) || 0, percent: 5, phase: '正在校验音频格式' });

    var tempUrl = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(file) : '';
    var meta = { durationSec: 0 };
    try {
      if (tempUrl) meta = await validateAudioPlayable(tempUrl, { signal: signal });
    } finally {
      if (tempUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        try { URL.revokeObjectURL(tempUrl); } catch (_) {}
      }
    }
    throwIfAborted(signal, '已取消导入');

    var isRepair = Boolean(dup && !dup.hasBinary && dup.track);
    var trackId = isRepair ? dup.track.id : ('asmr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6));
    var rawName = isRepair
      ? dup.track.name
      : (sanitizeText(String(file.name || '未命名音轨').replace(/\.[^.]+$/, ''), 40) || '未命名音轨');
    var caps = getAudioStorageCapabilities();
    var useOpfs = caps.hasOpfs;
    var opfsFileName = '';
    var backend = 'idb';

    if (useOpfs) {
      opfsFileName = sanitizeOpfsSafeName(trackId, file.name);
      try {
        await writeBlobToOpfs(opfsFileName, file, {
          signal: signal,
          onProgress: function(p) {
            if (onProgress) onProgress({ loaded: p.loaded, total: p.total, percent: p.percent, phase: '正在写入本地存储' });
          }
        });
        backend = 'opfs';
      } catch (err) {
        if (err && err.name === 'AbortError') {
          await opfsDeleteFile(opfsFileName);
          throw err;
        }
        // 若 OPFS 本身不可用则优雅回退至 IndexedDB Blob（若为真实空间不足则直接报错）
        if (err && err.message && err.message.indexOf('空间不足') >= 0) {
          throw err;
        }
        await opfsDeleteFile(opfsFileName);
        opfsFileName = '';
        backend = 'idb';
      }
    }

    if (backend === 'idb') {
      throwIfAborted(signal, '已取消导入');
      if (onProgress) onProgress({ loaded: Math.floor((file.size || 0) * 0.5), total: Number(file.size) || 0, percent: 60, phase: '正在写入 IndexedDB' });
      try {
        await dbWriteConfig(KEYS.AUDIO_BLOB_PREFIX + trackId, file);
      } catch (err) {
        await dbDeleteConfig(KEYS.AUDIO_BLOB_PREFIX + trackId);
        if (err && err.name === 'QuotaExceededError') {
          throw new Error('设备可用存储空间不足，无法写入该音频文件');
        }
        throw err;
      }
      if (signal && signal.aborted) {
        await dbDeleteConfig(KEYS.AUDIO_BLOB_PREFIX + trackId);
        throw createAbortError('已取消导入');
      }
      if (onProgress) onProgress({ loaded: Number(file.size) || 0, total: Number(file.size) || 0, percent: 100, phase: '导入完成' });
    }

    var entry = {
      id: trackId,
      name: rawName,
      originalFileName: sanitizeText(file.name || '', 120),
      fingerprint: buildFileFingerprint(file),
      mime: String(file.type || 'audio/mpeg'),
      size: Number(file.size) || 0,
      durationSec: Number(meta.durationSec) || (isRepair ? Number(dup.track.durationSec) || 0 : 0),
      storageBackend: backend,
      opfsFileName: opfsFileName,
      sourceType: 'local',
      createdAt: isRepair ? (dup.track.createdAt || Date.now()) : Date.now()
    };

    if (isRepair) {
      var idx = tracks.findIndex(function(t) { return t && t.id === trackId; });
      if (idx >= 0) tracks[idx] = entry;
      else tracks.unshift(entry);
    } else {
      tracks.unshift(entry);
    }
    await saveAsmrTrackList(tracks);
    return entry;
  }

  async function renameAsmrTrack(trackId, newName) {
    var cleanName = sanitizeText(newName, 40);
    if (!cleanName) throw new Error('音轨名称不能为空');
    var tracks = await listAsmrTracks();
    var idx = tracks.findIndex(function(t) { return t.id === trackId; });
    if (idx < 0) return null;
    tracks[idx] = Object.assign({}, tracks[idx], { name: cleanName });
    await saveAsmrTrackList(tracks);
    return tracks[idx];
  }

  async function deleteAsmrTrack(trackId) {
    var tracks = await listAsmrTracks();
    var target = tracks.find(function(t) { return t && t.id === trackId; });
    var next = tracks.filter(function(t) { return t.id !== trackId; });
    revokeCachedUrl(KEYS.AUDIO_BLOB_PREFIX + trackId);
    if (target && target.opfsFileName) {
      await opfsDeleteFile(target.opfsFileName);
    }
    await dbDeleteConfig(KEYS.AUDIO_BLOB_PREFIX + trackId);
    await saveAsmrTrackList(next);
    return next;
  }

  async function getAsmrTrackPlayUrl(trackId) {
    var tid = String(trackId || '');
    if (!tid) return '';
    var key = KEYS.AUDIO_BLOB_PREFIX + tid;
    var cached = _objectUrlCache.get(key);
    if (cached && cached.url) return cached.url;

    var tracks = await listAsmrTracks();
    var track = tracks.find(function(t) { return t && t.id === tid; }) || null;
    if (track && track.opfsFileName) {
      var opfsFile = await opfsReadFile(track.opfsFileName);
      if (opfsFile) {
        return cacheBlobUrl(key, opfsFile);
      }
    }

    var blob = await dbReadConfig(key, null);
    if (!blob) return '';
    if ((typeof Blob !== 'undefined' && blob instanceof Blob) || (typeof blob === 'object' && Number(blob.size) >= 0)) {
      return cacheBlobUrl(key, blob);
    }
    if (typeof blob === 'string') return blob;
    return '';
  }

  // ===== V1.1.1 可选云端音频素材清单与离线缓存 =====
  async function getCloudManifestUrl() {
    var u = await dbReadConfig(KEYS.CLOUD_MANIFEST_URL, '');
    return isHttpsUrl(u) ? String(u).trim() : '';
  }

  async function setCloudManifestUrl(urlStr) {
    var clean = String(urlStr || '').trim();
    if (!clean) {
      await dbDeleteConfig(KEYS.CLOUD_MANIFEST_URL);
      return '';
    }
    if (!isHttpsUrl(clean)) {
      throw new Error('云端音频清单仅支持 HTTPS 地址');
    }
    await dbWriteConfig(KEYS.CLOUD_MANIFEST_URL, clean);
    return clean;
  }

  function normalizeCloudItem(raw, idx) {
    if (!raw || typeof raw !== 'object') return null;
    var url = String(raw.url || '').trim();
    if (!isHttpsUrl(url)) return null;
    var name = sanitizeText(raw.name || raw.title || ('云端音轨 ' + (idx + 1)), 48);
    if (!name) return null;
    var id = sanitizeText(raw.id || ('cloud_' + idx + '_' + name), 64).replace(/\s+/g, '_');
    return {
      id: id,
      name: name,
      category: sanitizeText(raw.category || '云端素材', 24) || '云端素材',
      url: url,
      cover: isHttpsUrl(raw.cover) ? String(raw.cover).trim() : '',
      durationSec: Math.max(0, Math.round(Number(raw.durationSec) || 0)),
      size: Math.max(0, Number(raw.size) || 0),
      inPlaylist: Boolean(raw.inPlaylist),
      cachedLocally: Boolean(raw.cachedLocally),
      storageBackend: raw.storageBackend === 'opfs' ? 'opfs' : raw.storageBackend === 'idb' ? 'idb' : '',
      opfsFileName: sanitizeText(raw.opfsFileName || '', 96),
      cachedSize: Math.max(0, Number(raw.cachedSize) || 0),
      sourceType: 'cloud'
    };
  }

  async function checkCloudCacheExists(item) {
    if (!item || !item.id || !item.cachedLocally) return false;
    if (item.storageBackend === 'opfs' && item.opfsFileName) {
      if (await opfsExistsFile(item.opfsFileName)) return true;
    }
    var blob = await dbReadConfig(KEYS.CLOUD_CACHE_PREFIX + String(item.id), null);
    if (blob && ((typeof Blob !== 'undefined' && blob instanceof Blob) || (typeof blob === 'object' && Number(blob.size) >= 0))) return true;
    if (item.opfsFileName) return await opfsExistsFile(item.opfsFileName);
    return false;
  }

  async function listCloudCatalog() {
    var list = await dbReadConfig(KEYS.CLOUD_CATALOG, []);
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var item = normalizeCloudItem(list[i], i);
      if (!item) continue;
      if (item.cachedLocally) {
        var alive = await checkCloudCacheExists(item);
        if (!alive) {
          item.cachedLocally = false;
          item.cacheMissing = true;
          item.storageBackend = '';
          item.opfsFileName = '';
        }
      }
      out.push(item);
    }
    return out;
  }

  async function saveCloudCatalog(items) {
    var clean = Array.isArray(items) ? items.map(function(x, i) { return normalizeCloudItem(x, i); }).filter(Boolean) : [];
    await dbWriteConfig(KEYS.CLOUD_CATALOG, clean);
    return clean;
  }

  async function fetchCloudManifest(urlStr, opts) {
    opts = opts || {};
    var url = String(urlStr || '').trim() || await getCloudManifestUrl();
    if (!isHttpsUrl(url)) {
      throw new Error('请先输入有效的 HTTPS 云端音频清单地址');
    }
    if (typeof global.fetch !== 'function') {
      throw new Error('当前环境不支持网络请求');
    }
    var res = await global.fetch(url, { signal: opts.signal, headers: { Accept: 'application/json' } });
    if (!res || !res.ok) {
      throw new Error('获取云端清单失败（HTTP ' + (res ? res.status : '网络错误') + '）');
    }
    var payload = await res.json();
    var rawItems = Array.isArray(payload) ? payload : (payload && (Array.isArray(payload.tracks) ? payload.tracks : Array.isArray(payload.items) ? payload.items : []));
    if (!Array.isArray(rawItems) || !rawItems.length) {
      throw new Error('云端清单中未包含有效的 HTTPS 音频条目');
    }

    var existing = await listCloudCatalog();
    var existingById = new Map();
    existing.forEach(function(item) { existingById.set(item.id, item); });

    var merged = [];
    for (var i = 0; i < rawItems.length; i++) {
      var norm = normalizeCloudItem(rawItems[i], i);
      if (!norm) continue;
      var prev = existingById.get(norm.id);
      if (prev) {
        norm.inPlaylist = prev.inPlaylist;
        norm.cachedLocally = prev.cachedLocally;
        norm.storageBackend = prev.storageBackend;
        norm.opfsFileName = prev.opfsFileName;
        norm.cachedSize = prev.cachedSize;
      }
      merged.push(norm);
    }
    if (!merged.length) {
      throw new Error('云端清单条目缺少合法的 HTTPS url 或 name 字段');
    }
    await setCloudManifestUrl(url);
    return await saveCloudCatalog(merged);
  }

  async function toggleCloudTrackPlaylist(cloudId, inPlaylist) {
    var list = await listCloudCatalog();
    var idx = list.findIndex(function(x) { return x.id === cloudId; });
    if (idx < 0) return null;
    list[idx].inPlaylist = inPlaylist === undefined ? !list[idx].inPlaylist : Boolean(inPlaylist);
    await saveCloudCatalog(list);
    return list[idx];
  }

  async function cacheCloudAudioTrack(cloudId, opts) {
    opts = opts || {};
    var signal = opts.signal;
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    var list = await listCloudCatalog();
    var idx = list.findIndex(function(x) { return x.id === cloudId; });
    if (idx < 0) throw new Error('未找到对应的云端音频条目');
    var item = list[idx];
    if (!isHttpsUrl(item.url)) throw new Error('无效的云端音频 HTTPS 链接');
    if (typeof global.fetch !== 'function') throw new Error('当前环境不支持在线下载');

    throwIfAborted(signal, '已取消缓存');
    if (item.size > 0) await ensureStorageSpaceForBytes(item.size);
    if (onProgress) onProgress({ loaded: 0, total: item.size || 0, percent: 5, phase: '正在连接云端' });

    var res = await global.fetch(item.url, { signal: signal });
    if (!res || !res.ok) {
      throw new Error('云端音频下载失败（HTTP ' + (res ? res.status : '网络错误') + '）');
    }
    var blob = await res.blob();
    throwIfAborted(signal, '已取消缓存');
    var realSize = Number(blob && blob.size) || Number(item.size) || 0;
    if (realSize > 0) await ensureStorageSpaceForBytes(realSize);

    var caps = getAudioStorageCapabilities();
    var opfsName = '';
    var backend = 'idb';
    if (caps.hasOpfs) {
      opfsName = 'cloud_cache_' + sanitizeOpfsSafeName(item.id, item.url.split('?')[0]);
      try {
        await writeBlobToOpfs(opfsName, blob, { signal: signal, onProgress: onProgress });
        backend = 'opfs';
      } catch (err) {
        if (err && err.name === 'AbortError') {
          await opfsDeleteFile(opfsName);
          throw err;
        }
        if (err && err.message && err.message.indexOf('空间不足') >= 0) throw err;
        await opfsDeleteFile(opfsName);
        opfsName = '';
        backend = 'idb';
      }
    }
    if (backend === 'idb') {
      throwIfAborted(signal, '已取消缓存');
      try {
        await dbWriteConfig(KEYS.CLOUD_CACHE_PREFIX + item.id, blob);
      } catch (err) {
        await dbDeleteConfig(KEYS.CLOUD_CACHE_PREFIX + item.id);
        if (err && err.name === 'QuotaExceededError') throw new Error('存储空间不足，无法缓存该云端音频');
        throw err;
      }
      if (signal && signal.aborted) {
        await dbDeleteConfig(KEYS.CLOUD_CACHE_PREFIX + item.id);
        throw createAbortError('已取消缓存');
      }
      if (onProgress) onProgress({ loaded: realSize, total: realSize, percent: 100, phase: '缓存完成' });
    }

    list[idx] = Object.assign({}, item, {
      cachedLocally: true,
      cacheMissing: false,
      storageBackend: backend,
      opfsFileName: opfsName,
      cachedSize: realSize || item.size || 0,
      size: item.size || realSize || 0
    });
    await saveCloudCatalog(list);
    return list[idx];
  }

  async function uncacheCloudAudioTrack(cloudId) {
    var list = await listCloudCatalog();
    var idx = list.findIndex(function(x) { return x.id === cloudId; });
    if (idx < 0) return null;
    var item = list[idx];
    var cacheKey = KEYS.CLOUD_CACHE_PREFIX + String(item.id);
    revokeCachedUrl(cacheKey);
    if (item.opfsFileName) await opfsDeleteFile(item.opfsFileName);
    await dbDeleteConfig(cacheKey);
    list[idx] = Object.assign({}, item, {
      cachedLocally: false,
      cacheMissing: false,
      storageBackend: '',
      opfsFileName: '',
      cachedSize: 0
    });
    await saveCloudCatalog(list);
    return list[idx];
  }

  async function getCloudTrackCachePlayUrl(item) {
    if (!item || !item.id || !item.cachedLocally) return '';
    var cacheKey = KEYS.CLOUD_CACHE_PREFIX + String(item.id);
    var cached = _objectUrlCache.get(cacheKey);
    if (cached && cached.url) return cached.url;
    if (item.opfsFileName) {
      var f = await opfsReadFile(item.opfsFileName);
      if (f) return cacheBlobUrl(cacheKey, f);
    }
    var blob = await dbReadConfig(cacheKey, null);
    if (blob && ((typeof Blob !== 'undefined' && blob instanceof Blob) || (typeof blob === 'object' && Number(blob.size) >= 0))) {
      return cacheBlobUrl(cacheKey, blob);
    }
    return '';
  }

  async function listPlayablePlaylistItems() {
    var localTracks = await listAsmrTracksWithStatus();
    var cloudAll = await listCloudCatalog();
    var cloudPlaylist = cloudAll.filter(function(c) { return c.inPlaylist; });
    return localTracks.concat(cloudPlaylist);
  }

  async function resolveAudioTrackPlaySource(trackIdOrEntry, opts) {
    opts = opts || {};
    var entry = typeof trackIdOrEntry === 'object' ? trackIdOrEntry : null;
    if (!entry && trackIdOrEntry) {
      var locals = await listAsmrTracksWithStatus();
      entry = locals.find(function(t) { return t.id === String(trackIdOrEntry); }) || null;
      if (!entry) {
        var clouds = await listCloudCatalog();
        entry = clouds.find(function(c) { return c.id === String(trackIdOrEntry); }) || null;
      }
    }
    if (!entry) return { ok: false, url: '', reason: 'missing_entry' };

    if (entry.sourceType === 'cloud' || isHttpsUrl(entry.url)) {
      if (entry.cachedLocally) {
        var cacheUrl = await getCloudTrackCachePlayUrl(entry);
        if (cacheUrl) {
          return { ok: true, url: cacheUrl, sourceType: 'cloud_cached', entry: entry };
        }
      }
      var isOffline = Boolean(global.navigator && global.navigator.onLine === false);
      if (isOffline && !opts.allowOfflineAttempt) {
        return { ok: false, url: '', reason: 'offline_uncached', sourceType: 'cloud', entry: entry };
      }
      if (isHttpsUrl(entry.url)) {
        return { ok: true, url: entry.url, sourceType: 'cloud_stream', entry: entry };
      }
      return { ok: false, url: '', reason: 'invalid_cloud_url', entry: entry };
    }

    var localUrl = await getAsmrTrackPlayUrl(entry.id);
    if (!localUrl) {
      return { ok: false, url: '', reason: 'missing_binary', sourceType: 'local', entry: entry };
    }
    return { ok: true, url: localUrl, sourceType: 'local', entry: entry };
  }

  async function getAudioStorageStats() {
    var locals = await listAsmrTracksWithStatus();
    var clouds = await listCloudCatalog();
    var localBytes = locals.reduce(function(sum, t) {
      return sum + (t.hasBinary ? (Number(t.size) || 0) : 0);
    }, 0);
    var missingLocalCount = locals.filter(function(t) { return t.missingBinary; }).length;
    var cachedClouds = clouds.filter(function(c) { return c.cachedLocally; });
    var cloudCacheBytes = cachedClouds.reduce(function(sum, c) {
      return sum + (Number(c.cachedSize || c.size) || 0);
    }, 0);
    var caps = getAudioStorageCapabilities();
    var quota = await getAudioStorageQuota();
    return {
      backendPreferred: caps.hasOpfs ? 'OPFS' : 'IndexedDB',
      caps: caps,
      quota: quota,
      localCount: locals.length,
      missingLocalCount: missingLocalCount,
      localBytes: localBytes,
      cloudCount: clouds.length,
      cloudCachedCount: cachedClouds.length,
      cloudCacheBytes: cloudCacheBytes,
      totalAudioBytes: localBytes + cloudCacheBytes
    };
  }

  // ===== 关注状态、角色定制音色、手账 =====
  async function loadFollowedChars() {
    var map = await dbReadConfig(KEYS.FOLLOWED_CHARS, {});
    return (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
  }

  async function toggleFollowChar(charId) {
    var cid = String(charId || '');
    if (!cid) return false;
    var map = await loadFollowedChars();
    map[cid] = !map[cid];
    await dbWriteConfig(KEYS.FOLLOWED_CHARS, map);
    return !!map[cid];
  }

  async function loadCharVoices() {
    var map = await dbReadConfig(KEYS.CHAR_VOICES, {});
    return (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
  }

  async function saveCharVoiceId(charId, voiceId) {
    var cid = String(charId || '');
    if (!cid) return;
    var map = await loadCharVoices();
    var clean = sanitizeText(voiceId, 80);
    if (clean) map[cid] = clean;
    else delete map[cid];
    await dbWriteConfig(KEYS.CHAR_VOICES, map);
  }

  function normalizeChatLogMessage(msg, fallbackSessionId) {
    if (!msg || typeof msg !== 'object') return null;
    var sType = String(msg.senderType || msg.senderRole || 'user');
    if (['user', 'char', 'npc', 'user_cohost', 'ai_audience', 'system', 'gift'].indexOf(sType) < 0) {
      sType = 'system';
    }
    var content = sanitizeText(msg.content != null ? msg.content : msg.text, 800);
    if (!content) return null;
    return {
      messageId: String(msg.messageId || msg.id || ('m_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6))),
      sessionId: String(msg.sessionId || fallbackSessionId || ''),
      senderId: String(msg.senderId || ''),
      senderType: sType,
      senderNameSnapshot: sanitizeText(msg.senderNameSnapshot || msg.sender || '未知', 48),
      messageType: sanitizeText(msg.messageType || (sType === 'gift' ? 'gift' : sType === 'ai_audience' ? 'ai_audience' : sType === 'system' ? 'system' : 'chat'), 32),
      content: content,
      createdAt: Number(msg.createdAt || msg.ts) || Date.now(),
      source: sanitizeText(msg.source || 'live_room', 32),
      isSimAudience: Boolean(msg.isSimAudience || sType === 'ai_audience'),
      schemaVersion: 2
    };
  }

  function chatLogKey(sessionId) {
    return KEYS.CHAT_LOG_PREFIX + String(sessionId || '');
  }

  async function saveSessionChatLog(sessionId, messages, opts) {
    var sid = sanitizeText(sessionId, 80);
    if (!sid) return null;
    opts = opts || {};
    var includeSim = opts.includeSimAudience;
    if (includeSim === undefined) {
      var curSettings = await loadSettings();
      includeSim = !curSettings || curSettings.saveSimAudienceInLog !== false;
    }
    var rawList = Array.isArray(messages) ? messages : [];
    var cleanList = [];
    for (var i = 0; i < rawList.length; i++) {
      var item = normalizeChatLogMessage(rawList[i], sid);
      if (item && (includeSim || (!item.isSimAudience && item.senderType !== 'ai_audience'))) {
        cleanList.push(item);
      }
    }
    if (cleanList.length > MAX_SESSION_LOG_MESSAGES) {
      cleanList = cleanList.slice(-MAX_SESSION_LOG_MESSAGES);
    }
    var payload = {
      schemaVersion: 2,
      sessionId: sid,
      updatedAt: Date.now(),
      messages: cleanList
    };
    await dbWriteConfig(chatLogKey(sid), payload);
    return payload;
  }

  async function loadSessionChatLog(sessionId, opts) {
    var sid = sanitizeText(sessionId, 80);
    opts = opts || {};
    if (!sid) {
      return { exists: false, sessionId: '', messages: [], totalCount: 0, filteredCount: 0, simAudienceCount: 0, hasMore: false };
    }
    var raw = await dbReadConfig(chatLogKey(sid), null);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.messages)) {
      return { exists: false, sessionId: sid, messages: [], totalCount: 0, filteredCount: 0, simAudienceCount: 0, hasMore: false };
    }
    var allMsgs = raw.messages.slice().sort(function(a, b) {
      return (Number(a && a.createdAt) || 0) - (Number(b && b.createdAt) || 0);
    });
    var simCount = allMsgs.filter(function(m) { return Boolean(m && (m.isSimAudience || m.senderType === 'ai_audience')); }).length;
    var includeSim = opts.includeSimAudience !== false;
    var filtered = includeSim
      ? allMsgs
      : allMsgs.filter(function(m) { return !(m && (m.isSimAudience || m.senderType === 'ai_audience')); });

    var offset = Math.max(0, Number(opts.offset) || 0);
    var limit = opts.limit != null ? Math.max(1, Number(opts.limit) || 40) : filtered.length;
    var slice = filtered.slice(offset, offset + limit);
    return {
      exists: true,
      sessionId: sid,
      messages: slice,
      totalCount: allMsgs.length,
      filteredCount: filtered.length,
      simAudienceCount: simCount,
      hasMore: (offset + slice.length) < filtered.length
    };
  }

  async function deleteSessionChatLog(sessionId) {
    var sid = sanitizeText(sessionId, 80);
    if (!sid) return false;
    return dbDeleteConfig(chatLogKey(sid));
  }

  function normalizeJournalHostFields(item) {
    if (!item || typeof item !== 'object') return item;
    var hm = item.hostMode === 'user'
      ? 'user'
      : item.hostMode === 'private'
        ? 'private'
        : item.hostMode === 'npc'
          ? 'npc'
          : 'char';
    var ht = (item.hostType === 'user' || item.hostType === 'npc' || item.hostType === 'char')
      ? item.hostType
      : (hm === 'user' ? 'user' : hm === 'npc' ? 'npc' : 'char');
    var hid = String(item.hostId || (ht === 'user' ? (item.ownerUid || 'user') : (item.charId || '')));
    var hname = sanitizeText(item.hostName || (ht === 'user' ? '我' : (item.charName || 'Char')), 48);
    if (item.hostMode === hm && item.hostType === ht && item.hostId === hid && item.hostName === hname) {
      return item;
    }
    return Object.assign({}, item, {
      hostMode: hm,
      hostType: ht,
      hostId: hid,
      hostName: hname
    });
  }

  async function loadJournals() {
    var list = await dbReadConfig(KEYS.JOURNALS, []);
    return Array.isArray(list) ? list.map(normalizeJournalHostFields).filter(Boolean) : [];
  }

  async function addJournalEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    var list = await loadJournals();
    var invited = Array.isArray(entry.invitedParticipants)
      ? entry.invitedParticipants.slice(0, 20).map(function(p) {
          return {
            id: String((p && p.id) || ''),
            name: sanitizeText((p && p.name) || '嘉宾', 32),
            roleType: (p && p.roleType === 'npc') ? 'npc' : 'char'
          };
        }).filter(function(p) { return p.id; })
      : [];
    var hostMode = entry.hostMode === 'user'
      ? 'user'
      : entry.hostMode === 'private'
        ? 'private'
        : entry.hostMode === 'npc'
          ? 'npc'
          : 'char';
    var hostType = (entry.hostType === 'user' || entry.hostType === 'npc' || entry.hostType === 'char')
      ? entry.hostType
      : (hostMode === 'user' ? 'user' : hostMode === 'npc' ? 'npc' : 'char');
    var hostId = String(entry.hostId || (hostType === 'user' ? (entry.ownerUid || 'user') : (entry.charId || '')));
    var hostName = sanitizeText(entry.hostName || (hostType === 'user' ? '我' : (entry.charName || 'Char')), 48);
    var record = {
      id: String(entry.id || ('jnl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6))),
      sessionId: sanitizeText(entry.sessionId || entry.logSessionId || '', 80),
      ownerUid: Number(entry.ownerUid) || 0,
      hostMode: hostMode,
      hostType: hostType,
      hostId: hostId,
      hostName: hostName,
      charId: String(entry.charId || ''),
      charName: sanitizeText(entry.charName || hostName || 'Char', 48),
      charType: entry.charType === 'npc' ? 'npc' : entry.charType === 'mixed' ? 'mixed' : 'char',
      invitedParticipants: invited,
      hasRealChar: entry.hasRealChar !== undefined ? Boolean(entry.hasRealChar) : Boolean(hostType === 'char' && entry.charId),
      program: sanitizeText(entry.program || 'chat', 24),
      programLabel: sanitizeText(entry.programLabel || '闲聊直播', 24),
      title: sanitizeText(entry.title || '心动直播时刻', 40),
      summary: sanitizeText(entry.summary || '', 260),
      highlights: Array.isArray(entry.highlights) ? entry.highlights.slice(0, 6) : [],
      giftsTotalCoins: Math.max(0, Number(entry.giftsTotalCoins) || 0),
      msgCount: Math.max(0, Number(entry.msgCount) || 0),
      logMessageCount: Math.max(0, Number(entry.logMessageCount) || 0),
      hasChatLog: Boolean(entry.hasChatLog),
      cohostUsed: Boolean(entry.cohostUsed),
      asmrUsed: Boolean(entry.asmrUsed),
      startedAt: Number(entry.startedAt) || Date.now(),
      endedAt: Number(entry.endedAt) || Date.now(),
      memoryId: entry.memoryId ? Number(entry.memoryId) : null,
      memoryCharId: entry.memoryCharId ? String(entry.memoryCharId) : '',
      schemaVersion: entry.hasChatLog ? 2 : (Number(entry.schemaVersion) || 1)
    };
    list.unshift(record);
    if (list.length > 80) {
      var trimmed = list.slice(80);
      list = list.slice(0, 80);
      for (var ti = 0; ti < trimmed.length; ti++) {
        if (trimmed[ti] && trimmed[ti].sessionId) {
          try { await deleteSessionChatLog(trimmed[ti].sessionId); } catch (_) {}
        }
      }
    }
    await dbWriteConfig(KEYS.JOURNALS, list);
    return record;
  }

  async function markJournalMemorySaved(journalId, memoryId, memoryCharId) {
    var list = await loadJournals();
    var idx = list.findIndex(function(item) { return item && item.id === journalId; });
    if (idx < 0) return null;
    list[idx] = Object.assign({}, list[idx], {
      memoryId: Number(memoryId) || null,
      memoryCharId: memoryCharId ? String(memoryCharId) : (list[idx].memoryCharId || '')
    });
    await dbWriteConfig(KEYS.JOURNALS, list);
    return list[idx];
  }

  async function deleteJournalEntry(journalId) {
    var list = await loadJournals();
    var removed = list.filter(function(item) { return item && item.id === journalId; });
    var next = list.filter(function(item) { return item && item.id !== journalId; });
    await dbWriteConfig(KEYS.JOURNALS, next);
    for (var i = 0; i < removed.length; i++) {
      if (removed[i] && removed[i].sessionId) {
        try { await deleteSessionChatLog(removed[i].sessionId); } catch (_) {}
      }
    }
    return next;
  }

  global.HeartbeatLiveStorage = {
    CONFIG_PREFIX: CONFIG_PREFIX,
    LOCAL_PREFIX: LOCAL_PREFIX,
    KEYS: KEYS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    MAX_IMAGE_BYTES: MAX_IMAGE_BYTES,
    MAX_SESSION_LOG_MESSAGES: MAX_SESSION_LOG_MESSAGES,
    isHttpsUrl: isHttpsUrl,
    normalizeSettings: normalizeSettings,
    normalizePortraitOption: normalizePortraitOption,
    normalizeChatLogMessage: normalizeChatLogMessage,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    loadPortraitOptions: loadPortraitOptions,
    savePortraitOption: savePortraitOption,
    loadPortraitSrc: loadPortraitSrc,
    savePortraitFile: savePortraitFile,
    savePortraitUrl: savePortraitUrl,
    clearPortrait: clearPortrait,
    loadCustomBgSrc: loadCustomBgSrc,
    saveCustomBgFile: saveCustomBgFile,
    clearCustomBg: clearCustomBg,
    getAudioStorageCapabilities: getAudioStorageCapabilities,
    getAudioStorageQuota: getAudioStorageQuota,
    getAudioStorageStats: getAudioStorageStats,
    listAsmrTracks: listAsmrTracks,
    listAsmrTracksWithStatus: listAsmrTracksWithStatus,
    addAsmrTrack: addAsmrTrack,
    renameAsmrTrack: renameAsmrTrack,
    deleteAsmrTrack: deleteAsmrTrack,
    getAsmrTrackPlayUrl: getAsmrTrackPlayUrl,
    getCloudManifestUrl: getCloudManifestUrl,
    setCloudManifestUrl: setCloudManifestUrl,
    listCloudCatalog: listCloudCatalog,
    saveCloudCatalog: saveCloudCatalog,
    fetchCloudManifest: fetchCloudManifest,
    toggleCloudTrackPlaylist: toggleCloudTrackPlaylist,
    cacheCloudAudioTrack: cacheCloudAudioTrack,
    uncacheCloudAudioTrack: uncacheCloudAudioTrack,
    listPlayablePlaylistItems: listPlayablePlaylistItems,
    resolveAudioTrackPlaySource: resolveAudioTrackPlaySource,
    clearOpfsAudioDir: clearOpfsAudioDir,
    loadFollowedChars: loadFollowedChars,
    toggleFollowChar: toggleFollowChar,
    loadCharVoices: loadCharVoices,
    saveCharVoiceId: saveCharVoiceId,
    saveSessionChatLog: saveSessionChatLog,
    loadSessionChatLog: loadSessionChatLog,
    deleteSessionChatLog: deleteSessionChatLog,
    loadJournals: loadJournals,
    addJournalEntry: addJournalEntry,
    markJournalMemorySaved: markJournalMemorySaved,
    deleteJournalEntry: deleteJournalEntry,
    revokeAllObjectUrls: revokeAllObjectUrls,
    revokeCachedUrl: revokeCachedUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);
