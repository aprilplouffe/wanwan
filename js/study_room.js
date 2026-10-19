// study-room.js — 陪伴自习室 MVP 核心业务逻辑 (阶段 3 高保真完备版)
// 包含自习大厅、双人专注、资料库、学习助手、智能题库、错题本、学习报告、设置八大页面与三大陪伴模式

(function() {
  'use strict';

  var STORAGE_KEYS = {
    STATE: 'wanwan_study_state',
    SETTINGS: 'wanwan_study_settings',
    STANDEES: 'wanwan_study_char_standees',
    RECORDS: 'wanwan_study_records',
    TODOS: 'wanwan_study_todos',
    RESOURCES: 'wanwan_study_resources',
    MISTAKES: 'wanwan_study_mistakes',
    ASSISTANT_MSGS: 'wanwan_study_assistant_msgs',
    PROMPT_PROFILES: 'wanwan_study_prompt_profiles'
  };

  // 预置场景
  var PRESET_SCENES = {
    library: {
      id: 'library',
      name: '午后图书馆',
      desc: '木质书架与午后阳光的温润交织',
      bg: 'linear-gradient(135deg, #2b1f1d 0%, #4a3429 50%, #1f1815 100%)'
    },
    study: {
      id: 'study',
      name: '温暖书房',
      desc: '案前台灯晕染，窗外微风拂绿植',
      bg: 'linear-gradient(135deg, #1f2723 0%, #2f3e37 50%, #151c19 100%)'
    },
    midnight: {
      id: 'midnight',
      name: '深夜自习室',
      desc: '静谧星河与城市不眠的璀璨灯火',
      bg: 'linear-gradient(135deg, #0d1322 0%, #1e293b 50%, #0a0e17 100%)'
    },
    cafe: {
      id: 'cafe',
      name: '雨天咖啡馆',
      desc: '玻璃窗上的雨滴与醇厚咖啡香气',
      bg: 'linear-gradient(135deg, #281e18 0%, #3e3027 50%, #1c1511 100%)'
    },
    sakura: {
      id: 'sakura',
      name: '樱花窗台',
      desc: '落樱飞舞与清爽初春微风相伴',
      bg: 'linear-gradient(135deg, #2d1b28 0%, #442a3e 50%, #1c1019 100%)'
    }
  };

  // 默认唯美自习伴读背景图（直接撑满上方整块区域）
  var FALLBACK_SCENE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500' viewBox='0 0 400 500'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%231e1b4b'/%3E%3Cstop offset='50%25' stop-color='%23312e81'/%3E%3Cstop offset='100%25' stop-color='%230f172a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='500' fill='url(%23bg)'/%3E%3Ccircle cx='200' cy='200' r='70' fill='%236366f1' opacity='0.3'/%3E%3Ccircle cx='200' cy='180' r='50' fill='%23ffffff' opacity='0.9'/%3E%3Cpath d='M130,320 Q200,240 270,320' fill='%23ffffff' opacity='0.9'/%3E%3Ctext x='200' y='360' font-size='16' text-anchor='middle' fill='%23ffffff' font-weight='bold'%3EChar 伴读全景%3C/text%3E%3Ctext x='200' y='385' font-size='11' text-anchor='middle' fill='%23a5b4fc'%3E（已铺满覆盖上方整块背景）%3C/text%3E%3C/svg%3E";


  // 智能题库初始题库
  var DEFAULT_QUIZ_QUESTIONS = [];

  // 初始资料库数据
  var DEFAULT_RESOURCES = [];

  // 初始今日待办
  var DEFAULT_TODOS = [];

  // 全局运行时状态
  var _state = {
    activeTab: 'duo', // 'hall' | 'duo' | 'resources' | 'assistant' | 'quiz' | 'mistakes' | 'report' | 'settings'
    studyMode: 'gentle', // 'quiet' (安静陪伴) | 'gentle' (温柔鼓励) | 'interactive' (互动学习)
    modePreferences: {
      quiet: { allowUserAsk: true },
      gentle: { breakEncourage: true, waterReminder: true },
      interactive: { questionIntervalMinutes: 25, questionTiming: 'break' } // 'break' | 'during'
    },
    timerType: 'pomodoro', // 'pomodoro' | 'stopwatch' | 'countdown'
    timerStatus: 'idle', // 'idle' | 'running' | 'paused'
    timerPhase: 'focus', // 'focus' | 'break' | 'long_break'
    taskType: '学习', // '学习' | '工作' | '阅读' | '写作'
    taskName: '自主深度专注',
    // 计时时间戳核心
    targetDurationSec: 25 * 60,
    remainingSec: 25 * 60,
    elapsedSec: 0,
    startTimestamp: 0,
    accumulatedSecBeforeResume: 0,
    lastActiveTimestamp: Date.now(),
    pomodorosToday: 0,
    totalMinutesToday: 0,
    streakDays: 0,
    // 角色与立绘
    companionChar: null,
    charStandees: {}, // { [charId]: { focus: '', smile: '', rest: '', scale: 100, offsetX: 0, offsetY: 0 } }
    currentStandeeState: 'focus', // 'focus' | 'smile' | 'rest'
    actorSpeech: '',
    actorSpeechTimeout: null,
    // 场景背景
    currentSceneId: 'study',
    customBgUrl: '',
    // 数据持久化池
    todos: [],
    resources: [],
    mistakes: [],
    assistantMessages: [],
    records: [],
    // 阶段4：学习资料与 AI 引擎配置
    assistantMode: 'char', // 'char' | 'professional'
    docFilter: '',
    chapterFilter: '',
    allowGeneralKnowledge: false,
    quizMode: 'self', // 'self' | 'examiner'
    activeQuizList: [],
    examinerCurrentIndex: 0,
    examinerUserAnswer: '',
    examinerFeedback: null
  };

  var _timerInterval = null;

  // 工具函数

  function getCharTypeLabel(type) {
    if (type === 'npc') return 'NPC 配角';
    if (type === 'user') return 'USER 用户';
    return 'CHAR 主角';
  }
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
    return 'sr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function formatTimeDisplay(totalSeconds) {
    var s = Math.max(0, Math.floor(totalSeconds));
    var m = Math.floor(s / 60);
    var remS = s % 60;
    var pad = function(n) { return n < 10 ? '0' + n : n; };
    return pad(m) + ':' + pad(remS);
  }

  // 持久化助手
  async function loadStorage(key, fallback) {
    try {
      if (window.db && db.config) {
        var row = await db.config.get(key);
        if (row && row.value !== undefined) return row.value;
      }
    } catch (e) {}
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
    } catch (e) {}
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  // 加载当前伴侣角色档案（支持按指定或保存的角色 ID 载入）
  async function loadCompanionChar(targetCharId) {
    try {
      if (window.db && db.characters) {
        var all = await db.characters.toArray();
        var main = null;
        if (targetCharId) {
          main = all.find(function(c) { return String(c.id) === String(targetCharId); });
        }
        if (!main) {
          main = all.find(function(c) { return c.type === 'char' || c.isCompanion; }) || all[0];
        }
        if (main) {
          _state.companionChar = {
            id: main.id,
            name: main.name || '林弯弯',
            avatar: main.avatar || 'img/wanwan.png',
            personality: main.personality || main.bio || '温柔体贴、善解人意，专注时默默守护，休息时悉心关怀',
            lorebook: main.lorebook || '弯弯手机伴侣',
            type: main.type || 'char'
          };
          return;
        }
      }
    } catch (e) {}
    _state.companionChar = {
      id: 'char_default',
      name: '林弯弯',
      avatar: 'img/wanwan.png',
      personality: '温柔体贴、善解人意，专注时默默守护，休息时悉心关怀',
      lorebook: '弯弯手机伴侣',
      type: 'char'
    };
  }

  // 切换自习同桌伴侣角色（自习室设置专属）
  function switchCompanionChar(character, container) {
    if (!character) return;
    _state.companionChar = {
      id: character.id,
      name: character.name || '未命名角色',
      avatar: character.avatar || 'img/wanwan.png',
      personality: character.personality || character.bio || '温柔体贴、善解人意，专注时默默守护，休息时悉心关怀',
      lorebook: character.lorebook || '',
      type: character.type || 'char'
    };
    saveAllSettings();

    // 更新设置页当前同桌信息展示
    if (container) {
      var av = container.querySelector('#sr-set-companion-avatar');
      if (av) av.src = _state.companionChar.avatar || 'img/wanwan.png';
      var nm = container.querySelector('#sr-set-companion-name');
      if (nm) nm.textContent = _state.companionChar.name;
      var tp = container.querySelector('#sr-set-companion-type');
      if (tp) tp.textContent = getCharTypeLabel(_state.companionChar.type);
      var stDesc = container.querySelector('#sr-set-standee-desc');
      if (stDesc) stDesc.textContent = '当前针对：' + _state.companionChar.name + ' · 自定义立绘与微调';

      // 实时更新双人舞台
      updateDuoControls(container);
    }

    _state.actorSpeech = '';
    window.toast && window.toast('自习陪伴对象已切换为「' + _state.companionChar.name + '」');
  }

  // 初始化持久化数据
  async function initStudyState() {
    var savedSettings = await loadStorage(STORAGE_KEYS.SETTINGS, null);
    var savedCharId = savedSettings ? savedSettings.companionCharId : null;
    await loadCompanionChar(savedCharId);
    if (savedSettings) {
      if (savedSettings.studyMode) _state.studyMode = savedSettings.studyMode;
      if (savedSettings.modePreferences) _state.modePreferences = Object.assign(_state.modePreferences, savedSettings.modePreferences);
      if (savedSettings.currentSceneId) _state.currentSceneId = savedSettings.currentSceneId;
      if (savedSettings.customBgUrl) _state.customBgUrl = savedSettings.customBgUrl;
      if (savedSettings.taskType) _state.taskType = savedSettings.taskType;
      if (savedSettings.taskName) _state.taskName = savedSettings.taskName;
    }

    var savedStandees = await loadStorage(STORAGE_KEYS.STANDEES, {});
    _state.charStandees = savedStandees || {};

    // 自动清理历史预置的 mock 数据（待办/资料/旧预置教材），保证纯净空白
    var CLEANUP_MOCK_FLAG = 'wanwan_study_mock_cleaned_v3';
    var hasCleanedMocks = await loadStorage(CLEANUP_MOCK_FLAG, false);
    if (!hasCleanedMocks) {
      var curDocs = await loadStorage('wanwan_study_documents_v2', []);
      if (Array.isArray(curDocs)) {
        var cleanDocs = curDocs.filter(function(d) {
          return d && d.id !== 'doc_core_1' && d.id !== 'doc_core_2';
        });
        await saveStorage('wanwan_study_documents_v2', cleanDocs);
        if (window.StudySearchIndex) {
          window.StudySearchIndex.documents = cleanDocs;
          window.StudySearchIndex.rebuildIndex();
        }
      }
      var curTodos = await loadStorage(STORAGE_KEYS.TODOS, []);
      if (Array.isArray(curTodos)) {
        var cleanTodos = curTodos.filter(function(t) {
          return t && t.id !== 'todo_1' && t.id !== 'todo_2' && t.id !== 'todo_3';
        });
        await saveStorage(STORAGE_KEYS.TODOS, cleanTodos);
      }
      var curRes = await loadStorage(STORAGE_KEYS.RESOURCES, []);
      if (Array.isArray(curRes)) {
        var cleanRes = curRes.filter(function(r) {
          return r && r.id !== 'res_1' && r.id !== 'res_2' && r.id !== 'res_3';
        });
        await saveStorage(STORAGE_KEYS.RESOURCES, cleanRes);
      }
      await saveStorage(CLEANUP_MOCK_FLAG, true);
    }

    var savedTodos = await loadStorage(STORAGE_KEYS.TODOS, null);
    _state.todos = Array.isArray(savedTodos) ? savedTodos.filter(function(t) { return t && t.id !== 'todo_1' && t.id !== 'todo_2' && t.id !== 'todo_3'; }) : [];

    var savedResources = await loadStorage(STORAGE_KEYS.RESOURCES, null);
    _state.resources = Array.isArray(savedResources) ? savedResources.filter(function(r) { return r && r.id !== 'res_1' && r.id !== 'res_2' && r.id !== 'res_3'; }) : [];

    var savedMistakes = await loadStorage(STORAGE_KEYS.MISTAKES, []);
    _state.mistakes = Array.isArray(savedMistakes) ? savedMistakes : [];

    var savedRecords = await loadStorage(STORAGE_KEYS.RECORDS, []);
    _state.records = Array.isArray(savedRecords) ? savedRecords : [];

    // 动态计算真实的今日专注分钟数与完成番茄数
    var todayStr = new Date().toISOString().slice(0, 10);
    var todayRecords = _state.records.filter(function(r) {
      return r && r.date && r.date.slice(0, 10) === todayStr;
    });

    _state.pomodorosToday = todayRecords.length;
    _state.totalMinutesToday = todayRecords.reduce(function(sum, r) {
      return sum + (Number(r.durationMinutes) || 0);
    }, 0);

    // 动态计算真实连续打卡天数
    var daySet = new Set();
    _state.records.forEach(function(r) {
      if (r && r.date) daySet.add(r.date.slice(0, 10));
    });
    var streak = 0;
    var checkDate = new Date();
    var checkDateStr = checkDate.toISOString().slice(0, 10);
    if (!daySet.has(checkDateStr)) {
      checkDate.setDate(checkDate.getDate() - 1);
      checkDateStr = checkDate.toISOString().slice(0, 10);
    }
    while (daySet.has(checkDateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
      checkDateStr = checkDate.toISOString().slice(0, 10);
    }
    _state.streakDays = streak;

    var savedMsgs = await loadStorage(STORAGE_KEYS.ASSISTANT_MSGS, null);
    if (Array.isArray(savedMsgs) && savedMsgs.length) {
      _state.assistantMessages = savedMsgs;
    } else {
      _state.assistantMessages = [
        {
          sender: 'char',
          text: '你好呀！我是你的专属自习搭子 ' + _state.companionChar.name + '。今天想先攻克哪个学习难点呢？随时可以让我出题抽查或者制定计划哦～',
          time: Date.now()
        }
      ];
    }

    // 恢复计时器状态，杜绝后台错乱
    var savedTimer = await loadStorage(STORAGE_KEYS.STATE, null);
    if (savedTimer && typeof savedTimer === 'object') {
      _state.timerType = savedTimer.timerType || 'pomodoro';
      _state.timerStatus = savedTimer.timerStatus || 'idle';
      _state.timerPhase = savedTimer.timerPhase || 'focus';
      _state.targetDurationSec = savedTimer.targetDurationSec || (25 * 60);
      _state.remainingSec = savedTimer.remainingSec !== undefined ? savedTimer.remainingSec : (25 * 60);
      _state.elapsedSec = savedTimer.elapsedSec || 0;
      _state.accumulatedSecBeforeResume = savedTimer.accumulatedSecBeforeResume || 0;
      _state.startTimestamp = savedTimer.startTimestamp || 0;
      _state.lastActiveTimestamp = savedTimer.lastActiveTimestamp || Date.now();

      // 如果之前是运行状态，用真实经过的时间戳进行平滑补偿
      if (_state.timerStatus === 'running' && _state.startTimestamp > 0) {
        var elapsedSinceStart = Math.floor((Date.now() - _state.startTimestamp) / 1000) + _state.accumulatedSecBeforeResume;
        if (_state.timerType === 'pomodoro' || _state.timerType === 'countdown') {
          if (elapsedSinceStart >= _state.targetDurationSec) {
            // 在后台已经完成了一个番茄钟
            _state.remainingSec = 0;
            _state.timerStatus = 'idle';
            completeFocusSession(true);
          } else {
            _state.remainingSec = Math.max(0, _state.targetDurationSec - elapsedSinceStart);
          }
        } else if (_state.timerType === 'stopwatch') {
          _state.elapsedSec = elapsedSinceStart;
        }
      }
    }
  }

  function saveCurrentTimerState() {
    saveStorage(STORAGE_KEYS.STATE, {
      timerType: _state.timerType,
      timerStatus: _state.timerStatus,
      timerPhase: _state.timerPhase,
      targetDurationSec: _state.targetDurationSec,
      remainingSec: _state.remainingSec,
      elapsedSec: _state.elapsedSec,
      accumulatedSecBeforeResume: _state.accumulatedSecBeforeResume,
      startTimestamp: _state.startTimestamp,
      lastActiveTimestamp: Date.now()
    });
  }

  function saveAllSettings() {
    saveStorage(STORAGE_KEYS.SETTINGS, {
      studyMode: _state.studyMode,
      modePreferences: _state.modePreferences,
      currentSceneId: _state.currentSceneId,
      customBgUrl: _state.customBgUrl,
      taskType: _state.taskType,
      taskName: _state.taskName,
      companionCharId: _state.companionChar ? _state.companionChar.id : null
    });
  }

  // 获取当前角色的立绘配置（含多状态与缩放偏移）
  function getCurrentCharStandeeConfig() {
    var cid = _state.companionChar ? _state.companionChar.id : 'char_default';
    if (!_state.charStandees[cid]) {
      _state.charStandees[cid] = {
        focus: '',
        smile: '',
        rest: '',
        displayMode: 'contain', // 'cover' (填满场景) | 'contain' (等比立绘；默认，避免宽屏异常放大)
        scale: 100,
        offsetX: 0,
        offsetY: 0
      };
    }
    if (!_state.charStandees[cid].displayMode) {
      _state.charStandees[cid].displayMode = 'contain';
    }
    return _state.charStandees[cid];
  }

  function getActiveStandeeImg() {
    var conf = getCurrentCharStandeeConfig();
    var st = _state.currentStandeeState;
    if (conf[st]) return conf[st];
    if (conf.focus) return conf.focus;
    if (conf.smile) return conf.smile;
    if (conf.rest) return conf.rest;
    return (_state.companionChar && _state.companionChar.avatar) || FALLBACK_SCENE;
  }

  // ====================================================
  // 核心：基于三种模式的性格约束伴读语音
  // ====================================================
  function triggerCharReaction(actionType, extraContext) {
    var char = _state.companionChar || { name: '林弯弯', personality: '' };
    var mode = _state.studyMode; // 'quiet' | 'gentle' | 'interactive'

    // 关键约束检查：在安静陪伴模式下，Char 绝不主动打断！
    if (mode === 'quiet' && actionType !== 'user_tap_char') {
      return;
    }

    var text = '';
    if (actionType === 'user_tap_char') {
      if (mode === 'quiet') {
        text = '嘘~ 专心自习哦，我一直静静坐在你身边守护着你呢。';
      } else if (mode === 'gentle') {
        text = '累了吗？深呼吸一口气，我就在旁边陪你，我们一起加油！';
      } else {
        text = '有遇到不懂的知识点吗？随时点「学习助手」向我提问哦～';
      }
    } else if (actionType === 'break_start') {
      if (mode === 'gentle') {
        text = '25分钟专注顺利达成！太厉害啦，快站起来喝口温水、活动一下肩颈吧～ ❤️';
      } else if (mode === 'interactive') {
        text = '专注时间到！休息 5 分钟，顺便敢不敢接受我的一道小抽查？';
      }
    } else if (actionType === 'focus_start') {
      if (mode === 'gentle') {
        text = '新的专注周期开始啦，将杂念抛开，进入我们的宁静心流时刻吧～';
      } else if (mode === 'interactive') {
        text = '开始自习！遇到疑难尽管找我，稍后我会抽查你哦～';
      }
    }

    if (text) {
      showCharBubble(text);
    }
  }

  function showCharBubble(text) {
    _state.actorSpeech = text;
    var bubble = document.getElementById('sr-actor-bubble');
    if (bubble) {
      bubble.textContent = text;
      bubble.style.display = 'block';
      clearTimeout(_state.actorSpeechTimeout);
      _state.actorSpeechTimeout = setTimeout(function() {
        if (bubble) bubble.style.display = 'none';
      }, 6500);
    }
  }

  // ====================================================
  // 计时器核心业务（杜绝后台切回错乱）
  // ====================================================
  function startOrResumeTimer(container) {
    if (_state.timerStatus === 'running') return;

    _state.timerStatus = 'running';
    _state.startTimestamp = Date.now();
    _state.lastActiveTimestamp = Date.now();
    _state.currentStandeeState = 'focus';

    saveCurrentTimerState();
    triggerCharReaction('focus_start');
    runTimerLoop(container);
    updateDuoControls(container);
  }

  function pauseTimer(container) {
    if (_state.timerStatus !== 'running') return;

    // 记录已经消耗的秒数
    var currentElapsed = Math.floor((Date.now() - _state.startTimestamp) / 1000);
    _state.accumulatedSecBeforeResume += currentElapsed;
    _state.timerStatus = 'paused';
    _state.currentStandeeState = 'smile';

    clearInterval(_timerInterval);
    _timerInterval = null;

    saveCurrentTimerState();
    updateDuoControls(container);
    window.toast && window.toast('计时已暂停');
  }

  function resetTimer(container) {
    clearInterval(_timerInterval);
    _timerInterval = null;

    _state.timerStatus = 'idle';
    _state.timerPhase = 'focus';
    _state.accumulatedSecBeforeResume = 0;
    _state.startTimestamp = 0;
    _state.elapsedSec = 0;
    _state.remainingSec = _state.targetDurationSec;
    _state.currentStandeeState = 'focus';

    saveCurrentTimerState();
    updateDuoControls(container);
    window.toast && window.toast('计时器已重置');
  }

  function runTimerLoop(container) {
    if (_timerInterval) clearInterval(_timerInterval);

    _timerInterval = setInterval(function() {
      if (_state.timerStatus !== 'running') {
        clearInterval(_timerInterval);
        return;
      }

      var now = Date.now();
      var elapsedSinceStart = Math.floor((now - _state.startTimestamp) / 1000) + _state.accumulatedSecBeforeResume;

      if (_state.timerType === 'pomodoro' || _state.timerType === 'countdown') {
        var rem = Math.max(0, _state.targetDurationSec - elapsedSinceStart);
        _state.remainingSec = rem;

        if (rem <= 0) {
          clearInterval(_timerInterval);
          _timerInterval = null;
          completeFocusSession(false, container);
        }
      } else if (_state.timerType === 'stopwatch') {
        _state.elapsedSec = elapsedSinceStart;
      }

      updateTimerDisplay(container);
    }, 1000);
  }

  function completeFocusSession(fromBackground, container) {
    _state.timerStatus = 'idle';
    var durationMinutes = Math.round(_state.targetDurationSec / 60);

    _state.pomodorosToday++;
    _state.totalMinutesToday += durationMinutes;
    _state.currentStandeeState = 'rest';

    // 记入专注记录池
    _state.records.unshift({
      id: uid(),
      date: new Date().toISOString(),
      type: _state.taskType,
      name: _state.taskName,
      durationMinutes: durationMinutes,
      mode: _state.studyMode
    });
    saveStorage(STORAGE_KEYS.RECORDS, _state.records);

    // 自动流转至休息阶段
    _state.timerPhase = 'break';
    _state.targetDurationSec = 5 * 60;
    _state.remainingSec = 5 * 60;
    _state.accumulatedSecBeforeResume = 0;
    _state.startTimestamp = 0;

    saveCurrentTimerState();

    if (container) {
      updateDuoControls(container);
    }

    triggerCharReaction('break_start');

    if (fromBackground) {
      window.toast && window.toast('🎉 专注在后台顺利完成！已为你自动记录并切换至休息时刻。');
    } else {
      window.toast && window.toast('🎉 番茄钟达成！太棒啦，休息 5 分钟吧~');
    }
  }

  function updateTimerDisplay(container) {
    if (!container) return;
    var displayEl = container.querySelector('#sr-timer-val');
    if (!displayEl) return;

    if (_state.timerType === 'stopwatch') {
      displayEl.textContent = formatTimeDisplay(_state.elapsedSec);
    } else {
      displayEl.textContent = formatTimeDisplay(_state.remainingSec);
    }
  }

  function updateDuoControls(container) {
    if (!container) return;
    updateTimerDisplay(container);

    var playBtn = container.querySelector('#sr-timer-play-btn');
    if (playBtn) {
      if (_state.timerStatus === 'running') {
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        playBtn.title = '暂停专注';
      } else {
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        playBtn.title = '开始专注';
      }
    }

    var statusHint = container.querySelector('#sr-timer-status-hint');
    if (statusHint) {
      if (_state.timerPhase === 'break') {
        statusHint.innerHTML = '<i class="fa-solid fa-mug-hot" style="color:#60a5fa;"></i> 休息时间中 · 远眺窗外放松';
      } else if (_state.timerStatus === 'running') {
        statusHint.innerHTML = '<i class="fa-solid fa-feather-pointed" style="color:#22c55e;"></i> 深度专注中 · 与角色同屏共读';
      } else if (_state.timerStatus === 'paused') {
        statusHint.innerHTML = '<i class="fa-solid fa-pause" style="color:#f59e0b;"></i> 计时暂停中 · 点击继续';
      } else {
        statusHint.innerHTML = '<i class="fa-solid fa-circle-check"></i> 准备就绪 · 点击开始';
      }
    }

    // 更新立绘与同桌名称（支持铺满覆盖上面一整块背景）
    var standeeImg = container.querySelector('#sr-standee-img');
    if (standeeImg) {
      standeeImg.src = getActiveStandeeImg();
      var conf = getCurrentCharStandeeConfig();
      if (conf.displayMode === 'contain') {
        standeeImg.classList.add('fit-contain');
      } else {
        standeeImg.classList.remove('fit-contain');
      }
      standeeImg.style.transform = 'translate(' + (conf.offsetX || 0) + 'px, ' + (conf.offsetY || 0) + 'px) scale(' + ((conf.scale || 100) / 100) + ')';
    }

    var standeeBox = container.querySelector('#sr-standee-box');
    if (standeeBox && _state.companionChar) {
      standeeBox.title = '点击与 ' + esc(_state.companionChar.name) + ' 互动';
    }

    var nameTag = container.querySelector('#sr-actor-name-tag');
    if (nameTag && _state.companionChar) {
      nameTag.innerHTML = '<i class="fa-solid fa-heart" style="font-size:9px;color:#f43f5e;"></i> ' + esc(_state.companionChar.name);
    }
  }

  // ====================================================
  // 页面入口与主容器构建
  // ====================================================
  window.showStudyRoomPage = async function() {
    var existing = document.getElementById('study-room-page');
    if (existing) existing.remove();

    await initStudyState();

    var page = document.createElement('div');
    page.id = 'study-room-page';
    page.className = 'full-page';

    renderStudyRoomShell(page);

    if (window.openPage) {
      window.openPage(page);
    } else {
      (document.getElementById('app') || document.body).appendChild(page);
    }

    renderActiveTabPage(page);
  };

  window.showStudyRoomApp = window.showStudyRoomPage;

  function renderStudyRoomShell(container) {
    container.innerHTML =
      // 顶部应用条
      '<div class="sr-header">' +
        '<div class="sr-header-left">' +
          '<button type="button" class="sr-back-btn" id="sr-btn-back">' +
            '<i class="fa fa-angle-left"></i><span>桌面</span>' +
          '</button>' +
          '<div class="sr-title-group">' +
            '<div class="sr-icon-mini"><i class="fa-solid fa-hourglass-half"></i></div>' +
            '<div class="sr-header-title">陪伴自习室</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<button type="button" class="pl-btn-secondary" id="sr-quick-mode-badge" style="padding:3px 10px;font-size:11px;">' +
            getModeLabelHtml(_state.studyMode) +
          '</button>' +
        '</div>' +
      '</div>' +

      // 核心视口
      '<div class="sr-content-viewport" id="sr-viewport"></div>' +

      // 底部固定四入口：大厅 / 双人专注 / 资料库 / 全部
      '<nav class="sr-bottom-nav" id="sr-bottom-nav" aria-label="陪伴自习室主导航">' +
        '<button type="button" class="sr-bottom-nav-item" data-tab="hall"><i class="fa-solid fa-house"></i><span>首页</span></button>' +
        '<button type="button" class="sr-bottom-nav-item" data-tab="duo"><i class="fa-solid fa-user-group"></i><span>双人专注</span></button>' +
        '<button type="button" class="sr-bottom-nav-item" data-tab="resources"><i class="fa-solid fa-book-bookmark"></i><span>资料库</span></button>' +
        '<button type="button" class="sr-bottom-nav-item" id="sr-open-all-drawer"><i class="fa-solid fa-grip"></i><span>全部</span></button>' +
      '</nav>' +

      // 全部功能抽屉挂载点
      '<div id="sr-drawer-root"></div>' +

      // 弹窗挂载点
      '<div id="sr-modal-root"></div>';

    // 绑定返回桌面
    container.querySelector('#sr-btn-back').onclick = function() {
      if (window.closePage) {
        window.closePage('study-room-page');
      } else {
        container.remove();
      }
    };

    // 绑定底部固定导航
    container.querySelectorAll('.sr-bottom-nav-item[data-tab]').forEach(function(item) {
      item.onclick = function() {
        switchTab(container, item.getAttribute('data-tab'));
      };
    });

    var allDrawerBtn = container.querySelector('#sr-open-all-drawer');
    if (allDrawerBtn) {
      allDrawerBtn.onclick = function() {
        openAllFeaturesDrawer(container);
      };
    }
    updateBottomNavState(container);

    container.querySelector('#sr-quick-mode-badge').onclick = function() {
      cycleStudyMode(container);
    };
  }

  function getModeLabelHtml(mode) {
    if (mode === 'quiet') return '<i class="fa-solid fa-volume-xmark" style="color:#60a5fa;"></i> 安静陪伴';
    if (mode === 'gentle') return '<i class="fa-solid fa-heart" style="color:#ec4899;"></i> 温柔鼓励';
    return '<i class="fa-solid fa-comments" style="color:#f59e0b;"></i> 互动学习';
  }

  // 模式自由切换，绝不重置计时器！
  function cycleStudyMode(container, targetMode) {
    var modes = ['quiet', 'gentle', 'interactive'];
    if (targetMode && modes.indexOf(targetMode) >= 0) {
      _state.studyMode = targetMode;
    } else {
      var nextIdx = (modes.indexOf(_state.studyMode) + 1) % modes.length;
      _state.studyMode = modes[nextIdx];
    }
    saveAllSettings();

    var badge = container.querySelector('#sr-quick-mode-badge');
    if (badge) badge.innerHTML = getModeLabelHtml(_state.studyMode);

    var modeBtns = container.querySelectorAll('.sr-mode-opt-btn');
    modeBtns.forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === _state.studyMode);
    });

    window.toast && window.toast('已切换为模式：「' + (_state.studyMode === 'quiet' ? '安静陪伴' : (_state.studyMode === 'gentle' ? '温柔鼓励' : '互动学习')) + '」，计时不受影响');
  }

  function renderActiveTabPage(container) {
    var viewport = container.querySelector('#sr-viewport');
    if (!viewport) return;
    updateBottomNavState(container);
    viewport.innerHTML = '';

    switch (_state.activeTab) {
      case 'hall':
        renderHallPage(container, viewport);
        break;
      case 'duo':
        renderDuoStagePage(container, viewport);
        break;
      case 'resources':
        renderResourcesPage(container, viewport);
        break;
      case 'assistant':
        renderAssistantPage(container, viewport);
        break;
      case 'quiz':
        renderQuizPage(container, viewport);
        break;
      case 'mistakes':
        renderMistakesPage(container, viewport);
        break;
      case 'report':
        renderReportPage(container, viewport);
        break;
      case 'settings':
        renderSettingsPage(container, viewport);
        break;
      default:
        renderDuoStagePage(container, viewport);
    }
  }

  // ====================================================
  // 1. 自习大厅 (Hall)
  // ====================================================
  function renderHallPage(container, viewport) {
    var hallEl = document.createElement('div');
    hallEl.className = 'sr-hall-container';

    var char = _state.companionChar || { name: '林弯弯' };

    hallEl.innerHTML =
      // 头部沉浸展板
      '<div class="sr-hall-hero">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="font-size:12px;color:var(--c-sub);"><i class="fa-solid fa-building"></i> 今日沉浸自习室</div>' +
          '<span class="sr-tag" style="font-size:10px;padding:2px 8px;border-radius:100px;background:var(--c-surface-2);border:1px solid var(--c-border);">' +
            '同桌：' + esc(char.name) +
          '</span>' +
        '</div>' +
        '<div style="font-size:18px;font-weight:700;color:var(--c-text);">静心而坐，向内探寻</div>' +
        '<div style="font-size:11px;color:var(--c-sub);line-height:1.5;">' +
          '与 ' + esc(char.name) + ' 保持心流同频。每次深度的专注，都是献给未来最好的底气。' +
        '</div>' +
        '<div class="sr-hall-stats-row">' +
          '<div class="sr-stat-card">' +
            '<div class="sr-stat-val">' + _state.totalMinutesToday + '</div>' +
            '<div class="sr-stat-lbl">今日专注(分)</div>' +
          '</div>' +
          '<div class="sr-stat-card">' +
            '<div class="sr-stat-val">' + _state.pomodorosToday + '</div>' +
            '<div class="sr-stat-lbl">完成番茄数</div>' +
          '</div>' +
          '<div class="sr-stat-card">' +
            '<div class="sr-stat-val">' + _state.streakDays + '</div>' +
            '<div class="sr-stat-lbl">连续天数</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="sr-enter-duo-btn" id="sr-hall-enter-duo">' +
          '<i class="fa-solid fa-play"></i> 进入双人同桌自习' +
        '</button>' +
      '</div>' +

      // 快捷功能导航格
      '<div style="font-size:13px;font-weight:600;color:var(--c-text);"><i class="fa-solid fa-compass"></i> 功能导航</div>' +
      '<div class="sr-grid-menu">' +
        '<div class="sr-menu-card" data-goto="assistant">' +
          '<div class="sr-menu-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>' +
          '<div class="sr-menu-title">学习助手</div>' +
          '<div class="sr-menu-desc">与Char提问互动</div>' +
        '</div>' +
        '<div class="sr-menu-card" data-goto="quiz">' +
          '<div class="sr-menu-icon"><i class="fa-solid fa-brain"></i></div>' +
          '<div class="sr-menu-title">智能题库</div>' +
          '<div class="sr-menu-desc">高频练习自测</div>' +
        '</div>' +
        '<div class="sr-menu-card" data-goto="mistakes">' +
          '<div class="sr-menu-icon"><i class="fa-solid fa-book-open-reader"></i></div>' +
          '<div class="sr-menu-title">错题本</div>' +
          '<div class="sr-menu-desc">查漏补缺攻克</div>' +
        '</div>' +
        '<div class="sr-menu-card" data-goto="report">' +
          '<div class="sr-menu-icon"><i class="fa-solid fa-chart-line"></i></div>' +
          '<div class="sr-menu-title">学习报告</div>' +
          '<div class="sr-menu-desc">专注统计成就</div>' +
        '</div>' +
      '</div>' +

      // 今日待办清单
      '<div class="sr-todo-box">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
          '<span style="font-size:13px;font-weight:600;color:var(--c-text);"><i class="fa-solid fa-list-check"></i> 今日待办清单</span>' +
          '<button type="button" class="pl-btn-secondary" id="sr-add-todo-btn" style="padding:2px 8px;font-size:10px;">+ 添加</button>' +
        '</div>' +
        '<div id="sr-todo-list-container"></div>' +
      '</div>';

    viewport.appendChild(hallEl);

    hallEl.querySelector('#sr-hall-enter-duo').onclick = function() {
      switchTab(container, 'duo');
    };

    hallEl.querySelectorAll('.sr-menu-card[data-goto]').forEach(function(card) {
      card.onclick = function() {
        switchTab(container, card.getAttribute('data-goto'));
      };
    });

    renderTodoList(hallEl);
    hallEl.querySelector('#sr-add-todo-btn').onclick = function() {
      var text = prompt('请输入今日待办事项：');
      if (text && text.trim()) {
        _state.todos.push({ id: uid(), text: text.trim(), done: false });
        saveStorage(STORAGE_KEYS.TODOS, _state.todos);
        renderTodoList(hallEl);
      }
    };
  }

  function updateBottomNavState(container) {
    if (!container) return;
    container.querySelectorAll('.sr-bottom-nav-item[data-tab]').forEach(function(el) {
      el.classList.toggle('active', el.getAttribute('data-tab') === _state.activeTab);
    });
    var allBtn = container.querySelector('#sr-open-all-drawer');
    if (allBtn) {
      var isSecondary = ['assistant', 'quiz', 'mistakes', 'report', 'settings'].indexOf(_state.activeTab) >= 0;
      allBtn.classList.toggle('active', isSecondary);
    }
  }

  function switchTab(container, tabName) {
    _state.activeTab = tabName;
    closeAllFeaturesDrawer(container);
    updateBottomNavState(container);
    renderActiveTabPage(container);
  }

  function closeAllFeaturesDrawer(container) {
    var root = container && container.querySelector('#sr-drawer-root');
    if (root) root.innerHTML = '';
  }

  function openAllFeaturesDrawer(container) {
    var root = container.querySelector('#sr-drawer-root');
    if (!root) return;

    var items = [
      { tab: 'hall', icon: 'fa-house', title: '自习大厅', desc: '今日自习与待办' },
      { tab: 'duo', icon: 'fa-user-group', title: '双人专注', desc: 'Char 陪伴专注' },
      { tab: 'resources', icon: 'fa-book-bookmark', title: '资料库', desc: '学习资料与笔记' },
      { tab: 'assistant', icon: 'fa-wand-magic-sparkles', title: '学习助手', desc: 'AI 提问与学习' },
      { tab: 'quiz', icon: 'fa-brain', title: '智能题库', desc: '练习与自测' },
      { tab: 'mistakes', icon: 'fa-book-open-reader', title: '错题本', desc: '查漏补缺 · ' + _state.mistakes.length + ' 题' },
      { tab: 'report', icon: 'fa-chart-line', title: '学习报告', desc: '专注统计与记录' },
      { tab: 'settings', icon: 'fa-gear', title: '自习室设置', desc: '偏好与 Char 设置' }
    ];

    root.innerHTML =
      '<div class="sr-drawer-mask" id="sr-all-drawer-mask">' +
        '<section class="sr-all-drawer" role="dialog" aria-modal="true" aria-label="全部功能">' +
          '<div class="sr-drawer-handle" aria-hidden="true"></div>' +
          '<div class="sr-drawer-header">' +
            '<div><div class="sr-drawer-title">全部功能</div><div class="sr-drawer-subtitle">学习与练习</div></div>' +
            '<button type="button" class="sr-drawer-close" id="sr-all-drawer-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div class="sr-drawer-grid">' +
            items.map(function(item) {
              return '<button type="button" class="sr-drawer-feature' + (_state.activeTab === item.tab ? ' active' : '') + '" data-tab="' + item.tab + '">' +
                '<span class="sr-drawer-feature-icon"><i class="fa-solid ' + item.icon + '"></i></span>' +
                '<span class="sr-drawer-feature-title">' + item.title + '</span>' +
                '<span class="sr-drawer-feature-desc">' + item.desc + '</span>' +
              '</button>';
            }).join('') +
          '</div>' +
        '</section>' +
      '</div>';

    var mask = root.querySelector('#sr-all-drawer-mask');
    var panel = root.querySelector('.sr-all-drawer');
    root.querySelector('#sr-all-drawer-close').onclick = function() {
      closeAllFeaturesDrawer(container);
    };
    mask.onclick = function(e) {
      if (e.target === mask) closeAllFeaturesDrawer(container);
    };
    root.querySelectorAll('.sr-drawer-feature[data-tab]').forEach(function(btn) {
      btn.onclick = function() {
        switchTab(container, btn.getAttribute('data-tab'));
      };
    });

    // 向下滑动关闭抽屉（移动端）
    var startY = null;
    panel.addEventListener('touchstart', function(e) {
      if (e.touches && e.touches.length === 1) startY = e.touches[0].clientY;
    }, { passive: true });
    panel.addEventListener('touchend', function(e) {
      if (startY == null || !e.changedTouches || !e.changedTouches.length) return;
      var dy = e.changedTouches[0].clientY - startY;
      startY = null;
      if (dy > 80) closeAllFeaturesDrawer(container);
    }, { passive: true });
  }

  function renderTodoList(parentEl) {
    var list = parentEl.querySelector('#sr-todo-list-container');
    if (!list) return;
    list.innerHTML = '';

    if (!_state.todos.length) {
      list.innerHTML = '<div style="font-size:11px;color:var(--c-hint);text-align:center;padding:10px 0;">暂无待办事项</div>';
      return;
    }

    _state.todos.forEach(function(todo, idx) {
      var row = document.createElement('div');
      row.className = 'sr-todo-item';
      row.innerHTML =
        '<i class="sr-todo-checkbox fa-regular ' + (todo.done ? 'fa-circle-check checked' : 'fa-circle') + '"></i>' +
        '<span class="sr-todo-text ' + (todo.done ? 'done' : '') + '">' + esc(todo.text) + '</span>' +
        '<i class="fa-solid fa-xmark" style="color:var(--c-hint);cursor:pointer;padding:4px;" title="删除"></i>';

      row.querySelector('.sr-todo-checkbox').onclick = function() {
        todo.done = !todo.done;
        saveStorage(STORAGE_KEYS.TODOS, _state.todos);
        renderTodoList(parentEl);
      };

      row.querySelector('.fa-xmark').onclick = function(e) {
        e.stopPropagation();
        _state.todos.splice(idx, 1);
        saveStorage(STORAGE_KEYS.TODOS, _state.todos);
        renderTodoList(parentEl);
      };

      list.appendChild(row);
    });
  }

  // ====================================================
  // 2. 双人专注舞台 (Duo Focus Stage)
  // ====================================================
  function renderDuoStagePage(container, viewport) {
    var stageEl = document.createElement('div');
    stageEl.className = 'sr-duo-stage';
    stageEl.style.background = '#111118';

    stageEl.innerHTML =
      // 顶部工具条（去除了场景切换，只保留任务与Char图片设置）
      '<div class="sr-stage-top-bar">' +
        '<div class="sr-stage-task-pill" id="sr-task-selector-btn" title="点击切换专注任务">' +
          '<i class="fa-solid fa-tag"></i> <span>' + esc(_state.taskType) + ' · ' + esc(_state.taskName) + '</span> <i class="fa-solid fa-angle-down" style="font-size:9px;"></i>' +
        '</div>' +
        '<div class="sr-stage-quick-actions">' +
          '<button type="button" class="sr-stage-icon-btn" id="sr-btn-adjust-standee" title="Char 伴读图片设置">' +
            '<i class="fa-solid fa-wand-magic-sparkles"></i> <span>Char 设置</span>' +
          '</button>' +
        '</div>' +
      '</div>' +

      // 上方整块自习区域：Char 图片可直接覆盖铺满整块背景！
      '<div class="sr-stage-actor-area" id="sr-actor-area">' +
        '<div class="sr-actor-standee-box" id="sr-standee-box" title="点击与 ' + esc((_state.companionChar && _state.companionChar.name) || 'TA') + ' 互动">' +
          '<img class="sr-actor-standee-img" id="sr-standee-img" src="' + getActiveStandeeImg() + '" alt="Char 伴读背景" onerror="this.src=\'img/wanwan.png\'">' +
        '</div>' +
        '<div class="sr-stage-actor-gradient"></div>' +
        '<div class="sr-actor-bubble" id="sr-actor-bubble" style="display:' + (_state.actorSpeech ? 'block' : 'none') + ';">' +
          esc(_state.actorSpeech || '') +
        '</div>' +
        '<div class="sr-actor-name-tag" id="sr-actor-name-tag">' +
          '<i class="fa-solid fa-heart" style="font-size:9px;color:#f43f5e;"></i> ' + esc((_state.companionChar && _state.companionChar.name) || '林弯弯') +
        '</div>' +
      '</div>' +

      // 下半部分控制面板 (最高层级25，按钮绝不被上方背景或立绘遮挡)
      '<div class="sr-stage-control-panel">' +
        // 三种陪伴模式切换胶囊
        '<div class="sr-mode-selector-pill">' +
          '<button type="button" class="sr-mode-opt-btn' + (_state.studyMode === 'quiet' ? ' active' : '') + '" data-mode="quiet"><i class="fa-solid fa-volume-xmark"></i> 安静陪伴</button>' +
          '<button type="button" class="sr-mode-opt-btn' + (_state.studyMode === 'gentle' ? ' active' : '') + '" data-mode="gentle"><i class="fa-solid fa-heart"></i> 温柔鼓励</button>' +
          '<button type="button" class="sr-mode-opt-btn' + (_state.studyMode === 'interactive' ? ' active' : '') + '" data-mode="interactive"><i class="fa-solid fa-comments"></i> 互动学习</button>' +
        '</div>' +

        // 核心时间表盘
        '<div class="sr-timer-time-display" id="sr-timer-val">' +
          formatTimeDisplay(_state.timerType === 'stopwatch' ? _state.elapsedSec : _state.remainingSec) +
        '</div>' +

        '<div class="sr-timer-status-hint" id="sr-timer-status-hint">' +
          '<i class="fa-solid fa-circle-check"></i> 准备就绪 · 点击开始' +
        '</div>' +

        // 核心动作按钮行
        '<div class="sr-timer-actions-row">' +
          '<button type="button" class="sr-timer-sub-btn" id="sr-timer-reset-btn" title="重置计时">' +
            '<i class="fa-solid fa-rotate-left"></i>' +
          '</button>' +
          '<button type="button" class="sr-timer-main-btn" id="sr-timer-play-btn" title="开始/暂停">' +
            '<i class="fa-solid ' + (_state.timerStatus === 'running' ? 'fa-pause' : 'fa-play') + '"></i>' +
          '</button>' +
          '<button type="button" class="sr-timer-sub-btn" id="sr-timer-skip-btn" title="跳过当前阶段">' +
            '<i class="fa-solid fa-forward-step"></i>' +
          '</button>' +
        '</div>' +
      '</div>';

    viewport.appendChild(stageEl);

    // 绑定立绘直观触控拖拽与互动（在整个自习场景内自由移动摆放）
    var standeeImg = stageEl.querySelector('#sr-standee-img');
    var isDragging = false;
    var startX = 0, startY = 0;
    var initOx = 0, initOy = 0;
    var hasMoved = false;

    function getPointerCoord(e) {
      if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    }

    function onDragStart(e) {
      if (e.touches && e.touches.length > 1) return;
      var pt = getPointerCoord(e);
      startX = pt.x;
      startY = pt.y;
      isDragging = true;
      hasMoved = false;
      var conf = getCurrentCharStandeeConfig();
      initOx = conf.offsetX || 0;
      initOy = conf.offsetY || 0;
    }

    function onDragMove(e) {
      if (!isDragging) return;
      if (!stageEl.isConnected || !standeeImg || !standeeImg.isConnected) {
        isDragging = false;
        return;
      }
      var pt = getPointerCoord(e);
      var dx = pt.x - startX;
      var dy = pt.y - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMoved = true;
      }
      if (hasMoved) {
        if (e.cancelable && e.type && e.type.indexOf('touch') === 0) e.preventDefault();
        var conf = getCurrentCharStandeeConfig();
        conf.offsetX = Math.round(initOx + dx);
        conf.offsetY = Math.round(initOy + dy);
        standeeImg.style.transform = 'translate(' + conf.offsetX + 'px, ' + conf.offsetY + 'px) scale(' + ((conf.scale || 100) / 100) + ')';
      }
    }

    function onDragEnd() {
      if (!isDragging) return;
      isDragging = false;
      if (hasMoved) {
        var cid = _state.companionChar ? _state.companionChar.id : 'char_default';
        _state.charStandees[cid] = getCurrentCharStandeeConfig();
        saveStorage(STORAGE_KEYS.STANDEES, _state.charStandees);
        window.toast && window.toast('背景/立绘位置已调整保存');
      } else {
        triggerCharReaction('user_tap_char');
      }
    }

    if (standeeImg) {
      standeeImg.addEventListener('mousedown', onDragStart);
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('mouseup', onDragEnd);

      standeeImg.addEventListener('touchstart', onDragStart, { passive: false });
      window.addEventListener('touchmove', onDragMove, { passive: false });
      window.addEventListener('touchend', onDragEnd);
    }

    stageEl.querySelectorAll('.sr-mode-opt-btn').forEach(function(btn) {
      btn.onclick = function() {
        var m = btn.getAttribute('data-mode');
        cycleStudyMode(container, m);
      };
    });

    stageEl.querySelector('#sr-timer-play-btn').onclick = function() {
      if (_state.timerStatus === 'running') {
        pauseTimer(container);
      } else {
        startOrResumeTimer(container);
      }
    };

    stageEl.querySelector('#sr-timer-reset-btn').onclick = function() {
      if (confirm('确定要重置当前计时吗？')) {
        resetTimer(container);
      }
    };

    stageEl.querySelector('#sr-timer-skip-btn').onclick = function() {
      if (_state.timerPhase === 'focus') {
        if (confirm('提前结束当前专注，切换到休息吗？')) {
          completeFocusSession(false, container);
        }
      } else {
        _state.timerPhase = 'focus';
        _state.targetDurationSec = 25 * 60;
        _state.remainingSec = 25 * 60;
        _state.accumulatedSecBeforeResume = 0;
        _state.timerStatus = 'idle';
        updateDuoControls(container);
        window.toast && window.toast('已结束休息，准备开始新的专注');
      }
    };

    stageEl.querySelector('#sr-task-selector-btn').onclick = function() {
      openTaskSelectorModal(container);
    };

    stageEl.querySelector('#sr-btn-adjust-standee').onclick = function() {
      openStandeeAdjustModal(container);
    };

    updateDuoControls(container);
  }

  // 任务切换弹窗
  function openTaskSelectorModal(container) {
    var root = container.querySelector('#sr-modal-root');
    if (!root) return;

    var tasks = ['学习', '工作', '阅读', '写作'];

    root.innerHTML =
      '<div class="sr-modal-mask" id="sr-task-mask">' +
        '<div class="sr-modal-panel">' +
          '<div class="sr-modal-header">' +
            '<span>切换专注任务</span>' +
            '<button type="button" class="pl-btn-secondary" id="sr-task-close" style="padding:2px 8px;"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div style="display:flex;gap:6px;margin:8px 0;">' +
            tasks.map(function(t) {
              return '<button type="button" class="pl-btn-secondary' + (_state.taskType === t ? ' active' : '') + '" data-ttype="' + t + '" style="' + (_state.taskType === t ? 'border-color:var(--c-text);font-weight:600;' : '') + '">' + t + '</button>';
            }).join('') +
          '</div>' +
          '<div style="font-size:12px;color:var(--c-sub);">具体任务名称：</div>' +
          '<input type="text" class="input-field" id="sr-task-name-input" value="' + esc(_state.taskName) + '" placeholder="如：英语考研词汇辨析">' +
          '<button type="button" class="pl-btn-primary" id="sr-task-save" style="margin-top:6px;">确认更新</button>' +
        '</div>' +
      '</div>';

    root.querySelector('#sr-task-mask').onclick = function(e) {
      if (e.target.id === 'sr-task-mask') root.innerHTML = '';
    };
    root.querySelector('#sr-task-close').onclick = function() {
      root.innerHTML = '';
    };

    var selectedType = _state.taskType;
    root.querySelectorAll('button[data-ttype]').forEach(function(b) {
      b.onclick = function() {
        selectedType = b.getAttribute('data-ttype');
        root.querySelectorAll('button[data-ttype]').forEach(function(x) { x.style.fontWeight = 'normal'; x.style.borderColor = ''; });
        b.style.fontWeight = '600';
        b.style.borderColor = 'var(--c-text)';
      };
    });

    root.querySelector('#sr-task-save').onclick = function() {
      var nameVal = root.querySelector('#sr-task-name-input').value.trim();
      _state.taskType = selectedType;
      _state.taskName = nameVal || '自主深度专注';
      saveAllSettings();
      root.innerHTML = '';
      renderActiveTabPage(container);
    };
  }

  

  // 立绘与全景伴读背景微调弹窗 (全自习室唯一图片导入入口：支持直接铺满覆盖上方整块背景或等比独立立绘)
  function openStandeeAdjustModal(container) {
    var root = container.querySelector('#sr-modal-root');
    if (!root) return;

    var conf = getCurrentCharStandeeConfig();
    var curChar = _state.companionChar || { name: '林弯弯', avatar: 'img/wanwan.png' };

    function renderModalContent() {
      var curSt = _state.currentStandeeState || 'focus';
      var currentImgSrc = conf[curSt] || (conf.focus || conf.smile || conf.rest || curChar.avatar || FALLBACK_SCENE);
      var hasCustomImg = !!conf[curSt];
      var isCover = conf.displayMode !== 'contain';

      root.innerHTML =
        '<div class="sr-modal-mask" id="sr-standee-mask">' +
          '<div class="sr-modal-panel" style="max-height:88vh;overflow-y:auto;">' +
            '<div class="sr-modal-header">' +
              '<span><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--c-primary, #6366f1);"></i> Char 伴读图片设置</span>' +
              '<button type="button" class="pl-btn-secondary" id="sr-standee-close" style="padding:2px 8px;"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +

            '<div style="font-size:11px;color:var(--c-sub);">' +
              '当前同桌角色：<b style="color:var(--c-text);">' + esc(curChar.name) + '</b>（唯一图片导入入口，按角色独立保存）' +
            '</div>' +

            // 1. 伴读状态选择 (专注 / 微笑 / 休息)
            '<div style="font-size:12px;font-weight:600;margin-top:2px;">1. 选择配置的伴读状态：</div>' +
            '<div style="display:flex;gap:6px;">' +
              '<button type="button" class="pl-btn-secondary' + (curSt === 'focus' ? ' active' : '') + '" data-st="focus" style="flex:1;padding:7px;' + (curSt === 'focus' ? 'border-color:var(--c-text);font-weight:600;background:rgba(255,255,255,0.12);' : '') + '">专注状态</button>' +
              '<button type="button" class="pl-btn-secondary' + (curSt === 'smile' ? ' active' : '') + '" data-st="smile" style="flex:1;padding:7px;' + (curSt === 'smile' ? 'border-color:var(--c-text);font-weight:600;background:rgba(255,255,255,0.12);' : '') + '">微笑状态</button>' +
              '<button type="button" class="pl-btn-secondary' + (curSt === 'rest' ? ' active' : '') + '" data-st="rest" style="flex:1;padding:7px;' + (curSt === 'rest' ? 'border-color:var(--c-text);font-weight:600;background:rgba(255,255,255,0.12);' : '') + '">休息状态</button>' +
            '</div>' +

            // 2. 图片导入（全自习室唯一入口：覆盖上面一整块背景）
            '<div style="font-size:12px;font-weight:600;margin-top:4px;">2. 当前状态图片导入（唯一入口）：</div>' +
            '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.05);border-radius:8px;border:1px solid rgba(255,255,255,0.08);">' +
              '<div style="width:52px;height:52px;border-radius:6px;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">' +
                '<img id="sr-preview-thumb" src="' + currentImgSrc + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.src=\'img/wanwan.png\'">' +
              '</div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:12px;font-weight:600;">' + (hasCustomImg ? '已设置自定义伴读图' : '当前使用默认角色图片') + '</div>' +
                '<div style="font-size:10px;color:var(--c-sub);margin-top:2px;">上传本地角色立绘或插画；三种状态共用这一套上传组件。</div>' +
              '</div>' +
            '</div>' +

            '<div style="display:flex;gap:8px;">' +
              '<button type="button" class="pl-btn-primary" id="sr-btn-upload-file" style="flex:1;padding:8px;"><i class="fa-solid fa-upload"></i> 上传本地图片</button>' +
              '<button type="button" class="pl-btn-secondary" id="sr-btn-clear-img" style="flex:1;padding:8px;">恢复默认</button>' +
            '</div>' +
            '<input type="file" id="sr-file-input" accept="image/*" style="display:none;">' +

            // 3. 展现样式与位置微调
            '<div style="font-size:12px;font-weight:600;margin-top:4px;">3. 展现模式与位置微调：</div>' +
            '<div style="display:flex;gap:6px;">' +
              '<button type="button" class="pl-btn-secondary" id="sr-btn-mode-cover" style="flex:1;font-size:11px;padding:6px;' + (isCover ? 'border-color:var(--c-primary, #6366f1);font-weight:600;background:rgba(99,102,241,0.2);' : '') + '"><i class="fa-solid fa-expand"></i> 铺满整块背景 (Cover)</button>' +
              '<button type="button" class="pl-btn-secondary" id="sr-btn-mode-contain" style="flex:1;font-size:11px;padding:6px;' + (!isCover ? 'border-color:var(--c-primary, #6366f1);font-weight:600;background:rgba(99,102,241,0.2);' : '') + '"><i class="fa-solid fa-compress"></i> 等比独立立绘 (Contain)</button>' +
            '</div>' +

            '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--c-sub);margin-top:4px;">' +
              '<span>缩放大小：</span>' +
              '<span id="sr-scale-val" style="font-weight:700;color:var(--c-text);">' + (conf.scale || 100) + '%</span>' +
            '</div>' +
            '<input type="range" min="30" max="250" value="' + (conf.scale || 100) + '" id="sr-range-scale" style="width:100%;">' +

            '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--c-sub);">' +
              '<span>水平位移 (左右)：</span>' +
              '<span id="sr-offsetx-val" style="font-weight:700;color:var(--c-text);">' + (conf.offsetX || 0) + 'px</span>' +
            '</div>' +
            '<input type="range" min="-220" max="220" value="' + (conf.offsetX || 0) + '" id="sr-range-offsetx" style="width:100%;">' +

            '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--c-sub);">' +
              '<span>垂直位移 (上下)：</span>' +
              '<span id="sr-offsety-val" style="font-weight:700;color:var(--c-text);">' + (conf.offsetY || 0) + 'px</span>' +
            '</div>' +
            '<input type="range" min="-220" max="220" value="' + (conf.offsetY || 0) + '" id="sr-range-offsety" style="width:100%;">' +

            '<div style="display:flex;gap:6px;margin:2px 0 6px;">' +
              '<button type="button" class="pl-btn-secondary" id="sr-pos-center" style="flex:1;font-size:11px;padding:6px 4px;">居中对齐</button>' +
              '<button type="button" class="pl-btn-secondary" id="sr-pos-left" style="flex:1;font-size:11px;padding:6px 4px;">靠左同桌</button>' +
              '<button type="button" class="pl-btn-secondary" id="sr-pos-right" style="flex:1;font-size:11px;padding:6px 4px;">靠右同桌</button>' +
              '<button type="button" class="pl-btn-secondary" id="sr-pos-reset" style="flex:1;font-size:11px;padding:6px 4px;">重置原位</button>' +
            '</div>' +

            '<button type="button" class="pl-btn-primary" id="sr-btn-save-standee" style="width:100%;padding:10px;font-weight:600;font-size:13px;"><i class="fa-solid fa-check"></i> 保存并应用到自习室</button>' +
          '</div>' +
        '</div>';

      bindModalEvents();
    }

    function bindModalEvents() {
      root.querySelector('#sr-standee-mask').onclick = function(e) {
        if (e.target.id === 'sr-standee-mask') root.innerHTML = '';
      };
      root.querySelector('#sr-standee-close').onclick = function() {
        root.innerHTML = '';
      };

      // 铺满背景 vs 等比立绘
      root.querySelector('#sr-btn-mode-cover').onclick = function() {
        conf.displayMode = 'cover';
        updateDuoControls(container);
        renderModalContent();
        window.toast && window.toast('已设为：直接铺满覆盖上方整块背景');
      };
      root.querySelector('#sr-btn-mode-contain').onclick = function() {
        conf.displayMode = 'contain';
        updateDuoControls(container);
        renderModalContent();
        window.toast && window.toast('已设为：等比居中立绘模式');
      };

      var scaleInput = root.querySelector('#sr-range-scale');
      var oxInput = root.querySelector('#sr-range-offsetx');
      var oyInput = root.querySelector('#sr-range-offsety');

      scaleInput.oninput = function() {
        conf.scale = parseInt(scaleInput.value, 10);
        root.querySelector('#sr-scale-val').textContent = conf.scale + '%';
        updateDuoControls(container);
      };
      oxInput.oninput = function() {
        conf.offsetX = parseInt(oxInput.value, 10);
        root.querySelector('#sr-offsetx-val').textContent = conf.offsetX + 'px';
        updateDuoControls(container);
      };
      oyInput.oninput = function() {
        conf.offsetY = parseInt(oyInput.value, 10);
        root.querySelector('#sr-offsety-val').textContent = conf.offsetY + 'px';
        updateDuoControls(container);
      };

      root.querySelector('#sr-pos-center').onclick = function() {
        conf.offsetX = 0; oxInput.value = 0;
        root.querySelector('#sr-offsetx-val').textContent = '0px';
        updateDuoControls(container);
      };
      root.querySelector('#sr-pos-left').onclick = function() {
        conf.offsetX = -90; oxInput.value = -90;
        root.querySelector('#sr-offsetx-val').textContent = '-90px';
        updateDuoControls(container);
      };
      root.querySelector('#sr-pos-right').onclick = function() {
        conf.offsetX = 90; oxInput.value = 90;
        root.querySelector('#sr-offsetx-val').textContent = '90px';
        updateDuoControls(container);
      };
      root.querySelector('#sr-pos-reset').onclick = function() {
        conf.offsetX = 0; conf.offsetY = 0; conf.scale = 100;
        oxInput.value = 0; oyInput.value = 0; scaleInput.value = 100;
        root.querySelector('#sr-offsetx-val').textContent = '0px';
        root.querySelector('#sr-offsety-val').textContent = '0px';
        root.querySelector('#sr-scale-val').textContent = '100%';
        updateDuoControls(container);
      };

      root.querySelectorAll('button[data-st]').forEach(function(b) {
        b.onclick = function() {
          _state.currentStandeeState = b.getAttribute('data-st');
          updateDuoControls(container);
          renderModalContent();
        };
      });

      var fileInput = root.querySelector('#sr-file-input');
      root.querySelector('#sr-btn-upload-file').onclick = function() { fileInput.click(); };
      fileInput.onchange = function() {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
          conf[_state.currentStandeeState] = e.target.result;
          conf.displayMode = 'contain'; // 上传后默认等比显示，避免电脑宽屏异常放大
          updateDuoControls(container);
          renderModalContent();
          window.toast && window.toast('图片已导入，可直接拖动、缩放和调整位置');
        };
        reader.readAsDataURL(file);
      };

      root.querySelector('#sr-btn-clear-img').onclick = function() {
        conf[_state.currentStandeeState] = '';
        updateDuoControls(container);
        renderModalContent();
        window.toast && window.toast('已恢复为默认角色图片');
      };

      root.querySelector('#sr-btn-save-standee').onclick = function() {
        var cid = _state.companionChar ? _state.companionChar.id : 'char_default';
        _state.charStandees[cid] = conf;
        saveStorage(STORAGE_KEYS.STANDEES, _state.charStandees);
        root.innerHTML = '';
        window.toast && window.toast('已保存！Char 图片配置已应用');
      };
    }

    renderModalContent();
  }

  // ====================================================
  // 3. 阶段 4 资料库与文档解析 (Resource Library & Doc Parser)
  // 核心原则：一套资料库 + 一套检索索引 + 一套 AI 学习引擎
  // ====================================================
  function renderResourcesPage(container, viewport) {
    var libEl = document.createElement('div');
    libEl.className = 'sr-lib-container';

    var docs = (window.StudySearchIndex && window.StudySearchIndex.documents) || [];

    libEl.innerHTML =
      '<div class="sr-lib-top-bar">' +
        '<div class="sr-lib-search">' +
          '<i class="fa-solid fa-magnifying-glass" style="color:var(--c-sub);"></i>' +
          '<input type="text" id="sr-res-search-input" placeholder="按课程、文档或知识点搜索...">' +
        '</div>' +
        '<button type="button" class="pl-btn-primary" id="sr-res-import-file-btn" style="padding:6px 12px;font-size:11px;">' +
          '<i class="fa-solid fa-file-import"></i> 导入教材' +
        '</button>' +
        '<button type="button" class="pl-btn-secondary" id="sr-res-add-manual-btn" style="padding:6px 10px;font-size:11px;">+ 录入</button>' +
      '</div>' +

      // 隐藏的文件上传控件：支持 PDF, DOCX, TXT, Markdown, PPTX, XLSX, 图片
      '<input type="file" id="sr-file-upload-input" accept=".txt,.md,.markdown,.docx,.pdf,.json,.pptx,.xlsx,image/*" style="display:none;">' +

      // 索引状态横幅
      '<div style="font-size:11px;color:var(--c-sub);display:flex;align-items:center;justify-content:space-between;padding:2px 2px;">' +
        '<span><i class="fa-solid fa-database" style="color:#22c55e;"></i> 已建立索引教材：' + docs.length + ' 份 · ' + ((window.StudySearchIndex && window.StudySearchIndex.chunks.length) || 0) + ' 个检索切片</span>' +
        '<span style="font-size:10px;color:var(--c-hint);">支持 PDF/DOCX/MD/TXT</span>' +
      '</div>' +

      '<div id="sr-res-list" style="display:flex;flex-direction:column;gap:12px;"></div>';

    viewport.appendChild(libEl);

    var searchInput = libEl.querySelector('#sr-res-search-input');
    searchInput.oninput = function() {
      renderDocCards(libEl, searchInput.value.trim().toLowerCase(), container);
    };

    var fileInput = libEl.querySelector('#sr-file-upload-input');
    libEl.querySelector('#sr-res-import-file-btn').onclick = function() {
      fileInput.click();
    };

    fileInput.onchange = async function() {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;

      var course = prompt('请输入该教材所属学科或课程分类（如：计算机考研、英语、高数）：', '专业课考点') || '通用学科';
      window.toast && window.toast('正在解析文档结构并建立检索索引...');

      try {
        var parsedDoc = await window.StudyDocParser.parseFile(file, course);
        await window.StudySearchIndex.addDocument(parsedDoc);
        window.toast && window.toast('🎉 教材《' + file.name + '》导入成功！已生成 ' + parsedDoc.chunks.length + ' 个知识切片');
        renderActiveTabPage(container);
      } catch (err) {
        alert('文件解析失败，请检查文件格式或重新导出为 TXT/Markdown 后导入。');
      }
    };

    libEl.querySelector('#sr-res-add-manual-btn').onclick = function() {
      promptAddResource(container);
    };

    renderDocCards(libEl, '', container);
  }

  function renderDocCards(parentEl, query, container) {
    var list = parentEl.querySelector('#sr-res-list');
    if (!list) return;
    list.innerHTML = '';

    var docs = (window.StudySearchIndex && window.StudySearchIndex.documents) || [];
    var filtered = docs.filter(function(d) {
      if (!query) return true;
      var q = query.toLowerCase();
      return (d.title && d.title.toLowerCase().indexOf(q) >= 0) ||
             (d.course && d.course.toLowerCase().indexOf(q) >= 0) ||
             (d.chapters && d.chapters.some(function(c) { return c.toLowerCase().indexOf(q) >= 0; }));
    });

    if (!filtered.length) {
      list.innerHTML =
        '<div style="padding:40px 0;text-align:center;color:var(--c-hint);font-size:12px;">' +
          '<i class="fa-solid fa-folder-open" style="font-size:28px;margin-bottom:8px;display:block;opacity:0.5;"></i>' +
          '未搜索到匹配的教材。支持一键导入文字型 PDF、Word (DOCX)、Markdown 或纯文本！' +
        '</div>';
      return;
    }

    filtered.forEach(function(doc) {
      var card = document.createElement('div');
      card.className = 'sr-lib-card';

      var qualityClass = 'quality-high';
      if (doc.parseQuality && doc.parseQuality.indexOf('OCR') >= 0) qualityClass = 'quality-ocr';

      var chapterTags = (doc.chapters || []).slice(0, 3).map(function(c) {
        return '<span class="sr-doc-badge">' + esc(c) + '</span>';
      }).join(' ');

      card.innerHTML =
        '<div class="sr-lib-title-row">' +
          '<div class="sr-lib-title">' + esc(doc.title) + '</div>' +
          '<div class="sr-lib-tag">' + esc(doc.course || '通识') + '</div>' +
        '</div>' +
        '<div class="sr-doc-meta-row">' +
          '<span class="sr-doc-badge ' + qualityClass + '"><i class="fa-solid fa-circle-check"></i> ' + esc(doc.parseQuality || '已解析') + '</span>' +
          '<span class="sr-doc-badge"><i class="fa-solid fa-layer-group"></i> ' + (doc.chunks ? doc.chunks.length : 1) + ' 个切片</span>' +
          '<span class="sr-doc-badge"><i class="fa-solid fa-file"></i> ' + esc(doc.format ? doc.format.toUpperCase() : 'TXT') + ' · ' + esc(doc.fileSize || '') + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--c-sub);margin-top:6px;line-height:1.4;">' +
          '<b>包含章节：</b>' + (chapterTags || '<span>基础知识总论</span>') +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px dashed var(--c-border);flex-wrap:wrap;gap:4px;">' +
          '<div style="display:flex;gap:4px;">' +
            '<button type="button" class="pl-btn-secondary sr-btn-summary" style="padding:3px 8px;font-size:10px;">' +
              '<i class="fa-solid fa-list-ol"></i> 提纲总结' +
            '</button>' +
            '<button type="button" class="pl-btn-secondary sr-btn-chunks" style="padding:3px 8px;font-size:10px;">' +
              '<i class="fa-solid fa-layer-group"></i> 检视切片' +
            '</button>' +
          '</div>' +
          '<button type="button" class="pl-btn-secondary sr-btn-del-doc" style="padding:3px 8px;font-size:10px;color:#ef4444;" title="删除并清理索引">' +
            '<i class="fa-solid fa-trash"></i> 删除' +
          '</button>' +
        '</div>';

      // 绑定分批总结 (Batch Summarization)
      card.querySelector('.sr-btn-summary').onclick = async function(e) {
        e.stopPropagation();
        window.toast && window.toast('正在分批提炼教材章节摘要与重点...');
        var summary = await window.StudyAIEngine.generateChapterSummary(doc.id);
        openSummaryModal(container, summary, doc.title);
      };

      // 绑定检视切片与关键词
      card.querySelector('.sr-btn-chunks').onclick = function(e) {
        e.stopPropagation();
        openDocChunksModal(container, doc);
      };

      // 绑定删除（彻底清理索引）
      card.querySelector('.sr-btn-del-doc').onclick = async function(e) {
        e.stopPropagation();
        if (confirm('确定要删除教材《' + doc.title + '》吗？\n删除后系统将彻底清理对应检索索引，不再被 AI 学习引擎检索。')) {
          await window.StudySearchIndex.removeDocument(doc.id);
          window.toast && window.toast('已删除资料并成功清理相关检索索引！');
          renderDocCards(parentEl, query, container);
        }
      };

      list.appendChild(card);
    });
  }

  // 章节分批摘要弹窗展示
  function openSummaryModal(container, markdownText, docTitle) {
    var root = container.querySelector('#sr-modal-root');
    if (!root) return;

    root.innerHTML =
      '<div class="sr-modal-mask" id="sr-summary-mask">' +
        '<div class="sr-modal-panel" style="max-height:85%;">' +
          '<div class="sr-modal-header">' +
            '<span><i class="fa-solid fa-book"></i> 《' + esc(docTitle) + '》分批提纲与重点总结</span>' +
            '<button type="button" class="pl-btn-secondary" id="sr-summary-close" style="padding:2px 8px;"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div style="font-size:12px;line-height:1.7;color:var(--c-text);background:var(--c-surface-2);padding:14px;border-radius:var(--r-sm);white-space:pre-wrap;max-height:460px;overflow-y:auto;">' +
            esc(markdownText) +
          '</div>' +
          '<button type="button" class="pl-btn-primary" id="sr-summary-copy-btn" style="margin-top:6px;">复制总结笔记</button>' +
        '</div>' +
      '</div>';

    root.querySelector('#sr-summary-mask').onclick = function(e) {
      if (e.target.id === 'sr-summary-mask') root.innerHTML = '';
    };
    root.querySelector('#sr-summary-close').onclick = function() {
      root.innerHTML = '';
    };
    root.querySelector('#sr-summary-copy-btn').onclick = function() {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(markdownText);
        window.toast && window.toast('总结笔记已复制到剪贴板！');
      }
    };
  }

  // 切片检视弹窗
  function openDocChunksModal(container, doc, targetChapter) {
    var root = container.querySelector('#sr-modal-root');
    if (!root) return;

    if (!doc && typeof targetChapter === 'string') {
      var allDocs = (window.StudySearchIndex && window.StudySearchIndex.documents) || [];
      doc = allDocs.find(function(d) {
        return (d.chunks || []).some(function(c) { return c.chapter === targetChapter; });
      }) || allDocs[0];
    }
    if (!doc) {
      window.toast && window.toast('未找到对应教材文档');
      return;
    }

    var chunks = doc.chunks || [];
    var filteredChunks = chunks;
    if (targetChapter) {
      filteredChunks = chunks.filter(function(c) { return c.chapter === targetChapter; });
      if (!filteredChunks.length) filteredChunks = chunks;
    }

    root.innerHTML =
      '<div class="sr-modal-mask" id="sr-chunks-mask">' +
        '<div class="sr-modal-panel" style="max-height:85%;">' +
          '<div class="sr-modal-header">' +
            '<span><i class="fa-solid fa-layer-group"></i> 《' + esc(doc.title) + '》切片索引检视</span>' +
            '<button type="button" class="pl-btn-secondary" id="sr-chunks-close" style="padding:2px 8px;"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--c-sub);display:flex;align-items:center;justify-content:space-between;background:var(--c-surface-2);padding:6px 10px;border-radius:4px;">' +
            '<span>格式：<b>' + esc((doc.format || 'TXT').toUpperCase()) + '</b> · ' + esc(doc.fileSize || '') + ' · 质量：<b>' + esc(doc.parseQuality || '优') + '</b></span>' +
            '<span>共 ' + chunks.length + ' 个切片</span>' +
          '</div>' +
          '<div style="max-height:480px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:2px;">' +
            filteredChunks.map(function(c, i) {
              return '<div style="background:var(--c-surface-2);border:1px solid var(--c-border);border-radius:var(--r-sm);padding:10px;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
                  '<span style="font-weight:600;font-size:11px;color:var(--c-text);"><i class="fa-solid fa-bookmark" style="color:#2563eb;"></i> ' + esc(c.chapter) + ' (第 ' + c.page + ' 页)</span>' +
                  '<span style="font-size:10px;color:var(--c-hint);">切片 #' + (i + 1) + '</span>' +
                '</div>' +
                '<div style="font-size:11px;line-height:1.6;color:var(--c-text);white-space:pre-wrap;">' + esc(c.text) + '</div>' +
                '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">' +
                  (c.keywords || []).map(function(k) {
                    return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:var(--c-bg);color:var(--c-sub);border:1px solid var(--c-border);">#' + esc(k) + '</span>';
                  }).join('') +
                '</div>' +
              '</div>';
            }).join('') +
          '</div>' +
          '<button type="button" class="pl-btn-primary" id="sr-chunks-ok" style="margin-top:4px;">关闭检视</button>' +
        '</div>' +
      '</div>';

    root.querySelector('#sr-chunks-mask').onclick = function(e) {
      if (e.target.id === 'sr-chunks-mask') root.innerHTML = '';
    };
    root.querySelector('#sr-chunks-close').onclick = function() {
      root.innerHTML = '';
    };
    root.querySelector('#sr-chunks-ok').onclick = function() {
      root.innerHTML = '';
    };
  }

  // 资料范围与隐私说明弹窗
  function openScopePrivacyModal(container) {
    var root = container.querySelector('#sr-modal-root');
    if (!root) return;

    root.innerHTML =
      '<div class="sr-modal-mask" id="sr-privacy-mask">' +
        '<div class="sr-modal-panel">' +
          '<div class="sr-modal-header">' +
            '<span><i class="fa-solid fa-shield-halved" style="color:#22c55e;"></i> 本地检索与资料范围透明说明</span>' +
            '<button type="button" class="pl-btn-secondary" id="sr-privacy-close" style="padding:2px 8px;"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div style="font-size:12px;line-height:1.7;color:var(--c-text);display:flex;flex-direction:column;gap:10px;">' +
            '<div><b>1. 默认本地优先 (Local-First)：</b><br><span style="color:var(--c-sub);">文档解析（PDF/DOCX/PPTX/XLSX/MD/TXT）、语义分块与倒排词频索引全部在您本地浏览器 IndexedDB 离线存储与运算，绝不自动将整本教材上传云端。</span></div>' +
            '<div><b>2. 上下文预算控制 (Context Budget)：</b><br><span style="color:var(--c-sub);">无论教材包含几万字，每次问答或出题仅抽取相似度最高的 2~3 个精确切片（约 300~600 字符）送入大模型，Token 消耗极低且绝不产生大额开销。</span></div>' +
            '<div><b>3. 记忆边界安全 (Memory Safety)：</b><br><span style="color:var(--c-sub);">系统严格禁止将教材大段全文写入 Char 的长期记忆库，避免角色人设遭到知识污染。</span></div>' +
            '<div><b>4. 严肃学术求证 (No Hallucination)：</b><br><span style="color:var(--c-sub);">资料不足时系统明确提示未检索到，不假装引用教材，只有在您主动授权时才可使用学术通识补充。</span></div>' +
          '</div>' +
          '<button type="button" class="pl-btn-primary" id="sr-privacy-ok" style="margin-top:6px;">我知道了</button>' +
        '</div>' +
      '</div>';

    root.querySelector('#sr-privacy-mask').onclick = function(e) {
      if (e.target.id === 'sr-privacy-mask') root.innerHTML = '';
    };
    root.querySelector('#sr-privacy-close').onclick = function() {
      root.innerHTML = '';
    };
    root.querySelector('#sr-privacy-ok').onclick = function() {
      root.innerHTML = '';
    };
  }

  function promptAddResource(container) {
    var title = prompt('请输入教材/笔记标题：', '高等数学必考定理公式.md');
    if (!title || !title.trim()) return;
    var course = prompt('请输入所属课程：', '数学备考') || '通用学科';
    var content = prompt('请输入教材正文内容（支持 Markdown 章节标记）：');
    if (!content) return;

    var doc = window.StudyDocParser.chunkPlainTextOrMarkdown({
      id: uid('doc_'),
      title: title.trim(),
      course: course.trim(),
      format: 'markdown',
      fileSize: (content.length / 1000).toFixed(1) + ' KB',
      parseQuality: '优 · 手动录入结构化教材',
      importedAt: Date.now()
    }, content);

    window.StudySearchIndex.addDocument(doc);
    window.toast && window.toast('教材已录入并建立索引！');
    renderActiveTabPage(container);
  }

  // ====================================================
  // 4. 阶段 4 学习助手 (Shared AI Assistant)
  // 支持专业助手模式与 Char 人设化模式，严格共享证据并保留来源
  // ====================================================
  function renderAssistantPage(container, viewport) {
    var astEl = document.createElement('div');
    astEl.className = 'sr-assistant-container';

    var char = _state.companionChar || { name: '林弯弯' };
    var docs = (window.StudySearchIndex && window.StudySearchIndex.documents) || [];

    astEl.innerHTML =
      // 模式切换胶囊
      '<div class="sr-ast-mode-tabs">' +
        '<button type="button" class="sr-ast-mode-tab' + (_state.assistantMode === 'char' ? ' active' : '') + '" data-amode="char">' +
          '<i class="fa-solid fa-heart"></i> ' + esc(char.name) + ' 人设化伴读讲解' +
        '</button>' +
        '<button type="button" class="sr-ast-mode-tab' + (_state.assistantMode === 'professional' ? ' active' : '') + '" data-amode="professional">' +
          '<i class="fa-solid fa-graduation-cap"></i> 专业学习助手模式' +
        '</button>' +
      '</div>' +

      // 检索范围过滤与隐私透明提示条
      '<div class="sr-scope-indicator">' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
          '<span>检索范围：</span>' +
          '<select id="sr-ast-doc-scope" style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--c-surface-2);border:1px solid var(--c-border);color:var(--c-text);outline:none;">' +
            '<option value="">全部教材资料库 (' + docs.length + ' 份)</option>' +
            docs.map(function(d) {
              return '<option value="' + d.id + '"' + (_state.docFilter === d.id ? ' selected' : '') + '>《' + esc(d.title) + '》</option>';
            }).join('') +
          '</select>' +
          '<select id="sr-ast-chap-scope" style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--c-surface-2);border:1px solid var(--c-border);color:var(--c-text);outline:none;' + (_state.docFilter ? '' : 'display:none;') + '">' +
            '<option value="">全部章节</option>' +
            (function() {
              var selDoc = docs.find(function(d) { return d.id === _state.docFilter; });
              if (!selDoc || !selDoc.chapters) return '';
              return selDoc.chapters.map(function(c) {
                return '<option value="' + esc(c) + '"' + (_state.chapterFilter === c ? ' selected' : '') + '>' + esc(c) + '</option>';
              }).join('');
            })() +
          '</select>' +
        '</div>' +
        '<span class="sr-scope-pill" id="sr-scope-pill-btn" style="cursor:pointer;" title="点击查看本地切片检索与隐私预算透明说明"><i class="fa-solid fa-shield-halved" style="color:#22c55e;"></i> 本地切片检索 · 预算可控</span>' +
      '</div>' +

      // 聊天气泡滚动区
      '<div class="sr-chat-history-box" id="sr-chat-box"></div>' +

      // 资料不足备选开关与快捷提问气泡
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 4px;">' +
        '<label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--c-sub);cursor:pointer;">' +
          '<input type="checkbox" id="sr-ast-allow-gk"' + (_state.allowGeneralKnowledge ? ' checked' : '') + '> 资料不足时允许使用模型学术通识补充' +
        '</label>' +
      '</div>' +

      '<div class="sr-assistant-prompts">' +
        '<div class="sr-prompt-chip" data-p="请梳理当前资料中的核心知识脉络与必考点">📑 核心知识脉络</div>' +
        '<div class="sr-prompt-chip" data-p="进程与线程的区别与联系是什么？">🔍 进程与线程考点辨析</div>' +
        '<div class="sr-prompt-chip" data-p="死锁的产生条件和银行家算法原理">💡 死锁与银行家算法</div>' +
        '<div class="sr-prompt-chip" data-p="考研英语高频词根构词法规律总结">📖 核心前缀与词根</div>' +
        '<div class="sr-prompt-chip" data-p="请针对当前教材给出考前重点复习与通关建议">📝 阶段复习建议</div>' +
      '</div>' +

      // 发送输入框
      '<div class="sr-assistant-input-box">' +
        '<input type="text" class="sr-assistant-input" id="sr-ast-input" placeholder="输入你想请教的知识点或考点疑难（支持追问）...">' +
        '<button type="button" class="pl-btn-secondary" id="sr-ast-send" style="padding:4px 10px;font-size:11px;">发送</button>' +
      '</div>';

    viewport.appendChild(astEl);

    // 绑定模式切换
    astEl.querySelectorAll('.sr-ast-mode-tab').forEach(function(tabBtn) {
      tabBtn.onclick = function() {
        _state.assistantMode = tabBtn.getAttribute('data-amode');
        astEl.querySelectorAll('.sr-ast-mode-tab').forEach(function(b) { b.classList.remove('active'); });
        tabBtn.classList.add('active');
        window.toast && window.toast('已切换为：「' + (_state.assistantMode === 'char' ? char.name + '人设讲解' : '专业学习助手') + '」');
      };
    });

    var scopeSelect = astEl.querySelector('#sr-ast-doc-scope');
    var chapSelect = astEl.querySelector('#sr-ast-chap-scope');

    scopeSelect.onchange = function() {
      _state.docFilter = scopeSelect.value;
      _state.chapterFilter = '';
      if (_state.docFilter) {
        var selDoc = docs.find(function(d) { return d.id === _state.docFilter; });
        if (selDoc && selDoc.chapters && selDoc.chapters.length) {
          chapSelect.style.display = 'inline-block';
          chapSelect.innerHTML = '<option value="">全部章节</option>' +
            selDoc.chapters.map(function(c) {
              return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
            }).join('');
        } else {
          chapSelect.style.display = 'none';
        }
      } else {
        chapSelect.style.display = 'none';
      }
    };

    if (chapSelect) {
      chapSelect.onchange = function() {
        _state.chapterFilter = chapSelect.value;
      };
    }

    var scopePillBtn = astEl.querySelector('#sr-scope-pill-btn');
    if (scopePillBtn) {
      scopePillBtn.onclick = function() {
        openScopePrivacyModal(container);
      };
    }

    var allowGkCheck = astEl.querySelector('#sr-ast-allow-gk');
    allowGkCheck.onchange = function() {
      _state.allowGeneralKnowledge = allowGkCheck.checked;
    };

    var chatBox = astEl.querySelector('#sr-chat-box');
    renderEnhancedChatMessages(chatBox, container);

    var inputEl = astEl.querySelector('#sr-ast-input');
    var sendBtn = astEl.querySelector('#sr-ast-send');

    var handleSend = async function(text) {
      var query = (text || inputEl.value).trim();
      if (!query) return;

      _state.assistantMessages.push({
        sender: 'user',
        text: query,
        time: Date.now()
      });
      inputEl.value = '';
      renderEnhancedChatMessages(chatBox, container);

      // 显示正在分析切片气泡
      var pendingId = uid('pending_');
      var pendingBubble = document.createElement('div');
      pendingBubble.id = pendingId;
      pendingBubble.className = 'sr-msg-bubble sr-msg-char';
      pendingBubble.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在检索教材切片并组织证据...';
      chatBox.appendChild(pendingBubble);
      chatBox.scrollTop = chatBox.scrollHeight;

      try {
        var engineResult = await window.StudyAIEngine.askAssistant({
          query: query,
          mode: _state.assistantMode,
          companionChar: char,
          allowGeneralKnowledge: _state.allowGeneralKnowledge,
          docFilter: _state.docFilter,
          chapterFilter: _state.chapterFilter,
          chatHistory: _state.assistantMessages.slice(-6)
        });

        pendingBubble.remove();

        _state.assistantMessages.push({
          sender: 'char',
          text: engineResult.answer,
          citations: engineResult.citations,
          isGeneralKnowledgeFallback: engineResult.isGeneralKnowledgeFallback,
          hasSufficientContext: engineResult.hasSufficientContext,
          retrievalSummary: engineResult.retrievalSummary,
          time: Date.now()
        });

        saveStorage(STORAGE_KEYS.ASSISTANT_MSGS, _state.assistantMessages);
        renderEnhancedChatMessages(chatBox, container);
      } catch (err) {
        pendingBubble.remove();
        _state.assistantMessages.push({
          sender: 'char',
          text: '抱歉，学习引擎响应超时，请稍后重试。',
          time: Date.now()
        });
        renderEnhancedChatMessages(chatBox, container);
      }
    };

    sendBtn.onclick = function() { handleSend(); };
    inputEl.onkeydown = function(e) {
      if (e.key === 'Enter') handleSend();
    };

    astEl.querySelectorAll('.sr-prompt-chip').forEach(function(chip) {
      chip.onclick = function() {
        handleSend(chip.getAttribute('data-p'));
      };
    });
  }

  function renderEnhancedChatMessages(chatBox, container) {
    if (!chatBox) return;
    chatBox.innerHTML = '';

    _state.assistantMessages.forEach(function(msg) {
      var bubble = document.createElement('div');
      bubble.className = 'sr-msg-bubble ' + (msg.sender === 'user' ? 'sr-msg-user' : 'sr-msg-char');

      var bodyHtml = esc(msg.text).replace(/\n/g, '<br>');

      // 如果有可追溯的来源切片引用，渲染为精致的来源卡片
      var citationsHtml = '';
      if (Array.isArray(msg.citations) && msg.citations.length) {
        citationsHtml = '<div style="margin-top:8px;padding-top:6px;border-top:1px dashed var(--c-border);">' +
          '<div style="font-size:10px;color:var(--c-sub);margin-bottom:4px;"><i class="fa-solid fa-quote-left"></i> 权威来源引用（可追溯定位）：</div>' +
          msg.citations.map(function(cit) {
            return '<div class="sr-citation-badge" title="点击查看原文切片">' +
              '<i class="fa-solid fa-bookmark"></i> 《' + esc(cit.docTitle) + '》 ' + esc(cit.chapter) + ' (第 ' + cit.page + ' 页)' +
            '</div>' +
            '<div class="sr-citation-box" style="display:none;">' +
              '<div>' + esc(cit.textSnippet) + '</div>' +
              '<button type="button" class="pl-btn-secondary sr-btn-jump-chunk" data-doc="' + esc(cit.docId || '') + '" data-chap="' + esc(cit.chapter || '') + '" style="margin-top:6px;padding:2px 8px;font-size:10px;"><i class="fa-solid fa-arrow-up-right-from-square"></i> 查看教材完整切片</button>' +
            '</div>';
          }).join('') +
        '</div>';
      }

      // 如果没有满足置信度的切片且用户未允许通识，提供一键补充入口
      var fallbackActionHtml = '';
      if (msg.hasSufficientContext === false && !msg.isGeneralKnowledgeFallback) {
        fallbackActionHtml =
          '<div class="sr-insufficient-card">' +
            '<div><b>未检索到教材直接出处</b></div>' +
            '<div style="font-size:10px;color:var(--c-sub);margin-top:2px;">为确保学术严谨，系统未捏造引用。可一键开启模型通识协助推导：</div>' +
            '<button type="button" class="pl-btn-secondary sr-btn-enable-gk" style="padding:4px 10px;font-size:10px;margin-top:6px;">' +
              '<i class="fa-solid fa-globe"></i> 开启通识补充并重新作答' +
            '</button>' +
          '</div>';
      }

      bubble.innerHTML = bodyHtml + citationsHtml + fallbackActionHtml;

      // 绑定点击引用展示原文切片与跳转
      bubble.querySelectorAll('.sr-citation-badge').forEach(function(badge) {
        badge.onclick = function() {
          var next = badge.nextElementSibling;
          if (next && next.classList.contains('sr-citation-box')) {
            next.style.display = next.style.display === 'none' ? 'block' : 'none';
          }
        };
      });

      bubble.querySelectorAll('.sr-btn-jump-chunk').forEach(function(btn) {
        btn.onclick = function() {
          var docId = btn.getAttribute('data-doc');
          var chap = btn.getAttribute('data-chap');
          var allDocs = (window.StudySearchIndex && window.StudySearchIndex.documents) || [];
          var doc = allDocs.find(function(d) { return d.id === docId; }) || allDocs[0];
          openDocChunksModal(container, doc, chap);
        };
      });

      // 绑定一键允许通识并重新提问
      var gkBtn = bubble.querySelector('.sr-btn-enable-gk');
      if (gkBtn) {
        gkBtn.onclick = function() {
          _state.allowGeneralKnowledge = true;
          var allowCheck = container.querySelector('#sr-ast-allow-gk');
          if (allowCheck) allowCheck.checked = true;

          var lastUserMsg = '';
          for (var i = _state.assistantMessages.length - 1; i >= 0; i--) {
            if (_state.assistantMessages[i].sender === 'user') {
              lastUserMsg = _state.assistantMessages[i].text;
              break;
            }
          }
          if (lastUserMsg) {
            var input = container.querySelector('#sr-ast-input');
            if (input) input.value = lastUserMsg;
            var sBtn = container.querySelector('#sr-ast-send');
            if (sBtn) sBtn.click();
          }
        };
      }

      chatBox.appendChild(bubble);
    });

    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // ====================================================
  // 5. 阶段 4 智能题库与错题 (Smart Quiz & Mistakes)
  // 支持按章节/错题出题、选择/填空/简答、Char考官模式
  // ====================================================
  function renderQuizPage(container, viewport) {
    var quizEl = document.createElement('div');
    quizEl.className = 'sr-quiz-container';

    // 确保有题目
    if (!_state.activeQuizList || !_state.activeQuizList.length) {
      _state.activeQuizList = window.StudyAIEngine.generateQuiz({
        scope: 'all',
        qType: 'mixed',
        difficulty: 'normal',
        count: 3
      });
    }

    quizEl.innerHTML =
      // 模式切换条：自主刷题 vs Char 考官模式
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:-4px;">' +
        '<div class="sr-ast-mode-tabs" style="width:230px;">' +
          '<button type="button" class="sr-ast-mode-tab' + (_state.quizMode === 'self' ? ' active' : '') + '" data-qm="self">' +
            '<i class="fa-solid fa-pen-to-square"></i> 自主刷题' +
          '</button>' +
          '<button type="button" class="sr-ast-mode-tab' + (_state.quizMode === 'examiner' ? ' active' : '') + '" data-qm="examiner">' +
            '<i class="fa-solid fa-user-tie"></i> Char 考官抽查' +
          '</button>' +
        '</div>' +
        '<button type="button" class="pl-btn-secondary" id="sr-btn-quiz-cfg" style="padding:4px 10px;font-size:11px;">' +
          '<i class="fa-solid fa-sliders"></i> 出题配置' +
        '</button>' +
      '</div>' +

      // 题目挂载槽
      '<div id="sr-quiz-mount-slot"></div>';

    viewport.appendChild(quizEl);

    // 绑定题库模式切换
    quizEl.querySelectorAll('.sr-ast-mode-tab[data-qm]').forEach(function(b) {
      b.onclick = function() {
        _state.quizMode = b.getAttribute('data-qm');
        _state.examinerCurrentIndex = 0;
        quizEl.querySelectorAll('.sr-ast-mode-tab[data-qm]').forEach(function(x) { x.classList.remove('active'); });
        b.classList.add('active');
        renderActiveQuizView(quizEl, container);
      };
    });

    // 绑定出题配置弹窗
    quizEl.querySelector('#sr-btn-quiz-cfg').onclick = function() {
      openQuizConfigModal(container);
    };

    renderActiveQuizView(quizEl, container);
  }

  function renderActiveQuizView(parentEl, container) {
    var slot = parentEl.querySelector('#sr-quiz-mount-slot');
    if (!slot) return;
    slot.innerHTML = '';

    if (!_state.activeQuizList || !_state.activeQuizList.length) {
      slot.innerHTML =
        '<div style="text-align:center;padding:48px 16px;color:var(--c-sub);font-size:12px;">' +
          '<i class="fa-solid fa-brain" style="font-size:32px;margin-bottom:10px;display:block;opacity:0.3;"></i>' +
          '题库当前为空白状态' +
          '<div style="font-size:11px;color:var(--c-hint);margin-top:6px;">请先在「资料库」中导入你的教材或笔记，AI 即可为你智能生成专属练习题！</div>' +
        '</div>';
      return;
    }

    if (_state.quizMode === 'examiner') {
      renderExaminerModeStage(slot, container);
    } else {
      renderSelfStudyQuizCards(slot, container);
    }
  }

  // 1. 自主刷题模式
  function renderSelfStudyQuizCards(slot, container) {
    var questions = _state.activeQuizList;

    questions.forEach(function(q, qIdx) {
      var card = document.createElement('div');
      card.className = 'sr-quiz-card';

      var typeBadge = '<span class="sr-doc-badge">' + esc(q.typeName || '题目') + '</span>';
      var sourceBadge = '<span class="sr-citation-badge" style="margin:0;font-size:10px;"><i class="fa-solid fa-quote-left"></i> ' + esc(q.sourceDocTitle || '教材') + ' ' + esc(q.sourceChapter || '') + '</span>';

      card.innerHTML =
        '<div class="sr-quiz-meta">' +
          '<div>' + typeBadge + ' <span style="font-size:11px;color:var(--c-sub);">第 ' + (qIdx + 1) + ' / ' + questions.length + ' 题</span></div>' +
          sourceBadge +
        '</div>' +
        '<div class="sr-quiz-question">' + esc(q.question) + '</div>' +
        '<div class="sr-quiz-body-slot"></div>' +
        '<div class="sr-quiz-feedback-slot"></div>';

      var bodySlot = card.querySelector('.sr-quiz-body-slot');
      var fbSlot = card.querySelector('.sr-quiz-feedback-slot');

      if (q.type === 'single') {
        // 单选题
        var optGroup = document.createElement('div');
        optGroup.className = 'sr-quiz-options';
        (q.options || []).forEach(function(optText, idx) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'sr-quiz-opt-btn';
          btn.innerHTML = '<b>' + String.fromCharCode(65 + idx) + '.</b> <span>' + esc(optText) + '</span>';

          btn.onclick = function() {
            var isCorrect = idx === q.answerIndex;
            if (isCorrect) {
              btn.classList.add('correct');
              window.toast && window.toast('作答正确！👏');
            } else {
              btn.classList.add('wrong');
              var allBtns = optGroup.querySelectorAll('.sr-quiz-opt-btn');
              if (allBtns[q.answerIndex]) allBtns[q.answerIndex].classList.add('correct');

              recordEnhancedMistake(q, optText, q.standardAnswer, '概念未完全掌握');
              window.toast && window.toast('答错啦，已自动将原题与资料出处收录至错题本！');
            }

            fbSlot.innerHTML =
              '<div class="sr-quiz-explain-box" style="margin-top:10px;">' +
                '<b>【标准解析】</b> ' + esc(q.explain) + '<br>' +
                '<span style="font-size:10px;color:var(--c-sub);">出处：' + esc(q.sourceDocTitle) + ' ' + esc(q.sourceChapter) + ' (第 ' + (q.sourcePage || 1) + ' 页)</span>' +
              '</div>';
          };
          optGroup.appendChild(btn);
        });
        bodySlot.appendChild(optGroup);

      } else if (q.type === 'blank') {
        // 填空题
        bodySlot.innerHTML =
          '<div style="display:flex;gap:6px;margin:8px 0;">' +
            '<input type="text" class="input-field sr-blank-input" placeholder="输入填空作答...">' +
            '<button type="button" class="pl-btn-primary sr-blank-submit" style="padding:4px 14px;font-size:11px;">核对</button>' +
          '</div>';

        var bInput = bodySlot.querySelector('.sr-blank-input');
        bodySlot.querySelector('.sr-blank-submit').onclick = function() {
          var val = bInput.value.trim();
          if (!val) return;
          var isMatch = val.toLowerCase() === (q.standardAnswer || '').trim().toLowerCase();
          if (isMatch) {
            window.toast && window.toast('填空完全正确！✨');
          } else {
            recordEnhancedMistake(q, val, q.standardAnswer, '填空词条识记偏差');
            window.toast && window.toast('填空不准确，已收录至错题本');
          }

          fbSlot.innerHTML =
            '<div class="sr-quiz-explain-box" style="margin-top:8px;">' +
              '<b>标准答案：</b><span style="color:#22c55e;font-weight:600;">' + esc(q.standardAnswer) + '</span><br>' +
              '<b>【解析】</b> ' + esc(q.explain) +
            '</div>';
        };

      } else if (q.type === 'subjective') {
        // 简答题
        bodySlot.innerHTML =
          '<textarea class="sr-subjective-input" placeholder="输入你的简答与推导过程..."></textarea>' +
          '<div style="display:flex;justify-content:flex-end;margin-top:6px;">' +
            '<button type="button" class="pl-btn-primary sr-subj-submit" style="padding:4px 14px;font-size:11px;">提交并评分</button>' +
          '</div>';

        var sInput = bodySlot.querySelector('.sr-subjective-input');
        bodySlot.querySelector('.sr-subj-submit').onclick = function() {
          var userAns = sInput.value.trim();
          if (!userAns) {
            window.toast && window.toast('请先填写作答');
            return;
          }

          var evalRes = window.StudyAIEngine.evaluateSubjectiveAnswer(q, userAns);

          if (evalRes.score < 60) {
            recordEnhancedMistake(q, userAns, q.standardAnswer, '简答要点覆盖不全');
          }

          fbSlot.innerHTML =
            '<div class="sr-quiz-explain-box" style="margin-top:10px;">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
                '<span class="sr-score-badge">' + evalRes.score + ' 分 · ' + evalRes.level + '</span>' +
                '<span style="font-size:10px;color:var(--c-sub);">' + esc(evalRes.sourceLocation) + '</span>' +
              '</div>' +
              '<div><b>评语：</b>' + esc(evalRes.feedback) + '</div>' +
              '<div style="margin-top:4px;color:var(--c-sub);"><b>教材参考答案：</b>' + esc(evalRes.standardAnswer) + '</div>' +
            '</div>';
        };
      }

      slot.appendChild(card);
    });
  }

  // 2. Char 考官抽查模式 (Examiner Mode)
  function renderExaminerModeStage(slot, container) {
    var char = _state.companionChar || { name: '林弯弯', avatar: 'img/wanwan.png' };
    var questions = _state.activeQuizList;
    var idx = _state.examinerCurrentIndex % questions.length;
    var q = questions[idx];

    var examBox = document.createElement('div');
    examBox.className = 'sr-examiner-stage';

    examBox.innerHTML =
      '<div class="sr-examiner-header">' +
        '<img class="sr-examiner-avatar" src="' + esc(char.avatar) + '" onerror="this.src=\'img/wanwan.png\'">' +
        '<div class="sr-examiner-speech">' +
          '<b>考官 ' + esc(char.name) + '：</b><br>' +
          '“现在进行第 ' + (idx + 1) + ' / ' + questions.length + ' 题随堂口试。认真思考后再回答哦！”' +
        '</div>' +
      '</div>' +

      '<div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-sm);padding:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--c-sub);margin-bottom:4px;">' +
          '<span>' + esc(q.typeName || '题目') + '</span>' +
          '<span>来源：《' + esc(q.sourceDocTitle) + '》</span>' +
        '</div>' +
        '<div style="font-size:13px;font-weight:600;color:var(--c-text);line-height:1.5;">' + esc(q.question) + '</div>' +
      '</div>' +

      '<div id="sr-examiner-input-slot"></div>' +
      '<div id="sr-examiner-eval-slot"></div>' +

      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">' +
        '<button type="button" class="pl-btn-secondary" id="sr-exam-prev" style="padding:4px 10px;font-size:11px;">上一题</button>' +
        '<button type="button" class="pl-btn-primary" id="sr-exam-next" style="padding:4px 14px;font-size:11px;">下一题</button>' +
      '</div>';

    var inputSlot = examBox.querySelector('#sr-examiner-input-slot');
    var evalSlot = examBox.querySelector('#sr-examiner-eval-slot');

    if (q.type === 'single') {
      var optWrap = document.createElement('div');
      optWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
      q.options.forEach(function(optText, optIdx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sr-quiz-opt-btn';
        btn.innerHTML = '<b>' + String.fromCharCode(65 + optIdx) + '.</b> ' + esc(optText);
        btn.onclick = function() {
          var ok = optIdx === q.answerIndex;
          if (!ok) {
            recordEnhancedMistake(q, optText, q.standardAnswer, '考官抽查未通过');
          }
          evalSlot.innerHTML =
            '<div class="sr-quiz-explain-box" style="margin-top:8px;">' +
              '<b style="color:' + (ok ? '#22c55e' : '#ef4444') + ';">考官点评：' + (ok ? '回答非常干脆准确，加 10 分！' : '哎呀答偏啦，记进你的错题本里咯！') + '</b><br>' +
              '<b>标准解析：</b>' + esc(q.explain) +
            '</div>';
        };
        optWrap.appendChild(btn);
      });
      inputSlot.appendChild(optWrap);
    } else {
      inputSlot.innerHTML =
        '<textarea class="sr-subjective-input" id="sr-exam-text-ans" placeholder="在此作答你的答案..."></textarea>' +
        '<button type="button" class="pl-btn-primary" id="sr-exam-submit-ans" style="margin-top:6px;width:100%;">请考官审阅并点评</button>';

      inputSlot.querySelector('#sr-exam-submit-ans').onclick = function() {
        var txt = inputSlot.querySelector('#sr-exam-text-ans').value.trim();
        var ev = window.StudyAIEngine.evaluateSubjectiveAnswer(q, txt);
        if (ev.score < 60) {
          recordEnhancedMistake(q, txt, q.standardAnswer, '考官主观口试扣分');
        }
        evalSlot.innerHTML =
          '<div class="sr-quiz-explain-box" style="margin-top:8px;">' +
            '<div style="font-weight:600;color:' + (ev.score >= 60 ? '#22c55e' : '#ef4444') + ';">得分：' + ev.score + ' 分 · ' + ev.feedback + '</div>' +
            '<div style="margin-top:4px;"><b>标准要点：</b>' + esc(ev.standardAnswer) + '</div>' +
          '</div>';
      };
    }

    examBox.querySelector('#sr-exam-prev').onclick = function() {
      if (_state.examinerCurrentIndex > 0) {
        _state.examinerCurrentIndex--;
        renderActiveQuizView(slot.parentElement, container);
      }
    };
    examBox.querySelector('#sr-exam-next').onclick = function() {
      _state.examinerCurrentIndex++;
      renderActiveQuizView(slot.parentElement, container);
    };

    slot.appendChild(examBox);
  }

  // 出题配置弹窗
  function openQuizConfigModal(container) {
    var root = container.querySelector('#sr-modal-root');
    if (!root) return;

    var docs = (window.StudySearchIndex && window.StudySearchIndex.documents) || [];

    root.innerHTML =
      '<div class="sr-modal-mask" id="sr-quiz-mask">' +
        '<div class="sr-modal-panel">' +
          '<div class="sr-modal-header">' +
            '<span><i class="fa-solid fa-sliders"></i> 智能题库出题配置</span>' +
            '<button type="button" class="pl-btn-secondary" id="sr-quiz-cfg-close" style="padding:2px 8px;"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +

          '<div style="font-size:12px;color:var(--c-sub);">出题资料来源：</div>' +
          '<select class="sr-set-select" id="sr-cfg-scope" style="width:100%;">' +
            '<option value="all">综合全量资料库 (' + docs.length + ' 份)</option>' +
            '<option value="mistakes">针对错题本薄弱点强化 (' + _state.mistakes.length + ' 道错题)</option>' +
            docs.map(function(d) {
              return '<option value="' + d.id + '">《' + esc(d.title) + '》</option>';
            }).join('') +
          '</select>' +

          '<div style="font-size:12px;color:var(--c-sub);margin-top:4px;">题目类型：</div>' +
          '<select class="sr-set-select" id="sr-cfg-type" style="width:100%;">' +
            '<option value="mixed" selected>混合题型 (单选+填空+简答)</option>' +
            '<option value="single">纯客观单选题</option>' +
            '<option value="blank">知识点填空题</option>' +
            '<option value="subjective">深度论述简答题</option>' +
          '</select>' +

          '<div style="font-size:12px;color:var(--c-sub);margin-top:4px;">难度与题数：</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<select class="sr-set-select" id="sr-cfg-diff" style="flex:1;">' +
              '<option value="easy">基础识记</option>' +
              '<option value="normal" selected>理解应用</option>' +
              '<option value="hard">综合分析</option>' +
            '</select>' +
            '<select class="sr-set-select" id="sr-cfg-count" style="flex:1;">' +
              '<option value="3" selected>3 道考题</option>' +
              '<option value="5">5 道考题</option>' +
              '<option value="10">10 道考题</option>' +
            '</select>' +
          '</div>' +

          '<button type="button" class="pl-btn-primary" id="sr-cfg-generate-btn" style="margin-top:8px;">立即生成全新题库并开始考核</button>' +
        '</div>' +
      '</div>';

    root.querySelector('#sr-quiz-mask').onclick = function(e) {
      if (e.target.id === 'sr-quiz-mask') root.innerHTML = '';
    };
    root.querySelector('#sr-quiz-cfg-close').onclick = function() {
      root.innerHTML = '';
    };

    root.querySelector('#sr-cfg-generate-btn').onclick = function() {
      var scopeVal = root.querySelector('#sr-cfg-scope').value;
      var typeVal = root.querySelector('#sr-cfg-type').value;
      var diffVal = root.querySelector('#sr-cfg-diff').value;
      var countVal = parseInt(root.querySelector('#sr-cfg-count').value, 10);

      if (scopeVal === 'mistakes' && (!_state.mistakes || !_state.mistakes.length)) {
        window.toast && window.toast('错题本中目前暂无错题，已自动切换为综合全量资料库出题！');
        scopeVal = 'all';
      }

      window.toast && window.toast('正在依据资料库与切片索引智能出题...');
      _state.activeQuizList = window.StudyAIEngine.generateQuiz({
        scope: scopeVal,
        qType: typeVal,
        difficulty: diffVal,
        count: countVal,
        mistakes: _state.mistakes
      });
      _state.examinerCurrentIndex = 0;

      root.innerHTML = '';
      window.toast && window.toast('全新题库生成就绪！');
      renderActiveTabPage(container);
    };
  }

  // 增强型错题记录 (含资料来源、错误原因、复习计划)
  function recordEnhancedMistake(q, userPick, correctAnswer, errorReason) {
    var exists = _state.mistakes.some(function(m) { return m.question === q.question; });
    if (!exists) {
      _state.mistakes.unshift({
        id: uid('mst_'),
        question: q.question,
        category: q.category || q.typeName || '综合考点',
        userPick: userPick,
        correctAnswer: correctAnswer,
        explain: q.explain,
        sourceDocTitle: q.sourceDocTitle || '教材资料',
        sourceChapter: q.sourceChapter || '核心章节',
        sourcePage: q.sourcePage || 1,
        errorReason: errorReason || '概念识记混淆',
        reviewPlan: '建议重温《' + (q.sourceDocTitle || '教材') + '》对应章节并在 24 小时内重新抽测',
        time: Date.now(),
        mastered: false
      });
      saveStorage(STORAGE_KEYS.MISTAKES, _state.mistakes);
    }
  }

  // ====================================================
  // 6. 错题本 (Mistakes Notebook)
  // 保存原题、答案、解析、资料来源、错误原因与复习计划，可恢复
  // ====================================================
  function renderMistakesPage(container, viewport) {
    var misEl = document.createElement('div');
    misEl.className = 'sr-mistake-container';

    misEl.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<span style="font-size:13px;font-weight:600;color:var(--c-text);"><i class="fa-solid fa-book-open-reader"></i> 错题本与薄弱环节 (' + _state.mistakes.length + ')</span>' +
        '<button type="button" class="pl-btn-secondary" id="sr-clear-mistakes-btn" style="padding:2px 8px;font-size:10px;">清空错题</button>' +
      '</div>' +
      '<div id="sr-mistakes-list" style="display:flex;flex-direction:column;gap:10px;"></div>';

    viewport.appendChild(misEl);

    misEl.querySelector('#sr-clear-mistakes-btn').onclick = function() {
      if (!confirm('确定要清空全部错题记录吗？')) return;
      _state.mistakes = [];
      saveStorage(STORAGE_KEYS.MISTAKES, _state.mistakes);
      renderEnhancedMistakeCards(misEl, container);
    };

    renderEnhancedMistakeCards(misEl, container);
  }

  function renderEnhancedMistakeCards(parentEl, container) {
    var list = parentEl.querySelector('#sr-mistakes-list');
    if (!list) return;
    list.innerHTML = '';

    if (!_state.mistakes.length) {
      list.innerHTML =
        '<div style="padding:40px 0;text-align:center;color:var(--c-hint);font-size:12px;">' +
          '<i class="fa-solid fa-circle-check" style="font-size:28px;margin-bottom:8px;display:block;color:#22c55e;"></i>' +
          '错题本干干净净！做错的题目将自动附带教材来源与复习计划记录于此。' +
        '</div>';
      return;
    }

    _state.mistakes.forEach(function(m, idx) {
      var card = document.createElement('div');
      card.className = 'sr-mistake-card';

      var sourceText = m.sourceDocTitle ? '《' + m.sourceDocTitle + '》 ' + (m.sourceChapter || '') + ' (第 ' + (m.sourcePage || 1) + ' 页)' : '通识资料';

      card.innerHTML =
        '<div class="sr-mistake-header">' +
          '<span><i class="fa-solid fa-tag"></i> ' + esc(m.category) + '</span>' +
          '<span style="color:' + (m.mastered ? '#22c55e' : '#ef4444') + ';font-weight:600;">' + (m.mastered ? '已攻克掌握' : '需重点复习') + '</span>' +
        '</div>' +
        '<div class="sr-mistake-title">' + esc(m.question) + '</div>' +
        '<div class="sr-mistake-ans-row">' +
          '<div style="color:#ef4444;"><span class="sr-ans-badge" style="background:rgba(239,68,68,0.1);">你的作答</span> ' + esc(m.userPick) + '</div>' +
          '<div style="color:#22c55e;"><span class="sr-ans-badge" style="background:rgba(34,197,94,0.1);">标准答案</span> ' + esc(m.correctAnswer) + '</div>' +
          '<div style="color:var(--c-sub);margin-top:2px;"><b>资料来源：</b><span style="color:#2563eb;">' + esc(sourceText) + '</span></div>' +
          '<div style="color:var(--c-sub);"><b>解析：</b>' + esc(m.explain) + '</div>' +
          '<div style="background:var(--c-surface-2);padding:6px;border-radius:4px;margin-top:4px;font-size:10px;color:var(--c-sub);">' +
            '<b>错因分析：</b>' + esc(m.errorReason || '审题不细致') + '<br>' +
            '<b>复习计划：</b>' + esc(m.reviewPlan || '今日再次重测') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px;">' +
          '<button type="button" class="pl-btn-secondary sr-m-retest-btn" style="padding:2px 8px;font-size:10px;">再次重测</button>' +
          '<button type="button" class="pl-btn-secondary sr-m-toggle-btn" style="padding:2px 8px;font-size:10px;">' + (m.mastered ? '重标为需复习' : '标记已掌握') + '</button>' +
          '<button type="button" class="pl-btn-secondary sr-m-del-btn" style="padding:2px 8px;font-size:10px;color:#ef4444;">移除</button>' +
        '</div>';

      card.querySelector('.sr-m-toggle-btn').onclick = function() {
        m.mastered = !m.mastered;
        saveStorage(STORAGE_KEYS.MISTAKES, _state.mistakes);
        renderEnhancedMistakeCards(parentEl, container);
      };

      card.querySelector('.sr-m-retest-btn').onclick = function() {
        _state.activeQuizList = [
          {
            id: uid('retest_'),
            type: 'single',
            typeName: '错题重测',
            question: m.question,
            options: [m.correctAnswer, m.userPick, '无关干扰项A', '无关干扰项B'].sort(function() { return 0.5 - Math.random(); }),
            answerIndex: 0,
            standardAnswer: m.correctAnswer,
            explain: m.explain,
            sourceDocTitle: m.sourceDocTitle,
            sourceChapter: m.sourceChapter,
            sourcePage: m.sourcePage
          }
        ];
        _state.activeQuizList[0].answerIndex = _state.activeQuizList[0].options.indexOf(m.correctAnswer);
        switchTab(container, 'quiz');
        window.toast && window.toast('已载入错题重测！');
      };

      card.querySelector('.sr-m-del-btn').onclick = function() {
        _state.mistakes.splice(idx, 1);
        saveStorage(STORAGE_KEYS.MISTAKES, _state.mistakes);
        renderEnhancedMistakeCards(parentEl, container);
        window.toast && window.toast('已从错题本移除');
      };

      list.appendChild(card);
    });
  }

  // ====================================================
  // 7. 学习报告 (Study Analytics Report)
  // ====================================================
  function renderReportPage(container, viewport) {
    var rptEl = document.createElement('div');
    rptEl.className = 'sr-report-container';

    var char = _state.companionChar || { name: '林弯弯', avatar: 'img/wanwan.png' };

    rptEl.innerHTML =
      // 角色评语卡片
      '<div class="sr-report-badge-box">' +
        '<img class="sr-badge-avatar" src="' + esc(char.avatar) + '" onerror="this.src=\'img/wanwan.png\'">' +
        '<div>' +
          '<div class="sr-report-comment-title">' + esc(char.name) + ' 的伴读评语</div>' +
          '<div class="sr-report-comment-body">' +
            (_state.pomodorosToday > 0 ?
              ('“今天专注力非常卓越，已经坚持完成了 ' + _state.pomodorosToday + ' 个番茄钟！思维清晰敏捷，继续保持这个节奏，期待明天也和你并肩自习～”') :
              ('“今天还没有开启专注打卡哦，准备好了就点击进入双人自习，我们一起开启今天的自习之旅吧～”')) +
          '</div>' +
        '</div>' +
      '</div>' +

      // 核心统计卡片
      '<div class="sr-hall-stats-row">' +
        '<div class="sr-stat-card">' +
          '<div class="sr-stat-val">' + _state.totalMinutesToday + '</div>' +
          '<div class="sr-stat-lbl">今日专注时长(分)</div>' +
        '</div>' +
        '<div class="sr-stat-card">' +
          '<div class="sr-stat-val">' + _state.pomodorosToday + '</div>' +
          '<div class="sr-stat-lbl">今日番茄总数</div>' +
        '</div>' +
        '<div class="sr-stat-card">' +
          '<div class="sr-stat-val">' + _state.streakDays + '</div>' +
          '<div class="sr-stat-lbl">连续自习打卡天数</div>' +
        '</div>' +
      '</div>' +

      // 7日专注趋势柱状图
      '<div class="sr-chart-box">' +
        '<div style="font-size:12px;font-weight:600;color:var(--c-text);"><i class="fa-solid fa-chart-simple"></i> 近 7 日专注时长趋势 (分钟)</div>' +
        '<div class="sr-chart-bars-wrap">' +
          renderWeeklyBars() +
        '</div>' +
      '</div>' +

      // 任务类型分布
      '<div class="sr-chart-box">' +
        '<div style="font-size:12px;font-weight:600;color:var(--c-text);margin-bottom:6px;"><i class="fa-solid fa-chart-pie"></i> 任务类型分布</div>' +
        '<div class="sr-distrib-row">' +
          '<div style="width:50%;background:#3b82f6;height:100%;" title="学习 50%"></div>' +
          '<div style="width:25%;background:#10b981;height:100%;" title="阅读 25%"></div>' +
          '<div style="width:15%;background:#f59e0b;height:100%;" title="写作 15%"></div>' +
          '<div style="width:10%;background:#ec4899;height:100%;" title="工作 10%"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--c-sub);margin-top:6px;">' +
          '<span>🔵 学习 50%</span><span>🟢 阅读 25%</span><span>🟡 写作 15%</span><span>🟣 工作 10%</span>' +
        '</div>' +
      '</div>';

    viewport.appendChild(rptEl);
  }

  function renderWeeklyBars() {
    var days = ['6天前', '5天前', '4天前', '3天前', '前天', '昨天', '今天'];
    var dayMinutes = [0, 0, 0, 0, 0, 0, 0];
    var now = new Date();
    for (var i = 0; i < 7; i++) {
      var d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      var dStr = d.toISOString().slice(0, 10);
      dayMinutes[i] = (_state.records || []).filter(function(r) {
        return r && r.date && r.date.slice(0, 10) === dStr;
      }).reduce(function(sum, r) {
        return sum + (Number(r.durationMinutes) || 0);
      }, 0);
    }
    dayMinutes[6] = Math.max(dayMinutes[6], _state.totalMinutesToday);

    return days.map(function(d, i) {
      var m = dayMinutes[i];
      var barH = m > 0 ? Math.min(100, Math.max(10, Math.round(m * 1.2))) : 4;
      return '<div class="sr-chart-col">' +
        '<div class="sr-chart-bar" style="height:' + barH + 'px;' + (m === 0 ? 'opacity:0.25;' : '') + '" title="' + d + ': ' + m + ' 分钟"></div>' +
        '<div class="sr-chart-day">' + d + '</div>' +
      '</div>';
    }).join('');
  }

  // ====================================================

  // 角色档案选择弹窗（自习室切换陪伴对象专属）
  async function openCompanionSelectorModal(container) {
    var root = container.querySelector('#sr-modal-root');
    if (!root) return;

    var allChars = [];
    try {
      if (window.db && db.characters) {
        allChars = await db.characters.toArray();
      }
    } catch (e) {}

    // 如果数据库中尚无角色，提供兜底角色林弯弯
    if (!allChars || allChars.length === 0) {
      allChars = [
        {
          id: 'char_default',
          name: '林弯弯',
          avatar: 'img/wanwan.png',
          personality: '温柔体贴、善解人意，专注时默默守护，休息时悉心关怀',
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
        '<div class="sr-modal-mask" id="sr-companion-mask">' +
          '<div class="sr-modal-panel">' +
            '<div class="sr-modal-header">' +
              '<span>选择双人自习陪伴对象</span>' +
              '<button type="button" class="pl-btn-secondary" id="sr-companion-close" style="padding:2px 8px;"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +

            // 分类筛选标签
            '<div style="display:flex;gap:6px;align-items:center;overflow-x:auto;padding-bottom:2px;">' +
              '<button type="button" class="pl-btn-secondary sr-cfilter-btn' + (currentFilter === 'all' ? ' active' : '') + '" data-filter="all" style="padding:4px 10px;font-size:11px;' + (currentFilter === 'all' ? 'border-color:var(--c-text);font-weight:600;' : '') + '">全部 (' + allChars.length + ')</button>' +
              '<button type="button" class="pl-btn-secondary sr-cfilter-btn' + (currentFilter === 'char' ? ' active' : '') + '" data-filter="char" style="padding:4px 10px;font-size:11px;' + (currentFilter === 'char' ? 'border-color:var(--c-text);font-weight:600;' : '') + '">CHAR 主角</button>' +
              '<button type="button" class="pl-btn-secondary sr-cfilter-btn' + (currentFilter === 'npc' ? ' active' : '') + '" data-filter="npc" style="padding:4px 10px;font-size:11px;' + (currentFilter === 'npc' ? 'border-color:var(--c-text);font-weight:600;' : '') + '">NPC 配角</button>' +
              '<button type="button" class="pl-btn-secondary sr-cfilter-btn' + (currentFilter === 'user' ? ' active' : '') + '" data-filter="user" style="padding:4px 10px;font-size:11px;' + (currentFilter === 'user' ? 'border-color:var(--c-text);font-weight:600;' : '') + '">USER 用户</button>' +
            '</div>' +

            // 搜索框
            '<div style="position:relative;">' +
              '<input type="text" class="input-field" id="sr-companion-search" value="' + esc(searchKeyword) + '" placeholder="搜索角色名称、性格或简介..." style="width:100%;padding-right:28px;">' +
              (searchKeyword ? '<i class="fa-solid fa-circle-xmark" id="sr-clear-search" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--c-sub);"></i>' : '') +
            '</div>' +

            // 角色卡片列表
            '<div class="sr-char-select-list" id="sr-char-list">' +
              (filtered.length === 0
                ? '<div style="text-align:center;padding:24px 0;color:var(--c-sub);font-size:12px;"><i class="fa-solid fa-user-slash" style="font-size:24px;margin-bottom:8px;display:block;opacity:0.4;"></i>未找到匹配的角色档案</div>'
                : filtered.map(function(c) {
                    var isSelected = String(c.id) === curId;
                    var typeLabel = getCharTypeLabel(c.type || 'char');
                    var desc = c.personality || c.bio || c.lorebook || '暂无设定简介';
                    return (
                      '<div class="sr-char-select-item' + (isSelected ? ' selected' : '') + '" data-char-id="' + esc(c.id) + '">' +
                        '<img class="sr-char-select-avatar" src="' + esc(c.avatar || 'img/wanwan.png') + '" onerror="this.src=\'img/wanwan.png\'">' +
                        '<div class="sr-char-select-info">' +
                          '<div class="sr-char-select-name-row">' +
                            '<span class="sr-char-select-name">' + esc(c.name || '未命名角色') + '</span>' +
                            '<span class="sr-char-select-type">' + esc(typeLabel) + '</span>' +
                            (isSelected ? '<span style="font-size:10px;color:var(--c-primary, #6366f1);font-weight:600;margin-left:auto;">当前同桌</span>' : '') +
                          '</div>' +
                          '<div class="sr-char-select-desc" title="' + esc(desc) + '">' + esc(desc) + '</div>' +
                        '</div>' +
                        (isSelected ? '<div class="sr-char-select-check"><i class="fa-solid fa-circle-check"></i></div>' : '') +
                      '</div>'
                    );
                  }).join('')) +
            '</div>' +

            '<div style="font-size:11px;color:var(--c-sub);display:flex;align-items:center;justify-content:space-between;padding-top:4px;border-top:1px solid var(--c-border);">' +
              '<span><i class="fa-solid fa-lightbulb" style="color:#f59e0b;"></i> 直接关联桌面「角色档案」中的全部角色</span>' +
              '<span style="font-size:10px;color:var(--c-hint);">选定后立绘与自习状态自动保存</span>' +
            '</div>' +
          '</div>' +
        '</div>';

      // 绑定交互事件
      root.querySelector('#sr-companion-mask').onclick = function(e) {
        if (e.target.id === 'sr-companion-mask') root.innerHTML = '';
      };
      root.querySelector('#sr-companion-close').onclick = function() {
        root.innerHTML = '';
      };

      root.querySelectorAll('.sr-cfilter-btn').forEach(function(btn) {
        btn.onclick = function() {
          currentFilter = btn.getAttribute('data-filter') || 'all';
          renderModalContent();
        };
      });

      var sInput = root.querySelector('#sr-companion-search');
      if (sInput) {
        sInput.oninput = function() {
          searchKeyword = sInput.value.trim();
          renderModalContent();
          var newIn = root.querySelector('#sr-companion-search');
          if (newIn) {
            newIn.focus();
            newIn.setSelectionRange(newIn.value.length, newIn.value.length);
          }
        };
      }

      var clearBtn = root.querySelector('#sr-clear-search');
      if (clearBtn) {
        clearBtn.onclick = function() {
          searchKeyword = '';
          renderModalContent();
        };
      }

      root.querySelectorAll('.sr-char-select-item').forEach(function(item) {
        item.onclick = function() {
          var cid = item.getAttribute('data-char-id');
          var chosen = allChars.find(function(c) { return String(c.id) === String(cid); });
          if (chosen) {
            switchCompanionChar(chosen, container);
            root.innerHTML = '';
          }
        };
      });
    }

    renderModalContent();
  }

  // 8. 设置页面 (Settings)
  // ====================================================

  // ====================================================
  // AI 提示词管理中心弹窗 (P0 核心交互)
  // 路径：自习室 → 设置 → AI 提示词管理中心
  // 支持两套分开存储：专业学习助手 vs Char 自习室附加规则
  // 支持按角色隔离、查看、编辑、保存、恢复默认、离开前未保存拦截
  // ====================================================
  async function openPromptManagerModal(container) {
    var root = container.querySelector('#sr-modal-root');
    if (!root) return;

    var allChars = [];
    try {
      if (window.db && db.characters) {
        allChars = await db.characters.toArray();
      }
    } catch (e) {}
    if (!allChars || !allChars.length) {
      allChars = [
        {
          id: 'char_default',
          name: '林弯弯',
          avatar: 'img/wanwan.png',
          personality: '温柔体贴、善解人意，专注时默默守护，休息时悉心关怀',
          type: 'char'
        }
      ];
    }

    var activeScope = 'study_assistant'; // 'study_assistant' | 'study_char_overlay'
    var selectedCharId = _state.companionChar ? String(_state.companionChar.id) : String(allChars[0].id);
    var selectedChar = allChars.find(function(c) { return String(c.id) === selectedCharId; }) || allChars[0];

    var currentProfile = null;
    var initialContent = '';
    var isDirty = false;

    // 辅助函数：格式化时间
    function formatTime(isoStr) {
      if (!isoStr || isoStr === '系统内置默认模板') return '系统内置默认模板';
      try {
        var d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;
        var pad = function(n) { return n < 10 ? '0' + n : n; };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      } catch (e) {
        return isoStr;
      }
    }

    // 未保存修改确认弹窗（拦截切换标签、切换角色、关闭离开）
    function guardUnsavedChanges(onProceed) {
      if (!isDirty) {
        onProceed();
        return;
      }

      var confirmMask = document.createElement('div');
      confirmMask.className = 'sr-modal-mask';
      confirmMask.style.zIndex = '10001';
      confirmMask.innerHTML =
        '<div class="sr-modal-panel" style="max-width:380px;margin:auto;">' +
          '<div class="sr-modal-header">' +
            '<span><i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;"></i> 未保存修改提醒</span>' +
            '<button type="button" class="pl-btn-secondary sr-guard-close" style="padding:2px 8px;"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div style="font-size:12px;color:var(--c-text);line-height:1.6;">' +
            '当前提示词已被修改但尚未保存。切换或离开将丢失当前的编辑内容。' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">' +
            '<button type="button" class="pl-btn-primary sr-guard-save"><i class="fa-solid fa-floppy-disk"></i> 保存修改并继续</button>' +
            '<button type="button" class="pl-btn-secondary sr-guard-discard" style="color:#ef4444;"><i class="fa-solid fa-trash-can"></i> 放弃修改</button>' +
            '<button type="button" class="pl-btn-secondary sr-guard-cancel">继续编辑</button>' +
          '</div>' +
        '</div>';

      root.appendChild(confirmMask);

      confirmMask.querySelector('.sr-guard-close').onclick = function() {
        confirmMask.remove();
      };
      confirmMask.querySelector('.sr-guard-cancel').onclick = function() {
        confirmMask.remove();
      };
      confirmMask.querySelector('.sr-guard-discard').onclick = function() {
        isDirty = false;
        confirmMask.remove();
        onProceed();
      };
      confirmMask.querySelector('.sr-guard-save').onclick = async function() {
        confirmMask.remove();
        var success = await executeSave();
        if (success) {
          onProceed();
        }
      };
    }

    // 执行保存
    async function executeSave() {
      var textarea = root.querySelector('#sr-pm-editor');
      if (!textarea) return false;
      var text = textarea.value.trim();
      if (!text) {
        window.toast && window.toast('⚠️ 提示词内容不能为空');
        return false;
      }
      if (text.length > 10000) {
        window.toast && window.toast('⚠️ 提示词过长（上限 10000 字）');
        return false;
      }

      try {
        currentProfile = await window.StudyPromptManager.savePromptProfile(
          activeScope,
          selectedChar.id,
          text,
          selectedChar.name
        );
        initialContent = currentProfile.content;
        isDirty = false;
        updateMetaDisplay();
        window.toast && window.toast('🎉 提示词已保存成功！下一次 AI 请求即刻生效');
        return true;
      } catch (err) {
        alert('保存失败：' + (err.message || '存储异常，请稍后重试'));
        return false;
      }
    }

    // 执行恢复默认
    function executeRestoreDefault() {
      var targetName = activeScope === 'study_assistant' ? '「专业学习助手」' : '「' + esc(selectedChar.name) + ' 的自习室规则」';
      if (!confirm('确定将 ' + targetName + ' 恢复为系统官方默认模板吗？\n\n注意：当前自定义的内容将被清除，重新载入内置默认版本。（不会影响另一类提示词或其他 Char）')) {
        return;
      }

      (async function() {
        try {
          currentProfile = await window.StudyPromptManager.resetPromptProfile(
            activeScope,
            selectedChar.id,
            selectedChar.name
          );
          initialContent = currentProfile.content;
          isDirty = false;

          var textarea = root.querySelector('#sr-pm-editor');
          if (textarea) textarea.value = currentProfile.content;

          updateMetaDisplay();
          window.toast && window.toast('已成功还原为系统内置默认提示词！');
        } catch (err) {
          alert('恢复默认失败：' + (err.message || '请重试'));
        }
      })();
    }

    // 复制提示词内容
    function executeCopy() {
      var textarea = root.querySelector('#sr-pm-editor');
      if (!textarea) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(textarea.value);
        window.toast && window.toast('提示词已复制到剪贴板！');
      } else {
        textarea.select();
        document.execCommand('copy');
        window.toast && window.toast('提示词已复制到剪贴板！');
      }
    }

    // 说明弹窗
    function showHelpModal() {
      var helpMask = document.createElement('div');
      helpMask.className = 'sr-modal-mask';
      helpMask.style.zIndex = '10002';
      helpMask.innerHTML =
        '<div class="sr-modal-panel" style="max-height:85%;">' +
          '<div class="sr-modal-header">' +
            '<span><i class="fa-solid fa-circle-question" style="color:var(--c-primary, #6366f1);"></i> 自习室 AI 提示词管理说明</span>' +
            '<button type="button" class="pl-btn-secondary sr-help-close" style="padding:2px 8px;"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div style="font-size:12px;line-height:1.7;color:var(--c-text);display:flex;flex-direction:column;gap:8px;">' +
            '<div><b>1. 两套独立提示词存储：</b><br><span style="color:var(--c-sub);">「专业学习助手」负责客观严谨的教材答疑、梳理、出题与批改；「Char 附加规则」负责角色在自习室中的伴读人设、鼓励与互动，两者完全隔离独立保存。</span></div>' +
            '<div><b>2. 按角色独立隔离：</b><br><span style="color:var(--c-sub);">每个 Char 的附加规则按其角色 ID 独立存储，修改林弯弯的规则绝不会改变苏星河或其他角色的自习行为。</span></div>' +
            '<div><b>3. 主线人设绝对安全：</b><br><span style="color:var(--c-sub);">自习室附加规则仅在陪伴自习室场景下叠加生效，绝不修改、覆盖或重置角色档案、世界书、人设背景、主线关系与私密记忆。</span></div>' +
            '<div><b>4. 即时生效与升级防丢：</b><br><span style="color:var(--c-sub);">保存后下一次向 AI 提问即可即刻读取最新提示词；用户自定义内容单独存储，系统升级绝不覆盖，随时可一键还原默认模板。</span></div>' +
          '</div>' +
          '<button type="button" class="pl-btn-primary sr-help-close" style="margin-top:6px;">我知道了</button>' +
        '</div>';

      root.appendChild(helpMask);
      helpMask.querySelectorAll('.sr-help-close').forEach(function(btn) {
        btn.onclick = function() { helpMask.remove(); };
      });
      helpMask.onclick = function(e) {
        if (e.target === helpMask) helpMask.remove();
      };
    }

    // 切换目标角色选择弹窗（自习室附加规则专属）
    function openCharPickerModal() {
      guardUnsavedChanges(function() {
        var pickerMask = document.createElement('div');
        pickerMask.className = 'sr-modal-mask';
        pickerMask.style.zIndex = '10001';
        pickerMask.innerHTML =
          '<div class="sr-modal-panel">' +
            '<div class="sr-modal-header">' +
              '<span>选择要配置提示词的目标角色</span>' +
              '<button type="button" class="pl-btn-secondary sr-picker-close" style="padding:2px 8px;"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div style="font-size:11px;color:var(--c-sub);">每个角色拥有独立的自习室附加提示词，互不影响：</div>' +
            '<div class="sr-char-select-list" style="max-height:320px;overflow-y:auto;">' +
              allChars.map(function(c) {
                var isCur = String(c.id) === String(selectedChar.id);
                return (
                  '<div class="sr-char-select-item' + (isCur ? ' selected' : '') + '" data-cid="' + esc(c.id) + '">' +
                    '<img class="sr-char-select-avatar" src="' + esc(c.avatar || 'img/wanwan.png') + '" onerror="this.src=\'img/wanwan.png\'" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">' +
                    '<div class="sr-char-select-info">' +
                      '<div class="sr-char-select-name-row">' +
                        '<span class="sr-char-select-name">' + esc(c.name || '未命名角色') + '</span>' +
                        '<span class="sr-char-select-type">' + esc(getCharTypeLabel(c.type || 'char')) + '</span>' +
                        (isCur ? '<span style="font-size:10px;color:var(--c-primary, #6366f1);font-weight:600;margin-left:auto;">当前选定</span>' : '') +
                      '</div>' +
                      '<div class="sr-char-select-desc">' + esc(c.personality || c.bio || '无简介') + '</div>' +
                    '</div>' +
                  '</div>'
                );
              }).join('') +
            '</div>' +
          '</div>';

        root.appendChild(pickerMask);

        pickerMask.querySelector('.sr-picker-close').onclick = function() {
          pickerMask.remove();
        };
        pickerMask.onclick = function(e) {
          if (e.target === pickerMask) pickerMask.remove();
        };

        pickerMask.querySelectorAll('.sr-char-select-item').forEach(function(item) {
          item.onclick = function() {
            var cid = item.getAttribute('data-cid');
            var chosen = allChars.find(function(c) { return String(c.id) === String(cid); });
            if (chosen) {
              selectedChar = chosen;
              selectedCharId = String(chosen.id);
              pickerMask.remove();
              loadAndRenderEditor();
            }
          };
        });
      });
    }

    // 刷新元数据状态展示
    function updateMetaDisplay() {
      if (!currentProfile) return;
      var titleLbl = root.querySelector('#sr-pm-title-lbl');
      if (titleLbl) {
        titleLbl.textContent = activeScope === 'study_assistant' ? '专业学习助手提示词' : selectedChar.name + ' · 自习室附加规则';
      }

      var verBadge = root.querySelector('#sr-pm-version-badge');
      if (verBadge) {
        verBadge.textContent = 'V' + (currentProfile.version || 1);
      }

      var typeBadge = root.querySelector('#sr-pm-type-badge');
      if (typeBadge) {
        if (currentProfile.isCustom) {
          typeBadge.textContent = '用户自定义版';
          typeBadge.style.color = '#22c55e';
          typeBadge.style.borderColor = '#22c55e';
        } else {
          typeBadge.textContent = '系统默认版';
          typeBadge.style.color = 'var(--c-sub)';
          typeBadge.style.borderColor = 'var(--c-border)';
        }
      }

      var statusBadge = root.querySelector('#sr-pm-status-badge');
      if (statusBadge) {
        statusBadge.style.display = isDirty ? 'inline-flex' : 'none';
      }

      var timeEl = root.querySelector('#sr-pm-updated-at');
      if (timeEl) {
        timeEl.textContent = '最后保存：' + formatTime(currentProfile.updatedAt);
      }

      var wordEl = root.querySelector('#sr-pm-word-count');
      var textarea = root.querySelector('#sr-pm-editor');
      if (wordEl && textarea) {
        wordEl.textContent = '当前字数：' + textarea.value.length + ' 字 (建议 100~2000 字)';
      }
    }

    // 载入当前作用域数据并渲染编辑器
    async function loadAndRenderEditor() {
      currentProfile = await window.StudyPromptManager.getPromptProfile(
        activeScope,
        selectedChar.id,
        selectedChar.name
      );
      initialContent = currentProfile.content;
      isDirty = false;

      // 更新标签状态
      root.querySelectorAll('.sr-pm-tab').forEach(function(tab) {
        tab.classList.toggle('active', tab.getAttribute('data-scope') === activeScope);
      });

      // 更新 Char 选择卡显示
      var charPickerEl = root.querySelector('#sr-pm-char-picker');
      if (charPickerEl) {
        if (activeScope === 'study_char_overlay') {
          charPickerEl.style.display = 'flex';
          var av = charPickerEl.querySelector('#sr-pm-char-avatar');
          if (av) av.src = selectedChar.avatar || 'img/wanwan.png';
          var nm = charPickerEl.querySelector('#sr-pm-char-name');
          if (nm) nm.textContent = selectedChar.name;
          var tp = charPickerEl.querySelector('#sr-pm-char-type');
          if (tp) tp.textContent = getCharTypeLabel(selectedChar.type || 'char');
        } else {
          charPickerEl.style.display = 'none';
        }
      }

      // 文本框赋值
      var textarea = root.querySelector('#sr-pm-editor');
      if (textarea) {
        textarea.value = currentProfile.content;
      }

      updateMetaDisplay();
    }

    // 主弹窗框架渲染
    root.innerHTML =
      '<div class="sr-modal-mask" id="sr-prompt-mgr-mask">' +
        '<div class="sr-modal-panel sr-pm-modal-panel">' +
          // 头部标题栏
          '<div class="sr-modal-header">' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<i class="fa-solid fa-wand-magic-sparkles" style="color:var(--c-primary, #6366f1);"></i>' +
              '<span>AI 提示词管理中心</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<button type="button" class="pl-btn-secondary" id="sr-pm-help-btn" style="padding:2px 8px;font-size:11px;" title="查看管理中心说明">' +
                '<i class="fa-solid fa-circle-question"></i> 说明' +
              '</button>' +
              '<button type="button" class="pl-btn-secondary" id="sr-pm-close-btn" style="padding:2px 8px;"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
          '</div>' +

          // 核心双标签切换条
          '<div class="sr-ast-mode-tabs" id="sr-pm-scope-tabs" style="width:100%;margin-bottom:0;">' +
            '<button type="button" class="sr-ast-mode-tab sr-pm-tab active" data-scope="study_assistant">' +
              '<i class="fa-solid fa-graduation-cap"></i> 专业学习助手' +
            '</button>' +
            '<button type="button" class="sr-ast-mode-tab sr-pm-tab" data-scope="study_char_overlay">' +
              '<i class="fa-solid fa-heart"></i> Char 自习室附加规则' +
            '</button>' +
          '</div>' +

          // Char 目标选择器卡片
          '<div class="sr-pm-char-picker" id="sr-pm-char-picker" style="display:none;">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<img id="sr-pm-char-avatar" src="' + esc(selectedChar.avatar || 'img/wanwan.png') + '" onerror="this.src=\'img/wanwan.png\'" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1.5px solid var(--c-primary, #6366f1);flex-shrink:0;">' +
              '<div>' +
                '<div style="display:flex;align-items:center;gap:6px;">' +
                  '<span id="sr-pm-char-name" style="font-weight:600;font-size:12px;color:var(--c-text);">' + esc(selectedChar.name) + '</span>' +
                  '<span class="sr-doc-badge" id="sr-pm-char-type">' + esc(getCharTypeLabel(selectedChar.type || 'char')) + '</span>' +
                '</div>' +
                '<div style="font-size:10px;color:var(--c-sub);">仅影响该角色的自习室伴读互动，修改不影响其他角色</div>' +
              '</div>' +
            '</div>' +
            '<button type="button" class="pl-btn-secondary" id="sr-pm-switch-char-btn" style="padding:3px 8px;font-size:10px;">' +
              '<i class="fa-solid fa-repeat"></i> 切换角色' +
            '</button>' +
          '</div>' +

          // 元信息栏
          '<div class="sr-pm-meta-bar">' +
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
              '<span style="font-weight:600;font-size:12px;color:var(--c-text);" id="sr-pm-title-lbl">专业学习助手提示词</span>' +
              '<span class="sr-doc-badge" id="sr-pm-version-badge">V1</span>' +
              '<span class="sr-doc-badge" id="sr-pm-type-badge">系统默认版</span>' +
              '<span class="sr-doc-badge sr-pm-status-dirty" id="sr-pm-status-badge" style="display:none;">未保存修改</span>' +
            '</div>' +
            '<div style="font-size:10px;color:var(--c-hint);" id="sr-pm-updated-at">最后保存：系统内置默认模板</div>' +
          '</div>' +

          // 编辑文本域
          '<div style="position:relative;width:100%;">' +
            '<textarea class="sr-pm-textarea" id="sr-pm-editor" placeholder="在此查看、编辑或自定义提示词正文..."></textarea>' +
          '</div>' +
          '<div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;color:var(--c-sub);margin-top:-6px;">' +
            '<span id="sr-pm-word-count">当前字数：0 字</span>' +
            '<span style="color:var(--c-hint);"><i class="fa-solid fa-bolt" style="color:#22c55e;"></i> 保存后下一次 AI 提问即生效</span>' +
          '</div>' +

          // 底部操作按钮行
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px;flex-wrap:wrap;">' +
            '<div style="display:flex;gap:6px;">' +
              '<button type="button" class="pl-btn-secondary" id="sr-pm-btn-restore" style="padding:5px 10px;font-size:11px;color:#ef4444;" title="还原为系统内置默认模板">' +
                '<i class="fa-solid fa-rotate-left"></i> 恢复默认' +
              '</button>' +
              '<button type="button" class="pl-btn-secondary" id="sr-pm-btn-copy" style="padding:5px 10px;font-size:11px;" title="复制提示词到剪贴板">' +
                '<i class="fa-solid fa-copy"></i> 复制' +
              '</button>' +
            '</div>' +
            '<button type="button" class="pl-btn-primary" id="sr-pm-btn-save" style="padding:5px 16px;font-size:11px;">' +
              '<i class="fa-solid fa-floppy-disk"></i> 保存修改' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // 绑定事件
    root.querySelector('#sr-prompt-mgr-mask').onclick = function(e) {
      if (e.target.id === 'sr-prompt-mgr-mask') {
        guardUnsavedChanges(function() {
          root.innerHTML = '';
        });
      }
    };

    root.querySelector('#sr-pm-close-btn').onclick = function() {
      guardUnsavedChanges(function() {
        root.innerHTML = '';
      });
    };

    root.querySelector('#sr-pm-help-btn').onclick = function() {
      showHelpModal();
    };

    // 标签切换
    root.querySelectorAll('.sr-pm-tab').forEach(function(tab) {
      tab.onclick = function() {
        var targetScope = tab.getAttribute('data-scope');
        if (targetScope !== activeScope) {
          guardUnsavedChanges(function() {
            activeScope = targetScope;
            loadAndRenderEditor();
          });
        }
      };
    });

    // 切换角色按钮
    var switchCharBtn = root.querySelector('#sr-pm-switch-char-btn');
    if (switchCharBtn) {
      switchCharBtn.onclick = function() {
        openCharPickerModal();
      };
    }

    // 文本域输入监听（标记未保存状态与字数统计）
    var textareaEl = root.querySelector('#sr-pm-editor');
    if (textareaEl) {
      textareaEl.oninput = function() {
        isDirty = (textareaEl.value !== initialContent);
        updateMetaDisplay();
      };
    }

    // 保存按钮
    root.querySelector('#sr-pm-btn-save').onclick = function() {
      executeSave();
    };

    // 恢复默认按钮
    root.querySelector('#sr-pm-btn-restore').onclick = function() {
      executeRestoreDefault();
    };

    // 复制按钮
    root.querySelector('#sr-pm-btn-copy').onclick = function() {
      executeCopy();
    };

    await loadAndRenderEditor();
  }

    function renderSettingsPage(container, viewport) {
    var setEl = document.createElement('div');
    setEl.className = 'sr-settings-container';

    var curChar = _state.companionChar || { name: '林弯弯', avatar: 'img/wanwan.png', type: 'char' };

    setEl.innerHTML =
      // 双人自习同桌与陪伴角色选择（角色档案互通）
      '<div class="sr-set-group">' +
        '<div class="sr-set-group-title">双人自习陪伴对象</div>' +
        '<div class="sr-set-row" id="sr-set-row-companion" style="cursor:pointer;">' +
          '<div class="sr-set-row-info">' +
            '<div class="sr-set-row-title">当前自习陪伴角色</div>' +
            '<div class="sr-set-row-desc">点击可选择角色档案中的角色作为双人专注同桌</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<img id="sr-set-companion-avatar" src="' + esc(curChar.avatar || 'img/wanwan.png') + '" onerror="this.src=\'img/wanwan.png\'" style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:1.5px solid var(--c-primary, #6366f1);flex-shrink:0;">' +
            '<div style="text-align:right;">' +
              '<div id="sr-set-companion-name" style="font-size:13px;font-weight:600;color:var(--c-text);">' + esc(curChar.name) + '</div>' +
              '<div id="sr-set-companion-type" style="font-size:10px;color:var(--c-sub);">' + esc(getCharTypeLabel(curChar.type || 'char')) + '</div>' +
            '</div>' +
            '<i class="fa-solid fa-angle-right" style="color:var(--c-sub);margin-left:4px;"></i>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // 番茄钟时长配置
      '<div class="sr-set-group">' +
        '<div class="sr-set-group-title">专注与休息周期配置</div>' +
        '<div class="sr-set-row">' +
          '<div class="sr-set-row-info">' +
            '<div class="sr-set-row-title">单次番茄钟专注时长</div>' +
            '<div class="sr-set-row-desc">推荐 25 分钟获得最佳心流体验</div>' +
          '</div>' +
          '<select class="sr-set-select" id="sr-set-focus-duration">' +
            '<option value="15"' + (_state.targetDurationSec === 15 * 60 ? ' selected' : '') + '>15 分钟</option>' +
            '<option value="25"' + (_state.targetDurationSec === 25 * 60 ? ' selected' : '') + '>25 分钟 (经典)</option>' +
            '<option value="35"' + (_state.targetDurationSec === 35 * 60 ? ' selected' : '') + '>35 分钟</option>' +
            '<option value="45"' + (_state.targetDurationSec === 45 * 60 ? ' selected' : '') + '>45 分钟</option>' +
            '<option value="50"' + (_state.targetDurationSec === 50 * 60 ? ' selected' : '') + '>50 分钟</option>' +
          '</select>' +
        '</div>' +
        '<div class="sr-set-row">' +
          '<div class="sr-set-row-info">' +
            '<div class="sr-set-row-title">短休息时长</div>' +
            '<div class="sr-set-row-desc">番茄钟结束后的舒缓时刻</div>' +
          '</div>' +
          '<select class="sr-set-select" id="sr-set-break-duration">' +
            '<option value="3">3 分钟</option>' +
            '<option value="5" selected>5 分钟</option>' +
            '<option value="10">10 分钟</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      // 陪伴模式偏好（三大模式全部保留并独立存储）
      '<div class="sr-set-group">' +
        '<div class="sr-set-group-title">三种陪伴模式偏好配置</div>' +
        '<div class="sr-set-row">' +
          '<div class="sr-set-row-info">' +
            '<div class="sr-set-row-title">当前默认陪伴模式</div>' +
            '<div class="sr-set-row-desc">三种模式随时可在自习中切换，不丢失计时</div>' +
          '</div>' +
          '<select class="sr-set-select" id="sr-set-mode">' +
            '<option value="quiet"' + (_state.studyMode === 'quiet' ? ' selected' : '') + '>安静陪伴 (不主动打扰)</option>' +
            '<option value="gentle"' + (_state.studyMode === 'gentle' ? ' selected' : '') + '>温柔鼓励 (休息时关怀)</option>' +
            '<option value="interactive"' + (_state.studyMode === 'interactive' ? ' selected' : '') + '>互动学习 (主动抽查答疑)</option>' +
          '</select>' +
        '</div>' +
        '<div class="sr-set-row">' +
          '<div class="sr-set-row-info">' +
            '<div class="sr-set-row-title">互动学习提问时机</div>' +
            '<div class="sr-set-row-desc">Char 在何种时机向你发起抽查</div>' +
          '</div>' +
          '<select class="sr-set-select" id="sr-set-q-timing">' +
            '<option value="break" selected>番茄钟结束休息时</option>' +
            '<option value="during">自习专注中定时抽查</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      // AI 提示词管理中心（P0 核心配置）
      '<div class="sr-set-group">' +
        '<div class="sr-set-group-title">AI 提示词管理</div>' +
        '<div class="sr-set-row" id="sr-set-row-prompt-manager" style="cursor:pointer;">' +
          '<div class="sr-set-row-info">' +
            '<div class="sr-set-row-title"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--c-primary, #6366f1);margin-right:4px;"></i> AI 提示词管理中心</div>' +
            '<div class="sr-set-row-desc">独立配置「专业学习助手」与「Char 自习室附加规则」</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="font-size:11px;color:var(--c-sub);">两套独立存储</span>' +
            '<i class="fa-solid fa-angle-right" style="color:var(--c-sub);"></i>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // 数据管理与清空重置
      '<div class="sr-set-group">' +
        '<div class="sr-set-group-title">自习室数据管理</div>' +
        '<div class="sr-set-row" id="sr-set-row-reset-data" style="cursor:pointer;">' +
          '<div class="sr-set-row-info">' +
            '<div class="sr-set-row-title" style="color:#ef4444;"><i class="fa-solid fa-trash-can"></i> 清空自习室所有记录与数据</div>' +
            '<div class="sr-set-row-desc">一键清空自习记录、教材资料、待办事项与错题本，恢复初始空白</div>' +
          '</div>' +
          '<i class="fa-solid fa-angle-right" style="color:var(--c-sub);"></i>' +
        '</div>' +
      '</div>' +

      // 场景与立绘快捷入口
      '<div class="sr-set-group">' +
        '<div class="sr-set-group-title">视觉与立绘管理</div>' +
        '<div class="sr-set-row" id="sr-set-row-standee" style="cursor:pointer;">' +
          '<div class="sr-set-row-info">' +
            '<div class="sr-set-row-title">Char 伴读图片设置</div>' +
            '<div class="sr-set-row-desc" id="sr-set-standee-desc">当前针对：' + esc(curChar.name) + ' · 唯一图片导入入口</div>' +
          '</div>' +
          '<i class="fa-solid fa-angle-right" style="color:var(--c-sub);"></i>' +
        '</div>' +
      '</div>';

    viewport.appendChild(setEl);

    // 绑定设置变更
    var focusDurSelect = setEl.querySelector('#sr-set-focus-duration');
    focusDurSelect.onchange = function() {
      var min = parseInt(focusDurSelect.value, 10);
      _state.targetDurationSec = min * 60;
      if (_state.timerStatus === 'idle') {
        _state.remainingSec = _state.targetDurationSec;
      }
      saveCurrentTimerState();
      window.toast && window.toast('番茄钟时长已更新为 ' + min + ' 分钟');
    };

    var modeSelect = setEl.querySelector('#sr-set-mode');
    modeSelect.onchange = function() {
      cycleStudyMode(container, modeSelect.value);
    };

    var qTimingSelect = setEl.querySelector('#sr-set-q-timing');
    qTimingSelect.onchange = function() {
      _state.modePreferences.interactive.questionTiming = qTimingSelect.value;
      saveAllSettings();
      window.toast && window.toast('提问时机偏好已保存');
    };

    var resetDataRow = setEl.querySelector('#sr-set-row-reset-data');
    if (resetDataRow) {
      resetDataRow.onclick = async function() {
        if (!confirm('确定要清空自习室的所有专注记录、教材资料库、待办事项和错题本吗？\n\n此操作将让自习室彻底恢复为空白初始状态（角色档案与人设不受影响）。')) {
          return;
        }
        _state.records = [];
        _state.todos = [];
        _state.resources = [];
        _state.mistakes = [];
        _state.activeQuizList = [];
        _state.pomodorosToday = 0;
        _state.totalMinutesToday = 0;
        _state.streakDays = 0;
        await saveStorage(STORAGE_KEYS.RECORDS, []);
        await saveStorage(STORAGE_KEYS.TODOS, []);
        await saveStorage(STORAGE_KEYS.RESOURCES, []);
        await saveStorage(STORAGE_KEYS.MISTAKES, []);
        await saveStorage('wanwan_study_documents_v2', []);
        if (window.StudySearchIndex) {
          window.StudySearchIndex.documents = [];
          window.StudySearchIndex.rebuildIndex();
        }
        window.toast && window.toast('自习室数据已全部清空，已恢复为空白初始状态！');
        renderActiveTabPage(container);
      };
    }

    var promptMgrRow = setEl.querySelector('#sr-set-row-prompt-manager');
    if (promptMgrRow) {
      promptMgrRow.onclick = function() {
        openPromptManagerModal(container);
      };
    }

    setEl.querySelector('#sr-set-row-companion').onclick = function() {
      openCompanionSelectorModal(container);
    };

    // 场景更换已移除

    setEl.querySelector('#sr-set-row-standee').onclick = function() {
      openStandeeAdjustModal(container);
    };
  }

  // 对外暴露模块
  window.WanwanStudyRoom = {
    open: window.showStudyRoomPage,
    getState: function() { return _state; }
  };

})();