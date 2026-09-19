/**
 * VisualFeatureTracker — 轻量视觉特征点跟踪
 *
 * 从视频帧中提取 FAST 角点，通过模板匹配跟踪帧间移动，
 * 估算摄像头平移量，与陀螺仪旋转补偿互补。
 *
 * 流程：
 *   1. 每 N 帧检测 FAST 角点（当前帧）
 *   2. 对每个角点在上一帧做小窗口模板匹配
 *   3. RANSAC 估算帧间单应性/平移
 *   4. 输出归一化平移量 (dx, dy) + 置信度
 *
 * 纯 JS，无外部依赖。性能：~5-10ms/frame 在 160x120 分辨率。
 */

export interface FeatureTrackResult {
  /** 归一化平移 [-1, 1]，正值 = 右/下 */
  dx: number
  dy: number
  /** 置信度 0-1，低于阈值时应忽略此帧 */
  confidence: number
  /** 成功匹配的特征点数 */
  matchCount: number
  /** 检测到的总特征点数 */
  totalFeatures: number
}

// FAST-9 角点检测阈值（亮度差，移动端 160x120 降采样用 12，桌面 240x160 可用 20）
const FAST_THRESHOLD = 12
// 模板匹配窗口半径（像素）
const MATCH_RADIUS = 4
// 搜索窗口半径（像素）
const SEARCH_RADIUS = 8
// 最大特征点数
const MAX_FEATURES = 60
// RANSAC 内点距离阈值
const RANSAC_THRESHOLD = 2.0
// 每 N 帧重新检测特征点
const REDETECT_INTERVAL = 3

export class VisualFeatureTracker {
  private _canvas: HTMLCanvasElement
  private _ctx: CanvasRenderingContext2D

  // 上一帧灰度数据（plain object，不用 ImageData 避免 RGBA 长度限制）
  private _prevFrame: { data: Uint8ClampedArray; width: number; height: number } | null = null
  // 当前特征点 (x, y) 在上次检测时的位置
  private _prevKeypoints: Array<{ x: number; y: number }> = []
  // 帧计数器
  private _frameCount = 0
  // 平滑后的平移量（指数平滑）
  private _smoothDx = 0
  private _smoothDy = 0
  // 跟踪健康度
  private _health = 0
  // 平滑后的特征计数（防传感器噪声导致每帧波动）
  private _smoothedFeatures = 0

  // 配置参数
  private _width: number
  private _height: number

  constructor(width = 160, height = 120) {
    this._width = width
    this._height = height
    this._canvas = document.createElement('canvas')
    this._canvas.width = width
    this._canvas.height = height
    this._ctx = this._canvas.getContext('2d')!
  }

  /**
   * 处理一帧视频，返回平移估计
   * @param video HTMLVideoElement
   * @param forceRedetect 强制重新检测特征点
   */
  track(video: HTMLVideoElement): FeatureTrackResult {
    this._frameCount++

    // 1. 将视频帧缩放到小灰度图
    const ctx = this._ctx
    let currData: ImageData
    try {
      ctx.drawImage(video, 0, 0, this._width, this._height)
      currData = ctx.getImageData(0, 0, this._width, this._height)
    } catch {
      this._smoothedFeatures *= 0.85
      return { dx: 0, dy: 0, confidence: 0, matchCount: 0, totalFeatures: Math.round(this._smoothedFeatures) }
    }

    // 2. 转灰度
    const gray = this._toGrayscale(currData)

    // 3. 如果是第一帧，只检测特征点
    if (!this._prevFrame || this._prevKeypoints.length === 0) {
      this._prevFrame = gray
      this._prevKeypoints = this._detectCorners(gray)
      this._smoothedFeatures = this._prevKeypoints.length
      return { dx: 0, dy: 0, confidence: 0, matchCount: 0, totalFeatures: this._prevKeypoints.length }
    }

    // 4. 每 N 帧或特征点不足时重新检测
    if (this._frameCount % REDETECT_INTERVAL === 0 || this._prevKeypoints.length < 10) {
      this._prevKeypoints = this._detectCorners(gray)
    }

    // 5. 跟踪特征点：模板匹配
    const matches = this._trackFeatures(this._prevFrame, gray, this._prevKeypoints)

    // 6. RANSAC 估算平移
    const { dx, dy, inlierCount } = this._ransacTranslate(matches, this._prevKeypoints)

    // 7. 更新上一帧（用循环保持索引与 matches 对齐，fix filter+map 索引错位）
    this._prevFrame = gray
    const newKps: Array<{ x: number; y: number }> = []
    for (let i = 0; i < this._prevKeypoints.length; i++) {
      if (matches[i].tracked) {
        newKps.push({ x: matches[i].nx, y: matches[i].ny })
      }
    }
    this._prevKeypoints = newKps

    // 8. 平滑特征计数
    this._smoothedFeatures = this._smoothedFeatures * 0.85 + this._prevKeypoints.length * 0.15

    // 9. 平滑
    const confidence = this._prevKeypoints.length > 0 ? inlierCount / this._prevKeypoints.length : 0
    const alpha = 0.3
    this._smoothDx = this._smoothDx * (1 - alpha) + dx * alpha
    this._smoothDy = this._smoothDy * (1 - alpha) + dy * alpha

    // 健康度
    if (confidence > 0.3) this._health = Math.min(1, this._health + 0.05)
    else this._health = Math.max(0, this._health - 0.05)

    return {
      dx: this._smoothDx,
      dy: this._smoothDy,
      confidence: confidence * this._health,
      matchCount: inlierCount,
      totalFeatures: Math.round(this._smoothedFeatures),
    }
  }

