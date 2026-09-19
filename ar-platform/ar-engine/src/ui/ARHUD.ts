/**
 * ARHUD — HUD Runtime Rendering System
 *
 * Orchestrates all HUD components as DOM overlays on top of the AR scene.
 * Responsibilities:
 *   1. Renderer registry — maps component type → renderer
 *   2. Component lifecycle — create/update/destroy DOM elements
 *   3. Anchor positioning — 9 anchor positions via CSS
 *   4. Theme application — CSS custom properties from UITheme
 *   5. State subscription — auto-update when GameState changes
 *   6. Backward compatibility — deprecated boolean → component mapping
 */

import { GameStateManager, type GameState, type StateListener } from './GameState'
import type { UIComponentRenderer } from './UIComponentRenderer'
import type { HUDConfig, HUDComponent, UITheme, HUDAnchor } from '../types/config'

export { type StateListener }

export class ARHUD {
  private _container: HTMLElement
  private _config: HUDConfig
  private _stateManager: GameStateManager
  private _renderers: Map<string, UIComponentRenderer> = new Map()
  private _elements: Map<string, HTMLElement> = new Map()
  private _root: HTMLDivElement | null = null
  private _disposed = false
  private _unsubscribe: (() => void) | null = null

  constructor(container: HTMLElement, config: HUDConfig, initialState?: Partial<GameState>) {
    this._container = container
    this._config = config
    this._stateManager = new GameStateManager(initialState)
  }

  // ── Public API ──

  /** Register a component renderer by type */
  registerRenderer(renderer: UIComponentRenderer): void {
    this._renderers.set(renderer.type, renderer)
  }

  /** Initialize HUD: create root element, apply theme, build all components, subscribe to state */
  init(): void {
    if (this._disposed) return
    this._root = this._createRoot()
    this._applyTheme(this._config.theme)
    this._container.appendChild(this._root)
    this._syncComponents()

    // Subscribe to state changes for auto-update
    this._unsubscribe = this._stateManager.subscribe((state) => {
      this._onStateChange(state)
    })
  }

  /** Update a single component by its ID */
  updateComponent(componentId: string): void {
    if (this._disposed) return
    const el = this._elements.get(componentId)
    if (!el) {
      console.warn(`[ARHUD] Component "${componentId}" not found`)
      return
    }
    const comp = this._getComponent(componentId)
    if (!comp) return
    const renderer = this._getRendererForType(comp.type)
    if (!renderer) {
      console.warn(`[ARHUD] No renderer for type "${comp.type}"`)
      return
    }
    renderer.update(el, this._stateManager.state, comp, this._config.theme)
  }

  /** Update all active components with the latest state */
  updateAll(): void {
    if (this._disposed || !this._root) return
    const state = this._stateManager.state
    for (const [id, el] of this._elements) {
      const comp = this._getComponent(id)
      if (!comp) continue
      const renderer = this._getRendererForType(comp.type)
      if (!renderer) continue
      renderer.update(el, state, comp, this._config.theme)
    }
  }

  /** Update game state (delegates to GameStateManager) */
  updateState(patch: Partial<GameState>): void {
    this._stateManager.update(patch)
  }

  /** Get the GameStateManager (for engine integration) */
  get stateManager(): GameStateManager {
    return this._stateManager
  }

  /** Subscribe to all state changes */
  subscribe(listener: StateListener): () => void {
    return this._stateManager.subscribe(listener)
  }

  /** Clean up all resources */
  dispose(): void {
    if (this._disposed) return
    this._disposed = true

    // Unsubscribe from state changes
    this._unsubscribe?.()

    // Destroy all component elements
    for (const [id, el] of this._elements) {
      const comp = this._getComponent(id)
      if (comp) {
        const renderer = this._getRendererForType(comp.type)
        if (renderer) {
          try { renderer.destroy(el) } catch { el.remove() }
        } else {
          el.remove()
        }
      } else {
        el.remove()
      }
    }
    this._elements.clear()

    // Remove root element
    if (this._root?.parentNode) {
      this._root.parentNode.removeChild(this._root)
    }
    this._root = null
    this._renderers.clear()
  }

  /** Whether this HUD has been disposed */
  get disposed(): boolean {
    return this._disposed
  }

  // ── Private ──

