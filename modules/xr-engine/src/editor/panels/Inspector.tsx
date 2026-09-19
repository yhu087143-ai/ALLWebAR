import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { loadModelFile } from '@/engine/assets/loader'
import { disposeLoadedModel } from '@/editor/scene/dispose'
import { engine, useEditor } from '@/editor/store'
import {
  GEOMETRY_LABEL,
  GEOMETRY_PARAMS,
  INTEGER_PARAMS,
  LIGHT_DEFAULTS,
  LIGHT_LABEL,
} from '@/engine/core/factory'
import type {
  GaussianSplatProps,
  GeometryKind,
  LightKind,
  MaterialProps,
  MeshProps,
  ModelProps,
  ParticleProps,
  ParticlePreset,
} from '@/engine/core/types'
import {
  ColorField,
  NumberField,
  Section,
  SelectField,
  TextField,
  ToggleField,
  Vec3Field,
} from '@/editor/ui/controls'

function TransformSection({ id }: { id: string }) {
  const transform = useEditor((s) => s.nodes[id]?.transform)
  const setTransform = useEditor((s) => s.setTransform)
  if (!transform) return null

  return (
    <Section title="变换">
      <Vec3Field
        label="位置"
        value={transform.position}
        step={0.01}
        onChange={(position) => setTransform(id, { position })}
      />
      <Vec3Field
        label="旋转°"
        value={[
          (transform.rotation[0] * 180) / Math.PI,
          (transform.rotation[1] * 180) / Math.PI,
          (transform.rotation[2] * 180) / Math.PI,
        ]}
        step={1}
        onChange={(deg) =>
          setTransform(id, {
            rotation: [
              (deg[0] * Math.PI) / 180,
              (deg[1] * Math.PI) / 180,
              (deg[2] * Math.PI) / 180,
            ],
          })
        }
      />
      <NumberField
        label="等比缩放"
        value={transform.scale[0] ?? 1}
        step={0.01}
        min={0.01}
        max={10}
        onChange={(uniform) => setTransform(id, { scale: [uniform, uniform, uniform] })}
      />
      <Vec3Field
        label="缩放"
        value={transform.scale}
        step={0.01}
        onChange={(scale) => setTransform(id, { scale })}
      />
    </Section>
  )
}

