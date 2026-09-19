/**
 * gameDesignTool — AR 游戏设计工具
 *
 * 根据用户的一句话描述，通过 DeepSeek-V3.2 生成完整的 AR 游戏配置。
 */

const GAME_SYSTEM_PROMPT = `你是一个 AR 游戏设计师。根据用户的一句话描述，生成完整的 AR 游戏配置。

游戏类型定义：
- scavenger（寻宝）: 在空间中找到并收集所有物品
- target（打靶）: 点击出现的虚拟目标得分
- stamp（集章）: 到达多个指定位置打卡

必须返回严格的 JSON 格式，不要 markdown 包裹：
{
  "title": "2-6字游戏标题",
  "gameConfig": {
    "type": "scavenger",
    "duration": 60,
    "itemCount": 5,
    "scorePerItem": 100,
    "comboEnabled": true,
    "spawnInterval": 3,
    "maxVisible": 5,
    "endCondition": "timer",
    "onComplete": { "action": "show_score", "message": "游戏结束！" },
    "rules": [
      {
        "id": "rule_1",
        "description": "收集到3个时加速",
        "condition": { "type": "items_collected", "value": 3, "operator": "at_least" },
        "action": { "type": "speed_boost", "multiplier": 1.5, "duration": 10 }
      }
    ]
  },
  "interactions": [
    { "trigger": "onCollect", "action": "addScore", "params": {}, "target": "" }
  ],
  "itemPrompt": "Gold coin, cartoon style, PBR materials, clean topology, suitable for mobile AR",
  "itemStyle": "cartoon",
  "reasoning": "简短的设计理由"
}

条件类型（condition.type）：
1. score_reach — 分数达到阈值时触发
   - value: number（目标分数）
2. timer_remaining — 剩余时间满足条件时触发
   - value: number（秒数）
   - operator: "less_than" | "greater_than"
3. items_collected — 收集物品数量满足条件时触发
   - value: number（数量）
   - operator: "at_least" | "exact"
4. combo_count — 连击次数达标时触发
   - value: number（连击数）

动作类型（action.type）：
1. show_message — 显示自定义文字
   - text: string（消息内容）
2. speed_boost — 加速物品生成
   - multiplier: number（倍率，如1.5）
   - duration: number（持续时间，秒）
3. slow_down — 减速物品生成
   - multiplier: number（倍率，如0.5）
   - duration: number（持续时间，秒）
4. double_score — 一段时间内分数翻倍
   - duration: number（持续时间，秒）
5. play_effect — 全屏特效
   - effect: "screen_shake" | "flash" | "confetti"
6. spawn_bonus_item — 额外生成奖励物品
   - modelUrl: string（可选，奖励模型URL）
   - count: number（数量，默认1）
7. remove_all_items — 移除场景中所有物品
   - 无参数

规则设计原则：
- 规则数量1-3条，形成正向反馈
- scavenger: 收集到一定数量触发bonus或加速
- target: 连续命中触发combo bonus或双倍分数
- stamp: 到达特定位置触发消息或特效
- 可以组合条件与动作」，支持timer_remaining触发倒数警告、combo_count触发特效庆祝等`;

/**
 * 从 AI 返回文本中提取 JSON 对象
 * 兼容可能出现的 markdown 包裹（\`\`\`json ... \`\`\`）
 * @param {string} text
 * @returns {Object|null}
 */
function extractJSON(text) {
  // 先尝试去除 markdown 包裹
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/\s*```/g, '').trim();
  // 找到第一个 { 到最后一个 }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/** @type {import('../types.js').ToolDefinition} */
export const gameDesignTool = {
  name: 'designGame',
  description: '根据用户描述设计 AR 游戏配置，包含游戏类型、规则、交互和3D生成提示词',
  category: 'game',
  parameters: [
    {
      name: 'userPrompt',
      type: 'string',
      description: '用户对游戏的描述',
      required: true,
    },
  ],
  execute: async (args, ctx) => {
    const { userPrompt } = args;
    if (!userPrompt || !userPrompt.trim()) {
      return { success: false, message: '请提供游戏描述' };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const modelName = process.env.ANTHROPIC_MODEL || 'deepseek-ai/DeepSeek-V3.2';
    const baseUrl = (ctx?.baseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.siliconflow.cn').replace(/\/+$/, '');

    if (!apiKey) {
      return { success: false, message: 'AI 服务未配置（缺少 API Key）' };
    }

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 2000,
          temperature: 0.1,
          messages: [
            { role: 'system', content: GAME_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '未知错误');
        console.error('[gameDesignTool] API 调用失败:', response.status, errText);

        // 检测余额不足
        if (errText.includes('insufficient') || errText.includes('balance')) {
          return { success: false, message: 'AI 服务余额不足，请充值后使用' };
        }
        return { success: false, message: `AI 服务暂时不可用 (${response.status})` };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (!content) {
        return { success: false, message: 'AI 返回内容为空，请重试' };
      }

      const parsed = extractJSON(content);
      if (!parsed) {
        console.error('[gameDesignTool] JSON 解析失败，原始内容:', content);
        return { success: false, message: 'AI 返回格式异常，无法解析游戏配置' };
      }

      // 验证必要字段
      if (!parsed.title || !parsed.gameConfig || !parsed.gameConfig.type) {
        return { success: false, message: 'AI 返回的配置缺少必要字段（title/gameConfig.type）' };
      }

      // 验证游戏类型有效性
      const validTypes = ['scavenger', 'target', 'stamp'];
      if (!validTypes.includes(parsed.gameConfig.type)) {
        return { success: false, message: `无效的游戏类型: ${parsed.gameConfig.type}` };
      }

      return {
        success: true,
        data: {
          title: parsed.title,
          gameConfig: parsed.gameConfig,
          interactions: parsed.interactions || [],
          itemPrompt: parsed.itemPrompt || '',
          itemStyle: parsed.itemStyle || 'cartoon',
          reasoning: parsed.reasoning || '',
        },
      };
    } catch (err) {
      console.error('[gameDesignTool] 执行异常:', err);
      return { success: false, message: `游戏设计失败: ${err.message}` };
    }
  },
};

export default gameDesignTool;
