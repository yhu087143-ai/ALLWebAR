import { create } from 'zustand'
import { Engine } from '@/engine/core/Engine'
import type {
  AssetKind,
  AssetRecord,
  EnvironmentConfig,
  GeometryKind,
  NodeType,
  PostFXConfig,
  SceneNode,
  Transform,
} from '@/engine/core/types'
import { inspectGLTF, loadModelFile } from '@/engine/assets/loader'
import { disposeLoadedModel } from '@/editor/scene/dispose'
import type { QualityLevel } from '@/engine/core/events'
import type { PanelDescriptor } from '@/engine/plugins/types'
import { createQualityPlugin } from '@/engine/plugins/builtin/quality'
import { exportMiniProgramSceneAuto, buildMiniProgramScene } from '@/engine/export/miniProgram'
import { copyWechatComponentSource } from '@/engine/xr/wechat/wechatSource'

/** 引擎单例。整个编辑器共用一份。 */
export const engine = new Engine()

// 开发期调试钩子：控制台可直接读取引擎资产/场景
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__engine = engine
  ;(window as unknown as Record<string, unknown>).__useEditor = () => useEditor.getState()
  ;(window as unknown as Record<string, unknown>).__buildWxarScene = () => buildMiniProgramScene(engine)
}

/** Toast 通知（右上角滑入，3s 自动消失） */
export interface ToastItem {
  id: number
  text: string
  kind: 'info' | 'success' | 'error'
}

/** addNode 的可选扩展：右键菜单/工具栏「添加物体」用，一次性设置名称、几何体、props 与初始变换 */
export interface AddNodeOptions {
  /** 展示名（如「立方体」）；与现有节点重名时自动追加「 2」「 3」序号 */
  name?: string
  /** mesh 节点的几何体类型，创建后立即 setGeometry（参数表按新几何体重置） */
  geometry?: GeometryKind
  /** 创建后立即 setProps 的补丁，如 { preset: 'snow' } / { effect: 'blackhole' } */
  props?: Record<string, unknown>
  /** 初始局部位置（视口右键创建 = 点击处的地面坐标） */
  position?: [number, number, number]
  /** 初始局部旋转（如平面默认躺平到地面） */
  rotation?: [number, number, number]
}

export interface EditorState {
  revision: number
  structureVersion: number
  nodes: Record<string, SceneNode>
  rootIds: string[]
  selectedId: string | null
  assets: AssetRecord[]
  environment: EnvironmentConfig
  postfx: PostFXConfig
  projectName: string
  backendUrl: string
  preferredProvider: string
  /** 移动端画质档位，由 quality 插件自动调整 */
  qualityLevel: QualityLevel
  /** 视口是否显示网格与辅助线 */
  showHelpers: boolean
  /** 变换 gizmo 模式 */
  gizmoMode: 'translate' | 'rotate' | 'scale'
  /** 无人机自由飞行视角（WASD + 拖拽转头），激活时禁用轨道控制与 W/E/R 快捷键 */
  flyMode: boolean
  /** 是否处于 WebXR AR 会话中 */
  arActive: boolean
  arError: string | null
  /** AR 中场景的整体缩放，默认 0.2 以免模型大得离谱 */
  arScale: number
  /** 插件经 registerPanel 注册的面板（追加为左侧 rail 图标） */
  pluginPanels: PanelDescriptor[]
  /** 全局 Toast 通知队列 */
  toasts: ToastItem[]

