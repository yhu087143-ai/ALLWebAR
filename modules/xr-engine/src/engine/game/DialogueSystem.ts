/**
 * 轻量剧情/对话系统。
 *
 * 数据可序列化：既能存到编辑器场景，也能导出到微信运行时。
 * 适合做 NPC 对话、剧情分支、任务提示、互动剧情。
 */

export interface DialogueChoice {
  text: string
  next: string
  /** 可选条件，例如 { type: 'flag', key: 'hasKey', value: true } */
  condition?: Record<string, unknown>
  /** 选择后执行的动作 */
  actions?: string[]
}

export interface DialogueNode {
  id: string
  speaker?: string
  text: string
  /** 直接跳转的下一个节点 */
  next?: string
  choices?: DialogueChoice[]
  /** 进入该节点时执行的动作 */
  actions?: string[]
  /** 可选：显示该节点前满足的条件 */
  condition?: Record<string, unknown>
}

export interface DialogueEvent {
  type: 'start' | 'node' | 'choice' | 'end' | 'flag' | 'warning'
  dialogueId?: string
  node?: DialogueNode
  choice?: DialogueChoice
  data?: Record<string, unknown>
}

export type DialogueListener = (event: DialogueEvent) => void

/** setFlag 动作的值按字面量解析：true/false/数字，其余保持字符串 */
function parseFlagValue(raw: string): unknown {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw !== '' && !Number.isNaN(Number(raw))) return Number(raw)
  return raw
}

/**
 * 极简对话树解释器。
 * 支持：线性对话、分支选择、条件、动作、触发事件。
 */
export class DialogueSystem {
  private dialogues = new Map<string, DialogueNode[]>()
  private currentDialogue: string | null = null
  private currentIndex = 0
  private flags = new Map<string, unknown>()
  private listeners = new Set<DialogueListener>()

  register(id: string, nodes: DialogueNode[]): void {
    this.dialogues.set(id, nodes)
  }

  unregister(id: string): void {
    this.dialogues.delete(id)
  }

  get(id: string): DialogueNode[] | undefined {
    return this.dialogues.get(id)
  }

  setFlag(key: string, value: unknown): void {
    this.flags.set(key, value)
    this.emit({ type: 'flag', data: { flag: key, value } })
  }

  getFlag(key: string): unknown {
    return this.flags.get(key)
  }

  /** 求值显示条件；未知条件类型不拦截（保持向后兼容） */
  evalCondition(condition: Record<string, unknown> | undefined): boolean {
    if (!condition) return true
    if (condition.type === 'flag') {
      const current = this.flags.get(String(condition.key ?? ''))
      // 不写 value 表示只要求 flag 为真
      return 'value' in condition ? current === condition.value : Boolean(current)
    }
    return true
  }

  start(id: string, startNodeId?: string): void {
    const nodes = this.dialogues.get(id)
    if (!nodes || nodes.length === 0) return
    this.currentDialogue = id
    this.currentIndex = Math.max(0, nodes.findIndex((n) => n.id === (startNodeId ?? nodes[0].id)))
    this.emit({ type: 'start', dialogueId: id })
    this.showCurrent()
  }

  /** 当前节点 */
  get current(): DialogueNode | null {
    if (!this.currentDialogue) return null
    const nodes = this.dialogues.get(this.currentDialogue)
    return nodes?.[this.currentIndex] ?? null
  }

  /** 当前节点中条件满足的选项（UI 应只展示这些） */
  availableChoices(node: DialogueNode | null = this.current): DialogueChoice[] {
    return (node?.choices ?? []).filter((choice) => this.evalCondition(choice.condition))
  }

  choose(index: number): void {
    const node = this.current
    if (!node?.choices) return
    const choice = node.choices[index]
    if (!choice) return
    // 条件不满足的选项不可选
    if (!this.evalCondition(choice.condition)) return
    this.runActions(choice.actions)
    this.emit({ type: 'choice', node, choice })
    this.goTo(choice.next)
  }

  /** 继续线性对话 */
  next(): void {
    const node = this.current
    if (!node) return
    const target = node.next ?? this.nextNodeId()
    this.goTo(target)
  }

  saveFlags(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [k, v] of this.flags) out[k] = v
    return out
  }

  loadFlags(data: Record<string, unknown>): void {
    this.flags.clear()
    for (const k of Object.keys(data)) this.flags.set(k, data[k])
  }

  subscribe(listener: DialogueListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private goTo(id: string | undefined, depth = 0): void {
    if (!id) {
      this.endDialogue()
      return
    }
    const nodes = this.currentDialogue ? this.dialogues.get(this.currentDialogue) : undefined
    const idx = nodes?.findIndex((n) => n.id === id) ?? -1
    if (idx < 0) {
      // 目标节点不存在：结束对话并发警告，而不是静默卡在当前节点
      this.emit({
        type: 'warning',
        dialogueId: this.currentDialogue ?? undefined,
        data: { reason: 'missing-node', target: id },
      })
      this.endDialogue()
      return
    }
    this.currentIndex = idx
    this.showCurrent(depth)
  }

  private nextNodeId(): string | undefined {
    const nodes = this.currentDialogue ? this.dialogues.get(this.currentDialogue) : undefined
    return nodes?.[this.currentIndex + 1]?.id
  }

  private showCurrent(depth = 0): void {
    const node = this.current
    if (!node) return
    if (!this.evalCondition(node.condition)) {
      // 条件不满足的节点直接跳过；跳过链成环（A→B→A）时结束对话而不是死循环
      const count = (this.currentDialogue ? this.dialogues.get(this.currentDialogue) : undefined)?.length ?? 0
      if (depth >= count) {
        this.emit({
          type: 'warning',
          dialogueId: this.currentDialogue ?? undefined,
          data: { reason: 'condition-loop', node: node.id },
        })
        this.endDialogue()
        return
      }
      this.goTo(node.next ?? this.nextNodeId(), depth + 1)
      return
    }
    this.runActions(node.actions)
    this.emit({ type: 'node', node })
  }

  private endDialogue(): void {
    this.emit({ type: 'end', dialogueId: this.currentDialogue ?? undefined })
    this.currentDialogue = null
    this.currentIndex = 0
  }

  private runActions(actions: string[] | undefined): void {
    if (!actions) return
    for (const action of actions) {
      // 简单动作：setFlag:key=value
      const m = action.match(/^setFlag:([^=]+)=(.*)$/)
      if (m) this.setFlag(m[1], parseFlagValue(m[2]))
    }
  }

  private emit(event: DialogueEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
