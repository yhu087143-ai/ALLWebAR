import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  Sigma,
  Variable,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Minus,
  Hash,
  Timer,
  Backpack,
  Gauge,
  LocateFixed,
  LocateOff,
  MapPin,
  Code2,
} from 'lucide-react';

/**
 * ConditionBuilder — AR 游戏规则条件编辑器
 *
 * Props:
 *   condition   — 当前条件对象 { type, ...params }
 *   onChange    — (newCondition) => void
 *   context     — 可选的游戏状态上下文，用于表达式实时预览
 *                 { score, timer, items, combo, multiplier, elapsed, visitedPois, totalPois }
 */
export default function ConditionBuilder({ condition, onChange, context }) {
  const exprTextareaRef = useRef(null);
  const [exprCursor, setExprCursor] = useState(null);

  // ========== 条件类型定义 ==========
  const conditionTypes = useMemo(() => [
    { id: 'score_reach',     label: '分数达到',     icon: Hash,        desc: '当玩家分数达到阈值时触发' },
    { id: 'timer_remaining', label: '计时剩余',     icon: Timer,       desc: '当剩余时间满足条件时触发' },
    { id: 'items_collected', label: '收集数量',     icon: Backpack,    desc: '当收集物品数量满足条件时触发' },
    { id: 'combo_count',     label: '连击次数',     icon: Gauge,       desc: '当连击次数达标时触发' },
    { id: 'proximity_enter', label: '进入区域',     icon: LocateFixed, desc: '当玩家进入指定 POI 区域时触发' },
    { id: 'proximity_exit',  label: '离开区域',     icon: LocateOff,   desc: '当玩家离开指定 POI 区域时触发' },
    { id: 'all_pois_visited',label: '全部打卡',     icon: MapPin,      desc: '当所有打卡点都被访问后触发' },
    { id: 'expression',      label: '表达式',       icon: Sigma,       desc: '使用自定义表达式定义复杂条件' },
    { id: 'custom',          label: '自定义代码',   icon: Code2,       desc: '使用 JavaScript 代码段作为条件' },
  ], []);

  const currentType = condition?.type || 'score_reach';
  const currentDef = conditionTypes.find((t) => t.id === currentType);

  // ========== 类型变更 ==========
  const handleTypeChange = (newType) => {
    const defaults = {
      score_reach:     { type: 'score_reach', value: 100 },
      timer_remaining: { type: 'timer_remaining', value: 10, operator: 'less_than' },
      items_collected: { type: 'items_collected', value: 5, operator: 'at_least' },
      combo_count:     { type: 'combo_count', value: 3 },
      proximity_enter: { type: 'proximity_enter', poiId: '' },
      proximity_exit:  { type: 'proximity_exit', poiId: '' },
      all_pois_visited:{ type: 'all_pois_visited' },
      expression:      { type: 'expression', expr: '', label: '' },
      custom:          { type: 'custom', evaluate: '', label: '' },
    };
    onChange(defaults[newType] || { type: newType });
  };

  // ========== 通用更新 ==========
  const update = (patch) => onChange({ ...condition, ...patch });

  // ========== 数值输入（含 ± 按钮） ==========
  const NumberStepper = ({ value, onChange: onValChange, min = 0, max = 99999, step = 1 }) => (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onValChange(Math.max(min, (value || 0) - step))}
        disabled={(value || 0) <= min}
        className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center
          text-slate-400 hover:text-slate-200 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <Minus size={14} />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? 0}
        onChange={(e) => onValChange(parseFloat(e.target.value) || 0)}
        className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300
          text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
          focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      />
      <button
        type="button"
        onClick={() => onValChange(Math.min(max, (value || 0) + step))}
        disabled={(value || 0) >= max}
        className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center
          text-slate-400 hover:text-slate-200 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <Plus size={14} />
      </button>
    </div>
  );

  // ========== 操作符选择 ==========
  const operatorOptions = {
    timer_remaining: [
      { id: 'less_than', label: '小于' },
      { id: 'greater_than', label: '大于' },
    ],
    items_collected: [
      { id: 'exact', label: '等于' },
      { id: 'at_least', label: '至少' },
    ],
  };

  const currentOperators = operatorOptions[currentType];

  // ========== 表达式处理 ==========
  const variables = useMemo(() => [
    { key: 'score',        label: 'score',        desc: '当前分数' },
    { key: 'timer',        label: 'timer',        desc: '剩余时间（秒）' },
    { key: 'items',        label: 'items',        desc: '已收集物品数' },
    { key: 'combo',        label: 'combo',        desc: '当前连击数' },
    { key: 'multiplier',   label: 'multiplier',   desc: '分数倍率' },
    { key: 'elapsed',      label: 'elapsed',      desc: '已过时间（秒）' },
    { key: 'visitedPois',  label: 'visitedPois',  desc: '已访问 POI 数' },
    { key: 'totalPois',    label: 'totalPois',    desc: '总 POI 数' },
  ], []);

  const insertVariable = useCallback((varKey) => {
    if (!exprTextareaRef.current) return;
    const ta = exprTextareaRef.current;
    const start = ta.selectionStart ?? exprCursor ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    const field = currentType === 'expression' ? 'expr' : 'evaluate';
    const currentVal = condition?.[field] || '';
    const newVal = currentVal.substring(0, start) + varKey + currentVal.substring(end);
    update({ [field]: newVal });
    // Set cursor position after inserted variable on next render
    const newPos = start + varKey.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    });
  }, [condition, currentType, exprCursor]);

  // ========== 表达式预览与验证 ==========
  const exprField = currentType === 'expression' ? 'expr' : 'evaluate';
  const exprText = condition?.[exprField] || '';

  const liveResult = useMemo(() => {
    if (!exprText.trim()) return null;
    if (!context) return { valid: true, value: null, msg: '提供 context 后可预览结果' };

    const ctx = {
      score: context.score ?? 0,
      timer: context.timer ?? 0,
      items: context.items ?? 0,
      combo: context.combo ?? 0,
      multiplier: context.multiplier ?? 1,
      elapsed: context.elapsed ?? 0,
      visitedPois: context.visitedPois ?? 0,
      totalPois: context.totalPois ?? 0,
    };

    try {
      const fn = new Function(...Object.keys(ctx), `return (${exprText});`);
      const val = fn(...Object.values(ctx));
      const boolVal = Boolean(val);
      return { valid: true, value: val, boolVal, msg: boolVal ? '满足条件 (true)' : '不满足条件 (false)' };
    } catch (e) {
      return { valid: false, value: null, boolVal: false, msg: `语法错误: ${e.message}` };
    }
  }, [exprText, context]);

  // ========== 基本语法检查（轻量） ==========
  const syntaxValid = useMemo(() => {
    if (!exprText.trim()) return null; // empty = no indicator
    try {
      new Function(`return (${exprText});`);
      return true;
    } catch {
      try {
        new Function(exprText);
        return true;
      } catch {
        return false;
      }
    }
  }, [exprText]);

  // ========== Rendering Helpers ==========

  /** 渲染数值参数（带 ± 按钮） */
  const renderValueParam = () => (
    <div>
      <label className="block text-xs text-slate-500 mb-1.5">
        {currentType === 'score_reach' ? '目标分数' :
         currentType === 'timer_remaining' ? '时间值（秒）' :
         currentType === 'items_collected' ? '物品数量' :
         currentType === 'combo_count' ? '连击次数' : '数值'}
      </label>
      <NumberStepper
        value={condition?.value}
        onChange={(v) => update({ value: v })}
        min={currentType === 'timer_remaining' ? 1 : 0}
        max={currentType === 'timer_remaining' ? 3600 : 99999}
        step={currentType === 'timer_remaining' ? 5 : 1}
      />
    </div>
  );

  /** 渲染操作符选择 */
  const renderOperator = () => {
    if (!currentOperators) return null;
    return (
      <div>
        <label className="block text-xs text-slate-500 mb-1.5">条件运算符</label>
        <div className="flex gap-2">
          {currentOperators.map((op) => (
            <button
              key={op.id}
              type="button"
              onClick={() => update({ operator: op.id })}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                (condition?.operator || currentOperators[0].id) === op.id
                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30 ring-1 ring-violet-500/20'
                  : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  /** 渲染 POI ID 输入 */
  const renderPoiInput = () => (
    <div>
      <label className="block text-xs text-slate-500 mb-1.5">POI 标识</label>
      <input
        type="text"
        value={condition?.poiId || ''}
        onChange={(e) => update({ poiId: e.target.value })}
        placeholder="例如: poi_entrance, poi_stage"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300
          placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      />
      <p className="text-[10px] text-slate-600 mt-1">
        输入该 POI 的唯一标识 ID，需与 POI 配置中的 ID 一致
      </p>
    </div>
  );

  /** 渲染表达式编辑器 */
  const renderExpressionEditor = () => {
    const isExpr = currentType === 'expression';
    const fieldLabel = isExpr ? '条件表达式' : 'JavaScript 代码';
    const placeholder = isExpr
      ? '例如: score >= 100 && combo >= 3'
      : '例如: return context.score >= 100;';

    return (
      <div className="space-y-4">
        {/* 标签输入 */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">标签（可选）</label>
          <input
            type="text"
            value={condition?.label || ''}
            onChange={(e) => update({ label: e.target.value })}
            placeholder="例如: 高分连击条件"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300
              placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />
        </div>

        {/* 表达式文本域 */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">{fieldLabel}</label>
          <textarea
            ref={exprTextareaRef}
            value={exprText}
            onChange={(e) => update({ [exprField]: e.target.value })}
            onSelect={(e) => setExprCursor(e.target.selectionStart)}
            placeholder={placeholder}
            rows={4}
            spellCheck={false}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-slate-300
              placeholder:text-slate-600 font-mono leading-relaxed resize-vertical
              focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />

          {/* 语法验证 + 实时预览 */}
          <div className="flex items-center gap-3 mt-2">
            {/* 语法验证 */}
            {syntaxValid === null ? (
              <span className="flex items-center gap-1 text-[11px] text-slate-600">
                <AlertCircle size={12} />
                等待输入
              </span>
            ) : syntaxValid ? (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                <CheckCircle2 size={12} />
                语法正确
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-rose-400">
                <XCircle size={12} />
                语法错误
              </span>
            )}

            {/* 实时预览 */}
            {liveResult && !liveResult.valid && (
              <span className="flex items-center gap-1 text-[11px] text-rose-400">
                <AlertCircle size={12} />
                {liveResult.msg}
              </span>
            )}
            {liveResult && liveResult.valid && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                {liveResult.value != null && (
                  <span className="text-slate-500 mr-1">
                    结果: <span className="text-slate-300">{JSON.stringify(liveResult.value)}</span>
                  </span>
                )}
                <span className={liveResult.boolVal ? 'text-emerald-400' : 'text-slate-500'}>
                  {liveResult.msg}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* 可用变量面板 */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Variable size={12} className="text-slate-500" />
            <span className="text-[11px] font-medium text-slate-500">可用变量</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVariable(v.key)}
                title={v.desc}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono
                  bg-violet-500/8 text-violet-400 border border-violet-500/15
                  hover:bg-violet-500/15 hover:border-violet-500/30 transition-all cursor-pointer"
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 mt-1.5">
            点击变量名称将其插入到光标位置。支持 JavaScript 比较运算符（==, !=, &gt;, &lt;, &gt;=, &lt;=, &amp;&amp;, ||）。
          </p>
        </div>

        {/* 使用范例 */}
        {!exprText.trim() && (
          <div>
            <p className="text-[10px] text-slate-600 mb-1.5">常用范例：</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '分数≥100', expr: 'score >= 100' },
                { label: '时间<30秒', expr: 'timer < 30' },
                { label: '连击≥5且分≥200', expr: 'combo >= 5 && score >= 200' },
                { label: '全部打卡', expr: 'visitedPois === totalPois' },
                { label: '收集过半', expr: 'items > totalPois / 2' },
              ].map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => update({ [exprField]: s.expr })}
                  className="px-2 py-1 rounded text-[10px] bg-white/[0.03] border border-white/[0.06]
                    text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-all"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ========== 主渲染 ==========
  const TypeIcon = currentDef?.icon || Sigma;

  return (
    <div className="animate-fade-up space-y-4">
      {/* ===== 类型选择器 ===== */}
      <div>
        <label className="block text-xs text-slate-500 mb-2">条件类型</label>
        <div className="grid grid-cols-3 gap-1.5">
          {conditionTypes.map((ct) => {
            const Icon = ct.icon;
            const selected = currentType === ct.id;
            return (
              <button
                key={ct.id}
                type="button"
                onClick={() => handleTypeChange(ct.id)}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  selected
                    ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30 ring-1 ring-violet-500/20'
                    : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06] hover:text-slate-300'
                }`}
                title={ct.desc}
              >
                <Icon size={14} className={selected ? 'text-violet-400' : 'text-slate-500'} />
                <span className="truncate">{ct.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== 参数配置区 ===== */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-4">
        {/* 类型描述 */}
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
            <TypeIcon size={14} className="text-violet-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-200">
              {currentDef?.label || '未知条件'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {currentDef?.desc || ''}
            </p>
          </div>
        </div>

        {/* 分隔线 */}
        <div className="border-t border-white/[0.06]" />

        {/* 参数内容 — 按类型分支 */}
        {(currentType === 'score_reach' || currentType === 'combo_count') && (
          <div className="space-y-3">
            {renderOperator()}
            {renderValueParam()}
          </div>
        )}

        {currentType === 'timer_remaining' && (
          <div className="space-y-3">
            {renderOperator()}
            {renderValueParam()}
          </div>
        )}

        {currentType === 'items_collected' && (
          <div className="space-y-3">
            {renderOperator()}
            {renderValueParam()}
          </div>
        )}

        {(currentType === 'proximity_enter' || currentType === 'proximity_exit') && (
          renderPoiInput()
        )}

        {currentType === 'all_pois_visited' && (
          <div className="py-2">
            <p className="text-xs text-slate-400">
              当玩家访问了所有 POI 时自动触发，无需额外参数。
            </p>
            {context && (
              <p className="text-xs text-slate-500 mt-2">
                进度: {context.visitedPois ?? 0} / {context.totalPois ?? 0}
              </p>
            )}
          </div>
        )}

        {(currentType === 'expression' || currentType === 'custom') && (
          renderExpressionEditor()
        )}
      </div>
    </div>
  );
}
