/**
 * MadgwickOrientationProvider
 *
 * Uses the Madgwick AHRS filter to fuse raw gyroscope, accelerometer,
 * and magnetometer data into a drift-corrected orientation quaternion.
 *
 * Advantages over generic AbsoluteOrientationSensor:
 *  - Tunable `beta` (filter gain) — optimised for AR use case
 *  - Tunable `zeta` (gyro bias correction) — continuously estimates & removes drift
 *  - Works with any combination of sensors (graceful degradation)
 *
 * Availability: Chrome Android (Generic Sensor API for Gyroscope + Accelerometer + Magnetometer).
 * Not available on iOS Safari.
 *
 * Reference: Madgwick 2010 — "An efficient orientation filter for inertial
 * and magnetic sensor arrays" https://ieeexplore.ieee.org/document/5975346
 */

import * as THREE from 'three'
import type { IOrientationProvider } from './IOrientationProvider'

// We declare AHRS as a dynamic import to avoid hard dependency when
// the package is not installed or the sensor is unavailable.
//
// ⚠️ 这里的形状必须和 ahrs 的真实实现一致：它的 getQuaternion() 返回的是
// 普通对象 { w, x, y, z }，不是带 toArray() 的数组包装。之前这里凭空声明成
// `{ toArray: () => [...] }`，调用处也就写成 `.toArray()` —— 结果是过滤器一旦
// 真正跑起来就抛 TypeError（未捕获），姿态数据永远出不来。
type AHRSInstance = {
  update: (gyro: [number, number, number], accel: [number, number, number], mag: [number, number, number], dt: number) => void
  getQuaternion: () => { x: number; y: number; z: number; w: number }
}

interface MadgwickConfig {
  /** Filter gain (default 0.1). Lower = smoother but more lag. */
  beta?: number
}

// Reusable quaternion constants (same convention as AREngine)
const _Q_X90 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
const _Q_SCREEN = new THREE.Quaternion()
const _V_Z = new THREE.Vector3(0, 0, 1)

export class MadgwickOrientationProvider implements IOrientationProvider {
  readonly name = 'MadgwickOrientationProvider'
  readonly available: boolean

  private _cb: ((quat: THREE.Quaternion) => void) | null = null
  private _running = false
  private _ahrs: AHRSInstance | null = null
  private _lastUpdateTime = 0

  // Raw sensor references
  private _gyroSensor: any = null
  private _accelSensor: any = null
  private _magSensor: any = null

  // Latest raw readings
  private _gyro: [number, number, number] = [0, 0, 0]
  private _accel: [number, number, number] = [0, 0, -9.81]
  private _mag: [number, number, number] = [0, 0, 0]
  private _hasMag = false

  // Pre-allocated reusable quaternion (GC avoidance)
  private _quat = new THREE.Quaternion()

  private _config: MadgwickConfig

  constructor(config: MadgwickConfig = {}) {
    this._config = { beta: 0.1, ...config }

    // Check for required raw sensor APIs
    const hasGyro = typeof (window as any).Gyroscope !== 'undefined'
    const hasAccel = typeof (window as any).Accelerometer !== 'undefined'
    this.available = hasGyro && hasAccel
  }

  onReading(cb: (quat: THREE.Quaternion) => void): void {
    this._cb = cb
  }

