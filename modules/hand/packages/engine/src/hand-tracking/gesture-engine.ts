import * as ort from 'onnxruntime-web';
import type { GestureEngineConfig, GestureResult, GestureType, DeviceCapability } from './types';
import { detectDeviceCapability } from './device-capability';

// Label order MUST match the trained ONNX model output:
//   Static: ['FIST', 'IDLE', 'OPEN_PALM', 'POINT', 'THUMBS_UP']
//   Dynamic: ['IDLE', 'SWORD_BLOCK', 'SWORD_SWING', 'SWORD_THRUST']
// Deterministic ordering is enforced by training/dataset.py (sorted labels).
const GESTURE_LABELS: GestureType[] = [
  'FIST', 'IDLE', 'OPEN_PALM', 'POINT', 'THUMBS_UP',
];

const DYNAMIC_LABELS = ['IDLE', 'SWORD_BLOCK', 'SWORD_SWING', 'SWORD_THRUST'];

export class GestureEngine {
  private staticSession: ort.InferenceSession | null = null;
  private dynamicSession: ort.InferenceSession | null = null;
  private config: GestureEngineConfig;
  private deviceCapability: DeviceCapability | null = null;
  private frameHistory: Float32Array[] = [];

  constructor(config: GestureEngineConfig) {
    this.config = {
      minConfidence: 0.5,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    this.deviceCapability = await detectDeviceCapability();
    const backend = this.config.backend || this.deviceCapability.recommendedBackend;

    const sessionOpts: ort.InferenceSession.SessionOptions = {
      executionProviders: [backend as any, 'wasm', 'cpu'],
    };

    const staticUrl = `${this.config.modelBaseUrl}/${this.config.staticModelPath}`;
    const dynamicUrl = `${this.config.modelBaseUrl}/${this.config.dynamicModelPath}`;

    [this.staticSession, this.dynamicSession] = await Promise.all([
      ort.InferenceSession.create(staticUrl, sessionOpts),
      ort.InferenceSession.create(dynamicUrl, sessionOpts),
    ]);
  }

  /** Classify a single frame of hand landmarks */
  async classify(landmarks63: Float32Array): Promise<GestureResult> {
    if (!this.staticSession) throw new Error('GestureEngine not initialized');

    const input = new ort.Tensor('float32', landmarks63, [1, 63]);
    const output = await this.staticSession.run({ landmarks_63: input });
    const logits = output.gesture_logits!.data as Float32Array;

    return this.decodeLogits(logits, GESTURE_LABELS);
  }

  /** Classify a sequence of frames for dynamic gesture recognition */
  async classifySequence(frames: Float32Array[]): Promise<GestureResult> {
    if (!this.dynamicSession) throw new Error('GestureEngine not initialized');

    const seqLen = 15;
    const padded = this.padSequence(frames, seqLen);
    const input = new ort.Tensor('float32', padded, [1, seqLen, 63]);
    const output = await this.dynamicSession.run({ landmark_sequence: input });
    const logits = output.gesture_logits!.data as Float32Array;

    return this.decodeLogits(logits, DYNAMIC_LABELS);
  }

  /** Push a frame into the history buffer (used for dynamic gesture detection) */
  pushFrame(landmarks63: Float32Array): void {
    this.frameHistory.push(landmarks63);
    if (this.frameHistory.length > 30) {
      this.frameHistory.shift();
    }
  }

  /** Get the current frame history for dynamic gesture analysis */
  getFrameHistory(): Float32Array[] {
    return this.frameHistory;
  }

  /** Get device capability info */
  getDeviceCapability(): DeviceCapability | null {
    return this.deviceCapability;
  }

  private decodeLogits(logits: Float32Array, labels: string[]): GestureResult {
    if (logits.length !== labels.length) {
      throw new Error(
        `Model output dimension (${logits.length}) does not match labels (${labels.length}). ` +
        `The model may have been retrained without updating label arrays.`
      );
    }

    const maxLogit = Math.max(...Array.from(logits));
    const expSum = Array.from(logits).reduce((s, v) => s + Math.exp(v - maxLogit), 0);
    const probs = Array.from(logits).map(v => Math.exp(v - maxLogit) / expSum);

    const maxIdx = probs.indexOf(Math.max(...probs));
    const topClass = labels[maxIdx] as GestureType;
    const confidence = probs[maxIdx]!;

    const allProbabilities: Record<string, number> = {};
    labels.forEach((label, i) => { allProbabilities[label] = probs[i]!; });

    return { gesture: topClass, confidence, allProbabilities };
  }

  private padSequence(frames: Float32Array[], targetLen: number): Float32Array {
    const flat63 = new Float32Array(targetLen * 63);
    for (let i = 0; i < Math.min(frames.length, targetLen); i++) {
      flat63.set(frames[i]!.slice(0, 63), i * 63);
    }
    // If fewer frames than targetLen, last frame is repeated (padding at end)
    if (frames.length < targetLen && frames.length > 0) {
      const last = frames[frames.length - 1]!;
      for (let i = frames.length; i < targetLen; i++) {
        flat63.set(last.slice(0, 63), i * 63);
      }
    }
    return flat63;
  }

  dispose(): void {
    this.staticSession?.release();
    this.dynamicSession?.release();
    this.staticSession = null;
    this.dynamicSession = null;
    this.frameHistory = [];
  }
}
