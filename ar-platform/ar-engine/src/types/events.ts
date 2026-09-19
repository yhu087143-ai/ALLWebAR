import type { CapabilityType } from './capabilities'

export interface AREventMap {
  'tracking:found': { type: CapabilityType }
  'tracking:lost': { type: CapabilityType }
  'model:loading': { progress: number }
  'model:loaded': {}
  'model:error': { error: Error }
  'engine:started': { engine: string }
  'engine:stopped': {}
  'engine:error': { error: Error }
  'camera:switched': {}
}

export type AREventName = keyof AREventMap
export type AREventCallback<T extends AREventName> = (data: AREventMap[T]) => void
