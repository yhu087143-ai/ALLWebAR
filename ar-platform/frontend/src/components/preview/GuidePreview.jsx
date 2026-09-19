import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Navigation, AlertTriangle, CheckCircle,
  Play,
} from 'lucide-react';

const ACTION_LABELS = {
  show_message: '显示消息',
  play_audio: '播放音频',
  link: '跳转链接',
  show_model: '显示模型',
  trigger_event: '触发事件',
};

export default function GuidePreview({ route }) {
  const [simulating, setSimulating] = useState(false);
  const [activePOIIndex, setActivePOIIndex] = useState(-1);
  const [log, setLog] = useState([]);
  const [visited, setVisited] = useState(new Set());
  const intervalRef = useRef(null);

  const addLog = (msg) => {
    setLog((prev) => [{ time: Date.now(), msg }, ...prev].slice(0, 30));
  };

  const startSimulation = () => {
    if (simulating || !route?.pois?.length) return;
    setSimulating(true);
    setActivePOIIndex(-1);
    setVisited(new Set());
    setLog([]);

    let poiIdx = 0;
    addLog('导览开始');
    addLog(`共 ${route.pois.length} 个兴趣点`);

    intervalRef.current = setInterval(() => {
      if (poiIdx < route.pois.length) {
        const poi = route.pois[poiIdx];
        addLog(`到达: ${poi.name}${poi.description ? ` — ${poi.description}` : ''}`);
        setActivePOIIndex(poiIdx);
        setVisited((prev) => new Set([...prev, poi.id]));

        // Simulate onEnter action
        if (poi.onEnter) {
          const actionLabel = ACTION_LABELS[poi.onEnter.type] || poi.onEnter.type;
          const detail = poi.onEnter.type === 'show_message'
            ? ` "${poi.onEnter.message}"`
            : poi.onEnter.type === 'link'
            ? ` → ${poi.onEnter.url}`
            : '';
          addLog(`触发 ${actionLabel}${detail}`);
        }

        poiIdx++;

        // Wait 2 seconds before next POI
        if (poiIdx >= route.pois.length) {
          setTimeout(() => {
            addLog('导览完成，所有 POI 已访问');
            setSimulating(false);
          }, 1000);
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 2500);
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

  const pois = route?.pois || [];

  return (
    <div className="space-y-5 animate-fade-up">
      {/* 导览概览 */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">导览概览</h3>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
            <MapPin size={20} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium text-slate-200">{route?.name || '未命名路线'}</p>
            {route?.description && (
              <p className="text-xs text-slate-500 mt-0.5">{route.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-slate-500">{pois.length} 个兴趣点</span>
              <span className="text-xs text-slate-500">
                定位方式: {route?.positionProvider === 'gps' ? 'GPS' : route?.positionProvider || 'GPS'}
              </span>
              {route?.startPOIId && (
                <span className="text-xs text-slate-500">起点 POI: {route.startPOIId}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* POI 列表 */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">路线详情</h3>
        <div className="space-y-2">
          {pois.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-4">暂无兴趣点</p>
          ) : (
            pois.map((poi, idx) => {
              const isActive = activePOIIndex === idx;
              const isVisited = visited.has(poi.id);

              return (
                <div
                  key={poi.id}
                  className={`p-3 rounded-lg border transition-all ${
                    isActive
                      ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20'
                      : isVisited
                      ? 'bg-white/[0.03] border-white/[0.06] opacity-60'
                      : 'bg-white/[0.03] border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      isVisited ? 'bg-emerald-500/20' : isActive ? 'bg-emerald-500/30' : 'bg-white/5'
                    }`}>
                      {isVisited ? (
                        <CheckCircle size={14} className="text-emerald-400" />
                      ) : (
                        <span className={`text-[10px] font-mono ${isActive ? 'text-emerald-300' : 'text-slate-500'}`}>
                          {isActive ? '►' : idx + 1}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-slate-300">{poi.name}</p>
                        <span className="text-[10px] text-slate-600">
                          #{poi.order}
                        </span>
                      </div>
                      {poi.description && (
                        <p className="text-[10px] text-slate-500 mt-0.5">{poi.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-slate-600">
                          触发半径: {poi.triggerRadius || 30}m
                        </span>
                        {poi.estimatedDuration && (
                          <span className="text-[10px] text-slate-600">
                            预计停留: {poi.estimatedDuration}s
                          </span>
                        )}
                      </div>
                      {poi.onEnter && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Play size={10} className="text-emerald-400" />
                          <span className="text-[10px] text-emerald-400/70">
                            进入时: {ACTION_LABELS[poi.onEnter.type] || poi.onEnter.type}
                            {poi.onEnter.type === 'show_message' && ` "${poi.onEnter.message}"`}
                          </span>
                        </div>
                      )}
                      {poi.onExit && (
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="text-[10px] text-amber-400/70">
                            离开时: {ACTION_LABELS[poi.onExit.type] || poi.onExit.type}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 模拟运行 */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">模拟导览</h3>
          {!simulating ? (
            <button
              onClick={startSimulation}
              disabled={pois.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
        <p className="text-xs text-slate-600 mb-2">模拟按照 POI 顺序依次到达每个兴趣点，每 2.5 秒前进一个</p>

        {/* 进度 */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${pois.length > 0 ? (visited.size / pois.length) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-slate-500 font-mono">{visited.size}/{pois.length}</span>
        </div>

        {/* 事件日志 */}
        <div className="h-32 overflow-y-auto space-y-0.5 bg-black/20 rounded-lg p-2">
          {log.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-6">点击"开始模拟"查看导览运行效果</p>
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
        <div className="space-y-2 text-xs text-slate-500">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-yellow-500 shrink-0 mt-0.5" />
            <span>需要 GPS 定位权限（室外环境）</span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-yellow-500 shrink-0 mt-0.5" />
            <span>导览在后台运行，靠近 POI 时自动触发内容</span>
          </div>
          {route?.positionProvider === 'gps' && (
            <div className="flex items-start gap-2">
              <Navigation size={14} className="text-cyan-400 shrink-0 mt-0.5" />
              <span>定位精度受设备 GPS 芯片影响，建议室外使用</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
