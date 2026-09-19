/**
 * 验证：type 为 'vps' / 'ble' 的 POI 能否通过「场景坐标」被触发。
 *
 * 背景：GuideEngine 里原本有两个距离函数，_checkProximity() 内联的那份只认
 * position.type === 'manual'，导致 vps / ble 的 POI 距离恒为 Infinity、
 * 永远不触发 poiEnter。修复后 _checkProximity() 统一调用 distanceToPOI()。
 *
 * 用法：cd ar-platform && node tools/test-vps-poi-trigger.mjs
 */

const { GuideEngine } = await import('../ar-engine/dist/index.js')

/** 只负责把一条用户位置推给 GuideEngine 的假 provider */
class FakeProvider {
  constructor(name, pos) {
    this.name = name
    this.available = true
    this._pos = pos
    this._cb = null
  }
  start() {
    // 立刻推一帧
    if (this._cb) queueMicrotask(() => this._cb(this._pos))
  }
  stop() {}
  onPosition(cb) {
    this._cb = cb
  }
  getCurrentPosition() {
    return Promise.resolve(this._pos)
  }
}

function makePOI(id, type, scenePosition, triggerRadius) {
  return {
    id,
    name: id,
    description: '',
    position: type === 'gps'
      ? { type, latitude: 31.23, longitude: 121.47 }
      : { type, scenePosition },
    triggerRadius,
    order: 0,
  }
}

/** 用户站在场景原点 */
const USER = { timestamp: Date.now(), sceneX: 0, sceneY: 0, sceneZ: 0, heading: 90 }

const CASES = [
  { type: 'manual', poiAt: [2, 0, 0], radius: 3, expect: true, note: '修复前就正常（回归）' },
  { type: 'vps', poiAt: [2, 0, 0], radius: 3, expect: true, note: '自研 VPS 的主路径' },
  { type: 'ble', poiAt: [2, 0, 0], radius: 3, expect: true, note: '蓝牙信标路径' },
  { type: 'vps', poiAt: [10, 0, 0], radius: 3, expect: false, note: '超出半径不应触发' },
]

let pass = 0
let fail = 0

for (const c of CASES) {
  const poi = makePOI(`poi-${c.type}`, c.type, c.poiAt, c.radius)
  const route = {
    id: 'r1',
    name: 'test',
    description: '',
    pois: [poi],
    positionProvider: c.type,
  }

  const engine = new GuideEngine(route)
  const entered = []
  engine.on('poiEnter', (p) => entered.push(p.id))
  engine.setPositionProvider(new FakeProvider(c.type, USER))
  engine.start()

  // 让 onPosition 的微任务跑完
  await new Promise((r) => setTimeout(r, 30))

  const dist = engine.distanceToPOI(poi)
  const got = entered.length > 0
  const ok = got === c.expect
  ok ? pass++ : fail++

  console.log(
    `${ok ? 'PASS' : 'FAIL'}  type=${c.type.padEnd(6)} POI@${JSON.stringify(c.poiAt).padEnd(12)} ` +
    `r=${c.radius}  dist=${Number.isFinite(dist) ? dist.toFixed(2) : 'Infinity'}  ` +
    `poiEnter=${got ? '触发' : '未触发'}  期望=${c.expect ? '触发' : '未触发'}   ${c.note}`,
  )
  engine.stop()
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
