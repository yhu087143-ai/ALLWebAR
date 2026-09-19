import React from 'react';
import {
  Palette, Type, Square, Sparkles, Copy, Check, ChevronDown, ChevronRight,
  PaintBucket,
} from 'lucide-react';

/**
 * UIStylePanel — 主题预设选择 + 颜色自定义 + 排版/形状设置
 *
 * Props:
 *   theme: UITheme
 *   onChange: (theme: UITheme) => void
 */

const PRESET_NAMES = [
  { id: 'dark', label: '暗色', desc: '通用沉浸', color: '#6366f1' },
  { id: 'light', label: '亮色', desc: '室内教育', color: '#4f46e5' },
  { id: 'neon', label: '霓虹', desc: '科幻赛博', color: '#06b6d4' },
  { id: 'minimal', label: '极简', desc: '专业简洁', color: '#6b7280' },
  { id: 'retro', label: '复古', desc: '像素怀旧', color: '#f97316' },
  { id: 'nature', label: '自然', desc: '户外导览', color: '#22c55e' },
  { id: 'fantasy', label: '幻想', desc: '魔法童趣', color: '#d946ef' },
];

const BORDER_RADIUS_OPTIONS = [
  { id: 'none', label: '直角' },
  { id: 'small', label: '小圆' },
  { id: 'medium', label: '中圆' },
  { id: 'large', label: '大圆' },
  { id: 'full', label: '全圆' },
];

const BUTTON_STYLE_OPTIONS = [
  { id: 'rounded', label: '圆角' },
  { id: 'square', label: '方形' },
  { id: 'pill', label: '胶囊' },
];

const CARD_STYLE_OPTIONS = [
  { id: 'flat', label: '平面' },
  { id: 'elevated', label: '凸起' },
  { id: 'glass', label: '玻璃' },
  { id: 'outlined', label: '描边' },
];

const BG_EFFECTS = [
  { id: 'blur', label: '模糊' },
  { id: 'dim', label: '暗化' },
  { id: 'transparent', label: '透明' },
  { id: 'solid', label: '实心' },
];

const ANIM_OPTIONS = [
  { id: 'smooth', label: '平滑' },
  { id: 'snappy', label: '快速' },
  { id: 'none', label: '关闭' },
];

const COLOR_LABELS = {
  primary: '主色',
  secondary: '辅色',
  accent: '强调色',
  background: '背景色',
  surface: '面板色',
  text: '文字色',
  textSecondary: '次要文字',
  success: '成功',
  warning: '警告',
  error: '错误',
  info: '信息',
};

