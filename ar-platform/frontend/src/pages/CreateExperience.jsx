import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Send, CheckCircle, AlertCircle,
  Copy, Download, ExternalLink, Eye, Bot,
  Settings, FileCode, Gamepad2, MapPin, Layers,
  Grid3X3, Waves, Palette, Home, ChevronRight,
} from 'lucide-react';
import VisualRuleEditor from '../components/editor/VisualRuleEditor.jsx';
import MechanicsConfig from '../components/editor/MechanicsConfig.jsx';
import NavigationConfig from '../components/editor/NavigationConfig.jsx';
import GridConfigPanel from '../components/editor/GridConfigPanel.jsx';
import WaveConfigPanel from '../components/editor/WaveConfigPanel.jsx';
import TrackingConfig from '../components/editor/TrackingConfig.jsx';
import UIStylePanel from '../components/editor/UIStylePanel.jsx';
import UIComponentList from '../components/editor/UIComponentList.jsx';
import UIComponentEditor from '../components/editor/UIComponentEditor.jsx';
import UIPreview from '../components/preview/UIPreview.jsx';
import UnifiedPreview from '../components/preview/UnifiedPreview.jsx';
import AiChatPanel from '../components/editor/AiChatPanel.jsx';
import { createArExperience } from '../api/client.js';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import QrModal from '../components/QrModal.jsx';

// 简易深合并 — 只合并纯对象，不合并数组
function deepMerge(a, b) {
  if (!b || typeof b !== 'object') return a;
  const result = { ...a };
  for (const key of Object.keys(b)) {
    if (b[key] && typeof b[key] === 'object' && !Array.isArray(b[key]) && a[key] && typeof a[key] === 'object') {
      result[key] = deepMerge(a[key], b[key]);
    } else {
      result[key] = b[key];
    }
  }
  return result;
}

const ALL_TABS = [
  { id: 'basics', label: '基础设置', icon: Settings },
  { id: 'rules', label: '规则', icon: FileCode },
  { id: 'mechanics', label: '游戏机制', icon: Gamepad2 },
  { id: 'navigation', label: '导览路线', icon: MapPin },
  { id: 'grid', label: '网格放置', icon: Grid3X3 },
  { id: 'waves', label: '波次管理', icon: Waves },
  { id: 'ui', label: 'UI 设计', icon: Palette },
  { id: 'preview', label: '预览', icon: Eye },
];

// 根据体验类型过滤显示的 tab
// 游戏类（scavenger/challenge）：只显示游戏相关功能
// 导览类（guided_tour）：只显示导览相关功能
// 自由创作/自定义：全功能
const GAME_TABS = new Set(['basics', 'rules', 'mechanics', 'grid', 'waves', 'ui', 'preview']);
const GUIDE_TABS = new Set(['basics', 'rules', 'navigation', 'ui', 'preview']);

const EXPERIENCE_TYPES = [
  { id: 'freeform', label: '自由创作', desc: '完全自定义规则和机制' },
  { id: 'scavenger', label: '寻宝收集', desc: '在AR场景中收集物品' },
  { id: 'guided_tour', label: '导览路线', desc: '基于位置的AR导览' },
  { id: 'challenge', label: '挑战模式', desc: '计分限时挑战' },
  { id: 'custom', label: '自定义模板', desc: '从空白开始创建' },
  { id: '', label: '自定义输入…', desc: '输入任意游戏类型名称' },
];

