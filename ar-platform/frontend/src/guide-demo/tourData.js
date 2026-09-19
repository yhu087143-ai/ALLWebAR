/**
 * AR 导览 — 内置演示数据
 *
 * 每个 POI 使用 `manual` 场景坐标（单位：米），这样导览逻辑可以完全在
 * 浏览器内跑通（AR 沙盘 / 无摄像头沙盘），不依赖 GPS 权限或真实场地。
 *
 * 坐标系约定：底板平面为 XZ 平面，y 轴向上，原点为「序厅」。
 */

/** 场景中的单位尺度：底板边长（米） */
export const BOARD_SIZE = 7.6;

/** 内置导览主题 */
export const TOUR_THEMES = [
  {
    id: 'museum',
    name: '数字展馆导览',
    subtitle: '1XR 虚拟展馆 · 五展位',
    accent: '#6366f1',
    description: '扫描导览卡，在桌面沙盘上依次参观五个展位，每到一个展位自动弹出讲解。',
    pois: [
      {
        id: 'poi-entrance',
        name: '序厅 · 迎宾门',
        subtitle: 'EXHIBIT 01',
        description: '展馆主入口，此处可领取语音导览设备。',
        narration: '欢迎来到 1XR 数字展馆。请沿着光路前行，依次参观五个展位。',
        scene: [0, 0, 0],
        triggerRadius: 0.85,
        icon: 'door',
        color: '#6366f1',
        duration: 1,
      },
      {
        id: 'poi-egypt',
        name: '古埃及厅 · 娜芙蒂蒂',
        subtitle: 'EXHIBIT 02',
        description: '公元前 1345 年，石灰岩彩绘半身像。',
        narration: '这是古埃及王后娜芙蒂蒂的半身像，被誉为古代雕塑的巅峰之作。',
        scene: [2.4, 0, 0.8],
        triggerRadius: 0.85,
        icon: 'crown',
        color: '#f59e0b',
        duration: 3,
        model: '/models/nefertiti-head.glb',
      },
      {
        id: 'poi-armor',
        name: '兵器厅 · 青铜战盔',
        subtitle: 'EXHIBIT 03',
        description: '战国时期青铜胄，表面保留原始铸造纹理。',
        narration: '青铜战盔由整块青铜范铸而成，盔顶的脊线用于分散冲击力。',
        scene: [1.6, 0, -2.2],
        triggerRadius: 0.85,
        icon: 'shield',
        color: '#22d3ee',
        duration: 3,
        model: '/models/helmet-compressed.glb',
      },
      {
        id: 'poi-fox',
        name: '生态厅 · 灵狐标本',
        subtitle: 'EXHIBIT 04',
        description: '赤狐生态标本，展示林间捕食姿态。',
        narration: '赤狐是分布最广的食肉目动物之一，听觉可探测雪下 30 厘米的猎物。',
        scene: [-1.6, 0, -2.2],
        triggerRadius: 0.85,
        icon: 'fox',
        color: '#ec4899',
        duration: 3,
        model: '/models/fox.glb',
      },
      {
        id: 'poi-shop',
        name: '尾厅 · 文创商店',
        subtitle: 'EXHIBIT 05',
        description: '导览终点，可兑换数字纪念徽章。',
        narration: '参观结束，感谢您的到访，前方是文创商店与数字纪念徽章领取处。',
        scene: [-2.4, 0, 0.8],
        triggerRadius: 0.85,
        icon: 'gift',
        color: '#a855f7',
        duration: 2,
      },
    ],
  },
  {
    id: 'scenic',
    name: '城市景区导览',
    subtitle: '滨江公园 · 五景点',
    accent: '#22d3ee',
    description: '沿滨江步道依次经过五个观景点，AR 叠加景点信息与导航指引。',
    pois: [
      {
        id: 'poi-center',
        name: '游客中心',
        subtitle: 'SPOT 01',
        description: '景区主入口，提供地图与咨询服务。',
        narration: '欢迎来到滨江公园，本路线全程约 1.2 公里，预计 25 分钟。',
        scene: [0, 0, 0],
        triggerRadius: 0.85,
        icon: 'info',
        color: '#22d3ee',
        duration: 1,
      },
      {
        id: 'poi-pavilion',
        name: '望江亭',
        subtitle: 'SPOT 02',
        description: '临江六角亭，最佳观潮位置。',
        narration: '望江亭建于清代，是观赏江潮的第一处高点。',
        scene: [2.6, 0, -1.2],
        triggerRadius: 0.85,
        icon: 'torii',
        color: '#6366f1',
        duration: 4,
        model: '/models/nefertiti-head.glb',
      },
      {
        id: 'poi-stage',
        name: '古戏台',
        subtitle: 'SPOT 03',
        description: '木构戏台，藻井保存完好。',
        narration: '戏台藻井为全榫卯结构，可形成天然声场，无需扩音设备。',
        scene: [0.6, 0, -2.8],
        triggerRadius: 0.85,
        icon: 'drama',
        color: '#f59e0b',
        duration: 4,
        model: '/models/helmet-compressed.glb',
      },
      {
        id: 'poi-bamboo',
        name: '竹林栈道',
        subtitle: 'SPOT 04',
        description: '架空木栈道穿过毛竹林。',
        narration: '栈道采用架空设计，避免踩踏竹林根系，全长 320 米。',
        scene: [-2.2, 0, -2.0],
        triggerRadius: 0.85,
        icon: 'bamboo',
        color: '#10b981',
        duration: 3,
        model: '/models/fox.glb',
      },
      {
        id: 'poi-view',
        name: '观景平台',
        subtitle: 'SPOT 05',
        description: '悬挑观景台，可俯瞰全江。',
        narration: '观景平台向外悬挑 8 米，是本次导览的终点。',
        scene: [-2.6, 0, 0.6],
        triggerRadius: 0.85,
        icon: 'sunrise',
        color: '#ec4899',
        duration: 3,
      },
    ],
  },
];

