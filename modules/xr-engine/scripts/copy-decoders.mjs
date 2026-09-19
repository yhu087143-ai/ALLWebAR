/**
 * 把运行期需要的静态资源从 node_modules 复制到 public/，避免依赖外网。
 *
 * 三类资源：
 *   1. Draco 解码器    —— three 的 glTF 加载器用，默认会去 CDN 取
 *   2. Basis 转码器    —— KTX2 压缩纹理用，同样默认走 CDN
 *   3. detect-gpu 基准 —— GPU 分档用的 benchmark 数据，默认从 unpkg 拉
 *
 * 三者在离线或内网环境下都会直接失败，复制到本地后断网也能正常工作。
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const libs = join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs')
const target = join(root, 'public', 'decoders')

if (!existsSync(libs)) {
  console.error('[decoders] 找不到 three 的 libs 目录，请先执行 npm install')
  process.exit(1)
}

mkdirSync(target, { recursive: true })

const jobs = [
  { name: 'Draco 解码器', from: join(libs, 'draco'), to: join(target, 'draco') },
  { name: 'Basis 转码器', from: join(libs, 'basis'), to: join(target, 'basis') },
  {
    name: 'GPU 基准数据',
    from: join(root, 'node_modules', 'detect-gpu', 'dist', 'benchmarks'),
    to: join(root, 'public', 'benchmarks'),
  },
]

for (const job of jobs) {
  if (!existsSync(job.from)) {
    console.warn(`[assets] 跳过 ${job.name}，源目录不存在: ${job.from}`)
    continue
  }
  cpSync(job.from, job.to, { recursive: true })
  console.log(`[assets] 已复制 ${job.name}`)
}

console.log('[assets] 完成')
