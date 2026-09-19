# XR 引擎底座完善记录 (2026-08-30)

## 修复/新增
1. **资产持久化**
   - 新增 `src/engine/assets/AssetStore.ts`（IndexedDB 存储）
   - 上传的模型/贴图/HDRI 原始文件现在会写入 IndexedDB
   - 刷新页面后自动恢复 object URL，不再显示 missing/重新上传
   - AI 生成的模型同样持久化

2. **模型导入扩展**
   - 除 GLB/GLTF 外，支持 OBJ、FBX 导入
   - 资产库会做面数/材质/贴图统计
   - 模型节点使用统一加载器，OBJ/FBX 可直接加入场景

3. **贴图材质**
   - MaterialProps 增加 map / roughnessMap / metalnessMap / normalMap / emissiveMap / aoMap
   - 检查器材质区可选资产库贴图
   - 渲染层加载对应贴图并设置颜色空间 / 重复 / 各向异性

4. **HDRI 环境**
   - 环境配置增加 hdriAssetId
   - 可在特效面板选择资产库 HDR/EXR/全景图
   - 未选 HDRI 时继续使用离线程序化环境

5. **UI 与修复**
   - 资产库贴图/HDRI 显示缩略图
   - 模型节点改为响应式订阅资产列表，修复刷新/恢复后模型不出现的问题
   - 文件选择 accept 增加 .obj/.fbx

## 构建
- `npm run typecheck` 通过
- `npm run build` 通过

6. **FBX/GLB 动画修正**
   - 导入模型时正确提取动画列表
   - 自动默认播放第一个动画
   - 模型检查器增加动画下拉选择

7. **模型尺寸快捷修正**
   - 模型检查器新增「自动适配大小（2 米）」按钮
   - 一键把导入模型缩放到适合编辑器/AR 预览的大小

8. **AI 扩展调研**
   - 新增 `docs/引擎扩展路线.md`
   - 对标混元 3D Studio，规划 AI 建模/动作/音效/材质多模态管线

9. **模型接入接口（CommandAPI）**
   - 新增 `importAsset`：通过 URL 接入模型/贴图/HDRI/音频
   - 新增 `addModelNode`：把已接入资产直接加入场景并默认播放动画
   - 新增 `listAssets`：AI/脚本可查询资产库
   - 已同步写进 `SCHEMA_PROMPT`，LLM 可直接调用

10. **植物大战僵尸 3D 原型**
   - 工具栏新增「🧟 PVZ」一键原型
   - 装甲：草地、光源、豌豆射手自动射击、僵尸进攻、豌豆命中、僵尸啃植物、游戏结束保护
   - 纯脚本驱动，验证了现有引擎可开发简单 3D 小游戏

11. **内置 CC0 素材**
   - 引入 `@pmndrs/assets`（CC0）
   - 资产库新增「载入内置 CC0 素材」按钮：Suzi / Bunny / PMNDRS

12. **射线拾取 API**
   - Engine 新增 `attachCamera/detachCamera/getCamera` 和 `pick(ndcX, ndcY)`
   - 视口自动挂载相机，脚本可通过 `ctx.engine.pick()` 做点击/交互
   - PVZ 原型已支持点击地面种植豌豆射手

13. **微信小程序/小游戏调研**
   - 新增 `docs/微信小程序3D调研与引擎优化路线.md`
   - 覆盖 xr-frame、Cocos、Oasis、threejs-miniprogram、包体/性能/社区坑
   - 给出 P0/P1/P2 优化路线

14. **点击拾取修复**
   - 播放模式输入坐标改为按 Canvas 实际尺寸换算
   - `pointerdown` 同步记录指针，触屏点击不再因没先移动鼠标而失效

15. **微信小游戏适配架构与基础设施**
   - 新增 `docs/微信小游戏引擎适配方案.md`
   - 新增 `engine.audio` 音频管理器（Sfx/Bgm/StopAll）
   - 新增 `engine.prefabs` 预制体注册表
   - 新增 `ObjectPool`、`AnimationStateMachine`、`Prefab` 公共类型
   - CommandAPI 新增 `playSfx` / `playBgm`

