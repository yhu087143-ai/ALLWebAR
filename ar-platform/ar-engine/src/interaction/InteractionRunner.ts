/**
 * 交互规则执行引擎
 *
 * 在运行时消费 InteractionRule[] 配置，
 * 将触发器（onTap / onProximityEnter / onCollect 等）
 * 连接到对应的动作（playAnimation / playSound / showMessage 等）。
 *
 * 使用方式：
 *   const runner = new InteractionRunner(rules, {
 *     playAnimation: (clip) => controller.play(clip),
 *     showMessage: (text) => showToast(text),
 *     // ...
 *   })
 *   runner.connect(scene, camera, container)
 */
import type { InteractionRule } from '../types/config'

export type ActionHandlers = {
  playAnimation: (params: Record<string, any>) => void
  playSound: (params: Record<string, any>) => void
  showMessage: (params: Record<string, any>) => void
  addScore: (params: Record<string, any>) => void
  showEffect: (params: Record<string, any>) => void
  link: (params: Record<string, any>) => void
  triggerVibrate: (params: Record<string, any>) => void
  spawnItem: (params: Record<string, any>) => void
  removeItem: (params: Record<string, any>) => void
  stopAnimation: (params: Record<string, any>) => void
}

export class InteractionRunner {
  private rules: InteractionRule[]
  private handlers: Partial<ActionHandlers>
  private _disposed = false

  /** 已触发的单次触发器（onTrackingFound / onTrackingLost 只触发一次） */
  private _firedOnce = new Set<string>()

  constructor(rules: InteractionRule[], handlers: Partial<ActionHandlers>) {
    this.rules = rules
    this.handlers = handlers
  }

  /** 手动触发一个事件 */
  fire(trigger: string, target?: string): void {
    if (this._disposed) return
    for (const rule of this.rules) {
      if (rule.trigger !== trigger) continue
      if (target && rule.target && rule.target !== target) continue
      this._execute(rule)
    }
  }

  /** 触发一次（只触发一次的事件：onTrackingFound / onTrackingLost） */
  fireOnce(trigger: string): void {
    if (this._disposed) return
    const key = trigger
    if (this._firedOnce.has(key)) return
    this._firedOnce.add(key)
    this.fire(trigger)
  }

  /** 设置记分器引用（onScoreReach 需要监听分数变化） */
  setScoreManager(sm: { score: number; onChange?: (cb: (score: number) => void) => void }): void {
    const scoreReachRules = this.rules.filter((r) => r.trigger === 'onScoreReach')
    if (scoreReachRules.length === 0) return

    const checkScore = (score: number) => {
      for (const rule of scoreReachRules) {
        const target = rule.params?.target ?? 100
        if (score >= target) {
          this._execute(rule)
        }
      }
    }

    if (sm.onChange) {
      sm.onChange(checkScore)
    } else {
      // 如果 ScoreManager 不支持 onChange，用代理
      const origOnChange = (sm as any).__onChange
      ;(sm as any).__onChange = (score: number) => {
        origOnChange?.(score)
        checkScore(score)
      }
    }
  }

  /** 设置定时器引用（onTimerTick / onTimerEnd 用） */
  setTimerManager(tm: { onTick?: (cb: (remaining: number) => void) => void; onEnd?: (cb: () => void) => void }): void {
    const tickRules = this.rules.filter((r) => r.trigger === 'onTimerTick')
    const endRules = this.rules.filter((r) => r.trigger === 'onTimerEnd')

    if (tickRules.length > 0 && tm.onTick) {
      tm.onTick((remaining) => {
        for (const rule of tickRules) this._execute(rule)
      })
    }

    if (endRules.length > 0 && tm.onEnd) {
      tm.onEnd(() => {
        for (const rule of endRules) this._execute(rule)
      })
    }
  }

  private _execute(rule: InteractionRule): void {
    const handler = this.handlers[rule.action]
    if (!handler) {
      console.warn(`[InteractionRunner] 未注册动作处理器: ${rule.action}`)
      return
    }
    handler(rule.params)
  }

  /** 清理 */
  dispose(): void {
    this._disposed = true
    this._firedOnce.clear()
    this.rules = []
    this.handlers = {}
  }

  get disposed(): boolean {
    return this._disposed
  }
}
