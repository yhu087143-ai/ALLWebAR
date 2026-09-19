/**
 * 预制体：一组可复用的节点/组件/脚本数据。
 * Web 编辑器与微信小程序运行时共用，是“豌豆射手”“僵尸”这类实体的标准形态。
 */
export interface PrefabNode {
  id?: string
  name: string
  type: 'model' | 'mesh' | 'group' | 'light' | 'particle'
  transform?: {
    position?: [number, number, number]
    rotation?: [number, number, number]
    scale?: [number, number, number]
  }
  children?: PrefabNode[]
  props?: Record<string, unknown>
  script?: string
}

export interface Prefab {
  id: string
  name: string
  root: PrefabNode
  /** AI/编辑器生成时的附加信息 */
  tags?: string[]
}

export function clonePrefabWithOverrides(
  prefab: Prefab,
  overrides: Record<string, Partial<PrefabNode>> = {}
): Prefab {
  const clone = (node: PrefabNode): PrefabNode => {
    const patch = overrides[node.name] ?? {}
    const next: PrefabNode = {
      ...node,
      ...patch,
      transform: {
        position: node.transform?.position ?? [0, 0, 0],
        rotation: node.transform?.rotation ?? [0, 0, 0],
        scale: node.transform?.scale ?? [1, 1, 1],
        ...(patch.transform ?? {}),
      },
      props: { ...(node.props ?? {}), ...(patch.props ?? {}) },
      children: (node.children ?? []).map(clone),
    }
    return next
  }
  return {
    ...prefab,
    root: clone(prefab.root),
  }
}

export class PrefabRegistry {
  private prefabs = new Map<string, Prefab>()

  register(prefab: Prefab): void {
    this.prefabs.set(prefab.id, prefab)
  }

  get(id: string): Prefab | undefined {
    return this.prefabs.get(id)
  }

  list(): Prefab[] {
    return [...this.prefabs.values()]
  }

  remove(id: string): void {
    this.prefabs.delete(id)
  }
}
