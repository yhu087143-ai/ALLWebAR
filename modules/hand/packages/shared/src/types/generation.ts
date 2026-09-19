export interface GenerationTask {
  id: string;
  userId: string;
  type: GenerationType;
  status: TaskStatus;
  input: GenerationInput;
  output?: GenerationOutput;
  progress: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type GenerationType = "text_to_3d" | "image_to_3d" | "gs_reconstruction" | "ai_modeling";

export type TaskStatus = "queued" | "processing" | "optimizing" | "completed" | "failed";

export interface GenerationInput {
  prompt?: string;
  imageUrl?: string;
  style?: string;
  polyCount?: "low" | "medium" | "high";
  pbr?: boolean;
  format?: "glb" | "gltf" | "usdz";
  resolution?: number;  // for ai_modeling provider
  provider?: string;    // "ai_modeling" for self-hosted engine
}

export interface GenerationOutput {
  assetId: string;
  fileUrl: string;
  thumbnailUrl?: string;
  format: string;
  polyCount: number;
  fileSize: number;
}

export interface GenerationProgress {
  taskId: string;
  status: TaskStatus;
  progress: number;
  step: string;
}
