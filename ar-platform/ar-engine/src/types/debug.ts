/**
 * DebugInfo — 运行时调试数据结构
 *
 * 各适配器（EightWallAdapter 等）通过 getDebugInfo() 返回此结构，
 * 供调试面板（GyroTestPage 等）展示，帮助定位平面放置 AR 问题。
 *
 * 数据分类：
 *   漂移 → rawPos vs smoothPos, jitter, isMoving
 *   抖动 → avgJitter, jitterMag, stabAlpha
 *   变形 → fps, featureCount, reloc 运行状态
 *   跳位 → relocZncc, relocTotal, relocCooldown
 *   不放置 → reticleVisible, planeCount
 */

export interface Vector3Debug {
  x: number; y: number; z: number
}

export interface DebugInfo {
  engineType: string
  fps: number

  // 相机位姿
  rawPos: Vector3Debug
  smoothPos: Vector3Debug

  // 抖动补偿
  jitter: Vector3Debug
  jitterMag: number
  avgJitter: number
  isMoving: boolean
  stabAlpha: number

  // 放置状态
  isPlaced: boolean
  worldPos: Vector3Debug
  objectPos: Vector3Debug
  lockPos: Vector3Debug
  isFrozen: boolean

  // 重定位器
  relocCaptured: boolean
  relocZncc: number
  relocTotal: number
  relocBankSize: number
  relocCooldownMs: number
  relocInMotion: boolean
  relocConsecutiveHits: number

  // 视觉特征
  featureCount: number
  featureConfidence: number
  featureQuality: string

  // 平面检测
  reticleVisible: boolean
  planeDetectionEnabled: boolean
}
