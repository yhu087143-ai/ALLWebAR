import { useEffect, useRef, useState } from 'react'
import { engine, useEditor } from '@/editor/store'
import {
  canPublish,
  isEmbedded,
  publishWithReport,
  type MotionConfig,
  type PublishResult,
  type XRTrackingType,
} from '@/integration/arBridge'
import { Icon } from '@/editor/ui/Icon'
import './publishPanel.css'

type Phase = 'form' | 'busy' | 'done'

interface Props {
  open: boolean
  onClose: () => void
}

export function PublishPanel({ open, onClose }: Props) {
  const projectName = useEditor((s) => s.projectName)
  const toast = useEditor((s) => s.toast)

  const [title, setTitle] = useState('')
  const [trackingType, setTrackingType] = useState<XRTrackingType>('image')
  const [targetImage, setTargetImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('form')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PublishResult | null>(null)
  const [copied, setCopied] = useState(false)

  // AR 展示参数：物体相对识别图的位置 / 大小 / 运动
  const [offset, setOffset] = useState({ x: 0, y: 0, z: 0 })
  const [scale, setScale] = useState(1)
  const [spinSpeed, setSpinSpeed] = useState(0) // 度/秒
  const [floatAmp, setFloatAmp] = useState(0) // 米
  const [pulseAmp, setPulseAmp] = useState(0)
  const [entrance, setEntrance] = useState<'none' | 'scale' | 'rise'>('none')
  const fileRef = useRef<HTMLInputElement>(null)

  // 每次打开都用当前场景名重置表单，避免上次的标题/触发图残留
  useEffect(() => {
    if (!open) return
    setTitle(engine.projectName || '未命名场景')
    setTrackingType('image')
    setTargetImage(null)
    setPreviewUrl(null)
    setPhase('form')
    setProgress('')
    setError(null)
    setResult(null)
    setCopied(false)
    // AR 展示参数也一起复位，避免上一次的偏移/动效被无意识地复用到下一条体验
    setOffset({ x: 0, y: 0, z: 0 })
    setScale(1)
    setSpinSpeed(0)
    setFloatAmp(0)
    setPulseAmp(0)
    setEntrance('none')
  }, [open])

  // 触发图预览的 objectURL 必须随文件变化回收，否则连续换图会泄漏
  useEffect(() => {
    if (!targetImage) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(targetImage)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [targetImage])

  if (!open) return null

  const publishable = canPublish()

  const submit = async () => {
    if (trackingType === 'image' && !targetImage) {
      setError('图片追踪需要先选择一张触发图')
      return
    }
    setPhase('busy')
    setError(null)
    setProgress('正在准备…')

    // 进度由 arBridge 通过 postMessage 发往宿主；本地也订阅一遍，
    // 这样独立运行（无宿主）时面板里同样能看到进度
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { source?: string; type?: string; payload?: { text?: string } }
      if (data?.source !== 'xr-engine' || data.type !== 'xr:publish:progress') return
      if (data.payload?.text) setProgress(data.payload.text)
    }
    window.addEventListener('message', onMessage)

    // 只在用户真的填了值时才写进配置，全 0 就是"不做任何动效"
    const motion: MotionConfig = {}
    if (spinSpeed) motion.spin = { axis: 'y', speed: spinSpeed }
    if (floatAmp) motion.float = { amplitude: floatAmp, period: 3 }
    if (pulseAmp) motion.pulse = { amplitude: pulseAmp, period: 2 }
    if (entrance !== 'none') motion.entrance = entrance

    const outcome = await publishWithReport({
      title: title.trim() || '未命名场景',
      trackingType,
      targetImage,
      positionOffset: offset,
      scale,
      motion,
    })

    window.removeEventListener('message', onMessage)

    if (outcome.ok) {
      setResult(outcome.result)
      setPhase('done')
      toast('已发布到 AR 平台', 'success')
    } else {
      setError(outcome.message)
      setPhase('form')
      toast(`发布失败：${outcome.message}`, 'error')
    }
  }

  const copyLink = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.fullUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('复制失败，请手动选中链接', 'error')
    }
  }

  return (
    <div className="pub-overlay" onPointerDown={() => phase !== 'busy' && onClose()}>
      <div className="pub-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pub-head">
          <div className="pub-head-title">
            <Icon name="send" size={15} />
            <span>发布到 AR 平台</span>
          </div>
          <button
            className="pub-close"
            title="关闭"
            disabled={phase === 'busy'}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        {phase === 'done' && result ? (
          <div className="pub-body">
            <div className="pub-success">
              <span className="pub-success-icon">
                <Icon name="check" size={14} />
              </span>
              <div>
                <div className="pub-success-title">发布成功</div>
                <div className="pub-success-sub">
                  用手机扫描二维码即可打开 AR 体验（局域网内需与电脑同一网络）
                </div>
              </div>
            </div>

            <div className="pub-qr">
              <img src={result.qrCode} alt="AR 体验二维码" width={176} height={176} />
            </div>

            <div className="field">
              <label>体验链接</label>
              <div className="pub-link-row">
                <input readOnly value={result.fullUrl} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn" onClick={() => void copyLink()}>
                  <Icon name="copy" />
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
            </div>

            {/* 全部走可选链：后端字段缺失时降级显示，绝不在渲染期抛错把整个编辑器带崩 */}
            <div className="pub-meta">
              追踪方式 {trackingType === 'image' ? '图片追踪' : '人脸追踪'} · 模型{' '}
              {result.modelUrl?.split('/').pop() ?? '—'}
              {result.targetUrl ? ` · 目标 ${result.targetUrl.split('/').pop()}` : ''}
            </div>
          </div>
        ) : (
          <div className="pub-body">
            {!publishable && (
              <div className="pub-warn">
                当前不在 AR 平台创作台内，也没有指定后端地址。请从 ar-platform 的
                <code>/xr-studio</code> 页面打开编辑器，或在地址后加
                <code>?api=http://localhost:3001</code> 再试。
              </div>
            )}

            <div className="field">
              <label>体验名称</label>
              <input
                value={title}
                placeholder="例如：敦煌飞天展品"
                disabled={phase === 'busy'}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="field">
              <label>追踪方式</label>
              <div className="pub-modes">
                <button
                  className={`pub-mode${trackingType === 'image' ? ' active' : ''}`}
                  disabled={phase === 'busy'}
                  onClick={() => setTrackingType('image')}
                >
                  <Icon name="image" size={16} />
                  <span className="pub-mode-name">图片追踪</span>
                  <span className="pub-mode-desc">扫特定图片出现内容，iOS / 安卓都能跑</span>
                </button>
                <button
                  className={`pub-mode${trackingType === 'face' ? ' active' : ''}`}
                  disabled={phase === 'busy'}
                  onClick={() => setTrackingType('face')}
                >
                  <Icon name="face" size={16} />
                  <span className="pub-mode-name">人脸追踪</span>
                  <span className="pub-mode-desc">摄像头对准人脸即可出现内容</span>
                </button>
              </div>
            </div>

            {trackingType === 'image' && (
              <div className="field">
                <label>触发图</label>
                <div className="pub-target">
                  <div className="pub-target-preview">
                    {previewUrl ? (
                      <img src={previewUrl} alt="触发图预览" />
                    ) : (
                      <Icon name="image" size={20} />
                    )}
                  </div>
                  <div className="pub-target-side">
                    <button
                      className="btn"
                      disabled={phase === 'busy'}
                      onClick={() => fileRef.current?.click()}
                    >
                      选择图片
                    </button>
                    <span className="pub-target-name">
                      {targetImage ? targetImage.name : '未选择（PNG / JPG / WebP）'}
                    </span>
                    <span className="pub-hint">
                      纹理丰富、对比明显的图识别率最高；纯文字展签容易失败
                    </span>
                  </div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    setTargetImage(e.target.files?.[0] ?? null)
                    setError(null)
                    e.target.value = ''
                  }}
                />
              </div>
            )}

            {/* AR 展示：物体在识别图上的位置、大小与运动 */}
            <div className="field">
              <label>位置偏移（米）</label>
              <div className="pub-num-row">
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <label className="pub-num" key={axis}>
                    <span>{axis.toUpperCase()}</span>
                    <input
                      type="number"
                      step="0.05"
                      disabled={phase === 'busy'}
                      value={offset[axis]}
                      onChange={(e) =>
                        setOffset((prev) => ({ ...prev, [axis]: Number(e.target.value) || 0 }))
                      }
                    />
                  </label>
                ))}
              </div>
              <span className="pub-hint">
                相对于识别图中心；Y 向上为正，Z 为朝向摄像头的深度
              </span>
            </div>

            <div className="field">
              <label>整体缩放</label>
              <div className="pub-num-row">
                <label className="pub-num wide">
                  <input
                    type="number"
                    step="0.1"
                    min="0.01"
                    disabled={phase === 'busy'}
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value) || 1)}
                  />
                  <span>倍</span>
                </label>
              </div>
              <span className="pub-hint">模型本身尺寸不准时用它校正，1 为原始大小</span>
            </div>

            <div className="field">
              <label>动效</label>
              <div className="pub-num-row">
                <label className="pub-num wide">
                  <span>自转</span>
                  <input
                    type="number"
                    step="15"
                    disabled={phase === 'busy'}
                    value={spinSpeed}
                    onChange={(e) => setSpinSpeed(Number(e.target.value) || 0)}
                  />
                  <span>度/秒</span>
                </label>
                <label className="pub-num wide">
                  <span>悬浮</span>
                  <input
                    type="number"
                    step="0.02"
                    min="0"
                    disabled={phase === 'busy'}
                    value={floatAmp}
                    onChange={(e) => setFloatAmp(Math.max(0, Number(e.target.value) || 0))}
                  />
                  <span>米</span>
                </label>
              </div>
              <div className="pub-num-row">
                <label className="pub-num wide">
                  <span>脉冲</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    disabled={phase === 'busy'}
                    value={pulseAmp}
                    onChange={(e) => setPulseAmp(Math.max(0, Number(e.target.value) || 0))}
                  />
                  <span>±倍</span>
                </label>
                <label className="pub-num wide">
                  <span>进场</span>
                  <select
                    disabled={phase === 'busy'}
                    value={entrance}
                    onChange={(e) =>
                      setEntrance(e.target.value as 'none' | 'scale' | 'rise')
                    }
                  >
                    <option value="none">无</option>
                    <option value="scale">弹出</option>
                    <option value="rise">升起</option>
                  </select>
                </label>
              </div>
              <span className="pub-hint">
                由引擎每帧计算，不要求模型自带任何动画 —— 静态 GLB 也能转起来；
                全部为 0 时物体静止不动
              </span>
            </div>

            {phase === 'busy' && (
              <div className="pub-progress">
                <span className="pub-spinner" />
                {progress || '处理中…'}
              </div>
            )}

            {error && <div className="pub-error">{error}</div>}
          </div>
        )}

        <div className="pub-foot">
          <span className="pub-foot-note">
            {phase === 'done'
              ? `${title} 已发布`
              : isEmbedded()
                ? '已连接 AR 平台'
                : '独立模式'}
          </span>
          {phase === 'done' ? (
            <>
              <button className="btn" onClick={() => setPhase('form')}>
                再发布一个
              </button>
              <button
                className="btn primary"
                onClick={() => window.open(result?.fullUrl, '_blank', 'noopener')}
              >
                <Icon name="link" />
                打开体验
              </button>
            </>
          ) : (
            <>
              <button className="btn" disabled={phase === 'busy'} onClick={onClose}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={phase === 'busy' || !publishable}
                onClick={() => void submit()}
              >
                <Icon name="send" />
                {phase === 'busy' ? '发布中…' : '发布'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
