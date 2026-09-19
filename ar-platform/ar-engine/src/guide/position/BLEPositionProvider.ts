/**
 * BLE (Bluetooth Low Energy) beacon-based position provider — stub.
 *
 * Reserved for future indoor positioning via BLE beacon triangulation.
 * Currently always reports as unavailable.
 */

import type { IPositionProvider, UserPosition } from './PositionProvider'

export class BLEPositionProvider implements IPositionProvider {
  readonly name = 'ble'

  get available(): boolean {
    return false
  }

  start(): void {
    console.log('[BLEPositionProvider] BLE not available — stub provider, no-op')
  }

  stop(): void {
    // no-op
  }

  onPosition(_callback: (pos: UserPosition) => void): void {
    console.log('[BLEPositionProvider] BLE not available — no position callbacks')
  }

  getCurrentPosition(): Promise<UserPosition> {
    console.warn('[BLEPositionProvider] BLE not available — returning fallback position')
    return Promise.resolve({ timestamp: Date.now() })
  }
}
