import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Send, Lightbulb, Wand2, Home, ChevronRight, Loader2, Check } from 'lucide-react';
import ComfyStudio from '../components/ai/ComfyStudio.jsx';

const SUGGESTIONS = [
  '一只旋转的红色小龙虾在桌面上',
  '孙悟空站在我手心里',
  '一只发光蝴蝶在花丛中飞舞',
  '自拍时头上出现猫耳朵',
  '一本会翻开动画的书',
  '生日蛋糕上蜡烛闪烁',
];

const STEPS = [
  { id: 'analyzing', label: '理解你的描述', icon: Lightbulb },
  { id: 'generating', label: '生成 AR 配置', icon: Wand2 },
  { id: 'publishing', label: '创建并发布体验', icon: Send },
];
const STEP_ORDER = STEPS.map((s) => s.id);

export default function AiDesign() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [designing, setDesigning] = useState(false);
  const [step, setStep] = useState(''); // '' | 'analyzing' | 'generating' | 'publishing'
  const [error, setError] = useState('');

  const handleDesign = async () => {
    if (!prompt.trim()) return;
    setDesigning(true);
    setError('');
    setStep('analyzing');

    try {
      // 调用 AI 设计接口
      setStep('generating');
      const res = await fetch('/api/ai/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'AI 设计失败' }));
        throw new Error(err.error || 'AI 设计失败');
      }

      const data = await res.json();
      setStep('publishing');

      // AI 返回后自动创建体验
      const createRes = await fetch('/api/ar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelUrl: data.modelUrl,
          trackingType: data.trackingType,
          scale: data.scale,
          title: data.title || prompt.trim().slice(0, 20),
          animationConfig: data.animationConfig || undefined,
          freezeOnDetect: data.freezeOnDetect || undefined,
          publicOrigin: window.location.origin,
          config: {
            unifiedConfig: {
              aiGenerated: true,
              originalPrompt: prompt.trim(),
              aiConfig: data.aiConfig,
            },
          },
        }),
      });

      if (!createRes.ok) {
        throw new Error('发布失败');
      }

      const result = await createRes.json();
      // 跳转到体验页
      navigate(`/view/${result.id}`);
    } catch (err) {
      setError(err.message || 'AI 设计出错，请重试');
      setDesigning(false);
      setStep('');
    }
  };

  const handleSuggestion = (suggestion) => {
    setPrompt(suggestion);
  };

  return (
    <div className="page-wrap page-wrap-narrow page-body">
      {/* 面包屑 */}
      <nav aria-label="面包屑" className="crumb">
        <Home size={12} strokeWidth={1.7} aria-hidden="true" />
        <Link to="/">首页</Link>
        <ChevronRight size={11} strokeWidth={2} aria-hidden="true" className="crumb-sep" />
        <span aria-current="page">AI 设计</span>
      </nav>

      {/* 页头 */}
      <header className="page-head mt-7">
        <div className="flex items-start gap-4">
          <div className="icon-tile icon-tile-lg mt-0.5">
            <Sparkles size={20} strokeWidth={1.6} aria-hidden="true" className="text-violet-300" />
          </div>
          <div className="min-w-0">
            <h1 className="page-title">AI 自动设计</h1>
            <p className="page-sub">
              用一句自然语言描述你想要的 AR 体验，系统推断追踪方式、模型与动画配置，
              生成后自动发布并进入体验页。
            </p>
          </div>
        </div>
        <div className="page-rule" />
      </header>

      {/* 输入区 */}
      <section className="panel mt-8">
        <div className="panel-body">
          <label htmlFor="ai-prompt" className="field-label">
            描述你的 AR 体验
          </label>
          <textarea
            id="ai-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例如：一只发光蝴蝶停在茶杯上，轻轻扇动翅膀"
            className="mt-2 h-28 w-full resize-none"
            disabled={designing}
          />

          <div className="mt-3 flex items-center justify-between gap-4">
            <span className="tabular text-[0.7rem] text-slate-600">{prompt.length} 字</span>
            <button
              type="button"
              onClick={handleDesign}
              disabled={designing || !prompt.trim()}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-45"
            >
              {designing ? (
                <>
                  <Loader2 size={15} strokeWidth={2} className="animate-spin" aria-hidden="true" />
                  {step === 'analyzing' ? '分析描述' : step === 'generating' ? '生成配置' : '发布体验'}
                </>
              ) : (
                <>
                  <Wand2 size={15} strokeWidth={1.9} aria-hidden="true" />
                  AI 自动设计
                </>
              )}
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-3 text-[0.78rem] leading-relaxed text-rose-300">
              {error}
            </p>
          )}
        </div>
      </section>

      {/* 进度步骤 */}
      {designing && (
        <section aria-live="polite" className="panel mt-5">
          <div className="panel-body space-y-3.5">
            {STEPS.map((s) => {
              const active = step === s.id;
              const done = STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(s.id);
              const Icon = s.icon;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 transition-opacity duration-300 ${
                    active || done ? 'opacity-100' : 'opacity-35'
                  }`}
                >
                  <span
                    className={`icon-tile icon-tile-sm ${
                      done
                        ? 'border-emerald-400/25 bg-emerald-500/[0.08]'
                        : active
                          ? 'border-violet-400/30 bg-violet-500/[0.1]'
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
                        className={active ? 'text-violet-300' : 'text-slate-500'}
                      />
                    )}
                  </span>
                  <span
                    className={`text-[0.85rem] ${
                      done ? 'text-emerald-200' : active ? 'text-slate-200' : 'text-slate-500'
                    }`}
                  >
                    {s.label}
                  </span>
                  {active && <span className="dot-live ml-auto animate-pulse" aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 混合 AR 生成：ComfyUI 出素材 */}
      {!designing && <ComfyStudio />}

      {/* 灵感建议 */}
      {!designing && (
        <section className="mt-8">
          <p className="eyebrow flex items-center gap-2">
            <Lightbulb size={12} strokeWidth={1.8} aria-hidden="true" />
            可以试试这些描述
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestion(s)}
                className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-left text-[0.78rem] text-slate-400 transition-all duration-300 hover:border-violet-400/30 hover:bg-white/[0.05] hover:text-slate-200"
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
