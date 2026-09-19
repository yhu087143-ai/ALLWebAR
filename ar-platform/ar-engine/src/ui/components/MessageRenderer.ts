import type { UIComponentRenderer } from '../UIComponentRenderer'
import { applyComponentStyle } from '../UIComponentRenderer'
import type { HUDComponent, UITheme } from '../../types/config'
import type { GameState } from '../GameState'

export class MessageRenderer implements UIComponentRenderer {
  readonly type = 'message'

  create(component: HUDComponent, theme: UITheme): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = `
      color: var(--hud-text, ${theme.colors.text});
      font-family: var(--hud-font, ${theme.typography.fontFamily});
      font-size: var(--hud-body-size, ${theme.typography.bodySize}px);
      background: var(--hud-surface, ${theme.colors.surface})dd;
      border-radius: 12px;
      padding: 8px 16px;
      pointer-events: none;
      text-align: center;
      max-width: 80%;
      backdrop-filter: blur(8px);
      border: var(--hud-border, 1px solid rgba(255,255,255,0.1));
      transition: opacity 0.3s ease;
      display: none;
    `
    applyComponentStyle(el, component.style)
    return el
  }

  update(element: HTMLElement, state: GameState, component: HUDComponent, _theme: UITheme): void {
    if (!state.message || state.message.length === 0) {
      element.style.display = 'none'
      return
    }
    element.style.display = 'block'
    element.textContent = state.message
    applyComponentStyle(element, component.style)
  }

  destroy(element: HTMLElement): void {
    element.remove()
  }
}
