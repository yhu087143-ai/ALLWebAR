/**
 * 微信小程序 xr-frame / WebXR 兼容性检查。
 *
 * 这个引擎不是把 Three.js 编译成微信，而是：
 *  - 同一份纯数据场景
 *  - Web 端由 Three.js 渲染器解释
 *  - 微信端由 wxar-runtime 解释
 *  - 特效名称是跨端描述符，各端用自己的原生实现渲染
 */
import { transpileGLSL } from './glsl'

/** 微信 xr-frame 内置几何只有这 4 种，其余需降级 */
const WECHAT_GEOMETRY: Record<string, string> = {
  box: 'cube',
  sphere: 'sphere',
  plane: 'plane',
  cylinder: 'cylinder',
}

/** 引擎支持、但 xr-frame 没有的几何，需退化为近似形状 */
const DEGRADED_GEOMETRY: Record<string, string> = {
  cone: 'cylinder',
  torus: 'sphere',
  icosahedron: 'sphere',
}

/**
 * 跨端都能识别的特效别名（与 NodeRenderer / ThreeRuntimeRenderer /
 * wxar-runtime 的判定保持一致）：黑洞系 + 能量球系 + 溶解/全息/冲击波。
 * 别名不在此表的 effect 才会被判「未识别」，避免合法配置被误报。
 */
const KNOWN_EFFECTS = new Set([
  'blackhole', 'black-hole', 'black_hole',
  'energy', 'energy-ball', 'energy_ball',
  'dissolve',
  'hologram', 'holo',
  'shockwave', 'shock-wave', 'shock_wave',
])

/** 材质 emissive 可能是 '#000000' / '#000' / 'black' / 数字 0，统一按颜色值比较 */
function isBlackColor(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'number') return value === 0
  const s = String(value).trim().toLowerCase()
  return s === '' || s === '#000' || s === '#000000' || s === 'black' || s === 'rgb(0,0,0)'
}

export interface CompatibilityIssue {
  level: 'ok' | 'info' | 'warn' | 'error'
  title: string
  detail: string
}

export interface CompatInput {
  nodes: Record<string, Record<string, unknown>>
  rootIds: string[]
  postfxEnabled?: boolean
  assets?: { name: string; kind?: string; size?: number; triangles?: number; meta?: Record<string, unknown> }[]
}

function walk(
  nodes: Record<string, Record<string, unknown>>,
  id: string,
  visit: (node: Record<string, unknown>) => void
): void {
  const node = nodes[id]
  if (!node) return
  visit(node)
  for (const child of (node.children as string[] | undefined) ?? []) walk(nodes, child, visit)
}

