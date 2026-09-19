/**
 * 构建出「可直接放进 ar-platform 静态目录」的编辑器产物。
 *
 * 与 dev 代理模式的区别：
 *   dev  ：ar-platform 把 /xr-studio-app 反代到 XR引擎 dev server（5174），热更新，需要两个进程
 *   build：产物落到 ar-platform/frontend/public/xr-studio/，由宿主直接静态托管，单进程、可打包上线
 *
 * 用法：
 *   node scripts/build-embedded.mjs
 *   XR_BASE=/xr-studio/ node scripts/build-embedded.mjs
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/**
 * 静态模式的 base 必须与 dev 代理前缀（/xr-studio-app）以及宿主路由（/xr-studio）都不同，
 * 否则 Vite 的静态文件中间件会和 SPA 回退、proxy 抢同一个路径。
 */
const base = process.env.XR_BASE || '/xr-studio-static/'
const dirName = base.replace(/^\/|\/$/g, '')
/** ar-platform 仓库位置，可用 AR_PLATFORM_ROOT 覆盖 */
const target = path.join(
  process.env.AR_PLATFORM_ROOT || 'D:/project3lianjie/ar-platform',
  'frontend',
  'public',
  dirName
)

console.log(`[XR引擎] 构建嵌入产物  base=${base}`)
const build = spawnSync('npx', ['vite', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, XR_BASE: base },
})
if (build.status !== 0) {
  console.error('[XR引擎] 构建失败')
  process.exit(build.status ?? 1)
}

const dist = path.join(root, 'dist')
if (!existsSync(dist)) {
  console.error(`[XR引擎] 未找到构建产物目录：${dist}`)
  process.exit(1)
}

// 覆盖式同步，避免上一次的旧 chunk 残留导致 index.html 引用了不存在的文件
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(dist, target, { recursive: true })

console.log(`[XR引擎] 产物已同步到：${target}`)
console.log(`[XR引擎] 宿主里访问 /xr-studio?mode=static 即可使用静态产物（无需再开 5174）`)
