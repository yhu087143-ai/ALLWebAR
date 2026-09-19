import * as THREE from 'three'

export class CollectManager {
  private _registry = new Map<string, THREE.Mesh>()
  private _collected = new Set<string>()

  register(id: string, mesh: THREE.Mesh): void {
    this._registry.set(id, mesh)
  }

  collect(id: string): boolean {
    if (!this._registry.has(id)) return false
    if (this._collected.has(id)) return false
    this._collected.add(id)
    return true
  }

  get collected(): string[] { return Array.from(this._collected) }
  get total(): number { return this._registry.size }

  reset(): void {
    this._registry.clear()
    this._collected.clear()
  }
}
