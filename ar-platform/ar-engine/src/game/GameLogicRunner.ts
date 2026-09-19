/**
 * AI 游戏逻辑规则执行器 — 统一版
 *
 * 监听 GameEngine 状态变化，当条件匹配时自动执行对应动作。
 * 支持预设条件类型 + 自由表达式求值 + 自定义动作。
 *
 * 条件类型:
 *   score_reach, timer_remaining, items_collected, combo_count
 *   proximity_enter, proximity_exit, all_pois_visited
 *   expression — 用户编写自由表达式字符串
 *   custom — 用户自定义 evaluate 函数
 *
 * 动作通过 CustomEvent 桥接到 InteractionRunner 或外部 UI。
 */

import { GameEngine } from './GameEngine'
import type { GuideRoute, UnifiedRule, UnifiedCondition, UnifiedAction } from '../types/config'
import type { INavigationSystem } from '../guide/NavigationSystem'

/** 运行时上下文 — 表达式求值可用的变量 */
export interface RuntimeContext {
  score: number
  timer: number
  items: number
  combo: number
  multiplier: number
  elapsed: number
  visitedPois: number
  totalPois: number
}

export class GameLogicRunner {
  private _engine: GameEngine
  private _rules: UnifiedRule[]
  private _unsubscribers: (() => void)[] = []
  private _disposed = false
  /** Tracks which rules have already fired, so a condition that stays true doesn't re-trigger */
  private _firedRules = new Set<string>()
  /** Last fired timestamp for cooldown support */
  private _lastFiredAt = new Map<string, number>()
  /** Navigation system (optional — needed for POI-related conditions) */
  private _navigation: INavigationSystem | null = null
  /** Guide route reference for proximity conditions */
  private _guideRoute: GuideRoute | null = null

  constructor(engine: GameEngine, rules: UnifiedRule[]) {
    this._engine = engine
    this._rules = rules
  }

  /** Attach optional navigation system for POI-based conditions */
  setNavigationSystem(nav: INavigationSystem | null): void {
    this._navigation = nav
  }

  /** Build runtime context for expression evaluation */
  private _getContext(): RuntimeContext {
    const scoreMgr = this._engine.scoreManager
    const timerMgr = this._engine.timerManager
    const collectMgr = this._engine.collectManager

    return {
      score: scoreMgr?.score ?? 0,
      timer: timerMgr?.remaining ?? 0,
      items: collectMgr?.collected.length ?? 0,
      combo: scoreMgr?.combo().count ?? 0,
      multiplier: scoreMgr?.combo().multiplier ?? 1,
      elapsed: timerMgr?.elapsed ?? 0,
      visitedPois: this._navigation?.progress.visited ?? 0,
      totalPois: this._navigation?.progress.total ?? 0,
    }
  }

  /** Check condition and fire action with dedup + cooldown */
  private _checkAndFire(rule: UnifiedRule, conditionMet: boolean): void {
    if (!rule.enabled) return

    if (conditionMet && !this._firedRules.has(rule.id)) {
      // Cooldown check
      if (rule.cooldown && rule.cooldown > 0) {
        const last = this._lastFiredAt.get(rule.id) ?? 0
        if (Date.now() - last < rule.cooldown) return
      }
      this._firedRules.add(rule.id)
      this._lastFiredAt.set(rule.id, Date.now())
      this._executeAction(rule.action)
    } else if (!conditionMet) {
      // Condition no longer met — allow re-trigger on next true transition
      this._firedRules.delete(rule.id)
    }
  }

  /** Start all rule listeners */
  start(): void {
    if (this._disposed) return
    this._firedRules.clear()
    for (const rule of this._rules) {
      this._subscribeRule(rule)
    }
    console.log(`[GameLogicRunner] 已启动 ${this._rules.length} 条规则`)
  }

