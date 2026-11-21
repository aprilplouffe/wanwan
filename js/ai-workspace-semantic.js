// ai-workspace-semantic.js — 知屿第五阶段 5.1：独立深度语义理解系统
// 能力覆盖：
// 1) 自然语言语用与意图理解（陈述/疑问/假设/条件/玩笑/引用/第三方/否定/转折/程度/同义等价）
// 2) 上下文指代消解（多轮实体追踪、单对象精准解析、多候选/无前文主动澄清绝不猜测）
// 3) 六态时间语义理解（past / current / future_plan / completed / cancelled / paused）与状态变更追踪
// 4) 多事实原子拆解（禁止将多个独立事实合并为单条记忆）
// 5) 事实可信度、来源追踪与结构化 JSON 容错解析（低置信度与模型推测绝不写入确定性长期记忆）
(function(global) {
  'use strict';

  var DEFAULT_MAX_LEN = 260;

  var TEMPORAL_STATES = ['current', 'past', 'future_plan', 'completed', 'cancelled', 'paused'];
  var MEMORY_STATUSES = ['active', 'historical', 'completed', 'cancelled', 'paused'];

  var REJECTED_FACT_TYPES = [
    'guess',
    'hypothesis',
    'conditional',
    'joke',
    'sarcasm',
    'third_party',
    'quote',
    'speculation',
    'model_inference',
    'inferred',
    'temporary',
    'greeting_or_temp'
  ];

  // ===== 1. 语义规范化与同义词等价表 =====
  var SYNONYM_CONCEPT_RULES = [
    {
      concept: 'style_concise',
      slot: 'reply_style',
      category: '偏好',
      patterns: [
        /(?:简洁|精简|简短|简练|干练|言简意赅|短一点|短些|简洁一点|简洁一些|简明扼要|精炼|少废话|别太啰嗦|不要太啰嗦|不要太长|别写太长|精简些|少说废话|直白一点)/i
      ]
    },
    {
      concept: 'style_detailed',
      slot: 'reply_style',
      category: '偏好',
      patterns: [
        /(?:详细|详尽|展开讲|写细一点|具体一点|深入一点|多举例子|全面一点|细致一点|详细些)/i
      ]
    },
    {
      concept: 'style_bulleted',
      slot: 'reply_style_format',
      category: '偏好',
      patterns: [
        /(?:分点|清单|列表|条目化|列要点|一条一条|分条|结构化输出)/i
      ]
    },
    {
      concept: 'style_conclusion_first',
      slot: 'reply_style_order',
      category: '偏好',
      patterns: [
        /(?:先给结论|先说结论|结论先行|开门见山|直奔主题|先讲重点)/i
      ]
    },
    {
      concept: 'food_coriander',
      slot: 'diet_coriander',
      category: '偏好',
      patterns: [
        /(?:香菜|芫荽|胡荽)/i
      ]
    },
    {
      concept: 'food_spicy',
      slot: 'diet_spicy',
      category: '偏好',
      patterns: [
        /(?:吃辣|辣椒|麻辣|重辣|辛辣|辣的|放辣|微辣|特辣)/i
      ]
    },
    {
      concept: 'drink_americano',
      slot: 'coffee_drink',
      category: '偏好',
      patterns: [
        /(?:美式咖啡|冰美式|热美式|美式|黑咖啡|黑咖)/i
      ]
    },
    {
      concept: 'drink_latte',
      slot: 'coffee_drink',
      category: '偏好',
      patterns: [
        /(?:生椰拿铁|冰拿铁|热拿铁|拿铁咖啡|拿铁|燕麦拿铁)/i
      ]
    },
    {
      concept: 'mod_no_sugar',
      slot: 'drink_sugar',
      category: '偏好',
      patterns: [
        /(?:无糖|不加糖|零糖|不要糖|去糖|不放糖)/i
      ]
    },
    {
      concept: 'fruit_strawberry',
      slot: 'pref_fruit',
      category: '偏好',
      patterns: [/(?:草莓)/]
    },
    {
      concept: 'fruit_mango',
      slot: 'pref_fruit',
      category: '偏好',
      patterns: [/(?:芒果)/]
    },
    {
      concept: 'lang_japanese',
      slot: 'study_japanese',
      category: '长期计划',
      patterns: [/(?:日语|日文|日本语|jlpt|n1|n2|n3|五十音)/i]
    },
    {
      concept: 'lang_french',
      slot: 'study_french',
      category: '长期计划',
      patterns: [/(?:法语|法文|delf|dalf)/i]
    },
    {
      concept: 'lang_english',
      slot: 'study_english',
      category: '长期计划',
      patterns: [/(?:英语|英文|雅思|托福|ielts|toefl|四级|六级|口语)/i]
    },
    {
      concept: 'activity_develop',
      slot: '',
      category: '项目',
      patterns: [/(?:正在开发|在开发|正在做|在做|正在研发|在研发|正在制作|正在搭建|正在推进|正在打造|开发项目|推进项目|负责开发|研发中|开发中)/i]
    },
    {
      concept: 'activity_learn',
      slot: '',
      category: '长期计划',
      patterns: [/(?:开始学习|开始学|正在学习|正在学|在学|持续学习|长期学习|准备学|打算学|计划学|备考|进修|自学|学习目标)/i]
    },
    {
      concept: 'activity_reply_pref',
      slot: '',
      category: '偏好',
      patterns: [/(?:回复|回答|输出|表达|说话|讲解|解释|风格|语气|排版|ai)/i]
    },
    {
      concept: 'habit_sleep',
      slot: 'habit_sleep',
      category: '习惯',
      patterns: [/(?:早睡|熬夜|夜猫子|作息|几点睡|早起|睡眠)/]
    },
    {
      concept: 'habit_exercise',
      slot: 'habit_exercise',
      category: '习惯',
      patterns: [/(?:健身|跑步|夜跑|晨跑|羽毛球|游泳|瑜伽|锻炼|运动)/]
    }
  ];

  // 同义规范词替换（用于同义句去重与等价判断）
  var CANONICAL_REPLACEMENTS = [
    [/芫荽|胡荽/g, '香菜'],
    [/黑咖啡|黑咖|美式咖啡|冰美式|热美式/g, '美式'],
    [/拿铁咖啡|冰拿铁|热拿铁|燕麦拿铁|生椰拿铁/g, '拿铁'],
    [/不加糖|零糖|不要糖|去糖|不放糖/g, '无糖'],
    [/精简|简短|简练|干练|言简意赅|精炼|简明扼要|不要太长|别写太长|少废话|别太啰嗦|不要太啰嗦/g, '简洁'],
    [/详尽|细致|全面一点|具体一点|展开讲/g, '详细'],
    [/回答|答复|输出|讲解/g, '回复'],
    [/AI|ai|助手|你/g, 'AI'],
    [/偏爱|偏好|钟爱|最爱|更喜欢|倾向于|爱吃|爱喝/g, '喜欢'],
    [/忌口|避开|别放|不放|吃不了|拒绝吃|不爱吃|不喜欢吃/g, '不吃'],
    [/讨厌|反感|不爱喝|不喜欢喝/g, '不喜欢'],
    [/研发|制作|搭建|打造|编写|在做|推进/g, '开发'],
    [/进修|自学|备考|练习|学起来/g, '学习'],
    [/日文|日本语/g, '日语'],
    [/法文/g, '法语'],
    [/英文/g, '英语'],
    [/搁置|暂缓|先放一放|放一放|先停一停|先暂停|暂停|挂起/g, '搁置'],
    [/作罢|放弃|不打算了|不学了|不做了|不考了/g, '取消'],
    [/考过了|考完了|做完了|搞定了|通过了|结束了/g, '完成']
  ];

  function normalizeTextCompact(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/^[-*•\d.)\s]+/, '')
      .replace(/[\s，。！？、；：“”"'‘’（）()【】\[\],.!?;:~`「」《》]+/g, '')
      .trim();
  }

  function canonicalizeSemanticText(text) {
    var s = String(text || '').trim();
    if (!s) return '';
    for (var i = 0; i < CANONICAL_REPLACEMENTS.length; i++) {
      s = s.replace(CANONICAL_REPLACEMENTS[i][0], CANONICAL_REPLACEMENTS[i][1]);
    }
    return s;
  }

  function detectPolarity(text) {
    var src = String(text || '');
    if (/(?:不吃|忌口|过敏|不喜欢|讨厌|反感|别放|不要放|别太|不要太|不再|避免|拒绝|千万别|绝不|别再)/.test(src)) {
      return 'negative';
    }
    return 'positive';
  }

  function detectDegree(text) {
    var src = String(text || '');
    if (/(?:非常|特别|极其|超级|最|绝对|一定|务必|强烈|死活|千万)/.test(src)) return 'high';
    if (/(?:稍微|有点|略微|一般|偶尔|不太)/.test(src)) return 'low';
    return 'medium';
  }

  function extractSemanticConcepts(text) {
    var src = String(text || '');
    var concepts = [];
    var slots = [];
    for (var i = 0; i < SYNONYM_CONCEPT_RULES.length; i++) {
      var rule = SYNONYM_CONCEPT_RULES[i];
      for (var p = 0; p < rule.patterns.length; p++) {
        if (rule.patterns[p].test(src)) {
          if (concepts.indexOf(rule.concept) === -1) concepts.push(rule.concept);
          if (rule.slot && slots.indexOf(rule.slot) === -1) slots.push(rule.slot);
          break;
        }
      }
    }
    return { concepts: concepts, slots: slots };
  }

  function extractNamedCoreEntity(text) {
    var src = String(text || '').trim();
    if (!src) return '';

    var quoted = src.match(/[「《"]([\u4e00-\u9fa5A-Za-z0-9_+#-]{2,20})[」》"]/);
    if (quoted && quoted[1]) return quoted[1].toLowerCase();

    var mColonProj = src.match(/(?:项目|学习目标|事项|计划)[：:]\s*([\u4e00-\u9fa5A-Za-z0-9_+#-]{2,20})/);
    if (mColonProj && mColonProj[1] && !/^(?:一个|这个|那个|什么|怎么|项目|开发|学习)$/.test(mColonProj[1])) {
      return mColonProj[1].toLowerCase();
    }

    var mProj = src.match(/(?:开发|制作|研发|搭建|推进)(?:项目[：:]?)?\s*([\u4e00-\u9fa5A-Za-z0-9_+#-]{2,16}?)(?:这个项目|项目|应用|软件|系统|工具|，|。|$)/);
    if (mProj && mProj[1] && !/^(?:一个|这个|那个|什么|怎么|项目|开发|制作|研发|搭建|推进)$/.test(mProj[1])) {
      return mProj[1].toLowerCase();
    }

    var mLearn = src.match(/(?:学习|学|备考|进修|考)([\u4e00-\u9fa5A-Za-z0-9_+#-]{2,14}?)(?:计划|目标|课程|，|。|$)/);
    if (mLearn && mLearn[1] && !/^(?:什么|怎么|一下|计划)$/.test(mLearn[1])) {
      return mLearn[1].toLowerCase();
    }

    return '';
  }

  function buildBigrams(str) {
    var norm = normalizeTextCompact(str).replace(/用户/g, '');
    var set = new Set();
    if (norm.length < 2) {
      if (norm) set.add(norm);
      return set;
    }
    for (var i = 0; i <= norm.length - 2; i++) {
      set.add(norm.slice(i, i + 2));
    }
    return set;
  }

  function jaccardSets(setA, setB) {
    if (!setA.size || !setB.size) return 0;
    var inter = 0;
    setA.forEach(function(v) {
      if (setB.has(v)) inter++;
    });
    var union = setA.size + setB.size - inter;
    return union > 0 ? (inter / union) : 0;
  }

  function extractSemanticSignature(text, category) {
    var raw = String(text || '').trim();
    var canon = canonicalizeSemanticText(raw);
    var conceptInfo = extractSemanticConcepts(raw);
    var polarity = detectPolarity(raw);
    var entity = extractNamedCoreEntity(raw);
    var primarySlot = conceptInfo.slots[0] || '';
    var semanticKey = '';

    if (conceptInfo.concepts.indexOf('style_concise') !== -1) {
      semanticKey = 'pref:reply_style:concise';
    } else if (conceptInfo.concepts.indexOf('style_detailed') !== -1) {
      semanticKey = 'pref:reply_style:detailed';
    } else if (conceptInfo.concepts.indexOf('style_bulleted') !== -1) {
      semanticKey = 'pref:reply_style:bulleted';
    } else if (conceptInfo.concepts.indexOf('style_conclusion_first') !== -1) {
      semanticKey = 'pref:reply_style:conclusion_first';
    } else if (conceptInfo.concepts.indexOf('food_coriander') !== -1) {
      semanticKey = 'pref:food:coriander:' + polarity;
    } else if (conceptInfo.concepts.indexOf('food_spicy') !== -1) {
      semanticKey = 'pref:food:spicy:' + polarity;
    } else if (conceptInfo.concepts.indexOf('drink_americano') !== -1) {
      var sugarSuffix = conceptInfo.concepts.indexOf('mod_no_sugar') !== -1 ? ':nosugar' : '';
      semanticKey = 'pref:drink:americano:' + polarity + sugarSuffix;
    } else if (conceptInfo.concepts.indexOf('drink_latte') !== -1) {
      var sugarSuffix2 = conceptInfo.concepts.indexOf('mod_no_sugar') !== -1 ? ':nosugar' : '';
      semanticKey = 'pref:drink:latte:' + polarity + sugarSuffix2;
    } else if (conceptInfo.concepts.indexOf('fruit_strawberry') !== -1) {
      semanticKey = 'pref:fruit:strawberry:' + polarity;
    } else if (conceptInfo.concepts.indexOf('fruit_mango') !== -1) {
      semanticKey = 'pref:fruit:mango:' + polarity;
    } else if (conceptInfo.concepts.indexOf('activity_develop') !== -1 && entity) {
      semanticKey = 'project:develop:' + entity;
    } else if (conceptInfo.concepts.indexOf('activity_learn') !== -1 && (entity || conceptInfo.slots[0])) {
      semanticKey = 'plan:learn:' + (entity || conceptInfo.slots[0]);
    } else if (primarySlot) {
      semanticKey = String(category || 'mem') + ':' + primarySlot + ':' + polarity;
    }

    return {
      raw: raw,
      canonical: canon,
      compact: normalizeTextCompact(canon),
      concepts: conceptInfo.concepts,
      slots: conceptInfo.slots,
      polarity: polarity,
      degree: detectDegree(raw),
      entity: entity,
      semanticKey: semanticKey
    };
  }

  function computeSemanticEquivalence(textA, textB, categoryA, categoryB) {
    var sigA = extractSemanticSignature(textA, categoryA);
    var sigB = extractSemanticSignature(textB, categoryB);
    if (!sigA.compact || !sigB.compact) return 0;
    if (sigA.compact === sigB.compact) return 1;

    // 1) 同语义键直接判定等价（如「希望 AI 回复简洁一些」vs「回答尽量精简，别太啰嗦」）
    if (sigA.semanticKey && sigB.semanticKey && sigA.semanticKey === sigB.semanticKey) {
      return 0.92;
    }

    // 2) 规范化后的子串高覆盖
    if ((sigA.compact.indexOf(sigB.compact) !== -1 || sigB.compact.indexOf(sigA.compact) !== -1) &&
        Math.min(sigA.compact.length, sigB.compact.length) / Math.max(sigA.compact.length, sigB.compact.length) >= 0.62) {
      return 0.86;
    }

    // 3) 同核心实体 + 同动作概念（如「正在开发知屿」vs「在推进知屿这个项目」）
    if (sigA.entity && sigB.entity && sigA.entity === sigB.entity) {
      var sharedAction = sigA.concepts.some(function(c) { return sigB.concepts.indexOf(c) !== -1; });
      if (sharedAction) return 0.88;
      if (sigA.polarity === sigB.polarity) return 0.72;
    }

    // 4) 概念集合与规范化 bigram 混合得分（避免把不同偏好对象如草莓/芒果误判为相同）
    var canonJaccard = jaccardSets(buildBigrams(sigA.canonical), buildBigrams(sigB.canonical));
    var conceptSetA = new Set(sigA.concepts);
    var conceptSetB = new Set(sigB.concepts);
    var conceptJaccard = jaccardSets(conceptSetA, conceptSetB);

    // 若双方都有明确命名实体但实体不同（如 草莓 vs 芒果，日语 vs 法语），压低相似度防止误合并
    if (sigA.entity && sigB.entity && sigA.entity !== sigB.entity) {
      return Math.min(0.35, canonJaccard * 0.6);
    }

    if (conceptJaccard >= 0.65 && sigA.polarity === sigB.polarity && sigA.concepts.length > 0) {
      return Math.max(canonJaccard, 0.76);
    }

    return Math.max(canonJaccard, conceptJaccard * 0.68);
  }

  // ===== 2. 时间语义与六态生命周期规范化 =====
  function normalizeTemporalState(val, statusHint, contentHint) {
    var v = String(val || '').trim().toLowerCase();
    if (TEMPORAL_STATES.indexOf(v) !== -1) return v;
    if (/^(?:on_hold|hold|paused|suspended|shelved|deferred|postponed|暂时搁置|搁置|暂停)$/.test(v)) return 'paused';
    if (/^(?:canceled|cancelled|abandoned|dropped|已取消|取消)$/.test(v)) return 'cancelled';
    if (/^(?:done|finished|achieved|completed|已完成|完成)$/.test(v)) return 'completed';
    if (/^(?:planned|upcoming|future|future_plan|计划|未来计划)$/.test(v)) return 'future_plan';
    if (/^(?:former|previous|historical|past|过去|历史)$/.test(v)) return 'past';
    if (/^(?:ongoing|in_progress|active|current|当前|正在进行)$/.test(v)) return 'current';

    var st = String(statusHint || '').trim().toLowerCase();
    if (st === 'paused') return 'paused';
    if (st === 'historical') return 'past';
    if (st === 'completed') return 'completed';
    if (st === 'cancelled') return 'cancelled';

    if (contentHint) {
      var ch = String(contentHint);
      if (/(?:暂时搁置|先搁置|现已搁置|已暂停|暂缓)/.test(ch)) return 'paused';
      if (/(?:现已取消|已取消|已放弃)/.test(ch)) return 'cancelled';
      if (/(?:已完成|已考过|已通过)/.test(ch)) return 'completed';
    }
    return 'current';
  }

  function normalizeMemoryStatus(val, temporalState) {
    var v = String(val || '').trim().toLowerCase();
    if (MEMORY_STATUSES.indexOf(v) !== -1) return v;
    if (/^(?:on_hold|hold|paused|suspended|shelved|deferred|暂时搁置|搁置|暂停)$/.test(v)) return 'paused';
    if (/^(?:canceled|cancelled|abandoned|已取消)$/.test(v)) return 'cancelled';
    if (/^(?:done|finished|completed|已完成)$/.test(v)) return 'completed';
    if (/^(?:former|past|historical|历史)$/.test(v)) return 'historical';

    if (temporalState === 'paused') return 'paused';
    if (temporalState === 'past') return 'historical';
    if (temporalState === 'completed') return 'completed';
    if (temporalState === 'cancelled') return 'cancelled';
    return 'active';
  }

  function normalizeConfidence(val, fallback) {
    if (val === undefined || val === null || val === '') return fallback;
    var n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    if (n > 1 && n <= 100) n = n / 100;
    return Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
  }

  // ===== 3. 语用分类（陈述 / 疑问 / 假设 / 条件 / 玩笑 / 第三方 / 引用） =====
  function isGreetingOrFiller(text) {
    var trimmed = String(text || '').trim();
    if (!trimmed) return true;
    if (/^(?:你好|您好|hi+|hello+|hey|在吗|在不在|早上好|早安|中午好|下午好|晚上好|晚安|谢谢|感谢|多谢|好的|好吧|好呀|好滴|嗯+|嗯嗯|哦+|行|行吧|可以|没问题|收到|明白|知道了|了解|哈哈+|呵呵|ok+|yes|no|bye|再见|拜拜)[！!。.~～\s]*$/i.test(trimmed)) {
      return true;
    }
    if (/^(?:你好|您好|hi+|hello+|早安|晚上好)[，,\s]*(?:今天怎么样|最近怎么样|过得怎么样|在忙什么|吃了吗|好久不见)[？?！!。.~～\s]*$/i.test(trimmed)) {
      return true;
    }
    return false;
  }

  function hasSelfFactCue(text) {
    var src = String(text || '');
    return /(?:我|本人|我的).{0,16}(?:喜欢|最喜欢|最爱|偏爱|偏好|希望|爱吃|爱喝|习惯|开始学|开始学习|正在学|在学|正在开发|在开发|正在做|在做|正在推进|准备|打算|计划|决定|长期目标|不吃|忌口|过敏|住在|从事|职业是|改喝|改吃|不再|取消|放弃|完成|考过|考完|搁置|暂停|暂缓)/.test(src) ||
      /(?:一直|始终|向来|一直都)?(?:都是|就是|是)(?:我的|本人的)(?:最爱|心头好|首选)|(?:一直|始终|向来)?(?:都是|就是|是)我(?:平时|一直|向来)?最(?:喜欢|爱喝|爱吃|偏爱)/.test(src);
  }

  function isJokeOrSarcasm(text) {
    var src = String(text || '').trim();
    if (!src) return false;
    return /(?:开玩笑|开个玩笑|逗你玩|逗你的|瞎说的|胡说的|吹牛|搞笑|狗头|\/s\b|骗你的|才怪|哪有那么多|哈哈哈哈|做梦呢|想得美)/.test(src);
  }

  function isConditionalOrHypothesis(text) {
    var src = String(text || '').trim();
    if (!src) return false;
    if (/^(?:如果|假如|假设|万一|要是我|设想|比方说|比如我|试想|要是有一天|倘若|若是我|大概|也许|可能只是|说不定|随便说说|开玩笑地说|要是有钱了|要是中彩票)/.test(src)) {
      return true;
    }
    if (/(?:如果|假如|假设|万一|要是|倘若).{0,32}(?:的话|我就|我可能会|我就去|怎么办|会怎样|岂不是|……|\.\.\.)/.test(src)) {
      return true;
    }
    return false;
  }

  function isThirdPartyOrQuote(text) {
    var src = String(text || '').trim();
    if (!src) return false;
    if (/^(?:他|她|它|他们|她们|我朋友|朋友|我同事|同事|我同学|同学|我室友|室友|我闺蜜|闺蜜|我哥|我姐|我弟|我妹|我妈|我爸|我老公|我老婆|我对象|男朋友|女朋友|家人|老板|领导|客户|别人|大家|有人|网友|书里|小说里|文章里|老师|听说|据(?:说|了解|悉)|某人|前任)/.test(src)) {
      return true;
    }
    if (/^(?:引用|摘录|名言|台词|书上说|网上说|有人说|别人说)/.test(src)) {
      return true;
    }
    return false;
  }

  function isClauseQuestion(cl) {
    var c = String(cl || '').trim();
    if (!c) return true;
    var bare = c.replace(/[？?！!。.~～]+$/, '').trim();
    if (hasSelfFactCue(bare) && !/[？?]$/.test(c) && !/(?:吗|呢|嘛)$/.test(bare)) {
      return false;
    }
    if (/[？?]$/.test(c)) return true;
    if (/(?:吗|呢|嘛)$/.test(bare)) return true;
    if (/^(?:什么|哪个|哪些|哪里|哪儿|谁|几岁|几个|多少|怎么|如何|为什么|为何|是不是|能不能|可不可以|有没有|帮我推荐|推荐一款|推荐个|解释一下|什么是|请问)/.test(bare)) {
      return true;
    }
    return false;
  }

  function classifyClausePragmatics(clause) {
    var c = String(clause || '').trim();
    if (!c || isGreetingOrFiller(c)) {
      return { mode: 'greeting', aboutUser: false, storable: false, reason: '寒暄或填充语' };
    }
    if (isJokeOrSarcasm(c)) {
      return { mode: 'joke', aboutUser: false, storable: false, reason: '玩笑或反讽表达' };
    }
    if (isConditionalOrHypothesis(c)) {
      return { mode: 'hypothesis', aboutUser: false, storable: false, reason: '条件句或假设设想' };
    }
    if (isThirdPartyOrQuote(c)) {
      return { mode: 'third_party', aboutUser: false, storable: false, reason: '第三方经历或引用内容' };
    }
    if (isClauseQuestion(c)) {
      return { mode: 'question', aboutUser: false, storable: false, reason: '疑问句' };
    }
    return { mode: 'statement', aboutUser: true, storable: true, reason: '' };
  }

  // ===== 4. 上下文指代消解（多轮实体追踪 + 歧义检测 + 状态变更保留） =====
  function hasVagueReference(text) {
    var s = String(text || '').trim();
    if (!s) return false;
    if (/^(?:这个|那个|上面|前面|刚才|刚刚|这件事|那件事|上述|以上|下面这些|这些|那些|它|这事|那事|刚才那个|刚才说的|刚刚说的|前面说的|上面说的|之前说的)(?:[，,。\s]*(?:计划|项目|方案|事|事情|东西|内容|决定|偏好|任务))?$/.test(s)) {
      return true;
    }
    if (/(?:上面说的|刚才说的|刚刚说的|前面提到的|前面说的|之前说的|刚才那个|刚刚那个|上面那个|前面那个|这个方案|那个方案|这个项目|那个项目|这个计划|那个计划|这个任务|那个任务|这件事|那件事|就按这个来|按这个来|之前那个|上回说的|上次说的)/.test(s) &&
        !/(?:名叫|叫做|名为|《|：|:)/.test(s) &&
        s.length <= 44) {
      return true;
    }
    return false;
  }

  function detectReferenceTypeHint(text) {
    var s = String(text || '');
    if (/(?:项目|软件|应用|系统|产品|工具|app|工程)/i.test(s)) return 'project';
    if (/(?:计划|打算|安排|目标|学习|考证|备考|课程|任务)/.test(s)) return 'plan';
    if (/(?:方案|格式|规则|风格|偏好|口味|做法)/.test(s)) return 'decision';
    return 'any';
  }

  function detectReferenceActionHint(text) {
    var s = String(text || '');
    if (/(?:暂时搁置|先搁置|搁置|先暂停|暂停|暂缓|先放一放|放一放|挂起)/.test(s)) {
      return { action: 'update', temporalState: 'paused', status: 'paused', suffix: '（暂时搁置）', importance: 2 };
    }
    if (/(?:取消了?|放弃了?|不打算了?|不做了?|不学了?|作罢了?)/.test(s)) {
      return { action: 'update', temporalState: 'cancelled', status: 'cancelled', suffix: '（现已取消）', importance: 2 };
    }
    if (/(?:完成了?|做完了?|搞定了?|考过了?|考完了?|通过了?|已经结束|已经上线)/.test(s)) {
      return { action: 'update', temporalState: 'completed', status: 'completed', suffix: '（已完成）', importance: 2 };
    }
    if (/(?:重新开始|重启|恢复推进|继续做|重新启动)/.test(s)) {
      return { action: 'update', temporalState: 'current', status: 'active', suffix: '（已恢复进行）', importance: 4 };
    }
    if (/(?:忘掉|忘记|遗忘|删掉|删除|别再记|不要再记)/.test(s)) {
      return { action: 'delete', temporalState: 'current', status: 'active', suffix: '', importance: 3 };
    }
    if (/(?:持续关注|长期关注|一直关注|盯着|跟进|重点关注)/.test(s)) {
      return { action: 'add', temporalState: 'current', status: 'active', suffix: '（希望重点关注）', importance: 4 };
    }
    return { action: 'add', temporalState: 'current', status: 'active', suffix: '', importance: 4 };
  }

  function cleanClauseTail(raw) {
    return String(raw || '')
      .replace(/^(?:的是|是|了|着|过|一个|一款|一项)\s*/, '')
      .replace(/(?:这个项目|那个项目|这个计划|那个计划|这件事|那件事)?[了呀啊呢吧哦啦呗。！!]+$/, '')
      .replace(/[「」《》"']/g, '')
      .trim();
  }

  function extractHistoryEntitiesFromTurn(text, role, turnIndex) {
    var entities = [];
    var src = String(text || '').trim();
    if (!src || src.length < 4) return entities;
    if (isGreetingOrFiller(src) || hasVagueReference(src) || isJokeOrSarcasm(src)) return entities;
    if (role === 'user' && (isConditionalOrHypothesis(src) || isThirdPartyOrQuote(src))) {
      // 若包含“但我/不过我”，只截取转折后半句
      var pivotIdx = src.search(/(?:但我|不过我|可是我|而我|其实我)/);
      if (pivotIdx === -1) return entities;
      src = src.slice(pivotIdx);
    }

    var seenNames = new Set();
    function addEnt(type, name, fullDesc, category) {
      var cleanName = cleanClauseTail(name);
      if (!cleanName || cleanName.length < 2 || /^(?:什么|哪个|怎么|如何|这个|那个|项目|计划|事情)$/.test(cleanName)) return;
      var key = type + ':' + cleanName.toLowerCase();
      if (seenNames.has(key)) return;
      seenNames.add(key);
      entities.push({
        type: type,
        name: cleanName,
        fullDesc: fullDesc || cleanName,
        category: category || (type === 'project' ? '项目' : (type === 'plan' ? '长期计划' : '备忘')),
        role: role,
        turnIndex: turnIndex,
        rawText: src.slice(0, 180)
      });
    }

    var foundExplicitProject = false;

    // 1) 括号/书名号显式标出的多个或单个项目（如「项目「星澜」和项目「青禾」」）
    var bracketProjRe = /(?:项目|软件|应用|系统|产品|工具)\s*[「《"]([^」》"]{1,20})[」》"]/g;
    var bm;
    while ((bm = bracketProjRe.exec(src)) !== null) {
      if (bm[1]) {
        addEnt('project', bm[1], '项目「' + cleanClauseTail(bm[1]) + '」', '项目');
        foundExplicitProject = true;
      }
    }

    // 2) 多候选并列项目（如「我在考虑做星澜和青禾两个项目」或「我在同时开发星澜和青禾项目」）
    var mMultiProj = src.match(/(?:考虑做|正在(?:同时)?(?:做|开发|推进)|在(?:同时)?(?:做|开发|推进)|准备做|有|负责|开发|推进)(?:两个|几个)?(?:项目[：:]?)?\s*[「《"]?([\u4e00-\u9fa5A-Za-z0-9_+#-]{2,14})[」》"]?\s*(?:和|与|以及|、)\s*(?:项目)?[「《"]?([\u4e00-\u9fa5A-Za-z0-9_+#-]{2,14})[」》"]?\s*(?:这两个|两个|几个)?(?:AI|ai)?(?:项目|软件|应用|系统|产品|工具)?/);
    if (!foundExplicitProject && mMultiProj && mMultiProj[1] && mMultiProj[2] && /(?:项目|软件|应用|系统|产品|工具)/.test(src)) {
      addEnt('project', mMultiProj[1], '项目「' + mMultiProj[1] + '」', '项目');
      addEnt('project', mMultiProj[2], '项目「' + mMultiProj[2] + '」', '项目');
      foundExplicitProject = true;
    }

    // 3) 明确命名的项目（如「叫做星澜的AI项目」「叫知屿的项目」「名为青禾的系统」）
    var mNamedProj = src.match(/(?:名叫|叫做|名为|叫)\s*[「《"]?([^，,。；;！!\n的]{2,22}?)[」》"]?(?:的(?:AI|ai)?(?:项目|软件|应用|系统|产品|工具)|这个(?:项目|软件|应用)|$)/);
    if (!foundExplicitProject && mNamedProj && mNamedProj[1]) {
      addEnt('project', mNamedProj[1], '项目「' + cleanClauseTail(mNamedProj[1]) + '」', '项目');
      foundExplicitProject = true;
    }

    // 4) 正在开发/制作/推进的项目（仅在未命中上面精确项目名时作为兜底，避免同一句产出重复候选）
    if (!foundExplicitProject) {
      var mDevProj = src.match(/(?:正在|目前在?|最近在?|准备|打算)(?:同时)?(?:开发|制作|研发|搭建|推进|筹备|打造|做)(?:一个|一款)?(?:叫|名为)?[「《"]?([^，,。；;！!\n]{2,28})[」》"]?/);
      if (mDevProj && mDevProj[1]) {
        var cand = cleanClauseTail(mDevProj[1]);
        if (cand && !/(?:什么|哪个|怎么|饭|菜|作业|家务)/.test(cand)) {
          if (!/(?:两个|几个)(?:项目|方案)/.test(cand)) {
            addEnt('project', cand, '项目：' + cand, '项目');
          }
        }
      }
    }

    // 4) 明确计划/学习目标（如「我打算考日语N2」「准备学法语和德语两个计划」）
    var mMultiPlan = src.match(/(?:打算|准备|计划)(?:学习|学|考)?\s*([\u4e00-\u9fa5A-Za-z0-9]{2,10})\s*(?:和|与|、)\s*([\u4e00-\u9fa5A-Za-z0-9]{2,10})\s*(?:两个|这两个)?(?:计划|目标|语言|课程)/);
    if (mMultiPlan && mMultiPlan[1] && mMultiPlan[2]) {
      addEnt('plan', mMultiPlan[1], '学习/计划：' + mMultiPlan[1], '长期计划');
      addEnt('plan', mMultiPlan[2], '学习/计划：' + mMultiPlan[2], '长期计划');
    }

    var mPlan = src.match(/(?:准备|打算|计划|决定|开始)(?:长期|今年|明年|下个月)?(学习|学|考|备考|去|做|推进)([^，,。；;！!\n]{2,30})/);
    if (mPlan && mPlan[2]) {
      var pDesc = cleanClauseTail((mPlan[1] || '') + mPlan[2]);
      if (pDesc && !/(?:两个|几个)(?:计划|目标)/.test(pDesc)) {
        addEnt('plan', pDesc, '计划：' + pDesc, '长期计划');
      }
    }

    // 5) 助手给出的约定方案
    if (role === 'assistant' && src.length >= 10 && !/[？?]$/.test(src)) {
      addEnt('decision', src.slice(0, 80), src.slice(0, 110), '决定');
    }

    return entities;
  }

  function resolveCoreference(userText, historyMessages, options) {
    var src = String(userText || '').trim();
    var list = Array.isArray(historyMessages) ? historyMessages : [];
    var opts = options && typeof options === 'object' ? options : {};
    var limit = Math.max(60, Number(opts.maxLen) || DEFAULT_MAX_LEN);

    if (!src || !hasVagueReference(src)) {
      return { status: 'not_applicable', hasReference: false };
    }

    var typeHint = detectReferenceTypeHint(src);
    var actionHint = detectReferenceActionHint(src);
    var recentWindow = list.slice(-12);

    var matchedEntities = [];
    for (var i = recentWindow.length - 1; i >= 0; i--) {
      var m = recentWindow[i];
      if (!m || !m.content) continue;
      var role = m.role === 'assistant' ? 'assistant' : 'user';
      var ents = extractHistoryEntitiesFromTurn(m.content, role, i);
      for (var e = 0; e < ents.length; e++) {
        if (typeHint === 'any' || ents[e].type === typeHint || (typeHint === 'plan' && ents[e].type === 'project')) {
          matchedEntities.push(ents[e]);
        }
      }
    }

    // 只优先考虑用户自己说出的实体；若用户没提且用户在说「按这个来/方案」，才回退到助手实体
    var userEnts = matchedEntities.filter(function(e) { return e.role === 'user'; });
    var pool = userEnts.length > 0
      ? userEnts
      : (/(?:按这个来|就按这样|方案|格式|规则|计划)/.test(src) ? matchedEntities : []);

    if (pool.length === 0) {
      var typeNameMap = {
        project: '项目',
        plan: '计划或任务',
        decision: '方案或偏好',
        any: '具体事项'
      };
      var what = typeNameMap[typeHint] || '具体事项';
      return {
        status: 'unresolved',
        hasReference: true,
        needsClarification: true,
        clarificationQuestion: '当前对话里还没有明确提到对应的' + what + '，能告诉我具体名称或内容吗？'
      };
    }

    // 检查最近一轮是否同时存在多个同类型竞争实体 -> 存在歧义，必须主动追问，绝不猜测
    var topTurnIdx = pool[0].turnIndex;
    var sameTurnPool = pool.filter(function(e) { return e.turnIndex === topTurnIdx; });
    if (sameTurnPool.length >= 2) {
      var names = sameTurnPool.slice(0, 3).map(function(e) { return '「' + e.name + '」'; }).join('和');
      return {
        status: 'ambiguous',
        hasReference: true,
        needsClarification: true,
        candidates: sameTurnPool,
        clarificationQuestion: '你刚才同时提到了' + names + '，请问具体是指哪一个呢？'
      };
    }

    // 单一清晰实体 -> 精准消解并保留本轮动作与时间状态
    var picked = pool[0];
    var content = '';
    if (actionHint.action === 'delete') {
      content = picked.name;
    } else if (actionHint.temporalState === 'paused') {
      content = '用户暂时搁置' + (picked.type === 'project' ? ('项目「' + picked.name + '」') : picked.fullDesc);
    } else if (actionHint.temporalState === 'cancelled') {
      content = '用户已取消原' + (picked.type === 'project' ? ('项目「' + picked.name + '」') : picked.fullDesc);
    } else if (actionHint.temporalState === 'completed') {
      content = '用户已完成' + (picked.type === 'project' ? ('项目「' + picked.name + '」') : picked.fullDesc);
    } else if (picked.role === 'assistant') {
      content = '用户确认后续采用约定方案：' + picked.fullDesc;
    } else if (picked.type === 'project') {
      content = '用户正在推进项目「' + picked.name + '」' + actionHint.suffix;
    } else if (picked.type === 'plan') {
      content = '用户计划' + picked.name + actionHint.suffix;
    } else {
      content = '用户关注：' + picked.fullDesc + actionHint.suffix;
    }

    if (content.length > limit) content = content.slice(0, limit);
    var sig = extractSemanticSignature(content, picked.category);

    return {
      status: 'resolved',
      hasReference: true,
      needsClarification: false,
      entity: picked,
      item: {
        intent: actionHint.action === 'delete' ? 'delete' : (actionHint.action === 'update' ? 'update' : 'save'),
        action: actionHint.action,
        shouldSave: true,
        aboutUser: true,
        isDurable: true,
        factType: picked.type === 'project' ? 'project' : (picked.type === 'plan' ? 'plan' : 'direct_fact'),
        factSource: 'context_resolved',
        temporalState: actionHint.temporalState,
        status: actionHint.status,
        relation: actionHint.action === 'update' ? 'status_changed' : 'new',
        targetSubject: picked.name,
        confidence: 0.88,
        content: content,
        category: picked.category,
        importance: actionHint.importance,
        scope: 'user',
        rawExpression: src.slice(0, 260),
        mentionedAt: Date.now(),
        userConfirmed: !!opts.isExplicit,
        semanticKey: sig.semanticKey
      }
    };
  }

  // ===== 5. 多事实原子提取 + 六态时间语义提取 =====
  function convertFirstPersonToThirdPerson(clause) {
    var s = String(clause || '').trim();
    if (!s) return '';
    s = s
      .replace(/我的/g, '用户的')
      .replace(/我们/g, '用户')
      .replace(/本人/g, '用户')
      .replace(/^我/, '用户')
      .replace(/([，,；;\s：:])我/g, '$1用户')
      .replace(/给我/g, '给用户')
      .replace(/叫我/g, '称呼用户')
      .replace(/回复我/g, '回复用户')
      .replace(/对我/g, '对用户');
    if (s.indexOf('用户') === -1) {
      s = '用户：' + s;
    }
    return s;
  }

  function inferCategory(text) {
    var t = String(text || '');
    if (/(?:项目|开发|正在做|系统|软件|应用|仓库|产品|知屿)/.test(t) && !/(?:回复|回答|喜欢|偏爱|不吃|忌口)/.test(t)) return '项目';
    if (/(?:喜欢|最喜欢|爱喝|爱吃|最爱|偏好|习惯喝|习惯吃|不喜欢|讨厌|忌口|过敏|改喝|改吃|风格|排版|简短|简洁|精简|详尽|清单|回复|回答|先给结论)/.test(t)) return '偏好';
    if (/(?:每天|每晚|平时|作息|习惯|早起|熬夜|几点睡|每周)/.test(t)) return '习惯';
    if (/(?:计划|打算|准备去|下周|下个月|明年|目标|出差|旅行|考研|备考|开始学|学习|学日语|学英语|法语|考证|进修|搁置|暂停|完成|取消)/.test(t)) return '长期计划';
    if (/(?:决定|确定|选定|定下来|不再)/.test(t)) return '决定';
    if (/(?:叫我|我叫|名字|职业|工程师|医生|老师|学生|住在|居住|老家|养了)/.test(t)) return '身份信息';
    return '备忘';
  }

  function inferFactType(category, temporalState, status) {
    if (status === 'cancelled' || status === 'completed' || status === 'paused' || temporalState === 'past') {
      return 'status_change';
    }
    if (category === '项目') return 'project';
    if (category === '长期计划') return 'plan';
    if (category === '偏好') return 'preference';
    if (category === '习惯') return 'habit';
    if (category === '身份信息') return 'identity';
    if (category === '决定') return 'decision';
    return 'direct_fact';
  }

  function extractAtomicFacts(userText, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var src = String(userText || '').trim();
    var limit = Math.max(60, Number(opts.maxLen) || DEFAULT_MAX_LEN);
    var mentionedAt = Number(opts.mentionedAt) || Date.now();
    var userConfirmed = !!opts.userConfirmed;

    if (!src || src.length < 4) return [];
    if (isGreetingOrFiller(src) || isJokeOrSarcasm(src)) return [];
    if (isConditionalOrHypothesis(src) && !/(?:但我|其实我|我现在|不过我)/.test(src)) return [];

    var out = [];
    var seen = new Set();

    function pushFact(content, category, importance, extra) {
      var text = String(content || '').replace(/[。！!]+$/, '').trim();
      if (!text || text.length < 4) return;
      if (text.length > limit) text = text.slice(0, limit);
      var ex = extra && typeof extra === 'object' ? extra : {};
      var tState = normalizeTemporalState(ex.temporalState, ex.status, text);
      var st = normalizeMemoryStatus(ex.status, tState);
      var cat = category || inferCategory(text);
      var sig = extractSemanticSignature(text, cat);
      var dedupKey = (sig.semanticKey || sig.compact) + '|' + st + '|' + tState;
      if (!dedupKey || seen.has(dedupKey)) return;
      seen.add(dedupKey);

      out.push(Object.assign({
        intent: ex.action === 'update' ? 'update' : 'save',
        action: ex.action || 'add',
        shouldSave: true,
        aboutUser: true,
        isDurable: true,
        factType: ex.factType || inferFactType(cat, tState, st),
        factSource: ex.factSource || 'user_statement',
        temporalState: tState,
        status: st,
        relation: ex.relation || (ex.action === 'update' ? 'status_changed' : 'new'),
        targetSubject: ex.targetSubject || sig.entity || '',
        confidence: normalizeConfidence(ex.confidence, userConfirmed ? 0.94 : 0.9),
        content: text,
        category: cat,
        importance: importance || 4,
        scope: ex.scope || 'user',
        rawExpression: String(ex.rawExpression || src).slice(0, 260),
        mentionedAt: mentionedAt,
        userConfirmed: ex.userConfirmed != null ? !!ex.userConfirmed : userConfirmed,
        semanticKey: sig.semanticKey,
        via: 'semantic_atomic_rule'
      }, ex, {
        temporalState: tState,
        status: st,
        category: cat
      }));
    }

    var sentenceUnits = src.split(/[。；;！!\n]+/).map(function(s) { return s.trim(); }).filter(Boolean);
    var clausesQueue = [];

    for (var si = 0; si < sentenceUnits.length; si++) {
      var sent = sentenceUnits[si];
      if (!sent || sent.length < 4) continue;
      if (isJokeOrSarcasm(sent)) continue;

      // 整句假设/第三方：若含本人转折（「我朋友喜欢美式，但我偏爱拿铁」），保留转折后的用户事实部分
      if ((isConditionalOrHypothesis(sent) || isThirdPartyOrQuote(sent)) && !/(?:但我|不过我|可是我|而我|我也|其实我|我自己)/.test(sent)) {
        continue;
      }

      // (1) 过去偏好 vs 当前偏好对比（「我以前喜欢草莓，现在更喜欢芒果」/「之前爱喝美式，现在改喝拿铁」/「虽然以前喜欢甜食，但现在偏爱清淡」）
      var mPastNow = sent.match(/^(?:虽然|尽管)?(?:我|本人)(?:以前|之前|曾经|过去|原本)(?:比较|最|挺)?(喜欢|偏爱|偏好|爱吃|爱喝|习惯)([^，,；;]{1,28}?)[，,；;]+\s*(?:但|不过|可是|而|然而)?(?:现在|如今|目前|后来)?(?:我)?(?:现在|如今|目前)?(?:也|其实)?(更喜欢|改喜欢|更爱吃|更爱喝|改喝|改吃|更偏爱|偏爱|偏好|喜欢|爱吃|爱喝|习惯)([^，,；;]{1,28})/);
      if (mPastNow && mPastNow[2] && mPastNow[4]) {
        var oldVerb = mPastNow[1];
        var oldObj = cleanClauseTail(mPastNow[2]);
        var newVerb = mPastNow[3];
        var newObj = cleanClauseTail(mPastNow[4]);
        if (oldObj && newObj && oldObj !== newObj) {
          pushFact('用户以前' + oldVerb + oldObj, inferCategory(oldVerb + oldObj), 2, {
            action: 'update',
            temporalState: 'past',
            status: 'historical',
            relation: 'status_changed',
            targetSubject: oldObj,
            rawExpression: sent
          });
          pushFact('用户现在' + newVerb + newObj, inferCategory(newVerb + newObj), 5, {
            action: 'add',
            temporalState: 'current',
            status: 'active',
            relation: 'updated',
            targetSubject: newObj,
            rawExpression: sent
          });
          continue;
        }
      }

      // (2) 暂时搁置的事项（「我原来准备做的XX先搁置了」/「健身计划最近太忙先搁置一段时间」/「学法语先暂停一下」）
      var mPausedPair = sent.match(/^(?:我|本人)?(?:原来|本来|之前|原本|那个|这个)?(?:准备|打算|计划|正在做的?)?([^，,；;]{2,34}?)[，,；;]*?(?:最近太忙|因为[^，,]{1,12})?[，,；;]*?(?:但|不过|现在|目前)?(?:先|暂时|临时|现已|已经)?(?:搁置了?|暂停了?|暂缓了?|放一放了?|先停一停|挂起了?)(?:一段时间|吧|了)?$/);
      if (mPausedPair && mPausedPair[1] && !hasVagueReference(sent)) {
        var pausedTarget = cleanClauseTail(mPausedPair[1].replace(/^(?:我的|把|关于)/, ''));
        if (pausedTarget && pausedTarget.length >= 2) {
          pushFact('用户暂时搁置事项：' + pausedTarget, inferCategory(pausedTarget), 2, {
            action: 'update',
            temporalState: 'paused',
            status: 'paused',
            relation: 'status_changed',
            targetSubject: pausedTarget,
            rawExpression: sent
          });
          continue;
        }
      }

      // (3) 已取消的计划（「我原来准备学习法语，但现在取消了」/「法语学习计划我取消了」/「之前打算考驾照，现在放弃了」）
      var mCancel = sent.match(/^(?:我|本人)?(?:原来|本来|之前|原本|先前)?(?:准备|打算|计划|想|想要)?(?:长期)?([^，,；;]{2,36}?)[，,；;]*?(?:但|不过|但是|可是)?(?:我)?(?:现在|如今|目前|已经)?(?:取消了?|放弃了?|不打算了?|不学了?|不做了?|不考了?|作罢了?)$/);
      if (mCancel && mCancel[1] && !hasVagueReference(sent) && /(?:计划|打算|准备|学习|学|考|项目|旅游|出差|健身|目标)/.test(sent)) {
        var cancelTarget = cleanClauseTail(mCancel[1].replace(/^(?:我的|把|关于)/, ''));
        if (cancelTarget && cancelTarget.length >= 2) {
          pushFact('用户原计划' + cancelTarget + '，现已取消', inferCategory('计划' + cancelTarget), 2, {
            action: 'update',
            temporalState: 'cancelled',
            status: 'cancelled',
            relation: 'status_changed',
            targetSubject: cancelTarget,
            rawExpression: sent
          });
          continue;
        }
      }

      // (4) 已完成的任务/计划/项目（「我之前计划的XX已经完成了」/「日语N2我已经考过了」/「知屿一期项目已经完成了」）
      var mDone = sent.match(/^(?:我|本人)?(?:之前|原本|原来)?(?:准备|打算|计划)?的?([^，,；;]{2,36}?)[，,；;]*?(?:我)?(?:已经|现已|刚刚|刚)?(?:完成了?|考完了?|考过了?|通过了?|做完了?|搞定了?|顺利结束)$/);
      if (mDone && mDone[1] && !hasVagueReference(sent) && !/^(?:今天|刚才|这顿饭|午饭|晚饭)/.test(mDone[1])) {
        var doneTarget = cleanClauseTail(mDone[1].replace(/^(?:我的|把|关于)/, ''));
        if (doneTarget && doneTarget.length >= 2) {
          var doneCat = inferCategory(doneTarget);
          if (doneCat === '备忘') doneCat = '长期计划';
          pushFact('用户已完成：' + doneTarget, doneCat, 2, {
            action: 'update',
            temporalState: 'completed',
            status: 'completed',
            relation: 'status_changed',
            targetSubject: doneTarget,
            rawExpression: sent
          });
          continue;
        }
      }

      // 拆分为独立子句（支持逗号及「而且/并且/同时/另外/还有」）
      var rawSubs = sent
        .split(/[，,]+|(?=(?:而且|并且|同时|另外|此外|顺便说一下))/)
        .map(function(x) { return x.trim(); })
        .filter(Boolean);
      var sentHasSelf = /^(?:我|本人)/.test(sent) || /(?:但我|不过我|而我|我也|其实我|我自己)/.test(sent);
      for (var sc = 0; sc < rawSubs.length; sc++) {
        clausesQueue.push({ text: rawSubs[sc], sentHasSelf: sentHasSelf });
      }
    }

    for (var i = 0; i < clausesQueue.length; i++) {
      var entry = clausesQueue[i];
      var rawCl = entry.text;
      if (!rawCl || rawCl.length < 3) continue;

      var cl = rawCl
        .replace(/^(?:而且|并且|同时|此外|另外|还有|以及|然后|顺便说一下|顺便提一下|对了)\s*/, '')
        .replace(/^(?:但|不过|可是|然而|而|其实)(?=(?:我|本人|现在|以后|今后|回复|回答|工作时|上班时|周末|休息时|写代码时?|学习时|学新概念时?|冬天|冬季|夏天|夏季|春天|春季|秋天|秋季|早上|晚上|夜间|出差时|旅行时))/, '')
        .trim();

      if (!cl || cl.length < 3) continue;
      if (hasVagueReference(cl)) continue;

      var mgrGuard = global.AiWorkspaceMemoryManager;
      if (mgrGuard && typeof mgrGuard.isTemporaryChangeExpression === 'function' && mgrGuard.isTemporaryChangeExpression(cl)) {
        continue;
      }
      if (mgrGuard && typeof mgrGuard.isAmbiguousPreferenceExpression === 'function' && mgrGuard.isAmbiguousPreferenceExpression(cl)) {
        continue;
      }

      var prag = classifyClausePragmatics(cl);
      if (!prag.storable) continue;

      // 主语承前省略补全（如「我正在开发知屿，最近开始学习日语，而且以后希望 AI 回复简洁一些」「我平时喜欢喝冰美式，但冬天喜欢喝热拿铁」）
      var hasThirdPartyPrefix = /^(?:他|她|它|我朋友|朋友|同事|同学|室友|闺蜜|我妈|我爸|家人|老板|别人|网友|老师|客户)/.test(cl);
      if (entry.sentHasSelf && !hasThirdPartyPrefix && !/^(?:我|本人)/.test(cl)) {
        var normSub = cl
          .replace(/^(最近|目前|现在|以后|今后|往后|平时|一直|本来|原来)\s*(?:还|也)\s*/, '$1')
          .replace(/^(?:还|也)\s*(?=(?:在|正在|开始|准备|打算|计划|决定|希望|喜欢|偏爱|偏好|爱吃|爱喝|习惯|不吃|忌口|过敏))/, '')
          .trim();
        if (/^(?:最近|目前|现在|以后|今后|往后|平时|一直在|正在|开始|准备|打算|计划|决定|希望|想要|喜欢|偏爱|偏好|爱吃|爱喝|习惯|不吃|忌口|过敏|每周|每天|每晚|回复|回答|工作时|上班时|周末|休息时|写代码时?|学新概念时?|学习时|冬天|冬季|夏天|夏季|春天|春季|秋天|秋季|早上|晚上|夜间|出差时|旅行时)/.test(normSub)) {
          cl = '我' + normSub;
        }
      }

      // 子句级状态变更：暂停 / 搁置
      var mSubPause = cl.match(/^(?:我|本人)?(?:把)?([^，,。]{2,26}?)(?:先|暂时|临时)?(?:搁置了?|暂停了?|暂缓了?|先放一放)/);
      if (mSubPause && mSubPause[1]) {
        var pSubj = cleanClauseTail(mSubPause[1]);
        if (pSubj && pSubj.length >= 2) {
          pushFact('用户暂时搁置事项：' + pSubj, inferCategory(pSubj), 2, {
            action: 'update',
            temporalState: 'paused',
            status: 'paused',
            relation: 'status_changed',
            targetSubject: pSubj,
            rawExpression: rawCl
          });
          continue;
        }
      }

      // 子句级状态变更：取消 / 放弃
      var mSubCancel = cl.match(/^(?:我|本人)?(?:已经)?(?:取消了?|放弃了?|不打算再?)([^，,。]{2,26})/);
      if (mSubCancel && mSubCancel[1]) {
        var cSubj = cleanClauseTail(mSubCancel[1]);
        if (cSubj && cSubj.length >= 2) {
          pushFact('用户已取消原计划：' + cSubj, inferCategory('计划' + cSubj), 2, {
            action: 'update',
            temporalState: 'cancelled',
            status: 'cancelled',
            relation: 'status_changed',
            targetSubject: cSubj,
            rawExpression: rawCl
          });
          continue;
        }
      }

      // 子句级状态变更：已完成
      var mSubDone = cl.match(/^(?:我|本人)(?:已经|现已|刚刚)?(?:完成了?|考过了?|考完了?|做完了?|通过了?)([^，,。]{2,26})/);
      if (mSubDone && mSubDone[1] && !/^(?:今天|刚才|饭)/.test(mSubDone[1])) {
        var dSubj = cleanClauseTail(mSubDone[1]);
        if (dSubj && dSubj.length >= 2) {
          var subDoneCat = inferCategory(dSubj);
          if (subDoneCat === '备忘') subDoneCat = '长期计划';
          pushFact('用户已完成：' + dSubj, subDoneCat, 2, {
            action: 'update',
            temporalState: 'completed',
            status: 'completed',
            relation: 'status_changed',
            targetSubject: dSubj,
            rawExpression: rawCl
          });
          continue;
        }
      }

      var mgr = global.AiWorkspaceMemoryManager;
      var clScene = (mgr && typeof mgr.extractScenarioContext === 'function')
        ? mgr.extractScenarioContext(cl)
        : { code: '', label: '', raw: '' };

      // 1) 回复风格 / AI 交互偏好（覆盖「以后希望 AI 回复简洁一些」「写代码时希望回答简洁」「学新概念时希望讲解详细」）
      if (/(?:AI|ai|助手|回复|回答|输出|讲解|排版|语气|风格)/.test(cl) &&
          /(?:简洁|精简|简短|简练|干练|言简意赅|详细|详尽|分点|清单|列表|先给结论|结论先行|开门见山|少废话|别太啰嗦|不要太啰嗦|不要太长|别写太长|直接给代码|中文|英文)/.test(cl)) {
        var scenePrefix = clScene.label ? (clScene.label) : '';
        var styleDesc = '';
        if (/(?:简洁|精简|简短|简练|干练|言简意赅|少废话|别太啰嗦|不要太啰嗦|不要太长|别写太长)/.test(cl)) {
          styleDesc = '用户' + scenePrefix + '偏好回复风格：简洁精简';
        } else if (/(?:详细|详尽)/.test(cl)) {
          styleDesc = '用户' + scenePrefix + '偏好回复风格：详细深入';
        } else if (/(?:分点|清单|列表)/.test(cl)) {
          styleDesc = '用户' + scenePrefix + '偏好回复风格：分点清单呈现';
        } else if (/(?:先给结论|结论先行|开门见山)/.test(cl)) {
          styleDesc = '用户' + scenePrefix + '偏好回复风格：先给结论';
        } else {
          styleDesc = convertFirstPersonToThirdPerson(cl);
        }
        pushFact(styleDesc, '偏好', 4, {
          temporalState: 'current',
          status: 'active',
          factType: 'preference',
          scenario: clScene.code || '',
          scenarioLabel: clScene.label || '',
          rawExpression: rawCl
        });
        continue;
      }

      // 2) 正在开发 / 推进的项目
      var mProject = cl.match(/^(?:我|本人)(?:目前|现在|最近)?(?:正在|在)(?:开发|制作|研发|搭建|编写|筹备|推进|打造)([^，,。；;！!\n]{2,48})/);
      if (mProject && mProject[1]) {
        var projTail = cleanClauseTail(mProject[1]);
        if (projTail && projTail.length >= 2 && !/(?:什么|哪个|怎么|如何|问题|报错|bug)/i.test(projTail)) {
          var verbMatch = cl.match(/(开发|制作|研发|搭建|编写|筹备|推进|打造)/);
          var verb = verbMatch ? verbMatch[1] : '开发';
          pushFact('用户正在' + verb + '项目：' + projTail, '项目', 4, {
            temporalState: 'current',
            status: 'active',
            factType: 'project',
            targetSubject: projTail,
            rawExpression: rawCl
          });
          continue;
        }
      }

      // 3) 当前开始学习 / 持续学习
      var mStartLearn = cl.match(/^(?:我|本人)(?:最近|刚刚|刚|现在|这几天|这阵子)?(?:开始)(?:学习|学)([^，,。；;！!\n]{1,36})/);
      if (mStartLearn && mStartLearn[1]) {
        var subj1 = cleanClauseTail(mStartLearn[1]);
        if (subj1 && !/^(?:怎么|什么|如何)/.test(subj1)) {
          pushFact('用户当前学习目标：' + subj1, '长期计划', 4, {
            temporalState: 'current',
            status: 'active',
            factType: 'plan',
            targetSubject: subj1,
            rawExpression: rawCl
          });
          continue;
        }
      }

      var mOngoingLearn = cl.match(/^(?:我|本人)(?:一直在|正在|每天都在|最近在)(?:学习|学|练习|备考)([^，,。；;！!\n]{1,36})/);
      if (mOngoingLearn && mOngoingLearn[1]) {
        var subjOngoing = cleanClauseTail(mOngoingLearn[1]);
        if (subjOngoing && !/^(?:怎么|什么|如何)/.test(subjOngoing)) {
          pushFact('用户正在持续学习：' + subjOngoing, '长期计划', 4, {
            temporalState: 'current',
            status: 'active',
            factType: 'plan',
            targetSubject: subjOngoing,
            rawExpression: rawCl
          });
          continue;
        }
      }

      // 4) 未来计划（学习/旅行/出差/考证/长期规划）
      var mFuturePlan = cl.match(/^(?:我|本人)(?:以后|今后|往后|接下来|未来|今年|明年|下个月|下周|目前|原本|本来|原来)?(?:准备|打算|计划|想在|预计)(?:长期|持续)?([^，,。；;！!\n]{2,40})/);
      if (mFuturePlan && mFuturePlan[1]) {
        var planTail = cleanClauseTail(mFuturePlan[1]);
        if (planTail && !/^(?:怎么|什么|如何|去哪|买什么)/.test(planTail)) {
          pushFact('用户未来计划：' + planTail, '长期计划', 4, {
            temporalState: 'future_plan',
            status: 'active',
            factType: 'plan',
            targetSubject: planTail,
            rawExpression: rawCl
          });
          continue;
        }
      }

      // 5) 否定型变更（不再喜欢/不再喝/以后不吃）
      var mNegChange = cl.match(/^(?:我|本人)(?:现在|以后|已经)?(?:不再|再也不|不打算再)(喜欢|喝|吃|用|做)([^，,。；;！!\n]{1,30})/);
      if (mNegChange && mNegChange[2]) {
        var negObj = cleanClauseTail(mNegChange[2]);
        if (negObj) {
          pushFact('用户现在不再' + mNegChange[1] + negObj, '偏好', 4, {
            action: 'update',
            temporalState: 'current',
            status: 'active',
            relation: 'updated',
            targetSubject: negObj,
            factType: 'preference',
            rawExpression: rawCl
          });
          continue;
        }
      }

      // 6) 过去偏好单独陈述（「我以前很喜欢吃甜食」「以前我常喝美式」）
      var mPastOnly = cl.match(/^(?:我|本人)(?:以前|之前|曾经|过去)(?:比较|很|最|常)?(喜欢|偏爱|爱吃|爱喝|习惯|住过|做过)([^，,。；;！!\n]{1,32})/);
      if (mPastOnly && mPastOnly[2]) {
        var pastObj = cleanClauseTail(mPastOnly[2]);
        if (pastObj) {
          pushFact('用户以前' + mPastOnly[1] + pastObj, inferCategory(mPastOnly[1] + pastObj), 2, {
            temporalState: 'past',
            status: 'historical',
            factType: 'status_change',
            targetSubject: pastObj,
            rawExpression: rawCl
          });
          continue;
        }
      }

      // 7) 通用喜好 / 偏好 / 习惯（支持前置场景限定：工作时 / 周末放松时 / 写代码时 / 冬天 / 夏天 / 晚上等）
      var mPref = cl.match(/^(?:我|本人)(?:(?:工作时|上班时|办公时|周末(?:放松时?)?|休息时|放假时|平时放松|放松时|下班后|休闲时|写代码时?|编程时?|学习时|冬天|冬季|夏天|夏季|春天|春季|秋天|秋季|早上|早晨|上午|晚上|夜里|睡前|出差时|旅行时|在[\u4e00-\u9fa5]{2,6}时)|(?:平时|一般|通常|向来|一直|现在|目前))?(?:比较|更|最|挺|很)?(?:喜欢|偏爱|偏好|最爱|爱吃|爱喝|习惯|倾向于|改喝|改吃|常喝|常吃|常用)([^，,。；;！!\n]{2,45})/);
      if (mPref && mPref[1] && !/(?:今天|昨天|刚才|那部|那个电影|这首)/.test(cl)) {
        var prefFull = convertFirstPersonToThirdPerson(cl.replace(/[。！!]+$/, ''));
        var prefCat = /平时|每天|每晚|每周|作息|早起|熬夜/.test(cl) && !/喜欢|偏爱|偏好|最爱|爱喝|爱吃/.test(cl) ? '习惯' : '偏好';
        pushFact(prefFull, prefCat, 4, {
          temporalState: 'current',
          status: 'active',
          factType: prefCat === '习惯' ? 'habit' : 'preference',
          scenario: clScene.code || '',
          scenarioLabel: clScene.label || '',
          rawExpression: rawCl
        });
        continue;
      }

      // 7b) 对象前置的偏好表达（「冰美式一直是我的最爱」「冰美式是我最爱喝的咖啡」「草莓是我最喜欢的水果」）
      var mObjFav = cl.match(/^([^，,。；;！!\n]{2,22}?)(?:一直|始终|向来|其实|平时)?(?:都是|就是|是)(?:我的|本人的)(?:最爱|心头好|首选)$|^([^，,。；;！!\n]{2,22}?)(?:一直|始终|向来|其实|平时)?(?:都是|就是|是)我(?:平时|一直|向来)?最(?:喜欢|爱喝|爱吃|偏爱)的?([^，,。；;！!\n]{0,14})$/);
      if (mObjFav && !hasThirdPartyPrefix && !/(?:今天|昨天|刚才|那个|这个)/.test(cl)) {
        var favTarget = cleanClauseTail(mObjFav[1] || mObjFav[2] || '');
        if (favTarget && favTarget.length >= 2) {
          pushFact(convertFirstPersonToThirdPerson(cl.replace(/[。！!]+$/, '')), '偏好', 4, {
            temporalState: 'current',
            status: 'active',
            factType: 'preference',
            scenario: clScene.code || '',
            scenarioLabel: clScene.label || '',
            rawExpression: rawCl
          });
          continue;
        }
      }

      // 8) 忌口 / 过敏 / 不吃不喝
      var mAvoid = cl.match(/^(?:我|本人)(?:平时|向来|一直|绝对|千万)?(?:不吃|忌口|过敏|讨厌|不爱吃|不爱喝|不喜欢吃|不喜欢喝|别放|不要放|对[^，,]{1,8}过敏)([^，,。；;！!\n]{0,32})/);
      if (mAvoid && (mAvoid[1] || /过敏/.test(cl))) {
        pushFact(convertFirstPersonToThirdPerson(cl.replace(/[。！!]+$/, '')), '偏好', 4, {
          temporalState: 'current',
          status: 'active',
          factType: 'preference',
          rawExpression: rawCl
        });
        continue;
      }

      // 9) 固定作息/规律习惯（「我每周三晚上打羽毛球」「我每天早上7点起床」）
      var mHabit = cl.match(/^(?:我|本人)(?:每天|每晚|每早|每周[一二三四五六日天]?|平时一般)([^，,。；;！!\n]{2,36})/);
      if (mHabit && mHabit[1]) {
        pushFact(convertFirstPersonToThirdPerson(cl.replace(/[。！!]+$/, '')), '习惯', 4, {
          temporalState: 'current',
          status: 'active',
          factType: 'habit',
          rawExpression: rawCl
        });
        continue;
      }

      // 10) 长期目标 / 重要决定 / 身份信息
      var mGoal = cl.match(/^(?:我|本人)(?:的长期目标是|长期目标是|已经决定|决定以后|以后希望|希望以后|住在|居住在|职业是|是一名|叫|名字是)([^，,。；;！!\n]{2,45})/);
      if (mGoal && mGoal[1]) {
        var gCat = /(?:住在|居住在|职业是|是一名|叫|名字是)/.test(cl)
          ? '身份信息'
          : (/决定/.test(cl) ? '决定' : (/希望/.test(cl) ? '偏好' : '长期计划'));
        pushFact(convertFirstPersonToThirdPerson(cl.replace(/[。！!]+$/, '')), gCat, 4, {
          temporalState: gCat === '长期计划' ? 'future_plan' : 'current',
          status: 'active',
          rawExpression: rawCl
        });
      }
    }

    return out;
  }

  // ===== 6. 统一结构化 JSON 提示词构造与容错解析 =====
  function buildSemanticAnalysisPrompt(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var mode = opts.mode === 'explicit' ? 'explicit' : 'proactive';
    var existingListText = String(opts.existingListText || '（暂无已有记忆）');
    var historyBlock = String(opts.historyBlock || '');
    var intentHintLine = String(opts.intentHintLine || '');
    var userText = String(opts.userText || '').slice(0, 1200);
    var assistantText = String(opts.assistantText || '').slice(0, 360);

    var roleHeader = mode === 'explicit'
      ? '你是知屿的「深度语义记忆判断器」。请理解用户的真实意图、隐含修改/删除、上下文指代、六态时间语义、多事实拆解与可信度。'
      : '你是知屿的「主动长期记忆深度语义理解器」。请分析用户自然语言中的隐含意图、上下文指代、时间变化、多事实与可信度。';

    return (
      roleHeader + '\n\n' +
      '【核心规则（严格遵守）】\n' +
      '1. 多事实原子拆解：一句话包含多个独立事实时（例如项目 + 学习目标 + 回复风格偏好），必须在 memories 数组中拆成多条独立条目，禁止合并成一条。\n' +
      '2. 上下文指代消解：若用户说「刚才那个项目」「之前说的计划」「按这个来」等指代，必须从【近期聊天上下文】还原具体对象写入 content（factSource="context_resolved"）。若上下文无法唯一确定或存在歧义，绝不猜测，返回 intent="clarify" 并填写简短清晰的 clarificationQuestion。\n' +
      '3. 六态时间语义：必须准确标注 temporalState 与 status：\n' +
      '   - 正在发生/当前有效：temporalState="current", status="active"\n' +
      '   - 已经发生/过去偏好：temporalState="past", status="historical"\n' +
      '   - 未来计划：temporalState="future_plan", status="active"\n' +
      '   - 已完成任务：temporalState="completed", status="completed"\n' +
      '   - 已取消计划：temporalState="cancelled", status="cancelled"\n' +
      '   - 暂时搁置事项：temporalState="paused", status="paused"\n' +
      '   若更新已有记忆状态，在 targetId 填入匹配记忆 ID 或填写 targetSubject。\n' +
      '4. 同义与事实去重：理解不同表达指向的相同含义（如「回复简洁」与「回答精简不啰嗦」），已存在且状态未变时不重复添加。\n' +
      '5. 可信度与过滤：严格区分陈述、疑问、假设、条件、玩笑、引用和第三方经历。绝不将模型推测、假设、玩笑、他人事实或低置信度内容（confidence < 0.65）当作用户确定性长期记忆（标记 shouldSave=false）。绝不保存密码、API Key、验证码、私钥、证件/银行卡号。\n' +
      '6. 来源与确认：每条尽量填写 rawExpression（用户对应原句片段）、factType（direct_fact/preference/plan/project/habit/identity/decision/status_change）、userConfirmed（用户明确陈述或要求记住为 true，否则 false）。\n\n' +
      intentHintLine +
      '【已有记忆】\n' + existingListText + '\n' +
      historyBlock + '\n' +
      '【本轮用户输入】\n' + userText + '\n\n' +
      (assistantText ? ('【本轮助手回复摘要】\n' + assistantText + '\n\n') : '') +
      '请只输出合法 JSON 对象（不要任何 Markdown 说明或多余文本）：\n' +
      '{"intent":"save","shouldSave":true,"aboutUser":true,"isDurable":true,"factType":"direct_fact","confidence":0.92,"clarificationQuestion":"","memories":[{"intent":"save","shouldSave":true,"content":"用户正在开发项目：知屿","rawExpression":"我正在开发知屿","category":"项目","factType":"project","temporalState":"current","status":"active","factSource":"user_statement","relation":"new","targetId":"","targetSubject":"知屿","confidence":0.92,"userConfirmed":true,"importance":4,"scope":"user"}]}'
    );
  }

  function stripThinkTags(raw) {
    var s = String(raw || '').trim();
    s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
    if (/<think>/i.test(s)) {
      var closeIdx = s.toLowerCase().indexOf('</think>');
      if (closeIdx !== -1) s = s.slice(closeIdx + 8);
      else s = s.replace(/<think>[\s\S]*$/gi, '');
    }
    return s.trim();
  }

  function extractBalancedJson(src) {
    var text = stripThinkTags(src);
    if (!text) return '';
    var fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced) text = fenced[1].trim();

    var firstBrace = text.indexOf('{');
    var firstBracket = text.indexOf('[');
    var startIdx = -1;
    var openChar = '';
    var closeChar = '';

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      openChar = '{';
      closeChar = '}';
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      openChar = '[';
      closeChar = ']';
    } else {
      return text;
    }

    var depth = 0;
    var inStr = false;
    var escaped = false;
    for (var i = startIdx; i < text.length; i++) {
      var ch = text.charAt(i);
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && inStr) {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (ch === openChar) depth++;
      else if (ch === closeChar) {
        depth--;
        if (depth === 0) return text.slice(startIdx, i + 1);
      }
    }
    return text.slice(startIdx);
  }

  function repairAndParseJson(slice) {
    if (!slice) return null;
    try {
      return JSON.parse(slice);
    } catch (_) {}

    try {
      var repaired = String(slice)
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/[\u0000-\u0019]+/g, ' ');
      return JSON.parse(repaired);
    } catch (_2) {}

    // 尝试将单引号键/值修复为双引号
    try {
      var singleRepaired = String(slice)
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/([{,]\s*)'([^']+?)'\s*:/g, '$1"$2":')
        .replace(/:\s*'([^']*?)'(\s*[,}\]])/g, ': "$1"$2');
      return JSON.parse(singleRepaired);
    } catch (_3) {
      return null;
    }
  }

  function parseSemanticJsonObject(rawText) {
    var slice = extractBalancedJson(rawText);
    var obj = repairAndParseJson(slice);
    if (obj) return obj;

    var cleaned = stripThinkTags(rawText);
    var idx = cleaned.lastIndexOf('{');
    while (idx > 0) {
      var cand = extractBalancedJson(cleaned.slice(idx));
      var parsed = repairAndParseJson(cand);
      if (parsed && typeof parsed === 'object') return parsed;
      idx = cleaned.lastIndexOf('{', idx - 1);
    }
    return null;
  }

  function normalizeParsedSemanticItem(rawItem, topLevel, fallbackRawText) {
    if (!rawItem || typeof rawItem !== 'object') return null;
    var top = topLevel && typeof topLevel === 'object' ? topLevel : {};
    var intent = String(rawItem.intent || rawItem.action || top.intent || 'save').trim().toLowerCase();
    if (intent === 'add') intent = 'save';
    var content = String(rawItem.content || '').trim();
    var tState = normalizeTemporalState(rawItem.temporalState, rawItem.status, content);
    var status = normalizeMemoryStatus(rawItem.status, tState);
    if (intent === 'mark_historical' && status === 'active') {
      tState = 'past';
      status = 'historical';
    }
    var conf = normalizeConfidence(
      rawItem.confidence !== undefined ? rawItem.confidence : top.confidence,
      0.85
    );
    var category = rawItem.category || inferCategory(content);
    var sig = extractSemanticSignature(content, category);

    return {
      intent: intent,
      action: rawItem.action || (intent === 'update' || intent === 'mark_historical' ? 'update' : (intent === 'delete' ? 'delete' : 'add')),
      shouldSave: rawItem.shouldSave !== undefined ? rawItem.shouldSave : top.shouldSave,
      aboutUser: rawItem.aboutUser !== undefined ? rawItem.aboutUser : top.aboutUser,
      isDurable: rawItem.isDurable !== undefined ? rawItem.isDurable : top.isDurable,
      factType: String(rawItem.factType || top.factType || inferFactType(category, tState, status)).trim().toLowerCase(),
      factSource: String(rawItem.factSource || 'user_statement').trim() || 'user_statement',
      temporalState: tState,
      status: status,
      relation: String(rawItem.relation || (intent === 'update' ? (status !== 'active' ? 'status_changed' : 'updated') : 'new')).trim(),
      targetId: String(rawItem.targetId || '').trim(),
      targetSubject: String(rawItem.targetSubject || sig.entity || '').trim(),
      confidence: conf,
      content: content,
      category: category,
      importance: rawItem.importance,
      scope: rawItem.scope || 'user',
      rawExpression: String(rawItem.rawExpression || fallbackRawText || '').trim().slice(0, 260),
      mentionedAt: Number(rawItem.mentionedAt) || Date.now(),
      userConfirmed: rawItem.userConfirmed === true,
      supersedesId: String(rawItem.supersedesId || '').trim(),
      clarificationQuestion: String(rawItem.clarificationQuestion || top.clarificationQuestion || '').trim(),
      semanticKey: sig.semanticKey
    };
  }

  function parseSemanticResponse(rawText, fallbackRawText) {
    var parsed = parseSemanticJsonObject(rawText);
    if (!parsed) {
      return { intent: 'none', items: [], clarificationQuestion: '', parseError: true };
    }

    if (Array.isArray(parsed)) {
      var arrItems = parsed.map(function(it) { return normalizeParsedSemanticItem(it, {}, fallbackRawText); }).filter(Boolean);
      return { intent: arrItems.length ? 'save' : 'none', items: arrItems, clarificationQuestion: '', parseError: false };
    }
    if (typeof parsed !== 'object') {
      return { intent: 'none', items: [], clarificationQuestion: '', parseError: true };
    }

    if (!parsed.memories && parsed.result && typeof parsed.result === 'object') parsed = parsed.result;
    else if (!parsed.memories && parsed.data && typeof parsed.data === 'object') parsed = parsed.data;
    else if (!parsed.memories && parsed.memory && typeof parsed.memory === 'object') parsed = parsed.memory;

    var topIntent = String(parsed.intent || parsed.action || '').trim().toLowerCase();
    var clarMsg = String(parsed.clarificationQuestion || parsed.clarify || '').trim();
    var rawItems = [];

    if (Array.isArray(parsed.memories)) {
      rawItems = parsed.memories.slice();
    } else if (Array.isArray(parsed.facts)) {
      rawItems = parsed.facts.slice();
    } else if (
      topIntent === 'save' ||
      topIntent === 'update' ||
      topIntent === 'delete' ||
      topIntent === 'add' ||
      topIntent === 'mark_historical' ||
      parsed.shouldSave === true ||
      typeof parsed.content === 'string'
    ) {
      rawItems = [parsed];
    }

    var normItems = rawItems
      .map(function(it) { return normalizeParsedSemanticItem(it, parsed, fallbackRawText); })
      .filter(Boolean);

    if (!topIntent && normItems.length > 0) {
      topIntent = String(normItems[0].intent || (parsed.shouldSave === false ? 'none' : 'save')).toLowerCase();
    }
    if (topIntent === 'add') topIntent = 'save';

    return {
      intent: topIntent || 'none',
      items: normItems,
      clarificationQuestion: clarMsg,
      confidence: normalizeConfidence(parsed.confidence, null),
      shouldSave: parsed.shouldSave,
      aboutUser: parsed.aboutUser,
      isDurable: parsed.isDurable,
      factType: String(parsed.factType || '').trim().toLowerCase(),
      parseError: false
    };
  }

  function evaluateCredibilityGate(item, decision, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var isExplicit = !!opts.isExplicit;
    var minConf = isExplicit ? 0.55 : 0.65;
    var factType = String((item && item.factType) || (decision && decision.factType) || '').trim().toLowerCase();
    var factSource = String((item && item.factSource) || '').trim().toLowerCase();

    if (factSource === 'model_speculation' || factSource === 'model_inference') {
      return { passed: false, reason: '模型推测不得直接写入长期记忆' };
    }

    if (!isExplicit) {
      if ((item && item.aboutUser === false) || (decision && decision.aboutUser === false)) {
        return { passed: false, reason: '非用户本人直接事实' };
      }
      if ((item && item.isDurable === false) || (decision && decision.isDurable === false)) {
        return { passed: false, reason: '临时信息或不具持续性' };
      }
      if (REJECTED_FACT_TYPES.indexOf(factType) !== -1) {
        return { passed: false, reason: '事实类型被可信度门槛拦截(' + factType + ')' };
      }
    }

    var conf = normalizeConfidence(
      item && item.confidence !== undefined ? item.confidence : (decision ? decision.confidence : null),
      0.85
    );
    if (Number.isFinite(conf) && conf < minConf) {
      return { passed: false, reason: '置信度低于确定性长期记忆阈值(' + conf + ' < ' + minConf + ')' };
    }

    return { passed: true, confidence: conf, reason: '' };
  }

  global.AiWorkspaceSemantic = {
    TEMPORAL_STATES: TEMPORAL_STATES,
    MEMORY_STATUSES: MEMORY_STATUSES,
    REJECTED_FACT_TYPES: REJECTED_FACT_TYPES,
    normalizeTextCompact: normalizeTextCompact,
    canonicalizeSemanticText: canonicalizeSemanticText,
    detectPolarity: detectPolarity,
    detectDegree: detectDegree,
    extractSemanticConcepts: extractSemanticConcepts,
    extractSemanticSignature: extractSemanticSignature,
    computeSemanticEquivalence: computeSemanticEquivalence,
    normalizeTemporalState: normalizeTemporalState,
    normalizeMemoryStatus: normalizeMemoryStatus,
    normalizeConfidence: normalizeConfidence,
    isGreetingOrFiller: isGreetingOrFiller,
    hasSelfFactCue: hasSelfFactCue,
    isJokeOrSarcasm: isJokeOrSarcasm,
    isConditionalOrHypothesis: isConditionalOrHypothesis,
    isThirdPartyOrQuote: isThirdPartyOrQuote,
    isClauseQuestion: isClauseQuestion,
    classifyClausePragmatics: classifyClausePragmatics,
    hasVagueReference: hasVagueReference,
    detectReferenceTypeHint: detectReferenceTypeHint,
    detectReferenceActionHint: detectReferenceActionHint,
    resolveCoreference: resolveCoreference,
    extractAtomicFacts: extractAtomicFacts,
    convertFirstPersonToThirdPerson: convertFirstPersonToThirdPerson,
    inferCategory: inferCategory,
    inferFactType: inferFactType,
    buildSemanticAnalysisPrompt: buildSemanticAnalysisPrompt,
    parseSemanticJsonObject: parseSemanticJsonObject,
    parseSemanticResponse: parseSemanticResponse,
    evaluateCredibilityGate: evaluateCredibilityGate
  };
})(typeof window !== 'undefined' ? window : globalThis);
