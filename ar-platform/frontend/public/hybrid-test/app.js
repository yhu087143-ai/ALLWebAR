/* THREE is available on window (set by index.html via import map) */

/* ================================================================
   Telemetry
   ================================================================ */
const telemetry = {
  fps: 0,
  frameCount: 0,
  lastFpsUpdate: 0,
  surfaceOk: false,
  placed: false,
  relocScore: 0,

  updateFps() {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
  },

  render() {
    const fpsEl = document.getElementById('fps');
    const surfaceEl = document.getElementById('surface');

    if (fpsEl) fpsEl.textContent = this.fps + ' FPS';
    if (surfaceEl) {
      surfaceEl.textContent = this.surfaceOk ? 'Surface: OK' : 'Surface: --';
      surfaceEl.className = 'badge ' + (this.surfaceOk ? 'on' : 'off');
    }

    const relocEl = document.getElementById('reloc');
    if (relocEl) {
      if (gPlaced && gRelocalizer && gRelocalizer.hasReference) {
        relocEl.textContent = 'Reloc: ' + (gRelocalizer.lastMatchScore * 100).toFixed(0) + '%';
        relocEl.className = 'badge ' + (gRelocalizer.lastMatchScore > 0.7 ? 'on' : 'err');
      } else {
        relocEl.textContent = gPlaced ? 'Reloc: --' : 'Reloc: off';
        relocEl.className = 'badge off';
      }
    }
  }
};



/* ================================================================
   SLAMTracker — wraps XR8 hitTest
   ================================================================ */
class SLAMTracker {
  constructor(xr8) {
    this._xr8 = xr8;
    /* Motion speed estimation */
    this._lastPose = null;
    this._motionSpeed = 0;
    /* Feature tracking quality */
    this._featureCount = 0;
    this._avgConfidence = 0;
  }

  hitTest(screenX, screenY) {
    if (screenX === undefined) screenX = 0.5;
    if (screenY === undefined) screenY = 0.5;
    try {
      var results = this._xr8.XrController.hitTest(screenX, screenY) || [];
      this._featureCount = results.length;
      if (results.length > 0) {
        var cs = 0;
        for (var i = 0; i < results.length; i++) cs += results[i].confidence || 0.5;
        this._avgConfidence = cs / results.length;
      } else {
        this._avgConfidence = 0;
      }
      return results;
    } catch (e) {
      return [];
    }
  }

