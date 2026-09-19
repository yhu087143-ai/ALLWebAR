/**
 * 简化的跨模块画质桥接。
 * 高级特效根据这个值动态减少粒子数，避免手机上直接卡死。
 */
let fxParticleScale = 0.5

export function setFxParticleScale(value: number): void {
  fxParticleScale = Math.max(0.05, Math.min(1, value))
}

export function getFxParticleScale(): number {
  return fxParticleScale
}
