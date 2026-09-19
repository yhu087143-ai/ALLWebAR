import { useEffect, useRef } from 'react';

/**
 * useReveal —— 元素进入视口时加上 .is-in，触发 CSS 入场过渡。
 *
 * 为什么不用动画库：现有项目只装了 three + lucide，
 * 用 IntersectionObserver + CSS 过渡即可达到同样的观感，且零新增依赖。
 *
 * 用法：
 *   const ref = useReveal();
 *   <div ref={ref} className="reveal">...</div>
 *
 * 注意：元素必须带 `reveal` 类（初始 opacity 0 / 下移），
 * 否则过渡无从发生。`prefers-reduced-motion` 时 CSS 会直接显示，不依赖 JS。
 */

/**
 * 判断这一条 entry 是否应该直接显形。
 *
 * 关键在第二个条件：`entry.isIntersecting === false` 有两种可能 ——
 * 元素还没进视口，或者**已经越过视口跑到上方去了**。
 * 后者发生在锚点跳转、拖动滚动条、或一屏以上的快速滚动时：
 * 元素在两次渲染之间直接跳过可视区，之后再也不会 intersecting，
 * 于是永久停在 opacity:0（内容"消失"，但 DOM 与文案都在）。
 * 这里用 bottom 是否已高于视口顶部把它救回来。
 */
function shouldReveal(entry) {
  if (entry.isIntersecting) return true;
  const rootTop = entry.rootBounds ? entry.rootBounds.top : 0;
  return entry.boundingClientRect.bottom < rootTop;
}

export default function useReveal({ threshold = 0.16, rootMargin = '0px 0px -8% 0px' } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 不支持时直接显形，别把内容藏死
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in');
      return;
    }

    let shown = false;
    const show = () => {
      if (shown) return;
      shown = true;
      el.classList.add('is-in');
    };

    let gotCallback = false;
    const io = new IntersectionObserver(
      (entries) => {
        gotCallback = true;
        for (const entry of entries) {
          if (shouldReveal(entry)) {
            show();
            io.unobserve(entry.target); // 只入场一次，滚回去不重播
          }
        }
      },
      { threshold, rootMargin }
    );

    io.observe(el);

    /*
     * 看门狗：IntersectionObserver 存在、但一次回调都不来的环境确实存在
     * （无头渲染 / iframe 首帧不产帧 / 被隐私策略降级），
     * 这时整块内容会永久停在 opacity:0 —— 页面"白给"，且控制台一声不响。
     * 1.2s 内没收到任何回调就直接显形：宁可少一次入场动效，也不能丢内容。
     */
    const watchdog = window.setTimeout(() => {
      if (!gotCallback) show();
    }, 1200);

    return () => {
      clearTimeout(watchdog);
      io.disconnect();
    };
  }, [threshold, rootMargin]);

  return ref;
}

/**
 * useRevealAll —— 容器内所有 `.reveal` 子元素统一观察。
 * 适合卡片网格这类批量入场。
 */
export function useRevealAll({ threshold = 0.12 } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll('.reveal'));
    if (targets.length === 0) return;

    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }

    let gotCallback = false;
    const io = new IntersectionObserver(
      (entries) => {
        gotCallback = true;
        for (const entry of entries) {
          if (shouldReveal(entry)) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold }
    );

    targets.forEach((el) => io.observe(el));

    // 同 useReveal：回调静默时整体显形，避免整块内容永久不可见
    const watchdog = window.setTimeout(() => {
      if (gotCallback) return;
      targets.forEach((el) => el.classList.add('is-in'));
      io.disconnect();
    }, 1200);

    return () => {
      clearTimeout(watchdog);
      io.disconnect();
    };
  }, [threshold]);

  return ref;
}
