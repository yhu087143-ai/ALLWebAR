/**
 * 8th Wall 引擎适配器
 *
 * 实现 IEngineAdapter 接口，封装 8th Wall XR8 引擎。
 * 支持平面检测（SLAM）、世界追踪、图像追踪、人脸特效等能力。
 *
 * 8th Wall 于 2024 年由 Niantic 以 MIT 协议开源，
 * SLAM 二进制组件通过 npm @8thwall/engine-binary 分发（专有二进制许可）。
 *
 * API 参考: https://8thwall.org/docs/engine/overview
 * GitHub: https://github.com/8thwall/8thwall
 */

import * as THREE from 'three'
import type { IEngineAdapter } from '../types/engine'
import type { UnifiedARConfig } from '../types/config'
import { EngineType, CapabilityType } from '../types/enums'
import { loadScript, waitForGlobal } from '../utils/loader'
import { VideoPlayer } from '../video/VideoPlayer'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { SnapshotRelocalizer } from '../interaction/SnapshotRelocalizer'
import { VisualFeatureTracker } from '../tracking/VisualFeatureTracker'

// ── 全局类型声明 ──

declare global {
  interface Window {
    XR8?: XR8Global
    THREE?: any
  }
}

interface XR8Global {
  addCameraPipelineModule(module: XRPipelineModule): void
  removeCameraPipelineModule(name: string): void
  run(config: XRRunConfig): Promise<void>
  stop(): Promise<void>
  pause(): void
  resume(): void
  XrController: {
    pipelineModule(): XRPipelineModule
    configure(options: Record<string, any>): void
    recenter(): void
    hitTest(x: number, y: number, types?: string[]): XRHitTestResult[]
    /** @deprecated */
    xrController(): any
  }
  FaceController: {
    pipelineModule(): XRPipelineModule
  }
  ImageTargets: {
    pipelineModule(config: { target: string }): XRPipelineModule
  }
  GlTextureRenderer: {
    pipelineModule(): XRPipelineModule
  }
  Threejs: {
    pipelineModule(config?: ThreejsPipelineConfig): XRPipelineModule
    xrScene(): XRThreeScene
  }
  XrConfig: {
    device(): { ANY: string }
  }
}

interface XRHitTestResult {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; w: number }
  type: 'FEATURE_POINT' | 'ESTIMATED_SURFACE' | 'DETECTED_SURFACE'
  distance: number
}

interface XRPipelineModule {
  name: string
  /** onStart 在 onAttach 之前触发，但 GLctx 和 canvas 已可用 */
  onStart?: (args: { canvas: HTMLCanvasElement; GLctx: WebGLRenderingContext; canvasWidth: number; canvasHeight: number }) => void
  onAttach?: (args: { canvas: HTMLCanvasElement; GLctx: WebGLRenderingContext; canvasWidth: number; canvasHeight: number; videoWidth: number; videoHeight: number }) => void
  onBeforeRun?: () => Promise<void> | void
  onProcessGpu?: () => void
  onProcessCpu?: (frame: any) => Record<string, any>
  onUpdate?: (args: { processCpuResult: any }) => void
  onRender?: () => void
  onCanvasSizeChange?: (args: { canvasWidth: number; canvasHeight: number }) => void
  onDeviceOrientationChange?: (args: { orientation: number }) => void
  onCameraStatusChange?: (args: CameraStatusArgs) => void
  onPaused?: () => void
  onResume?: () => void
  onException?: (err: any) => void
  onDetach?: () => void
  onRemove?: () => void
}

interface CameraStatusArgs {
  status: 'requesting' | 'hasStream' | 'hasVideo' | 'failed'
  stream?: MediaStream
  video?: HTMLVideoElement
  config?: any
}

interface ThreejsPipelineConfig {
  renderer?: Partial<THREE.WebGLRenderer>
}

interface XRThreeScene {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
}

interface XRRunConfig {
  canvas: HTMLCanvasElement
  allowedDevices?: string
}

// ── 本地引擎路径 ──
const DEFAULT_ENGINE_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_8THWALL_ENGINE_URL ??
  '/8thwall/xr.js'

// ── EightWallAdapter ──

export class EightWallAdapter implements IEngineAdapter {
  readonly type = EngineType.EightWall

  private _renderer!: THREE.WebGLRenderer
  private _scene!: THREE.Scene
  private _camera!: THREE.PerspectiveCamera
  private _isRunning = false
  private _container: HTMLElement | null = null
  private _config: UnifiedARConfig | null = null
  private _canvas: HTMLCanvasElement | null = null
  private _customModules: XRPipelineModule[] = []
  /** S2：语义分割结果回调（XR8.Semantics 的 onSemanticUpdate 透传） */
  private _onSemanticsUpdate: ((info: any) => void) | null = null

  /** 注册语义分割结果监听（返回前值以便链式/覆盖管理） */
  setSemanticsListener(cb: ((info: any) => void) | null): void {
    this._onSemanticsUpdate = cb
  }

  // Plane detection fields
  private _reticle: THREE.Group | null = null
  private _reticleRing: THREE.Mesh | null = null
  private _reticleDot: THREE.Mesh | null = null
  private _isPlaced = false
  private _hasPlaced = false
  private _placedObject: THREE.Group | null = null
  private _hintEl: HTMLElement | null = null
  private _lastHit: XRHitTestResult | null = null
  private _tapHandler: (() => void) | null = null
  private _touchTapHandler: ((e: TouchEvent) => void) | null = null
  private _modelUrl: string = ''
  private _videoUrl: string = ''
  private _scale: number = 1
  private _position: [number, number, number] = [0, 0, 0]

  // 模型包装组引用（供工具栏控制）
  private _modelWrapper: THREE.Group | null = null
  private _videoPlayer: VideoPlayer | null = null
  private _sizeTmp = new THREE.Vector2()

  // ── 快照重定位器 (SLAM 漂移修正) ──
  private _relocalizer: SnapshotRelocalizer | null = null
  /** 重定位器修正冷却时间戳（防频繁误触发） */
  private _relocCooldownUntil = 0
  private _videoElement: HTMLVideoElement | null = null
  /** 启动重试计数（最多 1 次额外重试） */
  private _startRetryCount = 0

  // ── 稳定性滤波 ──
  /** 视觉特征点跟踪（手机静止检测） */
  private _visualTracker: VisualFeatureTracker | null = null
  private _stabInitialized = false
  /** 平滑后的相机位置（lazy follow 原始 SLAM 位姿，仅用于 jitter 计算） */
  private _smoothCamPos = new THREE.Vector3()
  /** 平滑后的相机旋转（仅用于 jitter 四元数计算） */
  private _smoothCamQuat = new THREE.Quaternion()
  /** 平滑后的投影矩阵 intrinsics（解决物体大小变化） */
  private _smoothProj: Float64Array | null = null
  /** 放置时的世界坐标（jitter 抵消基准） */
  private _placedWorldPos = new THREE.Vector3()

