/**
 * XR 引擎 AI 面板对接的生成服务（/api/v1/*）。
 *
 * 契约来自 XR 引擎的 RemoteModelProvider（src/engine/ai3d/providers.ts）：
 *   GET  /api/v1/health          探活
 *   POST /api/v1/generate        JSON 提交 → { taskId }
 *   POST /api/v1/generate/form   multipart（带参考图）→ { taskId }
 *   GET  /api/v1/task/:taskId    轮询 → { state, resultUrl, error, meta }
 *
 * 为什么单独一个路由文件而不是塞进 /api/ai：
 *   /api/ai 那批是给平台页面用的业务接口（设计稿、文案），
 *   这里是「给外部编辑器吃的稳定协议」，改动节奏不同，混在一起迟早互相牵连。
 *   另外路径形态（/api/v1）必须和引擎里写死的完全一致，方便独立演进。
 */
import { Router } from 'express';
import multer from 'multer';

import { comfyFromEnv } from '../comfyui/client.js';
import { createTask, getTask, publicTask, taskStats } from '../comfyui/tasks.js';
import { listWorkflows } from '../comfyui/workflows.js';

const router = Router();

/** 参考图只在内存里中转，落盘由任务产物统一负责 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const KNOWN_PROVIDERS = ['comfyui', 'mock'];

function resolveProvider(raw) {
  const provider = String(raw || 'comfyui').toLowerCase();
  if (!KNOWN_PROVIDERS.includes(provider)) {
    throw Object.assign(new Error(`未知 Provider：${provider}（可用：${KNOWN_PROVIDERS.join(', ')}）`), {
      status: 400,
    });
  }
  return provider;
}

/** 提交任务：JSON 与 multipart 共用一段逻辑 */
function submit(req, { image } = {}) {
  const provider = resolveProvider(req.body?.provider);
  const options = (() => {
    const raw = req.body?.options;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  })();

  const task = createTask({
    provider,
    kind: req.body?.kind || options.kind,
    prompt: req.body?.prompt || '',
    // 引擎传的是 provider 抽象，到底跑哪个工作流由 workflowId / presetId 决定
    workflowId: req.body?.workflowId || options.workflowId,
    presetId: req.body?.presetId || options.presetId,
    values: options,
    image,
    // provider=mock 时强制降级，用于无 ComfyUI 环境自测
    client: provider === 'mock' ? comfyFromEnv({ mock: true }) : undefined,
  });

  return { taskId: task.taskId, state: task.state, provider: task.provider };
}

router.get('/health', async (_req, res) => {
  const client = comfyFromEnv();
  const status = await client.health();
  res.json({
    ok: status.ok || client.mock,
    provider: 'comfyui',
    connected: status.ok,
    mock: client.mock || !status.ok,
    baseUrl: status.baseUrl,
    devices: status.devices || [],
    error: status.error || null,
    workflows: Object.keys(listWorkflows()).length,
    tasks: taskStats(),
  });
});

router.post('/generate', (req, res, next) => {
  try {
    res.status(201).json(submit(req));
  } catch (err) {
    next(err);
  }
});

router.post('/generate/form', upload.single('image'), (req, res, next) => {
  try {
    const image = req.file
      ? { buffer: req.file.buffer, filename: req.file.originalname || 'input.png' }
      : null;
    res.status(201).json(submit(req, { image }));
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

/** 工作流清单：编辑器/脚本想换工作流时先查这里 */
router.get('/workflows', (_req, res) => {
  res.json({ workflows: listWorkflows() });
});

export default router;
