/**
 * 任务 / 成就系统。
 * 数据可序列化，Web 和微信共用。
 */

export interface TaskObjective {
  id: string
  label: string
  /** 目标数量 */
  target: number
  /** 当前进度 */
  current?: number
  /** 完成条件：type 可选 'flag' | 'count' | 'custom' */
  type?: string
  flagKey?: string
  flagValue?: unknown
}

export interface TaskDef {
  id: string
  title: string
  description?: string
  objectives: TaskObjective[]
  rewards?: string[]
  dependsOn?: string[]
}

export interface TaskEvent {
  type: 'progress' | 'complete' | 'unlock' | 'reward'
  taskId: string
  data?: Record<string, unknown>
}

export class TaskSystem {
  private tasks = new Map<string, TaskDef>()
  private progress = new Map<string, Record<string, number>>()
  private completed = new Set<string>()
  private listeners = new Set<(event: TaskEvent) => void>()

  register(task: TaskDef): void {
    this.tasks.set(task.id, task)
    if (!this.progress.has(task.id)) {
      const p: Record<string, number> = {}
      for (const obj of task.objectives) p[obj.id] = 0
      this.progress.set(task.id, p)
    }
  }

  unregister(id: string): void {
    this.tasks.delete(id)
    this.progress.delete(id)
    this.completed.delete(id)
  }

  list(): TaskDef[] {
    return [...this.tasks.values()]
  }

  getTask(id: string): TaskDef | undefined {
    return this.tasks.get(id)
  }

  reset(id?: string): void {
    if (id) {
      this.completed.delete(id)
      const task = this.tasks.get(id)
      if (task) {
        const p: Record<string, number> = {}
        for (const obj of task.objectives) p[obj.id] = 0
        this.progress.set(id, p)
      }
    } else {
      this.completed.clear()
      for (const id2 of this.tasks.keys()) this.reset(id2)
    }
  }

  progressOf(taskId: string, objectiveId: string): number {
    return this.progress.get(taskId)?.[objectiveId] ?? 0
  }

  isCompleted(taskId: string): boolean {
    return this.completed.has(taskId)
  }

  add(taskId: string, objectiveId: string, amount = 1): void {
    const task = this.tasks.get(taskId)
    if (!task || this.completed.has(taskId)) return
    const obj = task.objectives.find((o) => o.id === objectiveId)
    if (!obj) return
    const p = this.progress.get(taskId) ?? {}
    p[objectiveId] = Math.min(obj.target, (p[objectiveId] ?? 0) + amount)
    this.progress.set(taskId, p)
    this.emit({ type: 'progress', taskId, data: { objectiveId, value: p[objectiveId], target: obj.target } })
    if (p[objectiveId] >= obj.target) this.checkComplete(taskId)
  }

  checkComplete(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || this.completed.has(taskId)) return
    for (const obj of task.objectives) {
      if ((this.progress.get(taskId)?.[obj.id] ?? 0) < obj.target) return
    }
    this.completed.add(taskId)
    this.emit({ type: 'complete', taskId })
    for (const reward of task.rewards ?? []) {
      this.emit({ type: 'reward', taskId, data: { reward } })
    }
  }

  subscribe(listener: (event: TaskEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  serialize(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [id, p] of this.progress) {
      out[id] = { progress: p, completed: this.completed.has(id) }
    }
    return out
  }

  /** 从存档恢复任务进度（serialize 的逆操作） */
  deserialize(data: Record<string, unknown>): void {
    if (!data) return
    for (const [id, entry] of Object.entries(data)) {
      const e = entry as { progress?: Record<string, number>; completed?: boolean }
      if (e.progress) this.progress.set(id, { ...e.progress })
      if (e.completed) this.completed.add(id)
      else this.completed.delete(id)
    }
  }

  private emit(event: TaskEvent): void {
    for (const l of this.listeners) l(event)
  }
}
