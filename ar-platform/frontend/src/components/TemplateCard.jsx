import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, ScanLine, ScanFace, Move3d, Globe } from 'lucide-react';
import ArSpatialPreview from './ArSpatialPreview';

const TRACKING = {
  plane: { label: '平面追踪', icon: Move3d, tone: 'text-violet-300' },
  image: { label: '图片追踪', icon: ScanLine, tone: 'text-emerald-300' },
  face: { label: '面部追踪', icon: ScanFace, tone: 'text-violet-300' },
  world: { label: '世界追踪', icon: Globe, tone: 'text-cyan-300' },
  ai: { label: 'AI 设计', icon: Sparkles, tone: 'text-amber-300' },
};

const CATEGORY = { image: '2D 触发', face: '面部交互', plane: '免图追踪', world: 'AI 设计' };

export default function TemplateCard({ template, onSelect }) {
  const navigate = useNavigate();

  const isAi = template.trackingType === 'ai' || template.id === 'tpl-world-track';
  const meta = TRACKING[template.trackingType] || TRACKING.plane;
  const Icon = meta.icon;

  const handleClick = () => {
    if (onSelect) onSelect(template);
    else if (template.id === 'tpl-world-track') navigate('/ai-design');
    else navigate(`/create/${template.id}`, { state: { template } });
  };

  return (
    <div className="group relative">
      <div
        onClick={handleClick}
        className="edge-beam glass-panel relative flex cursor-pointer overflow-hidden rounded-2xl transition-transform duration-500 hover:-translate-y-1.5"
      >
        {/* 左侧：AR 空间预览 */}
        <div className="relative w-[124px] flex-shrink-0 overflow-hidden bg-ar-dark sm:w-[144px]">
          <ArSpatialPreview trackingType={template.trackingType} />

          {/* 类型角标：图标 + 文字，不用表情符号 */}
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/55 px-1.5 py-0.5 text-[10px] text-white/70 backdrop-blur-sm">
            <Icon size={10} strokeWidth={1.75} className={meta.tone} />
            {isAi ? 'AI' : (CATEGORY[template.trackingType] || 'AR')}
          </span>

          {/* 悬停时自上而下扫过的一道光，暗示"正在识别" */}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-scan" />
        </div>

        {/* 右侧：信息 */}
        <div className="flex min-w-0 flex-1 flex-col justify-between p-4 sm:p-5">
          <div>
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <h3 className="truncate text-[0.95rem] font-medium text-slate-100 transition-colors duration-300 group-hover:text-violet-200">
                {template.name}
              </h3>
              <span className="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-400">
                <Icon size={10} strokeWidth={1.75} className={meta.tone} />
                {meta.label}
              </span>
            </div>

            <p className="mb-3 line-clamp-2 text-[0.78rem] leading-relaxed text-slate-500">
              {template.description}
            </p>

            {template.useCases && template.useCases.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {template.useCases.map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-white/[0.06] bg-white/[0.025] px-2 py-0.5 text-[10px] text-slate-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[0.7rem] text-slate-600">
              {isAi ? 'AI 自动生成' : (template.trackingType === 'image' ? '需上传目标图片' : '无需标记图片')}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 text-[0.72rem] text-slate-300 transition-all duration-300 hover:border-violet-300/40 hover:bg-violet-400/10 hover:text-white active:scale-95"
            >
              {isAi ? 'AI 生成' : '创建'}
              <ArrowRight size={12} strokeWidth={1.9} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
