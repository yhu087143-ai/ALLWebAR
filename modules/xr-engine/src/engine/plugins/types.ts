import type { IModelProvider } from '../ai3d/types'
import type { EventBus } from '../core/EventBus'
import type { Engine } from '../core/Engine'
import type { EngineEvents } from '../core/events'
import type { AssetRecord, NodeProps, NodeType } from '../core/types'

/** 插件可注册的自定义节点类型 */
export interface NodeTypeDescriptor {
  type: NodeType
  label: string
  icon: string
  createDefaultProps: () => NodeProps
}

/** 插件可注册的编辑器面板（渲染由编辑器层提供，引擎只登记元数据） */
export interface PanelDescriptor {
  id: string
  label: string
  order?: number
}

/** 后处理特效工厂：接收配置，返回可直接渲染的 React 元素 */
export type EffectFactory = (config: Record<string, unknown>) => unknown

/** 资产处理器：在资产入库前插入自定义处理（如自动减面、格式转换） */
export type AssetProcessor = (
  asset: AssetRecord,
  data: ArrayBuffer
) => Promise<ArrayBuffer> | ArrayBuffer

/**
 * 插件拿到的上下文。
 *
 * 每个 register* 都返回一个反注册函数，插件卸载时自动调用，
 * 插件作者不需要自己记账。
 */
export interface PluginContext {
  readonly engine: Engine
  readonly bus: EventBus<EngineEvents>

  registerProvider(provider: IModelProvider): () => void
  registerNodeType(descriptor: NodeTypeDescriptor): () => void
  registerPanel(panel: PanelDescriptor): () => void
  registerEffect(id: string, factory: EffectFactory): () => void
  registerAssetProcessor(name: string, processor: AssetProcessor): () => void
}

export interface EnginePlugin {
  id: string
  name: string
  version: string
  description?: string
  /** 返回值若为函数，则作为卸载钩子 */
  install(ctx: PluginContext): void | (() => void)
}

export interface PluginMeta {
  id: string
  name: string
  version: string
  description?: string
  installedAt: string
}
