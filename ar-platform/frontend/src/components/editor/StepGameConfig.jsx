import React, { useState } from 'react';
import {
  Gamepad2, Sparkles, Send, Plus, Trash2,
  Star, Target, ChevronDown, ChevronRight, Zap,
} from 'lucide-react';
import FileOrUrlInput from './FileOrUrlInput.jsx';

/** AI 建议预设 */
const GAME_SUGGESTIONS = [
  { label: '寻宝游戏', desc: '60秒收集10个金币', prompt: '寻宝游戏，60秒收集10个金币，卡通风格' },
  { label: '打靶挑战', desc: '45秒尽可能多命中目标', prompt: '打靶游戏，45秒，出现移动目标，击中得分' },
  { label: '极速收集', desc: '30秒极限收集挑战', prompt: '极速收集游戏，30秒内收集尽可能多的宝石' },
];

const GAME_TYPES = [
  { id: 'scavenger', label: '寻宝', desc: '在场景中收集散落的物品', icon: Star },
  { id: 'target', label: '打靶', desc: '击中移动或固定的目标', icon: Target },
  { id: 'stamp', label: '集章', desc: '找到并触碰所有打卡点', icon: Gamepad2 },
];

/**
 * StepGame：游戏配置面板
 *
 * Props:
 *   config: object     — 当前游戏配置
 *   onChange: (obj)    — 配置变更回调
 */