  select: (id: string | null) => void
  /** 相机聚焦：点击层级节点 / 按 F 时把相机飞到对象位置 */
  focusRequest: { id: string; nonce: number } | null
  focusNode: (id: string) => void
  addNode: (type: NodeType, parentId?: string | null, options?: AddNodeOptions) => void
  /** 画轨迹模式提交：用屏幕上画出的点串创建一个携带 path 组件的轨迹节点 */
  addPathNode: (points: [number, number, number][]) => void
  addModelNode: (assetId: string, parentId?: string | null) => void
  /** 把高斯泼溅资产实例化为场景节点（PLY / .splat / .ksplat / .spz） */
  addSplatNode: (assetId: string, parentId?: string | null) => void
  removeNode: (id: string) => void
  duplicateNode: (id: string) => void
  renameNode: (id: string, name: string) => void
  toggleVisible: (id: string) => void
  toggleLocked: (id: string) => void
  setTransform: (id: string, patch: Partial<Transform>) => void
  setProps: (id: string, patch: Record<string, unknown>) => void
  setGeometry: (id: string, geometry: GeometryKind) => void
  reparent: (id: string, parentId: string | null, index?: number) => void
  reorder: (id: string, delta: number) => void
  /** 拖放校验：不能把节点挂到自己的子孙下 */
  canDrop: (id: string, parentId: string | null) => boolean

  addAssetFromFiles: (files: File[]) => Promise<void>
  addAssetFromUrl: (url: string, name?: string) => Promise<void>
  removeAsset: (id: string) => void

  setEnvironment: (patch: Partial<EnvironmentConfig>) => void
  patchPostFX: <K extends keyof PostFXConfig>(key: K, patch: Partial<PostFXConfig[K]>) => void
  setPostFXEnabled: (enabled: boolean) => void

  setBackendUrl: (url: string) => void
  setPreferredProvider: (id: string) => void
  setProjectName: (name: string) => void
  setShowHelpers: (v: boolean) => void
  setGizmoMode: (m: 'translate' | 'rotate' | 'scale') => void
  setFlyMode: (v: boolean) => void
  setArActive: (v: boolean, error?: string | null) => void
  setArScale: (v: number) => void

  newProject: () => void
  openProject: (file: File) => Promise<void>
  downloadProject: () => void
  exportGLB: () => Promise<void>
  exportMiniProgramScene: () => void
  copyWechatComponent: () => Promise<void>
  /** Ctrl+S：强制把当前项目写入 localStorage（与引擎自动保存同一存储位） */
  saveNow: () => void
  /** 弹一条 Toast，3s 后自动消失 */
  toast: (text: string, kind?: ToastItem['kind']) => void
  dismissToast: (id: number) => void

  /** 撤销 / 重做（作用于引擎场景图，不是 React 状态） */
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  /** 播放模式：进入时快照编辑态，退出时恢复 */
  playing: boolean
  togglePlay: () => void
}

/** Toast 自增 id */
let toastSeq = 0

const guessKind = (name: string): AssetKind => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['glb', 'gltf', 'usdz', 'fbx', 'obj'].includes(ext)) return 'model'
  // 高斯泼溅：PLY（INRIA 3DGS 约定字段）与 gaussian-splats-3d 原生格式
  if (['ply', 'splat', 'ksplat', 'spz'].includes(ext)) return 'gaussian-splat'
  if (['hdr', 'exr'].includes(ext)) return 'hdri'
  if (['png', 'jpg', 'jpeg', 'webp', 'ktx2', 'basis'].includes(ext)) return 'texture'
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio'
  return 'model'
}

/** 清理悬挂的 pathFollow.pathId（绑定的轨迹节点已不存在时置空），返回修复的节点数 */
function sanitizeFollowRefs(): number {
  let fixed = 0
  for (const n of Object.values(engine.graph.nodes)) {
    const comps = (n.props as { components?: { type?: string; pathId?: string | null }[] } | undefined)?.components
    if (!Array.isArray(comps)) continue
    let changed = false
    const next = comps.map((c) => {
      if (c?.type === 'pathFollow' && c.pathId && !engine.graph.nodes[c.pathId]) {
        changed = true
        return { ...c, pathId: null }
      }
      return c
    })
    if (changed) {
      engine.graph.setProps(n.id, { components: next })
      fixed++
    }
  }
  return fixed
}

