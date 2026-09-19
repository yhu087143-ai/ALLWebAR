import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  initMindAR, preloadMindAR, GuideEngine, GuideHUD,
  checkWebXRSupport, instantiateEngine, EngineType,
} from '@ar-platform/engine';
import {
  ArrowLeft, Camera, Layers, Play, Pause, RotateCcw, SkipForward,
  SkipBack, ScanLine, CheckCircle2, Sparkles, Download, Info, X,
  Loader2, AlertCircle, Box, Crosshair, Move3d, ZoomIn,
  ChevronRight, Home,
} from 'lucide-react';
import SemanticIcon from '../components/icons/SemanticIcon.jsx';
import {
  TOUR_THEMES, getTheme, buildGuideRoute, buildPathPoints, BOARD_SIZE,
} from '../guide-demo/tourData.js';
import { createTourScene } from '../guide-demo/TourScene.js';
import ManualPositionProvider from '../guide-demo/ManualPositionProvider.js';
import { buildThemeFromPublishedGuide } from '../guide-demo/publishedTour.js';
import { fetchArExperience } from '../api/client.js';
import { toSecureUrl } from '../utils.js';

/** 导览卡（图片追踪目标）—— 与 /targets/tour-card.mind 成对编译 */
const TARGET_IMAGE = '/targets/tour-card.jpg';
const TARGET_MIND = '/targets/tour-card.mind';

/** 虚拟游客步行速度（米/秒，场景尺度） */
const WALK_SPEED = 1.75;
/** 展位驻足时长倍率（把 POI 的 duration 秒缩放成演示用时长） */
const DWELL_SCALE = 1.0;

/**
 * WebXR「放置模式」的默认缩放。
 * 沙盘底板 BOARD_SIZE = 7.6（米），直接投放到真实场景会占满整个房间；
 * 缩到约 0.76 米宽（≈ 一张桌面沙盘）最自然。
 */
const PLACE_SCALE_DEFAULT = 0.76 / BOARD_SIZE;
const PLACE_SCALE_MIN = 0.04;
const PLACE_SCALE_MAX = 0.30;

/** 预计算闭合路径的弧长表，用于按距离取点 */
function buildArcTable(points) {
  const cum = [0];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.z - a.z);
    cum.push(total);
  }
  return { cum, total };
}

function pointAt(points, table, s) {
  const total = table.total || 1;
  let d = ((s % total) + total) % total;
  let i = 0;
  while (i < points.length && table.cum[i + 1] < d) i++;
  const a = points[i % points.length];
  const b = points[(i + 1) % points.length];
  const segLen = table.cum[i + 1] - table.cum[i] || 1;
  const t = (d - table.cum[i]) / segLen;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** 统一把任意错误转成可读文案（MindAR 有时会 reject 空值） */
function msgOf(err) {
  if (!err) return '未知错误（未获取到错误详情）';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name || '未知错误';
  return err.message || String(err);
}

/** 摄像头权限预检：给出可操作的失败原因，避免只报 "undefined" */
async function ensureCamera() {
  if (!window.isSecureContext) {
    throw new Error(
      `当前页面不是安全上下文（${location.protocol}//${location.host}），摄像头仅在 HTTPS 下可用。` +
      `请改用 ${toSecureUrl(window.location.href)} 打开（npm run dev 默认 https:5180；` +
      '若设了 AR_HTTPS=0 请去掉后重启）'
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('当前浏览器不支持摄像头采集（navigator.mediaDevices 不可用）');
  }
  let probe = null;
  try {
    probe = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }, audio: false,
    });
  } catch (e) {
    const name = e?.name || '';
    const table = {
      NotAllowedError: '摄像头权限被拒绝，请在浏览器地址栏允许摄像头访问后重试',
      PermissionDeniedError: '摄像头权限被拒绝，请在浏览器设置中允许后重试',
      NotFoundError: '未检测到可用摄像头，请确认设备已连接摄像头',
      DevicesNotFoundError: '未检测到可用摄像头',
      NotReadableError: '摄像头被其它程序占用，请关闭占用程序后重试',
      TrackStartError: '摄像头无法启动，可能被其它程序占用',
      OverconstrainedError: '摄像头不支持所需参数',
      SecurityError: '安全策略阻止了摄像头访问',
    };
    throw new Error(table[name] || `无法访问摄像头（${name || msgOf(e)}）`);
  } finally {
    probe?.getTracks?.().forEach((t) => t.stop());
  }
}

