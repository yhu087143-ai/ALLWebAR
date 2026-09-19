/**
 * 生成合成 3DGS 测试场景（INRIA binary PLY）：
 * 10m x 10m 地板 + 两面墙 + 三个彩色发光球，约 4 万个高斯点。
 * 用于验证引擎「高斯泼溅导入 → 场景内渲染 → 模型共存」全链路，
 * 用户后续可直接导入自己扫描的真实 PLY。
 *
 * 字段约定（已对照 @mkkellogg/gaussian-splats-3d 0.4.7 源码）：
 *   scale_i = ln(半长轴/米)   color = 0.5 + SH_C0 * f_dc_i   opacity = sigmoid(raw)
 *   rot_0..3 = 四元数 (x, y, z, w)
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SH_C0 = 0.28209479177387814
const sigmoid = (x) => 1 / (1 + Math.exp(-x))
const lerp = (a, b, t) => a + (b - a) * t

// 伪随机（mulberry32），保证可复现
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260904)

const splats = [] // { p:[x,y,z], n:[x,y,z], c:[r,g,b], scale:[s0,s1,s2], rot:[x,y,z,w] }

const pushSplat = (p, n, c, size, anisotropy = 0.35) => {
  // 各向异性：沿法线方向压扁（真实 3DGS 的典型形态）
  const along = size * anisotropy
  splats.push({
    p,
    n,
    c: [Math.min(1, Math.max(0, c[0])), Math.min(1, Math.max(0, c[1])), Math.min(1, Math.max(0, c[2]))],
    scale: [size, size, along],
    rot: [0, 0, 0, 1], // identity；简化处理，视觉上足够
  })
}

// ---- 地板：10x10，浅灰蓝 + 棋盘明暗 + 噪声 ----
{
  const N = 20000
  for (let i = 0; i < N; i++) {
    const x = (rand() - 0.5) * 10
    const z = (rand() - 0.5) * 10
    const checker = (Math.floor((x + 5) / 1.25) + Math.floor((z + 5) / 1.25)) % 2 === 0
    let base = checker ? 0.62 : 0.5
    base += (rand() - 0.5) * 0.06
    // 距中心越远越暗（伪 AO）
    const d = Math.min(1, Math.hypot(x, z) / 7)
    base *= 1 - d * 0.25
    pushSplat([x, 0, z], [0, 1, 0], [base * 0.92, base * 0.95, base * 1.05], 0.055)
  }
}

// ---- 墙体：z=-5 与 x=-5，各 10m 宽 x 4.5m 高 ----
const buildWall = (count, fixed, axis, colorA, colorB) => {
  for (let i = 0; i < count; i++) {
    const u = (rand() - 0.5) * 10
    const v = rand() * 4.5
    const t = v / 4.5
    const base = lerp(colorA, colorB, t) + (rand() - 0.5) * 0.05
    const c = axis === 'z' ? [base * 1.02, base * 0.98, base * 0.9] : [base * 0.9, base * 0.98, base * 1.05]
    const p = axis === 'z' ? [u, v, fixed] : [fixed, v, u]
    const n = axis === 'z' ? [0, 0, 1] : [1, 0, 0]
    pushSplat(p, n, c, 0.06)
  }
}
buildWall(11000, -5, 'z', 0.58, 0.34) // 后墙：上亮下暗
buildWall(11000, -5, 'x', 0.55, 0.3)  // 左墙

// ---- 三个彩色发光球：表面均匀采样 + 沿法线压扁 ----
const buildSphere = (center, radius, color, count, size) => {
  for (let i = 0; i < count; i++) {
    // 球面均匀采样
    const cz = rand() * 2 - 1
    const theta = rand() * Math.PI * 2
    const s = Math.sqrt(1 - cz * cz)
    const nx = s * Math.cos(theta)
    const ny = cz
    const nz = s * Math.sin(theta)
    // 略微鼓出表面（0.98~1.02），模拟泼溅厚度
    const r = radius * (0.96 + rand() * 0.06)
    pushSplat(
      [center[0] + nx * r, center[1] + ny * r, center[2] + nz * r],
      [nx, ny, nz],
      color.map((v) => v * (0.85 + rand() * 0.3)),
      size,
      0.4
    )
  }
}
buildSphere([-1.6, 1.2, -1.2], 0.55, [0.95, 0.25, 0.15], 4500, 0.05)
buildSphere([1.3, 1.7, -1.6], 0.62, [0.2, 0.9, 0.35], 5000, 0.055)
buildSphere([0.1, 2.4, -2.6], 0.7, [0.2, 0.45, 0.98], 5500, 0.06)

// ---- 写 INRIA binary PLY ----
const PROPS = [
  'x', 'y', 'z',
  'nx', 'ny', 'nz',
  'f_dc_0', 'f_dc_1', 'f_dc_2',
  'opacity',
  'scale_0', 'scale_1', 'scale_2',
  'rot_0', 'rot_1', 'rot_2', 'rot_3',
]
const header = [
  'ply',
  'format binary_little_endian 1.0',
  'comment synthetic gaussian splat test scene',
  `element vertex ${splats.length}`,
  ...PROPS.map((p) => `property float ${p}`),
  'end_header',
  '',
].join('\n')

const stride = PROPS.length * 4 // 68 bytes
const buf = Buffer.alloc(header.length + splats.length * stride)
buf.write(header, 0, 'utf8')
const offset = header.length

for (let i = 0; i < splats.length; i++) {
  const s = splats[i]
  const f = Buffer.alloc(stride)
  f.writeFloatLE(s.p[0], 0)
  f.writeFloatLE(s.p[1], 4)
  f.writeFloatLE(s.p[2], 8)
  f.writeFloatLE(s.n[0], 12)
  f.writeFloatLE(s.n[1], 16)
  f.writeFloatLE(s.n[2], 20)
  f.writeFloatLE((s.c[0] - 0.5) / SH_C0, 24)
  f.writeFloatLE((s.c[1] - 0.5) / SH_C0, 28)
  f.writeFloatLE((s.c[2] - 0.5) / SH_C0, 32)
  f.writeFloatLE(Math.log(0.97 / (1 - 0.97)), 36) // sigmoid^{-1}(0.97)
  f.writeFloatLE(Math.log(s.scale[0]), 40)
  f.writeFloatLE(Math.log(s.scale[1]), 44)
  f.writeFloatLE(Math.log(s.scale[2]), 48)
  f.writeFloatLE(s.rot[0], 52)
  f.writeFloatLE(s.rot[1], 56)
  f.writeFloatLE(s.rot[2], 60)
  f.writeFloatLE(s.rot[3], 64)
  f.copy(buf, offset + i * stride)
}

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples', 'gs-demo-room.ply')
writeFileSync(out, buf)
console.log(`已生成 ${out}`)
console.log(`高斯点: ${splats.length}, 大小: ${(buf.length / 1024 / 1024).toFixed(1)} MB`)
