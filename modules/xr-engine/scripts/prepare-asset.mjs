/**
 * 资产准备管线：FBX/GLB -> 移动端 AR 可用的 GLB
 *
 * 用法：
 *   node scripts/prepare-asset.mjs <输入文件> [--out 输出目录] [--ratio 0.35] [--name 名字]
 *
 * 流程：
 *   1. FBX 先经 Blender 无头清洗（减面 / 限权重 / 骨骼去前缀 / 导出 GLB）
 *   2. gltf-transform 做几何优化（焊接 / 去重 / 剪枝 / 量化 / 合并）
 *   3. 输出体积与性能预算报告，超出移动端红线会警告
 *
 * Blender 只在处理 FBX 时必需；输入已经是 GLB 的话可以没有 Blender。
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

// ---------------------------------------------------------------- 参数

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
  console.error('用法: node scripts/prepare-asset.mjs <输入文件> [--out 目录] [--ratio 0.35] [--name 名字]')
  process.exit(1)
}

const inputPath = resolve(input)
if (!existsSync(inputPath)) {
  console.error(`输入文件不存在: ${inputPath}`)
  process.exit(1)
}

const outDir = resolve(flags.out ?? join(root, 'public', 'assets', 'models'))
const ratio = Number.parseFloat(flags.ratio ?? '0.35')
const name = flags.name ?? basename(inputPath, extname(inputPath))
const maxTexture = Number.parseInt(flags.maxTexture ?? '1024', 10)

mkdirSync(outDir, { recursive: true })

// ---------------------------------------------------------------- 找 Blender

function findBlender() {
  if (process.env.BLENDER_PATH && existsSync(process.env.BLENDER_PATH)) {
    return process.env.BLENDER_PATH
  }
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const found = execFileSync(cmd, ['blender'], { encoding: 'utf8' }).split(/\r?\n/)[0]?.trim()
    if (found && existsSync(found)) return found
  } catch {
    // PATH 里没有，继续找安装目录
  }
  if (process.platform === 'win32') {
    const roots = ['C:\\Program Files\\Blender Foundation', 'D:\\Program Files\\Blender Foundation']
    for (const base of roots) {
      if (!existsSync(base)) continue
      for (const dir of readdirSync(base)) {
        const candidate = join(base, dir, 'blender.exe')
        if (existsSync(candidate)) return candidate
      }
    }
  }
  return null
}

// ---------------------------------------------------------------- 第一步：FBX -> GLB

let workingFile = inputPath
const ext = extname(inputPath).toLowerCase()

if (['.fbx', '.obj', '.dae'].includes(ext)) {
  const blender = findBlender()
  if (!blender) {
    console.error(`
需要 Blender 才能转换 ${ext} 文件，但没找到。

安装方式（任选其一）：
  winget install Blender.Blender
  或到 https://www.blender.org/download/ 下载

装好后可以设环境变量指定路径：
  $env:BLENDER_PATH = "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe"

如果手头已有 GLB，直接跑本脚本即可，不需要 Blender。
`)
    process.exit(1)
  }

  const rawGlb = join(outDir, `${name}.raw.glb`)
  console.log(`[1/2] Blender 清洗：${basename(inputPath)} (减面比例 ${ratio})`)

  const result = spawnSync(
    blender,
    ['-b', '-P', join(root, 'scripts', 'blender-clean.py'), '--',
     `src=${inputPath}`, `dst=${rawGlb}`, `ratio=${ratio}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  )

  if (result.stdout) console.log(result.stdout.trim())
  if (result.status !== 0) {
    console.error('Blender 执行失败：')
    console.error(result.stderr || result.stdout)
    process.exit(1)
  }
  workingFile = rawGlb
} else {
  console.log(`[1/2] 跳过 Blender（输入已是 ${ext}）`)
}

// ---------------------------------------------------------------- 第二步：几何优化

console.log('[2/2] gltf-transform 优化…')

const { NodeIO } = await import('@gltf-transform/core')
const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
// join 与 node:path 的 join 撞名，起个别名
const { dedup, flatten, join: joinPrimitives, prune, quantize, weld } =
  await import('@gltf-transform/functions')

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const document = await io.read(workingFile)

const before = { ...collectStats(document), bytes: statSync(workingFile).size }

await document.transform(
  weld(),
  dedup(),
  prune({ keepAttributes: false, keepIndices: false }),
  flatten(),
  joinPrimitives(),
  quantize({ pattern: /^(POSITION|NORMAL|TEXCOORD)/ })
)

// 贴图降分辨率。
// gltf-transform v4 没有 textureResize，这里直接用 sharp 逐张处理。
// sharp 是可选依赖，没有就跳过而不是让整条管线挂掉。
let resizedTextures = 0
try {
  const sharp = (await import('sharp')).default
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage()
    if (!image) continue
    const meta = await sharp(image).metadata()
    if (!meta.width || meta.width <= maxTexture) continue
    const buffer = await sharp(image)
      .resize(maxTexture, maxTexture, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    texture.setImage(buffer).setMimeType('image/png')
    resizedTextures += 1
  }
  if (resizedTextures) console.log(`      贴图降分辨率：${resizedTextures} 张 -> 最长边 ${maxTexture}px`)
} catch {
  console.log('      (sharp 不可用，跳过贴图降分辨率；如需请 npm i -D sharp)')
}

const outputPath = join(outDir, `${name}.glb`)
await io.write(outputPath, document)

const after = { ...collectStats(document), bytes: statSync(outputPath).size }

// 中间产物用完即删
if (workingFile !== inputPath && existsSync(workingFile)) {
  unlinkSync(workingFile)
}

// ---------------------------------------------------------------- 统计

function collectStats(doc) {
  let triangles = 0
  let vertices = 0
  let meshes = 0

  for (const mesh of doc.getRoot().listMeshes()) {
    meshes += 1
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices()
      const position = prim.getAttribute('POSITION')
      if (indices) triangles += indices.getCount() / 3
      else if (position) triangles += position.getCount() / 3
      if (position) vertices += position.getCount()
    }
  }

  let bones = 0
  for (const skin of doc.getRoot().listSkins()) {
    bones = Math.max(bones, skin.listJoints().length)
  }

  return {
    triangles: Math.round(triangles),
    vertices,
    meshes,
    materials: doc.getRoot().listMaterials().length,
    textures: doc.getRoot().listTextures().length,
    skins: doc.getRoot().listSkins().length,
    bones,
    animations: doc.getRoot().listAnimations().length,
  }
}

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// 量化对小模型反而可能增大大体积（buffer 对齐），所以带上正负号，别让人误读
const pct = (a, b) => {
  if (!b) return '—'
  const delta = ((a - b) / b) * 100
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`
}

console.log(`
  输出: ${outputPath}

  体积      ${formatBytes(before.bytes)}  ->  ${formatBytes(after.bytes)}   (${pct(after.bytes, before.bytes)})
  三角面    ${before.triangles.toLocaleString()}  ->  ${after.triangles.toLocaleString()}
  顶点      ${before.vertices.toLocaleString()}  ->  ${after.vertices.toLocaleString()}
  网格      ${after.meshes}
  材质      ${after.materials}
  贴图      ${after.textures}
  骨骼      ${after.bones}  (蒙皮 ${after.skins})
  动画      ${after.animations} 段
`)

// 移动端 AR 红线
const issues = []
if (after.triangles > 25_000) issues.push(`三角面 ${after.triangles.toLocaleString()} 超过 25K`)
if (after.bones > 32) issues.push(`骨骼 ${after.bones} 根超过 32`)
if (after.materials > 8) issues.push(`材质 ${after.materials} 个超过 8`)
if (after.textures > 6) issues.push(`贴图 ${after.textures} 张超过 6`)
if (after.bytes > 5 * 1024 * 1024) issues.push(`体积 ${formatBytes(after.bytes)} 超过 5MB`)

if (issues.length) {
  console.log('  ⚠ 超出移动端 AR 建议：')
  for (const issue of issues) console.log(`    - ${issue}`)
  console.log('\n  可以调大减面比例重跑：--ratio 0.2')
} else {
  console.log('  ✓ 符合移动端 AR 性能预算')
}
