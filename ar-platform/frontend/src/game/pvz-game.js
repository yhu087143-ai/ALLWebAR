/**
 * 植物大战僵尸 · 平台可玩版（three.js 完整游戏循环）
 *
 * 设计承接 XR 引擎 games/pvz.ts 的美术语言（程序化几何体 + 同套配色）：
 *   5 行 × 9 列草坪，阳光经济，豌豆射手/向日葵/坚果墙/樱桃炸弹，
 *   普通僵尸/路障僵尸/铁桶僵尸分波进攻，撑过 5 波判胜。
 *
 * 对外接口：
 *   const game = new PvzGame(container, { onState })
 *   game.start()                // 从开始界面进入战斗
 *   game.selectPlant('sunflower'|'peashooter'|'wallnut'|'cherry')
 *   game.restart()
 *   window.__pvz = game         // 无头验证钩子
 */
import * as THREE from 'three';

const COLS = 9;
const ROWS = 5;
const CELL = 1;
const GRID_X0 = -4;          // 第 0 列中心 x
const GRID_Z0 = -2;          // 第 0 行中心 z
const HOUSE_X = -4.7;        // 防线（僵尸越过即输）
const SPAWN_X = 6.2;
const TOTAL_WAVES = 5;

export const PLANTS = {
  sunflower:  { name: '向日葵',   cost: 50,  hp: 80,  cooldown: 7,  color: '#ffd54f' },
  peashooter: { name: '豌豆射手', cost: 100, hp: 100, cooldown: 7,  color: '#7cb342' },
  wallnut:    { name: '坚果墙',   cost: 50,  hp: 400, cooldown: 18, color: '#8d6e63' },
  cherry:     { name: '樱桃炸弹', cost: 150, hp: 60,  cooldown: 25, color: '#e53935' },
};

const ZOMBIE_TYPES = {
  normal: { hp: 90,  speed: 0.42, color: '#5d4037', skin: '#7cb342' },
  cone:   { hp: 190, speed: 0.36, color: '#5d4037', skin: '#7cb342', cone: true },
  bucket: { hp: 330, speed: 0.3,  color: '#455a64', skin: '#7cb342', bucket: true },
};

const colX = (c) => GRID_X0 + c * CELL;
const rowZ = (r) => GRID_Z0 + r * CELL;

export class PvzGame {
  constructor(container, { onState } = {}) {
    this.container = container;
    this.onState = onState;
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.selected = null;
    this.status = 'ready';          // ready | playing | over | win
    this.raf = 0;
    this._statePushedAt = 0;
    this._disposables = [];

    this._initThree();
    this._buildLawn();
    this._bindPointer();
    window.__pvz = this;

    this._resize = () => this._onResize();
    window.addEventListener('resize', this._resize);
    this._loop();
  }

  /* ---------------------------------------------------------------- 场景 */

  _initThree() {
    const w = this.container.clientWidth || 960;
    const h = this.container.clientHeight || 600;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1420);
    this.scene.fog = new THREE.Fog(0x0d1420, 14, 26);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    this.camera.position.set(0, 8.6, 7.2);
    this.camera.lookAt(0, 0, 0.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const dir = new THREE.DirectionalLight(0xfff3e0, 1.6);
    dir.position.set(4, 9, 5);
    this.scene.add(dir);

    this.plantGroup = new THREE.Group();
    this.zombieGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    this.sunGroup = new THREE.Group();
    this.scene.add(this.plantGroup, this.zombieGroup, this.fxGroup, this.sunGroup);
  }

