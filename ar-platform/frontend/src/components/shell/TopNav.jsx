import React, { useEffect, useRef, useState } from 'react';
import {
  Link,
  useLocation } from 'react-router-dom';
import {
  Sparkles,
  Menu,
  X,
  ChevronDown,
  Home,
  LayoutDashboard,
  Play,
  Camera,
  Activity,
  Radar,
  MapPin,
  Gamepad2,
  Wand2,
  ArrowUpRight,
  Boxes,
  Globe,
} from 'lucide-react';

/* ------------------------------------------------------------------
   主导航数据
   旧版把导航藏在 ConstellationLayer 的星点里 —— 没有 <nav>、没有可读文本、
   键盘不可达。这里重建为语义化导航，星点动画保留但退为纯装饰。
   ------------------------------------------------------------------ */
const NAV_LINKS = [
  { to: '/', label: '首页', icon: Home, exact: true },
  { to: '/dashboard', label: '控制台', icon: LayoutDashboard },
  { to: '/guide-demo', label: '导览演示', icon: Play },
  { to: '/pano', label: '全景模式', icon: Globe },
  { to: '/ar-showcase', label: 'AR 展示', icon: Camera },
  { to: '/xr-studio', label: 'XR 工作室', icon: Boxes },
  { to: '/test/architecture', label: '引擎自检', icon: Activity },
];

const CREATE_LINKS = [
  { to: '/create-experience', label: 'AR 交互体验', desc: '统一创作台 · 规则与机制自由组合', icon: Radar },
  { to: '/create-guide', label: 'AR 导览', desc: 'POI 路线编排 · 位置触发讲解', icon: MapPin },
  { to: '/create-game', label: 'AR 小游戏', desc: '寻宝 / 打靶 / 集章三种玩法', icon: Gamepad2 },
  { to: '/ai-design', label: 'AI 设计', desc: '一句话描述生成配置', icon: Wand2 },
];

/** 单个导航项：底部一条极光细线随激活态进出 */
function NavItem({ item, active, onNavigate }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-2 rounded-lg px-3 py-2 text-[0.8rem] transition-colors duration-300 ${
        active ? 'text-slate-50' : 'text-slate-400 hover:text-slate-100'
      }`}
    >
      <Icon
        size={14}
        strokeWidth={1.7}
        aria-hidden="true"
        className={`shrink-0 transition-colors duration-300 ${
          active ? 'text-violet-300' : 'text-slate-500 group-hover:text-slate-300'
        }`}
      />
      <span>{item.label}</span>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-3 -bottom-px h-px origin-left bg-gradient-to-r from-violet-300/80 via-cyan-200/60 to-transparent transition-transform duration-500 ${
          active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
        }`}
      />
    </Link>
  );
}

