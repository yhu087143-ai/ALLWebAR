/**
 * 模型放置器
 *
 * 移植自 D:\mothersday\frontend\src\ar\ObjectPlacer.js（已验证可用），并做两处必要改造：
 *   1. 模型 URL 可配置（mothersday 只放固定的一朵康乃馨）
 *   2. **加入包围盒归一化** —— 本项目模型原始尺度差异极大
 *      （nefertiti 高约 29 单位、fox 长约 150 单位），不归一化会变成几十米高的巨物
 *
 * 底层逻辑（WebXR AR 管线的第三、四步）：
 *   第三步 命中检测：每帧 frame.getHitTestResults(hitTestSource)
 *                    → hits[0].getPose(refSpace) 得到「射线与真实平面」的交点
 *                    → 把准星(reticle)移到该点，并记录为 lastHitPose
 *   第四步 放置：用户点击（XR select / pointerup）时，
 *                    把模型克隆到 lastHitPose 位置，并播放生长动画
 *                    若没有命中点，退化为「视线前方 1.2m」
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/** 放置后模型的默认高度（米）——约一个水杯高，适合桌面/地面摆放 */
const DEFAULT_TARGET_HEIGHT = 0.28;

/**
 * 从命中位姿中取水平偏航角：物体保持直立，只绕 Y 轴对齐命中面的朝向。
 * @param {THREE.Quaternion|null|undefined} q
 * @returns {number|null} 无法解析时返回 null
 */
function yawFromQuaternion(q) {
  if (!q) return null;
  const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  return Number.isFinite(euler.y) ? euler.y : null;
}

const modelCache = new Map();

export class ModelPlacer {
  constructor(scene) {
    this.scene = scene;
    this.placedObjects = [];
    this.onPlaced = null;
    this.targetHeight = DEFAULT_TARGET_HEIGHT;

    this._reticle = null;
    this._reticleRing = null;
    this._sourceModel = null;      // 原始模型（克隆源）
    this._normalizedHeight = 1;    // 原始模型归一化后的实际高度系数
    this.modelReady = false;
    this._disposed = false;
    this._draco = null;
  }

  // ══════════════════ 模型加载 ══════════════════

  /**
   * 加载 GLB 模型（带重试）。
   * @param {string} url
   * @param {{onReady?:Function, onProgress?:Function}} cb
   */
  loadModel(url, { onReady, onProgress } = {}) {
    if (this._disposed) return;
    this.modelReady = false;
    this._sourceModel = null;

    // 缓存命中 → 直接复用
    if (modelCache.has(url)) {
      this._sourceModel = modelCache.get(url);
      this._measure();
      this.modelReady = true;
      onReady?.();
      return;
    }

    const MAX_RETRIES = 1;
    const TIMEOUT_MS = 60000;

    if (!this._draco) {
      this._draco = new DRACOLoader();
      // 用项目自带的解码器（离线可用），与 TourScene 保持一致
      this._draco.setDecoderPath('/draco/');
    }
    const loader = new GLTFLoader();
    loader.setDRACOLoader(this._draco);

    const attempt = (retryCount) => {
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        if (retryCount < MAX_RETRIES) attempt(retryCount + 1);
        else onProgress?.({ error: `加载超时(${TIMEOUT_MS / 1000}s)` });
      }, TIMEOUT_MS);

