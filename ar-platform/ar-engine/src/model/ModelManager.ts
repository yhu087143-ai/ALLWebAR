import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import type { ModelConfig } from '../types/config'

export interface ModelLoadCallbacks {
  onProgress?: (pct: number) => void
  onLoaded?: () => void
  onError?: (err: Error) => void
}

export class ModelManager {
  private loader: GLTFLoader
  private _wrapper: THREE.Group | null = null

  constructor(dracoDecoderPath = '/draco/') {
    this.loader = new GLTFLoader()
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(dracoDecoderPath)
    this.loader.setDRACOLoader(dracoLoader)
  }

  get wrapper(): THREE.Group | null {
    return this._wrapper
  }

  load(url: string, config: ModelConfig, callbacks?: ModelLoadCallbacks): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      callbacks?.onProgress?.(0)

      this.loader.load(
        url,
        (gltf) => {
          const box = new THREE.Box3().setFromObject(gltf.scene)
          const center = box.getCenter(new THREE.Vector3())
          gltf.scene.position.copy(center).negate()

          const wrapper = new THREE.Group()
          const pos = config.position ?? [0, 0, 0]
          wrapper.position.set(pos[0], pos[1], pos[2])
          wrapper.scale.setScalar(config.scale ?? 1)
          wrapper.add(gltf.scene)

          this._wrapper = wrapper
          callbacks?.onProgress?.(100)
          callbacks?.onLoaded?.()
          resolve(wrapper)
        },
        (xhr) => {
          if (xhr.total > 0 && callbacks?.onProgress) {
            callbacks.onProgress(xhr.loaded / xhr.total)
          }
        },
        (err: any) => {
          const msg = err?.statusText || err?.message || '模型加载失败'
          const error = new Error(msg)
          callbacks?.onError?.(error)
          reject(error)
        },
      )
    })
  }

  setPosition(x: number, y: number, z: number): void {
    if (this._wrapper) this._wrapper.position.set(x, y, z)
  }

  setScale(x: number, y: number, z: number): void {
    if (this._wrapper) this._wrapper.scale.set(x, y, z)
  }

  set quaternion(q: THREE.Quaternion) {
    if (this._wrapper) this._wrapper.quaternion.copy(q)
  }

  dispose(): void {
    this._wrapper = null
  }
}
