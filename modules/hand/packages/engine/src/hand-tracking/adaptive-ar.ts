// @ts-nocheck
import type { GestureResult } from './types';

/** Per-finger geometry profile learned from the user */
interface FingerProfile {
  /** Average tip-to-palm distance ratio (relative to palm-center distance) */
  avgRatio: number;
  /** Standard deviation of observed ratios */
  stdRatio: number;
  /** Number of samples collected */
  samples: number;
}

/** Complete user hand profile, persisted in localStorage */
interface UserHandProfile {
  fingers: FingerProfile[];
  /** Observed palm width references */
  palmRefs: number[];
  /** Number of calibration frames collected */
  totalSamples: number;
  /** Version for migration */
  version: number;
}

/** Adaptively computed thresholds */
interface AdaptiveThresholds {
  /** Per-finger curl threshold (tip-to-palm / mcp-to-palm ratio) */
  curlThresholds: number[];
  /** Wrist velocity threshold for swing detection */
  swingVelocityThreshold: number;
  /** Gesture confidence threshold for reliable detection */
  minConfidence: number;
}

export interface AdaptiveFeedback {
  message: string;
  type: 'info' | 'warning' | 'success' | 'tip';
  gesture?: string;
}

const STORAGE_KEY = '1xr_hand_profile';

function defaultProfile(): UserHandProfile {
  return {
    fingers: Array.from({ length: 5 }, () => ({ avgRatio: 0, stdRatio: 0, samples: 0 })),
    palmRefs: [],
    totalSamples: 0,
    version: 1,
  };
}

function loadProfile(): UserHandProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as UserHandProfile;
      if (p.version === 1) return p;
    }
  } catch { /* ignore corrupt data */ }
  return defaultProfile();
}

function saveProfile(p: UserHandProfile): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* storage full */ }
}

/**
 * Online streaming variance update (Welford's algorithm).
 * Allows incremental updates without storing all samples.
 */
function updateStats(currAvg: number, currStd: number, n: number, newVal: number): { avg: number; std: number } {
  const avg = currAvg + (newVal - currAvg) / (n + 1);
  const std = n > 0 ? Math.sqrt(((n - 1) * currStd * currStd + (newVal - currAvg) * (newVal - avg)) / n) : 0;
  return { avg, std };
}

/** Finger-to-palm ratios for all 5 fingers */
function computeFingerRatios(raw: Float32Array): number[] {
  // Palm center: average of wrist (0), index MCP (5), middle MCP (9), ring MCP (13), pinky MCP (17)
  const px = (raw[0] + raw[15] + raw[27] + raw[39] + raw[51]) / 5;
  const py = (raw[1] + raw[16] + raw[28] + raw[40] + raw[52]) / 5;

  const tips = [4, 8, 12, 16, 20]; // thumb tip, index tip, middle tip, ring tip, pinky tip
  const mcps = [1, 5, 9, 13, 17];  // thumb MCP, index MCP, middle MCP, ring MCP, pinky MCP

  return tips.map((tip, i) => {
    const td = Math.hypot(raw[tip * 3] - px, raw[tip * 3 + 1] - py);
    const md = Math.hypot(raw[mcps[i] * 3] - px, raw[mcps[i] * 3 + 1] - py);
    return md > 0 ? td / md : 1;
  });
}

export class AdaptiveAR {
  private profile: UserHandProfile = defaultProfile();
  private thresholds: AdaptiveThresholds = {
    curlThresholds: [1.8, 1.8, 1.8, 1.8, 1.8],
    swingVelocityThreshold: 0.25,
    minConfidence: 0.5,
  };
  private lastGestures: Array<{ gesture: string; confidence: number; time: number }> = [];
  private feedbackBuffer: AdaptiveFeedback[] = [];
  private lastFeedbackTime = 0;
  private gestureStabilityCount = 0;
  private lastStableGesture = '';
  private learning = false;
  private calibrationComplete = false;

  constructor() {
    this.profile = loadProfile();
    this.calibrationComplete = this.profile.totalSamples >= 50;
    if (this.calibrationComplete) {
      this.thresholds = this.computeThresholds();
    }
  }

  /** Feed a hand frame to update the adaptive model */
  feed(raw: Float32Array, gestureResult: GestureResult | null): void {
    const ratios = computeFingerRatios(raw);
    const now = performance.now();

    // Update finger profiles online
    this.learning = true;
    ratios.forEach((ratio, i) => {
      const fp = this.profile.fingers[i]!;
      const n = fp.samples;
      const { avg, std } = updateStats(fp.avgRatio, fp.stdRatio, n, ratio);
      fp.avgRatio = avg;
      fp.stdRatio = std;
      fp.samples = n + 1;
    });
    this.profile.totalSamples++;
    saveProfile(this.profile);

    // Check if calibration is now complete
    if (!this.calibrationComplete && this.profile.totalSamples >= 50) {
      this.calibrationComplete = true;
      this.thresholds = this.computeThresholds();
    }

    // Track gesture history for stability & adaptive feedback
    if (gestureResult) {
      this.lastGestures.push({
        gesture: gestureResult.gesture,
        confidence: gestureResult.confidence,
        time: now,
      });
      if (this.lastGestures.length > 30) this.lastGestures.shift();
    }

    // Update thresholds adaptively after calibration
    if (this.calibrationComplete && this.profile.totalSamples % 20 === 0) {
      this.thresholds = this.computeThresholds();
    }

    // Generate feedback
    this.generateFeedback(gestureResult, now);
  }

  /** Get adaptively computed thresholds */
  getThresholds(): AdaptiveThresholds {
    return this.thresholds;
  }

