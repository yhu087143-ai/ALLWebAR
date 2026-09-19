import React from 'react';
import {
  Star, Timer, Zap, Heart, MessageSquare,
  MapPin, Navigation, Compass, LayoutList,
  GripVertical, ArrowRight, Square, Type,
  ToggleLeft, ToggleRight,
} from 'lucide-react';

/**
 * UIComponentList — 分类展示所有可用 UI 组件，支持启用/禁用和点击编辑
 *
 * Props:
 *   components: HUDComponent[]
 *   onChange: (components: HUDComponent[]) => void
 *   onEdit: (componentId: string) => void
 *   editingId: string | null
 */

const COMPONENT_CATEGORIES = [
  {
    name: '游戏',
    items: [
      { type: 'score', label: '分数', icon: Star, desc: '显示当前得分' },
      { type: 'timer', label: '计时器', icon: Timer, desc: '剩余时间/已过时间' },
      { type: 'combo', label: '连击', icon: Zap, desc: '连击计数和倍率' },
      { type: 'lives', label: '生命值', icon: Heart, desc: '剩余生命数' },
      { type: 'message', label: '消息', icon: MessageSquare, desc: '弹窗/通知消息' },
    ],
  },
  {
    name: '导览',
    items: [
      { type: 'poi_card', label: 'POI 卡片', icon: MapPin, desc: '当前兴趣点信息卡片' },
      { type: 'poi_list', label: 'POI 列表', icon: LayoutList, desc: '全部 POI 进度列表' },
      { type: 'compass', label: '指南针', icon: Compass, desc: '方向指示' },
      { type: 'directional_arrow', label: '方向箭头', icon: Navigation, desc: '指向下一个 POI' },
      { type: 'progress_bar', label: '进度条', icon: GripVertical, desc: '导览整体进度' },
    ],
  },
  {
    name: '通用',
    items: [
      { type: 'button', label: '按钮', icon: Square, desc: '自定义操作按钮' },
      { type: 'custom_text', label: '自定义文字', icon: Type, desc: '自由文本标签' },
    ],
  },
];

/** 为新组件生成默认配置 */
function createDefaultComponent(type) {
  const defaults = {
    score: { label: '分数', props: { format: 'number', prefix: '' } },
    timer: { label: '剩余时间', props: { format: 'number', warningThreshold: 10 } },
    combo: { label: '连击', props: { showMultiplier: true } },
    lives: { label: '生命值', props: { maxLives: 3, icon: 'heart' } },
    message: { label: '消息', props: { duration: 3 } },
    poi_card: { label: 'POI 信息', props: { showDescription: true, showDistance: true } },
    poi_list: { label: 'POI 列表', props: { showVisited: true } },
    compass: { label: '指南针', props: {} },
    directional_arrow: { label: '方向箭头', props: { style: 'arrow' } },
    progress_bar: { label: '进度', props: { showLabel: true } },
    button: { label: '按钮', props: { text: '点击', action: 'custom' } },
    custom_text: { label: '自定义文字', props: { text: 'Hello AR' } },
  };
  const def = defaults[type] || { label: type, props: {} };
  const positionMap = {
    score: { anchor: 'top-left', offsetX: 16, offsetY: 16 },
    timer: { anchor: 'top-center', offsetX: 0, offsetY: 16 },
    combo: { anchor: 'bottom-center', offsetX: 0, offsetY: 80 },
    lives: { anchor: 'top-right', offsetX: -16, offsetY: 16 },
    message: { anchor: 'bottom-center', offsetX: 0, offsetY: 100 },
    poi_card: { anchor: 'bottom-center', offsetX: 0, offsetY: -16 },
    poi_list: { anchor: 'top-right', offsetX: -16, offsetY: 60 },
    compass: { anchor: 'top-center', offsetX: 0, offsetY: 60 },
    directional_arrow: { anchor: 'center', offsetX: 0, offsetY: 0 },
    progress_bar: { anchor: 'top-center', offsetX: 0, offsetY: 50 },
    button: { anchor: 'bottom-right', offsetX: -16, offsetY: -16 },
    custom_text: { anchor: 'bottom-center', offsetX: 0, offsetY: -60 },
  };
  return {
    id: `hud_${type}_${Date.now()}`,
    type,
    enabled: false,
    label: def.label,
    position: positionMap[type] || { anchor: 'center', offsetX: 0, offsetY: 0 },
    props: def.props,
  };
}

export default function UIComponentList({ components, onChange, onEdit, editingId }) {
  const enabledMap = {};
  (components || []).forEach((c) => { enabledMap[c.type] = c.enabled; });

  const handleToggle = (type) => {
    const existing = (components || []).find((c) => c.type === type);
    if (existing) {
      onChange((components || []).map((c) =>
        c.type === type ? { ...c, enabled: !c.enabled } : c
      ));
    } else {
      const newComp = createDefaultComponent(type);
      newComp.enabled = true;
      onChange([...(components || []), newComp]);
    }
  };

  return (
    <div className="space-y-3 animate-fade-up">
      {COMPONENT_CATEGORIES.map((cat) => (
        <div key={cat.name} className="bg-white/[0.02] rounded-lg border border-white/[0.06] overflow-hidden">
          <div className="px-3 py-2 bg-white/[0.02] border-b border-white/[0.04]">
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{cat.name}</span>
          </div>
          <div className="p-2 space-y-1">
            {cat.items.map((item) => {
              const Icon = item.icon;
              const enabled = enabledMap[item.type] ?? false;
              const isEditing = editingId === getComponentId(components, item.type);

              return (
                <div
                  key={item.type}
                  className={`flex items-center gap-2 p-2 rounded-lg transition-all cursor-pointer ${
                    isEditing
                      ? 'bg-violet-500/10 border border-violet-500/20'
                      : 'hover:bg-white/[0.03] border border-transparent'
                  }`}
                  onClick={() => onEdit && onEdit(getComponentId(components, item.type))}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    enabled ? 'bg-violet-500/15 text-violet-400' : 'bg-white/[0.04] text-slate-500'
                  }`}>
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${enabled ? 'text-slate-200' : 'text-slate-500'}`}>
                        {item.label}
                      </span>
                      {enabled && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 truncate">{item.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleToggle(item.type); }}
                    className="shrink-0 text-slate-500 hover:text-violet-400 transition-colors"
                  >
                    {enabled ? <ToggleRight size={16} className="text-violet-400" /> : <ToggleLeft size={16} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function getComponentId(components, type) {
  const c = (components || []).find((c) => c.type === type);
  return c ? c.id : null;
}
