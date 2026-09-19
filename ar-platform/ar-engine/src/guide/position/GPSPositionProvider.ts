/**
 * GPS-based position provider.
 *
 * Wraps the Geolocation API (navigator.geolocation.watchPosition)
 * and emits UserPosition updates at the device's native rate.
 */

import type { IPositionProvider, UserPosition } from './PositionProvider'

export class GPSPositionProvider implements IPositionProvider {
  readonly name = 'gps'

  private _watchId: number | null = null
  private _callback: ((pos: UserPosition) => void) | null = null
  private _lastPosition: UserPosition | null = null
  private _highAccuracy: boolean
  private _timeout: number
  private _maxAge: number

  constructor(options?: { highAccuracy?: boolean; timeout?: number; maxAge?: number }) {
    this._highAccuracy = options?.highAccuracy ?? true
    this._timeout = options?.timeout ?? 10000
    this._maxAge = options?.maxAge ?? 0
  }

  get available(): boolean {
    return 'geolocation' in navigator && navigator.geolocation !== null
  }

  start(): void {
    if (this._watchId !== null) return
    if (!this.available) {
      console.warn('[GPSPositionProvider] Geolocation API not available')
      return
    }

    this._watchId = navigator.geolocation.watchPosition(
      (geoPos) => {
        const pos: UserPosition = {
          latitude: geoPos.coords.latitude,
          longitude: geoPos.coords.longitude,
          altitude: geoPos.coords.altitude ?? undefined,
          accuracy: geoPos.coords.accuracy,
          heading: geoPos.coords.heading ?? undefined,
          speed: geoPos.coords.speed ?? undefined,
          timestamp: geoPos.timestamp,
        }
        this._lastPosition = pos
        this._callback?.(pos)
      },
      (err) => {
        console.warn('[GPSPositionProvider] watchPosition error:', err.message)
      },
      {
        enableHighAccuracy: this._highAccuracy,
        timeout: this._timeout,
        maximumAge: this._maxAge,
      },
    )

    console.log('[GPSPositionProvider] Started GPS watch')
  }

  stop(): void {
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId)
      this._watchId = null
      console.log('[GPSPositionProvider] Stopped GPS watch')
    }
  }

  onPosition(callback: (pos: UserPosition) => void): void {
    this._callback = callback
  }

  getCurrentPosition(): Promise<UserPosition> {
    if (this._lastPosition) {
      return Promise.resolve(this._lastPosition)
    }

    return new Promise<UserPosition>((resolve, reject) => {
      if (!this.available) {
        reject(new Error('GPS not available'))
        return
      }

      navigator.geolocation.getCurrentPosition(
        (geoPos) => {
          const pos: UserPosition = {
            latitude: geoPos.coords.latitude,
            longitude: geoPos.coords.longitude,
            altitude: geoPos.coords.altitude ?? undefined,
            accuracy: geoPos.coords.accuracy,
            heading: geoPos.coords.heading ?? undefined,
            speed: geoPos.coords.speed ?? undefined,
            timestamp: geoPos.timestamp,
          }
          this._lastPosition = pos
          resolve(pos)
        },
        (err) => {
          reject(new Error(`GPS getCurrentPosition failed: ${err.message}`))
        },
        {
          enableHighAccuracy: this._highAccuracy,
          timeout: this._timeout,
          maximumAge: this._maxAge,
        },
      )
    })
  }
}
