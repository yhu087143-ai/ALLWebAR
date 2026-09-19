import { Box3, LoadingManager, Vector3, type Object3D, type WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

/**
 * 解码器放在 public/decoders 下，由 scripts/copy-decoders.mjs 从
 * three 的 examples 目录复制而来，避免运行期依赖外网 CDN。
 */
export const DECODER_BASE = '/decoders/'

let dracoSingleton: DRACOLoader | null = null

function getDraco(): DRACOLoader {
  if (!dracoSingleton) {
    dracoSingleton = new DRACOLoader()
    dracoSingleton.setDecoderPath(`${DECODER_BASE}draco/`)
    // 不要调用 setDecoderConfig({ type: 'js' })：它在新版 three 已废弃，
    // 且会强制加载旧的 asm.js 解码器 draco_decoder.js（正是 ERR_ABORTED 的来源）。
    // DRACOLoader 默认用 wasm（draco_wasm_wrapper.js + draco_decoder.wasm，均已就位），
    // 当环境不支持 WebAssembly 时会自动回退到 js 解码器，无需手动指定。
  }
  return dracoSingleton
}

/**
 * 创建统一配置好的 GLTF 加载器。
 * gl 传入时启用 KTX2 —— 转码器需要探测设备的纹理压缩支持情况。
 */
export function createGLTFLoader(gl?: WebGLRenderer): GLTFLoader {
  const loader = new GLTFLoader()
  loader.setDRACOLoader(getDraco())
  loader.setMeshoptDecoder(MeshoptDecoder)

  if (gl) {
    const ktx2 = new KTX2Loader()
      .setTranscoderPath(`${DECODER_BASE}basis/`)
      .detectSupport(gl)
    loader.setKTX2Loader(ktx2)
  }

  return loader
}


export interface LoadedModel {
  scene: import('three').Object3D
  animations: import('three').AnimationClip[]
}

const IMAGE_EXT = /\.(png|jpe?g|webp|tga|bmp|tif|tiff|gif|ktx2)$/i

/**
 * FBX 的贴图引用是外部文件（ RelativeFilename ），浏览器里加载 blob FBX 时
 * 解析不到这些相对路径，材质上的贴图全是「没有像素的空壳」——渲染发白，
 * 导出 GLB 前也只能被摘掉。这里把用户同时导入的贴图文件按文件名（忽略扩展名、
 * 忽略目录）映射成 blob URL，FBXLoader 请求任何贴图路径时都重定向到匹配的文件。
 */
export function createFBXManager(siblingImages: File[]): LoadingManager {
  const byBase = new Map<string, string>()
  const blobUrls: string[] = []
  for (const file of siblingImages) {
    if (!IMAGE_EXT.test(file.name)) continue
    const base = file.name.toLowerCase().replace(/\.[^.]+$/, '')
    const url = URL.createObjectURL(file)
    byBase.set(base, url)
    blobUrls.push(url)
  }
  const manager = new LoadingManager()
  if (byBase.size === 0) return manager
  // 贴图 blob URL 只在本次加载期间有效。manager 的全部条目结束后统一回收
  // （含加载失败：three 的 ImageLoader 在 itemError 后仍会 itemEnd，最终同样
  // 触发 onLoad），避免每张 sibling 图泄漏一个 object URL。
  manager.onLoad = () => {
    for (const u of blobUrls) URL.revokeObjectURL(u)
    blobUrls.length = 0
  }
  manager.setURLModifier((url) => {
    // 只拦截贴图类请求，避免影响 FBX 本体等
    if (!IMAGE_EXT.test(url) && !/\.(tga|bmp|tif|tiff|gif)$/i.test(url)) {
      // FBX 里常写不带扩展名的引用名（如 "base_color_texture"），也放进来
      const raw = url.split(/[\\/]/).pop()?.toLowerCase() ?? ''
      const hit = byBase.get(raw)
      if (hit) return hit
      return url
    }
    const base = url.split(/[\\/]/).pop()?.toLowerCase().replace(/\.[^.]+$/, '') ?? ''
    const hit = byBase.get(base)
    return hit ?? url
  })
  return manager
}

/** 材质贴图槽位（与 modelOptimizer 的 TEXTURE_SLOTS 保持一致）。 */
const MATERIAL_TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
] as const

/**
 * FBXLoader 不等贴图解码就返回模型：内嵌 PNG（动辄十几 MB）的 image
 * 是异步填充的。若拿到模型立刻统计/导出，看到的都是没有像素的空壳贴图，
 * 导出 GLB 时会被当作「缺失贴图」摘掉——这就是模型导入后发白的根因。
 * 这里轮询等待所有材质贴图的 image 就绪（或超时放弃）。
 *
 * 超时收敛：贴图全部走 loader 的 LoadingManager，失败（404/解码失败）的
 * 贴图 image 永远是 undefined——调用方可用 manager.onLoad 做 race 立即返回
 * （见 loadModelFile 的 FBX 分支），这里的 timeoutMs 只是兜底，默认 2s。
 */
