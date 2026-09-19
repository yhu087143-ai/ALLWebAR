/**
 * EightWallTracker — ITracker wrapper around EightWallAdapter
 *
 * Bridges the 8th Wall SLAM camera pose into the unified ITracker
 * interface so ScenePositionProvider can feed poses to GuideEngine,
 * closing the tracking→guidance loop.
 *
 * The tracker polls the adapter's Three.js camera each frame via
 * requestAnimationFrame. The 8th Wall SLAM provides world-space
 * 6-DoF poses through its XRController pipeline.
 */

import * as THREE from 'three'
import type { ITracker, TrackerPose, TrackerConfig, TrackerStatus } from './ITracker'
import type { CapabilityType } from '../types/enums'
import type { EightWallAdapter } from '../adapters/EightWallAdapter'

export class EightWallTracker implements ITracker {
  readonly name = 'eightwall'
  readonly priority = 0

  private _adapter: EightWallAdapter
  private _status: TrackerStatus = 'stopped'
  private _poseCallbacks = new Set<(pose: TrackerPose) => void>()
  private _statusCallbacks = new Set<(status: TrackerStatus) => void>()
  private _lastPose: TrackerPose | null = null
  private _animFrameId: number | null = null
  private _confThreshold: number = 0.3

  constructor(adapter: EightWallAdapter) {
    this._adapter = adapter
  }

  get isRunning(): boolean {
    return this._adapter.isRunning && this._status !== 'stopped'
  }

  get status(): TrackerStatus {
    return this._status
  }

  async start(_config?: TrackerConfig): Promise<void> {
    if (this._status !== 'stopped') return
    this._status = 'initializing'
    this._emitStatus()

    if (_config?.confidenceThreshold !== undefined) {
      this._confThreshold = _config.confidenceThreshold
    }

    this._status = 'tracking'
    this._emitStatus()

    // Poll the 8th Wall camera pose each frame
    const pollPose = () => {
      if (this._status === 'stopped') return
      this._pollPose()
      this._animFrameId = requestAnimationFrame(pollPose)
    }
    this._animFrameId = requestAnimationFrame(pollPose)
  }

  async stop(): Promise<void> {
    this._status = 'stopped'
    this._emitStatus()
    if (this._animFrameId !== null) {
      cancelAnimationFrame(this._animFrameId)
      this._animFrameId = null
    }
    this._lastPose = null
  }

  getPose(): TrackerPose | null {
    return this._lastPose
  }

  getCapabilities(): CapabilityType[] {
    return this._adapter.getSupportedCapabilities()
  }

  onPose(cb: (pose: TrackerPose) => void): () => void {
    this._poseCallbacks.add(cb)
    return () => { this._poseCallbacks.delete(cb) }
  }

  onStatus(cb: (status: TrackerStatus) => void): () => void {
    this._statusCallbacks.add(cb)
    return () => { this._statusCallbacks.delete(cb) }
  }

  // ── private ──

  private _pollPose(): void {
    const camera = this._adapter.camera
    if (!camera) {
      if (this._status !== 'stopped') {
        this._status = 'lost'
        this._emitStatus()
      }
      return
    }

    // 8th Wall SLAM confidence approximation:
    // - If placed and the object exists → good tracking
    // - Otherwise → lower confidence
    const hasPlaced = this._adapter.hasPlaced
    const confidence = hasPlaced ? 0.9 : 0.5

    if (confidence < this._confThreshold) {
      if (this._status === 'tracking') {
        this._status = 'lost'
        this._emitStatus()
      }
      return
    }

    if (this._status !== 'tracking') {
      this._status = 'tracking'
      this._emitStatus()
    }

    const pose: TrackerPose = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      confidence,
      originType: 'world',
      timestamp: performance.now(),
    }

    this._lastPose = pose

    for (const cb of this._poseCallbacks) {
      try { cb(pose) } catch (e) { console.warn('[EightWallTracker] pose callback error:', e) }
    }
  }

  private _emitStatus(): void {
    for (const cb of this._statusCallbacks) {
      try { cb(this._status) } catch (e) { console.warn('[EightWallTracker] status callback error:', e) }
    }
  }
}
