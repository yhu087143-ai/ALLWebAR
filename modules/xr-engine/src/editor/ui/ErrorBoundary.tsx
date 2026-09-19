import { Component, type ErrorInfo, type ReactNode } from 'react'
import './errorBoundary.css'

interface Props {
  children: ReactNode
  /** 出错时展示的名字，例如「发布面板」。省略则用「界面」 */
  label?: string
}

interface State {
  error: Error | null
}

/**
 * 局部错误边界。
 *
 * 编辑器此前没有任何错误边界：任何一个面板在渲染期抛错，React 会卸载整棵树，
 * 表现为「整个编辑器突然白屏、WebGL 上下文丢失」，而且看不出是哪块代码的问题。
 * 这里把崩溃限制在最小范围，并把错误信息留在界面上，便于定位。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[ErrorBoundary] ${this.props.label ?? '界面'}渲染失败：`,
      error,
      info.componentStack
    )
  }

  private reset = (): void => this.setState({ error: null })

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash">
        <div className="crash-title">{this.props.label ?? '界面'}运行出错</div>
        <div className="crash-msg">{error.message}</div>
        <button className="btn" onClick={this.reset}>
          重试
        </button>
      </div>
    )
  }
}
