import { EngineType, CapabilityType } from './enums'

/**
 * 统一 AR 配置格式 — 顶层配置
 * 既是编辑器输出的格式，也是引擎消费的格式，也是 AI 生成的格式。
 * 向后兼容：所有新字段均为 optional，旧配置不传则使用默认行为。
 */
export interface UnifiedARConfig {
  /** 引擎类型 */
  engine: EngineType | 'auto'

  /** 能力模块列表（多选追踪类型） */
  capabilities: CapabilityModuleConfig[]

  /** 单模型配置（向后兼容，新建项目建议使用 entities） */
  model?: ModelConfig

  /** 视频 URL（向后兼容，新建项目建议使用 entities） */
  videoUrl?: string

  /** 8th Wall 配置 */
  eightWall?: EightWallAppConfig

  /** 追踪参数调优 */
  tracking?: TrackingTuning

  // ===== 新增 Phase 1 字段 =====

  /** 项目元信息 */
  meta?: ProjectMeta

  /** 多实体列表（替代单 model/videoUrl） */
  entities?: AREntity[]

  /** 交互规则列表（事件-动作系统） */
  interactions?: InteractionRule[]

  /** 统一体验配置（Phase 3 新增） */
  experience?: ARExperience

  /** 游戏配置 */
  /** @deprecated 使用 experience 替代 */
  game?: GameConfig

  /** 导览配置 */
  /** @deprecated 使用 experience 替代 */
  guide?: GuideRoute

  /** 定位配置 */
  positioning?: PositioningConfig

  /** UI 层配置 */
  ui?: UILayerConfig[]
}

/** 项目元信息 */
export interface ProjectMeta {
  title: string
  description?: string
  author?: string
  password?: string
}

/** AR 场景中的单一内容实体 */
export interface AREntity {
  id: string
  type: 'model' | 'video' | 'image' | 'text' | 'particle'
  src?: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
  visible?: boolean
  animation?: {
    clips: string[]
    autoPlay?: string
  }
  /** 实体行为（塔防/策略用：自动生产、自动攻击、巡逻等） */
  behavior?: EntityBehavior
}

/** 交互规则：当触发器 → 执行动作 */
export interface InteractionRule {
  trigger: 'onTap' | 'onProximityEnter' | 'onProximityLeave'
        | 'onCollect' | 'onTimerTick' | 'onTimerEnd'
        | 'onScoreReach' | 'onTrackingFound' | 'onTrackingLost'
        | 'onBlink' | 'onMouthOpen' | 'onMouthClose'
  action: 'playAnimation' | 'stopAnimation' | 'playSound'
        | 'addScore' | 'spawnItem' | 'removeItem'
        | 'showEffect' | 'showMessage' | 'triggerVibrate' | 'link'
  params: Record<string, any>
  target?: string
}

/** 游戏配置 */
export interface GameConfig {
  enabled: boolean
  type: 'scavenger' | 'target' | 'stamp'
  duration: number
  itemCount: number
  scorePerItem: number
  comboEnabled: boolean
  spawnInterval: number
  maxVisible: number
  itemModelUrl: string
  effectOnCollect: string
  soundOnCollect: string
  completeMessage: string

  // ===== AI 游戏逻辑（新增） =====

  /** 条件-动作规则列表（由 AI 生成或手动配置） */
  rules?: GameLogicRule[]
  /** HUD 显示控制 */
  hud?: {
    showScore: boolean
    showTimer: boolean
    showCombo: boolean
    scorePosition?: string
  }
  /** 游戏结束条件 */
  endCondition?: 'timer' | 'collect_all' | 'score_reach'
  /** score_reach 模式的目标分数 */
  endScore?: number
  /** 完成后的行为 */
  onComplete?: {
    action: 'show_score' | 'link' | 'show_message' | 'restart'
    message?: string
    linkUrl?: string
  }
  /** 物品外观配置（AI 生成描述） */
  itemAppearance?: {
    prompt: string
    style: string
    scale: number
    glowColor?: string
  }
  /** 音效配置 */
  sounds?: {
    onCollect?: string
    onTimerWarning?: string
    onComplete?: string
    onCombo?: string
  }
}

/**
 * AI 游戏逻辑规则
 * condition → action 的条件-动作对
 */
export interface GameLogicRule {
  id: string
  description: string
  condition: GameCondition
  action: GameAction
  label?: string
  enabled: boolean
}

