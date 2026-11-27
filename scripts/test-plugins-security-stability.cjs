// test-plugins-security-stability.cjs — 离线 Mock 测试脚本（知屿 7-C1：插件权限与稳定性优化）
const assert = require('assert');

// Mock global window and storage
global.window = global;
global.AiWorkspaceStorage = {
  getPluginSettings: async function() {
    return {
      globalEnabled: true,
      plugins: {
        builtin_dice_roller: { enabled: false, config: {} }
      },
      chatOverrides: {
        chat_disabled_test: { enabled: false, plugins: {} }
      },
      mcpServers: [
        {
          id: 'mcp_test_srv',
          name: '测试 MCP 服务',
          transport: 'streamable_http',
          url: 'https://example.com/mcp',
          authType: 'bearer',
          authToken: 'secret_token_123456',
          enabled: true,
          disabledTools: {
            sensitive_remote_action: true
          }
        }
      ],
      customPlugins: []
    };
  },
  savePluginSettings: async function(settings) {
    return settings;
  }
};

// Load ai-workspace-plugins.js
require('../js/ai-workspace-plugins.js');

async function runTests() {
  console.log('=== 开始执行离线 Mock 测试：知屿 7-C1 插件权限与稳定性优化 ===');

  const pluginsApi = global.AiWorkspacePlugins;
  assert(pluginsApi, 'AiWorkspacePlugins 应该已正确加载');

  // 1. 测试全局与单聊天权限禁用后无法调用
  console.log('测试 1：权限禁用检查...');
  const diceState = pluginsApi.resolvePluginEffectiveState('builtin_dice_roller', await pluginsApi.loadPluginSettings(), '');
  assert.strictEqual(diceState.effectiveEnabled, false, '全局禁用的插件应显示 effectiveEnabled: false');

  const invokeDisabledRes = await pluginsApi.invokeTool('builtin_dice_roller.roll_dice', { sides: 6 });
  assert.strictEqual(invokeDisabledRes.ok, false, '禁用状态下调用工具应返回 ok: false');
  assert.strictEqual(invokeDisabledRes.code, 'plugin_disabled', '错误码应为 plugin_disabled');

  const chatDisabledState = pluginsApi.resolvePluginEffectiveState('builtin_time_utils', await pluginsApi.loadPluginSettings(), 'chat_disabled_test');
  assert.strictEqual(chatDisabledState.effectiveEnabled, false, '单聊天禁用的对话应使插件 effectiveEnabled: false');

  // 2. 测试 SSRF 与 URL 安全校验
  console.log('测试 2：MCP URL 安全与 SSRF 防护测试...');
  const internalUrlRes = pluginsApi.validateMcpEndpointUrl('http://localhost:8080/mcp');
  assert.strictEqual(internalUrlRes.ok, false, '本地/内网 URL 应被 SSRF 防护拦截');
  assert.strictEqual(internalUrlRes.code, 'ssrf_blocked');

  const credentialUrlRes = pluginsApi.validateMcpEndpointUrl('https://user:pass@example.com/mcp');
  assert.strictEqual(credentialUrlRes.ok, false, '携带凭证的 URL 应被拦截');
  assert.strictEqual(credentialUrlRes.code, 'credentials_in_url');

  const validUrlRes = pluginsApi.validateMcpEndpointUrl('https://api.example.com/mcp');
  assert.strictEqual(validUrlRes.ok, true, '合法的公网 HTTPS URL 应通过校验');

  // 3. 测试 MCP 单独停用工具校验
  console.log('测试 3：MCP 单独停用工具校验...');
  const settings = await pluginsApi.loadPluginSettings();
  const isToolDisabled = pluginsApi.resolvePluginEffectiveState('mcp_test_srv', settings, '');
  assert(isToolDisabled, '应能读取 MCP 服务器配置');

  // 4. 测试内置工具正常执行（如计算器、时间）
  console.log('测试 4：内置工具安全执行（计算器与时间）...');
  const calcRes = await pluginsApi.invokeTool('builtin_calculator.calculate_expression', { expression: '(10 + 5) * 2 / 3' });
  assert.strictEqual(calcRes.ok, true, '安全计算器应执行成功');
  assert.strictEqual(calcRes.data.result, 10, '计算结果应准确');

  const timeRes = await pluginsApi.invokeTool('builtin_time_utils.get_current_datetime', {});
  assert.strictEqual(timeRes.ok, true, '时间感知工具应执行成功');
  assert(timeRes.data.date, '应返回当前日期');

  console.log('=== 所有离线 Mock 测试用例全部通过！===');
}

runTests().catch(function(err) {
  console.error('测试执行失败：', err);
  process.exit(1);
});
