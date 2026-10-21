// life-game-ai.js — 弯弯小手机｜人生游戏 (Life Game) 阶段 2
// AI 智能目标拆解＋动态计划＋每日冒险推荐＋自习室只读联动＋每周成长复盘
// 核心原则：真实目标 · AI辅助规划 · 用户确认执行 · 动态调整 · 零破坏性 · 极简黑白灰美学

(function(global) {
  'use strict';

  // ===== 1. 持久化存储键 =====
  var STORAGE_AI_DRAFTS = 'life_game_ai_drafts_v1';
  var STORAGE_AI_PLANS = 'life_game_ai_plan_versions_v1';
  var STORAGE_AI_SUGGESTIONS = 'life_game_ai_daily_suggestions_v1';
  var STORAGE_AI_REVIEWS = 'life_game_ai_weekly_reviews_v1';
  var STORAGE_AI_PREFERENCES = 'life_game_ai_preferences_v1';

  // ===== 2. 基础存储与工具函数 =====
  async function loadStorage(key, fallback) {
    try {
      if (window.db && db.config) {
        var row = await db.config.get(key);
        if (row && row.value !== undefined) return row.value;
      }
    } catch (e) {
      console.warn('[LifeGameAI] Dexie get error:', key, e);
    }
    try {
      var item = localStorage.getItem(key);
      if (item !== null && item !== undefined) return JSON.parse(item);
    } catch (_) {}
    return fallback;
  }

  async function saveStorage(key, value) {
    try {
      if (window.db && db.config) {
        await db.config.put({ key: key, value: value });
      }
    } catch (e) {
      console.warn('[LifeGameAI] Dexie put error:', key, e);
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function uid(prefix) {
    return (prefix || 'lgai') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function getTodayStr() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + ' ' + h + ':' + min;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 提取清洗 AI 返回的 JSON 代码块或纯文本
  function extractJson(raw) {
    if (!raw) return null;
    var text = String(raw).trim();
    // 移除 markdown 代码块包裹
    if (text.indexOf('```') !== -1) {
      text = text.replace(/```(?:json)?([\s\S]*?)```/g, '$1').trim();
    }
    // 截取首个 { 到最后一个 }
    var firstOpen = text.indexOf('{');
    var lastClose = text.lastIndexOf('}');
    if (firstOpen !== -1 && lastClose > firstOpen) {
      text = text.substring(firstOpen, lastClose + 1);
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      console.warn('[LifeGameAI] JSON parse error:', err, 'Raw:', raw);
      return null;
    }
  }

  // ===== 3. 自习室专注数据只读提炼器 =====
  // 最小必要数据脱敏：只提取统计数字，绝不篡改、绝不上传敏感日志
  async function getStudyRoomSummary() {
    try {
      var srRecords = await loadStorage('wanwan_study_records', []);
      if (!Array.isArray(srRecords) || srRecords.length === 0) {
        return {
          hasRecords: false,
          totalMinutes: 0,
          totalSessions: 0,
          recent7DaysMinutes: 0,
          recent7DaysSessions: 0,
          topSubjects: [],
          summaryText: '自习室暂无专注记录'
        };
      }

      var now = Date.now();
      var sevenDaysAgo = now - 7 * 86400000;
      var totalMinutes = 0;
      var recentMinutes = 0;
      var recentSessions = 0;
      var subjectMap = {};

      srRecords.forEach(function(r) {
        var mins = Number(r.durationMinutes) || 0;
        var rTime = r.timestamp || (r.date ? new Date(r.date).getTime() : 0);
        totalMinutes += mins;
        if (rTime >= sevenDaysAgo) {
          recentMinutes += mins;
          recentSessions++;
        }
        var sName = r.taskName || r.taskType || '学习任务';
        subjectMap[sName] = (subjectMap[sName] || 0) + mins;
      });

      var topSubjects = Object.keys(subjectMap)
        .sort(function(a, b) { return subjectMap[b] - subjectMap[a]; })
        .slice(0, 3);

      var summaryText = '累计完成 ' + srRecords.length + ' 次专注（共 ' + totalMinutes + ' 分钟）；近 7 天专注 ' + recentSessions + ' 次（共 ' + recentMinutes + ' 分钟）' +
        (topSubjects.length > 0 ? '，主要攻坚：' + topSubjects.join('、') : '') + '。';

      return {
        hasRecords: true,
        totalMinutes: totalMinutes,
        totalSessions: srRecords.length,
        recent7DaysMinutes: recentMinutes,
        recent7DaysSessions: recentSessions,
        topSubjects: topSubjects,
        summaryText: summaryText
      };
    } catch (e) {
      console.warn('[LifeGameAI] getStudyRoomSummary exception:', e);
      return { hasRecords: false, totalMinutes: 0, summaryText: '自习室数据读取正常' };
    }
  }

  // ===== 4. AI 人生规划核心调用中枢 (LifeGameAIEngine) =====
  var LifeGameAIEngine = {
    // 统一调用项目现有 window.callAI 接口，不设新 Key
    async invokeAI(messages, opts) {
      if (!window.callAI || typeof window.callAI !== 'function') {
        throw new Error('未检测到全局 AI 引擎 (window.callAI)，请先在手机设置中配置 API Key 与模型');
      }
      return await window.callAI(messages, opts);
    },

    // 4.1 目标拆解 (Decompose Goal)
    async decomposeGoal(params) {
      var studySummary = await getStudyRoomSummary();
      var char = window.RoleWorldbookService ? await window.RoleWorldbookService.getActiveCharacter() : { name: '沈星回' };

      var systemPrompt =
        '你是一位温暖、严谨、深具规划智慧的「人生游戏」现实目标拆解导师。\n' +
        '你的任务是将用户输入的现实目标，按照 RPG 冒险模式拆解为层次分明、切实可行、节奏合理的计划。\n' +
        '拆解层级：\n' +
        '长期目标 (Goal) → 阶段章节 (Stages，2~4个) → 里程碑 (Milestones，每阶段1~2个) → 现实委托任务 (Tasks，每阶段2~4个)。\n\n' +
        '【严格规则】\n' +
        '1. 必须完全输出纯合法 JSON 对象，严禁包裹任何 Markdown 标记以外的解释文字。\n' +
        '2. 尊重现实：根据用户每日可用时间与每周投入天数评估可行性，留出休息缓冲，不得超载或开空头支票。\n' +
        '3. 任务难度为 easy / mid / hard，预计时长 15~90 分钟之间。类别可为 study (学习专注), daily (日常习惯), main (主线攻坚), side (支线探索)。\n' +
        '4. 如果属于学习类目标，可标记 linkStudyRoom: true 引导与自习室专注记录联动。\n' +
        '5. 必须评估可行性并返回 feasibility 字段，分析负荷风险。';

      var userPrompt =
        '请拆解以下长期目标：\n' +
        '目标名称：' + (params.title || '') + '\n' +
        '目标背景/描述：' + (params.desc || '无补充') + '\n' +
        '目标期望达成日期：' + (params.targetDate || '未指定具体日期') + '\n' +
        '当前个人基础：' + (params.currentLevel || '零基础/初学') + '\n' +
        '每日可用时间：' + (params.dailyHours || 1.5) + ' 小时\n' +
        '每周可投入：' + (params.weeklyDays || 5) + ' 天\n' +
        '规划节奏强度：' + (params.pace === 'easy' ? '轻松成长（缓冲充分）' : params.pace === 'hard' ? '集中攻坚（快速突围）' : '均衡推进（劳逸结合）') + '\n' +
        '已知限制与考量：' + (params.constraints || '无') + '\n' +
        '陪伴自习室现状：' + studySummary.summaryText + '\n\n' +
        '请严格以如下 JSON 格式返回：\n' +
        '{\n' +
        '  "summary": "目标核心破局思路与冒险纲要",\n' +
        '  "feasibility": {\n' +
        '    "isRealistic": true,\n' +
        '    "assessment": "负荷评估与时间充裕度说明",\n' +
        '    "restBufferNote": "休息与缓冲安排建议",\n' +
        '    "risks": ["潜在卡点或时间冲突提醒"]\n' +
        '  },\n' +
        '  "stages": [\n' +
        '    {\n' +
        '      "stageIndex": 1,\n' +
        '      "stageName": "阶段一：奠定基石",\n' +
        '      "desc": "核心行动目标",\n' +
        '      "milestones": [\n' +
        '        { "title": "里程碑名称", "expReward": 80, "desc": "判定达成标准" }\n' +
        '      ],\n' +
        '      "tasks": [\n' +
        '        {\n' +
        '          "title": "具体现实委托",\n' +
        '          "desc": "执行细节与交付物",\n' +
        '          "category": "study",\n' +
        '          "difficulty": "mid",\n' +
        '          "estimatedMinutes": 45,\n' +
        '          "targetMinutes": 45,\n' +
        '          "dueDateOffsetDays": 3,\n' +
        '          "linkStudyRoom": true\n' +
        '        }\n' +
        '      ]\n' +
        '    }\n' +
        '  ]\n' +
        '}';

      var messages = [
        { role: 'user', content: userPrompt }
      ];

      var rawResult = await this.invokeAI(messages, {
        system: systemPrompt,
        responseFormat: 'json_object',
        temperature: 0.6
      });

      var parsed = extractJson(rawResult);
      if (!parsed || !parsed.stages || !Array.isArray(parsed.stages)) {
        throw new Error('AI 返回的计划结构无法正常解析，请重试');
      }

      return this.sanitizeDecomposeResult(parsed, params);
    },

    // 校验与数据净化（防注入与字段补全）
    sanitizeDecomposeResult(parsed, params) {
      var clean = {
        id: uid('draft'),
        goalTitle: String(params.title || '我的长期愿景').slice(0, 50),
        goalDesc: String(params.desc || '').slice(0, 200),
        targetDate: params.targetDate || '',
        pace: params.pace || 'balanced',
        dailyHours: Number(params.dailyHours) || 1.5,
        summary: String(parsed.summary || '目标拆解计划').slice(0, 300),
        feasibility: {
          isRealistic: Boolean(parsed.feasibility ? parsed.feasibility.isRealistic !== false : true),
          assessment: String(parsed.feasibility && parsed.feasibility.assessment ? parsed.feasibility.assessment : '计划时间配置均衡，适合按部就班推进。').slice(0, 200),
          restBufferNote: String(parsed.feasibility && parsed.feasibility.restBufferNote ? parsed.feasibility.restBufferNote : '每周留出 1~2 天机动缓冲与身心放松。').slice(0, 150),
          risks: Array.isArray(parsed.feasibility && parsed.feasibility.risks) ? parsed.feasibility.risks.map(function(r) { return String(r).slice(0, 60); }) : []
        },
        stages: [],
        createdAt: Date.now(),
        applied: false
      };

      var baseDate = new Date();

      (parsed.stages || []).slice(0, 5).forEach(function(stg, sIdx) {
        var cleanStage = {
          stageIndex: sIdx + 1,
          stageName: String(stg.stageName || ('阶段 ' + (sIdx + 1))).slice(0, 40),
          desc: String(stg.desc || '').slice(0, 150),
          milestones: [],
          tasks: []
        };

        (stg.milestones || []).slice(0, 3).forEach(function(m) {
          cleanStage.milestones.push({
            id: uid('ms'),
            title: String(m.title || '阶段关键里程碑').slice(0, 40),
            desc: String(m.desc || '').slice(0, 100),
            expReward: Math.min(100, Math.max(40, Number(m.expReward) || 80)),
            done: false,
            claimed: false
          });
        });

        if (cleanStage.milestones.length === 0) {
          cleanStage.milestones.push({
            id: uid('ms'),
            title: cleanStage.stageName + ' 核心突破',
            desc: '完成该阶段所有重要任务',
            expReward: 80,
            done: false,
            claimed: false
          });
        }

        (stg.tasks || []).slice(0, 8).forEach(function(t) {
          var offset = Number(t.dueDateOffsetDays) || ((sIdx * 7) + 3);
          var d = new Date(baseDate);
          d.setDate(d.getDate() + offset);
          var dueStr = d.toISOString().slice(0, 10);

          var diff = ['easy', 'mid', 'hard'].indexOf(t.difficulty) !== -1 ? t.difficulty : 'mid';
          var cat = ['study', 'daily', 'main', 'side'].indexOf(t.category) !== -1 ? t.category : 'main';
          var mins = Math.min(180, Math.max(15, Number(t.estimatedMinutes) || 45));

          cleanStage.tasks.push({
            id: uid('task_draft'),
            title: String(t.title || '现实行动委托').slice(0, 40),
            desc: String(t.desc || '').slice(0, 150),
            category: cat,
            difficulty: diff,
            estimatedMinutes: mins,
            targetMinutes: cat === 'study' ? mins : 0,
            dueDate: dueStr,
            linkStudyRoom: Boolean(t.linkStudyRoom || cat === 'study'),
            selected: true // 用户可勾选/取消勾选
          });
        });

        clean.stages.push(cleanStage);
      });

      return clean;
    },

    // 4.2 今日不知道做什么？推荐每日冒险 (Today Action Recommendation)
    async recommendTodayActions(options) {
      var tasks = await window.LifeGameCore.getTasks();
      var goals = await window.LifeGameCore.getGoals();
      var habits = await window.LifeGameCore.getHabits();
      var studySummary = await getStudyRoomSummary();
      var char = window.RoleWorldbookService ? await window.RoleWorldbookService.getActiveCharacter() : { name: '沈星回' };

      var pendingTasks = tasks.filter(function(t) { return t.status === 'pending'; });
      var today = getTodayStr();

      var systemPrompt =
        '你是一位了解玩家真实处境的贴心 RPG 冒险向导。\n' +
        '根据用户今天的可用时间、当前精力状态，以及现存的未完成任务和长期目标，给出精炼明确的「今日行动推荐」。\n' +
        '严禁纯凭经验高低排序；必须优先挑出真正有推动力、符合当前精力的 1 件核心焦点任务 + 1~2 件支持行动。\n' +
        '保持温和鼓励，以伴侣口吻给出 1 句简短的行动寄语。\n' +
        '输出严格为纯 JSON 对象。';

      var userPrompt =
        '今日决策条件：\n' +
        '- 今天可用时间：' + (options.availableMinutes || 60) + ' 分钟\n' +
        '- 当前精力状态：' + (options.energy === 'high' ? '精力充沛，适合攻坚' : options.energy === 'low' ? '略感疲惫，宜轻松推进' : '良好适中') + '\n' +
        '- 优先偏好：' + (options.preference === 'urgent' ? '处理快到期任务' : options.preference === 'study' ? '自习室深度专注' : options.preference === 'relax' ? '轻松习惯与恢复' : '均衡推进') + '\n' +
        '- 伴侣角色：' + (char.name || 'Ta') + '\n\n' +
        '当前进行中委托任务清单 (' + pendingTasks.length + ' 条)：\n' +
        JSON.stringify(pendingTasks.map(function(t) {
          return { id: t.id, title: t.title, category: t.category, diff: t.difficulty, due: t.dueDate };
        })) + '\n\n' +
        '长期愿景进展：\n' +
        JSON.stringify(goals.map(function(g) {
          var msDone = (g.milestones || []).filter(function(m) { return m.done; }).length;
          return { title: g.title, progress: msDone + '/' + (g.milestones || []).length };
        })) + '\n\n' +
        '自习室专注现状：' + studySummary.summaryText + '\n\n' +
        '请严格以如下 JSON 格式返回：\n' +
        '{\n' +
        '  "coreTask": {\n' +
        '    "taskId": "如果来自已有任务填其ID，如果是新建小行动则填new",\n' +
        '    "title": "今日最重要的一件事",\n' +
        '    "reason": "为什么今天最该做它",\n' +
        '    "estimatedMinutes": 45,\n' +
        '    "category": "study"\n' +
        '  },\n' +
        '  "secondaryTasks": [\n' +
        '    {\n' +
        '      "taskId": "已有任务ID或new",\n' +
        '      "title": "次要推进事项",\n' +
        '      "estimatedMinutes": 20,\n' +
        '      "category": "daily"\n' +
        '    }\n' +
        '  ],\n' +
        '  "restAdvice": "劳逸结合的具体间歇安排",\n' +
        '  "companionQuote": "' + (char.name || 'Ta') + ' 的一句真挚陪伴语"\n' +
        '}';

      var messages = [
        { role: 'user', content: userPrompt }
      ];

      var raw = await this.invokeAI(messages, {
        system: systemPrompt,
        responseFormat: 'json_object',
        temperature: 0.5
      });

      var parsed = extractJson(raw);
      if (!parsed || !parsed.coreTask) {
        throw new Error('今日行动推荐生成失败，请重试');
      }

      return {
        id: uid('recom'),
        date: today,
        createdAt: Date.now(),
        availableMinutes: options.availableMinutes || 60,
        energy: options.energy || 'normal',
        coreTask: {
          taskId: parsed.coreTask.taskId || 'new',
          title: String(parsed.coreTask.title || '今日焦点攻坚').slice(0, 40),
          reason: String(parsed.coreTask.reason || '契合当前精力与核心目标').slice(0, 150),
          estimatedMinutes: Number(parsed.coreTask.estimatedMinutes) || 45,
          category: parsed.coreTask.category || 'main'
        },
        secondaryTasks: Array.isArray(parsed.secondaryTasks) ? parsed.secondaryTasks.map(function(s) {
          return {
            taskId: s.taskId || 'new',
            title: String(s.title || '协同行动').slice(0, 40),
            estimatedMinutes: Number(s.estimatedMinutes) || 20,
            category: s.category || 'daily'
          };
        }).slice(0, 3) : [],
        restAdvice: String(parsed.restAdvice || '每专注 40 分钟，起身眺望窗外休息 5 分钟。').slice(0, 150),
        companionQuote: String(parsed.companionQuote || '「有我陪着你，放轻松，一步一步来就好。」').slice(0, 150)
      };
    },

    // 4.3 动态计划调整评估与对比 (Dynamic Plan Adjustment)
    async evaluateAndAdjustPlan(goalId) {
      var allGoals = await window.LifeGameCore.getGoals();
      var goal = allGoals.find(function(g) { return g.id === goalId; });
      if (!goal) throw new Error('未找到指定愿景目标');

      var allTasks = await window.LifeGameCore.getTasks();
      var relatedTasks = allTasks.filter(function(t) { return t.linkedGoalId === goalId; });

      var milestones = goal.milestones || [];
      var doneMs = milestones.filter(function(m) { return m.done; }).length;
      var today = getTodayStr();

      var systemPrompt =
        '你是一位经验丰富的行动力教练。请根据长期愿景的目标日期、里程碑完成度和关联任务的未完成情况，评估计划是否落后或负荷过载，并给出客观、温和的调整方案。\n' +
        '严禁羞辱或指责用户；若进度滞后，主动建议削减次要负荷、合理顺延截止期；若提前完成，建议巩固或适度休息。\n' +
        '输出纯 JSON。';

      var userPrompt =
        '愿景：' + goal.title + '\n' +
        '目标完成日：' + (goal.targetDate || '未定') + '（今天：' + today + '）\n' +
        '里程碑达成：' + doneMs + ' / ' + milestones.length + '\n' +
        '关联现实任务：\n' +
        JSON.stringify(relatedTasks.map(function(t) {
          return { id: t.id, title: t.title, status: t.status, due: t.dueDate };
        })) + '\n\n' +
        '请以 JSON 返回：\n' +
        '{\n' +
        '  "status": "on_track | behind | ahead",\n' +
        '  "diagnosis": "客观现状诊断",\n' +
        '  "adjustmentAdvice": "具体调整建议",\n' +
        '  "proposals": [\n' +
        '    {\n' +
        '      "taskId": "任务ID",\n' +
        '      "action": "postpone | keep | prune",\n' +
        '      "originalDue": "原日期",\n' +
        '      "suggestedDue": "建议顺延后日期",\n' +
        '      "reason": "原因说明"\n' +
        '    }\n' +
        '  ]\n' +
        '}';

      var raw = await this.invokeAI([{ role: 'user', content: userPrompt }], {
        system: systemPrompt,
        responseFormat: 'json_object',
        temperature: 0.4
      });

      var parsed = extractJson(raw);
      if (!parsed) throw new Error('动态评估失败，请稍候重试');

      return {
        goalId: goalId,
        goalTitle: goal.title,
        evaluatedAt: Date.now(),
        status: parsed.status || 'behind',
        diagnosis: String(parsed.diagnosis || '当前进度与计划节奏存在一定偏差。').slice(0, 200),
        adjustmentAdvice: String(parsed.adjustmentAdvice || '建议将尚未完成的任务适度后延，减轻每日时间压力。').slice(0, 200),
        proposals: Array.isArray(parsed.proposals) ? parsed.proposals : []
      };
    },

    // 4.4 每周成长复盘生成 (Weekly Review)
    async generateWeeklyReview() {
      var tasksHistory = await window.LifeGameCore.getTasksHistory();
      var studySummary = await getStudyRoomSummary();
      var habits = await window.LifeGameCore.getHabits();
      var lifeState = window.LifeGameService ? await window.LifeGameService.getState() : { level: 1, exp: 0, title: '探索者' };
      var char = window.RoleWorldbookService ? await window.RoleWorldbookService.getActiveCharacter() : { name: '沈星回' };

      var now = Date.now();
      var sevenDaysAgo = now - 7 * 86400000;
      var recentTasks = tasksHistory.filter(function(h) { return (h.claimedAt || h.completedAt || 0) >= sevenDaysAgo; });

      var systemPrompt =
        '你是一位温柔细腻、见证玩家点滴成长的人生挚友与冒险伴侣。\n' +
        '根据用户近 7 天真实完成的任务、自习室专注数据和习惯打卡，撰写一份充满温度、客观真实且不制造焦虑的「每周成长复盘报告」。\n' +
        '严禁虚构未发生的事实；如果数据较少，肯定其休息和调整也是成长的一部分，并给予温柔的守候与信心。\n' +
        '以纯 JSON 格式输出。';

      var userPrompt =
        '用户现实成长数据（近 7 天）：\n' +
        '- 达成委托数量：' + recentTasks.length + ' 项（' + recentTasks.map(function(t) { return t.title; }).slice(0, 5).join('、') + '）\n' +
        '- 自习室情况：' + studySummary.summaryText + '\n' +
        '- 每日习惯连胜总计：' + habits.reduce(function(acc, h) { return acc + (h.streak || 0); }, 0) + ' 天\n' +
        '- 玩家当前等级：LV.' + lifeState.level + '（' + (lifeState.title || '') + '）\n' +
        '- 陪伴角色：' + (char.name || '伴侣') + '\n\n' +
        '请严格以如下 JSON 格式返回：\n' +
        '{\n' +
        '  "headline": "本周成长主标题（如：在静默沉潜中蓄力生长的一周）",\n' +
        '  "overview": "整体成长概览总结（150字内）",\n' +
        '  "highlights": ["高光亮点1", "高光亮点2"],\n' +
        '  "studyAnalysis": "对专注与自律节奏的温和洞察",\n' +
        '  "nextWeekSuggestion": "下周推荐关注的步伐与节奏（不施压）",\n' +
        '  "companionLetter": "伴侣手写信文案（细腻真挚）"\n' +
        '}';

      var raw = await this.invokeAI([{ role: 'user', content: userPrompt }], {
        system: systemPrompt,
        responseFormat: 'json_object',
        temperature: 0.6
      });

      var parsed = extractJson(raw);
      if (!parsed) throw new Error('成长复盘生成失败，请重试');

      var review = {
        id: uid('review'),
        weekPeriod: (function() {
          var d1 = new Date(sevenDaysAgo);
          var d2 = new Date(now);
          return (d1.getMonth() + 1) + '月' + d1.getDate() + '日 ~ ' + (d2.getMonth() + 1) + '月' + d2.getDate() + '日';
        })(),
        createdAt: now,
        headline: String(parsed.headline || '稳步前行的现实成长周记').slice(0, 40),
        overview: String(parsed.overview || '每一天的微小专注，都在悄悄塑造更强大的内心。').slice(0, 300),
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights.map(function(h) { return String(h).slice(0, 60); }) : ['坚持日常自律节律'],
        studyAnalysis: String(parsed.studyAnalysis || '专注力保持稳定，学习与生活兼顾。').slice(0, 200),
        nextWeekSuggestion: String(parsed.nextWeekSuggestion || '保持当前舒适的节奏，适当留出充电休整空间。').slice(0, 200),
        companionLetter: String(parsed.companionLetter || ('「一路走来，看着你越来越沉稳坚定的模样，我由衷为你感到骄傲。下周，我们也一起并肩同行吧。」—— ' + (char.name || 'Ta'))).slice(0, 400)
      };

      return review;
    }
  };

  // ===== 5. 人生规划业务与持久化中枢 (LifeGameAI) =====
  var LifeGameAI = {
    Engine: LifeGameAIEngine,

    // 5.1 获取所有草案
    async getDrafts() {
      return await loadStorage(STORAGE_AI_DRAFTS, []);
    },

    async saveDraft(draft) {
      var drafts = await this.getDrafts();
      var existingIdx = drafts.findIndex(function(d) { return d.id === draft.id; });
      if (existingIdx !== -1) {
        drafts[existingIdx] = draft;
      } else {
        drafts.unshift(draft);
      }
      if (drafts.length > 20) drafts = drafts.slice(0, 20);
      await saveStorage(STORAGE_AI_DRAFTS, drafts);
      return draft;
    },

    async deleteDraft(draftId) {
      var drafts = await this.getDrafts();
      drafts = drafts.filter(function(d) { return d.id !== draftId; });
      await saveStorage(STORAGE_AI_DRAFTS, drafts);
    },

    // 5.2 核心安全机制：草案确认与正式创建 (Apply Draft to Formal Goals & Tasks)
    // 只有经过用户在界面明确确认后，才将草案转换为正式现实任务和愿景！
    async applyDraft(draftId, editedStages, options) {
      var drafts = await this.getDrafts();
      var draft = drafts.find(function(d) { return d.id === draftId; });
      if (!draft) throw new Error('草案不存在或已被删除');
      if (draft.applied) throw new Error('该草案已确认并生成过冒险计划，不可重复导入');

      var stagesToUse = editedStages || draft.stages || [];
      if (!stagesToUse.length) throw new Error('草案中没有可执行的章节');

      // 1. 创建正式长期愿景 (Goal)
      var newGoalId = uid('goal_ai');
      var allMilestones = [];

      stagesToUse.forEach(function(stg) {
        (stg.milestones || []).forEach(function(m) {
          allMilestones.push({
            id: uid('ms'),
            title: m.title,
            desc: m.desc || '',
            expReward: m.expReward || 80,
            done: false,
            claimed: false
          });
        });
      });

      if (allMilestones.length === 0) {
        allMilestones.push({
          id: uid('ms'),
          title: '达成 ' + draft.goalTitle + ' 阶段突破',
          desc: '完成初始阶段目标',
          expReward: 80,
          done: false,
          claimed: false
        });
      }

      var newGoal = {
        id: newGoalId,
        title: draft.goalTitle,
        desc: draft.goalDesc || (draft.summary ? draft.summary.slice(0, 100) : 'AI 智能拆解建立的长期主线愿景'),
        targetDate: draft.targetDate || '',
        status: 'active',
        milestones: allMilestones,
        createdAt: Date.now(),
        sourceAiDraftId: draft.id
      };

      // 2. 创建关联正式现实任务 (Tasks)
      var newTasks = [];
      var expMap = { easy: 25, mid: 45, hard: 80 };
      var coinMap = { easy: 10, mid: 20, hard: 40 };
      var statMap = {
        study: { INT: 2, WIL: 1 },
        daily: { PER: 1, WIL: 1 },
        main: { WIL: 2, CHA: 1 },
        side: { INS: 2, PHY: 1 }
      };

      stagesToUse.forEach(function(stg) {
        (stg.tasks || []).forEach(function(t) {
          if (t.selected !== false) { // 仅导入用户选中的任务
            var diff = t.difficulty || 'mid';
            var cat = t.category || 'main';
            var targetMins = cat === 'study' ? (t.targetMinutes || t.estimatedMinutes || 30) : 0;

            newTasks.push({
              id: uid('task_ai'),
              title: t.title,
              desc: t.desc || '',
              category: cat,
              difficulty: diff,
              targetMinutes: targetMins,
              accumulatedMinutes: 0,
              rewardExp: expMap[diff] || 45,
              rewardCoins: coinMap[diff] || 20,
              statBonus: statMap[cat] || { WIL: 1 },
              status: 'pending',
              dueDate: t.dueDate || '',
              linkedSource: t.linkStudyRoom ? 'studyRoom' : 'user',
              linkedGoalId: newGoalId,
              createdAt: Date.now()
            });
          }
        });
      });

      // 3. 事务性存入 LifeGameCore
      var existingGoals = await window.LifeGameCore.getGoals();
      existingGoals.unshift(newGoal);
      await window.LifeGameCore.saveGoals(existingGoals);

      var existingTasks = await window.LifeGameCore.getTasks();
      newTasks.forEach(function(t) { existingTasks.unshift(t); });
      await window.LifeGameCore.saveTasks(existingTasks);

      // 4. 记录计划版本
      draft.applied = true;
      draft.appliedAt = Date.now();
      draft.createdGoalId = newGoalId;
      await this.saveDraft(draft);

      var versions = await loadStorage(STORAGE_AI_PLANS, []);
      versions.unshift({
        versionId: uid('ver'),
        goalId: newGoalId,
        goalTitle: draft.goalTitle,
        tasksCreatedCount: newTasks.length,
        milestonesCreatedCount: allMilestones.length,
        appliedAt: Date.now()
      });
      if (versions.length > 30) versions = versions.slice(0, 30);
      await saveStorage(STORAGE_AI_PLANS, versions);

      // 5. 跨软件联动同步 (自习室待办与日历日程)
      if (window.LifeGameIntegrations) {
        if (!options || options.syncStudyTodos !== false) {
          for (var si = 0; si < newTasks.length; si++) {
            var nTask = newTasks[si];
            if (nTask.category === 'study' || nTask.linkedSource === 'studyRoom') {
              try {
                await window.LifeGameIntegrations.linkTaskToStudyTodo(nTask);
              } catch (_) {}
            }
          }
        }
      }

      return {
        success: true,
        goal: newGoal,
        tasksCount: newTasks.length,
        milestonesCount: allMilestones.length
      };
    },

    // 5.3 历史复盘存取
    async getWeeklyReviews() {
      return await loadStorage(STORAGE_AI_REVIEWS, []);
    },

    async saveWeeklyReview(review) {
      var reviews = await this.getWeeklyReviews();
      reviews.unshift(review);
      if (reviews.length > 20) reviews = reviews.slice(0, 20);
      await saveStorage(STORAGE_AI_REVIEWS, reviews);
      return review;
    },

    // 5.4 计划调整确认应用
    async applyPlanAdjustment(goalId, proposals) {
      if (!proposals || !proposals.length) return { success: false, msg: '没有需要应用的调整' };
      var allTasks = await window.LifeGameCore.getTasks();
      var changedCount = 0;

      proposals.forEach(function(prop) {
        var t = allTasks.find(function(item) { return item.id === prop.taskId; });
        if (t && t.status === 'pending') { // 绝对不碰 completed 或 claimed 的任务！
          if (prop.action === 'postpone' && prop.suggestedDue) {
            t.dueDate = prop.suggestedDue;
            changedCount++;
          } else if (prop.action === 'prune') {
            allTasks = allTasks.filter(function(item) { return item.id !== prop.taskId; });
            changedCount++;
          }
        }
      });

      if (changedCount > 0) {
        await window.LifeGameCore.saveTasks(allTasks);
      }

      return { success: true, changedCount: changedCount };
    }
  };

  // ===== 6. 界面与交互弹窗控制器 (LifeGameAIUI) =====
  var LifeGameAIUI = {
    // 6.1 目标规划向导弹窗 (Wizard)
    showDecomposeWizardModal() {
      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      var pace = 'balanced'; // easy | balanced | hard

      overlay.innerHTML =
        '<div class="lg-modal-card" style="max-height:88vh;display:flex;flex-direction:column;">' +
          '<div class="lg-modal-title">' +
            '<i class="fa-solid fa-wand-magic-sparkles"></i>' +
            '<span>AI 帮我拆解目标</span>' +
          '</div>' +

          '<div style="flex:1;overflow-y:auto;padding-right:2px;display:flex;flex-direction:column;gap:12px;">' +
            '<div class="lg-form-group">' +
              '<label class="lg-form-label">长期目标名称 *</label>' +
              '<input type="text" class="lg-input" id="wizard-goal-title" placeholder="如：系统攻坚雅思写作 7 分、考研英语上岸、跑步半马">' +
            '</div>' +

            '<div class="lg-form-group">' +
              '<label class="lg-form-label">目标背景与具体设想</label>' +
              '<textarea class="lg-textarea" id="wizard-goal-desc" rows="2" placeholder="简述现状、动机或希望达成的理想状态..."></textarea>' +
            '</div>' +

            '<div style="display:flex;gap:8px;">' +
              '<div class="lg-form-group" style="flex:1;">' +
                '<label class="lg-form-label">期望截止日期</label>' +
                '<input type="date" class="lg-input" id="wizard-goal-date">' +
              '</div>' +
              '<div class="lg-form-group" style="flex:1;">' +
                '<label class="lg-form-label">当前个人基础</label>' +
                '<select class="lg-select" id="wizard-goal-level">' +
                  '<option value="零基础小白">零基础小白</option>' +
                  '<option value="有一定基础" selected>有一定基础</option>' +
                  '<option value="进阶瓶颈期">进阶瓶颈期</option>' +
                '</select>' +
              '</div>' +
            '</div>' +

            '<div style="display:flex;gap:8px;">' +
              '<div class="lg-form-group" style="flex:1;">' +
                '<label class="lg-form-label">每天可投入 (小时)</label>' +
                '<select class="lg-select" id="wizard-goal-hours">' +
                  '<option value="0.5">0.5 小时 (轻量)</option>' +
                  '<option value="1">1 小时 (适中)</option>' +
                  '<option value="1.5" selected>1.5 小时 (标准)</option>' +
                  '<option value="2.5">2.5 小时 (充裕)</option>' +
                  '<option value="4">4+ 小时 (全职/冲刺)</option>' +
                '</select>' +
              '</div>' +
              '<div class="lg-form-group" style="flex:1;">' +
                '<label class="lg-form-label">每周可投入天数</label>' +
                '<select class="lg-select" id="wizard-goal-days">' +
                  '<option value="4">4 天 (留足喘息)</option>' +
                  '<option value="5" selected>5 天 (工作日节奏)</option>' +
                  '<option value="6">6 天 (高频冲刺)</option>' +
                  '<option value="7">7 天 (每日坚持)</option>' +
                '</select>' +
              '</div>' +
            '</div>' +

            '<div class="lg-form-group">' +
              '<label class="lg-form-label">规划节奏与强度</label>' +
              '<div class="lg-pill-group" id="wizard-pace-group">' +
                '<div class="lg-choice-pill" data-pace="easy"><i class="fa-solid fa-feather"></i> 轻松成长 (充裕缓冲)</div>' +
                '<div class="lg-choice-pill selected" data-pace="balanced"><i class="fa-solid fa-scale-balanced"></i> 均衡推进 (劳逸结合)</div>' +
                '<div class="lg-choice-pill" data-pace="hard"><i class="fa-solid fa-bolt"></i> 集中攻坚 (快速突围)</div>' +
              '</div>' +
            '</div>' +

            '<div class="lg-form-group">' +
              '<label class="lg-form-label">已知限制与特殊考量 (选填)</label>' +
              '<input type="text" class="lg-input" id="wizard-goal-constraints" placeholder="如：周末经常加班、只能晚间学习等">' +
            '</div>' +
          '</div>' +

          '<div class="lg-modal-footer" style="margin-top:12px;">' +
            '<button type="button" class="lg-btn-secondary" id="wizard-btn-cancel">取消</button>' +
            '<button type="button" class="lg-btn-primary" id="wizard-btn-submit"><i class="fa-solid fa-wand-magic-sparkles"></i> 开始 AI 拆解</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      // 默认日期设定为 30 天后
      var defDate = new Date();
      defDate.setDate(defDate.getDate() + 30);
      var dateInput = overlay.querySelector('#wizard-goal-date');
      if (dateInput) dateInput.value = defDate.toISOString().slice(0, 10);

      // 绑定节奏选择
      overlay.querySelectorAll('#wizard-pace-group .lg-choice-pill').forEach(function(pill) {
        pill.onclick = function() {
          overlay.querySelectorAll('#wizard-pace-group .lg-choice-pill').forEach(function(p) { p.classList.remove('selected'); });
          pill.classList.add('selected');
          pace = pill.getAttribute('data-pace');
        };
      });

      overlay.querySelector('#wizard-btn-cancel').onclick = function() {
        overlay.remove();
      };

      overlay.querySelector('#wizard-btn-submit').onclick = async function() {
        var title = overlay.querySelector('#wizard-goal-title').value.trim();
        if (!title) {
          window.toast && window.toast('请输入长期目标名称');
          return;
        }

        var params = {
          title: title,
          desc: overlay.querySelector('#wizard-goal-desc').value.trim(),
          targetDate: overlay.querySelector('#wizard-goal-date').value,
          currentLevel: overlay.querySelector('#wizard-goal-level').value,
          dailyHours: overlay.querySelector('#wizard-goal-hours').value,
          weeklyDays: overlay.querySelector('#wizard-goal-days').value,
          pace: pace,
          constraints: overlay.querySelector('#wizard-goal-constraints').value.trim()
        };

        // 切换为加载中状态
        var card = overlay.querySelector('.lg-modal-card');
        card.innerHTML =
          '<div class="lg-loading-state">' +
            '<div class="lg-loading-spinner"><i class="fa-solid fa-wand-magic-sparkles"></i></div>' +
            '<div style="font-size:14px;font-weight:700;color:var(--c-text);margin-top:6px;">AI 正在全盘规划拆解中...</div>' +
            '<div style="font-size:11px;color:var(--c-sub);line-height:1.6;">分析目标边界 · 评估时间负荷 · 生成阶段章节与现实委托</div>' +
          '</div>';

        try {
          var draft = await LifeGameAI.Engine.decomposeGoal(params);
          await LifeGameAI.saveDraft(draft);
          overlay.remove();
          LifeGameAIUI.showDraftPreviewModal(draft.id);
        } catch (err) {
          console.error('[LifeGameAI] Decompose error:', err);
          card.innerHTML =
            '<div style="padding:24px 16px;text-align:center;">' +
              '<i class="fa-solid fa-triangle-exclamation" style="font-size:28px;color:var(--c-sub);margin-bottom:10px;"></i>' +
              '<div style="font-size:14px;font-weight:700;color:var(--c-text);">拆解未能完成</div>' +
              '<div style="font-size:11px;color:var(--c-sub);margin:8px 0 16px;">' + escapeHtml(err.message || '网络或模型响应异常，请检查设置中的主 API 配置') + '</div>' +
              '<button type="button" class="lg-btn-primary" id="err-retry-btn">返回重试</button>' +
            '</div>';
          card.querySelector('#err-retry-btn').onclick = function() {
            overlay.remove();
            LifeGameAIUI.showDecomposeWizardModal();
          };
        }
      };
    },

    // 6.2 草案预览与确认弹窗 (Draft Preview Modal)
    // 用户可编辑、删除未想要的委托，确认后才创建正式任务！
    async showDraftPreviewModal(draftId) {
      var drafts = await LifeGameAI.getDrafts();
      var draft = drafts.find(function(d) { return d.id === draftId; });
      if (!draft) return;

      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      function renderContent() {
        var html =
          '<div class="lg-modal-card" style="max-height:90vh;display:flex;flex-direction:column;width:95%;max-width:440px;">' +
            '<div class="lg-modal-title" style="justify-content:space-between;">' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<i class="fa-solid fa-scroll"></i>' +
                '<span>冒险计划草案预览</span>' +
              '</div>' +
              '<span class="lg-task-tag">草案未生效</span>' +
            '</div>' +

            '<div style="flex:1;overflow-y:auto;padding-right:2px;display:flex;flex-direction:column;gap:12px;">' +
              // 目标概览
              '<div style="background:var(--c-surface-2);padding:10px 12px;border-radius:var(--r-sm);border:1px solid var(--c-border);">' +
                '<div style="font-size:13px;font-weight:700;color:var(--c-text);">' + escapeHtml(draft.goalTitle) + '</div>' +
                '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">' + escapeHtml(draft.summary) + '</div>' +
              '</div>' +

              // 可行性评估
              (draft.feasibility ?
                '<div class="lg-feasibility-box">' +
                  '<div class="lg-feasibility-title"><i class="fa-solid fa-shield-halved"></i> 可行性与负荷评估</div>' +
                  '<div>' + escapeHtml(draft.feasibility.assessment) + '</div>' +
                  (draft.feasibility.restBufferNote ? '<div style="color:var(--c-sub);font-size:10px;"><i class="fa-solid fa-mug-hot"></i> ' + escapeHtml(draft.feasibility.restBufferNote) + '</div>' : '') +
                  (draft.feasibility.risks && draft.feasibility.risks.length ?
                    '<div class="lg-feasibility-warning"><i class="fa-solid fa-circle-exclamation"></i> <strong>提示：</strong>' + draft.feasibility.risks.map(escapeHtml).join('；') + '</div>' : '') +
                '</div>' : '') +

              // 阶段与任务列表
              '<div style="font-size:12px;font-weight:700;color:var(--c-text);display:flex;justify-content:space-between;align-items:center;">' +
                '<span>阶段章节与任务分解清单</span>' +
                '<span style="font-size:10px;font-weight:normal;color:var(--c-sub);">可点击垃圾桶移除不适用的任务</span>' +
              '</div>';

        draft.stages.forEach(function(stg, sIdx) {
          html +=
            '<div class="lg-draft-stage-card">' +
              '<div class="lg-draft-stage-header">' +
                '<div class="lg-draft-stage-name"><i class="fa-solid fa-flag"></i> ' + escapeHtml(stg.stageName) + '</div>' +
                '<span style="font-size:10px;color:var(--c-sub);">' + (stg.tasks ? stg.tasks.filter(function(t){return t.selected !== false;}).length : 0) + ' 项委托</span>' +
              '</div>';

          // 里程碑
          (stg.milestones || []).forEach(function(m) {
            html +=
              '<div style="font-size:11px;color:var(--c-text);display:flex;align-items:center;gap:6px;background:var(--c-surface-2);padding:4px 8px;border-radius:4px;">' +
                '<i class="fa-solid fa-trophy" style="font-size:10px;color:var(--c-sub);"></i>' +
                '<span style="flex:1;font-weight:600;">' + escapeHtml(m.title) + '</span>' +
                '<span style="font-size:10px;color:var(--c-sub);">+' + m.expReward + ' EXP</span>' +
              '</div>';
          });

          // 任务清单
          (stg.tasks || []).forEach(function(t, tIdx) {
            var isSel = t.selected !== false;
            html +=
              '<div class="lg-draft-task-item ' + (isSel ? '' : 'style="opacity:0.4;"') + '">' +
                '<div class="lg-draft-task-top">' +
                  '<div class="lg-draft-task-title" style="' + (isSel ? '' : 'text-decoration:line-through;color:var(--c-sub);') + '">' +
                    escapeHtml(t.title) +
                  '</div>' +
                  '<div class="lg-draft-task-actions">' +
                    '<button type="button" class="lg-btn-action-text" data-action="toggle-task" data-sidx="' + sIdx + '" data-tidx="' + tIdx + '">' +
                      (isSel ? '<i class="fa-solid fa-trash-can"></i>' : '<i class="fa-solid fa-arrow-rotate-left"></i>') +
                    '</button>' +
                  '</div>' +
                '</div>' +
                (t.desc ? '<div style="font-size:10px;color:var(--c-sub);">' + escapeHtml(t.desc) + '</div>' : '') +
                '<div class="lg-draft-task-meta">' +
                  '<span><i class="fa-regular fa-clock"></i> 约 ' + t.estimatedMinutes + 'm</span>' +
                  '<span>截止 ' + (t.dueDate || '无') + '</span>' +
                  (t.linkStudyRoom ? '<span style="font-weight:600;"><i class="fa-solid fa-hourglass-half"></i> 自习联动</span>' : '') +
                '</div>' +
              '</div>';
          });

          html += '</div>';
        });

        html +=
            '</div>' +

            // 跨软件联动选项
            '<div style="background:var(--c-surface-2);padding:10px 12px;border-radius:var(--r-sm);border:1px solid var(--c-border);display:flex;flex-direction:column;gap:6px;">' +
              '<div style="font-size:11px;font-weight:700;color:var(--c-text);"><i class="fa-solid fa-arrows-split-up-and-left"></i> 跨软件安全同步选项</div>' +
              '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--c-text);cursor:pointer;">' +
                '<input type="checkbox" id="preview-sync-study" checked> ' +
                '<span>将学习类委托同步至自习室待办清单</span>' +
              '</label>' +
              '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--c-text);cursor:pointer;">' +
                '<input type="checkbox" id="preview-sync-calendar" checked> ' +
                '<span>将已排期委托同步至时光日历日程</span>' +
              '</label>' +
            '</div>' +

            '<div class="lg-modal-footer" style="margin-top:12px;">' +
              '<button type="button" class="lg-btn-secondary" id="preview-btn-discard">舍弃草案</button>' +
              '<button type="button" class="lg-btn-primary" id="preview-btn-confirm"><i class="fa-solid fa-check"></i> 确认并创建我的冒险计划</button>' +
            '</div>' +
          '</div>';

        overlay.innerHTML = html;

        // 绑定任务移除/恢复
        overlay.querySelectorAll('[data-action="toggle-task"]').forEach(function(btn) {
          btn.onclick = function() {
            var s = parseInt(btn.getAttribute('data-sidx'), 10);
            var t = parseInt(btn.getAttribute('data-tidx'), 10);
            if (draft.stages[s] && draft.stages[s].tasks[t]) {
              draft.stages[s].tasks[t].selected = !Boolean(draft.stages[s].tasks[t].selected !== false);
              LifeGameAI.saveDraft(draft);
              renderContent();
            }
          };
        });

        // 舍弃草案
        var discardBtn = overlay.querySelector('#preview-btn-discard');
        if (discardBtn) {
          discardBtn.onclick = function() {
            if (confirm('确定要放弃这份未确认的 AI 计划草案吗？')) {
              LifeGameAI.deleteDraft(draft.id);
              overlay.remove();
              window.toast && window.toast('草案已舍弃');
            }
          };
        }

        // 确认创建正式任务
        var confirmBtn = overlay.querySelector('#preview-btn-confirm');
        if (confirmBtn) {
          confirmBtn.onclick = async function() {
            var syncStudyCb = overlay.querySelector('#preview-sync-study');
            var syncCalCb = overlay.querySelector('#preview-sync-calendar');
            var opts = {
              syncStudyTodos: syncStudyCb ? syncStudyCb.checked : true,
              syncCalendar: syncCalCb ? syncCalCb.checked : true
            };

            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 创建正式冒险中...';
            try {
              var res = await LifeGameAI.applyDraft(draft.id, draft.stages, opts);
              window.toast && window.toast('🎉 冒险计划创建成功！生成了 ' + res.tasksCount + ' 项现实委托与 ' + res.milestonesCount + ' 个里程碑！');
              overlay.remove();
              if (window.LifeGameApp) {
                window.LifeGameApp.render();
              }
            } catch (err) {
              confirmBtn.disabled = false;
              confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> 确认并创建我的冒险计划';
              window.toast && window.toast(err.message || '计划创建失败，请重试');
            }
          };
        }
      }

      document.body.appendChild(overlay);
      renderContent();
    },

    // 6.3 「今天不知道做什么」今日推荐弹窗 (Today Recommendation Modal)
    showTodayRecommendModal() {
      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      var availableMins = 60;
      var energy = 'normal';
      var pref = 'balanced';

      overlay.innerHTML =
        '<div class="lg-modal-card">' +
          '<div class="lg-modal-title">' +
            '<i class="fa-solid fa-compass"></i>' +
            '<span>今天不知道做什么？</span>' +
          '</div>' +

          '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<div class="lg-form-group">' +
              '<label class="lg-form-label">今天可用时间</label>' +
              '<div class="lg-pill-group" id="recom-time-pills">' +
                '<div class="lg-choice-pill" data-val="30">30 分钟 (碎片突围)</div>' +
                '<div class="lg-choice-pill selected" data-val="60">60 分钟 (标准高效)</div>' +
                '<div class="lg-choice-pill" data-val="120">2 小时 (深度攻坚)</div>' +
              '</div>' +
            '</div>' +

            '<div class="lg-form-group">' +
              '<label class="lg-form-label">当前精力状态</label>' +
              '<div class="lg-pill-group" id="recom-energy-pills">' +
                '<div class="lg-choice-pill" data-val="high"><i class="fa-solid fa-bolt"></i> 充沛饱满</div>' +
                '<div class="lg-choice-pill selected" data-val="normal"><i class="fa-solid fa-battery-half"></i> 状态平稳</div>' +
                '<div class="lg-choice-pill" data-val="low"><i class="fa-solid fa-bed"></i> 略有疲惫</div>' +
              '</div>' +
            '</div>' +

            '<div class="lg-form-group">' +
              '<label class="lg-form-label">今日重心期望</label>' +
              '<select class="lg-select" id="recom-pref-select">' +
                '<option value="balanced" selected>均衡推进主要目标</option>' +
                '<option value="urgent">优先解决快到期任务</option>' +
                '<option value="study">自习室深度沉浸专注</option>' +
                '<option value="relax">轻松习惯打卡与减负</option>' +
              '</select>' +
            '</div>' +
          '</div>' +

          '<div class="lg-modal-footer" style="margin-top:14px;">' +
            '<button type="button" class="lg-btn-secondary" id="recom-btn-cancel">取消</button>' +
            '<button type="button" class="lg-btn-primary" id="recom-btn-start"><i class="fa-solid fa-wand-magic-sparkles"></i> 帮我决策今日行动</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      // 绑定 pill 点击
      overlay.querySelectorAll('#recom-time-pills .lg-choice-pill').forEach(function(p) {
        p.onclick = function() {
          overlay.querySelectorAll('#recom-time-pills .lg-choice-pill').forEach(function(i) { i.classList.remove('selected'); });
          p.classList.add('selected');
          availableMins = parseInt(p.getAttribute('data-val'), 10);
        };
      });

      overlay.querySelectorAll('#recom-energy-pills .lg-choice-pill').forEach(function(p) {
        p.onclick = function() {
          overlay.querySelectorAll('#recom-energy-pills .lg-choice-pill').forEach(function(i) { i.classList.remove('selected'); });
          p.classList.add('selected');
          energy = p.getAttribute('data-val');
        };
      });

      overlay.querySelector('#recom-btn-cancel').onclick = function() {
        overlay.remove();
      };

      overlay.querySelector('#recom-btn-start').onclick = async function() {
        var card = overlay.querySelector('.lg-modal-card');
        pref = overlay.querySelector('#recom-pref-select').value;

        card.innerHTML =
          '<div class="lg-loading-state">' +
            '<div class="lg-loading-spinner"><i class="fa-solid fa-compass"></i></div>' +
            '<div style="font-size:14px;font-weight:700;color:var(--c-text);margin-top:6px;">正在评估今日最优行动...</div>' +
            '<div style="font-size:11px;color:var(--c-sub);">分析现有未决委托 · 衡量精力与时长 · 匹配自习与目标进展</div>' +
          '</div>';

        try {
          var res = await LifeGameAI.Engine.recommendTodayActions({
            availableMinutes: availableMins,
            energy: energy,
            preference: pref
          });

          // 呈现推荐结果
          card.innerHTML =
            '<div class="lg-modal-title">' +
              '<i class="fa-solid fa-compass"></i>' +
              '<span>今日冒险行动指南</span>' +
            '</div>' +

            '<div style="display:flex;flex-direction:column;gap:12px;margin:10px 0;">' +
              // 核心任务
              '<div class="lg-recommend-core">' +
                '<div class="lg-task-tag" style="align-self:flex-start;">今日核心焦点</div>' +
                '<div class="lg-recommend-core-title"><i class="fa-solid fa-star"></i> ' + escapeHtml(res.coreTask.title) + '</div>' +
                '<div class="lg-recommend-core-desc">' + escapeHtml(res.coreTask.reason) + '</div>' +
                '<div style="font-size:10px;color:var(--c-sub);"><i class="fa-regular fa-clock"></i> 建议投入约 ' + res.coreTask.estimatedMinutes + ' 分钟</div>' +
              '</div>' +

              // 次要推进
              (res.secondaryTasks && res.secondaryTasks.length ?
                '<div>' +
                  '<div style="font-size:11px;font-weight:700;color:var(--c-text);margin-bottom:6px;">协同推进清单：</div>' +
                  res.secondaryTasks.map(function(s) {
                    return (
                      '<div style="background:var(--c-surface-2);border:1px solid var(--c-border);padding:8px 10px;border-radius:var(--r-sm);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">' +
                        '<span style="font-size:11px;font-weight:600;color:var(--c-text);">' + escapeHtml(s.title) + '</span>' +
                        '<span style="font-size:10px;color:var(--c-sub);">' + s.estimatedMinutes + 'm</span>' +
                      '</div>'
                    );
                  }).join('') +
                '</div>' : '') +

              // 间歇安排与伴侣叮嘱
              '<div style="background:var(--c-surface-2);border:1px solid var(--c-border);border-radius:var(--r-sm);padding:10px;">' +
                '<div style="font-size:11px;color:var(--c-text);"><i class="fa-solid fa-mug-saucer"></i> ' + escapeHtml(res.restAdvice) + '</div>' +
                '<div class="lg-recommend-quote">' + escapeHtml(res.companionQuote) + '</div>' +
              '</div>' +
            '</div>' +

            '<div class="lg-modal-footer">' +
              '<button type="button" class="lg-btn-primary" id="recom-confirm-btn">知晓并开始行动</button>' +
            '</div>';

          card.querySelector('#recom-confirm-btn').onclick = function() {
            overlay.remove();
          };
        } catch (err) {
          console.error('[LifeGameAI] Today recommendation error:', err);
          card.innerHTML =
            '<div style="padding:20px;text-align:center;">' +
              '<div style="font-size:13px;font-weight:700;color:var(--c-text);">推荐生成遇阻</div>' +
              '<div style="font-size:11px;color:var(--c-sub);margin:8px 0 16px;">' + escapeHtml(err.message) + '</div>' +
              '<button type="button" class="lg-btn-secondary" id="recom-close-btn">关闭</button>' +
            '</div>';
          card.querySelector('#recom-close-btn').onclick = function() { overlay.remove(); };
        }
      };
    },

    // 6.4 动态计划调整弹窗 (Dynamic Plan Adjustment Modal)
    async showPlanAdjustModal(goalId) {
      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      var card = document.createElement('div');
      card.className = 'lg-modal-card';
      card.innerHTML =
        '<div class="lg-loading-state">' +
          '<div class="lg-loading-spinner"><i class="fa-solid fa-scale-balanced"></i></div>' +
          '<div style="font-size:14px;font-weight:700;color:var(--c-text);margin-top:6px;">正在评估愿景计划与进度...</div>' +
          '<div style="font-size:11px;color:var(--c-sub);">检索里程碑达成率 · 核验过期任务 · 生成顺延与减负方案</div>' +
        '</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      try {
        var adj = await LifeGameAI.Engine.evaluateAndAdjustPlan(goalId);

        card.innerHTML =
          '<div class="lg-modal-title">' +
            '<i class="fa-solid fa-sliders"></i>' +
            '<span>AI 动态计划调整</span>' +
          '</div>' +

          '<div style="display:flex;flex-direction:column;gap:10px;margin:10px 0;">' +
            '<div style="background:var(--c-surface-2);padding:10px 12px;border-radius:var(--r-sm);border:1px solid var(--c-border);">' +
              '<div style="font-size:12px;font-weight:700;color:var(--c-text);">【' + escapeHtml(adj.goalTitle) + '】执行诊断</div>' +
              '<div style="font-size:11px;color:var(--c-sub);margin-top:3px;">' + escapeHtml(adj.diagnosis) + '</div>' +
              '<div style="font-size:11px;color:var(--c-text);margin-top:6px;font-weight:600;"><i class="fa-solid fa-lightbulb"></i> ' + escapeHtml(adj.adjustmentAdvice) + '</div>' +
            '</div>' +

            '<div style="font-size:12px;font-weight:700;color:var(--c-text);"><i class="fa-solid fa-code-compare"></i> 建议调整明细 (Diff)</div>' +
            '<div class="lg-diff-card">' +
              (adj.proposals && adj.proposals.length ?
                adj.proposals.map(function(p) {
                  return (
                    '<div class="lg-diff-item">' +
                      '<div>' +
                        '<div style="font-weight:600;color:var(--c-text);">' + (p.action === 'postpone' ? '顺延至 ' + p.suggestedDue : (p.action === 'prune' ? '建议剔除/精简' : '保持不变')) + '</div>' +
                        '<div style="color:var(--c-sub);font-size:10px;">' + escapeHtml(p.reason || '优化每日负荷') + '</div>' +
                      '</div>' +
                      '<span class="lg-diff-tag ' + (p.action === 'postpone' ? 'adjust' : 'keep') + '">' + (p.action === 'postpone' ? '顺延' : '精简') + '</span>' +
                    '</div>'
                  );
                }).join('') :
                '<div style="text-align:center;padding:14px;color:var(--c-sub);font-size:11px;">当前计划运行平稳，暂无需大幅调整。</div>'
              ) +
            '</div>' +

            // 跨软件联动影响预览
            '<div style="background:var(--c-surface-2);padding:8px 12px;border-radius:var(--r-sm);border:1px solid var(--c-border);font-size:11px;color:var(--c-sub);">' +
              '<i class="fa-solid fa-link"></i> <strong>跨软件联动预览：</strong>日历日程将同步排期更新，自习室关联待办将同步顺延。' +
            '</div>' +
          '</div>' +

          '<div class="lg-modal-footer">' +
            '<button type="button" class="lg-btn-secondary" id="adj-btn-cancel">保留原计划</button>' +
            (adj.proposals && adj.proposals.length ?
              '<button type="button" class="lg-btn-primary" id="adj-btn-apply"><i class="fa-solid fa-check"></i> 确认应用调整</button>' :
              '<button type="button" class="lg-btn-primary" id="adj-btn-ok">好的</button>'
            ) +
          '</div>';

        overlay.querySelector('#adj-btn-cancel').onclick = function() { overlay.remove(); };
        var okBtn = overlay.querySelector('#adj-btn-ok');
        if (okBtn) okBtn.onclick = function() { overlay.remove(); };

        var applyBtn = overlay.querySelector('#adj-btn-apply');
        if (applyBtn) {
          applyBtn.onclick = async function() {
            applyBtn.disabled = true;
            var res = await LifeGameAI.applyPlanAdjustment(goalId, adj.proposals);

            // 触发跨应用自愈与同步
            if (window.LifeGameIntegrations) {
              await window.LifeGameIntegrations.reconcileLinks();
            }

            window.toast && window.toast('✨ 计划调整已安全应用，调整了 ' + res.changedCount + ' 项委托任务！');
            overlay.remove();
            if (window.LifeGameApp) window.LifeGameApp.render();
          };
        }
      } catch (err) {
        console.error('[LifeGameAI] Adjust plan error:', err);
        card.innerHTML =
          '<div style="padding:20px;text-align:center;">' +
            '<div style="font-size:13px;font-weight:700;color:var(--c-text);">评估未成功</div>' +
            '<div style="font-size:11px;color:var(--c-sub);margin:8px 0 16px;">' + escapeHtml(err.message) + '</div>' +
            '<button type="button" class="lg-btn-secondary" id="adj-err-close">关闭</button>' +
          '</div>';
        card.querySelector('#adj-err-close').onclick = function() { overlay.remove(); };
      }
    },

    // 6.5 每周成长复盘弹窗 (Weekly Review Modal)
    async showWeeklyReviewModal() {
      var overlay = document.createElement('div');
      overlay.className = 'lg-modal-overlay';

      var card = document.createElement('div');
      card.className = 'lg-modal-card';
      card.style.maxHeight = '90vh';
      card.style.overflowY = 'auto';

      card.innerHTML =
        '<div class="lg-loading-state">' +
          '<div class="lg-loading-spinner"><i class="fa-solid fa-feather"></i></div>' +
          '<div style="font-size:14px;font-weight:700;color:var(--c-text);margin-top:6px;">正在生成本周深度成长复盘...</div>' +
          '<div style="font-size:11px;color:var(--c-sub);">汇总近 7 天自习专注 · 统计任务达成与习惯连胜 · 编织伴侣温情寄语</div>' +
        '</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      try {
        var review = await LifeGameAI.Engine.generateWeeklyReview();
        await LifeGameAI.saveWeeklyReview(review);

        card.innerHTML =
          '<div class="lg-modal-title" style="justify-content:space-between;">' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<i class="fa-solid fa-feather"></i>' +
              '<span>每周成长复盘</span>' +
            '</div>' +
            '<span class="lg-task-tag">' + escapeHtml(review.weekPeriod) + '</span>' +
          '</div>' +

          '<div class="lg-review-card" style="box-shadow:none;border:none;padding:0;">' +
            '<div style="font-size:15px;font-weight:700;color:var(--c-text);margin-top:4px;">' + escapeHtml(review.headline) + '</div>' +

            '<div class="lg-review-content-box">' +
              escapeHtml(review.overview) +
            '</div>' +

            (review.highlights && review.highlights.length ?
              '<div class="lg-review-section">' +
                '<div class="lg-review-section-title"><i class="fa-solid fa-sparkles"></i> 核心成长印记</div>' +
                '<div style="display:flex;flex-direction:column;gap:4px;">' +
                  review.highlights.map(function(h) {
                    return '<div style="font-size:11px;color:var(--c-text);background:var(--c-surface-2);padding:6px 10px;border-radius:4px;"><i class="fa-solid fa-check" style="font-size:10px;margin-right:4px;"></i>' + escapeHtml(h) + '</div>';
                  }).join('') +
                '</div>' +
              '</div>' : '') +

            '<div class="lg-review-section">' +
              '<div class="lg-review-section-title"><i class="fa-solid fa-hourglass-half"></i> 专注与自律节奏</div>' +
              '<div style="font-size:11px;color:var(--c-sub);line-height:1.5;">' + escapeHtml(review.studyAnalysis) + '</div>' +
            '</div>' +

            '<div class="lg-review-section">' +
              '<div class="lg-review-section-title"><i class="fa-solid fa-compass"></i> 下周前行建议</div>' +
              '<div style="font-size:11px;color:var(--c-text);line-height:1.5;">' + escapeHtml(review.nextWeekSuggestion) + '</div>' +
            '</div>' +

            '<div style="background:var(--c-surface-2);border-left:3px solid var(--c-text);padding:12px;border-radius:4px;font-style:italic;font-size:12px;line-height:1.6;color:var(--c-text);">' +
              escapeHtml(review.companionLetter) +
            '</div>' +
          '</div>' +

          '<div class="lg-modal-footer" style="margin-top:14px;">' +
            '<button type="button" class="lg-btn-secondary" id="review-btn-close">珍藏复盘</button>' +
          '</div>';

        card.querySelector('#review-btn-close').onclick = function() { overlay.remove(); };
      } catch (err) {
        console.error('[LifeGameAI] Weekly review error:', err);
        card.innerHTML =
          '<div style="padding:20px;text-align:center;">' +
            '<div style="font-size:13px;font-weight:700;color:var(--c-text);">复盘生成遇阻</div>' +
            '<div style="font-size:11px;color:var(--c-sub);margin:8px 0 16px;">' + escapeHtml(err.message) + '</div>' +
            '<button type="button" class="lg-btn-secondary" id="review-err-close">关闭</button>' +
          '</div>';
        card.querySelector('#review-err-close').onclick = function() { overlay.remove(); };
      }
    }
  };

  // ===== 7. 挂载到全局 =====
  global.LifeGameAI = LifeGameAI;
  global.LifeGameAIUI = LifeGameAIUI;

})(typeof window !== 'undefined' ? window : this);
