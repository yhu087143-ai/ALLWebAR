import React from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Marquee —— 无限滚动字带
 *
 * 内容渲染两份，靠 CSS 位移 -50% 实现无缝循环；
 * 悬停暂停（用 CSS animation-play-state，不需要 JS）。
 * 分隔符统一用 Lucide 图标，不使用任何表情符号。
 */
export default function Marquee({ items = [], speed = 42, className = '' }) {
  if (items.length === 0) return null;
  const row = [...items, ...items];

  return (
    <div className={`marquee relative overflow-hidden border-y border-white/[0.06] py-4 ${className}`}>
      <div
        className="marquee-track flex w-max items-center gap-8 whitespace-nowrap"
        style={{ animationDuration: `${speed}s` }}
      >
        {row.map((item, i) => (
          <span key={`${item}-${i}`} className="flex items-center gap-8">
            <span className="font-display text-[0.9rem] tracking-tight text-slate-500/80 sm:text-[1.05rem]">
              {item}
            </span>
            <Sparkles size={13} strokeWidth={1.5} className="shrink-0 text-violet-300/45" aria-hidden="true" />
          </span>
        ))}
      </div>
      {/* 两端淡出，避免文字被硬切 */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#04040c] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#04040c] to-transparent" />
    </div>
  );
}
