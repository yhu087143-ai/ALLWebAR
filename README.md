# AllWebAR — 浏览器 AR 技术平台

> 无需安装 App，浏览器打开摄像头即可运行 AR。
> 包含图片追踪、人脸追踪、平面放置、WebXR、手势识别、GPS 导览、全景穹顶与 AI 资产生成，并提供可视化创作台与一键发布闭环。

## 📺 演示视频

> 视频制作中，稍后补上。

## 功能与使用

### 图片追踪

摄像头识别指定图片后，把 3D 模型、视频或网页内容锚定在图片上方。

- **怎么用**：创作台上传触发图 → 后端自动编译成 `.mind` 追踪包 → 编辑器绑定模型 → 发布后对着图片打开即触发
- **多目标同屏**：把同一物体的多角度照片编进同一个 `.mind`，配置里声明 `maxTrack`，每个目标各自建锚、各自挂内容
- **换图即换体验**：后端提供编译 API，传一张新图就得到一个新的追踪包

### 人脸追踪

定位人脸特征点，把模型、面具、贴纸按面部分区（鼻梁、额头、耳侧等）挂载对位。

- **怎么用**：选择人脸追踪类型 → 配置面部特征与分区 → 发布
- **适合**：面具、眼镜试戴、脸贴特效类玩法

### 平面放置

通过陀螺仪在真实地面上放置模型：米制尺度、真实比例，落地后可拖拽、旋转、调整位置和缩放。

- **怎么用**：打开体验页 → 扫描地面 → 点击放置圆环落模型 → 底部工具栏调位置/缩放/旋转

### WebXR

在支持的设备上直接使用浏览器原生 AR 能力：hit-test、深度、遮挡，六自由度。

- **怎么用**：安卓 Chrome 打开发布链接即可，无需额外配置

### 传感器四级降级

WebXR → Madgwick 姿态解算 → Generic Sensor → DeviceOrientation，四级自动降级、自动仲裁：不同设备、不同浏览器都能拿到可用的姿态数据。追踪管线缺少某个模块时按模块跳过，会话继续。

- **怎么用**：无需配置，引擎启动时自动探测并选择可用路径

### 全景穹顶

平面放置后，在用户周围展开一个 360° 全景穹顶，把整个场景包裹进来，可随时收回。展开伴随 1.2 秒显形动画、粒子与空间音频环绕声场。

- **怎么用**：体验页 URL 加 `?dome=1` → 底部出现「展开穹顶」按钮
- **换全景图**：`domeConfig.textureUrl` 指定任意等距柱状全景图（支持 8K），或用全景页 `?tex=` 直接载入
- **适合**：展厅、博物馆、星球漫游类沉浸体验

### GPS 导览

GuideEngine + POI 体系 + HUD 指针，支持沙盘与 AR 双模式。

- **怎么用**：导览编辑器里添加点位、编排路线 → 发布 → 观众打开 `/guide/:id`，跟随 HUD 箭头走完整条故事线

### 游戏引擎层

在 AR 场景上叠加玩法逻辑：波次刷怪、收集判定、计分 HUD、交互事件系统（点击 / 接近 / 定时触发）。

- **怎么用**：创作台配置交互事件与动效参数（自转、浮动、拖拽旋转、位置偏移、整体缩放），发布即玩

### 可视化创作台 + 一键发布

可视化 3D/AR 编辑器与统一创作台 → 后端落库 → 自动生成链接和二维码 → 手机打开即看。

- **怎么用**：首页进入创作台 → 组合追踪能力、绑定模型、调参数 → 点发布 → 把二维码发给观众

### AI 资产生成（ComfyUI）

通过 ComfyUI 生成 AR 素材，产物直接进入素材库：

- **文生贴图**：一句提示词生成材质贴图，贴到 AR 模型表面
- **图生图风格化**：识别到触发图或现场拍一张，重绘成新风格叠加进场景
- **触发图增强**：把低对比度的触发图重绘成高识别率版本，重新编译成 `.mind`

- **怎么用**：本机运行 ComfyUI（端口 8188）后自动连接；三种触发方式——文本输入（创作期）、图片识别命中（运行时）、手势命中（运行时）；没有显卡时在 `backend/.env` 设 `COMFYUI_MOCK=1` 走降级产物

### 手势识别（可选模块）

MediaPipe 手部 21 关键点检测与手势判定，接入平台触发体系。

- **怎么用**：`node _launcher.mjs --only hand`，打开 `https://localhost:3011/test-hand`

## 🚀 快速开始

```bash
# 1) 安装依赖
cd ar-platform && npm install
cd ../modules/xr-engine && npm install
cd ../modules/hand && pnpm install        # 可选模块

# 2) 本地 HTTPS 证书（手机真机测试需要；纯 localhost 可跳过）
mkcert -install
cd ar-platform/frontend
mkcert -cert-file certs/local.pem -key-file certs/local-key.pem localhost <你的局域网IP>

# 3) 一键启动（Windows）
一键启动所有.bat        # 后端 :3001 + 前端 :5180 + XR创作台 :5174
```

打开 `https://localhost:5180` → 进入创作台 → 发布 → 手机打开 `/view/:id`。

改了引擎源码后重新构建：

```bash
cd ar-platform/ar-engine && npx vite build && npx tsc --emitDeclarationOnly
```

## 📁 目录结构

```
ar-platform/            核心平台（workspaces）
├── ar-engine/          TypeScript AR 引擎：追踪 / 导览 / 游戏 / 特效 / 动效
├── frontend/           Vite + React：创作台 / 观看页 / 展示
└── backend/            Express：发布闭环 / .mind 编译 / ComfyUI 代理
modules/
├── xr-engine/          可视化 XR 创作台
└── hand/               手势识别（可选）
_launcher.mjs           单窗口启动器（服务表唯一定义处，支持 --only / --skip / --stop）
```

## 🙏 致谢

追踪能力部分基于 [8th Wall XR Engine](https://github.com/8thwall/8thwall)（Niantic Spatial 开源项目）与 MindAR、MediaPipe、Three.js 等开源项目，许可信息详见 [LICENSE](LICENSE)。

## 📄 许可证

主体 **Apache2.0** —— 自由使用、修改、二次开发、商用均可，请不要擅自修改就发布（详见 [LICENSE](LICENSE)）。
