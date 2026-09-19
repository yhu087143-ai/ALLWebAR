/**
 * 已发布导览 → 演示主题 适配层
 *
 * 编辑器（CreateGuide）发布的 GuideRoute 使用 { position: { type, scenePosition | latitude/longitude } }
 * 描述点位；而演示场景（TourScene / GuideEngine 沙盘）需要「场景 XZ 坐标 + 图标 + 配色」。
 *
 * 这里把任意来源的导览路线归一化成 TOUR_THEMES 里的 theme 结构，使
 * 「编辑器发布 → 扫码打开 → 导览演示」形成闭环。
 *
 * 坐标策略（按优先级）：
 *   1. 全部 POI 都有 scenePosition  → 直接使用，并等比缩放到沙盘范围内
 *   2. 全部 POI 都有 GPS 经纬度     → 以质心为原点做等距投影（米），再缩放到沙盘
 *   3. 其余（混合 / 无坐标）        → 均匀铺在一个圆环上，保证演示可跑
 */

import { BOARD_SIZE } from './tourData.js';

/** POI 配色循环（与内置主题风格一致） */
export const POI_PALETTE = [
  '#6366f1', '#f59e0b', '#22d3ee', '#ec4899',
  '#a855f7', '#10b981', '#f43f5e', '#8b5cf6',
];

/** 无图标时的兜底图标循环 */
const FALLBACK_ICONS = ['flag', 'landmark', 'shield', 'fox', 'gift', 'sunrise', 'drama', 'bamboo', 'pin', 'mountain'];

/** 沙盘可用半径（米）：坐标映射后的最大半径 */
const BOARD_RADIUS = BOARD_SIZE * 0.36;

const EARTH_LAT_M = 110540;      // 每度纬度 ≈ 米
const EARTH_LNG_M = 111320;      // 每度经度 ≈ 米（赤道），需乘 cos(lat)

/** 取点位自定义字段（兼容编辑器写入的扩展字段） */
function meta(p) {
  return p.meta || p.metadata || {};
}

/** 该点位是否自带场景坐标 */
function sceneOf(p) {
  const sp = p.position?.scenePosition;
  return Array.isArray(sp) && sp.length >= 3 ? sp : null;
}

/** 该点位是否自带 GPS */
function gpsOf(p) {
  const pos = p.position || {};
  const lat = pos.latitude ?? meta(p).lat;
  const lng = pos.longitude ?? meta(p).lng;
  return (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng))
    ? { lat, lng }
    : null;
}

/** 等比缩放一组 {x,z} 使其最大半径等于 targetR；原点已在质心 */
function fitRadius(points, targetR) {
  const maxR = points.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.z)), 0);
  if (!isFinite(maxR) || maxR < 1e-6) return { points, scale: 1 };
  const scale = targetR / maxR;
  return { points: points.map((p) => ({ x: p.x * scale, z: p.z * scale })), scale };
}

/**
 * 把发布的导览路线转换为演示主题。
 *
 * @param {object} guide  GuideRoute（来自 createArExperience 的 config.unifiedConfig.guide）
 * @param {object} [opts]
 * @param {string} [opts.title]      主题显示名（默认取 guide.name）
 * @param {string} [opts.subtitle]   副标题
 * @returns {object|null} 与 TOUR_THEMES 同构的 theme 对象；无有效 POI 时返回 null
 */
export function buildThemeFromPublishedGuide(guide, opts = {}) {
  if (!guide || !Array.isArray(guide.pois) || guide.pois.length === 0) return null;

  const sorted = [...guide.pois].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const count = sorted.length;

  const scenes = sorted.map(sceneOf);
  const gpss = sorted.map(gpsOf);

  const allScene = scenes.every(Boolean);
  const allGps = gpss.every(Boolean);

  let coords; // [{x,z}]
  let scale = 1;
  let coordMode;

  if (allScene) {
    coordMode = 'scene';
    // 以质心为原点，避免整体偏离沙盘中心
    const cx = scenes.reduce((s, v) => s + v[0], 0) / count;
    const cz = scenes.reduce((s, v) => s + v[2], 0) / count;
    const raw = scenes.map((v) => ({ x: v[0] - cx, z: v[2] - cz }));
    const fitted = fitRadius(raw, BOARD_RADIUS);
    coords = fitted.points;
    scale = fitted.scale;
  } else if (allGps) {
    coordMode = 'gps';
    const lat0 = gpss.reduce((s, v) => s + v.lat, 0) / count;
    const lng0 = gpss.reduce((s, v) => s + v.lng, 0) / count;
    const cosLat = Math.cos((lat0 * Math.PI) / 180) || 1;
    // 等距投影：x 向东、z 向南（与 three.js XZ 平面一致，-z 为北）
    const raw = gpss.map((v) => ({
      x: (v.lng - lng0) * EARTH_LNG_M * cosLat,
      z: -(v.lat - lat0) * EARTH_LAT_M,
    }));
    const fitted = fitRadius(raw, BOARD_RADIUS);
    coords = fitted.points;
    scale = fitted.scale;
  } else {
    coordMode = 'circle';
    // 混合或缺失坐标：均匀铺在圆环上，保证演示可用
    const r = BOARD_RADIUS;
    coords = sorted.map((_, i) => {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r };
    });
  }

  const theme = {
    id: guide.id || `published_${Date.now()}`,
    name: opts.title || guide.name || 'AR 导览',
    subtitle: opts.subtitle || `${count} 个点位 · ${coordMode === 'gps' ? 'GPS 路线' : coordMode === 'scene' ? '场景坐标' : '自动布局'}`,
    accent: POI_PALETTE[0],
    description: guide.description || '沿路线依次抵达各点位，进入触发范围即自动讲解。',
    published: true,
    coordMode,
    pois: sorted.map((p, i) => {
      const icon = p.icon || meta(p).icon || FALLBACK_ICONS[i % FALLBACK_ICONS.length];
      const color = p.color || POI_PALETTE[i % POI_PALETTE.length];
      const radius = typeof p.triggerRadius === 'number' && p.triggerRadius > 0 ? p.triggerRadius : 0.85;
      return {
        id: p.id || `poi_${i}`,
        name: p.name || `点位 ${i + 1}`,
        subtitle: p.subtitle || `POI ${String(i + 1).padStart(2, '0')}`,
        description: p.description || '',
        narration: p.onEnter?.message || p.description || '',
        scene: [coords[i].x, 0, coords[i].z],
        triggerRadius: coordMode === 'circle' ? radius : Math.max(0.35, radius * scale),
        icon,
        color,
        duration: p.estimatedDuration || meta(p).duration || 3,
        model: p.modelUrl || meta(p).modelUrl || undefined,
        onEnter: p.onEnter,
        onExit: p.onExit,
      };
    }),
  };

  return theme;
}

/**
 * 生成导览路径控制点。
 * 与 tourData.buildPathPoints 保持同一算法，但适配「场景坐标已被缩放」的主题，
 * 因此这里直接按 POI 顺序做带外弧的插值。
 */
export { buildPathPoints as _sharedBuildPathPoints } from './tourData.js';

export default buildThemeFromPublishedGuide;
