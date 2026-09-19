/**
 * Minimal type declarations for `ahrs` package.
 *
 * Only the APIs used by MadgwickOrientationProvider are declared.
 */
declare module 'ahrs' {
  interface AHRSConfig {
    sampleInterval?: number
    algorithm?: 'Madgwick' | 'Mahony'
    beta?: number
    zeta?: number
    kp?: number
    ki?: number
    doInitialisation?: boolean
  }

  interface AHRSQuaternion {
    toArray(): [number, number, number, number]
  }

  class AHRS {
    constructor(config?: AHRSConfig)
    update(
      gyro: [number, number, number],
      accel: [number, number, number],
      mag: [number, number, number],
      dt: number,
    ): void
    getQuaternion(): AHRSQuaternion
  }

  export default AHRS
}
