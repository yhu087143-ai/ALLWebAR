/**
 * 子应用内嵌页 —— /studio/:id
 * ---------------------------------------------------------------------------
 * 让主站成为唯一入口：姊妹项目不再各占一个浏览器标签，而是嵌进主站里。
 *
 * 与 /xr-studio 的区别：
 *   /xr-studio 走的是「同源代理」（vite 把 /xr-studio-app 转发到 XR 引擎，
 *   于是编辑器里的 fetch('/api/...') 会落到本平台后端）。那是因为 XR 引擎
 *   本身没有后端，需要借用宿主的。
 *   本页走的是「跨源直连」：导览、手势这些项目都自带后端与自己的 /api，
 *   同源代理反而会把它们的相对请求打到错的服务器上。所以直连它们自己的端口，
 *   各自 API 保持自洽。
 *
 * 摄像头注意：iOS Safari 对跨源 iframe 里的 getUserMedia 限制很严，
 * 重度依赖摄像头的模块（tour / hand / plane / card）默认不内嵌，
 * 而是明确引导新窗口打开 —— 不假装能嵌。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { MODULE_VIEW, moduleUrl, STATUS_META } from '../constants/modules.js';

export default function SubStudio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const iframeRef = useRef(null);

  const [mod, setMod] = useState(null);
  const [loadState, setLoadState] = useState('loading'); // loading | ready | slow | error
  const [reloadKey, setReloadKey] = useState(0);

  const view = MODULE_VIEW[id];
  const url = useMemo(() => (mod ? moduleUrl(mod) : null), [mod]);

  useEffect(() => {
    let alive = true;
    fetch('/api/modules')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setMod((d.modules || []).find((m) => m.id === id) || null);
      })
      .catch(() => alive && setMod(null));
    return () => {
      alive = false;
    };
  }, [id]);

  /*
   * iframe 的加载事件只说明「文档开好了」，不代表内容可用。
   * 证书不受信任时浏览器会直接给一张错误页，onLoad 一样会触发，
   * 所以额外挂一个超时：3 秒没 ready 就提示，而不是让用户干等。
   */
  useEffect(() => {
    if (!url) return;
    setLoadState('loading');
    const t = setTimeout(() => setLoadState((s) => (s === 'loading' ? 'slow' : s)), 4000);
    return () => clearTimeout(t);
  }, [url, reloadKey]);

  const name = mod?.name || view?.blurb || id;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#07070c] text-slate-200">
      {/* ---------- 顶栏 ---------- */}
      <header className="flex shrink-0 items-center gap-3 border-b border-white/8 bg-black/40 px-4 py-2.5 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.72rem] text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
        >
          <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" />
          返回
        </button>

        <div className="mx-1 h-4 w-px bg-white/10" aria-hidden="true" />

        <span className="text-[0.78rem] font-medium tracking-wide text-slate-200">{name}</span>
        {mod?.label && (
          <span className="rounded border border-white/10 px-1.5 py-0.5 text-[0.6rem] text-slate-500">
            {mod.label}
          </span>
        )}
        {mod && STATUS_META[mod.status] && (
          <span className={`inline-flex items-center gap-1.5 text-[0.68rem] ${STATUS_META[mod.status].tone}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[mod.status].dot}`} aria-hidden="true" />
            {STATUS_META[mod.status].text}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {url && (
            <code className="hidden max-w-[22rem] truncate rounded bg-white/5 px-2 py-1 text-[0.62rem] text-slate-500 md:block">
              {url}
            </code>
          )}
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.7rem] text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
          >
            <RefreshCw size={13} strokeWidth={1.8} aria-hidden="true" />
            重载
          </button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/12 px-2.5 py-1.5 text-[0.7rem] text-slate-300 transition hover:border-white/25 hover:text-white"
            >
              <ExternalLink size={13} strokeWidth={1.8} aria-hidden="true" />
              新窗口打开
            </a>
          )}
        </div>
      </header>

      {/* ---------- 主体 ---------- */}
      <div className="relative min-h-0 flex-1">
        {!mod && (
          <Center>
            <Loader2 size={20} className="animate-spin text-slate-600" aria-hidden="true" />
            <p className="mt-3 text-[0.78rem] text-slate-500">正在读取模块信息…</p>
          </Center>
        )}

        {mod && !mod.port && (
          <Center>
            <AlertTriangle size={22} className="text-amber-400/80" aria-hidden="true" />
            <p className="mt-3 text-[0.85rem] text-slate-300">该模块不能内嵌浏览</p>
            {mod.note && <p className="mt-2 max-w-md text-[0.75rem] leading-relaxed text-slate-500">{mod.note}</p>}
          </Center>
        )}

        {mod && mod.port && mod.status === 'down' && (
          <Center>
            <AlertTriangle size={22} className="text-slate-500" aria-hidden="true" />
            <p className="mt-3 text-[0.85rem] text-slate-300">{name} 当前没有运行</p>
            <p className="mt-2 max-w-md text-center text-[0.75rem] leading-relaxed text-slate-500">
              在 AllWebAR 目录双击「一键启动所有.bat」即可拉起全部模块。
            </p>
          </Center>
        )}

        {/* 重度依赖摄像头的模块：明确不内嵌，避免用户对着一片黑屏猜原因 */}
        {mod && mod.port && mod.status === 'up' && view && view.embed === false && (
          <Center>
            <ShieldAlert size={22} className="text-cyan-300/80" aria-hidden="true" />
            <p className="mt-3 text-[0.85rem] text-slate-300">这个模块需要摄像头，建议独立打开</p>
            <p className="mt-2 max-w-lg text-center text-[0.75rem] leading-relaxed text-slate-500">
              iOS Safari 对跨源 iframe 里的摄像头权限限制很严，内嵌常常是一片黑屏。
              新窗口打开可以正常授权取景、也能扫二维码在手机上用。
            </p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-[0.78rem] text-cyan-200 transition hover:border-cyan-400/50 hover:bg-cyan-400/15"
            >
              <ExternalLink size={14} strokeWidth={1.8} aria-hidden="true" />
              新窗口打开 {name}
            </a>
          </Center>
        )}

        {/* 可内嵌的模块 */}
        {mod && mod.port && mod.status === 'up' && (!view || view.embed !== false) && (
          <>
            <iframe
              key={reloadKey}
              ref={iframeRef}
              src={url}
              title={name}
              className="h-full w-full border-0 bg-[#07070c]"
              /*
               * allow 必须显式列全：跨源 iframe 默认拿不到摄像头/传感器，
               * 少了 camera 就是永久黑屏，少了 xr-spatial-tracking 则 WebXR 直接不可用。
               */
              allow="camera; microphone; accelerometer; gyroscope; magnetometer; xr-spatial-tracking; fullscreen; autoplay; clipboard-write"
              onLoad={() => setLoadState((s) => (s === 'loading' ? 'ready' : s))}
            />

            {loadState !== 'ready' && (
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
                <div className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-white/10 bg-black/80 px-3.5 py-2.5 backdrop-blur">
                  {loadState === 'loading' ? (
                    <Loader2 size={15} className="mt-0.5 animate-spin text-slate-500" aria-hidden="true" />
                  ) : (
                    <ShieldAlert size={15} className="mt-0.5 text-amber-400/80" aria-hidden="true" />
                  )}
                  <div className="max-w-md">
                    <p className="text-[0.75rem] text-slate-300">
                      {loadState === 'loading' ? '正在连接子应用…' : '如果这里一直是空白'}
                    </p>
                    <p className="mt-1 text-[0.7rem] leading-relaxed text-slate-500">
                      {loadState === 'loading'
                        ? '首次连接本机自签证书服务可能需要几秒。'
                        : '最常见原因是自签证书未被信任。先在浏览器里单独打开一次这个地址并选择「高级 → 继续访问」，回来后点右上角重载。'}
                    </p>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-[0.68rem] text-cyan-300 hover:underline"
                      >
                        <ExternalLink size={12} strokeWidth={1.8} aria-hidden="true" />
                        {url}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Center({ children }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">{children}</div>
  );
}
