import { nanoid } from 'nanoid'
import { AssetStore } from './AssetStore'
import type { EventBus } from '../core/EventBus'
import type { EngineEvents } from '../core/events'
import type { AssetKind, AssetRecord, AssetSource } from '../core/types'

export interface AddAssetInput {
  name: string
  kind: AssetKind
  source: AssetSource
  uri: string
  mimeType?: string
  size?: number
  triangles?: number
  meta?: Record<string, string | number | boolean>
}

/**
 * 资产库。
 *
 * 内存副本 + localStorage 只存元数据；资产二进制本体通过 IndexedDB 持久化，
 * 刷新页面后自动恢复 object URL，不再需要重新上传。
 */
export class AssetDatabase {
  private records = new Map<string, AssetRecord>()
  private readonly store = new AssetStore()

  constructor(private readonly bus: EventBus<EngineEvents>) {}

  add(input: AddAssetInput, blob?: Blob): AssetRecord {
    const record: AssetRecord = {
      id: nanoid(10),
      name: input.name,
      kind: input.kind,
      source: input.source,
      uri: input.uri,
      mimeType: input.mimeType ?? this.guessMime(input.name),
      size: input.size ?? 0,
      triangles: input.triangles ?? 0,
      meta: input.meta ?? {},
      createdAt: new Date().toISOString(),
    }
    this.records.set(record.id, record)
    if (blob) {
      void this.store.put({
        id: record.id,
        blob,
        mime: record.mimeType,
        name: record.name,
      }).catch((err) =>
        // 持久化失败 = 刷新后资产丢失，必须显眼（此前只 warn 常被忽略）
        console.error('[assets] 写入 IndexedDB 失败，刷新页面后该资产将无法恢复：', record.name, err)
      )
    }
    this.changed()
    return record
  }

  remove(id: string): void {
    const record = this.records.get(id)
    if (!record) return
    if (record.uri.startsWith('blob:')) URL.revokeObjectURL(record.uri)
    this.records.delete(id)
    void this.store.delete(id).catch(() => undefined)
    this.changed()
  }

  get(id: string): AssetRecord | undefined {
    return this.records.get(id)
  }

  list(): AssetRecord[] {
    return Array.from(this.records.values()).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    )
  }

  byKind(kind: AssetKind): AssetRecord[] {
    return this.list().filter((a) => a.kind === kind)
  }

  clear(): void {
    for (const record of this.records.values()) {
      if (record.uri.startsWith('blob:')) URL.revokeObjectURL(record.uri)
    }
    this.records.clear()
    void this.store.clear().catch(() => undefined)
    this.changed()
  }

  toJSON(): AssetRecord[] {
    return this.list()
  }

  /**
   * 载入项目时恢复资产元数据。
   * blob URL 如果 IndexedDB 里还有原始文件，会被 hydrate() 恢复成新的 object URL。
   */
  load(records: AssetRecord[]): void {
    this.records.clear()
    for (const record of records) {
      const stale = record.uri.startsWith('blob:')
      this.records.set(record.id, {
        ...record,
        meta: { ...record.meta, missing: stale },
      })
    }
    this.changed()
    void this.hydrate()
  }

  /** 从 IndexedDB 恢复 blob 资产；找不到的维持 missing 状态。 */
  async hydrate(): Promise<void> {
    let changed = false
    for (const record of this.records.values()) {
      if (!record.meta.missing && !record.uri.startsWith('blob:')) continue
      try {
        const stored = await this.store.get(record.id)
        if (!stored?.blob) continue
        if (record.uri.startsWith('blob:')) URL.revokeObjectURL(record.uri)
        record.uri = URL.createObjectURL(stored.blob)
        record.meta = { ...record.meta, missing: false }
        record.size = stored.blob.size || record.size
        changed = true
      } catch (err) {
        console.warn('[assets] 恢复资产失败', record.id, err)
      }
    }
    if (changed) this.changed()
  }

  private changed(): void {
    this.bus.emit('assets:changed', { assets: this.list() })
  }

  private guessMime(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'glb':
        return 'model/gltf-binary'
      case 'gltf':
        return 'model/gltf+json'
      case 'fbx':
        return 'application/octet-stream'
      case 'obj':
        return 'text/plain'
      case 'usdz':
        return 'model/vnd.usdz+zip'
      case 'png':
        return 'image/png'
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg'
      case 'webp':
        return 'image/webp'
      case 'ktx2':
        return 'image/ktx2'
      case 'basis':
        return 'image/basis'
      case 'hdr':
      case 'exr':
        return 'image/x-hdr'
      case 'mp3':
        return 'audio/mpeg'
      case 'wav':
        return 'audio/wav'
      default:
        return 'application/octet-stream'
    }
  }
}

export const formatBytes = (bytes: number): string => {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
