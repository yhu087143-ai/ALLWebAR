import React from 'react';
import { Sliders } from 'lucide-react';
import AnimationConfig from '../AnimationConfig.jsx';

/**
 * Step 4：参数调优
 *
 * 模型缩放、位置偏移、动画配置等精细调整。
 *
 * Props:
 *   scale: number
 *   onScaleChange: (v) => void
 *   position: { x, y, z }
 *   onPositionChange: (v) => void
 *   animConfig: object
 *   onAnimConfigChange: (v) => void
 *   trackingType: string
 */
export default function StepParams({
  scale = 1,
  onScaleChange,
  position = { x: 0, y: 0, z: 0 },
  onPositionChange,
  animConfig = { enabled: false, defaultClip: '', interaction: { type: 'none', action: '' } },
  onAnimConfigChange,
  trackingType = '',
  freezeOnDetect = false,
  onFreezeToggle,
}) {
  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">调优参数</h2>
        <p className="text-sm text-slate-500">
          微调模型的显示大小、位置和动画行为
        </p>
      </div>

      <div className="space-y-5">
        {/* 缩放 */}
        <div className="glass-card rounded-xl">
          <div className="p-5">
            <label className="block text-sm font-medium text-slate-300 mb-3">
              缩放比例：{scale.toFixed(1)}x
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                value={scale}
                onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400
                  [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-violet-500/30"
              />
              <span className="text-xs text-slate-500 w-8 text-right">{scale.toFixed(1)}x</span>
            </div>
            <p className="text-xs text-slate-600 mt-2">调整模型在 AR 场景中的显示大小</p>
          </div>
        </div>

        {/* 位置偏移 */}
        <div className="glass-card rounded-xl">
          <div className="p-5">
            <label className="block text-sm font-medium text-slate-300 mb-3">
              位置偏移
            </label>
            <div className="grid grid-cols-3 gap-3">
              {['x', 'y', 'z'].map((axis) => (
                <div key={`pos-${axis}`}>
                  <label className="text-xs text-slate-500 uppercase mb-1 block">{axis}</label>
                  <input
                    type="range"
                    min="-0.5"
                    max="0.5"
                    step="0.01"
                    value={position[axis]}
                    onChange={(e) => onPositionChange({ ...position, [axis]: parseFloat(e.target.value) })}
                    className="w-full accent-violet-500 h-1 rounded-full appearance-none bg-white/10"
                  />
                  <span className="text-xs text-slate-500">{position[axis].toFixed(2)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-2">
              {trackingType === 'image' ? '调整模型相对于目标图片的位置偏移' :
               trackingType === 'face' ? '调整模型相对于面部特征点的位置偏移' :
               '调整模型在空间中的位置偏移'}
            </p>
          </div>
        </div>

        {/* 动画配置 */}
        <AnimationConfig
          config={animConfig}
          onChange={onAnimConfigChange}
        />

        {/* 冻结追踪 */}
        <div className="glass-card rounded-xl">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  冻结追踪
                </label>
                <p className="text-xs text-slate-600">
                  检测到目标后冻结追踪，适合图片和面部追踪模式
                </p>
              </div>
              <button
                type="button"
                onClick={() => onFreezeToggle(!freezeOnDetect)}
                className={`relative w-11 rounded-full transition-colors ${freezeOnDetect ? 'bg-violet-500' : 'bg-white/20'}`}
                style={{ height: '22px' }}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${
                  freezeOnDetect ? 'translate-x-[22px]' : 'left-0.5'
                }`} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {freezeOnDetect ? '已启用：检测到目标后暂停追踪' : '已禁用：持续追踪目标'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