16. **参考 wxar-mini**
   - 分析了 `D:\wxAR\wxar-mini` 的 xr-frame 动态 GLTF、AR 追踪、云端重定位模式
   - 确定最终架构：Web 编辑器 + 公共游戏运行时层 + xr-frame 小程序运行时 + 云 4090/CDN

17. **PVZ 第二版（复合体 + 交互 + HUD）**
   - 植物/僵尸改为多 mesh 复合体：茎、头、炮管、花瓣、身体、头、手、脚、眼睛
   - 不同植物类型：豌豆射手 / 向日葵 / 坚果
   - 键盘 1/2/3 选择植物，点击草地种植，有阳光消耗
   - 植物/僵尸基本动画：向日葵旋转、豌豆头摆动、僵尸手脚摆动
   - 豌豆使用对象池复用
   - 新增 HUD 系统（阳光 / 波次 / 僵尸数 / 提示）

18. **HUD 基建**
   - 新增 `engine.hud`（GameHud），脚本可更新，React 用 useSyncExternalStore 订阅
   - 视口增加游戏 HUD 覆盖层

19. **微信小程序场景导出**
   - 新增「导出小程序场景」按钮
   - 将当前节点/变换/材质/脚本/资产打包成 `*.wxar.json`
   - 目标格式专门为后续 xr-frame 小程序运行时解释

20. **修复 GameHud 无限循环**
   - `useSyncExternalStore` 的 getSnapshot 必须返回稳定引用
   - GameHud 改为缓存快照，只有 `set/reset` 才换引用
   - 修复 `Maximum update depth exceeded` / `getSnapshot should be cached` 报错

21. **移除 PVZ 原型，开始真正的游戏引擎核心**
   - 删除 `src/editor/games/pvz.ts` 和工具栏 PVZ 入口，避免编辑器被玩具 demo 干扰
   - 新增 `src/engine/runtime/`：
     - `Component.ts`：组件生命周期基类
     - `Entity.ts`：游戏实体（Transform + 组件 + 子树）
     - `World.ts`：游戏世界（实体管理、生命周期、update 循环）
     - `PrefabInstantiator.ts`：Prefab -> Entity 实例化
     - `SceneLoader.ts`：加载导出的 `*.wxar.json` 到游戏世界
     - `InputManager.ts`：键盘/指针输入统一层
     - `GameRuntime.ts`：运行时门面（World + Prefab + ObjectPool + Audio + Input）
   - `Engine` 新增 `engine.game` 运行时入口
   - 后续以这套核心为基础接 Three.js/xr-frame 渲染、物理、动画、UI 和关卡系统

22. **游戏核心补充：Time + SceneManager**
   - 新增 `Time`：rawDelta / scaled delta / elapsed / timeScale
   - 新增 `SceneManager` + `GameScene`：关卡加载/卸载/每帧更新
   - `GameRuntime` 集成 scene 优先的 update/start/stop 路径

23. **Entity.clone**
   - 实体树深拷贝（transform/props/userData/children），组件不浅拷贝，留给运行时按需重建

24. **微信 xr-frame 适配层**
   - 新增 `src/engine/xr/wechat/wxar-runtime.js`（可直接复制到 wxar-mini 使用）
   - 新增 `wechatSource.ts`：生成微信小程序 xr-frame 组件源码
   - 工具栏新增「复制微信组件」：一键复制 wxml/js/json/wxss + 场景 JSON
   - 支持远程 GLTF 动态加载、mesh/group/model、AR 坐标对齐

25. **Web 渲染适配 + 微信能力检测**
   - 新增 `ThreeRuntimeRenderer`：把 GameRuntime World 同步到 Three.js 场景
   - 支持 mesh/group 实体、材质/几何体、变换/可见性同步、销毁清理
   - 新增 `detectWechatAR()`：检测微信环境、xr-frame、相机、基础库版本
   - AR 面板新增「微信小程序 xr-frame」能力展示
   - 为后续 WebXR AR 预览和 Web 游戏运行打通同一套实体数据

