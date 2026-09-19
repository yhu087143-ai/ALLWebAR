'use client';

import { useRef, useCallback, useState } from 'react';
import { SwordStateMachine } from '@project1xr/engine';
import type { GestureResult, SwordState, SwordTransition } from '@project1xr/engine';

export interface SwordSwingState {
  swordState: SwordState;
  lastTransition: SwordTransition | null;
  swingCount: number;
}

export function useSwordSwing() {
  const [state, setState] = useState<SwordSwingState>({
    swordState: 'IDLE',
    lastTransition: null,
    swingCount: 0,
  });

  const stateMachineRef = useRef<SwordStateMachine | null>(null);

  if (!stateMachineRef.current) {
    stateMachineRef.current = new SwordStateMachine((t: SwordTransition) => {
      setState(s => ({
        ...s,
        swordState: t.to,
        lastTransition: t,
        swingCount: t.to === 'SWING' ? s.swingCount + 1 : s.swingCount,
      }));
    });
  }

  const updateGesture = useCallback((gesture: GestureResult, landmarks: Float32Array, timestamp: number) => {
    const sm = stateMachineRef.current;
    if (!sm) return;
    const newState = sm.update(gesture, landmarks, timestamp);
    setState(s => ({ ...s, swordState: newState }));
  }, []);

  const reset = useCallback(() => {
    stateMachineRef.current?.reset();
    setState({ swordState: 'IDLE', lastTransition: null, swingCount: 0 });
  }, []);

  return { ...state, updateGesture, reset };
}
