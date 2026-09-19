/**
 * depth-worker.js
 *
 * Web Worker for AI depth estimation using ONNX Runtime Web.
 * Runs DepthAnythingV2 (or compatible monocular depth models) entirely
 * inside a worker thread.
 *
 * API Contract:
 *   Main -> Worker:
 *     { type: 'init', modelUrl: string, backend: 'webgpu' | 'wasm' }
 *     { type: 'infer', pixels: Uint8Array, width: number, height: number, frameId: number }
 *
 *   Worker -> Main:
 *     { type: 'ready', backend: string }
 *     { type: 'depth', data: Float32Array, width: number, height: number, frameId: number }
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
// State
// ──────────────────────────────────────────────
let session = null;
let currentBackend = null;
let modelInputWidth = 224;
let modelInputHeight = 224;
let processing = false;
let pendingFrame = null;

// ──────────────────────────────────────────────
// 6. Cache management — always work on latest
// ──────────────────────────────────────────────
let latestFrameId = -1;

// ──────────────────────────────────────────────
// 3. Bilinear resize (pure JS, no dependencies)
// ──────────────────────────────────────────────

/**
 * Resize a grayscale Uint8Array to a target size using bilinear interpolation.
 * @param {Uint8Array} src  - source pixel data (grayscale)
 * @param {number}      srcW - source width
 * @param {number}      srcH - source height
 * @param {number}      dstW - target width
 * @param {number}      dstH - target height
 * @returns {Uint8Array} resized grayscale image
 */
function bilinearResize(src, srcW, srcH, dstW, dstH) {
  const dst = new Uint8Array(dstW * dstH);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      // Map destination pixel to source coordinates
      const sx = dx * xRatio;
      const sy = dy * yRatio;

      // Four nearest source neighbours
      const x1 = Math.floor(sx);
      const y1 = Math.floor(sy);
      const x2 = Math.min(x1 + 1, srcW - 1);
      const y2 = Math.min(y1 + 1, srcH - 1);

      // Fractional offsets
      const fx = sx - x1;
      const fy = sy - y1;

      // Four corner values
      const p11 = src[y1 * srcW + x1];
      const p12 = src[y2 * srcW + x1];
      const p21 = src[y1 * srcW + x2];
      const p22 = src[y2 * srcW + x2];

      // Bilinear interpolation
      const top    = p11 + fx * (p21 - p11);
      const bottom = p12 + fx * (p22 - p12);
      const value  = top + fy * (bottom - top);

      dst[dy * dstW + dx] = Math.round(value);
    }
  }

  return dst;
}

// ──────────────────────────────────────────────
// 3+5. Preprocessing & Postprocessing
// ──────────────────────────────────────────────

/**
 * Preprocess a grayscale camera frame into the normalized tensor
 * expected by DepthAnythingV2: [1, 3, 224, 224] float32.
 *
 * Steps:
 *   1. Bilinear resize to 224x224
 *   2. Triplicate grayscale -> 3-channel RGB
 *   3. Normalize:  /255  ->  (x - mean) / std   (ImageNet stats)
 */
function preprocess(pixels, srcW, srcH) {
  // Use model's expected input dimensions (set during loadModel)
  const targetW = modelInputWidth;
  const targetH = modelInputHeight;

  // Step 1: Resize to model's expected input size
  const resized = bilinearResize(pixels, srcW, srcH, targetW, targetH);

  // ImageNet normalisation constants (same as DepthAnythingV2/DINOv2)
  const mean = [0.485, 0.456, 0.406];
  const std  = [0.229, 0.224, 0.225];

  const numPixels = targetW * targetH;
  const data = new Float32Array(3 * numPixels);

  // Step 2 & 3: triplicate channel + normalise
  for (let c = 0; c < 3; c++) {
    const offset = c * numPixels;
    const invStd = 1.0 / std[c];
    for (let i = 0; i < numPixels; i++) {
      const normalized = resized[i] / 255.0;
      data[offset + i] = (normalized - mean[c]) * invStd;
    }
  }

  return new ort.Tensor('float32', data, [1, 3, targetH, targetW]);
}

/**
 * Postprocess raw model output: squeeze [1, 1, H, W] -> [H, W]
 * and normalise values to [0, 1].
 *
 * @param {ort.Tensor} outputTensor - model output
 * @returns {Float32Array} depth map of length H*W in [0, 1]
 */
function postprocess(outputTensor) {
  const raw = outputTensor.data; // Float32Array

  // Determine spatial dimensions from output shape.
  // Expected shape: [1, 1, H, W]  or  [1, H, W, 1]
  const dims = outputTensor.dims;
  let height, width;

  if (dims.length === 4) {
    // Try NCHW: [1, 1, H, W]
    if (dims[1] === 1 || dims[1] < dims[2]) {
      height = dims[2];
      width  = dims[3];
    } else {
      // NHWC: [1, H, W, 1]
      height = dims[1];
      width  = dims[2];
    }
  } else if (dims.length === 3) {
    // [1, H, W] — already squeezed
    height = dims[1];
    width  = dims[2];
  } else if (dims.length === 2) {
    // [H, W]
    height = dims[0];
    width  = dims[1];
  } else {
    // Fallback — assume square
    const side = Math.round(Math.sqrt(raw.length));
    height = side;
    width  = side;
  }

  const numPixels = height * width;
  const depth = new Float32Array(numPixels);

  // Copy and find min/max in one pass
  let minVal = Infinity;
  let maxVal = -Infinity;

  // For NCHW output [1, 1, H, W], the data is contiguous.
  // For NHWC, we might need to handle strides, but most depth models output NCHW.
  // Assume contiguous data starting at offset 0.
  for (let i = 0; i < numPixels; i++) {
    const v = raw[i];
    depth[i] = v;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }

  // Normalise to [0, 1] with epsilon to avoid division by zero
  const range = maxVal - minVal + 1e-8;
  const invRange = 1.0 / range;
  for (let i = 0; i < numPixels; i++) {
    depth[i] = (depth[i] - minVal) * invRange;
  }

  return { depth, width, height };
}

