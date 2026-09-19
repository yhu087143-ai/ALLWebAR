/**
 * 引擎核心链路冒烟测试（headless）。
 *
 * 运行：npx tsx scripts/smoke-core.mts   或   npm run test:core
 *
 * 覆盖：引擎构造/起步场景、添加物体全类型与 uniqueName、geometry/props/transform
 * 读写、层级操作（reparent/canReparent/duplicate/remove）、撤销重做（含 500ms
 * 合并窗口）、播放模式（历史保留 + 播放中不落盘）、项目序列化往返与旧版字段
 * 默认值合并、微信导出（节点剔除与兼容性检查）、游戏运行时（组件生命周期 /
 * ObjectPool / dataDriven ttl）、插件系统（register/unregister 与 disposer）。
 */

// ---------------------------------------------------------------------------
// 浏览器 API 最小 stub —— 必须先于引擎模块加载，因此引擎一律走动态 import。
// 引擎内部对 window/document/navigator/indexedDB/Audio 均有 typeof 守卫，
// 这里只需补 localStorage（自动保存链路）与 blob URL（资产/导出链路）。
// ---------------------------------------------------------------------------

class MemoryStorage {
  private map = new Map<string, string>()
  /** 调用计数，供「播放中不写 localStorage」断言使用 */
  readonly counts = { setItem: 0, getItem: 0, removeItem: 0 }
  get length(): number {
    return this.map.size
  }
  getItem(key: string): string | null {
    this.counts.getItem += 1
    return this.map.has(key) ? this.map.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.counts.setItem += 1
    this.map.set(key, String(value))
  }
  removeItem(key: string): void {
    this.counts.removeItem += 1
    this.map.delete(key)
  }
  clear(): void {
    this.map.clear()
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
}

const storage = new MemoryStorage()
;(globalThis as Record<string, unknown>).localStorage = storage

if (typeof URL.createObjectURL !== 'function') {
  let blobSeq = 0
  URL.createObjectURL = () => `blob:smoke-stub-${++blobSeq}`
  URL.revokeObjectURL = () => undefined
}

// detect-gpu 的 package.json 没有 exports 字段，Node ESM 会拿到 UMD 构建，
// 命名导出 getGPUTier 链接失败（Vite 有 interop 所以浏览器端没事）。
// 这里注册一个解析钩子，把 detect-gpu 重定向到它的纯 ESM 构建。
import { register } from 'node:module'

const detectGpuEsmUrl = new URL('../node_modules/detect-gpu/dist/detect-gpu.esm.js', import.meta.url).href
register(
  `data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'detect-gpu') return { url: ${JSON.stringify(detectGpuEsmUrl)}, shortCircuit: true }
  return next(specifier, context)
}
`)}`
)

// ---------------------------------------------------------------------------
// 动态 import（stub 就绪后再加载引擎）
// ---------------------------------------------------------------------------

const THREE = await import('three')
const { Engine } = await import('../src/engine/core/Engine')
const { buildStarterScene, engine: editorEngine } = await import('../src/editor/store')
const { defaultPostFX, GEOMETRY_PARAMS } = await import('../src/engine/core/factory')
const { buildMiniProgramScene } = await import('../src/engine/export/miniProgram')
const { checkWeChatCompatibility } = await import('../src/engine/export/compatibility')
const { World } = await import('../src/engine/runtime/World')
const { Component } = await import('../src/engine/runtime/Component')
const { DataDrivenBehavior } = await import('../src/engine/game/dataDriven')
const { ObjectPool } = await import('../src/engine/game/ObjectPool')

import type { GeometryKind, LightProps, MeshProps, NodeType } from '../src/engine/core/types'
import type { IModelProvider } from '../src/engine/ai3d/types'

// ---------------------------------------------------------------------------
// 测试框架（极简）：每条断言打 ✓/✗，最后汇总，任一失败 exit 1
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    failures.push(name)
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`)
  }
}