  /** Get latest feedback messages */
  getFeedback(): AdaptiveFeedback[] {
    return [...this.feedbackBuffer];
  }

  /** Check if a finger is curled using adaptive threshold */
  isFingerCurled(fingerIndex: number, ratio: number): boolean {
    const th = this.thresholds.curlThresholds[fingerIndex] ?? 1.8;
    return ratio < th;
  }

  /** Get adaptive fist detection result */
  isFist(raw: Float32Array): boolean {
    const ratios = computeFingerRatios(raw);
    let curled = 0;
    for (let i = 0; i < 5; i++) {
      if (this.isFingerCurled(i, ratios[i]!)) curled++;
    }
    // Adaptive minimum curled fingers (3 for most, 2 for users with stiffer hands)
    const minCurled = this.calibrationComplete && this.profile.fingers.some(f => f.avgRatio > 2.2) ? 2 : 3;
    return curled >= minCurled;
  }

  /** Smooth gesture prediction using temporal + confidence weighting */
  getSmoothedGesture(current: GestureResult | null): GestureResult | null {
    if (!current) return null;
    if (this.lastGestures.length < 5) return current;

    const recent = this.lastGestures.slice(-10);
    const gestureCounts = new Map<string, { count: number; totalConf: number }>();

    for (const g of recent) {
      const entry = gestureCounts.get(g.gesture) ?? { count: 0, totalConf: 0 };
      entry.count++;
      entry.totalConf += g.confidence;
      gestureCounts.set(g.gesture, entry);
    }

    let bestGesture = current.gesture;
    let bestScore = 0;

    for (const [gesture, stats] of gestureCounts) {
      // Score = frequency * average confidence
      const score = (stats.count / recent.length) * (stats.totalConf / stats.count);
      if (score > bestScore) {
        bestScore = score;
        bestGesture = gesture;
      }
    }

    // Track stability
    if (bestGesture === this.lastStableGesture) {
      this.gestureStabilityCount++;
    } else {
      this.gestureStabilityCount = 0;
      this.lastStableGesture = bestGesture;
    }

    const avgConf = recent.reduce((s, g) => s + g.confidence, 0) / recent.length;

    return { gesture: bestGesture, confidence: avgConf, allProbabilities: {} } as GestureResult;
  }

  /** Get adaptive velocity threshold for swing */
  getSwingVelocityThreshold(): number {
    return this.thresholds.swingVelocityThreshold;
  }

  /** Get adaptive confidence threshold */
  getMinConfidence(): number {
    return this.thresholds.minConfidence;
  }

  /** Whether calibration has enough data */
  isCalibrationComplete(): boolean {
    return this.calibrationComplete;
  }

  /** Calibration progress 0-1 */
  getCalibrationProgress(): number {
    return Math.min(this.profile.totalSamples / 50, 1);
  }

  /** Reset calibration data */
  resetCalibration(): void {
    this.profile = defaultProfile();
    saveProfile(this.profile);
    this.calibrationComplete = false;
    this.thresholds = {
      curlThresholds: [1.8, 1.8, 1.8, 1.8, 1.8],
      swingVelocityThreshold: 0.25,
      minConfidence: 0.5,
    };
    this.lastGestures = [];
    this.feedbackBuffer = [];
    this.lastFeedbackTime = 0;
  }

  private computeThresholds(): AdaptiveThresholds {
    const fingers = this.profile.fingers;
    const curlThresholds = fingers.map((fp, i) => {
      // The threshold is set at avg - 1.5 * std (one-tailed: we want to catch curling)
      // Clamped to [1.2, 2.5] for sanity
      const th = fp.avgRatio - 1.5 * fp.stdRatio;
      return Math.max(1.2, Math.min(2.5, th));
    });

    return {
      curlThresholds,
      swingVelocityThreshold: 0.25, // velocity is mostly device-dependent, keep default
      minConfidence: Math.max(0.3, 1 - this.profile.fingers.reduce((s, f) => s + f.stdRatio, 0) / 5),
    };
  }

  private generateFeedback(result: GestureResult | null, now: number): void {
    // Throttle: at most one message per 5 seconds
    if (now - this.lastFeedbackTime < 5000) return;

    const buffer: AdaptiveFeedback[] = [];

    if (!this.calibrationComplete && this.profile.totalSamples < 10) {
      buffer.push({ message: 'AI 正在学习您的手势...请多做各种手势', type: 'info' });
    } else if (!this.calibrationComplete) {
      const pct = Math.round(this.getCalibrationProgress() * 100);
      buffer.push({ message: `AI 校准中 ${pct}% - 继续做手势可提高识别`, type: 'info' });
    } else if (this.calibrationComplete) {
      buffer.push({ message: 'AI 自适应校准完成 ✓', type: 'success' });
    }

    if (result && result.confidence < 0.4) {
      buffer.push({ message: '置信度较低，请放慢动作', type: 'warning' });
    }

    if (result && result.gesture === 'FIST' && result.confidence > 0.8) {
      buffer.push({ message: '检测到握拳 - 剑已出鞘！', type: 'tip', gesture: 'FIST' });
    }

    if (this.gestureStabilityCount > 15 && this.lastStableGesture) {
      buffer.push({
        message: `稳定识别: ${this.lastStableGesture}`,
        type: 'success',
        gesture: this.lastStableGesture,
      });
    }

    if (buffer.length > 0) {
      this.feedbackBuffer = buffer.slice(0, 2); // max 2 messages
      this.lastFeedbackTime = now;
    }
  }
}
