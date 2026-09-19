import type { SwordState, SwordTransition, GestureResult, GestureType } from './types';

const SWING_VELOCITY_THRESHOLD = 0.3; // m/s
const GRIP_THUMB_INDEX_DISTANCE = 0.03; // 3cm
const FOLLOW_THROUGH_FRAMES = 10;

interface WristPosition {
  x: number; y: number; z: number;
  timestamp: number;
}

export class SwordStateMachine {
  private state: SwordState = 'IDLE';
  private history: WristPosition[] = [];
  private followThroughCount = 0;
  private gripStartTime = 0;
  private lastTransition: SwordTransition | null = null;

  constructor(
    private onTransition?: (t: SwordTransition) => void,
  ) {}

  get currentState(): SwordState {
    return this.state;
  }

  get lastTransitionEvent(): SwordTransition | null {
    return this.lastTransition;
  }

  update(gesture: GestureResult, landmarks: Float32Array, timestamp: number): SwordState {
    const wrist = this.extractWrist(landmarks);
    this.history.push({ x: wrist[0], y: wrist[1], z: wrist[2], timestamp });
    if (this.history.length > 30) this.history.shift();

    const velocity = this.calcWristVelocity();
    const thumbIndexDist = this.calcThumbIndexDistance(landmarks);

    switch (this.state) {
      case 'IDLE':
        if (this.detectGrip(gesture, thumbIndexDist)) {
          this.gripStartTime = timestamp;
          this.transition('GRIP', velocity);
        }
        break;

      case 'GRIP':
        if (velocity > SWING_VELOCITY_THRESHOLD && gesture.confidence > 0.6) {
          this.followThroughCount = 0;
          this.transition('SWING', velocity);
        } else if (this.detectRelease(gesture, timestamp)) {
          this.transition('IDLE');
        }
        break;

      case 'SWING':
        this.followThroughCount++;
        if (this.followThroughCount > FOLLOW_THROUGH_FRAMES) {
          this.transition('FOLLOW_THROUGH', velocity);
        }
        break;

      case 'FOLLOW_THROUGH':
        if (this.detectRelease(gesture, timestamp) || gesture.gesture === 'IDLE') {
          this.transition('IDLE');
        }
        break;
    }

    return this.state;
  }

  reset(): void {
    this.state = 'IDLE';
    this.history = [];
    this.followThroughCount = 0;
    this.lastTransition = null;
  }

  private transition(to: SwordState, velocity?: number): void {
    const from = this.state;
    this.state = to;
    this.lastTransition = { from, to, timestamp: Date.now(), velocity };
    this.onTransition?.(this.lastTransition);
  }

  private detectGrip(gesture: GestureResult, thumbIndexDist: number): boolean {
    if (gesture.gesture === 'FIST') {
      return thumbIndexDist < GRIP_THUMB_INDEX_DISTANCE;
    }
    return false;
  }

  private detectRelease(gesture: GestureResult, _timestamp: number): boolean {
    const releaseGestures: GestureType[] = ['OPEN_PALM', 'IDLE', 'POINT'];
    return releaseGestures.includes(gesture.gesture);
  }

  private extractWrist(landmarks: Float32Array): [number, number, number] {
    // Wrist is the first 3 values in the 63-dim array
    return [landmarks[0]!, landmarks[1]!, landmarks[2]!];
  }

  private calcWristVelocity(): number {
    if (this.history.length < 3) return 0;
    const recent = this.history.slice(-3);
    const dt = (recent[2]!.timestamp - recent[0]!.timestamp) / 1000;
    if (dt < 0.001) return 0;
    const dx = recent[2]!.x - recent[0]!.x;
    const dy = recent[2]!.y - recent[0]!.y;
    const dz = recent[2]!.z - recent[0]!.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
  }

  private calcThumbIndexDistance(landmarks: Float32Array): number {
    // Landmark indices: thumb tip=4, index tip=8
    const getPoint = (i: number) => ({
      x: landmarks[i * 3]!,
      y: landmarks[i * 3 + 1]!,
      z: landmarks[i * 3 + 2]!,
    });
    const t = getPoint(4);
    const i = getPoint(8);
    const dx = t.x - i.x;
    const dy = t.y - i.y;
    const dz = t.z - i.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}
