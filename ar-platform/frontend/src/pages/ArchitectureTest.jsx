import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Home,
  ChevronRight,
  RotateCw,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

/* ------------------------------------------------------------------
   引擎自检
   逐项构造引擎导出的模块，验证「能 import、能实例化、API 在位」。
   只做构造级检查，不假设运行时（XR8 / MindAR）已就绪。
   ------------------------------------------------------------------ */

const yes = (v) => (v ? '是' : '否');

const CASES = [
  {
    id: 'eventbus',
    name: 'EventBus',
    run: async ({ EventBus }) => {
      const bus = new EventBus();
      let received = '';
      const unsub = bus.on('tracking:found', (d) => {
        received = d.type;
      });
      bus.emit('tracking:found', { type: 'image-tracking' });
      unsub();
      bus.emit('tracking:found', { type: 'face-tracking' });
      return {
        ok: received === 'image-tracking',
        detail: `订阅 / 取消 / 触发；取消订阅后不再收到事件 · ${yes(received === 'image-tracking')}`,
      };
    },
  },
  {
    id: 'registry',
    name: 'CapabilityRegistry',
    run: async ({ CapabilityRegistry, CapabilityType }) => {
      const registry = new CapabilityRegistry();
      registry.register(CapabilityType.ImageTracking, () => ({
        type: CapabilityType.ImageTracking,
        dependencies: [],
        onRegister: () => {},
        onStart: async () => {},
        onUpdate: () => {},
        onStop: async () => {},
        onDispose: () => {},
        isActive: false,
      }));
      const registered = registry.isRegistered(CapabilityType.ImageTracking);
      const unregistered = registry.isRegistered(CapabilityType.WorldTracking);
      return {
        ok: registered && !unregistered,
        detail: `已注册项可查到 · ${yes(registered)}；未注册项查不到 · ${yes(!unregistered)}`,
      };
    },
  },
  {
    id: 'factory',
    name: 'EngineAdapterFactory',
    run: async ({ selectEngine, EngineType, CapabilityType }) => {
      const image = await selectEngine({
        engine: 'auto',
        capabilities: [{ type: CapabilityType.ImageTracking, targetUrl: '' }],
      });
      const world = await selectEngine({
        engine: 'auto',
        capabilities: [{ type: CapabilityType.WorldTracking }],
      });
      const imageOk = image === EngineType.MindAR;
      const worldOk = world === EngineType.EightWall;
      return {
        ok: imageOk && worldOk,
        detail: `图片追踪选中 MindAR · ${yes(imageOk)}；世界追踪选中 8th Wall · ${yes(worldOk)}`,
      };
    },
  },
  {
    id: 'scene',
    name: 'SceneManager',
    run: async ({ SceneManager }) => {
      const sm = new SceneManager();
      sm.setup();
      const hasLights = sm.scene.children.length > 0;
      sm.dispose();
      return { ok: hasLights, detail: `建场并加入灯光 · ${yes(hasLights)}` };
    },
  },
  {
    id: 'model',
    name: 'ModelManager',
    run: async ({ ModelManager }) => {
      const mm = new ModelManager();
      const hasLoad = typeof mm.load === 'function';
      return { ok: hasLoad, detail: `实例化，load() 存在 · ${yes(hasLoad)}` };
    },
  },
  {
    id: 'rotator',
    name: 'TouchRotator',
    run: async ({ TouchRotator }) => {
      const tr = new TouchRotator();
      const ok = tr.rotation !== undefined;
      return { ok, detail: `实例化并可读旋转量 · ${yes(ok)}` };
    },
  },
  {
    id: 'projection',
    name: 'ProjectionAdapter',
    run: async ({ ProjectionAdapter }) => {
      const pa = new ProjectionAdapter();
      const ok = typeof pa.verticalFov === 'number';
      return { ok, detail: `实例化并给出垂直视场角（${pa.verticalFov}）· ${yes(ok)}` };
    },
  },
  {
    id: 'loader',
    name: 'ScriptLoader',
    run: async ({ loadScript, waitForGlobal }) => {
      const ok = typeof loadScript === 'function' && typeof waitForGlobal === 'function';
      return { ok, detail: `loadScript / waitForGlobal 均为函数 · ${yes(ok)}` };
    },
  },
  {
    id: 'enums',
    name: 'Types (enums)',
    run: async ({ EngineType, CapabilityType }) => {
      const mindar = EngineType.MindAR === 'mindar';
      const eightwall = EngineType.EightWall === '8thwall';
      const world = CapabilityType.WorldTracking === 'world-tracking';
      return {
        ok: mindar && eightwall && world,
        detail: `EngineType.MindAR=${yes(mindar)}，EngineType.EightWall=${yes(eightwall)}，CapabilityType.WorldTracking=${yes(world)}`,
      };
    },
  },
  {
    id: 'eightwall',
    name: 'EightWallAdapter',
    run: async ({ EightWallAdapter }) => {
      const adapter = new EightWallAdapter();
      const typeOk = adapter.type === '8thwall';
      const caps = adapter.getSupportedCapabilities();
      const hasWorld = caps.includes('world-tracking');
      return {
        ok: typeOk && hasWorld,
        detail: `type 正确 · ${yes(typeOk)}；声明能力 ${caps.length} 项，含 world-tracking · ${yes(hasWorld)}`,
      };
    },
  },
  {
    id: 'capabilities',
    name: 'CapabilityModules',
    run: async ({ WorldTrackingModule, FaceEffectsModule, SkyEffectsModule }) => {
      const wt = new WorldTrackingModule();
      const fe = new FaceEffectsModule();
      const se = new SkyEffectsModule();
      const checks = [
        wt.type === 'world-tracking',
        fe.type === 'face-effects',
        se.type === 'sky-effects',
        wt.isActive === false,
        fe.isActive === false,
      ];
      return {
        ok: checks.every(Boolean),
        detail: `世界追踪 / 人脸特效 / 天空特效三块类型正确且初始未激活 · ${yes(checks.every(Boolean))}`,
      };
    },
  },
  {
    id: 'instantiate',
    name: 'instantiateEngine',
    run: async ({ instantiateEngine, EngineType }) => {
      const adapter = instantiateEngine(EngineType.EightWall);
      const ok = adapter.type === '8thwall';
      return { ok, detail: `按 EngineType 直接实例化适配器 · ${yes(ok)}` };
    },
  },
];

