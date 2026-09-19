import type { UIComponentRenderer } from '../UIComponentRenderer'
import { applyComponentStyle } from '../UIComponentRenderer'
import type { HUDComponent, UITheme } from '../../types/config'
import type { GameState } from '../GameState'

export class ProgressRenderer implements UIComponentRenderer {
  readonly type = 'progress_bar'

  create(component: HUDComponent, theme: UITheme): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = `
      color: var(--hud-text, ${theme.colors.text});
      font-family: var(--hud-font, ${theme.typography.fontFamily});
      background: var(--hud-surface, ${theme.colors.surface})99;
      border-radius: 8px;
      padding: 6px 12px;
      pointer-events: none;
      min-width: 120px;
      backdrop-filter: blur(4px);
    `
    applyComponentStyle(el, component.style)

    const label = document.createElement('div')
    label.className = 'progress-label'
    label.style.cssText = `font-size: var(--hud-label-size, ${theme.typography.labelSize}px); opacity: 0.7; margin-bottom: 4px;`
    label.textContent = component.label || '进度'
    el.appendChild(label)

    const track = document.createElement('div')
    track.style.cssText = `height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;`
    const fill = document.createElement('div')
    fill.className = 'progress-fill'
    fill.style.cssText = `height: 100%; width: 0%; background: var(--hud-primary, ${theme.colors.primary}); border-radius: 2px; transition: width 0.3s ease;`
    track.appendChild(fill)
    el.appendChild(track)

    return el
  }

  update(element: HTMLElement, state: GameState, _component: HUDComponent, _theme: UITheme): void {
    const label = element.querySelector('.progress-label') as HTMLElement
    if (label) {
      const visited = state.visitedPois?.length || 0
      const total = state.totalPois || 0
      label.textContent = `${visited}/${total}`
    }
    const fill = element.querySelector('.progress-fill') as HTMLElement
    if (fill) {
      const pct = state.totalPois > 0 ? ((state.visitedPois?.length || 0) / state.totalPois) * 100 : 0
      fill.style.width = `${pct}%`
    }
  }

  destroy(element: HTMLElement): void {
    element.remove()
  }
}
