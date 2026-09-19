import type { Prefab, PrefabNode } from './Prefab'
import type { Engine } from '@/engine/core/Engine'

/**
 * 内置特效预制体。
 * 这些 prefab 同时用于 Web 编辑器、GameRuntime 和微信 xr-frame 导出。
 */

export function createBlackHolePrefab(): Prefab {
  return {
    id: 'builtin-black-hole',
    name: '黑洞',
    tags: ['fx', 'black-hole', 'space'],
    root: {
      id: 'black-hole-root',
      name: '黑洞',
      type: 'mesh',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      props: {
        kind: 'mesh',
        geometry: 'sphere',
        geometryParams: { radius: 0.5, widthSegments: 48, heightSegments: 32 },
        effect: 'blackhole',
        material: {
          color: '#000000',
          metalness: 0,
          roughness: 0.2,
          emissive: '#000000',
          emissiveIntensity: 0,
        },
      },
    },
  }
}

export function createEnergyBallPrefab(): Prefab {
  return {
    id: 'builtin-energy-ball',
    name: '能量球',
    tags: ['fx', 'energy', 'ball'],
    root: {
      id: 'energy-root',
      name: '能量球',
      type: 'mesh',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      props: {
        kind: 'mesh',
        geometry: 'sphere',
        geometryParams: { radius: 0.42, widthSegments: 40, heightSegments: 28 },
        effect: 'energy',
        material: {
          color: '#00e5ff',
          metalness: 0.1,
          roughness: 0.15,
          emissive: '#00e5ff',
          emissiveIntensity: 2,
        },
      },
    },
  }
}

export function registerBuiltinEffectPrefabs(engine: Engine): void {
  engine.prefabs.register(createBlackHolePrefab())
  engine.prefabs.register(createEnergyBallPrefab())
}

/** 把 Prefab 实例化到编辑器场景图（供 UI 直接插入内置特效）。 */
export function addPrefabToSceneGraph(engine: Engine, prefab: Prefab): string {
  const addNode = (node: PrefabNode, parentId: string | null): string => {
    const created = engine.graph.create(node.type, parentId)
    engine.graph.update(created.id, { name: node.name })
    if (node.transform) engine.graph.setTransform(created.id, node.transform)
    if (node.props) engine.graph.setProps(created.id, node.props)
    for (const child of node.children ?? []) addNode(child, created.id)
    return created.id
  }
  return addNode(prefab.root, null)
}