export function checkWeChatCompatibility(input: CompatInput): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = []
  const nodes = input.nodes

  if (input.postfxEnabled) {
    issues.push({
      level: 'warn',
      title: '后处理已开启',
      detail: '微信 xr-frame 不支持全屏后处理/Bloom。建议微信导出前关闭 PostFX，或分开维护两个场景。',
    })
  }

  let ambientCount = 0
  let directionalCount = 0
  let addLightCount = 0

  for (const id of input.rootIds) {
    walk(nodes, id, (node) => {
      const props = (node.props ?? {}) as Record<string, unknown>
      const type = String(node.type ?? '')
      const effect = props.effect ? String(props.effect) : ''

      if (type === 'gaussian-splat' || props.kind === 'gaussian-splat') {
        issues.push({
          level: 'error',
          title: '高斯泼溅节点不支持微信导出',
          detail:
            '微信 xr-frame / wxar 运行时均不支持 3D Gaussian Splatting，' +
            '导出时该节点会被剔除（微信端不显示）。请改用普通模型，或接受微信端缺失。',
        })
      }

      if (type === 'particle') {
        issues.push({
          level: 'ok',
          title: '粒子系统',
          detail: '微信端映射为原生 XRParticle（fire/smoke/energy/snow 预设），Web 端为 GPU Points。',
        })
      }

      if (KNOWN_EFFECTS.has(effect)) {
        issues.push({
          level: 'ok',
          title: `高级特效 ${effect}`,
          detail: '微信端使用 registerEffect + XRParticle 原生实现，Web 端使用 ShaderMaterial + GPU Points。视觉有平台差异，但功能可跑。',
        })
      }

      if (effect && !KNOWN_EFFECTS.has(effect)) {
        issues.push({
          level: 'warn',
          title: `未识别特效 ${effect}`,
          detail: '微信端没有对应 Effect 描述符，会退化为基础材质。',
        })
      }

      const geometry = props.geometry ? String(props.geometry) : ''
      if (geometry && DEGRADED_GEOMETRY[geometry]) {
        issues.push({
          level: 'warn',
          title: `几何体 ${geometry} 需降级`,
          detail: `微信 xr-frame 内置几何只有 cube/sphere/plane/cylinder，${geometry} 会自动退化为 ${DEGRADED_GEOMETRY[geometry]}。`,
        })
      }

      const material = props.material as {
        opacity?: number
        emissive?: string | number
        emissiveIntensity?: number
        map?: string | null
        normalMap?: string | null
        emissiveMap?: string | null
        metalnessMap?: string | null
        roughnessMap?: string | null
        aoMap?: string | null
        lightMap?: string | null
      } | undefined
      if (material && material.opacity != null && material.opacity < 1) {
        issues.push({
          level: 'warn',
          title: '不透明度',
          detail: '微信 xr-frame 标准材质默认不开启透明混合，opacity 会退化为不透明（仅保留 baseColor 的 alpha 值）。',
        })
      }
      if (!isBlackColor(material?.emissive)) {
        issues.push({
          level: 'ok',
          title: '自发光材质',
          detail: '会转译为 u_emissiveFactor，微信端支持。',
        })
      }
      if (material?.map || material?.normalMap || material?.emissiveMap || material?.metalnessMap || material?.roughnessMap) {
        issues.push({
          level: 'info',
          title: '贴图材质',
          detail: 'baseColor / normal / emissive / metallic / roughness 贴图会转译为 xr-frame 的 u_*Map uniform，导出时运行时自动加载对应纹理资产。',
        })
      }
      if (material?.aoMap || material?.lightMap) {
        issues.push({
          level: 'warn',
          title: 'AO / LightMap 贴图不支持',
          detail: '微信 xr-frame 标准材质没有 aoMap / lightMap 通道，导出后这些贴图会丢失。建议烘焙进 baseColor 贴图。',
        })
      }

      const customShader = props.customShader as { vertex?: string; fragment?: string } | undefined
      if (customShader?.vertex || customShader?.fragment) {
        const v = transpileGLSL(customShader.vertex, 'vertex')
        const f = transpileGLSL(customShader.fragment, 'fragment')
        if (!v.ok || !f.ok) {
          issues.push({
            level: 'error',
            title: '自定义 Shader 含无法转译的语法',
            detail: '微信 xr-frame 只支持 GLSL ES 100 子集，无法自动转译 layout/sampler3D/textureLod 等结构，请手动改写。',
          })
        } else {
          issues.push({
            level: 'info',
            title: '自定义 Shader',
            detail: `导出时会自动转译为 GLSL ES 100${[...v.notes, ...f.notes].length ? '（' + [...v.notes, ...f.notes].join('；') + '）' : ''}，微信端用 registerEffect 注册。`,
          })
        }
      }

      const light = props.light ? String(props.light) : ''
      if (type === 'light') {
        if (light === 'ambient') ambientCount++
        else if (light === 'directional') directionalCount++
        else if (light === 'point' || light === 'spot') addLightCount++
      }

      const customComponents = (props.components as { type?: string }[] | undefined) ?? []
      for (const c of customComponents) {
        const t = c.type ?? ''
        if (['tapGame', 'tapPlace', 'collectible', 'spawn', 'shooter', 'collision', 'move', 'moveTo', 'sunSpawner', 'dialogue', 'timeline', 'trigger', 'marker'].includes(t)) {
          issues.push({
            level: t === 'marker' ? 'info' : 'ok',
            title: `数据组件 ${t}`,
            detail: t === 'marker'
              ? '微信端会创建 xr-ar-tracker 并跟踪图片；Web 端按普通节点显示，不执行图片识别。'
              : 'Web 和微信运行时都支持同一份组件数据。',
          })
        } else if (t) {
          issues.push({
            level: 'warn',
            title: `未知数据组件 ${t}`,
            detail: '微信端可能忽略，需要确认。',
          })
        }
      }
    })
  }

  if (ambientCount > 1 || directionalCount > 1) {
    issues.push({
      level: 'warn',
      title: '灯光超限（主光源）',
      detail: `微信 xr-frame 只支持 1 盏环境光 + 1 盏主平行光，当前环境光 ${ambientCount} / 平行光 ${directionalCount}，多余的会被忽略。`,
    })
  }
  if (addLightCount > 4) {
    issues.push({
      level: 'warn',
      title: '灯光超限（追加光源）',
      detail: `微信 xr-frame 追加光（point/spot）最多 4 盏，当前 ${addLightCount}，多余的会被忽略。`,
    })
  }

  for (const asset of input.assets ?? []) {
    const tris = asset.triangles ?? 0
    if (tris > 100000) {
      issues.push({
        level: 'warn',
        title: `高面数资产 ${asset.name}`,
        detail: `${tris.toLocaleString()} 三角面，超出微信 AR 建议。请使用「减面」生成 optimized.glb。`,
      })
    }

    if (asset.kind === 'texture') {
      const bytes = asset.size ?? 0
      if (bytes > 2 * 1024 * 1024) {
        issues.push({
          level: 'warn',
          title: `大贴图 ${asset.name}`,
          detail: '纹理超过 2MB。微信端建议单张 ≤2048×2048 并转 KTX2/Basis（ASTC/ETC2）压缩，中端机显存与带宽更友好。',
        })
      }
    }
  }

  if (issues.length === 0) {
    issues.push({ level: 'ok', title: '未发现明显冲突', detail: '当前场景可用于微信导出。' })
  }

  return issues
}
