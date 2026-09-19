import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle, X, RefreshCw, ScanLine, Download,
  Camera, RotateCcw, Lock, Unlock,
  Image as ImageIcon, Settings, Video, Square,
  Eye, EyeOff, ChevronUp, Crosshair, Sparkles,
} from 'lucide-react';
import { fetchArExperience } from '../api/client.js';
import { toSecureUrl } from '../utils.js';

const DEFAULT_POS = { x: 0, y: 0.15, z: -0.2 };

/** 确保拖动手势 & 按钮操作时引擎处于可编辑状态 */
function ensureEditable(eng) {
  if (!eng) return;
  if (eng.isFrozen) eng.isFrozen = false;
}

export default function ViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modelProgress, setModelProgress] = useState(0);
  const [modelStatus, setModelStatus] = useState(/** @type {'loading'|'loaded'|'error'|null} */ (null));
  const [trackingFound, setTrackingFound] = useState(/** @type {boolean | null} */ (null));
  const [showHint, setShowHint] = useState(true);
  const [trackingType, setTrackingType] = useState('');
  const [targetImageUrl, setTargetImageUrl] = useState('');

  // UI 状态
  const [showTargetImage, setShowTargetImage] = useState(true);
  const [showBottomBar, setShowBottomBar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [recording, setRecording] = useState('idle'); // 'idle' | 'recording' | 'processing'
  const [activeTarget, setActiveTarget] = useState(-1); // 3DAR 期1：当前激活的角度图序号
  const [domeOn, setDomeOn] = useState(false); // 全景穹顶展开状态
  // 穹顶模式来自后端 config.domeMode（fetch 后写入），URL ?dome=1 可直接体验。
  // ⚠️ 不能在顶层读 data.config —— data 是 effect 里的局部变量，顶层没有这个绑定
  //    （曾经直接写 data.config?.domeMode → ReferenceError → 整页被错误边界兜成「页面加载异常」）。
  const [domeMode, setDomeMode] = useState(false);
  const domeEnabled = domeMode || new URLSearchParams(window.location.search).has('dome');
  // 穹顶锚定在平面放置组（_placementGroup），只有 plane 追踪会创建该组。
  // 不加这个门控的话，image/face 页 ?dome=1 会出现按钮但点击静默失败。
  const domeSupported = trackingType === 'plane';
  /**
   * 非安全上下文时的「改用 HTTPS 打开」目标地址（空串表示当前地址无法升级，例如 localhost）。
   * ⚠️ 必须声明在组件顶层：它曾经被写在下面的 useEffect 回调里，
   * 导致 effect 提交阶段调用 useState → React 直接抛
   * "Invalid hook call" → 整个 /view/:id 被错误边界兜成「页面加载异常」。
   */
  const [secureFixUrl, setSecureFixUrl] = useState('');

  // 模型控制
  const [frozen, setFrozen] = useState(true);
  const [scaleVal, setScaleVal] = useState({ x: 1, y: 1, z: 1 });
  const [posVal, setPosVal] = useState({ ...DEFAULT_POS });
  const [rotVal, setRotVal] = useState(0);

  const onModelStatus = useCallback((status, pct) => {
    if (status === 'loading') {
      setModelStatus('loading');
      if (typeof pct === 'number') setModelProgress(pct);
    } else {
      setModelStatus(status);
      if (status === 'loaded') setModelProgress(1);
    }
  }, []);

  useEffect(() => {
    let engine = null;
    let cancelled = false;

    async function init() {
      let AREngine;
      try {
        const mod = await import('@ar-platform/engine');
        AREngine = mod.AREngine;
      } catch (err) {
        if (!cancelled) {
          setError('AR 引擎加载失败，请确认项目已正确构建（运行 npm run build:engine）');
        }
        return;
      }

      try {
        const data = await fetchArExperience(id);
        if (cancelled) return;

        // 导览类体验交给专门的导览演示页（GuideEngine 驱动、支持沙盘/AR 双模式）。
        // 这样「编辑器发布 → 扫码打开 /view/:id」也能正确进入导览。
        if (data?.unifiedConfig?.guide?.pois?.length) {
          navigate(`/guide/${id}`, { replace: true });
          return;
        }

        setTrackingType(data.trackingType);
        setTargetImageUrl(data.targetImageUrl || '');
        setDomeMode(Boolean(data.config?.domeMode));

        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          if (!cancelled) {
            const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
            const httpsUrl = toSecureUrl(window.location.href);
            const canFix = !isLocalhost && httpsUrl !== window.location.href;
            setSecureFixUrl(canFix ? httpsUrl : '');
            setError(
              window.isSecureContext
                ? '当前浏览器不支持摄像头访问，请使用现代浏览器（Chrome / Safari）'
                : '摄像头无法访问：当前页面不是安全上下文。\n' +
                  `浏览器在 ${location.protocol}//${location.host} 这类非 HTTPS 地址下会直接禁用摄像头（且不弹权限框）。\n` +
                  `请改用 ${httpsUrl} 打开本页（开发服务器默认 https，端口 5180；` +
                  '若启动时设了 AR_HTTPS=0，去掉该变量重启即可）。'
            );
          }
          return;
        }

        console.log('[ViewPage] AR体验数据:', {
          id, modelUrl: data.modelUrl, trackingType: data.trackingType,
          targetUrl: data.targetUrl, config: data.config,
        });

        engine = new AREngine(containerRef.current, {
          modelUrl: data.modelUrl,
          tracking: data.trackingType,
          engine: data.config?.engine || undefined,
          scale: data.config?.scale || 1,
          position: data.config?.positionOffset
            ? [data.config.positionOffset.x, data.config.positionOffset.y, data.config.positionOffset.z]
            : [DEFAULT_POS.x, DEFAULT_POS.y, DEFAULT_POS.z],
          targetUrl: data.targetUrl || data.config?.targetUrl || '/targets/default.mind',
          filterMinCF: 0.005,
          filterBeta: 30,
          missTolerance: 15,
          warmupTolerance: 5,
          freezeOnDetect: false,
          faceFeature: data.config?.faceFeature,
          faceZones: data.config?.faceZones,
          positionOffset: data.config?.positionOffset,
          animation: data.animationConfig || undefined,
          interaction: data.interactionConfig || undefined,
          planeMode: data.config?.planeMode || undefined,
          // 3DAR 期1：多角度图编进同一个 .mind 时，作者在 config 里声明 maxTrack
          maxTrack: data.config?.maxTrack || undefined,
          onActiveTargetChange: (idx) => setActiveTarget(idx),
          domeConfig: data.config?.domeConfig || undefined,
        });

        engine.onTrackingStatus = (found) => {
          if (!cancelled) setTrackingFound(found);
        };

        engine.onModelStatus = (status, pct) => {
          if (!cancelled) onModelStatus(status, pct);
        };

        engineRef.current = engine;
        // DEV 调试钩子：供无头自动化读取模型包装层/动效层的真实姿态
        // （与 ArShowcase 的 __arShowcase、GuideDemo 的 __guideDemo 同一模式）
        if (import.meta.env.DEV) window.__viewPage = engine;

        await engine.start();
        console.log('[ViewPage] AR 引擎启动成功');

        const unifiedConfig = data.unifiedConfig;
        if (unifiedConfig?.events?.length > 0) {
          engine.initInteraction(unifiedConfig.events);
          console.log('[ViewPage] 已注册交互规则:', unifiedConfig.events.length);
        }

        if (unifiedConfig) {
          engine.initExperience(unifiedConfig);
        }
      } catch (err) {
        console.error('[ViewPage] AR 启动失败，详细错误:', err);
        if (err instanceof Error) {
          console.error('  name:', err.name);
          console.error('  message:', err.message);
          console.error('  stack:', err.stack);
        } else {
          console.error('  非标准错误对象:', JSON.stringify(err));
        }

        if (!cancelled) {
          if (err === undefined || err === null) {
            setError('AR 引擎初始化失败。请检查：\n1. 是否已允许摄像头权限\n2. 是否使用 HTTPS 或 localhost 访问\n3. 是否有关闭其他占用摄像头的应用');
          } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setError('摄像头权限被拒绝，请在浏览器设置中允许摄像头访问后刷新页面');
          } else if (err.name === 'NotFoundError') {
            setError('未检测到摄像头设备，请确认设备已连接摄像头');
          } else if (err.name === 'NotReadableError') {
            setError('摄像头被其他应用占用，请关闭其他使用摄像头的程序后重试');
          } else if (typeof err === 'object' && err?.message) {
            setError(err.message);
          } else if (typeof err === 'string') {
            setError(err);
          } else {
            setError('AR 加载失败，请检查摄像头权限或使用其他浏览器');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (engine) engine.stop();
    };
  }, [id]);

  useEffect(() => {
    if (!loading && showHint) {
      const timer = setTimeout(() => setShowHint(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [loading, showHint]);

  useEffect(() => {
    if (error && containerRef.current) {
      const overlays = containerRef.current.querySelectorAll('.mindar-ui-overlay');
      for (const el of overlays) el.remove();
    }
  }, [error]);

  const handleSwitchCamera = async () => {
    try {
      await engineRef.current?.switchCamera();
    } catch { /* ignore */ }
  };

  // ============ 控制操作 ============
  const handleScale = (axis, val) => {
    const eng = engineRef.current;
    ensureEditable(eng);
    const v = parseFloat(val);
    const next = axis === 'xyz'
      ? { x: v, y: v, z: v }
      : { ...scaleVal, [axis]: v };
    setScaleVal(next);
    eng?.setModelScale(next.x, next.y, next.z);
  };

  const handlePos = (axis, val) => {
    const eng = engineRef.current;
    ensureEditable(eng);
    const v = parseFloat(val);
    const next = { ...posVal, [axis]: v };
    setPosVal(next);
    eng?.setModelPosition(next.x, next.y, next.z);
  };

  const handleFreeze = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const next = !eng.isFrozen;
    eng.isFrozen = next;
    setFrozen(next);
  };

  const handleRot = (deg) => {
    const eng = engineRef.current;
    ensureEditable(eng);
    const v = parseFloat(deg);
    setRotVal(v);
    eng?.setModelRotation(v);
  };

  const handleReset = () => {
    const eng = engineRef.current;
    if (!eng) return;
    ensureEditable(eng);
    setScaleVal({ x: 1, y: 1, z: 1 });
    setPosVal({ ...DEFAULT_POS });
    setRotVal(0);
    eng.setModelScale(1, 1, 1);
    eng.setModelPosition(DEFAULT_POS.x, DEFAULT_POS.y, DEFAULT_POS.z);
    eng.setModelRotation(0);
    eng.resetRotation();
    eng.isFrozen = true;
    setFrozen(true);
  };

  /** 重新放置（仅平面放置模式） */
  const handleReplace = () => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.replacePlacedObject();
    setShowSettings(false);
    setScaleVal({ x: 1, y: 1, z: 1 });
    setPosVal({ ...DEFAULT_POS });
    setRotVal(0);
    setFrozen(true);
  };

  const handlePhoto = async () => {
    const eng = engineRef.current;
    if (!eng) return;
    const dataUrl = eng.capturePhoto?.() ?? eng.screenshot?.();
    if (!dataUrl) return;

    // 优先系统分享（移动端体验好，S6 补全清单要求 navigator.share），失败/取消则下载兜底
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `ar-photo-${Date.now()}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch {
      /* 用户取消分享或不支持 → 走下载兜底 */
    }
    const a = document.createElement('a');
    a.download = `ar-photo-${Date.now()}.png`;
    a.href = dataUrl;
    a.click();
  };

  // ============ 视频录制 ============
  const handleStartRecording = () => {
    const eng = engineRef.current;
    if (!eng || !eng.renderCanvas) return;

    try {
      const canvas = eng.renderCanvas;
      const stream = canvas.captureStream(30);
      const chunks = [];

      // 尝试使用 VP9，不支持则回退
      const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      let mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = `ar-video-${Date.now()}.webm`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
        setRecording('idle');
      };

      recorder.onerror = () => {
        console.error('视频录制错误');
        setRecording('idle');
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording('recording');
    } catch (err) {
      console.error('录制启动失败:', err);
    }
  };

  const handleStopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      setRecording('processing');
      recorder.stop();
      mediaRecorderRef.current = null;
    }
  };

  // ============ 显示辅助 ============
  const searchingText = trackingType === 'plane'
    ? '扫描平面中...'
    : trackingType === 'face'
    ? '扫描面部中...'
    : '扫描目标图像中...';

  const trackingMsg = trackingFound === null
    ? { text: '等待识别...', icon: ScanLine, cls: 'text-slate-400' }
    : trackingFound
    ? { text: '已识别！', icon: ScanLine, cls: 'text-emerald-400' }
    : { text: searchingText, icon: ScanLine, cls: 'text-yellow-400' };

  const instructions = trackingType === 'face'
    ? '将面部对准摄像头'
    : trackingType === 'plane'
    ? '扫描周围环境，检测到平面后点击放置'
    : '将摄像头对准目标图片';

  const TrackingIcon = trackingMsg.icon;
  const arReady = !loading && !error;

  return (
    <div className="fixed inset-0 select-none">
      {/* AR 容器 — 全屏底层 */}
      <div ref={containerRef} className="w-full h-full overflow-hidden" data-ar-view />
      <style>{`[data-ar-view]{touch-action:none!important}[data-ar-view] video{width:100%!important;height:100%!important;object-fit:cover!important;top:0!important;left:0!important}.mindar-ui-overlay,.mindar-ui-crosshair,.mindar-ui-cursor,.mindar-ui-target{display:none!important}`}</style>

      {/* ===== 加载状态 ===== */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
          <div className="text-center px-6">
            <div className="relative mx-auto mb-6">
              <div className="w-14 h-14 rounded-full border-2 border-violet-400/20 border-t-violet-400 animate-spin" />
            </div>
            <p className="text-sm text-slate-300 font-medium">正在加载 AR 体验</p>
            <p className="text-xs text-slate-500 mt-2">初始化摄像头和追踪...</p>
            <p className="text-xs text-slate-600 mt-4">请允许摄像头访问权限</p>
          </div>
        </div>
      )}

      {/* ===== 模型下载进度 ===== */}
      {arReady && modelStatus === 'loading' && (
        <div className="absolute top-16 left-0 right-0 z-10 flex justify-center px-6">
          <div className="w-full max-w-xs">
            <div className="flex items-center gap-2 mb-1.5">
              <Download size={12} className="text-violet-300" />
              <span className="text-xs text-violet-200/80 font-medium">正在下载 3D 模型</span>
              <span className="text-xs text-violet-300/60 ml-auto">{Math.round(modelProgress * 100)}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-violet-500 rounded-full transition-all duration-300"
                style={{ width: `${modelProgress * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-white/40 mt-1">下载完成后自动显示模型</p>
          </div>
        </div>
      )}

      {/* ===== 录制指示器（始终可见，不受底部栏影响） ===== */}
      {activeTarget >= 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5
                        rounded-xl bg-black/45 backdrop-blur text-xs text-white/80"
          title="3DAR 多角度识别：当前命中的角度图">
          角度 #{activeTarget}
        </div>
      )}
      {recording === 'recording' && (
        <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-500/80 backdrop-blur-sm">
          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-[11px] text-white font-semibold tracking-wider">REC</span>
        </div>
      )}

      {/* ===== 顶部栏：返回按钮 + 追踪状态 ===== */}
      {arReady && (
        <div className="absolute top-0 left-0 right-0 z-10 p-3 pointer-events-none">
          <div className="flex items-center justify-between pointer-events-auto">
            <button
              onClick={() => navigate('/')}
              className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/10
                flex items-center justify-center hover:bg-white/10 transition-colors"
              aria-label="返回"
            >
              <X size={16} className="text-white/70" />
            </button>

            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full
              bg-black/40 backdrop-blur-md border transition-colors duration-500
              ${trackingFound === null ? 'border-white/5' :
                trackingFound ? 'border-emerald-500/30' : 'border-yellow-500/30'}`}>
              <TrackingIcon size={14} className={trackingMsg.cls} />
              <span className={`text-xs font-medium ${trackingMsg.cls}`}>{trackingMsg.text}</span>
            </div>

            <div className="w-9" />
          </div>
        </div>
      )}

      {/* ===== 左上角目标图片（可隐藏/展示） ===== */}
      {arReady && trackingType === 'image' && targetImageUrl && (
        <div className="absolute top-14 left-3 z-10">
          {showTargetImage ? (
            <div className="p-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
              <img
                src={targetImageUrl}
                alt="目标图片"
                className="w-24 sm:w-28 h-auto rounded-lg"
              />
              <button
                onClick={() => setShowTargetImage(false)}
                className="mt-1 w-full flex items-center justify-center gap-1 py-1 rounded-lg
                  text-[10px] text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
              >
                <EyeOff size={10} />
                隐藏
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowTargetImage(true)}
              className="w-8 h-8 rounded-lg bg-black/40 backdrop-blur-md border border-white/10
                flex items-center justify-center hover:bg-white/10 transition-colors"
              title="显示目标图片"
            >
              <Eye size={14} className="text-white/60" />
            </button>
          )}
        </div>
      )}

      {/* ===== 扫描引导 ===== */}
      {arReady && showHint && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <div className="absolute -top-8 -left-8 w-12 h-12 border-t-2 border-l-2 border-violet-400/60 rounded-tl" />
            <div className="absolute -top-8 -right-8 w-12 h-12 border-t-2 border-r-2 border-violet-400/60 rounded-tr" />
            <div className="absolute -bottom-8 -left-8 w-12 h-12 border-b-2 border-l-2 border-violet-400/60 rounded-bl" />
            <div className="absolute -bottom-8 -right-8 w-12 h-12 border-b-2 border-r-2 border-violet-400/60 rounded-br" />
          </div>
          <p className="absolute bottom-24 text-sm text-white/80 font-medium tracking-wide">
            {instructions}
          </p>
        </div>
      )}

      {/* ===== 底部栏（关闭按钮才可隐藏） ===== */}
      {arReady && showBottomBar && (
        <div className="absolute bottom-0 left-0 right-0 z-20 px-3 pb-3 pointer-events-none">
          <div className="pointer-events-auto flex items-center justify-between
            glass-panel rounded-2xl px-3 py-2">

            {/* 关闭底部栏（录制中禁用） */}
            <button
              onClick={() => { if (recording !== 'recording') setShowBottomBar(false); }}
              disabled={recording === 'recording'}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors active:scale-90
                ${recording === 'recording'
                  ? 'opacity-30 cursor-not-allowed'
                  : 'hover:bg-white/10 text-white/60 hover:text-white/80'}`}
              title="隐藏底部栏"
            >
              <X size={15} />
            </button>

            {/* 拍照 */}
            <button onClick={handlePhoto}
              className="w-10 h-10 rounded-xl bg-white/8 hover:bg-white/15 transition-colors
                flex items-center justify-center active:scale-90"
              title="拍照">
              <Camera size={16} className="text-white/80" />
            </button>

            {/* 录制/停止 */}
            {recording === 'idle' ? (
              <button onClick={handleStartRecording}
                className="w-10 h-10 rounded-xl bg-white/8 hover:bg-white/15 transition-colors
                  flex items-center justify-center active:scale-90"
                title="开始录像">
                <Video size={16} className="text-white/80" />
              </button>
            ) : (
              <button onClick={handleStopRecording}
                className="w-10 h-10 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 transition-colors
                  flex items-center justify-center active:scale-90"
                title="停止录像">
                {recording === 'processing' ? (
                  <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Square size={14} className="text-rose-400" />
                )}
              </button>
            )}

            {/* 设置切换 */}
            <button onClick={() => setShowSettings(v => !v)}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors active:scale-90
                ${showSettings ? 'bg-violet-500/20 text-violet-400' : 'hover:bg-white/10 text-white/60 hover:text-white/80'}`}
              title="设置">
              <Settings size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ===== 底部栏隐藏后的恢复按钮 ===== */}
      {arReady && !showBottomBar && (
        <button
          onClick={() => setShowBottomBar(true)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20
            w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10
            flex items-center justify-center hover:bg-white/10 transition-colors shadow-lg"
          title="显示底部栏"
        >
          <ChevronUp size={18} className="text-white/60" />
        </button>
      )}

      {/* ===== 设置面板（点外部消失） ===== */}
      {arReady && showSettings && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setShowSettings(false)} />
          <div className="glass-panel absolute right-3 bottom-20 z-30 w-44 p-3">
            <div className="space-y-3">

              {trackingType === 'plane' ? (
                /* ── 平面放置专属设置 ── */
                <>
                  {/* 放置状态 + 重新放置 */}
                  <div className="flex items-center gap-2">
                    <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${
                      trackingFound
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-yellow-500/10 text-yellow-400'
                    }`}>
                      <ScanLine size={12} />
                      <span className="font-medium">{trackingFound ? '已放置' : '点击屏幕放置'}</span>
                    </div>
                    {trackingFound && (
                      <button onClick={handleReplace}
                        className="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-amber-400/15
                          text-white/50 hover:text-amber-400 transition-colors text-xs flex items-center gap-1"
                        title="重新放置">
                        <RefreshCw size={12} />
                        重放
                      </button>
                    )}
                    {trackingFound && (
                      <button onClick={() => engineRef.current?.recenter()}
                        className="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-cyan-400/15
                          text-white/50 hover:text-cyan-400 transition-colors text-xs flex items-center gap-1"
                        title="漂移时点击重置居中">
                        <Crosshair size={12} />
                        居中
                      </button>
                    )}
                    {trackingFound && domeEnabled && domeSupported && (
                      <button onClick={() => { engineRef.current?.toggleDome(); setDomeOn(v => !v); }}
                        className={`px-2.5 py-2 rounded-xl transition-colors text-xs flex items-center gap-1
                          ${domeOn
                            ? 'bg-violet-500/25 text-violet-300 hover:bg-violet-500/35'
                            : 'bg-white/5 hover:bg-violet-400/15 text-white/50 hover:text-violet-300'}`}
                        title="在周围展开全景穹顶（再点收回）">
                        <Sparkles size={12} />
                        {domeOn ? '收回穹顶' : '展开穹顶'}
                      </button>
                    )}
                  </div>


                  {/* 缩放 */}
                  <div>
                    <p className="text-[10px] text-white/40 font-medium mb-1.5 uppercase tracking-wider">缩放</p>
                    {['x','y','z'].map(a => (
                      <div key={`ps-${a}`} className="flex items-center gap-1.5 mb-1 last:mb-0">
                        <span className="w-3 text-[10px] font-mono text-white/40 uppercase">{a}</span>
                        <input type="range" min="0.1" max="5" step="0.05"
                          value={scaleVal[a]}
                          onChange={e => handleScale(a, e.target.value)}
                          className="flex-1 accent-amber-500 h-0.5 rounded-full appearance-none bg-white/10 cursor-pointer"
                        />
                        <span className="w-10 text-right text-[10px] font-mono text-white/40 tabular-nums">
                          {scaleVal[a].toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* 旋转 */}
                  <div>
                    <p className="text-[10px] text-white/40 font-medium mb-1.5 uppercase tracking-wider">旋转 Y</p>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 text-[10px] font-mono text-white/40 uppercase">Y</span>
                      <input type="range" min="-180" max="180" step="1"
                        value={rotVal}
                        onChange={e => handleRot(e.target.value)}
                        className="flex-1 accent-emerald-500 h-0.5 rounded-full appearance-none bg-white/10 cursor-pointer"
                      />
                      <span className="w-10 text-right text-[10px] font-mono text-white/40 tabular-nums">
                        {rotVal}°
                      </span>
                    </div>
                  </div>

                  {/* 重置 */}
                  <button onClick={handleReset}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl
                      bg-white/5 hover:bg-rose-400/10 text-white/60 hover:text-rose-400 transition-colors text-xs"
                  >
                    <RotateCcw size={12} />
                    重置所有
                  </button>
                </>
              ) : (
                /* ── 图片/面部追踪专属设置 ── */
                <>
                  {/* 冻结 */}
                  <button onClick={handleFreeze}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors text-xs ${
                      frozen
                        ? 'bg-violet-500/15 text-violet-400'
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    <span className="font-medium">{frozen ? '已固定' : '固定位置'}</span>
                    {frozen ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>


                  {/* 缩放 */}
                  <div>
                    <p className="text-[10px] text-white/40 font-medium mb-1.5 uppercase tracking-wider">缩放</p>
                    {['x','y','z'].map(a => (
                      <div key={`s-${a}`} className="flex items-center gap-1.5 mb-1 last:mb-0">
                        <span className="w-3 text-[10px] font-mono text-white/40 uppercase">{a}</span>
                        <input type="range" min="0.1" max="5" step="0.05"
                          value={scaleVal[a]}
                          onChange={e => handleScale(a, e.target.value)}
                          className="flex-1 accent-amber-500 h-0.5 rounded-full appearance-none bg-white/10 cursor-pointer"
                        />
                        <span className="w-10 text-right text-[10px] font-mono text-white/40 tabular-nums">
                          {scaleVal[a].toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* 旋转 */}
                  <div>
                    <p className="text-[10px] text-white/40 font-medium mb-1.5 uppercase tracking-wider">旋转 Y</p>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 text-[10px] font-mono text-white/40 uppercase">Y</span>
                      <input type="range" min="-180" max="180" step="1"
                        value={rotVal}
                        onChange={e => handleRot(e.target.value)}
                        className="flex-1 accent-emerald-500 h-0.5 rounded-full appearance-none bg-white/10 cursor-pointer"
                      />
                      <span className="w-10 text-right text-[10px] font-mono text-white/40 tabular-nums">
                        {rotVal}°
                      </span>
                    </div>
                  </div>

                  {/* 重置 */}
                  <button onClick={handleReset}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl
                      bg-white/5 hover:bg-rose-400/10 text-white/60 hover:text-rose-400 transition-colors text-xs"
                  >
                    <RotateCcw size={12} />
                    重置所有
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ===== 错误状态 ===== */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur p-4 z-30">
          <div className="max-w-sm w-full text-center">
            <div className="icon-tile icon-tile-lg mx-auto mb-5 !bg-rose-500/10 !text-rose-300">
              <AlertCircle size={32} className="text-rose-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">AR 加载失败</h2>
            <p className="text-sm text-slate-400 mb-2 whitespace-pre-line">{error}</p>
            {error.includes('模型加载失败') && (
              <p className="text-xs text-slate-500 mb-6">
                请确保模型文件可公开访问，且格式为 .glb
              </p>
            )}
            {error.includes('安全上下文') && (
              <p className="text-xs text-amber-400/80 mb-6">
                手机测试建议：使用 localhost 访问开发服务器，或配置 HTTPS
              </p>
            )}
            {secureFixUrl && (
              <button
                onClick={() => window.location.replace(secureFixUrl)}
                className="flex items-center gap-2 mx-auto mb-6 px-5 py-2.5 rounded-xl text-sm font-medium
                  bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
              >
                <Lock size={14} />
                用 HTTPS 打开（摄像头必需）
              </button>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
                  bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors"
              >
                <RefreshCw size={14} />
                重新加载
              </button>
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
                  bg-white/5 text-slate-400 hover:bg-white/10 transition-colors"
              >
                返回首页
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
