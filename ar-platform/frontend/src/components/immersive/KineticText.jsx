import React, { useEffect, useMemo, useRef } from 'react';

/**
 * KineticText —— 运动排版（逐字入场 + 指针磁场）
 *
 * 两层结构：
 *   外层 kinetic-char-wrap  → 由指针驱动的"磁场"位移（px，缓动跟随）
 *   内层 kinetic-char       → 入场位移（%，错峰弹簧）与旋转
 *
 * 拆成两层是为了避免在同一个 transform 里混用 % 与 px（会触发额外计算），
 * 同时也让两套动画互不干扰。
 *
 * 性能约定：
 *   - 只读一次容器 rect，逐字偏移在挂载/尺寸变化时缓存
 *   - 指针静止 120ms 后目标位移自动归零，不再做无谓计算
 *   - prefers-reduced-motion 时直接静态呈现（不进入 rAF 循环）
 */
function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

export default function KineticText({
  text,
  className = '',
  charClassName = '',
  delay = 0,
  stagger = 0.032,
  radius = 190,
  strength = 9,
  duration = 0.95,
  as: Tag = 'span',
  ...rest
}) {
  const wrapRef = useRef(null);
  const chars = useMemo(() => Array.from(text), [text]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;

    const inner = Array.from(wrap.querySelectorAll('[data-char]'));
    if (inner.length === 0) return undefined;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 逐字相对容器的偏移（挂载与尺寸变化时重算，避免每帧读布局）
    const offsets = inner.map(() => ({ x: 0, y: 0 }));
    const measure = () => {
      for (let i = 0; i < inner.length; i++) {
        const el = inner[i];
        offsets[i] = { x: el.offsetLeft, y: el.offsetTop };
      }
    };

    if (reduced) {
      inner.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      return undefined;
    }

    measure();

    const state = inner.map(() => ({ dx: 0, dy: 0 }));
    const pointer = { x: 0, y: 0, active: false, last: 0 };
    const start = performance.now();
    let raf = 0;

    const onMove = (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
      pointer.last = performance.now();
    };
    const onLeave = () => {
      pointer.active = false;
    };

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(wrap);

    const frame = (now) => {
      const elapsed = (now - start) / 1000;
      const wrapRect = wrap.getBoundingClientRect();
      const stillFresh = pointer.active && now - pointer.last < 120;

      for (let i = 0; i < inner.length; i++) {
        const el = inner[i];
        const off = offsets[i];

        // ---- 入场：错峰缓出 ----
        const local = (elapsed - (delay + i * stagger)) / duration;
        const p = local <= 0 ? 0 : local >= 1 ? 1 : easeOutCubic(local);

        // ---- 磁场：指针附近的字被轻微推开 ----
        let tx = 0;
        let ty = 0;
        if (stillFresh) {
          const cx = wrapRect.left + off.x + el.offsetWidth / 2;
          const cy = wrapRect.top + off.y + el.offsetHeight / 2;
          const dx = cx - pointer.x;
          const dy = cy - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < radius && dist > 0.001) {
            const falloff = 1 - dist / radius;
            const force = falloff * falloff * strength;
            tx = (dx / dist) * force;
            ty = (dy / dist) * force;
          }
        }

        const s = state[i];
        s.dx += (tx - s.dx) * 0.14;
        s.dy += (ty - s.dy) * 0.14;

        el.parentElement.style.transform = `translate3d(${s.dx.toFixed(2)}px, ${s.dy.toFixed(2)}px, 0)`;
        el.style.opacity = p.toFixed(3);
        el.style.transform = `translateY(${((1 - p) * 112).toFixed(2)}%) rotate(${((1 - p) * 9).toFixed(2)}deg)`;
      }

      raf = requestAnimationFrame(frame);
    };

    // 入场必须立即开始，即使页面不可见（后台标签页 rAF 不触发）
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    /*
     * 兜底：rAF 在极端环境（无头浏览器、省电模式、被策略拦截）可能一帧都不触发，
     * 那样文字会永久停在 opacity:0 —— 静默"文字消失"是最难查的故障。
     * 这里用 setTimeout 在动画应结束时无条件把字显形，幂等且不影响正常路径。
     */
    const settle = window.setTimeout(() => {
      for (let i = 0; i < inner.length; i++) {
        const el = inner[i];
        if (Number(el.style.opacity) < 1) {
          el.style.opacity = '1';
          el.style.transform = 'none';
        }
      }
    }, (delay + inner.length * stagger + duration + 0.4) * 1000);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      if (ro) ro.disconnect();
    };
  }, [text, delay, stagger, radius, strength, duration]);

  return (
    <Tag ref={wrapRef} className={className} aria-label={text} {...rest}>
      {chars.map((ch, i) => (
        <span key={`${ch}-${i}`} className="kinetic-char-wrap" aria-hidden="true">
          <span data-char className={`kinetic-char ${charClassName}`}>
            {ch === ' ' ? '\u00A0' : ch}
          </span>
        </span>
      ))}
    </Tag>
  );
}
