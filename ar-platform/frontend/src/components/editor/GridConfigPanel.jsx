import React, { useState } from 'react';
import { Grid3X3, Palette, Eye, Move, ChevronDown, ChevronRight } from 'lucide-react';

/**
 * GridConfigPanel - 网格放置系统配置
 *
 * Props:
 *   grid: GridConfig | undefined
 *   onChange: (grid: GridConfig | undefined) => void
 */
export default function GridConfigPanel({ grid, onChange }) {
  const enabled = grid?.enabled ?? false;

  const defaults = {
    enabled: false,
    rows: 8,
    cols: 8,
    cellSize: 1,
    origin: [0, 0, 0],
    highlightColor: '#4444ff',
    occupiedColor: '#ff4444',
  };

  const config = { ...defaults, ...(grid || {}) };
  const [open, setOpen] = useState(false);

  const toggle = () => {
    if (enabled) {
      onChange(undefined);
    } else {
      onChange({ ...defaults, enabled: true });
    }
  };

  const update = (patch) => {
    onChange({ ...config, ...patch });
  };

  const Label = ({ children }) => (
    <label className="block text-xs text-slate-500 mb-1">{children}</label>
  );

  const NumberInput = ({ value, onChange, min, max, step = 1 }) => (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      min={min}
      max={max}
      step={step}
      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500/40 transition-colors"
    />
  );

  const Slider = ({ value, onChange, min, max, step = 1 }) => (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-violet-500
        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400
        [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-violet-500/30"
    />
  );

  return (
    <div className="animate-fade-up">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">网格放置系统</h2>
        <p className="text-sm text-slate-500">
          为塔防/策略类游戏提供网格化放置能力，支持行列坐标、占用检测和视觉叠加层
        </p>
      </div>

      <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-lg border border-white/[0.06] mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Grid3X3 size={16} className="text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300">启用网格</p>
            <p className="text-xs text-slate-500">在 AR 场景中显示可放置的网格</p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          className={`relative w-10 rounded-full transition-colors duration-200 ${enabled ? 'bg-violet-500' : 'bg-white/20'}`}
          style={{ height: '22px', width: '40px' }}
        >
          <div
            className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white transition-transform duration-200 shadow ${
              enabled ? 'translate-x-[18px]' : ''
            }`}
          />
        </button>
      </div>

      {enabled && (
        <>
          {/* 网格尺寸 */}
          <div className="bg-white/[0.02] rounded-lg border border-white/[0.06] overflow-hidden mb-2">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="flex items-center justify-between w-full p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center">
                  <Move size={14} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300">网格尺寸</p>
                  <p className="text-xs text-slate-500">
                    {config.rows} 行 × {config.cols} 列，每格 {config.cellSize}m
                  </p>
                </div>
              </div>
              {open ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
            </button>

            {open && (
              <div className="px-4 pb-4 space-y-3 animate-fade-up">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>行数</Label>
                    <div className="flex items-center gap-2">
                      <Slider value={config.rows} onChange={(v) => update({ rows: Math.max(2, Math.min(20, v)) })} min={2} max={20} />
                      <span className="text-xs text-slate-400 w-6 text-right">{config.rows}</span>
                    </div>
                  </div>
                  <div>
                    <Label>列数</Label>
                    <div className="flex items-center gap-2">
                      <Slider value={config.cols} onChange={(v) => update({ cols: Math.max(2, Math.min(20, v)) })} min={2} max={20} />
                      <span className="text-xs text-slate-400 w-6 text-right">{config.cols}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="mb-0">单元格大小（米）</Label>
                    <span className="text-xs text-slate-400">{config.cellSize}m</span>
                  </div>
                  <Slider value={config.cellSize} onChange={(v) => update({ cellSize: Math.max(0.1, Math.min(10, v)) })} min={0.1} max={10} step={0.1} />
                </div>
              </div>
            )}
          </div>

          {/* 颜色配置 */}
          <div className="bg-white/[0.02] rounded-lg border border-white/[0.06] overflow-hidden mb-2">
            <button
              type="button"
              onClick={() => setOpen(open !== 'colors' ? 'colors' : false)}
              className="flex items-center justify-between w-full p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center">
                  <Palette size={14} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300">颜色主题</p>
                  <p className="text-xs text-slate-500">自定义网格和高亮颜色</p>
                </div>
              </div>
              {open === 'colors' ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
            </button>

            {open === 'colors' && (
              <div className="px-4 pb-4 space-y-3 animate-fade-up">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>网格高亮色</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.highlightColor || '#4444ff'}
                        onChange={(e) => update({ highlightColor: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs text-slate-500 font-mono">{config.highlightColor || '#4444ff'}</span>
                    </div>
                  </div>
                  <div>
                    <Label>占用色</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.occupiedColor || '#ff4444'}
                        onChange={(e) => update({ occupiedColor: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs text-slate-500 font-mono">{config.occupiedColor || '#ff4444'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 网格预览 */}
          <div className="bg-white/[0.02] rounded-lg border border-white/[0.06] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Eye size={14} className="text-slate-500" />
              <span className="text-xs font-medium text-slate-400">网格预览</span>
            </div>
            <div
              className="w-full bg-black/30 rounded-lg overflow-hidden"
              style={{
                aspectRatio: `${config.cols}/${config.rows}`,
                maxHeight: 200,
              }}
            >
              <svg viewBox={`0 0 ${config.cols} ${config.rows}`} className="w-full h-full">
                {Array.from({ length: config.rows }, (_, r) =>
                  Array.from({ length: config.cols }, (_, c) => (
                    <rect
                      key={`${r}-${c}`}
                      x={c}
                      y={r}
                      width={1}
                      height={1}
                      fill="none"
                      stroke={config.highlightColor || '#4444ff'}
                      strokeWidth={0.05}
                      strokeOpacity={0.5}
                    />
                  ))
                )}
                {/* 中心标记 */}
                <rect
                  x={Math.floor(config.cols / 2)}
                  y={Math.floor(config.rows / 2)}
                  width={1}
                  height={1}
                  fill={(config.highlightColor || '#4444ff') + '33'}
                  stroke={(config.highlightColor || '#4444ff')}
                  strokeWidth={0.08}
                />
              </svg>
            </div>
            <p className="text-[10px] text-slate-600 mt-2 text-center">
              {config.rows}×{config.cols} 网格 · 选中单元格居中显示
            </p>
          </div>
        </>
      )}
    </div>
  );
}
