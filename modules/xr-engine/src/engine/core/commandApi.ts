import type { Engine } from './Engine'
import type { AssetKind, GeometryKind, NodeType, PostFXConfig, Transform } from './types'

/**
 * AI / 自动化命令接口。
 *
 * 「让 AI 操作引擎」的落地形态：一套**纯 JSON 命令**，LLM 生成 JSON，
 * 引擎逐条执行并返回结果。不暴露 JS 对象，因为：
 *   1. JSON 可以过网络（将来 AI 跑在云 4090 上，通过后端 WebSocket 下发）
 *   2. JSON 天然可校验，AI 幻觉出的非法字段会被拒收而不是炸引擎
 *   3. 同一套命令既能喂给 AI，也能录制成宏回放
 *
 * 用法（本地）：
 *   const api = new CommandAPI(engine)
 *   api.execute({ op: 'createNode', type: 'mesh', name: '球' })
 *
 * 用法（喂给 LLM）：把 SCHEMA_PROMPT 拼进 system prompt，
 * 模型输出的 JSON 塞进 executeBatch。
 */
export type Command =
  | { op: 'createNode'; type: NodeType; name?: string; parentId?: string | null }
  | { op: 'deleteNode'; nodeId: string }
  | { op: 'renameNode'; nodeId: string; name: string }
  | { op: 'setTransform'; nodeId: string; transform: Partial<Transform> }
  | { op: 'setGeometry'; nodeId: string; geometry: GeometryKind }
  | { op: 'setMaterial'; nodeId: string; material: { color?: string; metalness?: number; roughness?: number } }
  | { op: 'setPhysics'; nodeId: string; physics: { body: 'none' | 'dynamic' | 'static'; mass?: number; shape?: 'box' | 'sphere'; restitution?: number } }
  | { op: 'setScript'; nodeId: string; script: string }
  | { op: 'setPostFX'; effect: string; enabled: boolean; params?: Record<string, number> }
  | { op: 'setEnvironment'; preset: string }
  | { op: 'importAsset'; name: string; url: string; kind?: AssetKind }
  | { op: 'addModelNode'; assetId: string; parentId?: string | null }
  | { op: 'listAssets' }
  | { op: 'playSfx'; assetId: string; volume?: number }
  | { op: 'playBgm'; assetId: string; volume?: number; loop?: boolean }
  | { op: 'play' }
  | { op: 'stop' }
  | { op: 'query' }

export interface CommandResult {
  ok: boolean
  /** 失败原因，或 query 的场景摘要 */
  message?: string
  /** createNode 等操作产出的节点 id */
  nodeId?: string
}

/** 喂给 LLM 的接口说明。AI 只需要这一段就能驱动引擎 */
export const SCHEMA_PROMPT = `你可以通过 JSON 命令操作一个 3D 场景引擎。每条命令是一个对象：

{ "op": "createNode", "type": "mesh|group|light|particle|model", "name": "可选名字", "parentId": "可选父节点id或null" }
{ "op": "deleteNode", "nodeId": "..." }
{ "op": "renameNode", "nodeId": "...", "name": "新名字" }
{ "op": "setTransform", "nodeId": "...", "transform": { "position": [x,y,z], "rotation": [x,y,z弧度], "scale": [x,y,z] } }
{ "op": "setGeometry", "nodeId": "...", "geometry": "box|sphere|plane|cylinder|cone|torus|icosahedron" }
{ "op": "setMaterial", "nodeId": "...", "material": { "color": "#RRGGBB", "metalness": 0-1, "roughness": 0-1 } }
{ "op": "setPhysics", "nodeId": "...", "physics": { "body": "dynamic|static|none", "mass": 1, "shape": "box|sphere", "restitution": 0-1 } }
{ "op": "setScript", "nodeId": "...", "script": "return { onStart(ctx){}, onUpdate(ctx){ ctx.input.keys 有按键 } }" }
{ "op": "setPostFX", "effect": "bloom|vignette|depthOfField|noise|chromaticAberration", "enabled": true, "params": {"intensity": 1} }
{ "op": "setEnvironment", "preset": "studio|city|sunset|night|forest|dawn|apartment|warehouse" }
{ "op": "importAsset", "name": "模型名", "url": "http(s)://.../model.glb", "kind": "model|texture|hdri|audio" }
{ "op": "addModelNode", "assetId": "资产id", "parentId": "可选父节点" }
{ "op": "listAssets" } — 返回当前资产列表（id、名称、类型、面数、动画）
{ "op": "playSfx", "assetId": "音频资产id", "volume": 0.8 }
{ "op": "playBgm", "assetId": "音频资产id", "volume": 0.6, "loop": true }
{ "op": "play" } / { "op": "stop" }  — 进入/退出播放模式（跑物理和脚本）
{ "op": "query" } — 返回当前场景摘要（节点列表、id、类型、位置）

先 query 再操作。输出一个 JSON 数组，每项一条命令。`

