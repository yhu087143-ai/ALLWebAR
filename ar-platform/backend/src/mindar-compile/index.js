/**
 * 图片 → .mind 编译模块
 *
 * 使用 Jimp（纯 JS）加载图片，然后通过 MindAR 的 OfflineCompiler
 * 提取特征点并生成 .mind 追踪文件。
 *
 * Canvas mock 负责接管原生 canvas 模块（因为缺少 C++ 编译工具链），
 * 改为用 Jimp 的像素数据模拟画布操作。
 */

import { Jimp } from 'jimp';
import { OfflineCompiler } from './compiler.js';

/**
 * 将图片文件编译为 .mind 格式
 * @param {string} imagePath  图片文件路径
 * @param {Function} [onProgress]  进度回调 (0–1)
 * @returns {Promise<{data: Buffer, metadata: {width: number, height: number}}>}
 */
export async function compileImage(imagePath, onProgress) {
  let lastPct = 0;
  const progressCb = (pct) => {
    lastPct = pct;
    onProgress?.(pct / 100);
  };

  // 1. 用 Jimp 加载图片
  const img = await Jimp.read(imagePath);
  const { width, height } = img.bitmap;

  // 2. 提取 RGBA 像素数据（Jimp 默认格式）
  const rgbaPixels = new Uint8ClampedArray(img.bitmap.data.buffer);

  // 3. 构造一个“伪 HTML Image”对象，让 Canvas mock 认得
  const fakeImage = {
    width,
    height,
    _pixelData: rgbaPixels,
    // Jimp 用的 RGBA，和 Canvas 原生顺序一致
  };

  // 4. 调用 OfflineCompiler 编译
  const compiler = new OfflineCompiler();
  const results = await compiler.compileImageTargets([fakeImage], progressCb);

  // 5. 导出为 .mind 二进制
  const exported = compiler.exportData();
  const mindBuffer = Buffer.from(exported);

  return {
    data: mindBuffer,
    metadata: { width, height },
  };
}

export default { compileImage };
