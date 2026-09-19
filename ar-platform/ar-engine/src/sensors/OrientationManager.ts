/**
 * OrientationManager
 *
 * Manages the fallback chain of orientation providers:
 *   1. WebXROrientationProvider (ARCore, drift-free)
 *   2. MadgwickOrientationProvider  (AHRS sensor fusion)
 *   3. GenericSensorProvider   (Absolute/RelativeOrientationSensor)
 *   4. DeviceOrientationProvider (DeviceOrientationEvent, universal)
 *
 * Each provider is tried in order until one successfully starts.
 * The active provider's readings are forwarded as a single stream.
 *
 * Integrates CameraMotionDetector for drift correction assistance.
 */

import * as THREE from 'three'
import type { IOrientationProvider } from './IOrientationProvider'
import { WebXROrientationProvider } from './WebXROrientationProvider'
import { MadgwickOrientationProvider } from './MadgwickOrientationProvider'
import { GenericSensorProvider } from './GenericSensorProvider'
import { DeviceOrientationProvider } from './DeviceOrientationProvider'
import { CameraMotionDetector } from './CameraMotionDetector'

export interface OrientationManagerConfig {
  madgwickBeta?: number
}

export interface OrientationReading {
  quat: THREE.Quaternion
  /** Timestamp of the reading (performance.now()) */
  timestamp: number
}

export class OrientationManager {
  readonly name = 'OrientationManager'

  private _providers: IOrientationProvider[] = []
  private _activeProvider: IOrientationProvider | null = null
  private _cb: ((reading: OrientationReading) => void) | null = null
  private _running = false

  /** Latest quaternion (for external read access) */
  private _latestQuat = new THREE.Quaternion()
  private _latestTimestamp = 0

  /** Camera-based motion detection (optional, enabled when video is available) */
  private _motionDetector: CameraMotionDetector | null = null

  // For the render loop
  private _onNewReading: ((quat: THREE.Quaternion, timestamp: number) => void) | null = null

  get activeProviderName(): string {
    return this._activeProvider?.name ?? 'none'
  }

  get gyroQuat(): THREE.Quaternion {
    return this._latestQuat
  }

  get isStationary(): boolean {
    return this._motionDetector?.isStationary ?? false
  }

  get motionConfidence(): number {
    return this._motionDetector?.confidence ?? 0
  }

  constructor(config: OrientationManagerConfig = {}) {
    this._providers = [
      new WebXROrientationProvider(),
      new MadgwickOrientationProvider({
        beta: config.madgwickBeta ?? 0.1,
      }),
      new GenericSensorProvider(),
      new DeviceOrientationProvider(),
    ]
  }

  /**
   * Register the callback that receives fused orientation readings.
   * Called from the render loop.
   */
  onReading(cb: (quat: THREE.Quaternion, timestamp: number) => void): void {
    this._onNewReading = cb
  }

  /**
   * Start camera motion detector (call after camera is active)
   */
  enableMotionDetection(video: HTMLVideoElement): void {
    if (!this._motionDetector) {
      this._motionDetector = new CameraMotionDetector()
    }
    this._motionDetector.start(video)
  }

  /**
   * Start the orientation provider chain.
   * Tries each provider in priority order until one starts successfully.
   */
  async start(): Promise<boolean> {
    if (this._running) return true

    this._running = true

    /** 每级启动后最多等这么久，看是否真的有读数到达 */
    const PROBE_MS = 500

    for (const provider of this._providers) {
      if (!provider.available) {
        console.log(`[AR] ${provider.name}: not available, skipping`)
        continue
      }

      /*
       * 不能只用「start() 没抛错」判定本级可用。
       *
       * 四个 Provider 里：WebXR 与 Madgwick 失败时原本吞掉异常直接 return，
       * GenericSensor 的 start() 干脆是同步 void —— 它们都会让
       * `await provider.start()` 顺利返回，于是这一级被设为 active 并 return，
       * 后面的兜底级永远不执行。结果整条 4 级降级链名存实亡：
       * 朝向数据全程为空、HUD 方向箭头不动、罗盘恒指 0，而控制台只有一行 warn。
       *
       * 改成用「启动后是否真的收到读数」判定，一处覆盖全部四个 Provider。
       */
      let gotReading = false

      // Wrap onReading to receive quaternions
      provider.onReading((quat: THREE.Quaternion) => {
        /*
         * 只认有效读数。
         *
         * Madgwick 这类滤波器在「传感器 API 存在、但拿不到真实数据」时
         * 会算出 NaN 四元数并照样回调（它的 available 只看 Gyroscope /
         * Accelerometer 构造函数是否存在）。若不校验，NaN 会被当成
         * 「本级可用」，于是把 NaN 姿态一路喂给 HUD —— 方向箭头、罗盘
         * 全都静默失效，而且查不出来。
         */
        const valid =
          Number.isFinite(quat.x) && Number.isFinite(quat.y) &&
          Number.isFinite(quat.z) && Number.isFinite(quat.w)
        if (!valid) return

        gotReading = true
        const now = performance.now()
        this._latestQuat.copy(quat)
        this._latestTimestamp = now

        // Forward to render loop
        this._onNewReading?.(quat, now)
      })

      try {
        await provider.start()
      } catch (e) {
        console.warn(`[AR] ${provider.name} failed:`, e)
        continue
      }

      const confirmed = await this._confirmReading(() => gotReading, PROBE_MS)
      if (!confirmed) {
        console.warn(`[AR] ${provider.name}: started but no reading within ${PROBE_MS}ms — falling back`)
        try { provider.stop() } catch { /* 忽略停止失败 */ }
        continue
      }

      this._activeProvider = provider
      console.log(`[AR] OrientationManager: active provider = ${provider.name}`)
      return true
    }

    console.warn('[AR] OrientationManager: no orientation provider available')
    this._running = false
    return false
  }

  /** 在给定时间内轮询，确认是否有读数真的到达 */
  private _confirmReading(hasReading: () => boolean, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const t0 = performance.now()
      const tick = () => {
        if (hasReading()) return resolve(true)
        if (performance.now() - t0 >= timeoutMs) return resolve(false)
        setTimeout(tick, 40)
      }
      tick()
    })
  }

  /**
   * Update camera motion detection (call from render loop)
   */
  updateMotionDetection(video: HTMLVideoElement): void {
    this._motionDetector?.update(video)
  }

  /**
   * Reset state (called on replace/recenter)
   */
  reset(): void {
    // No drift correction state to reset (managed by AREngine)
  }

  /**
   * Stop all providers and clean up
   */
  stop(): void {
    this._running = false
    for (const provider of this._providers) {
      try { provider.stop() } catch { /* ignore */ }
    }
    this._activeProvider = null
    this._motionDetector?.stop()
    this._motionDetector = null
  }
}
