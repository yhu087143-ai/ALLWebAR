/**
 * 减面算法诊断脚本（Node 环境）。
 *
 * 在真实 FBX 上量化对比几种减面策略：
 *  A. 当前线上管线：simplify + filterSliverTriangles（用户报告：破洞遍布）
 *  B. 纯 simplify 输出（用户说的「原来那个」：拉丝但无破洞）
 *  C. B + Regularize flag（官方：产生更规则的三角形，改善蒙皮形变质量）
 *  D. 先按位置焊接顶点再 simplify + Regularize（官方要求：重复顶点会让简化器卡住）
 *
 * 指标：
 *  - boundary edges（只被 1 个三角形引用的边）：封闭网格上 >0 即破洞
 *  - sliver（细长三角形，area/maxEdge² < 0.05）：拉丝的直接来源
 *  - longEdge 三角形（最长边 > 原始最长边）：减面新造的长边
 *  - triangles：结果面数
 */
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { MeshoptSimplifier } from 'meshoptimizer/simplifier'

// ---- Node 环境垫片：FBXLoader 解析内嵌贴图时会碰 DOM API，只关心几何，让它异步失败即可 ----
if (typeof document === 'undefined') {
  const fakeImg = () => ({
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    set src(v) {}, get src() { return '' },
  })
  globalThis.document = {
    createElementNS: () => fakeImg(),
    createElement: () => fakeImg(),
  }
  globalThis.window = globalThis
  globalThis.self = globalThis
}
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => 'blob:noop'
  globalThis.URL.revokeObjectURL = () => {}
}

// ---- 几何统计工具 ----

/** 位置唯一化：返回 remap 数组（顶点 -> 规范顶点）与唯一顶点数 */
function positionRemap(positions) {
  const map = new Map()
  const remap = new Uint32Array(positions.length / 3)
  let next = 0
  for (let i = 0; i < positions.length; i += 3) {
    const key = `${positions[i]},${positions[i + 1]},${positions[i + 2]}`
    const found = map.get(key)
    if (found === undefined) {
      map.set(key, next)
      remap[i / 3] = next
      next++
    } else {
      remap[i / 3] = found
    }
  }
  return { remap, unique: next }
}

/** 统计网格：三角数、边界边、连通分量、细长三角形、超长边三角形 */
function meshStats(indices, positions, originalMaxEdge, sliverRatio = 0.05) {
  const remap = positionRemap(positions)
  const nUnique = remap.unique
  const edgeCount = new Map()
  const parent = new Int32Array(nUnique).fill(-1)
  const find = (x) => { while (parent[x] >= 0) x = parent[x]; return x }
  const union = (a, b) => {
    a = find(a); b = find(b)
    if (a !== b) parent[a] = b
  }

  let tris = 0
  let slivers = 0
  let longEdgeTris = 0
  const area = (a, b, c) => {
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2]
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
    return 0.5 * Math.hypot(cx, cy, cz)
  }
  const dist = (a, b) => Math.hypot(positions[a] - positions[b], positions[a + 1] - positions[b + 1], positions[a + 2] - positions[b + 2])

  for (let i = 0; i < indices.length; i += 3) {
    const ia = remap.remap[indices[i]], ib = remap.remap[indices[i + 1]], ic = remap.remap[indices[i + 2]]
    if (ia === ib || ib === ic || ia === ic) continue // 退化三角形不计
    tris++
    union(ia, ib); union(ib, ic)
    for (const [u, v] of [[ia, ib], [ib, ic], [ic, ia]]) {
      const key = u < v ? u * nUnique + v : v * nUnique + u
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1)
    }
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3
    const e1 = dist(a, b), e2 = dist(b, c), e3 = dist(c, a)
    const maxEdge = Math.max(e1, e2, e3)
    const ar = area(a, b, c)
    if (maxEdge > 0 && ar / (maxEdge * maxEdge) < sliverRatio) slivers++
    if (originalMaxEdge > 0 && maxEdge > originalMaxEdge) longEdgeTris++
  }

  let boundary = 0
  for (const count of edgeCount.values()) if (count === 1) boundary++

  const roots = new Set()
  for (let i = 0; i < nUnique; i++) if (parent[i] === -1) roots.add(i)

  return { tris, boundaryEdges: boundary, slivers, longEdgeTris, components: roots.size, rawVertices: positions.length / 3, uniqueVertices: nUnique }
}

function computeMaxEdge(indices, positions) {
  let maxEdge = 0
  for (let i = 0; i < indices.length; i += 3) {
    for (const [i1, i2] of [[0, 1], [1, 2], [2, 0]]) {
      const a = indices[i + i1] * 3, b = indices[i + i2] * 3
      const d = Math.hypot(positions[a] - positions[b], positions[a + 1] - positions[b + 1], positions[a + 2] - positions[b + 2])
      if (d > maxEdge) maxEdge = d
    }
  }
  return maxEdge
}