  private _subscribeRule(rule: UnifiedRule): void {
    const cond = rule.condition

    switch (cond.type) {
      case 'score_reach': {
        const threshold = cond.value
        const unsub = this._engine.on('scoreUpdate', (payload) => {
          this._checkAndFire(rule, payload.score >= threshold)
        })
        this._unsubscribers.push(unsub)
        break
      }

      case 'timer_remaining': {
        const threshold = cond.value
        const operator = cond.operator
        const unsub = this._engine.on('timerTick', (payload) => {
          const matched = operator === 'less_than'
            ? payload.remaining <= threshold
            : payload.remaining >= threshold
          this._checkAndFire(rule, matched)
        })
        this._unsubscribers.push(unsub)
        break
      }

      case 'items_collected': {
        const threshold = cond.value
        const operator = cond.operator
        const unsub = this._engine.on('itemCollected', () => {
          const count = this._engine.collectManager?.collected.length ?? 0
          const matched = operator === 'at_least'
            ? count >= threshold
            : count === threshold
          this._checkAndFire(rule, matched)
        })
        this._unsubscribers.push(unsub)
        break
      }

      case 'combo_count': {
        const threshold = cond.value
        const unsub = this._engine.on('scoreUpdate', (payload) => {
          this._checkAndFire(rule, payload.combo.count >= threshold)
        })
        this._unsubscribers.push(unsub)
        break
      }

      // ===== Phase 3 — New condition types =====

      case 'proximity_enter': {
        // Fires when user enters a specific POI's trigger radius
        const poiId = cond.poiId
        const unsubNav = this._navigation
          ? this._navigation.on('poiEnter', (poi) => {
              this._checkAndFire(rule, poi.id === poiId)
            })
          : null
        if (unsubNav) this._unsubscribers.push(unsubNav)
        break
      }

      case 'proximity_exit': {
        const poiId = cond.poiId
        const unsubNav = this._navigation
          ? this._navigation.on('poiExit', (poi) => {
              this._checkAndFire(rule, poi.id === poiId)
            })
          : null
        if (unsubNav) this._unsubscribers.push(unsubNav)
        break
      }

      case 'all_pois_visited': {
        // Check after every poiEnter
        const unsubNav = this._navigation
          ? this._navigation.on('poiEnter', () => {
              const visited = this._navigation!.progress.visited
              const total = this._navigation!.progress.total
              this._checkAndFire(rule, visited >= total)
            })
          : null
        if (unsubNav) this._unsubscribers.push(unsubNav)
        break
      }

      case 'expression': {
        // Evaluate the expression string on every score/timer/collect update
        const evalOnScore = this._engine.on('scoreUpdate', () => {
          this._checkAndFire(rule, this._evaluateExpression(cond.expr))
        })
        const evalOnTimer = this._engine.on('timerTick', () => {
          this._checkAndFire(rule, this._evaluateExpression(cond.expr))
        })
        const evalOnCollect = this._engine.on('itemCollected', () => {
          this._checkAndFire(rule, this._evaluateExpression(cond.expr))
        })
        this._unsubscribers.push(evalOnScore, evalOnTimer, evalOnCollect)
        break
      }

      case 'custom': {
        // Evaluate custom JS string on every state change
        const evalScore = this._engine.on('scoreUpdate', () => {
          this._checkAndFire(rule, this._evaluateExpression(cond.evaluate))
        })
        const evalTimer = this._engine.on('timerTick', () => {
          this._checkAndFire(rule, this._evaluateExpression(cond.evaluate))
        })
        const evalCollect = this._engine.on('itemCollected', () => {
          this._checkAndFire(rule, this._evaluateExpression(cond.evaluate))
        })
        this._unsubscribers.push(evalScore, evalTimer, evalCollect)
        break
      }
    }
  }

  /**
   * Safe expression evaluation.
   * Uses a restricted Function constructor — only ctx variables are available.
   *
   * Available variables:
   *   score, timer, items, combo, multiplier, elapsed, visitedPois, totalPois
   *
   * Examples:
   *   "score > 1000"
   *   "score > 500 && combo >= 5"
   *   "items >= 3 || timer < 10"
   *   "visitedPois == totalPois"
   */
  private _evaluateExpression(expr: string): boolean {
    if (!expr || !expr.trim()) return false
    const ctx = this._getContext()
    try {
      const fn = new Function(
        'score', 'timer', 'items', 'combo', 'multiplier',
        'elapsed', 'visitedPois', 'totalPois',
        `"use strict"; return Boolean(${expr});`,
      )
      return fn(
        ctx.score, ctx.timer, ctx.items, ctx.combo, ctx.multiplier,
        ctx.elapsed, ctx.visitedPois, ctx.totalPois,
      )
    } catch (err) {
      console.warn(`[GameLogicRunner] Expression evaluation error: "${expr}"`, err)
      return false
    }
  }

