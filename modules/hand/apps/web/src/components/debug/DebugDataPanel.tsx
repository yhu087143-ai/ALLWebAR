// @ts-nocheck
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useDebugStore, type DebugSnapshot, type LandmarkPoint } from '../../stores/debug-store';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const PANEL_WIDTH = 340;
const TAB_WIDTH = 28;

const FINGER_LABELS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const;
const FINGER_JOINT_NAMES: Record<string, string[]> = {
  thumb: ['CMC', 'MCP', 'IP', 'TIP'],
  index: ['MCP', 'PIP', 'DIP', 'TIP'],
  middle: ['MCP', 'PIP', 'DIP', 'TIP'],
  ring: ['MCP', 'PIP', 'DIP', 'TIP'],
  pinky: ['MCP', 'PIP', 'DIP', 'TIP'],
};
const LANDMARK_INDICES: [string, number][] = [
  ['thumb', 1], ['index', 5], ['middle', 9], ['ring', 13], ['pinky', 17],
];

/** Format a 0-1 coordinate to 2 decimal places */
const fmt = (v: number) => v.toFixed(2);

/** Format a coordinate pair */
const fmtPt = (p: LandmarkPoint) => `(${fmt(p.x)}, ${fmt(p.y)})`;

/* ------------------------------------------------------------------ */
/*  Shared section toggle state (within the panel)                     */
/* ------------------------------------------------------------------ */

