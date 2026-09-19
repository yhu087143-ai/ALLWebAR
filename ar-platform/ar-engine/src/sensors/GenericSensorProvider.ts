/**
 * GenericSensorOrientationProvider
 *
 * Uses the Generic Sensor API:
 *   - AbsoluteOrientationSensor (magnetometer-stabilised, drift-free heading) — primary
 *   - RelativeOrientationSensor (gyro + accel only, heading drifts) — fallback
 *
 * Availability: Chrome Android 67+, Edge, Samsung Internet.
 * Not available on iOS Safari.
 */

import * as THREE from 'three'
import type { IOrientationProvider } from './IOrientationProvider'

// Reusable quaternion constants (same convention as AREngine)
const _Q_X90 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
const _Q_SCREEN = new THREE.Quaternion()
const _V_Z = new THREE.Vector3(0, 0, 1)

export class GenericSensorProvider implements IOrientationProvider {
  readonly name = 'GenericSensorProvider'
  readonly available: boolean

  private _sensor: any = null
  private _cb: ((quat: THREE.Quaternion) => void) | null = null
  private _running = false
  /** Pre-allocated reusable quaternion (GC avoidance) */
  private _quat = new THREE.Quaternion()

  constructor() {
    this.available =
      typeof (window as any).AbsoluteOrientationSensor !== 'undefined' ||
      typeof (window as any).RelativeOrientationSensor !== 'undefined'
  }

  onReading(cb: (quat: THREE.Quaternion) => void): void {
    this._cb = cb
  }

  start(): void {
    if (this._running || !this._cb) return
    const hasAbs = typeof (window as any).AbsoluteOrientationSensor !== 'undefined'
    const SensorClass = hasAbs
      ? (window as any).AbsoluteOrientationSensor
      : (window as any).RelativeOrientationSensor
    const sensorName = hasAbs ? 'AbsoluteOrientationSensor' : 'RelativeOrientationSensor'

    try {
      const sensor = new SensorClass({ frequency: 60, referenceFrame: 'device' })
      sensor.addEventListener('reading', () => {
        const q = sensor.quaternion
        if (!q || !this._cb) return

        const quat = this._quat.set(q[0], q[1], q[2], q[3])
        // Rear camera compensation: -90° X rotation
        quat.multiply(_Q_X90)
        // Screen orientation compensation
        const orient = window.orientation !== undefined
          ? THREE.MathUtils.degToRad(window.orientation)
          : 0
        _Q_SCREEN.setFromAxisAngle(_V_Z, -orient)
        quat.multiply(_Q_SCREEN)

        this._cb(quat)
      })
      sensor.start()
      this._sensor = sensor
      this._running = true
      console.log(`[AR] ${sensorName} started via GenericSensorProvider`)
    } catch (e) {
      console.warn(`[AR] ${sensorName} init failed:`, e)
    }
  }

  stop(): void {
    if (this._sensor) {
      this._sensor.stop()
      this._sensor = null
    }
    this._running = false
  }
}