26. **GameRuntime 接通 Web 播放 + 微信触摸 + 演示场景**
   - PlayController 启动/每帧/停止时自动驱动 `engine.game`
   - 新增 `Engine.startGameRuntime/updateGameRuntime/stopGameRuntime`
   - GameRuntime 实体通过 `ThreeRuntimeRenderer` 直接显示在 Web 视口
   - 新增「🎮 运行时 Demo」按钮：基于 GameRuntime 核心的互动场景
     - WASD/方向键移动玩家
     - 旋转/浮动能量球
     - HUD 实时更新
   - `wxar-runtime.js` 增加触摸事件：touchstart/touchmove/touchend/tap
   - 生成的微信组件 WXML 自动绑定触摸事件

27. **AR 可交互 Demo + 模型加载 + 微信逻辑 + AR 放置**
   - `ThreeRuntimeRenderer` 增加 GLTF 模型异步加载、动画、资源解析
   - `wxar-runtime.js` 增加游戏逻辑解释器：
     - 加载导出节点脚本（onStart/onUpdate）
     - 内置 spin/bob/move/tapGame 组件
     - 触摸点击驱动 tapGame 得分/生成
   - WebXR AR：GameRuntime 根节点自动挂入 ARRoot，跟随平面检测吸附/锁定
   - 「运行时 Demo」升级为可交互 AR 游戏：
     - 点击/触摸地面生成能量球
     - 点击/触摸能量球得分
     - WASD 移动
     - 对象池复用球体
   - 导出微信场景时优先使用 GameRuntime 世界，确保运行的 Demo 也能一键复制到微信

28. **特效预制体 + CDN 导入 + ComfyUI + 性能文档**
   - 内置「黑洞」和「能量球」特效预制体
   - 资产库新增插入黑洞/能量球按钮
   - 资产库新增 CDN 直链导入
   - AI Provider 新增 ComfyUI 入口
   - 新增《性能与素材流水线》文档：GPU 加速、手机预算、CDN、微信生态、素材授权

29. **真 shader 特效 + 画质自动降级**
   - 新增 `shaderEffects.ts`：
     - 黑洞：旋涡扭曲 shader
     - 能量球：fresnel 脉冲发光 shader
   - Web 编辑器 MeshBody 和 ThreeRuntimeRenderer 都支持 `effect: blackhole / energy`
   - 内置黑洞/能量球预制体已挂 shader 特效标记
   - 新增 `QualityManager`：
     - 高/中/低三档
     - 自动检测设备性能
     - 每帧测量 FPS，自动降档/升档
     - 控制阴影/后处理/粒子/高级 shader/贴图精度
   - `GameRuntime` 已集成画质自动检测与 FPS 测量

30. **云 4090 定位说明**
   - 新增《性能与素材流水线》第 8 节：云 4090 能做什么/不能做什么
   - 明确云端负责 AI 生成、资产优化、SLAM/VIO/重定位
   - 手机本地渲染仍由手机 GPU 完成，云渲染串流不适合实时 AR

31. **真实粒子特效升级（不再是几何体拼图）**
   - 新增 `advancedEffects.ts`：
     - 黑洞：GPU 粒子吸积盘 + 事件视界 shader + 外围尘埃
     - 能量球：轨道粒子外壳 + 核心 Fresnel 脉冲 + 点光源
   - 新增 `runtimeParticles.ts`：GameRuntime 通用 GPU 粒子场
   - 编辑器与游戏运行时都支持高级特效
   - 新增 `qualityBridge`：粒子数随画质档位自动缩放
   - `wxar-runtime.js` 增加微信粒子适配与降级
   - 新增《特效系统调研与升级》文档，调研 Three/Babylon/PlayCanvas/Unity/Godot/Cocos/微信 xr-frame 及商业素材源

32. **微信 xr-frame 真正的自定义 Effect 引擎**
   - 根据官方 Effect API 实现 `wxar-runtime.js` 自定义 shader 注册：
     - `xfs.registerEffect()`
     - `scene.createEffect()`
     - `scene.createMaterial()`
     - `scene.assets.addAsset()`
   - 内置黑洞/能量球 GLSL ES 100 着色器
   - 支持扩展节点 `customShader` 自动注册微信 Effect
   - 自动注入 `uTime`
   - 自动推断 uniforms 类型
   - 微信无法使用后处理/全屏特效，按官方边界实现物体级 shader
   - 新增《微信xr-frame自定义特效实现》文档

