/**
 * 平台侧的 ComfyUI 接口（/api/ai/comfy/*）。
 *
 * 和 /api/v1 的分工：
 *   /api/v1      —— 给 XR 引擎的通用生成协议（只有 submit + poll）
 *   /api/ai/comfy —— 给平台自己的页面用：状态、工作流/预设清单、混合 AR 触发说明
 *
 * 混合 AR 的融入点在这里定死：每条预设都带 trigger（text/image/gesture）和 applyTo，
 * 前端照着列表渲染即可，不需要把「手势识别要配哪个工作流」硬编码在页面里。
 */
import { Router } from 'express';
import multer from 'multer';

import { comfyFromEnv } from '../comfyui/client.js';
import { createTask, getTask, publicTask, taskStats } from '../comfyui/tasks.js';
import { listWorkflows, PRESETS } from '../comfyui/workflows.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

/** 把 base64 / dataURL 统一成 Buffer，方便前端直接贴 canvas.toDataURL() 的结果 */
function decodeBase64(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const body = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  const buffer = Buffer.from(body, 'base64');
  return buffer.length ? buffer : null;
}

router.get('/status', async (_req, res) => {
  const client = comfyFromEnv();
  const status = await client.health();
  res.json({
    // connected 只表示「真的连上 ComfyUI」；mock 表示当前会返回降级产物
    connected: status.ok,
    mock: client.mock,
    baseUrl: status.baseUrl,
    devices: status.devices || [],
    error: status.error || null,
    workflows: listWorkflows(),
    presets: PRESETS,
    tasks: taskStats(),
    hint: status.ok
      ? 'ComfyUI 已连接'
      : `未连上 ComfyUI（${status.baseUrl}）。启动 ComfyUI 后刷新；或在 backend/.env 设 COMFYUI_MOCK=1 用降级产物跑通流程。`,
  });
});

router.get('/workflows', (_req, res) => {
  res.json({ workflows: listWorkflows(), presets: PRESETS });
});

/**
 * 发起一次生成。
 * 支持三种入参：
 *   JSON { presetId|workflowId, prompt, values, imageBase64 }
 *   multipart 同字段 + image 文件
 * 手势/图片识别命中后由前端调用（识别在前端跑，生成在后端跑，职责不混）。
 */
router.post('/run', upload.single('image'), (req, res, next) => {
  try {
    const body = req.body || {};
    let values = {};
    if (body.values) {
      values = typeof body.values === 'object' ? body.values : JSON.parse(body.values);
    }

    const inline = decodeBase64(body.imageBase64);
    const image = req.file
      ? { buffer: req.file.buffer, filename: req.file.originalname || 'input.png' }
      : inline
        ? { buffer: inline, filename: body.imageName || 'inline.png' }
        : null;

    const task = createTask({
      provider: 'comfyui',
      presetId: body.presetId,
      workflowId: body.workflowId,
      prompt: body.prompt,
      kind: body.kind,
      values,
      image,
      // 平台页面按需开启降级：body.mock === '1' / true
      client: /^(1|true|on|yes)$/i.test(String(body.mock || ''))
        ? comfyFromEnv({ mock: true })
        : undefined,
    });

    res.status(201).json({ taskId: task.taskId, state: task.state, provider: task.provider });
  } catch (err) {
    next(err);
  }
});

router.get('/task/:taskId', (req, res) => {
  const task = getTask(req.params.taskId);
  if (!task) {
    res.status(404).json({ error: '任务不存在或已过期' });
    return;
  }
  res.json(publicTask(task));
});

export default router;
