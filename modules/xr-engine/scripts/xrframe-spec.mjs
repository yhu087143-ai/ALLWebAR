/**
 * 微信小程序 xr-frame 的 GLTF 规范检查。
 *
 * 限制来源（微信官方文档 + 社区实测）：
 *   https://developers.weixin.qq.com/miniprogram/dev/component/xr-frame/gltf/specification.html
 *
 * 硬限制（违反会渲染失败或异常）：
 *   - 顶点 UV ≤ 2 个
 *   - 顶点 JOINTS ≤ 1 个、WEIGHTS ≤ 1 个
 *   - 不使用 sparse accessor
 *   - accessor 的 normalized 不为 true
 *   - morph targets ≤ 8 个
 *   - 图元类型不能是 LINE_LOOP 或 TRIANGLE_FAN
 *   - 每个 Mesh 只支持 1 个 SubMesh（即 1 个 primitive）
 *   - 每个蒙皮修改器骨骼上限 75 根
 *
 * 单独使用：
 *   node scripts/xrframe-spec.mjs <glb 路径>
 */

const MODE_NAMES = {
  0: 'POINTS',
  1: 'LINES',
  2: 'LINE_LOOP',
  3: 'LINE_STRIP',
  4: 'TRIANGLES',
  5: 'TRIANGLE_STRIP',
  6: 'TRIANGLE_FAN',
}

// 中端安卓机的经验安全线，超过就要么加载慢要么掉帧
const BUDGET = {
  triangles: 30_000,
  vertices: 30_000,
  textures: 3,
  textureSize: 1024,
  bytes: 5 * 1024 * 1024,
  bones: 75,
}

export function checkXRFrame(doc) {
  const errors = []
  const warnings = []
  const info = {
    triangles: 0,
    vertices: 0,
    meshes: 0,
    primitives: 0,
    materials: 0,
    textures: 0,
    bones: 0,
    animations: 0,
    morphTargets: 0,
  }

  // ---------------------------------------------------------- accessor 级检查

  for (const accessor of doc.getRoot().listAccessors()) {
    if (accessor.getSparse()) {
      errors.push('accessor 使用了 sparse accessor（xr-frame 不支持）')
    }
    if (accessor.getNormalized()) {
      errors.push('accessor 的 normalized 为 true（xr-frame 不支持）')
    }
  }

  // ---------------------------------------------------------- 图元级检查

  for (const mesh of doc.getRoot().listMeshes()) {
    info.meshes += 1
    const primitives = mesh.listPrimitives()
    info.primitives += primitives.length

    if (primitives.length > 1) {
      errors.push(
        `Mesh「${mesh.getName() || '(匿名)'}」有 ${primitives.length} 个 SubMesh，` +
          `xr-frame 每个 Mesh 仅支持 1 个`
      )
    }

    for (const prim of primitives) {
      const semantics = prim.listSemantics()

      const uvs = semantics.filter((s) => s.startsWith('TEXCOORD_')).length
      if (uvs > 2) errors.push(`顶点 UV 有 ${uvs} 组，超过上限 2`)

      const joints = semantics.filter((s) => s.startsWith('JOINTS_')).length
      if (joints > 1) errors.push(`顶点 JOINTS 有 ${joints} 组，超过上限 1`)

      const weights = semantics.filter((s) => s.startsWith('WEIGHTS_')).length
      if (weights > 1) errors.push(`顶点 WEIGHTS 有 ${weights} 组，超过上限 1`)

      const mode = prim.getMode()
      if (mode === 2 || mode === 6) {
        errors.push(`图元类型为 ${MODE_NAMES[mode]}（xr-frame 不支持）`)
      }

      const targets = prim.listTargets().length
      info.morphTargets += targets
      if (targets > 8) {
        errors.push(`morph target 有 ${targets} 个，超过上限 8`)
      }
      // 文档特别说明：一个同时带 POSITION 和 NORMAL 的 target 算 2 个
      if (targets > 4) {
        warnings.push(
          `morph target ${targets} 个 —— 若每个 target 同时含 POSITION 和 NORMAL，` +
            `在 xr-frame 中按双倍计算，会突破 8 的上限`
        )
      }

      const position = prim.getAttribute('POSITION')
      const indices = prim.getIndices()
      const count = indices ? indices.getCount() : position ? position.getCount() : 0
      info.triangles += count / 3
      if (position) info.vertices += position.getCount()
    }
  }

  info.triangles = Math.round(info.triangles)

  // ---------------------------------------------------------- 骨骼

  for (const skin of doc.getRoot().listSkins()) {
    const joints = skin.listJoints().length
    info.bones = Math.max(info.bones, joints)
    if (joints > BUDGET.bones) {
      errors.push(`蒙皮骨骼 ${joints} 根，超过上限 ${BUDGET.bones}，可能出现异常拉伸`)
    }
  }

  // ---------------------------------------------------------- 材质与贴图

  info.materials = doc.getRoot().listMaterials().length
  info.textures = doc.getRoot().listTextures().length

  for (const texture of doc.getRoot().listTextures()) {
    const size = texture.getSize()
    if (size && Math.max(size[0], size[1]) > BUDGET.textureSize) {
      warnings.push(
        `贴图「${texture.getName() || '(匿名)'}」${size[0]}x${size[1]}，` +
          `建议压到 ${BUDGET.textureSize} 以内`
      )
    }
  }

  // ---------------------------------------------------------- 动画

  info.animations = doc.getRoot().listAnimations().length
  if (info.animations > 0) {
    warnings.push(
      'xr-frame 无法把一个 GLB 的动画应用到另一个 GLB —— 所有动作必须烘焙进同一个文件'
    )
  }

  // ---------------------------------------------------------- 性能预算

  if (info.triangles > BUDGET.triangles) {
    warnings.push(
      `三角面 ${info.triangles.toLocaleString()} 超过中端机安全线 ` +
        `${BUDGET.triangles.toLocaleString()}`
    )
  }
  if (info.textures > BUDGET.textures) {
    warnings.push(`贴图 ${info.textures} 张，建议合并到 ${BUDGET.textures} 张以内`)
  }

  // ---------------------------------------------------------- 扩展提示

  const extensionsUsed = doc
    .getRoot()
    .listExtensionsUsed()
    .map((ext) => ext.extensionName)

  if (extensionsUsed.includes('KHR_draco_mesh_compression')) {
    warnings.push(
      'KHR_draco_mesh_compression 需要基础库 2.32.1+，且**仅限真机** —— ' +
        '开发者工具里加载会失败，调试时请准备一份未压缩的版本'
    )
  }
  if (extensionsUsed.includes('WX_compress_textures')) {
    warnings.push('WX_compress_textures 需要基础库 3.0.1+，且必须配合 xr-frame-toolkit 生成')
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], info, pass: errors.length === 0 }
}

