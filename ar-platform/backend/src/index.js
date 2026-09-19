/**
 * AR 体验平台 — 后端 API 入口
 * Express 应用初始化，注册中间件和路由
 */

// 必须排在 ./config.js 之前：ESM import 提升会让写在正文里的 dotenv.config() 失效
import './env.js';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { initDB } from './db.js';
import arRouter from './routes/ar.js';
import templatesRouter from './routes/templates.js';
import uploadRouter from './routes/upload.js';
import targetRouter from './routes/target.js';
import modelsRouter from './routes/models.js';
import videosRouter from './routes/videos.js';
import aiRouter from './routes/ai.js';
import aiComfyRouter from './routes/aiComfy.js';
import aiV1Router from './routes/aiV1.js';
import modulesRouter from './routes/modules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 获取本机局域网 IPv4 地址
 */
function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const app = express();

// ===== 中间件 =====
app.use(cors({ origin: config.corsOrigin }));
app.use(morgan('dev'));
app.use(express.json());

// Chrome DevTools 协议探测路径 → 静默忽略
app.use('/.well-known', (req, res) => res.status(204).end());

// ===== 静态文件 =====
app.use(express.static(path.join(__dirname, '..', 'public')));

// ===== API 路由 =====
app.use('/api/ar', arRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/upload-token', uploadRouter);
app.use('/api/target', targetRouter);
app.use('/api/models', modelsRouter);
app.use('/api/videos', videosRouter);
// ComfyUI 子路由先挂：Express 按注册顺序匹配前缀，放后面会被 /api/ai 先吃掉
app.use('/api/ai/comfy', aiComfyRouter);
app.use('/api/ai', aiRouter);
// 给 XR 引擎 AI 面板用的通用生成协议
app.use('/api/v1', aiV1Router);
// 姊妹项目模块清单 + 实时存活探测（首页卡片用，取代原先写死的端口与状态）
app.use('/api/modules', modulesRouter);

// ===== 服务信息（供前端感知自身地址） =====
app.get('/api/server-info', (req, res) => {
  res.json({
    lanIp: getLanIp(),
    port: parseInt(process.env.PORT || '3001'),
    host: req.headers.host || 'localhost',
  });
});

// ===== 健康检查 =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/*
 * 根路径服务卡片
 *
 * 为什么需要它：以前 `GET /` 没有注册任何路由，请求会落进 Express 内置的 404 页
 * （`Cannot GET /`）。那个页面自带 `Content-Security-Policy: default-src 'none'`，
 * 于是打开 http://localhost:3001/ 时控制台会同时冒出两条毫无指向性的红字：
 *   1. Failed to load resource: the server responded with a status of 404
 *   2. Connecting to '.../.well-known/appspecific/com.chrome.devtools.json'
 *      violates the following Content Security Policy directive: "default-src 'none'"
 * 第 2 条其实是 Chrome DevTools 自动探测工作区配置（本文件上方已用 /\.well-known
 * 返回 204 静默忽略），是被 404 页的 CSP 拦下才报出来的。
 * 两条红字根因同一个：根路径没有一个像样的响应。
 *
 * 这里返回人能看懂的 HTML。刻意不设 CSP —— 设了反而又会拦住 DevTools 的探测。
 */
app.get('/', (req, res) => {
  const port = parseInt(process.env.PORT || '3001');
  const lanIp = getLanIp();
  const feLocal = 'https://localhost:5180/';
  const feLan = `https://${lanIp}:5180/`;
  const apis = [
    ['GET', '/api/health', '健康检查'],
    ['GET', '/api/server-info', '本机局域网地址'],
    ['GET', '/api/templates', '模板列表'],
    ['GET', '/api/ar', '已发布的 AR 体验'],
    ['GET', '/api/models', '模型列表'],
    ['GET', '/api/videos', '视频列表'],
    ['POST', '/api/ai/design', 'AI 设计体验'],
  ];
  res.type('html').send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AR 体验平台 · 后端 API</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; padding:48px 24px; background:#0b0b12; color:#e7e7ef;
         font:14px/1.65 ui-sans-serif,system-ui,"Segoe UI","Microsoft YaHei",sans-serif; }
  .wrap { max-width:760px; margin:0 auto; }
  h1 { font-size:20px; font-weight:500; margin:0 0 6px; }
  .sub { color:#8b8ba3; margin:0 0 28px; }
  .card { border:1px solid #23233a; border-radius:12px; padding:18px 22px; margin-bottom:16px; }
  .row { display:flex; gap:14px; align-items:baseline; padding:7px 0; border-bottom:1px solid #1a1a2c; }
  .row:last-child { border-bottom:0; }
  .m { flex:0 0 58px; font-family:ui-monospace,Consolas,monospace; font-size:12px; color:#8b8ba3; }
  a { color:#a5a5ff; text-decoration:none; }
  a:hover { text-decoration:underline; }
  code { font-family:ui-monospace,Consolas,monospace; font-size:12.5px; color:#d6d6ff; }
  .hint { color:#8b8ba3; font-size:13px; }
  .ok { display:inline-block; width:7px; height:7px; border-radius:50%; background:#4ade80; margin-right:8px; }
</style>
</head>
<body>
<div class="wrap">
  <h1><span class="ok"></span>AR 体验平台 · 后端 API</h1>
  <p class="sub">服务运行中，监听 :${port}。这里是<b>接口服务</b>，不是网页界面。</p>

  <div class="card">
    <div class="row"><span class="m">网站</span><span>
      <a href="${feLocal}">${feLocal}</a><br>
      <span class="hint">手机同 WiFi 访问：<a href="${feLan}">${feLan}</a></span>
    </span></div>
    <div class="row"><span class="m">接口</span><span><code>http://localhost:${port}/api</code></span></div>
  </div>

  <div class="card">
${apis.map(([m, p, d]) => `    <div class="row"><span class="m">${m}</span><span><a href="${p}"><code>${p}</code></a> &nbsp;·&nbsp; ${d}</span></div>`).join('\n')}
  </div>

  <p class="hint">提示：打开 <code>/api/...</code> 以外的路径返回 404 属正常。</p>
</div>
</body>
</html>`);
});

// ===== 全局错误处理 =====
app.use((err, req, res, _next) => {
  /*
   * 之前所有异常一律 500 + 「服务器内部错误」，把「未知 Provider」「缺少工作流参数」
   * 这类调用方错误也埋成 500，前端拿不到任何可操作信息。
   * 这里透出 err.status（缺省 500）与真实 message；multer 的体积/字段错误按 400 处理。
   */
  const isUploadError = err?.name === 'MulterError';
  const status = isUploadError ? 400 : err?.status || err?.statusCode || 500;
  if (status >= 500) console.error('Unhandled error:', err);
  res.status(status).json({ error: err?.message || '服务器内部错误' });
});

// ===== 启动 =====
const PORT = parseInt(process.env.PORT || '3001');
const MAX_PORT_ATTEMPTS = 5;

function startServer(port, attempt = 0) {
  if (attempt >= MAX_PORT_ATTEMPTS) {
    console.error(`无法找到可用端口 (尝试了 ${MAX_PORT_ATTEMPTS} 个端口)`);
    process.exit(1);
  }
  const server = app.listen(port)
    .on('listening', () => {
      console.log(`🚀 AR Platform API 服务已启动: http://localhost:${port}`);
      console.log(`CORS origin: ${config.corsOrigin}`);
    })
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`端口 ${port} 被占用，尝试 ${port + 1}...`);
        server.close(() => startServer(port + 1, attempt + 1));
      } else {
        console.error('启动失败:', err);
        process.exit(1);
      }
    });
}

async function start() {
  try {
    await initDB();
    console.log('数据库初始化成功');
    startServer(PORT);
  } catch (err) {
    console.error('服务启动失败:', err);
    process.exit(1);
  }
}

start();
