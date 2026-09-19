import type { World } from './World'

/**
 * 游戏场景（关卡）。一个场景可管理自己的实体、组件和逻辑。
 */
export abstract class GameScene {
  readonly world: World
  constructor(world: World) {
    this.world = world
  }
  onCreate?(): void
  onStart?(): void
  onUpdate?(dt: number): void
  onDestroy?(): void
}

/**
 * 场景管理器：负责卸载/加载关卡。
 */
export class SceneManager {
  private current: GameScene | null = null

  constructor(readonly world: World) {}

  load(scene: GameScene): void {
    this.unload()
    this.current = scene
    scene.onCreate?.()
    this.world.start()
    scene.onStart?.()
  }

  unload(): void {
    if (!this.current) return
    this.current.onDestroy?.()
    this.world.clear()
    this.current = null
  }

  update(dt: number): void {
    if (!this.current) return
    this.current.onUpdate?.(dt)
    this.world.update(dt)
  }

  get currentScene(): GameScene | null {
    return this.current
  }
}
