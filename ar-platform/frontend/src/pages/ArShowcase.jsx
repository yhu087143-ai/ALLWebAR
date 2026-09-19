/**
 * AR 展示页 —— 「点一下，把 3D 模型放进你的房间」
 *
 * 移植自 D:\mothersday 的成熟 AR 流程（ArSession + SceneSetup + ObjectPlacer），
 * 改造点：
 *   - 模型可选（本项目自带 3 个模型）
 *   - 加入包围盒归一化（否则某些模型会变成几十米高）
 *   - 明确的分步流程：① 选模型 → ② 检测设备 → ③ 启动 AR 扫平面 → ④ 放置
 *
 * ── WebAR 底层逻辑（四步）────────────────────────────────────────────
 * ① 能力检测  navigator.xr.isSessionSupported('immersive-ar')
 * ② 建会话    navigator.xr.requestSession('immersive-ar', {required:['local'],
 *              optional:['hit-test','plane-detection','dom-overlay','local-floor']})
 *              → renderer.xr.setSession(session) 把渲染交给浏览器 XR 合成器
 *              → 渲染循环必须用 renderer.setAnimationLoop（沉浸式 AR 下 rAF 不触发）
 * ③ 命中检测  每帧 frame.getHitTestResults(hitTestSource) → hits[0].getPose(refSpace)
 *              → 得到「视线射线 ∩ 真实平面」的交点 → 准星移到该点
 * ④ 放置      用户点击 → 把模型克隆到命中点；无命中时退化为视线前方 1.2m
 * ───────────────────────────────────────────────────────────────────
 */

import { toSecureUrl } from '../utils.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import {
  ArrowLeft, Box, CheckCircle2, Crosshair, Loader2, AlertCircle,
  Play, RotateCcw, Trash2, ZoomIn, Smartphone, Layers, Move3d,
} from 'lucide-react';
import SemanticIcon from '../components/icons/SemanticIcon.jsx';
import { ArSession } from '../ar-showcase/ArSession.js';
import { SceneSetup } from '../ar-showcase/SceneSetup.js';
import { ModelPlacer } from '../ar-showcase/ModelPlacer.js';

/** 可放置的模型（均已校验贴图完好） */
const MODELS = [
  {
    id: 'nefertiti',
    name: '娜芙蒂蒂半身像',
    desc: '古埃及彩绘石灰岩半身像，2 张贴图',
    url: '/models/nefertiti-head.glb',
    size: '1.2 MB',
    icon: 'crown',
  },
  {
    id: 'fox',
    name: '赤狐',
    desc: '轻量模型，加载最快，适合先试通链路',
    url: '/models/fox.glb',
    size: '160 KB',
    icon: 'fox',
  },
  {
    id: 'helmet',
    name: '青铜战盔',
    desc: '战国青铜胄，5 张贴图（金属质感最重）',
    url: '/models/helmet-compressed.glb',
    size: '3.7 MB',
    icon: 'shield',
  },
];

/** 步骤条 */
const STEPS = [
  { key: 'model', label: '选择模型' },
  { key: 'check', label: '检测设备' },
  { key: 'scan', label: '扫描平面' },
  { key: 'placed', label: '放置模型' },
];

/**
 * 「为什么启动不了」自检。
 *
 * 之前这台页面在不支持 WebXR 的机器上是一个 disabled 的死按钮：用户点了没有任何反应，
 * 只会以为「功能坏了」。实测最常见的原因其实只有三类，这里按优先级逐条讲清楚。
 */