33. **微信 xr-frame 原生粒子 + GLSL 组合特效**
   - 黑洞在微信端 = 自定义 GLSL Effect + `XRParticle` 原生粒子系统
   - 能量球在微信端 = 自定义 GLSL Effect + 球形粒子发射器
   - 使用官方 `capacity/emit-rate/life-time/emitter-type/emitter-props/start-color/end-color`
   - 自动调用 `particleComponent.start()`
   - 低画质关闭粒子，保留 shader 网格
   - Web 运行时 Demo 也换成真粒子黑洞/能量球

34. **PVZ 风格 AR 小游戏（数据驱动 + 双端）**
   - 新增 `buildPvzArScene()`：纯数据场景，不手写渲染合成
   - 新增 `DataDrivenBehavior`：Web 端解释 components 数据
   - 微信端新增内置组件：spawner / sunSpawner / shooter / moveTo / collision / collectible
   - 太阳、豌豆使用真能量球特效
   - 僵尸自动移动、豌豆自动射击、碰撞击杀、点击收集
   - 工具栏新增 `🧟 PVZ AR Demo` 和 `📦 PVZ 微信导出`
   - 新增《PVZ_AR小游戏》文档

35. **多功能完善：剧情、时间轴、实时特效属性**
   - 新增 `DialogueSystem`：对话树/分支/条件/动作/事件
   - 新增 `TimelineSystem`：时间轴/过场动画
   - GameRuntime 集成 dialogue/timeline
   - 修复能量球/黑洞实时属性更新：
     - 改颜色立即生效
     - 改 emissiveIntensity/亮度立即生效
     - 改 radius/大小立即生效
   - 新增《XR引擎完整功能现状与规划》

36. **引擎功能批量完善 + 布局优化**
   - 新增 SaveSystem：存档/读档（对话 flag、时间轴、世界状态）
   - 新增 InteractionSystem：交互/触发/任务注册
   - 新增 DialogueSystem / TimelineSystem 并接入 GameRuntime
   - 新增 StoryPanel：可视化“剧情/时间轴/存档”面板
   - 新增 Audio 总线：主音量 / SFX / BGM 分组
   - Prefab 支持 clonePrefabWithOverrides 变体覆盖
   - DataDrivenBehavior 支持 dialogue/timeline/trigger 组件
   - 高级特效实时属性修复持续生效
   - 优化右侧 Tab 面板：属性 / 特效 / 剧情 / AI / AR

37. **FBX/GLB 模型调试与性能优化**
   - 新增模型自动归一化（默认 1 米基准），解决“改大小没反应/模型巨大”
   - 新增动画速度控制（0.05~5 倍）
   - 资产元信息增加骨骼数、动画轨道数
   - 模型检查器显示 AR 性能警告（>10 万三角面）
   - 已分析目标 FBX：51MB / 约50万三角面 / 28骨骼 / 87动画轨道，确认卡顿原因

38. **模型减面优化流水线 + 剧情编辑器**
   - 新增 modelOptimizer：基于 meshoptimizer 的浏览器端减面
   - 支持非索引 FBX：自动 mergeVertices 后简化
   - 保留 skinIndex/skinWeight，蒙皮动画可继续使用
   - 资产库模型卡片新增「减面」按钮
   - 一键生成 `.optimized.glb` 优化资产
   - 剧情面板升级为可视化节点编辑器：增删节点/对白/分支选项
   - 时间轴仍支持 JSON 编辑与播放

39. **跨端一致性保障**
   - 新增微信导出一致性检查（AR 面板）
   - 检查后处理、shader 版本、特效、组件、高面数模型
   - 新增微信低配预览按钮
   - 补充《跨端一致性与导出原理》

