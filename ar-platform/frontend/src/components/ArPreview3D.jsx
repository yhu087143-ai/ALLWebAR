import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');
dracoLoader.setWorkerLimit(4);

const FEATURE_POSITIONS = {
  0:   { x: 0,    y: 0.05, z: 0.38 },
  1:   { x: 0,    y: 0.0,  z: 0.42 },
  13:  { x: 0,    y: -0.15,z: 0.35 },
  67:  { x: -0.16,y: 0.12, z: 0.35 },
  297: { x: 0.16, y: 0.12, z: 0.35 },
  10:  { x: 0,    y: 0.28, z: 0.30 },
  168: { x: 0,    y: 0.1,  z: 0.38 },
};

/** 根据追踪类型和偏移计算模型的目标位置 */
function calcModelPos(trackingType, position, faceFeature) {
  const offset = position || { x: 0, y: 0, z: 0 };
  switch (trackingType) {
    case 'image':
      return { x: offset.x, y: 0.1 + offset.y + 0.05, z: offset.z };
    case 'face': {
      const feat = FEATURE_POSITIONS[faceFeature ?? 0] || FEATURE_POSITIONS[0];
      return { x: feat.x + offset.x, y: feat.y + offset.y, z: feat.z + offset.z };
    }
    case 'plane':
      return { x: offset.x, y: 0.05 + offset.y, z: offset.z };
    case 'world':
    default:
      return { x: offset.x, y: 0.15 + offset.y, z: offset.z };
  }
}

