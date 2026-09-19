/**
 * 混合 AR 生成台（ComfyUI）。
 *
 * 为什么放在「AI 设计」页而不是新建一个页面：
 *   ComfyUI 在这条链路里只负责产出素材（贴图 / 触发图 / 风格化画面），
 *   它本身不是一种 AR 追踪方式。放在 AI 设计页，用户的心理模型是连贯的：
 *   「AI 帮我做素材」和「AI 帮我做体验」是同一件事的两个粒度。
 *
 * 三种触发方式对应项目里真实存在的入口，界面上直接标出来，避免「工作流」这种
 * 纯技术词汇让人不知道什么时候该用哪条：
 *   text    创作期手动输入
 *   image   图片识别命中 / 现场拍一张
 *   gesture 手势识别命中（ProjectHand 那套 MediaPipe 手势）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Hand,
  Image as ImageIcon,
  Layers,
  Loader2,
  ScanLine,
  Sparkles,
  Type,
  Wand2,
} from 'lucide-react';
import { fetchComfyStatus, fetchComfyTask, runComfyWorkflow, uploadTargetImage } from '../../api/client.js';

/** 触发方式的展示配置：标签 + 图标 + 说明 */
const TRIGGERS = {
  text: { label: '手动输入', icon: Type, hint: '创作阶段使用' },
  image: { label: '图片识别', icon: ScanLine, hint: '扫到触发图后触发' },
  gesture: { label: '手势识别', icon: Hand, hint: '手势命中后触发' },
};

const POLL_INTERVAL_MS = 1200;
const POLL_LIMIT = 150; // 3 分钟

