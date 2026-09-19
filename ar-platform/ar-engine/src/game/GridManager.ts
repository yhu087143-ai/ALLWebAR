import * as THREE from 'three'
import type { GridConfig } from '../types/config'

/**
 * GridManager — 网格放置系统
 *
 * 为塔防/策略类游戏提供在 3D 空间中的网格化放置能力。
 * 支持行列坐标 ↔ 世界坐标转换、占用检测、视觉网格叠加层。
 *
 * 使用示例:
 *   const grid = new GridManager({ rows: 8, cols: 8, cellSize: 1 }, scene)
 *   grid.createGridOverlay()
 *   grid.occupyCell(3, 4, 'tower_01')
 *   const pos = grid.getWorldPosition(3, 4) // → 网格中心世界坐标
 */
export class GridManager {
  private _config: GridConfig
  private _scene: THREE.Scene | null = null
  private _overlay: THREE.Group | null = null
  private _occupancy = new Map<string, string>() // key "row,col" → entityId
  private _highlights = new Map<string, THREE.Mesh>() // key "row,col" → highlight mesh
  private _debug = false

  constructor(config: GridConfig, scene?: THREE.Scene) {
    this._config = config
    if (scene) this._scene = scene
  }

  /** Attach or change the scene reference */
  setScene(scene: THREE.Scene): void {
    this._scene = scene
  }

  get config(): GridConfig {
    return this._config
  }

  // ===== Coordinate Conversion =====

  /**
   * 网格坐标 → 世界坐标（单元格中心）
   * origin 为网格左下角在 3D 空间的位置，默认为 (0, 0, 0)
   */
  getWorldPosition(row: number, col: number): THREE.Vector3 {
    const { cellSize, origin } = this._config
    const ox = origin?.[0] ?? 0
    const oy = origin?.[1] ?? 0
    const oz = origin?.[2] ?? 0
    return new THREE.Vector3(
      ox + col * cellSize + cellSize / 2,
      oy,
      oz + row * cellSize + cellSize / 2,
    )
  }

  /**
   * 世界坐标 → 网格坐标
   * 返回 { row, col } 或 null（超出网格范围）
   */
  getCell(worldPos: THREE.Vector3): { row: number; col: number } | null {
    const { rows, cols, cellSize, origin } = this._config
    const ox = origin?.[0] ?? 0
    const oz = origin?.[2] ?? 0

    const col = Math.floor((worldPos.x - ox) / cellSize)
    const row = Math.floor((worldPos.z - oz) / cellSize)

    if (row < 0 || row >= rows || col < 0 || col >= cols) return null
    return { row, col }
  }

  /** 获取单元格世界空间的 AABB（用于碰撞/点击检测） */
  getCellBounds(row: number, col: number): THREE.Box3 {
    const center = this.getWorldPosition(row, col)
    const half = this._config.cellSize / 2
    return new THREE.Box3(
      new THREE.Vector3(center.x - half, center.y - half, center.z - half),
      new THREE.Vector3(center.x + half, center.y + half, center.z + half),
    )
  }

  // ===== Occupancy =====

  /** 占用某个单元格 */
  occupyCell(row: number, col: number, entityId: string): boolean {
    const key = `${row},${col}`
    if (this._occupancy.has(key)) return false // already occupied
    this._occupancy.set(key, entityId)
    this._updateHighlightColor(row, col)
    return true
  }

  /** 释放某个单元格 */
  releaseCell(row: number, col: number): void {
    const key = `${row},${col}`
    this._occupancy.delete(key)
    this._updateHighlightColor(row, col)
  }

  /** 检查单元格是否被占用 */
  isOccupied(row: number, col: number): boolean {
    return this._occupancy.has(`${row},${col}`)
  }

  /** 获取某个单元格的占用实体 ID */
  getEntityAt(row: number, col: number): string | null {
    return this._occupancy.get(`${row},${col}`) ?? null
  }

  /** 获取所有被占用的单元格列表 */
  getOccupiedCells(): Array<{ row: number; col: number; entityId: string }> {
    const result: Array<{ row: number; col: number; entityId: string }> = []
    for (const [key, entityId] of this._occupancy) {
      const [r, c] = key.split(',').map(Number)
      result.push({ row: r, col: c, entityId })
    }
    return result
  }

  /** 获取指定实体占用的所有单元格 */
  getCellsByEntity(entityId: string): Array<{ row: number; col: number }> {
    const result: Array<{ row: number; col: number }> = []
    for (const [key, eid] of this._occupancy) {
      if (eid === entityId) {
        const [r, c] = key.split(',').map(Number)
        result.push({ row: r, col: c })
      }
    }
    return result
  }

  /** 清空所有占用 */
  clearOccupancy(): void {
    this._occupancy.clear()
    this._updateAllHighlights()
  }

  // ===== Visual Grid Overlay =====

