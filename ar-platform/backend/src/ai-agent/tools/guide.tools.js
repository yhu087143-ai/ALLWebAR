/**
 * guideDesignTool — AR 导览设计工具
 *
 * 根据用户的一句话描述，通过 DeepSeek-V3.2 生成完整的 AR 导览路线配置。
 * 包含 POI 序列、定位方式、触发动作和 3D 生成提示词。
 */

const GUIDE_SYSTEM_PROMPT = `你是一个 AR 导览设计师。根据用户的一句话描述，生成完整的 AR 导览路线配置。

定位方式说明：
- gps: 室外 GPS 坐标触发（精度 5-30m），适合景区/园区/户外导览
- manual: 手动放置（编辑器模式），适合室内展览/商场导览
- ble/vps: 预留，暂不启用

必须返回严格的 JSON 格式，不要 markdown 包裹：
{
  "title": "2-6字导览标题",
  "guideRoute": {
    "id": "route_xxx",
    "name": "导览名称",
    "description": "导览描述",
    "positionProvider": "gps",
    "pois": [
      {
        "id": "poi_1",
        "name": "POI名称",
        "description": "POI描述",
        "position": {
          "type": "gps",
          "latitude": 30.123456,
          "longitude": 120.123456
        },
        "triggerRadius": 30,
        "autoTrigger": true,
        "onEnter": {
          "type": "show_message",
          "message": "欢迎来到第一站！"
        },
        "order": 1
      }
    ],
    "startPOIId": "poi_1",
    "endPOIId": "poi_3",
    "style": {
      "lineColor": "#00aaff",
      "markerScale": 1.0
    }
  },
  "markerPrompt": "用于 3D 生成的路标模型描述（英文，供模型生成 AI 使用）",
  "reasoning": "设计理由"
}

设计原则：
- POI 数量 3-6 个，形成合理的导览路线（有明确的起点和终点）
- 室外场景（positionProvider=gps）使用真实或典型 GPS 坐标
- triggerRadius: 室外 20-50m，室内 5-15m
- 每个 POI 必须有一个 onEnter 进入动作（show_message 最常见）
- 路线应按照 order 排序，从 1 开始递增
- POI 的名称和描述要贴合实际的导览场景
- markerPrompt 描述路标模型的视觉风格（英文），用于后续 3D AI 生成
- 风格配置（lineColor）使用十六进制颜色值`;

/**
 * 从 AI 返回文本中提取 JSON 对象
 * 兼容可能出现的 markdown 包裹（```json ... ```）
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
export const guideDesignTool = {
  name: 'designGuide',
  description: '根据用户描述设计 AR 导览路线，包含 POI 序列、定位方式和触发配置',
  category: 'guide',
  parameters: [
    {
      name: 'userPrompt',
      type: 'string',
      description: '用户对导览的描述',
      required: true,
    },
  ],
  execute: async (args, ctx) => {
    const { userPrompt } = args;
    if (!userPrompt || !userPrompt.trim()) {
      return { success: false, message: '请提供导览描述' };
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
            { role: 'system', content: GUIDE_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '未知错误');
        console.error('[guideDesignTool] API 调用失败:', response.status, errText);

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
        console.error('[guideDesignTool] JSON 解析失败，原始内容:', content);
        return { success: false, message: 'AI 返回格式异常，无法解析导览配置' };
      }

      // 验证必要字段
      if (!parsed.title || !parsed.guideRoute || !parsed.guideRoute.pois || !Array.isArray(parsed.guideRoute.pois) || parsed.guideRoute.pois.length === 0) {
        return { success: false, message: 'AI 返回的配置缺少必要字段（title/guideRoute/guideRoute.pois）' };
      }

      // 验证定位方式有效性
      const validProviders = ['gps', 'ble', 'vps', 'manual'];
      if (!validProviders.includes(parsed.guideRoute.positionProvider)) {
        return { success: false, message: `无效的定位方式: ${parsed.guideRoute.positionProvider}` };
      }

      // 验证 POI 结构完整性
      for (let i = 0; i < parsed.guideRoute.pois.length; i++) {
        const poi = parsed.guideRoute.pois[i];
        if (!poi.id || !poi.name || !poi.position) {
          return { success: false, message: `POI #${i + 1} 缺少必要字段（id/name/position）` };
        }
      }

      // 确保 startPOIId 和 endPOIId 指向有效的 POI
      const poiIds = parsed.guideRoute.pois.map(p => p.id);
      if (parsed.guideRoute.startPOIId && !poiIds.includes(parsed.guideRoute.startPOIId)) {
        parsed.guideRoute.startPOIId = parsed.guideRoute.pois[0].id;
      }
      if (parsed.guideRoute.endPOIId && !poiIds.includes(parsed.guideRoute.endPOIId)) {
        parsed.guideRoute.endPOIId = parsed.guideRoute.pois[parsed.guideRoute.pois.length - 1].id;
      }

      // 按 order 排序
      parsed.guideRoute.pois.sort((a, b) => (a.order || 0) - (b.order || 0));

      return {
        success: true,
        data: {
          title: parsed.title,
          guideRoute: parsed.guideRoute,
          markerPrompt: parsed.markerPrompt || '',
          reasoning: parsed.reasoning || '',
        },
      };
    } catch (err) {
      console.error('[guideDesignTool] 执行异常:', err);
      return { success: false, message: `导览设计失败: ${err.message}` };
    }
  },
};

export default guideDesignTool;
