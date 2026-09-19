import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '@/editor/ui/Icon'

/** 菜单项。children 存在即为二级子菜单；separator 为分隔线 */
export interface MenuItem {
  label?: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  onClick?: () => void
  children?: MenuItem[]
}

/** 菜单锚点：fixed 定位坐标。flipX 用于子菜单右侧溢出时向左翻转（以此为右缘） */
interface MenuAnchor {
  x: number
  y: number
  flipX?: number
}

export interface ContextMenuState {
  x: number
  y: number
  items: MenuItem[]
}

const EDGE = 4

/** 单级菜单：渲染后测量自身尺寸并钳制在窗口内（layout effect 在绘制前完成，无闪烁） */
function MenuLevel({
  items,
  anchor,
  depth,
  openPath,
  setOpenPath,
  onClose,
}: {
  items: MenuItem[]
  anchor: MenuAnchor
  depth: number
  openPath: number[]
  setOpenPath: (path: number[]) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  // 当前展开子菜单的锚点（来自父项的屏幕矩形，悬停时捕获——event.currentTarget 不能跨渲染保存）
  const [subAnchor, setSubAnchor] = useState<MenuAnchor | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let x = anchor.x
    let y = anchor.y
    // 右缘溢出：子菜单翻转到父项左侧；根菜单直接贴窗口右边界
    if (x + rect.width > window.innerWidth - EDGE) {
      x = anchor.flipX !== undefined ? anchor.flipX - rect.width : window.innerWidth - rect.width - EDGE
    }
    if (y + rect.height > window.innerHeight - EDGE) y = window.innerHeight - rect.height - EDGE
    if (x < EDGE) x = EDGE
    if (y < EDGE) y = EDGE
    setPos({ x, y })
  }, [anchor])

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{
        left: pos?.x ?? anchor.x,
        top: pos?.y ?? anchor.y,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {items.map((item, i) => {
        if (item.separator) return <div key={i} className="ctx-sep" />
        const hasChildren = Boolean(item.children?.length)
        const isOpen = hasChildren && openPath[depth] === i
        return (
          <div
            key={i}
            className={[
              'ctx-item',
              item.danger ? 'danger' : '',
              item.disabled ? 'disabled' : '',
              isOpen ? 'open' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onPointerEnter={(e) => {
              if (hasChildren) {
                const rect = e.currentTarget.getBoundingClientRect()
                setSubAnchor({ x: rect.right - 2, y: rect.top - 5, flipX: rect.left + 2 })
                setOpenPath([...openPath.slice(0, depth), i])
              } else {
                // 叶子项：收掉同层已展开的子菜单
                setOpenPath(openPath.slice(0, depth))
              }
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (item.disabled || hasChildren) return
              item.onClick?.()
              onClose()
            }}
          >
            <span className="ctx-icon">
              {item.icon ? <Icon name={item.icon as IconName} size={13} /> : null}
            </span>
            <span className="ctx-label">{item.label}</span>
            {hasChildren && <span className="ctx-caret">▸</span>}
          </div>
        )
      })}
      {openPath[depth] !== undefined &&
        items[openPath[depth]]?.children &&
        subAnchor && (
          <MenuLevel
            items={items[openPath[depth]].children!}
            anchor={subAnchor}
            depth={depth + 1}
            openPath={openPath}
            setOpenPath={setOpenPath}
            onClose={onClose}
          />
        )}
    </div>
  )
}

/**
 * 通用右键上下文菜单（对标 Unity）：
 * 二级子菜单悬停展开 · 点击外部 / Esc / 窗口失焦关闭 · 屏幕边缘防溢出。
 * 用法：onContextMenu 里 setMenu({ x: e.clientX, y: e.clientY, items })。
 */
export function ContextMenu({
  state,
  onClose,
}: {
  state: ContextMenuState | null
  onClose: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [openPath, setOpenPath] = useState<number[]>([])

  // 每次打开新菜单时重置子菜单展开状态
  useEffect(() => {
    setOpenPath([])
  }, [state])

  useEffect(() => {
    if (!state) return
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current
      // 点在菜单内交给菜单项处理（子菜单渲染在 root 内，contains 覆盖）；外部点击（含右键）关闭
      if (root && e.target instanceof Node && root.contains(e.target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [state, onClose])

  if (!state) return null

  return (
    <div ref={rootRef} className="ctx-root" onContextMenu={(e) => e.preventDefault()}>
      <MenuLevel
        items={state.items}
        anchor={{ x: state.x, y: state.y }}
        depth={0}
        openPath={openPath}
        setOpenPath={setOpenPath}
        onClose={onClose}
      />
    </div>
  )
}
