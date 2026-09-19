import type { Prefab, PrefabNode } from '@/engine/game/Prefab'
import { clonePrefabWithOverrides } from '@/engine/game/Prefab'
import type { Entity } from './Entity'
import type { World } from './World'

function createEntityFromNode(world: World, node: PrefabNode, parent: Entity | null): Entity {
  const entity = world.createEntity(node.name, parent)
  if (node.id) entity.userData.prefabNodeId = node.id
  if (node.transform) {
    // 拷贝数组而不是引用 prefab 源数据，运行时改实体不能污染 prefab
    entity.transform = {
      position: [...(node.transform.position ?? [0, 0, 0])],
      rotation: [...(node.transform.rotation ?? [0, 0, 0])],
      scale: [...(node.transform.scale ?? [1, 1, 1])],
    }
  }
  if (node.props) entity.props = { ...node.props }
  if (node.script) entity.props.script = node.script
  for (const child of node.children ?? []) {
    createEntityFromNode(world, child, entity)
  }
  return entity
}

/** 把预制体实例化到游戏世界，返回根实体。 */
export function instantiatePrefab(
  world: World,
  prefab: Prefab,
  parent: Entity | null = null,
  overrides: Record<string, Partial<PrefabNode>> = {}
): Entity {
  const effective = overrides && Object.keys(overrides).length > 0
    ? clonePrefabWithOverrides(prefab, overrides)
    : prefab
  return createEntityFromNode(world, effective.root, parent)
}
