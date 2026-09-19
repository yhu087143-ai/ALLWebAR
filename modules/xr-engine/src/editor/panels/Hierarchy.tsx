import { useMemo, useState } from 'react'
import { NODE_ICON } from '@/editor/scene/NodeRenderer'
import { engine, useEditor } from '@/editor/store'
import { ContextMenu, type ContextMenuState } from '@/editor/ui/ContextMenu'
import { buildCreateObjectMenu, buildNodeMenu } from '@/editor/ui/createObjectMenu'
import type { NodeType } from '@/engine/core/types'
import { Icon } from '@/editor/ui/Icon'

const ADDABLE: { type: NodeType; label: string }[] = [
  { type: 'group', label: '空对象' },
  { type: 'mesh', label: '网格' },
  { type: 'light', label: '灯光' },
  { type: 'particle', label: '粒子' },
  { type: 'model', label: '模型' },
]

function TreeRow({
  id,
  depth,
  expanded,
  onToggle,
  dragId,
  setDragId,
  dropTargetId,
  setDropTargetId,
  visibleSet,
  onContextMenu,
}: {
  id: string
  depth: number
  expanded: Set<string>
  onToggle: (id: string) => void
  dragId: string | null
  setDragId: (id: string | null) => void
  dropTargetId: string | null
  setDropTargetId: (id: string | null) => void
  /** 搜索过滤用。为 null 表示不过滤，显示全部 */
  visibleSet: Set<string> | null
  /** 树行右键：选中该行并弹出节点操作菜单 */
  onContextMenu: (e: React.MouseEvent, id: string) => void
}) {
  const node = useEditor((s) => s.nodes[id])
  const children = useEditor((s) => s.nodes[id]?.children)
  const structureVersion = useEditor((s) => s.structureVersion)
  const selectedId = useEditor((s) => s.selectedId)
  const focusNode = useEditor((s) => s.focusNode)
  const toggleVisible = useEditor((s) => s.toggleVisible)
  const toggleLocked = useEditor((s) => s.toggleLocked)
  const removeNode = useEditor((s) => s.removeNode)
  const duplicateNode = useEditor((s) => s.duplicateNode)

  void structureVersion
  if (!node) return null
  // 搜索时只显示命中项，以及为了保住层级而一并显示的祖先节点
  if (visibleSet && !visibleSet.has(id)) return null

  // 搜索状态下强制展开，否则命中项会藏在折叠的父节点里看不见
  const isExpanded = visibleSet ? true : expanded.has(id)
  const isSelected = selectedId === id
  const hasChildren = (children?.length ?? 0) > 0

  const isDropTarget = dropTargetId === id && dragId !== id
  const invalidDrop = isDropTarget && dragId ? !useEditor.getState().canDrop(dragId, id) : false

  return (
    <>
      <div
        className={[
          'tree-row',
          isSelected ? 'selected' : '',
          node.visible ? '' : 'hidden-node',
          isDropTarget ? (invalidDrop ? 'drag-invalid' : 'drag-over') : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ paddingLeft: 6 + depth * 13 }}
        draggable
        onClick={() => focusNode(id)}
        onContextMenu={(e) => onContextMenu(e, id)}
        onDragStart={(e) => {
          setDragId(id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => {
          setDragId(null)
          setDropTargetId(null)
        }}
        onDragOver={(e) => {
          if (!dragId || dragId === id) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setDropTargetId(id)
        }}
        onDragLeave={() => {
          if (dropTargetId === id) setDropTargetId(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!dragId || dragId === id) return
          const store = useEditor.getState()
          if (store.canDrop(dragId, id)) store.reparent(dragId, id)
          setDragId(null)
          setDropTargetId(null)
        }}
      >
        <span
          className={`tree-caret${isExpanded ? ' open' : ''}${hasChildren ? '' : ' leaf'}`}
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) onToggle(id)
          }}
        >
          ▶
        </span>
        <span className="tree-icon">
          <Icon name={NODE_ICON[node.type]} size={13} />
        </span>
        <span className="tree-label">{node.name}</span>

        <button
          className={`tree-action${node.locked ? ' always on' : ''}`}
          title={node.locked ? '解锁' : '锁定'}
          onClick={(e) => {
            e.stopPropagation()
            toggleLocked(id)
          }}
        >
          <Icon name={node.locked ? 'lock' : 'lock-open'} size={12} />
        </button>
        <button
          className={`tree-action${node.visible ? '' : ' always'}`}
          title={node.visible ? '隐藏' : '显示'}
          onClick={(e) => {
            e.stopPropagation()
            toggleVisible(id)
          }}
        >
          <Icon name={node.visible ? 'eye' : 'eye-off'} size={12} />
        </button>
        <button
          className="tree-action"
          title="复制"
          onClick={(e) => {
            e.stopPropagation()
            duplicateNode(id)
          }}
        >
          ⧉
        </button>
        <button
          className="tree-action"
          title="删除"
          onClick={(e) => {
            e.stopPropagation()
            removeNode(id)
          }}
        >
          <Icon name="close" size={12} />
        </button>
      </div>

      {isExpanded &&
        children?.map((childId) => (
          <TreeRow
            key={childId}
            id={childId}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            dragId={dragId}
            setDragId={setDragId}
            dropTargetId={dropTargetId}
            setDropTargetId={setDropTargetId}
            visibleSet={visibleSet}
            onContextMenu={onContextMenu}
          />
        ))}
    </>
  )
}

