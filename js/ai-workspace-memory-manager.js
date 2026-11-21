// ai-workspace-memory-manager.js — 知屿第五阶段 5.2：智能记忆生命周期管理系统
// 能力覆盖：
// 1) 自动合并与去重（同义合并、保留完整细节与溯源记录）
// 2) 新旧记忆冲突检测与分类处置（真正更新保留历史 / 暂时性变化不覆盖 / 不同场景共存 / 未确认冲突标记）
// 3) 记忆重要程度动态评分（多因子动态计算，降权绝不自动删除）
// 4) 记忆关联关系网络（实体/项目/技术/目标/计划/更新链双向关联，严格防通用词误关联，删除自动清理断链）
// 5) 过时记忆识别与归档（已完成/已取消/历史替代/长期低价值备忘自动归档，绝不自动删除，支持按需召回）
(function(global) {
  'use strict';

  var DAY_MS = 24 * 60 * 60 * 1000;
  var STALE_ARCHIVE_DAYS = 30;

  var SCENARIO_RULES = [
    { code: 'work', label: '工作时', re: /(?:工作时|上班时|办公时|开会时|工作日|白天工作|处理工作时|在公司时|职场中)/ },
    { code: 'leisure', label: '周末/休闲时', re: /(?:周末|休息时|休息日|放假时|平时放松|放松时|下班后|休闲时|娱乐时|闲暇时|逛街时|宅家时)/ },
    { code: 'coding', label: '写代码/开发时', re: /(?:写代码时?|编程时?|开发时?|写程序时?|调试时?|排查\s*bug\s*时?|做技术(?:问答|方案)?时?|技术讨论时?)/i },
    { code: 'learning', label: '学习/研究时', re: /(?:学新概念时?|学习新知识时?|学习时|看书时|研究时|复习时|备考时|听课时|学理论时)/ },
    { code: 'morning', label: '早上/上午', re: /(?:早上|早晨|清晨|上午|起床后|吃早饭时)/ },
    { code: 'night', label: '晚上/夜间', re: /(?:晚上|夜间|夜里|睡前|熬夜时|深夜|晚饭后)/ },
    { code: 'travel', label: '出差/旅行时', re: /(?:出差时|旅行时|旅游时|外出时|在外面时)/ },
    { code: 'winter', label: '冬天/冬季', re: /(?:冬天|冬季|冬日|冷天时)/ },
    { code: 'summer', label: '夏天/夏季', re: /(?:夏天|夏季|夏日|热天时)/ },
    { code: 'spring', label: '春天/春季', re: /(?:春天|春季|春日)/ },
    { code: 'autumn', label: '秋天/秋季', re: /(?:秋天|秋季|秋日)/ },
    { code: 'formal', label: '正式场合', re: /(?:正式场合|汇报时|写报告时|写正式文档时|对外沟通时)/ },
    { code: 'casual', label: '日常闲聊时', re: /(?:闲聊时|随便聊聊时?|日常聊天时?)/ }
  ];

  var PREFERENCE_TOPIC_RULES = [
    {
      topic: 'fruit_pref',
      re: /(?:水果|草莓|芒果|苹果|香蕉|葡萄|西瓜|橙子|橘子|桃子|樱桃|蓝莓|榴莲|荔枝|龙眼|柚子|菠萝|猕猴桃|火龙果)/,
      items: ['草莓', '芒果', '苹果', '香蕉', '葡萄', '西瓜', '橙子', '橘子', '桃子', '樱桃', '蓝莓', '榴莲', '荔枝', '龙眼', '柚子', '菠萝', '猕猴桃', '火龙果']
    },
    {
      topic: 'drink_pref',
      re: /(?:咖啡|冰美式|热美式|美式|黑咖啡|黑咖|生椰拿铁|燕麦拿铁|冰拿铁|热拿铁|拿铁|卡布奇诺|摩卡|意式浓缩|奶茶|柠檬茶|乌龙茶|绿茶|红茶|花茶|果茶|气泡水|饮品|饮料)/,
      items: ['冰美式', '热美式', '美式', '黑咖啡', '黑咖', '生椰拿铁', '燕麦拿铁', '冰拿铁', '热拿铁', '拿铁', '卡布奇诺', '摩卡', '意式浓缩', '奶茶', '柠檬茶', '乌龙茶', '绿茶', '红茶', '花茶', '果茶', '气泡水']
    },
    {
      topic: 'reply_style_pref',
      re: /(?:回复|回答|输出|表达|讲解).{0,10}(?:简洁|精简|简短|言简意赅|不要太长|别太啰嗦|详细|详尽|展开讲|细一点|具体一点|多举例子)|(?:简洁|精简|简短|详细|详尽).{0,6}(?:回复|回答|输出|风格|讲解)/,
      items: ['简洁', '精简', '简短', '言简意赅', '详细', '详尽', '展开讲']
    },
    {
      topic: 'food_coriander',
      re: /(?:香菜|芫荽|胡荽)/,
      items: ['香菜']
    },
    {
      topic: 'food_spicy',
      re: /(?:吃辣|辣椒|麻辣|微辣|中辣|重辣|特辣|清淡|不辣)/,
      items: ['吃辣', '麻辣', '微辣', '中辣', '重辣', '清淡', '不辣']
    },
    {
      topic: 'user_location',
      re: /(?:住在|居住在|定居在?|搬到|现居)/,
      items: []
    },
    {
      topic: 'user_name',
      re: /(?:名字是|叫我|称呼为|称呼我)/,
      items: []
    }
  ];

  var GENERIC_STOP_ENTITIES = new Set([
    '用户', '本人', '自己', '喜欢', '偏爱', '偏好', '爱吃', '爱喝', '习惯',
    '计划', '长期计划', '项目', '开发', '研发', '制作', '搭建', '推进',
    '学习', '开始学习', '持续学习', '工作', '上班', '周末', '平时', '最近',
    '现在', '目前', '以前', '之前', '以后', '未来', '准备', '打算', '决定',
    '目标', '技术', '方案', '方法', '方式', '问题', '内容', '时间', '东西',
    '事情', '一下', '一个', '一款', '一种', '回复', '回答', '输出', '风格',
    '简洁', '详细', '系统', '软件', '应用', '工具', '平台', '功能', '服务',
    '一直', '经常', '每天', '偶尔', '临时', '取消', '完成', '搁置', '暂停',
    '历史', '记录', '记忆', '偏好', '习惯', '备忘', '身份信息', '这个', '那个',
    '已经', '正在', '希望', '尽量', '不要', '可以', '需要', '进行', '完善'
  ]);

  var KNOWN_DOMAIN_ENTITIES = [
    { key: '知屿', re: /知屿/ },
    { key: '弯弯机', re: /弯弯机/ },
    { key: '星澜', re: /星澜/ },
    { key: 'ai工作空间', re: /ai\s*工作空间|个人\s*ai\s*工作空间/i },
    { key: '长期记忆系统', re: /长期记忆系统|三层记忆系统|记忆管理系统|智能记忆管理/ },
    { key: '深度语义理解', re: /深度语义理解|语义理解系统/ },
    { key: '原生javascript', re: /原生\s*(?:javascript|js)/i },
    { key: 'javascript', re: /javascript|\bjs\b/i },
    { key: 'typescript', re: /typescript|\bts\b/i },
    { key: 'dexie', re: /\bdexie\b|indexeddb/i },
    { key: 'react', re: /\breact\b/i },
    { key: 'vue', re: /\bvue\b/i },
    { key: 'python', re: /\bpython\b/i },
    { key: 'nodejs', re: /node\.?js|\bnode\b/i },
    { key: 'html', re: /\bhtml5?\b/i },
    { key: 'css', re: /\bcss3?\b/i },
    { key: '日语', re: /日语|日文|jlpt/i },
    { key: '法语', re: /法语|法文/ },
    { key: '英语', re: /英语|英文|雅思|托福/ },
    { key: '韩语', re: /韩语|韩文/ },
    { key: '吉他', re: /吉他/ },
    { key: '钢琴', re: /钢琴/ }
  ];

  var RELATION_LABELS = {
    project_part: '同项目',
    supports_goal: '项目目标',
    uses_tech: '技术栈',
    related_plan: '关联计划',
    related_entity: '关联主题',
    supersedes: '更新自',
    superseded_by: '已被更新',
    conflict: '待确认冲突'
  };

  function S() {
    return global.AiWorkspaceStorage;
  }

  function Sem() {
    return global.AiWorkspaceSemantic;
  }

  function normalizeCompact(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/^[-*•\d.)\s]+/, '')
      .replace(/[\s，。！？、；：“”"'‘’（）()【】\[\],.!?;:~`「」《》]+/g, '')
      .trim();
  }

  // ===== 1. 场景识别与冲突分类分析 =====
  function extractScenarioContext(text) {
    var src = String(text || '').trim();
    if (!src) return { code: '', label: '', raw: '' };
    for (var i = 0; i < SCENARIO_RULES.length; i++) {
      var rule = SCENARIO_RULES[i];
      var m = src.match(rule.re);
      if (m) {
        return {
          code: rule.code,
          label: rule.label,
          raw: m[0]
        };
      }
    }
    var customScene = src.match(/(?:在|当)([\u4e00-\u9fa5A-Za-z0-9]{2,8})(?:的时候|时|场景下|场合)/);
    if (customScene && customScene[1] && !/^(?:以前|之前|现在|目前|当时|那|这)$/.test(customScene[1])) {
      return {
        code: 'scene:' + customScene[1].toLowerCase(),
        label: customScene[1] + '时',
        raw: customScene[0]
      };
    }
    return { code: '', label: '', raw: '' };
  }

  function areScenariosCompatible(scA, scB) {
    var a = String(scA || '').trim().toLowerCase();
    var b = String(scB || '').trim().toLowerCase();
    if (!a && !b) return true;
    if (a && b) return a === b;
    // 一个有明确场景限定、另一个是泛化/另一场景时，默认不合并也不直接覆盖，让场景偏好共存
    return false;
  }

  function isTemporaryChangeExpression(text) {
    var src = String(text || '').trim();
    if (!src) return false;
    return /(?:今天(?:临时|突然|刚好)?想|今晚(?:临时|突然)?想|这顿想|这回想|这次想|临时想|临时换|偶尔想|偶尔喝一次|偶尔吃一次|这几天暂时|暂时换换口味|暂时不想|暂时不喝|暂时不吃|暂时不用|暂时不打算|最近暂时|这阵子暂时|这阵子不想|这几天不想|这几天不喝|这几天不吃|最近天气(?:冷|热|凉|不好).{0,12}(?:不想|不喝|不吃|暂时)|先不喝|先不吃|今天改喝|今天改吃|今天想喝|今天想吃|今晚想喝|今晚想吃|先试一次|就这一次|偶尔破例)/.test(src);
  }

  function isAmbiguousPreferenceExpression(text) {
    var src = String(text || '').trim();
    if (!src) return false;
    if (hasExplicitChangeCue(src)) return false;
    return /(?:和|与|跟).{1,12}都不错|都(?:不错|挺好|还可以|挺喜欢|喜欢|行|可以)|各有千秋|差不多|不好说|说不准|不太确定|还在纠结|还没想好|看情况|随缘/.test(src);
  }

  function hasExplicitChangeCue(text) {
    var src = String(text || '').trim();
    if (!src) return false;
    return /(?:现在更喜欢|现在改|现在希望|现在想要|如今更喜欢|目前更喜欢|后来更喜欢|其实更喜欢|改喝|改吃|改成|改为|改详细|改简洁|改精简|改用|改学|改做|改主意|以后改|换成|换喝|换吃|换一种|不再喜欢|不再吃|不再喝|不再想要|不想再|已经不|以前.{0,24}现在|之前.{0,24}现在|曾经.{0,24}现在|原本.{0,24}现在|转成|换成了|修正为|纠正为|更正为)/.test(src);
  }

  function hasSuperlativePreferenceCue(text) {
    return /(?:最喜欢|最爱吃|最爱喝|最爱|首选|平时主要|主要喝|主要吃|常喝的是|最常喝|最常吃|回答风格|回复风格|以后.{0,8}回复|希望\s*ai\s*回复)/i.test(String(text || ''));
  }

  var CANONICAL_ITEM_MAP = {
    '冰美式': '美式',
    '热美式': '美式',
    '黑咖啡': '美式',
    '黑咖': '美式',
    '生椰拿铁': '拿铁',
    '燕麦拿铁': '拿铁',
    '冰拿铁': '拿铁',
    '热拿铁': '拿铁',
    '芫荽': '香菜',
    '胡荽': '香菜'
  };

  function extractPreferenceTopic(content, category) {
    var src = String(content || '').trim();
    if (!src) return { topic: '', value: '', polarity: 'positive' };
    var sem = Sem();
    var polarity = (sem && typeof sem.detectPolarity === 'function')
      ? sem.detectPolarity(src)
      : (/(?:不吃|忌口|过敏|不喜欢|讨厌|不再|避免|拒绝)/.test(src) ? 'negative' : 'positive');

    // 先匹配领域明确规则（确保「最爱喝的咖啡是冰美式」与「喜欢喝冰美式」「冰美式一直是我的最爱」落入同一 drink_pref 主题）
    for (var i = 0; i < PREFERENCE_TOPIC_RULES.length; i++) {
      var rule = PREFERENCE_TOPIC_RULES[i];
      if (!rule.re.test(src)) continue;
      var matchedVal = '';
      if (rule.topic === 'reply_style_pref') {
        if (/(?:简洁|精简|简短|言简意赅|不要太长|别太啰嗦)/.test(src)) matchedVal = 'concise';
        else if (/(?:详细|详尽|展开讲|细一点|具体一点|多举例子)/.test(src)) matchedVal = 'detailed';
      } else if (rule.items && rule.items.length) {
        for (var j = 0; j < rule.items.length; j++) {
          if (src.indexOf(rule.items[j]) !== -1) {
            matchedVal = CANONICAL_ITEM_MAP[rule.items[j]] || rule.items[j];
            break;
          }
        }
      } else {
        var tail = src.match(/(?:住在|居住在|定居在?|搬到|现居|名字是|叫我|称呼为|称呼我)([^，。；！]{1,16})/);
        if (tail && tail[1]) matchedVal = normalizeCompact(tail[1]);
      }
      if (matchedVal || rule.topic === 'user_location' || rule.topic === 'user_name') {
        return {
          topic: rule.topic,
          value: matchedVal,
          polarity: polarity
        };
      }
    }

    var dynSubj = src.match(/(?:最喜欢的|最爱吃的|最爱喝的|最爱的|偏好的|喜欢的)([\u4e00-\u9fa5A-Za-z0-9]{1,8}?)(?:现在|目前|其实|已经)?(?:是|为|改成|改为|换成)([^，。；！]{1,20})/);
    if (dynSubj && dynSubj[1]) {
      var dynVal = normalizeCompact(dynSubj[2] || '');
      return {
        topic: 'pref_subject:' + dynSubj[1].toLowerCase(),
        value: CANONICAL_ITEM_MAP[dynVal] || dynVal,
        polarity: polarity
      };
    }

    return { topic: '', value: '', polarity: polarity, category: category || '' };
  }

  function extractDistinctTokens(text) {
    var src = String(text || '').toLowerCase();
    var tokens = [];
    var seen = {};
    var en = src.match(/[a-z0-9_+#-]{2,}/g) || [];
    for (var i = 0; i < en.length; i++) {
      if (!seen[en[i]]) {
        seen[en[i]] = true;
        tokens.push(en[i]);
      }
    }
    var zh = src.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    for (var j = 0; j < zh.length; j++) {
      var run = zh[j];
      for (var k = 0; k <= run.length - 2; k++) {
        var bg = run.slice(k, k + 2);
        if (!GENERIC_STOP_ENTITIES.has(bg) && !seen[bg]) {
          seen[bg] = true;
          tokens.push(bg);
        }
      }
    }
    return tokens;
  }

  function stripCanonicalFillers(text) {
    return String(text || '')
      .replace(/^用户/, '')
      .replace(/(?:平时|一般|通常|向来|一直|都是|就是|喝|吃|的|了|比较|很|非常|最爱|最喜欢|心头好|首选)/g, '');
  }

  function stripPreferenceFraming(text) {
    return normalizeCompact(text)
      .replace(/(?:用户|本人|平时|一般|通常|向来|一直|始终|一直都|都是|就是|是我|我的|以后|今后|往后|ai|助手|回复风格|回答风格|风格|回复|回答|输出|讲解|最喜欢|最爱喝|最爱吃|最爱|喜欢喝|喜欢吃|喜欢|偏爱|偏好|爱喝|爱吃|喝|吃|咖啡|饮品|饮料|水果|食物|心头好|首选|尽量|希望|简洁精简|简洁|精简|简短|一些|一点|的|是|了)/g, '');
  }

  function isSemanticDuplicatePair(incomingContent, incomingCategory, existingMem) {
    if (!existingMem || !existingMem.content) return false;
    var normNew = normalizeCompact(incomingContent);
    var normOld = normalizeCompact(existingMem.content);
    if (!normNew || !normOld) return false;
    if (normNew === normOld) return true;

    var sem = Sem();
    if (sem && typeof sem.computeSemanticEquivalence === 'function') {
      var eq = sem.computeSemanticEquivalence(incomingContent, existingMem.content, incomingCategory, existingMem.category);
      if (eq >= 0.8) return true;
    }

    // 复用 AiWorkspaceSemantic 语义签名键校验（同语义键且极性一致）
    if (sem && typeof sem.extractSemanticSignature === 'function') {
      var sigNew = sem.extractSemanticSignature(incomingContent, incomingCategory);
      var sigOld = sem.extractSemanticSignature(existingMem.content, existingMem.category);
      if (sigNew.semanticKey && sigOld.semanticKey && sigNew.semanticKey === sigOld.semanticKey && sigNew.polarity === sigOld.polarity) {
        return true;
      }
    }

    // 规范化后若互相包含且核心主题一致
    if (sem && typeof sem.canonicalizeSemanticText === 'function') {
      var cNew = stripCanonicalFillers(normalizeCompact(sem.canonicalizeSemanticText(incomingContent)));
      var cOld = stripCanonicalFillers(normalizeCompact(sem.canonicalizeSemanticText(existingMem.content)));
      if (cNew && cOld && (cNew === cOld || ((cNew.indexOf(cOld) !== -1 || cOld.indexOf(cNew) !== -1) && Math.min(cNew.length, cOld.length) >= 3))) {
        var polA = sem.detectPolarity(incomingContent);
        var polB = sem.detectPolarity(existingMem.content);
        if (polA === polB) return true;
      }
    }

    // 同主题同值且极性一致
    var tNew = extractPreferenceTopic(incomingContent, incomingCategory);
    var tOld = extractPreferenceTopic(existingMem.content, existingMem.category);
    if (tNew.topic && tNew.topic === tOld.topic && tNew.value && tNew.value === tOld.value && tNew.polarity === tOld.polarity) {
      return true;
    }
    return false;
  }

  // ===== 2. 智能合并与保留完整细节 =====
  function mergeMemoryContents(existingContent, incomingContent, maxLen) {
    var oldStr = String(existingContent || '').trim();
    var newStr = String(incomingContent || '').trim();
    var limit = Math.max(60, Number(maxLen) || 260);
    if (!oldStr) return newStr.slice(0, limit);
    if (!newStr) return oldStr.slice(0, limit);

    var normOld = normalizeCompact(oldStr);
    var normNew = normalizeCompact(newStr);
    if (normOld === normNew) return oldStr.length >= newStr.length ? oldStr : newStr;
    if (normNew.indexOf(normOld) !== -1) return newStr.slice(0, limit);
    if (normOld.indexOf(normNew) !== -1) return oldStr.slice(0, limit);

    var sem = Sem();
    var canonOld = normalizeCompact(sem && sem.canonicalizeSemanticText ? sem.canonicalizeSemanticText(oldStr) : oldStr);
    var canonNew = normalizeCompact(sem && sem.canonicalizeSemanticText ? sem.canonicalizeSemanticText(newStr) : newStr);
    if (canonNew.indexOf(canonOld) !== -1 && newStr.length >= oldStr.length) {
      return newStr.slice(0, limit);
    }
    if (canonOld.indexOf(canonNew) !== -1 && oldStr.length >= newStr.length) {
      return oldStr.slice(0, limit);
    }

    // 若两者为同主题同对象的纯同义换句（去除偏好修饰框架后无新增实质限定词），保留简洁清晰的原表达，避免重复拼接
    var tOld = extractPreferenceTopic(oldStr, '');
    var tNew = extractPreferenceTopic(newStr, '');
    if (tOld.topic && tOld.topic === tNew.topic && tOld.value && tOld.value === tNew.value && tOld.polarity === tNew.polarity) {
      var coreOld = stripPreferenceFraming(oldStr);
      var coreNew = stripPreferenceFraming(newStr);
      if (coreOld === coreNew || (coreOld && coreNew && coreOld.indexOf(coreNew) !== -1) || (coreOld && !coreNew)) {
        return oldStr.slice(0, limit);
      }
      if ((!coreOld && coreNew) || (coreOld && coreNew && coreNew.indexOf(coreOld) !== -1)) {
        return newStr.slice(0, limit);
      }
    }

    // 检查双方是否各自携带对方缺少的补充细节（例如「先给结论」「无糖」「基于原生JS」）
    var oldTokens = extractDistinctTokens(canonOld);
    var newTokens = extractDistinctTokens(canonNew);
    var oldSet = new Set(oldTokens);
    var newSet = new Set(newTokens);

    var extraInNew = newTokens.filter(function(t) { return !oldSet.has(t); });
    var extraInOld = oldTokens.filter(function(t) { return !newSet.has(t); });

    if (extraInNew.length > 0 && extraInOld.length === 0) {
      return newStr.slice(0, limit);
    }
    if (extraInOld.length > 0 && extraInNew.length === 0) {
      return oldStr.slice(0, limit);
    }

    // 双方都有互补信息：提取新增子句拼接，避免丢失有效信息
    var newClauses = newStr.split(/[，,；;。]+/).map(function(s) { return s.trim(); }).filter(Boolean);
    var uniqueClauses = [];
    for (var i = 0; i < newClauses.length; i++) {
      var cl = newClauses[i];
      var clCanon = normalizeCompact(sem && sem.canonicalizeSemanticText ? sem.canonicalizeSemanticText(cl) : cl).replace(/^用户/, '');
      if (!clCanon || canonOld.indexOf(clCanon) !== -1) continue;
      var clTokens = extractDistinctTokens(clCanon);
      var hasUnique = clTokens.some(function(t) { return !oldSet.has(t); });
      if (hasUnique) {
        var cleanedClause = cl.replace(/^用户(?:希望|偏好|喜欢|平时|目前|正在)?/, '').trim();
        if (cleanedClause && cleanedClause.length >= 2) {
          uniqueClauses.push(cleanedClause);
        }
      }
    }

    if (uniqueClauses.length > 0) {
      var base = oldStr.replace(/[。！!]+$/, '');
      var combined = base + '，' + uniqueClauses.join('，');
      if (combined.length <= limit) return combined;
    }

    return (newStr.length > oldStr.length ? newStr : oldStr).slice(0, limit);
  }

  var INDEPENDENT_MENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

  function getIndependentMentionBoost(count) {
    var n = Math.max(1, Math.round(Number(count) || 1));
    if (n < 3) return 0;
    return Math.floor((n - 1) / 2);
  }

  function resolveReliableMentionTimestamp(incomingItem, ctx) {
    var hasExplicitCtxTime = ctx && Object.prototype.hasOwnProperty.call(ctx, 'mentionedAt');
    var hasExplicitItemTime = incomingItem && Object.prototype.hasOwnProperty.call(incomingItem, 'mentionedAt');
    if (hasExplicitCtxTime) {
      var ct = Number(ctx.mentionedAt);
      return Number.isFinite(ct) && ct > 0 ? ct : 0;
    }
    if (hasExplicitItemTime) {
      var it = Number(incomingItem.mentionedAt);
      return Number.isFinite(it) && it > 0 ? it : 0;
    }
    var tt = ctx && ctx.taskCreatedAt != null ? Number(ctx.taskCreatedAt) : 0;
    return Number.isFinite(tt) && tt > 0 ? tt : 0;
  }

  function evaluateIndependentMention(existingMem, incomingItem, context) {
    var ctx = context && typeof context === 'object' ? context : {};
    if (!existingMem || typeof existingMem !== 'object') {
      return { isIndependent: false, reason: 'missing_existing' };
    }
    // 历史整理流程（如 deduplicateExistingMemories）绝不增加独立提及次数
    if (ctx.isMaintenanceMerge === true || ctx.allowIndependentMention === false) {
      return { isIndependent: false, reason: 'maintenance_merge' };
    }
    if ((existingMem.status || 'active') !== 'active' || existingMem.archived === true) {
      return { isIndependent: false, reason: 'inactive_memory' };
    }

    // 缺少可靠来源（chatId）或可靠时间信息时，不增加计数，避免误判
    var incomingChatId = String(ctx.chatId || (incomingItem && incomingItem.sourceChatId) || '').trim();
    if (!incomingChatId) {
      return { isIndependent: false, reason: 'missing_reliable_source' };
    }
    var incomingTs = resolveReliableMentionTimestamp(incomingItem, ctx);
    if (!(incomingTs > 0)) {
      return { isIndependent: false, reason: 'missing_reliable_time' };
    }

    // 收集已有记忆的可靠来源聊天及各自最近一次有效提及时间
    var knownChats = [];
    if (Array.isArray(existingMem.sourceChats)) {
      for (var i = 0; i < existingMem.sourceChats.length; i++) {
        var sc = existingMem.sourceChats[i];
        if (sc && sc.chatId) {
          knownChats.push({
            chatId: String(sc.chatId).trim(),
            mentionedAt: Number(sc.mentionedAt) || 0
          });
        }
      }
    }
    var origChatId = String(existingMem.sourceChatId || '').trim();
    if (origChatId && !knownChats.some(function(c) { return c.chatId === origChatId; })) {
      knownChats.push({
        chatId: origChatId,
        mentionedAt: Number(existingMem.mentionedAt) || Number(existingMem.createdAt) || 0
      });
    }

    // 同一消息短时间重复处理 / 后台重试兜底拦截（对比最近合并记录同来源与极近时间或同时间戳）
    var incomingRawNorm = normalizeCompact(String((incomingItem && incomingItem.rawExpression) || ctx.rawUserText || ''));
    if (Array.isArray(existingMem.mergeRecords) && existingMem.mergeRecords.length > 0) {
      for (var mr = 0; mr < existingMem.mergeRecords.length; mr++) {
        var rec = existingMem.mergeRecords[mr];
        if (!rec) continue;
        if (String(rec.sourceChatId || '').trim() === incomingChatId) {
          var recTs = Number(rec.mergedAt) || 0;
          if (recTs > 0 && Math.abs(incomingTs - recTs) < 60 * 1000 && incomingRawNorm && normalizeCompact(rec.rawExpression || '') === incomingRawNorm) {
            return { isIndependent: false, reason: 'duplicate_message_retry' };
          }
        }
      }
    }

    // 若已有记忆完全没有记录过来源 chatId，无法确认跨窗口独立性，保守退回到 24 小时时间窗判定
    if (knownChats.length === 0) {
      var fallbackPrevTs = Number(existingMem.mentionedAt) || Number(existingMem.createdAt) || 0;
      if (!(fallbackPrevTs > 0)) {
        return { isIndependent: false, reason: 'missing_baseline_time' };
      }
      if (incomingTs - fallbackPrevTs >= INDEPENDENT_MENTION_INTERVAL_MS) {
        return { isIndependent: true, reason: 'interval_over_24h', mentionedAt: incomingTs };
      }
      return { isIndependent: false, reason: 'within_24h_no_origin_chat' };
    }

    // 规则 1：不同聊天窗口再次提及同一事实 -> 计为一次独立提及
    var matchedChat = null;
    for (var k = 0; k < knownChats.length; k++) {
      if (knownChats[k].chatId === incomingChatId) {
        matchedChat = knownChats[k];
        break;
      }
    }
    if (!matchedChat) {
      return { isIndependent: true, reason: 'different_chat_window', mentionedAt: incomingTs };
    }

    // 规则 2：同一聊天窗口再次提及 -> 至少间隔 24 小时才计数（且排除乱序/同时间戳重试）
    var prevChatTs = matchedChat.mentionedAt || Number(existingMem.mentionedAt) || Number(existingMem.createdAt) || 0;
    if (!(prevChatTs > 0)) {
      return { isIndependent: false, reason: 'missing_prev_chat_time' };
    }
    var elapsed = incomingTs - prevChatTs;
    if (elapsed >= INDEPENDENT_MENTION_INTERVAL_MS) {
      return { isIndependent: true, reason: 'same_chat_over_24h', mentionedAt: incomingTs };
    }
    return { isIndependent: false, reason: elapsed <= 0 ? 'duplicate_or_stale_timestamp' : 'same_chat_within_24h' };
  }

  function mergeSourceChatsList(existingList, incomingChatId, incomingChatTitle, mentionedAt, refreshExistingTs) {
    var out = Array.isArray(existingList) ? existingList.map(function(it) {
      return it ? Object.assign({}, it) : null;
    }).filter(Boolean) : [];
    var cid = String(incomingChatId || '').trim();
    var title = String(incomingChatTitle || '').trim();
    var ts = Number(mentionedAt) || Date.now();
    if (cid || title) {
      var matchIdx = -1;
      for (var i = 0; i < out.length; i++) {
        var it = out[i];
        if (cid && it.chatId) {
          if (it.chatId === cid) { matchIdx = i; break; }
        } else if (title && it.chatTitle === title) {
          matchIdx = i; break;
        }
      }
      if (matchIdx === -1) {
        out.push({
          chatId: cid,
          chatTitle: title,
          mentionedAt: ts
        });
      } else if (refreshExistingTs && ts > (Number(out[matchIdx].mentionedAt) || 0)) {
        out[matchIdx].mentionedAt = ts;
        if (title && !out[matchIdx].chatTitle) out[matchIdx].chatTitle = title;
      }
    }
    return out.length > 8 ? out.slice(out.length - 8) : out;
  }

  function buildMergedMemoryPatch(existingMem, incomingItem, context) {
    var ctx = context && typeof context === 'object' ? context : {};
    var now = Date.now();
    var mergedContent = mergeMemoryContents(existingMem.content, incomingItem.content, ctx.maxSingleMemoryLength || 260);
    var indepEval = evaluateIndependentMention(existingMem, incomingItem, ctx);
    var isIndependent = indepEval.isIndependent === true;
    var effectiveMentionTs = indepEval.mentionedAt || resolveReliableMentionTimestamp(incomingItem, ctx) || now;

    var nextMergeRecords = Array.isArray(existingMem.mergeRecords) ? existingMem.mergeRecords.slice(0, 7) : [];
    nextMergeRecords.unshift({
      mergedAt: effectiveMentionTs,
      mergedContent: String(incomingItem.content || '').trim().slice(0, 260),
      rawExpression: String(incomingItem.rawExpression || ctx.rawUserText || '').trim().slice(0, 260),
      sourceChatId: String(ctx.chatId || incomingItem.sourceChatId || '').trim(),
      sourceChatTitle: String(ctx.chatTitle || incomingItem.sourceChatTitle || '').trim(),
      reason: String(ctx.mergeReason || '语义相同表达自动合并').slice(0, 100)
    });

    var rawReliableTs = resolveReliableMentionTimestamp(incomingItem, ctx);
    var nextSourceChats = mergeSourceChatsList(
      existingMem.sourceChats,
      ctx.chatId || incomingItem.sourceChatId,
      ctx.chatTitle || incomingItem.sourceChatTitle,
      isIndependent ? effectiveMentionTs : (rawReliableTs > 0 ? rawReliableTs : (Number(existingMem.mentionedAt) || Number(existingMem.createdAt) || 0)),
      isIndependent
    );

    var nextMentionCount = (Number(existingMem.mentionCount) || 1) + Math.max(1, Number(incomingItem.mentionCount) || 1);
    var prevIndepCount = (Number.isFinite(Number(existingMem.independentMentionCount)) && Number(existingMem.independentMentionCount) >= 1)
      ? Math.max(1, Math.round(Number(existingMem.independentMentionCount)))
      : 1;
    var nextIndepCount = isIndependent ? (prevIndepCount + 1) : prevIndepCount;

    var nextUserConfirmed = !!(existingMem.userConfirmed || incomingItem.userConfirmed || ctx.isExplicit);
    var nextConf = Math.max(Number(existingMem.confidence) || 0.85, Number(incomingItem.confidence) || 0.85);
    var nextEntities = extractConcreteEntities({
      content: mergedContent,
      category: existingMem.category || incomingItem.category,
      projectId: existingMem.projectId || ctx.projectId || ''
    });

    var draftForScore = Object.assign({}, existingMem, {
      content: mergedContent,
      mentionCount: nextMentionCount,
      independentMentionCount: nextIndepCount,
      userConfirmed: nextUserConfirmed,
      confidence: nextConf,
      mergeRecords: nextMergeRecords,
      entities: nextEntities
    });
    var nextScore = computeDynamicScore(draftForScore, now);

    // 重要度仅在发生独立提及跨越阈值（第3次+1、第5次+1…）时以当前 importance 为基准增量提升，最高 5 分
    // manualImportance === true 时仅累计次数，绝不自动修改评分
    var baseImp = Number.isFinite(Number(existingMem.importance))
      ? Math.max(1, Math.min(5, Math.round(Number(existingMem.importance))))
      : scoreToImportance(nextScore);
    var nextImp = baseImp;
    if (isIndependent && existingMem.manualImportance !== true) {
      var boostDelta = getIndependentMentionBoost(nextIndepCount) - getIndependentMentionBoost(prevIndepCount);
      if (boostDelta > 0) {
        nextImp = Math.min(5, baseImp + boostDelta);
      }
    }

    return {
      content: mergedContent,
      category: existingMem.category || incomingItem.category || '备忘',
      rawExpression: existingMem.rawExpression || String(incomingItem.rawExpression || ctx.rawUserText || '').trim().slice(0, 260),
      mentionedAt: Math.min(Number(existingMem.mentionedAt) || effectiveMentionTs, effectiveMentionTs),
      sourceChats: nextSourceChats,
      mentionCount: nextMentionCount,
      independentMentionCount: nextIndepCount,
      userConfirmed: nextUserConfirmed,
      confidence: nextConf,
      dynamicScore: nextScore,
      importance: nextImp,
      entities: nextEntities,
      mergeRecords: nextMergeRecords,
      relation: 'merged'
    };
  }

  // ===== 3. 冲突检测主入口：区分 同义合并 / 不同场景共存 / 暂时变化 / 真正更新(留历史) / 未确认冲突 / 状态演进 =====
  function analyzeIncomingAgainstExisting(incomingItem, sameScopeMemories, rawUserText) {
    var list = Array.isArray(sameScopeMemories) ? sameScopeMemories : [];
    var content = String((incomingItem && incomingItem.content) || '').trim();
    var category = String((incomingItem && incomingItem.category) || '').trim();
    var incomingStatus = String((incomingItem && incomingItem.status) || 'active').toLowerCase();
    var incomingTemporal = String((incomingItem && incomingItem.temporalState) || 'current').toLowerCase();
    var combinedText = content + ' ' + String(rawUserText || '');

    var incScene = incomingItem && incomingItem.scenario
      ? { code: String(incomingItem.scenario), label: String(incomingItem.scenarioLabel || '') }
      : extractScenarioContext(combinedText);
    var incTopic = extractPreferenceTopic(content, category);
    var isTempChange = isTemporaryChangeExpression(rawUserText || content);
    var hasChange = hasExplicitChangeCue(combinedText) || incomingItem.relation === 'updated' || incomingItem.action === 'update';
    var incEntities = extractConcreteEntities({ content: content, category: category, projectId: incomingItem.projectId || '' });

    // A) 状态变更（如项目已完成、计划已取消、计划搁置、偏好转为历史）：优先匹配同名活跃记忆
    if (incomingStatus !== 'active' || incomingTemporal === 'completed' || incomingTemporal === 'cancelled' || incomingTemporal === 'paused' || incomingTemporal === 'past') {
      var targetSubj = normalizeCompact(incomingItem.targetSubject || '');
      var bestStatusTarget = null;
      var bestStatusScore = 0;

      for (var s = 0; s < list.length; s++) {
        var m = list[s];
        if (!m || !m.content) continue;
        var mNorm = normalizeCompact(m.content);
        var score = 0;
        if (targetSubj && mNorm.indexOf(targetSubj) !== -1) score += 5;

        var mEntities = Array.isArray(m.entities) && m.entities.length ? m.entities : extractConcreteEntities(m);
        for (var ei = 0; ei < incEntities.length; ei++) {
          if (mEntities.indexOf(incEntities[ei]) !== -1) score += 4;
        }
        var mTopic = extractPreferenceTopic(m.content, m.category);
        if (incTopic.topic && mTopic.topic === incTopic.topic && incTopic.value && mTopic.value === incTopic.value) {
          score += 5;
        }
        if ((m.status || 'active') === 'active') score += 1.5;

        if (score > bestStatusScore) {
          bestStatusScore = score;
          bestStatusTarget = m;
        }
      }
      if (bestStatusTarget && bestStatusScore >= 4) {
        return {
          mode: 'status_transition',
          target: bestStatusTarget,
          scenario: incScene,
          topic: incTopic,
          reason: '识别到已有项目/计划/偏好的状态变更'
        };
      }
    }

    // 优先拦截：明确属于暂时性变化或非排他性模糊表达，绝不覆盖长期有效记忆
    if (isTempChange && incomingStatus === 'active') {
      return {
        mode: 'temporary_only',
        target: null,
        scenario: incScene,
        topic: incTopic,
        reason: '属于暂时性口味/行为变化，不改变也不覆盖长期有效偏好'
      };
    }

    if (isAmbiguousPreferenceExpression(combinedText) && incomingStatus === 'active') {
      return {
        mode: 'ambiguous_no_override',
        target: null,
        scenario: incScene,
        topic: incTopic,
        reason: '表达模糊或属于非排他性评价，不擅自覆盖或降级已有偏好'
      };
    }

    // 仅在活跃池中检测同义合并、场景共存与偏好冲突
    var activePool = list.filter(function(m) {
      return m && (m.status || 'active') === 'active' && !m.archived;
    });

    // B) 同义合并检查（必须场景兼容！不同场景绝不合并）
    for (var i = 0; i < activePool.length; i++) {
      var cand = activePool[i];
      var candScene = cand.scenario
        ? { code: cand.scenario, label: cand.scenarioLabel || '' }
        : extractScenarioContext(cand.content);
      if (!areScenariosCompatible(incScene.code, candScene.code)) {
        continue;
      }
      if (isSemanticDuplicatePair(content, category, cand)) {
        return {
          mode: 'merge',
          target: cand,
          scenario: incScene.code ? incScene : candScene,
          topic: incTopic,
          reason: '语义等价且场景一致，合并为单条完整记忆'
        };
      }
    }

    // C) 同偏好主题检测（区分：不同场景共存 / 暂时性变化 / 真正偏好更新 / 未确认矛盾）
    if (incTopic.topic) {
      var topicPeers = [];
      for (var j = 0; j < activePool.length; j++) {
        var peer = activePool[j];
        var peerTopic = extractPreferenceTopic(peer.content, peer.category);
        if (peerTopic.topic !== incTopic.topic) continue;
        var peerScene = peer.scenario
          ? { code: peer.scenario, label: peer.scenarioLabel || '' }
          : extractScenarioContext(peer.content);
        topicPeers.push({ mem: peer, topic: peerTopic, scene: peerScene });
      }

      if (topicPeers.length > 0) {
        // C1) 检查是否存在不同场景的同行（例如 工作时 vs 周末放松时，写代码时 vs 学新概念时）
        var compatiblePeer = null;
        var distinctScenePeers = [];
        for (var p = 0; p < topicPeers.length; p++) {
          if (areScenariosCompatible(incScene.code, topicPeers[p].scene.code)) {
            if (!compatiblePeer) compatiblePeer = topicPeers[p];
          } else {
            distinctScenePeers.push(topicPeers[p].mem);
          }
        }

        if (!compatiblePeer && distinctScenePeers.length > 0) {
          return {
            mode: 'coexist_scenario',
            conflictPeers: distinctScenePeers,
            scenario: incScene,
            topic: incTopic,
            reason: '属于不同场景下的独立偏好，保留共存不合并覆盖'
          };
        }

        if (compatiblePeer) {
          var targetMem = compatiblePeer.mem;
          var targetTopic = compatiblePeer.topic;
          var sameValue = !!(incTopic.value && targetTopic.value && incTopic.value === targetTopic.value);
          var oppositePolarity = incTopic.polarity !== targetTopic.polarity;
          var differentValue = !!(incTopic.value && targetTopic.value && incTopic.value !== targetTopic.value);

          // C2) 暂时性变化（例如“今天临时想喝热拿铁”）：绝不覆盖长期有效偏好
          if (isTempChange && (differentValue || oppositePolarity)) {
            return {
              mode: 'temporary_only',
              target: targetMem,
              scenario: incScene,
              topic: incTopic,
              reason: '属于暂时性口味/行为变化，保留原长期偏好不变'
            };
          }

          // C3) 同对象相反极性（如 喜欢吃辣 vs 不喜欢吃辣，喜欢草莓 vs 不再喜欢草莓）
          if (sameValue && oppositePolarity) {
            if (hasChange || incomingItem.userConfirmed) {
              return {
                mode: 'supersede',
                target: targetMem,
                scenario: incScene,
                topic: incTopic,
                reason: '偏好方向已明确反转，旧记忆转为历史并写入新偏好'
              };
            }
            return {
              mode: 'conflict_pending',
              target: targetMem,
              scenario: incScene,
              topic: incTopic,
              reason: '与已有记忆存在相反表述且未明确说明变更，标记为待确认冲突'
            };
          }

          // C4) 同偏好主题不同值（如 旧：喜欢草莓 -> 新：现在更喜欢芒果；或 简洁回答 vs 详细回答）
          if (differentValue) {
            var isSingleValSlot =
              incTopic.topic === 'reply_style_pref' ||
              incTopic.topic === 'user_location' ||
              incTopic.topic === 'user_name' ||
              incTopic.topic.indexOf('pref_subject:') === 0;
            var bothSuperlative = hasSuperlativePreferenceCue(content) && hasSuperlativePreferenceCue(targetMem.content);

            if (hasChange) {
              return {
                mode: 'supersede',
                target: targetMem,
                scenario: incScene,
                topic: incTopic,
                reason: '检测到同类偏好发生明确变化，旧偏好转入历史状态，新偏好生效'
              };
            }
            if (isSingleValSlot || bothSuperlative) {
              if (incomingItem.userConfirmed) {
                return {
                  mode: 'supersede',
                  target: targetMem,
                  scenario: incScene,
                  topic: incTopic,
                  reason: '用户确认更新同类偏好，旧偏好转入历史状态'
                };
              }
              return {
                mode: 'conflict_pending',
                target: targetMem,
                scenario: incScene,
                topic: incTopic,
                reason: '同场景下存在互斥偏好但未确认是否替换，保留原记忆并标记待确认冲突'
              };
            }
          }
        }
      }
    }

    return {
      mode: 'create',
      target: null,
      scenario: incScene,
      topic: incTopic,
      reason: '新增独立记忆'
    };
  }

  // ===== 4. 记忆重要程度动态评分（多因子动态计算，绝不自动删除） =====
  function scoreToImportance(score) {
    var s = Number(score) || 0;
    if (s >= 82) return 5;
    if (s >= 64) return 4;
    if (s >= 46) return 3;
    if (s >= 28) return 2;
    return 1;
  }

  // ===== 4A. 新记忆初始重要度评分（1~5分，仅基于内容与语义，不受「帮我记住」无条件拉满） =====
  function evaluateInitialImportance(memDraft, context) {
    var draft = memDraft && typeof memDraft === 'object' ? memDraft : {};
    var ctx = context && typeof context === 'object' ? context : {};

    // 存在明确手动评分标记时，严格尊重手动评分，绝不覆盖
    if (draft.manualImportance === true && draft.importance != null && Number.isFinite(Number(draft.importance))) {
      return Math.max(1, Math.min(5, Math.round(Number(draft.importance))));
    }

    var category = String(draft.category || '').trim();
    var content = String(draft.content || '').trim();
    var rawExpr = String(draft.rawExpression || ctx.rawUserText || '').trim();
    var combined = (content + ' ' + rawExpr).trim();
    var temporalState = String(draft.temporalState || 'current').trim().toLowerCase();
    var status = String(draft.status || 'active').trim().toLowerCase();
    var factType = String(draft.factType || '').trim().toLowerCase();
    var userConfirmed = draft.userConfirmed === true;

    if (!combined && !category) {
      return 3;
    }

    // 明确的长期性 / 持续性信号，用于防止「今天开始长期学习」被误判为一次性需求
    var strongLongTermRe = /(?:长期|一直|持续|坚持(?:每天|每周|打卡|学习|做)?|终身|常年|核心项目|人生目标|核心目标|长期目标|职业规划|未来(?:几年|三年|五年|十年))/;
    var hasStrongLongTerm = strongLongTermRe.test(combined);

    // 1) 一次性需求 / 短暂信息 → 1分
    var oneOffRe = /(?:今天(?:顺路|要去?|需要|下午|晚上|中午|打算|临时)|今晚(?:要去?|需要|打算|顺路|吃)?|明天(?:早上|上午|下午|晚上|要去?|顺路|需要)|待会儿|一会儿|马上要|顺路(?:去|拿|取|买|办|领)|(?:去)?(?:拿|取|领|寄)一下(?:快递|外卖|包裹|东西)?|查一下(?:快递|单号|订单|航班|天气|余额)|取件码|快递(?:单号|柜)?|外卖(?:订单)?|一次性|短暂(?:需求|信息)|临时(?:需要|需求|待办|用一下|买|查|帮我)|买(?:一)?(?:瓶|杯|个|份|袋)|下午.{0,6}(?:去|开会|拿|取|买))/;
    if (!hasStrongLongTerm && oneOffRe.test(combined)) {
      return 1;
    }

    // 非活跃/已结束状态（历史/取消/已完成/搁置）默认偏低
    if (
      status === 'cancelled' || temporalState === 'cancelled' ||
      status === 'completed' || temporalState === 'completed' ||
      status === 'historical' || temporalState === 'past' ||
      status === 'paused' || temporalState === 'paused'
    ) {
      return 2;
    }

    // 2) 短期安排 / 临时计划 → 2分
    var shortTermRe = /(?:这周|本周|下周|这几天|最近几天|本周末|这个周末|下周末|这阵子|近期(?:打算|安排|准备|计划)|短期(?:安排|计划|目标|内)|临时(?:计划|安排|兴趣|想法)|阶段性(?:计划|安排|想法)|暂时(?:打算|安排|计划)|打算(?:这周|下周|周末|近期|试一下|先试试)|先(?:试试|看看|试一下))/;
    if (!hasStrongLongTerm && (shortTermRe.test(combined) || temporalState === 'temporary')) {
      return 2;
    }

    // 3) 核心身份 / 长期重要项目 / 重要人生目标 → 5分
    var lifeGoalRe = /(?:人生目标|核心目标|长期目标|职业目标|职业规划|未来(?:三年|五年|十年|长期)|终身(?:目标|理想|梦想)|考研|考博|考公|留学|移民|创业|转型为|成为(?:一名)?|出版.{0,8}书|核心愿景|长期愿景|最重要.{0,6}(?:目标|项目|事情))/;
    var longTermProjectRe = /(?:正在开发|长期开发|持续开发|核心项目|主导项目|负责项目|独立开发|研发|打造.{0,12}(?:应用|系统|产品|平台|工作空间|工具|软件)|开发项目|项目[：:])/;
    var coreIdentityRe = /(?:我是(?:一名|一位|一个)?|名字叫|叫我|我叫|职业是|从事|工程师|开发者|架构师|设计师|产品经理|程序员|研究员|学生|研究生|博士|老师|教师|医生|律师|创始人|自由职业|母语是|定居在|常驻|专业是|本科|硕士|过敏|乳糖不耐)/;

    if (lifeGoalRe.test(combined)) {
      return 5;
    }
    if (category === '项目' || factType === 'project' || longTermProjectRe.test(combined)) {
      return 5;
    }
    if ((category === '身份信息' || factType === 'identity') && coreIdentityRe.test(combined)) {
      return 5;
    }
    if (coreIdentityRe.test(combined) && /(?:职业|工程师|开发者|架构师|设计师|产品经理|程序员|医生|教师|学生|研究生|创始人|自由职业|定居|名字叫|我叫|过敏)/.test(combined)) {
      return 5;
    }

    // 4) 普通个人信息 / 一般兴趣（需在稳定偏好之前识别「偶尔/一般兴趣/感兴趣」等低强度兴趣） → 3分
    var generalInterestRe = /(?:偶尔|有时(?:候)?|一般(?:兴趣|喜欢|爱好)|有点兴趣|挺感兴趣|比较感兴趣|感兴趣|业余(?:兴趣|爱好|喜欢)|闲暇时|空闲时|有空(?:时|的时候)?|随便看看|顺便了解)/;
    var strongStablePrefRe = /(?:最爱|最喜欢|一直喜欢|长期坚持|每天|每日|习惯|忌口|过敏|讨厌|坚决不|偏好.{0,8}(?:回答|回复|风格|简洁|详细))/;

    if (generalInterestRe.test(combined) && !strongStablePrefRe.test(combined)) {
      return 3;
    }

    // 5) 稳定偏好 / 长期习惯 / 持续学习计划 → 4分
    var continuousStudyRe = /(?:持续学习|长期学习|坚持学习|系统学习|每天学习|每周学习|准备(?:长期|系统|持续)?学习|正在(?:系统|持续)?学习|学习(?:计划|目标|路线)|准备学习|备考|进修|坚持(?:每天|每周|打卡))/;
    var habitRe = /(?:每天|每日|习惯|作息|早起|熬夜|固定(?:时间|习惯)?|总是|一直保持|长期坚持|每周都会|平时都)/;
    var stablePrefRe = /(?:喜欢|爱喝|爱吃|偏好|偏爱|钟爱|最爱|最喜欢|讨厌|不喜欢|不吃|不喝|忌口|常喝|常吃|希望.{0,10}(?:回复|回答|风格|简洁|详细))/;

    if (category === '长期计划' || continuousStudyRe.test(combined)) {
      return 4;
    }
    if (category === '习惯' || factType === 'habit' || habitRe.test(combined)) {
      return 4;
    }
    if (category === '偏好' || factType === 'preference' || stablePrefRe.test(combined)) {
      return 4;
    }
    if (category === '决定' || factType === 'decision') {
      return hasStrongLongTerm ? 4 : 3;
    }

    // 明确的高重要性语义强调（不含仅说「帮我记住」的普通语句）可在非临时/非一次性基础上微调
    var explicitHighImportanceRe = /(?:非常重要|特别重要|极其重要|很关键|对我(?:很|非常|特别)重要|核心原则)/;
    if (explicitHighImportanceRe.test(combined)) {
      return 4;
    }

    // 其余普通个人信息、备忘或无法可靠判断的内容默认 3 分（userConfirmed 不单独拉高分数）
    void userConfirmed;
    return 3;
  }

  // ===== 4B. 基于真实有效提及时间的温和渐进衰减（确定性计算，不修改原始 importance） =====
  var MIN_RELIABLE_TIMESTAMP = 946684800000; // 2000-01-01T00:00:00Z

  function isReliableTimestamp(ts, now) {
    var n = Number(ts);
    if (!Number.isFinite(n) || n < MIN_RELIABLE_TIMESTAMP) return false;
    if (now && n > now + 5 * 60 * 1000) return false;
    return true;
  }

  function getLastEffectiveMentionTimestamp(mem, nowTs) {
    if (!mem || typeof mem !== 'object') return 0;
    var now = Number(nowTs) || Date.now();
    var best = 0;

    // 1) 优先取各来源对话中记录的真实有效提及时间（普通编辑与 24h 内重试不会刷新此时间）
    if (Array.isArray(mem.sourceChats)) {
      for (var i = 0; i < mem.sourceChats.length; i++) {
        var sc = mem.sourceChats[i];
        if (sc && isReliableTimestamp(sc.mentionedAt, now)) {
          var sTs = Number(sc.mentionedAt);
          if (sTs > best) best = sTs;
        }
      }
    }

    // 2) 兜底检查 mem.mentionedAt（绝不读取 updatedAt，避免普通编辑与后台任务触发虚假提及）
    if (isReliableTimestamp(mem.mentionedAt, now)) {
      var mTs = Number(mem.mentionedAt);
      if (mTs > best) best = mTs;
    }

    // 3) 若上述均不可用，最后兜底 createdAt
    if (!(best > 0) && isReliableTimestamp(mem.createdAt, now)) {
      best = Number(mem.createdAt);
    }

    return best;
  }

  function computeTimeDecayPenalty(mem, nowTs) {
    if (!mem || typeof mem !== 'object') {
      return { penalty: 0, daysSinceMention: 0, lastMentionAt: 0, protectedReason: 'invalid_memory' };
    }
    var now = Number(nowTs) || Date.now();
    var lastMentionAt = getLastEffectiveMentionTimestamp(mem, now);

    // 1) 手动评分记忆完全不受自动时间衰减影响
    if (mem.manualImportance === true) {
      return {
        penalty: 0,
        daysSinceMention: lastMentionAt > 0 ? Math.max(0, (now - lastMentionAt) / DAY_MS) : 0,
        lastMentionAt: lastMentionAt,
        protectedReason: 'manual_importance'
      };
    }

    // 2) 无可靠时间戳的旧记忆安全兜底，绝不误判为过期或降权
    if (!(lastMentionAt > 0)) {
      return {
        penalty: 0,
        daysSinceMention: 0,
        lastMentionAt: 0,
        protectedReason: 'no_reliable_timestamp'
      };
    }

    var days = Math.max(0, (now - lastMentionAt) / DAY_MS);
    var imp = Math.max(1, Math.min(5, Math.round(Number(mem.importance) || 3)));
    var indepCount = (Number.isFinite(Number(mem.independentMentionCount)) && Number(mem.independentMentionCount) >= 1)
      ? Math.max(1, Math.round(Number(mem.independentMentionCount)))
      : 1;

    // 3) 宽限期：普通记忆 7 天内不衰减；importance === 5 核心记忆 30 天内不衰减
    if (days <= 7) {
      return { penalty: 0, daysSinceMention: days, lastMentionAt: lastMentionAt, protectedReason: 'recent_grace_period' };
    }
    if (imp === 5 && days <= 30) {
      return { penalty: 0, daysSinceMention: days, lastMentionAt: lastMentionAt, protectedReason: 'core_importance_grace' };
    }

    // 4) 分段线性温和渐进曲线（无突降悬崖，超过 365 天封顶，绝不无限衰减）
    var rawPenalty = 0;
    if (days <= 30) {
      rawPenalty = ((days - 7) / 23) * 6;
    } else if (days <= 90) {
      rawPenalty = 6 + ((days - 30) / 60) * 8;
    } else if (days <= 180) {
      rawPenalty = 14 + ((days - 90) / 90) * 8;
    } else if (days <= 365) {
      rawPenalty = 22 + ((days - 180) / 185) * 6;
    } else {
      rawPenalty = 28;
    }

    // 5) 重要度保护系数：importance=5 核心记忆大幅减缓（25% 速率且总衰减上限 6 分）
    var impFactor = 1.0;
    if (imp === 5) impFactor = 0.25;
    else if (imp === 4) impFactor = 0.75;
    else if (imp <= 2) impFactor = 1.15;

    // 6) 高频独立提及保护系数：独立提及越多，衰减越慢
    var mentionFactor = 1.0;
    if (indepCount >= 5) mentionFactor = 0.45;
    else if (indepCount >= 3) mentionFactor = 0.65;
    else if (indepCount >= 2) mentionFactor = 0.85;

    var maxCap = imp === 5 ? 6 : 32;
    var effectivePenalty = Math.min(maxCap, rawPenalty * impFactor * mentionFactor);
    effectivePenalty = Math.round(effectivePenalty * 10) / 10;

    return {
      penalty: effectivePenalty,
      daysSinceMention: days,
      lastMentionAt: lastMentionAt,
      protectedReason: imp === 5 ? 'core_importance_protected' : (indepCount >= 3 ? 'high_mention_protected' : '')
    };
  }

  function computeDynamicScore(mem, nowTs) {
    if (!mem || typeof mem !== 'object') return 45;
    var now = Number(nowTs) || Date.now();
    var status = String(mem.status || 'active').toLowerCase();
    var temporal = String(mem.temporalState || 'current').toLowerCase();
    var archived = mem.archived === true;
    var isActive = status === 'active' && !archived &&
      temporal !== 'cancelled' && temporal !== 'completed' &&
      temporal !== 'past' && temporal !== 'paused';

    var imp = Math.max(1, Math.min(5, Math.round(Number(mem.importance) || 3)));
    var impBaseMap = { 1: 34, 2: 46, 3: 58, 4: 72, 5: 86 };
    var score = impBaseMap[imp] != null ? impBaseMap[imp] : 58;

    // 1) 手动评分记忆完全不受自动时间衰减影响，按手动重要度锚定（仅保留非活跃状态降权以防错误召回）
    if (mem.manualImportance === true) {
      if (status === 'cancelled' || temporal === 'cancelled') {
        score -= 28;
      } else if (status === 'historical' || temporal === 'past') {
        score -= 22;
      } else if (status === 'completed' || temporal === 'completed') {
        score -= 20;
      } else if (status === 'paused' || temporal === 'paused') {
        score -= 14;
      }
      if (archived) {
        score -= 12;
      }
      return Math.max(5, Math.min(100, Math.round(score)));
    }

    // 2) 高频独立提及加权（仅作用于当前活跃记忆，不依赖易被重试拉高的旧 mentionCount）
    var indepCount = (Number.isFinite(Number(mem.independentMentionCount)) && Number(mem.independentMentionCount) >= 1)
      ? Math.max(1, Math.round(Number(mem.independentMentionCount)))
      : 1;
    if (isActive && indepCount > 1) {
      score += Math.min(12, (indepCount - 1) * 3);
    }

    // 3) 温和的近期召回使用正向参考（仅活跃记忆，上限 6 分）
    var usage = Math.max(0, Number(mem.usageCount) || 0);
    if (isActive && usage > 0) {
      score += Math.min(6, usage * 2);
    }

    // 4) 非活跃 / 过时状态明确降权，绝不作为当前活跃记忆提升召回优先级
    if (status === 'cancelled' || temporal === 'cancelled') {
      score -= 28;
    } else if (status === 'historical' || temporal === 'past') {
      score -= 22;
    } else if (status === 'completed' || temporal === 'completed') {
      score -= 20;
    } else if (status === 'paused' || temporal === 'paused') {
      score -= 14;
    }
    if (archived) {
      score -= 12;
    }

    // 5) 活跃记忆应用确定性温和渐进时间衰减（基于真实有效提及时间，绝不重复扣分）
    if (isActive) {
      var decay = computeTimeDecayPenalty(mem, now);
      score -= decay.penalty;
    }

    return Math.max(5, Math.min(100, Math.round(score)));
  }

  // ===== 5. 记忆关联关系网络（具体实体提取 + 严格防通用词误关联 + 删除断链清理） =====
  function isValidConcreteEntity(raw) {
    var clean = String(raw || '').trim().toLowerCase().replace(/^[\s：:「《"'(（]+|[\s」》"')）]+$/g, '');
    if (!clean || clean.length < 2 || clean.length > 24) return false;
    if (GENERIC_STOP_ENTITIES.has(clean)) return false;
    if (/^\d+$/.test(clean)) return false;
    if (/^(?:一款|一个|这个|那个|我的|用户|目前|正在|已经|以后|最近)/.test(clean)) return false;
    return true;
  }

  function extractConcreteEntities(memOrText) {
    var content = typeof memOrText === 'string'
      ? memOrText
      : String((memOrText && memOrText.content) || '');
    var projectId = (memOrText && typeof memOrText === 'object') ? String(memOrText.projectId || '').trim() : '';
    var entities = [];
    var seen = {};

    function addEnt(val) {
      var clean = String(val || '').trim().toLowerCase().replace(/\s+/g, '');
      if (!isValidConcreteEntity(clean) || seen[clean]) return;
      seen[clean] = true;
      entities.push(clean);
    }

    if (projectId) {
      addEnt('proj:' + projectId);
    }

    // 1) 已知领域/项目/技术/语言实体
    for (var k = 0; k < KNOWN_DOMAIN_ENTITIES.length; k++) {
      if (KNOWN_DOMAIN_ENTITIES[k].re.test(content)) {
        addEnt(KNOWN_DOMAIN_ENTITIES[k].key);
      }
    }

    // 2) 引号/书名号内的专有名词
    var quoteMatches = content.match(/[「《"']([\u4e00-\u9fa5A-Za-z0-9_+#-]{2,18})[」》"']/g) || [];
    for (var q = 0; q < quoteMatches.length; q++) {
      addEnt(quoteMatches[q].slice(1, -1));
    }

    // 3) 结构化冒号定义：项目：知屿 / 目标：开发 AI 工作空间 / 技术：原生 JavaScript / 计划：完善长期记忆系统
    var colonRe = /(?:项目|产品|应用|工具|技术栈?|语言|框架)[：:]\s*([\u4e00-\u9fa5A-Za-z0-9_+#\s-]{2,20}?)(?:[，。；！？、\n]|$)/g;
    var cm;
    while ((cm = colonRe.exec(content)) !== null) {
      if (cm[1]) addEnt(cm[1]);
    }

    // 4) 动词后的项目名 / 学习对象
    var projVerb = content.match(/(?:正在开发|在开发|开发|研发|打造|推进|完成|已完成)(?:项目[：:「]?)?([\u4e00-\u9fa5A-Za-z0-9]{2,12}?)(?:项目|应用|软件|系统|一期|二期|版本|[」』，。；！]|$)/);
    if (projVerb && projVerb[1]) {
      addEnt(projVerb[1]);
    }
    var learnVerb = content.match(/(?:学习|备考|进修|练习)([\u4e00-\u9fa5A-Za-z0-9]{2,10}?)(?:计划|目标|课程|考试|[，。；！]|$)/);
    if (learnVerb && learnVerb[1]) {
      addEnt(learnVerb[1]);
    }

    // 5) 具体英文专有名词（排除泛词）
    var enWords = content.match(/\b[A-Za-z][A-Za-z0-9_+#.-]{2,18}\b/g) || [];
    var enStop = { user: 1, todo: 1, plan: 1, task: 1, like: 1, love: 1, want: 1, need: 1, good: 1, very: 1, that: 1, this: 1, with: 1, from: 1 };
    for (var e = 0; e < enWords.length; e++) {
      var lw = enWords[e].toLowerCase();
      if (!enStop[lw] && lw !== 'ai') addEnt(lw);
    }

    return entities.slice(0, 12);
  }

  function classifyProjectFacetRole(mem) {
    var content = String((mem && mem.content) || '');
    var cat = String((mem && mem.category) || '');
    if (/^(?:技术|技术栈)[：:]|(?:使用|采用|基于).{0,10}(?:原生|javascript|typescript|react|vue|python|node|dexie|html|css|前端|后端)/i.test(content)) {
      return 'tech';
    }
    if (/^(?:目标|愿景|方向)[：:]|(?:目标是|用于开发|打造|工作空间)/.test(content)) {
      return 'goal';
    }
    if (/^(?:计划|里程碑)[：:]|长期记忆|记忆系统|记忆管理|语义理解|架构|版本|迭代/.test(content) && (cat === '长期计划' || cat === '项目' || /计划|完善|推进|开发/.test(content))) {
      return 'plan';
    }
    if (cat === '项目' || /^(?:项目)[：:]|(?:正在开发|在开发|开发项目)/.test(content)) {
      return 'project';
    }
    return '';
  }

  function isSoftwareEngineeringContext(mem) {
    var content = String((mem && mem.content) || '');
    var cat = String((mem && mem.category) || '');
    if (cat === '项目') return true;
    return /(?:知屿|工作空间|javascript|typescript|dexie|react|vue|python|node|html|css|前端|后端|长期记忆|记忆系统|语义理解|技术[：:]|目标[：:]开发|项目[：:])/i.test(content);
  }

  function pickFacetRelation(memA, memB, sharedLabel) {
    var roleA = classifyProjectFacetRole(memA);
    var roleB = classifyProjectFacetRole(memB);
    if (roleB === 'tech') {
      return { type: 'uses_tech', label: RELATION_LABELS.uses_tech, reason: sharedLabel || '关联项目技术栈' };
    }
    if (roleB === 'goal') {
      return { type: 'supports_goal', label: RELATION_LABELS.supports_goal, reason: sharedLabel || '关联项目目标' };
    }
    if (roleB === 'plan') {
      return { type: 'related_plan', label: RELATION_LABELS.related_plan, reason: sharedLabel || '关联推进计划' };
    }
    if (roleA === 'project' || roleB === 'project') {
      return { type: 'project_part', label: RELATION_LABELS.project_part, reason: sharedLabel || '同项目关联' };
    }
    return { type: 'related_entity', label: RELATION_LABELS.related_entity, reason: sharedLabel || '共同主题关联' };
  }

  function inferPairRelation(memA, memB) {
    if (!memA || !memB || !memA.id || !memB.id || memA.id === memB.id) return null;

    // 1) 明确的替代/更新链
    if (memA.supersedesId && memA.supersedesId === memB.id) {
      return { type: 'supersedes', label: RELATION_LABELS.supersedes, reason: '由历史记忆更新而来' };
    }
    if (memA.supersededById && memA.supersededById === memB.id) {
      return { type: 'superseded_by', label: RELATION_LABELS.superseded_by, reason: '已被较新记忆替代' };
    }
    if (memB.supersedesId && memB.supersedesId === memA.id) {
      return { type: 'superseded_by', label: RELATION_LABELS.superseded_by, reason: '已被较新记忆替代' };
    }

    // 2) 待确认冲突
    var conflictsA = Array.isArray(memA.conflictWithIds) ? memA.conflictWithIds : [];
    var conflictsB = Array.isArray(memB.conflictWithIds) ? memB.conflictWithIds : [];
    if (conflictsA.indexOf(memB.id) !== -1 || conflictsB.indexOf(memA.id) !== -1) {
      return { type: 'conflict', label: RELATION_LABELS.conflict, reason: '存在待确认偏好/事实冲突' };
    }

    // 3) 明确属于同一 projectId
    if (memA.projectId && memB.projectId && memA.projectId === memB.projectId) {
      return pickFacetRelation(memA, memB, '同一项目上下文');
    }

    // 4) 共享具体非泛化实体（严格禁止仅凭“喜欢”“计划”等通用词关联）
    var entsA = (Array.isArray(memA.entities) && memA.entities.length) ? memA.entities : extractConcreteEntities(memA);
    var entsB = (Array.isArray(memB.entities) && memB.entities.length) ? memB.entities : extractConcreteEntities(memB);
    var sharedEntities = [];
    for (var i = 0; i < entsA.length; i++) {
      var ea = entsA[i];
      if (!isValidConcreteEntity(ea)) continue;
      for (var j = 0; j < entsB.length; j++) {
        var eb = entsB[j];
        if (!isValidConcreteEntity(eb)) continue;
        if (ea === eb || (ea.length >= 2 && eb.length >= 2 && (ea.indexOf(eb) !== -1 || eb.indexOf(ea) !== -1))) {
          if (sharedEntities.indexOf(ea) === -1) sharedEntities.push(ea);
        }
      }
    }
    if (sharedEntities.length > 0) {
      return pickFacetRelation(memA, memB, '共同实体：' + sharedEntities.slice(0, 2).join('、'));
    }

    // 5) 同源对话内的软件项目锚点与项目维度（项目 <-> 目标 / 技术 / 计划）
    var sameChat = !!(memA.sourceChatId && memB.sourceChatId && memA.sourceChatId === memB.sourceChatId);
    if (sameChat && isSoftwareEngineeringContext(memA) && isSoftwareEngineeringContext(memB)) {
      var roleA = classifyProjectFacetRole(memA);
      var roleB = classifyProjectFacetRole(memB);
      if (roleA && roleB && (roleA === 'project' || roleB === 'project' || roleA !== roleB)) {
        return pickFacetRelation(memA, memB, '同项目对话中的关联维度');
      }
    }

    return null;
  }

  function relationsEqual(listA, listB) {
    var a = Array.isArray(listA) ? listA : [];
    var b = Array.isArray(listB) ? listB : [];
    if (a.length !== b.length) return false;
    var mapA = {};
    for (var i = 0; i < a.length; i++) {
      mapA[a[i].targetId + ':' + a[i].type] = a[i].label || '';
    }
    for (var j = 0; j < b.length; j++) {
      var key = b[j].targetId + ':' + b[j].type;
      if (mapA[key] === undefined) return false;
    }
    return true;
  }

  async function syncRelationsForMemory(targetId, userId) {
    var store = S();
    if (!store || !targetId) return 0;
    var all = await store.listMemories(userId ? { userId: userId } : {});
    var target = all.find(function(m) { return m && m.id === targetId; });
    if (!target) return 0;

    var now = Date.now();
    var targetEnts = extractConcreteEntities(target);
    target.entities = targetEnts;
    var targetRelations = [];
    var touchedCount = 0;

    for (var i = 0; i < all.length; i++) {
      var peer = all[i];
      if (!peer || peer.id === target.id) continue;
      if (peer.userId !== target.userId) continue;

      var peerEnts = (Array.isArray(peer.entities) && peer.entities.length) ? peer.entities : extractConcreteEntities(peer);
      peer.entities = peerEnts;

      var forward = inferPairRelation(target, peer);
      var backward = inferPairRelation(peer, target);

      if (forward) {
        targetRelations.push({
          targetId: peer.id,
          type: forward.type,
          label: forward.label,
          reason: forward.reason,
          updatedAt: now
        });
      }

      var prevPeerRels = Array.isArray(peer.relations) ? peer.relations : [];
      var filteredPeerRels = prevPeerRels.filter(function(r) { return r && r.targetId !== target.id; });
      if (backward) {
        filteredPeerRels.unshift({
          targetId: target.id,
          type: backward.type,
          label: backward.label,
          reason: backward.reason,
          updatedAt: now
        });
      }
      if (!relationsEqual(prevPeerRels, filteredPeerRels)) {
        await store.updateMemory(peer.id, {
          entities: peerEnts,
          relations: filteredPeerRels.slice(0, 16)
        }, { preserveUpdatedAt: true, skipHistoryPush: true });
        touchedCount++;
      }
    }

    if (!relationsEqual(target.relations, targetRelations) || JSON.stringify(target.entities || []) !== JSON.stringify(targetEnts)) {
      await store.updateMemory(target.id, {
        entities: targetEnts,
        relations: targetRelations.slice(0, 16)
      }, { preserveUpdatedAt: true, skipHistoryPush: true });
      touchedCount++;
    }
    return touchedCount;
  }

  async function rebuildRelationGraph(userId) {
    var store = S();
    if (!store) return { updatedCount: 0, edgeCount: 0 };
    var all = await store.listMemories(userId ? { userId: userId } : {});
    var validIds = new Set(all.map(function(m) { return m.id; }));
    var now = Date.now();
    var updatedCount = 0;
    var edgeCount = 0;

    // 先统一计算最新实体
    for (var e = 0; e < all.length; e++) {
      all[e]._nextEntities = extractConcreteEntities(all[e]);
      all[e].entities = all[e]._nextEntities;
    }

    for (var i = 0; i < all.length; i++) {
      var memA = all[i];
      var nextRels = [];
      for (var j = 0; j < all.length; j++) {
        if (i === j) continue;
        var memB = all[j];
        if (memA.userId !== memB.userId) continue;
        var rel = inferPairRelation(memA, memB);
        if (rel) {
          nextRels.push({
            targetId: memB.id,
            type: rel.type,
            label: rel.label,
            reason: rel.reason,
            updatedAt: now
          });
        }
      }
      edgeCount += nextRels.length;

      var cleanConflicts = (Array.isArray(memA.conflictWithIds) ? memA.conflictWithIds : []).filter(function(cid) {
        return validIds.has(cid) && cid !== memA.id;
      });
      var cleanSup = memA.supersedesId && validIds.has(memA.supersedesId) ? memA.supersedesId : '';
      var cleanSupBy = memA.supersededById && validIds.has(memA.supersededById) ? memA.supersededById : '';

      var changed = !relationsEqual(memA.relations, nextRels) ||
        cleanConflicts.length !== (memA.conflictWithIds || []).length ||
        cleanSup !== (memA.supersedesId || '') ||
        cleanSupBy !== (memA.supersededById || '');

      if (changed) {
        await store.updateMemory(memA.id, {
          entities: memA._nextEntities,
          relations: nextRels.slice(0, 16),
          conflictWithIds: cleanConflicts,
          supersedesId: cleanSup,
          supersededById: cleanSupBy
        }, { preserveUpdatedAt: true, skipHistoryPush: true });
        updatedCount++;
      }
    }

    return { updatedCount: updatedCount, edgeCount: edgeCount };
  }

  async function cleanupRelationsAfterDelete(deletedId, userId) {
    var store = S();
    if (!store || !deletedId) return 0;
    var all = await store.listMemories(userId ? { userId: userId } : {});
    var touched = 0;
    for (var i = 0; i < all.length; i++) {
      var mem = all[i];
      if (!mem || mem.id === deletedId) continue;
      var changed = false;
      var nextRels = (Array.isArray(mem.relations) ? mem.relations : []).filter(function(r) {
        if (r && r.targetId === deletedId) {
          changed = true;
          return false;
        }
        return true;
      });
      var nextConflicts = (Array.isArray(mem.conflictWithIds) ? mem.conflictWithIds : []).filter(function(cid) {
        if (cid === deletedId) {
          changed = true;
          return false;
        }
        return true;
      });
      var nextSup = mem.supersedesId === deletedId ? '' : mem.supersedesId;
      var nextSupBy = mem.supersededById === deletedId ? '' : mem.supersededById;
      if (nextSup !== mem.supersedesId || nextSupBy !== mem.supersededById) changed = true;

      var nextConflictState = mem.conflictState;
      if (nextConflictState === 'pending_confirmation' && nextConflicts.length === 0) {
        nextConflictState = 'none';
        changed = true;
      }

      if (changed) {
        await store.updateMemory(mem.id, {
          relations: nextRels,
          conflictWithIds: nextConflicts,
          conflictState: nextConflictState,
          supersedesId: nextSup,
          supersededById: nextSupBy
        }, { preserveUpdatedAt: true, skipHistoryPush: true });
        touched++;
      }
    }
    return touched;
  }

  // ===== 6. 过时记忆识别与归档（绝不自动删除，完整保留历史并支持恢复与召回） =====
  function evaluateArchiveEligibility(mem, nowTs) {
    if (!mem || typeof mem !== 'object') return { shouldArchive: false, reason: '' };
    if (mem.archived === true) return { shouldArchive: false, reason: mem.archiveReason || '' };

    var now = Number(nowTs) || Date.now();
    var st = String(mem.status || 'active').toLowerCase();
    var ts = String(mem.temporalState || 'current').toLowerCase();

    if (st === 'completed' || ts === 'completed') {
      return { shouldArchive: true, reason: '项目或计划已完成，已自动归档留存' };
    }
    if (st === 'cancelled' || ts === 'cancelled') {
      return { shouldArchive: true, reason: '任务或计划已取消，已自动归档留存' };
    }
    if (st === 'historical' || ts === 'past') {
      return { shouldArchive: true, reason: '偏好或事实已被更新替代，已自动归档留存' };
    }

    var refActivity = Math.max(Number(mem.lastUsedAt) || 0, Number(mem.updatedAt) || 0, Number(mem.createdAt) || now);
    var idleDays = Math.max(0, (now - refActivity) / DAY_MS);
    var dynScore = computeDynamicScore(mem, now);
    var usage = Math.max(0, Number(mem.usageCount) || 0);
    if (st === 'active' && !mem.userConfirmed && usage === 0 && idleDays >= STALE_ARCHIVE_DAYS && (mem.category === '备忘' || dynScore < 34)) {
      return { shouldArchive: true, reason: '超过 30 天未使用且重要度较低，已自动归档' };
    }

    return { shouldArchive: false, reason: '' };
  }

  async function archiveMemory(id, reason) {
    var store = S();
    if (!store || !id) return null;
    var existing = await store.getMemory(id);
    if (!existing) return null;
    var now = Date.now();
    var nextDraft = Object.assign({}, existing, {
      archived: true,
      archivedAt: now,
      archiveReason: String(reason || '手动归档留存').slice(0, 140)
    });
    var nextScore = computeDynamicScore(nextDraft, now);
    return await store.updateMemory(id, {
      archived: true,
      archivedAt: now,
      archiveReason: nextDraft.archiveReason,
      dynamicScore: nextScore,
      importance: existing.manualImportance ? existing.importance : scoreToImportance(nextScore)
    }, { skipHistoryPush: true });
  }

  async function unarchiveMemory(id) {
    var store = S();
    if (!store || !id) return null;
    var existing = await store.getMemory(id);
    if (!existing) return null;
    var now = Date.now();
    var nextStatus = existing.status;
    var nextTemporal = existing.temporalState;
    if (nextStatus === 'historical' || nextStatus === 'completed' || nextStatus === 'cancelled') {
      nextStatus = 'active';
      nextTemporal = 'current';
    }
    var nextDraft = Object.assign({}, existing, {
      archived: false,
      archivedAt: 0,
      archiveReason: '',
      status: nextStatus,
      temporalState: nextTemporal
    });
    var nextScore = computeDynamicScore(nextDraft, now);
    return await store.updateMemory(id, {
      archived: false,
      archivedAt: 0,
      archiveReason: '',
      status: nextStatus,
      temporalState: nextTemporal,
      dynamicScore: nextScore,
      importance: existing.manualImportance ? existing.importance : scoreToImportance(nextScore)
    }, { historyReason: '从归档恢复为当前有效' });
  }

  // ===== 7. 被召回记忆的使用频率记录（绝不新增记忆） =====
  async function recordMemoriesRecalled(memories) {
    var store = S();
    if (!store || !Array.isArray(memories) || !memories.length) return 0;
    var now = Date.now();
    var updated = 0;
    for (var i = 0; i < memories.length; i++) {
      var m = memories[i];
      if (!m || !m.id) continue;
      var latest = await store.getMemory(m.id);
      if (!latest) continue;
      var nextUsage = (Number(latest.usageCount) || 0) + 1;
      var nextDraft = Object.assign({}, latest, {
        usageCount: nextUsage,
        lastUsedAt: now
      });
      var nextScore = computeDynamicScore(nextDraft, now);
      await store.updateMemory(latest.id, {
        usageCount: nextUsage,
        lastUsedAt: now,
        dynamicScore: nextScore
      }, { preserveUpdatedAt: true, skipHistoryPush: true });
      updated++;
    }
    return updated;
  }

  // ===== 8. 存量记忆智能整理（仅对已有记忆去重/评分/关联/归档，绝不自动新增，绝不自动删除唯一记忆） =====
  async function deduplicateExistingMemories(userId) {
    var store = S();
    if (!store) return 0;
    var all = await store.listMemories(userId ? { userId: userId } : {});
    var active = all.filter(function(m) {
      return m && (m.status || 'active') === 'active' && !m.archived;
    });
    var removedIds = new Set();
    var mergedCount = 0;

    for (var i = 0; i < active.length; i++) {
      var keep = active[i];
      if (!keep || removedIds.has(keep.id)) continue;
      var keepScene = keep.scenario ? keep.scenario : extractScenarioContext(keep.content).code;

      for (var j = i + 1; j < active.length; j++) {
        var dup = active[j];
        if (!dup || removedIds.has(dup.id)) continue;
        if (keep.scope !== dup.scope || keep.projectId !== dup.projectId) continue;

        var dupScene = dup.scenario ? dup.scenario : extractScenarioContext(dup.content).code;
        if (!areScenariosCompatible(keepScene, dupScene)) continue;

        if (isSemanticDuplicatePair(dup.content, dup.category, keep)) {
          var patch = buildMergedMemoryPatch(keep, dup, {
            chatId: dup.sourceChatId,
            chatTitle: dup.sourceChatTitle,
            rawUserText: dup.rawExpression || dup.content,
            mergeReason: '智能整理：同义记忆合并去重',
            isMaintenanceMerge: true
          });
          var updatedKeep = await store.updateMemory(keep.id, patch, { historyReason: '同义记忆合并' });
          if (updatedKeep) {
            keep = updatedKeep;
            active[i] = updatedKeep;
          }
          removedIds.add(dup.id);
          await store.deleteMemory(dup.id);
          // 合并去重不应在墓碑中拦截存活的合并结果
          if (typeof store.removeDeletedMemorySignatureByContent === 'function') {
            await store.removeDeletedMemorySignatureByContent(dup.content);
          }
          mergedCount++;
        }
      }
    }
    return mergedCount;
  }

  async function runLifecycleMaintenance(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var store = S();
    if (!store) {
      return { mergedCount: 0, archivedCount: 0, rescoredCount: 0, linkedCount: 0, totalCount: 0, createdCount: 0 };
    }
    var userId = String(opts.userId || 'local_user').trim() || 'local_user';
    var now = Number(opts.now) || Date.now();

    // 1) 同义记忆去重合并（仅操作存量记忆，绝不新增）
    var mergedCount = opts.skipDeduplicate ? 0 : await deduplicateExistingMemories(userId);

    // 2) 过时识别与归档 + 3) 动态重要度重算（绝不自动删除）
    var all = await store.listMemories({ userId: userId });
    var archivedCount = 0;
    var rescoredCount = 0;

    for (var i = 0; i < all.length; i++) {
      var mem = all[i];
      if (!mem) continue;
      var patch = {};
      var changed = false;

      if (!mem.scenario) {
        var sc = extractScenarioContext(mem.content);
        if (sc.code) {
          patch.scenario = sc.code;
          patch.scenarioLabel = sc.label;
          changed = true;
        }
      }

      var archEval = evaluateArchiveEligibility(mem, now);
      if (archEval.shouldArchive && !mem.archived) {
        patch.archived = true;
        patch.archivedAt = now;
        patch.archiveReason = archEval.reason;
        changed = true;
        archivedCount++;
      }

      var candidateForScore = Object.assign({}, mem, patch);
      var nextScore = computeDynamicScore(candidateForScore, now);
      if (nextScore !== mem.dynamicScore) {
        patch.dynamicScore = nextScore;
        changed = true;
        rescoredCount++;
      }

      if (changed) {
        await store.updateMemory(mem.id, patch, { preserveUpdatedAt: true, skipHistoryPush: true });
      }
    }

    // 4) 重建关联关系网络并清理断链
    var graphRes = await rebuildRelationGraph(userId);
    var finalAll = await store.listMemories({ userId: userId });

    return {
      mergedCount: mergedCount,
      archivedCount: archivedCount,
      rescoredCount: rescoredCount,
      linkedCount: graphRes.updatedCount || 0,
      edgeCount: graphRes.edgeCount || 0,
      totalCount: finalAll.length,
      createdCount: 0
    };
  }

  global.AiWorkspaceMemoryManager = {
    SCENARIO_RULES: SCENARIO_RULES,
    RELATION_LABELS: RELATION_LABELS,
    STALE_ARCHIVE_DAYS: STALE_ARCHIVE_DAYS,
    extractScenarioContext: extractScenarioContext,
    areScenariosCompatible: areScenariosCompatible,
    isTemporaryChangeExpression: isTemporaryChangeExpression,
    isAmbiguousPreferenceExpression: isAmbiguousPreferenceExpression,
    hasExplicitChangeCue: hasExplicitChangeCue,
    extractPreferenceTopic: extractPreferenceTopic,
    isSemanticDuplicatePair: isSemanticDuplicatePair,
    mergeMemoryContents: mergeMemoryContents,
    buildMergedMemoryPatch: buildMergedMemoryPatch,
    getIndependentMentionBoost: getIndependentMentionBoost,
    evaluateIndependentMention: evaluateIndependentMention,
    analyzeIncomingAgainstExisting: analyzeIncomingAgainstExisting,
    computeDynamicScore: computeDynamicScore,
    getLastEffectiveMentionTimestamp: getLastEffectiveMentionTimestamp,
    computeTimeDecayPenalty: computeTimeDecayPenalty,
    scoreToImportance: scoreToImportance,
    evaluateInitialImportance: evaluateInitialImportance,
    extractConcreteEntities: extractConcreteEntities,
    inferPairRelation: inferPairRelation,
    syncRelationsForMemory: syncRelationsForMemory,
    rebuildRelationGraph: rebuildRelationGraph,
    cleanupRelationsAfterDelete: cleanupRelationsAfterDelete,
    evaluateArchiveEligibility: evaluateArchiveEligibility,
    archiveMemory: archiveMemory,
    unarchiveMemory: unarchiveMemory,
    recordMemoriesRecalled: recordMemoriesRecalled,
    deduplicateExistingMemories: deduplicateExistingMemories,
    runLifecycleMaintenance: runLifecycleMaintenance
  };
})(typeof window !== 'undefined' ? window : globalThis);
