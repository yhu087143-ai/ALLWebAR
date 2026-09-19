import type { TrackingFrame, TrackingProviderType } from '../types';

export class FallbackProvider {
  private mousePos = { x: 0, y: 0 };
  private isPressed = false;

  get type(): TrackingProviderType { return 'fallback'; }

  async initialize(): Promise<void> {
    window.addEventListener('mousemove', (e) => {
      this.mousePos.x = e.clientX / window.innerWidth;
      this.mousePos.y = e.clientY / window.innerHeight;
    });
    window.addEventListener('mousedown', () => { this.isPressed = true; });
    window.addEventListener('mouseup', () => { this.isPressed = false; });
  }

  getFrame(): TrackingFrame {
    // Create synthetic landmarks from mouse position
    const raw = new Float32Array(63);
    raw[0] = this.mousePos.x;
    raw[1] = this.mousePos.y;
    raw[4 * 3] = this.isPressed ? 0.01 : 0.1;  // thumb tip
    raw[8 * 3] = this.isPressed ? 0.02 : 0.1;  // index tip

    return {
      landmarks: {
        landmarks63: raw,
        raw,
        handedness: 'Right',
        timestamp: Date.now(),
      },
      provider: 'fallback',
      timestamp: Date.now(),
    };
  }

  stop(): void {
    // No cleanup needed for passive listeners
  }
}