/** 复刻线上 filterSliverTriangles */
function filterSliverTriangles(indices, positions, edgeLimit, sliverRatio) {
  const out = new Uint32Array(indices.length)
  let write = 0
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2]
    const ar = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
    const maxEdge = Math.max(
      Math.hypot(positions[a] - positions[b], positions[a + 1] - positions[b + 1], positions[a + 2] - positions[b + 2]),
      Math.hypot(positions[b] - positions[c], positions[b + 1] - positions[c + 1], positions[b + 2] - positions[c + 2]),
      Math.hypot(positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]),
    )
    if (maxEdge > edgeLimit && ar / (maxEdge * maxEdge) < sliverRatio) continue
    out[write++] = indices[i]; out[write++] = indices[i + 1]; out[write++] = indices[i + 2]
  }
  return out.subarray(0, write)
}

// ---- 主流程 ----
await MeshoptSimplifier.ready

const buf = readFileSync('public/samples/demo-character.fbx')
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const fbx = new FBXLoader().parse(ab, '')

const meshes = []
fbx.traverse((o) => { if (o.isMesh) meshes.push(o) })

const RATIO = 0.3
const MAX_TRIS = 50000
const ERROR = 0.01

for (const mesh of meshes) {
  let geo = mesh.geometry
  if (!geo.getIndex()) {
    const { mergeVertices } = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
    geo = mergeVertices(geo, 1e-4)
  }
  const index = new Uint32Array(geo.getIndex().array)
  const positions = new Float32Array(geo.getAttribute('position').array)
  const currentTris = index.length / 3
  const targetTris = Math.max(64, Math.min(currentTris * RATIO, MAX_TRIS, currentTris))
  const targetIndexCount = Math.max(3, Math.floor(targetTris) * 3)
  const originalMaxEdge = computeMaxEdge(index, positions)
  const dupFactor = (positions.length / 3 / positionRemap(positions).unique).toFixed(2)

  const before = meshStats(index, positions, originalMaxEdge)
  console.log(`\n=== ${mesh.name || '(unnamed)'} ===`)
  console.log(`原始: ${before.tris} tris, 顶点 ${before.rawVertices}（位置唯一 ${before.uniqueVertices}，重复 ${dupFactor}x）, 边界边 ${before.boundaryEdges}, 连通分量 ${before.components}, 最长边 ${originalMaxEdge.toFixed(4)}`)

  const report = (label, indices) => {
    const s = meshStats(indices, positions, originalMaxEdge)
    const newHoles = s.boundaryEdges - before.boundaryEdges
    console.log(`${label.padEnd(28)} tris=${String(s.tris).padStart(6)}  边界边=${String(s.boundaryEdges).padStart(6)}(新增破洞边 ${newHoles >= 0 ? '+' : ''}${newHoles})  细长三角形=${String(s.slivers).padStart(5)}  超长边三角形=${String(s.longEdgeTris).padStart(5)}`)
  }

  // A. 当前线上管线：simplify + sliver 过滤
  const [outA] = MeshoptSimplifier.simplify(index, positions, 3, targetIndexCount, ERROR)
  const filteredA = filterSliverTriangles(outA, positions, originalMaxEdge * 1.5, 0.05)
  report('A 当前管线(过滤拉丝)', filteredA)

  // B. 纯 simplify（原来的版本）
  report('B 纯 simplify', outA)

  // C. simplify + Regularize
  const [outC] = MeshoptSimplifier.simplify(index, positions, 3, targetIndexCount, ERROR, ['Regularize'])
  report('C simplify+Regularize', outC)

  // D. 先按位置焊接 index，再 simplify+Regularize（属性顶点保留，index 指向规范顶点）
  const remap = positionRemap(positions).remap
  const welded = new Uint32Array(index.length)
  for (let i = 0; i < index.length; i++) welded[i] = remap[index[i]]
  const [outD] = MeshoptSimplifier.simplify(welded, positions, 3, targetIndexCount, ERROR, ['Regularize'])
  report('D 焊接+simplify+Regularize', outD)

  // E. 同 D，但用极端压缩（0.1）看看拉丝是否本质上是压缩率问题
  const targetE = Math.max(3, Math.floor(Math.max(64, Math.min(currentTris * 0.1, MAX_TRIS, currentTris))) * 3)
  const [outE] = MeshoptSimplifier.simplify(welded, positions, 3, targetE, ERROR, ['Regularize'])
  report('E 焊接+Regularize(10%)', outE)
}

console.log('\n指标说明：边界边>0 在封闭网格上=破洞；细长三角形=拉丝来源；超长边三角形=减面新造长边。')
