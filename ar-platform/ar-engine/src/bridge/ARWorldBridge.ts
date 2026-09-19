/**
 * ARWorldBridge — manages GPS↔scene coordinate transforms and world anchors
 *
 * When the user places an AR anchor (tap to place), the bridge records
 * the GPS coordinates + scene position pair, establishing the coordinate
 * frame for all subsequent transforms.
 *
 * This enables GPS POIs from GuideEngine to be rendered as 3D markers
 * in the AR scene, and scene-relative positions to be mapped to GPS
 * for telemetry.
 */

import * as THREE from 'three'

/** Earth mean radius in metres (WGS‑84) */
const EARTH_RADIUS = 6_371_000

export interface GPSOrigin {
  latitude: number
  longitude: number
  altitude?: number
  accuracy?: number
}

export interface ARWorldAnchor {
  id: string
  /** Scene-space origin (where the user tapped / object placed) */
  sceneOrigin: THREE.Vector3
  /** Optional GPS coordinates at the anchor point */
  gpsOrigin?: GPSOrigin
  /** Timestamp when this anchor was created */
  timestamp: number
}

export interface GPSProjectionResult {
  latitude: number
  longitude: number
  altitude: number
}

export class ARWorldBridge {
  private _anchors = new Map<string, ARWorldAnchor>()
  private _activeAnchorId: string | null = null

  /** Create a new anchor at the given scene position, optionally with GPS */
  createAnchor(id: string, sceneOrigin: THREE.Vector3, gpsOrigin?: GPSOrigin): ARWorldAnchor {
    const anchor: ARWorldAnchor = {
      id,
      sceneOrigin: sceneOrigin.clone(),
      gpsOrigin: gpsOrigin ? { ...gpsOrigin } : undefined,
      timestamp: performance.now(),
    }
    this._anchors.set(id, anchor)
    this._activeAnchorId = id
    return anchor
  }

  /** Delete an anchor by ID */
  deleteAnchor(id: string): void {
    this._anchors.delete(id)
    if (this._activeAnchorId === id) {
      this._activeAnchorId = null
    }
  }

  /** Set the active anchor (used for all transform operations) */
  setActiveAnchor(id: string): boolean {
    if (!this._anchors.has(id)) return false
    this._activeAnchorId = id
    return true
  }

  /** Get the active anchor */
  getActiveAnchor(): ARWorldAnchor | null {
    if (!this._activeAnchorId) return null
    return this._anchors.get(this._activeAnchorId) ?? null
  }

  /** Get an anchor by ID */
  getAnchor(id: string): ARWorldAnchor | null {
    return this._anchors.get(id) ?? null
  }

  /** Get all anchors */
  getAllAnchors(): ARWorldAnchor[] {
    return Array.from(this._anchors.values())
  }

  /**
   * Project a scene-relative position to GPS coordinates using the active anchor.
   * Uses a simplified equirectangular projection from the anchor's GPS origin.
   */
  sceneToGPS(sceneX: number, sceneY: number, sceneZ: number): GPSProjectionResult | null {
    const anchor = this.getActiveAnchor()
    if (!anchor || !anchor.gpsOrigin) return null

    const { latitude: lat0, longitude: lon0, altitude: alt0 = 0 } = anchor.gpsOrigin

    // Scene → GPS: y-up scene, where +Z is the user's forward direction at anchor time
    const dNorth = -sceneZ  // +Z in scene = south in GPS
    const dEast = sceneX    // +X in scene = east in GPS

    // Convert metres to degrees
    const latOffset = dNorth / EARTH_RADIUS * (180 / Math.PI)
    const lonOffset = dEast / (EARTH_RADIUS * Math.cos(lat0 * Math.PI / 180)) * (180 / Math.PI)

    return {
      latitude: lat0 + latOffset,
      longitude: lon0 + lonOffset,
      altitude: alt0 - sceneY,
    }
  }

  /**
   * Project GPS coordinates to scene-relative position using the active anchor.
   * Inverse of sceneToGPS.
   */
  gpsToScene(latitude: number, longitude: number): THREE.Vector3 | null {
    const anchor = this.getActiveAnchor()
    if (!anchor || !anchor.gpsOrigin) return null

    const { latitude: lat0, longitude: lon0 } = anchor.gpsOrigin

    // GPS → scene: inverse of sceneToGPS
    const dLat = (latitude - lat0) * Math.PI / 180
    const dLon = (longitude - lon0) * Math.PI / 180

    const dNorth = dLat * EARTH_RADIUS
    const dEast = dLon * EARTH_RADIUS * Math.cos(lat0 * Math.PI / 180)

    return new THREE.Vector3(
      dEast,   // scene X = east
      0,       // scene Y = height (assumed at ground level)
      -dNorth, // scene Z = south
    )
  }

  /**
   * Compute distance between a scene position and a GPS POI.
   * Uses Haversine when GPS data is available, Euclidean otherwise.
   */
  distanceToPOI(
    sceneX: number, sceneY: number, sceneZ: number,
    poiLat: number, poiLon: number,
  ): number | null {
    const anchor = this.getActiveAnchor()
    if (!anchor || !anchor.gpsOrigin) return null

    // First project the scene position to GPS, then use Haversine
    const userGPS = this.sceneToGPS(sceneX, sceneY, sceneZ)
    if (!userGPS) return null

    return this._haversine(userGPS.latitude, userGPS.longitude, poiLat, poiLon)
  }

  /** Clear all anchors */
  reset(): void {
    this._anchors.clear()
    this._activeAnchorId = null
  }

  // ── private ──

  private _haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return EARTH_RADIUS * c
  }
}
