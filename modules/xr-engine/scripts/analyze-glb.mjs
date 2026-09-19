import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { fileURLToPath } from 'node:url'
import { statSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('用法: node .tmp-analyze.mjs <glb 路径>')
  process.exit(1)
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(path)

let triangles = 0
let vertices = 0
const meshInfo = []

for (const mesh of doc.getRoot().listMeshes()) {
  let meshTris = 0
  let meshVerts = 0
  const attributeSets = new Set()

  for (const prim of mesh.listPrimitives()) {
    const indices = prim.getIndices()
    const position = prim.getAttribute('POSITION')
    const count = indices ? indices.getCount() : position ? position.getCount() : 0
    meshTris += count / 3
    meshVerts += position ? position.getCount() : 0
    for (const semantic of prim.listSemantics()) attributeSets.add(semantic)
  }

  triangles += meshTris
  vertices += meshVerts
  meshInfo.push({
    name: mesh.getName() || '(匿名)',
    primitives: mesh.listPrimitives().length,
    triangles: Math.round(meshTris),
    vertices: meshVerts,
    attributes: Array.from(attributeSets).join(', '),
  })
}

console.log(`\n=== ${path.split(/[\\/]/).pop()} ===`)
console.log(`文件体积:  ${(statSync(path).size / 1024 / 1024).toFixed(2)} MB`)
console.log(`三角面:    ${Math.round(triangles).toLocaleString()}`)
console.log(`顶点:      ${vertices.toLocaleString()}`)
console.log(`网格数:    ${doc.getRoot().listMeshes().length}`)
console.log(`材质数:    ${doc.getRoot().listMaterials().length}`)
console.log(`贴图数:    ${doc.getRoot().listTextures().length}`)
console.log(`动画数:    ${doc.getRoot().listAnimations().length}`)

let bones = 0
for (const skin of doc.getRoot().listSkins()) {
  bones = Math.max(bones, skin.listJoints().length)
}
console.log(`骨骼数:    ${bones}`)

console.log('\n--- 网格 ---')
for (const m of meshInfo) {
  console.log(`  ${m.name}: ${m.triangles.toLocaleString()} 面 / ${m.vertices.toLocaleString()} 顶点`)
  console.log(`    属性: ${m.attributes}`)
}

console.log('\n--- 贴图 ---')
for (const tex of doc.getRoot().listTextures()) {
  const size = tex.getSize()
  const bytes = tex.getImage()?.byteLength ?? 0
  console.log(
    `  ${tex.getName() || '(匿名)'}: ${size ? `${size[0]}x${size[1]}` : '?'} · ` +
      `${(bytes / 1024).toFixed(0)} KB · ${tex.getMimeType()}`
  )
}

console.log('\n--- 动画 ---')
for (const anim of doc.getRoot().listAnimations()) {
  let duration = 0
  const channels = anim.listChannels().length
  for (const sampler of anim.listSamplers()) {
    const input = sampler.getInput()
    if (input) {
      const arr = input.getArray()
      if (arr && arr.length) duration = Math.max(duration, arr[arr.length - 1])
    }
  }
  console.log(`  ${anim.getName() || '(匿名)'}: ${duration.toFixed(2)}s · ${channels} 通道`)
}

console.log('\n--- 材质 ---')
for (const mat of doc.getRoot().listMaterials()) {
  console.log(
    `  ${mat.getName() || '(匿名)'}: metalness=${mat.getMetallicFactor()} ` +
      `roughness=${mat.getRoughnessFactor()}`
  )
}
