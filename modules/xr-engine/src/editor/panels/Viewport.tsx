import { Grid, OrbitControls, TransformControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { engine, useEditor } from '@/editor/store'
import { Effects } from '@/editor/scene/Effects'
import { SceneTree } from '@/editor/scene/NodeRenderer'
import { buildEnvironmentScene, disposeSceneContents } from '@/editor/scene/environment'
import { ContextMenu, type ContextMenuState } from '@/editor/ui/ContextMenu'
import { buildCreateObjectMenu, buildNodeMenu } from '@/editor/ui/createObjectMenu'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { QUALITY_LABEL, getQualityPreset } from '@/engine/plugins/builtin/quality'
import { Icon } from '@/editor/ui/Icon'

// ---------------------------------------------------------------- 环境

function ProceduralEnvironment() {
  const environment = useEditor((s) => s.environment)
  const assets = useEditor((s) => s.assets)
  const arActive = useEditor((s) => s.arActive)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  const hdri = environment.hdriAssetId
    ? assets.find((a) => a.id === environment.hdriAssetId && a.kind === 'hdri')
    : undefined
  const hdriUri = hdri && !hdri.meta.missing ? hdri.uri : null

  // 烘焙产出的环境贴图；强度/背景等「应用层」赋值都基于它
  const targetRef = useRef<THREE.Texture | null>(null)
  // HDRI 加载是异步的，完成回调里要应用的是最新配置而不是闭包里的旧值
  const applyConfigRef = useRef({ intensity: environment.intensity, background: environment.background, arActive })
  applyConfigRef.current = { intensity: environment.intensity, background: environment.background, arActive }

  const applyConfig = useCallback(() => {
    const cfg = applyConfigRef.current
    scene.environmentIntensity = cfg.intensity
    scene.background = cfg.background && !cfg.arActive ? targetRef.current : null
  }, [scene])

  // 烘焙：只有贴图内容相关的参数（preset / blur / HDRI）变化时才重跑 PMREM。
  // 之前 intensity/background 也在这个 effect 的依赖里，拖强度滑杆每 tick 都重烘焙一次。
  useEffect(() => {
    let cancelled = false

    const applyProcedural = () => {
      if (cancelled) return
      const pmrem = new THREE.PMREMGenerator(gl)
      const envScene = buildEnvironmentScene(environment.preset)
      // PMREM 的 sigma 单位是弧度，超过 ~0.04 会触发 sigmaRadians 采样超限并被裁剪
      const rt = pmrem.fromScene(envScene, Math.min(environment.blur, 0.04))
      targetRef.current = rt.texture
      scene.environment = rt.texture
      applyConfig()
      disposeSceneContents(envScene)
      pmrem.dispose()
    }

    const applyEquirect = (tex: THREE.Texture) => {
      const pmrem = new THREE.PMREMGenerator(gl)
      const rt = pmrem.fromEquirectangular(tex)
      targetRef.current = rt.texture
      scene.environment = rt.texture
      applyConfig()
      pmrem.dispose()
      tex.dispose()
    }

    if (hdriUri) {
      const isHDR = /\.hdr(\?|#|$)/i.test(hdriUri)
      const isEXR = /\.exr(\?|#|$)/i.test(hdriUri)
      const loader = isHDR ? new RGBELoader() : isEXR ? new EXRLoader() : new THREE.TextureLoader()
      loader.load(
        hdriUri,
        (tex) => {
          tex.mapping = THREE.EquirectangularReflectionMapping
          if (cancelled) {
            // cleanup 先于加载回调：贴图直接释放，别滞留在 GPU 里
            tex.dispose()
            return
          }
          applyEquirect(tex)
        },
        undefined,
        () => {
          if (!cancelled) applyProcedural()
        }
      )
    } else {
      applyProcedural()
    }

    return () => {
      cancelled = true
      const target = targetRef.current
      targetRef.current = null
      if (scene.environment === target) scene.environment = null
      if (scene.background === target) scene.background = null
      target?.dispose()
    }
  }, [gl, scene, hdriUri, environment.preset, environment.blur, applyConfig])

  // 应用：强度 / 背景开关 / AR 进出只是轻量赋值，不该触发上面的重烘焙
  useEffect(() => {
    applyConfig()
  }, [applyConfig, environment.intensity, environment.background, arActive])

  return null
}

// ---------------------------------------------------------------- 选中 gizmo

function SelectionGizmo() {
  const selectedId = useEditor((s) => s.selectedId)
  const gizmoMode = useEditor((s) => s.gizmoMode)
  const structureVersion = useEditor((s) => s.structureVersion)
  // 锁定节点不挂 gizmo：锁定的语义就是「不可选中/不可动」
  const locked = useEditor((s) => (s.selectedId ? Boolean(s.nodes[s.selectedId]?.locked) : false))
  const scene = useThree((s) => s.scene)

  const target = useMemo(() => {
    if (!selectedId) return null
    // 用盒子包装：TS 的控制流分析无法追踪闭包内对 let 变量的赋值
    const box: { value: THREE.Object3D | null } = { value: null }
    scene.traverse((obj) => {
      if (!box.value && obj.userData.__nodeId === selectedId) box.value = obj
    })
    return box.value
  }, [selectedId, scene, structureVersion])

  if (!target || locked) return null

  return (
    <TransformControls
      object={target}
      mode={gizmoMode}
      size={0.75}
      onObjectChange={() => {
        if (!selectedId) return
        useEditor.getState().setTransform(selectedId, {
          position: [target.position.x, target.position.y, target.position.z],
          rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
          scale: [target.scale.x, target.scale.y, target.scale.z],
        })
      }}
    />
  )
}

// ---------------------------------------------------------------- AR 根

/**
 * AR 会话中，整个场景被挂到这个 group 上：
 * 先用平面检测（hit-test）把内容吸附到真实地面上，
 * 用户轻触屏幕后锁定位置。
 */
function ARRoot({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const arActive = useEditor((s) => s.arActive)
  const arScale = useEditor((s) => s.arScale)
  const gl = useThree((s) => s.gl)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    if (arActive) return
    setLocked(false)
    const group = ref.current
    if (group) {
      group.position.set(0, 0, 0)
      group.quaternion.identity()
      group.scale.set(1, 1, 1)
      group.visible = true
    }
  }, [arActive])

  useEffect(() => {
    if (!arActive) return
    const session = gl.xr.getSession()
    if (!session) return
    const onSelect = () => setLocked(true)
    session.addEventListener('select', onSelect)
    return () => session.removeEventListener('select', onSelect)
  }, [arActive, gl])

  useFrame(() => {
    const group = ref.current
    if (!arActive || !group) return

    // 把 GameRuntime 根节点也放进 AR 内容组，跟随平面检测一起吸附/锁定
    const runtimeRoot = engine.getRuntimeRoot()
    if (runtimeRoot && runtimeRoot.parent !== group) {
      group.add(runtimeRoot)
    }

    if (locked) return

    const matrix = engine.ar.pollHitTest(gl)
    if (!matrix) {
      group.visible = false
      return
    }

    group.visible = true
    group.matrix.fromArray(matrix)
    group.matrix.decompose(group.position, group.quaternion, group.scale)
    group.scale.multiplyScalar(arScale)
  })

  return <group ref={ref}>{children}</group>
}

// ---------------------------------------------------------------- 物理驱动

/** 播放模式下每帧推进脚本与物理世界；编辑态时是空转的 no-op */
function PlayTicker() {
  const playing = useEditor((s) => s.playing)
  const gl = useThree((s) => s.gl)

  // 输入采集：只在播放模式挂监听，编辑态的快捷键不受影响
  useEffect(() => {
    if (!playing) return
    const input = engine.play.scripts.input

    const updatePointer = (e: PointerEvent) => {
      const rect = gl?.domElement.getBoundingClientRect()
      if (!rect || rect.width === 0 || rect.height === 0) return
      input.pointer = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      }
    }

    const keyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      const key = e.key.toLowerCase()
      if (!input.keys.has(key)) input.pressed.add(key)
      input.keys.add(key)
    }
    const keyUp = (e: KeyboardEvent) => input.keys.delete(e.key.toLowerCase())
    const pointerMove = (e: PointerEvent) => updatePointer(e)
    const pointerDown = (e: PointerEvent) => {
      updatePointer(e)
      input.clicked = true
    }

    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerdown', pointerDown)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerdown', pointerDown)
      input.keys.clear()
      input.pressed.clear()
      input.pointer = null
      input.clicked = false
    }
  }, [playing])

  useFrame((_, delta) => {
    if (playing) engine.play.tick(engine, delta)
  })

  return null
}