  getCameraPose() {
    try {
      const scene = this._xr8.Threejs.xrScene();
      if (scene && scene.camera) {
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        scene.camera.getWorldPosition(pos);
        scene.camera.getWorldQuaternion(quat);
        return { position: pos, quaternion: quat };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  getCameraProjectionMatrix() {
    try {
      const scene = this._xr8.Threejs.xrScene();
      if (scene && scene.camera) {
        return scene.camera.projectionMatrix.clone();
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  getCamera() {
    try {
      const scene = this._xr8.Threejs.xrScene();
      return scene ? scene.camera : null;
    } catch (e) {
      return null;
    }
  }

  /* ---- motion & tracking quality ---- */

  updateMotion(cameraPose) {
    if (!cameraPose) return;
    if (this._lastPose) {
      var dist = cameraPose.position.distanceTo(this._lastPose.position);
      /* EMA-smoothed speed estimate, normalized to ~m/s at 30fps */
      this._motionSpeed = this._motionSpeed * 0.85 + dist * 30 * 0.15;
    }
    this._lastPose = {
      position: cameraPose.position.clone(),
      quaternion: cameraPose.quaternion.clone()
    };
  }

  getMotionSpeed() { return this._motionSpeed; }

  getTrackingQuality() {
    return { count: this._featureCount, confidence: this._avgConfidence };
  }
}

/* ================================================================
   SurfaceValidator — temporal consistency + AI depth verification
   ================================================================ */
class SurfaceValidator {
  constructor(config) {
    config = config || {};

    /* Temporal state */
    this._history = [];
    this._stableCount = 0;
    this._historySize = config.historySize || 10;
    this._stableThreshold = config.stableThreshold || 6;
    this._positionVariance = config.positionVariance || 0.02;
    this._minDistance = config.minDistance || 0.3;
    this._maxDistance = config.maxDistance || 5.0;
    this._surfaceConfirmed = false;
    this._bestHit = null;
  }

  validate(hits) {
    return this._temporalCheck(hits);
  }

  /* ---- temporal consistency ---- */

  _temporalCheck(hits) {
    if (!hits || hits.length === 0) {
      this._history = [];
      this._stableCount = 0;
      this._surfaceConfirmed = false;
      this._bestHit = null;
      return null;
    }

    /* Prefer PLANE with upward normal (reject walls), fallback to FEATURE_POINT */
    var hit = null;
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (h.type === 'PLANE' && h.normal && h.normal.y > 0.5) { hit = h; break; }
    }
    if (!hit) hit = hits.find(function (h) { return h.type === 'FEATURE_POINT'; }) || hits[0];
    if (!hit || !hit.position) return null;

    /* Distance constraints */
    if (hit.distance < this._minDistance || hit.distance > this._maxDistance) {
      this._history = [];
      this._stableCount = 0;
      this._surfaceConfirmed = false;
      this._bestHit = null;
      return null;
    }

    /* Push history */
    this._history.push({ x: hit.position.x, y: hit.position.y, z: hit.position.z });
    if (this._history.length > this._historySize) this._history.shift();

    if (this._history.length < this._historySize) {
      this._surfaceConfirmed = false;
      return null;
    }

    /* Variance */
    const sum = this._history.reduce(function (a, p) {
      return { x: a.x + p.x, y: a.y + p.y, z: a.z + p.z };
    }, { x: 0, y: 0, z: 0 });
    const n = this._history.length;
    const avg = { x: sum.x / n, y: sum.y / n, z: sum.z / n };

    const variance = this._history.reduce(function (a, p) {
      var dx = p.x - avg.x, dy = p.y - avg.y, dz = p.z - avg.z;
      return a + dx * dx + dy * dy + dz * dz;
    }, 0) / n;

    if (variance > this._positionVariance) {
      this._stableCount = 0;
      this._surfaceConfirmed = false;
      this._bestHit = null;
      return null;
    }

    this._stableCount++;
    if (this._stableCount >= this._stableThreshold) {
      this._surfaceConfirmed = true;
      this._bestHit = hit;
      return hit;
    }

    return null;
  }

  /* ---- accessors ---- */

  get isSurfaceConfirmed() { return this._surfaceConfirmed; }
  get bestHit() { return this._bestHit; }

  reset() {
    this._history = [];
    this._stableCount = 0;
    this._surfaceConfirmed = false;
    this._bestHit = null;
  }
}

/* ================================================================
   ReticleManager — guide ring
   ================================================================ */
class ReticleManager {
  constructor(scene) {
    this._scene = scene;
    this._group = this._createReticle();
    this._scene.add(this._group);
    this._group.visible = false;
  }

  _createReticle() {
    var group = new THREE.Group();

    var ringGeom = new THREE.RingGeometry(0.08, 0.14, 48);
    var ringMat = new THREE.MeshBasicMaterial({
      color: 0x4f8cff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    var ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    var dotGeom = new THREE.CircleGeometry(0.018, 16);
    var dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6
    });
    var dot = new THREE.Mesh(dotGeom, dotMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.z = 0.001;
    group.add(dot);

    return group;
  }

  showAt(position) {
    this._group.position.copy(position);
    this._group.visible = true;
  }

  hide() { this._group.visible = false; }

  get visible() { return this._group.visible; }

  dispose() {
    this._scene.remove(this._group);
    this._group.children.forEach(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(function (m) { m.dispose(); });
        } else {
          child.material.dispose();
        }
      }
    });
  }
}

/* ================================================================
   PlacementManager — placement with SLAM + AI depth drift correction
   ================================================================ */
class PlacementManager {
  constructor(scene, slamTracker) {
    this._scene = scene;
    this._slam = slamTracker;
    this._placed = false;
    this._object = null;
    this._initialPos = new THREE.Vector3();

    /* SLAM drift correction */
    this._driftThreshold = 0.015;     /* 1.5cm — detect drift earlier */
    this._lerpSpeed = 0.12;            /* base smooth speed */
    this._emaHitPos = null;           /* EMA filter for hitTest jitter */
    this._emaAlpha = 0.25;
    this._relocCorrection = null;     /* smoothed relocalization correction */
    this._tapUV = { x: 0.5, y: 0.5 }; /* screen UV where user tapped */
  }

  get hasPlaced() { return this._placed; }

  /* ---- place ---- */

  place(position, tapUV) {
    if (this._placed) return;
    this._placed = true;

    var cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x4f8cff, metalness: 0.3, roughness: 0.4 })
    );
    cube.position.set(position.x, position.y + 0.075, position.z);
    this._scene.add(cube);
    this._object = cube;
    this._initialPos.copy(position);
    this._emaHitPos = position.clone();
    if (tapUV) { this._tapUV.x = tapUV.x; this._tapUV.y = tapUV.y; }

    console.log('[Placement] Placed at:', position);
  }

