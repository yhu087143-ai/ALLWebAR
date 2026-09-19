import React, { useMemo } from 'react';
import { Heart, Skull, MapPin, Check, Compass, Signal, BatteryFull } from 'lucide-react';

/**
 * UIPreview — 模拟手机屏幕实时预览 UI 布局和主题
 *
 * 在 9:16 的模拟手机屏幕上按位置渲染所有启用的 UI 组件，
 * 反映当前主题（颜色、字体、形状）。
 *
 * Props:
 *   components: HUDComponent[]
 *   theme: UITheme
 *   state?: { score, timer, combo, lives, items, ... }
 */

const ANCHOR_TO_STYLE = {
  'top-left': { top: 0, left: 0, alignItems: 'flex-start', justifyContent: 'flex-start' },
  'top-center': { top: 0, left: '50%', alignItems: 'center', justifyContent: 'flex-start', xform: 'translateX(-50%)' },
  'top-right': { top: 0, right: 0, alignItems: 'flex-end', justifyContent: 'flex-start' },
  'middle-left': { top: '50%', left: 0, alignItems: 'flex-start', justifyContent: 'center', yform: 'translateY(-50%)' },
  'center': { top: '50%', left: '50%', alignItems: 'center', justifyContent: 'center', xform: 'translateX(-50%)', yform: 'translateY(-50%)' },
  'middle-right': { top: '50%', right: 0, alignItems: 'flex-end', justifyContent: 'center', yform: 'translateY(-50%)' },
  'bottom-left': { bottom: 0, left: 0, alignItems: 'flex-start', justifyContent: 'flex-end' },
  'bottom-center': { bottom: 0, left: '50%', alignItems: 'center', justifyContent: 'flex-end', xform: 'translateX(-50%)' },
  'bottom-right': { bottom: 0, right: 0, alignItems: 'flex-end', justifyContent: 'flex-end' },
};

