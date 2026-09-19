'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DeviceCapability, GestureResult } from '@project1xr/engine';

export type DegradationLevel = 'full' | 'reduced' | 'minimal' | 'fallback';

export function useTrackingDegradation(
  deviceCapability: DeviceCapability | null,
  currentGesture: GestureResult | null,
  trackingFps: number,
) {
  const [level, setLevel] = useState<DegradationLevel>('full');
  const lowFpsCount = useRef(0);

  const assess = useCallback(() => {
    if (!deviceCapability) {
      setLevel('fallback');
      return;
    }

    // Device capability based degradation
    if (deviceCapability.tier === 'low') {
      setLevel('minimal');
      return;
    }

    // FPS based degradation
    if (trackingFps < 10) {
      lowFpsCount.current++;
    } else {
      lowFpsCount.current = Math.max(0, lowFpsCount.current - 1);
    }

    if (lowFpsCount.current > 30) { // Sustained low fps for ~1 second
      setLevel('reduced');
    } else {
      setLevel('full');
    }

    // Confidence based degradation
    if (currentGesture && currentGesture.confidence < 0.3 && level !== 'reduced') {
      setLevel('reduced');
    }
  }, [deviceCapability, currentGesture, trackingFps, level]);

  useEffect(() => {
    const interval = setInterval(assess, 1000);
    return () => clearInterval(interval);
  }, [assess]);

  return level;
}