export default function StepGameConfig({ config, onChange }) {
  const defaultConfig = {
    enabled: true,
    type: 'scavenger',
    duration: 60,
    itemCount: 10,
    scorePerItem: 100,
    comboEnabled: true,
    spawnInterval: 3,
    maxVisible: 5,
    itemModelUrl: '',
    rules: [],
    hud: { showScore: true, showTimer: true, showCombo: true },
    endCondition: 'timer',
    onComplete: { action: 'show_score', message: '游戏结束！' },
    itemAppearance: { prompt: '', style: 'cartoon', scale: 1, glowColor: '#FFD700' },
  };

  const gameConfig = config && config.enabled ? config : defaultConfig;
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const update = (patch) => onChange({ ...gameConfig, ...patch });

  const handleAiDesign = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/game-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setAiResult(result);
    } catch (err) {
      console.error('AI game design failed:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiResult = () => {
    if (!aiResult) return;
    update({
      type: aiResult.gameConfig?.type || 'scavenger',
      duration: aiResult.gameConfig?.duration || 60,
      itemCount: aiResult.gameConfig?.itemCount || 10,
      scorePerItem: aiResult.gameConfig?.scorePerItem || 100,
      comboEnabled: aiResult.gameConfig?.comboEnabled ?? true,
      rules: aiResult.gameConfig?.rules || [],
      itemAppearance: {
        prompt: aiResult.itemPrompt || '',
        style: aiResult.itemStyle || 'cartoon',
        scale: 1,
        glowColor: '#FFD700',
      },
    });
    setAiResult(null);
    setAiPrompt('');
  };

  const addRule = () => {
    const rules = [...(gameConfig.rules || [])];
    rules.push({
      id: `rule_${Date.now()}`,
      description: '新规则',
      condition: { type: 'items_collected', value: 5, operator: 'at_least' },
      action: { type: 'show_message', text: '规则触发！' },
    });
    update({ rules });
  };

  const removeRule = (ruleId) => {
    update({ rules: (gameConfig.rules || []).filter((r) => r.id !== ruleId) });
  };

  const updateRule = (ruleId, patch) => {
    update({
      rules: (gameConfig.rules || []).map((r) =>
        r.id === ruleId ? { ...r, ...patch } : r
      ),
    });
  };

  const updateRuleCondition = (ruleId, condPatch) => {
    update({
      rules: (gameConfig.rules || []).map((r) =>
        r.id === ruleId ? { ...r, condition: { ...r.condition, ...condPatch } } : r
      ),
    });
  };

  const updateRuleAction = (ruleId, actionPatch) => {
    update({
      rules: (gameConfig.rules || []).map((r) =>
        r.id === ruleId ? { ...r, action: { ...r.action, ...actionPatch } } : r
      ),
    });
  };

  const moveRule = (ruleId, direction) => {
    const rules = [...(gameConfig.rules || [])];
    const idx = rules.findIndex((r) => r.id === ruleId);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= rules.length) return;
    [rules[idx], rules[target]] = [rules[target], rules[idx]];
    update({ rules });
  };

  /** 条件类型 → 参数说明和默认值 */
  const CONDITION_TYPES = [
    { id: 'score_reach', label: '分数达到', desc: '当玩家分数达到阈值时触发', default: { value: 100 } },
    { id: 'timer_remaining', label: '计时剩余', desc: '当剩余时间满足条件时触发', default: { value: 10, operator: 'less_than' } },
    { id: 'items_collected', label: '收集数量', desc: '当收集物品数量满足条件时触发', default: { value: 5, operator: 'at_least' } },
    { id: 'combo_count', label: '连击次数', desc: '当连击次数达标时触发', default: { value: 3, operator: 'at_least' } },
  ];

  const ACTION_TYPES = [
    { id: 'show_message', label: '显示消息', desc: '显示自定义文字', default: { text: '' } },
    { id: 'speed_boost', label: '加速', desc: '加速物品生成', default: { multiplier: 2, duration: 5 } },
    { id: 'slow_down', label: '减速', desc: '减速物品生成', default: { multiplier: 0.5, duration: 5 } },
    { id: 'double_score', label: '双倍分数', desc: '一段时间内分数翻倍', default: { duration: 10 } },
    { id: 'play_effect', label: '播放特效', desc: '全屏特效', default: { effect: 'confetti' } },
    { id: 'spawn_bonus_item', label: '生成奖励', desc: '额外生成奖励物品', default: { count: 1 } },
    { id: 'remove_all_items', label: '清除物品', desc: '移除场景中所有物品', default: {} },
  ];

  const CONDITION_OPERATORS = {
    timer_remaining: [
      { id: 'less_than', label: '小于' },
      { id: 'greater_than', label: '大于' },
    ],
    items_collected: [
      { id: 'at_least', label: '至少' },
      { id: 'exact', label: '等于' },
    ],
  };

  const EFFECT_OPTIONS = [
    { id: 'screen_shake', label: '屏幕震动' },
    { id: 'flash', label: '闪烁' },
    { id: 'confetti', label: '彩花' },
  ];

  const handleConditionTypeChange = (ruleId, newType) => {
    const typeDef = CONDITION_TYPES.find((t) => t.id === newType);
    const rule = (gameConfig.rules || []).find((r) => r.id === ruleId);
    const base = typeDef?.default || {};
    // Preserve value if it makes sense for the new type
    const cond = { ...base, type: newType };
    if (base.value === undefined && rule?.condition?.value != null) {
      cond.value = rule.condition.value;
    }
    updateRule(ruleId, { condition: cond });
  };

  const handleActionTypeChange = (ruleId, newType) => {
    const typeDef = ACTION_TYPES.find((t) => t.id === newType);
    updateRule(ruleId, { action: { ...(typeDef?.default || {}), type: newType } });
  };

  const updateHud = (key, value) => {
    update({ hud: { ...gameConfig.hud, [key]: value } });
  };

  const updateAppearance = (patch) => {
    update({ itemAppearance: { ...gameConfig.itemAppearance, ...patch } });
  };

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">配置游戏</h2>
        <p className="text-sm text-slate-500">
          为您的 AR 体验设计互动小游戏，支持寻宝收集、打靶挑战和集章打卡三种模式
        </p>
      </div>

      <div className="space-y-5">
        {/* ===== 1. AI 设计区域（可折叠） ===== */}
        <div className="glass-card rounded-xl">
          <div className="p-5">
            <button
              onClick={() => setAiOpen(!aiOpen)}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-rose-500/10 flex items-center justify-center">
                  <Sparkles size={16} className="text-violet-400" />
                </div>
                <span className="text-sm font-medium text-slate-300">AI 游戏设计</span>
              </div>
              {aiOpen ? (
                <ChevronDown size={16} className="text-slate-500" />
              ) : (
                <ChevronRight size={16} className="text-slate-500" />
              )}
            </button>

            {aiOpen && (
              <div className="mt-4 space-y-3 animate-fade-up">
                <p className="text-xs text-slate-500">用一句话描述你想要的游戏，AI 会自动生成配置</p>

                {/* 输入框 */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="例如：60秒收集金币的寻宝游戏..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                    onKeyDown={(e) => e.key === 'Enter' && handleAiDesign()}
                  />
                  <button
                    onClick={handleAiDesign}
                    disabled={aiLoading || !aiPrompt.trim()}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-violet-500 to-rose-600 text-white hover:from-violet-400 hover:to-rose-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                  >
                    {aiLoading ? (
                      <>设计中...</>
                    ) : (
                      <>
                        <Send size={12} />
                        设计
                      </>
                    )}
                  </button>
                </div>

                {/* 建议按钮 */}
                <div>
                  <p className="text-xs text-slate-500 mb-2">快速选择：</p>
                  <div className="flex flex-wrap gap-2">
                    {GAME_SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => setAiPrompt(s.prompt)}
                        className="px-3 py-2 rounded-lg text-xs bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all text-left"
                      >
                        <p className="text-slate-300 font-medium">{s.label}</p>
                        <p className="text-slate-500 text-[10px]">{s.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI 结果预览 */}
                {aiResult && (
                  <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/10">
                    <p className="text-xs text-violet-300 font-medium mb-2">AI 建议结果：</p>
                    <div className="text-xs text-slate-400 space-y-1">
                      <p>
                        游戏类型：
                        {GAME_TYPES.find((t) => t.id === aiResult.gameConfig?.type)?.label ||
                          aiResult.gameConfig?.type}
                      </p>
                      <p>时长：{aiResult.gameConfig?.duration || 60} 秒</p>
                      <p>物品数量：{aiResult.gameConfig?.itemCount || 10}</p>
                      {aiResult.itemPrompt && <p>道具描述：{aiResult.itemPrompt}</p>}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={applyAiResult}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-all"
                      >
                        应用此配置
                      </button>
                      <button
                        onClick={() => setAiResult(null)}
                        className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-400 transition-all"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ===== 2. 游戏类型选择 ===== */}
        <div className="glass-card rounded-xl">
          <div className="p-5">
            <label className="block text-sm font-medium text-slate-300 mb-3">游戏类型</label>
            <div className="grid grid-cols-3 gap-2">
              {GAME_TYPES.map((gt) => {
                const Icon = gt.icon;
                const selected = gameConfig.type === gt.id;
                return (
                  <button
                    key={gt.id}
                    onClick={() => update({ type: gt.id })}
                    className={`p-3 rounded-xl text-left transition-all ${
                      selected
                        ? 'bg-rose-500/10 border border-rose-500/30 ring-1 ring-rose-500/20'
                        : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06]'
                    }`}
                  >
                    <Icon size={18} className={selected ? 'text-rose-400' : 'text-slate-500'} />
                    <p className={`text-xs font-medium mt-1 ${selected ? 'text-rose-300' : 'text-slate-300'}`}>
                      {gt.label}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{gt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ===== 3. 核心参数 ===== */}
        <div className="glass-card rounded-xl">
          <div className="p-5">
            <label className="block text-sm font-medium text-slate-300 mb-4">核心参数</label>
            <div className="space-y-4">
              {/* 游戏时长 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-500">游戏时长</label>
                  <span className="text-xs text-slate-400">{gameConfig.duration} 秒</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="300"
                  step="5"
                  value={gameConfig.duration}
                  onChange={(e) => update({ duration: parseInt(e.target.value) })}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-rose-400
                    [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-rose-500/30"
                />
              </div>

              {/* 物品数量 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-500">物品数量</label>
                  <span className="text-xs text-slate-400">{gameConfig.itemCount}</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="50"
                  step="1"
                  value={gameConfig.itemCount}
                  onChange={(e) => update({ itemCount: parseInt(e.target.value) })}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-rose-400
                    [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-rose-500/30"
                />
              </div>

              {/* 每项分数 */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">每项分数</label>
                <input
                  type="number"
                  value={gameConfig.scorePerItem}
                  onChange={(e) => update({ scorePerItem: parseInt(e.target.value) || 0 })}
                  min="1"
                  max="1000"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
                />
              </div>

              {/* 生成间隔 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-500">生成间隔（秒）</label>
                  <span className="text-xs text-slate-400">{gameConfig.spawnInterval}s</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={gameConfig.spawnInterval}
                  onChange={(e) => update({ spawnInterval: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-rose-400
                    [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-rose-500/30"
                />
              </div>

              {/* 同时可见数量 */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">同时可见数量</label>
                <input
                  type="number"
                  value={gameConfig.maxVisible}
                  onChange={(e) => update({ maxVisible: parseInt(e.target.value) || 1 })}
                  min="1"
                  max="20"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
                />
              </div>

              {/* 连击开关 */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs text-slate-500">连击系统</label>
                  <p className="text-[10px] text-slate-600">连续收集获得额外加分</p>
                </div>
                <button
                  type="button"
                  onClick={() => update({ comboEnabled: !gameConfig.comboEnabled })}
                  className={`relative w-11 rounded-full transition-colors ${gameConfig.comboEnabled ? 'bg-rose-500' : 'bg-white/20'}`}
                  style={{ height: '22px' }}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${
                      gameConfig.comboEnabled ? 'translate-x-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ===== 4. 游戏逻辑规则列表 ===== */}
        <div className="glass-card rounded-xl">
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-300">游戏规则</label>
              <button
                onClick={addRule}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all"
              >
                <Plus size={12} />
                添加规则
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">定义游戏中的特殊规则，如收集达到一定数量时触发效果</p>

            {(!gameConfig.rules || gameConfig.rules.length === 0) ? (
              <div className="text-center py-6">
                <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-dashed border-white/10 flex items-center justify-center mx-auto mb-3">
                  <Zap size={18} className="text-slate-500" />
                </div>
                <p className="text-xs text-slate-500">暂无自定义规则</p>
                <p className="text-[10px] text-slate-600 mt-1">添加规则可创建更丰富的游戏逻辑</p>
              </div>
            ) : (
              <div className="space-y-3">
                {gameConfig.rules.map((rule, index) => {
                  const condDef = CONDITION_TYPES.find((t) => t.id === rule.condition?.type);
                  const actDef = ACTION_TYPES.find((t) => t.id === rule.action?.type);
                  const operators = CONDITION_OPERATORS[rule.condition?.type];
                  return (
                    <div
                      key={rule.id}
                      className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] space-y-3"
                    >
                      {/* 规则头部：描述 + 操作按钮 */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-600 font-mono w-5">#{index + 1}</span>
                        <input
                          type="text"
                          value={rule.description || ''}
                          onChange={(e) => updateRule(rule.id, { description: e.target.value })}
                          placeholder="规则描述"
                          className="flex-1 bg-transparent text-xs text-slate-300 placeholder:text-slate-600 border-b border-transparent hover:border-white/10 focus:border-rose-500/40 outline-none transition-colors"
                        />
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => moveRule(rule.id, -1)}
                            disabled={index === 0}
                            className="text-slate-600 hover:text-slate-400 disabled:opacity-30 transition-colors"
                            title="上移"
                          >
                            <ChevronDown size={14} className="rotate-180" />
                          </button>
                          <button
                            onClick={() => moveRule(rule.id, 1)}
                            disabled={index >= gameConfig.rules.length - 1}
                            className="text-slate-600 hover:text-slate-400 disabled:opacity-30 transition-colors"
                            title="下移"
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            onClick={() => removeRule(rule.id)}
                            className="text-slate-600 hover:text-rose-400 transition-colors ml-1"
                            title="删除规则"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* 条件编辑行 */}
                      <div className="flex items-start gap-3">
                        {/* 条件类型 */}
                        <div className="flex-1 min-w-0">
                          <label className="block text-[10px] text-slate-500 mb-1">条件</label>
                          <select
                            value={rule.condition?.type || 'items_collected'}
                            onChange={(e) => handleConditionTypeChange(rule.id, e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
                          >
                            {CONDITION_TYPES.map((ct) => (
                              <option key={ct.id} value={ct.id}>{ct.label}</option>
                            ))}
                          </select>
                        </div>

                        {/* 操作符（仅 timer_remaining / items_collected） */}
                        {operators && (
                          <div className="w-20">
                            <label className="block text-[10px] text-slate-500 mb-1">操作符</label>
                            <select
                              value={rule.condition?.operator || operators[0]?.id}
                              onChange={(e) => updateRuleCondition(rule.id, { operator: e.target.value })}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
                            >
                              {operators.map((op) => (
                                <option key={op.id} value={op.id}>{op.label}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* 阈值/数值 */}
                        <div className="w-24">
                          <label className="block text-[10px] text-slate-500 mb-1">
                            {rule.condition?.type === 'score_reach' ? '分数' : '数值'}
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="9999"
                            value={rule.condition?.value ?? 5}
                            onChange={(e) => updateRuleCondition(rule.id, { value: parseInt(e.target.value) || 1 })}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
                          />
                        </div>
                      </div>

                      {/* 动作编辑行 */}
                      <div className="flex items-start gap-3">
                        {/* 动作类型 */}
                        <div className="flex-1 min-w-0">
                          <label className="block text-[10px] text-slate-500 mb-1">动作</label>
                          <select
                            value={rule.action?.type || 'show_message'}
                            onChange={(e) => handleActionTypeChange(rule.id, e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
                          >
                            {ACTION_TYPES.map((at) => (
                              <option key={at.id} value={at.id}>{at.label}</option>
                            ))}
                          </select>
                        </div>

                        {/* 动作参数 — show_message: text */}
                        {rule.action?.type === 'show_message' && (
                          <div className="flex-1">
                            <label className="block text-[10px] text-slate-500 mb-1">消息文字</label>
                            <input
                              type="text"
                              value={rule.action?.text || ''}
                              onChange={(e) => updateRuleAction(rule.id, { text: e.target.value })}
                              placeholder="例如：加速啦！"
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 placeholder:text-slate-600"
                            />
                          </div>
                        )}

                        {/* action: speed_boost / slow_down multiplier+duration */}
                        {(rule.action?.type === 'speed_boost' || rule.action?.type === 'slow_down') && (
                          <>
                            <div className="w-20">
                              <label className="block text-[10px] text-slate-500 mb-1">倍率</label>
                              <input
                                type="number"
                                min="0.1"
                                max="10"
                                step="0.1"
                                value={rule.action?.multiplier ?? 2}
                                onChange={(e) => updateRuleAction(rule.id, { multiplier: parseFloat(e.target.value) || 1 })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
                              />
                            </div>
                            <div className="w-20">
                              <label className="block text-[10px] text-slate-500 mb-1">时长(s)</label>
                              <input
                                type="number"
                                min="1"
                                max="60"
                                value={rule.action?.duration ?? 5}
                                onChange={(e) => updateRuleAction(rule.id, { duration: parseInt(e.target.value) || 1 })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
                              />
                            </div>
                          </>
                        )}

                        {/* action: double_score duration */}
                        {rule.action?.type === 'double_score' && (
                          <div className="w-24">
                            <label className="block text-[10px] text-slate-500 mb-1">时长(s)</label>
                            <input
                              type="number"
                              min="1"
                              max="60"
                              value={rule.action?.duration ?? 10}
                              onChange={(e) => updateRuleAction(rule.id, { duration: parseInt(e.target.value) || 1 })}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
                            />
                          </div>
                        )}

                        {/* action: play_effect effect selector */}
                        {rule.action?.type === 'play_effect' && (
                          <div className="flex-1">
                            <label className="block text-[10px] text-slate-500 mb-1">特效类型</label>
                            <select
                              value={rule.action?.effect || 'confetti'}
                              onChange={(e) => updateRuleAction(rule.id, { effect: e.target.value })}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
                            >
                              {EFFECT_OPTIONS.map((eo) => (
                                <option key={eo.id} value={eo.id}>{eo.label}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* action: spawn_bonus_item count + modelUrl */}
                        {rule.action?.type === 'spawn_bonus_item' && (
                          <>
                            <div className="w-20">
                              <label className="block text-[10px] text-slate-500 mb-1">数量</label>
                              <input
                                type="number"
                                min="1"
                                max="20"
                                value={rule.action?.count ?? 1}
                                onChange={(e) => updateRuleAction(rule.id, { count: parseInt(e.target.value) || 1 })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-[10px] text-slate-500 mb-1">模型 URL（可选）</label>
                              <input
                                type="text"
                                value={rule.action?.modelUrl || ''}
                                onChange={(e) => updateRuleAction(rule.id, { modelUrl: e.target.value })}
                                placeholder="https://example.com/bonus.glb"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 placeholder:text-slate-600"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ===== 5. 3D 道具模型配置 ===== */}
        <div className="glass-card rounded-xl">
          <div className="p-5">
            <label className="block text-sm font-medium text-slate-300 mb-3">道具模型</label>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">外观描述</label>
                <input
                  type="text"
                  value={gameConfig.itemAppearance?.prompt || ''}
                  onChange={(e) => updateAppearance({ prompt: e.target.value })}
                  placeholder="例如：金色发光星星"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">风格</label>
                <div className="flex gap-2">
                  {['cartoon', 'realistic', 'lowpoly', 'glow'].map((style) => (
                    <button
                      key={style}
                      onClick={() => updateAppearance({ style })}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                        gameConfig.itemAppearance?.style === style
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                      }`}
                    >
                      {style === 'cartoon'
                        ? '卡通'
                        : style === 'realistic'
                        ? '写实'
                        : style === 'lowpoly'
                        ? '低面'
                        : '发光'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-500">缩放</label>
                  <span className="text-xs text-slate-400">{gameConfig.itemAppearance?.scale || 1}x</span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="3"
                  step="0.1"
                  value={gameConfig.itemAppearance?.scale || 1}
                  onChange={(e) => updateAppearance({ scale: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-rose-400
                    [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-rose-500/30"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">发光颜色</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={gameConfig.itemAppearance?.glowColor || '#FFD700'}
                    onChange={(e) => updateAppearance({ glowColor: e.target.value })}
                    className="w-8 h-8 rounded-lg bg-transparent border border-white/10 cursor-pointer"
                  />
                  <span className="text-xs text-slate-500">
                    {gameConfig.itemAppearance?.glowColor || '#FFD700'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">自定义模型（可选）</label>
                <FileOrUrlInput
                  value={gameConfig.itemModelUrl || ''}
                  onChange={(v) => update({ itemModelUrl: v })}
                  placeholder="https://example.com/item.glb"
                  accept="model"
                  compact
                />
              </div>
            </div>
          </div>
        </div>

        {/* ===== 6. HUD 显示设置 ===== */}
        <div className="glass-card rounded-xl">
          <div className="p-5">
            <label className="block text-sm font-medium text-slate-300 mb-3">HUD 显示</label>
            <div className="space-y-3">
              {[
                { key: 'showScore', label: '显示分数', desc: '在屏幕上方显示当前分数' },
                { key: 'showTimer', label: '显示计时器', desc: '在屏幕上方显示剩余时间' },
                { key: 'showCombo', label: '显示连击', desc: '连击时显示连击数提示' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-300">{item.label}</p>
                    <p className="text-[10px] text-slate-600">{item.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateHud(item.key, !gameConfig.hud?.[item.key])}
                    className={`relative w-11 rounded-full transition-colors ${
                      gameConfig.hud?.[item.key] ? 'bg-rose-500' : 'bg-white/20'
                    }`}
                    style={{ height: '22px' }}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${
                        gameConfig.hud?.[item.key] ? 'translate-x-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== 7. 结束配置 ===== */}
        <div className="glass-card rounded-xl">
          <div className="p-5">
            <label className="block text-sm font-medium text-slate-300 mb-3">结束配置</label>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">结束条件</label>
                <select
                  value={gameConfig.endCondition || 'timer'}
                  onChange={(e) => update({ endCondition: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
                >
                  <option value="timer">倒计时结束</option>
                  <option value="all_collected">全部收集</option>
                  <option value="manual">手动结束</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">结束动作</label>
                <select
                  value={gameConfig.onComplete?.action || 'show_score'}
                  onChange={(e) =>
                    update({ onComplete: { ...gameConfig.onComplete, action: e.target.value } })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
                >
                  <option value="show_score">显示分数</option>
                  <option value="show_message">显示自定义消息</option>
                  <option value="restart">自动重新开始</option>
                  <option value="link">跳转链接</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">结束消息</label>
                <input
                  type="text"
                  value={gameConfig.onComplete?.message || ''}
                  onChange={(e) =>
                    update({ onComplete: { ...gameConfig.onComplete, message: e.target.value } })
                  }
                  placeholder="游戏结束！"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
