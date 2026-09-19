/**
 * 监听 XR 引擎源码，改动后自动重建「嵌入产物」。
 *
 * 为什么需要它：
 *   /xr-studio 默认加载 frontend/public/xr-studio-static（单进程、免开 5174）。
 *   代价是引擎源码改了不会自动生效 —— 得记得手动跑 build-embedded.mjs。
 *   这个监听器把那一步自动化，编辑引擎后刷新页面就是新版本。
 *
 * 用法：
 *   npm run dev:xr-watch                       # 默认监听 modules/xr-engine
 *   XR_ENGINE_DIR=/path/to/xr npm run dev:xr-watch
 */
import { spawnSync } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import path from 'node:path';

const engineDir = process.env.XR_ENGINE_DIR || 'modules/xr-engine';
const watchTargets = ['src', 'index.html', 'vite.config.ts'];

if (!existsSync(engineDir)) {
  console.error(`[xr-watch] 找不到引擎目录：${engineDir}（可用 XR_ENGINE_DIR 指定）`);
  process.exit(1);
}

let timer = null;
let building = false;
let pending = false;

function build(reason) {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  console.log(`[xr-watch] 检测到改动（${reason}），重建嵌入产物…`);
  const result = spawnSync(
    process.platform === 'win32' ? 'cmd' : 'node',
    process.platform === 'win32'
      ? ['/c', 'node scripts\\build-embedded.mjs']
      : ['scripts/build-embedded.mjs'],
    { cwd: engineDir, stdio: 'inherit' }
  );
  console.log(result.status === 0 ? '[xr-watch] 重建完成，刷新页面即可看到' : '[xr-watch] 重建失败，见上面的输出');
  building = false;
  if (pending) {
    pending = false;
    build('队列中的改动');
  }
}

for (const target of watchTargets) {
  const full = path.join(engineDir, target);
  if (!existsSync(full)) continue;
  watch(full, { recursive: true }, (_event, filename) => {
    if (filename && /\.(tmp|log)$/.test(filename)) return;
    clearTimeout(timer);
    // vite build 只有几秒，防抖 800ms 足够合并同一次保存引发的多事件
    timer = setTimeout(() => build(filename || target), 800);
  });
  console.log(`[xr-watch] 监听 ${full}`);
}