// ---------------------------------------------------------------- 轨迹绘制

type Vec3Tuple = [number, number, number]

const MIN_SAMPLE_DIST = 0.08

/**
 * 画轨迹工具：激活时禁用相机控制，把指针在屏幕上的拖拽
 * 投射到 y=0 地面平面采样成点串，松手后提交给编辑器创建轨迹节点。
 */
function PathDrawTool({
  active,
  onCommit,
  onCancel,
}: {
  active: boolean
  onCommit: (points: Vec3Tuple[]) => void
  onCancel: () => void
}) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  // OrbitControls 用了 makeDefault，可从这里拿到实例以便绘制期间禁用
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const [points, setPoints] = useState<Vec3Tuple[]>([])
  const [drawing, setDrawing] = useState(false)
  const pointsRef = useRef<Vec3Tuple[]>([])
  pointsRef.current = points

  // 进入/退出绘制模式时清空笔迹
  useEffect(() => {
    if (active) {
      setPoints([])
      setDrawing(false)
    }
  }, [active])

  // 绘制期间锁相机 + 收集指针轨迹
  useEffect(() => {
    if (!active) return
    const dom = gl.domElement
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hit = new THREE.Vector3()
    let dragging = false

    if (controls) controls.enabled = false

    const toGround = (e: PointerEvent): Vec3Tuple | null => {
      const rect = dom.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(plane, hit)) return null
      return [hit.x, 0, hit.z]
    }

    const appendPoint = (pt: Vec3Tuple | null): boolean => {
      if (!pt) return false
      const current = pointsRef.current
      const last = current[current.length - 1]
      if (last) {
        const dx = pt[0] - last[0]
        const dz = pt[2] - last[2]
        // 距上一点太近的采样丢弃，避免点串过密
        if (dx * dx + dz * dz < MIN_SAMPLE_DIST * MIN_SAMPLE_DIST) return false
      }
      const next = [...current, pt]
      pointsRef.current = next
      setPoints(next)
      return true
    }

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      dragging = true
      setDrawing(true)
      appendPoint(toGround(e))
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      appendPoint(toGround(e))
    }
    const finish = () => {
      if (!dragging) return
      dragging = false
      setDrawing(false)
      const final = pointsRef.current
      if (final.length >= 2) {
        onCommit(final)
        setPoints([])
        pointsRef.current = []
      }
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }

    dom.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('keydown', key)
    return () => {
      if (controls) controls.enabled = true
      dom.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('keydown', key)
    }
  }, [active, gl, camera, controls, onCommit, onCancel])

  if (!active) return null

  return (
    <>
      {points.length >= 2 && <StrokeLine points={points} dashed={!drawing} />}
      {points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.03, 10, 8]} />
          <meshBasicMaterial color={i === points.length - 1 ? '#ffb74d' : '#7f77dd'} depthTest={false} />
        </mesh>
      ))}
    </>
  )
}

