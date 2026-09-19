/**
 * VPS (Visual Positioning System) position provider — stub.
 *
 * Reserved for future camera-based visual positioning (e.g. Google VPS, ARCloud).
 * Currently always reports as unavailable.
 */

import type { IPositionProvider, UserPosition } from './PositionProvider'

export class VPSPositionProvider implements IPositionProvider {
  readonly name = 'vps'

  get available(): boolean {
    return false
  }

  start(): void {
    console.log('[VPSPositionProvider] VPS not available — stub provider, no-op')
  }

  stop(): void {
    // no-op
  }

  onPosition(_callback: (pos: UserPosition) => void): void {
    console.log('[VPSPositionProvider] VPS not available — no position callbacks')
  }

  getCurrentPosition(): Promise<UserPosition> {
    console.warn('[VPSPositionProvider] VPS not available — returning fallback position')
    return Promise.resolve({ timestamp: Date.now() })
  }
}
