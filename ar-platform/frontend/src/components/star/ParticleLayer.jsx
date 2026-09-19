// src/components/star/ParticleLayer.jsx
import { useEffect, useRef } from 'react';

export default function ParticleLayer({ count = 100, enabled = true, parallax = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let animId;
    let w, h;
    const colors = ['#818cf8','#c084fc','#22d3ee','#f59e0b','#ec4899'];

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

    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: 1 + Math.random() * 2.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      op: 0.15 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    }));

    let mx = w / 2, my = h / 2;
    const parent = c.parentElement;
    const onMouse = (e) => {
      const r = parent.getBoundingClientRect();
      mx = (e.clientX - r.left) * (window.devicePixelRatio || 1);
      my = (e.clientY - r.top) * (window.devicePixelRatio || 1);
    };
    if (parallax) {
      parent.addEventListener('mousemove', onMouse);
      parent.addEventListener('touchmove', onMouse, { passive: true });
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.5, cy = h * 0.4;

      particles.forEach(p => {
        if (parallax) {
          p.x += (mx - cx) * 0.003;
          p.y += (my - cy) * 0.003;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vx += (Math.random() - 0.5) * 0.015;
        p.vy += (Math.random() - 0.5) * 0.015;
        p.vx *= 0.99;
        p.vy *= 0.99;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        const tw = 0.4 + Math.sin(t * 0.003 + p.phase) * 0.6;
        const alpha = p.op * tw;

        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10 * tw;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = alpha * 0.25;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
      animId = requestAnimationFrame(draw);
    }
    draw(0);

    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      if (parallax) {
        parent.removeEventListener('mousemove', onMouse);
        parent.removeEventListener('touchmove', onMouse);
      }
    };
  }, [enabled, count, parallax]);

  if (!enabled) return null;
  return (
    <canvas ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 30 }}
    />
  );
}