export default function UIStylePanel({ theme, onChange }) {
  /*
   * Hook 必须排在 `if (!theme) return null` 之前。
   *
   * 原先这一行在早退之后：theme 从有值变成 null（或反过来）时，
   * 两次渲染的 Hook 数量不一样，React 直接抛
   *   "Rendered more hooks than during the previous render"
   * 由错误边界兜成整页「页面加载异常」。
   * 这与 ViewPage.jsx 当初把 useState 写进 useEffect 是同一类问题 ——
   * 构建与类型检查都不会报，只在运行期炸。
   */
  const [openSection, setOpenSection] = React.useState('preset');

  if (!theme) return null;

  const update = (patch) => onChange({ ...theme, ...patch });

  const updateColors = (key, value) =>
    update({ colors: { ...theme.colors, [key]: value } });

  const updateTypography = (key, value) =>
    update({ typography: { ...theme.typography, [key]: value } });

  const updateShape = (key, value) =>
    update({ shape: { ...theme.shape, [key]: value } });

  const Collapsible = ({ id, icon: Icon, title, children }) => {
    const isOpen = openSection === id;
    return (
      <div className="bg-white/[0.02] rounded-lg border border-white/[0.06] overflow-hidden">
        <button
          type="button"
          onClick={() => setOpenSection(isOpen ? null : id)}
          className="flex items-center justify-between w-full p-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Icon size={14} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-300">{title}</span>
          </div>
          {isOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
        </button>
        {isOpen && <div className="px-3 pb-3 space-y-3 animate-fade-up">{children}</div>}
      </div>
    );
  };

  const Label = ({ children }) => (
    <label className="block text-[10px] text-slate-500 mb-1">{children}</label>
  );

  return (
    <div className="space-y-2 animate-fade-up">
      {/* 预设选择 */}
      <Collapsible id="preset" icon={Palette} title="主题预设">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRESET_NAMES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({
                ...theme,
                preset: p.id,
                colors: getPresetColors(p.id),
              })}
              className={`relative p-2 rounded-lg text-center transition-all ${
                theme.preset === p.id
                  ? 'bg-violet-500/15 border border-violet-500/30 ring-1 ring-violet-500/20'
                  : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06]'
              }`}
            >
              <div
                className="w-full h-6 rounded-md mb-1.5"
                style={{ backgroundColor: p.color }}
              />
              <p className="text-[11px] font-medium text-slate-300">{p.label}</p>
              <p className="text-[9px] text-slate-500">{p.desc}</p>
            </button>
          ))}
        </div>
      </Collapsible>

      {/* 色板 */}
      <Collapsible id="colors" icon={PaintBucket} title="颜色自定义">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(COLOR_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <input
                type="color"
                value={theme.colors[key] || '#000000'}
                onChange={(e) => updateColors(key, e.target.value)}
                className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-slate-400 truncate">{label}</p>
                <p className="text-[9px] text-slate-600 font-mono truncate">{theme.colors[key]}</p>
              </div>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* 排版 */}
      <Collapsible id="typography" icon={Type} title="排版">
        <div>
          <Label>字体</Label>
          <select
            value={theme.typography.fontFamily}
            onChange={(e) => updateTypography('fontFamily', e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300"
          >
            <option value="'Inter', system-ui, sans-serif">Inter (默认)</option>
            <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
            <option value="system-ui, sans-serif">系统字体</option>
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'titleSize', label: '标题' },
            { key: 'bodySize', label: '正文' },
            { key: 'labelSize', label: '标签' },
          ].map(({ key, label }) => (
            <div key={key}>
              <Label>{label}</Label>
              <input
                type="number"
                value={theme.typography[key]}
                onChange={(e) => updateTypography(key, parseInt(e.target.value) || 14)}
                min={8}
                max={36}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
              />
            </div>
          ))}
        </div>
      </Collapsible>

      {/* 形状 */}
      <Collapsible id="shape" icon={Square} title="形状">
        <div>
          <Label>圆角</Label>
          <div className="flex flex-wrap gap-1.5">
            {BORDER_RADIUS_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateShape('borderRadius', opt.id)}
                className={`px-2.5 py-1 rounded text-[10px] transition-all ${
                  theme.shape.borderRadius === opt.id
                    ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30'
                    : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>按钮风格</Label>
          <div className="flex flex-wrap gap-1.5">
            {BUTTON_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateShape('buttonStyle', opt.id)}
                className={`px-2.5 py-1 rounded text-[10px] transition-all ${
                  theme.shape.buttonStyle === opt.id
                    ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30'
                    : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>卡片风格</Label>
          <div className="flex flex-wrap gap-1.5">
            {CARD_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateShape('cardStyle', opt.id)}
                className={`px-2.5 py-1 rounded text-[10px] transition-all ${
                  theme.shape.cardStyle === opt.id
                    ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30'
                    : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>背景效果</Label>
          <div className="flex flex-wrap gap-1.5">
            {BG_EFFECTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateShape('backgroundEffect', opt.id)}
                className={`px-2.5 py-1 rounded text-[10px] transition-all ${
                  theme.shape.backgroundEffect === opt.id
                    ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30'
                    : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>动画风格</Label>
          <div className="flex flex-wrap gap-1.5">
            {ANIM_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => update('animation', opt.id)}
                className={`px-2.5 py-1 rounded text-[10px] transition-all ${
                  theme.animation === opt.id
                    ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30'
                    : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </Collapsible>
    </div>
  );
}

/** 获取预设主题的色板（简版） */
function getPresetColors(id) {
  const palettes = {
    dark: { primary: '#6366f1', secondary: '#8b5cf6', accent: '#06b6d4', background: '#0f0f1a', surface: '#1a1a2e', text: '#f1f5f9', textSecondary: '#94a3b8', success: '#22c55e', warning: '#eab308', error: '#ef4444', info: '#3b82f6' },
    light: { primary: '#4f46e5', secondary: '#7c3aed', accent: '#0891b2', background: '#f8fafc', surface: '#ffffff', text: '#0f172a', textSecondary: '#64748b', success: '#16a34a', warning: '#ca8a04', error: '#dc2626', info: '#2563eb' },
    neon: { primary: '#06b6d4', secondary: '#d946ef', accent: '#10b981', background: '#020617', surface: '#0f172a', text: '#ccfbf1', textSecondary: '#64748b', success: '#22c55e', warning: '#f59e0b', error: '#f43f5e', info: '#06b6d4' },
    minimal: { primary: '#6b7280', secondary: '#9ca3af', accent: '#3b82f6', background: '#000000', surface: '#111111', text: '#f9fafb', textSecondary: '#9ca3af', success: '#22c55e', warning: '#eab308', error: '#ef4444', info: '#60a5fa' },
    retro: { primary: '#f97316', secondary: '#d97706', accent: '#fb923c', background: '#1c1917', surface: '#292524', text: '#fef3c7', textSecondary: '#a8a29e', success: '#65a30d', warning: '#eab308', error: '#b91c1c', info: '#0ea5e9' },
    nature: { primary: '#22c55e', secondary: '#16a34a', accent: '#06b6d4', background: '#052e16', surface: '#14532d', text: '#f0fdf4', textSecondary: '#86efac', success: '#4ade80', warning: '#fbbf24', error: '#f87171', info: '#38bdf8' },
    fantasy: { primary: '#d946ef', secondary: '#a855f7', accent: '#fbbf24', background: '#1a0a2e', surface: '#2d1b4e', text: '#faf5ff', textSecondary: '#d8b4fe', success: '#22c55e', warning: '#eab308', error: '#fb7185', info: '#38bdf8' },
  };
  return palettes[id] || palettes.dark;
}
