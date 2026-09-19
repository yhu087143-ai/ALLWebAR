/**
 * 极简 PNG 编码器 —— 只给「ComfyUI 未接入时的降级输出」用。
 *
 * 为什么不直接返回一张固定的占位图：
 *   1. 固定图无法区分不同任务，排查时看不出是哪个 prompt/seed 的结果；
 *   2. 引入 sharp/canvas 这类原生依赖会给后端加编译负担，而这里只需要一张
 *      可控的渐变+噪点图（尺寸、色调由 seed 决定），zlib 足够。
 */
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** 由 seed 推导一组稳定的色调，保证同一 seed 出图一致（便于复现与测试断言） */
function palette(seed) {
  const hue = (seed * 47) % 360;
  const toRgb = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const seg = Math.floor(h / 60) % 6;
    const rgb = [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ][seg];
    return rgb.map((v) => Math.round((v + m) * 255));
  };
  return {
    from: toRgb(hue, 0.62, 0.34),
    to: toRgb((hue + 58) % 360, 0.78, 0.72),
  };
}

/**
 * 生成一张 size×size 的 PNG（对角线渐变 + 稀疏亮点）。
 * @param {number} size 边长像素
 * @param {number} seed 随机种子
 * @returns {Buffer} PNG 字节
 */
export function makeGradientPng(size = 512, seed = 1) {
  const { from, to } = palette(seed);
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x += 1) {
      const t = (x + y) / (2 * size - 2);
      // 用确定性噪声打散渐变，避免生成图看起来像取色器
      const n = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) % 24;
      const i = rowStart + 1 + x * 3;
      raw[i] = Math.max(0, Math.min(255, Math.round(from[0] + (to[0] - from[0]) * t) + n));
      raw[i + 1] = Math.max(0, Math.min(255, Math.round(from[1] + (to[1] - from[1]) * t) - n));
      raw[i + 2] = Math.max(0, Math.min(255, Math.round(from[2] + (to[2] - from[2]) * t) + (n >> 1)));
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
