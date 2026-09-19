import { nanoid } from 'nanoid'
import type {
  EnvironmentConfig,
  GeometryKind,
  LightKind,
  MaterialProps,
  NodeProps,
  NodeType,
  PostFXConfig,
  SceneNode,
  Transform,
} from './types'

export const identityTransform = (): Transform => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
})

export const defaultMaterial = (): MaterialProps => ({
  color: '#c8ccd4',
  metalness: 0.1,
  roughness: 0.45,
  emissive: '#000000',
  emissiveIntensity: 0,
  opacity: 1,
  wireframe: false,
  flatShading: false,
  map: null,
  roughnessMap: null,
  metalnessMap: null,
  normalMap: null,
  emissiveMap: null,
  aoMap: null,
})

/** 每种几何体对应的可调参数，Inspector 会据此动态生成控件 */
export const GEOMETRY_PARAMS: Record<GeometryKind, Record<string, number>> = {
  box: {
    width: 1,
    height: 1,
    depth: 1,
    widthSegments: 1,
    heightSegments: 1,
    depthSegments: 1,
  },
  sphere: { radius: 0.5, widthSegments: 32, heightSegments: 16 },
  plane: { width: 1, height: 1, widthSegments: 1, heightSegments: 1 },
  cylinder: { radiusTop: 0.5, radiusBottom: 0.5, height: 1, radialSegments: 32 },
  cone: { radius: 0.5, height: 1, radialSegments: 32 },
  torus: { radius: 0.5, tube: 0.2, radialSegments: 16, tubularSegments: 64 },
  icosahedron: { radius: 0.5, detail: 0 },
}

/** 这些参数必须是整数，Inspector 的步进与取整依赖此表 */
export const INTEGER_PARAMS = new Set([
  'widthSegments',
  'heightSegments',
  'radialSegments',
  'tubularSegments',
  'detail',
])

export const LIGHT_DEFAULTS: Record<LightKind, { intensity: number; distance: number; angle: number }> = {
  ambient: { intensity: 1.0, distance: 0, angle: Math.PI / 6 },
  directional: { intensity: 2.5, distance: 0, angle: Math.PI / 6 },
  point: { intensity: 8, distance: 12, angle: Math.PI / 6 },
  spot: { intensity: 20, distance: 20, angle: Math.PI / 6 },
}

export function defaultProps(type: NodeType): NodeProps {
  switch (type) {
    case 'mesh':
      return {
        kind: 'mesh',
        geometry: 'box',
        geometryParams: { ...GEOMETRY_PARAMS.box },
        material: defaultMaterial(),
        castShadow: true,
        receiveShadow: true,
      }
    case 'light': {
      const light: LightKind = 'directional'
      return {
        kind: 'light',
        light,
        color: '#ffffff',
        ...LIGHT_DEFAULTS[light],
        castShadow: true,
      }
    }
    case 'model':
      return {
        kind: 'model',
        assetId: null,
        activeAnimation: null,
        animationSpeed: 1,
        normalizeModel: true,
        castShadow: true,
        receiveShadow: true,
      }
    case 'particle':
      return {
        kind: 'particle',
        preset: 'fire',
        count: 2000,
        color: '#ff8a3d',
        size: 8,
        speed: 1,
        spread: [1, 2, 1],
        additive: true,
      }
    case 'gaussian-splat':
      return {
        kind: 'gaussian-splat',
        assetId: null,
        splatScale: 1,
        minAlpha: 0.01,
      }
    case 'group':
    default:
      return { kind: 'group' }
  }
}

export function createNode(type: NodeType, name?: string): SceneNode {
  return {
    id: nanoid(10),
    name: name ?? type,
    type,
    parentId: null,
    children: [],
    transform: identityTransform(),
    visible: true,
    locked: false,
    props: defaultProps(type),
  }
}

/** 切换几何体类型时保留同名参数，其余用新默认值补齐 */
export function remapGeometryParams(
  kind: GeometryKind,
  previous: Record<string, number>
): Record<string, number> {
  const next = { ...GEOMETRY_PARAMS[kind] }
  for (const key of Object.keys(next)) {
    if (typeof previous[key] === 'number') next[key] = previous[key]
  }
  return next
}

export const defaultEnvironment = (): EnvironmentConfig => ({
  preset: 'studio',
  background: false,
  blur: 0.02,
  intensity: 1,
  hdriAssetId: null,
})

export const defaultPostFX = (): PostFXConfig => ({
  enabled: true,
  bloom: {
    enabled: true,
    intensity: 0.6,
    luminanceThreshold: 0.85,
    luminanceSmoothing: 0.3,
    radius: 0.75,
  },
  depthOfField: {
    enabled: false,
    focusDistance: 0.02,
    focalLength: 0.05,
    bokehScale: 3,
  },
  vignette: { enabled: false, darkness: 0.3, offset: 0.35 },
  chromaticAberration: { enabled: false, offset: [0.0008, 0.0006] },
  noise: { enabled: false, opacity: 0.035 },
  toneMapping: { enabled: true, exposure: 1.4 },
})

/** 类型名 -> 展示名，用于层级树与 Inspector 标题 */
export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  group: '空对象',
  mesh: '网格',
  light: '灯光',
  model: '模型',
  particle: '粒子',
  'gaussian-splat': '高斯泼溅',
}

export const GEOMETRY_LABEL: Record<GeometryKind, string> = {
  box: '立方体',
  sphere: '球体',
  plane: '平面',
  cylinder: '圆柱',
  cone: '圆锥',
  torus: '圆环',
  icosahedron: '多面体',
}

export const LIGHT_LABEL: Record<LightKind, string> = {
  ambient: '环境光',
  directional: '平行光',
  point: '点光源',
  spot: '聚光灯',
}