  /* ---- SLAM drift correction (adaptive) ---- */

  _slamCorrect(motionSpeed) {
    if (!this._object) return;
    motionSpeed = motionSpeed || 0;

    /* Use tap UV so hitTest looks at same screen location where placed */
    var hits = this._slam.hitTest(this._tapUV.x, this._tapUV.y);
    if (!hits || hits.length === 0) return;

    var hit = hits.find(function (h) { return h.type === 'FEATURE_POINT'; }) || hits[0];
    if (!hit || !hit.position) return;

    /* Adaptive lerp: faster when moving, smoother when still */
    var adaptiveLerp = this._lerpSpeed;
    if (motionSpeed < 0.05) {
      adaptiveLerp = 0.12;         /* stationary — correct steadily */
    } else if (motionSpeed > 0.5) {
      adaptiveLerp = 0.3;          /* fast movement — respond quickly */
    } else {
      var t = (motionSpeed - 0.05) / 0.45;
      adaptiveLerp = 0.12 + t * 0.18;
    }

    /* EMA-filter the raw SLAM hitTest position to reduce single-frame jitter */
    var rawHitPos = new THREE.Vector3(hit.position.x, hit.position.y + 0.075, hit.position.z);
    if (!this._emaHitPos) {
      this._emaHitPos = rawHitPos.clone();
    } else {
      this._emaHitPos.lerp(rawHitPos, this._emaAlpha);
    }

    var drift = this._object.position.distanceTo(this._emaHitPos);

    if (drift > this._driftThreshold) {
      this._object.position.lerp(this._emaHitPos, adaptiveLerp);
    }
  }

  /* ---- update / lifecycle ---- */

  update(motionSpeed) {
    if (!this._object) return;
    this._slamCorrect(motionSpeed);
  }

  replace(position) {
    this.remove();
    this._placed = false;
    this.place(position);
  }

  /** Apply relocalization correction from NCC pixel drift */
  applyRelocalization(dx, dy, cameraPose, projMatrix) {
    if (!this._object || !cameraPose || !projMatrix || !cameraPose.position) return;
    var depth = cameraPose.position.distanceTo(this._object.position);
    if (depth < 0.1 || depth > 10) return;

    var correction = pixelDriftToWorld(dx, dy, depth, projMatrix, cameraPose.quaternion);

    /* EMA-filter correction to avoid jitter */
    if (!this._relocCorrection) this._relocCorrection = new THREE.Vector3();
    this._relocCorrection.lerp(correction, 0.4);

    this._object.position.add(this._relocCorrection);
  }

  remove() {
    if (this._object) {
      this._scene.remove(this._object);
      if (this._object.geometry) this._object.geometry.dispose();
      if (this._object.material) {
        if (Array.isArray(this._object.material)) {
          this._object.material.forEach(function (m) { m.dispose(); });
        } else {
          this._object.material.dispose();
        }
      }
      this._object = null;
    }
    this._placed = false;
  }