/** 绘制中的实时折线预览 */
function StrokeLine({ points, dashed }: { points: Vec3Tuple[]; dashed: boolean }) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(p[0], 0.01, p[2]))
    )
    const material = new THREE.LineBasicMaterial({ color: dashed ? '#ffb74d' : '#7f77dd', depthTest: false })
    return new THREE.Line(geometry, material)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points])

  useEffect(() => () => {
    line.geometry.dispose()
    ;(line.material as THREE.Material).dispose()
  }, [line])

  return <primitive object={line} />
}

// ---------------------------------------------------------------- 帧率

function FpsProbe({ onChange }: { onChange: (fps: number) => void }) {
  const frames = useRef(0)
  const last = useRef(performance.now())

  useFrame(() => {
    frames.current += 1
    const now = performance.now()
    if (now - last.current >= 500) {
      onChange(Math.round((frames.current * 1000) / (now - last.current)))
      frames.current = 0
      last.current = now
    }
  })

  return null
}

// ---------------------------------------------------------------- 无人机飞行视角

const FLY_EULER = new THREE.Euler(0, 0, 0, 'YXZ')
const FLY_FWD = new THREE.Vector3()
const FLY_RIGHT = new THREE.Vector3()
const FLY_DISP = new THREE.Vector3()

const FOCUS_SPHERE = new THREE.Sphere()
const FOCUS_BOX = new THREE.Box3()
const FOCUS_DIR = new THREE.Vector3()

