/**
 * DeviceOrientationProvider
 *
 * Uses the DeviceOrientationEvent API — universal fallback available on
 * most mobile browsers including iOS Safari.
 *
 * iOS enhancement: fuses `webkitCompassHeading` (magnetometer) with gyro
 * readings via an adaptive complementary filter to reduce yaw drift.
 *
 * Availability: iOS Safari 4.2+, Chrome Android, most modern mobile browsers.
 */

import * as THREE from 'three'
import type { IOrientationProvider } from './IOrientationProvider'

// Reusable quaternion constants (same convention as AREngine)
const _Q_X90 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
const _Q_SCREEN = new THREE.Quaternion()
const _V_Z = new THREE.Vector3(0, 0, 1)

export class DeviceOrientationProvider implements IOrientationProvider {
  readonly name = 'DeviceOrientationProvider'
  readonly available: boolean

  private _cb: ((quat: THREE.Quaternion) => void) | null = null
  private _running = false

  // Pre-allocated reusable objects (GC avoidance)
  private _euler = new THREE.Euler()
  private _quat = new THREE.Quaternion()

  // Complementary filter state
  private _lastRawAlpha = 0
  private _lastAlphaTime = 0
  /** Gyro bias estimate (accumulated drift) */
  private _gyroBias = 0
  /** How long the device has been stationary (in consecutive readings) */
  private _stationarySampleCount = 0

  constructor() {
    this.available = typeof window.DeviceOrientationEvent !== 'undefined'
  }

  onReading(cb: (quat: THREE.Quaternion) => void): void {
    this._cb = cb
  }

  start(): void {
    if (this._running || !this._cb) return
    this._running = true
    this._lastRawAlpha = 0
    this._lastAlphaTime = 0
    this._gyroBias = 0
    this._stationarySampleCount = 0

    window.addEventListener('deviceorientation', this._handler)
    console.log('[AR] DeviceOrientationProvider started')
  }

  stop(): void {
    this._running = false
    window.removeEventListener('deviceorientation', this._handler)
  }

  // ── Private ──

  private _handler = (e: DeviceOrientationEvent): void => {
    if (!this._cb) return

    const now = performance.now()
    const rawAlpha = e.alpha || 0
    const beta = e.beta || 0
    const gamma = e.gamma || 0

    // ── Enhanced iOS complementary filter ──
    let useAlpha = rawAlpha
    if (typeof (e as any).webkitCompassHeading === 'number') {
      useAlpha = this._applyComplementaryFilter(rawAlpha, now, e)
    }

    // Convert Euler → quaternion (DeviceOrientationControls convention)
    const orient = window.orientation !== undefined
      ? THREE.MathUtils.degToRad(window.orientation)
      : 0
    this._euler.set(
      THREE.MathUtils.degToRad(beta),
      THREE.MathUtils.degToRad(useAlpha),
      -THREE.MathUtils.degToRad(gamma),
      'YXZ',
    )
    const quat = this._quat.setFromEuler(this._euler)
    // Rear camera compensation: -90° X rotation
    quat.multiply(_Q_X90)
    // Screen orientation compensation
    _Q_SCREEN.setFromAxisAngle(_V_Z, -orient)
    quat.multiply(_Q_SCREEN)

    this._cb(quat)
  }

  /**
   * Adaptive complementary filter fusing gyro (rawAlpha) with compass heading.
   *
   * Key improvements over basic implementation:
   *  - Gyro bias tracking during stationary periods (accumulated drift estimate)
   *  - Heading lock when compass accuracy is high and device is still
   *  - Adaptive crossover frequency based on angular velocity
   */
  private _applyComplementaryFilter(rawAlpha: number, now: number, e: DeviceOrientationEvent): number {
    const heading = (e as any).webkitCompassHeading as number
    if (typeof heading !== 'number') return rawAlpha

    // Compute time delta and angular velocity from gyro
    const dt = this._lastAlphaTime > 0 ? (now - this._lastAlphaTime) / 1000 : 0
    let delta = rawAlpha - this._lastRawAlpha
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    const gyroRate = dt > 0 ? Math.abs(delta / dt) : 0

    // Detect stationary: very low angular velocity + consecutive readings
    const isStationary = gyroRate < 2 && dt > 0.01
    if (isStationary) {
      this._stationarySampleCount++
    } else {
      this._stationarySampleCount = 0
    }

    // Gyro bias tracking: when stationary for sustained period, accumulate bias
    if (this._stationarySampleCount > 30) {
      const compassError = this._computeCompassError(heading, rawAlpha)
      // Slowly track bias only if compass is credible
      if (Math.abs(compassError) < 10) {
        this._gyroBias += compassError * 0.001
        // Clamp bias to avoid windup
        this._gyroBias = Math.max(-5, Math.min(5, this._gyroBias))
      }
    } else {
      // Leak bias back toward zero when moving (filter adapts)
      this._gyroBias *= 0.999
    }

    // Apply bias correction to raw alpha
    const correctedAlpha = rawAlpha + this._gyroBias

    // Update tracking state
    this._lastRawAlpha = rawAlpha
    this._lastAlphaTime = now

    // Adaptive weight: fast motion → trust gyro more; slow/still → trust compass more
    const alphaWeight = gyroRate > 30 ? 0.95 : gyroRate > 5 ? 0.97 : 0.99

    // Heading lock: when very still with good compass accuracy, snap to compass
    if (isStationary && this._stationarySampleCount > 60 && Math.abs(this._computeCompassError(heading, correctedAlpha)) < 3) {
      const lockStrength = Math.min(1, this._stationarySampleCount / 300) // Gradual lock over ~5s
      return correctedAlpha * (1 - lockStrength * 0.5) + heading * (lockStrength * 0.5)
    }

    // Standard complementary filter
    let compassError = this._computeCompassError(heading, correctedAlpha)
    if (Math.abs(compassError) < 45) {
      const filtered = correctedAlpha + (1 - alphaWeight) * compassError
      return ((filtered % 360) + 360) % 360
    }

    return ((correctedAlpha % 360) + 360) % 360
  }

  /**
   * Compute shortest signed angle from raw to compass heading
   */
  private _computeCompassError(compass: number, raw: number): number {
    let err = compass - raw
    if (err > 180) err -= 360
    if (err < -180) err += 360
    return err
  }
}