export type GameCondition =
  | { type: 'score_reach'; value: number }
  | { type: 'timer_remaining'; value: number; operator: 'less_than' | 'greater_than' }
  | { type: 'items_collected'; value: number; operator: 'exact' | 'at_least' }
  | { type: 'combo_count'; value: number; operator: 'at_least' }

export type GameAction =
  | { type: 'spawn_bonus_item'; modelUrl?: string; count?: number }
  | { type: 'speed_boost'; multiplier: number; duration: number }
  | { type: 'slow_down'; multiplier: number; duration: number }
  | { type: 'show_message'; text: string }
  | { type: 'play_effect'; effect: 'screen_shake' | 'flash' | 'confetti' }
  | { type: 'double_score'; duration: number }
  | { type: 'remove_all_items' }

// ===== 统一 AR 体验类型 (Phase 3) =====

/**
 * ARExperience — 统一 AR 体验配置
 * 替代 GameConfig + GuideRoute 的分离设计，将游戏机制和导览机制作为可选能力模块。
 * 核心是 rules[] 统一规则引擎，支持任意条件→任意动作。
 */
export interface ARExperience {
  id: string
  /** 自由字符串类型 — 不限任何枚举，用户可任意命名 */
  type: string
  meta: {
    title: string
    description?: string
    version: string
  }
  world: {
    engine: EngineType | 'auto'
    tracking: 'image' | 'face' | 'plane' | 'world'
    capabilities: CapabilityModuleConfig[]
    targetUrl?: string
  }
  entities?: AREntity[]

  /** 游戏机制（可选） */
  mechanics?: {
    scoring: { enabled: boolean; initial: number }
    timer: { enabled: boolean; duration: number; countdown: boolean }
    items: { total: number; spawnInterval: number; maxVisible: number }
    combo: { enabled: boolean; multiplier: number }
    lives?: { total: number; onZero: string }
    /** 网格放置系统（塔防/策略游戏用） */
    grid?: GridConfig
    /** 波次管理系统（僵尸/敌人波次） */
    waves?: WaveConfig
  }

  /** 导览机制（可选） */
  navigation?: {
    pois: UnifiedPOI[]
    positionProvider: 'gps' | 'ble' | 'vps' | 'manual'
    autoAdvance: boolean
    allowSkip: boolean
    completion: { action: string; message: string }
  }

  /** 统一规则引擎 */
  rules: UnifiedRule[]

  /** UI 配置（含组件列表和主题） */
  hud: HUDConfig

  /** 视觉主题快捷方式（如有设置，覆盖 hud.theme） */
  theme?: UITheme
}

/** 统一 POI（合并原 POI 接口，添加导航专用字段） */
export interface UnifiedPOI {
  id: string
  name: string
  description: string
  position: POIPosition
  triggerRadius: number
  modelUrl?: string
  imageUrl?: string
  audioUrl?: string
  autoTrigger: boolean
  onEnter?: POIAction
  onExit?: POIAction
  order: number
  estimatedDuration?: number
  /** 到达此 POI 时自动执行的动作规则 ID 列表 */
  onEnterRules?: string[]
  /** 离开此 POI 时自动执行的动作规则 ID 列表 */
  onExitRules?: string[]
}

/** 统一规则：任意条件 → 任意动作 */
export interface UnifiedRule {
  id: string
  label?: string
  enabled: boolean
  description?: string
  condition: UnifiedCondition
  action: UnifiedAction
  /** 冷却时间(ms)，防止高频触发 */
  cooldown?: number
}

/** 统一条件类型 — 预设模板 + 自由表达式 */
export type UnifiedCondition =
  | { type: 'score_reach'; value: number }
  | { type: 'timer_remaining'; value: number; operator: 'less_than' | 'greater_than' }
  | { type: 'items_collected'; value: number; operator: 'exact' | 'at_least' }
  | { type: 'combo_count'; value: number }
  | { type: 'proximity_enter'; poiId: string }
  | { type: 'proximity_exit'; poiId: string }
  | { type: 'all_pois_visited' }
  | { type: 'expression'; expr: string; label?: string }
  | { type: 'custom'; evaluate: string; label?: string }

