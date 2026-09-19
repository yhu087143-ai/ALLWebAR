import React, { useCallback } from 'react';
import {
  MessageSquare, Sparkles, Plus, CircleOff, Zap, ArrowDown,
  Music, Image, Link2, MapPin, Radio, RotateCcw, Square,
  Variable, Code2, Star, Award, ChevronRight,
} from 'lucide-react';

/**
 * ActionPicker — AR 游戏规则动作选择与参数配置器
 *
 * Props:
 *   action: object    — 当前动作 { type, ...params }
 *   onChange: (obj)   — 动作变更回调
 *
 * 支持 17 种动作类型，分为 8 个分类：
 *   Display    → show_message, play_effect
 *   Score      → add_score, double_score
 *   Items      → spawn_item, remove_all_items
 *   Speed      → speed_boost, slow_down
 *   Media      → play_audio, show_model, link
 *   Navigation → teleport_to_poi, trigger_event
 *   Control    → restart, end_game, set_variable
 *   Custom     → custom
 */

// ──────────────────────────── 类型定义 ────────────────────────────

const ACTION_CATEGORIES = [
  {
    name: 'Display',
    icon: MessageSquare,
    items: [
      {
        id: 'show_message',
        label: '显示消息',
        desc: '在屏幕中央弹出自定义文字',
        icon: MessageSquare,
        defaults: { text: '', duration: 3 },
      },
      {
        id: 'play_effect',
        label: '播放特效',
        desc: '全屏粒子/震动/闪烁效果',
        icon: Sparkles,
        defaults: { effect: 'confetti' },
      },
    ],
  },
  {
    name: 'Score',
    icon: Star,
    items: [
      {
        id: 'add_score',
        label: '增加分数',
        desc: '给玩家增加指定分数',
        icon: Plus,
        defaults: { value: 100 },
      },
      {
        id: 'double_score',
        label: '双倍分数',
        desc: '一段时间内分数翻倍',
        icon: Award,
        defaults: { duration: 10 },
      },
    ],
  },
  {
    name: 'Items',
    icon: Plus,
    items: [
      {
        id: 'spawn_item',
        label: '生成物品',
        desc: '在场景中生成物品',
        icon: Plus,
        defaults: { count: 1, position: [0, 0, 0] },
      },
      {
        id: 'remove_all_items',
        label: '清除物品',
        desc: '移除场景中所有物品',
        icon: CircleOff,
        defaults: {},
      },
    ],
  },
  {
    name: 'Speed',
    icon: Zap,
    items: [
      {
        id: 'speed_boost',
        label: '加速',
        desc: '加速物品生成速度',
        icon: Zap,
        defaults: { multiplier: 2, duration: 5 },
      },
      {
        id: 'slow_down',
        label: '减速',
        desc: '减速物品生成速度',
        icon: ArrowDown,
        defaults: { multiplier: 0.5, duration: 5 },
      },
    ],
  },
  {
    name: 'Media',
    icon: Music,
    items: [
      {
        id: 'play_audio',
        label: '播放音频',
        desc: '播放音效或背景音乐',
        icon: Music,
        defaults: { url: '', volume: 1 },
      },
      {
        id: 'show_model',
        label: '显示模型',
        desc: '加载并显示 3D 模型',
        icon: Image,
        defaults: { url: '', position: [0, 0, 0] },
      },
      {
        id: 'link',
        label: '跳转链接',
        desc: '打开外部网页',
        icon: Link2,
        defaults: { url: '' },
      },
    ],
  },
  {
    name: 'Navigation',
    icon: MapPin,
    items: [
      {
        id: 'teleport_to_poi',
        label: '传送至 POI',
        desc: '将玩家传送到指定兴趣点',
        icon: MapPin,
        defaults: { poiId: '' },
      },
      {
        id: 'trigger_event',
        label: '触发事件',
        desc: '触发命名事件供外部监听',
        icon: Radio,
        defaults: { eventName: '' },
      },
    ],
  },
  {
    name: 'Control',
    icon: RotateCcw,
    items: [
      {
        id: 'restart',
        label: '重新开始',
        desc: '重启整个游戏体验',
        icon: RotateCcw,
        defaults: {},
      },
      {
        id: 'end_game',
        label: '结束游戏',
        desc: '立即结束当前游戏',
        icon: Square,
        defaults: {},
      },
      {
        id: 'set_variable',
        label: '设置变量',
        desc: '设置自定义游戏变量',
        icon: Variable,
        defaults: { key: '', value: '' },
      },
    ],
  },
  {
    name: 'Custom',
    icon: Code2,
    items: [
      {
        id: 'custom',
        label: '自定义动作',
        desc: '通过 ID 和参数扩展',
        icon: Code2,
        defaults: { actionId: '', params: {} },
      },
    ],
  },
];

