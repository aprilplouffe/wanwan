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
    ASSISTANT_MSGS: 'wanwan_study_assistant_msgs'
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

  // 智能题库初始题库
  var DEFAULT_QUIZ_QUESTIONS = [
    {
      id: 'q_1',
      category: '英语高频',
      question: '在学术语境中，单词 "meticulous" 最准确的含义是？',
      options: ['极其严谨细致的', '犹豫不决的', '粗枝大叶的', '富有激情的'],
      answerIndex: 0,
      explain: '"meticulous" 意为一丝不苟的、极其注重细节与准确性的（very careful and precise）。'
    },
    {
      id: 'q_2',
      category: '逻辑思维',
      question: '“所有的白鹅都是鸟，有些鸟不会飞”，据此必然能推导出的是？',
      options: ['有些不会飞的鸟是白鹅', '有些鸟会飞', '白鹅都是鸟', '所有白鹅都不会飞'],
      answerIndex: 2,
      explain: '根据三段论与命题直述，原前提明确指出“所有的白鹅都是鸟”，直接成立。'
    },
    {
      id: 'q_3',
      category: '综合通识',
      question: '番茄工作法（Pomodoro Technique）的核心基础专注与休息节奏通常是？',
      options: ['专注 45 分钟，休息 15 分钟', '专注 25 分钟，休息 5 分钟', '专注 60 分钟，休息 10 分钟', '专注 30 分钟，无休息'],
      answerIndex: 1,
      explain: '弗朗西斯科·西里洛创立的标准番茄工作法以 25 分钟为一个番茄时间，之后休息 5 分钟。'
    },
    {
      id: 'q_4',
      category: '文史通识',
      question: '“博学之，审问之，慎思之，明辨之，笃行之”出自儒家经典中的哪一部？',
      options: ['《论语》', '《孟子》', '《礼记·中庸》', '《大学》'],
      answerIndex: 2,
      explain: '该名言出自《礼记·中庸》，概括了为学的五个渐进阶段。'
    },
    {
      id: 'q_5',
      category: '计算机科学',
      question: '在时间复杂度表示中，O(n log n) 通常对应于下列哪种排序算法的最佳或平均性能？',
      options: ['归并排序 (Merge Sort)', '冒泡排序 (Bubble Sort)', '选择排序 (Selection Sort)', '插入排序 (Insertion Sort)'],
      answerIndex: 0,
      explain: '归并排序采用分治法，其最好、最坏与平均时间复杂度均为 O(n log n)。'
    }
  ];

  // 初始资料库数据
  var DEFAULT_RESOURCES = [
    {
      id: 'res_1',
      title: '高分番茄专注法心法手册',
      tag: '专注心法',
      date: '2026-10-15',
      content: '1. 单核工作，杜绝多任务频繁切换；\n2. 专注钟响前不处理任何突发琐事，列入备忘；\n3. 休息时必须离开屏幕，闭目眺望或活动肩颈。'
    },
    {
      id: 'res_2',
      title: '英语考研核心词根与词缀脉络',
      tag: '语言学习',
      date: '2026-10-18',
      content: '前缀 re-（再、重复）、con-/com-（共同）、trans-（穿过、转变）；\n后缀 -tion（名词化）、-ous（形容词化，充满…的）。掌握构词法记忆效率翻倍。'
    },
    {
      id: 'res_3',
      title: '深度工作与心流状态触发指南',
      tag: '效率思维',
      date: '2026-10-19',
      content: '心流触发三要素：清晰无歧义的目标、即时的正向反馈、挑战难度与个人技能水平的最佳匹配（略高于舒适区）。'
    }
  ];

  // 初始今日待办
  var DEFAULT_TODOS = [
    { id: 'todo_1', text: '完成 2 个深度专注番茄钟', done: false },
    { id: 'todo_2', text: '梳理智能题库今日 5 道练习', done: false },
    { id: 'todo_3', text: '向 Char 学习助手总结今日核心知识点', done: false }
  ];

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
    taskName: '考研政治与专业课复习',
    // 计时时间戳核心
    targetDurationSec: 25 * 60,
    remainingSec: 25 * 60,
    elapsedSec: 0,
    startTimestamp: 0,
    accumulatedSecBeforeResume: 0,
    lastActiveTimestamp: Date.now(),
    pomodorosToday: 3,
    totalMinutesToday: 75,
    streakDays: 5,
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

    var savedTodos = await loadStorage(STORAGE_KEYS.TODOS, null);
    _state.todos = Array.isArray(savedTodos) ? savedTodos : DEFAULT_TODOS.slice();

    var savedResources = await loadStorage(STORAGE_KEYS.RESOURCES, null);
    _state.resources = Array.isArray(savedResources) ? savedResources : DEFAULT_RESOURCES.slice();

    var savedMistakes = await loadStorage(STORAGE_KEYS.MISTAKES, []);
    _state.mistakes = Array.isArray(savedMistakes) ? savedMistakes : [];

    var savedRecords = await loadStorage(STORAGE_KEYS.RECORDS, []);
    _state.records = Array.isArray(savedRecords) ? savedRecords : [];

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
        scale: 100,
        offsetX: 0,
        offsetY: 0
      };
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
    return _state.companionChar ? _state.companionChar.avatar : 'img/wanwan.png';
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

    // 更新立绘与同桌名称
    var standeeImg = container.querySelector('#sr-standee-img');
    if (standeeImg) {
      standeeImg.src = getActiveStandeeImg();
      var conf = getCurrentCharStandeeConfig();
      standeeImg.style.transform = 'scale(' + (conf.scale / 100) + ') translate(' + conf.offsetX + 'px, ' + conf.offsetY + 'px)';
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

      // 8 大模块横向切换选项卡
      '<div class="sr-nav-tabs" id="sr-tabs-bar">' +
        '<div class="sr-tab-item' + (_state.activeTab === 'hall' ? ' active' : '') + '" data-tab="hall"><i class="fa-solid fa-hotel"></i> 自习大厅</div>' +
        '<div class="sr-tab-item' + (_state.activeTab === 'duo' ? ' active' : '') + '" data-tab="duo"><i class="fa-solid fa-user-group"></i> 双人专注</div>' +
        '<div class="sr-tab-item' + (_state.activeTab === 'resources' ? ' active' : '') + '" data-tab="resources"><i class="fa-solid fa-book-bookmark"></i> 资料库</div>' +
        '<div class="sr-tab-item' + (_state.activeTab === 'assistant' ? ' active' : '') + '" data-tab="assistant"><i class="fa-solid fa-wand-magic-sparkles"></i> 学习助手</div>' +
        '<div class="sr-tab-item' + (_state.activeTab === 'quiz' ? ' active' : '') + '" data-tab="quiz"><i class="fa-solid fa-brain"></i> 智能题库</div>' +
        '<div class="sr-tab-item' + (_state.activeTab === 'mistakes' ? ' active' : '') + '" data-tab="mistakes"><i class="fa-solid fa-book-open-reader"></i> 错题本 (' + _state.mistakes.length + ')</div>' +
        '<div class="sr-tab-item' + (_state.activeTab === 'report' ? ' active' : '') + '" data-tab="report"><i class="fa-solid fa-chart-line"></i> 学习报告</div>' +
        '<div class="sr-tab-item' + (_state.activeTab === 'settings' ? ' active' : '') + '" data-tab="settings"><i class="fa-solid fa-gear"></i> 设置</div>' +
      '</div>' +

      // 核心视口
      '<div class="sr-content-viewport" id="sr-viewport"></div>' +

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

    // 绑定 Tab 切换
    container.querySelectorAll('.sr-tab-item').forEach(function(item) {
      item.onclick = function() {
        var targetTab = item.getAttribute('data-tab');
        if (_state.activeTab !== targetTab) {
          _state.activeTab = targetTab;
          container.querySelectorAll('.sr-tab-item').forEach(function(el) { el.classList.remove('active'); });
          item.classList.add('active');
          renderActiveTabPage(container);
        }
      };
    });

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
        '<div class="sr-menu-card" data-goto="duo">' +
          '<div class="sr-menu-icon"><i class="fa-solid fa-user-group"></i></div>' +
          '<div class="sr-menu-title">双人专注</div>' +
          '<div class="sr-menu-desc">核心自习舞台</div>' +
        '</div>' +
        '<div class="sr-menu-card" data-goto="resources">' +
          '<div class="sr-menu-icon"><i class="fa-solid fa-book-bookmark"></i></div>' +
          '<div class="sr-menu-title">资料库</div>' +
          '<div class="sr-menu-desc">复习重点备忘</div>' +
        '</div>' +
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

  function switchTab(container, tabName) {
    _state.activeTab = tabName;
    container.querySelectorAll('.sr-tab-item').forEach(function(el) {
      el.classList.toggle('active', el.getAttribute('data-tab') === tabName);
    });
    renderActiveTabPage(container);
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

    var scene = PRESET_SCENES[_state.currentSceneId] || PRESET_SCENES.study;
    if (_state.customBgUrl) {
      stageEl.style.backgroundImage = 'url("' + _state.customBgUrl + '")';
    } else {
      stageEl.style.background = scene.bg;
    }

    stageEl.innerHTML =
      '<div class="sr-stage-overlay"></div>' +

      // 顶部工具条
      '<div class="sr-stage-top-bar">' +
        '<div class="sr-stage-task-pill" id="sr-task-selector-btn" title="点击切换专注任务">' +
          '<i class="fa-solid fa-tag"></i> <span>' + esc(_state.taskType) + ' · ' + esc(_state.taskName) + '</span> <i class="fa-solid fa-angle-down" style="font-size:9px;"></i>' +
        '</div>' +
        '<div class="sr-stage-quick-actions">' +
          '<button type="button" class="sr-stage-icon-btn" id="sr-btn-switch-scene" title="切换自习背景场景"><i class="fa-solid fa-image"></i></button>' +
          '<button type="button" class="sr-stage-icon-btn" id="sr-btn-adjust-standee" title="微调立绘位置与上传"><i class="fa-solid fa-person-rays"></i></button>' +
        '</div>' +
      '</div>' +

      // 舞台中区：Char 对话气泡、立绘与同桌名牌
      '<div class="sr-stage-actor-area">' +
        '<div class="sr-actor-bubble" id="sr-actor-bubble" style="display:' + (_state.actorSpeech ? 'block' : 'none') + ';">' +
          esc(_state.actorSpeech || '') +
        '</div>' +
        '<div class="sr-actor-standee-box" id="sr-standee-box" title="点击与 ' + esc((_state.companionChar && _state.companionChar.name) || 'TA') + ' 互动">' +
          '<img class="sr-actor-standee-img" id="sr-standee-img" src="' + getActiveStandeeImg() + '" onerror="this.src=\'img/wanwan.png\'">' +
        '</div>' +
        '<div class="sr-actor-name-tag" id="sr-actor-name-tag"><i class="fa-solid fa-heart" style="font-size:9px;color:#f43f5e;"></i> ' + esc((_state.companionChar && _state.companionChar.name) || '林弯弯') + '</div>' +
      '</div>' +

      // 下部控制板
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

    // 绑定事件
    stageEl.querySelector('#sr-standee-box').onclick = function() {
      triggerCharReaction('user_tap_char');
    };

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

    stageEl.querySelector('#sr-btn-switch-scene').onclick = function() {
      openSceneSelectorModal(container);
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

  // 场景切换弹窗
  function openSceneSelectorModal(container) {
    var root = container.querySelector('#sr-modal-root');
    if (!root) return;

    var scenes = Object.keys(PRESET_SCENES).map(function(k) { return PRESET_SCENES[k]; });

    root.innerHTML =
      '<div class="sr-modal-mask" id="sr-scene-mask">' +
        '<div class="sr-modal-panel">' +
          '<div class="sr-modal-header">' +
            '<span>自定义学习场景与背景</span>' +
            '<button type="button" class="pl-btn-secondary" id="sr-scene-close" style="padding:2px 8px;"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div style="font-size:12px;color:var(--c-sub);">预设唯美自习场景：</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' +
            scenes.map(function(sc) {
              var isCur = sc.id === _state.currentSceneId && !_state.customBgUrl;
              return '<button type="button" class="pl-btn-secondary" data-sc-id="' + sc.id + '" style="justify-content:flex-start;padding:10px;' + (isCur ? 'border-color:var(--c-text);font-weight:600;' : '') + '">' +
                '<span>' + esc(sc.name) + '</span>' +
                '<span style="font-size:10px;color:var(--c-sub);margin-left:auto;">' + esc(sc.desc) + '</span>' +
              '</button>';
            }).join('') +
          '</div>' +
          '<div style="font-size:12px;color:var(--c-sub);margin-top:8px;">或输入自定义背景图片 URL：</div>' +
          '<input type="text" class="input-field" id="sr-custom-bg-input" value="' + esc(_state.customBgUrl) + '" placeholder="https://... 填入图片链接">' +
          '<button type="button" class="pl-btn-primary" id="sr-scene-save" style="margin-top:6px;">应用背景</button>' +
        '</div>' +
      '</div>';

    root.querySelector('#sr-scene-mask').onclick = function(e) {
      if (e.target.id === 'sr-scene-mask') root.innerHTML = '';
    };
    root.querySelector('#sr-scene-close').onclick = function() {
      root.innerHTML = '';
    };

    root.querySelectorAll('button[data-sc-id]').forEach(function(btn) {
      btn.onclick = function() {
        var scId = btn.getAttribute('data-sc-id');
        _state.currentSceneId = scId;
        _state.customBgUrl = '';
        saveAllSettings();
        root.innerHTML = '';
        renderActiveTabPage(container);
        window.toast && window.toast('自习场景已切换为：「' + PRESET_SCENES[scId].name + '」');
      };
    });

    root.querySelector('#sr-scene-save').onclick = function() {
      var val = root.querySelector('#sr-custom-bg-input').value.trim();
      _state.customBgUrl = val;
      saveAllSettings();
      root.innerHTML = '';
      renderActiveTabPage(container);
      window.toast && window.toast('自定义场景背景已更新');
    };
  }

  // 立绘微调与上传弹窗 (支持多状态立绘、透明背景、缩放、偏移)
  function openStandeeAdjustModal(container) {
    var root = container.querySelector('#sr-modal-root');
    if (!root) return;

    var conf = getCurrentCharStandeeConfig();

    root.innerHTML =
      '<div class="sr-modal-mask" id="sr-standee-mask">' +
        '<div class="sr-modal-panel">' +
          '<div class="sr-modal-header">' +
            '<span>Char 伴读立绘多状态与微调</span>' +
            '<button type="button" class="pl-btn-secondary" id="sr-standee-close" style="padding:2px 8px;"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--c-sub);">支持透明背景 PNG / JPG，按角色保存：</div>' +

          // 状态选择
          '<div style="display:flex;gap:6px;">' +
            '<button type="button" class="pl-btn-secondary' + (_state.currentStandeeState === 'focus' ? ' active' : '') + '" data-st="focus" style="' + (_state.currentStandeeState === 'focus' ? 'border-color:var(--c-text);font-weight:600;' : '') + '">专注状态</button>' +
            '<button type="button" class="pl-btn-secondary' + (_state.currentStandeeState === 'smile' ? ' active' : '') + '" data-st="smile" style="' + (_state.currentStandeeState === 'smile' ? 'border-color:var(--c-text);font-weight:600;' : '') + '">微笑状态</button>' +
            '<button type="button" class="pl-btn-secondary' + (_state.currentStandeeState === 'rest' ? ' active' : '') + '" data-st="rest" style="' + (_state.currentStandeeState === 'rest' ? 'border-color:var(--c-text);font-weight:600;' : '') + '">休息状态</button>' +
          '</div>' +

          // 图片上传或 URL
          '<div style="display:flex;gap:8px;margin-top:6px;">' +
            '<button type="button" class="pl-btn-secondary" id="sr-upload-file-btn" style="flex:1;"><i class="fa-solid fa-upload"></i> 上传本地图片</button>' +
            '<button type="button" class="pl-btn-secondary" id="sr-clear-standee-btn" style="flex:1;">恢复默认头像</button>' +
          '</div>' +
          '<input type="file" id="sr-standee-file-input" accept="image/*" style="display:none;">' +

          // 缩放与位置微调滑块
          '<div style="font-size:11px;color:var(--c-sub);margin-top:6px;">立绘缩放比例：<span id="sr-scale-val">' + conf.scale + '%</span></div>' +
          '<input type="range" min="50" max="150" value="' + conf.scale + '" id="sr-range-scale" style="width:100%;">' +

          '<div style="font-size:11px;color:var(--c-sub);">水平位置偏移 (X)：<span id="sr-offsetx-val">' + conf.offsetX + 'px</span></div>' +
          '<input type="range" min="-80" max="80" value="' + conf.offsetX + '" id="sr-range-offsetx" style="width:100%;">' +

          '<div style="font-size:11px;color:var(--c-sub);">垂直位置偏移 (Y)：<span id="sr-offsety-val">' + conf.offsetY + 'px</span></div>' +
          '<input type="range" min="-80" max="80" value="' + conf.offsetY + '" id="sr-range-offsety" style="width:100%;">' +

          '<button type="button" class="pl-btn-primary" id="sr-standee-save-btn" style="margin-top:6px;">保存配置并应用</button>' +
        '</div>' +
      '</div>';

    root.querySelector('#sr-standee-mask').onclick = function(e) {
      if (e.target.id === 'sr-standee-mask') root.innerHTML = '';
    };
    root.querySelector('#sr-standee-close').onclick = function() {
      root.innerHTML = '';
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

    // 状态切换
    root.querySelectorAll('button[data-st]').forEach(function(b) {
      b.onclick = function() {
        _state.currentStandeeState = b.getAttribute('data-st');
        root.querySelectorAll('button[data-st]').forEach(function(x) { x.style.fontWeight = 'normal'; x.style.borderColor = ''; });
        b.style.fontWeight = '600';
        b.style.borderColor = 'var(--c-text)';
        updateDuoControls(container);
      };
    });

    // 文件上传
    var fileInput = root.querySelector('#sr-standee-file-input');
    root.querySelector('#sr-upload-file-btn').onclick = function() {
      fileInput.click();
    };

    fileInput.onchange = function() {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        var base64 = e.target.result;
        conf[_state.currentStandeeState] = base64;
        updateDuoControls(container);
        window.toast && window.toast('立绘图片已读取，请点击保存');
      };
      reader.readAsDataURL(file);
    };

    root.querySelector('#sr-clear-standee-btn').onclick = function() {
      conf[_state.currentStandeeState] = '';
      updateDuoControls(container);
      window.toast && window.toast('已重置为默认头像');
    };

    root.querySelector('#sr-standee-save-btn').onclick = function() {
      var cid = _state.companionChar ? _state.companionChar.id : 'char_default';
      _state.charStandees[cid] = conf;
      saveStorage(STORAGE_KEYS.STANDEES, _state.charStandees);
      root.innerHTML = '';
      window.toast && window.toast('立绘配置已永久保存！');
    };
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
            '“今天专注力非常卓越，已经坚持完成了 ' + _state.pomodorosToday + ' 个番茄钟！思维清晰敏捷，继续保持这个节奏，期待明天也和你并肩自习～”' +
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
    var days = ['周一', '周二', '周三', '周四', '周五', '周六', '今天'];
    var heights = [45, 60, 50, 75, 40, 90, Math.min(100, Math.max(20, _state.totalMinutesToday))];

    return days.map(function(d, i) {
      return '<div class="sr-chart-col">' +
        '<div class="sr-chart-bar" style="height:' + heights[i] + 'px;"></div>' +
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

      // 场景与立绘快捷入口
      '<div class="sr-set-group">' +
        '<div class="sr-set-group-title">视觉场景与立绘管理</div>' +
        '<div class="sr-set-row" id="sr-set-row-scene" style="cursor:pointer;">' +
          '<div class="sr-set-row-info">' +
            '<div class="sr-set-row-title">更换学习背景与场景</div>' +
            '<div class="sr-set-row-desc">当前：' + esc((PRESET_SCENES[_state.currentSceneId] || {}).name || '温暖书房') + '</div>' +
          '</div>' +
          '<i class="fa-solid fa-angle-right" style="color:var(--c-sub);"></i>' +
        '</div>' +
        '<div class="sr-set-row" id="sr-set-row-standee" style="cursor:pointer;">' +
          '<div class="sr-set-row-info">' +
            '<div class="sr-set-row-title">Char 立绘多状态与微调</div>' +
            '<div class="sr-set-row-desc" id="sr-set-standee-desc">当前针对：' + esc(curChar.name) + ' · 自定义立绘与微调</div>' +
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

    setEl.querySelector('#sr-set-row-companion').onclick = function() {
      openCompanionSelectorModal(container);
    };

    setEl.querySelector('#sr-set-row-scene').onclick = function() {
      openSceneSelectorModal(container);
    };

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
