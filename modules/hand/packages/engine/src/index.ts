export { GestureEngine, SwordStateMachine, IntentPredictor, AdaptiveAR, detectDeviceCapability } from './hand-tracking';
export { MediaPipeProvider, WebXRProvider, FallbackProvider } from './hand-tracking/providers';
export { QwenVLFallback } from './llm-fallback';
export type {
  HandLandmarks, GestureResult, GestureType, DynamicGestureType,
  DeviceCapability, SwordState, SwordTransition, TrackingFrame, GestureEngineConfig,
} from './hand-tracking';
