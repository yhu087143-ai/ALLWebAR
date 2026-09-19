/**
 * VideoPlayer — 在 AR 场景中播放视频
 *
 * 创建一个带 VideoTexture 的平面，支持：
 *  - 从 URL 加载视频
 *  - 点击/触摸播放/暂停切换
 *  - 自动适配视频宽高比
 *  - 静音/取消静音
 */

import * as THREE from 'three'

export interface VideoPlayerConfig {
  /** 视频文件 URL（支持 mp4/webm/ogg） */
  videoUrl: string
  /** 视频宽度（AR 空间单位），默认 0.8 */
  width?: number
  /** 是否自动播放（需要用户交互触发），默认 false */
  autoPlay?: boolean
  /** 是否循环播放，默认 true */
  loop?: boolean
  /** 初始音量 0-1，默认 1 */
  volume?: number
  /** 是否默认静音（部分浏览器自动播放策略），默认 true */
  muted?: boolean
}

export type BillboardMode = 'spherical' | 'cylindrical' | 'constrained';

export class VideoPlayer {
  private _video: HTMLVideoElement | null = null
  private _texture: THREE.VideoTexture | null = null
  private _mesh: THREE.Mesh | null = null
  private _isPlaying = false
  private _config: VideoPlayerConfig
  private _listeners: Array<[HTMLElement | Document, string, EventListener]> = []
  private _parent: THREE.Group | THREE.Scene | null = null
  /** 广告牌模式（始终面向相机） */
  private _billboardEnabled = false;
  private _billboardMode: BillboardMode = 'constrained';
  // 每帧重用临时向量避免 GC
  private static _bbTarget = new THREE.Vector3();
  private static _bbWorldPos = new THREE.Vector3();
  private static _bbDir = new THREE.Vector3();
  private static _bbParentQuat = new THREE.Quaternion();
  private static _bbTargetQuat = new THREE.Quaternion();
  private static _bbEuler = new THREE.Euler();

  get mesh(): THREE.Mesh | null { return this._mesh }
  get isPlaying(): boolean { return this._isPlaying }
  get video(): HTMLVideoElement | null { return this._video }

  constructor(config: VideoPlayerConfig) {
    this._config = {
      width: 0.8,
      autoPlay: false,
      loop: true,
      volume: 1,
      muted: false,
      ...config,
    }
  }

