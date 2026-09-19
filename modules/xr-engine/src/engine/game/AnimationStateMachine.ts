/**
 * 轻量动画状态机：把“播放哪个 clip”从散落的 if/else 收拢成状态定义。
 * 之后可以接入 Three.js AnimationMixer，也可以接入微信 xr-frame 的 animator。
 */
export interface AnimationState {
  /** 动画片段名 */
  clip: string
  loop?: boolean
  speed?: number
  /** 进入该状态时是否从头播 */
  restart?: boolean
}

export type TransitionRule = (from: string, to: string) => boolean

export class AnimationStateMachine {
  private states = new Map<string, AnimationState>()
  private transitions = new Map<string, Map<string, TransitionRule>>()
  private currentState: string | null = null

  clear(): void {
    this.states.clear()
    this.transitions.clear()
    this.currentState = null
  }

  addState(name: string, state: AnimationState): this {
    this.states.set(name, state)
    return this
  }

  addTransition(from: string, to: string, rule: TransitionRule): this {
    let map = this.transitions.get(from)
    if (!map) {
      map = new Map()
      this.transitions.set(from, map)
    }
    map.set(to, rule)
    return this
  }

  setState(name: string, force = false): AnimationState | null {
    if (name === this.currentState && !force) return this.states.get(name) ?? null
    this.currentState = name
    return this.states.get(name) ?? null
  }

  update(context: unknown): void {
    const from = this.currentState
    if (!from) return
    const targets = this.transitions.get(from)
    if (!targets) return
    for (const [to, rule] of targets) {
      if (rule(from, to)) {
        this.setState(to)
        return
      }
    }
  }

  get current(): string | null {
    return this.currentState
  }

  getState(name: string): AnimationState | undefined {
    return this.states.get(name)
  }
}