async function waitForMaterialImages(root: Object3D, timeoutMs = 2000): Promise<void> {
  const start = performance.now()
  for (;;) {
    let pending = false
    root.traverse((obj) => {
      const mesh = obj as import('three').Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const mat of mats) {
        if (!mat) continue
        const m = mat as unknown as Record<string, unknown>
        for (const slot of MATERIAL_TEXTURE_SLOTS) {
          const tex = m[slot] as { image?: unknown } | null | undefined
          // image 为 null/undefined 说明还没解码完成（失败时也保持 undefined）
          if (tex && !tex.image) pending = true
        }
      }
    })
    if (!pending) return
    if (performance.now() - start > timeoutMs) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** 根据扩展名选择加载器：GLB/GLTF、OBJ、FBX，未来可扩展 STL/PLY。 */
export async function loadModelFile(
  uri: string,
  name: string,
  gl?: WebGLRenderer,
  siblingImages: File[] = []
): Promise<LoadedModel> {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'obj') {
    // OBJ 的材质写在同名 .mtl 里：能推导出来就尝试带上（失败静默，
    // OBJ 仍按无材质加载）。blob: URI 没有「同目录」概念，只有真实路径可推导。
    const mtlUri = uri.replace(/\.obj(\?.*)?$/i, '.mtl')
    const objLoader = new OBJLoader()
    if (mtlUri !== uri) {
      try {
        const materials = await new MTLLoader().loadAsync(mtlUri)
        materials.preload()
        objLoader.setMaterials(materials)
      } catch {
        // 同名 .mtl 不存在或解析失败：忽略，按无材质加载
      }
    }
    const obj = await objLoader.loadAsync(uri)
    return { scene: obj, animations: [] }
  }
  if (ext === 'fbx') {
    const manager = siblingImages.length ? createFBXManager(siblingImages) : new LoadingManager()
    // 贴图全部结束（成功或失败）时 resolve：加载失败的贴图 image 永远是
    // undefined，靠它让 waitForMaterialImages 立即收敛，而不是干等满超时。
    const settled = new Promise<void>((resolve) => {
      const prev = manager.onLoad
      manager.onLoad = () => {
        prev?.call(manager)
        resolve()
      }
    })
    const fbx = await new FBXLoader(manager).loadAsync(uri)
    // 内嵌/外链贴图是异步解码的，等它们就绪再返回，
    // 否则统计与导出会把「未就绪」当「缺失」处理。
    await Promise.race([waitForMaterialImages(fbx), settled])
    return { scene: fbx, animations: fbx.animations ?? [] }
  }
  const gltf = await createGLTFLoader(gl).loadAsync(uri)
  return { scene: gltf.scene, animations: gltf.animations ?? [] }
}

/**
 * 把模型「落地 + 居中 + 归一化尺寸」到基准大小。
 *
 * 社区通用做法（也是 Three.js 官方示例常见套路）：
 *   1. 按包围盒最长边缩放到目标尺寸（默认 1，即 1 米基准）；
 *   2. 重新取包围盒，把最低点（脚底）贴到 y=0、水平中心对齐。
 *
 * 这样站姿/带骨骼的角色是「脚踩地面」，而不是把包围盒中心放原点导致的
 * 「腰部落在地面、脚陷进地面」。缩放只作用在根节点，不破坏蒙皮骨架绑定。
 */
export function normalizeModelToGround(root: Object3D, targetSize = 1): void {
  root.updateMatrixWorld(true)
  const box = new Box3().setFromObject(root)
  const size = box.getSize(new Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  if (maxDim <= 0) return

  root.scale.multiplyScalar(targetSize / maxDim)
  root.updateMatrixWorld(true)

  const fitted = new Box3().setFromObject(root)
  root.position.x -= (fitted.min.x + fitted.max.x) / 2
  root.position.z -= (fitted.min.z + fitted.max.z) / 2
  root.position.y -= fitted.min.y
  root.updateMatrixWorld(true)
}

export interface LoadStats {
  triangles: number
  meshes: number
  materials: number
  textures: number
  animations: string[]
  bones?: number
  animationTracks?: number
}

/** 统计 glTF 场景的面数等信息，用于资产库展示与性能预算检查。
 *  GLTFLoader 把动画放在加载结果的 gltf.animations 上（scene 的
 *  root.animations 恒为空），动画统计优先用调用方传入的加载结果。 */
export function inspectGLTF(
  root: import('three').Object3D,
  loadedAnimations?: import('three').AnimationClip[]
): LoadStats {
  let triangles = 0
  let meshes = 0
  let bones = 0
  const materials = new Set<unknown>()
  const textures = new Set<unknown>()
  const animations: string[] = []

  root.traverse((obj) => {
    const bone = obj as import('three').Bone
    if ((bone as unknown as { isBone?: boolean }).isBone) bones += 1
    const mesh = obj as import('three').Mesh
    if (!mesh.isMesh) return
    meshes += 1
    const geometry = mesh.geometry
    if (geometry?.index) triangles += geometry.index.count / 3
    else if (geometry?.attributes?.position) triangles += geometry.attributes.position.count / 3

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      if (!mat) continue
      materials.add(mat)
      const m = mat as unknown as Record<string, unknown>
      for (const key of MATERIAL_TEXTURE_SLOTS) {
        if (m[key]) textures.add(m[key])
      }
    }
  })

  let animationTracks = 0
  // 优先用加载结果的 animations（GLTFLoader 不往 scene 上挂动画）；
  // 回退 root.animations 仅对 FBX 等少数 loader 有效。
  const clips =
    loadedAnimations ??
    (root as unknown as { animations?: { name: string; tracks: unknown[] }[] }).animations
  clips?.forEach((clip) => {
    animations.push(clip.name || 'unnamed')
    animationTracks += clip.tracks?.length ?? 0
  })

  return {
    triangles: Math.round(triangles),
    meshes,
    materials: materials.size,
    textures: textures.size,
    animations,
    bones,
    animationTracks,
  }
}