export default function ArchitectureTest() {
  const [rows, setRows] = useState(null);
  const [fatal, setFatal] = useState('');
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setFatal('');
    try {
      const E = await import('@ar-platform/engine');
      const out = [];
      for (const c of CASES) {
        try {
          const r = await c.run(E);
          out.push({ id: c.id, name: c.name, ok: true, ...r });
        } catch (e) {
          out.push({ id: c.id, name: c.name, ok: false, detail: e?.message || String(e) });
        }
      }
      setRows(out);
    } catch (e) {
      setFatal(e?.message || String(e));
      setRows(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const total = rows?.length ?? 0;
  const passed = rows?.filter((r) => r.ok).length ?? 0;
  const allOk = total > 0 && passed === total;

  return (
    <div className="page-wrap page-body page-wrap-wide">
      {/* 面包屑 */}
      <nav aria-label="面包屑" className="crumb">
        <Home size={12} strokeWidth={1.7} aria-hidden="true" />
        <Link to="/">首页</Link>
        <ChevronRight size={11} strokeWidth={2} aria-hidden="true" className="crumb-sep" />
        <span aria-current="page">引擎自检</span>
      </nav>

      {/* 页头 */}
      <header className="page-head mt-7">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="icon-tile icon-tile-lg mt-0.5">
              <Activity size={20} strokeWidth={1.6} aria-hidden="true" className="text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h1 className="page-title">引擎模块自检</h1>
              <p className="page-sub">
                逐个引入 <span className="code">@ar-platform/engine</span> 的导出项并实例化，
                确认构建产物与类型导出都到位。只做构造级检查，不代表运行时追踪可用。
              </p>
            </div>
          </div>

          <button type="button" onClick={run} disabled={busy} className="btn-ghost btn-sm disabled:opacity-50">
            {busy ? (
              <Loader2 size={14} strokeWidth={2} className="animate-spin" aria-hidden="true" />
            ) : (
              <RotateCw size={14} strokeWidth={1.9} aria-hidden="true" />
            )}
            重新运行
          </button>
        </div>
        <div className="page-rule" />
      </header>

      {/* 汇总 */}
      <section className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.055] sm:grid-cols-3">
        <div className="bg-ar-dark px-5 py-5">
          <div className="stat-value">{busy && !rows ? '—' : `${passed}/${total}`}</div>
          <div className="stat-label">模块通过</div>
        </div>
        <div className="bg-ar-dark px-5 py-5">
          <div className="stat-value">{rows ? total - passed : '—'}</div>
          <div className="stat-label">模块失败</div>
        </div>
        <div className="col-span-2 bg-ar-dark px-5 py-5 sm:col-span-1">
          <div className="flex items-center gap-2">
            {allOk ? (
              <CheckCircle2 size={15} strokeWidth={1.8} aria-hidden="true" className="text-emerald-300" />
            ) : (
              <ShieldAlert size={15} strokeWidth={1.8} aria-hidden="true" className="text-amber-300" />
            )}
            <span className={`badge ${allOk ? 'badge-ok' : rows ? 'badge-bad' : 'badge-mute'}`}>
              {allOk ? '全部通过' : rows ? '存在失败项' : '检测中'}
            </span>
          </div>
          <div className="stat-label mt-2">
            {allOk ? '架构基础层可用' : '见下方失败项详情'}
          </div>
        </div>
      </section>

      {/* 致命错误 */}
      {fatal && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-xl border border-rose-400/25 bg-rose-500/[0.08] px-4 py-3"
        >
          <XCircle size={16} strokeWidth={1.9} aria-hidden="true" className="mt-0.5 shrink-0 text-rose-300" />
          <div>
            <p className="text-[0.82rem] text-rose-200">无法加载引擎包</p>
            <p className="mt-1 font-mono text-[0.72rem] leading-relaxed text-rose-300/80">{fatal}</p>
            <p className="mt-2 text-[0.72rem] leading-relaxed text-slate-500">
              常见原因：引擎源码改动后未重建。执行 <span className="code">cd ar-engine &amp;&amp; npx vite build &amp;&amp; npx tsc --emitDeclarationOnly</span>
            </p>
          </div>
        </div>
      )}

      {/* 结果 */}
      {rows && (
        <section className="panel mt-5 overflow-hidden">
          <div className="panel-head">
            <h2 className="panel-title">逐项结果</h2>
            <span className="tabular text-[0.7rem] text-slate-600">{total} 项</span>
          </div>

          <ul aria-live="polite" className="divide-y divide-white/[0.05]">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                {r.ok ? (
                  <CheckCircle2
                    size={16}
                    strokeWidth={1.9}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-emerald-300"
                  />
                ) : (
                  <XCircle
                    size={16}
                    strokeWidth={1.9}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-rose-300"
                  />
                )}

                <span className="w-[11.5rem] shrink-0 font-mono text-[0.78rem] text-slate-200">
                  {r.name}
                </span>

                <span className={`badge shrink-0 ${r.ok ? 'badge-ok' : 'badge-bad'}`}>
                  {r.ok ? '通过' : '失败'}
                </span>

                <span className="min-w-0 flex-1 break-words text-[0.75rem] leading-relaxed text-slate-500">
                  {r.detail}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 检测中 */}
      {busy && !rows && (
        <div role="status" className="panel mt-5 flex items-center gap-3 px-5 py-8">
          <Loader2 size={16} strokeWidth={2} className="animate-spin text-violet-300" aria-hidden="true" />
          <span className="text-[0.82rem] text-slate-500">正在逐个加载引擎模块…</span>
        </div>
      )}

      {/* 说明 */}
      <section className="panel panel-flat mt-5 px-5 py-5">
        <h2 className="panel-title">关于这项检查</h2>
        <ul className="mt-3 space-y-2 text-[0.75rem] leading-relaxed text-slate-500">
          <li>全部通过只说明引擎的模块导出、构造与枚举定义是完整的，不涉及真实追踪效果。</li>
          <li>
            部分模块虽然可用，但当前没有接线到运行时（例如 CapabilityRegistry、TouchRotator、
            ProjectionAdapter），属于已实现但暂时不可达的能力。
          </li>
          <li>
            <span className="text-slate-400">平面检测没有独立的 capability 模块</span>
            ：它由适配器内部创建（<span className="code">EightWallAdapter.createPlaneDetectionModule()</span>，
            WebXR 走 <span className="code">hit-test</span> 路径），所以这里只检查 world / face / sky 三块。
          </li>
          <li>
            另外 <span className="code">capabilities/face-tracking</span> 与
            {' '}<span className="code">capabilities/greeting-text</span> 目前是空目录，属于尚未实现的部分。
          </li>
          <li>真实追踪能力请在导览演示或 AR 展示页用摄像头验证。</li>
        </ul>
      </section>
    </div>
  );
}
