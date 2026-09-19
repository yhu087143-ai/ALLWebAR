import { Component } from '@/engine/runtime/Component'
import type { Entity } from '@/engine/runtime/Entity'
import type { World } from '@/engine/runtime/World'
import type { InputManager } from '@/engine/runtime/InputManager'

export interface DataComponentConfig {
  type: string
  [key: string]: unknown
}

export function instantiateDataNode(world: World, data: Record<string, unknown>, parent: Entity | null): Entity {
  const entity = world.createEntity(String(data.name ?? 'Node'), parent)
  entity.props = (data.props ?? {}) as Record<string, unknown>
  const transform = (data.transform ?? {}) as { position?: [number,number,number]; rotation?: [number,number,number]; scale?: [number,number,number] }
  entity.transform = {
    position: [...(transform.position ?? [0,0,0])],
    rotation: [...(transform.rotation ?? [0,0,0])],
    scale: [...(transform.scale ?? [1,1,1])],
  }
  if (data.id) entity.userData.sourceId = String(data.id)
  const children = (data.children ?? []) as Record<string, unknown>[]
  for (const child of children) instantiateDataNode(world, child, entity)
  return entity
}

function rootOf(entity: Entity): Entity {
  let e = entity
  while (e.parent) e = e.parent
  return e
}

function getWorld(entity: Entity): World | undefined {
  return rootOf(entity).userData.world as World | undefined
}

function getInput(entity: Entity): InputManager | undefined {
  return rootOf(entity).userData.input as InputManager | undefined
}

/** 累加父链位移得到世界坐标（dataDriven 场景一般没有旋转/缩放的父级） */
function worldPositionOf(entity: Entity): [number, number, number] {
  let x = 0
  let y = 0
  let z = 0
  let e: Entity | null = entity
  while (e) {
    x += e.transform.position[0]
    y += e.transform.position[1]
    z += e.transform.position[2]
    e = e.parent
  }
  return [x, y, z]
}

/** 给生成物副本追加 TTL 组件，seconds<=0 表示不限制 */
function appendTtl(copy: Record<string, unknown>, seconds: number): void {
  if (!(seconds > 0)) return
  const props = (copy.props ?? {}) as Record<string, unknown>
  const comps = Array.isArray(props.components) ? (props.components as unknown[]) : []
  props.components = [...comps, { type: 'ttl', seconds }]
  copy.props = props
}

export function collectEntities(root: Entity): Entity[] {
  const out: Entity[] = [root]
  const walk = (e: Entity): void => {
    for (const child of e.children) {
      out.push(child)
      walk(child)
    }
  }
  walk(root)
  return out
}

/**
 * 引擎内置的数据驱动行为解释器。
 * 场景只需要写 JSON 数据（props.components），不需要为每个游戏手写组件类。
 * 把本组件挂在任意游戏场景根节点上即可。
 */
export class DataDrivenBehavior extends Component {
  onUpdate(dt: number): void {
    const root = rootOf(this.entity)
    const world = getWorld(this.entity)
    const input = getInput(this.entity)

    root.userData.time = Number(root.userData.time ?? 0) + dt
    root.userData.elapsed = Number(root.userData.elapsed ?? 0) + dt

    const all = collectEntities(root)
    for (const e of all) {
      // 同帧被销毁的实体（碰撞/TTL）不再处理
      if (!e.isAlive) continue
      this.process(e, root, world, input, dt)
    }
  }

