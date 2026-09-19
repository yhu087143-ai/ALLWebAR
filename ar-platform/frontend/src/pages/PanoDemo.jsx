import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Link } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon, Compass, Volume2, X, Sparkles } from 'lucide-react';
import { SpatialAudioManager } from '@ar-platform/engine';

/**
 * 全景 AR 演示（/pano）—— 720° 全景 + 陀螺仪视角 + POI 热点 + 星尘粒子 + 空间音频
 *
 * · 全景图：等距柱状投影（equirectangular，宽高比 2:1），从手机相册选择即可替换
 * · 视角：iOS/Android 陀螺仪（首次点按申请动作权限）；桌面端拖拽鼠标环视
 * · 热点：固定方向上的可点信息点（示例 3 个，后续可从导览配置下发）
 * · 空间音频：声源挂在热点位置，转头时声像随相对方位变化（M13）
 *
 * 与 AR 的关系：这是"以手机为中心"的全屏沉浸模式（720°VR 式），
 * 不依赖摄像头画面，因此 iOS/Android/桌面全平台可跑。
 */

/* ── DeviceOrientation → 相机四元数（three.js 经典 DeviceOrientationControls 公式） ── */
const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -PI/2 绕 X
function setQuatFromOrientation(quaternion, alphaDeg, betaDeg, gammaDeg, orientRad) {
  const d2r = Math.PI / 180;
  euler.set(betaDeg * d2r, alphaDeg * d2r, -gammaDeg * d2r, 'YXZ');
  quaternion.setFromEuler(euler);
  quaternion.multiply(q1);
  quaternion.multiply(q0.setFromAxisAngle(zee, -orientRad));
}

/* ── 示例热点（方向 + 标签），latLon → 球面位置 ── */
const HOTSPOTS = [
  { id: 'h1', label: '星空剧场', lat: 18, lon: 0, desc: '抬头即是银河——粒子里藏着三个星座彩蛋。' },
  { id: 'h2', label: '入口回廊', lat: -4, lon: 120, desc: '从这里开始你的全景漫游。' },
  { id: 'h3', label: '声之角落', lat: 0, lon: -95, desc: '环境音乐从这个方向传来（空间音频演示）。' },
];
function latLonToVec3(latDeg, lonDeg, r) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(lat) * Math.sin(lon),
    r * Math.sin(lat),
    r * Math.cos(lat) * Math.cos(lon)
  );
}

