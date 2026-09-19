/**
 * 微信真机性能矩阵。
 * 根据设备粗略分级，给出安全画质建议。
 */

export interface DeviceProfile {
  platform: string
  model?: string
  /** 单位 GB。注意 wx.getSystemInfoSync 的 memorySize 是 MB，传入前需除以 1024 */
  memoryGB?: number
  isWechat?: boolean
  baseLibrary?: string
}

export interface PerfTier {
  tier: 'high' | 'medium' | 'low'
  name: string
  particleScale: number
  maxTriangles: number
  recommended: string
}

export function getRecommendedPerfTier(device: DeviceProfile): PerfTier {
  const isIOS = /iphone|ipad|ios/i.test(device.platform)
  const lowMemory = (device.memoryGB ?? 8) < 4
  const oldDevice = /iphone\s*(6|7|8|se|xr|xs)/i.test(device.model ?? '')
  const androidLow = /android/i.test(device.platform) && lowMemory

  if (oldDevice || androidLow) {
    return {
      tier: 'low',
      name: '低配（老旧/低端机）',
      particleScale: 0.15,
      maxTriangles: 30000,
      recommended: '关闭后处理、关闭阴影、模型≤3万面、粒子最低档。',
    }
  }
  if (isIOS && !oldDevice) {
    return {
      tier: 'high',
      name: '高配（iPhone 主流）',
      particleScale: 1,
      maxTriangles: 100000,
      recommended: '可开中高画质，建议仍保持模型≤10万面。',
    }
  }
  if (lowMemory) {
    return {
      tier: 'medium',
      name: '中配',
      particleScale: 0.5,
      maxTriangles: 60000,
      recommended: '关闭 Bloom、模型≤6万面、粒子中档。',
    }
  }
  return {
    tier: 'medium',
    name: '中配（默认）',
    particleScale: 0.5,
    maxTriangles: 60000,
    recommended: '建议先按中配跑，真机再调优。',
  }
}