export function formatReport(result, bytes, filePath) {
  const { errors, warnings, info } = result
  const lines = []

  lines.push(`\n=== xr-frame 合规检查: ${filePath.split(/[\\/]/).pop()} ===`)
  if (bytes) {
    const mb = bytes / 1024 / 1024
    lines.push(`体积        ${mb.toFixed(2)} MB${mb > 5 ? '  (建议 ≤5MB)' : ''}`)
  }
  lines.push(
    `三角面      ${info.triangles.toLocaleString()} / 顶点 ${info.vertices.toLocaleString()}`
  )
  lines.push(`网格        ${info.meshes}（primitive ${info.primitives}）`)
  lines.push(`材质        ${info.materials} / 贴图 ${info.textures}`)
  lines.push(`骨骼        ${info.bones} / 动画 ${info.animations} 段`)
  if (info.morphTargets) lines.push(`Morph       ${info.morphTargets} 个 target`)

  if (errors.length) {
    lines.push('\n✗ 不合规（必须修）：')
    for (const e of errors) lines.push(`  - ${e}`)
  }
  if (warnings.length) {
    lines.push('\n⚠ 建议优化：')
    for (const w of warnings) lines.push(`  - ${w}`)
  }
  if (!errors.length && !warnings.length) {
    lines.push('\n✓ 完全符合 xr-frame 规范，且各项都在中端机安全线内')
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------- CLI

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())

if (isDirectRun) {
  const target = process.argv[2]
  if (!target) {
    console.error('用法: node scripts/xrframe-spec.mjs <glb 路径>')
    process.exit(1)
  }

  const { NodeIO } = await import('@gltf-transform/core')
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
  const { statSync } = await import('node:fs')

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const document = await io.read(target)

  const result = checkXRFrame(document)
  console.log(formatReport(result, statSync(target).size, target))
  process.exit(result.pass ? 0 : 1)
}
