// src/components/star/starData.js
export const STAR_CONFIG = [
  { id: 'home',     label: '首页', path: '/',        color: '#6366f1', glow: '#818cf8', dark: '#4338ca' },
  { id: 'create',   label: '创建', path: '/create',   color: '#a855f7', glow: '#c084fc', dark: '#7e22ce' },
  { id: 'dashboard',label: '控制台', path: '/dashboard', color: '#22d3ee', glow: '#67e8f9', dark: '#0891b2' },
  { id: 'ai',       label: 'AI',   path: '/ai-design', color: '#f59e0b', glow: '#fcd34d', dark: '#d97706' },
  { id: 'template', label: '模板', path: '/',        color: '#ec4899', glow: '#fb7185', dark: '#db2777' },
];

export const STAR_POSITIONS = [
  { x: 150, y: 120 },  // 首页 - top left
  { x: 350, y: 70 },   // 创建 - top center
  { x: 620, y: 150 },  // 控制台 - right
  { x: 550, y: 360 },  // AI - bottom right
  { x: 250, y: 390 },  // 模板 - bottom left
];
