import type { UIComponentRenderer } from '../UIComponentRenderer'
import { applyComponentStyle } from '../UIComponentRenderer'
import type { HUDComponent, UITheme } from '../../types/config'
import type { GameState } from '../GameState'

export class CompassRenderer implements UIComponentRenderer {
  readonly type = 'compass'

  create(component: HUDComponent, theme: UITheme): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = `
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--hud-surface, ${theme.colors.surface})99;
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      border: var(--hud-border, 1px solid rgba(255,255,255,0.1));
    `
    applyComponentStyle(el, component.style)
    const needle = document.createElement('div')
    needle.className = 'compass-needle'
    needle.style.cssText = `font-size: 20px; line-height: 1; transition: transform 0.2s ease-out;`
    needle.textContent = '↑'
    el.appendChild(needle)
    return el
  }

  update(element: HTMLElement, state: GameState, _component: HUDComponent, _theme: UITheme): void {
    const needle = element.querySelector('.compass-needle') as HTMLElement
    if (!needle) return
    const heading = state.heading ?? 0
    needle.style.transform = `rotate(${heading}deg)`
  }

  destroy(element: HTMLElement): void {
    element.remove()
  }
}
