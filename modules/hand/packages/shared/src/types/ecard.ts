export type ECardOccasion = "birthday" | "wedding" | "graduation" | "holiday" | "thankyou" | "custom";

export interface ECardTextConfig {
  content: string;
  font?: "Syne" | "Sora" | "serif" | "script";
  size?: number;
  color?: string;
  animation?: "typewriter" | "fadeIn" | "float" | "sparkle";
  depth?: number;
}

export interface ECardElement {
  id: string;
  type: "model" | "text" | "particle" | "light";
  assetId?: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  text?: ECardTextConfig;
}

export interface ECardConfig {
  occasion: ECardOccasion;
  recipient?: string;
  message: string;
  bgStyle: "particle" | "scene" | "gradient";
  bgPrompt?: string;
  elements: ECardElement[];
  musicPrompt?: string;
}

export const ECARD_OCCASIONS: { type: ECardOccasion; label: string; icon: string }[] = [
  { type: "birthday", label: "生日", icon: "cake" },
  { type: "wedding", label: "婚礼", icon: "heart" },
  { type: "graduation", label: "毕业", icon: "graduation" },
  { type: "holiday", label: "节日", icon: "star" },
  { type: "thankyou", label: "感谢", icon: "flower" },
  { type: "custom", label: "自定义", icon: "edit" },
];