/** 统一动作类型 — 全部内置 + 自定义 */
export type UnifiedAction =
  | { type: 'show_message'; text: string; duration?: number }
  | { type: 'add_score'; value: number }
  | { type: 'spawn_item'; modelUrl?: string; count?: number; position?: [number, number, number] }
  | { type: 'remove_all_items' }
  | { type: 'speed_boost'; multiplier: number; duration: number }
  | { type: 'slow_down'; multiplier: number; duration: number }
  | { type: 'double_score'; duration: number }
  | { type: 'play_effect'; effect: 'screen_shake' | 'flash' | 'confetti' }
  | { type: 'play_audio'; url: string; volume?: number }
  | { type: 'show_model'; url: string; position?: [number, number, number] }
  | { type: 'link'; url: string }
  | { type: 'trigger_event'; eventName: string }
  | { type: 'teleport_to_poi'; poiId: string }
  | { type: 'restart' }
  | { type: 'end_game' }
  | { type: 'set_variable'; key: string; value: any }
  | { type: 'custom'; actionId: string; params: Record<string, any> }

/**
 * HUD 配置 — 增强版组件系统
 *
 * 统一使用 components[] 数组描述所有 UI 元素。
 * 旧版 boolean 字段自动推导：showScore→type='score'，向后兼容。
 * theme 定义完整的视觉风格。
 */
export interface HUDConfig {
  /** 整体布局风格 */
  layout?: 'floating' | 'overlay' | 'minimal'
  /** UI 组件列表 */
  components: HUDComponent[]
  /** 视觉主题 */
  theme: UITheme

  // ── 向后兼容字段（引擎自动映射到 components） ──
  /** @deprecated 使用 components 中 type='score' 的组件替代 */
  showScore?: boolean
  /** @deprecated 使用 components 中 type='timer' 的组件替代 */
  showTimer?: boolean
  /** @deprecated 使用 components 中 type='message' 的组件替代 */
  showMessage?: boolean
  /** @deprecated 在 score 组件的 position 中设置 */
  scorePosition?: string
  /** @deprecated 在 timer 组件的 position 中设置 */
  timerPosition?: string
}

/** 单个 UI 组件配置 */
export interface HUDComponent {
  id: string
  type: HUDComponentType
  enabled: boolean
  /** 显示标签（如"分数"、"剩余时间"） */
  label?: string
  /** 屏幕位置 */
  position: {
    anchor: HUDAnchor
    offsetX: number
    offsetY: number
  }
  /** 尺寸（可选，缺省使用组件默认值） */
  size?: { width?: number; height?: number }
  /** 组件级样式覆盖 */
  style?: UIComponentStyle
  /** 组件特有参数 */
  props: Record<string, any>
}

export type HUDComponentType =
  | 'score' | 'timer' | 'combo' | 'lives' | 'message'
  | 'poi_card' | 'poi_list' | 'minimap' | 'compass'
  | 'progress_bar' | 'directional_arrow' | 'button' | 'custom_text'

export type HUDAnchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

/** 组件级样式覆盖 */
export interface UIComponentStyle {
  opacity?: number
  textColor?: string
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  backgroundColor?: string
  borderRadius?: number
  borderColor?: string
  borderWidth?: number
  padding?: string
  animation?: {
    enter: 'none' | 'fade' | 'slide-up' | 'bounce'
    exit: 'none' | 'fade' | 'slide-down'
  }
}

/**
 * UITheme — 完整视觉主题
 *
 * 包含 12 色调色板、排版、形状和背景效果。
 * 通过 preset 可一键应用预定义主题。
 */
export interface UITheme {
  /** 主题预设标识 */
  preset: UIThemePreset
  /** 色板 */
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    surface: string
    text: string
    textSecondary: string
    success: string
    warning: string
    error: string
    info: string
  }
  /** 排版 */
  typography: {
    fontFamily: string
    titleSize: number
    bodySize: number
    labelSize: number
  }
  /** 形状 */
  shape: {
    borderRadius: 'none' | 'small' | 'medium' | 'large' | 'full'
    buttonStyle: 'rounded' | 'square' | 'pill'
    cardStyle: 'flat' | 'elevated' | 'glass' | 'outlined'
    backgroundEffect: 'blur' | 'dim' | 'transparent' | 'solid'
  }
  /** 动画风格 */
  animation: 'smooth' | 'snappy' | 'none'
}

export type UIThemePreset =
  | 'dark' | 'light' | 'neon' | 'minimal' | 'retro' | 'nature' | 'fantasy'
  | 'deep-space'

// ===== 网格放置系统（塔防/策略游戏） =====

/** 网格放置系统配置 */
export interface GridConfig {
  enabled: boolean
  rows: number
  cols: number
  cellSize: number
  /** 网格原点在 3D 空间中的位置（左下角） */
  origin?: [number, number, number]
  highlightColor?: string
  occupiedColor?: string
}

// ===== 波次管理系统 =====

export interface WaveConfig {
  enabled: boolean
  waves: Wave[]
  timeBetweenWaves: number
  autoStart: boolean
}

