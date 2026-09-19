import * as THREE from 'three'

/**
 * Orientation provider interface
 *
 * Implementations provide device orientation as a quaternion.
 * The fallback chain tries providers in priority order:
 *   1. WebXROrientationProvider  (ARCore, drift-free)
 *   2. MadgwickOrientationProvider (AHRS sensor fusion)
 *   3. GenericSensorProvider (Absolute/RelativeOrientationSensor API)
 *   4. DeviceOrientationProvider (DeviceOrientationEvent, universal fallback)
 */
export interface IOrientationProvider {
  /** Whether this provider is available on the current device/browser */
  readonly available: boolean
  /** Human-readable name for logging */
  readonly name: string

  /**
   * Start listening for orientation updates.
   * The provider will call `onReading` with each new quaternion.
   */
  start(): void

  /**
   * Stop listening. Called when the provider is superseded or AR stops.
   */
  stop(): void

  /**
   * Register a callback for each new orientation reading.
   * The quaternion is in the AR world frame (post camera compensation).
   */
  onReading(cb: (quat: THREE.Quaternion) => void): void
}