  /** FPS 帧计数器 */
  private _fpsFrameCount = 0
  private _fpsLastTime = 0
  private _currentFps = 0
  /** 引擎启动时间戳（用于 fps 首次计算） */
  private _engineStartTime = 0
  /** 基础平滑系数（用于旋转 SLERP 的起点） */
  private readonly _stabBaseAlpha = 0.08
  /** 预分配的临时四元数（减少 GC） */
  private _tmpQuat = new THREE.Quaternion()
  private _tmpQuat2 = new THREE.Quaternion()

  // ── A+C 稳定性增强 ──
  /** 抖动幅度运行平均值（C-自适应） */
  private _avgJitter = 0
  /** 当前特征点数量（用于 UI 展示） */
  private _lastFeatureCount = 0
  /** 当前特征点跟踪置信度 */
  private _lastFeatureConfidence = 0
  /** 连续低特征帧计数（用于冻结判定） */
  private _lowFeatureFrames = 0
  /** 冻结时的相机锁定位姿（用于检测手机是否已移动） */
  private _lockPos = new THREE.Vector3()
  private _lockQuat = new THREE.Quaternion()

  // ── 灯光引用（用于 detach 清理） ──
  private _ambientLight: THREE.AmbientLight | null = null
  private _dirLight: THREE.DirectionalLight | null = null
  private _fillLight: THREE.DirectionalLight | null = null

  // ── 放置面模式运行时切换 ──
  /** 覆盖 config 中的 placementMode，null=使用 config */
  private _placementOverride: 'horizontal' | 'vertical' | 'any' | null = null

  /** PvZ 游戏模式：放置后不加载任何内容，由 AREngine 接管（见 ar-engine.ts onPlaced） */
  private _pvzMode = false

  // External callbacks
  onTrackingStatus: ((found: boolean) => void) | null = null
  onModelStatus: ((status: 'loading' | 'loaded' | 'error', pct?: number) => void) | null = null
  /** 放置完成后回调（参数为放置位置的世界坐标），用于 AREngine 桥接闭环 */
  onPlaced: ((worldPosition: THREE.Vector3) => void) | null = null
  /** 特征点质量回调（可选的视觉反馈） */
  onFeatureQuality: ((quality: { features: number; confidence: number; quality: 'good' | 'fair' | 'poor' }) => void) | null = null

  get renderer(): THREE.WebGLRenderer { return this._renderer }
  get scene(): THREE.Scene { return this._scene }
  get camera(): THREE.PerspectiveCamera { return this._camera }
  get isRunning(): boolean { return this._isRunning }
  /** 点击放置后创建的世界坐标放置组（PvZ 模式下游戏棋盘挂载点） */
  get placedObject(): THREE.Group | null { return this._placedObject }
  /** SLAM 摄像头视频元素（用于重定位器快照捕获） */
  get videoElement(): HTMLVideoElement | null { return this._videoElement }
  /** 快照重定位器（SLAM 漂移修正） */
  get relocalizer(): SnapshotRelocalizer | null { return this._relocalizer }

  getSupportedCapabilities(): CapabilityType[] {
    return [
      CapabilityType.WorldTracking,
      CapabilityType.FaceEffects,
      CapabilityType.SkyEffects,
      CapabilityType.ImageTracking,
      CapabilityType.PlaneDetection,
    ]
  }

  async initialize(container: HTMLElement, config: UnifiedARConfig): Promise<void> {
    this._container = container
    this._config = config

    // 提取模型/视频配置
    if (config.model) {
      this._modelUrl = config.model.url || ''
      this._scale = config.model.scale ?? 1
      this._position = config.model.position ?? [0, 0, 0]
    }
    this._videoUrl = config.videoUrl || ''

    // PvZ 模式：清空模型/视频，放置后只建放置组，内容由 AREngine 的 PvzController 接管
    this._pvzMode = config.eightWall?.pvzMode ?? false
    if (this._pvzMode) {
      this._modelUrl = ''
      this._videoUrl = ''
    }

    this._createCanvas()

    // 8th Wall Three.js 管线模块需要 window.THREE 全局变量
    window.THREE = THREE

    // 加载 8th Wall 引擎（本地文件，预加载 SLAM）
    const engineUrl = config.eightWall?.engineUrl ?? DEFAULT_ENGINE_URL
    console.log('[EightWall] 加载引擎:', engineUrl)
    try {
      await loadScript(engineUrl, { 'data-preload-chunks': 'slam' })
    } catch (err) {
      throw new Error(
        `8th Wall 引擎脚本加载失败（${engineUrl}）：请确认站点已部署该脚本` +
        `（前端 public/8thwall/xr.js），或通过 VITE_8THWALL_ENGINE_URL 指定地址。` +
        `原始错误：${(err as Error).message}`,
      )
    }
    try {
      await waitForGlobal('XR8', 30000)
    } catch (err) {
      throw new Error(
        `8th Wall 引擎脚本已加载但未暴露全局 XR8（${engineUrl}）：脚本可能不是有效的 8th Wall 构建产物，` +
        `或域名/密钥不被许可。原始错误：${(err as Error).message}`,
      )
    }
    console.log('[EightWall] 引擎已加载')

    // 创建快照重定位器（如果启用且为平面放置模式）
    if (config.eightWall?.snapshotRelocalizer !== false) {
      this._relocalizer = new SnapshotRelocalizer()
      console.log('[EightWall] 快照重定位器已初始化')
    }
  }

  // 已注册的管线模块名（用于 stop 时清理）
  private _ownModuleNames: string[] = []

  /** 注册失败的模块（用于向上层报告"能力降级"而不是"整体失败"） */
  private _failedModules: { name: string; message: string }[] = []

  /**
   * 部分模块缺失时仍可用的能力清单，例如 SLAM 缺席时平面检测就不可用。
   * 由 ARAEngine 读取后展示给用户，避免只给一句无从下手的英文报错。
   */
  get failedModules(): { name: string; message: string }[] {
    return [...this._failedModules]
  }

  /** 添加管线模块并跟踪其名称 */
  private _addModule(mod: XRPipelineModule): void {
    if (window.XR8) {
      const moduleName = mod?.name || '(未命名模块)'

      // 先移除同名模块再添加，确保 StrictMode 或其他场景下模块不会残留。
      // 首次加载时会产生若干 "not found" warning，但保证第二次 mount 不会
      // 因第一次的残留模块导致 "already added"。
      try { window.XR8.removeCameraPipelineModule(moduleName) } catch { /* 首次本就不存在 */ }

      /*
       * 逐个模块隔离失败。
       *
       * 自托管的 8th Wall 副本是按需加载的：`xr.js` 只会惰性拉同目录的
       * `xr-slam.js` / `xr-face.js`，其它管线模块（平面检测等）在这份快照里
       * 可能整块缺失。缺模块时 8th Wall 的 `onAttach` 会在内部对 null 解引用，
       * 抛 `Cannot read properties of null (reading 'destroy')` ——
       * 之前它直接把整个 AR 会话打成「AR 加载失败」，用户只看到一句英文报错，
       * 完全不知道是"这台设备/这份产物不支持平面检测"。
       *
       * 现在按模块隔离：坏掉一个就跳过它，其余模块照常工作，
       * 失败清单向上暴露，让 UI 能给出可读的降级提示。
       */
      try {
        window.XR8.addCameraPipelineModule(mod)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!this._failedModules.some((f) => f.name === moduleName)) {
          this._failedModules.push({ name: moduleName, message })
        }
        console.warn(`[EightWall] 管线模块「${moduleName}」注册失败，已跳过：`, err)
        return
      }

      if (!this._ownModuleNames.includes(moduleName)) {
        this._ownModuleNames.push(moduleName)
      }
      return
    }

