/**
 * WebXR AR 会话管理
 *
 * 移植自 D:\mothersday\frontend\src\ar\ArSession.js（那套已验证可用），
 * 仅补充中文注释与「能力检测结果缓存」，逻辑保持一致。
 *
 * 底层逻辑（WebXR AR 管线的第一步）：
 *   navigator.xr.isSessionSupported('immersive-ar')   ← 检测设备能力
 *   navigator.xr.requestSession('immersive-ar', {...}) ← 建立沉浸式 AR 会话
 *   ── 之后由 three 的 renderer.xr.setSession(session) 接管渲染 ──
 *
 * 兼容性：Android Chrome（ARCore）/ Samsung Internet。
 *        iOS Safari 未实现 WebXR，isSessionSupported 会返回 false。
 */

/** 会话所需/可选特性 */
export const AR_SESSION_FEATURES = {
  // 必须有：local 参考空间（相对起始位置的 6DoF 追踪）
  requiredFeatures: ['local'],
  // 可选：命中检测、平面检测、DOM 覆盖层、地面高度、光照估计
  optionalFeatures: [
    'local-floor',
    'hit-test',
    'plane-detection',
    'dom-overlay',
    'light-estimation',
  ],
};

export class ArSession {
  constructor() {
    this.session = null;
    this.onSessionEnded = null;
    /** 本会话实际可用的参考空间类型：'local-floor' | 'local' */
    this.referenceSpaceType = 'local';
  }

  /** 设备是否支持沉浸式 AR */
  static async isSupported() {
    if (!navigator.xr) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-ar');
    } catch {
      return false;
    }
  }

  /**
   * 启动 AR 会话。
   * @param {HTMLElement} [overlayRoot] 需要常驻显示的 DOM 覆盖层（不传则 AR 中 DOM 会被隐藏）
   */
  async start(overlayRoot) {
    if (!navigator.xr) throw new Error('当前浏览器没有 WebXR API（navigator.xr 不存在）');

    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) {
      throw new Error(
        '当前设备不支持 immersive-ar 会话。需要 Android + Chrome + ARCore；iOS Safari 不支持 WebXR。',
      );
    }

    const options = {
      requiredFeatures: [...AR_SESSION_FEATURES.requiredFeatures],
      optionalFeatures: [...AR_SESSION_FEATURES.optionalFeatures],
    };
    // 关键：没有 dom-overlay，AR 期间页面 DOM（HUD/按钮/提示）会被浏览器全部隐藏
    if (overlayRoot) options.domOverlay = { root: overlayRoot };

    this.session = await navigator.xr.requestSession('immersive-ar', options);

    // 关键：three 的 setSession 会去请求 setReferenceSpaceType 指定的参考空间。
    // 'local-floor' 是可选特性，浏览器没授予时 requestReferenceSpace('local-floor')
    // 会 reject → 整个 AR 启动失败（表现为点了按钮没反应/直接报错）。
    // 所以这里按「实际授予的特性」决定用哪个参考空间。
    const granted = this.session.enabledFeatures || [];
    this.referenceSpaceType = granted.includes('local-floor') ? 'local-floor' : 'local';
    console.log('[AR] 参考空间:', this.referenceSpaceType, '已授予特性:', granted.join(', '));

    this.session.addEventListener('end', () => {
      this.session = null;
      if (this.onSessionEnded) this.onSessionEnded();
    });

    return this.session;
  }

  async end() {
    if (this.session) {
      try { await this.session.end(); } catch { /* 已被浏览器结束 */ }
      this.session = null;
    }
  }
}

export default ArSession;
