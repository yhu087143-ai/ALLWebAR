'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { RefObject } from 'react';
import { GestureEngine, detectDeviceCapability, IntentPredictor, SwordStateMachine } from '@project1xr/engine';
import { MediaPipeProvider } from '@project1xr/engine';
import type { GestureResult, DeviceCapability } from '@project1xr/engine';
import { useSwordStore } from '../stores/sword-store';

export interface HandTrackingState {
  isTracking: boolean;
  currentGesture: GestureResult | null;
  deviceCapability: DeviceCapability | null;
  error: string | null;
  fps: number;
}

export function useHandTracking(videoRef: RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<HandTrackingState>({
    isTracking: false,
    currentGesture: null,
    deviceCapability: null,
    error: null,
    fps: 0,
  });

  const engineRef = useRef<GestureEngine | null>(null);
  const providerRef = useRef<MediaPipeProvider | null>(null);
  const animFrameRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const fpsTimerRef = useRef(0);
  const predictorRef = useRef<IntentPredictor | null>(null);
  const stateMachineRef = useRef<SwordStateMachine | null>(null);
  const skipCounterRef = useRef(0);
  const predictFrameCounterRef = useRef(0);
  const deviceCapRef = useRef<DeviceCapability | null>(null);
  const fpsRef = useRef(0);
  const trackingRef = useRef(false); // guard against double-start
  const startingRef = useRef(false); // concurrent init guard

  const stopTracking = useCallback(() => {
    trackingRef.current = false;
    startingRef.current = false;
    cancelAnimationFrame(animFrameRef.current);
    predictorRef.current?.clear();
    providerRef.current?.stop();
    engineRef.current?.dispose();
    stateMachineRef.current?.reset();
    setState(s => ({ ...s, isTracking: false, currentGesture: null }));
  }, []);

  const startTracking = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;

    if (trackingRef.current) {
      stopTracking();
      startingRef.current = true; // restore guard — stopTracking() sets it to false
      await new Promise(r => setTimeout(r, 50));
    }

    try {
      const cap = await detectDeviceCapability();
      if (!startingRef.current) return; // aborted
      deviceCapRef.current = cap;
      setState(s => ({ ...s, deviceCapability: cap }));

      const engine = new GestureEngine({
        modelBaseUrl: '/models',
        staticModelPath: 'gesture_static.int8.onnx',
        dynamicModelPath: 'gesture_dynamic.int8.onnx',
      });
      await engine.initialize();
      if (!startingRef.current) return;
      engineRef.current = engine;

      const predictor = new IntentPredictor(engine, 15);
      predictorRef.current = predictor;

      const stateMachine = new SwordStateMachine((t) => {
        const store = useSwordStore.getState();
        store.setSwordState(t.to);
        if (t.to === 'SWING') store.incrementSwing();
      });
      stateMachineRef.current = stateMachine;

      const provider = new MediaPipeProvider();
      await provider.initialize();
      if (!startingRef.current) return;
      providerRef.current = provider;

      const vid = videoRef.current;
      if (!vid) throw new Error('Video element not found');
      await provider.startCamera(vid);
      if (!startingRef.current) return;

      trackingRef.current = true;
      setState(s => ({ ...s, isTracking: true, error: null }));
      startLoop();
    } catch (err) {
      trackingRef.current = false;
      setState(s => ({
        ...s,
        error: `Failed to start tracking: ${err instanceof Error ? err.message : 'unknown error'}`,
      }));
    } finally {
      startingRef.current = false;
    }
  }, [videoRef, stopTracking]);

  const startLoop = () => {
    fpsTimerRef.current = Date.now();
    frameCountRef.current = 0;

    const loop = async () => {
      if (!trackingRef.current) return;

      try {
        if (!providerRef.current || !engineRef.current || !stateMachineRef.current) return;

        const cap = deviceCapRef.current;
        const recFps = cap?.recommendedFps ?? 30;
        const currentFps = frameCountRef.current > 0 ? (fpsRef.current || recFps) : recFps;

        let shouldSkip = false;
        if (currentFps < recFps / 2) {
          shouldSkip = skipCounterRef.current % 3 !== 0;
        } else if (currentFps < recFps * 0.8) {
          shouldSkip = skipCounterRef.current % 2 !== 0;
        }

        if (!shouldSkip) {
          const frame = await providerRef.current.detect(videoRef.current ?? undefined);
          if (frame?.landmarks) {
            engineRef.current.pushFrame(frame.landmarks.landmarks63);
            const result = await engineRef.current.classify(frame.landmarks.landmarks63);

            stateMachineRef.current.update(result, frame.landmarks.landmarks63, Date.now());

            predictorRef.current?.push(result);
            predictFrameCounterRef.current++;

            if (predictFrameCounterRef.current % 15 === 0) {
              const dynamicResult = await predictorRef.current?.predict();
              if (dynamicResult) {
                setState(s => ({ ...s, currentGesture: dynamicResult }));
              } else {
                setState(s => ({ ...s, currentGesture: result }));
              }
            } else {
              setState(s => ({ ...s, currentGesture: result }));
            }
          }
        }

        skipCounterRef.current++;
        frameCountRef.current++;
        const elapsed = (Date.now() - fpsTimerRef.current) / 1000;
        if (elapsed >= 1) {
          const calculatedFps = Math.round(frameCountRef.current / elapsed);
          setState(s => ({ ...s, fps: calculatedFps }));
          fpsRef.current = calculatedFps;
          frameCountRef.current = 0;
          fpsTimerRef.current = Date.now();
        }
      } catch (e) {
        console.warn('[HandTracking] Loop error:', e);
      }

      if (trackingRef.current) {
        animFrameRef.current = requestAnimationFrame(loop);
      }
    };

    animFrameRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    return () => { stopTracking(); };
  }, [stopTracking]);

  return { ...state, startTracking, stopTracking };
}
