import type { World } from '@/engine/runtime/World'
import type { Entity } from '@/engine/runtime/Entity'

/**
 * 轻量时间轴系统：用于剧情演出、镜头动画、过场、物体动画。
 * 数据可序列化，Web 和微信都能解释。
 *
 * 采样支持范围：
 * - position / rotation / scale：写入目标实体的 transform（线性插值）；
 * - opacity / emissiveIntensity：写入目标实体的 props.material（是否逐帧
 *   反映到画面取决于渲染层是否读取 props）；
 * - clip（动画片段）轨道需要渲染层动画系统配合，暂只保留数据不采样。
 * targetId 依次匹配：实体 id → userData.sourceId → 实体 name。
 */

export interface TimelineKeyframe {
  time: number
  value: number[]
  ease?: 'linear' | 'smooth'
}

export interface TimelineTrack {
  targetId: string
  property: 'position' | 'rotation' | 'scale' | 'opacity' | 'emissiveIntensity' | 'clip'
  keyframes: TimelineKeyframe[]
}

export interface TimelineData {
  id: string
  duration: number
  loop?: boolean
  tracks: TimelineTrack[]
}

export type TimelineEvent = 'start' | 'update' | 'end'

/** 在两个 keyframe 之间做线性插值；ease:'smooth' 用 smoothstep 缓动 */
function sampleTrack(track: TimelineTrack, time: number): number[] | null {
  const kfs = track.keyframes
  if (!kfs.length) return null
  if (time <= kfs[0].time) return kfs[0].value
  const last = kfs[kfs.length - 1]
  if (time >= last.time) return last.value
  for (let i = 0; i < kfs.length - 1; i += 1) {
    const a = kfs[i]
    const b = kfs[i + 1]
    if (time >= a.time && time <= b.time) {
      const span = b.time - a.time
      let t = span > 0 ? (time - a.time) / span : 1
      if ((b.ease ?? a.ease) === 'smooth') t = t * t * (3 - 2 * t)
      const n = Math.max(a.value.length, b.value.length)
      const out: number[] = []
      for (let k = 0; k < n; k += 1) {
        const va = a.value[k] ?? a.value[a.value.length - 1] ?? 0
        const vb = b.value[k] ?? b.value[b.value.length - 1] ?? 0
        out.push(va + (vb - va) * t)
      }
      return out
    }
  }
  return last.value
}

function resolveTarget(world: World, targetId: string): Entity | undefined {
  for (const entity of world.entities.values()) {
    if (entity.id === targetId || entity.userData.sourceId === targetId || entity.name === targetId) {
      return entity
    }
  }
  return undefined
}

export class TimelineSystem {
  private active = new Map<string, { data: TimelineData; time: number }>()
  /** play 过的时间轴数据，用于读档后按 id 恢复进度 */
  private known = new Map<string, TimelineData>()
  /** 读档恢复但尚未播放的时间：下次 play 同 id 时间轴时从这里继续 */
  private restoredTimes = new Map<string, number>()
  private listeners = new Set<(event: TimelineEvent, id: string) => void>()

  play(data: TimelineData): void {
    this.known.set(data.id, data)
    const time = this.restoredTimes.get(data.id) ?? 0
    this.restoredTimes.delete(data.id)
    this.active.set(data.id, { data, time })
    this.emit('start', data.id)
  }

  stop(id: string): void {
    this.active.delete(id)
    this.emit('end', id)
  }

  update(dt: number, world?: World): void {
    for (const [id, state] of this.active) {
      const duration = state.data.duration
      // duration<=0 没有可采样区间，直接结束，避免 time % duration 产生 NaN
      if (!(duration > 0)) {
        this.stop(id)
        continue
      }
      state.time += dt
      if (state.time >= duration) {
        if (state.data.loop) {
          state.time = state.time % duration
        } else {
          // 定格在末帧再结束，避免播放完跳回初始状态
          if (world) this.applyTracks(state.data, duration, world)
          this.stop(id)
          continue
        }
      }
      if (world) this.applyTracks(state.data, state.time, world)
      this.emit('update', id)
    }
  }

  getTime(id: string): number | undefined {
    return this.active.get(id)?.time
  }

  /** 导出进行中时间轴的播放进度（存档用） */
  serialize(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [id, state] of this.active) out[id] = state.time
    return out
  }

  /**
   * 恢复播放进度：正在播放的直接设置时间；
   * 未在播放的记录为待恢复时间（时间轴数据由游戏脚本在 play 时重新提供）。
   */
  deserialize(times: Record<string, number>): void {
    for (const [id, time] of Object.entries(times ?? {})) {
      const state = this.active.get(id)
      if (state) state.time = time
      else this.restoredTimes.set(id, time)
    }
  }

  subscribe(listener: (event: TimelineEvent, id: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private applyTracks(data: TimelineData, time: number, world: World): void {
    for (const track of data.tracks) this.applyTrack(track, time, world)
  }

  private applyTrack(track: TimelineTrack, time: number, world: World): void {
    const value = sampleTrack(track, time)
    if (!value) return
    const target = resolveTarget(world, track.targetId)
    if (!target) return
    if (track.property === 'position' || track.property === 'rotation' || track.property === 'scale') {
      const fallback = track.property === 'scale' ? 1 : 0
      target.transform[track.property] = [value[0] ?? fallback, value[1] ?? fallback, value[2] ?? fallback]
    } else if (track.property === 'opacity' || track.property === 'emissiveIntensity') {
      const material = { ...((target.props.material ?? {}) as Record<string, unknown>) }
      material[track.property] = value[0] ?? 0
      if (track.property === 'opacity') material.transparent = Number(material.opacity) < 1
      target.props.material = material
    }
  }

  private emit(event: TimelineEvent, id: string): void {
    for (const listener of this.listeners) listener(event, id)
  }
}
