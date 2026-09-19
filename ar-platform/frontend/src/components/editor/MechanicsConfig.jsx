import React, { useState } from 'react';
import {
  Trophy, Timer, Target, Zap, Heart, ChevronDown, ChevronRight,
  RotateCcw, MessageSquare, Gauge,
} from 'lucide-react';

/**
 * MechanicsConfig - 游戏机制配置面板
 *
 * Props:
 *   mechanics: object — {
 *     scoring: { enabled: boolean, initial: number },
 *     timer: { enabled: boolean, duration: number, countdown: boolean },
 *     items: { enabled: boolean, total: number, spawnInterval: number, maxVisible: number },
 *     combo: { enabled: boolean, multiplier: number },
 *     lives?: { enabled: boolean, total: number, onZero: 'end_game' | 'restart' | 'show_message' },
 *   }
 *   onChange: (newMechanics) => void
 */
export default function MechanicsConfig({ mechanics, onChange }) {
  const defaults = {
    scoring: { enabled: false, initial: 0 },
    timer: { enabled: false, duration: 60, countdown: true },
    items: { enabled: false, total: 10, spawnInterval: 3, maxVisible: 5 },
    combo: { enabled: false, multiplier: 2 },
    lives: undefined,
  };

  const config = {
    scoring: { ...defaults.scoring, ...(mechanics?.scoring || {}) },
    timer: { ...defaults.timer, ...(mechanics?.timer || {}) },
    items: { ...defaults.items, ...(mechanics?.items || {}) },
    combo: { ...defaults.combo, ...(mechanics?.combo || {}) },
    lives: mechanics?.lives
      ? { enabled: false, total: 3, onZero: 'end_game', ...mechanics.lives }
      : undefined,
  };

  const [livesEnabled, setLivesEnabled] = useState(config.lives?.enabled ?? false);
  const [openSection, setOpenSection] = useState(null);

  const updateSection = (section, patch) => {
    const updated = { ...mechanics };
    if (section === 'lives') {
      updated.lives = { ...(updated.lives || {}), ...patch };
    } else {
      updated[section] = { ...(updated[section] || {}), ...patch };
    }
    onChange(updated);
  };

  const toggleSection = (section, currentEnabled) => {
    const newEnabled = !currentEnabled;
    if (section === 'lives') {
      setLivesEnabled(newEnabled);
      if (!newEnabled) {
        const updated = { ...mechanics };
        delete updated.lives;
        onChange(updated);
      } else {
        updateSection('lives', { enabled: true, total: 3, onZero: 'end_game' });
      }
    } else {
      updateSection(section, { enabled: newEnabled });
    }
  };

  const handleLivesChange = (patch) => {
    const current = config.lives || { enabled: true, total: 3, onZero: 'end_game' };
    updateSection('lives', { ...current, ...patch });
  };

  // ====== 用于 summary 的 enabled 列表 ======
  const enabledSections = [];
  if (config.scoring.enabled) enabledSections.push({ id: 'scoring', label: '计分', icon: Trophy, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' });
  if (config.timer.enabled) enabledSections.push({ id: 'timer', label: '计时器', icon: Timer, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' });
  if (config.items.enabled) enabledSections.push({ id: 'items', label: '物品', icon: Target, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' });
  if (config.combo.enabled) enabledSections.push({ id: 'combo', label: '连击', icon: Zap, color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' });
  if (livesEnabled) enabledSections.push({ id: 'lives', label: '生命', icon: Heart, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' });

  // ====== Toggle Switch (reusable pill) ======
  const Toggle = ({ enabled, onChange }) => (
    <button
      type="button"
      onClick={onChange}
      className={`relative w-10 rounded-full transition-colors duration-200 ${enabled ? 'bg-violet-500' : 'bg-white/20'}`}
      style={{ height: '22px', width: '40px' }}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white transition-transform duration-200 shadow ${
          enabled ? 'translate-x-[18px]' : ''
        }`}
      />
    </button>
  );

  // ====== Collapsible Panel Wrapper ======
  const Panel = ({ id, icon: Icon, title, description, enabled, onToggle, children }) => {
    const isOpen = openSection === id;
    return (
      <div className="bg-white/[0.02] rounded-lg border border-white/[0.06] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <button
            type="button"
            onClick={() => setOpenSection(isOpen ? null : id)}
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
              <Icon size={14} className="text-slate-400" />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-medium text-slate-300">{title}</span>
              {description && (
                <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
              )}
            </div>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <Toggle enabled={enabled} onChange={onToggle} />
            <button
              type="button"
              onClick={() => setOpenSection(isOpen ? null : id)}
              className="text-slate-600 hover:text-slate-400 transition-colors"
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
        </div>

        {/* Body */}
        {isOpen && enabled && (
          <div className="px-4 pb-4 pt-0 space-y-3 animate-fade-up">
            {children}
          </div>
        )}

        {isOpen && !enabled && (
          <div className="px-4 pb-4 pt-0">
            <p className="text-xs text-slate-600 py-2">启用此功能以查看配置选项</p>
          </div>
        )}
      </div>
    );
  };

  // ====== Reusable form elements ======
  const Label = ({ children, className = '' }) => (
    <label className={`block text-xs text-slate-500 mb-1 ${className}`}>{children}</label>
  );

  const NumberInput = ({ value, onChange, min, max, step = 1, className = '' }) => (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(step % 1 === 0 ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0)}
      min={min}
      max={max}
      step={step}
      className={`w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40 transition-colors ${className}`}
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
      className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
        accent-violet-500
        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400
        [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-violet-500/30"
    />
  );

  const Select = ({ value, onChange, options }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500/40 transition-colors"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );

  return (
    <div className="animate-fade-up">
      {/* ===== 顶部说明 ===== */}
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">游戏机制</h2>
        <p className="text-sm text-slate-500">
          配置 AR 体验中的计分、计时、物品收集、连击和生命等核心机制
        </p>
      </div>

      {/* ===== 已启用的机制摘要 ===== */}
      {enabledSections.length > 0 && (
        <div className="mb-5">
          <div className="flex flex-wrap gap-2">
            {enabledSections.map((s) => {
              const Icon = s.icon;
              return (
                <span
                  key={s.id}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${s.color}`}
                >
                  <Icon size={12} />
                  {s.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {/* ======================================================================= */}
        {/* 1. 计分 (Scoring) */}
        {/* ======================================================================= */}
        <Panel
          id="scoring"
          icon={Trophy}
          title="计分"
          description="每次收集物品获得分数"
          enabled={config.scoring.enabled}
          onToggle={() => toggleSection('scoring', config.scoring.enabled)}
        >
          <div>
            <Label>初始分数</Label>
            <NumberInput
              value={config.scoring.initial}
              onChange={(v) => updateSection('scoring', { initial: Math.max(0, Math.min(9999, v)) })}
              min={0}
              max={9999}
            />
            <p className="text-[10px] text-slate-600 mt-1">玩家开始游戏时的初始分数值</p>
          </div>
        </Panel>

        {/* ======================================================================= */}
        {/* 2. 计时器 (Timer) */}
        {/* ======================================================================= */}
        <Panel
          id="timer"
          icon={Timer}
          title="计时器"
          description="游戏时长限制"
          enabled={config.timer.enabled}
          onToggle={() => toggleSection('timer', config.timer.enabled)}
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="mb-0">游戏时长</Label>
              <span className="text-xs text-slate-400">{config.timer.duration} 秒</span>
            </div>
            <Slider
              value={config.timer.duration}
              onChange={(v) => updateSection('timer', { duration: Math.max(5, Math.min(600, v)) })}
              min={5}
              max={600}
              step={1}
            />
            <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
              <span>5 秒</span>
              <span>600 秒</span>
            </div>
          </div>

          <div>
            <Label>精确设置（秒）</Label>
            <NumberInput
              value={config.timer.duration}
              onChange={(v) => updateSection('timer', { duration: Math.max(5, Math.min(600, v)) })}
              min={5}
              max={600}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-xs text-slate-400">计时模式</p>
              <p className="text-[10px] text-slate-600 mt-0.5">
                {config.timer.countdown ? '倒计时 — 从设定时间递减' : '正计时 — 从 0 递增'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateSection('timer', { countdown: !config.timer.countdown })}
              className={`relative w-10 rounded-full transition-colors duration-200 ${config.timer.countdown ? 'bg-violet-500' : 'bg-white/20'}`}
              style={{ height: '22px', width: '40px' }}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white transition-transform duration-200 shadow ${
                  config.timer.countdown ? 'translate-x-[18px]' : ''
                }`}
              />
            </button>
          </div>
        </Panel>

        {/* ======================================================================= */}
        {/* 3. 物品 (Items) */}
        {/* ======================================================================= */}
        <Panel
          id="items"
          icon={Target}
          title="物品"
          description="AR 场景中收集的物品"
          enabled={config.items.enabled}
          onToggle={() => toggleSection('items', config.items.enabled)}
        >
          <div>
            <Label>物品总数</Label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Slider
                  value={config.items.total}
                  onChange={(v) => updateSection('items', { total: Math.max(1, Math.min(100, v)) })}
                  min={1}
                  max={100}
                  step={1}
                />
              </div>
              <span className="text-xs text-slate-400 w-8 text-right">{config.items.total}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="mb-0">生成间隔（秒）</Label>
              <span className="text-xs text-slate-400">{config.items.spawnInterval}s</span>
            </div>
            <Slider
              value={config.items.spawnInterval}
              onChange={(v) => updateSection('items', { spawnInterval: Math.max(0.5, Math.min(30, v)) })}
              min={0.5}
              max={30}
              step={0.5}
            />
            <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
              <span>0.5s</span>
              <span>30s</span>
            </div>
          </div>

          <div>
            <Label>同时最大可见数量</Label>
            <NumberInput
              value={config.items.maxVisible}
              onChange={(v) => updateSection('items', { maxVisible: Math.max(1, Math.min(20, v)) })}
              min={1}
              max={20}
            />
          </div>
        </Panel>

        {/* ======================================================================= */}
        {/* 4. 连击 (Combo) */}
        {/* ======================================================================= */}
        <Panel
          id="combo"
          icon={Zap}
          title="连击"
          description="连续收集触发分数加成"
          enabled={config.combo.enabled}
          onToggle={() => toggleSection('combo', config.combo.enabled)}
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="mb-0">加成倍率</Label>
              <span className="text-xs text-slate-400">x{config.combo.multiplier}</span>
            </div>
            <Slider
              value={config.combo.multiplier}
              onChange={(v) => updateSection('combo', { multiplier: Math.max(1, Math.min(10, v)) })}
              min={1}
              max={10}
              step={1}
            />
            <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
              <span>x1</span>
              <span>x10</span>
            </div>
          </div>

          <div>
            <Label>精确设置</Label>
            <NumberInput
              value={config.combo.multiplier}
              onChange={(v) => updateSection('combo', { multiplier: Math.max(1, Math.min(10, v)) })}
              min={1}
              max={10}
            />
          </div>

          <div className="rounded-lg bg-violet-500/5 border border-violet-500/10 p-3">
            <div className="flex items-start gap-2">
              <Gauge size={14} className="text-violet-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-violet-300 font-medium">连击机制说明</p>
                <p className="text-[11px] text-violet-300/60 mt-1">
                  每次连续收集物品时，连击数 +1，分数按 <span className="text-violet-300 font-mono">收集分数 x 连击数 x 倍率</span> 计算。
                  中断收集后连击数重置。
                </p>
              </div>
            </div>
          </div>
        </Panel>

        {/* ======================================================================= */}
        {/* 5. 生命 (Lives) — 可选 */}
        {/* ======================================================================= */}
        <Panel
          id="lives"
          icon={Heart}
          title="生命"
          description="玩家失败次数限制"
          enabled={livesEnabled}
          onToggle={() => toggleSection('lives', livesEnabled)}
        >
          <div>
            <Label>生命值</Label>
            <NumberInput
              value={config.lives?.total ?? 3}
              onChange={(v) => handleLivesChange({ total: Math.max(1, Math.min(99, v)) })}
              min={1}
              max={99}
            />
          </div>

          <div>
            <Label>生命归零时</Label>
            <Select
              value={config.lives?.onZero || 'end_game'}
              onChange={(v) => handleLivesChange({ onZero: v })}
              options={[
                { value: 'end_game', label: '结束游戏' },
                { value: 'restart', label: '重新开始' },
                { value: 'show_message', label: '显示提示消息' },
              ]}
            />
          </div>

          <div className="rounded-lg bg-rose-500/5 border border-rose-500/10 p-3">
            <div className="flex items-start gap-2">
              <Heart size={14} className="text-rose-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-rose-300 font-medium">生命机制说明</p>
                <p className="text-[11px] text-rose-300/60 mt-1">
                  玩家每次失误（如未及时收集物品）将失去一条生命。生命归零时将执行选定的行为。
                </p>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
