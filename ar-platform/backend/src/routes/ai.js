import { Router } from 'express';
import { createAR } from '../db.js';
import { gameDesignTool, guideDesignTool, ToolRegistry } from '../ai-agent/index.js';

// 初始化 AI Agent 工具注册表
const registry = new ToolRegistry();
registry.register(gameDesignTool);
registry.register(guideDesignTool);

const router = Router();

const TEST_MODEL_URL = '/models/helmet-compressed.glb';
const FOX_MODEL_URL = '/models/fox.glb';

/**
 * POST /api/ai/design
 * 用户描述 → AI 生成 AR 配置 → 自动创建体验
 */
router.post('/design', async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: '请输入 AR 体验描述' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'AI 服务未配置' });
    }

    const systemPrompt = `你是一个 AR 体验设计师。根据用户的一句话描述，生成最合适的 AR 体验配置。

返回严格的 JSON 格式（不要 markdown 包裹，不要注释）：
{
  "title": "2-6 字中文标题",
  "trackingType": "face",
  "modelHint": "模型风格描述（如：卡通小龙虾、红色、发光）",
  "scale": 1.0,
  "animationHint": "动画描述（如：旋转、上下浮动、待机）",
  "events": [],
  "reasoning": "用一句话说明为什么这样设计"
}

规则：
1. trackingType 是**设备兼容性最强**的字段，必须谨慎：
   - 默认一律用 "face"（人脸追踪）——它不需要任何额外的识别素材，iOS 与安卓浏览器都能跑
   - 只有用户明确提到"海报/明信片/书本/印刷品"时才用 "image"（需要用户再上传一张识别图）
   - 只有用户明确要求"放在桌面上/地面上/房间里"时才用 "plane"
   - **不要因为"想象不出放哪"就退回 plane**：plane 依赖 SLAM，在 iOS Safari 上根本无法启动，
     是四大类型里最脆弱的一种。
2. events: 如果描述中有交互需求就加（点击播放动画最常见），没有就空数组
3. scale: 小物体0.5-0.8，正常1.0，需要醒目1.2-1.5
4. 标题简短吸引人
5. modelHint 用于后续匹配或生成模型，描述视觉风格
6. animationHint 描述模型的动画行为`;

    const modelName = process.env.ANTHROPIC_MODEL || 'deepseek-ai/DeepSeek-V3.2';
    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.siliconflow.cn').replace(/\/+$/, '');

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 800,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '未知错误');
      console.error('[AI] API 调用失败:', response.status, errText);
      return res.status(502).json({ error: 'AI 服务暂时不可用' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 解析 JSON（去除可能的 markdown 包裹）
    const jsonStr = content.replace(/```(?:json)?\s*/g, '').replace(/\s*```/g, '');
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AI] 返回内容:', content);
      return res.status(500).json({ error: 'AI 返回格式异常，请重试' });
    }

    const config = JSON.parse(jsonMatch[0]);

    /*
     * trackingType 白名单兜底。
     *
     * 这里是"AI 生成的体验打开就报错"的直接来源：模型返回什么就用什么，
     * 而提示词原来把 plane 当默认值 —— plane 要走 SLAM（iOS Safari 上无法启动），
     * 于是每条 AI 体验在手机上都是「AR 加载失败」。
     * 现在：只接受四个合法值，非法/缺失一律落到 face（唯一零素材、全平台可跑的类型）。
     */
    const VALID_TRACKING = ['image', 'face', 'plane', 'world'];
    const trackingType = VALID_TRACKING.includes(config.trackingType)
      ? config.trackingType
      : 'face';

    // 根据 trackingType 选择默认模型
    const modelUrl = trackingType === 'face' ? FOX_MODEL_URL : TEST_MODEL_URL;

    // 构造基础体验配置
    const experience = {
      title: config.title || 'AI 生成体验',
      modelUrl,
      trackingType,
      scale: config.scale || 1,
      animationConfig: config.animationHint ? {
        enabled: true,
        defaultClip: '',
        interaction: { type: 'tap', action: 'next' },
      } : null,
      // 用归一化后的 trackingType，而不是模型原始返回值：
      // 否则模型返回非法值时这里会与上面的 trackingType 判断不一致
      freezeOnDetect: trackingType === 'image' || trackingType === 'face',
    };

    res.json({
      ...experience,
      aiConfig: config,
    });
  } catch (err) {
    console.error('[AI] 设计失败:', err);
    next(err);
  }
});

