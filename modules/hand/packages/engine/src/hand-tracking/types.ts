/** Normalized 21-keypoint hand landmark data */
export interface HandLandmarks {
  /** 63 floats: 21 keypoints × (x, y, z), normalized relative to wrist */
  landmarks63: Float32Array;
  /** Raw landmarks from MediaPipe (pre-normalization) */
  raw: Float32Array;
  handedness: 'Left' | 'Right';
  timestamp: number;
}

/** Gesture classification result */
export interface GestureResult {
  gesture: GestureType;
  confidence: number;
  allProbabilities: Record<string, number>;
}

/** Supported gesture types */
export type GestureType =
  | 'FIST'
  | 'OPEN_PALM'
  | 'POINT'
  | 'THUMBS_UP'
  | 'SWORD_SWING'
  | 'SWORD_BLOCK'
  | 'SWORD_THRUST'
  | 'IDLE';

/** Dynamic gesture (from sequence model) */
export type DynamicGestureType =
  | 'SWORD_SWING'
  | 'SWORD_BLOCK'
  | 'SWORD_THRUST'
  | 'IDLE';

/** Device capability profile */
export interface DeviceCapability {
  tier: 'high' | 'medium' | 'low';
  webgpu: boolean;
  webgl: boolean;
  wasm: boolean;
  /** Recommended inference backend */
  recommendedBackend: 'webgpu' | 'webgl' | 'wasm';
  /** Recommended max frames per second for tracking */
  recommendedFps: number;
  /** Can run the full size model or needs lite */
  modelTier: 'full' | 'lite';
}

/** Provider types matching the four-tier architecture */
export type TrackingProviderType = 'webxr' | 'mediapipe' | 'webar-rocks' | 'fallback';

/** Unified hand tracking frame from any provider */
export interface TrackingFrame {
  landmarks: HandLandmarks | null;
  provider: TrackingProviderType;
  timestamp: number;
}

/** Sword interaction state */
export type SwordState = 'IDLE' | 'GRIP' | 'SWING' | 'FOLLOW_THROUGH';

/** Sword state transition event */
export interface SwordTransition {
  from: SwordState;
  to: SwordState;
  timestamp: number;
  velocity?: number;
}

/** Gesture engine configuration */
export interface GestureEngineConfig {
  modelBaseUrl: string;
  staticModelPath: string;
  dynamicModelPath: string;
  backend?: 'webgpu' | 'webgl' | 'wasm';
  debug?: boolean;
  minConfidence?: number;
}