40. **tapPlace 跨端触摸放置 + 跨端架构研究**
   - 新增通用 tapPlace 数据组件（Web + 微信）
   - Web 端使用地面射线，微信端使用归一化触摸坐标映射
   - 新增 Engine.screenToGround()
   - 微信兼容性检查加入 tapPlace
   - 补充《跨端适配研究与支持矩阵》

41. **跨端组件编辑器 + tapPlace 可视化**
   - Inspector 新增「数据组件（跨端）」面板
   - 一键添加 tapPlace / spawner / collectible / move / dialogue / timeline
   - 支持 JSON 编辑和校验
   - Web 和微信使用同一份组件数据

42. **AR 平面放置 + 动画状态机 + 预制体 + 任务 + 性能矩阵**
   - 微信端 tapPlace 升级为 AR 相机位姿真实放置，支持横向触摸偏移
   - 参考 D:\wxAR\wxar-mini 的 camera/shadow 动态挂载方式
   - StoryPanel 新增：动画状态机编辑、嵌套预制体编辑、任务系统
   - GameRuntime 集成 TaskSystem / Animator
   - ARPanel 新增微信真机性能矩阵

43. **GitHub 资料调研**
   - 整理 xr-frame demo / tutorial / marker / platformize 等 GitHub 资源
   - 输出 docs/GitHub资料调研.md

44. **GitHub 源码级调研完成**
   - 克隆并研究 dtysky/xr-frame-demo、deepred5/xr-frame-tutorial、wechat-xr-frame-marker、platformize
   - 确认官方 AR Plane 精确放置 API：scene.ar.placeHere(nodeId, true)
   - 微信端 tapPlace 已改为调用官方 placeHere
   - 输出 docs/GitHub源码级调研.md

45. **GitHub 调研后四项全部落地**
   - Marker 跟踪：
     - Inspector 新增 marker 组件预设
     - 微信端根据数据动态创建 xr-ar-tracker
     - Web 端按普通节点显示
   - AR 放置后手势：
     - 微信端放置后支持单指旋转、双指缩放
   - GLB 透明材质修复：
     - 微信端模型加载后自动设置 MASK/alphaCutoff/renderQueue/depthWrite/depthTest
   - 微信真机性能矩阵自动降档：
     - 启动按机型自动选档
     - 运行帧率监控，FPS<18 自动降 low，FPS>50 可回 medium
   - 兼容性检查支持 marker 组件

46. **全引擎五方向审计 + 60 项修复（2026-09-10）**
   - 完整报告见 `docs/全面审计与优化报告.md`（含开源竞品与微信生态增量调研）
   - core：修复首步不可撤销（History 基线）、退出播放清空撤销栈（新增 `Engine.restoreSnapshot`）、播放中自动保存污染存档、历史合并错节点、onStart 无 nodeId、setPostFX 突变不刷新、loadProject 浅合并 NaN、拾取/导出混入 gizmo、碰撞体不随缩放
   - runtime/game：插件卸载回滚真正生效、ThreeRuntimeRenderer 实体/贴图/mixer 泄漏、运行期 addComponent 生命周期、prefab 数组共享、dataDriven 深拷贝与 collectible 命中检测、运行时 FBX/OBJ/KTX2 加载修复、生成物 TTL、存档 timeline/task 闭环、对象池防重、切窗卡键、时间轴关键帧采样、对话 condition 求值、双画质系统桥接、几何体缓存 + fx 脏集合
   - editor：剧情 tab 空白、轨迹编辑不生效、模型/纹理 GPU 泄漏（新增 scene/dispose.ts）、归一化可逆化、PMREM 重复烘焙、AI 健康检查防抖、锁定节点 gizmo、贴图引用计数缓存、播放中快捷键屏蔽
   - assets/export：多材质减面错乱防护、KTX2 缩图崩溃、gaussian-splat 导出剔除+检查报错、FBX blob 泄漏、OBJ MTL 加载、IndexedDB 失败重试、兼容性别名/误判修正、GLSL 转译漏判补全、audio/hdri CDN 占位
   - xr/wechat：moveTo ReferenceError、shooter 速度 NaN、相机角度单位、单击双触发、AR 缩放双重施加、内存档位阈值、灯光计数重置、shader 几何硬编码、USDZ 手势链、tracker-switch 绑定、触摸坐标偏移等 17 项
   - `npm run typecheck` / `npm run build` 通过；微信端改动待真机回归