export default function TopNav() {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef(null);

  /* 滚动收缩：让导航条在阅读时退让，滚动时收紧 */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 14);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* 路由变化收起所有浮层（含浏览器前进/后退） */
  useEffect(() => {
    setMenuOpen(false);
    setCreateOpen(false);
  }, [location.pathname]);

  /* Escape 关闭浮层 */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      setCreateOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* 抽屉打开时锁住页面滚动 */
  useEffect(() => {
    if (!menuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  /* 点击下拉外部区域关闭 */
  useEffect(() => {
    if (!createOpen) return undefined;
    const onDown = (e) => {
      if (createRef.current && !createRef.current.contains(e.target)) setCreateOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [createOpen]);

  const isActive = (item) =>
    item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
  /* /create/:templateId 这条旧路由不属于任何一条建线路径，但同属下拉菜单 */
  const createActive =
    location.pathname.startsWith('/create') || location.pathname.startsWith('/ai-design');

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={`mx-auto transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)] ${
          scrolled ? 'max-w-6xl px-3 pt-2 sm:px-5' : 'max-w-7xl px-4 pt-4 sm:px-8'
        }`}
      >
        <div
          className={`glass-panel flex items-center gap-2 rounded-2xl transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)] ${
            scrolled
              ? 'px-3 py-1.5 shadow-[0_20px_56px_-28px_rgba(0,0,0,0.95)]'
              : 'px-3.5 py-2.5 sm:px-4'
          }`}
        >
          {/* 品牌 */}
          <Link
            to="/"
            className="group flex shrink-0 items-center gap-2.5 rounded-xl px-1.5 py-1"
            aria-label="AllWebAR 首页"
          >
            <span className="relative flex h-7 w-7 items-center justify-center">
              <Sparkles
                size={17}
                strokeWidth={1.6}
                aria-hidden="true"
                className="relative z-10 text-violet-200 transition-transform duration-700 group-hover:rotate-[22deg]"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-1 rounded-full opacity-40 blur-md"
                style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.9), transparent 70%)' }}
              />
            </span>
            <span className="font-display text-[0.95rem] tracking-tight text-slate-100">
              AllWeb<span className="text-violet-300">AR</span>
            </span>
          </Link>

          <span aria-hidden="true" className="mx-1 hidden h-5 w-px shrink-0 bg-white/[0.09] lg:block" />

          {/* 桌面端主导航 */}
          <nav aria-label="主导航" className="hidden items-center gap-0.5 lg:flex">
            {NAV_LINKS.slice(0, 2).map((item) => (
              <NavItem key={item.to} item={item} active={isActive(item)} />
            ))}

            {/* 创建：下拉收纳四条建线路径 */}
            <div
              ref={createRef}
              className="relative"
              onMouseEnter={() => setCreateOpen(true)}
              onMouseLeave={() => setCreateOpen(false)}
            >
              <button
                type="button"
                aria-expanded={createOpen}
                aria-haspopup="true"
                onClick={() => setCreateOpen((v) => !v)}
                className={`group relative flex items-center gap-2 rounded-lg px-3 py-2 text-[0.8rem] transition-colors duration-300 ${
                  createActive ? 'text-slate-50' : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                <Wand2
                  size={14}
                  strokeWidth={1.7}
                  aria-hidden="true"
                  className={`shrink-0 transition-colors duration-300 ${
                    createActive ? 'text-violet-300' : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                />
                <span>创建</span>
                <ChevronDown
                  size={13}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  className={`transition-transform duration-300 ${createOpen ? 'rotate-180' : ''}`}
                />
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-3 -bottom-px h-px origin-left bg-gradient-to-r from-violet-300/80 via-cyan-200/60 to-transparent transition-transform duration-500 ${
                    createActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                  }`}
                />
              </button>

              <div
                className={`absolute left-0 top-full w-[19.5rem] pt-3 transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
                  createOpen
                    ? 'visible translate-y-0 opacity-100'
                    : 'invisible -translate-y-1 opacity-0'
                }`}
              >
                <div className="glass-panel overflow-hidden rounded-2xl p-1.5 shadow-[0_28px_70px_-30px_rgba(0,0,0,0.95)]">
                  {CREATE_LINKS.map((c) => {
                    const Icon = c.icon;
                    const active = location.pathname.startsWith(c.to);
                    return (
                      <Link
                        key={c.to}
                        to={c.to}
                        aria-current={active ? 'page' : undefined}
                        className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors duration-300 ${
                          active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.05]'
                        }`}
                      >
                        <Icon
                          size={16}
                          strokeWidth={1.6}
                          aria-hidden="true"
                          className={`mt-0.5 shrink-0 transition-colors duration-300 ${
                            active ? 'text-violet-300' : 'text-slate-500 group-hover:text-violet-300'
                          }`}
                        />
                        <span className="min-w-0">
                          <span className="block text-[0.82rem] text-slate-200">{c.label}</span>
                          <span className="mt-0.5 block text-[0.7rem] leading-relaxed text-slate-500">
                            {c.desc}
                          </span>
                        </span>
                        <ArrowUpRight
                          size={14}
                          strokeWidth={1.75}
                          aria-hidden="true"
                          className="ml-auto mt-0.5 shrink-0 text-slate-700 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-400"
                        />
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>

            {NAV_LINKS.slice(2).map((item) => (
              <NavItem key={item.to} item={item} active={isActive(item)} />
            ))}
          </nav>

          {/* 右侧操作区 */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link to="/create-experience" className="btn-primary btn-sm hidden sm:inline-flex">
              <Radar size={14} strokeWidth={1.9} aria-hidden="true" />
              开始创作
            </Link>

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? '关闭导航菜单' : '打开导航菜单'}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-300 transition-colors duration-300 hover:border-white/20 hover:text-white lg:hidden"
            >
              {menuOpen ? <X size={17} strokeWidth={1.8} /> : <Menu size={17} strokeWidth={1.8} />}
            </button>
          </div>
        </div>
      </div>

      {/* 移动端抽屉 */}
      <div
        id="mobile-nav"
        aria-hidden={!menuOpen}
        className={`fixed inset-0 z-40 lg:hidden ${menuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <button
          type="button"
          tabIndex={menuOpen ? 0 : -1}
          aria-label="关闭导航菜单"
          onClick={() => setMenuOpen(false)}
          className={`absolute inset-0 h-full w-full cursor-default bg-ar-deeper/88 backdrop-blur-xl transition-opacity duration-500 ${
            menuOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <nav
          aria-label="移动端导航"
          className="relative flex h-full flex-col justify-center overflow-y-auto px-8 pb-16 pt-24"
        >
          {[...NAV_LINKS, ...CREATE_LINKS].map((item, i) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.to + item.label}
                to={item.to}
                tabIndex={menuOpen ? 0 : -1}
                aria-current={active ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
                style={{ transitionDelay: menuOpen ? `${80 + i * 38}ms` : '0ms' }}
                className={`group flex items-center gap-4 border-b border-white/[0.06] py-4 transition-all duration-500 ${
                  menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
                }`}
              >
                <Icon
                  size={19}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className={active ? 'text-violet-300' : 'text-slate-600 group-hover:text-violet-300'}
                />
                <span
                  className={`font-display text-xl tracking-tight ${
                    active ? 'text-slate-50' : 'text-slate-400'
                  }`}
                >
                  {item.label}
                </span>
                <span className="tabular ml-auto text-[0.65rem] text-slate-700">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </Link>
            );
          })}

          <Link
            to="/create-experience"
            tabIndex={menuOpen ? 0 : -1}
            onClick={() => setMenuOpen(false)}
            style={{ transitionDelay: menuOpen ? '420ms' : '0ms' }}
            className={`btn-primary mt-8 w-full transition-all duration-500 ${
              menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
            }`}
          >
            <Radar size={15} strokeWidth={1.9} aria-hidden="true" />
            开始创作
          </Link>
        </nav>
      </div>
    </header>
  );
}
