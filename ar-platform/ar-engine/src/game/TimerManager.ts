export class TimerManager {
  private readonly _duration: number
  private _remaining: number
  private _elapsed = 0
  private _running = false
  private _finished = false
  private _intervalId: ReturnType<typeof setInterval> | null = null
  private _onTick: ((remaining: number) => void) | null = null
  private _startTime = 0
  private _pausedElapsed = 0

  constructor(duration: number) {
    if (duration <= 0) {
      throw new Error(`[TimerManager] duration must be positive, got ${duration}`)
    }
    this._duration = duration
    this._remaining = duration
  }

  start(onTick?: (remaining: number) => void): void {
    if (this._running) return

    this._onTick = onTick ?? null
    this._running = true
    this._finished = false
    this._startTime = Date.now()
    this._pausedElapsed = 0
    this._onTick?.(this._remaining)

    this._intervalId = setInterval(() => {
      if (!this._running) return

      this._elapsed = Math.floor((Date.now() - this._startTime) / 1000) + this._pausedElapsed
      this._remaining = Math.max(0, this._duration - this._elapsed)

      this._onTick?.(this._remaining)

      if (this._remaining <= 0) {
        this._finished = true
        this.stop()
      }
    }, 200)
  }

  pause(): void {
    if (!this._running) return
    this._running = false
    if (this._intervalId !== null) {
      clearInterval(this._intervalId)
      this._intervalId = null
    }
    this._pausedElapsed = Math.floor((Date.now() - this._startTime) / 1000) + this._pausedElapsed
  }

  resume(): void {
    if (this._running || this._finished) return
    this._startTime = Date.now()
    this._running = true

    this._intervalId = setInterval(() => {
      if (!this._running) return

      this._elapsed = Math.floor((Date.now() - this._startTime) / 1000) + this._pausedElapsed
      this._remaining = Math.max(0, this._duration - this._elapsed)

      this._onTick?.(this._remaining)

      if (this._remaining <= 0) {
        this._finished = true
        this.stop()
      }
    }, 200)
  }

  stop(): void {
    this._running = false
    if (this._intervalId !== null) {
      clearInterval(this._intervalId)
      this._intervalId = null
    }
  }

  get remaining(): number { return this._remaining }
  get elapsed(): number { return this._elapsed }
  get isRunning(): boolean { return this._running }
  get isFinished(): boolean { return this._finished }
}
