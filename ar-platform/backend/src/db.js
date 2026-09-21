/**
 * SQLite 数据库模块
 * 使用 sql.js 实现无依赖的本地持久化
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

let db = null;
const dbPath = path.resolve(config.dbPath);
/** 内存态是否有未落盘的变更 */
let _dirty = false;

/**
 * 初始化数据库
 * 如果数据库文件已存在则加载，否则新建
 * 创建 ar_experiences 表
 */
export async function initDB() {
  const SQL = await initSqlJs();
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 创建 AR 体验表
  db.run(`
    CREATE TABLE IF NOT EXISTS ar_experiences (
      id TEXT PRIMARY KEY,
      title TEXT,
      model_url TEXT NOT NULL,
      tracking_type TEXT NOT NULL,
      config TEXT,
      view_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      target_url TEXT,
      target_image_url TEXT
    )
  `);

  // 兼容旧表：添加可能缺失的列
  try { db.run('ALTER TABLE ar_experiences ADD COLUMN target_url TEXT'); } catch (_) {}
  try { db.run('ALTER TABLE ar_experiences ADD COLUMN target_image_url TEXT'); } catch (_) {}
  try { db.run('ALTER TABLE ar_experiences ADD COLUMN video_url TEXT'); } catch (_) {}
  try { db.run('ALTER TABLE ar_experiences ADD COLUMN animation_config TEXT'); } catch (_) {}
  try { db.run('ALTER TABLE ar_experiences ADD COLUMN interaction_config TEXT'); } catch (_) {}
  try { db.run('ALTER TABLE ar_experiences ADD COLUMN unified_config TEXT'); } catch (_) {}

  // 建表/迁移可能改变了结构（新库尤其需要落盘），标记为脏再保存
  _dirty = true;
  saveDB();
  return db;
}

/**
 * 获取数据库实例
 */
export function getDB() {
  if (!db) throw new Error('数据库未初始化');
  return db;
}

/**
 * 将数据库写入磁盘持久化
 *
 * ⚠️ 必须原子写：直接 `fs.writeFileSync(dbPath, buffer)` 会**原地覆盖**，
 * 任何一次写入中断（进程被杀 / 并发写 / 磁盘繁忙）都会让数据库文件被截断，
 * 而 initDB 里的 `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` 容错设计会让
 * 损坏的库"成功"打开 —— 只是表里没数据，表现为接口 404「体验不存在」。
 *
 * 做法：先写同目录临时文件，再 rename 覆盖。同一文件系统内的 rename 是原子的，
 * 要么看到旧文件、要么看到新文件，不会出现半截状态。
 *
 * 另：无变更时跳过写盘（GET 请求会触发 incrementViewCount → saveDB，
 * 高频访问时全量导出+写盘是纯浪费，也放大了损坏窗口）。
 */
function saveDB() {
  if (!db) return;
  if (!_dirty) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const tmpPath = `${dbPath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, dbPath);
    _dirty = false;
  } catch (e) {
    // 写盘失败不能把进程带崩，也不能留下临时文件
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    console.error('[db] 持久化失败:', e?.message);
  }
}

/** 标记内存态已变更，下次 saveDB 才真正落盘 */
function markDirty() {
  _dirty = true;
}

/**
 * 创建一条 AR 体验记录
 * @param {Object} data
 * @param {string} data.id
 * @param {string} data.title
 * @param {string} data.modelUrl
 * @param {string} [data.videoUrl]  — 视频 URL（可选，替代 3D 模型）
 * @param {string} data.trackingType
 * @param {Object} data.config
 * @param {string} data.createdAt
 * @param {string} [data.targetUrl]  — .mind 文件路径
 * @param {string} [data.targetImageUrl]  — 原图路径
 * @param {Object} [data.animationConfig]
 * @param {Object} [data.interactionConfig]
 * @returns {Object} 创建的记录
 */
export function createAR(data) {
  const d = getDB();
  d.run(
    `INSERT INTO ar_experiences (id, title, model_url, video_url, tracking_type, config, view_count, created_at, target_url, target_image_url, animation_config, interaction_config, unified_config)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [data.id, data.title || '', data.modelUrl, data.videoUrl || null, data.trackingType,
     JSON.stringify(data.config || {}), data.createdAt,
     data.targetUrl || null, data.targetImageUrl || null,
     data.animationConfig ? JSON.stringify(data.animationConfig) : null,
     data.interactionConfig ? JSON.stringify(data.interactionConfig) : null,
     data.unifiedConfig ? JSON.stringify(data.unifiedConfig) : null]
  );
  markDirty();
  saveDB();
  return getAR(data.id);
}

/**
 * 根据 ID 获取 AR 体验
 * @param {string} id
 * @returns {Object|null}
 */
export function getAR(id) {
  const d = getDB();
  const stmt = d.prepare('SELECT * FROM ar_experiences WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const row = stmt.get();
    stmt.free();
    return rowToObject(cols, row);
  }
  stmt.free();
  return null;
}

/**
 * 递增 viewCount
 * @param {string} id
 * @returns {Object|null} 更新后的记录
 */
export function incrementViewCount(id) {
  const d = getDB();
  d.run('UPDATE ar_experiences SET view_count = view_count + 1 WHERE id = ?', [id]);
  markDirty();
  saveDB();
  return getAR(id);
}

/**
 * 获取所有 AR 体验，按创建时间倒序
 * @returns {Array<Object>}
 */
export function listAR() {
  const d = getDB();
  const result = d.exec('SELECT * FROM ar_experiences ORDER BY created_at DESC');
  if (result.length === 0 || result[0].values.length === 0) return [];

  const cols = result[0].columns;
  return result[0].values.map((row) => rowToObject(cols, row));
}

/**
 * 删除 AR 体验
 * @param {string} id
 */
export function deleteAR(id) {
  const d = getDB();
  d.run('DELETE FROM ar_experiences WHERE id = ?', [id]);
  markDirty();
  saveDB();
}

/**
 * 将 sql.js 的行数据转为对象
 */
function rowToObject(cols, row) {
  const obj = {};
  cols.forEach((col, i) => {
    let val = row[i];
    if ((col === 'config' || col === 'animation_config' || col === 'interaction_config' || col === 'unified_config') && val) {
      try { val = JSON.parse(val); } catch (e) { /* 保持原样 */ }
    }
    if (col === 'view_count') val = Number(val);
    obj[col] = val;
  });
  return obj;
}
