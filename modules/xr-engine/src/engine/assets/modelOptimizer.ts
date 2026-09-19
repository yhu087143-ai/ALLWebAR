import * as THREE from 'three'
import { MeshoptSimplifier } from 'meshoptimizer/simplifier'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { deinterleaveGeometry, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { LoadedModel } from './loader'
import { normalizeModelToGround } from './loader'

export interface OptimizeOptions {
  /** 目标三角面比例，例如 0.3 = 保留 30% */
  ratio: number
  /** 单个网格最大三角面数 */
  maxTriangles: number
  /** 目标误差，0~1，越小越接近原模型 */
  error: number
  /** 贴图最大边长，超过的会在导出前降采样（微信红线 1024） */
  maxTextureSize: number
}

export const defaultOptimizeOptions = (): OptimizeOptions => ({
  ratio: 0.3,
  maxTriangles: 50000,
  error: 0.01,
  maxTextureSize: 1024,
})

export interface SimplifyResult {
  /** 简化后三角形数 */
  triangles: number
  /** 原始三角形数 */
  beforeTriangles: number
  /** 简化后的网格对象 */
  geometry: THREE.BufferGeometry
  error: number
}

/**
 * 使用 meshoptimizer 简化单个 BufferGeometry。
 * 只重写 index buffer，顶点属性（含 skinIndex/skinWeight/normal/uv）全部保留，
 * 因此蒙皮动画可以继续使用。
 */
export async function simplifyGeometry(
  geometry: THREE.BufferGeometry,
  options: Partial<OptimizeOptions> = {}
): Promise<SimplifyResult> {
  const opts = { ...defaultOptimizeOptions(), ...options }
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  let index = geometry.getIndex()
  let working = geometry
  if (!position) {
    return { geometry, triangles: 0, beforeTriangles: 0, error: 0 }
  }

  // meshopt 只重写 index buffer，不会维护 geometry.groups 的分段边界：
  // 多材质网格（groups > 1）简化后三角形跨段重排 → 材质错乱，只能整体跳过。
  if (geometry.groups.length > 1) {
    const tris = Math.round(index ? index.count / 3 : position.count / 3)
    console.warn(
      `[optimizer] 多材质网格（${geometry.groups.length} 个 geometry.groups）减面会打乱材质分段，已跳过该网格`
    )
    return { geometry, triangles: tris, beforeTriangles: tris, error: 0 }
  }

  // interleaved buffer 里 position 的存储 stride 不是 3，直接按 Float32Array
  // 连续读会错位；先就地拆成独立 attribute（不影响 index/groups）。
  if ((position as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) {
    deinterleaveGeometry(working)
  }

  // meshopt 需要 indexed geometry；对非索引网格先焊接顶点生成索引
  if (!index) {
    working = mergeVertices(geometry, 1e-4)
    index = working.getIndex()
  }
  if (!index) {
    return { geometry, triangles: position.count / 3, beforeTriangles: position.count / 3, error: 0 }
  }

  await MeshoptSimplifier.ready

  const posAttr = working.getAttribute('position') as THREE.BufferAttribute
  const indices = new Uint32Array(index.array as ArrayLike<number>)
  const positions = new Float32Array(posAttr.array as ArrayLike<number>)
  const currentTris = indices.length / 3
  const targetTris = Math.max(64, Math.min(
    currentTris * opts.ratio,
    opts.maxTriangles,
    currentTris
  ))
  const targetIndexCount = Math.max(3, Math.floor(targetTris) * 3)

  const [out, error] = MeshoptSimplifier.simplify(
    indices,
    positions,
    3,
    targetIndexCount,
    opts.error,
    // Regularize：让简化器产生形状更规则的三角形。
    // 实测（scripts/analyze-simplify.mjs，50 万面数字人 → 5 万）：
    // 超长边跨接三角形 3080 → 14，细长三角形 −71%，边界边保持 0（无破洞）。
    // 注意：绝不能在简化输出上事后删三角形 —— 减面网格里每个三角形都承担
    // 表面覆盖职责，删「拉丝」必留破洞（踩过的坑：filterSliverTriangles 导致
    // 模型坑坑洼洼）。拉丝要在简化阶段用 Regularize 预防，而不是事后补救。
    ['Regularize']
  )

  working.setIndex(new THREE.BufferAttribute(new Uint32Array(out), 1))
  // 单分段网格（GLTF 单材质常带一个全覆盖 group）：分段的 start/count 仍指向
  // 旧 index 范围，同步成简化后的长度，避免按旧 count 越界绘制
  if (working.groups.length === 1) {
    working.groups[0].start = 0
    working.groups[0].count = out.length
  }
  working.computeBoundingBox()
  working.computeBoundingSphere()
  return {
    geometry: working,
    triangles: out.length / 3,
    beforeTriangles: currentTris,
    error,
  }
}

/**
 * 遍历模型场景，对超过阈值的网格减面。
 * 返回处理后三角形总数。
 */
export async function simplifyModelScene(
  scene: THREE.Object3D,
  options: Partial<OptimizeOptions> = {}
): Promise<{ triangles: number; beforeTriangles: number; meshes: number }> {
  const opts = { ...defaultOptimizeOptions(), ...options }
  let triangles = 0
  let beforeTriangles = 0
  let meshes = 0

  const jobs: Promise<void>[] = []
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    meshes += 1
    const geo = mesh.geometry as THREE.BufferGeometry | undefined
    if (!geo) return
    const index = geo.getIndex()
    const pos = geo.getAttribute('position')
    const tris = index ? index.count / 3 : pos ? pos.count / 3 : 0
    beforeTriangles += tris
    if (tris <= opts.maxTriangles * 0.5) {
      triangles += tris
      return
    }
    jobs.push(
      simplifyGeometry(geo, opts).then((r) => {
        if (r.geometry !== geo) mesh.geometry = r.geometry
        triangles += r.triangles
      })
    )
  })

  await Promise.all(jobs)
  return { triangles: Math.round(triangles), beforeTriangles: Math.round(beforeTriangles), meshes }
}