  private process(e: Entity, root: Entity, world: World | undefined, input: InputManager | undefined, dt: number): void {
    const comps = ((e.props as { components?: DataComponentConfig[] }).components ?? []) as DataComponentConfig[]
    const time = Number(root.userData.time ?? 0)

    for (const c of comps) {
      if (!c || !c.type) continue

      if (c.type === 'spin') {
        e.transform.rotation[1] += Number(c.speed ?? 1) * dt
      } else if (c.type === 'bob') {
        if (e.userData.baseY == null) e.userData.baseY = e.transform.position[1]
        e.transform.position[1] = Number(e.userData.baseY) + Math.sin(Number(root.userData.elapsed ?? 0) * Number(c.speed ?? 2)) * 0.3
      } else if (c.type === 'move') {
        const v = (c.velocity ?? [0,0,0]) as [number,number,number]
        e.transform.position[0] += v[0] * dt
        e.transform.position[1] += v[1] * dt
        e.transform.position[2] += v[2] * dt
      } else if (c.type === 'ttl') {
        // 生存时间：子弹/太阳等生成物必须有回收出口，否则实体只增不减
        const remain = Number(e.userData.ttlRemain ?? c.seconds ?? 8) - dt
        e.userData.ttlRemain = remain
        if (remain <= 0) {
          if (world) world.destroy(e)
          return
        }
      } else if (c.type === 'moveTo') {
        const target = (c.target ?? [0,0,0]) as [number,number,number]
        const speed = Number(c.speed ?? 1)
        const dx = target[0] - e.transform.position[0]
        const dy = target[1] - e.transform.position[1]
        const dz = target[2] - e.transform.position[2]
        const len = Math.sqrt(dx*dx + dy*dy + dz*dz)
        if (len > 0.05) {
          const k = Math.min(1, speed * dt / len)
          e.transform.position[0] += dx * k
          e.transform.position[1] += dy * k
          e.transform.position[2] += dz * k
        }
      } else if (c.type === 'spawn' || c.type === 'spawner') {
        const key = `spawn_${e.id}`
        const last = Number(root.userData[key] ?? 0)
        if (time - last >= Number(c.interval ?? 3)) {
          root.userData[key] = time
          if (c.prefab && world) {
            // 与其它分支一致深拷贝 prefab，避免多个实例共享 props 互相污染
            const copy = JSON.parse(JSON.stringify(c.prefab)) as Record<string, unknown>
            appendTtl(copy, Number(c.ttl ?? 12))
            instantiateDataNode(world, copy, e.parent ?? root)
          }
        }
      } else if (c.type === 'sunSpawner') {
        const key = `sun_${e.id}`
        const last = Number(root.userData[key] ?? 0)
        if (time - last >= Number(c.interval ?? 4)) {
          root.userData[key] = time
          if (world) {
            const prefab = (c.prefab ?? {
              id: `sun${Date.now()}`,
              name: '太阳',
              type: 'mesh',
              props: {
                kind: 'mesh', geometry: 'sphere', effect: 'energy',
                geometryParams: { radius: 0.35 },
                material: { color: '#ffe082' },
                components: [{ type: 'collectible', score: 10 }],
              },
              transform: { position: [0, 0.8, 0], rotation: [0,0,0], scale: [1,1,1] },
            }) as Record<string, unknown>
            const copy = JSON.parse(JSON.stringify(prefab)) as Record<string, unknown>
            copy.id = `sun${Date.now()}`
            const tr = (copy.transform ?? {}) as { position?: [number,number,number] }
            const range = Number(c.range ?? 4)
            tr.position = [(Math.random()*2-1)*range, 0.8, (Math.random()*2-1)*range]
            copy.transform = tr
            const props = (copy.props ?? {}) as Record<string, unknown>
            props.components = [...(Array.isArray(props.components) ? props.components : []), { type: 'collectible', score: 10 }]
            copy.props = props
            appendTtl(copy, Number(c.ttl ?? 15))
            instantiateDataNode(world, copy, e.parent ?? root)
          }
        }
      } else if (c.type === 'shooter') {
        const key = `shoot_${e.id}`
        const last = Number(root.userData[key] ?? 0)
        if (time - last >= Number(c.interval ?? 1.2)) {
          root.userData[key] = time
          if (world) {
            const prefab = (c.prefab ?? {
              id: `pea${Date.now()}`,
              name: '豌豆',
              type: 'mesh',
              props: {
                kind: 'mesh', geometry: 'sphere', geometryParams: { radius: 0.12 }, effect: 'energy',
                material: { color: '#aeea00' },
                components: [{ type: 'move', velocity: [3, 0, 0] }],
              },
              transform: { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] },
            }) as Record<string, unknown>
            const copy = JSON.parse(JSON.stringify(prefab)) as Record<string, unknown>
            copy.id = `pea${Date.now()}`
            const tr = (copy.transform ?? {}) as { position?: [number,number,number] }
            tr.position = [e.transform.position[0], e.transform.position[1] + 0.3, e.transform.position[2]]
            copy.transform = tr
            appendTtl(copy, Number(c.ttl ?? 6))
            instantiateDataNode(world, copy, e.parent ?? root)
          }
        }
      } else if (c.type === 'collision') {
        if (world) {
          const all = collectEntities(root)
          const peas = all.filter((x) => x.name.startsWith('豌豆'))
          const zombies = all.filter((x) => x.name.startsWith('僵尸'))
          for (const pea of peas) {
            for (const z of zombies) {
              const dx = pea.transform.position[0] - z.transform.position[0]
              const dz = pea.transform.position[2] - z.transform.position[2]
              if (Math.sqrt(dx*dx + dz*dz) < 0.85) {
                const score = Number(root.userData.score ?? 0) + 20
                root.userData.score = score
                const hud = root.userData.hud as ((s: Record<string, unknown>) => void) | undefined
                hud?.({ sun: score, message: '击杀僵尸 +20' })
                world.destroy(pea)
                world.destroy(z)
                return
              }
            }
          }
        }
      } else if (c.type === 'collectible') {
        if (input?.clicked && input.pointer) {
          const pointer = input.pointer
          const game = root.userData.game as {
            screenToGround?: (x: number, y: number) => { x: number; z: number } | null
          } | undefined
          const hit = game?.screenToGround?.(pointer.x, pointer.y) ?? null
          // 宿主没接 screenToGround 时按 tapPlace 的同一套约定映射到地面平面
          const point = hit ?? {
            x: (pointer.x - 0.5) * Number(c.width ?? 10),
            z: (pointer.y - 0.5) * Number(c.depth ?? 10),
          }
          const [wx, , wz] = worldPositionOf(e)
          const dx = wx - point.x
          const dz = wz - point.z
          const radius = Number(c.radius ?? 0.9)
          if (Math.sqrt(dx*dx + dz*dz) <= radius) {
            input.clicked = false
            const score = Number(root.userData.score ?? 0) + Number(c.score ?? 10)
            root.userData.score = score
            const hud = root.userData.hud as ((s: Record<string, unknown>) => void) | undefined
            hud?.({ sun: score, message: `收集 +${c.score ?? 10}` })
            if (world && e.parent) world.destroy(e)
            return
          }
          // 点不中的点击不吞掉，留给同帧的 tapPlace / tapGame 处理
        }
      } else if (c.type === 'tapPlace') {
        if (input?.clicked && world) {
          input.clicked = false
          const pointer = input.pointer ?? { x: 0.5, y: 0.5 }
          const game = root.userData.game as {
            screenToGround?: (x: number, y: number) => { x: number; z: number } | null
          } | undefined
          const hit = game?.screenToGround?.(pointer.x, pointer.y) ?? null
          const point = hit ?? {
            x: (pointer.x - 0.5) * Number(c.width ?? 10),
            z: (pointer.y - 0.5) * Number(c.depth ?? 10),
          }
          if (c.prefab) {
            const copy = JSON.parse(JSON.stringify(c.prefab)) as Record<string, unknown>
            copy.id = `place${Date.now()}`
            const tr = (copy.transform ?? {}) as { position?: [number,number,number] }
            tr.position = [point.x, Number(c.y ?? 0), point.z]
            copy.transform = tr
            instantiateDataNode(world, copy, e.parent ?? root)
            const hud = root.userData.hud as ((s: Record<string, unknown>) => void) | undefined
            hud?.({ message: '已放置' })
          }
        }
      } else if (c.type === 'dialogue') {
        const game = root.userData.game as { dialogue?: { start: (id: string) => void; next?: () => void } } | undefined
        if (game?.dialogue) {
          if (c.start) game.dialogue.start(String(c.start))
          else game.dialogue.next?.()
        }
      } else if (c.type === 'timeline') {
        const game = root.userData.game as { timeline?: { play: (data: unknown) => void } } | undefined
        if (game?.timeline && c.data) game.timeline.play(c.data)
      } else if (c.type === 'trigger') {
        const game = root.userData.game as { interactions?: { trigger: (id: string) => boolean } } | undefined
        if (game?.interactions && c.id) game.interactions.trigger(String(c.id))
      } else if (c.type === 'tapGame') {
        if (input?.clicked && world) {
          const balls = root.children.filter((ch) => ch.name.startsWith('能量球') || ch.name.startsWith('太阳'))
          if (balls.length) {
            const b = balls[0]
            const score = Number(root.userData.score ?? 0) + 10
            root.userData.score = score
            const hud = root.userData.hud as ((s: Record<string, unknown>) => void) | undefined
            hud?.({ sun: score, message: '击中 +10' })
            world.destroy(b)
          }
        }
      }
    }
  }
}
