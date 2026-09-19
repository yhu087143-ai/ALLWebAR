import { engine, useEditor } from '@/editor/store'

/**
 * 植物大战僵尸 3D —— 第二版
 * - 复合体：植物/僵尸由多个 mesh 组成
 * - 材质：PBR 颜色 + emissive，不再是单色方块
 * - 交互：1/2/3 切换植物，点击草地种植
 * - 动画：向日葵旋转、豌豆射手头部摆动、僵尸手脚摆动
 * - 对象池：豌豆复用
 */
const PVZ_SCRIPT = `
const plants = []
const zombies = []
const peas = []
const peaPool = []
const laneZ = [-3, -1.5, 0, 1.5, 3]
let selected = 'peashooter'
let sun = 150
let wave = 1
let shootTimer = 0
let spawnTimer = 3
let hudTimer = 0
let over = false
let makePlant = null
let makeZombie = null
let groundName = '草地'

return {
  onStart(ctx) {
    const g = ctx.engine.graph

    const createMesh = (parentId, name, kind, localPos, color, scale, extra) => {
      const n = g.create('mesh')
      g.update(n.id, { name })
      g.setGeometry(n.id, kind)
      g.setTransform(n.id, { position: localPos, rotation: [0, 0, 0], scale })
      g.setProps(n.id, {
        castShadow: true,
        receiveShadow: true,
        material: {
          color,
          metalness: extra?.metalness ?? 0.05,
          roughness: extra?.roughness ?? 0.7,
          emissive: extra?.emissive ?? '#000000',
          emissiveIntensity: extra?.emissiveIntensity ?? 0,
          opacity: 1,
          wireframe: false,
          flatShading: false,
        },
      })
      if (parentId) g.reparent(n.id, parentId)
      return n.id
    }

    const createGroup = (name, pos) => {
      const grp = g.create('group')
      g.update(grp.id, { name })
      g.setTransform(grp.id, { position: pos, rotation: [0, 0, 0], scale: [1, 1, 1] })
      return grp.id
    }

    makePlant = (type, x, z) => {
      const root = createGroup(type, [x, 0, z])
      const item = { id: root, type, x, z, hp: type === 'wallnut' ? 12 : 5, parts: {} }

      if (type === 'peashooter') {
        item.parts.stem = createMesh(root, '茎', 'cylinder', [0, 0.35, 0], '#2e7d32', [0.55, 0.7, 0.55])
        item.parts.head = createMesh(root, '头', 'sphere', [0, 1.05, 0], '#43a047', [0.65, 0.6, 0.65])
        item.parts.mouth = createMesh(root, '炮管', 'cylinder', [0, 1.0, 0.55], '#2e7d32', [0.35, 0.5, 0.35], { metalness: 0.2, roughness: 0.5 })
        item.parts.leaf = createMesh(root, '叶子', 'cone', [0.45, 0.15, 0], '#66bb6a', [0.4, 0.5, 0.4])
      } else if (type === 'sunflower') {
        item.parts.stem = createMesh(root, '茎', 'cylinder', [0, 0.4, 0], '#33691e', [0.45, 0.8, 0.45])
        item.parts.head = createMesh(root, '花心', 'sphere', [0, 1.15, 0], '#f9a825', [0.6, 0.55, 0.6], { emissive: '#ff8f00', emissiveIntensity: 0.5 })
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2
          const petal = createMesh(root, '花瓣', 'sphere', [Math.cos(a) * 0.42, 1.15, Math.sin(a) * 0.42], '#ffee58', [0.2, 0.12, 0.2])
          item.parts['petal' + i] = petal
        }
      } else if (type === 'wallnut') {
        item.parts.body = createMesh(root, '坚果', 'sphere', [0, 0.5, 0], '#8d6e63', [0.65, 0.75, 0.65], { roughness: 0.85 })
        item.parts.face = createMesh(root, '眼睛', 'sphere', [0.18, 0.72, 0.4], '#3e2723', [0.09, 0.09, 0.09])
        item.parts.face2 = createMesh(root, '眼睛2', 'sphere', [-0.18, 0.72, 0.4], '#3e2723', [0.09, 0.09, 0.09])
      }

      plants.push(item)
      return item
    }

    makeZombie = (x, z) => {
      const root = createGroup('僵尸', [x, 0, z])
      const item = { id: root, x, z, hp: 6, walk: Math.random() * 10, parts: {} }
      item.parts.body = createMesh(root, '身体', 'box', [0, 0.85, 0], '#7a8b6f', [0.7, 0.9, 0.5])
      item.parts.head = createMesh(root, '头', 'box', [0, 1.55, 0], '#9e9d8f', [0.55, 0.55, 0.5])
      item.parts.eyeL = createMesh(root, '左眼', 'sphere', [0.13, 1.62, 0.28], '#ff5252', [0.08, 0.08, 0.08], { emissive: '#ff1744', emissiveIntensity: 0.8 })
      item.parts.eyeR = createMesh(root, '右眼', 'sphere', [-0.13, 1.62, 0.28], '#ff5252', [0.08, 0.08, 0.08], { emissive: '#ff1744', emissiveIntensity: 0.8 })
      item.parts.armL = createMesh(root, '左手', 'box', [0.38, 1.05, 0.1], '#889560', [0.16, 0.55, 0.16])
      item.parts.armR = createMesh(root, '右手', 'box', [-0.38, 1.05, 0.1], '#889560', [0.16, 0.55, 0.16])
      item.parts.legL = createMesh(root, '左腿', 'box', [0.18, 0.25, 0], '#5d6b55', [0.22, 0.5, 0.25])
      item.parts.legR = createMesh(root, '右腿', 'box', [-0.18, 0.25, 0], '#5d6b55', [0.22, 0.5, 0.25])
      zombies.push(item)
      return item
    }

    // 初始植物
    makePlant('peashooter', -3, 0)
    makePlant('sunflower', -3, -1.5)
    makePlant('wallnut', -3, 1.5)

    // 初始僵尸
    makeZombie(6.5, -2)
    makeZombie(7, 0)
    makeZombie(6.5, 2)

    ctx.engine.hud.set({
      visible: true,
      sun,
      wave,
      zombies: zombies.length,
      selected,
      over: false,
      message: '点击草地种植 · 按 1/2/3 切换植物',
    })
  },

  onUpdate(ctx) {
    if (over) return
    const g = ctx.engine.graph
    const dt = ctx.delta

    // 键盘选择植物
    if (ctx.input.pressed.has('1')) selected = 'peashooter'
    if (ctx.input.pressed.has('2')) selected = 'sunflower'
    if (ctx.input.pressed.has('3')) selected = 'wallnut'

    // 点击种植
    if (ctx.input.clicked && ctx.input.pointer && makePlant) {
      const nx = ctx.input.pointer.x * 2 - 1
      const ny = -(ctx.input.pointer.y * 2 - 1)
      const hits = ctx.engine.pick(nx, ny)
      if (hits.length) {
        const hit = hits.find((h) => h.object && h.object.name === groundName) || hits[0]
        const px = Math.round(hit.point.x)
        const pz = Math.round(hit.point.z * 2) / 2
        const exists = plants.some((p) => Math.abs(p.x - px) < 0.5 && Math.abs(p.z - pz) < 0.5)
        if (!exists && plants.length < 40 && sun >= (selected === 'sunflower' ? 50 : selected === 'wallnut' ? 75 : 25)) {
          if (selected === 'sunflower') sun -= 50
          else if (selected === 'wallnut') sun -= 75
          else sun -= 25
          makePlant(selected, px, pz)
        }
      }
    }

    // 植物动画
    for (const p of plants) {
      if (!g.get(p.id)) continue
      if (p.type === 'sunflower') {
        const t = ctx.time * 1.5
        g.setTransform(p.id, { position: [p.x, Math.sin(t) * 0.05, p.z] })
      } else if (p.type === 'peashooter' && p.parts.head) {
        const sway = Math.sin(ctx.time * 3) * 0.12
        g.setTransform(p.parts.head, { position: [0, 1.05, 0], rotation: [0, sway, 0] })
      } else if (p.type === 'wallnut' && p.parts.body) {
        const s = 1 + Math.sin(ctx.time * 2) * 0.03
        g.setTransform(p.parts.body, { position: [0, 0.5, 0], scale: [0.65 * s, 0.75, 0.65 * s] })
      }
    }

    // 僵尸动画 + 移动
    for (const z of zombies) {
      if (!g.get(z.id)) continue
      z.x -= 0.55 * dt
      z.walk += dt * 5
      const wobble = Math.sin(z.walk) * 0.18
      g.setTransform(z.id, { position: [z.x, 0, z.z] })
      if (z.parts.armL) g.setTransform(z.parts.armL, { position: [0.38, 1.05, 0.1], rotation: [0, 0, wobble] })
      if (z.parts.armR) g.setTransform(z.parts.armR, { position: [-0.38, 1.05, 0.1], rotation: [0, 0, -wobble] })
      if (z.parts.legL) g.setTransform(z.parts.legL, { position: [0.18, 0.25, 0], rotation: [wobble, 0, 0] })
      if (z.parts.legR) g.setTransform(z.parts.legR, { position: [-0.18, 0.25, 0], rotation: [-wobble, 0, 0] })
      if (z.x < -7) {
        over = true
        ctx.engine.hud.set({ over: true, message: '僵尸到达终点！游戏结束' })
      }
    }

    // 生成新僵尸
    spawnTimer -= dt
    if (spawnTimer <= 0) {
      spawnTimer = 4 + Math.random() * 3
      const z = laneZ[Math.floor(Math.random() * laneZ.length)]
      makeZombie(8.5, z)
    }

    // 发射豌豆（对象池）
    shootTimer += dt
    if (shootTimer >= 0.9) {
      shootTimer = 0
      for (const p of plants) {
        if (p.type !== 'peashooter' || p.hp <= 0) continue
        let peaId = peaPool.pop()
        if (!peaId) {
          const peaNode = g.create('mesh')
          peaId = peaNode.id
          g.update(peaId, { name: '豌豆' })
          g.setGeometry(peaId, 'sphere')
          g.setProps(peaId, {
            castShadow: false,
            receiveShadow: false,
            material: { color: '#a8e063', metalness: 0, roughness: 0.4, emissive: '#2f5e00', emissiveIntensity: 0.6 },
          })
        }
        g.setTransform(peaId, {
          position: [p.x + 0.6, 0.9, p.z],
          rotation: [0, 0, 0],
          scale: [0.16, 0.16, 0.16],
        })
        peas.push(peaId)
      }
    }

    // 豌豆移动 + 碰撞
    for (let i = peas.length - 1; i >= 0; i -= 1) {
      const peaId = peas[i]
      const node = g.get(peaId)
      if (!node) { peas.splice(i, 1); continue }
      const pos = node.transform.position
      const nx = pos[0] + 7 * dt
      g.setTransform(peaId, { position: [nx, pos[1], pos[2]] })

      let hit = false
      for (const z of zombies) {
        if (Math.abs(pos[2] - z.z) < 0.55 && Math.abs(nx - z.x) < 0.65) {
          z.hp -= 1
          hit = true
          if (z.hp <= 0) {
            g.remove(z.id)
            zombies.splice(zombies.indexOf(z), 1)
          }
          break
        }
      }

      if (hit || nx > 11) {
        peas.splice(i, 1)
        peaPool.push(peaId)
      }
    }

    // 僵尸啃植物
    for (const z of zombies) {
      for (const p of plants) {
        if (p.hp <= 0) continue
        if (Math.abs(z.z - p.z) < 0.6 && z.x < p.x + 1.2 && z.x > p.x - 0.7) {
          p.hp -= dt * 1.5
          if (p.hp <= 0) {
            g.remove(p.id)
          }
        }
      }
    }

    // HUD 更新
    hudTimer += dt
    if (hudTimer >= 0.25) {
      hudTimer = 0
      ctx.engine.hud.set({
        sun,
        wave,
        zombies: zombies.length,
        selected,
        over,
        message: '',
      })
    }
  },
}
`

