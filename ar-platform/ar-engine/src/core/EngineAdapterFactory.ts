import { EngineType } from '../types/enums'
import type { IEngineAdapter } from '../types/engine'
import type { UnifiedARConfig } from '../types/config'
import { CapabilityType } from '../types/capabilities'
import { EightWallAdapter } from '../adapters/EightWallAdapter'
import { WebXRAdapter } from '../adapters/WebXRAdapter'
import { CameraARAdapter } from '../adapters/CameraARAdapter'

async function checkWebXRSupport(): Promise<boolean> {
  if ('xr' in navigator) {
    try {
      return await (navigator as any).xr.isSessionSupported('immersive-ar')
    } catch {
      return false
    }
  }
  return false
}

/**
 * 8th Wall 运行时是否真的可用：
 *  - 全局 XR8 已就绪（脚本加载完成），或
 *  - 站点部署了引擎脚本（默认 /8thwall/xr.js，可用 VITE_8THWALL_ENGINE_URL 覆盖）
 * 注意：SPA 的 history fallback 会对任意路径返回 200 HTML，因此必须校验 content-type。
 */
export async function isEightWallAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const w = window as unknown as Record<string, unknown>
  if (w.XR8) return true
  const url =
    (w.__EIGHTWALL_ENGINE_URL__ as string | undefined) ??
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_8THWALL_ENGINE_URL ??
    '/8thwall/xr.js'
  try {
    const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
    if (!res.ok) return false
    const ct = res.headers.get('content-type') ?? ''
    return ct === '' || /javascript|ecmascript/i.test(ct)
  } catch {
    return false
  }
}

export async function selectEngine(config: UnifiedARConfig): Promise<EngineType> {
  if (config.engine !== 'auto') return config.engine

  const needs = new Set(config.capabilities.map((c) => c.type))

  // 人脸追踪 / 人脸特效 / 天空特效：目前只有 8th Wall 侧有实现
  const needsEightWall =
    needs.has(CapabilityType.FaceTracking) ||
    needs.has(CapabilityType.FaceEffects) ||
    needs.has(CapabilityType.SkyEffects)

  if (needsEightWall) {
    // 引擎脚本没部署时不能硬选 8th Wall（会加载 404 后静默失败），退回相机透视
    return (await isEightWallAvailable()) ? EngineType.EightWall : EngineType.Camera
  }

  // 世界追踪 / 平面检测：WebXR → 8th Wall → 相机透视兜底
  if (needs.has(CapabilityType.WorldTracking) || needs.has(CapabilityType.PlaneDetection)) {
    if (await checkWebXRSupport()) return EngineType.WebXR
    if (await isEightWallAvailable()) return EngineType.EightWall
    return EngineType.Camera
  }

  return EngineType.MindAR
}

/**
 * 根据引擎类型实例化对应的适配器
 */
export function instantiateEngine(type: EngineType): IEngineAdapter {
  switch (type) {
    case EngineType.EightWall:
      return new EightWallAdapter()
    case EngineType.WebXR:
      return new WebXRAdapter()
    case EngineType.Camera:
      return new CameraARAdapter()
    case EngineType.XFeatVIO:
      throw new Error('XFeatVIO adapter not implemented yet (Phase 2)')
    case EngineType.MindAR:
      throw new Error('MindAR adapter not implemented yet (use legacy AREngine)')
    default:
      throw new Error(`Unknown engine type: ${type}`)
  }
}

export function validateCapabilities(
  types: CapabilityType[],
  engine: IEngineAdapter,
): { valid: boolean; unsupported: CapabilityType[] } {
  const supported = new Set(engine.getSupportedCapabilities())
  const unsupported = types.filter((t) => !supported.has(t))
  return { valid: unsupported.length === 0, unsupported }
}
