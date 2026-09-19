import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor } from '@/editor/store'
import { QUALITY_LABEL } from '@/engine/plugins/builtin/quality'
import { AIPanel } from './panels/AIPanel'
import { ARPanel } from './panels/ARPanel'
import { AssetBrowser } from './panels/AssetBrowser'
import { ConsolePanel } from './panels/ConsolePanel'
import { Hierarchy } from './panels/Hierarchy'
import { Inspector } from './panels/Inspector'
import { PostFXPanel } from './panels/PostFXPanel'
import { StoryPanel } from './panels/StoryPanel'
import { Toolbar } from './panels/Toolbar'
import { Viewport } from './panels/Viewport'
import { Toasts } from './ui/Toast'
import { Icon, type IconName } from '@/editor/ui/Icon'

type RailKey = 'hierarchy' | 'fx' | 'story' | 'ai' | 'ar'
type BottomTabKey = 'assets' | 'console'

/** 左侧图标轨道（对标 Unity/Cocos 的工具栏折叠面板）：层级为默认项 */
const RAIL_ITEMS: { key: RailKey; label: string; icon: IconName }[] = [
  { key: 'hierarchy', label: '层级', icon: 'layers' },
  { key: 'fx', label: '特效', icon: 'sparkles' },
  { key: 'story', label: '剧情', icon: 'book-open' },
  { key: 'ai', label: 'AI 建模', icon: 'sparkle' },
  { key: 'ar', label: 'AR 导出', icon: 'hexagon' },
]

/** 底部面板（Unity 的 Project 位）：资产库 / 控制台 */
const BOTTOM_TABS: { key: BottomTabKey; label: string; icon: IconName }[] = [
  { key: 'assets', label: '资产库', icon: 'box' },
  { key: 'console', label: '控制台', icon: 'terminal' },
]

const LEFT_RANGE = [190, 460] as const
const RIGHT_RANGE = [250, 560] as const
const BOTTOM_RANGE = [140, 480] as const
/** 底部 tab 条高度：折叠时只保留这一条 */
const BOTTOM_BAR_HEIGHT = 30
const WIDTH_KEY = 'xr-engine:panel-widths'

const clamp = (v: number, [min, max]: readonly [number, number]) =>
  Math.min(max, Math.max(min, v))

/** 持久化的布局状态：列宽/底栏高度 + 折叠态 + 选中项。旧数据缺字段时回退默认值 */
interface LayoutState {
  left: number
  right: number
  bottom: number
  rail: string
  leftCollapsed: boolean
  bottomCollapsed: boolean
  bottomTab: BottomTabKey
}

const DEFAULT_LAYOUT: LayoutState = {
  left: 264,
  right: 320,
  bottom: 240,
  rail: 'hierarchy',
  leftCollapsed: false,
  bottomCollapsed: false,
  bottomTab: 'assets',
}