export default function PanoDemo() {
  const mountRef = useRef(null);
  const stateRef = useRef({}); // three 对象都在 ref 里，避免重渲染抖动
  const [panoName, setPanoName] = useState('');
  const [gyroOn, setGyroOn] = useState(false);
  const [activeHs, setActiveHs] = useState(null);
  const [audioOn, setAudioOn] = useState(false);
  const [err, setErr] = useState('');
  const audioRef = useRef(null);

  /* ── 场景初始化（一次） ── */
  useEffect(() => {
    const mount = mountRef.current;
    const st = stateRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 0.1, 110
    );
    camera.position.set(0, 0, 0.01);

    // 默认程序化夜空（无全景图时也不空白）：渐变 + 星点
    const cv = document.createElement('canvas');
    cv.width = 2048; cv.height = 1024;
    const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0, '#050514');
    grad.addColorStop(0.55, '#0b1030');
    grad.addColorStop(0.78, '#1b2550');
    grad.addColorStop(1, '#0a0e20');
    g.fillStyle = grad; g.fillRect(0, 0, 2048, 1024);
    for (let i = 0; i < 900; i++) {
      const y = Math.random() * 560;
      g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.75})`;
      g.fillRect(Math.random() * 2048, y, 1.4, 1.4);
    }
    const defaultTex = new THREE.CanvasTexture(cv);
    defaultTex.colorSpace = THREE.SRGBColorSpace;

    // 支持 ?tex=<url> 直接加载全景图（如 /panoramas/demo.png）
    const urlTex = new URLSearchParams(window.location.search).get('tex');
    if (urlTex) {
      new THREE.TextureLoader().load(urlTex, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        skyMat.map = t;
        skyMat.needsUpdate = true;
      }, undefined, () => console.warn('[Pano] 全景图加载失败：', urlTex));
    }

    const skyGeo = new THREE.SphereGeometry(50, 48, 32);
    const skyMat = new THREE.MeshBasicMaterial({ map: defaultTex, side: THREE.BackSide });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);

    // 星尘粒子（上层半球，缓慢闪烁）
    const N = 700;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 18 + Math.random() * 14;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.45; // 上半球
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.6 + 2;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xaecbff, size: 0.28, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const stars = new THREE.Points(pGeo, pMat);
    scene.add(stars);

    // POI 热点（Sprite + canvas 标签）
    const raycaster = new THREE.Raycaster();
    const hotspots = HOTSPOTS.map(h => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = 'rgba(10,12,30,0.72)';
      x.beginPath(); x.roundRect(8, 34, 240, 60, 16); x.fill();
      x.strokeStyle = 'rgba(140,170,255,0.9)'; x.lineWidth = 3; x.stroke();
      x.fillStyle = '#dfe8ff'; x.font = 'bold 30px sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(h.label, 128, 64);
      const tex = new THREE.CanvasTexture(c);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      spr.position.copy(latLonToVec3(h.lat, h.lon, 30));
      spr.scale.set(6, 3, 1);
      spr.userData = h;
      scene.add(spr);
      return spr;
    });

    st.renderer = renderer; st.scene = scene; st.camera = camera;
    st.skyMat = skyMat; st.hotspots = hotspots; st.raycaster = raycaster;
    st.pointer = { down: false, x: 0, y: 0 };
    st.orientation = { alpha: 0, beta: 88, gamma: 0, screen: 0 };

    // 桌面拖拽环视（无陀螺仪时的兜底）
    const onDown = e => { st.pointer.down = true; st.pointer.x = e.clientX; st.pointer.y = e.clientY; };
    const onMove = e => {
      if (!st.pointer.down) return;
      st.orientation.alpha -= (e.clientX - st.pointer.x) * 0.12;
      st.orientation.beta = Math.max(2, Math.min(178, st.orientation.beta + (e.clientY - st.pointer.y) * 0.12));
      st.pointer.x = e.clientX; st.pointer.y = e.clientY;
    };
    const onUp = () => { st.pointer.down = false; };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    // 点击热点（陀螺仪开启时用射线代替拖拽路径）
    const onTap = e => {
      const ndc = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(hotspots)[0];
      setActiveHs(hit ? hit.object.userData : null);
    };
    window.addEventListener('click', onTap);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // 主循环：陀螺仪/拖拽 → 相机；粒子闪烁；空间音频听者
    const quat = new THREE.Quaternion();
    const fwd = new THREE.Vector3();
    let t0 = performance.now();
    const loop = (t) => {
      const o = st.orientation;
      setQuatFromOrientation(quat, o.alpha, o.beta, o.gamma, (o.screen * Math.PI) / 180);
      camera.quaternion.slerp(quat, 0.12);
      st.hotspots.forEach((s, i) => {
        s.material.opacity = 0.75 + 0.25 * Math.sin(t / 500 + i);
      });
      pMat.opacity = 0.65 + 0.2 * Math.sin(t / 900);
      camera.getWorldDirection(fwd);
      const heading = (Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI;
      st.audio?.setListener({ x: 0, y: 0, z: 0 }, heading);
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('click', onTap);
      window.removeEventListener('resize', onResize);
      st.audio?.dispose?.();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  /* ── 陀螺仪（iOS 需手势内 requestPermission） ── */
  const enableGyro = useCallback(async () => {
    const st = stateRef.current;
    try {
      const DOE = window.DeviceOrientationEvent;
      if (DOE?.requestPermission) {
        const res = await DOE.requestPermission();
        if (res !== 'granted') { setErr('动作权限被拒绝，可改用拖拽环视'); return; }
      }
      const handler = (e) => {
        if (e.alpha == null) return;
        st.orientation.alpha = e.alpha ?? 0;
        st.orientation.beta = e.beta ?? 88;
        st.orientation.gamma = e.gamma ?? 0;
        st.orientation.screen = (window.screen?.orientation?.angle ?? window.orientation ?? 0);
      };
      window.addEventListener('deviceorientation', handler, true);
      setGyroOn(true); setErr('');
    } catch {
      setErr('当前设备不支持陀螺仪，可拖拽环视');
    }
  }, []);

  /* ── 换全景图 ── */
  const onPanoFile = useCallback((e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      stateRef.current.skyMat.map = tex;
      stateRef.current.skyMat.needsUpdate = true;
      setPanoName(f.name);
    }, undefined, () => setErr('全景图加载失败（请用 2:1 的全景图）'));
  }, []);

  /* ── 空间音频（选一段音乐挂到热点方向） ── */
  const onAudioFile = useCallback((e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const st = stateRef.current;
    if (!st.audio) st.audio = new SpatialAudioManager();
    const url = URL.createObjectURL(f);
    const p = latLonToVec3(HOTSPOTS[2].lat, HOTSPOTS[2].lon, 12);
    st.audio.playAt(url, { x: p.x, y: p.y, z: p.z }, { loop: true, volume: 0.8 });
    setAudioOn(true);
  }, []);

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />

      {/* 顶栏 */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2">
        <Link to="/" className="w-9 h-9 rounded-xl bg-black/40 backdrop-blur flex items-center justify-center">
          <ArrowLeft size={17} />
        </Link>
        <div className="px-3 py-2 rounded-xl bg-black/40 backdrop-blur text-sm font-medium">
          全景模式 <span className="text-white/50">· 720° 环视</span>
        </div>
        <div className="flex-1" />
        <label className="w-9 h-9 rounded-xl bg-black/40 backdrop-blur flex items-center justify-center cursor-pointer" title="加载全景图">
          <ImageIcon size={16} />
          <input type="file" accept="image/*" className="hidden" onChange={onPanoFile} />
        </label>
        <label className="w-9 h-9 rounded-xl bg-black/40 backdrop-blur flex items-center justify-center cursor-pointer" title="挂载环境音乐到热点">
          <Volume2 size={16} />
          <input type="file" accept="audio/*" className="hidden" onChange={onAudioFile} />
        </label>
        <button onClick={enableGyro}
          className={`w-9 h-9 rounded-xl backdrop-blur flex items-center justify-center transition-colors
            ${gyroOn ? 'bg-violet-500/30 text-violet-200' : 'bg-black/40'}`}
          title="开启陀螺仪">
          <Compass size={16} />
        </button>
      </div>

      {/* 状态条 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-2xl bg-black/45 backdrop-blur text-xs text-white/80 flex items-center gap-2">
        <Sparkles size={13} className="text-violet-300" />
        {panoName ? `全景图：${panoName}` : '默认星穹（点右上相册图标加载你的 2:1 全景图）'}
        {audioOn && <span className="text-emerald-300">· 音乐来自「声之角落」方向</span>}
      </div>

      {/* 热点信息卡 */}
      {activeHs && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 w-[86%] max-w-md
                        rounded-2xl bg-black/60 backdrop-blur border border-white/10 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold">{activeHs.label}</div>
            <button onClick={() => setActiveHs(null)} className="text-white/50 hover:text-white"><X size={15} /></button>
          </div>
          <div className="text-sm text-white/70">{activeHs.desc}</div>
        </div>
      )}

      {err && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-3 py-2 rounded-xl
                        bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs">{err}</div>
      )}
    </div>
  );
}
