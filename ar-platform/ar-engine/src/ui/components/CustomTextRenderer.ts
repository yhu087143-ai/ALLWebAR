import type { UIComponentRenderer } from '../UIComponentRenderer'
import { applyComponentStyle } from '../UIComponentRenderer'
import type { HUDComponent, UITheme } from '../../types/config'
import type { GameState } from '../GameState'

export class CustomTextRenderer implements UIComponentRenderer {
  readonly type = 'custom_text'

  create(component: HUDComponent, theme: UITheme): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = `
      color: var(--hud-text, ${theme.colors.text});
      font-family: var(--hud-font, ${theme.typography.fontFamily});
      font-size: var(--hud-body-size, ${theme.typography.bodySize}px);
      pointer-events: none;
      white-space: nowrap;
      text-shadow: 0 1px 3px rgba(0,0,0,0.3);
    `
    applyComponentStyle(el, component.style)
    el.textContent = component.props?.text || ''
    return el
  }

  update(element: HTMLElement, _state: GameState, component: HUDComponent, _theme: UITheme): void {
    element.textContent = component.props?.text || ''
    applyComponentStyle(element, component.style)
  }

  destroy(element: HTMLElement): void {
    element.remove()
  }
}
