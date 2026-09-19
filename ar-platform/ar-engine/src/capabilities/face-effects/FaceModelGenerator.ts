/**
 * FaceModelGenerator
 *
 * 用 Three.js 原生几何体组合生成面部 AR 内容（零外部 GLB 依赖）。
 * 每个方法返回一个 THREE.Group，可直接放入锚点 group。
 *
 * 设计原则：
 * - 所有几何体在创建时即定位好相对位置，外部只需要 setScale
 * - 材质颜色/透明度可通过参数覆盖
 * - 生成器本身不持有状态，可安全复用
 */
import * as THREE from 'three';

export type FaceModelType = 'glasses' | 'mask' | 'crown' | 'mustache' | 'blush' | 'eyepatch';

export interface GeneratorOptions {
  color?: string;
  opacity?: number;
  metalness?: number;
}

const DEFAULTS = {
  glasses: { color: '#4a5568', opacity: 0.85 },
  mask: { color: '#6b7280', opacity: 0.7 },
  crown: { color: '#f59e0b', opacity: 1, metalness: 0.6 },
  mustache: { color: '#374151', opacity: 1 },
  blush: { color: '#f472b6', opacity: 0.45 },
  eyepatch: { color: '#1f2937', opacity: 0.9 },
};

export class FaceModelGenerator {
  /**
   * 根据类型生成对应的 Three 几何体组合
   */
  static generate(type: FaceModelType, options?: GeneratorOptions): THREE.Group {
    switch (type) {
      case 'glasses': return this._glasses(options);
      case 'mask': return this._mask(options);
      case 'crown': return this._crown(options);
      case 'mustache': return this._mustache(options);
      case 'blush': return this._blush(options);
      case 'eyepatch': return this._eyepatch(options);
    }
  }

