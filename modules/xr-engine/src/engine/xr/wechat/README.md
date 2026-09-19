# 微信 xr-frame 适配层

## 文件

- `wxar-runtime.js`
  - 直接复制到微信小程序 `utils/wxar-runtime.js`
  - 提供 `createXrGameComponent()`
  - 支持远程 GLTF 动态加载
  - 支持 mesh / group / model 节点
  - 支持场景 JSON 动态挂载
  - 支持 `alignContent()` 世界坐标 -> VIO 坐标

- `wechatSource.ts`
  - 在 Web 编辑器里生成微信小程序自定义组件源码
  - 工具栏「复制微信组件」会复制：
    - `wxml`
    - `js`
    - `json`
    - `wxss`
    - 当前场景 `scene json`

## 使用方法

1. 在微信小程序中把 `wxar-runtime.js` 放到 `utils/`
2. 创建组件 `xr-game-scene`
3. 页面传 `scene-json="{{sceneJson}}"`
4. 场景里的 `modelUrl / assetId` 必须是可访问的 CDN URL

## 兼容能力

- `xr-scene` AR 相机
- Plane / Marker 模式
- 远程 GLTF
- 自动播放动画
- 动态 transform 同步
- 云端重定位后的坐标对齐
