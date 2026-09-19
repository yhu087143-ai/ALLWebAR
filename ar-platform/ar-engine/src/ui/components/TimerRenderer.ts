import type { UIComponentRenderer } from '../UIComponentRenderer'
import { applyComponentStyle } from '../UIComponentRenderer'
import type { HUDComponent, UITheme } from '../../types/config'
import type { GameState } from '../GameState'

export class TimerRenderer implements UIComponentRenderer {
  readonly type = 'timer'

  create(component: HUDComponent, theme: UITheme): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = `
      color: var(--hud-text, ${theme.colors.text});
      font-family: var(--hud-font, ${theme.typography.fontFamily});
      font-size: var(--hud-title-size, ${theme.typography.titleSize}px);
      font-weight: bold;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
      pointer-events: none;
      white-space: nowrap;
      line-height: 1.4;
    `
    applyComponentStyle(el, component.style)
    const label = component.label || 'TIME'
    el.textContent = `${label}: 00:00`
    return el
  }

  update(element: HTMLElement, state: GameState, component: HUDComponent, theme: UITheme): void {
    const label = component.label || 'TIME'
    const formatted = this._formatTime(state.timer)
    element.textContent = `${label}: ${formatted}`

    // Apply warning color when timer is running low (use CSS variable to stay theme-reactive)
    const warningThreshold = component.props?.warningThreshold ?? 10
    if (state.timer <= warningThreshold && state.phase === 'playing') {
      element.style.color = component.style?.textColor || 'var(--hud-warning, ' + theme.colors.warning + ')'
    } else {
      element.style.color = component.style?.textColor || ''
      element.style.removeProperty?.('color')
    }

    applyComponentStyle(element, component.style)
  }

  destroy(element: HTMLElement): void {
    element.remove()
  }

  private _formatTime(seconds: number): string {
    const abs = Math.max(0, Math.floor(seconds))
    const m = Math.floor(abs / 60)
    const s = abs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
}
