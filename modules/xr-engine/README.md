# XR 引擎 · Web 3D/XR 编辑器框架

一个跑在浏览器里的类游戏引擎框架：场景编辑器 + 实时渲染 + 特效系统 + 资产管线 + AI 建模 + AR 出口。

技术栈：**Vite + React 19 + TypeScript + Three.js + React Three Fiber**。

---

## 快速开始

```bash
npm install
node scripts/copy-decoders.mjs   # 复制 Draco/Basis 解码器到 public/
npm run dev                       # http://localhost:5173
```

首次启动会自动建一个起步场景（环境光 + 主光源 + 地面 + 立方体）。
编辑器每隔 600ms 自动把场景存进 localStorage，刷新页面不会丢。

只跑前端不需要任何后端 —— 用「AI 建模」页里的**内置演示**提供方即可走通整条生成链路。

其他命令：

```bash
npm run typecheck   # TypeScript 类型检查
npm run build       # 类型检查 + 生产构建
npm run preview     # 预览构建产物
```

---

## 架构

```
┌─ 编辑器层 ────────────────────────────────────────────┐
│  视口 / 层级树 / 检查器 / 资产库 / 特效面板 / AI / AR        │
└───────────────────────────────────────────────────────┘
                        ↕ 单向数据流
┌─ 引擎层（纯 TypeScript，不含任何 React）─────────────────┐
│  SceneGraph · Engine · AssetDatabase · ModelPipeline      │
│  PostFX · ARController · EventBus                        │
└───────────────────────────────────────────────────────┘
                        ↕
┌─ 渲染层 ─────────────────────────────────────────────┐
│  Three.js · R3F · 后处理链 · GPGPU 粒子 · PMREM 环境       │
└───────────────────────────────────────────────────────┘
```

**核心设计：场景图是纯数据，不持有 `THREE.Object3D`。**

`SceneGraph` 里存的是可序列化的 JSON 节点树，R3F 负责把它映射成 Three.js 对象树。
这样做的好处：

- 序列化和撤销栈是天然支持的
- 引擎层完全不依赖 React，可以单独抽成 npm 包、在 Node 里跑
- 将来接协同编辑时，数据同步和渲染是解耦的

数据流是单向的：

```
UI action → Engine 方法 → EventBus 广播 → zustand 更新 → React 重渲染
```

UI 永远不直接改引擎内部的节点对象。

### 目录结构

```
src/
├── engine/                 引擎层（纯 TS，无 React 依赖）
│   ├── core/
│   │   ├── Engine.ts       门面：持有所有子系统，管项目序列化与自动保存
│   │   ├── SceneGraph.ts   场景图：扁平表 + 根序列表，O(1) 查找
│   │   ├── factory.ts      节点默认值、几何参数表
│   │   ├── EventBus.ts     类型化事件总线
│   │   ├── events.ts       事件契约
│   │   └── types.ts        全部数据模型
│   ├── assets/
│   │   ├── AssetDatabase.ts  资产库（内存 + localStorage 元数据）
│   │   ├── loader.ts         glTF 加载器（Draco / KTX2 / meshopt）
│   │   └── optimizer.ts      网格优化 + AR 性能预算检查
│   ├── ai3d/
│   │   ├── types.ts        提供方接口与目录
│   │   ├── providers.ts    远程 Provider / 离线演示 Provider
│   │   └── pipeline.ts     生成 → 优化 → 入库 编排
│   ├── xr/
│   │   ├── capabilities.ts 设备能力探测与降级策略
│   │   ├── ARSession.ts    WebXR AR 会话 + 平面检测
│   │   └── usdz.ts         iOS USDZ 降级
│   └── render/
├── editor/                 编辑器层（React）
│   ├── store.ts            zustand：引擎事件 → React 状态
│   ├── EditorApp.tsx       布局与快捷键
│   ├── panels/             视口 / 层级树 / 检查器 / 资产库 / 特效 / AI / AR
│   ├── scene/              场景渲染：节点映射、粒子、环境、后处理
│   └── ui/controls.tsx     通用表单控件
└── styles.css

server/
├── main.py                 AI 建模后端（FastAPI）
├── requirements.txt
└── .env.example
```

