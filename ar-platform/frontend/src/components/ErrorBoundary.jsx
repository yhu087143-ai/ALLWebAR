import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] 捕获异常:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-black p-4">
          <div className="max-w-sm w-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-5">
              <span className="text-rose-400 text-2xl">!</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">页面加载异常</h2>
            <p className="text-sm text-slate-400 mb-6">
              {this.state.error?.message || 'AR 页面遇到意外错误'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl text-sm font-medium bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors"
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
