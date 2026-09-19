import * as THREE from 'three'

/**
 * Adaptive projection matrix correction.
 *
 * MindAR uses the camera's native 4:3 feed. On 20:9 phones this causes
 * aspect mismatch and model stretching. This adapter corrects the camera
 * projection based on the actual container aspect ratio while preserving
 * the vertical FOV extracted from MindAR's internal projection matrix.
 */
export class ProjectionAdapter {
  private _verticalFov = 50
  private _lastW = 0
  private _lastH = 0

  get verticalFov(): number {
    return this._verticalFov
  }

  /**
   * Extract vertical FOV from a MindAR camera's projection matrix.
   * Call once on start or after camera switch.
   */
  extractFOV(camera: THREE.PerspectiveCamera): void {
    const proj = camera.projectionMatrix.elements
    const tanHalfFov = 1 / Math.abs(proj[5])
    this._verticalFov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalfFov))
  }

  /**
   * Apply corrected projection to the camera.
   * Should be called each frame (it only updates on container size change).
   */
  update(camera: THREE.PerspectiveCamera, container: HTMLElement): boolean {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === this._lastW && h === this._lastH) return false

    this._lastW = w
    this._lastH = h

    camera.fov = this._verticalFov
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    return true
  }

  dispose(): void {
    this._lastW = 0
    this._lastH = 0
  }
}
