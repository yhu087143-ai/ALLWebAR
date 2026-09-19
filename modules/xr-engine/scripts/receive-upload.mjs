 /**
 * 本地文件接收服务（临时工具）：
 * 接收浏览器 POST 的文本并写入微信小程序项目目录。
 * 用法：node scripts/receive-upload.mjs
 * POST /save?name=utils/xxx.js  body = 文件文本
 * 仅允许写入 <local>\WeChatProjects\miniprogram-7 下的文件。
 */
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'

const ROOT = 'C:\\Users\\hy\\WeChatProjects\\miniprogram-7'
const PORT = 9911

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname !== '/save') {
    res.writeHead(404).end('not found')
    return
  }
  const rel = url.searchParams.get('name') ?? ''
  const target = path.join(ROOT, rel)
  if (!path.resolve(target).startsWith(path.resolve(ROOT))) {
    res.writeHead(403).end('forbidden')
    return
  }
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, body, 'utf8')
    console.log(`saved ${target} (${body.length} chars)`)
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok')
  })
})

server.listen(PORT, '127.0.0.1', () => console.log(`receive-upload listening on http://127.0.0.1:${PORT}`))
