// @ts-nocheck
"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import * as THREE from "three";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * Anatomical constraint filter: corrects physically impossible hand landmark positions.
 * Uses universal hand proportions — no per-user calibration needed.
 * Returns a new Float32Array with corrected positions.
 */
function constrainLandmarks(raw: Float32Array): Float32Array {
  const out = new Float32Array(raw);

  // Finger joint groups: [mcp, pip, dip, tip]
  const fingers = [
    [5, 6, 7, 8] as const,
    [9, 10, 11, 12] as const,
    [13, 14, 15, 16] as const,
    [17, 18, 19, 20] as const,
  ];

  // --- 1. Finger segment consistency ---
  // Universal ratio: mcp→pip : pip→dip : dip→tip ≈ 1 : 0.7 : 0.5
  // If a segment is < 10% of total finger length, it's likely collapsed by occlusion
  const MIN_SEG_RATIO = 0.08;

  for (const [mcp, pip, dip, tip] of fingers) {
    const s1 = Math.hypot(out[pip * 3] - out[mcp * 3], out[pip * 3 + 1] - out[mcp * 3 + 1]);
    const s2 = Math.hypot(out[dip * 3] - out[pip * 3], out[dip * 3 + 1] - out[pip * 3 + 1]);
    const s3 = Math.hypot(out[tip * 3] - out[dip * 3], out[tip * 3 + 1] - out[dip * 3 + 1]);
    const total = s1 + s2 + s3;
    if (total < 0.003) continue; // finger too small → likely not tracked, skip

    // If any segment is implausibly short, redistribute by pushing the collapsed
    // joint along the direction from the previous joint toward the next visible joint
    if (s1 < total * MIN_SEG_RATIO) {
      // pip collapsed toward mcp → push out along mcp→dip direction
      const dx = out[dip * 3] - out[mcp * 3];
      const dy = out[dip * 3 + 1] - out[mcp * 3 + 1];
      const d = Math.hypot(dx, dy);
      if (d > 0.001) {
        const frac = (s2 + s3) > 0 ? s2 / (s2 + s3) * 0.5 : 0.35;
        out[pip * 3] = out[mcp * 3] + dx / d * total * frac;
        out[pip * 3 + 1] = out[mcp * 3 + 1] + dy / d * total * frac;
      }
    }
    if (s2 < total * MIN_SEG_RATIO) {
      // dip collapsed toward pip → push out along pip→tip direction
      const dx = out[tip * 3] - out[pip * 3];
      const dy = out[tip * 3 + 1] - out[pip * 3 + 1];
      const d = Math.hypot(dx, dy);
      if (d > 0.001) {
        const frac = 0.35;
        out[dip * 3] = out[pip * 3] + dx / d * total * frac;
        out[dip * 3 + 1] = out[pip * 3 + 1] + dy / d * total * frac;
      }
    }
    // If tip collapsed (rare), small push along dip→projected direction
    if (s3 < total * MIN_SEG_RATIO) {
      const dx = out[dip * 3] - out[pip * 3];
      const dy = out[dip * 3 + 1] - out[pip * 3 + 1];
      const d = Math.hypot(dx, dy);
      if (d > 0.001) {
        out[tip * 3] = out[dip * 3] + dx / d * total * 0.35;
        out[tip * 3 + 1] = out[dip * 3 + 1] + dy / d * total * 0.35;
      }
    }
  }

  // --- 2. MCP knuckle minimum spacing ---
  // Adjacent MCPs shouldn't be < 1/3 of their rolling average distance
  const mcpIdx = [5, 9, 13, 17];
  for (let i = 1; i < 4; i++) {
    const a = mcpIdx[i - 1];
    const b = mcpIdx[i];
    const dx = out[b * 3] - out[a * 3];
    const dy = out[b * 3 + 1] - out[a * 3 + 1];
    const d = Math.hypot(dx, dy);
    // If two adjacent MCPs are within a pixel or two, they've collapsed
    if (d < 0.001) {
      // Push the second one away from the first
      // (use the perpendicular direction as a heuristic)
      const pushDir = (i % 2 === 0) ? -dy : dy;
      out[b * 3] += 0.002;
      out[b * 3 + 1] += 0.002;
    }
  }

  // --- 3. Joint ordering within each finger ---
  // Ensure MCP→PIP→DIP→TIP progresses outward from palm
  // If a joint is closer to the palm than the previous one, nudge it back out
  for (const [mcp, pip, dip, tip] of fingers) {
    // Get approximate finger direction from MCP to the farthest out point
    const fx = out[tip * 3] - out[mcp * 3];
    const fy = out[tip * 3 + 1] - out[mcp * 3 + 1];
    const fLen = Math.hypot(fx, fy);
    if (fLen < 0.001) continue;

    // Check pip is not behind mcp along this direction
    const ppx = out[pip * 3] - out[mcp * 3];
    const ppy = out[pip * 3 + 1] - out[mcp * 3 + 1];
    const projPip = (ppx * fx + ppy * fy) / fLen;
    if (projPip < 0) {
      // pip is "behind" mcp → unlikely; nudge forward
      out[pip * 3] = out[mcp * 3] + fx / fLen * fLen * 0.3;
      out[pip * 3 + 1] = out[mcp * 3 + 1] + fy / fLen * fLen * 0.3;
    }

    // Check dip is not behind pip
    const ddx = out[dip * 3] - out[pip * 3];
    const ddy = out[dip * 3 + 1] - out[pip * 3 + 1];
    const projDip = (ddx * fx + ddy * fy) / fLen;
    if (projDip < 0) {
      out[dip * 3] = out[pip * 3] + fx / fLen * fLen * 0.3;
      out[dip * 3 + 1] = out[pip * 3 + 1] + fy / fLen * fLen * 0.3;
    }

    // Check tip is not behind dip
    const ttx = out[tip * 3] - out[dip * 3];
    const tty = out[tip * 3 + 1] - out[dip * 3 + 1];
    const projTip = (ttx * fx + tty * fy) / fLen;
    if (projTip < 0) {
      out[tip * 3] = out[dip * 3] + fx / fLen * fLen * 0.3;
      out[tip * 3 + 1] = out[dip * 3 + 1] + fy / fLen * fLen * 0.3;
    }
  }

  return out;
}

type Step = "idle" | "device" | "models" | "mediapipe" | "camera" | "running" | "error";

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

/** Palm outline: wrist + 4 MCP knuckles */
const PALM_LOOP = [0, 5, 9, 13, 17, 0];

interface LogEntry { time: string; msg: string; ok?: boolean }

/** A single frame snapshot for diagnostic analysis */
interface DiagFrame {
  t: number;           // timestamp (ms)
  l: number[];         // all 63 raw landmark values
  gx: number;          // gripX (raw)
  gy: number;          // gripY (raw)
  a: number;           // raw angle (rad)
  sa: number;          // smoothed angle (rad) — sw.angle
  mcpSpan: number;     // MCP5→MCP17 span
  curled: number;      // curled finger count
  fist: number;        // fist detected (0/1)
  conf: number;        // gesture confidence
  v: number;           // wrist velocity
  tx: number;          // computed tiltX
  ty: number;          // computed tiltY
  ss: number;          // smoothS (sword scale)
  dw: number;          // dispW (display width for coordinate mapping)
  dh: number;          // dispH (display height for coordinate mapping)
  ad: number;          // |rawAngle - smoothedAngle| angle delta (jitter indicator)
  hn: number[];        // handle nodes [t0,x0,y0, t1,x1,y1, ...] 4 centroids projected onto axis
  cents: number[];     // 4 finger centroids [cx0,cy0, cx1,cy1, cx2,cy2, cx3,cy3] (colored dots)
  lp: number[];        // landmark projections: [t0,d0, t1,d1, ...] for all 21 landmarks
}

