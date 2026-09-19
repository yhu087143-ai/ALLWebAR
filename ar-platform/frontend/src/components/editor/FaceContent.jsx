import React from 'react';
import { Image, Box, Palette, Eye, Crown, Check, Sparkles, Send, Wand2 } from 'lucide-react';
import SemanticIcon from '../icons/SemanticIcon.jsx';
import { FACE_ZONES, ZONE_PRESETS, applyPreset, createDefaultFaceZones } from '../../constants/faceZones.js';
import FileOrUrlInput from './FileOrUrlInput.jsx';
import FaceDiagram from './FaceDiagram.jsx';

const BUILTIN_GEOMETRIES = [
  { id: 'glasses', label: '眼镜框', icon: Eye, desc: '双眼镜框' },
  { id: 'mask', label: '口罩', icon: Box, desc: '嘴部口罩' },
  { id: 'crown', label: '皇冠', icon: Crown, desc: '头顶皇冠' },
  { id: 'mustache', label: '胡子', icon: Box, desc: '嘴上胡须' },
  { id: 'blush', label: '腮红', icon: Palette, desc: '脸颊腮红' },
  { id: 'eyepatch', label: '眼罩', icon: Eye, desc: '单眼眼罩' },
];

const SOURCE_OPTIONS = [
  { id: 'generated', label: '内置素材', icon: Box, desc: '无需外部文件' },
  { id: 'url', label: '模型 URL', icon: Image, desc: '外部 GLB 模型' },
  { id: 'decal', label: '贴纸', icon: Palette, desc: '透明 PNG 贴片' },
];

/** AI 快速触发建议 */
const AI_SUGGESTIONS = [
  { label: '金框眼镜试戴', icon: 'glasses', prompt: '金色眼镜框试戴效果，简洁大方' },
  { label: '可爱口罩', icon: 'mask', prompt: '粉色可爱口罩，遮住嘴巴和鼻子' },
  { label: '生日皇冠', icon: 'crown', prompt: '生日派对皇冠，加上腮红喜庆效果' },
  { label: '搞怪胡子', icon: 'beard', prompt: '夸张黑色胡子，搞笑面具' },
];

