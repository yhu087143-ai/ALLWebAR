export type GenerationKind = 'text-to-3d' | 'image-to-3d'

export type TaskState = 'queued' | 'running' | 'succeeded' | 'failed'

export interface ProviderInfo {
  id: string
  name: string
  /** local = 跑在本机 GPU 上；cloud = 转发到第三方 API */
  kind: 'local' | 'cloud'
  description: string
  supportsText: boolean
  supportsImage: boolean
  /** 单次生成的大致耗时描述，仅用于 UI 提示 */
  eta: string
}

export interface GenerateRequest {
  providerId: string
  kind: GenerationKind
  prompt?: string
  image?: Blob
  /** 传给具体后端的扩展参数，如面数上限、纹理分辨率 */
  options?: Record<string, string | number | boolean>
}

export interface TaskStatus {
  taskId: string
  state: TaskState
  /** 0 ~ 1 */
  progress: number
  stage: string
  error?: string
  /** 成功时给出可直接下载的资产地址 */
  resultUrl?: string
  meta?: Record<string, string | number>
}

export interface GenerateResult {
  /** GLB 二进制 */
  data: ArrayBuffer
  meta: Record<string, string | number>
}

export type ProgressCallback = (status: TaskStatus) => void

export interface IModelProvider {
  readonly info: ProviderInfo
  /** 探测后端是否可用 */
  health(): Promise<boolean>
  generate(request: GenerateRequest, onProgress?: ProgressCallback): Promise<GenerateResult>
}

export const PROVIDER_CATALOG: ProviderInfo[] = [
  {
    id: 'instantmesh',
    name: 'InstantMesh（本地）',
    kind: 'local',
    description: '本机 GPU 多视图重建，8GB 显存下约 10-20 秒出网格，无贴图',
    supportsText: false,
    supportsImage: true,
    eta: '10-20 秒',
  },
  {
    id: 'triposr',
    name: 'TripoSR（本地）',
    kind: 'local',
    description: '本机 GPU 单图快速重建，秒级出结果，细节弱于 InstantMesh',
    supportsText: false,
    supportsImage: true,
    eta: '约 1 秒',
  },
  {
    id: 'tripo',
    name: 'Tripo3D（云端）',
    kind: 'cloud',
    description: '云端高质量生成，自带 PBR 贴图，按次计费',
    supportsText: true,
    supportsImage: true,
    eta: '30-60 秒',
  },
  {
    id: 'comfyui',
    name: 'ComfyUI（自建/云端）',
    kind: 'local',
    description: '通过后端封装 ComfyUI 工作流，可生成模型/贴图/动作/材质',
    supportsText: true,
    supportsImage: true,
    eta: '取决于工作流',
  },
  {
    id: 'mock',
    name: '内置演示（离线）',
    kind: 'local',
    description: '无需后端，生成程序化几何体用于验证流水线',
    supportsText: true,
    supportsImage: false,
    eta: '即时',
  },
]

export const findProviderInfo = (id: string): ProviderInfo =>
  PROVIDER_CATALOG.find((p) => p.id === id) ?? PROVIDER_CATALOG[PROVIDER_CATALOG.length - 1]
