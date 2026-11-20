// ai-workspace-memory.js — 知屿（AI 工作空间）第五阶段全自动三层记忆引擎（修复与优化版）
// 1) 短期记忆：近期原始消息 + 策略/高级参数驱动的阶段性摘要
// 2) 跨窗口记忆：独立用户级长期记忆 + 可独立开关的跨窗口历史参考（支持同义概念扩展与轻量语义召回）
// 3) 长期记忆：
//    - 方式 A：明确记忆指令即时解析与持久落库（不等待流式回答结束，尊重长期记忆开关，绝不伪造成功提示）
//    - 方式 B：普通聊天宽松自然语言自动识别、去重、同类偏好冲突更新、秘密拦截与墓碑防复活
// 4) 持久化后台任务队列：完整状态机（waiting/running/saved/skipped/retry_waiting/failed）、真实写入追踪与重试
(function(global) {
  'use strict';

  var DEFAULT_RECENT_RAW = 6;
  var DEFAULT_TRIGGER_CHARS = 3200;
  var DEFAULT_MAX_RECALL = 5;
  var DEFAULT_MAX_MEM_LENGTH = 260;

  var STOP_CHARS = new Set([
    '的', '了', '吗', '呢', '吧', '啊', '呀', '哦', '哇', '嗯',
    '在', '是', '有', '和', '与', '或', '及', '对', '把', '被', '给', '让',
    '我', '你', '他', '她', '它', '们', '这', '那', '个', '些', '每',
    '什', '么', '怎', '样', '为', '谁', '哪', '里', '几', '多', '少',
    '请', '问', '帮', '助', '一', '下', '可', '以', '能', '否', '会',
    '想', '要', '去', '来', '做', '用', '写', '说', '看', '听', '找',
    '就', '都', '也', '还', '很', '挺', '太', '更', '最', '只', '不', '没'
  ]);

  var STOP_WORDS_EN = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as',
    'and', 'or', 'but', 'if', 'then', 'so', 'do', 'does', 'did',
    'can', 'could', 'will', 'would', 'should', 'may', 'might',
    'i', 'me', 'my', 'you', 'your', 'we', 'our', 'it', 'its', 'this', 'that',
    'what', 'which', 'who', 'how', 'when', 'where', 'why', 'please', 'help'
  ]);

  var GENERIC_BIGRAMS = new Set([
    '推荐', '建议', '需要', '注意', '时候', '平时', '经常', '通常', '一般',
    '可以', '应该', '问题', '方式', '方法', '内容', '使用', '进行', '帮助',
    '用户', '喜欢', '习惯', '比较', '非常', '还是', '已经', '以后', '之后',
    '什么', '最近', '当前', '现在', '一款', '一个', '一种', '东西'
  ]);

  var CONCEPT_CLUSTERS = [
    {
      name: 'concept_software_project',
      terms: ['软件', '应用', 'app', '工具', '程序', '产品', '项目', '系统', '平台', '网站', '网页', '开发', '研发', '制作', '编写', '搭建', '正在做', '在做', 'ai', '助手', '工作空间']
    },
    {
      name: 'concept_coffee_drink',
      terms: ['咖啡', '美式', '冰美式', '热美式', '拿铁', '热拿铁', '冰拿铁', '卡布奇诺', '摩卡', '浓缩', '奶茶', '绿茶', '红茶', '乌龙茶', '饮品', '饮料', '喝什么', '爱喝', '常喝', '改喝']
    },
    {
      name: 'concept_fruit_food',
      terms: ['水果', '草莓', '芒果', '苹果', '香蕉', '葡萄', '西瓜', '橙子', '橘子', '桃子', '樱桃', '蓝莓', '榴莲', '吃饭', '美食', '菜谱', '食谱', '忌口', '过敏', '香菜', '辣', '素食', '早餐', '午餐', '晚餐', '外卖', '餐厅', '爱吃', '不吃', '改吃']
    },
    {
      name: 'concept_coding_tech',
      terms: ['代码', '编程', '前端', '后端', '全栈', 'javascript', 'typescript', 'react', 'vue', 'python', 'node', 'css', 'html', 'sql', 'git', '接口', '数据库', '架构', '部署']
    },
    {
      name: 'concept_schedule_travel',
      terms: ['计划', '规划', '安排', '日程', '出差', '旅行', '旅游', '航班', '酒店', '周末', '下周', '下个月', '锻炼', '运动', '健身', '作息']
    },
    {
      name: 'concept_identity',
      terms: ['叫我', '名字', '称呼', '姓名', '职业', '工作', '岗位', '住在', '城市', '来自']
    },
    {
      name: 'concept_learning_study',
      terms: ['学习', '在学', '学什么', '开始学', '进修', '备考', '考研', '考证', '课程', '教材', '日语', '英语', '韩语', '法语', '德语', '西班牙语', '读书', '阅读', '练习', '钢琴', '吉他', '画画', '技能']
    },
    {
      name: 'concept_reply_style',
      terms: ['排版', '格式', '风格', '语气', '简短', '详细', '清单', '列表', '先给结论', '中文', '英文']
    }
  ];

  var MUTUAL_SLOTS = [
    {
      name: 'coffee_drink',
      category: '偏好',
      cues: ['美式', '冰美式', '热美式', '拿铁', '热拿铁', '冰拿铁', '卡布奇诺', '摩卡', '咖啡', '意式浓缩', '生椰拿铁']
    },
    {
      name: 'tea_drink',
      category: '偏好',
      cues: ['奶茶', '乌龙茶', '绿茶', '红茶', '花茶', '果茶', '柠檬茶']
    },
    {
      name: 'user_location',
      category: '身份信息',
      cues: ['住在', '居住在', '定居', '搬到', '现居']
    },
    {
      name: 'user_name',
      category: '身份信息',
      cues: ['名字', '叫我', '称呼为', '称为']
    },
    {
      name: 'reply_style',
      category: '偏好',
      cues: ['简洁一点的回答', '详尽一点的回答', '简短回答', '详细回答', '回答风格', '回复风格', '简洁的回答', '详细的回答', '言简意赅']
    }
  ];

  var _queueRunning = false;
  var _queueRerunRequested = false;
  var _retryTimer = null;

  function S() {
    return global.AiWorkspaceStorage;
  }

  function AI() {
    return global.AiWorkspaceAI;
  }

  function resolveMemoryParams(settings) {
    var store = S();
    var sanitized = (store && typeof store.sanitizeMemorySettings === 'function')
      ? store.sanitizeMemorySettings(settings)
      : (settings || {});
    return {
      shortTermContext: sanitized.shortTermContext !== false,
      crossChatMemory: sanitized.crossChatMemory !== false,
      useMemory: sanitized.useMemory !== false,
      autoMemory: sanitized.autoMemory !== false,
      referenceHistoryChats: sanitized.referenceHistoryChats !== false,
      strategy: sanitized.strategy || 'natural',
      summaryTriggerChars: Number(sanitized.summaryTriggerChars) || DEFAULT_TRIGGER_CHARS,
      recentRawMessagesLimit: Number(sanitized.recentRawMessagesLimit) || DEFAULT_RECENT_RAW,
      maxMemoryRecallCount: Number(sanitized.maxMemoryRecallCount) || DEFAULT_MAX_RECALL,
      maxSingleMemoryLength: Number(sanitized.maxSingleMemoryLength) || DEFAULT_MAX_MEM_LENGTH
    };
  }

  function sanitizeErrorForLog(rawErr) {
    var msg = String((rawErr && rawErr.message) || rawErr || '任务执行失败').trim();
    return msg
      .replace(/\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{8,}\b/gi, 'sk-***')
      .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi, 'Bearer ***')
      .replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, 'AIza***')
      .slice(0, 220);
  }

  // ===== 1. 敏感信息与秘密守卫（绝不保存密码、API Key、验证码、私钥等） =====
  function containsSensitiveSecret(text) {
    var src = String(text || '');
    if (!src.trim()) return false;

    var keyPatterns = [
      /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{12,}\b/i,
      /\bAIza[0-9A-Za-z_-]{16,}\b/,
      /\bgh[pousr]_[0-9A-Za-z]{16,}\b/,
      /\bgithub_pat_[0-9A-Za-z_]{16,}\b/,
      /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/,
      /\bAKIA[0-9A-Z]{16}\b/,
      /\bBearer\s+[A-Za-z0-9._-]{12,}\b/i,
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/,
      /-----BEGIN\s+[A-Z0-9 ]*PRIVATE\s+KEY-----/i
    ];
    for (var i = 0; i < keyPatterns.length; i++) {
      if (keyPatterns[i].test(src)) return true;
    }

    var secretPhrasePatterns = [
      /(?:密码|口令|交易密码|支付密码|登录密码|开机密码|wifi密码|pin\s*码|验证码|校验码|动态码|授权码|安全码|私钥|密钥|秘钥|api\s*key|secret\s*key|access\s*token|password|passcode|otp)\s*(?:是|为|[:：=]|设成|设为|改为)\s*\S+/i,
      /(?:记住|保存|记下|写下)[^。\n]{0,16}(?:密码|口令|验证码|api\s*key|私钥|密钥|秘钥|token|passcode)/i,
      /(?:验证码|动态码|校验码|otp)[^\d\n]{0,8}\d{4,8}/i,
      /\b(?:pwd|passwd|pass|secret|apikey|api_key)\s*[:=]\s*['"]?\S{4,}/i
    ];
    for (var j = 0; j < secretPhrasePatterns.length; j++) {
      if (secretPhrasePatterns[j].test(src)) return true;
    }

    return false;
  }

  function containsHighRiskPrivacy(text) {
    var src = String(text || '');
    if (!src.trim()) return false;

    var privacyPatterns = [
      // 中国居民身份证号（18位或15位）
      /(?:身份证(?:号|号码)?|证件号)[^\dA-Za-z]{0,8}[1-9]\d{5}(?:19|20)?\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]?/,
      /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/,
      // 银行卡号 / 信用卡号 / 卡密 / CVV
      /(?:银行卡(?:号|密码)?|信用卡(?:号|卡号)?|借记卡|储蓄卡|卡号|cvv|cvc)\s*(?:是|为|[:：=]|尾号)?\s*\d{12,19}/i,
      // 护照 / 社保号 / 医保卡号
      /(?:护照号|社保号|医保卡号|驾驶证号)\s*(?:是|为|[:：=])?\s*[A-Za-z0-9]{6,}/i,
      // 精确家庭住址（含门牌/单元/室）+ 电话隐私
      /(?:家庭住址|详细住址|现住址|身份证地址)\s*(?:是|为|在|[:：=])\s*\S{6,}/,
      /(?:手机号|电话号码|联系方式)\s*(?:是|为|[:：=])\s*1[3-9]\d{9}/,
      // 病历/个人高度敏感医疗隐私
      /(?:病历号|住院号|体检报告|诊断结果|确诊患有|病例隐私)\s*(?:是|为|[:：=]|显示)?\s*\S{2,}/
    ];
    for (var i = 0; i < privacyPatterns.length; i++) {
      if (privacyPatterns[i].test(src)) return true;
    }
    return false;
  }

  // ===== 2. 文本规范化、分词与相似度计算 =====
  function normalizeMemoryText(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/^[-*•\d.)\s]+/, '')
      .replace(/[\s，。！？、；：“”"'‘’（）()【】\[\],.!?;:~`「」]+/g, '')
      .trim();
  }

  function extractSearchFeatures(text) {
    var src = String(text || '').toLowerCase();
    var terms = new Set();
    var enTerms = new Set();
    var zhChars = new Set();
    var bigrams = new Set();

    var enMatches = src.match(/[a-z0-9_+#.-]{2,}/g) || [];
    for (var i = 0; i < enMatches.length; i++) {
      var w = enMatches[i];
      if (!STOP_WORDS_EN.has(w)) {
        terms.add(w);
        enTerms.add(w);
      }
    }

    var zhRuns = src.match(/[\u4e00-\u9fa5]+/g) || [];
    for (var j = 0; j < zhRuns.length; j++) {
      var run = zhRuns[j];
      var filteredChars = [];
      for (var k = 0; k < run.length; k++) {
        var ch = run.charAt(k);
        if (!STOP_CHARS.has(ch)) {
          filteredChars.push(ch);
          terms.add(ch);
          zhChars.add(ch);
        }
      }
      var cleanRun = filteredChars.join('');
      if (cleanRun.length >= 2) {
        for (var g = 0; g <= cleanRun.length - 2; g++) {
          bigrams.add(cleanRun.slice(g, g + 2));
        }
      }
      if (run.length >= 2) {
        for (var rg = 0; rg <= run.length - 2; rg++) {
          var bg = run.slice(rg, rg + 2);
          if (!STOP_CHARS.has(bg.charAt(0)) && !STOP_CHARS.has(bg.charAt(1))) {
            bigrams.add(bg);
          }
        }
      }
    }

    var concepts = new Set();
    for (var c = 0; c < CONCEPT_CLUSTERS.length; c++) {
      var cluster = CONCEPT_CLUSTERS[c];
      for (var t = 0; t < cluster.terms.length; t++) {
        if (src.indexOf(cluster.terms[t]) !== -1) {
          concepts.add(cluster.name);
          break;
        }
      }
    }

    return {
      terms: terms,
      enTerms: enTerms,
      zhChars: zhChars,
      bigrams: bigrams,
      concepts: concepts
    };
  }

  function computeTextSimilarity(textA, textB) {
    var normA = normalizeMemoryText(textA);
    var normB = normalizeMemoryText(textB);
    if (!normA || !normB) return 0;
    if (normA === normB) return 1;

    if ((normA.indexOf(normB) !== -1 || normB.indexOf(normA) !== -1) &&
        Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length) >= 0.72) {
      return 0.85;
    }

    var fa = extractSearchFeatures(textA);
    var fb = extractSearchFeatures(textB);

    var setA = fa.bigrams.size > 0 ? fa.bigrams : fa.terms;
    var setB = fb.bigrams.size > 0 ? fb.bigrams : fb.terms;
    if (setA.size === 0 || setB.size === 0) return 0;

    var inter = 0;
    setA.forEach(function(item) {
      if (setB.has(item)) inter++;
    });
    var union = setA.size + setB.size - inter;
    return union > 0 ? (inter / union) : 0;
  }

  // ===== 3. 作用域、权限与墓碑过滤 =====
  function filterAccessibleMemories(memories, context) {
    var ctx = context && typeof context === 'object' ? context : {};
    var userId = String(ctx.userId || 'local_user').trim() || 'local_user';
    var chatId = String(ctx.chatId || '').trim();
    var projectId = String(ctx.projectId || '').trim();
    var allowCrossChat = ctx.allowCrossChat !== false;

    return (Array.isArray(memories) ? memories : []).filter(function(mem) {
      if (!mem || !mem.content) return false;
      var memUserId = String(mem.userId || 'local_user').trim() || 'local_user';
      if (memUserId !== userId) return false;

      var scope = String(mem.scope || 'user').toLowerCase();
      if (scope === 'chat') {
        return !!(chatId && mem.sourceChatId && mem.sourceChatId === chatId);
      }
      if (scope === 'project') {
        if (!projectId || !mem.projectId || mem.projectId !== projectId) return false;
        if (!allowCrossChat && mem.sourceChatId && mem.sourceChatId !== chatId) return false;
        return true;
      }
      if (scope === 'user') {
        if (!allowCrossChat && mem.sourceChatId && mem.sourceChatId !== chatId) {
          return false;
        }
        return true;
      }
      return false;
    });
  }

  function findBlockingDeletedSignature(text, deletedSigs) {
    if (!text || !Array.isArray(deletedSigs) || !deletedSigs.length) return null;
    var norm = normalizeMemoryText(text);
    if (!norm) return null;

    for (var i = 0; i < deletedSigs.length; i++) {
      var sig = deletedSigs[i];
      if (!sig || !sig.norm) continue;
      if (sig.norm === norm) return sig;
      if (sig.content && computeTextSimilarity(text, sig.content) >= 0.65) return sig;

      if (sig.content) {
        var sigFeat = extractSearchFeatures(sig.content);
        var textFeat = extractSearchFeatures(text);
        var coreBigrams = [];
        sigFeat.bigrams.forEach(function(bg) {
          if (!GENERIC_BIGRAMS.has(bg) && bg !== '用户') coreBigrams.push(bg);
        });
        if (coreBigrams.length >= 2) {
          var matched = 0;
          for (var j = 0; j < coreBigrams.length; j++) {
            if (textFeat.bigrams.has(coreBigrams[j])) matched++;
          }
          if (matched / coreBigrams.length >= 0.65) {
            return sig;
          }
        }
      }
    }
    return null;
  }

  function isTextBlockedByDeletedSigs(text, deletedSigs) {
    return !!findBlockingDeletedSignature(text, deletedSigs);
  }

  // ===== 4. 相关性评分与跨窗口检索引擎 =====
  function isMetaMemoryQuery(query) {
    var q = String(query || '').toLowerCase();
    return /(?:你记得|还记得|我之前|之前说过|上次说|关于我|了解我|我的偏好|我的喜好|我的习惯|我的计划|我的项目|我的决定|我的忌口|我的目标|适合我|按我的|根据我的|帮我回忆|我最近在|我正在做|我在开发|我在学|在学什么|我平时|我喜欢|我最喜欢|我爱喝|我爱吃|我用什么|我是做什么的)/.test(q);
  }

  function looksPersonalOrContextualQuery(query) {
    var q = String(query || '').toLowerCase();
    if (isMetaMemoryQuery(q)) return true;
    return /(?:我|我的|帮我推荐|给我推荐|适合|之前|最近|上次|偏好|习惯|计划|项目|决定|记得)/.test(q);
  }

  function scoreTextRelevance(text, category, queryFeatures, metaRecall, rawQueryLower, extraScope) {
    var memFeatures = extractSearchFeatures(String(text || '') + ' ' + String(category || ''));

    var specificBigramHits = 0;
    var genericBigramHits = 0;
    queryFeatures.bigrams.forEach(function(bg) {
      if (memFeatures.bigrams.has(bg)) {
        if (GENERIC_BIGRAMS.has(bg)) genericBigramHits++;
        else specificBigramHits++;
      }
    });

    var enTermHits = 0;
    queryFeatures.enTerms.forEach(function(t) {
      if (memFeatures.enTerms.has(t)) enTermHits++;
    });

    var zhCharHits = 0;
    queryFeatures.zhChars.forEach(function(t) {
      if (memFeatures.zhChars.has(t)) zhCharHits++;
    });

    var conceptHits = 0;
    queryFeatures.concepts.forEach(function(cName) {
      if (memFeatures.concepts.has(cName)) conceptHits++;
    });

    var score = 0;
    score += specificBigramHits * 3.2;
    score += genericBigramHits * 0.35;
    score += enTermHits * 1.9;
    score += zhCharHits * 0.3;
    score += conceptHits * 2.1;

    if (metaRecall) {
      var cat = String(category || '');
      var catBoosted = false;
      if (/偏好|喜欢|爱喝|爱吃|忌口|口味|水果/.test(rawQueryLower) && cat.indexOf('偏好') !== -1) {
        score += 3.2;
        catBoosted = true;
      }
      if (/习惯|作息|平时/.test(rawQueryLower) && cat.indexOf('习惯') !== -1) {
        score += 3.2;
        catBoosted = true;
      }
      if (/计划|目标|打算|出差|旅游|学什么|在学|学习|语言|课程|备考|考证/.test(rawQueryLower) && cat.indexOf('计划') !== -1) {
        score += 3.2;
        catBoosted = true;
      }
      if (/项目|开发|制作|软件|应用|系统/.test(rawQueryLower) && cat.indexOf('项目') !== -1) {
        score += 3.5;
        catBoosted = true;
      }
      if (/决定/.test(rawQueryLower) && cat.indexOf('决定') !== -1) {
        score += 3.2;
        catBoosted = true;
      }
      if (!catBoosted && specificBigramHits === 0 && enTermHits === 0 && conceptHits === 0 && extraScope === 'user') {
        score += 2.1;
      }
    }

    return {
      score: score,
      hasLexicalOrConceptMatch: (specificBigramHits > 0 || enTermHits > 0 || conceptHits > 0)
    };
  }

  function sanitizeSnippetByDeletedSigs(rawText, deletedSigs) {
    var src = String(rawText || '').trim();
    if (!src) return '';
    if (!Array.isArray(deletedSigs) || !deletedSigs.length) return src;
    var clauses = src.split(/(?<=[。！？\n；])/);
    var kept = [];
    for (var i = 0; i < clauses.length; i++) {
      var c = clauses[i].trim();
      if (!c) continue;
      if (!isTextBlockedByDeletedSigs(c, deletedSigs)) {
        kept.push(c);
      }
    }
    return kept.join('');
  }

  async function collectCrossChatCandidates(store, opts, deletedSigs) {
    if (!store || typeof store.listChats !== 'function') return [];
    var currentChatId = String(opts.chatId || '').trim();
    var currentProjectId = String(opts.projectId || '').trim();
    var allChats = await store.listChats();
    var candidates = [];

    for (var i = 0; i < allChats.length && i < 20; i++) {
      var chat = allChats[i];
      if (!chat || !chat.id || chat.id === currentChatId) continue;
      if (chat.projectId && currentProjectId && chat.projectId !== currentProjectId) continue;
      if (chat.projectId && !currentProjectId) continue;

      if (chat.summary) {
        var cleanSummary = sanitizeSnippetByDeletedSigs(chat.summary, deletedSigs);
        if (cleanSummary) {
          candidates.push({
            id: 'csum:' + chat.id,
            kind: 'summary',
            chatId: chat.id,
            chatTitle: chat.title || '历史对话',
            content: cleanSummary.slice(0, 320),
            updatedAt: chat.summaryUpdatedAt || chat.updatedAt || 0
          });
        }
      }

      var msgs = Array.isArray(chat.messages) ? chat.messages : [];
      var userSnippets = [];
      for (var m = msgs.length - 1; m >= 0 && userSnippets.length < 3; m--) {
        var msg = msgs[m];
        if (!msg || msg.role !== 'user') continue;
        var text = String(msg.content || '').trim();
        if (text.length < 4 || containsSensitiveSecret(text)) continue;
        if (/[？?]$/.test(text) && !/[，。；！]/.test(text) && !/(?:我|我的).{0,8}(?:喜欢|正在|开发|习惯|打算|计划|决定|改|叫|住)/.test(text)) {
          continue;
        }
        var cleanClause = sanitizeSnippetByDeletedSigs(text, deletedSigs);
        if (cleanClause) {
          userSnippets.unshift(cleanClause.slice(0, 180));
        }
      }
      if (userSnippets.length > 0) {
        candidates.push({
          id: 'cmsg:' + chat.id,
          kind: 'recent',
          chatId: chat.id,
          chatTitle: chat.title || '历史对话',
          content: userSnippets.join('；'),
          updatedAt: chat.updatedAt || 0
        });
      }
    }
    return candidates;
  }

  async function trySemanticRecallWithModel(query, memoryPool, crossPool, apiConfig, maxPick) {
    var ai = AI();
    if (!ai || typeof ai.requestChatCompletion !== 'function') return { memIds: [], crossIds: [] };
    if (!apiConfig || !apiConfig.url || !apiConfig.key || !apiConfig.model) return { memIds: [], crossIds: [] };

    var items = [];
    memoryPool.slice(0, 14).forEach(function(m) {
      items.push({ id: m.id, type: 'mem', text: '[' + (m.category || '记忆') + '] ' + m.content.slice(0, 140) });
    });
    crossPool.slice(0, 8).forEach(function(c) {
      items.push({ id: c.id, type: 'cross', text: '[对话:' + c.chatTitle + '] ' + c.content.slice(0, 140) });
    });
    if (!items.length) return { memIds: [], crossIds: [] };

    try {
      var listText = items.map(function(it) { return it.id + ' => ' + it.text; }).join('\n');
      var res = await ai.requestChatCompletion({
        apiConfig: apiConfig,
        temperature: 0,
        maxTokens: 280,
        allowReasoningFallback: true,
        messages: [
          {
            role: 'system',
            content: '你是记忆相关性筛选器。从候选列表中挑出与用户当前提问真正相关的条目 ID。绝不挑选无关条目。只输出 JSON：{"ids":[]}'
          },
          {
            role: 'user',
            content: '当前问题：' + query.slice(0, 300) + '\n\n候选列表：\n' + listText + '\n\n请只返回最相关的条目 ID（最多 ' + (maxPick || 4) + ' 个），例如 {"ids":["mem_1"]}；如均不相关返回 {"ids":[]}。'
          }
        ]
      });
      var parsed = parseExtractorJsonObject(res && res.content);
      var ids = (parsed && Array.isArray(parsed.ids)) ? parsed.ids.map(String) : [];
      var memSet = new Set(memoryPool.map(function(m) { return m.id; }));
      var crossSet = new Set(crossPool.map(function(c) { return c.id; }));
      return {
        memIds: ids.filter(function(id) { return memSet.has(id); }),
        crossIds: ids.filter(function(id) { return crossSet.has(id); })
      };
    } catch (_) {
      return { memIds: [], crossIds: [] };
    }
  }

  // ===== 5. 短期记忆阶段性摘要（全自动，受策略与高级参数控制） =====
  function getHistoryCharLength(messages) {
    var total = 0;
    for (var i = 0; i < (Array.isArray(messages) ? messages.length : 0); i++) {
      total += String((messages[i] && messages[i].content) || '').length;
    }
    return total;
  }

  function needsShortTermSummary(chat, settings) {
    if (!chat || !Array.isArray(chat.messages)) return false;
    var params = resolveMemoryParams(settings);
    if (!params.shortTermContext) return false;

    var keepRecent = params.recentRawMessagesLimit;
    var triggerChars = params.summaryTriggerChars;
    var minMsgs = keepRecent + 4;
    var stepChars = Math.max(220, Math.round(triggerChars * 0.35));
    var stepMsgs = Math.max(2, Math.min(4, Math.floor(keepRecent / 2)));

    var msgs = chat.messages.filter(function(m) {
      return m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim();
    });
    if (msgs.length <= keepRecent) return false;

    var targetUpTo = msgs.length - keepRecent;
    var alreadyUpTo = Math.max(0, Number(chat.summaryUpToCount) || 0);
    if (targetUpTo <= alreadyUpTo) return false;

    var totalChars = getHistoryCharLength(msgs);
    if (msgs.length < minMsgs && totalChars < triggerChars) {
      return false;
    }

    var deltaMsgs = msgs.slice(alreadyUpTo, targetUpTo);
    var deltaChars = getHistoryCharLength(deltaMsgs);
    if (deltaMsgs.length >= stepMsgs || deltaChars >= stepChars) {
      return true;
    }
    return false;
  }

  function buildLocalFallbackSummary(prevSummary, deltaMessages) {
    var lines = [];
    if (prevSummary) lines.push(prevSummary);
    var userPoints = [];
    var assistantPoints = [];
    for (var i = 0; i < deltaMessages.length; i++) {
      var m = deltaMessages[i];
      var text = String(m.content || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (m.role === 'user') userPoints.push(text.slice(0, 90));
      else assistantPoints.push(text.slice(0, 90));
    }
    if (userPoints.length) {
      lines.push('【用户要求与关键事实】' + userPoints.slice(-4).join('；'));
    }
    if (assistantPoints.length) {
      lines.push('【阶段推进结论】' + assistantPoints.slice(-2).join('；'));
    }
    return lines.join('\n').slice(0, 900);
  }

  async function summarizeChatSegment(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var store = S();
    var ai = AI();
    if (!store || !opts.chatId) return null;

    var settings = opts.settings || await store.getMemorySettings();
    var params = resolveMemoryParams(settings);
    var keepRecent = params.recentRawMessagesLimit;

    var chat = await store.getChat(opts.chatId);
    if (!chat || !Array.isArray(chat.messages)) return null;

    var cleanMsgs = chat.messages.filter(function(m) {
      return m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim();
    });
    var targetUpTo = Math.max(0, cleanMsgs.length - keepRecent);
    var prevUpTo = Math.max(0, Number(chat.summaryUpToCount) || 0);
    if (targetUpTo <= prevUpTo) return null;

    var deltaMsgs = cleanMsgs.slice(prevUpTo, targetUpTo);
    if (!deltaMsgs.length) return null;

    var prevSummary = String(chat.summary || '').trim();
    var dialogueText = deltaMsgs.map(function(m) {
      var roleLabel = m.role === 'user' ? '用户' : '助手';
      var content = String(m.content || '').slice(0, 420);
      return roleLabel + '：' + (containsSensitiveSecret(content) ? '[已脱敏]' : content);
    }).join('\n');

    var nextSummary = '';
    if (ai && typeof ai.requestChatCompletion === 'function' && opts.apiConfig && opts.apiConfig.url && opts.apiConfig.key) {
      try {
        var res = await ai.requestChatCompletion({
          apiConfig: opts.apiConfig,
          temperature: 0.1,
          maxTokens: 600,
          messages: [
            {
              role: 'system',
              content: '你是对话短期工作记忆压缩器。请将已有摘要与新增对话轮次合并成简洁结构化的短期工作记忆，包含：1.当前任务 2.关键事实 3.用户要求 4.未完成事项。绝不包含密码或密钥，不超过 450 字。'
            },
            {
              role: 'user',
              content: (prevSummary ? ('【已有短期摘要】\n' + prevSummary + '\n\n') : '') +
                '【新增较早轮次对话】\n' + dialogueText + '\n\n请输出更新后的短期摘要：'
            }
          ]
        });
        nextSummary = String((res && res.content) || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      } catch (err) {
        if (!opts.allowLocalFallback) {
          throw err;
        }
      }
    }

    if (!nextSummary) {
      nextSummary = buildLocalFallbackSummary(prevSummary, deltaMsgs);
    }

    var updatedChat = await store.saveChat({
      id: chat.id,
      summary: nextSummary.slice(0, 900),
      summaryUpToCount: targetUpTo,
      summaryUpdatedAt: Date.now(),
      updatedAt: chat.updatedAt || Date.now()
    });
    return updatedChat;
  }

  // ===== 6. 统一三层记忆检索入口（供聊天主流程调用） =====
  async function retrieveRelevantMemories(options) {
    var ctx = await retrieveWorkspaceContext(options);
    return ctx.memories;
  }

  async function retrieveWorkspaceContext(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var store = S();
    var defaultParams = resolveMemoryParams({});
    var emptyResult = {
      memories: [],
      crossChatContexts: [],
      shortTermSummary: '',
      summaryUpToCount: 0,
      useShortTermHistory: true,
      maxRecentMessages: defaultParams.recentRawMessagesLimit,
      settings: defaultParams
    };
    if (!store) return emptyResult;

    var rawSettings = await store.getMemorySettings();
    var params = resolveMemoryParams(rawSettings);
    emptyResult.settings = params;

    var activeChat = opts.activeChat || null;
    var historyMessages = Array.isArray(opts.historyMessages) ? opts.historyMessages : [];
    var shortTermEnabled = params.shortTermContext !== false;

    if (!shortTermEnabled) {
      emptyResult.useShortTermHistory = false;
      emptyResult.shortTermSummary = '';
      emptyResult.summaryUpToCount = 0;
      emptyResult.maxRecentMessages = 0;
    } else {
      emptyResult.useShortTermHistory = true;
      emptyResult.shortTermSummary = activeChat ? String(activeChat.summary || '').trim() : '';
      emptyResult.summaryUpToCount = activeChat ? Math.max(0, Number(activeChat.summaryUpToCount) || 0) : 0;
      emptyResult.maxRecentMessages = params.recentRawMessagesLimit;
    }

    var query = String(opts.query || '').trim();
    if (!query) return emptyResult;

    var userId = String(opts.userId || 'local_user').trim() || 'local_user';
    var chatId = String(opts.chatId || (activeChat && activeChat.id) || '').trim();
    var projectId = String(opts.projectId || (activeChat && activeChat.projectId) || '').trim();
    var allowCrossChat = params.crossChatMemory !== false;
    var allowReferenceHistory = allowCrossChat && params.referenceHistoryChats !== false;

    var searchSource = query;
    var isShortFollowUp = query.length <= 8 || (query.length <= 16 && /(?:^|\s|，)(?:那|它|这|这个|那个|继续|顺便|还有|再|换一个|换个|另外|刚才|上面)|(?:呢|吗)[？?]?$/.test(query));
    if (isShortFollowUp && shortTermEnabled && historyMessages.length > 0) {
      for (var hi = historyMessages.length - 1; hi >= 0; hi--) {
        if (historyMessages[hi] && historyMessages[hi].role === 'user' && historyMessages[hi].content) {
          searchSource += ' ' + String(historyMessages[hi].content).slice(0, 80);
          break;
        }
      }
    }

    var queryFeatures = extractSearchFeatures(searchSource);
    var metaRecall = isMetaMemoryQuery(query);
    var rawQueryLower = query.toLowerCase();
    var minScore = metaRecall ? 1.8 : 2.1;

    var accessibleMemories = [];
    if (params.useMemory && typeof store.listMemories === 'function') {
      var allMemories = await store.listMemories();
      accessibleMemories = filterAccessibleMemories(allMemories, {
        userId: userId,
        chatId: chatId,
        projectId: projectId,
        allowCrossChat: allowCrossChat
      });
    }

    var asksHistoryOrCancelled = /(?:以前|曾经|原来|过去|历史|之前喜欢|取消|放弃|已取消|完成)/.test(rawQueryLower);
    var scoredMemories = [];
    for (var i = 0; i < accessibleMemories.length; i++) {
      var mem = accessibleMemories[i];
      var res = scoreTextRelevance(mem.content, mem.category, queryFeatures, metaRecall, rawQueryLower, mem.scope);
      if (res.score > 0) {
        res.score += ((Number(mem.importance) || 3) - 3) * 0.25;
        if (mem.scope === 'chat') res.score += 0.3;
        var memStatus = String(mem.status || 'active').toLowerCase();
        var memTemporal = String(mem.temporalState || 'current').toLowerCase();
        if (memStatus === 'cancelled' || memTemporal === 'cancelled') {
          res.score += asksHistoryOrCancelled ? 0.5 : -2.2;
        } else if (memStatus === 'historical' || memTemporal === 'past' || memStatus === 'completed' || memTemporal === 'completed') {
          res.score += asksHistoryOrCancelled ? 0.5 : -1.4;
        } else {
          res.score += 1.2;
        }
      }
      if (res.score >= minScore && (metaRecall || res.hasLexicalOrConceptMatch)) {
        scoredMemories.push({ memory: mem, score: res.score });
      }
    }

    scoredMemories.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (b.memory.updatedAt || 0) - (a.memory.updatedAt || 0);
    });

    var chosenMemories = [];
    var usedMemChars = 0;
    var maxResults = Math.max(1, Math.min(12, Number(opts.maxResults != null ? opts.maxResults : params.maxMemoryRecallCount) || 5));
    var maxChars = Math.max(240, Number(opts.maxChars) || (maxResults * Math.max(140, params.maxSingleMemoryLength)));
    for (var j = 0; j < scoredMemories.length && chosenMemories.length < maxResults; j++) {
      var item = scoredMemories[j].memory;
      var len = String(item.content || '').length + 12;
      if (chosenMemories.length > 0 && usedMemChars + len > maxChars) continue;
      chosenMemories.push(item);
      usedMemChars += len;
    }

    var deletedSigs = typeof store.listDeletedMemorySignatures === 'function'
      ? await store.listDeletedMemorySignatures()
      : [];

    var crossCandidates = [];
    var chosenCross = [];
    if (allowReferenceHistory) {
      crossCandidates = await collectCrossChatCandidates(store, {
        chatId: chatId,
        projectId: projectId
      }, deletedSigs);

      var scoredCross = [];
      for (var c = 0; c < crossCandidates.length; c++) {
        var cc = crossCandidates[c];
        var cRes = scoreTextRelevance(cc.content + ' ' + cc.chatTitle, '', queryFeatures, metaRecall, rawQueryLower, 'user');
        if (cRes.score >= minScore && (metaRecall || cRes.hasLexicalOrConceptMatch)) {
          scoredCross.push({ item: cc, score: cRes.score });
        }
      }
      scoredCross.sort(function(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return (b.item.updatedAt || 0) - (a.item.updatedAt || 0);
      });
      var maxCrossCount = params.strategy === 'token_saver' ? 2 : (params.strategy === 'recall_more' ? 4 : 3);
      var usedCrossChars = 0;
      for (var k = 0; k < scoredCross.length && chosenCross.length < maxCrossCount; k++) {
        var cItem = scoredCross[k].item;
        if (usedCrossChars + cItem.content.length > 720 && chosenCross.length > 0) continue;
        chosenCross.push(cItem);
        usedCrossChars += cItem.content.length;
      }
    }

    if (
      chosenMemories.length === 0 &&
      chosenCross.length === 0 &&
      looksPersonalOrContextualQuery(query) &&
      (accessibleMemories.length > 0 || crossCandidates.length > 0) &&
      opts.apiConfig
    ) {
      var semanticPicked = await trySemanticRecallWithModel(query, accessibleMemories, crossCandidates, opts.apiConfig, maxResults);
      if (semanticPicked.memIds.length) {
        semanticPicked.memIds.forEach(function(id) {
          var foundM = accessibleMemories.find(function(m) { return m.id === id; });
          if (foundM && chosenMemories.length < maxResults) chosenMemories.push(foundM);
        });
      }
      if (semanticPicked.crossIds.length && allowReferenceHistory) {
        semanticPicked.crossIds.forEach(function(id) {
          var foundC = crossCandidates.find(function(c) { return c.id === id; });
          if (foundC && chosenCross.length < 3) chosenCross.push(foundC);
        });
      }
    }

    emptyResult.memories = chosenMemories;
    emptyResult.crossChatContexts = chosenCross;
    return emptyResult;
  }

  // ===== 7. 智能语义记忆意图识别（轻量规则快速识别 + 模型语义判断兜底） =====
  var SAVE_CMD_PREFIX_RE = /^(?:好的|嗯+|对了对了|对了|那个|喂)?[\s，,。！!]*?(?:请|麻烦|麻烦你|请你|帮我|帮忙|替我|请帮我|能帮我|可以帮我)?\s*(?:一定要|务必|先)?\s*(?:记住|记忆一下|记一下|记下来|记着点?|记牢|记录一下|存进长期记忆|存入长期记忆|写进长期记忆|记入长期记忆|添加到长期记忆|存进记忆|存到记忆|加入记忆|写入记忆|别忘了|不要忘了|留个底|帮我记|替我记)\s*[：:，,、。\s]*/i;
  var SAVE_CMD_SUFFIX_RE = /[，,。\s]*(?:这个|这件事)?(?:以后|往后)?(?:请|麻烦|帮我|替我)?(?:记住|记忆一下|记一下|记下来|记着点?|记牢|记录一下|存进记忆|存到记忆|加入记忆|写入记忆|别忘了|不要忘了|留个底)[吧呀呢啊哦了]*\s*(?:好吗|好不好|行吗|可以吗|谢谢|感谢|拜托了|知道了吗)?[？?！!。.\s]*$/i;

  function detectMemoryIntentFast(userText) {
    var text = String(userText || '').trim();
    if (!text) return { matched: false, intent: 'none', via: 'none' };

    var deletePatterns = [
      /^(?:请|麻烦|麻烦你|请你|帮我|帮忙|替我|请帮我|能帮我)?\s*(?:彻底|全部|永远)?\s*(?:忘掉|忘记|遗忘|删掉|删除|清除|清理|抹掉|抹除|移除|取消|别再记|不要再记|不用再记|别记了|不用记了|算了别记)/,
      /(?:帮我|请|麻烦)?(?:忘掉|忘记|忘了吧|遗忘|删除记忆|删掉记忆|清除记忆|移除记忆|取消记忆|从记忆(?:里|中)?删(?:掉|除)|把.*记忆(?:删掉|删除|清空|清除|忘掉)|不要再记(?:住|得)?|别再记(?:住|得)?|别放记忆里|不要记住)/
    ];
    for (var d = 0; d < deletePatterns.length; d++) {
      if (deletePatterns[d].test(text)) {
        return { matched: true, intent: 'delete', via: 'rule' };
      }
    }

    var updatePatterns = [
      /^(?:请|麻烦|请你|帮我|帮忙)?\s*(?:修改记忆|更新记忆|改一下记忆|更新一下记忆|修正记忆|更正记忆)/,
      /(?:修改记忆|更新记忆|改一下记忆|更新一下记忆|把记忆(?:里|中)的.*(?:改成|改为|换成))/
    ];
    for (var u = 0; u < updatePatterns.length; u++) {
      if (updatePatterns[u].test(text)) {
        return { matched: true, intent: 'update', via: 'rule' };
      }
    }

    var savePatterns = [
      /^(?:好的|嗯+|对了|那个)?[\s，,。！!]*?(?:请|麻烦|麻烦你|请你|帮我|帮忙|替我|请帮我|能帮我|可以帮我)?\s*(?:一定要|务必|先)?\s*(?:记住|记忆一下|记一下|记下来|记着点?|记牢|记录一下|存进长期记忆|存入长期记忆|写进长期记忆|记入长期记忆|添加到长期记忆|存进记忆|存到记忆|加入记忆|写入记忆|别忘了|不要忘了|留个底|帮我记|替我记)/,
      /(?:帮我记住|请记住|麻烦记住|帮我记一下|请记一下|记忆一下|帮我记下来|帮我记着|替我记一下|以后记着|记着点|记入长期记忆|存入长期记忆|写进长期记忆|添加到长期记忆|存进记忆|存到记忆|这个以后记着|这件事别忘了|帮我留个底)/
    ];
    for (var s = 0; s < savePatterns.length; s++) {
      if (savePatterns[s].test(text)) {
        return { matched: true, intent: 'save', via: 'rule' };
      }
    }

    return { matched: false, intent: 'none', via: 'none' };
  }

  function detectExplicitMemoryCommand(userText) {
    var fast = detectMemoryIntentFast(userText);
    return { matched: fast.matched, intent: fast.intent, via: fast.via };
  }

  function detectUnsupportedMonitoringOrReminderRequest(text) {
    var src = String(text || '').trim();
    if (!src) return { needsCapabilityCheck: false, hasScheduledTaskSupport: false, capabilityNotice: '' };
    if (/(?:持续关注|长期关注|一直关注|帮我盯着|一直盯着|定期关注|自动追踪|自动监测|定期监测|定时提醒|定期提醒|每天提醒|每周提醒|有进展通知我|有更新通知我|到时候提醒我|后台监控)/.test(src)) {
      return {
        needsCapabilityCheck: true,
        hasScheduledTaskSupport: false,
        capabilityNotice: '能力边界说明：知屿当前尚未接入后台「定时任务 / 自动监测 / 主动提醒」功能（定时任务入口目前仅作占位展示）。系统只能将该内容存入长期记忆，供你后续主动追问或延续对话时参考，无法在后台自动追踪或定时提醒。请在回答中向用户如实说明此能力限制，切勿承诺会后台持续监测或定时推送提醒。'
      };
    }
    return { needsCapabilityCheck: false, hasScheduledTaskSupport: false, capabilityNotice: '' };
  }

  function looksLikeSoftMemoryIntent(userText) {
    var text = String(userText || '').trim();
    if (!text || text.length < 4) return false;
    if (isPureGreetingOrFiller(text) || isPureQuestionWithoutFact(text)) return false;
    return /(?:记忆|记住|记一下|记着|忘掉|忘记|算了.*不要|别再提|不要再提|不再喜欢|以后.*都按|以后就按|按这个来|以后我更|从今以后|往后都|刚才说的|前面说的|之前说的|这件事|那件事|留个底|持续关注|一直关注|帮我盯着|那个项目|这个项目|那个计划|这个计划)/.test(text);
  }

  function hasVagueContextReference(text) {
    var s = String(text || '').trim();
    if (!s) return true;
    if (/^(?:这个|那个|上面|前面|刚才|刚刚|这件事|那件事|上述|以上|下面这些|这些|那些|它|这事|那事|刚才那个|刚才说的|刚刚说的|前面说的|上面说的|之前说的)(?:[，,。\s]*(?:计划|项目|方案|事|事情|东西|内容|决定|偏好))?$/.test(s)) {
      return true;
    }
    if (/(?:上面说的|刚才说的|刚刚说的|前面提到的|前面说的|之前说的|刚才那个|刚刚那个|上面那个|前面那个|这个方案|那个方案|这个项目|那个项目|这个计划|那个计划|这件事|那件事|就按这个来|按这个来)/.test(s) &&
        !/(?:名叫|叫做|《|：|:)/.test(s) &&
        s.length <= 38) {
      return true;
    }
    return false;
  }

  function inferMemoryCategoryFromText(text) {
    var t = String(text || '');
    if (/(?:喜欢|最喜欢|爱喝|爱吃|最爱|偏好|习惯喝|习惯吃|不喜欢|讨厌|忌口|过敏|改喝|改吃|风格|排版|简短|详尽|清单)/.test(t)) return '偏好';
    if (/(?:每天|每晚|平时|作息|习惯|早起|熬夜|几点睡)/.test(t)) return '习惯';
    if (/(?:计划|打算|准备去|下周|下个月|明年|目标|出差|旅行|考研|备考|开始学|学习|学日语|学英语|考证|进修)/.test(t)) return '长期计划';
    if (/(?:项目|开发|正在做|系统|软件|应用|仓库|产品)/.test(t)) return '项目';
    if (/(?:决定|确定|选定|定下来|不再)/.test(t)) return '决定';
    if (/(?:叫我|我叫|名字|职业|工程师|医生|老师|学生|住在|居住|老家|养了)/.test(t)) return '身份信息';
    return '备忘';
  }

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
      s = '用户备忘：' + s;
    }
    return s;
  }

  function parseDirectExplicitMemoryFact(userText, maxLen) {
    var raw = String(userText || '').trim();
    if (!raw) return null;

    var stripped = raw
      .replace(SAVE_CMD_PREFIX_RE, '')
      .replace(SAVE_CMD_SUFFIX_RE, '')
      .trim();

    if (!stripped || stripped.length < 2) return null;
    if (hasVagueContextReference(stripped)) return null;
    if (/[？?]$/.test(stripped) && !/[，。；！]/.test(stripped)) return null;

    var fact = convertFirstPersonToThirdPerson(stripped);
    fact = fact.replace(/[。！!]+$/, '').trim();
    var limit = Math.max(60, Number(maxLen) || DEFAULT_MAX_MEM_LENGTH);
    if (fact.length > limit) fact = fact.slice(0, limit);

    return {
      intent: 'save',
      action: 'add',
      shouldSave: true,
      confidence: 0.95,
      targetId: '',
      content: fact,
      category: inferMemoryCategoryFromText(stripped),
      importance: 5,
      scope: 'user'
    };
  }

  function stripDeleteCommandTarget(userText) {
    var raw = String(userText || '').trim();
    if (!raw) return '';
    return raw
      .replace(/^(?:好的|嗯+|对了)?[\s，,。！!]*?(?:请|麻烦|麻烦你|请你|帮我|帮忙|替我|请帮我|能帮我)?\s*(?:彻底|全部|永远)?\s*(?:忘掉|忘记|遗忘|删掉|删除|清除|清理|抹掉|抹除|移除|取消|别再记|不要再记|不用再记|别记了|不用记了)(?:关于|有关|那条|这条)?\s*[：:，,、。\s]*/i, '')
      .replace(/(?:这件事|那件事|这个记忆|这条记忆|的记忆|记忆|这事|那事)?[吧呀呢啊哦了]*\s*(?:好吗|好不好|行吗|可以吗|谢谢|感谢|拜托了)?[？?！!。.\s]*$/i, '')
      .trim();
  }

  function findRuleBasedDeleteTargets(targetPhrase, existingMemories) {
    var list = Array.isArray(existingMemories) ? existingMemories : [];
    if (!targetPhrase || !list.length || hasVagueContextReference(targetPhrase)) return [];

    var normalizedPhrase = normalizeMemoryText(convertFirstPersonToThirdPerson(targetPhrase));
    var rawNorm = normalizeMemoryText(targetPhrase);
    var scored = [];

    for (var i = 0; i < list.length; i++) {
      var mem = list[i];
      if (!mem || !mem.content) continue;
      var memNorm = normalizeMemoryText(mem.content);
      var sim = Math.max(
        computeTextSimilarity(targetPhrase, mem.content),
        computeTextSimilarity(convertFirstPersonToThirdPerson(targetPhrase), mem.content)
      );
      if (memNorm === normalizedPhrase || (rawNorm.length >= 2 && memNorm.indexOf(rawNorm) !== -1)) {
        sim = Math.max(sim, 0.92);
      }
      if (sim >= 0.45) {
        scored.push({ memory: mem, score: sim });
      }
    }

    scored.sort(function(a, b) { return b.score - a.score; });
    if (!scored.length) return [];
    if (scored[0].score >= 0.72) {
      return [scored[0].memory];
    }
    if (scored.length === 1 && scored[0].score >= 0.5) {
      return [scored[0].memory];
    }
    return [];
  }

  function buildHistoryContextText(historyMessages) {
    var list = Array.isArray(historyMessages) ? historyMessages : [];
    if (!list.length) return '';
    return list.slice(-6).map(function(m) {
      var role = m && m.role === 'assistant' ? '助手' : '用户';
      var content = String((m && m.content) || '').trim().slice(0, 260);
      return content ? (role + '：' + content) : '';
    }).filter(Boolean).join('\n');
  }

  function hasIdentifiableHistoryAntecedent(historyMessages) {
    var list = Array.isArray(historyMessages) ? historyMessages : [];
    for (var i = list.length - 1; i >= 0; i--) {
      var m = list[i];
      if (!m || m.role !== 'user') continue;
      var txt = String(m.content || '').trim();
      if (txt.length >= 4 && !isPureGreetingOrFiller(txt) && !hasVagueContextReference(txt) && !detectMemoryIntentFast(txt).matched && !isPureQuestionWithoutFact(txt)) {
        return true;
      }
    }
    for (var j = list.length - 1; j >= 0; j--) {
      var am = list[j];
      if (!am || am.role !== 'assistant') continue;
      var atxt = String(am.content || '').trim();
      if (atxt.length >= 10 && !isPureGreetingOrFiller(atxt) && !/[？?]$/.test(atxt)) {
        return true;
      }
    }
    return false;
  }

  function resolveContextReferenceFromHistory(userText, historyMessages, maxLen) {
    var src = String(userText || '').trim();
    var list = Array.isArray(historyMessages) ? historyMessages : [];
    if (!src || !list.length || !hasVagueContextReference(src)) return null;

    var wantsProject = /(?:项目|软件|应用|系统|产品|工具|app)/i.test(src);
    var wantsPlan = /(?:计划|打算|安排|方案|目标|学习)/.test(src);
    var wantsFollow = /(?:持续关注|长期关注|一直关注|盯着|跟进|记住|记一下|记着|按这个来)/.test(src);
    var limit = Math.max(60, Number(maxLen) || DEFAULT_MAX_MEM_LENGTH);

    for (var i = list.length - 1; i >= 0; i--) {
      var m = list[i];
      if (!m || m.role !== 'user') continue;
      var txt = String(m.content || '').trim();
      if (!txt || txt.length < 4 || isPureGreetingOrFiller(txt) || hasVagueContextReference(txt) || isPureQuestionWithoutFact(txt)) {
        continue;
      }
      if (containsSensitiveSecret(txt) || containsHighRiskPrivacy(txt) || isGuessHypothesisOrThirdPartyQuote(txt)) {
        continue;
      }

      if (wantsProject || !wantsPlan) {
        var mNamedProj = txt.match(/(?:名叫|叫做|名为|叫)([^，,。；;！!\n的]{2,24}?)(?:的(?:AI|ai)?(?:项目|软件|应用|系统|产品|工具)|$)/);
        if (mNamedProj && mNamedProj[1]) {
          var pName = mNamedProj[1].replace(/[「」《》"']/g, '').trim();
          if (pName) {
            var pFact = '用户正在推进项目「' + pName + '」' + (wantsFollow ? '（希望重点关注）' : '');
            return {
              intent: 'save',
              action: 'add',
              shouldSave: true,
              aboutUser: true,
              isDurable: true,
              factType: 'direct_fact',
              factSource: 'context_resolved',
              temporalState: 'current',
              status: 'active',
              confidence: 0.88,
              content: pFact.slice(0, limit),
              category: '项目',
              importance: 4,
              scope: 'user'
            };
          }
        }

        var mDevProj = txt.match(/(?:正在|在)(?:开发|制作|研发|搭建|推进|筹备|做)([^，,。；;！!\n]{2,36})/);
        if (mDevProj && mDevProj[1]) {
          var projDesc = cleanHighCertaintyClauseTail(mDevProj[1]);
          if (projDesc && !/^(?:什么|哪个|怎么)/.test(projDesc)) {
            var dFact = '用户正在推进项目：' + projDesc + (wantsFollow ? '（希望重点关注）' : '');
            return {
              intent: 'save',
              action: 'add',
              shouldSave: true,
              aboutUser: true,
              isDurable: true,
              factType: 'direct_fact',
              factSource: 'context_resolved',
              temporalState: 'current',
              status: 'active',
              confidence: 0.86,
              content: dFact.slice(0, limit),
              category: '项目',
              importance: 4,
              scope: 'user'
            };
          }
        }
      }

      if (wantsPlan || !wantsProject) {
        var mPlan = txt.match(/(?:准备|打算|计划|决定|开始)(?:长期)?([^，,。；;！!\n]{2,38})/);
        if (mPlan && mPlan[1]) {
          var planDesc = cleanHighCertaintyClauseTail(mPlan[1]);
          if (planDesc) {
            return {
              intent: 'save',
              action: 'add',
              shouldSave: true,
              aboutUser: true,
              isDurable: true,
              factType: 'direct_fact',
              factSource: 'context_resolved',
              temporalState: 'future_plan',
              status: 'active',
              confidence: 0.85,
              content: ('用户计划' + planDesc).slice(0, limit),
              category: '长期计划',
              importance: 4,
              scope: 'user'
            };
          }
        }
      }

      var extractedFromHist = extractHighCertaintyFactCandidates(txt, limit);
      if (extractedFromHist.length > 0) {
        var picked = Object.assign({}, extractedFromHist[0], {
          factSource: 'context_resolved',
          confidence: 0.85
        });
        return picked;
      }

      if (txt.length >= 6 && txt.length <= 120 && !/[？?]$/.test(txt)) {
        var resolvedFact = convertFirstPersonToThirdPerson(txt.replace(/[。！!]+$/, ''));
        return {
          intent: 'save',
          action: 'add',
          shouldSave: true,
          aboutUser: true,
          isDurable: true,
          factType: 'direct_fact',
          factSource: 'context_resolved',
          temporalState: 'current',
          status: 'active',
          confidence: 0.82,
          content: resolvedFact.slice(0, limit),
          category: inferMemoryCategoryFromText(txt),
          importance: 4,
          scope: 'user'
        };
      }
    }

    for (var j = list.length - 1; j >= 0; j--) {
      var am = list[j];
      if (!am || am.role !== 'assistant') continue;
      var atxt = String(am.content || '').replace(/\s+/g, ' ').trim();
      if (atxt.length >= 10 && !isPureGreetingOrFiller(atxt) && !/[？?]$/.test(atxt) && !containsSensitiveSecret(atxt)) {
        if (/(?:按这个来|就按这样|方案|格式|规则|计划)/.test(src)) {
          return {
            intent: 'save',
            action: 'add',
            shouldSave: true,
            aboutUser: true,
            isDurable: true,
            factType: 'direct_fact',
            factSource: 'context_resolved',
            temporalState: 'current',
            status: 'active',
            confidence: 0.8,
            content: ('用户确认后续采用约定方案：' + atxt.slice(0, 120)).slice(0, limit),
            category: '决定',
            importance: 4,
            scope: 'user'
          };
        }
      }
    }

    return null;
  }

  async function skipQueuedTasksMatchingDeleted(store, deletedMemories) {
    if (!store || typeof store.listMemoryTasks !== 'function' || !Array.isArray(deletedMemories) || !deletedMemories.length) return;
    try {
      var tasks = await store.listMemoryTasks();
      for (var i = 0; i < tasks.length; i++) {
        var t = tasks[i];
        if (!t || (t.status !== 'pending' && t.status !== 'retry_waiting')) continue;
        var payloadText = String((t.payload && t.payload.userText) || '').trim();
        if (!payloadText) continue;
        var third = convertFirstPersonToThirdPerson(payloadText);
        var hits = deletedMemories.some(function(dm) {
          return dm && dm.content && (
            computeTextSimilarity(payloadText, dm.content) >= 0.45 ||
            computeTextSimilarity(third, dm.content) >= 0.5
          );
        });
        if (hits) {
          await store.updateMemoryTask(t.id, {
            status: 'skipped',
            memoryWritten: false,
            lastError: '',
            resultSummary: '用户已要求遗忘该记忆，历史待提取任务已自动取消'
          });
        }
      }
    } catch (_) {}
  }

  function normalizeParsedConfidence(val, fallback) {
    if (val === undefined || val === null || val === '') return fallback;
    var n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    if (n > 1 && n <= 100) n = n / 100;
    return Math.max(0, Math.min(1, n));
  }

  function normalizeItemTemporalState(val, statusHint) {
    var v = String(val || '').trim().toLowerCase();
    if (['current', 'past', 'future_plan', 'completed', 'cancelled'].indexOf(v) !== -1) return v;
    var st = String(statusHint || '').trim().toLowerCase();
    if (st === 'historical') return 'past';
    if (st === 'completed') return 'completed';
    if (st === 'cancelled') return 'cancelled';
    return 'current';
  }

  function deriveItemStatus(rawStatus, temporalState) {
    var v = String(rawStatus || '').trim().toLowerCase();
    if (['active', 'historical', 'completed', 'cancelled'].indexOf(v) !== -1) return v;
    if (temporalState === 'past') return 'historical';
    if (temporalState === 'completed') return 'completed';
    if (temporalState === 'cancelled') return 'cancelled';
    return 'active';
  }

  function parseStructuredMemoryResponse(rawText) {
    var parsed = parseExtractorJsonObject(rawText);
    if (!parsed) return { intent: 'none', items: [], clarificationQuestion: '' };

    if (Array.isArray(parsed)) {
      return { intent: parsed.length ? 'save' : 'none', items: parsed, clarificationQuestion: '' };
    }
    if (typeof parsed !== 'object') {
      return { intent: 'none', items: [], clarificationQuestion: '' };
    }

    if (!parsed.memories && parsed.result && typeof parsed.result === 'object') {
      parsed = parsed.result;
    } else if (!parsed.memories && parsed.data && typeof parsed.data === 'object') {
      parsed = parsed.data;
    } else if (!parsed.memories && parsed.memory && typeof parsed.memory === 'object') {
      parsed = parsed.memory;
    }

    var topIntent = String(parsed.intent || parsed.action || '').trim().toLowerCase();
    var clarMsg = String(parsed.clarificationQuestion || parsed.clarify || '').trim();
    var topAboutUser = parsed.aboutUser;
    var topIsDurable = parsed.isDurable;
    var topFactType = String(parsed.factType || '').trim().toLowerCase();
    var topConf = normalizeParsedConfidence(parsed.confidence, null);
    var items = [];

    if (Array.isArray(parsed.memories)) {
      items = parsed.memories.slice();
    } else if (
      topIntent === 'save' ||
      topIntent === 'update' ||
      topIntent === 'delete' ||
      topIntent === 'add' ||
      topIntent === 'mark_historical' ||
      parsed.shouldSave === true ||
      typeof parsed.content === 'string'
    ) {
      items = [parsed];
    }

    if (!topIntent && items.length > 0) {
      topIntent = String(items[0].intent || items[0].action || (parsed.shouldSave === false ? 'none' : 'save')).toLowerCase();
    }
    if (topIntent === 'add') topIntent = 'save';

    return {
      intent: topIntent || 'none',
      items: items,
      clarificationQuestion: clarMsg,
      confidence: topConf,
      shouldSave: parsed.shouldSave,
      aboutUser: topAboutUser,
      isDurable: topIsDurable,
      factType: topFactType
    };
  }

  async function applyStructuredSemanticDecision(decision, context) {
    var store = S();
    if (!store) return { added: [], updated: [], deleted: [], skipped: 0, rejectedByValueGate: 0, blockedSecrets: 0, blockedDeleted: 0 };

    var ctx = context && typeof context === 'object' ? context : {};
    var userId = String(ctx.userId || 'local_user').trim() || 'local_user';
    var items = Array.isArray(decision && decision.items) ? decision.items : [];
    var isExplicit = !!ctx.isExplicit;
    var minConf = isExplicit ? 0.55 : 0.60;

    if (decision && decision.intent === 'clarify') {
      return {
        added: [],
        updated: [],
        deleted: [],
        skipped: 0,
        rejectedByValueGate: 0,
        blockedSecrets: 0,
        blockedDeleted: 0,
        needsClarification: true,
        clarificationMessage: decision.clarificationQuestion || '请具体说明你想让我记住或修改哪部分内容？'
      };
    }

    var REJECTED_FACT_TYPES = ['guess', 'hypothesis', 'joke', 'sarcasm', 'third_party', 'quote', 'speculation', 'temporary', 'greeting_or_temp'];

    if (!isExplicit && decision) {
      var topFactType = String(decision.factType || '').toLowerCase();
      if (decision.aboutUser === false || decision.isDurable === false || REJECTED_FACT_TYPES.indexOf(topFactType) !== -1) {
        return {
          added: [],
          updated: [],
          deleted: [],
          skipped: Math.max(1, items.length),
          rejectedByValueGate: Math.max(1, items.length),
          blockedSecrets: 0,
          blockedDeleted: 0,
          valueRejectReason: decision.aboutUser === false
            ? '非用户本人直接事实'
            : (topFactType === 'guess' || topFactType === 'hypothesis' || topFactType === 'speculation'
              ? '猜测或假设内容'
              : (topFactType === 'joke' || topFactType === 'sarcasm'
                ? '玩笑或反讽表达'
                : (topFactType === 'quote' || topFactType === 'third_party' ? '引用他人内容' : '临时话题或不具持续性')))
        };
      }
    }

    var existingAll = await store.listMemories({ userId: userId });
    var toUpsert = [];
    var deleted = [];
    var skipped = 0;
    var rejectedByValueGate = 0;
    var blockedSecrets = 0;
    var rejectReasons = [];

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || typeof item !== 'object') continue;

      var itemIntent = String(item.intent || item.action || decision.intent || 'save').trim().toLowerCase();
      if (itemIntent === 'add') itemIntent = 'save';

      if (itemIntent === 'clarify') {
        return {
          added: [],
          updated: [],
          deleted: [],
          skipped: 0,
          rejectedByValueGate: 0,
          blockedSecrets: 0,
          blockedDeleted: 0,
          needsClarification: true,
          clarificationMessage: String(item.clarificationQuestion || decision.clarificationQuestion || '请具体说明你想让我记住或修改哪部分内容？')
        };
      }

      if (itemIntent === 'none' || itemIntent === 'skip') {
        skipped++;
        continue;
      }

      var itemFactType = String(item.factType || (decision && decision.factType) || '').toLowerCase();
      if (!isExplicit) {
        if (item.aboutUser === false || item.isDurable === false || REJECTED_FACT_TYPES.indexOf(itemFactType) !== -1) {
          skipped++;
          rejectedByValueGate++;
          rejectReasons.push('未通过可信度/用户直接事实价值评估');
          continue;
        }
      }

      var conf = normalizeParsedConfidence(
        item.confidence !== undefined ? item.confidence : (decision ? decision.confidence : null),
        0.85
      );
      if (Number.isFinite(conf) && conf < minConf) {
        skipped++;
        rejectedByValueGate++;
        rejectReasons.push('置信度低于阈值(' + conf + ' < ' + minConf + ')');
        continue;
      }

      if (itemIntent === 'delete') {
        var delTarget = null;
        if (item.targetId) {
          delTarget = existingAll.find(function(m) { return m.id === item.targetId; }) || null;
        }
        if (!delTarget && item.content) {
          var matches = findRuleBasedDeleteTargets(item.content, existingAll);
          if (matches.length) delTarget = matches[0];
        }
        if (delTarget) {
          var okDel = await store.deleteMemory(delTarget.id);
          if (okDel) {
            deleted.push(delTarget);
            existingAll = existingAll.filter(function(m) { return m.id !== delTarget.id; });
          }
        } else {
          skipped++;
        }
        continue;
      }

      if (item.shouldSave === false) {
        skipped++;
        continue;
      }

      var content = String(item.content || '').trim();
      if (!content || content.length < 2) {
        skipped++;
        continue;
      }
      if (containsSensitiveSecret(content) || (!isExplicit && containsHighRiskPrivacy(content))) {
        blockedSecrets++;
        continue;
      }

      // 若模型仍输出未消解的模糊指代（如“刚才说的那个项目”），尝试结合上下文消解或要求澄清
      if (hasVagueContextReference(content)) {
        var resolved = resolveContextReferenceFromHistory(ctx.rawUserText || content, ctx.historyMessages || [], ctx.maxSingleMemoryLength);
        if (resolved && resolved.content) {
          content = resolved.content;
          if (!item.factSource) item.factSource = 'context_resolved';
          if (!item.category && resolved.category) item.category = resolved.category;
        } else if (isExplicit) {
          return {
            added: [],
            updated: [],
            deleted: [],
            skipped: 0,
            rejectedByValueGate: 0,
            blockedSecrets: 0,
            blockedDeleted: 0,
            needsClarification: true,
            clarificationMessage: '我还不太确定你具体指的是哪一项内容，可以再说一下名称或细节吗？'
          };
        } else {
          skipped++;
          rejectedByValueGate++;
          rejectReasons.push('指代对象未在上下文中明确，跳过保存');
          continue;
        }
      }

      var tState = normalizeItemTemporalState(item.temporalState, item.status);
      var mStatus = deriveItemStatus(item.status, tState);
      if (itemIntent === 'mark_historical' && mStatus === 'active') {
        mStatus = 'historical';
        tState = 'past';
      }

      var actionKind = (itemIntent === 'update' || itemIntent === 'mark_historical') ? 'update' : 'add';
      var relationVal = String(item.relation || (actionKind === 'update' ? (mStatus !== 'active' ? 'status_changed' : 'updated') : 'new')).trim();

      toUpsert.push({
        action: actionKind,
        targetId: String(item.targetId || ''),
        targetSubject: String(item.targetSubject || '').trim(),
        content: content,
        category: item.category || inferMemoryCategoryFromText(content),
        importance: item.importance != null ? item.importance : (mStatus !== 'active' ? 2 : (isExplicit ? 5 : 4)),
        scope: item.scope || 'user',
        confidence: conf,
        temporalState: tState,
        status: mStatus,
        factSource: String(item.factSource || (itemFactType === 'context_resolved' ? 'context_resolved' : 'user_statement')).trim(),
        relation: relationVal,
        supersedesId: String(item.supersedesId || '').trim()
      });
    }

    if (deleted.length > 0) {
      await skipQueuedTasksMatchingDeleted(store, deleted);
    }

    var upsertRes = toUpsert.length > 0
      ? await upsertExtractedMemories(toUpsert, ctx)
      : { added: [], updated: [], skipped: 0, blockedSecrets: 0, blockedDeleted: 0 };

    return {
      added: upsertRes.added || [],
      updated: upsertRes.updated || [],
      deleted: deleted,
      skipped: (upsertRes.skipped || 0) + skipped,
      rejectedByValueGate: rejectedByValueGate,
      valueRejectReason: rejectReasons[0] || '',
      blockedSecrets: (upsertRes.blockedSecrets || 0) + blockedSecrets,
      blockedDeleted: upsertRes.blockedDeleted || 0
    };
  }

  async function requestSemanticMemoryJudgment(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var store = S();
    var ai = AI();
    if (!store || !ai || typeof ai.requestChatCompletion !== 'function') {
      throw new Error('模型或存储模块未就绪');
    }

    var userId = String(opts.userId || 'local_user').trim() || 'local_user';
    var existing = await store.listMemories({ userId: userId });
    var existingListText = existing.slice(0, 30).map(function(m) {
      var stTag = (m.status && m.status !== 'active') ? ('[' + m.status + '] ') : '';
      return '- id:' + m.id + ' | ' + stTag + '[' + m.category + '] ' + m.content;
    }).join('\n') || '（暂无已有记忆）';

    var historyContextText = buildHistoryContextText(opts.historyMessages);
    var historyBlock = historyContextText
      ? ('\n【近期聊天上下文（必须用于消解“刚才说的/之前说的/那个项目/按这个来”等指代）】\n' + historyContextText + '\n')
      : '';

    var intentHintLine = opts.intentHint && opts.intentHint !== 'none'
      ? ('【规则初筛提示】用户本轮表达倾向于「' + opts.intentHint + '」记忆意图，请结合上下文准确判断目标内容或目标记忆 ID。\n')
      : '';

    var prompt =
      '你是知屿的智能语义记忆判断器。请理解用户的真实意图、指代关系、时间状态与事实变化。\n' +
      '可选 intent：\n' +
      '- "save": 新增值得跨对话长期保留的用户信息（偏好、习惯、长期计划、正在开发的项目、重要决定、身份背景，或用户要求记住/关注的内容）。\n' +
      '- "update": 修改/修正/替代已有某条记忆，或把已取消/过去事项更新为历史/已取消状态（必须在 targetId 填入被更新的已有记忆 ID，或填写 targetSubject）。\n' +
      '- "delete": 用户要求忘掉、忘记、删除某条记忆。\n' +
      '- "clarify": 用户指代“这个/刚才说的”，但上下文找不到明确对象时，绝不凭空猜测，返回 intent="clarify"。\n' +
      '- "none": 普通寒暄、一次性提问、假设/玩笑/他人事实且用户未要求保存。\n\n' +
      '深度语义规范：\n' +
      '1) 多事实拆解：一句话含多个独立信息（如正在开发某项目 + 开始学习某语言），必须拆成 memories 数组多条返回。\n' +
      '2) 指代消解：若用户说“刚才说的那个项目/计划/按这个来”，必须从【近期聊天上下文】提取具体名称写入 content（并标记 factSource="context_resolved"），绝不可保留“刚才说的”这种模糊词。\n' +
      '3) 时间状态：区分 temporalState（"current"当前 / "past"过去 / "future_plan"计划 / "completed"已完成 / "cancelled"已取消）与 status（"active" / "historical" / "completed" / "cancelled"）。\n' +
      '4) 若某旧计划已取消或旧偏好已成过去，应同时更新旧记忆为 historical/cancelled，不要把已取消或过去偏好标成 active。\n' +
      '5) 绝不保存密码、API Key、Token、验证码、私钥、银行卡/证件号。\n' +
      '6) 诚实评估 confidence（0~1），不确定或猜测给低分。\n\n' +
      intentHintLine +
      '【已有记忆】\n' + existingListText + '\n' +
      historyBlock + '\n' +
      '【本轮用户输入】\n' + String(opts.userText || '').slice(0, 1200) + '\n\n' +
      (opts.assistantText ? ('【本轮助手回复摘要】\n' + String(opts.assistantText).slice(0, 400) + '\n\n') : '') +
      '请只输出合法 JSON 对象，不要有任何多余文字：\n' +
      '{"intent":"save","shouldSave":true,"aboutUser":true,"factType":"direct_fact","confidence":0.92,"clarificationQuestion":"","memories":[{"intent":"save","shouldSave":true,"content":"用户正在推进项目「星澜」","category":"项目","temporalState":"current","status":"active","factSource":"context_resolved","relation":"new","targetId":"","targetSubject":"","confidence":0.92,"importance":4,"scope":"user"}]}';

    var res = await ai.requestChatCompletion({
      apiConfig: opts.apiConfig,
      temperature: 0.1,
      maxTokens: 1500,
      allowReasoningFallback: true,
      messages: [
        { role: 'system', content: '你是只输出纯 JSON 的智能语义记忆判断器。支持多事实拆分、指代消解、temporalState/status 时间状态识别与事实变更关联。' },
        { role: 'user', content: prompt }
      ]
    });

    var rawContent = String((res && res.content) || '').trim();
    if (!rawContent) {
      throw new Error('模型未返回有效的语义判断结果');
    }
    return parseStructuredMemoryResponse(rawContent);
  }

  async function handleExplicitMemoryCommand(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var userText = String(opts.userText || '').trim();
    var fast = detectMemoryIntentFast(userText);
    var isSoft = !fast.matched && looksLikeSoftMemoryIntent(userText);

    if (!fast.matched && !isSoft) {
      return { isExplicit: false, intent: 'none', saved: false, added: [], updated: [], deleted: [] };
    }

    var store = S();
    if (!store) {
      return { isExplicit: true, intent: fast.intent || 'save', saved: false, error: '存储模块未就绪', added: [], updated: [], deleted: [] };
    }

    var rawSettings = await store.getMemorySettings();
    var params = resolveMemoryParams(rawSettings);
    var chatId = String(opts.chatId || '');
    var chatTitle = String(opts.chatTitle || '');
    var projectId = String(opts.projectId || '');
    var userId = String(opts.userId || 'local_user').trim() || 'local_user';
    var turnCreatedAt = Date.now();
    var historyMessages = Array.isArray(opts.historyMessages) ? opts.historyMessages : [];

    // 1) 严格遵守用户设置：若长期记忆已关闭，不得绕过用户设置偷偷保存
    if (!params.useMemory && fast.matched && fast.intent !== 'delete') {
      var skippedTask = await store.enqueueMemoryTask({
        type: fast.intent === 'update' ? 'explicit_update' : 'explicit_memory',
        turnKey: 'exp:' + chatId + ':' + String(opts.userMsgId || turnCreatedAt),
        chatId: chatId,
        chatTitle: chatTitle,
        projectId: projectId,
        userId: userId,
        status: 'skipped',
        attempts: 1,
        memoryWritten: false,
        savedMemoryIds: [],
        resultSummary: '长期记忆开关已关闭，未保存',
        payload: { userText: userText.slice(0, 500) }
      });
      return {
        isExplicit: true,
        intent: fast.intent,
        saved: false,
        blockedBySetting: true,
        reason: '长期记忆已关闭，本次未保存',
        added: [],
        updated: [],
        deleted: [],
        task: skippedTask
      };
    }

    // 2) 安全拦截：绝不保存密码、API Key、验证码等敏感秘密
    if (containsSensitiveSecret(userText)) {
      var secretTask = await store.enqueueMemoryTask({
        type: 'explicit_memory',
        turnKey: 'exp:' + chatId + ':' + String(opts.userMsgId || turnCreatedAt),
        chatId: chatId,
        chatTitle: chatTitle,
        projectId: projectId,
        userId: userId,
        status: 'skipped',
        attempts: 1,
        memoryWritten: false,
        savedMemoryIds: [],
        resultSummary: '检测到密码/密钥/验证码等敏感信息，已安全拦截',
        payload: { userText: '[已脱敏敏感指令]' }
      });
      return {
        isExplicit: true,
        intent: 'save',
        saved: false,
        blockedSecret: true,
        reason: '包含密码或密钥等敏感信息，已安全拦截',
        added: [],
        updated: [],
        deleted: [],
        task: secretTask
      };
    }

    var capCheck = detectUnsupportedMonitoringOrReminderRequest(userText);

    // 3) 如果是软意图且无有效 API：若有上下文指代且能消解，按规则尝试兜底；若明显缺上下文则澄清；否则退回普通聊天流程
    if (isSoft && (!opts.apiConfig || !opts.apiConfig.url || !opts.apiConfig.key || !opts.apiConfig.model)) {
      if (hasVagueContextReference(userText) && !hasIdentifiableHistoryAntecedent(historyMessages)) {
        return {
          isExplicit: true,
          intent: 'clarify',
          saved: false,
          needsClarification: true,
          clarificationMessage: '当前对话里还没有可以指代的前文，你想让我记住或关注哪件事呢？',
          capabilityNotice: capCheck.capabilityNotice,
          added: [],
          updated: [],
          deleted: []
        };
      }
      var offlineResolved = resolveContextReferenceFromHistory(userText, historyMessages, params.maxSingleMemoryLength);
      if (offlineResolved && params.useMemory) {
        var offlineUpsert = await upsertExtractedMemories([offlineResolved], {
          userId: userId,
          chatId: chatId,
          chatTitle: chatTitle,
          projectId: projectId,
          rawUserText: userText,
          maxSingleMemoryLength: params.maxSingleMemoryLength,
          taskCreatedAt: turnCreatedAt,
          allowOverrideOlderTombstone: true,
          isExplicit: true
        });
        var offIds = (offlineUpsert.added || []).concat(offlineUpsert.updated || []).map(function(m) { return m && m.id; }).filter(Boolean);
        return {
          isExplicit: true,
          intent: 'save',
          saved: offIds.length > 0,
          alreadyExists: !offIds.length && !!offlineUpsert.skipped,
          capabilityNotice: capCheck.capabilityNotice,
          added: offlineUpsert.added || [],
          updated: offlineUpsert.updated || [],
          deleted: [],
          savedIds: offIds
        };
      }
      return {
        isExplicit: false,
        intent: 'none',
        saved: false,
        capabilityNotice: capCheck.capabilityNotice,
        added: [],
        updated: [],
        deleted: []
      };
    }

    // 4) 若属于软意图表达，先调用模型确认到底是不是记忆意图；若模型判定为 none，交回普通聊天
    if (isSoft) {
      try {
        if (hasVagueContextReference(userText) && !hasIdentifiableHistoryAntecedent(historyMessages)) {
          return {
            isExplicit: true,
            intent: 'clarify',
            saved: false,
            needsClarification: true,
            clarificationMessage: '当前对话里还没有可以指代的前文，你想让我记住或关注哪件事呢？',
            capabilityNotice: capCheck.capabilityNotice,
            added: [],
            updated: [],
            deleted: []
          };
        }

        var softDecision = await requestSemanticMemoryJudgment({
          userText: userText,
          historyMessages: historyMessages,
          userId: userId,
          apiConfig: opts.apiConfig,
          intentHint: capCheck.needsCapabilityCheck ? 'save' : 'none'
        });

        if ((!softDecision || softDecision.intent === 'none') && hasVagueContextReference(userText)) {
          var ctxFallback = resolveContextReferenceFromHistory(userText, historyMessages, params.maxSingleMemoryLength);
          if (ctxFallback) {
            softDecision = {
              intent: 'save',
              shouldSave: true,
              aboutUser: true,
              isDurable: true,
              factType: 'direct_fact',
              confidence: ctxFallback.confidence,
              items: [ctxFallback]
            };
          }
        }

        if (!softDecision || softDecision.intent === 'none') {
          return {
            isExplicit: false,
            intent: 'none',
            saved: false,
            capabilityNotice: capCheck.capabilityNotice,
            added: [],
            updated: [],
            deleted: []
          };
        }
        if (softDecision.intent === 'clarify') {
          return {
            isExplicit: true,
            intent: 'clarify',
            saved: false,
            needsClarification: true,
            clarificationMessage: softDecision.clarificationQuestion || '你想让我记住或修改哪一条内容呢？请再具体说明一下。',
            capabilityNotice: capCheck.capabilityNotice,
            added: [],
            updated: [],
            deleted: []
          };
        }
        if (!params.useMemory && softDecision.intent !== 'delete') {
          return {
            isExplicit: true,
            intent: softDecision.intent,
            saved: false,
            blockedBySetting: true,
            reason: '长期记忆已关闭，本次未保存',
            capabilityNotice: capCheck.capabilityNotice,
            added: [],
            updated: [],
            deleted: []
          };
        }
        var softTaskType = softDecision.intent === 'delete'
          ? 'explicit_delete'
          : (softDecision.intent === 'update' ? 'explicit_update' : 'explicit_memory');
        var softTask = await store.enqueueMemoryTask({
          type: softTaskType,
          turnKey: 'exp:' + chatId + ':' + String(opts.userMsgId || turnCreatedAt),
          chatId: chatId,
          chatTitle: chatTitle,
          projectId: projectId,
          userId: userId,
          status: 'running',
          attempts: 0,
          memoryWritten: false,
          savedMemoryIds: [],
          payload: { userText: userText.slice(0, 1200) }
        });
        var softApplied = await applyStructuredSemanticDecision(softDecision, {
          userId: userId,
          chatId: chatId,
          chatTitle: chatTitle,
          projectId: projectId,
          rawUserText: userText,
          historyMessages: historyMessages,
          maxSingleMemoryLength: params.maxSingleMemoryLength,
          taskCreatedAt: turnCreatedAt,
          allowOverrideOlderTombstone: true,
          isExplicit: true
        });
        if (softApplied.needsClarification) {
          await store.updateMemoryTask(softTask.id, {
            status: 'skipped',
            attempts: 1,
            memoryWritten: false,
            resultSummary: '内容不明确，已提示用户补充说明'
          });
          return {
            isExplicit: true,
            intent: 'clarify',
            saved: false,
            needsClarification: true,
            clarificationMessage: softApplied.clarificationMessage,
            capabilityNotice: capCheck.capabilityNotice,
            added: [],
            updated: [],
            deleted: []
          };
        }
        var sAdded = softApplied.added || [];
        var sUpdated = softApplied.updated || [];
        var sDeleted = softApplied.deleted || [];
        var sIds = sAdded.concat(sUpdated).map(function(m) { return m.id; }).filter(Boolean);
        var sChanged = sIds.length > 0 || sDeleted.length > 0;
        var sSummary = sDeleted.length > 0
          ? ('已遗忘并删除 ' + sDeleted.length + ' 条长期记忆')
          : (sIds.length > 0 ? ('语义识别已写入 ' + sIds.length + ' 条长期记忆') : '长期记忆中已存在或未匹配目标');
        await store.updateMemoryTask(softTask.id, {
          status: sChanged ? 'saved' : 'skipped',
          attempts: 1,
          memoryWritten: sIds.length > 0,
          savedMemoryIds: sIds,
          lastError: '',
          resultSummary: sSummary
        });
        return {
          isExplicit: true,
          intent: softDecision.intent,
          saved: sIds.length > 0,
          deletedCount: sDeleted.length,
          alreadyExists: !sChanged && !!softApplied.skipped,
          reason: sSummary,
          capabilityNotice: capCheck.capabilityNotice,
          added: sAdded,
          updated: sUpdated,
          deleted: sDeleted,
          savedIds: sIds
        };
      } catch (softErr) {
        if (hasVagueContextReference(userText) && hasIdentifiableHistoryAntecedent(historyMessages) && params.useMemory) {
          var errFallbackItem = resolveContextReferenceFromHistory(userText, historyMessages, params.maxSingleMemoryLength);
          if (errFallbackItem) {
            var errUpsert = await upsertExtractedMemories([errFallbackItem], {
              userId: userId,
              chatId: chatId,
              chatTitle: chatTitle,
              projectId: projectId,
              rawUserText: userText,
              maxSingleMemoryLength: params.maxSingleMemoryLength,
              taskCreatedAt: turnCreatedAt,
              allowOverrideOlderTombstone: true,
              isExplicit: true
            });
            var errIds = (errUpsert.added || []).concat(errUpsert.updated || []).map(function(m) { return m && m.id; }).filter(Boolean);
            return {
              isExplicit: true,
              intent: 'save',
              saved: errIds.length > 0,
              alreadyExists: !errIds.length && !!errUpsert.skipped,
              capabilityNotice: capCheck.capabilityNotice,
              added: errUpsert.added || [],
              updated: errUpsert.updated || [],
              deleted: [],
              savedIds: errIds
            };
          }
        }
        return {
          isExplicit: false,
          intent: 'none',
          saved: false,
          capabilityNotice: capCheck.capabilityNotice,
          added: [],
          updated: [],
          deleted: []
        };
      }
    }

    // 5) 快速规则命中明确意图（save / update / delete）
    var taskType = fast.intent === 'delete'
      ? 'explicit_delete'
      : (fast.intent === 'update' ? 'explicit_update' : 'explicit_memory');

    var task = await store.enqueueMemoryTask({
      type: taskType,
      turnKey: 'exp:' + chatId + ':' + String(opts.userMsgId || turnCreatedAt),
      chatId: chatId,
      chatTitle: chatTitle,
      projectId: projectId,
      userId: userId,
      status: 'running',
      attempts: 0,
      memoryWritten: false,
      savedMemoryIds: [],
      payload: { userText: userText.slice(0, 1200) }
    });

    try {
      // 5a) 删除 / 遗忘分支
      if (fast.intent === 'delete') {
        var existingForDel = await store.listMemories({ userId: userId });
        if (!existingForDel.length) {
          await store.updateMemoryTask(task.id, {
            status: 'skipped',
            attempts: 1,
            memoryWritten: false,
            resultSummary: '当前长期记忆库为空，无可删除记录'
          });
          return {
            isExplicit: true,
            intent: 'delete',
            saved: false,
            deletedCount: 0,
            reason: '当前没有可遗忘的长期记忆',
            added: [],
            updated: [],
            deleted: [],
            task: task
          };
        }

        var delPhrase = stripDeleteCommandTarget(userText);
        var ruleTargets = findRuleBasedDeleteTargets(delPhrase, existingForDel);
        var deletedList = [];

        if (ruleTargets.length > 0) {
          for (var rt = 0; rt < ruleTargets.length; rt++) {
            var removedOk = await store.deleteMemory(ruleTargets[rt].id);
            if (removedOk) deletedList.push(ruleTargets[rt]);
          }
          if (deletedList.length > 0) {
            await skipQueuedTasksMatchingDeleted(store, deletedList);
          }
        } else if (opts.apiConfig && opts.apiConfig.url && opts.apiConfig.key && opts.apiConfig.model) {
          if (hasVagueContextReference(delPhrase) && !hasIdentifiableHistoryAntecedent(historyMessages)) {
            await store.updateMemoryTask(task.id, {
              status: 'skipped',
              attempts: 1,
              memoryWritten: false,
              resultSummary: '遗忘目标不明确，已提示用户确认'
            });
            return {
              isExplicit: true,
              intent: 'clarify',
              saved: false,
              needsClarification: true,
              clarificationMessage: '请问你想让我忘掉或删除哪一条记忆呢？可以告诉我具体关键词。',
              added: [],
              updated: [],
              deleted: []
            };
          }
          var delDecision = await requestSemanticMemoryJudgment({
            userText: userText,
            historyMessages: historyMessages,
            userId: userId,
            apiConfig: opts.apiConfig,
            intentHint: 'delete'
          });
          var delApplied = await applyStructuredSemanticDecision(delDecision, {
            userId: userId,
            chatId: chatId,
            chatTitle: chatTitle,
            projectId: projectId,
            rawUserText: userText,
            maxSingleMemoryLength: params.maxSingleMemoryLength,
            taskCreatedAt: turnCreatedAt,
            allowOverrideOlderTombstone: true,
            isExplicit: true
          });
          if (delApplied.needsClarification) {
            await store.updateMemoryTask(task.id, {
              status: 'skipped',
              attempts: 1,
              memoryWritten: false,
              resultSummary: '遗忘目标不明确，已提示用户确认'
            });
            return {
              isExplicit: true,
              intent: 'clarify',
              saved: false,
              needsClarification: true,
              clarificationMessage: delApplied.clarificationMessage,
              added: [],
              updated: [],
              deleted: []
            };
          }
          deletedList = delApplied.deleted || [];
        }

        if (deletedList.length > 0) {
          var delDoneTask = await store.updateMemoryTask(task.id, {
            status: 'saved',
            attempts: 1,
            memoryWritten: false,
            savedMemoryIds: [],
            lastError: '',
            resultSummary: '已遗忘并删除 ' + deletedList.length + ' 条长期记忆（已记录墓碑防复活）'
          });
          return {
            isExplicit: true,
            intent: 'delete',
            saved: false,
            deletedCount: deletedList.length,
            deleted: deletedList,
            added: [],
            updated: [],
            task: delDoneTask
          };
        }

        var delSkipTask = await store.updateMemoryTask(task.id, {
          status: 'skipped',
          attempts: 1,
          memoryWritten: false,
          resultSummary: '未在长期记忆中找到匹配的待遗忘内容'
        });
        return {
          isExplicit: true,
          intent: 'delete',
          saved: false,
          deletedCount: 0,
          reason: '未找到对应的长期记忆，未执行删除',
          added: [],
          updated: [],
          deleted: [],
          task: delSkipTask
        };
      }

      // 5b) 保存 / 修改分支：优先低成本规则直解析；若含模糊指代或复杂表达，结合聊天上下文调用模型语义识别
      var directItem = fast.intent === 'save'
        ? parseDirectExplicitMemoryFact(userText, params.maxSingleMemoryLength)
        : null;
      var writeRes;

      if (directItem) {
        writeRes = await upsertExtractedMemories([directItem], {
          userId: userId,
          chatId: chatId,
          chatTitle: chatTitle,
          projectId: projectId,
          rawUserText: userText,
          maxSingleMemoryLength: params.maxSingleMemoryLength,
          taskCreatedAt: turnCreatedAt,
          allowOverrideOlderTombstone: true
        });
      } else {
        var strippedSave = userText.replace(SAVE_CMD_PREFIX_RE, '').replace(SAVE_CMD_SUFFIX_RE, '').trim();
        if (hasVagueContextReference(strippedSave || userText) && !hasIdentifiableHistoryAntecedent(historyMessages)) {
          await store.updateMemoryTask(task.id, {
            status: 'skipped',
            attempts: 1,
            memoryWritten: false,
            resultSummary: '缺少明确上下文，已提示用户补充要记住的内容'
          });
          return {
            isExplicit: true,
            intent: 'clarify',
            saved: false,
            needsClarification: true,
            clarificationMessage: '当前对话里还没有可以指代的前文，你想让我记住哪件事呢？',
            added: [],
            updated: [],
            deleted: []
          };
        }

        var semDecision = await requestSemanticMemoryJudgment({
          userText: userText,
          historyMessages: historyMessages,
          userId: userId,
          apiConfig: opts.apiConfig,
          intentHint: fast.intent
        });
        writeRes = await applyStructuredSemanticDecision(semDecision, {
          userId: userId,
          chatId: chatId,
          chatTitle: chatTitle,
          projectId: projectId,
          rawUserText: userText,
          historyMessages: historyMessages,
          maxSingleMemoryLength: params.maxSingleMemoryLength,
          taskCreatedAt: turnCreatedAt,
          allowOverrideOlderTombstone: true,
          isExplicit: true
        });
        if (writeRes && writeRes.needsClarification) {
          await store.updateMemoryTask(task.id, {
            status: 'skipped',
            attempts: 1,
            memoryWritten: false,
            resultSummary: '内容不明确，已提示用户补充说明'
          });
          return {
            isExplicit: true,
            intent: 'clarify',
            saved: false,
            needsClarification: true,
            clarificationMessage: writeRes.clarificationMessage,
            capabilityNotice: capCheck.capabilityNotice,
            added: [],
            updated: [],
            deleted: []
          };
        }
      }

      var added = (writeRes && writeRes.added) || [];
      var updated = (writeRes && writeRes.updated) || [];
      var deletedFromUpdate = (writeRes && writeRes.deleted) || [];
      var savedIds = added.concat(updated).map(function(m) { return m && m.id; }).filter(Boolean);
      var hasWritten = savedIds.length > 0;

      if (hasWritten || deletedFromUpdate.length > 0) {
        var okMsg = deletedFromUpdate.length > 0
          ? ('已删除 ' + deletedFromUpdate.length + ' 条长期记忆')
          : ('明确指令已写入 ' + savedIds.length + ' 条长期记忆');
        var savedTask = await store.updateMemoryTask(task.id, {
          status: 'saved',
          attempts: 1,
          memoryWritten: hasWritten,
          savedMemoryIds: savedIds,
          lastError: '',
          resultSummary: okMsg
        });
        return {
          isExplicit: true,
          intent: fast.intent,
          saved: hasWritten,
          deletedCount: deletedFromUpdate.length,
          capabilityNotice: capCheck.capabilityNotice,
          added: added,
          updated: updated,
          deleted: deletedFromUpdate,
          savedIds: savedIds,
          task: savedTask
        };
      }

      var skipMsg = (writeRes && writeRes.blockedSecrets)
        ? '包含敏感信息，已安全拦截'
        : ((writeRes && writeRes.skipped) ? '长期记忆中已存在相同内容' : '未能从指令中提取到可保存的具体内容');
      var skipTask = await store.updateMemoryTask(task.id, {
        status: 'skipped',
        attempts: 1,
        memoryWritten: false,
        savedMemoryIds: [],
        lastError: '',
        resultSummary: skipMsg
      });
      return {
        isExplicit: true,
        intent: fast.intent,
        saved: false,
        alreadyExists: !!(writeRes && writeRes.skipped),
        reason: skipMsg,
        added: [],
        updated: [],
        deleted: [],
        task: skipTask
      };
    } catch (err) {
      var errMsg = sanitizeErrorForLog(err);
      var failedTask = await store.updateMemoryTask(task.id, {
        status: 'failed',
        attempts: 1,
        memoryWritten: false,
        savedMemoryIds: [],
        lastError: errMsg,
        resultSummary: '明确记忆操作失败'
      });
      return {
        isExplicit: true,
        intent: fast.intent,
        saved: false,
        error: errMsg,
        added: [],
        updated: [],
        deleted: [],
        task: failedTask
      };
    }
  }

  // ===== 8. 方式 B：AI 主动长期记忆（轻量筛选 + 价值评估 + 高确定性结构化提取 + 去重更新） =====
  function isPureGreetingOrFiller(text) {
    var trimmed = String(text || '').trim();
    if (/^(?:你好|您好|hi+|hello+|hey|在吗|在不在|早上好|早安|中午好|下午好|晚上好|晚安|谢谢|感谢|多谢|好的|好吧|好呀|好滴|嗯+|嗯嗯|哦+|行|行吧|可以|没问题|收到|明白|知道了|了解|哈哈+|呵呵|ok+|yes|no|bye|再见|拜拜)[！!。.~～\s]*$/i.test(trimmed)) {
      return true;
    }
    if (/^(?:你好|您好|hi+|hello+|早安|晚上好)[，,\s]*(?:今天怎么样|最近怎么样|过得怎么样|在忙什么|吃了吗|好久不见)[？?！!。.~～\s]*$/i.test(trimmed)) {
      return true;
    }
    return false;
  }

  function hasClearSelfFactCue(text) {
    return /(?:我|本人|我的).{0,14}(?:喜欢|最喜欢|偏爱|偏好|爱吃|爱喝|习惯|开始学|开始学习|正在学|在学|正在开发|在开发|正在做|在做|准备长期|准备学|打算|计划|决定|长期目标|不吃|忌口|过敏|住在|从事|职业是)/.test(String(text || ''));
  }

  function isClauseQuestion(cl) {
    var c = String(cl || '').trim();
    if (!c) return true;
    var bare = c.replace(/[？?！!。.~～]+$/, '').trim();
    if (hasClearSelfFactCue(bare)) {
      return false;
    }
    if (/[？?]$/.test(c)) return true;
    if (/(?:吗|呢|嘛)$/.test(bare)) return true;
    if (/(?:什么|哪个|哪些|哪里|哪儿|谁|几岁|几个|多少|怎么|如何|为什么|为何|是不是|能不能|可不可以|有没有|帮我推荐|推荐一款|推荐个|解释一下|什么是)/.test(bare)) {
      return true;
    }
    return false;
  }

  function isPureQuestionWithoutFact(text) {
    var trimmed = String(text || '').trim();
    if (!trimmed) return true;
    var clauses = trimmed.split(/[，,。；;！!\n]+/).map(function(s) { return s.trim(); }).filter(Boolean);
    if (!clauses.length) return true;

    for (var i = 0; i < clauses.length; i++) {
      var cl = clauses[i];
      if (!isClauseQuestion(cl) && !isPureGreetingOrFiller(cl) && cl.length >= 3) {
        return false;
      }
    }
    return true;
  }

  function containsJokeOrSarcasm(text) {
    var src = String(text || '').trim();
    if (!src) return false;
    return /(?:开玩笑|开个玩笑|逗你玩|逗你的|瞎说的|胡说的|吹牛|搞笑|狗头|\/s\b|骗你的|才怪|哪有那么多|哈哈哈哈)/.test(src);
  }

  function isGuessHypothesisOrThirdPartyQuote(text) {
    var src = String(text || '').trim();
    if (!src) return false;
    if (containsJokeOrSarcasm(src)) return true;

    // 明确假设/猜测语气
    if (/^(?:如果|假如|假设|万一|要是我|设想|比方说|比如我|试想|要是有一天|大概|也许|可能只是|说不定|随便说说|开玩笑地说)/.test(src)) {
      return true;
    }
    if (/(?:如果|假如|假设|万一).{0,30}(?:的话|怎么办|会怎样|岂不是|……|\.\.\.)/.test(src)) {
      return true;
    }
    // 明确引用他人/书本/网上内容，若不含本人转折对比则拦截
    if (/^(?:他|她|它|他们|她们|我朋友|朋友|我同事|同事|我同学|同学|我室友|室友|我闺蜜|闺蜜|我哥|我姐|我弟|我妹|我妈|我爸|我老公|我老婆|我对象|男朋友|女朋友|家人|老板|领导|客户|别人|大家|有人|网友|书里|小说里|文章里|老师|听说|据(?:说|了解|悉))/.test(src) &&
        !/(?:但我|不过我|我也|而我|我自己)(?:更|比较|最)?(?:喜欢|偏好|习惯|正在|打算|计划|决定|开始)/.test(src)) {
      return true;
    }
    return false;
  }

  function cleanHighCertaintyClauseTail(raw) {
    return String(raw || '')
      .replace(/^(?:的是|是|了|着|过)\s*/, '')
      .replace(/[了呀啊呢吧哦啦呗。！!]+$/, '')
      .trim();
  }

  function extractHighCertaintyFactCandidates(userText, maxLen) {
    var src = String(userText || '').trim();
    if (!src || src.length < 4) return [];
    if (containsSensitiveSecret(src) || containsHighRiskPrivacy(src)) return [];
    if (isPureGreetingOrFiller(src) || isPureQuestionWithoutFact(src)) return [];
    if (containsJokeOrSarcasm(src)) return [];

    // 整句纯假设且不包含实际转折事实时直接跳过
    if (/^(?:如果|假如|假设|万一|要是我|设想|比方说|比如我|试想|要是有一天)/.test(src)) return [];
    if (/(?:如果|假如|假设|万一).{0,30}(?:的话|怎么办|会怎样|岂不是|……|\.\.\.)/.test(src) && !/(?:但我|其实我|我现在)/.test(src)) {
      return [];
    }

    var limit = Math.max(60, Number(maxLen) || DEFAULT_MAX_MEM_LENGTH);
    var out = [];
    var seen = new Set();

    function pushCandidate(content, category, importance, extra) {
      var text = String(content || '').replace(/[。！!]+$/, '').trim();
      if (!text || text.length < 4) return;
      if (text.length > limit) text = text.slice(0, limit);
      var norm = normalizeMemoryText(text);
      var ex = extra && typeof extra === 'object' ? extra : {};
      var dedupKey = norm + '|' + (ex.status || 'active') + '|' + (ex.temporalState || 'current');
      if (!norm || seen.has(dedupKey)) return;
      seen.add(dedupKey);
      out.push(Object.assign({
        intent: ex.action === 'update' ? 'update' : 'save',
        action: ex.action || 'add',
        shouldSave: true,
        aboutUser: true,
        isDurable: true,
        factType: 'direct_fact',
        factSource: 'user_statement',
        temporalState: 'current',
        status: 'active',
        relation: 'new',
        targetSubject: '',
        confidence: 0.9,
        content: text,
        category: category,
        importance: importance || 4,
        scope: 'user',
        via: 'high_certainty_rule'
      }, ex));
    }

    // 先按整句提取跨分句语义转折（过去 vs 现在、原计划 vs 取消、已完成）
    var sentenceUnits = src.split(/[。；;！!\n]+/).map(function(s) { return s.trim(); }).filter(Boolean);
    var remainingClauses = [];

    for (var si = 0; si < sentenceUnits.length; si++) {
      var sent = sentenceUnits[si];
      if (!sent || sent.length < 4) continue;
      if (isGuessHypothesisOrThirdPartyQuote(sent) && !/(?:但我|不过我|我也|而我)/.test(sent)) continue;

      // Case B: 「我以前喜欢草莓，现在更喜欢芒果」/「之前爱喝美式，现在改喝拿铁」
      var mPastNow = sent.match(/^(?:我|本人)(?:以前|之前|曾经|过去|原本)(?:比较|最)?(喜欢|偏爱|偏好|爱吃|爱喝|习惯)([^，,；;]{1,28}?)[，,；;]+\s*(?:但|不过|可是|而)?(?:现在|如今|目前|后来)(?:我)?(?:也|其实)?(更喜欢|改喜欢|更爱吃|更爱喝|改喝|改吃|喜欢|偏爱|偏好|爱吃|爱喝|习惯)([^，,；;]{1,28})/);
      if (mPastNow && mPastNow[2] && mPastNow[4]) {
        var oldVerb = mPastNow[1];
        var oldObj = cleanHighCertaintyClauseTail(mPastNow[2]);
        var newVerb = mPastNow[3];
        var newObj = cleanHighCertaintyClauseTail(mPastNow[4]);
        if (oldObj && newObj && oldObj !== newObj) {
          pushCandidate('用户以前' + oldVerb + oldObj, inferMemoryCategoryFromText(oldVerb + oldObj), 2, {
            action: 'update',
            temporalState: 'past',
            status: 'historical',
            relation: 'status_changed',
            targetSubject: oldObj
          });
          pushCandidate('用户现在' + newVerb + newObj, inferMemoryCategoryFromText(newVerb + newObj), 5, {
            action: 'add',
            temporalState: 'current',
            status: 'active',
            relation: 'updated',
            targetSubject: oldObj
          });
          continue;
        }
      }

      // Case F: 「我原来准备学习法语，但现在取消了」/「之前打算考驾照，现在放弃了」
      var mCancel = sent.match(/^(?:我|本人)(?:原来|本来|之前|原本|先前)(?:准备|打算|计划|想|想要)(?:长期)?([^，,；;]{2,36}?)[，,；;]+\s*(?:但|不过|但是|可是)?(?:现在|如今|目前|已经)?(?:取消了?|放弃了?|不打算了?|不学了?|不做了?|作罢了?|搁置了?)$/);
      if (mCancel && mCancel[1]) {
        var planTarget = cleanHighCertaintyClauseTail(mCancel[1]);
        if (planTarget) {
          pushCandidate('用户原计划' + planTarget + '，现已取消', inferMemoryCategoryFromText('计划' + planTarget), 2, {
            action: 'update',
            temporalState: 'cancelled',
            status: 'cancelled',
            relation: 'status_changed',
            targetSubject: planTarget
          });
          continue;
        }
      }

      // 已完成事项：「我之前计划的XX已经完成了」
      var mDone = sent.match(/^(?:我|本人)(?:之前|原本|原来)?(?:准备|打算|计划)的?([^，,；;]{2,36}?)[，,；;]*?(?:已经|现已)(?:完成了?|考完了?|通过了?|做完了?|搞定了?)$/);
      if (mDone && mDone[1]) {
        var doneTarget = cleanHighCertaintyClauseTail(mDone[1]);
        if (doneTarget) {
          pushCandidate('用户已完成原计划：' + doneTarget, inferMemoryCategoryFromText('计划' + doneTarget), 2, {
            action: 'update',
            temporalState: 'completed',
            status: 'completed',
            relation: 'status_changed',
            targetSubject: doneTarget
          });
          continue;
        }
      }

      // 否则按逗号拆成多个独立子句处理（支持多事实提取：如「我正在开发知屿，最近还开始学习日语」）
      var subClauses = sent.split(/[，,]+/).map(function(x) { return x.trim(); }).filter(Boolean);
      var sentHasSelf = /^(?:我|本人)/.test(sent) || /(?:但我|不过我|而我|我也)/.test(sent);
      for (var sc = 0; sc < subClauses.length; sc++) {
        remainingClauses.push({ text: subClauses[sc], sentHasSelf: sentHasSelf });
      }
    }

    for (var i = 0; i < remainingClauses.length; i++) {
      var entry = remainingClauses[i];
      var cl = entry.text;
      if (!cl || cl.length < 4) continue;

      // 剥离“但我/不过我/而我”转折连接词
      cl = cl.replace(/^(?:但|不过|可是|而)(?=(?:我|本人))/, '').trim();
      if (isClauseQuestion(cl) || isGuessHypothesisOrThirdPartyQuote(cl)) continue;

      // 若同一句前文主语是“我”，后续子句省略“我”（如「最近还开始学习日语」「同时也在准备考研」），补回“我”
      var hasThirdPartyPrefix = /^(?:他|她|它|我朋友|朋友|同事|同学|室友|闺蜜|我妈|我爸|家人|老板|别人|网友|老师|客户)/.test(cl);
      if (entry.sentHasSelf && !hasThirdPartyPrefix && !/^(?:我|本人)/.test(cl)) {
        var normSub = cl
          .replace(/^(?:并且|而且|同时|此外|另外|然后|以及)\s*/, '')
          .replace(/^(最近|目前|现在|以后|今后|往后|平时|一直|本来|原来)\s*(?:还|也)\s*/, '$1')
          .replace(/^(?:还|也)\s*(?=(?:在|正在|开始|准备|打算|计划|决定|喜欢|偏爱|偏好|爱吃|爱喝|习惯|不吃|忌口|过敏))/, '')
          .trim();
        if (/^(?:最近|目前|现在|以后|今后|往后|平时|一直在|正在|开始|准备|打算|计划|决定|喜欢|偏爱|偏好|爱吃|爱喝|习惯|不吃|忌口|过敏)/.test(normSub)) {
          cl = '我' + normSub;
        }
      }

      // 1) 持续学习 / 开始学习 / 长期学习计划
      var mStartLearn = cl.match(/^(?:我|本人)(?:最近|刚刚|刚|现在|这几天|这阵子)?(?:开始)(?:学习|学)([^，,。；;！!\n]{1,36})/);
      if (mStartLearn && mStartLearn[1]) {
        var subj1 = cleanHighCertaintyClauseTail(mStartLearn[1]);
        if (subj1 && !/^(?:怎么|什么|如何)/.test(subj1)) {
          pushCandidate('用户最近开始学习' + subj1, '长期计划', 4, { temporalState: 'current', status: 'active' });
          continue;
        }
      }

      var mLongLearn = cl.match(/^(?:我|本人)(?:以后|今后|往后|接下来|未来|目前)?(?:准备|打算|计划|决定|想要|要)(?:长期|持续)?(?:学习|学|进修|备考|练习)([^，,。；;！!\n]{1,36})/);
      if (mLongLearn && mLongLearn[1]) {
        var subj2 = cleanHighCertaintyClauseTail(mLongLearn[1]);
        if (subj2 && !/^(?:怎么|什么|如何)/.test(subj2)) {
          var hasLongPrefix = /以后|长期|今后|往后/.test(cl);
          pushCandidate(hasLongPrefix ? ('用户以后准备长期学习' + subj2) : ('用户计划学习' + subj2), '长期计划', 4, {
            temporalState: 'future_plan',
            status: 'active',
            targetSubject: '学习' + subj2
          });
          continue;
        }
      }

      var mOngoingLearn = cl.match(/^(?:我|本人)(?:一直在|正在|每天都在)(?:学习|学|练习)([^，,。；;！!\n]{1,36})/);
      if (mOngoingLearn && mOngoingLearn[1]) {
        var subj3 = cleanHighCertaintyClauseTail(mOngoingLearn[1]);
        if (subj3) {
          pushCandidate('用户正在持续学习' + subj3, '长期计划', 4, { temporalState: 'current', status: 'active' });
          continue;
        }
      }

      // 2) 正在进行的项目（支持「我正在开发知屿」等直接项目名）
      var mProject = cl.match(/^(?:我|本人)(?:目前|现在|最近)?(?:正在|在)(?:开发|制作|研发|搭建|编写|筹备|推进)([^，,。；;！!\n]{2,48})/);
      if (mProject && mProject[1]) {
        var projTail = cleanHighCertaintyClauseTail(mProject[1]);
        if (projTail && projTail.length >= 2 && !/(?:什么|哪个|怎么|如何|问题|报错|bug)/i.test(projTail)) {
          var verbMatch = cl.match(/(开发|制作|研发|搭建|编写|筹备|推进)/);
          var verb = verbMatch ? verbMatch[1] : '开发';
          pushCandidate('用户正在' + verb + projTail, '项目', 4, { temporalState: 'current', status: 'active' });
          continue;
        }
      }

      // 3) 长期偏好与习惯（回答风格、饮食偏好、常用工具等）
      var mPref = cl.match(/^(?:我|本人)(?:平时|一般|通常|向来|一直|现在)?(?:比较|更|最)?(?:喜欢|偏爱|偏好|爱吃|爱喝|习惯|倾向于|改喝|改吃)([^，,。；;！!\n]{2,45})/);
      if (mPref && mPref[1] && !/(?:今天|昨天|刚才|那部|那个电影|这首)/.test(cl)) {
        var prefFull = convertFirstPersonToThirdPerson(cl.replace(/[。！!]+$/, ''));
        var prefCat = /平时|每天|每晚|作息|早起|熬夜/.test(cl) && !/喜欢|偏爱|偏好/.test(cl) ? '习惯' : '偏好';
        pushCandidate(prefFull, prefCat, 4, { temporalState: 'current', status: 'active' });
        continue;
      }

      // 4) 忌口 / 过敏 / 长期不吃不喝
      var mAvoid = cl.match(/^(?:我|本人)(?:平时|向来|一直)?(?:不吃|忌口|过敏|讨厌|不爱吃|不爱喝|不喜欢吃|不喜欢喝)([^，,。；;！!\n]{1,32})/);
      if (mAvoid && mAvoid[1]) {
        pushCandidate(convertFirstPersonToThirdPerson(cl.replace(/[。！!]+$/, '')), '偏好', 4, { temporalState: 'current', status: 'active' });
        continue;
      }

      // 5) 长期目标 / 重要决定
      var mGoal = cl.match(/^(?:我|本人)(?:的长期目标是|长期目标是|已经决定|决定以后|计划以后|打算以后)([^，,。；;！!\n]{2,45})/);
      if (mGoal && mGoal[1]) {
        var goalText = convertFirstPersonToThirdPerson(cl.replace(/[。！!]+$/, ''));
        pushCandidate(goalText, /决定/.test(cl) ? '决定' : '长期计划', 4, {
          temporalState: /决定/.test(cl) ? 'current' : 'future_plan',
          status: 'active'
        });
      }
    }

    return out;
  }

  function analyzeMemoryCandidate(userText) {
    var text = String(userText || '').trim();
    if (text.length < 3) return { shouldExtract: false, reason: 'too_short', label: '内容过短（不足3字）' };

    if (containsSensitiveSecret(text)) {
      return { shouldExtract: false, blockedSecret: true, reason: 'sensitive_secret', label: '包含密码/密钥/验证码等敏感信息，已安全拦截' };
    }

    if (containsHighRiskPrivacy(text)) {
      return { shouldExtract: false, blockedPrivacy: true, reason: 'high_risk_privacy', label: '包含高度敏感个人隐私，未经明确许可不自动保存' };
    }

    if (isPureGreetingOrFiller(text)) {
      return { shouldExtract: false, reason: 'greeting_or_filler', label: '普通寒暄或客套语，无需保存' };
    }

    if (isPureQuestionWithoutFact(text)) {
      return { shouldExtract: false, reason: 'pure_question', label: '一次性提问且无用户长期事实，无需保存' };
    }

    if (containsJokeOrSarcasm(text)) {
      return { shouldExtract: false, reason: 'joke_or_sarcasm', label: '属于玩笑或反讽表达，不作为长期记忆保存' };
    }

    if (isGuessHypothesisOrThirdPartyQuote(text)) {
      return { shouldExtract: false, reason: 'guess_or_quote', label: '属于猜测、假设或引用他人内容，不作为本人长期记忆保存' };
    }

    var fast = detectMemoryIntentFast(text);
    if (fast.matched) {
      return { shouldExtract: true, reason: 'explicit_' + fast.intent, label: '命中明确记忆指令' };
    }

    var highCert = extractHighCertaintyFactCandidates(text);
    if (highCert.length > 0) {
      return { shouldExtract: true, reason: 'high_certainty_fact', label: '命中高确定性长期用户事实候选' };
    }

    return { shouldExtract: true, reason: 'natural_statement', label: '包含自然陈述，进入模型语义价值判断' };
  }

  function shouldAttemptExtraction(userText) {
    return analyzeMemoryCandidate(userText).shouldExtract;
  }

  function extractPreferenceSubjectSlot(content) {
    var src = String(content || '').trim();
    var m = src.match(/(?:最喜欢的|最爱吃的|最爱喝的|最爱的|最常喝的|最常吃的|最常用的|偏好的|喜欢的|爱吃的|爱喝的)([\u4e00-\u9fa5A-Za-z0-9]{1,8}?)(?:现在|目前|其实|已经)?(?:是|为|有|改成|改为|换成)/);
    if (m && m[1]) {
      return 'pref_subject:' + m[1].toLowerCase();
    }
    return '';
  }

  function extractPlanOrProjectSlot(content) {
    var src = String(content || '').trim();
    var mPlan = src.match(/(?:原计划|计划|打算|准备|开始|持续|已完成原计划：?)(?:长期)?(学习|学|考|推进|开发|筹备)?([\u4e00-\u9fa5A-Za-z0-9_+#-]{2,20}?)(?:，现已取消|已完成|$)/);
    if (mPlan && mPlan[2]) {
      return 'plan_slot:' + String((mPlan[1] || '') + mPlan[2]).toLowerCase();
    }
    var mProj = src.match(/(?:正在|推进|开发|制作|研发)(?:项目[「:]?)?([\u4e00-\u9fa5A-Za-z0-9_+#-]{2,20}?)(?:[」]|（|$)/);
    if (mProj && mProj[1]) {
      return 'project_slot:' + mProj[1].toLowerCase();
    }
    return '';
  }

  function detectMutualSlot(content, category) {
    var dynSlot = extractPreferenceSubjectSlot(content);
    if (dynSlot) return dynSlot;

    var planSlot = extractPlanOrProjectSlot(content);
    if (planSlot) return planSlot;

    var lower = String(content || '').toLowerCase();
    for (var i = 0; i < MUTUAL_SLOTS.length; i++) {
      var slot = MUTUAL_SLOTS[i];
      if (slot.category && category && category !== slot.category && slot.category !== '身份信息') continue;
      for (var c = 0; c < slot.cues.length; c++) {
        if (lower.indexOf(slot.cues[c]) !== -1) {
          return slot.name;
        }
      }
    }
    return '';
  }

  function findContradictionOrMergeTarget(content, category, sameScopeMemories, rawUserText, itemMeta) {
    var meta = itemMeta && typeof itemMeta === 'object' ? itemMeta : {};
    var incomingStatus = String(meta.status || 'active').toLowerCase();
    var incomingTemporal = String(meta.temporalState || 'current').toLowerCase();
    var targetSubject = String(meta.targetSubject || '').trim();
    var slot = detectMutualSlot(content, category);
    var hasChangeCue = /(?:改成|改为|换成|换喝|改喝|改吃|不再|以前.*现在|转成|其实更喜欢|现在更喜欢|以后我更喜欢|平时更喜欢|更偏向|取消了?|放弃了?|不学了?|完成了?)/.test(String(content || '') + ' ' + String(rawUserText || ''));

    // 1) 若携带明确的变更主题（如“草莓”或“学习法语”）且意图为转历史/取消/完成，优先匹配尚未处于相同终态的同名记忆
    if (targetSubject) {
      var subjNorm = normalizeMemoryText(targetSubject);
      var subjMatches = sameScopeMemories.filter(function(m) {
        var mNorm = normalizeMemoryText(m.content);
        if (!subjNorm || mNorm.indexOf(subjNorm) === -1) return false;
        if (incomingStatus !== 'active') return true;
        return (m.status || 'active') === 'active';
      });
      if (subjMatches.length > 0 && (incomingStatus !== 'active' || incomingTemporal !== 'current' || normalizeMemoryText(content).indexOf(subjNorm) !== -1)) {
        subjMatches.sort(function(a, b) {
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        return subjMatches[0];
      }
    }

    // 2) 若当前新条目是 active，不主动覆盖已经标为 historical/cancelled/completed 的历史记录
    var candidatePool = incomingStatus === 'active'
      ? sameScopeMemories.filter(function(m) { return !m.status || m.status === 'active'; })
      : sameScopeMemories;

    if (slot) {
      var slotMatches = candidatePool.filter(function(m) {
        return detectMutualSlot(m.content, m.category) === slot;
      });
      if (slotMatches.length > 0) {
        slotMatches.sort(function(a, b) {
          var sa = computeTextSimilarity(content, a.content);
          var sb = computeTextSimilarity(content, b.content);
          if (Math.abs(sb - sa) > 0.05) return sb - sa;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        if (
          hasChangeCue ||
          slot.indexOf('pref_subject:') === 0 ||
          slot.indexOf('plan_slot:') === 0 ||
          slot === 'coffee_drink' ||
          slot === 'reply_style' ||
          slot === 'user_location' ||
          slot === 'user_name'
        ) {
          return slotMatches[0];
        }
      }
    }

    var bestSim = 0;
    var bestTarget = null;
    for (var j = 0; j < candidatePool.length; j++) {
      var sim = computeTextSimilarity(content, candidatePool[j].content);
      if (sim > bestSim) {
        bestSim = sim;
        if (sim >= 0.62) {
          bestTarget = candidatePool[j];
        }
      }
    }
    return bestTarget;
  }

  async function upsertExtractedMemories(candidates, context) {
    var store = S();
    if (!store) return { added: [], updated: [], skipped: 0, blockedSecrets: 0, blockedDeleted: 0 };

    var ctx = context && typeof context === 'object' ? context : {};
    var userId = String(ctx.userId || 'local_user').trim() || 'local_user';
    var chatId = String(ctx.chatId || '').trim();
    var chatTitle = String(ctx.chatTitle || '').trim();
    var projectId = String(ctx.projectId || '').trim();
    var rawUserText = String(ctx.rawUserText || '');
    var settings = await store.getMemorySettings();
    var params = resolveMemoryParams(settings);
    var maxLen = Math.max(60, Number(ctx.maxSingleMemoryLength) || params.maxSingleMemoryLength);
    var taskCreatedAt = Number(ctx.taskCreatedAt) || Date.now();

    var existingAll = await store.listMemories({ userId: userId });
    var deletedSigs = typeof store.listDeletedMemorySignatures === 'function'
      ? await store.listDeletedMemorySignatures()
      : [];

    var added = [];
    var updated = [];
    var skipped = 0;
    var blockedSecrets = 0;
    var blockedDeleted = 0;
    var lastSupersededId = '';

    for (var i = 0; i < (Array.isArray(candidates) ? candidates.length : 0); i++) {
      var rawItem = candidates[i];
      if (!rawItem || typeof rawItem !== 'object') continue;
      if (rawItem.action === 'skip' || rawItem.intent === 'none' || rawItem.shouldSave === false) {
        skipped++;
        continue;
      }

      var content = String(rawItem.content || '').trim();
      if (!content || content.length < 2) {
        skipped++;
        continue;
      }
      if (content.length > maxLen) {
        content = content.slice(0, maxLen);
      }

      if (containsSensitiveSecret(content) || (!ctx.isExplicit && containsHighRiskPrivacy(content))) {
        blockedSecrets++;
        continue;
      }

      var hitSig = findBlockingDeletedSignature(content, deletedSigs);
      if (hitSig) {
        var canOverride = !!(ctx.allowOverrideOlderTombstone && taskCreatedAt > (hitSig.deletedAt || 0));
        if (!canOverride) {
          blockedDeleted++;
          continue;
        }
        if (typeof store.removeDeletedMemorySignatureByContent === 'function') {
          await store.removeDeletedMemorySignatureByContent(hitSig.content || content);
          deletedSigs = await store.listDeletedMemorySignatures();
        }
      }

      var scope = String(rawItem.scope || 'user').toLowerCase();
      if (scope !== 'user' && scope !== 'chat' && scope !== 'project') scope = 'user';
      if (scope === 'project' && !projectId) scope = 'user';

      var temporalState = normalizeItemTemporalState(rawItem.temporalState, rawItem.status);
      var memStatus = deriveItemStatus(rawItem.status, temporalState);
      var itemConf = normalizeParsedConfidence(rawItem.confidence, 0.85);
      var factSource = String(rawItem.factSource || 'user_statement').trim() || 'user_statement';

      var category = rawItem.category || inferMemoryCategoryFromText(content);
      var sameScopeMemories = existingAll.filter(function(m) {
        return m.scope === scope && (scope !== 'project' || m.projectId === projectId);
      });

      var matchedTarget = null;
      if ((rawItem.action === 'update' || rawItem.intent === 'update' || rawItem.intent === 'mark_historical') && rawItem.targetId) {
        matchedTarget = sameScopeMemories.find(function(m) { return m.id === rawItem.targetId; }) || null;
      }

      var normNew = normalizeMemoryText(content);
      var exactMatch = sameScopeMemories.find(function(m) {
        return normalizeMemoryText(m.content) === normNew &&
          (m.status || 'active') === memStatus &&
          (m.temporalState || 'current') === temporalState;
      });
      if (exactMatch) {
        if (memStatus !== 'active') lastSupersededId = exactMatch.id;
        skipped++;
        continue;
      }

      if (!matchedTarget) {
        matchedTarget = findContradictionOrMergeTarget(content, category, sameScopeMemories, rawUserText, {
          status: memStatus,
          temporalState: temporalState,
          targetSubject: rawItem.targetSubject || ''
        });
      }

      if (matchedTarget) {
        var updRelation = rawItem.relation || (memStatus !== 'active' ? 'status_changed' : 'updated');
        var upd = await store.updateMemory(matchedTarget.id, {
          content: content,
          category: category || matchedTarget.category,
          importance: rawItem.importance != null ? rawItem.importance : (memStatus !== 'active' ? 2 : matchedTarget.importance),
          sourceChatId: chatId || matchedTarget.sourceChatId,
          sourceChatTitle: chatTitle || matchedTarget.sourceChatTitle,
          confidence: itemConf,
          temporalState: temporalState,
          status: memStatus,
          factSource: factSource,
          relation: updRelation,
          supersedesId: rawItem.supersedesId || matchedTarget.supersedesId || ''
        });
        if (upd) {
          updated.push(upd);
          if (memStatus !== 'active') lastSupersededId = upd.id;
          for (var u = 0; u < existingAll.length; u++) {
            if (existingAll[u].id === upd.id) existingAll[u] = upd;
          }
        }
      } else {
        var linkedSupersedes = rawItem.supersedesId || (rawItem.relation === 'updated' && lastSupersededId ? lastSupersededId : '');
        var created = await store.createMemory({
          content: content,
          category: category,
          importance: rawItem.importance != null ? rawItem.importance : (memStatus !== 'active' ? 2 : 3),
          scope: scope,
          sourceChatId: chatId,
          sourceChatTitle: chatTitle,
          userId: userId,
          projectId: scope === 'project' ? projectId : '',
          confidence: itemConf,
          temporalState: temporalState,
          status: memStatus,
          factSource: factSource,
          relation: rawItem.relation || 'new',
          supersedesId: linkedSupersedes
        });
        if (created) {
          added.push(created);
          existingAll.unshift(created);
          if (memStatus !== 'active') lastSupersededId = created.id;
        }
      }
    }

    return {
      added: added,
      updated: updated,
      skipped: skipped,
      blockedSecrets: blockedSecrets,
      blockedDeleted: blockedDeleted
    };
  }

  function stripReasoningThinkTags(raw) {
    var s = String(raw || '').trim();
    s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
    if (/<think>/i.test(s)) {
      var closeIdx = s.toLowerCase().indexOf('</think>');
      if (closeIdx !== -1) s = s.slice(closeIdx + 8);
      else s = s.replace(/<think>[\s\S]*$/gi, '');
    }
    return s.trim();
  }

  function extractBalancedJsonSlice(src) {
    var text = stripReasoningThinkTags(src);
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
        if (depth === 0) {
          return text.slice(startIdx, i + 1);
        }
      }
    }
    return text.slice(startIdx);
  }

  function safeJsonParseWithRepair(slice) {
    if (!slice) return null;
    try {
      return JSON.parse(slice);
    } catch (_) {
      try {
        var repaired = String(slice)
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/[\u0000-\u0019]+/g, ' ');
        return JSON.parse(repaired);
      } catch (_2) {
        return null;
      }
    }
  }

  function parseExtractorJsonObject(rawText) {
    var slice = extractBalancedJsonSlice(rawText);
    var obj = safeJsonParseWithRepair(slice);
    if (obj) return obj;

    // 兜底：若前面有干扰碎片，尝试从最后一个 `{` 匹配完整 JSON
    var cleaned = stripReasoningThinkTags(rawText);
    var idx = cleaned.lastIndexOf('{');
    while (idx > 0) {
      var candidate = extractBalancedJsonSlice(cleaned.slice(idx));
      var parsed = safeJsonParseWithRepair(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
      idx = cleaned.lastIndexOf('{', idx - 1);
    }
    return null;
  }

  function parseExtractorJson(rawText) {
    var parsedRes = parseStructuredMemoryResponse(rawText);
    return parsedRes.items || [];
  }

  async function evaluateProactiveMemoryTurn(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var store = S();
    var ai = AI();
    if (!store || !ai || typeof ai.requestChatCompletion !== 'function') {
      throw new Error('模型或存储模块未就绪');
    }

    var userId = String(opts.userId || 'local_user').trim() || 'local_user';
    var existing = await store.listMemories({ userId: userId });
    var existingListText = existing.slice(0, 28).map(function(m) {
      var stTag = (m.status && m.status !== 'active') ? ('[' + m.status + '] ') : '';
      return '- id:' + m.id + ' | ' + stTag + '[' + m.category + '] ' + m.content;
    }).join('\n') || '（暂无已有记忆）';

    var historyContextText = buildHistoryContextText(opts.historyMessages);
    var historyBlock = historyContextText
      ? ('\n【近期聊天上下文（用于理解“刚才说的/之前说的/按这个来”等指代）】\n' + historyContextText + '\n')
      : '';

    var prompt =
      '你是知屿的「主动长期记忆深度语义评估器」。在普通聊天中，请理解用户话语中的多事实、指代关系、时间语义、事实变化与事实可信度。\n\n' +
      '【应该自动保存的高价值信息（务必独立拆解）】\n' +
      '1. 多事实提取：如果一句话包含多个信息（例如「我正在开发知屿，最近还开始学习日语」），必须在 memories 数组中分别输出多条，绝不遗漏或合并成一条。\n' +
      '2. 长期偏好与习惯（回答风格、饮食口味偏好、常用工具、作息习惯）。\n' +
      '3. 正在进行的项目（如正在开发知屿）、持续学习的内容（如开始学习日语）、重要长期计划与决定。\n' +
      '4. 上下文指代消解：如用户说「刚才说的那个项目/之前说的计划」，需从【近期聊天上下文】还原具体项目或计划名称写入 content（并标记 factSource="context_resolved"）。\n' +
      '5. 时间与状态变化识别：\n' +
      '   - 区分 temporalState("current"|"past"|"future_plan"|"completed"|"cancelled") 与 status("active"|"historical"|"completed"|"cancelled")。\n' +
      '   - 例如「我以前喜欢草莓，现在更喜欢芒果」应分别记录过去偏好（status="historical", temporalState="past"）和当前偏好（status="active", temporalState="current", relation="updated"）。\n' +
      '   - 例如「原来准备学习法语，但现在取消了」应更新原计划为 status="cancelled", temporalState="cancelled"（填入 targetId 或 targetSubject），不要保留为当前目标。\n\n' +
      '【绝不保存的内容（可信度与价值把关）】\n' +
      '1. 普通寒暄、一次性通用提问。\n' +
      '2. 假设、猜测（如「假如我明年搬去东京……」）、玩笑反讽、他人事实（如「我朋友喜欢喝冰美式」）、未经确认的推测（factType 标记为 hypothesis/guess/joke/third_party/quote/speculation，aboutUser 设为 false，shouldSave 设为 false）。\n' +
      '3. 密码、API Key、验证码、身份证/银行卡、病历隐私等敏感信息。\n' +
      '4. 与【已有记忆】完全重复且状态未变的内容。\n\n' +
      '【已有记忆】\n' + existingListText + '\n' +
      historyBlock + '\n' +
      '【本轮用户输入】\n' + String(opts.userText || '').slice(0, 1200) + '\n\n' +
      (opts.assistantText ? ('【本轮助手回复摘要】\n' + String(opts.assistantText).slice(0, 320) + '\n\n') : '') +
      '请只输出合法 JSON（不要多余解释）：\n' +
      '{"shouldSave":true,"intent":"save","factType":"direct_fact","aboutUser":true,"isDurable":true,"confidence":0.92,"memories":[{"intent":"save","targetId":"","targetSubject":"","content":"用户正在开发知屿","category":"项目","temporalState":"current","status":"active","factSource":"user_statement","relation":"new","importance":4,"confidence":0.92,"scope":"user"}]}';

    var res = await ai.requestChatCompletion({
      apiConfig: opts.apiConfig,
      temperature: 0.1,
      maxTokens: 2048,
      allowReasoningFallback: false,
      messages: [
        { role: 'system', content: '你是只输出合法 JSON 的深度语义记忆评估器。支持多事实拆解、时间状态(temporalState/status)、变更更新与严格过滤假设/玩笑/他人事实。' },
        { role: 'user', content: prompt }
      ]
    });

    var rawContent = String((res && res.content) || '').trim();
    if (!rawContent) {
      return { intent: 'none', shouldSave: false, items: [], rawEmpty: true };
    }
    var parsed = parseStructuredMemoryResponse(rawContent);
    return parsed;
  }

  async function extractAndSaveFromTurn(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var store = S();
    var diag = {
      enteredAutoJudgment: true,
      skipStage: '',
      skipReason: '',
      modelRequested: false,
      modelReturnedCandidates: false,
      candidateCount: 0,
      passedValueGate: false,
      candidateSource: 'none',
      dbWriteAttempted: false,
      dbWriteSucceeded: false,
      writtenCount: 0,
      writtenMemoryIds: []
    };

    if (!store) {
      diag.skipStage = 'no_store';
      diag.skipReason = '存储模块未就绪';
      return { added: [], updated: [], deleted: [], skipped: 0, blockedSecrets: 0, blockedDeleted: 0, diagnostics: diag };
    }

    var settings = await store.getMemorySettings();
    var params = resolveMemoryParams(settings);
    if (!params.useMemory) {
      diag.skipStage = 'setting_disabled';
      diag.skipReason = '长期记忆开关已关闭';
      return { added: [], updated: [], deleted: [], skipped: 0, blockedSecrets: 0, blockedDeleted: 0, disabledReason: 'useMemory_off', diagnostics: diag };
    }
    if (!opts.ignoreAutoMemoryToggle && !params.autoMemory) {
      diag.skipStage = 'setting_disabled';
      diag.skipReason = '自动记忆开关已关闭';
      return { added: [], updated: [], deleted: [], skipped: 0, blockedSecrets: 0, blockedDeleted: 0, disabledReason: 'autoMemory_off', diagnostics: diag };
    }

    var userText = String(opts.userText || '').trim();
    var capCheck = detectUnsupportedMonitoringOrReminderRequest(userText);
    var candidateCheck = analyzeMemoryCandidate(userText);
    if (candidateCheck.blockedSecret || candidateCheck.blockedPrivacy) {
      diag.skipStage = 'privacy_guard';
      diag.skipReason = candidateCheck.label || '敏感信息安全拦截';
      return { added: [], updated: [], deleted: [], skipped: 0, blockedSecrets: 1, blockedDeleted: 0, capabilityNotice: capCheck.capabilityNotice, diagnostics: diag };
    }
    if (!candidateCheck.shouldExtract && !opts.forceExtract) {
      diag.skipStage = 'lightweight_filter';
      diag.skipReason = candidateCheck.label || candidateCheck.reason || '轻量筛选未命中长期记忆价值';
      return { added: [], updated: [], deleted: [], skipped: 0, blockedSecrets: 0, blockedDeleted: 0, capabilityNotice: capCheck.capabilityNotice, diagnostics: diag };
    }

    var userId = String(opts.userId || 'local_user').trim() || 'local_user';
    var historyMsgs = Array.isArray(opts.historyMessages) ? opts.historyMessages : [];
    var highCertaintyItems = !opts.forceExtract
      ? extractHighCertaintyFactCandidates(userText, params.maxSingleMemoryLength)
      : [];

    if (!opts.forceExtract && highCertaintyItems.length === 0 && hasVagueContextReference(userText)) {
      var resolvedCtxItem = resolveContextReferenceFromHistory(userText, historyMsgs, params.maxSingleMemoryLength);
      if (resolvedCtxItem) {
        highCertaintyItems.push(resolvedCtxItem);
      }
    }

    var decision = null;
    var hasUsableApi = !!(
      AI() &&
      typeof AI().requestChatCompletion === 'function' &&
      opts.apiConfig &&
      (opts.apiConfig.url || opts.apiConfig.baseUrl) &&
      (opts.apiConfig.key || opts.apiConfig.apiKey) &&
      opts.apiConfig.model
    );

    if (opts.forceExtract) {
      if (!hasUsableApi) {
        throw new Error('模型或 API 未完整配置');
      }
      diag.modelRequested = true;
      decision = await requestSemanticMemoryJudgment({
        userText: userText,
        assistantText: opts.assistantText || '',
        historyMessages: historyMsgs,
        userId: userId,
        apiConfig: opts.apiConfig,
        intentHint: 'save'
      });
    } else if (hasUsableApi) {
      diag.modelRequested = true;
      decision = await evaluateProactiveMemoryTurn({
        userText: userText,
        assistantText: opts.assistantText || '',
        historyMessages: historyMsgs,
        userId: userId,
        apiConfig: opts.apiConfig
      });
    } else if (highCertaintyItems.length > 0) {
      decision = {
        intent: 'save',
        shouldSave: true,
        aboutUser: true,
        isDurable: true,
        factType: 'direct_fact',
        confidence: 0.9,
        items: highCertaintyItems
      };
      diag.candidateSource = 'high_certainty_rule';
    } else {
      throw new Error('API 未完整配置');
    }

    var llmItems = (decision && Array.isArray(decision.items)) ? decision.items.filter(function(it) {
      return it && it.intent !== 'none' && it.action !== 'skip' && it.shouldSave !== false && String(it.content || '').trim();
    }) : [];

    if (llmItems.length > 0) {
      diag.modelReturnedCandidates = true;
      diag.candidateCount = llmItems.length;
      if (diag.candidateSource === 'none') diag.candidateSource = 'llm';
    }

    var writeCtx = {
      userId: userId,
      chatId: opts.chatId || '',
      chatTitle: opts.chatTitle || '',
      projectId: opts.projectId || '',
      rawUserText: userText,
      historyMessages: historyMsgs,
      maxSingleMemoryLength: params.maxSingleMemoryLength,
      taskCreatedAt: opts.taskCreatedAt || Date.now(),
      allowOverrideOlderTombstone: !!opts.allowOverrideOlderTombstone,
      isExplicit: !!opts.forceExtract
    };

    var applyRes = await applyStructuredSemanticDecision(decision, writeCtx);

    // 若模型漏掉多事实中的部分高确定性条目（或因过度保守返回为空），在不违背可信度与置信度判定前提下补全未覆盖的高确定性事实
    var decisionRejectedCredibility = !!(
      (applyRes && applyRes.rejectedByValueGate > 0) ||
      (decision && (
        decision.aboutUser === false ||
        (decision.confidence != null && decision.confidence < 0.60) ||
        ['guess', 'hypothesis', 'joke', 'sarcasm', 'third_party', 'quote', 'speculation'].indexOf(String(decision.factType || '').toLowerCase()) !== -1
      ))
    );
    if (!opts.forceExtract && !applyRes.blockedSecrets && !applyRes.blockedDeleted && highCertaintyItems.length > 0 && !decisionRejectedCredibility) {
      var savedCombined = (applyRes.added || []).concat(applyRes.updated || []);
      var missingRuleItems = highCertaintyItems.filter(function(hc) {
        return !savedCombined.some(function(sm) {
          if (!sm || !sm.content) return false;
          var sameStatus = (sm.status || 'active') === (hc.status || 'active');
          return sameStatus && computeTextSimilarity(sm.content, hc.content) >= 0.52;
        });
      });

      if (missingRuleItems.length > 0 && (savedCombined.length === 0 || missingRuleItems.length < highCertaintyItems.length || llmItems.length < highCertaintyItems.length)) {
        var ruleDecision = {
          intent: 'save',
          shouldSave: true,
          aboutUser: true,
          isDurable: true,
          factType: 'direct_fact',
          confidence: 0.9,
          items: missingRuleItems
        };
        var ruleApply = await applyStructuredSemanticDecision(ruleDecision, writeCtx);
        var ruleChanged = (ruleApply.added ? ruleApply.added.length : 0) + (ruleApply.updated ? ruleApply.updated.length : 0);
        if (ruleChanged > 0 || (savedCombined.length === 0 && (ruleApply.skipped > 0 || ruleApply.blockedDeleted > 0 || ruleApply.blockedSecrets > 0))) {
          applyRes.added = (applyRes.added || []).concat(ruleApply.added || []);
          applyRes.updated = (applyRes.updated || []).concat(ruleApply.updated || []);
          applyRes.skipped = (applyRes.skipped || 0) + (ruleApply.skipped || 0);
          applyRes.blockedDeleted = (applyRes.blockedDeleted || 0) + (ruleApply.blockedDeleted || 0);
          applyRes.blockedSecrets = (applyRes.blockedSecrets || 0) + (ruleApply.blockedSecrets || 0);
          diag.candidateSource = savedCombined.length > 0 ? 'llm+rule' : 'high_certainty_rule';
          diag.candidateCount = Math.max(diag.candidateCount, highCertaintyItems.length);
        }
      }
    }

    var finalAdded = applyRes.added || [];
    var finalUpdated = applyRes.updated || [];
    var writtenIds = finalAdded.concat(finalUpdated).map(function(m) { return m && m.id; }).filter(Boolean);
    var hasPassedCandidates = writtenIds.length > 0 || (applyRes.skipped > 0 && !applyRes.rejectedByValueGate && (diag.candidateCount > 0 || highCertaintyItems.length > 0));

    diag.passedValueGate = hasPassedCandidates;
    diag.dbWriteAttempted = writtenIds.length > 0;
    diag.dbWriteSucceeded = writtenIds.length > 0;
    diag.writtenCount = writtenIds.length;
    diag.writtenMemoryIds = writtenIds;

    if (writtenIds.length === 0) {
      if (applyRes.blockedSecrets) {
        diag.skipStage = 'privacy_guard';
        diag.skipReason = '包含敏感或高风险隐私信息，已拦截';
      } else if (applyRes.blockedDeleted) {
        diag.skipStage = 'tombstone_guard';
        diag.skipReason = '命中已删除记忆墓碑，防止旧任务复活';
      } else if (applyRes.rejectedByValueGate) {
        diag.skipStage = 'value_gate';
        diag.skipReason = applyRes.valueRejectReason || '未达到长期记忆价值/置信度条件';
      } else if (applyRes.skipped > 0) {
        diag.skipStage = 'deduplicate';
        diag.skipReason = '已有相同长期记忆，自动去重跳过';
      } else {
        diag.skipStage = 'model_none';
        diag.skipReason = '模型判断本轮无值得长期保存的信息';
      }
    }

    applyRes.capabilityNotice = capCheck.capabilityNotice;
    applyRes.diagnostics = diag;
    return applyRes;
  }

  // ===== 9. 持久化后台任务队列（自动提取 + 短期摘要 + 7步诊断审计 + 失败自动重试） =====
  function notifyMemoryQueueUpdated(summary) {
    try {
      if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent('aiw:memory-queue-updated', { detail: summary || {} }));
      }
    } catch (_) {}
  }

  function scheduleRetryTimer(apiConfig) {
    if (_retryTimer) {
      clearTimeout(_retryTimer);
      _retryTimer = null;
    }
    var store = S();
    if (!store || typeof store.listMemoryTasks !== 'function') return;
    store.listMemoryTasks().then(function(tasks) {
      var now = Date.now();
      var soonest = 0;
      for (var i = 0; i < tasks.length; i++) {
        var t = tasks[i];
        if (!t || t.status !== 'retry_waiting' || (t.attempts || 0) >= (t.maxAttempts || 3)) continue;
        var due = Number(t.nextRetryAt) || (now + 5000);
        if (!soonest || due < soonest) soonest = due;
      }
      if (!soonest) return;
      var delay = Math.max(500, Math.min(60000, soonest - now + 200));
      _retryTimer = setTimeout(function() {
        _retryTimer = null;
        processMemoryTaskQueue(apiConfig).then(function(res) {
          notifyMemoryQueueUpdated(res);
        }).catch(function() {});
      }, delay);
    }).catch(function() {});
  }

  async function enqueueTurnMemoryTasks(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var store = S();
    if (!store || typeof store.enqueueMemoryTask !== 'function') return [];

    var settings = await store.getMemorySettings();
    var params = resolveMemoryParams(settings);
    var queued = [];

    if (!opts.skipAutoMemory) {
      var userText = String(opts.userText || '').trim();
      var turnKey = 'ext:' + String(opts.chatId || '') + ':' + String(opts.userMsgId || Date.now());
      var compactHist = Array.isArray(opts.historyMessages)
        ? opts.historyMessages.slice(-4).map(function(m) {
            return { role: m.role, content: String(m.content || '').slice(0, 180) };
          })
        : [];

      if (!params.useMemory || !params.autoMemory) {
        var disabledReason = !params.useMemory ? '长期记忆已关闭' : '自动记忆已关闭';
        var disabledTask = await store.enqueueMemoryTask({
          type: 'extract_memory',
          turnKey: turnKey,
          chatId: opts.chatId || '',
          chatTitle: opts.chatTitle || '',
          projectId: opts.projectId || '',
          userId: opts.userId || 'local_user',
          status: 'skipped',
          attempts: 0,
          memoryWritten: false,
          savedMemoryIds: [],
          resultSummary: disabledReason + '，跳过自动提取',
          diagnostics: {
            enteredAutoJudgment: false,
            skipStage: 'setting_disabled',
            skipReason: disabledReason,
            modelRequested: false,
            modelReturnedCandidates: false,
            candidateCount: 0,
            passedValueGate: false,
            candidateSource: 'none',
            dbWriteAttempted: false,
            dbWriteSucceeded: false,
            writtenCount: 0,
            writtenMemoryIds: []
          },
          payload: { userText: userText.slice(0, 300) }
        });
        queued.push(disabledTask);
      } else {
        var check = analyzeMemoryCandidate(userText);
        if (!check.shouldExtract || check.blockedSecret || check.blockedPrivacy) {
          var filterSkipTask = await store.enqueueMemoryTask({
            type: 'extract_memory',
            turnKey: turnKey,
            chatId: opts.chatId || '',
            chatTitle: opts.chatTitle || '',
            projectId: opts.projectId || '',
            userId: opts.userId || 'local_user',
            status: 'skipped',
            attempts: 0,
            memoryWritten: false,
            savedMemoryIds: [],
            resultSummary: check.label || '轻量筛选跳过，未写入记忆',
            diagnostics: {
              enteredAutoJudgment: true,
              skipStage: (check.blockedSecret || check.blockedPrivacy) ? 'privacy_guard' : 'lightweight_filter',
              skipReason: check.label || check.reason || '未命中提取条件',
              modelRequested: false,
              modelReturnedCandidates: false,
              candidateCount: 0,
              passedValueGate: false,
              candidateSource: 'none',
              dbWriteAttempted: false,
              dbWriteSucceeded: false,
              writtenCount: 0,
              writtenMemoryIds: []
            },
            payload: { userText: (check.blockedSecret || check.blockedPrivacy) ? '[已脱敏]' : userText.slice(0, 300) }
          });
          queued.push(filterSkipTask);
        } else {
          var userId = opts.userId || 'local_user';
          var thirdNorm = normalizeMemoryText(convertFirstPersonToThirdPerson(userText));
          var existingMems = typeof store.listMemories === 'function' ? await store.listMemories({ userId: userId }) : [];
          var alreadyInMem = existingMems.some(function(m) {
            return m && normalizeMemoryText(m.content) === thirdNorm;
          });

          var recentTasks = typeof store.listMemoryTasks === 'function' ? await store.listMemoryTasks() : [];
          var rawNorm = normalizeMemoryText(userText);
          var nowTs = Date.now();
          var dupRecent = recentTasks.slice(0, 12).some(function(t) {
            if (!t || t.chatId !== (opts.chatId || '') || !t.payload) return false;
            if (normalizeMemoryText(t.payload.userText) !== rawNorm) return false;
            if (t.status === 'pending' || t.status === 'running') return true;
            if (t.status === 'saved' && (alreadyInMem || (nowTs - (t.createdAt || 0)) < 30000)) return true;
            return false;
          });

          if (alreadyInMem || dupRecent) {
            var dupTask = await store.enqueueMemoryTask({
              type: 'extract_memory',
              turnKey: turnKey,
              chatId: opts.chatId || '',
              chatTitle: opts.chatTitle || '',
              projectId: opts.projectId || '',
              userId: userId,
              status: 'skipped',
              attempts: 0,
              memoryWritten: false,
              savedMemoryIds: [],
              resultSummary: '长期记忆中已存在相同内容，自动去重跳过',
              diagnostics: {
                enteredAutoJudgment: true,
                skipStage: 'deduplicate',
                skipReason: alreadyInMem ? '记忆库已存在相同内容' : '同会话短时间内已处理相同内容',
                modelRequested: false,
                modelReturnedCandidates: false,
                candidateCount: 0,
                passedValueGate: false,
                candidateSource: 'none',
                dbWriteAttempted: false,
                dbWriteSucceeded: false,
                writtenCount: 0,
                writtenMemoryIds: []
              },
              payload: { userText: userText.slice(0, 300) }
            });
            queued.push(dupTask);
          } else {
            var extTask = await store.enqueueMemoryTask({
              type: 'extract_memory',
              turnKey: turnKey,
              chatId: opts.chatId || '',
              chatTitle: opts.chatTitle || '',
              projectId: opts.projectId || '',
              userId: userId,
              status: 'pending',
              memoryWritten: false,
              savedMemoryIds: [],
              diagnostics: {
                enteredAutoJudgment: true,
                skipStage: '',
                skipReason: '',
                modelRequested: false,
                modelReturnedCandidates: false,
                candidateCount: 0,
                passedValueGate: false,
                candidateSource: 'none',
                dbWriteAttempted: false,
                dbWriteSucceeded: false,
                writtenCount: 0,
                writtenMemoryIds: []
              },
              payload: {
                userText: userText.slice(0, 1500),
                assistantText: String(opts.assistantText || '').slice(0, 700),
                historyMessages: compactHist
              }
            });
            queued.push(extTask);
          }
        }
      }
    }

    if (params.shortTermContext && opts.chatId && typeof store.getChat === 'function') {
      var chat = await store.getChat(opts.chatId);
      if (needsShortTermSummary(chat, params)) {
        var sumTarget = Math.max(0, chat.messages.length - params.recentRawMessagesLimit);
        var sumTask = await store.enqueueMemoryTask({
          type: 'summarize_chat',
          turnKey: 'sum:' + String(opts.chatId) + ':' + String(sumTarget),
          chatId: opts.chatId,
          chatTitle: chat.title || opts.chatTitle || '',
          projectId: chat.projectId || opts.projectId || '',
          userId: opts.userId || 'local_user',
          status: 'pending',
          memoryWritten: false,
          savedMemoryIds: [],
          payload: { targetUpTo: sumTarget }
        });
        queued.push(sumTask);
      }
    }

    return queued;
  }

  async function processMemoryTaskQueue(apiConfig, options) {
    var store = S();
    if (!store || typeof store.listMemoryTasks !== 'function') {
      return { addedCount: 0, updatedCount: 0, deletedCount: 0, summarizedChats: [], failedTasks: [], processed: 0 };
    }
    if (_queueRunning) {
      _queueRerunRequested = true;
      return { busy: true, addedCount: 0, updatedCount: 0, deletedCount: 0, summarizedChats: [], failedTasks: [], processed: 0 };
    }

    _queueRunning = true;
    var addedCount = 0;
    var updatedCount = 0;
    var deletedCount = 0;
    var summarizedChats = [];
    var failedTasks = [];
    var processed = 0;
    var hasRetryWaiting = false;
    var opts = options && typeof options === 'object' ? options : {};

    try {
      var effectiveApi = apiConfig;
      if (!effectiveApi && AI() && typeof AI().resolveEffectiveApiConfig === 'function') {
        effectiveApi = await AI().resolveEffectiveApiConfig();
      }
      var now = Date.now();
      var tasks = await store.listMemoryTasks();
      var runnable = tasks.filter(function(t) {
        if (!t) return false;
        if (t.status === 'pending' || t.status === 'running') return true;
        if ((t.status === 'retry_waiting' || t.status === 'failed') && (t.attempts || 0) < (t.maxAttempts || 3)) {
          return opts.ignoreBackoff || now >= (t.nextRetryAt || 0);
        }
        return false;
      }).sort(function(a, b) {
        return (a.createdAt || 0) - (b.createdAt || 0);
      });

      for (var i = 0; i < runnable.length; i++) {
        var task = runnable[i];
        await store.updateMemoryTask(task.id, { status: 'running' });

        try {
          if (task.type === 'extract_memory' || task.type === 'explicit_memory' || task.type === 'explicit_update') {
            var isExplicitTask = task.type === 'explicit_memory' || task.type === 'explicit_update';
            var res = await extractAndSaveFromTurn({
              userText: task.payload && task.payload.userText,
              assistantText: task.payload && task.payload.assistantText,
              historyMessages: (task.payload && task.payload.historyMessages) || [],
              chatId: task.chatId,
              chatTitle: task.chatTitle,
              projectId: task.projectId,
              userId: task.userId || 'local_user',
              apiConfig: effectiveApi,
              forceExtract: isExplicitTask,
              ignoreAutoMemoryToggle: isExplicitTask,
              taskCreatedAt: task.createdAt || Date.now(),
              allowOverrideOlderTombstone: true
            });
            var addedList = (res && res.added) || [];
            var updatedList = (res && res.updated) || [];
            var deletedList = (res && res.deleted) || [];
            var savedIds = addedList.concat(updatedList).map(function(m) { return m && m.id; }).filter(Boolean);
            var aLen = addedList.length;
            var uLen = updatedList.length;
            var dLen = deletedList.length;
            var diagData = (res && res.diagnostics) || null;
            addedCount += aLen;
            updatedCount += uLen;
            deletedCount += dLen;
            processed++;

            if (aLen > 0 || uLen > 0 || dLen > 0) {
              var msgParts = [];
              if (aLen > 0) msgParts.push('新增 ' + aLen + ' 条');
              if (uLen > 0) msgParts.push('更新 ' + uLen + ' 条');
              if (dLen > 0) msgParts.push('删除 ' + dLen + ' 条');
              if (diagData && diagData.candidateSource === 'high_certainty_rule') {
                msgParts.push('高确定性提取');
              }
              await store.updateMemoryTask(task.id, {
                status: 'saved',
                attempts: (task.attempts || 0) + 1,
                memoryWritten: (aLen + uLen) > 0,
                savedMemoryIds: savedIds,
                lastError: '',
                diagnostics: diagData,
                resultSummary: msgParts.join(' · ')
              });
            } else {
              var skipReason = (diagData && diagData.skipReason) || '未提取到可保存信息';
              if (res && res.disabledReason === 'useMemory_off') skipReason = '长期记忆已关闭';
              else if (res && res.disabledReason === 'autoMemory_off') skipReason = '自动记忆已关闭';
              else if (res && res.blockedSecrets) skipReason = '含敏感或隐私信息，已安全拦截';
              else if (res && res.blockedDeleted) skipReason = '已删除记忆墓碑拦截，未重新恢复';

              await store.updateMemoryTask(task.id, {
                status: 'skipped',
                attempts: (task.attempts || 0) + 1,
                memoryWritten: false,
                savedMemoryIds: [],
                lastError: '',
                diagnostics: diagData,
                resultSummary: skipReason
              });
            }
          } else if (task.type === 'summarize_chat') {
            var currentSettings = await store.getMemorySettings();
            var updatedChat = await summarizeChatSegment({
              chatId: task.chatId,
              settings: currentSettings,
              apiConfig: effectiveApi,
              allowLocalFallback: false
            });
            processed++;
            if (updatedChat && updatedChat.id) {
              summarizedChats.push(updatedChat);
              await store.updateMemoryTask(task.id, {
                status: 'saved',
                attempts: (task.attempts || 0) + 1,
                memoryWritten: true,
                savedMemoryIds: [],
                lastError: '',
                resultSummary: '已更新至第 ' + updatedChat.summaryUpToCount + ' 条消息摘要'
              });
            } else {
              await store.updateMemoryTask(task.id, {
                status: 'skipped',
                attempts: (task.attempts || 0) + 1,
                memoryWritten: false,
                savedMemoryIds: [],
                lastError: '',
                resultSummary: '无需更新摘要'
              });
            }
          }
        } catch (err) {
          var nextAttempts = (task.attempts || 0) + 1;
          var maxAttempts = task.maxAttempts || 3;
          var willRetry = nextAttempts < maxAttempts;
          if (willRetry) hasRetryWaiting = true;
          var backoffMs = nextAttempts === 1 ? 4500 : (nextAttempts === 2 ? 12000 : 30000);
          var errMsg = sanitizeErrorForLog(err);
          var failDiag = Object.assign({}, task.diagnostics || {}, {
            enteredAutoJudgment: true,
            modelRequested: true,
            dbWriteAttempted: false,
            dbWriteSucceeded: false,
            skipStage: 'api_error',
            skipReason: errMsg
          });
          var failedTask = await store.updateMemoryTask(task.id, {
            status: willRetry ? 'retry_waiting' : 'failed',
            attempts: nextAttempts,
            memoryWritten: false,
            lastError: errMsg,
            diagnostics: failDiag,
            nextRetryAt: willRetry ? (Date.now() + backoffMs) : 0
          });
          failedTasks.push(failedTask || task);
          console.warn('[AiWorkspaceMemory] task failed:', task.type, errMsg);
        }
      }
    } finally {
      _queueRunning = false;
    }

    if (hasRetryWaiting && !opts.disableRetryTimer) {
      scheduleRetryTimer(apiConfig);
    }

    if (_queueRerunRequested) {
      _queueRerunRequested = false;
      var follow = await processMemoryTaskQueue(apiConfig, options);
      addedCount += follow.addedCount || 0;
      updatedCount += follow.updatedCount || 0;
      deletedCount += follow.deletedCount || 0;
      processed += follow.processed || 0;
      if (Array.isArray(follow.summarizedChats)) summarizedChats = summarizedChats.concat(follow.summarizedChats);
      if (Array.isArray(follow.failedTasks)) failedTasks = failedTasks.concat(follow.failedTasks);
    }

    return {
      addedCount: addedCount,
      updatedCount: updatedCount,
      deletedCount: deletedCount,
      summarizedChats: summarizedChats,
      failedTasks: failedTasks,
      processed: processed
    };
  }

  async function retryFailedMemoryTasks(apiConfig) {
    var store = S();
    if (!store || typeof store.listMemoryTasks !== 'function') {
      return { addedCount: 0, updatedCount: 0, deletedCount: 0, summarizedChats: [], failedTasks: [], processed: 0 };
    }
    var tasks = await store.listMemoryTasks();
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      if (t && (t.status === 'failed' || t.status === 'retry_waiting')) {
        await store.updateMemoryTask(t.id, {
          status: 'pending',
          nextRetryAt: 0,
          maxAttempts: Math.max((t.maxAttempts || 3), (t.attempts || 0) + 2)
        });
      }
    }
    return await processMemoryTaskQueue(apiConfig, { ignoreBackoff: true });
  }

  global.AiWorkspaceMemory = {
    SHORT_TERM_RECENT_RAW: DEFAULT_RECENT_RAW,
    resolveMemoryParams: resolveMemoryParams,
    containsSensitiveSecret: containsSensitiveSecret,
    containsHighRiskPrivacy: containsHighRiskPrivacy,
    containsJokeOrSarcasm: containsJokeOrSarcasm,
    normalizeMemoryText: normalizeMemoryText,
    computeTextSimilarity: computeTextSimilarity,
    filterAccessibleMemories: filterAccessibleMemories,
    retrieveRelevantMemories: retrieveRelevantMemories,
    retrieveWorkspaceContext: retrieveWorkspaceContext,
    needsShortTermSummary: needsShortTermSummary,
    summarizeChatSegment: summarizeChatSegment,
    detectMemoryIntentFast: detectMemoryIntentFast,
    detectExplicitMemoryCommand: detectExplicitMemoryCommand,
    detectUnsupportedMonitoringOrReminderRequest: detectUnsupportedMonitoringOrReminderRequest,
    looksLikeSoftMemoryIntent: looksLikeSoftMemoryIntent,
    hasVagueContextReference: hasVagueContextReference,
    resolveContextReferenceFromHistory: resolveContextReferenceFromHistory,
    parseDirectExplicitMemoryFact: parseDirectExplicitMemoryFact,
    stripDeleteCommandTarget: stripDeleteCommandTarget,
    handleExplicitMemoryCommand: handleExplicitMemoryCommand,
    isGuessHypothesisOrThirdPartyQuote: isGuessHypothesisOrThirdPartyQuote,
    extractHighCertaintyFactCandidates: extractHighCertaintyFactCandidates,
    analyzeMemoryCandidate: analyzeMemoryCandidate,
    shouldAttemptExtraction: shouldAttemptExtraction,
    upsertExtractedMemories: upsertExtractedMemories,
    parseStructuredMemoryResponse: parseStructuredMemoryResponse,
    parseExtractorJson: parseExtractorJson,
    evaluateProactiveMemoryTurn: evaluateProactiveMemoryTurn,
    extractAndSaveFromTurn: extractAndSaveFromTurn,
    enqueueTurnMemoryTasks: enqueueTurnMemoryTasks,
    processMemoryTaskQueue: processMemoryTaskQueue,
    retryFailedMemoryTasks: retryFailedMemoryTasks
  };
})(typeof window !== 'undefined' ? window : globalThis);
