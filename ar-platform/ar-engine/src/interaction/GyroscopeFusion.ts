import * as THREE from 'three'

export class GyroscopeFusion {
  private _gyroQuat = new THREE.Quaternion()
  private _gyroAvailable = false
  private sensor: any = null

  get quaternion(): THREE.Quaternion {
    return this._gyroQuat
  }

  get available(): boolean {
    return this._gyroAvailable
  }

  init(): void {
    // Priority A: RelativeOrientationSensor (Chrome, more precise)
    if (typeof (window as any).RelativeOrientationSensor !== 'undefined') {
      try {
        const sensor = new (window as any).RelativeOrientationSensor({
          frequency: 60,
          referenceFrame: 'device',
        })
        sensor.addEventListener('reading', () => {
          const q = sensor.quaternion
          if (q) {
            this._gyroQuat.set(q[0], q[1], q[2], q[3])
            this._gyroAvailable = true
          }
        })
        sensor.start()
        this.sensor = sensor
        return
      } catch {
        console.warn('[Gyro] RelativeOrientationSensor unavailable')
      }
    }

    // Priority B: DeviceOrientation API (fallback)
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', (e) => {
        const alpha = e.alpha || 0
        const beta = e.beta || 0
        const gamma = e.gamma || 0
        const euler = new THREE.Euler(
          THREE.MathUtils.degToRad(beta),
          THREE.MathUtils.degToRad(gamma),
          THREE.MathUtils.degToRad(alpha),
          'YXZ',
        )
        this._gyroQuat.setFromEuler(euler)
        this._gyroAvailable = true
      })
    }
  }

  dispose(): void {
    if (this.sensor) {
      try { this.sensor.stop() } catch {}
      this.sensor = null
    }
    this._gyroQuat.identity()
    this._gyroAvailable = false
  }
}
