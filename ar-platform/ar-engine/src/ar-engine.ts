/**
 * AR 引擎核心模块
 *
 * 职责：
 *   - 初始化 MindAR（通过 tracking 模块动态加载）
 *   - 搭建 Three.js 场景（灯光、相机、渲染器）
 *   - 使用 GLTFLoader 加载 .glb 模型并放置到锚点
 *   - 管理 AR 生命周期（start / dispose）
 *
 * 逻辑来源于 project1XRsystem/apps/web/src/components/ar/ar-viewer.tsx
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { ARConfig } from "./config";
import { initMindAR, selectTracking, type TrackingType } from "./tracking-legacy";
import { AnimationController } from './animation/AnimationController';
import { MotionController } from './animation/MotionController';
import { FaceModelGenerator } from './capabilities/face-effects/FaceModelGenerator';
import { SpatialAudioManager } from './audio/SpatialAudio';
import { PvzController } from './game/pvz/PvzController';
import type { FaceModelType } from './capabilities/face-effects/FaceModelGenerator';
import { EightWallAdapter } from './adapters/EightWallAdapter';
import { CameraARAdapter } from './adapters/CameraARAdapter';
import { ModelManager } from './model/ModelManager';
import { VideoPlayer } from './video/VideoPlayer';
import { InteractionRunner } from './interaction/InteractionRunner';
import type { ActionHandlers } from './interaction/InteractionRunner';
import { GameEngine } from './game/GameEngine';
import { GameLogicRunner } from './game/GameLogicRunner';
import { GameHUD } from './game/GameHUD';
import { GuideEngine } from './guide/GuideEngine';
import { GuideHUD } from './guide/GuideHUD';
import { GPSPositionProvider } from './guide/position/GPSPositionProvider';
import type { IPositionProvider } from './guide/position/PositionProvider';
import { EightWallTracker } from './tracking/EightWallTracker';
import { ScenePositionProvider } from './bridge/ScenePositionProvider';
import { ARWorldBridge } from './bridge/ARWorldBridge';
import { OrientationManager } from './sensors/OrientationManager';
import { ParticleBurst } from './game/effects';
import type { UnifiedARConfig, CapabilityModuleConfig, InteractionRule, GameConfig, ARExperience, HUDConfig, UnifiedRule } from './types/config';
import type { GameState } from './ui/GameState';
import { CapabilityType, EngineType } from './types/enums';
import { ARHUD } from './ui/ARHUD';
import {
  ScoreRenderer,
  TimerRenderer,
  ComboRenderer,
  LivesRenderer,
  MessageRenderer,
  POICardRenderer,
  ProgressRenderer,
  POIListRenderer,
  ArrowRenderer,
  CompassRenderer,
  ButtonRenderer,
  CustomTextRenderer,
} from './ui/components';

// 陀螺仪补偿用可重用常量（后置摄像头 -90° X 旋转）
const _Q_X90 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const _Q_SCREEN = new THREE.Quaternion();
const _V_Z = new THREE.Vector3(0, 0, 1);

export class AREngine {
  private static readonly LERP_FACTOR = 0.08;
  private container: HTMLElement;
  private config: ARConfig;
  private mindAR: any = null;
  private trackingType: TrackingType = "image";
  private started = false;
  private _starting = false;
  private anchor: any = null;
  /** 多锚点模式（面部区域追踪） */
  private _anchors: Array<{
    zoneId: string;
    anchor: any;
    modelWrapper: THREE.Object3D | null;
    videoPlayer: VideoPlayer | null;
  }> = [];
  /** 3DAR 期1：图片多目标 anchor 记录（maxTrack>1 时逐 target 建 anchor） */
  private _imageAnchors: Array<{
    index: number;
    anchor: any;
    found: boolean;
    lastFoundAt: number;
  }> = [];
  private _activeImageIndex = 0;
  /** 多目标切换时的 300ms 位姿连续混合（旧世界位姿 → 新 anchor 稳态局部变换） */
  private _switchBlend: {
    startedAt: number;
    duration: number;
    fromPos: THREE.Vector3;
    fromQuat: THREE.Quaternion;
    toPos: THREE.Vector3;
    toQuat: THREE.Quaternion;
  } | null = null;
  /** heading 修复：deviceorientation 罗盘监听 */
  private _compassHandler: ((e: DeviceOrientationEvent) => void) | null = null;
  /** M13：3D 空间音频管理器（HRTF PannerNode） */
  private _spatialAudio = new SpatialAudioManager();
  /** 当前活跃相机（供空间音频听者更新） */
  private _activeCamera: any = null;
  private _onTrackingStatus: ((found: boolean) => void) | null = null;
  private _onModelStatus: ((status: 'loading' | 'loaded' | 'error', pct?: number) => void) | null = null;
  /**
   * WebGL 上下文丢失标志。
   * 丢失时 GPU 侧内容全没但 JS/追踪照跑 —— 现场表现为"识别成功但看不到"。
   * 单独记一个字段，方便诊断面板与上层 UI 区分「没识别到」和「识别到但画不出来」。
   */
  private _contextLost = false;
  private _onFeatureQuality: ((quality: { features: number; confidence: number; quality: 'good' | 'fair' | 'poor' }) => void) | null = null;
  /** 平滑锚点位姿的上一帧值 */
  private _smoothPos = new THREE.Vector3();
  private _smoothQuat = new THREE.Quaternion();
  private _smoothReady = false;
  /** 从追踪矩阵分解出的实时位姿 */
  private _trackPos = new THREE.Vector3();
  private _trackQuat = new THREE.Quaternion();
  private _trackScl = new THREE.Vector3();
  /** 临时矩阵（避免每帧创建新对象） */
  private _tempMatrix = new THREE.Matrix4();
  /** 从内参投影矩阵提取的垂直 FOV（度），配合屏幕 aspect 重建投影 */
  private _verticalFov = 50;
  /** 冻结模式：首次检测到目标后固定锚点位姿（可选，默认关闭） */
  private _freezeOnDetect = false;
  private _frozen = false;
  private _frozenMatrix = new THREE.Matrix4();
  private _frozenPos = new THREE.Vector3();
  private _frozenQuat = new THREE.Quaternion();
  private _frozenScl = new THREE.Vector3(1, 1, 1);
  /** 非冻结模式下首次捕获的缩放值（防止追踪噪声导致大小抖动） */
  /**
   * MindAR anchor 空间尺度 = 目标图宽（.mind 里的像素宽，如 291）。
   * MindAR 每帧写 group.matrix = worldMatrix × postMatrix，其中 postMatrix
   * 携带该尺度 + 原点偏移 (w/2, h/2)。本引擎的 _updateAnchorPose 每帧覆写
   * group.matrix，因此必须把同一尺度补回来，否则模型被缩小数百倍并被
   * postMatrix 的原点偏移甩到图外 —— 表现为"识别成功但看不到/飘走"。
   * 非 MindAR 路径保持 (1,1,1)。
   */
  private _capturedScl = new THREE.Vector3(1, 1, 1);
  /** 是否已从 postMatrix 捕获 anchor 尺度（每次 start 重置） */
  private _anchorScaleCaptured = false;
  /** _capturedScl 的倒数，用于把 group.matrix 里的坐标还原回 MindAR 原生空间 */
  private _invCapturedScl = new THREE.Vector3(1, 1, 1);
  /** 目标图原点在 anchor 空间的偏移 (w/2, h/2 - w/2, 0)，与 postMatrix 一致 */
  private _anchorOrigin = new THREE.Vector3(0, 0, 0);
  /**
   * 「1 米 = 多少 anchor 像素单位」，由 _captureAnchorScale 算出（= 图宽 / 0.3）。
   * wrapper.position 的单位是 anchor 像素单位，而作者在编辑器里填的是米，
   * 因此 image 路径写入前必须乘这个系数，否则偏移被放大 w 倍（手机直接出屏）。
   * 非 image 路径恒为 1。
   */
  private _unitsPerMeter = 1;

  /**
   * ⚠️⚠️ image 追踪下 z 是**负数**（目标在相机前方），绝不能当"深度正数"用。
   *
   * MindAR 的 anchor 空间里相机恒在原点，目标位于 z 的负方向：
   * 实测本场景 `_trackPos.z ≈ −1.509`（归一化空间），乘以 `_capturedScl`(291)
   * 后写出为 −439。相机朝 −z 看，所以负 z = 在镜头前方 = 正确。
   *
   * 但下面三处都假设 `z > 0`：
   *   · `_invDepth = 1 / Math.max(z, 0.1)`   → −1.509 被抬到 0.1 → invDepth 恒 10
   *   · `_smoothPos.z = 1 / _invDepth`        → 写出 +0.1（**正数，跑到相机后方**）
   *   · `distSlow/Fast = 0.5 / Math.max(z, 0.1)` → 恒为 1，距离感知完全失效
   *
   * 后果：STATIONARY 分支直接 copy `_lockedPos`（z = −1.509，正常），
   * 一旦切到 SLOW/FAST，z 立刻跳到 +0.1 —— 相差 1.6 个归一化单位 = 466 世界单位。
   * 真机表现就是**模型在平面上平移正常、但纵深反复跳变**（用户描述的"不断刷新"）。
   *
   * 修法：逆深度滤波严格作用在"深度幅度"上（取 |z|），写出时再补回符号。
   * 这样既保住逆深度对近处抖动的抑制，又不破坏 MindAR 的符号约定。
   */
  private _depthMagnitude(z: number): number {
    // 下限 0.1 与原来一致，只是作用在幅度上而非带符号值
    return Math.max(Math.abs(z), AREngine._MIN_DEPTH);
  }

  /** z 的符号（MindAR image/markerless 恒为 −1；万一上游给了正 z 也不写错） */
  private _depthSign(z: number): number {
    return z < 0 ? -1 : 1;
  }

  /**
   * 约定：打印出来的目标图实际宽 0.3m。
   * 这是编辑器预览（ArPreview3D 用 0.3m 宽卡片）与 AR 侧唯一的共同基准，
   * 改这里必须同时改预览，否则"预览多大 AR 就多大"的承诺失效。
   */
  private static readonly _ASSUMED_TARGET_WIDTH_M = 0.3;
  /** 位姿死区阈值 — 极小噪声被忽略，同时保留跟踪目标的移动响应 */
  private _deadZonePos = 0.003;
  private _deadZoneRot = 0.005;
  /** 三状态平滑 — 帧间陀螺仪角速度 (rad/frame) */
  private _gyroDelta = 0;
  /** 三状态平滑 — 上一帧陀螺仪四元数引用 */
  private _prevGyroQuat = new THREE.Quaternion();
  /** 三状态平滑 — 当前运动状态 */
  private _motionState: 'STATIONARY' | 'SLOW_MOVE' | 'FAST_MOVE' | 'FALLBACK' | 'INIT' = 'INIT';
  /** 三状态平滑 — 静止帧计数 */
  private _stationaryFrameCount = 0;
  /** 三状态平滑 — 刚离开静止状态标记（首帧快速追赶） */
  private _justExitedStationary = false;
  /** 三状态平滑 — 静止锁定位姿 */
  private _lockedPos = new THREE.Vector3();
  private _lockedQuat = new THREE.Quaternion();
  /** 三状态平滑 — 追踪丢失帧计数 */
  private _lostFrameCount = 0;
  /** 三状态平滑 — 最大丢失容忍帧数 */
  private _maxLostFrames = 15;
  /** 三状态平滑 — 追踪状态（found/lost） */
  private _trackingFound = false;
  /** 三状态平滑 — 非零陀螺仪角速度保持（防传感器卡死误判静止） */
  private _lastNonZeroGyroDelta = 0.001;
  /** 三状态平滑 — 帧时间戳（用于 dt 计算） */
  private _lastUpdateTime = 0;
  /** 逆深度平滑 — 当前逆深度 (1/Z) */
  private _invDepth = 1;
  /** 逆深度平滑 — 原始逆深度 */
  private _rawInvDepth = 1;
  /** 启发式置信度 — 帧级位姿可信度 0-1 */
  private _poseConfidence = 0.5;
  /** 启发式置信度 — 上一帧追踪位置（用于帧间跳变检测） */
  private _prevConfTrackPos = new THREE.Vector3();
  /** 自适应阈值 — 陀螺仪角速度运行 EMA 均值 */
  private _gyroRunningMean = 0.001;
  /** 自适应阈值 — 陀螺仪角速度运行 EMA 标准差 */
  private _gyroRunningStd = 0.001;
  /** 弹跳度 — 追踪位姿方向翻转频率 0-1（0=稳定, 1=剧烈振荡） */
  private _bounciness = 0;
  /** 弹跳度 — 各轴上一帧位置方向符号 */
  private _prevPosSignX = 0;
  private _prevPosSignY = 0;
  private _prevPosSignZ = 0;
  /** Cross-fade 重新捕获 — 是否正在过渡（丢失→重检的平滑过渡） */
  private _blendActive = false;
  /** Cross-fade 重新捕获 — 当前过渡帧数 */
  private _blendFrames = 0;
  /** Cross-fade 重新捕获 — 过渡起始位姿（丢失前最后位置） */
  private _blendFromPos = new THREE.Vector3();
  private _blendFromQuat = new THREE.Quaternion();
  /** Cross-fade 重新捕获 — 标记是否为重捕（vs 首次初始追踪） */
  private _isReacquisition = false;
  /** 是否曾经追踪成功过（用于区分首次初始化和重捕后的过渡） */
  private _hasEverTracked = false;
  /** 三状态平滑 — 参数配置 */
  private static readonly _STATIONARY_LOCK_FRAMES = 5;
  /**
   * 静止态的锁定值收敛系数（每帧）。
   * 0.02 ≈ 50 帧（约 0.8s）收敛到 ~63%，既消除抖动又不会锁死首帧误差。
   * 见 `_updateAnchorPose` 中 STATIONARY 分支的说明。
   */
  private static readonly _STATIONARY_CONVERGE = 0.02;
  private static readonly _DAMPING_SLOW = 5;
  private static readonly _DAMPING_FAST = 40;
  private static readonly _DEADZONE_POS = 0.01;
  private static readonly _DEADZONE_ROT = 0.017;
  /** 静止退出时首帧追赶 lambda */
  private static readonly _CATCHUP_LAMBDA = 40;
  /** Z 轴独立阻尼系数（SLOW_MOVE，X/Y 阻尼的倍数） */
  private static readonly _DAMPING_Z_SLOW = 0.3;
  /** Z 轴独立阻尼系数（FAST_MOVE） */
  private static readonly _DAMPING_Z_FAST = 0.5;
  /** FALLBACK 模式下 Z 轴死区（米，比 X/Y 大） */
  private static readonly _DEADZONE_Z = 0.02;
  /**
   * 深度幅度下限（与 z 同单位，归一化空间）。
   * 逆深度滤波用 1/depth，depth→0 会发散，所以必须有底。
   * ⚠️ 原实现把它写成 `Math.max(z, 0.1)`，等于假设 z>0；但 image 追踪的 z 是负数，
   *    结果整个逆深度链路被这一个 clamp 废掉（详见 _depthMagnitude 注释）。
   */
  private static readonly _MIN_DEPTH = 0.1;
  /** 自适应阈值 — EMA 平滑因子（用于 gyroDelta 运行均值/方差） */
  private static readonly _GYRO_EMA_ALPHA = 0.05;
  /** 自适应阈值 — 静止门限倍数 (mean + n * std) */
  private static readonly _GYRO_STATIONARY_MULT = 0.5;
  /** 自适应阈值 — 快速运动门限倍数 */
  private static readonly _GYRO_FAST_MULT = 2.0;
  /** 弹跳度 — 指数平滑因子 */
  private static readonly _BOUNCE_ALPHA = 0.15;
  /** Cross-fade 重新捕获 — 过渡总帧数（~10f ≈ 160ms @ 60fps） */
  private static readonly _BLEND_TOTAL_FRAMES = 10;
  /** 初始捕获稳定帧数 — 采集多帧平均后再开始平滑跟踪（冻结模式用） */
  private _captureFrames: Array<{ pos: THREE.Vector3; quat: THREE.Quaternion; scl: THREE.Vector3 }> = [];
  private _captureTargetFrames = 2;
  /** 陀螺仪融合 */
  private _gyroQuat = new THREE.Quaternion();
  private _gyroAtFreeze = new THREE.Quaternion();
  private _gyroTemp = new THREE.Quaternion();
  private _gyroAvailable = false;
  /** 触摸滑动偏移 */
  private _touchOffset = new THREE.Vector3();
  private _finalPos = new THREE.Vector3();
  private _touchDrag = false;
  private _touchNDC = new THREE.Vector2();
  /** 触摸旋转（360° 自由旋转） */
  private _touchRot = new THREE.Quaternion();
  private _touchDeltaQ = new THREE.Quaternion();
  private _touchEuler = new THREE.Euler();
  private _touchRotMat = new THREE.Matrix4();
  /** 工具栏控制用的模型包装组 */
  private _modelWrapper: THREE.Group | null = null;
  private _animController: AnimationController | null = null;
  /** 程序化动效控制器（自转/悬浮/脉冲/进场），作用在 __MotionLayer__ 上 */
  private _motion: MotionController | null = null;
  private _clock = new THREE.Clock();
  private _lastTapTarget: any = null;
  private _eightWall: EightWallAdapter | null = null;

  /**
   * 8th Wall 路径下注册失败的管线模块。
   *
   * 非空表示"会话起来了，但某些能力不可用"（例如自托管副本缺平面检测模块）。
   * 上层应当据此提示降级，而不是把整个体验判为失败 —— 两者对用户完全不是一回事。
   */
  get failedPipelineModules(): { name: string; message: string }[] {
    return this._eightWall?.failedModules ?? []
  }
  private _modelManager: ModelManager | null = null;
  private _videoPlayer: VideoPlayer | null = null;
  /** Markerless AR（平面放置） */
  private _arStream: MediaStream | null = null;
  private _arVideo: HTMLVideoElement | null = null;
  private _isPlaced = false;
  private _markerlessScene: THREE.Scene | null = null;
  private _markerlessCamera: THREE.PerspectiveCamera | null = null;
  private _markerlessRenderer: THREE.WebGLRenderer | null = null;
  private _markerlessGroup: THREE.Group | null = null;
  private _placementGyro = new THREE.Quaternion();
  private _hasPlaced = false;
  /** 陀螺仪平滑 */
  private _smoothGyroQuat = new THREE.Quaternion();
  private _smoothGyroReady = false;
  private _gyroLastTime = 0;
  /** 自适应平滑用 — 上一帧的 deltaQ 用于计算角速度 */
  private _prevDeltaQ = new THREE.Quaternion();
  /** V3 遗留字段 — 保留但不再使用 */
  private _prevGyroDeltaQuat = new THREE.Quaternion();
  /** 放置后陀螺仪尚未就绪时的延迟捕获标记 */
  private _pendingGyroCapture = false;
  /** 重新放置 */
  private _reticleRing: THREE.Mesh | null = null;
  private _reticleDot: THREE.Mesh | null = null;
  private _placementHint: HTMLDivElement | null = null;
  /** 替换世代计数器 — 防止异步加载回调在快速替换时错乱 */
  private _replaceGeneration = 0;
  /** 屏幕关闭恢复标记 — 用于避免非屏幕关闭时的陀螺仪参考漂移 */
  private _screenOffRecovery = false;
  /** 静止漂移校正（仅 markerless AR 用） */
  private _prevGyroDriftQuat = new THREE.Quaternion();
  private _stationaryCount = 0;
  /** 静止二段平滑用独立计数器（不与 _stationaryCount 共用） */
  private _smoothStillFrames = 0;
  /** 放置内容独立组（scene 层级，解决 gyroGroup 反旋转导致的偏移物体摆动） */
  private _placementGroup: THREE.Group | null = null;
  private _pvz: PvzController | null = null;
  /** 四元数运算预分配临时变量（减少 GC） */
  private _deltaQTmp = new THREE.Quaternion();
  private _smoothGyroTmp = new THREE.Quaternion();
  /** 漂移校正速率（越小越慢但越不易察觉），每帧 */
  private static readonly _DRIFT_CORR_RATE = 0.0005;
  /** 静止时相机确认后的快速校正速率（10x） */
  private static readonly _FAST_CORR_RATE = 0.005;
  /** 单位四元数常量（用于 deadzone 比较） */
  private static readonly _IDENTITY_QUAT = new THREE.Quaternion();
  /** 陀螺仪帧间跳变检测 — 冷却帧计数器（防连续误触） */
  private _gyroJumpCooldown = 0;
  /** iOS 互补滤波器（webkitCompassHeading 融合） */
  private _alphaFiltered: number | null = null;
  private _lastRawAlpha = 0;
  private _lastAlphaTime = 0;
  /** 方向传感器管理器（Provider 回退链） */
  private _orientationManager: OrientationManager | null = null;
  /** 交互规则执行引擎 */
  private _interactionRunner: InteractionRunner | null = null;
  /** Toast UI 元素引用 */
  private _toastEl: HTMLDivElement | null = null;
  /** 游戏引擎 */
  private _gameEngine: GameEngine | null = null;
  /** AI 游戏逻辑规则执行器 */
  private _gameLogicRunner: GameLogicRunner | null = null;
  /** 游戏 HUD */
  private _gameHUD: GameHUD | null = null;
  /** 导览引擎 */
  private _guideEngine: GuideEngine | null = null;
  /** 导览 HUD */
  private _guideHUD: GuideHUD | null = null;
  /** ARHUD runtime rendering system */
  private _arHUD: ARHUD | null = null;
  /** 表情追踪状态 */
  private _expressionState = { eyeClosed: false, mouthOpen: false };
  /** 上一帧面部特征点引用（避免每帧重复查找） */
  private _prevLandmarks: Float32Array | null = null;
  /** markerless AR 事件监听器清理函数 */
  private _markerlessCleanups: Array<() => void> = [];
  /** 8th Wall 场景位置提供器（追踪→导览桥梁） */
  private _sceneProvider: ScenePositionProvider | null = null;

  constructor(container: HTMLElement, config: ARConfig) {
    this.container = container;
    this.config = config;
  }

  /**
   * 设置追踪状态回调
   *
   * ⚠️ 这里**绝不能直接覆写** `anchor.onTargetFound`。
   *
   * 曾经写成 `this.anchor.onTargetFound = () => cb(true)`，而 ViewPage 是在
   * `engine.start()` **之后**才赋这个 setter 的 —— 于是启动时在 image 分支里
   * 挂好的真正处理器（负责 `_isReacquisition = _hasEverTracked`、`_smoothReady = false`）
   * 被整个替换掉。后果：追踪丢失后重新识别时，重捕获标志与平滑器都没有被重置，
   * 引擎拿"丢失前的旧位姿"继续平滑，模型反复向目标靠近又弹回，形成刷新循环。
   *
   * 正确做法：把外部回调和内部处理合并，内部逻辑优先，外部回调只做通知。
   */
  set onTrackingStatus(cb: ((found: boolean) => void) | null) {
    this._onTrackingStatus = cb;

    // ⚠️⚠️ 这里**绝不能重新赋值** `anchor.onTargetFound/onTargetLost`。
    //
    // 曾经的写法是「本 setter 里再赋一次 anchor 回调」——无论是直接 `= () => cb(true)`
    // 还是「重建一份内部逻辑 + cb」，都是**整体替换**：ViewPage 在 `engine.start()`
    // 之后调这个 setter，于是 image 分支启动时挂上的真正处理器（含
    // `_isReacquisition` / `_smoothReady` 重置、`_frozen` 复位、多目标 rec 记录、
    // 视频路径的 tryPlay/player.pause）被一并抹掉。
    // 后果：丢帧重捕获时平滑器不重置，引擎拿"丢失前的旧位姿"继续平滑，
    // 模型反复靠近又弹回，形成用户看到的"不断刷新回原点"循环。
    //
    // 正确做法：anchor 回调由 start() 内部的**唯一写入方**建立（image / face / video
    // 三条路径各自负责自己的副作用），外部只通过 `_onTrackingStatus` 收通知。
    // 这里仅在回调尚未安装时（例如 start() 之前就赋了 setter）补一个最小兜底，
    // 且必须走**链式追加**，绝不覆盖已有处理器。
    if (this.anchor && !this.anchor.onTargetFound) {
      this.anchor.onTargetFound = () => {
        this._onTrackingStatus?.(true);
      };
      this.anchor.onTargetLost = () => {
        this._onTrackingStatus?.(false);
      };
    }
  }

  set onModelStatus(cb: ((status: 'loading' | 'loaded' | 'error', pct?: number) => void) | null) {
    this._onModelStatus = cb;
  }

  set onFeatureQuality(cb: ((quality: { features: number; confidence: number; quality: 'good' | 'fair' | 'poor' }) => void) | null) {
    this._onFeatureQuality = cb;
  }

  /**
   * 初始化并启动 AR
   *
   * 流程：
   *  1. 选择/降级追踪模式
   *  2. 动态加载 MindAR 对应模块
   *  3. 配置 Three.js 场景（灯光）
   *  4. 创建锚点
   *  5. 加载 .glb 模型到锚点
   *  6. 启动 AR 渲染循环
   */
  async start(onProgress?: (pct: number) => void): Promise<void> {
    if (this.started || this._starting) return;
    this._starting = true;

    // 8th Wall 引擎路径
    if (this.config.engine === '8thwall' || this.config.tracking === 'world') {
      await this.startEightWall(onProgress);
      this._starting = false;
      return;
    }

    // CameraARAdapter 路径（跨浏览器通用，摄像头+陀螺仪）
    if (this.config.engine === 'camera') {
      await this.startCameraAR(onProgress);
      this._starting = false;
      return;
    }

    // 在 try 块外声明，因为 try 块后的代码也需要使用
    let renderer: any = null;
    let scene: any = null;
    let camera: any = null;
    let anchor: any = null;

    try {
      // 1. 选择追踪模式（plane 不支持时自动降级到 image）
      this.trackingType = await selectTracking(this.config.tracking);

      // 2. plane 走 markerless AR（陀螺仪 + 固定深度放置）
      if (this.trackingType === "plane") {
        return this.startMarkerlessAR(onProgress);
      }

      // 3. 动态加载 MindAR
      console.log("[AREngine] 动态加载 MindAR...");
      this.mindAR = await initMindAR(
        this.container,
        this.config.targetUrl,
        this.trackingType,
        {
          filterMinCF: this.config.filterMinCF,
          filterBeta: this.config.filterBeta,
          missTolerance: this.config.missTolerance,
          warmupTolerance: this.config.warmupTolerance,
          maxTrack: this.config.maxTrack,
        }
      );

      // 赋值给外部 let 变量，供 try 块后的代码使用
      const mindAR = this.mindAR;
      renderer = mindAR.renderer;
      scene = mindAR.scene;
      camera = mindAR.camera;
      this._activeCamera = camera;

      // 4. 限制 pixel ratio 防止高 DPI 手机性能问题
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      // 4b. WebGL 上下文存活监控
      //     手机显存吃紧时驱动会静默丢弃上下文 → 画面全黑但 JS/追踪仍在跑，
      //     现场看起来就是"识别成功但什么都看不到"。不主动监听就完全无声，
      //     这里至少把它暴露到日志与 onError，避免继续被当成"位置/尺度问题"排查。
      this._bindContextLossWatcher(renderer);

      // 5. 灯光
      const ambient = new THREE.AmbientLight(0xffffff, 1.5);
      scene.add(ambient);

      const directional = new THREE.DirectionalLight(0xffffff, 2);
      directional.position.set(0, 3, 3);
      scene.add(directional);

      // 6. 读取冻结模式配置
      this._freezeOnDetect = this.config.freezeOnDetect ?? true;

      // 6b. 初始化方向传感器（回退链模式）
      await this._initGyroscope();

      // 6b1. 初始化陀螺仪角速度跟踪（含漂移校正参考）
      this._prevGyroQuat.copy(this._gyroQuat);
      this._prevGyroDriftQuat.copy(this._gyroQuat);

      // 6c. 初始化触摸拖动（手动调整模型位置）
      this._initTouchDrag();

      // 7. 创建锚点（图片多目标 / 面部特征点索引支持）
      // 3DAR 期1：同一物体多角度编译进一个 .mind（maxTrack>1）时，为每个 target 建 anchor；
      // 内容挂在"当前激活"的 anchor 上，切换时做 300ms 位姿连续混合（见 _selectActiveImageAnchor）。
      const isImageMulti = this.trackingType === "image" && (this.config.maxTrack ?? 1) > 1;
      const enabledZones = this.config.faceZones?.filter(z => z.enabled && (z.modelUrl || z.videoUrl || z.contentSource === 'generated' || z.contentSource === 'decal'));
      if (isImageMulti) {
        const n = Math.max(1, Math.floor(this.config.maxTrack ?? 1));
        console.log(`[AREngine] 图片多目标模式：为 ${n} 个 target 建 anchor`);
        this._imageAnchors = [];
        for (let i = 0; i < n; i++) {
          const a = this.mindAR.addAnchor(i);
          const rec = { index: i, anchor: a, found: false, lastFoundAt: 0 };
          a.onTargetFound = () => {
            rec.found = true;
            rec.lastFoundAt = performance.now();
            if (this._activeImageIndex !== i) this._selectActiveImageAnchor(i);
            this._frozen = false;
            this._trackingFound = true;
            this._lostFrameCount = 0;
            this._isReacquisition = this._hasEverTracked;
            this._smoothReady = false;
            this._onTrackingStatus?.(true);
            this._interactionRunner?.fireOnce('onTrackingFound');
          };
          a.onTargetLost = () => {
            rec.found = false;
            // 激活目标丢失 → 无缝切到仍在跟踪的其他 target；全丢才算 lost
            if (this._activeImageIndex === i) {
              const alt = this._imageAnchors.find(r => r.found && r.index !== i);
              if (alt) {
                this._selectActiveImageAnchor(alt.index);
              } else {
                this._trackingFound = false;
                this._lostFrameCount = 0;
                this._onTrackingStatus?.(false);
                this._interactionRunner?.fireOnce('onTrackingLost');
              }
            }
          };
          this._imageAnchors.push(rec);
        }
        this.anchor = this._imageAnchors[0].anchor;
        this._activeImageIndex = 0;
      } else if (enabledZones && enabledZones.length > 0) {
        console.log('[AREngine] face multi-zone mode:', enabledZones.map(z => z.zoneId).join(', '));
        for (const z of enabledZones) {
          const primaryLandmark = z.landmarks[0] ?? 0;
          const zoneAnchor = this.mindAR.addAnchor(primaryLandmark);
          zoneAnchor.onTargetFound = () => {
            this._frozen = false;
            this._trackingFound = true;
            this._lostFrameCount = 0;
            this._isReacquisition = this._hasEverTracked;
            this._smoothReady = false;
            this._onTrackingStatus?.(true);
            this._interactionRunner?.fireOnce('onTrackingFound');
          };
          zoneAnchor.onTargetLost = () => {
            this._trackingFound = false;
            this._lostFrameCount = 0;
            this._onTrackingStatus?.(false);
            this._interactionRunner?.fireOnce('onTrackingLost');
          };
          this._anchors.push({ zoneId: z.zoneId, anchor: zoneAnchor, modelWrapper: null, videoPlayer: null });
        }
        anchor = this._anchors[0].anchor;
        this.anchor = anchor;
      } else {
        const faceFeatureIdx = this.config.faceFeature ?? 0;
        console.log('[AREngine] 使用面部特征点:', faceFeatureIdx);
        anchor = this.mindAR.addAnchor(faceFeatureIdx);
        this.anchor = anchor;

        anchor.onTargetFound = () => {
          this._frozen = false;
          this._trackingFound = true;
          this._lostFrameCount = 0;
          this._isReacquisition = this._hasEverTracked;
          this._smoothReady = false;
          this._onTrackingStatus?.(true);
          this._interactionRunner?.fireOnce('onTrackingFound');
        };
        anchor.onTargetLost = () => {
          this._trackingFound = false;
          this._lostFrameCount = 0;
          this._onTrackingStatus?.(false);
          this._interactionRunner?.fireOnce('onTrackingLost');
        };
      }

      // 7. 启动 AR（摄像头、追踪开始）
      console.log("[AREngine] 调用 mindAR.start()...");
      await this.mindAR.start();
      console.log("[AREngine] mindAR.start() 成功");

      // ⚠️ 必须在渲染循环启动前捕获 anchor 尺度：postMatrixs 由 mindAR.start() 内
      // 的 addImageTargets 填充，而 _updateAnchorPose 每帧都会用 _capturedScl 覆写
      // group.matrix。晚一步捕获 → 首帧就是错的尺寸/位置。
      this._captureAnchorScale();
    } catch (initErr) {
      console.error("[AREngine] start() 初始化失败:", initErr);
      console.error("[AREngine] 错误详情:", initErr instanceof Error ? `${initErr.name}: ${initErr.message}\n${initErr.stack}` : JSON.stringify(initErr));
      // MindAR 某些路径 reject 时不传参数（如 _startVideo 中 getUserMedia 失败时 t() 无参数）
      if (initErr === undefined) {
        throw new Error('摄像头启动失败，请确保已授予摄像头权限并使用 HTTPS 访问');
      }
      throw initErr; // 重新抛出让 ViewPage 处理
    }
    this.started = true;

    // 8. 全屏相机预览：video 元素设置 object-fit: cover
    // MindAR 默认使用相机 4:3 输出，长屏手机会在上下产生黑边。
    // object-fit: cover 让视频内容铺满整个元素（裁剪多余部分），
    // 与手机系统相机的全屏预览行为一致。
    // 内部追踪算法依然使用原始 4:3 帧数据计算位姿，识别精度不变。
    //
    // ⚠️ cover 会放大并裁切画面（竖屏手机上横向可裁掉近百像素），
    //    渲染层必须按"可见区域"重算 FOV，否则模型会画到被裁掉的区域里
    //    —— 表现为桌面正常、手机完全看不到（详见 _applyCoverProjection）。
    if (this.mindAR.video) {
      this.mindAR.video.style.objectFit = "cover";
    }

    // 8b. 摄像头流降规格（移动端）
    //     MindAR 1.2.5 的 getUserMedia 传的是 `video: {}`（无任何尺寸约束），
    //     手机因此可能给出 1280×720/1920×1080 的流。该流的每一帧都要过
    //     TF.js 特征检测 + 纹理上传，是手机上最大的一笔固定开销。
    //     这里在 start() 之后用 applyConstraints 收紧到 640×480：
    //       - 追踪精度几乎不变（MindAR 内部本来就会缩到低分辨率做检测）
    //       - 每帧纹理上传量与特征运算量显著下降
    //     ⚠️ 官方 1.2.5 **没有** resolution/setResolution/targetFPS 这些参数
    //        （那是社区 fork 的功能），所以只能走 applyConstraints 这条路。
    await this._capCameraStreamForMobile();

    // 9. 提取垂直 FOV，用屏幕实际 aspect 重建投影
    // （保留 FOV 精度，修正 aspect 以消除 4:3 → 20:9 导致的模型拉伸）
    this._applyCoverProjection();

    // 11. 启动 Three.js 渲染循环（带 delta 时间用于动画更新）
    let lastW = this.container.clientWidth;
    let lastH = this.container.clientHeight;
    const clock = this._clock;

    // 点击交互处理器（交互规则 + 游戏收集 + 动画切换）
    const handleTap = (clientX?: number, clientY?: number) => {
      // 1. 事件-动作系统：onTap
      this._interactionRunner?.fire('onTap');

      // 2. 游戏模式：射线检测收集物品
      if (this._gameEngine?.running && clientX !== undefined && clientY !== undefined) {
        this._tryCollectGameItem(clientX, clientY);
      }

      // 3. 向后兼容：动画切换
      const ctrl = this._animController;
      const animCfg = this.config.animation;
      if (!ctrl || !animCfg?.enabled) return;
      if (animCfg.interaction?.type === 'tap') {
        ctrl.playNext(0.3);
      }
    };
    this.container.addEventListener('click', (e: MouseEvent) => {
      handleTap(e.clientX, e.clientY);
    });
    this.container.addEventListener('touchstart', (e) => {
      if (e.changedTouches.length === 1) {
        handleTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }
    }, { passive: true });

    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      if (this.mindAR) {
        const cw = this.container.clientWidth;
        const ch = this.container.clientHeight;
        if (cw !== lastW || ch !== lastH) {
          lastW = cw;
          lastH = ch;
          // 尺寸变化时重算投影：必须走 cover 补偿，否则 FOV 会退回"整帧可见"的假设
          this._applyCoverProjection();
        }
        this._updateAnchorPose();
        // 每帧确保 FOV 和 aspect 正确（防止 MindAR 内部修改投影矩阵）
        // ⚠️ 这里是 _verticalFov 的另一个写入方：当容器尺寸未变时，直接沿用
        //    _applyCoverProjection 算出的补偿后 FOV；不能用 cw/ch 覆盖 aspect 而不重算 FOV。
        this.mindAR.camera.fov = this._verticalFov;
        this.mindAR.camera.aspect = cw / ch;
        this.mindAR.camera.updateProjectionMatrix();
      }
      // 更新动画（delta 受 clock.getDelta 驱动）
      this._animController?.update(delta);
      // 程序化动效（自转/悬浮/脉冲/进场）—— 与 GLB 自带片段互不影响
      this._motion?.update(delta);
      renderer.render(scene, camera);
    });

    // 8. multi-zone / single anchor model loading
    const enabledZones = this.config.faceZones?.filter(z => z.enabled && (z.modelUrl || z.videoUrl || z.contentSource === 'generated' || z.contentSource === 'decal'));
    if (enabledZones && enabledZones.length > 0) {
      for (const z of enabledZones) {
        const zoneInfo = this._anchors.find(a => a.zoneId === z.zoneId);
        if (!zoneInfo) continue;
        const zoneAnchor = zoneInfo.anchor;
        const pos = this.config.position || [0, 0, 0];
        const zScale = z.scale || 1;

        if (z.contentType === 'video' && z.videoUrl) {
          this._loadVideoIntoAnchor(zoneAnchor, z.videoUrl, pos, zScale);
        } else if (z.contentSource === 'generated' && z.generatedType && z.generatedType !== 'none') {
          this._loadGeneratedIntoAnchor(zoneAnchor, z.generatedType, zScale);
        } else if (z.contentSource === 'decal' && z.decalUrl) {
          this._loadDecalIntoAnchor(zoneAnchor, z.decalUrl, zScale);
        } else if (z.modelUrl) {
          this.loadModel(z.modelUrl, zoneAnchor, undefined).then(() => {
            if (zoneInfo.modelWrapper) {
              zoneInfo.modelWrapper.scale.setScalar(zScale);
            }
          });
        }
      }
    } else {
      const placeholder = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x22c55e })
      );
      placeholder.position.set(0, 0.15, 0.3);
      anchor.group.add(placeholder);

      if (this.config.videoUrl) {
        anchor.group.remove(placeholder);
        placeholder.geometry.dispose();
        placeholder.material.dispose();
        this._onModelStatus?.('loading', 0);
        this._loadVideo(anchor.group);
      } else if (this.config.modelUrl) {
        this._onModelStatus?.('loading', 0);
        // 与网页编辑器预览（ArPreview3D）的尺寸约定严格对齐：
        //   预览中目标图固定为 0.3m 宽卡片，模型最长边 = 0.12 × scale (米)。
        // AR 侧假定打印的目标图实际宽 0.3m。
        //
        // wrapper 是 anchor.group 的子节点，而 anchor.group 的尺度已由
        // _captureAnchorScale 恢复为图宽像素数 W（见 _updateAnchorPose）。
        // 因此这里只需要给"米"换算成"图宽的比例单位"：
        //   目标模型世界宽度(米) = 0.12 × scale × maxDim/W  ← wrapper.scale
        //   乘以父级尺度 W → 世界宽度 = 0.12 × scale × maxDim  ❌ 少了 /0.3
        // 即 wrapper.scale 必须 = 0.12·scale / 0.3，与父级尺度无关。
        // ⚠️ 不要再乘 W：那会把尺度放大 W 倍（曾经的重复补偿 bug）。
        const fitMaxDimUnits = this.trackingType === "image"
          ? 0.12 * (this.config.scale ?? 1) / 0.3
          : undefined;
        this.loadModel(this.config.modelUrl, anchor, (pct) => {
          this._onModelStatus?.('loading', pct);
          onProgress?.(pct);
        }, fitMaxDimUnits).then(() => {
          anchor.group.remove(placeholder);
          placeholder.geometry.dispose();
          placeholder.material.dispose();
          this._onModelStatus?.('loaded');
          console.log("模型加载成功");
        }).catch((err) => {
          console.error("模型加载失败:", err.message);
          (placeholder.material as THREE.MeshStandardMaterial).color.setHex(0xff4444);
          this._onModelStatus?.('error');
        });
      }
    }
  }

  /**
   * 加载视频平面替代 3D 模型
   */
  private _loadVideo(parent: THREE.Group): Promise<void> {
    const url = this.config.videoUrl;
    if (!url) {
      console.warn('[AREngine] 视频 URL 为空，跳过加载');
      return Promise.resolve();
    }
    console.log('[AREngine] 加载视频:', url);
    const player = new VideoPlayer({ videoUrl: url, muted: false, loop: true })
    this._videoPlayer = player

    // 创建包装组使缩放控制生效（setModelScale 操作 _modelWrapper）
    const wrapper = new THREE.Group();
    // markerless 路径：_placementGroup 已携带偏移量，wrapper 在组内必须 (0,0,0)
    if (parent === this._placementGroup) {
      wrapper.position.set(0, 0, 0);
    } else {
      // image 路径同样要做 米 → anchor 单位 换算，理由见 loadModel 内注释
      const pos = this.config.position;
      const toUnits = this._metersToAnchorUnits();
      wrapper.position.set(pos[0] * toUnits, pos[1] * toUnits, pos[2] * toUnits);
    }
    parent.add(wrapper);
    this._modelWrapper = wrapper;

    // 绑定点击播放
    player.bindClick(this.container);

    return player.load(wrapper).then(() => {
      console.log('[AREngine] 视频平面已创建')

      // 启用广告牌：视频平面始终面向相机，消除倾斜/旋转时的透视缩短
      player.enableBillboard('constrained');

      // 检测到目标后自动播放
      const tryPlay = () => {
        player.play().then(() => {
          console.log('[AREngine] 视频自动播放')
        }).catch(() => {})
      }
      // 追踪到目标后自动播放，丢失后暂停
      // ⚠️ 这里在原有的内部状态处理之上**追加**播放/暂停，不能整体替换 ——
      //    否则 `_isReacquisition` / `_smoothReady` 的重置会丢失（见 onTrackingStatus setter 的说明）。
      if (this.anchor) {
        const prevFound = this.anchor.onTargetFound;
        const prevLost = this.anchor.onTargetLost;
        this.anchor.onTargetFound = () => {
          this._trackingFound = true;
          this._lostFrameCount = 0;
          this._isReacquisition = this._hasEverTracked;
          this._smoothReady = false;
          this._onTrackingStatus?.(true);
          prevFound?.();
          tryPlay();
        };
        this.anchor.onTargetLost = () => {
          this._trackingFound = false;
          this._lostFrameCount = 0;
          this._onTrackingStatus?.(false);
          prevLost?.();
          player.pause();
        };
      }
    }).catch((err) => {
      console.error('[AREngine] 视频加载失败:', err)
      this._onModelStatus?.('error')
    })
  }

  /**
   * 加载视频到指定锚点（面部区域用）
   */
  private _loadVideoIntoAnchor(anchor: any, videoUrl: string, pos: [number, number, number], scale: number): void {
    console.log('[AREngine] 加载区域视频:', videoUrl);
    const player = new VideoPlayer({ videoUrl, muted: false, loop: true });
    // 存储到对应 zoneInfo
    const zoneInfo = this._anchors.find(a => a.anchor === anchor);
    if (zoneInfo) zoneInfo.videoPlayer = player;

    player.load(anchor.group, new THREE.Vector3(pos[0], pos[1], pos[2])).then(() => {
      anchor.group.scale.setScalar(scale);
      this._onModelStatus?.('loaded');
    }).catch((err) => {
      console.error('[AREngine] 区域视频加载失败:', err);
      this._onModelStatus?.('error');
    });

    player.bindClick(this.container);
  }

  /**
   * 加载内置几何体到指定锚点（面部区域用）
   */
  private _loadGeneratedIntoAnchor(anchor: any, genType: FaceModelType, scale: number): void {
    try {
      const group = FaceModelGenerator.generate(genType);
      group.scale.setScalar(scale);
      anchor.group.add(group);

      // 保存到 zoneInfo
      const zoneInfo = this._anchors.find(a => a.anchor === anchor);
      if (zoneInfo) zoneInfo.modelWrapper = group;

      this._onModelStatus?.('loaded');
      console.log(`[AREngine] 内置几何体已加载: ${genType}`);
    } catch (err) {
      console.error(`[AREngine] 内置几何体加载失败: ${genType}`, err);
      this._onModelStatus?.('error');
    }
  }

  /**
   * 加载 2.5D 贴片到指定锚点（面部区域用）
   *
   * 用户上传 PNG 透明图 → PlaneGeometry 贴于面部区域
   */
  private _loadDecalIntoAnchor(anchor: any, decalUrl: string, scale: number): void {
    const loader = new THREE.TextureLoader();
    loader.load(
      decalUrl,
      (texture) => {
        const aspect = texture.image ? texture.image.width / texture.image.height : 1;
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.08 * aspect, 0.08),
          new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        plane.scale.setScalar(scale);
        anchor.group.add(plane);

        const zoneInfo = this._anchors.find(a => a.anchor === anchor);
        if (zoneInfo) zoneInfo.modelWrapper = plane;

        this._onModelStatus?.('loaded');
        console.log('[AREngine] 面部贴片已加载:', decalUrl);
      },
      undefined,
      (err) => {
        console.error('[AREngine] 面部贴片加载失败:', decalUrl, err);
        this._onModelStatus?.('error');
      }
    );
  }

  /**
   * Markerless AR — 平面放置模式
   *
   * 用单个 Three.js renderer + 摄像头视频纹理实现。
   * 摄像头画面渲染为场景背景，3D reticle 和模型叠加在上方。
   * 通过 DeviceOrientation 陀螺仪让物体在空间中保持位置。
   *
   * 流程：
   *  1. 启动摄像头 → 创建 VideoTexture 作为场景背景
   *  2. 显示蓝色放置圆环（reticle）在画面中心
   *  3. 陀螺仪追踪设备旋转
   *  4. 点击屏幕 → 移除 reticle → 加载模型/视频到 reticle 位置
   *  5. 放置后通过陀螺仪差值保持物体空间位置
   */
  private async startMarkerlessAR(onProgress?: (pct: number) => void): Promise<void> {
    const container = this.container;
    const w = container.clientWidth;
    const h = container.clientHeight;

    // 1. 启动摄像头（支持回退到默认摄像头）
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
    } catch {
      // 回退：不指定 facingMode（桌面端或仅有一个摄像头）
      try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); } catch (fallbackErr) { throw new Error("未找到可用摄像头，请确认设备已连接摄像头且已授予访问权限"); }
    }
    this._arStream = stream;

    // 2. 创建 video 元素用于纹理
    const video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    video.loop = true;
    await video.play();
    this._arVideo = video;

    // 2b. 启动相机运动检测（与 OrientationManager 联动）
    if (this._orientationManager) {
      this._orientationManager.enableMotionDetection(video);
    }

    // 3. 创建 Three.js 渲染器（不透明，视频纹理作背景）
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, failIfMajorPerformanceCaveat: false })
    } catch {
      console.warn('[AREngine] 主 WebGL 渲染器创建失败')
      // 尝试不带 antialias
      try {
        renderer = new THREE.WebGLRenderer({ failIfMajorPerformanceCaveat: false })
      } catch {
        throw new Error('WebGL 渲染器创建失败，请检查浏览器 GPU 设置')
      }
    }
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000);
    container.appendChild(renderer.domElement);
    this._markerlessRenderer = renderer;

    // 4. 场景 + 相机
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.01, 100);
    camera.position.set(0, 0, 0);
    this._markerlessScene = scene;
    this._markerlessCamera = camera;

    // 视频纹理背景
    const videoTex = new THREE.VideoTexture(video);
    videoTex.minFilter = THREE.LinearFilter;
    videoTex.magFilter = THREE.LinearFilter;

    // 用精确的 frustum 尺寸替代旧的大平面 + scale 方式。
    // 旧：PlaneGeometry(10,10) → scale 放大 → 纹理仅中间 15% 可见 = 严重放大。
    // 新：计算相机在 z=-dist 处的视口尺寸，按"cover"模式匹配视频比例。
    //     "cover" = 视频填充屏幕，溢出方向裁剪（不拉伸不变形）。
    const BG_DIST = 5
    const vFovRad = 60 * Math.PI / 180
    const vpHeight = 2 * Math.tan(vFovRad / 2) * BG_DIST
    const vpWidth = vpHeight * (w / h)
    const videoAspect = (video.videoWidth && video.videoHeight) ? video.videoWidth / video.videoHeight : 16 / 9
    // cover：短边对齐视口，长边溢出裁剪
    const coverScale = Math.max(vpWidth / vpHeight, videoAspect) / Math.min(vpWidth / vpHeight, videoAspect)
    let planeW: number, planeH: number
    if (w / h > videoAspect) {
      // 屏幕比视频更宽 → 宽度对齐，上下裁剪
      planeW = vpWidth
      planeH = vpWidth / videoAspect
    } else {
      // 屏幕比视频更窄 → 高度对齐，左右裁剪
      planeH = vpHeight
      planeW = vpHeight * videoAspect
    }

    const bgGeom = new THREE.PlaneGeometry(planeW, planeH);
    const bgMat = new THREE.MeshBasicMaterial({ map: videoTex, side: THREE.DoubleSide });
    const bgMesh = new THREE.Mesh(bgGeom, bgMat);
    bgMesh.position.set(0, 0, -BG_DIST);
    scene.add(bgMesh);

    // 6. 灯光
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(0, 3, 3);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-2, 1, -2);
    scene.add(fillLight);

    // 7. 陀螺仪组 — reticle 放在组中，跟随陀螺仪旋转
    const gyroGroup = new THREE.Group();
    gyroGroup.position.set(0, 0, 0);
    scene.add(gyroGroup);
    this._markerlessGroup = gyroGroup;

    // 7b. 放置内容独立组 — 仅在放置后容纳模型/视频
    // 该组在 scene 层级，渲染循环只对其反旋转（而非 gyroGroup 整体反旋转）
    // 解决：gyroGroup 反旋转时偏移物体沿圆弧摆动的问题
    // 关键：放置内容的 wrapper 在组内位于 (0,0,0)，组本身的 position 携带偏移量
    // 这样反旋转组时不会导致子对象位置摆动
    const placementGroup = new THREE.Group();
    const cfgPos = this.config.position || [0, 0.15, -0.2];
    placementGroup.position.set(cfgPos[0], cfgPos[1], cfgPos[2]);
    scene.add(placementGroup);
    this._placementGroup = placementGroup;

    // 8. 放置圆环（reticle）
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.09, 48),
      new THREE.MeshBasicMaterial({ color: 0x4f8cff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    gyroGroup.add(ring);
    this._reticleRing = ring;

    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.015, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
    );
    gyroGroup.add(dot);
    this._reticleDot = dot;

    // reticle position = placement distance
    const rp = this.config.position || [0, 0.15, -0.2];
    ring.position.set(rp[0], rp[1], rp[2]);
    dot.position.set(rp[0], rp[1], rp[2]);

    // 9. 提示文字 HTML 覆盖层
    const hint = document.createElement('div');
    hint.textContent = '点击屏幕放置';
    hint.style.cssText = 'position:absolute;bottom:80px;left:50%;transform:translateX(-50%);'
      + 'color:rgba(255,255,255,0.9);font-size:14px;font-weight:500;'
      + 'background:rgba(0,0,0,0.4);padding:8px 20px;border-radius:20px;'
      + 'pointer-events:none;z-index:10;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.1)';
    container.appendChild(hint);
    this._placementHint = hint;

    // 10. 延迟初始化陀螺仪 — 首次触摸时请求权限并启动传感器
    // iOS 要求 DeviceOrientationEvent.requestPermission() 在用户手势中调用。
    // 在 start() 中调用会被静默忽略 → _gyroAvailable 始终 false → 物体"粘屏"
    let gyroInitialized = false;
    const initGyroOnInteraction = () => {
      if (gyroInitialized) return;
      gyroInitialized = true;
      container.removeEventListener('click', initGyroOnInteraction);
      container.removeEventListener('touchstart', initGyroOnInteraction);
      if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
        (DeviceOrientationEvent as any).requestPermission().then((state: string) => {
          if (state === 'granted') {
            this._initGyroscope().catch(err => console.warn('[AR] 陀螺仪初始化失败:', err));
          } else {
            console.warn('[AR] 用户拒绝了传感器权限');
          }
        }).catch(() => {
          this._initGyroscope().catch(err => console.warn('[AR] 陀螺仪初始化失败:', err));
        });
      } else {
        this._initGyroscope().catch(err => console.warn('[AR] 陀螺仪初始化失败:', err));
      }
    };
    container.addEventListener('click', initGyroOnInteraction);
    container.addEventListener('touchstart', initGyroOnInteraction, { passive: true });
    this._markerlessCleanups.push(
      () => container.removeEventListener('click', initGyroOnInteraction),
      () => container.removeEventListener('touchstart', initGyroOnInteraction),
    );

    // 11. 通知 UI：正在扫描
    this._onTrackingStatus?.(false);

    // 12. 点击放置
    const doPlace = () => {
      // PvZ 模式：棋盘已放置后，点击交给游戏（种植/收集），不再重复放置
      if (this.config.pvzConfig?.enabled && this._pvz) return;
      if (this._hasPlaced) return;
      this._hasPlaced = true;

      const currentGen = this._replaceGeneration;

      // 使用实例变量而非闭包变量（支持 replacePlacedObject 后正确清除）
      if (this._reticleRing) {
        gyroGroup.remove(this._reticleRing);
        this._reticleRing.geometry.dispose();
        (this._reticleRing.material as THREE.Material).dispose();
        this._reticleRing = null;
      }
      if (this._reticleDot) {
        gyroGroup.remove(this._reticleDot);
        this._reticleDot.geometry.dispose();
        (this._reticleDot.material as THREE.Material).dispose();
        this._reticleDot = null;
      }
      if (this._placementHint) {
        if (this._placementHint.parentNode) this._placementHint.parentNode.removeChild(this._placementHint);
        this._placementHint = null;
      }

      // 如果陀螺仪已就绪，捕获当前朝向作为参考
      if (this._gyroAvailable) {
        this._placementGyro.copy(this._gyroQuat);
      } else {
        // 陀螺仪尚未就绪（iOS 权限刚请求、传感器数据还未到达）
        // 设置标记，由陀螺仪回调在首次收到数据时自动捕获
        this._pendingGyroCapture = true;
      }

      const onLoadComplete = () => {
        if (this._replaceGeneration !== currentGen) {
          // 此加载请求已被更新的 replace 覆盖，丢弃
          if (this._modelWrapper) {
            this._modelWrapper.parent?.remove(this._modelWrapper);
            this._modelWrapper = null;
          }
        } else {
          // 重置 wrapper 位置到 config.position：_placementGroup 已携带偏移量，
          // wrapper 在组内必须位于原点，否则反旋转时仍会摆动。
          // ⚠️ markerless 路径 _metersToAnchorUnits() 恒返回 1（_placementGroup 尺度=1），
          // 因此这里写成带换算的通用式，既能给 image 复用，也不会改变 markerless 行为。
          if (this._modelWrapper) {
            const pos = this.config.position;
            const inPlacementGroup =
              !!this._modelWrapper.parent && this._modelWrapper.parent === this._placementGroup;
            if (inPlacementGroup || !pos) {
              this._modelWrapper.position.set(0, 0, 0);
            } else {
              const u = this._metersToAnchorUnits();
              this._modelWrapper.position.set(pos[0] * u, pos[1] * u, pos[2] * u);
            }
          }
        }
        this._onModelStatus?.('loaded');
      };

      if (this.config.pvzConfig?.enabled) {
        if (!this._pvz) {
          this._pvz = new PvzController({
            group: this._placementGroup!, scene, camera,
            container: this.container, config: this.config.pvzConfig,
          });
          this._pvz.start();
          this._onModelStatus?.('loaded');
        }
      } else if (this.config.videoUrl) {
        this._onModelStatus?.('loading', 0);
        this._loadVideo(this._placementGroup!).then(onLoadComplete).catch(() => {});
      } else if (this.config.modelUrl) {
        this._onModelStatus?.('loading', 0);
        this.loadModel(this.config.modelUrl, { group: this._placementGroup! }, onProgress).then(onLoadComplete).catch(() => {});
      }

      this._isPlaced = true;
      this._onTrackingStatus?.(true);
    };

    const onPlaceTouch = (e: TouchEvent) => {
      if (e.changedTouches.length === 1) doPlace();
    };
    container.addEventListener('click', doPlace);
    container.addEventListener('touchstart', onPlaceTouch, { passive: true });
    this._markerlessCleanups.push(() => { this._pvz?.dispose(); this._pvz = null; });
    this._markerlessCleanups.push(
      () => container.removeEventListener('click', doPlace),
      () => container.removeEventListener('touchstart', onPlaceTouch as EventListener),
    );

    // 13. 屏幕关闭恢复跟踪 — 避免非屏幕关闭时的陀螺仪参考漂移
    const onVisibilityChange = () => {
      if (document.hidden) {
        this._screenOffRecovery = true;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    this._markerlessCleanups.push(
      () => document.removeEventListener('visibilitychange', onVisibilityChange),
    );

    // 14. 窗口 resize
    const onResize = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      // 与 _applyCoverProjection 一致：先压 pixelRatio 再 setSize
      const capped = Math.min(window.devicePixelRatio || 1, 2);
      if (Math.abs((renderer.getPixelRatio?.() ?? 1) - capped) > 0.001) renderer.setPixelRatio(capped);
      renderer.setSize(cw, ch);
    };

    // 14. 渲染循环
    renderer.setAnimationLoop(() => {
      const frameDt = this._clock.getDelta();
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (Math.abs(camera.aspect - cw / ch) > 0.001) onResize();

      if (this._gyroAvailable) {
        if (this._hasPlaced) {
          // 已放置：计算设备从放置到现在的旋转 deltaQ
          // 使用预分配变量减少 GC
          const deltaQ = this._deltaQTmp.copy(this._placementGyro).invert().multiply(this._gyroQuat);

          // === 陀螺仪跳变保护（万向锁 / 罗盘干扰） ===
          // 当 deltaQ 与平滑值差异 > 0.3 rad（~17°），说明传感器发生了跳变
          // （如 DeviceOrientation API 在 beta≈90° 时的 alpha 突变）。
          // 此时重置放置参考点，放置内容的反旋转固定在当前位置，
          // 避免物体视觉跳变。陀螺仪恢复正常后自动平滑恢复跟踪。
          if (this._gyroJumpCooldown > 0) this._gyroJumpCooldown--;
          if (this._smoothGyroReady) {
            const jumpAngle = this._smoothGyroQuat.angleTo(deltaQ);
            if (jumpAngle > 0.3 && this._gyroJumpCooldown <= 0) {
              this._placementGyro.copy(this._gyroQuat);
              // 用新参考重新计算 deltaQ（此时 ≈ 单位四元数）
              deltaQ.copy(this._placementGyro).invert().multiply(this._gyroQuat);
              this._smoothGyroQuat.copy(deltaQ);
              this._prevDeltaQ.copy(deltaQ);
              this._smoothStillFrames = 0;
              this._gyroJumpCooldown = 30; // ~500ms 冷却
            }
          }

          // === DeltaQ 死区 ===
          // 传感器底噪导致 deltaQ 在单位四元数附近微抖，
          // 设置 0.005 rad（~0.29°）死区：帧间变化小于此值的
          // 直接被当作无变化处理，消除 slerp 积累的微抖。
          if (deltaQ.angleTo(AREngine._IDENTITY_QUAT) < 0.005) {
            deltaQ.copy(AREngine._IDENTITY_QUAT);
          }

          if (!this._smoothGyroReady) {
            this._smoothGyroQuat.copy(deltaQ);
            this._prevDeltaQ.copy(deltaQ);
            this._smoothStillFrames = 0;
            this._smoothGyroReady = true;
          } else {
            // 自适应平滑：根据角速度调整 slerp 因子
            const dt = frameDt;
            const angleBetween = this._prevDeltaQ.angleTo(deltaQ);
            this._prevDeltaQ.copy(deltaQ);
            let slerpFactor: number;
            if (dt > 0 && angleBetween / dt < 0.05) {
              // 静止/极慢：二段平滑，持续越久因子越低
              this._smoothStillFrames++;
              if (this._smoothStillFrames > 120) {
                slerpFactor = 0.05;   // 超长静止（>2s）：极大平滑
              } else if (this._smoothStillFrames > 30) {
                slerpFactor = 0.1;    // 长静止（>500ms）：高度平滑
              } else {
                slerpFactor = 0.3;    // 刚进入静止：中等平滑
              }
            } else {
              this._smoothStillFrames = 0;
              if (dt > 0 && angleBetween / dt < 0.5) {
                slerpFactor = 0.6;   // 慢速转动：较响应
              } else if (dt > 0 && angleBetween / dt < 2.0) {
                slerpFactor = 0.85;  // 中等速度：快速跟随
              } else {
                slerpFactor = 0.95;  // 快速转动：近乎即时
              }
            }
            this._smoothGyroQuat.slerp(deltaQ, slerpFactor);
            this._smoothGyroQuat.normalize();
          }
          // gyroGroup（reticle）：跟随设备旋转（无反旋转）
          gyroGroup.quaternion.copy(this._smoothGyroQuat).multiply(this._touchRot);
          // _placementGroup（模型/视频）：反旋转保持世界空间位置固定
          // 对象在组内位于 origin，组位置固定，旋转不会导致位置摆动
          this._smoothGyroTmp.copy(this._smoothGyroQuat).invert().multiply(this._touchRot);
          if (this._placementGroup) this._placementGroup.quaternion.copy(this._smoothGyroTmp);
        } else {
          // 未放置：reticle 跟随设备旋转
          gyroGroup.quaternion.copy(this._gyroQuat);
        }
      } else if (this._hasPlaced) {
        // 设备不支持陀螺仪（桌面）：仅应用触摸旋转
        gyroGroup.quaternion.copy(this._touchRot);
        if (this._placementGroup) this._placementGroup.quaternion.copy(this._touchRot);
      }

      this._animController?.update(frameDt);
      // 程序化动效在 markerless（WebXR / 8th Wall）路径下也要推进，
      // 否则同一份配置在图片追踪里会动、在无标记放置里却是静止的
      this._motion?.update(frameDt);
      renderer.render(scene, camera);
    });

    this._initTouchDrag();
    this._onModelStatus?.('loaded');
    this.started = true;
    console.log('[AREngine] markerless AR 已启动，等待点击放置');
  }
  /**
   * MindAR image 路径的尺度补偿：返回目标图宽在 anchor 空间里的单位数。
   * anchor 空间约定：目标图宽 = .mind 里存的像素宽（postMatrix 的 scale.x）。
   * 任何异常都回落 1（不补偿）。
   */
  private _mindarImageScaleBoost(): number {
    try {
      const idx = this._activeImageIndex ?? 0;
      const pm = (this.mindAR as any)?.postMatrixs?.[idx];
      const w = pm ? pm.elements[0] : 0;
      return Number.isFinite(w) && w > 1 ? w : 1;
    } catch {
      return 1;
    }
  }

  /**
   * 按 object-fit: cover 的可见区域重建相机投影。
   *
   * 为什么必须做：
   *   video 元素被 CSS 设成 object-fit:cover，画面按比例放大到铺满容器后再裁切。
   *   竖屏手机（容器 390x844，相机 4:3=640x480）实测：视频被放大 2.885 倍，
   *   左右各裁掉 367.7px（约容器宽的 94%）。而渲染层若仍用 containerW/containerH
   *   当 aspect，就等于假设"整帧 4:3 都可见"——投影与实际显示区域完全错位，
   *   模型会被画到被裁掉的那部分里。
   *
   *   桌面窗口接近 4:3 时裁切量极小 → 看不出问题；手机竖屏裁切巨大 → 模型直接出屏。
   *   这正是"桌面正常、手机完全看不到"的根因。
   *
   * 做法：
   *   1. 用 MindAR 原始投影矩阵反解"整帧"的垂直 FOV（相机内参，不受 CSS 影响）
   *   2. 按 cover 规则算出视频显示尺寸（dw,dh）
   *   3. 垂直方向可见比例 = containerH / dh；FOV 按该比例收窄
   *      （缩放后的画面看到的垂直范围变小 → FOV 变小）
   *   4. aspect 用容器真实比例，这样 NDC 与屏幕像素一一对应
   *
   * 未识别到可用 video 尺寸时回落原来的简单实现，保证不劣化。
   */
  private _applyCoverProjection(): void {
    const camera = this.mindAR?.camera;
    if (!camera) return;

    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w <= 0 || h <= 0) return;

    // 相机内参：整帧的垂直 FOV（只依赖摄像头，与 CSS/容器无关）
    const proj = camera.projectionMatrix.elements;
    const tanHalfFov = 1 / Math.abs(proj[5]);
    const fullFov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalfFov));
    this._verticalFov = fullFov;

    const video = this.mindAR.video;
    const vw = video?.videoWidth || 0;
    const vh = video?.videoHeight || 0;

    let fov = fullFov;
    if (vw > 0 && vh > 0) {
      const videoRatio = vw / vh;
      const containerRatio = w / h;
      // 复刻 MindAR resize() 的 cover 尺寸计算
      let dw: number;
      let dh: number;
      if (videoRatio > containerRatio) {
        dh = h;
        dw = h * videoRatio;
      } else {
        dw = w;
        dh = w / videoRatio;
      }
      // 垂直可见比例：容器高 / 视频显示高（<=1）。>1 时说明上下有留白，不放大 FOV
      const visibleV = Math.min(1, h / dh);
      // 水平可见比例（用于极端情况下的参考；此处 FOV 走垂直通道）
      const visibleH = Math.min(1, w / dw);
      // tan 空间线性缩放，再转回角度；保证小角度与大角度都正确
      fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalfFov * visibleV));
      if (Math.abs(visibleV - 1) > 0.001 || Math.abs(visibleH - 1) > 0.001) {
        console.log(
          `[AREngine] cover 裁切补偿: video ${vw}x${vh} → 显示 ${dw.toFixed(0)}x${dh.toFixed(0)}, ` +
          `可见比例 V=${visibleV.toFixed(3)} H=${visibleH.toFixed(3)}, FOV ${fullFov.toFixed(2)}° → ${fov.toFixed(2)}°`
        );
      }
    }

    camera.fov = fov;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    // ⚠️ setPixelRatio 必须在 setSize 之前：three 的 setSize 用「当前」_pixelRatio
    //    去算 canvas.width/height，顺序反了会以旧比例开一次缓冲。
    //    MindAR 自己的 resize() 不带 pixelRatio 限制，DPR=3 的手机缓冲会大到
    //    3×3=9 倍像素，重模型下这是上下文丢失的主要推手 —— 这里统一压到 2。
    const r = this.mindAR.renderer;
    if (r) {
      const capped = Math.min(window.devicePixelRatio || 1, 2);
      if (Math.abs((r.getPixelRatio?.() ?? 1) - capped) > 0.001) r.setPixelRatio(capped);
      r.setSize(w, h);
    }
    if (this.mindAR.cssRenderer) this.mindAR.cssRenderer.setSize(w, h);
  }

  /**
   * 从 MindAR 的 postMatrix 捕获 anchor 尺度与原点偏移，写入 _capturedScl / _anchorOrigin。
   *
   * 为什么必须做：_updateAnchorPose 每帧覆写 group.matrix（compose(pos, quat, scl)），
   * 等于把 MindAR 的 postMatrix 整个丢掉。postMatrix = compose((w/2, h/2, 0), I, (w,w,w))，
   * 丢掉后尺度从 w(≈291) 塌成 1、原点偏移也丢失 → 模型缩到不可见且位置错乱。
   *
   * 非 image 路径（face / markerless）不调用，_capturedScl 保持 (1,1,1)。
   */
  private _captureAnchorScale(): void {
    if (this.trackingType !== 'image') return;
    try {
      const idx = this._activeImageIndex ?? 0;
      const pm = (this.mindAR as any)?.postMatrixs?.[idx];
      if (!pm) return;
      const w = pm.elements[0];
      const tx = pm.elements[12];
      const ty = pm.elements[13];
      if (!Number.isFinite(w) || w <= 0) return;
      // 归一化因子的作用域严格限定在「anchor 内部」：
      //   group.matrix = compose(anchorPos − O, anchorQuat, S)，S = w。
      // wrapper 是 group 的子节点，因此 wrapper.position 的单位是「锚点像素单位」，
      // 而不是米。所以 _invCapturedScl 只能用于反解 group.matrix，绝不能碰
      // wrapper.position —— 那会造成双重换算（曾经写过的 bug）。
      this._capturedScl.set(w, w, w);
      this._invCapturedScl.set(1 / w, 1 / w, 1 / w);
      this._anchorOrigin.set(
        Number.isFinite(tx) ? tx : 0,
        Number.isFinite(ty) ? ty : 0,
        0
      );
      // 统一换算因子在尺度确定后集中计算一次，避免各调用点各算一遍漂移
      this._unitsPerMeter = w / AREngine._ASSUMED_TARGET_WIDTH_M;
      this._anchorScaleCaptured = true;
      console.log(
        `[AREngine] anchor 尺度已捕获: ${w} (origin ${this._anchorOrigin.x}, ${this._anchorOrigin.y}) ` +
        `→ 1m = ${this._unitsPerMeter.toFixed(1)} anchor 单位`
      );
    } catch (e: any) {
      console.warn('[AREngine] anchor 尺度捕获失败:', e?.message);
    }
  }

  /**
   * 「米 → anchor 像素单位」的统一换算系数。
   *
   * 只在 image 路径下 ≠ 1：
   *   markerless 的 position 落在 _placementGroup（尺度=1）→ 单位本来就是米；
   *   image 的 position 落在 anchor.group 下（父级尺度 = 图宽 291）→ 同一个 0.15
   *   会被放大成 43.6 个 anchor 单位，手机窄屏直接出屏。
   *
   * 约定同 fitMaxDimUnits：假定打印的目标图实际宽 0.3m。
   * 与 _mindarImageScaleBoost() 的区别：那个每次去读 postMatrix（多目标切换后
   * 可能瞬时不一致），这里读 _captureAnchorScale 落下的缓存，单一真源。
   * 未捕获前回落 1:1，不制造新偏差。
   */
  private _metersToAnchorUnits(): number {
    if (this.trackingType !== 'image' || !this._anchorScaleCaptured) return 1;
    return this._unitsPerMeter;
  }

  /**
   * 绑定 WebGL 上下文丢失/恢复监听。
   *
   * 上下文丢失是「识别成功但看不到」最容易被误判的成因：追踪线程、锚点矩阵、
   * DOM 全部正常，只有 GPU 侧的内容没了，所以任何只查矩阵数值的排查都会通过。
   * 丢失后必须 preventDefault，否则浏览器不会触发 restored。
   */
  private _bindContextLossWatcher(renderer: THREE.WebGLRenderer): void {
    try {
      const cv = renderer.domElement;
      if (!cv || (cv as any).__ctxWatchBound) return;
      (cv as any).__ctxWatchBound = true;

      cv.addEventListener('webglcontextlost', (e: Event) => {
        e.preventDefault(); // 不加这句 browser 不会尝试恢复
        this._contextLost = true;
        console.error(
          '[AREngine] WebGL 上下文丢失 —— 模型会消失但追踪仍在运行。' +
          '通常是显存/算力超限（贴图过大、面数过高、DPR 过高）。'
        );
        this._onModelStatus?.('error');
      }, false);

      cv.addEventListener('webglcontextrestored', () => {
        this._contextLost = false;
        console.warn('[AREngine] WebGL 上下文已恢复');
      }, false);
    } catch (e: any) {
      console.warn('[AREngine] 上下文监听绑定失败:', e?.message);
    }
  }

  /** 运行期 WebGL 上下文是否处于丢失状态（诊断面板 / 上层 UI 可直接读） */
  get isContextLost(): boolean {
    if (this._contextLost) return true;
    try {
      return this.mindAR?.renderer?.getContext?.()?.isContextLost?.() ?? false;
    } catch {
      return false;
    }
  }

  /**
   * 按设备能力给模型贴图降规格（仅改内存占用，不改外形）。
   *
   * 为什么必须做：
   *   本场景实测三张贴图均为 2048×2048 RGB，加载进 GPU 后每张约 21.4MB
   *   （RGBA 展开 + mipmap），合计 ≈ 64.3MB；再叠加 78.7 万三角面的顶点/索引缓冲。
   *   桌面显存宽裕完全无感，但手机 GPU 纹理预算小得多，超限时驱动的行为是
   *   **静默丢弃 WebGL 上下文** —— 用户看到的现象正是"识别成功了但什么都没有"。
   *
   * 做法：
   *   - 只在「移动/低内存」设备上降规格，桌面保持原始画质（不做无谓劣化）
   *   - 边长 > maxSize 的贴图，用 canvas 等比缩小后替换 image
   *   - 关闭 mipmap 对超大贴图反而更省（但会牺牲远景画质），这里保守：保留 mipmap
   *   - 任一环节失败都只警告不抛 —— 降级不能变成新的故障点
   *
   * 阈值依据：1024² 贴图 4 张 ≈ 21MB，配合百万级三角面在主流手机上安全。
   */
  private _applyMobileTextureBudget(root: THREE.Object3D): void {
    try {
      // 判定：DPR 高 或 内存少 或 触屏为主 → 视为移动端
      const mem = (navigator as any)?.deviceMemory as number | undefined;
      const isMobile =
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        (typeof mem === 'number' && mem > 0 && mem <= 4) ||
        (window.matchMedia?.('(pointer: coarse)').matches ?? false);
      if (!isMobile) return;

      const memTight = typeof mem === 'number' && mem > 0 && mem <= 4;
      const maxSize = memTight ? 512 : 1024;

      const seen = new Set<THREE.Texture>();
      let shrunk = 0;
      const textures: THREE.Texture[] = [];
      root.traverse((o: any) => {
        const mats: any[] = o.material
          ? (Array.isArray(o.material) ? o.material : [o.material])
          : [];
        for (const m of mats) {
          // 只关心真正参与采样的色彩/法线/粗糙度贴图；emissive 等一并覆盖
          for (const key of [
            'map', 'normalMap', 'roughnessMap', 'metalnessMap',
            'aoMap', 'emissiveMap', 'alphaMap', 'specularMap',
          ] as const) {
            const t = (m as any)[key] as THREE.Texture | undefined;
            if (t && !seen.has(t)) { seen.add(t); textures.push(t); }
          }
        }
      });

      for (const t of textures) {
        const img = t.image as any;
        const w = img?.width | 0;
        const h = img?.height | 0;
        if (w <= maxSize && h <= maxSize) continue;

        // 等比缩放到 maxSize 以内
        const k = maxSize / Math.max(w, h);
        const nw = Math.max(1, Math.round(w * k));
        const nh = Math.max(1, Math.round(h * k));

        const cv = document.createElement('canvas');
        cv.width = nw; cv.height = nh;
        const ctx2d = cv.getContext('2d');
        if (!ctx2d) continue;
        ctx2d.drawImage(img, 0, 0, nw, nh);

        // 保留色彩空间/包裹等采样状态，只换图像源
        t.image = cv;
        t.needsUpdate = true;
        shrunk++;
        console.log(`[AREngine] 贴图降规格 ${w}x${h} → ${nw}x${nh} (${key(t)})`);
      }

      if (shrunk > 0) {
        console.log(
          `[AREngine] 移动端贴图预算已应用: ${shrunk} 张 → 上限 ${maxSize}px ` +
          `(deviceMemory=${mem ?? 'n/a'})`
        );
      }
    } catch (e: any) {
      // 降级失败不影响主流程，只是没省到显存
      console.warn('[AREngine] 贴图降规格跳过:', e?.message);
    }

    function key(t: THREE.Texture): string {
      return (t as any).name || ((t as any).uuid?.slice(0, 8) ?? 'tex');
    }
  }

  /**
   * 移动端摄像头流降规格到 640×480。
   *
   * 为什么走 applyConstraints 而不是构造参数：
   *   mind-ar 1.2.5 的 getUserMedia 只传 `video: {}`，且构造参数里
   *   **没有** resolution / setResolution / targetFPS（那些是社区 fork 新增的）。
   *   写进去会被静默忽略 —— 那才是真正的"改了个寂寞"。
   *   官方路径只有一条：拿到 MediaStream 后自行 applyConstraints。
   *
   * 失败不抛：部分设备/浏览器不支持中途改约束，此时保持原流即可，
   * 不能因为"优化没生效"把 AR 整个搞挂。
   */
  private async _capCameraStreamForMobile(): Promise<void> {
    try {
      const mem = (navigator as any)?.deviceMemory as number | undefined;
      const isMobile =
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        (typeof mem === 'number' && mem > 0 && mem <= 4) ||
        (window.matchMedia?.('(pointer: coarse)').matches ?? false);
      if (!isMobile) return;

      const video = this.mindAR?.video as HTMLVideoElement | undefined;
      const stream = video?.srcObject as MediaStream | null | undefined;
      const track = stream?.getVideoTracks?.()[0];
      if (!track?.applyConstraints) return;

      const before = track.getSettings?.() ?? {};
      await track.applyConstraints({
        width: { ideal: 640 },
        height: { ideal: 480 },
      });
      const after = track.getSettings?.() ?? {};
      console.log(
        `[AREngine] 移动端摄像头降规格: ${before.width}x${before.height} → ${after.width}x${after.height}`
      );
    } catch (e: any) {
      console.warn('[AREngine] 摄像头降规格跳过（保持原流）:', e?.message);
    }
  }

  private loadModel(url: string, anchor: any, onProgress?: (pct: number) => void, fitMaxDimUnits?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();

      // 配置 DRACOLoader 支持 Draco 压缩模型
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath("/draco/");
      loader.setDRACOLoader(dracoLoader);

      loader.load(
        url,
        (gltf: any) => {
          // 计算包围盒，将模型几何中心对齐到原点
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          gltf.scene.position.copy(center).negate();

          // 在模型外包装一层 group：内层居中，外层控制位置和缩放
          const wrapper = new THREE.Group();
          // markerless 路径：_placementGroup 已携带偏移量，wrapper 在组内必须 (0,0,0)
          if (anchor.group !== this._placementGroup) {
            const pos = this.config.position;
            /*
             * ⚠️ 单位换算（"平面能跑、image 跑不了"的根本差异）：
             *   markerless：position 落在 _placementGroup（尺度=1）→ 单位就是米，0.15 = 0.15m。
             *   image     ：position 落在 anchor.group 下（尺度=图宽 291）→ 同一个 0.15
             *               会被放大成 43.6 个 anchor 单位（≈ 图片高的 15%），手机窄屏直接出屏。
             * 因此 image 路径必须把米换算成 anchor 单位：米 × (图宽像素 / 假定图宽 0.3m)。
             * 系数由 _captureAnchorScale 统一算出（_metersToAnchorUnits），
             * 与 fitMaxDimUnits 同源（都假定打印图实际宽 0.3m）。
             * 未捕获到尺度时回落 1:1，不制造新的偏差。
             */
            const toUnits = this._metersToAnchorUnits();
            wrapper.position.set(pos[0] * toUnits, pos[1] * toUnits, pos[2] * toUnits);
          }
          // image 路径：fitMaxDimUnits = 模型最长边的目标单位数（与 ArPreview3D 预览一致），
          // 按模型原始最长边归一化 —— 预览里多大，AR 里相对图片就多大
          const rawMaxDim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
          if (fitMaxDimUnits && rawMaxDim > 0) {
            wrapper.scale.setScalar(fitMaxDimUnits / rawMaxDim);
          } else {
            wrapper.scale.setScalar(this.config.scale);
          }

          /*
           * 动效层：自转 / 悬浮 / 脉冲 / 进场都作用在它上面。
           * 必须与 wrapper 分成两层 —— 同一层会互相覆盖：
           *   wrapper.position    ← positionOffset
           *   wrapper.scale       ← scale
           *   wrapper.quaternion  ← TouchRotator 的拖拽旋转
           */
          const motionLayer = new THREE.Group();
          motionLayer.name = '__MotionLayer__';
          motionLayer.add(gltf.scene);
          wrapper.add(motionLayer);
          this._motion = new MotionController(motionLayer, this.config.animation?.motion);

          // 放入锚点
          anchor.group.add(wrapper);
          // 多区域模式：保存到对应 zoneInfo
          const matchZone = this._anchors.find(a => a.anchor === anchor);
          if (matchZone) {
            matchZone.modelWrapper = wrapper;
          } else {
            this._modelWrapper = wrapper;
          }

          // ── 移动端 GPU 保护 ──
          // 实测本场景三张贴图各 2048×2048（RGBA+mipmap ≈ 21.4MB/张，合计 64.3MB）
          // 叠加 78.7 万三角面。桌面上无感，但手机 GPU 的纹理预算紧张，
          // 超限时表现为「识别成功但画面全黑 / 模型消失」——上下文被驱动悄悄丢掉。
          // 降规格不改变外观可见度，却能把纹理占用砍到 1/4。
          this._applyMobileTextureBudget(gltf.scene);

          // 检测并初始化动画
          const animations = gltf.animations;
          if (animations && animations.length > 0) {
            const controller = new AnimationController(gltf.scene, animations);
            this._animController = controller;

            // 根据配置播放默认动画
            const animCfg = this.config.animation;
            if (animCfg?.enabled) {
              if (animCfg.defaultClip && controller.clipNames.includes(animCfg.defaultClip)) {
                controller.play(animCfg.defaultClip, 0);
              } else {
                controller.playDefault();
              }
            }
            console.log(`[AREngine] 模型动画已初始化: ${animations.length} 个 clip(s) — ${controller.clipNames.join(', ')}`);
          } else {
            console.log('[AREngine] 模型无动画，跳过 AnimationController');
          }

          resolve();
        },
        (xhr: any) => {
          if (onProgress && xhr.total > 0) {
            onProgress(xhr.loaded / xhr.total);
          }
        },
        (err: any) => {
          const detail = err?.statusText || err?.message || "未知错误";
          console.error("模型加载失败:", err);
          reject(new Error(`模型加载失败: ${detail}`));
        }
      );
    });
  }

  /**
   * 初始化方向传感器（回退链模式）
   *
   * 通过 OrientationManager 依次尝试：
   *   1. WebXR (inline+local) — ARCore 驱动，零漂移（Chrome Android）
   *   2. MadgwickFilter — AHRS 传感器融合（Chrome Android Generic Sensor）
   *   3. AbsoluteOrientationSensor — 带磁力计，偏航不漂移
   *   4. RelativeOrientationSensor — 无磁力计回退
   *   5. DeviceOrientationEvent — 全平台回退（含 iOS 增强互补滤波）
   *
   * 写入 same _gyroQuat / _placementGyro 字段，保持渲染循环逻辑不变。
   */
  private async _initGyroscope(): Promise<void> {
    const mgr = new OrientationManager({
      madgwickBeta: this.config.madgwickBeta,
    });
    this._orientationManager = mgr;

    // 启动回退链
    const started = await mgr.start();
    if (!started) {
      console.warn('[AR] 所有方向传感器均不可用');
      return;
    }

    // 注册回调：传感器数据 → 引擎字段（兼容现有渲染循环）
    mgr.onReading((quat: THREE.Quaternion, timestamp: number) => {
      // 检测陀螺仪数据断流，仅在屏幕确实关闭时做 slerp 恢复
      if (this._hasPlaced && this._gyroLastTime > 0 && timestamp - this._gyroLastTime > 1500) {
        if (this._screenOffRecovery) {
          this._placementGyro.slerp(this._gyroQuat, 0.3);
          this._screenOffRecovery = false;
        }
        this._smoothGyroReady = false;
      }
      this._gyroLastTime = timestamp;
      this._gyroQuat.copy(quat);
      this._gyroAvailable = true;

      // 静止漂移校正：手机静止时 deltaQ 应 ≈ identity
      // 阈值 0.02（~1.15°）适配现实传感器噪声水平（互补滤波后约 0.1-1°）
      // 连续 120 帧静止才触发校正。
      // 当 CameraMotionDetector 也确认静止时，使用 10x 快速校正速率，
      // 以更快消除 beta≈90°（万向锁）期间累积的偏航漂移。
      const angleDelta = this._prevGyroDriftQuat.angleTo(this._gyroQuat);
      this._prevGyroDriftQuat.copy(this._gyroQuat);
      // 图片追踪模式（_trackingFound）或 markerless（_hasPlaced）都启用漂移校正
      if ((this._hasPlaced || this._trackingFound) && angleDelta < 0.02) {
        this._stationaryCount++;
        const driftThreshold = this._hasPlaced ? 120 : 60; // 图片追踪更积极校正
        if (this._stationaryCount > driftThreshold) {
          const motionStill = this._orientationManager?.isStationary ?? true;
          if (motionStill) {
            // 摄像头确认静止 → 快速校正（消除 gimbal lock 累积漂移）
            this._placementGyro.slerp(this._gyroQuat, AREngine._FAST_CORR_RATE);
          } else {
            this._placementGyro.slerp(this._gyroQuat, AREngine._DRIFT_CORR_RATE);
          }
        }
      } else if (this._hasPlaced || this._trackingFound) {
        this._stationaryCount = 0;
      }

      if (this._pendingGyroCapture) {
        this._placementGyro.copy(this._gyroQuat);
        this._pendingGyroCapture = false;
        this._smoothGyroReady = false;
      }
    });

    console.log(`[AR] 方向传感器已初始化，激活: ${mgr.activeProviderName}`);

    // 启动相机运动检测（如果摄像头已激活）
    if (this._arVideo) {
      mgr.enableMotionDetection(this._arVideo);
    }
  }

  /**
   * 初始化触摸拖动（360° 旋转）
   *
   * 用户在屏幕滑动时控制模型 360° 自由旋转，
   * 水平滑动绕 Y 轴旋转，垂直滑动绕 X 轴旋转。
   */
  private _initTouchDrag(): void {
    const el = this.container;

    const onStart = (clientX: number, clientY: number) => {
      this._touchDrag = true;
      this._touchNDC.set(
        (clientX / el.clientWidth) * 2 - 1,
        -(clientY / el.clientHeight) * 2 + 1
      );
    };

    const onMove = (clientX: number, clientY: number) => {
      if (!this._touchDrag) return;
      const ndcX = (clientX / el.clientWidth) * 2 - 1;
      const ndcY = -(clientY / el.clientHeight) * 2 + 1;
      const dx = ndcX - this._touchNDC.x;
      const dy = ndcY - this._touchNDC.y;
      this._touchNDC.set(ndcX, ndcY);

      if (Math.abs(dx) < 0.0005 && Math.abs(dy) < 0.0005) return;

      // NDC delta → 旋转四元数（复用预分配对象，避免 GC）
      const rotSpeed = Math.PI; // 满屏宽度 = 180° 旋转
      this._touchEuler.set(-dy * rotSpeed, -dx * rotSpeed, 0);
      this._touchDeltaQ.setFromEuler(this._touchEuler);
      this._touchRot.multiply(this._touchDeltaQ);
    };

    const onEnd = () => { this._touchDrag = false; };

    el.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    // 桌面端鼠标支持
    el.addEventListener("mousedown", (e) => onStart(e.clientX, e.clientY));
    el.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
    el.addEventListener("mouseup", onEnd);
  }

  /**
   * 更新锚点位姿（冻结模式优先，否则平滑追踪）
   *
   * MindAR 设了 matrixAutoUpdate=false，group.matrix 由追踪系统直接赋值，
   * 而 group.position / group.quaternion 不会被同步（始终为 0/0/0）。
   * 必须通过 matrix.decompose() 读取真实追踪位姿。
   *
   * 冻结模式：首次检测到目标后锁定位姿，彻底消除转动变形。
   * 丢失保持：追踪丢失后不清除冻结，模型保持在最后位置。
   * 陀螺仪辅助：冻结期间用设备陀螺仪继续响应旋转，避免模型"卡死"。
   * 触摸旋转：用户滑动屏幕控制模型 360° 自由旋转。
   * 平滑模式：Quaternion.slerp + Vector3.lerp 指数平滑过滤追踪噪声。
   */
  /**
   * 更新锚点位姿 — 陀螺仪感知自适应平滑跟踪（主路径）
   *
   * 核心策略：
   *   1. MindAR OneEuroFilter（第一层）：filterMinCF=0.005, filterBeta=30 适度平滑
   *   2. 多帧平均初始化（第二层）：前 2 帧平均，快速锁定初始位姿
   *   3. 陀螺仪感知死区（第三层）：手机静止时死区滤除微噪声，手机运动时跳过死区
   *   4. 自适应指数平滑（第四层）：静止 0.03~运动 0.3，兼顾稳与快
   *
   * 关键改进：利用 OrientationManager 已有的陀螺仪数据计算帧间角速度，
   * 动态调整死区阈值和平滑因子，解决"漂移+抖动+慢修正"的矛盾。
   *
   * 效果：AR 内容紧贴目标图片移动，不抖动，不漂移，不"粘屏"。
   * 参考：MindAR Issue #146 (smoothing), #556 (unstable tracking),
   *       OneEuroFilter 论文 + 官方 tracking-config 文档。
   *
   * （3DAR 期1 新增）下方第一个方法是多目标激活切换；_updateAnchorPose 保持原逻辑，
   * 仅在开头加了切换混合。
   */
  private _selectActiveImageAnchor(nextIndex: number): void {
    if (!this._imageAnchors.length) return;
    const prevIndex = this._activeImageIndex;
    const next = this._imageAnchors.find(r => r.index === nextIndex);
    if (!next || next.anchor === this.anchor) return;
    const wrapper = this._modelWrapper;
    this._activeImageIndex = nextIndex;
    this.anchor = next.anchor;
    // 不同 target 的 markerWidth 可能不同 → 尺度/原点必须跟着切换
    this._captureAnchorScale();
    console.log(`[AREngine] 多目标切换：target#${prevIndex} -> target#${nextIndex}`);
    this.config.onActiveTargetChange?.(nextIndex);
    this._switchBlend = null;
    if (!wrapper) return;
    // 记录切换前的世界位姿
    wrapper.updateWorldMatrix(true, false);
    const oldWorld = new THREE.Matrix4().copy(wrapper.matrixWorld);
    // 重挂到新 anchor（three 会自动从旧 parent 摘除）
    next.anchor.group.add(wrapper);
    next.anchor.group.updateWorldMatrix(true, false);
    const local = new THREE.Matrix4()
      .copy(next.anchor.group.matrixWorld)
      .invert()
      .multiply(oldWorld);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    local.decompose(p, q, s);
    wrapper.position.copy(p);
    wrapper.quaternion.copy(q);
    // 稳态局部变换 = config.position 换算到本 anchor 单位后的值
    // （不同 target 的图宽不同 → 同一"米"在新 anchor 里对应的单位数也不同，
    //  _captureAnchorScale 已在本方法开头更新 _unitsPerMeter，这里必须重算）
    const pos = this.config.position ?? [0, 0, 0];
    const u = this._metersToAnchorUnits();
    this._switchBlend = {
      startedAt: performance.now(),
      duration: 300,
      fromPos: p.clone(),
      fromQuat: q.clone(),
      toPos: new THREE.Vector3(pos[0] * u, pos[1] * u, pos[2] * u),
      toQuat: new THREE.Quaternion(),
    };
  }

  private _updateAnchorPose(): void {
    if (!this.anchor) return;

    // M13：每帧更新空间音频听者（相机位置 + 朝向）
    this.updateAudioListener();

    // 3DAR 期1：多目标切换混合（把重挂时的"连续局部变换"在 300ms 内收敛回稳态）
    if (this._switchBlend && this._modelWrapper) {
      const b = this._switchBlend;
      const k = Math.min(1, (performance.now() - b.startedAt) / b.duration);
      const e = 1 - Math.pow(1 - k, 3);
      this._modelWrapper.position.lerpVectors(b.fromPos, b.toPos, e);
      this._modelWrapper.quaternion.slerpQuaternions(b.fromQuat, b.toQuat, e);
      if (k >= 1) this._switchBlend = null;
    }
    const group = this.anchor.group;

    // 分解追踪矩阵获取实时位姿
    group.matrix.decompose(this._trackPos, this._trackQuat, this._trackScl);

    /*
     * ⚠️ 反归一化：group.matrix 是本引擎上一帧自己写入的（含 _capturedScl 缩放与
     * -_anchorOrigin 偏移）。若直接拿它当输入，每帧都会再乘一次 291，形成正反馈——
     * 实测 anchorWorld 从 -8.6e4 涨到 -2.0e13（约每 5 秒立方级爆炸）。
     * 这里先把位置还原回 MindAR 原生（归一化）空间，后续所有平滑状态、死区阈值、
     * 置信度计算都在该空间进行，最后写出时再统一乘以 _capturedScl。
     */
    if (this.trackingType === 'image' && this._anchorScaleCaptured) {
      // 写出式为 w = n·S − O，其严格逆变换即 n = (w + O) / S
      this._trackPos.add(this._anchorOrigin).multiply(this._invCapturedScl);
    }

    /*
     * ⚠️ 追踪有效性必须用 MindAR 的 `anchor.visible`，**不能**用"位置是否为零"。
     *
     * 曾经的判据是 `_trackPos.lengthSq() > 0.00001`，但那是**错的**：
     * `_trackPos` 由 `group.matrix` decompose 而来，而 `group.matrix` 恰恰是
     * 本引擎上一帧自己写进去的。即便 MindAR 这一帧完全没给位姿（目标丢失），
     * 矩阵里仍是引擎的旧值 → 位置永远非零 → `validTrack` 恒为 true。
     * 结果：引擎**永远察觉不到丢失**，一直拿旧位姿当"实时位姿"平滑，
     * 目标重新出现时又走一次"重捕获重置"，视觉上就是
     * 「模型不断刷新、向目标靠近一点又弹回原点」的循环。
     *
     * MindAR 内部（image-target/three.js:165）已经维护了准确标志：
     *   group.visible = (worldMatrix !== null)        // 这一帧有没有解出位姿
     * 并且丢失时它写入的是 `invisibleMatrix`（前三列为零），只是被本引擎的
     * 覆写逻辑盖掉了 —— 所以必须读 `anchor.visible`，而不是猜矩阵内容。
     */
    const mindarHasPose = (this.anchor as any)?.visible !== false;
    const validTrack = mindarHasPose && this._trackingFound;

    // ── 可选冻结模式（默认关闭，极少使用） ──
    if (this._freezeOnDetect) {
      if (this._frozen) {
        this._finalPos.copy(this._frozenPos).add(this._touchOffset).multiply(this._capturedScl).sub(this._anchorOrigin);
        this._tempMatrix.identity().compose(this._finalPos, this._frozenQuat, this._capturedScl);
        group.matrix.copy(this._tempMatrix);
        group.matrixWorldNeedsUpdate = true;
        if (this._modelWrapper) this._modelWrapper.quaternion.copy(this._touchRot);
        for (const zi of this._anchors) {
          if (zi.anchor === this.anchor) continue;
          if (zi.modelWrapper) zi.modelWrapper.quaternion.copy(this._touchRot);
        }
        return;
      }
      if (!validTrack) return;
      if (!this._smoothReady) {
        this._captureFrames.push({
          pos: this._trackPos.clone(),
          quat: this._trackQuat.clone(),
          scl: this._trackScl.clone(),
        });
        if (this._captureFrames.length >= this._captureTargetFrames) {
          const avgPos = new THREE.Vector3();
          const avgQuat = new THREE.Quaternion();
          const avgScl = new THREE.Vector3();
          for (const f of this._captureFrames) {
            avgPos.add(f.pos); avgScl.add(f.scl);
          }
          avgPos.divideScalar(this._captureTargetFrames);
          avgScl.divideScalar(this._captureTargetFrames);
          avgQuat.copy(this._captureFrames[0].quat);
          this._smoothPos.copy(avgPos);
          this._smoothQuat.copy(avgQuat);
          this._capturedScl.copy(avgScl);
          this._smoothReady = true;
          this._captureFrames = [];
        }
        return;
      }
      // smoothReady → 冻结
      this._frozenPos.copy(this._smoothPos);
      this._frozenQuat.copy(this._smoothQuat);
      this._frozenScl.copy(this._capturedScl);
      this._frozen = true;
      console.log("[AR] 锚点已冻结");
      return;
    }

    // ═══════════════════════════════════════════════════════
    // 主路径：三状态陀螺仪门控平滑
    //
    // 用陀螺仪角速度作为独立信号判断手机运动状态，
    // 完全与 MindAR 追踪置信度解耦。
    //
    // 静止 → 位置锁定（零漂移/抖动）
    // 慢移 → 轻柔阻尼跟随
    // 快移 → 低延迟快速跟随
    // 无陀螺仪 → 简单 lerp/slerp + 死区回退
    // ═══════════════════════════════════════════════════════

    // -- 计算陀螺仪帧间角速度 --
    this._gyroDelta = this._gyroAvailable && this._prevGyroQuat
      ? this._prevGyroQuat.angleTo(this._gyroQuat)
      : 0;
    this._prevGyroQuat.copy(this._gyroQuat);

    // 防传感器卡死：角速度为 0 时沿用上次非零值
    if (this._gyroDelta > 1e-8) {
      this._lastNonZeroGyroDelta = this._gyroDelta;
    } else {
      this._gyroDelta = this._lastNonZeroGyroDelta;
    }

    // 自适应阈值 — 陀螺仪角速度运行 EMA 统计（Welford online variance）
    const gDiff = this._gyroDelta - this._gyroRunningMean;
    this._gyroRunningMean += AREngine._GYRO_EMA_ALPHA * gDiff;
    this._gyroRunningStd = Math.sqrt(
      (1 - AREngine._GYRO_EMA_ALPHA) * (this._gyroRunningStd * this._gyroRunningStd + AREngine._GYRO_EMA_ALPHA * gDiff * gDiff)
    );
    this._gyroRunningStd = Math.max(this._gyroRunningStd, 0.0001); // clamp 防退化

    // -- 丢失追踪处理 --
    // ⚠️ `group.matrix` 是**我们自己**每帧写回去的，所以仅凭 group.matrix 反解出的
    //    `_trackPos` 判断"追踪是否有效"是自反馈：值永远非零 → 永远 validTrack=true
    //    → 引擎永远察觉不到丢失，丢失期间仍拿旧位姿继续平滑，视觉上就是
    //    "模型一直在但位置不停刷新回弹"。
    //    真正的判据是 MindAR 写入的 `anchor.visible`（three.js:165-177：
    //    `group.visible = worldMatrix !== null`，丢失时 worldMatrix 为 null）。
    //    现改为 `validTrack = mindarHasPose && this._trackingFound`（见上方计算）。
    if (!validTrack) {
      this._lostFrameCount++;
      if (this._lostFrameCount <= this._maxLostFrames) {
        // 保持最后已知位置
        this._tempMatrix.identity().compose(this._smoothPos, this._smoothQuat, this._capturedScl);
        group.matrix.copy(this._tempMatrix);
        group.matrixWorldNeedsUpdate = true;
      }
      // 更新 modelWrapper 和 anchors
      if (this._modelWrapper) this._modelWrapper.quaternion.copy(this._touchRot);
      for (const zi of this._anchors) {
        if (zi.anchor === this.anchor) continue;
        if (zi.modelWrapper) zi.modelWrapper.quaternion.copy(this._touchRot);
      }
      return;
    }
    this._lostFrameCount = 0;

    // -- 初始化（首次追踪到 或 重新捕获） --
    if (!this._smoothReady) {
      this._lockedPos.copy(this._trackPos);
      this._lockedQuat.copy(this._trackQuat);
      // ⚠️ 逆深度状态必须一并重置：否则用的是**上一段追踪**的 _invDepth 当起点，
      //    SLOW/FAST 分支里 `_smoothPos.z = 1 / _invDepth` 会先把 z 跳到旧值附近，
      //    再慢慢爬向新的 trackPos.z —— 正是用户描述的"靠近一点又弹回去"。
      this._invDepth = 1 / this._depthMagnitude(this._trackPos.z);
      this._rawInvDepth = this._invDepth;
      this._smoothReady = true;
      this._hasEverTracked = true;
      this._stationaryFrameCount = 0;
      this._justExitedStationary = false;
      this._motionState = 'INIT';

      if (this._isReacquisition) {
        // ═══ 重新捕获：Cross-fade 过渡 ═══
        // 从丢失前的最后位置 → 平滑过渡到新追踪位姿
        // 不在第一帧 snap，而是让平滑器自然收敛 + blend 辅助过渡
        this._blendFromPos.copy(this._smoothPos);
        this._blendFromQuat.copy(this._smoothQuat);
        this._blendActive = true;
        this._blendFrames = 0;
        this._isReacquisition = false;

        // 首帧仍然使用旧位姿（smoothPos 不更新），
        // 从下一帧起平滑器会逐渐收敛到新 trackPos
        this._tempMatrix.identity().compose(this._smoothPos, this._smoothQuat, this._capturedScl);
      } else {
        // ═══ 首次追踪：直接赋值 ═══
        this._smoothPos.copy(this._trackPos);
        this._smoothQuat.copy(this._trackQuat);
        this._tempMatrix.identity().compose(this._smoothPos, this._smoothQuat, this._capturedScl);
      }

      group.matrix.copy(this._tempMatrix);
      group.matrixWorldNeedsUpdate = true;
      if (this._modelWrapper) this._modelWrapper.quaternion.copy(this._touchRot);
      for (const zi of this._anchors) {
        if (zi.anchor === this.anchor) continue;
        if (zi.modelWrapper) zi.modelWrapper.quaternion.copy(this._touchRot);
      }
      return;
    }

    // -- 计算帧 dt --
    const now = performance.now();
    const dt = this._lastUpdateTime ? Math.min((now - this._lastUpdateTime) / 1000, 0.1) : 0.016;
    this._lastUpdateTime = now;

    // -- 启发式置信度估计 --
    // 帧间位置跳变越小→置信度越高；与陀螺仪预期一致→置信度越高
    const posDelta = this._trackPos.distanceTo(this._prevConfTrackPos);
    this._prevConfTrackPos.copy(this._trackPos);
    // dt 归一化：固定参考 60fps，使置信度在不同帧率下一致
    const gyroExpectedDelta = Math.max(this._gyroDelta * 0.000833 / Math.max(dt, 0.001), 0.0001);
    const consistency = 1 - Math.min(posDelta / gyroExpectedDelta, 1);
    this._poseConfidence = this._poseConfidence * 0.7 + consistency * 0.3;

    // -- 弹跳度估计 — 追踪位姿方向翻转频率 --
    // PnP 不稳定时位姿会在目标值附近来回振荡（方向频繁翻转），
    // 此时即使 posDelta 很小，追踪实际上也不可信。
    const sx = Math.sign(this._trackPos.x - this._prevConfTrackPos.x);
    const sy = Math.sign(this._trackPos.y - this._prevConfTrackPos.y);
    const sz = Math.sign(this._trackPos.z - this._prevConfTrackPos.z);
    let flipCount = 0;
    if (sx !== 0 && sx !== this._prevPosSignX) flipCount++;
    if (sy !== 0 && sy !== this._prevPosSignY) flipCount++;
    if (sz !== 0 && sz !== this._prevPosSignZ) flipCount++;
    this._prevPosSignX = sx;
    this._prevPosSignY = sy;
    this._prevPosSignZ = sz;
    this._bounciness += AREngine._BOUNCE_ALPHA * (flipCount / 3 - this._bounciness);
    // 有效置信度 = 原始置信度 * 弹跳度折损（bounciness=0 时无折损, =1 时扣 50%）
    const effectiveConfidence = this._poseConfidence * (1 - this._bounciness * 0.5);

    // -- 三状态决策 --
    let newState: string;
    const statThresh = Math.max(this._gyroRunningMean + this._gyroRunningStd * AREngine._GYRO_STATIONARY_MULT, 0.0003);
    const fastThresh = Math.max(this._gyroRunningMean + this._gyroRunningStd * AREngine._GYRO_FAST_MULT, 0.003);
    if (!this._gyroAvailable) {
      newState = 'FALLBACK';
      this._stationaryFrameCount = 0;
      this._justExitedStationary = false;
    } else if (this._gyroDelta < statThresh && this.trackingType !== 'face') {
      this._stationaryFrameCount++;
      if (this._stationaryFrameCount >= AREngine._STATIONARY_LOCK_FRAMES) {
        newState = 'STATIONARY';
      } else {
        newState = 'SLOW_MOVE';
      }
    } else if (this._gyroDelta < fastThresh) {
      this._stationaryFrameCount = 0;
      newState = 'SLOW_MOVE';
    } else {
      this._stationaryFrameCount = 0;
      newState = 'FAST_MOVE';
    }

    // -- 状态切换处理 --
    if (newState === 'STATIONARY') {
      /**
       * ⚠️ 锁定值必须"收敛"而不是"取快照"。
       *
       * 原实现只在刚进入 STATIONARY 的那一帧 `_lockedPos.copy(_smoothPos)`，
       * 之后再不更新。而这一刻恰恰是追踪最不稳的时候（刚识别、PnP 首帧抖动大、
       * 手机还在举起来的过程中），于是整个静止期都被钉在那一帧的误差上 ——
       * 真机表现为"模型闪一下就固定在一个不对的位置/干脆移出画面"。
       *
       * 改为在 STATIONARY 期间持续用 EMA 收敛到 `_trackPos`：
       * 帧数越多越接近真实位姿，既保留"静止不抖"的收益，又不会锁死错误值。
       */
      if (this._motionState !== 'STATIONARY') {
        // 刚进入：用当前平滑值作为起点，避免跳变
        this._lockedPos.copy(this._smoothPos);
        this._lockedQuat.copy(this._smoothQuat);
      } else {
        // 静止中：低频收敛（系数小，肉眼仍看不出抖动）
        const k = AREngine._STATIONARY_CONVERGE;
        this._lockedPos.lerp(this._trackPos, k);
        this._lockedQuat.slerp(this._trackQuat, k);
      }
    }
    if (this._motionState === 'STATIONARY' && newState !== 'STATIONARY') {
      this._justExitedStationary = true;
    }
    // ⚠️ _lockedPos 必须与 _smoothPos 解耦。
    //    原实现里 STATIONARY 分支是 `_smoothPos.copy(_lockedPos)`，而 _lockedPos
    //    只在"进入静止的那一帧"取过一次快照（之后永不更新）→ 整段静止期被钉死
    //    在首帧误差上。改为持续 EMA 收敛后，两者是独立状态，这里不再互相覆盖。
    this._motionState = newState as any;

    // -- 应用平滑 --
    switch (this._motionState) {
      case 'STATIONARY': {
        // 位置锁定，旋转微调
        this._smoothPos.copy(this._lockedPos);
        this._smoothQuat.slerp(this._trackQuat, 0.02);
        break;
      }
      case 'SLOW_MOVE': {
        const lambda = this._justExitedStationary ? AREngine._CATCHUP_LAMBDA : AREngine._DAMPING_SLOW;
        this._justExitedStationary = false;
        const damp = 1 - Math.exp(-lambda * Math.max(dt, 0.001));
        // X/Y 轴用正常阻尼
        this._smoothPos.x += (this._trackPos.x - this._smoothPos.x) * damp;
        this._smoothPos.y += (this._trackPos.y - this._smoothPos.y) * damp;
        // Z 轴逆深度 + 置信度自适应阻尼 + 距离感知
        // ⚠️ 必须作用在**深度幅度** |z| 上、写出时再补回符号：
        //    image 追踪的 z 是负数（目标在相机前方），直接 Math.max(z, 0.1)
        //    会把 −1.509 抬到 +0.1 → invDepth 恒为 10 → 模型跳到相机后方。
        //    详见 _depthMagnitude。
        const depthSlow = this._depthMagnitude(this._trackPos.z);
        const distSlow = Math.min(0.5 / depthSlow, 1.0);
        const zSlowFactor = AREngine._DAMPING_Z_SLOW * (0.5 + effectiveConfidence * 0.5) * distSlow;
        this._rawInvDepth = 1 / depthSlow;
        this._invDepth += (this._rawInvDepth - this._invDepth) * damp * zSlowFactor;
        this._smoothPos.z = (1 / this._invDepth) * this._depthSign(this._trackPos.z);
        this._smoothQuat.slerp(this._trackQuat, damp);
        break;
      }
      case 'FAST_MOVE': {
        const lambda = this._justExitedStationary ? AREngine._CATCHUP_LAMBDA : AREngine._DAMPING_FAST;
        this._justExitedStationary = false;
        const damp = 1 - Math.exp(-lambda * Math.max(dt, 0.001));
        // X/Y 用原阻尼
        this._smoothPos.x += (this._trackPos.x - this._smoothPos.x) * damp;
        this._smoothPos.y += (this._trackPos.y - this._smoothPos.y) * damp;
        // Z 逆深度 + 置信度自适应阻尼 + 距离感知（同 SLOW_MOVE，见其注释）
        const depthFast = this._depthMagnitude(this._trackPos.z);
        const distFast = Math.min(0.5 / depthFast, 1.0);
        const zFastFactor = AREngine._DAMPING_Z_FAST * (0.5 + effectiveConfidence * 0.5) * distFast;
        this._rawInvDepth = 1 / depthFast;
        this._invDepth += (this._rawInvDepth - this._invDepth) * damp * zFastFactor;
        this._smoothPos.z = (1 / this._invDepth) * this._depthSign(this._trackPos.z);
        this._smoothQuat.slerp(this._trackQuat, damp);
        break;
      }
      case 'FALLBACK': {
        this._justExitedStationary = false;
        const posDist = this._trackPos.distanceTo(this._smoothPos);
        const rotAngle = this._smoothQuat.angleTo(this._trackQuat);
        // X/Y 全局死区
        if (posDist > AREngine._DEADZONE_POS) {
          this._smoothPos.x += (this._trackPos.x - this._smoothPos.x) * 0.15;
          this._smoothPos.y += (this._trackPos.y - this._smoothPos.y) * 0.15;
        }
        // Z 独立死区（更保守）
        const zDist = Math.abs(this._trackPos.z - this._smoothPos.z);
        if (zDist > AREngine._DEADZONE_Z) {
          this._smoothPos.z += (this._trackPos.z - this._smoothPos.z) * 0.10;
        }
        if (rotAngle > AREngine._DEADZONE_ROT) this._smoothQuat.slerp(this._trackQuat, 0.15);
        break;
      }
    }

    // -- Cross-fade 重新捕获过渡 --
    // 重检后 N 帧内，从丢失前最后位姿平滑插值到新位姿（ease-in quadratic）
    if (this._blendActive) {
      const blendT = Math.min(this._blendFrames / AREngine._BLEND_TOTAL_FRAMES, 1);
      const easeT = blendT * blendT;
      this._smoothPos.lerpVectors(this._blendFromPos, this._smoothPos, easeT);
      this._smoothQuat.slerpQuaternions(this._blendFromQuat, this._smoothQuat, easeT);
      this._blendFrames++;
      if (blendT >= 1) {
        this._blendActive = false;
      }
    }

    // -- 写入矩阵 --
    // ⚠️ 必须含 _anchorOrigin：MindAR 的 postMatrix 把目标图原点放在 (w/2, h/2-w/2)。
    // 只补尺度不补原点，模型会整体偏离目标图 —— 这也是"位置不对"的一半原因。
    this._finalPos.copy(this._smoothPos).add(this._touchOffset).multiply(this._capturedScl).sub(this._anchorOrigin);
    this._tempMatrix.identity().compose(this._finalPos, this._smoothQuat, this._capturedScl);
    group.matrix.copy(this._tempMatrix);
    // ⚠️ MindAR 设了 matrixAutoUpdate=false，且 three 不会因 matrix 变更自动标记脏位。
    // 不置此标志 group.matrixWorld 永不更新，模型世界变换卡死在初始值。
    group.matrixWorldNeedsUpdate = true;

    if (this._modelWrapper) this._modelWrapper.quaternion.copy(this._touchRot);
    for (const zi of this._anchors) {
      if (zi.anchor === this.anchor) continue;
      if (zi.modelWrapper) zi.modelWrapper.quaternion.copy(this._touchRot);
    }

    // -- 表情追踪（面部模式） --
    if (this.trackingType === 'face' && (this as any).mindAR?.faceResult?.length > 0) {
      this._detectExpressions((this as any).mindAR.faceResult[0].landmarks);
    }
  }

  /**
   * 表情追踪检测
   *
   * 从 MindAR 面部网格 468 特征点计算：
   * - EAR (Eye Aspect Ratio) 眨眼检测
   * - MAR (Mouth Aspect Ratio) 嘴巴张/闭检测
   * 状态变化时通过 InteractionRunner 触发 onBlink / onMouthOpen / onMouthClose。
   *
   * 参考 MediaPipe Face Mesh 索引规范：
   *   左眼: 33(外眼角) 133(内眼角) 159(上) 145(下) 158(上内) 153(下内)
   *   右眼: 362(外) 263(内) 386(上) 374(下) 385(上内) 380(下内)
   *   嘴巴: 13(上唇顶) 14(下唇底) 61(左嘴角) 291(右嘴角)
   */
  private _detectExpressions(landmarks: Float32Array): void {
    if (!landmarks || landmarks.length < 468 * 3) return;

    // ── 两点距离（索引 → 索引，直接操作原始数组避免 GC） ──
    const d = (i1: number, i2: number): number => {
      const dx = landmarks[i1 * 3] - landmarks[i2 * 3];
      const dy = landmarks[i1 * 3 + 1] - landmarks[i2 * 3 + 1];
      const dz = landmarks[i1 * 3 + 2] - landmarks[i2 * 3 + 2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    // ── Eye Aspect Ratio（双眼平均） ──
    // 公式: (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
    const earLeft = (d(159, 145) + d(158, 153)) / (2 * d(33, 133));
    const earRight = (d(386, 374) + d(385, 380)) / (2 * d(362, 263));
    const earAvg = (earLeft + earRight) / 2;

    // ── Mouth Aspect Ratio ──
    // 公式: |上唇顶 - 下唇底| / |左嘴角 - 右嘴角|
    const mar = d(13, 14) / d(61, 291);

    // ── 眨眼检测 ──
    const BLINK_THRESHOLD = 0.22;
    if (earAvg < BLINK_THRESHOLD && !this._expressionState.eyeClosed) {
      this._expressionState.eyeClosed = true;
      this._interactionRunner?.fire('onBlink');
    } else if (earAvg >= BLINK_THRESHOLD) {
      this._expressionState.eyeClosed = false;
    }

    // ── 嘴巴张闭检测 ──
    const MOUTH_THRESHOLD = 0.30;
    const mouthOpen = mar > MOUTH_THRESHOLD;
    if (mouthOpen && !this._expressionState.mouthOpen) {
      this._expressionState.mouthOpen = true;
      this._interactionRunner?.fire('onMouthOpen');
    } else if (!mouthOpen && this._expressionState.mouthOpen) {
      this._expressionState.mouthOpen = false;
      this._interactionRunner?.fire('onMouthClose');
    }
  }

  /**
   * 停止 AR 并清理资源
   */
  /**
   * 启动 8th Wall 引擎（替代 MindAR）
   *
   * 当 config.engine === '8thwall' 或 tracking === 'world' 时自动调用。
   * 使用 EightWallAdapter + ModelManager 加载模型。
   */
  private async startEightWall(onProgress?: (pct: number) => void): Promise<void> {
    console.log('[AREngine] 使用 8th Wall 引擎');

    const adapter = new EightWallAdapter();
    this._eightWall = adapter;

    // 关联回调
    adapter.onTrackingStatus = (found) => {
      this._onTrackingStatus?.(found);
    };
    adapter.onModelStatus = (status, pct) => {
      this._onModelStatus?.(status, pct);
      if (status === 'loaded') {
        this.started = true;
      }
    };
    adapter.onFeatureQuality = (q) => this._onFeatureQuality?.(q);

    // 设置追踪类型（供 replacePlacedObject/recenter 等判断使用）
    this.trackingType = this.config.tracking as TrackingType;

    // 构造 UnifiedARConfig
    const isPlane = this.trackingType === 'plane';
    const capabilities: CapabilityModuleConfig[] = [];
    if (this.config.tracking === 'world' || isPlane) {
      capabilities.push({ type: CapabilityType.WorldTracking } as any);
    }
    if (isPlane) {
      capabilities.push({
        type: CapabilityType.PlaneDetection,
        placementMode: this.config.planeMode || 'horizontal',
      } as any);
    }
    if (this.config.tracking === 'face') {
      capabilities.push({ type: CapabilityType.FaceTracking } as any);
    }
    if (this.config.tracking === 'image') {
      capabilities.push({
        type: CapabilityType.ImageTracking,
        targetUrl: this.config.targetUrl,
      } as any);
    }

    const unifiedConfig: UnifiedARConfig = {
      engine: EngineType.EightWall,
      capabilities,
      videoUrl: this.config.videoUrl || undefined,
      model: isPlane ? {
        url: this.config.modelUrl || '',
        scale: this.config.scale,
        position: this.config.position,
      } : {
        url: this.config.modelUrl,
        scale: this.config.scale,
        position: this.config.position,
      },
      eightWall: {
        engineUrl: '/8thwall/xr.js',
        pvzMode: this.config.pvzConfig?.enabled ?? false,
      },
      tracking: {
        filterMinCF: this.config.filterMinCF,
        filterBeta: this.config.filterBeta,
        freezeOnDetect: this.config.freezeOnDetect,
      },
    };

    await adapter.initialize(this.container, unifiedConfig);

    // ── 桥接闭环：放置后创建追踪→导览桥梁 ──
    // 注意：EightWallAdapter 始终注册平面检测模块（createPlaneDetectionModule），
    // 因此 world 追踪模式下同样会有「点击放置」并触发 onPlaced。
    // 原先仅判断 isPlane，导致 CreateGuide 发布的 trackingType:'world' 导览
    // 永远无法连接 ScenePositionProvider —— manual/vps/ble 定位的导览永不启动。
    // ⚠️ 必须在 adapter.start() 之前挂 onPlaced：start 在摄像头长时间不就绪时会
    // 抛错中断本函数，若在其后才赋值，放置回调将永远不会被注册。
    if (isPlane || this.trackingType === 'world' || this.trackingType === 'image') {
      const worldBridge = new ARWorldBridge()
      adapter.onPlaced = (worldPos: THREE.Vector3) => {
        // 0. PvZ 游戏模式：棋盘挂在 8th Wall 放置组（世界坐标，SLAM 世界锁定）
        if (this.config.pvzConfig?.enabled && !this._pvz && adapter.placedObject) {
          this._pvz = new PvzController({
            group: adapter.placedObject,
            scene: adapter.scene,
            camera: adapter.camera,
            container: this.container,
            config: this.config.pvzConfig,
          });
          this._pvz.start();
          console.log('[AREngine] PvZ 已在 8th Wall 世界坐标启动（SLAM 世界锁定）');
        }

        // 1. 创建世界锚点
        const anchor = worldBridge.createAnchor('eightwall-placement', worldPos)

        // 2. 创建 8th Wall SLAM 追踪器包装
        const tracker = new EightWallTracker(adapter)
        tracker.start().catch((err: any) =>
          console.warn('[AREngine] EightWallTracker start 失败:', err)
        )

        // 3. 创建场景位置提供器（追踪→导览桥梁）
        const sceneProvider = new ScenePositionProvider({ tracker, anchor })
        this._sceneProvider = sceneProvider

        // heading 修复：把设备罗盘航向喂给 provider（SLAM 世界系 yaw ≠ 正北）
        this._compassHandler = (e: DeviceOrientationEvent) => {
          const ev = e as any;
          const deg =
            typeof ev.webkitCompassHeading === 'number'
              ? (ev.webkitCompassHeading as number) // iOS：自北顺时针，直接可用
              : typeof ev.alpha === 'number'
                ? (360 - (ev.alpha as number)) % 360 // Android：α 逆时针 → 转顺时针
                : null;
          if (deg !== null && Number.isFinite(deg)) sceneProvider.setCompassHeading(deg);
        };
        window.addEventListener('deviceorientation', this._compassHandler, true);

        // 4. 如果 GuideEngine 已存在，替换其位置提供器
        if (this._guideEngine) {
          this._guideEngine.setPositionProvider(sceneProvider)
          this._guideEngine.start()
          console.log('[AREngine] 追踪→导览闭环已连接 (ScenePositionProvider)')
        }

        // 5. 闭环反馈：poiEnter → 重置快照参考帧（消除累积漂移）
        if (this._guideEngine && adapter.relocalizer) {
          this._guideEngine.on('poiEnter', () => {
            if (adapter.relocalizer && adapter.videoElement && adapter.camera) {
              adapter.relocalizer.capture(
                adapter.videoElement,
                adapter.camera.position,
                adapter.camera.quaternion,
              )
              console.log('[AREngine] POI 抵达 → 快照参考帧已更新')
            }
          })
        }
      }
    }

    await adapter.start();

    // 初始化游戏系统（如果有 game 配置）
    this.initGame(unifiedConfig);

    // 初始化导览系统（如果有 guide 配置）
    this.initGuide(unifiedConfig);

    // 非平面模式：直接加载模型到场景
    if (!isPlane && this.config.modelUrl) {
      this._onModelStatus?.('loading', 0);
      const modelManager = new ModelManager();
      this._modelManager = modelManager;

      try {
        const wrapper = await modelManager.load(this.config.modelUrl, {
          url: this.config.modelUrl,
          scale: this.config.scale,
          position: this.config.position ?? [0, 0, 0],
        });
        adapter.scene.add(wrapper);
        this._onModelStatus?.('loaded');
        onProgress?.(1);
        console.log('[AREngine] 8th Wall 模型加载成功');
      } catch (err: any) {
        console.error('[AREngine] 8th Wall 模型加载失败:', err);
        this._onModelStatus?.('error');
      }
    }

    // 平面模式：适配器在用户点击放置后自动加载模型
    // 标记引擎已启动（不等待放置，确保 stop() 能正常清理）
    this.started = true;
  }

  /**
   * 启动 CameraARAdapter（跨浏览器 AR 路径）
   *
   * 使用摄像头 + 陀螺仪 + Three.js 的轻量 AR，不依赖 WebXR 或 8th Wall。
   * 在 CameraARAdapter 的 initialize/start 内部完成场景搭建和渲染循环启动。
   */
  private async startCameraAR(onProgress?: (pct: number) => void): Promise<void> {
    console.log('[AREngine] 使用 Camera AR 引擎')

    const adapter = new CameraARAdapter()
    const unifiedConfig: UnifiedARConfig = {
      engine: EngineType.Camera,
      capabilities: [{ type: CapabilityType.PlaneDetection, placementMode: this.config.planeMode || 'horizontal' } as any],
      videoUrl: this.config.videoUrl || undefined,
      model: {
        url: this.config.modelUrl || '',
        scale: this.config.scale,
        position: this.config.position,
      },
      tracking: {
        filterMinCF: this.config.filterMinCF,
        filterBeta: this.config.filterBeta,
        freezeOnDetect: this.config.freezeOnDetect,
      },
    }

    adapter.onTrackingStatus = (found) => this._onTrackingStatus?.(found)
    adapter.onModelStatus = (status, pct) => {
      this._onModelStatus?.(status, pct)
      if (status === 'loaded') this.started = true
    }

    await adapter.initialize(this.container, unifiedConfig)
    await adapter.start()
    this._eightWall = null
    this.started = true
  }

  /**
   * 初始化交互规则执行引擎
   * 消费 InteractionRule[] 配置，绑定动作处理器到引擎能力
   */
  initInteraction(rules: InteractionRule[]): void {
    if (!rules || rules.length === 0) return

    const handlers: ActionHandlers = {
      playAnimation: (params) => {
        const clip = params.clip || ''
        if (clip && this._animController?.clipNames.includes(clip)) {
          this._animController.play(clip, 0.3)
        } else {
          this._animController?.playNext(0.3)
        }
      },
      playSound: (params) => {
        const src = params.src || ''
        if (src) {
          // M13：带 position 的音效走空间音频（HRTF），否则保持普通播放
          const pos = (params as any).position
          if (pos && this._spatialAudio.enabled) {
            this._spatialAudio.playAt(src, pos, { volume: params.volume ?? 0.7 })
          } else {
            const audio = new Audio(src)
            audio.volume = params.volume ?? 0.7
            audio.play().catch(() => {})
          }
        }
      },
      showMessage: (params) => {
        this._showToast(params.text || '')
      },
      addScore: () => {
        this._showToast('+1')
      },
      showEffect: () => {
        const flash = document.createElement('div')
        flash.style.cssText = 'position:fixed;inset:0;z-index:99;pointer-events:none;background:rgba(255,255,255,0.3);animation:fadeOut 0.3s ease-out'
        if (!document.getElementById('_ar_flash_style')) {
          const s = document.createElement('style')
          s.id = '_ar_flash_style'
          s.textContent = '@keyframes fadeOut{to{opacity:0}}'
          document.head.appendChild(s)
        }
        document.body.appendChild(flash)
        setTimeout(() => flash.remove(), 300)
      },
      link: (params) => {
        const url = params.url || ''
        if (url) window.open(url, '_blank')
      },
      triggerVibrate: () => {
        if (navigator.vibrate) navigator.vibrate(100)
      },
      spawnItem: () => {},
      removeItem: () => {},
      stopAnimation: () => {
        this._animController?.stop()
      },
    }

    this._interactionRunner = new InteractionRunner(rules, handlers)
    console.log(`[AREngine] 交互规则已加载: ${rules.length} 条`)
  }

  /**
   * 初始化游戏系统
   *
   * 根据 UnifiedARConfig 中的 game 配置创建 GameEngine、GameHUD 和 GameLogicRunner。
   * 自动绑定 GameEngine 事件 → HUD 更新，并桥接到 InteractionRunner。
   * 可在外部调用（类似 initInteraction），也会在 8th Wall 路径中自动调用。
   */
  initGame(config: UnifiedARConfig): void {
    const gameCfg = config.game
    if (!gameCfg?.enabled) return

    // 获取场景引用
    let scene: THREE.Scene | null = null
    if (this._eightWall) {
      scene = this._eightWall.scene
    } else if (this.mindAR?.scene) {
      scene = this.mindAR.scene
    }
    if (!scene) {
      console.warn('[AREngine] initGame: 无场景引用，跳过游戏初始化')
      return
    }

    // 1. 创建游戏引擎
    const engine = new GameEngine()
    engine.start(gameCfg, scene)
    this._gameEngine = engine

    // 2. 创建 HUD
    const hud = new GameHUD(this.container)
    hud.create()
    this._gameHUD = hud

    // 3. 绑定游戏事件 → HUD
    engine.on('scoreUpdate', (payload) => {
      hud.updateScore(payload.score)
      if (payload.combo.count > 1) {
        hud.showCombo(payload.combo.count, payload.combo.multiplier)
      }
    })

    engine.on('timerTick', (payload) => {
      hud.updateTimer(payload.remaining)
    })

    engine.on('gameEnd', (payload) => {
      hud.showEndScreen(
        payload.score,
        payload.items,
        gameCfg.completeMessage || '游戏结束！'
      )
    })

    // 重启按钮回调
    hud.onRestart(() => {
      this._restartGame(gameCfg, scene!)
    })

    // 4. 创建规则执行器
    if (gameCfg.rules && gameCfg.rules.length > 0) {
      const runner = new GameLogicRunner(engine, gameCfg.rules as UnifiedRule[])
      // 关联导航系统（如果有）
      if (this._guideEngine) {
        runner.setNavigationSystem(this._guideEngine)
      }
      runner.start()
      this._gameLogicRunner = runner
    }

    console.log(`[AREngine] 游戏系统已初始化: type=${gameCfg.type}, duration=${gameCfg.duration}s`)
  }

  /**
   * 初始化导览系统（Guide Engine + HUD + GPS Provider）
   *
   * 根据 UnifiedARConfig 中的 guide 配置创建 GuideEngine、GuideHUD，
   * 自动绑定 poiEnter → HUD 显示 + 弹窗提示。
   * 在 startEightWall() 中自动调用。
   */
  initGuide(config: UnifiedARConfig): void {
    const guideRoute = config.guide
    if (!guideRoute) return

    // 1. 创建 GuideEngine
    const engine = new GuideEngine(guideRoute)
    this._guideEngine = engine

    // 2. 创建位置提供器（根据 route.positionProvider 选择）
    let provider: IPositionProvider | null = null
    let deferredStart = false
    switch (guideRoute.positionProvider) {
      case 'gps':
        provider = new GPSPositionProvider(config.positioning?.gps)
        break
      case 'manual':
      case 'vps':
      case 'ble':
        // 场景坐标定位 — 由 8th Wall SLAM 放置后通过 ScenePositionProvider 提供
        deferredStart = true
        break
      default:
        provider = new GPSPositionProvider(config.positioning?.gps)
        break
    }
    if (provider) {
      engine.setPositionProvider(provider)
    }

    // 3. 创建 HUD
    const hud = new GuideHUD(this.container)
    hud.create()
    this._guideHUD = hud

    // 4. 绑定导览事件

    // poiEnter → 显示 POI 卡片 + Toast
    engine.on('poiEnter', (poi) => {
      hud.showPOICard(poi)
      this._showToast(`到达: ${poi.name}`)
    })

    // poiExit → Toast
    engine.on('poiExit', (poi) => {
      console.log(`[Guide] 离开 POI: ${poi.name}`)
    })

    // positionUpdate → 更新 HUD + direction arrow
    engine.on('positionUpdate', () => {
      const activePOI = engine.currentPOI
      const dist = activePOI ? engine.distanceToPOI(activePOI) : Infinity
      hud.update(
        engine.pois,
        activePOI,
        dist,
        engine.progress,
        new Set(engine.pois.filter(p => engine.isVisited(p.id)).map(p => p.id)),
      )
      // Rotate direction arrow based on device heading (if available)
      const heading = engine.userPosition?.heading
      if (heading != null) {
        hud.setHeading(heading)
      }
    })

    // guideStart → 显示 HUD
    engine.on('guideStart', () => {
      this._showToast('导览开始')
      const activePOI = engine.currentPOI
      const dist = activePOI ? engine.distanceToPOI(activePOI) : Infinity
      hud.update(
        engine.pois,
        activePOI,
        dist,
        engine.progress,
        new Set(engine.pois.filter(p => engine.isVisited(p.id)).map(p => p.id)),
      )
    })

    // guideComplete → 庆祝 UI
    engine.on('guideComplete', () => {
      hud.showCelebration()
      this._showToast('导览完成！所有地点已参观')
    })

    // 5. 启动导览引擎（除非被延迟到放置后）
    if (!deferredStart) {
      engine.start()
    } else {
      console.log('[AREngine] 导览引擎已创建，等待 AR 放置后连接 ScenePositionProvider')
    }

    console.log(`[AREngine] Guide 系统已初始化: "${guideRoute.name}" (${guideRoute.pois.length} 个 POI)`)
  }

  /**
   * 初始化统一体验配置（Phase 3）
   *
   * 解析 ARExperience 格式，同时初始化游戏机制和导览机制。
   * 向后兼容：如果没有 experience 字段，回退到旧的 initGame/initGuide。
   */
  initExperience(config: UnifiedARConfig): void {
    const exp = config.experience
    if (!exp) {
      // 向后兼容：尝试旧格式
      this.initGame(config)
      this.initGuide(config)
      // 旧格式没有 HUD 配置，跳过 HUD 初始化
      return
    }

    // 1. 游戏机制
    if (exp.mechanics?.timer?.enabled || exp.mechanics?.scoring?.enabled || (exp.mechanics?.items?.total ?? 0) > 0) {
      const gameCfg = this._buildGameConfigFromExperience(exp)
      this.initGame({ ...config, game: gameCfg })
    }

    // 2. 导览机制
    if (exp.navigation?.pois && exp.navigation.pois.length > 0) {
      const guideRoute = this._buildGuideRouteFromExperience(exp)
      this.initGuide({ ...config, guide: guideRoute })
    }

    // 3. 如果已创建 GameEngine，关联导航系统
    if (this._gameEngine && this._guideEngine) {
      this._gameEngine.setNavigationSystem(this._guideEngine)
    }

    // 4. 如果有规则但无游戏机制，直接创建 GameLogicRunner
    if (exp.rules && exp.rules.length > 0 && !this._gameLogicRunner) {
      const scene = this._eightWall?.scene ?? this.mindAR?.scene ?? null
      if (scene && this._gameEngine) {
        const runner = new GameLogicRunner(this._gameEngine, exp.rules)
        if (this._guideEngine) {
          runner.setNavigationSystem(this._guideEngine)
        }
        runner.start()
        this._gameLogicRunner = runner
      }
    }

    // 5. 初始化 ARHUD（在游戏/导览引擎之后，以便桥接事件）
    if (exp.hud) {
      const hudConfig = exp.theme
        ? { ...exp.hud, theme: exp.theme }
        : exp.hud
      this.initHUD(hudConfig, {
        totalPois: exp.navigation?.pois?.length || 0,
        maxLives: exp.mechanics?.lives?.total || 3,
        lives: exp.mechanics?.lives?.total || 3,
      })
    }

    console.log(`[AREngine] 统一体验已初始化: "${exp.meta.title}" (${exp.type})`)
  }

  /**
   * 初始化 ARHUD 运行时渲染系统
   *
   * 创建 ARHUD 实例、注册所有标准渲染器、建立与 GameEngine/GuideEngine 的事件桥接。
   * 可在外部调用（有上下午配置时），也可由 initExperience 自动调用。
   */
  initHUD(config: HUDConfig, initialState?: Partial<GameState>): void {
    if (!config) return

    // 清理先前 HUD（如果有）
    this._arHUD?.dispose()

    const hud = new ARHUD(this.container, config, initialState)

    // 注册所有 12 个标准渲染器
    hud.registerRenderer(new ScoreRenderer())
    hud.registerRenderer(new TimerRenderer())
    hud.registerRenderer(new ComboRenderer())
    hud.registerRenderer(new LivesRenderer())
    hud.registerRenderer(new MessageRenderer())
    hud.registerRenderer(new POICardRenderer())
    hud.registerRenderer(new ProgressRenderer())
    hud.registerRenderer(new POIListRenderer())
    hud.registerRenderer(new ArrowRenderer())
    hud.registerRenderer(new CompassRenderer())
    hud.registerRenderer(new ButtonRenderer())
    hud.registerRenderer(new CustomTextRenderer())

    hud.init()
    this._arHUD = hud

    // ── 桥接游戏引擎事件 → HUD 状态 ──
    if (this._gameEngine) {
      this._gameEngine.on('scoreUpdate', (payload) => {
        hud.updateState({
          score: payload.score,
          combo: payload.combo.count,
          comboMultiplier: payload.combo.multiplier,
        })
      })

      this._gameEngine.on('timerTick', (payload) => {
        hud.updateState({ timer: payload.remaining })
      })

      this._gameEngine.on('gameEnd', (payload) => {
        hud.updateState({
          phase: 'completed',
          items: payload.items,
          message: '游戏结束！',
        })
      })
    }

    // ── 桥接导览引擎事件 → HUD 状态 ──
    if (this._guideEngine) {
      this._guideEngine.on('poiEnter', (poi) => {
        hud.updateState({
          currentPOI: poi.name || poi.id,
          message: `到达: ${poi.name}`,
        })
      })

      this._guideEngine.on('poiExit', () => {
        hud.updateState({ currentPOI: null })
      })

      this._guideEngine.on('positionUpdate', (pos) => {
        const updates: Partial<GameState> = {
          heading: pos.heading,
        }
        // Update visited POIs list
        if (this._guideEngine) {
          updates.visitedPois = this._guideEngine.pois
            .filter(p => this._guideEngine!.isVisited(p.id))
            .map(p => p.id)

          // Update distance to current POI
          const activePOI = this._guideEngine.currentPOI
          if (activePOI) {
            updates.distanceToPOI = this._guideEngine.distanceToPOI(activePOI)
          }
        }
        hud.updateState(updates)
      })

      this._guideEngine.on('guideComplete', () => {
        hud.updateState({ message: '导览完成！所有地点已参观' })
      })
    }

    console.log('[AREngine] ARHUD 已初始化')
  }

  /** 从 ARExperience 构建兼容的 GameConfig */
  private _buildGameConfigFromExperience(exp: ARExperience): GameConfig {
    const m = exp.mechanics!
    return {
      enabled: true,
      type: 'scavenger',
      duration: m.timer?.duration ?? 60,
      itemCount: m.items?.total ?? 10,
      scorePerItem: 100,
      comboEnabled: m.combo?.enabled ?? false,
      spawnInterval: m.items?.spawnInterval ?? 3,
      maxVisible: m.items?.maxVisible ?? 5,
      itemModelUrl: '',
      effectOnCollect: '',
      soundOnCollect: '',
      onComplete: { action: 'show_score' },
      completeMessage: exp.navigation?.completion?.message || '体验完成！',
      rules: exp.rules as GameConfig['rules'],
    }
  }

  /** 从 ARExperience 构建兼容的 GuideRoute */
  private _buildGuideRouteFromExperience(exp: ARExperience): import('./types/config').GuideRoute {
    const nav = exp.navigation!
    return {
      id: exp.id,
      name: exp.meta.title,
      description: exp.meta.description || '',
      pois: nav.pois.map(poi => ({
        id: poi.id,
        name: poi.name,
        description: poi.description,
        position: poi.position,
        triggerRadius: poi.triggerRadius,
        modelUrl: poi.modelUrl,
        imageUrl: poi.imageUrl,
        audioUrl: poi.audioUrl,
        autoTrigger: poi.autoTrigger,
        onEnter: poi.onEnter,
        onExit: poi.onExit,
        order: poi.order,
        estimatedDuration: poi.estimatedDuration,
      })),
      positionProvider: nav.positionProvider as any,
    }
  }

  /** 重启游戏引擎和 HUD */
  private _restartGame(gameCfg: GameConfig, scene: THREE.Scene): void {
    // 清理旧的引擎
    this._gameEngine?.end()
    this._gameEngine?.reset()
    this._gameHUD?.dispose()

    // 创建新的引擎
    const engine = new GameEngine()
    engine.start(gameCfg, scene)
    this._gameEngine = engine

    // 创建新的 HUD
    const hud = new GameHUD(this.container)
    hud.create()
    this._gameHUD = hud

    // 重新绑定事件
    engine.on('scoreUpdate', (payload) => {
      hud.updateScore(payload.score)
      if (payload.combo.count > 1) {
        hud.showCombo(payload.combo.count, payload.combo.multiplier)
      }
    })
    engine.on('timerTick', (payload) => {
      hud.updateTimer(payload.remaining)
    })
    engine.on('gameEnd', (payload) => {
      hud.showEndScreen(payload.score, payload.items, gameCfg.completeMessage || '游戏结束！')
    })
    hud.onRestart(() => {
      this._restartGame(gameCfg, scene)
    })

    // 重启规则执行器
    if (this._gameLogicRunner) {
      this._gameLogicRunner.stop()
      this._gameLogicRunner = null
    }
    if (gameCfg.rules && gameCfg.rules.length > 0) {
      const runner = new GameLogicRunner(engine, gameCfg.rules as UnifiedRule[])
      if (this._guideEngine) {
        runner.setNavigationSystem(this._guideEngine)
      }
      runner.start()
      this._gameLogicRunner = runner
    }

    console.log('[AREngine] 游戏已重启')
  }

  /**
   * 尝试通过射线检测收集游戏物品
   * 在 tap 事件中调用，从点击位置发射射线检测游戏物品
   */
  private _tryCollectGameItem(clientX: number, clientY: number): void {
    if (!this._gameEngine?.running) return

    // 兼容 MindAR 和 8th Wall 相机
    const camera = this.mindAR?.camera ?? this._eightWall?.camera ?? null
    if (!camera) return

    const rect = this.container.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, camera)

    const items = this._gameEngine.spawnManager?.activeItems ?? []
    if (items.length === 0) return

    const intersects = raycaster.intersectObjects(items, false)
    if (intersects.length > 0) {
      const hitMesh = intersects[0].object as THREE.Mesh
      this._gameEngine.collectItem(hitMesh)
    }
  }

  /** 显示 Toast 消息（用于 showMessage 动作） */
  private _showToast(text: string): void {
    if (!text) return
    if (this._toastEl) {
      this._toastEl.remove()
      this._toastEl = null
    }
    const el = document.createElement('div')
    el.textContent = text
    el.style.cssText = 'position:absolute;bottom:100px;left:50%;transform:translateX(-50%);'
      + 'z-index:50;padding:8px 20px;border-radius:20px;background:rgba(0,0,0,0.7);'
      + 'backdrop-filter:blur(8px);color:#fff;font-size:14px;font-weight:500;'
      + 'pointer-events:none;border:1px solid rgba(255,255,255,0.1);'
      + 'animation:toastIn 0.2s ease-out;white-space:nowrap'
    if (!document.getElementById('_ar_toast_style')) {
      const style = document.createElement('style')
      style.id = '_ar_toast_style'
      style.textContent = '@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}'
      document.head.appendChild(style)
    }
    this.container.appendChild(el)
    this._toastEl = el
    setTimeout(() => {
      if (this._toastEl === el) {
        el.style.opacity = '0'
        el.style.transition = 'opacity 0.3s'
        setTimeout(() => el.remove(), 300)
        this._toastEl = null
      }
    }, 2500)
  }

  async stop(): Promise<void> {
    if (!this.started) return;

    // 清理 markerless AR（平面放置）资源
    if (this._arStream) {
      this._arStream.getTracks().forEach(t => t.stop());
      this._arStream = null;
    }
    if (this._arVideo) {
      this._arVideo.pause();
      this._arVideo.srcObject = null;
      if (this._arVideo.parentNode) this._arVideo.parentNode.removeChild(this._arVideo);
      this._arVideo = null;
    }
    if (this._markerlessRenderer) {
      this._markerlessRenderer.setAnimationLoop(null);
      this._markerlessRenderer.dispose();
      if (this._markerlessRenderer.domElement.parentNode) {
        this._markerlessRenderer.domElement.parentNode.removeChild(this._markerlessRenderer.domElement);
      }
      this._markerlessRenderer = null;
    }
    this._markerlessScene = null;
    this._markerlessCamera = null;
    this._markerlessGroup = null;
    // 清理放置内容独立组
    if (this._placementGroup) {
      this._placementGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material?.dispose();
        }
      });
      if (this._placementGroup.parent) this._placementGroup.parent.remove(this._placementGroup);
      this._placementGroup = null;
    }
    this._hasPlaced = false;
    this._isPlaced = false;
    this._reticleRing = null;
    this._reticleDot = null;
    this._placementHint = null;

    // 清理 markerless AR 事件监听器
    for (const cleanup of this._markerlessCleanups) {
      cleanup();
    }
    this._markerlessCleanups = [];

    // 清理视频播放器
    if (this._videoPlayer) {
      this._videoPlayer.dispose();
      this._videoPlayer = null;
    }

    // 清理多区域锚点视频播放器
    for (const zoneInfo of this._anchors) {
      if (zoneInfo.videoPlayer) {
        zoneInfo.videoPlayer.dispose();
        zoneInfo.videoPlayer = null;
      }
    }
    this._anchors = [];
    this._imageAnchors = [];
    this._activeImageIndex = 0;
    this._switchBlend = null;
    // 重置 anchor 尺度缓存：下次 start 会从新的 postMatrixs 重新捕获
    this._anchorScaleCaptured = false;
    this._capturedScl.set(1, 1, 1);
    this._invCapturedScl.set(1, 1, 1);
    this._anchorOrigin.set(0, 0, 0);
    this._unitsPerMeter = 1;
    this._spatialAudio.stopAll();
    if (this._compassHandler) {
      window.removeEventListener('deviceorientation', this._compassHandler, true);
      this._compassHandler = null;
    }

    // 清理方向传感器管理器
    if (this._orientationManager) {
      this._orientationManager.stop();
      this._orientationManager = null;
    }

    // 清理游戏系统
    if (this._gameLogicRunner) {
      this._gameLogicRunner.stop();
      this._gameLogicRunner = null;
    }
    if (this._gameEngine) {
      this._gameEngine.end();
      this._gameEngine.reset();
      this._gameEngine = null;
    }
    if (this._gameHUD) {
      this._gameHUD.dispose();
      this._gameHUD = null;
    }

    // 清理导览系统
    if (this._guideEngine) {
      this._guideEngine.stop();
      this._guideEngine = null;
    }
    if (this._guideHUD) {
      this._guideHUD.dispose();
      this._guideHUD = null;
    }

    // 清理追踪→导览桥梁
    if (this._sceneProvider) {
      this._sceneProvider.stop();
      this._sceneProvider = null;
    }

    // 清理 ARHUD
    if (this._arHUD) {
      this._arHUD.dispose();
      this._arHUD = null;
    }

    if (this._eightWall) {
      this._pvz?.dispose();
      this._pvz = null;
      this._eightWall.dispose();
      this._eightWall = null;
      this._modelManager = null;
      this.started = false;
      return;
    }

    try {
      // 停止 Three.js 渲染循环
      if (this.mindAR?.renderer) {
        this.mindAR.renderer.setAnimationLoop(null);
      }
      await this.mindAR?.stop();
    } catch (e) {
      console.warn("AR stop 异常:", e);
    }
    this.mindAR = null;
    this.started = false;
  }

  /** 是否已启动 */
  get isStarted(): boolean {
    return this.started;
  }

  /** 当前追踪类型 */
  get currentTrackingType(): TrackingType {
    return this.trackingType;
  }


  // ==================== 公开控制接口（工具栏用） ====================

  /**
   * 重新放置 — 仅平面放置模式有效
   * 移除当前模型/视频，重新显示 reticle 和提示，让用户再次点击放置
   */
  replacePlacedObject(): void {
    // 8th Wall 路径：委托给适配器
    if (this._eightWall) {
      this._eightWall.replacePlacedObject();
      this._onTrackingStatus?.(false);
      return;
    }

    // 陀螺仪路径
    if (this.trackingType !== 'plane') {
      console.warn('[AREngine] replacePlacedObject 仅在 plane 追踪模式下可用');
      return;
    }
    if (!this._hasPlaced || !this._markerlessGroup || !this._markerlessRenderer) return;

    // 移除当前模型/视频（从 _placementGroup 移除）
    if (this._videoPlayer) {
      this._videoPlayer.dispose();
      this._videoPlayer = null;
    }
    if (this._modelWrapper) {
      this._modelWrapper.parent?.remove(this._modelWrapper);
      // 递归释放
      this._modelWrapper.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material?.dispose();
        }
      });
      this._modelWrapper = null;
    }
    // 清空 _placementGroup（确保残留内容也被移除）
    if (this._placementGroup) {
      while (this._placementGroup.children.length > 0) {
        const c = this._placementGroup.children[0];
        this._placementGroup.remove(c);
        if (c instanceof THREE.Mesh) {
          c.geometry?.dispose();
          if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
          else c.material?.dispose();
        }
      }
    }

    // 重新创建 reticle（仍放在 gyroGroup 中，跟随设备旋转）
    const gyroGroup = this._markerlessGroup;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.09, 48),
      new THREE.MeshBasicMaterial({ color: 0x4f8cff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    gyroGroup.add(ring);
    this._reticleRing = ring;

    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.015, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
    );
    gyroGroup.add(dot);
    this._reticleDot = dot;

    const rp2 = this.config.position || [0, 0.15, -0.2];
    ring.position.set(rp2[0], rp2[1], rp2[2]);
    dot.position.set(rp2[0], rp2[1], rp2[2]);

    // 重新显示提示
    const hint = document.createElement('div');
    hint.textContent = '点击屏幕放置';
    hint.style.cssText = 'position:absolute;bottom:80px;left:50%;transform:translateX(-50%);'
      + 'color:rgba(255,255,255,0.9);font-size:14px;font-weight:500;'
      + 'background:rgba(0,0,0,0.4);padding:8px 20px;border-radius:20px;'
      + 'pointer-events:none;z-index:10;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.1)';
    this.container.appendChild(hint);
    this._placementHint = hint;

    // 重置放置状态
    this._replaceGeneration++;
    this._hasPlaced = false;
    this._isPlaced = false;
    this._pendingGyroCapture = false;
    this._smoothGyroReady = false;
    // 通知 OrientationManager 重置静止计数
    this._orientationManager?.reset();
    this._onTrackingStatus?.(false);
  }

  /**
   * 重置居中 — 重新捕获当前 SLAM / 陀螺仪朝向为放置参考点
   * 当模型位置漂移时，调用此方法修正
   */
  recenter(): void {
    // 8th Wall 路径：委托给适配器（更新重定位器参考帧）
    if (this._eightWall) {
      this._eightWall.recenter();
      return;
    }

    // 陀螺仪路径
    if (this.trackingType !== 'plane') {
      console.warn('[AREngine] recenter 仅在 plane 追踪模式下可用');
      return;
    }
    if (!this._hasPlaced) return;
    if (this._gyroAvailable) {
      this._placementGyro.copy(this._gyroQuat);
      this._smoothGyroReady = false;
      this._stationaryCount = 0;
      this._smoothStillFrames = 0;
      this._orientationManager?.reset();
    } else {
      // 陀螺仪不可用时 fallback 重置触摸旋转
      this._touchRot.identity();
      this._smoothGyroReady = false;
    }
  }

  /** 运行时切换平面放置模式（水平/垂直/任意） */
  setPlacementMode(mode: 'horizontal' | 'vertical' | 'any'): void {
    if (this._eightWall) {
      this._eightWall.setPlacementMode(mode)
    }
  }

  /**
   * 设置模型位置偏移（工具栏滑块控制）。入参单位是**米**，与 config.position 一致。
   *
   * ⚠️ 不要直接 set 到 wrapper.position：wrapper 是 anchor.group 的子节点，
   * 在 image 路径下父级尺度 = 图宽像素（≈291），直接写米会让偏移被放大 291 倍。
   * 这里统一走 _metersToAnchorUnits() 换算，与 loadModel 写入 config.position
   * 时用的系数完全同源，保证"滑块拖到多少 = 米"，两条入口不会打架。
   */
  setModelPosition(x: number, y: number, z: number): void {
    if (this._eightWall) {
      this._eightWall.setModelPosition(x, y, z)
      return
    }
    const u = this._metersToAnchorUnits();
    const ax = x * u, ay = y * u, az = z * u;
    if (this._modelWrapper) this._modelWrapper.position.set(ax, ay, az);
    else if (this._modelManager) this._modelManager.setPosition(x, y, z);
    // 多区域：同步所有 zone wrapper
    for (const zi of this._anchors) {
      if (zi.modelWrapper && zi.modelWrapper !== this._modelWrapper) {
        zi.modelWrapper.position.set(ax, ay, az);
      }
    }
  }

  /** 当前「米 → anchor 单位」系数；image 路径外恒为 1。供上层 UI 换算/回读使用 */
  get unitsPerMeter(): number {
    return this._metersToAnchorUnits()
  }

  /** 设置模型缩放（工具栏滑块控制） */
  setModelScale(x: number, y: number, z: number): void {
    if (this._eightWall) {
      this._eightWall.setModelScale(x, y, z)
      return
    }
    if (this._modelWrapper) this._modelWrapper.scale.set(x, y, z);
    else if (this._modelManager) this._modelManager.setScale(x, y, z);
    for (const zi of this._anchors) {
      if (zi.modelWrapper && zi.modelWrapper !== this._modelWrapper) {
        zi.modelWrapper.scale.set(x, y, z);
      }
    }
  }

  /** 重置触摸旋转 */
  resetRotation(): void {
    if (this._eightWall) {
      this._eightWall.resetRotation()
      return
    }
    this._touchRot.identity();
    // 平面放置模式：由渲染循环应用 _touchRot，勿重复设置
    if (this.trackingType !== 'plane') {
      if (this._modelWrapper) this._modelWrapper.quaternion.identity();
      if (this._modelManager) this._modelManager.quaternion.identity();
    }
    for (const zi of this._anchors) {
      if (zi.modelWrapper) zi.modelWrapper.quaternion.identity();
    }
  }

  /** 设置模型 Y 轴旋转（角度 0-360） */
  setModelRotation(deg: number): void {
    const rad = deg * Math.PI / 180
    if (this._eightWall) {
      this._eightWall.setModelRotationY(rad)
      return
    }
    this._touchRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rad)
    // 平面放置模式：由渲染循环将 _touchRot 合成到 gyroGroup，勿重复设置 modelWrapper
    if (this.trackingType !== 'plane') {
      if (this._modelWrapper) this._modelWrapper.quaternion.copy(this._touchRot);
      if (this._modelManager) {
        this._modelManager.quaternion.copy(this._touchRot)
      }
    }
  }

  /** 获取当前 Y 轴旋转角度 */
  getModelRotation(): number {
    if (this._eightWall) {
      return this._eightWall.getModelRotationY() * 180 / Math.PI
    }
    // Quaternion -> Euler -> Y axis (radians -> degrees)
    const euler = new THREE.Euler().setFromQuaternion(this._touchRot, 'YXZ');
    return THREE.MathUtils.radToDeg(euler.y);
  }

  /** 冻结状态 */
  get isFrozen(): boolean {
    return this._frozen;
  }

  set isFrozen(v: boolean) {
    this._frozen = v;
  }

  /** 调试信息（委托给当前适配器） */
  getDebugInfo(): import('./types/debug').DebugInfo | null {
    return this._eightWall?.getDebugInfo?.() ?? null
  }

  /**
   * 截图（返回 dataURL）。
   * ⚠️ 修复：WebGL 绘图缓冲在合成后会被清空，直接 toDataURL 会得到空白帧——
   * 必须在同一任务内先同步重绘一帧再读（无需 preserveDrawingBuffer）。
   * 另补 navigator.share 前端侧见 ViewPage.handlePhoto。
   */
  capturePhoto(): string | null {
    if (this._eightWall) return this._eightWall.capturePhoto();
    const r = this.mindAR?.renderer ?? this._markerlessRenderer ?? null;
    const sc = this.mindAR?.scene ?? null;
    const cam = this.mindAR?.camera ?? null;
    if (r && sc && cam) {
      try {
        r.render(sc, cam); // 同步重绘，保证绘图缓冲有效
      } catch {
        /* 部分适配器自管渲染，忽略 */
      }
    }
    if (r) return r.domElement.toDataURL('image/png');
    return null;
  }

  /** capturePhoto 的别名（语义化导出） */
  screenshot(): string | null {
    return this.capturePhoto();
  }

  /** 获取渲染器的 canvas 元素（用于视频录制） */
  get renderCanvas(): HTMLCanvasElement | null {
    if (this.mindAR?.renderer) return this.mindAR.renderer.domElement;
    if (this._markerlessRenderer) return this._markerlessRenderer.domElement;
    return null;
  }

  /**
   * M13：在场景位置播放空间音频（HRTF）。返回停止函数；AudioContext 在用户手势链中首次触发。
   * 导览旁白/展品音效传入 POI 的 scenePosition 即可获得声源方向感。
   */
  playSpatialSound(
    src: string,
    position?: { x: number; y: number; z: number },
    opts?: { loop?: boolean; volume?: number; refDistance?: number }
  ): (() => void) | null {
    return this._spatialAudio.playAt(src, position, opts);
  }

  /** 停止全部空间音频 */
  stopSpatialSound(): void {
    this._spatialAudio.stopAll();
  }

  // ══════════ 全景穹顶（AR 版 720°）：放置 + 手势/触摸显形 ══════════

  private _domeMesh: THREE.Mesh | null = null;
  private _domeMaxOpacity = 0.94;
  private _domeExpanded = false;
  private _domeAudioStop: (() => void) | null = null;
  private _domeBurst: ParticleBurst | null = null;

  /** 程序化星穹贴图（未提供全景图时的默认穹顶） */
  private _makeStarSkyTexture(): THREE.Texture {
    const cv = document.createElement('canvas');
    cv.width = 2048; cv.height = 1024;
    const g = cv.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0, '#050514');
    grad.addColorStop(0.55, '#0b1030');
    grad.addColorStop(0.78, '#1b2550');
    grad.addColorStop(1, '#0a0e20');
    g.fillStyle = grad; g.fillRect(0, 0, 2048, 1024);
    for (let i = 0; i < 900; i++) {
      const y = Math.random() * 560;
      g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.75})`;
      g.fillRect(Math.random() * 2048, y, 1.4, 1.4);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * 在放置组创建全景穹顶（需已完成平面放置，穹顶锚定于放置点，人站在内部）。
   * 初始 opacity=0（不可见），由 toggleDome() 显形。
   */
  async placeDome(opts?: {
    textureUrl?: string;
    radius?: number;
    maxOpacity?: number;
  }): Promise<void> {
    if (this._domeMesh) return;
    const parent = this._placementGroup;
    if (!parent) {
      throw new Error('穹顶需在平面放置模式下使用（先完成地面放置）');
    }
    this._domeMaxOpacity = opts?.maxOpacity ?? 0.94;
    const radius = opts?.radius ?? 8;

    let tex: THREE.Texture | null = null;
    if (opts?.textureUrl) {
      try {
        tex = await new THREE.TextureLoader().loadAsync(opts.textureUrl);
        tex.colorSpace = THREE.SRGBColorSpace;
      } catch {
        tex = null; // 贴图失败回退程序化星穹
      }
    }
    tex = tex ?? this._makeStarSkyTexture();

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 48, 32),
      new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    mesh.name = '__ImmersiveDome__';
    parent.add(mesh);
    this._domeMesh = mesh;
    this._domeBurst = new ParticleBurst(this._markerlessScene ?? this.mindAR?.scene ?? new THREE.Scene());
    console.log('[AREngine] 全景穹顶已创建（半径', radius, '）');
  }

  /** 展开/收回穹顶（1.2s tween + 粒子 + 空间音频氛围） */
  toggleDome(): void {
    if (!this._domeMesh) {
      // ⚠️ 失败必须报出来：曾经写 void this.placeDome(...) —— rejection 被静默吞掉，
      // 用户点按钮毫无反应也不知道为什么（image/world 模式下没有 _placementGroup 必然走到这）。
      this.placeDome(this.config.domeConfig)
        .then(() => this._expandDome())
        .catch((err) => {
          console.error('[AREngine] 穹顶展开失败：', err?.message ?? err);
        });
      return;
    }
    if (this._domeExpanded) this._collapseDome();
    else this._expandDome();
  }

  private _expandDome(): void {
    if (!this._domeMesh || this._domeExpanded) return;
    this._domeExpanded = true;
    this._tweenDome(this._domeMaxOpacity, 1200);
    // 粒子：从穹顶顶部洒落
    try {
      if (this._domeBurst && this._placementGroup) {
        const wp = new THREE.Vector3();
        this._placementGroup.getWorldPosition(wp);
        this._domeBurst.emit(wp.clone().add(new THREE.Vector3(0, 4, 0)), 0xaecbff);
      }
    } catch { /* 忽略 */ }
    // 空间音频：声源挂在穹顶中心上方
    try {
      const src = this.config.domeConfig?.ambienceUrl;
      if (src && this._placementGroup) {
        const wp = new THREE.Vector3();
        this._placementGroup.getWorldPosition(wp);
        this._domeAudioStop = this._spatialAudio.playAt(
          src, { x: wp.x, y: wp.y + 6, z: wp.z }, { loop: true, volume: 0.6 }
        );
      }
    } catch { /* 忽略 */ }
  }

  private _collapseDome(): void {
    if (!this._domeMesh) return;
    this._domeExpanded = false;
    this._tweenDome(0, 900);
    this._domeAudioStop?.();
    this._domeAudioStop = null;
  }

  private _tweenDome(target: number, duration: number): void {
    const mesh = this._domeMesh;
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    const from = mat.opacity;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / duration);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
      mat.opacity = from + (target - from) * e;
      if (k < 1 && this._domeMesh === mesh) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** 穹顶状态（供 UI） */
  get domeState(): 'none' | 'collapsed' | 'expanded' {
    if (!this._domeMesh) return 'none';
    return this._domeExpanded ? 'expanded' : 'collapsed';
  }


  /** M13：每帧更新空间音频听者（用当前活跃相机的世界位姿） */
  updateAudioListener(): void {
    const cam = this._activeCamera;
    if (!cam) return;
    try {
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      cam.getWorldPosition(p);
      cam.getWorldQuaternion(q);
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const heading = THREE.MathUtils.radToDeg(Math.atan2(f.x, -f.z));
      this._spatialAudio.setListener({ x: p.x, y: p.y, z: p.z }, heading);
    } catch {
      /* 忽略 */
    }
  }

  /** 切换摄像头 */
  async switchCamera(): Promise<void> {
    if (this._eightWall) {
      await this._eightWall.switchCamera();
      return;
    }
    if (this.mindAR?.switchCamera) {
      await this.mindAR.switchCamera();
      // 摄像头切换后重新提取 FOV
      {
        const proj = this.mindAR.camera.projectionMatrix.elements;
        const tanHalfFov = 1 / Math.abs(proj[5]);
        this._verticalFov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalfFov));
        this.mindAR.camera.fov = this._verticalFov;
        this.mindAR.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.mindAR.camera.updateProjectionMatrix();
      }
      this.mindAR.renderer.setSize(
        this.container.clientWidth,
        this.container.clientHeight
      );
      if (this.mindAR.cssRenderer) this.mindAR.cssRenderer.setSize(
        this.container.clientWidth,
        this.container.clientHeight
      );
    }
  }

  get animationController(): AnimationController | null {
    return this._animController;
  }
}
