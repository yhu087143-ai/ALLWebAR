/**
 * ComfyUI 工作流模板 + 混合 AR 预设。
 *
 * 模板用的是 ComfyUI 的 **API 格式**（节点 id → {class_type, inputs}），
 * 也就是「Load 按钮旁那个 Save (API Format)」导出的结构；
 * 不是编辑器里拖拽用的 UI 格式（那份带 links/nodes 数组，服务端不认）。
 *
 * 占位符写成 {{key}}，提交前由 renderWorkflow() 替换：
 *   - 整个字符串就是一个占位符时按数字转换（seed/width/steps 必须是 number，
 *     否则 KSampler 会拒收字符串）；
 *   - 其余按字符串替换。
 * 这样做的好处是模板可以直接贴进任何 ComfyUI 里改，不需要跟着节点 id 走。
 */

const BASE_NEGATIVE = 'text, watermark, signature, blurry, low quality, jpeg artifacts';

/** 文本/图像 → 贴图、触发图、环境图 */
export const WORKFLOWS = {
  'sdxl-texture': {
    id: 'sdxl-texture',
    name: '文生贴图（PBR 基色）',
    kind: 'texture',
    description: '按提示词生成四方连续感强的贴图，用于 AR 模型表面或地面材质',
    inputs: [
      { key: 'prompt', type: 'string', required: true },
      { key: 'negative', type: 'string', default: BASE_NEGATIVE },
      { key: 'seed', type: 'number', default: 0 },
      { key: 'width', type: 'number', default: 768 },
      { key: 'height', type: 'number', default: 768 },
      { key: 'steps', type: 'number', default: 24 },
    ],
    template: {
      3: {
        class_type: 'KSampler',
        inputs: {
          cfg: 7,
          denoise: 1,
          latent_image: ['5', 0],
          model: ['4', 0],
          negative: ['7', 0],
          positive: ['6', 0],
          sampler_name: 'euler',
          scheduler: 'normal',
          seed: '{{seed}}',
          steps: '{{steps}}',
        },
      },
      4: {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: '{{ckpt}}' },
      },
      5: {
        class_type: 'EmptyLatentImage',
        inputs: { batch_size: 1, height: '{{height}}', width: '{{width}}' },
      },
      6: { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 1], text: '{{prompt}}' } },
      7: { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 1], text: '{{negative}}' } },
      8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
      9: {
        class_type: 'SaveImage',
        inputs: { filename_prefix: 'AR_platform_texture', images: ['8', 0] },
      },
    },
  },

  'img2img-restyle': {
    id: 'img2img-restyle',
    name: '图生图风格化',
    kind: 'image',
    description: '拿一张参考图（现场拍摄的照片、手势命中的画面）重新风格化，保留构图',
    inputs: [
      { key: 'prompt', type: 'string', required: true },
      { key: 'negative', type: 'string', default: BASE_NEGATIVE },
      { key: 'image', type: 'image', required: true },
      { key: 'seed', type: 'number', default: 0 },
      { key: 'denoise', type: 'number', default: 0.62 },
      { key: 'steps', type: 'number', default: 24 },
    ],
    template: {
      3: {
        class_type: 'KSampler',
        inputs: {
          cfg: 7,
          denoise: '{{denoise}}',
          latent_image: ['12', 0],
          model: ['4', 0],
          negative: ['7', 0],
          positive: ['6', 0],
          sampler_name: 'euler',
          scheduler: 'normal',
          seed: '{{seed}}',
          steps: '{{steps}}',
        },
      },
      4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '{{ckpt}}' } },
      6: { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 1], text: '{{prompt}}' } },
      7: { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 1], text: '{{negative}}' } },
      8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
      10: { class_type: 'LoadImage', inputs: { image: '{{image}}' } },
      12: {
        class_type: 'VAEEncode',
        inputs: { pixels: ['10', 0], vae: ['4', 2] },
      },
      9: {
        class_type: 'SaveImage',
        inputs: { filename_prefix: 'AR_platform_restyle', images: ['8', 0] },
      },
    },
  },

  'marker-enhance': {
    id: 'marker-enhance',
    name: '触发图增强（提升识别率）',
    kind: 'marker',
    description:
      '把低对比、发虚的触发图重绘成纹理丰富、边缘清晰的版本，再走 /api/target/compile 编译成 .mind',
    inputs: [
      { key: 'prompt', type: 'string', default: 'high contrast detailed texture, sharp edges' },
      { key: 'negative', type: 'string', default: 'flat color, blurry, plain background' },
      { key: 'image', type: 'image', required: true },
      { key: 'seed', type: 'number', default: 0 },
      { key: 'denoise', type: 'number', default: 0.45 },
      { key: 'steps', type: 'number', default: 20 },
    ],
    template: {
      3: {
        class_type: 'KSampler',
        inputs: {
          cfg: 6.5,
          denoise: '{{denoise}}',
          latent_image: ['12', 0],
          model: ['4', 0],
          negative: ['7', 0],
          positive: ['6', 0],
          sampler_name: 'dpmpp_2m',
          scheduler: 'karras',
          seed: '{{seed}}',
          steps: '{{steps}}',
        },
      },
      4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '{{ckpt}}' } },
      6: { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 1], text: '{{prompt}}' } },
      7: { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 1], text: '{{negative}}' } },
      8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
      10: { class_type: 'LoadImage', inputs: { image: '{{image}}' } },
      12: { class_type: 'VAEEncode', inputs: { pixels: ['10', 0], vae: ['4', 2] } },
      9: {
        class_type: 'SaveImage',
        inputs: { filename_prefix: 'AR_platform_marker', images: ['8', 0] },
      },
    },
  },
};

