import type { UIComponentRenderer } from '../UIComponentRenderer'
import { applyComponentStyle } from '../UIComponentRenderer'
import type { HUDComponent, UITheme } from '../../types/config'
import type { GameState } from '../GameState'

export class POICardRenderer implements UIComponentRenderer {
  readonly type = 'poi_card'

  create(component: HUDComponent, theme: UITheme): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = `
      color: var(--hud-text, ${theme.colors.text});
      font-family: var(--hud-font, ${theme.typography.fontFamily});
      background: var(--hud-surface, ${theme.colors.surface})dd;
      border-radius: 12px;
      padding: 10px 14px;
      pointer-events: none;
      max-width: 80%;
      min-width: 140px;
      backdrop-filter: blur(8px);
      border: var(--hud-border, 1px solid rgba(255,255,255,0.1));
      display: none;
    `
    applyComponentStyle(el, component.style)

    const name = document.createElement('div')
    name.className = 'poi-name'
    name.style.cssText = `font-size: var(--hud-label-size, ${theme.typography.labelSize}px); font-weight: bold; margin-bottom: 2px;`
    el.appendChild(name)

    const desc = document.createElement('div')
    desc.className = 'poi-desc'
    desc.style.cssText = `font-size: calc(var(--hud-body-size, ${theme.typography.bodySize}px) - 2px); opacity: 0.7;`
    el.appendChild(desc)

    const dist = document.createElement('div')
    dist.className = 'poi-dist'
    dist.style.cssText = `font-size: var(--hud-label-size, ${theme.typography.labelSize}px); opacity: 0.5; margin-top: 2px;`
    el.appendChild(dist)

    return el
  }

  update(element: HTMLElement, state: GameState, component: HUDComponent, _theme: UITheme): void {
    if (!state.currentPOI) {
      element.style.display = 'none'
      return
    }
    element.style.display = 'block'
    const name = element.querySelector('.poi-name') as HTMLElement
    if (name) name.textContent = state.currentPOI
    const desc = element.querySelector('.poi-desc') as HTMLElement
    if (desc) desc.textContent = state.poiDescription || component.props?.description || ''
    const dist = element.querySelector('.poi-dist') as HTMLElement
    if (dist && state.distanceToPOI != null) {
      dist.textContent = state.distanceToPOI < 1 ? '就在附近' : `约 ${Math.round(state.distanceToPOI)}m`
    }
  }

  destroy(element: HTMLElement): void {
    element.remove()
  }
}
