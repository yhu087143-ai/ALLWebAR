/**
 * 生成任务注册表 + 执行器。
 *
 * 为什么必须是「任务」而不是「一次请求」：
 *   ComfyUI 提交后只给 prompt_id，产物要轮询 /history 才有；扩散模型一张图动辄几十秒，
 *   挂在一次 HTTP 请求里既容易超时，也没法给前端进度。
 *   所以这里统一成 created → running(progress) → succeeded/failed，前端轮询同一个 id。
 *
 * 任务存在内存里：这套东西是本地创作工具，重启丢任务可以接受；
 * 换多实例部署时把这里换成 Redis/DB 即可（接口形状不用变）。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { comfyFromEnv } from './client.js';
import { findPreset, findWorkflow, renderWorkflow } from './workflows.js';
import { imageToGlb, pngSize } from './glb.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(here, '..', '..', 'public', 'uploads');

const POLL_INTERVAL_MS = 1500;
const TASK_TIMEOUT_MS = 5 * 60 * 1000;
const TASK_TTL_MS = 60 * 60 * 1000;

/** @type {Map<string, object>} */
const tasks = new Map();

function touch(task, patch) {
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  return task;
}

/** 清理过期任务，避免长时间运行时内存无限增长 */
function sweep() {
  const now = Date.now();
  for (const [id, task] of tasks) {
    const updated = Date.parse(task.updatedAt);
    if (Number.isFinite(updated) && now - updated > TASK_TTL_MS) tasks.delete(id);
  }
}

export function getTask(id) {
  sweep();
  return tasks.get(id) || null;
}