  /**
   * 创建网格视觉叠加层
   * 生成网格线框和半透明底面，添加到场景
   */
  createGridOverlay(): THREE.Group {
    this._removeOverlay()

    const group = new THREE.Group()
    group.name = 'grid-overlay'

    const { rows, cols, cellSize, origin, highlightColor } = this._config
    const ox = origin?.[0] ?? 0
    const oy = origin?.[1] ?? 0
    const oz = origin?.[2] ?? 0

    const gridWidth = cols * cellSize
    const gridHeight = rows * cellSize
    const baseColor = highlightColor || '#4444ff'

    // 半透明底面
    const floorGeo = new THREE.PlaneGeometry(gridWidth, gridHeight)
    const floorMat = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(ox + gridWidth / 2, oy, oz + gridHeight / 2)
    floor.name = 'grid-floor'
    group.add(floor)

    // 网格线
    const lineMat = new THREE.LineBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.25,
    })

    // 水平线 (沿 Z 方向)
    for (let r = 0; r <= rows; r++) {
      const points: THREE.Vector3[] = [
        new THREE.Vector3(ox, oy, oz + r * cellSize),
        new THREE.Vector3(ox + gridWidth, oy, oz + r * cellSize),
      ]
      const geo = new THREE.BufferGeometry().setFromPoints(points)
      const line = new THREE.Line(geo, lineMat)
      line.name = 'grid-line-h'
      group.add(line)
    }

    // 垂直线 (沿 X 方向)
    for (let c = 0; c <= cols; c++) {
      const points: THREE.Vector3[] = [
        new THREE.Vector3(ox + c * cellSize, oy, oz),
        new THREE.Vector3(ox + c * cellSize, oy, oz + gridHeight),
      ]
      const geo = new THREE.BufferGeometry().setFromPoints(points)
      const line = new THREE.Line(geo, lineMat)
      line.name = 'grid-line-v'
      group.add(line)
    }

    this._overlay = group
    this._scene?.add(group)

    // 初始化所有单元格的高亮状态
    this._rebuildHighlights()

    return group
  }

  /** 移除网格叠加层 */
  removeOverlay(): void {
    this._removeOverlay()
  }

  private _removeOverlay(): void {
    if (this._overlay && this._scene) {
      this._scene.remove(this._overlay)
      this._disposeGroup(this._overlay)
    }
    this._overlay = null
    this._highlights.clear()
  }

  // ===== Highlight System (放置预览) =====

  /** 高亮单个单元格（放置预览） */
  setHighlight(row: number, col: number, color: string): void {
    this._removeHighlight(row, col)
    const mesh = this._createHighlightMesh(row, col, color)
    const key = `${row},${col}`
    this._highlights.set(key, mesh)
    this._scene?.add(mesh)
  }

  /** 清除单个单元格高亮 */
  removeHighlight(row: number, col: number): void {
    this._removeHighlight(row, col)
  }

  /** 清除所有高亮 */
  clearHighlights(): void {
    for (const [key, mesh] of this._highlights) {
      this._scene?.remove(mesh)
      this._disposeMesh(mesh)
    }
    this._highlights.clear()
  }

  /** 设置调试模式（输出日志） */
  setDebug(enabled: boolean): void {
    this._debug = enabled
  }

  // ===== Internal =====

  private _rebuildHighlights(): void {
    this.clearHighlights()
    const { rows, cols } = this._config
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this._updateHighlightColor(r, c)
      }
    }
  }

  private _updateHighlightColor(row: number, col: number): void {
    const key = `${row},${col}`
    const existing = this._highlights.get(key)
    if (existing) {
      this._removeHighlight(row, col)
    }
    const occupied = this._occupancy.has(key)
    const color = occupied
      ? (this._config.occupiedColor || '#ff4444')
      : (this._config.highlightColor || '#4444ff')
    const mesh = this._createHighlightMesh(row, col, color)
    this._highlights.set(key, mesh)
    this._scene?.add(mesh)
  }

  private _updateAllHighlights(): void {
    this._rebuildHighlights()
  }

  private _createHighlightMesh(row: number, col: number, color: string): THREE.Mesh {
    const { cellSize } = this._config
    const center = this.getWorldPosition(row, col)
    const size = cellSize * 0.9 // slight gap between cells

    const geo = new THREE.PlaneGeometry(size, size)
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.copy(center)
    mesh.position.y += 0.01 // slightly above floor to avoid z-fighting
    return mesh
  }

  private _removeHighlight(row: number, col: number): void {
    const key = `${row},${col}`
    const mesh = this._highlights.get(key)
    if (mesh) {
      this._scene?.remove(mesh)
      this._disposeMesh(mesh)
      this._highlights.delete(key)
    }
  }

  private _disposeGroup(group: THREE.Group): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry?.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material?.dispose()
        }
      }
    })
  }

  private _disposeMesh(mesh: THREE.Mesh): void {
    mesh.geometry?.dispose()
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => m.dispose())
    } else {
      mesh.material?.dispose()
    }
  }
}
