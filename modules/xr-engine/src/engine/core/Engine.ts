import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { AssetDatabase } from '../assets/AssetDatabase'
import { ModelPipeline } from '../ai3d/pipeline'
import { ARController } from '../xr/ARSession'
import { PluginRegistry } from '../plugins/registry'
import { EventBus } from './EventBus'
import { AudioManager } from '../game/AudioManager'
import { PrefabRegistry } from '../game/Prefab'
import { GameHud } from '../game/GameHud'
import { GameRuntime } from '../runtime/GameRuntime'
import { registerBuiltinEffectPrefabs } from '../game/effects'
import { setFxParticleScale } from '../effects/qualityBridge'
import { ThreeRuntimeRenderer } from '../runtime/three/ThreeRuntimeRenderer'
import { History } from './History'
import { PlayController } from './PlayController'
import { CommandAPI } from './commandApi'
import { SceneGraph } from './SceneGraph'
import { defaultEnvironment, defaultPostFX } from './factory'
import type { EngineEvents, QualityLevel } from './events'
import { PROJECT_VERSION, type EnvironmentConfig, type PostFXConfig, type ProjectFile } from './types'

const STORAGE_KEY = 'xr-engine:project:v0.1'
const AUTOSAVE_DELAY_MS = 600

/**
 * 载入的配置与默认值做一层嵌套合并：
 * 旧项目文件没有后加的字段（如 bloom.radius），浅合并会留下 undefined，
 * 传进 shader / 后期通道就是 NaN。数组（如色散偏移）按整体替换处理。
 */
function mergeWithDefaults<T>(defaults: T, loaded: unknown): T {
  if (loaded === null || typeof loaded !== 'object') return defaults
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) }
  for (const [key, value] of Object.entries(loaded as Record<string, unknown>)) {
    if (value === undefined) continue
    const fallback = out[key]
    out[key] =
      fallback !== null &&
      typeof fallback === 'object' &&
      !Array.isArray(fallback) &&
      typeof value === 'object' &&
      !Array.isArray(value)
        ? { ...(fallback as Record<string, unknown>), ...(value as Record<string, unknown>) }
        : value
  }
  return out as T
}

/**
 * 引擎门面。
 *
 * 持有所有子系统并统一管理项目状态，是 UI 层唯一需要打交道的对象。
 * 这里刻意不引用任何 React API —— 引擎可以脱离编辑器独立运行。
 */
export class Engine {
  readonly bus = new EventBus<EngineEvents>()
  readonly graph: SceneGraph
  readonly assets: AssetDatabase
  readonly ai3d: ModelPipeline
  readonly ar: ARController
  readonly plugins: PluginRegistry
  readonly history: History
  readonly play = new PlayController()
  readonly audio = new AudioManager()
  readonly prefabs = new PrefabRegistry()
  readonly hud = new GameHud()
  readonly game = new GameRuntime()
  /** AI / 自动化命令入口：LLM 输出 JSON 命令，经此驱动引擎 */
  readonly commands: CommandAPI

  projectName = '未命名场景'
  /** 移动端画质档位，由 quality 插件根据 GPU 等级与实测帧率自动调整 */
  qualityLevel: QualityLevel = 'medium'
  environment: EnvironmentConfig = defaultEnvironment()
  postfx: PostFXConfig = defaultPostFX()

