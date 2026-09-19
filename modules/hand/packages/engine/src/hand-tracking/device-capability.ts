import type { DeviceCapability } from './types';

let cachedPromise: Promise<DeviceCapability> | null = null;

export async function detectDeviceCapability(): Promise<DeviceCapability> {
  if (cachedPromise) return cachedPromise;

  cachedPromise = (async () => {
    const ua = navigator.userAgent;
    // iPadOS 13+ reports desktop UA — use touch points heuristic
    const isMobile = /android|iphone|ipad|ipod/i.test(ua)
      || (navigator.maxTouchPoints > 1 && /Mac/.test(ua));

    const hasWebGL = (() => {
      try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl') || canvas.getContext('webgl2'));
      } catch { return false; }
    })();

    const hasWebGPU = 'gpu' in navigator;
    const hasWasm = typeof WebAssembly === 'object';

    let recommendedBackend: 'webgpu' | 'webgl' | 'wasm' = 'wasm';
    if (hasWebGPU) recommendedBackend = 'webgpu';
    else if (hasWebGL) recommendedBackend = 'webgl';

    let tier: 'high' | 'medium' | 'low';
    let recommendedFps: number;
    let modelTier: 'full' | 'lite';

    if (hasWebGPU && !isMobile) {
      tier = 'high';
      recommendedFps = 60;
      modelTier = 'full';
    } else if (hasWebGL && !isMobile) {
      tier = 'medium';
      recommendedFps = 30;
      modelTier = 'full';
    } else if (hasWebGL) {
      tier = 'medium';
      recommendedFps = 30;
      modelTier = 'lite';
    } else {
      tier = 'low';
      recommendedFps = 15;
      modelTier = 'lite';
    }

    return { tier, webgpu: hasWebGPU, webgl: hasWebGL, wasm: hasWasm, recommendedBackend, recommendedFps, modelTier };
  })();

  return cachedPromise;
}
