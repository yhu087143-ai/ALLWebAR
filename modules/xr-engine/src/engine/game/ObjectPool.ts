/**
 * 通用对象池：子弹、豌豆、僵尸、特效等高频创建/销毁的实体都应走它。
 * Web 端和未来的微信小程序运行时共用同一套接口。
 */
export class ObjectPool<T> {
  private available: T[] = []

  constructor(
    private readonly factory: () => T,
    private readonly reset?: (item: T) => void
  ) {}

  get(): T {
    const item = this.available.pop()
    if (item) return item
    return this.factory()
  }

  release(item: T): void {
    // 防止同一对象被 release 两次：否则它会在 available 里出现两份，被 get 出两次
    if (this.available.includes(item)) return
    this.reset?.(item)
    this.available.push(item)
  }

  get size(): number {
    return this.available.length
  }

  clear(): void {
    this.available.length = 0
  }
}
