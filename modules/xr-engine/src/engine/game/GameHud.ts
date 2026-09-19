/**
 * 轻量 HUD 状态容器：给游戏运行时提供“资源/波次/血量/消息”等界面数据。
 * 脚本里通过 `ctx.engine.hud.set(...)` 更新，React 通过 subscribe 订阅。
 */
export interface GameHudState {
  visible: boolean
  sun: number
  wave: number
  zombies: number
  selected: string
  over: boolean
  message: string
}

export type HUDListener = (state: GameHudState) => void

const initialHud = (): GameHudState => ({
  visible: false,
  sun: 0,
  wave: 1,
  zombies: 0,
  selected: 'peashooter',
  over: false,
  message: '',
})

export class GameHud {
  private state = initialHud()
  private snapshot = initialHud()
  private listeners = new Set<HUDListener>()

  getState = (): GameHudState => this.snapshot

  set(patch: Partial<GameHudState>): void {
    const next = { ...this.state, ...patch }
    this.state = next
    // useSyncExternalStore 必须返回“同一引用直到真正变化”，否则会无限循环
    this.snapshot = next
    for (const listener of this.listeners) listener(this.snapshot)
  }

  reset(): void {
    const next = initialHud()
    this.state = next
    this.snapshot = next
    for (const listener of this.listeners) listener(this.snapshot)
  }

  subscribe = (listener: HUDListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
