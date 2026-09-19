/**
 * 姊妹项目模块 —— 前端表现层定义
 * ---------------------------------------------------------------------------
 * 拓扑（端口 / 协议 / 入口路径 / 是否本机）由后端 `/api/modules` 提供，
 * 这里只放「长什么样」：图标、配色、文案、标签。
 *
 * 为什么这么分：
 * 以前端口写在 Home.jsx 里，服务换端口后前端不会知道，就出现死链
 * （导览写 3100 实际 3010、手势写 3200 实际 3011、平面写 4300 实际 8080）。
 * 现在端口只有后端一处定义；前端就算全删了也只是少几个图标，不会给出错误地址。
 *
 * `embed` 表示该模块能否用 iframe 内嵌进主站：
 *   true  —— 无摄像头依赖，或已在同源代理下（可安全内嵌）
 *   false —— 重度依赖摄像头。iOS Safari 对跨源 iframe 里的 getUserMedia
 *            限制很严，强行内嵌大概率是一片黑；默认引导新窗口打开。
 */

import { Layers, Compass, Hand, Move3d, Boxes, Cpu, Box } from 'lucide-react';

export const MODULE_VIEW = {
  engine: {
    icon: Layers,
    accent: 'text-emerald-300',
    ring: 'ring-emerald-400/25',
    glow: 'rgba(52,211,153,0.32)',
    blurb: '图片 / 人脸 / 平面 / 世界四路追踪，导览与游戏引擎',
    tags: ['MindAR', 'GuideEngine', 'GuideHUD'],
    embed: true,
  },
  tour: {
    icon: Compass,
    accent: 'text-cyan-300',
    ring: 'ring-cyan-400/25',
    glow: 'rgba(56,189,248,0.32)',
    /*
     * 已并入主站。
     *
     * 原来这里指向 D:\ar-tour-guide（3010）那个独立站点，它是本平台早期的重复实现。
     * 用户要求「不再开窗口」后，导览由主站自己的能力承担：
     * 编排 /create-guide、演示 /guide-demo、已发布 /guide/:id。
     * 后端 /api/modules 把它的 status 标成 integrated（而不是 down），
     * 所以卡片不会显示成「没起来」。
     */
    blurb: 'POI 路线编排 + 位置触发讲解，已并入主站',
    tags: ['GuideEngine', 'POI', '位置触发'],
    embed: true,
  },
  hand: {
    icon: Hand,
    accent: 'text-violet-300',
    ring: 'ring-violet-400/25',
    glow: 'rgba(167,139,250,0.34)',
    blurb: 'MediaPipe 手部 21 关键点 + ONNX 手势分类',
    tags: ['MediaPipe', 'ONNX', '21 关键点'],
    embed: false,
    camera: true,
  },
  plane: {
    icon: Move3d,
    accent: 'text-fuchsia-300',
    ring: 'ring-fuchsia-400/25',
    glow: 'rgba(240,171,252,0.32)',
    blurb: 'WebXR 命中放置 + WebXR Depth API 实时遮挡',
    tags: ['WebXR', 'Depth', 'Occlusion'],
    embed: false,
    camera: true,
  },
  card: {
    icon: Boxes,
    accent: 'text-amber-300',
    ring: 'ring-amber-400/25',
    glow: 'rgba(252,211,77,0.3)',
    blurb: '单件模型平面放置，含粒子特效',
    tags: ['WebXR', 'GLTF', 'Particles'],
    embed: false,
    camera: true,
  },
  xr: {
    icon: Box,
    accent: 'text-sky-300',
    ring: 'ring-sky-400/25',
    glow: 'rgba(125,211,252,0.3)',
    blurb: '节点式 3D 编辑器，导出的 GLB 可直接在本平台发布',
    tags: ['three.js', 'ECS', 'GPGPU'],
    embed: true,
  },
  gen3d: {
    icon: Cpu,
    accent: 'text-slate-300',
    ring: 'ring-white/15',
    glow: 'rgba(148,163,184,0.26)',
    blurb: 'FLUX.2 文生图，再经 TRELLIS.2 生成 3D 模型',
    tags: ['FLUX.2', 'TRELLIS.2', 'FastAPI'],
    embed: false,
  },
};

/**
 * 按「访问者当前所在主机」拼出模块地址。
 *
 * 关键：绝不能用写死的 localhost —— 手机上打开主站时，localhost 指的是手机自己，
 * 内嵌的 iframe 与跳转链接都会失败。这里统一取 window.location.hostname，
 * 电脑访问得到 localhost，手机访问得到局域网 IP，两边都对。
 */
export function moduleUrl(mod, hostname) {
  if (!mod || !mod.port) return null;
  if (mod.self) return '/';
  const host = hostname || (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  return `${mod.protocol}://${host}:${mod.port}${mod.path || '/'}`;
}

/** 状态文案与配色：只认后端给的状态，不再有写死的 'running' */
export const STATUS_META = {
  up: { text: '运行中', dot: 'bg-emerald-400', tone: 'text-emerald-300' },
  down: { text: '未启动', dot: 'bg-slate-600', tone: 'text-slate-500' },
  manual: { text: '需手动启动', dot: 'bg-amber-400/70', tone: 'text-amber-300/80' },
  // 已并入主站：不是「没起来」，而是不需要单独起。措辞要让人一眼看出区别。
  integrated: { text: '已并入主站', dot: 'bg-cyan-400/80', tone: 'text-cyan-300' },
};
