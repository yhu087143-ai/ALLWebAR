/**
 * 生成对外可访问的 AR 体验分享链接。
 *
 * 关键约束：手机摄像头 / WebXR 只在安全上下文可用，http://<局域网IP> 会被浏览器直接
 * 拒绝（且不弹权限框）。所以非 localhost 的地址一律升级为 https —— 这是「发布出来的
 * 二维码扫进去提示不是安全上下文」的根因修复。
 *
 * 端口：后端端口(3000/3001)/空端口都不是 HTTPS 入口，统一换成前端公开端口
 * （config.publicPort，默认 5180，与 frontend/vite.config.js 的 AR_PORT 默认值一致）。
 *
 * 环境变量：
 *   PUBLIC_PROTOCOL=http   —— 显式逃生门（例如 nginx 在外层终止 TLS 时），此时不再升级
 *   PUBLIC_HOST / PUBLIC_PORT —— 完全没有客户端 origin 时的兜底
 */
import { config } from './config.js';

const FALLBACK_PORT = String(config.publicPort || 5180);
const BACKEND_PORTS = new Set([String(config.port || 3001), '3000', '3001', '80', '']);

function safeOrigin(value) {
  try { return new URL(value).origin; } catch { return null; }
}

export function buildPublicUrl(viewPath, originFromClient, req) {
  const explicitProto = String(process.env.PUBLIC_PROTOCOL || '').toLowerCase().replace(':', '');

  const derived = originFromClient
    || (req && req.get && req.get('origin'))
    || (req && req.get && req.get('referer') ? safeOrigin(req.get('referer')) : null)
    || null;

  let proto = explicitProto || 'https';
  let host = config.publicHost;
  let port = FALLBACK_PORT;

  if (derived) {
    try {
      const u = new URL(derived);
      host = u.hostname;
      port = u.port;
      proto = explicitProto || u.protocol.replace(':', '');
    } catch (_) { /* 非法 origin → 用配置兜底 */ }
  }

  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    // 手机访问不到 localhost，换成局域网 IP —— 换完就是「非本机地址」了
    host = config.publicHost;
  }
  const finalIsLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';

  // 摄像头/WebXR 需要安全上下文：非本机地址不允许 http（除非显式 PUBLIC_PROTOCOL=http）
  if (!explicitProto && !finalIsLocalHost && proto !== 'https') proto = 'https';

  // 端口修正：后端端口/空端口不是前端 HTTPS 入口
  if (proto === 'https' && (BACKEND_PORTS.has(port) || port === String(config.port))) port = FALLBACK_PORT;
  if (proto === 'https' && port === '443') port = '';
  if (proto === 'http' && (port === '80' || !port)) port = FALLBACK_PORT;

  return `${proto}://${host}${port ? ':' + port : ''}${viewPath}`;
}

export default buildPublicUrl;
