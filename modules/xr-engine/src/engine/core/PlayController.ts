import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import type { Engine } from './Engine'
import { ScriptRuntime } from './scripts'
import type { MeshProps, ProjectFile, SceneNode } from './types'

/**
 * 播放模式控制器 —— 「能做小游戏」的核心。
 *
 * 进入播放：
 *   1. 快照整个项目（toProject）
 *   2. 挂起撤销栈与自动保存（播放中的物理变化不该污染历史）
 *   3. 按 mesh 的 physics 配置创建 cannon-es 刚体
 *   4. 编译并启动所有行为脚本
 *   5. 每帧把物理结果**直接写进 THREE 对象**（绕过 React，
 *      否则 60fps 全树重渲染必卡；退出时靠快照恢复，不依赖 React 状态）
 *
 * 退出播放：销毁物理与脚本 -> restoreSnapshot(快照) -> 一切回到编辑态。
 * 恢复只还原项目数据，不碰撤销历史（播放前积累的 undo 链仍然可用）。
 */
export class PlayController {
  private world: CANNON.World | null = null
  private bodies = new Map<string, CANNON.Body>()
  private targets = new Map<string, THREE.Object3D>()
  private snapshot: ProjectFile | null = null
  readonly scripts = new ScriptRuntime()

  get active(): boolean {
    return this.world !== null
  }

  start(engine: Engine): void {
    if (this.active) return
    const scene = engine.getScene()
    if (!scene) throw new Error('视口尚未就绪，无法进入播放模式')

    this.snapshot = engine.toProject()
    engine.history.suspend()

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })
    // 允许休眠：静止的刚体不再参与求解，手机上省电明显
    world.allowSleep = true

    const findByNodeId = (id: string): THREE.Object3D | null => {
      const box: { value: THREE.Object3D | null } = { value: null }
      scene.traverse((obj) => {
        if (!box.value && obj.userData.__nodeId === id) box.value = obj
      })
      return box.value
    }

    engine.graph.traverse((node) => {
      const physics = (node.props as MeshProps).physics
      // 没标记的网格不参与物理 —— 但标记了 static 的做碰撞体
      if (!physics || physics.body === 'none') return

      const half = this.halfExtents(node, physics.shape)
      const isDynamic = physics.body === 'dynamic'
      const body = new CANNON.Body({
        mass: isDynamic ? physics.mass || 1 : 0,
        shape:
          physics.shape === 'sphere'
            ? new CANNON.Sphere(half.x)
            : new CANNON.Box(half),
        position: new CANNON.Vec3(...node.transform.position),
        material: new CANNON.Material({ restitution: physics.restitution ?? 0.3 }),
      })
      if (!isDynamic) body.type = CANNON.Body.STATIC

      world.addBody(body)
      this.bodies.set(node.id, body)

      const target = findByNodeId(node.id)
      if (target) this.targets.set(node.id, target)
    })

    this.world = world

    const failures = this.scripts.start(engine)
    if (failures.length) {
      console.warn('[play] 以下节点脚本编译失败：', failures.join(', '))
    }

    engine.startGameRuntime()
    engine.bus.emit('playmode:changed', { playing: true })
  }

  /** 每帧调用：推进脚本与物理，把结果直接写到 THREE 对象上 */
  tick(engine: Engine, delta: number): void {
    if (!this.world) return
    this.scripts.tick(engine, delta)
    this.world.step(1 / 60, Math.min(delta, 0.1))
    engine.updateGameRuntime(delta)

    for (const [id, body] of this.bodies) {
      const target = this.targets.get(id)
      if (!target) continue
      target.position.set(body.position.x, body.position.y, body.position.z)
      target.quaternion.set(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w
      )
    }
  }

  stop(engine: Engine): void {
    if (!this.world) return

    this.scripts.stop(engine)
    engine.stopGameRuntime()
    this.world = null
    this.bodies.clear()
    this.targets.clear()

    // 快照恢复：撤销栈仍处于挂起状态，且 restoreSnapshot 不重置历史，
    // 播放前积累的撤销记录在退出后仍然可用
    if (this.snapshot) engine.restoreSnapshot(this.snapshot)
    this.snapshot = null

    engine.history.resume()
    engine.hud.reset()
    engine.bus.emit('playmode:changed', { playing: false })
  }

  /** 按几何参数 × 节点缩放估算碰撞半边长（cannon 这边只落地 box/sphere 两种近似） */
  private halfExtents(node: SceneNode, shape: 'box' | 'sphere'): CANNON.Vec3 {
    const [sx, sy, sz] = node.transform.scale.map((v) => Math.abs(v))
    let hx = 0.5
    let hy = 0.5
    let hz = 0.5
    if (node.props.kind === 'mesh') {
      const p = node.props.geometryParams
      switch (node.props.geometry) {
        case 'box':
          hx = (p.width ?? 1) / 2
          hy = (p.height ?? 1) / 2
          hz = (p.depth ?? 1) / 2
          break
        case 'sphere':
        case 'icosahedron':
          hx = hy = hz = p.radius ?? 0.5
          break
        case 'plane':
          hx = (p.width ?? 1) / 2
          hy = (p.height ?? 1) / 2
          hz = 0.01 // 平面没有厚度，给个薄片避免零体积碰撞体
          break
        case 'cylinder':
          hx = hz = Math.max(p.radiusTop ?? 0.5, p.radiusBottom ?? 0.5)
          hy = (p.height ?? 1) / 2
          break
        case 'cone':
          hx = hz = p.radius ?? 0.5
          hy = (p.height ?? 1) / 2
          break
        case 'torus':
          hx = hy = (p.radius ?? 0.5) + (p.tube ?? 0.2)
          hz = p.tube ?? 0.2
          break
      }
    }
    // 球体只有一个半径：非均匀缩放时取最大轴，保证碰撞体包住网格
    if (shape === 'sphere') {
      const r = Math.max(hx * sx, hy * sy, hz * sz)
      return new CANNON.Vec3(r, r, r)
    }
    return new CANNON.Vec3(hx * sx, hy * sy, hz * sz)
  }
}
