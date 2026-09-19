/**
 * API 封装
 *
 * 所有函数使用真实 fetch 调用后端 API。
 * Vite 开发服务器将 /api 代理到后端 localhost:3001。
 */

const API_BASE = '/api';

/**
 * 带超时的 fetch 封装，10 秒超时 + 网络错误友好提示
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
async function apiFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接');
    }
    throw new Error('网络连接失败，后端服务可能未启动');
  }
}

/**
 * 获取所有模板列表
 * GET /api/templates
 * @returns {Promise<Array<{id: string, name: string, description: string, trackingType: string, defaultScale: number, category: string}>>}
 */
export async function fetchTemplates() {
  const res = await apiFetch(`${API_BASE}/templates`);
  if (!res.ok) throw new Error('加载模板失败');
  return res.json();
}

/**
 * 创建 AR 体验
 * POST /api/ar
 * @param {{ modelUrl: string, trackingType: 'image'|'face'|'plane'|'world', scale?: number, title?: string, targetUrl?: string, targetImageUrl?: string }} data
 * @returns {Promise<{ id: string, url: string, qrCode: string, targetUrl?: string }>}
 */
export async function createArExperience(data) {
  const res = await apiFetch(`${API_BASE}/ar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '发布失败' }));
    throw new Error(err.error || '发布失败');
  }
  return res.json();
}

/**
 * 上传目标图片并编译为 .mind 追踪文件
 * POST /api/target/compile (multipart/form-data)
 * @param {File} imageFile  用户选择的图片文件
 * @param {Function} [onProgress]  进度回调 (0–1)
 * @returns {Promise<{ imageUrl: string, targetUrl: string, width: number, height: number }>}
 */
export async function uploadTargetImage(imageFile, onProgress) {
  const formData = new FormData();
  formData.append('image', imageFile);

  // 用 XMLHttpRequest 实现上传进度
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(e.loaded / e.total);
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data.error || '上传编译失败'));
        }
      } catch {
        reject(new Error('服务器返回异常'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('网络错误')));
    xhr.addEventListener('abort', () => reject(new Error('上传已取消')));

    xhr.open('POST', `${API_BASE}/target/compile`);
    xhr.send(formData);
  });
}

/**
 * 获取单个 AR 体验详情
 * GET /api/ar/:id
 * @param {string} id
 * @returns {Promise<{ id: string, modelUrl: string, trackingType: string, config: object, targetUrl: string|null, targetImageUrl: string|null, viewCount: number, createdAt: string }>}
 */
export async function fetchArExperience(id) {
  const res = await apiFetch(`${API_BASE}/ar/${id}`);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('AR 体验不存在');
    }
    // 500 或其他服务器错误 — 尝试读取后端错误消息，否则用通用提示
    const err = await res.json().catch(() => ({ error: '服务器错误，请稍后重试' }));
    throw new Error(err.error || '服务器错误，请稍后重试');
  }
  return res.json();
}

/**
 * 获取当前用户的 AR 体验列表
 * GET /api/ar
 * @returns {Promise<Array<{ id: string, title: string, trackingType: string, viewCount: number, createdAt: string }>>}
 */
export async function fetchMyArExperiences() {
  const res = await apiFetch(`${API_BASE}/ar`);
  if (!res.ok) throw new Error('加载列表失败');
  return res.json();
}

/**
 * 删除 AR 体验
 * DELETE /api/ar/:id
 * @param {string} id
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteArExperience(id) {
  const res = await apiFetch(`${API_BASE}/ar/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '删除失败' }));
    throw new Error(err.error || '删除失败');
  }
  return res.json();
}

/**
 * 上传模型文件（.glb / .gltf）
 * POST /api/models/upload (multipart/form-data)
 * @param {File} modelFile
 * @param {Function} [onProgress]  上传进度回调 (0–1)
 * @returns {Promise<{ url: string, originalName: string, size: number }>}
 */
export async function uploadModel(modelFile, onProgress) {
  const formData = new FormData();
  formData.append('model', modelFile);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(e.loaded / e.total);
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data.error || '上传失败'));
        }
      } catch {
        reject(new Error('服务器返回异常'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('网络错误')));
    xhr.addEventListener('abort', () => reject(new Error('上传已取消')));

    xhr.open('POST', `${API_BASE}/models/upload`);
    xhr.send(formData);
  });
}

/**
 * 获取上传凭证
 * GET /api/upload-token
 * @returns {Promise<{ credentials: object, bucket: string, region: string, key: string }>}
 */
export async function getUploadToken() {
  const res = await apiFetch(`${API_BASE}/upload-token`);
  if (!res.ok) throw new Error('获取上传凭证失败');
  return res.json();
}

/* ------------------------------------------------------------------ ComfyUI */

/**
 * ComfyUI 连接状态 + 工作流/预设清单
 * GET /api/ai/comfy/status
 * @returns {Promise<{connected: boolean, mock: boolean, baseUrl: string, hint: string,
 *   workflows: Array<object>, presets: Array<object>}>}
 */
export async function fetchComfyStatus() {
  const res = await apiFetch(`${API_BASE}/ai/comfy/status`);
  if (!res.ok) throw new Error(`读取 ComfyUI 状态失败：HTTP ${res.status}`);
  return res.json();
}

/**
 * 发起一次生成任务（异步，返回 taskId 后需轮询）
 * POST /api/ai/comfy/run
 * @param {{presetId?: string, workflowId?: string, prompt?: string,
 *   imageBase64?: string, values?: object, mock?: boolean}} payload
 * @returns {Promise<{taskId: string, state: string, provider: string}>}
 */
export async function runComfyWorkflow(payload) {
  const res = await apiFetch(`${API_BASE}/ai/comfy/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `提交生成任务失败：HTTP ${res.status}`);
  return data;
}

/**
 * 轮询生成任务
 * GET /api/ai/comfy/task/:taskId
 * @param {string} taskId
 * @returns {Promise<{state: string, progress: number, message: string,
 *   imageUrl: string|null, resultUrl: string|null, error: string|null}>}
 */
export async function fetchComfyTask(taskId) {
  const res = await apiFetch(`${API_BASE}/ai/comfy/task/${taskId}`);
  if (!res.ok) throw new Error(`查询任务失败：HTTP ${res.status}`);
  return res.json();
}
