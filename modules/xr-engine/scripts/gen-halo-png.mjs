// 生成 128x128 白色光晕 PNG（柔和径向衰减 + 内核稍亮），供常驻 billboard 光晕粒子使用
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const W = 128, H = 128
const raw = Buffer.alloc((W * 4 + 1) * H)
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0
  for (let x = 0; x < W; x++) {
    const dx = (x - 63.5) / 62, dy = (y - 63.5) / 62
    const d = Math.sqrt(dx * dx + dy * dy)
    let a = Math.max(0, 1 - d)
    a = Math.pow(a, 2.6) * 0.9 + Math.pow(Math.max(0, 1 - d / 0.28), 2) * 0.25
    a = Math.min(1, a)
    const i = y * (W * 4 + 1) + 1 + x * 4
    raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255
    raw[i + 3] = Math.round(a * 255)
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

const out = new URL('../public/fx-halo.png', import.meta.url).pathname
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, png)
console.log('saved', out, png.length, 'bytes')
