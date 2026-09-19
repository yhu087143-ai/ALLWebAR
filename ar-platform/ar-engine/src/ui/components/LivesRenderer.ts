import type { UIComponentRenderer } from '../UIComponentRenderer'
import { applyComponentStyle } from '../UIComponentRenderer'
import type { HUDComponent, UITheme } from '../../types/config'
import type { GameState } from '../GameState'

export class LivesRenderer implements UIComponentRenderer {
  readonly type = 'lives'

  create(component: HUDComponent, theme: UITheme): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = `
      font-family: var(--hud-font, ${theme.typography.fontFamily});
      font-size: var(--hud-body-size, ${theme.typography.bodySize}px);
      text-shadow: 0 1px 3px rgba(0,0,0,0.3);
      pointer-events: none;
      white-space: nowrap;
      line-height: 1.4;
    `
    applyComponentStyle(el, component.style)
    el.innerHTML = this._buildHearts(3, 3, component)
    return el
  }

  update(element: HTMLElement, state: GameState, component: HUDComponent, _theme: UITheme): void {
    const lives = state.lives
    const maxLives = state.maxLives || lives
    element.innerHTML = this._buildHearts(lives, maxLives, component)
    applyComponentStyle(element, component.style)
  }

  destroy(element: HTMLElement): void {
    element.remove()
  }

  private _buildHearts(lives: number, maxLives: number, component: HUDComponent): string {
    // Use HTML entity hearts for consistent cross-platform rendering (no emoji discrepancies)
    const filledIcon = component.props?.icon || '♥'  // ♥ (solid heart)
    const emptyIcon = component.props?.emptyIcon || '♡'  // ♡ (empty heart)
    const alive = Math.max(0, Math.min(lives, maxLives))
    const lost = Math.max(0, maxLives - alive)
    return filledIcon.repeat(alive) + emptyIcon.repeat(lost)
  }
}
