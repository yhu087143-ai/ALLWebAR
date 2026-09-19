/**
 * XR引擎 → AR 平台发布桥
 *
 * 作用：把当前编辑的场景烘焙成 GLB，推到 ar-platform 的后端，换回一条可在手机浏览器
 * 直接打开的 AR 体验链接（/view/:id）与二维码。
 *
 * 为什么走 iframe + 相对路径请求而不是跨域直连：
 *   ar-platform 的前端把 /api 与 /xr-studio-app 一起做了反代，因此嵌入时本页与宿主同源，
 *   直接 fetch('/api/models/upload') 就能命中后端，不需要 CORS、不需要 appKey。
 *   独立运行（不在 iframe 里）时才需要 ?api=http://host:3001 指定后端。
 *
 * 宿主需要在 iframe 的 src 上带两个查询参数：
 *   ?host=<宿主 origin>   用于 postMessage 定向投递（必填，否则不发消息）
 *   ?api=<后端 origin>    独立运行时才需要；嵌入时留空走同源
 */
import { engine } from '@/editor/store'

/** 追踪方式：与 ar-platform 后端 POST /api/ar 的 trackingType 取值一致 */
export type XRTrackingType = 'image' | 'face'

/**
 * 程序化动效配置。
 *
 * 结构必须与 ar-engine 的 `MotionConfig`（ar-engine/src/animation/MotionController.ts）一致。
 * 两个仓库不共享类型定义，所以这里是**结构化声明** —— 改任何一侧都要同步另一侧。
 */
export interface MotionConfig {
  /** 绕轴自转，speed 为「度/秒」，负值反向 */
  spin?: { axis?: 'x' | 'y' | 'z'; speed: number }
  /** 上下悬浮：amplitude 米，period 秒一个来回 */
  float?: { amplitude: number; period: number }
  /** 缩放脉冲：在 1 上下摆动 ±amplitude，period 秒一个周期 */
  pulse?: { amplitude: number; period: number }
  /** 进场方式 */
  entrance?: 'none' | 'scale' | 'rise'
  entranceDuration?: number
}

export interface PublishOptions {
  title: string
  trackingType: XRTrackingType
  /** 图片追踪必填：触发图，后端会编译成 .mind */
  targetImage?: File | null
  /** 物体相对识别图的位移（米）→ 后端 config.positionOffset */
  positionOffset?: { x: number; y: number; z: number }
  /** 整体缩放倍数 → 后端 config.scale */
  scale?: number
  /**
   * 程序化动效 → 后端 animationConfig.motion。
   * 后端把 animationConfig 整体透传（不校验内部字段），所以加动效**不需要改后端**。
   */
  motion?: MotionConfig
}

export interface PublishResult {
  id: string
  /** 站内相对路径，如 /view/abc123 */
  url: string
  /** 完整可访问地址（后端已把 localhost 换成局域网 IP） */
  fullUrl: string
  /** 二维码 dataURL */
  qrCode: string
  modelUrl: string
  targetUrl: string | null
}

const HOST_ORIGIN_PARAM = 'host'
const API_PARAM = 'api'

function query(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name)
  } catch {
    return null
  }
}

/** 宿主 origin；由宿主在 iframe src 上注入，缺失则不发送任何 postMessage */
export function hostOrigin(): string | null {
  const value = query(HOST_ORIGIN_PARAM)
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/** 是否运行在 iframe 内（跨源访问 window.top 会抛错，捕获即视为嵌入） */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/**
 * 后端基址。
 * 嵌入时返回空串 —— 走宿主同源代理，这是默认且唯一不需要配置的路径。
 */
export function apiBase(): string {
  return (query(API_PARAM) ?? '').replace(/\/+$/, '')
}

/** 是否具备发布条件：嵌入宿主，或显式指定了后端地址 */
export function canPublish(): boolean {
  return isEmbedded() || apiBase() !== ''
}

function post(type: string, payload?: unknown): void {
  const origin = hostOrigin()
  if (!origin) return
  try {
    window.parent.postMessage({ source: 'xr-engine', type, payload }, origin)
  } catch {
    /* 宿主已关闭时静默忽略 */
  }
}

export function announceReady(): void {
  post('xr:ready', {
    embedded: isEmbedded(),
    apiBase: apiBase(),
    projectName: engine.projectName,
    canPublish: canPublish(),
  })
}

function announceProgress(text: string): void {
  post('xr:publish:progress', { text })
}

function announceDone(result: PublishResult): void {
  post('xr:publish:done', result)
}

function announceError(message: string): void {
  post('xr:publish:error', { message })
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    if (data?.error) return data.error
  } catch {
    /* 非 JSON 响应体，退回状态码 */
  }
  return `HTTP ${res.status}`
}

