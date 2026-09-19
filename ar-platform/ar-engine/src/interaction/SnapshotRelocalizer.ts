import * as THREE from 'three'

export interface RelocalizerResult {
  /** 是否匹配成功（已超过时序一致性阈值） */
  matched: boolean
  /** 当前 ZNCC 值 */
  zncc: number
  /**
   * 增量漂移修正量（SLAM 世界空间）
   * 调用方应执行：placedObject.position.sub(driftDelta)
   * matched=false 时 driftDelta 为 null
   */
  driftDelta: THREE.Vector3 | null
  /**
   * 增量旋转漂移修正（四元数差值）
   * 调用方应执行：placedObject.quaternion.premultiply(driftRotDelta)
   */
  driftRotDelta: THREE.Quaternion | null
}

// ── 参考帧银行条目 ──

interface BankFrame {
  grid: Float64Array
  mean: number
  denom: number        // Σ(grid-mean)² 预计算分母
  pos: THREE.Vector3
  quat: THREE.Quaternion
}

/**
 * 快照重定位器 v4 — ZNCC + 多参考帧银行 + 晃动恢复
 *
 * 原理：
 *   放置物体时截取 16×12 亮度网格作为主参考帧。
 *   运行时每帧用 ZNCC 比对当前画面与所有参考帧（主帧 + 银行帧）。
 *   最佳匹配超过阈值 → 认为回到该参考帧的物理视角 → 姿态差值 = SLAM 漂移
 *   → 将物体位置反向移动漂移量以修正。
 *
 *   用户走动时自动收集新的参考帧，覆盖走过的各个位置。
 *   晃动结束后，恢复机制用更低阈值快速触发修正。
 *
 * 相比 v3 的改进：
 *   - 单参考帧 → 多参考帧银行（20 帧循环缓冲）
 *   - 用户走动时自动收集不同位置的参考帧
 *   - 回到任意已访问位置都能恢复，不限于放置点
 *
 * 相比 v2 的改进：
 *   - 晃动检测 + 恢复模式 + 评估间隔优化
 *   - 多参考帧银行
 *
 * 相比 v1 的改进：
 *   - 余弦相似度 → 真 ZNCC（均值减除），抗自动曝光变化
 *   - 32×24 网格，提升区分度
 *   - 增量修正（每次只修当前帧到参考帧的差值），避免积累误差
 *   - 姿态差值修正（非陀螺仪 slerp，适配 SLAM）
 *   - try/catch 保护，异常时静默回退
 */
export class SnapshotRelocalizer {
  /** 网格宽度 */
  private readonly GW = 32
  /** 网格高度 */
  private readonly GH = 24
  /** ZNCC 触发阈值（0.78：32×24 网格下平衡误触发与灵敏度，配合 CONSECUTIVE_MIN=3 防假阳） */
  private readonly ZNCC_THRESHOLD = 0.78
  // 恢复路径已移除（2026-05-22）：阈值 0.65 太低，每次用户变换视角后 ZNCC 回升就会误触发
  /** 亮度方差下限，低于此值时画面无特征 */
  private readonly SIGNAL_MIN = 2.0
  /** 评估间隔帧数（降低频率减少误触发机会） */
  private readonly EVAL_INTERVAL = 12
  /** 触发修正所需的最低连续高 ZNCC 帧数 */
  private readonly CONSECUTIVE_MIN = 3
  /** 进入晃动状态的 ZNCC 上限 */
  private readonly MOTION_ZNCC_MAX = 0.35
  /** 进入晃动状态所需的连续低 ZNCC 次数 */
  private readonly MOTION_ENTER_COUNT = 3
  /** 单次最大修正量（米） */
  private readonly MAX_DRIFT_M = 0.30
  /** 最小修正阈值 — 低于此值的漂移忽略（防噪声误触发） */
  private readonly MIN_DRIFT_M = 0.03
  /** 参考帧银行最大容量 */
  private readonly BANK_CAPACITY = 12
  /** 自动收集参考帧的 ZNCC 上限（低于此值视为新视角） */
  private readonly AUTO_COLLECT_MAX_ZNCC = 0.50
  /** 自动收集参考帧的 ZNCC 下限（低于此值视为画面质量不够） */
  private readonly AUTO_COLLECT_MIN_ZNCC = 0.15
  /** 自动收集的最小帧间隔 */
  private readonly COLLECT_INTERVAL = 48

