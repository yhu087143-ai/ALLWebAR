import { useEffect, useState } from 'react'
import { engine, useEditor } from '@/editor/store'
import { detectCapabilities, describeARStrategy, type DeviceCapabilities } from '@/engine/xr/capabilities'
import { detectWechatAR, type WechatARCapabilities } from '@/engine/xr/wechat/capabilities'
import { convertGLBtoUSDZ, openARQuickLook, supportsQuickLook } from '@/engine/xr/usdz'
import { NumberField, Section, SelectField } from '@/editor/ui/controls'
import { checkWeChatCompatibility, type CompatibilityIssue } from '@/engine/export/compatibility'
import { getRecommendedPerfTier } from '@/engine/xr/wechat/performanceMatrix'

export function ARPanel() {
  const arActive = useEditor((s) => s.arActive)
  const arError = useEditor((s) => s.arError)
  const setArActive = useEditor((s) => s.setArActive)
  const arScale = useEditor((s) => s.arScale)
  const setArScale = useEditor((s) => s.setArScale)
  const backendUrl = useEditor((s) => s.backendUrl)
  const assets = useEditor((s) => s.assets)

  const [caps, setCaps] = useState<DeviceCapabilities | null>(null)
  const [wxCaps, setWxCaps] = useState<WechatARCapabilities | null>(null)
  const [usdzAsset, setUsdzAsset] = useState('')
  const [usdzBusy, setUsdzBusy] = useState(false)
  const [usdzError, setUsdzError] = useState<string | null>(null)
  const [usdzUrl, setUsdzUrl] = useState<string | null>(null)
  const [compatIssues, setCompatIssues] = useState<CompatibilityIssue[] | null>(null)

  useEffect(() => {
    void detectCapabilities().then(setCaps)
    setWxCaps(detectWechatAR())
  }, [])

  const models = assets.filter((a) => a.kind === 'model' && !a.meta.missing)
  const strategy = caps ? describeARStrategy(caps) : null

  const enterAR = async () => {
    const gl = engine.getRenderer()
    if (!gl) {
      setArActive(false, '视口尚未就绪')
      return
    }
    try {
      await engine.ar.start(gl, { onEnd: () => setArActive(false) })
      setArActive(true)
    } catch (err) {
      setArActive(false, err instanceof Error ? err.message : String(err))
    }
  }

  const exitAR = () => {
    engine.ar.stop()
    setArActive(false)
  }

  const runCompatibilityCheck = () => {
    const graph = engine.graph
    const issues = checkWeChatCompatibility({
      nodes: graph.nodes as unknown as Record<string, Record<string, unknown>>,
      rootIds: [...graph.rootIds],
      postfxEnabled: useEditor.getState().postfx.enabled,
      assets: assets.map((a) => ({
        name: a.name,
        kind: a.kind,
        size: a.size,
        triangles: a.triangles,
        meta: a.meta,
      })),
    })
    setCompatIssues(issues)
  }

  const launchQuickLook = async () => {
    const asset = models.find((a) => a.id === usdzAsset)
    if (!asset) return
    setUsdzBusy(true)
    setUsdzError(null)
    try {
      const glb = await fetch(asset.uri).then((r) => r.blob())
      const usdz = await convertGLBtoUSDZ(backendUrl, glb)
      // 转换是异步的，完成后用户手势上下文早已过期，直接 openARQuickLook
      // 会被 Safari 拦截。这里只存 blob URL，由用户再点一次「在 AR 中查看」，
      // 让唤起发生在全新的点击手势里。
      if (usdzUrl) URL.revokeObjectURL(usdzUrl)
      setUsdzUrl(URL.createObjectURL(usdz))
    } catch (err) {
      setUsdzError(err instanceof Error ? err.message : String(err))
    } finally {
      setUsdzBusy(false)
    }
  }

  return (
    <div>
      <Section title="设备能力">
        {!caps && <div className="hint">检测中…</div>}
        {caps && (
          <>
            <div className="kv">
              <span>WebGL 2</span>
              <span>{caps.webgl2 ? '支持' : '不支持'}</span>
            </div>
            <div className="kv">
              <span>WebGPU</span>
              <span>{caps.webgpu ? '支持' : '不支持'}</span>
            </div>
            <div className="kv">
              <span>WebXR</span>
              <span>{caps.webxr ? '支持' : '不支持'}</span>
            </div>
            <div className="kv">
              <span>immersive-ar</span>
              <span>{caps.immersiveAR ? '支持' : '不支持'}</span>
            </div>
            <div className="kv">
              <span>平台</span>
              <span>
                {caps.isIOS ? 'iOS' : caps.isAndroid ? 'Android' : caps.isMobile ? '移动端' : '桌面'}
              </span>
            </div>
          </>
        )}
      </Section>

      <Section title="微信小程序 xr-frame">
        <div className="kv">
          <span>微信环境</span>
          <span>{wxCaps?.isWechat ? '是' : '否（当前在浏览器中）'}</span>
        </div>
        {wxCaps?.isWechat && (
          <>
            <div className="kv"><span>xr-frame</span><span>{wxCaps.hasXrFrame ? '支持' : '不支持'}</span></div>
            <div className="kv"><span>相机</span><span>{wxCaps.hasCamera ? '支持' : '不支持'}</span></div>
            <div className="kv"><span>基础库</span><span>{wxCaps.baseLibraryVersion || '未知'}</span></div>
            <div className="kv"><span>平台</span><span>{wxCaps.platform || '未知'}</span></div>
          </>
        )}
        <div className="hint">
          微信端通过「复制微信组件」拿到 xr-frame 组件源码，配合 wxar-mini 的 AR 相机、VIO/云端重定位使用。
        </div>
        <button
          className="btn"
          style={{ width: '100%', padding: '5px 0', marginTop: 6 }}
          onClick={() => {
            engine.setQualityLevel('low')
            useEditor.setState({ qualityLevel: 'low' })
            useEditor.getState().setPostFXEnabled(false)
          }}
        >
          微信低配预览（关后处理 + 低粒子）
        </button>
      </Section>

      <Section title="AR 会话">
        {strategy && (
          <div className={`hint ${strategy.mode === 'unsupported' ? 'warn' : 'info'}`}>
            <strong>{strategy.title}</strong>
            <br />
            {strategy.detail}
          </div>
        )}

        {arActive ? (
          <button
            className="btn primary"
            style={{ width: '100%', padding: '7px 0' }}
            onClick={exitAR}
          >
            退出 AR
          </button>
        ) : (
          <button
            className="btn primary"
            style={{ width: '100%', padding: '7px 0' }}
            disabled={!caps?.immersiveAR}
            onClick={() => void enterAR()}
          >
            进入 AR
          </button>
        )}

        {arError && <div className="hint danger">{arError}</div>}

        <div style={{ marginTop: 8 }}>
          <NumberField
            label="AR 缩放"
            value={arScale}
            min={0.01}
            max={2}
            step={0.01}
            onChange={setArScale}
          />
        </div>

        <div className="hint">
          进入 AR 后，移动设备扫描平面，场景会自动吸附到检测到的表面；轻触屏幕即锁定位置。
          没开启后处理的场景在真机上帧率会明显更好。
        </div>
      </Section>

      <Section title="iOS 降级：USDZ" defaultOpen={false}>
        <div className="hint warn">
          Safari 至今不支持 WebXR。iOS 上唯一可行的路径是把模型转成 USDZ，
          再用 AR Quick Look 打开。转换需要后端工具链（Blender 的 USD 导出、
          Apple usdzconvert，或开源转换器）。
        </div>
        {models.length === 0 ? (
          <div className="hint">资产库里还没有可用的模型。</div>
        ) : (
          <>
            <SelectField
              label="模型"
              value={usdzAsset}
              options={[
                { value: '', label: '— 选择 —' },
                ...models.map((a) => ({ value: a.id, label: a.name })),
              ]}
              onChange={(v) => {
                setUsdzAsset(v)
                if (usdzUrl) {
                  URL.revokeObjectURL(usdzUrl)
                  setUsdzUrl(null)
                }
              }}
            />
            <button
              className="btn"
              style={{ width: '100%', padding: '6px 0' }}
              disabled={!usdzAsset || usdzBusy || !supportsQuickLook()}
              onClick={() => void launchQuickLook()}
            >
              {usdzBusy ? '转换中…' : '转换 USDZ'}
            </button>
            {usdzUrl && !usdzBusy && (
              <button
                className="btn primary"
                style={{ width: '100%', padding: '6px 0', marginTop: 6 }}
                onClick={() => openARQuickLook(usdzUrl)}
              >
                在 AR 中查看（USDZ 已就绪）
              </button>
            )}
            {!supportsQuickLook() && (
              <div className="hint">当前浏览器不支持 AR Quick Look（rel=&quot;ar&quot;）。</div>
            )}
            {usdzError && <div className="hint danger">转换失败：{usdzError}</div>}
          </>
        )}
      </Section>

      <Section title="微信导出一致性检查">
        <button className="btn" style={{ width: '100%', padding: '6px 0' }} onClick={runCompatibilityCheck}>
          检查当前场景
        </button>
        {compatIssues && (
          <div style={{ marginTop: 8 }}>
            {compatIssues.map((item, i) => (
              <div key={i} className={`hint ${item.level === 'error' ? 'danger' : item.level === 'warn' ? 'warn' : 'info'}`} style={{ marginBottom: 4 }}>
                <strong>{item.title}</strong>
                <br />
                {item.detail}
              </div>
            ))}
          </div>
        )}
        <div className="hint" style={{ marginTop: 6 }}>
          引擎不会把 Three.js 转编译进微信，而是用同一份场景数据 + 双端运行时解释。导出前先跑这个检查。
        </div>
      </Section>

      <Section title="微信真机性能矩阵" defaultOpen={false}>
        {(() => {
          const tier = getRecommendedPerfTier({
            platform: caps?.isIOS ? 'iOS' : caps?.isAndroid ? 'Android' : caps?.isMobile ? 'Mobile' : 'Desktop',
            model: navigator.userAgent,
            memoryGB: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8,
            isWechat: wxCaps?.isWechat,
            baseLibrary: wxCaps?.baseLibraryVersion,
          })
          return (
            <>
              <div className="kv"><span>建议档位</span><span>{tier.name}</span></div>
              <div className="kv"><span>粒子缩放</span><span>{tier.particleScale}</span></div>
              <div className="kv"><span>模型面数上限</span><span>{tier.maxTriangles.toLocaleString()}</span></div>
              <div className="hint" style={{ marginTop: 4 }}>{tier.recommended}</div>
            </>
          )
        })()}
      </Section>

      <Section title="性能预算" defaultOpen={false}>
        <div className="hint">
          移动端 AR 的硬指标：三角面 &lt; 10 万、贴图 &lt; 6 张、材质 &lt; 8 个、单张贴图不超过
          2048。超出中端机会直接掉到个位数帧率。资产库里超限的模型会打上「超预算」标记。
        </div>
        <div className="hint">
          真正的优化要落到纹理压缩（KTX2 / Basis）和几何压缩（Draco / meshopt），
          这两步需要 wasm 编解码器，建议放在后端资产管线里做。
        </div>
      </Section>
    </div>
  )
}
