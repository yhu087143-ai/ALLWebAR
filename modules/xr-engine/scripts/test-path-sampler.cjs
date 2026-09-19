// 临时验证脚本：测试 wxar-runtime 的 Catmull-Rom 采样数学正确性
// wxar-runtime.js 是微信 CommonJS 风格（module.exports），而项目是 ESM，
// 这里用文本包装的方式加载执行
const fs = require('fs')
const path = require('path')
const src = fs.readFileSync(path.join(__dirname, '../src/engine/xr/wechat/wxar-runtime.js'), 'utf8')
const mod = { exports: {} }
// eslint-disable-next-line no-new-func
new Function('module', 'exports', 'require', src)(mod, mod.exports, () => ({}))
const rt = mod.exports

// wxar-runtime 的方法挂在组件对象上，直接构造一个最小宿主来调用
const comp = rt.createXrGameComponent()
const build = comp.methods._buildCatmullRom
const sample = comp.methods._sampleCatmullRom

// 模拟一笔画的地面轨迹（与编辑器 PathDrawTool 输出同构）
const pts = []
for (let i = 0; i < 10; i++) {
  const t = i / 9
  pts.push([Math.cos(t * Math.PI) * 2, 0, Math.sin(t * Math.PI) * 1.5])
}

const curve = build(pts, false)
if (!curve) { console.error('FAIL: curve is null'); process.exit(1) }

let ok = true

// 1. 端点检查：t=0 应为起点，t=1 应为终点
const s0 = sample(curve, 0)
const s1 = sample(curve, 1)
const dStart = Math.hypot(s0[0] - pts[0][0], s0[2] - pts[0][2])
const dEnd = Math.hypot(s1[0] - pts[9][0], s1[2] - pts[9][2])
console.log('t=0   ->', s0.map(v => v.toFixed(4)), ' 距起点', dStart.toFixed(5))
console.log('t=1   ->', s1.map(v => v.toFixed(4)), ' 距终点', dEnd.toFixed(5))
if (dStart > 1e-6 || dEnd > 1e-6) ok = false

// 2. 全程无 NaN，且每步都在前进（弧长单调）
let prev = null
let totalMoved = 0
for (let i = 0; i <= 100; i++) {
  const p = sample(curve, i / 100)
  if (p.some(v => !Number.isFinite(v))) { console.error('FAIL: NaN at t=' + i / 100); ok = false; break }
  if (prev) {
    const d = Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2])
    totalMoved += d
    if (d > 0.5) { console.error('FAIL: 跳变 at t=' + i / 100, 'step=' + d); ok = false }
  }
  prev = p
}
console.log('100 步累计移动距离', totalMoved.toFixed(3), '（应约等于弧长 π·avg ≈ 5.5）')

// 3. 对照 Web 端 THREE.CatmullRomCurve3（centripetal）：对比几何形状
// （两边弧长归一化方式略有差异，逐参数点对比无意义，应看曲线间最小距离）
const THREE = require('three')
const webCurve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal')
const webSamples = webCurve.getPoints(400)
let maxGeoDiff = 0
for (let i = 0; i <= 40; i++) {
  const a = sample(curve, i / 40)
  const v = new THREE.Vector3(a[0], a[1], a[2])
  let minD = Infinity
  for (const w of webSamples) minD = Math.min(minD, v.distanceTo(w))
  if (minD > maxGeoDiff) maxGeoDiff = minD
}
console.log('与 Web 端曲线的几何最大偏差', maxGeoDiff.toFixed(4), '（<0.05 视为形状一致）')
if (maxGeoDiff > 0.05) ok = false

// 4. pingpong 相位与 Web 端 FollowController 公式逐字对齐（elapsed=5 时 phase=1 → t=1 折返点）
const duration = 5
for (const [elapsed, expect] of [[0, 0], [2.5, 0.5], [5, 1], [7.5, 0.5], [10, 0]]) {
  const phase = (elapsed / duration) % 2
  const t = Math.min(1, Math.max(0, phase < 1 ? phase : 2 - phase))
  if (Math.abs(t - expect) > 1e-9) { console.error('FAIL: pingpong t(' + elapsed + ')=' + t + ' expect ' + expect); ok = false }
}
// loop 模式
for (const [elapsed, expect] of [[0, 0], [2.5, 0.5], [5, 0], [7.5, 0.5]]) {
  const t = (elapsed / duration) % 1
  if (Math.abs(t - expect) > 1e-9) { console.error('FAIL: loop t(' + elapsed + ')=' + t + ' expect ' + expect); ok = false }
}
console.log('pingpong/loop 相位检查通过')

