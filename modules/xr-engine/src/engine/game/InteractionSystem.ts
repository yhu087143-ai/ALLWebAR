/**
 * 交互/触发/任务系统。
 * 支持点击触发、靠近触发、条件触发，可挂对话、时间轴、flag、音效等动作。
 */

export interface InteractionAction {
  type: 'dialogue' | 'timeline' | 'setFlag' | 'audio' | 'spawn' | 'custom'
  target?: string
  value?: unknown
  data?: Record<string, unknown>
}

export interface InteractionDef {
  id: string
  name?: string
  trigger: 'tap' | 'proximity' | 'flag' | 'timer' | 'auto'
  condition?: Record<string, unknown>
  actions: InteractionAction[]
  /** 可重复触发 */
  repeat?: boolean
  /** 触发后自动禁用 */
  once?: boolean
}

export type InteractionEvent = { type: 'trigger'; interaction: InteractionDef; data?: Record<string, unknown> }

export class InteractionSystem {
  private defs = new Map<string, InteractionDef>()
  private active = new Map<string, boolean>()
  private listeners = new Set<(event: InteractionEvent) => void>()

  register(def: InteractionDef): void {
    this.defs.set(def.id, def)
    this.active.set(def.id, true)
  }

  unregister(id: string): void {
    this.defs.delete(id)
    this.active.delete(id)
  }

  list(): InteractionDef[] {
    return [...this.defs.values()]
  }

  trigger(id: string, data?: Record<string, unknown>): boolean {
    const def = this.defs.get(id)
    if (!def || this.active.get(id) === false) return false
    this.listeners.forEach((l) => l({ type: 'trigger', interaction: def, data }))
    if (def.once) this.active.set(id, false)
    return true
  }

  reset(id?: string): void {
    if (id) this.active.set(id, true)
    else for (const k of this.active.keys()) this.active.set(k, true)
  }

  subscribe(listener: (event: InteractionEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
