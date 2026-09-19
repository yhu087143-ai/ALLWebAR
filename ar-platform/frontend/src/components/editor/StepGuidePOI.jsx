import React, { useState } from 'react';
import {
  MapPin, Plus, Trash2, Edit3, Sparkles, Send, ChevronDown, ChevronRight,
  AlertCircle, X, ArrowUp, ArrowDown,
} from 'lucide-react';

/** POI 定位方式选项 */
const POSITION_TYPES = [
  { id: 'gps', label: 'GPS', desc: '全球定位' },
  { id: 'manual', label: '手动放置', desc: '场景中指定位置' },
  { id: 'ble', label: 'BLE(预留)', desc: '蓝牙信标定位', reserved: true },
  { id: 'vps', label: 'VPS(预留)', desc: '视觉定位服务', reserved: true },
];

/** 进入时动作选项 */
const ON_ENTER_ACTIONS = [
  { id: 'show_message', label: '显示消息' },
  { id: 'show_model', label: '展示模型' },
  { id: 'play_audio', label: '播放音频' },
  { id: 'link', label: '跳转链接' },
];

/** 离开时动作选项（与进入时相同） */
const ON_EXIT_ACTIONS = [
  { id: 'show_message', label: '显示消息' },
  { id: 'show_model', label: '展示模型' },
  { id: 'play_audio', label: '播放音频' },
  { id: 'link', label: '跳转链接' },
];

/** AI 建议提示 */
const GUIDE_SUGGESTIONS = [
  { label: '校园导览', desc: '正门→图书馆→教学楼→食堂', prompt: '校园导览：正门→图书馆→教学楼→食堂' },
  { label: '景区导览', desc: '入口→观景台→古建筑→出口', prompt: '景区导览：入口→观景台→古建筑→出口' },
  { label: '博物馆导览', desc: '大厅→展厅1→展厅2→纪念品', prompt: '博物馆导览：大厅→展厅1→展厅2→纪念品' },
  { label: '商场导览', desc: '入口→中庭→美食广场', prompt: '商场导览：入口→中庭→美食广场' },
];

/** 快捷预设模板 */
const GUIDE_TEMPLATES = [
  {
    name: '校园导览',
    pois: [
      { name: '正门', description: '学校正门，历史悠久的大门建筑', lat: 31.2304, lng: 121.4737 },
      { name: '图书馆', description: '现代化图书馆，藏书丰富', lat: 31.2310, lng: 121.4745 },
      { name: '教学楼', description: '主教学楼，大部分课程在此进行', lat: 31.2315, lng: 121.4740 },
      { name: '食堂', description: '学生食堂，提供多样化的餐饮选择', lat: 31.2308, lng: 121.4730 },
    ],
  },
  {
    name: '景区导览',
    pois: [
      { name: '入口', description: '景区正门入口', lat: 31.2400, lng: 121.4800 },
      { name: '观景台', description: '俯瞰全景的观景平台', lat: 31.2410, lng: 121.4810 },
      { name: '古建筑', description: '具有历史价值的古建筑群', lat: 31.2405, lng: 121.4795 },
      { name: '出口', description: '景区出口', lat: 31.2395, lng: 121.4790 },
    ],
  },
  {
    name: '商场导览',
    pois: [
      { name: '入口', description: '商场主入口', lat: 31.2200, lng: 121.4600 },
      { name: '中庭', description: '商场中央活动区域', lat: 31.2205, lng: 121.4605 },
      { name: '美食广场', description: '汇聚各地美食', lat: 31.2210, lng: 121.4603 },
    ],
  },
];

/**
 * StepGuidePOI — 导览 POI 编辑器
 *
 * Props:
 *   route: GuideRoute       — 当前导览路线对象
 *   onChange: (route) => void  — 路线变更回调
 */