/**
 * 点击层级节点 / 按 F 后，相机沿当前视线方向平滑飞到对象跟前：
 * 目标点 = 对象包围球中心，距离 = 按包围球半径与视场角推算（0.5~30m 夹紧）。
 */
function CameraFocus() {
  const focus = useEditor((s) => s.focusRequest)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null
  const anim = useRef<{
    t0: number
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromTgt: THREE.Vector3
    toTgt: THREE.Vector3
  } | null>(null)

  useEffect(() => {
    if (!focus || !camera) return
    const state = useEditor.getState()
    if (state.flyMode) state.setFlyMode(false)

    // 找节点对应的 3D 对象，取包围球；找不到（如泼溅未加载完）退回节点位置
    let object: THREE.Object3D | null = null
    const scene = engine.getScene()
    if (scene) {
      scene.traverse((o) => {
        if (!object && o.userData && (o.userData as { __nodeId?: string }).__nodeId === focus.id) {
          object = o
        }
      })
    }
    let target: THREE.Vector3 | null = null
    let radius = 0
    if (object) {
      FOCUS_BOX.setFromObject(object)
      if (!FOCUS_BOX.isEmpty()) {
        FOCUS_BOX.getBoundingSphere(FOCUS_SPHERE)
        target = FOCUS_SPHERE.center.clone()
        radius = FOCUS_SPHERE.radius
      }
    }
    if (!target) {
      const node = state.nodes[focus.id]
      if (!node) return
      target = new THREE.Vector3(...node.transform.position)
      radius = 0.8
    }

    // 沿「当前相机 → 当前轨道目标」方向推进，保持观察方位不变、不旋转视角
    const fromTgt = controls
      ? controls.target.clone()
      : camera.position.clone().addScaledVector(camera.getWorldDirection(FOCUS_DIR), 5)
    FOCUS_DIR.copy(camera.position).sub(fromTgt)
    if (FOCUS_DIR.lengthSq() < 1e-8) camera.getWorldDirection(FOCUS_DIR)
    if (FOCUS_DIR.lengthSq() < 1e-8) FOCUS_DIR.set(0, 0, 1)
    FOCUS_DIR.normalize()
    const fov = (((camera as THREE.PerspectiveCamera).fov || 50) * Math.PI) / 180
    const dist = THREE.MathUtils.clamp((radius / Math.tan(fov / 2)) * 1.25, 0.5, 30)
    const toPos = target.clone().addScaledVector(FOCUS_DIR, dist)

    anim.current = {
      t0: performance.now(),
      fromPos: camera.position.clone(),
      toPos,
      fromTgt,
      toTgt: target,
    }
  }, [focus, camera, controls])

  useFrame(() => {
    const a = anim.current
    if (!a || !controls) return
    const k = Math.min(1, (performance.now() - a.t0) / 450)
    const e = 1 - Math.pow(1 - k, 3) // ease-out cubic
    camera.position.lerpVectors(a.fromPos, a.toPos, e)
    controls.target.lerpVectors(a.fromTgt, a.toTgt, e)
    controls.update()
    if (k >= 1) anim.current = null
  })

  return null
}

