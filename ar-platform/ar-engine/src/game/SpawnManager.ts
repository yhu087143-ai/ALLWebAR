import * as THREE from 'three'

export interface SpawnManagerConfig {
  spawnInterval: number
  maxVisible: number
  spawnRange: number
  onItemSpawned?: (item: SpawnedItem) => void
}

export interface SpawnedItem {
  id: string
  mesh: THREE.Mesh
}

let _spawnIdCounter = 0

export class SpawnManager {
  private readonly _config: SpawnManagerConfig
  private _template: THREE.Mesh | null = null
  private _scene: THREE.Scene | null = null
  private _intervalId: ReturnType<typeof setInterval> | null = null
  private _items = new Map<string, THREE.Mesh>()
  private _running = false

  constructor(config: SpawnManagerConfig) {
    if (config.spawnInterval <= 0) {
      throw new Error(`[SpawnManager] spawnInterval must be positive, got ${config.spawnInterval}`)
    }
    if (config.maxVisible < 1) {
      throw new Error(`[SpawnManager] maxVisible must be at least 1, got ${config.maxVisible}`)
    }
    if (config.spawnRange <= 0) {
      throw new Error(`[SpawnManager] spawnRange must be positive, got ${config.spawnRange}`)
    }
    this._config = config
  }

  setItemTemplate(mesh: THREE.Mesh): void {
    this._template = mesh
  }

  start(scene: THREE.Scene): void {
    if (this._running) return
    if (!this._template) {
      console.warn('[SpawnManager] Cannot start: no item template set. Call setItemTemplate() first.')
      return
    }

    this._scene = scene
    this._running = true

    this._trySpawn()

    this._intervalId = setInterval(() => {
      this._trySpawn()
    }, this._config.spawnInterval * 1000)
  }

  stop(): void {
    this._running = false
    if (this._intervalId !== null) {
      clearInterval(this._intervalId)
      this._intervalId = null
    }

    for (const mesh of this._items.values()) {
      this._scene?.remove(mesh)
      this._disposeMesh(mesh)
    }
    this._items.clear()
  }

  collectItem(mesh: THREE.Mesh): boolean {
    const id = mesh.userData.itemId as string | undefined
    if (!id || !this._items.has(id)) return false

    this._scene?.remove(mesh)
    this._items.delete(id)
    this._disposeMesh(mesh)
    return true
  }

  getItemId(mesh: THREE.Mesh): string | null {
    return (mesh.userData.itemId as string) ?? null
  }

  get activeItems(): THREE.Mesh[] {
    return Array.from(this._items.values())
  }

  private _trySpawn(): void {
    if (!this._running || !this._template || !this._scene) return

    this._pruneStale()

    if (this._items.size >= this._config.maxVisible) return

    const item = this._spawnOne()
    this._items.set(item.id, item.mesh)
    this._config.onItemSpawned?.(item)
  }

  private _spawnOne(): SpawnedItem {
    const id = `item_${++_spawnIdCounter}_${Date.now()}`
    const mesh = this._template!.clone(true)

    const theta = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * this._config.spawnRange

    // 在 XZ 平面分布（AR 追踪场景，保持高度为 0）
    mesh.position.set(
      r * Math.cos(theta),
      0,
      r * Math.sin(theta)
    )
    mesh.rotation.y = Math.random() * Math.PI * 2
    mesh.userData.itemId = id

    this._scene!.add(mesh)
    return { id, mesh }
  }

  private _pruneStale(): void {
    for (const [id, mesh] of this._items) {
      if (!mesh.parent) {
        this._items.delete(id)
      }
    }
  }

  private _disposeMesh(mesh: THREE.Mesh): void {
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) {
      material.forEach((m) => m.dispose())
    } else if (material) {
      material.dispose()
    }
  }
}
