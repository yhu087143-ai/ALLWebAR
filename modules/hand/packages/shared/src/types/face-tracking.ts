export interface FaceLandmarkZone {
  name: string;
  label: string;
  landmarkIndices: number[];
  color: string;
}

export interface FaceAttachmentConfig {
  id: string;
  assetId: string;
  landmarkIndex: number;
  offsetPosition: [number, number, number];
  scale: number;
  rotation: [number, number, number];
}

export const FACE_LANDMARK_ZONES: FaceLandmarkZone[] = [
  { name: "leftEye", label: "左眼", landmarkIndices: [33, 133, 159, 145], color: "#60A5FA" },
  { name: "rightEye", label: "右眼", landmarkIndices: [362, 263, 386, 374], color: "#60A5FA" },
  { name: "noseTip", label: "鼻尖", landmarkIndices: [1], color: "#C084FC" },
  { name: "noseBridge", label: "鼻梁", landmarkIndices: [168], color: "#C084FC" },
  { name: "mouth", label: "嘴巴", landmarkIndices: [13, 14, 61, 291], color: "#F472B6" },
  { name: "forehead", label: "额头", landmarkIndices: [10, 151, 9], color: "#FBBF24" },
  { name: "leftEar", label: "左耳", landmarkIndices: [234, 127], color: "#34D399" },
  { name: "rightEar", label: "右耳", landmarkIndices: [454, 356], color: "#34D399" },
  { name: "chin", label: "下巴", landmarkIndices: [152, 199], color: "#F87171" },
  { name: "leftCheek", label: "左脸颊", landmarkIndices: [205, 206], color: "#A78BFA" },
  { name: "rightCheek", label: "右脸颊", landmarkIndices: [425, 426], color: "#A78BFA" },
];

export const FACE_LANDMARK_NAMES: Record<number, string> = {
  1: "noseTip", 2: "noseBottom", 10: "foreheadTop", 152: "chin", 199: "chinBottom",
  33: "leftEyeOuter", 133: "leftEyeInner", 362: "rightEyeOuter", 263: "rightEyeInner",
  168: "noseBridge", 13: "upperLipCenter", 14: "lowerLipCenter",
  61: "leftMouthCorner", 291: "rightMouthCorner",
  234: "leftEar", 454: "rightEar",
};
