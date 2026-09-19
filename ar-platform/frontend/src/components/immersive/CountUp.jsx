import React, { useEffect, useRef, useState } from 'react';

/**
 * CountUp —— 进入视口后数字滚动到目标值
 *
 * 用 easeOutExpo 让"最后一位慢慢落定"，比线性更有分量；
 * tabular-nums 保证滚动过程中宽度不抖动。
 */
function easeOutExpo(x) {
  /*
   * 必须同时钳两端。
   *
   * `1 - 2^(-10x)` 在 x 取负值时是小于 0 的（x=-0.001 → -0.007）。
   * 首帧的 rAF 时间戳偶尔会早于 performance.now() 记下的 t0，
   * 于是 p 变负 → display 变负 → toFixed(0) 把 -0.27 渲染成 "-0"、
   * 把 -1.4 渲染成 "-1"。首页数据条因此会闪出「-1项」。
   * 只钳上限是本来的写法，漏掉了下限。
   */
  if (x <= 0) return 0;
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

export default function CountUp({
  value = 0,
  duration = 1500,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
}) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let started = false;

    const run = () => {
      if (started) return;
      started = true;
      if (reduced) {
        setDisplay(value);
        return;
      }
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.max(0, Math.min(1, (now - t0) / duration));
        setDisplay(value * easeOutExpo(p));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    if (typeof IntersectionObserver === 'undefined') {
      run();
      return () => cancelAnimationFrame(raf);
    }

    let gotCallback = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        gotCallback = true;
        if (entry.isIntersecting) {
          run();
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);

    /*
     * 看门狗：IntersectionObserver 存在但一次回调都不来的环境（无头渲染 / 被策略降级）下，
     * 数字会永远停在初始值 0 —— 账目区显示"做通 0 项"比不动画严重得多。
     * 1.5s 内没收到任何回调就直接计数；正常环境下 IO 会立刻给出首次回调，此分支不会触发。
     */
    const watchdog = window.setTimeout(() => {
      if (!gotCallback) run();
    }, 1500);

    return () => {
      clearTimeout(watchdog);
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={`tabular ${className}`}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
