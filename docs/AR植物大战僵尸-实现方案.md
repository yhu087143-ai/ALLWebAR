# AR 植物大战僵尸 —— 实现方案（基于 ar-engine 现有游戏框架）

> 2026-09-19 · 所有接线点均对应真实代码位置；【估算】标注为推算
> 结论先行：**游戏框架约 1900 行已写好（未接线），PvZ 只需新写 ~400 行"僵尸移动/植物射击/阳光经济"，接线 ~100 行**

---

## 一、现有可复用件（全部真实存在，位置见路径）

| 模块 | 位置 | 提供的能力 | PvZ 里的角色 |
|---|---|---|---|
| `GameEngine` | `ar-engine/src/game/GameEngine.ts` | 总控：`start(config, scene)` / `collectItem(mesh)` / `setGridManager` / `setWaveManager` / 事件（`waveStart` `enemySpawned` `waveComplete` `allWavesComplete` `gameEnd` `scoreUpdate`） | 游戏总调度 |
| `GridManager` | `game/GridManager.ts` | `getWorldPosition(row,col)` / `getCell(worldPos)` / `occupyCell` / `releaseCell` | 9×5 草坪格子 |
| `WaveManager` | `game/WaveManager.ts` | 波次表配置 + `enemySpawned`/`waveComplete` 事件 | 僵尸进攻波次 |
| `CollectManager` + `GameEngine.collectItem` | `game/CollectManager.ts` | 注册可收集物 + 收集判定 | 阳光收集 |
| `GameHUD` | `game/GameHUD.ts` | DOM HUD：得分/计时/连击 | 阳光数 / 波次 / 得分显示 |
| `GameHUD`/`SpawnManager`/`TimerManager`/`ScoreManager` | `game/` | 刷怪/计时/计分 | 直接用 |
| tap 射线检测 | `ar-engine.ts:2567` | 从点击位置发射射线检测游戏物品 | 点格子种植 / 点阳光收集 |
| 平面放置 | `ar-engine.ts` markerless 路径（`_placementGroup` + 放置圆环 + 陀螺仪） | 把任意内容锚定在真实桌面/地面（`placeDome` 同模式先例） | **游戏棋盘锚定在你的桌上** |
| 空间音频 | `ar-engine/src/audio/SpatialAudio.ts` | 位置化音效 | 僵尸低吼随距离变化 |
| XR 引擎 `games/pvz.ts` | `modules/xr-engine/src/engine/game/pvz.ts` | PvZ 程序化建模全套（太阳/豌豆/僵尸/植物的几何体与配色） | 模型代码直接搬 |
| **鼠标试玩版** | `frontend/src/pages/PvzGame.jsx` + `src/game/pvz-game.js` | **已跑通的完整玩法数值**：豌豆 20 伤/1.5s、僵尸 3 档血量速度、5 波节奏、阳光经济 | 数值直接搬，玩法已验证可玩 |

## 二、架构决策：跑在 ar-engine 平面放置上（不是 XR 引擎）

- 玩法核心是"僵尸在**你的真实桌面**上走向你"——这正是 markerless 平面放置的领地，且 `GameEngine.start(config, scene)` 天然接收场景。
- XR 引擎的 `pvz.ts` 数据定义要在编辑器 runtime 里跑，跨 iframe 同步状态复杂度高，**只搬它的建模代码**。
- 鼠标试玩版（/game-pvz）保留：作为**玩法平衡的调试场**，AR 版照搬它的全部数值。

## 三、关键接线点（怎么写，按文件）

### 1. 入口：`ar-engine.ts` 新增 `startPvzGame()`（与 `placeDome` 同级同模式）

```ts
// ar-engine.ts —— 约在 placeDome 附近
startPvzGame(config?: { rows?: number; cols?: number; cellSize?: number; waves?: number }) {
  if (!this._placementGroup) throw new Error('AR PvZ 需在平面放置模式下使用');
  const scene = this._markerlessScene;                       // 放置组所属场景
  this._pvz = new PvzController(this._placementGroup, scene, config);  // 新写，见 §4
  this._pvz.start();
}
stopPvzGame() { this._pvz?.dispose(); this._pvz = null; }
```

ViewPage 底部栏加「开始游戏」按钮（复用穹顶按钮的 `?dome=1` 模式：`?pvz=1`）。

### 2. 棋盘：GridManager 挂进放置组

```ts
// PvzController 内部
this.grid = new GridManager(
  { rows: 5, cols: 9, cellSize: 0.15,            // 桌面尺度：格子 15cm，整盘约 1.35m × 0.75m
    origin: new THREE.Vector3(0, 0.01, 0) },      // 局部原点 = 放置点
);
this.grid.setScene(scene);
// 关键：getWorldPosition 返回的是世界坐标，挂在 _placementGroup 下时
// 需用 placementGroup.localToWorld 换算（或直接用局部坐标摆模型，保持同一坐标系最简单）
```

