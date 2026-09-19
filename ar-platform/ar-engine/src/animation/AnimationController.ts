import * as THREE from 'three';

export interface AnimationConfig {
  enabled: boolean;
  defaultClip?: string;
  clips?: string[];
  interaction?: {
    type: 'tap' | 'none';
    action: 'next_animation' | 'toggle_animation' | 'link' | 'reset';
    target?: string;
  };
}

export class AnimationController {
  private mixer: THREE.AnimationMixer;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private _currentClip: string | null = null;
  private _playing = false;
  /** 按顺序循环切换到下一个 clip */
  private _clipQueue: string[] = [];
  private _clipIndex = 0;

  constructor(model: THREE.Group, animations: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of animations) {
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
    }
    this._clipQueue = this.clipNames;
  }

  get currentClip(): string | null { return this._currentClip; }
  get playing(): boolean { return this._playing; }
  get clipNames(): string[] { return Array.from(this.actions.keys()); }
  get mixerInstance(): THREE.AnimationMixer { return this.mixer; }

  play(name: string, fadeIn = 0.3) {
    const action = this.actions.get(name);
    if (!action) {
      console.warn(`[AnimationController] clip "${name}" 不存在，可用: ${this.clipNames.join(', ')}`);
      return;
    }
    // 淡出当前动画
    if (this._currentClip) {
      const prev = this.actions.get(this._currentClip);
      if (prev) prev.fadeOut(fadeIn);
    }
    action.reset().fadeIn(fadeIn).play();
    this._currentClip = name;
    this._playing = true;
    // 更新队列索引
    const idx = this._clipQueue.indexOf(name);
    if (idx >= 0) this._clipIndex = idx;
  }

  playDefault(fadeIn = 0) {
    if (this.actions.size > 0) {
      const name = this.clipNames[0];
      const action = this.actions.get(name);
      if (action) {
        action.reset().play();
        this._currentClip = name;
        this._playing = true;
      }
    }
  }

  /** 播放下一个 clip（循环），用于点击切换 */
  playNext(fadeIn = 0.3) {
    if (this._clipQueue.length === 0) return;
    this._clipIndex = (this._clipIndex + 1) % this._clipQueue.length;
    this.play(this._clipQueue[this._clipIndex], fadeIn);
  }

  pause() {
    this.mixer.timeScale = 0;
    this._playing = false;
  }

  resume() {
    this.mixer.timeScale = 1;
    this._playing = true;
  }

  stop(fadeOut = 0.3) {
    this.stopAll(fadeOut);
  }

  stopAll(fadeOut = 0.3) {
    this.actions.forEach(a => a.fadeOut(fadeOut).stop());
    this._currentClip = null;
    this._playing = false;
  }

  update(delta: number) {
    if (this._playing && this.mixer) {
      this.mixer.update(delta);
    }
  }

  dispose() {
    this.actions.forEach(a => a.stop());
    this.actions.clear();
    this.mixer = null as any;
  }
}
