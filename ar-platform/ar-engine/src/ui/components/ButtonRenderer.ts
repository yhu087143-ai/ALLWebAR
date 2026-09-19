import type { UIComponentRenderer } from '../UIComponentRenderer'
import { applyComponentStyle } from '../UIComponentRenderer'
import type { HUDComponent, UITheme } from '../../types/config'
import type { GameState } from '../GameState'

export class ButtonRenderer implements UIComponentRenderer {
  readonly type = 'button'

  create(component: HUDComponent, theme: UITheme): HTMLElement {
    const el = document.createElement('div')
    const btnStyle = theme.shape.buttonStyle
    const radius = btnStyle === 'pill' ? '9999px' : btnStyle === 'square' ? '4px' : '8px'

    el.style.cssText = `
      color: var(--hud-text, ${theme.colors.text});
      font-family: var(--hud-font, ${theme.typography.fontFamily});
      font-size: var(--hud-body-size, ${theme.typography.bodySize}px);
      font-weight: bold;
      background: var(--hud-primary, ${theme.colors.primary});
      border-radius: ${radius};
      padding: 8px 20px;
      cursor: pointer;
      text-align: center;
      pointer-events: auto;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      transition: transform 0.1s, opacity 0.1s;
      user-select: none;
    `
    applyComponentStyle(el, component.style)
    el.textContent = component.props?.text || '按钮'

    el.addEventListener('touchstart', () => { el.style.transform = 'scale(0.95)' })
    el.addEventListener('touchend', () => { el.style.transform = 'scale(1)' })
    el.addEventListener('mousedown', () => { el.style.transform = 'scale(0.95)' })
    el.addEventListener('mouseup', () => { el.style.transform = 'scale(1)' })

    return el
  }

  update(element: HTMLElement, _state: GameState, component: HUDComponent, _theme: UITheme): void {
    element.textContent = component.props?.text || '按钮'
    applyComponentStyle(element, component.style)
  }

  destroy(element: HTMLElement): void {
    element.remove()
  }
}