/**
 * 混合 AR 预设：把「AR 里的什么事件」和「生成什么」绑在一起。
 *
 * trigger 说明（对应 AR 场景里真实存在的三个入口）：
 *   text    手动输入提示词 —— 创作期用
 *   image   图片识别命中/现场拍一张 —— 运行时用（图片识别是平台已有追踪方式）
 *   gesture 手势识别命中 —— 运行时用（ProjectHand / MediaPipe 那套）
 */
export const PRESETS = [
  {
    id: 'texture-from-text',
    name: '说一句 → 生成模型贴图',
    workflowId: 'sdxl-texture',
    trigger: 'text',
    applyTo: 'model-texture',
    samplePrompt: '磨损金属表面，拉丝纹理，暖色反光，四方连续',
    hint: '生成结果直接落到 /uploads，可作为 GLB 的贴图或地面材质使用',
  },
  {
    id: 'restyle-on-recognize',
    name: '识别到图片 → 现场风格化',
    workflowId: 'img2img-restyle',
    trigger: 'image',
    applyTo: 'scene-overlay',
    samplePrompt: '水彩插画风格，柔光，保留原构图',
    hint: '扫到触发图后，把当前画面或参考图重绘成另一种风格再叠加到 AR 里',
  },
  {
    id: 'marker-boost',
    name: '触发图识别率不够 → 增强重编译',
    workflowId: 'marker-enhance',
    trigger: 'image',
    applyTo: 'marker',
    samplePrompt: 'high contrast detailed texture, sharp edges, rich detail',
    hint: '增强后的图可直接 POST /api/target/compile 换成新的 .mind，识别率立竿见影',
  },
  {
    id: 'gesture-reveal',
    name: '打手势 → 生成并展示',
    workflowId: 'sdxl-texture',
    trigger: 'gesture',
    applyTo: 'scene-overlay',
    samplePrompt: '发光的全息图腾，霓虹轮廓，深色背景',
    hint: '手势命中时按预设提示词实时生成内容，作为交互反馈（比静态弹窗更有冲击力）',
  },
];

export const findWorkflow = (id) => WORKFLOWS[id] || null;
export const findPreset = (id) => PRESETS.find((p) => p.id === id) || null;

/** 默认 checkpoint：ComfyUI 官方示例模型，装了别的可以在请求里覆盖 */
const DEFAULT_CKPT = 'v1-5-pruned-emaonly.safetensors';

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * 渲染模板：替换占位符并做校验。
 * @param {string} workflowId
 * @param {Record<string, unknown>} values
 * @returns {{graph: object, resolved: Record<string, unknown>, missing: string[]}}
 */
export function renderWorkflow(workflowId, values = {}) {
  const workflow = findWorkflow(workflowId);
  if (!workflow) throw new Error(`未知工作流：${workflowId}`);

  const merged = { ckpt: DEFAULT_CKPT };
  for (const input of workflow.inputs) {
    const raw = values[input.key];
    if (raw === undefined || raw === null || raw === '') {
      if (input.default === undefined) continue;
      merged[input.key] = input.default;
    } else {
      merged[input.key] = input.type === 'number' ? Number(raw) : raw;
    }
  }

  const missing = workflow.inputs
    .filter((i) => i.required && (merged[i.key] === undefined || merged[i.key] === ''))
    .map((i) => i.key);
  if (missing.length) throw new Error(`缺少工作流参数：${missing.join(', ')}`);

  const replace = (node) => {
    if (typeof node === 'string') {
      const whole = node.match(/^\{\{(\w+)\}\}$/);
      // 整串就是一个占位符：保持数字类型，否则 KSampler 会因为 seed 是字符串而报错
      if (whole) return merged[whole[1]];
      return node.replace(PLACEHOLDER, (_, key) => (merged[key] === undefined ? '' : String(merged[key])));
    }
    if (Array.isArray(node)) return node.map(replace);
    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = replace(v);
      return out;
    }
    return node;
  };

  const graph = replace(JSON.parse(JSON.stringify(workflow.template)));
  const leftover = JSON.stringify(graph).match(PLACEHOLDER);
  if (leftover) throw new Error(`模板里还有未替换的占位符：${[...new Set(leftover)].join(', ')}`);

  return { graph, resolved: merged, missing };
}

/** 给前端列出的工作流元数据（不含模板本体，避免把大 JSON 塞进响应） */
export const listWorkflows = () =>
  Object.values(WORKFLOWS).map(({ template, ...meta }) => ({
    ...meta,
    inputs: meta.inputs.map((i) => ({ ...i, default: i.default ?? null })),
    nodeCount: Object.keys(template).length,
  }));
