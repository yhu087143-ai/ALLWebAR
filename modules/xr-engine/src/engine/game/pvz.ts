import type { Engine } from '@/engine/core/Engine'
import { DataDrivenBehavior, instantiateDataNode } from './dataDriven'

const sunData = (): Record<string, unknown> => ({
  id: `sun${Date.now()}`,
  name: '太阳',
  type: 'mesh',
  props: {
    kind: 'mesh',
    geometry: 'sphere',
    geometryParams: { radius: 0.35 },
    effect: 'energy',
    material: { color: '#ffe082', emissive: '#ffd54f', emissiveIntensity: 2 },
    components: [{ type: 'collectible', score: 10 }],
  },
  transform: { position: [0, 0.8, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
})

const peaData = (): Record<string, unknown> => ({
  id: `pea${Date.now()}`,
  name: '豌豆',
  type: 'mesh',
  props: {
    kind: 'mesh',
    geometry: 'sphere',
    geometryParams: { radius: 0.12 },
    effect: 'energy',
    material: { color: '#aeea00', emissive: '#aeea00', emissiveIntensity: 1.5 },
  },
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
})

const zombieData = (): Record<string, unknown> => ({
  id: `zombie${Date.now()}`,
  name: '僵尸',
  type: 'group',
  transform: { position: [6, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  props: {
    components: [{ type: 'move', velocity: [-0.45, 0, 0] }],
  },
  children: [
    {
      name: '僵尸身体',
      type: 'mesh',
      props: {
        kind: 'mesh', geometry: 'box', geometryParams: { width: 0.5, height: 1.1, depth: 0.4 },
        material: { color: '#5d4037', roughness: 0.9 },
      },
      transform: { position: [0, 0.55, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
    {
      name: '僵尸头',
      type: 'mesh',
      props: {
        kind: 'mesh', geometry: 'sphere', geometryParams: { radius: 0.28 },
        material: { color: '#7cb342', roughness: 0.8 },
      },
      transform: { position: [0, 1.35, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
  ],
})

const plantData = (x: number, z: number): Record<string, unknown> => ({
  id: `plant${x}_${z}`,
  name: '豌豆射手',
  type: 'group',
  transform: { position: [x, 0, z], rotation: [0, 0, 0], scale: [1, 1, 1] },
  props: {
    components: [{ type: 'shooter', interval: 1.2 }],
  },
  children: [
    {
      name: '花盆',
      type: 'mesh',
      props: {
        kind: 'mesh', geometry: 'cylinder', geometryParams: { radiusTop: 0.35, radiusBottom: 0.3, height: 0.3 },
        material: { color: '#8d6e63', roughness: 0.9 },
      },
      transform: { position: [0, 0.15, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
    {
      name: '植物茎',
      type: 'mesh',
      props: {
        kind: 'mesh', geometry: 'cylinder', geometryParams: { radiusTop: 0.08, radiusBottom: 0.12, height: 0.6 },
        material: { color: '#4caf50', roughness: 0.7 },
      },
      transform: { position: [0, 0.6, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
    {
      name: '豌豆头',
      type: 'mesh',
      props: {
        kind: 'mesh', geometry: 'sphere', geometryParams: { radius: 0.22 },
        effect: 'energy',
        material: { color: '#8bc34a', emissive: '#aeea00', emissiveIntensity: 1 },
      },
      transform: { position: [0.2, 0.95, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
  ],
})

/**
 * 用引擎数据（不是手写渲染代码）构建一个 PVZ 风格的 AR 小游戏场景。
 * Web 端走 DataDrivenBehavior，微信端由 wxar-runtime 解释同一份组件数据。
 */
export function buildPvzArScene(engine: Engine): void {
  const world = engine.game.world
  world.clear()
  engine.hud.reset()

  const root = world.createEntity('PVZ_AR')
  root.userData.world = world
  root.userData.input = engine.game.input
  root.userData.hud = (patch: Record<string, unknown>) => engine.hud.set(patch as never)
  root.userData.score = 0
  root.addComponent(DataDrivenBehavior)

  // 场景级逻辑：太阳生成、僵尸生成、点击得分
  root.props = {
    kind: 'group',
    components: [
      { type: 'sunSpawner', interval: 3.5 },
      { type: 'spawner', interval: 5, prefab: zombieData() },
      { type: 'collision' },
      { type: 'tapGame' },
    ],
  }

  // 地面
  instantiateDataNode(world, {
    name: '地面',
    type: 'mesh',
    props: {
      kind: 'mesh', geometry: 'plane', geometryParams: { width: 14, height: 8 },
      material: { color: '#2e7d32', roughness: 0.95 },
    },
    transform: { position: [0, 0, 0], rotation: [-Math.PI / 2, 0, 0], scale: [1, 1, 1] },
  }, root)

  // 三列豌豆射手
  for (const x of [-3, 0, 3]) {
    instantiateDataNode(world, plantData(x, 0), root)
  }

  engine.hud.set({
    visible: true,
    sun: 0,
    wave: 0,
    zombies: 0,
    selected: 'pvz',
    over: false,
    message: '收集太阳 · 豌豆射手自动攻击 · 防御僵尸',
  })
}
