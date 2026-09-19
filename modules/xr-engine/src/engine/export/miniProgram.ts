import type { Engine } from '@/engine/core/Engine'
import { transpileGLSL } from './glsl'

/**
 * 把当前 Web 引擎场景导出为“微信小程序/小游戏运行时可用”的简化 JSON。
 * 目前是 v1：节点、变换、材质、脚本、资产元数据都能导出；
 * 后续接入 xr-frame 时，由小程序端 wxar-runtime 直接解释这份 JSON。
 *
 * 导出侧唯一要做的「转译」是把自定义 shader 从 GLSL 300 降级到
 * 微信端支持的 GLSL ES 100；材质/灯光/粒子/几何的映射交给 wxar-runtime。
 */

/** 递归把节点上的自定义 shader 转译为 GLSL ES 100 */
function transpileNodeShaders(node: Record<string, unknown>): void {
  const props = node.props as
    | { customShader?: { vertex?: string; fragment?: string } }
    | undefined
  const cs = props?.customShader
  if (cs) {
    if (cs.vertex) cs.vertex = transpileGLSL(cs.vertex, 'vertex').code
    if (cs.fragment) cs.fragment = transpileGLSL(cs.fragment, 'fragment').code
  }
  for (const child of (node.children as Record<string, unknown>[] | undefined) ?? []) {
    transpileNodeShaders(child)
  }
}

/**
 * 高斯泼溅（3DGS）只有 Web 端渲染能力，微信 xr-frame / wxar 运行时都不支持。
 * 导出时剔除这些节点并显式告警，避免「导出成功但内容静默消失」
 * （兼容性检查里同步报 error，见 compatibility.ts）。
 */
function filterGaussianSplatNodes(nodes: Record<string, unknown>[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const node of nodes) {
    const type = String(node.type ?? '')
    const kind = (node.props as { kind?: string } | undefined)?.kind
    if (type === 'gaussian-splat' || kind === 'gaussian-splat') {
      console.warn(`[export] 高斯泼溅节点「${String(node.name ?? node.id)}」微信端不支持，已从导出结果中剔除`)
      continue
    }
    node.children = filterGaussianSplatNodes((node.children ?? []) as Record<string, unknown>[])
    out.push(node)
  }
  return out
}

function entityToNode(entity: import('@/engine/runtime/Entity').Entity): Record<string, unknown> {
  return {
    id: entity.id,
    name: entity.name,
    type: (entity.props as { kind?: string })?.kind ?? 'group',
    transform: entity.transform,
    visible: entity.active,
    script: (entity.props as { script?: string })?.script ?? undefined,
    props: entity.props,
    children: entity.children.map((child) => entityToNode(child)),
  }
}

function worldNodes(world: import('@/engine/runtime/World').World): Record<string, unknown>[] {
  return world.roots.map((root) => entityToNode(root))
}
export function buildMiniProgramScene(engine: Engine): Record<string, unknown> {
  const graph = engine.graph
  const runtimeNodes = worldNodes(engine.game.world)
  let nodes = runtimeNodes.length > 0 ? runtimeNodes : graph.rootIds.map((rootId) => {
    const walk = (id: string): Record<string, unknown> => {
      const node = graph.get(id)!
      return {
        id,
        name: node.name,
        type: node.type,
        transform: node.transform,
        visible: node.visible,
        script: node.script || undefined,
        props: node.props,
        children: node.children.map(walk),
      }
    }
    return walk(rootId)
  })

  // 深拷贝：后续导出流程（AR_SCALE 哨兵改写 transform、shader 降级改写 props）
  // 会就地修改节点数据，不能让它们写进编辑器实时场景图
  nodes = JSON.parse(JSON.stringify(nodes)) as typeof nodes

  // 微信端不支持高斯泼溅：剔除并告警（不能静默丢失）
  nodes = filterGaussianSplatNodes(nodes)

  // 父子绑定物化：挂在轨迹节点下的子节点隐式跟随父轨迹，
  // 导出时物化为显式 pathFollow 组件，小程序端 ES5 运行时无需感知父子语义
  materializeParentPathFollows(nodes)

  // 导出时统一把自定义 shader 降级为 GLSL ES 100
  for (const root of nodes) transpileNodeShaders(root)

  return {
    version: 1,
    engine: 'xr-engine',
    target: 'wechat-miniprogram/xr-frame',
    name: engine.projectName,
    environment: engine.environment,
    postfx: engine.postfx,
    assets: engine.assets.list().map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      uri: a.uri,
      size: a.size,
      triangles: a.triangles || 0,
      meta: a.meta,
    })),
    nodes,
  }
}

