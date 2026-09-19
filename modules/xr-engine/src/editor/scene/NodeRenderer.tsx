import { Outlines } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { DropInViewer, SceneFormat } from '@mkkellogg/gaussian-splats-3d'
import type { LoadedModel } from '@/engine/assets/loader'
import { loadModelFile } from '@/engine/assets/loader'
import { createBlackHoleMaterial, createDissolveMaterial, createEnergyBallMaterial, createHologramMaterial, createShockwaveMaterial, updateShaderTime } from '@/engine/effects/shaderEffects'
import { createBlackHoleEffect, createEnergyBallEffect, updateAdvancedEffectProperties } from '@/engine/effects/advancedEffects'
import type { GeometryKind, MaterialProps, SceneNode } from '@/engine/core/types'
import { useEditor } from '@/editor/store'
import { ParticleField } from './ParticleField'
import { disposeLoadedModel } from './dispose'
import type { IconName } from '@/editor/ui/Icon'

function buildGeometry(kind: GeometryKind, p: Record<string, number>): THREE.BufferGeometry {
  switch (kind) {
    case 'box':
      return new THREE.BoxGeometry(
        p.width,
        p.height,
        p.depth,
        p.widthSegments,
        p.heightSegments,
        p.depthSegments
      )
    case 'sphere':
      return new THREE.SphereGeometry(p.radius, p.widthSegments, p.heightSegments)
    case 'plane':
      return new THREE.PlaneGeometry(p.width, p.height, p.widthSegments, p.heightSegments)
    case 'cylinder':
      return new THREE.CylinderGeometry(
        p.radiusTop,
        p.radiusBottom,
        p.height,
        p.radialSegments
      )
    case 'cone':
      return new THREE.ConeGeometry(p.radius, p.height, p.radialSegments)
    case 'torus':
      return new THREE.TorusGeometry(p.radius, p.tube, p.radialSegments, p.tubularSegments)
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(p.radius, p.detail)
    default:
      return new THREE.BoxGeometry(1, 1, 1)
  }
}

// ---------------------------------------------------------------- 模型节点

function ModelNode({
  uri,
  assetName,
  activeAnimation,
  animationSpeed,
  normalizeModel,
  castShadow,
  receiveShadow,
}: {
  uri: string
  assetName: string
  activeAnimation: string | null
  animationSpeed: number
  normalizeModel: boolean
  castShadow: boolean
  receiveShadow: boolean
}) {
  const gl = useThree((s) => s.gl)
  const [model, setModel] = useState<LoadedModel | null>(null)

  useEffect(() => {
    let cancelled = false
    let loaded: LoadedModel | null = null
    loadModelFile(uri, assetName, gl)
      .then((result) => {
        if (cancelled) {
          // 卸载/换 uri 之后才加载完成：直接释放，别滞留在 GPU 里
          disposeLoadedModel(result.scene)
          return
        }
        loaded = result
        setModel(result)
      })
      .catch((err) => console.error('[ModelNode] 加载失败', uri, err))
    return () => {
      cancelled = true
      // 换 uri / 卸载：释放旧模型的几何体、材质与自带贴图
      if (loaded) disposeLoadedModel(loaded.scene)
      loaded = null
      setModel(null)
    }
  }, [uri, assetName, gl])

  // 每个 ModelNode 都会用 loadModelFile 独立加载一份 scene，无需 clone。
  // 注意：不能对带蒙皮动画的模型调用 clone(true) —— SkinnedMesh.copy() 共享 skeleton，
  // 而 Object3D.clone(true) 只会复制出「孤儿骨骼」，导致 mixer 动画的是克隆骨骼、
  // 网格却仍引用原始骨骼，最终骨骼动画完全不生效（模型静止）。
  const rawScene = useMemo(() => model?.scene ?? null, [model])

  // 自动归一化：缩放到 1 米基准 + 脚底贴地 + 水平居中（算法同 normalizeModelToGround）。
  // 变换作用在外层 wrapper 上而不是改 rawScene —— 原地改缩放是不可逆的，
  // 关掉开关后模型会滞留在被改过的尺寸上（蒙皮模型又不能 clone，见上面的注释）。
  const scene = useMemo(() => {
    if (!rawScene) return null
    if (!normalizeModel) return rawScene
    rawScene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(rawScene)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim <= 0) return rawScene
    const wrapper = new THREE.Group()
    wrapper.add(rawScene)
    wrapper.scale.setScalar(1 / maxDim)
    wrapper.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(wrapper)
    wrapper.position.x -= (fitted.min.x + fitted.max.x) / 2
    wrapper.position.z -= (fitted.min.z + fitted.max.z) / 2
    wrapper.position.y -= fitted.min.y
    return wrapper
  }, [rawScene, normalizeModel])

  useEffect(() => {
    if (!scene) return
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = castShadow
        mesh.receiveShadow = receiveShadow
      }
    })
  }, [scene, castShadow, receiveShadow])

  const mixer = useMemo(() => {
    if (!model || !scene || !model.animations.length) return null
    return new THREE.AnimationMixer(scene)
  }, [model, scene])

  useEffect(() => {
    if (!mixer || !model || !activeAnimation) return
    const clip = THREE.AnimationClip.findByName(model.animations, activeAnimation)
    if (!clip) return
    const action = mixer.clipAction(clip)
    action.reset().fadeIn(0.25).play()
    return () => {
      action.fadeOut(0.2).stop()
    }
  }, [mixer, model, activeAnimation])

  useFrame((_, delta) => {
    if (mixer) mixer.timeScale = animationSpeed
    mixer?.update(delta)
  })

  if (!scene) return null
  return <primitive object={scene} />
}

