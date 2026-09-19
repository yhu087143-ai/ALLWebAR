import { nanoid } from 'nanoid'
import type { EventBus } from './EventBus'
import type { EngineEvents, GraphChangeReason } from './events'
import { NODE_TYPE_LABEL, createNode, remapGeometryParams } from './factory'
import type { GraphData, NodeProps, NodeType, SceneNode, Transform } from './types'

/** uniqueName 的编号后缀匹配，模块级常量避免每次 create 在循环里反复 new RegExp */
const NAME_INDEX_RE = /^(.*?)\s(\d+)$/

/**
 * 场景图：引擎的权威数据源。
 *
 * 存储结构为扁平表 + 根序列表：
 *   nodes   —— id -> 节点，O(1) 查找
 *   rootIds —— 顶层节点顺序
 *   children —— 每个节点自己维护子节点顺序
 *
 * 所有写操作都会 bump revision 并通过 EventBus 广播，
 * UI 层（zustand）订阅后生成新快照触发 React 重渲染。
 */
export class SceneGraph {
  nodes: Record<string, SceneNode> = {}
  rootIds: string[] = []
  /** 任何变更都会递增 */
  revision = 0
  /**
   * 只有「结构变化」才递增（增删 / 改变层级 / 重排 / 载入）。
   * UI 层据此决定是否需要重建节点树 —— 单纯改 transform 不该让整棵树重渲染。
   */
  structureVersion = 0

  constructor(private readonly bus: EventBus<EngineEvents>) {}

  // ---------------------------------------------------------------- 查询

  get(id: string): SceneNode | undefined {
    return this.nodes[id]
  }

  must(id: string): SceneNode {
    const node = this.nodes[id]
    if (!node) throw new Error(`[SceneGraph] 节点不存在: ${id}`)
    return node
  }

  getChildren(id: string): SceneNode[] {
    const node = this.nodes[id]
    if (!node) return []
    return node.children.map((cid) => this.nodes[cid]).filter(Boolean)
  }

  /** 自顶向下遍历，cb 返回 false 可跳过该节点的子树 */
  traverse(cb: (node: SceneNode, depth: number) => void | false, startId?: string): void {
    const walk = (id: string, depth: number) => {
      const node = this.nodes[id]
      if (!node) return
      const result = cb(node, depth)
      if (result === false) return
      for (const childId of node.children) walk(childId, depth + 1)
    }

    if (startId) walk(startId, 0)
    else for (const id of this.rootIds) walk(id, 0)
  }

  /** 返回自身之外的所有后代 id */
  getDescendants(id: string): string[] {
    const out: string[] = []
    const stack = [...(this.nodes[id]?.children ?? [])]
    while (stack.length) {
      const cur = stack.pop()!
      out.push(cur)
      stack.push(...(this.nodes[cur]?.children ?? []))
    }
    return out
  }

  /** 从根到该节点的祖先链（不含自身） */
  getAncestors(id: string): string[] {
    const out: string[] = []
    let cur = this.nodes[id]?.parentId
    while (cur) {
      out.unshift(cur)
      cur = this.nodes[cur]?.parentId
    }
    return out
  }

  /** 拖放校验：不能把节点挂到自己的子孙下 */
  canReparent(id: string, newParentId: string | null): boolean {
    if (id === newParentId) return false
    if (!newParentId) return true
    if (!this.nodes[newParentId]) return false
    return !this.getDescendants(id).includes(newParentId)
  }

  // ---------------------------------------------------------------- 写入

  create(type: NodeType, parentId: string | null = null): SceneNode {
    const node = createNode(type)
    node.name = this.uniqueName(type)
    this.nodes[node.id] = node

    if (parentId && this.nodes[parentId]) {
      node.parentId = parentId
      this.nodes[parentId].children.push(node.id)
    } else {
      this.rootIds.push(node.id)
    }

    this.bump('create')
    this.bus.emit('graph:nodeAdded', { nodeId: node.id })
    return node
  }

  remove(id: string): void {
    const node = this.nodes[id]
    if (!node) return

    const descendantIds = this.getDescendants(id)
    this.detachFromParent(id)

    delete this.nodes[id]
    for (const did of descendantIds) delete this.nodes[did]

    this.bump('delete')
    this.bus.emit('graph:nodeRemoved', { nodeId: id, descendantIds })
  }

