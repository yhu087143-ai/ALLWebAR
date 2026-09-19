import React, { useState, useCallback } from 'react';
import {
  Plus, Trash2, Pencil, Check, X, ChevronUp, ChevronDown,
  ArrowRight, FlaskConical, Timer, ToggleLeft, ToggleRight,
  Brain, Zap
} from 'lucide-react';
import ConditionBuilder from './ConditionBuilder.jsx';
import ActionPicker from './ActionPicker.jsx';

/**
 * VisualRuleEditor — 可视化 AR 体验规则编辑器
 *
 * 每条规则包含条件(condition)、动作(action)、标签、启用开关、冷却时间。
 * 规则以卡片列表展示，支持拖拽排序（↑↓按钮）、内联编辑和条件模拟测试。
 *
 * Props:
 *   rules: Rule[]                    — 规则数组
 *   onChange: (newRules: Rule[]) => void  — 规则变更回调
 *   engine: object                   — 可选仿真引擎，用于测试条件
 *
 * Rule shape:
 *   { id, label, enabled, description, condition: { type, ...params },
 *     action: { type, ...params }, cooldown (ms, optional) }
 *
 * 依赖的外部组件:
 *   ConditionBuilder — 条件构建器（路径: ./ConditionBuilder.jsx）
 *   ActionPicker     — 动作选择器（路径: ./ActionPicker.jsx）
 */