export default function ArPreview3D({ modelUrl, trackingType, scale = 1, position, faceFeature, targetPreview = '', faceZones }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);   // { scene, renderer, controls, ro, markerGroup }
  const modelRef = useRef(null);   // THREE.Group — 模型包装组
  const cardImgRef = useRef(null); // 追踪卡片上的图像 Mesh（用于更新目标图片纹理）
  const headModelRef = useRef(null); // THREE.Group — 面部预览头部模型
  const modelUrlRef = useRef(modelUrl);
  modelUrlRef.current = modelUrl; // track latest URL for stale-callback guard
  const zoneObjsRef = useRef([]); // { zoneId, group }[] — 面部内置素材对象

  // ── Setup scene ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth || 400;
    const h = container.clientHeight || 300;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1b2b);

    const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 10);
    camera.position.set(1.2, 0.6, 1.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.8;
    controls.maxDistance = 3.5;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dl = new THREE.DirectionalLight(0xffffff, 1.2);
    dl.position.set(2, 3, 4);
    scene.add(dl);
    const fl = new THREE.DirectionalLight(0x8888ff, 0.3);
    fl.position.set(-1, 1, -2);
    scene.add(fl);
    const rl = new THREE.DirectionalLight(0xffffff, 0.2);
    rl.position.set(0, -1, -2);
    scene.add(rl);

    // Grid
    const grid = new THREE.GridHelper(1.5, 10, 0x4f8cff, 0x4f8cff);
    grid.position.y = -0.15;
    grid.material.transparent = true;
    grid.material.opacity = 0.2;
    scene.add(grid);

    // ── Scene context ──
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);

    if (trackingType === 'image') {
      // Horizontal card — simulates the tracked target image
      const cardMat = new THREE.MeshStandardMaterial({ color: 0x334466, roughness: 0.5, metalness: 0.2 });
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.005, 0.22), cardMat);
      card.position.y = -0.1;
      scene.add(card);
      cardImgRef.current = card; // 指向卡片本身，上传图片后替换卡片纹理
      // Border
      const border = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.3, 0.005, 0.22)),
        new THREE.LineBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: 0.15 })
      );
      border.position.y = -0.1;
      scene.add(border);
      // No phone indicator — clean preview of just the card + model
    } else if (trackingType === 'face') {
      // 椭圆球体作为面部参考（便于观察区域映射）
      const headGroup = new THREE.Group();
      headGroup.position.y = 0.05;
      scene.add(headGroup);
      headModelRef.current = headGroup;
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 32, 32),
        new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.6 })
      );
      sphere.scale.set(1, 1.35, 0.85);
      headGroup.add(sphere);
      // Face markers
      for (const [idx, pos] of Object.entries(FEATURE_POSITIONS)) {
        const isSel = parseInt(idx) === (faceFeature ?? 0);
        const g = new THREE.Mesh(
          new THREE.RingGeometry(0.025, 0.04, 16),
          new THREE.MeshBasicMaterial({
            color: isSel ? 0x4f8cff : 0x888888, transparent: true,
            opacity: isSel ? 0.6 : 0.2, side: THREE.DoubleSide,
          })
        );
        g.position.set(pos.x, pos.y, pos.z);
        g.lookAt(0, 0.05, 0);
        markerGroup.add(g);
        const d = new THREE.Mesh(
          new THREE.CircleGeometry(0.015, 12),
          new THREE.MeshBasicMaterial({ color: isSel ? 0x4f8cff : 0x999999, side: THREE.DoubleSide })
        );
        d.position.set(pos.x, pos.y, pos.z + 0.001);
        d.lookAt(0, 0.05, 0);
        markerGroup.add(d);
      }
    } else if (trackingType === 'plane') {
      // Ground circle + ring
      const plane = new THREE.Mesh(
        new THREE.CircleGeometry(0.3, 32),
        new THREE.MeshBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = -0.08;
      scene.add(plane);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.18, 32),
        new THREE.MeshBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.07;
      scene.add(ring);
    }

    sceneRef.current = { scene, camera, renderer, controls, markerGroup };

    // ── Animation loop ──
    let running = true;
    (function animate() {
      if (!running) return;
      requestAnimationFrame(animate);
      controls.update();
      if (modelRef.current) modelRef.current.rotation.y += 0.01;
      renderer.render(scene, camera);
    })();

    // ── Resize ──
    const ro = new ResizeObserver(() => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    });
    ro.observe(container);
    sceneRef.current.ro = ro;

    return () => {
      running = false;
      controls.dispose();
      ro.disconnect();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
      if (headModelRef.current) {
        headModelRef.current.traverse((obj) => {
          if (obj.isMesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material?.dispose();
          }
        });
        scene.remove(headModelRef.current);
        headModelRef.current = null;
      }
      cardImgRef.current = null;
    };
  }, [trackingType, faceFeature]);

  // ── Load / reload model ──
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    const { scene } = state;

    // Clear old model
    if (modelRef.current) {
      scene.remove(modelRef.current);
      modelRef.current.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material?.dispose();
        }
      });
      modelRef.current = null;
    }

    const targetPos = calcModelPos(trackingType, position, faceFeature);

    // ── Model content ──
    if (modelUrl) {
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);
      loader.load(
        modelUrl,
        (gltf) => {
          if (modelUrlRef.current !== modelUrl) return;
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          model.position.copy(center).negate();
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const autoScale = maxDim > 0 ? 0.12 / maxDim : 1;

          const wrapper = new THREE.Group();
          wrapper.position.set(targetPos.x, targetPos.y, targetPos.z);
          wrapper.scale.setScalar((scale || 1) * autoScale);
          wrapper.userData.autoScale = autoScale;
          wrapper.add(model);
          scene.add(wrapper);
          modelRef.current = wrapper;
          console.log('[ArPreview3D] 模型加载成功:', modelUrl, '节点数:', model.children.length);
        },
        undefined,
        (err) => {
          if (modelUrlRef.current !== modelUrl) return;
          console.warn('[ArPreview3D] 模型加载失败:', err?.message || err);
          const fallback = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.1, 0.1),
            new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff4444, emissiveIntensity: 0.1 })
          );
          const wrapper = new THREE.Group();
          wrapper.position.set(targetPos.x, targetPos.y, targetPos.z);
          wrapper.scale.setScalar(scale || 1);
          wrapper.add(fallback);
          scene.add(wrapper);
          modelRef.current = wrapper;
        }
      );
    } else {
      // Placeholder box when no model
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x4f8cff, wireframe: true, transparent: true, opacity: 0.4 })
      );
      box.position.set(targetPos.x, targetPos.y, targetPos.z);
      scene.add(box);
      modelRef.current = box;
    }
  }, [modelUrl, trackingType, faceFeature]); // reload when these change

  // ── Face zone: generated geometry & decal rendering ──
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const state = sceneRef.current;
      if (!state || trackingType !== 'face') return;
      const { scene } = state;

      // 动态导入 FaceModelGenerator（仅在面部模式需要）
      let FaceModelGenerator;
      try {
        const mod = await import('@ar-platform/engine');
        FaceModelGenerator = mod.FaceModelGenerator;
      } catch (err) {
        console.warn('[ArPreview3D] FaceModelGenerator 加载失败:', err);
        return;
      }

      if (cancelled) return;

      // Clean up previous zone objects
      for (const entry of zoneObjsRef.current) {
        scene.remove(entry.group);
        entry.group.traverse((obj) => {
          if (obj.isMesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material?.dispose();
          }
        });
      }
      zoneObjsRef.current = [];

      if (!faceZones || !Array.isArray(faceZones)) return;

      for (const z of faceZones) {
        if (!z.enabled) continue;
        const primaryLm = z.landmarks?.[0];
        const fp = FEATURE_POSITIONS[primaryLm];
        if (!fp) continue;

        // Generated geometry
        if (z.contentSource === 'generated' && z.generatedType && z.generatedType !== 'none') {
          try {
            const group = FaceModelGenerator.generate(z.generatedType);
            group.position.set(fp.x, fp.y, fp.z);
            group.scale.setScalar(z.scale || 1);
            scene.add(group);
            zoneObjsRef.current.push({ zoneId: z.zoneId, group });
          } catch (err) {
            console.warn('[ArPreview3D] 内置素材生成失败:', z.generatedType, err);
          }
        }

        // Decal (2.5D sticker)
        if (z.contentSource === 'decal' && z.decalUrl) {
          const loader = new THREE.TextureLoader();
          loader.load(z.decalUrl, (texture) => {
            const aspect = texture.image ? texture.image.width / texture.image.height : 1;
            const plane = new THREE.Mesh(
              new THREE.PlaneGeometry(0.08 * aspect, 0.08),
              new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide })
            );
            plane.position.set(fp.x, fp.y, fp.z);
            plane.scale.setScalar(z.scale || 1);
            scene.add(plane);
            zoneObjsRef.current.push({ zoneId: z.zoneId, group: plane });
          });
        }
      }
    })();
  }, [faceZones, trackingType]);

  // ── Update position & scale in real-time (without model reload) ──
  useEffect(() => {
    if (!modelRef.current) return;
    const targetPos = calcModelPos(trackingType, position, faceFeature);
    modelRef.current.position.set(targetPos.x, targetPos.y, targetPos.z);
    modelRef.current.scale.setScalar((scale || 1) * (modelRef.current.userData?.autoScale || 1));
  }, [position, scale, trackingType, faceFeature]);

  // ── Update target image texture on the card ──
  useEffect(() => {
    if (trackingType !== 'image' || !cardImgRef.current) return;

    const mat = cardImgRef.current.material;
    // Dispose old texture to avoid memory leak
    if (mat.map) {
      mat.map.dispose();
      mat.map = null;
    }

    if (targetPreview) {
      const loader = new THREE.TextureLoader();
      // TextureLoader.load 带回调确保图片加载完后再更新材质
      loader.load(
        targetPreview,
        (tex) => {
          // 组件可能已卸载或 cardImgRef 已变化
          if (!cardImgRef.current) return;
          mat.map = tex;
          mat.color.setHex(0xffffff);
          mat.roughness = 0.3;
          mat.metalness = 0;
          mat.needsUpdate = true;
        }
      );
    } else {
      mat.color.setHex(0x334466);
      mat.roughness = 0.5;
      mat.metalness = 0.2;
      mat.needsUpdate = true;
    }
  }, [targetPreview, trackingType]);

  const hasNoContent = !modelUrl;

  return (
    <div className="w-full aspect-[4/3] relative overflow-hidden rounded-xl bg-ar-mid shadow-xl">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/40 text-[11px] text-white/50">
        {trackingType === 'image' ? '图片追踪预览' :
         trackingType === 'face' ? '面部预览' :
         trackingType === 'plane' ? '平面放置预览' :
         '空间预览'}
      </div>
      <div className="absolute bottom-3 left-3 text-[11px] text-white/30">
        拖拽旋转 · 滚轮缩放
      </div>
      {hasNoContent && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-sm text-white/30">输入模型后预览</p>
        </div>
      )}
    </div>
  );
}
