import * as THREE from 'three'
import { CapabilityType } from '../../types/enums'
import { CapabilityModule } from '../base/CapabilityModule'

/**
 * 世界追踪能力模块
 *
 * 8th Wall 的 XrController 管线模块提供 6DoF SLAM 世界追踪。
 * 该模块负责：
 *  - 提供世界追踪状态回调
 *  - 暴露最新的相机位姿（位置 + 旋转）
 *  - 提供锚点系统（在世界空间中固定位置放置物体）
 */
export class WorldTrackingModule extends CapabilityModule {
  readonly type = CapabilityType.WorldTracking

  private _worldPosition = new THREE.Vector3()
  private _worldQuaternion = new THREE.Quaternion()
  private _onPoseUpdate: ((pos: THREE.Vector3, quat: THREE.Quaternion) => void) | null = null

  /** 最新的世界位置 */
  get worldPosition(): THREE.Vector3 { return this._worldPosition }
  /** 最新的世界旋转 */
  get worldQuaternion(): THREE.Quaternion { return this._worldQuaternion }

  /** 设置位姿更新回调（每帧触发） */
  set onPoseUpdate(cb: ((pos: THREE.Vector3, quat: THREE.Quaternion) => void) | null) {
    this._onPoseUpdate = cb
  }

  async onStart(): Promise<void> {
    await super.onStart()
    console.log('[WorldTracking] 世界追踪已就绪（8th Wall XrController）')
  }

  onUpdate(frameDelta: number): void {
    const camera = this.engine.camera
    if (camera) {
      camera.getWorldPosition(this._worldPosition)
      camera.getWorldQuaternion(this._worldQuaternion)
      this._onPoseUpdate?.(this._worldPosition, this._worldQuaternion)
    }
  }

  onDispose(): void {
    this._onPoseUpdate = null
    super.onDispose()
  }
}
