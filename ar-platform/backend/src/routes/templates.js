import { Router } from 'express';

const router = Router();

const TEST_MODEL_URL = '/models/helmet-compressed.glb';
const FOX_MODEL_URL = '/models/fox.glb';

const templates = [
  {
    id: 'tpl-image-track',
    name: '图片识别 AR',
    description: '扫描图片触发 AR 内容。上传一张图片作为识别目标，在上面叠加 3D 模型或视频。适用于海报、名片、产品包装等印刷品。',
    longDescription: '用户扫描指定图片 → 识别成功 → 数字内容出现在图片上方。支持 3D 模型（带动画）和视频两种内容类型，需上传目标图片。',
    previewUrl: '',
    trackingType: 'image',
    defaultScale: 0.8,
    defaultModelUrl: TEST_MODEL_URL,
    defaultConfig: { scale: 0.8, modelUrl: TEST_MODEL_URL },
    useCases: ['海报/画册增强', '产品展示', '名片互动', '教育教具'],
  },
  {
    id: 'tpl-face-track',
    name: '面部特效 AR',
    description: '面部识别与特效。摄像头识别人脸后叠加 3D 内容，适合滤镜、虚拟试戴、互动营销等场景。',
    longDescription: '摄像头检测到人脸 → 3D 内容跟随人脸移动。无需任何标记图片，即开即用。',
    previewUrl: '',
    trackingType: 'face',
    defaultScale: 1,
    defaultModelUrl: TEST_MODEL_URL,
    defaultConfig: { scale: 1, modelUrl: TEST_MODEL_URL },
    useCases: ['虚拟试戴', '面部滤镜', '互动营销'],
  },
  {
    id: 'tpl-plane-place',
    name: '平面放置 AR',
    description: '在桌面上放置虚拟物体。无需标记图片，摄像头检测水平面后将 3D 模型或视频放在上面，适合家具预览、教育演示。',
    longDescription: '摄像头扫描水平面（桌面/地面）→ 检测到平面 → 内容出现在平面上。无需追踪图片，支持 3D 模型和视频。',
    previewUrl: '',
    trackingType: 'plane',
    defaultScale: 1,
    defaultModelUrl: TEST_MODEL_URL,
    defaultConfig: { scale: 1, modelUrl: TEST_MODEL_URL, engine: '8thwall' },
    useCases: ['家具摆放预览', '产品展示', '教育演示'],
  },
  {
    id: 'tpl-world-track',
    name: '自定义 AR',
    description: 'AI 自动设计 — 用一句话描述你想要的 AR 体验，AI 自动生成并发布，无需任何操作。',
    longDescription: '输入文字描述，AI 自动选择合适的追踪方式、模型、动画和交互规则。支持图片追踪、面部特效、平面放置和空间定位。零门槛创建 AR 体验。',
    previewUrl: '',
    trackingType: 'ai',
    defaultScale: 1,
    defaultModelUrl: TEST_MODEL_URL,
    defaultConfig: {},
    useCases: ['一句话生成', 'AI 自动设计', '零门槛'],
  },
];

router.get('/', (req, res) => {
  res.json(templates);
});

export default router;
