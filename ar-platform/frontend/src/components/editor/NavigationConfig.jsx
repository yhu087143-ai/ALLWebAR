import React, { useState } from 'react';
import FileOrUrlInput from './FileOrUrlInput.jsx';
import {
  MapPin, Navigation, Plus, Trash2, GripVertical,
  ChevronDown, ChevronRight, X, Check, Globe, Crosshair,
  Move, ToggleLeft, ToggleRight, ArrowUp, ArrowDown,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POSITION_PROVIDERS = [
  { id: 'gps', label: 'GPS', desc: '全球卫星定位，适用于户外场景', recommend: true },
  { id: 'ble', label: 'BLE', desc: '蓝牙信标室内定位，需部署信标设备' },
  { id: 'vps', label: 'VPS', desc: '视觉定位服务，基于图像识别' },
  { id: 'manual', label: 'Manual', desc: '手动指定位置，适用于预览/调试' },
];

const ACTION_TYPES = [
  { id: 'show_message', label: '显示消息' },
  { id: 'show_model', label: '展示模型' },
  { id: 'play_audio', label: '播放音频' },
  { id: 'link', label: '跳转链接' },
  { id: 'trigger_event', label: '触发事件' },
];

const COMPLETION_ACTIONS = [
  { id: 'show_message', label: '显示完成消息' },
  { id: 'link', label: '跳转链接' },
  { id: 'show_score', label: '显示得分' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeDefaultPOI = (order) => ({
  id: `poi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  name: `兴趣点 ${order + 1}`,
  description: '',
  position: { type: 'gps', latitude: 31.23, longitude: 121.47 },
  triggerRadius: 30,
  modelUrl: '',
  imageUrl: '',
  audioUrl: '',
  autoTrigger: true,
  onEnter: null,
  onExit: null,
  order,
  estimatedDuration: 60,
  onEnterRules: [],
  onExitRules: [],
});

const defaultNavigation = {
  pois: [],
  positionProvider: 'gps',
  autoAdvance: false,
  allowSkip: true,
  completion: { action: 'show_message', message: '恭喜你完成了本次导览！' },
};

/** Build a short human-readable description of a POIAction. */
const actionSummary = (action) => {
  if (!action) return '未配置';
  switch (action.type) {
    case 'show_message':
      return `消息: ${(action.message || '').slice(0, 20)}${action.message?.length > 20 ? '...' : ''}`;
    case 'show_model':
      return '展示模型';
    case 'play_audio':
      return '播放音频';
    case 'link':
      return `链接: ${(action.url || '').slice(0, 20)}${action.url?.length > 20 ? '...' : ''}`;
    case 'trigger_event':
      return `事件: ${(action.message || '').slice(0, 20)}`;
    default:
      return action.type || '未知';
  }
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Toggle({ value, onChange, label, hint }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        {label && <label className="text-xs text-slate-400">{label}</label>}
        {hint && <p className="text-[10px] text-slate-600">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-11 rounded-full transition-colors ${value ? 'bg-emerald-500' : 'bg-white/20'}`}
        style={{ height: '22px' }}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${
            value ? 'translate-x-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function ActionEditor({ action, onChange, onClear, accentColor = 'emerald' }) {
  const colorMap = {
    emerald: {
      selected: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      default: 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06]',
      input: 'border-emerald-500/20 focus:ring-emerald-500/30',
    },
    orange: {
      selected: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      default: 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06]',
      input: 'border-amber-500/20 focus:ring-amber-500/30',
    },
  };
  const c = colorMap[accentColor] || colorMap.emerald;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ACTION_TYPES.map((at) => {
          const selected = action?.type === at.id;
          return (
            <button
              key={at.id}
              type="button"
              onClick={() => {
                if (selected) {
                  onChange(null);
                } else {
                  const defaults = {
                    show_message: { type: 'show_message', message: '' },
                    show_model: { type: 'show_model' },
                    play_audio: { type: 'play_audio' },
                    link: { type: 'link', url: '' },
                    trigger_event: { type: 'trigger_event', message: '' },
                  };
                  onChange(defaults[at.id]);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                selected ? c.selected : c.default
              }`}
            >
              {at.label}
            </button>
          );
        })}
        {action && (
          <button
            type="button"
            onClick={onClear}
            className="px-2 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 transition-all"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {action?.type === 'show_message' && (
        <div className="mt-2">
          <label className="block text-xs text-slate-500 mb-1">消息内容</label>
          <input
            type="text"
            value={action.message || ''}
            onChange={(e) => onChange({ ...action, message: e.target.value })}
            placeholder="触发时显示的文字"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
          />
        </div>
      )}

      {action?.type === 'link' && (
        <div className="mt-2">
          <label className="block text-xs text-slate-500 mb-1">URL</label>
          <input
            type="url"
            value={action.url || ''}
            onChange={(e) => onChange({ ...action, url: e.target.value })}
            placeholder="https://example.com"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
          />
        </div>
      )}

      {action?.type === 'trigger_event' && (
        <div className="mt-2">
          <label className="block text-xs text-slate-500 mb-1">事件名称</label>
          <input
            type="text"
            value={action.message || ''}
            onChange={(e) => onChange({ ...action, message: e.target.value })}
            placeholder="例如: boss_spawn, show_cutscene"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * NavigationConfig — AR 导览/导航配置编辑器
 *
 * Props:
 *   navigation — object (shape defined in propTypes below)
 *   onChange   — (newNavigation) => void
 */
export default function NavigationConfig({ navigation, onChange }) {
  const nav = navigation && navigation.pois ? navigation : defaultNavigation;
  const [expandedPOIId, setExpandedPOIId] = useState(null);

  const update = (patch) => onChange({ ...nav, ...patch });

  // ---- POI CRUD ----
  const addPOI = () => {
    const poi = makeDefaultPOI(nav.pois.length);
    update({ pois: [...nav.pois, poi] });
    setExpandedPOIId(poi.id);
  };

  const deletePOI = (id) => {
    const pois = nav.pois
      .filter((p) => p.id !== id)
      .map((p, i) => ({ ...p, order: i }));
    update({ pois });
    if (expandedPOIId === id) setExpandedPOIId(null);
  };

  const movePOI = (id, dir) => {
    const idx = nav.pois.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const nxt = idx + dir;
    if (nxt < 0 || nxt >= nav.pois.length) return;
    const pois = [...nav.pois];
    [pois[idx], pois[nxt]] = [pois[nxt], pois[idx]];
    update({ pois: pois.map((p, i) => ({ ...p, order: i })) });
  };

  const updatePOI = (id, patch) => {
    update({ pois: nav.pois.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  };

  // ---- Stats for summary bar ----
  const gpsCount = nav.pois.filter((p) => p.position?.type === 'gps').length;
  const manualCount = nav.pois.filter((p) => p.position?.type === 'manual').length;
  const providerLabel = POSITION_PROVIDERS.find((p) => p.id === nav.positionProvider)?.label || nav.positionProvider;

  // ---- Map preview ----
  const mapDots = nav.pois.map((poi, i) => {
    let left = 50, top = 50;
    if (poi.position?.type === 'gps') {
      const baseLat = 31.23;
      const baseLng = 121.47;
      const dLat = (poi.position.latitude ?? baseLat) - baseLat;
      const dLng = (poi.position.longitude ?? baseLng) - baseLng;
      // Roughly 0.01 deg ~ 1 km; scale to fit within a 200x120 area
      left = 50 + dLng * 500;
      top = 50 - dLat * 500;
    } else if (poi.position?.scenePosition) {
      const [x, , z] = poi.position.scenePosition;
      left = 50 + x * 10;
      top = 50 - z * 10;
    }
    return { ...poi, index: i, left: Math.max(2, Math.min(98, left)), top: Math.max(2, Math.min(98, top)) };
  });

  return (
    <div className="space-y-5">
      {/* ================================================================= */}
      {/* 1. Position Provider                                            */}
      {/* ================================================================= */}
      <div className="glass-card rounded-xl">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Navigation size={14} className="text-violet-400" />
            </div>
            <h3 className="text-sm font-medium text-slate-300">定位服务</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {POSITION_PROVIDERS.map((p) => {
              const selected = nav.positionProvider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => update({ positionProvider: p.id })}
                  className={`relative p-3 rounded-xl text-xs transition-all text-left ${
                    selected
                      ? 'bg-violet-500/10 border border-violet-500/30 ring-1 ring-violet-500/20'
                      : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06]'
                  }`}
                >
                  {p.recommend && (
                    <span className="absolute top-1 right-1 px-1 py-0.5 rounded text-[8px] bg-emerald-500/20 text-emerald-400">
                      推荐
                    </span>
                  )}
                  <p className="text-slate-300 font-medium mb-0.5">{p.label}</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed">{p.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 2. POI List Summary Bar                                         */}
      {/* ================================================================= */}
      {nav.pois.length > 0 && (
        <div className="glass-card rounded-xl">
          <div className="px-5 py-3 flex items-center flex-wrap gap-2 text-xs text-slate-400">
            <MapPin size={14} className="text-violet-400" />
            <span className="font-medium text-slate-300">{nav.pois.length} 个 POI</span>
            <span className="text-slate-600">·</span>
            <span>{providerLabel} 定位</span>
            {gpsCount > 0 && manualCount > 0 && (
              <>
                <span className="text-slate-600">·</span>
                <span>{gpsCount} GPS / {manualCount} 手动</span>
              </>
            )}
            <span className="text-slate-600">·</span>
            <span>{nav.autoAdvance ? '自动推进' : '手动推进'}</span>
            {nav.allowSkip && (
              <>
                <span className="text-slate-600">·</span>
                <span>允许跳过</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 3. Simple Map Preview                                           */}
      {/* ================================================================= */}
      {mapDots.length > 0 && (
        <div className="glass-card rounded-xl">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Globe size={13} className="text-slate-500" />
              <span className="text-xs text-slate-500">POI 位置预览</span>
            </div>
            <div className="relative w-full h-28 rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-hidden">
              {/* Grid lines */}
              <div className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }}
              />
              {/* Center crosshair */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 opacity-20">
                <Crosshair size={24} className="text-slate-400" />
              </div>
              {/* POI markers */}
              {mapDots.map((dot) => (
                <div
                  key={dot.id}
                  className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-violet-500/30 border border-violet-400/50 text-[9px] font-bold text-violet-200"
                  style={{ left: `${dot.left}%`, top: `${dot.top}%` }}
                  title={`${dot.name} (${dot.position.type})`}
                >
                  {dot.index + 1}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-slate-600">POI 相对位置示意</p>
              <p className="text-[10px] text-slate-600">
                {gpsCount > 0 ? '(GPS)' : '(场景坐标)'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 4. POI List                                                     */}
      {/* ================================================================= */}
      <div className="glass-card rounded-xl">
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-slate-300">
              兴趣点列表
            </label>
            <button
              type="button"
              onClick={addPOI}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
            >
              <Plus size={12} />
              添加 POI
            </button>
          </div>

          {nav.pois.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-dashed border-white/10 flex items-center justify-center mx-auto mb-3">
                <MapPin size={18} className="text-slate-500" />
              </div>
              <p className="text-xs text-slate-500">暂无兴趣点</p>
              <p className="text-[10px] text-slate-600 mt-1">点击上方按钮添加</p>
            </div>
          ) : (
            <div className="space-y-2">
              {nav.pois.map((poi, index) => {
                const isExpanded = expandedPOIId === poi.id;
                const isGPS = poi.position?.type === 'gps';

                return (
                  <div key={poi.id}>
                    {/* ---- Collapsed card ---- */}
                    <div
                      className={`flex items-center gap-2 p-3 rounded-lg border transition-all cursor-pointer ${
                        isExpanded
                          ? 'bg-violet-500/10 border-violet-500/30 ring-1 ring-violet-500/20 rounded-b-none'
                          : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
                      }`}
                      onClick={() => setExpandedPOIId(isExpanded ? null : poi.id)}
                    >
                      {/* Drag handle (reorder buttons) */}
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); movePOI(poi.id, -1); }}
                          disabled={index === 0}
                          className="p-0.5 rounded text-slate-600 hover:text-slate-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                          <ArrowUp size={10} />
                        </button>
                        <GripVertical size={12} className="text-slate-600" />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); movePOI(poi.id, 1); }}
                          disabled={index === nav.pois.length - 1}
                          className="p-0.5 rounded text-slate-600 hover:text-slate-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                          <ArrowDown size={10} />
                        </button>
                      </div>

                      {/* Index badge */}
                      <span className="w-5 h-5 rounded-full bg-white/10 text-[10px] text-slate-400 flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>

                      {/* POI info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-300 truncate">
                            {poi.name || '未命名'}
                          </span>
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0 ${
                              isGPS
                                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            <MapPin size={8} />
                            {isGPS ? 'GPS' : '手动'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                          <span>{poi.triggerRadius || 30}m</span>
                          {poi.onEnter && (
                            <>
                              <span className="text-slate-600">|</span>
                              <span className="truncate max-w-[100px]">
                                进入: {actionSummary(poi.onEnter)}
                              </span>
                            </>
                          )}
                          {poi.onExit && (
                            <>
                              <span className="text-slate-600">|</span>
                              <span className="truncate max-w-[100px]">
                                离开: {actionSummary(poi.onExit)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expand / collapse indicator */}
                      <div className="text-slate-500 shrink-0">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                    </div>

                    {/* ---- Expanded editor ---- */}
                    {isExpanded && (
                      <div className="p-4 rounded-b-lg border border-t-0 border-violet-500/20 bg-white/[0.02] space-y-4">
                        {/* Name & Description */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">名称</label>
                            <input
                              type="text"
                              value={poi.name}
                              onChange={(e) => updatePOI(poi.id, { name: e.target.value })}
                              placeholder="兴趣点名称"
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">
                              预计停留 (秒)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={600}
                              value={poi.estimatedDuration ?? 60}
                              onChange={(e) =>
                                updatePOI(poi.id, { estimatedDuration: parseInt(e.target.value) || 60 })
                              }
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-slate-500 mb-1">描述</label>
                          <textarea
                            value={poi.description}
                            onChange={(e) => updatePOI(poi.id, { description: e.target.value })}
                            placeholder="到达此位置时显示的文字描述"
                            rows={2}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 resize-none"
                          />
                        </div>

                        {/* Position type */}
                        <div>
                          <label className="block text-xs text-slate-500 mb-2">定位方式</label>
                          <div className="flex gap-2">
                            {['gps', 'manual'].map((type) => {
                              const selected = poi.position?.type === type;
                              return (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() =>
                                    updatePOI(poi.id, {
                                      position:
                                        type === 'gps'
                                          ? { type: 'gps', latitude: 31.23, longitude: 121.47 }
                                          : { type: 'manual', scenePosition: [0, 0, 0] },
                                    })
                                  }
                                  className={`px-3 py-2 rounded-lg text-xs transition-all ${
                                    selected
                                      ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30'
                                      : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                                  }`}
                                >
                                  {type === 'gps' ? 'GPS 坐标' : '场景位置 (手动)'}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* GPS coords */}
                        {poi.position?.type === 'gps' && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">纬度</label>
                              <input
                                type="number"
                                step="0.0001"
                                value={poi.position.latitude ?? 31.23}
                                onChange={(e) =>
                                  updatePOI(poi.id, {
                                    position: { ...poi.position, latitude: parseFloat(e.target.value) || 0 },
                                  })
                                }
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">经度</label>
                              <input
                                type="number"
                                step="0.0001"
                                value={poi.position.longitude ?? 121.47}
                                onChange={(e) =>
                                  updatePOI(poi.id, {
                                    position: { ...poi.position, longitude: parseFloat(e.target.value) || 0 },
                                  })
                                }
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
                              />
                            </div>
                          </div>
                        )}

                        {/* Manual scene position */}
                        {poi.position?.type === 'manual' && (
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">
                              场景位置 (x, y, z)
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {['x', 'y', 'z'].map((axis, idx) => (
                                <input
                                  key={axis}
                                  type="number"
                                  step="0.1"
                                  value={poi.position.scenePosition?.[idx] ?? 0}
                                  onChange={(e) => {
                                    const pos = [...(poi.position.scenePosition || [0, 0, 0])];
                                    pos[idx] = parseFloat(e.target.value) || 0;
                                    updatePOI(poi.id, {
                                      position: { ...poi.position, scenePosition: pos },
                                    });
                                  }}
                                  placeholder={axis}
                                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Trigger radius */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-slate-500">触发半径 (米)</label>
                            <span className="text-xs text-slate-400">{poi.triggerRadius ?? 30}m</span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={500}
                            step={1}
                            value={poi.triggerRadius ?? 30}
                            onChange={(e) =>
                              updatePOI(poi.id, { triggerRadius: parseInt(e.target.value) })
                            }
                            className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
                              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400
                              [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-violet-500/30"
                          />
                        </div>

                        {/* Auto-trigger toggle */}
                        <Toggle
                          value={poi.autoTrigger}
                          onChange={(v) => updatePOI(poi.id, { autoTrigger: v })}
                          label="自动触发"
                          hint="用户靠近时自动触发内容"
                        />

                        {/* Media URLs */}
                        <div className="space-y-3">
                          <label className="block text-xs text-slate-500">媒体资源 (可选)</label>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">3D 模型</label>
                            <FileOrUrlInput
                              value={poi.modelUrl || ''}
                              onChange={(v) => updatePOI(poi.id, { modelUrl: v })}
                              placeholder="模型 URL (.glb)"
                              accept="model"
                              compact
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">图片</label>
                            <FileOrUrlInput
                              value={poi.imageUrl || ''}
                              onChange={(v) => updatePOI(poi.id, { imageUrl: v })}
                              placeholder="图片 URL"
                              accept="image"
                              compact
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">音频</label>
                            <FileOrUrlInput
                              value={poi.audioUrl || ''}
                              onChange={(v) => updatePOI(poi.id, { audioUrl: v })}
                              placeholder="音频 URL"
                              accept="audio"
                              compact
                            />
                          </div>
                        </div>

                        {/* onEnter action */}
                        <div>
                          <label className="block text-xs text-slate-400 font-medium mb-2">
                            进入时动作
                          </label>
                          <ActionEditor
                            action={poi.onEnter}
                            onChange={(act) => updatePOI(poi.id, { onEnter: act })}
                            onClear={() => updatePOI(poi.id, { onEnter: null })}
                            accentColor="emerald"
                          />
                        </div>

                        {/* onEnterRules */}
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">
                            进入时规则 (逗号分隔规则ID)
                          </label>
                          <input
                            type="text"
                            value={(poi.onEnterRules || []).join(', ')}
                            onChange={(e) =>
                              updatePOI(poi.id, {
                                onEnterRules: e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="rule_1, rule_2"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                          />
                        </div>

                        {/* onExit action */}
                        <div>
                          <label className="block text-xs text-slate-400 font-medium mb-2">
                            离开时动作
                          </label>
                          <ActionEditor
                            action={poi.onExit}
                            onChange={(act) => updatePOI(poi.id, { onExit: act })}
                            onClear={() => updatePOI(poi.id, { onExit: null })}
                            accentColor="orange"
                          />
                        </div>

                        {/* onExitRules */}
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">
                            离开时规则 (逗号分隔规则ID)
                          </label>
                          <input
                            type="text"
                            value={(poi.onExitRules || []).join(', ')}
                            onChange={(e) =>
                              updatePOI(poi.id, {
                                onExitRules: e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="rule_3, rule_4"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                          />
                        </div>

                        {/* Delete button */}
                        <div className="pt-2 border-t border-white/[0.06]">
                          <button
                            type="button"
                            onClick={() => deletePOI(poi.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all"
                          >
                            <Trash2 size={12} />
                            删除此 POI
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-slate-600 mt-2 text-right">
            共 {nav.pois.length} 个兴趣点
          </p>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 5. Navigation Settings                                           */}
      {/* ================================================================= */}
      <div className="glass-card rounded-xl">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Navigation size={14} className="text-violet-400" />
            </div>
            <h3 className="text-sm font-medium text-slate-300">导航设置</h3>
          </div>

          <div className="space-y-4">
            <Toggle
              value={nav.autoAdvance}
              onChange={(v) => update({ autoAdvance: v })}
              label="自动推进"
              hint="用户完成当前 POI 后自动导航至下一个"
            />

            <Toggle
              value={nav.allowSkip}
              onChange={(v) => update({ allowSkip: v })}
              label="允许跳过"
              hint="用户可手动跳过当前 POI"
            />

            {/* Completion action */}
            <div>
              <label className="block text-xs text-slate-500 mb-2">完成时动作</label>
              <div className="flex flex-wrap gap-2">
                {COMPLETION_ACTIONS.map((ca) => {
                  const selected = nav.completion?.action === ca.id;
                  return (
                    <button
                      key={ca.id}
                      type="button"
                      onClick={() =>
                        update({
                          completion: {
                            ...nav.completion,
                            action: ca.id,
                            message: ca.id === 'link' ? (nav.completion?.url || '') : (nav.completion?.message || ''),
                          },
                        })
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                        selected
                          ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30'
                          : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                      }`}
                    >
                      {ca.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Completion message / URL */}
            {nav.completion?.action === 'show_message' && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">完成消息</label>
                <input
                  type="text"
                  value={nav.completion?.message || ''}
                  onChange={(e) =>
                    update({ completion: { ...nav.completion, message: e.target.value } })
                  }
                  placeholder="恭喜你完成了本次导览！"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                />
              </div>
            )}

            {nav.completion?.action === 'link' && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">跳转链接</label>
                <input
                  type="url"
                  value={nav.completion?.url || ''}
                  onChange={(e) =>
                    update({ completion: { ...nav.completion, url: e.target.value } })
                  }
                  placeholder="https://example.com/result"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                />
              </div>
            )}

            {nav.completion?.action === 'show_score' && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">完成文本</label>
                <input
                  type="text"
                  value={nav.completion?.message || ''}
                  onChange={(e) =>
                    update({ completion: { ...nav.completion, message: e.target.value } })
                  }
                  placeholder="游戏结束！"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
