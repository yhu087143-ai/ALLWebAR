import { useMemo, useRef, useState } from 'react'
import { formatBytes } from '@/engine/assets/AssetDatabase'
import { checkARBudget } from '@/engine/assets/optimizer'
import { engine, useEditor } from '@/editor/store'
import { loadModelFile } from '@/engine/assets/loader'
import { disposeLoadedModel } from '@/editor/scene/dispose'
import { optimizeModelToGLB } from '@/engine/assets/modelOptimizer'
import { addPrefabToSceneGraph, createBlackHolePrefab, createEnergyBallPrefab } from '@/engine/game/effects'
import suzi from '@pmndrs/assets/models/suzi.glb'
import bunny from '@pmndrs/assets/models/bunny.glb'
import pmndrs from '@pmndrs/assets/models/pmndrs.glb'
import './AssetBrowser.css'
import { Icon, type IconName } from '@/editor/ui/Icon'

const KIND_ICON: Record<string, string> = {
  model: 'box',
  texture: 'image',
  hdri: 'circle',
  audio: 'music',
  'gaussian-splat': 'cloud',
}

const KIND_LABEL: Record<string, string> = {
  model: '模型',
  texture: '贴图',
  hdri: 'HDRI',
  audio: '音频',
  'gaussian-splat': '泼溅',
}

type KindFilter = 'all' | 'model' | 'texture' | 'hdri' | 'audio'

const FILTERS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'model', label: '模型' },
  { key: 'texture', label: '贴图' },
  { key: 'hdri', label: 'HDRI' },
  { key: 'audio', label: '音频' },
]

/** 拖进视口用的自定义 MIME，与 Viewport 的 onDragOver/onDrop 对应 */
export const ASSET_DRAG_TYPE = 'application/x-xr-asset'