  private scene: THREE.Scene | null = null
  private camera: THREE.Camera | null = null
  private controls: { target: THREE.Vector3; update: () => void } | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private gameRoot: THREE.Group | null = null
  private gameRenderer: ThreeRuntimeRenderer | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(backendUrl?: string) {
    this.graph = new SceneGraph(this.bus)
    this.assets = new AssetDatabase(this.bus)
    this.ai3d = new ModelPipeline(this.bus, this.assets, backendUrl ?? 'http://127.0.0.1:8787')
    this.ar = new ARController(this.bus)
    this.plugins = new PluginRegistry(this)
    this.history = new History(this.graph)
    this.commands = new CommandAPI(this)
    registerBuiltinEffectPrefabs(this)

    let lastNodeId: string | null = null
    this.bus.on('node:updated', ({ nodeId }) => {
      lastNodeId = nodeId
    })

    this.bus.on('graph:changed', ({ reason }) => {
      this.scheduleAutosave()
      // load（撤销/重做/打开项目）和 reset 本身不该进历史
      if (reason !== 'load' && reason !== 'reset') {
        this.history.capture(reason, lastNodeId)
        this.bus.emit('history:changed', {
          canUndo: this.history.canUndo,
          canRedo: this.history.canRedo,
        })
      }
    })
    this.bus.on('postfx:changed', ({ config }) => {
      this.postfx = config
      this.scheduleAutosave()
    })
    this.bus.on('environment:changed', ({ config }) => {
      this.environment = config
      this.scheduleAutosave()
    })
    this.bus.on('assets:changed', () => this.scheduleAutosave())
  }

  // ------------------------------------------------------------ 视口挂载

  /** 视口挂载时把 THREE.Scene 交给引擎，用于导出与 AR */
  attachScene(scene: THREE.Scene): void {
    this.scene = scene
  }

  detachScene(): void {
    this.scene = null
  }

  getScene(): THREE.Scene | null {
    return this.scene
  }

  attachCamera(camera: THREE.Camera): void {
    this.camera = camera
  }

  detachCamera(): void {
    this.camera = null
  }

  getCamera(): THREE.Camera | null {
    return this.camera
  }

  /** 视口挂载时把 OrbitControls 实例交给引擎，供聚焦/自动化等外部视角控制 */
  attachControls(controls: { target: THREE.Vector3; update: () => void } | null): void {
    this.controls = controls
  }

  getControls(): { target: THREE.Vector3; update: () => void } | null {
    return this.controls
  }

  /**
   * 场景里的「内容根」：子树内带 __nodeId（场景节点，渲染层在 NodeRenderer 挂载）
   * 或 runtimeEntityId（游戏运行时实体）标记的对象。
   * Grid、TransformControls gizmo 等编辑器辅助对象没有标记，拾取与导出都应排除。
   */
  private contentRoots(): THREE.Object3D[] {
    if (!this.scene) return []
    return this.scene.children.filter((child) => {
      let marked = false
      child.traverse((obj) => {
        if (marked) return
        if (obj.userData.__nodeId !== undefined || obj.userData.runtimeEntityId !== undefined) {
          marked = true
        }
      })
      return marked
    })
  }

  /**
   * 用归一化设备坐标(-1~1)拾取场景。
   * 返回按距离排序的交点，没有命中的话是空数组。
   */
  pick(ndcX: number, ndcY: number, objects?: THREE.Object3D[]): THREE.Intersection[] {
    if (!this.scene || !this.camera) return []
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
    return raycaster.intersectObjects(objects ?? this.contentRoots(), true)
  }

  /**
   * 把归一化屏幕坐标(0~1)转成地面 y=0 的世界坐标。
   * Web 端用于“点击地面放置物体”；微信端由 wxar-runtime 做等价换算。
   */
  screenToGround(screenX: number, screenY: number): { x: number; z: number } | null {
    if (!this.camera) return null
    const ndcX = screenX * 2 - 1
    const ndcY = -(screenY * 2 - 1)
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const out = new THREE.Vector3()
    if (raycaster.ray.intersectPlane(ground, out)) {
      return { x: out.x, z: out.z }
    }
    return null
  }

