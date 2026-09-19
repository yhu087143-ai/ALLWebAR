/**
 * TourScene —— AR 导览的三维沙盘场景
 *
 * 同一套场景同时用于两种模式：
 *   1) AR 模式：挂到 MindAR 的 anchor group 上，跟随导览卡出现
 *   2) 沙盘模式：挂到独立渲染器，用鼠标自由观察
 *
 * 场景由以下元素组成：
 *   - 导览底板（含网格与发光边框）
 *   - 每个 POI：底座光环 + 编号立柱 + 悬浮发光球 + 光柱 + （可选）展品模型
 *   - 导览路线（管状曲线）
 *   - 虚拟游客（胶囊 + 朝向锥 + 地面光环）
 *
 * 只负责「画」，不负责导览逻辑 —— 导览逻辑由引擎的 GuideEngine 驱动。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { BOARD_SIZE, buildPathPoints } from './tourData.js';

const loader = new GLTFLoader();
// 部分展品模型（如 helmet-compressed.glb）使用 Draco 压缩，需挂载解码器
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');
loader.setDRACOLoader(dracoLoader);
/** 展品模型缓存，避免重复下载解析 */
const modelCache = new Map();

function loadModel(url) {
  if (modelCache.has(url)) return modelCache.get(url);
  const p = new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => {
        console.warn('[TourScene] 展品模型加载失败:', url, err?.message || err);
        resolve(null);
      },
    );
  });
  modelCache.set(url, p);
  return p;
}

/**
 * 用 canvas 生成 POI 标签贴图（名称首字 + 编号）
 *
 * 这里刻意不画表情符号：Canvas 上的 emoji 渲染结果随系统字体变化，
 * 在部分安卓机上会变成空白方块。改用名称首字，信息量更高也更稳。
 */
function makeLabelTexture(label, index, color) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // 圆底
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8,10,24,0.82)';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = color;
  ctx.stroke();

  // 编号
  ctx.fillStyle = color;
  ctx.font = 'bold 62px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index).padStart(2, '0'), size / 2, size * 0.34);

  // 名称首字
  const glyph = String(label || '').trim().charAt(0);
  if (glyph) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 74px system-ui, sans-serif';
    ctx.fillText(glyph, size / 2, size * 0.7);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * @param {object} theme  来自 tourData 的主题对象
 * @returns {object}      场景控制器
 */
