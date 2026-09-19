/**
 * reloc-worker.js
 *
 * Web Worker for AI-assisted relocalization using XFeat ONNX model.
 * Extracts feature descriptors from camera frames, matches against
 * a reference frame captured at placement time, and computes
 * pixel drift for 3D position correction.
 *
 * API Contract:
 *   Main -> Worker:
 *     { type: 'init', modelUrl: string }
 *     { type: 'capture', pixels: Uint8Array, imgW: number, imgH: number,
 *       uvX: number, uvY: number, frameId: number }
 *     { type: 'relocalize', pixels: Uint8Array, imgW: number, imgH: number,
 *       frameId: number }
 *
 *   Worker -> Main:
 *     { type: 'ready', backend: string }
 *     { type: 'captured', frameId: number }
 *     { type: 'drift', dx: number, dy: number, score: number,
 *       inliers: number, total: number, frameId: number }
 *     { type: 'error', message: string }
 */

// ──────────────────────────────────────────────
// 1. Load ONNX Runtime Web from CDN
// ──────────────────────────────────────────────
importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.js');

/* ── WASM binary path (avoids 404 from page origin) ── */
if (typeof ort !== 'undefined') {
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
}

/* ── iOS: disable SIMD + multi-thread to avoid corrupt inference ── */
var isIOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);
if (isIOS && typeof ort !== 'undefined') {
  ort.env.wasm.simd = false;
  ort.env.wasm.numThreads = 1;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
var MODEL_W = 640;
var MODEL_H = 480;
var TOP_K = 300;           /* keep top 300 keypoints by score */
var SCORE_THRESHOLD = 0.005;
var MATCH_RATIO = 0.75;    /* Lowe ratio test */
var MIN_INLIERS = 10;       /* minimum matches for valid drift */
var MAX_DRIFT_PX = 60;      /* reject implausibly large drift */

// ──────────────────────────────────────────────
// State
// ──────────────────────────────────────────────
var session = null;
var currentBackend = null;

/* Reference frame state */
var refKeypoints = null;     /* Float32Array[N, 2] in model coords */
var refDescriptors = null;   /* Float32Array[N, 64] */
var refImgW = 0;
var refImgH = 0;
var refUVX = 0.5;
var refUVY = 0.5;
var hasReference = false;

/* Processing throttling */
var latestFrameId = -1;
var processing = false;
var pendingFrame = null;

// ──────────────────────────────────────────────
// 2. Bilinear resize
// ──────────────────────────────────────────────

function bilinearResize(src, srcW, srcH, dstW, dstH) {
  var dst = new Uint8Array(dstW * dstH * 3);
  var xRatio = srcW / dstW;
  var yRatio = srcH / dstH;

  for (var dy = 0; dy < dstH; dy++) {
    for (var dx = 0; dx < dstW; dx++) {
      var sx = dx * xRatio;
      var sy = dy * yRatio;
      var x1 = Math.floor(sx);
      var y1 = Math.floor(sy);
      var x2 = Math.min(x1 + 1, srcW - 1);
      var y2 = Math.min(y1 + 1, srcH - 1);
      var fx = sx - x1;
      var fy = sy - y1;

      for (var c = 0; c < 3; c++) {
        var p11 = src[y1 * srcW * 3 + x1 * 3 + c];
        var p12 = src[y2 * srcW * 3 + x1 * 3 + c];
        var p21 = src[y1 * srcW * 3 + x2 * 3 + c];
        var p22 = src[y2 * srcW * 3 + x2 * 3 + c];
        var top = p11 + fx * (p21 - p11);
        var bottom = p12 + fx * (p22 - p12);
        dst[dy * dstW * 3 + dx * 3 + c] = Math.round(top + fy * (bottom - top));
      }
    }
  }
  return dst;
}

// ──────────────────────────────────────────────
// 3. Preprocess: RGBA pixel array -> RGB model tensor
// ──────────────────────────────────────────────

function preprocess(pixels, srcW, srcH) {
  /* Step 1: Convert RGBA to RGB (drop alpha) */
  var numPixels = srcW * srcH;
  var rgb = new Uint8Array(numPixels * 3);
  for (var i = 0; i < numPixels; i++) {
    var srcIdx = i * 4;
    var dstIdx = i * 3;
    rgb[dstIdx] = pixels[srcIdx];
    rgb[dstIdx + 1] = pixels[srcIdx + 1];
    rgb[dstIdx + 2] = pixels[srcIdx + 2];
  }

  /* Step 2: Resize to model input size */
  var resized = bilinearResize(rgb, srcW, srcH, MODEL_W, MODEL_H);

  /* Step 3: Normalize to [0, 1] and create NCHW tensor */
  var tensorData = new Float32Array(3 * MODEL_H * MODEL_W);
  var numModelPixels = MODEL_W * MODEL_H;
  for (var c = 0; c < 3; c++) {
    var offset = c * numModelPixels;
    for (var i = 0; i < numModelPixels; i++) {
      tensorData[offset + i] = resized[i * 3 + c] / 255.0;
    }
  }

  return new ort.Tensor('float32', tensorData, [1, 3, MODEL_H, MODEL_W]);
}

// ──────────────────────────────────────────────
// 4. Postprocess: extract top-K keypoints + descriptors
// ──────────────────────────────────────────────

function postprocess(output) {
  var keypoints = output.keypoints.data;    /* [N, 2] */
  var descriptors = output.descriptors.data; /* [N, 64] */
  var scales = output.scales.data;           /* [N] */
  var totalK = scales.length;

  /* Build index array and sort by score descending */
  var indices = new Uint16Array(totalK);
  for (var i = 0; i < totalK; i++) indices[i] = i;
  indices.sort(function (a, b) { return scales[b] - scales[a]; });

  /* Take top K with minimum score threshold */
  var selected = [];
  var k2d = keypoints.length / totalK;
  for (var i = 0; i < totalK && selected.length < TOP_K; i++) {
    var idx = indices[i];
    if (scales[idx] < SCORE_THRESHOLD) continue;
    selected.push(idx);
  }

  var n = selected.length;
  if (n === 0) return null;

  var outKp = new Float32Array(n * 2);
  var outDesc = new Float32Array(n * 64);

  for (var i = 0; i < n; i++) {
    var idx = selected[i];
    outKp[i * 2] = keypoints[idx * k2d];
    outKp[i * 2 + 1] = keypoints[idx * k2d + 1];
    for (var j = 0; j < 64; j++) {
      outDesc[i * 64 + j] = descriptors[idx * 64 + j];
    }
  }

  return { n: n, keypoints: outKp, descriptors: outDesc };
}

// ──────────────────────────────────────────────
// 5. Brute force descriptor matching + Lowe ratio
// ──────────────────────────────────────────────

function matchDescriptors(queryDesc, refDesc, queryN, refN) {
  var matches = [];
  var dim = 64;

  for (var qi = 0; qi < queryN; qi++) {
    var bestD = Infinity;
    var best2D = Infinity;
    var bestRi = -1;

    for (var ri = 0; ri < refN; ri++) {
      var dist = 0;
      for (var d = 0; d < dim; d++) {
        var diff = queryDesc[qi * dim + d] - refDesc[ri * dim + d];
        dist += diff * diff;
      }

      if (dist < bestD) {
        best2D = bestD;
        bestD = dist;
        bestRi = ri;
      } else if (dist < best2D) {
        best2D = dist;
      }
    }

    /* Lowe ratio test: best distance must be < ratio^2 * 2nd best */
    if (bestRi >= 0 && bestD < MATCH_RATIO * MATCH_RATIO * best2D) {
      matches.push({ qi: qi, ri: bestRi, dist: Math.sqrt(bestD) });
    }
  }

  return matches;
}

// ──────────────────────────────────────────────
// 6. Estimate drift from matched keypoints (median + RANSAC-like filter)
// ──────────────────────────────────────────────

function estimateDrift(matches, queryKp, refKp) {
  if (matches.length < MIN_INLIERS) return null;

  /* Scale from model coords (640x480) to pixel-array coords (imgW x imgH) */
  var scaleX = refImgW / MODEL_W;
  var scaleY = refImgH / MODEL_H;

  var dxs = new Float32Array(matches.length);
  var dys = new Float32Array(matches.length);

  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    dxs[i] = (queryKp[m.qi * 2] - refKp[m.ri * 2]) * scaleX;
    dys[i] = (queryKp[m.qi * 2 + 1] - refKp[m.ri * 2 + 1]) * scaleY;
  }

  /* Median displacement (in pixel-array coords) */
  dxs.sort();
  dys.sort();
  var mid = Math.floor(matches.length / 2);
  var medDx = dxs[mid];
  var medDy = dys[mid];

  /* Count inliers within 8px of median (RANSAC-like consensus) */
  var inlierCount = 0;
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    var qx = queryKp[m.qi * 2], qy = queryKp[m.qi * 2 + 1];
    var rx = refKp[m.ri * 2], ry = refKp[m.ri * 2 + 1];
    /* Scale to pixel-array coords before comparing with median */
    var dxErr = Math.abs((qx - rx) * scaleX - medDx);
    var dyErr = Math.abs((qy - ry) * scaleY - medDy);
    if (dxErr <= 8 && dyErr <= 8) inlierCount++;
  }

  /* Reject implausibly large drift */
  if (Math.abs(medDx) > MAX_DRIFT_PX || Math.abs(medDy) > MAX_DRIFT_PX) {
    return null;
  }

  return {
    dx: medDx,
    dy: medDy,
    score: inlierCount / matches.length,
    inliers: inlierCount,
    total: matches.length
  };
}