function section(title: string): void {
  console.log(`\n[${title}]`)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** 引擎自动保存延迟（Engine.ts 的 AUTOSAVE_DELAY_MS = 600），等 750ms 保证 flush */
const AUTOSAVE_FLUSH_MS = 750

// ===========================================================================
// 1. 引擎构造 + 起步场景
// ===========================================================================
section('1. 引擎构造 + 起步场景')
{
  check('Engine 可构造（headless）', editorEngine instanceof Engine)
  buildStarterScene()
  const g = editorEngine.graph
  const roots = g.rootIds.map((id) => g.must(id))
  check('起步场景含 4 个根节点', roots.length === 4, `实际 ${roots.length}`)
  const byName = (n: string) => roots.find((r) => r.name === n)
  const ambient = byName('环境光')
  const key = byName('主光源')
  const ground = byName('地面')
  const cube = byName('演示立方体')
  check('环境光存在且为 ambient', !!ambient && ambient.type === 'light' && (ambient.props as LightProps).light === 'ambient')
  check('主光源存在且为 directional', !!key && key.type === 'light' && (key.props as LightProps).light === 'directional')
  check('地面存在且为 plane 网格', !!ground && ground.type === 'mesh' && (ground.props as MeshProps).geometry === 'plane')
  check('演示立方体存在且为 box 网格', !!cube && cube.type === 'mesh' && (cube.props as MeshProps).geometry === 'box')
  // 清掉挂起的自动保存定时器，避免污染用例 6 的 localStorage 计数
  editorEngine.dispose()
}

// ===========================================================================
// 2. 添加物体全类型 + uniqueName
// ===========================================================================
section('2. 添加物体全类型（group/mesh/light/particle）+ uniqueName')
{
  const engine = new Engine()
  const types: NodeType[] = ['group', 'mesh', 'light', 'particle']
  const label: Record<string, string> = { group: '空对象', mesh: '网格', light: '灯光', particle: '粒子' }
  for (const type of types) {
    const r = engine.commands.execute({ op: 'createNode', type })
    const node = r.nodeId ? engine.graph.get(r.nodeId) : undefined
    check(`addNode(${type}) 成功并进入 graph`, r.ok && !!node && node.type === type)
    check(`addNode(${type}) 挂在根序列`, !!r.nodeId && engine.graph.rootIds.includes(r.nodeId))
    check(`addNode(${type}) 命名为「${label[type]} 1」`, !!node && node.name === `${label[type]} 1`, node?.name)
  }
  // 同名自动加序号：再建两个 group
  const g1 = engine.graph.create('group')
  const g2 = engine.graph.create('group')
  check('uniqueName 递增（空对象 2）', g1.name === '空对象 2', g1.name)
  check('uniqueName 递增（空对象 3）', g2.name === '空对象 3', g2.name)
  check('uniqueName 不重复', new Set([g1.name, g2.name]).size === 2)
  engine.dispose()
}

// ===========================================================================
// 3. mesh 各 geometry + setGeometry/setProps/setTransform 读写一致
// ===========================================================================
section('3. geometry 全类型 + setGeometry/setProps/setTransform 读写')
{
  const engine = new Engine()
  const mesh = engine.graph.create('mesh')
  const geometries: GeometryKind[] = ['box', 'sphere', 'plane', 'cylinder', 'cone', 'torus']
  for (const geo of geometries) {
    engine.graph.setGeometry(mesh.id, geo)
    const props = engine.graph.must(mesh.id).props as MeshProps
    check(`setGeometry(${geo}) 读回一致`, props.geometry === geo, props.geometry)
    check(
      `setGeometry(${geo}) 参数表键齐全`,
      eq(Object.keys(props.geometryParams).sort(), Object.keys(GEOMETRY_PARAMS[geo]).sort()),
      Object.keys(props.geometryParams).join(',')
    )
  }
  // setProps：标量与嵌套材质
  engine.graph.setProps(mesh.id, { castShadow: false })
  let props = engine.graph.must(mesh.id).props as MeshProps
  check('setProps(castShadow=false) 读回一致', props.castShadow === false)
  engine.graph.setProps(mesh.id, { material: { ...props.material, color: '#ff0000', roughness: 0.9 } })
  props = engine.graph.must(mesh.id).props as MeshProps
  check(
    'setProps(material) 读回一致',
    props.material.color === '#ff0000' && props.material.roughness === 0.9,
    `${props.material.color} / ${props.material.roughness}`
  )
  // setTransform
  engine.graph.setTransform(mesh.id, { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3], scale: [2, 2, 2] })
  const t = engine.graph.must(mesh.id).transform
  check(
    'setTransform 读回一致',
    eq(t.position, [1, 2, 3]) && eq(t.rotation, [0.1, 0.2, 0.3]) && eq(t.scale, [2, 2, 2]),
    JSON.stringify(t)
  )
  engine.dispose()
}