  private _executeAction(action: UnifiedAction): void {
    if (this._disposed) return

    switch (action.type) {
      case 'show_message':
        this._dispatchEvent('game:showMessage', { text: action.text, duration: action.duration ?? 2500 })
        break

      case 'add_score':
        console.log(`[GameLogic] Add score +${action.value}`)
        this._dispatchEvent('game:addScore', { value: action.value })
        break

      case 'spawn_item':
        console.log(`[GameLogic] Spawn bonus item${action.count ? ` x${action.count}` : ''}`)
        this._dispatchEvent('game:spawnBonus', {
          modelUrl: action.modelUrl,
          count: action.count ?? 1,
          position: action.position,
        })
        break

      case 'remove_all_items':
        console.log('[GameLogic] Remove all items')
        this._dispatchEvent('game:removeAllItems', {})
        break

      case 'speed_boost':
        console.log(`[GameLogic] Speed boost ${action.multiplier}x for ${action.duration}s`)
        this._dispatchEvent('game:speedBoost', {
          multiplier: action.multiplier,
          duration: action.duration,
        })
        break

      case 'slow_down':
        console.log(`[GameLogic] Slow down ${action.multiplier}x for ${action.duration}s`)
        this._dispatchEvent('game:slowDown', {
          multiplier: action.multiplier,
          duration: action.duration,
        })
        break

      case 'double_score':
        console.log(`[GameLogic] Double score for ${action.duration}s`)
        this._dispatchEvent('game:doubleScore', { duration: action.duration })
        break

      case 'play_effect':
        console.log(`[GameLogic] Play effect: ${action.effect}`)
        this._dispatchEvent('game:playEffect', { effect: action.effect })
        break

      case 'play_audio':
        console.log(`[GameLogic] Play audio: ${action.url}`)
        this._dispatchEvent('game:playAudio', { url: action.url, volume: action.volume ?? 1 })
        break

      case 'show_model':
        console.log(`[GameLogic] Show model: ${action.url}`)
        this._dispatchEvent('game:showModel', { url: action.url, position: action.position })
        break

      case 'link':
        console.log(`[GameLogic] Open link: ${action.url}`)
        this._dispatchEvent('game:openLink', { url: action.url })
        break

      case 'trigger_event':
        console.log(`[GameLogic] Trigger event: ${action.eventName}`)
        this._dispatchEvent('game:triggerEvent', { eventName: action.eventName })
        break

      case 'teleport_to_poi':
        console.log(`[GameLogic] Teleport to POI: ${action.poiId}`)
        this._dispatchEvent('game:teleportToPOI', { poiId: action.poiId })
        break

      case 'restart':
        console.log('[GameLogic] Restart game')
        this._dispatchEvent('game:restart', {})
        break

      case 'end_game':
        console.log('[GameLogic] End game')
        this._dispatchEvent('game:endGame', {})
        break

      case 'set_variable':
        console.log(`[GameLogic] Set variable: ${action.key} =`, action.value)
        this._dispatchEvent('game:setVariable', { key: action.key, value: action.value })
        break

      case 'custom':
        console.log(`[GameLogic] Custom action: ${action.actionId}`, action.params)
        this._dispatchEvent('game:customAction', { actionId: action.actionId, params: action.params })
        break
    }
  }

  private _dispatchEvent(name: string, detail: unknown): void {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }))
    } catch {
      // SSR guard
    }
  }

  /** Stop all listeners and clean up */
  stop(): void {
    this._disposed = true
    this._firedRules.clear()
    for (const unsub of this._unsubscribers) unsub()
    this._unsubscribers = []
  }

  get disposed(): boolean {
    return this._disposed
  }

  /** Get currently tracked rules */
  get rules(): UnifiedRule[] {
    return this._rules
  }
}
