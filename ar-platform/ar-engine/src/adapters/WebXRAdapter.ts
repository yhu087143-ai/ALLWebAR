/**
 * WebXR 引擎适配器
 *
 * 实现 IEngineAdapter 接口，封装 WebXR Device API（immersive-ar 模式）。
 * 使用 Three.js WebXR 集成 (`renderer.xr`) 管理 XR 渲染管线。
 *
 * - 平面检测：通过 WebXR Hit Test API (`XRHitTestSource`)
 * - 世界追踪：`local` reference space
 * - 点击放置：`XRSession` `select` 事件（屏幕点击触发）
 *
 * 兼容性：
 *   - Android Chrome 79+ (ARCore)
 *   - Samsung Internet
 *   - 不支持 iOS Safari（WebXR 未实现）
 *
 * 依赖：
 *   - @types/webxr ^0.5.x (已安装)
 *   - Three.js r184+ 的 WebXRManager (renderer.xr)
 *
 * API 参考:
 *   https://www.w3.org/TR/webxr/
 *   https://www.w3.org/TR/webxr-hit-test-1/
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import type { IEngineAdapter } from '../types/engine'
import type { UnifiedARConfig } from '../types/config'
import { EngineType, CapabilityType } from '../types/enums'
import { VideoPlayer } from '../video/VideoPlayer'

export class WebXRAdapter implements IEngineAdapter {
  readonly type = EngineType.WebXR

  // Three.js objects
  private _renderer!: THREE.WebGLRenderer
  private _scene!: THREE.Scene
  private _camera!: THREE.PerspectiveCamera
  private _isRunning = false

  // Container & config
  private _container: HTMLElement | null = null
  private _config: UnifiedARConfig | null = null
  private _canvas: HTMLCanvasElement | null = null

  // XR session state
  private _session: XRSession | null = null
  private _refSpace: XRReferenceSpace | null = null
  private _hitTestSource: XRHitTestSource | null = null

  // Viewer pose (camera tracking) extracted every frame
  private _viewerPose: XRViewerPose | null = null

  // Plane detection / placement
  private _reticle: THREE.Group | null = null
  private _reticleRing: THREE.Mesh | null = null
  private _reticleDot: THREE.Mesh | null = null
  private _hasPlaced = false
  private _placedObject: THREE.Group | null = null
  private _hintEl: HTMLElement | null = null
  private _lastHitPos: THREE.Vector3 | null = null
  private _lastHitMatrix: THREE.Matrix4 | null = null

  // Model / video config (from UnifiedARConfig)
  private _modelUrl: string = ''
  private _videoUrl: string = ''
  private _scale: number = 1
  private _position: [number, number, number] = [0, 0, 0]

  // Model wrapper for toolbar controls (position/scale/rotation)
  private _modelWrapper: THREE.Group | null = null

  // Event handler references for cleanup
  private _selectHandler: ((ev: Event) => void) | null = null
  private _sessionEndHandler: ((ev: Event) => void) | null = null

  // ── External callbacks ──
  onTrackingStatus: ((found: boolean) => void) | null = null
  onModelStatus: ((status: 'loading' | 'loaded' | 'error', pct?: number) => void) | null = null

  /**
   * 每 XR 帧回调（dt 单位：秒）。
   * 用于在 AR 会话中驱动自定义动画 —— 例如导览沙盘的虚拟游客巡游与 HUD 刷新。
   */
  onFrame: ((dt: number, frame?: XRFrame) => void) | null = null

  /** 放置完成回调（参数为放置点世界坐标） */
  onPlaced: ((position: THREE.Vector3) => void) | null = null

  // ── 自定义放置内容扩展（导览沙盘等非 GLB 场景） ──
  private _placementFactory: ((parent: THREE.Group) => void) | null = null
  private _placedContent: THREE.Group | null = null
  private _domOverlayRoot: HTMLElement | null = null
  private _lastFrameTime = 0

  /**
   * 注入「点击放置」时要放入的内容。
   *
   * 默认行为是从 `config.model` 加载 GLB；若通过本方法注入工厂函数，
   * 则会改为调用该工厂，由调用方把任意 Three.js 对象挂到传入的父组上
   * （例如把导览沙盘整个 group 放上去）。
   */
  setPlacementContent(factory: ((parent: THREE.Group) => void) | null): void {
    this._placementFactory = factory
  }

  /**
   * 设置 AR 会话期间需要保持可见的 DOM 覆盖层根节点。
   *
   * 这会以 `domOverlay: { root }` 请求会话 —— 没有它，immersive-ar 期间
   * 页面 DOM（HUD、按钮）会被浏览器隐藏，用户只能看到 canvas。
   */
  setDomOverlayRoot(el: HTMLElement | null): void {
    this._domOverlayRoot = el
  }

  /** 是否已完成放置 */
  get hasPlaced(): boolean {
    return this._hasPlaced
  }

  /** 已放置内容的父组（外部可对其做缩放 / 旋转） */
  get placedContentRoot(): THREE.Group | null {
    return this._placedContent
  }

  /** 清除已放置内容并恢复准星，使下一次点击可重新放置 */
  clearPlacement(): void {
    if (this._placedContent) {
      this._scene?.remove(this._placedContent)
      this._placedContent = null
    }
    this._modelWrapper = null
    this._hasPlaced = false
    this._lastHitMatrix = null
    if (this._reticle) this._reticle.visible = false
  }

  // ── IEngineAdapter getters ──

  get renderer(): THREE.WebGLRenderer { return this._renderer }
  get scene(): THREE.Scene { return this._scene }
  get camera(): THREE.PerspectiveCamera { return this._camera }
  get isRunning(): boolean { return this._isRunning }

  getSupportedCapabilities(): CapabilityType[] {
    return [
      CapabilityType.PlaneDetection,
      CapabilityType.WorldTracking,
    ]
  }

  // ── Lifecycle ──

  async initialize(container: HTMLElement, config: UnifiedARConfig): Promise<void> {
    this._container = container
    this._config = config

    // Extract model / video config from unified config
    if (config.model) {
      this._modelUrl = config.model.url || ''
      this._scale = config.model.scale ?? 1
      this._position = config.model.position ?? [0, 0, 0]
    }
    this._videoUrl = config.videoUrl || ''

    // Check WebXR support
    const xr = navigator.xr
    if (!xr) {
      throw new Error('WebXR not available on this device/browser')
    }
    if (!(await xr.isSessionSupported('immersive-ar'))) {
      throw new Error('immersive-ar session not supported on this device/browser')
    }

    // Create full-viewport canvas
    const canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.objectFit = 'cover'
    container.appendChild(canvas)
    this._canvas = canvas

    console.log('[WebXR] initialize: canvas created, WebXR ready')
  }

  async start(): Promise<void> {
    const canvas = this._canvas!
    const container = this._container!

    // ── Three.js renderer ──
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.xr.enabled = true
    this._renderer = renderer

    // ── Scene ──
    const scene = new THREE.Scene()
    this._scene = scene

    // ── Camera (overridden by XR views in XR mode) ──
    const camera = new THREE.PerspectiveCamera(
      70,
      container.clientWidth / container.clientHeight,
      0.01,
      100,
    )
    this._camera = camera

    // ── Lighting ──
    const ambient = new THREE.AmbientLight(0xffffff, 1.5)
    scene.add(ambient)

    const directional = new THREE.DirectionalLight(0xffffff, 2)
    directional.position.set(0, 3, 3)
    scene.add(directional)

    const fill = new THREE.DirectionalLight(0xffffff, 0.5)
    fill.position.set(-2, 1, -2)
    scene.add(fill)

    // ── Reticle (ring + dot) ──
    this._createReticle()

    // ── Hint overlay ──
    const hintEl = document.createElement('div')
    hintEl.textContent = '扫描周围环境，在平面上放置'
    hintEl.style.cssText = [
      'position:absolute',
      'bottom:80px',
      'left:50%',
      'transform:translateX(-50%)',
      'color:rgba(255,255,255,0.9)',
      'font-size:14px',
      'font-weight:500',
      'background:rgba(0,0,0,0.4)',
      'padding:8px 20px',
      'border-radius:20px',
      'pointer-events:none',
      'z-index:10',
      'backdrop-filter:blur(4px)',
      'border:1px solid rgba(255,255,255,0.1)',
      'transition:opacity 0.5s ease',
    ].join(';')
    container.appendChild(hintEl)
    this._hintEl = hintEl

    // ── XR session ──
    try {
      const xr = navigator.xr
      if (!xr) throw new Error('WebXR not available')
      // hit-test 由「必需」改为「可选」：部分 Android 机型/浏览器拒绝必需特性，
      // 会导致整个会话创建失败。改为可选后不支持时自动退化为「视线前方放置」。
      const sessionInit: XRSessionInit = {
        requiredFeatures: ['local'],
        optionalFeatures: [
          'hit-test',
          'plane-detection',
          'dom-overlay',
          'local-floor',
          'light-estimation',
        ],
      }
      if (this._domOverlayRoot) {
        sessionInit.domOverlay = { root: this._domOverlayRoot }
      }

      const session = await xr.requestSession('immersive-ar', sessionInit)
      this._session = session

      // Request local reference space
      const refSpace = await session.requestReferenceSpace('local')
      this._refSpace = refSpace

      // Create hit test source (optional — 失败则走视线前方退化路径)
      if (session.requestHitTestSource) {
        try {
          this._hitTestSource =
            (await session.requestHitTestSource({
              space: refSpace,
              entityTypes: ['plane', 'point'],
            })) ?? null
        } catch (e) {
          console.warn('[WebXR] hit-test 不可用，将退化为视线前方放置:', e)
          this._hitTestSource = null
        }
      } else {
        console.warn('[WebXR] 当前浏览器未提供 requestHitTestSource，退化为视线前方放置')
        this._hitTestSource = null
      }

      // Configure Three.js renderer for XR (sets up internal XR view management)
      await renderer.xr.setSession(session)

      // ── Session event: end ──
      const onEnd = () => {
        console.log('[WebXR] Session ended')
        this._isRunning = false
        this._viewerPose = null
        this._session = null
        this._refSpace = null
        this._hitTestSource = null
      }
      session.addEventListener('end', onEnd)
      this._sessionEndHandler = onEnd

      // ── Session event: select (tap to place) ──
      const onSelect = (ev: Event) => this._onSelect(ev)
      session.addEventListener('select', onSelect)
      this._selectHandler = onSelect

      // ── Start XR animation loop ──
      // Three.js r184+ passes (time, frame) to setAnimationLoop callback.
      // The renderer.render() call uses XR views set up by Three.js internally.
      renderer.xr.setAnimationLoop((time: number, frame?: XRFrame) => {
        const dt = this._lastFrameTime
          ? Math.min((time - this._lastFrameTime) / 1000, 0.1)
          : 0.016
        this._lastFrameTime = time

        if (frame) {
          // Capture viewer (camera) pose for ITracker
          try {
            this._viewerPose = frame.getViewerPose(this._refSpace!) ?? null
          } catch { /* ignore */ }
          this._processHitTest(frame)
        }

        // 驱动外部自定义动画（导览沙盘巡游 / HUD 刷新等）
        try {
          this.onFrame?.(dt, frame)
        } catch (e) {
          console.error('[WebXR] onFrame 回调异常:', e)
        }

        renderer.render(scene, camera)
      })

      this._isRunning = true
      console.log('[WebXR] AR session started successfully')
    } catch (e) {
      console.error('[WebXR] Failed to start:', e)
      this._cleanupScene()
      renderer.dispose()
      throw e
    }
  }

  async stop(): Promise<void> {
    if (!this._isRunning) return
    this._isRunning = false

    // Stop Three.js XR animation loop
    if (this._renderer) {
      this._renderer.xr.setAnimationLoop(null)
    }

    // Remove event listeners
    if (this._session) {
      if (this._selectHandler) {
        this._session.removeEventListener('select', this._selectHandler)
        this._selectHandler = null
      }
      if (this._sessionEndHandler) {
        this._session.removeEventListener('end', this._sessionEndHandler)
        this._sessionEndHandler = null
      }

      // End session
      try {
        await this._session.end()
      } catch (e) {
        console.warn('[WebXR] Error ending session:', e)
      }
      this._session = null
    }

    this._refSpace = null
    this._hitTestSource = null
    this._viewerPose = null

    // Clean reticle
    this._disposeReticle()

    // Clean hint element
    if (this._hintEl && this._hintEl.parentNode) {
      this._hintEl.parentNode.removeChild(this._hintEl)
      this._hintEl = null
    }

    // Clear placement state
    this._placedObject = null
    this._placedContent = null
    this._modelWrapper = null
    this._hasPlaced = false
    this._lastHitPos = null
    this._lastHitMatrix = null
    this._lastFrameTime = 0
  }

  update(_frameDelta: number): void {
    // WebXR manages its own frame loop via renderer.xr.setAnimationLoop
  }

  /**
   * Get the latest camera pose from the XR session.
   * Returns null when not tracking or viewer pose unavailable.
   */
  getPose(): { position: THREE.Vector3; quaternion: THREE.Quaternion; confidence: number; originType: 'world' | 'anchor' | 'image'; timestamp: number; projectionMatrix?: THREE.Matrix4; motionSpeed?: number } | null {
    if (!this._isRunning || !this._viewerPose) return null

    const { position, orientation } = this._viewerPose.transform

    const pos = new THREE.Vector3(position.x, position.y, position.z)
    const quat = new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w)
    const proj = this._camera ? this._camera.projectionMatrix.clone() : undefined

    return {
      position: pos,
      quaternion: quat,
      confidence: this._lastHitPos ? 1.0 : 0.5,
      originType: 'world',
      timestamp: performance.now(),
      projectionMatrix: proj,
      motionSpeed: 0,
    }
  }

  async switchCamera(): Promise<void> {
    console.warn('[WebXR] switchCamera not implemented for WebXR adapter')
  }

  capturePhoto(): string | null {
    if (this._renderer) {
      return this._renderer.domElement.toDataURL('image/png')
    }
    return null
  }

  dispose(): void {
    this.stop()

    // Remove canvas
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas)
    }
    this._canvas = null
    this._container = null
    this._config = null

    // Dispose renderer (releases GPU resources)
    if (this._renderer) {
      this._renderer.dispose()
    }
  }

  // ════════════════════════════════════════════════════════════════
  // Public controls (for external toolbar / editor)
  // ════════════════════════════════════════════════════════════════

  setModelScale(x: number, y: number, z: number): void {
    if (this._modelWrapper) this._modelWrapper.scale.set(x, y, z)
  }

  setModelPosition(x: number, y: number, z: number): void {
    if (this._modelWrapper) this._modelWrapper.position.set(x, y, z)
  }

  setModelRotationY(radians: number): void {
    if (this._modelWrapper) this._modelWrapper.rotation.y = radians
  }

  getModelRotationY(): number {
    return this._modelWrapper?.rotation.y ?? 0
  }

  resetRotation(): void {
    if (this._modelWrapper) this._modelWrapper.rotation.y = 0
  }

  // ════════════════════════════════════════════════════════════════
  // Private: Reticle
  // ════════════════════════════════════════════════════════════════

  /**
   * Create reticle (ring + dot) indicator for plane detection.
   * Mirrors EightWallAdapter's reticle design.
   */
  private _createReticle(): void {
    const group = new THREE.Group()

    // Outer ring
    const ringGeom = new THREE.RingGeometry(0.08, 0.14, 48)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4f8cff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    })
    const ring = new THREE.Mesh(ringGeom, ringMat)
    ring.rotation.x = -Math.PI / 2 // lay flat on XZ plane
    group.add(ring)
    this._reticleRing = ring

    // Center dot
    const dotGeom = new THREE.CircleGeometry(0.015, 16)
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
    })
    const dot = new THREE.Mesh(dotGeom, dotMat)
    dot.rotation.x = -Math.PI / 2
    dot.position.z = 0.001 // prevent z-fighting with ring
    group.add(dot)
    this._reticleDot = dot

    group.visible = false
    this._scene.add(group)
    this._reticle = group
  }

  /**
   * Dispose reticle geometry and materials.
   */
  private _disposeReticle(): void {
    if (this._reticle) {
      this._scene?.remove(this._reticle)
    }
    if (this._reticleRing) {
      this._reticleRing.geometry.dispose()
      if (Array.isArray(this._reticleRing.material)) {
        this._reticleRing.material.forEach((m) => m.dispose())
      } else {
        this._reticleRing.material.dispose()
      }
      this._reticleRing = null
    }
    if (this._reticleDot) {
      this._reticleDot.geometry.dispose()
      if (Array.isArray(this._reticleDot.material)) {
        this._reticleDot.material.forEach((m) => m.dispose())
      } else {
        this._reticleDot.material.dispose()
      }
      this._reticleDot = null
    }
    this._reticle = null
  }

  // ════════════════════════════════════════════════════════════════
  // Private: Hit testing (called every XR frame)
  // ════════════════════════════════════════════════════════════════

  /**
   * Process hit test results from the XR frame.
   * Updates reticle position and stores the last valid hit for placement.
   */
  private _processHitTest(frame: XRFrame): void {
    if (!this._refSpace || this._hasPlaced) return

    // ── 无 hit-test 支持时的退化路径：把准星放在「视线前方 1.2m」 ──
    if (!this._hitTestSource) {
      const viewer = this._viewerPose
      if (!viewer) return
      const t = viewer.transform
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
        new THREE.Quaternion(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w),
      )
      const pos = new THREE.Vector3(t.position.x, t.position.y, t.position.z)
        .add(dir.multiplyScalar(1.2))
      this._lastHitPos = pos
      this._lastHitMatrix = new THREE.Matrix4().compose(
        pos,
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1),
      )
      if (this._reticle) {
        this._reticle.position.copy(pos)
        this._reticle.quaternion.identity()
        this._reticle.visible = true
      }
      this.onTrackingStatus?.(true)
      return
    }

    try {
      const hitResults = frame.getHitTestResults(this._hitTestSource)

      if (hitResults && hitResults.length > 0) {
        const hit = hitResults[0]
        const pose = hit.getPose(this._refSpace)

        if (pose) {
          const { position, orientation } = pose.transform

          // Store hit position
          const pos = new THREE.Vector3(
            position.x,
            position.y,
            position.z,
          )
          this._lastHitPos = pos

          // Store full transform matrix for placement
          const quat = new THREE.Quaternion(
            orientation.x,
            orientation.y,
            orientation.z,
            orientation.w,
          )
          this._lastHitMatrix = new THREE.Matrix4().compose(
            pos,
            quat,
            new THREE.Vector3(1, 1, 1),
          )

          // Update reticle position (keep horizontal, ignore surface orientation)
          if (this._reticle) {
            this._reticle.position.copy(pos)
            this._reticle.quaternion.identity()
            this._reticle.visible = true
          }

          this.onTrackingStatus?.(true)
          return
        }
      }
    } catch (e) {
      // Hit test can throw when tracking is not yet initialized
      // Silently ignore — will retry on next frame
    }

    // No valid hit detected this frame
    if (this._reticle) {
      this._reticle.visible = false
    }
    this.onTrackingStatus?.(false)
  }

  // ════════════════════════════════════════════════════════════════
  // Private: Select (tap-to-place)
  // ════════════════════════════════════════════════════════════════

  /**
   * Handle XR session `select` event.
   * Places the model/video/cube at the last known hit position.
   */
  private _onSelect(_event: Event): void {
    if (this._hasPlaced || !this._lastHitMatrix) return

    this._hasPlaced = true

    // Hide reticle
    if (this._reticle) {
      this._reticle.visible = false
    }

    // Hide hint with fade-out animation
    if (this._hintEl) {
      this._hintEl.style.opacity = '0'
      setTimeout(() => {
        if (this._hintEl && this._hintEl.parentNode) {
          this._hintEl.parentNode.removeChild(this._hintEl)
        }
      }, 500)
    }

    // Extract position from last hit matrix
    const pos = new THREE.Vector3()
    const _quat = new THREE.Quaternion()
    const _scl = new THREE.Vector3()
    this._lastHitMatrix.decompose(pos, _quat, _scl)

    // Create placement group at hit position
    const placedGroup = new THREE.Group()
    placedGroup.position.copy(pos)
    this._scene.add(placedGroup)
    this._placedObject = placedGroup

    // Load appropriate content at placement position
    if (this._placementFactory) {
      // 外部注入的自定义内容（导览沙盘等）优先
      try {
        this._placementFactory(placedGroup)
        this._placedContent = placedGroup
        this.onModelStatus?.('loaded')
      } catch (e) {
        console.error('[WebXR] 自定义放置内容构建失败:', e)
        this.onModelStatus?.('error')
      }
    } else if (this._videoUrl) {
      this._loadVideoInPlane(placedGroup)
    } else if (this._modelUrl) {
      this._loadModelInPlane(placedGroup)
    } else {
      // No model/video configured — place green cube as placeholder
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x22c55e }),
      )
      box.position.y = 0.15 // sit slightly above surface
      placedGroup.add(box)
      this.onModelStatus?.('loaded')
    }

    this.onTrackingStatus?.(true)
    this.onPlaced?.(pos)
    console.log('[WebXR] Object placed at:', pos)
  }

  // ════════════════════════════════════════════════════════════════
  // Private: Model & video loading
  // ════════════════════════════════════════════════════════════════

  /**
   * Load a GLTF model at the placement position.
   * Uses GLTFLoader + DRACOLoader, with placeholder on error.
   * Mirrors EightWallAdapter's loading pattern.
   */
  private _loadModelInPlane(parent: THREE.Group): void {
    const url = this._modelUrl
    if (!url) return

    this.onModelStatus?.('loading', 0)

    const loader = new GLTFLoader()
    const draco = new DRACOLoader()
    draco.setDecoderPath('/draco/')
    loader.setDRACOLoader(draco)

    loader.load(
      url,
      (gltf) => {
        // Center model at origin of parent group via bounding box
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const center = box.getCenter(new THREE.Vector3())
        gltf.scene.position.copy(center).negate()

        // Wrapper group for user-controlled transforms (scale, position, rotation)
        const wrapper = new THREE.Group()
        wrapper.position.set(
          this._position[0],
          this._position[1],
          this._position[2],
        )
        wrapper.scale.setScalar(this._scale)
        wrapper.add(gltf.scene)

        parent.add(wrapper)
        this._modelWrapper = wrapper
        this.onModelStatus?.('loaded')
        console.log('[WebXR] 3D model loaded onto plane')
      },
      (xhr) => {
        if (xhr.total > 0) {
          this.onModelStatus?.('loading', xhr.loaded / xhr.total)
        }
      },
      (err) => {
        console.error('[WebXR] Model load error:', err)
        this.onModelStatus?.('error')

        // Fallback: red cube on error
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.3, 0.3),
          new THREE.MeshStandardMaterial({ color: 0xff4444 }),
        )
        box.position.y = 0.15
        parent.add(box)
      },
    )
  }

  /**
   * Load a video plane at the placement position.
   * Uses VideoPlayer and binds click to container.
   * Mirrors EightWallAdapter's loading pattern.
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

    player
      .load(parent, new THREE.Vector3(0, 0.15, 0))
      .then(() => {
        this.onModelStatus?.('loaded')
        console.log('[WebXR] Video plane loaded onto surface')
        player.play().catch(() => {})
      })
      .catch((err) => {
        console.error('[WebXR] Video load error:', err)
        this.onModelStatus?.('error')
      })

    player.bindClick(this._container!)
  }

  // ════════════════════════════════════════════════════════════════
  // Private: Cleanup helpers
  // ════════════════════════════════════════════════════════════════

  /**
   * Partial cleanup for failed start (does not touch renderer/session).
   */
  private _cleanupScene(): void {
    this._disposeReticle()
    if (this._hintEl && this._hintEl.parentNode) {
      this._hintEl.parentNode.removeChild(this._hintEl)
      this._hintEl = null
    }
    this._placedObject = null
    this._modelWrapper = null
    this._hasPlaced = false
    this._lastHitPos = null
    this._lastHitMatrix = null
  }
}
