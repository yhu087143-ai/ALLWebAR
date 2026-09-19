/**
 * @ar-platform/engine 公开 API
 *
 * 其他模块（如 React 前端）通过此入口导入：
 *   import { AREngine } from "@ar-platform/engine";
 *   import type { ARConfig } from "@ar-platform/engine";
 */

export { AREngine } from "./ar-engine";
export { getConfigFromURL } from "./config";
export { selectTracking, initMindAR, preloadMindAR, checkWebXRSupport } from "./tracking-legacy";
export type { ARConfig } from "./config";
export type { TrackingType } from "./tracking-legacy";

// ============  New Unified Architecture Exports (Phase 1+) ============

// Types
export {
  EngineType,
  CapabilityType,
} from './types'
export type {
  IEngineAdapter,
  ICapabilityModule,
  UnifiedARConfig,
  CapabilityModuleConfig,
  ImageTrackingConfig,
  FaceTrackingConfig,
  WorldTrackingConfig,
  FaceEffectsConfig,
  SkyEffectsConfig,
  PlaneDetectionConfig,
  GreetingTextConfig,
  ModelConfig,
  EightWallAppConfig,
  TrackingTuning,
  ProjectMeta,
  AREntity,
  InteractionRule,
  GameConfig,
  UILayerConfig,
  AREventMap,
  AREventName,
  AREventCallback,
  GuideRoute,
  POI,
  POIPosition,
  POIAction,
  PositioningConfig,
} from './types'

// Core
export { CapabilityRegistry } from './core/CapabilityRegistry'
export { EventBus } from './core/EventBus'
export { SceneManager } from './core/SceneManager'
export { selectEngine, instantiateEngine, validateCapabilities } from './core/EngineAdapterFactory'
export type { CapabilityFactory } from './core/CapabilityRegistry'

// Adapters
export { EightWallAdapter } from './adapters/EightWallAdapter'
export { WebXRAdapter } from './adapters/WebXRAdapter'

// Capability Modules
export { WorldTrackingModule } from './capabilities/world-tracking'
export { FaceEffectsModule } from './capabilities/face-effects'
export { FaceModelGenerator } from './capabilities/face-effects/FaceModelGenerator'
export type { FaceModelType } from './capabilities/face-effects/FaceModelGenerator'
export { SkyEffectsModule } from './capabilities/sky-effects'
export { CapabilityModule } from './capabilities/base'

// Model
export { ModelManager } from './model/ModelManager'
export type { ModelLoadCallbacks } from './model/ModelManager'

// Video
export { VideoPlayer } from './video'
export type { VideoPlayerConfig } from './video'

// Interaction
export { TouchRotator, GyroscopeFusion, ProjectionAdapter, InteractionRunner } from './interaction'
export type { ActionHandlers } from './interaction'

// Game Engine
export { GameEngine, ScoreManager, TimerManager, SpawnManager, CollectManager, ParticleBurst, SoundManager, GameLogicRunner, GridManager, WaveManager } from './game'
export type { GameEvent, GameEventPayloads, SpawnManagerConfig, SpawnedItem, RuntimeContext } from './game'

// Guide Engine
export { GuideEngine, GuideHUD, GPSPositionProvider, BLEPositionProvider, VPSPositionProvider, GUIDE_TEMPLATES } from './guide'
export type { GuideEvent, GuideEventPayloads, IPositionProvider, UserPosition, INavigationSystem, NavigationEvent, NavigationEventPayloads } from './guide'

// ==== Phase 3 Unified Experience Types ====
export type {
  ARExperience,
  UnifiedPOI,
  UnifiedRule,
  UnifiedCondition,
  UnifiedAction,
  HUDConfig,
  HUDComponent,
  HUDComponentType,
  HUDAnchor,
  UIComponentStyle,
  UITheme,
  UIThemePreset,
  GridConfig,
  WaveConfig,
  Wave,
  WaveEnemy,
  EntityBehavior,
} from './types'
export {
  getThemePreset,
  getAllThemePresets,
  applyThemePreset,
} from './types'

// Animation
export { AnimationController } from './animation/AnimationController';
export type { AnimationConfig } from './animation/AnimationController';
// 程序化动效（自转/悬浮/脉冲/进场）：不依赖 GLB 自带动画片段
export { MotionController } from './animation/MotionController';
export type { MotionConfig } from './animation/MotionController';

// Utils
export { loadScript, waitForGlobal } from './utils/loader'

// Sensors
export { OrientationManager } from './sensors/OrientationManager'
export { WebXROrientationProvider } from './sensors/WebXROrientationProvider'
export { MadgwickOrientationProvider } from './sensors/MadgwickOrientationProvider'
export { GenericSensorProvider } from './sensors/GenericSensorProvider'
export { DeviceOrientationProvider } from './sensors/DeviceOrientationProvider'
export { CameraMotionDetector } from './sensors/CameraMotionDetector'
export type { IOrientationProvider } from './sensors/IOrientationProvider'
export type { OrientationManagerConfig } from './sensors/OrientationManager'

// ── Phase 1 New Modules ──

// Tracking (ITracker interface + wrappers)
export type { ITracker, TrackerPose, TrackerConfig, TrackerStatus } from './tracking'
export { WebXRTracker } from './tracking'

// Bridge (tracking ↔ GuideEngine)
export { ScenePositionProvider, ARWorldBridge } from './bridge'
export type { ScenePositionProviderConfig, ARWorldAnchor, GPSOrigin, GPSProjectionResult } from './bridge'

// ARHUD System
export { ARHUD } from './ui/ARHUD'
export { GameStateManager } from './ui/GameState'
export type { GameState, StateListener } from './ui/GameState'
export type { UIComponentRenderer } from './ui/UIComponentRenderer'
export { SpatialAudioManager } from './audio/SpatialAudio'
export type { SpatialAudioPosition } from './audio/SpatialAudio'