/** 按 id 取主题 */
export function getTheme(id) {
  return TOUR_THEMES.find((t) => t.id === id) || TOUR_THEMES[0];
}

/**
 * 把主题转换为 GuideEngine 需要的 GuideRoute 结构。
 * 位置全部使用 `manual` + scenePosition，因此 GuideEngine 会用
 * 三维场景距离做邻近判定（见 GuideEngine._checkProximity）。
 */
export function buildGuideRoute(theme) {
  return {
    id: `route_${theme.id}`,
    name: theme.name,
    description: theme.description,
    positionProvider: 'manual',
    pois: theme.pois.map((p, i) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      position: { type: 'manual', scenePosition: p.scene },
      triggerRadius: p.triggerRadius,
      autoTrigger: true,
      order: i + 1,
      estimatedDuration: p.duration,
      onEnter: { type: 'show_message', message: p.narration },
    })),
  };
}

/**
 * 生成导览路径曲线用的控制点。
 * 在相邻 POI 之间插值出中间点，并轻微外扩，让「虚拟游客」沿弧线行走。
 */
export function buildPathPoints(theme, segmentsPerLeg = 14) {
  const pts = theme.pois.map((p) => ({ x: p.scene[0], z: p.scene[2] }));
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    for (let s = 0; s < segmentsPerLeg; s++) {
      const t = s / segmentsPerLeg;
      const nx = a.x + (b.x - a.x) * t;
      const nz = a.z + (b.z - a.z) * t;
      // 向外微弧，避免路径穿过中心
      const bulge = Math.sin(t * Math.PI) * 0.35;
      const len = Math.hypot(nx, nz) || 1;
      out.push({ x: nx + (nx / len) * bulge, z: nz + (nz / len) * bulge });
    }
  }
  out.push({ ...out[0] });
  return out;
}
