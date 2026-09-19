import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Send, MapPin, CheckCircle, AlertCircle,
  Copy, Download, ExternalLink, Eye, Bot, Home, ChevronRight, Loader2,
} from 'lucide-react';
import StepGuidePOI from '../components/editor/StepGuidePOI.jsx';
import GuidePreview from '../components/preview/GuidePreview.jsx';
import AiChatPanel from '../components/editor/AiChatPanel.jsx';
import { createArExperience } from '../api/client.js';
import QrModal from '../components/QrModal.jsx';

export default function CreateGuide() {
  const navigate = useNavigate();

  // ── Step (1=config, 2=preview) ──
  const [step, setStep] = useState(1);

  // ── Route config ──
  const [guideRoute, setGuideRoute] = useState({
    id: `route_${Date.now()}`,
    name: '',
    description: '',
    pois: [],
    positionProvider: 'gps',
  });

  // ── Title ──
  const [title, setTitle] = useState('');

  // ── AI Chat ──
  const [chatOpen, setChatOpen] = useState(false);

  // ── Publish state ──
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [publishResult, setPublishResult] = useState(null);
  const [showQr, setShowQr] = useState(false);

  // ── Publish ──
  const handlePublish = async () => {
    if (publishing) return;
    if (!guideRoute.pois || guideRoute.pois.length === 0) {
      setPublishError('请先至少添加一个导览点位（POI），再发布。');
      return;
    }
    setPublishing(true);
    setPublishError('');

    try {
      const result = await createArExperience({
        title: title.trim() || 'AR 导览',
        modelUrl: '',
        // 导览使用导览卡做图片追踪（与 /guide/:id 演示页共用同一张卡片）
        trackingType: 'image',
        targetUrl: '/targets/tour-card.mind',
        targetImageUrl: '/targets/tour-card.jpg',
        // 让后端据此拼出正确的分享链接（否则会回退到 PUBLIC_PORT 默认值）
        publicOrigin: window.location.origin,
        config: {
          unifiedConfig: {
            guide: {
              ...guideRoute,
              name: guideRoute.name || title.trim() || 'AR 导览',
            },
          },
        },
      });

      setPublishResult(result);
      setShowQr(true);
    } catch (err) {
      setPublishError(err.message || '发布失败，请稍后重试');
    } finally {
      setPublishing(false);
    }
  };

  // ── Derive publish URL ──
  const publishUrl = publishResult?.fullUrl || publishResult?.url || '';

  const copyLink = () => {
    if (publishUrl) {
      navigator.clipboard?.writeText(publishUrl);
    }
  };

  return (
    <div className="page-wrap page-body">
      {/* ===== 面包屑 ===== */}
      <nav aria-label="面包屑" className="crumb">
        <Home size={12} strokeWidth={1.7} aria-hidden="true" />
        <Link to="/">首页</Link>
        <ChevronRight size={11} strokeWidth={2} aria-hidden="true" className="crumb-sep" />
        <span aria-current="page">创建 AR 导览</span>
      </nav>

      {/* ===== 页头 ===== */}
      <header className="page-head mt-7">
        <div className="flex items-start gap-4">
          <div className="icon-tile icon-tile-lg mt-0.5">
            <MapPin size={20} strokeWidth={1.6} aria-hidden="true" className="text-emerald-300" />
          </div>
          <div className="min-w-0">
            <h1 className="page-title">创建 AR 导览</h1>
            <p className="page-sub">
              设计基于位置的 AR 导览路线。参与者沿真实路线移动时，
              进入某个点位的触发半径即自动弹出对应内容。
            </p>
          </div>
        </div>
        <div className="page-rule" />
      </header>

      {/* ===== 主内容 ===== */}
      {step === 1 && (
        <div className="space-y-5">
          {/* 导览名称 */}
          <section className="panel">
            <div className="panel-body">
              <label htmlFor="guide-title" className="field-label">
                导览名称
              </label>
              <input
                id="guide-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="给你的 AR 导览取个名字"
                className="mt-2 w-full"
              />
              <p className="field-hint mt-2">参与者通过分享链接打开时会看到这个名称。</p>
            </div>
          </section>

          {/* POI 编辑器 */}
          <section className="panel">
            <div className="panel-body">
              <StepGuidePOI route={guideRoute} onChange={setGuideRoute} />
            </div>
          </section>

          {/* 操作按钮 */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!title.trim() || guideRoute.pois.length === 0}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Eye size={16} strokeWidth={1.9} aria-hidden="true" />
              预览导览
            </button>
            <span className="text-[0.72rem] text-slate-600">
              {!title.trim()
                ? '先填写导览名称'
                : guideRoute.pois.length === 0
                  ? '至少添加一个点位后才能预览'
                  : `已编排 ${guideRoute.pois.length} 个点位`}
            </span>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="section-head">
            <div>
              <h2 className="section-title">预览 · {title || 'AR 导览'}</h2>
              <p className="panel-note">下面是参与者实际看到的点位序列与触发范围示意。</p>
            </div>
            <button type="button" onClick={() => setStep(1)} className="btn-ghost btn-sm">
              <ArrowLeft size={14} strokeWidth={1.9} aria-hidden="true" />
              返回编辑
            </button>
          </div>

          <GuidePreview route={guideRoute} />

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setStep(1)} className="btn-ghost">
              <ArrowLeft size={15} strokeWidth={1.9} aria-hidden="true" />
              返回编辑
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? (
                <>
                  <Loader2 size={16} strokeWidth={2} className="animate-spin" aria-hidden="true" />
                  发布中
                </>
              ) : (
                <>
                  <Send size={16} strokeWidth={1.9} aria-hidden="true" />
                  发布 AR 导览
                </>
              )}
            </button>
          </div>

          {/* 错误提示 */}
          {publishError && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-rose-400/25 bg-rose-500/[0.08] px-4 py-3"
            >
              <AlertCircle size={16} strokeWidth={1.9} aria-hidden="true" className="mt-0.5 shrink-0 text-rose-300" />
              <p className="text-[0.82rem] leading-relaxed text-rose-200">{publishError}</p>
            </div>
          )}
        </div>
      )}

      {/* 发布结果（覆盖所有步骤） */}
      {publishResult && (
        <section className="panel mt-6 border-emerald-400/20">
          <div className="panel-body space-y-6">
            <div className="flex items-center gap-4">
              <div className="icon-tile icon-tile-lg border-emerald-400/25 bg-emerald-500/[0.08]">
                <CheckCircle size={22} strokeWidth={1.6} aria-hidden="true" className="text-emerald-300" />
              </div>
              <div>
                <h3 className="text-[0.95rem] font-medium text-emerald-200">发布成功</h3>
                <p className="panel-note">导览已上线，用下面的二维码或链接即可打开。</p>
              </div>
            </div>

            {/* 分享链接 */}
            <div>
              <label htmlFor="publish-url" className="field-label">
                分享链接
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="publish-url"
                  type="text"
                  readOnly
                  value={publishUrl}
                  className="flex-1 font-mono text-[0.72rem]"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  aria-label="复制分享链接"
                  className="btn-ghost btn-sm shrink-0"
                >
                  <Copy size={14} strokeWidth={1.9} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => setShowQr(true)} className="btn-ghost flex-1">
                <Download size={15} strokeWidth={1.9} aria-hidden="true" />
                查看二维码
              </button>
              <a
                href={publishUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary flex-1"
              >
                <ExternalLink size={15} strokeWidth={1.9} aria-hidden="true" />
                打开体验
              </a>
            </div>

            {/* 返回 */}
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-ghost btn-sm w-full border-white/[0.06] text-slate-500"
            >
              <ArrowLeft size={14} strokeWidth={1.9} aria-hidden="true" />
              返回首页
            </button>
          </div>
        </section>
      )}

      {/* QR 弹窗 */}
      <QrModal url={publishUrl} isOpen={showQr} onClose={() => setShowQr(false)} />

      {/* AI 助手按钮 */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        aria-label="打开 AI 助手"
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full text-[#06060f] shadow-[0_16px_40px_-14px_rgba(167,139,250,0.7)] transition-transform duration-300 hover:scale-105 active:scale-95"
        style={{ background: 'linear-gradient(120deg,#5eead4,#a78bfa 65%,#f0abfc)' }}
      >
        <Bot size={20} strokeWidth={1.8} />
      </button>

      {/* AI 助手侧边面板 */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="关闭 AI 助手"
            onClick={() => setChatOpen(false)}
            className="flex-1 cursor-default bg-black/50 backdrop-blur-sm"
          />
          <div className="flex h-full w-[360px] max-w-[85vw] flex-col border-l border-white/[0.08] bg-ar-dark">
            <AiChatPanel
              config={guideRoute}
              context="guide"
              onConfigChange={(newConfig) => setGuideRoute((prev) => ({ ...prev, ...newConfig }))}
              onClose={() => setChatOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
