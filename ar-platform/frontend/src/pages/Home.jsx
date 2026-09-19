import React, { useEffect, useMemo, useState } from 'react';
import {
  Link } from 'react-router-dom';
import {
  Sparkles,
  ArrowUpRight,
  Boxes,
  Gamepad2,
  MapPin,
  ChevronDown,
  Activity,
  Radar,
  Camera,
  MousePointer2,
  Play,
  Wand2,
  Orbit as OrbitIcon,
  Gauge,
} from 'lucide-react';

import StarfieldCanvas from '../components/star/StarfieldCanvas.jsx';
import CursorAura from '../components/immersive/CursorAura.jsx';
import KineticText from '../components/immersive/KineticText.jsx';
import OrbitMap from '../components/immersive/OrbitMap.jsx';
import TiltCard from '../components/immersive/TiltCard.jsx';
import CountUp from '../components/immersive/CountUp.jsx';
import Marquee from '../components/immersive/Marquee.jsx';
import useReveal, { useRevealAll } from '../hooks/useReveal.js';
import { fetchTemplates } from '../api/client.js';
import TemplateCard from '../components/TemplateCard.jsx';
import { MODULE_VIEW, moduleUrl } from '../constants/modules.js';

/* ------------------------------------------------------------------
   集成入口：把分散在不同文件夹 / 端口的项目汇到一个总览
   文件夹位置刻意保持分离，这里只做「入口聚合」
   ------------------------------------------------------------------
   端口、协议、入口路径、是否在运行 —— 全部来自后端 `GET /api/modules`。
   这里只声明展示顺序，以及「点进去是站内页还是外部服务」。

   历史教训：这些值以前写死在这个数组里，服务改了端口前端毫不知情，
   于是同时出现三个死链（导览写 3100 实际 3010、手势写 3200 实际 3011、
   平面写 4300 实际 8080），并且 status 恒为 'running' ——
   服务没起也显示「运行中」，点进去才知道是空的。
   ------------------------------------------------------------------ */
const MODULE_ORDER = ['engine', 'tour', 'hand', 'plane', 'card', 'gen3d'];

/** 模块拓扑 + 实时存活状态（后端做裸 TCP 探活，不看 HTTP 状态码） */
function useModules() {
  const [modules, setModules] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/modules')
      .then((r) => r.json())
      .then((d) => alive && setModules(d.modules || []))
      .catch(() => alive && setModules([]));
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    if (!modules) return [];
    return MODULE_ORDER.map((id) => modules.find((m) => m.id === id))
      .filter(Boolean)
      .map((m) => {
        const view = MODULE_VIEW[m.id] || {};
        // 地址按「访问者当前的主机名」拼，手机打开主站时才能拿到局域网 IP
        const externalUrl = moduleUrl(m);
        // 能内嵌的收进主站（/studio/:id），摄像头重的留在外部直连
        const embeddable = view.embed === true;
        /*
         * 已并入主站的模块（后端标 internal 且没有独立端口，例如导览）：
         * 它的 path 是**本平台的站内路由**，直接用，不要拼端口。
         * 这类模块的状态是 integrated 而不是 down —— 免得看起来像「服务挂了」。
         */
        const inSite = m.internal === true && !m.port;
        return {
          ...m,
          ...view,
          externalUrl,
          href: m.self ? '/' : inSite ? m.path : embeddable ? `/studio/${m.id}` : externalUrl,
          internal: Boolean(m.self) || inSite || embeddable,
        };
      });
  }, [modules]);
}

/* 真 AR 空间技术账目（口径见 _notes/11-WebAR能力总账.md） */
const LEDGER = { total: 39, done: 16, partial: 9, missing: 14 };

const BUILD_PATHS = [
  { to: '/create-experience', icon: Radar, title: 'AR 交互体验', desc: '统一创作台，自由组合规则、导览与游戏机制' },
  { to: '/create-game', icon: Gamepad2, title: 'AR 小游戏', desc: '寻宝、打靶、集章三种玩法，AI 生成规则' },
  { to: '/create-guide', icon: MapPin, title: 'AR 导览', desc: 'POI 路线编排，位置触发讲解与 AR 内容' },
  { to: '/ar-showcase', icon: Camera, title: 'AR 模型展示', desc: '无标记放置，分步引导扫平面后落地模型' },
];

const MARQUEE_ITEMS = [
  '图片追踪', '人脸追踪', '手部 21 关键点', '平面检测', '深度遮挡',
  '世界追踪 SLAM', 'GPS 导览', '视觉定位 VPS', 'AR 小游戏', 'AI 生成 3D',
];