/**
 * 父子绑定 → 显式组件：父节点携带 path 组件时，其下没有显式 pathFollow
 * 的子节点自动补一个 { pathId: 父节点id }（Web 端 NodeRenderer 同语义）。
 * 显式组件已存在时尊重用户配置（包括 pathId=null 的「明确不跟随」）。
 */
function materializeParentPathFollows(nodes: Record<string, unknown>[]): void {
  const walk = (list: Record<string, unknown>[], parentPathId: string | null): void => {
    for (const node of list) {
      const props = (node.props ?? {}) as { components?: Record<string, unknown>[] }
      const comps = Array.isArray(props.components) ? props.components : []
      const selfIsPath = comps.some((c) => c?.type === 'path')
      if (parentPathId && !comps.some((c) => c?.type === 'pathFollow')) {
        props.components = [
          ...comps,
          { type: 'pathFollow', pathId: parentPathId, duration: 5, loop: 'loop' },
        ]
      }
      const nextParentPathId = selfIsPath ? String(node.id) : null
      walk((node.children ?? []) as Record<string, unknown>[], nextParentPathId)
    }
  }
  walk(nodes, null)
}

export function downloadMiniProgramScene(engine: Engine): void {
  downloadSceneDataJs(buildMiniProgramSceneDataJs(engine))
}

