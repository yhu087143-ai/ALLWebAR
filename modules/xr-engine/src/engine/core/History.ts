import type { GraphData } from './types'
import type { SceneGraph } from './SceneGraph'

/**
 * 快照式撤销栈。
 *
 * 为什么不用 zundo / immer patches：
 *   我们的权威数据在 SceneGraph（引擎层），zustand store 只是镜像。
 *   撤销必须作用于引擎数据，patch 记录反而绕远。
 *
 * 为什么用整图快照而不是命令模式：
 *   场景是纯数据 JSON，几百个节点 structuredClone 也就几毫秒，
 *   换来的是零侵入（不用改 SceneGraph 的任何写方法）和绝对可靠。
 *   场景规模大到快照成为瓶颈时，再换命令模式不迟。
 *
 * 合并策略：连续的 update（拖 gizmo、拖滑块每帧都来一次）
 * 在 500ms 内合并为一步，否则撤销一次只能回一帧，体验没法看。
 */
export class History {
  private stack: GraphData[] = []
  private index = -1
  private suspended = false
  private lastReason: string | null = null
  private lastNodeId: string | null = null
  private lastTime = 0

  constructor(
    private readonly graph: SceneGraph,
    private readonly limit = 64
  ) {
    // 构造即记下基线快照（此时通常是空场景），否则首次编辑捕获的是「改后」
    // 状态且 index=0，canUndo 恒为 false —— 第一个操作永远撤不掉
    this.reset()
  }

  /** SceneGraph 每次写操作后调用 */
  capture(reason: string, nodeId: string | null = null): void {
    if (this.suspended) return

    const now = Date.now()
    const isContinuation =
      reason === 'update' &&
      this.lastReason === 'update' &&
      this.lastNodeId === nodeId &&
      now - this.lastTime < 500

    this.lastReason = reason
    this.lastNodeId = nodeId
    this.lastTime = now

    if (isContinuation && this.index >= 0) {
      // 合并为一步：只更新当前快照，不新增历史点
      this.stack[this.index] = this.graph.toJSON()
      return
    }

    // 丢弃 redo 分支
    this.stack = this.stack.slice(0, this.index + 1)
    this.stack.push(this.graph.toJSON())

    if (this.stack.length > this.limit) {
      this.stack.shift()
    }
    this.index = this.stack.length - 1
  }

  /** 撤销正在进行的连续操作归类（比如鼠标抬起后，下一次拖拽算新的一步） */
  flush(): void {
    this.lastReason = null
    this.lastNodeId = null
  }

  /** 播放模式等场景下临时停用快照记录，退出后必须配对 resume */
  suspend(): void {
    this.suspended = true
  }

  resume(): void {
    this.suspended = false
  }

  undo(): boolean {
    if (this.index <= 0) return false
    this.index -= 1
    this.apply()
    this.flush()
    return true
  }

  redo(): boolean {
    if (this.index >= this.stack.length - 1) return false
    this.index += 1
    this.apply()
    this.flush()
    return true
  }

  get canUndo(): boolean {
    return this.index > 0
  }

  get canRedo(): boolean {
    return this.index < this.stack.length - 1
  }

  private apply(): void {
    this.suspended = true
    try {
      this.graph.load(this.stack[this.index])
    } finally {
      this.suspended = false
    }
  }

  /** 载入新项目或新建时清空历史；同时把当前图状态记为基线（index=0，不可再往前撤） */
  reset(): void {
    this.stack = [this.graph.toJSON()]
    this.index = 0
    this.lastReason = null
    this.lastNodeId = null
  }
}
