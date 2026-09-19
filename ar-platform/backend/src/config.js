/**
 * 应用配置
 * 环境变量驱动，本地开发使用默认值
 */

import './env.js';
import os from 'os';

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

const lanIp = getLanIp();

export const config = {
  // 服务器端口
  port: parseInt(process.env.PORT || '3001'),

  // CORS 允许的源
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // SQLite 数据库路径
  dbPath: process.env.DB_PATH || './data/database.sqlite',

  // 本机局域网 IP（供生成可分享的链接）
  lanIp,

  // 前端公开 URL（生产环境设为完整域名，开发时自动检测）
  publicHost: process.env.PUBLIC_HOST || lanIp,

  // 前端公开端口（默认与 Vite 开发服务器一致；如前端改了端口，用 PUBLIC_PORT 覆盖）
  publicPort: parseInt(process.env.PUBLIC_PORT || '5180'),

  // COS 配置（可选，缺失时使用 mock 凭证）
  cosConfig: {
    secretId: process.env.COS_SECRET_ID || '',
    secretKey: process.env.COS_SECRET_KEY || '',
    bucket: process.env.COS_BUCKET || 'ar-platform',
    region: process.env.COS_REGION || 'ap-guangzhou',
    keyPrefix: process.env.COS_KEY_PREFIX || 'uploads/'
  }
};
