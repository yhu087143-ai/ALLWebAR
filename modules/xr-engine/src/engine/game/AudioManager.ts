/**
 * 统一音频管理器。
 *
 * Web 端使用 HTMLAudioElement；未来微信小程序端可替换为
 * wx.createInnerAudioContext()，接口保持不变。
 */
export interface AudioOptions {
  volume?: number
  loop?: boolean
}

export class AudioManager {
  private urls = new Map<string, string>()
  private master = 1
  private sfxVolume = 1
  private bgmVolume = 0.6
  private active = new Set<HTMLAudioElement>()
  private bgm: HTMLAudioElement | null = null

  setMasterVolume(v: number): void {
    this.master = Math.max(0, Math.min(1, v))
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v))
  }

  setBgmVolume(v: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, v))
  }

  getMasterVolume(): number {
    return this.master
  }

  register(id: string, url: string): void {
    this.urls.set(id, url)
  }

  unregister(id: string): void {
    this.urls.delete(id)
  }

  playSfx(id: string, options: AudioOptions = {}): (() => void) | undefined {
    if (typeof Audio === 'undefined') return undefined
    const url = this.urls.get(id)
    if (!url) return undefined
    const audio = new Audio(url)
    audio.volume = (options.volume ?? 1) * this.master * this.sfxVolume
    audio.loop = options.loop ?? false
    audio.onended = () => this.releaseAudio(audio)
    this.active.add(audio)
    void audio.play().catch(() => {
      this.active.delete(audio)
    })
    // loop 的音效永远不会触发 onended，调用方需保存返回的 stop 句柄收尾，
    // 否则 active 集合只增不减
    return () => this.releaseAudio(audio)
  }

  playBgm(id: string, options: AudioOptions = {}): void {
    if (typeof Audio === 'undefined') return
    const url = this.urls.get(id)
    if (!url) return
    this.stopBgm()
    const audio = new Audio(url)
    audio.volume = (options.volume ?? this.bgmVolume) * this.master
    audio.loop = options.loop ?? true
    this.bgm = audio
    void audio.play().catch(() => {
      this.bgm = null
    })
  }

  stopBgm(): void {
    if (this.bgm) {
      const bgm = this.bgm
      this.bgm = null
      // 先摘事件回调再清 src：对空 src 的加载会触发 error 事件
      bgm.onended = null
      bgm.onerror = null
      bgm.pause()
      bgm.removeAttribute('src')
    }
  }

  stopAll(): void {
    this.stopBgm()
    for (const audio of [...this.active]) this.releaseAudio(audio)
    this.active.clear()
  }

  /** 停止并回收一个音效元素，同时从 active 集合移除 */
  private releaseAudio(audio: HTMLAudioElement): void {
    this.active.delete(audio)
    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio.removeAttribute('src')
  }
}
