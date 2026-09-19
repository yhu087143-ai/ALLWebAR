import { CapabilityType } from '../types/capabilities'
import type { ICapabilityModule } from '../types/capabilities'
import type { IEngineAdapter } from '../types/engine'
import type { CapabilityModuleConfig } from '../types/config'
import type { SceneManager } from './SceneManager'

export type CapabilityFactory = () => ICapabilityModule

export class CapabilityRegistry {
  private factories = new Map<CapabilityType, CapabilityFactory>()

  register(type: CapabilityType, factory: CapabilityFactory): void {
    this.factories.set(type, factory)
  }

  registerAll(modules: Array<{ type: CapabilityType; factory: CapabilityFactory }>): void {
    for (const m of modules) {
      this.register(m.type, m.factory)
    }
  }

  createModules(
    configs: CapabilityModuleConfig[],
    engine: IEngineAdapter,
    sceneManager: SceneManager,
  ): ICapabilityModule[] {
    return configs.map((cfg) => {
      const factory = this.factories.get(cfg.type)
      if (!factory) {
        throw new Error(`Capability not registered: ${cfg.type}`)
      }
      const module = factory()
      module.onRegister(engine, sceneManager, cfg)
      return module
    })
  }

  validate(
    types: CapabilityType[],
    engine: IEngineAdapter,
  ): { valid: boolean; unsupported: CapabilityType[] } {
    const supported = new Set(engine.getSupportedCapabilities())
    const unsupported = types.filter((t) => !supported.has(t))
    return { valid: unsupported.length === 0, unsupported }
  }

  isRegistered(type: CapabilityType): boolean {
    return this.factories.has(type)
  }
}
