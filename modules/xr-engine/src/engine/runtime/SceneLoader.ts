import type { World } from './World'
import type { Entity } from './Entity'

/**
 * 读取“导出小程序场景”JSON，并把节点树实例化到游戏世界。
 * 之后可以通过 Entity 组件系统挂渲染/动画/脚本。
 */
export function loadSceneJson(world: World, json: Record<string, unknown>): void {
  world.clear()
  const nodes = Array.isArray(json.nodes) ? (json.nodes as Record<string, unknown>[]) : []

  const createEntity = (data: Record<string, unknown>, parent: Entity | null): Entity => {
    const entity = world.createEntity(String(data.name ?? 'Node'), parent)
    const transform = (data.transform ?? {}) as Record<string, unknown>
    // 拷贝数组而不是引用场景源数据，运行时改实体不能污染场景 JSON
    entity.transform = {
      position: [...((transform.position as [number, number, number] | undefined) ?? [0, 0, 0])],
      rotation: [...((transform.rotation as [number, number, number] | undefined) ?? [0, 0, 0])],
      scale: [...((transform.scale as [number, number, number] | undefined) ?? [1, 1, 1])],
    }
    if (data.props) entity.props = { ...(data.props as Record<string, unknown>) }
    if (data.script) entity.props.script = data.script
    for (const child of (data.children as Record<string, unknown>[] | undefined) ?? []) {
      createEntity(child, entity)
    }
    return entity
  }

  for (const node of nodes) createEntity(node, null)

  // 把资产 URL 放到 world 的 userData，供渲染层取用
  world.userData = {
    ...(world.userData ?? {}),
    assets: Array.isArray(json.assets) ? json.assets : [],
    environment: json.environment ?? null,
  }
}

