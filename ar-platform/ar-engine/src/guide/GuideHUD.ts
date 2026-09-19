/**
 * Guide HUD — lightweight DOM overlay for AR guide mode.
 *
 * Provides:
 *  - POI list sidebar (top-right) — shows all POIs with visited / active status
 *  - Current POI info card (bottom) — name, description, distance
 *  - Progress bar (top) — "2 / 5"
 *  - Direction indicator — simple arrow pointing toward the next POI
 *
 * All elements are created with `display: none` and `pointer-events: none`
 * by default, and are shown / hidden via the public API.
 */

import type { POI } from '../types/config'

export class GuideHUD {
  private _container: HTMLElement
  private _root: HTMLDivElement | null = null
  private _poiList: HTMLUListElement | null = null
  private _infoCard: HTMLDivElement | null = null
  private _progressBar: HTMLDivElement | null = null
  private _directionArrow: HTMLDivElement | null = null

  constructor(container: HTMLElement) {
    this._container = container
  }

  /** Create all DOM elements and append to the container. */
  create(): void {
    if (this._root) return

    // Shared base style: hidden + no pointer events until explicitly shown
    const baseStyle = 'display:none;pointer-events:none;'

    // ── Root overlay ──
    const root = document.createElement('div')
    root.id = '_guide_hud'
    root.style.cssText = `
      position:absolute;inset:0;z-index:40;
      ${baseStyle}
    `
    this._root = root

    // ── Progress bar (top center) ──
    const progress = document.createElement('div')
    progress.id = '_guide_progress'
    progress.style.cssText = `
      position:absolute;top:12px;left:50%;transform:translateX(-50%);
      padding:4px 14px;border-radius:12px;
      background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);
      color:#fff;font-size:13px;font-weight:600;letter-spacing:0.5px;
      border:1px solid rgba(255,255,255,0.12);
      ${baseStyle}
    `
    this._progressBar = progress

    // ── POI list sidebar (top-right) ──
    const list = document.createElement('ul')
    list.id = '_guide_poi_list'
    list.style.cssText = `
      position:absolute;top:48px;right:10px;
      list-style:none;margin:0;padding:8px;min-width:130px;
      border-radius:12px;
      background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);
      border:1px solid rgba(255,255,255,0.08);
      ${baseStyle}
    `
    this._poiList = list

    // ── Direction arrow (center of screen, above reticle) ──
    const arrow = document.createElement('div')
    arrow.id = '_guide_arrow'
    arrow.textContent = '▲' // upward-pointing triangle
    arrow.style.cssText = `
      position:absolute;top:50%;left:50%;
      transform:translate(-50%,-120px);
      font-size:28px;color:#4f8cff;
      text-shadow:0 0 12px rgba(79,140,255,0.5);
      transition:transform 0.15s ease-out;
      ${baseStyle}
    `
    this._directionArrow = arrow

    // ── Info card (bottom center) ──
    const card = document.createElement('div')
    card.id = '_guide_info_card'
    card.style.cssText = `
      position:absolute;bottom:120px;left:50%;transform:translateX(-50%);
      width:calc(100% - 40px);max-width:360px;
      padding:14px 18px;border-radius:16px;
      background:rgba(0,0,0,0.6);backdrop-filter:blur(10px);
      border:1px solid rgba(255,255,255,0.1);
      ${baseStyle}
    `
    this._infoCard = card

    // Assemble
    root.appendChild(progress)
    root.appendChild(list)
    root.appendChild(arrow)
    root.appendChild(card)
    this._container.appendChild(root)

    console.log('[GuideHUD] Created')
  }