    const moduleName = mod.name
    if (moduleName && !this._ownModuleNames.includes(moduleName)) {
      this._ownModuleNames.push(moduleName)
    }
  }

  async start(): Promise<void> {
    const XR8 = window.XR8!
    let canvas = this._canvas!
    const container = this._container!

    // ── 管线模块注册（顺序 = 生命周期调用顺序，按官方推荐） ──

    // 1. GlTextureRenderer — 渲染摄像头画面到屏幕
    this._addModule(XR8.GlTextureRenderer.pipelineModule())

    // 2. Three.js 模块 — 创建 scene/camera/renderer（依赖 GL 上下文，onStart 中创建）
    this._addModule(this.createThreeJsModule())

    // 3. XrController — SLAM 世界追踪 + 平面检测（模块内部 name: "reality"）
    this._addModule(XR8.XrController.pipelineModule())

    // 4. 已注册的自定义模块
    for (const mod of this._customModules) {
      this._addModule(mod)
    }

    // 4b. S2 语义分割：feature-detect（自托管包是否真的暴露 XR8.Semantics），
    //     不做假实现——没有就跳过并告警，绝不影响其他模块。
    try {
      const Sem = (XR8 as any).Semantics
      if (Sem?.pipelineModule) {
        this._addModule(Sem.pipelineModule())
        if (Sem.configure) {
          Sem.configure({
            assetsPath: '/8thwall/resources/',
            onSemanticUpdate: (info: any) => {
              this._onSemanticsUpdate?.(info)
            },
          })
        }
        console.log('[EightWall] 语义分割已启用（XR8.Semantics）')
      } else {
        console.warn('[EightWall] 自托管包不含 XR8.Semantics，语义分割跳过')
      }
    } catch (err) {
      console.warn('[EightWall] 语义分割启用失败（不影响其他模块）', err)
    }

    // 5. 应用模块 — 平面检测、reticle、点击放置（依赖 Three.js 场景已就绪）
    this._addModule(this.createPlaneDetectionModule(container))

    // 启用平面检测（也在模块 onStart 中配置，此处提前确保生效）
    try {
      XR8.XrController.configure({ surfaceEstimation: true })
    } catch (e) {
      console.warn('[EightWall] pre-run configure surfaceEstimation 失败:', e)
    }

    // 启动（最多重试 2 次）
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await XR8.run({
          canvas,
          allowedDevices: XR8.XrConfig.device().ANY,
        })
        break // 成功后跳出重试循环
      } catch (e) {
        // XR8.run 失败时清理已注册模块
        for (const name of this._ownModuleNames) {
          try { XR8.removeCameraPipelineModule(name) } catch {}
        }
        this._ownModuleNames = []
        if (attempt >= 2) throw e
        console.warn(`[EightWall] XR8.run 第 ${attempt} 次失败，重试...`, e)
        // 重试前释放 WebGL 上下文并创建新 canvas
        this._releaseWebGLResources()
        canvas = this._createCanvas()
        await new Promise(r => setTimeout(r, 500))
      }
    }

    // 验证摄像头是否启动（xr.js 内部可能静默失败，不抛异常但 pipeline 不工作）
    console.log('[EightWall] 等待摄像头就绪...')
    let waited = 0
    while (!this._videoElement && waited < 5000) {
      await new Promise(r => setTimeout(r, 200))
      waited += 200
    }
    if (!this._videoElement) {
      console.warn('[EightWall] 首次等待 5s 后摄像头未就绪，进入重试路径')
      // 清理模块
      for (const name of this._ownModuleNames) {
        try { XR8.removeCameraPipelineModule(name) } catch {}
      }
      this._ownModuleNames = []

      // 重试一次：先释放全部 GL 资源再重新注册和启动
      if (this._startRetryCount < 1) {
        this._startRetryCount++
        console.warn('[EightWall] 摄像头未就绪，释放 GL 资源后重试')
        this._releaseWebGLResources()
        canvas = this._createCanvas()
        // 重新注册模块
        this._ownModuleNames = []
        this._addModule(XR8.GlTextureRenderer.pipelineModule())
        this._addModule(this.createThreeJsModule())
        this._addModule(XR8.XrController.pipelineModule())
        for (const mod of this._customModules) { this._addModule(mod) }
        this._addModule(this.createPlaneDetectionModule(container))
        try { XR8.XrController.configure({ surfaceEstimation: true }) } catch {}

        let retryOk = false
        try {
          await XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().ANY })
          // 再次等待摄像头
          let waited2 = 0
          while (!this._videoElement && waited2 < 5000) {
            await new Promise(r => setTimeout(r, 200))
            waited2 += 200
          }
          if (this._videoElement) retryOk = true
        } catch {}
        if (retryOk) { this._isRunning = true; return }
      }

      throw new Error(
        '摄像头启动超时 — 8th Wall 引擎内部初始化失败。' +
        '可能原因：① WebGL 上下文耗尽（多次测试后请关闭其他标签页重试）；' +
        '② 摄像头权限被拒绝；③ 请使用 HTTPS 访问。'
      )
    }

    this._isRunning = true
  }

  async stop(): Promise<void> {
    const XR8 = window.XR8

    // 1. 移除模块（同步）
    if (XR8) {
      for (const name of this._ownModuleNames) {
        try { XR8.removeCameraPipelineModule(name) } catch { /* 忽略 */ }
      }
    }
    this._ownModuleNames = []

    // 2. 停止引擎 — 无论 _isRunning 都尝试。
    //    StrictMode 下 stop() 可能在 XR8.run() 完成前调用，此时 _isRunning === false，
    //    但 XR8 内部 pipeline 已开始初始化，必须显式停止。try/catch 处理未完全初始化的场景。
    if (XR8) {
      try {
        await XR8.stop()
      } catch (e) {
        // XR8.stop 在 pipeline 未完全初始化时可能抛异常，忽略
      }
    }

    // 2b. 释放 WebGL 资源（上下文 + canvas）
    this._releaseWebGLResources()

    // 防御性清理：onDetach 可能未触发（XR8 异常），确保事件监听和 DOM 被清理
    if (this._tapHandler && this._container) {
      this._container.removeEventListener('click', this._tapHandler)
      this._tapHandler = null
    }
    if (this._touchTapHandler && this._container) {
      this._container.removeEventListener('touchstart', this._touchTapHandler)
      this._touchTapHandler = null
    }
    ;[this._ambientLight, this._dirLight, this._fillLight].forEach(l => {
      if (l) this._scene?.remove(l)
    })
    this._ambientLight = null
    this._dirLight = null
    this._fillLight = null

    // 清理 reticle
    this._disposeReticle()

    // 清理 hint
    if (this._hintEl && this._hintEl.parentNode) {
      this._hintEl.parentNode.removeChild(this._hintEl)
      this._hintEl = null
    }

    // 清理视觉特征跟踪器
    this._visualTracker = null

    // 重置快照重定位器
    this._relocalizer?.reset()
    this._videoElement = null

    // 清理视频播放器
    if (this._videoPlayer) {
      this._videoPlayer.dispose()
      this._videoPlayer = null
    }

    // 清理放置的物体
    this._placedObject = null
    this._hasPlaced = false
    this._isPlaced = false
    this._resetStabilization()
    this._isRunning = false
  }

  update(_frameDelta: number): void {
    // 8th Wall 通过管线系统自动每帧更新
  }

  async switchCamera(): Promise<void> {
    console.warn('[EightWall] switchCamera 未在平面检测模式实现')
  }

  capturePhoto(): string | null {
    if (this._renderer) {
      return this._renderer.domElement.toDataURL('image/png')
    }
    return null
  }

  dispose(): void {
    this.stop()
    this._customModules = []
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas)
    }
    this._canvas = null
    this._container = null
    this._config = null
  }

  /**
   * 创建并挂载 8th Wall canvas 到容器。
   * 先移除已有 8th Wall canvas 确保无残留。
   */
  private _createCanvas(): HTMLCanvasElement {
    const container = this._container!
    const existingCanvas = container.querySelector('canvas[data-eightwall]')
    if (existingCanvas) {
      existingCanvas.parentNode?.removeChild(existingCanvas)
    }
    const canvas = document.createElement('canvas')
    canvas.setAttribute('data-eightwall', '')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.objectFit = 'cover'
    container.appendChild(canvas)
    this._canvas = canvas
    return canvas
  }

  // ── 公共辅助方法 ──

  addPipelineModule(module: XRPipelineModule): void {
    this._customModules.push(module)
    if (this._isRunning && window.XR8) {
      window.XR8.addCameraPipelineModule(module)
    }
  }

  removePipelineModule(name: string): void {
    this._customModules = this._customModules.filter(m => m.name !== name)
    if (this._isRunning && window.XR8) {
      window.XR8.removeCameraPipelineModule(name)
    }
  }

  // ── 自定义 Three.js 管线模块 ──

  /**
   * 创建 Three.js 管线模块
   *
   * 所有 Three.js 资源（scene/camera/renderer）在 onStart 中创建。
   * 8th Wall 的 onStart 回调提供 canvas 和 GLctx 参数（无需等 onAttach）。
   *
   * 注意：onStart 在 onAttach 之前触发，这是 8th Wall 的标准生命周期：
   *   onBeforeRun → onStart → onAttach → onProcessGpu → onProcessCpu → onUpdate → onRender
   */
  private createThreeJsModule(): XRPipelineModule {
    const adapter = this

    return {
      name: 'eightwall-threejs',

      onStart: ({canvas, GLctx}: any) => {
        // scene（不依赖 GL）
        const scene = new THREE.Scene()
        // camera（不依赖 GL）
        const camera = new THREE.PerspectiveCamera(60, canvas.width / canvas.height, 0.01, 1000)
        // renderer（复用 8th Wall 的 WebGL 上下文）
        const renderer = new THREE.WebGLRenderer({
          canvas,
          context: GLctx,
          alpha: false,
          antialias: true,
        })
        renderer.autoClear = false
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(canvas.width, canvas.height)

        adapter._scene = scene
        adapter._camera = camera
        adapter._renderer = renderer

        // 初始化 FPS 计时
        adapter._fpsLastTime = performance.now()
        adapter._fpsFrameCount = 0

        console.log('[EightWall] Three.js 场景已创建 (onStart)')
      },

      onCanvasSizeChange: ({canvasWidth, canvasHeight}: any) => {
        if (adapter._renderer) {
          adapter._renderer.setSize(canvasWidth, canvasHeight)
        }
      },

      onUpdate: ({processCpuResult}: any) => {
        if (!adapter._camera) return

        const reality = processCpuResult.reality
        if (reality && reality.intrinsics) {
          const {rotation, position, intrinsics} = reality
          if (adapter._hasPlaced) {
            // 放置后：EMA 平滑投影矩阵 intrinsics，消除高频 focal length 波动导致物体大小变化
            const pa = 0.15
            if (!adapter._smoothProj) {
              adapter._smoothProj = new Float64Array(intrinsics)
            } else {
              const sp = adapter._smoothProj
              for (let i = 0; i < 16; i++) {
                sp[i] += (intrinsics[i] - sp[i]) * pa
              }
            }
            for (let i = 0; i < 16; i++) {
              adapter._camera.projectionMatrix.elements[i] = adapter._smoothProj[i]
            }
          } else {
            for (let i = 0; i < 16; i++) {
              adapter._camera.projectionMatrix.elements[i] = intrinsics[i]
            }
          }
          adapter._camera.projectionMatrixInverse?.copy(adapter._camera.projectionMatrix).invert()
          if (rotation) adapter._camera.setRotationFromQuaternion(rotation)
          if (position) adapter._camera.position.set(position.x, position.y, position.z)
        }
      },

      onRender: () => {
        if (adapter._renderer && adapter._scene && adapter._camera) {
          adapter._renderer.render(adapter._scene, adapter._camera)
        }
        adapter._fpsFrameCount++
        const now = performance.now()
        if (now - adapter._fpsLastTime >= 1000) {
          adapter._currentFps = Math.round(adapter._fpsFrameCount * 1000 / (now - adapter._fpsLastTime))
          adapter._fpsFrameCount = 0
          adapter._fpsLastTime = now
        }
      },
    }
  }

  // ── 平面检测模块 ──

  /**
   * 从 UnifiedARConfig 中提取平面放置模式
   */
  private get _placementMode(): 'horizontal' | 'vertical' | 'any' {
    if (this._placementOverride) return this._placementOverride
    const planeCap = this._config?.capabilities?.find(
      (c: any) => c.type === CapabilityType.PlaneDetection
    ) as any
    return planeCap?.placementMode || 'horizontal'
  }

  /**
   * 判断 hitTest 结果是否匹配当前放置模式
   *
   * 8th Wall Web SDK 的 hitTest 仅返回 FEATURE_POINT 类型，没有可靠的法线。
   * reticle 不限制（让用户看到所有特征点位置），只在 tap 放置时做过滤。
   */
  private _matchesPlacementMode(_hit: XRHitTestResult): boolean {
    return true
  }

  /**
   * 创建平面检测 AR 管线模块
   *
   * 流程：
   * 1. 启用 surfaceEstimation（平面检测）
   * 2. 创建 reticle 圆环指示器
   * 3. 每帧通过 hitTest 检测平面 → 更新 reticle 位置
   * 4. 点击屏幕 → 在 reticle 位置放置模型/视频
   */
  private createPlaneDetectionModule(container: HTMLElement): XRPipelineModule {
    const adapter = this
    let reticle: THREE.Group | null = null
    let ringMesh: THREE.Mesh | null = null
    let dotMesh: THREE.Mesh | null = null
    let hintEl: HTMLElement | null = null

    return {
      name: 'eightwall-plane-detection',

      onStart: () => {
        const XR8 = window.XR8!
        // 场景/相机/渲染器在 eightwall-threejs.onStart 中创建
        // 模块注册顺序（GlTextureRenderer → threejs → XrController → planeDetection）
        // 保证此模块的 onStart 在 threejs.onStart 之后调用
        if (!adapter._scene || !adapter._camera || !adapter._renderer) {
          console.warn('[EightWall] Three.js 场景尚未就绪，延迟初始化')
          return
        }

        // 配置渲染器尺寸（可能在上一模块的 onStart 中才创建）
        if (adapter._renderer) {
          adapter._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
          adapter._renderer.setSize(container.clientWidth, container.clientHeight)
        }

        // 添加灯光（先清理上一次残留，防止 reattach 泄漏）
        ;[adapter._ambientLight, adapter._dirLight, adapter._fillLight].forEach(l => {
          if (l) adapter._scene.remove(l)
        })
        const ambient = new THREE.AmbientLight(0xffffff, 1.5)
        adapter._scene.add(ambient)
        adapter._ambientLight = ambient

        const directional = new THREE.DirectionalLight(0xffffff, 2)
        directional.position.set(0, 3, 3)
        adapter._scene.add(directional)
        adapter._dirLight = directional

        const fill = new THREE.DirectionalLight(0xffffff, 0.5)
        fill.position.set(-2, 1, -2)
        adapter._scene.add(fill)
        adapter._fillLight = fill

        // 配置平面检测
        try {
          XR8.XrController.configure({ surfaceEstimation: true })
          console.log('[EightWall] 平面检测已启用 (surfaceEstimation)')
        } catch (e) {
          console.warn('[EightWall] 配置 surfaceEstimation 失败:', e)
        }

        // 创建 reticle（圆环指示器）
        const group = new THREE.Group()

        const ringGeom = new THREE.RingGeometry(0.08, 0.14, 48)
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x4f8cff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        })
        ringMesh = new THREE.Mesh(ringGeom, ringMat)
        ringMesh.rotation.x = -Math.PI / 2  // 平躺
        group.add(ringMesh)

        const dotGeom = new THREE.CircleGeometry(0.015, 16)
        const dotMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.6,
        })
        dotMesh = new THREE.Mesh(dotGeom, dotMat)
        dotMesh.rotation.x = -Math.PI / 2  // 平躺
        dotMesh.position.z = 0.001          // 防止 z-fighting
        group.add(dotMesh)

        group.visible = false
        adapter._scene.add(group)

        adapter._reticle = group
        adapter._reticleRing = ringMesh
        adapter._reticleDot = dotMesh

        console.log('[EightWall] 平面检测模块已启动，等待平面检测')
      },

      onCameraStatusChange: (args) => {
        console.log(`[EightWall] onCameraStatusChange: ${args.status}`, args.video ? '有 video' : '无 video')
        if (args.status === 'hasVideo' && args.video) {
          adapter._videoElement = args.video
          console.log('[EightWall] 已获取视频元素引用')
          // 尽早创建视觉特征跟踪器（不再等 tap 后创建，确保特征质量指示器可用）
          if (!adapter._visualTracker) {
            adapter._visualTracker = new VisualFeatureTracker(160, 120)
            console.log('[EightWall] 视觉特征跟踪器已创建')
          }
        }
      },

      onUpdate: () => {
        // 忽略渲染器尺寸变化
        if (adapter._renderer) {
          const w = container.clientWidth
          const h = container.clientHeight
          const size = adapter._renderer.getSize(adapter._sizeTmp)
          if (Math.abs(size.x - w) > 1 || Math.abs(size.y - h) > 1) {
            adapter._renderer.setSize(w, h)
          }
        }

        // 放置后：稳定性滤波（EMA 抖动抵消 + 投影矩阵平滑）
        if (adapter._hasPlaced) {
          adapter._updateStabilization()
          return
        }

        // 放置前：每帧运行视觉特征跟踪器（特征质量显示 + 稳定性数据预热）
        if (adapter._visualTracker && adapter._videoElement && adapter._videoElement.readyState >= 2) {
          try {
            const result = adapter._visualTracker.track(adapter._videoElement)
            adapter._lastFeatureCount = result.totalFeatures
            adapter._lastFeatureConfidence = result.confidence
            if (adapter.onFeatureQuality) {
              const q = result.totalFeatures > 25 ? 'good' : result.totalFeatures > 10 ? 'fair' : 'poor'
              adapter.onFeatureQuality({ features: result.totalFeatures, confidence: result.confidence, quality: q })
            }
          } catch (e) { console.warn('[EightWall] 特征跟踪器错误:', e) }
        }

        const XR8 = window.XR8!
        const scene = adapter._scene
        const camera = adapter._camera

        try {
          // 从屏幕中心做 hitTest（归一化坐标 0-1，0.5=中心）
          const rawHits = XR8.XrController.hitTest(0.5, 0.5)

          if (rawHits && rawHits.length > 0) {
            // 按放置模式过滤表面方向
            const hits = rawHits.filter(h => adapter._matchesPlacementMode(h))

            if (hits.length === 0) {
              // 无匹配方向的表面，隐藏 reticle
              if (adapter._reticle) {
                adapter._reticle.visible = false
              }
              adapter.onTrackingStatus?.(false)
              return
            }

            // 8th Wall Web SDK 仅返回 FEATURE_POINT 类型，
            // DETECTED_SURFACE / ESTIMATED_SURFACE 从未在 Web 实现
            const hit = hits[0]
            if (hit && hit.position) {
              adapter._lastHit = hit
              const p = hit.position

              // 更新 reticle 位置（reticle 保持水平，不 lookAt 相机）
              if (adapter._reticle) {
                adapter._reticle.position.set(p.x, p.y, p.z)
                adapter._reticle.visible = true
              }

              // 通知 UI：已检测到表面
              adapter.onTrackingStatus?.(true)
              return
            }
          }
        } catch (e) {
          console.warn('[EightWall] hitTest 异常:', e)
        }

        // 未检测到表面
        if (adapter._reticle) {
          adapter._reticle.visible = false
        }
        adapter.onTrackingStatus?.(false)
      },

      onAttach: () => {
        // 创建提示文字
        hintEl = document.createElement('div')
        const modeLabels: Record<string, string> = { horizontal: '水平面', vertical: '垂直面', any: '任意平面' }
        hintEl.textContent = `扫描周围环境，在${modeLabels[adapter._placementMode] || '平面'}上放置`
        hintEl.style.cssText = 'position:absolute;bottom:80px;left:50%;transform:translateX(-50%);'
          + 'color:rgba(255,255,255,0.9);font-size:14px;font-weight:500;'
          + 'background:rgba(0,0,0,0.4);padding:8px 20px;border-radius:20px;'
          + 'pointer-events:none;z-index:10;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.1);'
          + 'transition:opacity 0.5s ease'
        container.appendChild(hintEl)
        adapter._hintEl = hintEl

        // 点击放置处理器
        const onTap = () => {
          if (adapter._hasPlaced || !adapter._lastHit) return

          // 放置模式下过滤：水平面要求击中点在相机下方，垂直面在相机高度
          if (adapter._camera) {
            const mode = adapter._placementMode
            const hitY = adapter._lastHit.position?.y ?? 0
            const camY = adapter._camera.position.y
            if (mode === 'horizontal' && camY - hitY < 0.15) {
              console.log('[EightWall] 跳过 — 非水平面，切换至垂直面模式可放置在墙面')
              return
            }
            if (mode === 'vertical' && camY - hitY > 0.3) {
              console.log('[EightWall] 跳过 — 非垂直面，切换至水平面模式可放置在地面')
              return
            }
          }

          adapter._hasPlaced = true

          // 隐藏 reticle
          if (adapter._reticle) {
            adapter._reticle.visible = false
          }

          // 隐藏提示
          if (adapter._hintEl) {
            adapter._hintEl.style.opacity = '0'
            setTimeout(() => {
              if (adapter._hintEl && adapter._hintEl.parentNode) adapter._hintEl.parentNode.removeChild(adapter._hintEl)
            }, 500)
          }

          // 在 reticle 当前位置放置物体
          const hitPos = adapter._reticle ? adapter._reticle.position : adapter._lastHit.position

          // 创建放置组，直接放在 reticle 位置（不做 Y 投影——之前 Y>0.5 强行投到地面导致物体偏离蓝圈）
          const placedGroup = new THREE.Group()
          placedGroup.position.set(hitPos.x, hitPos.y, hitPos.z)

          adapter._scene.add(placedGroup)
          adapter._placedObject = placedGroup

          // 加载模型或视频
          if (adapter._pvzMode) {
            // PvZ：不加载任何内容（棋盘/僵尸由 AREngine 在 onPlaced 中创建）
            adapter.onModelStatus?.('loaded')
          } else if (adapter._videoUrl) {
            adapter._loadVideoInPlane(placedGroup)
          } else if (adapter._modelUrl) {
            adapter._loadModelInPlane(placedGroup)
          } else {
            // 占位方块
            const box = new THREE.Mesh(
              new THREE.BoxGeometry(0.3, 0.3, 0.3),
              new THREE.MeshStandardMaterial({ color: 0x22c55e })
            )
            box.position.y = 0.15
            placedGroup.add(box)
            adapter.onModelStatus?.('loaded')
          }

          // 初始化稳定性滤波
          adapter._initStabilization(placedGroup)

          adapter._isPlaced = true
          adapter.onTrackingStatus?.(true)
          console.log('[EightWall] 模型已放置在:', hitPos)

          // 放置后捕获快照（重定位器用）
          if (adapter._relocalizer && adapter._videoElement && adapter._camera) {
            adapter._relocalizer.capture(adapter._videoElement, adapter._camera.position, adapter._camera.quaternion)
            console.log('[EightWall] 快照已捕获')
          }

          // 通知 AREngine 桥接闭环
          adapter.onPlaced?.(new THREE.Vector3(hitPos.x, hitPos.y, hitPos.z))
        }

        container.addEventListener('click', onTap)
        const touchHandler = (e: TouchEvent) => {
          if (e.changedTouches.length === 1) {
            e.preventDefault()
            onTap()
          }
        }
        container.addEventListener('touchstart', touchHandler)
        adapter._touchTapHandler = touchHandler

        adapter._tapHandler = onTap
      },

      onDetach: () => {
        if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl)
        if (adapter._reticle) {
          adapter._scene?.remove(adapter._reticle)
        }
        adapter._disposeReticle()
        adapter._reticle = null
        adapter._reticleRing = null
        adapter._reticleDot = null
        adapter._lastHit = null
        if (adapter._tapHandler) {
          container.removeEventListener('click', adapter._tapHandler)
          adapter._tapHandler = null
        }
        if (adapter._touchTapHandler) {
          container.removeEventListener('touchstart', adapter._touchTapHandler)
          adapter._touchTapHandler = null
        }
        // 清理灯光
        ;[adapter._ambientLight, adapter._dirLight, adapter._fillLight].forEach(l => {
          if (l) adapter._scene?.remove(l)
        })
        adapter._ambientLight = null
        adapter._dirLight = null
        adapter._fillLight = null
      },
    }
  }

  /**
   * 在平面检测模式下加载 3D 模型（当前使用红立方体占位）
   */
  private _loadModelInPlane(parent: THREE.Group): void {
    this.onModelStatus?.('loading', 0)
    this._modelWrapper = new THREE.Group()
    parent.add(this._modelWrapper)

    const url = this._modelUrl
    if (!url) {
      // 未配置模型时保留红立方体占位（0.2m）
      const geom = new THREE.BoxGeometry(0.2, 0.2, 0.2)
      const cube = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.3 }))
      cube.position.y = 0.1
      this._modelWrapper.add(cube)
      this.onModelStatus?.('loaded')
      console.log('[EightWall] 未配置模型，红立方体占位')
      return
    }

    // 真正加载用户模型（与主路径 loadModel 一致：支持 Draco 压缩）
    const loader = new GLTFLoader()
    const draco = new DRACOLoader()
    draco.setDecoderPath('/draco/')
    loader.setDRACOLoader(draco)

    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene
        const okWrapper = this._modelWrapper
        if (!okWrapper) return
        okWrapper.add(model)
        this.onModelStatus?.('loaded')
        console.log('[EightWall] 模型加载成功:', url)
      },
      (xhr) => {
        if (xhr.total) this.onModelStatus?.('loading', xhr.loaded / xhr.total)
      },
      (err: any) => {
        console.error('[EightWall] 模型加载失败:', err?.message || err)
        // 失败回落红立方体占位，保证放置体验不空白
        const wrapper = this._modelWrapper
        if (!wrapper) return
        const geom = new THREE.BoxGeometry(0.2, 0.2, 0.2)
        const cube = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.3 }))
        cube.position.y = 0.1
        wrapper.add(cube)
        this.onModelStatus?.('error')
      },
    )
  }

  /**
   * 在平面检测模式下加载视频
   */
  private _loadVideoInPlane(parent: THREE.Group): void {
    const url = this._videoUrl
    if (!url) return

    this.onModelStatus?.('loading', 0)

    const player = new VideoPlayer({
      videoUrl: url,
      muted: false,
      loop: true,
    })

    // 视频平面放在放置位置正前方
    player.load(parent, new THREE.Vector3(0, 0.15, 0)).then(() => {
      this.onModelStatus?.('loaded')
      console.log('[EightWall] 视频平面已加载到平面')
      player.play().catch(() => {})
    }).catch((err) => {
      console.error('[EightWall] 视频加载失败:', err)
      this.onModelStatus?.('error')
    })

    this._videoPlayer = player
    player.bindClick(this._container!)
  }

  // ── 公共控制接口（工具栏调用） ──

  /** 设置模型缩放 */
  setModelScale(x: number, y: number, z: number): void {
    if (this._modelWrapper) this._modelWrapper.scale.set(x, y, z)
  }

  /** 设置模型位置偏移（相对放置点） */
  setModelPosition(x: number, y: number, z: number): void {
    if (this._modelWrapper) this._modelWrapper.position.set(x, y, z)
  }

  /** 设置模型 Y 轴旋转（弧度） */
  setModelRotationY(radians: number): void {
    if (this._modelWrapper) this._modelWrapper.rotation.y = radians
  }

  /** 获取当前 Y 轴旋转（弧度） */
  getModelRotationY(): number {
    return this._modelWrapper?.rotation.y ?? 0
  }

  /** 重置旋转 */
  resetRotation(): void {
    if (this._modelWrapper) this._modelWrapper.rotation.y = 0
  }

  /** 是否已完成放置 */
  get hasPlaced(): boolean { return this._hasPlaced }

  /** 获取当前放置面模式 */
  get placementMode(): 'horizontal' | 'vertical' | 'any' { return this._placementMode }

  /**
   * 运行时切换放置面模式
   * 水平面（地面/桌面）| 垂直面（墙面）| 任意
   */
  setPlacementMode(mode: 'horizontal' | 'vertical' | 'any'): void {
    this._placementOverride = mode
    // 更新提示文字
    const modeLabels: Record<string, string> = { horizontal: '水平面', vertical: '垂直面', any: '任意平面' }
    const label = `扫描周围环境，在${modeLabels[mode] || '平面'}上放置`
    if (this._hintEl) {
      this._hintEl.textContent = label
      this._hintEl.style.opacity = '1'
    }
    console.log(`[EightWall] 放置模式切换为: ${mode} (${modeLabels[mode]})`)
  }

  /**
   * 重新放置 — 移除当前物体，恢复 reticle，让用户再次点击放置
   */
  replacePlacedObject(): void {
    if (!this._hasPlaced) return

    // 移除当前放置的物体
    if (this._placedObject) {
      this._scene?.remove(this._placedObject)
      this._placedObject.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material?.dispose()
          }
        }
      })
      this._placedObject = null
    }

    if (this._videoPlayer) {
      this._videoPlayer.dispose()
      this._videoPlayer = null
    }
    this._modelWrapper = null
    this._hasPlaced = false
    this._isPlaced = false

    // 恢复 reticle
    if (this._reticle) {
      this._reticle.visible = false  // onUpdate 会在检测到表面时显示
    }

    // 恢复提示文字
    if (!this._hintEl) {
      const hint = document.createElement('div')
      const modeLabels: Record<string, string> = { horizontal: '水平面', vertical: '垂直面', any: '任意平面' }
      hint.textContent = `扫描周围环境，在${modeLabels[this._placementMode] || '平面'}上放置`
      hint.style.cssText = 'position:absolute;bottom:80px;left:50%;transform:translateX(-50%);'
        + 'color:rgba(255,255,255,0.9);font-size:14px;font-weight:500;'
        + 'background:rgba(0,0,0,0.4);padding:8px 20px;border-radius:20px;'
        + 'pointer-events:none;z-index:10;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.1);'
        + 'transition:opacity 0.5s ease'
      this._container?.appendChild(hint)
      this._hintEl = hint
    } else {
      this._hintEl.style.opacity = '1'
    }

    // 重置重定位器 + 稳定性滤波
    this._relocalizer?.reset()
    this._resetStabilization()

    console.log('[EightWall] 重新放置模式已激活')
  }

  /**
   * 重置居中 — 重新捕获当前 SLAM 相机姿态为参考
   * 当 SNapshotRelocalizer 漂移累积时调用
   */
  recenter(): void {
    if (!this._hasPlaced || !this._relocalizer || !this._videoElement || !this._camera) return

    this._relocalizer.capture(this._videoElement, this._camera.position, this._camera.quaternion)
    console.log('[EightWall] 快照参考帧已更新（居中）')
  }

  // ── 稳定性滤波 ──

  /**
   * 放置后初始化稳定性滤波
   * - 记录放置位置作为基准
   * - 初始化 VisualFeatureTracker 用于手机静止检测
   * - 初始化平滑位姿为当前 SLAM 值
   */
  private _initStabilization(placedGroup: THREE.Group): void {
    if (!this._camera) return

    this._placedWorldPos.copy(placedGroup.position)
    this._smoothCamPos.copy(this._camera.position)
    this._smoothCamQuat.copy(this._camera.quaternion)

    // 初始化视觉特征点跟踪器（如果 onCameraStatusChange 中未创建）
    if (!this._visualTracker && this._videoElement) {
      this._visualTracker = new VisualFeatureTracker(160, 120)
      console.log('[EightWall] 视觉特征跟踪器已创建（_initStabilization 中回退创建）')
    }

    this._stabInitialized = true
    this._lowFeatureFrames = 0
    console.log('[EightWall] 稳定性滤波已初始化')
  }

  /**
   * 每帧稳定性监控（放置后调用）
   *
   * 原则：SLAM 是位姿权威，不做 jitter 补偿。
   * - 任何位置滤波（EMA/OneEuro）都会在有意图移动时产生滞后，
   *   导致物体朝反方向漂移（越动越偏）
   * - 8th Wall SLAM 内部已有 IMU 融合 + 平滑
   * - 物体固定在放置位，仅通过重定位器修正 SLAM 累积漂移
   */
  private _updateStabilization(): void {
    if (!this._stabInitialized || !this._placedObject || !this._camera) return

    const rawPos = this._camera.position
    const rawQuat = this._camera.quaternion

    // 1. VisualFeatureTracker 检测 + 低特征冻结
    let freeze = false
    if (this._visualTracker && this._videoElement && this._videoElement.readyState >= 2) {
      try {
        const result = this._visualTracker.track(this._videoElement)
        this._lastFeatureCount = result.totalFeatures
        this._lastFeatureConfidence = result.confidence

        if (result.totalFeatures < 5) {
          this._lowFeatureFrames++
        } else {
          this._lowFeatureFrames = 0
        }

        if (this._lowFeatureFrames > 10 && result.totalFeatures < 3) {
          freeze = true
        }

        if (this.onFeatureQuality) {
          const q = result.totalFeatures > 25 ? 'good' : result.totalFeatures > 10 ? 'fair' : 'poor'
          this.onFeatureQuality({ features: result.totalFeatures, confidence: result.confidence, quality: q })
        }
      } catch (e) { console.warn('[EightWall] _updateStabilization 特征跟踪错误:', e) }
    }

    // 2. 更新 jitter 统计（仅用于诊断显示，不做补偿）
    const jitterX = rawPos.x - this._smoothCamPos.x
    const jitterY = rawPos.y - this._smoothCamPos.y
    const jitterZ = rawPos.z - this._smoothCamPos.z
    const jitterMag = Math.sqrt(jitterX * jitterX + jitterY * jitterY + jitterZ * jitterZ)
    this._avgJitter = this._avgJitter * 0.90 + jitterMag * 0.10
    // 缓慢跟踪 rawPos 用于 jitter 统计（alpha=0.15 → 时间常数 ~0.3s @ 22fps）
    this._smoothCamPos.lerp(rawPos, 0.15)
    this._smoothCamQuat.slerp(rawQuat, 0.15)

    // 3. 轻量 EMA 平滑物体位置（alpha=0.4 → 时间常数 ~2帧，不累积漂移）
    //    无滤波时 SLAM 帧间抖动 1-3cm 直接可见；此级别平滑压住噪声但移动时几乎无滞后感。
    const smoothAlpha = 0.4
    this._placedObject.position.lerp(this._placedWorldPos, smoothAlpha)

    // 4. SnapshotRelocalizer ZNCC 漂移修正
    if (this._relocalizer && this._videoElement && this._videoElement.readyState >= 2) {
      try {
        const relocResult = this._relocalizer.evaluate(this._videoElement, rawPos, rawQuat)
        if (relocResult.matched && relocResult.driftDelta) {
          const driftMag = relocResult.driftDelta.length()
          const now = performance.now()
          const timeOk = now > this._relocCooldownUntil
          const driftOk = driftMag > 0.03 && driftMag < 0.3
          // 门控：冷却 + 漂移范围（去掉特征数门控，CONSECUTIVE_MIN=3 已足够防止误触发）
          if (timeOk && driftOk) {
            this._placedWorldPos.sub(relocResult.driftDelta)
            this._placedObject.position.sub(relocResult.driftDelta)
            if (relocResult.driftRotDelta) {
              this._placedObject.quaternion.premultiply(relocResult.driftRotDelta)
            }
            this._relocCooldownUntil = now + 5000
            console.log(`[EightWall] 漂移修正 ${driftMag.toFixed(3)}m 冷却 5s`)
          }
        }
      } catch (e) { console.warn('[EightWall] relocalizer evaluate 异常:', e) }
    }

    // 5. 冻结模式
    if (freeze) {
      if (this._lockPos.lengthSq() === 0) {
        this._lockPos.copy(rawPos)
        this._lockQuat.copy(rawQuat)
      }

      const distFromLock = rawPos.distanceTo(this._lockPos)
      if (distFromLock > 0.15) {
        this._lockPos.copy(rawPos)
        this._lockQuat.copy(rawQuat)
        this._placedObject.position.copy(this._placedWorldPos)
        this._avgJitter = 0
        this._lowFeatureFrames = 0
        console.log('[EightWall] 检测到手机移动 >15cm，重置冻结')
      } else {
        this._placedObject.position.copy(this._placedWorldPos)
      }
      return
    }
    this._lockPos.set(0, 0, 0)
    this._lockQuat.identity()
  }

  /**
   * 返回运行时调试信息（实现 IEngineAdapter.getDebugInfo）
   */
  getDebugInfo(): import('../types/debug').DebugInfo {
    const p = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z })
    const reloc = this._relocalizer
    const jX = this._camera ? this._camera.position.x - this._smoothCamPos.x : 0
    const jY = this._camera ? this._camera.position.y - this._smoothCamPos.y : 0
    const jZ = this._camera ? this._camera.position.z - this._smoothCamPos.z : 0
    return {
      engineType: '8thwall',
      fps: this._currentFps || this._fpsFrameCount,
      rawPos: p(this._camera?.position ?? new THREE.Vector3()),
      smoothPos: p(this._smoothCamPos),
      jitter: { x: jX, y: jY, z: jZ },
      jitterMag: Math.sqrt(jX*jX + jY*jY + jZ*jZ),
      avgJitter: this._avgJitter,
      isMoving: this._avgJitter > 0.03,
      stabAlpha: this._stabBaseAlpha,
      isPlaced: this._isPlaced,
      worldPos: p(this._placedWorldPos),
      objectPos: p(this._placedObject?.position ?? new THREE.Vector3()),
      lockPos: p(this._lockPos),
      isFrozen: this._lockPos.lengthSq() > 0,
      relocCaptured: reloc?.captured ?? false,
      relocZncc: reloc?.lastZncc ?? 0,
      relocTotal: reloc?.totalCorrections ?? 0,
      relocBankSize: reloc?.bankSize ?? 0,
      relocCooldownMs: Math.max(0, this._relocCooldownUntil - performance.now()),
      relocInMotion: reloc?.inMotion ?? false,
      relocConsecutiveHits: reloc?.consecutiveHits ?? 0,
      featureCount: this._lastFeatureCount,
      featureConfidence: this._lastFeatureConfidence,
      featureQuality: this._lastFeatureCount > 25 ? 'good' : this._lastFeatureCount > 10 ? 'fair' : this._lastFeatureCount > 0 ? 'poor' : 'unknown',
      reticleVisible: this._reticle?.visible ?? false,
      planeDetectionEnabled: true,
    }
  }

  /**
   * 重置稳定性滤波状态（stop / replace 时调用）
   */
  private _resetStabilization(): void {
    this._stabInitialized = false
    this._visualTracker = null
    this._smoothProj = null
    this._smoothCamPos.set(0, 0, 0)
    this._smoothCamQuat.identity()
    this._placedWorldPos.set(0, 0, 0)
    this._avgJitter = 0
    this._lastFeatureCount = 0
    this._lastFeatureConfidence = 0
    this._lowFeatureFrames = 0
    this._lockPos.set(0, 0, 0)
    this._lockQuat.identity()
  }

  /**
   * 强制释放所有 WebGL 上下文，防止上下文泄漏导致 getContext() 返回 null。
   * 浏览器有 ~16 个 WebGL 上下文上限，canvas.remove() 不会释放，
   * 必须通过 WEBGL_lose_context 扩展显式丢上下文。
   */
  private _releaseWebGLResources(): void {
    if (this._renderer) {
      try { this._renderer.forceContextLoss() } catch { /* 忽略 */ }
      try { this._renderer.dispose() } catch { /* 忽略 */ }
      this._renderer = null as any
    }
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas)
    }
    this._canvas = null
    this._startRetryCount = 0
  }

  private _disposeReticle(): void {
    if (this._reticleRing) {
      this._reticleRing.geometry.dispose()
      if (Array.isArray(this._reticleRing.material)) {
        this._reticleRing.material.forEach(m => m.dispose())
      } else {
        this._reticleRing.material.dispose()
      }
      this._reticleRing = null
    }
    if (this._reticleDot) {
      this._reticleDot.geometry.dispose()
      if (Array.isArray(this._reticleDot.material)) {
        this._reticleDot.material.forEach(m => m.dispose())
      } else {
        this._reticleDot.material.dispose()
      }
      this._reticleDot = null
    }
  }
}
