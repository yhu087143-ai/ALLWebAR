// src/components/star/ConstellationLayer.jsx
import Star from './Star';
import { STAR_CONFIG, STAR_POSITIONS } from './starData';

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 0],
  [0, 3], [1, 4], // diagonals (dashed)
];

const FLOW_PATHS = [
  'M150,120 L350,70', 'M350,70 L620,150',
  'M620,150 L550,360', 'M550,360 L250,390',
  'M250,390 L150,120',
];

export default function ConstellationLayer({
  activePage = '',
  hoverGlow = false,
  showFlow = true,
  onNavigate,
}) {
  const activeIndex = STAR_CONFIG.findIndex(s => {
    if (activePage === '/') return s.path === '/';
    return activePage.startsWith(s.path) && s.path !== '/';
  });

  function getGradientDefs() {
    return STAR_CONFIG.map((s, i) => ({
      id: `star-grad-${i}`,
      colors: [
        { offset: '0%', color: '#ffffff' },
        { offset: '30%', color: s.glow },
        { offset: '100%', color: s.dark },
      ],
    }));
  }

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 650"
      style={{ zIndex: 1 }}
    >
      <defs>
        {/* Gradient definitions for each star */}
        {getGradientDefs().map(g => (
          <radialGradient key={g.id} id={g.id} cx="30%" cy="30%" r="60%">
            {g.colors.map((c, i) => (
              <stop key={i} offset={c.offset} stopColor={c.color} />
            ))}
          </radialGradient>
        ))}
        {/* Glow filter */}
        <filter id="glow-deep">
          <feGaussianBlur stdDeviation="6" result="b1"/>
          <feGaussianBlur stdDeviation="3" result="b2"/>
          <feGaussianBlur stdDeviation="1.5" result="b3"/>
          <feMerge>
            <feMergeNode in="b1"/><feMergeNode in="b2"/>
            <feMergeNode in="b3"/><feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        {/* Hover glow (stronger) */}
        <filter id="glow-hover">
          <feGaussianBlur stdDeviation="8" result="b1"/>
          <feGaussianBlur stdDeviation="4" result="b2"/>
          <feGaussianBlur stdDeviation="2" result="b3"/>
          <feMerge>
            <feMergeNode in="b1"/><feMergeNode in="b2"/>
            <feMergeNode in="b3"/><feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Constellation lines */}
      <g pointerEvents="none">
        {CONNECTIONS.slice(0, 5).map(([i, j], k) => (
          <line key={k}
            x1={STAR_POSITIONS[i].x} y1={STAR_POSITIONS[i].y}
            x2={STAR_POSITIONS[j].x} y2={STAR_POSITIONS[j].y}
            stroke="rgba(255,255,255,0.08)" strokeWidth="0.8"
          />
        ))}
        {CONNECTIONS.slice(5).map(([i, j], k) => (
          <line key={`d${k}`}
            x1={STAR_POSITIONS[i].x} y1={STAR_POSITIONS[i].y}
            x2={STAR_POSITIONS[j].x} y2={STAR_POSITIONS[j].y}
            stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"
            strokeDasharray="4,4"
          />
        ))}
      </g>

      {/* Flow dots */}
      {showFlow && FLOW_PATHS.map((path, i) => (
        <circle key={i} r="2.5" fill={STAR_CONFIG[i].glow} opacity="0.8"
          className="animate-flow-pulse"
          style={{ animationDelay: `${i * 0.6}s` }}
        >
          <animateMotion dur="5s" repeatCount="indefinite"
            rotate="auto" begin={`${i * 0.6}s`}>
            <mpath href={`#flowPath${i}`} />
          </animateMotion>
        </circle>
      ))}
      {FLOW_PATHS.map((d, i) => (
        <path key={`fp${i}`} id={`flowPath${i}`} d={d} fill="none" stroke="none" />
      ))}

      {/* Stars (pointer-events re-enabled on the group) */}
      <g pointerEvents="auto">
        {STAR_CONFIG.map((star, i) => (
          <Star key={star.id}
            cx={STAR_POSITIONS[i].x} cy={STAR_POSITIONS[i].y}
            color={star.color} glow={star.glow} dark={star.dark}
            label={star.label} index={i}
            active={activeIndex === i}
            onClick={() => onNavigate?.(star.path)}
          />
        ))}
      </g>
    </svg>
  );
}