  // ── 眼镜框 ──
  private static _glasses(opts?: GeneratorOptions): THREE.Group {
    const g = new THREE.Group();
    const c = opts?.color || DEFAULTS.glasses.color;
    const o = opts?.opacity ?? DEFAULTS.glasses.opacity;
    const frameMat = new THREE.MeshStandardMaterial({ color: c, transparent: o < 1, opacity: o, roughness: 0.3, metalness: 0.1 });
    const lensMat = new THREE.MeshStandardMaterial({ color: '#a0aec0', transparent: true, opacity: 0.15, roughness: 0.1, metalness: 0.3 });

    // 左镜框
    const leftRing = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 12, 24), frameMat);
    leftRing.position.set(-0.055, 0, 0);
    g.add(leftRing);

    // 右镜框
    const rightRing = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 12, 24), frameMat);
    rightRing.position.set(0.055, 0, 0);
    g.add(rightRing);

    // 左镜片
    const leftLens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 20), lensMat);
    leftLens.position.set(-0.055, 0, 0.002);
    g.add(leftLens);

    // 右镜片
    const rightLens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 20), lensMat);
    rightLens.position.set(0.055, 0, 0.002);
    g.add(rightLens);

    // 鼻梁连接
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), frameMat);
    bridge.position.set(0, -0.01, 0);
    g.add(bridge);

    // 眼镜腿（简化）
    const armMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.006, 0.04), armMat);
    lArm.position.set(-0.065, 0, -0.025);
    g.add(lArm);
    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.006, 0.04), armMat);
    rArm.position.set(0.065, 0, -0.025);
    g.add(rArm);

    return g;
  }

  // ── 口罩 ──
  private static _mask(opts?: GeneratorOptions): THREE.Group {
    const g = new THREE.Group();
    const c = opts?.color || DEFAULTS.mask.color;
    const o = opts?.opacity ?? DEFAULTS.mask.opacity;

    // 主口罩体（弯曲平面 + 褶皱效果）
    const shape = new THREE.Shape();
    shape.moveTo(-0.08, 0);
    shape.quadraticCurveTo(-0.08, 0.06, 0, 0.07);
    shape.quadraticCurveTo(0.08, 0.06, 0.08, 0);
    shape.quadraticCurveTo(0.08, -0.06, 0, -0.07);
    shape.quadraticCurveTo(-0.08, -0.06, -0.08, 0);

    const extrudeSettings = { depth: 0.005, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 4 };
    const maskBody = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, extrudeSettings), new THREE.MeshStandardMaterial({
      color: c, transparent: o < 1, opacity: o, roughness: 0.8,
      side: THREE.DoubleSide,
    }));
    maskBody.position.z = -0.005;
    g.add(maskBody);

    // 褶皱线（装饰）
    const lineMat = new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: o * 0.6 });
    for (let i = -1; i <= 1; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.002, 0.006), lineMat);
      line.position.set(0, i * 0.025, 0.003);
      g.add(line);
    }

    // 耳挂绳
    const strapMat = new THREE.MeshStandardMaterial({ color: '#4a5568', roughness: 0.6 });
    const lStrap = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.002, 6, 12), strapMat);
    lStrap.position.set(-0.09, 0, 0);
    lStrap.rotation.x = Math.PI / 2;
    g.add(lStrap);
    const rStrap = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.002, 6, 12), strapMat);
    rStrap.position.set(0.09, 0, 0);
    rStrap.rotation.x = Math.PI / 2;
    g.add(rStrap);

    return g;
  }

  // ── 皇冠 ──
  private static _crown(opts?: GeneratorOptions): THREE.Group {
    const g = new THREE.Group();
    const c = opts?.color || DEFAULTS.crown.color;
    const m = opts?.metalness ?? DEFAULTS.crown.metalness;
    const mat = new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: 0.3 });

    // 底座圆环
    const base = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.012, 12, 24), mat);
    base.position.y = 0;
    g.add(base);

    // 尖刺
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.045, 6), mat);
      spike.position.set(Math.cos(angle) * 0.065, 0.025, Math.sin(angle) * 0.065);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(angle), 0.5, Math.sin(angle)).normalize());
      g.add(spike);
    }

    // 顶部装饰球
    const topMat = new THREE.MeshStandardMaterial({ color: '#ef4444', metalness: 0.3, roughness: 0.4 });
    const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), topMat);
    jewel.position.set(0, 0.06, 0);
    g.add(jewel);

    g.position.y = 0.04;
    return g;
  }

  // ── 胡子 ──
  private static _mustache(opts?: GeneratorOptions): THREE.Group {
    const g = new THREE.Group();
    const c = opts?.color || DEFAULTS.mustache.color;
    const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });

    // 两侧胡子（压扁的球体）
    const left = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), mat);
    left.scale.set(0.8, 0.5, 0.4);
    left.position.set(-0.035, 0, 0);
    g.add(left);

    const right = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), mat);
    right.scale.set(0.8, 0.5, 0.4);
    right.position.set(0.035, 0, 0);
    g.add(right);

    // 中间
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), mat);
    center.scale.set(0.7, 0.5, 0.3);
    center.position.set(0, -0.005, 0);
    g.add(center);

    // 胡子尖
    const tipMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
    const tipL = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.025, 6), tipMat);
    tipL.position.set(-0.06, -0.015, 0);
    tipL.rotation.z = 0.3;
    g.add(tipL);
    const tipR = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.025, 6), tipMat);
    tipR.position.set(0.06, -0.015, 0);
    tipR.rotation.z = -0.3;
    g.add(tipR);

    return g;
  }

  // ── 腮红 ──
  private static _blush(opts?: GeneratorOptions): THREE.Group {
    const g = new THREE.Group();
    const c = opts?.color || DEFAULTS.blush.color;
    const o = opts?.opacity ?? DEFAULTS.blush.opacity;
    const mat = new THREE.MeshStandardMaterial({
      color: c, transparent: true, opacity: o,
      roughness: 0.5, side: THREE.DoubleSide, depthWrite: false,
    });

    // 左侧腮红
    const left = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), mat);
    left.position.set(-0.055, -0.01, 0.001);
    g.add(left);

    // 右侧腮红
    const right = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), mat);
    right.position.set(0.055, -0.01, 0.001);
    g.add(right);

    return g;
  }

  // ── 单眼罩 ──
  private static _eyepatch(opts?: GeneratorOptions): THREE.Group {
    const g = new THREE.Group();
    const c = opts?.color || DEFAULTS.eyepatch.color;
    const o = opts?.opacity ?? DEFAULTS.eyepatch.opacity;
    const mat = new THREE.MeshStandardMaterial({ color: c, transparent: o < 1, opacity: o, roughness: 0.7, side: THREE.DoubleSide });

    // 眼罩主体（半球）
    const patch = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.z = -0.005;
    g.add(patch);

    // 边缘
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 8, 20), mat);
    g.add(rim);

    // 带子
    const strapMat = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.8 });
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.008, 0.002), strapMat);
    strap.position.set(0, 0, -0.015);
    g.add(strap);

    return g;
  }
}