export default function UIPreview({ components = [], theme, state: gameState }) {
  const enabled = useMemo(() =>
    (components || []).filter((c) => c.enabled),
    [components]
  );

  if (!theme) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-slate-600">
        请先配置主题
      </div>
    );
  }

  const c = theme.colors || {};
  const t = theme.typography || {};
  const s = theme.shape || {};

  // Build CSS from theme
  const themeStyle = {
    '--preview-font': t.fontFamily || 'sans-serif',
    '--preview-title-size': `${t.titleSize || 18}px`,
    '--preview-body-size': `${t.bodySize || 14}px`,
    '--preview-label-size': `${t.labelSize || 11}px`,
    '--preview-primary': c.primary || '#6366f1',
    '--preview-secondary': c.secondary || '#8b5cf6',
    '--preview-accent': c.accent || '#06b6d4',
    '--preview-bg': c.background || '#0f0f1a',
    '--preview-surface': c.surface || '#1a1a2e',
    '--preview-text': c.text || '#f1f5f9',
    '--preview-text-sec': c.textSecondary || '#94a3b8',
    '--preview-success': c.success || '#22c55e',
    '--preview-warning': c.warning || '#eab308',
    '--preview-error': c.error || '#ef4444',
    '--preview-radius': s.borderRadius === 'none' ? '0px' : s.borderRadius === 'small' ? '4px' : s.borderRadius === 'medium' ? '8px' : s.borderRadius === 'large' ? '16px' : '9999px',
    '--preview-card-radius': s.cardStyle === 'elevated' ? '12px' : s.cardStyle === 'pill' ? '9999px' : '8px',
    '--preview-bg-effect': s.backgroundEffect === 'blur' ? 'backdrop-filter: blur(12px)' : s.backgroundEffect === 'dim' ? 'opacity: 0.8' : s.backgroundEffect === 'solid' ? '' : 'background: transparent',
    '--preview-border': s.cardStyle === 'outlined' ? '1px solid' : s.cardStyle === 'glass' ? '1px solid rgba(255,255,255,0.1)' : 'none',
  };

  const state = gameState || { score: 0, timer: 60, combo: 0, lives: 3, items: 0, visitedPois: [], currentPOI: null, totalPois: 5, message: null, phase: 'playing' };

  // ── 渲染单个组件 ──
  const renderComponent = (comp) => {
    const anchor = ANCHOR_TO_STYLE[comp.position?.anchor] || ANCHOR_TO_STYLE['center'];
    const transform = `${anchor.xform || ''} ${anchor.yform || ''}`.trim();
    const offsetX = comp.position?.offsetX || 0;
    const offsetY = comp.position?.offsetY || 0;
    const compStyle = comp.style || {};

    const baseStyle = {
      position: 'absolute',
      [anchor.top !== undefined ? 'top' : 'bottom']: anchor.top !== undefined ? `calc(${anchor.top}${typeof anchor.top === 'number' ? 'px' : ''} + ${offsetY}px)` : `calc(${anchor.bottom}${typeof anchor.bottom === 'number' ? 'px' : ''} - ${offsetY}px)`,
      [anchor.left !== undefined ? 'left' : 'right']: anchor.left !== undefined ? `calc(${anchor.left}${typeof anchor.left === 'number' ? 'px' : ''} + ${offsetX}px)` : `calc(${anchor.right}${typeof anchor.right === 'number' ? 'px' : ''} - ${offsetX}px)`,
      transform,
      fontFamily: 'var(--preview-font)',
      zIndex: 10,
    };

    const colors = getComponentColors(comp, theme);

    const cardBase = {
      background: compStyle.backgroundColor || colors.bg,
      color: compStyle.textColor || colors.text,
      borderRadius: compStyle.borderRadius != null ? `${compStyle.borderRadius}px` : 'var(--preview-radius)',
      fontSize: compStyle.fontSize ? `${compStyle.fontSize}px` : 'var(--preview-body-size)',
      opacity: compStyle.opacity ?? 1,
      padding: compStyle.padding || '6px 12px',
      border: compStyle.borderColor ? `1px solid ${compStyle.borderColor}` : 'var(--preview-border)',
      borderColor: compStyle.borderColor || undefined,
      backdropFilter: s.backgroundEffect === 'blur' ? 'blur(12px)' : undefined,
    };

    switch (comp.type) {
      case 'score':
        return (
          <div key={comp.id} style={{ ...baseStyle, ...cardBase, minWidth: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--preview-label-size)', opacity: 0.7, marginBottom: 2 }}>
              {comp.label || '分数'}
            </div>
            <div style={{ fontSize: 'var(--preview-title-size)', fontWeight: 'bold' }}>
              {state.score}
            </div>
          </div>
        );

      case 'timer':
        return (
          <div key={comp.id} style={{ ...baseStyle, ...cardBase, minWidth: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--preview-label-size)', opacity: 0.7, marginBottom: 2 }}>
              {comp.label || '时间'}
            </div>
            <div style={{
              fontSize: 'var(--preview-title-size)', fontWeight: 'bold',
              color: state.timer <= (comp.props?.warningThreshold ?? 10) && state.timer > 0 ? 'var(--preview-warning)' : undefined,
            }}>
              {formatTime(state.timer)}
            </div>
          </div>
        );

      case 'combo':
        return (
          <div key={comp.id} style={{ ...baseStyle, ...cardBase, textAlign: 'center' }}>
            {state.combo > 0 ? (
              <>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: 'var(--preview-accent)' }}>
                  x{state.combo}
                </div>
                {comp.props?.showMultiplier !== false && (
                  <div style={{ fontSize: 'var(--preview-label-size)', opacity: 0.7 }}>
                    {state.combo * 2}x 得分
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 'var(--preview-label-size)', opacity: 0.4 }}>
                {comp.label || '连击'}
              </div>
            )}
          </div>
        );

      case 'lives':
        return (
          <div key={comp.id} style={{ ...baseStyle, ...cardBase, display: 'flex', alignItems: 'center', gap: 4 }}>
            {Array.from({ length: state.lives }, (_, i) => (
              <Heart key={i} size={14} strokeWidth={1.8} fill="currentColor" style={{ color: cardBase.color }} aria-hidden="true" />
            ))}
            {state.lives <= 0 && (
              <Skull size={16} strokeWidth={1.8} style={{ opacity: 0.5 }} aria-hidden="true" />
            )}
          </div>
        );

      case 'message':
        return state.message ? (
          <div key={comp.id} style={{ ...baseStyle, ...cardBase, maxWidth: '80%', textAlign: 'center' }}>
            {state.message}
          </div>
        ) : null;

      case 'poi_card':
        return state.currentPOI ? (
          <div key={comp.id} style={{ ...baseStyle, ...cardBase, maxWidth: '80%', minWidth: 150 }}>
            <div style={{ fontSize: 'var(--preview-label-size)', fontWeight: 'bold', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={13} strokeWidth={1.9} aria-hidden="true" />
              {state.currentPOI}
            </div>
            {comp.props?.showDescription !== false && (
              <div style={{ fontSize: 'calc(var(--preview-body-size) - 2px)', opacity: 0.7 }}>
                兴趣点描述文字
              </div>
            )}
            {comp.props?.showDistance !== false && (
              <div style={{ fontSize: 'var(--preview-label-size)', opacity: 0.5, marginTop: 2 }}>
                约 15m
              </div>
            )}
          </div>
        ) : null;

      case 'directional_arrow':
        return (
          <div key={comp.id} style={{ ...baseStyle, fontSize: 28, opacity: 0.8, color: 'var(--preview-text)' }}>
            {comp.props?.style === 'triangle' ? '▲' : comp.props?.style === 'dot' ? '●' : '→'}
          </div>
        );

      case 'progress_bar':
        return (
          <div key={comp.id} style={{ ...baseStyle, ...cardBase, minWidth: 120 }}>
            {comp.props?.showLabel !== false && (
              <div style={{ fontSize: 'var(--preview-label-size)', opacity: 0.7, marginBottom: 4 }}>
                进度 {state.visitedPois?.length || 0}/{state.totalPois || 0}
              </div>
            )}
            <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${state.totalPois ? ((state.visitedPois?.length || 0) / state.totalPois * 100) : 0}%`,
                height: '100%',
                background: 'var(--preview-primary)',
                borderRadius: 2,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        );

      case 'poi_list':
        return state.totalPois > 0 ? (
          <div key={comp.id} style={{ ...baseStyle, ...cardBase, minWidth: 100, maxWidth: 140 }}>
            <div style={{ fontSize: 'var(--preview-label-size)', opacity: 0.7, marginBottom: 4 }}>
              {comp.label || '兴趣点'}
            </div>
            {Array.from({ length: Math.min(state.totalPois, 5) }, (_, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0',
                fontSize: 'calc(var(--preview-body-size) - 2px)',
                opacity: (state.visitedPois || []).includes(`poi_${i}`) ? 0.4 : 0.8,
              }}>
                <span>{i + 1}.</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  POI {i + 1}
                </span>
                {(state.visitedPois || []).includes(`poi_${i}`) && (
                  <Check size={12} strokeWidth={2.4} style={{ color: 'var(--preview-success)' }} aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        ) : null;

      case 'compass':
        return (
          <div key={comp.id} style={{ ...baseStyle, ...cardBase, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
            <Compass size={20} strokeWidth={1.7} aria-hidden="true" />
          </div>
        );

      case 'button':
        return (
          <div key={comp.id} style={{
            ...baseStyle, ...cardBase,
            padding: '8px 20px',
            background: 'var(--preview-primary)',
            color: '#fff',
            cursor: 'pointer',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: 'var(--preview-body-size)',
            borderRadius: s.buttonStyle === 'pill' ? '9999px' : s.buttonStyle === 'square' ? '4px' : 'var(--preview-radius)',
          }}>
            {comp.props?.text || '按钮'}
          </div>
        );

      case 'custom_text':
        return (
          <div key={comp.id} style={{ ...baseStyle, ...cardBase }}>
            {comp.props?.text || ''}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full">
      {/* Phone frame */}
      <div
        className="relative rounded-[24px] border-2 border-white/10 overflow-hidden shadow-2xl"
        style={{
          width: 240,
          height: 426,
          backgroundColor: 'var(--preview-bg)',
          fontFamily: 'var(--preview-font)',
          ...themeStyle,
        }}
      >
        {/* Status bar mock */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px', fontSize: 9, color: 'var(--preview-text)', opacity: 0.4, zIndex: 20,
        }}>
          <span>9:41</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Signal size={14} strokeWidth={1.8} aria-hidden="true" /><BatteryFull size={14} strokeWidth={1.8} aria-hidden="true" /></span>
        </div>

        {/* AR camera mock background */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, ${c.background || '#0f0f1a'} 0%, ${c.surface || '#1a1a2e'} 100%)`,
          opacity: 0.8,
        }} />

        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          opacity: 0.06,
          backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
        }} />

        {/* Components */}
        {enabled.length === 0 ? (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--preview-text)', opacity: 0.3,
            fontSize: 'var(--preview-label-size)',
          }}>
            启用组件以预览
          </div>
        ) : (
          enabled.map(renderComponent)
        )}

        {/* Notch */}
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 60, height: 20, background: '#000', borderRadius: '0 0 12px 12px', zIndex: 20,
        }} />
      </div>

      <p className="text-[10px] text-slate-600 mt-3">模拟预览 · 实际效果以 AR 设备为准</p>
    </div>
  );
}