/** 文件名里不能出现 Windows/URL 非法字符，否则 multer 取扩展名会失败 */
function safeFileName(name: string, ext: string): string {
  const stem = (name || 'scene').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60)
  return `${stem}${ext}`
}

/** 动效配置里是否真的有内容 —— 全空时不下发，免得后端存一个空对象 */
function hasMotion(motion?: MotionConfig): boolean {
  if (!motion) return false
  return Boolean(
    motion.spin?.speed ||
      motion.float?.amplitude ||
      motion.pulse?.amplitude ||
      (motion.entrance && motion.entrance !== 'none')
  )
}

/**
 * 执行发布。任一步失败都抛错，调用方负责 toast 与错误上报。
 * 全过程通过 postMessage 向宿主汇报进度，宿主可据此显示进度条。
 */
export async function publishToPlatform(options: PublishOptions): Promise<PublishResult> {
  if (!engine.getScene()) {
    throw new Error('视口尚未就绪，无法导出场景')
  }
  const base = apiBase()

  announceProgress('正在烘焙场景为 GLB…')
  const glb = await engine.exportGLB()

  announceProgress(`正在上传模型（${(glb.size / 1024 / 1024).toFixed(1)} MB）…`)
  const modelForm = new FormData()
  modelForm.append('model', glb, safeFileName(engine.projectName, '.glb'))
  const modelRes = await fetch(`${base}/api/models/upload`, { method: 'POST', body: modelForm })
  if (!modelRes.ok) {
    throw new Error(`模型上传失败：${await readError(modelRes)}`)
  }
  const modelJson = (await modelRes.json()) as { url: string }

  let targetUrl: string | null = null
  if (options.trackingType === 'image') {
    if (!options.targetImage) {
      throw new Error('图片追踪必须先选择一张触发图')
    }
    announceProgress('正在编译触发图（生成 .mind）…')
    const targetForm = new FormData()
    targetForm.append('image', options.targetImage, options.targetImage.name)
    const targetRes = await fetch(`${base}/api/target/compile`, {
      method: 'POST',
      body: targetForm,
    })
    if (!targetRes.ok) {
      throw new Error(`触发图编译失败：${await readError(targetRes)}`)
    }
    const targetJson = (await targetRes.json()) as { targetUrl: string }
    targetUrl = targetJson.targetUrl
  }

  announceProgress('正在创建 AR 体验…')
  const arRes = await fetch(`${base}/api/ar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: options.title,
      modelUrl: modelJson.url,
      trackingType: options.trackingType,
      targetUrl: targetUrl ?? undefined,
      // 「AR 展示」三件套：相对识别图的位移、整体缩放、程序化动效。
      // 三者都是后端 POST /api/ar 已支持的既有字段，所以这层不需要后端配合。
      positionOffset: options.positionOffset,
      scale: options.scale,
      animationConfig: hasMotion(options.motion)
        ? { enabled: true, motion: options.motion }
        : undefined,
      // 标记来源，便于后端/控制台区分是编辑器直出还是手动创建的体验
      engine: 'xr-engine',
      publicOrigin: window.location.origin,
    }),
  })
  if (!arRes.ok) {
    throw new Error(`创建 AR 体验失败：${await readError(arRes)}`)
  }
  const arJson = (await arRes.json()) as Partial<PublishResult> & { id: string }

  /*
   * 后端 201 响应体里不含 modelUrl（它只在请求里上传，不回流），
   * 也不能保证 targetUrl 一定回显。这里用本地已知值补齐成完整结构 ——
   * 上层可以直接解构，不必到处写可选链。
   */
  const result: PublishResult = {
    id: arJson.id,
    url: arJson.url ?? `/view/${arJson.id}`,
    fullUrl: arJson.fullUrl ?? '',
    qrCode: arJson.qrCode ?? '',
    modelUrl: modelJson.url,
    targetUrl,
  }

  announceDone(result)
  return result
}

/** 统一封装：成功/失败都回一次宿主，调用方只需给 toast 文案 */
export async function publishWithReport(
  options: PublishOptions
): Promise<{ ok: true; result: PublishResult } | { ok: false; message: string }> {
  try {
    const result = await publishToPlatform(options)
    return { ok: true, result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    announceError(message)
    return { ok: false, message }
  }
}
