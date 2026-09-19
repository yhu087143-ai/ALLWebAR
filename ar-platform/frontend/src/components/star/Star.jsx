// src/components/star/Star.jsx
const STAGGER = [0, 0.6, 1.2, 1.8, 2.4];

function starburstPath(cx, cy, size) {
  const s = size;
  const points = [
    [0, -s], [s*0.12, -s*0.25], [s, 0],
    [s*0.12, s*0.25], [0, s],
    [-s*0.12, s*0.25], [-s, 0],
    [-s*0.12, -s*0.25],
  ];
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${cx + p[0]},${cy + p[1]}`).join(' ') + 'Z';
}

export default function Star({
  cx, cy, size = 1,
  color, glow, dark,
  label, index = 0,
  active = false,
  hoverGlow = false,
  onClick,
}) {
  const baseSize = 28 * size;
  const s = baseSize;
  const delay = STAGGER[index % 5];

  return (
    <g
      className="cursor-pointer"
      style={{ transformOrigin: `${cx}px ${cy}px` }}
      onClick={onClick}
    >
      {/* Glow rings with blur */}
      <defs>
        <filter id={`ring-blur-${index}`}>
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <filter id={`ring-blur2-${index}`}>
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <circle cx={cx} cy={cy} r={s * 1.1}
        fill={color} opacity={active ? 0.15 : 0.06}
        filter={`url(#ring-blur-${index})`}
        className={active ? 'animate-breathe-glow' : ''}
        style={{ animationDelay: `${delay}s` }}
      />
      <circle cx={cx} cy={cy} r={s * 0.7}
        fill={color} opacity={active ? 0.25 : 0.1}
        filter={`url(#ring-blur2-${index})`}
        className={active ? 'animate-breathe-glow' : ''}
        style={{ animationDelay: `${delay}s` }}
      />
      {/* Starburst shape */}
      <path
        d={starburstPath(cx, cy, s * (active ? 1.1 : 1))}
        fill={`url(#star-grad-${index})`}
        filter={`url(#glow-deep)`}
        className={active ? 'animate-breathe-star' : ''}
        style={{ animationDelay: `${delay}s`, transformOrigin: `${cx}px ${cy}px` }}
      />
      {/* Label */}
      <text x={cx} y={cy + s + 18}
        textAnchor="middle" fill="white"
        fontSize="13" fontWeight="500"
        opacity={0.6}
        className="pointer-events-none"
        style={{ textShadow: '0 0 20px rgba(0,0,0,0.8)' }}
      >
        {label}
      </text>
    </g>
  );
}
