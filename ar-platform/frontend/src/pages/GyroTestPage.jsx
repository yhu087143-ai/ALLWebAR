import React, { useEffect, useRef, useState } from 'react';
import { AREngine } from '@ar-platform/engine';

const STYLES = {
  wrap: {
    width: '100vw', height: '100vh', position: 'relative',
    overflow: 'hidden', background: '#000', fontFamily: 'monospace',
  },
  container: { width: '100%', height: '100%' },
  hud: {
    position: 'absolute', top: 12, left: 12, right: 12, zIndex: 20,
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    pointerEvents: 'none', gap: 8,
  },
  panel: {
    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
    padding: '10px 14px', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff', fontSize: 12, lineHeight: 1.6, minWidth: 180,
  },
  debugBtn: {
    position: 'absolute', bottom: 100, left: 12, zIndex: 30,
    background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 11,
    cursor: 'pointer', fontFamily: 'monospace',
  },
  hint: {
    position: 'absolute', bottom: 130, left: '50%', transform: 'translateX(-50%)',
    zIndex: 20, color: 'rgba(255,255,255,0.4)', fontSize: 12,
    textAlign: 'center', pointerEvents: 'none',
  },
};

const MAX_LOG = 100;
const logBuffer = [];
const _origLog = console.log;
const _origWarn = console.warn;
const _origError = console.error;
function captureLog(level, args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a).slice(0, 200) : String(a)).join(' ');
  const entry = `[${new Date().toLocaleTimeString()}] ${level} ${msg}`;
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG) logBuffer.shift();
  if (window.__debugLogs) window.__debugLogs.push(entry);
  if (window.__debugLogs?.length > MAX_LOG) window.__debugLogs.shift();
}
console.log = (...a) => { captureLog('LOG', a); _origLog.apply(console, a); };
console.warn = (...a) => { captureLog('WARN', a); _origWarn.apply(console, a); };
console.error = (...a) => { captureLog('ERR', a); _origError.apply(console, a); };

const MODE_LABELS = { horizontal: '水平面', vertical: '垂直面', any: '任意平面' };
const MODE_CYCLE = ['horizontal', 'vertical', 'any'];
const Q_COLORS = { good: '#34d399', fair: '#fcd34d', poor: '#fb7185', unknown: '#94a3b8' };
const Q_LABELS = { good: '优', fair: '中', poor: '差', unknown: '未知' };

// ── 调试面板样式 ──

const DP = {
  overlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
    background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)',
    borderTop: '1px solid rgba(255,255,255,0.15)',
    color: '#e2e8f0', fontSize: 10, fontFamily: 'monospace',
    padding: 8, maxHeight: '45vh', overflowY: 'auto',
    lineHeight: 1.4,
  },
  // 状态条 — 关键指标一行
  statusBar: {
    display: 'flex', flexWrap: 'wrap', gap: '4px 10px',
    padding: '4px 0 8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  statusItem: (color) => ({
    color: color || '#ccc', fontSize: 10, whiteSpace: 'nowrap',
  }),
  // 分类标题
  section: {
    marginBottom: 6,
  },
  sectionTitle: {
    color: '#5eead4', fontSize: 10, fontWeight: 'bold',
    borderBottom: '1px solid rgba(94,234,212,0.2)',
    paddingBottom: 2, marginBottom: 4, cursor: 'pointer',
    userSelect: 'none',
  },
  // 数据行
  row: {
    display: 'flex', justifyContent: 'space-between',
    padding: '1px 4px', borderRadius: 2,
  },
  rowLabel: { color: '#94a3b8' },
  rowValue: (color) => ({ color: color || '#e2e8f0', fontWeight: 'bold' }),
  // 问题指示器
  badge: (color, bg) => ({
    display: 'inline-block', padding: '1px 5px', borderRadius: 4,
    fontSize: 9, fontWeight: 'bold', color, background: bg,
    marginLeft: 4,
  }),
};

