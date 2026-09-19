/**
 * 环境变量加载（必须被最先 import）。
 *
 * 为什么单独成一个模块：
 *   ESM 的 import 会被提升到模块体之前执行。原先写在 index.js 里的
 *   `dotenv.config()` 实际晚于 `./config.js` 求值，于是 config.js 读到的
 *   全是 undefined —— .env 里配的 PUBLIC_PORT / ANTHROPIC_* 对配置对象完全失效，
 *   表现就是「Key 明明配了却报未授权」「QR 端口一直是默认的 5173」。
 *
 * 另外 dotenv 默认按 cwd 找 .env：从仓库根用 `node backend/src/index.js` 启动时
 * 连文件都找不到（静默失败，只注入 0 个变量）。这里显式按 backend/ 目录定位，不依赖 cwd。
 *
 * 本模块幂等，config.js / index.js / 脚本都可以直接 import。
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const envPath = path.join(backendDir, '.env');

dotenv.config({ path: envPath, override: true });
