/**
 * 微信小程序 AR 资产优化流水线。
 *
 * 用法：
 *   node scripts/prepare-miniapp.mjs <输入.glb> [--out 目录] [--ratio 0.35]
 *       [--texture-size 512] [--texture-format webp] [--draco]
 *
 * 相比 prepare-asset.mjs，这个脚本专门针对微信小程序的约束：
 *   1. 用 meshoptimizer 减面（不需要 Blender）
 *   2. 贴图压到 WebP 并降分辨率 —— PNG 是体积大头
 *   3. 输出后自动跑 xr-frame 合规检查
 *   4. 可选 Draco（注意：微信开发者工具加载不了 Draco，只有真机行）
 */

import { existsSync, mkdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i += 1
      } else {
        flags[key] = 'true'
      }
    } else {
      positional.push(token)
    }
  }
  return { positional, flags }
}

const { positional, flags } = parseArgs(process.argv.slice(2))
const input = positional[0]

if (!input) {
  console.error(
    '用法: node scripts/prepare-miniapp.mjs <输入.glb> [--out 目录] [--ratio 0.35] ' +
      '[--texture-size 512] [--texture-format webp] [--draco]'
  )
  process.exit(1)
}

const inputPath = resolve(input)
if (!existsSync(inputPath)) {
  console.error(`输入文件不存在: ${inputPath}`)
  process.exit(1)
}

const outDir = resolve(flags.out ?? join(dirname(inputPath), 'miniapp'))
const ratio = Number.parseFloat(flags.ratio ?? '0.35')
// 误差阈值：越小越保真，但也越难达到目标 ratio。
// 角色这类有机形体可以到 0.003，硬表面模型建议保持 0.001。
const error = Number.parseFloat(flags.error ?? '0.001')
const textureSize = Number.parseInt(flags.textureSize ?? '512', 10)
const textureFormat = flags['texture-format'] ?? 'webp'
const useDraco = flags.draco === 'true'
const name = flags.name ?? basename(inputPath, extname(inputPath))

mkdirSync(outDir, { recursive: true })

const { NodeIO } = await import('@gltf-transform/core')
const { ALL_EXTENSIONS, KHRDracoMeshCompression } = await import('@gltf-transform/extensions')
const { dedup, draco, prune, resample, simplify, weld } = await import(
  '@gltf-transform/functions'
)
const { checkXRFrame, formatReport } = await import('./xrframe-spec.mjs')

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await import('draco3dgltf').then((m) => m.default ?? m).catch(() => null),
    'draco3d.decoder': await import('draco3dgltf').then((m) => m.default ?? m).catch(() => null),
  })

console.log(`[1/5] 读取 ${basename(inputPath)}`)
const document = await io.read(inputPath)

const before = {
  bytes: statSync(inputPath).size,
  ...collectStats(document),
}

// ---------------------------------------------------------------- 减面

console.log(`[2/5] 减面（保留 ${(ratio * 100).toFixed(0)}% 顶点）`)
const { MeshoptSimplifier } = await import('meshoptimizer/simplifier')
await MeshoptSimplifier.ready

await document.transform(
  // 先焊接重合顶点，减面算法才能正确识别拓扑
  weld(),
  simplify({
    simplifier: MeshoptSimplifier,
    ratio,
    error,
  })
)

// ---------------------------------------------------------------- 几何优化

console.log('[3/5] 几何优化（动画重采样 / 去重 / 剪枝）')
// 这里刻意不做 quantize：gltf-transform 的 quantize 会把 accessor 标成
// normalized=true 来还原定点数，而 xr-frame 明确不支持 normalized accessor。
// 两害相权，宁可体积大一点也要合规 —— 几何压缩改用 Draco（见 --draco）。
await document.transform(
  dedup(),
  resample(),
  prune({ keepAttributes: false, keepIndices: false })
)

// ---------------------------------------------------------------- 贴图

console.log(`[4/5] 贴图压缩 -> ${textureFormat} ${textureSize}px`)
let converted = 0
let savedBytes = 0

try {
  const sharp = (await import('sharp')).default
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage()
    if (!image) continue

    const beforeBytes = image.byteLength
    let pipeline = sharp(image)

    const meta = await sharp(image).metadata()
    if (meta.width && meta.width > textureSize) {
      pipeline = pipeline.resize(textureSize, textureSize, {
        fit: 'inside',
        withoutEnlargement: true,
      })
    }

    let buffer
    if (textureFormat === 'webp') {
      buffer = await pipeline.webp({ quality: 85 }).toBuffer()
    } else if (textureFormat === 'jpeg') {
      buffer = await pipeline.jpeg({ quality: 88 }).toBuffer()
    } else {
      buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer()
    }

    const mime =
      textureFormat === 'webp'
        ? 'image/webp'
        : textureFormat === 'jpeg'
          ? 'image/jpeg'
          : 'image/png'

    texture.setImage(buffer).setMimeType(mime)
    converted += 1
    savedBytes += beforeBytes - buffer.byteLength
  }
  console.log(
    `      处理 ${converted} 张，节省 ${(savedBytes / 1024).toFixed(0)} KB`
  )
} catch (err) {
  console.log(`      (贴图处理跳过: ${String(err).slice(0, 80)})`)
}

// ---------------------------------------------------------------- Draco

if (useDraco) {
  console.log('[5/5] Draco 压缩')
  console.log('      ⚠ 微信开发者工具加载不了 Draco，只有真机能跑，调试请留一份未压缩版')
  await document.transform(draco({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER }))
} else {
  console.log('[5/5] 跳过 Draco（加 --draco 可开启）')
}

// ---------------------------------------------------------------- 输出

const outputPath = join(outDir, `${name}.wx.glb`)
await io.write(outputPath, document)

const after = {
  bytes: statSync(outputPath).size,
  ...collectStats(document),
}

function collectStats(doc) {
  let triangles = 0
  let vertices = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices()
      const position = prim.getAttribute('POSITION')
      const count = indices ? indices.getCount() : position ? position.getCount() : 0
      triangles += count / 3
      if (position) vertices += position.getCount()
    }
  }
  return {
    triangles: Math.round(triangles),
    vertices,
    textures: doc.getRoot().listTextures().length,
    animations: doc.getRoot().listAnimations().length,
  }
}

const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`
const pct = (a, b) => {
  const d = ((a - b) / b) * 100
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`
}

console.log(`
  输出: ${outputPath}

  体积      ${mb(before.bytes)}  ->  ${mb(after.bytes)}   (${pct(after.bytes, before.bytes)})
  三角面    ${before.triangles.toLocaleString()}  ->  ${after.triangles.toLocaleString()}   (${pct(after.triangles, before.triangles)})
  顶点      ${before.vertices.toLocaleString()}  ->  ${after.vertices.toLocaleString()}
  贴图      ${after.textures} 张
  动画      ${after.animations} 段
`)

// ---------------------------------------------------------------- 合规检查

console.log(formatReport(checkXRFrame(document), after.bytes, outputPath))

if (after.bytes > 5 * 1024 * 1024) {
  console.log(`\n  仍超过 5MB，可以继续：--ratio 0.25 --texture-size 384`)
}
console.log('')
