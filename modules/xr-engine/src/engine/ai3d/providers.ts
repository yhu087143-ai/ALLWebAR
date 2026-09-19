import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import {
  type GenerateRequest,
  type GenerateResult,
  type IModelProvider,
  type ProgressCallback,
  type ProviderInfo,
  type TaskStatus,
  findProviderInfo,
} from './types'

const POLL_INTERVAL_MS = 1200
const POLL_TIMEOUT_MS = 5 * 60 * 1000

const resolveUrl = (base: string, url: string): string => {
  if (/^https?:\/\//.test(url)) return url
  return `${base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
}

/**
 * 远程 Provider：所有请求都发往本地后端代理。
 *
 * 为什么不让浏览器直连 Tripo / Meshy？
 *   1. 第三方 API 普遍不开放浏览器 CORS
 *   2. API Key 放在前端等于公开
 *   3. 本地 GPU 推理本来就必须在后端跑
 * 统一走后端后，前端对 local / cloud 两种后端是同一套代码。
 */
export class RemoteModelProvider implements IModelProvider {
  readonly info: ProviderInfo

  constructor(
    private readonly baseUrl: string,
    providerId: string
  ) {
    this.info = findProviderInfo(providerId)
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/v1/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(4000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async generate(request: GenerateRequest, onProgress?: ProgressCallback): Promise<GenerateResult> {
    const base = this.baseUrl.replace(/\/$/, '')
    // 带图片走 FormData 入口，纯提示词走 JSON 入口
    const endpoint = request.image
      ? `${base}/api/v1/generate/form`
      : `${base}/api/v1/generate`

    let body: BodyInit
    const headers: Record<string, string> = {}

    if (request.image) {
      const form = new FormData()
      form.append('provider', request.providerId)
      form.append('kind', request.kind)
      if (request.prompt) form.append('prompt', request.prompt)
      form.append('image', request.image, 'input.png')
      if (request.options) form.append('options', JSON.stringify(request.options))
      body = form
    } else {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify({
        provider: request.providerId,
        kind: request.kind,
        prompt: request.prompt,
        options: request.options ?? {},
      })
    }

    const created = await fetch(endpoint, { method: 'POST', headers, body })
    if (!created.ok) {
      throw new Error(`后端返回 ${created.status}: ${await created.text().catch(() => '')}`)
    }

    const { taskId } = (await created.json()) as { taskId: string }
    const status = await this.poll(taskId, onProgress)

    if (status.state !== 'succeeded' || !status.resultUrl) {
      throw new Error(status.error ?? '生成失败，后端未返回结果')
    }

    const asset = await fetch(resolveUrl(this.baseUrl, status.resultUrl))
    if (!asset.ok) throw new Error(`下载模型失败: HTTP ${asset.status}`)

    return {
      data: await asset.arrayBuffer(),
      meta: status.meta ?? {},
    }
  }

  private async poll(taskId: string, onProgress?: ProgressCallback): Promise<TaskStatus> {
    const started = Date.now()
    const base = this.baseUrl.replace(/\/$/, '')

    while (Date.now() - started < POLL_TIMEOUT_MS) {
      const res = await fetch(`${base}/api/v1/task/${taskId}`)
      if (!res.ok) throw new Error(`轮询任务失败: HTTP ${res.status}`)

      const status = (await res.json()) as TaskStatus
      onProgress?.(status)

      if (status.state === 'succeeded' || status.state === 'failed') return status
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }

    throw new Error('生成超时（5 分钟）')
  }
}

/**
 * 离线演示 Provider：不需要任何后端，直接程序化生成 GLB。
 * 用来在没有 GPU 服务时验证「生成 -> 优化 -> 入库 -> 进场景」整条链路。
 */
export class MockModelProvider implements IModelProvider {
  readonly info: ProviderInfo = {
    id: 'mock',
    name: '内置演示（离线）',
    kind: 'local',
    description: '无需后端，生成程序化几何体用于验证流水线',
    supportsText: true,
    supportsImage: false,
    eta: '即时',
  }

  async health(): Promise<boolean> {
    return true
  }

  async generate(request: GenerateRequest, onProgress?: ProgressCallback): Promise<GenerateResult> {
    const report = (progress: number, stage: string) =>
      onProgress?.({ taskId: 'mock', state: 'running', progress, stage })

    report(0.15, '解析提示词')

    const seed = this.hash(request.prompt ?? 'xr engine')
    const geometry = this.buildGeometry(seed)
    await new Promise((r) => setTimeout(r, 120))
    report(0.55, '生成网格')

    const color = new THREE.Color().setHSL((seed % 360) / 360, 0.55, 0.55)
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.35,
      roughness: 0.3,
      flatShading: seed % 3 === 0,
    })

    const scene = new THREE.Scene()
    scene.add(new THREE.Mesh(geometry, material))
    report(0.8, '导出 GLB')

    const data = await this.exportGLB(scene)
    report(1, '完成')

    return {
      data,
      meta: {
        triangles: Math.round(
          ((geometry.index?.count ?? geometry.attributes.position.count) / 3)
        ),
        generator: 'mock',
      },
    }
  }

  private buildGeometry(seed: number): THREE.BufferGeometry {
    const variants = [
      () => new THREE.TorusKnotGeometry(0.55, 0.18, 160, 32),
      () => new THREE.IcosahedronGeometry(0.7, seed % 3 === 0 ? 2 : 1),
      () => new THREE.DodecahedronGeometry(0.7, 0),
      () => {
        const geo = new THREE.SphereGeometry(0.7, 48, 32)
        const pos = geo.attributes.position
        for (let i = 0; i < pos.count; i += 1) {
          const noise = 1 + 0.22 * Math.sin(pos.getX(i) * 6 + seed) * Math.cos(pos.getY(i) * 5)
          pos.setXYZ(i, pos.getX(i) * noise, pos.getY(i) * noise, pos.getZ(i) * noise)
        }
        geo.computeVertexNormals()
        return geo
      },
    ]
    return variants[seed % variants.length]()
  }

  private exportGLB(scene: THREE.Scene): Promise<ArrayBuffer> {
    const exporter = new GLTFExporter()
    return new Promise((resolve, reject) => {
      exporter.parse(
        scene,
        (result) => resolve(result as ArrayBuffer),
        (err) => reject(err),
        { binary: true }
      )
    })
  }

  private hash(text: string): number {
    let h = 2166136261
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return Math.abs(h)
  }
}