  async start(): Promise<void> {
    if (this._running || !this._cb || !this.available) return

    // Dynamic import of ahrs
    try {
      const AHRS = (await import('ahrs')).default
      this._ahrs = new AHRS({
        sampleInterval: 16, // ~60Hz
        algorithm: 'Madgwick',
        beta: this._config.beta,
        kp: 0.5,
        ki: 0,
      }) as unknown as AHRSInstance
    } catch (e) {
      /*
       * 必须抛错，不能 return。
       *
       * 这处和 WebXROrientationProvider 是完全相同的坑：OrientationManager.start()
       * 以「await provider.start() 没有抛错」判定本级成功，一旦这里静默 return，
       * 它就会把 Madgwick 设为 active 并直接返回 —— 后面两级
       * （GenericSensor / DeviceOrientation）永远不会被尝试，
       * 结果是整条 4 级降级链名存实亡、朝向数据全程为空。
       *
       * 而 `ahrs` 这个包在 package.json 里声明了（"ahrs": "^1.3.3"）却并未安装，
       * 所以这条分支在真实设备上是**必然会走到**的，不是边缘情况。
       */
      console.warn('[AR] MadgwickOrientationProvider: ahrs not available, falling back:', e)
      throw e
    }

    // Start raw sensors
    this._running = true

    // Gyroscope
    try {
      const Gyroscope = (window as any).Gyroscope
      const gSensor = new Gyroscope({ frequency: 60 })
      gSensor.addEventListener('reading', () => {
        this._gyro = [
          THREE.MathUtils.degToRad(gSensor.x || 0),
          THREE.MathUtils.degToRad(gSensor.y || 0),
          THREE.MathUtils.degToRad(gSensor.z || 0),
        ]
      })
      gSensor.start()
      this._gyroSensor = gSensor
    } catch (e) {
      console.warn('[AR] Madgwick: Gyroscope unavailable:', e)
    }

    // Accelerometer
    try {
      const Accelerometer = (window as any).Accelerometer
      const aSensor = new Accelerometer({ frequency: 60, referenceFrame: 'device' })
      aSensor.addEventListener('reading', () => {
        this._accel = [aSensor.x || 0, aSensor.y || 0, aSensor.z || 0]
      })
      aSensor.start()
      this._accelSensor = aSensor
    } catch (e) {
      console.warn('[AR] Madgwick: Accelerometer unavailable:', e)
    }

    // Magnetometer (optional, improves heading)
    try {
      const Magnetometer = (window as any).Magnetometer
      if (Magnetometer) {
        const mSensor = new Magnetometer({ frequency: 60 })
        mSensor.addEventListener('reading', () => {
          this._mag = [mSensor.x || 0, mSensor.y || 0, mSensor.z || 0] as [number, number, number]
          this._hasMag = true
        })
        mSensor.start()
        this._magSensor = mSensor
      }
    } catch (e) {
      console.log('[AR] Madgwick: Magnetometer unavailable (heading drift expected)')
    }

    // Polling loop: feed AHRS at ~60Hz
    const tick = () => {
      if (!this._running || !this._ahrs || !this._cb) return

      const now = performance.now()
      const dt = this._lastUpdateTime > 0 ? (now - this._lastUpdateTime) / 1000 : 0.016
      this._lastUpdateTime = now

      // Feed AHRS filter with latest sensor readings
      const mag = this._hasMag ? this._mag : [0, 0, 0] as [number, number, number]
      this._ahrs.update(this._gyro, this._accel, mag, dt)

      // ahrs 的 getQuaternion() 返回 { w, x, y, z } 普通对象（不是数组）
      const q = this._ahrs.getQuaternion()
      const quat = this._quat.set(q.x, q.y, q.z, q.w)

      // Rear camera compensation: -90° X rotation
      quat.multiply(_Q_X90)
      // Screen orientation compensation
      const orient = window.orientation !== undefined
        ? THREE.MathUtils.degToRad(window.orientation)
        : 0
      _Q_SCREEN.setFromAxisAngle(_V_Z, -orient)
      quat.multiply(_Q_SCREEN)

      this._cb(quat)

      if (this._running) requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
    console.log('[AR] MadgwickOrientationProvider started (beta=%s)', this._config.beta)
  }

  stop(): void {
    this._running = false
    ;[this._gyroSensor, this._accelSensor, this._magSensor].forEach((s) => {
      if (s) {
        try { s.stop() } catch { /* ignore */ }
      }
    })
    this._gyroSensor = null
    this._accelSensor = null
    this._magSensor = null
    this._ahrs = null
  }
}
