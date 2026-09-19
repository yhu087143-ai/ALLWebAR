import React, { useEffect, useRef } from 'react';

/**
 * StarfieldCanvas —— 星空浪漫的核心视觉
 *
 * 设计要点：
 * - 三层不同尺寸/亮度的星，各自以不同速度漂移 → 真实视差深度
 * - 每颗星有独立相位，用正弦做"呼吸式"闪烁，不是统一频闪
 * - 指针移动产生轻微视差偏移（缓动跟随，带阻尼）
 * - 近处的亮星之间按距离自动连线 → 星座感
 * - 偶发流星，沿斜向掠过
 * - 性能：DPR 封顶 2；页面隐藏 / 离开视口时自动停帧
 * - 无障碍：prefers-reduced-motion 时只画一帧静态星空
 */
export default function StarfieldCanvas({
  className = '',
  density = 1,
  constellation = true,
  shootingStars = true,
  interactive = true,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let raf = 0;
    /*
     * 必须是 false。
     * 这里曾经写成 true，于是 start() 一进门就 `if (running) return` 直接返回，
     * requestAnimationFrame 从未被调度过 —— 只有 prefers-reduced-motion 时
     * 走 draw(0) 的那一行才会画出内容。表现为「画布尺寸正常、控制台无报错、
     * 但整块星场空白」，非常难查。
     */
    let running = false;
    let stars = [];
    let meteors = [];
    let lastMeteor = 0;

    // 指针视差：target 是目标偏移，view 是缓动后的实际偏移
    const pointer = { tx: 0, ty: 0, x: 0, y: 0 };
    try {
      const saved = sessionStorage.getItem('starfield-pointer');
      if (saved) Object.assign(pointer, JSON.parse(saved));
    } catch {
      /* sessionStorage 不可用时忽略 */
    }

    const rand = (a, b) => a + Math.random() * (b - a);

    function buildStars() {
      const area = width * height;
      // 基准密度：约每 5200 平方像素一颗星
      const count = Math.min(520, Math.max(90, Math.round((area / 5200) * density)));
      stars = Array.from({ length: count }, () => {
        const depth = Math.random(); // 0 远 → 1 近
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: 0.35 + depth * 1.5,
          depth,
          baseAlpha: 0.22 + depth * 0.6,
          phase: Math.random() * Math.PI * 2,
          speed: 0.0006 + depth * 0.0022, // 越近闪得越快
          driftX: (0.006 + depth * 0.03) * (Math.random() < 0.5 ? -1 : 1),
          driftY: (0.004 + depth * 0.02) * (Math.random() < 0.5 ? -1 : 1),
          hue: pickHue(depth),
        };
      });
    }

    function pickHue(depth) {
      // 远景偏冷白，近景给一点点极光色，形成色彩纵深
      const roll = Math.random();
      if (depth < 0.45) return { c: '255,255,255', s: 0.75 };
      if (roll < 0.42) return { c: '167,139,250', s: 0.9 }; // 紫
      if (roll < 0.74) return { c: '94,234,212', s: 0.9 };  // 青
      if (roll < 0.9) return { c: '240,171,252', s: 0.9 };  // 品红
      return { c: '252,211,77', s: 0.95 };                   // 金
    }

    function resize() {
      const parent = canvas.parentElement;
      width = parent ? parent.clientWidth : window.innerWidth;
      height = parent ? parent.clientHeight : window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
    }

    function spawnMeteor() {
      const fromLeft = Math.random() < 0.5;
      const speed = rand(5.5, 9.5);
      meteors.push({
        x: fromLeft ? rand(-0.1 * width, 0.55 * width) : rand(0.45 * width, 1.1 * width),
        y: rand(-0.15 * height, 0.42 * height),
        vx: (fromLeft ? 1 : -1) * speed,
        vy: speed * rand(0.35, 0.62),
        len: rand(90, 230),
        life: 0,
        ttl: rand(52, 88),
      });
    }

    function draw(t) {
      ctx.clearRect(0, 0, width, height);

      // 指针缓动（阻尼 0.045，观感是"被轻轻牵引"而不是硬跟随）
      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;

      const px = pointer.x * 26;
      const py = pointer.y * 26;

      // ---- 星 ----
      const bright = [];
      for (const s of stars) {
        if (!reduced) {
          s.x += s.driftX;
          s.y += s.driftY;
          if (s.x < -4) s.x = width + 4;
          else if (s.x > width + 4) s.x = -4;
          if (s.y < -4) s.y = height + 4;
          else if (s.y > height + 4) s.y = -4;
        }

        const twinkle = reduced ? 1 : 0.62 + 0.38 * Math.sin(t * s.speed + s.phase);
        const alpha = s.baseAlpha * twinkle;
        const cx = s.x + px * s.depth;
        const cy = s.y + py * s.depth;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${s.hue.c},${(alpha * s.hue.s).toFixed(3)})`;
        ctx.arc(cx, cy, s.r, 0, Math.PI * 2);
        ctx.fill();

        // 近处亮星加一层柔光，避免"像素点"感
        if (s.depth > 0.72 && s.r > 1.15) {
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s.r * 7);
          g.addColorStop(0, `rgba(${s.hue.c},${(alpha * 0.3).toFixed(3)})`);
          g.addColorStop(1, `rgba(${s.hue.c},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, s.r * 7, 0, Math.PI * 2);
          ctx.fill();
        }

        if (s.depth > 0.66) bright.push({ x: cx, y: cy, a: alpha });
      }

      // ---- 星座连线：只在近处亮星之间，且限制连线数量 ----
      if (constellation && bright.length > 1) {
        const maxDist = Math.min(width, height) * 0.19;
        let drawn = 0;
        for (let i = 0; i < bright.length && drawn < 42; i++) {
          for (let j = i + 1; j < bright.length && drawn < 42; j++) {
            const a = bright[i];
            const b = bright[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d = Math.hypot(dx, dy);
            if (d < maxDist) {
              const fade = (1 - d / maxDist) * Math.min(a.a, b.a) * 0.42;
              ctx.strokeStyle = `rgba(167,139,250,${fade.toFixed(3)})`;
              ctx.lineWidth = 0.6;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
              drawn++;
            }
          }
        }
      }

      // ---- 流星 ----
      if (!reduced && shootingStars) {
        if (t - lastMeteor > 2600 + Math.random() * 4200) {
          lastMeteor = t;
          spawnMeteor();
        }
        meteors = meteors.filter((m) => m.life < m.ttl);
        for (const m of meteors) {
          m.life++;
          m.x += m.vx;
          m.y += m.vy;
          const fade = Math.sin((m.life / m.ttl) * Math.PI);
          const nx = m.vx / Math.hypot(m.vx, m.vy);
          const ny = m.vy / Math.hypot(m.vx, m.vy);
          const tailX = m.x - nx * m.len;
          const tailY = m.y - ny * m.len;
          const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
          grad.addColorStop(0, `rgba(255,255,255,${(0.9 * fade).toFixed(3)})`);
          grad.addColorStop(0.35, `rgba(167,139,250,${(0.4 * fade).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(94,234,212,0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();
        }
      }
    }

    function loop(t) {
      if (!running) return;
      draw(t);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    const onPointer = (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      pointer.tx = nx;
      pointer.ty = ny;
      try {
        sessionStorage.setItem('starfield-pointer', JSON.stringify({ tx: nx, ty: ny }));
      } catch {
        /* 忽略 */
      }
    };

    const onVisibility = () => (document.hidden ? stop() : start());

    // 用 IntersectionObserver 在离开视口时停帧，避免无谓耗电
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0 }
    );

    resize();
    io.observe(canvas);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    if (interactive && !reduced) window.addEventListener('pointermove', onPointer, { passive: true });

    /*
     * 先同步画一帧，再交给 rAF 接手。
     *
     * 为什么必须同步补这一帧：requestAnimationFrame 在页面被判定为隐藏
     * （后台标签页、无头浏览器、部分省电模式）时根本不会触发，
     * 只依赖 rAF 的结果是整块星场空白 —— 而且是"画布尺寸正常、控制台无报错"的静默失败。
     */
    draw(reduced ? 0 : 1);

    if (!reduced) start();

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [density, constellation, shootingStars, interactive]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
