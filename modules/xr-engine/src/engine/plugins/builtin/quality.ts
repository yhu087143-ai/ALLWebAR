import { getGPUTier } from 'detect-gpu'
import type { QualityLevel } from '../../core/events'
import type { EnginePlugin } from '../types'

export interface QualityPreset {
  /** 渲染分辨率比例范围 */
  dpr: [number, number]
  shadows: boolean
  shadowMapSize: number
  maxParticles: number
  postfx: boolean
  /** 该档位允许开启的后处理效果，超出的一律跳过 */
  allowedEffects: string[]
  maxTextureSize: number
  /** 后处理链的多重采样（MSAA），越高越平滑但越吃 GPU；移动端应为 0 */
  multisampling: number
}

/**
 * 三档预设。
 *
 * 依据是调研得到的移动端红线：后处理 pass ≤3、粒子 ≤10k、
 * 贴图 ≤1024、面数 ≤25K。low 档直接关掉后处理和阴影 —— 这是手机上
 * 收益最大的一刀，比减面见效快得多。
 */
export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    dpr: [1, 1.25],
    shadows: false,
    shadowMapSize: 512,
    maxParticles: 1500,
    postfx: false,
    allowedEffects: [],
    maxTextureSize: 512,
    multisampling: 0,
  },
  medium: {
    dpr: [1, 1.5],
    shadows: true,
    shadowMapSize: 1024,
    maxParticles: 6000,
    postfx: true,
    allowedEffects: ['bloom', 'vignette', 'toneMapping'],
    maxTextureSize: 1024,
    multisampling: 0,
  },
  high: {
    dpr: [1, 2],
    shadows: true,
    shadowMapSize: 2048,
    maxParticles: 30_000,
    postfx: true,
    allowedEffects: [
      'bloom',
      'vignette',
      'toneMapping',
      'depthOfField',
      'chromaticAberration',
      'noise',
    ],
    maxTextureSize: 2048,
    multisampling: 2,
  },
}

export const getQualityPreset = (level: QualityLevel): QualityPreset => QUALITY_PRESETS[level]

export const QUALITY_LABEL: Record<QualityLevel, string> = {
  low: '流畅',
  medium: '均衡',
  high: '高画质',
}

const ORDER: QualityLevel[] = ['low', 'medium', 'high']

export interface QualityPluginOptions {
  /** 平均帧率低于此值触发降档 */
  downgradeFps: number
  /** 平均帧率高于此值且当前低于初始档位时恢复 */
  upgradeFps: number
  /** 取多少个采样点的均值再判定，避免瞬时抖动误伤 */
  samples: number
  /** 两次调档之间的冷却时间（毫秒） */
  cooldownMs: number
  /** 是否启用帧率自动调档 */
  auto: boolean
}

const DEFAULT_OPTIONS: QualityPluginOptions = {
  downgradeFps: 24,
  upgradeFps: 55,
  samples: 8,
  cooldownMs: 5000,
  auto: true,
}

/**
 * 画质自适应插件。
 *
 * 启动时用 detect-gpu 查 GPU 档位定初始值，之后按实测帧率动态调档，
 * 这样中低端机不会一上来就掉到个位数帧率。
 */
export function createQualityPlugin(
  options: Partial<QualityPluginOptions> = {}
): EnginePlugin {
  const opts: QualityPluginOptions = { ...DEFAULT_OPTIONS, ...options }

  return {
    id: 'builtin.quality',
    name: '移动端画质自适应',
    version: '0.1.0',
    description: '按 GPU 等级初始化画质，帧率不足时自动降档',

    install(ctx) {
      const samples: number[] = []
      let detected: QualityLevel = 'medium'
      let lastChange = 0

      // GPU 检测是异步的，先按 medium 跑起来，检测结果回来后再调档
      void (async () => {
        try {
          // benchmark 数据默认从 unpkg 拉，这里指向本地副本，保证离线环境也能分级
          const gpu = await getGPUTier({ benchmarksURL: '/benchmarks' })
          let level: QualityLevel = gpu.tier >= 3 ? 'high' : gpu.tier === 2 ? 'medium' : 'low'

          // 移动端保守一档：同样的 tier，手机的实际散热和持续性能远不如桌面
          if (gpu.isMobile && level !== 'low') {
            level = level === 'high' ? 'medium' : 'low'
          }

          detected = level
          ctx.engine.setQualityLevel(level)
        } catch (err) {
          console.warn('[quality] GPU 检测失败，保持 medium 档', err)
        }
      })()

      const off = ctx.bus.on('quality:fps', ({ fps }) => {
        if (!opts.auto) return

        samples.push(fps)
        if (samples.length > opts.samples) samples.shift()
        if (samples.length < opts.samples) return

        const now = Date.now()
        if (now - lastChange < opts.cooldownMs) return

        const avg = samples.reduce((sum, v) => sum + v, 0) / samples.length
        const current = ctx.engine.qualityLevel
        const currentIndex = ORDER.indexOf(current)

        if (avg < opts.downgradeFps && currentIndex > 0) {
          const next = ORDER[currentIndex - 1]
          ctx.engine.setQualityLevel(next)
          lastChange = now
          samples.length = 0
          console.info(`[quality] 平均 ${avg.toFixed(0)} FPS，降档 ${current} -> ${next}`)
        } else if (avg > opts.upgradeFps && current !== detected) {
          // 只在曾经降过档的情况下恢复，不主动超过初始档位
          if (ORDER.indexOf(detected) > currentIndex) {
            ctx.engine.setQualityLevel(detected)
            lastChange = now
            samples.length = 0
            console.info(`[quality] 帧率恢复，回到 ${detected} 档`)
          }
        }
      })

      return off
    },
  }
}
