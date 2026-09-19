import type { Engine } from '@/engine/core/Engine'
import { Component } from '@/engine/runtime/Component'
import type { Entity } from '@/engine/runtime/Entity'
import type { InputManager } from '@/engine/runtime/InputManager'
import type { World } from '@/engine/runtime/World'
import { ObjectPool } from '@/engine/game/ObjectPool'

let demoEngine: Engine | null = null
let demoInput: InputManager | null = null
let demoRoot: Entity | null = null
let ballPool: ObjectPool<Entity> | null = null
let score = 0

const BALL_COLORS = ['#ff5252', '#64b5f6', '#ffd54f', '#81c784', '#ba68c8', '#4dd0e1']

class Spin extends Component {
  speed = 1.5
  onUpdate(dt: number): void {
    this.entity.transform.rotation[1] += this.speed * dt
  }
}

class Bob extends Component {
  private t = Math.random() * 10
  private baseY = 1
  onStart(): void {
    this.baseY = this.entity.transform.position[1]
  }
  onUpdate(dt: number): void {
    this.t += dt
    this.entity.transform.position[1] = this.baseY + Math.sin(this.t * 2) * 0.3
  }
}

class PopScale extends Component {
  private life = 0
  reset(): void {
    this.life = 0
    this.entity.transform.scale = [1, 1, 1]
  }
  onUpdate(dt: number): void {
    this.life += dt
    const k = Math.max(0.1, 1 - this.life * 0.8)
    this.entity.transform.scale = [k, k, k]
    if (this.life > 1.2) {
      if (ballPool && demoRoot) ballPool.release(this.entity)
      this.entity.active = false
    }
  }
}

class PlayerMove extends Component {
  speed = 5
  onUpdate(dt: number): void {
    if (!demoInput) return
    const p = this.entity.transform.position
    if (demoInput.keys.has('a') || demoInput.keys.has('arrowleft')) p[0] -= this.speed * dt
    if (demoInput.keys.has('d') || demoInput.keys.has('arrowright')) p[0] += this.speed * dt
    if (demoInput.keys.has('w') || demoInput.keys.has('arrowup')) p[2] -= this.speed * dt
    if (demoInput.keys.has('s') || demoInput.keys.has('arrowdown')) p[2] += this.speed * dt
  }
}

/** 点击/触摸交互：点能量球得分，点地面生成新球 */
class TapGame extends Component {
  onUpdate(): void {
    if (!demoEngine || !demoInput || !demoRoot) return
    if (!demoInput.clicked || !demoInput.pointer) return

    const nx = demoInput.pointer.x * 2 - 1
    const ny = -(demoInput.pointer.y * 2 - 1)
    const hits = demoEngine.pick(nx, ny)
    if (!hits.length) return
    const hit = hits[0]

    const entityId = hit.object.userData?.runtimeEntityId as string | undefined
    if (entityId) {
      const entity = demoEngine.game.world.entities.get(entityId)
      if (entity && entity.name.startsWith('能量球')) {
        score += 10
        demoEngine.game.world.destroy(entity)
        demoEngine.hud.set({ sun: score, message: `击中能量球 +10，当前得分 ${score}` })
        return
      }
    }

    // 点地面生成球
    const p = hits.find((h) => h.object.name === '地面')
    if (p) {
      const ball: Entity = ballPool ? ballPool.get() : createBallEntity(demoEngine.game.world, demoRoot)
      ball.active = true
      ball.getComponent(PopScale)?.reset()
      ball.transform = {
        ...ball.transform,
        position: [p.point.x, 0.6, p.point.z],
        scale: [1, 1, 1],
      }
      ;(ball.props.material as { color: string }).color = BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)]
      if (!demoRoot.children.includes(ball)) demoRoot.addChild(ball)
    }
  }
}

class HudUpdater extends Component {
  private timer = 0
  onUpdate(dt: number): void {
    if (!demoEngine) return
    this.timer += dt
    if (this.timer >= 0.3) {
      this.timer = 0
      const player = this.entity.find('Player')
      const pos = player?.transform.position ?? [0, 0, 0]
      const balls = this.entity.children.filter((c) => c.name.startsWith('能量球')).length
      demoEngine.hud.set({
        visible: true,
        sun: score,
        wave: balls,
        zombies: this.entity.children.length,
        selected: 'tap',
        over: false,
        message: '点击地面生成球 · 点击能量球得分 · WASD 移动',
      })
    }
  }
}

function createMeshEntity(
  world: World,
  parent: Entity,
  name: string,
  geometry: string,
  position: [number, number, number],
  color: string,
  geometryParams: Record<string, number> = {}
): Entity {
  const e = world.createEntity(name, parent)
  e.transform.position = position
  e.props = {
    kind: 'mesh',
    geometry,
    geometryParams,
    effect: name.startsWith('能量球') ? 'energy' : undefined,
    material: { color, metalness: 0.1, roughness: 0.7 },
  }
  return e
}

function createBallEntity(world: World, parent: Entity): Entity {
  const ball = createMeshEntity(
    world,
    parent,
    `能量球${Date.now()}`,
    'sphere',
    [0, 0.6, 0],
    BALL_COLORS[0],
    { radius: 0.4, widthSegments: 20, heightSegments: 14 }
  )
  ball.addComponent(Spin)
  ball.addComponent(Bob)
  ball.addComponent(PopScale)
  return ball
}

/** 构建一个基于 GameRuntime 核心的简单可玩演示场景（Web/AR 可交互）。 */
export function buildRuntimeDemo(engine: Engine): void {
  const world = engine.game.world
  world.clear()
  engine.hud.reset()
  demoEngine = engine
  demoInput = engine.game.input
  demoRoot = null
  ballPool = null
  score = 0

  const root = world.createEntity('RuntimeDemo')
  root.props = { kind: 'group', components: [{ type: 'tapGame' }] }
  demoRoot = root

  const ground = createMeshEntity(world, root, '地面', 'plane', [0, 0, 0], '#3d7a35', { width: 18, height: 18 })
  ground.transform.rotation = [-Math.PI / 2, 0, 0]

  const blackHole = createMeshEntity(world, root, '黑洞', 'sphere', [0, 2.4, -5], '#000000', { radius: 0.5, widthSegments: 48, heightSegments: 32 })
  blackHole.props.effect = 'blackhole'
  blackHole.addComponent(Spin)

  const colors = ['#ff5252', '#64b5f6', '#ffd54f', '#81c784', '#ba68c8', '#4dd0e1']
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2
    const orb = createMeshEntity(
      world,
      root,
      `能量球${i + 1}-初始`,
      'sphere',
      [Math.cos(angle) * 4, 1.2 + i * 0.2, Math.sin(angle) * 4],
      colors[i],
      { radius: 0.4, widthSegments: 20, heightSegments: 14 }
    )
    orb.addComponent(Spin)
    orb.addComponent(Bob)
  }

  const player = createMeshEntity(world, root, 'Player', 'box', [0, 0.5, 0], '#2196f3', { width: 0.8, height: 1, depth: 0.8 })
  player.addComponent(PlayerMove)
  player.props.castShadow = true

  root.addComponent(TapGame)
  root.addComponent(HudUpdater)

  // 对象池：生成/回收能量球
  ballPool = new ObjectPool<Entity>(() => createBallEntity(world, root))

  engine.hud.set({
    visible: true,
    sun: 0,
    wave: 0,
    zombies: root.children.length,
    selected: 'tap',
    over: false,
    message: '点击地面生成球 · 点击能量球得分 · WASD 移动',
  })
}
