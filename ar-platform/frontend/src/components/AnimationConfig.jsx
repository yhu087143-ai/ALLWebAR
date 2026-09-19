import React from 'react';
import { Play, MousePointer, Layers } from 'lucide-react';

/**
 * 动画与交互配置面板
 *
 * Props:
 *   config: { enabled, defaultClip, clips }
 *   onChange: (updatedConfig) => void
 *   modelAnimations: string[]  — 从模型元数据动态传入的动画列表
 */
export default function AnimationConfig({ config, onChange, modelAnimations = [] }) {
  const enabled = config?.enabled ?? false;
  const defaultClip = config?.defaultClip || '';
  const interactionType = config?.interaction?.type || 'none';
  const interactionAction = config?.interaction?.action || '';

  const update = (patch) => {
    onChange({
      enabled,
      defaultClip,
      interaction: { type: interactionType, action: interactionAction },
      ...patch,
    });
  };

  const availableClips = modelAnimations.length > 0
    ? modelAnimations
    : ['Take 001', 'Action 1', 'Action 2'];

  return (
    <div className="glass-card rounded-xl">
      <div className="p-5 space-y-4">
        <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
          <Play size={14} className="text-violet-400" />
          动画面板
        </label>

        {/* 启用开关 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">启用模型动画</span>
          <button
            onClick={() => update({ enabled: !enabled })}
            className={`relative w-10 rounded-full transition-colors duration-200 ${enabled ? 'bg-violet-500' : 'bg-white/20'}`}
            style={{ height: '22px', width: '40px' }}
          >
            <div className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white transition-transform duration-200 ${enabled ? 'translate-x-[18px]' : ''}`} />
          </button>
        </div>

        {enabled && (
          <>
            {/* 默认动画选择 */}
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">默认动画</label>
              <select
                value={defaultClip}
                onChange={(e) => update({ defaultClip: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
              >
                <option value="">自动选择第一个</option>
                {availableClips.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* 交互设置 */}
            <div className="pt-2 border-t border-white/5">
              <label className="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
                <MousePointer size={12} />
                点击交互
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => update({ interaction: { type: 'none', action: '' } })}
                  className={`flex-1 py-2 rounded-lg text-xs transition-all ${
                    interactionType === 'none'
                      ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                      : 'bg-white/5 text-slate-500 hover:bg-white/10'
                  }`}
                >
                  无
                </button>
                <button
                  onClick={() => update({ interaction: { type: 'tap', action: 'next_animation' } })}
                  className={`flex-1 py-2 rounded-lg text-xs transition-all ${
                    interactionType === 'tap'
                      ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                      : 'bg-white/5 text-slate-500 hover:bg-white/10'
                  }`}
                >
                  点击切换动画
                </button>
              </div>
            </div>
          </>
        )}

        <p className="text-[11px] text-slate-600">
          {enabled
            ? '模型加载后将自动播放动画，用户点击可切换'
            : '模型将以静态方式显示'}
        </p>
      </div>
    </div>
  );
}