⚠️ 坑：`_placementGroup` 的 quaternion 会被陀螺仪反旋转（`ar-engine.ts:1191`），游戏对象必须全部作为**放置组的子节点**（局部坐标），绝不能混用世界坐标——穹顶就是踩过这个坑后改对的。

### 3. 僵尸：WaveManager 事件 + 新写 ZombieController（~150 行，唯一的"新逻辑"核心）

```ts
this.wave = new WaveManager({
  totalWaves: config.waves ?? 5,
  waves: Array.from({ length: 5 }, (_, i) => ({
    count: 2 + i,
    interval: 3500,
    enemyTypes: i >= 4 ? ['normal','cone','bucket'] : i >= 2 ? ['normal','cone'] : ['normal'],
  })),
});
this.wave.on('enemySpawned', ({ type, index }) => {
  const row = Math.floor(Math.random() * 5);
  const model = ZombieModels.create(type);        // 从 XR 引擎 pvz.ts 搬建模（0.12m 高，桌面尺度）
  placementGroup.add(model);
  this.zombies.push({ type, row, dist: 1.2, hp: HP[type], model });  // dist = 距玩家距离（米）
});
```

每帧更新（ZombieController.update(dt)）：
```ts
z.dist -= speed * dt;                            // 向玩家走近（局部 -z 方向）
const food = plants.find(p => p.row === z.row && Math.abs(p.dist - z.dist) < 0.05);
if (food) food.hp -= 25 * dt;                    // 啃食（数值照搬 /game-pvz）
else z.dist -= ...;
if (z.dist < 0.15) gameEnd('over');              // 走到玩家面前
```

### 4. 植物：tap 射线（已有）+ 新写 PlantController（~120 行）

```ts
// tap 已有射线检测（ar-engine.ts:2567），在其命中分支里接：
const cell = this.grid.getCell(hitPoint);
if (cell && this.selectedPlant && this.sun >= COST[this.selectedPlant]) {
  this.grid.occupyCell(cell.row, cell.col, id);
  const model = PlantModels.create(this.selectedPlant);   // pvz.ts 建模
  placementGroup.add(model);
  this.plants.push({ ...cell, type: this.selectedPlant, hp: HP, shootT: 0 });
}
// 豌豆射手：同 row 有僵尸且 dist 更远 → 每 1.5s 生成豌豆小球（沿 dist 轴匀速，命中 |Δdist|<0.04 → -20 HP）
```

### 5. 阳光：CollectManager + tap（全部现成）

```ts
// 天降/向日葵产出 → collectManager.register(id, sunMesh)
// tap 射线命中阳光 → gameEngine.collectItem(mesh) → scoreUpdate 事件 → this.sun += 25/50
```

### 6. HUD：GameHUD 现成 + 卡片栏照搬

- `new GameHUD(container).create()` → 得分/波次/连击 DOM 层已写好。
- 植物卡片栏：把 `/game-pvz` 页面的卡片栏（React）作为 HUD 的一部分渲染（或者直接把 PvzGame.jsx 的 HUD 抽成共享组件）。

### 7. 胜负

- 僵尸 `dist < 0.15`（走到玩家面前）→ `gameEngine.end()` → `gameEnd` 事件 → ViewPage 弹失败层
- 5 波清完（`allWavesComplete`）→ 胜利层

## 四、数值（直接照搬 /game-pvz 已验证的可玩数值）

| 项 | 值 |
|---|---|
| 阳光 | 初始 125；天降 50/9s；向日葵 25/9s |
| 豌豆射手 | 100 阳，20 伤 / 1.5s |
| 向日葵 / 坚果墙 / 樱桃炸弹 | 50 / 50 / 150 阳；坚果 400 HP；樱桃 500 范围伤 |
| 僵尸 | 普通 90 HP·0.42 格/s；路障 190；铁桶 330 |
| 波次 | 5 波：第 n 波 2+n 只，波间 14s |

（AR 版差异：速度单位从"格/s"换成"米/s"，格子 0.15m → 普通僵尸 ≈ 0.06 m/s，桌面尺度刚好。）

## 五、分阶段

1. **阶段 1（核心可玩）【估算 3–4 人日】**：§3–§7 —— 桌面 AR PvZ：放置开局、点格种植、豌豆射击、阳光经济、5 波胜负
2. **阶段 2【估算 2 人日】**：图像追踪开局（扫海报=选关卡，`maxTrack` 多海报多关卡）；波次配置进 `unifiedConfig.game`（编辑器可调，走已验证的透传通道）
3. **阶段 3【估算 2 人日】**：手势捏合收阳光（ProjectHand 触发体系）+ 空间音频（SpatialAudio 僵尸低吼随距离渐强）

## 六、风险与已踩过的坑

- **放置组坐标系**：游戏对象必须全在 `_placementGroup` 内用局部坐标（陀螺仪反旋转只作用于组本身）——穹顶已验证此模式
- **性能**：程序化低模 + 无阴影，手机可跑（同 XR 引擎基线）
- **tap 与 HUD 冲突**：卡片栏 DOM 在 canvas 上层，注意 pointer-events 划分（/game-pvz 已处理过同样问题）
