/**
 * 目标图片管理路由
 *
 * POST /api/target/compile  — 上传图片 → 生成 .mind 追踪文件
 *    请求: multipart/form-data, field: image
 *    返回: { imageUrl, targetUrl, width, height }
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { compileImage } from '../mindar-compile/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const name = `target_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${name}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${ext}，仅支持 ${allowed.join(', ')}`));
    }
  },
});

const router = Router();

/**
 * POST /api/target/compile
 * 上传目标图片，编译为 .mind 追踪文件
 */
router.post('/compile', (req, res, next) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `上传失败: ${err.message}` });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请上传一张图片' });
    }

    try {
      const imagePath = req.file.path;
      const baseName = path.basename(imagePath, path.extname(imagePath));
      const mindPath = path.join(UPLOAD_DIR, `${baseName}.mind`);

      // 编译为 .mind 文件
      const result = await compileImage(imagePath, (pct) => {
        // 可以在这里记录进度（当前不用）
      });

      // 写入 .mind 文件
      fs.writeFileSync(mindPath, result.data);
      console.log(`[target] 编译完成: ${mindPath} (${result.data.length} bytes)`);

      // 返回公网可访问的 URL（相对路径）
      const imageUrl = `/uploads/${path.basename(imagePath)}`;
      const targetUrl = `/uploads/${baseName}.mind`;

      res.json({
        imageUrl,
        targetUrl,
        width: result.metadata.width,
        height: result.metadata.height,
      });
    } catch (compileErr) {
      console.error('[target] 编译失败:', compileErr);
      // 清理上传的图片
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      res.status(500).json({ error: `图片编译失败: ${compileErr?.message || String(compileErr)}` });
    }
  });
});

export default router;
