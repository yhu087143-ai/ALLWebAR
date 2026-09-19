import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Orbit, CircleDot } from 'lucide-react';
import { STATUS_META } from '../../constants/modules.js';

/**
 * OrbitMap —— 六条能力线的「星座轨道图」
 *
 * 把六个独立项目放进同一张星图：中心是平台内核，六个节点沿两条轨道公转，
 * 悬停时轨道减速、节点放大发光、右侧面板展开该能力线的详情；点击直接进入对应服务。
 *
 * 实现要点：
 *   - 角度积分放在 rAF 里，直接写 DOM transform，不触发 React 重渲染
 *   - 指针靠近时节点被轻微推开（排斥力），离开后弹簧归位 —— "可以被拨动的星"
 *   - SVG 连线端点每帧同步，保持与节点贴合
 *   - prefers-reduced-motion：不公转，只保留悬停 / 点击
 */
const TAU = Math.PI * 2;

export default function OrbitMap({ services = [], className = '' }) {
  const stageRef = useRef(null);
  const nodeRefs = useRef([]);
  const lineRefs = useRef([]);
  const angleRef = useRef(0);
  const speedRef = useRef(1);
  const pointerRef = useRef({ x: -9999, y: -9999, inside: false });
  const activeRef = useRef(null);

  const [size, setSize] = useState(560);
  const [activeId, setActiveId] = useState(null);

  // 两条轨道：内圈 3 个、外圈 3 个，反向公转
  const layout = useMemo(() => {
    const chars = services.map((s, i) => {
      const inner = i % 2 === 0;
      return {
        service: s,
        ring: inner ? 0 : 1,
        phase: (Math.floor(i / 2) / Math.ceil(services.length / 2)) * TAU + (inner ? 0.35 : 1.9),
        dir: inner ? 1 : -1,
      };
    });
    return chars;
  }, [services]);

  const active = services.find((s) => s.id === activeId) || null;
  /*
   * 窄屏（<560px）用「图标节点」：节点框宽约 150px，若仍渲染文字，
   * 位于环左右两端的节点会溢出舞台、被视口裁掉（实测 390px 宽机型横向溢出 50px+）。
   */
  const compact = size > 0 && size < 560;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => setSize(stage.clientWidth || 560))
      : null;
    if (ro) ro.observe(stage);
    setSize(stage.clientWidth || 560);

    const onPointerMove = (e) => {
      const rect = stage.getBoundingClientRect();
      pointerRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        inside: true,
      };
    };
    const onPointerLeave = () => {
      pointerRef.current = { x: -9999, y: -9999, inside: false };
      speedRef.current = 1;
    };
    stage.addEventListener('pointermove', onPointerMove, { passive: true });
    stage.addEventListener('pointerleave', onPointerLeave);

    const nodes = nodeRefs.current.filter(Boolean);
    const lines = lineRefs.current.filter(Boolean);
    let raf = 0;
    let prev = performance.now();

    const applyGeometry = () => {
      const cx = size / 2;
      const cy = size / 2;
      const rInner = size * 0.3;
      const rOuter = size * 0.43;
      const p = pointerRef.current;

      layout.forEach((item, i) => {
        const radius = item.ring === 0 ? rInner : rOuter;
        const angle = item.phase + item.dir * angleRef.current;
        const baseX = cx + Math.cos(angle) * radius;
        const baseY = cy + Math.sin(angle) * radius;

        // 指针排斥：距离越近推得越远（上限 16px）
        let ox = 0;
        let oy = 0;
        if (p.inside) {
          const dx = baseX - p.x;
          const dy = baseY - p.y;
          const dist = Math.hypot(dx, dy);
          const range = size * 0.24;
          if (dist < range && dist > 0.001) {
            const falloff = 1 - dist / range;
            const force = falloff * falloff * 16;
            ox = (dx / dist) * force;
            oy = (dy / dist) * force;
          }
        }

        const node = nodes[i];
        if (node) {
          const isActive = activeRef.current === item.service.id;
          const scale = isActive ? 1.14 : 1;
          node.style.transform =
            `translate3d(${(baseX + ox).toFixed(2)}px, ${(baseY + oy).toFixed(2)}px, 0) ` +
            `translate(-50%, -50%) scale(${scale})`;
          node.style.zIndex = isActive ? '20' : '10';
        }

        const line = lines[i];
        if (line) {
          line.setAttribute('x2', (baseX + ox).toFixed(2));
          line.setAttribute('y2', (baseY + oy).toFixed(2));
          line.setAttribute('opacity', activeRef.current === item.service.id ? '0.85' : '0.22');
        }
      });
    };

    const frame = (now) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      // 悬停时轨道减速到 18%，离开后回到 100%
      const target = pointerRef.current.inside ? 0.18 : 1;
      speedRef.current += (target - speedRef.current) * 0.06;
      angleRef.current += dt * 0.16 * speedRef.current;
      applyGeometry();
      raf = requestAnimationFrame(frame);
    };

    applyGeometry();
    if (!reduced) raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerleave', onPointerLeave);
      if (ro) ro.disconnect();
    };
  }, [layout, size]);

  // 悬停状态同步到 ref，供 rAF 读取（避免闭包过期）
  const handleActive = (id) => {
    activeRef.current = id;
    setActiveId(id);
  };

  return (
    <div className={`grid gap-10 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:items-center ${className}`}>
      {/* ---------------- 星图舞台 ---------------- */}
      <div
        ref={stageRef}
        className="orbit-stage relative mx-auto aspect-square w-full max-w-[620px]"
        onPointerLeave={() => handleActive(null)}
      >
        {/* 轨道环 + 连线 */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="orbit-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(167,139,250,0.30)" />
              <stop offset="60%" stopColor="rgba(94,234,212,0.08)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            <linearGradient id="orbit-line" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(167,139,250,0.9)" />
              <stop offset="100%" stopColor="rgba(94,234,212,0.35)" />
            </linearGradient>
          </defs>

          <circle cx={size / 2} cy={size / 2} r={size * 0.47} fill="url(#orbit-core)" />
          <circle cx={size / 2} cy={size / 2} r={size * 0.3} className="orbit-ring" />
          <circle cx={size / 2} cy={size / 2} r={size * 0.43} className="orbit-ring orbit-ring-outer" />
          <g className="orbit-ticks">
            {Array.from({ length: 72 }).map((_, i) => {
              const a = (i / 72) * TAU;
              const r1 = size * 0.468;
              const r2 = i % 6 === 0 ? size * 0.455 : size * 0.463;
              return (
                <line
                  key={i}
                  x1={size / 2 + Math.cos(a) * r1}
                  y1={size / 2 + Math.sin(a) * r1}
                  x2={size / 2 + Math.cos(a) * r2}
                  y2={size / 2 + Math.sin(a) * r2}
                />
              );
            })}
          </g>

          {layout.map((item, i) => (
            <line
              key={item.service.id}
              ref={(el) => { lineRefs.current[i] = el; }}
              x1={size / 2}
              y1={size / 2}
              x2={size / 2}
              y2={size / 2}
              stroke="url(#orbit-line)"
              strokeWidth="1"
              strokeDasharray="3 5"
            />
          ))}
        </svg>

        {/* 内核 */}
        <div className="orbit-core">
          <span className="orbit-core-ring" />
          <div className="relative flex flex-col items-center">
            <Orbit size={17} strokeWidth={1.5} className="text-violet-200/85" aria-hidden="true" />
            <span className="font-display mt-2 text-[0.95rem] tracking-tight text-slate-100">
              AllWeb<span className="text-violet-300">AR</span>
            </span>
            <span className="mt-1 text-[0.6rem] tracking-[0.22em] text-slate-500">
              {services.length} 条能力线
            </span>
          </div>
        </div>

        {/* 节点 */}
        {layout.map((item, i) => {
          const s = item.service;
          const Icon = s.icon;
          const isActive = activeId === s.id;
          const disabled = !s.href;

          const body = (
            <>
              <span
                className={`orbit-node-halo ${isActive ? 'is-on' : ''}`}
                style={{ background: s.glow }}
              />
              <span className={`orbit-node-icon ${isActive ? 'is-on' : ''}`}>
                <Icon size={18} strokeWidth={1.6} className={s.accent} aria-hidden="true" />
              </span>
              <span className="orbit-node-text">
                <span className="orbit-node-label">{s.label}</span>
                <span className="orbit-node-name">{s.name}</span>
              </span>
            </>
          );

          return disabled ? (
            <div
              key={s.id}
              ref={(el) => { nodeRefs.current[i] = el; }}
              className={`orbit-node is-disabled${compact ? ' is-compact' : ''}`}
              onPointerEnter={() => handleActive(s.id)}
              onFocus={() => handleActive(s.id)}
              role="group"
              aria-label={`${s.name}（本机无法运行）`}
              tabIndex={0}
            >
              {body}
            </div>
          ) : s.internal ? (
            /*
             * 站内路由（/studio/:id、/xr-studio）必须走 react-router：
             * 用 target="_blank" 会另开一个标签，用户就离开了主站外壳 ——
             * 而「把子模块收进主站」正是这一版要解决的事。
             */
            <Link
              key={s.id}
              ref={(el) => { nodeRefs.current[i] = el; }}
              to={s.href}
              className={`orbit-node${compact ? ' is-compact' : ''}`}
              onPointerEnter={() => handleActive(s.id)}
              onFocus={() => handleActive(s.id)}
              aria-label={`${s.name}：在主站内打开`}
            >
              {body}
            </Link>
          ) : (
            <a
              key={s.id}
              ref={(el) => { nodeRefs.current[i] = el; }}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              className={`orbit-node${compact ? ' is-compact' : ''}`}
              onPointerEnter={() => handleActive(s.id)}
              onFocus={() => handleActive(s.id)}
              aria-label={`${s.name}：在新窗口打开 ${s.href}`}
            >
              {body}
            </a>
          );
        })}
      </div>

      {/* ---------------- 详情面板 ---------------- */}
      <aside className="panel relative min-h-[320px] overflow-hidden p-7">
        <div
          className="halo"
          style={{
            background: active ? active.glow : 'rgba(167,139,250,0.3)',
            width: 210,
            height: 210,
            right: -60,
            top: -70,
          }}
        />

        {active ? (
          <div className="relative animate-fade-in-scale" key={active.id}>
            <div className={`icon-tile icon-tile-lg ${active.ring}`}>
              <active.icon size={20} strokeWidth={1.6} className={active.accent} aria-hidden="true" />
            </div>
            <p className="eyebrow mt-6">{active.label}</p>
            <h3 className="font-display !leading-[1.28] mt-3 text-[1.6rem] text-slate-100">{active.name}</h3>
            <p className="mt-4 text-[0.82rem] leading-relaxed text-slate-400">{active.blurb}</p>

            <div className="mt-6 flex flex-wrap gap-1.5">
              {active.tags.map((t) => (
                <span key={t} className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-[3px] text-[0.63rem] text-slate-400">
                  {t}
                </span>
              ))}
            </div>

            <div className="mt-7 flex items-center justify-between gap-4 border-t border-white/[0.07] pt-5">
              <span className="text-[0.68rem] text-slate-500">
                端口 {active.port || '—'} ·{' '}
                <span className={STATUS_META[active.status]?.tone || 'text-slate-600'}>
                  {STATUS_META[active.status]?.text || '未知'}
                </span>
              </span>
              {active.href ? (
                active.internal ? (
                  <Link to={active.href} className="btn-ghost !py-2 !px-3.5 !text-[0.72rem]">
                    进入
                    <ArrowUpRight size={13} strokeWidth={1.8} aria-hidden="true" />
                  </Link>
                ) : (
                  <a href={active.href} target="_blank" rel="noreferrer" className="btn-ghost !py-2 !px-3.5 !text-[0.72rem]">
                    打开
                    <ArrowUpRight size={13} strokeWidth={1.8} aria-hidden="true" />
                  </a>
                )
              ) : (
                <span className="text-[0.68rem] text-slate-600">本机无法运行</span>
              )}
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="icon-tile icon-tile-lg">
              <CircleDot size={19} strokeWidth={1.5} className="text-violet-200/80" aria-hidden="true" />
            </div>
            <p className="eyebrow mt-6">星 图 导 航</p>
            <h3 className="font-display !leading-[1.34] mt-3 text-[1.35rem] text-slate-100">
              六条能力线，
              <br />
              各自在自己的轨道上运行
            </h3>
            <p className="mt-4 text-[0.8rem] leading-relaxed text-slate-500">
              悬停任一节点，轨道会减速、节点会发光；点击进入对应服务。
              各项目仍在自己的目录里独立维护，这里只是统一入口。
            </p>
            <ul className="mt-7 space-y-2.5 border-t border-white/[0.07] pt-5 text-[0.7rem] text-slate-500">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 运行中 · 可直接访问
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> HTTPS 自签 · 需在浏览器接受证书
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> 需 GPU · 本机跑不起来
              </li>
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
