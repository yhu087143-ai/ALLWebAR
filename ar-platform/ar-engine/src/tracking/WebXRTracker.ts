/**
 * WebXRTracker — ITracker wrapper around WebXRAdapter
 *
 * Bridges between the existing WebXRAdapter (which implements
 * IEngineAdapter) and the ITracker interface so GuideEngine and
 * other consumers can get pose data uniformly.
 */

import * as THREE from 'three'
import type { ITracker, TrackerPose, TrackerConfig, TrackerStatus } from './ITracker'
import type { CapabilityType } from '../types/enums'
import { WebXRAdapter } from '../adapters/WebXRAdapter'

export class WebXRTracker implements ITracker {
  readonly name = 'webxr'
  readonly priority = 0  // highest priority

  private _adapter: WebXRAdapter
  private _status: TrackerStatus = 'stopped'
  private _poseCallbacks = new Set<(pose: TrackerPose) => void>()
  private _statusCallbacks = new Set<(status: TrackerStatus) => void>()
  private _lastPose: TrackerPose | null = null
  private _lastPoseTime = 0
  private _animFrameId: number | null = null

  constructor(adapter: WebXRAdapter) {
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

    // WebXRAdapter is started externally via its own start()
    // We just hook into its render loop via Three.js
    this._status = 'tracking'
    this._emitStatus()

    // Poll pose from the adapter every frame
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
    const adapter = this._adapter
    if (!adapter.isRunning) {
      if (this._status !== 'stopped') {
        this._status = 'lost'
        this._emitStatus()
      }
      return
    }

    const pose = adapter.getPose()
    if (!pose) {
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

    this._lastPose = pose
    this._lastPoseTime = pose.timestamp

    for (const cb of this._poseCallbacks) {
      try { cb(pose) } catch (e) { console.warn('[WebXRTracker] pose callback error:', e) }
    }
  }

  private _emitStatus(): void {
    for (const cb of this._statusCallbacks) {
      try { cb(this._status) } catch (e) { console.warn('[WebXRTracker] status callback error:', e) }
    }
  }
}
