// @ts-nocheck
'use client';

import { create } from 'zustand';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface LandmarkPoint {
  x: number; // normalized 0-1
  y: number; // normalized 0-1
}

/** 21 landmarks organized by finger (MediaPipe convention) */
export interface FingerData {
  thumb: LandmarkPoint[];   // indices 1-4 (CMC, MCP, IP, TIP)
  index: LandmarkPoint[];   // indices 5-8 (MCP, PIP, DIP, TIP)
  middle: LandmarkPoint[];  // indices 9-12
  ring: LandmarkPoint[];    // indices 13-16
  pinky: LandmarkPoint[];   // indices 17-20
}

export interface MCPQuadData {
  /** The 4 knuckle joints: index MCP (5), middle MCP (9), ring MCP (13), pinky MCP (17) */
  knuckles: LandmarkPoint[];
  /** Center of the quadrilateral (average of 4 knuckles) */
  center: LandmarkPoint;
}

export interface HandleNodeData {
  /** 4 nodes along the sword handle that map to the 4 MCP joints */
  nodes: LandmarkPoint[];
  /** Distance from grip point for each node (normalized) */
  offsets: number[];
}

export interface SwordPositionData {
  /** Grip point (center of MCP quad) — normalized 0-1 */
  grip: LandmarkPoint;
  /** Sword angle in radians (atan2 from grip → middle finger MCP) */
  angleRad: number;
  /** Sword angle in degrees (for human reading) */
  angleDeg: number;
  /** Blade tip position projected in normalized space */
  bladeTip: LandmarkPoint;
  /** Blade length in normalized units */
  bladeLength: number;
}

export interface FistDetectionData {
  /** Number of curled fingers (0-5) */
  curledCount: number;
  /** Which fingers are curled (by name) */
  curledFingers: string[];
  /** Wrist velocity in normalized-units/second */
  velocity: number;
  /** Whether a swipe is detected */
  isSwiping: boolean;
  /** Whether the fist/grip pose is active */
  isFistDetected: boolean;
}

/* ------------------------------------------------------------------ */
/*  Full snapshot pushed into the store each frame                    */
/* ------------------------------------------------------------------ */

export interface DebugSnapshot {
  landmarks: LandmarkPoint[];           // all 21, index = landmark index
  fingers: FingerData;
  mcpQuad: MCPQuadData;
  handleNodes: HandleNodeData;
  sword: SwordPositionData;
  fist: FistDetectionData;
  fps: number;
  timestamp: number;
}

/* ------------------------------------------------------------------ */
/*  Store                                                             */
/* ------------------------------------------------------------------ */

interface DebugStore {
  /** Is the panel visible? */
  visible: boolean;
  /** Latest debug snapshot (replaced each frame, not merged) */
  snapshot: DebugSnapshot | null;

  /** Toggle visibility */
  toggle: () => void;
  setVisible: (v: boolean) => void;
  /** Called from the tracking loop every frame */
  pushSnapshot: (s: DebugSnapshot) => void;
}

export const useDebugStore = create<DebugStore>((set) => ({
  visible: false,
  snapshot: null,

  toggle: () => set((s) => ({ visible: !s.visible })),
  setVisible: (v) => set({ visible: v }),

  pushSnapshot: (snapshot) => {
    // Zustand's set() with object replaces — but we use shallow equality
    // internally, so if the ref changes every frame, subscribers still
    // get notified. We use a stable selector pattern in the panel to
    // avoid unnecessary re-renders.
    set({ snapshot });
  },
}));

/* ------------------------------------------------------------------ */
/*  Helper: build a DebugSnapshot from raw MediaPipe landmarks + state */
/* ------------------------------------------------------------------ */

const FINGER_INDICES: [keyof FingerData, number][] = [
  ['thumb', 1], ['index', 5], ['middle', 9], ['ring', 13], ['pinky', 17],
];