  // Canvas 与像素数据
  private _canvas: HTMLCanvasElement | null = null
  private _ctx: CanvasRenderingContext2D | null = null
  /** 特征检测用 160×120 canvas（同 VisualFeatureTracker 分辨率） */
  private _ref = new Float64Array(this.GW * this.GH)
  private _cur = new Float64Array(this.GW * this.GH)

  // 主参考帧的 SLAM 相机姿态
  private _refPos = new THREE.Vector3()
  private _refQuat = new THREE.Quaternion()
  // 预计算的主参考帧均值
  private _refMean = 0

  // ── 多参考帧银行 ──
  private _bank: BankFrame[] = []
  private _collectCounter = 0

  private _captured = false
  private _frameCount = 0
  private _consecutiveHits = 0

  // 晃动检测
  private _inMotion = false
  private _lowZnccCount = 0

  // 统计
  private _totalCorrections = 0
  private _lastZncc = 0

  /** 是否已捕获参考帧 */
  get captured(): boolean { return this._captured }
  /** 最近一次 ZNCC 值 */
  get lastZncc(): number { return this._lastZncc }
  /** 累计修正次数 */
  get totalCorrections(): number { return this._totalCorrections }
  /** 是否处于运动检测状态 */
  get inMotion(): boolean { return this._inMotion }
  /** 当前连续命中帧数 */
  get consecutiveHits(): number { return this._consecutiveHits }
  /** 银行帧数量 */
  get bankSize(): number { return this._bank.length }

  /**
   * 放置时取景 — 捕获主参考帧
   */
  capture(
    video: HTMLVideoElement,
    cameraPos: THREE.Vector3,
    cameraQuat: THREE.Quaternion,
  ): void {
    try {
      if (!this._canvas) {
        this._canvas = document.createElement('canvas')
        this._canvas.width = this.GW
        this._canvas.height = this.GH
        this._ctx = this._canvas.getContext('2d', { willReadFrequently: true })!
      }

      const ctx = this._ctx!
      ctx.drawImage(video, 0, 0, this.GW, this.GH)
      const img = ctx.getImageData(0, 0, this.GW, this.GH)
      const ref = this._ref

      // 提取亮度 + 计算方差
      let sum = 0, sumSq = 0
      for (let i = 0; i < this.GW * this.GH; i++) {
        const lum =
          0.299 * img.data[i * 4] +
          0.587 * img.data[i * 4 + 1] +
          0.114 * img.data[i * 4 + 2]
        ref[i] = lum
        sum += lum
        sumSq += lum * lum
      }

      const n = this.GW * this.GH
      const variance = (sumSq / n) - (sum / n) ** 2
      if (variance < this.SIGNAL_MIN) {
        this._captured = false
        console.warn('[SnapshotRelocalizer] 画面无特征，跳过捕获')
        return
      }

      this._refPos.copy(cameraPos)
      this._refQuat.copy(cameraQuat)

      let refSum = 0
      for (let i = 0; i < this.GW * this.GH; i++) refSum += ref[i]
      this._refMean = refSum / (this.GW * this.GH)

      // 清空银行（新放置周期）
      this._bank = []
      this._collectCounter = 0

      // 将主帧也加入银行作为 frame 0
      this._pushBankFrame(ref, this._refMean, cameraPos, cameraQuat)

      this._captured = true
      this._frameCount = 0
      this._consecutiveHits = 0
      this._totalCorrections = 0
      this._lastZncc = 0
      this._inMotion = false
      this._lowZnccCount = 0
    } catch (e) {
      this._captured = false
      console.warn('[SnapshotRelocalizer] capture 异常:', e)
    }
  }

  // 可重用对象减少 GC
  private _tempV3 = new THREE.Vector3()
  private _tempQ = new THREE.Quaternion()
  private _tempV3B = new THREE.Vector3()
  private _tempQB = new THREE.Quaternion()

