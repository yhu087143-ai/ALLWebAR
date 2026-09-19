import type { IEngineAdapter } from './engine'
import type { SceneManager } from '../core/SceneManager'
import type { CapabilityModuleConfig } from './config'
import { CapabilityType } from './enums'

export { CapabilityType }
export type { IEngineAdapter }

export interface ICapabilityModule {
  readonly type: CapabilityType
  readonly dependencies: CapabilityType[]

  onRegister(engine: IEngineAdapter, sceneManager: SceneManager, config: CapabilityModuleConfig): void
  onStart(): Promise<void>
  onUpdate(frameDelta: number): void
  onStop(): Promise<void>
  onDispose(): void

  readonly isActive: boolean
}