export default function StepGuidePOI({ route, onChange }) {
  const guide = route || {
    id: `route_${Date.now()}`,
    name: '',
    description: '',
    pois: [],
    positionProvider: 'gps',
  };

  // ── 内部状态 ──
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState('');
  const [selectedPOIId, setSelectedPOIId] = useState(null);

  const selectedPOI = guide.pois.find((p) => p.id === selectedPOIId) || null;

  // ── 路由更新辅助 ──
  const updateRoute = (patch) => onChange({ ...guide, ...patch });

  // ── AI 导览设计 ──
  const handleAiDesign = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError('');
    setAiResult(null);
    try {
      const res = await fetch('/api/ai/guide-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || 'AI 设计请求失败');
      }
      const result = await res.json();
      setAiResult(result);
    } catch (err) {
      setAiError(err.message || 'AI 设计出错，请稍后重试');
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiResult = () => {
    if (!aiResult?.guideRoute) return;
    const aiRoute = aiResult.guideRoute;
    updateRoute({
      name: aiResult.title || aiRoute.name || '',
      description: aiRoute.description || '',
      pois: (aiRoute.pois || []).map((poi, index) => ({
        id: poi.id || `poi_${Date.now()}_${index}`,
        name: poi.name || '',
        description: poi.description || '',
        position: poi.position || { type: 'gps', latitude: 31.23, longitude: 121.47 },
        triggerRadius: poi.triggerRadius ?? 30,
        autoTrigger: poi.autoTrigger ?? true,
        onEnter: poi.onEnter || null,
        order: index,
        estimatedDuration: poi.estimatedDuration || 30,
      })),
      positionProvider: aiRoute.positionProvider || 'gps',
    });
    setAiResult(null);
    setAiPrompt('');
  };

  // ── POI CRUD ──
  const addPOI = () => {
    const newPOI = {
      id: `poi_${Date.now()}`,
      name: `兴趣点 ${guide.pois.length + 1}`,
      description: '',
      position: { type: 'gps', latitude: 31.23, longitude: 121.47 },
      triggerRadius: 30,
      autoTrigger: true,
      onEnter: null,
      order: guide.pois.length,
      estimatedDuration: 30,
    };
    updateRoute({ pois: [...guide.pois, newPOI] });
    setSelectedPOIId(newPOI.id);
  };

  const deletePOI = (poiId) => {
    const updated = guide.pois
      .filter((p) => p.id !== poiId)
      .map((p, i) => ({ ...p, order: i }));
    updateRoute({ pois: updated });
    if (selectedPOIId === poiId) setSelectedPOIId(null);
  };

  const movePOI = (poiId, direction) => {
    const idx = guide.pois.findIndex((p) => p.id === poiId);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= guide.pois.length) return;
    const pois = [...guide.pois];
    [pois[idx], pois[newIdx]] = [pois[newIdx], pois[idx]];
    updateRoute({ pois: pois.map((p, i) => ({ ...p, order: i })) });
  };

  const updatePOI = (poiId, patch) => {
    const pois = guide.pois.map((p) => (p.id === poiId ? { ...p, ...patch } : p));
    updateRoute({ pois });
  };

  // ── 模板应用 ──
  const applyTemplate = (template) => {
    const pois = template.pois.map((p, i) => ({
      id: `poi_${Date.now()}_${i}`,
      name: p.name,
      description: p.description,
      position: { type: 'gps', latitude: p.lat, longitude: p.lng },
      triggerRadius: 30,
      autoTrigger: true,
      onEnter: { type: 'show_message', message: `欢迎来到${p.name}` },
      order: i,
      estimatedDuration: 30,
    }));
    updateRoute({
      name: template.name,
      description: `${template.name} AR 导览`,
      pois,
      positionProvider: 'gps',
    });
  };

  return (
    <div className="space-y-5">
      {/* ===== 1. AI 导览设计（可折叠） ===== */}
      <div className="glass-card rounded-xl">
        <div className="p-5">
          <button
            type="button"
            onClick={() => setAiOpen(!aiOpen)}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 flex items-center justify-center">
                <Sparkles size={16} className="text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-slate-300">AI 导览设计</span>
            </div>
            {aiOpen ? (
              <ChevronDown size={16} className="text-slate-500" />
            ) : (
              <ChevronRight size={16} className="text-slate-500" />
            )}
          </button>

          {aiOpen && (
            <div className="mt-4 space-y-3 animate-fade-up">
              <p className="text-xs text-slate-500">
                用一句话描述你想要的导览路线，AI 会自动规划 POI 和内容
              </p>

              {/* 输入框 + 生成按钮 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="例如：校园导览：从正门到图书馆..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                  onKeyDown={(e) => e.key === 'Enter' && handleAiDesign()}
                />
                <button
                  type="button"
                  onClick={handleAiDesign}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                >
                  {aiLoading ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Send size={12} />
                      生成
                    </>
                  )}
                </button>
              </div>

              {/* 快速建议 */}
              <div>
                <p className="text-xs text-slate-500 mb-2">快速选择：</p>
                <div className="flex flex-wrap gap-2">
                  {GUIDE_SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAiPrompt(s.prompt)}
                      className="px-3 py-2 rounded-lg text-xs bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all text-left"
                    >
                      <p className="text-slate-300 font-medium">{s.label}</p>
                      <p className="text-slate-500 text-[10px]">{s.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 加载状态 */}
              {aiLoading && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <div className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                  <span className="text-xs text-slate-500">AI 正在为您设计导览路线...</span>
                </div>
              )}

              {/* 错误提示 */}
              {aiError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                  <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-400">{aiError}</p>
                </div>
              )}

              {/* AI 结果预览 */}
              {aiResult && !aiLoading && (
                <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                  <p className="text-xs text-emerald-300 font-medium mb-2">AI 生成结果</p>
                  <div className="text-xs text-slate-400 space-y-1">
                    <p>标题：{aiResult.title || '未命名'}</p>
                    <p>POI 数量：{aiResult.guideRoute?.pois?.length || 0} 个</p>
                    {aiResult.reasoning && (
                      <p className="text-[10px] text-slate-500 mt-1">说明：{aiResult.reasoning}</p>
                    )}

                    {/* POI 预览列表 */}
                    {aiResult.guideRoute?.pois?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {aiResult.guideRoute.pois.map((poi, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <MapPin size={10} className="text-emerald-400 shrink-0" />
                            <span>
                              {i + 1}. {poi.name || '未命名'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={applyAiResult}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                    >
                      应用此方案
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAiResult(null);
                        setAiError('');
                      }}
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

      {/* ===== 2. POI 列表 ===== */}
      <div className="glass-card rounded-xl">
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-slate-300">
              路线兴趣点 (POI)
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

          {guide.pois.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-dashed border-white/10 flex items-center justify-center mx-auto mb-3">
                <MapPin size={18} className="text-slate-500" />
              </div>
              <p className="text-xs text-slate-500">暂无兴趣点</p>
              <p className="text-[10px] text-slate-600 mt-1">
                添加 POI 或使用 AI 生成导览路线
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {guide.pois.map((poi, index) => {
                const isSelected = selectedPOIId === poi.id;
                const isGPS = poi.position?.type === 'gps';
                return (
                  <div
                    key={poi.id}
                    className={`flex items-center gap-2 p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20'
                        : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
                    }`}
                    onClick={() => setSelectedPOIId(poi.id)}
                  >
                    {/* 序号 */}
                    <span className="w-5 h-5 rounded-full bg-white/10 text-[10px] text-slate-400 flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>

                    {/* POI 信息 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-300 truncate">
                        {poi.name || '未命名'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-500">
                          {poi.triggerRadius || 30}m
                        </span>
                        <span
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                            isGPS
                              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {isGPS ? 'GPS' : '手动'}
                        </span>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePOI(poi.id, -1);
                        }}
                        disabled={index === 0}
                        className="p-1 rounded text-slate-600 hover:text-slate-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePOI(poi.id, 1);
                        }}
                        disabled={index === guide.pois.length - 1}
                        className="p-1 rounded text-slate-600 hover:text-slate-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPOIId(poi.id);
                        }}
                        className="p-1 rounded text-slate-600 hover:text-violet-400 hover:bg-white/5 transition-all"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePOI(poi.id);
                        }}
                        className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-white/5 transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-slate-600 mt-2 text-right">
            共 {guide.pois.length} 个兴趣点
          </p>
        </div>
      </div>

      {/* ===== 3. 选中 POI 编辑器 ===== */}
      {selectedPOI && (
        <div className="glass-card rounded-xl border border-emerald-500/10">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-emerald-300">编辑兴趣点</h3>
              <button
                type="button"
                onClick={() => setSelectedPOIId(null)}
                className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4">
              {/* 名称 */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">名称</label>
                <input
                  type="text"
                  value={selectedPOI.name}
                  onChange={(e) => updatePOI(selectedPOI.id, { name: e.target.value })}
                  placeholder="兴趣点名称"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                />
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">描述</label>
                <textarea
                  value={selectedPOI.description}
                  onChange={(e) =>
                    updatePOI(selectedPOI.id, { description: e.target.value })
                  }
                  placeholder="到达此位置时显示的文字描述"
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 resize-none"
                />
              </div>

              {/* 定位方式选择 */}
              <div>
                <label className="block text-xs text-slate-500 mb-2">定位方式</label>
                <div className="flex flex-wrap gap-2">
                  {POSITION_TYPES.map((pt) => {
                    const selected = selectedPOI.position?.type === pt.id;
                    return (
                      <button
                        key={pt.id}
                        type="button"
                        disabled={pt.reserved}
                        onClick={() =>
                          updatePOI(selectedPOI.id, {
                            position:
                              pt.id === 'gps'
                                ? {
                                    type: 'gps',
                                    latitude: 31.23,
                                    longitude: 121.47,
                                  }
                                : { type: 'manual', scenePosition: [0, 0, 0] },
                          })
                        }
                        className={`relative px-3 py-2 rounded-lg text-xs transition-all ${
                          selected
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : pt.reserved
                              ? 'bg-white/[0.02] text-slate-600 border border-white/5 cursor-not-allowed'
                              : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                        }`}
                      >
                        {pt.label}
                        {pt.reserved && (
                          <span className="ml-1 px-1 py-0.5 rounded text-[8px] bg-slate-500/20 text-slate-500">
                            预留
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* GPS 模式：纬度/经度 */}
              {selectedPOI.position?.type === 'gps' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">纬度</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={selectedPOI.position?.latitude ?? 31.23}
                      onChange={(e) =>
                        updatePOI(selectedPOI.id, {
                          position: {
                            ...selectedPOI.position,
                            latitude: parseFloat(e.target.value) || 0,
                          },
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
                      value={selectedPOI.position?.longitude ?? 121.47}
                      onChange={(e) =>
                        updatePOI(selectedPOI.id, {
                          position: {
                            ...selectedPOI.position,
                            longitude: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
                    />
                  </div>
                </div>
              )}

              {/* 手动模式：场景位置 x,y,z */}
              {selectedPOI.position?.type === 'manual' && (
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
                        value={selectedPOI.position?.scenePosition?.[idx] ?? 0}
                        onChange={(e) => {
                          const pos = [
                            ...(selectedPOI.position?.scenePosition || [0, 0, 0]),
                          ];
                          pos[idx] = parseFloat(e.target.value) || 0;
                          updatePOI(selectedPOI.id, {
                            position: {
                              ...selectedPOI.position,
                              scenePosition: pos,
                            },
                          });
                        }}
                        placeholder={axis}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 触发半径滑块 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-500">触发半径</label>
                  <span className="text-xs text-slate-400">
                    {selectedPOI.triggerRadius ??
                      (selectedPOI.position?.type === 'gps' ? 30 : 5)}
                    m
                  </span>
                </div>
                <input
                  type="range"
                  min={selectedPOI.position?.type === 'gps' ? 5 : 1}
                  max={selectedPOI.position?.type === 'gps' ? 100 : 30}
                  step="1"
                  value={
                    selectedPOI.triggerRadius ??
                    (selectedPOI.position?.type === 'gps' ? 30 : 5)
                  }
                  onChange={(e) =>
                    updatePOI(selectedPOI.id, {
                      triggerRadius: parseInt(e.target.value),
                    })
                  }
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400
                    [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-emerald-500/30"
                />
              </div>

              {/* 自动触发开关 */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs text-slate-500">自动触发</label>
                  <p className="text-[10px] text-slate-600">
                    用户靠近时自动触发内容
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updatePOI(selectedPOI.id, {
                      autoTrigger: !selectedPOI.autoTrigger,
                    })
                  }
                  className={`relative w-11 rounded-full transition-colors ${
                    selectedPOI.autoTrigger ? 'bg-emerald-500' : 'bg-white/20'
                  }`}
                  style={{ height: '22px' }}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${
                      selectedPOI.autoTrigger
                        ? 'translate-x-[22px]'
                        : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* 进入时动作选择 */}
              <div>
                <label className="block text-xs text-slate-500 mb-2">
                  进入时动作
                </label>
                <div className="flex flex-wrap gap-2">
                  {ON_ENTER_ACTIONS.map((action) => {
                    const selected = selectedPOI.onEnter?.type === action.id;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            updatePOI(selectedPOI.id, { onEnter: null });
                          } else {
                            const defaults = {
                              show_message: {
                                type: 'show_message',
                                message: '',
                              },
                              show_model: { type: 'show_model' },
                              play_audio: { type: 'play_audio' },
                              link: { type: 'link', url: '' },
                            };
                            updatePOI(selectedPOI.id, {
                              onEnter: defaults[action.id],
                            });
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                          selected
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                        }`}
                      >
                        {action.label}
                      </button>
                    );
                  })}
                </div>

                {/* 显示消息 → 消息内容输入 */}
                {selectedPOI.onEnter?.type === 'show_message' && (
                  <div className="mt-2">
                    <label className="block text-xs text-slate-500 mb-1">
                      消息内容
                    </label>
                    <input
                      type="text"
                      value={selectedPOI.onEnter?.message || ''}
                      onChange={(e) =>
                        updatePOI(selectedPOI.id, {
                          onEnter: {
                            ...selectedPOI.onEnter,
                            message: e.target.value,
                          },
                        })
                      }
                      placeholder="到达 POI 时显示的文字"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                    />
                  </div>
                )}

                {/* 跳转链接 → URL 输入 */}
                {selectedPOI.onEnter?.type === 'link' && (
                  <div className="mt-2">
                    <label className="block text-xs text-slate-500 mb-1">
                      跳转链接
                    </label>
                    <input
                      type="url"
                      value={selectedPOI.onEnter?.url || ''}
                      onChange={(e) =>
                        updatePOI(selectedPOI.id, {
                          onEnter: {
                            ...selectedPOI.onEnter,
                            url: e.target.value,
                          },
                        })
                      }
                      placeholder="https://example.com"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                    />
                  </div>
                )}
              </div>

              {/* 离开时动作选择（与进入时相同） */}
              <div>
                <label className="block text-xs text-slate-500 mb-2">
                  离开时动作
                </label>
                <div className="flex flex-wrap gap-2">
                  {ON_EXIT_ACTIONS.map((action) => {
                    const selected = selectedPOI.onExit?.type === action.id;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            updatePOI(selectedPOI.id, { onExit: null });
                          } else {
                            const defaults = {
                              show_message: { type: 'show_message', message: '' },
                              show_model: { type: 'show_model' },
                              play_audio: { type: 'play_audio' },
                              link: { type: 'link', url: '' },
                            };
                            updatePOI(selectedPOI.id, {
                              onExit: defaults[action.id],
                            });
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                          selected
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                        }`}
                      >
                        {action.label}
                      </button>
                    );
                  })}
                </div>

                {/* 显示消息 → 消息内容输入 */}
                {selectedPOI.onExit?.type === 'show_message' && (
                  <div className="mt-2">
                    <label className="block text-xs text-slate-500 mb-1">消息内容</label>
                    <input
                      type="text"
                      value={selectedPOI.onExit?.message || ''}
                      onChange={(e) =>
                        updatePOI(selectedPOI.id, {
                          onExit: { ...selectedPOI.onExit, message: e.target.value },
                        })
                      }
                      placeholder="离开 POI 时显示的文字"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                    />
                  </div>
                )}

                {/* 跳转链接 → URL 输入 */}
                {selectedPOI.onExit?.type === 'link' && (
                  <div className="mt-2">
                    <label className="block text-xs text-slate-500 mb-1">跳转链接</label>
                    <input
                      type="url"
                      value={selectedPOI.onExit?.url || ''}
                      onChange={(e) =>
                        updatePOI(selectedPOI.id, {
                          onExit: { ...selectedPOI.onExit, url: e.target.value },
                        })
                      }
                      placeholder="https://example.com"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
                    />
                  </div>
                )}
              </div>

              {/* 预计停留时间 */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  预计停留（秒）
                </label>
                <input
                  type="number"
                  min="1"
                  max="600"
                  value={selectedPOI.estimatedDuration || 30}
                  onChange={(e) =>
                    updatePOI(selectedPOI.id, {
                      estimatedDuration: parseInt(e.target.value) || 30,
                    })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
                />
              </div>

              {/* 标记缩放滑块 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-500">标记缩放</label>
                  <span className="text-xs text-slate-400">
                    {selectedPOI.markerScale ?? 1}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={selectedPOI.markerScale ?? 1}
                  onChange={(e) =>
                    updatePOI(selectedPOI.id, {
                      markerScale: parseFloat(e.target.value),
                    })
                  }
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400
                    [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-emerald-500/30"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 4. 路线配置 ===== */}
      <div className="glass-card rounded-xl">
        <div className="p-5">
          <h3 className="text-sm font-medium text-slate-300 mb-4">路线配置</h3>
          <div className="space-y-4">
            {/* 路线名称 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                路线名称
              </label>
              <input
                type="text"
                value={guide.name || ''}
                onChange={(e) => updateRoute({ name: e.target.value })}
                placeholder="例如：校园导览路线"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
              />
            </div>

            {/* 路线描述 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                路线描述
              </label>
              <textarea
                value={guide.description || ''}
                onChange={(e) => updateRoute({ description: e.target.value })}
                placeholder="描述这条导览路线的特色"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 resize-none"
              />
            </div>

            {/* 定位服务 */}
            <div>
              <label className="block text-xs text-slate-500 mb-2">
                定位服务
              </label>
              <div className="flex flex-wrap gap-2">
                {POSITION_TYPES.map((pt) => {
                  const selected = guide.positionProvider === pt.id;
                  return (
                    <button
                      key={pt.id}
                      type="button"
                      disabled={pt.reserved}
                      onClick={() => updateRoute({ positionProvider: pt.id })}
                      className={`px-3 py-2 rounded-lg text-xs transition-all ${
                        selected
                          ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30'
                          : pt.reserved
                            ? 'bg-white/[0.02] text-slate-600 border border-white/5 cursor-not-allowed'
                            : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                      }`}
                    >
                      {pt.label}
                      {pt.reserved && (
                        <span className="ml-1 px-1 py-0.5 rounded text-[8px] bg-slate-500/20 text-slate-500">
                          预留
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 标记模型描述 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                标记模型描述
              </label>
              <input
                type="text"
                value={guide.style?.markerModelPrompt || ''}
                onChange={(e) =>
                  updateRoute({
                    style: {
                      ...guide.style,
                      markerModelPrompt: e.target.value,
                    },
                  })
                }
                placeholder="例如：发光的蓝色箭头指示标记"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
              />
              <p className="text-[10px] text-slate-600 mt-1">
                描述导览标记点的外观，AI 将根据描述生成对应的 3D 标记模型
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 5. 导览模板快捷预设 ===== */}
      <div className="glass-card rounded-xl">
        <div className="p-5">
          <h3 className="text-sm font-medium text-slate-300 mb-3">快捷预设</h3>
          <p className="text-xs text-slate-500 mb-3">
            选择预设模板快速创建导览路线
          </p>
          <div className="flex flex-wrap gap-2">
            {GUIDE_TEMPLATES.map((template, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyTemplate(template)}
                className="px-4 py-3 rounded-xl text-xs bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-emerald-500/20 transition-all text-left"
              >
                <p className="text-slate-300 font-medium">{template.name}</p>
                <p className="text-slate-500 text-[10px] mt-0.5">
                  {template.pois.length} 个兴趣点
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
