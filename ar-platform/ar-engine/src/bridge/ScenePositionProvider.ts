/**
 * ScenePositionProvider — bridges ITracker poses into GuideEngine's IPositionProvider
 *
 * Converts 6-DoF camera poses from a tracking backend into UserPosition
 * events consumable by GuideEngine. The anchor point (where the user
 * placed the AR object) serves as the scene origin.
 *
 * This is the primary connection between the Tracking Loop and the
 * Navigation Loop in the closed-loop architecture.
 */

import * as THREE from 'three'
import type { IPositionProvider, UserPosition } from '../guide/position/PositionProvider'
import type { ITracker, TrackerPose } from '../tracking/ITracker'
import type { ARWorldAnchor } from './ARWorldBridge'

export interface ScenePositionProviderConfig {
  /** The tracking backend supplying poses */
  tracker: ITracker
  /** The world anchor defining the scene origin */
  anchor: ARWorldAnchor
  /** Minimum distance (metres) between position updates to emit (prevents spam) */
  minDistance?: number
}

export class ScenePositionProvider implements IPositionProvider {
  readonly name = 'scene'

  private _tracker: ITracker
  private _anchor: ARWorldAnchor
  private _minDistance: number
  private _callback: ((pos: UserPosition) => void) | null = null
  private _lastPosition: UserPosition | null = null
  private _lastScenePos: THREE.Vector3 | null = null
  private _running = false
  private _unsubPose: (() => void) | null = null

  constructor(config: ScenePositionProviderConfig) {
    this._tracker = config.tracker
    this._anchor = config.anchor
    this._minDistance = config.minDistance ?? 0.1
  }

  get available(): boolean {
    return true
  }

  start(): void {
    if (this._running) return
    this._running = true

    // Subscribe to tracker pose updates
    this._unsubPose = this._tracker.onPose((pose) => {
      this._onTrackerPose(pose)
    })
  }

  stop(): void {
    this._running = false
    if (this._unsubPose) {
      this._unsubPose()
      this._unsubPose = null
    }
  }

  onPosition(callback: (pos: UserPosition) => void): void {
    this._callback = callback
  }

  getCurrentPosition(): Promise<UserPosition> {
    if (this._lastPosition) {
      return Promise.resolve(this._lastPosition)
    }
    // If no position yet, try to get one from the tracker
    const pose = this._tracker.getPose()
    if (pose) {
      const pos = this._poseToUserPosition(pose)
      this._lastPosition = pos
      return Promise.resolve(pos)
    }
    return Promise.reject(new Error('No position available'))
  }

  /** Update the anchor (e.g. after placement or POI relocalization) */
  setAnchor(anchor: ARWorldAnchor): void {
    this._anchor = anchor
  }

  /** Get current anchor */
  get anchor(): ARWorldAnchor {
    return this._anchor
  }

  // ── private ──

  private _onTrackerPose(pose: TrackerPose): void {
    const userPos = this._poseToUserPosition(pose)
    const scenePos = new THREE.Vector3(userPos.sceneX!, userPos.sceneY!, userPos.sceneZ!)

    // Throttle updates by minimum distance
    if (this._lastScenePos) {
      const dist = scenePos.distanceTo(this._lastScenePos)
      if (dist < this._minDistance) return
    }

    this._lastScenePos = scenePos
    this._lastPosition = userPos
    this._callback?.(userPos)
  }

  private _poseToUserPosition(pose: TrackerPose): UserPosition {
    // Compute scene position relative to anchor origin
    const scenePos = pose.position.clone().sub(this._anchor.sceneOrigin)
    // Flip axes if needed — anchor defines the frame

    const userPos: UserPosition = {
      sceneX: scenePos.x,
      sceneY: scenePos.y,
      sceneZ: scenePos.z,
      heading: this._currentHeading(pose.quaternion),
      timestamp: pose.timestamp,
    }

    // Attach GPS from anchor if available
    if (this._anchor.gpsOrigin) {
      userPos.latitude = this._anchor.gpsOrigin.latitude
      userPos.longitude = this._anchor.gpsOrigin.longitude
      userPos.accuracy = this._anchor.gpsOrigin.accuracy
    }

    return userPos
  }

  /** 设备罗盘航向缓存（webkitCompassHeading，自北顺时针） */
  private _compass: { deg: number; at: number } | null = null

  /**
   * heading 修复（原 bug：把 SLAM 世界系 yaw 当正北，HUD 箭头永远不指 POI）。
   * 优先用设备罗盘（2s 内新鲜）；罗盘不可用才回退 SLAM yaw（仅供无罗盘设备降级，
   * 此时 heading 是"相对会话原点"而非真北）。
   * 由引擎的 deviceorientation 监听调用（iOS=webkitCompassHeading；Android=(360-α)%360）。
   */
  setCompassHeading(deg: number): void {
    this._compass = { deg, at: Date.now() }
  }

  private _currentHeading(fallbackQuat: THREE.Quaternion): number {
    if (this._compass && Date.now() - this._compass.at < 2000) {
      return ((this._compass.deg % 360) + 360) % 360
    }
    return this._quaternionToHeading(fallbackQuat)
  }

  /** Convert camera quaternion to heading degrees (0 = north, clockwise) — 降级用 */
  private _quaternionToHeading(q: THREE.Quaternion): number {
    const euler = new THREE.Euler().setFromQuaternion(q)
    // Yaw is the heading in radians
    let heading = THREE.MathUtils.radToDeg(euler.y)
    // Normalize to 0-360
    heading = ((heading % 360) + 360) % 360
    return heading
  }
}