  /**
   * 视口挂载时注册渲染器。
   * AR 会话必须从渲染器启动，而触发入口（AR 面板）在 Canvas 之外，
   * 所以这里保存一份引用供面板取用。
   */
  attachRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer
  }

  detachRenderer(): void {
    this.renderer = null
  }

  getRenderer(): THREE.WebGLRenderer | null {
    return this.renderer
  }

  // ------------------------------------------------------------ 游戏运行时预览

  /** 启动 GameRuntime，并把其实体渲染到当前 Three.js 场景中 */
  startGameRuntime(): void {
    const scene = this.getScene()
    if (!scene) return
    if (!this.gameRoot) {
      this.gameRoot = new THREE.Group()
      this.gameRoot.name = '__GameRuntimeRoot__'
      scene.add(this.gameRoot)
    }
    if (!this.gameRenderer) {
      this.gameRenderer = new ThreeRuntimeRenderer({
        root: this.gameRoot,
        resolveAssetUri: (assetId) => this.assets.get(assetId)?.uri,
        // 原始文件名（含扩展名）供 loader 选择 GLTF/OBJ/FBX；gl 用于 KTX2 解码
        resolveAssetName: (assetId) => this.assets.get(assetId)?.name,
        gl: this.getRenderer() ?? undefined,
      })
    }
    this.game.start()
  }

  /** 在渲染循环中推进 GameRuntime 与实体同步 */
  updateGameRuntime(delta: number): void {
    this.game.update(delta)
    if (this.gameRenderer) {
      this.gameRenderer.sync(this.game.world)
      this.gameRenderer.update(delta)
    }
  }

  /** 停止 GameRuntime，移除渲染层 */
  stopGameRuntime(): void {
    this.game.stop()
    if (this.gameRenderer) {
      this.gameRenderer.dispose()
      this.gameRenderer = null
    }
    if (this.gameRoot) {
      this.gameRoot.parent?.remove(this.gameRoot)
      this.gameRoot = null
    }
  }

  get gameRuntimeActive(): boolean {
    return this.gameRoot !== null
  }

  getRuntimeRoot(): THREE.Group | null {
    return this.gameRoot
  }

  // ------------------------------------------------------------ 配置

  setEnvironment(patch: Partial<EnvironmentConfig>): void {
    this.environment = { ...this.environment, ...patch }
    this.bus.emit('environment:changed', { config: this.environment })
  }

  setPostFX(patch: Partial<PostFXConfig>): void {
    this.postfx = { ...this.postfx, ...patch }
    this.bus.emit('postfx:changed', { config: this.postfx })
  }

  patchPostFX<K extends keyof PostFXConfig>(key: K, patch: Partial<PostFXConfig[K]>): void {
    const current = this.postfx[key]
    // 顶层 enabled 是布尔值，不能展开，直接整体替换
    const next =
      typeof current === 'object' && current !== null
        ? { ...(current as object), ...(patch as object) }
        : patch
    this.setPostFX({ [key]: next } as Partial<PostFXConfig>)
  }

  setProjectName(name: string): void {
    this.projectName = name
    this.scheduleAutosave()
  }

  setQualityLevel(level: QualityLevel): void {
    if (this.qualityLevel === level) return
    this.qualityLevel = level
    if (level === 'high') setFxParticleScale(1)
    else if (level === 'medium') setFxParticleScale(0.5)
    else setFxParticleScale(0.15)
    this.bus.emit('quality:changed', { level, auto: true })
  }

  // ------------------------------------------------------------ 撤销 / 重做

  undo(): boolean {
    const ok = this.history.undo()
    this.emitHistoryState()
    return ok
  }

  redo(): boolean {
    const ok = this.history.redo()
    this.emitHistoryState()
    return ok
  }

  private emitHistoryState(): void {
    this.bus.emit('history:changed', {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    })
  }

  // ------------------------------------------------------------ 项目序列化

  toProject(): ProjectFile {
    return {
      version: PROJECT_VERSION,
      meta: {
        name: this.projectName,
        createdAt: this.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      graph: this.graph.toJSON(),
      environment: structuredClone(this.environment),
      postfx: structuredClone(this.postfx),
      assets: this.assets.toJSON(),
      ai3d: {
        backendUrl: this.ai3d.getBackendUrl(),
        preferredProvider: this.preferredProvider,
      },
    }
  }

  private createdAt: string | null = null
  preferredProvider = 'mock'

  loadProject(project: ProjectFile): void {
    this.restoreSnapshot(project)

    // 新载入的项目是全新的历史起点
    this.history.reset()
    this.bus.emit('history:changed', {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    })
    this.bus.emit('project:loaded', { name: this.projectName })
  }

  /**
   * 只恢复项目数据（graph/assets/environment/postfx），不重置撤销历史。
   * 播放模式退出时用它回到编辑态 —— 若走 loadProject，
   * 播放前积累的撤销历史会被 history.reset() 一并清掉。
   */
  restoreSnapshot(project: ProjectFile): void {
    this.projectName = project.meta?.name ?? '未命名场景'
    this.createdAt = project.meta?.createdAt ?? null
    this.environment = mergeWithDefaults(defaultEnvironment(), project.environment)
    this.postfx = mergeWithDefaults(defaultPostFX(), project.postfx)
    this.assets.load(project.assets ?? [])
    this.graph.load(project.graph ?? { nodes: {}, rootIds: [] })
    if (project.ai3d?.backendUrl) this.ai3d.setBackendUrl(project.ai3d.backendUrl)
    if (project.ai3d?.preferredProvider) this.preferredProvider = project.ai3d.preferredProvider
    // 面板靠这两个事件刷新，漏发会让 UI 滞留在加载前的旧值
    this.bus.emit('environment:changed', { config: this.environment })
    this.bus.emit('postfx:changed', { config: this.postfx })
  }

  reset(): void {
    this.projectName = '未命名场景'
    this.createdAt = null
    this.environment = defaultEnvironment()
    this.postfx = defaultPostFX()
    this.assets.clear()
    this.graph.reset()
    this.history.reset()
    this.bus.emit('history:changed', {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    })
  }

  // ------------------------------------------------------------ 持久化

  private scheduleAutosave(): void {
    // 播放模式下的变更（物理/脚本驱动）是临时态，落盘会污染存档；
    // 退出播放恢复快照后自然会再触发一次保存
    if (this.play.active) return
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      // 进播放前挂起的定时器可能在播放中才触发，回调里再查一次
      if (this.play.active) return
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.toProject()))
      } catch (err) {
        console.warn('[Engine] 自动保存失败（可能是超出 localStorage 配额）', err)
      }
    }, AUTOSAVE_DELAY_MS)
  }

  loadFromLocal(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      this.loadProject(JSON.parse(raw) as ProjectFile)
      return true
    } catch (err) {
      console.warn('[Engine] 读取本地存档失败', err)
      return false
    }
  }

  clearLocal(): void {
    localStorage.removeItem(STORAGE_KEY)
  }

  downloadProject(): void {
    const blob = new Blob([JSON.stringify(this.toProject(), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${this.projectName || 'scene'}.xrproj.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async openProjectFile(file: File): Promise<void> {
    const text = await file.text()
    const project = JSON.parse(text) as ProjectFile
    if (!project.graph) throw new Error('不是有效的项目文件：缺少 graph 字段')
    this.loadProject(project)
  }

  /** 导出当前场景为 GLB（.glb 二进制）。只含场景内容，不含 Grid/gizmo 等编辑器辅助对象 */
  async exportGLB(): Promise<Blob> {
    const scene = this.scene
    if (!scene) throw new Error('视口尚未就绪，无法导出')

    const roots = this.contentRoots()
    if (!roots.length) throw new Error('场景为空，没有可导出的内容')

    const exporter = new GLTFExporter()
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        roots,
        (result) => resolve(result as ArrayBuffer),
        (err) => reject(err),
        { binary: true, onlyVisible: true }
      )
    })

    return new Blob([buffer], { type: 'model/gltf-binary' })
  }

  dispose(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    // 必须在清空 bus 之前卸载插件，否则卸载事件发不出去
    this.plugins.disposeAll()
    this.assets.clear()
    this.bus.clear()
  }
}