export interface Wave {
  id: string
  name: string
  enemies: WaveEnemy[]
  spawnInterval: number
  trigger: 'time' | 'previous_wave_complete' | 'expression'
  triggerValue?: number | string
}

export interface WaveEnemy {
  entityId: string
  modelUrl: string
  count: number
  spawnPosition: 'random_edge' | 'grid_edge' | [number, number, number]
  health: number
  speed: number
  reward: number
}

// ===== 实体行为系统 =====

export interface EntityBehavior {
  type: 'auto_produce' | 'auto_attack' | 'follow_path' | 'timed_event'
  config: Record<string, any>
}

/** UI 层组件 (Legacy) */
export interface UILayerConfig {
  type: 'score' | 'timer' | 'message' | 'button'
  position: 'top-left' | 'top-right' | 'bottom-center'
  props: Record<string, any>
}

// ===== Phase 2: AR 导览类型 =====

/** 兴趣点 */
export interface POI {
  id: string
  name: string
  description: string
  position: POIPosition
  triggerRadius: number
  modelUrl?: string
  imageUrl?: string
  audioUrl?: string
  autoTrigger: boolean
  onEnter?: POIAction
  onExit?: POIAction
  order: number
  estimatedDuration?: number
}

/** POI 位置 */
export interface POIPosition {
  type: 'gps' | 'ble' | 'vps' | 'manual'
  latitude?: number
  longitude?: number
  altitude?: number
  beaconId?: string
  anchorId?: string
  scenePosition?: [number, number, number]
}

/** POI 触发动作 */
export interface POIAction {
  type: 'show_model' | 'play_audio' | 'show_message' | 'link' | 'trigger_event'
  message?: string
  url?: string
}

/** 导览路线 */
export interface GuideRoute {
  id: string
  name: string
  description: string
  pois: POI[]
  startPOIId?: string
  endPOIId?: string
  style?: { markerModelUrl?: string; lineColor?: string; markerScale?: number }
  positionProvider: 'gps' | 'ble' | 'vps' | 'manual'
}

/** 定位配置 */
export interface PositioningConfig {
  provider: 'gps' | 'ble' | 'vps' | 'hybrid'
  gps?: { highAccuracy: boolean; timeout: number; maxAge: number }
  ble?: { scanInterval: number; knownBeacons: Array<{ uuid: string; major: number; minor: number; position: [number, number, number] }> }
  vps?: { mapId: string; apiKey: string }
  hybridWeights?: { gps: number; ble: number; vps: number }
}

// ===== 以下为已有类型（原样保留） =====

export type CapabilityModuleConfig =
  | ImageTrackingConfig
  | FaceTrackingConfig
  | WorldTrackingConfig
  | FaceEffectsConfig
  | SkyEffectsConfig
  | PlaneDetectionConfig
  | GreetingTextConfig

export interface ImageTrackingConfig {
  type: CapabilityType.ImageTracking
  targetUrl: string
  targetImageUrl?: string
}

export interface FaceTrackingConfig {
  type: CapabilityType.FaceTracking
}

export interface WorldTrackingConfig {
  type: CapabilityType.WorldTracking
}

export interface FaceEffectsConfig {
  type: CapabilityType.FaceEffects
  assetUrl?: string
  effectType?: 'mask' | 'distortion' | 'color'
}

export interface SkyEffectsConfig {
  type: CapabilityType.SkyEffects
  skyTextureUrl: string
  blendMode?: 'overlay' | 'replace'
}

export interface PlaneDetectionConfig {
  type: CapabilityType.PlaneDetection
  placementMode?: 'horizontal' | 'vertical' | 'any'
}

export interface GreetingTextConfig {
  type: CapabilityType.GreetingText
  message: string
  from?: string
  color: string
  animation: 'float' | 'rotate' | 'pulse'
  templateId?: string
}

export interface ModelConfig {
  url: string
  scale?: number
  position?: [number, number, number]
  dracoDecoderPath?: string
}

export interface EightWallAppConfig {
  engineUrl?: string
  enableRecording?: boolean
  /** 启用快照重定位器（SLAM 漂移修正，默认开启） */
  snapshotRelocalizer?: boolean
  /** PvZ 游戏模式：放置后不加载模型/占位方块，由 AREngine 在 onPlaced 中启动 PvzController */
  pvzMode?: boolean
}

export interface TrackingTuning {
  filterMinCF?: number
  filterBeta?: number
  missTolerance?: number
  warmupTolerance?: number
  freezeOnDetect?: boolean
}