// ---------------------------------------------------------------- 高斯泼溅节点

/**
 * 高斯泼溅渲染体（3D Gaussian Splatting）。
 * 用 @mkkellogg/gaussian-splats-3d 的 DropInViewer 以「普通 THREE.Group」
 * 的形式嵌入现有场景图——不接管渲染循环，R3F 的 render/postfx 全部照常工作。
 * 支持格式：INRIA binary PLY（真实扫描件）、.splat / .ksplat / .spz。
 *
 * 注意：
 * - sharedMemoryForWorkers 必须为 false：页面没有 COOP/COEP 头，SharedArrayBuffer 不可用
 * - splatScale / minAlpha 在加载时生效，改动会重新加载场景（真实 PLY 可能上百 MB）
 */
function GaussianSplatBody({ uri, assetName, splatScale, minAlpha }: { uri: string; assetName: string; splatScale: number; minAlpha: number }) {
  const [viewer, setViewer] = useState<DropInViewer | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    const v = new DropInViewer({
      gpuAcceleratedSort: false, // CPU 桶排更稳，避免个别驱动上的 GPU 排序伪影
      sharedMemoryForWorkers: false,
      dynamicScene: false,
    })
    // 库靠 URL 扩展名猜格式，blob: URL 没有扩展名会直接抛
    // 「File format not supported」——用资产文件名推断并显式传入 format。
    const ext = (assetName || uri).split('.').pop()?.toLowerCase() ?? ''
    const format =
      ext === 'ply' ? SceneFormat.Ply
      : ext === 'splat' ? SceneFormat.Splat
      : ext === 'ksplat' ? SceneFormat.KSplat
      : ext === 'spz' ? SceneFormat.Spz
      : undefined
    let promise: (Promise<unknown> & { abort?: () => void }) | null = null
    try {
      const p = v.addSplatScene(uri, {
        showLoadingUI: false,
        progressiveLoad: false,
        format,
        splatAlphaRemovalThreshold: Math.max(1, Math.round(THREE.MathUtils.clamp(minAlpha, 0, 1) * 255)),
        scale: [splatScale, splatScale, splatScale],
      }) as Promise<unknown> & { abort?: () => void }
      promise = p
      void p
        .then(() => {
          if (!cancelled) setStatus('ready')
        })
        .catch((err) => {
          console.error('[高斯泼溅] 加载失败', uri, err)
          if (!cancelled) setStatus('error')
        })
    } catch (err) {
      console.error('[高斯泼溅] 场景创建失败', uri, err)
      setStatus('error')
    }
    setViewer(v)
    return () => {
      cancelled = true
      try {
        promise?.abort?.()
      } catch {
        /* 已完成的 promise 无法中止，忽略 */
      }
      void v.dispose()
    }
  }, [uri, assetName, splatScale, minAlpha])

  if (!viewer) return null

  // 加载中/失败给一个可见的占位盒，同时提供点击选中的 raycast 目标
  if (status !== 'ready') {
    return (
      <mesh visible>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color={status === 'loading' ? '#4a72d8' : '#d84a4a'}
          wireframe
          transparent
          opacity={0.5}
        />
      </mesh>
    )
  }

  // DropInViewer 自带的 callbackMesh（不可见球体）参与 raycast，
  // 点击泼溅区域附近即可选中该节点（由父级 group 的 onClick 处理）
  return <primitive object={viewer} />
}

// ---------------------------------------------------------------- 节点渲染

const NODE_ICON: Record<SceneNode['type'], IconName> = {
  group: 'layers',
  mesh: 'box',
  light: 'sun',
  model: 'package',
  particle: 'sparkle',
  'gaussian-splat': 'cloud',
}

export { NODE_ICON }


// ---------------------------------------------------------------- 贴图缓存

/**
 * 模块级共享贴图缓存：N 个节点引用同一张贴图只加载/上传一份 GPU 纹理。
 * 引用计数归零立即 dispose 并移出缓存（贴图更换频繁，滞留显存比缓存命中更要紧）。
 * key 带色彩空间前缀：同一张图作 sRGB 颜色贴图与 linear 数据贴图是两份不同上传。
 */
interface TextureCacheEntry {
  refs: number
  texture: THREE.Texture | null
  failed: boolean
  listeners: Set<(t: THREE.Texture | null) => void>
}

const textureCache = new Map<string, TextureCacheEntry>()