export default function ComfyStudio() {
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [task, setTask] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [compiled, setCompiled] = useState(null);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /* 状态探测：ComfyUI 没起时也要把「怎么起」讲清楚，而不是转圈 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchComfyStatus();
        if (!cancelled) setStatus(data);
      } catch (err) {
        if (!cancelled) setStatusError(err.message || '无法读取 ComfyUI 状态');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const presets = status?.presets || [];
  const active = useMemo(
    () => presets.find((p) => p.id === activeId) || presets[0] || null,
    [presets, activeId]
  );
  const workflow = useMemo(
    () => (status?.workflows || []).find((w) => w.id === active?.workflowId) || null,
    [status, active]
  );

  const previousPresetRef = useRef(null);
  useEffect(() => {
    if (!active || previousPresetRef.current === active.id) return;
    previousPresetRef.current = active.id;
    // 换预设时用示例提示词预填；用户自己改过的内容不动（同一预设内不会重跑）
    const fallback = active.samplePrompt || workflow?.inputs?.find((i) => i.key === 'prompt')?.default || '';
    setPrompt((current) => (current && current !== '' ? current : fallback));
  }, [active, workflow]);

  /** 有必填提示词却没填时不要发请求：后端会（正确的）拒绝，但提示要说人话 */
  const promptRequired = Boolean(
    workflow?.inputs?.some((i) => i.key === 'prompt' && i.required)
  );
  const promptMissing = promptRequired && !prompt.trim();

  const copy = useCallback(async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      /* 剪贴板被拒绝时静默：用户仍可手动选中 */
    }
  }, []);

  const poll = useCallback(async (taskId) => {
    for (let i = 0; i < POLL_LIMIT; i += 1) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      if (!aliveRef.current) return;
      const next = await fetchComfyTask(taskId);
      setTask(next);
      if (next.state === 'succeeded' || next.state === 'failed') return;
    }
    throw new Error('生成超时（超过 3 分钟），请检查 ComfyUI 队列');
  }, []);

  const run = useCallback(async () => {
    if (!active) return;
    setRunning(true);
    setError('');
    setCompiled(null);
    try {
      const created = await runComfyWorkflow({
        presetId: active.id,
        workflowId: active.workflowId,
        prompt,
        // 还没接 ComfyUI 时用降级产物跑通交互：显式开关，不静默伪造
        mock: Boolean(status && !status.connected),
      });
      const first = await fetchComfyTask(created.taskId);
      setTask(first);
      await poll(created.taskId);
    } catch (err) {
      setError(err.message || '生成失败');
    } finally {
      if (aliveRef.current) setRunning(false);
    }
  }, [active, prompt, status, poll]);

  /** 增强后的触发图直接编译成 .mind —— 生成到可用之间的最后一步 */
  const compileAsTarget = useCallback(async () => {
    if (!task?.imageUrl) return;
    setCompiling(true);
    setError('');
    try {
      const blob = await fetch(task.imageUrl).then((r) => r.blob());
      const file = new File([blob], 'comfy-marker.png', { type: blob.type || 'image/png' });
      const result = await uploadTargetImage(file);
      setCompiled(result);
    } catch (err) {
      setError(err.message || '编译触发图失败');
    } finally {
      if (aliveRef.current) setCompiling(false);
    }
  }, [task]);

  const connected = status?.connected;
  const progress = Math.round((task?.progress || 0) * 100);

  return (
    <section className="panel mt-8">
      <div className="panel-body space-y-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="icon-tile icon-tile-md mt-0.5">
            <Layers size={17} strokeWidth={1.6} aria-hidden="true" className="text-cyan-300" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[0.95rem] font-semibold text-slate-100">混合 AR 生成（ComfyUI）</h2>
            <p className="mt-1 text-[0.78rem] leading-relaxed text-slate-500">
              用本机 ComfyUI 工作流出素材：模型贴图、触发图增强、识别到画面后的风格化。
              生成结果会存进资产目录，可直接用于 AR 体验。
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] ${
              connected
                ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                : 'border-amber-400/25 bg-amber-400/10 text-amber-300'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`}
              aria-hidden="true"
            />
            {connected ? 'ComfyUI 已连接' : '未连接（将用降级产物演示）'}
          </span>
        </div>

        {statusError && (
          <p className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-[0.76rem] text-rose-200">
            <AlertCircle size={14} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden="true" />
            {statusError}
          </p>
        )}
        {!statusError && status && !connected && (
          <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[0.74rem] leading-relaxed text-slate-500">
            {status.hint}
          </p>
        )}

        {/* 预设：把「什么时候触发」和「生成什么」绑在一起 */}
        <div className="grid gap-2 sm:grid-cols-2">
          {presets.map((preset) => {
            const trigger = TRIGGERS[preset.trigger] || TRIGGERS.text;
            const TriggerIcon = trigger.icon;
            const selected = active?.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setActiveId(preset.id)}
                aria-pressed={selected}
                className={`rounded-xl border px-3 py-2.5 text-left transition-all duration-300 ${
                  selected
                    ? 'border-violet-400/40 bg-violet-400/[0.08]'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[0.7rem] text-slate-500">
                  <TriggerIcon size={12} strokeWidth={1.8} aria-hidden="true" />
                  {trigger.label}
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-600">{trigger.hint}</span>
                </span>
                <span className="mt-1 block text-[0.82rem] text-slate-200">{preset.name}</span>
                <span className="mt-0.5 block text-[0.72rem] leading-relaxed text-slate-500">
                  {preset.hint}
                </span>
              </button>
            );
          })}
        </div>

        {/* 参数 + 运行 */}
        {workflow && (
          <div className="space-y-3">
            <label htmlFor="comfy-prompt" className="field-label">
              提示词
            </label>
            <textarea
              id="comfy-prompt"
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：低多边形狐狸毛皮质感，暖色调，四方连续"
              className="field-input resize-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={run}
                disabled={running || promptMissing}
                title={promptMissing ? '请先填写提示词' : undefined}
                className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? (
                  <Loader2 size={14} strokeWidth={1.8} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 size={14} strokeWidth={1.8} aria-hidden="true" />
                )}
                {running ? '生成中…' : '开始生成'}
              </button>
              <span className="text-[0.72rem] text-slate-600">
                {promptMissing ? (
                  <span className="text-amber-300/90">先写一句提示词再生成</span>
                ) : (
                  <>
                    工作流：<code className="code">{workflow.id}</code> · {workflow.nodeCount} 个节点
                  </>
                )}
              </span>
            </div>
          </div>
        )}

        {task && (
          <div className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
            <div className="flex items-center gap-2 text-[0.76rem] text-slate-400">
              <Sparkles size={13} strokeWidth={1.8} aria-hidden="true" className="text-violet-300" />
              {task.message}
              <span className="tabular ml-auto text-slate-600">{progress}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={progress}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {error && (
              <p className="flex items-start gap-2 text-[0.74rem] text-rose-300">
                <AlertCircle size={13} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
            {task.error && !error && (
              <p className="flex items-start gap-2 text-[0.74rem] text-rose-300">
                <AlertCircle size={13} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden="true" />
                {task.error}
              </p>
            )}

            {task.state === 'succeeded' && task.imageUrl && (
              <div className="flex flex-wrap gap-4">
                <img
                  src={task.imageUrl}
                  alt="生成结果"
                  className="h-28 w-28 rounded-xl border border-white/[0.07] object-cover"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <AssetRow
                    label="贴图 / 图片"
                    url={task.imageUrl}
                    icon={ImageIcon}
                    copied={copied === 'image'}
                    onCopy={() => copy(task.imageUrl, 'image')}
                  />
                  {task.resultUrl && (
                    <AssetRow
                      label="可直接摆进 AR 的 GLB"
                      url={task.resultUrl}
                      icon={Layers}
                      copied={copied === 'glb'}
                      onCopy={() => copy(task.resultUrl, 'glb')}
                    />
                  )}
                  {active?.applyTo === 'marker' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={compileAsTarget}
                        disabled={compiling}
                        className="btn-ghost inline-flex items-center gap-2 text-[0.76rem]"
                      >
                        {compiling ? (
                          <Loader2 size={13} strokeWidth={1.8} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <ScanLine size={13} strokeWidth={1.8} aria-hidden="true" />
                        )}
                        {compiling ? '编译中…' : '编译成 .mind 触发图'}
                      </button>
                      {compiled?.targetUrl && (
                        <span className="text-[0.72rem] text-emerald-300">
                          已生成 <code className="code">{compiled.targetUrl}</code>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** 单条资产：地址 + 复制按钮，长路径截断显示 */
function AssetRow({ label, url, icon: Icon, copied, onCopy }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-1.5">
      <Icon size={13} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-slate-500" />
      <span className="shrink-0 text-[0.72rem] text-slate-500">{label}</span>
      <code className="code min-w-0 flex-1 truncate text-[0.7rem] text-slate-400">{url}</code>
      <button
        type="button"
        onClick={onCopy}
        title="复制地址"
        className="shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
      >
        {copied ? (
          <Check size={12} strokeWidth={2} aria-hidden="true" className="text-emerald-400" />
        ) : (
          <Copy size={12} strokeWidth={1.8} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