/** 拍平所有类型方便快速查找 */
const ACTION_MAP = Object.fromEntries(
  ACTION_CATEGORIES.flatMap((cat) => cat.items).map((item) => [item.id, item])
);

/** play_effect 的选项 */
const EFFECT_OPTIONS = [
  { id: 'screen_shake', label: '屏幕震动' },
  { id: 'flash', label: '闪烁' },
  { id: 'confetti', label: '彩花' },
];

// ──────────────────────────── 参数表单 ────────────────────────────

/**
 * 根据当前 action 的类型，动态渲染参数编辑区。
 */
function ParamForm({ action, onChange }) {
  const type = action?.type;

  const set = useCallback(
    (patch) => onChange({ ...action, ...patch }),
    [action, onChange]
  );

  const setPosition = useCallback(
    (index, value) => {
      const pos = [...(action.position || [0, 0, 0])];
      pos[index] = value;
      set({ position: pos });
    },
    [action, set]
  );

  // ── 通用 String 输入 ──
  const StrField = ({ label, key, placeholder, className }) => (
    <div className={className}>
      <label className="block text-[10px] text-slate-500 mb-1.5">{label}</label>
      <input
        type="text"
        value={action?.[key] ?? ''}
        onChange={(e) => set({ [key]: e.target.value })}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
      />
    </div>
  );

  // ── 通用 Number 输入 ──
  const NumField = ({ label, key, min, max, step, suffix, className }) => (
    <div className={className}>
      <label className="block text-[10px] text-slate-500 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={action?.[key] ?? 0}
          onChange={(e) => set({ [key]: parseFloat(e.target.value) || 0 })}
          min={min}
          max={max}
          step={step}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
        />
        {suffix && <span className="text-[10px] text-slate-500 shrink-0">{suffix}</span>}
      </div>
    </div>
  );

  // ── 通用 Select 输入 ──
  const SelectField = ({ label, key, options, className }) => (
    <div className={className}>
      <label className="block text-[10px] text-slate-500 mb-1.5">{label}</label>
      <select
        value={action?.[key] ?? options[0]?.id ?? ''}
        onChange={(e) => set({ [key]: e.target.value })}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>{opt.label}</option>
        ))}
      </select>
    </div>
  );

  // ── 3D 坐标输入 ──
  const PositionFields = ({ className }) => {
    const pos = action?.position ?? [0, 0, 0];
    return (
      <div className={className}>
        <label className="block text-[10px] text-slate-500 mb-1.5">位置 (X, Y, Z)</label>
        <div className="flex gap-2">
          {['X', 'Y', 'Z'].map((axis, i) => (
            <div key={axis} className="flex-1">
              <span className="text-[9px] text-slate-600 block mb-0.5">{axis}</span>
              <input
                type="number"
                value={pos[i] ?? 0}
                onChange={(e) => setPosition(i, parseFloat(e.target.value) || 0)}
                step="0.1"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Render by type ──
  if (!type) return null;

  switch (type) {
    // ──────────────────── 1. show_message ────────────────────
    case 'show_message':
      return (
        <div className="space-y-3">
          <StrField label="消息文字" key="text" placeholder="例如：恭喜通关！" />
          <NumField label="显示时长（秒）" key="duration" min={0.5} max={30} step={0.5} suffix="秒" />
        </div>
      );

    // ──────────────────── 2. add_score ────────────────────
    case 'add_score':
      return (
        <NumField label="增加分数" key="value" min={1} max={99999} step={1} />
      );

    // ──────────────────── 3. spawn_item ────────────────────
    case 'spawn_item':
      return (
        <div className="space-y-3">
          <StrField label="模型 URL（可选）" key="modelUrl" placeholder="https://example.com/item.glb" />
          <NumField label="生成数量" key="count" min={1} max={50} step={1} />
          <PositionFields />
        </div>
      );

    // ──────────────────── 4. remove_all_items ────────────────────
    case 'remove_all_items':
      return (
        <p className="text-xs text-slate-500">
          此动作没有额外参数，触发后将移除场景中所有物品。
        </p>
      );

    // ──────────────────── 5. speed_boost ────────────────────
    case 'speed_boost':
      return (
        <div className="grid grid-cols-2 gap-3">
          <NumField label="加速倍率" key="multiplier" min={1.1} max={10} step={0.1} suffix="x" />
          <NumField label="持续时长" key="duration" min={1} max={60} step={1} suffix="秒" />
        </div>
      );

    // ──────────────────── 6. slow_down ────────────────────
    case 'slow_down':
      return (
        <div className="grid grid-cols-2 gap-3">
          <NumField label="减速倍率" key="multiplier" min={0.1} max={0.9} step={0.1} suffix="x" />
          <NumField label="持续时长" key="duration" min={1} max={60} step={1} suffix="秒" />
        </div>
      );

    // ──────────────────── 7. double_score ────────────────────
    case 'double_score':
      return (
        <NumField label="持续时长" key="duration" min={1} max={120} step={1} suffix="秒" />
      );

    // ──────────────────── 8. play_effect ────────────────────
    case 'play_effect':
      return (
        <SelectField label="特效类型" key="effect" options={EFFECT_OPTIONS} />
      );

    // ──────────────────── 9. play_audio ────────────────────
    case 'play_audio':
      return (
        <div className="space-y-3">
          <StrField label="音频 URL" key="url" placeholder="https://example.com/sound.mp3" />
          <NumField label="音量" key="volume" min={0} max={1} step={0.1} suffix="%" />
        </div>
      );

    // ──────────────────── 10. show_model ────────────────────
    case 'show_model':
      return (
        <div className="space-y-3">
          <StrField label="模型 URL" key="url" placeholder="https://example.com/model.glb" />
          <PositionFields />
        </div>
      );

    // ──────────────────── 11. link ────────────────────
    case 'link':
      return (
        <StrField label="跳转 URL" key="url" placeholder="https://example.com" />
      );

    // ──────────────────── 12. trigger_event ────────────────────
    case 'trigger_event':
      return (
        <StrField label="事件名称" key="eventName" placeholder="例如：boss_defeated" />
      );

    // ──────────────────── 13. teleport_to_poi ────────────────────
    case 'teleport_to_poi':
      return (
        <StrField label="POI ID" key="poiId" placeholder="例如：poi_entrance" />
      );

    // ──────────────────── 14. restart ────────────────────
    case 'restart':
      return (
        <p className="text-xs text-slate-500">
          此动作没有额外参数，触发后将重新开始整个游戏。
        </p>
      );

    // ──────────────────── 15. end_game ────────────────────
    case 'end_game':
      return (
        <p className="text-xs text-slate-500">
          此动作没有额外参数，触发后将立即结束当前游戏。
        </p>
      );

    // ──────────────────── 16. set_variable ────────────────────
    case 'set_variable':
      return (
        <div className="space-y-3">
          <StrField label="变量名（Key）" key="key" placeholder="例如：boss_hp" />
          <StrField label="变量值（Value）" key="value" placeholder="例如：100 或 'active'" />
        </div>
      );

    // ──────────────────── 17. custom ────────────────────
    case 'custom':
      return (
        <div className="space-y-3">
          <StrField label="动作 ID" key="actionId" placeholder="例如：my_custom_action" />
          <div>
            <label className="block text-[10px] text-slate-500 mb-1.5">
              参数 (JSON)
            </label>
            <textarea
              value={
                action?.params ? JSON.stringify(action.params, null, 2) : '{}'
              }
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  set({ params: parsed });
                } catch {
                  // 暂不处理，让用户继续编辑
                }
              }}
              placeholder='{"key": "value"}'
              rows={6}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono placeholder:text-slate-600 resize-y"
            />
            <p className="text-[10px] text-slate-600 mt-1">
              输入合法的 JSON 对象，将在触发时传递给自定义处理函数。
            </p>
          </div>
        </div>
      );

    default:
      return (
        <p className="text-xs text-slate-500">
          未知动作类型：{type}
        </p>
      );
  }
}

// ──────────────────────────── 主组件 ────────────────────────────

/**
 * ActionPicker 主组件
 *
 * 上半部分：按分类展示所有动作类型按钮（图标 + 名称 + 简短描述）
 * 下半部分：选中类型的参数编辑表单
 */
export default function ActionPicker({ action, onChange }) {
  const currentType = action?.type || 'show_message';

  const handleTypeChange = (typeId) => {
    const def = ACTION_MAP[typeId];
    if (!def) return;
    // 如果是同一类型，不重置参数
    if (action?.type === typeId) return;
    onChange({ type: typeId, ...def.defaults });
  };

  return (
    <div className="space-y-5">
      {/* ─── 上半部分：动作类型选择器 ─── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Zap size={12} className="text-violet-400" />
          </div>
          <span className="text-xs font-medium text-slate-300">选择动作类型</span>
        </div>

        <div className="space-y-4">
          {ACTION_CATEGORIES.map((cat) => {
            const CatIcon = cat.icon;
            return (
              <div key={cat.name} className="glass-card rounded-xl overflow-hidden">
                {/* 分类标题 */}
                <div className="px-4 py-2 bg-white/[0.02] border-b border-white/[0.04] flex items-center gap-2">
                  <CatIcon size={12} className="text-violet-400" />
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    {cat.name}
                  </span>
                  <ChevronRight size={10} className="text-slate-600" />
                </div>

                {/* 动作按钮网格 */}
                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {cat.items.map((item) => {
                    const ItemIcon = item.icon;
                    const selected = currentType === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleTypeChange(item.id)}
                        className={`
                          relative flex flex-col items-start p-3 rounded-xl text-left transition-all duration-150
                          ${selected
                            ? 'bg-violet-500/15 border border-violet-500/30 ring-1 ring-violet-500/20 shadow-sm shadow-violet-500/5'
                            : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.12] active:scale-[0.98]'
                          }
                        `}
                      >
                        {/* 选中指示器 */}
                        {selected && (
                          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-violet-400" />
                        )}

                        <div
                          className={`
                            w-7 h-7 rounded-lg flex items-center justify-center mb-1.5 transition-colors
                            ${selected
                              ? 'bg-violet-500/20 text-violet-300'
                              : 'bg-white/[0.04] text-slate-500 group-hover:text-slate-400'
                            }
                          `}
                        >
                          <ItemIcon size={14} />
                        </div>
                        <span
                          className={`text-xs font-medium leading-tight ${
                            selected ? 'text-violet-200' : 'text-slate-300'
                          }`}
                        >
                          {item.label}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5 leading-tight line-clamp-2">
                          {item.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── 下半部分：参数编辑 ─── */}
      {action && action.type && (
        <div className="glass-card rounded-xl">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <ChevronRight size={12} className="text-violet-400" />
              </div>
              <span className="text-xs font-medium text-slate-300">
                参数配置 —
                <span className="text-violet-300 ml-1">
                  {ACTION_MAP[action.type]?.label || action.type}
                </span>
              </span>
            </div>
            <ParamForm action={action} onChange={onChange} />
          </div>
        </div>
      )}
    </div>
  );
}
