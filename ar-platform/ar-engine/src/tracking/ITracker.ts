/**
 * ITracker — unified tracking interface
 *
 * All tracking backends (WebXR, XFeat VIO, MindAR) implement this
 * interface so the rest of the system can consume poses without
 * knowing which backend is active.
 */

import * as THREE from 'three'
import type { CapabilityType } from '../types/enums'

/** A single 6-DoF pose estimate from the tracker */
export interface TrackerPose {
  /** Camera position in world space */
  position: THREE.Vector3
  /** Camera orientation as a quaternion */
  quaternion: THREE.Quaternion
  /** Tracking quality 0..1 (1 = perfect, 0 = lost) */
  confidence: number
  /** What coordinate frame this pose is relative to */
  originType: 'world' | 'anchor' | 'image'
  /** Epoch ms when this pose was captured */
  timestamp: number
  /** Estimated camera motion speed in m/s (optional) */
  motionSpeed?: number
  /** Camera projection matrix (optional, for 3D correction) */
  projectionMatrix?: THREE.Matrix4
}

/** Current tracker lifecycle status */
export type TrackerStatus = 'initializing' | 'tracking' | 'lost' | 'stopped' | 'error'

export interface TrackerConfig {
  /** Minimum confidence before pose is considered lost */
  confidenceThreshold?: number
  /** Whether to enable drift correction via reloc worker */
  enableRelocalization?: boolean
}

export interface ITracker {
  /** Human-readable name (e.g. "webxr", "xfeat-vio") */
  readonly name: string
  /** Priority for CompositeTracker fallback chain (lower = tried first) */
  readonly priority: number
  /** Whether the tracker is currently running */
  readonly isRunning: boolean
  /** Current status */
  readonly status: TrackerStatus

  /** Start tracking */
  start(config?: TrackerConfig): Promise<void>
  /** Stop tracking and release resources */
  stop(): Promise<void>

  /** Get the latest pose estimate, or null if tracking is lost */
  getPose(): TrackerPose | null

  /** Which capabilities this tracker provides */
  getCapabilities(): CapabilityType[]

  /** Register a callback fired on every new pose */
  onPose(cb: (pose: TrackerPose) => void): () => void
  /** Register a callback fired on status changes */
  onStatus(cb: (status: TrackerStatus) => void): () => void
}