// 颜色辅助
const V = (v, digits = 4) => typeof v === 'number' ? v.toFixed(digits) : String(v);
const GREEN = '#34d399', YELLOW = '#fcd34d', RED = '#fb7185', GRAY = '#94a3b8', CYAN = '#5eead4';

function objStr(v) {
  if (!v || typeof v !== 'object') return '-';
  const x = typeof v.x === 'number' ? v.x.toFixed(3) : v.x;
  const y = typeof v.y === 'number' ? v.y.toFixed(3) : v.y;
  const z = typeof v.z === 'number' ? v.z.toFixed(3) : v.z;
  return `(${x}, ${y}, ${z})`;
}

// 调试数据行
function DRow({ label, value, color }) {
  return (
    <div style={DP.row}>
      <span style={DP.rowLabel}>{label}</span>
      <span style={DP.rowValue(color)}>{value}</span>
    </div>
  );
}

// 带指示器的行
function DRowBadge({ label, value, badge: badgeText, badgeColor, badgeBg }) {
  return (
    <div style={DP.row}>
      <span style={DP.rowLabel}>{label}</span>
      <span style={DP.rowValue()}>
        {value}
        {badgeText && <span style={DP.badge(badgeColor, badgeBg)}>{badgeText}</span>}
      </span>
    </div>
  );
}

