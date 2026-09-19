export interface Project {
  id: string;
  userId: string;
  name: string;
  type: ProjectType;
  metadata: ProjectMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectType = "ar_simple" | "ar_project" | "unity_project" | "gs_scene";

export interface ProjectMetadata {
  description?: string;
  thumbnail?: string;
  arConfig?: Record<string, unknown>;
  unitySettings?: Record<string, unknown>;
  tags?: string[];
}
