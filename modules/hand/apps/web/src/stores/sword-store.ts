import { create } from 'zustand';
import type { SwordState, GestureType } from '@project1xr/engine';

interface SwordStore {
  swordState: SwordState;
  currentGesture: GestureType | null;
  swingCount: number;
  lastSwingTime: number | null;
  comboCount: number;
  isVisible: boolean;

  setSwordState: (state: SwordState) => void;
  setCurrentGesture: (gesture: GestureType | null) => void;
  incrementSwing: () => void;
  reset: () => void;
  setVisible: (v: boolean) => void;
}

export const useSwordStore = create<SwordStore>((set) => ({
  swordState: 'IDLE',
  currentGesture: null,
  swingCount: 0,
  lastSwingTime: null,
  comboCount: 0,
  isVisible: false,

  setSwordState: (swordState) => set({ swordState }),
  setCurrentGesture: (currentGesture) => set({ currentGesture }),
  incrementSwing: () => set((s) => {
    const now = Date.now();
    return {
      swingCount: s.swingCount + 1,
      lastSwingTime: now,
      comboCount: (now - (s.lastSwingTime || 0)) < 2000 ? s.comboCount + 1 : 1,
    };
  }),
  reset: () => set({
    swordState: 'IDLE', currentGesture: null, swingCount: 0,
    lastSwingTime: null, comboCount: 0,
  }),
  setVisible: (isVisible) => set({ isVisible }),
}));