  /** 重置跟踪状态 */
  reset(): void {
    this._prevFrame = null
    this._prevKeypoints = []
    this._frameCount = 0
    this._smoothDx = 0
    this._smoothDy = 0
    this._health = 0
    this._smoothedFeatures = 0
  }

  // ── 私有方法 ──

  /** RGBA → 灰度（返回 plain object，避免 ImageData RGBA 长度限制） */
  private _toGrayscale(data: ImageData): { data: Uint8ClampedArray; width: number; height: number } {
    const gray = new Uint8ClampedArray(data.width * data.height)
    const d = data.data
    for (let i = 0; i < gray.length; i++) {
      const j = i * 4
      // 亮度权重: 0.299 R + 0.587 G + 0.114 B
      gray[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8
    }
    return { data: gray, width: data.width, height: data.height }
  }

  /** FAST-9 角点检测 */
  private _detectCorners(gray: { data: Uint8ClampedArray; width: number; height: number }): Array<{ x: number; y: number; score: number }> {
    const w = gray.width
    const h = gray.height
    const pixels = gray.data
    const corners: Array<{ x: number; y: number; score: number }> = []

    // FAST-9: 检查圆心像素与周围 16 个像素的差异
    // 只在 (3, 3) 到 (w-4, h-4) 范围内检测
    for (let y = 3; y < h - 3; y++) {
      for (let x = 3; x < w - 3; x++) {
        const center = pixels[y * w + x]
        const threshold = FAST_THRESHOLD

        // 快速测试: 检查 4 个正交方向点
        const pUp = pixels[(y - 3) * w + x]
        const pDown = pixels[(y + 3) * w + x]
        const pLeft = pixels[y * w + x - 3]
        const pRight = pixels[y * w + x + 3]

        const brightCount = (pUp > center + threshold ? 1 : 0)
          + (pDown > center + threshold ? 1 : 0)
          + (pLeft > center + threshold ? 1 : 0)
          + (pRight > center + threshold ? 1 : 0)
        const darkCount = (pUp < center - threshold ? 1 : 0)
          + (pDown < center - threshold ? 1 : 0)
          + (pLeft < center - threshold ? 1 : 0)
          + (pRight < center - threshold ? 1 : 0)

        // 至少需要 3/4 正交点满足条件才有可能是角点
        if (brightCount < 3 && darkCount < 3) continue

        // 完整 FAST-9 检测: 16 个点中至少 9 个连续满足条件
        const b = new Array(16)
        for (let i = 0; i < 16; i++) {
          const px = x + Math.round(3 * Math.cos(i * Math.PI / 8))
          const py = y + Math.round(3 * Math.sin(i * Math.PI / 8))
          const v = pixels[py * w + px]
          b[i] = v > center + threshold ? 1 : v < center - threshold ? -1 : 0
        }

        // 检查连续 >= 9 个 +1 或 -1
        const isCorner = this._checkFAST9(b)
        if (!isCorner) continue

        // 计算角点得分（与邻居的差异总和）
        let score = 0
        for (let i = 0; i < 16; i++) {
          score += Math.abs(b[i])
        }

        corners.push({ x, y, score })
      }
    }

    // 按得分排序，保留前 N 个
    corners.sort((a, b) => b.score - a.score)
    // 非极大值抑制：移除太近的点
    const result: Array<{ x: number; y: number; score: number }> = []
    for (const c of corners) {
      let tooClose = false
      for (const r of result) {
        const dist2 = (c.x - r.x) ** 2 + (c.y - r.y) ** 2
        if (dist2 < 25) { // 5px 半径
          tooClose = true
          break
        }
      }
      if (!tooClose) {
        result.push(c)
        if (result.length >= MAX_FEATURES) break
      }
    }

    return result
  }

  /** 检查 FAST-9 连续 9 个点 */
  private _checkFAST9(b: number[]): boolean {
    // 检查连续 >= 9 个 +1
    let count = 0
    for (let i = 0; i < 32; i++) {
      const idx = i % 16
      if (b[idx] === 1) {
        count++
        if (count >= 9) return true
      } else {
        count = 0
      }
    }

    // 检查连续 >= 9 个 -1
    count = 0
    for (let i = 0; i < 32; i++) {
      const idx = i % 16
      if (b[idx] === -1) {
        count++
        if (count >= 9) return true
      } else {
        count = 0
      }
    }

    return false
  }

  /** 对每个特征点在上一帧做模板匹配跟踪 */
  private _trackFeatures(
    prevGray: { data: Uint8ClampedArray; width: number; height: number },
    currGray: { data: Uint8ClampedArray; width: number; height: number },
    keypoints: Array<{ x: number; y: number }>
  ): Array<{ tracked: boolean; nx: number; ny: number; error: number }> {
    const w = currGray.width
    const h = currGray.height
    const prevPixels = prevGray.data
    const currPixels = currGray.data

    return keypoints.map(kp => {
      const x = Math.round(kp.x)
      const y = Math.round(kp.y)

      // 边界检查
      if (x < MATCH_RADIUS || x >= w - MATCH_RADIUS || y < MATCH_RADIUS || y >= h - MATCH_RADIUS) {
        return { tracked: false, nx: x, ny: y, error: Infinity }
      }

      // 在上一帧提取模板
      const tmpl: number[] = []
      for (let ty = -MATCH_RADIUS; ty <= MATCH_RADIUS; ty++) {
        for (let tx = -MATCH_RADIUS; tx <= MATCH_RADIUS; tx++) {
          tmpl.push(prevPixels[(y + ty) * w + (x + tx)])
        }
      }

      // 在当前帧的搜索窗口内找最佳匹配
      let bestError = Infinity
      let bestNX = x
      let bestNY = y
      const searchSize = SEARCH_RADIUS

      for (let sy = -searchSize; sy <= searchSize; sy++) {
        for (let sx = -searchSize; sx <= searchSize; sx++) {
          const nx = x + sx
          const ny = y + sy
          if (nx < MATCH_RADIUS || nx >= w - MATCH_RADIUS || ny < MATCH_RADIUS || ny >= h - MATCH_RADIUS) continue

          // SSD 误差
          let error = 0
          let ti = 0
          for (let ty = -MATCH_RADIUS; ty <= MATCH_RADIUS; ty++) {
            for (let tx = -MATCH_RADIUS; tx <= MATCH_RADIUS; tx++) {
              const diff = tmpl[ti] - currPixels[(ny + ty) * w + (nx + tx)]
              error += diff * diff
              ti++
            }
          }

          if (error < bestError) {
            bestError = error
            bestNX = nx
            bestNY = ny
          }
        }
      }

      // 误差阈值判断
      const tracked = bestError < 4000 && bestError < Number.MAX_SAFE_INTEGER
      return { tracked, nx: bestNX, ny: bestNY, error: bestError }
    })
  }

  /** RANSAC 估算平移量 */
  private _ransacTranslate(
    matches: Array<{ tracked: boolean; nx: number; ny: number; error: number }>,
    keypoints?: Array<{ x: number; y: number }>
  ): { dx: number; dy: number; inlierCount: number } {
    // 如果没传入 keypoints，构造
    if (!keypoints) return { dx: 0, dy: 0, inlierCount: 0 }

    let bestDx = 0
    let bestDy = 0
    let bestInliers = 0

    const tracked: Array<{ ox: number; oy: number; nx: number; ny: number }> = []
    for (let i = 0; i < matches.length; i++) {
      if (matches[i].tracked) {
        tracked.push({
          ox: keypoints[i].x,
          oy: keypoints[i].y,
          nx: matches[i].nx,
          ny: matches[i].ny,
        })
      }
    }

    if (tracked.length < 4) return { dx: 0, dy: 0, inlierCount: 0 }

    // RANSAC: 随机采样 2 对点估算平移
    const iterations = Math.min(50, tracked.length * 2)
    for (let iter = 0; iter < iterations; iter++) {
      // 随机选一对点
      const i = Math.floor(Math.random() * tracked.length)
      const j = Math.floor(Math.random() * tracked.length)
      if (i === j) continue

      const dx1 = tracked[i].nx - tracked[i].ox
      const dy1 = tracked[i].ny - tracked[i].oy
      const dx2 = tracked[j].nx - tracked[j].ox
      const dy2 = tracked[j].ny - tracked[j].oy

      // 取平均
      const guessDx = (dx1 + dx2) / 2
      const guessDy = (dy1 + dy2) / 2

      let inliers = 0
      for (const t of tracked) {
        const errX = Math.abs((t.nx - t.ox) - guessDx)
        const errY = Math.abs((t.ny - t.oy) - guessDy)
        if (errX < RANSAC_THRESHOLD && errY < RANSAC_THRESHOLD) {
          inliers++
        }
      }

      if (inliers > bestInliers) {
        bestInliers = inliers
        bestDx = guessDx
        bestDy = guessDy
      }
    }

    // 归一化到 [-1, 1]
    const w = this._width
    const h = this._height
    return {
      dx: bestDx / w,
      dy: bestDy / h,
      inlierCount: bestInliers,
    }
  }
}
