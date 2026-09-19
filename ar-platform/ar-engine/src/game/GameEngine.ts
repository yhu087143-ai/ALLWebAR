import * as THREE from 'three'
import type { GameConfig } from '../types/config'
import { ScoreManager } from './ScoreManager'
import { TimerManager } from './TimerManager'
import { SpawnManager } from './SpawnManager'
import type { SpawnManagerConfig } from './SpawnManager'
import { CollectManager } from './CollectManager'
import { GridManager } from './GridManager'
import { WaveManager } from './WaveManager'
import type { INavigationSystem } from '../guide/NavigationSystem'

export type GameEvent = 'scoreUpdate' | 'timerTick' | 'timerEnd' | 'itemCollected' | 'gameEnd' | 'waveStart' | 'enemySpawned' | 'waveComplete' | 'allWavesComplete'

export interface GameEventPayloads {
  scoreUpdate: { score: number; combo: { count: number; multiplier: number } }
  timerTick: { remaining: number; elapsed: number }
  timerEnd: void
  itemCollected: { id: string; score: number }
  gameEnd: { score: number; items: number }
  waveStart: { wave: any; index: number }
  enemySpawned: { enemy: any; waveIndex: number; spawnNumber: number; totalInWave: number }
  waveComplete: { wave: any; index: number }
  allWavesComplete: void
}

type Listener = (...args: any[]) => void

export class GameEngine {
  private _listeners = new Map<string, Set<Listener>>()

  private _running = false
  private _paused = false
  private _config: GameConfig | null = null
  private _scene: THREE.Scene | null = null

  private _scoreManager: ScoreManager | null = null
  private _timerManager: TimerManager | null = null
  private _spawnManager: SpawnManager | null = null
  private _collectManager: CollectManager | null = null
  private _endConditionUnsub: (() => void) | null = null

  /** Optional navigation system (GuideEngine) for POI-based experiences */
  private _navigation: INavigationSystem | null = null

  /** Grid placement system (tower-defense / strategy games) */
  private _gridManager: GridManager | null = null

  /** Wave management system (zombie / survival games) */
  private _waveManager: WaveManager | null = null

  /** Unsubscribe functions for wave events */
  private _waveUnsubs: (() => void)[] | null = null

  private static readonly DEFAULT_SPAWN_RANGE = 3