export const useEditor = create<EditorState>()((set, get) => ({
  revision: 0,
  structureVersion: 0,
  nodes: {},
  rootIds: [],
  selectedId: null,
  assets: [],
  environment: engine.environment,
  postfx: engine.postfx,
  projectName: engine.projectName,
  backendUrl: engine.ai3d.getBackendUrl(),
  preferredProvider: engine.preferredProvider,
  qualityLevel: engine.qualityLevel,
  showHelpers: true,
  gizmoMode: 'translate',
  flyMode: false,
  focusRequest: null,
  arActive: false,
  arError: null,
  arScale: 0.2,
  pluginPanels: Array.from(engine.plugins.panels.values()),
  toasts: [],

  toast: (text, kind = 'info') => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    // 3s 后自动消失
    setTimeout(() => get().dismissToast(id), 3000)
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  select: (id) => set({ selectedId: id }),

  focusNode: (id) => set({ selectedId: id, focusRequest: { id, nonce: Date.now() } }),

  addNode: (type, parentId = null, options) => {
    const node = engine.graph.create(type, parentId ?? null)
    // 先几何体（会按新类型重置参数表）再 props，顺序不能反，否则 props 里的 geometryParams 被覆盖
    if (options?.geometry) engine.graph.setGeometry(node.id, options.geometry)
    if (options?.props) engine.graph.setProps(node.id, options.props)
    if (options?.position || options?.rotation) {
      engine.graph.setTransform(node.id, {
        ...(options.position ? { position: options.position } : {}),
        ...(options.rotation ? { rotation: options.rotation } : {}),
      })
    }
    if (options?.name) {
      // 对标 Unity：重名追加序号（「立方体」「立方体 2」…）
      const existing = new Set(Object.values(engine.graph.nodes).map((n) => n.name))
      let finalName = options.name
      if (existing.has(finalName)) {
        let index = 2
        while (existing.has(`${finalName} ${index}`)) index += 1
        finalName = `${finalName} ${index}`
      }
      engine.graph.update(node.id, { name: finalName })
    }
    set({ selectedId: node.id })
  },

  addPathNode: (points) => {
    if (points.length < 2) return
    const node = engine.graph.create('group', null)
    // 轨迹数据放在 components 里：Web 端（渲染 + 跟随）与微信运行时共用同一份数据
    engine.graph.setProps(node.id, { components: [{ type: 'path', points, closed: false }] })
    // 命名与「轨迹 N」编号保持唯一
    const existing = new Set(Object.values(engine.graph.nodes).map((n) => n.name))
    let index = 1
    while (existing.has(`轨迹 ${index}`)) index += 1
    engine.graph.update(node.id, { name: `轨迹 ${index}` })
    // 画完新轨迹后，让所有 pathFollow 角色立即切到这条新轨迹
    // （符合「画完就走新轨迹」的直觉；旧轨迹仍保留，可在 Inspector「跟随轨迹」下拉框切回）
    for (const n of Object.values(engine.graph.nodes)) {
      const comps = (n.props as { components?: { type?: string }[] } | undefined)?.components
      if (!Array.isArray(comps)) continue
      let changed = false
      const next = comps.map((c) => {
        if (c?.type === 'pathFollow') {
          changed = true
          return { ...c, pathId: node.id }
        }
        return c
      })
      if (changed) engine.graph.setProps(n.id, { components: next })
    }
    set({ selectedId: node.id })
  },

  addModelNode: (assetId, parentId = null) => {
    const node = engine.graph.create('model', parentId ?? null)
    const asset = engine.assets.get(assetId)
    const firstAnim = String(asset?.meta.animations ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)[0] ?? null
    engine.graph.setProps(node.id, { assetId, activeAnimation: firstAnim })
    if (asset) engine.graph.update(node.id, { name: asset.name.replace(/\.[^.]+$/, '') })
    set({ selectedId: node.id })
  },

  addSplatNode: (assetId, parentId = null) => {
    const node = engine.graph.create('gaussian-splat', parentId ?? null)
    const asset = engine.assets.get(assetId)
    engine.graph.setProps(node.id, { assetId })
    if (asset) engine.graph.update(node.id, { name: asset.name.replace(/\.[^.]+$/, '') })
    set({ selectedId: node.id })
  },

  removeNode: (id) => {
    const removed = engine.graph.get(id)
    const removedComps = (removed?.props as { components?: { type?: string }[] } | undefined)?.components
    const isPathNode = Array.isArray(removedComps) && removedComps.some((c) => c?.type === 'path')

    if (isPathNode) {
      // 父子绑定语义：挂在轨迹节点下的子节点是「跟随这条轨迹」的物体，
      // 删除轨迹时把它们提升到轨迹的父级（通常是根级），而不是连坐删除。
      // （轨迹节点一般在根级且无变换，提升后物体世界位置不变）
      const children = [...(removed?.children ?? [])]
      for (const childId of children) {
        engine.graph.reparent(childId, removed?.parentId ?? null)
      }
      // 删除一致性：清空所有指向这条轨迹的 pathFollow 显式引用
      for (const n of Object.values(engine.graph.nodes)) {
        const comps = (n.props as { components?: { type?: string; pathId?: string | null }[] } | undefined)?.components
        if (!Array.isArray(comps)) continue
        let changed = false
        const next = comps.map((c) => {
          if (c?.type === 'pathFollow' && c.pathId === id) {
            changed = true
            return { ...c, pathId: null }
          }
          return c
        })
        if (changed) engine.graph.setProps(n.id, { components: next })
      }
    }
    engine.graph.remove(id)
    if (get().selectedId === id) set({ selectedId: null })
  },

  duplicateNode: (id) => {
    const copy = engine.graph.duplicate(id)
    if (copy) set({ selectedId: copy.id })
  },

  renameNode: (id, name) => engine.graph.update(id, { name }),

  toggleVisible: (id) => {
    const node = engine.graph.get(id)
    if (node) engine.graph.update(id, { visible: !node.visible })
  },

  toggleLocked: (id) => {
    const node = engine.graph.get(id)
    if (node) engine.graph.update(id, { locked: !node.locked })
  },

  setTransform: (id, patch) => engine.graph.setTransform(id, patch),

  setProps: (id, patch) => engine.graph.setProps(id, patch),

  setGeometry: (id, geometry) => engine.graph.setGeometry(id, geometry),

  reparent: (id, parentId, index = -1) => engine.graph.reparent(id, parentId, index),

  reorder: (id, delta) => engine.graph.reorder(id, delta),

  canDrop: (id, parentId) => engine.graph.canReparent(id, parentId),

  addAssetFromFiles: async (files) => {
    // 先收集同批导入的贴图文件：FBX 材质引用外部贴图，按文件名匹配后
    // 才能把真实像素填进材质并随「减面」一起烘焙进 GLB（否则模型发白）。
    const imageFiles = files.filter((f) => /\.(png|jpe?g|webp|bmp|gif|ktx2)$/i.test(f.name))
    for (const file of files) {
      const uri = URL.createObjectURL(file)
      const kind = guessKind(file.name)
      const record = engine.assets.add({
        name: file.name,
        kind,
        source: 'upload',
        uri,
        mimeType: file.type || undefined,
        size: file.size,
      }, file)

      if (kind === 'model') {
        const modelExt = /\.(glb|gltf|obj|fbx)$/i.test(file.name)
        if (modelExt) {
          record.meta = { ...record.meta, loadStatus: 'loading' }
          const t0 = performance.now()
          try {
            const loaded = await loadModelFile(uri, file.name, engine.getRenderer() ?? undefined, imageFiles)
            try {
              const stats = inspectGLTF(loaded.scene)
              const animationNames = loaded.animations
                .map((clip) => clip.name || 'unnamed')
                .filter((v, i, arr) => arr.indexOf(v) === i)
              // 动画轨道数从 loaded.animations 统计（GLTFLoader 把动画放在 gltf.animations，
              // 而非 scene 上；inspectGLTF 只遍历 scene 会漏掉）。
              const animationTracks = loaded.animations.reduce(
                (n, clip) => n + (clip.tracks?.length ?? 0),
                0
              )
              record.triangles = stats.triangles
              record.meta = {
                ...record.meta,
                loadStatus: 'done',
                compileMs: Math.round(performance.now() - t0),
                meshes: stats.meshes,
                materials: stats.materials,
                textures: stats.textures,
                bones: stats.bones ?? 0,
                animationTracks,
                animations: animationNames.join(', '),
                loaded: true,
              }
              engine.bus.emit('assets:changed', { assets: engine.assets.list() })
            } finally {
              // 这里只为统计信息临时解析，模型本体不入场景：用完即释放 GPU 资源
              disposeLoadedModel(loaded.scene)
            }
          } catch (err) {
            console.warn('[assets] 解析模型失败', file.name, err)
            record.meta = {
              ...record.meta,
              loadStatus: 'error',
              loadError: err instanceof Error ? err.message : String(err),
            }
            engine.bus.emit('assets:changed', { assets: engine.assets.list() })
          }
        }
      }

      // 高斯泼溅资产：解析头部统计泼溅点数（供资产卡与 Inspector 展示）
      if (kind === 'gaussian-splat') {
        try {
          let splatCount = 0
          if (/\.ply$/i.test(file.name)) {
            // INRIA PLY：读 ASCII 头部里的 element vertex N
            const head = await file.slice(0, 4096).text()
            const m = head.match(/element\s+vertex\s+(\d+)/i)
            splatCount = m ? parseInt(m[1], 10) : 0
          } else if (/\.splat$/i.test(file.name)) {
            splatCount = Math.floor(file.size / 32) // .splat 定长 32 字节/点
          }
          record.meta = { ...record.meta, splatCount, loaded: true }
          engine.bus.emit('assets:changed', { assets: engine.assets.list() })
        } catch (err) {
          console.warn('[assets] 解析高斯泼溅头部失败', file.name, err)
        }
      }
    }
    get().toast(`已导入 ${files.length} 个资产`, 'success')
  },

  addAssetFromUrl: async (url, name) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`下载失败: HTTP ${response.status}`)
    const blob = await response.blob()
    const fallbackName = url.split('/').pop()?.split('?')[0] || 'remote-asset'
    const fileName = name || fallbackName
    const file = new File([blob], fileName, { type: blob.type || undefined })
    await useEditor.getState().addAssetFromFiles([file])
  },

  removeAsset: (id) => engine.assets.remove(id),

  setEnvironment: (patch) => engine.setEnvironment(patch),

  patchPostFX: (key, patch) => engine.patchPostFX(key, patch),

  setPostFXEnabled: (enabled) => engine.setPostFX({ enabled }),

  setBackendUrl: (url) => {
    engine.ai3d.setBackendUrl(url)
    set({ backendUrl: url })
  },

  setPreferredProvider: (id) => {
    engine.preferredProvider = id
    set({ preferredProvider: id })
  },

  setProjectName: (name) => {
    engine.setProjectName(name)
    set({ projectName: name })
  },

  setShowHelpers: (v) => set({ showHelpers: v }),

  setGizmoMode: (m) => set({ gizmoMode: m }),

  setFlyMode: (v) => set({ flyMode: v }),

  setArActive: (v, error = null) => set({ arActive: v, arError: error }),

  setArScale: (v) => set({ arScale: v }),

  newProject: () => {
    engine.reset()
    buildStarterScene()
    set({ selectedId: null })
  },

  openProject: async (file) => {
    await engine.openProjectFile(file)
    const repaired = sanitizeFollowRefs()
    if (repaired > 0) console.warn(`[轨迹跟随] 已清理 ${repaired} 个指向已删除轨迹的悬挂引用`)
    brightenLegacyLighting()
    set({
      projectName: engine.projectName,
      backendUrl: engine.ai3d.getBackendUrl(),
      preferredProvider: engine.preferredProvider,
      selectedId: null,
    })
  },

  downloadProject: () => {
    engine.downloadProject()
    get().toast('项目文件已导出', 'success')
  },

  exportGLB: async () => {
    try {
      const blob = await engine.exportGLB()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${engine.projectName || 'scene'}.glb`
      a.click()
      // 同步 revoke 会让 Firefox 取消刚开始的下载，延迟回收
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      get().toast('GLB 已导出', 'success')
    } catch (err) {
      get().toast(`导出 GLB 失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  },

  exportMiniProgramScene: () => {
    // 一键链路：生成 → 推送本地小程序项目（9911 转发服务）→ 开发者工具自动重编译；
    // 服务未启动时回退为浏览器下载
    void exportMiniProgramSceneAuto(engine)
      .then((mode) => {
        if (mode === 'pushed') {
          console.info('[导出] 已自动写入小程序项目 miniprogram-7/miniprogram/utils/scene-data.js，微信开发者工具将自动重新编译')
          get().toast('小程序场景已推送到本地项目', 'success')
        } else {
          console.warn('[导出] 本地推送服务(127.0.0.1:9911)未启动，已回退为浏览器下载 scene-data.js；启动 node scripts/receive-upload.mjs 可恢复一键推送')
          get().toast('推送服务未启动，已回退为浏览器下载', 'info')
        }
      })
      .catch((err) => {
        get().toast(`导出小程序场景失败：${err instanceof Error ? err.message : String(err)}`, 'error')
      })
  },

  copyWechatComponent: async () => {
    try {
      await copyWechatComponentSource(engine)
      get().toast('微信组件源码已复制到剪贴板', 'success')
    } catch (err) {
      get().toast(`复制微信组件失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  },

  saveNow: () => {
    try {
      // 与 Engine 自动保存同一存储位（STORAGE_KEY 未导出，值必须保持一致）
      localStorage.setItem('xr-engine:project:v0.1', JSON.stringify(engine.toProject()))
      get().toast('已保存', 'success')
    } catch (err) {
      get().toast(`保存失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  },

  undo: () => {
    engine.undo()
    sanitizeFollowRefs()
  },
  redo: () => {
    engine.redo()
    sanitizeFollowRefs()
  },
  canUndo: false,
  canRedo: false,
  playing: false,

  togglePlay: () => {
    // start/stop 内部会 emit playmode:changed，store 的事件订阅负责同步
    if (engine.play.active) {
      engine.play.stop(engine)
      return
    }
    try {
      engine.play.start(engine)
    } catch (err) {
      console.error('[play] 进入播放模式失败', err)
    }
  },
}))

/** 引擎事件 -> store，UI 只订阅 store */
const syncGraph = (revision: number) => {
  useEditor.setState({
    revision,
    structureVersion: engine.graph.structureVersion,
    nodes: { ...engine.graph.nodes },
    rootIds: [...engine.graph.rootIds],
  })
}

engine.bus.on('graph:changed', ({ revision }) => syncGraph(revision))
engine.bus.on('assets:changed', ({ assets }) => useEditor.setState({ assets }))
engine.bus.on('environment:changed', ({ config }) => useEditor.setState({ environment: config }))
engine.bus.on('postfx:changed', ({ config }) => useEditor.setState({ postfx: config }))
engine.bus.on('quality:changed', ({ level }) => useEditor.setState({ qualityLevel: level }))
engine.bus.on('history:changed', ({ canUndo, canRedo }) =>
  useEditor.setState({ canUndo, canRedo })
)
engine.bus.on('playmode:changed', ({ playing }) => useEditor.setState({ playing }))
// 插件注册/卸载面板时同步 rail 图标列表
engine.bus.on('plugin:changed', () =>
  useEditor.setState({ pluginPanels: Array.from(engine.plugins.panels.values()) })
)

// AI 生成结果的全局反馈：包一层 generate，不改引擎语义（AIPanel 内部仍有自己的错误展示）
const rawGenerate = engine.ai3d.generate.bind(engine.ai3d)
engine.ai3d.generate = async (request, onProgress) => {
  try {
    const record = await rawGenerate(request, onProgress)
    useEditor.getState().toast('AI 模型已生成并加入场景', 'success')
    return record
  } catch (err) {
    useEditor
      .getState()
      .toast(`AI 生成失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    throw err
  }
}

// 引擎自动保存失败只有 console.warn（无事件）：包一层 console.warn 侦测该前缀弹 toast，原输出保留
const rawConsoleWarn = console.warn
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('[Engine] 自动保存失败')) {
    useEditor.getState().toast('自动保存失败：可能超出浏览器存储配额', 'error')
  }
  rawConsoleWarn.apply(console, args)
}

/** 新项目的默认场景：一盏主光 + 环境光 + 地面 + 一个立方体 */
export function buildStarterScene(): void {
  const { graph } = engine

  const ambient = graph.create('light')
  graph.update(ambient.id, { name: '环境光' })
  graph.setProps(ambient.id, { light: 'ambient', intensity: 1.2, castShadow: false })

  const key = graph.create('light')
  graph.update(key.id, { name: '主光源' })
  graph.setProps(key.id, {
    light: 'directional',
    intensity: 3.0,
    color: '#fff4e6',
  })
  graph.setTransform(key.id, { position: [4, 6, 3] })

  const ground = graph.create('mesh')
  graph.update(ground.id, { name: '地面' })
  graph.setGeometry(ground.id, 'plane')
  graph.setProps(ground.id, {
    geometryParams: { width: 20, height: 20, widthSegments: 1, heightSegments: 1 },
    castShadow: false,
    material: {
      color: '#3d424d',
      metalness: 0.1,
      roughness: 0.85,
      emissive: '#000000',
      emissiveIntensity: 0,
      opacity: 1,
      wireframe: false,
      flatShading: false,
    },
  })
  graph.setTransform(ground.id, { rotation: [-Math.PI / 2, 0, 0] })

  const cube = graph.create('mesh')
  graph.update(cube.id, { name: '演示立方体' })
  graph.setTransform(cube.id, { position: [0, 0.5, 0] })
}

/**
 * 旧存档亮度迁移：早期默认光照（环境光 0.5 / 主光 2.2）+ 暗地面 + 暗角
 * 让整个场景看起来发闷偏暗。只针对「仍是旧起步场景默认值」的节点生效，
 * 用户手动调过的灯光/材质不会被改动。
 */
function brightenLegacyLighting(): void {
  let changed = false
  for (const node of Object.values(engine.graph.nodes)) {
    if (node.type === 'light') {
      const props = node.props as { light?: string; intensity?: number }
      if (node.name === '环境光' && props.light === 'ambient' && (props.intensity ?? 0) <= 0.6) {
        engine.graph.setProps(node.id, { intensity: 1.2 })
        changed = true
      }
      if (node.name === '主光源' && props.light === 'directional' && (props.intensity ?? 0) <= 2.2) {
        engine.graph.setProps(node.id, { intensity: 3.0 })
        changed = true
      }
    }
    if (node.type === 'mesh' && node.name === '地面') {
      const material = (node.props as { material?: { color?: string } }).material
      if (material?.color === '#2a2d35') {
        engine.graph.setProps(node.id, { material: { ...material, color: '#3d424d' } })
        changed = true
      }
    }
  }
  // 暗角是「发暗」观感的另一主因：仅当仍是旧默认配置（0.45/0.35）时关闭
  const vignette = engine.postfx.vignette
  if (vignette.enabled && vignette.darkness === 0.45 && vignette.offset === 0.35) {
    engine.setPostFX({ vignette: { ...vignette, enabled: false } })
    changed = true
  }
  if (changed) console.info('[亮度迁移] 已把旧版默认光照/暗角提亮，手动调过的参数不受影响')
}


/** 启动时恢复上次会话，没有存档就建一个起步场景 */
export function bootstrap(): void {
  // 画质插件要在渲染开始之前装好，否则首帧会按默认档位跑
  engine.plugins.register(createQualityPlugin())

  const restored = engine.loadFromLocal()
  if (!restored || engine.graph.rootIds.length === 0) {
    buildStarterScene()
  } else {
    // 会话存档可能携带指向已删除轨迹的悬挂 pathId（历史版本遗留），
    // 恢复后立即清理，否则每次刷新模型都会「原地走」
    const fixed = sanitizeFollowRefs()
    if (fixed > 0) {
      console.warn(`[轨迹跟随] 会话恢复时清理了 ${fixed} 个指向已删除轨迹的悬挂引用`)
    }
    // 旧存档的默认光照偏暗，恢复后提亮（只动仍是旧默认值的参数）
    brightenLegacyLighting()
  }
}
