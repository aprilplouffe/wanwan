// js/fan-community-prompts.js — 同好社区 · 捡手机文学全局核心提示词与上下文拼装模块（任务 15）
// 职责：
//   1. 集中管理纯线上手机聊天规则、自然语言去AI味规则、性格差异与情绪平衡原则。
//   2. 每次发起 AI 请求（含长对话摘要压缩后）均强制完整重注入全部核心规则与当前状态。
//   3. 统一服务「AI 角色互动 (ai_roleplay)」与「AI 剧情生成 (ai_story)」两种模式。

(function(global) {
  'use strict';

  var PROMPT_RULE_VERSION = 'fc-phone-chat-prompt-v1';

  var CORE_RULE_SECTIONS = {
    pureOnlineSimulator: [
      '【1. 全局核心规则｜纯线上手机聊天模拟器】',
      '你正在运行「捡手机文学」纯线上手机聊天模拟。用户看到的唯一舞台就是手机聊天窗口本身。',
      '• 绝对禁止旁白腔、小说叙述、第三人称描写、动作/神态/环境括注（例如严禁出现「他笑了笑」「*叹了口气*」「（看着屏幕发呆）」「（眼神暗了暗）」「【场景：深夜房间】」等任何舞台指示）。',
      '• 禁止把对话写成跑团/文字冒险主持人提示，禁止在回复中出现「系统提示」「AI」「旁白」「作为角色」「选项A/B」等打破第四面墙的字眼。',
      '• 所有性格、情绪、试探、停顿、敷衍或亲近，只能通过真正的线上聊天消息来体现：文字气泡（可分条连续发送）、可用表情包（仅限目录内真实ID）或文字语音条（text_voice）。',
      '• 严禁在聊天消息正文中直接报出好感度、亲密度、信任度等内部数值或状态标签。'
    ].join('\n'),

    humanChatNaturalness: [
      '【2. 人类真实网聊自然感与去「AI味」规范】',
      '请像真实拿着手机回消息的活人一样聊天，杜绝客服腔与模板化对话：',
      '• 节奏自然多变：有时一句简短回应，有时连续发 2~3 条短消息（拆成多条气泡更像真人在打字连发），只有聊到具体话题或有表达欲时才发稍长的一段话，避免每回合都工整得像作文。',
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

  function formatReplyLengthRule(replyLength) {
    if (replyLength === 'short') {
      return '回复篇幅偏好：偏简短（单条字数少、干脆利落，1~2 条短气泡为主）。';
    }
    if (replyLength === 'detailed') {
      return '回复篇幅偏好：偏展开（可在合适时发稍微完整的一两段或 2~4 条有信息量的气泡，但仍须保持纯口语网聊感）。';
    }
    return '回复篇幅偏好：适中自然（长短结合，视语境发 1~3 条气泡）。';
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
      '请将以下世界书设定内化为角色已知的背景常识与世界观，并严格转化为「纯线上手机聊天」的自然表达（文字、表情包、文字语音条），切勿写成旁白、设定说明或百科条目。'
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
    var rows = list.slice(0, 32).map(function(st) {
      var tagBits = [];
      if (Array.isArray(st.tags) && st.tags.length) tagBits.push(st.tags.join('/'));
      if (st.mood) tagBits.push('情绪:' + st.mood);
      if (st.note) tagBits.push(st.note);
      var suffix = tagBits.length ? ('｜标签:' + tagBits.join('，')) : '';
      return '- id="' + st.id + '"｜名称="' + (st.name || '表情包') + '"' + suffix;
    });
    return [
      '【9. 本地表情包目录（仅元数据，严格禁止编造或修改 id）】',
      rows.join('\n'),
      '表情包使用原则：仅当语气/情绪自然契合时选用（可单独发送、附在文字后、或用于缓和/吐槽/敷衍），每轮最多 1~2 张；不确定或没有合适的表情包时请不要强行发送；只能原样填入上方列表中的真实 id（assetId）。'
    ].join('\n');
  }

  function formatOutputSpecSection(mode, workState) {
    var charName = String((workState && workState.char) || '对方').trim() || '对方';
    var userName = String((workState && workState.user) || '我').trim() || '我';
    var isStory = mode === 'ai_story';

    var voiceGuide = [
      '关于模拟文字语音条（type="text_voice"）：',
      '• 这是聊天界面里的「文字模拟语音条」，点击后仅展示对应的口语文字，不会发声或做音频朗读，因此 content 必须是自然开口说话的口语内容（可以有一点语气词、停顿或随口咕哝，但绝不可写旁白、动作括号或描述音色）。',
      '• 请把语音条作为点缀适度使用（例如懒得打长字、带着一点情绪或吐槽、或者语音更带感时），不要连续刷屏或完全替代正常文字气泡。',
      '• duration 填估算秒数（2~59 的整数，短句约 3~5，中等约 6~12，较长约 13~25）。'
    ].join('\n');

    if (isStory) {
      return [
        '【10. 输出格式要求｜AI 剧情生成模式（严格返回单个 JSON 对象）】',
        '当前为「AI 剧情生成」模式。你需要基于设定与聊天前文，继续生成一段「双方在手机上真实聊天的剧情推进」（2~5 条连续线上消息，含双方互动，全部为手机聊天气泡）。',
        '每条消息必须明确标注 side：',
        '• side="left" 代表角色「' + charName + '」',
        '• side="right" 代表「' + userName + '」',
        '允许的 item 类型：',
        '1) 文字：{ "side": "left"|"right", "type": "text", "content": "聊天内容" }',
        '2) 表情包：{ "side": "left"|"right", "type": "sticker", "assetId": "必须是第9节中的真实id" }',
        '3) 文字语音条：{ "side": "left"|"right", "type": "text_voice", "content": "语音口语内容", "duration": 6 }',
        voiceGuide,
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
      '每次可输出 1~4 条连续气泡来还原真人发消息的节奏。允许的 item 类型：',
      '1) 文字：{ "type": "text", "content": "聊天内容" }',
      '2) 表情包：{ "type": "sticker", "assetId": "必须是第9节中的真实id" }',
      '3) 文字语音条：{ "type": "text_voice", "content": "语音口语内容", "duration": 6 }',
      voiceGuide,
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

  function serializeMessageForPrompt(item, charName, userName) {
    if (!item || typeof item !== 'object') return null;
    if (item.fakeRecall || item.type === 'withdraw') return null;
    var who = item.side === 'right' ? (userName || '我') : (charName || '对方');

    if (item.type === 'date') {
      return { role: 'user', line: '[日期分隔：' + (item.text || '') + ']' };
    }
    if (item.type === 'text') {
      var txt = String(item.text || '').trim();
      if (!txt) return null;
      return {
        role: item.side === 'right' ? 'user' : 'assistant',
        side: item.side === 'right' ? 'right' : 'left',
        line: who + '：' + txt
      };
    }
    if (item.type === 'text_voice') {
      var vt = String(item.text || item.content || '').trim();
      var dur = Number(item.duration) || 6;
      return {
        role: item.side === 'right' ? 'user' : 'assistant',
        side: item.side === 'right' ? 'right' : 'left',
        line: who + ' [语音消息 ' + dur + '″]：' + (vt || '（未识别文字）')
      };
    }
    if (item.type === 'voice') {
      var vtxt = String(item.text || '').trim();
      var vdur = Number(item.duration) || 8;
      return {
        role: item.side === 'right' ? 'user' : 'assistant',
        side: item.side === 'right' ? 'right' : 'left',
        line: who + ' [语音消息 ' + vdur + '″]' + (vtxt ? ('：' + vtxt) : '')
      };
    }
    if (item.type === 'image') {
      var label = item.isSticker ? '表情包' : '图片';
      var alt = String(item.alt || label).trim();
      var idInfo = item.isSticker && item.assetId ? ('(id:' + item.assetId + ')') : '';
      return {
        role: item.side === 'right' ? 'user' : 'assistant',
        side: item.side === 'right' ? 'right' : 'left',
        line: who + ' [发送了' + label + '：' + alt + idInfo + ']'
      };
    }
    if (item.type === 'transfer') {
      var status = (item.status === 'claimed' || item.claimed || item.received) ? '已领取' : '未领取';
      return {
        role: item.side === 'right' ? 'user' : 'assistant',
        side: item.side === 'right' ? 'right' : 'left',
        line: who + ' [转账卡片 ' + (item.amount || '0') + ' · ' + (item.note || '转账') + '（' + status + '）]'
      };
    }
    if (item.type === 'call') {
      var callLabel = item.video ? '视频通话' : '语音通话';
      return {
        role: item.side === 'right' ? 'user' : 'assistant',
        side: item.side === 'right' ? 'right' : 'left',
        line: who + ' [' + callLabel + '：' + (item.status || '已接通') + (item.duration ? (' ' + item.duration) : '') + ']'
      };
    }
    return null;
  }

  function buildRecentChatMessages(workState, options) {
    var st = workState && typeof workState === 'object' ? workState : {};
    var opts = options || {};
    var mode = opts.mode === 'ai_story' ? 'ai_story' : 'ai_roleplay';
    var charName = String(st.char || '对方').trim() || '对方';
    var userName = String(st.user || '我').trim() || '我';
    var windowSize = typeof opts.recentWindowSize === 'number' && opts.recentWindowSize > 0
      ? Math.round(opts.recentWindowSize)
      : 18;

    var rawItems = Array.isArray(st.items) ? st.items : [];
    var serialized = [];
    for (var i = 0; i < rawItems.length; i++) {
      var entry = serializeMessageForPrompt(rawItems[i], charName, userName);
      if (entry) serialized.push(entry);
    }

    var sliceStart = Math.max(0, serialized.length - windowSize);
    var recent = serialized.slice(sliceStart);
    var transcriptLines = recent.map(function(entry) { return entry.line; });

    var messages = [];
    if (mode === 'ai_story') {
      var promptParts = [];
      if (transcriptLines.length) {
        promptParts.push('以下是最近的手机聊天记录（从旧到新）：\n' + transcriptLines.join('\n'));
      } else {
        promptParts.push('当前聊天记录尚为空白，请从零自然开启这段手机聊天。');
      }
      if (opts.userDirection && String(opts.userDirection).trim()) {
        promptParts.push('用户本轮提供的剧情方向/补充提示：' + cleanText(String(opts.userDirection), 500));
      } else {
        promptParts.push('请结合双方人设、当前情绪状态与剧情设定，自然生成下一段 2~5 条线上手机聊天内容（仅输出 JSON）。');
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
        triggerInstruction = '用户此刻没有新发言。请你主动给「' + userName + '」再发一条或两三句自然的线上消息（延续话题、分享眼前小事、追问、吐槽或发贴合心境的表情包/语音条均可，符合当下人设与情绪）。请严格返回 JSON。';
      } else if (opts.triggerType === 'reply_after_media') {
        triggerInstruction = '请紧接上面「' + userName + '」最新发来的内容（图片/表情包/转账/语音/消息等）自然回复「' + userName + '」。请严格返回 JSON。';
      } else {
        triggerInstruction = '请以角色「' + charName + '」的身份，紧接上述聊天记录中「' + userName + '」刚发来的消息自然回复（严禁旁白，严禁代写用户回复，严格返回 JSON）。';
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
    var worldbookContext = params.worldbookContext || null;

    var wbBefore = formatWorldbookBeforeSection(worldbookContext);
    var wbBody = formatWorldbookMiddleAfterSection(worldbookContext);

    var systemSections = [
      CORE_RULE_SECTIONS.pureOnlineSimulator,
      CORE_RULE_SECTIONS.humanChatNaturalness,
      CORE_RULE_SECTIONS.personalityAndBalance,
      CORE_RULE_SECTIONS.emotionEvolutionGuide
    ];
    if (wbBefore) systemSections.push(wbBefore);
    systemSections.push(formatResolvedRoleSection(resolvedRole));
    systemSections.push(formatWorkAiSettingsSection(workState));
    if (wbBody) systemSections.push(wbBody);
    systemSections.push(formatEmotionSection(workState.emotionState));
    systemSections.push(formatCompressedMemorySection(workState.aiMemory));
    systemSections.push(formatStickerCatalogSection(stickerCatalog));
    systemSections.push(formatOutputSpecSection(mode, workState));

    var chatBuilt = buildRecentChatMessages(workState, {
      mode: mode,
      recentWindowSize: params.recentWindowSize || 18,
      triggerType: params.triggerType || 'user_message',
      userDirection: params.userDirection || ''
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
        injectedRuleIds: [
          'pureOnlineSimulator',
          'humanChatNaturalness',
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
    assemblePromptPayload: assemblePromptPayload,
    serializeMessageForPrompt: serializeMessageForPrompt,
    formatEmotionSection: formatEmotionSection
  };
})(window);