// ── 格式化调试信息为纯文本 ──
function formatDebugText(d) {
  if (!d) return '(no debug info)';
  const lines = [];

  // 状态栏
  const fpsColor = d.fps >= 25 ? '优' : d.fps >= 15 ? '中' : '差';
  const driftBadge = d.isPlaced && d.isFrozen ? '冻结' : d.isPlaced && d.isMoving ? '移动中' : d.isPlaced ? '已放置' : '未放置';
  lines.push(`[状态] FPS ${d.fps}(${fpsColor}) | 特征 ${d.featureCount} | 抖动 ${d.avgJitter.toFixed(4)} | ZNCC ${d.relocZncc.toFixed(3)} | ${driftBadge} | ${d.relocCaptured ? `修正×${d.relocTotal}` : '未捕获'}`);

  // 相机与追踪
  lines.push(`\n[相机与追踪]`);
  lines.push(`  引擎: ${d.engineType}`);
  lines.push(`  原始位姿: (${d.rawPos.x.toFixed(3)}, ${d.rawPos.y.toFixed(3)}, ${d.rawPos.z.toFixed(3)})`);
  lines.push(`  平滑位姿: (${d.smoothPos.x.toFixed(3)}, ${d.smoothPos.y.toFixed(3)}, ${d.smoothPos.z.toFixed(3)})`);
  if (d.isPlaced) {
    lines.push(`  放置基准: (${d.worldPos.x.toFixed(3)}, ${d.worldPos.y.toFixed(3)}, ${d.worldPos.z.toFixed(3)})`);
  }

  // 抖动补偿
  lines.push(`\n[抖动补偿]`);
  lines.push(`  jitter: (${d.jitter.x.toFixed(5)}, ${d.jitter.y.toFixed(5)}, ${d.jitter.z.toFixed(5)})`);
  lines.push(`  jitter 幅度: ${d.jitterMag.toFixed(5)}`);
  lines.push(`  avgJitter: ${d.avgJitter.toFixed(5)}`);
  lines.push(`  isMoving: ${d.isMoving ? '是' : '否'}`);
  lines.push(`  alpha: ${d.stabAlpha.toFixed(4)}`);
  lines.push(`  冻结: ${d.isFrozen ? '是' : '否'}`);
  if (d.isFrozen) {
    lines.push(`  锁定位姿: (${d.lockPos.x.toFixed(3)}, ${d.lockPos.y.toFixed(3)}, ${d.lockPos.z.toFixed(3)})`);
  }

  // 放置状态
  lines.push(`\n[放置状态]`);
  if (!d.isPlaced) {
    lines.push(`  未放置`);
  } else {
    lines.push(`  放置基准: (${d.worldPos.x.toFixed(3)}, ${d.worldPos.y.toFixed(3)}, ${d.worldPos.z.toFixed(3)})`);
    lines.push(`  物体位置: (${d.objectPos.x.toFixed(3)}, ${d.objectPos.y.toFixed(3)}, ${d.objectPos.z.toFixed(3)})`);
    lines.push(`  锁定位姿: (${d.lockPos.x.toFixed(3)}, ${d.lockPos.y.toFixed(3)}, ${d.lockPos.z.toFixed(3)})`);
  }

  // 重定位器
  lines.push(`\n[重定位器]`);
  if (!d.relocCaptured) {
    lines.push(`  未捕获参考帧`);
  } else {
    lines.push(`  ZNCC: ${d.relocZncc.toFixed(4)}`);
    lines.push(`  累积修正: ${d.relocTotal} 次`);
    lines.push(`  参考帧银行: ${d.relocBankSize} 帧`);
    lines.push(`  冷却: ${d.relocCooldownMs > 0 ? `${(d.relocCooldownMs / 1000).toFixed(1)}s (冷却中)` : '无'}`);
  }

  // 视觉特征
  lines.push(`\n[视觉特征]`);
  const qLabels = { good: '优', fair: '中', poor: '差', unknown: '未知' };
  lines.push(`  特征点数: ${d.featureCount}`);
  lines.push(`  置信度: ${d.featureConfidence.toFixed(3)}`);
  lines.push(`  质量评级: ${qLabels[d.featureQuality] || d.featureQuality}`);

  // 平面检测
  lines.push(`\n[平面检测]`);
  lines.push(`  平面检测: ${d.planeDetectionEnabled ? '已启用' : '已禁用'}`);
  lines.push(`  准星可见: ${d.reticleVisible ? '是' : '否'}`);

  // 问题诊断
  lines.push(`\n[问题诊断]`);
  const issues = [];
  if (d.fps < 15) issues.push(`FPS < 15 — 严重丢帧，渲染/CPU过载 (当前 ${d.fps})`);
  else if (d.fps < 25) issues.push(`FPS < 25 — 轻微掉帧 (当前 ${d.fps})`);
  if (d.avgJitter > 0.03) issues.push(`avgJitter > 0.03 — 抖动过大 (当前 ${d.avgJitter.toFixed(4)})`);
  if (d.isFrozen) issues.push('特征丢失 → 已冻结 — SLAM 不可靠，物体锁定在放置位置');
  if (d.isPlaced && d.isMoving) issues.push('手机移动中 — 平滑跟踪滞后可能导致物体偏移');
  if (d.relocTotal > 20) issues.push(`重定位修正 ${d.relocTotal} 次 — 可能频繁误触发`);
  if (d.featureCount < 5) issues.push(`特征点 < 5 — 画面缺乏纹理，SLAM 可能失效 (当前 ${d.featureCount})`);
  if (d.relocCooldownMs > 0) issues.push('重定位冷却中 — 防频繁修正');
  if (d.reticleVisible && !d.isPlaced) issues.push('准星可见但未放置 — 等待点击');
  if (issues.length === 0) issues.push('无异常');
  issues.forEach(msg => lines.push(`  • ${msg}`));

  return lines.join('\n');
}

// ── 主组件 ──

