import * as THREE from 'three'

interface Particle {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  life: number
}

export class ParticleBurst {
  private _scene: THREE.Scene
  private _activeBursts: ReturnType<typeof setInterval>[] = []
  private _tempVec = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    this._scene = scene
  }

  emit(position: THREE.Vector3, color: number = 0xffdd00): void {
    const count = 20 + Math.floor(Math.random() * 11)
    const particles: Particle[] = []

    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.015, 4, 4)
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.copy(position)

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 1.2 + 0.1,
        (Math.random() - 0.5) * 1.5
      )

      this._scene.add(mesh)
      particles.push({ mesh, velocity, life: 1.0 })
    }

    const intervalId = setInterval(() => {
      let allDead = true

      for (const p of particles) {
        if (p.life <= 0) continue

        p.life -= 0.033
        this._tempVec.copy(p.velocity).multiplyScalar(0.04);
        p.mesh.position.add(this._tempVec)
        p.velocity.multiplyScalar(0.96)

        const mat = p.mesh.material as THREE.MeshBasicMaterial
        mat.opacity = Math.max(0, p.life)

        if (p.life <= 0) {
          this._scene.remove(p.mesh)
          p.mesh.geometry.dispose()
          mat.dispose()
        } else {
          allDead = false
        }
      }

      if (allDead) {
        clearInterval(intervalId)
        const idx = this._activeBursts.indexOf(intervalId)
        if (idx >= 0) this._activeBursts.splice(idx, 1)
      }
    }, 30)

    this._activeBursts.push(intervalId)
  }

  dispose(): void {
    for (const id of this._activeBursts) {
      clearInterval(id)
    }
    this._activeBursts = []
  }
}

export class SoundManager {
  private _volume = 1.0
  private _activeAudio: HTMLAudioElement[] = []

  play(src: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        const audio = new Audio(src)
        audio.volume = this._volume
        this._activeAudio.push(audio)

        const cleanup = () => {
          const idx = this._activeAudio.indexOf(audio)
          if (idx >= 0) this._activeAudio.splice(idx, 1)
        }

        audio.addEventListener('ended', () => { cleanup(); resolve() }, { once: true })
        audio.addEventListener('error', () => { cleanup(); resolve() }, { once: true })
        audio.play().catch((err) => { cleanup(); resolve() })
      } catch (err) {
        resolve()
      }
    })
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v))
  }

  dispose(): void {
    for (const audio of this._activeAudio) {
      audio.pause()
      audio.src = ''
      audio.load()
    }
    this._activeAudio = []
  }
}