  /**
   * 每帧调用，返回是否匹配成功及漂移修正量
   */
  evaluate(
    video: HTMLVideoElement,
    cameraPos: THREE.Vector3,
    cameraQuat: THREE.Quaternion,
  ): RelocalizerResult {
    if (!this._captured || !this._canvas || !this._ctx) {
      return { matched: false, zncc: 0, driftDelta: null, driftRotDelta: null }
    }

    this._frameCount++
    if (this._frameCount % this.EVAL_INTERVAL !== 0) {
      return { matched: false, zncc: this._lastZncc, driftDelta: null, driftRotDelta: null }
    }

    try {
      const ctx = this._ctx!
      ctx.drawImage(video, 0, 0, this.GW, this.GH)
      const img = ctx.getImageData(0, 0, this.GW, this.GH)
      const cur = this._cur
      const ref = this._ref

      // 1. 提取当前帧亮度
      let curSum = 0, curSumSq = 0
      for (let i = 0; i < this.GW * this.GH; i++) {
        const lum =
          0.299 * img.data[i * 4] +
          0.587 * img.data[i * 4 + 1] +
          0.114 * img.data[i * 4 + 2]
        cur[i] = lum
        curSum += lum
        curSumSq += lum * lum
      }

      if (curSumSq < 1) {
        this._lastZncc = 0
        return { matched: false, zncc: 0, driftDelta: null, driftRotDelta: null }
      }

      // 2. 计算 ZNCC 与主参考帧
      const n = this.GW * this.GH
      const refMean = this._refMean
      const curMean = curSum / n

      let num = 0, denRef = 0, denCur = 0
      for (let i = 0; i < n; i++) {
        const r = ref[i] - refMean
        const c = cur[i] - curMean
        num += r * c
        denRef += r * r
        denCur += c * c
      }

      const denPri = Math.sqrt(denRef * denCur)
      let bestZncc = denPri > 1e-8 ? num / denPri : 0
      let bestIsPrimary = true

      // 匹配用的参考位姿（默认主帧）
      let matchPos = this._refPos
      let matchQuat = this._refQuat
      let matchFrame: BankFrame | null = null  // 匹配的银行帧对象（用于特征验证）

      // 3. 遍历参考帧银行
      if (this._bank.length > 0) {
        for (const frame of this._bank) {
          let numB = 0
          for (let i = 0; i < n; i++) {
            numB += (cur[i] - curMean) * (frame.grid[i] - frame.mean)
          }
          const denB = Math.sqrt(denCur * frame.denom)
          const znccB = denB > 1e-8 ? numB / denB : 0
          if (znccB > bestZncc) {
            bestZncc = znccB
            bestIsPrimary = false
            matchPos = frame.pos
            matchQuat = frame.quat
            matchFrame = frame
          }
        }
      }

      this._lastZncc = bestZncc

      // 4. 晃动检测（仅诊断用途，不做恢复修正 — 恢复路径误触发率太高）
      if (bestZncc < this.MOTION_ZNCC_MAX) {
        this._lowZnccCount++
        if (this._lowZnccCount >= this.MOTION_ENTER_COUNT) {
          this._inMotion = true
        }
      } else {
        this._lowZnccCount = Math.max(0, this._lowZnccCount - 1)
        if (this._lowZnccCount === 0 && this._inMotion) {
          this._inMotion = false
        }
      }

      // 5. 时序一致性 — 所有修正都走此路径（含恢复场景）
      const effectiveThreshold = this.ZNCC_THRESHOLD
      if (bestZncc >= effectiveThreshold) {
        this._consecutiveHits++
      } else {
        this._consecutiveHits = 0
      }

      // 6. 达到连续阈值 → 触发修正
      if (this._consecutiveHits >= this.CONSECUTIVE_MIN) {
        const driftPos = this._tempV3.copy(cameraPos).sub(matchPos)
        const driftLen = driftPos.length()
        if (driftLen < this.MIN_DRIFT_M || driftLen > this.MAX_DRIFT_M) {
          this._consecutiveHits = this.CONSECUTIVE_MIN - 1
          return { matched: false, zncc: bestZncc, driftDelta: null, driftRotDelta: null }
        }

        // 特征匹配验证 ZNCC 结果（暂时跳过）
        const featureOk = true

        const driftRot = this._tempQ.copy(cameraQuat).multiply(matchQuat.clone().invert())

        // 不更新银行帧位姿（2026-05-22 修复反馈循环）：
        // 之前每次修正后更新匹配银行帧的 pos → 下次 ZNCC 再次匹配时又算一次"漂移"
        // → 重复修正 → 物体随相机移动累积漂移。
        // 银行帧 pos 不变 → 每次修正都相对于同一参考位置 → 无累积。
        // 银行帧网格数据已包含该位置的视觉信息，位置更新既不必要且有害。

        this._consecutiveHits = 0
        this._totalCorrections++

        console.log(
          `[SnapshotRelocalizer] 修正 #${this._totalCorrections} ` +
          `zncc=${bestZncc.toFixed(3)} drift=${driftPos.length().toFixed(4)}m ` +
          `ref=${bestIsPrimary ? 'primary' : 'bank#' + this._bank.findIndex(bf => bf.pos === matchPos)}`
        )

        return {
          matched: true,
          zncc: bestZncc,
          driftDelta: driftPos.clone(),
          driftRotDelta: driftRot.clone(),
        }
      }

      // 7. 自动收集参考帧
      this._tryAutoCollect(video, cur, curMean, curSumSq, cameraPos, cameraQuat, bestZncc)

      return { matched: false, zncc: bestZncc, driftDelta: null, driftRotDelta: null }
    } catch (e) {
      console.warn('[SnapshotRelocalizer] evaluate 异常:', e)
      return { matched: false, zncc: 0, driftDelta: null, driftRotDelta: null }
    }
  }

