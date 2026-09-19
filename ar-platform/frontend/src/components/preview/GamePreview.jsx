import React, { useState, useEffect, useRef } from 'react';
import {
  Gamepad2, Star, Target, Zap, Timer, Sparkles,
  AlertTriangle,
} from 'lucide-react';

const GAME_TYPE_LABELS = {
  scavenger: { label: '寻宝', icon: Star, color: 'text-yellow-400' },
  target: { label: '打靶', icon: Target, color: 'text-rose-400' },
  stamp: { label: '集章', icon: Gamepad2, color: 'text-emerald-400' },
};

const CONDITION_LABELS = {
  score_reach: '分数达到',
  timer_remaining: '计时剩余',
  items_collected: '收集数量',
  combo_count: '连击次数',
};

const ACTION_LABELS = {
  show_message: '显示消息',
  speed_boost: '加速',
  slow_down: '减速',
  double_score: '双倍分数',
  play_effect: '播放特效',
  spawn_bonus_item: '生成奖励',
  remove_all_items: '清除物品',
};

export default function GamePreview({ config }) {
  const [simulating, setSimulating] = useState(false);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(config?.duration || 60);
  const [items, setItems] = useState(0);
  const [combo, setCombo] = useState(0);
  const [log, setLog] = useState([]);
  const intervalRef = useRef(null);

  const addLog = (msg) => {
    setLog((prev) => [{ time: Date.now(), msg }, ...prev].slice(0, 20));
  };

  const startSimulation = () => {
    if (simulating) return;
    setSimulating(true);
    setScore(0);
    setTimer(config?.duration || 60);
    setItems(0);
    setCombo(0);
    setLog([]);

    let tick = 0;
    addLog('游戏开始');

    intervalRef.current = setInterval(() => {
      tick++;

      setScore((s) => {
        const inc = Math.floor(Math.random() * 50) + 10;
        const newScore = s + inc;
        // Check score_reach rules
        (config?.rules || []).forEach((r) => {
          if (r.condition?.type === 'score_reach' && newScore >= r.condition.value) {
            addLog(`分数达标触发:  ${r.condition.value} → ${ACTION_LABELS[r.action?.type] || r.action?.type}`);
          }
        });
        return newScore;
      });

      setTimer((t) => {
        const nt = Math.max(0, t - 1);
        // Check timer_remaining rules
        (config?.rules || []).forEach((r) => {
          if (r.condition?.type === 'timer_remaining') {
            const op = r.condition.operator;
            if ((op === 'less_than' && nt <= r.condition.value) ||
                (op === 'greater_than' && nt >= r.condition.value)) {
              addLog(`⏱ 规则触发: 计时${op === 'less_than' ? '少于' : '多于'} ${r.condition.value}s → ${ACTION_LABELS[r.action?.type] || r.action?.type}`);
            }
          }
        });
        return nt;
      });

      // Random item collection
      if (Math.random() < 0.3 && items < (config?.itemCount || 10)) {
        setItems((i) => {
          const ni = i + 1;
          addLog(`收集物品 ${ni}/${config?.itemCount}`);
          // Check items_collected rules
          (config?.rules || []).forEach((r) => {
            if (r.condition?.type === 'items_collected') {
              const op = r.condition.operator;
              if ((op === 'at_least' && ni >= r.condition.value) ||
                  (op === 'exact' && ni === r.condition.value)) {
                addLog(`收集触发: 收集 ${ni} 个 → ${ACTION_LABELS[r.action?.type] || r.action?.type}`);
              }
            }
          });
          // Check combo_count rules
          if (config?.comboEnabled && Math.random() < 0.3) {
            setCombo((c) => {
              const nc = c + 1;
              (config?.rules || []).forEach((r) => {
                if (r.condition?.type === 'combo_count' && nc >= r.condition.value) {
                  addLog(`连击触发: 连击 ${nc} 次 → ${ACTION_LABELS[r.action?.type] || r.action?.type}`);
                }
              });
              return nc;
            });
          }
          return ni;
        });
      }

      // End simulation
      if (tick >= (config?.duration || 60)) {
        clearInterval(intervalRef.current);
        setSimulating(false);
        addLog('游戏结束');
      }
    }, 1000);
  };

  const stopSimulation = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSimulating(false);
    addLog('⏹ 模拟停止');
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const gt = GAME_TYPE_LABELS[config?.type] || GAME_TYPE_LABELS.scavenger;
  const Icon = gt.icon;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* 游戏概览 */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">游戏概览</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={14} className={gt.color} />
              <span className="text-xs text-slate-500">类型</span>
            </div>
            <p className="text-sm font-medium text-slate-200">{gt.label}</p>
          </div>
          <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-1.5 mb-1">
              <Timer size={14} className="text-cyan-400" />
              <span className="text-xs text-slate-500">时长</span>
            </div>
            <p className="text-sm font-medium text-slate-200">{config?.duration || 60}s</p>
          </div>
          <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-1.5 mb-1">
              <Star size={14} className="text-yellow-400" />
              <span className="text-xs text-slate-500">物品</span>
            </div>
            <p className="text-sm font-medium text-slate-200">{config?.itemCount || 10} 个</p>
          </div>
          <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap size={14} className="text-rose-400" />
              <span className="text-xs text-slate-500">分数/个</span>
            </div>
            <p className="text-sm font-medium text-slate-200">{config?.scorePerItem || 100}</p>
          </div>
        </div>

        {config?.comboEnabled && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-500/10">
            <Sparkles size={14} className="text-rose-400" />
            <span className="text-xs text-rose-300">连击系统已启用</span>
          </div>
        )}
      </div>

      {/* 规则列表 */}
      {config?.rules?.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">
            游戏规则 ({config.rules.length})
          </h3>
          <div className="space-y-2">
            {config.rules.map((rule, i) => (
              <div key={rule.id} className="flex items-start gap-2 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <span className="text-[10px] text-slate-600 font-mono mt-0.5">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300">{rule.description}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    <span className="text-violet-400">条件</span> {CONDITION_LABELS[rule.condition?.type] || rule.condition?.type}
                    {rule.condition?.operator === 'less_than' ? ' < ' : rule.condition?.operator === 'greater_than' ? ' > ' : ' ≥ '}
                    {rule.condition?.value}
                    <span className="mx-1.5 text-slate-600">→</span>
                    <span className="text-rose-400">动作</span> {ACTION_LABELS[rule.action?.type] || rule.action?.type}
                    {rule.action?.text && ` "${rule.action.text}"`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 模拟运行 */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">模拟运行</h3>
          {!simulating ? (
            <button
              onClick={startSimulation}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-all"
            >
              开始模拟
            </button>
          ) : (
            <button
              onClick={stopSimulation}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all"
            >
              停止
            </button>
          )}
        </div>

        {/* 实时状态 */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="p-2 rounded-lg bg-white/[0.03] text-center">
            <p className="text-[10px] text-slate-500">分数</p>
            <p className="text-lg font-bold text-yellow-400">{score}</p>
          </div>
          <div className="p-2 rounded-lg bg-white/[0.03] text-center">
            <p className="text-[10px] text-slate-500">剩余</p>
            <p className={`text-lg font-bold ${timer <= 10 ? 'text-rose-400' : 'text-cyan-400'}`}>{timer}s</p>
          </div>
          <div className="p-2 rounded-lg bg-white/[0.03] text-center">
            <p className="text-[10px] text-slate-500">收集</p>
            <p className="text-lg font-bold text-emerald-400">{items}/{config?.itemCount || 10}</p>
          </div>
          <div className="p-2 rounded-lg bg-white/[0.03] text-center">
            <p className="text-[10px] text-slate-500">连击</p>
            <p className={`text-lg font-bold ${combo > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{combo}</p>
          </div>
        </div>

        {/* 事件日志 */}
        <div className="h-32 overflow-y-auto space-y-0.5">
          {log.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-6">点击"开始模拟"查看游戏运行效果</p>
          ) : (
            log.map((entry, i) => (
              <p key={i} className="text-[10px] text-slate-500 font-mono">
                {entry.msg}
              </p>
            ))
          )}
        </div>
      </div>

      {/* 约束条件 */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">注意事项</h3>
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-xs text-slate-500">
            <AlertTriangle size={14} className="text-yellow-500 shrink-0 mt-0.5" />
            <span>需要 8th Wall 引擎支持（WebAR 兼容设备）</span>
          </div>
          {config?.endCondition === 'all_collected' && (
            <div className="flex items-start gap-2 text-xs text-slate-500">
              <AlertTriangle size={14} className="text-yellow-500 shrink-0 mt-0.5" />
              <span>结束条件设为"全部收集"，收集全部 {config.itemCount} 个物品后游戏结束</span>
            </div>
          )}
          {config?.endCondition === 'score_reach' && (
            <div className="flex items-start gap-2 text-xs text-slate-500">
              <AlertTriangle size={14} className="text-yellow-500 shrink-0 mt-0.5" />
              <span>结束条件设为"分数达到 {config.endScore || 500} 分"</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
