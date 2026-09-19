/**
 * 前端 UI 一致性检查。
 *
 * 存在意义：这个仓库先后有过三套配色/组件写法（早期 ar-* 星空调色板、中途的
 * indigo/sky 直写、第四轮的 aurora 令牌），页面各写各的。光靠 code review 拦不住 ——
 * 每加一个页面就会多一种风格。把可机检的部分固化成脚本，CI/本地都能跑。
 *
 * 检查项：
 *   1. 禁用非规范色系（indigo/sky/blue/…），统一走 violet/cyan/emerald/amber/rose
 *   2. 禁止 emoji（界面一律 Lucide 图标；历史数据里的 emoji 键名在白名单内）
 *   3. 禁止 bg-[#xxxxxx] 这类字面量背景，统一用 ar-* / 令牌
 *   4. 页面必须使用统一外壳（page-wrap + page-head 或声明豁免）
 *
 * 用法：npm run check:ui
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'frontend', 'src');

/** 禁用色系 → 规范色系 */
const BANNED_HUES = {
  indigo: 'violet',
  sky: 'cyan',
  blue: 'cyan',
  purple: 'violet',
  fuchsia: 'violet',
  teal: 'emerald',
  lime: 'emerald',
  orange: 'amber',
  pink: 'rose',
  red: 'rose',
  green: 'emerald',
};

/** emoji 白名单：仅历史数据键名，组件返回 null，不会出现在界面上 */
const EMOJI_ALLOWLIST = [path.join('components', 'icons', 'SemanticIcon.jsx')];

/** 允许写死背景色的例外（画布/预览这类确实需要固定底色的地方） */
const HEX_BG_ALLOWLIST = [path.join('components', 'preview')];

/** 全屏画布类页面不需要 page-wrap 外壳，但要在此登记，避免「忘了加」被漏判 */
const SHELL_EXEMPT_PAGES = ['Home.jsx', 'ViewPage.jsx', 'ArShowcase.jsx', 'XrStudio.jsx', 'GyroTestPage.jsx'];

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(jsx|js|tsx|ts)$/.test(entry) && !entry.includes('.bak')) out.push(full);
  }
  return out;
}

const files = walk(srcDir);
const problems = [];

for (const file of files) {
  const rel = path.relative(srcDir, file);
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    // 1) 非规范色系
    for (const [banned, canonical] of Object.entries(BANNED_HUES)) {
      const re = new RegExp(`(text|bg|border|from|to|via|ring|shadow|decoration|outline|fill|stroke|divide|placeholder|caret|accent)-${banned}-\\d{2,3}`);
      const hit = line.match(re);
      if (hit) problems.push(`${rel}:${i + 1} 用了 ${hit[0]}，请改成 ${canonical}-*（统一色系）`);
    }
    // 2) emoji
    if (EMOJI_RE.test(line) && !EMOJI_ALLOWLIST.some((p) => file.endsWith(p))) {
      problems.push(`${rel}:${i + 1} 出现 emoji（界面只能用 Lucide 图标）`);
    }
    // 3) 字面量背景色
    const hex = line.match(/bg-\[#[0-9a-fA-F]{3,8}\]/);
    if (hex && !HEX_BG_ALLOWLIST.some((p) => rel.startsWith(p))) {
      problems.push(`${rel}:${i + 1} 用了字面量背景 ${hex[0]}，请改用 ar-* 或 CSS 令牌`);
    }
  });
}

// 4) 全屏页与外壳的冲突：根节点是 fixed inset-0 的页面必须登记在全屏组，
//    否则 AppShell 的 <main class="relative z-10"> 会盖在它上面（页脚文案会「透」进 AR 画面）
function isRootFullscreen(text) {
  return /return \(\s*<div className="[^"]*fixed inset-0/.test(text);
}

// 5) 页面外壳
const pagesDir = path.join(srcDir, 'pages');
for (const entry of readdirSync(pagesDir)) {
  if (!entry.endsWith('.jsx') || SHELL_EXEMPT_PAGES.includes(entry)) continue;
  const text = readFileSync(path.join(pagesDir, entry), 'utf8');
  if (!/page-wrap/.test(text)) problems.push(`pages/${entry} 没使用统一的 page-wrap 外壳`);
  if (!/page-head/.test(text)) problems.push(`pages/${entry} 没使用统一的 page-head 页头`);
  // 反向检查：根节点全屏的页面如果留在了 AppShell 里，就会被子壳的 z-10 覆盖
  if (isRootFullscreen(text)) {
    problems.push(
      `pages/${entry} 根节点是 fixed inset-0（全屏页），但被登记在 AppShell 内 —— ` +
        `必须放进 App.jsx 的 isStandalone 分组，否则外壳页脚会盖在它上面`
    );
  }
}

if (problems.length) {
  console.error(`UI 一致性检查未通过（${problems.length} 处）：`);
  for (const p of problems.slice(0, 60)) console.error('  ✗ ' + p);
  if (problems.length > 60) console.error(`  … 其余 ${problems.length - 60} 处省略`);
  process.exit(1);
}
console.log(`UI 一致性检查通过：${files.length} 个源文件，色系/图标/外壳均符合规范`);
