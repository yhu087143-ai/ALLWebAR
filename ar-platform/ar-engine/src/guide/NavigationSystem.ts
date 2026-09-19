/**
 * NavigationSystem interface — abstracts POI-based AR navigation.
 *
 * Consumes a list of POIs and a position provider, computes distances,
 * emits lifecycle events as the user moves through POIs.
 *
 * Implementations: GuideEngine (existing), NavigationSystemLight (future).
 */

import type { GuideRoute, POI } from '../types/config'
import type { IPositionProvider, UserPosition } from './position/PositionProvider'

export type NavigationEvent =
  | 'poiEnter'
  | 'poiExit'
  | 'navigationStart'
  | 'navigationComplete'
  | 'positionUpdate'

export interface NavigationEventPayloads {
  poiEnter: POI
  poiExit: POI
  navigationStart: GuideRoute
  navigationComplete: void
  positionUpdate: UserPosition
}

export interface INavigationSystem {
  readonly running: boolean
  readonly currentPOI: POI | null
  readonly pois: POI[]
  readonly route: GuideRoute
  readonly progress: { current: number; total: number; visited: number }

  setPositionProvider(provider: IPositionProvider): void
  start(): void
  stop(): void
  nextPOI(): POI | null
  prevPOI(): POI | null
  distanceToPOI(poi: POI): number
  isVisited(poiId: string): boolean

  on<T extends NavigationEvent>(
    event: T,
    cb: (payload: NavigationEventPayloads[T]) => void,
  ): () => void
}
