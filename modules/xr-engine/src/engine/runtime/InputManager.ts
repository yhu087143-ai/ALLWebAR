/**
 * 统一输入管理：为游戏运行时提供键盘/指针状态。
 * Web 端绑定 window 事件；微信小程序端后续可替换为 touch 事件。
 */
export class InputManager {
  readonly keys = new Set<string>()
  readonly pressed = new Set<string>()
  pointer: { x: number; y: number } | null = null
  clicked = false

  private keydown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase()
    if (!this.keys.has(key)) this.pressed.add(key)
    this.keys.add(key)
  }

  private keyup = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase())

  private pointerdown = (e: PointerEvent) => {
    if (typeof window === 'undefined') return
    this.pointer = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight }
    this.clicked = true
  }

  /** 切窗/最小化时清空按键与点击状态，避免 keyup 丢失后按键卡死 */
  private reset = () => {
    this.keys.clear()
    this.pressed.clear()
    this.clicked = false
  }

  private visibilitychange = () => {
    if (typeof document !== 'undefined' && document.hidden) this.reset()
  }

  attach(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('keydown', this.keydown)
    window.addEventListener('keyup', this.keyup)
    window.addEventListener('pointerdown', this.pointerdown)
    window.addEventListener('blur', this.reset)
    document.addEventListener('visibilitychange', this.visibilitychange)
  }

  detach(): void {
    if (typeof window === 'undefined') return
    window.removeEventListener('keydown', this.keydown)
    window.removeEventListener('keyup', this.keyup)
    window.removeEventListener('pointerdown', this.pointerdown)
    window.removeEventListener('blur', this.reset)
    document.removeEventListener('visibilitychange', this.visibilitychange)
    this.reset()
    this.pointer = null
  }

  endFrame(): void {
    this.pressed.clear()
    this.clicked = false
  }
}
