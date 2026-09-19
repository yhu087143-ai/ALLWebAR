import { useEffect, useRef, useState } from 'react'
import { engine, useEditor } from '@/editor/store'
import { PROVIDER_CATALOG } from '@/engine/ai3d/types'
import { NumberField, Section, SelectField, TextField } from '@/editor/ui/controls'

type Health = Record<string, 'unknown' | 'ok' | 'down'>

export function AIPanel() {
  const backendUrl = useEditor((s) => s.backendUrl)
  const setBackendUrl = useEditor((s) => s.setBackendUrl)
  const preferredProvider = useEditor((s) => s.preferredProvider)
  const setPreferredProvider = useEditor((s) => s.setPreferredProvider)
  const addModelNode = useEditor((s) => s.addModelNode)

  const [prompt, setPrompt] = useState('一只低多边形的机械狐狸')
  const [image, setImage] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ value: 0, stage: '' })
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<Health>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const info = PROVIDER_CATALOG.find((p) => p.id === preferredProvider) ?? PROVIDER_CATALOG[0]

  useEffect(() => {
    let cancelled = false
    // 服务地址是逐字符 onChange 的 TextField：防抖 400ms 再轮询，
    // 否则每敲一个键就对所有 provider 打一轮 checkHealth
    const timer = setTimeout(() => {
      const check = async () => {
        const next: Health = {}
        for (const provider of PROVIDER_CATALOG) {
          next[provider.id] = (await engine.ai3d.checkHealth(provider.id)) ? 'ok' : 'down'
        }
        if (!cancelled) setHealth(next)
      }
      void check()
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [backendUrl])

  const generate = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setProgress({ value: 0, stage: '提交任务' })

    try {
      const record = await engine.ai3d.generate(
        {
          providerId: preferredProvider,
          kind: image ? 'image-to-3d' : 'text-to-3d',
          prompt: image ? undefined : prompt,
          image: image ?? undefined,
        },
        (status) => setProgress({ value: status.progress, stage: status.stage })
      )
      addModelNode(record.id)
      setProgress({ value: 1, stage: '已加入场景' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setProgress({ value: 0, stage: '' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Section title="后端">
        <TextField label="服务地址" value={backendUrl} onChange={setBackendUrl} />
        <div className="hint">
          所有 AI 建模请求都经过本地后端代理，浏览器不直连第三方 API：
          既绕开了 CORS，也避免 API Key 暴露在前端。后端参考实现见项目里的
          <code> server/main.py </code>。
        </div>
      </Section>

      <Section title="模型提供方">
        <SelectField
          label="提供方"
          value={preferredProvider}
          options={PROVIDER_CATALOG.map((p) => ({ value: p.id, label: p.name }))}
          onChange={setPreferredProvider}
        />
        {PROVIDER_CATALOG.map((provider) => {
          const state = health[provider.id] ?? 'unknown'
          const active = provider.id === preferredProvider
          return (
            <div
              key={provider.id}
              onClick={() => setPreferredProvider(provider.id)}
              style={{
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent-soft)' : 'var(--bg-2)',
                borderRadius: 6,
                padding: '6px 8px',
                marginBottom: 5,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong style={{ fontSize: 12, fontWeight: 600 }}>{provider.name}</strong>
                <span className="spacer" style={{ flex: 1 }} />
                <span
                  className={`badge ${
                    state === 'ok' ? 'accent' : state === 'down' ? 'danger' : ''
                  }`}
                >
                  {state === 'ok' ? '可用' : state === 'down' ? '不可用' : '检测中'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-1)', marginTop: 2 }}>
                {provider.description}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-2)', marginTop: 2 }}>
                {provider.kind === 'local' ? '本机 GPU' : '云端'} · {provider.eta} ·{' '}
                {provider.supportsText ? '支持文生 3D' : '仅图生 3D'}
              </div>
            </div>
          )
        })}
      </Section>

      <Section title="生成">
        {info.supportsText && !image && (
          <>
            <div className="field-col">
              <label>提示词</label>
              <textarea
                className="textarea"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你想要的模型"
              />
            </div>
          </>
        )}

        {info.supportsImage && (
          <div className="field-col">
            <label>参考图（可选，留空则用提示词）</label>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              {image ? `已选择：${image.name}` : '选择图片'}
            </button>
            {image && (
              <button
                className="btn"
                onClick={() => {
                  setImage(null)
                  if (fileRef.current) fileRef.current.value = ''
                }}
              >
                清除图片
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            />
          </div>
        )}

        <button
          className="btn primary"
          style={{ width: '100%', marginTop: 8, padding: '7px 0' }}
          disabled={busy || (!image && !info.supportsText)}
          onClick={() => void generate()}
        >
          {busy ? '生成中…' : '生成模型'}
        </button>

        {busy && (
          <>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${Math.round(progress.value * 100)}%` }} />
            </div>
            <div className="progress-label">
              <span>{progress.stage}</span>
              <span>{Math.round(progress.value * 100)}%</span>
            </div>
          </>
        )}

        {error && <div className="hint danger">生成失败：{error}</div>}

        {!busy && !error && (
          <div className="hint">
            生成完成后会自动走一遍网格优化（焊接顶点、去重、剪枝、量化），
            再存入资产库并加入当前场景。
          </div>
        )}
      </Section>

      <Section title="说明" defaultOpen={false}>
        <div className="hint">
          <strong>内置演示</strong>不需要任何后端，直接程序化生成几何体，用来验证整条流水线。
        </div>
        <div className="hint">
          <strong>本地提供方</strong>需要先把 <code>server/main.py</code> 跑起来，它负责调度本机
          GPU 上的 InstantMesh / TripoSR。
        </div>
        <div className="hint">
          <strong>云端提供方</strong>需要后端配置对应的 API Key，前端只认后端这一层。
        </div>
      </Section>
    </div>
  )
}
