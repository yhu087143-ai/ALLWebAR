import type { UIComponentRenderer } from '../UIComponentRenderer'
import { applyComponentStyle } from '../UIComponentRenderer'
import type { HUDComponent, UITheme } from '../../types/config'
import type { GameState } from '../GameState'

export class ArrowRenderer implements UIComponentRenderer {
  readonly type = 'directional_arrow'

  create(component: HUDComponent, theme: UITheme): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = `
      color: var(--hud-primary, ${theme.colors.primary});
      font-size: 28px;
      opacity: 0.8;
      pointer-events: none;
      text-shadow: 0 0 12px rgba(0,0,0,0.4);
      transition: transform 0.15s ease-out;
    `
    applyComponentStyle(el, component.style)
    const style = component.props?.style || 'arrow'
    el.textContent = style === 'triangle' ? '▲' : style === 'dot' ? '●' : '→'
    return el
  }

  update(element: HTMLElement, _state: GameState, component: HUDComponent, _theme: UITheme): void {
    const style = component.props?.style || 'arrow'
    element.textContent = style === 'triangle' ? '▲' : style === 'dot' ? '●' : '→'
    applyComponentStyle(element, component.style)
  }

  destroy(element: HTMLElement): void {
    element.remove()
  }
}