// ===========================================================================
// 4. 层级：reparent / canReparent 拒绝环 / duplicate 深拷贝 / remove 级联
// ===========================================================================
section('4. 层级操作')
{
  const engine = new Engine()
  const g = engine.graph
  const A = g.create('group')
  g.update(A.id, { name: 'A' })
  const B = g.create('mesh', A.id)
  g.update(B.id, { name: 'B' })
  const C = g.create('mesh', B.id)
  g.update(C.id, { name: 'C' })
  check('初始层级 A>B>C 建立', g.must(B.id).parentId === A.id && eq(g.must(A.id).children, [B.id]) && eq(g.must(B.id).children, [C.id]))

  check('reparent(B -> 根) 返回 true', g.reparent(B.id, null) === true)
  check('reparent 后 B 为根且仍带子节点 C', g.rootIds.includes(B.id) && eq(g.must(B.id).children, [C.id]) && g.must(A.id).children.length === 0)

  check('canReparent 拒绝挂到自身', g.canReparent(B.id, B.id) === false)
  check('canReparent 拒绝环（B -> 子孙 C）', g.canReparent(B.id, C.id) === false)
  check('reparent 成环被拒绝（返回 false）', g.reparent(B.id, C.id) === false)
  check('拒绝后层级未变', g.must(C.id).parentId === B.id)

  g.setTransform(C.id, { position: [7, 8, 9] })
  const dup = g.duplicate(B.id)
  check('duplicate 返回副本', !!dup && dup.id !== B.id)
  const dupChild = dup ? g.must(dup.children[0]) : undefined
  check('duplicate 深拷贝子树（子节点为新 id）', !!dup && dup.children.length === 1 && !!dupChild && dupChild.id !== C.id)
  check('duplicate 副本命名「B 副本」', !!dup && dup.name === 'B 副本', dup?.name)
  check(
    'duplicate 数据深拷贝（值相同、引用不同）',
    !!dupChild &&
      eq(dupChild.transform.position, [7, 8, 9]) &&
      dupChild.transform.position !== g.must(C.id).transform.position &&
      dupChild.props !== g.must(C.id).props
  )

  const removedDescendants = g.getDescendants(B.id)
  g.remove(B.id)
  check('remove 删除节点本身', !g.get(B.id) && !g.rootIds.includes(B.id))
  check('remove 级联删除子树', removedDescendants.length > 0 && removedDescendants.every((id) => !g.get(id)))
  check('duplicate 出的副本子树不受影响', !!dup && !!g.get(dup.id) && !!g.get(dup.children[0]))
  engine.dispose()
}

// ===========================================================================
// 5. 撤销 / 重做（含 500ms 合并窗口）
// ===========================================================================
section('5. 撤销 / 重做')
{
  const engine = new Engine()
  check('初始不可撤销（基线）', engine.history.canUndo === false)

  // 5.1 第一次编辑可撤销、undo 回基线、redo 恢复
  const n = engine.graph.create('mesh')
  check('第一次编辑后可撤销', engine.history.canUndo === true)
  check('undo() 返回 true', engine.undo() === true)
  check('undo 回基线（节点消失）', !engine.graph.get(n.id) && engine.graph.rootIds.length === 0)
  check('redo() 返回 true', engine.redo() === true)
  check('redo 恢复节点', !!engine.graph.get(n.id))
  engine.undo() // 回到空场景，继续下面的用例

  // 5.2 500ms 窗口内改 A 改 B：不同节点不合并，undo 只回退 B
  const a = engine.graph.create('mesh')
  const b = engine.graph.create('mesh')
  engine.graph.setTransform(a.id, { position: [1, 0, 0] })
  engine.graph.setTransform(b.id, { position: [5, 0, 0] })
  check('undo 只回退 B 的修改', engine.undo() === true && eq(engine.graph.must(a.id).transform.position, [1, 0, 0]) && eq(engine.graph.must(b.id).transform.position, [0, 0, 0]))
  check('再 undo 回退 A 的修改', engine.undo() === true && eq(engine.graph.must(a.id).transform.position, [0, 0, 0]))

  // 5.3 同一节点 500ms 内连续修改合并为一步
  const m = engine.graph.create('mesh')
  engine.graph.setTransform(m.id, { position: [1, 0, 0] })
  engine.graph.setTransform(m.id, { position: [2, 0, 0] })
  check('同节点连续修改合并：一次 undo 回到改前', engine.undo() === true && eq(engine.graph.must(m.id).transform.position, [0, 0, 0]))
  check('合并后可 redo 到最终值', engine.redo() === true && eq(engine.graph.must(m.id).transform.position, [2, 0, 0]))
  engine.dispose()
}

