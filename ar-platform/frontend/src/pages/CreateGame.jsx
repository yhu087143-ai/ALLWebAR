import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Send, Gamepad2, Sparkles, CheckCircle, AlertCircle, Copy, Download, ExternalLink, Eye, Bot, Home, ChevronRight, Loader2 } from 'lucide-react';
import StepGameConfig from '../components/editor/StepGameConfig.jsx';
import GamePreview from '../components/preview/GamePreview.jsx';
import AiChatPanel from '../components/editor/AiChatPanel.jsx';
import { createArExperience } from '../api/client.js';
import QrModal from '../components/QrModal.jsx';

export default function CreateGame() {
  const navigate = useNavigate();

  // ── Step (1=config, 2=preview) ──
  const [step, setStep] = useState(1);

  // ── Game config ──
  const [gameConfig, setGameConfig] = useState({
    enabled: true,
    type: 'scavenger',
    duration: 60,
    itemCount: 10,
    scorePerItem: 100,
    comboEnabled: true,
    spawnInterval: 3,
    maxVisible: 5,
    itemModelUrl: '',
    rules: [],
    hud: { showScore: true, showTimer: true, showCombo: true },
    endCondition: 'timer',
    onComplete: { action: 'show_score', message: '游戏结束！' },
    itemAppearance: { prompt: '', style: 'cartoon', scale: 1, glowColor: '#FFD700' },
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
    if (!title.trim()) return;
    setPublishing(true);
    setPublishError('');

    try {
      const result = await createArExperience({
        title: title.trim() || 'AR 游戏',
        modelUrl: '',
        trackingType: 'world',
        engine: '8thwall',
        config: { unifiedConfig: { game: gameConfig } },
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
        <span aria-current="page">创建 AR 游戏</span>
      </nav>

      {/* ===== 页头 ===== */}
      <header className="page-head mt-7">
        <div className="flex items-start gap-4">
          <div className="icon-tile icon-tile-lg mt-0.5">
            <Gamepad2 size={20} strokeWidth={1.6} aria-hidden="true" className="text-violet-300" />
          </div>
          <div className="min-w-0">
            <h1 className="page-title">创建 AR 游戏</h1>
            <p className="page-sub">
              为 AR 体验设计互动玩法，支持寻宝收集、打靶挑战、集章打卡三种模式，
              计分与胜负条件可在下面逐项调整。
            </p>
          </div>
        </div>
        <div className="page-rule" />
      </header>

      {/* ===== 主内容 ===== */}
      {step === 1 && (
        <div className="space-y-5">
          {/* 游戏名称 */}
          <section className="panel">
            <div className="panel-body">
              <label htmlFor="game-title" className="field-label">
                游戏名称
              </label>
              <input
                id="game-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="给你的 AR 游戏取个名字"
                className="mt-2 w-full"
              />
              <p className="field-hint mt-2">参与者通过分享链接打开时会看到这个名称。</p>
            </div>
          </section>

          {/* 游戏配置 */}
          <section className="panel">
            <div className="panel-body">
              <StepGameConfig
                config={gameConfig}
                onChange={setGameConfig}
              />
            </div>
          </section>

          {/* 操作按钮 */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!title.trim()}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Eye size={16} strokeWidth={1.9} aria-hidden="true" />
              预览游戏
            </button>
            <span className="text-[0.72rem] text-slate-600">
              {title.trim() ? '配置完成后可预览并发布' : '先填写游戏名称'}
            </span>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="section-head">
            <div>
              <h2 className="section-title">预览 · {title || 'AR 游戏'}</h2>
              <p className="panel-note">下面是参与者实际看到的 HUD 与计分方式示意。</p>
            </div>
            <button type="button" onClick={() => setStep(1)} className="btn-ghost btn-sm">
              <ArrowLeft size={14} strokeWidth={1.9} aria-hidden="true" />
              返回编辑
            </button>
          </div>

          <GamePreview config={gameConfig} />

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
                  发布 AR 游戏
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

      {/* 发布结果 */}
      {publishResult && (
        <section className="panel mt-6 border-emerald-400/20">
          <div className="panel-body space-y-6">
            <div className="flex items-center gap-4">
              <div className="icon-tile icon-tile-lg border-emerald-400/25 bg-emerald-500/[0.08]">
                <CheckCircle size={22} strokeWidth={1.6} aria-hidden="true" className="text-emerald-300" />
              </div>
              <div>
                <h3 className="text-[0.95rem] font-medium text-emerald-200">发布成功</h3>
                <p className="panel-note">游戏已上线，用下面的二维码或链接即可打开。</p>
              </div>
            </div>

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

            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => setShowQr(true)} className="btn-ghost flex-1">
                <Download size={15} strokeWidth={1.9} aria-hidden="true" />
                查看二维码
              </button>
              <a href={publishUrl} target="_blank" rel="noopener noreferrer" className="btn-primary flex-1">
                <ExternalLink size={15} strokeWidth={1.9} aria-hidden="true" />
                打开体验
              </a>
            </div>

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
              config={gameConfig}
              context="game"
              onConfigChange={(newConfig) => setGameConfig((prev) => ({ ...prev, ...newConfig }))}
              onClose={() => setChatOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