/** 对外暴露的任务快照（去掉内部字段） */
export function publicTask(task) {
  if (!task) return null;
  return {
    taskId: task.id,
    state: task.state,
    progress: task.progress,
    message: task.message,
    provider: task.provider,
    workflowId: task.workflowId,
    kind: task.kind,
    // resultUrl 给 XR 引擎用（它按 GLB 解析），imageUrl/assets 给平台 UI 用
    resultUrl: task.resultUrl || null,
    imageUrl: task.imageUrl || null,
    assets: task.assets || [],
    meta: task.meta || {},
    error: task.error || null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function friendlyError(err, client) {
  const raw = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|timed out|TimeoutError/i.test(raw)) {
    return `连不上 ComfyUI（${client.baseUrl}）：${raw}。请先启动 ComfyUI，或在 backend/.env 里设 COMFYUI_MOCK=1 用降级产物验证流程。`;
  }
  return raw;
}

/**
 * 创建并启动一个生成任务。
 * @param {{
 *   workflowId?: string, presetId?: string, provider?: string, kind?: string,
 *   prompt?: string, image?: {buffer: Buffer, filename?: string},
 *   values?: Record<string, unknown>, client?: import('./client.js').ComfyClient,
 * }} input
 */
export function createTask(input = {}) {
  const preset = input.presetId ? findPreset(input.presetId) : null;
  const workflowId = input.workflowId || preset?.workflowId || 'sdxl-texture';
  const workflow = findWorkflow(workflowId);
  if (!workflow) throw new Error(`未知工作流：${workflowId}`);

  const client = input.client || comfyFromEnv();
  const id = crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();

  const task = {
    id,
    provider: input.provider || (client.mock ? 'comfyui-mock' : 'comfyui'),
    workflowId,
    presetId: preset?.id || null,
    kind: input.kind || workflow.kind,
    prompt: input.prompt || '',
    state: 'queued',
    progress: 0,
    message: '已排队',
    resultUrl: null,
    imageUrl: null,
    assets: [],
    meta: {},
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  tasks.set(id, task);

  // 立刻返回任务号，执行放到后台；状态通过轮询读取
  run(task, client, { ...input, workflowId }).catch((err) => {
    touch(task, {
      state: 'failed',
      message: '生成失败',
      error: friendlyError(err, client),
    });
  });

  return publicTask(task);
}

async function run(task, client, input) {
  const seed = Number(input.values?.seed ?? Math.floor(Math.random() * 1_000_000));
  touch(task, { state: 'running', progress: 0.05, message: '准备工作流' });

  let referenceImage = null;
  if (input.image?.buffer?.length) {
    if (client.mock) {
      referenceImage = 'mock-input.png';
    } else {
      touch(task, { progress: 0.15, message: '上传参考图到 ComfyUI' });
      referenceImage = await client.uploadImage(input.image.buffer, input.image.filename || 'input.png');
    }
  }

  const { graph, resolved } = renderWorkflow(input.workflowId, {
    prompt: input.prompt,
    negative: input.values?.negative,
    seed,
    image: referenceImage || undefined,
    width: input.values?.width,
    height: input.values?.height,
    steps: input.values?.steps,
    denoise: input.values?.denoise,
    ckpt: input.values?.ckpt,
  });

  touch(task, {
    progress: 0.25,
    message: client.mock ? '降级模式：本地合成产物' : '已提交 ComfyUI，等待出图',
    meta: { seed, mock: client.mock, resolved: { ...resolved, image: resolved.image || null } },
  });

  let png;
  let nodeId = null;

  if (client.mock) {
    await new Promise((r) => setTimeout(r, client.mockLatencyMs));
    png = client.mockOutput({ seed, size: Number(input.values?.width) || 512 });
  } else {
    const promptId = await client.queue(graph);
    task.meta.promptId = promptId;
    const started = Date.now();

    for (;;) {
      if (Date.now() - started > TASK_TIMEOUT_MS) {
        await client.interrupt();
        throw new Error('ComfyUI 执行超时（5 分钟）');
      }
      const status = await client.poll(promptId);
      const elapsed = (Date.now() - started) / TASK_TIMEOUT_MS;
      touch(task, {
        progress: Math.min(0.85, 0.3 + elapsed * 3),
        message: `ComfyUI 生成中（${Math.round((Date.now() - started) / 1000)}s）`,
      });

      if (status.state === 'failed') throw new Error(status.error || 'ComfyUI 执行失败');
      if (status.state === 'succeeded') {
        const first = status.files.find((f) => f.kind === 'image');
        if (!first) throw new Error('ComfyUI 执行完成但没有图片产物（检查工作流是否包含 SaveImage）');
        nodeId = first.nodeId;
        png = await client.fetchOutput(first);
        break;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  touch(task, { progress: 0.9, message: '保存产物' });

  await mkdir(UPLOAD_DIR, { recursive: true });
  const stem = `comfy_${task.id}`;
  const pngName = `${stem}.png`;
  const glbName = `${stem}.glb`;
  await writeFile(path.join(UPLOAD_DIR, pngName), png);

  const size = pngSize(png) || {};
  const glb = imageToGlb(png, { ...size, name: task.prompt?.slice(0, 40) || 'ComfyUI 产物' });
  await writeFile(path.join(UPLOAD_DIR, glbName), glb);

  touch(task, {
    state: 'succeeded',
    progress: 1,
    message: '完成',
    imageUrl: `/uploads/${pngName}`,
    resultUrl: `/uploads/${glbName}`,
    assets: [
      { url: `/uploads/${pngName}`, kind: 'image', nodeId, width: size.width, height: size.height },
      { url: `/uploads/${glbName}`, kind: 'model', nodeId, bytes: glb.length },
    ],
    meta: { ...task.meta, width: size.width, height: size.height },
  });

  return publicTask(task);
}

/** 测试与运维用：当前任务概览 */
export function taskStats() {
  const list = [...tasks.values()];
  return {
    total: list.length,
    running: list.filter((t) => t.state === 'running' || t.state === 'queued').length,
    succeeded: list.filter((t) => t.state === 'succeeded').length,
    failed: list.filter((t) => t.state === 'failed').length,
  };
}
