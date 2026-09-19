import type { UITheme, UIThemePreset } from './config'

/**
 * 预设主题集合
 *
 * 7 个视觉主题，每个包含完整色板、排版、形状和动画设置。
 * 适用于不同类型的 AR 体验（游戏、导览、教育等）。
 */

const PRESETS: Record<UIThemePreset, UITheme> = {
  // ── 通用沉浸式：深色底 + 蓝紫高亮 ──
  dark: {
    preset: 'dark',
    colors: {
      primary: '#6366f1',
      secondary: '#8b5cf6',
      accent: '#06b6d4',
      background: '#0f0f1a',
      surface: '#1a1a2e',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      success: '#22c55e',
      warning: '#eab308',
      error: '#ef4444',
      info: '#3b82f6',
    },
    typography: {
      fontFamily: "'Inter', system-ui, sans-serif",
      titleSize: 18,
      bodySize: 14,
      labelSize: 11,
    },
    shape: {
      borderRadius: 'medium',
      buttonStyle: 'rounded',
      cardStyle: 'glass',
      backgroundEffect: 'blur',
    },
    animation: 'smooth',
  },

  // ── 明亮简洁：室内/教育场景 ──
  light: {
    preset: 'light',
    colors: {
      primary: '#4f46e5',
      secondary: '#7c3aed',
      accent: '#0891b2',
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
      textSecondary: '#64748b',
      success: '#16a34a',
      warning: '#ca8a04',
      error: '#dc2626',
      info: '#2563eb',
    },
    typography: {
      fontFamily: "'Inter', system-ui, sans-serif",
      titleSize: 18,
      bodySize: 14,
      labelSize: 11,
    },
    shape: {
      borderRadius: 'medium',
      buttonStyle: 'rounded',
      cardStyle: 'elevated',
      backgroundEffect: 'solid',
    },
    animation: 'smooth',
  },

  // ── 赛博科幻：暗紫 + 霓虹青 ──
  neon: {
    preset: 'neon',
    colors: {
      primary: '#06b6d4',
      secondary: '#d946ef',
      accent: '#10b981',
      background: '#020617',
      surface: '#0f172a',
      text: '#ccfbf1',
      textSecondary: '#64748b',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#f43f5e',
      info: '#06b6d4',
    },
    typography: {
      fontFamily: "'JetBrains Mono', 'Inter', monospace",
      titleSize: 16,
      bodySize: 13,
      labelSize: 10,
    },
    shape: {
      borderRadius: 'small',
      buttonStyle: 'square',
      cardStyle: 'outlined',
      backgroundEffect: 'dim',
    },
    animation: 'snappy',
  },

  // ── 极简专业：黑白灰 ──
  minimal: {
    preset: 'minimal',
    colors: {
      primary: '#6b7280',
      secondary: '#9ca3af',
      accent: '#3b82f6',
      background: '#000000',
      surface: '#111111',
      text: '#f9fafb',
      textSecondary: '#9ca3af',
      success: '#22c55e',
      warning: '#eab308',
      error: '#ef4444',
      info: '#60a5fa',
    },
    typography: {
      fontFamily: "'Inter', system-ui, sans-serif",
      titleSize: 16,
      bodySize: 13,
      labelSize: 10,
    },
    shape: {
      borderRadius: 'none',
      buttonStyle: 'square',
      cardStyle: 'flat',
      backgroundEffect: 'solid',
    },
    animation: 'none',
  },

  // ── 像素怀旧：暖橙 + 棕 ──
  retro: {
    preset: 'retro',
    colors: {
      primary: '#f97316',
      secondary: '#d97706',
      accent: '#fb923c',
      background: '#1c1917',
      surface: '#292524',
      text: '#fef3c7',
      textSecondary: '#a8a29e',
      success: '#65a30d',
      warning: '#eab308',
      error: '#b91c1c',
      info: '#0ea5e9',
    },
    typography: {
      fontFamily: "'Press Start 2P', 'Courier New', monospace",
      titleSize: 14,
      bodySize: 11,
      labelSize: 9,
    },
    shape: {
      borderRadius: 'none',
      buttonStyle: 'square',
      cardStyle: 'outlined',
      backgroundEffect: 'dim',
    },
    animation: 'snappy',
  },

  // ── 自然户外：绿 + 大地色 ──
  nature: {
    preset: 'nature',
    colors: {
      primary: '#22c55e',
      secondary: '#16a34a',
      accent: '#06b6d4',
      background: '#052e16',
      surface: '#14532d',
      text: '#f0fdf4',
      textSecondary: '#86efac',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#38bdf8',
    },
    typography: {
      fontFamily: "'Inter', system-ui, sans-serif",
      titleSize: 18,
      bodySize: 14,
      labelSize: 11,
    },
    shape: {
      borderRadius: 'large',
      buttonStyle: 'pill',
      cardStyle: 'glass',
      backgroundEffect: 'blur',
    },
    animation: 'smooth',
  },

  // ── 深空科技：深紫 + 紫蓝 + 粉色 (匹配 1XR 主项目) ──
  'deep-space': {
    preset: 'deep-space',
    colors: {
      primary: '#c084fc',
      secondary: '#60a5fa',
      accent: '#f472b6',
      background: '#1f1a3a',
      surface: 'rgba(42, 36, 80, 0.65)',
      text: '#f0ecf8',
      textSecondary: '#b0a8d0',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#ff5577',
      info: '#22d3ee',
    },
    typography: {
      fontFamily: "'Sora', 'PingFang SC', 'Microsoft YaHei', sans-serif",
      titleSize: 18,
      bodySize: 14,
      labelSize: 11,
    },
    shape: {
      borderRadius: 'large',
      buttonStyle: 'rounded',
      cardStyle: 'glass',
      backgroundEffect: 'blur',
    },
    animation: 'smooth',
  },

  // ── 魔法幻想：粉 + 紫 + 金 ──
  fantasy: {
    preset: 'fantasy',
    colors: {
      primary: '#d946ef',
      secondary: '#a855f7',
      accent: '#fbbf24',
      background: '#1a0a2e',
      surface: '#2d1b4e',
      text: '#faf5ff',
      textSecondary: '#d8b4fe',
      success: '#22c55e',
      warning: '#eab308',
      error: '#fb7185',
      info: '#38bdf8',
    },
    typography: {
      fontFamily: "'Inter', system-ui, sans-serif",
      titleSize: 18,
      bodySize: 14,
      labelSize: 11,
    },
    shape: {
      borderRadius: 'full',
      buttonStyle: 'pill',
      cardStyle: 'glass',
      backgroundEffect: 'blur',
    },
    animation: 'smooth',
  },
}

/**
 * 获取指定预设主题的副本
 */
export function getThemePreset(name: UIThemePreset): UITheme {
  const preset = PRESETS[name]
  if (!preset) {
    return { ...PRESETS.dark, preset: name }
  }
  return JSON.parse(JSON.stringify(preset))
}

/**
 * 获取所有预设主题列表
 */
export function getAllThemePresets(): UITheme[] {
  return Object.values(PRESETS).map(p => JSON.parse(JSON.stringify(p)))
}

/**
 * 将主题预设应用到 HUD 配置
 * 返回新的 HUD 配置（不修改原对象）
 */
export function applyThemePreset(hud: { theme?: UITheme }, presetName: UIThemePreset): { theme: UITheme } {
  return { theme: getThemePreset(presetName) }
}

export { PRESETS }