/**
 * 无人机自由飞行（类 Supersplat 观赏模式）：
 * 拖拽转头 · WASD 平移 · Q/E 或 Space/Shift 升降 · 滚轮调速度 · Esc 退出。
 * 进入时禁用轨道控制；退出时把轨道目标放到相机前方，视角无跳变衔接。
 */
function FlyMode() {
  const active = useEditor((s) => s.flyMode)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as
    | { enabled: boolean; target: THREE.Vector3; update: () => void }
    | null

  const keys = useRef(new Set<string>())
  const look = useRef({ yaw: 0, pitch: 0 })
  const speed = useRef(3)
  const dragging = useRef(false)
  const orbitDist = useRef(5)

  useEffect(() => {
    if (!active) return
    if (controls) {
      orbitDist.current = THREE.MathUtils.clamp(controls.target.distanceTo(camera.position), 1, 60)
      controls.enabled = false
    }
    FLY_EULER.setFromQuaternion(camera.quaternion)
    look.current = { yaw: FLY_EULER.y, pitch: FLY_EULER.x }

    const dom = gl.domElement
    const clampPitch = (p: number) =>
      THREE.MathUtils.clamp(p, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01)

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      keys.current.add(e.key.toLowerCase())
      if (e.key === 'Escape') useEditor.getState().setFlyMode(false)
    }
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    const onPointerDown = () => {
      dragging.current = true
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return
      look.current.yaw -= e.movementX * 0.0024
      look.current.pitch = clampPitch(look.current.pitch - e.movementY * 0.0024)
    }
    const onPointerUp = () => {
      dragging.current = false
    }
    const onWheel = (e: WheelEvent) => {
      speed.current = THREE.MathUtils.clamp(speed.current * (e.deltaY < 0 ? 1.18 : 1 / 1.18), 0.3, 40)
    }
    const onBlur = () => keys.current.clear()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    dom.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    dom.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      dom.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      dom.removeEventListener('wheel', onWheel)
      window.removeEventListener('blur', onBlur)
      keys.current.clear()
      dragging.current = false
      if (controls) {
        // 退出飞行：把轨道目标放到相机前方（保持进入前的轨道距离），视角无缝切回
        FLY_FWD.set(0, 0, -1).applyQuaternion(camera.quaternion)
        controls.target.copy(camera.position).addScaledVector(FLY_FWD, orbitDist.current)
        controls.enabled = true
        controls.update()
      }
    }
  }, [active, gl, camera, controls])

  useFrame((_, delta) => {
    if (!active) return
    const dt = Math.min(delta, 0.05)
    camera.quaternion.setFromEuler(FLY_EULER.set(look.current.pitch, look.current.yaw, 0))

    const k = keys.current
    FLY_DISP.set(0, 0, 0)
    FLY_FWD.set(0, 0, -1).applyQuaternion(camera.quaternion)
    FLY_RIGHT.set(1, 0, 0).applyQuaternion(camera.quaternion)
    if (k.has('w')) FLY_DISP.add(FLY_FWD)
    if (k.has('s')) FLY_DISP.sub(FLY_FWD)
    if (k.has('d')) FLY_DISP.add(FLY_RIGHT)
    if (k.has('a')) FLY_DISP.sub(FLY_RIGHT)
    if (k.has('e') || k.has(' ')) FLY_DISP.y += 1
    if (k.has('q') || k.has('shift')) FLY_DISP.y -= 1
    if (FLY_DISP.lengthSq() > 0) {
      camera.position.addScaledVector(FLY_DISP.normalize(), speed.current * dt)
    }
  })

  return null
}