/**
 * POST /api/ai/face-design
 * 面部 AR 配置 — AI 根据描述生成面部区域配置
 */
router.post('/face-design', async (req, res, next) => {
  try {
    const { prompt, currentZones } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: '请输入面部效果描述' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'AI 服务未配置' });
    }

    const currentZonesHint = Array.isArray(currentZones)
      ? currentZones.map(z => `${z.zoneId}: ${z.enabled ? '启用' : '禁用'}`).join('\n')
      : '暂无';

    const systemPrompt = `你是一个面部AR配置映射器。必须严格按照下面的关键词映射规则返回JSON。

关键词映射规则（优先级从高到低）：
- 包含"眼镜"或"墨镜"或"眼镜框"或"试戴"：→ 启用glasses区域，generatedType="glasses"
- 包含"口罩"：→ 启用mouth区域，generatedType="mask"
- 包含"皇冠"或"生日"或"派对"：→ 启用glasses区域，generatedType="crown"
- 包含"胡子"：→ 启用mouth区域，generatedType="mustache"
- 包含"腮红"或"脸红"：→ 启用fullface区域，generatedType="blush"
- 包含"眼罩"：→ 启用left-eye区域，generatedType="eyepatch"

必须返回6个区域：glasses, fullface, mouth, nose, left-eye, right-eye
禁用区域：enabled=false, contentSource="", generatedType=""
启用区域：enabled=true, contentSource="generated", generatedType=对应值, scale=1.0

JSON格式：
{"presetId":"...","zones":[{"zoneId":"...","enabled":true/false,"contentSource":"generated|","generatedType":"...","scale":1}],"reasoning":"..."}`;

    const modelName = process.env.ANTHROPIC_MODEL || 'deepseek-ai/DeepSeek-V3.2';
    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.siliconflow.cn').replace(/\/+$/, '');
    console.log('[AI] face-design model:', JSON.stringify(modelName));

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 1000,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `当前区域状态：\n${currentZonesHint}\n\n用户描述：${prompt}` },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '未知错误');
      console.error('[AI] Face-design API 调用失败:', response.status, errText);
      // 检测余额不足
      if (errText.includes('insufficient') || errText.includes('balance')) {
        return res.status(402).json({ error: 'AI 服务余额不足，请充值后使用' });
      }
      return res.status(502).json({ error: 'AI 服务暂时不可用' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 解析 JSON（去除可能的 markdown 包裹）
    const jsonStr = content.replace(/```(?:json)?\s*/g, '').replace(/\s*```/g, '');
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AI] Face-design 返回内容:', content);
      return res.status(500).json({ error: 'AI 返回格式异常，请重试' });
    }

    const config = JSON.parse(jsonMatch[0]);
    res.json(config);
  } catch (err) {
    console.error('[AI] Face-design 失败:', err);
    next(err);
  }
});

/**
 * POST /api/ai/game-design
 * 用户描述 → AI 生成 AR 游戏配置（通过 gameDesignTool）
 */
router.post('/game-design', async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: '请输入游戏描述' });
    }

    const result = await gameDesignTool.execute(
      { userPrompt: prompt.trim() },
      { baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.siliconflow.cn' }
    );

    if (!result.success) {
      return res.status(502).json({ error: result.message });
    }

    res.json(result.data);
  } catch (err) {
    console.error('[AI] game-design 失败:', err);
    next(err);
  }
});

/**
 * POST /api/ai/guide-design
 * 用户描述 → AI 生成 AR 导览路线配置（通过 guideDesignTool）
 */
router.post('/guide-design', async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: '请输入导览描述' });
    }

    const result = await guideDesignTool.execute(
      { userPrompt: prompt.trim() },
      { baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.siliconflow.cn' }
    );

    if (!result.success) {
      return res.status(502).json({ error: result.message });
    }

    res.json(result.data);
  } catch (err) {
    console.error('[AI] guide-design 失败:', err);
    next(err);
  }
});

