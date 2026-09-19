import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Send, AlertCircle, ArrowLeft, ArrowRight,
  Box, Image, Smile, Globe, Layers, Sliders, Zap, Check,
  Home, ChevronRight,
} from 'lucide-react';
import StepCapabilities from '../components/editor/StepCapabilities.jsx';
import StepContent from '../components/editor/StepContent.jsx';
import StepEvents from '../components/editor/StepEvents.jsx';
import StepParams from '../components/editor/StepParams.jsx';
import StepPublish from '../components/editor/StepPublish.jsx';
import { createArExperience } from '../api/client.js';
import { fullUrl } from '../utils.js';
import ArPreview3D from '../components/ArPreview3D.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

const ALL_STEPS = [
  { id: 'capabilities', label: '选能力', icon: Layers, desc: '选择 AR 能力' },
  { id: 'content', label: '配内容', icon: Box, desc: '配置每项能力的内容' },
  { id: 'events', label: '设交互', icon: Zap, desc: '定义交互规则' },
  { id: 'params', label: '调参数', icon: Sliders, desc: '微调显示参数' },
  { id: 'publish', label: '发布', icon: Send, desc: '上线与分享' },
];

export default function Create() {
  const { templateId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const template = location.state?.template || null;

  // ── 模板（非 AI）直接跳过选能力步骤 ──
  const isSimpleTemplate = template && template.trackingType !== 'ai';
  const STEPS = isSimpleTemplate
    ? ALL_STEPS.filter(s => s.id !== 'capabilities')
    : [...ALL_STEPS];

  // ── Step navigation ──
  const [currentStep, setCurrentStep] = useState(0);

  // ── Step 1: Capabilities ──
  const [capabilities, setCapabilities] = useState(
    template ? [template.trackingType || 'plane'] : []
  );

  // ── Step 2: Content per capability ──
  const [contentByCap, setContentByCap] = useState(() => {
    if (!template) return {};
    const capId = template.trackingType || 'plane';
    return {
      [capId]: {
        contentType: 'model',
        modelSource: 'url',
        modelUrl: '',
        scale: template.defaultScale || 1,
      },
    };
  });

  // ── Step 3: Events ──
  const [events, setEvents] = useState([]);

  // ── Step 4: Params ──
  const [scale, setScale] = useState(template?.defaultScale || 1);
  const [modelPosition, setModelPosition] = useState({ x: 0, y: 0, z: 0 });
  const [animConfig, setAnimConfig] = useState(template?.defaultAnimation || {
    enabled: false,
    defaultClip: '',
    interaction: { type: 'none', action: '' },
  });
  const [freezeOnDetect, setFreezeOnDetect] = useState(false);

  // ── Step 5: Publish ──
  const [title, setTitle] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [publishResult, setPublishResult] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordEnabled, setPasswordEnabled] = useState(false);

  // ── Content callback ──
  const handleContentChange = useCallback((capId, data) => {
    setContentByCap((prev) => ({ ...prev, [capId]: { ...prev[capId], ...data } }));
  }, []);

  // ── Primary tracking type (for preview / legacy) ──
  const primaryCap = capabilities[0] || 'plane';
  const primaryContent = contentByCap[primaryCap] || {};

  // ── Validate current step ──
  const canProceed = () => {
    const stepId = STEPS[currentStep]?.id;
    switch (stepId) {
      case 'capabilities': return capabilities.length > 0;
      case 'content': {
        // 每个选中的能力至少有一些内容配置
        return capabilities.every((capId) => {
          const c = contentByCap[capId];
          if (!c) return false;
          if (capId === 'image') return c.compiled || c.modelUrl;
          if (capId === 'face') {
            const enabledZones = Array.isArray(c.faceZones) ? c.faceZones.filter((z) => z.enabled) : [];
            return enabledZones.length > 0;
          }
          return !!c.modelUrl;
        });
      }
      default: return true; // events、params、publish 始终可跳过
    }
  };

  // ── Publish ──
  const handlePublish = async () => {
    if (!title.trim()) return;
    setPublishing(true);
    setPublishError('');

    try {
      // 构建主要内容
      const primary = contentByCap[primaryCap] || {};
      const trackingType = primaryCap;
      const modelUrl = primary.modelUrl || '';
      const targetUrl = primary.targetUrl || undefined;
      const targetImageUrl = primary.targetImageUrl || undefined;
      const engine = (trackingType === 'world' || trackingType === 'plane') ? '8thwall' : undefined;

      // 收集面部配置
      let faceZones, faceFeature;
      if (trackingType === 'face') {
        const faceData = contentByCap['face'];
        const fz = faceData && Array.isArray(faceData.faceZones) ? faceData.faceZones.filter((z) => z.enabled) : [];
        if (fz && fz.length > 0) {
          faceZones = fz;
        }
      }

      // 构建 unifiedConfig（完整配置）
      const unifiedConfig = {
        capabilities,
        contentByCap,
        events,
        params: { scale, position: modelPosition, animation: animConfig, freezeOnDetect },
      };

      const result = await createArExperience({
        modelUrl,
        targetUrl,
        targetImageUrl,
        trackingType,
        scale,
        title: title.trim() || '未命名体验',
        engine,
        publicOrigin: window.location.origin,
        positionOffset: modelPosition.x !== 0 || modelPosition.y !== 0 || modelPosition.z !== 0
          ? modelPosition : undefined,
        faceZones,
        animationConfig: animConfig.enabled ? animConfig : undefined,
        password: passwordEnabled ? password : undefined,
        freezeOnDetect: freezeOnDetect || undefined,
        config: { unifiedConfig },  // 存入完整配置供后续使用
      });

      setPublishResult(result);
      setShowQr(true);
    } catch (err) {
      setPublishError(err.message || '发布失败，请稍后重试');
    } finally {
      setPublishing(false);
    }
  };

  // ── Step navigation ──
  const goNext = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep((s) => s + 1);
  };
  const goBack = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  // ── Preview: determine what to show ──
  const previewModelUrl = primaryContent.modelUrl || '';
  const previewScale = primaryContent.scale || scale;
  const previewTargetImage = primaryContent.targetPreview || primaryContent.targetImageUrl || '';

  return (
    <div className="page-wrap page-body page-wrap-wide">
      {/* 面包屑 */}
      <nav aria-label="面包屑" className="crumb">
        <Home size={12} strokeWidth={1.7} aria-hidden="true" />
        <Link to="/">首页</Link>
        <ChevronRight size={11} strokeWidth={2} aria-hidden="true" className="crumb-sep" />
        {template && (
          <>
            <Link to="/">模板</Link>
            <ChevronRight size={11} strokeWidth={2} aria-hidden="true" className="crumb-sep" />
          </>
        )}
        <span aria-current="page">创建 AR 体验</span>
      </nav>

      {/* 页头 */}
      <header className="page-head mt-7">
        <div className="flex items-start gap-4">
          <div className="icon-tile icon-tile-lg mt-0.5">
            <Layers size={20} strokeWidth={1.6} aria-hidden="true" className="text-violet-300" />
          </div>
          <div className="min-w-0">
            <h1 className="page-title">创建 AR 体验</h1>
            <p className="page-sub">
              {template
                ? template.description
                : '按步骤挑能力、配内容、设交互、调参数，右侧全程显示实时预览。'}
            </p>
          </div>
        </div>
      </header>

      {/* 步骤指示器 */}
      <ol className="mt-9 flex flex-wrap items-center gap-y-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const active = i === currentStep;
          const done = i < currentStep;
          const clickable = i <= currentStep;
          const isLast = i === STEPS.length - 1;

          return (
            <li key={step.id} className={`flex items-center gap-2 ${isLast ? '' : 'min-w-0 flex-1'}`}>
              <button
                type="button"
                onClick={() => clickable && setCurrentStep(i)}
                disabled={!clickable}
                aria-current={active ? 'step' : undefined}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors duration-300 ${
                  clickable ? 'hover:bg-white/[0.04]' : 'cursor-not-allowed'
                }`}
              >
                <span
                  className={`icon-tile icon-tile-sm ${
                    active
                      ? 'border-violet-400/40 bg-violet-500/[0.14]'
                      : done
                        ? 'border-emerald-400/25 bg-emerald-500/[0.08]'
                        : ''
                  }`}
                >
                  {done ? (
                    <Check size={14} strokeWidth={2.2} aria-hidden="true" className="text-emerald-300" />
                  ) : (
                    <Icon
                      size={14}
                      strokeWidth={1.8}
                      aria-hidden="true"
                      className={active ? 'text-violet-200' : 'text-slate-500'}
                    />
                  )}
                </span>
                <span
                  className={`whitespace-nowrap text-[0.75rem] transition-colors ${
                    active ? 'text-slate-100' : done ? 'text-emerald-200/80' : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </span>
              </button>

              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`h-px min-w-[14px] flex-1 ${done ? 'bg-emerald-400/30' : 'bg-white/[0.08]'}`}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* ===== 主内容 ===== */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* 左侧：步骤内容 */}
        <div className="lg:col-span-3">
          <section className="panel min-h-[320px]">
            <div className="panel-body">
              {STEPS[currentStep]?.id === 'capabilities' && (
                <StepCapabilities
                  selected={capabilities}
                  onChange={setCapabilities}
                />
              )}

              {STEPS[currentStep]?.id === 'content' && (
                <StepContent
                  capabilities={capabilities}
                  content={contentByCap}
                  onChange={handleContentChange}
                  onBackToCapabilities={isSimpleTemplate ? undefined : () => setCurrentStep(0)}
                />
              )}

              {STEPS[currentStep]?.id === 'events' && (
                <StepEvents
                  events={events}
                  onChange={setEvents}
                />
              )}

              {STEPS[currentStep]?.id === 'params' && (
                <StepParams
                  scale={scale}
                  onScaleChange={setScale}
                  position={modelPosition}
                  onPositionChange={setModelPosition}
                  animConfig={animConfig}
                  onAnimConfigChange={setAnimConfig}
                  trackingType={primaryCap}
                  freezeOnDetect={freezeOnDetect}
                  onFreezeToggle={setFreezeOnDetect}
                />
              )}

              {STEPS[currentStep]?.id === 'publish' && (
                <StepPublish
                  title={title}
                  onTitleChange={setTitle}
                  onPublish={handlePublish}
                  publishing={publishing}
                  publishError={publishError}
                  publishResult={publishResult}
                  showQr={showQr}
                  onShowQr={setShowQr}
                  password={password}
                  passwordEnabled={passwordEnabled}
                  onPasswordChange={setPassword}
                  onPasswordToggle={setPasswordEnabled}
                />
              )}
            </div>
          </section>

          {/* 底部导航 */}
          {currentStep < STEPS.length - 1 && (
            <div className="mt-5 flex items-center gap-4">
              <button
                type="button"
                onClick={goBack}
                disabled={currentStep === 0}
                className="btn-ghost btn-sm disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowLeft size={14} strokeWidth={1.9} aria-hidden="true" />
                上一步
              </button>

              <span className="tabular text-[0.7rem] text-slate-600">
                第 {currentStep + 1} / {STEPS.length} 步
              </span>

              <button
                type="button"
                onClick={goNext}
                disabled={!canProceed()}
                className="btn-primary btn-sm ml-auto disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一步
                <ArrowRight size={14} strokeWidth={1.9} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {/* 右侧：实时预览 */}
        <div className="lg:col-span-2">
          <div className="sticky top-24 space-y-4">
            <div>
              <p className="eyebrow">实时预览</p>
              <p className="mt-1.5 text-[0.8rem] text-slate-400">
                当前步骤 · <span className="text-violet-300">{STEPS[currentStep]?.label}</span>
              </p>
            </div>

            {/* 能力摘要 */}
            <section className="panel panel-flat">
              <div className="px-4 py-4">
                <p className="field-label">已选能力</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {capabilities.length > 0 ? (
                    capabilities.map((capId) => {
                      const labels = {
                        image: '图片追踪',
                        face: '面部追踪',
                        plane: '平面放置',
                        world: '空间定位',
                        gps: 'GPS',
                      };
                      return (
                        <span key={capId} className="badge badge-info">
                          {labels[capId] || capId}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[0.72rem] text-slate-600">尚未选择</span>
                  )}
                </div>
                {events.length > 0 && (
                  <p className="mt-2.5 text-[0.7rem] text-slate-600">{events.length} 条交互规则</p>
                )}
              </div>
            </section>

            {/* 3D 预览 */}
            <ErrorBoundary>
              <ArPreview3D
                modelUrl={previewModelUrl}
                trackingType={primaryCap}
                scale={previewScale}
                position={modelPosition}
                targetPreview={previewTargetImage}
                faceZones={primaryContent.faceZones}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
