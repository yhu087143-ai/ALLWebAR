import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Github, Radio, MapPin, Layers } from 'lucide-react';
import TopNav from './TopNav.jsx';
import StarfieldCanvas from '../star/StarfieldCanvas.jsx';

/**
 * SiteFooter —— 全站页脚
 * 只放真实存在的信息（路由入口与运行前提），不写占位文案。
 */
function SiteFooter() {
  const groups = [
    {
      title: '创作',
      links: [
        { to: '/create-experience', label: 'AR 交互体验' },
        { to: '/create-guide', label: 'AR 导览' },
        { to: '/create-game', label: 'AR 小游戏' },
        { to: '/ai-design', label: 'AI 设计' },
      ],
    },
    {
      title: '体验',
      links: [
        { to: '/guide-demo', label: '内置导览演示' },
        { to: '/ar-showcase', label: 'AR 模型展示' },
        { to: '/xr-studio', label: 'XR 工作室' },
        { to: '/dashboard', label: '我的控制台' },
        { to: '/test/architecture', label: '引擎模块自检' },
      ],
    },
  ];

  const facts = [
    { icon: Radio, text: '浏览器端运行，免安装' },
    { icon: MapPin, text: '需摄像头权限与 HTTPS 或 localhost' },
    { icon: Layers, text: '引擎 / 前端 / 服务端分目录维护' },
  ];

  return (
    <footer className="relative mt-24 border-t border-white/[0.06]">
      <div className="mx-auto max-w-7xl px-6 py-14 sm:px-10">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          {/* 品牌与说明 */}
          <div>
            <div className="flex items-center gap-2.5">
              <Sparkles size={17} strokeWidth={1.6} aria-hidden="true" className="text-violet-200" />
              <span className="font-display text-[0.95rem] tracking-tight text-slate-100">
                AllWeb<span className="text-violet-300">AR</span>
              </span>
            </div>
            <p className="mt-4 max-w-sm text-[0.78rem] leading-relaxed text-slate-500">
              浏览器端增强现实实验场。图片 / 人脸 / 平面 / 世界四路追踪，导览与游戏两套引擎，
              各能力线在自己的目录里独立演进。
            </p>

            <ul className="mt-6 space-y-2.5">
              {facts.map((f) => {
                const Icon = f.icon;
                return (
                  <li key={f.text} className="flex items-center gap-2.5 text-[0.72rem] text-slate-600">
                    <Icon size={13} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-slate-700" />
                    {f.text}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 入口分组 */}
          {groups.map((g) => (
            <nav key={g.title} aria-label={`页脚 · ${g.title}`}>
              <h2 className="eyebrow">{g.title}</h2>
              <ul className="mt-5 space-y-3">
                {g.links.map((l) => (
                  <li key={l.to + l.label}>
                    <Link
                      to={l.to}
                      className="group inline-flex items-center gap-2 text-[0.8rem] text-slate-400 transition-colors duration-300 hover:text-slate-100"
                    >
                      <span className="h-px w-3 bg-slate-700 transition-all duration-300 group-hover:w-5 group-hover:bg-violet-300/70" />
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] pt-6">
          <span className="text-[0.68rem] tracking-wide text-slate-700">
            AllWebAR · 本地演示环境
          </span>
          <span className="flex items-center gap-1.5 text-[0.68rem] text-slate-700">
            <Github size={12} strokeWidth={1.6} aria-hidden="true" />
            未托管于远程仓库
          </span>
        </div>
      </div>
    </footer>
  );
}

/**
 * AppShell —— 常规页面的统一外壳
 *
 * 背景层用 fixed 定位，滚动时不重绘布局，只让内容在其上滑动；
 * 全屏 AR 路由（/view、/guide、/guide-demo、/ar-showcase、/gyro-test）
 * 不经过这里，由 App.jsx 单独渲染。
 */
export default function AppShell({ children }) {
  return (
    <div className="relative min-h-screen">
      {/* 固定背景：星场 + 极光 + 网格 + 颗粒 */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <StarfieldCanvas density={0.62} constellation shootingStars={false} interactive />
        <div className="aurora" />
        <div className="absolute inset-0 bg-grid opacity-[0.32]" />
        <div className="noise absolute inset-0" />
        <div className="absolute inset-x-0 top-0 h-[46vh] bg-gradient-to-b from-[#0a0a22]/60 to-transparent" />
      </div>

      <TopNav />

      <main className="relative z-10 pt-24 sm:pt-28">{children}</main>

      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
