/**
 * 简单存档系统：保存剧情 flag、时间轴、全局变量、世界自定义状态。
 * 后续可扩展为多存档、云存档、微信本地缓存。
 */

export interface SaveData {
  version: number
  savedAt: number
  flags: Record<string, unknown>
  worldState: Record<string, unknown>
  timelineTime: Record<string, number>
  tasks?: Record<string, unknown>
}

export class SaveSystem {
  private storage: Storage | null = null
  private key = 'xr-engine:save'

  constructor(storage?: Storage) {
    this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null)
  }

  collect(flags: Record<string, unknown> | Map<string, unknown>, timeline: Record<string, number> | Map<string, number>, worldState: Record<string, unknown>, tasks?: Record<string, unknown>): SaveData {
    const flagObj: Record<string, unknown> = {}
    if (flags instanceof Map) {
      for (const [k, v] of flags) flagObj[k] = v
    } else {
      Object.assign(flagObj, flags)
    }
    const timeObj: Record<string, number> = {}
    if (timeline instanceof Map) {
      for (const [k, v] of timeline) timeObj[k] = v
    } else {
      Object.assign(timeObj, timeline)
    }
    return {
      version: 1,
      savedAt: Date.now(),
      flags: flagObj,
      timelineTime: timeObj,
      worldState,
      tasks: tasks ?? {},
    }
  }

  save(data: SaveData): boolean {
    if (!this.storage) return false
    try {
      this.storage.setItem(this.key, JSON.stringify(data))
      return true
    } catch (e) {
      console.warn('[SaveSystem] save failed', e)
      return false
    }
  }

  load(): SaveData | null {
    if (!this.storage) return null
    try {
      const raw = this.storage.getItem(this.key)
      if (!raw) return null
      const data = JSON.parse(raw) as SaveData
      if (data.version !== 1) return null
      return data
    } catch (e) {
      console.warn('[SaveSystem] load failed', e)
      return null
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(this.key)
    } catch (e) {
      console.warn('[SaveSystem] clear failed', e)
    }
  }
}
