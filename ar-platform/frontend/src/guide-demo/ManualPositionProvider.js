/**
 * ManualPositionProvider — 场景坐标位置提供器
 *
 * 实现引擎的 IPositionProvider 接口（`@ar-platform/engine` 的 GuideEngine 依赖它）。
 * 用于「沙盘模式」与「AR 图片追踪模式」：由 Three.js 场景里虚拟游客的坐标
 * 驱动 GuideEngine 做邻近判定，从而触发 poiEnter / poiExit。
 *
 * 与引擎内置的 GPSPositionProvider 相比，它不依赖真实定位，因此
 * 在任何浏览器（含桌面端）都能完整演示导览流程。
 */
export class ManualPositionProvider {
  constructor({ name = 'manual', fps = 30 } = {}) {
    this._name = name;
    this._fps = fps;
    this._cb = null;
    this._timer = null;
    this._running = false;
    this._pos = { x: 0, y: 0, z: 0, heading: 0 };
    this._last = null;
  }

  get name() {
    return this._name;
  }

  get available() {
    return true;
  }

  /** 设置虚拟游客坐标（米），并立即向 GuideEngine 推送一帧 */
  setPosition(x, y, z, heading = 0) {
    this._pos = { x, y, z, heading };
    this._emit();
  }

  /** 当前坐标 */
  get position() {
    return { ...this._pos };
  }

  onPosition(callback) {
    this._cb = callback;
    return () => {
      if (this._cb === callback) this._cb = null;
    };
  }

  start() {
    if (this._running) return;
    this._running = true;
    // 以固定频率推送位置，模拟定位设备的采样流
    this._timer = setInterval(() => this._emit(), Math.max(1000 / this._fps, 16));
    this._emit();
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  getCurrentPosition() {
    return Promise.resolve(this._snapshot());
  }

  // ── internal ──
  _emit() {
    if (!this._cb) return;
    this._last = this._snapshot();
    try {
      this._cb(this._last);
    } catch (err) {
      console.error('[ManualPositionProvider] position callback error:', err);
    }
  }

  _snapshot() {
    return {
      timestamp: Date.now(),
      heading: this._pos.heading,
      accuracy: 0.3,
      sceneX: this._pos.x,
      sceneY: this._pos.y,
      sceneZ: this._pos.z,
    };
  }
}

export default ManualPositionProvider;
