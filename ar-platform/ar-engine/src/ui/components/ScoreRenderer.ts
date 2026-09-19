import type { UIComponentRenderer } from '../UIComponentRenderer'
import { applyComponentStyle } from '../UIComponentRenderer'
import type { HUDComponent, UITheme } from '../../types/config'
import type { GameState } from '../GameState'

export class ScoreRenderer implements UIComponentRenderer {
  readonly type = 'score'

  create(component: HUDComponent, theme: UITheme): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = `
      color: var(--hud-primary, ${theme.colors.primary});
      font-family: var(--hud-font, ${theme.typography.fontFamily});
      font-size: var(--hud-title-size, ${theme.typography.titleSize}px);
      font-weight: bold;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
      pointer-events: none;
      white-space: nowrap;
      line-height: 1.4;
    `
    applyComponentStyle(el, component.style)
    el.textContent = `${component.label || 'SCORE'}: 0`
    return el
  }

  update(element: HTMLElement, state: GameState, component: HUDComponent, _theme: UITheme): void {
    const label = component.label || 'SCORE'
    element.textContent = `${label}: ${state.score}`
    applyComponentStyle(element, component.style)
  }

  destroy(element: HTMLElement): void {
    element.remove()
  }
}