// ---------------------------------------------------------------- 场景内容

function SceneContent({
  onFps,
  pathDraw,
  onPathCommit,
  onPathCancel,
}: {
  onFps: (fps: number) => void
  pathDraw: boolean
  onPathCommit: (points: Vec3Tuple[]) => void
  onPathCancel: () => void
}) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const postfx = useEditor((s) => s.postfx)
  const showHelpers = useEditor((s) => s.showHelpers)
  const arActive = useEditor((s) => s.arActive)
  const qualityLevel = useEditor((s) => s.qualityLevel)
  const setDpr = useThree((s) => s.setDpr)

  useEffect(() => {
    engine.attachScene(scene)
    engine.attachRenderer(gl)
    engine.attachCamera(camera)
    return () => {
      engine.detachScene()
      engine.detachRenderer()
      engine.detachCamera()
    }
  }, [scene, gl, camera])

  // OrbitControls(makeDefault) 挂载后才会出现在 state 里，单独同步给引擎
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null
  useEffect(() => {
    engine.attachControls(controls)
    return () => engine.attachControls(null)
  }, [controls])

  useEffect(() => {
    // 色调映射统一由 renderer 层负责（AgX：高饱和色偏移最小，且响应 exposure）。
    // 之前用 postprocessing 的 AGX 效果接管，但该效果不读 exposure 参数，
    // 导致特效面板里的曝光滑杆完全无效——这是「场景调不亮」的根因。
    // 渲染器内置 tonemapping 成本可忽略，不再受画质档位白名单约束。
    gl.toneMapping = postfx.toneMapping.enabled ? THREE.AgXToneMapping : THREE.NoToneMapping
    gl.toneMappingExposure = postfx.toneMapping.exposure
  }, [gl, postfx.toneMapping.enabled, postfx.toneMapping.exposure])

  // 画质档位变化时同步渲染分辨率与阴影
  useEffect(() => {
    const preset = getQualityPreset(qualityLevel)
    // DPR 要钳制在档位区间内，但绝不超过物理像素比。
    // 之前在 1x 显示器上也强制按 2x 渲染（4 倍像素），是「放大就掉帧」的主因之一。
    const deviceDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const targetDpr = Math.min(Math.max(deviceDpr, preset.dpr[0]), preset.dpr[1])
    setDpr(targetDpr)

    if (gl.shadowMap.enabled !== preset.shadows) {
      gl.shadowMap.enabled = preset.shadows
      gl.shadowMap.needsUpdate = true
      // 阴影开关会影响 shader 里的 define，改完必须让材质重新编译
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh) return
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const material of materials) {
          if (material) material.needsUpdate = true
        }
      })
    }
  }, [qualityLevel, gl, scene, setDpr])

  return (
    <>
      <color attach="background" args={[arActive ? '#00000000' : '#17181f']} />
      <ProceduralEnvironment />

      <ARRoot>
        <SceneTree />
      </ARRoot>

      {showHelpers && !arActive && (
        <Grid
          position={[0, -0.002, 0]}
          args={[40, 40]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#2c2c38"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#46465a"
          fadeDistance={45}
          fadeStrength={1.2}
          infiniteGrid
        />
      )}

      {!arActive && (
        <>
          <SelectionGizmo />
          <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI * 0.495} />
        </>
      )}

      <Effects />
      <PlayTicker />
      <FpsProbe onChange={onFps} />
      <FlyMode />
      <CameraFocus />
      <PathDrawTool active={pathDraw} onCommit={onPathCommit} onCancel={onPathCancel} />
    </>
  )
}

// ---------------------------------------------------------------- 游戏 HUD