47. **Unity 式布局 + 右键添加物体 + 三个双端新特效 + 冒烟测试（2026-09-10）**
   - 布局对标 Unity 阉割版：
     - 左列层级树独占全高；右列 tabs 收窄为 属性/特效/剧情
     - 新增底部面板（Unity Project 位）：tabs 资产库/AI 建模/AR 导出，高度可拖（140–480，双击复位，localStorage 记忆）
     - 工具栏三组重排：左=文件/撤销重做，中=播放/停止（居中），右=添加物体▾/导出/Demo
   - 右键上下文菜单（新增 ui/ContextMenu.tsx + ui/createObjectMenu.ts）：
     - 视口右键（位移<5px 才弹，不与右键平移冲突）：空白处=添加物体（创建在点击的地面位置，engine.screenToGround），节点上=聚焦/复制/删除/添加子物体
     - 层级树：行右键=节点操作菜单，空白右键=添加物体
     - 添加菜单对标 Unity GameObject：3D 物体 6 种几何/灯光 4 种/粒子 4 预设/特效 5 种/空对象/模型
     - `store.addNode` 新增 options（name/geometry/props/position/rotation），向后兼容
   - 新特效（Web + 微信双端同 id 实现）：dissolve 溶解 / hologram 全息 / shockwave 冲击波
     - Web：shaderEffects.ts 三个材质工厂（GLSL ES 100 写法），编辑器 MeshBody 与 ThreeRuntimeRenderer 均支持，Inspector 下拉可选，颜色实时生效
     - 微信：wxar-runtime.js 三个 GLSL ES 100 Effect（registerEffect），按色材质/uTime 注入/uColor 传递全自动覆盖；compatibility 别名表同步
   - 冒烟测试：新增 scripts/smoke-core.mts（10 组 97 断言，`npm run test:core`），覆盖添加物体全类型/几何/层级/撤销重做/播放/序列化/微信导出/运行时/插件回滚，全绿
   - 修复 scheduleAutosave 播放边界（回调内复查 play.active）
   - `npm run build` 通过；新特效微信端待真机回归

48. **编辑器 UI 全面重构：图标轨道 + 资产库网格 + 动效反馈（2026-09-10）**
   - 布局二次改造（对标 Unity/Unreal/Cocos）：
     - 左侧 46px 图标轨道：层级/特效/剧情/AI/AR 切换，再点折叠整列（180ms 滑动画）；插件 registerPanel 注册的面板自动追加 rail 图标
     - 右列 Inspector 常驻（去 tabs）
     - 底部面板收窄为 资产库/控制台 两个 tab，可折叠（chevron），高度拖拽记忆保留
     - rail 选中/折叠态/底部 tab/折叠态全部 localStorage 持久化（旧数据兼容）
   - 新增控制台面板：捕获 console.warn/error，级别过滤 chips、计数、清空、自动滚底、500 条环形缓冲
   - 新增 Toast 系统（ui/Toast.tsx）：保存/导出GLB/导出小程序/复制微信组件/AI生成/资产导入/自动保存失败 全部接上成功/失败反馈；Ctrl+S 强制保存
   - 资产库重写为 Unity Project 风格网格（AssetBrowser.css 独立样式）：
     - 大缩略图卡片 + 类型徽标 + 超预算红角标 + hover 浮起滑出操作层
     - 顶栏：导入/CDN/CC0/预制体下拉/搜索/类型过滤 chips
     - 卡片 stagger 进场动画；保留减面/下载/删除/统计/双击加场景全部功能
   - 资产拖拽进视口：卡片 dragstart 带 `application/x-xr-asset`，视口 drop 后经 screenToGround 放在点击的地面位置并自动选中（仅模型类响应）
   - 全套动效：tab 淡入、按钮 hover 抬升/active 下沉、右键菜单弹出 scale、播放键呼吸脉冲、rail active 指示条、toast 滑入
   - `npm run build` 通过；`npm run test:core` 97/97 绿
