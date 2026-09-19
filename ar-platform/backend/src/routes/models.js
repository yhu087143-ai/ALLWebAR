/**
 * 模型文件上传路由
 *
 * POST /api/models/upload  — 上传 .glb / .gltf 模型
 *    请求: multipart/form-data, field: model
 *    返回: { url, originalName, size }
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.glb';
    const name = `model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${name}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.glb', '.gltf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${ext}，仅支持 .glb / .gltf`));
    }
  },
});

const router = Router();

router.post('/upload', (req, res, next) => {
  upload.single('model')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `上传失败: ${err.message}` });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请上传一个模型文件' });
    }

    const url = `/uploads/${req.file.filename}`;
    res.json({
      url,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  });
});

export default router;