function GameHudOverlay() {
  const hud = useSyncExternalStore(engine.hud.subscribe, engine.hud.getState)
  if (!hud.visible) return null
  return (
    <div className="game-hud">
      <div className="game-hud-top">
        <span>
          <Icon name="sun" size={11} /> {Math.round(hud.sun)}
        </span>
        <span>波次 {hud.wave}</span>
        <span>敌人 {hud.zombies}</span>
        <span className="game-hud-selected">{hud.selected}</span>
      </div>
      {hud.message && <div className="game-hud-message">{hud.message}</div>}
      <div className="game-hud-controls">点击屏幕交互 · HUD 由游戏运行时驱动</div>
      {hud.over && <div className="game-hud-over">游戏结束</div>}
    </div>
  )
}

// ---------------------------------------------------------------- 视口

export function Viewport() {
  const gizmoMode = useEditor((s) => s.gizmoMode)
  const setGizmoMode = useEditor((s) => s.setGizmoMode)
  const showHelpers = useEditor((s) => s.showHelpers)
  const setShowHelpers = useEditor((s) => s.setShowHelpers)
  const select = useEditor((s) => s.select)
  const arActive = useEditor((s) => s.arActive)
  const qualityLevel = useEditor((s) => s.qualityLevel)
  const flyMode = useEditor((s) => s.flyMode)
  const setFlyMode = useEditor((s) => s.setFlyMode)
  const [fps, setFps] = useState(0)
  const [drawPath, setDrawPath] = useState(false)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // 右键按下位置：OrbitControls 右键拖拽是平移视角，位移 <5px 才算右键「点击」
  const rightDownPos = useRef<{ x: number; y: number } | null>(null)

  // 状态栏显示画质档位实际应用的 DPR（与 SceneContent 里 setDpr 的钳制逻辑一致），
  // 而不是物理 devicePixelRatio —— 1x 显示器上高档位也不会超过 1
  const deviceDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const dprRange = getQualityPreset(qualityLevel).dpr
  const appliedDpr = Math.round(Math.min(Math.max(deviceDpr, dprRange[0]), dprRange[1]) * 10) / 10

  // 帧率同时上报给引擎，画质插件据此判断是否要降档
  const handleFps = useCallback((value: number) => {
    setFps(value)
    engine.bus.emit('quality:fps', { fps: value })
  }, [])

  // 画完一笔提交给编辑器创建轨迹节点，并退出绘制模式
  const commitPath = useCallback((points: Vec3Tuple[]) => {
    useEditor.getState().addPathNode(points)
    setDrawPath(false)
  }, [])
  const cancelPath = useCallback(() => setDrawPath(false), [])

  /**
   * 视口右键点击（非拖拽）：
   * 命中场景节点 → 节点操作菜单；点空 → 在地面点击处「添加物体」菜单。
   */
  const openViewportMenu = useCallback((e: React.PointerEvent) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const u = (e.clientX - rect.left) / rect.width
    const v = (e.clientY - rect.top) / rect.height
    if (u < 0 || u > 1 || v < 0 || v > 1) return

    // pick 只打带 __nodeId 标记的内容根，Grid/gizmo 等辅助对象不会命中
    const hits = engine.pick(u * 2 - 1, -(v * 2 - 1))
    let nodeId: string | null = null
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object
      while (obj) {
        const id = (obj.userData as { __nodeId?: string }).__nodeId
        if (id && useEditor.getState().nodes[id]) {
          nodeId = id
          break
        }
        obj = obj.parent
      }
      if (nodeId) break
    }

    if (nodeId) {
      useEditor.getState().select(nodeId)
      setMenu({ x: e.clientX, y: e.clientY, items: buildNodeMenu(nodeId) })
    } else {
      const ground = engine.screenToGround(u, v)
      const position: [number, number, number] = ground ? [ground.x, 0, ground.z] : [0, 0, 0]
      setMenu({ x: e.clientX, y: e.clientY, items: buildCreateObjectMenu({ kind: 'ground', position }) })
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="viewport"
      onPointerDown={(e) => {
        if (e.button === 2) rightDownPos.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={(e) => {
        if (e.button !== 2 || !rightDownPos.current) return
        const dx = e.clientX - rightDownPos.current.x
        const dy = e.clientY - rightDownPos.current.y
        rightDownPos.current = null
        // 位移 >= 5px 视为平移拖拽；飞行/画轨迹/AR 模式下不弹菜单
        if (dx * dx + dy * dy >= 25) return
        if (flyMode || drawPath || arActive) return
        openViewportMenu(e)
      }}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => {
        // 只接受资产库卡片拖拽（自定义 MIME），OS 文件等其他拖拽不拦截
        if (e.dataTransfer.types.includes('application/x-xr-asset')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(e) => {
        const assetId = e.dataTransfer.getData('application/x-xr-asset')
        if (!assetId) return
        e.preventDefault()
        const asset = engine.assets.get(assetId)
        // 贴图 / HDRI / 音频没有场景实体，只有模型类资产响应 drop
        if (!asset || asset.kind !== 'model' || asset.meta.missing) return
        const container = containerRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return
        const u = (e.clientX - rect.left) / rect.width
        const v = (e.clientY - rect.top) / rect.height
        const result = engine.commands.execute({ op: 'addModelNode', assetId })
        if (!result.ok || !result.nodeId) return
        // 落点换算成地面坐标；射线打不到地面（相机朝天）时回退原点
        const ground = engine.screenToGround(u, v)
        engine.graph.setTransform(result.nodeId, {
          position: ground ? [ground.x, 0, ground.z] : [0, 0, 0],
        })
        useEditor.getState().select(result.nodeId)
      }}
    >
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        camera={{ position: [5, 3.5, 6], fov: 45, near: 0.1, far: 400 }}
        onPointerMissed={() => select(null)}
      >
        <SceneContent
          onFps={handleFps}
          pathDraw={drawPath}
          onPathCommit={commitPath}
          onPathCancel={cancelPath}
        />
      </Canvas>

      {!arActive && (
        <div className="viewport-overlay">
          <div className="btn-group">
            <button
              className={`btn${gizmoMode === 'translate' ? ' active' : ''}`}
              onClick={() => setGizmoMode('translate')}
              title="移动 (W)"
            >
              移动
            </button>
            <button
              className={`btn${gizmoMode === 'rotate' ? ' active' : ''}`}
              onClick={() => setGizmoMode('rotate')}
              title="旋转 (E)"
            >
              旋转
            </button>
            <button
              className={`btn${gizmoMode === 'scale' ? ' active' : ''}`}
              onClick={() => setGizmoMode('scale')}
              title="缩放 (R)"
            >
              缩放
            </button>
          </div>
          <button
            className={`btn${showHelpers ? ' active' : ''}`}
            onClick={() => setShowHelpers(!showHelpers)}
          >
            辅助线
          </button>
          <button
            className={`btn${drawPath ? ' active' : ''}`}
            onClick={() => setDrawPath(!drawPath)}
            title="在地面上画一条轨迹，然后选中物体，在右侧「轨迹跟随」里关联它"
          >
            画轨迹
          </button>
          <button
            className={`btn${flyMode ? ' active' : ''}`}
            onClick={() => setFlyMode(!flyMode)}
            title="无人机自由飞行：WASD 移动 · 拖拽转头 · Q/E 升降 · 滚轮调速 · Esc 退出"
          >
            <Icon name="plane" size={12} /> 飞行
          </button>
        </div>
      )}

      {arActive && <div className="ar-badge">AR 会话进行中 · 轻触屏幕放置</div>}

      <GameHudOverlay />

      <div className="viewport-stats">
        {fps} FPS · {QUALITY_LABEL[qualityLevel]} · DPR {appliedDpr}
      </div>

      {!arActive && (
        <div className="viewport-hint">
          {drawPath
            ? '按住左键在地面画轨迹 · 松手提交 · Esc 取消'
            : flyMode
              ? '拖拽转头 · WASD 移动 · Q/E 升降 · 滚轮调速度 · Esc 退出'
              : '左键旋转 · 右键平移 · 右键点击弹菜单 · 滚轮缩放'}
        </div>
      )}

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  )
}
