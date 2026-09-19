/**
 * ToolRegistry — 注册和管理 AI Agent 工具
 *
 * 职责：
 * - register(tool)：注册一个工具
 * - getAllTools()：获取所有已注册工具
 * - getByCategory(category)：按分类获取工具
 * - getSystemPrompt()：生成 LLM system prompt（描述所有可用工具）
 */
export class ToolRegistry {
  constructor() {
    /** @type {Map<string, import('./types.js').ToolDefinition>} */
    this._tools = new Map();
  }

  /**
   * 注册一个工具
   * @param {import('./types.js').ToolDefinition} tool
   */
  register(tool) {
    if (!tool || !tool.name) {
      throw new Error('Tool must have a name');
    }
    this._tools.set(tool.name, tool);
  }

  /**
   * 获取所有已注册工具
   * @returns {import('./types.js').ToolDefinition[]}
   */
  getAllTools() {
    return Array.from(this._tools.values());
  }

  /**
   * 按分类获取工具
   * @param {string} cat
   * @returns {import('./types.js').ToolDefinition[]}
   */
  getByCategory(cat) {
    return this.getAllTools().filter(t => t.category === cat);
  }

  /**
   * 生成 LLM system prompt
   * 遍历所有已注册工具，生成结构化描述供 LLM 调用参考
   * @returns {string}
   */
  getSystemPrompt() {
    const tools = this.getAllTools();
    const lines = [
      '你是一个 AR 平台 AI Agent，你可以使用以下工具来响应用户的需求。',
      '请根据用户的意图选择合适的工具并构造参数。',
      '',
    ];

    for (const tool of tools) {
      lines.push(`## 工具: ${tool.name}`);
      lines.push(`描述: ${tool.description}`);
      lines.push(`分类: ${tool.category}`);
      lines.push('参数:');

      if (tool.parameters && tool.parameters.length > 0) {
        for (const param of tool.parameters) {
          const required = param.required ? '(必填)' : '(选填)';
          const enumHint = param.enum ? `可选值: ${param.enum.join(', ')}` : '';
          lines.push(`  - ${param.name} (${param.type}) ${required}: ${param.description} ${enumHint}`);
        }
      } else {
        lines.push('  无参数');
      }

      lines.push(''); // 空行分隔
    }

    lines.push('请根据用户输入选择最合适的工具，以 JSON 格式返回工具调用：');
    lines.push('{"tool": "工具名称", "args": {参数对象}}');
    lines.push('');

    return lines.join('\n');
  }
}

export default ToolRegistry;
