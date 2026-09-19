import { WebIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, join, prune, quantize, weld } from '@gltf-transform/functions'

export interface OptimizeOptions {
  /** 焊接重合顶点 */
  weld: boolean
  /** 去重几何体 / 材质 / 贴图 */
  dedup: boolean
  /** 剪除未被引用的资源 */
  prune: boolean
  /** 量化顶点属性（有精度损失，但体积显著下降） */
  quantize: boolean
  /** 扁平化节点层级 */
  flatten: boolean
  /** 合并同材质的 primitive，减少 draw call */
  join: boolean
}

export const defaultOptimizeOptions = (): OptimizeOptions => ({
  weld: true,
  dedup: true,
  prune: true,
  quantize: true,
  flatten: true,
  join: true,
})

export interface OptimizeResult {
  data: Uint8Array
  before: number
  after: number
}

/**
 * 浏览器端的几何优化。
 *
 * 这里只做纯 JS 能完成的变换；Draco/meshopt 压缩与 KTX2 纹理转码
 * 需要 wasm 编解码器，交给后端服务处理（见 server/）。
 */
export async function optimizeGLB(
  input: Uint8Array,
  options: Partial<OptimizeOptions> = {}
): Promise<OptimizeResult> {
  const opts = { ...defaultOptimizeOptions(), ...options }
  const io = new WebIO().registerExtensions(ALL_EXTENSIONS)

  const document = await io.readBinary(input)
  const transforms = []

  if (opts.weld) transforms.push(weld())
  if (opts.dedup) transforms.push(dedup())
  if (opts.prune) transforms.push(prune({ keepAttributes: false, keepIndices: false }))
  if (opts.flatten) transforms.push(flatten())
  // join() 才是合并同材质 primitive 的 Transform 版本；
  // joinPrimitives() 是底层函数，需要手动传 prims 数组
  if (opts.join) transforms.push(join())
  if (opts.quantize) transforms.push(quantize({ pattern: /^(POSITION|NORMAL|TEXCOORD)/ }))

  if (transforms.length) await document.transform(...transforms)

  const after = await io.writeBinary(document)
  return { data: after, before: input.byteLength, after: after.byteLength }
}

/**
 * 移动端 AR 的性能预算检查。
 * 超过阈值会在 UI 上给出警告，避免真机上一跑就掉到个位数帧率。
 */
export interface BudgetReport {
  triangles: number
  textures: number
  materials: number
  issues: string[]
}

export function checkARBudget(stats: {
  triangles: number
  textures: number
  materials: number
}): BudgetReport {
  const issues: string[] = []
  if (stats.triangles > 100_000) {
    issues.push(`三角面 ${stats.triangles.toLocaleString()} 超过 AR 建议上限 10 万，需减面`)
  }
  if (stats.materials > 8) {
    issues.push(`材质数 ${stats.materials} 过多，建议合并以减少 draw call`)
  }
  if (stats.textures > 6) {
    issues.push(`贴图数 ${stats.textures} 过多，建议合图或降级分辨率`)
  }
  return { ...stats, issues }
}