function acquireTexture(
  uri: string,
  srgb: boolean,
  onReady: (t: THREE.Texture | null) => void
): () => void {
  const key = `${srgb ? 'srgb' : 'linear'}:${uri}`
  let entry = textureCache.get(key)
  if (!entry) {
    entry = { refs: 0, texture: null, failed: false, listeners: new Set() }
    textureCache.set(key, entry)
    new THREE.TextureLoader().load(
      uri,
      (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
        t.wrapS = THREE.RepeatWrapping
        t.wrapT = THREE.RepeatWrapping
        t.anisotropy = 4
        if (entry!.refs === 0) {
          // 加载完成前所有使用者都已卸载/换图：直接释放，不进缓存
          t.dispose()
          if (textureCache.get(key) === entry) textureCache.delete(key)
          return
        }
        entry!.texture = t
        entry!.listeners.forEach((fn) => fn(t))
      },
      undefined,
      () => {
        entry!.failed = true
        entry!.listeners.forEach((fn) => fn(null))
      }
    )
  }
  entry.refs += 1
  if (entry.texture) onReady(entry.texture)
  else if (entry.failed) onReady(null)
  else entry.listeners.add(onReady)
  return () => {
    entry!.refs -= 1
    entry!.listeners.delete(onReady)
    if (entry!.refs <= 0) {
      if (textureCache.get(key) === entry) textureCache.delete(key)
      entry!.texture?.dispose()
    }
  }
}

/** 按资产 id 取共享纹理，组件卸载/换图时自动释放引用 */
function useTextureSlot(assetId: string | null | undefined, srgb = true): THREE.Texture | null {
  const assets = useEditor((s) => s.assets)
  const uri = assetId ? assets.find((a) => a.id === assetId && a.kind === 'texture')?.uri ?? null : null
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!uri) {
      setTexture(null)
      return
    }
    return acquireTexture(uri, srgb, setTexture)
  }, [uri, srgb])

  return texture
}

