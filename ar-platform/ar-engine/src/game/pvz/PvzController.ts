/**
 * AR 植物大战僵尸 —— PvzController（P1 核心可玩版）
 *
 * 运行环境：markerless 平面放置路径。doPlace 首次点击后由 ar-engine 构造本控制器，
 * 棋盘（9×5，格 0.15m）铺在放置组局部 XZ 平面上，僵尸从桌对面自由走向玩家。
 *
 * 设计要点（见 docs/AR植物大战僵尸-实现方案.md）：
 *  - 所有游戏对象挂在 _placementGroup 内、用局部坐标（陀螺仪反旋转铁律）
 *  - 僵尸自由移动：seek + separation + wander 合成方向，不锁车道
 *  - 植物索敌：最近目标 + 炮管转向 + 半追踪豌豆
 *  - 模型可配置：models[type]=modelUrl（GLTF/Draco），未配置回落程序化几何体
 *  - 无头验证钩子：window.__pvz
 */
import * as THREE from 'three';

declare global {
  interface Window { __pvz?: unknown }
}
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export interface PvzModelConfig {
  plants?: Partial<Record<'sunflower' | 'peashooter' | 'wallnut' | 'cherry', string>>;
  zombies?: Partial<Record<'normal' | 'cone' | 'bucket', string>>;
  scale?: number;
}

export interface PvzConfig {
  enabled?: boolean;
  cols?: number;             // 默认 9
  rows?: number;             // 默认 5
  cellSize?: number;         // 默认 0.15（米）
  waves?: number;            // 默认 5
  models?: PvzModelConfig;
}

interface PlantSpec { name: string; cost: number; hp: number; cooldown: number; range: number; damage: number; interval: number }

export const PVZ_PLANTS: Record<string, PlantSpec> = {
  sunflower:  { name: '向日葵',   cost: 50,  hp: 80,  cooldown: 7,  range: 0,    damage: 0,  interval: 9 },
  peashooter: { name: '豌豆射手', cost: 100, hp: 100, cooldown: 7,  range: 0.5,  damage: 20, interval: 1.5 },
  wallnut:    { name: '坚果墙',   cost: 50,  hp: 400, cooldown: 18, range: 0,    damage: 0,  interval: 0 },
  cherry:     { name: '樱桃炸弹', cost: 150, hp: 60,  cooldown: 25, range: 0.25, damage: 500, interval: 0 },
};

const ZOMBIE_TYPES: Record<string, { hp: number; speed: number }> = {
  normal: { hp: 90,  speed: 0.06 },
  cone:   { hp: 190, speed: 0.05 },
  bucket: { hp: 330, speed: 0.045 },
};

interface Plant { type: string; cell: string; pos: THREE.Vector2; hp: number; model: THREE.Object3D; shootT: number; sunT: number; fuse: number; head?: THREE.Object3D }
interface Zombie { type: string; pos: THREE.Vector2; hp: number; speed: number; model: THREE.Object3D; vel: THREE.Vector2; wanderA: number; food: Plant | null }
interface Pea { model: THREE.Mesh; pos: THREE.Vector2; vel: THREE.Vector2; dmg: number; target: Zombie | null }
interface Sun { model: THREE.Mesh; value: number; life: number; grounded: boolean; vy: number }
interface BoardCell { mesh: THREE.Mesh; pos: THREE.Vector2; occupied: Plant | null }

export class PvzController {
  private group: THREE.Group;            // _placementGroup（局部坐标系）
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private container: HTMLElement;
  private cfg: Required<Pick<PvzConfig, 'cols' | 'rows' | 'cellSize' | 'waves'>> & PvzConfig;

  private gameRoot = new THREE.Group();   // 挂在放置组下，由 AR 主场景渲染
  private raf = 0;
  private clock = new THREE.Clock();

  private boardGroup = new THREE.Group();
  private cells: BoardCell[] = [];
  private plants: Plant[] = [];
  private zombies: Zombie[] = [];
  private peas: Pea[] = [];
  private suns: Sun[] = [];

