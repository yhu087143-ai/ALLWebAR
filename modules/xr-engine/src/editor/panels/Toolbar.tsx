import { useRef, useState } from 'react'
import { engine, useEditor } from '@/editor/store'
import { buildRuntimeDemo } from '@/engine/runtime/demo'
import { ContextMenu, type ContextMenuState } from '@/editor/ui/ContextMenu'
import { buildCreateObjectMenu } from '@/editor/ui/createObjectMenu'
import { ErrorBoundary } from '@/editor/ui/ErrorBoundary'
import { Icon } from '@/editor/ui/Icon'
import { PublishPanel } from './PublishPanel'

export function Toolbar() {
  const projectName = useEditor((s) => s.projectName)
  const setProjectName = useEditor((s) => s.setProjectName)
  const newProject = useEditor((s) => s.newProject)
  const openProject = useEditor((s) => s.openProject)
  const downloadProject = useEditor((s) => s.downloadProject)
  const exportGLB = useEditor((s) => s.exportGLB)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const canUndo = useEditor((s) => s.canUndo)
  const canRedo = useEditor((s) => s.canRedo)
  const playing = useEditor((s) => s.playing)
  const togglePlay = useEditor((s) => s.togglePlay)
  const fileRef = useRef<HTMLInputElement>(null)
  const [addMenu, setAddMenu] = useState<ContextMenuState | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)

  // 「添加物体▾」下拉：复用右键菜单同一份数据源（createObjectMenu），锚定在按钮下方
  const toggleAddMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (addMenu) {
      setAddMenu(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setAddMenu({
      x: rect.left,
      y: rect.bottom + 4,
      items: buildCreateObjectMenu({ kind: 'root' }),
    })
  }

  return (
    <div className="toolbar">
      <div className="toolbar-group toolbar-left">
        <div className="toolbar-brand">
          <span className="toolbar-logo">XR</span>
          <span>引擎</span>
        </div>

        <input
          className="project-name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="场景名称"
        />

        <span className="toolbar-sep" />

        <button
          className="btn"
          title="清空当前场景，重建默认内容"
          onClick={() => {
            if (confirm('新建场景会清空当前内容，确定继续？')) newProject()
          }}
        >
          新建
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          打开
        </button>
        <button className="btn" onClick={downloadProject}>
          保存
        </button>

        <span className="toolbar-sep" />

        <button className="btn icon" title="撤销 (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          ↶
        </button>
        <button
          className="btn icon"
          title="重做 (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={redo}
        >
          ↷
        </button>
      </div>

      {/* 播放控制：绝对居中加大（对标 Unity 顶栏播放键），两侧分组宽度变化也不偏移 */}
      <div className="toolbar-group toolbar-center">
        <button
          className={`btn play-toggle${playing ? ' playing' : ''}`}
          title="进入播放模式：运行物理与脚本，退出后恢复编辑态"
          onClick={togglePlay}
        >
          {playing ? '■ 停止' : '▶ 播放'}
        </button>
      </div>

      <div className="toolbar-group toolbar-right">
        <button
          className={`btn${addMenu ? ' active' : ''}`}
          title="添加物体到场景（同视口/层级右键菜单）"
          onClick={toggleAddMenu}
        >
          添加物体 ▾
        </button>

        <span className="toolbar-sep" />

        <button
          className="btn"
          title="导出当前场景为微信小程序 xr-frame 可用的 JSON"
          onClick={() => useEditor.getState().exportMiniProgramScene()}
        >
          <Icon name="package" />
          导出小程序场景
        </button>

        <button
          className="btn"
          title="拷贝完整微信 xr-frame 自定义组件源码到剪贴板"
          onClick={() => {
            // 成功/失败反馈由 store 里的 toast 统一给出
            void useEditor.getState().copyWechatComponent()
          }}
        >
          <Icon name="wand" />
          复制微信组件
        </button>

        <button
          className="btn"
          title="启动基于 GameRuntime 核心的互动演示场景"
          onClick={() => {
            const wasPlaying = useEditor.getState().playing
            if (wasPlaying) useEditor.getState().togglePlay()
            buildRuntimeDemo(engine)
            if (!wasPlaying) useEditor.getState().togglePlay()
          }}
        >
          <Icon name="gamepad" />
          运行时 Demo
        </button>

        <button className="btn" onClick={() => void exportGLB()} title="导出为 .glb">
          导出 GLB
        </button>

        {/* 主操作：一键发布成可在手机浏览器打开的 AR 体验 */}
        <button
          className="btn primary"
          title="把当前场景烘焙成 GLB 并发布为 AR 体验，返回手机可直接打开的链接与二维码"
          onClick={() => setPublishOpen(true)}
        >
          <Icon name="send" />
          发布到 AR 平台
        </button>

        <span className="badge">场景会自动保存到浏览器本地</span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void openProject(file)
          e.target.value = ''
        }}
      />

      <ContextMenu state={addMenu} onClose={() => setAddMenu(null)} />

      {/* 发布面板独立兜底：即使它崩了，工具栏与视口也不受影响 */}
      <ErrorBoundary label="发布面板">
        <PublishPanel open={publishOpen} onClose={() => setPublishOpen(false)} />
      </ErrorBoundary>
    </div>
  )
}