function formatTime(seconds) {
  if (seconds == null || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getComponentColors(comp, theme) {
  const themeColors = theme?.colors || {};
  switch (comp.type) {
    case 'score':
      return { bg: themeColors.surface + 'cc', text: themeColors.text };
    case 'timer':
      return { bg: themeColors.surface + 'cc', text: themeColors.text };
    case 'combo':
      return { bg: themeColors.surface + 'cc', text: themeColors.accent };
    case 'lives':
      return { bg: 'transparent', text: themeColors.error };
    case 'message':
      return { bg: themeColors.surface + 'dd', text: themeColors.text };
    case 'poi_card':
      return { bg: themeColors.surface + 'dd', text: themeColors.text };
    case 'directional_arrow':
      return { bg: 'transparent', text: themeColors.primary };
    case 'progress_bar':
      return { bg: themeColors.surface + '99', text: themeColors.text };
    case 'poi_list':
      return { bg: themeColors.surface + 'cc', text: themeColors.text };
    case 'compass':
      return { bg: themeColors.surface + '99', text: themeColors.text };
    case 'button':
      return { bg: themeColors.primary, text: '#ffffff' };
    case 'custom_text':
      return { bg: 'transparent', text: themeColors.text };
    default:
      return { bg: themeColors.surface + 'cc', text: themeColors.text };
  }
}
