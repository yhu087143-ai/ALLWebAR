/**
 * Three.js 场景 + WebXR 渲染器
 *
 * 移植自 D:\mothersday\frontend\src\ar\SceneSetup.js，逻辑保持一致。
 *
 * 底层逻辑（WebXR AR 管线的第二步）：
 *   1. WebGLRenderer 必须用同一个 canvas（AR 会话会接管它的帧缓冲）
 *   2. renderer.xr.enabled = true
 *   3. renderer.xr.setReferenceSpaceType('local-floor') → 以「地面」为原点
 *   4. renderer.xr.setSession(session) → 把渲染管线交给浏览器 XR 合成器
 *   5. 渲染循环必须用 renderer.setAnimationLoop(cb)（不能用 requestAnimationFrame）
 *      —— 因为 XR 帧由 session.requestAnimationFrame 驱动，rAF 在沉浸式 AR 里不触发
 */

import * as THREE from 'three';

export class SceneSetup {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }

  init() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      100,
    );

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,                 // 透明背景 → 透出摄像头实景
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    // 默认用 local（所有 immersive-ar 会话都支持）；真正的类型在 connectToXr
    // 里按会话实际授予的特性覆盖（见 ArSession.referenceSpaceType）
    renderer.xr.setReferenceSpaceType('local');

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    // ── 灯光：环境 + 半球 + 双向平行光，保证 GLB 贴图颜色正确 ──
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const hemi = new THREE.HemisphereLight(0xffeef1, 0xffccdd, 0.7);
    this.scene.add(hemi);

    const dl = new THREE.DirectionalLight(0xffffff, 1.0);
    dl.position.set(5, 10, 7);
    this.scene.add(dl);

    const dl2 = new THREE.DirectionalLight(0xffdddd, 0.5);
    dl2.position.set(-3, 2, -4);
    this.scene.add(dl2);
  }

  /** 把 XR 会话交给 three（会建立 XRWebGLLayer 并接管渲染循环） */
  async connectToXr(xrSession, referenceSpaceType = 'local') {
    this.renderer.xr.setReferenceSpaceType(referenceSpaceType);
    await this.renderer.xr.setSession(xrSession);
  }

  getReferenceSpace() {
    return this.renderer.xr.getReferenceSpace();
  }

  /** 启动 XR 渲染循环；回调每帧拿到 frame（用于 hit-test） */
  startRenderLoop(callback) {
    this.renderer.setAnimationLoop((timestamp, frame) => {
      callback({
        scene: this.scene,
        camera: this.camera,
        renderer: this.renderer,
        frame,
        timestamp,
      });
      this.renderer.render(this.scene, this.camera);
    });
  }

  stopRenderLoop() {
    this.renderer.setAnimationLoop(null);
  }

  dispose() {
    this.stopRenderLoop();
    while (this.scene?.children.length) {
      const c = this.scene.children[0];
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
      }
      this.scene.remove(c);
    }
    this.scene?.clear();
    this.renderer?.dispose();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }
}

export default SceneSetup;