export class CommandAPI {
  constructor(private readonly engine: Engine) {}

  execute(cmd: Command): CommandResult {
    try {
      switch (cmd.op) {
        case 'createNode': {
          const node = this.engine.graph.create(cmd.type, cmd.parentId ?? null)
          if (cmd.name) this.engine.graph.update(node.id, { name: cmd.name })
          return { ok: true, nodeId: node.id, message: `已创建「${cmd.name ?? cmd.type}」` }
        }

        case 'deleteNode': {
          if (!this.engine.graph.get(cmd.nodeId)) return this.notFound(cmd.nodeId)
          this.engine.graph.remove(cmd.nodeId)
          return { ok: true, message: '已删除' }
        }

        case 'renameNode': {
          if (!this.engine.graph.get(cmd.nodeId)) return this.notFound(cmd.nodeId)
          this.engine.graph.update(cmd.nodeId, { name: cmd.name })
          return { ok: true }
        }

        case 'setTransform': {
          if (!this.engine.graph.get(cmd.nodeId)) return this.notFound(cmd.nodeId)
          this.engine.graph.setTransform(cmd.nodeId, cmd.transform)
          return { ok: true }
        }

        case 'setGeometry': {
          if (!this.engine.graph.get(cmd.nodeId)) return this.notFound(cmd.nodeId)
          this.engine.graph.setGeometry(cmd.nodeId, cmd.geometry)
          return { ok: true }
        }

        case 'setMaterial': {
          const node = this.engine.graph.get(cmd.nodeId)
          if (!node) return this.notFound(cmd.nodeId)
          if (node.props.kind !== 'mesh') {
            return { ok: false, message: `节点「${node.name}」不是网格，没有材质` }
          }
          this.engine.graph.setProps(cmd.nodeId, {
            material: { ...node.props.material, ...cmd.material },
          })
          return { ok: true }
        }

        case 'setPhysics': {
          const node = this.engine.graph.get(cmd.nodeId)
          if (!node) return this.notFound(cmd.nodeId)
          if (node.props.kind !== 'mesh') {
            return { ok: false, message: `节点「${node.name}」不是网格，不能加物理` }
          }
          this.engine.graph.setProps(cmd.nodeId, {
            physics: { ...node.props.physics, ...cmd.physics },
          })
          return { ok: true }
        }

        case 'setScript': {
          const node = this.engine.graph.get(cmd.nodeId)
          if (!node) return this.notFound(cmd.nodeId)
          this.engine.graph.update(cmd.nodeId, { script: cmd.script })
          return { ok: true }
        }

        case 'setPostFX': {
          const postfx = this.engine.postfx as unknown as Record<string, unknown>
          const effect = postfx[cmd.effect]
          // postfx.enabled 这类顶层布尔不是特效对象，明确拒收而不是抛 TypeError
          if (!effect || typeof effect !== 'object') {
            return {
              ok: false,
              message: `未知特效：${cmd.effect}（可选 bloom/depthOfField/vignette/chromaticAberration/noise/toneMapping）`,
            }
          }
          // 走 patchPostFX 做不可变更新：原地改字段引用不变，zustand 比较不出差异，UI 不刷新
          this.engine.patchPostFX(cmd.effect as keyof PostFXConfig, {
            enabled: cmd.enabled,
            ...(cmd.params ?? {}),
          } as Partial<PostFXConfig[keyof PostFXConfig]>)
          return { ok: true }
        }

        case 'setEnvironment': {
          this.engine.setEnvironment({ preset: cmd.preset as never })
          return { ok: true }
        }

        case 'importAsset': {
          const record = this.engine.assets.add({
            name: cmd.name,
            kind: cmd.kind ?? 'model',
            source: 'library',
            uri: cmd.url,
          })
          return { ok: true, nodeId: record.id, message: `已接入资产「${cmd.name}」` }
        }

        case 'addModelNode': {
          const asset = this.engine.assets.get(cmd.assetId)
          if (!asset) return { ok: false, message: `资产不存在：${cmd.assetId}` }
          const node = this.engine.graph.create('model', cmd.parentId ?? null)
          const firstAnim = String(asset.meta.animations ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)[0] ?? null
          this.engine.graph.setProps(node.id, {
            assetId: asset.id,
            activeAnimation: firstAnim,
          })
          this.engine.graph.update(node.id, { name: asset.name.replace(/\.[^.]+$/, '') })
          return { ok: true, nodeId: node.id, message: `已把「${asset.name}」加入场景` }
        }

        case 'listAssets': {
          const assets = this.engine.assets.list().map((a) => ({
            id: a.id,
            name: a.name,
            kind: a.kind,
            triangles: a.triangles,
            animations: String(a.meta.animations ?? ''),
          }))
          return { ok: true, message: `资产库共 ${assets.length} 个：\n` + assets.map(a => `• ${a.name}（${a.kind}${a.animations ? `，动画：${a.animations}` : ''}）`).join('\n') }
        }

        case 'playSfx': {
          const asset = this.engine.assets.get(cmd.assetId)
          if (!asset || asset.kind !== 'audio') {
            return { ok: false, message: `音频资产不存在：${cmd.assetId}` }
          }
          this.engine.audio.register(asset.id, asset.uri)
          this.engine.audio.playSfx(asset.id, { volume: cmd.volume ?? 1 })
          return { ok: true, message: '已播放音效' }
        }

        case 'playBgm': {
          const asset = this.engine.assets.get(cmd.assetId)
          if (!asset || asset.kind !== 'audio') {
            return { ok: false, message: `音频资产不存在：${cmd.assetId}` }
          }
          this.engine.audio.register(asset.id, asset.uri)
          this.engine.audio.playBgm(asset.id, { volume: cmd.volume ?? 0.6, loop: cmd.loop ?? true })
          return { ok: true, message: '已播放背景音乐' }
        }

        case 'play':
        case 'stop': {
          const target = cmd.op === 'play'
          if (target === this.engine.play.active) {
            return { ok: true, message: target ? '已在播放中' : '已停止' }
          }
          if (target) this.engine.play.start(this.engine)
          else this.engine.play.stop(this.engine)
          return { ok: true }
        }

        case 'query': {
          return { ok: true, message: this.describeScene() }
        }

        default:
          return { ok: false, message: `未知命令：${String(cmd)}` }
      }
    } catch (err) {
      return { ok: false, message: `执行出错：${String(err)}` }
    }
  }

  /** 批量执行（LLM 一次输出的命令数组）。逐条执行，单条失败不断链 */
  executeBatch(cmds: Command[]): CommandResult[] {
    return cmds.map((cmd) => this.execute(cmd))
  }

  private describeScene(): string {
    const lines: string[] = []
    this.engine.graph.traverse((node) => {
      const [x, y, z] = node.transform.position
      lines.push(
        `• ${node.name}（${node.type}，id=${node.id}，位置 [${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}]${
          node.script ? '，带脚本' : ''
        }）`
      )
    })
    return lines.length
      ? `场景「${this.engine.projectName}」共 ${lines.length} 个节点：\n${lines.join('\n')}`
      : `场景「${this.engine.projectName}」是空的`
  }

  private notFound(nodeId: string): CommandResult {
    return { ok: false, message: `节点不存在：${nodeId}（建议先 query 拿到有效 id）` }
  }
}
