/**
 * 临时验证脚本：MindAR 的 OfflineCompiler 能否把【多张图】编进同一个 .mind。
 *
 * 为什么值得验：`多视角图片目标` 是当前唯一「MIT 许可 + 今天就能跑」的 3D 实物追踪曲线方案。
 * 而 backend/src/mindar-compile/index.js 只传了单元素数组 `[fakeImage]` ——
 * 如果 compileImageTargets 本来就支持多图，这条路线的门槛就只是包装层。
 *
 * 用完即删（会自己清理临时产物）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Jimp } from 'jimp';
import { OfflineCompiler } from './src/mindar-compile/compiler.js';

const ROOT = path.resolve(process.cwd());
const IMAGES = [
  path.join(ROOT, '..', 'frontend', 'public', 'targets', 'tour-card.jpg'),
  path.join(ROOT, '..', 'frontend', 'public', 'targets', 'card-target.png'),
];

/**
 * 从 .mind 里抽出 JSON 段。
 * 不假设固定的头部长度（8 字节的猜测是错的），改成：
 * 先找到第一个 `{`，再做花括号配对，取最长的一段合法 JSON。
 */
function parseMindJson(buf) {
  for (let start = 0; start < Math.min(buf.length, 64); start++) {
    if (buf[start] !== 0x7b) continue; // '{'
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < buf.length; i++) {
      const c = buf[i];
      if (esc) { esc = false; continue; }
      if (inStr) {
        if (c === 0x5c) esc = true;
        else if (c === 0x22) inStr = false;
        continue;
      }
      if (c === 0x22) inStr = true;
      else if (c === 0x7b) depth++;
      else if (c === 0x7d) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(buf.subarray(start, i + 1).toString('utf8'));
          } catch {
            break; // 这段不是合法 JSON，换下一个起点
          }
        }
      }
    }
  }
  return null;
}

async function toFakeImage(p) {
  const img = await Jimp.read(p);
  const { width, height } = img.bitmap;
  return {
    width,
    height,
    _pixelData: new Uint8ClampedArray(img.bitmap.data.buffer),
  };
}

console.log('=== 输入图 ===');
const exist = IMAGES.filter((p) => fs.existsSync(p));
for (const p of IMAGES) console.log(`  ${fs.existsSync(p) ? '有' : '缺'}  ${path.basename(p)}`);
if (exist.length < 2) {
  console.error('需要两张可用图片，退出');
  process.exit(1);
}

const fakes = [];
for (const p of exist) fakes.push(await toFakeImage(p));
console.log(`  载入 ${fakes.length} 张: ${fakes.map((f) => `${f.width}x${f.height}`).join(', ')}`);

console.log('\n=== 编译两张图到同一个 .mind ===');
const compiler = new OfflineCompiler();
let lastPct = -1;
const results = await compiler.compileImageTargets(fakes, (pct) => {
  const p = Math.round(pct);
  if (p !== lastPct && p % 25 === 0) {
    console.log(`  进度 ${p}%`);
    lastPct = p;
  }
});

const out = Buffer.from(compiler.exportData());
const outPath = path.join(ROOT, 'test-multitarget.mind');
fs.writeFileSync(outPath, out);

console.log(`\n  返回的 results 长度: ${Array.isArray(results) ? results.length : '(非数组)'}`);
console.log(`  产物: ${outPath}  ${(out.length / 1024).toFixed(1)} KB`);

const json = parseMindJson(out);
console.log('\n=== .mind 内容 ===');
if (!json) {
  console.log('  JSON 段解析失败（结构与我预期不同），但 results 长度已足以说明问题');
} else {
  const list = json.dataList || [];
  console.log(`  顶层字段: ${Object.keys(json).join(', ')}`);
  console.log(`  dataList 条目数: ${list.length}   ← 这就是 target 数`);
  list.forEach((t, i) => {
    const dim = t.targetImage
      ? `${t.targetImage.width}x${t.targetImage.height}`
      : '(无 targetImage)';
    const n = Array.isArray(t.trackingData) ? t.trackingData.length : '-';
    console.log(`    target[${i}]  目标图尺寸 ${dim}  trackingData 段 ${n}`);
  });
}

console.log('\n=== 结论 ===');
if (results.length >= 2) {
  console.log(`  通过：一次调用编出 ${results.length} 个 target —— 多视角图片目标在【编译层】是通的`);
  console.log('  也就是说：这条路线不用改编译器，只需让上层把多张图一起传进来');
} else {
  console.log('  未通过：只编出 1 个 target');
}

fs.rmSync(outPath, { force: true });
console.log('\n（已清理临时 .mind 与临时脚本，可删）');
