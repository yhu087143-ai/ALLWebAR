import type { UIComponentRenderer } from '../UIComponentRenderer'
import { applyComponentStyle } from '../UIComponentRenderer'
import type { HUDComponent, UITheme } from '../../types/config'
import type { GameState } from '../GameState'

export class ComboRenderer implements UIComponentRenderer {
  readonly type = 'combo'

  create(component: HUDComponent, theme: UITheme): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = `
      color: var(--hud-accent, ${theme.colors.accent});
      font-family: var(--hud-font, ${theme.typography.fontFamily});
      font-size: var(--hud-title-size, ${theme.typography.titleSize}px);
      font-weight: bold;
      text-align: center;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
      pointer-events: none;
      white-space: nowrap;
      line-height: 1.4;
      display: none;
    `
    applyComponentStyle(el, component.style)
    return el
  }

  update(element: HTMLElement, state: GameState, component: HUDComponent, _theme: UITheme): void {
    if (state.combo <= 0) {
      element.style.display = 'none'
      return
    }

    element.style.display = 'block'

    // Main combo count
    const countEl = this._getOrCreateChild(element, 'combo-count', 'span')
    countEl.textContent = `x${state.combo}`
    countEl.style.cssText = `
      color: var(--hud-accent);
      font-size: inherit;
      font-weight: bold;
    `

    // Multiplier (only shown when > 1)
    if (state.comboMultiplier > 1) {
      const multEl = this._getOrCreateChild(element, 'combo-mult', 'div')
      multEl.textContent = `x${state.comboMultiplier.toFixed(1)}`
      multEl.style.cssText = `
        color: var(--hud-accent);
        font-size: 0.6em;
        opacity: 0.8;
        text-align: center;
      `
      multEl.style.display = 'block'
    } else {
      const multEl = element.querySelector('.combo-mult') as HTMLElement | null
      if (multEl) multEl.style.display = 'none'
    }

    applyComponentStyle(element, component.style)
  }

  destroy(element: HTMLElement): void {
    element.remove()
  }

  private _getOrCreateChild(parent: HTMLElement, className: string, tag: string): HTMLElement {
    let child = parent.querySelector(`.${className}`) as HTMLElement | null
    if (!child) {
      child = document.createElement(tag)
      child.className = className
      parent.appendChild(child)
    }
    return child
  }
}