// ──────────────────────────────────────────────
// 7. Capture reference frame features
// ──────────────────────────────────────────────

function captureReference(pixels, imgW, imgH, uvX, uvY, frameId) {
  if (frameId !== latestFrameId) return;
  processing = true;
  pendingFrame = null;

  try {
    var inputTensor = preprocess(pixels, imgW, imgH);
    if (frameId !== latestFrameId) { processing = false; checkPending(); return; }

    var feeds = {};
    feeds[session.inputNames[0]] = inputTensor;
    session.run(feeds).then(function (output) {
      if (frameId !== latestFrameId) { processing = false; checkPending(); return; }

      var result = postprocess(output);
      if (!result || result.n < 10) {
        self.postMessage({ type: 'error', message: 'Capture: too few features (' + (result ? result.n : 0) + ')' });
        processing = false;
        checkPending();
        return;
      }

      refKeypoints = result.keypoints;
      refDescriptors = result.descriptors;
      refImgW = imgW;
      refImgH = imgH;
      refUVX = uvX;
      refUVY = uvY;
      hasReference = true;

      self.postMessage({ type: 'captured', frameId: frameId });
      processing = false;
      checkPending();
    }).catch(function (err) {
      self.postMessage({ type: 'error', message: 'Capture inference error: ' + err.message });
      processing = false;
      checkPending();
    });
  } catch (e) {
    self.postMessage({ type: 'error', message: 'Capture error: ' + e.message });
    processing = false;
    checkPending();
  }
}