---

## 功能模块

### 编辑器

| 能力 | 说明 |
|---|---|
| 场景层级 | 拖拽改层级、可见性/锁定开关、复制删除 |
| 检查器 | 按节点类型动态生成控件（几何参数、材质、灯光、粒子） |
| 变换 Gizmo | 移动 / 旋转 / 缩放，直接写回场景数据 |
| 项目持久化 | 自动存 localStorage，可导出/导入 `.json` 工程文件 |
| 导出 | 一键导出当前场景为 `.glb` |

快捷键：`W` 移动 / `E` 旋转 / `R` 缩放 / `Delete` 删除 / `Ctrl+D` 复制 / `Esc` 取消选中。

### 特效

- **后处理链**：Bloom、景深、暗角、色散、胶片噪点、AGX 色调映射。
  全部关闭时不创建 EffectComposer，零开销。
- **粒子系统**：位置完全在顶点着色器里算，CPU 每帧只更新一个 `uTime`，
  十万级粒子也不占主线程。四个预设：火焰 / 烟雾 / 能量 / 飘雪。
- **环境光照**：用 PMREM 从程序化场景实时烘焙，**不依赖任何外部 HDRI 文件**。
  这是刻意的 —— drei 的 `Environment preset` 会把 HDRI 托管在外部 CDN 上，
  离线或受限网络下会直接加载失败导致场景全黑。

### 资产管线

- 导入 glTF/GLB（支持 Draco、KTX2、meshopt 压缩格式）
- 自动统计三角面 / 材质 / 贴图 / 动画
- 浏览器端优化：焊接顶点、去重、剪枝、量化、扁平化、合并 primitive
- AR 性能预算检查：超过 10 万面 / 8 材质 / 6 贴图会打上「超预算」标记

> **已知限制**：资产二进制目前只存在内存里（blob URL），刷新页面后失效。
> 生产环境需要把 blob 存进 IndexedDB。

### AI 建模

统一接口 + 双通道：

| 提供方 | 位置 | 显存 | 说明 |
|---|---|---|---|
| 内置演示 | 前端 | — | 程序化几何体，无需后端，验证流水线用 |
| InstantMesh | 本机 GPU | 6-8GB | 多视图重建，10-20 秒 |
| TripoSR | 本机 GPU | ~6GB | 单图快速重建，约 1 秒 |
| Tripo3D | 云端 | — | 带 PBR 贴图，30-60 秒，按次计费 |

**所有请求都经过本地后端代理，浏览器不直连第三方 API**：

1. 绕开 CORS 限制
2. API Key 不暴露在前端
3. 本地 GPU 推理本来就只能在后端跑

前端对 local / cloud 两种后端是同一套代码，切换只改一个 provider id。

启动后端：

```bash
pip install -r server/requirements.txt
cp server/.env.example server/.env     # 填入 InstantMesh 目录或 Tripo API Key
python server/main.py
```

然后把前端「AI 建模」页的后端地址填成 `http://127.0.0.1:8787`。

### AR

| 平台 | 方案 |
|---|---|
| Android Chrome / Meta Quest | WebXR `immersive-ar`，支持平面检测与锚点放置 |
| iOS Safari | **不支持 WebXR**，需转 USDZ 走 AR Quick Look |
| 桌面 | 降级为 3D 预览 |

进入 AR 后移动设备扫描平面，场景自动吸附到检测到的表面，轻触屏幕锁定位置。

USDZ 转换需要本地工具链（Blender 的 USD 导出、Apple usdzconvert 或开源转换器），
后端已预留 `/api/v1/usdz` 接口，默认用 Blender 实现。

---

## 技术选型说明

**为什么选 Three.js 而不是 Babylon.js？**

Babylon 开箱即用感更强（自带 Inspector、Node Material），但这个项目的三条链路
—— glTF 工具链、R3F 编辑器生态、AI 3D 生成产物 —— 全都围绕 Three.js 转。
而且要的是「自己搭框架」，Three.js 的底层可控性更合适。

**为什么是 R3F 而不是直接用 Three.js 写？**

编辑器 UI 本身就是一棵组件树，用声明式渲染天然契合。
OrbitControls / TransformControls / Gizmo 这些 drei 都有成熟实现，没必要重写。

