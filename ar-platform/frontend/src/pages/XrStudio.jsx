import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  PanelRightOpen,
  RefreshCw,
  Rocket,
  X,
} from 'lucide-react';

/**
 * XR 创作台
 *
 * 把独立的 XR 引擎编辑器（React 19 + R3F，与本站的 React 18 不兼容）
 * 以 iframe 方式挂在同源子路径下，让「搭场景 → 发布 → 扫码看 AR」在同一个网页里闭环。
 * 引擎目录位置由部署方自行决定（开发时通过 vite proxy 指向它的 dev server）。
 *
 * 为什么用 iframe 而不是直接 import：
 *   XR 引擎是 React 19 + @react-three/fiber v9，本站前端是 React 18.3 且全仓零 R3F。
 *   把它的编辑器组件直接挂进本站 React 树会造成双 React 实例与 R3F 渲染器错乱。
 *   iframe 让两者各自持有自己的 React 运行时，同时在 URL 层面保持同源 ——
 *   编辑器里的 /api/* 请求会经由本站 vite proxy 直达后端，无需 CORS。
 *
 * 两种加载模式：
 *   默认（代理）：iframe → /xr-studio-app/ ，由 vite proxy 转发到 XR引擎 dev server(5174)，支持热更新
 *   ?mode=static：iframe → /xr-studio-static/ ，读取 XR引擎 的构建产物（单进程，可部署）
 */

const PROXY_BASE = '/xr-studio-app/';
/*
 * 静态模式必须显式带 index.html：
 * 目录 URL `/xr-studio-static/` 会被宿主 vite 的 SPA 回退吞掉，返回本站的 index.html，
 * iframe 里再套一个本站（无限套娃），编辑器根本不会加载。
 */
const STATIC_BASE = '/xr-studio-static/index.html';
const READY_TIMEOUT_MS = 12000;

const START_COMMAND = 'npm run dev:embedded';

