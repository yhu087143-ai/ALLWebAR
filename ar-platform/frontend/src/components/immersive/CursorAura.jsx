import React, { useEffect, useRef } from 'react';

/**
 * CursorAura —— 指针光晕与星尘拖尾
 *
 * 设计意图：把"鼠标"变成画面里的一束光，而不是系统箭头。
 * 三层结构，全部 pointer-events: none，不遮挡任何交互：
 *   1. 大光晕（520px 径向渐变）—— 慢速阻尼跟随，负责氛围
 *   2. 细光环（90px）—— 快速跟随，按下时收缩，负责"手感"
 *   3. 星尘拖尾 —— 移动时抛出的微小光点，CSS 动画淡出后自动回收
 *
 * 只在「精确指针 + 允许动效」的环境启用：
 *   - 触摸设备（pointer: coarse）不渲染，省电
 *   - prefers-reduced-motion 不渲染
 */
export default function CursorAura() {
  const auraRef = useRef(null);
  const ringRef = useRef(null);

  useEffect(() => {
    const enabled =
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!enabled) return undefined;

    const aura = auraRef.current;
    const ring = ringRef.current;
    if (!aura || !ring) return undefined;

    // 目标位置（指针）与两组缓动后的实际位置
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const slow = { ...target };
    const fast = { ...target };
    let raf = 0;
    let visible = false;

    const sparks = [];
    let lastSpark = 0;

    const spawnSpark = (x, y) => {
      const now = performance.now();
      // 限流 + 并发上限，避免快速划动时 DOM 爆炸
      if (now - lastSpark < 70 || sparks.length >= 22) return;
      lastSpark = now;

      const el = document.createElement('span');
      el.className = 'cursor-spark';
      const angle = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 46;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      el.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      el.style.setProperty('--size', `${1.5 + Math.random() * 2.6}px`);
      el.style.setProperty('--hue', Math.random() < 0.55 ? '167,139,250' : Math.random() < 0.5 ? '94,234,212' : '251,113,133');
      document.body.appendChild(el);

      const entry = { el, timer: window.setTimeout(() => {
        el.remove();
        const i = sparks.indexOf(entry);
        if (i >= 0) sparks.splice(i, 1);
      }, 900) };
      sparks.push(entry);
    };

    const onMove = (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
      if (!visible) {
        visible = true;
        aura.style.opacity = '1';
        ring.style.opacity = '1';
      }
      spawnSpark(e.clientX, e.clientY);
    };

    const onLeave = () => {
      visible = false;
      aura.style.opacity = '0';
      ring.style.opacity = '0';
    };

    const onDown = () => ring.classList.add('is-down');
    const onUp = () => ring.classList.remove('is-down');

    const tick = () => {
      slow.x += (target.x - slow.x) * 0.075;
      slow.y += (target.y - slow.y) * 0.075;
      fast.x += (target.x - fast.x) * 0.24;
      fast.y += (target.y - fast.y) * 0.24;

      aura.style.transform = `translate3d(${slow.x}px, ${slow.y}px, 0) translate(-50%, -50%)`;
      ring.style.transform = `translate3d(${fast.x}px, ${fast.y}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerleave', onLeave);
      sparks.forEach((s) => {
        clearTimeout(s.timer);
        s.el.remove();
      });
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 hidden overflow-hidden md:block">
      <div ref={auraRef} className="cursor-aura" style={{ opacity: 0 }} />
      <div ref={ringRef} className="cursor-ring" style={{ opacity: 0 }} />
    </div>
  );
}
