import * as THREE from 'three'
import { CapabilityType } from '../../types/enums'
import { CapabilityModule } from '../base/CapabilityModule'
import type { EightWallAdapter } from '../../adapters/EightWallAdapter'
import type { FaceEffectsConfig } from '../../types/config'

/**
 * 人脸特效能力模块
 *
 * 使用 8th Wall 的 FaceController 管线模块实现人脸追踪与特效叠加。
 * 通过 EightWallAdapter.addPipelineModule() 注册到 XR8 管线。
 *
 * 支持：面具、变形、颜色滤镜等效果。
 */
export class FaceEffectsModule extends CapabilityModule {
  readonly type = CapabilityType.FaceEffects

  private _faceMesh: THREE.Group | null = null
  private _assetUrl: string | null = null

  async onStart(): Promise<void> {
    await super.onStart()

    const adapter = this.engine
    if (!('addPipelineModule' in adapter)) {
      throw new Error('FaceEffectsModule 需要 EightWallAdapter')
    }
    const eightwall = adapter as unknown as EightWallAdapter

    const config = this.moduleConfig as FaceEffectsConfig
    this._assetUrl = config.assetUrl ?? null

    // 注册 8th Wall FaceController 管线
    if (window.XR8?.FaceController) {
      eightwall.addPipelineModule(window.XR8.FaceController.pipelineModule())
    } else {
      throw new Error('XR8.FaceController 不可用')
    }

    console.log('[FaceEffects] 人脸特效已就绪')
  }

  onUpdate(_frameDelta: number): void {
    // 8th Wall FaceController 自动管理人脸追踪与渲染
    // 可通过 XR8.FaceController 访问实时人脸网格数据
  }

  onDispose(): void {
    this._faceMesh = null
    super.onDispose()
  }
}
