/**
 * 追踪模式模块
 * 负责：
 *   - 追踪模式选择与降级
 *   - WebXR 支持检测
 *   - 动态 import MindAR 并初始化
 */

export type TrackingType = "image" | "face" | "plane" | "world";

/**
 * 根据用户期望的追踪模式做选择
 *  - plane：检查 WebXR 支持，不支持则降级到 image
 *  - face / image：直接返回
 */
export async function selectTracking(desired: string): Promise<TrackingType> {
  // plane 不再降级，由 AREngine 统一路由到 8th Wall
  if (desired === "plane" || desired === "face") return desired as TrackingType;
  return "image";
}

/**
 * 检查浏览器是否支持 WebXR immersive-ar
 */
export async function checkWebXRSupport(): Promise<boolean> {
  if ("xr" in navigator) {
    try {
      return await (navigator as any).xr.isSessionSupported("immersive-ar");
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * 动态加载并初始化 MindAR
 *
 * @param container  挂载容器 DOM 元素
 * @param targetUrl  图片追踪目标文件路径（仅 image 模式需要）
 * @param type       追踪类型
 * @returns          MindARThree 实例
 */
export interface MindARFilterOptions {
  filterMinCF?: number;
  filterBeta?: number;
  missTolerance?: number;
  warmupTolerance?: number;
  /** 同时追踪的目标数量上限（多目标图片追踪），默认 1（mind-ar 默认值） */
  maxTrack?: number;
}

/**
 * 预热 MindAR 运行时（只加载模块并缓存，**不会**打开摄像头）。
 *
 * 之所以放在引擎里而不是前端：`mind-ar` 是引擎的 peerDependency，
 * 只安装在 ar-engine/node_modules 下。前端直接
 * `import("mind-ar/dist/...")` 会导致打包器解析失败、整个模块加载异常。
 *
 * 典型用法：用户在准备页停留时调用，等真正点「AR」时无需再等 2~3MB 下载。
 */
export async function preloadMindAR(type: TrackingType = "image"): Promise<void> {
  if (type === "image") {
    await import("mind-ar/dist/mindar-image-three.prod.js");
    return;
  }
  if (type === "face") {
    await import("mind-ar/dist/mindar-face-three.prod.js");
    return;
  }
  // plane / world 走 8th Wall，无 MindAR 模块可预热
}

export async function initMindAR(
  container: HTMLElement,
  targetUrl: string,
  type: TrackingType,
  filterOptions?: MindARFilterOptions
): Promise<any> {
  if (type === "image") {
    const { MindARThree } = await import("mind-ar/dist/mindar-image-three.prod.js");
    return new MindARThree({
      container,
      imageTargetSrc: targetUrl,
      filterMinCF: filterOptions?.filterMinCF ?? 0.001,
      filterBeta: filterOptions?.filterBeta ?? 1000,
      missTolerance: filterOptions?.missTolerance ?? 15,
      warmupTolerance: filterOptions?.warmupTolerance ?? 5,
      maxTrack: filterOptions?.maxTrack ?? 1,
    });
  }

  if (type === "face") {
    const { MindARThree } = await import("mind-ar/dist/mindar-face-three.prod.js");
    return new MindARThree({
      container,
    });
  }

  // plane 追踪走 8th Wall，不由 MindAR 处理
  throw new Error("平面追踪(plane)应使用 8th Wall，请使用 8th Wall 相关实现");
}
