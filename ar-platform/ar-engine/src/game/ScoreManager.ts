export class ScoreManager {
  private _score = 0
  private _comboCount = 0
  private _lastAddTime = 0
  private readonly _comboWindowMs = 2000

  add(points: number): number {
    const now = performance.now()
    const withinWindow = this._lastAddTime > 0 && (now - this._lastAddTime) <= this._comboWindowMs

    if (withinWindow) {
      this._comboCount++
    } else {
      this._comboCount = 0
    }

    this._lastAddTime = now

    const multiplier = Math.min(1 + this._comboCount * 0.5, 5)
    const earned = Math.round(points * multiplier)
    this._score += earned

    return this._score
  }

  reset(): void {
    this._score = 0
    this._comboCount = 0
    this._lastAddTime = 0
  }

  combo(): { count: number; multiplier: number } {
    const multiplier = Math.min(1 + this._comboCount * 0.5, 5)
    return { count: this._comboCount, multiplier }
  }

  get score(): number { return this._score }
  get comboCount(): number { return this._comboCount }
}
