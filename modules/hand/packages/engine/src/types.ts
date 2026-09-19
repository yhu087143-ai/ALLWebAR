export type { SceneConfig } from "./scene";
export type { ARSceneConfig } from "./ar-scene";

export type TrackingType = "image" | "face" | "plane" | "world";

export interface ARConfig {
  modelUrl?: string;
  tracking: TrackingType;
  scale: number;
  position: [number, number, number];
  targetUrl: string;
  filterMinCF?: number;
  filterBeta?: number;
  missTolerance?: number;
  warmupTolerance?: number;
  faceFeature?: number;
  modelScale?: number;
  modelPosition?: number[];
}