  dispose() {
    this.remove();
    this._slam = null;
  }
}

/* ================================================================
   Relocalizer — AI feature matching via Web Worker (XFeat ONNX)
   ================================================================ */
class Relocalizer {
  constructor(xr8, modelUrl) {
    this._xr8 = xr8;
    this._enabled = true;
    this._hasReference = false;
    this._lastMatchScore = 0;
    this._pixelDriftX = 0;
    this._pixelDriftY = 0;
    this._frameCount = 0;
    this._ready = false;
    this._imgW = 240;
    this._imgH = 320;
    this._relocInterval = 15;
    this._maxMotionForReloc = 0.5;
    this._pendingCapture = false;

    /* Spawn Web Worker */
    this._worker = new Worker('reloc-worker.js');

    this._worker.addEventListener('message', function (e) {
      var msg = e.data;
      switch (msg.type) {
        case 'ready':
          this._ready = true;
          console.log('[RelocWorker] ready, backend:', msg.backend);
          break;
        case 'captured':
          this._pendingCapture = false;
          break;
        case 'drift':
          this._pixelDriftX = msg.dx;
          this._pixelDriftY = msg.dy;
          this._lastMatchScore = msg.score;
          break;
        case 'error':
          console.warn('[RelocWorker]', msg.message);
          break;
      }
    }.bind(this));

    /* Init model load */
    this._worker.postMessage({ type: 'init', modelUrl: modelUrl || 'models/xfeat_dense.onnx' });
  }

  get enabled() { return this._enabled; }
  set enabled(v) { this._enabled = v; }
  get hasReference() { return this._hasReference; }
  get pixelDriftX() { return this._pixelDriftX; }
  get pixelDriftY() { return this._pixelDriftY; }
  get lastMatchScore() { return this._lastMatchScore; }

  /** Capture reference frame at normalized UV (0-1) */
  captureAtUV(uvX, uvY) {
    if (!this._ready) return false;
    var pixels = this._getPixelArray();
    if (!pixels) return false;

    this._hasReference = true;
    this._pendingCapture = true;
    this._pixelDriftX = 0;
    this._pixelDriftY = 0;
    this._lastMatchScore = 0;
    this._frameCount = 0;

    var pixelsCopy = new Uint8Array(pixels);
    this._worker.postMessage(
      { type: 'capture', pixels: pixelsCopy, imgW: this._imgW, imgH: this._imgH, uvX: uvX, uvY: uvY, frameId: performance.now() },
      [pixelsCopy.buffer]
    );
    return true;
  }

  /** Attempt relocalization: returns { dx, dy, score } or null */
  relocalize(motionSpeed) {
    if (!this._hasReference || !this._enabled || !this._ready) return null;
    if (this._pendingCapture) return null;
    if (motionSpeed > this._maxMotionForReloc) return null;

    this._frameCount++;
    if (this._frameCount < this._relocInterval) return null;
    this._frameCount = 0;

    /* Send current frame to worker for matching */
    var pixels = this._getPixelArray();
    if (!pixels) return null;

    var pixelsCopy = new Uint8Array(pixels);
    this._worker.postMessage(
      { type: 'relocalize', pixels: pixelsCopy, imgW: this._imgW, imgH: this._imgH, frameId: performance.now() },
      [pixelsCopy.buffer]
    );

    /* Return latest async result (from previous worker cycle) */
    if (this._lastMatchScore > 0.7) {
      return { dx: this._pixelDriftX, dy: this._pixelDriftY, score: this._lastMatchScore };
    }
    return null;
  }

  reset() {
    this._hasReference = false;
    this._pendingCapture = false;
    this._pixelDriftX = 0;
    this._pixelDriftY = 0;
    this._lastMatchScore = 0;
  }

  dispose() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._xr8 = null;
  }

  /* ── private ── */

  _getPixelArray() {
    try {
      return this._xr8.XrController.getCameraPixelArray() || null;
    } catch (e) { return null; }
  }
}

