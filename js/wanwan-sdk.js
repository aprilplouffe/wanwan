/**
 * wanwan-sdk.js — 小手机开放应用平台官方 SDK (WanWan Phone SDK)
 * 版本: 1.2.0
 * 兼容小手机主系统，支持在沙盒 iframe 及独立环境中运行
 */
(function(global) {
  'use strict';

  var SDK_VERSION = '1.2.0';
  var _listeners = {};
  var _readyCallbacks = [];
  var _isReady = false;

  // 获取当前宿主环境
  var inIframe = (function() {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  })();

  // 跨环境 postMessage 通信包装
  function postToHost(action, payload) {
    var msg = {
      source: 'WANWAN_APP_SDK',
      version: SDK_VERSION,
      action: action,
      payload: payload || {}
    };
    if (inIframe && window.parent) {
      window.parent.postMessage(msg, '*');
    } else if (window.WanWanHostBridge && typeof window.WanWanHostBridge.handleAction === 'function') {
      window.WanWanHostBridge.handleAction(action, payload);
    }
  }

  // 接收宿主发来的消息
  window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data || data.source !== 'WANWAN_HOST_SYSTEM') return;
    var action = data.action;
    var payload = data.payload;

    if (_listeners[action]) {
      _listeners[action].forEach(function(cb) {
        try { cb(payload); } catch (err) { console.error('[WanWanSDK Callback Error]', err); }
      });
    }
  });

  // 内部沙盒命名空间本地存储
  var StorageManager = {
    _getPrefix: function() {
      var appId = (window.__WANWAN_APP_INFO__ && window.__WANWAN_APP_INFO__.id) || 'default_app';
      return 'ww_app_' + appId + '_';
    },
    get: function(key, defaultValue) {
      try {
        var raw = localStorage.getItem(this._getPrefix() + key);
        if (raw === null || raw === undefined) return defaultValue;
        return JSON.parse(raw);
      } catch (e) {
        return defaultValue;
      }
    },
    set: function(key, value) {
      try {
        localStorage.setItem(this._getPrefix() + key, JSON.stringify(value));
        postToHost('storage_change', { key: key, value: value });
        return true;
      } catch (e) {
        console.warn('[WanWanSDK Storage Error]', e);
        return false;
      }
    },
    remove: function(key) {
      try {
        localStorage.removeItem(this._getPrefix() + key);
        return true;
      } catch (e) {
        return false;
      }
    },
    clear: function() {
      try {
        var prefix = this._getPrefix();
        var keysToRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(prefix) === 0) keysToRemove.push(k);
        }
        keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  // 核心 SDK 对象
  var WanWanSDK = {
    version: SDK_VERSION,

    /**
     * 注册 SDK 初始化完成回调
     */
    ready: function(callback) {
      if (typeof callback !== 'function') return;
      if (_isReady) {
        setTimeout(callback, 0);
      } else {
        _readyCallbacks.push(callback);
      }
    },

    /**
     * 获取当前小手机主人信息
     */
    getUserInfo: function() {
      if (window.__WANWAN_HOST_USER__) {
        return Object.assign({}, window.__WANWAN_HOST_USER__);
      }
      return {
        id: 'user',
        name: '我',
        avatar: 'img/ava-00.jpg',
        role: 'user'
      };
    },

    /**
     * 获取当前选定绑定的伴侣角色信息
     */
    getCurrentCharacter: function() {
      if (window.__WANWAN_CURRENT_CHAR__) {
        return Object.assign({}, window.__WANWAN_CURRENT_CHAR__);
      }
      return {
        id: 1,
        name: '沈星回',
        avatar: 'img/char-default.jpg',
        signature: '光芒穿过夜空，落向你的身边。',
        personality: '温柔、坚定、专注'
      };
    },

    /**
     * 存储管理器
     */
    storage: StorageManager,

    /**
     * 显示顶部 Toast 提示
     */
    showToast: function(message, type) {
      postToHost('toast', { message: String(message || ''), type: type || 'info' });
      // 如果没有在宿主内运行，控制台输出兜底
      if (!inIframe && typeof window.showToast === 'function') {
        window.showToast(message);
      }
    },

    /**
     * 请求关闭当前应用，返回桌面
     */
    closeApp: function() {
      postToHost('close_app', {});
    },

    /**
     * 请求打开小手机内的其他应用 (如 wechat, music, loveDiary)
     */
    openApp: function(appId, extraData) {
      postToHost('open_app', { appId: appId, extra: extraData });
    },

    /**
     * 发送微信伴侣消息互动
     */
    sendWechatMessage: function(content, role) {
      postToHost('send_wechat_message', {
        content: content,
        role: role || 'user'
      });
    },

    /**
     * 触发触感震动反馈
     */
    vibrate: function(pattern) {
      if (navigator.vibrate) {
        try { navigator.vibrate(pattern || 40); } catch (_) {}
      }
      postToHost('vibrate', { pattern: pattern || 40 });
    },

    /**
     * 播放音效
     */
    playAudio: function(url) {
      if (!url) return;
      try {
        var audio = new Audio(url);
        audio.play().catch(function() {});
      } catch (e) {
        postToHost('play_audio', { url: url });
      }
    },

    /**
     * 监听系统事件 (如 theme_change, character_change)
     */
    on: function(event, callback) {
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(callback);
    },

    /**
     * 移除系统事件监听
     */
    off: function(event, callback) {
      if (!_listeners[event]) return;
      _listeners[event] = _listeners[event].filter(function(cb) { return cb !== callback; });
    }
  };

  // 告知宿主 SDK 已加载
  setTimeout(function() {
    _isReady = true;
    _readyCallbacks.forEach(function(cb) {
      try { cb(); } catch (e) { console.error(e); }
    });
    _readyCallbacks = [];
    postToHost('sdk_ready', { version: SDK_VERSION });
  }, 10);

  global.WanWanSDK = WanWanSDK;

})(typeof window !== 'undefined' ? window : this);
