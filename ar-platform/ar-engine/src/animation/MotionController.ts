import * as THREE from 'three';

/**
 * 程序化动效配置。
 *
 * 与 `AnimationConfig.clips` 的区别很重要：
 *  - `clips` 播的是 **GLB 自带的动画片段**（美术在 DCC 里做好的骨骼/变换动画）
 *  - `motion` 是**引擎每帧算出来的变换** —— 不需要模型自带任何动画，
 *    所以「用户上传一个完全静态的 GLB」也能让它自转 / 悬浮 / 进场生长
 *
 * 单位约定：速度用「度/秒」（对人友好），幅度用**米**，周期用**秒**。
 */
export interface MotionConfig {
  /** 绕轴自转；speed 为度/秒，负值反向 */
  spin?: { axis?: 'x' | 'y' | 'z'; speed: number };
  /** 上下悬浮：amplitude 米，period 秒走完一个完整来回 */
  float?: { amplitude: number; period: number };
  /** 缩放脉冲：在 1 上下摆动 ±amplitude，period 秒一个周期 */
  pulse?: { amplitude: number; period: number };
  /** 进场方式：scale 弹出 / rise 从下方升起 */
  entrance?: 'none' | 'scale' | 'rise';
  /** 进场时长（秒），默认 0.6 */
  entranceDuration?: number;
}

const DEG2RAD = Math.PI / 180;

/** easeOutBack：收尾有轻微过冲，比线性更有"弹出来"的手感 */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * 把程序化动效施加到一个**专用的**三维对象上。
 *
 * ⚠️ 调用方必须为它单独建一层 group（见 `AREngine` 里的 `__MotionLayer__`）：
 * `positionOffset` 占用 wrapper.position、`scale` 占用 wrapper.scale、
 * 拖拽旋转（TouchRotator）占用 wrapper.quaternion —— 共用同一个对象会互相覆盖。
 */
export class MotionController {
  private readonly target: THREE.Object3D;
  private readonly config: MotionConfig;
  /** 悬浮是以「初始位置」为基准的往复，不是绝对位移 */
  private readonly baseY: number;
  private elapsed = 0;
  private _entranceDone: boolean;

  constructor(target: THREE.Object3D, config?: MotionConfig | null) {
    this.target = target;
    this.config = config ?? {};
    this.baseY = target.position.y;
    this._entranceDone = !this.config.entrance || this.config.entrance === 'none';

    if (!this._entranceDone) {
      // 首帧就摆到"未出现"的状态，否则会先闪一下完整尺寸
      if (this.config.entrance === 'scale') this.target.scale.setScalar(0.001);
      if (this.config.entrance === 'rise') this.target.position.y = this.baseY - RISE_OFFSET;
    }
  }

  /** 是否真的配置了动效 —— 全空时上层不必每帧调用 */
  get active(): boolean {
    const c = this.config;
    return Boolean(c.spin?.speed || c.float?.amplitude || c.pulse?.amplitude || !this._entranceDone);
  }

  update(delta: number): void {
    if (!this.active) return;
    // 标签页切回来时 delta 可能是好几秒，钳一下避免物体"瞬间转了半圈"
    const dt = Math.min(delta, 0.1);
    this.elapsed += dt;

    const { spin, float, pulse, entrance, entranceDuration = 0.6 } = this.config;

    if (spin?.speed) {
      const axis = spin.axis ?? 'y';
      this.target.rotation[axis] += spin.speed * DEG2RAD * dt;
    }

    if (float?.amplitude && float.period > 0) {
      const phase = (this.elapsed / float.period) * Math.PI * 2;
      this.target.position.y = this.baseY + Math.sin(phase) * float.amplitude;
    }

    // 进场与脉冲都要改 scale，进场未结束前先让位给进场，避免两者打架
    if (pulse?.amplitude && pulse.period > 0 && this._entranceDone) {
      const phase = (this.elapsed / pulse.period) * Math.PI * 2;
      this.target.scale.setScalar(1 + Math.sin(phase) * pulse.amplitude);
    }

    if (!this._entranceDone) {
      const t = Math.min(1, this.elapsed / Math.max(0.05, entranceDuration));
      if (entrance === 'scale') {
        this.target.scale.setScalar(Math.max(0.001, easeOutBack(t)));
      } else if (entrance === 'rise') {
        this.target.position.y = this.baseY - RISE_OFFSET * (1 - t);
      }
      if (t >= 1) {
        this._entranceDone = true;
        // 归位到精确值，避免累积误差让模型长期偏大/偏低
        if (entrance === 'scale') this.target.scale.setScalar(1);
        if (entrance === 'rise') this.target.position.y = this.baseY;
      }
    }
  }

  /** 供调试与自动化断言读取当前姿态 */
  get state(): {
    elapsed: number;
    active: boolean;
    entranceDone: boolean;
    rotationY: number;
    positionY: number;
    scale: number;
  } {
    return {
      elapsed: this.elapsed,
      active: this.active,
      entranceDone: this._entranceDone,
      rotationY: this.target.rotation.y,
      positionY: this.target.position.y,
      scale: this.target.scale.x,
    };
  }

  dispose(): void {
    this.elapsed = 0;
  }
}

/** rise 进场的起始下沉量（米） */
const RISE_OFFSET = 0.4;
