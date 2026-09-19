// src/components/star/BackgroundLayer.jsx
import { useEffect, useRef } from 'react';

const DUST_POSITIONS = Array.from({ length: 60 }, (_, i) => ({
  left: `${(i * 17.3 + 5) % 100}%`,
  top: `${(i * 13.7 + 3) % 100}%`,
  size: 0.5 + (i % 4) * 0.4,
  opacity: 0.08 + (i % 8) * 0.04,
}));

function useNebula(canvasRef, enabled) {
  useEffect(() => {
    if (!enabled) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let animId;
    let w, h;

    function resize() {
      const rect = c.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      w = rect.width * dpr;
      h = rect.height * dpr;
      c.width = w;
      c.height = h;
      c.style.width = rect.width + 'px';
      c.style.height = rect.height + 'px';
    }
    resize();

    const blobs = [];
    const palettes = [
      ['rgba(99,102,241,', 'rgba(67,56,202,'],
      ['rgba(236,72,153,', 'rgba(219,39,119,'],
      ['rgba(6,182,212,', 'rgba(8,145,178,'],
      ['rgba(168,85,247,', 'rgba(126,34,206,'],
    ];
    for (let i = 0; i < 8; i++) {
      const p = palettes[i % 4];
      blobs.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 60 + Math.random() * 160,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        c: p[0], op: 0.02 + Math.random() * 0.04,
      });
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      blobs.forEach(b => {
        b.x += b.vx; b.y += b.vy;
        if (b.x < -b.r) b.x = w + b.r;
        if (b.x > w + b.r) b.x = -b.r;
        if (b.y < -b.r) b.y = h + b.r;
        if (b.y > h + b.r) b.y = -b.r;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, b.c + b.op + ')');
        g.addColorStop(0.5, b.c + (b.op * 0.5) + ')');
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    }
    draw();

    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
    };
  }, [canvasRef, enabled]);
}

export default function BackgroundLayer({ nebula = true, dust = true, meteors = false /* reserved */ }) {
  const nebulaRef = useRef(null);
  useNebula(nebulaRef, nebula);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* Nebula canvas */}
      <canvas ref={nebulaRef} className="absolute inset-0 w-full h-full" />
      {/* Micro dust */}
      {dust && DUST_POSITIONS.map((d, i) => (
        <div key={i}
          className="absolute rounded-full bg-white"
          style={{
            width: d.size + 'px', height: d.size + 'px',
            left: d.left, top: d.top, opacity: d.opacity,
          }}
        />
      ))}
    </div>
  );
}
