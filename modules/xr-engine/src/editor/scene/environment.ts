import * as THREE from 'three'
import type { EnvPreset } from '@/engine/core/types'

interface EnvLight {
  color: string
  intensity: number
  size: [number, number]
  position: [number, number, number]
}

/**
 * 程序化环境贴图。
 *
 * 为什么不用 drei <Environment preset>？
 * 它的预设 HDRI 托管在外部 CDN 上，离线或受限网络下会直接加载失败，
 * 导致整个场景漆黑。这里改用 three 自带的 PMREM 从程序化场景烘焙环境，
 * 完全离线、秒开，而且预设可以任意调。
 */
const PRESETS: Record<EnvPreset, { base: string; lights: EnvLight[] }> = {
  studio: {
    base: '#2c2c33',
    lights: [
      { color: '#ffffff', intensity: 3.2, size: [6, 6], position: [0, 5, 0] },
      { color: '#dfe6ff', intensity: 1.6, size: [5, 3], position: [-4.6, 1.2, 0] },
      { color: '#ffe9d6', intensity: 1.1, size: [5, 3], position: [4.6, 1.2, 0] },
      { color: '#ffffff', intensity: 0.8, size: [6, 3], position: [0, 0.6, -4.6] },
    ],
  },
  city: {
    base: '#31333d',
    lights: [
      { color: '#cfe0ff', intensity: 1.5, size: [8, 8], position: [0, 6, 0] },
      { color: '#ffd9a0', intensity: 2.0, size: [3, 4], position: [-4, 1, 3] },
      { color: '#9fd0ff', intensity: 1.6, size: [3, 4], position: [4, 1.4, -3] },
    ],
  },
  sunset: {
    base: '#3a2a2e',
    lights: [
      { color: '#ff9d5c', intensity: 3.0, size: [7, 2], position: [0, 1.2, -4.6] },
      { color: '#ffd9a8', intensity: 1.4, size: [6, 4], position: [-4.6, 2, 2] },
      { color: '#5c6bff', intensity: 0.9, size: [6, 3], position: [0, 4.5, 0] },
    ],
  },
  warehouse: {
    base: '#2a2b2f',
    lights: [
      { color: '#ffffff', intensity: 2.4, size: [1.2, 8], position: [-2.2, 4.6, 0] },
      { color: '#ffffff', intensity: 2.4, size: [1.2, 8], position: [2.2, 4.6, 0] },
      { color: '#b8c4d0', intensity: 0.7, size: [8, 2], position: [0, 0.4, -4.6] },
    ],
  },
  forest: {
    base: '#25301f',
    lights: [
      { color: '#d8ffbf', intensity: 2.2, size: [7, 7], position: [0, 5.5, 0] },
      { color: '#8fd06a', intensity: 1.2, size: [4, 3], position: [-4.6, 1.5, 1] },
      { color: '#6fa8d0', intensity: 0.8, size: [4, 3], position: [4.6, 1.5, -1] },
    ],
  },
  apartment: {
    base: '#3a352f',
    lights: [
      { color: '#ffeccc', intensity: 2.6, size: [5, 5], position: [0, 4.2, 1] },
      { color: '#ffd9a0', intensity: 1.8, size: [3, 3], position: [-4.6, 1.2, 2] },
      { color: '#a8c0ff', intensity: 0.7, size: [4, 3], position: [3.5, 1.5, -4] },
    ],
  },
  dawn: {
    base: '#2f2a38',
    lights: [
      { color: '#ffb4c8', intensity: 2.2, size: [8, 3], position: [0, 1.5, -4.6] },
      { color: '#a8b8ff', intensity: 1.6, size: [8, 4], position: [0, 4.6, 0] },
      { color: '#ffd9c0', intensity: 1.0, size: [4, 3], position: [4.6, 1, 2] },
    ],
  },
  night: {
    base: '#14141c',
    lights: [
      { color: '#8fa8ff', intensity: 1.1, size: [7, 7], position: [0, 5.5, 0] },
      { color: '#ff9d5c', intensity: 0.8, size: [2, 2], position: [-4, 1, 3] },
      { color: '#6ad0ff', intensity: 0.5, size: [2, 2], position: [4, 1.4, -3] },
    ],
  },
}

/** 搭一个盒子当房间，里面摆若干发光平面，交给 PMREM 烘焙成环境贴图 */
export function buildEnvironmentScene(preset: EnvPreset): THREE.Scene {
  const config = PRESETS[preset] ?? PRESETS.studio
  const scene = new THREE.Scene()

  const roomMaterial = new THREE.MeshStandardMaterial({
    side: THREE.BackSide,
    color: new THREE.Color(config.base),
    roughness: 1,
    metalness: 0,
  })
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), roomMaterial))

  for (const light of config.lights) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(light.color).multiplyScalar(light.intensity),
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...light.size), material)
    mesh.position.set(...light.position)
    mesh.lookAt(0, 0, 0)
    scene.add(mesh)
  }

  return scene
}

export function disposeSceneContents(scene: THREE.Scene): void {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat?.dispose()
  })
}

export const ENV_PRESET_LABEL: Record<EnvPreset, string> = {
  studio: '影棚',
  city: '城市',
  sunset: '黄昏',
  warehouse: '仓库',
  forest: '森林',
  apartment: '室内',
  dawn: '黎明',
  night: '夜晚',
}