export function AssetBrowser() {
  const assets = useEditor((s) => s.assets)
  const addAssetFromFiles = useEditor((s) => s.addAssetFromFiles)
  const addAssetFromUrl = useEditor((s) => s.addAssetFromUrl)
  const removeAsset = useEditor((s) => s.removeAsset)
  const addModelNode = useEditor((s) => s.addModelNode)
  const addSplatNode = useEditor((s) => s.addSplatNode)

  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [url, setUrl] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [cdnOpen, setCdnOpen] = useState(false)
  const [prefabOpen, setPrefabOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<KindFilter>('all')
  const [optimizingId, setOptimizingId] = useState<string | null>(null)
  const [optimizeMessage, setOptimizeMessage] = useState<string | null>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setImporting(true)
    try {
      await addAssetFromFiles(Array.from(files))
    } finally {
      setImporting(false)
    }
  }

  const importFromUrl = async () => {
    if (!url || urlBusy) return
    setUrlBusy(true)
    setUrlError(null)
    try {
      await addAssetFromUrl(url.trim())
      setUrl('')
      setCdnOpen(false)
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : String(err))
    } finally {
      setUrlBusy(false)
    }
  }

  const loadBuiltinAssets = async () => {
    const builtins = [
      { name: 'Suzi.glb', uri: suzi },
      { name: 'Bunny.glb', uri: bunny },
      { name: 'PMNDRS.glb', uri: pmndrs },
    ]
    for (const item of builtins) {
      if (engine.assets.list().some((a) => a.name === item.name)) continue
      const rec = engine.assets.add({
        name: item.name,
        kind: 'model',
        source: 'library',
        uri: item.uri,
        size: item.uri.length,
      })
      try {
        const loaded = await loadModelFile(rec.uri, rec.name, engine.getRenderer() ?? undefined)
        try {
          rec.meta = {
            ...rec.meta,
            meshes: 1,
            materials: 1,
            textures: 0,
            animations: '',
            loaded: true,
          }
          rec.triangles = loaded.scene.children.reduce((sum, child) => {
            let t = 0
            child.traverse((o: any) => {
              if ((o as any).isMesh) {
                const g = (o as any).geometry
                if (g?.index) t += g.index.count / 3
                else if (g?.attributes?.position) t += g.attributes.position.count / 3
              }
            })
            return sum + t
          }, 0)
        } finally {
          // 这里只为统计面数临时解析，用完即释放 GPU 资源
          disposeLoadedModel(loaded.scene)
        }
      } catch (err) {
        console.warn('[assets] 内置模型解析失败', item.name, err)
      }
    }
    engine.bus.emit('assets:changed', { assets: engine.assets.list() })
  }

  const insertPrefab = (kind: 'blackhole' | 'energyball') => {
    const id = addPrefabToSceneGraph(
      engine,
      kind === 'blackhole' ? createBlackHolePrefab() : createEnergyBallPrefab()
    )
    useEditor.getState().select(id)
    setPrefabOpen(false)
  }

  // 减面：临时解析模型 → meshoptimizer 减面 → 导出 optimized.glb 重新入库
  const optimizeAsset = async (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId)
    if (!asset) return
    setOptimizingId(assetId)
    setOptimizeMessage(null)
    try {
      const loaded = await loadModelFile(asset.uri, asset.name, engine.getRenderer() ?? undefined)
      let result: Awaited<ReturnType<typeof optimizeModelToGLB>>
      try {
        result = await optimizeModelToGLB(loaded, {
          ratio: 0.3,
          maxTriangles: 50000,
          error: 0.01,
        })
      } finally {
        // 减面读的是临时解析出的模型，导出 GLB 后立即释放
        disposeLoadedModel(loaded.scene)
      }
      const outName = asset.name.replace(/\.[^.]+$/, '') + '.optimized.glb'
      const file = new File([result.glb], outName, { type: 'model/gltf-binary' })
      await addAssetFromFiles([file])
      const texNote = result.removedTextures
        ? ` · 已忽略 ${result.removedTextures} 张无效贴图（原始贴图文件缺失）`
        : ''
      setOptimizeMessage(
        `${result.beforeTriangles.toLocaleString()} → ${result.afterTriangles.toLocaleString()} 三角面${texNote}`
      )
    } catch (err) {
      setOptimizeMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setOptimizingId(null)
    }
  }

  // 把资产原始文件（如减面后的 optimized.glb）保存到本地，方便上传 CDN
  const downloadAsset = (uri: string, name: string) => {
    void (async () => {
      try {
        const res = await fetch(uri)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = name
        a.click()
        // 同步 revoke 会让 Firefox 取消刚开始的下载，延迟回收
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
        setOptimizeMessage(`已导出 ${name}`)
      } catch (err) {
        setOptimizeMessage(`导出失败: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assets.filter((a) => {
      if (filter !== 'all' && a.kind !== filter) return false
      if (q && !a.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [assets, search, filter])

  return (
    <div className="panel resizable ab-root">
      <div className="panel-header">
        <span>资产库</span>
        <span className="spacer" />
        <span className="badge">{assets.length}</span>
      </div>

      <div className="ab-toolbar">
        <button className="ab-btn ab-btn-primary" onClick={() => inputRef.current?.click()}>
          <Icon name="download" size={13} /> 导入文件
        </button>
        <button
          className={`ab-btn${cdnOpen ? ' active' : ''}`}
          onClick={() => setCdnOpen((v) => !v)}
          title="从 CDN / glTF 直链导入"
        >
          <Icon name="link" size={13} /> CDN
        </button>
        <button className="ab-btn" onClick={() => void loadBuiltinAssets()} title="Suzi / Bunny / PMNDRS">
          <Icon name="package" size={13} /> 内置 CC0
        </button>
        <div className="ab-menu-wrap">
          <button
            className={`ab-btn${prefabOpen ? ' active' : ''}`}
            onClick={() => setPrefabOpen((v) => !v)}
            onBlur={() => setTimeout(() => setPrefabOpen(false), 150)}
          >
            <Icon name="sparkles" size={13} /> 预制体 <Icon name="chevron-down" size={12} />
          </button>
          {prefabOpen && (
            <div className="ab-menu">
              <button className="ab-menu-item" onClick={() => insertPrefab('blackhole')}>
                黑洞
              </button>
              <button className="ab-menu-item" onClick={() => insertPrefab('energyball')}>
                能量球
              </button>
            </div>
          )}
        </div>

        <input
          className="ab-search"
          placeholder="搜索资产…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="ab-chips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`ab-chip${filter === f.key ? ' active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {cdnOpen && (
        <div className="ab-cdn-row">
          <input
            className="ab-search"
            placeholder="CDN / glTF 素材直链，如 https://cdn.xxx.com/model.glb"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setUrlError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void importFromUrl()
            }}
          />
          <button className="ab-btn" disabled={!url || urlBusy} onClick={() => void importFromUrl()}>
            {urlBusy ? '导入中…' : '导入'}
          </button>
        </div>
      )}
      {urlError && <div className="ab-hint ab-hint-danger">{urlError}</div>}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".glb,.gltf,.obj,.fbx,.ply,.splat,.ksplat,.spz,.hdr,.exr,.png,.jpg,.jpeg,.webp,.ktx2,.mp3,.wav"
        style={{ display: 'none' }}
        onChange={(e) => {
          void handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <div
        className={`ab-body${dragging ? ' ab-drop-active' : ''}`}
        onDragOver={(e) => {
          // 只响应操作系统文件拖入；资产卡片拖向视口的拖拽不触发导入态
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            setDragging(true)
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          setDragging(false)
          void handleFiles(e.dataTransfer.files)
        }}
      >
        {importing && (
          <div className="ab-importing">
            <span className="ab-spinner" /> 正在导入文件…
          </div>
        )}

        {assets.length === 0 && !importing ? (
          <div className="ab-empty">
            <div className="ab-empty-icon"><Icon name="package" size={26} /></div>
            <div className="ab-empty-title">资产库是空的</div>
            <div className="ab-empty-sub">
              点击「导入文件」或把文件拖到这里
              <br />
              支持 glTF / GLB / OBJ / FBX / 高斯泼溅 PLY / 贴图 / HDR / 音频
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="ab-empty">
            <div className="ab-empty-icon"><Icon name="search" size={26} /></div>
            <div className="ab-empty-title">没有匹配的资产</div>
            <div className="ab-empty-sub">换个关键词，或切换类型筛选</div>
          </div>
        ) : (
          <div className="ab-grid">
            {filtered.map((asset, index) => {
              const missing = Boolean(asset.meta.missing)
              const loading = asset.meta.loadStatus === 'loading'
              const budget =
                asset.kind === 'model'
                  ? checkARBudget({
                      triangles: asset.triangles,
                      textures: Number(asset.meta.textures ?? 0),
                      materials: Number(asset.meta.materials ?? 0),
                    })
                  : null
              const overBudget = Boolean(budget && budget.issues.length > 0)

              const stats: string[] = []
              if (asset.kind === 'gaussian-splat' && asset.meta.splatCount) {
                stats.push(`${Number(asset.meta.splatCount).toLocaleString()} 点`)
              } else if (asset.triangles) {
                stats.push(`${(asset.triangles / 1000).toFixed(1)}k 面`)
              }
              if (Number(asset.meta.materials ?? 0) > 0) stats.push(`${asset.meta.materials} 材质`)
              if (Number(asset.meta.textures ?? 0) > 0) stats.push(`${asset.meta.textures} 贴图`)
              if (asset.meta.bones) stats.push(`${asset.meta.bones} 骨骼`)
              const animCount = String(asset.meta.animations ?? '')
                .split(',')
                .filter(Boolean).length
              if (animCount) stats.push(`${animCount} 动画`)

              return (
                <div
                  key={asset.id}
                  className={`ab-card${missing ? ' ab-missing' : ''}`}
                  style={{ animationDelay: `${(index % 12) * 20}ms` }}
                  title={
                    missing
                      ? '刷新页面后 blob 链接已失效，请重新上传'
                      : `${asset.name}\n${KIND_LABEL[asset.kind] ?? asset.kind} · ${formatBytes(asset.size)}${
                          stats.length ? `\n${stats.join(' · ')}` : ''
                        }\n双击加入场景 · 可拖入视口放置`
                  }
                  draggable={!missing}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onDoubleClick={() => {
                    if (missing) return
                    if (asset.kind === 'model') addModelNode(asset.id)
                    if (asset.kind === 'gaussian-splat') addSplatNode(asset.id)
                  }}
                >
                  <div className="ab-thumb">
                    {loading ? (
                      <span className="ab-spinner ab-spinner-lg" />
                    ) : !missing && (asset.kind === 'texture' || asset.kind === 'hdri') && asset.uri ? (
                      <img src={asset.uri} alt="" draggable={false} />
                    ) : (
                      <span className="ab-thumb-icon">
                        <Icon name={(KIND_ICON[asset.kind] ?? 'box') as IconName} size={16} />
                      </span>
                    )}
                    <span className="ab-kind-badge">{KIND_LABEL[asset.kind] ?? asset.kind}</span>
                    {overBudget && <span className="ab-budget-badge">超预算</span>}

                    {!missing && (
                      <div className="ab-actions">
                        {(asset.kind === 'model' || asset.kind === 'gaussian-splat') && (
                          <button
                            className="ab-action"
                            title="加入场景"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (asset.kind === 'model') addModelNode(asset.id)
                              else addSplatNode(asset.id)
                            }}
                          >
                            <Icon name="plus" size={13} />
                          </button>
                        )}
                        {asset.kind === 'model' && (
                          <button
                            className="ab-action ab-action-accent"
                            title={optimizingId === asset.id ? '减面中…' : '减面优化（导出 optimized.glb）'}
                            disabled={optimizingId === asset.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              void optimizeAsset(asset.id)
                            }}
                          >
                            {optimizingId === asset.id ? <span className="ab-spinner" /> : <Icon name="scissors" size={13} />}
                          </button>
                        )}
                        <button
                          className="ab-action"
                          title="下载原始文件"
                          onClick={(e) => {
                            e.stopPropagation()
                            downloadAsset(asset.uri, asset.name)
                          }}
                        >
                          <Icon name="download" size={13} />
                        </button>
                        <button
                          className="ab-action ab-action-danger"
                          title="移除资产"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeAsset(asset.id)
                          }}
                        >
                          <Icon name="close" size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="ab-name">{asset.name}</div>
                  <div className="ab-meta">
                    {loading
                      ? '解析中…'
                      : asset.meta.loadStatus === 'error'
                        ? '解析失败'
                        : stats.join(' · ') || formatBytes(asset.size)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {optimizeMessage && (
          <div className="ab-hint ab-hint-accent">减面结果:{optimizeMessage}</div>
        )}

        {assets.some((a) => a.kind === 'model') && (
          <div className="ab-hint">
            上 CDN 流程：减面 → 下载 xxx.optimized.glb → 上传到你的 CDN → 「导出小程序场景」生成 scene-data.js
          </div>
        )}

        {assets.some((a) => a.meta.missing) && (
          <div className="ab-hint ab-hint-warn">
            部分资产仍是 missing：IndexedDB 里没有对应的原始文件（可能是在其他浏览器/设备中导入，或本地存储被清理）。
          </div>
        )}
      </div>
    </div>
  )
}