type SectionId = 'landmarks' | 'mcp-quad' | 'handle-nodes' | 'sword' | 'fist';

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function SectionHeader({
  id,
  label,
  collapsed,
  onToggle,
}: {
  id: SectionId;
  label: string;
  collapsed: boolean;
  onToggle: (id: SectionId) => void;
}) {
  return (
    <button
      onClick={() => onToggle(id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        padding: '6px 10px',
        border: 'none',
        borderBottom: '1px solid #1a1a2a',
        background: '#0d0d18',
        color: '#8af',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'monospace',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 9, color: '#555', width: 14, display: 'inline-block', transition: 'transform 0.15s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
        &#9660;
      </span>
      {label}
    </button>
  );
}

/* ---- Landmark table (all 21, by finger) ---- */

function LandmarkTable({ snapshot }: { snapshot: DebugSnapshot }) {
  return (
    <div style={{ padding: '4px 8px', fontSize: 10, fontFamily: 'monospace', lineHeight: 1.6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 50px 50px', gap: '2px 6px', color: '#555', borderBottom: '1px solid #1a1a2a', paddingBottom: 2, marginBottom: 2 }}>
        <span>Joint</span>
        <span style={{ textAlign: 'right' }}>x</span>
        <span style={{ textAlign: 'right' }}>y</span>
      </div>
      {FINGER_LABELS.map((finger, fi) => {
        const [key, startIdx] = LANDMARK_INDICES[fi];
        const joints = FINGER_JOINT_NAMES[key] ?? [];
        return (
          <React.Fragment key={finger}>
            <div style={{ color: '#667', fontSize: 9, marginTop: 3, borderBottom: '1px solid #111' }}>
              {finger} (Ldmk {startIdx}–{startIdx + 3})
            </div>
            {joints.map((jname, ji) => {
              const pt = snapshot.landmarks[startIdx + ji];
              if (!pt) return null;
              return (
                <div key={jname} style={{ display: 'grid', gridTemplateColumns: '70px 50px 50px', gap: '2px 6px' }}>
                  <span style={{ color: '#999' }}>&nbsp;&nbsp;{jname}</span>
                  <span style={{ textAlign: 'right', color: '#bbb' }}>{fmt(pt.x)}</span>
                  <span style={{ textAlign: 'right', color: '#bbb' }}>{fmt(pt.y)}</span>
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
      {/* Wrist (index 0) */}
      <div style={{ color: '#667', fontSize: 9, marginTop: 3, borderBottom: '1px solid #111' }}>
        Wrist (Ldmk 0)
      </div>
      {snapshot.landmarks[0] && (
        <div style={{ display: 'grid', gridTemplateColumns: '70px 50px 50px', gap: '2px 6px' }}>
          <span style={{ color: '#999' }}>&nbsp;&nbsp;WRIST</span>
          <span style={{ textAlign: 'right', color: '#bbb' }}>{fmt(snapshot.landmarks[0].x)}</span>
          <span style={{ textAlign: 'right', color: '#bbb' }}>{fmt(snapshot.landmarks[0].y)}</span>
        </div>
      )}
    </div>
  );
}

/* ---- MCP Quadrilateral ---- */

function MCPQuadSection({ snapshot }: { snapshot: DebugSnapshot }) {
  const labels = ['Idx MCP (5)', 'Mid MCP (9)', 'Rng MCP (13)', 'Pnk MCP (17)'];
  const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff'];
  return (
    <div style={{ padding: '4px 8px', fontSize: 10, fontFamily: 'monospace', lineHeight: 1.7 }}>
      {snapshot.mcpQuad.knuckles.map((pt, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '85px 50px 50px', gap: '2px 6px' }}>
          <span style={{ color: colors[i] }}>{labels[i]}</span>
          <span style={{ textAlign: 'right', color: '#bbb' }}>{fmt(pt.x)}</span>
          <span style={{ textAlign: 'right', color: '#bbb' }}>{fmt(pt.y)}</span>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '85px 50px 50px', gap: '2px 6px', borderTop: '1px solid #1a1a2a', marginTop: 2, paddingTop: 2 }}>
        <span style={{ color: '#fff' }}>Center</span>
        <span style={{ textAlign: 'right', color: '#fff' }}>{fmt(snapshot.mcpQuad.center.x)}</span>
        <span style={{ textAlign: 'right', color: '#fff' }}>{fmt(snapshot.mcpQuad.center.y)}</span>
      </div>
    </div>
  );
}

/* ---- Handle Nodes ---- */

function HandleNodeSection({ snapshot }: { snapshot: DebugSnapshot }) {
  const colors = ['#ff9f43', '#f368e0', '#ee5a24', '#0abde3'];
  return (
    <div style={{ padding: '4px 8px', fontSize: 10, fontFamily: 'monospace', lineHeight: 1.7 }}>
      {snapshot.handleNodes.nodes.map((pt, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 50px 50px 40px', gap: '2px 6px' }}>
          <span style={{ color: colors[i] }}>HNode {i}</span>
          <span style={{ textAlign: 'right', color: '#bbb' }}>{fmt(pt.x)}</span>
          <span style={{ textAlign: 'right', color: '#bbb' }}>{fmt(pt.y)}</span>
          <span style={{ textAlign: 'right', color: '#777' }}>o{fmt(snapshot.handleNodes.offsets[i])}</span>
        </div>
      ))}
      <div style={{ marginTop: 4, fontSize: 9, color: '#555' }}>
        <div>Map: H{i => i} &larr; MCP [{['Idx','Mid','Rng','Pnk'][i]}]</div>
      </div>
    </div>
  );
}

/* ---- Sword Position ---- */

function SwordPositionSection({ snapshot }: { snapshot: DebugSnapshot }) {
  return (
    <div style={{ padding: '4px 8px', fontSize: 10, fontFamily: 'monospace', lineHeight: 1.7 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 70px', gap: '2px 8px' }}>
        <span style={{ color: '#888' }}>Grip</span>
        <span style={{ color: '#bbb' }}>{fmtPt(snapshot.sword.grip)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 70px', gap: '2px 8px' }}>
        <span style={{ color: '#888' }}>Angle</span>
        <span style={{ color: '#bbb' }}>{snapshot.sword.angleDeg.toFixed(1)}&deg; ({snapshot.sword.angleRad.toFixed(2)} rad)</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 70px', gap: '2px 8px' }}>
        <span style={{ color: '#888' }}>Blade tip</span>
        <span style={{ color: '#bbb' }}>{fmtPt(snapshot.sword.bladeTip)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 70px', gap: '2px 8px' }}>
        <span style={{ color: '#888' }}>Blade len</span>
        <span style={{ color: '#bbb' }}>{fmt(snapshot.sword.bladeLength)}</span>
      </div>
    </div>
  );
}

/* ---- Fist Detection ---- */

function FistDetectionSection({ snapshot }: { snapshot: DebugSnapshot }) {
  const f = snapshot.fist;
  return (
    <div style={{ padding: '4px 8px', fontSize: 10, fontFamily: 'monospace', lineHeight: 1.7 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '80px 60px', gap: '2px 8px' }}>
        <span style={{ color: '#888' }}>Curled</span>
        <span style={{ color: f.curledCount >= 3 ? '#fbb' : '#bbb' }}>{f.curledCount}/5 {f.curledFingers.length > 0 ? `(${f.curledFingers.join(', ')})` : ''}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '80px 60px', gap: '2px 8px' }}>
        <span style={{ color: '#888' }}>Velocity</span>
        <span style={{ color: f.velocity > 0.25 ? '#ffd93d' : '#bbb' }}>{fmt(f.velocity)} u/s</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '80px 60px', gap: '2px 8px' }}>
        <span style={{ color: '#888' }}>Swiping</span>
        <span style={{ color: f.isSwiping ? '#6bcb77' : '#555' }}>{f.isSwiping ? 'YES' : 'no'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '80px 60px', gap: '2px 8px' }}>
        <span style={{ color: '#888' }}>Fist/grip</span>
        <span style={{ color: f.isFistDetected ? '#6bcb77' : '#555' }}>{f.isFistDetected ? 'YES' : 'no'}</span>
      </div>
    </div>
  );
}

/* ---- FPS / timestamp header ---- */

function PanelStatusBar({ snapshot }: { snapshot: DebugSnapshot }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '3px 10px', fontSize: 9, fontFamily: 'monospace',
      color: '#555', background: '#08080f',
      borderBottom: '1px solid #1a1a2a',
    }}>
      <span>FPS {snapshot.fps}</span>
      <span>t+{(performance.now() - snapshot.timestamp).toFixed(0)}ms</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Panel                                                        */
/* ------------------------------------------------------------------ */

export default function DebugDataPanel() {
  const visible = useDebugStore((s) => s.visible);
  const toggle = useDebugStore((s) => s.toggle);

  // Local snapshot state, updated at ~10fps via a separate rAF
  const [snapshot, setSnapshot] = useState<DebugSnapshot | null>(null);
  const rafRef = useRef(0);
  const lastUpdateRef = useRef(0);

  // Section collapse state (local, not persisted)
  const [collapsed, setCollapsed] = useState<Record<SectionId, boolean>>({
    landmarks: false,
    'mcp-quad': false,
    'handle-nodes': false,
    sword: false,
    fist: false,
  });

  const toggleSection = (id: SectionId) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Separate rAF loop for the panel — throttled to ~10fps
  useEffect(() => {
    if (!visible) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const pollData = (now: number) => {
      if (now - lastUpdateRef.current >= 100) {
        // 100ms ≈ 10fps — read the latest snapshot from the store
        const s = useDebugStore.getState().snapshot;
        if (s) {
          setSnapshot(s);
        }
        lastUpdateRef.current = now;
      }
      rafRef.current = requestAnimationFrame(pollData);
    };

    rafRef.current = requestAnimationFrame(pollData);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible]);

  if (!visible) {
    // Collapsed tab
    return (
      <button
        onClick={toggle}
        title="Show debug data"
        style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: TAB_WIDTH,
          height: 80,
          border: 'none',
          borderRadius: '6px 0 0 6px',
          background: 'rgba(13,13,24,0.85)',
          color: '#8af',
          fontSize: 18,
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}
      >
        &#9776;
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: PANEL_WIDTH,
        background: 'rgba(10,10,20,0.92)',
        backdropFilter: 'blur(12px)',
        borderLeft: '1px solid #1a1a2a',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: '#0d0d18',
          borderBottom: '1px solid #1a1a2a',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: '#8af', fontFamily: 'monospace' }}>
          DEBUG DATA
        </span>
        <button
          onClick={toggle}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#555',
            cursor: 'pointer',
            fontSize: 14,
            padding: '2px 6px',
          }}
        >
          &#x2715;
        </button>
      </div>

      {/* Status bar */}
      {snapshot && <PanelStatusBar snapshot={snapshot} />}

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {/* 1. Finger landmarks */}
        <SectionHeader id="landmarks" label="Finger Joints (21 landmarks)" collapsed={collapsed.landmarks} onToggle={toggleSection} />
        {!collapsed.landmarks && snapshot && <LandmarkTable snapshot={snapshot} />}
        {!collapsed.landmarks && !snapshot && <NoData />}

        {/* 2. MCP Quadrilateral */}
        <SectionHeader id="mcp-quad" label="MCP Quad (knuckles 5,9,13,17)" collapsed={collapsed['mcp-quad']} onToggle={toggleSection} />
        {!collapsed['mcp-quad'] && snapshot && <MCPQuadSection snapshot={snapshot} />}
        {!collapsed['mcp-quad'] && !snapshot && <NoData />}

        {/* 3. Handle Nodes */}
        <SectionHeader id="handle-nodes" label="Sword Handle Nodes (4)" collapsed={collapsed['handle-nodes']} onToggle={toggleSection} />
        {!collapsed['handle-nodes'] && snapshot && <HandleNodeSection snapshot={snapshot} />}
        {!collapsed['handle-nodes'] && !snapshot && <NoData />}

        {/* 4. Sword Position */}
        <SectionHeader id="sword" label="Sword Position" collapsed={collapsed.sword} onToggle={toggleSection} />
        {!collapsed.sword && snapshot && <SwordPositionSection snapshot={snapshot} />}
        {!collapsed.sword && !snapshot && <NoData />}

        {/* 5. Fist Detection */}
        <SectionHeader id="fist" label="Fist Detection" collapsed={collapsed.fist} onToggle={toggleSection} />
        {!collapsed.fist && snapshot && <FistDetectionSection snapshot={snapshot} />}
        {!collapsed.fist && !snapshot && <NoData />}
      </div>

      {/* Footer hint */}
      <div style={{ padding: '4px 10px', fontSize: 8, color: '#333', borderTop: '1px solid #1a1a2a', textAlign: 'center' }}>
        ~10fps update &middot; coords normalized 0–1
      </div>
    </div>
  );
}

function NoData() {
  return <div style={{ padding: '8px', fontSize: 10, color: '#444', textAlign: 'center' }}>Waiting for data...</div>;
}
