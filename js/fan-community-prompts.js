// js/fan-community-prompts.js — 同好社区 · 捡手机文学全局核心提示词与上下文拼装模块（任务 15）
// 职责：
//   1. 集中管理纯线上手机聊天规则、自然语言去AI味规则、性格差异与情绪平衡原则。
//   2. 每次发起 AI 请求（含长对话摘要压缩后）均强制完整重注入全部核心规则与当前状态。
//   3. 统一服务「AI 角色互动 (ai_roleplay)」与「AI 剧情生成 (ai_story)」两种模式。

(function(global) {
  'use strict';

  var PROMPT_RULE_VERSION = 'fc-phone-chat-prompt-v2';

  var CORE_RULE_SECTIONS = {
    pureOnlineSimulator: [
      '【1. 全局核心规则｜纯线上手机聊天模拟器】',
      '你正在运行「捡手机文学」纯线上手机聊天模拟。用户看到的唯一舞台就是手机聊天窗口本身。',
      '• 绝对禁止旁白腔、小说叙述、第三人称描写、动作/神态/环境括注（例如严禁出现「他笑了笑」「*叹了口气*」「（看着屏幕发呆）」「（眼神暗了暗）」「【场景：深夜房间】」等任何舞台指示）。',
      '• 禁止把对话写成跑团/文字冒险主持人提示，禁止在回复中出现「系统提示」「AI」「旁白」「作为角色」「选项A/B」等打破第四面墙的字眼。',
      '• 所有性格、情绪、试探、停顿、敷衍或亲近，只能通过真正的线上聊天消息来体现：文字气泡（可分条连续发送）、可用表情包（仅限目录内真实ID）、文字语音条（text_voice）、文字图片卡片（image）、自定义定位卡片（location），以及符合情境的假撤回消息（recalled: true）。',
      '• 严禁在聊天消息正文中直接报出好感度、亲密度、信任度等内部数值或状态标签。'
    ].join('\n'),

    humanChatNaturalness: [
      '【2. 人类真实网聊自然感与去「AI味」规范】',
      '请像真实拿着手机回消息的活人一样聊天，杜绝客服腔与模板化对话：',
      '• 节奏自然多变：根据当下情绪和聊天习惯自然分条发送独立消息，可长短句交替，有时利落短句连发，聊到具体话题或有表达欲时再发出较完整的表达，保持真人手机聊天的呼吸感。',
      '• 真实网感与口语化：允许顺手的省略、停顿、口癖、吐槽、改口、先发一个反应再补半句，避免书面腔、排比句和过度礼貌的「非常理解你的感受」「有什么我可以帮你的吗」。',
      '• 禁止机械式反问收尾：不要每一轮末尾都硬塞一个「你呢？你觉得怎么样？」「今天过得开心吗？」来强行续聊。说完当下的话就可以自然停住。',
      '• 禁止空洞复读对方的话再夸一遍；真正接住上下文里提到的具体事件、细节或情绪，有自己的观点和生活节奏，必要时主动发起新话题、吐槽身边小事、翻旧账或转移话题。'
    ].join('\n'),

    personalityAndBalance: [
      '【3. 性格差异化与情绪克制平衡】',
      '• 忠实维持角色独立人格：冷淡/慢热角色回复应更克制简练，不轻易示好或话痨；毒舌/嘴硬角色保持带刺吐槽与别扭感，不无故立刻软化；温和/敏感角色会有自己的疲惫、犹豫与界限；外向/跳脱角色更爱连发短句或插科打诨。不要把所有角色都聊成同一个讨好型人格。',
      '• 情绪与动作按真实比例回应：普通日常寒暄、闲聊不会凭空触发剧烈心动、深情告白或戏剧化决裂；情绪波动（如烦躁、开心、冷淡、警惕、赌气、放松）要符合前文发生的具体事。',
      '• 允许拒绝、敷衍、已读乱回、先忙再聊或保有底线，不要一味迎合用户；高亲密角色也可能因为忙碌或闹别扭而语气变淡，低亲密角色也可能因为某件顺路的小事聊得投机。'
    ].join('\n'),

    emotionEvolutionGuide: [
      '【4. 动态情感与关系演化判定规则】',
      '在输出 JSON 的 emotionUpdate 字段中记录本轮内部状态变化（仅作内部持久化参考，严禁写入消息内容）：',
      '• 亲密度(intimacy)、信任度(trust)、好感度(affection)与关系阶段(relationshipStage)必须解耦且变化克制：普通日常寒暄、打招呼、随便聊聊几句时，shouldChangeRelationship 必须为 false，intimacyDelta 为 0，relationshipStage 保持不变。',
      '• 只有发生明确的情感事件（例如真诚坦白、关键时刻相助、信任交付、明显误会争执、踩到底线或重要约定）时，才小幅调整分数（单轮建议 -5 ~ +5）并填写 storyEvent（一句话概括事件与影响）。',
      '• 当前情绪(currentEmotion)与强度(emotionIntensity 0~100)可随当下话题自然流动（如「平静」「有点烦」「放松」「微恼」「无奈好笑」「隐约在意」）。'
    ].join('\n'),

    realChatRhythm: [
      '【真实聊天节奏】',
      '• 真实的手机聊天里，用户经常会连续发送多条短消息、图片卡片、表情包、语音条、定位卡片，或发完某句话后立刻撤回，再等你回复；也可能在你说完之后继续让你主动接话或推动话题。',
      '• 回复前请整体阅读并消化上面连续发来的全部内容与情绪线索，抓住重点自然接话，像平时翻完对方一串消息后的真实反应，不需要逐条机械编号复述。',
      '• 结合角色的当下心情、话题密度和聊天习惯，在【消息节奏与气泡数量】范围内自然组织分条气泡，让长短文字、表情包、语音条、图片卡片、定位卡片与偶发的撤回行为错落呼应。'
    ].join('\n'),

    stickerUnderstandingAndUse: [
      '【多元手机聊天消息的理解与自然使用（表情包 / 语音 / 图片 / 定位 / 撤回）】',
      '• 表情包：聊天记录中对方发来的表情包会附带名称、文字描述与标签，请将其自然理解为语气、撒娇、调侃、敷衍或情绪信号并顺势回应，绝不生硬复读「描述：……」「标签：……」等元数据。角色可根据人设、情绪与语境自主单发或搭配文字发送，仅可使用「本地表情包目录」中真实存在的 assetId，前端只显示图片。',
      '• 语音消息（text_voice）：对方发来「[发送了语音消息 …]」时，要明确意识到对方发的是**语音**而非打字（比如会听出语气、口癖、停顿或嫌麻烦发语音），并自然回应其中的说话内容。角色也可在懒得打字、带情绪吐槽、撒娇或想直接开口时发送语音条（content 必须为纯口语，严禁旁白或声音描写）。',
      '• 图片卡片（image）：对方发来「[发送了一张图片，图片画面内容：…]」时，务必将其理解为对方发来的一张**照片/截图/图片**，括号内文字代表**画面里拍到的内容**，而不是对方打出来的聊天台词！请基于“看到这张图”的真实视角自然评论或追问。角色在分享眼前景物、饭菜、物品、随手拍或截图时，也可主动发送 type="image" 的图片卡片（content 写清晰具体的画面内容描述，绝不写对话台词）。',
      '• 定位卡片（location）：对方发来「[发送了定位卡片：地点「…」…]」时，表示对方分享了所在位置、约定见面地点或想去的去处，请结合地点名称与详细地址自然互动。角色在约见面、报位置、指路或分享好去处时，也可主动发送 type="location"（填写 name 地点名称 与 address 详细地址）。',
      '• 假撤回（recalled: true）：在「捡手机文学」里，撤回采用假撤回效果——聊天窗口仍保留原气泡并提示已撤回。当聊天记录中出现「[撤回了这条消息，撤回前原内容：…]」时，说明对方发完后慌忙/别扭/口误想撤回，而另一方可能刚好手快看到了原话或注意到对方撤回，请结合人设与剧情自然接梗、调侃、追问或装没看见。角色在说漏嘴、嘴硬心软、太直白害羞或打错发重时，也可在对应消息上附带 "recalled": true 触发假撤回，并常可紧接一条找补或转移话题的消息。',
      '• 使用频率原则：以上所有特殊消息类型（表情包、语音条、图片卡片、定位卡片、假撤回）均须严格服务于人设与当下剧情，自然点缀、宁缺毋滥，切忌每轮为了炫技而强行堆砌。'
    ].join('\n')
  };

  function cleanText(val, maxLen) {
    if (typeof val !== 'string') return '';
    var s = val.trim();
    if (typeof maxLen === 'number' && maxLen > 0 && s.length > maxLen) {
      return s.slice(0, maxLen) + '…';
    }
    return s;
  }

  function getReplyPrefs(workState) {
    var wApi = global.FanCommunityWorks || null;
    if (wApi && typeof wApi.normalizeAiReplyPrefs === 'function') {
      return wApi.normalizeAiReplyPrefs(workState && workState.aiReplyPrefs);
    }
    var raw = workState && workState.aiReplyPrefs && typeof workState.aiReplyPrefs === 'object'
      ? workState.aiReplyPrefs
      : {};
    var minVal = Number(raw.minMessages);
    var maxVal = Number(raw.maxMessages);
    minVal = Number.isFinite(minVal) ? Math.max(1, Math.min(20, Math.round(minVal))) : 1;
    maxVal = Number.isFinite(maxVal) ? Math.max(1, Math.min(20, Math.round(maxVal))) : 5;
    if (minVal > maxVal) maxVal = minVal;
    return { minMessages: minVal, maxMessages: maxVal };
  }

  function formatReplyCountPhrase(replyPrefs) {
    var minVal = replyPrefs.minMessages;
    var maxVal = replyPrefs.maxMessages;
    if (minVal === maxVal) {
      return '恰好 ' + minVal + ' 条';
    }
    return minVal + ' 至 ' + maxVal + ' 条';
  }

  function formatMessageRhythmSection(mode, replyPrefs) {
    var prefs = replyPrefs || { minMessages: 1, maxMessages: 5 };
    var minVal = prefs.minMessages;
    var maxVal = prefs.maxMessages;
    var isFixed = minVal === maxVal;
    var countInstruction = isFixed
      ? ('请根据当前角色的性格、聊天习惯、情绪和剧情氛围，将本次内容组织为 ' + minVal + ' 至 ' + maxVal + ' 条独立消息（即本次恰好输出 ' + minVal + ' 条独立消息气泡）。')
      : ('请根据当前角色的性格、聊天习惯、情绪和剧情氛围，将本次内容组织为 ' + minVal + ' 至 ' + maxVal + ' 条独立消息。');
    var storyScopeLine = mode === 'ai_story'
      ? 'AI 剧情生成模式同样通过独立聊天消息推进故事，并遵守当前作品的消息数量范围；该数量范围针对本轮生成的全部消息气泡总数（双方消息合并计数，而非按角色分别计算）。'
      : 'AI 剧情生成模式同样通过独立聊天消息推进故事，并遵守当前作品的消息数量范围。';

    return [
      '【消息节奏与气泡数量】',
      '本次交流采用真实的手机聊天消息形式。',
      countInstruction,
      '每条消息代表一次自然的发送行为。',
      '根据表达需要灵活安排消息长度，可以使用简短回应、连续短句、较长的完整表达、表情包、文字语音条、图片卡片、定位卡片或偶发假撤回。',
      '消息之间具有自然的承接关系，形成真实的聊天节奏。',
      '在设定的数量范围内，自主选择最适合当前情境的消息条数，让每个气泡都具有实际交流意义。',
      storyScopeLine
    ].join('\n');
  }

  function formatReplyLengthRule(replyLength) {
    if (replyLength === 'short') {
      return '单条消息篇幅偏好：偏简短（单条气泡字数利落紧凑，贴合快节奏打字习惯；总气泡条数仍严格遵循【消息节奏与气泡数量】设定）。';
    }
    if (replyLength === 'detailed') {
      return '单条消息篇幅偏好：偏展开（可在合适气泡中写出更完整的口语表达与细节，保持自然网聊感；总气泡条数仍严格遵循【消息节奏与气泡数量】设定）。';
    }
    return '单条消息篇幅偏好：适中自然（长短消息自然交替，贴合日常真实聊天节奏；总气泡条数仍严格遵循【消息节奏与气泡数量】设定）。';
  }

  function formatLanguageStyleRule(languageStyle) {
    if (languageStyle === 'emotional') {
      return '语言风格偏好：细腻情感（留白、分寸、细节情绪流动，但切忌写成抒情散文或旁白）。';
    }
    if (languageStyle === 'dramatic') {
      return '语言风格偏好：较强戏剧张力（拉扯感、反差与暗涌更明显，但依旧严格保持线上聊天的真实感）。';
    }
    return '语言风格偏好：自然聊天（贴近日常社交软件真人对话）。';
  }

  function formatEmotionSection(emotionState) {
    var st = emotionState && typeof emotionState === 'object' ? emotionState : {};
    var lines = [
      '【5. 当前作品动态情感与关系状态（内部基准）】',
      '- 关系阶段：' + (st.relationshipStage || '日常初始'),
      '- 内部参考维度：亲密度 ' + (st.intimacy != null ? st.intimacy : 20) +
        '/100 ｜ 信任度 ' + (st.trust != null ? st.trust : 25) +
        '/100 ｜ 在意度 ' + (st.affection != null ? st.affection : 15) + '/100',
      '- 当前情绪：' + (st.currentEmotion || '平静') + '（强度 ' + (st.emotionIntensity != null ? st.emotionIntensity : 35) + '/100）'
    ];
    if (st.relationshipSummary) {
      lines.push('- 关系现状摘要：' + cleanText(st.relationshipSummary, 360));
    }
    if (st.smallTalkStreak && Number(st.smallTalkStreak) >= 2) {
      lines.push('- 连续闲聊计数：' + st.smallTalkStreak + ' 轮（若仍无关键转折事件，请保持关系阶段与亲密度稳定，不要强行升温）');
    }
    if (Array.isArray(st.recentStoryEvents) && st.recentStoryEvents.length) {
      var recent = st.recentStoryEvents.slice(-5).map(function(ev) {
        if (!ev || !ev.event) return '';
        return '  · ' + cleanText(ev.event, 120) + (ev.impact ? ('（影响：' + cleanText(ev.impact, 80) + '）') : '');
      }).filter(Boolean);
      if (recent.length) {
        lines.push('- 近期关键互动事件：\n' + recent.join('\n'));
      }
    }
    return lines.join('\n');
  }

  function formatResolvedRoleSection(resolvedRole) {
    var res = resolvedRole && typeof resolvedRole === 'object' ? resolvedRole : { status: 'unbound', role: null };
    if (res.status === 'ok' && res.role) {
      var r = res.role;
      var lines = [
        '【6. 当前绑定角色底层档案（实时只读来源：' + (res.sourceLabel || r.sourceLabel || '角色档案') + '）】',
        '- 角色名称：' + (r.name || '对方') + (r.nick ? ('（昵称/常用称呼：' + r.nick + '）') : '')
      ];
      if (r.gender) lines.push('- 性别：' + r.gender);
      if (r.role) lines.push('- 角色定位/身份：' + cleanText(r.role, 180));
      if (r.group) lines.push('- 所属分组：' + cleanText(r.group, 80));
      if (r.accountHandle) lines.push('- 社交账号：' + cleanText(r.accountHandle, 60));
      if (r.personality) lines.push('- 核心性格：' + cleanText(r.personality, 600));
      if (r.background) lines.push('- 身份与背景：' + cleanText(r.background, 800));
      if (r.description && r.description !== r.background) {
        lines.push('- 档案简介：' + cleanText(r.description, 800));
      }
      if (r.speakingStyle) lines.push('- 说话习惯/口癖：' + cleanText(r.speakingStyle, 500));
      if (r.experience) lines.push('- 关键经历：' + cleanText(r.experience, 600));
      if (r.relationsSummary) lines.push('- 人物关系网：' + cleanText(r.relationsSummary, 400));
      if (r.notes) lines.push('- 档案备注：' + cleanText(r.notes, 400));
      lines.push('注意：以上底层档案为基础人格底色；若下方「当前作品 AI 设定」有补充或具体语境，请在不违背底层核心性格的前提下有机结合。');
      return lines.join('\n');
    }
    if (res.status === 'missing') {
      return [
        '【6. 当前绑定角色底层档案】',
        '- 状态提示：原引用角色档案已不存在或已被移除。请完全依托本作品下方的「当前作品 AI 设定」与历史聊天记录保持人设连贯，切勿提及档案丢失等系统异常。'
      ].join('\n');
    }
    return [
      '【6. 当前绑定角色底层档案】',
      '- 未绑定公共人设或系统角色，请直接依据本作品 AI 设定与聊天上下文塑造人物。'
    ].join('\n');
  }

  function formatWorkAiSettingsSection(workState) {
    var st = workState && typeof workState === 'object' ? workState : {};
    var aiSet = st.aiSettings && typeof st.aiSettings === 'object' ? st.aiSettings : {};
    var aiRole = aiSet.aiRole || {};
    var userRole = aiSet.userRole || {};
    var story = aiSet.story || {};
    var prefs = aiSet.preferences || {};

    var charChatName = String(st.char || '').trim() || '对方';
    var userChatName = String(st.user || '').trim() || '我';
    var aiDisplayName = String(aiRole.name || '').trim() || charChatName;

    var lines = [
      '【7. 当前作品独立 AI 设定与剧情约束】',
      '- 聊天窗口双方称呼：AI角色展示名=「' + charChatName + '」（AI设定角色名=「' + aiDisplayName + '」），用户展示名=「' + userChatName + '」'
    ];
    if (aiRole.personality) lines.push('- AI角色性格补充：' + cleanText(aiRole.personality, 600));
    if (aiRole.background) lines.push('- AI角色背景补充：' + cleanText(aiRole.background, 700));
    if (aiRole.speakingStyle) lines.push('- AI角色说话风格：' + cleanText(aiRole.speakingStyle, 500));
    if (aiRole.relationshipToUser) lines.push('- AI角色与「我」的关系：' + cleanText(aiRole.relationshipToUser, 500));

    if (userRole.identityBackground) lines.push('- 「我」的身份背景：' + cleanText(userRole.identityBackground, 500));
    if (userRole.personality) lines.push('- 「我」的性格特点：' + cleanText(userRole.personality, 400));
    if (userRole.relationshipNotes) lines.push('- 双方关系补充：' + cleanText(userRole.relationshipNotes, 400));

    if (story.worldBackground) lines.push('- 故事世界观/背景：' + cleanText(story.worldBackground, 700));
    if (story.currentPlot) lines.push('- 当前正在进行的剧情：' + cleanText(story.currentPlot, 700));
    if (story.plotDirection) lines.push('- 期待剧情发展方向：' + cleanText(story.plotDirection, 500));
    if (story.avoidContent) lines.push('- 【硬性禁忌｜严禁出现的内容】：' + cleanText(story.avoidContent, 500));

    lines.push('- ' + formatReplyLengthRule(prefs.replyLength));
    lines.push('- ' + formatLanguageStyleRule(prefs.languageStyle));
    lines.push('- 剧情推进权限：' + (prefs.allowAdvancePlot !== false ? '允许在聊天中自然推进小步剧情与日常发展' : '优先维持当下状态回应，不要擅自大幅推进主线事件') + '。');

    return lines.join('\n');
  }

  function formatCompressedMemorySection(aiMemory) {
    var mem = aiMemory && typeof aiMemory === 'object' ? aiMemory : {};
    if (!mem.historySummary) {
      return '【8. 更早聊天记忆摘要】\n暂无需要压缩的更早记录，直接参考最近对话即可。';
    }
    return [
      '【8. 更早聊天记忆摘要（已压缩前情，但全局规则与人设要求仍完全有效）】',
      cleanText(mem.historySummary, 1400)
    ].join('\n');
  }

  function formatWorldbookBeforeSection(worldbookContext) {
    var seg = worldbookContext && worldbookContext.segments ? worldbookContext.segments : null;
    var beforeText = seg && seg.before ? cleanText(seg.before, 2000) : '';
    if (!beforeText) return '';
    return [
      '【前置世界书设定（背景前提）】',
      beforeText
    ].join('\n');
  }

  function formatWorldbookMiddleAfterSection(worldbookContext) {
    var seg = worldbookContext && worldbookContext.segments ? worldbookContext.segments : null;
    var middleText = seg && seg.middle ? cleanText(seg.middle, 2600) : '';
    var afterText = seg && seg.after ? cleanText(seg.after, 2000) : '';
    if (!middleText && !afterText) return '';

    var blocks = [
      '【世界书设定（当前上下文动态命中之背景、知识与人物关系）】',
      '请将以下世界书设定内化为角色已知的背景常识与世界观，并严格转化为「纯线上手机聊天」的自然表达（文字、表情包、语音条、图片卡片、定位卡片等），切勿写成旁白、设定说明或百科条目。'
    ];
    if (middleText) {
      blocks.push(middleText);
    }
    if (afterText) {
      blocks.push('【补充世界观设定】\n' + afterText);
    }
    return blocks.join('\n\n');
  }

  function formatStickerCatalogSection(stickerCatalog) {
    var list = Array.isArray(stickerCatalog) ? stickerCatalog : [];
    if (!list.length) {
      return [
        '【9. 本地表情包目录】',
        '当前表情包库为空。本轮严禁输出 type="sticker" 的消息，也不得虚构任何 assetId。'
      ].join('\n');
    }
    var MAX_CATALOG_CHARS = 3200;
    var rows = [];
    var usedChars = 0;
    var omitted = 0;
    for (var i = 0; i < list.length && rows.length < 40; i++) {
      var st = list[i];
      if (!st || !st.id) continue;
      var descText = cleanText(st.description || st.note || '', 140);
      var tagList = Array.isArray(st.tags) ? st.tags.filter(Boolean).slice(0, 6) : [];
      var bits = [
        '- id="' + st.id + '"',
        '名称="' + cleanText(st.name || '表情包', 32) + '"'
      ];
      if (descText) {
        bits.push('描述="' + descText + '"');
      }
      if (tagList.length) {
        bits.push('标签="' + tagList.join('/') + '"');
      }
      if (st.mood) {
        bits.push('情绪="' + cleanText(st.mood, 24) + '"');
      }
      var line = bits.join('｜');
      if (rows.length > 0 && usedChars + line.length + 1 > MAX_CATALOG_CHARS) {
        omitted = list.length - i;
        break;
      }
      rows.push(line);
      usedChars += line.length + 1;
    }
    var footer = [
      '表情包调用规则：以上提供可用表情包的素材 ID、名称与文字描述（不含图片像素）。请根据角色人设、情绪、剧情与聊天语境自主决定是否选用以及使用频率；可单独发送，也可搭配文字或文字语音条发送，前端将按返回的 assetId 渲染真实图片且仅显示图片。每条表情包计为 1 条独立气泡；严格禁止编造或修改 id。'
    ];
    if (omitted > 0) {
      footer.push('（已按上下文预算展示前 ' + rows.length + ' 个可用表情包，其余 ' + omitted + ' 个已省略）');
    }
    return [
      '【9. 本地表情包目录（仅元数据，严格禁止编造或修改 id）】',
      rows.join('\n'),
      footer.join('\n')
    ].join('\n');
  }

  function formatOutputSpecSection(mode, workState, replyPrefs) {
    var charName = String((workState && workState.char) || '对方').trim() || '对方';
    var userName = String((workState && workState.user) || '我').trim() || '我';
    var isStory = mode === 'ai_story';
    var prefs = replyPrefs || getReplyPrefs(workState);
    var countPhrase = formatReplyCountPhrase(prefs);

    var richMsgGuide = [
      '关于各类特殊气泡格式说明（按人设与剧情自然按需使用，无需强行每轮都用）：',
      '• 语音条（type="text_voice"）：点击后展开口语文字、不播放音频；content 必须是自然开口说话的口语内容（绝不可写旁白、动作括号或音色描写），duration 填估算秒数（2~59 的整数）。',
      '• 图片卡片（type="image"）：以文字图片卡片展示，content 必须填写这张照片/截图里呈现的画面内容（例如「刚端上桌的红油小面，旁边放着半杯冰美式」），不要写成说话台词。',
      '• 定位卡片（type="location"）：自定义位置分享卡片，name 填地点名称（必填），address 填详细地址（选填，建议贴合世界观与日常真实感）。',
      '• 假撤回（"recalled": true）：任意消息对象上可附带 "recalled": true，表示该消息发出后立即执行假撤回（气泡与原内容仍保留可见，并显示撤回提示），适合嘴硬心软、说漏嘴、害羞或口误等剧情。'
    ].join('\n');

    if (isStory) {
      return [
        '【10. 输出格式要求｜AI 剧情生成模式（严格返回单个 JSON 对象）】',
        '当前为「AI 剧情生成」模式。你需要基于设定与聊天前文，继续生成一段双方在手机上真实聊天的剧情推进。',
        '本轮 messages 数组中的有效独立消息总条数必须为 ' + countPhrase + '（双方消息合并计算总数，每条代表一个独立聊天气泡；emotionUpdate 与 summaryNote 不计入条数）。',
        '每条消息必须明确标注 side：',
        '• side="left" 代表角色「' + charName + '」',
        '• side="right" 代表「' + userName + '」',
        '允许的 item 类型（任意消息均可按需附加 "recalled": true 表示假撤回）：',
        '1) 文字：{ "side": "left"|"right", "type": "text", "content": "聊天内容" }',
        '2) 表情包：{ "side": "left"|"right", "type": "sticker", "assetId": "必须是第9节中的真实id" }',
        '3) 文字语音条：{ "side": "left"|"right", "type": "text_voice", "content": "语音口语内容", "duration": 6 }',
        '4) 图片卡片：{ "side": "left"|"right", "type": "image", "content": "图片画面内容描述" }',
        '5) 定位卡片：{ "side": "left"|"right", "type": "location", "name": "地点名称", "address": "详细地址" }',
        richMsgGuide,
        '请只输出一个合法 JSON 对象（不要用多余文字包裹解释）：',
        '{',
        '  "messages": [ ... ],',
        '  "emotionUpdate": {',
        '    "shouldChangeRelationship": false,',
        '    "intimacyDelta": 0,',
        '    "trustDelta": 0,',
        '    "affectionDelta": 0,',
        '    "relationshipStage": "当前关系阶段",',
        '    "currentEmotion": "角色当前情绪词",',
        '    "emotionIntensity": 35,',
        '    "relationshipSummary": "一句话概括当前双方关系动态",',
        '    "storyEvent": null',
        '  },',
        '  "summaryNote": "可选：一句简短前情增量备忘（无新进展留空字符串）"',
        '}',
        '当发生关键转折事件时，storyEvent 格式为：{ "event": "发生了什么", "impact": "对关系的影响" }；否则为 null。'
      ].join('\n');
    }

    return [
      '【10. 输出格式要求｜AI 角色互动模式（严格返回单个 JSON 对象）】',
      '当前为「AI 角色互动」模式。你只扮演「' + charName + '」（左侧消息，side 固定为 "left"），绝不要代写「' + userName + '」（右侧用户）的发言。',
      '本轮 messages 数组中的有效独立消息总条数必须为 ' + countPhrase + '（每条代表一个独立聊天气泡；emotionUpdate 与 summaryNote 不计入条数）。允许的 item 类型（任意消息均可按需附加 "recalled": true 表示假撤回）：',
      '1) 文字：{ "type": "text", "content": "聊天内容" }',
      '2) 表情包：{ "type": "sticker", "assetId": "必须是第9节中的真实id" }',
      '3) 文字语音条：{ "type": "text_voice", "content": "语音口语内容", "duration": 6 }',
      '4) 图片卡片：{ "type": "image", "content": "图片画面内容描述" }',
      '5) 定位卡片：{ "type": "location", "name": "地点名称", "address": "详细地址" }',
      richMsgGuide,
      '请只输出一个合法 JSON 对象（不要加额外说明）：',
      '{',
      '  "messages": [ ... ],',
      '  "emotionUpdate": {',
      '    "shouldChangeRelationship": false,',
      '    "intimacyDelta": 0,',
      '    "trustDelta": 0,',
      '    "affectionDelta": 0,',
      '    "relationshipStage": "当前关系阶段",',
      '    "currentEmotion": "角色当前情绪词",',
      '    "emotionIntensity": 35,',
      '    "relationshipSummary": "一句话概括当前双方关系动态",',
      '    "storyEvent": null',
      '  },',
      '  "summaryNote": "可选：一句简短前情增量备忘（无新进展留空字符串）"',
      '}',
      '当发生关键转折事件时，storyEvent 格式为：{ "event": "发生了什么", "impact": "对关系的影响" }；否则为 null。'
    ].join('\n');
  }

  function formatStickerMessageSemantics(item, stickerIdMap) {
    var map = stickerIdMap && typeof stickerIdMap === 'object' ? stickerIdMap : null;
    var meta = (map && item.assetId && map[item.assetId]) ? map[item.assetId] : null;
    var rawName = cleanText((meta && meta.name) || item.stickerName || item.alt || '', 48);
    var desc = cleanText(
      (meta && (meta.description || meta.note)) || item.stickerDesc || item.description || '',
      200
    );
    var tags = (meta && Array.isArray(meta.tags) && meta.tags.length)
      ? meta.tags.map(function(t) { return cleanText(t, 24); }).filter(Boolean).slice(0, 6)
      : (Array.isArray(item.stickerTags)
        ? item.stickerTags.map(function(t) { return cleanText(t, 24); }).filter(Boolean).slice(0, 6)
        : []);
    var mood = cleanText((meta && meta.mood) || '', 24);

    var parts = [];
    if (rawName && rawName !== '表情包') {
      parts.push('表情包：' + rawName);
    } else {
      parts.push('表情包');
    }
    if (desc) {
      parts.push('描述：' + desc);
    }
    if (tags.length) {
      parts.push('标签：' + tags.join('/'));
    } else if (mood) {
      parts.push('情绪：' + mood);
    }
    return '[' + parts.join('；') + ']';
  }

  function formatMessageTimePrefix(rawItem, item) {
    var full = cleanText((rawItem && rawItem.sentTimeFull) || (item && item.sentTimeFull) || '', 32);
    if (full) return '[' + full + '] ';
    var shortTime = cleanText((rawItem && rawItem.sentTime) || (item && item.sentTime) || '', 16);
    if (shortTime) return '[' + shortTime + '] ';
    return '';
  }

  function formatChatClockSection(workState, currentChatTime) {
    var clock = currentChatTime && typeof currentChatTime === 'object' ? currentChatTime : null;
    if (!clock && global.FanCommunityWorks && typeof global.FanCommunityWorks.resolveWorkCurrentTime === 'function') {
      try {
        clock = global.FanCommunityWorks.resolveWorkCurrentTime(workState && workState.timeSettings);
      } catch (_) {}
    }
    if (!clock || !clock.full) return '';

    var lines = ['【当前聊天时钟与时间线】'];
    if (clock.mode === 'virtual') {
      lines.push('时间模式：虚拟时间（流速 ' + (clock.speed || 1) + 'x，状态：' + (clock.paused ? '已暂停' : '自动推进中') + '）');
      lines.push('当前虚拟时间：' + clock.full);
    } else {
      lines.push('时间模式：实时时间' + (clock.timeZone ? ('（时区：' + clock.timeZone + '）') : ''));
      lines.push('当前时间：' + clock.full);
    }
    lines.push('时间与顺序规则：请严格按照下方聊天记录的先后顺序以及每条消息前附带的发送时间来理解上下文语境与时间间隔（如时段、隔了多久再回复、是否跨天），但在你生成的聊天气泡正文中不要机械复述时间戳或楼层号。');
    return lines.join('\n');
  }

  function serializeMessageForPrompt(rawItem, charName, userName, stickerIdMap) {
    if (!rawItem || typeof rawItem !== 'object') return null;
    var item = rawItem;
    var isRecalled = Boolean(rawItem.fakeRecall);
    if (rawItem.type === 'withdraw') {
      if (rawItem.original && typeof rawItem.original === 'object') {
        item = Object.assign({}, rawItem.original, {
          side: rawItem.side || rawItem.original.side
        });
        isRecalled = true;
      } else {
        var wSide = rawItem.side === 'right' ? 'right' : 'left';
        var wWho = wSide === 'right' ? (userName || '我') : (charName || '对方');
        var wTimePrefix = formatMessageTimePrefix(rawItem, rawItem);
        return {
          role: wSide === 'right' ? 'user' : 'assistant',
          side: wSide,
          line: wTimePrefix + wWho + ' [撤回了一条消息]'
        };
      }
    }

    var side = item.side === 'right' ? 'right' : 'left';
    var who = side === 'right' ? (userName || '我') : (charName || '对方');

    if (item.type === 'date') {
      return { role: 'user', line: '[日期分隔：' + (item.text || '') + ']' };
    }

    var timePrefix = formatMessageTimePrefix(rawItem, item);
    var bodyLine = '';
    if (item.type === 'text') {
      var txt = String(item.text || '').trim();
      if (!txt) return null;
      bodyLine = txt;
    } else if (item.type === 'text_voice' || item.type === 'voice') {
      var vt = String(item.text || item.content || '').trim();
      var dur = Number(item.duration) || (item.type === 'voice' ? 8 : 6);
      bodyLine = '[发送了语音消息 ' + dur + '″，语音内容：' + (vt || '（未填写语音文字）') + ']';
    } else if (item.type === 'image') {
      if (item.isSticker) {
        bodyLine = formatStickerMessageSemantics(item, stickerIdMap);
      } else {
        var imgDesc = cleanText(String(item.text || item.content || item.alt || '图片').trim(), 300) || '图片';
        bodyLine = '[发送了一张图片，图片画面内容：' + imgDesc + ']';
      }
    } else if (item.type === 'location') {
      var locName = cleanText(String(item.name || item.placeName || item.title || '').trim(), 80);
      var locAddr = cleanText(String(item.address || item.detail || '').trim(), 160);
      if (!locName && !locAddr) return null;
      bodyLine = '[发送了定位卡片：地点「' + (locName || '位置') + '」' + (locAddr ? ('｜详细地址：' + locAddr) : '') + ']';
    } else if (item.type === 'transfer') {
      var status = (item.status === 'claimed' || item.claimed || item.received) ? '已领取' : '未领取';
      bodyLine = '[转账卡片 ' + (item.amount || '0') + ' · ' + (item.note || '转账') + '（' + status + '）]';
    } else if (item.type === 'call') {
      var callLabel = item.video ? '视频通话' : '语音通话';
      bodyLine = '[' + callLabel + '：' + (item.status || '已接通') + (item.duration ? (' ' + item.duration) : '') + ']';
    } else {
      return null;
    }

    var finalLine = isRecalled
      ? (timePrefix + who + ' [撤回了这条消息，撤回前原内容仍可见]：' + bodyLine)
      : (timePrefix + who + '：' + bodyLine);

    return {
      role: side === 'right' ? 'user' : 'assistant',
      side: side,
      line: finalLine
    };
  }

  function buildRecentChatMessages(workState, options) {
    var st = workState && typeof workState === 'object' ? workState : {};
    var opts = options || {};
    var mode = opts.mode === 'ai_story' ? 'ai_story' : 'ai_roleplay';
    var charName = String(st.char || '对方').trim() || '对方';
    var userName = String(st.user || '我').trim() || '我';
    var stickerIdMap = opts.stickerIdMap || null;
    var windowSize = typeof opts.recentWindowSize === 'number' && opts.recentWindowSize > 0
      ? Math.round(opts.recentWindowSize)
      : 18;

    var rawItems = Array.isArray(st.items) ? st.items : [];
    var serialized = [];
    for (var i = 0; i < rawItems.length; i++) {
      var entry = serializeMessageForPrompt(rawItems[i], charName, userName, stickerIdMap);
      if (entry) serialized.push(entry);
    }

    var sliceStart = Math.max(0, serialized.length - windowSize);
    var recent = serialized.slice(sliceStart);
    var transcriptLines = recent.map(function(entry) { return entry.line; });

    var replyPrefs = opts.replyPrefs || getReplyPrefs(st);
    var countPhrase = formatReplyCountPhrase(replyPrefs);

    var messages = [];
    if (mode === 'ai_story') {
      var promptParts = [];
      if (transcriptLines.length) {
        promptParts.push('以下是最近的手机聊天记录（从旧到新）：\n' + transcriptLines.join('\n'));
      } else {
        promptParts.push('当前聊天记录尚为空白，请从零自然开启这段手机聊天。');
      }
      if (opts.userDirection && String(opts.userDirection).trim()) {
        promptParts.push('用户本轮提供的剧情方向/补充提示：' + cleanText(String(opts.userDirection), 500) + '\n请结合双方人设与设定，将本轮双方聊天剧情自然组织为 ' + countPhrase + '独立消息气泡（双方合计条数，仅输出 JSON）。');
      } else {
        promptParts.push('请结合双方人设、当前情绪状态与剧情设定，自然生成下一段 ' + countPhrase + '线上手机聊天消息（双方合计条数，仅输出 JSON）。');
      }
      messages.push({
        role: 'user',
        content: promptParts.join('\n\n')
      });
    } else {
      var historyBlock = transcriptLines.length
        ? ('以下是最近的手机聊天记录（从旧到新）：\n' + transcriptLines.join('\n'))
        : '当前尚无历史聊天记录。';

      var triggerInstruction = '';
      if (opts.triggerType === 'followup') {
        triggerInstruction = '用户此刻没有新发言。请你以「' + charName + '」的身份主动给「' + userName + '」发 ' + countPhrase + '自然承接的线上消息（延续话题、分享眼前小事、追问、吐槽或贴合心境的表情包/文字语音条均可，符合当下人设与情绪）。请严格返回 JSON。';
      } else if (opts.triggerType === 'reply_after_media') {
        triggerInstruction = '请紧接上面「' + userName + '」最新发来的内容（图片/表情包/转账/语音/消息等），以「' + charName + '」的身份自然组织为 ' + countPhrase + '独立消息回复「' + userName + '」。请严格返回 JSON。';
      } else {
        triggerInstruction = '请以角色「' + charName + '」的身份，紧接上述聊天记录中「' + userName + '」刚发来的消息，自然组织为 ' + countPhrase + '独立消息气泡回复（只扮演「' + charName + '」，严格返回 JSON）。';
      }

      messages.push({
        role: 'user',
        content: historyBlock + '\n\n' + triggerInstruction
      });
    }

    return {
      messages: messages,
      recentCount: recent.length,
      totalVisibleCount: serialized.length
    };
  }

  function assemblePromptPayload(params) {
    params = params || {};
    var mode = params.mode === 'ai_story' ? 'ai_story' : 'ai_roleplay';
    var workState = params.workState || {};
    var resolvedRole = params.resolvedRole || { status: 'unbound', role: null };
    var stickerCatalog = Array.isArray(params.stickerCatalog) ? params.stickerCatalog : [];
    var stickerIdMap = params.stickerIdMap && typeof params.stickerIdMap === 'object'
      ? params.stickerIdMap
      : null;
    if (!stickerIdMap && stickerCatalog.length) {
      stickerIdMap = Object.create(null);
      for (var sIdx = 0; sIdx < stickerCatalog.length; sIdx++) {
        if (stickerCatalog[sIdx] && stickerCatalog[sIdx].id) {
          stickerIdMap[stickerCatalog[sIdx].id] = stickerCatalog[sIdx];
        }
      }
    }
    var worldbookContext = params.worldbookContext || null;
    var replyPrefs = getReplyPrefs(workState);
    var resolvedClock = params.currentChatTime || (
      global.FanCommunityWorks && typeof global.FanCommunityWorks.resolveWorkCurrentTime === 'function'
        ? global.FanCommunityWorks.resolveWorkCurrentTime(workState.timeSettings)
        : null
    );

    var wbBefore = formatWorldbookBeforeSection(worldbookContext);
    var wbBody = formatWorldbookMiddleAfterSection(worldbookContext);
    var clockSection = formatChatClockSection(workState, resolvedClock);

    var systemSections = [
      CORE_RULE_SECTIONS.pureOnlineSimulator,
      CORE_RULE_SECTIONS.humanChatNaturalness,
      CORE_RULE_SECTIONS.realChatRhythm,
      formatMessageRhythmSection(mode, replyPrefs),
      CORE_RULE_SECTIONS.stickerUnderstandingAndUse,
      CORE_RULE_SECTIONS.personalityAndBalance,
      CORE_RULE_SECTIONS.emotionEvolutionGuide
    ];
    if (wbBefore) systemSections.push(wbBefore);
    systemSections.push(formatResolvedRoleSection(resolvedRole));
    systemSections.push(formatWorkAiSettingsSection(workState));
    if (wbBody) systemSections.push(wbBody);
    if (clockSection) systemSections.push(clockSection);
    systemSections.push(formatEmotionSection(workState.emotionState));
    systemSections.push(formatCompressedMemorySection(workState.aiMemory));
    systemSections.push(formatStickerCatalogSection(stickerCatalog));
    systemSections.push(formatOutputSpecSection(mode, workState, replyPrefs));

    var chatBuilt = buildRecentChatMessages(workState, {
      mode: mode,
      recentWindowSize: params.recentWindowSize || 18,
      triggerType: params.triggerType || 'user_message',
      userDirection: params.userDirection || '',
      replyPrefs: replyPrefs,
      stickerIdMap: stickerIdMap
    });

    var wbMeta = worldbookContext && Array.isArray(worldbookContext.matchedMeta)
      ? worldbookContext.matchedMeta
      : [];

    return {
      system: systemSections.join('\n\n'),
      messages: chatBuilt.messages,
      meta: {
        ruleVersion: PROMPT_RULE_VERSION,
        mode: mode,
        workId: String(workState.id || ''),
        replyPrefs: {
          minMessages: replyPrefs.minMessages,
          maxMessages: replyPrefs.maxMessages,
          isFixedCount: replyPrefs.minMessages === replyPrefs.maxMessages
        },
        clockMode: resolvedClock ? resolvedClock.mode : 'realtime',
        currentChatTime: resolvedClock ? resolvedClock.full : '',
        injectedRuleIds: [
          'pureOnlineSimulator',
          'humanChatNaturalness',
          'realChatRhythm',
          'messageRhythmAndCount',
          'stickerUnderstandingAndUse',
          'personalityAndBalance',
          'emotionEvolutionGuide'
        ],
        hasCompressedSummary: Boolean(workState.aiMemory && workState.aiMemory.historySummary),
        recentMessageCount: chatBuilt.recentCount,
        totalVisibleCount: chatBuilt.totalVisibleCount,
        roleStatus: resolvedRole.status || 'unbound',
        stickerCount: stickerCatalog.length,
        worldbookMatchedCount: worldbookContext ? (worldbookContext.matchedCount || 0) : 0,
        worldbookTruncated: Boolean(worldbookContext && worldbookContext.truncatedByBudget),
        worldbookMatchedTitles: wbMeta.map(function(m) { return m.title || m.entryId || ''; }).filter(Boolean)
      }
    };
  }

  global.FanCommunityPrompts = {
    PROMPT_RULE_VERSION: PROMPT_RULE_VERSION,
    CORE_RULE_SECTIONS: CORE_RULE_SECTIONS,
    getReplyPrefs: getReplyPrefs,
    formatMessageRhythmSection: formatMessageRhythmSection,
    formatChatClockSection: formatChatClockSection,
    assemblePromptPayload: assemblePromptPayload,
    serializeMessageForPrompt: serializeMessageForPrompt,
    formatEmotionSection: formatEmotionSection
  };
})(window);