function MeshInspector({ id, props }: { id: string; props: MeshProps }) {
  const setGeometry = useEditor((s) => s.setGeometry)
  const setProps = useEditor((s) => s.setProps)

  const params = GEOMETRY_PARAMS[props.geometry]
  const material = props.material as MaterialProps

  const patchMaterial = (patch: Partial<MaterialProps>) =>
    setProps(id, { material: { ...material, ...patch } })

  const patchGeometryParam = (key: string, value: number) =>
    setProps(id, { geometryParams: { ...props.geometryParams, [key]: value } })

  const assets = useEditor((s) => s.assets)
  const textureAssets = assets.filter((a) => a.kind === 'texture')
  const textureOptions = [
    { value: '', label: '无' },
    ...textureAssets.map((a) => ({ value: a.id, label: a.name })),
  ]
  const textureField = (
    label: string,
    key: 'map' | 'roughnessMap' | 'metalnessMap' | 'normalMap' | 'emissiveMap' | 'aoMap'
  ) => (
    <SelectField
      label={label}
      value={material[key] ?? ''}
      options={textureOptions}
      onChange={(v) =>
        patchMaterial({ [key]: v || null } as Partial<MaterialProps>)
      }
    />
  )

  return (
    <>
      <Section title="几何体">
        <SelectField
          label="类型"
          value={props.geometry}
          options={(Object.keys(GEOMETRY_LABEL) as GeometryKind[]).map((k) => ({
            value: k,
            label: GEOMETRY_LABEL[k],
          }))}
          onChange={(geometry) => setGeometry(id, geometry)}
        />
        {Object.keys(params).map((key) => (
          <NumberField
            key={key}
            label={key}
            value={props.geometryParams[key] ?? params[key]}
            step={INTEGER_PARAMS.has(key) ? 1 : 0.01}
            min={INTEGER_PARAMS.has(key) ? 1 : 0.001}
            max={INTEGER_PARAMS.has(key) ? 256 : 100}
            slider={!INTEGER_PARAMS.has(key)}
            onChange={(v) =>
              patchGeometryParam(key, INTEGER_PARAMS.has(key) ? Math.round(v) : v)
            }
          />
        ))}
      </Section>

      <Section title="特效" defaultOpen={false}>
        <SelectField
          label="内置特效"
          value={props.effect ?? 'none'}
          options={[
            { value: 'none', label: '无' },
            { value: 'blackhole', label: '黑洞（粒子旋涡）' },
            { value: 'energy', label: '能量球（轨道粒子）' },
            { value: 'dissolve', label: '溶解' },
            { value: 'hologram', label: '全息' },
            { value: 'shockwave', label: '冲击波' },
          ]}
          onChange={(effect) => setProps(id, { effect: effect === 'none' ? undefined : effect })}
        />
        <div className="field">
          <label>自定义顶点着色器（Web 直接使用，微信需 GLSL ES 100）</label>
          <textarea
            className="shader-code"
            rows={6}
            spellCheck={false}
            value={props.customShader?.vertex ?? ''}
            placeholder="void main(){ ... }"
            onChange={(e) =>
              setProps(id, {
                customShader: { ...(props.customShader ?? {}), vertex: e.target.value || undefined },
              })
            }
          />
        </div>
        <div className="field">
          <label>自定义片段着色器</label>
          <textarea
            className="shader-code"
            rows={6}
            spellCheck={false}
            value={props.customShader?.fragment ?? ''}
            placeholder="void main(){ ... }"
            onChange={(e) =>
              setProps(id, {
                customShader: { ...(props.customShader ?? {}), fragment: e.target.value || undefined },
              })
            }
          />
        </div>
      </Section>

      <Section title="材质">
        <ColorField
          label="基础色"
          value={material.color}
          onChange={(color) => patchMaterial({ color })}
        />
        <NumberField
          label="金属度"
          value={material.metalness}
          min={0}
          max={1}
          step={0.01}
          onChange={(metalness) => patchMaterial({ metalness })}
        />
        <NumberField
          label="粗糙度"
          value={material.roughness}
          min={0}
          max={1}
          step={0.01}
          onChange={(roughness) => patchMaterial({ roughness })}
        />
        <ColorField
          label="自发光"
          value={material.emissive}
          onChange={(emissive) => patchMaterial({ emissive })}
        />
        <NumberField
          label="自发光强度"
          value={material.emissiveIntensity}
          min={0}
          max={10}
          step={0.1}
          onChange={(emissiveIntensity) => patchMaterial({ emissiveIntensity })}
        />
        <NumberField
          label="不透明度"
          value={material.opacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(opacity) => patchMaterial({ opacity })}
        />
        {textureField('基础色贴图', 'map')}
        {textureField('粗糙度贴图', 'roughnessMap')}
        {textureField('金属度贴图', 'metalnessMap')}
        {textureField('法线贴图', 'normalMap')}
        {textureField('自发光贴图', 'emissiveMap')}
        {textureField('AO 贴图', 'aoMap')}
        <ToggleField
          label="线框"
          value={material.wireframe}
          onChange={(wireframe) => patchMaterial({ wireframe })}
        />
        <ToggleField
          label="平面着色"
          value={material.flatShading}
          onChange={(flatShading) => patchMaterial({ flatShading })}
        />
      </Section>

      <Section title="阴影">
        <ToggleField
          label="投射阴影"
          value={props.castShadow}
          onChange={(castShadow) => setProps(id, { castShadow })}
        />
        <ToggleField
          label="接收阴影"
          value={props.receiveShadow}
          onChange={(receiveShadow) => setProps(id, { receiveShadow })}
        />
      </Section>

      <Section title="物理" defaultOpen={false}>
        {(() => {
          const physics = props.physics ?? {
            body: 'none' as const,
            mass: 1,
            shape: 'box' as const,
            restitution: 0.3,
          }
          const patch = (p: Partial<typeof physics>) => setProps(id, { physics: { ...physics, ...p } })
          return (
            <>
              <SelectField
                label="刚体"
                value={physics.body}
                options={[
                  { value: 'none', label: '无' },
                  { value: 'dynamic', label: '动态（受力）' },
                  { value: 'static', label: '静态（碰撞体）' },
                ]}
                onChange={(body) => patch({ body })}
              />
              {physics.body !== 'none' && (
                <>
                  {physics.body === 'dynamic' && (
                    <NumberField
                      label="质量"
                      value={physics.mass}
                      min={0.1}
                      max={100}
                      step={0.1}
                      slider={false}
                      onChange={(mass) => patch({ mass })}
                    />
                  )}
                  <SelectField
                    label="碰撞形状"
                    value={physics.shape}
                    options={[
                      { value: 'box', label: '盒' },
                      { value: 'sphere', label: '球' },
                    ]}
                    onChange={(shape) => patch({ shape })}
                  />
                  <NumberField
                    label="弹性"
                    value={physics.restitution}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(restitution) => patch({ restitution })}
                  />
                  <div className="hint">
                    点顶栏「▶ 播放」运行物理：动态刚体下落碰撞，静态体充当地面。
                    退出播放后场景恢复原样，物理位移不会保留。
                  </div>
                </>
              )}
            </>
          )
        })()}
      </Section>
    </>
  )
}

