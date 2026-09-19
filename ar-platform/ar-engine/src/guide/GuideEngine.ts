/**
 * Core Guide Engine — drives POI-based AR navigation.
 *
 * Consumes a GuideRoute and a position provider, computes distances
 * via the Haversine formula, and emits lifecycle events as the user
 * moves through POIs.
 *
 * Events:
 *   poiEnter      – user entered a POI's trigger radius
 *   poiExit       – user left a POI's trigger radius
 *   guideStart    – guide has started (after start() resolves)
 *   guideComplete – all POIs have been visited
 *   positionUpdate – every position sample from the provider
 */

import type { GuideRoute, POI, POIAction } from '../types/config'
import type { IPositionProvider, UserPosition } from './position/PositionProvider'
import type { INavigationSystem } from './NavigationSystem'
export type { INavigationSystem } from './NavigationSystem'

export type GuideEvent = 'poiEnter' | 'poiExit' | 'guideStart' | 'guideComplete' | 'positionUpdate' | 'navigationStart' | 'navigationComplete'

export interface GuideEventPayloads {
  poiEnter: POI
  poiExit: POI
  guideStart: GuideRoute
  guideComplete: void
  navigationStart: GuideRoute
  navigationComplete: void
  positionUpdate: UserPosition
}

type Listener = (...args: any[]) => void

/** Earth mean radius in metres (WGS‑84) */
const EARTH_RADIUS = 6_371_000

/**
 * Haversine formula — returns great-circle distance in metres
 * between two WGS‑84 coordinates.
 */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS * c
}

export class GuideEngine implements INavigationSystem {
  private _listeners = new Map<string, Set<Listener>>()
  private _route: GuideRoute
  private _provider: IPositionProvider | null = null
  private _running = false
  private _pois: POI[]
  private _currentIndex = 0
  private _visited = new Set<string>()
  /** POIs currently within trigger radius (for poiExit detection) */
  private _activePOIs = new Set<string>()
  private _userPosition: UserPosition | null = null

  constructor(route: GuideRoute) {
    this._route = route
    // Sort POIs by their order field so navigation is deterministic
    this._pois = [...route.pois].sort((a, b) => a.order - b.order)

    // If a startPOIId is specified, move the pointer there
    if (route.startPOIId) {
      const idx = this._pois.findIndex(p => p.id === route.startPOIId)
      if (idx >= 0) this._currentIndex = idx
    }
  }

  // ==================== Public API ====================

  setPositionProvider(provider: IPositionProvider): void {
    this._provider = provider
  }

  start(): void {
    if (this._running) return
    if (!this._provider) {
      console.warn('[GuideEngine] No position provider set — guide cannot start')
      return
    }

    this._running = true
    this._visited.clear()
    this._currentIndex = 0

    // Wire provider callback
    this._provider.onPosition((pos: UserPosition) => {
      this._userPosition = pos
      this._emit('positionUpdate', pos)
      this._checkProximity()
    })

    this._provider.start()

    this._emit('guideStart', this._route)
    this._emit('navigationStart', this._route)
    console.log(`[GuideEngine] Guide "${this._route.name}" started — ${this._pois.length} POI(s)`)
  }

  stop(): void {
    if (!this._running) return
    this._running = false
    this._provider?.stop()
    console.log('[GuideEngine] Guide stopped')
  }

  /** Advance to the next unvisited POI and return it, or null if already at end. */
  nextPOI(): POI | null {
    if (this._currentIndex < this._pois.length - 1) {
      this._currentIndex++
      return this._pois[this._currentIndex]
    }
    return null
  }

  /** Go back to the previous POI and return it, or null if already at start. */
  prevPOI(): POI | null {
    if (this._currentIndex > 0) {
      this._currentIndex--
      return this._pois[this._currentIndex]
    }
    return null
  }

  /** The POI the user is currently navigating towards. */
  get currentPOI(): POI | null {
    return this._pois[this._currentIndex] ?? null
  }

  /** Navigation progress summary. */
  get progress(): { current: number; total: number; visited: number } {
    return {
      current: this._currentIndex + 1,
      total: this._pois.length,
      visited: this._visited.size,
    }
  }

  /** The full sorted POI list for the active route. */
  get pois(): POI[] {
    return this._pois
  }

  /** The route configuration. */
  get route(): GuideRoute {
    return this._route
  }

  /** Whether the guide is currently running. */
  get running(): boolean {
    return this._running
  }

  /** The latest known user position. */
  get userPosition(): UserPosition | null {
    return this._userPosition
  }

  /** Check whether a specific POI has been visited. */
  isVisited(poiId: string): boolean {
    return this._visited.has(poiId)
  }

  // ==================== Distance helpers ====================

