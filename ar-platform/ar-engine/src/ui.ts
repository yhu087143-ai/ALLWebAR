/**
 * UI 模块
 * 纯 DOM 实现，不依赖任何 UI 框架。
 * 包括：开始按钮遮罩层、loading 动画、错误提示
 *
 * 使用 Deep Space 主题 (./styles.css)
 */

import type { ARConfig } from "./config";

/* ==================== 相机图标 SVG ==================== */

const cameraIconSvg = `<svg class="ar-start-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

/* ==================== 追踪描述文案 ==================== */

function getTrackingDescription(tracking: string, hasModel: boolean): string {
  const descMap: Record<string, string> = {
    image: "将摄像头对准识别图，即可看到 3D 模型",
    face: "将摄像头对准人脸，开始 AR 体验",
    plane: "将摄像头对准平面，放置 3D 模型",
  };
  return descMap[tracking] || descMap.image;
}

function getTrackingHint(hasModel: boolean): string {
  return hasModel ? "模型已就绪" : "等待模型加载...";
}

/* ==================== 接口 ==================== */

export interface ARUI {
  /** 移除开始遮罩层 */
  removeStartOverlay: () => void;
  /** 显示/隐藏 loading */
  setLoading: (show: boolean) => void;
}

/* ==================== 创建开始遮罩层 ==================== */

/**
 * 创建"开始 AR 体验"遮罩层
 *
 * @param container  父容器
 * @param config     AR 配置（用于显示描述文案）
 * @param onStart    用户点击开始时的回调
 * @returns          ARUI 控制接口
 */
export function createStartOverlay(
  container: HTMLElement,
  config: ARConfig,
  onStart: () => void
): ARUI {
  // ---- 遮罩层 ----
  const overlay = document.createElement("div");
  overlay.className = "ar-start-overlay";

  const content = document.createElement("div");
  content.className = "ar-start-content";

  // 图标
  const iconBox = document.createElement("div");
  iconBox.className = "ar-start-icon-box";
  iconBox.innerHTML = cameraIconSvg;
  content.appendChild(iconBox);

  // 标题
  const title = document.createElement("div");
  title.className = "ar-start-title";
  title.innerHTML = '<span class="gradient-text">AR 体验</span>';
  content.appendChild(title);

  // 描述
  const desc = document.createElement("div");
  desc.className = "ar-start-desc";
  desc.textContent = getTrackingDescription(config.tracking, !!config.modelUrl);
  content.appendChild(desc);

  // 提示
  const hint = document.createElement("div");
  hint.className = "ar-start-hint";
  hint.textContent = getTrackingHint(!!config.modelUrl);
  content.appendChild(hint);

  // 按钮
  const button = document.createElement("button");
  button.className = "ar-start-btn";
  const btnSpan = document.createElement("span");
  btnSpan.textContent = "开始 AR 体验";
  button.appendChild(btnSpan);
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    onStart();
  });
  content.appendChild(button);

  overlay.appendChild(content);
  container.appendChild(overlay);

  // ---- loading 元素 ----
  const loadingEl = document.createElement("div");
  loadingEl.className = "ar-loading";
  const spinner = document.createElement("div");
  spinner.className = "ar-spinner";
  loadingEl.appendChild(spinner);
  const bar = document.createElement("div");
  bar.className = "ar-loading-bar";
  bar.innerHTML = '<div class="fill"></div>';
  loadingEl.appendChild(bar);
  const loadingText = document.createElement("div");
  loadingText.className = "ar-loading-text";
  loadingText.textContent = "正在准备 AR 体验...";
  loadingEl.appendChild(loadingText);
  loadingEl.style.display = "none";
  container.appendChild(loadingEl);

  return {
    removeStartOverlay: () => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    },
    setLoading: (show: boolean) => {
      loadingEl.style.display = show ? "flex" : "none";
    },
  };
}

/* ==================== 错误提示 ==================== */

/**
 * 显示错误提示（自动 5 秒后消失）
 */
export function showError(container: HTMLElement, message: string): void {
  // 移除已有错误
  const existing = container.querySelector(".ar-error-toast");
  if (existing) existing.parentNode?.removeChild(existing);

  const errorEl = document.createElement("div");
  errorEl.className = "ar-error-toast";

  // 警告图标
  const warnSvg = document.createElement("span");
  warnSvg.className = "ar-error-icon";
  warnSvg.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  errorEl.appendChild(warnSvg);

  const text = document.createElement("span");
  text.className = "ar-error-text";
  text.textContent = message;
  errorEl.appendChild(text);

  container.appendChild(errorEl);

  // 自动消失
  setTimeout(() => {
    if (errorEl.parentNode) errorEl.parentNode.removeChild(errorEl);
  }, 5000);
}