function downloadSceneDataJs(js: string): void {
  const blob = new Blob([js], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'scene-data.js'
  a.click()
  // 立即 revoke 会在部分浏览器截断还未开始的下载，延迟回收
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 一键导出链路：优先把 scene-data.js 直接推送到本地微信小程序项目
 * （scripts/receive-upload.mjs，仅本机开发用），微信开发者工具检测到
 * 文件变化会自动重新编译；推送失败（服务未启动）回退为浏览器下载。
 */
export async function exportMiniProgramSceneAuto(engine: Engine): Promise<'pushed' | 'downloaded'> {
  const js = buildMiniProgramSceneDataJs(engine)
  try {
    const res = await fetch('http://127.0.0.1:9911/save?name=' + encodeURIComponent('miniprogram/utils/scene-data.js'), {
      method: 'POST',
      body: js,
    })
    if (res.ok) return 'pushed'
  } catch {
    // 本地转发服务未启动 → 回退浏览器下载
  }
  downloadSceneDataJs(js)
  return 'downloaded'
}

/** 资产 id -> 安全的 JS 变量名片段 */
function safeId(id: string): string {
  return String(id).replace(/[^a-zA-Z0-9_]/g, '_')
}

interface CleanResult {
  nodes: Record<string, unknown>[]
  usedPathIds: Set<string>
}

/**
 * 清理节点表，适配平面 AR：
 * - 去掉 visible=false 的隐藏节点（编辑器残留的重复模型）
 * - 去掉地面（AR 用摄像头拍到的真实地面）
 * - 去掉没被任何 pathFollow 引用的孤立 path 轨迹
 */
function cleanNodesForAr(nodes: Record<string, unknown>[]): CleanResult {
  const usedPathIds = new Set<string>()
  const walk = (list: Record<string, unknown>[]): Record<string, unknown>[] => {
    const out: Record<string, unknown>[] = []
    for (const node of list) {
      const visible = node.visible !== false
      const props = (node.props ?? {}) as {
        geometry?: string
        components?: { type?: string; pathId?: string }[]
      }
      const isGround =
        node.type === 'mesh' &&
        props.geometry === 'plane' &&
        // ground 必须整词匹配：否则 Playground/Background 会被误删（CJK 无词边界概念，保持子串）
        /地面|\bground\b/i.test(String(node.name ?? ''))
      if (!visible || isGround) continue

      const children = walk((node.children ?? []) as Record<string, unknown>[])
      const cleaned: Record<string, unknown> = { ...node, children }

      const comps = props.components ?? []
      for (const c of comps) {
        if (c?.type === 'pathFollow' && c.pathId) usedPathIds.add(c.pathId)
      }
      out.push(cleaned)
    }
    return out
  }
  const cleaned = walk(nodes)
  // 二次过滤：删除未被引用的 path 轨迹节点
  const filterOrphanPaths = (list: Record<string, unknown>[]): Record<string, unknown>[] =>
    list
      .filter((node) => {
        const props = (node.props ?? {}) as { components?: { type?: string }[] }
        const isPath = (props.components ?? []).some((c) => c?.type === 'path')
        return !(isPath && !usedPathIds.has(String(node.id)))
      })
      .map((node) => ({
        ...node,
        children: filterOrphanPaths((node.children ?? []) as Record<string, unknown>[]),
      }))
  return { nodes: filterOrphanPaths(cleaned), usedPathIds }
}

/**
 * 生成小程序端可直接使用的 utils/scene-data.js：
 * - 资产 blob:/本地地址替换为 CDN 占位常量（用户上传 GLB 后改一处即可）
 * - 模型节点自动应用 MODEL_AR_SCALE（厘米 -> 米）
 * - postfx 强制关闭（微信不支持 Bloom/ToneMapping 等后处理）
 * - 移除地面、隐藏节点与孤立轨迹
 */
export function buildMiniProgramSceneDataJs(engine: Engine): string {
  const scene = buildMiniProgramScene(engine)

  const rawAssets = (scene.assets ?? []) as {
    id: string
    name: string
    kind: string
    uri: string
    triangles?: number
  }[]
  // 模型/贴图/音频/环境贴图都可能需要上传 CDN（微信无法访问 blob:/本地地址）
  const CDN_KINDS = new Set(['model', 'texture', 'audio', 'hdri'])
  const cdnAssets = rawAssets.filter((a) => CDN_KINDS.has(a.kind))
  // 占位 URL 的默认扩展名（上传 CDN 后按实际文件改）
  const CDN_PLACEHOLDER_EXT: Record<string, string> = { model: 'glb', audio: 'mp3', hdri: 'hdr' }

  // 每个需要 CDN 的资产一个 URL 常量；blob:/data:/相对路径都视为「需要上传 CDN」
  const urlVars = new Map<string, string>() // assetId -> JS 变量名
  const urlValues = new Map<string, string>() // 变量名 -> 字面量
  const urlComments = new Map<string, string>()
  for (const a of cdnAssets) {
    const varName = `URL_${safeId(a.id).toUpperCase()}`
    urlVars.set(a.id, varName)
    if (/^https?:\/\//.test(a.uri)) {
      urlValues.set(varName, a.uri)
      urlComments.set(varName, `${a.name}（已是在线地址，确认可公网访问且域名已加入小程序白名单）`)
    } else {
      // audio/hdri 此前会原样带着 blob: URI 导出，微信端静默失效，这里显眼告警
      if (a.kind === 'audio' || a.kind === 'hdri') {
        console.warn(`[export] ${a.kind} 资产「${a.name}」是本地/blob 地址，微信端无法访问，已替换为 CDN 占位符，请上传后替换`)
      }
      urlValues.set(varName, `https://your-cdn.example.com/${a.name.replace(/\.[^.]+$/, '')}.${CDN_PLACEHOLDER_EXT[a.kind] ?? 'png'}`)
      urlComments.set(varName, `TODO: 把 ${a.name} 上传到 CDN 后替换这个地址（编辑器资产库点「下载」可导出原文件）`)
    }
  }

  const { nodes } = cleanNodesForAr((scene.nodes ?? []) as Record<string, unknown>[])

  // 模型节点：scale 引用 MODEL_AR_SCALE（编辑器 scale=1 时直接用变量，否则乘系数）
  const AR_TOKEN = '__AR_SCALE__'
  const patchModelScales = (list: Record<string, unknown>[]): void => {
    for (const node of list) {
      const kind = (node.props as { kind?: string } | undefined)?.kind
      if (node.type === 'model' || kind === 'model') {
        const t = (node.transform ?? {}) as { scale?: number[] }
        const s = t.scale ?? [1, 1, 1]
        // 哨兵字符串稍后替换为 MODEL_AR_SCALE 变量引用
        t.scale = s.map((v) => (v === 1 ? AR_TOKEN : `__AR_SCALE_X_${v}__`)) as unknown as number[]
        const props = (node.props ?? {}) as { assetId?: string; modelUrl?: string; src?: string }
        const varName = props.assetId ? urlVars.get(props.assetId) : undefined
        if (varName) {
          if ('modelUrl' in props) props.modelUrl = `__URL_${varName}__`
          if ('src' in props) props.src = `__URL_${varName}__`
        }
      }
      patchModelScales((node.children ?? []) as Record<string, unknown>[])
    }
  }
  patchModelScales(nodes)

  const outScene = {
    version: scene.version,
    engine: scene.engine,
    target: scene.target,
    name: scene.name,
    environment: scene.environment,
    postfx: { enabled: false }, // 微信小程序不支持 Bloom/ToneMapping 等全屏后处理
    // 运行时调试开关（排查「模型看不见」时用，屏幕底部有实时日志）：
    //   noAr=true 内容挂场景根，绕过平面识别直接显示；确认显示正常后改回 false
    //   disableAnim=true 禁用骨骼动画，排查蒙皮兼容性
    debug: { disableAnim: false, noAr: false },
    assets: rawAssets.map((a) => {
      const varName = urlVars.get(a.id)
      return {
        id: a.id,
        name: a.name,
        kind: a.kind,
        uri: varName ? `__URL_${varName}__` : a.uri,
        triangles: a.triangles ?? 0,
      }
    }),
    nodes,
  }

  let body = JSON.stringify(outScene, null, 2)
  // 字符串哨兵 -> 变量引用（去引号）
  body = body
    .replace(/"__URL_(URL_[A-Z0-9_]+)__"/g, '$1')
    .replace(/"__AR_SCALE__"/g, '(MODEL_AR_SCALE)')
    .replace(/"__AR_SCALE_X_([0-9.eE+-]+)__"/g, '(MODEL_AR_SCALE * $1)')

  const header = [
    '/**',
    ' * scene-data.js —— 由 XR 引擎编辑器「导出小程序场景」生成',
    ' * 用法：直接覆盖微信小程序项目的 miniprogram/utils/scene-data.js',
    ' *',
    ' * 发布前 checklist（按实际踩坑经验整理）：',
    ' *  1. 模型：编辑器「减面优化」→ 资产库点「下载」→ 上传 CDN → 替换下面的 URL 常量',
    ' *  2. 白名单：公众平台 downloadFile 合法域名只填纯域名（不带 https:// 协议头），',
    ' *     且必须是 https、已备案（COS/CDN 官方域名一般已备案）',
    ' *  3. 真机看不到模型？先把下面 debug.noAr 改成 true 验证显示，',
    ' *     屏幕底部有实时日志（CDN预检/GLTF探针/心跳），无需打开 vConsole',
    ' *  4. 平面 AR：识别地面后内容自动放置；noAr 验证通过后改回 false',
    ' */',
    '',
  ].join('\n')

  const varLines: string[] = [
    '// 模型缩放：本引擎导出的 GLB 已归一化（最长边≈1米、脚底贴地），AR 里直接用 1。',
    '// 若模型在 AR 里大/小约 100 倍，说明 GLB 未归一化（厘米单位），改成 0.01。',
    'var MODEL_AR_SCALE = 1',
    '',
  ]
  for (const [varName, value] of urlValues) {
    varLines.push(`// ${urlComments.get(varName)}`)
    varLines.push(`var ${varName} = '${value}'`)
    varLines.push('')
  }

  return `${header}${varLines.join('\n')}module.exports = {\n  scene: ${body}\n}\n`
}
