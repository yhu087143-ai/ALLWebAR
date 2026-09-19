/**
 * 端到端验证「导出小程序场景」：
 * 用真实的 D:\未命名场景.wxar.json 作为引擎状态，
 * 调用 buildMiniProgramSceneDataJs 生成 scene-data.js，
 * 然后 node --check + require 校验产物结构。
 *
 * 前置：先跑 npx esbuild src/engine/export/miniProgram.ts --bundle
 *       --platform=node --format=esm --outfile=scripts/.tmp-miniprogram.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const src = readFileSync('D:/未命名场景.wxar.json', 'utf8')
const exported = JSON.parse(src)

// 把扁平节点表包成 buildMiniProgramScene 需要的最小引擎 mock
const nodeMap = new Map(exported.nodes.map((n) => [n.id, n]))
const mockEngine = {
  projectName: exported.name,
  environment: exported.environment,
  postfx: exported.postfx,
  game: { world: { roots: [] } },
  graph: {
    rootIds: exported.nodes.map((n) => n.id),
    get: (id) => nodeMap.get(id),
  },
  assets: {
    list: () => exported.assets,
  },
}

const { buildMiniProgramSceneDataJs } = createRequire(import.meta.url)('./.tmp-tsc/miniProgram.cjs')
const js = buildMiniProgramSceneDataJs(mockEngine)
writeFileSync('scripts/.tmp-scene-data.cjs', js)

// 1. 语法校验
const { execSync } = await import('node:child_process')
execSync('node --check scripts/.tmp-scene-data.cjs', { stdio: 'inherit' })

// 2. 结构校验
delete require.cache[require.resolve('./.tmp-scene-data.cjs')]
const data = require('./.tmp-scene-data.cjs')
const scene = data.scene
const json = JSON.stringify(scene)

const flat = []
const walk = (list) => list.forEach((n) => { flat.push(n); walk(n.children || []) })
walk(scene.nodes)

const checks = {
  '模块导出 scene': !!scene && typeof scene === 'object',
  'postfx 已关闭': scene.postfx?.enabled === false,
  '地面已移除': !flat.some((n) => /地面/.test(String(n.name))),
  '隐藏节点已移除': !flat.some((n) => n.visible === false),
  '人物节点保留': flat.some((n) => n.name === 'demo-character' && n.visible !== false),
  'pathFollow 保留': json.includes('pathFollow'),
  '轨迹保留(被引用)': flat.some((n) => (n.props?.components || []).some((c) => c.type === 'path')),
  '孤立轨迹已清理': flat.filter((n) => (n.props?.components || []).some((c) => c.type === 'path')).length === 1,
  'CDN 占位变量': /var URL_[A-Z0-9_]+ = 'https:\/\/your-cdn\.example\.com\//.test(js),
  'blob 地址已替换': !json.includes('blob:'),
  'AR 缩放变量引用(源码)': /"scale": \[\s*\(MODEL_AR_SCALE\)/.test(js),
  'AR 缩放生效(require 后 =1，GLB 已归一化)': JSON.stringify(flat.find((n) => n.name === 'demo-character')?.transform?.scale) === '[1,1,1]',
  '材质/灯光保留': flat.some((n) => n.type === 'light') && flat.some((n) => n.type === 'mesh'),
}
let failed = 0
for (const [name, ok] of Object.entries(checks)) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}
console.log(`\n生成产物预览（前 40 行）：`)
console.log(js.split('\n').slice(0, 40).join('\n'))
if (failed > 0) {
  console.error(`\n${failed} 项校验失败`)
  process.exit(1)
}
console.log('\n全部校验通过')
