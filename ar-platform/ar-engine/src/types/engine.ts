import * as THREE from 'three'
import type { UnifiedARConfig } from './config'
import { EngineType, CapabilityType } from './enums'
import type { DebugInfo } from './debug'

export interface IEngineAdapter {
  readonly type: EngineType

  initialize(container: HTMLElement, config: UnifiedARConfig): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>

  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera

  readonly isRunning: boolean

  getSupportedCapabilities(): CapabilityType[]

  update(frameDelta: number): void

  switchCamera?(): Promise<void>
  capturePhoto?(): string | null

  /** 调试信息（可选实现，供调试面板使用） */
  getDebugInfo?(): DebugInfo

  dispose(): void
}