export default function GyroTestPage() {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('initializing');
  const [provider, setProvider] = useState('');
  const [error, setError] = useState('');
  const engineRef = useRef(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [logs, setLogs] = useState([]);
  const [featureQuality, setFeatureQuality] = useState(null);
  const [planeMode, setPlaneMode] = useState('horizontal');
  const frameCountRef = useRef(0);
  const fpsTimeRef = useRef(performance.now());

  useEffect(() => {
    window.__debugLogs = [];
    let cancelled = false;
    let engine = null;
    let fpsInterval = null;
    let debugInterval = null;

    const timer = setTimeout(async () => {
      const params = new URLSearchParams(location.search);
      const container = containerRef.current;
      if (!container || cancelled) return;

      setStatus('loading');

      engine = new AREngine(container, {
        videoUrl: params.get('video') || undefined,
        modelUrl: params.get('model') || '',
        tracking: params.get('tracking') || 'plane',
        engine: params.get('engine') || undefined,
        scale: parseFloat(params.get('scale') || '1'),
        planeMode: params.get('planeMode') || undefined,
      });
      engineRef.current = engine;

      engine.onModelStatus = (s, pct) => {
        console.log('[GyroTest] onModelStatus:', s, pct);
        if (s === 'loaded') {
          setStatus('placed');
        } else if (s === 'error') {
          setStatus('error');
        }
      };

      engine.onFeatureQuality = (q) => {
        setFeatureQuality(q);
      };

      try {
        await engine.start();
        if (cancelled) { engine.stop(); return; }
        setStatus('ready');
        console.log('[GyroTest] engine.start() OK');

        setTimeout(() => {
          const mgr = engine['_orientationManager'];
          if (mgr) {
            setProvider(mgr.activeProviderName);
            console.log('[GyroTest] orientation provider:', mgr.activeProviderName);
          } else {
            console.warn('[GyroTest] 无 _orientationManager');
          }
        }, 2000);

        // 每 500ms 刷新调试面板
        fpsInterval = setInterval(() => {
          const now = performance.now();
          const dt = now - fpsTimeRef.current;
          const frames = frameCountRef.current;
          fpsTimeRef.current = now;
          frameCountRef.current = 0;
          const fps = Math.round(frames / (dt / 1000));
          setLogs([...(window.__debugLogs || [])]);
        }, 500);

        // 每 500ms 读取 DebugInfo（FPS 由适配器内部统计）
        debugInterval = setInterval(() => {
          const di = engine.getDebugInfo?.();
          if (di) {
            setDebugInfo({ ...di });
          }
        }, 500);

        const countFrame = () => { frameCountRef.current++; requestAnimationFrame(countFrame); };
        requestAnimationFrame(countFrame);
      } catch (err) {
        if (!cancelled) {
          const msg = err?.message || String(err);
          console.error('[GyroTest] start error:', msg);
          setError(msg);
          setStatus('error');
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (fpsInterval) clearInterval(fpsInterval);
      if (debugInterval) clearInterval(debugInterval);
      if (engine) { engine.stop(); engineRef.current = null; }
    };
  }, []);

  const toggleSection = (key) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const renderSection = (title, key, content) => {
    const isCol = collapsed[key];
    return (
      <div style={DP.section}>
        <div style={DP.sectionTitle} onClick={() => toggleSection(key)}>
          {isCol ? '▶' : '▼'} {title}
        </div>
        {!isCol && content}
      </div>
    );
  };

  // ── 状态栏关键指标 ──
  const renderStatusBar = (d) => {
    if (!d) return null;
    const fpsColor = d.fps >= 25 ? GREEN : d.fps >= 15 ? YELLOW : RED;
    const featureColor = Q_COLORS[d.featureQuality] || GRAY;
    const jitterColor = d.avgJitter < 0.01 ? GREEN : d.avgJitter < 0.03 ? YELLOW : RED;
    const driftBadge = d.isPlaced && d.isFrozen ? '已冻结' :
      d.isPlaced && d.isMoving ? '移动中' :
      d.isPlaced ? '已放置' : null;
    const driftColor = d.isFrozen ? CYAN : d.isMoving ? YELLOW : GREEN;

    return (
      <div style={DP.statusBar}>
        <span style={DP.statusItem(fpsColor)}>FPS {d.fps}</span>
        <span style={DP.statusItem(featureColor)}>特征 {d.featureCount}</span>
        <span style={DP.statusItem(jitterColor)}>抖动 {V(d.avgJitter, 4)}</span>
        <span style={DP.statusItem(GREEN)}>ZNCC {V(d.relocZncc, 3)}</span>
        <span style={DP.statusItem(driftColor)}>
          {driftBadge || (d.isPlaced ? '已放置' : '未放置')}
        </span>
        <span style={DP.statusItem(d.relocCaptured ? GREEN : GRAY)}>
          {d.relocCaptured ? `修正×${d.relocTotal}` : '未捕获'}
        </span>
      </div>
    );
  };

  // ── 各分类面板 ──
  const renderCamTracking = (d) => (
    <div>
      <DRow label="引擎" value={d.engineType} color={CYAN} />
      <DRow label="原始位姿" value={objStr(d.rawPos)} color="#e2e8f0" />
      <DRow label="平滑位姿" value={objStr(d.smoothPos)} color={GREEN} />
      {d.isPlaced && (
        <DRow label="放置基准" value={objStr(d.worldPos)} color={CYAN} />
      )}
    </div>
  );

  const renderStabilization = (d) => {
    const jMag = d.jitterMag;
    const jColor = jMag < 0.005 ? GREEN : jMag < 0.02 ? YELLOW : RED;
    const avgColor = d.avgJitter < 0.01 ? GREEN : d.avgJitter < 0.03 ? YELLOW : RED;
    return (
      <div>
        <DRow label="jitter" value={objStr(d.jitter)} color={jColor} />
        <DRow label="jitter 幅度" value={V(jMag, 5)} color={jColor} />
        <DRow label="avgJitter" value={V(d.avgJitter, 5)} color={avgColor} />
        <DRowBadge label="isMoving" value={d.isMoving ? '是' : '否'}
          badge={d.isMoving ? '移动中' : null} badgeColor="#fff" badgeBg="rgba(251,191,36,0.3)" />
        <DRow label="alpha" value={V(d.stabAlpha, 4)} color={CYAN} />
        <DRowBadge label="冻结" value={d.isFrozen ? '是' : '否'}
          badge={d.isFrozen ? '已冻结' : null} badgeColor={CYAN} badgeBg="rgba(94,234,212,0.2)" />
        {d.isFrozen && <DRow label="锁定位姿" value={objStr(d.lockPos)} color={CYAN} />}
      </div>
    );
  };

  const renderPlacement = (d) => {
    if (!d.isPlaced) return <div style={{ color: GRAY }}>未放置</div>;
    const worldColor = GREEN;
    const objColor = d.objectPos.x !== d.worldPos.x || d.objectPos.y !== d.worldPos.y
      ? YELLOW : GREEN;
    return (
      <div>
        <DRow label="放置基准 (world)" value={objStr(d.worldPos)} color={worldColor} />
        <DRow label="物体位置 (object)" value={objStr(d.objectPos)} color={objColor} />
        <DRow label="锁定位姿" value={objStr(d.lockPos)} color={d.isFrozen ? CYAN : GRAY} />
      </div>
    );
  };

  const renderRelocalizer = (d) => {
    if (!d.relocCaptured) return <div style={{ color: GRAY }}>未捕获参考帧</div>;
    const znccColor = d.relocZncc > 0.78 ? GREEN : d.relocZncc > 0.65 ? YELLOW : GRAY;
    const cooldownActive = d.relocCooldownMs > 0;
    return (
      <div>
        <DRow label="ZNCC" value={V(d.relocZncc, 4)} color={znccColor} />
        <DRow label="累积修正" value={`${d.relocTotal} 次`} color={CYAN} />
        <DRow label="参考帧银行" value={`${d.relocBankSize} 帧`} color="#e2e8f0" />
        <DRowBadge label="冷却" value={cooldownActive ? `${V(d.relocCooldownMs/1000, 1)}s` : '无'}
          badge={cooldownActive ? '冷却中' : null}
          badgeColor={YELLOW} badgeBg="rgba(251,191,36,0.2)" />
      </div>
    );
  };

  const renderFeatures = (d) => {
    const qColor = Q_COLORS[d.featureQuality] || GRAY;
    const confColor = d.featureConfidence > 0.5 ? GREEN : d.featureConfidence > 0.2 ? YELLOW : RED;
    return (
      <div>
        <DRow label="特征点数" value={d.featureCount} color={qColor} />
        <DRow label="置信度" value={V(d.featureConfidence, 3)} color={confColor} />
        <DRow label="质量评级" value={Q_LABELS[d.featureQuality] || d.featureQuality} color={qColor} />
      </div>
    );
  };

  const renderPlaneDetection = (d) => (
    <div>
      <DRow label="平面检测" value={d.planeDetectionEnabled ? '已启用' : '已禁用'} color={d.planeDetectionEnabled ? GREEN : RED} />
      <DRow label="准星可见" value={d.reticleVisible ? '是' : '否'} color={d.reticleVisible ? GREEN : GRAY} />
    </div>
  );

  return (
    <div style={STYLES.wrap}>
      <div ref={containerRef} style={STYLES.container} />

      {/* 返回出口：该页原本没有任何回主站的入口 */}
      <a
        href="/"
        style={{ ...STYLES.debugBtn, top: 12, right: 12, left: 'auto', bottom: 'auto', textDecoration: 'none' }}
      >
        返回首页
      </a>

      {/* HUD */}
      <div style={STYLES.hud}>
        <div style={STYLES.panel}>
          <div>状态: <span style={{ color: status === 'placed' ? '#34d399' : status === 'error' ? '#fb7185' : '#fcd34d' }}>{status}</span></div>
          {debugInfo && (
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
              FPS {debugInfo.fps} · 特征 {debugInfo.featureCount} · ZNCC {V(debugInfo.relocZncc, 3)}
              {debugInfo.isPlaced && (
                <span style={{ color: debugInfo.isFrozen ? '#5eead4' : debugInfo.isMoving ? '#fcd34d' : '#34d399', marginLeft: 6 }}>
                  {debugInfo.isFrozen ? '已冻结' : debugInfo.isMoving ? '移动中' : '稳定'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          position: 'absolute', bottom: 170, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, background: 'rgba(239,68,68,0.9)', color: '#fff',
          padding: '12px 24px', borderRadius: 12, fontSize: 13, maxWidth: '85%', textAlign: 'center',
        }}>
          {error}
        </div>
      )}

      {/* 重新放置按钮 */}
      {status === 'placed' && (
        <button
          style={{
            ...STYLES.debugBtn,
            bottom: 140,
            background: 'rgba(52,211,153,0.25)',
            border: '1px solid rgba(52,211,153,0.5)',
          }}
          onClick={() => {
            engineRef.current?.replacePlacedObject?.()
            setStatus('ready')
            setFeatureQuality(null)
          }}
        >
          重新放置
        </button>
      )}

      {/* 放置面模式切换按钮 */}
      <button
        style={{
          ...STYLES.debugBtn,
          bottom: 66,
          background: planeMode === 'horizontal' ? 'rgba(94,234,212,0.25)' : planeMode === 'vertical' ? 'rgba(251,191,36,0.25)' : 'rgba(167,139,250,0.25)',
          border: '1px solid rgba(255,255,255,0.3)',
        }}
        onClick={() => {
          const idx = MODE_CYCLE.indexOf(planeMode)
          const next = MODE_CYCLE[(idx + 1) % 3]
          setPlaneMode(next)
          engineRef.current?.setPlacementMode?.(next)
        }}
      >
        {MODE_LABELS[planeMode]}
      </button>

      {/* 调试面板开关 */}
      <button style={STYLES.debugBtn} onClick={() => setDebugOpen(o => !o)}>
        {debugOpen ? '关闭调试' : '调试面板'}
      </button>

      <div style={STYLES.hint}>
        点击屏幕放置 · 旋转手机测试稳定性
        {status === 'placed' && <span style={{ color: '#34d399', display: 'block', marginTop: 4 }}>已放置</span>}
      </div>

      {/* ── 调试面板 ── */}
      {debugOpen && (
        <div style={DP.overlay}>
          {debugInfo ? (
            <>
              {renderStatusBar(debugInfo)}

              {renderSection('相机与追踪', 'cam', renderCamTracking(debugInfo))}
              {renderSection('抖动补偿', 'stab', renderStabilization(debugInfo))}
              {renderSection('放置状态', 'place', renderPlacement(debugInfo))}
              {renderSection('重定位器', 'reloc', renderRelocalizer(debugInfo))}
              {renderSection('视觉特征', 'feat', renderFeatures(debugInfo))}
              {renderSection('平面检测', 'plane', renderPlaneDetection(debugInfo))}

              {/* 问题诊断区 */}
              <div style={{ ...DP.section, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6 }}>
                <div style={{ color: RED, fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>问题诊断</div>
                {(() => {
                  const d = debugInfo;
                  const issues = [];
                  if (d.fps < 15) issues.push('FPS < 15 — 严重丢帧，渲染/CPU过载');
                  else if (d.fps < 25) issues.push('FPS < 25 — 轻微掉帧');
                  if (d.avgJitter > 0.03) issues.push('avgJitter > 0.03 — 抖动过大，需检查稳定性滤波');
                  if (d.isFrozen) issues.push('特征丢失 → 已冻结 — SLAM 不可靠，物体锁定在放置位置');
                  if (d.isPlaced && d.isMoving) issues.push('手机移动中 — 平滑跟踪滞后可能导致物体偏移');
                  if (d.relocTotal > 20) issues.push(`重定位修正 ${d.relocTotal} 次 — 可能频繁误触发`);
                  if (d.featureCount < 5) issues.push('特征点 < 5 — 画面缺乏纹理，SLAM 可能失效');
                  if (d.relocCooldownMs > 0) issues.push('重定位冷却中 — 防频繁修正');
                  if (d.reticleVisible && !d.isPlaced) issues.push('准星可见但未放置 — 等待点击');
                  if (issues.length === 0) issues.push('无异常');
                  return issues.map((msg, i) => (
                    <div key={i} style={{ color: msg === '无异常' ? GREEN : YELLOW, fontSize: 9, padding: '1px 0' }}>• {msg}</div>
                  ));
                })()}
              </div>

              {/* 日志 */}
              <div style={{ ...DP.section, marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ color: GRAY, fontSize: 9 }}>日志 (最新 {MAX_LOG} 条)</span>
                  <button
                    onClick={() => {
                      const allLogs = logBuffer.join('\n');
                      const formatted = formatDebugText(debugInfo);
                      const raw = debugInfo ? JSON.stringify(debugInfo, null, 2) : '(no debug info)';
                      const text = `=== 调试面板 ===\n${formatted}\n\n=== 原始数据 ===\n${raw}\n\n=== 日志 ===\n${allLogs}`;
                      navigator.clipboard.writeText(text).then(() => {
                        const btn = document.activeElement;
                        if (btn) { btn.textContent = '已复制'; setTimeout(() => { btn.textContent = '复制'; }, 1500); }
                      }).catch(() => {
                        // fallback
                        const ta = document.createElement('textarea');
                        ta.value = text;
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                      });
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                      color: '#ccc', borderRadius: 4, padding: '2px 8px', fontSize: 9,
                      cursor: 'pointer', fontFamily: 'monospace',
                    }}
                  >复制</button>
                </div>
                <div style={{ maxHeight: 80, overflowY: 'auto' }}>
                  {logs.length === 0 && <div style={{ color: '#555' }}>等待日志...</div>}
                  {logs.map((l, i) => (
                    <div key={i} style={{
                      fontSize: 8, color: l.includes('ERR') ? RED : l.includes('WARN') ? YELLOW : '#999',
                    }}>{l}</div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: GRAY, padding: 8 }}>等待调试数据...</div>
          )}
        </div>
      )}
    </div>
  );
}