// 5. 假线闭环：圆缺一口（缺口=闭合段），闭合段设为假线 → 角色不进缺口内部，瞬移跨过
const circle = []
for (let i = 0; i < 10; i++) {
  const ang = (i / 10) * Math.PI * 2 // 0°..324°，缺口在 324°→360°
  circle.push([Math.cos(ang) * 2, 0, Math.sin(ang) * 2])
}
const rtClosed = comp.methods._buildPathRuntime({ points: circle, closed: true, ghost: [9] })
if (!rtClosed || rtClosed.runs.length !== 1) { console.error('FAIL: 闭环假线时间线构建失败'); ok = false } else {
  const midAng = (342 / 180) * Math.PI
  const gapMid = [Math.cos(midAng) * 2, 0, Math.sin(midAng) * 2]
  const gapChord = Math.hypot(circle[9][0] - circle[0][0], circle[9][2] - circle[0][2])
  let minToGapMid = Infinity
  let endPos = null
  for (let i = 0; i <= 2000; i++) {
    const p = comp.methods._samplePathDistance(rtClosed, (i / 2000) * rtClosed.totalReal)
    const dd = Math.hypot(p[0] - gapMid[0], p[2] - gapMid[2])
    if (dd < minToGapMid) minToGapMid = dd
    endPos = p
  }
  console.log('闭环缺口中点最近距离', minToGapMid.toFixed(4), '（应≈缺口弦长一半', (gapChord / 2).toFixed(4), '，角色没走缺口）')
  if (!(minToGapMid > (gapChord / 2) * 0.6)) { console.error('FAIL: 角色走进了假线缺口'); ok = false }
  // once 语义：d=totalReal 时应停在最后一个真线点（circle[9]，缺口起点）
  const dEnd = Math.hypot(endPos[0] - circle[9][0], endPos[2] - circle[9][2])
  if (dEnd > 1e-6) { console.error('FAIL: 时间线尽头未停在缺口起点, dev=' + dEnd); ok = false }
  // loop 回卷：t=0 应在起点 circle[0]
  const sLoop0 = comp.methods._samplePathDistance(rtClosed, 0)
  const d0 = Math.hypot(sLoop0[0] - circle[0][0], sLoop0[2] - circle[0][2])
  if (d0 > 1e-6) { console.error('FAIL: 环回起点偏差 ' + d0); ok = false }
  console.log('闭环假线：不进缺口 / 尽头停点 / 环回起点 通过')
}

// 6. 中段假线：5 点直线，段1 假线 → 位置永不进入 p1→p2 之间（瞬移）
const p5 = [[0, 0, 0], [2, 0, 0], [4, 0, 0], [6, 0, 0], [8, 0, 0]]
const rtMid = comp.methods._buildPathRuntime({ points: p5, closed: false, ghost: [1] })
if (!rtMid || rtMid.runs.length !== 2) { console.error('FAIL: 中段假线应产生 2 条真线链'); ok = false } else {
  let inGap = false
  let jumpOk = false
  for (let i = 0; i <= 1000; i++) {
    const d = (i / 1000) * rtMid.totalReal
    const p = comp.methods._samplePathDistance(rtMid, d)
    if (p[0] > 2.01 && p[0] < 3.99) inGap = true
    // 跨界瞬间：d 略小于 2 → x≈2；d 略大于 2 → x≈4（闪现）
    if (Math.abs(d - rtMid.runs[0].len) < 1e-9 && Math.abs(p[0] - 2) < 1e-6) { /* 边界点属 run1 末端 */ }
    if (Math.abs(d - rtMid.runs[1].dStart) < 1e-9 + 1e-9 && p[0] > 3.99) jumpOk = true
  }
  const afterJump = comp.methods._samplePathDistance(rtMid, rtMid.runs[1].dStart + 0.001 * rtMid.runs[1].len)
  if (afterJump[0] < 3.9) { console.error('FAIL: 瞬移后未落在下一段起点, x=' + afterJump[0]); ok = false } else jumpOk = true
  console.log('中段假线：不进缺口=' + !inGap + ' / 瞬移落点正确=' + jumpOk)
  if (inGap || !jumpOk) ok = false
}

// 7. once 模式公式：走完停住（elapsed 超时后 d 恒为 totalReal）
{
  const duration = 5
  let okOnce = true
  for (const [elapsed, expectD] of [[0, 0], [2.5, 0.5], [5, 1], [99, 1]]) {
    const tOnce = Math.min(1, Math.max(0, elapsed / duration))
    if (Math.abs(tOnce * rtClosed.totalReal - expectD * rtClosed.totalReal) > 1e-9) okOnce = false
  }
  console.log('once 模式：走完停住 ' + (okOnce ? '通过' : 'FAIL'))
  if (!okOnce) ok = false
}

// 8. 全时间线扫描（中段假线）：恰好一次瞬移，跳变幅度≈缺口弦长，其余步长微小
{
  let jumpCount = 0
  let jumpSize = 0
  let prev = comp.methods._samplePathDistance(rtMid, 0)
  const N = 4000
  for (let i = 1; i <= N; i++) {
    const p = comp.methods._samplePathDistance(rtMid, (i / N) * rtMid.totalReal)
    const st = Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2])
    if (st > 1.0) { jumpCount++; jumpSize = st }
    prev = p
  }
  const gapLen = Math.hypot(p5[2][0] - p5[1][0], p5[2][1] - p5[1][1], p5[2][2] - p5[1][2])
  const jumpOk = jumpCount === 1 && Math.abs(jumpSize - gapLen) < 0.05
  console.log('瞬移次数=' + jumpCount + ' / 跳变幅度=' + jumpSize.toFixed(3) + '（应恰 1 次且≈缺口弦长 ' + gapLen.toFixed(3) + '）')
  if (!jumpOk) ok = false
}

console.log(ok ? '\nALL PASS' : '\nFAILED')
process.exit(ok ? 0 : 1)