export default function VisualRuleEditor({ rules = [], onChange, engine }) {
  // --- 本地编辑状态 ---
  const [editingId, setEditingId] = useState(null);        // 正在编辑的规则 id
  const [editingField, setEditingField] = useState(null);  // 'condition' | 'action' | null
  const [editingLabel, setEditingLabel] = useState(null);  // { id, value } | null
  const [testResults, setTestResults] = useState({});      // { [ruleId]: { pass, reason } }
  const [showAddPanel, setShowAddPanel] = useState(false);

  // ========== 条件 / 动作 可读摘要 ==========

  /** 将 condition 对象渲染为人类可读字符串 */
  function getConditionSummary(cond) {
    if (!cond || !cond.type) return <span className="text-slate-500 italic">未设置条件</span>;
    switch (cond.type) {
      case 'score':
        return `分数 ${cond.operator === '>=' ? '≥' : cond.operator === '>' ? '>' : cond.operator === '<' ? '<' : '<='} ${cond.value ?? 0}`;
      case 'timer':
        return `计时器 ${cond.operator === '>=' ? '≥' : cond.operator === '>' ? '>' : cond.operator === '<' ? '<' : '<='} ${cond.value ?? 0}s`;
      case 'expression':
        return <code className="text-xs font-mono bg-white/5 px-1.5 py-0.5 rounded text-emerald-300">{(cond.expression || '').substring(0, 40)}{(cond.expression || '').length > 40 ? '…' : ''}</code>;
      case 'proximity':
        return `距离 < ${cond.value ?? 2}m`;
      case 'tap':
        return '点击/触摸';
      case 'tracking':
        return `追踪: ${cond.state === 'found' ? '已找到' : cond.state === 'lost' ? '已丢失' : cond.state || '变化'}`;
      case 'collect':
        return `收集物品: ${cond.itemId || cond.item || '任何'}`;
      case 'blink':
        return '眨眼检测';
      case 'mouthOpen':
        return '张嘴检测';
      case 'mouthClose':
        return '闭嘴检测';
      case 'timerEnd':
        return '倒计时结束';
      default:
        return <span className="text-xs font-mono text-slate-400">{cond.type}: {JSON.stringify(omitType(cond))}</span>;
    }
  }

  /** 将 action 对象渲染为人类可读字符串 */
  function getActionSummary(act) {
    if (!act || !act.type) return <span className="text-slate-500 italic">未设置动作</span>;
    switch (act.type) {
      case 'playAnimation':
        return <>播放动画 <span className="text-violet-300 font-mono">{(act.clip || act.name || 'default')}</span></>;
      case 'playSound':
        return '播放音效';
      case 'showEffect':
        return <>特效: <span className="text-amber-300">{(act.effect || act.type || 'sparkle')}</span></>;
      case 'showMessage':
        return <span>显示消息: "{String(act.text || '').substring(0, 24)}{(act.text || '').length > 24 ? '…' : ''}"</span>;
      case 'addScore':
        return <>加分 <span className="text-emerald-300">+{act.amount ?? 10}</span></>;
      case 'link':
        return '打开链接';
      case 'triggerVibrate':
        return '震动反馈';
      case 'custom':
        return '自定义动作';
      default:
        return <span className="text-xs font-mono text-slate-400">{act.type}: {JSON.stringify(omitType(act))}</span>;
    }
  }

  /** 去除 type 字段，用于兜底显示 */
  function omitType(obj) {
    if (!obj) return {};
    const { type, ...rest } = obj;
    return rest;
  }

  // ========== 规则操作 ==========

  const handleToggleEnabled = useCallback((id) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }, [rules, onChange]);

  const handleDelete = useCallback((id) => {
    onChange(rules.filter((r) => r.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditingField(null);
    }
  }, [rules, onChange, editingId]);

  const handleMove = useCallback((index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const newRules = [...rules];
    [newRules[index], newRules[target]] = [newRules[target], newRules[index]];
    onChange(newRules);
  }, [rules, onChange]);

  const handleUpdateRule = useCallback((id, patch) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, [rules, onChange]);

  const handleConditionChange = useCallback((id, newCondition) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, condition: newCondition } : r)));
  }, [rules, onChange]);

  const handleActionChange = useCallback((id, newAction) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, action: newAction } : r)));
  }, [rules, onChange]);

  const handleLabelSave = useCallback((id) => {
    if (editingLabel && editingLabel.value.trim()) {
      handleUpdateRule(id, { label: editingLabel.value.trim() });
    }
    setEditingLabel(null);
  }, [editingLabel, handleUpdateRule]);

  // ========== 添加规则 ==========

  const addRule = useCallback(() => {
    const newRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      label: `规则 ${rules.length + 1}`,
      enabled: true,
      description: '',
      condition: { type: 'tap' },
      action: { type: 'showMessage', text: 'Hello AR!' },
      cooldown: 0,
    };
    onChange([...rules, newRule]);
    setEditingId(newRule.id);
    setEditingField('condition');
    setShowAddPanel(false);
  }, [rules, onChange]);

  // ========== 测试规则 ==========

  const handleTest = useCallback((rule) => {
    if (!engine || typeof engine.evaluateCondition !== 'function') {
      setTestResults((prev) => ({
        ...prev,
        [rule.id]: { pass: false, reason: '引擎未连接' },
      }));
      return;
    }
    try {
      const result = engine.evaluateCondition(rule.condition);
      const pass = !!result;
      setTestResults((prev) => ({
        ...prev,
        [rule.id]: { pass, reason: pass ? '条件满足' : '条件不满足' },
      }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [rule.id]: { pass: false, reason: `模拟出错: ${err.message}` },
      }));
    }
  }, [engine]);

  const startEdit = useCallback((id, field) => {
    setEditingId(id);
    setEditingField(field);
    setEditingLabel(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingField(null);
  }, []);

  // ========== 渲染 ==========

  // ---- 空状态 ----
  if (rules.length === 0 && !showAddPanel) {
    return (
      <div className="animate-fade-up">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-1">规则编辑器</h2>
          <p className="text-sm text-slate-500">
            定义 AR 体验的触发条件和响应动作。多条规则可组合出复杂交互逻辑。
          </p>
        </div>
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-dashed border-white/10 flex items-center justify-center mx-auto mb-4">
            <Brain size={24} className="text-slate-500" />
          </div>
          <p className="text-sm text-slate-500 mb-1">尚未添加任何规则</p>
          <p className="text-xs text-slate-600 mb-4">规则是可选的，跳过此步也能正常发布</p>
          <button
            onClick={() => setShowAddPanel(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium
              bg-violet-500/10 text-violet-400 border border-violet-500/20
              hover:bg-violet-500/20 transition-all"
          >
            <Plus size={14} />
            添加第一条规则
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">规则编辑器</h2>
        <p className="text-sm text-slate-500">
          定义 AR 体验的触发条件和响应动作。点击条件或动作块可编辑。
        </p>
      </div>

      <div className="space-y-3">
        {rules.map((rule, index) => {
          const isEditing = editingId === rule.id;
          const testResult = testResults[rule.id];

          return (
            <div
              key={rule.id}
              className={`glass-card rounded-xl border transition-all duration-200 ${
                isEditing
                  ? 'border-violet-500/30 bg-white/[0.06]'
                  : rule.enabled
                    ? 'border-white/[0.06]'
                    : 'border-white/[0.03] opacity-60'
              }`}
            >
              {/* ========== 卡片头部：开关 + 拖拽 + 标签 + 操作按钮 ========== */}
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                {/* 启用/禁用开关 */}
                <button
                  onClick={() => handleToggleEnabled(rule.id)}
                  className="shrink-0 text-slate-400 hover:text-violet-400 transition-colors"
                  title={rule.enabled ? '已启用' : '已禁用'}
                >
                  {rule.enabled ? <ToggleRight size={18} className="text-violet-400" /> : <ToggleLeft size={18} />}
                </button>

                {/* 拖拽按钮 */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => handleMove(index, -1)}
                    disabled={index === 0}
                    className="text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors leading-none"
                    title="上移"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={() => handleMove(index, 1)}
                    disabled={index === rules.length - 1}
                    className="text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors leading-none"
                    title="下移"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>

                {/* 规则标签（内联编辑） */}
                <div className="flex-1 min-w-0">
                  {editingLabel && editingLabel.id === rule.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editingLabel.value}
                        onChange={(e) => setEditingLabel({ ...editingLabel, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleLabelSave(rule.id);
                          if (e.key === 'Escape') setEditingLabel(null);
                        }}
                        className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-sm text-slate-100
                          w-full focus:outline-none focus:border-violet-500/50"
                        autoFocus
                        placeholder="规则名称"
                      />
                      <button
                        onClick={() => handleLabelSave(rule.id)}
                        className="text-emerald-400 hover:text-emerald-300 transition-colors"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingLabel(null)}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingLabel({ id: rule.id, value: rule.label })}
                      className="text-sm font-medium text-slate-200 hover:text-violet-300 transition-colors truncate max-w-full text-left"
                      title="点击编辑标签"
                    >
                      {rule.label}
                    </button>
                  )}
                </div>

                {/* 编辑 / 删除按钮 */}
                <div className="flex items-center gap-1 shrink-0">
                  {isEditing ? (
                    <button
                      onClick={cancelEdit}
                      className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                      title="完成编辑"
                    >
                      <Check size={15} />
                    </button>
                  ) : (
                    <button
                      onClick={() => startEdit(rule.id, null)}
                      className="text-slate-500 hover:text-violet-400 transition-colors p-1"
                      title="编辑规则"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="text-slate-600 hover:text-rose-400 transition-colors p-1"
                    title="删除规则"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* ========== 条件 → 动作 区域 ========== */}
              <div className="px-4 pb-3">
                {/* --- 非编辑模式: 摘要展示 --- */}
                {!isEditing && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* 条件块 */}
                    <button
                      onClick={() => startEdit(rule.id, 'condition')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04]
                        border border-white/[0.06] hover:border-violet-500/30 hover:bg-violet-500/5
                        transition-all text-xs group cursor-pointer"
                      title="点击编辑条件"
                    >
                      <Brain size={13} className="text-violet-400 shrink-0" />
                      <span className="text-slate-300 group-hover:text-slate-200">
                        {getConditionSummary(rule.condition)}
                      </span>
                    </button>

                    {/* 箭头 */}
                    <ArrowRight size={16} className="text-slate-600 shrink-0" />

                    {/* 动作块 */}
                    <button
                      onClick={() => startEdit(rule.id, 'action')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04]
                        border border-white/[0.06] hover:border-amber-500/30 hover:bg-amber-500/5
                        transition-all text-xs group cursor-pointer"
                      title="点击编辑动作"
                    >
                      <Zap size={13} className="text-amber-400 shrink-0" />
                      <span className="text-slate-300 group-hover:text-slate-200">
                        {getActionSummary(rule.action)}
                      </span>
                    </button>

                    {/* 冷却时间 */}
                    {rule.cooldown > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-slate-500 bg-white/[0.03]
                        px-2 py-1 rounded-md"
                      >
                        <Timer size={11} />
                        {(rule.cooldown / 1000).toFixed(0)}s 冷却
                      </span>
                    )}

                    {/* 测试按钮 + 结果 */}
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        onClick={() => handleTest(rule)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px]
                          bg-white/[0.04] border border-white/[0.06] hover:border-white/20
                          text-slate-400 hover:text-slate-300 transition-all"
                        title="模拟测试此条件"
                      >
                        <FlaskConical size={12} />
                        测试
                      </button>
                      {testResult && (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md
                            ${testResult.pass
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                        >
                          {testResult.pass ? '通过' : '未通过'}
                          {testResult.reason && (
                            <span className="text-[10px] opacity-70">({testResult.reason})</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* --- 编辑模式: 条件/动作编辑器并排 --- */}
                {isEditing && (
                  <div className="space-y-3 mt-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* 条件编辑器 */}
                      <div
                        className={`rounded-xl border p-3 transition-all ${
                          editingField === 'condition'
                            ? 'border-violet-500/40 bg-violet-500/[0.03]'
                            : 'border-white/[0.06] bg-white/[0.02]'
                        }`}
                        onClick={() => setEditingField('condition')}
                      >
                        <div className="flex items-center gap-1.5 mb-2">
                          <Brain size={14} className="text-violet-400" />
                          <span className="text-xs font-medium text-slate-400">条件</span>
                          {editingField === 'condition' && (
                            <span className="text-[10px] text-violet-400 ml-auto">编辑中</span>
                          )}
                        </div>
                        <ConditionBuilder
                          value={rule.condition}
                          onChange={(newCond) => handleConditionChange(rule.id, newCond)}
                        />
                      </div>

                      {/* 动作编辑器 */}
                      <div
                        className={`rounded-xl border p-3 transition-all ${
                          editingField === 'action'
                            ? 'border-amber-500/40 bg-amber-500/[0.03]'
                            : 'border-white/[0.06] bg-white/[0.02]'
                        }`}
                        onClick={() => setEditingField('action')}
                      >
                        <div className="flex items-center gap-1.5 mb-2">
                          <Zap size={14} className="text-amber-400" />
                          <span className="text-xs font-medium text-slate-400">动作</span>
                          {editingField === 'action' && (
                            <span className="text-[10px] text-amber-400 ml-auto">编辑中</span>
                          )}
                        </div>
                        <ActionPicker
                          value={rule.action}
                          onChange={(newAct) => handleActionChange(rule.id, newAct)}
                        />
                      </div>
                    </div>

                    {/* 高级设置: 冷却时间 + 描述 */}
                    <div className="flex flex-wrap gap-4 items-start pt-1">
                      {/* 冷却时间 */}
                      <div className="flex items-center gap-2">
                        <Timer size={14} className="text-slate-500" />
                        <label className="text-xs text-slate-500">冷却:</label>
                        <input
                          type="number"
                          min="0"
                          step="500"
                          value={rule.cooldown ?? 0}
                          onChange={(e) => handleUpdateRule(rule.id, {
                            cooldown: Math.max(0, parseInt(e.target.value) || 0),
                          })}
                          className="w-20 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-300
                            focus:outline-none focus:border-violet-500/50"
                        />
                        <span className="text-[11px] text-slate-600">ms</span>
                      </div>

                      {/* 描述 */}
                      <div className="flex-1 min-w-[200px]">
                        <input
                          type="text"
                          value={rule.description || ''}
                          onChange={(e) => handleUpdateRule(rule.id, { description: e.target.value })}
                          placeholder="规则描述 (可选)"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-400
                            focus:outline-none focus:border-white/20 placeholder:text-slate-600"
                        />
                      </div>
                    </div>

                    {/* 测试按钮 */}
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => handleTest(rule)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                          bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1]
                          text-slate-300 hover:text-slate-100 transition-all"
                      >
                        <FlaskConical size={13} />
                        测试条件
                      </button>
                      {testResult && (
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg
                            ${testResult.pass
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                        >
                          {testResult.pass ? '通过' : '未通过'}
                          {testResult.reason && (
                            <span className="text-[11px] opacity-70"> — {testResult.reason}</span>
                          )}
                        </span>
                      )}
                      {!testResult && engine && (
                        <span className="text-[11px] text-slate-600">点击测试以评估条件</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ========== 底部：添加规则按钮 ========== */}
      <div className="mt-4">
        {showAddPanel ? (
          <div className="glass-card rounded-xl p-5 border border-violet-500/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Plus size={18} className="text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">添加新规则</p>
                <p className="text-xs text-slate-500">选择一个触发条件和对应的响应动作</p>
              </div>
            </div>

            {/* 快速预设 */}
            <div className="flex flex-wrap gap-2 mb-4">
              {quickPresets.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => {
                    const newRule = {
                      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                      label: preset.label,
                      enabled: true,
                      description: preset.desc || '',
                      condition: preset.condition,
                      action: preset.action,
                      cooldown: preset.cooldown || 0,
                    };
                    onChange([...rules, newRule]);
                  }}
                  className="px-3 py-2 rounded-lg text-xs bg-white/[0.03] border border-white/[0.06]
                    hover:bg-white/[0.06] transition-all text-left"
                >
                  <p className="text-slate-300 font-medium mb-0.5">{preset.label}</p>
                  <p className="text-slate-500 text-[10px]">{preset.desc}</p>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={addRule}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium
                  bg-violet-500/10 text-violet-400 border border-violet-500/20
                  hover:bg-violet-500/20 transition-all"
              >
                <Plus size={14} />
                自定义规则
              </button>
              <button
                onClick={() => setShowAddPanel(false)}
                className="px-3 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-300 transition-all"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddPanel(true)}
            className="w-full py-3 rounded-xl text-xs font-medium text-slate-500
              border border-dashed border-white/10 hover:border-violet-500/30
              hover:text-violet-400 transition-all flex items-center justify-center gap-1.5"
          >
            <Plus size={14} />
            添加规则
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 快速添加常用规则预设
 * 与 StepEvents 中的预设模板风格一致
 */
const quickPresets = [
  {
    label: '点击播放动画',
    desc: '用户点击模型 → 播放动画',
    condition: { type: 'tap' },
    action: { type: 'playAnimation', clip: 'spin' },
  },
  {
    label: '追踪显示消息',
    desc: '识别到目标 → 显示欢迎文字',
    condition: { type: 'tracking', state: 'found' },
    action: { type: 'showMessage', text: '欢迎!' },
  },
  {
    label: '靠近触发特效',
    desc: '用户靠近模型 → 播放特效',
    condition: { type: 'proximity', value: 2 },
    action: { type: 'showEffect', effect: 'sparkle' },
  },
  {
    label: '高分庆祝',
    desc: '分数 ≥ 1000 → 播放庆祝动画',
    condition: { type: 'score', operator: '>=', value: 1000 },
    action: { type: 'playAnimation', clip: 'celebrate' },
  },
  {
    label: '收集加分',
    desc: '收集物品 → 加分',
    condition: { type: 'collect' },
    action: { type: 'addScore', amount: 10 },
  },
  {
    label: '计时结束',
    desc: '计时器结束 → 游戏结束消息',
    condition: { type: 'timerEnd' },
    action: { type: 'showMessage', text: '时间到!' },
  },
  {
    label: '自定义表达式',
    desc: '自定义条件 → 自定义动作',
    condition: { type: 'expression', expression: 'score > 500 && combo >= 3' },
    action: { type: 'custom' },
  },
];
