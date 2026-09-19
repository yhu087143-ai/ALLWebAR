import type { HandLandmarks, TrackingFrame, TrackingProviderType } from '../types';

export class WebXRProvider {
  private session: XRSession | null = null;
  private frameCallback: ((frame: TrackingFrame) => void) | null = null;

  get type(): TrackingProviderType { return 'webxr'; }

  async initialize(): Promise<boolean> {
    if (!('xr' in navigator)) return false;
    try {
      const supported = await (navigator as any).xr.isSessionSupported('immersive-ar');
      return supported;
    } catch { return false; }
  }

  async startSession(gl: WebGLRenderingContext): Promise<XRSession> {
    this.session = await (navigator as any).xr.requestSession('immersive-ar', {
      requiredFeatures: ['hand-tracking'],
    });
    return this.session!;
  }

  onFrame(cb: (frame: TrackingFrame) => void): void {
    this.frameCallback = cb;
  }

  processXRFrame(frame: XRFrame, referenceSpace: XRReferenceSpace): void {
    if (!this.session) return;
    for (const source of this.session.inputSources) {
      if (!source.hand) continue;

      const joints: number[] = [];
      for (const [_, joint] of Object.entries(source.hand)) {
        const pose = frame.getPose(joint as XRSpace, referenceSpace);
        if (pose) {
          joints.push(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
        } else {
          joints.push(0, 0, 0);
        }
      }

      if (joints.length === 72) { // 24 joints × 3
        const raw = new Float32Array(joints);
        const normalized = this.normalize(raw);
        const frameData: TrackingFrame = {
          landmarks: {
            landmarks63: normalized,
            raw,
            handedness: 'Right',
            timestamp: Date.now(),
          },
          provider: 'webxr',
          timestamp: Date.now(),
        };
        this.frameCallback?.(frameData);
      }
    }
  }

  stop(): void {
    this.session?.end();
    this.session = null;
  }

  private normalize(raw: Float32Array): Float32Array {
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
