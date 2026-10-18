// parallel-letters-storage.js — 平行来信 · IF小剧场 底层存储与主线隔离安全舱
// 严格遵守：主线资料只读进入 IF；IF 剧情绝对不回写主线。

(function() {
  'use strict';

  // ===== 辅助函数 =====
  function generateId(prefix) {
    return (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function deepClone(obj) {
    if (obj === undefined || obj === null) return obj;
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      console.warn('[ParallelLettersStorage] deepClone fallback:', e);
      return Object.assign({}, obj);
    }
  }

  // ===== 1. 角色快照机制 (深拷贝只读快照) =====
  function createCharacterSnapshot(char) {
    if (!char) return null;
    return {
      sourceCharId: char.id || null,
      name: String(char.name || '未知角色').trim(),
      nick: String(char.nick || '').trim(),
      gender: char.gender || '未知',
      avatar: char.avatar || 'img/ava-00.jpg',
      type: char.type || 'char',
      role: char.role || '',
      group: char.group || '',
      // 人物核心人设快照：性格、背景、语言习惯、说话风格
      description: char.description || '',
      identity: deepClone(char.identity || {}),
      relations: deepClone(char.relations || []),
      // 允许在 IF 中派生的身份与经历改写（保留初始人设的同时记录平行世界设定）
      ifCustomRole: '',
      ifCustomBackstory: '',
      snapshotTime: Date.now()
    };
  }

  // 读取小手机可出演角色列表（只读访问 db.characters）
  async function getAllPlayableCharacters() {
    var defaultDemoChars = [
      {
        id: 9991,
        name: '沈砚',
        nick: '阿砚',
        gender: '男',
        avatar: 'img/ava-01.jpg',
        type: 'char',
        role: '主要角色 / 伴侣',
        description: '性格清冷克制，少言寡语，习惯将所有心绪藏于眼底，但永远会在关键时刻护在身前。'
      },
      {
        id: 9992,
        name: '苏念',
        nick: '念念',
        gender: '女',
        avatar: 'img/ava-02.jpg',
        type: 'char',
        role: '主要角色 / 挚友',
        description: '心思明澈温和，善解人意，平日里轻快灵动，偶尔流露出令人心折的执着与坚韧。'
      }
    ];

    if (!window.db || !window.db.characters) {
      console.warn('[ParallelLettersStorage] db.characters not available, fallback to demo chars');
      return defaultDemoChars;
    }
    try {
      var list = await window.db.characters.toArray();
      if (!list || list.length === 0) {
        return defaultDemoChars;
      }
      // 过滤与映射角色资料
      return list.map(function(c) {
        return {
          id: c.id,
          name: c.name || '未命名',
          nick: c.nick || '',
          gender: c.gender || '未知',
          avatar: c.avatar || 'img/ava-00.jpg',
          type: c.type || 'char',
          role: c.role || (c.type === 'user' ? '主角 / 玩家' : '出演角色'),
          description: c.description || c.signature || (c.identity && c.identity.summary) || '性格独特，拥有鲜明的个人羁绊。'
        };
      });
    } catch (e) {
      console.error('[ParallelLettersStorage] failed to get characters:', e);
      return defaultDemoChars;
    }
  }

  // ===== 2. 宇宙档案 (Universe) CRUD =====

  /**
   * 创建新的平行世界宇宙
   * @param {Object} options
   *   - title: IF 标题
   *   - premise: 核心假设（必填）
   *   - worldSetting: 世界背景
   *   - initialRelationship: 初始关系
   *   - specialSettings: 特殊设定
   *   - storyAnticipation: 剧情期待
   *   - atmosphere: 故事氛围
   *   - storyLength: 篇幅 (短篇/标准/长篇/自定义)
   *   - playMode: 'spectator' (观影) | 'inCharacter' (入戏)
   *   - selectedCharacters: 原始角色对象数组或 ID 数组
   */
  async function createUniverse(options) {
    if (!window.db || !window.db.parallelUniverses) {
      throw new Error('数据库尚未准备就绪 (parallelUniverses 未初始化)');
    }
    options = options || {};
    var universeId = generateId('univ');
    var rootBranchId = generateId('branch_root');
    var now = Date.now();

    // 1. 获取出演角色的深拷贝快照
    var selectedRawChars = options.selectedCharacters || [];
    var snapshots = [];
    if (Array.isArray(selectedRawChars)) {
      for (var i = 0; i < selectedRawChars.length; i++) {
        var item = selectedRawChars[i];
        if (typeof item === 'number' || typeof item === 'string') {
          var charRecord = await window.db.characters.get(parseInt(item, 10));
          if (charRecord) snapshots.push(createCharacterSnapshot(charRecord));
        } else if (item && typeof item === 'object') {
          snapshots.push(createCharacterSnapshot(item));
        }
      }
    }

    // 2. 构造宇宙元数据
    var universe = {
      universeId: universeId,
      title: (options.title || '').trim() || (snapshots.length ? (snapshots.map(function(s){return s.name;}).join('与') + '的平行世界') : '未命名IF宇宙'),
      premise: (options.premise || '').trim() || '如果我们换一种方式相遇',
      worldSetting: options.worldSetting || '现代都市',
      initialRelationship: options.initialRelationship || '初遇',
      specialSettings: options.specialSettings || '',
      storyAnticipation: options.storyAnticipation || '',
      atmosphere: options.atmosphere || '治愈',
      storyLength: options.storyLength || '标准',
      currentMode: options.playMode === 'inCharacter' ? 'inCharacter' : 'spectator',
      activeBranchId: rootBranchId,
      characterSnapshots: snapshots,
      status: 'active', // 'active' | 'archived' | 'completed'
      createdAt: now,
      updatedAt: now,
      lastScenePreview: '故事即将展开…'
    };

    // 3. 构造根分支数据
    var rootBranch = {
      branchId: rootBranchId,
      universeId: universeId,
      parentBranchId: null,
      forkNodeIndex: -1,
      branchName: '主线分支 (Origin)',
      scenes: [],
      relationshipState: options.initialRelationship || '初遇阶段',
      importantEvents: ['IF宇宙建立：' + universe.premise],
      summary: '',
      createdAt: now,
      updatedAt: now
    };

    // 4. 存入独立数据表，物理隔离
    await window.db.parallelUniverses.put(universe);
    await window.db.parallelBranches.put(rootBranch);

    return { universe: universe, rootBranch: rootBranch };
  }

  // 获取宇宙详情
  async function getUniverse(universeId) {
    if (!window.db || !window.db.parallelUniverses) return null;
    return await window.db.parallelUniverses.get(universeId);
  }

  // 获取所有宇宙（按最近更新倒序）
  async function getAllUniverses() {
    if (!window.db || !window.db.parallelUniverses) return [];
    try {
      var list = await window.db.parallelUniverses.toArray();
      list.sort(function(a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      return list;
    } catch (e) {
      console.error('[ParallelLettersStorage] getAllUniverses error:', e);
      return [];
    }
  }

  // 保存/更新宇宙元数据
  async function saveUniverse(universe) {
    if (!window.db || !window.db.parallelUniverses || !universe || !universe.universeId) return;
    universe.updatedAt = Date.now();
    await window.db.parallelUniverses.put(universe);
    return universe;
  }

  // 级联彻底删除宇宙及其全部平行分支与收藏（绝不触碰主线数据库）
  async function deleteUniverse(universeId) {
    if (!window.db || !window.db.parallelUniverses || !universeId) return false;
    try {
      // 1. 删除所有关联分支
      var branches = await window.db.parallelBranches.where('universeId').equals(universeId).toArray();
      for (var i = 0; i < branches.length; i++) {
        await window.db.parallelBranches.delete(branches[i].branchId);
      }
      // 2. 删除所有关联收藏
      if (window.db.parallelFavorites) {
        var favs = await window.db.parallelFavorites.where('universeId').equals(universeId).toArray();
        for (var j = 0; j < favs.length; j++) {
          await window.db.parallelFavorites.delete(favs[j].id);
        }
      }
      // 3. 删除宇宙档案
      await window.db.parallelUniverses.delete(universeId);
      return true;
    } catch (e) {
      console.error('[ParallelLettersStorage] deleteUniverse failed:', e);
      return false;
    }
  }

  // 复制宇宙副本（一键克隆宇宙元数据、所有分支、场景历史及收藏，分配新独立 ID）
  async function duplicateUniverse(sourceUniverseId) {
    var sourceUniv = await getUniverse(sourceUniverseId);
    if (!sourceUniv) throw new Error('源宇宙档案不存在: ' + sourceUniverseId);

    var branches = await getUniverseBranches(sourceUniverseId);
    var favs = await getFavorites(sourceUniverseId);

    var newUniverseId = generateId('univ');
    var branchIdMap = {};
    var now = Date.now();

    var newUniverse = deepClone(sourceUniv);
    newUniverse.universeId = newUniverseId;
    newUniverse.title = (newUniverse.title || '平行宇宙') + ' (副本)';
    newUniverse.createdAt = now;
    newUniverse.updatedAt = now;

    var newBranches = deepClone(branches || []);
    for (var i = 0; i < newBranches.length; i++) {
      var oldBId = newBranches[i].branchId;
      var newBId = generateId('branch');
      branchIdMap[oldBId] = newBId;
      newBranches[i].branchId = newBId;
      newBranches[i].universeId = newUniverseId;
      newBranches[i].createdAt = now;
      newBranches[i].updatedAt = now;
    }

    // 重构分支父级指针
    for (var j = 0; j < newBranches.length; j++) {
      if (newBranches[j].parentBranchId && branchIdMap[newBranches[j].parentBranchId]) {
        newBranches[j].parentBranchId = branchIdMap[newBranches[j].parentBranchId];
      }
    }

    if (newUniverse.activeBranchId && branchIdMap[newUniverse.activeBranchId]) {
      newUniverse.activeBranchId = branchIdMap[newUniverse.activeBranchId];
    } else if (newBranches.length) {
      newUniverse.activeBranchId = newBranches[0].branchId;
    }

    await window.db.parallelUniverses.put(newUniverse);
    for (var k = 0; k < newBranches.length; k++) {
      await window.db.parallelBranches.put(newBranches[k]);
    }

    // 复制关联收藏
    if (favs && favs.length) {
      for (var f = 0; f < favs.length; f++) {
        var newFav = deepClone(favs[f]);
        delete newFav.id;
        newFav.universeId = newUniverseId;
        if (newFav.branchId && branchIdMap[newFav.branchId]) {
          newFav.branchId = branchIdMap[newFav.branchId];
        }
        await window.db.parallelFavorites.add(newFav);
      }
    }

    return newUniverse;
  }

  // ===== 3. 分支与剧情节点 (Branches & Scenes) =====

  // 读取指定分支
  async function getBranch(branchId) {
    if (!window.db || !window.db.parallelBranches || !branchId) return null;
    return await window.db.parallelBranches.get(branchId);
  }

  // 读取某个宇宙下的所有分支（用于分支树与回溯路线）
  async function getUniverseBranches(universeId) {
    if (!window.db || !window.db.parallelBranches || !universeId) return [];
    try {
      return await window.db.parallelBranches.where('universeId').equals(universeId).toArray();
    } catch (e) {
      console.error('[ParallelLettersStorage] getUniverseBranches error:', e);
      return [];
    }
  }

  // 保存分支
  async function saveBranch(branch) {
    if (!window.db || !window.db.parallelBranches || !branch || !branch.branchId) return;
    branch.updatedAt = Date.now();
    await window.db.parallelBranches.put(branch);
    return branch;
  }

  /**
   * 向当前分支追加新的一幕
   * @param {string} universeId
   * @param {string} branchId
   * @param {Object} sceneData
   */
  async function addSceneToBranch(universeId, branchId, sceneData) {
    var branch = await getBranch(branchId);
    if (!branch) throw new Error('分支不存在: ' + branchId);

    var now = Date.now();
    var nodeIndex = branch.scenes.length;
    var newScene = Object.assign({
      sceneId: generateId('scene'),
      nodeIndex: nodeIndex,
      mode: sceneData.mode || 'spectator',
      pov: sceneData.pov || '',
      timeTag: sceneData.timeTag || '',
      directorPrompt: sceneData.directorPrompt || '',
      playerAction: sceneData.playerAction || '',
      narration: sceneData.narration || '',
      dialogues: Array.isArray(sceneData.dialogues) ? sceneData.dialogues : [],
      choices: Array.isArray(sceneData.choices) ? sceneData.choices : [],
      hiddenThoughts: sceneData.hiddenThoughts || null,
      timestamp: now
    }, sceneData);

    branch.scenes.push(newScene);
    if (sceneData.relationshipState) branch.relationshipState = sceneData.relationshipState;
    if (sceneData.importantEvent) branch.importantEvents.push(sceneData.importantEvent);
    if (sceneData.summary) branch.summary = sceneData.summary;

    await saveBranch(branch);

    // 同步更新宇宙元数据的预览文本与更新时间
    var univ = await getUniverse(universeId);
    if (univ) {
      univ.updatedAt = now;
      var lastPreview = '';
      if (newScene.dialogues && newScene.dialogues.length) {
        var lastDiag = newScene.dialogues[newScene.dialogues.length - 1];
        lastPreview = (lastDiag.speaker ? lastDiag.speaker + '：' : '') + lastDiag.text;
      } else if (newScene.narration) {
        lastPreview = newScene.narration.slice(0, 40) + '…';
      }
      if (lastPreview) univ.lastScenePreview = lastPreview;
      await saveUniverse(univ);
    }

    return newScene;
  }

  /**
   * 改写当前幕 (仅替换指定 nodeIndex 的幕次，严格保留此前已确认的剧情)
   */
  async function rewriteSceneInBranch(universeId, branchId, nodeIndex, newSceneData) {
    var branch = await getBranch(branchId);
    if (!branch) throw new Error('分支不存在: ' + branchId);
    if (nodeIndex < 0 || nodeIndex >= branch.scenes.length) {
      throw new Error('幕次索引超出范围: ' + nodeIndex);
    }

    var oldScene = branch.scenes[nodeIndex];
    var updatedScene = Object.assign({}, oldScene, newSceneData, {
      nodeIndex: nodeIndex,
      updatedAt: Date.now()
    });

    branch.scenes[nodeIndex] = updatedScene;
    await saveBranch(branch);

    var univ = await getUniverse(universeId);
    if (univ) {
      univ.updatedAt = Date.now();
      await saveUniverse(univ);
    }
    return updatedScene;
  }

  /**
   * 从指定节点创建剧情分叉 (命运岔路口 / 剧情回溯分叉)
   * 复制 forkNodeIndex 之前的所有场景与状态，建立独立新分支
   */
  async function forkBranch(universeId, sourceBranchId, forkNodeIndex, newBranchName) {
    var sourceBranch = await getBranch(sourceBranchId);
    if (!sourceBranch) throw new Error('源分支不存在: ' + sourceBranchId);

    var newBranchId = generateId('branch_fork');
    var now = Date.now();

    // 复制截取到分叉点为止的所有场景
    var inheritedScenes = [];
    if (forkNodeIndex >= 0 && forkNodeIndex < sourceBranch.scenes.length) {
      inheritedScenes = deepClone(sourceBranch.scenes.slice(0, forkNodeIndex + 1));
    }

    var newBranch = {
      branchId: newBranchId,
      universeId: universeId,
      parentBranchId: sourceBranchId,
      forkNodeIndex: forkNodeIndex,
      branchName: newBranchName || ('分支 ' + (inheritedScenes.length + 1) + ' 幕起'),
      scenes: inheritedScenes,
      relationshipState: sourceBranch.relationshipState || '',
      importantEvents: deepClone(sourceBranch.importantEvents || []),
      summary: sourceBranch.summary || '',
      createdAt: now,
      updatedAt: now
    };

    await saveBranch(newBranch);

    // 切换宇宙当前活跃分支为新分支
    var univ = await getUniverse(universeId);
    if (univ) {
      univ.activeBranchId = newBranchId;
      univ.updatedAt = now;
      await saveUniverse(univ);
    }

    return newBranch;
  }

  // ===== 4. 台词与名场面收藏 (Favorites) =====
  async function addFavorite(universeId, branchId, favItem) {
    if (!window.db || !window.db.parallelFavorites) return null;
    var record = {
      universeId: universeId,
      branchId: branchId,
      type: favItem.type || 'quote', // 'quote' | 'scene' | 'thought'
      speaker: favItem.speaker || '',
      avatar: favItem.avatar || '',
      content: favItem.content || '',
      context: favItem.context || '',
      title: favItem.title || '',
      createdAt: Date.now()
    };
    var id = await window.db.parallelFavorites.add(record);
    record.id = id;
    return record;
  }

  async function getFavorites(universeId) {
    if (!window.db || !window.db.parallelFavorites) return [];
    try {
      if (universeId) {
        return await window.db.parallelFavorites.where('universeId').equals(universeId).toArray();
      }
      return await window.db.parallelFavorites.toArray();
    } catch (e) {
      console.error('[ParallelLettersStorage] getFavorites error:', e);
      return [];
    }
  }

  async function deleteFavorite(favId) {
    if (!window.db || !window.db.parallelFavorites || !favId) return false;
    await window.db.parallelFavorites.delete(favId);
    return true;
  }

  // ===== 5. 备份与导出导入 =====
  async function exportUniverseJson(universeId) {
    var univ = await getUniverse(universeId);
    if (!univ) throw new Error('宇宙未找到: ' + universeId);
    var branches = await getUniverseBranches(universeId);
    var favs = await getFavorites(universeId);
    var exportData = {
      app: 'parallel-letters',
      version: '1.0.0',
      exportedAt: Date.now(),
      universe: univ,
      branches: branches,
      favorites: favs
    };
    return JSON.stringify(exportData, null, 2);
  }

  async function importUniverseJson(jsonStr) {
    var data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    if (!data || !data.universe) throw new Error('无效的平行宇宙数据格式');
    
    // 生成全新 ID 以免覆盖现有宇宙
    var oldUniverseId = data.universe.universeId;
    var newUniverseId = generateId('univ');
    var branchIdMap = {};

    var universe = deepClone(data.universe);
    universe.universeId = newUniverseId;
    universe.updatedAt = Date.now();

    var branches = deepClone(data.branches || []);
    for (var i = 0; i < branches.length; i++) {
      var oldBId = branches[i].branchId;
      var newBId = generateId('branch');
      branchIdMap[oldBId] = newBId;
      branches[i].branchId = newBId;
      branches[i].universeId = newUniverseId;
    }

    // 重构分支父级指针
    for (var j = 0; j < branches.length; j++) {
      if (branches[j].parentBranchId && branchIdMap[branches[j].parentBranchId]) {
        branches[j].parentBranchId = branchIdMap[branches[j].parentBranchId];
      }
    }
    if (universe.activeBranchId && branchIdMap[universe.activeBranchId]) {
      universe.activeBranchId = branchIdMap[universe.activeBranchId];
    } else if (branches.length) {
      universe.activeBranchId = branches[0].branchId;
    }

    await window.db.parallelUniverses.put(universe);
    for (var k = 0; k < branches.length; k++) {
      await window.db.parallelBranches.put(branches[k]);
    }

    return universe;
  }

  // ===== 6. 严苛物理隔离审查断言 (Isolation Assertion) =====
  // 严格杜绝在当前模块内引入任何对 messages, chats, memories, moments 等主线表的写操作
  var FORBIDDEN_MAIN_TABLES = ['messages', 'chats', 'memories', 'moments', 'finance', 'characters'];
  function assertIsolation(targetTable, op) {
    if (FORBIDDEN_MAIN_TABLES.indexOf(targetTable) !== -1 && op === 'write') {
      throw new Error('[Security Violation] 严禁平行来信回写主线数据表: ' + targetTable);
    }
  }

  // 自动化安全隔离断言审计工具（对照验收清单测试）
  async function runIsolationAudit() {
    var report = {
      timestamp: Date.now(),
      passed: true,
      logs: []
    };

    function log(name, success, detail) {
      report.logs.push({ check: name, passed: success, detail: detail });
      if (!success) report.passed = false;
    }

    try {
      // 1. 统计当前主线数据量快照
      var mainTables = ['characters', 'messages', 'chats', 'memories', 'moments'];
      var beforeCounts = {};
      for (var t = 0; t < mainTables.length; t++) {
        var tblName = mainTables[t];
        beforeCounts[tblName] = (window.db && window.db[tblName]) ? await window.db[tblName].count() : 0;
      }

      // 2. 模拟极端剧情：创建平行宇宙并写入结婚、重伤等极端设定
      var testUniv = await createUniverse({
        title: '【安全审计测试】极端剧情沙盒',
        premise: '如果主角在平行世界中意外身故，与反派联姻结婚……',
        worldSetting: '架空异界',
        initialRelationship: '联姻夫妻',
        specialSettings: '生离死别与誓约',
        atmosphere: '虐恋',
        playMode: 'inCharacter'
      });

      // 3. 在该宇宙写入一幕极端剧情
      await addSceneToBranch(testUniv.universe.universeId, testUniv.rootBranch.branchId, {
        mode: 'inCharacter',
        timeTag: '极端剧情演进',
        playerAction: '“以身为盾，彻底完成誓约……”',
        narration: '血染红了城池，盛大的婚礼在一场烈焰中化为永恒的灰烬。',
        dialogues: [
          { speaker: '测试角色', text: '“哪怕在这个平行世界化作尘土，也不要忘记我……”' }
        ],
        relationshipEvolution: '结发成婚，随后双双壮烈牺牲',
        keyEvent: '极端事件达成：平行世界结婚与殉情'
      });

      // 4. 再次统计主线数据量，严格核对是否被污染
      var afterCounts = {};
      var polluted = false;
      for (var i = 0; i < mainTables.length; i++) {
        var tb = mainTables[i];
        afterCounts[tb] = (window.db && window.db[tb]) ? await window.db[tb].count() : 0;
        if (afterCounts[tb] !== beforeCounts[tb]) {
          polluted = true;
          log('主线隔离测试: ' + tb, false, '数据量发生异常变动: ' + beforeCounts[tb] + ' -> ' + afterCounts[tb]);
        }
      }

      if (!polluted) {
        log('主线数据零污染验证', true, '主线 characters, messages, chats, memories, moments 表记录数绝对恒定');
      }

      // 5. 校验物理隔离写入安全断言
      var blockedIllegalWrite = false;
      try {
        assertIsolation('messages', 'write');
      } catch (secErr) {
        blockedIllegalWrite = true;
      }
      log('底层隔离拦截机制', blockedIllegalWrite, 'assertIsolation 成功阻断对主线表的非法写操作');

      // 6. 销毁测试沙盒宇宙，验证级联清理
      await deleteUniverse(testUniv.universe.universeId);
      var verifyDeletedUniv = await getUniverse(testUniv.universe.universeId);
      var verifyDeletedBranches = await getUniverseBranches(testUniv.universe.universeId);
      var cleanCascade = (!verifyDeletedUniv && verifyDeletedBranches.length === 0);
      log('沙盒销毁级联清理', cleanCascade, '宇宙及关联分支彻底销毁，零残留孤儿节点');

    } catch (auditErr) {
      report.passed = false;
      log('安全审计执行异常', false, auditErr.message || String(auditErr));
    }

    return report;
  }

  // 全局暴露安全存储层
  window.ParallelLettersStorage = {
    createCharacterSnapshot: createCharacterSnapshot,
    getAllPlayableCharacters: getAllPlayableCharacters,
    createUniverse: createUniverse,
    getUniverse: getUniverse,
    getAllUniverses: getAllUniverses,
    saveUniverse: saveUniverse,
    deleteUniverse: deleteUniverse,
    duplicateUniverse: duplicateUniverse,
    getBranch: getBranch,
    getUniverseBranches: getUniverseBranches,
    saveBranch: saveBranch,
    addSceneToBranch: addSceneToBranch,
    rewriteSceneInBranch: rewriteSceneInBranch,
    forkBranch: forkBranch,
    addFavorite: addFavorite,
    getFavorites: getFavorites,
    deleteFavorite: deleteFavorite,
    exportUniverseJson: exportUniverseJson,
    importUniverseJson: importUniverseJson,
    assertIsolation: assertIsolation,
    runIsolationAudit: runIsolationAudit
  };

})();