  /**
   * Compute the distance in metres from the current user position
   * to the given POI's GPS coordinates.
   * Returns Infinity when either the user position or POI lacks GPS data.
   */
  distanceToPOI(poi: POI): number {
    if (!this._userPosition) return Infinity

    if (poi.position.type === 'gps') {
      const { latitude, longitude } = poi.position
      const { latitude: ulat, longitude: ulon } = this._userPosition
      if (ulat == null || ulon == null || latitude == null || longitude == null) {
        return Infinity
      }
      return haversineDistance(ulat, ulon, latitude, longitude)
    }

    // Scene-space distance (manual / vps / ble placement)
    if (poi.position.scenePosition &&
        this._userPosition.sceneX !== undefined &&
        this._userPosition.sceneY !== undefined &&
        this._userPosition.sceneZ !== undefined) {
      const sx = this._userPosition.sceneX
      const sy = this._userPosition.sceneY
      const sz = this._userPosition.sceneZ
      const [px, py, pz] = poi.position.scenePosition
      const dx = sx - px
      const dy = sy - py
      const dz = sz - pz
      return Math.sqrt(dx * dx + dy * dy + dz * dz)
    }

    return Infinity
  }

  // ==================== Event system ====================

  on<T extends string>(
    event: T,
    cb: (payload: T extends keyof GuideEventPayloads ? GuideEventPayloads[T] : any) => void,
  ): () => void {
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

  private _emit<T extends GuideEvent>(event: T, payload: GuideEventPayloads[T]): void {
    const listeners = this._listeners.get(event)
    if (!listeners) return
    for (const cb of listeners) {
      try {
        cb(payload)
      } catch (err) {
        console.error(`[GuideEngine] Error in '${event}' listener:`, err)
      }
    }
  }

  // ==================== Proximity checking ====================

  /**
   * Called on every position update.
   * Checks whether the user is within triggerRadius of any POI.
   * Emits poiEnter once per visit (deduplicated via _visited set).
   * Emits poiExit when user leaves a previously-entered POI radius.
   */
  private _checkProximity(): void {
    if (this._pois.length === 0) return

    // POIs within radius this tick
    const currentTickActive = new Set<string>()

    for (const poi of this._pois) {
      // 复用 distanceToPOI()：它已正确处理两类定位 ——
      //   ① type === 'gps' 走 haversine
      //   ② 任何带 scenePosition 的 POI 走场景坐标（manual / vps / ble 都算）
      //
      // 此前这里内联了一份只认 'manual' 的副本，导致 type 为 'vps' 或 'ble' 的 POI
      // 距离恒为 Infinity、永远不会触发 poiEnter（而同一个文件里的 distanceToPOI()
      // 早就写对了）。自研 VPS 接进来后会因为这条分支完全失效，故统一到单一实现。
      const dist = this.distanceToPOI(poi)

      const withinRadius = dist <= poi.triggerRadius

      if (withinRadius) {
        currentTickActive.add(poi.id)
      }

      // poiEnter: first time entering this POI
      if (withinRadius && !this._visited.has(poi.id)) {
        this._visited.add(poi.id)
        this._activePOIs.add(poi.id)
        this._emit('poiEnter', poi)
        console.log(`[GuideEngine] Entered POI "${poi.name}" (dist=${dist.toFixed(1)}m)`)

        // 自动推进导航指针：到达（或经过）当前目标后，把「正在前往的 POI」
        // 切到下一个。否则 currentPOI 永远停在起点，导致 HUD 进度、
        // 方向箭头与列表高亮全部停留在第 1 个 POI。
        const enteredIdx = this._pois.indexOf(poi)
        if (enteredIdx >= this._currentIndex && this._currentIndex < this._pois.length - 1) {
          this._currentIndex = Math.min(enteredIdx + 1, this._pois.length - 1)
        }

        // If autoTrigger, also run the onEnter action
        if (poi.autoTrigger && poi.onEnter) {
          this._executeAction(poi.onEnter)
        }

        // Check whether all POIs have been visited
        if (this._visited.size >= this._pois.length) {
          this._emit('guideComplete', undefined)
          this._emit('navigationComplete', undefined)
          console.log('[GuideEngine] Guide complete — all POIs visited')
        }
      }
    }

    // poiExit: POIs that were active but are no longer within radius
    for (const poiId of this._activePOIs) {
      if (!currentTickActive.has(poiId)) {
        this._activePOIs.delete(poiId)
        const poi = this._pois.find(p => p.id === poiId)
        if (poi) {
          this._emit('poiExit', poi)
          console.log(`[GuideEngine] Exited POI "${poi.name}"`)
          if (poi.onExit) {
            this._executeAction(poi.onExit)
          }
        }
      }
    }
  }

  /**
   * Execute a POIAction by dispatching a CustomEvent so the HUD / UI layer can respond.
   */
  private _executeAction(action: POIAction | undefined): void {
    if (!action) return
    try {
      window.dispatchEvent(new CustomEvent('guide:action', {
        detail: { type: action.type, message: action.message, url: action.url },
      }))
    } catch { /* SSR guard */ }
  }
}
