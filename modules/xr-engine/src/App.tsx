import { useEffect } from 'react'
import { EditorApp } from '@/editor/EditorApp'
import { bootstrap } from '@/editor/store'
import { ErrorBoundary } from '@/editor/ui/ErrorBoundary'
import { announceReady } from '@/integration/arBridge'

// 启动时恢复上次会话，没有存档就建一个起步场景
bootstrap()

export default function App() {
  useEffect(() => {
    // 被 ar-platform 创作台以内嵌 iframe 打开时，向宿主宣告就绪并回报发布能力；
    // 独立运行（地址上没有 ?host=）时这个调用是无副作用的空操作。
    announceReady()

    // 宿主可能在编辑器加载完成之后才挂上监听，所以窗口重新获得焦点时再宣告一次
    const onFocus = () => announceReady()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  return (
    // 顶层兜底：任何未捕获的渲染异常都限制在可见的提示卡片里，
    // 而不是让整棵树被卸载成白屏（白屏时连是哪个面板出错都看不出来）
    <ErrorBoundary label="编辑器">
      <EditorApp />
    </ErrorBoundary>
  )
}
