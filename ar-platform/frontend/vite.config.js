import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'os';

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

/**
 * HTTPS 开关：
 *  - 默认开启（basicSsl 自签证书），手机通过局域网 IP 访问时浏览器要求安全上下文
 *  - 设为 AR_HTTPS=0 / false 可关闭，改用纯 HTTP —— 用于 localhost 本地预览
 *    （http://localhost 本身即安全上下文，摄像头 / WebXR 仍可正常工作）
 */
const useHttps = !['0', 'false', 'off', 'no'].includes(
  String(process.env.AR_HTTPS ?? '').toLowerCase(),
);
const devPort = parseInt(process.env.AR_PORT || '5180', 10);

/**
 * 优先使用 mkcert 真证书（certs/local.pem + local-key.pem，需覆盖局域网 IP）。
 * 手机访问 https://<局域网IP>:5180 时：basicSsl 的证书只对 localhost 有效，
 * 证书无效的页面在 Chrome 上连绕过警告后也会被禁用摄像头 —— AR 根本起不来。
 * mkcert 证书 + 手机安装 rootCA 后才是真·可信安全上下文。无证书文件则回落 basicSsl。
 */
const __dirnameCfg = path.dirname(fileURLToPath(import.meta.url));
function mkcertHttps() {
  try {
    const key = fs.readFileSync(path.join(__dirnameCfg, 'certs', 'local-key.pem'));
    const cert = fs.readFileSync(path.join(__dirnameCfg, 'certs', 'local.pem'));
    mkcertHttps.https = { key, cert };
    if (!useHttps) return false;
    console.warn('[ar-platform] ✅ 检测到 mkcert 证书（certs/local.pem），以可信 HTTPS 启动');
    return true;
  } catch {
    console.warn('[ar-platform] ⚠️ 未找到 certs/local.pem，回落 basicSsl 自签证书（手机访问会被禁摄像头）');
    return false;
  }
}

if (!useHttps) {
  console.warn(
    '\n[ar-platform] ⚠️  AR_HTTPS=0 → 开发服务器以 HTTP 运行。\n' +
    '           浏览器只在 HTTPS / localhost 下允许摄像头与 WebXR，\n' +
    '           手机打开 http://<局域网IP>:' + devPort + ' 会直接提示「不是安全上下文」。\n' +
    '           需要真机测 AR 时请去掉 AR_HTTPS=0 重新 `npm run dev`（自签证书，手机需信任）。\n'
  );
}
/**
 * XR 引擎 dev server 的端口，必须与它启动时的 XR_PORT 一致。
 * 做成可配置是因为 5174 可能被别的进程占着（例如上次没退干净的 vite），
 * 这时只要两边同时改环境变量即可，不必改代码。
 */
const xrStudioPort = process.env.XR_STUDIO_PORT || '5174';

export default defineConfig({
  // public/ 下有一批独立 AR 测试页（import map + 裸包名），它们不是应用入口。
  // Vite 默认会爬取所有 .html 做依赖预构建，缺包时整个 dev server 直接启动失败
  // （曾因 public/xr-studio-static/splat-test.html 引用未安装的
  //  @mkkellogg/gaussian-splats-3d 导致 `npm run dev` 完全起不来）。
  optimizeDeps: {
    entries: ['index.html'],
  },
  plugins: [
    react(),
    ...(useHttps ? (mkcertHttps() ? [] : [basicSsl()]) : []),
    {
      name: 'inject-lan-ip',
      apply: 'serve',
      transform(code, id) {
        if (code.includes('__AR_PUBLIC_IP__')) {
          return code.replace(/__AR_PUBLIC_IP__/g, JSON.stringify(getLanIp()));
        }
        return code;
      },
    },
    {
      name: 'three-srgb-fix',
      enforce: 'post',
      transform(code, id) {
        if (id.includes('.vite/deps/three') && !code.includes('__injected_srgb')) {
          return { code: code + '\n// __injected_srgb\nconst sRGBEncoding = 3001;\nexport { sRGBEncoding };\n', map: null };
        }
      },
    },
    {
      name: 'cors-headers',
      configureServer: (server) => {
        server.middlewares.use((req, res, next) => {
          if (req.url.startsWith('/.well-known/')) {
            res.statusCode = 204;
            res.end();
            return;
          }
          res.setHeader('Access-Control-Allow-Origin', '*');
          next();
        });
      },
    },
  ],
  root: '.',
  server: {
    ...(useHttps && mkcertHttps() ? { https: mkcertHttps.https } : {}),
    port: devPort,
    host: true,
    allowedHosts: true,
    fs: { allow: ['..'] },
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
      /**
       * XR 创作台：把独立的 XR引擎 dev server 挂在同源子路径下。
       *
       * 为什么必须同源：编辑器要调用 /api/models/upload、/api/target/compile、/api/ar，
       * 同源后这些相对路径请求会直接走本文件上方的 /api 代理命中后端 ——
       * 不需要给后端加 CORS，也不需要把 GLB 字节通过 postMessage 转交给宿主。
       *
       * XR引擎 必须用 XR_BASE=/xr-studio-app/ 启动（见其 scripts/dev-embedded.mjs），
       * 否则它的资源路径会落在宿主根目录而 404。
       * ws: true 用于透传 Vite HMR 的 WebSocket。
       */
      '/xr-studio-app': {
        target: `http://localhost:${xrStudioPort}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