const FINGER_JOINT_NAMES: Record<keyof FingerData, string[]> = {
  thumb: ['CMC', 'MCP', 'IP', 'TIP'],
  index: ['MCP', 'PIP', 'DIP', 'TIP'],
  middle: ['MCP', 'PIP', 'DIP', 'TIP'],
  ring: ['MCP', 'PIP', 'DIP', 'TIP'],
  pinky: ['MCP', 'PIP', 'DIP', 'TIP'],
};

/** Convert a flat Float32Array (63 values: 21 landmarks × 3 coords) to our types */
export function buildSnapshot(
  raw: Float32Array,
  fps: number,
  sword: { gripX: number; gripY: number; angle: number; active: boolean },
  velocity: number,
  curledCount: number,
  curledFingers: string[],
  isFistDetected: boolean,
  bladeLengthNorm: number,
): DebugSnapshot {
  // 1. All landmarks
  const landmarks: LandmarkPoint[] = [];
  for (let i = 0; i < 21; i++) {
    landmarks.push({ x: raw[i * 3], y: raw[i * 3 + 1] });
  }

  // 2. By finger
  const fingers = {} as FingerData;
  for (const [name, start] of FINGER_INDICES) {
    const pts: LandmarkPoint[] = [];
    for (let j = 0; j < 4; j++) {
      const idx = start + j;
      pts.push({ x: raw[idx * 3], y: raw[idx * 3 + 1] });
    }
    fingers[name] = pts;
  }

  // 3. MCP quad (indices 5, 9, 13, 17)
  const mcpIndices = [5, 9, 13, 17];
  const knuckles = mcpIndices.map((i) => ({ x: raw[i * 3], y: raw[i * 3 + 1] }));
  const center = {
    x: knuckles.reduce((s, p) => s + p.x, 0) / 4,
    y: knuckles.reduce((s, p) => s + p.y, 0) / 4,
  };

  // 4. Sword handle nodes — map each MCP joint to a node on the handle
  //    The handle extends backward from the grip point along -angle.
  //    Handle node positions are interpolated between the grip point and
  //    the corresponding MCP (or projected onto the handle axis).
  //    We use the MCP distance from center to determine per-node offset.
  const handleNodes: LandmarkPoint[] = [];
  const offsets: number[] = [];
  const handleLen = 0.12; // approx handle length in normalized space
  for (let i = 0; i < 4; i++) {
    const mcp = knuckles[i];
    // Distance from center → MCP determines how far along handle this node sits
    const dist = Math.hypot(mcp.x - center.x, mcp.y - center.y);
    // Normalize to 0-1 range along the handle (clamped)
    const offset = Math.min(dist * 3, 1);
    offsets.push(offset);
    // Project backward from grip along the handle direction
    const node: LandmarkPoint = {
      x: center.x - Math.cos(sword.angle) * handleLen * (0.25 + offset * 0.75),
      y: center.y - Math.sin(sword.angle) * handleLen * (0.25 + offset * 0.75),
    };
    handleNodes.push(node);
  }

  // 5. Sword position data
  const bladeLen = 0.45; // blade length in normalized space
  const bladeTip: LandmarkPoint = {
    x: center.x + Math.cos(sword.angle) * bladeLen,
    y: center.y + Math.sin(sword.angle) * bladeLen,
  };

  return {
    landmarks,
    fingers,
    mcpQuad: { knuckles, center },
    handleNodes: { nodes: handleNodes, offsets },
    sword: {
      grip: { x: sword.gripX, y: sword.gripY },
      angleRad: sword.angle,
      angleDeg: ((sword.angle * 180) / Math.PI + 360) % 360,
      bladeTip,
      bladeLength: bladeLen,
    },
    fist: {
      curledCount,
      curledFingers,
      velocity,
      isSwiping: velocity > 0.25,
      isFistDetected,
    },
    fps,
    timestamp: performance.now(),
  };
}
