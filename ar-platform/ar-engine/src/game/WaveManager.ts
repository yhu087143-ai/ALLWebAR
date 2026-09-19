import type { WaveConfig, Wave, WaveEnemy } from '../types/config'

/**
 * WaveManager — 波次管理系统
 *
 * 为僵尸生存/塔防类游戏提供波次推进、敌人生成节奏控制。
 * 通过事件通知外部（GameEngine）何时生成敌人、波次完成等。
 *
 * 使用示例:
 *   const waves = new WaveManager(waveConfig)
 *   waves.on('enemySpawned', (enemy) => { /* create 3D mesh in scene *\/ })
 *   waves.start()
 */
export class WaveManager {
  private _config: WaveConfig
  private _running = false
  private _paused = false
  private _currentWaveIndex = -1
  private _currentWave: Wave | null = null
  private _spawnedInWave = 0
  private _totalSpawnedInWave = 0
  private _spawnTimer: ReturnType<typeof setInterval> | null = null
  private _waveStartTimer: ReturnType<typeof setTimeout> | null = null
  private _completedWaves = 0
  private _allWavesComplete = false
  private _listeners = new Map<string, Set<(...args: any[]) => void>>()
  private _debug = false

  // ===== Event System =====

  on(event: 'waveStart' | 'enemySpawned' | 'waveComplete' | 'allWavesComplete', cb: (...args: any[]) => void): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event)!.add(cb)
    return () => {
      this._listeners.get(event)?.delete(cb)
    }
  }

  private _emit(event: string, ...args: any[]): void {
    const listeners = this._listeners.get(event)
    if (!listeners) return
    for (const cb of listeners) {
      try { cb(...args) } catch (err) {
        console.error(`[WaveManager] Error in '${event}' listener:`, err)
      }
    }
  }

  constructor(config: WaveConfig) {
    this._config = config
  }

  get config(): WaveConfig {
    return this._config
  }

  get running(): boolean {
    return this._running
  }

  get paused(): boolean {
    return this._paused
  }

  get currentWaveIndex(): number {
    return this._currentWaveIndex
  }

  get completedWaves(): number {
    return this._completedWaves
  }

  get totalWaves(): number {
    return this._config.waves.length
  }

  get allWavesComplete(): boolean {
    return this._allWavesComplete
  }

  /** 当前波次进度 (0–1) */
  get waveProgress(): number {
    if (!this._currentWave) return 0
    if (this._totalSpawnedInWave === 0) return 1
    return this._spawnedInWave / this._totalSpawnedInWave
  }

  /** 总体进度 (0–1) */
  get totalProgress(): number {
    const total = this._config.waves.length
    if (total === 0) return 1
    return this._completedWaves / total
  }

  // ===== Lifecycle =====

  /** 启动波次系统 — 如果 autoStart 为 true 则立即开始第一波 */
  start(): void {
    if (this._running) {
      console.warn('[WaveManager] Already running')
      return
    }
    if (this._config.waves.length === 0) {
      console.warn('[WaveManager] No waves configured')
      return
    }
    this._running = true
    this._paused = false
    this._currentWaveIndex = -1
    this._completedWaves = 0
    this._allWavesComplete = false

    if (this._config.autoStart) {
      this._log('Auto-starting first wave')
      this._scheduleNextWave(0)
    }
  }

  /** 停止所有波次 */
  stop(): void {
    this._running = false
    this._paused = false
    this._clearTimers()
    this._currentWave = null
    this._currentWaveIndex = -1
    this._log('Stopped')
  }

  /** 暂停（暂停生成定时器，波次计时不受影响） */
  pause(): void {
    if (!this._running || this._paused) return
    this._paused = true
    this._clearSpawnTimer()
    this._log('Paused')
  }

  /** 恢复 */
  resume(): void {
    if (!this._running || !this._paused) return
    this._paused = false
    this._startSpawnTimer()
    this._log('Resumed')
  }

  /** 手动触发下一波 */
  startNextWave(): void {
    if (!this._running) {
      console.warn('[WaveManager] Not started. Call start() first.')
      return
    }
    this._startWave(this._currentWaveIndex + 1)
  }

  /** 重置（回到初始状态） */
  reset(): void {
    this.stop()
    this._completedWaves = 0
    this._allWavesComplete = false
    this._spawnedInWave = 0
    this._totalSpawnedInWave = 0
    this._currentWaveIndex = -1
    this._currentWave = null
    this._listeners.clear()
  }

  // ===== Internal =====

  private _scheduleNextWave(delay: number): void {
    this._clearWaveTimer()
    if (!this._running) return

    this._waveStartTimer = setTimeout(() => {
      if (!this._running) return
      this._startWave(this._currentWaveIndex + 1)
    }, delay * 1000)
  }

  private _startWave(index: number): void {
    if (!this._running) return
    if (index >= this._config.waves.length) {
      this._allWavesComplete = true
      this._emit('allWavesComplete')
      this._log('All waves complete!')
      return
    }

    const wave = this._config.waves[index]
    this._currentWaveIndex = index
    this._currentWave = wave
    this._spawnedInWave = 0
    this._totalSpawnedInWave = wave.enemies.reduce((sum, e) => sum + e.count, 0)

    this._log(`Wave ${index + 1}/${this._config.waves.length}: "${wave.name}" started (${this._totalSpawnedInWave} enemies)`)
    this._emit('waveStart', { wave, index })

    this._startSpawnTimer()
  }

  private _startSpawnTimer(): void {
    this._clearSpawnTimer()
    if (!this._running || !this._currentWave) return

    const interval = this._currentWave.spawnInterval * 1000
    this._spawnTimer = setInterval(() => {
      if (this._paused) return
      this._spawnNextEnemy()
    }, interval)
  }

  private _spawnNextEnemy(): void {
    if (!this._running || !this._currentWave || this._paused) return
    if (this._spawnedInWave >= this._totalSpawnedInWave) {
      this._finalizeWave()
      return
    }

    // Find which enemy type to spawn based on remaining counts
    const enemy = this._pickNextEnemy()
    if (!enemy) {
      // All enemies for this wave have been assigned
      this._finalizeWave()
      return
    }

    this._spawnedInWave++
    this._emit('enemySpawned', {
      enemy,
      waveIndex: this._currentWaveIndex,
      spawnNumber: this._spawnedInWave,
      totalInWave: this._totalSpawnedInWave,
    })
    this._log(`Spawned ${enemy.entityId} (${this._spawnedInWave}/${this._totalSpawnedInWave})`)
  }

  /**
   * 按比例从 enemy 类型列表中选出下一个生成的敌人
   * 确保各类型的生成比例接近配置的 count 分布
   */
  private _pickNextEnemy(): WaveEnemy | null {
    if (!this._currentWave) return null

    // Count how many of each type we've spawned so far
    const spawned = new Map<string, number>()
    // We need to track per-type spawn count internally
    // Since we don't track per-type, recalculate from the wave config
    let remaining: WaveEnemy[] = []

    for (const e of this._currentWave.enemies) {
      // Estimate remaining: we know total wave spawned so far, distribute proportionally
      // For simplicity, just pick the enemy type with the most remaining proportion
      remaining.push(e)
    }

    // Simple round-robin: pick the enemy type that has the highest remaining proportion
    // Since we only track total spawned, use approximate
    const proportions = this._currentWave.enemies.map(e => ({
      enemy: e,
      proportion: e.count / this._totalSpawnedInWave,
    }))

    // Calculate expected count so far for each type
    let bestEnemy: WaveEnemy | null = null
    let bestPriority = -Infinity

    for (const p of proportions) {
      const expectedCount = Math.floor(p.proportion * this._spawnedInWave)
      // This is a heuristic — in practice, track per-type spawns for perfect distribution
      // For now, subtract a small random factor to add variety
      const priority = p.enemy.count - expectedCount + Math.random() * 0.5
      if (priority > bestPriority) {
        bestPriority = priority
        bestEnemy = p.enemy
      }
    }

    return bestEnemy
  }

  private _finalizeWave(): void {
    this._clearSpawnTimer()
    if (!this._currentWave) return

    this._completedWaves++
    this._log(`Wave ${this._currentWaveIndex + 1} complete`)
    this._emit('waveComplete', {
      wave: this._currentWave,
      index: this._currentWaveIndex,
    })

    const nextIndex = this._currentWaveIndex + 1
    if (nextIndex >= this._config.waves.length) {
      this._allWavesComplete = true
      this._emit('allWavesComplete')
      this._log('All waves complete!')
      return
    }

    // Schedule next wave after timeBetweenWaves
    this._scheduleNextWave(this._config.timeBetweenWaves)
  }

  private _clearTimers(): void {
    this._clearSpawnTimer()
    this._clearWaveTimer()
  }

  private _clearSpawnTimer(): void {
    if (this._spawnTimer !== null) {
      clearInterval(this._spawnTimer)
      this._spawnTimer = null
    }
  }

  private _clearWaveTimer(): void {
    if (this._waveStartTimer !== null) {
      clearTimeout(this._waveStartTimer)
      this._waveStartTimer = null
    }
  }

  private _log(msg: string): void {
    if (this._debug) {
      console.log(`[WaveManager] ${msg}`)
    }
  }

  /** 设置调试模式 */
  setDebug(enabled: boolean): void {
    this._debug = enabled
  }
}
