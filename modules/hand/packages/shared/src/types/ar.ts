export interface ARExperience {
  id: string;
  userId: string;
  projectId?: string;
  assetId: string;
  asset?: { id: string; fileUrl: string; name: string; thumbnailUrl?: string };
  trackingType: TrackingType;
  config: ARConfig;
  publishedUrl?: string;
  qrCodeUrl?: string;
  viewCount: number;
  miniProgramConfig?: MiniProgramConfig;
  createdAt: Date;
  updatedAt: Date;
}

export type TrackingType = "image" | "face" | "plane" | "nft" | "hand" | "body" | "marker" | "location" | "none";

export interface ARConfig {
  modelPosition: [number, number, number];
  modelScale: number;
  modelRotation: [number, number, number];
  trackingImageUrl?: string;
  interactions: ARInteraction[];
  uiOverlays: UIOverlay[];
}

export interface ARInteraction {
  type: "tap_animation" | "pinch_zoom" | "rotate" | "link";
  trigger: string;
  action: string;
  params?: Record<string, unknown>;
}

export interface UIOverlay {
  type: "text" | "button" | "image";
  content: string;
  position: "top" | "bottom" | "center";
  style?: Record<string, string>;
}

export interface MiniProgramConfig {
  enabled: boolean;
  appId?: string;
  path?: string;
  xrFrameConfig?: Record<string, unknown>;
}
