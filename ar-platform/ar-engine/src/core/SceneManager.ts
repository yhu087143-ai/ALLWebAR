import * as THREE from 'three'

export class SceneManager {
  readonly scene: THREE.Scene

  constructor() {
    this.scene = new THREE.Scene()
  }

  setup(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 1.5)
    this.scene.add(ambient)

    const directional = new THREE.DirectionalLight(0xffffff, 2)
    directional.position.set(0, 3, 3)
    this.scene.add(directional)

    const fill = new THREE.DirectionalLight(0xffffff, 0.5)
    fill.position.set(-2, 1, -2)
    this.scene.add(fill)
  }

  add(object: THREE.Object3D): void {
    this.scene.add(object)
  }

  remove(object: THREE.Object3D): void {
    this.scene.remove(object)
  }

  dispose(): void {
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      }
    })
  }
}
