import type { UIComponentRenderer } from '../UIComponentRenderer'
import { applyComponentStyle } from '../UIComponentRenderer'
import type { HUDComponent, UITheme } from '../../types/config'
import type { GameState } from '../GameState'

export class POIListRenderer implements UIComponentRenderer {
  readonly type = 'poi_list'

  create(component: HUDComponent, theme: UITheme): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = `
      color: var(--hud-text, ${theme.colors.text});
      font-family: var(--hud-font, ${theme.typography.fontFamily});
      background: var(--hud-surface, ${theme.colors.surface})cc;
      border-radius: 8px;
      padding: 6px 10px;
      pointer-events: none;
      min-width: 100px;
      max-width: 140px;
      backdrop-filter: blur(4px);
      border: var(--hud-border, 1px solid rgba(255,255,255,0.1));
      display: none;
    `
    applyComponentStyle(el, component.style)

    const header = document.createElement('div')
    header.className = 'poi-list-header'
    header.style.cssText = `font-size: var(--hud-label-size, ${theme.typography.labelSize}px); opacity: 0.7; margin-bottom: 4px;`
    header.textContent = component.label || '兴趣点'
    el.appendChild(header)

    const list = document.createElement('div')
    list.className = 'poi-items'
    el.appendChild(list)

    return el
  }

  update(element: HTMLElement, state: GameState, _component: HUDComponent, theme: UITheme): void {
    const total = state.totalPois || 0
    if (total <= 0) { element.style.display = 'none'; return }
    element.style.display = 'block'

    const list = element.querySelector('.poi-items') as HTMLElement
    if (!list) return
    const visited = state.visitedPois || []
    const count = Math.min(total, 5)

    list.innerHTML = ''
    for (let i = 0; i < count; i++) {
      const item = document.createElement('div')
      const isVisited = visited.includes(`poi_${i}`)
      item.style.cssText = `display: flex; align-items: center; gap: 4px; padding: 2px 0; font-size: calc(var(--hud-body-size, ${theme.typography.bodySize}px) - 2px); opacity: ${isVisited ? 0.4 : 0.8};`

      const num = document.createElement('span')
      num.textContent = `${i + 1}.`
      item.appendChild(num)

      const name = document.createElement('span')
      name.style.cssText = `flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
      name.textContent = `POI ${i + 1}`
      item.appendChild(name)

      if (isVisited) {
        const check = document.createElement('span')
        check.style.color = `var(--hud-success, ${theme.colors.success})`
        check.textContent = '✓'
        item.appendChild(check)
      }
      list.appendChild(item)
    }
  }

  destroy(element: HTMLElement): void {
    element.remove()
  }
}
