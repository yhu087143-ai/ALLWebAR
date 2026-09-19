import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/editor/ui/Icon'

type Level = 'warn' | 'error'

interface Entry {
  id: number
  level: Level
  text: string
  time: string
}

/** 环形缓冲上限：避免长时间会话攒出上万条日志拖垮渲染 */
const MAX_ENTRIES = 500

let entrySeq = 0

const fmtArg = (a: unknown): string => {
  if (typeof a === 'string') return a
  if (a instanceof Error) return a.message
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })

/**
 * 控制台面板：包装 window console.warn / console.error 抓取引擎与编辑器告警，
 * 原输出照常打印到 DevTools。引擎 EventBus 目前没有 warning 类事件，后续加了在这里订阅即可。
 * 卸载时恢复原 console。
 */
export function ConsolePanel() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [filter, setFilter] = useState<'all' | Level>('all')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const origWarn = console.warn
    const origError = console.error
    // 先缓冲再异步批量入 state：console 可能在其他组件 render 期间被调用，
    // 直接 setState 会触发 React「render 期间更新」警告，而警告本身又走 console.error 造成递归
    let pending: Entry[] = []
    let scheduled = false
    const flush = () => {
      scheduled = false
      if (pending.length === 0) return
      const batch = pending
      pending = []
      setEntries((prev) => [...prev, ...batch].slice(-MAX_ENTRIES))
    }
    const push = (level: Level, args: unknown[]) => {
      pending.push({ id: ++entrySeq, level, text: args.map(fmtArg).join(' '), time: now() })
      if (!scheduled) {
        scheduled = true
        queueMicrotask(flush)
      }
    }
    console.warn = (...args: unknown[]) => {
      origWarn.apply(console, args)
      push('warn', args)
    }
    console.error = (...args: unknown[]) => {
      origError.apply(console, args)
      push('error', args)
    }
    return () => {
      console.warn = origWarn
      console.error = origError
    }
  }, [])

  // 新日志进来自动滚到底
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries])

  const warnCount = entries.filter((e) => e.level === 'warn').length
  const errorCount = entries.length - warnCount
  const visible = filter === 'all' ? entries : entries.filter((e) => e.level === filter)

  return (
    <div className="panel console-panel">
      <div className="panel-header">
        控制台
        <span className="spacer" />
        <div className="console-filters">
          <button
            className={`chip${filter === 'all' ? ' active' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部 {entries.length}
          </button>
          <button
            className={`chip warn${filter === 'warn' ? ' active' : ''}`}
            onClick={() => setFilter('warn')}
          >
            警告 {warnCount}
          </button>
          <button
            className={`chip error${filter === 'error' ? ' active' : ''}`}
            onClick={() => setFilter('error')}
          >
            错误 {errorCount}
          </button>
        </div>
        <button className="btn icon" title="清空控制台" onClick={() => setEntries([])}>
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="console-list" ref={listRef}>
        {visible.length === 0 ? (
          <div className="empty-state">暂无日志</div>
        ) : (
          visible.map((e) => (
            <div key={e.id} className={`console-row ${e.level}`}>
              <span className="console-time">{e.time}</span>
              <span className="console-text">{e.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