  /** Create the root overlay div */
  private _createRoot(): HTMLDivElement {
    const root = document.createElement('div')
    root.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 40;
      overflow: hidden;
    `
    return root
  }

  /** Apply UITheme as CSS custom properties on the root element */
  private _applyTheme(theme: UITheme): void {
    if (!this._root) return
    const r = this._root.style

    // Colors
    r.setProperty('--hud-primary', theme.colors.primary)
    r.setProperty('--hud-secondary', theme.colors.secondary)
    r.setProperty('--hud-accent', theme.colors.accent)
    r.setProperty('--hud-bg', theme.colors.background)
    r.setProperty('--hud-surface', theme.colors.surface)
    r.setProperty('--hud-text', theme.colors.text)
    r.setProperty('--hud-text-sec', theme.colors.textSecondary)
    r.setProperty('--hud-success', theme.colors.success)
    r.setProperty('--hud-warning', theme.colors.warning)
    r.setProperty('--hud-error', theme.colors.error)
    r.setProperty('--hud-info', theme.colors.info)
    r.setProperty('--hud-border', `1px solid ${theme.colors.secondary}33`)

    // Typography
    r.setProperty('--hud-font', theme.typography.fontFamily)
    r.setProperty('--hud-title-size', theme.typography.titleSize + 'px')
    r.setProperty('--hud-body-size', theme.typography.bodySize + 'px')
    r.setProperty('--hud-label-size', theme.typography.labelSize + 'px')

    // Shape
    r.setProperty('--hud-radius', this._mapBorderRadius(theme.shape.borderRadius))
    r.setProperty('--hud-btn-radius', this._mapButtonRadius(theme.shape.buttonStyle))

    // Background effect
    switch (theme.shape.backgroundEffect) {
      case 'blur':
        r.backdropFilter = 'blur(20px)'
        ;(r as any).webkitBackdropFilter = 'blur(20px)'
        r.background = 'transparent'
        break
      case 'dim':
        r.backdropFilter = 'none'
        r.background = 'rgba(0,0,0,0.35)'
        break
      case 'solid':
        r.backdropFilter = 'none'
        r.background = theme.colors.background
        break
      case 'transparent':
      default:
        r.backdropFilter = 'none'
        r.background = 'transparent'
        break
    }
  }

  /** Calculate position style from HUDComponent.position (anchor + offset) */
  private _calcPosition(component: HUDComponent): Record<string, string> {
    const { anchor, offsetX, offsetY } = component.position
    const style: Record<string, string> = {}

    // 1. Base positioning
    switch (anchor) {
      case 'top-left':      style.top = '0'; style.left = '0'; break
      case 'top-center':    style.top = '0'; style.left = '50%'; break
      case 'top-right':     style.top = '0'; style.right = '0'; break
      case 'middle-left':   style.top = '50%'; style.left = '0'; break
      case 'center':        style.top = '50%'; style.left = '50%'; break
      case 'middle-right':  style.top = '50%'; style.right = '0'; break
      case 'bottom-left':   style.bottom = '0'; style.left = '0'; break
      case 'bottom-center': style.bottom = '0'; style.left = '50%'; break
      case 'bottom-right':  style.bottom = '0'; style.right = '0'; break
    }

    // 2. Build transform chain: centering transform (if any) + offset transform
    const transforms: string[] = []

    // Base centering transform
    switch (anchor) {
      case 'top-center':
      case 'bottom-center':
        transforms.push('translateX(-50%)')
        break
      case 'middle-left':
      case 'middle-right':
        transforms.push('translateY(-50%)')
        break
      case 'center':
        transforms.push('translate(-50%,-50%)')
        break
    }

    // Offset transform (positive offsetX = right, positive offsetY = down)
    if (offsetX !== 0 || offsetY !== 0) {
      transforms.push(`translate(${offsetX}px,${offsetY}px)`)
    }

    if (transforms.length > 0) {
      style.transform = transforms.join(' ')
    }

    // 3. Size
    if (component.size?.width != null) {
      style.width = component.size.width + 'px'
    }
    if (component.size?.height != null) {
      style.height = component.size.height + 'px'
    }

    return style
  }

  /** Create or update all component DOM elements */
  private _syncComponents(): void {
    if (!this._root) return

    const components = this._resolveComponents()

    // Track which IDs are currently in the DOM
    const currentIds = new Set(this._elements.keys())
    const wantedIds = new Set(
      components.filter(c => c.enabled).map(c => c.id)
    )

    // Remove elements for disabled / removed components
    for (const id of currentIds) {
      if (!wantedIds.has(id)) {
        const el = this._elements.get(id)!
        const oldComp = this._getComponent(id)
        if (oldComp) {
          const renderer = this._getRendererForType(oldComp.type)
          if (renderer) {
            try { renderer.destroy(el) } catch { el.remove() }
          } else {
            el.remove()
          }
        } else {
          el.remove()
        }
        this._elements.delete(id)
      }
    }

    // Create or update elements for enabled components
    const existingComponents = this._getAllConfigComponents()
    for (const comp of components) {
      if (!comp.enabled) continue

      let el = this._elements.get(comp.id)

      if (!el) {
        // Create new element
        const renderer = this._getRendererForType(comp.type)
        if (!renderer) {
          console.warn(`[ARHUD] No renderer registered for type "${comp.type}" (component "${comp.id}")`)
          continue
        }
        el = renderer.create(comp, this._config.theme)
        el.dataset.componentId = comp.id
        el.dataset.componentType = comp.type

        // Apply position
        const posStyle = this._calcPosition(comp)
        Object.assign(el.style, posStyle)

        this._root.appendChild(el)
        this._elements.set(comp.id, el)
      } else {
        // Update position (in case config changed)
        const posStyle = this._calcPosition(comp)
        Object.assign(el.style, posStyle)
      }

      // Update the config reference for backward-compat components
      const existingIdx = existingComponents.findIndex(c => c.id === comp.id)
      if (existingIdx >= 0) {
        existingComponents[existingIdx] = comp
      } else {
        existingComponents.push(comp)
      }
    }
  }

  /** React to state changes: update all elements */
  private _onStateChange(_state: GameState): void {
    this.updateAll()
  }

  /** Look up a renderer by component type */
  private _getRendererForType(type: string): UIComponentRenderer | undefined {
    return this._renderers.get(type)
  }

  /** Find a component by ID in the resolved config */
  private _getComponent(id: string): HUDComponent | undefined {
    return this._resolveComponents().find(c => c.id === id)
  }

  /** Get the raw components array from config */
  private _getAllConfigComponents(): HUDComponent[] {
    return this._config.components
  }

  /**
   * Resolve the full component list, including backward-compatible
   * auto-creation from deprecated boolean fields.
   */
  private _resolveComponents(): HUDComponent[] {
    const config = this._config
    const components = [...config.components]

    // Legacy: showScore → create score component at top-left
    if (config.showScore && !components.find(c => c.type === 'score')) {
      const anchor = (config.scorePosition as HUDAnchor) || 'top-left'
      components.push({
        id: '_hud_score',
        type: 'score',
        enabled: true,
        position: { anchor, offsetX: 16, offsetY: 16 },
        props: {},
      })
    }

    // Legacy: showTimer → create timer component at top-right
    if (config.showTimer && !components.find(c => c.type === 'timer')) {
      const anchor = (config.timerPosition as HUDAnchor) || 'top-right'
      components.push({
        id: '_hud_timer',
        type: 'timer',
        enabled: true,
        position: { anchor, offsetX: 16, offsetY: 16 },
        props: {},
      })
    }

    // Legacy: showMessage → create message component at bottom-center
    if (config.showMessage && !components.find(c => c.type === 'message')) {
      components.push({
        id: '_hud_message',
        type: 'message',
        enabled: true,
        position: { anchor: 'bottom-center', offsetX: 0, offsetY: 80 },
        props: {},
      })
    }

    return components
  }

  /** Map theme borderRadius to CSS value */
  private _mapBorderRadius(radius: string): string {
    switch (radius) {
      case 'none': return '0'
      case 'small': return '4px'
      case 'medium': return '8px'
      case 'large': return '16px'
      case 'full': return '9999px'
      default: return '8px'
    }
  }

  /** Map theme buttonStyle to CSS border-radius */
  private _mapButtonRadius(style: string): string {
    switch (style) {
      case 'pill': return '9999px'
      case 'square': return '0'
      case 'rounded': return '12px'
      default: return '12px'
    }
  }
}