export default function HandTrackingTestPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("idle");
  const [gesture, setGesture] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [fps, setFps] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [swordStatus, setSwordStatus] = useState<"" | "active" | "swinging">("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [showData, setShowData] = useState(false);
  const [showTune, setShowTune] = useState(false);
  const [tuneVals, setTuneVals] = useState({ smoothBase:0.12, tiltScale:2.0, swingVel:0.25, scaleMul:1.0, palmOffset:0.35 });
  const debugDataRef = useRef({ landmarks: [] as number[], handleNodes: [] as { x: number; y: number; idx: number; t: number }[], gripX: 0, gripY: 0, angle: 0 });
  const [modelLoadProgress, setModelLoadProgress] = useState<number | null>(null);

  // === Phase 1: Data labeling system ===
  interface RatingEntry {
    label: 'good' | 'bad';
    time: number;
    frames: DiagFrame[];
    errorPattern?: string;
  }
  const ratingBufRef = useRef<RatingEntry[]>([]);
  const [ratingCount, setRatingCount] = useState({ good: 0, bad: 0 });
  const [autoTune, setAutoTune] = useState(false);

  // === Phase 3: Calibration state ===
  type CalibStep = 'none' | 'intro' | 'recording' | 'done';
  const [calibStep, setCalibStep] = useState<CalibStep>('none');
  const [calibProgress, setCalibProgress] = useState(0);
  const calibDataRef = useRef<{ mcpSpan: number; wristPalm: number; curled: number }[]>([]);
  const CALIB_DURATION_FRAMES = 90; // ~3 seconds at 30fps
  const calibStepRef = useRef<CalibStep>('none');

  // Diagnostic ring buffer (always records last 300 frames)
  const diagBufRef = useRef<DiagFrame[]>([]);
  const MAX_DIAG_FRAMES = 300;
  const [diagCount, setDiagCount] = useState(0);

  const addLog = (msg: string, ok?: boolean) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { time, msg, ok }]);
  };

  const engineRef = useRef<any>(null);
  const providerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef(0);
  const frameCount = useRef(0);
  const fpsTimer = useRef(0);
  const runningRef = useRef(false);
  const startingRef = useRef(false);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const threeRef = useRef<any>(null);

  // Sword state (3D: palm normal defines blade direction)
  const swordRef = useRef({
    active: false, swinging: false, swingStartTime: 0,
    trail: [] as { x: number; y: number; t: number }[],
    gripX: 0, gripY: 0, angle: 0, pcaAngle: 0,
    forwardX: 0, forwardY: 0, forwardZ: 1,  // 3D blade direction (palm normal)
    upX: 0, upY: 1, upZ: 0,                 // 3D hand up direction
    handleNodes: [] as { x: number; y: number; idx: number; t: number; cx: number; cy: number }[],
    smoothS: 1,
    tiltX: 0, tiltY: 0,
  });
  const wristHistRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const gripLostRef = useRef(0);
  const paramsRef = useRef({ smoothBase:0.12, tiltScale:2.0, swingVel:0.25, scaleMul:1.0, palmOffset:0.35 });

  const drawFrame = (landmarks: Float32Array | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (canvas.width !== Math.floor(rect.width) || canvas.height !== Math.floor(rect.height)) {
      canvas.width = Math.floor(rect.width);
      canvas.height = Math.floor(rect.height);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width, h = canvas.height;
    if (w === 0 || h === 0) return;

    if (!landmarks) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, h / 2 - 30, w, 60);
      return;
    }

    const vid = videoRef.current;
    const videoW = (vid?.videoWidth ?? 0) || w;
    const videoH = (vid?.videoHeight ?? 0) || h;
    const scale = (videoW > 0 && videoH > 0) ? Math.max(w / videoW, h / videoH) : 1;
    const dispW = videoW * scale;
    const dispH = videoH * scale;
    const offsetX = (w - dispW) / 2;
    const offsetY = (h - dispH) / 2;

    const sw = swordRef.current;
    // Hand size (wrist→middleMCP) for sword scaling — EMA smoothed
    const handPx = Math.hypot(
      (landmarks[9*3] - landmarks[0]) * dispW,
      (landmarks[9*3+1] - landmarks[1]) * dispH
    );
    const rawS = Math.max(handPx, 20) / 20;
    const maxS = Math.min(w, h) * 0.7 / 200 * paramsRef.current.scaleMul;
    sw.smoothS += (Math.min(rawS, maxS) - sw.smoothS) * 0.25;
    const s = sw.smoothS;

    // Layer 1: Sword (behind the hand)
    if (sw.active) {
      const bx = sw.gripX * dispW + offsetX;
      const by = sw.gripY * dispH + offsetY;
      const now = performance.now();
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(sw.angle);

      if (sw.swinging) {
        for (const pt of sw.trail) {
          const age = (now - pt.t) / 250;
          if (age > 1) continue;
          const a = 1 - age;
          ctx.beginPath();
          ctx.arc((pt.x - sw.gripX) * dispW, (pt.y - sw.gripY) * dispH, (3 + a * 5) * s * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 200, 50, ${a * 0.5})`;
          ctx.fill();
        }
      }

      // Swing aura
      if (sw.swinging) {
        ctx.beginPath();
        ctx.arc(0, 0, (30 + Math.random() * 20) * s * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,200,50,${0.12 + Math.random() * 0.08})`;
        ctx.fill();
      }
      ctx.restore();
    }

    // Layer 2: Palm fill (semi-transparent, covers sword handle)
    ctx.beginPath();
    ctx.moveTo(landmarks[0]! * dispW + offsetX, landmarks[1]! * dispH + offsetY);
    for (let i = 1; i < PALM_LOOP.length; i++) {
      const idx = PALM_LOOP[i]!;
      ctx.lineTo(landmarks[idx * 3]! * dispW + offsetX, landmarks[idx * 3 + 1]! * dispH + offsetY);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();

    // Layer 3: Hand skeleton (on top of sword)
    ctx.lineCap = "round";
    for (const [i, j] of HAND_CONNECTIONS) {
      const xi = landmarks[i * 3]! * dispW + offsetX;
      const yi = landmarks[i * 3 + 1]! * dispH + offsetY;
      const xj = landmarks[j * 3]! * dispW + offsetX;
      const yj = landmarks[j * 3 + 1]! * dispH + offsetY;
      if (isNaN(xi) || isNaN(yi)) continue;
      ctx.beginPath();
      ctx.moveTo(xi, yi);
      ctx.lineTo(xj, yj);
      ctx.strokeStyle = "rgba(0, 255, 120, 0.25)";
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xi, yi);
      ctx.lineTo(xj, yj);
      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    for (let i = 0; i < 21; i++) {
      const x = landmarks[i * 3]! * dispW + offsetX;
      const y = landmarks[i * 3 + 1]! * dispH + offsetY;
      if (isNaN(x) || isNaN(y)) continue;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "rgba(255, 100, 68, 0.3)" : "rgba(0, 255, 136, 0.3)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "#ff6644" : "#00ff88";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Debug: 4 finger quadrilaterals & sword axis
    // Each finger (index/middle/ring/pinky) has 4 joints forming a quadrilateral.
    // The sword is a straight line passing through all 4 finger centroids.
    if (sw.active || true) {
      const fingerDef: { joints: [number,number,number,number]; color: string; label: string }[] = [
        { joints: [5,6,7,8], color: "#ff4444", label: "I" },
        { joints: [9,10,11,12], color: "#44dd44", label: "M" },
        { joints: [13,14,15,16], color: "#4488ff", label: "R" },
        { joints: [17,18,19,20], color: "#ff44ff", label: "P" },
      ];
      for (const { joints, color, label } of fingerDef) {
        const [a,b,c,d] = joints;
        // Quadrilateral outline
        ctx.beginPath();
        ctx.moveTo(landmarks[a*3]*dispW+offsetX, landmarks[a*3+1]*dispH+offsetY);
        for (const j of [b,c,d,a]) {
          ctx.lineTo(landmarks[j*3]*dispW+offsetX, landmarks[j*3+1]*dispH+offsetY);
        }
        ctx.closePath();
        ctx.strokeStyle = color + "66";
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Centroid of this finger's quadrilateral
        const cx = (landmarks[a*3]+landmarks[b*3]+landmarks[c*3]+landmarks[d*3]) / 4;
        const cy = (landmarks[a*3+1]+landmarks[b*3+1]+landmarks[c*3+1]+landmarks[d*3+1]) / 4;
        const cxPx = cx * dispW + offsetX;
        const cyPx = cy * dispH + offsetY;
        ctx.beginPath();
        ctx.arc(cxPx, cyPx, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = "10px sans-serif";
        ctx.fillText(label, cxPx + 6, cyPx + 3);
      }
      // Red line: PCA first principal component through 4 centroids
      const centsPos: {x:number;y:number}[] = [];
      for (const { joints } of fingerDef) {
        const [a,b,c,d] = joints;
        const cx = (landmarks[a*3]+landmarks[b*3]+landmarks[c*3]+landmarks[d*3]) / 4;
        const cy = (landmarks[a*3+1]+landmarks[b*3+1]+landmarks[c*3+1]+landmarks[d*3+1]) / 4;
        centsPos.push({x: cx * dispW + offsetX, y: cy * dispH + offsetY});
      }
      let theta = sw.angle; // default to sword angle
      if (centsPos.length === 4) {
        const avgCx = (centsPos[0].x + centsPos[1].x + centsPos[2].x + centsPos[3].x) / 4;
        const avgCy = (centsPos[0].y + centsPos[1].y + centsPos[2].y + centsPos[3].y) / 4;
        let xx = 0, xy = 0, yy = 0;
        for (const p of centsPos) {
          const dx = p.x - avgCx, dy = p.y - avgCy;
          xx += dx * dx; xy += dx * dy; yy += dy * dy;
        }
        theta = (xx + yy) > 0.0001 ? 0.5 * Math.atan2(2 * xy, xx - yy) : sw.angle;
        // Resolve 180° ambiguity: align with sword direction
        if (sw.gripX !== 0 || sw.gripY !== 0) {
          const pd = theta - sw.angle;
          if (pd > Math.PI / 2) theta -= Math.PI;
          else if (pd < -Math.PI / 2) theta += Math.PI;
        }
        const cosA = Math.cos(theta), sinA = Math.sin(theta);
        ctx.beginPath();
        ctx.moveTo(avgCx - cosA * 150, avgCy - sinA * 150);
        ctx.lineTo(avgCx + cosA * 150, avgCy + sinA * 150);
        ctx.strokeStyle = "rgba(255, 50, 50, 0.7)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // Sword axis line
      const gpX = sw.gripX * dispW + offsetX;
      const gpY = sw.gripY * dispH + offsetY;
      const axisVisLen = 200 * s;
      const cosA = Math.cos(theta), sinA = Math.sin(theta);
      ctx.beginPath();
      ctx.moveTo(gpX - cosA * axisVisLen, gpY - sinA * axisVisLen);
      ctx.lineTo(gpX + cosA * axisVisLen, gpY + sinA * axisVisLen);
      ctx.strokeStyle = "rgba(0, 200, 255, 0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Handle nodes = centroids projected onto PCA line (same as red line)
      const COLORS = ["#ff4444", "#44dd44", "#4488ff", "#ff44ff"];
      const rlCosA = Math.cos(theta), rlSinA = Math.sin(theta);
      for (const node of sw.handleNodes) {
        // Project raw centroid onto red line (PCA) direction
        const rlT = (node.cx - sw.gripX) * rlCosA + (node.cy - sw.gripY) * rlSinA;
        const nx = (sw.gripX + rlT * rlCosA) * dispW + offsetX;
        const ny = (sw.gripY + rlT * rlSinA) * dispH + offsetY;
        const color = COLORS[node.idx] ?? "#fff";
        // Sword marker dot (same position as the centroid)
        ctx.beginPath();
        ctx.arc(nx, ny, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // Grip center (white dot)
      ctx.beginPath();
      ctx.arc(gpX, gpY, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      // Regular marker points along the sword axis (every ~30px)
      const markerSpacing = 30 * s;
      const markerCount = Math.floor(axisVisLen / markerSpacing);
      for (let m = -markerCount; m <= markerCount; m++) {
        if (m === 0) continue; // skip grip center (already drawn)
        const mx = gpX + cosA * m * markerSpacing;
        const my = gpY + sinA * m * markerSpacing;
        ctx.beginPath();
        ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 200, 255, 0.6)";
        ctx.fill();
      }
      // Blade tip marker (at the far end of the axis)
      const tipX = gpX + cosA * axisVisLen;
      const tipY = gpY + sinA * axisVisLen;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 200, 255, 0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Pommel marker (at the handle end)
      const pomX = gpX - cosA * axisVisLen * 0.3;
      const pomY = gpY - sinA * axisVisLen * 0.3;
      ctx.beginPath();
      ctx.arc(pomX, pomY, 4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(200, 150, 100, 0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };

  const downloadDiag = useCallback(() => {
    const buf = diagBufRef.current;
    if (buf.length < 10) return;

    // Compute summary statistics
    const angles = buf.map(f => f.a);
    const sa = buf.map(f => f.sa);
    const angleDeltas: number[] = [];
    for (let i = 1; i < buf.length; i++) {
      let d = buf[i].a - buf[i-1].a;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      angleDeltas.push(Math.abs(d));
    }

    // Detect jitter events: frames where angle change > 0.08 rad
    const jitterEvents: { start: number; end: number; severity: number }[] = [];
    let inJitter = false;
    let jStart = 0, jMax = 0;
    for (let i = 0; i < angleDeltas.length; i++) {
      if (angleDeltas[i] > 0.08) {
        if (!inJitter) { inJitter = true; jStart = i; jMax = angleDeltas[i]; }
        else { jMax = Math.max(jMax, angleDeltas[i]); }
      } else if (inJitter) {
        inJitter = false;
        if (i - jStart >= 2) jitterEvents.push({ start: jStart, end: i, severity: jMax });
      }
    }
    if (inJitter && buf.length - 1 - jStart >= 2) {
      jitterEvents.push({ start: jStart, end: buf.length - 1, severity: jMax });
    }

    // Per-landmark stability: which landmarks move the most frame-to-frame
    const lmJitter: { idx: number; meanDx: number; meanDy: number; peakDx: number; peakDy: number }[] = [];
    if (buf.length > 1) {
      for (let i = 0; i < 21; i++) {
        let sumDx = 0, sumDy = 0, maxDx = 0, maxDy = 0;
        for (let f = 1; f < buf.length; f++) {
          const dx = Math.abs(buf[f].l[i*3] - buf[f-1].l[i*3]);
          const dy = Math.abs(buf[f].l[i*3+1] - buf[f-1].l[i*3+1]);
          sumDx += dx; sumDy += dy;
          maxDx = Math.max(maxDx, dx); maxDy = Math.max(maxDy, dy);
        }
        lmJitter.push({ idx: i, meanDx: sumDx / buf.length, meanDy: sumDy / buf.length, peakDx: maxDx, peakDy: maxDy });
      }
    }

    const data = {
      meta: {
        recordedAt: new Date().toISOString(),
        frameCount: buf.length,
        durationSec: buf.length > 1 ? (buf[buf.length-1].t - buf[0].t) / 1000 : 0,
        params: { ...paramsRef.current },
        ratings: { good: ratingCount.good, bad: ratingCount.bad },
      },
      summary: {
        meanAngleDelta: angleDeltas.reduce((a, b) => a + b, 0) / angleDeltas.length,
        maxAngleDelta: Math.max(...angleDeltas, 0),
        jitterEventCount: jitterEvents.length,
        jitterEvents,
        mostJitteryLandmarks: lmJitter.sort((a, b) => (b.meanDx + b.meanDy) - (a.meanDx + a.meanDy)).slice(0, 6),
      },
      frames: buf,
    };
    const json = JSON.stringify(data);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hand-diag-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog(`诊断数据已导出 (${buf.length} 帧, ${jitterEvents.length} 次抖动事件, ${(json.length / 1024).toFixed(0)} KB)`, true);
  }, [addLog]);

  // Export all accumulated labeled frames as a training dataset
  const exportLabeledData = useCallback(() => {
    const ratings = ratingBufRef.current;
    if (ratings.length < 1) { addLog('没有标记数据可导出', false); return; }
    // Build a compact dataset: each entry has label + summary stats (not full frames to keep size manageable)
    const dataset = ratings.map((r, i) => ({
      id: i,
      label: r.label,
      time: new Date(r.time).toISOString(),
      errorPattern: r.errorPattern,
      frameCount: r.frames.length,
      params: { ...paramsRef.current },
      // Store only aggregate stats per entry, not full frames (would be too large)
      avgMcpSpan: r.frames.reduce((s, f) => s + f.mcpSpan, 0) / r.frames.length,
      avgAngleDelta: r.frames.reduce((s, f) => s + f.ad, 0) / r.frames.length,
      avgCentroidErr: r.frames.length > 0 && r.frames[0].cents ? r.frames.reduce((s, f) => {
        let e = 0, n = 0;
        if (f.cents && f.hn) {
          for (let i = 0; i < 4; i++) {
            e += Math.hypot(f.hn[i*3+1] - f.cents[i*2], f.hn[i*3+2] - f.cents[i*2+1]);
            n++;
          }
        }
        return s + (n > 0 ? e / n : 0);
      }, 0) / r.frames.length : undefined,
      avgWristPalm: r.frames.reduce((s, f) => {
        const l = f.l; return s + Math.hypot(f.gx - l[0], f.gy - l[1]);
      }, 0) / r.frames.length,
    }));
    const data = {
      exportedAt: new Date().toISOString(),
      totalEntries: ratings.length,
      goodCount: ratings.filter(r => r.label === 'good').length,
      badCount: ratings.filter(r => r.label === 'bad').length,
      datasets: dataset,
      // Option: include full frame data of the first 5 entries for detailed analysis
      sampleData: ratings.slice(0, 5).map(r => ({
        label: r.label, errorPattern: r.errorPattern,
        frames: r.frames.slice(0, 30), // first 30 frames per sample
      })),
    };
    const json = JSON.stringify(data);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hand-labeled-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog(`标记数据集已导出 (${ratings.length} 条, ${(json.length / 1024).toFixed(0)} KB)`, true);
  }, [addLog]);

  // === Phase 2: Analyze error patterns from labeled data ===
  function analyzeErrorPattern(frames: DiagFrame[]): string {
    const adVals = frames.map(f => f.ad);
    const avgAd = adVals.reduce((a, b) => a + b, 0) / adVals.length;
    const maxAd = Math.max(...adVals);
    let dirDiffSum = 0, dc = 0;
    for (const f of frames) {
      const l = f.l;
      const wristAngle = Math.atan2(f.gy - l[1], f.gx - l[0]);
      let d = Math.abs(f.a - wristAngle);
      if (d > Math.PI) d = Math.PI * 2 - d;
      dirDiffSum += d; dc++;
    }
    const avgDirDiff = dc > 0 ? dirDiffSum / dc : 0;
    if (avgAd > 0.05) return `抖动(avgΔ=${avgAd.toFixed(3)})`;
    if (maxAd > 0.3) return `角度跳变(maxΔ=${maxAd.toFixed(2)})`;
    if (avgDirDiff > 0.8) return `偏离手腕方向(${(avgDirDiff * 180 / Math.PI).toFixed(0)}°)`;
    // Check grip deviation
    for (const f of frames.slice(0, 20)) {
      const l = f.l;
      const mcpCx = (l[15] + l[27] + l[39] + l[51]) / 4;
      const mcpCy = (l[16] + l[28] + l[40] + l[52]) / 4;
      if (Math.hypot(f.gx - mcpCx, f.gy - mcpCy) > 0.08) return '握柄偏移掌心';
    }
    return '未知';
  }

  // Phase 2: Auto-optimize params from labeled data
  const autoOptimizeParams = useCallback(() => {
    const ratings = ratingBufRef.current;
    const badOnes = ratings.filter(r => r.label === 'bad');
    const goodOnes = ratings.filter(r => r.label === 'good');
    if (badOnes.length < 2) return;

    // Analyze bad data: what's the common mcpSpan range where things fail?
    let avgBadSpan = 0, badCount = 0, jitterCount = 0, angleJumpCount = 0;
    for (const r of badOnes) {
      for (const f of r.frames) { avgBadSpan += f.mcpSpan; badCount++; }
      if (r.errorPattern?.includes('抖动')) jitterCount++;
      if (r.errorPattern?.includes('角度跳变')) angleJumpCount++;
    }
    avgBadSpan /= badCount;

    // Auto-tune based on error distribution
    let msg = '';
    if (jitterCount > angleJumpCount && avgBadSpan < 0.06) {
      // Jitter at small span → increase smoothing
      const ns = Math.min(0.3, paramsRef.current.smoothBase + 0.03);
      paramsRef.current.smoothBase = ns;
      setTuneVals(prev => ({ ...prev, smoothBase: ns }));
      msg = `小MCP抖动: 平滑 ${ns.toFixed(2)}`;
    }
    if (angleJumpCount > jitterCount && avgBadSpan < 0.05) {
      // Angle jumps when MCP clustered → hold angle more aggressively
      msg = `大角度跳变: 建议降低置信度阈值`;
    }
    // Check if good data gives us a good baseline
    if (goodOnes.length >= 2) {
      let avgGoodSpan = 0, gc = 0;
      for (const r of goodOnes) {
        for (const f of r.frames) { avgGoodSpan += f.mcpSpan; gc++; }
      }
      avgGoodSpan /= gc;
      if (avgGoodSpan > 0.08 && avgBadSpan < 0.05) {
        msg += ` | 好MCP=${avgGoodSpan.toFixed(3)} 坏=${avgBadSpan.toFixed(3)} → MCP小=平滑`;
      }
    }
    if (msg) addLog(`自动优化: ${msg}`, true);
  }, [addLog]);

  // Phase 1: Rate current diagnostic data
  const rateCurrent = useCallback((label: 'good' | 'bad') => {
    const buf = diagBufRef.current;
    if (buf.length < 10) { addLog('数据不足 (需要 ≥10 帧)', false); return; }
    const errorPattern = label === 'bad' ? analyzeErrorPattern(buf) : undefined;
    ratingBufRef.current.push({ label, time: Date.now(), frames: [...buf], errorPattern });
    setRatingCount(prev => ({ ...prev, [label]: prev[label] + 1 }));
    addLog(`标记为${label === 'good' ? '好' : '坏'} (${buf.length} 帧)${errorPattern ? ': ' + errorPattern : ''}`, true);
    if (autoTune && label === 'bad') autoOptimizeParams();
  }, [addLog, autoTune, autoOptimizeParams]);

  // Phase 3: Calibration
  const startCalibration = useCallback(() => {
    setCalibStep('intro');
    calibStepRef.current = 'intro';
    calibDataRef.current = [];
    setCalibProgress(0);
  }, []);

  const doCalibration = useCallback(() => {
    setCalibStep('recording');
    calibStepRef.current = 'recording';
    calibDataRef.current = [];
    setCalibProgress(0);
  }, []);

  const finishCalibration = useCallback(() => {
    const data = calibDataRef.current;
    if (data.length < 20) { addLog('校准数据不足', false); setCalibStep('none'); return; }
    // Analyze: find typical mcpSpan range and wrist→palm separation
    let avgSpan = 0, minSpan = 1, maxSpan = 0, avgWP = 0;
    for (const d of data) { avgSpan += d.mcpSpan; minSpan = Math.min(minSpan, d.mcpSpan); maxSpan = Math.max(maxSpan, d.mcpSpan); avgWP += d.wristPalm; }
    avgSpan /= data.length; avgWP /= data.length;
    // Create calibration profile
    const profile = {
      smoothBase: avgSpan < 0.06 ? 0.18 : 0.12,
      tiltScale: 2.0,
      swingVel: 0.25,
      scaleMul: 1.0,
      angleConfThresh: Math.max(0.03, avgWP * 0.5),
      recordedAt: Date.now(),
    };
    // Save to localStorage
    try {
      localStorage.setItem('hand_calib_profile', JSON.stringify(profile));
      addLog(`校准完成: 平滑=${profile.smoothBase} 角度阈值=${profile.angleConfThresh.toFixed(3)}`, true);
    } catch (e) { addLog('保存校准失败', false); }
    // Apply params
    paramsRef.current.smoothBase = profile.smoothBase;
    setTuneVals(prev => ({ ...prev, smoothBase: profile.smoothBase }));
    setCalibStep('done');
  }, [addLog]);

  // Load saved calibration on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hand_calib_profile');
      if (saved) {
        const profile = JSON.parse(saved);
        paramsRef.current.smoothBase = profile.smoothBase;
        setTuneVals(prev => ({ ...prev, smoothBase: profile.smoothBase }));
      }
    } catch (e) { /* ignore */ }
  }, []);

  // Keep ref in sync with calibStep state
  useEffect(() => { calibStepRef.current = calibStep; }, [calibStep]);

  const cleanup = useCallback(() => {
    runningRef.current = false;
    startingRef.current = false;
    providerRef.current?.stop();
    providerRef.current = null;
    engineRef.current?.dispose();
    engineRef.current = null;
    const cvs = canvasRef.current;
    if (cvs) { const c = cvs.getContext("2d"); c?.clearRect(0, 0, cvs.width, cvs.height); }
    const vid = videoRef.current;
    if (vid?.srcObject instanceof MediaStream) {
      vid.srcObject.getTracks().forEach((t) => t.stop());
      vid.srcObject = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    // Hide 3D sword (keep Three.js alive across stop/start)
    if (threeRef.current?.sword) threeRef.current.sword.visible = false;
  }, []);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      cleanup();
      startingRef.current = true;
      setErrorMsg(null);
      setLogs([]);
      setSwordStatus("");
      swordRef.current = { active: false, swinging: false, swingStartTime: 0, trail: [], gripX: 0, gripY: 0, angle: 0, pcaAngle: 0, handleNodes: [], smoothS: 1, tiltX: 0, tiltY: 0 };
      wristHistRef.current = [];
      gripLostRef.current = 0;
      addLog("开始初始化...");
      // Load GLB sword model (44MB, may take time)
      let swordModel: THREE.Group | null = null;
      let swordModelScale = 1;
      try {
        addLog("正在下载刀模型");
        setModelLoadProgress(0);
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/');
        const gltfLoader = new GLTFLoader();
        gltfLoader.setDRACOLoader(dracoLoader);
        const gltf = await new Promise<any>((resolve, reject) => {
          gltfLoader.load('/models/sword.glb', resolve, (p) => {
            if (p.total > 0) setModelLoadProgress(Math.round(p.loaded / p.total * 100));
          }, reject);
        });
        setModelLoadProgress(null);
        swordModel = gltf.scene;
        // Scale to 200-unit system using longest axis
        const bbox = new THREE.Box3().setFromObject(swordModel);
        const size = bbox.getSize(new THREE.Vector3());
        const bladeLen = Math.max(size.x, size.y, size.z);
        if (bladeLen > 0.001) {
          swordModelScale = 200 / bladeLen;
          swordModel.scale.set(swordModelScale, swordModelScale, swordModelScale);
          const bbox2 = new THREE.Box3().setFromObject(swordModel);
          const center = bbox2.getCenter(new THREE.Vector3());
          swordModel.userData.modelCenter = center.clone();
          if (center.length() > 1) {
            swordModel.position.set(-center.x, -center.y, -center.z);
          }
        }
        addLog(`GLB 刀模型已加载 (缩放: ${swordModelScale.toFixed(2)}x)`);
      } catch (e) {
        setModelLoadProgress(null);
        addLog(`GLB 加载失败，使用程序化模型: ${e}`, false);
      }
      // Initialize Three.js 3D scene
      {
        const canvas = threeCanvasRef.current;
        if (canvas && !threeRef.current) {
          // Check WebGL support
          const testCanvas = document.createElement("canvas");
          const hasWebGL = !!(
            testCanvas.getContext("webgl") || testCanvas.getContext("webgl2")
          );
          if (!hasWebGL) {
            addLog("浏览器不支持 WebGL，剑将以 2D 模式显示", false);
          } else try {
            const scene = new THREE.Scene();
            const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
            cam.position.set(0, 0, 10);
            const renderer = new THREE.WebGLRenderer({
              canvas, alpha: true, antialias: true,
              powerPreference: "low-power",
            });
          // Lights
          scene.add(new THREE.AmbientLight(0xffffff, 0.5));
          const dl = new THREE.DirectionalLight(0xffffff, 1.0);
          dl.position.set(2, 3, 4);
          scene.add(dl);
          const dl2 = new THREE.DirectionalLight(0x4488ff, 0.3);
          dl2.position.set(-2, -1, 3);
          scene.add(dl2);
          // Sword: use GLB model if loaded, else procedural
          let sword: THREE.Group;
          let markerMeshes: THREE.Mesh[];
          if (swordModel) {
            sword = swordModel;
            scene.add(sword);
            markerMeshes = [];
          } else {
            sword = new THREE.Group();
            const matBlade = new THREE.MeshStandardMaterial({
              color: 0x4488ff, metalness: 0.85, roughness: 0.15, side: THREE.DoubleSide,
            });
            const blade = new THREE.Mesh(new THREE.BoxGeometry(200, 6, 1.2), matBlade);
            blade.position.x = 100;
            sword.add(blade);
            const markerColors = [0xff4444, 0x44dd44, 0x4488ff, 0xff44ff];
            markerMeshes = [];
            for (let i = 0; i < 4; i++) {
              const m = new THREE.Mesh(
                new THREE.SphereGeometry(3, 8, 8),
                new THREE.MeshStandardMaterial({ color: markerColors[i], emissive: markerColors[i], emissiveIntensity: 0.2 })
              );
              m.visible = false;
              sword.add(m);
              markerMeshes.push(m);
            }
            const matGuard = new THREE.MeshStandardMaterial({
              color: 0xcc8833, metalness: 0.6, roughness: 0.3,
            });
            const guard = new THREE.Mesh(new THREE.BoxGeometry(3, 14, 2), matGuard);
            sword.add(guard);
            const matHandle = new THREE.MeshStandardMaterial({
              color: 0x5c3a1e, roughness: 0.85,
            });
            const handle = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.8, 50, 8), matHandle);
            handle.rotation.z = Math.PI / 2;
            handle.position.x = -25;
            sword.add(handle);
            const matPommel = new THREE.MeshStandardMaterial({
              color: 0xbb7733, metalness: 0.5, roughness: 0.4,
            });
            const pommel = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 8), matPommel);
            pommel.position.x = -50;
            sword.add(pommel);
            scene.add(sword);
          }
          threeRef.current = { scene, camera: cam, renderer, sword, markerMeshes, baseScale: swordModelScale };
            // Handle WebGL context loss
            renderer.domElement.addEventListener("webglcontextlost", (e) => {
              e.preventDefault();
              addLog("WebGL 上下文丢失，切换到 2D 模式", false);
              threeRef.current = null;
            });
          } catch (e) {
            addLog(`3D 引擎初始化失败: ${e}`, false);
          }
        }
      }
      setStep("device");
      addLog("检测设备能力...");
      const { detectDeviceCapability } = await import("@project1xr/engine");
      const cap = await detectDeviceCapability();
      if (!startingRef.current) return;
      addLog(`设备: ${cap.tier}`, true);
      setStep("models");
      addLog("加载AI模型...");
      const { GestureEngine } = await import("@project1xr/engine");
      const engine = new GestureEngine({
        modelBaseUrl: "/models", staticModelPath: "gesture_static.int8.onnx", dynamicModelPath: "gesture_dynamic.int8.onnx",
        backend: "wasm",
      });
      await engine.initialize();
      if (!startingRef.current) return;
      engineRef.current = engine;
      addLog("AI模型加载完成", true);
      setStep("mediapipe");
      addLog("加载MediaPipe...");
      const { MediaPipeProvider } = await import("@project1xr/engine");
      const provider = new MediaPipeProvider({ modelTier: cap.modelTier });
      await provider.initialize();
      if (!startingRef.current) return;
      providerRef.current = provider;
      addLog("MediaPipe加载完成", true);
      setStep("camera");
      addLog("请求摄像头...");
      const vid = videoRef.current;
      if (!vid) throw new Error("Video元素未找到");
      if (!window.isSecureContext) throw new Error(
        "摄像头需要安全上下文。"
        + " 桌面端请用 http://localhost:3002 访问；"
        + " 手机端请用 https://<你的局域网IP>:3001（需安装 mkcert CA）或 Chrome USB 调试端口转发"
      );
      if (!navigator.mediaDevices) throw new Error("浏览器不支持摄像头");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      streamRef.current = stream;
      vid.srcObject = stream;
      await vid.play();
      if (!startingRef.current) return;
      providerRef.current.running = true;
      addLog("摄像头已启动", true);
      setStep("running");
      runningRef.current = true;
      startingRef.current = false;
      fpsTimer.current = Date.now();
      frameCount.current = 0;
      const loop = async () => {
        if (!runningRef.current) return;
        try {
          if (!providerRef.current || !engineRef.current) { animRef.current = requestAnimationFrame(loop); return; }
          const frame = await providerRef.current.detect(videoRef.current ?? undefined);
          drawFrame(frame?.landmarks?.raw ?? null);
          if (frame?.landmarks) {
            const result = await engineRef.current.classify(frame.landmarks.landmarks63);
            const raw = constrainLandmarks(frame.landmarks.raw);
            const now = performance.now();

            setGesture(result.gesture);
            setConfidence(result.confidence);

            // Fist detection (heuristic + model)
            const px = (raw[0] + raw[15] + raw[27] + raw[39] + raw[51]) / 5;
            const py = (raw[1] + raw[16] + raw[28] + raw[40] + raw[52]) / 5;
            const fingers: [number, number][] = [[4,1],[8,5],[12,9],[16,13],[20,17]];
            let curled = 0;
            for (const [tip, mcp] of fingers) {
              const td = Math.hypot(raw[tip*3]-px, raw[tip*3+1]-py);
              const md = Math.hypot(raw[mcp*3]-px, raw[mcp*3+1]-py);
              if (td < md * 2.0) curled++;
            }
            const fistDetected = curled >= 3 || (result.gesture === 'FIST' && result.confidence > 0.65);

            // Velocity
            const hist = wristHistRef.current;
            hist.push({ x: raw[0], y: raw[1], t: now });
            if (hist.length > 5) hist.shift();
            let velocity = 0;
            if (hist.length >= 2) {
              const dt = (hist[hist.length - 1].t - hist[0].t) / 1000;
              if (dt > 0.01) velocity = Math.hypot(hist[hist.length - 1].x - hist[0].x, hist[hist.length - 1].y - hist[0].y) / dt;
            }

            // Sword update: aligned to the 4 finger centroids (colored dots)
            const sw = swordRef.current;
            // Compute the 4 finger centroids (matches the debug overlay colored dots)
            const fingerQuadJoints = [[5,6,7,8], [9,10,11,12], [13,14,15,16], [17,18,19,20]];
            const cents = fingerQuadJoints.map(js => {
              let cx = 0, cy = 0;
              for (const j of js) { cx += raw[j*3]; cy += raw[j*3+1]; }
              return { x: cx / 4, y: cy / 4 };
            });
            const centroidCx = (cents[0].x + cents[1].x + cents[2].x + cents[3].x) / 4;
            const centroidCy = (cents[0].y + cents[1].y + cents[2].y + cents[3].y) / 4;
            // Wrist→centroidCenter: 从手腕指向质心中心，比PCA质心间方向稳定~100倍
            const rawAngle = Math.atan2(centroidCy - raw[1], centroidCx - raw[0]);
            // PCA in pixel space (must match drawFrame theta for 3D sword alignment)
            let _pcaAngle = rawAngle;
            {
              const _vid = videoRef.current;
              const _cont = containerRef.current;
              const _vw = _vid?.videoWidth ?? 640, _vh = _vid?.videoHeight ?? 480;
              const _cw = _cont?.clientWidth ?? 640, _ch = _cont?.clientHeight ?? 480;
              const _scl = Math.max(_cw / _vw, _ch / _vh);
              const _dW = _vw * _scl, _dH = _vh * _scl;
              const _avgPx = centroidCx * _dW, _avgPy = centroidCy * _dH;
              let _xx = 0, _xy = 0, _yy = 0;
              for (const c of cents) {
                const dx = c.x * _dW - _avgPx, dy = c.y * _dH - _avgPy;
                _xx += dx * dx; _xy += dx * dy; _yy += dy * dy;
              }
              if (_xx + _yy > 0.0001) _pcaAngle = 0.5 * Math.atan2(2 * _xy, _xx - _yy);
              if (sw.gripX !== 0 || sw.gripY !== 0) {
                let _pd = _pcaAngle - sw.angle;
                if (_pd > Math.PI / 2) _pcaAngle -= Math.PI;
                else if (_pd < -Math.PI / 2) _pcaAngle += Math.PI;
              }
            }
            sw.pcaAngle = _pcaAngle;
            // 3D palm normal: perpendicular to palm, used for sword roll constraint (sw.up)
            const _ax = raw[15] - raw[0], _ay = raw[16] - raw[1], _az = raw[17] - raw[2];
            const _bx = raw[51] - raw[0], _by = raw[52] - raw[1], _bz = raw[53] - raw[2];
            let _nx = _ay * _bz - _az * _by;
            let _ny = _az * _bx - _ax * _bz;
            let _nz = _ax * _by - _ay * _bx;
            const _nLen = Math.sqrt(_nx*_nx + _ny*_ny + _nz*_nz);
            if (_nLen > 0.001) { _nx /= _nLen; _ny /= _nLen; _nz /= _nLen; }
            // Hand up vector: wrist→middleMCP
            const _ux = raw[27] - raw[0], _uy = raw[28] - raw[1], _uz = raw[29] - raw[2];
            const _uLen = Math.sqrt(_ux*_ux + _uy*_uy + _uz*_uz);
            // Centroid spread for freeze detection
            const _spread = Math.max(
              Math.hypot(cents[0].x - centroidCx, cents[0].y - centroidCy),
              Math.hypot(cents[1].x - centroidCx, cents[1].y - centroidCy),
              Math.hypot(cents[2].x - centroidCx, cents[2].y - centroidCy),
              Math.hypot(cents[3].x - centroidCx, cents[3].y - centroidCy)
            );
            const po = paramsRef.current.palmOffset;
            const gripCx = centroidCx;
            const gripCy = centroidCy;

            if (sw.gripX === 0 && sw.gripY === 0) {
              sw.gripX = gripCx; sw.gripY = gripCy; sw.angle = rawAngle;
              sw.upX = _nx; sw.upY = _ny; sw.upZ = _nz;
              sw.forwardX = Math.cos(sw.pcaAngle); sw.forwardY = Math.sin(sw.pcaAngle);
              sw.forwardZ = _uLen > 0.001 ? _uz/_uLen : 0;
            } else if (fistDetected) {
              sw.gripX = gripCx; sw.gripY = gripCy;
              // 自适应平滑：spread越小（拳越紧）→ 平滑越强；手掌正对镜头时额外加强
              const _spreadAlpha = Math.max(0, 0.005 - _spread) * 200;
              const _palmFactor = _nz > 0.005 ? 1.5 : 1.0;
              const _alpha = Math.min(0.5, paramsRef.current.smoothBase * (1 + _spreadAlpha) * _palmFactor);
              let _diff = rawAngle - sw.angle;
              if (_diff > Math.PI) _diff -= Math.PI * 2;
              if (_diff < -Math.PI) _diff += Math.PI * 2;
              sw.angle += _alpha * _diff;
              // 3D forward: PCA XY direction (matches red line) + Z from 3D finger direction for depth
              const _fwdAlpha = 0.25;
              const _fpcaX = Math.cos(sw.pcaAngle), _fpcaY = Math.sin(sw.pcaAngle);
              const _fwdZ = _uLen > 0.001 ? _uz/_uLen : 0;
              sw.forwardX += _fwdAlpha * (_fpcaX - sw.forwardX);
              sw.forwardY += _fwdAlpha * (_fpcaY - sw.forwardY);
              sw.forwardZ += _fwdAlpha * (_fwdZ - sw.forwardZ);
              const _fwdLen = Math.sqrt(sw.forwardX**2 + sw.forwardY**2 + sw.forwardZ**2);
              if (_fwdLen > 0.001) { sw.forwardX /= _fwdLen; sw.forwardY /= _fwdLen; sw.forwardZ /= _fwdLen; }
              // Palm normal EMA (perpendicular to palm, for roll constraint)
              const _upAlpha = 0.2;
              sw.upX += _upAlpha * (_nx - sw.upX);
              sw.upY += _upAlpha * (_ny - sw.upY);
              sw.upZ += _upAlpha * (_nz - sw.upZ);
              const _upLen = Math.sqrt(sw.upX**2 + sw.upY**2 + sw.upZ**2);
              if (_upLen > 0.001) { sw.upX /= _upLen; sw.upY /= _upLen; sw.upZ /= _upLen; }
            }
            // MCP span (diagnostic)
            const mcpSpan = Math.hypot(raw[15] - raw[51], raw[16] - raw[52]);
            const wristToPalm = Math.hypot(sw.gripX - raw[0], sw.gripY - raw[1]);

            // 4 handle nodes = centroids projected onto sword axis (always on the red line)
            const cosA = Math.cos(sw.angle);
            const sinA = Math.sin(sw.angle);
            sw.handleNodes = cents.map((c, i) => {
              const t = (c.x - sw.gripX) * cosA + (c.y - sw.gripY) * sinA;
              return {
                x: sw.gripX + t * cosA,
                y: sw.gripY + t * sinA,
                idx: i, t,
                cx: c.x, cy: c.y,
              };
            });
            // Store debug data
            debugDataRef.current = {
              landmarks: Array.from(raw),
              handleNodes: sw.handleNodes,
              gripX: sw.gripX, gripY: sw.gripY, angle: sw.angle,
            };
            if (fistDetected) {
              gripLostRef.current = 0;
              if (!sw.active) { sw.active = true; sw.trail = []; sw.swingStartTime = 0; setSwordStatus("active"); }
              if (!sw.swinging && velocity > paramsRef.current.swingVel) { sw.swinging = true; sw.swingStartTime = now; setSwordStatus("swinging"); }
              if (sw.swinging && (now - sw.swingStartTime) > 250) { sw.swinging = false; sw.trail = []; setSwordStatus("active"); }
              if (sw.swinging) {
                sw.trail.push({ x: sw.gripX + Math.cos(sw.angle)*0.15, y: sw.gripY + Math.sin(sw.angle)*0.15, t: now });
                if (sw.trail.length > 30) sw.trail.shift();
              }
            } else if (sw.active) {
              gripLostRef.current++;
              // Long timeout: once fist is detected, assume fist pose even during occlusion
              if (gripLostRef.current > 30) {
                sw.active = false; sw.swinging = false; sw.trail = []; setSwordStatus("");
              }
            }
            // Diagnotic buffer push (always records last 300 frames)
            const buf = diagBufRef.current;
            // Compute landmark-to-sword projections for all 21 landmarks
            const lp: number[] = [];
            for (let i = 0; i < 21; i++) {
              const dx = raw[i*3] - gripCx;
              const dy = raw[i*3+1] - gripCy;
              lp.push(dx * cosA + dy * sinA, Math.abs(-dx * sinA + dy * cosA));
            }
            // Display dimensions for coordinate mapping
            const _v = videoRef.current;
            const _c = containerRef.current;
            const _vw = _v?.videoWidth ?? 640;
            const _vh = _v?.videoHeight ?? 480;
            const _cw = _c?.clientWidth ?? 640;
            const _ch = _c?.clientHeight ?? 480;
            const _s = Math.max(_cw / _vw, _ch / _vh);
            buf.push({
              t: now, l: Array.from(raw),
              gx: gripCx, gy: gripCy, a: rawAngle, sa: sw.angle,
              mcpSpan, curled, fist: fistDetected ? 1 : 0,
              conf: result.confidence, v: velocity, tx: sw.tiltX, ty: sw.tiltY,
              ss: sw.smoothS, dw: _vw * _s, dh: _vh * _s,
              ad: Math.abs(rawAngle - sw.angle),
              hn: sw.handleNodes.flatMap(n => [n.t, n.x, n.y]),
              cents: cents.flatMap(c => [c.x, c.y]),
              lp,
            });
            if (buf.length > MAX_DIAG_FRAMES) buf.shift();
            if (buf.length % 30 === 0) setDiagCount(buf.length);

            // Phase 3: Calibration data collection
            if (calibStepRef.current === 'recording') {
              const cd = calibDataRef.current;
              cd.push({ mcpSpan, wristPalm: wristToPalm, curled });
              setCalibProgress(Math.min(100, cd.length / CALIB_DURATION_FRAMES * 100));
              if (cd.length >= CALIB_DURATION_FRAMES) finishCalibration();
            }
          }
        } catch (e) { console.warn("Loop error:", e); }
        // Render 3D sword
        if (threeRef.current) {
          try {
            const canvas = threeCanvasRef.current;
            const container = containerRef.current;
            if (canvas && container) {
              const { scene, camera, renderer, sword } = threeRef.current;
              const w = container.clientWidth;
              const h = container.clientHeight;
              if (w > 0 && h > 0) {
                // Match 2D canvas coordinate system (object-fit: cover)
                const vid = videoRef.current;
                const videoW = vid?.videoWidth ?? w;
                const videoH = vid?.videoHeight ?? h;
                const scale = (videoW > 0 && videoH > 0) ? Math.max(w / videoW, h / videoH) : 1;
                const dispW = videoW * scale;
                const dispH = videoH * scale;
                const aspect = w / h;
                const vs = h;
                camera.left = -vs * aspect / 2;
                camera.right = vs * aspect / 2;
                camera.top = vs / 2;
                camera.bottom = -vs / 2;
                camera.updateProjectionMatrix();
                renderer.setSize(w, h, false);
                renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

                const sw = swordRef.current;
                if (sw.active) {
                  sword.visible = true;
                  sword.position.set((sw.gripX - 0.5) * dispW, -(sw.gripY - 0.5) * dispH, 0);
                  // Apply model center offset (GLB models may have geometry offset from origin)
                  const mc = sword.userData.modelCenter;
                  if (mc) sword.position.sub(mc);
                  // 3D orientation: blade (+X) → finger direction, sword up (+Y) → palm normal
                  const forward = new THREE.Vector3(sw.forwardX, -sw.forwardY, -sw.forwardZ);
                  const up = new THREE.Vector3(sw.upX, -sw.upY, -sw.upZ);
                  if (forward.length() > 0.1 && up.length() > 0.1) {
                    forward.normalize();
                    up.normalize();
                    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
                    const realUp = new THREE.Vector3().crossVectors(right, forward).normalize();
                    const m = new THREE.Matrix4().makeBasis(forward, realUp, right);
                    sword.quaternion.setFromRotationMatrix(m);
                  }
                  const baseScale = (threeRef.current as any).baseScale || 1;
                  sword.scale.set(sw.smoothS * baseScale, sw.smoothS * baseScale, sw.smoothS * baseScale);
                  // 4 colored markers at fixed local positions along the blade (sword-relative, no 2D projection)
                  const markers = (threeRef.current as any).markerMeshes;
                  if (markers) {
                    const markerOffsets = [20, 65, 110, 155]; // along +X in sword-local space
                    for (let i = 0; i < 4; i++) {
                      markers[i].visible = sw.active;
                      markers[i].position.x = markerOffsets[i];
                    }
                  }
                } else {
                  sword.visible = false;
                }
                renderer.render(scene, camera);
              }
            }
          } catch (e3d) { /* three render error */ }
        }
        frameCount.current++;
        const elapsed = (Date.now() - fpsTimer.current) / 1000;
        if (elapsed >= 1) { setFps(Math.round(frameCount.current / elapsed)); frameCount.current = 0; fpsTimer.current = Date.now(); }
        if (runningRef.current) animRef.current = requestAnimationFrame(loop);
      };
      animRef.current = requestAnimationFrame(loop);
    } catch (err: any) {
      startingRef.current = false;
      setStep("error");
      const msg = err?.message || String(err);
      setErrorMsg(msg);
      addLog(`错误: ${msg}`);
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    cleanup();
    setStep("idle"); setGesture(""); setConfidence(0); setFps(0);
    setSwordStatus("");
    swordRef.current.active = false; swordRef.current.swinging = false; swordRef.current.trail = []; swordRef.current.handleNodes = []; swordRef.current.smoothS = 1; swordRef.current.tiltX = 0; swordRef.current.tiltY = 0;
    wristHistRef.current = [];
    gripLostRef.current = 0;
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  const isRunning = step === "running";
  const borderColor = step === "error" ? "#ef4444" : isRunning ? "#22c55e33" : "#222";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0a0a0f", color: "#ccc",
      display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ padding: "10px 16px", background: "#111", borderBottom: "1px solid #222", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 11, color: "#555", background: "#1a1a2a", padding: "2px 8px", borderRadius: 4 }}>1XR</span>
        <span style={{ fontSize: 14, color: "#eee" }}>手势识别测试</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#555" }}>{fps > 0 ? `${fps} FPS` : ""}</span>
      </div>

      {/* Camera view */}
      <div ref={containerRef} style={{
        flex: 1, margin: 10, borderRadius: 12, overflow: "hidden",
        position: "relative", background: "#111", border: `1px solid ${borderColor}`,
      }}>
        <video ref={videoRef} playsInline muted
          style={{
            width: "100%", height: "100%", objectFit: "cover",
            transform: "scaleX(-1)", display: isRunning ? "block" : "none",
          }}
        />
        <canvas ref={threeCanvasRef}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            transform: "scaleX(-1)", pointerEvents: "none",
            display: isRunning ? "block" : "none",
          }}
        />
        {modelLoadProgress !== null && (
          <div style={{
            position: "absolute", top: 12, left: 12, zIndex: 20,
            background: "rgba(20,30,50,0.92)", borderRadius: 8, padding: "8px 12px",
            display: "flex", alignItems: "center", gap: 10, pointerEvents: "none",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <span style={{ fontSize: 11, color: "#8ab4ff", fontFamily: "monospace", whiteSpace: "nowrap" }}>
              加载模型
            </span>
            <div style={{
              width: 80, height: 6, background: "#222", borderRadius: 3, overflow: "hidden",
            }}>
              <div style={{
                width: `${modelLoadProgress}%`, height: "100%",
                background: "linear-gradient(90deg, #4488ff, #44ddff)", borderRadius: 3,
                transition: "width 0.2s",
              }} />
            </div>
            <span style={{ fontSize: 11, color: "#ccc", fontFamily: "monospace", minWidth: 32, textAlign: "right" }}>
              {modelLoadProgress}%
            </span>
          </div>
        )}
        <canvas ref={canvasRef}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            transform: "scaleX(-1)", pointerEvents: "none",
            display: isRunning ? "block" : "none",
          }}
        />

        {/* Guidance text overlay */}
        {isRunning && !gesture && (
          <div style={{
            position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)",
            pointerEvents: "none", textAlign: "center",
          }}>
            <div style={{
              display: "inline-block", background: "rgba(0,0,0,0.5)", borderRadius: 8,
              padding: "12px 24px", color: "rgba(255,255,255,0.7)", fontSize: 18,
            }}>
              将手对准摄像头
            </div>
          </div>
        )}

        {/* Gesture HUD overlay */}
        {isRunning && gesture && (
          <div style={{
            position: "absolute", bottom: 10, left: 10, right: 10,
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
            borderRadius: 10, padding: "8px 12px",
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", minWidth: 80 }}>
              {gesture}
            </span>
            <div style={{ flex: 1, height: 4, background: "#333", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(confidence*100).toFixed(0)}%`, background: confidence > 0.8 ? "#22c55e" : confidence > 0.5 ? "#eab308" : "#ef4444", borderRadius: 2, transition: "width 0.1s" }} />
            </div>
            <span style={{ fontSize: 10, color: "#888", minWidth: 30, textAlign: "right" }}>
              {(confidence*100).toFixed(0)}%
            </span>
            {swordStatus && (
              <span style={{ fontSize: 11, color: swordStatus === "swinging" ? "#ffdd44" : "#8affb0", marginLeft: 4 }}>
                {swordStatus === "swinging" ? "挥动" : "出鞘"}
              </span>
            )}
          </div>
        )}

        {/* Data panel overlay */}
        {isRunning && showData && (
          <div style={{
            position: "absolute", right: 0, top: 0, bottom: 0, width: "40%",
            background: "rgba(6,6,15,0.88)", backdropFilter: "blur(8px)",
            borderLeft: "1px solid rgba(255,255,255,0.06)",
            overflowY: "auto", fontSize: 9, fontFamily: "monospace",
            pointerEvents: "auto", padding: "8px 10px", zIndex: 10,
          }}>
            <div style={{ color: "#aaa", fontSize: 10, fontWeight: 600, marginBottom: 6 }}>
              指关节四边形 / 剑轴投影
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "#666", borderBottom: "1px solid #222" }}>
                  <th style={{ textAlign: "left", padding: "1px 4px" }}>点</th>
                  <th style={{ textAlign: "right", padding: "1px 4px" }}>MCP x</th>
                  <th style={{ textAlign: "right", padding: "1px 4px" }}>MCP y</th>
                  <th style={{ textAlign: "right", padding: "1px 4px" }}>节点 x</th>
                  <th style={{ textAlign: "right", padding: "1px 4px" }}>节点 y</th>
                  <th style={{ textAlign: "right", padding: "1px 4px" }}>t</th>
                </tr>
              </thead>
              <tbody>
                {debugDataRef.current.handleNodes.map((node) => {
                  const lm = debugDataRef.current.landmarks;
                  const mcpX = lm[node.idx * 3]?.toFixed(3) ?? "-";
                  const mcpY = lm[node.idx * 3 + 1]?.toFixed(3) ?? "-";
                  return (
                    <tr key={node.idx} style={{ borderBottom: "1px solid #181820" }}>
                      <td style={{ padding: "1px 4px", color: node.idx === 5 ? "#ff4444" : node.idx === 9 ? "#44ff44" : node.idx === 13 ? "#4488ff" : "#ff44ff" }}>
                        MCP{node.idx}
                      </td>
                      <td style={{ textAlign: "right", padding: "1px 4px", color: "#888" }}>{mcpX}</td>
                      <td style={{ textAlign: "right", padding: "1px 4px", color: "#888" }}>{mcpY}</td>
                      <td style={{ textAlign: "right", padding: "1px 4px", color: "#ccc" }}>{node.x.toFixed(3)}</td>
                      <td style={{ textAlign: "right", padding: "1px 4px", color: "#ccc" }}>{node.y.toFixed(3)}</td>
                      <td style={{ textAlign: "right", padding: "1px 4px", color: "#888" }}>{node.t.toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ color: "#555", marginTop: 4, fontSize: 8 }}>
              剑角度: {debugDataRef.current.angle.toFixed(3)} rad
              {" | "}
              中心: ({debugDataRef.current.gripX.toFixed(3)}, {debugDataRef.current.gripY.toFixed(3)})
            </div>
            <div style={{ color: "#aaa", fontSize: 10, fontWeight: 600, margin: "8px 0 4px" }}>
              21 个关节点坐标
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", columnCount: 2, columnGap: 8 }}>
              {(() => {
                const lm = debugDataRef.current.landmarks;
                const rows = [];
                for (let i = 0; i < 21 && i * 3 + 2 < lm.length; i++) {
                  rows.push(
                    <div key={i} style={{ breakInside: "avoid", padding: "1px 0", color: i >= 5 && i <= 20 && (i-5)%4 === 0 ? "#ffaa00" : "#666" }}>
                      <span style={{ color: "#444" }}>{i.toString().padStart(2, "0")}</span>{" "}
                      {lm[i * 3]?.toFixed(3) ?? "-"} {lm[i * 3 + 1]?.toFixed(3) ?? "-"}
                    </div>
                  );
                }
                return rows;
              })()}
            </div>
          </div>
        )}

        {/* Tune panel */}
        {isRunning && showTune && (
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 200,
            background: "rgba(6,6,15,0.88)", backdropFilter: "blur(8px)",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            overflowY: "auto", fontSize: 10, fontFamily: "monospace",
            pointerEvents: "auto", padding: "8px 10px", zIndex: 10,
          }}>
            <div style={{ color: "#aaa", fontSize: 10, fontWeight: 600, marginBottom: 8 }}>
              实时调试
            </div>
            {[
              { key:"smoothBase", label:"平滑系数", min:0.01, max:0.5, step:0.01 },
              { key:"tiltScale",  label:"3D倾斜",   min:0, max:5, step:0.1 },
              { key:"palmOffset", label:"握柄偏移", min:-0.3, max:0.8, step:0.01 },
              { key:"swingVel",   label:"挥动阈值", min:0.05, max:1.0, step:0.05 },
              { key:"scaleMul",   label:"剑大小",   min:0.1, max:3.0, step:0.1 },
            ].map(s => (
              <div key={s.key} style={{ marginBottom: 10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", color:"#888", marginBottom:2 }}>
                  <span>{s.label}</span>
                  <span style={{ color:"#fff" }}>{tuneVals[s.key as keyof typeof tuneVals].toFixed(s.step < 0.1 ? 2 : 1)}</span>
                </div>
                <input type="range" min={s.min} max={s.max} step={s.step} value={tuneVals[s.key as keyof typeof tuneVals]}
                  style={{ width:"100%", accentColor:"#4488ff" }}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    (paramsRef.current as any)[s.key] = v;
                    setTuneVals(prev => ({ ...prev, [s.key]: v }));
                  }}
                />
              </div>
            ))}
            <button onClick={() => {
              const def = { smoothBase:0.12, tiltScale:2.0, palmOffset:0.35, swingVel:0.25, scaleMul:1.0 };
              paramsRef.current = { ...def };
              setTuneVals(def);
            }} style={{
              width:"100%", padding:"6px 0", border:"1px solid #333", borderRadius:6,
              fontSize:11, color:"#888", cursor:"pointer", background:"#111",
            }}>重置</button>
            {/* Auto-tune toggle */}
            <label style={{ display:"flex", alignItems:"center", gap:6, marginTop:10, cursor:"pointer", color:"#888", fontSize:10 }}>
              <input type="checkbox" checked={autoTune} onChange={e => setAutoTune(e.target.checked)}
                style={{ accentColor:"#4488ff" }} />
              自动优化（标记后调参）
            </label>
          </div>
        )}

        {/* Phase 3: Calibration overlay */}
        {calibStep !== 'none' && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
          }}>
            <div style={{
              background: "#111", border: "1px solid #333", borderRadius: 16,
              padding: 30, maxWidth: 320, textAlign: "center",
            }}>
              {calibStep === 'intro' && (
                <>
                  <div style={{ color: "#4488ff", fontSize: 28, marginBottom: 12 }}>⚔</div>
                  <div style={{ color: "#fff", fontSize: 15, fontWeight: 600, marginBottom: 8 }}>握拳旋转校准</div>
                  <div style={{ color: "#888", fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>
                    握紧拳头，缓慢旋转手掌面对镜头。<br />
                    系统将记录您的手部运动范围，<br />
                    自动优化最佳参数。
                  </div>
                  <button onClick={doCalibration} style={{
                    width: "100%", padding: "10px 0", border: "none", borderRadius: 8,
                    fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer",
                    background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  }}>开始校准（3秒）</button>
                  <button onClick={() => setCalibStep('none')} style={{
                    width: "100%", padding: "8px 0", marginTop: 8,
                    border: "1px solid #333", borderRadius: 8, fontSize: 12, color: "#888",
                    cursor: "pointer", background: "transparent",
                  }}>取消</button>
                </>
              )}
              {calibStep === 'recording' && (
                <>
                  <div style={{ color: "#4488ff", fontSize: 28, marginBottom: 12 }}>⟳</div>
                  <div style={{ color: "#fff", fontSize: 14, marginBottom: 8 }}>记录中...</div>
                  <div style={{
                    width: "100%", height: 6, background: "#222", borderRadius: 3, overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${calibProgress}%`, height: "100%",
                      background: "linear-gradient(90deg, #3b82f6, #4488ff)", borderRadius: 3,
                      transition: "width 0.1s",
                    }} />
                  </div>
                  <div style={{ color: "#666", fontSize: 11, marginTop: 6 }}>
                    请慢慢旋转拳头
                  </div>
                </>
              )}
              {calibStep === 'done' && (
                <>
                  <div style={{ color: "#4ade80", fontSize: 28, marginBottom: 12 }}>✓</div>
                  <div style={{ color: "#fff", fontSize: 15, fontWeight: 600, marginBottom: 4 }}>校准完成</div>
                  <div style={{ color: "#888", fontSize: 11, marginBottom: 16 }}>
                    参数已保存，下次自动加载
                  </div>
                  <button onClick={() => setCalibStep('none')} style={{
                    width: "100%", padding: "10px 0", border: "none", borderRadius: 8,
                    fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer",
                    background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  }}>开始测试</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ padding: "0 10px 6px", display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <button onClick={isRunning ? stop : start}
          style={{
            flex: 1, padding: "12px 0", border: "none", borderRadius: 10,
            fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer",
            background: isRunning
              ? "linear-gradient(135deg, #dc2626, #b91c1c)"
              : "linear-gradient(135deg, #3b82f6, #2563eb)",
          }}>
          {isRunning ? "停止" : "开始测试"}
        </button>
        <button onClick={() => setShowLog(v => !v)}
          style={{
            padding: "12px 14px", border: "1px solid #333", borderRadius: 10,
            fontSize: 13, color: "#888", cursor: "pointer", background: "#111",
          }}>
          ʷ
        </button>
        <button onClick={() => setShowData(v => !v)}
          style={{
            padding: "12px 14px", border: "1px solid #333", borderRadius: 10,
            fontSize: 13, color: showData ? "#ffdd44" : "#888", cursor: "pointer", background: "#111",
          }}>
          Xr
        </button>
        <button onClick={() => setShowTune(v => !v)}
          style={{
            padding: "12px 14px", border: "1px solid #333", borderRadius: 10,
            fontSize: 13, color: showTune ? "#4488ff" : "#888", cursor: "pointer", background: "#111",
          }}>
          调
        </button>
        <button onClick={downloadDiag} title="导出诊断数据（最近 300 帧）"
          style={{
            padding: "12px 14px", border: "1px solid #333", borderRadius: 10,
            fontSize: 13, color: "#888", cursor: "pointer", background: "#111",
          }}>
          诊{diagCount > 0 ? ` ${(diagCount / 30).toFixed(0)}s` : ""}
        </button>
        {/* Export labeled dataset */}
        {ratingCount.good + ratingCount.bad > 0 && (
          <button onClick={exportLabeledData} title="导出所有标记数据"
            style={{
              padding: "12px 10px", border: "1px solid #333", borderRadius: 10,
              fontSize: 11, color: "#ffdd44", cursor: "pointer", background: "#111",
            }}>
            📊{ratingCount.good + ratingCount.bad}
          </button>
        )}
        {/* Rating buttons */}
        <button onClick={() => rateCurrent('good')} title="标记好数据"
          style={{
            padding: "12px 10px", border: "1px solid #333", borderRadius: 10,
            fontSize: 14, color: ratingCount.good > 0 ? "#4ade80" : "#555",
            cursor: "pointer", background: "#111",
          }}>
          👍{ratingCount.good > 0 ? ` ${ratingCount.good}` : ''}
        </button>
        <button onClick={() => rateCurrent('bad')} title="标记坏数据"
          style={{
            padding: "12px 10px", border: "1px solid #333", borderRadius: 10,
            fontSize: 14, color: ratingCount.bad > 0 ? "#f87171" : "#555",
            cursor: "pointer", background: "#111",
          }}>
          👎{ratingCount.bad > 0 ? ` ${ratingCount.bad}` : ''}
        </button>
        {/* Calibration button */}
        <button onClick={startCalibration} title="握拳旋转自动校准"
          style={{
            padding: "12px 10px", border: `1px solid ${calibStep !== 'none' ? '#4488ff' : '#333'}`, borderRadius: 10,
            fontSize: 13, color: calibStep !== 'none' ? "#4488ff" : "#888",
            cursor: "pointer", background: "#111",
          }}>
          校{calibStep === 'done' ? '✓' : ''}
        </button>
      </div>

      {/* Status bar */}
      <div style={{
        display: "flex", gap: 16, padding: "2px 16px 6px", fontSize: 11, color: "#555",
      }}>
        <span>FPS {fps}</span>
        <span>手势 {gesture || "-"}</span>
        <span>剑 {swordStatus === "swinging" ? "挥动" : swordStatus === "active" ? "出鞘" : "-"}</span>
      </div>

      {/* Error */}
      {errorMsg && (
        <div style={{ margin: "0 10px 6px", padding: "8px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 8, fontSize: 12, color: "#fca5a5" }}>
          {errorMsg}
        </div>
      )}

      {/* Log (collapsible) */}
      {showLog && (
        <div style={{ margin: "0 10px 10px", padding: 6, background: "#0d0d14", borderRadius: 8, maxHeight: 100, overflowY: "auto", border: "1px solid #1a1a2a", fontSize: 10 }}>
          {logs.map((l, i) => (
            <div key={i} style={{ padding: "1px 4px", color: l.ok ? "#4ade80" : "#666" }}>
              <span style={{ color: "#333" }}>[{l.time}]</span> {l.msg}
            </div>
          ))}
          {logs.length === 0 && <div style={{ padding: 6, textAlign: "center", color: "#333" }}>日志</div>}
        </div>
      )}
    </div>
  );
}
