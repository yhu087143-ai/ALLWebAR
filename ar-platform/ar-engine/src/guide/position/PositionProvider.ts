/**
 * Position Provider interface for AR Guide positioning
 *
 * Abstracts different positioning technologies (GPS, BLE, VPS)
 * behind a common interface so the GuideEngine is technology-agnostic.
 */

/** Normalised user position that the GuideEngine consumes */
export interface UserPosition {
  /** WGS84 latitude in degrees */
  latitude?: number
  /** WGS84 longitude in degrees */
  longitude?: number
  /** Altitude above sea level in metres */
  altitude?: number
  /** Horizontal position accuracy in metres (95 % confidence) */
  accuracy?: number
  /** Heading in degrees clockwise from true north */
  heading?: number
  /** Ground speed in m/s */
  speed?: number
  /** Epoch milliseconds when this position was captured */
  timestamp: number
  /** Scene-space X (used by VPS / manual positioning) */
  sceneX?: number
  /** Scene-space Y (used by VPS / manual positioning) */
  sceneY?: number
  /** Scene-space Z (used by VPS / manual positioning) */
  sceneZ?: number
}

export interface IPositionProvider {
  /** Human-readable identifier (e.g. "gps", "ble", "vps") */
  readonly name: string
  /** Whether this provider is currently available on the device */
  readonly available: boolean

  /** Start listening for position updates */
  start(): void
  /** Stop listening and release resources */
  stop(): void
  /** Register a callback fired on every position update */
  onPosition(callback: (pos: UserPosition) => void): void
  /** One-shot query that returns the current best-known position */
  getCurrentPosition(): Promise<UserPosition>
}