  /**
   * 创建视频平面并开始加载视频
   * @param parent 放置视频平面的父级（scene 或 anchor group）
   * @param position 放置位置
   */
  async load(parent: THREE.Group | THREE.Scene, position?: THREE.Vector3): Promise<void> {
    this._parent = parent

    // 1. 创建 <video> 元素
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.loop = this._config.loop!
    video.muted = this._config.muted!
    video.volume = this._config.volume!
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    this._video = video

    // 2. 加载视频元数据以获取宽高比
    const aspect = await this._loadMetadata(video)

    // 3. 创建 VideoTexture
    const texture = new THREE.VideoTexture(video)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    this._texture = texture

    // 4. 创建平面几何体
    const w = this._config.width!
    const h = w / aspect
    const geo = new THREE.PlaneGeometry(w, h)
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      toneMapped: false, // 保持视频色彩鲜艳
    })
    const mesh = new THREE.Mesh(geo, mat)
    if (position) mesh.position.copy(position)
    this._mesh = mesh

    // 5. 白色边框让平面在 AR 中更明显
    const edges = new THREE.EdgesGeometry(geo)
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.25,
    })
    const wireframe = new THREE.LineSegments(edges, edgeMat)
    mesh.add(wireframe)

    // 6. 播放按钮指示（居中三角）
    this._addPlayIndicator(mesh)

    parent.add(mesh)
  }

  /**
   * 播放/暂停切换（由用户点击触发）
   */
  togglePlay(): void {
    if (!this._video) return
    if (this._isPlaying) {
      this._video.pause()
      this._isPlaying = false
    } else {
      this._video.play().catch(() => {})
      this._isPlaying = true
    }
    this._updatePlayIndicator()
  }

  /**
   * 开始播放（外部调用，如追踪到目标后自动播放）
   */
  async play(): Promise<void> {
    if (!this._video || this._isPlaying) return
    try {
      await this._video.play()
      this._isPlaying = true
      this._updatePlayIndicator()
    } catch (e) {
      console.warn('[VideoPlayer] 自动播放被阻止，等待用户交互:', e)
    }
  }

  /**
   * 暂停
   */
  pause(): void {
    if (!this._video || !this._isPlaying) return
    this._video.pause()
    this._isPlaying = false
    this._updatePlayIndicator()
  }

  /**
   * 绑定点击事件到容器（用于点击视频切换播放）
   */
  bindClick(container: HTMLElement): void {
    const handler = (e: Event) => {
      // 只在点击视频平面附近时触发
      if (this._mesh && this._parent) {
        this.togglePlay()
      }
    }
    container.addEventListener('click', handler)
    this._listeners.push([container, 'click', handler as EventListener])

    // 触摸支持
    const touchHandler = (e: TouchEvent) => {
      if (e.changedTouches.length === 1) {
        this.togglePlay()
      }
    }
    container.addEventListener('touchstart', touchHandler, { passive: true })
    this._listeners.push([container, 'touchstart', touchHandler as EventListener])
  }

  /**
   * 启用广告牌模式 — 视频平面始终面向相机
   *
   * 约束模式（默认）：完全面向相机但强制无滚动，视频保持直立
   * 球形模式：完全面向相机（所有轴）
   * 圆柱模式：仅水平旋转，保持垂直向上
   *
   * 使用 mesh.onBeforeRender 在父级矩阵更新后自动执行，
   * 不依赖外部每帧调用。
   */
  enableBillboard(mode: BillboardMode = 'constrained'): void {
    this._billboardMode = mode;
    this._billboardEnabled = true;
    if (!this._mesh) return;

    this._mesh.onBeforeRender = (_renderer, _scene, camera) => {
      if (!this._billboardEnabled || !this._mesh || !this._mesh.parent) return;

      const V = VideoPlayer;
      switch (this._billboardMode) {
        case 'spherical':
          camera.getWorldPosition(V._bbTarget);
          this._mesh.parent.worldToLocal(V._bbTarget);
          this._mesh.lookAt(V._bbTarget);
          break;

        case 'cylindrical':
          this._mesh.getWorldPosition(V._bbWorldPos);
          camera.getWorldPosition(V._bbTarget);
          V._bbDir.copy(V._bbTarget).sub(V._bbWorldPos);
          V._bbDir.y = 0;
          if (V._bbDir.lengthSq() < 0.0001) return;
          V._bbDir.normalize();
          V._bbTargetQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), V._bbDir);
          this._mesh.parent.getWorldQuaternion(V._bbParentQuat);
          V._bbParentQuat.invert();
          this._mesh.quaternion.copy(V._bbParentQuat.multiply(V._bbTargetQuat));
          break;

        case 'constrained':
          // 球形 lookAt + 强制 Z 轴（滚动）= 0
          camera.getWorldPosition(V._bbTarget);
          this._mesh.parent.worldToLocal(V._bbTarget);
          this._mesh.lookAt(V._bbTarget);
          V._bbEuler.setFromQuaternion(this._mesh.quaternion, 'YXZ');
          V._bbEuler.z = 0;
          this._mesh.quaternion.setFromEuler(V._bbEuler);
          break;
      }
    };
  }

  /**
   * 禁用广告牌模式，恢复网格自然旋转
   */
  disableBillboard(): void {
    this._billboardEnabled = false;
    if (this._mesh) {
      this._mesh.onBeforeRender = null as any;
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.pause()
    if (this._video) {
      this._video.src = ''
      this._video.load()
    }
    if (this._texture) {
      this._texture.dispose()
    }
    if (this._mesh) {
      this._mesh.parent?.remove(this._mesh)
      if (Array.isArray(this._mesh.material)) {
        this._mesh.material.forEach(m => m.dispose())
      } else {
        this._mesh.material.dispose()
      }
      this._mesh.geometry.dispose()
    }
    for (const [el, type, handler] of this._listeners) {
      el.removeEventListener(type, handler)
    }
    this._listeners = []
    this._mesh = null
    this._texture = null
    this._video = null
    this._parent = null
  }

  // ── 私有方法 ──

  /**
   * 加载视频元数据获取宽高比
   */
  private _loadMetadata(video: HTMLVideoElement): Promise<number> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // 超时后用 16:9 默认值
        console.warn('[VideoPlayer] 视频元数据加载超时，使用默认 16:9')
        resolve(16 / 9)
      }, 10000)

      video.addEventListener('loadedmetadata', () => {
        clearTimeout(timeout)
        const aspect = video.videoWidth / video.videoHeight
        if (isFinite(aspect) && aspect > 0) {
          resolve(aspect)
        } else {
          resolve(16 / 9)
        }
      }, { once: true })

      video.addEventListener('error', () => {
        clearTimeout(timeout)
        console.warn('[VideoPlayer] 视频加载失败，使用默认 16:9')
        resolve(16 / 9)
      }, { once: true })

      video.src = this._config.videoUrl
      video.load()
    })
  }

  /**
   * 添加播放指示器（中心三角）
   */
  private _addPlayIndicator(mesh: THREE.Mesh): void {
    const shape = new THREE.Shape()
    const s = 0.08
    shape.moveTo(-s * 0.5, -s)
    shape.lineTo(s * 0.5, 0)
    shape.lineTo(-s * 0.5, s)
    shape.closePath()

    const geo = new THREE.ShapeGeometry(shape)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const icon = new THREE.Mesh(geo, mat)
    icon.position.z = 0.01 // 略微靠前避免与视频平面 Z-fighting
    icon.name = 'play-indicator'
    mesh.add(icon)

    // 外圈圆环
    const ring = new THREE.RingGeometry(0.1, 0.12, 32)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const ringMesh = new THREE.Mesh(ring, ringMat)
    ringMesh.position.z = 0.01
    ringMesh.name = 'play-ring'
    mesh.add(ringMesh)
  }

  /**
   * 更新播放指示器显示状态
   */
  private _updatePlayIndicator(): void {
    if (!this._mesh) return
    const icon = this._mesh.getObjectByName('play-indicator') as THREE.Mesh | undefined
    if (icon) {
      icon.visible = !this._isPlaying
    }
    const ring = this._mesh.getObjectByName('play-ring') as THREE.Mesh | undefined
    if (ring) {
      ring.visible = !this._isPlaying
    }
  }
}
