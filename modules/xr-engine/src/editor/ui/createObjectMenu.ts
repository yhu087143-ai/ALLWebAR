import { useEditor } from '@/editor/store'
import type { AddNodeOptions } from '@/editor/store'
import {
  GEOMETRY_LABEL,
  LIGHT_LABEL,
  LIGHT_DEFAULTS,
  defaultMaterial,
} from '@/engine/core/factory'
import type { GeometryKind, LightKind, NodeType, ParticlePreset } from '@/engine/core/types'
import type { MenuItem } from './ContextMenu'

/**
 * 「添加物体」菜单数据源（对标 Unity 的 GameObject 菜单）。
 * 层级面板右键、视口右键、工具栏「添加物体▾」三处共用，保证内容一致。
 */

export type CreateTarget =
  /** 根级（层级空白区 / 工具栏） */
  | { kind: 'root' }
  /** 作为某个节点的子级（层级树行 / 视口节点右键） */
  | { kind: 'child'; parentId: string }
  /** 视口地面点击处（position 为 y=0 的世界坐标） */
  | { kind: 'ground'; position: [number, number, number] }

/** 视口创建时物体底部贴地的抬升量（按各几何体默认参数的一半高度） */
const PRIMITIVE_LIFT: Partial<Record<GeometryKind, number>> = {
  box: 0.5,
  sphere: 0.5,
  plane: 0,
  cylinder: 0.5,
  cone: 0.5,
  torus: 0.7,
}

const PRIMITIVES: GeometryKind[] = ['box', 'sphere', 'plane', 'cylinder', 'cone', 'torus']

const LIGHTS: LightKind[] = ['directional', 'point', 'spot', 'ambient']

/** 粒子预设的默认外观（与微信端 PARTICLE_PRESET_CFG 的色系对齐） */
const PARTICLES: {
  preset: ParticlePreset
  name: string
  color: string
  spread: [number, number, number]
  additive: boolean
  lift: number
}[] = [
  { preset: 'fire', name: '火焰', color: '#ff8a3d', spread: [1, 2, 1], additive: true, lift: 0 },
  { preset: 'smoke', name: '烟雾', color: '#9a9aa5', spread: [1.2, 1.6, 1.2], additive: false, lift: 0 },
  { preset: 'energy', name: '能量', color: '#00e5ff', spread: [0.8, 1.4, 0.8], additive: true, lift: 0 },
  // 飘雪从顶部往下落（spread.y < 0），节点放在空中
  { preset: 'snow', name: '飘雪', color: '#ffffff', spread: [4, -3, 4], additive: false, lift: 2 },
]

/**
 * 内置特效：mesh 节点 + props.effect。
 * blackhole / energy 的渲染已存在（对齐 game/effects.ts 预制体）；
 * dissolve / hologram / shockwave 由特效渲染层按 props.effect 契约识别。
 */
const EFFECTS: { effect: string; name: string; props: Record<string, unknown> }[] = [
  {
    effect: 'blackhole',
    name: '黑洞',
    props: {
      geometryParams: { radius: 0.5, widthSegments: 48, heightSegments: 32 },
      material: { ...defaultMaterial(), color: '#000000', metalness: 0, roughness: 0.2 },
    },
  },
  {
    effect: 'energy',
    name: '能量球',
    props: {
      geometryParams: { radius: 0.42, widthSegments: 40, heightSegments: 28 },
      material: {
        ...defaultMaterial(),
        color: '#00e5ff',
        metalness: 0.1,
        roughness: 0.15,
        emissive: '#00e5ff',
        emissiveIntensity: 2,
      },
    },
  },
  { effect: 'dissolve', name: '溶解', props: {} },
  { effect: 'hologram', name: '全息', props: {} },
  { effect: 'shockwave', name: '冲击波', props: {} },
]

/** 层级树行 / 视口节点的右键操作菜单（对标 Unity Hierarchy 节点菜单） */
export function buildNodeMenu(id: string): MenuItem[] {
  const store = useEditor.getState()
  const node = store.nodes[id]
  if (!node) return []
  return [
    { label: '添加子物体', icon: 'plus', children: buildCreateObjectMenu({ kind: 'child', parentId: id }) },
    { separator: true },
    { label: '聚焦', icon: 'maximize', onClick: () => store.focusNode(id) },
    { label: '复制', icon: 'copy', onClick: () => store.duplicateNode(id) },
    {
      label: node.locked ? '解锁' : '锁定',
      icon: node.locked ? 'lock-open' : 'lock',
      onClick: () => store.toggleLocked(id),
    },
    { separator: true },
    { label: '删除', icon: 'trash-2', danger: true, onClick: () => store.removeNode(id) },
  ]
}

/** 视口创建时的放置高度：默认贴地，可按类型抬升 */
const liftPosition = (
  target: CreateTarget,
  lift: number
): [number, number, number] | undefined =>
  target.kind === 'ground'
    ? [target.position[0], target.position[1] + lift, target.position[2]]
    : undefined

export function buildCreateObjectMenu(target: CreateTarget): MenuItem[] {
  const parentId = target.kind === 'child' ? target.parentId : null
  const add = (type: NodeType, options?: AddNodeOptions) =>
    useEditor.getState().addNode(type, parentId, options)

  return [
    {
      label: '3D 物体',
      icon: 'box',
      children: PRIMITIVES.map((geometry) => ({
        label: GEOMETRY_LABEL[geometry],
        onClick: () =>
          add('mesh', {
            name: GEOMETRY_LABEL[geometry],
            geometry,
            position: liftPosition(target, PRIMITIVE_LIFT[geometry] ?? 0),
            // 平面默认立在 XY 面，对标 Unity 让它躺平贴地
            ...(geometry === 'plane' ? { rotation: [-Math.PI / 2, 0, 0] as [number, number, number] } : {}),
          }),
      })),
    },
    {
      label: '灯光',
      icon: 'lightbulb',
      children: LIGHTS.map((light) => ({
        label: LIGHT_LABEL[light],
        onClick: () =>
          add('light', {
            name: LIGHT_LABEL[light],
            props: { light, ...LIGHT_DEFAULTS[light], castShadow: light !== 'ambient' },
            // 点光/聚光放在空中才能照到场景；环境光无方向，位置无所谓
            position: liftPosition(target, light === 'ambient' ? 0 : 3),
          }),
      })),
    },
    {
      label: '粒子',
      icon: 'sparkle',
      children: PARTICLES.map((p) => ({
        label: p.name,
        onClick: () =>
          add('particle', {
            name: p.name,
            props: { preset: p.preset, color: p.color, spread: p.spread, additive: p.additive },
            position: liftPosition(target, p.lift),
          }),
      })),
    },
    {
      label: '特效',
      icon: 'sparkles',
      children: EFFECTS.map((fx) => ({
        label: fx.name,
        onClick: () =>
          add('mesh', {
            name: fx.name,
            geometry: 'sphere',
            props: { ...fx.props, effect: fx.effect },
            // 特效球悬浮在半空，不与地面穿插
            position: liftPosition(target, 1),
          }),
      })),
    },
    { separator: true },
    {
      label: '空对象',
      icon: 'circle',
      onClick: () => add('group', { name: '空对象', position: liftPosition(target, 0) }),
    },
    {
      label: '模型',
      icon: 'package',
      onClick: () => add('model', { name: '模型', position: liftPosition(target, 0) }),
    },
  ]
}