/**
 * POST /api/ai/chat
 * 对话式 AI 助手 — 用户发送自然语言指令，AI 修改当前配置或给出建议
 *
 * Body: { message, config, context }
 *   - message: 用户消息
 *   - config: 当前配置（GameConfig | GuideRoute | ARExperience）
 *   - context: 'game' | 'guide' | 'experience'
 *
 * Returns: { reply, modifiedConfig, patch }
 */
router.post('/chat', async (req, res, next) => {
  try {
    const { message, config, context } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: '请输入消息' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'AI 服务未配置' });
    }

    const configJson = config ? JSON.stringify(config, null, 2) : '暂无';

    const contextHint = context === 'guide'
      ? `当前导览配置：
\`\`\`json
${configJson}
\`\`\`

导览配置字段说明：
- id: 路线唯一标识
- name: 路线名称
- description: 路线描述
- pois: 兴趣点数组
  - id: POI 唯一标识
  - name: POI 名称
  - description: POI 描述
  - position: { type: "gps"|"manual", latitude, longitude, scenePosition }
  - triggerRadius: 触发半径（米）
  - autoTrigger: 是否自动触发
  - onEnter: 进入时动作 { type: "show_message"|"play_audio"|"link"|"show_model"|"trigger_event", message?, url? }
  - onExit: 离开时动作（同 onEnter）
  - order: 排序号
  - estimatedDuration: 预计停留时间（秒）
- positionProvider: "gps"|"ble"|"vps"|"manual"

用户可以对导览进行的操作：
1. 修改路线名称/描述
2. 添加/删除/修改 POI（名称、描述、坐标、触发半径等）
3. 修改 POI 的进入/离开动作
4. 调整 POI 顺序
5. 修改定位方式`
      : context === 'experience'
      ? `当前 AR 体验配置：
\`\`\`json
${configJson}
\`\`\`

AR 体验（ARExperience）字段说明：
- id: 体验唯一标识
- type: "freeform"|"scavenger"|"guided_tour"|"challenge"|"custom"
- meta: { title, description, version }
- world: { engine, tracking, capabilities, targetUrl? }
- entities: 场景实体数组（3D模型/视频/图片）
- mechanics:（可选）游戏机制
  - scoring: { enabled, initial }
  - timer: { enabled, duration, countdown }
  - items: { total, spawnInterval, maxVisible }
  - combo: { enabled, multiplier }
  - lives?: { total, onZero }
- navigation:（可选）导览机制
  - pois: POI 数组（位置、半径、动作）
  - positionProvider, autoAdvance, allowSkip
  - completion: { action, message }
- rules: 规则数组（核心！）
  - label, enabled, description
  - condition: 支持多种类型:
    * score_reach: { type, value }
    * timer_remaining: { type, value, operator }
    * items_collected: { type, value, operator }
    * combo_count: { type, value }
    * proximity_enter: { type, poiId }
    * proximity_exit: { type, poiId }
    * all_pois_visited: { type }
    * expression: { type, expr } （自由表达式，可用变量: score,timer,items,combo,multiplier,elapsed,visitedPois,totalPois）
    * custom: { type, evaluate }
  - action: 支持多种类型:
    * show_message, add_score, spawn_item, remove_all_items
    * speed_boost, slow_down, double_score
    * play_effect, play_audio, show_model, link
    * trigger_event, teleport_to_poi, restart, end_game
    * set_variable, custom
- hud: { layout, theme: UITheme, components: HUDComponent[] }
  - layout: "floating"|"fixed"|"overlay"
  - theme: { preset: 主题名, colors: { primary, secondary, accent, background, surface, text, textSecondary, success, warning, error, info } }
  - components: HUDComponent数组
    - id, type: score|timer|combo|lives|message|poi_card|poi_list|compass|directional_arrow|progress_bar|button|custom_text|minimap
    - enabled: boolean, position: 9锚点位置(top-left/top-center/top-right/middle-left/center/middle-right/bottom-left/bottom-center/bottom-right), props: 组件特定属性
- theme:（可选）旧版视觉主题，保留兼容

用户可以对体验进行的操作：
1. 修改类型、标题、描述、追踪方式
2. 编辑规则（添加/删除/修改条件和动作）
3. 生成自由表达式条件如 "score > 100 && combo >= 5"
4. 配置游戏机制（计时器、计分、物品、连击）
5. 添加导览路线和 POI
6. 从一句话生成完整配置
7. UI/主题相关指令（新增）：
   - "把UI改成霓虹风格" → 修改 hud.theme.preset + colors
   - "把分数放到右下角" → 修改分数组件的 position
   - "加一个POI列表" → 启用 poi_list 组件
   - "计时器显示红色警告" → 修改 timer 组件 props.warningThreshold
   - "帮我设计一个科幻风的界面" → 完整重新设计 hud 配置
   - "把主题改成绿色" → 修改主题色板的主色和辅色`
      : `当前游戏配置：
\`\`\`json
${configJson}
\`\`\`

游戏配置字段说明：
- type: "scavenger"|"target"|"stamp"（寻宝/打靶/集章）
- duration: 游戏时长（秒）
- itemCount: 物品数量
- scorePerItem: 每项分数
- comboEnabled: 是否启用连击
- spawnInterval: 生成间隔（秒）
- maxVisible: 最大可见数
- endCondition: "timer"|"collect_all"|"score_reach"
- endScore: 目标分数（endCondition=score_reach时）
- onComplete: { action: "show_score"|"show_message"|"restart"|"link", message?, linkUrl? }
- rules: 规则数组
  - condition: { type: "score_reach"|"timer_remaining"|"items_collected"|"combo_count", value, operator? }
  - action: { type: "show_message"|"speed_boost"|"slow_down"|"double_score"|"play_effect"|"spawn_bonus_item"|"remove_all_items", ...params }

用户可以对游戏进行的操作：
1. 修改游戏类型、时长、物品数量等参数
2. 添加/删除/修改规则
3. 修改结束条件和结束动作
4. 修改道具外观`;

    const systemPrompt = `你是一个 AR 配置助手。根据用户当前配置和自然语言指令，返回修改后的配置。

${contextHint}

返回严格的 JSON 格式（不要 markdown 包裹）：
{
  "reply": "对用户指令的简短回复（中文，说明做了什么修改）",
  "modifiedConfig": { ...完整的新配置对象... },
  "patch": { ...只包含修改的字段... }
}

重要：
- modifiedConfig 必须包含完整的配置对象（不是局部补丁）
- patch 只包含修改的字段
- 如果用户只是在询问信息而非修改，modifiedConfig 返回 null
- 保持配置中所有未提及的字段不变`;

    const modelName = process.env.ANTHROPIC_MODEL || 'deepseek-ai/DeepSeek-V3.2';
    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.siliconflow.cn').replace(/\/+$/, '');

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '未知错误');
      console.error('[AI Chat] API 调用失败:', response.status, errText);
      if (errText.includes('insufficient') || errText.includes('balance')) {
        return res.status(402).json({ error: 'AI 服务余额不足，请充值后使用' });
      }
      return res.status(502).json({ error: 'AI 服务暂时不可用' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      return res.status(500).json({ error: 'AI 返回内容为空，请重试' });
    }

    // 解析 JSON（去除可能的 markdown 包裹）
    const jsonStr = content.replace(/```(?:json)?\s*/g, '').replace(/\s*```/g, '');
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AI Chat] 返回内容:', content);
      return res.status(500).json({ error: 'AI 返回格式异常，请重试' });
    }

    const result = JSON.parse(jsonMatch[0]);

    res.json({
      reply: result.reply || '已更新配置',
      modifiedConfig: result.modifiedConfig || null,
      patch: result.patch || null,
    });
  } catch (err) {
    console.error('[AI Chat] 失败:', err);
    next(err);
  }
});

