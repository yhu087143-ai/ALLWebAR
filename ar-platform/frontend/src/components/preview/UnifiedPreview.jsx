import React, { useState, useEffect, useRef } from 'react';
import { Play, StopCircle, Clock, Star, MapPin, Layers, Zap, Activity, AlertCircle, Check } from 'lucide-react';

/**
 * UnifiedPreview — simulates both game mechanics and POI navigation.
 *
 * Shows a live simulated state that reflects the current AR experience config.
 */
export default function UnifiedPreview({ experience, onRestart }) {
  const hasMechanics = experience?.mechanics?.enabled ?? experience?.mechanics?.timer?.enabled ?? false;
  const hasNavigation = experience?.navigation?.pois?.length > 0;
  const hasRules = experience?.rules?.length > 0;
  const hasGrid = experience?.mechanics?.grid?.enabled ?? false;
  const hasWaves = experience?.mechanics?.waves?.enabled ?? false;

  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(experience?.mechanics?.scoring?.initial ?? 0);
  const [timer, setTimer] = useState(experience?.mechanics?.timer?.duration ?? 60);
  const [items, setItems] = useState(0);
  const [combo, setCombo] = useState(0);
  const [currentPOIIndex, setCurrentPOIIndex] = useState(-1);
  const [eventLog, setEventLog] = useState([]);
  const [visitedPOIs, setVisitedPOIs] = useState(new Set());
  const timerRef = useRef(null);
  const eventIdRef = useRef(0);

  const addLog = (msg, type = 'info') => {
    const id = ++eventIdRef.current;
    setEventLog(prev => [{ id, msg, type, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
  };

  const startSimulation = () => {
    setRunning(true);
    setScore(experience?.mechanics?.scoring?.initial ?? 0);
    setTimer(experience?.mechanics?.timer?.duration ?? 60);
    setItems(0);
    setCombo(0);
    setCurrentPOIIndex(-1);
    setVisitedPOIs(new Set());
    setEventLog([]);
    addLog('模拟开始', 'success');
  };

  const stopSimulation = () => {
    setRunning(false);
    addLog('模拟停止', 'warning');
  };

  // Timer tick
  useEffect(() => {
    if (!running || !hasMechanics) return;
    const isCountdown = experience?.mechanics?.timer?.countdown !== false;
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        const next = isCountdown ? prev - 1 : prev + 1;
        if (isCountdown && next <= 0) {
          clearInterval(timerRef.current);
          setRunning(false);
          addLog('⏰ 计时结束', 'warning');
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [running, hasMechanics, experience?.mechanics?.timer?.countdown]);

  // Auto-collect items periodically
  useEffect(() => {
    if (!running || !hasMechanics) return;
    const interval = setInterval(() => {
      setItems(prev => {
        const max = experience?.mechanics?.items?.total ?? 10;
        if (prev >= max) return prev;
        const newItems = prev + 1;
        const comboCount = (combo + 1) % 5 === 0 ? combo + 1 : combo + 1;
        setCombo(comboCount);
        const pts = experience?.mechanics?.scoring?.initial ?? 10;
        const mult = experience?.mechanics?.combo?.enabled ? (experience?.mechanics?.combo?.multiplier ?? 1) * Math.floor(comboCount / 3) : 1;
        setScore(s => s + pts * mult);
        addLog(`收集物品 #${newItems} (${mult > 1 ? `${mult}x ` : ''}+${pts * mult}分)`, 'info');
        return newItems;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [running, hasMechanics, combo, experience]);

  // Auto-navigate POIs
  useEffect(() => {
    if (!running || !hasNavigation || !experience?.navigation?.pois?.length) return;
    const pois = experience.navigation.pois;
    if (currentPOIIndex >= pois.length - 1) return;

    const delay = pois[currentPOIIndex + 1]?.estimatedDuration ?? 3000;
    const timeout = setTimeout(() => {
      const nextIdx = currentPOIIndex + 1;
      const poi = pois[nextIdx];
      if (poi) {
        setCurrentPOIIndex(nextIdx);
        setVisitedPOIs(prev => new Set(prev).add(poi.id));
        addLog(`到达: ${poi.name}`, 'success');
        if (poi.onEnter) {
          addLog(`  触发 onEnter: ${poi.onEnter.type}${poi.onEnter.message ? ` — ${poi.onEnter.message}` : ''}`, 'info');
        }
        if (nextIdx >= pois.length - 1) {
          addLog('所有 POI 已参观完成', 'success');
        }
      }
    }, delay);
    return () => clearTimeout(timeout);
  }, [running, hasNavigation, currentPOIIndex, experience]);

  // Check rules on state changes
  useEffect(() => {
    if (!running || !hasRules) return;
    const ctx = {
      score, timer, items, combo,
      visitedPois: visitedPOIs.size,
      totalPois: experience?.navigation?.pois?.length ?? 0,
    };
    for (const rule of experience.rules) {
      if (!rule.enabled) continue;
      const cond = rule.condition;
      let triggered = false;
      switch (cond.type) {
        case 'score_reach':
          triggered = ctx.score >= cond.value;
          break;
        case 'timer_remaining':
          triggered = cond.operator === 'less_than' ? ctx.timer <= cond.value : ctx.timer >= cond.value;
          break;
        case 'items_collected':
          triggered = cond.operator === 'at_least' ? ctx.items >= cond.value : ctx.items === cond.value;
          break;
        case 'combo_count':
          triggered = ctx.combo >= cond.value;
          break;
        case 'all_pois_visited':
          triggered = ctx.visitedPois >= ctx.totalPois && ctx.totalPois > 0;
          break;
        case 'expression': {
          try {
            const fn = new Function('score', 'timer', 'items', 'combo', 'visitedPois', 'totalPois', `return Boolean(${cond.expr})`);
            triggered = fn(ctx.score, ctx.timer, ctx.items, ctx.combo, ctx.visitedPois, ctx.totalPois);
          } catch { /* ignore */ }
          break;
        }
      }
      if (triggered) {
        addLog(`规则触发: "${rule.label}" → ${rule.action.type}`, 'trigger');
      }
    }
  }, [score, timer, items, combo, visitedPOIs, running, hasRules, experience]);

  if (!experience) {
    return (
      <div className="glass-card rounded-xl p-8 text-center">
        <Activity size={32} className="text-slate-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">请先配置体验参数</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 控制栏 */}
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Layers size={16} className="text-violet-400" />
            模拟预览
          </h3>
          <div className="flex gap-2">
            {!running ? (
              <button
                onClick={startSimulation}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
                  hover:bg-emerald-500/20 transition-all"
              >
                <Play size={12} />
                开始模拟
              </button>
            ) : (
              <button
                onClick={stopSimulation}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  bg-rose-500/10 text-rose-400 border border-rose-500/20
                  hover:bg-rose-500/20 transition-all"
              >
                <StopCircle size={12} />
                停止
              </button>
            )}
          </div>
        </div>

        {/* 状态指标 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Score */}
          <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
              <Star size={12} className="text-yellow-400" />
              分数
            </div>
            <div className="text-lg font-bold text-yellow-400">{running ? score : '-'}</div>
          </div>

          {/* Timer */}
          <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
              <Clock size={12} className={timer <= 10 && running ? 'text-rose-400' : 'text-cyan-400'} />
              计时
            </div>
            <div className={`text-lg font-bold ${timer <= 10 && running ? 'text-rose-400' : 'text-cyan-400'}`}>
              {running ? `${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, '0')}` : '-'}
            </div>
          </div>

          {/* Items */}
          <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
              <Zap size={12} className="text-violet-400" />
              物品
            </div>
            <div className="text-lg font-bold text-violet-400">
              {running ? `${items}/${experience?.mechanics?.items?.total ?? '∞'}` : '-'}
            </div>
          </div>

          {/* Progress */}
          <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
              <MapPin size={12} className="text-emerald-400" />
              导览
            </div>
            <div className="text-lg font-bold text-emerald-400">
              {running && hasNavigation
                ? `${visitedPOIs.size}/${experience?.navigation?.pois?.length ?? 0}`
                : '-'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* POI 进度 */}
        {hasNavigation && (
          <div className="glass-card rounded-xl p-4">
            <h4 className="text-xs font-medium text-slate-500 mb-3 flex items-center gap-1.5">
              <MapPin size={12} /> POI 路线进度
            </h4>
            <div className="space-y-1.5">
              {experience.navigation.pois.map((poi, idx) => {
                const isActive = running && currentPOIIndex === idx;
                const isVisited = visitedPOIs.has(poi.id);
                return (
                  <div
                    key={poi.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all
                      ${isActive ? 'bg-emerald-500/10 border border-emerald-500/20' :
                        isVisited ? 'bg-white/[0.03] border border-white/5 text-slate-400' :
                        'bg-white/[0.02] border border-white/[0.03] text-slate-600'}`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                      ${isVisited ? 'bg-emerald-500/20 text-emerald-400' :
                        isActive ? 'bg-emerald-500/30 text-emerald-300' :
                        'bg-white/5 text-slate-600'}`}>
                      {isVisited ? <Check size={11} strokeWidth={2.4} aria-hidden="true" /> : idx + 1}
                    </div>
                    <span className="flex-1 truncate">{poi.name}</span>
                    {isActive && <span className="text-emerald-400 text-[10px]">当前</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 规则事件日志 */}
        <div className="glass-card rounded-xl p-4">
          <h4 className="text-xs font-medium text-slate-500 mb-3 flex items-center gap-1.5">
            <Activity size={12} /> 事件日志
            {running && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </h4>
          <div className="h-48 overflow-y-auto space-y-1">
            {eventLog.length === 0 ? (
              <p className="text-xs text-slate-600 text-center pt-8">启动模拟后在此查看事件</p>
            ) : (
              eventLog.map(entry => (
                <div key={entry.id} className={`text-[11px] px-2 py-1 rounded ${
                  entry.type === 'success' ? 'text-emerald-400 bg-emerald-500/5' :
                  entry.type === 'warning' ? 'text-yellow-400 bg-yellow-500/5' :
                  entry.type === 'trigger' ? 'text-violet-400 bg-violet-500/5' :
                  'text-slate-400'
                }`}>
                  <span className="text-slate-600 mr-1.5">{entry.time}</span>
                  {entry.msg}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 约束条件 */}
      <div className="flex flex-wrap gap-2">
        {hasMechanics && experience?.mechanics?.timer?.enabled && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium
            bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Clock size={10} />
            {experience.mechanics.timer.duration}秒计时
          </span>
        )}
        {hasNavigation && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium
            bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <MapPin size={10} />
            {experience.navigation.pois.length}个POI路线
          </span>
        )}
        {experience?.mechanics?.combo?.enabled && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium
            bg-violet-500/10 text-violet-400 border border-violet-500/20">
            <Zap size={10} />
            连击{experience.mechanics.combo.multiplier}x
          </span>
        )}
        {experience?.navigation?.positionProvider === 'gps' && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium
            bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            <AlertCircle size={10} />
            需要 GPS 权限
          </span>
        )}
        {hasGrid && experience?.mechanics?.grid && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium
            bg-violet-500/10 text-violet-400 border border-violet-500/20">
            <Layers size={10} />
            {experience.mechanics.grid.rows}×{experience.mechanics.grid.cols} 网格
          </span>
        )}
        {hasWaves && experience?.mechanics?.waves && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium
            bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Activity size={10} />
            {experience.mechanics.waves.waves.length} 波敌人
          </span>
        )}
      </div>
    </div>
  );
}