// ===========================================================================
// 6. 播放模式：历史保留 + 播放中不写 localStorage
// ===========================================================================
section('6. 播放模式')
{
  const engine = new Engine()
  engine.attachScene(new THREE.Scene()) // play.start 需要视口场景
  const node = engine.graph.create('mesh')

  await sleep(AUTOSAVE_FLUSH_MS) // 等起步编辑的自动保存 flush 完再计数
  const writesBefore = storage.counts.setItem
  check('编辑态自动保存正常落盘（stub 计数 >0）', writesBefore > 0, `setItem=${writesBefore}`)

  engine.play.start(engine)
  check('进入播放模式', engine.play.active === true)
  engine.graph.setTransform(node.id, { position: [9, 9, 9] })
  await sleep(AUTOSAVE_FLUSH_MS)
  check('播放中 scheduleAutosave 不写 localStorage', storage.counts.setItem === writesBefore, `setItem ${writesBefore} -> ${storage.counts.setItem}`)
  check('播放中撤销历史保留', engine.history.canUndo === true)

  engine.play.stop(engine)
  check('退出播放模式', engine.play.active === false)
  check('退出后快照恢复（transform 还原）', eq(engine.graph.must(node.id).transform.position, [0, 0, 0]), JSON.stringify(engine.graph.must(node.id).transform.position))
  check('退出播放后撤销历史仍可用', engine.undo() === true && !engine.graph.get(node.id))
  engine.dispose()
}

// ===========================================================================
// 7. 项目序列化：保存/载入往返 + 旧版缺字段合并默认值
// ===========================================================================
section('7. 项目序列化')
{
  const e1 = new Engine()
  e1.setProjectName('冒烟项目')
  const m = e1.graph.create('mesh')
  e1.graph.setGeometry(m.id, 'sphere')
  e1.graph.setTransform(m.id, { position: [3, 1, -2] })
  e1.setEnvironment({ preset: 'night' })
  e1.patchPostFX('bloom', { intensity: 1.5 })
  const project = e1.toProject()

  const e2 = new Engine()
  e2.loadProject(project)
  const m2 = e2.graph.get(m.id)
  check('往返：项目名一致', e2.projectName === '冒烟项目', e2.projectName)
  check('往返：节点数一致', Object.keys(e2.graph.nodes).length === Object.keys(project.graph.nodes).length)
  check('往返：geometry 一致', !!m2 && (m2.props as MeshProps).geometry === 'sphere')
  check('往返：transform 一致', !!m2 && eq(m2.transform.position, [3, 1, -2]))
  check('往返：environment 一致', e2.environment.preset === 'night', e2.environment.preset)
  check('往返：postfx.bloom.intensity 一致', e2.postfx.bloom.intensity === 1.5)

  // 模拟旧项目：删掉后加的 postfx.bloom.radius，载入后应合并出默认值而非 undefined
  const legacy = structuredClone(project)
  delete (legacy.postfx.bloom as Partial<typeof legacy.postfx.bloom>).radius
  const e3 = new Engine()
  e3.loadProject(legacy)
  check(
    '旧项目缺 postfx.bloom.radius：载入后为默认值 0.75 而非 undefined',
    e3.postfx.bloom.radius !== undefined && e3.postfx.bloom.radius === defaultPostFX().bloom.radius,
    String(e3.postfx.bloom.radius)
  )
  e1.dispose()
  e2.dispose()
  e3.dispose()
}

// ===========================================================================
// 8. 微信导出：buildMiniProgramScene + compatibility 检查
// ===========================================================================
section('8. 微信导出')
{
  const engine = new Engine()
  const meshA = engine.graph.create('mesh')
  engine.graph.update(meshA.id, { name: '黑洞球' })
  engine.graph.setProps(meshA.id, { effect: 'black-hole' })
  const meshB = engine.graph.create('mesh')
  engine.graph.update(meshB.id, { name: '能量球' })
  engine.graph.setProps(meshB.id, { effect: 'energy_ball' })
  const splat = engine.graph.create('gaussian-splat')
  engine.graph.update(splat.id, { name: '泼溅点云' })

  const scene = buildMiniProgramScene(engine)
  const outNodes = scene.nodes as { id: string; type: string; children?: unknown[] }[]
  const walkTypes = (list: { id: string; type: string; children?: unknown[] }[]): string[] =>
    list.flatMap((n) => [n.type, ...walkTypes((n.children ?? []) as typeof list)])
  const allTypes = walkTypes(outNodes)
  check('导出输出含普通节点', outNodes.some((n) => n.id === meshA.id) && outNodes.some((n) => n.id === meshB.id))
  check('gaussian-splat 节点被剔除', !allTypes.includes('gaussian-splat') && !outNodes.some((n) => n.id === splat.id))

  const data = engine.graph.toJSON()
  const issues = checkWeChatCompatibility({ nodes: data.nodes, rootIds: data.rootIds })
  check(
    "compatibility 对 'black-hole' 不误报",
    issues.some((i) => i.level === 'ok' && i.title.includes('black-hole')) &&
      !issues.some((i) => i.title.includes('未识别特效') && i.title.includes('black-hole'))
  )
  check(
    "compatibility 对 'energy_ball' 不误报",
    issues.some((i) => i.level === 'ok' && i.title.includes('energy_ball')) &&
      !issues.some((i) => i.title.includes('未识别特效') && i.title.includes('energy_ball'))
  )
  check(
    'compatibility 对 gaussian-splat 报 error',
    issues.some((i) => i.level === 'error' && i.title.includes('高斯泼溅')),
    issues.filter((i) => i.level === 'error').map((i) => i.title).join(';')
  )
  engine.dispose()
}