// ──────────────────────────────────────────────
// 2 + 7. Model Loading (with WASM fallback)
// ──────────────────────────────────────────────

/**
 * Attempt to create an InferenceSession with the given execution providers.
 * On failure, falls back to pure WASM.
 */
async function loadModel(modelUrl, requestedBackend) {
  let executionProviders;

  if (requestedBackend === 'webgpu') {
    // Prefer WebGPU, fall back to WASM inside ORT
    executionProviders = ['webgpu', 'wasm'];
  } else {
    executionProviders = ['wasm'];
  }

  try {
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders,
      graphOptimizationLevel: 'disabled',
    });
    currentBackend = requestedBackend;
    /* Log model input shape for debugging */
    var inputShape = session.inputNames.map(function(n) {
      var info = session.input[n];
      return n + ': ' + JSON.stringify(info.dims);
    }).join(', ');
    console.log('[DepthWorker] Model loaded, inputs:', inputShape);
    /* Store expected input dimensions for preprocessing */
    var firstInput = session.input[session.inputNames[0]];
    var inputDims = firstInput.dims;
    if (inputDims && inputDims.length === 4) {
      modelInputHeight = inputDims[2];
      modelInputWidth = inputDims[3];
      console.log('[DepthWorker] Model input size: ' + modelInputWidth + 'x' + modelInputHeight);
    }
    self.postMessage({ type: 'ready', backend: requestedBackend });
    return;
  } catch (err) {
    // First attempt failed — try pure WASM fallback
    if (requestedBackend === 'webgpu') {
      try {
        session = await ort.InferenceSession.create(modelUrl, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'disabled',
        });
        currentBackend = 'wasm';
        /* Read model input dims */
        var fbInput = session.input[session.inputNames[0]];
        var fbDims = fbInput.dims;
        if (fbDims && fbDims.length === 4) {
          modelInputHeight = fbDims[2];
          modelInputWidth = fbDims[3];
          console.log('[DepthWorker] WASM fallback input size: ' + modelInputWidth + 'x' + modelInputHeight);
        }
        self.postMessage({ type: 'ready', backend: 'wasm' });
        return;
      } catch (fallbackErr) {
        const msg = `Model load failed (WebGPU + WASM fallback): ${fallbackErr.message}`;
        self.postMessage({ type: 'error', message: msg });
        return;
      }
    }

    const msg = `Model load failed (WASM): ${err.message}`;
    self.postMessage({ type: 'error', message: msg });
  }
}

// ──────────────────────────────────────────────
// 4 + 5. Inference
// ──────────────────────────────────────────────

async function runInference(pixels, width, height, frameId) {
  // Check if this frame is still the latest
  if (frameId !== latestFrameId) return;

  processing = true;
  pendingFrame = null; // We are now processing the latest

  try {
    // Preprocess
    const inputTensor = preprocess(pixels, width, height);

    // Check again if still relevant (preprocessing took time)
    if (frameId !== latestFrameId) {
      processing = false;
      checkPending();
      return;
    }

    // Run model
    const feeds = {};
    const inputName = session.inputNames[0];
    feeds[inputName] = inputTensor;

    const output = await session.run(feeds);

    // Determine output key
    const outputName = session.outputNames[0];
    const outputTensor = output[outputName];

    // Postprocess (returns { depth, width, height })
    const result = postprocess(outputTensor);
    const depthMap = result.depth;
    const outW = result.width;
    const outH = result.height;

    // Still the latest?
    if (frameId !== latestFrameId) {
      processing = false;
      checkPending();
      return;
    }

    // Send result back (transfer for zero-copy)
    self.postMessage(
      {
        type: 'depth',
        data: depthMap,
        width: outW,
        height: outH,
        frameId,
      },
      [depthMap.buffer]
    );
  } catch (err) {
    self.postMessage({ type: 'error', message: `Inference error: ${err.message}` });
  }

  processing = false;

  // Process any frame that arrived while we were busy
  checkPending();
}

/**
 * If a frame arrived while inference was running, process the latest one.
 */
function checkPending() {
  if (pendingFrame && !processing) {
    const { pixels, width, height, frameId } = pendingFrame;
    pendingFrame = null;
    runInference(pixels, width, height, frameId);
  }
}

// ──────────────────────────────────────────────
// Message handler
// ──────────────────────────────────────────────

self.addEventListener('message', (event) => {
  const msg = event.data;

  switch (msg.type) {
    case 'init': {
      const { modelUrl, backend } = msg;
      loadModel(modelUrl, backend || 'wasm');
      break;
    }

    case 'infer': {
      const { pixels, width, height, frameId } = msg;

      // Track latest frame ID
      latestFrameId = frameId;

      if (processing) {
        // Replace pending frame — always keep only the newest
        pendingFrame = { pixels, width, height, frameId };
        return;
      }

      runInference(pixels, width, height, frameId);
      break;
    }

    default:
      self.postMessage({ type: 'error', message: `Unknown message type: ${msg.type}` });
  }
});
