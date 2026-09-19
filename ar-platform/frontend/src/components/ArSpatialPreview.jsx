import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * 迷你 AR 空间预览组件
 *
 * 在模板卡片左侧显示一个微型 3D 场景，展示当前追踪类型在真实空间中的 AR 效果示意。
 * 使用轻量 Three.js 场景，包含地面网格和示意物体。
 */
export default function ArSpatialPreview({ trackingType }) {
  const containerRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth || 160;
    const h = container.clientHeight || 200;

    // ── Scene ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 10);
    camera.position.set(0.8, 0.5, 1.0);
    camera.lookAt(0, 0, 0);

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // ── Lights ──
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
    mainLight.position.set(2, 3, 4);
    mainLight.castShadow = true;
    scene.add(mainLight);
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-1, 1, -2);
    scene.add(fillLight);

    // ── Grid helper (ground reference) ──
    const gridHelper = new THREE.GridHelper(1.2, 8, 0x4f8cff, 0x4f8cff);
    gridHelper.position.y = -0.15;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.3;
    scene.add(gridHelper);

    // ── Transparent ground plane (shadow receiver) ──
    const groundGeo = new THREE.PlaneGeometry(1.2, 1.2);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.15, transparent: true });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.15;
    ground.receiveShadow = true;
    scene.add(ground);

    // ── Scene objects per tracking type ──
    const group = new THREE.Group();
    scene.add(group);

    // 通用漂浮方块（代表 AR 内容）
    const boxGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x4f8cff,
      roughness: 0.3,
      metalness: 0.1,
      emissive: 0x4f8cff,
      emissiveIntensity: 0.1,
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.castShadow = true;

    // 线框装饰
    const edges = new THREE.EdgesGeometry(boxGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x88bbff,
      transparent: true,
      opacity: 0.4,
    });
    const wireframe = new THREE.LineSegments(edges, edgeMat);
    box.add(wireframe);

    switch (trackingType) {
      case 'image': {
        // 图片追踪：目标图片平面 + 上方漂浮物体
        const targetGeo = new THREE.PlaneGeometry(0.3, 0.2);
        const targetMat = new THREE.MeshBasicMaterial({
          color: 0x444488,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        });
        const target = new THREE.Mesh(targetGeo, targetMat);
        target.position.set(0, -0.1, 0);
        target.rotation.x = -0.3;
        group.add(target);

        // 边框
        const targetEdges = new THREE.EdgesGeometry(targetGeo);
        const targetEdgeMat = new THREE.LineBasicMaterial({
          color: 0x6666bb,
          transparent: true,
          opacity: 0.3,
        });
        const targetWire = new THREE.LineSegments(targetEdges, targetEdgeMat);
        target.add(targetWire);

        box.position.set(0, 0.12, 0);
        group.add(box);
        break;
      }
      case 'face': {
        // 面部追踪：椭圆面部 + 物体在鼻子位置
        const faceGeo = new THREE.SphereGeometry(0.15, 16, 24);
        const faceMat = new THREE.MeshStandardMaterial({
          color: 0xf0c8a0,
          roughness: 0.7,
          transparent: true,
          opacity: 0.5,
        });
        const face = new THREE.Mesh(faceGeo, faceMat);
        face.scale.set(0.9, 1.2, 0.6);
        face.position.set(0, 0, 0);
        group.add(face);

        // 眼睛
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        const eyeGeo = new THREE.SphereGeometry(0.025, 8, 8);
        const le = new THREE.Mesh(eyeGeo, eyeMat);
        le.position.set(-0.07, 0.04, 0.12);
        group.add(le);
        const re = new THREE.Mesh(eyeGeo, eyeMat);
        re.position.set(0.07, 0.04, 0.12);
        group.add(re);

        box.position.set(0, 0.12, 0.08);
        box.scale.setScalar(0.8);
        group.add(box);
        break;
      }
      case 'plane': {
        // 平面放置：水平面 + 物体在上面
        const planeGeo = new THREE.CircleGeometry(0.25, 20);
        const planeMat = new THREE.MeshBasicMaterial({
          color: 0x4f8cff,
          transparent: true,
          opacity: 0.15,
          side: THREE.DoubleSide,
        });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -0.1;
        group.add(plane);

        // 圆环指示器
        const ringGeo = new THREE.RingGeometry(0.08, 0.12, 24);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x4f8cff,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.09;
        group.add(ring);

        box.position.set(0, 0.05, 0);
        group.add(box);
        break;
      }
      case 'world': {
        // 世界追踪：3D 空间 + 漂浮物体
        box.position.set(0, 0.1, 0);
        group.add(box);

        // 额外的装饰方块表示空间
        const extraBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.06, 0.06),
          new THREE.MeshStandardMaterial({ color: 0x8888ff, transparent: true, opacity: 0.3 })
        );
        extraBox.position.set(0.2, 0.08, -0.15);
        group.add(extraBox);
        break;
      }
    }

    // ── Animation ──
    let time = 0;
    function animate() {
      animRef.current = requestAnimationFrame(animate);
      time += 0.02;

      // 主方块轻轻浮动
      box.position.y += Math.sin(time * 1.5) * 0.0008;
      box.rotation.y = time * 0.8;

      renderer.render(scene, camera);
    }
    animate();

    // ── Resize ──
    const handleResize = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      scene.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material?.dispose();
        }
      });
    };
  }, [trackingType]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[180px]"
      style={{ aspectRatio: '3/4' }}
    />
  );
}