/**
 * 把 THREE 场景导出为 GLB binary。
 */
export function exportSceneToGLB(
  scene: THREE.Object3D,
  animations: THREE.AnimationClip[] = []
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter()
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result)
        else if (result && typeof result === 'object' && 'data' in (result as { data?: unknown })) {
          // 极少版本会返回 { data, ... }
          resolve((result as { data: ArrayBuffer }).data)
        } else {
          reject(new Error('GLTF 导出返回了非 binary 结果'))
        }
      },
      (error) => reject(error),
      { binary: true, animations }
    )
  })
}

const TEXTURE_SLOTS = [
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

function hasValidImage(tex: unknown): boolean {
  if (!tex) return false
  const t = tex as THREE.Texture
  // 只有拿到真实像素（image 已就绪）才能被 GLTFExporter 编码；否则导出会抛错
  return Boolean(t.image) && Boolean((t.image as { width?: number }).width)
}

/**
 * FBX/OBJ 常引用外部贴图；若原始贴图文件缺失，材质上会残留一个 image 为 undefined
 * 的 Texture，导致 GLTFExporter 抛「No valid image data found」整个导出失败。
 * 这里在导出前把无有效像素的贴图从材质上摘掉，保证几何 + 骨骼动画仍能正常落盘，
 * 之后可在微信端再补贴图。
 */
function eachMaterial(scene: THREE.Object3D, cb: (mat: THREE.Material) => void): void {
  scene.traverse((obj) => {
    const withMaterial = obj as THREE.Mesh | THREE.Points
    if (
      !(withMaterial as THREE.Mesh).isMesh &&
      !(withMaterial as THREE.Points).isPoints
    ) {
      return
    }
    const materials = Array.isArray(withMaterial.material) ? withMaterial.material : [withMaterial.material]
    for (const mat of materials) if (mat) cb(mat)
  })
}

export function stripInvalidTextures(scene: THREE.Object3D): { removed: number } {
  let removed = 0
  eachMaterial(scene, (mat) => {
    const m = mat as THREE.Material & Record<string, unknown>
    for (const slot of TEXTURE_SLOTS) {
      const tex = m[slot]
      if (tex != null && !hasValidImage(tex)) {
        m[slot] = null
        removed += 1
      }
    }
    mat.needsUpdate = true
  })
  return { removed }
}

/** 统计能跟随模型进 GLB 的有效贴图数量 */
export function countValidTextures(scene: THREE.Object3D): number {
  const seen = new Set<object>()
  eachMaterial(scene, (mat) => {
    const m = mat as THREE.Material & Record<string, unknown>
    for (const slot of TEXTURE_SLOTS) {
      if (hasValidImage(m[slot])) seen.add(m[slot] as object)
    }
  })
  return seen.size
}

/**
 * 把超过 maxTextureSize 的贴图降采样到限制内。
 *
 * FBX 常内嵌 2K/4K PBR 贴图（本例 4 张合计 28MB），直接进 GLB 会到 40MB+，
 * 微信小程序主包只有 4MB、贴图红线 1024。这里用 canvas 缩小后替换原贴图，
 * 保留 colorSpace / flipY / uv 变换等属性，保证导出后显示一致。
 */
export function downscaleTextures(scene: THREE.Object3D, maxSize: number): { downsized: number } {
  let downsized = 0
  const cache = new Map<THREE.Texture, THREE.Texture>()
  eachMaterial(scene, (mat) => {
    const m = mat as THREE.Material & Record<string, unknown>
    for (const slot of TEXTURE_SLOTS) {
      const tex = m[slot] as THREE.Texture | null | undefined
      if (!tex || !hasValidImage(tex)) continue
      // KTX2/Basis 压缩纹理的 image 不是 CanvasImageSource（是带 mipmaps 的
      // 描述对象），drawImage 会直接抛错中断整个优化，必须跳过
      if ((tex as unknown as { isCompressedTexture?: boolean }).isCompressedTexture) continue
      const replaced = cache.get(tex)
      if (replaced) {
        m[slot] = replaced
        continue
      }
      const image = tex.image as { width: number; height: number }
      const maxSide = Math.max(image.width, image.height)
      if (maxSide <= maxSize) continue
      const scale = maxSize / maxSide
      const w = Math.max(1, Math.round(image.width * scale))
      const h = Math.max(1, Math.round(image.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(tex.image as CanvasImageSource, 0, 0, w, h)
      const small = new THREE.Texture(canvas)
      small.flipY = tex.flipY
      small.colorSpace = tex.colorSpace
      small.wrapS = tex.wrapS
      small.wrapT = tex.wrapT
      small.offset.copy(tex.offset)
      small.repeat.copy(tex.repeat)
      small.rotation = tex.rotation
      small.center.copy(tex.center)
      if ('channel' in tex) (small as unknown as { channel: number }).channel = (tex as unknown as { channel: number }).channel
      small.needsUpdate = true
      cache.set(tex, small)
      m[slot] = small
      downsized += 1
    }
  })
  return { downsized }
}

/**
 * 一站式：加载 -> 减面 -> 导出优化 GLB。
 * 适合 FBX / OBJ / 大 GLB 在浏览器里快速生成可跑版本。
 */
export async function optimizeModelToGLB(
  loaded: LoadedModel,
  options: Partial<OptimizeOptions> = {}
): Promise<{
  glb: ArrayBuffer
  beforeTriangles: number
  afterTriangles: number
  meshes: number
  removedTextures: number
  downsizedTextures: number
}> {
  const opts = { ...defaultOptimizeOptions(), ...options }
  const stats = await simplifyModelScene(loaded.scene, opts)
  // 外部贴图缺失时先摘掉无像素的贴图，否则 GLTFExporter 会整体失败
  const stripResult = stripInvalidTextures(loaded.scene)
  // 超大贴图降采样（微信红线 1024），否则内嵌 4K PNG 会让 GLB 达 40MB+
  const downResult = downscaleTextures(loaded.scene, opts.maxTextureSize)
  // 减面会改变包围盒，导出前统一「落地 + 居中 + 归一化」，保证进微信后同样脚踩地面
  normalizeModelToGround(loaded.scene)
  const glb = await exportSceneToGLB(loaded.scene, loaded.animations)
  return {
    glb,
    beforeTriangles: stats.beforeTriangles,
    afterTriangles: stats.triangles,
    meshes: stats.meshes,
    removedTextures: stripResult.removed,
    downsizedTextures: downResult.downsized,
  }
}
