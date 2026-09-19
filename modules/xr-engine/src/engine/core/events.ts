import type { AssetRecord, EnvironmentConfig, PostFXConfig, SceneNode } from './types'

/** 引擎内部事件契约。UI 层订阅这些事件来刷新，引擎层不感知 React 的存在。 */
export interface EngineEvents {
  'graph:changed': { revision: number; reason: GraphChangeReason }
  'graph:nodeAdded': { nodeId: string }
  'graph:nodeRemoved': { nodeId: string; descendantIds: string[] }
  'node:updated': { nodeId: string; keys: string[] }
  'assets:changed': { assets: AssetRecord[] }
  'postfx:changed': { config: PostFXConfig }
  'environment:changed': { config: EnvironmentConfig }
  'project:loaded': { name: string }
  'ai3d:progress': { taskId: string; progress: number; stage: string }
  'ar:state': { active: boolean; reason?: string }
  // payload 用内联类型，避免 events.ts 反向依赖 plugins 层形成循环引用
  'plugin:changed': { id: string; action: 'installed' | 'uninstalled' }
  'quality:changed': { level: QualityLevel; auto: boolean }
  /** 渲染层周期性上报帧率，供画质插件判断是否要自动降档 */
  'quality:fps': { fps: number }
  /** 撤销栈变化，UI 据此启用/禁用撤销重做按钮 */
  'history:changed': { canUndo: boolean; canRedo: boolean }
  /** 播放模式切换：进入时引擎接管场景跑游戏逻辑，退出时恢复编辑态 */
  'playmode:changed': { playing: boolean }
}

/** 移动端画质档位，用于自动降级 */
export type QualityLevel = 'low' | 'medium' | 'high'

export type GraphChangeReason =
  | 'create'
  | 'delete'
  | 'update'
  | 'reparent'
  | 'reorder'
  | 'duplicate'
  | 'load'
  | 'reset'

export type { SceneNode }