export default function FaceContent({ data = {}, onChange }) {
  const faceZones = data.faceZones || createDefaultFaceZones();
  const activePreset = data.activePreset || 'custom';

  // ── AI 状态 ──
  const [aiPrompt, setAiPrompt] = React.useState('');
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiResult, setAiResult] = React.useState(null);
  const [aiError, setAiError] = React.useState('');
  const [aiAvailable, setAiAvailable] = React.useState(true);

  const updateZones = (zones) => {
    const resolved = typeof zones === 'function' ? zones(faceZones) : zones;
    onChange({ ...data, faceZones: resolved });
  };

  const updateZone = (zoneId, patch) => {
    updateZones((prev) => prev.map((z) =>
      z.zoneId === zoneId ? { ...z, ...patch } : z
    ));
  };

  // 首次渲染时将默认 faceZones 同步到父组件
  React.useEffect(() => {
    if (!data.faceZones) {
      onChange({ ...data, faceZones: createDefaultFaceZones() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 选中编辑的区域 ──
  const getEnabled = faceZones.filter((z) => z.enabled);
  const [selectedId, setSelectedId] = React.useState(getEnabled[0]?.zoneId || null);
  React.useEffect(() => {
    const enabled = faceZones.filter((z) => z.enabled);
    if (!selectedId || !enabled.find((z) => z.zoneId === selectedId)) {
      setSelectedId(enabled[0]?.zoneId || null);
    }
  }, [data.faceZones]);

  const selectedZone = faceZones.find((z) => z.zoneId === selectedId);
  const selectedDef = FACE_ZONES.find((d) => d.id === selectedId);

  const handleSelectZone = (zoneId) => {
    setSelectedId(zoneId);
    const zc = faceZones.find((z) => z.zoneId === zoneId);
    if (zc && !zc.enabled) {
      updateZone(zoneId, { enabled: true });
    }
  };

  // ── AI 设计 ──
  const handleAiDesign = async (prompt) => {
    if (!prompt.trim()) return;
    setAiLoading(true);
    setAiError('');
    setAiResult(null);
    try {
      const res = await fetch('/api/ai/face-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), currentZones: faceZones }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'AI 设计失败' }));
        throw new Error(err.error || 'AI 设计失败');
      }
      const result = await res.json();
      setAiResult(result);
    } catch (err) {
      setAiError(err.message || 'AI 请求失败');
      if (err.message.includes('未配置')) setAiAvailable(false);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiSuggestion = (suggestion) => {
    setAiPrompt(suggestion);
    handleAiDesign(suggestion);
  };

  const applyAiConfig = () => {
    if (!aiResult || !aiResult.zones) return;
    const zoneMap = {};
    for (const z of aiResult.zones) {
      zoneMap[z.zoneId] = z;
    }
    const merged = faceZones.map((z) => {
      const aiZone = zoneMap[z.zoneId];
      if (!aiZone) return z;
      return {
        ...z,
        enabled: aiZone.enabled ?? z.enabled,
        contentSource: aiZone.contentSource || z.contentSource,
        generatedType: aiZone.generatedType || z.generatedType,
        scale: aiZone.scale ?? z.scale,
      };
    });
    updateZones(() => merged);
    setAiResult(null);
    setAiPrompt('');
    // 选中 AI 启用的第一个区域
    const firstEnabled = merged.find((z) => z.enabled);
    if (firstEnabled) setSelectedId(firstEnabled.zoneId);
  };

  if (!faceZones || faceZones.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-slate-500">没有可用的面部区域配置</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ═══ AI 面部配置 ═══ */}
      {aiAvailable && (
        <div className="rounded-xl border border-violet-500/10 bg-violet-500/[0.02] p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={12} className="text-violet-400" />
            <span className="text-xs font-medium text-violet-400">AI 面部配置</span>
            <span className="text-[10px] text-slate-600">描述效果，AI 自动配置</span>
          </div>

          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAiDesign(aiPrompt); }}
              placeholder="例如：金色眼镜框试戴，配黑色墨镜"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300
                placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40 transition-all"
              disabled={aiLoading}
            />
            <button
              type="button"
              onClick={() => handleAiDesign(aiPrompt)}
              disabled={aiLoading || !aiPrompt.trim()}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium
                bg-violet-500/20 text-violet-400 border border-violet-500/30
                hover:bg-violet-500/30 transition-all
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {aiLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
              ) : (
                <Send size={12} />
              )}
              {aiLoading ? '生成中' : '生成'}
            </button>
          </div>

          {/* 快速触发建议 */}
          <div className="flex flex-wrap gap-1.5">
            {AI_SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => handleAiSuggestion(s.prompt)}
                disabled={aiLoading}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px]
                  bg-white/[0.03] border border-white/10 text-slate-400
                  hover:bg-violet-500/10 hover:border-violet-500/30 hover:text-violet-400
                  transition-all disabled:opacity-40"
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>

          {/* AI 结果预览 */}
          {aiResult && (
            <div className="mt-3 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles size={11} className="text-emerald-400 shrink-0" />
                    <span className="text-xs font-medium text-emerald-400">AI 配置建议</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{aiResult.reasoning || ''}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(aiResult.zones || []).filter(z => z.enabled).map((z) => {
                      const def = FACE_ZONES.find((d) => d.id === z.zoneId);
                      return def ? (
                        <span key={z.zoneId} className="px-1.5 py-0.5 rounded text-[10px] bg-violet-500/10 text-violet-300 border border-violet-500/20">
                          {def.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applyAiConfig}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium
                    bg-emerald-500/20 text-emerald-400 border border-emerald-500/30
                    hover:bg-emerald-500/30 transition-all"
                >
                  <Wand2 size={12} />
                  应用
                </button>
              </div>
            </div>
          )}

          {aiError && (
            <p className="text-[11px] text-rose-400 mt-2">{aiError}</p>
          )}
        </div>
      )}

      {/* ═══ 预设快捷条 ═══ */}
      <div>
        <p className="text-xs text-slate-500 mb-2">快捷预设</p>
        <div className="flex flex-wrap gap-1.5">
          {ZONE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onChange({
                  ...data,
                  activePreset: preset.id,
                  faceZones: preset.zones ? applyPreset(preset.id, faceZones) : faceZones,
                });
              }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activePreset === preset.id
                  ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                  : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'
              }`}
            >
              <SemanticIcon name={preset.icon} size={14} />
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ 面部区域预览 ═══ */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-500">面部区域预览</p>
          <span className="text-[10px] text-slate-600">点击区域可快速选中</span>
        </div>
        <FaceDiagram
          zones={faceZones}
          selectedId={selectedId}
          onSelectZone={handleSelectZone}
        />
      </div>

      {/* ═══ 区域选择行 ═══ */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-500">选择区域</p>
          <span className="text-[10px] text-slate-600">
            {getEnabled.length}/{faceZones.length} 已启用
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {faceZones.map((zc) => {
            const def = FACE_ZONES.find((d) => d.id === zc.zoneId);
            if (!def) return null;
            const isSelected = selectedId === zc.zoneId;
            const isEnabled = zc.enabled;
            return (
              <button
                key={zc.zoneId}
                type="button"
                onClick={() => handleSelectZone(zc.zoneId)}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium
                  transition-all border
                  ${isSelected ? 'ring-2 ring-violet-400/50' : ''}
                  ${isEnabled
                    ? 'bg-violet-500/10 border-violet-500/30 text-slate-200'
                    : 'bg-white/[0.03] border-white/10 text-slate-500 hover:border-white/20'
                  }
                `}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                  isEnabled ? 'bg-emerald-400 shadow-sm shadow-emerald-400/30' : 'bg-slate-600'
                }`} />
                <span>{def.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ 选中区域的配置 ═══ */}
      {selectedZone && selectedDef && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.03] p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedDef.color }} />
              <span className="text-sm font-medium text-slate-200">{selectedDef.name}</span>
              <span className="text-[10px] text-slate-500">配置</span>
            </div>
            <button
              type="button"
              onClick={() => updateZone(selectedZone.zoneId, { enabled: !selectedZone.enabled })}
              className={`relative w-9 rounded-full transition-colors ${
                selectedZone.enabled ? 'bg-violet-500' : 'bg-white/20'
              }`}
              style={{ height: '18px' }}
            >
              <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                selectedZone.enabled ? 'translate-x-[14px]' : ''
              }`} />
            </button>
          </div>

          <p className="text-xs text-slate-500 mb-4">{selectedDef.description}</p>

          <p className="text-xs text-slate-500 mb-2">内容来源</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {SOURCE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = (selectedZone.contentSource || 'url') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateZone(selectedZone.zoneId, {
                    contentSource: opt.id,
                    generatedType: opt.id === 'generated' ? 'glasses' : selectedZone.generatedType,
                  })}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-[11px] transition-all border ${
                    active
                      ? 'bg-violet-500/20 border-violet-500/30 text-violet-400'
                      : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'
                  }`}
                >
                  <Icon size={18} className={active ? 'text-violet-400' : 'text-slate-400'} />
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-[10px] text-slate-500">{opt.desc}</span>
                </button>
              );
            })}
          </div>

          {(selectedZone.contentSource || 'url') === 'generated' && (
            <div>
              <p className="text-xs text-slate-500 mb-2">选择内置素材</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {BUILTIN_GEOMETRIES.map((geo) => {
                  const GeoIcon = geo.icon;
                  const selected = selectedZone.generatedType === geo.id;
                  return (
                    <button
                      key={geo.id}
                      type="button"
                      onClick={() => updateZone(selectedZone.zoneId, { generatedType: geo.id })}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-lg text-[10px] transition-all border ${
                        selected
                          ? 'bg-violet-500/20 border-violet-500/30 text-violet-400'
                          : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'
                      }`}
                    >
                      <GeoIcon size={20} className={selected ? 'text-violet-400' : 'text-slate-400'} />
                      <span className="whitespace-nowrap">{geo.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-600">内置几何体无需外部文件，在 AR 中实时生成</p>
            </div>
          )}

          {(selectedZone.contentSource || 'url') === 'url' && (
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">模型文件</label>
              <FileOrUrlInput
                value={selectedZone.modelUrl || ''}
                onChange={(v) => updateZone(selectedZone.zoneId, { modelUrl: v })}
                placeholder="模型 URL (.glb)"
                accept="model"
                compact
              />
              {selectedZone.modelUrl && (
                <p className="text-[10px] text-emerald-400/70 mt-1 flex items-center gap-1">
                  <Check size={10} /> 已设置
                </p>
              )}
            </div>
          )}

          {(selectedZone.contentSource || 'url') === 'decal' && (
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">贴纸文件</label>
              <FileOrUrlInput
                value={selectedZone.decalUrl || ''}
                onChange={(v) => updateZone(selectedZone.zoneId, { decalUrl: v })}
                placeholder="透明 PNG 图片 URL"
                accept="image"
                compact
              />
              {selectedZone.decalUrl && (
                <p className="text-[10px] text-emerald-400/70 mt-1 flex items-center gap-1">
                  <Check size={10} /> 已设置
                </p>
              )}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-white/5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">大小</span>
              <span className="text-xs text-slate-400">{(selectedZone.scale || 1).toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={selectedZone.scale || 1}
              onChange={(e) => updateZone(selectedZone.zoneId, { scale: parseFloat(e.target.value) })}
              className="w-full h-1 rounded-full appearance-none bg-white/10 cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}

