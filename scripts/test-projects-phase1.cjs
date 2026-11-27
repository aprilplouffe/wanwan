// test-projects-phase1.cjs — 离线 Mock 测试脚本（知屿 8-A1：项目基础管理）
const assert = require('assert');

// Mock global environment and storage
global.window = global;
global.localStorage = {
  store: {},
  getItem: function(k) { return this.store[k] || null; },
  setItem: function(k, v) { this.store[k] = String(v); },
  removeItem: function(k) { delete this.store[k]; }
};

// Load ai-workspace-storage.js
require('../js/ai-workspace-storage.js');

async function runTests() {
  console.log('=== 开始执行离线 Mock 测试：知屿 8-A1 项目基础管理 ===');

  const store = global.AiWorkspaceStorage;
  assert(store, 'AiWorkspaceStorage 应该已正确加载');

  // 1. 测试项目创建与读取
  console.log('测试 1：项目创建与读取...');
  const newProj = await store.createProject({
    name: '测试小说项目',
    description: '用于测试大纲创作与章节编写',
    icon: 'fa-solid fa-book',
    color: '#ec4899',
    instructions: '保持第一人称细腻描写'
  });

  console.log('newProj created:', newProj);

  const foundProj = await store.getProject(newProj.id);
  console.log('foundProj by getProject:', foundProj);

  const projectsList = await store.listProjects();
  console.log('projectsList:', projectsList);

  assert(projectsList.some(function(p) { return p.id === newProj.id; }), '项目列表中应包含新创建的项目');

  // 2. 测试项目编辑与更新
  console.log('测试 2：项目编辑与更新...');
  const updatedProj = await store.updateProject(newProj.id, {
    name: '测试小说项目（已更新）'
  });
  console.log('updatedProj:', updatedProj);
  assert.strictEqual(updatedProj.name, '测试小说项目（已更新）');

  console.log('=== 所有 8-A1 项目基础管理离线 Mock 测试全部通过！===');
}

runTests().catch(function(err) {
  console.error('测试执行失败：', err);
  process.exit(1);
});
