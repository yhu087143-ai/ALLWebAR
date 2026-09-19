/**
 * CameraARAdapter — 跨浏览器 AR 引擎适配器
 *
 * 使用摄像头 + 陀螺仪 + Three.js 实现轻量 AR，不依赖 WebXR 或 8th Wall。
 * 工作流程：
 *   1. getUserMedia 启动摄像头 → video 纹理作 AR 背景
 *   2. OrientationManager 提供陀螺仪旋转追踪（含多级回退链）
 *   3. reticle 跟随设备旋转 → 点击屏幕在固定距离放置物体
 *   4. 放置后通过陀螺仪 deltaQ 反旋转保持物体世界空间位置
 *   5. 可选：VisualFeatureTracker 提供视觉特征点跟踪（平移追踪）
 *
 * 兼容性：所有支持 getUserMedia + DeviceOrientation 的浏览器
 *   - iOS Safari 12+
 *   - Android Chrome / Firefox / 微信
 *   - 桌面 Chrome 等（仅视频预览，无陀螺仪）
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import type { IEngineAdapter } from '../types/engine'
import type { UnifiedARConfig } from '../types/config'
import { EngineType, CapabilityType } from '../types/enums'
import { OrientationManager } from '../sensors/OrientationManager'
import { VideoPlayer } from '../video/VideoPlayer'
import { VisualFeatureTracker } from '../tracking/VisualFeatureTracker'

/** 后置摄像头 -90° X 旋转补偿 */
const _Q_X90 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
const _Q_IDENTITY = new THREE.Quaternion()
const _V_ZERO = new THREE.Vector3(0, 0, 0)

export class CameraARAdapter implements IEngineAdapter {
  readonly type = EngineType.Camera

  // Three.js
  private _renderer!: THREE.WebGLRenderer
  private _scene!: THREE.Scene
  private _camera!: THREE.PerspectiveCamera
  private _isRunning = false

  // Container & config
  private _container: HTMLElement | null = null
  private _config: UnifiedARConfig | null = null

  // Camera
  private _stream: MediaStream | null = null
  private _video: HTMLVideoElement | null = null
  private _videoTex: THREE.VideoTexture | null = null

  // Gyroscope
  private _orientationManager: OrientationManager | null = null
  private _gyroQuat = new THREE.Quaternion()
  private _placementGyro = new THREE.Quaternion()
  private _gyroAvailable = false
  private _gyroLastTime = 0
  private _pendingGyroCapture = false

  // Placement state
  private _gyroGroup: THREE.Group | null = null
  private _placementGroup: THREE.Group | null = null
  private _reticleRing: THREE.Mesh | null = null
  private _reticleDot: THREE.Mesh | null = null
  private _placementExecuted = false
  private _pendingPlacement = false // 等待陀螺仪就绪后才放置
  private _placedObject: THREE.Object3D | null = null
  private _modelWrapper: THREE.Group | null = null

  // Gyro smoothing
  private _smoothGyroQuat = new THREE.Quaternion()
  private _smoothGyroReady = false
  private _prevDeltaQ = new THREE.Quaternion()
  private _smoothStillFrames = 0

  // Animation
  private _mixer: THREE.AnimationMixer | null = null
  private _clock = new THREE.Clock()

  // 复用临时向量避免 GC
  private static _tmpVec = new THREE.Vector3()

  // Video player (for placed videos)
  private _videoPlayer: VideoPlayer | null = null

  // Visual feature tracker (camera translation estimation)
  private _featureTracker: VisualFeatureTracker | null = null
  private _trackerOffset = new THREE.Vector3()
  private _trackerBaseline = new THREE.Vector3()

  // Callbacks
  onTrackingStatus: ((found: boolean) => void) | null = null
  onModelStatus: ((status: 'loading' | 'loaded' | 'error', pct?: number) => void) | null = null

  // ── IEngineAdapter ──

  get renderer(): THREE.WebGLRenderer { return this._renderer }
  get scene(): THREE.Scene { return this._scene }
  get camera(): THREE.PerspectiveCamera { return this._camera }
  get isRunning(): boolean { return this._isRunning }

  async initialize(container: HTMLElement, config: UnifiedARConfig): Promise<void> {
    this._container = container
    this._config = config
  }