      loader.load(
        url,
        (gltf) => {
          if (timedOut || this._disposed) return;
          clearTimeout(timeoutId);
          const root = gltf.scene || gltf;
          modelCache.set(url, root);
          this._sourceModel = root;
          this._measure();
          this.modelReady = true;
          onReady?.();
        },
        (xhr) => {
          if (timedOut) return;
          if (xhr.lengthComputable && xhr.total) {
            onProgress?.(Math.round((xhr.loaded / xhr.total) * 100));
          }
        },
        (err) => {
          if (timedOut || this._disposed) return;
          clearTimeout(timeoutId);
          if (retryCount < MAX_RETRIES) attempt(retryCount + 1);
          else onProgress?.({ error: err?.message || String(err) });
        },
      );
    };

    attempt(0);
  }

  /** 量出模型包围盒，算出把最大边缩到 targetHeight 所需的缩放系数 */
  _measure() {
    if (!this._sourceModel) { this._normalizedHeight = 1; return; }
    const box = new THREE.Box3().setFromObject(this._sourceModel);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    // 记录「原始最大边」→ 放置时 scale = targetHeight / maxDim
    this._normalizedHeight = maxDim;
    this._sourceSize = size.clone();
    this._sourceCenter = box.getCenter(new THREE.Vector3()).clone();
  }

  /** 实例化一个已归一化的模型副本（底部对齐放置点） */
  _instantiate() {
    if (!this._sourceModel) return null;
    const obj = this._sourceModel.clone(true);
    const s = this.targetHeight / (this._normalizedHeight || 1);
    obj.scale.setScalar(s);
    // 居中到原点，并把底面移到 y=0，这样「站在」平面上而不是陷进去
    const box = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    box.getCenter(center);
    obj.position.sub(center);
    obj.position.y += (box.max.y - center.y);
    obj.traverse((c) => { if (c.isMesh) c.frustumCulled = false; });
    return obj;
  }

  // ══════════════════ 准星 ══════════════════

  createReticle() {
    const group = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.035, 0.045, 32),
      new THREE.MeshBasicMaterial({
        color: 0x4f8cff, transparent: true, opacity: 0.5,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    this._reticleRing = ring;

    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.012, 16),
      new THREE.MeshBasicMaterial({
        color: 0x4f8cff, transparent: true, opacity: 0.9, depthWrite: false,
      }),
    );
    dot.rotation.x = -Math.PI / 2;
    group.add(dot);

    for (let i = 0; i < 4; i++) {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(0.025, 0.002),
        new THREE.MeshBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: 0.3, depthWrite: false }),
      );
      line.rotation.x = -Math.PI / 2;
      line.position.x = Math.cos((i * Math.PI) / 2) * 0.03;
      line.position.z = Math.sin((i * Math.PI) / 2) * 0.03;
      group.add(line);
    }

    group.visible = false;
    this.scene.add(group);
    this._reticle = group;
  }

  /**
   * 把准星放到命中点（保持水平，仅跟随命中面的水平朝向）
   * @param {THREE.Vector3} position
   * @param {THREE.Quaternion} [quaternion]
   */
  setReticleAt(position, quaternion) {
    if (!this._reticle) return;
    this._reticle.position.copy(position);
    const yaw = yawFromQuaternion(quaternion);
    if (yaw === null) this._reticle.quaternion.identity();
    else this._reticle.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this._reticle.visible = true;
  }

  hideReticle() {
    if (this._reticle) this._reticle.visible = false;
  }

  /** 准星呼吸动画 */
  update(t) {
    if (this._reticleRing) {
      const pulse = 0.4 + Math.sin(t * 0.003) * 0.15;
      this._reticleRing.material.opacity = pulse;
      this._reticleRing.scale.setScalar(1 + Math.sin(t * 0.003) * 0.1);
    }
    for (const o of this.placedObjects) o.rotation.y += 0.004;
  }

  // ══════════════════ 放置 ══════════════════

  /**
   * 把一个模型放到指定位置。
   * @returns {THREE.Object3D|null}
   */
  place(position, { scaleFactor = 1, quaternion = null } = {}) {
    const obj = this._instantiate();
    if (!obj) return null;

    obj.position.copy(position);
    obj.position.y += 0.005;                    // 轻微抬起，避免与真实平面 z-fighting
    // 有命中朝向时对齐命中面（水平朝向），否则随机朝向避免呆板
    const hitYaw = yawFromQuaternion(quaternion);
    obj.rotation.y = hitYaw === null ? Math.random() * Math.PI * 2 : hitYaw;

    // 生长动画
    const finalScale = obj.scale.x * scaleFactor;
    obj.scale.setScalar(0.001);
    this.scene.add(obj);
    this.placedObjects.push(obj);

    const grow = () => {
      if (this._disposed || !this.placedObjects.includes(obj)) return;
      const s = Math.min(obj.scale.x + finalScale * 0.12, finalScale);
      obj.scale.setScalar(s);
      if (s < finalScale - 1e-4) requestAnimationFrame(grow);
    };
    requestAnimationFrame(grow);

    this._spawnParticles(position);
    this.onPlaced?.(obj);
    return obj;
  }

  /** 调整已放置模型的缩放倍率 */
  setScaleFactor(f) {
    this.placedObjects.forEach((o) => {
      const base = this.targetHeight / (this._normalizedHeight || 1);
      o.scale.setScalar(base * f);
    });
  }

  clearAll() {
    this.placedObjects.forEach((obj) => {
      this.scene.remove(obj);
      obj.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
        }
      });
    });
    this.placedObjects = [];
  }

  // ══════════════════ 粒子特效 ══════════════════

  _spawnParticles(position) {
    const count = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = 0.05 + Math.random() * 0.1;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const c = new THREE.Color().setHSL(0.58 + Math.random() * 0.08, 0.9, 0.6);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;

      velocities.push({
        x: (Math.random() - 0.5) * 0.5,
        y: Math.random() * 0.5 + 0.2,
        z: (Math.random() - 0.5) * 0.5,
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.02, vertexColors: true, transparent: true,
      opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    points.position.copy(position);
    this.scene.add(points);

    let life = 1;
    const anim = () => {
      if (this._disposed) { this.scene.remove(points); geometry.dispose(); material.dispose(); return; }
      life -= 0.02;
      if (life <= 0) { this.scene.remove(points); geometry.dispose(); material.dispose(); return; }
      const pos = points.geometry.attributes.position.array;
      for (let i = 0; i < count; i++) {
        pos[i * 3] += velocities[i].x * 0.01;
        pos[i * 3 + 1] += velocities[i].y * 0.01;
        pos[i * 3 + 2] += velocities[i].z * 0.01;
        velocities[i].y -= 0.005;
      }
      points.geometry.attributes.position.needsUpdate = true;
      material.opacity = life * 0.8;
      points.scale.setScalar(1 + (1 - life) * 2);
      requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  dispose() {
    this._disposed = true;
    this.clearAll();
    if (this._reticle) {
      this.scene.remove(this._reticle);
      this._reticle = null;
      this._reticleRing = null;
    }
    this._sourceModel = null;
    this.modelReady = false;
  }
}

export default ModelPlacer;