/**
 * POST /api/ai/experience-design
 * 一句话 → 完整 ARExperience 配置（Phase 3 统一格式）
 */
router.post('/experience-design', async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: '请输入体验描述' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'AI 服务未配置' });
    }

    const systemPrompt = `你是一个 AR 体验设计师。根据用户的一句话描述，生成完整的 AR 体验配置。

返回严格的 JSON 格式（不要 markdown 包裹，不要注释）：

{
  "id": "exp_"+时间戳,
  "type": "freeform"|"scavenger"|"guided_tour"|"challenge",
  "meta": { "title": "2-6字标题", "description": "简短描述", "version": "1.0.0" },
  "world": { "engine": "auto", "tracking": "image"|"face"|"plane"|"world", "capabilities": [], "targetUrl": "" },
  "mechanics": {
    "scoring": { "enabled": true, "initial": 0 },
    "timer": { "enabled": true, "duration": 60, "countdown": true },
    "items": { "total": 10, "spawnInterval": 3, "maxVisible": 5 },
    "combo": { "enabled": true, "multiplier": 2 }
  },
  "navigation": {
    "pois": [ ...根据描述生成POI... ],
    "positionProvider": "gps",
    "autoAdvance": true,
    "allowSkip": true,
    "completion": { "action": "show_message", "message": "体验完成！" }
  },
  "rules": [
    { "id": "rule_1", "label": "规则名", "enabled": true, "description": "...",
      "condition": { "type": "expression", "expr": "score > 100" },
      "action": { "type": "show_message", "text": "..." } }
  ],
  "hud": {
    "layout": "floating",
    "theme": {
      "preset": "dark",
      "colors": {
        "primary": "#6366f1",
        "secondary": "#8b5cf6",
        "accent": "#06b6d4",
        "background": "rgba(0,0,0,0.85)",
        "surface": "rgba(30,30,50,0.9)",
        "text": "#ffffff",
        "textSecondary": "rgba(255,255,255,0.7)",
        "success": "#22c55e",
        "warning": "#f59e0b",
        "error": "#ef4444",
        "info": "#3b82f6"
      }
    },
    "components": [
      { "id": "score_1", "type": "score", "enabled": true, "position": "top-left", "props": { "format": "number" } },
      { "id": "timer_1", "type": "timer", "enabled": true, "position": "top-center", "props": { "format": "number", "warningThreshold": 10 } },
      { "id": "msg_1", "type": "message", "enabled": true, "position": "bottom-center", "props": {} }
    ]
  }
}

规则：
1. trackingType: 面部/自拍→face，图片/海报→image，室外/空间→world，桌面/地面→plane
2. 根据描述自动生成 rules（条件可用 expression 自由表达式）
3. 如果描述提到"寻宝"/"收集"：启用 mechanics.items，添加收集相关规则
4. 如果描述提到"导览"/"参观"/"路线"：设置 navigation.pois
5. 如果描述提到"计时"/"限时"：启用 mechanics.timer
6. 规则中的 expression 可用变量：score, timer, items, combo, multiplier, elapsed, visitedPois, totalPois
7. 标题简短吸引人，2-6个中文
8. 根据体验类型自动生成 hud 主题和组件：
   - 游戏类（scavenger/challenge）→ dark/neon 主题，启用 score+timer+combo+lives
   - 导览类（guided_tour）→ nature/light 主题，启用 poi_card+poi_list+compass+directional_arrow+progress_bar
   - 自由体验（freeform）→ 根据描述内容智能选择主题
9. hud.theme 必须包含完整的 UITheme（preset + colors）
10. hud.components 的每个组件必须有 id, type, enabled, position, props`;

    const modelName = process.env.ANTHROPIC_MODEL || 'deepseek-ai/DeepSeek-V3.2';
    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.siliconflow.cn').replace(/\/+$/, '');

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 3000,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '未知错误');
      console.error('[AI Experience] API 调用失败:', response.status, errText);
      if (errText.includes('insufficient') || errText.includes('balance')) {
        return res.status(402).json({ error: 'AI 服务余额不足，请充值后使用' });
      }
      return res.status(502).json({ error: 'AI 服务暂时不可用' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    const jsonStr = content.replace(/```(?:json)?\s*/g, '').replace(/\s*```/g, '');
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AI Experience] 返回内容:', content);
      return res.status(500).json({ error: 'AI 返回格式异常，请重试' });
    }

    const config = JSON.parse(jsonMatch[0]);
    res.json(config);
  } catch (err) {
    console.error('[AI] experience-design 失败:', err);
    next(err);
  }
});