/** 写 localStorage 可能抛异常（隐私模式 / 配额满），面板布局只是记忆，失败静默忽略 */
const persistLayout = (next: LayoutState) => {
  try {
    localStorage.setItem(WIDTH_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      const store = useEditor.getState()
      const key = e.key.toLowerCase()

      // Ctrl+S：强制保存到本地存储（播放模式下变更属临时态，与自动保存一样挂起）
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault()
        if (!store.playing) store.saveNow()
        return
      }

      // 播放模式：键盘输入交给游戏脚本（WASD 等），编辑类快捷键（W/E/R、Delete、Ctrl+D/Z/Y）全部让路，
      // 只保留 Esc 取消选中
      if (store.playing) {
        if (e.key === 'Escape') store.select(null)
        return
      }

      if ((e.ctrlKey || e.metaKey) && key === 'd') {
        e.preventDefault()
        if (store.selectedId) store.duplicateNode(store.selectedId)
        return
      }
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) store.redo()
        else store.undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault()
        store.redo()
        return
      }
      if (e.ctrlKey || e.metaKey) return

      // 无人机飞行模式：WASD/QE 是移动键，屏蔽 gizmo 快捷键与 Esc 取消选中
      if (store.flyMode) return

      if (key === 'w') store.setGizmoMode('translate')
      else if (key === 'e') store.setGizmoMode('rotate')
      else if (key === 'r') store.setGizmoMode('scale')
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.selectedId) store.removeNode(store.selectedId)
      } else if (e.key === 'Escape') {
        store.select(null)
      } else if (key === 'f') {
        // 聚焦选中对象：相机飞到它跟前
        if (store.selectedId) store.focusNode(store.selectedId)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** 布局记忆：列宽/底栏高度 + rail 选中项 + 折叠态，存在 localStorage，下次打开保持同样的布局 */
function usePanelLayout() {
  const [layout, setLayout] = useState<LayoutState>(() => {
    try {
      const raw = localStorage.getItem(WIDTH_KEY)
      if (!raw) return DEFAULT_LAYOUT
      const parsed = JSON.parse(raw) as Partial<LayoutState>
      return {
        left: clamp(parsed.left ?? DEFAULT_LAYOUT.left, LEFT_RANGE),
        right: clamp(parsed.right ?? DEFAULT_LAYOUT.right, RIGHT_RANGE),
        bottom: clamp(parsed.bottom ?? DEFAULT_LAYOUT.bottom, BOTTOM_RANGE),
        rail: typeof parsed.rail === 'string' ? parsed.rail : DEFAULT_LAYOUT.rail,
        leftCollapsed: parsed.leftCollapsed === true,
        bottomCollapsed: parsed.bottomCollapsed === true,
        bottomTab: parsed.bottomTab === 'console' ? 'console' : DEFAULT_LAYOUT.bottomTab,
      }
    } catch {
      return DEFAULT_LAYOUT
    }
  })

  const update = useCallback((patch: Partial<LayoutState>) => {
    setLayout((prev) => {
      const next = { ...prev, ...patch }
      persistLayout(next)
      return next
    })
  }, [])

  // 拖拽是连续增量（movementX/Y），必须函数式更新，否则一帧内多次 move 会丢增量
  const resizeLeft = useCallback((dx: number) => {
    setLayout((prev) => {
      const next = { ...prev, left: clamp(prev.left + dx, LEFT_RANGE) }
      persistLayout(next)
      return next
    })
  }, [])
  const resizeRight = useCallback((dx: number) => {
    setLayout((prev) => {
      const next = { ...prev, right: clamp(prev.right - dx, RIGHT_RANGE) }
      persistLayout(next)
      return next
    })
  }, [])
  // 底部面板：分隔条向上拖（movementY 为负）高度增加
  const resizeBottom = useCallback((dy: number) => {
    setLayout((prev) => {
      const next = { ...prev, bottom: clamp(prev.bottom - dy, BOTTOM_RANGE) }
      persistLayout(next)
      return next
    })
  }, [])

  const resetLeft = useCallback(() => update({ left: DEFAULT_LAYOUT.left }), [update])
  const resetRight = useCallback(() => update({ right: DEFAULT_LAYOUT.right }), [update])
  const resetBottom = useCallback(() => update({ bottom: DEFAULT_LAYOUT.bottom }), [update])

  return { layout, update, resizeLeft, resizeRight, resizeBottom, resetLeft, resetRight, resetBottom }
}

/** 拖拽分隔条。用 Pointer Capture，指针移出边界也不会丢失拖拽 */
function PanelResizer({
  side,
  onResize,
  onReset,
}: {
  side: 'left' | 'right'
  onResize: (dx: number) => void
  onReset: () => void
}) {
  const dragging = useRef(false)

  return (
    <div
      className={`resizer resizer-${side}`}
      onPointerDown={(e) => {
        e.preventDefault()
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        document.body.classList.add('resizing')
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return
        onResize(e.movementX)
      }}
      onPointerUp={(e) => {
        dragging.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
        document.body.classList.remove('resizing')
      }}
      onDoubleClick={onReset}
      title="拖拽调整宽度 · 双击恢复默认"
    >
      <span className="resizer-grip" />
    </div>
  )
}

/** 底部面板的水平分隔条（垂直拖拽调高度，双击复位）。Pointer Capture 保证指针移出边界不丢拖拽 */
function HeightResizer({
  onResize,
  onReset,
}: {
  onResize: (dy: number) => void
  onReset: () => void
}) {
  const dragging = useRef(false)

  return (
    <div
      className="resizer resizer-horizontal"
      onPointerDown={(e) => {
        e.preventDefault()
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        document.body.classList.add('resizing-h')
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return
        onResize(e.movementY)
      }}
      onPointerUp={(e) => {
        dragging.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
        document.body.classList.remove('resizing-h')
      }}
      onDoubleClick={onReset}
      title="拖拽调整高度 · 双击恢复默认"
    >
      <span className="resizer-grip" />
    </div>
  )
}

function StatusBar() {
  const nodeCount = useEditor((s) => Object.keys(s.nodes).length)
  const selectedId = useEditor((s) => s.selectedId)
  const selectedName = useEditor((s) => (s.selectedId ? s.nodes[s.selectedId]?.name : null))
  const qualityLevel = useEditor((s) => s.qualityLevel)
  const assetCount = useEditor((s) => s.assets.length)
  const gizmoMode = useEditor((s) => s.gizmoMode)

  const modeLabel = { translate: '移动', rotate: '旋转', scale: '缩放' }[gizmoMode]

  return (
    <div className="statusbar">
      <span className="status-item">
        <span className="status-dot" />
        {/* key 变化触发淡入动画，提示数值刚更新 */}
        <span className="status-fade" key={nodeCount}>
          {nodeCount} 个对象
        </span>
      </span>
      <span className="status-sep" />
      <span className="status-item">
        <span className="status-fade" key={selectedId ?? 'none'}>
          {selectedId && selectedName ? (
            <>
              选中 <strong>{selectedName}</strong>
            </>
          ) : (
            '未选中'
          )}
        </span>
      </span>
      <span className="status-sep" />
      <span className="status-item">
        <span className="status-fade" key={assetCount}>
          {assetCount} 个资产
        </span>
      </span>

      <span className="status-spacer" />

      <span className="status-item muted">Gizmo {modeLabel}</span>
      <span className="status-sep" />
      <span className="status-item muted">
        <span className="status-fade" key={qualityLevel}>
          {QUALITY_LABEL[qualityLevel]}画质
        </span>
      </span>
      <span className="status-sep" />
      <span className="status-item muted">W/E/R 切换 · Del 删除 · Ctrl+D 复制 · Ctrl+S 保存</span>
    </div>
  )
}

export function EditorApp() {
  const { layout, update, resizeLeft, resizeRight, resizeBottom, resetLeft, resetRight, resetBottom } =
    usePanelLayout()
  const pluginPanels = useEditor((s) => s.pluginPanels)
  const playing = useEditor((s) => s.playing)
  useShortcuts()

  // 折叠/展开的滑动动画：只在切换瞬间给容器加 transition，拖拽改尺寸时不带动画（否则跟手延迟）
  const [bodyAnim, setBodyAnim] = useState(false)
  const [bottomAnim, setBottomAnim] = useState(false)
  const animTimers = useRef<number[]>([])
  useEffect(
    () => () => {
      for (const t of animTimers.current) window.clearTimeout(t)
    },
    []
  )
  const pulseAnim = useCallback((set: (v: boolean) => void) => {
    set(true)
    const t = window.setTimeout(() => set(false), 220)
    animTimers.current.push(t)
  }, [])

  // rail 选中项兜底：存的是插件面板但插件已卸载时回退到层级
  const rail = RAIL_ITEMS.some((i) => i.key === layout.rail) || pluginPanels.some((p) => p.id === layout.rail)
    ? layout.rail
    : 'hierarchy'

  const selectRail = (key: string) => {
    pulseAnim(setBodyAnim)
    if (key === rail && !layout.leftCollapsed) {
      // 再点当前图标：折叠整列，视口变宽
      update({ leftCollapsed: true })
    } else {
      update({ rail: key, leftCollapsed: false })
    }
  }

  const selectBottomTab = (key: BottomTabKey) => {
    // 折叠状态下点击 tab 同时展开（对标 Unity 点 Project 标签即展开）
    if (layout.bottomCollapsed) pulseAnim(setBottomAnim)
    update({ bottomTab: key, bottomCollapsed: false })
  }

  const toggleBottomCollapsed = () => {
    pulseAnim(setBottomAnim)
    update({ bottomCollapsed: !layout.bottomCollapsed })
  }

  const pluginPanel = pluginPanels.find((p) => p.id === rail) ?? null

  return (
    <div className="editor">
      <Toolbar />

      <div
        className={`editor-body${bodyAnim ? ' anim' : ''}${layout.leftCollapsed ? ' rail-collapsed' : ''}`}
        style={{
          gridTemplateColumns: `46px ${layout.leftCollapsed ? 0 : layout.left}px ${
            layout.leftCollapsed ? 0 : 4
          }px 1fr 4px ${layout.right}px`,
        }}
      >
        {/* 图标轨道：内置面板 + 插件注册面板 */}
        <div className="rail">
          {RAIL_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`rail-btn${rail === item.key && !layout.leftCollapsed ? ' active' : ''}`}
              title={item.label}
              onClick={() => selectRail(item.key)}
            >
              <span className="rail-icon">
                <Icon name={item.icon} size={15} />
              </span>
            </button>
          ))}
          {pluginPanels.length > 0 && <span className="rail-sep" />}
          {pluginPanels.map((p) => (
            <button
              key={p.id}
              className={`rail-btn${rail === p.id && !layout.leftCollapsed ? ' active' : ''}`}
              title={p.label}
              onClick={() => selectRail(p.id)}
            >
              <span className="rail-icon">▣</span>
            </button>
          ))}
        </div>

        <div className={`column left${layout.leftCollapsed ? ' collapsed' : ''}`}>
          {/* key 切换重新挂载，触发 fadeIn 动效 */}
          <div className="tab-fade" key={rail}>
            {rail === 'hierarchy' && <Hierarchy />}
            {rail === 'fx' && (
              <div className="panel-body">
                <PostFXPanel />
              </div>
            )}
            {rail === 'story' && (
              <div className="panel-body">
                <StoryPanel />
              </div>
            )}
            {rail === 'ai' && (
              <div className="panel-body">
                <AIPanel />
              </div>
            )}
            {rail === 'ar' && (
              <div className="panel-body">
                <ARPanel />
              </div>
            )}
            {pluginPanel && (
              <div className="empty-state">
                面板「{pluginPanel.label}」由插件注册
                <br />
                插件未提供渲染内容
              </div>
            )}
          </div>
        </div>

        <PanelResizer side="left" onResize={resizeLeft} onReset={resetLeft} />

        <div className={`column center${playing ? ' playing' : ''}`}>
          <Viewport />
        </div>

        <PanelResizer side="right" onResize={resizeRight} onReset={resetRight} />

        {/* 右列：Inspector 常驻，不再有 tabs */}
        <div className="column right">
          <div className="panel-header">属性</div>
          <div className="panel-body">
            <Inspector />
          </div>
        </div>
      </div>

      {/* 底部面板（Unity 的 Project 位）：高度可拖，双击分隔条复位，chevron 折叠到只剩 tab 条 */}
      <div
        className={`bottom-panel${bottomAnim ? ' anim' : ''}${layout.bottomCollapsed ? ' collapsed' : ''}`}
        style={{ height: layout.bottomCollapsed ? BOTTOM_BAR_HEIGHT : layout.bottom }}
      >
        {!layout.bottomCollapsed && <HeightResizer onResize={resizeBottom} onReset={resetBottom} />}
        <div className="tabs tabs-bottom">
          {BOTTOM_TABS.map((item) => (
            <button
              key={item.key}
              className={`tab${layout.bottomTab === item.key ? ' active' : ''}`}
              onClick={() => selectBottomTab(item.key)}
              title={item.label}
            >
              <span className="tab-icon"><Icon name={item.icon} size={13} /></span>
              <span className="tab-label">{item.label}</span>
            </button>
          ))}
          <span className="tabs-spacer" />
          <button
            className="tab tab-collapse"
            title={layout.bottomCollapsed ? '展开面板' : '折叠面板'}
            onClick={toggleBottomCollapsed}
          >
            <span className="tab-icon">
              <Icon name={layout.bottomCollapsed ? 'chevron-up' : 'chevron-down'} size={13} />
            </span>
          </button>
        </div>
        {!layout.bottomCollapsed && (
          <div className="bottom-content">
            <div className="tab-fade" key={layout.bottomTab}>
              {layout.bottomTab === 'assets' && <AssetBrowser />}
              {layout.bottomTab === 'console' && <ConsolePanel />}
            </div>
          </div>
        )}
      </div>

      <StatusBar />
      <Toasts />
    </div>
  )
}
