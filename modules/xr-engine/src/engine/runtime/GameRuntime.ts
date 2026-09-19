import { AudioManager, type AudioOptions } from '@/engine/game/AudioManager'
import { ObjectPool } from '@/engine/game/ObjectPool'
import { PrefabRegistry } from '@/engine/game/Prefab'
import { InputManager } from './InputManager'
import { Time } from './Time'
import { QualityManager } from '@/engine/game/QualityManager'
import { DialogueSystem } from '@/engine/game/DialogueSystem'
import { TimelineSystem } from '@/engine/game/TimelineSystem'
import { SaveSystem } from '@/engine/game/SaveSystem'
import { InteractionSystem } from '@/engine/game/InteractionSystem'
import { TaskSystem } from '@/engine/game/TaskSystem'
import { AnimationStateMachine } from '@/engine/game/AnimationStateMachine'
import { SceneManager } from './SceneManager'
import { World } from './World'

/**
 * 游戏运行时门面。
 *
 * 这是与现有 Three.js 编辑器分开的“真正游戏引擎核心”：
 * - Entity/Component
 * - World（生命周期 + update）
 * - Prefab 实例化
 * - ObjectPool
 * - Audio
 * - Input
 *
 * 未来可接 Three.js 渲染器、xr-frame 渲染器或微信小游戏运行时。
 */
export class GameRuntime {
  readonly world = new World()
  readonly prefabs = new PrefabRegistry()
  readonly audio = new AudioManager()
  readonly input = new InputManager()
  readonly time = new Time()
  readonly scenes = new SceneManager(this.world)
  readonly quality = new QualityManager()
  readonly dialogue = new DialogueSystem()
  readonly timeline = new TimelineSystem()
  readonly saves = new SaveSystem()
  readonly interactions = new InteractionSystem()
  readonly tasks = new TaskSystem()
  readonly animator = new AnimationStateMachine()
  readonly pools = new Map<string, ObjectPool<unknown>>()

  getPool<T>(key: string, factory: () => T): ObjectPool<T> {
    let pool = this.pools.get(key) as ObjectPool<T> | undefined
    if (!pool) {
      pool = new ObjectPool<T>(factory)
      this.pools.set(key, pool as ObjectPool<unknown>)
    }
    return pool
  }

  update(rawDelta: number): void {
    const dt = this.time.tick(rawDelta)
    this.quality.measureFrame(rawDelta)
    this.timeline.update(dt, this.world)
    if (this.scenes.currentScene) this.scenes.update(dt)
    else this.world.update(dt)
    this.input.endFrame()
  }

  start(): void {
    this.quality.autoDetect()
    this.world.userData.game = this
    this.input.attach()
    if (!this.scenes.currentScene) this.world.start()
  }

  stop(): void {
    this.scenes.unload()
    this.world.stop()
    this.input.detach()
    for (const pool of this.pools.values()) pool.clear()
    this.pools.clear()
  }

  saveGame(): boolean {
    const worldState: Record<string, unknown> = {}
    // 世界状态可以由游戏脚本写入 world.userData.state
    if (this.world.userData.state) worldState.state = this.world.userData.state
    return this.saves.save(
      this.saves.collect(
        this.dialogue.saveFlags(),
        this.timeline.serialize(),
        worldState,
        this.tasks.serialize()
      )
    )
  }

  loadGame(): boolean {
    const data = this.saves.load()
    if (!data) return false
    this.dialogue.loadFlags(data.flags)
    if (data.worldState?.state) this.world.userData.state = data.worldState.state
    this.timeline.deserialize(data.timelineTime ?? {})
    if (data.tasks) this.tasks.deserialize(data.tasks)
    return true
  }

  playSfx(id: string, options: AudioOptions = {}): void {
    this.audio.playSfx(id, options)
  }

  playBgm(id: string, options: AudioOptions = {}): void {
    this.audio.playBgm(id, options)
  }

  stopAudio(): void {
    this.audio.stopAll()
  }
}
