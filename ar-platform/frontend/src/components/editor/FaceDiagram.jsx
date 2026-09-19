import React, { useState } from 'react';
import { FACE_ZONES } from '../../constants/faceZones.js';

/**
 * 每个区域在 SVG (200×260) 上的形状描述
 */
const ZONE_SHAPES = {
  glasses: {
    type: 'path',
    // 蝴蝶形：左右眼镜框 + 鼻梁桥接
    d: 'M38,72 Q55,60,74,72 L74,114 Q55,124,38,114Z M126,72 Q145,60,162,72 L162,114 Q145,124,126,114Z M74,88 Q100,80,126,88',
  },
  fullface: {
    type: 'path',
    d: 'M100,18 C160,18 185,80 185,150 C185,215 150,245 100,245 C50,245 15,215 15,150 C15,80 40,18 100,18Z',
  },
  mouth: {
    type: 'ellipse',
    cx: 100, cy: 175, rx: 34, ry: 20,
  },
  nose: {
    type: 'polygon',
    points: '74,108 126,108 106,145 94,145',
  },
  'left-eye': {
    type: 'ellipse',
    cx: 56, cy: 90, rx: 18, ry: 13,
  },
  'right-eye': {
    type: 'ellipse',
    cx: 144, cy: 90, rx: 18, ry: 13,
  },
};

const ZONE_LABELS = {
  glasses:    { x: 100, y: 132 },
  fullface:   { x: 100, y: 248 },
  mouth:      { x: 100, y: 198 },
  nose:       { x: 100, y: 122 },
  'left-eye': { x: 42, y: 93 },
  'right-eye':{ x: 158, y: 93 },
};

export default function FaceDiagram({ zones = [], selectedId, onSelectZone }) {
  const [hoveredId, setHoveredId] = useState(null);
  const zoneMap = React.useMemo(() => {
    const m = new Map();
    for (const z of zones) m.set(z.zoneId, z);
    return m;
  }, [zones]);

  const zoneDefs = FACE_ZONES;

  return (
    <div className="w-full max-w-[220px] mx-auto select-none">
      <svg viewBox="0 0 200 260" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {zoneDefs.map((zd) => (
            <filter key={zd.id} id={`glow-${zd.id}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={zd.color} floodOpacity="0.6" />
            </filter>
          ))}
        </defs>

        {/* 面部轮廓 */}
        <ellipse cx="100" cy="135" rx="76" ry="100" fill="#1e293b" stroke="#334155" strokeWidth="1" />

        {/* 面部特征 */}
        <g fill="none" stroke="#475569" strokeWidth="1.2" strokeLinecap="round">
          {/* 左眼 */}
          <ellipse cx="56" cy="88" rx="7" ry="4.5" />
          {/* 右眼 */}
          <ellipse cx="144" cy="88" rx="7" ry="4.5" />
          {/* 眉毛 */}
          <path d="M44,72 Q56,68 68,72" strokeWidth="1.5" />
          <path d="M132,72 Q144,68 156,72" strokeWidth="1.5" />
          {/* 鼻子 */}
          <path d="M100,104 L92,126 Q100,134 108,126Z" strokeWidth="1" strokeLinejoin="round" />
          {/* 嘴巴 */}
          <path d="M72,165 Q100,178 128,165" strokeWidth="1.5" />
        </g>

        {/* 区域覆盖层 */}
        <g>
          {zoneDefs.map((zd) => {
            const zc = zoneMap.get(zd.id);
            const isSelected = selectedId === zd.id;
            const isHovered = hoveredId === zd.id;
            const isEnabled = zc?.enabled ?? false;
            const shape = ZONE_SHAPES[zd.id];
            if (!shape) return null;

            let fillOpacity, strokeOpacity, strokeWidth, strokeDash;
            if (isSelected) {
              fillOpacity = 0.4;
              strokeOpacity = 1;
              strokeWidth = 2;
              strokeDash = 'none';
            } else if (isHovered) {
              fillOpacity = 0.35;
              strokeOpacity = 0.85;
              strokeWidth = 1.5;
              strokeDash = 'none';
            } else if (isEnabled) {
              fillOpacity = 0.18;
              strokeOpacity = 0.55;
              strokeWidth = 1;
              strokeDash = 'none';
            } else {
              fillOpacity = 0.05;
              strokeOpacity = 0.2;
              strokeWidth = 0.8;
              strokeDash = '3,3';
            }

            const commonProps = {
              fill: zd.color,
              fillOpacity,
              stroke: zd.color,
              strokeOpacity,
              strokeWidth,
              strokeDasharray: strokeDash,
              style: { transition: 'fill-opacity 0.15s, stroke-opacity 0.15s, stroke-width 0.15s' },
              className: 'cursor-pointer',
              onClick: () => onSelectZone(zd.id),
              onMouseEnter: () => setHoveredId(zd.id),
              onMouseLeave: () => setHoveredId(null),
              filter: isSelected ? `url(#glow-${zd.id})` : undefined,
            };

            return (
              <g key={zd.id}>
                <title>{zd.name}</title>
                {shape.type === 'ellipse' && (
                  <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...commonProps} />
                )}
                {shape.type === 'polygon' && (
                  <polygon points={shape.points} {...commonProps} />
                )}
                {shape.type === 'path' && (
                  <path d={shape.d} {...commonProps} />
                )}
              </g>
            );
          })}
        </g>

        {/* 区域名称标签 */}
        <g fill="#64748b" fontSize="6.5" fontFamily="system-ui, sans-serif" textAnchor="middle">
          {zoneDefs.map((zd) => {
            const lbl = ZONE_LABELS[zd.id];
            if (!lbl) return null;
            return (
              <text key={zd.id} x={lbl.x} y={lbl.y}>
                {zd.name}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