/**
 * POST /api/ai/ui-design
 * 用户描述 → AI 生成 HUD/主题配置（Wave 3.1）
 *
 * Body: { prompt, experienceType?, currentHUD? }
 *   - prompt: 自然语言界面描述（必填）
 *   - experienceType: 'game'|'guide'|'freeform'（可选，帮助选择默认主题）
 *   - currentHUD: 当前 HUDConfig（可选，迭代编辑）
 *
 * Returns: { hud: HUDConfig, theme: UITheme, reply: string }
 */
router.post('/ui-design', async (req, res, next) => {
  try {
    const { prompt, experienceType, currentHUD } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: '请输入界面描述' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'AI 服务未配置' });
    }

    const currentHUDHint = currentHUD
      ? JSON.stringify(currentHUD, null, 2)
      : '暂无';

    const experienceTypeHint = experienceType || '未指定';

    const systemPrompt = `你是一个 AR 界面设计师。根据用户的一句话描述，生成完整的 HUD 和主题配置。

experienceType: ${experienceTypeHint}
当前HUD配置：
${currentHUDHint}

可用组件类型（13种）：
- score: 显示分数数字，默认位置 top-left
- timer: 显示倒计时 MM:SS，默认位置 top-center
- combo: 显示连击倍率（>0时显示），默认位置 bottom-center
- lives: 显示生命值心形图标，默认位置 top-right
- message: Toast 通知消息，默认位置 bottom-center
- poi_card: 当前POI信息卡片（名称、描述、距离），默认位置 bottom-center
- poi_list: 所有POI编号列表（含访问状态），默认位置 top-right
- compass: 指南针方向指示，默认位置 top-center 副位
- directional_arrow: 指向下一个POI的箭头，默认位置 center
- progress_bar: POI完成进度横条，默认位置 top-center
- button: 自定义操作按钮，默认位置 bottom-right
- custom_text: 任意文本标签，默认位置 bottom-center
- minimap: 小地图概览（预留），默认位置 top-right

9个锚点位置：top-left, top-center, top-right, middle-left, center, middle-right, bottom-left, bottom-center, bottom-right

7个主题预设（含12色调色板）：
1. dark - 沉浸式，深灰+靛蓝（游戏默认）
   颜色：primary=#6366f1, secondary=#8b5cf6, accent=#06b6d4, background=rgba(0,0,0,0.85), surface=rgba(30,30,50,0.9), text=#ffffff, textSecondary=rgba(255,255,255,0.7), success=#22c55e, warning=#f59e0b, error=#ef4444, info=#3b82f6
2. light - 室内/教育，白+暖色
   颜色：primary=#4f46e5, secondary=#7c3aed, accent=#0ea5e9, background=rgba(255,255,255,0.95), surface=rgba(243,244,246,0.95), text=#1f2937, textSecondary=rgba(107,114,128,0.8), success=#10b981, warning=#f59e0b, error=#ef4444, info=#3b82f6
3. neon - 科幻/赛博，深色+青色+品红
   颜色：primary=#00f5d4, secondary=#ff00ff, accent=#00ffff, background=rgba(0,0,0,0.9), surface=rgba(10,10,30,0.95), text=#00ff88, textSecondary=rgba(0,255,136,0.6), success=#00ff00, warning=#ffaa00, error=#ff0044, info=#00ffff
4. minimal - 专业，黑白灰
   颜色：primary=#ffffff, secondary=#e5e7eb, accent=#9ca3af, background=rgba(0,0,0,0.9), surface=rgba(30,30,30,0.9), text=#ffffff, textSecondary=rgba(255,255,255,0.6), success=#22c55e, warning=#f59e0b, error=#ef4444, info=#6b7280
5. retro - 像素/怀旧，暖橙+棕色
   颜色：primary=#ff6b35, secondary=#f7931e, accent=#ffd700, background=rgba(20,12,8,0.9), surface=rgba(40,25,15,0.9), text=#ffe4b5, textSecondary=rgba(255,228,181,0.6), success=#7cfc00, warning=#ffa500, error=#dc143c, info=#deb887
6. nature - 户外/导览，绿色+大地
   颜色：primary=#22c55e, secondary=#16a34a, accent=#fbbf24, background=rgba(15,30,15,0.88), surface=rgba(25,50,25,0.9), text=#f0fdf4, textSecondary=rgba(240,253,244,0.6), success=#4ade80, warning=#fbbf24, error=#ef4444, info=#38bdf8
7. fantasy - 儿童/魔法，粉+紫+金
   颜色：primary=#ec4899, secondary=#a855f7, accent=#fbbf24, background=rgba(30,10,40,0.88), surface=rgba(50,20,60,0.9), text=#fdf4ff, textSecondary=rgba(253,244,255,0.6), success=#34d399, warning=#fbbf24, error=#f43f5e, info=#c084fc

组件属性（props per type）：
- score: format (number|progress), prefix (string)
- timer: format (number|ring), warningThreshold (number, 默认10)
- combo: showMultiplier (boolean, 默认true)
- lives: maxLives (number, 默认3), icon (heart|star|circle)
- poi_card: showDescription (boolean), showDistance (boolean)
- poi_list: showVisited (boolean)
- directional_arrow: style (arrow|triangle|dot)
- progress_bar: showLabel (boolean)
- button: text (string)
- custom_text: text (string)

规则：
- 如果 experienceType === 'game' → 默认 dark/neon 主题，启用 score+timer+combo+lives
- 如果 experienceType === 'guide' 或描述包含"导览" → 默认 nature/light 主题，启用 poi_card+poi_list+compass+directional_arrow+progress_bar
- 如果描述包含"科幻"/"赛博" → 使用 neon 主题
- 如果描述包含"自然"/"户外" → 使用 nature 主题
- 如果描述包含"儿童"/"魔法" → 使用 fantasy 主题
- 如果描述包含"复古" → 使用 retro 主题
- 如果描述包含"专业"/"极简" → 使用 minimal 主题
- 如果描述包含"室内"/"教育" → 使用 light 主题
- 智能布局：根据描述猜测组件位置，设置合适偏移
- 如果 currentHUD 不为空，在其基础上修改而非从头创建
- 返回完整的 HUDConfig 和 UITheme 对象

返回严格的 JSON 格式（不要 markdown 包裹，不要注释）：
{
  "hud": {
    "layout": "floating",
    "theme": {
      "preset": "主题名",
      "colors": { ... }
    },
    "components": [
      { "id": "comp_xxx", "type": "组件类型", "enabled": true, "position": "锚点位置", "props": { ... } }
    ]
  },
  "theme": {
    "preset": "主题名",
    "colors": { ... }
  },
  "reply": "中文说明：设计了什么界面、为什么这样设计"
}`;

    const modelName = process.env.ANTHROPIC_MODEL || 'deepseek-ai/DeepSeek-V3.2';
    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.siliconflow.cn').replace(/\/+$/, '');

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 3000,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '未知错误');
      console.error('[AI UI-Design] API 调用失败:', response.status, errText);
      if (errText.includes('insufficient') || errText.includes('balance')) {
        return res.status(402).json({ error: 'AI 服务余额不足，请充值后使用' });
      }
      return res.status(502).json({ error: 'AI 服务暂时不可用' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      return res.status(500).json({ error: 'AI 返回内容为空，请重试' });
    }

    // 解析 JSON（去除可能的 markdown 包裹）
    const jsonStr = content.replace(/```(?:json)?\s*/g, '').replace(/\s*```/g, '');
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AI UI-Design] 返回内容:', content);
      return res.status(500).json({ error: 'AI 返回格式异常，请重试' });
    }

    const config = JSON.parse(jsonMatch[0]);

    res.json({
      hud: config.hud || null,
      theme: config.theme || null,
      reply: config.reply || '已设计界面配置',
    });
  } catch (err) {
    console.error('[AI] ui-design 失败:', err);
    next(err);
  }
});

export default router;
