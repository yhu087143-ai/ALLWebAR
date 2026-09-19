/**
 * WebXROrientationProvider
 *
 * Uses WebXR's 'local' reference space backed by ARCore (Chrome Android 79+).
 * ARCore fuses camera visual features + IMU → drift-free orientation.
 *
 * Priority: highest in fallback chain (tried first).
 *
 * Reference: https://www.w3.org/TR/webxr/#dom-xrreferencespace-local
 */

import * as THREE from 'three'
import type { IOrientationProvider } from './IOrientationProvider'

export class WebXROrientationProvider implements IOrientationProvider {
  readonly name = 'WebXROrientationProvider'
  readonly available: boolean

  private _cb: ((quat: THREE.Quaternion) => void) | null = null
  private _session: XRSession | null = null
  private _refSpace: XRReferenceSpace | null = null
  private _frameLoopId = 0
  private _running = false

  constructor() {
    this.available = typeof navigator.xr !== 'undefined' && navigator.xr !== null
  }

  onReading(cb: (quat: THREE.Quaternion) => void): void {
    this._cb = cb
  }

  async start(): Promise<void> {
    if (this._running || !this._cb || !this.available) return
    this._running = true

    try {
      if (!navigator.xr) throw new Error('WebXR not available')

      this._session = await navigator.xr.requestSession('inline', {
        requiredFeatures: ['local'] as any,
      })

      this._refSpace = await this._session.requestReferenceSpace('local')

      // Poll orientation every frame via requestAnimationFrame
      const onFrame = (time: number, frame: XRFrame) => {
        if (!this._session || !this._refSpace || !this._cb) return

        const pose = frame.getViewerPose(this._refSpace)
        if (pose) {
          const { x, y, z, w } = pose.transform.orientation
          const quat = new THREE.Quaternion(x, y, z, w)
          this._cb(quat)
        }

        if (this._session) {
          this._frameLoopId = this._session.requestAnimationFrame(onFrame)
        }
      }

      this._frameLoopId = this._session.requestAnimationFrame(onFrame)
      console.log('[AR] WebXROrientationProvider started (inline+local)')
    } catch (e) {
      /*
       * 必须把异常抛出去 —— 这里原本只 console.warn 就吞掉了。
       *
       * 吞掉的后果非常隐蔽：OrientationManager.start() 用「await provider.start()
       * 没抛错」判定本级成功，于是会把这一级设为 active 并 return，
       * 后面三级（Madgwick / GenericSensor / DeviceOrientation）**永远不会被尝试**。
       * 表现是朝向数据全程为空：HUD 方向箭头不动、罗盘恒指 0，
       * 而控制台上只有一行 warn，几乎不可能定位。
       *
       * 另外 available 只检查 navigator.xr 是否存在，桌面 Chrome / 未进入 AR 的
       * 安卓 Chrome 都会判 true，所以这条分支在实际设备上是常态而非异常。
       */
      console.warn('[AR] WebXR inline+local unavailable, falling back:', e)
      this._running = false
      this._session = null
      throw e
    }
  }

  stop(): void {
    this._running = false
    if (this._session) {
      if (this._frameLoopId) {
        this._session.cancelAnimationFrame(this._frameLoopId)
        this._frameLoopId = 0
      }
      this._session.end().catch(() => {})
      this._session = null
      this._refSpace = null
    }
  }
}
