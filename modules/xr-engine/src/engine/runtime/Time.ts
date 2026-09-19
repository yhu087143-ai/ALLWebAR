/**
 * 时间管理：支持时间缩放、暂停。
 */
export class Time {
  /** 原始帧间隔（秒） */
  rawDelta = 0
  /** 经过时间缩放后的帧间隔，传给逻辑 */
  delta = 0
  /** 累计游戏时间（秒） */
  elapsed = 0
  /** 时间缩放，0 = 暂停 */
  scale = 1

  tick(rawDelta: number): number {
    this.rawDelta = rawDelta
    this.delta = rawDelta * this.scale
    this.elapsed += this.delta
    return this.delta
  }

  reset(): void {
    this.rawDelta = 0
    this.delta = 0
    this.elapsed = 0
    this.scale = 1
  }
}
