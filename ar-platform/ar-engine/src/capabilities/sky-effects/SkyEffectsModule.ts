import * as THREE from 'three'
import { CapabilityType } from '../../types/enums'
import { CapabilityModule } from '../base/CapabilityModule'
import type { SkyEffectsConfig } from '../../types/config'

/**
 * 天空特效能力模块
 *
 * 在 8th Wall AR 场景中叠加全景天空贴图。
 * 原理：在场景中添加一个倒置的全景球体，跟随相机旋转。
 */
export class SkyEffectsModule extends CapabilityModule {
  readonly type = CapabilityType.SkyEffects

  private _skyMesh: THREE.Mesh | null = null

  async onStart(): Promise<void> {
    await super.onStart()

    const config = this.moduleConfig as SkyEffectsConfig

    const textureLoader = new THREE.TextureLoader()
    const texture = await textureLoader.loadAsync(config.skyTextureUrl)

    const geometry = new THREE.SphereGeometry(50, 32, 32)
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      transparent: config.blendMode === 'overlay',
      opacity: config.blendMode === 'overlay' ? 0.5 : 1,
    })

    this._skyMesh = new THREE.Mesh(geometry, material)
    this.engine.scene.add(this._skyMesh)

    console.log('[SkyEffects] 天空特效已加载')
  }

  onUpdate(_frameDelta: number): void {
    // 天空球跟随相机
    if (this._skyMesh && this.engine.camera) {
      this._skyMesh.position.copy(this.engine.camera.position)
    }
  }

  onDispose(): void {
    if (this._skyMesh) {
      this.engine.scene.remove(this._skyMesh)
      this._skyMesh.geometry.dispose()
      ;(this._skyMesh.material as THREE.Material).dispose()
      this._skyMesh = null
    }
    super.onDispose()
  }
}
