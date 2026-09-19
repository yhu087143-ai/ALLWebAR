/**
 * 以「嵌入 ar-platform 创作台」的方式启动 dev server。
 *
 * 为什么需要它：ar-platform 的前端把 /xr-studio-app 反向代理到本服务，
 * 因此 Vite 必须知道自己的 base，否则 HTML 里生成的资源路径会指向宿主的根目录而 404。
 * 这个 base 必须与 ar-platform/frontend/vite.config.js 里的 proxy key 保持一致。
 *
 * 用法：
 *   node scripts/dev-embedded.mjs
 *   XR_BASE=/xr-studio-app/ XR_PORT=5174 node scripts/dev-embedded.mjs
 */
import { spawn } from 'node:child_process'

const base = process.env.XR_BASE || '/xr-studio-app/'
const port = process.env.XR_PORT || '5174'

console.log(`[XR引擎] 嵌入模式启动  base=${base}  port=${port}`)
console.log('[XR引擎] 请确保 ar-platform 前端已在运行，然后访问  http://localhost:5180/xr-studio')

const child = spawn('npx', ['vite', '--port', port], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, XR_BASE: base, XR_PORT: port },
})

child.on('exit', (code) => process.exit(code ?? 0))
