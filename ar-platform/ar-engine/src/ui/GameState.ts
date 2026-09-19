/**
 * GameState — Shared runtime state for HUD components
 *
 * This is the single source of truth that all HUD renderers read from.
 * The GameStateManager provides subscriptions so the main ARHUD class
 * can auto-update every component whenever state changes.
 */

export interface GameState {
  score: number
  timer: number
  combo: number
  comboMultiplier: number
  lives: number
  maxLives: number
  items: number
  message: string | null
  visitedPois: string[]
  currentPOI: string | null
  totalPois: number
  phase: 'playing' | 'paused' | 'completed' | 'failed'
  heading?: number
  distanceToPOI?: number
  poiDescription?: string
}

export type StateListener = (state: GameState) => void

export class GameStateManager {
  private _state: GameState
  private _listeners: Set<StateListener> = new Set()

  constructor(initial?: Partial<GameState>) {
    this._state = {
      score: 0,
      timer: 0,
      combo: 0,
      comboMultiplier: 1,
      lives: 3,
      maxLives: 3,
      items: 0,
      message: null,
      visitedPois: [],
      currentPOI: null,
      totalPois: 0,
      phase: 'playing',
      ...initial,
    }
  }

  /** Returns a frozen snapshot of the current state */
  get state(): GameState {
    return { ...this._state }
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: StateListener): () => void {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  /** Merge a partial update into the current state and notify listeners */
  update(patch: Partial<GameState>): void {
    Object.assign(this._state, patch)
    this._notify()
  }

  /** Reset state to defaults, optionally merging custom initial values */
  reset(initial?: Partial<GameState>): void {
    this._state = {
      score: 0,
      timer: 0,
      combo: 0,
      comboMultiplier: 1,
      lives: 3,
      maxLives: 3,
      items: 0,
      message: null,
      visitedPois: [],
      currentPOI: null,
      totalPois: 0,
      phase: 'playing',
      ...initial,
    }
    this._notify()
  }

  private _notify(): void {
    if (this._listeners.size === 0) return
    const snapshot = this.state
    for (const listener of this._listeners) {
      try {
        listener(snapshot)
      } catch (err) {
        console.warn('[GameStateManager] Listener error:', err)
      }
    }
  }
}
