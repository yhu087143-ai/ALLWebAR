import { Entity } from './Entity'

/**
 * 游戏世界：管理实体树和生命周期。
 * 这是“游戏运行时”的核心，独立于 Three.js/React/微信。
 */
export class World {
  readonly entities = new Map<string, Entity>()
  readonly roots: Entity[] = []
  /** 场景级附加数据（资产列表、环境配置等） */
  userData: Record<string, unknown> = {}
  private started = false

  createEntity(name = 'Entity', parent: Entity | null = null): Entity {
    const entity = new Entity(name)
    this.attach(entity, parent)
    if (this.started) this.bootstrapEntity(entity)
    return entity
  }

  attach(entity: Entity, parent: Entity | null): void {
    this.entities.set(entity.id, entity)
    if (parent) parent.addChild(entity)
    else this.roots.push(entity)
  }

  destroy(entity: Entity): void {
    if (!entity.isAlive) return
    entity.destroy()
    this.entities.delete(entity.id)
    const index = this.roots.indexOf(entity)
    if (index >= 0) this.roots.splice(index, 1)
    // 深度删除子实体（子实体在 destroy 时已从父移除，但仍在 map 中）
    for (const [id, child] of this.entities) {
      if (!child.isAlive) this.entities.delete(id)
    }
  }

  start(): void {
    if (this.started) return
    this.started = true
    for (const root of this.roots) this.bootstrapEntity(root)
  }

  stop(): void {
    this.started = false
    for (const entity of this.entities.values()) {
      if (entity.isAlive) {
        for (const comp of entity.components.values()) comp.onDestroy?.()
        entity.components.clear()
      }
    }
    this.entities.clear()
    this.roots.length = 0
  }

  update(dt: number): void {
    for (const root of [...this.roots]) {
      this.updateEntity(root, dt)
    }
  }

  clear(): void {
    this.stop()
  }

  private bootstrapEntity(entity: Entity): void {
    entity.awake = true
    for (const comp of entity.components.values()) {
      comp.entity = entity
      comp.onAwake?.()
    }
    for (const comp of entity.components.values()) {
      comp.onStart?.()
    }
    for (const child of entity.children) this.bootstrapEntity(child)
  }

  private updateEntity(entity: Entity, dt: number): void {
    if (!entity.isAlive || !entity.active) return
    for (const comp of entity.components.values()) {
      if (comp.enabled) comp.onUpdate?.(dt)
    }
    for (const child of [...entity.children]) this.updateEntity(child, dt)
  }
}