/** 滚动视差：把 [data-parallax] 元素按深度做位移（rAF 节流，只读一次 scrollY） */
function useScrollParallax() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('[data-parallax]'));
    if (els.length === 0) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const items = els.map((el) => ({ el, depth: Number(el.dataset.parallax) || 0.12, cur: 0 }));
    let target = 0;
    let raf = 0;

    const loop = () => {
      let moving = false;
      for (const it of items) {
        const want = target * it.depth;
        it.cur += (want - it.cur) * 0.09;
        if (Math.abs(want - it.cur) > 0.15) moving = true;
        it.el.style.transform = `translate3d(0, ${it.cur.toFixed(2)}px, 0)`;
      }
      raf = moving ? requestAnimationFrame(loop) : 0;
    };

    const onScroll = () => {
      target = window.scrollY;
      if (!raf) raf = requestAnimationFrame(loop);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
}

export default function Home() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 模块拓扑与实时状态。加载完成前是空数组，轨道图会自动退化成「无节点」而不是报错。
  const services = useModules();

  const portalTitleRef = useReveal();
  const portalRef = useRevealAll();
  const pathsRef = useRevealAll();
  const templatesRef = useReveal();

  useScrollParallax();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTemplates()
      .then((data) => {
        if (!cancelled) {
          setTemplates(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || '加载模板失败');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const doneRatio = LEDGER.done / LEDGER.total;

  // 环形进度：半径 52 → 周长 2πr
  const RING_R = 52;
  const RING_C = 2 * Math.PI * RING_R;

  return (
    <div className="relative">
      <CursorAura />

      {/* ================= HERO ================= */}
      <section className="relative flex min-h-[94vh] items-center overflow-hidden">
        <StarfieldCanvas density={1.25} constellation shootingStars />

        {/* 星云层：三团不同色相的柔光，随滚动轻微视差 */}
        <div className="nebula nebula-rose" data-parallax="0.05" />
        <div className="nebula nebula-violet" data-parallax="0.09" />
        <div className="nebula nebula-cyan" data-parallax="0.13" />
        <div className="aurora" />
        <div className="absolute inset-0 bg-grid opacity-[0.42]" />
        <div className="noise absolute inset-0" />

        {/* 后方仪式感光环 */}
        <div aria-hidden="true" className="hero-halo">
          <span className="hero-halo-ring" />
          <span className="hero-halo-ring hero-halo-ring-2" />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-[#04040c]" />

        <div className="relative mx-auto w-full max-w-7xl px-6 pb-24 pt-8 sm:px-10">
          {/* 眉标 */}
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="eyebrow">AllWebAR · 星空实境实验场</span>
            <span className="hidden h-px w-10 bg-white/15 sm:block" />
            <span className="hidden text-[0.68rem] tracking-[0.2em] text-slate-600 sm:block">
              浏览器端增强现实
            </span>
          </div>

          {/* 主标题：逐字入场 + 指针磁场 */}
          <h1 className="font-display text-slate-100">
            <KineticText as="span" text="让真实空间" className="block text-hero" delay={0.15} />
            <KineticText
              as="span"
              text="成为画布"
              className="font-serif-sc hero-gradient-line block text-hero"
              charClassName="hero-gradient-char"
              delay={0.42}
              stagger={0.05}
              strength={13}
            />
          </h1>

          <div className="mt-9 max-w-2xl">
            <p className="text-[0.95rem] leading-relaxed text-slate-400 sm:text-base">
              图片识别、人脸、手势、平面放置、深度遮挡与视觉定位，全部在浏览器里运行，免安装。
              六条能力线各自独立演进，从这里统一进入。
            </p>
          </div>

          {/* 操作区 */}
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to="/guide-demo" className="btn-primary group">
              <Play size={15} strokeWidth={2} aria-hidden="true" />
              进入导览演示
              <ArrowUpRight
                size={15}
                strokeWidth={1.9}
                aria-hidden="true"
                className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </Link>
            <Link to="/create-experience" className="btn-ghost">
              <Wand2 size={15} strokeWidth={1.75} aria-hidden="true" />
              开始创作
            </Link>
            <Link to="/xr-studio" className="btn-ghost">
              <Boxes size={15} strokeWidth={1.75} aria-hidden="true" />
              打开 XR 工作室
            </Link>
            <Link to="/dashboard" className="btn-ghost">
              <Activity size={15} strokeWidth={1.75} aria-hidden="true" />
              我的控制台
            </Link>
          </div>

          {/* 数据条 */}
          <dl className="mt-16 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-6 border-t border-white/[0.07] pt-8 sm:grid-cols-4">
            {[
              { k: '真 AR 空间技术', v: LEDGER.total, unit: '项', decimals: 0 },
              { k: '已做通', v: LEDGER.done, unit: '项', decimals: 0 },
              { k: '独立能力线', v: services.length || MODULE_ORDER.length, unit: '条', decimals: 0 },
              { k: '做通率', v: doneRatio * 100, unit: '%', decimals: 1 },
            ].map((s) => (
              <div key={s.k}>
                <dd className="text-2xl font-medium tracking-tight text-slate-100 sm:text-3xl">
                  <CountUp value={s.v} decimals={s.decimals} duration={1600} />
                  <span className="ml-1 text-xs font-normal text-slate-500">{s.unit}</span>
                </dd>
                <dt className="mt-1.5 text-[0.7rem] tracking-wide text-slate-500">{s.k}</dt>
              </div>
            ))}
          </dl>
        </div>

        {/* 滚动提示 */}
        <div className="pointer-events-none absolute bottom-7 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 sm:flex">
          <span className="text-[0.6rem] tracking-[0.3em] text-slate-600">SCROLL</span>
          <ChevronDown size={16} className="animate-float-soft text-slate-600" strokeWidth={1.5} />
        </div>
      </section>

      {/* ================= 字带 ================= */}
      <Marquee items={MARQUEE_ITEMS} speed={46} />

      {/* ================= 星座轨道图 ================= */}
      <section id="orbit" className="relative mx-auto max-w-7xl px-6 py-24 sm:px-10">
        <div ref={portalTitleRef} className="reveal mb-14 flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="eyebrow">— 星 图 导 航</span>
            <h2 className="font-display text-editorial !leading-[1.3] mt-4 text-slate-100">
              六条能力线，<span className="gradient-text">一个星座</span>
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-500">
              把六个独立项目放进同一张星图：中心是平台内核，节点沿轨道公转。
              悬停减速、点击进入；各项目仍在自己的目录里独立维护。
            </p>
          </div>
          <div className="flex items-center gap-2 text-[0.7rem] text-slate-500">
            <MousePointer2 size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>可悬停 · 可点击</span>
          </div>
        </div>

        <div ref={portalRef}>
          <OrbitMap services={services} className="reveal" />
        </div>
      </section>

      {/* ================= 创作入口 ================= */}
      <section id="paths" className="relative mx-auto max-w-7xl px-6 py-24 sm:px-10">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow">— 创 作 入 口</span>
            <h2 className="font-display text-editorial !leading-[1.3] mt-4 text-slate-100">四条建线路径</h2>
          </div>
          <p className="max-w-sm text-[0.78rem] leading-relaxed text-slate-500">
            从零搭一条 AR 内容线：选能力、排步骤、发布链接，手机打开即用。
          </p>
        </div>

        <div ref={pathsRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {BUILD_PATHS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.to} className="reveal">
                <TiltCard to={p.to} className="panel group block h-full p-7">
                  <div className="flex items-start gap-4">
                    <span className="icon-tile icon-tile-md shrink-0 transition-colors duration-300 group-hover:border-violet-300/30">
                      <Icon size={19} strokeWidth={1.5} className="text-slate-400 transition-colors duration-300 group-hover:text-violet-200" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[1rem] font-medium text-slate-200">{p.title}</h3>
                      <p className="mt-1.5 text-[0.78rem] leading-relaxed text-slate-500">{p.desc}</p>
                    </div>
                    <ArrowUpRight
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className="ml-auto shrink-0 text-slate-700 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-300"
                    />
                  </div>
                </TiltCard>
              </div>
            );
          })}
        </div>
      </section>

      {/* ================= 模板 ================= */}
      <section id="templates" className="relative mx-auto max-w-7xl px-6 pb-28 sm:px-10">
        <div ref={templatesRef} className="reveal mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow">— 快 速 开 始</span>
            <h2 className="font-display text-editorial !leading-[1.3] mt-4 text-slate-100">从模板起步</h2>
          </div>
          <div className="flex items-center gap-2 text-[0.72rem] text-slate-500">
            <Gauge size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>{loading ? '正在读取模板…' : `${templates.length} 个模板可用`}</span>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-violet-400/25 border-t-violet-300" />
            <p className="mt-4 text-[0.78rem] text-slate-500">正在读取模板…</p>
          </div>
        )}

        {error && (
          <div className="glass-panel rounded-2xl p-8 text-center">
            <p className="text-sm text-rose-300">模板加载失败</p>
            <p className="mt-1.5 text-[0.75rem] text-slate-500">{error}</p>
            <p className="mt-1 text-[0.7rem] text-slate-600">
              需要后端服务在 3001 端口运行（<span className="code">node backend/src/index.js</span>）。
            </p>
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        )}

        {/* 收尾：给页面一个安静的结束 */}
        <div className="mt-20 flex items-center justify-center gap-3 text-[0.68rem] tracking-[0.25em] text-slate-600">
          <OrbitIcon size={14} strokeWidth={1.5} aria-hidden="true" className="text-violet-300/60" />
          <span>ALLWEBAR · BROWSER AR</span>
          <Sparkles size={13} strokeWidth={1.5} aria-hidden="true" className="text-violet-300/60" />
        </div>
      </section>
    </div>
  );
}