**为什么不用 Next.js？**

编辑器是纯客户端应用，SSR 在这里是纯粹的负担
（所有 3D 组件都得 `dynamic import` 禁用 SSR）。Vite 更轻、HMR 更快。

---

## 插件系统

引擎支持热插拔。插件可以注册这些能力：

| 能力 | 接口 |
|---|---|
| AI 建模提供方 | `ctx.registerProvider(provider)` |
| 自定义节点类型 | `ctx.registerNodeType(descriptor)` |
| 编辑器面板 | `ctx.registerPanel(panel)` |
| 后处理特效 | `ctx.registerEffect(id, factory)` |
| 资产处理器 | `ctx.registerAssetProcessor(name, fn)` |

每个注册方法都返回反注册函数，插件卸载时自动调用，不需要自己记账：

```ts
import { engine } from '@/editor/store'

engine.plugins.register({
  id: 'my-plugin',
  name: '我的插件',
  version: '1.0.0',
  install(ctx) {
    const off = ctx.bus.on('graph:changed', () => {
      /* ... */
    })
    return off // 返回值即卸载钩子
  },
})
```

安装过程中抛异常会自动回滚已注册的部分，不会留下半截状态。

## 移动端画质自适应

内置插件 `builtin.quality`：启动时用 `detect-gpu` 查 GPU 档位定初始值，
之后按实测帧率自动降档。

| 档位 | DPR | 阴影 | 粒子上限 | 后处理 |
|---|---|---|---|---|
| 流畅 (low) | 1–1.25 | 关 | 1.5k | 整条链关闭 |
| 均衡 (medium) | 1–1.5 | 开 (1024) | 6k | Bloom + 暗角 + 色调映射 |
| 高画质 (high) | 1–2 | 开 (2048) | 30k | 全部效果 |

降档条件：平均帧率低于 24 且持续 8 个采样点，冷却 5 秒，避免反复横跳。
移动端会**自动保守一档** —— 同样的 GPU 档位，手机的持续性能远不如桌面
（散热降频是真实存在的）。

后处理是**两层开关**：用户面板开关 + 画质档位白名单，两层都放行才创建
EffectComposer，否则连离屏渲染管线的开销都省掉。

## 资产准备管线

```bash
node scripts/prepare-asset.mjs <输入文件> [--out 目录] [--ratio 0.35] [--name 名字]
```

FBX 先经 Blender 无头清洗（减面 / 每顶点骨骼影响限制到 4 / 骨骼名去前缀），
再经 gltf-transform 压缩（焊接 / 去重 / 剪枝 / 量化 / 合并），
最后输出体积与性能预算报告，超出移动端红线会逐条列出。

处理 FBX 需要 Blender（`winget install Blender.Blender`）；
输入已经是 GLB 的话不需要 Blender。

GPU 基准数据已从 `detect-gpu` 复制到 `public/benchmarks`，离线也能分级。

---

## 后续路线

按优先级排列：

1. **撤销/重做栈** —— 场景图是纯数据，接入命令模式即可
2. **IndexedDB 资产持久化** —— 解决刷新后资产丢失的问题
3. **材质节点编辑器** —— 目前材质是固定参数面板，接 TSL 后可以做成节点图
4. **时间轴关键帧动画** —— 数据结构已就绪，差编辑 UI
5. **Draco / KTX2 编码** —— 需要 wasm 编解码器，放在后端资产管线做
6. **多人协同** —— 纯数据场景图 + 事件总线，接 CRDT 即可

---

## 常见问题

**构建时提示 `node:fs has been externalized`**

无害。`@gltf-transform/core` 的入口文件里，Node 内置模块只出现在 `NodeIO` 的
**动态** `import()` 中，浏览器端用的 `WebIO` 不会触发。

**场景全黑**

检查是否有灯光。新建场景会自动加环境光和主光源；导入的项目如果没有灯光，
到「特效」页把环境强度调高，或新建一个平行光。

**AI 生成一直失败**

先用「内置演示」提供方验证流水线。本地提供方需要先把 `server/main.py` 跑起来，
云端提供方需要配置 API Key。
