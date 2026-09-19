/**
 * UIComponentRenderer — Interface for all HUD component renderers
 *
 * Each HUD component type (score, timer, lives, etc.) implements this
 * interface so the ARHUD orchestrator can treat them polymorphically.
 */

import type { HUDComponent, UITheme, UIComponentStyle } from '../types/config'
import type { GameState } from './GameState'

export interface UIComponentRenderer {
  /** Unique component type identifier (matches HUDComponentType) */
  readonly type: string

  /** Create the DOM element for this component */
  create(component: HUDComponent, theme: UITheme): HTMLElement

  /** Update the DOM element with the latest game state */
  update(element: HTMLElement, state: GameState, component: HUDComponent, theme: UITheme): void

  /** Clean up and remove the DOM element */
  destroy(element: HTMLElement): void
}

/**
 * Apply component-level style overrides onto a DOM element.
 * These override the base theme for a specific component instance.
 */
export function applyComponentStyle(el: HTMLElement, style?: UIComponentStyle): void {
  if (!style) return
  const s = el.style
  if (style.opacity !== undefined) s.opacity = String(style.opacity)
  if (style.textColor) s.color = style.textColor
  if (style.fontSize !== undefined) s.fontSize = style.fontSize + 'px'
  if (style.fontWeight) s.fontWeight = style.fontWeight
  if (style.backgroundColor) s.backgroundColor = style.backgroundColor
  if (style.borderRadius !== undefined) s.borderRadius = style.borderRadius + 'px'
  if (style.borderColor) s.borderColor = style.borderColor
  if (style.borderWidth !== undefined) s.borderWidth = style.borderWidth + 'px'
  if (style.padding) s.padding = style.padding
}
