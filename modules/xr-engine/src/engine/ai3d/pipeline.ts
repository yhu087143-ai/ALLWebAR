import type { AssetDatabase } from '../assets/AssetDatabase'
import { optimizeGLB } from '../assets/optimizer'
import type { EventBus } from '../core/EventBus'
import type { EngineEvents } from '../core/events'
import type { AssetRecord } from '../core/types'
import { MockModelProvider, RemoteModelProvider } from './providers'
import {
  type GenerateRequest,
  type IModelProvider,
  type ProgressCallback,
  type ProviderInfo,
  PROVIDER_CATALOG,
} from './types'

/**
 * AI 建模编排：生成 -> 优化 -> 入库。
 *
 * 生成出来的原始网格普遍面数过高、UV 混乱，直接进引擎会把帧率拖垮，
 * 所以优化不是可选项，是流水线的固定一环。
 */
/**
 * AI 服务默认地址。
 *
 * 被 ar-platform 创作台以 iframe 嵌入时，后端就在宿主同源上（它提供了 /api/v1），
 * 此时必须走宿主 origin —— 固定指向 127.0.0.1:8787 在嵌入场景下必然连不上，
 * 而 AI 面板里的「服务地址」用户不一定知道该填什么。
 * 独立运行（npm run dev）时保持原来的本地 8787，兼容既有的独立后端。
 */
function defaultAiBackend(): string {
  const fromEnv = import.meta.env?.VITE_AI_BACKEND as string | undefined
  if (fromEnv) return fromEnv
  try {
    if (window.self !== window.top) return window.location.origin
  } catch {
    // 跨源访问 window.top 抛错 => 处于 iframe 内，同样按同源宿主处理
    return window.location.origin
  }
  return 'http://127.0.0.1:8787'
}

export class ModelPipeline {
  private cache = new Map<string, IModelProvider>()

  constructor(
    private readonly bus: EventBus<EngineEvents>,
    private readonly assets: AssetDatabase,
    private backendUrl = defaultAiBackend()
  ) {}

  setBackendUrl(url: string): void {
    this.backendUrl = url
    this.cache.clear()
  }

  getBackendUrl(): string {
    return this.backendUrl
  }

  listProviders(): ProviderInfo[] {
    return PROVIDER_CATALOG
  }

  getProvider(id: string): IModelProvider {
    const cached = this.cache.get(id)
    if (cached) return cached
    const provider: IModelProvider =
      id === 'mock' ? new MockModelProvider() : new RemoteModelProvider(this.backendUrl, id)
    this.cache.set(id, provider)
    return provider
  }

  async checkHealth(id: string): Promise<boolean> {
    try {
      return await this.getProvider(id).health()
    } catch {
      return false
    }
  }

  async generate(request: GenerateRequest, onProgress?: ProgressCallback): Promise<AssetRecord> {
    const provider = this.getProvider(request.providerId)

    const onPhase: ProgressCallback = (status) => {
      onProgress?.(status)
      this.bus.emit('ai3d:progress', {
        taskId: status.taskId,
        progress: status.progress * 0.85,
        stage: status.stage,
      })
    }

    const raw = await provider.generate(request, onPhase)

    this.bus.emit('ai3d:progress', { taskId: 'pipeline', progress: 0.88, stage: '优化网格' })
    let data: Uint8Array<ArrayBufferLike> = new Uint8Array(raw.data)
    let optimized = false
    try {
      const result = await optimizeGLB(data)
      data = result.data
      optimized = true
    } catch (err) {
      console.warn('[ModelPipeline] 优化失败，使用原始网格', err)
    }

    this.bus.emit('ai3d:progress', { taskId: 'pipeline', progress: 0.96, stage: '入库' })

    const name = request.prompt
      ? `${request.prompt.slice(0, 18)}`
      : `AI 模型 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`

    const blob = new Blob([data as unknown as BlobPart], { type: 'model/gltf-binary' })
    const record = this.assets.add({
      name: `${name}.glb`,
      kind: 'model',
      source: 'ai-generated',
      uri: URL.createObjectURL(blob),
      mimeType: 'model/gltf-binary',
      size: data.byteLength,
      meta: {
        provider: request.providerId,
        optimized,
        ...(raw.meta ?? {}),
      },
    }, blob)

    this.bus.emit('ai3d:progress', { taskId: 'pipeline', progress: 1, stage: '完成' })
    return record
  }
}
