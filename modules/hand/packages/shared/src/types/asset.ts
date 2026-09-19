export interface Asset {
  id: string;
  userId: string;
  projectId?: string;
  name: string;
  type: AssetType;
  format: ModelFormat;
  source: AssetSource;
  fileUrl: string;
  thumbnailUrl?: string;
  fileSize: number;
  polygonCount?: number;
  generationPrompt?: string;
  metadata: AssetMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export type AssetType = "model" | "texture" | "animation" | "gs_splat";

export type ModelFormat = "glb" | "gltf" | "usdz" | "fbx" | "obj" | "ply" | "splat";

export type AssetSource = "ai_generated" | "uploaded" | "gs_reconstructed";

export interface AssetMetadata {
  materials?: MaterialInfo[];
  animations?: AnimationInfo[];
  boundingBox?: BoundingBox;
  textureSize?: { width: number; height: number };
}

export interface MaterialInfo {
  name: string;
  pbr?: boolean;
  textures: string[];
}

export interface AnimationInfo {
  name: string;
  duration: number;
  tracks: number;
}

export interface BoundingBox {
  min: [number, number, number];
  max: [number, number, number];
}
