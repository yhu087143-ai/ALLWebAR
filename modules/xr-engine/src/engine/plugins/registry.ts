import type { IModelProvider } from '../ai3d/types'
import type { Engine } from '../core/Engine'
import type {
  AssetProcessor,
  EnginePlugin,
  EffectFactory,
  NodeTypeDescriptor,
  PanelDescriptor,
  PluginContext,
  PluginMeta,
} from './types'

/**
 * 插件注册表。
 *
 * 所有 register* 都会返回一个反注册函数并在插件卸载时自动调用，
 * 插件作者不用自己维护清理逻辑 —— 这是最容易漏、也最容易造成内存泄漏的地方。
 */
export class PluginRegistry {
  readonly providers = new Map<string, IModelProvider>()
  readonly nodeTypes = new Map<string, NodeTypeDescriptor>()
  readonly panels = new Map<string, PanelDescriptor>()
  readonly effects = new Map<string, EffectFactory>()
  readonly assetProcessors = new Map<string, AssetProcessor>()

  private installed = new Map<string, { meta: PluginMeta; dispose?: () => void }>()

  constructor(private readonly engine: Engine) {}

  register(plugin: EnginePlugin): void {
    if (this.installed.has(plugin.id)) {
      throw new Error(`插件已安装: ${plugin.id}`)
    }

    // install 期间收集所有 register* 返回的反注册函数，卸载/回滚时统一调用
    const disposers: Array<() => void> = []
    const track = (undo: () => void): (() => void) => {
      disposers.push(undo)
      return undo
    }

    const ctx: PluginContext = {
      engine: this.engine,
      bus: this.engine.bus,

      registerProvider: (provider) => {
        this.providers.set(provider.info.id, provider)
        return track(() => this.providers.delete(provider.info.id))
      },

      registerNodeType: (descriptor) => {
        this.nodeTypes.set(descriptor.type, descriptor)
        return track(() => this.nodeTypes.delete(descriptor.type))
      },

      registerPanel: (panel) => {
        this.panels.set(panel.id, panel)
        return track(() => this.panels.delete(panel.id))
      },

      registerEffect: (id, factory) => {
        this.effects.set(id, factory)
        return track(() => this.effects.delete(id))
      },

      registerAssetProcessor: (name, processor) => {
        this.assetProcessors.set(name, processor)
        return track(() => this.assetProcessors.delete(name))
      },
    }

    let dispose: (() => void) | undefined
    try {
      dispose = plugin.install(ctx) ?? undefined
    } catch (err) {
      // 安装失败就把已经注册进去的东西全部撤掉，避免留下半截状态
      this.runDisposers(plugin.id, disposers)
      throw new Error(`插件 ${plugin.id} 安装失败: ${String(err)}`)
    }

    // install() 的返回钩子最后注册、最先撤销（逆序）
    const all = dispose ? [...disposers, dispose] : disposers
    this.installed.set(plugin.id, {
      meta: {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        installedAt: new Date().toISOString(),
      },
      dispose: () => this.runDisposers(plugin.id, all),
    })

    this.engine.bus.emit('plugin:changed', { id: plugin.id, action: 'installed' })
  }

  unregister(id: string): boolean {
    const entry = this.installed.get(id)
    if (!entry) return false

    entry.dispose?.()

    this.installed.delete(id)
    this.engine.bus.emit('plugin:changed', { id, action: 'uninstalled' })
    return true
  }

  /** 逆序执行清理函数，单个抛错不阻断其余清理 */
  private runDisposers(id: string, disposers: Array<() => void>): void {
    for (let i = disposers.length - 1; i >= 0; i -= 1) {
      try {
        disposers[i]()
      } catch (err) {
        console.error(`[PluginRegistry] 插件 ${id} 清理钩子抛错`, err)
      }
    }
  }

  list(): PluginMeta[] {
    return Array.from(this.installed.values()).map((entry) => entry.meta)
  }

  has(id: string): boolean {
    return this.installed.has(id)
  }

  disposeAll(): void {
    for (const id of Array.from(this.installed.keys())) this.unregister(id)
    this.providers.clear()
    this.nodeTypes.clear()
    this.panels.clear()
    this.effects.clear()
    this.assetProcessors.clear()
  }
}
