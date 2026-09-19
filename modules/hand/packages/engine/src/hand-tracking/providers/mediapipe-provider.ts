import type { HandLandmarks, TrackingFrame, TrackingProviderType } from '../types';

type MediaPipeHands = any;

export class MediaPipeProvider {
  private hands: MediaPipeHands | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  running = false;
  private modelTier: 'full' | 'lite';

  constructor(config?: { modelTier?: 'full' | 'lite' }) {
    this.modelTier = config?.modelTier ?? 'full';
  }

  get type(): TrackingProviderType { return 'mediapipe'; }

  async initialize(): Promise<void> {
    const { HandLandmarker, FilesetResolver } = await import(
      '@mediapipe/tasks-vision'
    );

    const vision = await FilesetResolver.forVisionTasks('/wasm');

    this.hands = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: this.modelTier === 'lite'
          ? '/models/hand_landmarker_lite.task'
          : '/models/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: this.modelTier === 'lite' ? 0.6 : 0.7,
      minTrackingConfidence: this.modelTier === 'lite' ? 0.6 : 0.65,
    });
  }

  async startCamera(videoElement: HTMLVideoElement): Promise<MediaStream> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: 640, height: 480 },
      });
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) {
        throw err;
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
    }
    videoElement.srcObject = this.stream;
    this.video = videoElement;
    await videoElement.play();
    this.running = true;
    return this.stream;
  }

  async detect(videoElement?: HTMLVideoElement): Promise<TrackingFrame | null> {
    if (!this.hands || !this.running) return null;
    const vid = videoElement || this.video;
    if (!vid || vid.readyState < 2) return null;

    let result;
    try {
      result = this.hands.detectForVideo(vid, performance.now());
    } catch {
      return { landmarks: null, provider: 'mediapipe', timestamp: Date.now() };
    }

    if (!result.landmarks || result.landmarks.length === 0) {
      return { landmarks: null, provider: 'mediapipe', timestamp: Date.now() };
    }

    const hand = result.landmarks[0]!;
    const raw = new Float32Array(hand.flatMap((lm: any) => [lm.x, lm.y, lm.z]));
    if (raw.length < 30) {
      return { landmarks: null, provider: 'mediapipe', timestamp: Date.now() };
    }
    const normalized = this.normalize(raw);

    let handedness: 'Left' | 'Right' | null = null;
    if (result.handednesses?.[0]?.[0]?.displayName === 'Left') {
      handedness = 'Left';
    } else if (result.handednesses?.[0]?.[0]?.displayName === 'Right') {
      handedness = 'Right';
    }

    return {
      landmarks: {
        landmarks63: normalized,
        raw,
        handedness: handedness ?? 'Right',
        timestamp: Date.now(),
      },
      provider: 'mediapipe',
      timestamp: Date.now(),
    };
  }

  stop(): void {
    this.running = false;
    this.hands?.close();
    this.hands = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.video = null;
  }

  private normalize(raw: Float32Array): Float32Array {
    if (raw.length < 30) return new Float32Array(63);
    const wrist = raw.slice(0, 3);
    const midMcp = raw.slice(9 * 3, 9 * 3 + 3);
    let scale = Math.sqrt(
      (midMcp[0]! - wrist[0]!) ** 2 +
      (midMcp[1]! - wrist[1]!) ** 2 +
      (midMcp[2]! - wrist[2]!) ** 2
    );
    if (scale < 1e-6) scale = 1;
    const norm = new Float32Array(63);
    for (let i = 0; i < 21; i++) {
      norm[i * 3] = (raw[i * 3]! - wrist[0]!) / scale;
      norm[i * 3 + 1] = (raw[i * 3 + 1]! - wrist[1]!) / scale;
      norm[i * 3 + 2] = (raw[i * 3 + 2]! - wrist[2]!) / scale;
    }
    return norm;
  }
}