export default function XrStudio() {
  /*
   * 加载模式：
   *   显式 ?mode=static|proxy 时按参数走；否则自动探测 —— 有静态产物就用静态产物，
   *   没有才回退到 5174 代理。这样「接入 web」只需要跑一个前端进程。
   */
  const modeParam = useMemo(
    () => new URLSearchParams(window.location.search).get('mode'),
    []
  );
  const [engineMode, setEngineMode] = useState(
    modeParam === 'static' || modeParam === 'proxy' ? modeParam : null
  );
  const useStatic = engineMode === 'static';

  const [status, setStatus] = useState('connecting'); // connecting | ready | offline
  const [progress, setProgress] = useState(null);
  const [published, setPublished] = useState([]);
  const [engineInfo, setEngineInfo] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  const iframeRef = useRef(null);

  const iframeSrc = useMemo(
    () =>
      engineMode
        ? `${useStatic ? STATIC_BASE : PROXY_BASE}?host=${encodeURIComponent(window.location.origin)}`
        : 'about:blank',
    [useStatic, engineMode, reloadKey]
  );

  /*
   * 自动选择加载模式。**优先连实时 dev 服务**，静态产物只作兜底。
   *
   * 为什么是这个顺序：静态产物是某一次 build 的快照，会**静默过期** ——
   * 表现就是「明明改了 XR 引擎的源码，创作台里却一点没变」，极难排查
   * （之前就踩过：加了发布面板的新字段却渲染不出来，因为页面悄悄用了旧产物）。
   * dev 服务在跑的时候一定要用 dev 服务，它才代表当前源码。
   *
   * 两个都不能只看状态码：
   *   - dev 服务没起时，宿主 vite 的代理返回 500（可能带一段错误页）
   *   - 静态产物不存在时，宿主 vite 的 SPA 回退返回 200，但内容其实是本站首页
   *     → 那样 iframe 会套娃加载本站自己
   * 所以必须校验返回体的特征串：dev 有 `@vite/client`，静态产物有它的 assets 路径。
   */
  useEffect(() => {
    if (engineMode) return undefined;
    let cancelled = false;
    const decide = async () => {
      try {
        const res = await fetch(PROXY_BASE, { headers: { Accept: 'text/html' } });
        if (res.ok) {
          const html = await res.text();
          if (html.includes('@vite/client')) {
            if (!cancelled) setEngineMode('proxy');
            return;
          }
        }
      } catch {
        /* dev 服务没起，继续尝试静态产物 */
      }

      try {
        const res = await fetch(STATIC_BASE, { headers: { Accept: 'text/html' } });
        const html = res.ok ? await res.text() : '';
        // 静态产物也认不出来时才回退 proxy：让用户看到「怎么把 dev 服务跑起来」的引导
        if (!cancelled) setEngineMode(html.includes('xr-studio-static/assets/') ? 'static' : 'proxy');
      } catch {
        if (!cancelled) setEngineMode('proxy');
      }
    };
    decide();
    return () => {
      cancelled = true;
    };
  }, [engineMode]);

  /* 目标服务未启动时 vite proxy 会返回一段错误页；iframe 与之同源，可以直接嗅探文案。 */
  const sniffProxyError = useCallback(() => {
    try {
      const body = iframeRef.current?.contentDocument?.body?.textContent || '';
      if (/ECONNREFUSED|Proxy error|502 Bad Gateway|ECONNRESET/i.test(body)) {
        setStatus('offline');
        return true;
      }
    } catch {
      /* 跨源或文档尚未就绪，交给超时兜底 */
    }
    return false;
  }, []);

  /* 与编辑器握手：编辑器加载完成后会 postMessage 一条 xr:ready */
  useEffect(() => {
    const onMessage = (event) => {
      // 同源路径下 origin 必然一致；仍做校验，避免其他 iframe / 扩展注入消息
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== 'xr-engine') return;

      switch (data.type) {
        case 'xr:ready':
          setStatus('ready');
          setEngineInfo(data.payload || null);
          break;
        case 'xr:publish:progress':
          setProgress(data.payload?.text || '处理中…');
          break;
        case 'xr:publish:done': {
          const result = data.payload;
          if (result?.id) {
            setPublished((prev) => [result, ...prev.filter((p) => p.id !== result.id)]);
            setDrawerOpen(true);
          }
          setProgress(null);
          break;
        }
        case 'xr:publish:error':
          setProgress(null);
          break;
        default:
          break;
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  /* 迟迟没有握手就判定离线，把「怎么把引擎跑起来」直接摆到用户面前 */
  useEffect(() => {
    if (status !== 'connecting' || engineMode === null) return undefined;
    const timer = window.setTimeout(() => {
      setStatus((prev) => (prev === 'connecting' ? 'offline' : prev));
    }, READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [status, reloadKey, engineMode]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const retry = () => {
    setStatus('connecting');
    setProgress(null);
    setReloadKey((n) => n + 1);
  };

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      /* 剪贴板被拒绝时不做提示，用户可手动选中 */
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-ar-deeper text-slate-200"
      /* 自动验证钩子：连接状态与发布条数，供无头浏览器脚本断言 */
      data-xr-status={status}
      data-xr-published={published.length}
    >
      {/* 星空底：两层径向渐变叠加细微的星点噪点，纯 CSS，不引入图片 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(1200px 600px at 12% -10%, rgba(127,119,221,0.20), transparent 60%),' +
            'radial-gradient(900px 500px at 92% 8%, rgba(56,189,248,0.12), transparent 62%),' +
            'radial-gradient(2px 2px at 20% 30%, rgba(255,255,255,0.5), transparent 55%),' +
            'radial-gradient(1px 1px at 68% 18%, rgba(255,255,255,0.4), transparent 55%),' +
            'radial-gradient(1.5px 1.5px at 42% 72%, rgba(255,255,255,0.35), transparent 55%),' +
            'radial-gradient(1px 1px at 84% 64%, rgba(255,255,255,0.35), transparent 55%)',
        }}
      />

      {/* 顶栏 */}
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] bg-black/30 px-4 backdrop-blur-xl">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.75rem] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
        >
          <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" />
          控制台
        </Link>

        <span className="h-4 w-px bg-white/10" />

        <div className="flex items-baseline gap-2">
          <h1 className="font-display text-[0.95rem] tracking-tight text-slate-100">XR 创作台</h1>
          <span className="hidden text-[0.7rem] text-slate-500 sm:inline">
            搭场景 · 一键发布 · 扫码看 AR
          </span>
        </div>

        <StatusPill status={status} progress={progress} />

        {/*
          明确标出当前跑的是源码还是构建快照。
          静态产物会静默过期，把模式摆在明面上可以避免
          「改了源码却没变化」这种极难排查的误会。
        */}
        <span
          className={`ml-1 hidden rounded-full border px-2 py-1 text-[0.66rem] sm:inline-flex ${
            useStatic
              ? 'border-amber-400/25 bg-amber-400/10 text-amber-300'
              : 'border-white/10 bg-white/5 text-slate-400'
          }`}
          title={
            useStatic
              ? '当前用 XR 引擎的构建产物，源码改动不会自动生效，需重新构建'
              : '当前连的是 XR 引擎 dev 服务，源码改动实时生效'
          }
        >
          {useStatic ? '构建快照' : '实时源码'}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <IconButton title="重新加载编辑器" onClick={retry}>
            <RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" />
          </IconButton>
          <IconButton
            title={isFullscreen ? '退出全屏' : '进入全屏'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Minimize2 size={15} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <Maximize2 size={15} strokeWidth={1.8} aria-hidden="true" />
            )}
          </IconButton>
          <IconButton
            title="已发布的 AR 体验"
            active={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
          >
            <PanelRightOpen size={15} strokeWidth={1.8} aria-hidden="true" />
            {published.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-violet-400 px-1 text-[0.6rem] font-semibold text-slate-950">
                {published.length}
              </span>
            )}
          </IconButton>
        </div>
      </header>

      {/* 编辑器舞台 */}
      <main className="relative z-10 flex-1">
        {engineMode !== null && (
        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={iframeSrc}
          title="XR 引擎编辑器"
          className="h-full w-full border-0 bg-ar-deeper"
          allow="camera; microphone; clipboard-write; fullscreen; xr-spatial-tracking"
          onLoad={() => sniffProxyError()}
        />
        )}

        {status !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center bg-ar-deeper/85 backdrop-blur-sm">
            {status === 'connecting' ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2
                  size={22}
                  strokeWidth={1.6}
                  className="animate-spin text-violet-300"
                  aria-hidden="true"
                />
                <p className="text-[0.78rem] tracking-wide text-slate-500">正在连接 XR 引擎</p>
              </div>
            ) : (
              <OfflineCard
                useStatic={useStatic}
                copied={copiedKey === 'cmd'}
                onCopy={() => copyText(START_COMMAND, 'cmd')}
                onRetry={retry}
              />
            )}
          </div>
        )}
      </main>

      {drawerOpen && (
        <PublishedDrawer
          items={published}
          engineInfo={engineInfo}
          copiedKey={copiedKey}
          onCopy={copyText}
          onClear={() => setPublished([])}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 局部组件 */

function IconButton({ children, title, onClick, active = false }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`relative inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
        active
          ? 'border-violet-400/40 bg-violet-400/15 text-violet-200'
          : 'border-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

function StatusPill({ status, progress }) {
  if (status === 'ready' && !progress) {
    return (
      <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[0.68rem] text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        引擎已就绪
      </span>
    );
  }
  if (progress) {
    return (
      <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-400/10 px-2.5 py-1 text-[0.68rem] text-violet-200">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-300" />
        {progress}
      </span>
    );
  }
  if (status === 'offline') {
    return (
      <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[0.68rem] text-amber-300">
        <AlertTriangle size={11} strokeWidth={2} aria-hidden="true" />
        未连接
      </span>
    );
  }
  return (
    <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.68rem] text-slate-400">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-500" />
      连接中
    </span>
  );
}

function OfflineCard({ useStatic, copied, onCopy, onRetry }) {
  return (
    <div className="w-full max-w-[30rem] rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-md">
      <div className="flex items-center gap-2 text-amber-300">
        <AlertTriangle size={16} strokeWidth={1.9} aria-hidden="true" />
        <h2 className="text-[0.9rem] text-slate-100">没有连上 XR 引擎</h2>
      </div>

      {useStatic ? (
        <p className="mt-3 text-[0.78rem] leading-relaxed text-slate-400">
          没有找到静态产物。先在 XR 引擎仓库里构建一次：
          <CodeLine text="npm run build:embedded" />
          产物会同步到 <code className="text-slate-300">frontend/public/xr-studio-static/</code>，
          刷新本页即可。
        </p>
      ) : (
        <>
          <p className="mt-3 text-[0.78rem] leading-relaxed text-slate-400">
            编辑器是独立的开发服务，需要单独启动。在 XR 引擎仓库目录下执行：
          </p>
          <button
            type="button"
            onClick={onCopy}
            className="group mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-left transition-colors hover:border-violet-400/30"
          >
            <code className="font-mono text-[0.78rem] text-violet-200">&lt;引擎目录&gt; &amp;&amp; {START_COMMAND}</code>
            {copied ? (
              <Check size={14} strokeWidth={2} className="shrink-0 text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy
                size={14}
                strokeWidth={1.8}
                className="shrink-0 text-slate-500 group-hover:text-slate-300"
                aria-hidden="true"
              />
            )}
          </button>
          <p className="mt-3 text-[0.72rem] leading-relaxed text-slate-500">
            它会以 <code className="text-slate-400">/xr-studio-app/</code> 为基路径启动在 5174 端口，
            由本站反向代理到同源路径下，因此编辑器里的发布请求不需要额外配置跨域。
          </p>
        </>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md border border-violet-400/40 bg-violet-500/20 px-3 py-1.5 text-[0.75rem] text-violet-100 transition-colors hover:bg-violet-500/30"
        >
          <RefreshCw size={13} strokeWidth={1.9} aria-hidden="true" />
          重试
        </button>
        <Link
          to={useStatic ? '/xr-studio' : '/xr-studio?mode=static'}
          className="rounded-md border border-white/10 px-3 py-1.5 text-[0.75rem] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
        >
          {useStatic ? '改用开发服务模式' : '改用静态产物模式'}
        </Link>
      </div>
    </div>
  );
}

function CodeLine({ text }) {
  return (
    <span className="mt-2 block rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[0.78rem] text-violet-200">
      {text}
    </span>
  );
}

function PublishedDrawer({ items, engineInfo, copiedKey, onCopy, onClear, onClose }) {
  return (
    <aside className="absolute right-0 top-14 z-30 flex h-[calc(100vh-3.5rem)] w-[22rem] max-w-[92vw] flex-col border-l border-white/[0.08] bg-ar-dark/95 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
        <div>
          <h2 className="text-[0.85rem] text-slate-100">已发布的 AR 体验</h2>
          <p className="mt-0.5 text-[0.68rem] text-slate-500">
            {items.length > 0 ? `${items.length} 条 · 扫码即可在手机上打开` : '还没有发布记录'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-md px-2 py-1 text-[0.7rem] text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
            >
              清空
            </button>
          )}
          <button
            type="button"
            aria-label="关闭"
            title="关闭"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            <X size={14} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {items.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <Rocket size={22} strokeWidth={1.4} className="text-slate-600" aria-hidden="true" />
            <p className="text-[0.75rem] leading-relaxed text-slate-500">
              在编辑器里搭好场景后，点顶栏的
              <span className="mx-1 text-slate-300">发布到 AR 平台</span>
              即可在这里拿到链接与二维码。
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 transition-colors hover:border-violet-400/25"
              >
                <div className="flex items-start gap-3">
                  {item.qrCode && (
                    <img
                      src={item.qrCode}
                      alt="AR 体验二维码"
                      width={72}
                      height={72}
                      className="shrink-0 rounded-md bg-white p-1"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.78rem] text-slate-200">AR 体验</p>
                    <p className="mt-1 break-all font-mono text-[0.66rem] leading-relaxed text-slate-500">
                      {item.fullUrl}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onCopy(item.fullUrl, item.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[0.7rem] text-slate-300 transition-colors hover:bg-white/5"
                  >
                    {copiedKey === item.id ? (
                      <Check size={12} strokeWidth={2} className="text-emerald-400" aria-hidden="true" />
                    ) : (
                      <Copy size={12} strokeWidth={1.8} aria-hidden="true" />
                    )}
                    {copiedKey === item.id ? '已复制' : '复制链接'}
                  </button>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[0.7rem] text-violet-100 transition-colors hover:bg-violet-500/25"
                  >
                    <ExternalLink size={12} strokeWidth={1.8} aria-hidden="true" />
                    打开体验
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {engineInfo && (
        <div className="border-t border-white/[0.07] px-4 py-3">
          <p className="font-mono text-[0.66rem] leading-relaxed text-slate-600">
            引擎 {engineInfo.embedded ? '已嵌入' : '独立'} · 场景「{engineInfo.projectName || '未命名'}」
          </p>
        </div>
      )}
    </aside>
  );
}
