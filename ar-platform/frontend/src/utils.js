// 动态 basename：检测是否通过 DevShare /proxy 前缀访问
const basename = /^\/proxy(\/|$)/.test(window.location.pathname) ? '/proxy' : '';

/**
 * 构建可分享的 URL origin
 *
 * 方案：Vite 启动时通过 define 注入 __AR_PUBLIC_IP__（本机 LAN IP），
 * 浏览器代码中直接在模块初始化时同步替换 localhost → LAN IP，
 * 无竞态、无异步等待。
 *
 * 回退策略：sessionStorage 缓存（SPA 内页面跳转时复用）+ 后端 API 异步更新。
 */
const hostname = window.location.hostname;
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

/**
 * 手机摄像头 / WebXR 只在「安全上下文」可用，而 http://<局域网IP> 不是安全上下文。
 * 对外分享的地址（二维码、复制链接）必须强制 https，否则扫码进去只会看到
 * 「摄像头无法访问：当前页面不是安全上下文」。
 *
 * 端口规则：后端端口(3000/3001)与空端口都不是 HTTPS 入口，统一换到前端 HTTPS 端口
 * （Vite 默认 5180，可用 VITE_AR_HTTPS_PORT 覆盖）。
 */
export const AR_HTTPS_PORT = (import.meta.env && import.meta.env.VITE_AR_HTTPS_PORT) || '5180';
const BACKEND_PORTS = new Set(['3000', '3001', '80', '']);

export function toSecureUrl(rawUrl, httpsPort = AR_HTTPS_PORT) {
  try {
    const u = new URL(rawUrl, window.location.href);
    if (u.protocol === 'https:') return u.toString();
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1') return u.toString();
    u.protocol = 'https:';
    if (BACKEND_PORTS.has(u.port)) u.port = httpsPort;
    return u.toString();
  } catch {
    return rawUrl;
  }
}

export function toSecureOrigin(origin) {
  try { return new URL(toSecureUrl(origin)).origin; } catch { return origin; }
}

// 1. 先检查 sessionStorage 缓存（SPA 内跳转用）
const cachedOrigin = sessionStorage.getItem('ar-public-origin');

// 2. 有缓存且仍为 localhost → 用缓存；有缓存但非 localhost → 用当前 origin
let _publicOrigin = toSecureOrigin((cachedOrigin && isLocalhost) ? cachedOrigin : window.location.origin);

if (isLocalhost) {
  // 3. 尝试用 Vite 注入的 LAN IP（同步，无竞态）
  const lanIp = typeof __AR_PUBLIC_IP__ !== 'undefined' ? __AR_PUBLIC_IP__ : null;
  if (lanIp) {
    const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    _publicOrigin = toSecureOrigin(`${window.location.protocol}//${lanIp}:${port}`);
  }

  // 4. 缓存到 sessionStorage
  sessionStorage.setItem('ar-public-origin', _publicOrigin);

  // 5. 后台异步刷新（网络环境变化时 IP 可能改变）
  fetch('/api/server-info').then(r => r.json()).then(info => {
    const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    const origin = toSecureOrigin(`${window.location.protocol}//${info.lanIp}:${port}`);
    _publicOrigin = origin;
    sessionStorage.setItem('ar-public-origin', origin);
  }).catch(() => {});
}

export function viewUrl(id) {
  return `${_publicOrigin}${basename}/view/${id}`;
}

export function fullUrl(path) {
  return `${_publicOrigin}${basename}${path}`;
}