  /**
   * 自动收集新参考帧
   * 条件：当前画面与所有已有帧都不匹配，且有足够纹理，并且位姿有显著变化
   */
  private _tryAutoCollect(
    video: HTMLVideoElement,
    cur: Float64Array,
    curMean: number,
    curSumSq: number,
    cameraPos: THREE.Vector3,
    cameraQuat: THREE.Quaternion,
    bestZncc: number,
  ): void {
    this._collectCounter++
    if (this._collectCounter < this.COLLECT_INTERVAL) return

    // 基础条件：当前画面是新视角（低 ZNCC）、有足够纹理、非晃动状态
    const isNewView = bestZncc < this.AUTO_COLLECT_MAX_ZNCC && bestZncc > this.AUTO_COLLECT_MIN_ZNCC
    const notInMotion = !this._inMotion
    const hasTexture = (curSumSq / (this.GW * this.GH)) - (curMean ** 2) >= this.SIGNAL_MIN

    // 位姿变化门控：与所有已有帧的视角差异必须 >15° 旋转或 >30cm 平移
    let poseSufficientlyDifferent = false
    if (isNewView && notInMotion && hasTexture) {
      poseSufficientlyDifferent = true
      for (const frame of this._bank) {
        const posDiff = cameraPos.distanceTo(frame.pos)
        const rotAngle = cameraQuat.angleTo(frame.quat)
        if (posDiff < 0.30 && rotAngle < 0.26) { // 30cm 且 15°
          poseSufficientlyDifferent = false
          break
        }
      }
    }

    if (poseSufficientlyDifferent) {
      this._pushBankFrame(cur, curMean, cameraPos, cameraQuat)
    }
  }

  /**
   * 压入银行帧（FIFO 溢出淘汰）
   */
  private _pushBankFrame(
    grid: Float64Array,
    mean: number,
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
  ): void {
    // 计算分母
    let denom = 0
    for (let i = 0; i < grid.length; i++) {
      const d = grid[i] - mean
      denom += d * d
    }

    const frame: BankFrame = {
      grid: new Float64Array(grid),
      mean,
      denom,
      pos: pos.clone(),
      quat: quat.clone(),
    }

    if (this._bank.length >= this.BANK_CAPACITY) {
      // 移除最旧的（skip frame 0 = 主帧）
      this._bank.splice(1, 1)
    }
    this._bank.push(frame)
    this._collectCounter = 0

    console.log(`[SnapshotRelocalizer] 收集参考帧 #${this._bank.length} zncc=${this._lastZncc.toFixed(3)}`)
  }

  /** 重置所有状态 */
  reset(): void {
    this._captured = false
    this._frameCount = 0
    this._consecutiveHits = 0
    this._totalCorrections = 0
    this._lastZncc = 0
    this._refMean = 0
    this._inMotion = false
    this._lowZnccCount = 0
    this._bank = []
  }

  }
