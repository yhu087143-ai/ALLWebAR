import React, { Suspense } from 'react';
import { Routes, Route, useLocation, Link } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import AppShell from './components/shell/AppShell.jsx';
import StarfieldCanvas from './components/star/StarfieldCanvas.jsx';

const Home = React.lazy(() => import('./pages/Home.jsx'));
const Create = React.lazy(() => import('./pages/Create.jsx'));
const Dashboard = React.lazy(() => import('./pages/Dashboard.jsx'));
const ViewPage = React.lazy(() => import('./pages/ViewPage.jsx'));
const ArchitectureTest = React.lazy(() => import('./pages/ArchitectureTest.jsx'));
const AiDesign = React.lazy(() => import('./pages/AiDesign.jsx'));
const CreateGame = React.lazy(() => import('./pages/CreateGame.jsx'));
const CreateGuide = React.lazy(() => import('./pages/CreateGuide.jsx'));
const PvzGamePage = React.lazy(() => import('./pages/PvzGame.jsx'));
const CreateExperience = React.lazy(() => import('./pages/CreateExperience.jsx'));
const GyroTestPage = React.lazy(() => import('./pages/GyroTestPage.jsx'));
const GuideDemo = React.lazy(() => import('./pages/GuideDemo.jsx'));
const ArShowcase = React.lazy(() => import('./pages/ArShowcase.jsx'));
const PanoDemo = React.lazy(() => import('./pages/PanoDemo.jsx'));
const XrStudio = React.lazy(() => import('./pages/XrStudio.jsx'));
const SubStudio = React.lazy(() => import('./pages/SubStudio.jsx'));

/** 统一的加载态 */
function PageLoading({ full = false }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center ${full ? 'min-h-screen' : 'min-h-[62vh]'}`}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400/25 border-t-violet-300" />
        <span className="text-[0.72rem] tracking-wide text-slate-600">正在装载模块</span>
      </div>
    </div>
  );
}

/** 未匹配路由：给一条明确出路，不留白屏 */
function NotFound() {
  return (
    <div className="mx-auto flex min-h-[62vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <Compass size={26} strokeWidth={1.4} aria-hidden="true" className="text-slate-600" />
      <p className="eyebrow mt-6">404 · 未找到该页面</p>
      <h1 className="font-display text-editorial mt-4 text-slate-100">这里没有内容</h1>
      <p className="mt-4 text-sm leading-relaxed text-slate-500">
        地址可能写错了，或者对应的体验已经被删除。
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link to="/" className="btn-primary">
          <ArrowLeft size={15} strokeWidth={1.9} aria-hidden="true" />
          返回首页
        </Link>
        <Link to="/dashboard" className="btn-ghost">
          打开控制台
        </Link>
      </div>
    </div>
  );
}

/**
 * 页面级错误边界：一个页面崩溃不影响其他页面
 *
 * 全屏 AR 路由（view / guide / guide-demo / ar-showcase / gyro-test / xr-studio）
 * 不套 AppShell —— 它们要独占视口并自行接管摄像头与 HUD 层。
 * xr-studio 同理：三维编辑器需要整屏，且不能被外壳的滚动容器约束。
 */
export default function App() {
  const { pathname } = useLocation();

  /*
   * 全屏路由只有两类，其余一律进 AppShell：
   *   1. /view/:id —— 手机扫码打开的 AR 体验，必须满屏、不能有导航占位
   *   2. /xr-studio —— 3D 编辑器，本身就是一个「应用里的应用」
   *   3. /ar-showcase、/gyro-test —— 根节点就是 fixed inset-0 / 100vw×100vh 的
   *      全屏运行时。它们必须留在这一组：塞进 AppShell 的话，外壳的
   *      <main class="relative z-10"> 会盖在没设 z-index 的全屏层之上，
   *      页脚文案就会从 AR 画面上「透」出来（曾经真的这样了）。
   * 导览演示是普通内容页，留在 AppShell 里，这样从导航点进去导航不会消失。
   */
  const isStandalone =
    pathname.startsWith('/view') ||
    pathname.startsWith('/xr-studio') ||
    pathname.startsWith('/studio') ||
    pathname.startsWith('/ar-showcase') ||
    pathname.startsWith('/pano') ||
    pathname.startsWith('/gyro-test') ||
    pathname.startsWith('/game-pvz');

  if (isStandalone) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoading full />}>
          {/* 全屏路由也铺同一片星空，避免视觉语言在跳转时断裂 */}
          <StarfieldCanvas density={0.5} constellation={false} shootingStars={false} />
          <div className="relative z-10">
            <Routes>
              <Route path="/view/:id" element={<ViewPage />} />
              <Route path="/xr-studio" element={<XrStudio />} />
              <Route path="/studio/:id" element={<SubStudio />} />
              <Route path="/ar-showcase" element={<ArShowcase />} />
              <Route path="/gyro-test" element={<GyroTestPage />} />
              <Route path="/pano" element={<PanoDemo />} />
              <Route path="/game-pvz" element={<PvzGamePage />} />
            </Routes>
          </div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <AppShell>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<ErrorBoundary><Home /></ErrorBoundary>} />
          <Route path="/create/:templateId?" element={<ErrorBoundary><Create /></ErrorBoundary>} />
          <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="/create-game" element={<ErrorBoundary><CreateGame /></ErrorBoundary>} />
          <Route path="/create-guide" element={<ErrorBoundary><CreateGuide /></ErrorBoundary>} />
          <Route path="/create-experience" element={<ErrorBoundary><CreateExperience /></ErrorBoundary>} />
          <Route path="/ai-design" element={<ErrorBoundary><AiDesign /></ErrorBoundary>} />
          <Route path="/test/architecture" element={<ErrorBoundary><ArchitectureTest /></ErrorBoundary>} />
          <Route path="/guide-demo" element={<ErrorBoundary><GuideDemo /></ErrorBoundary>} />
          <Route path="/guide/:id" element={<ErrorBoundary><GuideDemo /></ErrorBoundary>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
