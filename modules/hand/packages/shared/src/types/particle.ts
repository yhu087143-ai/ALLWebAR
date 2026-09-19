export type ParticleEffectType = "sparkle" | "fire" | "smoke" | "magic" | "celebration" | "trail" | "burst";

export type ParticleTrigger = "onLoad" | "onClick" | "onComplete" | "continuous";

export interface ParticleEffectConfig {
  id: string;
  type: ParticleEffectType;
  trigger: ParticleTrigger;
  position: [number, number, number];
  count: number;
  color: [number, number, number];
  spread?: number;
  lifetime?: number;
  size?: number;
  enabled: boolean;
}

export const PARTICLE_PRESETS: { type: ParticleEffectType; label: string; color: string }[] = [
  { type: "sparkle", label: "星光", color: "#FFD700" },
  { type: "fire", label: "火焰", color: "#FF4500" },
  { type: "smoke", label: "烟雾", color: "#808080" },
  { type: "magic", label: "魔法", color: "#C084FC" },
  { type: "celebration", label: "庆祝", color: "#60A5FA" },
  { type: "trail", label: "拖尾", color: "#F472B6" },
  { type: "burst", label: "爆发", color: "#FFFFFF" },
];