  private sun = 125;
  private wave = 0;
  private waveTimer = 8;
  private spawnQueue: { type: string; at: number }[] = [];
  private spawnTimer = 0;
  private skySunT = 5;
  private cooldowns: Record<string, number> = {};
  private selected: string | null = null;
  private status: 'ready' | 'playing' | 'over' | 'win' = 'ready';
  private houseDir = new THREE.Vector2(0, 1);   // 指向玩家一侧（局部 XZ）
  private houseDist = 0.36;                     // 玩家侧判定线距棋盘远端
  private hud: HTMLDivElement | null = null;
  private stateT = 0;
  private disposed = false;

  private raycaster = new THREE.Raycaster();
  private onTapBound = (e: PointerEvent) => this.onTap(e);
  private onResizeBound = () => this.onResize();

  constructor(opts: {
    group: THREE.Group; scene: THREE.Scene; camera: THREE.Camera;
    container: HTMLElement; config?: PvzConfig;
  }) {
    this.group = opts.group;
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.container = opts.container;
    this.cfg = {
      cols: opts.config?.cols ?? 9,
      rows: opts.config?.rows ?? 5,
      cellSize: opts.config?.cellSize ?? 0.15,
      waves: opts.config?.waves ?? 5,
      models: opts.config?.models,
      enabled: true,
    };

    // 游戏对象全部挂 gameRoot（放置组子节点），由 AR 主场景渲染 —— 坐标系天然统一
    this.group.add(this.gameRoot);
    this.gameRoot.add(new THREE.AmbientLight(0xffffff, 1.4));

    // 房屋方向：相机在放置组局部坐标系的 XZ 投影
    const camLocal = this.group.worldToLocal(opts.camera.position.clone());
    this.houseDir.set(camLocal.x, camLocal.z).normalize();
    // 棋盘中心放在放置点，整体朝向玩家
    this.boardGroup.rotation.y = Math.atan2(this.houseDir.x, this.houseDir.y);
    this.gameRoot.add(this.boardGroup);

    window.__pvz = this;
    // 调试/验证钩子：无头环境陀螺仪固定，射线点不到棋盘，用直驱接口验证游戏逻辑
    (window as any).__pvzDebug = {
      state: () => ({ sun: this.sun, wave: this.wave, zombies: this.zombies.length, plants: this.plants.length, peas: this.peas.length, status: this.status, suns: this.suns.length }),
      placePlant: (type: string, col = 4, row = 2) => {
        const s = this.cfg.cellSize;
        const pos = new THREE.Vector2((col - (this.cfg.cols - 1) / 2) * s, (row - (this.cfg.rows - 1) / 2) * s);
        const rec = this.cells.find((x) => x.pos.equals(pos));
        if (!rec || rec.occupied) return false;
        this.sun = Math.max(this.sun, PVZ_PLANTS[type]?.cost ?? 0);
        this.cooldowns[type] = 0;
        this._placePlant(type, rec, pos);
        return true;
      },
      spawnZombie: (type = 'normal') => { this._spawnZombie(type); return true; },
      giveSun: (n: number) => { this.sun += n; return true; },
    };
    window.addEventListener('resize', this.onResizeBound);
    this.container.addEventListener('pointerdown', this.onTapBound);
    this._buildHud();
    this._loop();
  }

  /** 放置完成（doPlace 定位放置组后调用）：建棋盘、开战 */
  start() {
    if (this.status !== 'ready') return;
    this._buildBoard();
    this.status = 'playing';
    this._hudMsg('僵尸即将来袭…');
    this._pushState(true);
  }