export function createTourScene(theme) {
  const disposables = [];
  const track = (obj) => {
    disposables.push(obj);
    return obj;
  };

  const group = new THREE.Group();
  group.name = 'TourSceneRoot';

  // ── 灯光 ──
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x0a0a18, 1.5);
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(2.5, 5, 3);
  const rim = new THREE.PointLight(theme.accent ? new THREE.Color(theme.accent) : 0x6366f1, 24, 14);
  rim.position.set(-3, 3.2, -3);
  group.add(hemi, key, rim);

  // ── 导览底板 ──
  const boardMat = track(new THREE.MeshStandardMaterial({
    color: 0x0d1030,
    roughness: 0.55,
    metalness: 0.25,
    transparent: true,
    opacity: 0.94,
  }));
  const boardGeo = track(new THREE.BoxGeometry(BOARD_SIZE, 0.08, BOARD_SIZE));
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.position.y = -0.05;
  board.receiveShadow = true;
  group.add(board);

  // 底板发光边框
  const frameGeo = track(new THREE.EdgesGeometry(boardGeo));
  const frameMat = track(new THREE.LineBasicMaterial({
    color: new THREE.Color(theme.accent || '#6366f1'),
    transparent: true,
    opacity: 0.85,
  }));
  const frame = new THREE.LineSegments(frameGeo, frameMat);
  frame.position.copy(board.position);
  group.add(frame);

  // 网格
  const grid = new THREE.GridHelper(BOARD_SIZE, 19, 0x2a3170, 0x1a1f4a);
  grid.position.y = 0.006;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  track(grid.material);
  track(grid.geometry);
  group.add(grid);

  // ── 导览路线（管状曲线） ──
  const pathPts = buildPathPoints(theme).map((p) => new THREE.Vector3(p.x, 0.03, p.z));
  const curve = new THREE.CatmullRomCurve3(pathPts, true, 'catmullrom', 0.4);
  const tubeGeo = track(new THREE.TubeGeometry(curve, 260, 0.014, 8, true));
  const tubeMat = track(new THREE.MeshBasicMaterial({
    color: new THREE.Color(theme.accent || '#6366f1'),
    transparent: true,
    opacity: 0.5,
  }));
  const routeTube = new THREE.Mesh(tubeGeo, tubeMat);
  group.add(routeTube);

  // ── POI 节点 ──
  const poiNodes = new Map();

  theme.pois.forEach((poi, i) => {
    const color = new THREE.Color(poi.color);
    const node = new THREE.Group();
    node.position.set(poi.scene[0], 0, poi.scene[2]);
    node.userData = { poiId: poi.id, baseY: 0 };

    // 底座光环
    const ringGeo = track(new THREE.RingGeometry(0.30, 0.40, 48));
    const ringMat = track(new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.42, side: THREE.DoubleSide,
    }));
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    node.add(ring);

    // 底座圆盘
    const discGeo = track(new THREE.CircleGeometry(0.30, 40));
    const discMat = track(new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.18),
      transparent: true, opacity: 0.55, roughness: 0.4, metalness: 0.3,
    }));
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.01;
    node.add(disc);

    // 立柱
    const pillarGeo = track(new THREE.CylinderGeometry(0.018, 0.026, 0.46, 12));
    const pillarMat = track(new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.6,
    }));
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 0.23;
    node.add(pillar);

    // 悬浮发光球
    const orbGeo = track(new THREE.SphereGeometry(0.062, 24, 20));
    const orbMat = track(new THREE.MeshBasicMaterial({ color }));
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.y = 0.56;
    node.add(orb);

    // 光柱
    const beamGeo = track(new THREE.CylinderGeometry(0.05, 0.12, 1.5, 18, 1, true));
    const beamMat = track(new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.13,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 0.78;
    node.add(beam);

    // 标签精灵
    const labelTex = track(makeLabelTexture(poi.name, i + 1, poi.color));
    const labelMat = track(new THREE.SpriteMaterial({
      map: labelTex, transparent: true, depthWrite: false, depthTest: false,
    }));
    const label = new THREE.Sprite(labelMat);
    label.scale.set(0.42, 0.42, 0.42);
    label.position.y = 0.92;
    node.add(label);

    // 展品模型（懒加载，到达后淡入）
    const holder = new THREE.Group();
    holder.position.y = 0.24;
    holder.visible = false;
    holder.name = `exhibit_${poi.id}`;
    node.add(holder);
    if (poi.model) {
      loadModel(poi.model).then((scene) => {
        if (!scene) return;
        const obj = scene.clone(true);
        // 归一化到 ~0.34 单位高
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const s = 0.34 / maxDim;
        obj.scale.setScalar(s);
        const box2 = new THREE.Box3().setFromObject(obj);
        const center = new THREE.Vector3();
        box2.getCenter(center);
        obj.position.sub(center);          // 居中
        obj.position.y += 0.30;            // 抬到底座上方
        obj.traverse((c) => {
          if (c.isMesh) {
            c.frustumCulled = false;
          }
        });
        holder.add(obj);
      });
    }

    group.add(node);
    poiNodes.set(poi.id, {
      group: node, ring, disc, pillar, orb, beam, label, holder,
      visited: false,
      active: false,
      color,
    });
  });

  // ── 虚拟游客 ──
  const visitor = new THREE.Group();
  visitor.name = 'visitor';

  const bodyGeo = track(new THREE.CapsuleGeometry(0.055, 0.16, 6, 14));
  const bodyMat = track(new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0x8ea2ff, emissiveIntensity: 0.5, roughness: 0.35,
  }));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.16;
  visitor.add(body);

  const coneGeo = track(new THREE.ConeGeometry(0.075, 0.16, 20));
  const coneMat = track(new THREE.MeshStandardMaterial({
    color: 0x4f8cff, emissive: 0x4f8cff, emissiveIntensity: 0.85, roughness: 0.25,
  }));
  const nose = new THREE.Mesh(coneGeo, coneMat);
  nose.rotation.x = Math.PI / 2;      // 朝 +z
  nose.position.set(0, 0.16, 0.14);
  visitor.add(nose);

  const haloGeo = track(new THREE.RingGeometry(0.09, 0.15, 32));
  const haloMat = track(new THREE.MeshBasicMaterial({
    color: 0x4f8cff, transparent: true, opacity: 0.65, side: THREE.DoubleSide,
  }));
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.012;
  visitor.add(halo);
  visitor.userData.halo = halo;

  group.add(visitor);

  // ── 状态更新 ──
  let clockT = 0;

  const api = {
    group,
    visitor,

    /** 每帧调用：处理悬浮动画与辉光呼吸 */
    update(dt = 0.016) {
      clockT += dt;
      const pulse = 0.5 + 0.5 * Math.sin(clockT * 2.4);

      poiNodes.forEach((n) => {
        const bob = Math.sin(clockT * 1.8 + n.color.r * 6) * 0.022;
        n.orb.position.y = 0.56 + bob;
        n.label.position.y = 0.92 + bob;
        n.orb.scale.setScalar(n.active ? 1.5 : 1);
        n.ring.material.opacity = n.active
          ? 0.55 + 0.35 * pulse
          : n.visited ? 0.16 : 0.36;
        n.beam.material.opacity = n.active ? 0.24 + 0.10 * pulse : n.visited ? 0.05 : 0.12;
        n.pillar.material.emissiveIntensity = n.active ? 0.9 : 0.45;
        if (n.holder) {
          const show = n.active || n.visited;
          n.holder.visible = show && n.holder.children.length > 0;
          n.holder.rotation.y += dt * 0.55;
          n.holder.position.y = 0.24 + Math.sin(clockT * 1.4) * 0.012;
        }
      });

      halo.scale.setScalar(1 + 0.12 * pulse);
    },

    /** 高亮当前目标 POI */
    setActive(poiId) {
      poiNodes.forEach((n, id) => { n.active = id === poiId; });
    },

    /** 标记已访问 */
    markVisited(poiId) {
      const n = poiNodes.get(poiId);
      if (n) n.visited = true;
    },

    /** 重置访问状态 */
    resetProgress() {
      poiNodes.forEach((n) => { n.visited = false; n.active = false; });
    },

    /** 移动虚拟游客（米） */
    setVisitor(x, z, headingRad) {
      visitor.position.set(x, 0, z);
      visitor.rotation.y = headingRad || 0;
    },

    /** 缩放整体（AR 模式下按卡片大小微调） */
    setScale(s) {
      group.scale.setScalar(s);
    },

    dispose() {
      group.traverse((obj) => {
        if (obj.isMesh || obj.isLine || obj.isLineSegments || obj.isSprite) {
          obj.geometry?.dispose?.();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
          else { m?.map?.dispose?.(); m?.dispose?.(); }
        }
      });
      disposables.forEach((d) => d?.dispose?.());
      disposables.length = 0;
      poiNodes.clear();
      group.clear();
    },

    /** 暴露节点表，便于外部做点击拾取 */
    get nodes() {
      return poiNodes;
    },
  };

  return api;
}

export default createTourScene;
