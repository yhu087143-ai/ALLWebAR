import type { Component } from './Component'

export interface Transform {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

let entitySeq = 0

export class Entity {
  readonly id: string
  name: string
  parent: Entity | null = null
  readonly children: Entity[] = []
  readonly components = new Map<Function, Component>()
  transform: Transform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  }
  /** 编辑器/导出用原始节点属性 */
  props: Record<string, unknown> = {}
  /** 运行时附加的任意数据 */
  userData: Record<string, unknown> = {}
  active = true
  private alive = true
  /** 是否已被 World 引导过；运行期对已引导实体 addComponent 时会立即补齐 onAwake/onStart */
  awake = false

  constructor(name = 'Entity') {
    entitySeq += 1
    this.id = `ent_${entitySeq}`
    this.name = name
  }

  addComponent<T extends Component>(type: new () => T): T {
    const existing = this.getComponent(type)
    if (existing) return existing
    const comp = new type()
    comp.entity = this
    this.components.set(type, comp)
    // 实体已在运行中（World 已 bootstrap）：新挂的组件立刻收到 onAwake/onStart，
    // 否则它们永远等不到 World.start()，onStart 里的初始化（如记录基准位置）会丢失
    if (this.awake) {
      comp.onAwake?.()
      comp.onStart?.()
    }
    return comp
  }

  getComponent<T extends Component>(type: new () => T): T | undefined {
    return this.components.get(type) as T | undefined
  }

  removeComponent<T extends Component>(type: new () => T): void {
    const comp = this.components.get(type)
    if (!comp) return
    comp.onDestroy?.()
    this.components.delete(type)
  }

  addChild(child: Entity): Entity {
    if (child.parent) child.parent.removeChild(child)
    child.parent = this
    this.children.push(child)
    return child
  }

  removeChild(child: Entity): void {
    const index = this.children.indexOf(child)
    if (index >= 0) this.children.splice(index, 1)
    child.parent = null
  }

  get isAlive(): boolean {
    return this.alive
  }

  destroy(): void {
    if (!this.alive) return
    for (const comp of this.components.values()) comp.onDestroy?.()
    this.components.clear()
    for (const child of [...this.children]) child.destroy()
    this.children.length = 0
    if (this.parent) this.parent.removeChild(this)
    this.alive = false
  }

  /** 复制一棵实体数据树（组件不会浅拷贝，需要单独处理） */
  clone(): Entity {
    const copy = new Entity(this.name)
    copy.transform = {
      position: [...this.transform.position],
      rotation: [...this.transform.rotation],
      scale: [...this.transform.scale],
    }
    copy.props = JSON.parse(JSON.stringify(this.props ?? {})) as Record<string, unknown>
    copy.userData = { ...this.userData }
    for (const child of this.children) copy.addChild(child.clone())
    return copy
  }

  find(name: string): Entity | null {
    if (this.name === name) return this
    for (const child of this.children) {
      const hit = child.find(name)
      if (hit) return hit
    }
    return null
  }

  getComponentsInChildren<T extends Component>(type: new () => T): T[] {
    const out: T[] = []
    const walk = (entity: Entity) => {
      const c = entity.getComponent(type)
      if (c) out.push(c)
      for (const child of entity.children) walk(child)
    }
    walk(this)
    return out
  }
}
