/**
 * 游戏实体组件基类。
 *
 * 生命周期：
 *   create -> onAwake -> onStart -> onUpdate(dt)* -> onDestroy
 */
import type { Entity } from './Entity'

export abstract class Component {
  entity!: Entity
  enabled = true

  onAwake?(): void
  onStart?(): void
  onUpdate?(dt: number): void
  onDestroy?(): void
}
