// test-plugin-presets.cjs — 离线 Mock 测试脚本（知屿 7-C2：插件预设组合）
const assert = require('assert');

// Mock global environment and storage
global.window = global;
global.AiWorkspaceStorage = {
  store: {},
  getConfig: async function(key) {
    return this.store[key] || null;
  },
  setConfig: async function(key, val) {
    this.store[key] = val;
    return val;
  },
  getChat: async function(chatId) {
    return { id: chatId, title: '测试会话', pluginPresetId: '' };
  },
  saveChat: async function(chat) {
    return chat;
  }
};

global.AiWorkspacePlugins = {
  loadPluginSettings: async function() {
    return {
      globalEnabled: true,
      plugins: {
        builtin_time_utils: { enabled: true, config: {} },
        builtin_dice_roller: { enabled: true, config: {} }
      },
      chatOverrides: {}
    };
  },
  savePluginSettings: async function(settings) {
    return settings;
  },
  listPlugins: function(cat) {
    const list = [
      { id: 'builtin_time_utils', name: '时间感知', category: 'builtin', categoryLabel: '内置插件', tools: [{ name: 'get_current_datetime' }] },
      { id: 'builtin_dice_roller', name: '随机骰子', category: 'builtin', categoryLabel: '内置插件', tools: [{ name: 'roll_dice' }] },
      { id: 'mcp_test', name: 'MCP 测试服务', category: 'mcp', categoryLabel: 'MCP 插件', mcpMeta: { connected: false }, tools: [] }
    ];
    if (cat && cat !== 'all') {
      return list.filter(function(p) { return p.category === cat; });
    }
    return list;
  },
  resolvePluginEffectiveState: function(pid, settings, cid) {
    const enabled = settings.plugins[pid] ? settings.plugins[pid].enabled : true;
    return { effectiveEnabled: enabled, reason: 'ok' };
  }
};

// Load plugin-presets.js
require('../js/plugin-presets.js');

async function runTests() {
  console.log('=== 开始执行离线 Mock 测试：知屿 7-C2 插件预设组合 ===');

  const pp = global.PluginPresets;
  assert(pp, 'PluginPresets 应该已正确加载');

  // 1. 测试创建和读取预设
  console.log('测试 1：创建和读取预设...');
  const newPreset = await pp.savePluginPreset({
    id: 'preset_test_1',
    name: '测试组合',
    description: '用于单元测试的预设',
    pluginIds: ['builtin_time_utils'],
    apiKey: 'secret_api_key_should_be_stripped',
    token: 'secret_token_stripped'
  });

  assert.strictEqual(newPreset.id, 'preset_test_1');
  assert.strictEqual(newPreset.apiKey, undefined, '预设中绝对不能保存 API Key');
  assert.strictEqual(newPreset.token, undefined, '预设中绝对不能保存 Token');

  const presets = await pp.getPluginPresets();
  assert(presets.some(function(p) { return p.id === 'preset_test_1'; }), '预设列表中应包含新建的预设');

  // 2. 测试设为默认与读取默认
  console.log('测试 2：默认预设设置...');
  await pp.setDefaultPreset('preset_test_1');
  const defId = await pp.getDefaultPresetId();
  assert.strictEqual(defId, 'preset_test_1', '默认预设 ID 应正确保存');

  // 3. 测试应用预设到会话
  console.log('测试 3：应用预设到会话...');
  const appliedChat = await pp.applyPresetToChat('chat_123', 'preset_test_1');
  assert(appliedChat, '应用到会话应成功');

  // 4. 测试保存当前会话为预设
  console.log('测试 4：保存当前会话为预设...');
  const savedFromChat = await pp.saveCurrentChatAsPreset('chat_123', '从会话保存的预设');
  assert(savedFromChat.id, '应成功生成新预设');
  assert(savedFromChat.pluginIds.length > 0, '应包含当前会话启用的插件');

  // 5. 测试删除预设
  console.log('测试 5：删除预设...');
  await pp.deletePluginPreset('preset_test_1');
  const presetsAfterDelete = await pp.getPluginPresets();
  assert(!presetsAfterDelete.some(function(p) { return p.id === 'preset_test_1'; }), '预设应已被删除');

  console.log('=== 所有 7-C2 插件预设组合离线 Mock 测试全部通过！===');
}

runTests().catch(function(err) {
  console.error('测试执行失败：', err);
  process.exit(1);
});
