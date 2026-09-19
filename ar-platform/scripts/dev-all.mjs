/**
 * 一键启动：后端(watch) + 前端(5180)，端口就绪后自动打开浏览器。
 *
 * 为什么不用 concurrently / npm-run-all：
 *   根仓库是零新增依赖的约定，而这里只需要 spawn 两个子进程 + 等端口，
 *   自己写反而能把「端口被占」「产物缺失」这类常见故障讲清楚。
 *
 * 用法：
 *   npm run dev              # 后端起 watch、前端起 vite、自动开浏览器
 *   npm run dev -- --no-open # 不自动开浏览器
 *   AR_PORT=5181 npm run dev # 换前端端口
 */
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendPort = Number(process.env.AR_PORT || 5180);
const backendPort = Number(process.env.PORT || 3001);
const shouldOpen = !process.argv.includes('--no-open');

/** 端口是否已经被占用（说明服务在跑，不用重复起） */
const probe = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(800);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });

const children = [];
function run(name, cwd, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => {
    console.log(`[${name}] 退出，code=${code}`);
  });
  children.push(child);
  return child;
}

async function waitForPort(port, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await probe(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function lanIp() {
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const frontendDir = path.join(root, 'frontend');
const backendDir = path.join(root, 'backend');

if (!existsSync(path.join(root, 'ar-engine', 'dist', 'index.js'))) {
  console.warn(
    '[dev] 注意：ar-engine/dist 不存在，AR 运行时会加载失败。先跑 npm run dev:engine（需在 Windows 下执行）。'
  );
}
if (!existsSync(path.join(frontendDir, 'public', 'xr-studio-static', 'index.html'))) {
  console.warn(
    '[dev] 注意：未发现 XR 引擎静态产物，/xr-studio 会回退到 5174 代理模式。' +
      '要单进程使用请执行：cd modules/xr-engine && node scripts/build-embedded.mjs'
  );
}

if (await probe(backendPort)) console.log(`[dev] 后端 ${backendPort} 已在运行，跳过启动`);
else run('backend', backendDir, 'npm', ['run', 'dev'], { PORT: String(backendPort) });

if (await probe(frontendPort)) console.log(`[dev] 前端 ${frontendPort} 已在运行，跳过启动`);
else run('frontend', frontendDir, 'npm', ['run', 'dev'], { AR_PORT: String(frontendPort) });

/*
 * HTTPS 判定必须和 frontend/vite.config.js 保持一致：
 * 默认开启（basicSsl 自签证书），AR_HTTPS=0/false/off/no 关闭。
 * 之前这里写死 http://localhost:PORT —— dev server 实际是 https，
 * 于是浏览器打开的/外部拿到的是 http 页面，_publicOrigin 跟着变成
 * http://<局域网IP>:PORT，扫码进手机后就是「摄像头无法访问：当前页面不是安全上下文」。
 */
const httpsOff = ['0', 'false', 'off', 'no'].includes(String(process.env.AR_HTTPS ?? '').toLowerCase());
const scheme = httpsOff ? 'http' : 'https';
const url = `${scheme}://localhost:${frontendPort}/`;
const lanUrl = `${scheme}://${lanIp()}:${frontendPort}/`;
if (await waitForPort(frontendPort)) {
  console.log(`[dev] 就绪 → ${url}`);
  console.log(`[dev] 手机测试地址（需与电脑同局域网）→ ${lanUrl}`);
  if (httpsOff) {
    console.warn(
      '[dev] ⚠️ 检测到 AR_HTTPS=0：当前是 HTTP。浏览器只在 HTTPS / localhost 下放行摄像头，\n' +
      '      手机打开 HTTP 地址会直接报「不是安全上下文」。手机上测 AR 请去掉 AR_HTTPS=0 重启。'
    );
  } else {
    console.log('[dev] 手机首次访问会提示证书不受信任（自签证书），选择继续访问即可；摄像头需要 HTTPS 才会放行。');
  }
  if (shouldOpen) {
    const command =
      process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    try {
      spawn(command, args, { stdio: 'ignore', detached: true }).unref();
    } catch {
      /* 打不开浏览器不影响服务本身 */
    }
  }
} else {
  console.error(`[dev] 前端 ${frontendPort} 在 60s 内未就绪，请看上面的日志`);
}

const shutdown = () => {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* 已退出 */
    }
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
