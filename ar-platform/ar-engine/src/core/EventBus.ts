import type { AREventMap, AREventName, AREventCallback } from '../types/events'

type Listener = (...args: any[]) => void

export class EventBus {
  private listeners = new Map<string, Set<Listener>>()

  on<T extends AREventName>(event: T, cb: AREventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(cb as Listener)
    return () => this.off(event, cb as Listener)
  }

  off<T extends AREventName>(event: T, cb: AREventCallback<T>): void {
    this.listeners.get(event)?.delete(cb as Listener)
  }

  emit<T extends AREventName>(event: T, data: AREventMap[T]): void {
    this.listeners.get(event)?.forEach((cb) => cb(data))
  }

  clear(): void {
    this.listeners.clear()
  }
}