  _buildLawn() {
    // 深浅相间草坪 + 网格
    const dark = new THREE.MeshBasicMaterial({ color: 0x1e4d2b });
    const light = new THREE.MeshBasicMaterial({ color: 0x2e7d32 });
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const cell = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), (c + r) % 2 ? light : dark);
        cell.rotation.x = -Math.PI / 2;
        cell.position.set(colX(c), 0, rowZ(r));
        cell.userData = { kind: 'grid', col: c, row: r };
        this.scene.add(cell);
        this._disposables.push(cell);
      }
    }
    // 防线小屋墙
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1.6, ROWS * CELL + 0.6),
      new THREE.MeshBasicMaterial({ color: 0x6d4c41 }),
    );
    wall.position.set(HOUSE_X - 0.3, 0.8, (GRID_Z0 + GRID_Z0 + (ROWS - 1) * CELL) / 2);
    this.scene.add(wall);

    // 草坪外圈地面
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 30),
      new THREE.MeshBasicMaterial({ color: 0x10241a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.scene.add(ground);
  }

  /* ---------------------------------------------------------------- 建模 */

  _makePlantModel(type) {
    const g = new THREE.Group();
    const mat = (c) => new THREE.MeshBasicMaterial({ color: c });
    if (type === 'sunflower') {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5), mat(0x43a047));
      stem.position.y = 0.25;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), mat(0xffd54f));
      head.scale.set(1, 1, 0.5); head.position.y = 0.62;
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mat(0x6d4c41));
      core.position.set(0, 0.62, 0.12);
      g.add(stem, head, core);
    } else if (type === 'peashooter') {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.45), mat(0x43a047));
      stem.position.y = 0.22;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), mat(0x7cb342));
      head.position.y = 0.6;
      const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.3), mat(0x558b2f));
      snout.rotation.z = -Math.PI / 2; snout.position.set(0.28, 0.62, 0);
      g.add(stem, head, snout);
    } else if (type === 'wallnut') {
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), mat(0x8d6e63));
      nut.scale.set(0.85, 1.15, 0.8); nut.position.y = 0.45;
      g.add(nut);
    } else if (type === 'cherry') {
      const a = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), mat(0xe53935));
      a.position.set(-0.14, 0.35, 0);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), mat(0xd32f2f));
      b.position.set(0.16, 0.28, 0);
      const stemM = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3), mat(0x33691e));
      stemM.position.y = 0.6;
      g.add(a, b, stemM);
    }
    return g;
  }

  _makeZombieModel(type) {
    const spec = ZOMBIE_TYPES[type];
    const g = new THREE.Group();
    const mat = (c) => new THREE.MeshBasicMaterial({ color: c });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.4), mat(spec.color));
    body.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), mat(spec.skin));
    head.position.y = 1.35;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.55), mat(spec.skin));
    arm.position.set(0.1, 0.95, 0.3);
    g.add(body, head, arm);
    if (spec.cone) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 12), mat(0xef6c00));
      cone.position.y = 1.68; g.add(cone);
    } else if (spec.bucket) {
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.36, 12), mat(0x78909c));
      bucket.position.y = 1.66; g.add(bucket);
    }
    return g;
  }

  _makeSun(size = 0.3) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(size, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd54f }),
    );
    s.userData = { kind: 'sun' };
    return s;
  }

  /* ---------------------------------------------------------------- 状态 */

  start() {
    if (this.status === 'playing') return;
    this._resetWorld();
    this.status = 'playing';
    this.sun = 125;
    this.wave = 0;
    this.waveTimer = 6;          // 第一波 6 秒后来
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.skySunTimer = 4;
    this.cooldowns = Object.fromEntries(Object.keys(PLANTS).map((k) => [k, 0]));
    this.plants = [];            // {type,col,row,hp,model,shootT,sunT}
    this.zombies = [];           // {type,row,x,hp,speed,model,eating}
    this.peas = [];
    this.suns = [];              // {model,x,y,z,value,life,vy}
    this._pushState(true);
  }

  restart() { this.status = 'ready'; this.start(); }

  selectPlant(type) {
    if (!PLANTS[type] || this.status !== 'playing') return;
    this.selected = this.selected === type ? null : type;
    this._pushState(true);
  }

  _resetWorld() {
    for (const p of this.plants || []) this.plantGroup.remove(p.model);
    for (const z of this.zombies || []) this.zombieGroup.remove(z.model);
    for (const p of this.peas || []) this.fxGroup.remove(p.model);
    for (const s of this.suns || []) this.sunGroup.remove(s.model);
    this.plants = []; this.zombies = []; this.peas = []; this.suns = [];
  }

  _pushState(force = false) {
    const now = performance.now();
    if (!force && now - this._statePushedAt < 150) return;
    this._statePushedAt = now;
    this.onState?.({
      sun: this.sun,
      wave: this.wave,
      totalWaves: TOTAL_WAVES,
      zombies: this.zombies.length,
      status: this.status,
      selected: this.selected,
      cooldowns: { ...this.cooldowns },
      plants: this.plants.length,
    });
  }

  /* ---------------------------------------------------------------- 输入 */

  _bindPointer() {
    this._onPointer = (e) => this._handlePointer(e);
    this.container.addEventListener('pointerdown', this._onPointer);
  }

  _handlePointer(e) {
    if (this.status !== 'playing') return;
    const rect = this.container.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // 1) 优先收集阳光
    const sunHits = this.raycaster.intersectObjects(this.sunGroup.children, false);
    if (sunHits.length) {
      this._collectSun(sunHits[0].object);
      return;
    }
    // 2) 种植
    if (!this.selected) return;
    const spec = PLANTS[this.selected];
    if (this.sun < spec.cost || this.cooldowns[this.selected] > 0) return;
    const cellHits = this.raycaster.intersectObjects(
      this.scene.children.filter((o) => o.userData?.kind === 'grid'), false,
    );
    if (!cellHits.length) return;
    const { col, row } = cellHits[0].object.userData;
    if (this.plants.some((p) => p.col === col && p.row === row)) return;
    this._placePlant(this.selected, col, row);
  }

  _collectSun(model) {
    const s = this.suns.find((x) => x.model === model);
    if (!s) return;
    this.sun += s.value;
    this.sunGroup.remove(model);
    this.suns = this.suns.filter((x) => x !== s);
    this._pushState(true);
  }

  _placePlant(type, col, row) {
    const spec = PLANTS[type];
    if (this.sun < spec.cost) return;
    this.sun -= spec.cost;
    this.cooldowns[type] = spec.cooldown;
    const model = this._makePlantModel(type);
    model.position.set(colX(col), 0, rowZ(row));
    this.plantGroup.add(model);
    this.plants.push({
      type, col, row, hp: spec.hp, model,
      shootT: 0, sunT: type === 'sunflower' ? 4 : 0, fuse: type === 'cherry' ? 1.1 : 0,
    });
    if (type === 'cherry') this.selected = null;
    this._pushState(true);
  }

  /* ---------------------------------------------------------------- 波次 */

  _spawnWave() {
    this.wave += 1;
    const n = 2 + this.wave;
    this.spawnQueue = Array.from({ length: n }, (_, i) => {
      const roll = Math.random();
      let type = 'normal';
      if (this.wave >= 3 && roll > 0.65) type = 'cone';
      if (this.wave >= 5 && roll > 0.85) type = 'bucket';
      return { type, at: i * 3.5, row: Math.floor(Math.random() * ROWS) };
    });
    this.spawnTimer = 0;
  }

  _spawnZombie(type, row) {
    const spec = ZOMBIE_TYPES[type];
    const model = this._makeZombieModel(type);
    model.position.set(SPAWN_X, 0, rowZ(row));
    this.zombieGroup.add(model);
    this.zombies.push({ type, row, x: SPAWN_X, hp: spec.hp, speed: spec.speed, model, eating: null });
  }

  /* ---------------------------------------------------------------- 循环 */

  _loop = () => {
    this.raf = requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.status === 'playing') this._update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  _update(dt) {
    // 冷却
    for (const k of Object.keys(this.cooldowns)) {
      if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
    // 天降阳光
    this.skySunTimer -= dt;
    if (this.skySunTimer <= 0) {
      this.skySunTimer = 9;
      this._spawnSkySun();
    }
    // 波次调度
    if (this.spawnQueue.length) {
      this.spawnTimer += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].at <= this.spawnTimer) {
        const s = this.spawnQueue.shift();
        this._spawnZombie(s.type, s.row);
      }
    } else if (this.zombies.length === 0) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        if (this.wave >= TOTAL_WAVES) { this.status = 'win'; this._pushState(true); return; }
        this.waveTimer = 14;
        this._spawnWave();
      }
    }
    this._updateSuns(dt);
    this._updatePlants(dt);
    this._updateZombies(dt);
    this._updatePeas(dt);
    if (this.zombies.some((z) => z.x < HOUSE_X)) { this.status = 'over'; this._pushState(true); return; }
    this._pushState();
  }

  _spawnSkySun() {
    const model = this._makeSun();
    const x = -3.5 + Math.random() * 7;
    const z = GRID_Z0 + Math.random() * (ROWS - 1) * CELL;
    model.position.set(x, 6, z);
    this.sunGroup.add(model);
    this.suns.push({ model, x, y: 6, z, value: 50, life: 12, vy: -1.1, grounded: false });
  }

  _updateSuns(dt) {
    for (const s of [...this.suns]) {
      if (!s.grounded) {
        s.y += s.vy * dt;
        if (s.y <= 0.65) { s.y = 0.65; s.grounded = true; }
      } else {
        s.life -= dt;
        if (s.life <= 0) { this.sunGroup.remove(s.model); this.suns = this.suns.filter((x) => x !== s); continue; }
      }
      s.model.position.set(s.x, s.y + Math.sin(performance.now() / 400) * 0.05, s.z);
      s.model.rotation.y += dt * 2;
    }
  }

  _updatePlants(dt) {
    for (const p of [...this.plants]) {
      const px = colX(p.col);
      if (p.type === 'sunflower') {
        p.sunT -= dt;
        if (p.sunT <= 0) {
          p.sunT = 9;
          const model = this._makeSun(0.22);
          model.position.set(px, 1, rowZ(p.row));
          this.sunGroup.add(model);
          this.suns.push({ model, x: px, y: 1, z: rowZ(p.row), value: 25, life: 10, vy: 0, grounded: true });
        }
      } else if (p.type === 'peashooter') {
        const target = this.zombies.some((z) => z.row === p.row && z.x > px - 0.2);
        p.shootT -= dt;
        if (target && p.shootT <= 0) {
          p.shootT = 1.5;
          const pea = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8),
            new THREE.MeshBasicMaterial({ color: 0xaeea00 }));
          pea.position.set(px + 0.35, 0.62, rowZ(p.row));
          this.fxGroup.add(pea);
          this.peas.push({ model: pea, row: p.row, x: px + 0.35, dmg: 20, speed: 5 });
        }
      } else if (p.type === 'cherry') {
        p.fuse -= dt;
        p.model.scale.setScalar(1 + (1.1 - p.fuse) * 0.25);
        if (p.fuse <= 0) {
          this._explode(p);
          continue;
        }
      }
      // 僵尸啃食由僵尸侧处理；这里处理植物死亡
      if (p.hp <= 0) {
        this.plantGroup.remove(p.model);
        this.plants = this.plants.filter((x) => x !== p);
        for (const z of this.zombies) if (z.eating === p) z.eating = null;
      }
    }
  }

  _explode(p) {
    const px = colX(p.col), pz = rowZ(p.row);
    for (const z of [...this.zombies]) {
      if (Math.abs(z.x - px) <= 1.6 && Math.abs(rowZ(z.row) - pz) <= 1.6) {
        z.hp -= 500;
        if (z.hp <= 0) this._killZombie(z);
      }
    }
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff7043, transparent: true, opacity: 0.85 }));
    flash.position.set(px, 0.5, pz);
    this.fxGroup.add(flash);
    setTimeout(() => { this.fxGroup.remove(flash); }, 260);
    this.plantGroup.remove(p.model);
    this.plants = this.plants.filter((x) => x !== p);
  }

  _updateZombies(dt) {
    for (const z of [...this.zombies]) {
      const food = this.plants.find(
        (p) => p.row === z.row && Math.abs(colX(p.col) - z.x) < 0.42,
      );
      z.eating = food || null;
      if (food) {
        food.hp -= 25 * dt;
        z.model.position.y = Math.abs(Math.sin(performance.now() / 150)) * 0.04;
      } else {
        z.x -= z.speed * dt;
        z.model.position.x = z.x;
        z.model.position.y = Math.abs(Math.sin(performance.now() / 220)) * 0.05;
      }
      if (z.hp <= 0) this._killZombie(z);
    }
  }

  _killZombie(z) {
    this.zombieGroup.remove(z.model);
    this.zombies = this.zombies.filter((x) => x !== z);
  }

  _updatePeas(dt) {
    for (const pea of [...this.peas]) {
      pea.x += pea.speed * dt;
      pea.model.position.x = pea.x;
      const hit = this.zombies.find((z) => z.row === pea.row && Math.abs(z.x - pea.x) < 0.38);
      if (hit) {
        hit.hp -= pea.dmg;
        if (hit.hp <= 0) this._killZombie(hit);
        this.fxGroup.remove(pea.model);
        this.peas = this.peas.filter((x) => x !== pea);
        continue;
      }
      if (pea.x > SPAWN_X + 1) {
        this.fxGroup.remove(pea.model);
        this.peas = this.peas.filter((x) => x !== pea);
      }
    }
  }

  /* ---------------------------------------------------------------- 其他 */

  _onResize() {
    if (!this.container) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._resize);
    this.container?.removeEventListener('pointerdown', this._onPointer);
    this.renderer?.dispose();
    this.renderer?.domElement?.remove();
    if (window.__pvz === this) delete window.__pvz;
  }
}