function MeshBody({ node, selected }: { node: SceneNode; selected: boolean }) {
  const props = node.props
  if (props.kind !== 'mesh') return null

  const key = JSON.stringify(props.geometryParams)
  const geometry = useMemo(
    () => buildGeometry(props.geometry, props.geometryParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.geometry, key]
  )

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = props.material as MaterialProps
  const map = useTextureSlot(material.map, true)
  const roughnessMap = useTextureSlot(material.roughnessMap, false)
  const metalnessMap = useTextureSlot(material.metalnessMap, false)
  const normalMap = useTextureSlot(material.normalMap, false)
  const emissiveMap = useTextureSlot(material.emissiveMap, true)
  const aoMap = useTextureSlot(material.aoMap, false)

  const advancedFx = useMemo(() => {
    if (props.effect === 'blackhole' || props.effect === 'black-hole') return createBlackHoleEffect()
    if (props.effect === 'energy' || props.effect === 'energy-ball') return createEnergyBallEffect()
    return null
  }, [props.effect])

  useEffect(() => () => {
    advancedFx?.traverse((obj) => {
      const anyObj = obj as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material }
      anyObj.geometry?.dispose?.()
      anyObj.material?.dispose?.()
    })
  }, [advancedFx])

  // 轻量 shader 特效：直接换当前网格的材质（兼容连字符/下划线别名）
  const shaderFxMaterial = useMemo(() => {
    if (props.effect === 'dissolve' || props.effect === 'dis-solve' || props.effect === 'dis_solve') return createDissolveMaterial()
    if (props.effect === 'hologram' || props.effect === 'holo-gram' || props.effect === 'holo_gram') return createHologramMaterial()
    if (props.effect === 'shockwave' || props.effect === 'shock-wave' || props.effect === 'shock_wave') return createShockwaveMaterial()
    return null
  }, [props.effect])

  useEffect(() => () => shaderFxMaterial?.dispose(), [shaderFxMaterial])

  // 改颜色实时生效：uColor 跟随材质颜色（同 energy/blackhole 的同步方式）
  useEffect(() => {
    if (!shaderFxMaterial || !material.color) return
    ;(shaderFxMaterial.uniforms.uColor.value as THREE.Color).set(material.color)
  }, [shaderFxMaterial, material.color])

  // 注意：所有 hooked 都必须在任何提前 return 之前调用，否则切换特效时
  // 会因 hook 数量变化触发 “Rendered more hooks than during the previous render”。
  const customShader = props.customShader as { vertex?: string; fragment?: string; uniforms?: Record<string, unknown> } | undefined
  // 材质只在 shader 源码变化时重建；uniforms 走下面的命令式同步，
  // 否则调任意一个材质滑杆都会重建 ShaderMaterial、触发整链重编译
  const customMaterial = useMemo(() => {
    if (!customShader?.vertex || !customShader?.fragment) return null
    return new THREE.ShaderMaterial({
      vertexShader: customShader.vertex,
      fragmentShader: customShader.fragment,
      uniforms: Object.fromEntries(
        Object.entries(customShader.uniforms ?? {}).map(([k, v]) => [k, { value: v }])
      ),
      transparent: true,
      depthWrite: false,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customShader?.vertex, customShader?.fragment])

  useEffect(() => () => customMaterial?.dispose(), [customMaterial])

  // uniforms 命令式同步：只改 value，不重建材质
  useEffect(() => {
    if (!customMaterial) return
    for (const [k, v] of Object.entries(customShader?.uniforms ?? {})) {
      if (k in customMaterial.uniforms) customMaterial.uniforms[k].value = v
      else customMaterial.uniforms[k] = { value: v }
    }
  }, [customMaterial, customShader?.uniforms])

  useFrame((state) => {
    if (advancedFx) {
      updateShaderTime(advancedFx, state.clock.elapsedTime)
      updateAdvancedEffectProperties(advancedFx, props as unknown as Record<string, unknown>)
    }
    if (shaderFxMaterial) {
      shaderFxMaterial.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  if (advancedFx) {
    return <primitive object={advancedFx} />
  }

  if (shaderFxMaterial) {
    return (
      <mesh geometry={geometry} material={shaderFxMaterial} castShadow={props.castShadow} receiveShadow={props.receiveShadow}>
        {selected && <Outlines thickness={3.5} color="#7f77dd" />}
      </mesh>
    )
  }

  if (customMaterial) {
    return (
      <mesh geometry={geometry} material={customMaterial} castShadow={props.castShadow} receiveShadow={props.receiveShadow}>
        {selected && <Outlines thickness={3.5} color="#7f77dd" />}
      </mesh>
    )
  }

  return (
    <mesh geometry={geometry} castShadow={props.castShadow} receiveShadow={props.receiveShadow}>
      <meshStandardMaterial
        color={material.color}
        metalness={material.metalness}
        roughness={material.roughness}
        emissive={material.emissive}
        emissiveIntensity={material.emissiveIntensity}
        wireframe={material.wireframe}
        flatShading={material.flatShading}
        transparent={material.opacity < 1}
        opacity={material.opacity}
        map={map ?? undefined}
        roughnessMap={roughnessMap ?? undefined}
        metalnessMap={metalnessMap ?? undefined}
        normalMap={normalMap ?? undefined}
        emissiveMap={emissiveMap ?? undefined}
        aoMap={aoMap ?? undefined}
      />
      {selected && <Outlines thickness={3.5} color="#7f77dd" />}
    </mesh>
  )
}

// ---------------------------------------------------------------- 轨迹组件（path / pathFollow）

/** 数据组件统一取用：components 存在任意节点 props 上，Web 与微信运行时共用 */
function getComponents(node: SceneNode): Record<string, unknown>[] {
  const raw = (node.props as { components?: unknown }).components
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []
}

interface PathComponent {
  type: 'path'
  points: [number, number, number][]
  /** 闭环：末点连回起点（隐含一个「闭合段」） */
  closed?: boolean
  /** 假线段索引：角色不走路，走到段首直接瞬移到段尾（如圆环缺口的闭环） */
  ghost?: number[]
}

export interface PathFollowComponent {
  type: 'pathFollow'
  pathId?: string | null
  /** 直接内嵌点集（微信导出时优先内嵌，免查节点） */
  points?: [number, number, number][]
  /** 走完一圈的秒数 */
  duration?: number
  /** loop = 到终点瞬回起点；pingpong = 到终点反向走回；once = 走到尽头停下 */
  loop?: 'loop' | 'pingpong' | 'once'
  /** 面向行进方向（人物沿轨迹转弯），默认开启 */
  faceDirection?: boolean
  /** 点集坐标系：false/缺省 = 世界坐标（地面画线）；true = 父级局部坐标（嵌套轨道） */
  local?: boolean
}

// ---------------- 统一轨迹采样（与 wxar-runtime.js 的 ES5 实现逐字对齐） ----------------
// 真线段：角色沿 centripetal Catmull-Rom 平滑行走；假线段：零时间瞬移跳板。
// 时间线只由真线段的弦长构成，假线段天然「闪现」跨过。

interface CrSeg {
  p0: number[]; p1: number[]; p2: number[]; p3: number[]
  k1: number; k2: number; k3: number; len: number
}
interface CrCurve { pts: number[][]; segs: CrSeg[]; cum: number[]; totalLen: number }
interface PathRun { curve: CrCurve; len: number; dStart: number }
interface PathRuntime { runs: PathRun[]; totalReal: number }

function buildCatmullRomRaw(ptsIn: number[][], closed: boolean): CrCurve | null {
  const pts3: number[][] = []
  for (const p of ptsIn) {
    if (p && p.length >= 3) pts3.push([Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0])
  }
  if (pts3.length < 2) return null
  const n = pts3.length
  const segCount = closed ? n : n - 1
  const segs: CrSeg[] = []
  let totalLen = 0
  for (let s = 0; s < segCount; s++) {
    let p0 = pts3[(s - 1 + n) % n]
    const p1 = pts3[s % n]
    const p2 = pts3[(s + 1) % n]
    let p3 = pts3[(s + 2) % n]
    if (!closed) {
      if (s === 0) p0 = p1
      if (s === segCount - 1) p3 = p2
    }
    // centripetal: 用弦长的平方根作为节点间距，避免自相交环路
    const d1 = Math.sqrt(Math.pow(p1[0] - p0[0], 2) + Math.pow(p1[1] - p0[1], 2) + Math.pow(p1[2] - p0[2], 2))
    const d2 = Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2) + Math.pow(p2[2] - p1[2], 2))
    const d3 = Math.sqrt(Math.pow(p3[0] - p2[0], 2) + Math.pow(p3[1] - p2[1], 2) + Math.pow(p3[2] - p2[2], 2))
    const k1 = Math.pow(d1, 0.5)
    const k2 = k1 + Math.pow(d2, 0.5)
    const k3 = k2 + Math.pow(d3, 0.5)
    segs.push({ p0, p1, p2, p3, k1, k2, k3, len: d2 })
    totalLen += d2
  }
  const cum: number[] = []
  let acc = 0
  for (const s2 of segs) {
    acc += s2.len
    cum.push(acc / Math.max(0.0001, totalLen))
  }
  return { pts: pts3, segs, cum, totalLen }
}

function sampleCatmullRomRaw(curve: CrCurve, t: number): number[] | null {
  if (!curve || !curve.segs || !curve.segs.length) return null
  const cum = curve.cum
  let idx = 0
  let local = 0
  if (t >= 1) {
    idx = curve.segs.length - 1
    local = 1
  } else {
    while (idx < cum.length - 1 && t > cum[idx]) idx++
    const lo = idx > 0 ? cum[idx - 1] : 0
    const hi = cum[idx]
    local = hi - lo > 1e-6 ? (t - lo) / (hi - lo) : 0
  }
  const seg = curve.segs[idx]
  const u = seg.k1 + local * (seg.k2 - seg.k1)
  const b1 = ((seg.k2 - u) / seg.k2) * seg.p0[0] + (u / seg.k2) * seg.p1[0]
  const b1y = ((seg.k2 - u) / seg.k2) * seg.p0[1] + (u / seg.k2) * seg.p1[1]
  const b1z = ((seg.k2 - u) / seg.k2) * seg.p0[2] + (u / seg.k2) * seg.p1[2]
  const b2 = ((seg.k3 - u) / (seg.k3 - seg.k1)) * seg.p1[0] + ((u - seg.k1) / (seg.k3 - seg.k1)) * seg.p2[0]
  const b2y = ((seg.k3 - u) / (seg.k3 - seg.k1)) * seg.p1[1] + ((u - seg.k1) / (seg.k3 - seg.k1)) * seg.p2[1]
  const b2z = ((seg.k3 - u) / (seg.k3 - seg.k1)) * seg.p1[2] + ((u - seg.k1) / (seg.k3 - seg.k1)) * seg.p2[2]
  const w1 = (seg.k2 - u) / (seg.k2 - seg.k1)
  const w2 = (u - seg.k1) / (seg.k2 - seg.k1)
  return [w1 * b1 + w2 * b2, w1 * b1y + w2 * b2y, w1 * b1z + w2 * b2z]
}

/** 把 path 组件编译成「真线 run 时间线 + 假线瞬移」运行时 */
function buildPathRuntime(comp: PathComponent): PathRuntime | null {
  const pts: number[][] = []
  for (const p of comp.points || []) {
    if (Array.isArray(p) && p.length === 3 && p.every((v) => Number.isFinite(v))) pts.push([p[0], p[1], p[2]])
  }
  if (pts.length < 2) return null
  const n = pts.length
  const closed = Boolean(comp.closed) && n >= 3
  const segCount = closed ? n : n - 1
  const ghost = new Set<number>(Array.isArray(comp.ghost) ? comp.ghost : [])

  // 连续真线段串成链；假线段是链之间的瞬移跳板
  const chains: number[][] = []
  let cur: number[] = []
  for (let s = 0; s < segCount; s++) {
    if (ghost.has(s)) {
      if (cur.length) chains.push(cur)
      cur = []
    } else {
      cur.push(s)
    }
  }
  if (cur.length) chains.push(cur)
  if (!chains.length) return null

  let runsRaw: { pts: number[][]; closed: boolean }[]
  if (closed && ghost.size === 0) {
    // 闭环且全部是真线：单条闭合曲线（接缝圆滑，保持旧行为）
    runsRaw = [{ pts, closed: true }]
  } else {
    runsRaw = []
    for (const chain of chains) {
      const rp: number[][] = [pts[chain[0]]]
      for (const s of chain) rp.push(s === n - 1 ? pts[0] : pts[s + 1])
      runsRaw.push({ pts: rp, closed: false })
    }
  }

  const runs: PathRun[] = []
  let dStart = 0
  for (const raw of runsRaw) {
    const curve = buildCatmullRomRaw(raw.pts, raw.closed)
    if (!curve || !(curve.totalLen > 0)) continue
    runs.push({ curve, len: curve.totalLen, dStart })
    dStart += curve.totalLen
  }
  if (!runs.length) return null
  return { runs, totalReal: dStart }
}

/** 按弧长距离采样：真线段内插值，假线段零长度天然跳过（瞬移） */
function samplePathDistance(rt: PathRuntime, dIn: number): number[] | null {
  if (!rt || !rt.runs.length) return null
  if (!(rt.totalReal > 1e-9)) {
    const c0 = rt.runs[0].curve
    return [c0.pts[0][0], c0.pts[0][1], c0.pts[0][2]]
  }
  const d = Math.min(rt.totalReal, Math.max(0, dIn))
  for (let i = 0; i < rt.runs.length; i++) {
    const run = rt.runs[i]
    if (d <= run.dStart + run.len || i === rt.runs.length - 1) {
      const local = run.len > 1e-9 ? Math.min(1, Math.max(0, (d - run.dStart) / run.len)) : 0
      return sampleCatmullRomRaw(run.curve, local)
    }
  }
  return null
}

/** 轨迹线渲染：真线段画平滑实线，假线段画黄色虚线（瞬移段） */
function PathLineBody({ comp }: { comp: PathComponent }) {
  const objects = useMemo(() => {
    const rt = buildPathRuntime(comp)
    if (!rt) return null
    const list: THREE.Object3D[] = []
    // 真线：逐 run 采样成 LineSegments（跨假线的位置跳变不会产生连线伪影）
    const realMat = new THREE.LineBasicMaterial({ color: '#7f77dd', depthTest: false, transparent: true, opacity: 0.95 })
    const realPositions: number[] = []
    for (const run of rt.runs) {
      const steps = Math.max(16, run.curve.segs.length * 12)
      let last: number[] | null = null
      for (let i = 0; i <= steps; i++) {
        const s = sampleCatmullRomRaw(run.curve, i / steps)
        if (last && s) realPositions.push(last[0], last[1], last[2], s[0], s[1], s[2])
        last = s
      }
    }
    if (realPositions.length) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(realPositions, 3))
      list.push(new THREE.LineSegments(geometry, realMat))
    }
    // 假线：黄色虚线，直观显示「瞬移段」
    const ghostSet = new Set<number>(Array.isArray(comp.ghost) ? comp.ghost : [])
    if (ghostSet.size) {
      const n = comp.points.length
      const closed = Boolean(comp.closed) && n >= 3
      const segCount = closed ? n : n - 1
      const ghostMat = new THREE.LineDashedMaterial({
        color: '#ffb340', depthTest: false, transparent: true, opacity: 0.9, dashSize: 0.12, gapSize: 0.08,
      })
      for (const s of ghostSet) {
        if (s < 0 || s >= segCount) continue
        const a = comp.points[s]
        const b = s === n - 1 ? comp.points[0] : comp.points[s + 1]
        if (!Array.isArray(a) || !Array.isArray(b)) continue
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(a[0], a[1], a[2]),
          new THREE.Vector3(b[0], b[1], b[2]),
        ])
        const line = new THREE.Line(geometry, ghostMat)
        line.computeLineDistances()
        list.push(line)
      }
    }
    return list
  }, [comp])

  useEffect(() => () => {
    if (!objects) return
    for (const obj of objects) {
      ;(obj as THREE.Line).geometry.dispose()
      const m = (obj as THREE.Line).material as THREE.Material | THREE.Material[]
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose())
      else m.dispose()
    }
  }, [objects])

  if (!objects) return null
  return (
    <>
      {objects.map((obj, i) => (
        <primitive key={i} object={obj} />
      ))}
      {/* 起终点小标记，便于辨认轨迹方向 */}
      {comp.points.length >= 2 && (
        <>
          <mesh position={comp.points[0]}>
            <sphereGeometry args={[0.035, 12, 8]} />
            <meshBasicMaterial color="#4caf50" depthTest={false} />
          </mesh>
          <mesh position={comp.points[comp.points.length - 1]}>
            <sphereGeometry args={[0.035, 12, 8]} />
            <meshBasicMaterial color="#ff5252" depthTest={false} />
          </mesh>
        </>
      )}
    </>
  )
}