export function Hierarchy() {
  const rootIds = useEditor((s) => s.rootIds)
  const structureVersion = useEditor((s) => s.structureVersion)
  const selectedId = useEditor((s) => s.selectedId)
  const addNode = useEditor((s) => s.addNode)
  const reparent = useEditor((s) => s.reparent)

  const nodes = useEditor((s) => s.nodes)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  void structureVersion

  // 树行右键：先选中（不飞相机），再弹节点操作菜单
  const handleRowContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    useEditor.getState().select(id)
    setMenu({ x: e.clientX, y: e.clientY, items: buildNodeMenu(id) })
  }

  // 空白区右键：根级「添加物体」菜单
  const handleBlankContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, items: buildCreateObjectMenu({ kind: 'root' }) })
  }

  // 命中项 + 它的整条祖先链（否则匹配到的子节点会因为父节点被隐藏而看不见）
  const visibleSet = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return null

    const set = new Set<string>()
    for (const node of Object.values(nodes)) {
      if (!node.name.toLowerCase().includes(query)) continue
      set.add(node.id)
      for (const ancestor of engine.graph.getAncestors(node.id)) set.add(ancestor)
    }
    return set
  }, [search, nodes])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="panel resizable">
      <div className="panel-header">
        <span>场景层级</span>
        <span className="spacer" />
        {ADDABLE.map((item) => (
          <button
            key={item.type}
            className="btn icon"
            title={`新建${item.label}`}
            onClick={() => addNode(item.type, selectedId)}
          >
            +
          </button>
        ))}
      </div>

      <div className="panel-search">
        <input
          className="search-input"
          placeholder="搜索对象…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="search-clear" title="清除" onClick={() => setSearch('')}>
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
      <div
        className="panel-body"
        onContextMenu={handleBlankContextMenu}
        onDragOver={(e) => {
          if (dragId) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (dragId) reparent(dragId, null)
          setDragId(null)
          setDropTargetId(null)
        }}
      >
        <div className="tree">
          {rootIds.length === 0 && (
            <div className="empty-state">
              场景是空的
              <br />
              点击右上角的 + 或右键 添加物体
            </div>
          )}
          {rootIds.map((id) => (
            <TreeRow
              key={id}
              id={id}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              dragId={dragId}
              setDragId={setDragId}
              dropTargetId={dropTargetId}
              visibleSet={visibleSet}
              setDropTargetId={setDropTargetId}
              onContextMenu={handleRowContextMenu}
            />
          ))}
        </div>
      </div>
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  )
}
