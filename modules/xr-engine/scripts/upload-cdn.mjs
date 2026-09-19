/**
 * 上传 GLB 到对象存储并验证 CDN 可下载性。
 *
 * 支持三家（按环境变量自动识别）：阿里云 OSS / 腾讯云 COS / 七牛云
 *
 * 用法：
 *   node scripts/upload-cdn.mjs <本地文件> [--key 远端路径] [--no-verify]
 *
 * 凭证从项目根目录的 .env 读取（见 .env.example），不要写进代码库。
 *
 * 为什么必须验证：
 *   微信强制 HTTPS，且不少 CDN 对 .glb 后缀会返回 403 或错误的 MIME，
 *   导致小程序里 loadAsset 静默失败。上传完直接验一遍最省事。
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

// ---------------------------------------------------------------- .env

function loadEnv() {
  const envPath = join(root, '.env')
  if (!existsSync(envPath)) return {}
  const env = {}
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = { ...loadEnv(), ...process.env }

// ---------------------------------------------------------------- 参数

const args = process.argv.slice(2)
const positional = []
const flags = {}
for (let i = 0; i < args.length; i += 1) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2)
    const next = args[i + 1]
    if (next && !next.startsWith('--')) {
      flags[key] = next
      i += 1
    } else {
      flags[key] = 'true'
    }
  } else {
    positional.push(args[i])
  }
}

const localFile = positional[0]
if (!localFile) {
  console.error('用法: node scripts/upload-cdn.mjs <本地文件> [--key 远端路径]')
  process.exit(1)
}

const filePath = resolve(localFile)
if (!existsSync(filePath)) {
  console.error(`文件不存在: ${filePath}`)
  process.exit(1)
}

const remoteKey = flags.key ?? `wxar/${basename(filePath)}`
const shouldVerify = flags.verify !== 'false'

const GLB_MIME = 'model/gltf-binary'

// ---------------------------------------------------------------- 上传

async function uploadOSS() {
  const OSS = (await import('ali-oss')).default
  const client = new OSS({
    region: env.OSS_REGION,
    accessKeyId: env.OSS_ACCESS_KEY_ID,
    accessKeySecret: env.OSS_ACCESS_KEY_SECRET,
    bucket: env.OSS_BUCKET,
    secure: true,
  })
  const result = await client.put(remoteKey, filePath, {
    mime: GLB_MIME,
    headers: { 'Content-Type': GLB_MIME, 'Cache-Control': 'public, max-age=31536000' },
  })
  return { url: result.url, name: '阿里云 OSS' }
}

async function uploadCOS() {
  const COS = (await import('cos-nodejs-sdk-v5')).default
  const cos = new COS({ SecretId: env.COS_SECRET_ID, SecretKey: env.COS_SECRET_KEY })
  const result = await cos.putObject({
    Bucket: env.COS_BUCKET,
    Region: env.COS_REGION,
    Key: remoteKey,
    Body: readFileSync(filePath),
    ContentType: GLB_MIME,
    CacheControl: 'public, max-age=31536000',
  })
  const host = `https://${env.COS_BUCKET}.cos.${env.COS_REGION}.myqcloud.com`
  return { url: `${host}/${remoteKey}`, name: '腾讯云 COS', raw: result }
}

async function uploadQiniu() {
  const qiniu = await import('qiniu')
  const mac = new qiniu.auth.digest.Mac(env.QINIU_ACCESS_KEY, env.QINIU_SECRET_KEY)
  const config = new qiniu.conf.Config()
  const bucket = env.QINIU_BUCKET
  const putPolicy = new qiniu.rs.PutPolicy({ scope: `${bucket}:${remoteKey}` })
  const uploadToken = putPolicy.uploadToken(mac)

  const formUploader = new qiniu.form_up.FormUploader(config)
  const putExtra = new qiniu.form_up.PutExtra()
  putExtra.mimeType = GLB_MIME

  await new Promise((res, rej) => {
    formUploader.putFile(uploadToken, remoteKey, filePath, putExtra, (err, body, info) => {
      if (err || info.statusCode !== 200) rej(err ?? new Error(JSON.stringify(body)))
      else res(body)
    })
  })
  return { url: `https://${env.QINIU_CDN_DOMAIN}/${remoteKey}`, name: '七牛云' }
}

function pickProvider() {
  if (env.OSS_BUCKET && env.OSS_ACCESS_KEY_ID) return { fn: uploadOSS, pkg: 'ali-oss', domain: env.OSS_CDN_DOMAIN }
  if (env.COS_BUCKET && env.COS_SECRET_ID) return { fn: uploadCOS, pkg: 'cos-nodejs-sdk-v5', domain: env.COS_CDN_DOMAIN }
  if (env.QINIU_BUCKET && env.QINIU_ACCESS_KEY) return { fn: uploadQiniu, pkg: 'qiniu', domain: env.QINIU_CDN_DOMAIN }
  return null
}

const provider = pickProvider()
if (!provider) {
  console.error(`
没找到对象存储配置。请复制 .env.example 为 .env 并填写其中一家：

  阿里云 OSS：OSS_REGION / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET / OSS_CDN_DOMAIN
  腾讯云 COS：COS_REGION / COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_CDN_DOMAIN
  七牛云：    QINIU_ACCESS_KEY / QINIU_SECRET_KEY / QINIU_BUCKET / QINIU_CDN_DOMAIN
`)
  process.exit(1)
}

console.log(`上传到 ${provider.name}: ${remoteKey}`)

let uploadResult
try {
  uploadResult = await provider.fn()
} catch (err) {
  if (String(err).includes('Cannot find module')) {
    console.error(`\n缺少 SDK，请先安装：npm i -D ${provider.pkg}\n`)
    process.exit(1)
  }
  throw err
}

// CDN 域名优先（源站域名通常不对外开放或很慢）
let publicUrl = uploadResult.url
if (provider.domain) {
  const domain = provider.domain.replace(/\/$/, '')
  publicUrl = `${domain}/${remoteKey}`
}
publicUrl = publicUrl.replace(/^http:/, 'https:')

console.log(`上传完成: ${publicUrl}`)

// ---------------------------------------------------------------- 验证

async function verify(url) {
  const problems = []

  if (!url.startsWith('https://')) {
    problems.push('不是 HTTPS —— 微信会直接拦截')
  }

  try {
    const res = await fetch(url, { method: 'GET' })

    if (!res.ok) {
      problems.push(`HTTP ${res.status} ${res.statusText}`)
      if (res.status === 403) {
        problems.push('403 多半是 CDN 没放行 .glb 后缀，去控制台加 MIME 类型或放开后缀限制')
      }
    } else {
      const type = res.headers.get('content-type') ?? ''
      const length = Number(res.headers.get('content-length') ?? 0)
      const buffer = await res.arrayBuffer()

      console.log(`  HTTP         ${res.status}`)
      console.log(`  Content-Type ${type || '(缺失)'}`)
      console.log(`  下载大小     ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`)

      if (!/model\/gltf-binary|application\/octet-stream/.test(type)) {
        problems.push(
          `Content-Type 是 "${type}"，建议改成 model/gltf-binary ` +
            `或 application/octet-stream（有些 CDN 会给 text/html，说明返回的是预览页不是文件）`
        )
      }

      if (length && length < 1024) {
        problems.push(`响应只有 ${length} 字节，很可能返回的是错误页而不是模型文件`)
      }

      // GLB 魔数校验：文件头必须是 "glTF"
      const head = new Uint8Array(buffer.slice(0, 4))
      const magic = String.fromCharCode(...head)
      if (magic !== 'glTF') {
        problems.push(`文件头是 "${magic}" 而不是 "glTF"，下载到的不是有效的 GLB`)
      } else {
        console.log('  文件头       glTF ✓')
      }
    }
  } catch (err) {
    problems.push(`请求失败: ${String(err)}`)
  }

  return problems
}

if (shouldVerify) {
  console.log('\n验证可下载性…')
  const problems = await verify(publicUrl)

  if (problems.length) {
    console.log('\n✗ 存在问题：')
    for (const p of problems) console.log(`  - ${p}`)
    process.exitCode = 1
  } else {
    console.log('\n✓ HTTPS、MIME、文件内容都正常')
  }
}

// ---------------------------------------------------------------- 后续配置

console.log(`
${'─'.repeat(60)}
下一步：配置小程序域名白名单（真机必需）

  1. 打开 https://mp.weixin.qq.com
  2. 开发管理 → 开发设置 → 服务器域名
  3. 在 downloadFile 合法域名 里加上：

     https://${new URL(publicUrl).host}

  · 只在开发者工具里测：详情 → 本地设置 → 勾选「不校验合法域名」
  · 体验版/正式版必须配，否则下载被拦，控制台会报
    [xr-comp] cube-model loadAsset failed

  注意域名白名单一个月只能改 5 次，一次配齐。
`)
