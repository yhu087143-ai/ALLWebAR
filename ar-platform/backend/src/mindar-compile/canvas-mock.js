/**
 * Canvas 模块 Mock
 *
 * 替换原生 `canvas` 包（需要 C++ 编译工具链）。
 * 用纯 JS 模拟画布 2D 上下文的基本 API，底层读取 Jimp 像素数据。
 */

class MockCanvasRenderingContext2D {
  constructor(width, height) {
    this._width = width;
    this._height = height;
    this._imageData = null;
  }

  /**
   * "绘制"图片 —— 实质是从我们传入的自定义对象中提取像素数据
   */
  drawImage(image, dx, dy, dw, dh) {
    // image 是 { width, height, _pixelData: Uint8ClampedArray }
    this._storedImage = image;
  }

  /**
   * 返回像素数据（RGBA 格式）
   */
  getImageData(sx, sy, sw, sh) {
    if (this._storedImage && this._storedImage._pixelData) {
      return {
        data: this._storedImage._pixelData,
        width: this._storedImage.width,
        height: this._storedImage.height,
      };
    }
    // 回退：全透明黑
    const fallback = new Uint8ClampedArray(sw * sh * 4);
    return { data: fallback, width: sw, height: sh };
  }
}

class MockCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  getContext(contextType) {
    if (contextType === '2d') {
      return new MockCanvasRenderingContext2D(this.width, this.height);
    }
    throw new Error(`Unsupported context type: ${contextType}`);
  }
}

/**
 * 创建模拟画布
 */
export function createCanvas(width, height) {
  return new MockCanvas(width, height);
}