function diagnoseArStart() {
  const secure = typeof window !== 'undefined' ? window.isSecureContext : true;
  if (!secure) {
    const httpsUrl = toSecureUrl(window.location.href);
    return {
      title: '需要 HTTPS 才能调用摄像头',
      detail:
        `当前页面是 ${window.location.protocol}//${window.location.host}。浏览器在非安全上下文里` +
        '会直接拒绝摄像头与 WebXR，且不会弹权限框。\n' +
        `请改用这个地址打开：${httpsUrl}\n` +
        '（开发服务器 npm run dev 默认就是 https:5180；若启动时设了 AR_HTTPS=0，去掉该变量重启即可。' +
        '证书为自签，手机需先安装并信任 /mkcert-ca.crt）',
    };
  }
  if (typeof navigator === 'undefined' || !navigator.xr) {
    return {
      title: '本机浏览器没有 WebXR',
      detail:
        '沉浸式 AR 需要 Android + Chrome + ARCore（或支持 WebXR 的头显）。' +
        'iOS / Safari 完全不支持 WebXR —— 这是浏览器层面的缺失，无法用代码绕过。' +
        '这台设备上可以改用「图片追踪」模式，或桌面端的「沙盘演示」。',
    };
  }
  return { title: '', detail: '' };
}

/** 常见启动失败 → 人话提示（浏览器原文往往只有一行英文名） */
const AR_ERROR_HINTS = {
  NotAllowedError: '摄像头权限被拒绝：在地址栏左侧的权限设置里允许摄像头后重试。',
  NotSupportedError: '设备不支持该会话特性组合：需要 Android Chrome + ARCore，且必须 HTTPS。',
  SecurityError: '安全策略拒绝：请确认用 https 打开且证书已被信任。',
  NotFoundError: '没有找到可用的摄像头设备。',
  InvalidStateError: '会话状态异常：上一次 AR 会话可能没完全结束，刷新页面后重试。',
};

function describeArError(err) {
  const base = err?.message || String(err);
  const hint = AR_ERROR_HINTS[err?.name];
  return hint ? `${base}｜${hint}` : base;
}