/**
 * 轨迹跟随：每帧把宿主 group 移动到曲线上。
 * 仅播放模式生效（点 ▶ 播放才开始动，编辑态保持数据里的 transform 静止）；
 * 微信端由 wxar-runtime 解释同名的 pathFollow 组件。
 */
function FollowController({
  targetRef,
  follow,
  fallbackPosition,
  fallbackRotationY = 0,
}: {
  targetRef: React.RefObject<THREE.Group | null>
  follow: PathFollowComponent
  fallbackPosition: [number, number, number]
  fallbackRotationY?: number
}) {
  // 订阅轨迹节点的 props：编辑轨迹点是 setProps（props 换引用，但 revision/structureVersion
  // 语义上的结构版本不变），只盯 structureVersion 会让跟随体一直在旧曲线上走
  const pathProps = useEditor((s) => (follow.pathId ? s.nodes[follow.pathId]?.props : null))
  const rt = useMemo(() => {
    void pathProps
    let comp: PathComponent | null = null
    // pathId 优先：绑定关系是用户在 Inspector 明确选择的。
    // 旧会话数据可能残留内嵌 points（早期版本直接把点集存进 pathFollow），
    // 若内嵌点优先，用户换绑/画新轨迹都会被旧点集劫持 → 「选了跟随还在原地走」。
    if (follow.pathId) {
      // pathProps 变化时（轨迹点编辑 / 轨迹节点增删）重新读取最新图数据
      const pathNode = useEditor.getState().nodes[follow.pathId]
      if (pathNode) {
        comp = (getComponents(pathNode).find((c) => c.type === 'path') as PathComponent | undefined) ?? null
      } else {
        console.warn(
          '[轨迹跟随] 绑定的轨迹节点不存在（可能已被删除），物体停在原地走。请选中物体，在「轨迹跟随」里重新选择轨迹。',
          'pathId=',
          follow.pathId
        )
      }
    }
    // 兜底：没绑定轨迹（或绑定失效）时才用内嵌点集
    if (!comp && Array.isArray(follow.points) && follow.points.length >= 2) {
      comp = { type: 'path', points: follow.points, closed: false }
    }
    return comp ? buildPathRuntime(comp) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow.pathId, follow.points, pathProps])

  // 绑定变化时打一条一次性日志，控制台能直接确认「模型当前跟的是哪条轨迹」
  useEffect(() => {
    if (!rt) return
    const pathNode = follow.pathId ? useEditor.getState().nodes[follow.pathId] : null
    const pts = pathNode
      ? `「${pathNode.name}」`
      : follow.points && follow.points.length >= 2
        ? '（内嵌点集）'
        : String(follow.pathId)
    console.info(`[轨迹跟随] 已绑定轨迹 ${pts}，${rt.runs.length} 段真线 / 总长 ${rt.totalReal.toFixed(2)}m`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt])

  // 卸载（或切换轨迹）时还原位置与朝向，避免物体停留在轨迹半途
  useEffect(() => {
    return () => {
      const g = targetRef.current
      if (g) {
        g.position.set(fallbackPosition[0], fallbackPosition[1], fallbackPosition[2])
        g.rotation.y = fallbackRotationY
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow.pathId])

  const tmp = useMemo(() => new THREE.Vector3(), [])
  // 上一帧的朝向角，用于转弯平滑插值（null = 尚未初始化）
  const yawRef = useRef<number | null>(null)
  // 播放起点时刻：clock 是场景级常驻时钟，若直接用 elapsedTime，
  // 播放开始时会跳到轨迹中段。以挂载时刻（= 进入播放）为零点，从轨迹起点出发。
  const playStartRef = useRef<number | null>(null)

  useFrame((state, delta) => {
    const g = targetRef.current
    if (!g || !rt) return
    const duration = follow.duration && follow.duration > 0.05 ? follow.duration : 5
    const T = rt.totalReal
    if (playStartRef.current === null) playStartRef.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - playStartRef.current
    // 时间线 d 只由真线段弧长构成：loop 周而复始（跨假线/回起点均瞬移），
    // pingpong 往返，once 走到尽头停下
    let d: number
    let dirSign = 1
    if (follow.loop === 'once') {
      d = THREE.MathUtils.clamp(elapsed / duration, 0, 1) * T
    } else if (follow.loop === 'pingpong') {
      const phase = (elapsed / duration) % 2
      dirSign = phase < 1 ? 1 : -1
      d = (phase < 1 ? phase : 2 - phase) * T
    } else {
      d = ((elapsed / duration) % 1) * T
    }
    const p = samplePathDistance(rt, d)
    if (!p) return
    // 开发期诊断钩子：控制台读 __followDebug 可看当前跟随状态
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      ;(window as unknown as Record<string, unknown>).__followDebug = {
        runs: rt.runs.length,
        totalReal: rt.totalReal,
        d,
        pos: [p[0], p[1], p[2]],
        loop: follow.loop ?? 'loop',
        pathId: follow.pathId,
      }
    }
    // 坐标系语义：默认轨迹点是「世界坐标」（地面画线的自然产物），需转换到宿主
    // 父级局部空间；local=true 时点集就是父级局部坐标（嵌套轨道场景：黄球绕蓝球转
    // = 局部圆轨迹挂在移动的蓝球下），必须跳过 worldToLocal——否则转换会每帧
    // 抵消父节点运动，物体实际仍绕世界原点转。
    const tmpV = tmp.set(p[0], p[1], p[2])
    if (!follow.local && g.parent) g.parent.worldToLocal(tmpV)
    g.position.copy(tmpV)

    // 面向行进方向：用前方一点的切线算偏航角，平滑转弯。
    // 跨假线时 q-p 即瞬移方向，角色会转向落点方向再「闪现」。
    if (follow.faceDirection !== false) {
      const eps = Math.max(T * 0.01, 1e-4)
      const q = samplePathDistance(rt, THREE.MathUtils.clamp(d + dirSign * eps, 0, T))
      if (q) {
        const dx = q[0] - p[0]
        const dz = q[2] - p[2]
        if (dx * dx + dz * dz > 1e-10) {
          // three.js 物体默认面朝 +Z，yaw = atan2(切线x, 切线z)
          const targetYaw = Math.atan2(dx, dz)
          const cur = yawRef.current ?? targetYaw
          // 最短角差插值（处理 ±π 回绕），转弯速率随帧时长自适应
          let diff = targetYaw - cur
          diff = Math.atan2(Math.sin(diff), Math.cos(diff))
          const k = Math.min(1, delta * 8)
          const yaw = cur + diff * k
          yawRef.current = yaw
          g.rotation.y = yaw
        }
      }
    }
  })

  return null
}

function LightBody({ node }: { node: SceneNode }) {
  const props = node.props
  if (props.kind !== 'light') return null

  const shadow = props.castShadow
    ? { 'shadow-mapSize-width': 2048, 'shadow-mapSize-height': 2048, 'shadow-bias': -0.0005 }
    : {}

  switch (props.light) {
    case 'ambient':
      return <ambientLight color={props.color} intensity={props.intensity} />
    case 'directional':
      return (
        <directionalLight
          color={props.color}
          intensity={props.intensity}
          castShadow={props.castShadow}
          {...shadow}
        />
      )
    case 'point':
      return (
        <pointLight
          color={props.color}
          intensity={props.intensity}
          distance={props.distance}
          castShadow={props.castShadow}
          {...shadow}
        />
      )
    case 'spot':
      return (
        <spotLight
          color={props.color}
          intensity={props.intensity}
          distance={props.distance}
          angle={props.angle}
          castShadow={props.castShadow}
          {...shadow}
        />
      )
    default:
      return null
  }
}

function NodeBody({ node, selected }: { node: SceneNode; selected: boolean }): ReactNode {
  const assets = useEditor((s) => s.assets)
  switch (node.type) {
    case 'mesh':
      return <MeshBody node={node} selected={selected} />
    case 'light':
      return <LightBody node={node} />
    case 'model': {
      const props = node.props
      if (props.kind !== 'model') return null
      const asset = props.assetId ? assets.find((a) => a.id === props.assetId) : undefined
      if (!asset) return null
      if (asset.meta.missing) return null
      return (
        <ModelNode
          uri={asset.uri}
          assetName={asset.name}
          activeAnimation={props.activeAnimation}
          animationSpeed={props.animationSpeed ?? 1}
          normalizeModel={props.normalizeModel ?? true}
          castShadow={props.castShadow}
          receiveShadow={props.receiveShadow}
        />
      )
    }
    case 'particle': {
      const props = node.props
      if (props.kind !== 'particle') return null
      return (
        <ParticleField
          count={props.count}
          color={props.color}
          size={props.size}
          speed={props.speed}
          spread={props.spread}
          additive={props.additive}
        />
      )
    }
    case 'gaussian-splat': {
      const props = node.props
      if (props.kind !== 'gaussian-splat') return null
      const asset = props.assetId ? assets.find((a) => a.id === props.assetId) : undefined
      if (!asset) return null
      if (asset.meta.missing) return null
      return (
        <GaussianSplatBody
          key={asset.uri}
          uri={asset.uri}
          assetName={asset.name}
          splatScale={props.splatScale ?? 1}
          minAlpha={props.minAlpha ?? 0.01}
        />
      )
    }
    default:
      return null
  }
}

export function NodeRenderer({ id }: { id: string }) {
  const node = useEditor((s) => s.nodes[id])
  // SceneGraph.update 是原地 Object.assign（节点对象引用不变），重命名不会触发上面的 selector；
  // name 是字符串值，单独订阅才能让改名反映到 THREE group.name 上
  const name = useEditor((s) => s.nodes[id]?.name)
  const transform = useEditor((s) => s.nodes[id]?.transform)
  const visible = useEditor((s) => s.nodes[id]?.visible)
  const locked = useEditor((s) => s.nodes[id]?.locked)
  const props = useEditor((s) => s.nodes[id]?.props)
  const children = useEditor((s) => s.nodes[id]?.children)
  const structureVersion = useEditor((s) => s.structureVersion)
  const selectedId = useEditor((s) => s.selectedId)
  const select = useEditor((s) => s.select)
  // 播放模式开关：轨迹跟随只在播放时驱动（编辑态保持静止）
  const playing = useEditor((s) => s.playing)
  // 父节点数据（父子绑定：挂在轨迹节点下的子节点自动跟随父轨迹）
  const parentNode = useEditor((s) => (node?.parentId ? s.nodes[node.parentId] : null))
  const groupRef = useRef<THREE.Group>(null)

  if (!node || !transform) return null

  const selected = selectedId === id

  // 轨迹数据组件：path 画线，pathFollow 驱动移动
  const components = getComponents(node)
  const pathComp = components.find((c) => c.type === 'path') as PathComponent | undefined
  const explicitFollow = components.find((c) => c.type === 'pathFollow') as
    | PathFollowComponent
    | undefined
  // 父子绑定：父节点携带 path 组件时，子节点隐式跟随父轨迹；
  // 显式 pathFollow 优先（pathId=null 表示明确「不跟随」，可从隐式绑定中退出）
  const parentIsPath = parentNode
    ? getComponents(parentNode).some((c) => c.type === 'path')
    : false
  const followComp =
    explicitFollow ??
    (parentIsPath && node.parentId
      ? ({ type: 'pathFollow', pathId: node.parentId } as PathFollowComponent)
      : undefined)

  const handleSelect = locked
    ? undefined
    : (e: { stopPropagation: () => void }) => {
        e.stopPropagation()
        select(id)
      }

  // 特效节点（黑洞/能量球）本质是球体，缩放必须保持各轴一致，
  // 否则非均匀缩放会把球体拉成椭球/圆柱体。
  const isEffectMesh = props?.kind === 'mesh' && Boolean(props?.effect)
  const renderScale = isEffectMesh && Array.isArray(transform.scale) && transform.scale.length === 3
    ? (() => {
        const m = Math.max(
          Math.abs(transform.scale[0]),
          Math.abs(transform.scale[1]),
          Math.abs(transform.scale[2])
        )
        return [m, m, m] as [number, number, number]
      })()
    : transform.scale

  return (
    <group
      ref={groupRef}
      name={name ?? ''}
      visible={visible ?? true}
      position={transform.position}
      rotation={transform.rotation}
      scale={renderScale}
      userData={{ __nodeId: id }}
      onClick={handleSelect}
    >
      <NodeBody node={node} selected={selected} />
      {pathComp && <PathLineBody comp={pathComp} />}
      {/* 仅播放模式驱动轨迹跟随；编辑态卸载控制器并把位置还原成数据 transform */}
      {followComp && playing && (
        <FollowController
          targetRef={groupRef}
          follow={followComp}
          fallbackPosition={transform.position}
          fallbackRotationY={Array.isArray(transform.rotation) ? transform.rotation[1] : 0}
        />
      )}
      {children?.map((childId) => (
        <NodeRenderer key={childId} id={childId} />
      ))}
    </group>
  )
}

export function SceneTree() {
  const rootIds = useEditor((s) => s.rootIds)
  // 结构版本变化时重新读取 rootIds（数组本身是原地修改的，引用不变）
  useEditor((s) => s.structureVersion)

  return (
    <>
      {rootIds.map((id) => (
        <NodeRenderer key={id} id={id} />
      ))}
    </>
  )
}