  /**
   * Full update — call on every positionUpdate or whenever state changes.
   *
   * @param poiList    The full sorted POI array from the route.
   * @param currentPoi The POI currently being navigated toward.
   * @param distance   Current distance (metres) to the active POI.
   * @param progress   { current, total, visited }
   * @param visitedIds Set of POI ids that have been visited (optional).
   */
  update(
    poiList: POI[],
    currentPoi: POI | null,
    distance: number,
    progress: { current: number; total: number; visited: number },
    visitedIds?: Set<string>,
  ): void {
    if (!this._root) return

    // Show the HUD
    this._root.style.display = 'block'

    // 1. Progress bar
    if (this._progressBar) {
      this._progressBar.style.display = 'block'
      this._progressBar.textContent = `${progress.current} / ${progress.total}`
    }

    // 2. POI list sidebar
    if (this._poiList) {
      this._poiList.style.display = 'block'
      this._poiList.innerHTML = ''
      for (const poi of poiList) {
        const li = document.createElement('li')
        const isActive = poi.id === currentPoi?.id
        const isVisited = visitedIds?.has(poi.id) ?? false
        li.textContent = poi.name
        li.style.cssText = `
          padding:4px 8px;margin:2px 0;border-radius:6px;
          font-size:12px;color:rgba(255,255,255,0.85);
          ${isActive ? 'background:rgba(79,140,255,0.3);font-weight:600;' : ''}
          ${isVisited && !isActive ? 'color:rgba(255,255,255,0.4);text-decoration:line-through;' : ''}
        `
        this._poiList.appendChild(li)
      }
    }

    // 3. Info card
    if (this._infoCard && currentPoi) {
      this._infoCard.style.display = 'block'
      const distText = distance < 1000
        ? `${distance.toFixed(0)} m`
        : `${(distance / 1000).toFixed(1)} km`
      this._infoCard.innerHTML = `
        <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:4px;">
          ${this._escapeHtml(currentPoi.name)}
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-bottom:4px;">
          ${this._escapeHtml(currentPoi.description)}
        </div>
        <div style="font-size:11px;color:#4f8cff;font-weight:500;">
          ${distText}
        </div>
      `
    }

    // 4. Direction arrow (heading-based)
    if (this._directionArrow) {
      this._directionArrow.style.display = 'block'
      // The arrow always points up by default; a future heading-based
      // rotation can be applied via CSS transform rotate().
    }
  }

  /**
   * Show the info card for a specific POI (called on poiEnter).
   * Similar to update() but focused on the entered POI with a highlight.
   */
  showPOICard(poi: POI): void {
    if (!this._infoCard) return
    this._infoCard.style.display = 'block'
    this._infoCard.innerHTML = `
      <div style="font-size:15px;font-weight:600;color:#4f8cff;margin-bottom:4px;">
        ✅ ${this._escapeHtml(poi.name)}
      </div>
      <div style="font-size:12px;color:rgba(255,255,255,0.8);">
        ${this._escapeHtml(poi.description || '已到达')}
      </div>
    `
    // Auto-fade after 4 seconds
    setTimeout(() => {
      if (this._infoCard) {
        this._infoCard.style.display = 'none'
      }
    }, 4000)
  }

  /** Show a celebration overlay when the guide is complete. */
  showCelebration(): void {
    if (!this._root) return
    // Remove any existing celebration element
    const existing = this._root.querySelector('#_guide_celebration')
    if (existing) existing.remove()

    const el = document.createElement('div')
    el.id = '_guide_celebration'
    el.style.cssText = `
      position:absolute;inset:0;z-index:50;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:rgba(0,0,0,0.4);backdrop-filter:blur(4px);
      animation:_gd_fadein 0.5s ease-out;
    `
    el.innerHTML = `
      <div style="font-size:48px;margin-bottom:12px;">🎉</div>
      <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:6px;">导览完成！</div>
      <div style="font-size:14px;color:rgba(255,255,255,0.7);">所有 POI 已访问</div>
    `
    // Inject keyframes if not already present
    if (!document.getElementById('_gd_celebration_style')) {
      const s = document.createElement('style')
      s.id = '_gd_celebration_style'
      s.textContent = '@keyframes _gd_fadein{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}'
      document.head.appendChild(s)
    }
    this._root.appendChild(el)
  }

  /** Re-display the info card (undo auto-fade). Called externally when user taps/re-centers. */
  showInfoCard(): void {
    if (!this._infoCard) return
    this._infoCard.style.display = 'block'
  }
  setHeading(headingDeg: number): void {
    if (!this._directionArrow || headingDeg == null || !isFinite(headingDeg)) return
    this._directionArrow.style.transform =
      `translate(-50%,-120px) rotate(${headingDeg}deg)`
  }

  /** Dispose: remove all DOM elements and clean up. */
  dispose(): void {
    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root)
    }
    this._root = null
    this._poiList = null
    this._infoCard = null
    this._progressBar = null
    this._directionArrow = null
  }

  /** Simple HTML escaping to prevent XSS from user-supplied POI names/descriptions. */
  private _escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.appendChild(document.createTextNode(text))
    return div.innerHTML
  }
}