/** 构建植物大战僵尸 3D 原型：复合体植物/僵尸 + 键盘/鼠标交互 + HUD。 */
export function buildPvZPrototype(): void {
  const { graph } = engine
  engine.graph.reset()
  engine.history.reset()

  // 环境光 + 主光
  const ambient = graph.create('light')
  graph.update(ambient.id, { name: '环境光' })
  graph.setProps(ambient.id, { light: 'ambient', intensity: 0.55, castShadow: false })

  const key = graph.create('light')
  graph.update(key.id, { name: '主光源' })
  graph.setProps(key.id, { light: 'directional', intensity: 2.2, color: '#fff4e6' })
  graph.setTransform(key.id, { position: [5, 9, 4] })

  // 草地
  const ground = graph.create('mesh')
  graph.update(ground.id, { name: '草地' })
  graph.setGeometry(ground.id, 'plane')
  graph.setProps(ground.id, {
    geometryParams: { width: 20, height: 20, widthSegments: 1, heightSegments: 1 },
    castShadow: false,
    receiveShadow: true,
    material: {
      color: '#3d7a35',
      metalness: 0,
      roughness: 0.95,
      emissive: '#000000',
      emissiveIntensity: 0,
      opacity: 1,
      wireframe: false,
      flatShading: false,
    },
  })
  graph.setTransform(ground.id, { rotation: [-Math.PI / 2, 0, 0] })

  // 草坪格子线（简单视觉区分）
  for (let i = -4; i <= 4; i += 1) {
    const line = graph.create('mesh')
    graph.update(line.id, { name: '田埂' })
    graph.setGeometry(line.id, 'box')
    graph.setProps(line.id, {
      geometryParams: { width: 18, height: 0.05, depth: 0.08 },
      castShadow: false,
      receiveShadow: false,
      material: { color: '#2e5d29', metalness: 0, roughness: 0.9 },
    })
    graph.setTransform(line.id, { position: [0, 0.03, i * 1.5] })
  }

  // 游戏管理器（挂脚本）
  const manager = graph.create('group')
  graph.update(manager.id, { name: 'PVZ 游戏管理器', script: PVZ_SCRIPT })
  engine.hud.reset()
  engine.hud.set({ visible: true, sun: 150, wave: 1, zombies: 3, selected: 'peashooter', over: false, message: '加载中…' })
  useEditor.setState({ selectedId: manager.id })
}
