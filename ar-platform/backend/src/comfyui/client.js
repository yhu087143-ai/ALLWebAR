/**
 * ComfyUI 客户端。
 *
 * 对接的是 ComfyUI 原生 HTTP API（不是某个二次封装）：
 *   GET  /system_stats                 探活
 *   POST /prompt {prompt, client_id}   提交工作流（API 格式图）
 *   GET  /history/{prompt_id}          查执行结果
 *   GET  /view?filename=…              取产物字节
 *   POST /interrupt                    中断
 *
 * 两条硬约束决定了这里的写法：
 *   1. ComfyUI 是异步的：/prompt 只回 prompt_id，产物要轮询 /history 才有，
 *      所以上层必须是「任务」模型（见 tasks.js），不能同步等一个响应。
 *   2. 产物默认落在 ComfyUI 自己的 output/ 目录，浏览器拿不到；必须由后端
 *      下载下来存进 public/uploads，再给前端一个同源 URL（否则跨机部署必挂）。
 */
import { makeGradientPng } from './png.js';

const DEFAULT_TIMEOUT_MS = 15000;
const MOCK_LATENCY_MS = 900;

export class ComfyClient {
  /**
   * @param {{baseUrl?: string, mock?: boolean, clientId?: string}} options
   */
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || 'http://127.0.0.1:8188').replace(/\/+$/, '');
    this.mock = Boolean(options.mock);
    this.clientId = options.clientId || `ar-platform-${Math.random().toString(36).slice(2, 10)}`;
  }

  /** 探活：ComfyUI 没起来时 3 秒内失败，不要让 UI 干等 */
  async health() {
    if (this.mock) return { ok: true, mock: true, baseUrl: this.baseUrl };
    try {
      const res = await fetch(`${this.baseUrl}/system_stats`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return { ok: false, mock: false, baseUrl: this.baseUrl, error: `HTTP ${res.status}` };
      const stats = await res.json().catch(() => null);
      return {
        ok: true,
        mock: false,
        baseUrl: this.baseUrl,
        devices: stats?.devices?.map?.((d) => d.name).filter(Boolean) ?? [],
      };
    } catch (err) {
      return {
        ok: false,
        mock: false,
        baseUrl: this.baseUrl,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** 提交工作流，返回 prompt_id */
  async queue(promptGraph) {
    const res = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptGraph, client_id: this.clientId }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ComfyUI 拒绝工作流：HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    if (!data?.prompt_id) throw new Error('ComfyUI 未返回 prompt_id');
    if (data.node_errors && Object.keys(data.node_errors).length) {
      throw new Error(`工作流节点参数有误：${JSON.stringify(data.node_errors).slice(0, 300)}`);
    }
    return data.prompt_id;
  }

  /** 查一次执行状态（未完成时返回 running） */
  async poll(promptId) {
    const res = await fetch(`${this.baseUrl}/history/${promptId}`, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`查询任务失败：HTTP ${res.status}`);
    const data = await res.json();
    const entry = data?.[promptId];
    if (!entry) return { state: 'running', files: [] };

    const status = entry.status || {};
    const files = [];
    for (const [nodeId, output] of Object.entries(entry.outputs || {})) {
      for (const img of output.images || []) {
        files.push({ nodeId, kind: 'image', ...img });
      }
      // 部分工作流（SaveImage 之外）会输出其他类型，这里一并收集
      for (const key of ['gifs', 'videos', 'audio', 'latents']) {
        for (const item of output[key] || []) files.push({ nodeId, kind: key, ...item });
      }
    }

    if (status.status_str === 'error') {
      const message = (status.messages || [])
        .map((m) => (Array.isArray(m) ? m.join(' ') : String(m)))
        .join('；');
      return { state: 'failed', files, error: message || 'ComfyUI 执行失败' };
    }
    if (status.completed === true || status.status_str === 'success') {
      return { state: 'succeeded', files };
    }
    return { state: 'running', files };
  }

  /** 下载产物字节 */
  async fetchOutput(file) {
    const params = new URLSearchParams({
      filename: file.filename,
      subfolder: file.subfolder || '',
      type: file.type || 'output',
    });
    const res = await fetch(`${this.baseUrl}/view?${params.toString()}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`下载产物失败：HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * 上传参考图到 ComfyUI。
   * LoadImage 节点只认 ComfyUI 自己 input/ 目录里的文件名，
   * 所以图生图类工作流必须先把图传过去，再把返回的 name 填进 {{image}}。
   * @returns {Promise<string>} 可直接写进 LoadImage 的 image 值
   */
  async uploadImage(buffer, filename = 'input.png', subfolder = 'ar-platform') {
    const form = new FormData();
    form.append('image', new Blob([buffer], { type: 'image/png' }), filename);
    form.append('overwrite', 'true');
    if (subfolder) form.append('subfolder', subfolder);

    const res = await fetch(`${this.baseUrl}/upload/image`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`上传参考图到 ComfyUI 失败：HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.name) throw new Error('ComfyUI 未返回上传后的文件名');
    return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
  }

  async interrupt() {
    try {
      await fetch(`${this.baseUrl}/interrupt`, { method: 'POST', signal: AbortSignal.timeout(3000) });
    } catch {
      /* 中断是尽力而为：ComfyUI 已经挂掉时忽略 */
    }
  }

  /**
   * 未接入真机时的降级产物。
   * 只在显式开启 mock 时调用 —— 静默伪造成功会让人误以为 ComfyUI 已经接通。
   */
  mockOutput({ seed = 1, size = 512 } = {}) {
    return makeGradientPng(size, seed);
  }

  get mockLatencyMs() {
    return MOCK_LATENCY_MS;
  }
}

/**
 * 由环境变量构造客户端（供路由复用，避免每处都读一遍 env）。
 * @param {{baseUrl?: string, mock?: boolean}} [override] 单次请求的覆盖值（例如按钮上的「降级演示」）
 */
export function comfyFromEnv(override = {}) {
  const baseUrl = override.baseUrl || process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188';
  const envMock = ['1', 'true', 'on', 'yes'].includes(String(process.env.COMFYUI_MOCK || '').toLowerCase());
  const mock = override.mock === undefined ? envMock : Boolean(override.mock);
  return new ComfyClient({ baseUrl, mock });
}
