import * as THREE from 'three'

/**
 * 释放 loadModelFile 解析出的模型树：几何体、材质、模型自带贴图。
 *
 * 每次 loadModelFile 都是全新解析（GLTFLoader/FBXLoader 不复用缓存），
 * 这些 GPU 资源归本次加载独占，可以整体安全释放。
 * 资产库贴图由 NodeRenderer 的共享贴图缓存（引用计数）管理，不经过这里，不会误删。
 */
export function disposeLoadedModel(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!material) continue
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    }
  })
}
