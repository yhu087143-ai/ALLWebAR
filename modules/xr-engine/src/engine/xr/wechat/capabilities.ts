/**
 * 微信小程序 AR 能力检测。
 * 只在微信环境下有效；浏览器/开发工具里会返回 isWechat: false。
 */
export interface WechatARCapabilities {
  isWechat: boolean
  hasXrFrame: boolean
  hasCamera: boolean
  baseLibraryVersion: string
  platform: string
  system: string
  model: string
}

export function detectWechatAR(): WechatARCapabilities {
  const wx = (globalThis as Record<string, unknown>).wx as
    | {
        getSystemInfoSync?: () => Record<string, unknown>
        getXrFrameSystem?: () => unknown
        createCameraContext?: () => unknown
      }
    | undefined
  if (!wx) {
    return {
      isWechat: false,
      hasXrFrame: false,
      hasCamera: false,
      baseLibraryVersion: '',
      platform: '',
      system: '',
      model: '',
    }
  }

  let info: Record<string, unknown> = {}
  try {
    info = (wx.getSystemInfoSync?.() as Record<string, unknown>) ?? {}
  } catch {
    info = {}
  }

  const hasXrFrame = typeof wx.getXrFrameSystem === 'function'
  // getSystemInfoSync 没有 camera 字段（永远 undefined）；相机能力改用
  // wx.createCameraContext 是否存在来探测（基础库 1.6.0+ 提供该 API）
  const hasCamera = typeof wx.createCameraContext === 'function'

  return {
    isWechat: true,
    hasXrFrame,
    hasCamera,
    baseLibraryVersion: String(info.SDKVersion ?? info.version ?? ''),
    platform: String(info.platform ?? ''),
    system: String(info.system ?? ''),
    model: String(info.model ?? ''),
  }
}
