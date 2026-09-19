/**
 * AR 配置模块
 * 从 URL 查询参数中读取 AR 配置，支持：
 *  - model  : 模型 URL（.glb 文件）
 *  - tracking : 追踪类型（image / face / plane）
 *  - scale  : 模型缩放倍数
 *  - position : 模型位置（x,y,z 逗号分隔）
 *  - target : 图片追踪目标文件路径
 */

import type { MotionConfig } from './animation/MotionController';

export interface ARConfig {
  /** 3D 模型 .glb 文件的 URL */
  modelUrl: string;
  /** 视频 URL（提供时替代 3D 模型，显示视频播放平面） */
  videoUrl?: string;
  /** 追踪类型：image / face / plane / world */
  tracking: string;
  /** 引擎类型：mindar / 8thwall / camera / auto（默认 mindar） */
  engine?: 'mindar' | '8thwall' | 'camera' | 'auto';
  /** 模型缩放倍数，默认 1 */
  scale: number;
  /** 模型位置 [x, y, z]，默认 [0, 0, 0] */
  position: [number, number, number];
  /** 图片追踪的目标文件（.mind）路径 */
  targetUrl: string;
  /** 追踪滤波器：低频截止 (default 0.001) — 越小越平滑 */
  filterMinCF?: number;
  /** 追踪滤波器：速度系数 (default 10) — 越大响应越快 */
  filterBeta?: number;
  /** 追踪丢失容限（帧数），默认 15 — 越大越不容易因短暂遮挡触发丢失 */
  missTolerance?: number;
  /** 追踪预热容限（帧数），默认 3 — 目标稳定确认帧数 */
  warmupTolerance?: number;
  /** 同时追踪的目标数量上限（多目标图片追踪），默认 1。
   *  需要多目标 .mind 文件（包含多个 target）配合使用；
   *  单目标 .mind 保持默认 1 即可。 */
  maxTrack?: number;
  /** 3DAR 期1：多目标激活切换回调（内容重挂到新 target 的 anchor 时触发） */
  onActiveTargetChange?: (index: number) => void;
  /** 冻结模式：首次检测到目标后锁定位姿，默认 true */
  freezeOnDetect?: boolean;
  /** 平面检测放置模式：horizontal/vertical/any */
  planeMode?: 'horizontal' | 'vertical' | 'any';
  /** 面部特征点索引（面部追踪模式下模型放置位置） */
  faceFeature?: number;
  /** 全景穹顶（AR 版 720°）：平面放置后由 toggleDome() 显形的沉浸穹顶 */
  domeConfig?: {
    /** 全景贴图（等距柱状 2:1）；缺省用内置程序化星穹 */
    textureUrl?: string;
    /** 穹顶半径（米），默认 8 */
    radius?: number;
    /** 展开时最大不透明度，默认 0.94 */
    maxOpacity?: number;
    /** 展开时循环播放的环境音（空间音频，声源在穹顶中心上方） */
    ambienceUrl?: string;
  };
  /** 面部区域配置（面部追踪多区域模式） */
  faceZones?: Array<{
    zoneId: string;
    enabled: boolean;
    contentType: 'model' | 'video';
    /** 内容来源: url(外部模型) / generated(引擎内置几何体) / decal(上传贴图) */
    contentSource: 'url' | 'generated' | 'decal';
    /** 内置几何体类型（contentSource=generated 时生效） */
    generatedType: 'glasses' | 'mask' | 'crown' | 'mustache' | 'blush' | 'eyepatch' | 'none';
    /** 上传贴图 URL（contentSource=decal 时生效） */
    decalUrl?: string;
    modelUrl: string;
    videoUrl: string;
    scale: number;
    landmarks: number[];
  }>;
  /** Madgwick 滤波器增益（越小越平滑但延迟越大），默认 0.1 */
  madgwickBeta?: number;
  /** 模型位置偏移量（相对于锚点） */
  positionOffset?: { x: number; y: number; z: number };
  /** 动画配置 */
  animation?: {
    enabled: boolean;
    defaultClip?: string;
    clips?: string[];
    interaction?: {
      type: 'tap' | 'none';
      action: 'next_animation' | 'toggle_animation' | 'link' | 'reset';
      target?: string;
    };
    /**
     * 程序化动效（自转 / 悬浮 / 脉冲 / 进场），由引擎每帧驱动。
     * 与上面的 clips 互不影响：clips 播 GLB 自带片段，motion 不依赖模型有没有动画。
     */
    motion?: MotionConfig;
  };
}

/**
 * 从 URL 查询参数读取配置
 */
export function getConfigFromURL(): ARConfig {
  const params = new URLSearchParams(window.location.search);

  return {
    modelUrl: params.get("model") || "",
    tracking: params.get("tracking") || "image",
    scale: parseFloat(params.get("scale") || "1"),
    position: parsePosition(params.get("position")),
    targetUrl: params.get("target") || "/targets/default.mind",
    animation: (() => { try { const a = params.get('animation'); return a ? JSON.parse(a) : undefined; } catch { return undefined; } })(),
  };
}

/**
 * 解析 "x,y,z" 格式的位置参数
 * 非法值时返回默认 [0, 0, 0]
 */
function parsePosition(posStr: string | null): [number, number, number] {
  if (!posStr) return [0, 0, 0];
  const parts = posStr.split(",").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return [0, 0, 0];
  return parts as [number, number, number];
}