const PARTICLE_LABEL: Record<ParticlePreset, string> = {
  fire: '火焰',
  smoke: '烟雾',
  energy: '能量',
  snow: '飘雪',
}

function ParticleInspector({ id, props }: { id: string; props: ParticleProps }) {
  const setProps = useEditor((s) => s.setProps)

  return (
    <Section title="粒子">
      <SelectField
        label="预设"
        value={props.preset}
        options={(Object.keys(PARTICLE_LABEL) as ParticlePreset[]).map((k) => ({
          value: k,
          label: PARTICLE_LABEL[k],
        }))}
        onChange={(preset) => setProps(id, { preset })}
      />
      <NumberField
        label="数量"
        value={props.count}
        min={16}
        max={100000}
        step={100}
        onChange={(count) => setProps(id, { count: Math.round(count) })}
      />
      <ColorField label="颜色" value={props.color} onChange={(color) => setProps(id, { color })} />
      <NumberField
        label="尺寸"
        value={props.size}
        min={0.5}
        max={60}
        step={0.5}
        onChange={(size) => setProps(id, { size })}
      />
      <NumberField
        label="速度"
        value={props.speed}
        min={0.05}
        max={5}
        step={0.05}
        onChange={(speed) => setProps(id, { speed })}
      />
      <Vec3Field
        label="扩散"
        value={props.spread}
        step={0.1}
        onChange={(spread) => setProps(id, { spread })}
      />
      <ToggleField
        label="叠加混合"
        value={props.additive}
        onChange={(additive) => setProps(id, { additive })}
      />
      <div className="hint">
        扩散 Y 为负值表示向下飘落（如飘雪）。粒子位置全部在顶点着色器里计算，
        CPU 每帧只更新一个时间 uniform，十万级粒子也不掉帧。
      </div>
    </Section>
  )
}

