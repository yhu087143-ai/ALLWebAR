/**
 * M13 · 3D 空间音频（Web Audio PannerNode + HRTF）
 *
 * 用途：导览/交互音效带"声源方向感"——声音从 POI 的场景位置发出，
 * 用户转头/走动时声像随相对方位变化。iOS Safari 全平台可跑（纯 Web Audio）。
 *
 * 注意：
 * - AudioContext 必须在用户手势后 resume（自动播放策略），首次 play 时懒创建并 resume。
 * - 坐标系约定与 three.js 一致：相机看向 -Z；heading 为自北顺时针角度时
 *   forward = (sin(h), 0, -cos(h))。
 * - speechSynthesis 的输出无法路由进 WebAudio，因此 TTS 语音不适用本模块；
 *   仅支持音频文件（mp3/ogg 等）。
 */

export interface SpatialAudioPosition {
  x: number;
  y: number;
  z: number;
}

interface PlayingEntry {
  source: AudioBufferSourceNode;
  panner: PannerNode;
}

export class SpatialAudioManager {
  private _ctx: AudioContext | null = null;
  private _buffers = new Map<string, AudioBuffer>();
  private _playing = new Set<PlayingEntry>();
  private _refDistance = 1.5;
  private _maxDistance = 25;
  private _enabled = true;

  setEnabled(v: boolean): void {
    this._enabled = v;
    if (!v) this.stopAll();
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /** 懒创建 AudioContext（必须在用户手势调用链里首次触发） */
  private _ensureContext(): AudioContext | null {
    if (!this._enabled) return null;
    try {
      if (!this._ctx) {
        const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!Ctx) return null;
        this._ctx = new Ctx();
      }
      if (this._ctx.state === 'suspended') {
        void this._ctx.resume();
      }
      return this._ctx;
    } catch {
      return null;
    }
  }

  /** 预加载音频文件（可选；playAt 也会自动加载并缓存） */
  async preload(src: string): Promise<void> {
    const ctx = this._ensureContext();
    if (!ctx || this._buffers.has(src)) return;
    const res = await fetch(src);
    const buf = await res.arrayBuffer();
    this._buffers.set(src, await ctx.decodeAudioData(buf));
  }

  /**
   * 在场景位置播放一段音频。
   * @param position 声源的场景坐标（米）；不传则按普通非空间音频播放
   * @param loop     是否循环（背景音效）
   * @returns 停止函数
   */
  playAt(
    src: string,
    position?: SpatialAudioPosition,
    opts?: { loop?: boolean; volume?: number; refDistance?: number }
  ): (() => void) | null {
    const ctx = this._ensureContext();
    if (!ctx) return null;

    const startSource = (buffer: AudioBuffer): (() => void) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = opts?.loop ?? false;

      const gain = ctx.createGain();
      gain.gain.value = opts?.volume ?? 0.9;

      let node: AudioNode = gain;
      if (position) {
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = opts?.refDistance ?? this._refDistance;
        panner.maxDistance = this._maxDistance;
        panner.rolloffFactor = 1;
        panner.positionX.value = position.x;
        panner.positionY.value = position.y;
        panner.positionZ.value = position.z;
        gain.connect(panner);
        node = panner;
      }
      source.connect(gain);
      node.connect(ctx.destination);

      const entry: PlayingEntry = { source, panner: node as PannerNode };
      this._playing.add(entry);
      source.onended = () => this._playing.delete(entry);
      source.start();

      return () => {
        try {
          source.stop();
        } catch {
          /* 已结束 */
        }
        this._playing.delete(entry);
      };
    };

    const cached = this._buffers.get(src);
    if (cached) return startSource(cached);

    // 异步加载；返回的停止函数对未启动的播放是 no-op
    let stopFn: (() => void) | null = null;
    void (async () => {
      try {
        const res = await fetch(src);
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        this._buffers.set(src, buf);
        if (this._enabled) stopFn = startSource(buf);
      } catch {
        /* 加载失败静默 */
      }
    })();
    return () => stopFn?.();
  }

  /** 更新听者位姿（每帧或位姿变化时调用）。heading：自北顺时针角度（磁北/真北） */
  setListener(position: SpatialAudioPosition, headingDeg: number): void {
    const ctx = this._ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const rad = (headingDeg * Math.PI) / 180;
    // heading 0 → 面向 -Z（与 three.js 相机默认朝向一致）；顺时针偏转
    const fx = Math.sin(rad);
    const fz = -Math.cos(rad);
    try {
      if (l.positionX) {
        l.positionX.value = position.x;
        l.positionY.value = position.y;
        l.positionZ.value = position.z;
        l.forwardX.value = fx;
        l.forwardY.value = 0;
        l.forwardZ.value = fz;
        l.upX.value = 0;
        l.upY.value = 1;
        l.upZ.value = 0;
      } else {
        // 旧 API 回退（iOS 14 之前的老 Safari）
        (l as any).setPosition(position.x, position.y, position.z);
        (l as any).setOrientation(fx, 0, fz, 0, 1, 0);
      }
    } catch {
      /* 忽略 */
    }
  }

  /** 停止全部播放 */
  stopAll(): void {
    for (const e of this._playing) {
      try {
        e.source.stop();
      } catch {
        /* 忽略 */
      }
    }
    this._playing.clear();
  }

  dispose(): void {
    this.stopAll();
    void this._ctx?.close();
    this._ctx = null;
    this._buffers.clear();
  }
}
