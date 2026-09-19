/**
 * 游戏 HUD - DOM 层渲染
 *
 * 在 AR 容器之上叠加显示分数、倒计时、连击提示和结束画面。
 * 所有交互元素使用 pointer-events: none 避免阻挡 AR 触摸操作，
 * 结束画面的"再来一次"按钮除外。
 */
export class GameHUD {
  private _container: HTMLElement
  private _root: HTMLDivElement | null = null
  private _scoreEl: HTMLDivElement | null = null
  private _timerEl: HTMLDivElement | null = null
  private _comboEl: HTMLDivElement | null = null
  private _endScreen: HTMLDivElement | null = null
  private _disposed = false
  private _restartCallback: (() => void) | null = null

  constructor(container: HTMLElement) {
    this._container = container
  }

  /** 创建 HUD DOM 元素 */
  create(): void {
    if (this._root) return

    this._root = document.createElement('div')
    this._root.id = 'ar-game-hud'
    this._root.style.cssText = [
      'position: absolute; inset: 0; z-index: 40;',
      'pointer-events: none; font-family: system-ui, sans-serif;',
    ].join('')

    // 分数（左上）
    this._scoreEl = document.createElement('div')
    this._scoreEl.style.cssText = [
      'position: absolute; top: 16px; left: 16px;',
      'padding: 8px 16px; border-radius: 12px;',
      'background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);',
      'color: #FFD700; font-size: 20px; font-weight: 700;',
      'border: 1px solid rgba(255,215,0,0.2);',
      'display: none; transition: transform 0.1s ease-out;',
    ].join('')
    this._scoreEl.textContent = '0'
    this._root.appendChild(this._scoreEl)

    // 计时器（顶部居中）
    this._timerEl = document.createElement('div')
    this._timerEl.style.cssText = [
      'position: absolute; top: 16px; left: 50%; transform: translateX(-50%);',
      'padding: 6px 14px; border-radius: 20px;',
      'background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);',
      'color: #fff; font-size: 16px; font-weight: 600;',
      'border: 1px solid rgba(255,255,255,0.1);',
      'display: none; transition: color 0.3s, border-color 0.3s;',
    ].join('')
    this._timerEl.textContent = '--'
    this._root.appendChild(this._timerEl)

    // 连击提示（中下）
    this._comboEl = document.createElement('div')
    this._comboEl.style.cssText = [
      'position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%);',
      'padding: 6px 14px; border-radius: 10px;',
      'background: rgba(255,165,0,0.8); backdrop-filter: blur(4px);',
      'color: #fff; font-size: 14px; font-weight: 700;',
      'opacity: 0; transition: opacity 0.3s;',
      'display: none;',
    ].join('')
    this._root.appendChild(this._comboEl)

    // 结束画面
    this._endScreen = document.createElement('div')
    this._endScreen.style.cssText = [
      'position: absolute; inset: 0; z-index: 50;',
      'display: none; flex-direction: column; align-items: center; justify-content: center;',
      'background: rgba(0,0,0,0.7); backdrop-filter: blur(12px);',
    ].join('')
    this._root.appendChild(this._endScreen)

    this._container.appendChild(this._root)
  }

  /** 更新分数显示 */
  updateScore(score: number): void {
    if (!this._scoreEl || this._disposed) return
    this._scoreEl.style.display = 'flex'
    const prev = parseInt(this._scoreEl.textContent ?? '0', 10)
    this._scoreEl.textContent = `${score}`
    // 分数变化时才弹跳
    if (score !== prev) {
      this._scoreEl.style.transform = 'scale(1.2)'
      setTimeout(() => {
        if (this._scoreEl) this._scoreEl.style.transform = 'scale(1)'
      }, 100)
    }
  }

  /** 更新倒计时显示 */
  updateTimer(remaining: number): void {
    if (!this._timerEl || this._disposed) return
    this._timerEl.style.display = 'flex'
    const mins = Math.floor(remaining / 60)
    const secs = remaining % 60
    this._timerEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`
    // 最后 10 秒变红
    if (remaining <= 10) {
      this._timerEl.style.color = '#ff4444'
      this._timerEl.style.borderColor = 'rgba(255,68,68,0.4)'
    } else {
      this._timerEl.style.color = '#fff'
      this._timerEl.style.borderColor = 'rgba(255,255,255,0.1)'
    }
  }

  /** 显示连击提示 */
  showCombo(count: number, multiplier: number): void {
    if (!this._comboEl || this._disposed) return
    this._comboEl.style.display = 'flex'
    this._comboEl.textContent = `🔥 ${count}x Combo! (${multiplier.toFixed(1)}x)`
    this._comboEl.style.opacity = '1'
    setTimeout(() => {
      if (this._comboEl) this._comboEl.style.opacity = '0'
    }, 1500)
  }

  /** 显示游戏结束画面 */
  showEndScreen(score: number, items: number, message: string): void {
    if (!this._endScreen || this._disposed) return
    this._endScreen.style.display = 'flex'
    this._endScreen.innerHTML = [
      '<div style="text-align:center;animation:gameEndIn 0.4s ease-out">',
      '  <div style="font-size:48px;margin-bottom:16px">🎮</div>',
      `  <div style="font-size:24px;font-weight:700;color:#fff;margin-bottom:8px">${this._escapeHtml(message || '游戏结束！')}</div>`,
      `  <div style="font-size:48px;font-weight:800;color:#FFD700;margin-bottom:16px">${score}</div>`,
      `  <div style="font-size:14px;color:rgba(255,255,255,0.6)">收集了 ${items} 个物品</div>`,
      '  <button id="ar-game-restart" style="',
      '    margin-top:24px;padding:10px 24px;border-radius:12px;',
      '    background:rgba(99,102,241,0.8);color:#fff;font-size:14px;font-weight:600;',
      '    border:none;cursor:pointer;pointer-events:auto;',
      '  ">再来一次</button>',
      '</div>',
      '<style>',
      '  @keyframes gameEndIn{from{opacity:0;transform:scale(0.8) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}',
      '</style>',
    ].join('')

    // 绑定重启按钮
    const restartBtn = this._endScreen.querySelector('#ar-game-restart')
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        this._restartCallback?.()
      })
    }
  }

  /** 设置重启回调 */
  onRestart(cb: () => void): void {
    this._restartCallback = cb
  }

  /** 隐藏/显示整个 HUD */
  setVisible(show: boolean): void {
    if (this._root) {
      this._root.style.display = show ? 'block' : 'none'
    }
  }

  /** 清理 DOM 并释放引用 */
  dispose(): void {
    this._disposed = true
    this._restartCallback = null
    this._root?.remove()
    this._root = null
    this._scoreEl = null
    this._timerEl = null
    this._comboEl = null
    this._endScreen = null
  }

  /** 简单转义用户文本防止 XSS */
  private _escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}