export default function GuideDemo() {
  // 路由 /guide/:id → 加载「已发布导览」；路由 /guide-demo → 使用内置演示主题
  const { id: publishedId } = useParams();

  const [themeId, setThemeId] = useState(TOUR_THEMES[0].id);
  const [mode, setMode] = useState(null);            // null | 'ar' | 'ar-place' | 'sandbox'
  const [phase, setPhase] = useState('idle');        // idle | starting | running | error
  const [error, setError] = useState('');
  const [narration, setNarration] = useState(null);  // 当前讲解
  const [tracking, setTracking] = useState(false);   // AR 是否识别到卡片
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, visited: 0 });
  const [done, setDone] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [showCardFull, setShowCardFull] = useState(false);
  const [qr, setQr] = useState('');
  const [activePoi, setActivePoi] = useState(null);

  // ── 已发布导览的加载状态 ──
  const [publishedTheme, setPublishedTheme] = useState(null);
  const [pubState, setPubState] = useState(publishedId ? 'loading' : 'none');
  const [pubError, setPubError] = useState('');

  // ── WebXR 无卡片「放置模式」──
  const [xrSupported, setXrSupported] = useState(null);  // null = 检测中
  const [placed, setPlaced] = useState(false);           // 是否已放置到真实平面
  const [placeScale, setPlaceScale] = useState(PLACE_SCALE_DEFAULT);

  const mountRef = useRef(null);
  const stageRef = useRef(null);          // AR 舞台外层：作为 dom-overlay 根节点
  const placeWrapperRef = useRef(null);   // 放置内容的外层组（用于缩放）
  const placeScaleRef = useRef(PLACE_SCALE_DEFAULT);
  const ctxRef = useRef(null);       // 运行时上下文（引擎/HUD/场景/渲染器）
  const rafRef = useRef(0);
  const walkerRef = useRef({ s: 0, dwell: 0 });
  const pausedRef = useRef(false);   // 帧循环读取，避免闭包过期

  // ── WebXR 能力探测（挂载时探一次）──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ok = await checkWebXRSupport();
        if (!cancelled) setXrSupported(ok);
      } catch {
        if (!cancelled) setXrSupported(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 缩放变化同步到已放置的沙盘
  useEffect(() => {
    placeScaleRef.current = placeScale;
    const w = placeWrapperRef.current;
    if (w) w.scale.setScalar(placeScale);
  }, [placeScale]);

  // ───────────────── 加载已发布导览 ─────────────────
  useEffect(() => {
    if (!publishedId) { setPubState('none'); setPublishedTheme(null); return undefined; }
    let cancelled = false;
    setPubState('loading');
    setPubError('');
    (async () => {
      try {
        const data = await fetchArExperience(publishedId);
        const guide = data?.unifiedConfig?.guide;
        const built = buildThemeFromPublishedGuide(guide, { title: data?.title });
        if (cancelled) return;
        if (!built) {
          setPubError('该体验没有可用的导览路线（缺少 config.unifiedConfig.guide 或 POI 为空）。');
          setPubState('error');
          return;
        }
        setPublishedTheme(built);
        setPubState('ready');
      } catch (e) {
        if (cancelled) return;
        setPubError(e?.message || '加载导览失败，请确认后端服务已启动。');
        setPubState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [publishedId]);

  const theme = useMemo(
    () => publishedTheme || getTheme(themeId),
    [publishedTheme, themeId],
  );
  const route = useMemo(() => buildGuideRoute(theme), [theme]);
  const pathPts = useMemo(() => buildPathPoints(theme), [theme]);
  const arcTable = useMemo(() => buildArcTable(pathPts), [pathPts]);
  const metaById = useMemo(() => {
    const m = new Map();
    theme.pois.forEach((p) => m.set(p.id, p));
    return m;
  }, [theme]);

  // ─────────── 预加载 MindAR（AR 启动慢的主因：2.5MB 引擎 + 320KB 追踪文件） ───────────
  // 在准备区停留 1.2s 后静默预热，用户点「AR 实景导览」时就不用白等下载。
  // 注意：mind-ar 只安装在 ar-engine 内，必须经由引擎导出的 preloadMindAR 预热，
  // 前端直接 import('mind-ar/...') 会让 Vite 解析失败并导致整页崩掉。
  useEffect(() => {
    if (mode !== null) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      try {
        await preloadMindAR('image');
      } catch { /* 预热失败不影响主流程 */ }
      if (cancelled) return;
      try {
        // 预热追踪文件，走 HTTP 缓存
        await fetch(TARGET_MIND, { cache: 'force-cache' });
      } catch { /* 同上 */ }
    }, 1200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [mode]);

  // ─────────── 启动阶段计时（给用户"还在跑，没卡死"的反馈） ───────────
  const [startElapsed, setStartElapsed] = useState(0);
  useEffect(() => {
    if (phase !== 'starting') { setStartElapsed(0); return undefined; }
    const t0 = Date.now();
    const id = setInterval(() => setStartElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // ─────────────────────────── 二维码（手机扫码打开） ───────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import('qrcode')).default;
        const url = `${window.location.origin}/guide-demo`;
        const data = await QRCode.toDataURL(url, {
          margin: 1, width: 220,
          color: { dark: '#111633', light: '#e8ecff' },
        });
        if (!cancelled) setQr(data);
      } catch { /* 二维码失败不影响主流程 */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─────────────────────────── 清理运行时 ───────────────────────────
  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (!ctx) return;

    try { ctx.engine?.stop(); } catch { /* noop */ }
    try { ctx.hud?.dispose(); } catch { /* noop */ }
    try { ctx.controls?.dispose(); } catch { /* noop */ }
    try { ctx.mindar?.stop(); } catch { /* noop */ }
    try { ctx.xrAdapter?.stop(); } catch { /* noop */ }
    try { ctx.renderer?.setAnimationLoop?.(null); } catch { /* noop */ }
    try { ctx.tour?.dispose(); } catch { /* noop */ }
    try { ctx.renderer?.dispose?.(); } catch { /* noop */ }
    placeWrapperRef.current = null;

    // MindAR 会把 video / canvas 注入容器，统一清空
    const el = mountRef.current;
    if (el) el.innerHTML = '';

    walkerRef.current = { s: 0, dwell: 0 };
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  // ─────────────────────────── 导览控制 ───────────────────────────
  const teleportTo = useCallback((poiId) => {
    const idx = theme.pois.findIndex((p) => p.id === poiId);
    if (idx < 0) return;
    walkerRef.current.s = arcTable.cum[idx * 14] || 0;
    walkerRef.current.dwell = 0;
  }, [theme, arcTable]);

  const restart = useCallback(() => {
    setDone(false);
    setNarration(null);
    const ctx = ctxRef.current;
    ctx?.tour?.resetProgress();
    ctx?.hud?.dispose();
    ctx?.hud?.create();
    walkerRef.current = { s: 0, dwell: 0 };
    if (ctx?.engine) {
      ctx.engine.stop();
      ctx.engine.start();
    }
    setPaused(false);
  }, []);

  // ─────────────────────────── 启动 ───────────────────────────
  const start = useCallback(async (selectedMode) => {
    setError('');
    setPhase('starting');
    setMode(selectedMode);
    setDone(false);
    setNarration(null);
    setTracking(false);
    setPaused(false);
    setPlaced(false);
    walkerRef.current = { s: 0, dwell: 0 };

    // 等 DOM 挂载
    await new Promise((r) => setTimeout(r, 60));
    const container = mountRef.current;
    if (!container) { setPhase('error'); setError('容器未就绪，请重试'); return; }

    try {
      let renderer;
      let camera;
      let scene;
      let mindar = null;
      let controls = null;
      let xrAdapter = null;

      if (selectedMode === 'ar') {
        await ensureCamera();
        mindar = await initMindAR(container, TARGET_MIND, 'image', {
          filterMinCF: 0.0005, filterBeta: 80, missTolerance: 25, warmupTolerance: 8,
        });
        renderer = mindar.renderer;
        scene = mindar.scene;
        camera = mindar.camera;
        await mindar.start();
      } else if (selectedMode === 'ar-place') {
        // ── WebXR 无卡片放置模式 ──
        // 先做能力检测，给出可操作的失败原因（iOS Safari 完全不支持 WebXR AR）
        const ok = await checkWebXRSupport();
        if (!ok) {
          throw new Error(
            '当前设备或浏览器不支持 WebXR「immersive-ar」会话，无法使用放置模式。'
            + '需要 Android + Chrome + ARCore（iOS Safari 不支持 WebXR）。'
            + '可改用「AR 实景导览」（扫导览卡）或「沙盘演示」。',
          );
        }
        xrAdapter = instantiateEngine(EngineType.WebXR);
        await xrAdapter.initialize(container, {
          id: 'guide-xr-placement',
          type: 'guide',
          meta: { title: theme.name, version: '1.0' },
          world: { engine: EngineType.WebXR, tracking: 'plane', capabilities: [] },
          rules: [],
          hud: { components: [] },
        });
        // dom-overlay：没有它，AR 期间 HUD 与按钮会被浏览器隐藏
        xrAdapter.setDomOverlayRoot(stageRef.current || container);
        // 注入导览沙盘作为「点击放置」的内容
        xrAdapter.setPlacementContent((parent) => {
          const wrapper = new THREE.Group();
          wrapper.scale.setScalar(placeScaleRef.current);
          wrapper.position.y = 0.005;           // 轻微抬起，避免与真实平面 z-fighting
          wrapper.add(tour.group);
          parent.add(wrapper);
          placeWrapperRef.current = wrapper;
        });
        xrAdapter.onPlaced = () => setPlaced(true);

        await xrAdapter.start();
        renderer = xrAdapter.renderer;
        scene = xrAdapter.scene;
        camera = xrAdapter.camera;
      } else {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(renderer.domElement);

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(
          48, container.clientWidth / container.clientHeight, 0.1, 200,
        );
      }

      // ── 构建导览沙盘 ──
      const tour = createTourScene(theme);

      if (selectedMode === 'ar') {
        // MindAR：目标图平面宽 1 单位，位于 XY 平面。
        // 把 XZ 沙盘旋到卡片平面并缩小到卡片宽度的 ~72%，形成「卡片上的微缩沙盘」，
        // 同时沿卡片法线抬起一点，避免与卡片本身发生 z-fighting。
        const anchor = mindar.addAnchor(0);
        const arRoot = new THREE.Group();
        arRoot.rotation.x = Math.PI / 2;
        arRoot.scale.setScalar(0.72 / BOARD_SIZE);
        arRoot.position.set(0, 0, 0.02);
        arRoot.add(tour.group);
        anchor.group.add(arRoot);

        anchor.onTargetFound = () => setTracking(true);
        anchor.onTargetLost = () => setTracking(false);
      } else if (selectedMode === 'ar-place') {
        // 沙盘不预先加入场景：等用户在真实平面上点击后，
        // 再由上面注册的 placement factory 挂到 WebXR 的放置点上。
      } else {
        scene.add(tour.group);
        tour.setScale(1);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 3.4;
        controls.maxDistance = 16;
        controls.maxPolarAngle = Math.PI * 0.47;
        controls.target.set(0, 0.45, 0);
        camera.position.set(0, 6.9, 8.0);
        controls.update();
      }

      // ── 导览引擎 + HUD + 位置提供器 ──
      const engine = new GuideEngine(route);
      const provider = new ManualPositionProvider({ name: 'manual', fps: 40 });
      engine.setPositionProvider(provider);

      const hud = new GuideHUD(container);
      hud.create();
      hud.showInfoCard();

      engine.on('poiEnter', (poi) => {
        const meta = metaById.get(poi.id);
        setNarration(meta || { name: poi.name, narration: poi.description });
        walkerRef.current.dwell = Math.max((meta?.duration || 2) * DWELL_SCALE, 1.2);
        tour.markVisited(poi.id);
        setActivePoi(poi.id);
        // POI 动作 → 便于外部扩展（音效 / 外链）
        if (poi.onEnter?.type === 'show_message') {
          console.log(`[GuideDemo] 讲解: ${poi.name} — ${poi.onEnter.message}`);
        }
      });

      engine.on('poiExit', (poi) => {
        console.log(`[GuideDemo] 离开: ${poi.name}`);
      });

      engine.on('positionUpdate', () => {
        const cur = engine.currentPOI;
        const dist = cur ? engine.distanceToPOI(cur) : Infinity;
        const visitedIds = new Set(engine.pois.filter((p) => engine.isVisited(p.id)).map((p) => p.id));
        hud.update(engine.pois, cur, dist, engine.progress, visitedIds);

        // 位置流按 40Hz 推送，这里做去重以免每帧触发 React 重渲染
        const pr = engine.progress;
        setProgress((prev) => (
          prev.current === pr.current && prev.total === pr.total && prev.visited === pr.visited
            ? prev
            : { current: pr.current, total: pr.total, visited: pr.visited }
        ));

        if (cur) {
          tour.setActive(cur.id);
          setActivePoi((prev) => (prev === cur.id ? prev : cur.id));
          // 方向箭头：指向当前目标 POI（场景方位角）
          const sp = cur.position.scenePosition;
          const up = provider.position;
          if (sp && up) {
            const deg = THREE.MathUtils.radToDeg(Math.atan2(sp[0] - up.x, sp[2] - up.z));
            hud.setHeading(deg);
          }
        }
      });

      engine.on('guideComplete', () => {
        hud.showCelebration();
        setDone(true);
      });

      ctxRef.current = { engine, hud, provider, tour, renderer, mindar, scene, camera, controls, xrAdapter };
      // 调试钩子：便于在控制台/自动化中检查场景状态
      if (import.meta.env.DEV) window.__guideDemo = ctxRef.current;

      // ── 每帧推进（不负责渲染，渲染交给各自的渲染器）──
      const visitor = provider;

      const tick = (dt) => {
        // 虚拟游客沿路径前进（暂停时只更新视觉）
        if (!pausedRef.current) {
          const w = walkerRef.current;
          if (w.dwell > 0) {
            w.dwell -= dt;
          } else {
            w.s += WALK_SPEED * dt;
            if (w.s >= arcTable.total) w.s -= arcTable.total;
          }
          const p = pointAt(pathPts, arcTable, w.s);
          const ahead = pointAt(pathPts, arcTable, w.s + 0.3);
          const heading = Math.atan2(ahead.x - p.x, ahead.z - p.z);
          visitor.setPosition(p.x, 0, p.z, heading);
          tour.setVisitor(p.x, p.z, heading);
        } else {
          const p = visitor.position;
          tour.setVisitor(p.x, p.z, p.heading);
        }

        tour.update(dt);
      };

      if (selectedMode === 'ar-place') {
        // WebXR 模式下 three 的 setAnimationLoop 由 XR 会话驱动，
        // 渲染也在适配器内部完成，这里只挂载「每帧推进」。
        xrAdapter.onFrame = (dt) => tick(dt);
      } else {
        const clock = new THREE.Clock();
        const frame = () => {
          rafRef.current = requestAnimationFrame(frame);
          const dt = Math.min(clock.getDelta(), 0.05);
          tick(dt);
          ctxRef.current?.controls?.update();
          renderer.render(scene, camera);
        };
        rafRef.current = requestAnimationFrame(frame);
      }

      engine.start();
      setPhase('running');
    } catch (err) {
      console.error('[GuideDemo] 启动失败:', err);
      setPhase('error');
      setError(
        selectedMode === 'ar'
          ? `${msgOf(err)}。AR 模式需要 HTTPS + 摄像头权限；若无法开启，可改用「沙盘演示」或「AR 放置模式」。`
          : selectedMode === 'ar-place'
            ? `${msgOf(err)}`
            : `沙盘启动失败：${msgOf(err)}`,
      );
      teardown();
    }
  }, [theme, route, pathPts, arcTable, metaById, teardown]);

  // 暂停状态用 ref 同步给帧循环（避免重建闭包）
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const exit = useCallback(() => {
    teardown();
    setMode(null);
    setPhase('idle');
    setTracking(false);
    setProgress({ current: 0, total: 0, visited: 0 });
    setNarration(null);
    setDone(false);
    setError('');
    setPlaced(false);
  }, [teardown]);

  // ─────────────────────────── 渲染 ───────────────────────────
  const activeTheme = theme;
  const visitedCount = progress.visited || 0;
  const ready = publishedId ? pubState === 'ready' : true;

  return (
    <div className="page-wrap page-wrap-narrow page-body pb-16">
      <div className="w-full">
        {/* 面包屑 */}
        <nav aria-label="面包屑" className="crumb">
          <Home size={12} strokeWidth={1.7} aria-hidden="true" />
          <Link to="/">首页</Link>
          <ChevronRight size={11} strokeWidth={2} aria-hidden="true" className="crumb-sep" />
          <span aria-current="page">AR 导览演示</span>
        </nav>

        {/* 页头 */}
        <header className="page-head mt-7">
          <div className="flex items-start gap-4">
            <button
              onClick={exit}
              aria-label="返回"
              className="icon-tile icon-tile-lg mt-0.5"
            >
              <ArrowLeft size={18} strokeWidth={1.7} aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="page-title">AR 导览演示</h1>
                <span className="badge badge-ok">可离线演示</span>
              </div>
              <p className="page-sub">
                引擎驱动的 POI 导览：进入触发半径自动讲解 · 路线进度 · 完成庆祝
              </p>
            </div>
          </div>
          <div className="page-rule" />
        </header>

        {/* ══════════ 准备区 ══════════ */}
        {phase === 'idle' && (
          <div className="space-y-6">
            {/* 主题选择（仅内置演示主题时显示） */}
            {!publishedId && (
              <div className="glass-card rounded-xl">
                <div className="p-5">
                  <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <Layers size={15} className="text-violet-400" /> 1. 选择导览主题
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {TOUR_THEMES.map((t) => {
                      const on = t.id === themeId;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setThemeId(t.id)}
                          className={`text-left p-4 rounded-xl border transition-all ${on
                            ? 'bg-violet-500/10 border-violet-500/40'
                            : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]'}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-100">{t.name}</span>
                            {on && <CheckCircle2 size={16} className="text-violet-400" />}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{t.subtitle}</div>
                          <p className="text-xs text-slate-500 mt-2 leading-relaxed">{t.description}</p>
                          <div className="flex flex-wrap gap-1 mt-3">
                            {t.pois.map((p) => (
                              <span key={p.id} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400">
                                <SemanticIcon name={p.icon} size={11} className="shrink-0 text-slate-500" />
                                {p.name.split(' · ').pop()}
                              </span>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 已发布导览：加载中 */}
            {publishedId && pubState === 'loading' && (
              <div className="glass-card rounded-xl">
                <div className="p-8 flex flex-col items-center gap-3">
                  <Loader2 size={22} className="text-violet-400 animate-spin" />
                  <p className="text-sm text-slate-300">正在加载已发布的导览…</p>
                  <p className="text-xs text-slate-500">导览 ID：{publishedId}</p>
                </div>
              </div>
            )}

            {/* 已发布导览：加载失败 */}
            {publishedId && pubState === 'error' && (
              <div className="glass-card rounded-xl border border-rose-500/20">
                <div className="p-6 flex items-start gap-3">
                  <AlertCircle size={18} className="text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-rose-300">导览加载失败</p>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{pubError}</p>
                    <div className="flex gap-2 mt-4">
                      <Link
                        to="/guide-demo"
                        className="px-3 py-2 rounded-lg text-xs bg-violet-500/15 text-violet-300 border border-violet-500/25 hover:bg-violet-500/25 transition-all"
                      >
                        改用内置演示
                      </Link>
                      <button
                        onClick={() => window.location.reload()}
                        className="px-3 py-2 rounded-lg text-xs bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 transition-all"
                      >
                        重试
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 已发布导览：概要 */}
            {publishedId && pubState === 'ready' && (
              <div className="glass-card rounded-xl">
                <div className="p-5">
                  <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <Layers size={15} className="text-emerald-400" /> 1. 已发布导览
                  </h2>
                  <div className="p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06]">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-100">{activeTheme.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        已发布
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{activeTheme.subtitle}</div>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">{activeTheme.description}</p>
                    <div className="flex flex-wrap gap-1 mt-3">
                      {activeTheme.pois.map((p) => (
                        <span key={p.id} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400">
                          <SemanticIcon name={p.icon} size={11} className="shrink-0 text-slate-500" />
                          {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 模式选择 */}
            {ready && (
            <div className="glass-card rounded-xl">
              <div className="p-5">
                <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                  <Camera size={15} className="text-violet-400" /> 2. 选择演示模式
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    data-testid="mode-ar-place"
                    onClick={() => start('ar-place')}
                    className="group text-left p-4 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06]
                      hover:bg-cyan-500/[0.12] hover:border-cyan-500/45 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <Box size={18} className="text-cyan-400" />
                      <span className="text-sm font-semibold text-cyan-300">AR 放置模式（无需卡片）</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      扫描桌面 / 地面，点一下就把整座导览沙盘放到真实平面上，可缩放、可重放。
                      不用打印任何卡片。
                    </p>
                    <span className={`inline-flex items-center gap-1 text-[11px] mt-3 ${
                      xrSupported === false ? 'text-amber-400' : 'text-cyan-400'}`}>
                      <Crosshair size={12} />
                      {xrSupported === null && '检测设备能力中…'}
                      {xrSupported === true && 'WebXR · 命中检测 · 本机支持'}
                      {xrSupported === false && 'WebXR 不可用（需 Android Chrome + ARCore）'}
                    </span>
                  </button>

                  <button
                    data-testid="mode-ar"
                    onClick={() => start('ar')}
                    className="group text-left p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06]
                      hover:bg-emerald-500/[0.12] hover:border-emerald-500/45 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <Camera size={18} className="text-emerald-400" />
                      <span className="text-sm font-semibold text-emerald-300">AR 实景导览</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      开启摄像头扫描导览卡，导览沙盘浮现在卡片上，边看边听讲解。
                      需 HTTPS + 摄像头权限，手机与桌面（对摄像头出示导览卡）均可。
                    </p>
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 mt-3">
                      <ScanLine size={12} /> 图片追踪 · MindAR
                    </span>
                  </button>

                  <button
                    data-testid="mode-sandbox"
                    onClick={() => start('sandbox')}
                    className="group text-left p-4 rounded-xl border border-violet-500/25 bg-violet-500/[0.06]
                      hover:bg-violet-500/[0.12] hover:border-violet-500/45 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <Layers size={18} className="text-violet-400" />
                      <span className="text-sm font-semibold text-violet-300">沙盘演示（无需摄像头）</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      纯三维沙盘，鼠标拖拽旋转、滚轮缩放。虚拟游客沿路线自动巡游并触发讲解，
                      适合会议室、投屏、无摄像头场景。
                    </p>
                    <span className="inline-flex items-center gap-1 text-[11px] text-violet-400 mt-3">
                      <Play size={12} /> 一键自动导览
                    </span>
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setShowCard(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs
                      bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all"
                  >
                    <Download size={13} /> 查看 / 下载导览卡
                  </button>
                  {qr && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.07]">
                      <img src={qr} alt="扫码在手机打开" className="w-10 h-10 rounded" />
                      <span className="text-[11px] text-slate-500 leading-tight">
                        手机扫码<br />打开本演示
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-500/[0.07] border border-violet-500/20">
              <Info size={15} className="text-violet-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400 leading-relaxed">
                三种模式复用同一套导览逻辑（<code className="text-violet-300">GuideEngine</code> +
                <code className="text-violet-300"> GuideHUD</code>，来自 <code className="text-violet-300">@ar-platform/engine</code>）：
                虚拟游客位置变化 → 距离判定 → 进入触发半径 → 自动弹出讲解、更新路线进度、全部完成时庆祝。
              </p>
            </div>

            <Link
              to="/ar-showcase"
              className="flex items-center justify-between p-4 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06]
                hover:bg-cyan-500/[0.12] hover:border-cyan-500/45 transition-all"
            >
              <div className="flex items-start gap-3">
                <Box size={18} className="text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-cyan-300">AR 模型展示（无标记 · 分步引导）</div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    独立的「把 3D 模型放进房间」演示：① 选模型 ② 检测设备 ③ 扫平面 ④ 点一下放置。
                    带完整 WebAR 底层逻辑说明，适合先跑通链路再回到导览。
                  </p>
                </div>
              </div>
              <span className="text-cyan-400 text-xs shrink-0 ml-3">前往 →</span>
            </Link>
          </div>
        )}

        {/* ══════════ 运行区 ══════════ */}
        {phase !== 'idle' && (
          <div className="space-y-4">
            {/* 状态条 */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`px-2.5 py-1 rounded-full border ${
                mode === 'ar'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : mode === 'ar-place'
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                    : 'bg-violet-500/10 text-violet-400 border-violet-500/20'}`}>
                {mode === 'ar' ? 'AR 实景导览' : mode === 'ar-place' ? 'AR 放置模式' : '沙盘演示'}
              </span>
              {mode === 'ar-place' && (
                <span className={`px-2.5 py-1 rounded-full border ${placed
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                  {placed ? '沙盘已放置' : '寻找平面中…'}
                </span>
              )}
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400">
                {activeTheme.name}
              </span>
              {mode === 'ar' && (
                <span className={`px-2.5 py-1 rounded-full border ${tracking
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                  {tracking ? '已识别导览卡' : '扫描导览卡中…'}
                </span>
              )}
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400">
                进度 {progress.current || 0}/{progress.total || activeTheme.pois.length} · 已参观 {visitedCount}
              </span>
              <div className="flex-1" />
              <button
                onClick={exit}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all"
              >
                退出演示
              </button>
            </div>

            {/* 3D / AR 舞台 */}
            <div
              ref={stageRef}
              className={`relative rounded-2xl overflow-hidden border border-white/10 ${mode === 'sandbox' ? 'bg-black/60' : 'bg-black'}`}
              style={{ minHeight: 460 }}
            >
              {/*
                关键：挂载容器必须是独立的层叠上下文（isolation:isolate + z-index:0）。
                原因：MindAR 注入的 <video> 带 `z-index:-2`，若祖先没有层叠上下文，
                负 z-index 会逃逸到根层叠上下文，被外层容器的背景色整块盖住 ——
                表现就是「摄像头已打开、但画面一片全黑」。
              */}
              <div
                ref={mountRef}
                className="relative w-full"
                style={{ height: 460, position: 'relative', isolation: 'isolate', zIndex: 0 }}
              />

              {phase === 'starting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 z-50">
                  <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-slate-400">
                    {mode === 'ar' ? '正在启动摄像头与追踪引擎…' : '正在构建导览沙盘…'}
                    {startElapsed > 0 && ` ${startElapsed}s`}
                  </span>
                  {mode === 'ar' && startElapsed >= 6 && (
                    <span className="text-[11px] text-slate-500 max-w-xs text-center leading-relaxed">
                      首次加载需下载追踪引擎，约 10~30 秒属正常；
                      局域网访问会明显更快。请保持页面在前台。
                    </span>
                  )}
                </div>
              )}

              {phase === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 z-50 px-6 text-center">
                  <X size={26} className="text-rose-400" />
                  <p className="text-sm text-rose-300 max-w-md leading-relaxed">{error}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => start(mode || 'sandbox')}
                      className="px-4 py-2 rounded-lg text-xs bg-white/10 text-slate-200 hover:bg-white/20 transition-all"
                    >
                      重试
                    </button>
                    <button
                      onClick={() => start('sandbox')}
                      className="px-4 py-2 rounded-lg text-xs bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-all"
                    >
                      改用沙盘演示
                    </button>
                  </div>
                </div>
              )}

              {/* AR 引导提示 */}
              {phase === 'running' && mode === 'ar' && !tracking && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full
                  bg-black/65 border border-white/15 text-[11px] text-slate-300 backdrop-blur text-center">
                  把「导览卡」完整放入取景框并保持平稳（没打印？点首页「查看 / 下载导览卡 →全屏」，用手机扫电脑屏幕）
                </div>
              )}

              {/* WebXR 放置模式：放置引导（未放置时） */}
              {phase === 'running' && mode === 'ar-place' && !placed && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 rounded-2xl
                  bg-black/70 border border-cyan-400/30 text-[11px] text-cyan-100 backdrop-blur text-center max-w-[90%]">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Crosshair size={12} className="text-cyan-300" />
                    <span className="font-medium">缓慢移动手机，让准星落在桌面或地面上</span>
                  </div>
                  <span className="text-slate-300">出现准星后，点一下屏幕即可把导览沙盘放上去</span>
                </div>
              )}

              {/* WebXR 放置模式：放置后的控制条（在 AR 中悬浮显示） */}
              {phase === 'running' && mode === 'ar-place' && placed && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-40 w-[min(92%,560px)]
                  px-3 py-2 rounded-2xl bg-black/70 border border-white/15 backdrop-blur-md">
                  <div className="flex items-center gap-3">
                    <ZoomIn size={14} className="text-cyan-300 shrink-0" />
                    <input
                      type="range"
                      min={PLACE_SCALE_MIN}
                      max={PLACE_SCALE_MAX}
                      step={0.005}
                      value={placeScale}
                      onChange={(e) => setPlaceScale(parseFloat(e.target.value))}
                      className="flex-1 accent-cyan-400 h-0.5 rounded-full appearance-none bg-white/15 cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-slate-400 tabular-nums w-10 text-right">
                      {(placeScale * 100).toFixed(1)}%
                    </span>
                    <button
                      onClick={() => {
                        const a = ctxRef.current?.xrAdapter;
                        if (!a) return;
                        placeWrapperRef.current = null;
                        a.clearPlacement();
                        setPlaced(false);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px]
                        bg-white/8 text-slate-200 border border-white/12 hover:bg-white/15 transition-all"
                    >
                      <Move3d size={12} /> 重新放置
                    </button>
                  </div>
                </div>
              )}

              {/* 讲解字幕 */}
              {narration && phase === 'running' && (
                <div className={`absolute left-4 right-4 z-30 mx-auto max-w-2xl
                  px-4 py-3 rounded-2xl bg-black/70 border border-white/12 backdrop-blur-md ${
                    mode === 'ar-place' && placed ? 'bottom-24' : 'bottom-4'}`}>
                  <div className="flex items-start gap-3">
                    <SemanticIcon
                      name={narration.icon || 'pin'}
                      size={22}
                      className="mt-0.5 shrink-0 text-violet-300"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-100">
                        {narration.name}
                        <span className="ml-2 text-[10px] font-normal text-slate-500">{narration.subtitle}</span>
                      </div>
                      <div className="text-xs text-violet-300 mt-1 leading-relaxed">
                        {narration.narration || narration.description}
                      </div>
                    </div>
                    <button
                      onClick={() => setNarration(null)}
                      className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 控制条 */}
            <div className="glass-card rounded-xl">
              <div className="p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setPaused((p) => !p)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                      bg-violet-500/15 text-violet-300 border border-violet-500/25 hover:bg-violet-500/25 transition-all"
                  >
                    {paused ? <><Play size={13} /> 继续巡游</> : <><Pause size={13} /> 暂停巡游</>}
                  </button>
                  <button
                    onClick={restart}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs
                      bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 transition-all"
                  >
                    <RotateCcw size={13} /> 重新导览
                  </button>
                  <button
                    onClick={() => {
                      const e = ctxRef.current?.engine;
                      if (!e) return;
                      if (e.prevPOI()) teleportTo(e.currentPOI.id);
                      else teleportTo(theme.pois[0].id);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs
                      bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 transition-all"
                  >
                    <SkipBack size={13} /> 上一个展位
                  </button>
                  <button
                    onClick={() => {
                      const e = ctxRef.current?.engine;
                      if (!e) return;
                      const n = e.nextPOI();
                      teleportTo((n || theme.pois[theme.pois.length - 1]).id);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs
                      bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 transition-all"
                  >
                    下一个展位 <SkipForward size={13} />
                  </button>
                  {done && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs
                      bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                      <CheckCircle2 size={13} /> 导览已完成
                    </span>
                  )}
                </div>

                {/* POI 列表 */}
                <div>
                  <div className="text-[11px] text-slate-500 mb-2">点击可直接跳转到该展位</div>
                  <div className="flex flex-wrap gap-2">
                    {theme.pois.map((p, i) => {
                      const isActive = activePoi === p.id;
                      const isVisited = progress.visited > 0 &&
                        (ctxRef.current?.engine?.isVisited(p.id) ?? false);
                      return (
                        <button
                          key={p.id}
                          onClick={() => teleportTo(p.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border transition-all ${
                            isActive
                              ? 'bg-violet-500/20 border-violet-500/45 text-violet-200'
                              : isVisited
                                ? 'bg-white/[0.03] border-white/[0.06] text-slate-500'
                                : 'bg-white/[0.04] border-white/[0.09] text-slate-300 hover:bg-white/[0.08]'
                          }`}
                        >
                          <SemanticIcon name={p.icon} size={12} className="shrink-0" />
                          <span className="font-mono text-[10px] opacity-70">{String(i + 1).padStart(2, '0')}</span>
                          <span>{p.name.split(' · ').pop()}</span>
                          {isVisited && !isActive && <CheckCircle2 size={11} className="text-emerald-500/70" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 进度条 */}
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all duration-500"
                    style={{ width: `${(visitedCount / (theme.pois.length || 1)) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 导览卡弹窗 */}
      {showCard && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="glass-card rounded-2xl max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
              <h3 className="text-sm font-semibold text-slate-200">AR 导览卡</h3>
              <button onClick={() => setShowCard(false)} className="text-slate-500 hover:text-slate-300">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <img src={TARGET_IMAGE} alt="导览卡" className="w-full rounded-xl border border-white/10" />
              <p className="text-xs text-slate-400 leading-relaxed">
                把这张卡片显示在另一台设备上、打印出来或贴在展位上，然后在「AR 实景导览」模式下
                用摄像头对准它，即可看到导览沙盘浮现在卡片上。
              </p>
              <a
                href={TARGET_IMAGE}
                download="ar-tour-card.jpg"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs
                  bg-violet-500/15 text-violet-300 border border-violet-500/25 hover:bg-violet-500/25 transition-all"
              >
                <Download size={13} /> 下载导览卡
              </a>
              <button
                onClick={() => { setShowCard(false); setShowCardFull(true); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs
                  bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/25 transition-all"
              >
                <ScanLine size={13} /> 把本机屏幕当卡片（全屏）
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 全屏导览卡：用手机直接扫这块屏幕，无需打印 */}
      {showCardFull && (
        <div className="fixed inset-0 z-[70] bg-white flex flex-col items-center justify-center">
          <img
            src={TARGET_IMAGE}
            alt="AR 导览卡"
            style={{ maxWidth: '92vw', maxHeight: '78vh', objectFit: 'contain' }}
          />
          <p className="mt-4 text-[13px] text-slate-600 max-w-md text-center leading-relaxed px-6">
            保持这一屏显示，用手机在「AR 实景导览」模式下对准它即可。
            环境光不要太暗、屏幕别反光。
          </p>
          <button
            onClick={() => setShowCardFull(false)}
            className="mt-5 px-5 py-2 rounded-lg text-[13px] bg-slate-800 text-white"
          >
            关闭全屏卡片
          </button>
        </div>
      )}
    </div>
  );
}
