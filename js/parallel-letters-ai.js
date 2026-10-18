// parallel-letters-ai.js — 平行来信 · IF小剧场 AI 提示词编译与剧情生成引擎
// 严格对齐《平行来信 · IF小剧场 二改方案》第十章

(function() {
  'use strict';

  // ===== 10.1 通用基础提示词 =====
  var BASE_SYSTEM_PROMPT = 
`你是一位擅长人物塑造、平行世界叙事和沉浸式角色演绎的互动剧场创作者。
根据当前角色资料、IF 世界设定、人物关系和当前分支历史，创作具有文学表现力、人物真实感和情感逻辑的小剧场。
保留角色核心人格、语言习惯、行为逻辑和情感表达方式。IF 可以改变角色身份、经历、背景和初始关系，但不能毫无理由地改变核心性格。
不同角色应有独立的人格、语言风格和行为动机。通过环境、动作、自然对白和细节推动剧情，维持时间线、事件因果与情感变化的连贯。
避免流水账、重复叙述、强行冲突、无理由关系突变及机械对白。每次生成具有实际推进意义的一幕，并保留自然发展空间。
当前 IF 是独立平行世界；仅使用当前宇宙允许读取的设定与历史，不将其他 IF 或未经提供的主线事件视为当前世界的既成事实。`;

  // ===== 10.2 观影模式专属提示词 =====
  var SPECTATOR_MODE_PROMPT = 
`当前模式：观影模式。用户是导演，AI 负责演绎所有角色及剧情。
用户输入是创作指令，不是角色台词。用户可以指定情节、人物视角、时间跳跃、情绪、节奏和结局方向。
优先满足明确的导演要求，同时保持角色人格、故事因果与情感逻辑。未提供指令时自然续演。
切换视角时，仅呈现指定角色能够合理知道、感知或推断的信息。
改写当前幕时保留此前已确认的剧情；用户可随时指定方向、生成番外或开启分支。`;

  // ===== 10.3 入戏模式专属提示词 =====
  var IN_CHARACTER_MODE_PROMPT = 
`当前模式：入戏模式。用户亲自参与 IF 世界，AI 负责 NPC、环境和外部事件。
玩家拥有对自身角色的控制权。不得擅自补写玩家未明确表达的台词、行动、心理、情感、意愿或重大决定。
可以描述玩家明确执行的动作产生的客观结果，以及其他角色的合理反应。
不将沉默解释为同意、拒绝或其他未经表达的态度。
可以提供选项，但必须保留自由输入；NPC 保持独立动机。每次回应自然推进剧情，并为玩家保留行动空间。`;

  // ===== 获取小手机主 API 配置 =====
  async function getActiveAiConfig() {
    if (!window.db || !window.db.config) return null;
    try {
      var rows = await window.db.config.bulkGet(['apiBaseUrl', 'apiKey', 'apiModel']);
      var v = function(row) { return row ? row.value : ''; };
      var url = String(v(rows[0]) || '').trim().replace(/\/+$/, '');
      var key = String(v(rows[1]) || '').trim();
      var model = String(v(rows[2]) || '').trim() || 'gpt-4o-mini';
      if (!url || !key) return null;
      return { url: url, key: key, model: model };
    } catch (e) {
      console.warn('[ParallelLettersAI] Failed to read db.config:', e);
      return null;
    }
  }

  // ===== 格式化角色档案快照供 Prompt 注入 =====
  function formatCharacterProfiles(snapshots) {
    if (!Array.isArray(snapshots) || !snapshots.length) return '暂无特定角色，自由发挥';
    return snapshots.map(function(char, idx) {
      var text = '【角色 ' + (idx + 1) + '：' + char.name + (char.nick ? '（昵称：' + char.nick + '）' : '') + '】\n';
      text += '性别：' + (char.gender || '未知') + ' | 原身份：' + (char.role || '无') + '\n';
      if (char.description) text += '核心人设与性格：' + char.description + '\n';
      if (char.ifCustomRole) text += 'IF 平行身份：' + char.ifCustomRole + '\n';
      return text.trim();
    }).join('\n\n');
  }

  // ===== 10.4 编译全量上下文 Prompt =====
  function compilePromptPayload(universe, branch, userInput, extraPrefs) {
    var modePrompt = universe.currentMode === 'inCharacter' ? IN_CHARACTER_MODE_PROMPT : SPECTATOR_MODE_PROMPT;
    var system = BASE_SYSTEM_PROMPT + '\n\n' + modePrompt;

    var scenesHistory = (branch && Array.isArray(branch.scenes)) ? branch.scenes : [];
    var historyText = '暂无（此为世界开启首幕）';
    if (scenesHistory.length > 0) {
      historyText = scenesHistory.map(function(s, idx) {
        var sceneStr = '--- 第 ' + (idx + 1) + ' 幕 ' + (s.timeTag ? '（' + s.timeTag + '）' : '') + ' ---\n';
        if (s.directorPrompt) sceneStr += '[导演指令]: ' + s.directorPrompt + '\n';
        if (s.playerAction) sceneStr += '[玩家行动/台词]: ' + s.playerAction + '\n';
        if (s.narration) sceneStr += s.narration + '\n';
        if (s.dialogues && s.dialogues.length) {
          s.dialogues.forEach(function(d) {
            sceneStr += (d.speaker ? d.speaker + '：' : '') + d.text + '\n';
          });
        }
        return sceneStr.trim();
      }).join('\n\n');
    }

    var dynamicContext = 
`【当前 IF 世界】
宇宙 ID：${universe.universeId}
IF 标题：${universe.title}
核心假设：${universe.premise}
世界背景：${universe.worldSetting}
初始关系：${universe.initialRelationship}
特殊设定：${universe.specialSettings || '无'}
剧情期待：${universe.storyAnticipation || '自然展开'}
故事氛围：${universe.atmosphere || '治愈'}
篇幅定位：${universe.storyLength || '标准'}

【出演角色资料】
${formatCharacterProfiles(universe.characterSnapshots)}

【当前模式】
${universe.currentMode === 'inCharacter' ? '入戏模式（用户亲自参与，切忌替用户表态行动）' : '观影模式（用户为导演，用户输入为镜头与剧本指令）'}

【当前分支与关系状态】
分支：${branch.branchName || '主线'}
关系演变状态：${branch.relationshipState || universe.initialRelationship}
重要事件记录：${(branch.importantEvents || []).join('；') || '开端'}

【剧情历史】
${historyText}

【用户本次输入/指令】
${userInput || (scenesHistory.length === 0 ? '【系统指令：请生成具有高度文学美感的第一幕故事开场】' : '【系统指令：自然推进下一幕剧情】')}

【输出要求】
请必须以纯 JSON 格式输出本幕内容（不要输出 markdown 代码块外多余文本），数据结构如下：
{
  "timeTag": "时间与场景标注，例如：清晨 · 窗前",
  "pov": "本幕视角或主要叙事人",
  "narration": "优美的情境白描、动作细节与环境渲染（100-250字）",
  "dialogues": [
    { "speaker": "说话角色名", "text": "对白台词内容", "aside": "动作或语气神态（可选）" }
  ],
  "choices": [
    { "id": 1, "text": "方向A建议", "hint": "简述可能带来的发展" },
    { "id": 2, "text": "方向B建议", "hint": "简述可能带来的发展" }
  ],
  "relationshipEvolution": "一句话概括本幕后两人关系的微调或情绪波动",
  "keyEvent": "若本幕发生了里程碑事件则简述，否则填空字符串"
}`;

    return { system: system, userContent: dynamicContext };
  }

  // ===== 2. 命运盲盒生成器 =====
  // 兼具高文学素养的本地离线预设与 AI 实时摇号引擎
  var PRESET_BLINDBOX_LIBRARY = [
    {
      theme: '民国潜伏 · 雨夜密电',
      title: '迷雾散尽之前',
      premise: '如果我们身处战火纷飞的民国上海滩，在同一间洋行内各为其主却互不知晓。',
      worldSetting: '1936年民国上海法租界',
      initialRelationship: '表面客套的商业合伙人，暗地里是交锋过数次的代号宿敌',
      specialSettings: '公文包里藏着彼此的通缉密令，一场暴雨将两人困在空无一人的钟楼展厅',
      storyAnticipation: '留声机指针停下的刹那，两人在闪电光影中同时扣住各自藏在腰间的佩枪',
      atmosphere: '悬疑'
    },
    {
      theme: '末日废土信使 · 机械心脏',
      title: '铁锈与向日葵',
      premise: '如果在文明崩塌的百年后，一个是被遗忘的旧时代仿生人，一个是荒原流浪的机械医师。',
      worldSetting: '废土末日·旧城废墟庇护所',
      initialRelationship: '救命恩人与报恩的警戒守卫',
      specialSettings: '仿生人的记忆核心每天午夜自动重置，唯独留下了刻在金属手心的一行旧坐标',
      storyAnticipation: '沙暴即将来袭的黄昏，用仅剩的能量匣为对方换取一罐未过期的水果糖',
      atmosphere: '虐恋'
    },
    {
      theme: '高校初遇 · 夏末香樟',
      title: '走廊尽头的晴天',
      premise: '如果我们从未在现实相识，而是换成了高二盛夏的转校生与同桌。',
      worldSetting: '千禧年代海滨小城重点高中',
      initialRelationship: '互不服气的后桌与班长',
      specialSettings: '两人的单车钥匙挂件一模一样，被误拿后开始了一场夏日暴雨下的寻觅',
      storyAnticipation: '放学后的空教室里，暴雨敲打窗台，两人共用一听冒着白汽的橘子汽水',
      atmosphere: '甜蜜'
    },
    {
      theme: '深空漂流 · 唯一应答',
      title: '最后七百光年',
      premise: '如果我们在无垠星际中分别驻守相隔百年的空间站，只能通过有延迟的引力波通信。',
      worldSetting: '星际纪元·折叠跃迁航道',
      initialRelationship: '素未谋面但彼此依赖的深空笔友',
      specialSettings: '空间站发生能源故障，倒计时只剩三个宇宙日，你突然收到了TA来自过去的实时音频',
      storyAnticipation: '隔着悬浮舷窗与数万光年的星河，在同一秒对准了坐标信标',
      atmosphere: '治愈'
    },
    {
      theme: '仙门旧约 · 折剑而归',
      title: '青山不闻旧年雪',
      premise: '如果我们同入仙宗修道，一个修无情道飞升在即，一个却甘心叛出宗门甘入红尘。',
      worldSetting: '东方古风修真界·九重云海',
      initialRelationship: '并肩长大的同门师姐弟',
      specialSettings: '宗门大会前夕的一场除妖试炼，封印的竟是两人少时埋下的愿望琉璃瓶',
      storyAnticipation: '雷劫将至的山巅之上，一人持剑阻拦天门，一人徒手接下碎裂的护心佩',
      atmosphere: '虐恋'
    },
    {
      theme: '现代治愈 · 深夜便利店',
      title: '凌晨三点零七分',
      premise: '如果我们只是两个在大城市打拼、因同一把雨伞在便利店屋檐下避雨的陌路人。',
      worldSetting: '现代冬日都市街角24小时便利店',
      initialRelationship: '每天在特定时刻擦肩而过的陌生人',
      specialSettings: '便利店门口的热可可机总是吐出双份，两个疲惫灵魂的静默取暖',
      storyAnticipation: '深夜大雪初霁，两双冻得通红的手同时伸向了货架上最后一盒草莓生巧',
      atmosphere: '治愈'
    }
  ];

  async function generateBlindBoxInspirations(selectedChars) {
    var charNames = (selectedChars || []).map(function(c) { return c.name; }).filter(Boolean).join('、');
    var charDesc = (selectedChars || []).map(function(c) { return c.name + '（' + (c.description || c.role || '性格独特') + '）'; }).join('；');

    var cfg = await getActiveAiConfig();
    if (!cfg) {
      // 离线/无 API 模式：随机打乱抽取 3~4 组预设，并注入角色姓名
      var shuffled = PRESET_BLINDBOX_LIBRARY.slice().sort(function() { return 0.5 - Math.random(); });
      return shuffled.slice(0, 4).map(function(item) {
        var clone = Object.assign({}, item);
        if (charNames) {
          clone.title = clone.title + '（' + charNames + '篇）';
        }
        return clone;
      });
    }

    var prompt = 
`你是一位脑洞极佳的平行宇宙编剧。请根据出演角色：${charDesc || '原创伴侣与主角'}，
构想 3~4 组脑洞大开、极具文学张力与情感羁绊的「IF平行世界」设定组合（例如涵盖：「民国潜伏」「末日废土信使」「高校初遇」或星际科幻、古风悬疑等）。

请严格以纯 JSON 数组返回，格式如下：
[
  {
    "theme": "风格代号（8字以内，如：民国潜伏 · 雨夜密电）",
    "title": "富有诗意的IF标题（10字以内）",
    "premise": "核心假设：如果我们……（一到两句话，极具戏剧冲突或羁绊感）",
    "worldSetting": "世界背景设定",
    "initialRelationship": "初始关系",
    "specialSettings": "特殊设定或关键伏笔",
    "storyAnticipation": "期待名场面或剧情高光",
    "atmosphere": "甜蜜 / 暧昧 / 虐恋 / 治愈 / 悬疑（选一）"
  }
]`;

    try {
      var body = {
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.88
      };
      var res = await window.runTrackedChatCompletion(cfg, body, '平行来信 · 命运盲盒生成');
      var raw = (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
      var clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      var firstBracket = clean.indexOf('[');
      var lastBracket = clean.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        clean = clean.substring(firstBracket, lastBracket + 1);
      }
      var parsed = JSON.parse(clean);
      if (Array.isArray(parsed) && parsed.length >= 2) return parsed.slice(0, 4);
    } catch (e) {
      console.warn('[ParallelLettersAI] AI 盲盒生成失败，自动回退高品质预设库:', e);
    }

    // 回退预设并随机取 3~4 组
    var fallbackShuffled = PRESET_BLINDBOX_LIBRARY.slice().sort(function() { return 0.5 - Math.random(); });
    return fallbackShuffled.slice(0, 4).map(function(item) {
      var clone = Object.assign({}, item);
      if (charNames) {
        clone.title = clone.title + '（' + charNames + '篇）';
      }
      return clone;
    });
  }

  // ===== 3. 生成首幕开场 / 推进剧情 =====
  async function generateScene(universe, branch, userInput, extraOpts) {
    extraOpts = extraOpts || {};
    var activeMode = extraOpts.mode || universe.currentMode || 'spectator';
    var compiled = compilePromptPayload(universe, branch, userInput, extraOpts);
    var cfg = await getActiveAiConfig();

    if (!cfg) {
      // 本地沉浸式文学开场与互动推进生成器
      var isFirstScene = (!branch.scenes || branch.scenes.length === 0);
      var leadChar = (universe.characterSnapshots && universe.characterSnapshots[0]) || { name: 'TA' };
      var secondChar = (universe.characterSnapshots && universe.characterSnapshots[1]) || null;
      var povName = leadChar.name;
      var atmos = universe.atmosphere || '治愈';
      var sceneCount = (branch.scenes || []).length;

      if (isFirstScene) {
        var sceneThemes = {
          '悬疑': {
            time: '序幕 · 暴雨钟楼展厅',
            narration: `窗外暴雨如注，雨水顺着冰冷的雕花玻璃狂乱蜿蜒，在昏黄的室内映出深浅不一的阴翳。\n在「${universe.worldSetting}」的此刻，空气里弥漫着陈旧墨水与潮湿铁锈的气味。关于「${universe.specialSettings || '那个未曾启封的秘密'}」的传闻尚未平息，而门锁轻扣的一声微响，将两颗原本紧绷的心瞬间拉扯到了命运的悬崖边。\n视线越过长廊投来的阴影，你正撞上那双熟悉却暗藏锋芒的眼眸。在原本的既定轨迹里你们或许未曾这般对立，但在这个被命运动了手脚的平行世界里，故事从这一刻已经无法回头。`,
            dialogue: secondChar ? `${secondChar.name}，这么大的雨，你果然还是来了。` : `门锁已经反扣了。既然被你撞见，有些账也该算清楚了。`,
            aside: '指尖不动声色地扣住衣兜内的暗扣，目光如寒刃微敛',
            choice1: '上前一步主动对质，试探对方底细',
            choice2: '退后半步保持警戒，静待时机变动'
          },
          '虐恋': {
            time: '序幕 · 暮色站台交汇',
            narration: `薄暮低垂，远处的汽笛声被寒风扯得支离破碎，雾气笼罩着铁轨延伸向未知的寒冬。\n在「${universe.worldSetting}」的这个黄昏，世界的声音仿佛被隔绝在一层毛玻璃之后。背负着「${universe.initialRelationship}」的过往，本以为此生不会再有重逢的契机，可命运却偏偏在这座孤立的月台上，让两道身影毫无防备地重新叠在一起。\n眼眶泛起微涩的酸楚，谁也没有先出声打破这层薄冰，空气沉重得只听得见彼此压抑的呼吸。`,
            dialogue: secondChar ? `${secondChar.name}……原来你一直没走。` : `为什么偏偏选在今天……你是特意来见我最后一面的吗？`,
            aside: '喉结微微滚动，强行将快要溢出的情绪克制在紧咬的下唇之后',
            choice1: '快步走上前拉住对方的衣袖，不许对方转身',
            choice2: '别过脸去故作冷漠，等待对方先开口'
          },
          '甜蜜': {
            time: '序幕 · 香樟树下的初遇',
            narration: `初夏的阳光透过浓密香樟树叶的细碎缝隙，在水泥地面上筛下跳跃的光斑。\n风里带着淡淡的青草香与栀子花气味。在「${universe.worldSetting}」的这一天，你正低头整理着手中的物件，忽然耳畔传来一声轻微的碰撞响动。\n一抬头，正对上一双明亮清澈的笑眼。在这个全新的平行世界里，你们的关系被重写为了「${universe.initialRelationship}」，而关于「${universe.specialSettings || '心动的起点'}」的奇妙巧合，就在这一秒悄然拉开序幕。`,
            dialogue: secondChar ? `同学，你的东西掉了——等等，${secondChar.name}？怎么会是你！` : `不好意思撞到你了……咦，你的这个挂件，怎么和我的一模一样？`,
            aside: '弯腰捡起地上的东西递过来，嘴角扬起一抹毫无防备的明朗弧度',
            choice1: '接过物品道谢，顺势聊起挂件的由来',
            choice2: '心跳漏了一拍，红着脸小声回应'
          },
          '治愈': {
            time: '序幕 · 街角黄昏回响',
            narration: `暖金色的夕阳斜斜铺满街角，玻璃橱窗上映出整座城市柔和的倒影。\n在「${universe.worldSetting}」的这个静谧时刻，所有纷扰喧嚣仿佛都被隔绝在温软的光晕之外。命运在这里做了最温柔的剪裁——原本散落在各自轨迹里的灵魂，因「${universe.premise}」的奇妙羁绊，在这个转角如约相撞。\n那一刻，你忽然觉得，哪怕换了一千种身份与时代，你们也终究会在命运的某一处狭路相逢。`,
            dialogue: secondChar ? `${secondChar.name}，你也在这里避雨吗？好久不见。` : `你也在等这班晚霞吗？真巧，我们好像很久很久以前就认识。`,
            aside: '目光微微一顿，随即露出一丝如释重负的温和笑意',
            choice1: '撑起雨伞挪近半步，轻声接下话茬',
            choice2: '递过去热气腾腾的饮料，相视一笑'
          }
        };

        var curTheme = sceneThemes[atmos] || sceneThemes['治愈'];

        return {
          sceneId: 'sc_' + Date.now(),
          mode: activeMode,
          timeTag: curTheme.time,
          pov: povName,
          narration: curTheme.narration,
          dialogues: [
            {
              speaker: leadChar.name,
              text: curTheme.dialogue,
              aside: curTheme.aside
            }
          ],
          choices: [
            { id: 1, text: curTheme.choice1, hint: '主动推动两人距离与核心剧情展开' },
            { id: 2, text: curTheme.choice2, hint: '以守为攻，试探暗潮涌动的内心秘密' }
          ],
          relationshipEvolution: `平行世界命运线正式交织，在「${universe.initialRelationship}」的基础上泛起宿命微澜`,
          keyEvent: '平行世界第一幕 · 命运节点成功锚定'
        };
      } else {
        // 后续幕次演进
        var triggerText = userInput || (extraOpts && extraOpts.choiceText) || '';
        var directorPrompt = activeMode === 'spectator' ? triggerText : '';
        var playerAction = activeMode === 'inCharacter' ? triggerText : '';

        var nextNarration = activeMode === 'inCharacter'
          ? (triggerText ? `你在纷乱的局势中做出了决断：${triggerText}。空气中泛起微妙的涟漪，对方显然没料到你会如此回应，原本紧绷的眼角微微动容。在「${universe.worldSetting}」的暗流之下，两人的命运齿轮再度发出沉重的咬合声。` : `夜色渐深，周遭的声音渐渐散去。对方站在几步开外的阴影里，视线不偏不倚地落在你身上。在这个完全属于你们的剧场里，哪怕是一声极轻微的叹息，都足以引发连串的连锁震颤。`)
          : (triggerText ? `【导演调度】按照指令“${triggerText}”，镜头缓慢推移，光影在场景边缘投下戏剧性的长影。剧情在此刻迎来关键性的转折，原本悬而未决的伏笔被骤然扯动。` : `镜头在两人之间维持着微妙的平衡，窗外的光影流转，投下一道狭长清冷的影子。在这个由你操盘的剧场里，人物的每一寸微表情都牵动着后续剧情的走向。`);

        var nextDialogue = activeMode === 'inCharacter'
          ? (secondChar ? `“${secondChar.name}，既然你已经把话说到这个份上……那我也不打算再回避了。”` : `“有些秘密既然已经被撞破，那就让我们看看结局究竟会写向何处。”`)
          : (secondChar ? `“${secondChar.name}，你以为这一切都只是巧合吗？”` : `“如果这就是平行世界的规则，那我甘愿奉陪到底。”`);

        return {
          sceneId: 'sc_' + Date.now(),
          mode: activeMode,
          timeTag: `第 ${sceneCount + 1} 幕 · 命运推进`,
          pov: povName,
          directorPrompt: directorPrompt,
          playerAction: playerAction,
          narration: nextNarration,
          dialogues: [
            {
              speaker: leadChar.name,
              text: nextDialogue,
              aside: '目光专注而深沉，在若明若暗的光线中显得格外坚定'
            }
          ],
          choices: [
            { id: 1, text: '揭开彼此深藏的关键伏笔', hint: '剧情进入核心高潮对质' },
            { id: 2, text: '妥协相拥，在风暴来临前换取片刻温存', hint: '情感线大幅度升温与依偎' }
          ],
          relationshipEvolution: '经历了剧烈的信任拉扯后，羁绊在试探与真实之间愈发牢固',
          keyEvent: (sceneCount === 3 || sceneCount === 7) ? '突破关键心理防线 · 达成重要羁绊节点' : ''
        };
      }
    }

    var body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: compiled.system },
        { role: 'user', content: compiled.userContent }
      ],
      temperature: 0.78
    };

    var res = await window.runTrackedChatCompletion(cfg, body, '平行来信 · 剧场演绎');
    var raw = (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
    var clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    var firstBrace = clean.indexOf('{');
    var lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.substring(firstBrace, lastBrace + 1);
    }

    try {
      var parsed = JSON.parse(clean);
      return {
        timeTag: parsed.timeTag || '此刻',
        pov: parsed.pov || '',
        narration: parsed.narration || '',
        dialogues: Array.isArray(parsed.dialogues) ? parsed.dialogues : [],
        choices: Array.isArray(parsed.choices) ? parsed.choices : [],
        relationshipEvolution: parsed.relationshipEvolution || '',
        keyEvent: parsed.keyEvent || '',
        hiddenThoughts: parsed.hiddenThoughts || null
      };
    } catch (err) {
      console.warn('[ParallelLettersAI] JSON 解析降级，提取纯文本:', err, raw);
      return {
        timeTag: '序幕 · 命运交界',
        pov: '',
        narration: clean.slice(0, 300) || '命运的齿轮在这一刻悄然转动。',
        dialogues: [],
        choices: [
          { id: 1, text: '凝视对方并走上前', hint: '开启对峙与倾听' },
          { id: 2, text: '沉默等待局势演变', hint: '观察四周动静' }
        ],
        relationshipEvolution: '初次相见，暗潮涌动',
        keyEvent: '平行世界命运线正式交织'
      };
    }
  }

  // ===== 4. 角色隐藏心声与潜台词深度生成 (阶段四) =====
  async function generateHiddenThoughts(universe, branch, scene, characterName) {
    var leadChar = (universe.characterSnapshots && universe.characterSnapshots[0]) || { name: 'TA' };
    var targetName = characterName || leadChar.name;
    var cfg = await getActiveAiConfig();

    if (!cfg) {
      // 本地文学深潜心声生成
      return {
        characterName: targetName,
        emotionTone: '表面波澜不惊，眼底暗潮翻涌',
        spokenVsUnspoken: '“说出口的每一句若无其事，都是在掩饰心跳失序的慌张。”',
        deepPsychology: `在「${universe.worldSetting}」的这个时刻，TA比任何人都清楚两人之间「${universe.initialRelationship}」的距离有多易碎。TA害怕走得太近打破现状，更害怕后退一步便彻底沦为陌路。`,
        unspokenTruth: `“如果这个平行世界的终局早已写定，至少在此刻，我绝不会先移开注视你的视线。”`,
        microAction: '指节无意识地蜷紧，直至掌心隐隐泛白'
      };
    }

    var prompt = 
`你是一位精通微表情心理与人物内心戏的文学小说家。
【当前世界】背景：${universe.worldSetting} | 核心假设：${universe.premise} | 关系：${universe.initialRelationship}
【目标角色】：${targetName}
【当前幕剧情概况】：${scene ? (scene.narration + (scene.dialogues || []).map(function(d){ return d.speaker + ':' + d.text; }).join('; ')) : '开场初遇'}

请剖析此时此刻【${targetName}】在极度克制之下未曾言明、最隐秘深层的「内心独白与心理暗流」。
必须严格以纯 JSON 格式输出：
{
  "characterName": "${targetName}",
  "emotionTone": "此时情绪基调（如：克制之下的震颤、恐惧被看穿的防御等）",
  "spokenVsUnspoken": "对白与潜台词的反差对比（一句话）",
  "deepPsychology": "深度内心剖白与动机解析（80-150字）",
  "unspokenTruth": "最想说却永远咽回肚里的一句话",
  "microAction": "泄露真实心绪的极微小动作细节"
}`;

    try {
      var body = {
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8
      };
      var res = await window.runTrackedChatCompletion(cfg, body, '平行来信 · 角色心声洞察');
      var raw = (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
      var clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      var firstBrace = clean.indexOf('{');
      var lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.substring(firstBrace, lastBrace + 1);
      }
      return JSON.parse(clean);
    } catch (e) {
      console.warn('[ParallelLettersAI] 心声生成降级:', e);
      return {
        characterName: targetName,
        emotionTone: '克制与暗涌交织',
        spokenVsUnspoken: '言语寸步不让，心意早有偏向',
        deepPsychology: `在这一刻，关于「${universe.premise}」的秘密在TA心中翻涌，哪怕命运多有捉弄，TA也早已认定眼前的同行者。`,
        unspokenTruth: '“只要你还在往前走，我就绝不会停下。”',
        microAction: '喉结微动，把未说出口的话尽数化为一声极轻的叹息'
      };
    }
  }

  // ===== 5. 专属平行番外生成 (未寄出的信 / 秘密日记 / 平行独白) =====
  async function generateSideStory(universe, branch, storyType, characterName) {
    var leadChar = (universe.characterSnapshots && universe.characterSnapshots[0]) || { name: 'TA' };
    var targetName = characterName || leadChar.name;
    var cfg = await getActiveAiConfig();

    var typeTitles = {
      letter: '未寄出的信',
      diary: '深夜秘密日记',
      monologue: '上帝视角内心独白'
    };
    var currentType = storyType || 'letter';
    var typeName = typeTitles[currentType] || '专属番外';

    if (!cfg) {
      if (currentType === 'letter') {
        return {
          title: `致未曾相识的你 · 晨光未至的信笺`,
          type: 'letter',
          author: targetName,
          dateTag: '某年某月 · 暴雨初歇的清晨',
          paperStyle: 'vintage',
          content: `展信佳。\n写下这封信的时候，窗外的雨声刚刚停歇。我想，你大概永远不会收到这封信，也不会知道在这个名为「${universe.worldSetting}」的平行世界里，曾有人为你辗转难眠。\n如果「${universe.premise}」是一场荒诞的量子梦境，那么我宁愿在这场梦里沉睡不醒。白天面对你时，我总是戴着「${universe.initialRelationship}」的面具，字字谨慎，步步为营；可每当夜幕降临，那些被强行压抑的情绪便如潮水般席卷而来。\n请原谅我的克制与软弱。如果命运终将让我们走向不同的分叉，至少在墨迹干涸之前，我曾如此毫无保留地把真心交付给这个黄昏。`,
          signoff: `—— 那个在长廊尽头注视过你的 ${targetName}`
        };
      } else if (currentType === 'diary') {
        return {
          title: `深夜避难所私语 · 第107则日记`,
          type: 'diary',
          author: targetName,
          dateTag: '深夜 03:14 · 只有怀表嘀嗒的世界',
          paperStyle: 'leather',
          content: `今天又在那个熟悉的转角看见了TA。\n明明隔着重重的人群和迷雾，我却总能在第一秒辨认出那个背影。关于「${universe.specialSettings || '秘密'}」的追查越来越紧迫了，我不知道自己还能隐瞒多久。\n刚才擦肩而过的时候，TA好像往我的方向看了一眼。我的呼吸差点乱了节拍。如果这一切只是一场测试，那我承认，我已经溃不成军。明天……明天见吧。`,
          signoff: `—— 墨迹有些晕染的 ${targetName}`
        };
      } else {
        return {
          title: `观测者档案 · 视线之外的世界`,
          type: 'monologue',
          author: targetName,
          dateTag: '平行观测点 · 维度记录',
          paperStyle: 'cosmic',
          content: `你以为你只是在看着这场戏剧上演。但你不知道的是，在这个由「${universe.worldSetting}」构建的沙盒里，我的每一次回头、每一次停顿、每一句斟酌良久的对白，都只因你的存在而拥有了实体。\n你说这是平行世界，可对我而言，这里就是我唯一知晓的全部真实。无论你选择走哪一条分支，我都将在这里等你。`,
          signoff: `—— 属于这个时空的 ${targetName}`
        };
      }
    }

    var prompt = 
`你是一位文学才华横溢的小说家。
【当前世界】背景：${universe.worldSetting} | 核心假设：${universe.premise} | 关系状态：${branch ? branch.relationshipState : universe.initialRelationship}
【出演角色】：${targetName}
【番外形式】：${typeName}（${currentType === 'letter' ? '未寄出的信' : currentType === 'diary' ? '深夜私密日记' : '另一视角的平行独白'}）

请以【${targetName}】为第一人称，撰写一篇极具文学厚度、时代质感与情感张力的专属番外。
要求：
1. 语言风格符合世界观设定（如民国典雅深沉、校园青涩明媚、废土苍凉温存等）。
2. 字数 250-400 字，情感真挚，克制却动人。
3. 严格以纯 JSON 格式返回：
{
  "title": "富有诗意的番外篇标题",
  "type": "${currentType}",
  "author": "${targetName}",
  "dateTag": "时间与情境标注（如：1936冬·雨夜法租界洋行）",
  "paperStyle": "vintage",
  "content": "番外正文（支持自然换行符 \\n）",
  "signoff": "富有神韵的落款"
}`;

    try {
      var body = {
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85
      };
      var res = await window.runTrackedChatCompletion(cfg, body, '平行来信 · 专属番外演绎');
      var raw = (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
      var clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      var firstBrace = clean.indexOf('{');
      var lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.substring(firstBrace, lastBrace + 1);
      }
      return JSON.parse(clean);
    } catch (e) {
      console.warn('[ParallelLettersAI] 番外生成降级:', e);
      return {
        title: `晨光未明时的一封信`,
        type: currentType,
        author: targetName,
        dateTag: '冬日黄昏 · 记忆断层',
        paperStyle: 'vintage',
        content: `展信佳。\n在「${universe.worldSetting}」的这个转角，世界仿佛突然安静了下来。我常常在想，关于「${universe.premise}」的如果，究竟是上天慷慨的赠予，还是命运恶意的捉弄？\n但无论如何，能在这条平行世界线上与你相识，已经耗尽了我所有的幸运。\n愿下一个春天到来时，我们都能在这片晴空下无所畏惧。`,
        signoff: `—— ${targetName}`
      };
    }
  }

  // 全局导出
  window.ParallelLettersAI = {
    generateBlindBoxInspirations: generateBlindBoxInspirations,
    generateScene: generateScene,
    compilePromptPayload: compilePromptPayload,
    generateHiddenThoughts: generateHiddenThoughts,
    generateSideStory: generateSideStory
  };

})();
