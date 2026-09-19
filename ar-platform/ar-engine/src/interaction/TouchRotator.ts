import * as THREE from 'three'

export class TouchRotator {
  private _touchRot = new THREE.Quaternion()
  private _touchDeltaQ = new THREE.Quaternion()
  private _touchEuler = new THREE.Euler()
  private _touchNDC = new THREE.Vector2()
  private _touchDrag = false

  get rotation(): THREE.Quaternion {
    return this._touchRot
  }

  init(container: HTMLElement): void {
    const onStart = (clientX: number, clientY: number) => {
      this._touchDrag = true
      this._touchNDC.set(
        (clientX / container.clientWidth) * 2 - 1,
        -(clientY / container.clientHeight) * 2 + 1,
      )
    }

    const onMove = (clientX: number, clientY: number) => {
      if (!this._touchDrag) return
      const ndcX = (clientX / container.clientWidth) * 2 - 1
      const ndcY = -(clientY / container.clientHeight) * 2 + 1
      const dx = ndcX - this._touchNDC.x
      const dy = ndcY - this._touchNDC.y
      this._touchNDC.set(ndcX, ndcY)

      if (Math.abs(dx) < 0.0005 && Math.abs(dy) < 0.0005) return

      const rotSpeed = Math.PI
      this._touchEuler.set(-dy * rotSpeed, -dx * rotSpeed, 0)
      this._touchDeltaQ.setFromEuler(this._touchEuler)
      this._touchRot.multiply(this._touchDeltaQ)
    }

    const onEnd = () => { this._touchDrag = false }

    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: true })
    container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: true })
    container.addEventListener('touchend', onEnd, { passive: true })
    container.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY))
    container.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY))
    container.addEventListener('mouseup', onEnd)
  }

  reset(): void {
    this._touchRot.identity()
    this._touchDrag = false
  }

  dispose(): void {
    this._touchRot.identity()
    this._touchDrag = false
  }
}
