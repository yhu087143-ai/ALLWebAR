/**
 * 极简类型化事件总线。
 * 引擎内部模块之间、以及引擎 -> React UI 的通知都走这里，
 * 避免引擎层直接依赖 React。
 */

export type Handler<T> = (payload: T) => void

export class EventBus<Events extends object> {
  private map = new Map<keyof Events, Set<Handler<never>>>()

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.map.get(event)
    if (!set) {
      set = new Set()
      this.map.set(event, set)
    }
    set.add(handler as Handler<never>)
    return () => this.off(event, handler)
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.map.get(event)?.delete(handler as Handler<never>)
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.map.get(event)
    if (!set) return
    for (const handler of Array.from(set)) {
      try {
        ;(handler as Handler<Events[K]>)(payload)
      } catch (err) {
        console.error(`[EventBus] handler for "${String(event)}" threw`, err)
      }
    }
  }

  clear(): void {
    this.map.clear()
  }
}
