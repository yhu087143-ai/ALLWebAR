export type AnimationType = "rotate" | "float" | "pulse" | "orbit" | "spiral" | "custom";

export type AnimationEasing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "bounce";

export interface AnimationKeyframe {
  time: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export interface AnimationParameters {
  axis?: "x" | "y" | "z" | "xy" | "all";
  speed?: number;
  amplitude?: number;
  radius?: number;
  clockwise?: boolean;
}

export interface AnimationConfig {
  id?: string;
  assetId?: string;
  name: string;
  type: AnimationType;
  duration: number;
  loop: boolean;
  easing: AnimationEasing;
  parameters: AnimationParameters;
  keyframes?: AnimationKeyframe[];
}

export const ANIMATION_PRESETS: { type: AnimationType; name: string; label: string; icon: string }[] = [
  { type: "rotate", name: "rotate", label: "旋转", icon: "rotate" },
  { type: "float", name: "float", label: "浮动", icon: "float" },
  { type: "pulse", name: "pulse", label: "脉冲", icon: "pulse" },
  { type: "orbit", name: "orbit", label: "轨道", icon: "orbit" },
  { type: "spiral", name: "spiral", label: "螺旋", icon: "spiral" },
  { type: "custom", name: "custom", label: "自定义", icon: "custom" },
];