  selectPlant(type: string | null) {
    if (this.status !== 'playing') return;
    this.selected = this.selected === type ? null : type;
    this._pushState(true);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResizeBound);
    this.container.removeEventListener('pointerdown', this.onTapBound);
    this.hud?.remove();
    this.group.remove(this.gameRoot);
    if (window.__pvz === this) delete window.__pvz;
  }

  /* ------------------------------------------------ 棋盘与 HUD */

  private _buildBoard(): void {
    const s = this.cfg.cellSize;
    const dark = new THREE.MeshBasicMaterial({ color: 0x1e4d2b });
    const light = new THREE.MeshBasicMaterial({ color: 0x2e7d32 });
    for (let c = 0; c < this.cfg.cols; c++) {
      for (let r = 0; r < this.cfg.rows; r++) {
        const x = (c - (this.cfg.cols - 1) / 2) * s;
        const z = (r - (this.cfg.rows - 1) / 2) * s;
        const cell = new THREE.Mesh(new THREE.PlaneGeometry(s, s), (c + r) % 2 ? light : dark);
        cell.rotation.x = -Math.PI / 2;
        cell.position.set(x, 0.002, z);
        cell.userData = { pos: new THREE.Vector2(x, z) };
        this.boardGroup.add(cell);
        this.cells.push({ mesh: cell, pos: new THREE.Vector2(x, z), occupied: null });
      }
    }
    // 房子墙（玩家侧）
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(this.cfg.cols * s + 0.05, 0.08, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x6d4c41 }),
    );
    const hw = this.houseDir.clone().multiplyScalar(this.cfg.rows * s * 0.5 + 0.03);
    wall.position.set(hw.x, 0.04, hw.y);
    wall.rotation.y = Math.atan2(this.houseDir.x, this.houseDir.y);
    this.boardGroup.add(wall);
  }

  private _buildHud() {
    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:20;font-family:system-ui;';
    hud.innerHTML = `
      <div data-hud="top" style="position:absolute;top:10px;left:10px;right:10px;display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="background:rgba(0,0,0,.5);border-radius:10px;padding:6px 12px;color:#ffe082;font-weight:700;font-size:16px;">☀ <span data-sun>125</span></div>
        <div style="background:rgba(0,0,0,.5);border-radius:10px;padding:6px 12px;color:#fff;font-size:12px;" data-wave>准备中</div>
      </div>
      <div data-hud="msg" style="position:absolute;top:52px;left:0;right:0;text-align:center;color:#fff;font-size:13px;text-shadow:0 1px 3px #000;"></div>
      <div data-hud="cards" style="position:absolute;bottom:14px;left:0;right:0;display:flex;justify-content:center;gap:8px;pointer-events:auto;"></div>`;
    this.container.appendChild(hud);
    this.hud = hud;

    const cards = hud.querySelector('[data-hud="cards"]')!;
    for (const [type, spec] of Object.entries(PVZ_PLANTS)) {
      const b = document.createElement('button');
      b.setAttribute('data-card', type);
      b.textContent = `${spec.name} ${spec.cost}`;
      b.style.cssText = 'background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:10px 12px;font-size:12px;';
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.selectPlant(type); });
      cards.appendChild(b);
    }
  }

  private _hudMsg(t: string) {
    const el = this.hud?.querySelector('[data-hud="msg"]');
    if (el) el.textContent = t;
  }

  private _refreshHud() {
    const sun = this.hud?.querySelector('[data-sun]');
    if (sun) sun.textContent = String(this.sun);
    const wave = this.hud?.querySelector('[data-wave]');
    if (wave) {
      wave.textContent = this.status === 'playing'
        ? `第 ${Math.max(this.wave, 1)}/${this.cfg.waves} 波 · 僵尸 ${this.zombies.length}`
        : this.status === 'win' ? '胜利！' : this.status === 'over' ? '失败' : '准备中';
    }
    this.hud?.querySelectorAll('[data-card]').forEach((b) => {
      const type = b.getAttribute('data-card')!;
      const spec = PVZ_PLANTS[type];
      const cd = this.cooldowns[type] || 0;
      const dis = this.status !== 'playing' || this.sun < spec.cost || cd > 0;
      (b as HTMLButtonElement).style.opacity = dis ? '0.4' : '1';
      (b as HTMLButtonElement).style.borderColor = this.selected === type ? '#ffe082' : 'rgba(255,255,255,.25)';
      b.textContent = cd > 0 ? `${spec.name} ${cd.toFixed(1)}s` : `${spec.name} ${spec.cost}`;
    });
  }

  /* ------------------------------------------------ 输入 */

  private onTap(e: PointerEvent) {
    if (this.status !== 'playing') return;
    const rect = this.container.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);

    // 1) 收集阳光（射线与太阳网格求交）
    const sunMeshes = this.suns.map((x) => x.model);
    const sunHits = this.raycaster.intersectObjects(sunMeshes, false);
    if (sunHits.length) {
      const hit = this.suns.find((x) => x.model === sunHits[0].object);
      if (hit) { this._collectSun(hit); return; }
    }

    // 2) 种植：射线与格子网格求交
    if (!this.selected) return;
    const spec = PVZ_PLANTS[this.selected];
    if (this.sun < spec.cost || this.cooldowns[this.selected] > 0) return;
    const cellMeshes = this.cells.map((x) => x.mesh);
    const cellHits = this.raycaster.intersectObjects(cellMeshes, false);
    if (!cellHits.length) return;
    const pos: THREE.Vector2 | undefined = cellHits[0].object.userData?.pos;
    if (!pos) return;
    const cellRec = this.cells.find((x) => x.mesh === cellHits[0].object);
    if (!cellRec || cellRec.occupied) return;
    this._placePlant(this.selected, cellRec, pos);
  }

  private _rayDistance(ray: THREE.Ray, point: THREE.Vector3): number {
    return ray.distanceToPoint(point);
  }

  private _collectSun(s: Sun) {
    this.sun += s.value;
    this.gameRoot.remove(s.model);
    this.suns = this.suns.filter((x) => x !== s);
    this._pushState(true);
  }

  /* ------------------------------------------------ 种植/僵尸/阳光 */

  private _placePlant(type: string, cellRec: BoardCell, pos: THREE.Vector2) {
    const spec = PVZ_PLANTS[type];
    if (this.sun < spec.cost || this.cooldowns[type] > 0) return;
    this.sun -= spec.cost;
    this.cooldowns[type] = spec.cooldown;
    const model = this._loadOrBuild(type, 'plant');
    model.position.set(pos.x, 0, pos.y);
    this.gameRoot.add(model);
    this.plants.push({
      type, cell: cellRec.mesh.uuid, pos, hp: spec.hp, model,
      shootT: 0.5, sunT: type === 'sunflower' ? 4 : 0, fuse: type === 'cherry' ? 1.1 : 0,
    });
    if (cellRec) cellRec.occupied = this.plants[this.plants.length - 1];
    if (type === 'cherry') this.selected = null;
    this._pushState(true);
  }

  private _spawnZombie(type: string) {
    const spec = ZOMBIE_TYPES[type];
    const model = this._loadOrBuild(type, 'zombie');
    const half = (this.cfg.cols * this.cfg.cellSize) / 2;
    const farZ = -(this.cfg.rows * this.cfg.cellSize) / 2 - 0.08;
    const pos = new THREE.Vector2(-half * 0.7 + Math.random() * half * 1.4, farZ);
    model.position.set(pos.x, 0, pos.y);
    this.gameRoot.add(model);
    this.zombies.push({ type, pos, hp: spec.hp, speed: spec.speed, model, vel: new THREE.Vector2(0, spec.speed), wanderA: Math.random() * Math.PI * 2, food: null });
  }

  private _spawnSkySun() {
    const half = (this.cfg.cols * this.cfg.cellSize) / 2;
    const model = this._makeSun();
    model.position.set(-half * 0.6 + Math.random() * half * 1.2, 0.3, -(this.cfg.rows * this.cfg.cellSize) / 2 + Math.random() * this.cfg.rows * this.cfg.cellSize);
    this.gameRoot.add(model);
    this.suns.push({ model, value: 50, life: 14, grounded: false, vy: -0.06 });
  }

  /* ------------------------------------------------ 模型 */

  private _loadOrBuild(type: string, kind: 'plant' | 'zombie'): THREE.Object3D {
    const url = kind === 'plant'
      ? this.cfg.models?.plants?.[type as keyof NonNullable<PvzModelConfig['plants']>]
      : this.cfg.models?.zombies?.[type as keyof NonNullable<PvzModelConfig['zombies']>];
    const holder = new THREE.Group();
    if (url) {
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath('/draco/');
      loader.setDRACOLoader(draco);
      loader.load(url, (g) => {
        const m = g.scene;
        const box = new THREE.Box3().setFromObject(m);
        const h = Math.max(box.max.y - box.min.y, 0.001);
        const target = kind === 'plant' ? 0.09 : 0.13;
        m.scale.setScalar((target / h) * (this.cfg.models?.scale ?? 1));
        m.position.y = -box.min.y * (target / h);
        holder.add(m);
      }, undefined, () => { holder.add(this._buildFallback(type, kind)); });
      return holder;
    }
    holder.add(this._buildFallback(type, kind));
    return holder;
  }

  private _buildFallback(type: string, kind: 'plant' | 'zombie'): THREE.Object3D {
    const g = new THREE.Group();
    const mat = (c: number) => new THREE.MeshBasicMaterial({ color: c });
    if (kind === 'plant') {
      if (type === 'sunflower') {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.07), mat(0x43a047)); stem.position.y = 0.035;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), mat(0xffd54f)); head.position.y = 0.09;
        g.add(stem, head);
      } else if (type === 'peashooter') {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.06), mat(0x43a047)); stem.position.y = 0.03;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), mat(0x7cb342)); head.position.y = 0.085;
        g.add(stem, head); (g as any).head = head;
      } else if (type === 'wallnut') {
        const nut = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), mat(0x8d6e63));
        nut.scale.set(0.85, 1.15, 0.8); nut.position.y = 0.055; g.add(nut);
      } else {
        const a = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat(0xe53935)); a.position.set(-0.02, 0.05, 0);
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat(0xd32f2f)); b.position.set(0.02, 0.04, 0);
        g.add(a, b);
      }
    } else {
      const spec = ZOMBIE_TYPES[type] ?? ZOMBIE_TYPES.normal;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.035), mat(type === 'bucket' ? 0x455a64 : 0x5d4037));
      body.position.y = 0.055;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), mat(0x7cb342));
      head.position.y = 0.125;
      g.add(body, head);
      if (type === 'cone') { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.04, 10), mat(0xef6c00)); cone.position.y = 0.165; g.add(cone); }
      else if (type === 'bucket') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.035, 10), mat(0x78909c)); b.position.y = 0.165; g.add(b); }
      void spec;
    }
    return g;
  }

  private _makeSun(): THREE.Mesh {
    return new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd54f }));
  }

  /* ------------------------------------------------ 主循环 */

  private _loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.status === 'playing') this._update(dt);
  };

  private _update(dt: number) {
    for (const k of Object.keys(this.cooldowns)) {
      if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
    this.skySunT -= dt;
    if (this.skySunT <= 0) { this.skySunT = 9; this._spawnSkySun(); }

    if (this.spawnQueue.length) {
      this.spawnTimer += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].at <= this.spawnTimer) {
        this._spawnZombie(this.spawnQueue.shift()!.type);
      }
    } else if (this.zombies.length === 0) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        if (this.wave >= this.cfg.waves) { this.status = 'win'; this._hudMsg('胜利！'); this._pushState(true); return; }
        this.waveTimer = 14;
        this._nextWave();
      }
    }
    this._updateSuns(dt);
    this._updatePlants(dt);
    this._updateZombies(dt);
    this._updatePeas(dt);

    if (this.zombies.some((z) => z.pos.distanceTo(this.houseDir.clone().multiplyScalar(this.cfg.rows * this.cfg.cellSize * 0.5)) < 0.07)) {
      this.status = 'over'; this._hudMsg('僵尸进了房子…'); this._pushState(true); return;
    }
    this._pushState();
  }

  private _nextWave() {
    this.wave += 1;
    this._hudMsg(`第 ${this.wave} 波来袭！`);
    const n = 2 + this.wave;
    this.spawnQueue = Array.from({ length: n }, (_, i) => {
      const roll = Math.random();
      let type = 'normal';
      if (this.wave >= 3 && roll > 0.65) type = 'cone';
      if (this.wave >= 5 && roll > 0.85) type = 'bucket';
      return { type, at: i * 3500 / 1000 };
    });
    this.spawnTimer = 0;
  }

  private _updateSuns(dt: number) {
    for (const s of [...this.suns]) {
      if (!s.grounded) {
        s.model.position.y += s.vy * dt;
        if (s.model.position.y <= 0.03) { s.model.position.y = 0.03; s.grounded = true; }
      } else {
        s.life -= dt;
        if (s.life <= 0) { this.gameRoot.remove(s.model); this.suns = this.suns.filter((x) => x !== s); continue; }
      }
      s.model.rotation.y += dt * 2;
    }
  }

  private _updatePlants(dt: number) {
    for (const p of [...this.plants]) {
      const spec = PVZ_PLANTS[p.type];
      if (p.type === 'sunflower') {
        p.sunT -= dt;
        if (p.sunT <= 0) {
          p.sunT = spec.interval;
          const model = this._makeSun();
          model.position.set(p.pos.x, 0.08, p.pos.y);
          this.gameRoot.add(model);
          this.suns.push({ model, value: 25, life: 12, grounded: true, vy: 0 });
        }
      } else if (p.type === 'peashooter') {
        p.shootT -= dt;
        const target = this._acquireTarget(p.pos, spec.range);
        if (target) {
          const head = (p.model as any).head;
          if (head) head.lookAt(target.model.position.x, head.getWorldPosition(new THREE.Vector3()).y, target.model.position.z);
          if (p.shootT <= 0) {
            p.shootT = spec.interval;
            const pea = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), mat(0xaeea00));
            const start = new THREE.Vector2(p.pos.x, p.pos.y).clone().add(new THREE.Vector2(Math.sin(p.model.rotation.y), Math.cos(p.model.rotation.y)).multiplyScalar(0.04));
            pea.position.set(start.x, 0.075, start.y);
            this.gameRoot.add(pea);
            const dir = new THREE.Vector2(target.pos.x - start.x, target.pos.y - start.y).normalize();
            this.peas.push({ model: pea, pos: start.clone(), vel: dir.multiplyScalar(0.45), dmg: spec.damage, target });
          }
        }
      } else if (p.type === 'cherry') {
        p.fuse -= dt;
        p.model.scale.setScalar(1 + (1.1 - p.fuse) * 0.3);
        if (p.fuse <= 0) { this._explode(p); continue; }
      }
      if (p.hp <= 0) {
        this.gameRoot.remove(p.model);
        this.plants = this.plants.filter((x) => x !== p);
        const cellRec = this.cells.find((x) => x.occupied === p);
        if (cellRec) cellRec.occupied = null;
        for (const z of this.zombies) if (z.food === p) { z.food = null; }
      }
    }
  }

  private _acquireTarget(pos: THREE.Vector2, range: number): Zombie | null {
    let best: Zombie | null = null, bestD = range;
    for (const z of this.zombies) {
      const d = z.pos.distanceTo(pos);
      if (d <= range && d < bestD) { best = z; bestD = d; }
    }
    return best;
  }

  private _explode(p: Plant) {
    for (const z of [...this.zombies]) {
      if (z.pos.distanceTo(p.pos) <= 0.25) {
        z.hp -= 500;
        if (z.hp <= 0) this._killZombie(z);
      }
    }
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff7043, transparent: true, opacity: 0.9 }));
    flash.position.set(p.pos.x, 0.05, p.pos.y);
    this.gameRoot.add(flash);
    setTimeout(() => { if (!this.disposed) this.gameRoot.remove(flash); }, 250);
    this.gameRoot.remove(p.model);
    this.plants = this.plants.filter((x) => x !== p);
    const cellRec = this.cells.find((x) => x.occupied === p);
    if (cellRec) cellRec.occupied = null;
  }

  private _updateZombies(dt: number) {
    const housePoint = this.houseDir.clone().multiplyScalar(this.cfg.rows * this.cfg.cellSize * 0.5);
    for (const z of [...this.zombies]) {
      if (z.food && (z.food.hp > 0) && z.food.pos.distanceTo(z.pos) < 0.05) {
        z.food.hp -= 25 * dt;
      } else {
        z.food = null;
        const desired = housePoint.clone().sub(z.pos).normalize().multiplyScalar(z.speed);
        // separation
        const sep = new THREE.Vector2();
        for (const o of this.zombies) {
          if (o === z) continue;
          const d = z.pos.distanceTo(o.pos);
          if (d < 0.06 && d > 0.0001) sep.add(z.pos.clone().sub(o.pos).divideScalar(d * d).multiplyScalar(0.006));
        }
        // wander
        z.wanderA += (Math.random() - 0.5) * 1.6 * dt;
        const wander = new THREE.Vector2(Math.sin(z.wanderA), Math.cos(z.wanderA)).multiplyScalar(z.speed * 0.25);
        const vel = desired.add(sep.multiplyScalar(60)).add(wander);
        if (vel.length() > z.speed) vel.setLength(z.speed);
        z.vel.copy(vel);
        z.pos.add(vel.clone().multiplyScalar(dt));
        z.model.position.set(z.pos.x, 0, z.pos.y);
        z.model.rotation.y = Math.atan2(vel.x, vel.y);
      }
      // 啃食判定：身旁有植物
      const food = this.plants.find((p) => p.pos.distanceTo(z.pos) < 0.045);
      if (food && z.food !== food) { z.food = food; }
      if (z.food) {
        z.food.hp -= 25 * dt;
        z.model.rotation.x = Math.abs(Math.sin(performance.now() / 150)) * 0.1;
      } else {
        z.model.rotation.x = 0;
      }
      if (z.hp <= 0) this._killZombie(z);
    }
  }

  private _killZombie(z: Zombie) {
    this.gameRoot.remove(z.model);
    this.zombies = this.zombies.filter((x) => x !== z);
  }

  private _updatePeas(dt: number) {
    for (const pea of [...this.peas]) {
      if (pea.target && this.zombies.includes(pea.target)) {
        // 半追踪：每帧向目标当前位置修正 30%
        const want = pea.target.pos.clone().sub(pea.pos).normalize().multiplyScalar(pea.vel.length());
        pea.vel.lerp(want, 0.3);
      }
      pea.pos.add(pea.vel.clone().multiplyScalar(dt));
      pea.model.position.set(pea.pos.x, 0.075, pea.pos.y);
      const hit = pea.target && this.zombies.includes(pea.target) && pea.target.pos.distanceTo(pea.pos) < 0.025;
      const dead = pea.target && !this.zombies.includes(pea.target);
      if (hit) {
        pea.target!.hp -= pea.dmg;
        if (pea.target!.hp <= 0) this._killZombie(pea.target!);
        this.gameRoot.remove(pea.model);
        this.peas = this.peas.filter((x) => x !== pea);
        continue;
      }
      if (dead || pea.pos.length() > 1.2) {
        this.gameRoot.remove(pea.model);
        this.peas = this.peas.filter((x) => x !== pea);
      }
    }
  }

  private _pushState(force = false) {
    const now = performance.now();
    if (!force && now - this.stateT < 150) return;
    this.stateT = now;
    this._refreshHud();
    (window as any).__pvzState = {
      sun: this.sun, wave: this.wave, waves: this.cfg.waves,
      zombies: this.zombies.length, plants: this.plants.length,
      status: this.status, selected: this.selected, cooldowns: { ...this.cooldowns },
    };
  }

  private onResize() { /* 渲染由 AR 主循环负责 */ }
}

function mat(c: number) { return new THREE.MeshBasicMaterial({ color: c }); }