  duplicate(id: string): SceneNode | null {
    const source = this.nodes[id]
    if (!source) return null

    const clone = (srcId: string, parentId: string | null): SceneNode | null => {
      const src = this.nodes[srcId]
      if (!src) return null
      const copy: SceneNode = {
        ...src,
        id: nanoid(10),
        parentId,
        children: [],
        transform: {
          position: [...src.transform.position],
          rotation: [...src.transform.rotation],
          scale: [...src.transform.scale],
        } as Transform,
        props: structuredClone(src.props) as NodeProps,
      }
      this.nodes[copy.id] = copy
      copy.children = src.children
        .map((cid) => clone(cid, copy.id))
        .filter((n): n is SceneNode => n !== null)
        .map((n) => n.id)
      return copy
    }

    const root = clone(id, source.parentId)
    if (!root) return null
    root.name = `${source.name} 副本`
    if (source.parentId) this.nodes[source.parentId].children.push(root.id)
    else this.rootIds.push(root.id)

    this.bump('duplicate')
    return root
  }

  reparent(id: string, newParentId: string | null, index = -1): boolean {
    if (!this.canReparent(id, newParentId)) return false
    const node = this.nodes[id]
    if (!node) return false

    this.detachFromParent(id)

    if (newParentId) {
      const parent = this.nodes[newParentId]
      node.parentId = newParentId
      const at = index < 0 ? parent.children.length : Math.min(index, parent.children.length)
      parent.children.splice(at, 0, id)
    } else {
      node.parentId = null
      const at = index < 0 ? this.rootIds.length : Math.min(index, this.rootIds.length)
      this.rootIds.splice(at, 0, id)
    }

    this.bump('reparent')
    return true
  }

  /** 同级排序移动，delta 为 -1（上移）或 +1（下移） */
  reorder(id: string, delta: number): boolean {
    const node = this.nodes[id]
    if (!node) return false
    const siblings = node.parentId ? this.nodes[node.parentId]?.children : this.rootIds
    if (!siblings) return false

    const from = siblings.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= siblings.length) return false

    siblings.splice(from, 1)
    siblings.splice(to, 0, id)
    this.bump('reorder')
    return true
  }

  update(id: string, patch: Partial<Omit<SceneNode, 'id' | 'children' | 'parentId'>>): void {
    const node = this.nodes[id]
    if (!node) return
    Object.assign(node, patch)
    // node:updated 必须先于 bump：Engine 的撤销合并靠它拿到本次更新的 nodeId，
    // 先发 bump 会让 capture 读到上一次更新的节点，把不同节点的修改错误合并
    this.bus.emit('node:updated', { nodeId: id, keys: Object.keys(patch) })
    this.bump('update')
  }

  setTransform(id: string, patch: Partial<Transform>): void {
    const node = this.nodes[id]
    if (!node) return
    node.transform = { ...node.transform, ...patch }
    this.bus.emit('node:updated', { nodeId: id, keys: ['transform'] })
    this.bump('update')
  }

  setProps(id: string, patch: Record<string, unknown>): void {
    const node = this.nodes[id]
    if (!node) return
    node.props = { ...node.props, ...patch } as NodeProps
    this.bus.emit('node:updated', { nodeId: id, keys: ['props'] })
    this.bump('update')
  }

  /** 切换几何体类型时同步重置参数表 */
  setGeometry(id: string, geometry: Parameters<typeof remapGeometryParams>[0]): void {
    const node = this.nodes[id]
    if (!node || node.props.kind !== 'mesh') return
    node.props = {
      ...node.props,
      geometry,
      geometryParams: remapGeometryParams(geometry, node.props.geometryParams),
    }
    this.bus.emit('node:updated', { nodeId: id, keys: ['props'] })
    this.bump('update')
  }

  // ---------------------------------------------------------------- 序列化

  toJSON(): GraphData {
    return {
      nodes: structuredClone(this.nodes),
      rootIds: [...this.rootIds],
    }
  }

  load(data: GraphData): void {
    this.nodes = structuredClone(data.nodes)
    this.rootIds = [...data.rootIds]
    this.bump('load')
  }

  reset(): void {
    this.nodes = {}
    this.rootIds = []
    this.bump('reset')
  }

  // ---------------------------------------------------------------- 内部

  private detachFromParent(id: string): void {
    const node = this.nodes[id]
    if (!node) return
    if (node.parentId) {
      const parent = this.nodes[node.parentId]
      if (parent) parent.children = parent.children.filter((cid) => cid !== id)
    } else {
      this.rootIds = this.rootIds.filter((rid) => rid !== id)
    }
    node.parentId = null
  }

  private uniqueName(type: NodeType): string {
    const base = NODE_TYPE_LABEL[type]
    let max = 0
    for (const node of Object.values(this.nodes)) {
      if (node.type !== type) continue
      const match = NAME_INDEX_RE.exec(node.name)
      if (match && match[1] === base) max = Math.max(max, Number(match[2]))
    }
    return `${base} ${max + 1}`
  }

  private bump(reason: GraphChangeReason): void {
    this.revision += 1
    if (reason !== 'update') this.structureVersion += 1
    this.bus.emit('graph:changed', { revision: this.revision, reason })
  }
}
