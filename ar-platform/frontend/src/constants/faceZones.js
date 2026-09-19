/**
 * 面部追踪 — 区域定义
 *
 * 每个区域映射到一组 MindAR 人脸特征点（landmark index）。
 * 用户可为每个区域分别指定内容（3D 模型 / 视频），
 * 未分配内容的区域在 AR 中不会显示。
 *
 * 特征点索引参考：
 *   0   = 鼻尖
 *   1   = 上嘴唇
 *   13  = 下巴
 *   67  = 左眼
 *   297 = 右眼
 *   10  = 额头
 *   168 = 鼻梁
 */

export const FACE_ZONES = [
  {
    id: 'glasses',
    name: '眼镜',
    description: '覆盖双眼及鼻梁区域，适合放置眼镜、墨镜等',
    landmarks: [67, 297, 168],
    color: '#4f8cff',
  },
  {
    id: 'fullface',
    name: '全脸',
    description: '覆盖整个面部区域，适合放置面具、全脸特效等',
    landmarks: [0, 1, 13, 67, 297, 10, 168],
    color: '#ff6b6b',
  },
  {
    id: 'mouth',
    name: '嘴巴',
    description: '覆盖嘴部区域，适合放置胡子、口罩等',
    landmarks: [1, 13],
    color: '#ffa94d',
  },
  {
    id: 'nose',
    name: '鼻子',
    description: '鼻子区域',
    landmarks: [0, 168],
    color: '#69db7c',
  },
  {
    id: 'left-eye',
    name: '左眼',
    description: '左眼区域',
    landmarks: [67],
    color: '#74c0fc',
  },
  {
    id: 'right-eye',
    name: '右眼',
    description: '右眼区域',
    landmarks: [297],
    color: '#74c0fc',
  },
];

/** 默认选中的区域 ID */
export const DEFAULT_ZONE_ID = 'glasses';

/** 创建空的区域配置 */
export function createEmptyZoneConfig(zoneId) {
  const def = getZoneDef(zoneId);
  return {
    zoneId,
    enabled: false,
    contentType: 'model',
    contentSource: 'url',
    generatedType: 'none',
    decalUrl: '',
    modelUrl: '',
    scale: 1,
    landmarks: [...def.landmarks],
  };
}

/** 创建包含所有区域的完整配置数组 */
export function createDefaultFaceZones() {
  return FACE_ZONES.map((z) => createEmptyZoneConfig(z.id));
}

/** 将旧版 faceFeature 数值转换为 zones 配置（向后兼容） */
export function legacyFaceFeatureToZones(faceFeatureIndex) {
  const zones = createDefaultFaceZones();
  // 找到包含该特征点的区域
  for (const z of zones) {
    const zoneDef = FACE_ZONES.find((d) => d.id === z.zoneId);
    if (zoneDef && zoneDef.landmarks.includes(faceFeatureIndex)) {
      z.enabled = true;
      break;
    }
  }
  // 如果没有匹配的区域，启用默认区域
  if (!zones.some((z) => z.enabled)) {
    const defaultZone = zones.find((z) => z.zoneId === DEFAULT_ZONE_ID);
    if (defaultZone) defaultZone.enabled = true;
  }
  return zones;
}

/** 获取区域定义 */
export function getZoneDef(zoneId) {
  return FACE_ZONES.find((z) => z.id === zoneId) || FACE_ZONES[0];
}

// ─── 区域组合预设 ─────────────────────────────

/**
 * 预设定义：一键启用多个关联区域
 * 用于眼镜试戴、口罩试戴等常见场景
 */
export const ZONE_PRESETS = [
  {
    id: 'glasses-tryon',
    name: '眼镜试戴',
    description: '眼镜 + 双眼 + 鼻梁，适合试戴眼镜、墨镜',
    zones: ['glasses', 'left-eye', 'right-eye', 'nose'],
    icon: 'glasses',
  },
  {
    id: 'mask-tryon',
    name: '口罩试戴',
    description: '嘴巴 + 鼻子，适合口罩、胡须、嘴部特效',
    zones: ['mouth', 'nose'],
    icon: 'mask',
  },
  {
    id: 'fullface-effect',
    name: '全脸特效',
    description: '全脸 + 鼻子，适合面具、全脸滤镜',
    zones: ['fullface', 'nose'],
    icon: 'drama',
  },
  {
    id: 'eye-makeup',
    name: '眼部妆容',
    description: '双眼 + 鼻梁，适合眼影、眼镜框',
    zones: ['left-eye', 'right-eye', 'glasses'],
    icon: 'eye',
  },
  {
    id: 'custom',
    name: '自定义',
    description: '手动选择各区域',
    zones: null, // null = 全部手动，不清除已有选择
    icon: 'pencil',
  },
];

/** 应用预设：返回新的 faceZones 数组 */
export function applyPreset(presetId, faceZones) {
  const preset = ZONE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return faceZones;

  // "自定义" 预设不做任何改动
  if (presetId === 'custom') return faceZones;

  return faceZones.map((z) => ({
    ...z,
    enabled: preset.zones.includes(z.zoneId),
  }));
}
