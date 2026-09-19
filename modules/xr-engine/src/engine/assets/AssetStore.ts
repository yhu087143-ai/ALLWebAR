/**
 * 极简 IndexedDB 资产二进制存储。
 *
 * 之前资产 blob 只活在当前页面刷新前，刷新后资产全部 missing；
 * 这里把上传的原始文件按资产 id 持久化到浏览器 IndexedDB，
 * 刷新页面后能自动恢复 object URL，不再需要重新上传。
 */
const DB_NAME = 'xr-engine-asset-store'
const STORE_NAME = 'files'
const VERSION = 1

interface AssetBlobRecord {
  id: string
  blob: Blob
  mime: string
  name: string
  updatedAt: string
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'))
      return
    }
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    // 其他页面持有旧版本连接时会阻塞升级；不 reject（交给 onerror/超时），
    // 但要留日志，否则 open 挂起时完全无迹可查
    req.onblocked = () => console.warn('[assets] IndexedDB 打开被其他页面阻塞（onblocked）')
  })
}

export class AssetStore {
  private dbPromise: Promise<IDBDatabase> | null = null

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      // open 失败时不能把 rejected promise 永久缓存住：清空缓存，
      // 让下一次操作可以重试（例如用户刚授权、或阻塞方已关闭）。
      this.dbPromise = openDB().catch((err) => {
        this.dbPromise = null
        throw err
      })
    }
    return this.dbPromise
  }

  async put(record: Omit<AssetBlobRecord, 'updatedAt'>): Promise<void> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put({
        ...record,
        updatedAt: new Date().toISOString(),
      } satisfies AssetBlobRecord)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async get(id: string): Promise<AssetBlobRecord | null> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(id)
      req.onsuccess = () => resolve((req.result as AssetBlobRecord | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  }

  async delete(id: string): Promise<void> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async clear(): Promise<void> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}
