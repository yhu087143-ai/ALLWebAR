// @ts-nocheck
'use client';

import { useRef, useEffect } from 'react';
import type { LandmarkPoint } from '../../stores/debug-store';

/* ------------------------------------------------------------------ */
/*  Draws MCP / handle-node overlays directly on the canvas            */
/*  This runs inside the existing rAF loop, not as a separate layer.   */
/*  Import and call from drawFrame() after the hand skeleton.          */
/* ------------------------------------------------------------------ */

const MCP_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff'];
const HANDLE_COLORS = ['#ff9f43', '#f368e0', '#ee5a24', '#0abde3'];
const CENTER_COLOR = '#ffffff';

export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  mcpKnuckles: LandmarkPoint[],
  center: LandmarkPoint,
  handleNodes: LandmarkPoint[],
  dispW: number,
  dispH: number,
  offsetX: number,
  offsetY: number,
) {
  if (!mcpKnuckles.length || !handleNodes.length) return;

  ctx.save();
  ctx.globalAlpha = 0.85;

  // Layer 1: Connecting lines between each MCP and its corresponding handle node
  for (let i = 0; i < Math.min(mcpKnuckles.length, handleNodes.length); i++) {
    const mcp = mcpKnuckles[i];
    const node = handleNodes[i];
    const mx = mcp.x * dispW + offsetX;
    const my = mcp.y * dispH + offsetY;
    const nx = node.x * dispW + offsetX;
    const ny = node.y * dispH + offsetY;

    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = MCP_COLORS[i % MCP_COLORS.length];
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Layer 2: Center dot
  const cx = center.x * dispW + offsetX;
  const cy = center.y * dispH + offsetY;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = CENTER_COLOR;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Layer 3: MCP knuckle dots (larger, filled with color)
  for (let i = 0; i < mcpKnuckles.length; i++) {
    const mx = mcpKnuckles[i].x * dispW + offsetX;
    const my = mcpKnuckles[i].y * dispH + offsetY;
    ctx.beginPath();
    ctx.arc(mx, my, 6, 0, Math.PI * 2);
    ctx.fillStyle = MCP_COLORS[i % MCP_COLORS.length];
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Small label
    const labels = ['IdxMCP', 'MidMCP', 'RngMCP', 'PnkMCP'];
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.fillText(labels[i], mx + 8, my + 3);
  }

  // Layer 4: Handle node dots (smaller, different shape — diamond via rotation)
  for (let i = 0; i < handleNodes.length; i++) {
    const nx = handleNodes[i].x * dispW + offsetX;
    const ny = handleNodes[i].y * dispH + offsetY;
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = HANDLE_COLORS[i % HANDLE_COLORS.length];
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();

    ctx.fillStyle = HANDLE_COLORS[i % HANDLE_COLORS.length];
    ctx.font = '8px monospace';
    ctx.fillText(`H${i}`, nx + 8, ny + 3);
  }

  ctx.restore();
}