// ──────────────────────────────────────────────
// 8. Relocalization pipeline
// ──────────────────────────────────────────────

function runRelocalization(pixels, imgW, imgH, frameId) {
  if (frameId !== latestFrameId) return;
  processing = true;
  pendingFrame = null;

  try {
    var inputTensor = preprocess(pixels, imgW, imgH);
    if (frameId !== latestFrameId) { processing = false; checkPending(); return; }

    var feeds = {};
    feeds[session.inputNames[0]] = inputTensor;
    session.run(feeds).then(function (output) {
      if (frameId !== latestFrameId) { processing = false; checkPending(); return; }

      var result = postprocess(output);
      if (!result || result.n < 5) {
        processing = false;
        checkPending();
        return;
      }

      if (!hasReference) {
        processing = false;
        checkPending();
        return;
      }

      var matches = matchDescriptors(
        result.descriptors, refDescriptors,
        result.n, refKeypoints.length / 2
      );

      var drift = estimateDrift(matches, result.keypoints, refKeypoints);
      if (!drift) {
        processing = false;
        checkPending();
        return;
      }

      self.postMessage({
        type: 'drift',
        dx: drift.dx,
        dy: drift.dy,
        score: drift.score,
        inliers: drift.inliers,
        total: drift.total,
        frameId: frameId
      });

      processing = false;
      checkPending();
    }).catch(function (err) {
      self.postMessage({ type: 'error', message: 'Relocalization error: ' + err.message });
      processing = false;
      checkPending();
    });
  } catch (e) {
    self.postMessage({ type: 'error', message: 'Relocalization error: ' + e.message });
    processing = false;
    checkPending();
  }
}

// ──────────────────────────────────────────────
// 9. Pending frame queue
// ──────────────────────────────────────────────

function checkPending() {
  if (pendingFrame && pendingFrame.frameId === latestFrameId) {
    var task = pendingFrame;
    pendingFrame = null;
    if (task.type === 'relocalize') {
      runRelocalization(task.pixels, task.imgW, task.imgH, task.frameId);
    } else if (task.type === 'capture') {
      captureReference(task.pixels, task.imgW, task.imgH, task.uvX, task.uvY, task.frameId);
    }
  }
}

// ──────────────────────────────────────────────
// 10. Message handler
// ──────────────────────────────────────────────

self.addEventListener('message', function (e) {
  var msg = e.data;

  switch (msg.type) {

    case 'init':
      if (typeof ort === 'undefined') {
        self.postMessage({ type: 'error', message: 'ONNX Runtime not loaded' });
        return;
      }

      ort.InferenceSession.create(msg.modelUrl || 'models/xfeat_dense.onnx', {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      }).then(function (sess) {
        session = sess;
        currentBackend = 'wasm';
        self.postMessage({ type: 'ready', backend: 'wasm' });
      }).catch(function (err) {
        self.postMessage({ type: 'error', message: 'Failed to load model: ' + err.message });
      });
      break;

    case 'capture':
      if (!session) {
        self.postMessage({ type: 'error', message: 'Model not initialized' });
        return;
      }
      latestFrameId = msg.frameId;
      if (processing) {
        pendingFrame = { type: 'capture', pixels: msg.pixels, imgW: msg.imgW, imgH: msg.imgH, uvX: msg.uvX, uvY: msg.uvY, frameId: msg.frameId };
        return;
      }
      captureReference(msg.pixels, msg.imgW, msg.imgH, msg.uvX, msg.uvY, msg.frameId);
      break;

    case 'relocalize':
      if (!session) { return; }
      if (!hasReference) { return; }
      latestFrameId = msg.frameId;
      if (processing) {
        pendingFrame = { type: 'relocalize', pixels: msg.pixels, imgW: msg.imgW, imgH: msg.imgH, frameId: msg.frameId };
        return;
      }
      runRelocalization(msg.pixels, msg.imgW, msg.imgH, msg.frameId);
      break;

    default:
      self.postMessage({ type: 'error', message: 'Unknown message: ' + msg.type });
  }
});
