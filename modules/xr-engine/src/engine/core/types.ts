/**
 * 引擎核心数据模型。
 *
 * 设计要点：场景图是「纯数据」，不直接持有 THREE.Object3D。
 * 渲染层（R3F）负责把数据树映射成 THREE 对象树，
 * 这样可以安全地做序列化、撤销栈、时间旅行，也便于将来接协同编辑。
 */

export type Vec3Tuple = [number, number, number]
export type Vec2Tuple = [number, number]

export interface Transform {
  position: Vec3Tuple
  /** 欧拉角，单位弧度 */
  rotation: Vec3Tuple
  scale: Vec3Tuple
}

export type NodeType = 'group' | 'mesh' | 'light' | 'model' | 'particle' | 'gaussian-splat'

export type GeometryKind =
  | 'box'
  | 'sphere'
  | 'plane'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'icosahedron'

export type LightKind = 'ambient' | 'directional' | 'point' | 'spot'

export type ParticlePreset = 'fire' | 'smoke' | 'energy' | 'snow'

export interface MaterialProps {
  color: string
  metalness: number
  roughness: number
  emissive: string
  emissiveIntensity: number
  opacity: number
  wireframe: boolean
  flatShading: boolean
  /** 贴图资产 id（AssetDatabase.texture） */
  map?: string | null
  roughnessMap?: string | null
  metalnessMap?: string | null
  normalMap?: string | null
  emissiveMap?: string | null
  aoMap?: string | null
}

export interface GroupProps {
  kind: 'group'
}

/** 刚体配置。optional 字段保证旧项目文件向后兼容（无 physics = 无物理） */
export interface PhysicsProps {
  /** dynamic 受力运动；static 固定不动（地面、墙）；kinematic 预留 */
  body: 'none' | 'dynamic' | 'static'
  /** 千克，仅 dynamic 有效 */
  mass: number
  /** 简化碰撞形状：包围盒够演示用，凸包与球体后续按需加 */
  shape: 'box' | 'sphere'
  /** 弹性 0-1 */
  restitution: number
}

export interface MeshProps {
  kind: 'mesh'
  geometry: GeometryKind
  /** 几何体参数，键由 GeometryKind 决定，如 box 的 width/height/depth */
  geometryParams: Record<string, number>
  material: MaterialProps
  castShadow: boolean
  receiveShadow: boolean
  /** 可选内置 shader 特效：blackhole / energy / dissolve / hologram / shockwave（Web 与微信端同名实现） */
  effect?: string
  /** 自定义 GLSL/ShaderMaterial（Web 端直接使用；微信端需适配为 Effect） */
  customShader?: {
    vertex?: string
    fragment?: string
    uniforms?: Record<string, unknown>
  }
  physics?: PhysicsProps
}

export interface LightProps {
  kind: 'light'
  light: LightKind
  color: string
  intensity: number
  /** point / spot 的衰减距离 */
  distance: number
  /** spot 的锥角，弧度 */
  angle: number
  castShadow: boolean
}

export interface ModelProps {
  kind: 'model'
  /** 指向 AssetDatabase 中的资产 id */
  assetId: string | null
  activeAnimation: string | null
  /** 动画播放速度倍率 */
  animationSpeed?: number
  /** 自动把模型归一化到 1 米基准，父级缩放更容易控制 */
  normalizeModel?: boolean
  castShadow: boolean
  receiveShadow: boolean
}

export interface ParticleProps {
  kind: 'particle'
  preset: ParticlePreset
  count: number
  color: string
  size: number
  speed: number
  spread: Vec3Tuple
  additive: boolean
}

export interface GaussianSplatProps {
  kind: 'gaussian-splat'
  /** 指向 AssetDatabase 中的高斯泼溅资产 id */
  assetId: string | null
  /** 泼溅点整体尺寸倍率（1 = 原始采集尺度） */
  splatScale: number
  /** 透明度低于该值(0-1)的泼溅点被丢弃，清理漂浮噪点 */
  minAlpha: number
}

export type NodeProps =
  | GroupProps
  | MeshProps
  | LightProps
  | ModelProps
  | ParticleProps
  | GaussianSplatProps

export interface SceneNode {
  id: string
  name: string
  type: NodeType
  parentId: string | null
  children: string[]
  transform: Transform
  visible: boolean
  locked: boolean
  props: NodeProps
  /**
   * 行为脚本源码（播放模式运行）。
   * 存字符串而非函数：可序列化、可被 AI 生成。
   * 约定脚本体内 return { onStart, onUpdate, onDestroy }。
   */
  script?: string
}

/** 场景图以扁平表 + 根序列表存储，便于移动节点与 O(1) 查找 */
export interface GraphData {
  nodes: Record<string, SceneNode>
  rootIds: string[]
}

export type EnvPreset =
  | 'studio'
  | 'city'
  | 'sunset'
  | 'warehouse'
  | 'forest'
  | 'apartment'
  | 'dawn'
  | 'night'

export interface EnvironmentConfig {
  preset: EnvPreset
  /** 是否把环境贴图作为背景显示 */
  background: boolean
  /** 环境贴图模糊度，仅背景模式下明显 */
  blur: number
  /** 环境光对整体的强度 */
  intensity: number
  /** 自定义 HDRI/全景资产 id；为空时使用程序化环境 */
  hdriAssetId?: string | null
}

export interface PostFXConfig {
  enabled: boolean
  bloom: {
    enabled: boolean
    intensity: number
    luminanceThreshold: number
    luminanceSmoothing: number
    radius: number
  }
  depthOfField: {
    enabled: boolean
    focusDistance: number
    focalLength: number
    bokehScale: number
  }
  vignette: {
    enabled: boolean
    darkness: number
    offset: number
  }
  chromaticAberration: {
    enabled: boolean
    offset: Vec2Tuple
  }
  noise: {
    enabled: boolean
    opacity: number
  }
  toneMapping: {
    enabled: boolean
    exposure: number
  }
}

export type AssetKind = 'model' | 'texture' | 'hdri' | 'audio' | 'gaussian-splat'
export type AssetSource = 'upload' | 'ai-generated' | 'library'

export interface AssetRecord {
  id: string
  name: string
  kind: AssetKind
  source: AssetSource
  /** blob: URL 或 http(s) URL */
  uri: string
  mimeType: string
  /** 字节大小，未知为 0 */
  size: number
  /** 三角形面数等统计信息 */
  triangles: number
  meta: Record<string, string | number | boolean>
  createdAt: string
}

export interface ProjectFile {
  /** 项目格式版本，用于迁移 */
  version: string
  meta: {
    name: string
    createdAt: string
    updatedAt: string
  }
  graph: GraphData
  environment: EnvironmentConfig
  postfx: PostFXConfig
  assets: AssetRecord[]
  /** AI 建模服务的连接配置 */
  ai3d: {
    backendUrl: string
    preferredProvider: string
  }
}

export const PROJECT_VERSION = '0.1.0'