  on<T extends GameEvent>(event: T, cb: (payload: GameEventPayloads[T]) => void): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    const listenerSet = this._listeners.get(event)!
    const wrapped = cb as Listener
    listenerSet.add(wrapped)
    return () => {
      listenerSet.delete(wrapped)
      if (listenerSet.size === 0) {
        this._listeners.delete(event)
      }
    }
  }

  private _emit<T extends GameEvent>(event: T, payload: GameEventPayloads[T]): void {
    const listeners = this._listeners.get(event)
    if (!listeners) return
    for (const cb of listeners) {
      try { cb(payload) } catch (err) { console.error(`[GameEngine] Error in '${event}' listener:`, err) }
    }
  }

  start(config: GameConfig, scene: THREE.Scene): void {
    if (this._running && !this._paused) {
      console.warn('[GameEngine] Game is already running. Call reset() first.')
      return
    }

    this._config = config
    this._scene = scene
    this._running = true
    this._paused = false

    this._scoreManager = new ScoreManager()
    this._timerManager = new TimerManager(config.duration)
    this._collectManager = new CollectManager()

    const spawnConfig: SpawnManagerConfig = {
      spawnInterval: config.spawnInterval,
      maxVisible: config.maxVisible,
      spawnRange: GameEngine.DEFAULT_SPAWN_RANGE,
      onItemSpawned: (item) => {
        this._collectManager!.register(item.id, item.mesh)
      },
    }

    this._spawnManager = new SpawnManager(spawnConfig)

    if (config.itemModelUrl) {
      this._loadItemTemplate(config.itemModelUrl)
        .then((mesh) => {
          if (this._spawnManager) {
            this._applyItemAppearance(mesh, config)
            this._spawnManager.setItemTemplate(mesh)
            this._spawnManager.start(scene)
          }
        })
        .catch((err) => {
          console.error('[GameEngine] Failed to load item template model:', err)
        })
    }

    // Wire endCondition listeners
    this._wireEndCondition(config)

    this._timerManager.start((remaining) => {
      this._emit('timerTick', { remaining, elapsed: this._timerManager!.elapsed })

      if (this._timerManager!.isFinished) {
        this._emit('timerEnd', undefined)
        this.end()
      }
    })
  }

  private _wireEndCondition(config: GameConfig): void {
    const ec = config.endCondition || 'timer'

    if (ec === 'collect_all') {
      const unsub = this.on('itemCollected', () => {
        const count = this._collectManager?.collected.length ?? 0
        if (count >= config.itemCount) {
          this.end()
        }
      })
      // Store unsub for cleanup in reset()
      this._endConditionUnsub = unsub
    }

    if (ec === 'score_reach') {
      const targetScore = config.endScore ?? 500
      const unsub = this.on('scoreUpdate', (payload) => {
        if (payload.score >= targetScore) {
          this.end()
        }
      })
      this._endConditionUnsub = unsub
    }

    // 'timer' and 'manual' need no extra listeners
  }

  private _applyItemAppearance(mesh: THREE.Mesh, config: GameConfig): void {
    const appearance = config.itemAppearance
    if (!appearance) return

    // Apply scale
    const s = appearance.scale ?? 1
    if (s !== 1) mesh.scale.set(s, s, s)

    // Apply style and glow color to material
    const mat = mesh.material
    if (mat) {
      if (appearance.style === 'glow' || appearance.glowColor) {
        if (Array.isArray(mat)) {
          mat.forEach((m) => { if ('emissive' in m) { (m as THREE.MeshStandardMaterial).emissive = new THREE.Color(appearance.glowColor || '#FFD700'); (m as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 } })
        } else if ('emissive' in mat) {
          (mat as THREE.MeshStandardMaterial).emissive = new THREE.Color(appearance.glowColor || '#FFD700')
          ;(mat as THREE.MeshStandardMaterial).emissiveIntensity = 0.3
        }
      }
      if (appearance.style === 'cartoon' && 'flatShading' in mat) {
        if (Array.isArray(mat)) {
          mat.forEach((m) => { if ('flatShading' in m) (m as THREE.MeshStandardMaterial).flatShading = true })
        } else {
          (mat as THREE.MeshStandardMaterial).flatShading = true
        }
      }
    }
  }

  pause(): void {
    if (!this._running || this._paused) return
    this._paused = true
    this._timerManager?.pause()
    this._spawnManager?.stop()
  }

  resume(): void {
    if (!this._running || !this._paused) return
    this._paused = false
    this._timerManager?.resume()
    if (this._spawnManager && this._scene) {
      this._spawnManager.start(this._scene)
    }
  }

  end(): { score: number; items: number } {
    this._running = false
    this._paused = false

    this._timerManager?.stop()
    this._spawnManager?.stop()

    const score = this._scoreManager?.score ?? 0
    const items = this._collectManager?.collected.length ?? 0

    this._emit('gameEnd', { score, items })

    // Dispatch onComplete action
    const onComplete = this._config?.onComplete
    if (onComplete) {
      this._dispatchOnComplete(onComplete, score)
    }

    return { score, items }
  }

  private _dispatchOnComplete(oc: NonNullable<GameConfig['onComplete']>, score: number): void {
    try {
      window.dispatchEvent(new CustomEvent('game:onComplete', {
        detail: { action: oc.action, message: oc.message, linkUrl: oc.linkUrl, score },
      }))
    } catch { /* SSR guard */ }
  }

  reset(): void {
    this._running = false
    this._paused = false

    this._endConditionUnsub?.()
    this._endConditionUnsub = null

    this._timerManager?.stop()
    this._spawnManager?.stop()

    this._scoreManager?.reset()
    this._collectManager?.reset()

    this._scoreManager = null
    this._timerManager = null
    this._spawnManager = null
    this._collectManager = null
    this._config = null
    this._scene = null
    this._navigation = null

    // Clean up grid + wave
    this._gridManager = null
    if (this._waveUnsubs) {
      for (const unsub of this._waveUnsubs) unsub()
      this._waveUnsubs = null
    }
    this._waveManager = null

    this._listeners.clear()
  }

  collectItem(mesh: THREE.Mesh): void {
    if (!this._running || this._paused) return
    if (!this._spawnManager || !this._scoreManager || !this._collectManager || !this._config) return

    const itemId = this._spawnManager.getItemId(mesh)
    if (!itemId) return

    const wasCollected = this._spawnManager.collectItem(mesh)
    if (!wasCollected) return

    const registered = this._collectManager.collect(itemId)
    if (!registered) return

    const newScore = this._scoreManager.add(this._config.scorePerItem)

    this._emit('itemCollected', { id: itemId, score: newScore })
    this._emit('scoreUpdate', {
      score: newScore,
      combo: this._scoreManager.combo(),
    })
  }

  get running(): boolean { return this._running }
  get paused(): boolean { return this._paused }
  get score(): number { return this._scoreManager?.score ?? 0 }
  get elapsed(): number { return this._timerManager?.elapsed ?? 0 }
  get scoreManager(): ScoreManager | null { return this._scoreManager }
  get timerManager(): TimerManager | null { return this._timerManager }
  get spawnManager(): SpawnManager | null { return this._spawnManager }
  get collectManager(): CollectManager | null { return this._collectManager }

  /** Attach an optional navigation system (GuideEngine) */
  setNavigationSystem(nav: INavigationSystem | null): void {
    this._navigation = nav
  }
  get navigation(): INavigationSystem | null { return this._navigation }

  /** Attach or create a GridManager */
  setGridManager(grid: GridManager | null): void {
    this._gridManager = grid
  }
  get gridManager(): GridManager | null { return this._gridManager }

  /** Attach or create a WaveManager and wire its events */
  setWaveManager(wave: WaveManager | null): void {
    // Clean up previous wave subscriptions
    if (this._waveUnsubs) {
      for (const unsub of this._waveUnsubs) unsub()
      this._waveUnsubs = null
    }

    this._waveManager = wave

    if (wave) {
      this._waveUnsubs = [
        wave.on('waveStart', (payload) => {
          this._emit('waveStart', payload)
        }),
        wave.on('enemySpawned', (payload) => {
          this._emit('enemySpawned', payload)
        }),
        wave.on('waveComplete', (payload) => {
          this._emit('waveComplete', payload)
        }),
        wave.on('allWavesComplete', () => {
          this._emit('allWavesComplete', undefined)
        }),
      ]
    }
  }
  get waveManager(): WaveManager | null { return this._waveManager }

  private async _loadItemTemplate(url: string): Promise<THREE.Mesh> {
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const loader = new GLTFLoader()

      return new Promise<THREE.Mesh>((resolve, reject) => {
        loader.load(
          url,
          (gltf) => {
            const meshes: THREE.Mesh[] = []
            gltf.scene.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                meshes.push(child)
              }
            })

            if (meshes.length > 0) {
              const firstMesh = meshes[0]
              if (firstMesh.parent) firstMesh.parent.remove(firstMesh)
              resolve(firstMesh)
            } else {
              reject(new Error('No mesh found in loaded model'))
            }
          },
          undefined,
          (err) => reject(err)
        )
      })
    } catch {
      console.warn('[GameEngine] GLTFLoader not available, using placeholder box for items')
      const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1)
      const mat = new THREE.MeshStandardMaterial({ color: 0xff4444 })
      return new THREE.Mesh(geo, mat)
    }
  }
}