/** Convert pixel-array drift to world-space 3D offset */
function pixelDriftToWorld(dx, dy, depth, projMatrix, camQuat) {
  const fx = projMatrix.elements[0] / 2;  /* focal length in normalized coords */
  const fy = projMatrix.elements[5] / 2;
  /* Negate x: feature moving right in image → camera drifted left → correct left */
  const offset = new THREE.Vector3(
    -dx * depth / (fx * 240),
    -dy * depth / (fy * 320),
    0
  );
  offset.applyQuaternion(camQuat);
  return offset;
}

/* ================================================================
   Global state
   ================================================================ */
var gSlam = null;
var gValidator = null;
var gReticle = null;
var gPlacement = null;
var gRelocalizer = null;
var gScene = null;
var gRenderer = null;
var gFrameId = 0;
var gSurfacePos = null;
var gPlaced = false;

/* ================================================================
   XR8 Pipeline Module
   ================================================================ */
const appModule = {
  name: 'hybrid-ar-app',

  onStart: function () {
    try {
      var XR8_ = window.XR8;
      var xrScene = XR8_.Threejs.xrScene();
      if (!xrScene || !xrScene.scene) {
        console.warn('[HybridAR] xrScene not ready yet');
        return;
      }
      var scene = xrScene.scene;
      var renderer = xrScene.renderer;
      var camera = xrScene.camera;

      gScene = scene;
      gRenderer = renderer;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      scene.background = null;

      /* ---- Lights ---- */
      scene.add(new THREE.AmbientLight(0xffffff, 1.5));

      var dirLight = new THREE.DirectionalLight(0xffffff, 2);
      dirLight.position.set(0, 3, 3);
      scene.add(dirLight);

      var fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
      fillLight.position.set(-2, 1, -2);
      scene.add(fillLight);

      /* ---- Configure 8th Wall ---- */
      try { XR8_.XrController.configure({
        surfaceEstimation: true,
        enableFeatureSet: true,
        cameraPixelArray: true,
        cameraPixelArrayDimensions: [240, 320]
      }); } catch (e) {
        console.warn('[HybridAR] XrController config failed:', e);
      }

      /* ---- Instantiate modules ---- */
      gSlam = new SLAMTracker(XR8_);
      gValidator = new SurfaceValidator();
      gReticle = new ReticleManager(scene);
      gPlacement = new PlacementManager(scene, gSlam);
      gRelocalizer = new Relocalizer(XR8_, 'models/xfeat_dense.onnx');

      console.log('[HybridAR] Module initialized');
    } catch (e) {
      console.error('[HybridAR] onStart error:', e.message);
      showError('3D 场景初始化失败: ' + e.message);
    }
  },

  onUpdate: function () {
    if (!gSlam || !gValidator || !gReticle) return;

    try {
      gFrameId++;

      /* ---- Motion tracking ---- */
      var cameraPose = gSlam.getCameraPose();
      if (cameraPose) gSlam.updateMotion(cameraPose);

      /* ---- SLAM hitTest + surface validation ---- */
      var hits = gSlam.hitTest();
      var validHit = gValidator.validate(hits);

      if (validHit && validHit.position) {
        gSurfacePos = new THREE.Vector3(
          validHit.position.x,
          validHit.position.y,
          validHit.position.z
        );
        gReticle.showAt(gSurfacePos);
      } else {
        gReticle.hide();
        gSurfacePos = null;
      }

      /* ---- If placed, adaptive drift correction ---- */
      if (gPlaced && gPlacement) {
        gPlacement.update(gSlam.getMotionSpeed());
      }

      /* ---- AI-assisted relocalization (XFeat feature matching via Worker) ---- */
      if (gPlaced && gRelocalizer) {
        var relocResult = gRelocalizer.relocalize(gSlam.getMotionSpeed());
        if (relocResult && gPlacement) {
          gPlacement.applyRelocalization(relocResult.dx, relocResult.dy, gSlam.getCameraPose(), gSlam.getCameraProjectionMatrix());
        }
      }

      /* ---- Telemetry ---- */
      telemetry.updateFps();
      telemetry.surfaceOk = gValidator.isSurfaceConfirmed;

    } catch (e) {
      console.error('[HybridAR] onUpdate error:', e.message);
    }
  },

  onAttach: function () {
    console.log('[HybridAR] Camera attached');

    var hint = document.getElementById('hint');
    if (hint) hint.textContent = 'Move phone slowly to scan surfaces';

    /* ---- Tap to place ---- */
    function onTap(event) {
      if (gPlaced || !gValidator || !gValidator.bestHit) return;
      var hit = gValidator.bestHit;
      if (!hit || !hit.position) return;

      gPlaced = true;
      var pos = new THREE.Vector3(hit.position.x, hit.position.y, hit.position.z);

      /* Compute tap UV from event */
      var tapUV = { x: 0.5, y: 0.5 };
      if (event && event.clientX !== undefined) {
        tapUV.x = event.clientX / window.innerWidth;
        tapUV.y = event.clientY / window.innerHeight;
      } else if (event && event.changedTouches && event.changedTouches[0]) {
        tapUV.x = event.changedTouches[0].clientX / window.innerWidth;
        tapUV.y = event.changedTouches[0].clientY / window.innerHeight;
      }

      gPlacement.place(pos, tapUV);

      /* Capture reference patch for relocalization */
      if (gRelocalizer) {
        gRelocalizer.captureAtUV(tapUV.x, tapUV.y);
      }

      gReticle.hide();
      telemetry.placed = true;

      if (hint) hint.textContent = 'Object placed';
      var statusEl = document.getElementById('status');
      if (statusEl) statusEl.textContent = 'Placed';
    }

    document.addEventListener('click', onTap);
    document.addEventListener('touchstart', function (e) {
      if (e.changedTouches.length === 1) onTap(e);
    }, { passive: true });
  },

  onDetach: function () {
    console.log('[HybridAR] Camera detached');
    if (gReticle) { gReticle.dispose(); gReticle = null; }
    if (gPlacement) { gPlacement.dispose(); gPlacement = null; }
    if (gRelocalizer) { gRelocalizer.dispose(); gRelocalizer = null; }
    gPlaced = false;
  },

  onCameraStatusChange: function (args) {
    console.log('[HybridAR] Camera status:', args.status);
    var statusEl = document.getElementById('status');
    var errorEl = document.getElementById('error');
    if (!statusEl) return;
    if (args.status === 'hasStream' || args.status === 'hasDesktop3D' || args.status === 'hasVideo') {
      statusEl.textContent = 'Camera started — scanning surfaces...';
      statusEl.style.color = '#fff';
      if (errorEl) errorEl.style.display = 'none';
    } else if (args.status === 'failed') {
      var msg = args.error || args.message || 'Camera failed — check permissions';
      statusEl.textContent = msg;
      statusEl.style.color = '#ff4444';
      if (errorEl) { errorEl.style.display = 'block'; errorEl.textContent = msg; }
    }
  },

  onException: function (err) {
    console.error('[HybridAR] Pipeline exception:', err);
    var msg = err && (err.message || String(err));
    if (msg && typeof window.showError === 'function') window.showError('管线错误: ' + msg);
  }
};

/* ================================================================
   Register pipeline module (poll until XR8 available)
   ================================================================ */
(function registerWhenReady() {
  if (typeof XR8 !== 'undefined' && XR8.addCameraPipelineModule) {
    /* Register required pipeline modules (same order as plane-test.html) */
    XR8.addCameraPipelineModule(XR8.XrController.pipelineModule());
    XR8.addCameraPipelineModule(XR8.GlTextureRenderer.pipelineModule());
    XR8.addCameraPipelineModule(XR8.Threejs.pipelineModule({
      renderer: { alpha: true, antialias: true }
    }));
    XR8.addCameraPipelineModule(appModule);
    console.log('[HybridAR] Modules registered (Controller + GL + Threejs + App)');
  } else {
    setTimeout(registerWhenReady, 50);
  }
})();
