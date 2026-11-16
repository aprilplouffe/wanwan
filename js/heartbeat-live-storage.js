// js/heartbeat-live-storage.js — 心动直播 V1.0 数据与媒体存储层
// 所有配置、画面偏好、手账与 ASMR 本地音频库统一落入 WanWanDB.config (prefix: heartbeat_live_)
// 与 localStorage (prefix: wanwan_heart_live_)，支持整机备份/恢复与独立清理。

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
    LOCAL_SETTINGS: LOCAL_PREFIX + 'settings_v1',
    LOCAL_LAYOUT: LOCAL_PREFIX + 'connection_layout',
    LOCAL_BACKUP_AUDIO: LOCAL_PREFIX + 'backup_audio'
  };

  var MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB
  var MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB
  var MAX_TOTAL_AUDIO_BYTES = 120 * 1024 * 1024; // 120MB

  var DEFAULT_SETTINGS = {
    theme: 'cloud',
    customBgType: '', // '' | 'local' | 'url'
    customBgUrl: '',
    motion: true,
    voice: 'both', // 'text' | 'both' | 'audio'
    expression: 'natural', // 'natural' | 'calm' | 'immersive'
    voiceVol: 65,
    captions: true,
    asmrPlayMode: 'loop', // 'random' | 'single' | 'loop'
    asmrSelectedTrackId: '',
    ambient: 65,
    duck: true,
    timer: 'off',
    asmrEndAction: 'stop_program', // 'stop_program' | 'exit_room'
    initiative: 'natural', // 'natural' | 'quiet' | 'lively'
    thinking: 'short', // 'immersive' | 'short' | 'fast'
    context: true,
    sim: true,
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
    if (['random', 'single', 'loop'].indexOf(merged.asmrPlayMode) < 0) merged.asmrPlayMode = 'loop';
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

  function validateAudioPlayable(src) {
    if (typeof Audio === 'undefined') return Promise.resolve({ durationSec: 0 });
    return new Promise(function(resolve, reject) {
      var audio = new Audio();
      var settled = false;
      var timer = setTimeout(function() {
        if (settled) return;
        settled = true;
        audio.src = '';
        resolve({ durationSec: 0 });
      }, 6000);
      audio.onloadedmetadata = function() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        var d = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0;
        audio.src = '';
        resolve({ durationSec: d });
      };
      audio.onerror = function() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        audio.src = '';
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

  // ===== ASMR 本地音频库 =====
  function isSupportedAudioFile(file) {
    if (!file) return false;
    var type = String(file.type || '').toLowerCase();
    var name = String(file.name || '').toLowerCase();
    if (/^audio\/(mpeg|mp3|wav|x-wav|wave|mp4|x-m4a|aac|ogg|vorbis|flac|x-flac|webm)/.test(type)) {
      return true;
    }
    return /\.(mp3|wav|m4a|ogg|aac|flac|opus)$/i.test(name);
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

  async function addAsmrTrack(file) {
    if (!isSupportedAudioFile(file)) {
      throw new Error('不支持该音频格式，请导入 MP3 / WAV / M4A / OGG / AAC / FLAC 文件');
    }
    if (file.size > MAX_AUDIO_BYTES) {
      throw new Error('单个音频文件不能超过 25MB');
    }
    var tracks = await listAsmrTracks();
    var currentTotal = tracks.reduce(function(sum, t) { return sum + (Number(t.size) || 0); }, 0);
    if (currentTotal + file.size > MAX_TOTAL_AUDIO_BYTES) {
      throw new Error('本地 ASMR 音频库总容量已达 120MB 上限，请先删除旧音轨');
    }

    var tempUrl = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(file) : '';
    var meta = { durationSec: 0 };
    try {
      if (tempUrl) meta = await validateAudioPlayable(tempUrl);
    } finally {
      if (tempUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        try { URL.revokeObjectURL(tempUrl); } catch (_) {}
      }
    }

    var trackId = 'asmr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    var rawName = sanitizeText(String(file.name || '未命名音轨').replace(/\.[^.]+$/, ''), 40) || '未命名音轨';
    var entry = {
      id: trackId,
      name: rawName,
      mime: String(file.type || 'audio/mpeg'),
      size: Number(file.size) || 0,
      durationSec: Number(meta.durationSec) || 0,
      createdAt: Date.now()
    };

    await dbWriteConfig(KEYS.AUDIO_BLOB_PREFIX + trackId, file);
    tracks.unshift(entry);
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
    var next = tracks.filter(function(t) { return t.id !== trackId; });
    revokeCachedUrl(KEYS.AUDIO_BLOB_PREFIX + trackId);
    await dbDeleteConfig(KEYS.AUDIO_BLOB_PREFIX + trackId);
    await saveAsmrTrackList(next);
    return next;
  }

  async function getAsmrTrackPlayUrl(trackId) {
    var key = KEYS.AUDIO_BLOB_PREFIX + String(trackId);
    var cached = _objectUrlCache.get(key);
    if (cached && cached.url) return cached.url;
    var blob = await dbReadConfig(key, null);
    if (!blob) return '';
    if (typeof Blob !== 'undefined' && blob instanceof Blob) {
      return cacheBlobUrl(key, blob);
    }
    if (typeof blob === 'string') return blob;
    return '';
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

  async function loadJournals() {
    var list = await dbReadConfig(KEYS.JOURNALS, []);
    return Array.isArray(list) ? list : [];
  }

  async function addJournalEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    var list = await loadJournals();
    var record = {
      id: String(entry.id || ('jnl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6))),
      ownerUid: Number(entry.ownerUid) || 0,
      charId: String(entry.charId || ''),
      charName: sanitizeText(entry.charName || 'Char', 32),
      hostMode: entry.hostMode === 'user' ? 'user' : entry.hostMode === 'private' ? 'private' : 'char',
      program: sanitizeText(entry.program || 'chat', 24),
      programLabel: sanitizeText(entry.programLabel || '闲聊直播', 24),
      title: sanitizeText(entry.title || '心动直播时刻', 40),
      summary: sanitizeText(entry.summary || '', 260),
      highlights: Array.isArray(entry.highlights) ? entry.highlights.slice(0, 6) : [],
      giftsTotalCoins: Math.max(0, Number(entry.giftsTotalCoins) || 0),
      msgCount: Math.max(0, Number(entry.msgCount) || 0),
      cohostUsed: Boolean(entry.cohostUsed),
      asmrUsed: Boolean(entry.asmrUsed),
      startedAt: Number(entry.startedAt) || Date.now(),
      endedAt: Number(entry.endedAt) || Date.now(),
      memoryId: entry.memoryId ? Number(entry.memoryId) : null
    };
    list.unshift(record);
    if (list.length > 80) list = list.slice(0, 80);
    await dbWriteConfig(KEYS.JOURNALS, list);
    return record;
  }

  async function markJournalMemorySaved(journalId, memoryId) {
    var list = await loadJournals();
    var idx = list.findIndex(function(item) { return item && item.id === journalId; });
    if (idx < 0) return null;
    list[idx] = Object.assign({}, list[idx], { memoryId: Number(memoryId) || null });
    await dbWriteConfig(KEYS.JOURNALS, list);
    return list[idx];
  }

  async function deleteJournalEntry(journalId) {
    var list = await loadJournals();
    var next = list.filter(function(item) { return item && item.id !== journalId; });
    await dbWriteConfig(KEYS.JOURNALS, next);
    return next;
  }

  global.HeartbeatLiveStorage = {
    CONFIG_PREFIX: CONFIG_PREFIX,
    LOCAL_PREFIX: LOCAL_PREFIX,
    KEYS: KEYS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    MAX_IMAGE_BYTES: MAX_IMAGE_BYTES,
    MAX_AUDIO_BYTES: MAX_AUDIO_BYTES,
    MAX_TOTAL_AUDIO_BYTES: MAX_TOTAL_AUDIO_BYTES,
    isHttpsUrl: isHttpsUrl,
    normalizeSettings: normalizeSettings,
    normalizePortraitOption: normalizePortraitOption,
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
    listAsmrTracks: listAsmrTracks,
    addAsmrTrack: addAsmrTrack,
    renameAsmrTrack: renameAsmrTrack,
    deleteAsmrTrack: deleteAsmrTrack,
    getAsmrTrackPlayUrl: getAsmrTrackPlayUrl,
    loadFollowedChars: loadFollowedChars,
    toggleFollowChar: toggleFollowChar,
    loadCharVoices: loadCharVoices,
    saveCharVoiceId: saveCharVoiceId,
    loadJournals: loadJournals,
    addJournalEntry: addJournalEntry,
    markJournalMemorySaved: markJournalMemorySaved,
    deleteJournalEntry: deleteJournalEntry,
    revokeAllObjectUrls: revokeAllObjectUrls,
    revokeCachedUrl: revokeCachedUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);
