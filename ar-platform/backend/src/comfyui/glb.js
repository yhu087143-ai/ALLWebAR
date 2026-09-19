/**
 * 把一张图片包成最小可用的 GLB（1m 宽的贴图平面）。
 *
 * 为什么需要它：
 *   XR 引擎的 AI 面板走的是「拿到 resultUrl → 当 GLB 载入场景」这条链路
 *   （ModelPipeline 会再走 optimizeGLB）。ComfyUI 出的是 PNG，
 *   直接返回图片会让引擎按 GLB 解析而报错。包一层贴图平面之后，
 *   「生成一张贴图」在 AR 里就能立刻变成一个看得见、可摆放的物体。
 *
 * 结构按 glTF 2.0 规范手工拼：JSON 块 + BIN 块，PNG 作为 bufferView 内嵌，
 * 不依赖任何第三方库（后端保持零新增依赖）。
 */

const MAGIC = 0x46546c67; // 'glTF'
const JSON_CHUNK = 0x4e4f534a; // 'JSON'
const BIN_CHUNK = 0x004e4942; // 'BIN\0'

const pad4 = (n) => (n + 3) & ~3;

/**
 * @param {Buffer} png 图片字节
 * @param {{width?: number, height?: number, name?: string}} meta 图片像素尺寸
 * @returns {Buffer} GLB 字节
 */
export function imageToGlb(png, meta = {}) {
  const aspect = meta.width && meta.height ? meta.height / meta.width : 1;
  const height = Math.round(aspect * 1000) / 1000;

  // 平面顶点（XY 面向 +Z，单位米，宽 1m）
  const positions = new Float32Array([
    -0.5, -height / 2, 0,
    0.5, -height / 2, 0,
    0.5, height / 2, 0,
    -0.5, height / 2, 0,
  ]);
  const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  const posBytes = Buffer.from(positions.buffer);
  const uvBytes = Buffer.from(uvs.buffer);
  const idxBytes = Buffer.from(indices.buffer);
  // 图片必须 4 字节对齐起点，否则部分解码器会直接拒绝
  const idxOffset = pad4(posBytes.length + uvBytes.length);
  const imgOffset = pad4(idxOffset + idxBytes.length);
  const binLength = imgOffset + png.length;

  const bin = Buffer.alloc(pad4(binLength));
  posBytes.copy(bin, 0);
  uvBytes.copy(bin, posBytes.length);
  idxBytes.copy(bin, idxOffset);
  png.copy(bin, imgOffset);

  const json = {
    asset: { version: '2.0', generator: 'ar-platform · comfyui bridge' },
    scene: 0,
    scenes: [{ name: 'Generated', nodes: [0] }],
    nodes: [{ name: meta.name || 'ComfyUI 产物', mesh: 0 }],
    meshes: [
      {
        name: 'GeneratedPlane',
        primitives: [
          {
            attributes: { POSITION: 0, TEXCOORD_0: 1 },
            indices: 2,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: 'GeneratedSurface',
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0, texCoord: 0 },
          metallicFactor: 0,
          roughnessFactor: 0.85,
        },
      },
    ],
    textures: [{ sampler: 0, source: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: [{ bufferView: 3, mimeType: 'image/png' }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: 'VEC3',
        min: [-0.5, -height / 2, 0],
        max: [0.5, height / 2, 0],
      },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length, byteLength: uvBytes.length, target: 34962 },
      { buffer: 0, byteOffset: idxOffset, byteLength: idxBytes.length, target: 34963 },
      { buffer: 0, byteOffset: imgOffset, byteLength: png.length },
    ],
    buffers: [{ byteLength: bin.length }],
  };

  const jsonRaw = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.alloc(pad4(jsonRaw.length), 0x20); // JSON 块用空格补齐
  jsonRaw.copy(jsonPadded);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + bin.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(BIN_CHUNK, 4);

  return Buffer.concat([header, jsonHeader, jsonPadded, binHeader, bin]);
}

/** 从 PNG 的 IHDR 里读像素尺寸（避免为了拿宽高再引一个图片库） */
export function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
