import type { WebGLRenderer } from 'three'
import type { EventBus } from '../core/EventBus'
import type { EngineEvents } from '../core/events'

export interface ARStartOptions {
  /** 需要的特性，设备不支持会导致会话启动失败 */
  requiredFeatures?: string[]
  optionalFeatures?: string[]
  onEnd?: () => void
}

/**
 * WebXR AR 会话控制器。
 *
 * iOS Safari 不支持 WebXR，启动前必须先用 detectCapabilities() 判断，
 * 命中 iOS 分支时改走 USDZ + AR Quick Look（见 usdz.ts）。
 */
export class ARController {
  private session: XRSession | null = null
  private hitTestSource: XRHitTestSource | null = null
  private viewerSpace: XRReferenceSpace | null = null

  constructor(private readonly bus: EventBus<EngineEvents>) {}

  get active(): boolean {
    return this.session !== null
  }

  async start(renderer: WebGLRenderer, options: ARStartOptions = {}): Promise<void> {
    if (!('xr' in navigator) || !navigator.xr) {
      throw new Error('此浏览器不支持 WebXR')
    }

    const supported = await navigator.xr.isSessionSupported('immersive-ar')
    if (!supported) {
      throw new Error('此设备不支持 immersive-ar 会话')
    }

    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: options.requiredFeatures ?? [],
      optionalFeatures: options.optionalFeatures ?? [
        'hit-test',
        'local-floor',
        'dom-overlay',
        'light-estimation',
      ],
    })

    renderer.xr.enabled = true
    // local-floor 只是 optionalFeatures：设备不支持时 setSession 内部
    // requestReferenceSpace('local-floor') 会拒绝，降级到 'local' 重试
    renderer.xr.setReferenceSpaceType('local-floor')
    try {
      await renderer.xr.setSession(session)
    } catch {
      renderer.xr.setReferenceSpaceType('local')
      await renderer.xr.setSession(session)
    }

    this.session = session
    session.addEventListener('end', () => {
      this.cleanup()
      options.onEnd?.()
      this.bus.emit('ar:state', { active: false, reason: 'session-ended' })
    })

    try {
      this.viewerSpace = await session.requestReferenceSpace('viewer')
      // @types/webxr 里 requestHitTestSource 是可选属性，可能返回 undefined
      const source = await session.requestHitTestSource?.({ space: this.viewerSpace })
      this.hitTestSource = source ?? null
    } catch {
      // 设备不支持 hit-test 时降级为「正前方固定放置」
      this.hitTestSource = null
    }

    this.bus.emit('ar:state', { active: true })
  }

  stop(): void {
    this.session?.end()
    this.cleanup()
  }

  /** 供渲染循环调用：返回当前帧的命中位姿矩阵，无命中返回 null */
  pollHitTest(renderer: WebGLRenderer): Float32Array | null {
    if (!this.session || !this.hitTestSource) return null

    const frame = renderer.xr.getFrame?.() as XRFrame | undefined
    const referenceSpace = renderer.xr.getReferenceSpace()
    if (!frame || !referenceSpace) return null

    const results = frame.getHitTestResults(this.hitTestSource)
    if (!results.length) return null

    const pose = results[0].getPose(referenceSpace)
    return pose ? pose.transform.matrix : null
  }

  private cleanup(): void {
    this.hitTestSource?.cancel()
    this.hitTestSource = null
    this.viewerSpace = null
    this.session = null
  }
}
