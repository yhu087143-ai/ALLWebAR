export interface DeviceCapabilities {
  webgl2: boolean
  webgpu: boolean
  webxr: boolean
  immersiveAR: boolean
  isIOS: boolean
  isAndroid: boolean
  isMobile: boolean
  /** Safari 不支持 WebXR，iOS 上必须走 USDZ + AR Quick Look */
  requiresUSDZFallback: boolean
}

export async function detectCapabilities(): Promise<DeviceCapabilities> {
  const ua = navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator as Navigator & { maxTouchPoints: number }).maxTouchPoints > 1)
  const isAndroid = /Android/i.test(ua)
  const isMobile = isIOS || isAndroid || /Mobile/i.test(ua)

  const webgl2 = (() => {
    try {
      const canvas = document.createElement('canvas')
      return !!canvas.getContext('webgl2')
    } catch {
      return false
    }
  })()

  const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator

  const webxr = typeof navigator !== 'undefined' && 'xr' in navigator

  let immersiveAR = false
  if (webxr && navigator.xr) {
    try {
      immersiveAR = await navigator.xr.isSessionSupported('immersive-ar')
    } catch {
      immersiveAR = false
    }
  }

  return {
    webgl2,
    webgpu,
    webxr,
    immersiveAR,
    isIOS,
    isAndroid,
    isMobile,
    requiresUSDZFallback: isIOS && !immersiveAR,
  }
}

/** AR 降级策略说明，UI 直接展示给用户 */
export function describeARStrategy(caps: DeviceCapabilities): {
  mode: 'webxr' | 'usdz' | 'unsupported'
  title: string
  detail: string
} {
  if (caps.immersiveAR) {
    return {
      mode: 'webxr',
      title: 'WebXR AR 可用',
      detail: '支持平面检测与锚点放置，可直接进入沉浸式 AR 会话。',
    }
  }
  if (caps.isIOS) {
    return {
      mode: 'usdz',
      title: 'iOS：需走 USDZ 降级',
      detail: 'Safari 至今不支持 WebXR。需要把模型转成 USDZ，通过 AR Quick Look 打开。',
    }
  }
  return {
    mode: 'unsupported',
    title: '当前环境不支持 AR',
    detail: '请使用 Android Chrome、Meta Quest Browser，或 iOS 上的 Safari（USDZ 路径）。',
  }
}
