/**
 * @mkkellogg/gaussian-splats-3d 0.4.7 未随包发布类型定义，
 * 这里只为引擎用到的最小 API 面提供声明。
 */
declare module '@mkkellogg/gaussian-splats-3d' {
  import type { Group } from 'three'

  export const SceneFormat: {
    Splat: 0
    KSplat: 1
    Ply: 2
    Spz: 3
  }

  export interface SplatSceneOptions {
    /** 加载时显示库自带的加载遮罩；编辑器内必须关闭 */
    showLoadingUI?: boolean
    /** 渐进式加载（边下边渲）；关闭以保证确定性 */
    progressiveLoad?: boolean
    /** 丢弃 alpha 低于该值(0-255)的泼溅点 */
    splatAlphaRemovalThreshold?: number
    /** 场景整体缩放 [x, y, z] */
    scale?: [number, number, number]
    position?: [number, number, number]
    rotation?: [number, number, number, number]
    /** 显式指定文件格式（blob: URL 无扩展名时必须传） */
    format?: typeof SceneFormat[keyof typeof SceneFormat]
    onProgress?: (percentCompleted: number) => void
  }

  export interface ViewerOptions {
    gpuAcceleratedSort?: boolean
    sharedMemoryForWorkers?: boolean
    dynamicScene?: boolean
    halfPrecision?: boolean
    antialiased?: boolean
    selfDrivenMode?: boolean
    useBuiltInControls?: boolean
    rootElement?: HTMLElement | null
    dropInMode?: boolean
    camera?: unknown
    renderer?: unknown
  }

  /** 以普通 THREE.Group 形式嵌入现有场景的泼溅查看器 */
  export class DropInViewer extends Group {
    constructor(options?: ViewerOptions)
    addSplatScene(path: string, options?: SplatSceneOptions): Promise<void> & { abort?: () => void }
    addSplatScenes(
      sceneOptions: { path: string; options?: SplatSceneOptions }[],
      showLoadingUI?: boolean
    ): Promise<void>
    removeSplatScene(index: number, showLoadingUI?: boolean): Promise<void>
    getSceneCount(): number
    dispose(): Promise<void>
  }
}
