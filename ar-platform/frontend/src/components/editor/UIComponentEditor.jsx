import React from 'react';
import {
  X, Move, Eye, PaintBucket,
  ArrowUpLeft, ArrowUp, ArrowUpRight,
  ArrowLeft, ArrowRight,
  ArrowDownLeft, ArrowDown, ArrowDownRight,
  CircleDot,
} from 'lucide-react';

/**
 * UIComponentEditor — 单个 UI 组件的属性编辑器
 *
 * Props:
 *   component: HUDComponent
 *   onChange: (component: HUDComponent) => void
 *   onClose: () => void
 */

const ANCHORS = [
  { id: 'top-left', row: 0, col: 0 },
  { id: 'top-center', row: 0, col: 1 },
  { id: 'top-right', row: 0, col: 2 },
  { id: 'middle-left', row: 1, col: 0 },
  { id: 'center', row: 1, col: 1 },
  { id: 'middle-right', row: 1, col: 2 },
  { id: 'bottom-left', row: 2, col: 0 },
  { id: 'bottom-center', row: 2, col: 1 },
  { id: 'bottom-right', row: 2, col: 2 },
];

/**
 * 九宫格锚点图标：统一用 Lucide 图标，不用方括号箭头字符（↖ ↗ …）。
 * 字符箭头在不同字体下粗细/基线不一致，且不符合"全站 Lucide 图标"的规范。
 */
const ANCHOR_ICONS = {
  'top-left': ArrowUpLeft,
  'top-center': ArrowUp,
  'top-right': ArrowUpRight,
  'middle-left': ArrowLeft,
  center: CircleDot,
  'middle-right': ArrowRight,
  'bottom-left': ArrowDownLeft,
  'bottom-center': ArrowDown,
  'bottom-right': ArrowDownRight,
};

const COMPONENT_LABELS = {
  score: '分数', timer: '计时器', combo: '连击', lives: '生命值', message: '消息',
  poi_card: 'POI 卡片', poi_list: 'POI 列表', compass: '指南针',
  directional_arrow: '方向箭头', progress_bar: '进度条', button: '按钮', custom_text: '自定义文字',
};

