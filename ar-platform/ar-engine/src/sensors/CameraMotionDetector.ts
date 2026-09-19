/**
 * CameraMotionDetector
 *
 * Detects whether the phone is physically stationary by analysing
 * consecutive camera frames at low resolution.
 *
 * How it works:
 *  1. Draws a camera frame into an offscreen canvas at ~80×60 resolution
 *  2. Computes mean absolute pixel difference from the previous frame
 *  3. Below threshold → phone is stationary
 *
 * The stationary signal is consumed by drift correction logic:
 *  - When stationary: drift correction can be more aggressive
 *    (any detected orientation change is likely drift, not real motion)
 *  - When moving: drift correction backs off
 *
 * Performance: < 1ms per check at 80×60 resolution, sampled every ~5 frames.
 *
 * Reference: OpenCV camera motion detection,
 * https://docs.opencv.org/4.x/dc/deb/tutorial_introduction_to_sfm.html
 */

export class CameraMotionDetector {
  /** Current stationary estimate (true = phone is still) */
  private _isStationary = false
  /** Confidence [0-1] in the stationary estimate */
  private _confidence = 0

  // Offscreen canvas for pixel-diff
  private _canvas: HTMLCanvasElement | null = null
  private _ctx: CanvasRenderingContext2D | null = null
  private _prevFrame: Uint8Array | null = null

  // Configuration
  private readonly _width = 80
  private readonly _height = 60
  private readonly _threshold: number
  private readonly _sampleInterval: number

  private _frameCount = 0
  private _running = false

  /**
   * @param threshold Pixel diff threshold (0-255, default 3.0).
   *                  Lower = more sensitive to motion.
   * @param sampleInterval Check every N frames (default 5).
   */
  constructor(threshold = 3.0, sampleInterval = 5) {
    this._threshold = threshold
    this._sampleInterval = sampleInterval
  }

  get isStationary(): boolean {
    return this._isStationary
  }

  get confidence(): number {
    return this._confidence
  }

  /**
   * Start detection using a given video element
   */
  start(video: HTMLVideoElement): void {
    if (this._running) return
    this._running = true

    this._canvas = document.createElement('canvas')
    this._canvas.width = this._width
    this._canvas.height = this._height
    this._ctx = this._canvas.getContext('2d')!
    this._frameCount = 0
    this._prevFrame = null
    this._isStationary = false
    this._confidence = 0
  }

  /**
   * Call every render frame. Returns true if the phone is likely stationary.
   * Only processes every `_sampleInterval` frames for performance.
   */
  update(video: HTMLVideoElement): boolean {
    if (!this._running || !this._canvas || !this._ctx) return this._isStationary

    this._frameCount++
    if (this._frameCount % this._sampleInterval !== 0) return this._isStationary

    // Draw current frame at low resolution
    this._ctx.drawImage(video, 0, 0, this._width, this._height)
    const pixels = this._ctx.getImageData(0, 0, this._width, this._height).data

    if (!this._prevFrame) {
      // First frame — initialise baseline
      this._prevFrame = new Uint8Array(pixels)
      return this._isStationary
    }

    // Compute mean absolute difference (greyscale approximation)
    let diff = 0
    const len = this._width * this._height * 4
    for (let i = 0; i < len; i += 4) {
      // Use only R channel as proxy for luminance (fast path)
      diff += Math.abs(pixels[i] - this._prevFrame[i])
    }
    diff /= this._width * this._height

    // Update state with hysteresis
    if (diff < this._threshold) {
      this._confidence = Math.min(1, this._confidence + 0.1)
    } else {
      this._confidence = Math.max(0, this._confidence - 0.2)
    }

    this._isStationary = this._confidence > 0.6

    // Store for next comparison
    this._prevFrame = new Uint8Array(pixels)

    return this._isStationary
  }

  /**
   * Reset detection state
   */
  reset(): void {
    this._prevFrame = null
    this._isStationary = false
    this._confidence = 0
    this._frameCount = 0
  }

  /**
   * Stop and clean up
   */
  stop(): void {
    this._running = false
    this._canvas = null
    this._ctx = null
    this._prevFrame = null
    this._isStationary = false
    this._confidence = 0
  }
}
