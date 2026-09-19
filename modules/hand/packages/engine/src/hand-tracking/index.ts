export { GestureEngine } from './gesture-engine';
export { SwordStateMachine } from './sword-state-machine';
export { IntentPredictor } from './intent-predictor';
export { AdaptiveAR } from './adaptive-ar';
export { detectDeviceCapability } from './device-capability';
export { MediaPipeProvider } from './providers/mediapipe-provider';
export { WebXRProvider } from './providers/webxr-provider';
export { FallbackProvider } from './providers/fallback-provider';
export type {
  HandLandmarks, GestureResult, GestureType, DynamicGestureType,
  DeviceCapability, TrackingProviderType, TrackingFrame,
  SwordState, SwordTransition, GestureEngineConfig,
} from './types';