export default function UIComponentEditor({ component, onChange, onClose }) {
  if (!component) return null;

  const update = (patch) => onChange({ ...component, ...patch });
  const updatePosition = (key, value) =>
    update({ position: { ...component.position, [key]: value } });
  const updateStyle = (patch) =>
    update({ style: { ...(component.style || {}), ...patch } });
  const updateProps = (patch) =>
    update({ props: { ...(component.props || {}), ...patch } });

  const Label = ({ children }) => (
    <label className="block text-[10px] text-slate-500 mb-1">{children}</label>
  );

  // ── 组件特有参数 ──
  const renderTypeProps = () => {
    const p = component.props || {};
    switch (component.type) {
      case 'score':
        return (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>显示格式</Label>
              <select value={p.format || 'number'} onChange={(e) => updateProps({ format: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300">
                <option value="number">纯数字</option>
                <option value="progress">进度条</option>
              </select>
            </div>
            <div>
              <Label>前缀</Label>
              <input type="text" value={p.prefix || ''} onChange={(e) => updateProps({ prefix: e.target.value })}
                placeholder="分数"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 placeholder:text-slate-600"
              />
            </div>
          </div>
        );

      case 'timer':
        return (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>显示格式</Label>
              <select value={p.format || 'number'} onChange={(e) => updateProps({ format: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300">
                <option value="number">数字</option>
                <option value="ring">环形</option>
              </select>
            </div>
            <div>
              <Label>警告阈值 (秒)</Label>
              <input type="number" value={p.warningThreshold ?? 10} onChange={(e) => updateProps({ warningThreshold: parseInt(e.target.value) || 10 })}
                min={1} max={60}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
              />
            </div>
          </div>
        );

      case 'combo':
        return (
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={p.showMultiplier !== false} onChange={(e) => updateProps({ showMultiplier: e.target.checked })}
              className="rounded border-white/20 bg-white/5"
            />
            <span className="text-xs text-slate-400">显示倍率</span>
          </div>
        );

      case 'lives':
        return (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>最大生命</Label>
              <input type="number" value={p.maxLives ?? 3} onChange={(e) => updateProps({ maxLives: parseInt(e.target.value) || 3 })}
                min={1} max={99}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
              />
            </div>
            <div>
              <Label>图标</Label>
              <select value={p.icon || 'heart'} onChange={(e) => updateProps({ icon: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300">
                <option value="heart">心形</option>
                <option value="star">星星</option>
                <option value="circle">● 圆形</option>
              </select>
            </div>
          </div>
        );

      case 'poi_card':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={p.showDescription !== false} onChange={(e) => updateProps({ showDescription: e.target.checked })}
                className="rounded border-white/20 bg-white/5" />
              <span className="text-xs text-slate-400">显示描述</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={p.showDistance !== false} onChange={(e) => updateProps({ showDistance: e.target.checked })}
                className="rounded border-white/20 bg-white/5" />
              <span className="text-xs text-slate-400">显示距离</span>
            </div>
          </div>
        );

      case 'poi_list':
        return (
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={p.showVisited !== false} onChange={(e) => updateProps({ showVisited: e.target.checked })}
              className="rounded border-white/20 bg-white/5" />
            <span className="text-xs text-slate-400">显示已访问标记</span>
          </div>
        );

      case 'directional_arrow':
        return (
          <div>
            <Label>箭头样式</Label>
            <select value={p.style || 'arrow'} onChange={(e) => updateProps({ style: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300">
              <option value="arrow">箭头</option>
              <option value="triangle">三角 ▲</option>
              <option value="dot">圆点 ●</option>
            </select>
          </div>
        );

      case 'progress_bar':
        return (
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={p.showLabel !== false} onChange={(e) => updateProps({ showLabel: e.target.checked })}
              className="rounded border-white/20 bg-white/5" />
            <span className="text-xs text-slate-400">显示标签</span>
          </div>
        );

      case 'button':
        return (
          <div>
            <Label>按钮文字</Label>
            <input type="text" value={p.text || ''} onChange={(e) => updateProps({ text: e.target.value })}
              placeholder="点击"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 placeholder:text-slate-600"
            />
          </div>
        );

      case 'custom_text':
        return (
          <div>
            <Label>文字内容</Label>
            <input type="text" value={p.text || ''} onChange={(e) => updateProps({ text: e.target.value })}
              placeholder="Hello AR"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 placeholder:text-slate-600"
            />
          </div>
        );

      default:
        return <p className="text-xs text-slate-600">此组件无额外参数</p>;
    }
  };

  return (
    <div className="bg-white/[0.03] rounded-lg border border-white/[0.06] animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Eye size={13} className="text-violet-400" />
          <span className="text-xs font-medium text-slate-300">
            {COMPONENT_LABELS[component.type] || component.type}
          </span>
          <span className="text-[10px] text-slate-600 font-mono">{component.id?.slice(0, 12)}</span>
        </div>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
          <X size={13} />
        </button>
      </div>

      <div className="p-3 space-y-4">
        {/* 标签 */}
        <div>
          <Label>显示标签</Label>
          <input
            type="text"
            value={component.label || ''}
            onChange={(e) => update({ label: e.target.value })}
            placeholder="组件名称"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 placeholder:text-slate-600"
          />
        </div>

        {/* 位置 */}
        <div>
          <Label>
            <div className="flex items-center gap-1">
              <Move size={10} />
              屏幕位置
            </div>
          </Label>
          <div className="grid grid-cols-3 gap-1 mb-2 w-36 mx-auto">
            {ANCHORS.map((a) => {
              const AnchorIcon = ANCHOR_ICONS[a.id] || CircleDot;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => updatePosition('anchor', a.id)}
                  aria-label={`锚点 ${a.id}`}
                  className={`w-10 h-10 rounded flex items-center justify-center transition-all ${
                    component.position?.anchor === a.id
                      ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                      : 'bg-white/[0.03] text-slate-600 border border-white/[0.06] hover:bg-white/[0.06]'
                  }`}
                >
                  <AnchorIcon size={15} strokeWidth={1.7} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>X 偏移 (px)</Label>
              <input
                type="number"
                value={component.position?.offsetX ?? 0}
                onChange={(e) => updatePosition('offsetX', parseInt(e.target.value) || 0)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
              />
            </div>
            <div>
              <Label>Y 偏移 (px)</Label>
              <input
                type="number"
                value={component.position?.offsetY ?? 0}
                onChange={(e) => updatePosition('offsetY', parseInt(e.target.value) || 0)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
              />
            </div>
          </div>
        </div>

        {/* 组件特有参数 */}
        {component.type !== 'score' && <div className="border-t border-white/[0.06]" />}
        {renderTypeProps()}

        {/* 样式覆盖 */}
        <div className="border-t border-white/[0.06]" />
        <div>
          <Label>
            <div className="flex items-center gap-1">
              <PaintBucket size={10} />
              样式覆盖（可选）
            </div>
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>文字颜色</Label>
              <input
                type="color"
                value={component.style?.textColor || '#ffffff'}
                onChange={(e) => updateStyle({ textColor: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
              />
            </div>
            <div>
              <Label>背景色</Label>
              <input
                type="color"
                value={component.style?.backgroundColor || 'transparent'}
                onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
              />
            </div>
            <div>
              <Label>字号 (px)</Label>
              <input type="number" value={component.style?.fontSize || ''}
                onChange={(e) => updateStyle({ fontSize: parseInt(e.target.value) || undefined })}
                placeholder="默认" min={8} max={48}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 placeholder:text-slate-600"
              />
            </div>
            <div>
              <Label>透明度</Label>
              <input type="number" value={component.style?.opacity ?? 1}
                onChange={(e) => updateStyle({ opacity: parseFloat(e.target.value) || 1 })}
                min={0} max={1} step={0.1}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
              />
            </div>
          </div>
        </div>

        {/* 动画 */}
        <div className="border-t border-white/[0.06]" />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>入场动画</Label>
            <select value={component.style?.animation?.enter || 'fade'}
              onChange={(e) => updateStyle({ animation: { ...(component.style?.animation || {}), enter: e.target.value } })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300">
              <option value="none">无</option>
              <option value="fade">淡入</option>
              <option value="slide-up">上滑</option>
              <option value="bounce">弹跳</option>
            </select>
          </div>
          <div>
            <Label>出场动画</Label>
            <select value={component.style?.animation?.exit || 'fade'}
              onChange={(e) => updateStyle({ animation: { ...(component.style?.animation || {}), exit: e.target.value } })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300">
              <option value="none">无</option>
              <option value="fade">淡出</option>
              <option value="slide-down">下滑</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