  async start(): Promise<void> {
    const container = this._container!
    const config = this._config!
    const w = container.clientWidth
    const h = container.clientHeight

    // 1. 摄像头
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ video: true })
    }
    this._stream = stream

    // 2. Video 元素
    const video = document.createElement('video')
    video.srcObject = stream
    video.setAttribute('playsinline', '')
    video.muted = true
    video.loop = true
    await video.play()
    this._video = video

    // 初始化视觉特征点跟踪器
    this._featureTracker = new VisualFeatureTracker(160, 120)

    // 3. Three.js 渲染器
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, failIfMajorPerformanceCaveat: false })
    } catch {
      throw new Error(
        'WebGL 渲染器创建失败。请检查：\n' +
        '1) 浏览器已启用硬件加速 (chrome://settings/system)\n' +
        '2) 未强制禁用 GPU (chrome://flags/#ignore-gpu-blocklist)\n' +
        '3) 更新显卡驱动后重启浏览器'
      )
    }
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000)
    container.appendChild(renderer.domElement)
    this._renderer = renderer

    // 4. 场景 + 相机
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.01, 100)
    camera.position.set(0, 0, 0)
    this._scene = scene
    this._camera = camera

    // 5. 视频纹理背景
    const videoTex = new THREE.VideoTexture(video)
    videoTex.minFilter = THREE.LinearFilter
    videoTex.magFilter = THREE.LinearFilter
    this._videoTex = videoTex

    const bgAspect = w / h
    const videoAspect = video.videoWidth / video.videoHeight
    const bgScale = bgAspect > videoAspect
      ? new THREE.Vector2(bgAspect / videoAspect, 1)
      : new THREE.Vector2(1, videoAspect / bgAspect)

    const bgGeom = new THREE.PlaneGeometry(10, 10)
    const bgMat = new THREE.MeshBasicMaterial({ map: videoTex, side: THREE.DoubleSide })
    const bgMesh = new THREE.Mesh(bgGeom, bgMat)
    bgMesh.position.set(0, 0, -5)
    bgMesh.scale.set(bgScale.x, bgScale.y, 1)
    scene.add(bgMesh)

    // 6. 灯光
    scene.add(new THREE.AmbientLight(0xffffff, 1.5))
    const dl = new THREE.DirectionalLight(0xffffff, 2)
    dl.position.set(0, 3, 3)
    scene.add(dl)
    const fl = new THREE.DirectionalLight(0xffffff, 0.5)
    fl.position.set(-2, 1, -2)
    scene.add(fl)

    // 7. 陀螺仪组
    const gyroGroup = new THREE.Group()
    scene.add(gyroGroup)
    this._gyroGroup = gyroGroup

    // 放置组（scene 层级，与 gyroGroup 同级，反旋转时不影响位置）
    const cfg = config.model
    const cfgPos = cfg?.position ?? [0, 0.15, -0.2]
    const placementGroup = new THREE.Group()
    placementGroup.position.set(cfgPos[0], cfgPos[1], cfgPos[2])
    scene.add(placementGroup)
    this._placementGroup = placementGroup
    this._trackerBaseline.set(cfgPos[0], cfgPos[1], cfgPos[2])

    // 8. Reticle
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.09, 48),
      new THREE.MeshBasicMaterial({ color: 0x4f8cff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    )
    gyroGroup.add(ring)
    this._reticleRing = ring

    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.015, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
    )
    gyroGroup.add(dot)
    this._reticleDot = dot

    // 9. 触摸延迟初始化陀螺仪（iOS 需要手势权限）
    let gyroInitialized = false
    const initGyro = () => {
      if (gyroInitialized) return
      gyroInitialized = true
      container.removeEventListener('click', initGyro)
      container.removeEventListener('touchstart', initGyro)
      // 陀螺仪启动中 → 准星变黄
      if (this._reticleRing) (this._reticleRing.material as THREE.MeshBasicMaterial).color.setHex(0xfbbf24)
      this._initGyroscope().catch(err => console.warn('[CameraAR] 陀螺仪初始化失败:', err))
    }
    container.addEventListener('click', initGyro)
    container.addEventListener('touchstart', initGyro, { passive: true })

    // 10. 点击放置
    const doPlace = () => {
      if (this._placementExecuted) return

      if (this._gyroAvailable) {
        // 陀螺仪已就绪：立即放置，姿态立即锁定
        this._placementGyro.copy(this._gyroQuat)
        this._executePlace(config)
      } else if (this._orientationManager) {
        // 陀螺仪正在初始化（正在走权限/校准）：排队等待
        this._pendingPlacement = true
        if (this._reticleRing) (this._reticleRing.material as THREE.MeshBasicMaterial).color.setHex(0xfbbf24)
        console.log('[CameraAR] 陀螺仪未就绪，排队等待...')
      } else {
        // 无陀螺仪设备（桌面等）：直接放置，无旋转跟踪
        this._executePlace(config)
      }
    }
    container.addEventListener('click', doPlace)
    container.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.changedTouches.length === 1) doPlace()
    }, { passive: true })

    // 11. 窗口 resize
    const onResize = () => {
      const cw = container.clientWidth
      const ch = container.clientHeight
      camera.aspect = cw / ch
      camera.updateProjectionMatrix()
      renderer.setSize(cw, ch)
    }

    // 12. 渲染循环（细分异常捕获，方便手机端调试）
    const clock = this._clock
    renderer.setAnimationLoop(() => {
      let frameDt = 0
      try { frameDt = clock.getDelta() } catch (e: any) { console.warn('[CameraAR] 时钟异常:', e?.name || e) }

      try {
        const cw = container.clientWidth
        const ch = container.clientHeight
        if (Math.abs(camera.aspect - cw / ch) > 0.001) onResize()
      } catch (e: any) { console.warn('[CameraAR] 窗口异常:', e?.name || e) }

      try { this._updateGyroPose(frameDt) } catch (e: any) { console.warn('[CameraAR] 陀螺仪异常:', e?.name || e) }

      let trResult = null
      const ft = this._featureTracker
      if (ft && this._hasPlaced && this._video) {
        try { trResult = ft.track(this._video) }
        catch (e: any) {
          console.warn('[CameraAR] 特征跟踪异常，已永久禁用:', e?.name || e?.message || e)
          this._featureTracker = null // 首次报错后永久禁用，不再重试
        }
      }
      if (trResult) {
        try {
          if (trResult.confidence > 0.3) {
            this._trackerOffset.x -= trResult.dx * 0.3
            this._trackerOffset.y += trResult.dy * 0.3
          }
          if (trResult.confidence < 0.1 && trResult.matchCount < 4) {
            this._trackerOffset.lerp(CameraARAdapter._tmpVec.set(0, 0, 0), 0.01)
          }
        } catch (e) { console.warn('[CameraAR] 偏移异常:', e) }
      }

      try {
        if (this._hasPlaced && this._placementGroup)
          this._placementGroup.position.copy(this._trackerBaseline).add(this._trackerOffset)
      } catch (e) { console.warn('[CameraAR] 位置异常:', e) }

      try { if (videoTex) videoTex.needsUpdate = true } catch (e) { console.warn('[CameraAR] 纹理异常:', e) }
      try { if (this._mixer) this._mixer.update(frameDt) } catch (e) { console.warn('[CameraAR] 动画异常:', e) }

      try { renderer.render(scene, camera) }
      catch (e: any) {
        console.warn('[CameraAR] 渲染异常:', e?.name || e?.message || e)
        try { renderer.setAnimationLoop(null) } catch {}
      }
    })
  }

  async stop(): Promise<void> {
    // 停止渲染循环
    if (this._renderer) {
      this._renderer.setAnimationLoop(null)
    }

    // 释放摄像头
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop())
      this._stream = null
    }
    if (this._video) {
      this._video.pause()
      this._video.srcObject = null
      this._video = null
    }

    // 释放视频纹理
    if (this._videoTex) {
      this._videoTex.dispose()
      this._videoTex = null
    }

    // 释放渲染器上下文
    if (this._renderer) {
      try { this._renderer.forceContextLoss() } catch { /* ignore */ }
      this._renderer.dispose()
    }

    // 清理 DOM
    if (this._container) {
      const canvas = this._renderer?.domElement
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
    }

    // 停止陀螺仪
    this._orientationManager?.stop()
    this._orientationManager = null

    // 重置视觉跟踪
    this._featureTracker?.reset()
    this._featureTracker = null
    this._trackerOffset.set(0, 0, 0)

    // 释放 video player
    this._videoPlayer?.dispose()
    this._videoPlayer = null

    this._isRunning = false
  }

  update(_frameDelta: number): void {
    // 渲染循环由 setAnimationLoop 驱动，无需额外更新
  }

  getSupportedCapabilities(): CapabilityType[] {
    // 相机透视兜底（getUserMedia + 陀螺仪）没有任何平面/空间检测能力。
    // 之前误报 PlaneDetection，会让上层把「平面放置」模式路由到这里后静默失效。
    return []
  }

  switchCamera(): Promise<void> {
    console.warn('[CameraAR] switchCamera 未实现')
    return Promise.resolve()
  }

  capturePhoto(): string | null {
    if (this._renderer) return this._renderer.domElement.toDataURL('image/png')
    return null
  }

  dispose(): void {
    this.stop()
    this._container = null
    this._config = null
  }

  // ── 陀螺仪初始化 ──

  private async _initGyroscope(): Promise<void> {
    const mgr = new OrientationManager()
    this._orientationManager = mgr
    const started = await mgr.start()
    if (!started) {
      console.warn('[CameraAR] 所有方向传感器均不可用')
      return
    }

    mgr.onReading((quat: THREE.Quaternion, timestamp: number) => {
      if (this._gyroLastTime > 0 && timestamp - this._gyroLastTime > 1500) {
        this._smoothGyroReady = false
      }
      this._gyroLastTime = timestamp
      this._gyroQuat.copy(quat)
      this._gyroAvailable = true

      // 如果有排队的放置请求，陀螺仪就绪后立即执行
      if (this._pendingPlacement) {
        this._pendingPlacement = false
        this._placementGyro.copy(this._gyroQuat)
        this._executePlace(this._config!)
        console.log('[CameraAR] 陀螺仪就绪，放置已执行')
      } else if (this._pendingGyroCapture) {
        this._placementGyro.copy(this._gyroQuat)
        this._pendingGyroCapture = false
        this._smoothGyroReady = false
      }

      // 陀螺仪已就绪 → 准星变绿
      if (!this._placementExecuted && this._reticleRing) {
        (this._reticleRing.material as THREE.MeshBasicMaterial).color.setHex(0x4ade80)
      }
    })

    console.log(`[CameraAR] 方向传感器就绪: ${mgr.activeProviderName}`)
  }

  // ── 陀螺仪姿态更新（每帧调用） ──

  private _updateGyroPose(frameDt: number): void {
    const gyroGroup = this._gyroGroup
    const placementGroup = this._placementGroup
    if (!gyroGroup || !placementGroup) return

    if (this._gyroAvailable) {
      if (this._hasPlaced) {
        // 计算放置到现在的旋转 delta
        const deltaQ = _Q_IDENTITY.clone().copy(this._placementGyro).invert().multiply(this._gyroQuat)

        // 死区
        if (deltaQ.angleTo(_Q_IDENTITY) < 0.005) {
          deltaQ.copy(_Q_IDENTITY)
        }

        // 自适应平滑
        if (!this._smoothGyroReady) {
          this._smoothGyroQuat.copy(deltaQ)
          this._prevDeltaQ.copy(deltaQ)
          this._smoothStillFrames = 0
          this._smoothGyroReady = true
        } else {
          const angleBetween = this._prevDeltaQ.angleTo(deltaQ)
          this._prevDeltaQ.copy(deltaQ)
          let slerpFactor: number
          if (frameDt > 0 && angleBetween / frameDt < 0.05) {
            this._smoothStillFrames++
            slerpFactor = this._smoothStillFrames > 120 ? 0.05 : this._smoothStillFrames > 30 ? 0.1 : 0.3
          } else {
            this._smoothStillFrames = 0
            if (frameDt > 0 && angleBetween / frameDt < 0.5) slerpFactor = 0.6
            else if (frameDt > 0 && angleBetween / frameDt < 2.0) slerpFactor = 0.85
            else slerpFactor = 0.95
          }
          this._smoothGyroQuat.slerp(deltaQ, slerpFactor)
          this._smoothGyroQuat.normalize()
        }

        gyroGroup.quaternion.copy(this._smoothGyroQuat)
        // 放置组反旋转保持世界位置固定
        placementGroup.quaternion.copy(this._smoothGyroQuat).invert()
      } else {
        gyroGroup.quaternion.copy(this._gyroQuat)
      }
    }
  }

  // ── Reticle ──

  private _removeReticle(): void {
    if (this._reticleRing) {
      this._gyroGroup?.remove(this._reticleRing)
      this._reticleRing.geometry.dispose()
      ;(this._reticleRing.material as THREE.Material).dispose()
      this._reticleRing = null
    }
    if (this._reticleDot) {
      this._gyroGroup?.remove(this._reticleDot)
      this._reticleDot.geometry.dispose()
      ;(this._reticleDot.material as THREE.Material).dispose()
      this._reticleDot = null
    }
  }

  // ── 放置执行 ──

  private get _hasPlaced(): boolean { return this._placementExecuted }

  private _executePlace(config: UnifiedARConfig): void {
    if (this._placementExecuted) return
    this._placementExecuted = true
    this._pendingPlacement = false

    const pg = this._placementGroup
    if (!pg) return

    this._removeReticle()
    console.log('[CameraAR] 已放置, gyro:', this._gyroAvailable, 'hasPlaced:', true)

    const modelUrl = config?.model?.url
    const videoUrl = config?.videoUrl
    if (modelUrl) {
      this.onModelStatus?.('loading', 0)
      this._loadModel(modelUrl, pg).then(() => {
        this.onModelStatus?.('loaded', 100)
        console.log('[CameraAR] 模型加载完成')
      }).catch(err => {
        this.onModelStatus?.('error')
        console.error('[CameraAR] 模型加载失败:', err)
        this._createFallbackCube(pg)
      })
    } else if (videoUrl) {
      this._loadVideo(videoUrl, pg).then(() => {
        console.log('[CameraAR] 视频加载完成')
      }).catch(err => {
        console.error('[CameraAR] 视频加载失败:', err)
        this._createFallbackCube(pg)
      })
    } else {
      this._createFallbackCube(pg)
    }
  }

  private _createFallbackCube(group: THREE.Group): void {
    const geom = new THREE.BoxGeometry(0.15, 0.15, 0.15)
    const mat = new THREE.MeshStandardMaterial({ color: 0x4f8cff, metalness: 0.3, roughness: 0.6 })
    const cube = new THREE.Mesh(geom, mat)
    cube.position.set(0, 0.075, 0)
    group.add(cube)
    this._placedObject = cube
    console.log('[CameraAR] 回退立方体已放置')
  }

  // ── 模型加载 ──

  private _loadModel(url: string, group: THREE.Group): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader()
      const dracoLoader = new DRACOLoader()
      dracoLoader.setDecoderPath('/draco/')
      loader.setDRACOLoader(dracoLoader)

      loader.load(
        url,
        (gltf) => {
          const box = new THREE.Box3().setFromObject(gltf.scene)
          const center = box.getCenter(new THREE.Vector3())
          gltf.scene.position.copy(center).negate()

          const wrapper = new THREE.Group()
          wrapper.scale.setScalar(this._config?.model?.scale ?? 1)
          wrapper.add(gltf.scene)
          group.add(wrapper)
          this._modelWrapper = wrapper

          // 动画
          if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(gltf.scene)
            mixer.clipAction(gltf.animations[0]).play()
            this._mixer = mixer
          }

          resolve()
        },
        undefined,
        (err: unknown) => reject(new Error(`模型加载失败: ${(err as Error)?.message || '未知错误'}`))
      )
    })
  }

  // ── 视频加载 ──

  private async _loadVideo(url: string, group: THREE.Group): Promise<void> {
    const scale = this._config?.model?.scale ?? 1
    const videoPlayer = new VideoPlayer({ videoUrl: url, width: 0.8, loop: true, muted: true })
    this._videoPlayer = videoPlayer
    await videoPlayer.load(group)
    if (scale !== 1) videoPlayer.mesh?.scale.setScalar(scale)
  }
}