// ===========================================================================
// 9. 游戏运行时：组件生命周期 / ObjectPool / dataDriven ttl
// ===========================================================================
section('9. 游戏运行时')
{
  const world = new World()
  world.start()
  const ent = world.createEntity('玩家')
  check('运行期创建实体并进入 world', world.entities.has(ent.id))

  let awakes = 0
  let starts = 0
  class Probe extends Component {
    onAwake(): void {
      awakes += 1
    }
    onStart(): void {
      starts += 1
    }
  }
  const comp = ent.addComponent(Probe)
  check('运行期 addComponent 立即触发 onAwake/onStart', awakes === 1 && starts === 1, `awake=${awakes} start=${starts}`)
  check('addComponent 重复挂载返回既有实例', ent.addComponent(Probe) === comp && starts === 1)

  const pool = new ObjectPool(() => ({ n: 0 }))
  const item = pool.get()
  pool.release(item)
  pool.release(item) // 重复 release 应被防重
  check('ObjectPool release 防重（size=1）', pool.size === 1, `size=${pool.size}`)
  check('ObjectPool 复用同一对象', pool.get() === item)

  const root = world.createEntity('数据驱动根')
  root.userData.world = world // DataDrivenBehavior 经根节点 userData 取 world
  root.addComponent(DataDrivenBehavior)
  const child = world.createEntity('短命实体', root)
  child.props = { components: [{ type: 'ttl', seconds: 0.05 }] }
  check('ttl 实体已创建', world.entities.has(child.id))
  world.update(0.1) // dt 超过 ttl，应当帧销毁
  check('dataDriven ttl 到期销毁', !child.isAlive && !world.entities.has(child.id))
  world.stop()
}

// ===========================================================================
// 10. 插件系统：注册 / 卸载 / disposer 全调用
// ===========================================================================
section('10. 插件系统')
{
  const engine = new Engine()
  const calls: string[] = []
  const provider: IModelProvider = {
    info: { id: 'stub-provider', name: 'Stub', kind: 'local', description: '冒烟测试', supportsText: true, supportsImage: false, eta: '0s' },
    health: async () => true,
    generate: async () => ({ data: new ArrayBuffer(0), meta: {} }),
  }
  engine.plugins.register({
    id: 'smoke-plugin',
    name: '冒烟插件',
    version: '1.0.0',
    install(ctx) {
      const d1 = ctx.registerProvider(provider)
      const d2 = ctx.registerEffect('smoke-fx', () => null)
      check('registerProvider 返回 disposer', typeof d1 === 'function')
      check('registerEffect 返回 disposer', typeof d2 === 'function')
      return () => calls.push('install-hook')
    },
  })
  check('插件已安装', engine.plugins.has('smoke-plugin'))
  check('provider 已登记', engine.plugins.providers.has('stub-provider'))
  check('effect 已登记', engine.plugins.effects.has('smoke-fx'))

  check('unregister 返回 true', engine.plugins.unregister('smoke-plugin') === true)
  check('卸载后插件移除', !engine.plugins.has('smoke-plugin'))
  check('卸载后 provider disposer 已调用（map 清除）', !engine.plugins.providers.has('stub-provider'))
  check('卸载后 effect disposer 已调用（map 清除）', !engine.plugins.effects.has('smoke-fx'))
  check('install 返回的卸载钩子被调用', calls.includes('install-hook'))
  check('重复 unregister 返回 false', engine.plugins.unregister('smoke-plugin') === false)
  engine.dispose()
}

// ===========================================================================
// 汇总
// ===========================================================================
console.log(`\n${'='.repeat(48)}`)
console.log(`冒烟测试汇总：${passed} 通过，${failed} 失败`)
if (failures.length) {
  console.log('失败用例：')
  for (const f of failures) console.log(`  ✗ ${f}`)
}
console.log('='.repeat(48))
process.exit(failed > 0 ? 1 : 0)
