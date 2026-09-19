/**
 * 跨端画质自动降级系统。
 *
 * Web / 微信小程序共用：
 * - 高画质：shader 特效 / 粒子旋涡 / 阴影 / 后处理全开
 * - 中画质：发光材质 + 基础粒子，关阴影/后处理
 * - 低画质：纯 emissive 网格，强制 60fps 优先
 *
 * setTier 时同步 effects/qualityBridge 的 fxParticleScale，
 * 让 GameRuntime 的自动调档真正作用到高级特效的粒子数量。
 */
import { setFxParticleScale } from '@/engine/effects/qualityBridge'

export type QualityTier = 'high' | 'medium' | 'low'

export interface QualityProfile {
  tier: QualityTier
  /** 粒子数量倍率 */
  particleScale: number
  /** 是否开启阴影 */
  shadows: boolean
  /** 是否开启后处理 */
  postfx: boolean
  /** 是否使用高级 shader 特效 */
  advancedShaders: boolean
  /** 贴图最大分辨率倍率 */
  textureScale: number
  /** 目标帧率 */
  targetFps: number
}

const PROFILES: Record<QualityTier, QualityProfile> = {
  high: {
    tier: 'high',
    particleScale: 1,
    shadows: true,
    postfx: true,
    advancedShaders: true,
    textureScale: 1,
    targetFps: 60,
  },
  medium: {
    tier: 'medium',
    particleScale: 0.5,
    shadows: false,
    postfx: false,
    advancedShaders: false,
    textureScale: 0.75,
    targetFps: 60,
  },
  low: {
    tier: 'low',
    particleScale: 0.2,
    shadows: false,
    postfx: false,
    advancedShaders: false,
    textureScale: 0.5,
    targetFps: 30,
  },
}

export type QualityListener = (profile: QualityProfile) => void

export class QualityManager {
  private profile: QualityProfile = PROFILES.medium
  private listeners = new Set<QualityListener>()
  private frames = 0
  private elapsed = 0
  private lastLevelChange = 0

  get current(): QualityProfile {
    return this.profile
  }

  detectTier(): QualityTier {
    if (typeof navigator !== 'undefined') {
      const cores = navigator.hardwareConcurrency ?? 4
      const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4
      const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
      if (isMobile && (cores <= 4 || memory <= 3)) return 'low'
      if (cores >= 8 && memory >= 8 && !isMobile) return 'high'
      return 'medium'
    }
    return 'medium'
  }

  setTier(tier: QualityTier): void {
    this.profile = PROFILES[tier]
    // 桥接引擎特效层：高级特效按 particleScale 动态减粒子
    setFxParticleScale(this.profile.particleScale)
    this.emit()
  }

  autoDetect(): void {
    this.setTier(this.detectTier())
  }

  /** 每个渲染帧调用，用于滑动平均 FPS 和自动降级 */
  measureFrame(delta: number): void {
    this.frames += 1
    this.elapsed += delta
    if (this.elapsed < 1) return

    const fps = this.frames / this.elapsed
    const now = Date.now()
    if (now - this.lastLevelChange < 3000) return

    let next: QualityTier | null = null
    if (fps < 25 && this.profile.tier !== 'low') next = 'low'
    else if (fps < 40 && this.profile.tier === 'high') next = 'medium'
    else if (fps > 55 && this.profile.tier === 'low') next = 'medium'

    if (next) {
      this.lastLevelChange = now
      this.setTier(next)
    }

    this.frames = 0
    this.elapsed = 0
  }

  subscribe(listener: QualityListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  reset(): void {
    this.setTier(this.detectTier())
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.profile)
  }
}
