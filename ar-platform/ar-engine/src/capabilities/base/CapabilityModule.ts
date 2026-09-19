import type { IEngineAdapter } from '../../types/engine'
import type { ICapabilityModule } from '../../types/capabilities'
import type { SceneManager } from '../../core/SceneManager'
import type { CapabilityModuleConfig } from '../../types/config'
import { CapabilityType } from '../../types/enums'

/**
 * 能力模块基类
 *
 * 所有能力模块（WorldTracking、FaceEffects 等）继承此类，
 * 减少样板代码。子类只需实现 onRegister/onStart/onUpdate/onStop/onDispose。
 */
export abstract class CapabilityModule implements ICapabilityModule {
  abstract readonly type: CapabilityType
  readonly dependencies: CapabilityType[] = []

  protected engine!: IEngineAdapter
  protected sceneManager!: SceneManager
  protected moduleConfig!: CapabilityModuleConfig
  protected _isActive = false

  get isActive(): boolean {
    return this._isActive
  }

  onRegister(engine: IEngineAdapter, sceneManager: SceneManager, config: CapabilityModuleConfig): void {
    this.engine = engine
    this.sceneManager = sceneManager
    this.moduleConfig = config
  }

  async onStart(): Promise<void> {
    this._isActive = true
  }

  onUpdate(_frameDelta: number): void {
    // 可选重写
  }

  async onStop(): Promise<void> {
    this._isActive = false
  }

  onDispose(): void {
    this._isActive = false
  }
}