function ModelInspector({ id, props }: { id: string; props: ModelProps }) {
  const assets = useEditor((s) => s.assets)
  const setProps = useEditor((s) => s.setProps)

  const models = assets.filter((a) => a.kind === 'model')
  const selected = assets.find((a) => a.id === props.assetId)
  const animations = String(selected?.meta.animations ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  return (
    <>
      <Section title="模型资产">
        {models.length === 0 ? (
          <div className="hint">资产库里还没有模型。先在左下角上传，或到「AI 建模」页生成。</div>
        ) : (
          <SelectField
            label="资产"
            value={props.assetId ?? ''}
            options={[
              { value: '', label: '— 未指定 —' },
              ...models.map((a) => ({ value: a.id, label: a.name })),
            ]}
            onChange={(assetId) => setProps(id, { assetId: assetId || null, activeAnimation: null })}
          />
        )}

        {animations.length > 0 && (
          <SelectField
            label="动画"
            value={props.activeAnimation ?? ''}
            options={[
              { value: '', label: '— 不播放 —' },
              ...animations.map((name) => ({ value: name, label: name })),
            ]}
            onChange={(activeAnimation) => setProps(id, { activeAnimation: activeAnimation || null })}
          />
        )}

        {animations.length > 0 && props.activeAnimation && (
          <NumberField
            label="动画速度"
            value={props.animationSpeed ?? 1}
            min={0.05}
            max={5}
            step={0.05}
            onChange={(animationSpeed) => setProps(id, { animationSpeed })}
          />
        )}

        {selected && !selected.meta.missing && (
          <button
            className="btn"
            style={{ width: '100%', marginTop: 8, padding: '5px 0' }}
            onClick={() => {
              void (async () => {
                try {
                  const loaded = await loadModelFile(
                    selected.uri,
                    selected.name,
                    engine.getRenderer() ?? undefined
                  )
                  try {
                    const box = new THREE.Box3().setFromObject(loaded.scene)
                    const size = box.getSize(new THREE.Vector3())
                    const maxDim = Math.max(size.x, size.y, size.z) || 1
                    const uniform = 2 / maxDim
                    useEditor.getState().setTransform(id, {
                      position: [0, 0, 0],
                      scale: [uniform, uniform, uniform],
                    })
                  } finally {
                    // 这里只为量尺寸临时解析，模型本体不入场景：用完即释放
                    disposeLoadedModel(loaded.scene)
                  }
                } catch (err) {
                  console.error('[inspector] 自动适配模型失败', err)
                }
              })()
            }}
          >
            自动适配大小（2 米）
          </button>
        )}

        {selected && (
          <div style={{ marginTop: 6 }}>
            <div className="kv">
              <span>三角面</span>
              <span>{(selected.triangles || 0).toLocaleString()}</span>
            </div>
            <div className="kv">
              <span>贴图数</span>
              <span>{String(selected.meta.textures ?? '—')}</span>
            </div>
            <div className="kv">
              <span>骨骼</span>
              <span>{String(selected.meta.bones ?? '—')}</span>
            </div>
            <div className="kv">
              <span>动画轨道</span>
              <span>{String(selected.meta.animationTracks ?? '—')}</span>
            </div>
            {(selected.triangles || 0) > 100000 && (
              <div className="hint" style={{ color: 'var(--warn)' }}>
                当前模型 {(selected.triangles || 0).toLocaleString()} 三角面，超过 AR 建议 10 万上限，动画会很卡。
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="模型显示" defaultOpen={false}>
        <ToggleField
          label="自动归一化（1 米基准）"
          value={props.normalizeModel ?? true}
          onChange={(normalizeModel) => setProps(id, { normalizeModel })}
        />
        <div className="hint">
          开启后模型会先缩放到 1 米高左右，父级缩放改起来更直观。关闭则保留 FBX/GLB 原始尺寸。
        </div>
      </Section>

      <Section title="阴影" defaultOpen={false}>
        <ToggleField
          label="投射阴影"
          value={props.castShadow}
          onChange={(castShadow) => setProps(id, { castShadow })}
        />
        <ToggleField
          label="接收阴影"
          value={props.receiveShadow}
          onChange={(receiveShadow) => setProps(id, { receiveShadow })}
        />
      </Section>
    </>
  )
}

function SplatInspector({ id, props }: { id: string; props: GaussianSplatProps }) {
  const assets = useEditor((s) => s.assets)
  const setProps = useEditor((s) => s.setProps)

  const splats = assets.filter((a) => a.kind === 'gaussian-splat')
  const selected = assets.find((a) => a.id === props.assetId)
  const splatCount = Number(selected?.meta.splatCount ?? 0)

  return (
    <Section title="高斯泼溅">
      {splats.length === 0 ? (
        <div className="hint">
          资产库里还没有泼溅资产。在左下角导入 PLY（3DGS 扫描件）或 .splat / .spz 文件。
        </div>
      ) : (
        <SelectField
          label="资产"
          value={props.assetId ?? ''}
          options={[
            { value: '', label: '— 未指定 —' },
            ...splats.map((a) => ({ value: a.id, label: a.name })),
          ]}
          onChange={(assetId) => setProps(id, { assetId: assetId || null })}
        />
      )}

      {selected && (
        <div style={{ marginTop: 6 }}>
          <div className="kv">
            <span>泼溅点数</span>
            <span>{splatCount ? splatCount.toLocaleString() : '—'}</span>
          </div>
          <div className="kv">
            <span>文件大小</span>
            <span>{selected.size ? `${(selected.size / 1024 / 1024).toFixed(1)} MB` : '—'}</span>
          </div>
        </div>
      )}

      <div className="hint">
        整体大小用「变换」里的统一缩放调整；泼溅是纯视觉资产，不参与导出小程序场景。
        建议用视口上方「飞行」进入无人机视角观赏。
      </div>
    </Section>
  )
}

function LightInspector({ id }: { id: string }) {
  const props = useEditor((s) => s.nodes[id]?.props)
  const setProps = useEditor((s) => s.setProps)
  if (!props || props.kind !== 'light') return null

  return (
    <Section title="灯光">
      <SelectField
        label="类型"
        value={props.light}
        options={(Object.keys(LIGHT_LABEL) as LightKind[]).map((k) => ({
          value: k,
          label: LIGHT_LABEL[k],
        }))}
        onChange={(light) =>
          setProps(id, { light, ...LIGHT_DEFAULTS[light] })
        }
      />
      <ColorField label="颜色" value={props.color} onChange={(color) => setProps(id, { color })} />
      <NumberField
        label="强度"
        value={props.intensity}
        min={0}
        max={100}
        step={0.1}
        slider={false}
        onChange={(intensity) => setProps(id, { intensity })}
      />
      {(props.light === 'point' || props.light === 'spot') && (
        <NumberField
          label="衰减距离"
          value={props.distance}
          min={0}
          max={100}
          step={0.5}
          slider={false}
          onChange={(distance) => setProps(id, { distance })}
        />
      )}
      {props.light === 'spot' && (
        <NumberField
          label="锥角°"
          value={(props.angle * 180) / Math.PI}
          min={1}
          max={179}
          step={1}
          slider={false}
          onChange={(deg) => setProps(id, { angle: (deg * Math.PI) / 180 })}
        />
      )}
      <ToggleField
        label="投射阴影"
        value={props.castShadow}
        onChange={(castShadow) => setProps(id, { castShadow })}
      />
    </Section>
  )
}


const COMPONENT_PRESETS: Record<string, Record<string, unknown>> = {
  tapPlace: {
    type: 'tapPlace',
    width: 10,
    depth: 10,
    y: 0,
    prefab: {
      name: '放置物',
      type: 'mesh',
      props: {
        kind: 'mesh',
        geometry: 'sphere',
        geometryParams: { radius: 0.3 },
        material: { color: '#4fc3f7' },
      },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
  },
  spawner: {
    type: 'spawner',
    interval: 3,
    prefab: {
      name: '生成物',
      type: 'mesh',
      props: {
        kind: 'mesh',
        geometry: 'sphere',
        geometryParams: { radius: 0.2 },
        material: { color: '#ff8a65' },
      },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
  },
  collectible: { type: 'collectible', score: 10 },
  move: { type: 'move', velocity: [0, 0, 1] },
  dialogue: { type: 'dialogue', start: 'intro' },
  timeline: { type: 'timeline', data: { id: 'demo', duration: 2, tracks: [] } },
  marker: { type: 'marker', mode: 'Marker', src: 'https://example.com/marker.jpg' },
}

/** 稳定的空数组引用：zustand 选择器必须返回同一引用，否则 useSyncExternalStore 会无限循环 */
const EMPTY_COMPONENTS: unknown[] = []

interface PathFollowData {
  type: 'pathFollow'
  pathId?: string | null
  points?: [number, number, number][]
  duration?: number
  loop?: 'loop' | 'pingpong' | 'once'
  faceDirection?: boolean
  /** 点集坐标系：true = 父级局部坐标（嵌套轨道，如卫星绕行星） */
  local?: boolean
}

interface PathComponentData {
  type: 'path'
  points: [number, number, number][]
  closed?: boolean
  /** 假线段索引：角色不走路，走到段首直接瞬移到段尾 */
  ghost?: number[]
}

/**
 * 轨迹跟随配置：把当前节点绑定到某条「轨迹 N」节点上，
 * 由 NodeRenderer 的 FollowController（Web）和 wxar-runtime（微信）共同解释。
 */
function PathFollowSection({ id }: { id: string }) {
  const nodes = useEditor((s) => s.nodes)
  const structureVersion = useEditor((s) => s.structureVersion)
  const node = useEditor((s) => s.nodes[id])
  const setProps = useEditor((s) => s.setProps)
  const reparent = useEditor((s) => s.reparent)

  // 场景里所有携带 path 组件的轨迹节点（components 可能被外部改坏成非数组，必须防御）
  const pathNodes = useMemo(() => {
    void structureVersion
    return Object.values(nodes).filter((n) => {
      const comps = (n.props as { components?: unknown }).components
      return (
        Array.isArray(comps) &&
        comps.some((c) => (c as { type?: string })?.type === 'path')
      )
    })
  }, [nodes, structureVersion])

  const components = useMemo(() => {
    void node
    const raw = (node?.props as { components?: unknown[] } | undefined)?.components
    return Array.isArray(raw) ? raw : EMPTY_COMPONENTS
  }, [node])
  const follow = components.find((c) => (c as PathFollowData)?.type === 'pathFollow') as
    | PathFollowData
    | undefined

  const patchFollow = (patch: Partial<PathFollowData>) => {
    const next = components.some((c) => (c as PathFollowData)?.type === 'pathFollow')
      ? components.map((c) =>
          (c as PathFollowData)?.type === 'pathFollow'
            ? { ...(c as PathFollowData), ...patch }
            : c
        )
      : [...components, { type: 'pathFollow', pathId: null, duration: 5, loop: 'loop', ...patch }]
    setProps(id, { components: next })
  }

  const removeFollow = () => {
    setProps(id, {
      components: components.filter((c) => (c as PathFollowData)?.type !== 'pathFollow'),
    })
  }

  // 父子绑定：当前节点挂在某条轨迹节点下 → 隐式跟随父轨迹（NodeRenderer 同语义）。
  // 显式 pathFollow 存在时尊重用户配置（含 pathId=null 的「明确不跟随」）。
  const parentId = node?.parentId ?? null
  const parentNode = parentId ? nodes[parentId] : null
  const parentRawComps = (parentNode?.props as { components?: unknown } | undefined)?.components
  const parentComps: { type?: string }[] = Array.isArray(parentRawComps)
    ? (parentRawComps as { type?: string }[])
    : (EMPTY_COMPONENTS as { type?: string }[])
  const parentIsPath = Boolean(parentNode) && parentComps.some((c) => c?.type === 'path')
  const selfIsPath = components.some((c) => (c as PathComponentData)?.type === 'path')

  return (
    <Section title="轨迹跟随" defaultOpen={false}>
      {parentIsPath && (
        <div className="hint" style={{ color: '#7ce38b' }}>
          父子绑定：当前节点挂在轨迹「{parentNode!.name}」下
          {follow ? '' : '，自动跟随父轨迹（无需配置）'}。
        </div>
      )}
      {pathNodes.length === 0 ? (
        <div className="hint">
          场景里还没有轨迹。先用视口上方「画轨迹」按钮在地面上画一条，再回来选择它。
        </div>
      ) : (
        <SelectField
          label="跟随轨迹"
          value={follow?.pathId ?? ''}
          options={[
            { value: '', label: '— 不跟随 —' },
            ...pathNodes.map((n) => ({ value: n.id, label: n.name })),
          ]}
          onChange={(v) =>
            v
              // 绑定轨迹时顺手清掉旧数据可能残留的内嵌点集：
              // 否则内嵌 points 会一直压在数据里，干扰「同一套数据」的一致性
              ? patchFollow({ pathId: v, points: undefined })
              : removeFollow()
          }
        />
      )}

      {/* 父子绑定入口：把节点挂到轨迹节点下即自动跟随（契合微信小程序节点树语义）。
          轨迹节点自身不允许挂到别的轨迹下（画线节点跟随时线也会跟着动，无意义）。 */}
      {!selfIsPath && pathNodes.length > 0 && (
        <SelectField
          label="挂到轨迹下（父子绑定）"
          value={parentIsPath ? parentId! : ''}
          options={[
            { value: '', label: '— 根级（不挂） —' },
            ...pathNodes.map((n) => ({ value: n.id, label: n.name })),
          ]}
          onChange={(v) => reparent(id, v || null)}
        />
      )}

      {follow && (
        <>
          {follow.pathId && !nodes[follow.pathId] && (
            <div className="hint" style={{ color: '#ff7a7a' }}>
              绑定的轨迹节点已被删除，物体不会移动（原地走）。请在上方重新选择轨迹。
            </div>
          )}
          <NumberField
            label="一圈秒数"
            value={follow.duration ?? 5}
            min={0.5}
            max={120}
            step={0.5}
            onChange={(duration) => patchFollow({ duration })}
          />
          <SelectField
            label="循环方式"
            value={follow.loop ?? 'loop'}
            options={[
              { value: 'loop', label: '循环（到终点瞬回起点）' },
              { value: 'pingpong', label: '往返（到终点反向走回）' },
              { value: 'once', label: '单次（走到尽头停下）' },
            ]}
            onChange={(loop) => patchFollow({ loop: loop as PathFollowData['loop'] })}
          />
          <ToggleField
            label="面向行进方向"
            value={follow.faceDirection !== false}
            onChange={(faceDirection) => patchFollow({ faceDirection })}
          />
          <ToggleField
            label="相对父节点（嵌套轨道）"
            value={follow.local === true}
            onChange={(local) => patchFollow({ local })}
          />
          <div className="hint">
            物体将沿紫色实线移动、跨过黄色虚线（假线瞬移）；绿点起点、红点终点。默认轨迹点是世界坐标；「相对父节点」开启后点集按父级局部坐标解释（把轨迹挂在移动物体下可做嵌套轨道，如卫星绕行星）。
          </div>
        </>
      )}
    </Section>
  )
}

/** 轨迹线编辑：闭环开关 + 每段「真线/假线」切换（假线＝角色瞬移跳过） */
function PathDataSection({ id }: { id: string }) {
  const node = useEditor((s) => s.nodes[id])
  const setProps = useEditor((s) => s.setProps)
  const components = useMemo(() => {
    void node
    const raw = (node?.props as { components?: unknown[] } | undefined)?.components
    return Array.isArray(raw) ? raw : EMPTY_COMPONENTS
  }, [node])
  const path = components.find((c) => (c as PathComponentData)?.type === 'path') as
    | PathComponentData
    | undefined
  if (!path || !Array.isArray(path.points) || path.points.length < 2) return null

  const patchPath = (patch: Partial<PathComponentData>) => {
    const next = components.map((c) =>
      (c as PathComponentData)?.type === 'path' ? { ...(c as PathComponentData), ...patch } : c
    )
    setProps(id, { components: next })
  }

  const n = path.points.length
  const closed = Boolean(path.closed) && n >= 3
  const segCount = closed ? n : n - 1
  const ghost = new Set<number>(Array.isArray(path.ghost) ? path.ghost : [])
  const toggleGhost = (s: number) => {
    const g = new Set(ghost)
    if (g.has(s)) g.delete(s)
    else g.add(s)
    patchPath({ ghost: Array.from(g).sort((a, b) => a - b) })
  }
  const segLabel = (s: number) =>
    s === segCount - 1 && closed ? `闭合段 P${s}→P0` : `段${s}　P${s}→P${s + 1}`

  return (
    <Section title="轨迹线（真线/假线）" defaultOpen={false}>
      {n >= 3 && (
        <ToggleField label="闭环（末点连回起点）" value={closed} onChange={(v) => patchPath({ closed: v })} />
      )}
      <div className="hint">
        紫色实线＝真线，角色正常行走；黄色虚线＝假线，角色不走路，走到段首直接瞬移到段尾。
        例如画一个缺了口的圆：开启闭环后把「闭合段」设为假线，角色每走完一圈就在缺口处闪现一次，正好把圆闭环。
      </div>
      {Array.from({ length: segCount }, (_, s) => (
        <ToggleField
          key={s}
          label={segLabel(s) + (ghost.has(s) ? '　【假线】' : '')}
          value={ghost.has(s)}
          onChange={() => toggleGhost(s)}
        />
      ))}
    </Section>
  )
}

function ComponentsSection({ id }: { id: string }) {
  const components = useEditor((s) => ((s.nodes[id]?.props as { components?: unknown[] } | undefined)?.components) ?? EMPTY_COMPONENTS)
  const setProps = useEditor((s) => s.setProps)
  const [draft, setDraft] = useState(() => JSON.stringify(components, null, 2))
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraft(JSON.stringify(components, null, 2))
    setEditing(false)
    setError('')
  }, [id, components])

  const add = (key: string) => {
    const preset = JSON.parse(JSON.stringify(COMPONENT_PRESETS[key]))
    setProps(id, { components: [...components, preset] })
  }

  const save = () => {
    try {
      const parsed = JSON.parse(draft) as unknown[]
      if (!Array.isArray(parsed)) throw new Error('components 必须是数组')
      setProps(id, { components: parsed })
      setEditing(false)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Section
      title="数据组件（跨端）"
      defaultOpen={false}
      right={<span className="badge">{components.length}</span>}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {Object.keys(COMPONENT_PRESETS).map((key) => (
          <button key={key} className="btn" style={{ padding: '2px 6px' }} onClick={() => add(key)}>
            + {key}
          </button>
        ))}
      </div>
      {!editing ? (
        <>
          <div className="hint">
            这些组件数据会被 Web 和微信运行时共同解释。点击上方按钮添加预设，或直接编辑 JSON。
          </div>
          <button className="btn" style={{ width: '100%', marginTop: 4 }} onClick={() => { setDraft(JSON.stringify(components, null, 2)); setEditing(true) }}>
            编辑 JSON
          </button>
        </>
      ) : (
        <>
          <textarea
            className="textarea script-editor"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
          />
          {error && <div className="hint danger">{error}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button className="btn" style={{ flex: 1 }} onClick={save}>应用</button>
            <button className="btn" style={{ flex: 1 }} onClick={() => setEditing(false)}>取消</button>
          </div>
        </>
      )}
    </Section>
  )
}

export function Inspector() {
  const selectedId = useEditor((s) => s.selectedId)
  const node = useEditor((s) => (s.selectedId ? s.nodes[s.selectedId] : null))
  const renameNode = useEditor((s) => s.renameNode)
  const toggleVisible = useEditor((s) => s.toggleVisible)
  const toggleLocked = useEditor((s) => s.toggleLocked)
  const removeNode = useEditor((s) => s.removeNode)
  const duplicateNode = useEditor((s) => s.duplicateNode)

  if (!selectedId || !node) {
    return (
      <div className="empty-state">
        未选中任何对象
        <br />
        在视口或层级树里点一个对象
      </div>
    )
  }

  return (
    <div>
      <Section title="对象">
        <TextField label="名称" value={node.name} onChange={(name) => renameNode(node.id, name)} />
        <ToggleField label="可见" value={node.visible} onChange={() => toggleVisible(node.id)} />
        <ToggleField label="锁定" value={node.locked} onChange={() => toggleLocked(node.id)} />
        <div style={{ display: 'flex', gap: 6, paddingTop: 6 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => duplicateNode(node.id)}>
            复制
          </button>
          <button className="btn danger" style={{ flex: 1 }} onClick={() => removeNode(node.id)}>
            删除
          </button>
        </div>
      </Section>

      <TransformSection id={node.id} />

      {node.props.kind === 'mesh' && <MeshInspector id={node.id} props={node.props} />}
      {node.props.kind === 'particle' && <ParticleInspector id={node.id} props={node.props} />}
      {node.props.kind === 'model' && <ModelInspector id={node.id} props={node.props} />}
      {node.props.kind === 'gaussian-splat' && (
        <SplatInspector id={node.id} props={node.props} />
      )}
      {node.type === 'light' && <LightInspector id={node.id} />}

      {(() => {
        const compsRaw = (node.props as { components?: { type?: string }[] } | undefined)?.components
        return Array.isArray(compsRaw) && compsRaw.some((c) => c?.type === 'path')
      })() && <PathDataSection id={node.id} />}
      <PathFollowSection id={node.id} />
      <ComponentsSection id={node.id} />
      <ScriptSection id={node.id} />
    </div>
  )
}

// ---------------------------------------------------------------- 脚本

const SCRIPT_TEMPLATE = `// 播放模式下运行。return 生命周期钩子，ctx 见注释。
return {
  onStart(ctx) {
    // ctx.engine / ctx.nodeId / ctx.input
  },
  onUpdate(ctx) {
    // ctx.input.keys.has('w') 判断按住，ctx.input.pressed.has(' ') 判断刚按下
    // ctx.engine.graph.setTransform(ctx.nodeId, { position: [x, y, z] })
  },
}`

function ScriptSection({ id }: { id: string }) {
  const script = useEditor((s) => s.nodes[id]?.script ?? '')
  const [draft, setDraft] = useState(script || '')
  const [editing, setEditing] = useState(false)

  // 选中切换时重置草稿
  useEffect(() => {
    setDraft(script || '')
    setEditing(false)
  }, [id, script])

  const save = () => {
    engine.graph.update(id, { script: draft.trim() || undefined })
    setEditing(false)
  }

  return (
    <Section
      title="行为脚本"
      defaultOpen={false}
      right={<span className="badge">{script ? '已启用' : '空'}</span>}
    >
      {!editing ? (
        <>
          <div className="hint">
            {script
              ? '已挂脚本。播放模式启动时编译，onUpdate 每帧执行。'
              : '给这个节点挂一段行为脚本（键盘控制、旋转、生成物体…），播放模式生效。'}
          </div>
          <button className="btn" style={{ width: '100%' }} onClick={() => setEditing(true)}>
            {script ? '编辑脚本' : '添加脚本'}
          </button>
        </>
      ) : (
        <>
          <textarea
            className="textarea script-editor"
            value={draft}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={SCRIPT_TEMPLATE}
            rows={12}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {!draft.trim() && (
              <button className="btn" onClick={() => setDraft(SCRIPT_TEMPLATE)}>
                插入模板
              </button>
            )}
            <button className="btn" style={{ flex: 1 }} onClick={() => setEditing(false)}>
              取消
            </button>
            <button className="btn primary" style={{ flex: 1 }} onClick={save}>
              保存
            </button>
          </div>
        </>
      )}
    </Section>
  )
}