export default function ArShowcase() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);

  const [modelId, setModelId] = useState(MODELS[0].id);
  const [xrSupported, setXrSupported] = useState(null);   // null=检测中
  const [modelState, setModelState] = useState('idle');   // idle|loading|ready|error
  const [progress, setProgress] = useState(0);
  const [modelErr, setModelErr] = useState('');

  const [running, setRunning] = useState(false);          // AR 会话是否已启动
  const [starting, setStarting] = useState(false);
  const [surfaceFound, setSurfaceFound] = useState(false);
  const [placedCount, setPlacedCount] = useState(0);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('model');

  const engine = useRef({
    arSession: null, setup: null, placer: null,
    hitTestSource: null, transientHitTestSource: null, refSpace: null,
    lastHitPose: null, lastHitQuat: null, lastHitTime: 0, lastViewerPose: null,
    lastPlaceTime: 0, starting: false,
    fallbackTimer: null,
  });

  const selected = MODELS.find((m) => m.id === modelId) || MODELS[0];

  // ── ① 能力检测（选完模型自动进入）──
  // 之前这里只有一个裸 await：isSupported() 抛错（或浏览器把 promise 挂住）时
  // 没有任何兜底，第二步就永远停在「正在检测…」，启动按钮一直是灰的。
  // 现在异常按「不支持」处理，另加 3s 看门狗，保证一定会给出结论。
  useEffect(() => {
    let cancelled = false;
    const watchdog = setTimeout(() => {
      if (!cancelled) {
        console.warn('[AR展示] 能力检测超时，按不支持处理');
        setXrSupported(false);
      }
    }, 3000);
    (async () => {
      try {
        const ok = await ArSession.isSupported();
        if (!cancelled) setXrSupported(ok);
      } catch (err) {
        console.warn('[AR展示] 能力检测失败，按不支持处理:', err?.message);
        if (!cancelled) setXrSupported(false);
      } finally {
        clearTimeout(watchdog);
      }
    })();
    return () => { cancelled = true; clearTimeout(watchdog); };
  }, []);

  // ── 清理 ──
  const cleanup = useCallback(() => {
    const e = engine.current;
    e.starting = false;
    if (e.fallbackTimer) { clearTimeout(e.fallbackTimer); e.fallbackTimer = null; }
    if (e.placer) { try { e.placer.dispose(); } catch { /* noop */ } e.placer = null; }
    if (e.hitTestSource) { try { e.hitTestSource.cancel(); } catch { /* noop */ } e.hitTestSource = null; }
    if (e.transientHitTestSource) { try { e.transientHitTestSource.cancel(); } catch { /* noop */ } e.transientHitTestSource = null; }
    if (e.setup) { try { e.setup.dispose(); } catch { /* noop */ } e.setup = null; }
    if (e.arSession) { e.arSession.end(); e.arSession = null; }
    e.refSpace = null;
    e.lastHitPose = null;
    e.lastHitQuat = null;
    e.lastHitTime = 0;
    e.lastViewerPose = null;
    e.lastPlaceTime = 0;
    setRunning(false);
    setSurfaceFound(false);
    setPlacedCount(0);
    setStage('model');
    setModelState('idle');
    setProgress(0);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── 点击放置（XR select / pointerup）──
  const handleTap = useCallback(() => {
    const e = engine.current;
    if (!e.placer || !e.placer.modelReady) return;      // 模型没就绪就不放
    const now = Date.now();
    if (now - e.lastPlaceTime < 500) return;            // 500ms 节流
    e.lastPlaceTime = now;

    let pos;
    if (e.lastHitPose) {
      pos = e.lastHitPose.clone();
    } else if (e.lastViewerPose) {
      const vp = e.lastViewerPose;
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
        new THREE.Quaternion(vp.qx, vp.qy, vp.qz, vp.qw),
      );
      pos = new THREE.Vector3(vp.px, vp.py, vp.pz).add(dir.multiplyScalar(1.2));
    } else {
      pos = new THREE.Vector3(0, 0, -1.2);
    }

    const obj = e.placer.place(pos, { scaleFactor, quaternion: e.lastHitQuat });
    if (obj) {
      setPlacedCount((c) => c + 1);
      setStage('placed');
    }
  }, [scaleFactor]);

  // ── 不支持时点击按钮：必须给出原因，而不是毫无反应 ──
  const explainUnavailable = useCallback(() => {
    const why = diagnoseArStart();
    setError(
      why.title
        ? `${why.title}｜${why.detail}`
        : '当前设备不支持 immersive-ar 会话：需要 Android + Chrome + ARCore，且必须用 https 打开。'
    );
  }, []);

  // ── 启动 AR ──
  const startAr = useCallback(async () => {
    const canvas = canvasRef.current;
    const e = engine.current;
    if (!canvas || e.starting) return;
    e.starting = true;

    setError('');
    setStarting(true);
    setSurfaceFound(false);
    setPlacedCount(0);

    try {
      const setup = new SceneSetup(canvas);
      setup.init();
      e.setup = setup;

      const arSession = new ArSession();
      // dom-overlay：把覆盖层交给浏览器，AR 期间 UI 才不会被隐藏
      const session = await arSession.start(overlayRef.current);
      if (!e.starting) { await session.end(); return; }
      e.arSession = arSession;

      await setup.connectToXr(session, arSession.referenceSpaceType);
      if (!e.starting) return;

      const refSpace = setup.getReferenceSpace();
      e.refSpace = refSpace;

      // 放置器 + 准星
      const placer = new ModelPlacer(setup.scene);
      placer.createReticle();
      placer.targetHeight = 0.28;
      e.placer = placer;

      setModelState('loading');
      setProgress(0);
      placer.loadModel(selected.url, {
        onReady: () => { setModelState('ready'); setProgress(100); },
        onProgress: (p) => {
          if (typeof p === 'number') setProgress(p);
          else if (p?.error) { setModelState('error'); setModelErr(p.error); }
        },
      });

      // ③ 命中检测
      let hitTestSource = null;
      if (session.requestHitTestSource && refSpace) {
        try {
          hitTestSource = await session.requestHitTestSource({ space: refSpace });
        } catch (ex) {
          console.warn('[AR展示] hit-test 不可用，退化为视线前方放置:', ex?.message);
        }
      }
      e.hitTestSource = hitTestSource;

      // 触摸命中源：只有屏幕中心射线时，用户点哪里都落在屏幕中央，放置位置必然不对。
      // Chrome Android 支持 transient input（手指），失败则退回中心射线。
      let transientSource = null;
      if (session.requestHitTestSourceForTransientInput && refSpace) {
        try {
          transientSource = await session.requestHitTestSourceForTransientInput({
            profile: 'generic-touchscreen',
          });
        } catch (ex) {
          console.warn('[AR展示] 触摸命中不可用，退回屏幕中心命中:', ex?.message);
        }
      }
      e.transientHitTestSource = transientSource;

      setRunning(true);
      setStage('scan');

      // 调试钩子：便于控制台/自动化检查 AR 运行时状态
      if (import.meta.env.DEV) window.__arShowcase = engine.current;

      // ④ 渲染循环（必须 setAnimationLoop）
      setup.startRenderLoop(({ frame, timestamp }) => {
        if (!frame || !refSpace) return;
        placer.update(timestamp);

        // 记录相机位姿（用于无命中时的退化放置）
        try {
          const vp = frame.getViewerPose(refSpace);
          if (vp) {
            const t = vp.transform;
            e.lastViewerPose = {
              px: t.position.x, py: t.position.y, pz: t.position.z,
              qx: t.orientation.x, qy: t.orientation.y, qz: t.orientation.z, qw: t.orientation.w,
            };
          }
        } catch { /* 追踪未就绪 */ }

        // 命中优先级：手指触摸点 > 屏幕中心射线（原来只有中心射线，点哪都一样）
        let hitPose = null;
        if (e.transientHitTestSource) {
          try {
            const tHits = frame.getHitTestResultsForTransientInput(e.transientHitTestSource);
            const first = tHits?.[0]?.results?.[0];
            hitPose = first ? first.getPose(refSpace) : null;
          } catch { /* 忽略瞬时错误 */ }
        }
        if (!hitPose && hitTestSource) {
          try {
            const hits = frame.getHitTestResults(hitTestSource);
            hitPose = hits?.length ? hits[0].getPose(refSpace) : null;
          } catch { /* 忽略瞬时错误 */ }
        }
        if (hitPose) {
          const t = hitPose.transform;
          e.lastHitPose = new THREE.Vector3(t.position.x, t.position.y, t.position.z);
          e.lastHitQuat = new THREE.Quaternion(
            t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w,
          );
          e.lastHitTime = timestamp;
          placer.setReticleAt(e.lastHitPose, e.lastHitQuat);
          setSurfaceFound(true);
        } else if (e.transientHitTestSource || hitTestSource) {
          placer.hideReticle();
        } else if (e.lastViewerPose) {
          // 无 hit-test：准星固定在视线前方 1.2m
          const vp = e.lastViewerPose;
          const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
            new THREE.Quaternion(vp.qx, vp.qy, vp.qz, vp.qw),
          );
          e.lastHitPose = new THREE.Vector3(vp.px, vp.py, vp.pz).add(dir.multiplyScalar(1.2));
          placer.setReticleAt(e.lastHitPose);
          setSurfaceFound(true);
        }
      });
    } catch (err) {
      console.error('[AR展示] 启动失败:', err);
      cleanup();
      setError(describeArError(err));
    } finally {
      e.starting = false;
      setStarting(false);
    }
  }, [selected, scaleFactor, cleanup]);

  // ── 覆盖层点击放置 ──
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !running) return undefined;
    const handler = (ev) => {
      if (ev.target.closest('button') || ev.target.closest('input')) return;
      handleTap();
    };
    overlay.addEventListener('pointerup', handler);
    return () => overlay.removeEventListener('pointerup', handler);
  }, [running, handleTap]);

  // 缩放
  useEffect(() => {
    engine.current.placer?.setScaleFactor(scaleFactor);
  }, [scaleFactor]);

  const stepIndex = stage === 'model' ? 0 : stage === 'check' ? 1 : stage === 'scan' ? 2 : 3;

  // ══════════════════════ 渲染 ══════════════════════
  return (
    <div className={`fixed inset-0 ${running ? 'bg-black' : 'bg-slate-950'} overflow-hidden`}>
      {/* AR 画布：沉浸式 AR 下由浏览器合成相机画面，页面 canvas 本身为空 */}
      <canvas
        ref={canvasRef}
        className="block fixed inset-0 w-full h-full"
        style={{ touchAction: 'none', display: running ? 'block' : 'none' }}
      />

      {/* dom-overlay 根节点：AR 期间 UI 必须挂在这个子树里才可见 */}
      <div ref={overlayRef} className="fixed inset-0 z-10 overflow-y-auto">

        {/* ═══════ 顶部步骤条（两种状态都显示）═══════ */}
        <div className="glass-panel sticky top-0 z-30 rounded-none border-x-0 border-t-0 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            {!running && (
              <Link
                to="/"
                className="icon-tile icon-tile-sm shrink-0"
                aria-label="返回首页"
              >
                <ArrowLeft size={15} />
              </Link>
            )}
            {STEPS.map((s, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <React.Fragment key={s.key}>
                  <div className={`badge gap-1.5 transition-all ${
                    active ? 'badge-info' : done ? 'badge-ok' : 'badge-mute'}`}>
                    {done ? <CheckCircle2 size={11} /> : <span className="font-mono">{i + 1}</span>}
                    <span>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={`flex-1 h-px ${done ? 'bg-emerald-500/40' : 'bg-white/10'}`} />}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* ═══════ 未启动 AR：分步配置界面 ═══════ */}
        {!running && (
          <div className="max-w-3xl mx-auto px-4 pt-6 pb-24 space-y-5">

            {/* 页面主标题：屏幕阅读器可读，视觉上由顶部步骤条承担 */}
            <h1 className="sr-only">AR 模型展示 · 无标记平面放置演示</h1>

            {/* 步骤 1：选模型 */}
            <div className="panel p-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-1 flex items-center gap-2">
                <Box size={15} className="text-cyan-400" /> 第 1 步 · 选择一个 3D 模型
              </h2>
              <p className="text-[11px] text-slate-500 mb-4">
                这些模型都在项目里、贴图已校验完好。选中的模型会先加载完成，再进入下一步。
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {MODELS.map((m) => {
                  const on = m.id === modelId;
                  return (
                    <button
                      key={m.id}
                      data-testid={`model-${m.id}`}
                      onClick={() => { setModelId(m.id); setStage('check'); }}
                      className={`text-left p-4 rounded-xl border transition-all ${
                        on ? 'bg-cyan-500/12 border-cyan-400/45' : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]'}`}
                    >
                      <div className="flex items-center justify-between">
                        <SemanticIcon name={m.icon} size={20} className="text-cyan-200" />
                        {on && <CheckCircle2 size={15} className="text-cyan-400" />}
                      </div>
                      <div className="text-[13px] font-medium text-slate-100 mt-2">{m.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{m.size}</div>
                      <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">{m.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 步骤 2：设备能力 */}
            <div className="panel p-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-1 flex items-center gap-2">
                <Smartphone size={15} className="text-cyan-400" /> 第 2 步 · 检测设备能力
              </h2>
              <div className="mt-3 flex items-start gap-2">
                {xrSupported === null && (
                  <>
                    <Loader2 size={15} className="text-slate-400 animate-spin mt-0.5" />
                    <span className="text-xs text-slate-400">正在检测 WebXR immersive-ar 支持…</span>
                  </>
                )}
                {xrSupported === true && (
                  <>
                    <CheckCircle2 size={15} className="text-emerald-400 mt-0.5" />
                    <div>
                      <div className="text-xs text-emerald-300">本机支持 WebXR AR，可以直接启动</div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        会话特性：local（必需） + hit-test / plane-detection / dom-overlay / local-floor / light-estimation（可选）
                      </div>
                    </div>
                  </>
                )}
                {xrSupported === false && (
                  <>
                    <AlertCircle size={15} className="text-amber-400 mt-0.5" />
                    <div>
                      <div className="text-xs text-amber-300">
                        本机不支持 WebXR AR —— 无法使用这个模式
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        需要 <b>Android + Chrome + ARCore</b>，并确保用 <b>https</b> 打开。
                        <b>iOS / Safari 完全不支持 WebXR</b>（浏览器层面的缺失，无法用代码绕过）。
                        <br />
                        这台设备上仍可查看「导览沙盘演示」，或用导览卡模式的 AR。
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Link to="/guide-demo" className="btn-primary text-[0.75rem]">
                          去导览演示
                        </Link>
                        <Link to="/" className="btn-ghost text-[0.75rem]">
                          回首页
                        </Link>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 步骤 3：模型预加载 + 启动 */}
            <div className={`rounded-2xl border p-5 transition-all ${
              xrSupported ? 'border-cyan-500/30 bg-cyan-500/[0.06]' : 'border-white/10 bg-white/[0.02] opacity-60'}`}>
              <h2 className="text-sm font-semibold text-slate-100 mb-1 flex items-center gap-2">
                <Play size={15} className="text-cyan-400" /> 第 3 步 · 启动 AR 并扫描平面
              </h2>
              <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                点下面的按钮 → 允许摄像头 → 缓慢移动手机直到出现蓝色准星 → <b>点一下屏幕</b>把模型放上去。
              </p>

              <button
                data-testid="start-ar"
                onClick={() => (xrSupported ? startAr() : explainUnavailable())}
                disabled={starting}
                aria-disabled={!xrSupported}
                title={xrSupported ? '启动沉浸式 AR' : '本机不支持，点一下看原因'}
                className={`w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold
                  transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait ${
                    xrSupported
                      ? 'bg-gradient-to-r from-cyan-500 to-violet-600 text-white'
                      : 'border border-white/10 bg-white/[0.05] text-slate-300'
                  }`}
              >
                {starting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {starting ? '正在启动 AR…' : `启动 AR · 放置「${selected.name}」`}
              </button>
              {!xrSupported && (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-300/80">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                  本机无法启动沉浸式 AR（原因见第 2 步）；点按钮可看详细原因与替代方案。
                </p>
              )}

              {error && (
                <div className="panel-note mt-4 flex items-start gap-2">
                  <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs text-rose-300 font-medium">启动失败</div>
                    <div className="text-[11px] text-rose-200/70 mt-1 break-words">{error}</div>
                  </div>
                </div>
              )}
            </div>

            {/* 底层逻辑说明 */}
            <div className="panel p-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
                <Layers size={15} className="text-violet-400" /> WebAR 底层逻辑（这个模式到底怎么跑起来的）
              </h2>
              <ol className="space-y-2.5 text-[11px] text-slate-400 leading-relaxed">
                <li>
                  <b className="text-slate-200">① 能力检测</b>　
                  <code className="text-cyan-300">navigator.xr.isSessionSupported('immersive-ar')</code>
                  　→ 返回 false 就直接给出提示，不做无用尝试
                </li>
                <li>
                  <b className="text-slate-200">② 建立会话</b>　
                  <code className="text-cyan-300">requestSession('immersive-ar', &#123;required:['local'], optional:['hit-test','plane-detection','dom-overlay','local-floor','light-estimation']&#125;)</code>
                  <br />
                  　→ 然后 <code className="text-cyan-300">renderer.xr.setSession(session)</code>，
                  浏览器接管渲染：<b>页面 canvas 变空</b>，实景由浏览器的 XR 合成器叠加上去
                  <br />
                  　→ <b>`local`</b> 是相对起点的 6DoF 追踪，<b>`hit-test`</b> 才能"打中"真实平面，
                  <b>`dom-overlay`</b> 才能让 HUD/按钮在 AR 里显示
                </li>
                <li>
                  <b className="text-slate-200">③ 命中检测</b>　
                  <code className="text-cyan-300">session.requestHitTestSource(&#123;space: refSpace&#125;)</code>
                  　→ 每帧 <code className="text-cyan-300">frame.getHitTestResults(src)[0].getPose(refSpace)</code>
                  　→ 得到「视线射线与真实桌面的交点」→ 准星移到该点
                </li>
                <li>
                  <b className="text-slate-200">④ 放置</b>　
                  用户点击（XR <b>select</b> 事件 / pointerup）→ 把模型克隆到命中点，
                  播放生长动画；命中点为空时退化为「视线前方 1.2 米」
                </li>
                <li>
                  <b className="text-slate-200">渲染循环</b>　必须用
                  <code className="text-cyan-300">renderer.setAnimationLoop(cb)</code>，
                  因为沉浸式 AR 的帧由 <code className="text-cyan-300">session.requestAnimationFrame</code> 驱动，
                  普通 <code>requestAnimationFrame</code> 在 AR 里不会触发
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* ═══════ 已启动 AR：悬浮控制层 ═══════ */}
        {running && (
          <>
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-full text-[11px] bg-black/60 border border-white/15 text-slate-200 backdrop-blur">
                {placedCount === 0 ? '寻找平面中…移动手机' : `已放置 ${placedCount} 个`}
              </span>
              {modelState !== 'ready' && (
                <span className="px-3 py-1.5 rounded-full text-[11px] bg-black/60 border border-white/15 text-amber-300 backdrop-blur">
                  {modelState === 'error' ? `模型加载失败${modelErr ? ` · ${modelErr}` : ''}` : `模型加载中 ${progress}%`}
                </span>
              )}
              {surfaceFound && placedCount === 0 && modelState === 'ready' && (
                <span className="px-3 py-1.5 rounded-full text-[11px] bg-cyan-500/25 border border-cyan-400/40 text-cyan-100 backdrop-blur">
                  点一下屏幕放置
                </span>
              )}
            </div>

            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(92%,560px)]
              px-3 py-2.5 rounded-2xl bg-black/70 border border-white/15 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <ZoomIn size={14} className="text-cyan-300 shrink-0" />
                <input
                  type="range" min="0.3" max="3" step="0.05"
                  value={scaleFactor}
                  onChange={(ev) => setScaleFactor(parseFloat(ev.target.value))}
                  className="flex-1 accent-cyan-400 h-0.5 rounded-full appearance-none bg-white/15 cursor-pointer"
                />
                <span className="text-[10px] font-mono text-slate-400 tabular-nums w-9 text-right">
                  {scaleFactor.toFixed(1)}×
                </span>
                <button
                  onClick={() => { engine.current.placer?.clearAll(); setPlacedCount(0); setStage('scan'); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px]
                    bg-white/8 text-slate-200 border border-white/12"
                >
                  <Trash2 size={12} /> 清空
                </button>
                <button
                  onClick={cleanup}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px]
                    bg-rose-500/20 text-rose-200 border border-rose-500/30"
                >
                  <RotateCcw size={12} /> 退出 AR
                </button>
              </div>
            </div>

            {placedCount === 0 && (
              <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full
                bg-black/65 border border-white/15 text-[11px] text-slate-300 backdrop-blur text-center">
                <span className="inline-flex items-center gap-1.5">
                  <Crosshair size={12} className="text-cyan-300" />
                  缓慢移动手机，让准星落在桌面或地面上，然后点一下屏幕
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