function generateId() {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function CreateExperience() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('basics');

  // ── Experience state ──
  const [experience, setExperience] = useState({
    id: `exp_${Date.now()}`,
    type: 'freeform',
    meta: {
      title: '',
      description: '',
      version: '1.0.0',
    },
    world: {
      engine: 'auto',
      tracking: 'image',
      capabilities: [],
      targetUrl: '',
      targetImageUrl: '',
      modelUrl: '',
    },
    entities: [],
    mechanics: {
      scoring: { enabled: true, initial: 0 },
      timer: { enabled: true, duration: 60, countdown: true },
      items: { total: 10, spawnInterval: 3, maxVisible: 5 },
      combo: { enabled: true, multiplier: 2 },
      grid: undefined,
      waves: undefined,
    },
    navigation: {
      pois: [],
      positionProvider: 'gps',
      autoAdvance: true,
      allowSkip: true,
      completion: { action: 'show_message', message: '体验完成！' },
    },
    rules: [],
    hud: {
      layout: 'floating',
      components: [
        { id: 'hud_score', type: 'score', enabled: true, label: '分数', position: { anchor: 'top-left', offsetX: 16, offsetY: 16 }, props: { format: 'number', prefix: '' } },
        { id: 'hud_timer', type: 'timer', enabled: true, label: '时间', position: { anchor: 'top-center', offsetX: 0, offsetY: 16 }, props: { format: 'number', warningThreshold: 10 } },
        { id: 'hud_message', type: 'message', enabled: true, label: '消息', position: { anchor: 'bottom-center', offsetX: 0, offsetY: 100 }, props: { duration: 3 } },
      ],
      theme: {
        preset: 'dark',
        colors: {
          primary: '#6366f1', secondary: '#8b5cf6', accent: '#06b6d4',
          background: '#0f0f1a', surface: '#1a1a2e', text: '#f1f5f9', textSecondary: '#94a3b8',
          success: '#22c55e', warning: '#eab308', error: '#ef4444', info: '#3b82f6',
        },
        typography: { fontFamily: "'Inter', system-ui, sans-serif", titleSize: 18, bodySize: 14, labelSize: 11 },
        shape: { borderRadius: 'medium', buttonStyle: 'rounded', cardStyle: 'glass', backgroundEffect: 'blur' },
        animation: 'smooth',
      },
      showScore: true,
      showTimer: true,
      showMessage: true,
    },
  });

  // ── UI 编辑器状态 ──
  const [editingComponentId, setEditingComponentId] = useState(null);

  // ── AI Chat ──
  const [chatOpen, setChatOpen] = useState(false);

  // 根据体验类型过滤 tab
  const tabs = useMemo(() => {
    const type = experience.type;
    if (type === 'guided_tour') {
      return ALL_TABS.filter(t => GUIDE_TABS.has(t.id));
    }
    // 寻宝/挑战/自定义 → 游戏类
    if (type === 'scavenger' || type === 'challenge' || type === 'custom') {
      return ALL_TABS.filter(t => GAME_TABS.has(t.id));
    }
    // freeform → 全功能
    return ALL_TABS;
  }, [experience.type]);

  // 当切换类型导致当前 tab 不可见时，自动切换到第一个可见 tab
  const prevTabsRef = useRef(tabs);
  useEffect(() => {
    if (tabs.length > 0 && tabs !== prevTabsRef.current) {
      const validIds = new Set(tabs.map(t => t.id));
      if (!validIds.has(activeTab)) {
        setActiveTab(tabs[0].id);
      }
    }
    prevTabsRef.current = tabs;
  }, [tabs, activeTab]);

  // ── Publish state ──
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [publishResult, setPublishResult] = useState(null);
  const [showQr, setShowQr] = useState(false);

  // ── Field helpers ──
  const updateMeta = useCallback((field, value) => {
    setExperience(prev => ({ ...prev, meta: { ...prev.meta, [field]: value } }));
  }, []);

  const updateMechanics = useCallback((mechanics) => {
    setExperience(prev => ({ ...prev, mechanics }));
  }, []);

  const updateGrid = useCallback((grid) => {
    setExperience(prev => ({
      ...prev,
      mechanics: { ...prev.mechanics, grid },
    }));
  }, []);

  const updateWaves = useCallback((waves) => {
    setExperience(prev => ({
      ...prev,
      mechanics: { ...prev.mechanics, waves },
    }));
  }, []);

  const updateNavigation = useCallback((navigation) => {
    setExperience(prev => ({ ...prev, navigation }));
  }, []);

  const updateRules = useCallback((rules) => {
    setExperience(prev => ({ ...prev, rules }));
  }, []);

  const updateWorld = useCallback((field, value) => {
    setExperience(prev => ({ ...prev, world: { ...prev.world, [field]: value } }));
  }, []);

  // ── UI 配置 ──
  const updateHud = useCallback((hud) => {
    setExperience(prev => ({ ...prev, hud }));
  }, []);

  const updateHudTheme = useCallback((theme) => {
    setExperience(prev => ({ ...prev, hud: { ...prev.hud, theme } }));
  }, []);

  const updateHudComponents = useCallback((components) => {
    setExperience(prev => ({ ...prev, hud: { ...prev.hud, components } }));
  }, []);

  const updateHudComponent = useCallback((component) => {
    setExperience(prev => ({
      ...prev,
      hud: {
        ...prev.hud,
        components: (prev.hud.components || []).map((c) =>
          c.id === component.id ? component : c
        ),
      },
    }));
  }, []);

  // ── Build the config payload ──
  const buildPayload = useCallback(() => {
    const modelUrl = experience.world.modelUrl || '';

    return {
      title: experience.meta.title || 'AR 体验',
      modelUrl,
      trackingType: experience.world.tracking,
      engine: experience.world.engine || '8thwall',
      targetUrl: experience.world.targetUrl || undefined,
      targetImageUrl: experience.world.targetImageUrl || undefined,
      scale: experience.mechanics?.scale || 1,
      filterMinCF: experience.world?.filterMinCF ?? 0.0003,
      filterBeta: experience.world?.filterBeta ?? 100,
      missTolerance: experience.world?.missTolerance ?? 30,
      warmupTolerance: experience.world?.warmupTolerance ?? 8,
      freezeOnDetect: experience.world?.freezeOnDetect ?? true,
      positionOffset: experience.world?.positionOffset || undefined,
      planeMode: experience.world?.planeMode || undefined,
      faceFeature: experience.world?.faceFeature,
      faceZones: experience.world?.faceZones,
      config: {
        unifiedConfig: {
          experience,
        },
      },
    };
  }, [experience]);

  // ── Publish ──
  const handlePublish = async () => {
    if (!experience.meta.title.trim()) return;
    setPublishing(true);
    setPublishError('');

    try {
      const result = await createArExperience(buildPayload());
      setPublishResult(result);
      setShowQr(true);
    } catch (err) {
      setPublishError(err.message || '发布失败，请稍后重试');
    } finally {
      setPublishing(false);
    }
  };

  const publishUrl = publishResult?.fullUrl || publishResult?.url || '';

  const copyLink = () => {
    if (publishUrl) navigator.clipboard?.writeText(publishUrl);
  };

  // ── Tab validation ──
  const canProceedToPreview = experience.meta.title.trim();

  return (
    <div className="page-wrap page-body page-wrap-wide">
      {/* 面包屑 */}
      <nav aria-label="面包屑" className="crumb">
        <Home size={12} strokeWidth={1.7} aria-hidden="true" />
        <Link to="/">首页</Link>
        <ChevronRight size={11} strokeWidth={2} aria-hidden="true" className="crumb-sep" />
        <span aria-current="page">创建 AR 体验</span>
      </nav>

      {/* 页头 */}
      <header className="page-head mt-7">
        <div className="flex items-start gap-4">
          <div className="icon-tile icon-tile-lg mt-0.5">
            <Layers size={20} strokeWidth={1.6} aria-hidden="true" className="text-violet-300" />
          </div>
          <div className="min-w-0">
            <h1 className="page-title">创建 AR 体验</h1>
            <p className="page-sub">
              统一创作台 · 自由组合追踪能力、游戏机制、导览路线与自定义规则。
            </p>
          </div>
        </div>
      </header>

      {/* 分区切换 */}
      <div
        role="tablist"
        aria-label="创作分区"
        className="segmented mt-7 max-w-full overflow-x-auto"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-active={active}
              onClick={() => setActiveTab(tab.id)}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"
            >
              <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

        {/* ===== Tab Content ===== */}
        <ErrorBoundary key={activeTab}>
        <div className="space-y-6">

          {/* ── Basics Tab ── */}
          {activeTab === 'basics' && (
            <div className="space-y-6">
              {/* 名称与描述 */}
              <div className="glass-card rounded-xl">
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      体验名称 <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={experience.meta.title}
                      onChange={(e) => updateMeta('title', e.target.value)}
                      placeholder="给你的 AR 体验取个名字"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-300 placeholder:text-slate-600
                        focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/30 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">描述</label>
                    <textarea
                      value={experience.meta.description || ''}
                      onChange={(e) => updateMeta('description', e.target.value)}
                      placeholder="简单描述你的 AR 体验..."
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-300 placeholder:text-slate-600
                        focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/30 transition-all resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* 体验类型 */}
              <div className="glass-card rounded-xl">
                <div className="p-5">
                  <label className="block text-sm font-medium text-slate-300 mb-3">体验类型 <span className="text-xs text-slate-500 font-normal">(不限，可任意命名)</span></label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {EXPERIENCE_TYPES.map(t => (
                      t.id === '' ? (
                        <div key="custom-type" className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
                          <input
                            type="text"
                            value={experience.type}
                            onChange={(e) => setExperience(prev => ({ ...prev, type: e.target.value }))}
                            placeholder="输入游戏类型..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600
                              focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/30"
                          />
                          <div className="text-xs text-slate-600 mt-1">例如: 植物大战僵尸、塔防、赛车...</div>
                        </div>
                      ) : (
                        <button
                          key={t.id}
                          onClick={() => setExperience(prev => ({ ...prev, type: t.id }))}
                          className={`p-4 rounded-xl text-left border transition-all
                            ${experience.type === t.id
                              ? 'bg-violet-500/10 border-violet-500/30'
                              : 'bg-white/[0.02] border-white/10 hover:bg-white/5'}`}
                        >
                          <div className="text-sm font-medium text-slate-200 mb-1">{t.label}</div>
                          <div className="text-xs text-slate-500">{t.desc}</div>
                        </button>
                      )
                    ))}
                  </div>
                </div>
              </div>

              {/* 追踪配置（含文件导入） */}
              <div className="glass-card rounded-xl">
                <div className="p-5">
                  <TrackingConfig
                    tracking={experience.world.tracking}
                    targetUrl={experience.world.targetUrl}
                    targetImageUrl={experience.world.targetImageUrl}
                    faceFeature={experience.world.faceFeature}
                    faceScale={experience.world.faceScale}
                    onUpdate={updateWorld}
                  />
                </div>
              </div>

              {/* 3D 模型内容 */}
              <div className="glass-card rounded-xl">
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      3D 模型 URL <span className="text-xs text-slate-500 font-normal">（.glb / .gltf 格式）</span>
                    </label>
                    <input
                      type="text"
                      value={experience.world.modelUrl || ''}
                      onChange={(e) => updateWorld('modelUrl', e.target.value)}
                      placeholder="https://example.com/model.glb"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-300 placeholder:text-slate-600
                        focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/30 transition-all"
                    />
                    <p className="text-xs text-slate-600 mt-1">输入 3D 模型文件的 URL，上传功能即将推出</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Rules Tab ── */}
          {activeTab === 'rules' && (
            <div className="glass-card rounded-xl">
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">规则引擎</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      条件 → 动作规则，支持预设模板和自由表达式
                    </p>
                  </div>
                </div>
                <VisualRuleEditor
                  rules={experience.rules}
                  onChange={updateRules}
                />
                {experience.rules.length === 0 && (
                  <div className="text-center py-8">
                    <FileCode size={32} className="text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-600">暂无规则，点击上方按钮添加</p>
                    <p className="text-xs text-slate-700 mt-1">
                      例如: 当分数达到1000时显示胜利消息
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Mechanics Tab ── */}
          {activeTab === 'mechanics' && (
            <div className="glass-card rounded-xl">
              <div className="p-5">
                <MechanicsConfig
                  mechanics={experience.mechanics}
                  onChange={updateMechanics}
                />
              </div>
            </div>
          )}

          {/* ── Navigation Tab ── */}
          {activeTab === 'navigation' && (
            <div className="glass-card rounded-xl">
              <div className="p-5">
                <NavigationConfig
                  navigation={experience.navigation}
                  onChange={updateNavigation}
                />
              </div>
            </div>
          )}

          {/* ── Grid Tab ── */}
          {activeTab === 'grid' && (
            <div className="glass-card rounded-xl">
              <div className="p-5">
                <GridConfigPanel
                  grid={experience.mechanics?.grid}
                  onChange={updateGrid}
                />
              </div>
            </div>
          )}

          {/* ── Waves Tab ── */}
          {activeTab === 'waves' && (
            <div className="glass-card rounded-xl">
              <div className="p-5">
                <WaveConfigPanel
                  waves={experience.mechanics?.waves}
                  onChange={updateWaves}
                />
              </div>
            </div>
          )}

          {/* ── UI 设计 Tab ── */}
          {activeTab === 'ui' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 左侧编辑器 */}
              <div className="space-y-4">
                <div className="glass-card rounded-xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-100 mb-1">UI 设计</h2>
                      <p className="text-sm text-slate-500">
                        选择主题和 UI 组件，或让 AI 帮你设计
                      </p>
                    </div>
                    <button
                      onClick={() => setChatOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                        bg-gradient-to-r from-violet-500/20 to-rose-500/20 text-violet-300
                        border border-violet-500/20 hover:from-violet-500/30 hover:to-rose-500/30
                        transition-all shrink-0"
                    >
                      <Bot size={13} />
                      AI 设计
                    </button>
                  </div>

                  <UIStylePanel
                    theme={experience.hud?.theme}
                    onChange={updateHudTheme}
                  />
                </div>

                <div className="glass-card rounded-xl p-5">
                  <UIComponentList
                    components={experience.hud?.components || []}
                    onChange={updateHudComponents}
                    onEdit={(id) => setEditingComponentId(id)}
                    editingId={editingComponentId}
                  />
                </div>

                {editingComponentId && (
                  <UIComponentEditor
                    component={(experience.hud?.components || []).find((c) => c.id === editingComponentId)}
                    onChange={updateHudComponent}
                    onClose={() => setEditingComponentId(null)}
                  />
                )}
              </div>

              {/* 右侧预览 */}
              <div className="glass-card rounded-xl p-5 sticky top-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-300">实时预览</h3>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    实时更新
                  </div>
                </div>
                <UIPreview
                  components={experience.hud?.components || []}
                  theme={experience.hud?.theme}
                  state={{
                    score: 1250,
                    timer: 42,
                    combo: 3,
                    lives: 3,
                    items: 7,
                    totalPois: 5,
                    visitedPois: ['poi_0', 'poi_1'],
                    currentPOI: '图书馆',
                    message: null,
                    phase: 'playing',
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Preview Tab ── */}
          {activeTab === 'preview' && (
            <div className="space-y-6">
              <UnifiedPreview experience={experience} />

              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={() => setActiveTab('rules')}
                  className="flex-1 px-6 py-3 rounded-xl text-sm font-medium
                    bg-white/5 text-slate-400 border border-white/10
                    hover:bg-white/10 transition-all"
                >
                  ← 返回编辑
                </button>
                <button
                  onClick={handlePublish}
                  disabled={publishing || !canProceedToPreview}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold
                    bg-gradient-to-r from-violet-500 to-violet-600 text-white
                    hover:from-violet-400 hover:to-violet-500
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-all duration-200 shadow-lg shadow-violet-500/25
                    active:scale-95"
                >
                  {publishing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      发布中...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      发布 AR 体验
                    </>
                  )}
                </button>
              </div>

              {publishError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                  <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-400">{publishError}</p>
                </div>
              )}
            </div>
          )}

        </div>
        </ErrorBoundary>

        {/* 发布成功 */}
        {publishResult && (
          <section className="panel mt-6 border-emerald-400/20">
            <div className="panel-body space-y-6">
              <div className="flex items-center gap-4">
                <div className="icon-tile icon-tile-lg border-emerald-400/25 bg-emerald-500/[0.08]">
                  <CheckCircle size={22} strokeWidth={1.6} aria-hidden="true" className="text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-[0.95rem] font-medium text-emerald-200">发布成功</h3>
                  <p className="panel-note">体验已上线，用下面的二维码或链接即可打开。</p>
                </div>
              </div>

              <div>
                <label htmlFor="exp-publish-url" className="field-label">分享链接</label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="exp-publish-url"
                    type="text"
                    readOnly
                    value={publishUrl}
                    className="flex-1 font-mono text-[0.72rem]"
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    aria-label="复制分享链接"
                    className="btn-ghost btn-sm shrink-0"
                  >
                    <Copy size={14} strokeWidth={1.9} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => setShowQr(true)} className="btn-ghost flex-1">
                  <Download size={15} strokeWidth={1.9} aria-hidden="true" />
                  查看二维码
                </button>
                <a
                  href={publishUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary flex-1"
                >
                  <ExternalLink size={15} strokeWidth={1.9} aria-hidden="true" />
                  打开体验
                </a>
              </div>

              <button
                type="button"
                onClick={() => navigate('/')}
                className="btn-ghost btn-sm w-full border-white/[0.06] text-slate-500"
              >
                <ArrowLeft size={14} strokeWidth={1.9} aria-hidden="true" />
                返回首页
              </button>
            </div>
          </section>
        )}

      <QrModal url={publishUrl} isOpen={showQr} onClose={() => setShowQr(false)} />

      {/* AI 助手按钮 */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        aria-label="打开 AI 助手"
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full text-[#06060f] shadow-[0_16px_40px_-14px_rgba(167,139,250,0.7)] transition-transform duration-300 hover:scale-105 active:scale-95"
        style={{ background: 'linear-gradient(120deg,#5eead4,#a78bfa 65%,#f0abfc)' }}
      >
        <Bot size={20} strokeWidth={1.8} />
      </button>

      {chatOpen && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="关闭 AI 助手"
            onClick={() => setChatOpen(false)}
            className="flex-1 cursor-default bg-black/50 backdrop-blur-sm"
          />
          <div className="flex h-full w-[360px] max-w-[85vw] flex-col border-l border-white/[0.08] bg-ar-dark">
            <AiChatPanel
              config={experience}
              context="experience"
              onConfigChange={(newConfig) => setExperience(prev => deepMerge(prev, newConfig))}
              onClose={() => setChatOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
