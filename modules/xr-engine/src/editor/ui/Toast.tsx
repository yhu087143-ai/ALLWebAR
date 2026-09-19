import { useEditor } from '@/editor/store'
import { Icon } from '@/editor/ui/Icon'

/** 全局 Toast 容器：固定右上角，滑入 + 淡出，3s 自动消失（store.toast 里定时 dismiss） */
export function Toasts() {
  const toasts = useEditor((s) => s.toasts)
  const dismissToast = useEditor((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="toast-root">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.kind}`}
          onClick={() => dismissToast(t.id)}
          title="点击关闭"
        >
          <span className="toast-icon">
            {t.kind === 'success' ? (
              <Icon name="check" size={13} />
            ) : t.kind === 'error' ? (
              <Icon name="close" size={13} />
            ) : (
              <Icon name="info" size={13} />
            )}
          </span>
          <span className="toast-text">{t.text}</span>
        </div>
      ))}
    </div>
  )
}
