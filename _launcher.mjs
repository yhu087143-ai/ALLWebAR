#!/usr/bin/env node
/**
 * AllWebAR 单窗口启动器
 * ---------------------------------------------------------------------------
 * 取代原来「每个服务开一个 cmd 窗口」的做法（8 个窗口 → 1 个窗口）。
 *
 * 所有子进程用 stdio:pipe 接管，输出写进 _logs/<id>.log，同时带彩色前缀
 * 汇总到本窗口。关掉这个窗口 / 按 Ctrl+C 会 taskkill 整棵进程树，不会留残留。
 *
 * 用法：
 *   node _launcher.mjs                 启动全部（默认）
 *   node _launcher.mjs --only engine   只启动 id 含 "engine" 的服务
 *   node _launcher.mjs --skip tour     跳过 id 含 "tour" 的服务
 *   node _launcher.mjs --list          只打印服务表，不启动
 *   node _launcher.mjs --no-open       启动后不自动打开浏览器
 *   node _launcher.mjs --verbose       把子进程原始输出也打到本窗口
 *
 * 只用 Node 内置模块，不引入任何依赖。
 */

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '_logs');
const R = (p) => path.join(__dirname, p); // 仓库相对路径

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const flagValue = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

// ===========================================================================
// 服务表 —— 唯一事实来源。端口、工作目录、启动命令、对外的 URL 都只写在这里。
// 新增服务只要往这里加一行；启动器、总览表、手机链接、停止脚本会自动跟上。
// ===========================================================================
const SERVICES = [
  {
    id: 'engine-api',
    name: 'AR平台 后端',
    cwd: R('ar-platform/backend'),
    cmd: 'npm run dev',
    port: 3001,
    url: 'http://localhost:3001/',
    group: 'main',
  },
  {
    id: 'engine-web',
    name: 'AR平台 前端(主)',
    cwd: R('ar-platform/frontend'),
    cmd: 'npm run dev',
    port: 5180,
    url: 'https://localhost:5180/',
    group: 'main',
    primary: true,
  },
  {
    id: 'xr-studio',
    name: 'XR 创作台',
    cwd: R('modules/xr-engine'),
    cmd: 'node scripts/dev-embedded.mjs',
    port: 5174,
    url: 'https://localhost:5180/xr-studio',
    group: 'main',
  },
  {
    id: 'hand-web',
    name: '手势识别(可选)',
    cwd: R('modules/hand/apps/web'),
    pm: 'pnpm',
    cmd: 'npm run dev:https',
    port: 3011,
    url: 'https://localhost:3011/test-hand',
    group: 'module',
  },
];

/*
 * 已退休的端口。
 *
 * 导览（D:\ar-tour-guide, 3010）从服务表里摘掉了 —— 用户要求「不再开窗口」。
 * 它的界面不再作为独立站点暴露，导览功能改由主站自己提供（/guide-demo、/create-guide）。
 * 项目文件保留在原处，需要时仍可用它自己的 bat 单独起。
 * 这里把 3010 留在清理清单里，是为了把上次没退干净的实例杀掉。
 */
const RETIRED_PORTS = [
  3010, // 导览（已并入主站）
  3002, // ProjectHand 的 HTTP 侧（随 3011 的 dev-https.mjs 一起起，不需要单独清）
  5181, // 桌面预览用的 HTTP 实例（手工起，不属于服务表）
  3200, // ProjectHand 的历史端口
];

const KILL_PORTS = [...new Set([...SERVICES.map((s) => s.port), ...RETIRED_PORTS])];

// ===========================================================================
// 小工具
// ===========================================================================
const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};
const PALETTE = [C.cyan, C.magenta, C.green, C.yellow, C.blue, C.red];

function log(msg = '') {
  process.stdout.write(msg + '\n');
}

function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}

/** 端口是否处于 LISTENING */
function isListening(port) {
  try {
    const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
    return out.split(/\r?\n/).some((l) => l.includes(`:${port} `) && l.includes('LISTENING'));
  } catch {
    return false;
  }
}

/** 占用某端口的 PID 列表 */
function pidsOnPort(port) {
  const pids = new Set();
  try {
    const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(`:${port} `) || !line.includes('LISTENING')) continue;
      const m = line.trim().split(/\s+/);
      const pid = m[m.length - 1];
      if (/^\d+$/.test(pid)) pids.add(pid);
    }
  } catch {
    /* netstat 不可用就跳过清理 */
  }
  return [...pids];
}

function killPort(port) {
  let killed = 0;
  for (const pid of pidsOnPort(port)) {
    try {
      execFileSync('taskkill', ['/f', '/t', '/pid', pid], { stdio: 'ignore', windowsHide: true });
      killed++;
    } catch {
      /* 已经退掉了 */
    }
  }
  return killed;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ===========================================================================
// 主流程
// ===========================================================================
async function main() {
  const only = flagValue('--only');
  const skip = flagValue('--skip');
  const verbose = hasFlag('--verbose');
  const noOpen = hasFlag('--no-open');

  let plan = SERVICES;
  if (only) plan = plan.filter((s) => s.id.includes(only));
  if (skip) plan = plan.filter((s) => !s.id.includes(skip));

  banner();

  if (hasFlag('--list')) {
    printTable(plan, '待启动的服务');
    return;
  }

  /*
   * --stop：按服务表里的端口全部结束。
   * 「全部停止.bat」直接调它，这样停止清单和启动清单永远是同一份 ——
   * 以前两边各写一遍端口，加了服务就会漏掉。
   */
  if (hasFlag('--stop')) {
    log(`${C.bold}停止全部服务${C.reset} ${C.dim}(${KILL_PORTS.join(', ')})${C.reset}`);
    let killed = 0;
    for (const p of KILL_PORTS) {
      const n = killPort(p);
      killed += n;
      if (n > 0) log(`  ${C.green}●${C.reset} 端口 ${String(p).padEnd(6)} 结束 ${n} 个进程`);
    }
    log('');
    log(killed > 0 ? `${C.green}已结束 ${killed} 个进程。${C.reset}` : `${C.dim}没有在跑的服务。${C.reset}`);
    return;
  }

  if (plan.length === 0) {
    log(`${C.yellow}按筛选条件没有剩下任何服务。${C.reset}`);
    return;
  }

  // ---------- 1. 清理残留端口 ----------
  log(`${C.bold}[1/3]${C.reset} 清理残留端口 ${C.dim}(${KILL_PORTS.join(', ')})${C.reset}`);
  let totalKilled = 0;
  for (const p of KILL_PORTS) totalKilled += killPort(p);
  log(`      ${totalKilled > 0 ? `${C.green}已结束 ${totalKilled} 个残留进程${C.reset}` : `${C.dim}没有残留${C.reset}`}`);

  // ---------- 2. 依赖与前置产物 ----------
  log(`${C.bold}[2/3]${C.reset} 检查依赖与构建产物`);
  for (const s of plan) {
    if (!existsSync(s.cwd)) {
      log(`      ${C.yellow}跳过 ${s.name}：找不到 ${s.cwd}${C.reset}`);
      s.disabled = true;
      continue;
    }
    if (!existsSync(path.join(s.cwd, 'node_modules'))) {
      log(`      ${C.yellow}${s.name} 缺依赖，正在 npm install（首次较慢）...${C.reset}`);
      try {
        execFileSync(s.pm === 'pnpm' ? 'pnpm' : 'npm', ['install'], { cwd: s.cwd, stdio: 'inherit', shell: true, windowsHide: true });
      } catch {
        log(`      ${C.red}${s.name} 依赖安装失败，跳过${C.reset}`);
        s.disabled = true;
      }
    }
  }
  // AR 引擎是前端消费的本地库，改了 src 必须重建，否则前端拿到的是旧产物
  const engineDist = R('ar-platform/ar-engine/dist/index.js');
  if (!existsSync(engineDist) && plan.some((s) => s.id === 'engine-web' && !s.disabled)) {
    log(`      ${C.yellow}未发现 AR 引擎产物，正在构建（约 1 分钟）...${C.reset}`);
    try {
      execFileSync('npm', ['run', 'dev:engine'], {
        cwd: R('ar-platform'),
        stdio: 'inherit',
        shell: true,
        windowsHide: true,
      });
    } catch {
      log(`      ${C.red}引擎构建失败，主平台可能无法正常渲染${C.reset}`);
    }
  }

  plan = plan.filter((s) => !s.disabled);
  if (plan.length === 0) return;

  // ---------- 3. 拉起子进程 ----------
  mkdirSync(LOG_DIR, { recursive: true });
  log(`${C.bold}[3/3]${C.reset} 启动服务（日志 → ${path.relative(__dirname, LOG_DIR)}\\<服务>.log）`);
  log('');

  const children = [];
  plan.forEach((s, i) => {
    s.color = PALETTE[i % PALETTE.length];
    const logStream = createWriteStream(path.join(LOG_DIR, `${s.id}.log`), { flags: 'w' });
    logStream.write(`# ${s.name}  ${s.cmd}  (cwd ${s.cwd})\n\n`);

    const child = spawn(s.cmd, {
      cwd: s.cwd,
      shell: true,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    s.child = child;
    s.logStream = logStream;
    s.state = 'starting';
    children.push(child);

    const pipe = (stream) => {
      let buf = '';
      stream.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        logStream.write(text);
        if (!verbose) return;
        buf += text;
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? '';
        for (const l of lines) if (l.trim()) log(`${s.color}[${s.id}]${C.reset} ${l}`);
      });
      stream.on('end', () => {
        if (buf.trim() && verbose) log(`${s.color}[${s.id}]${C.reset} ${buf}`);
      });
    };
    pipe(child.stdout);
    pipe(child.stderr);

    child.on('exit', (code) => {
      s.state = code === 0 ? 'stopped' : 'crashed';
      s.exitCode = code;
      log(`${s.color}[${s.id}]${C.reset} ${code === 0 ? '已停止' : `${C.red}进程退出（code ${code}），详见 _logs/${s.id}.log${C.reset}`}`);
      logStream.end();
    });

    log(`      ${s.color}●${C.reset} ${padDisplay(s.name, 20)} ${C.dim}${s.cmd}${C.reset}`);
  });

  // ---------- 优雅退出：保证不留孤儿进程 ----------
  let shuttingDown = false;
  const shutdown = (reason) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('');
    log(`${C.bold}收到 ${reason}，正在停止全部服务...${C.reset}`);
    for (const s of plan) {
      try {
        if (s.child && s.child.pid) {
          execFileSync('taskkill', ['/f', '/t', '/pid', String(s.child.pid)], {
            stdio: 'ignore',
            windowsHide: true,
          });
        }
      } catch {
        /* 已退出 */
      }
    }
    // 兜底：按端口再扫一遍，防止 npm 包了一层导致树没杀干净
    for (const { port } of plan) killPort(port);
    log(`${C.green}已全部停止。${C.reset}`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('Ctrl+C'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('窗口关闭'));

  // ---------- 就绪探测 ----------
  log('');
  log(`${C.dim}等待各服务监听端口（最多 90 秒）...${C.reset}`);
  const deadline = Date.now() + 90_000;
  const pending = new Set(plan.map((s) => s.port));
  while (pending.size > 0 && Date.now() < deadline) {
    for (const p of [...pending]) {
      if (isListening(p)) pending.delete(p);
    }
    if (pending.size === 0) break;
    await sleep(1000);
  }

  const results = plan.map((s) => ({ ...s, ok: isListening(s.port) }));

  // ---------- 总览 ----------
  log('');
  printTable(results, '启动结果');

  // 端口漂移告警：有些服务被占用时会自动换到 port+1，浏览器就会打到旧地址
  const drifted = results.filter((s) => !s.ok);
  if (drifted.length > 0) {
    log(`${C.yellow}⚠ 以下服务在 ${Math.round(90)} 秒内没有监听到预期端口：${C.reset}`);
    for (const s of drifted) {
      log(`${C.yellow}   ${s.name}  期望 :${s.port}${C.reset}`);
      const near = [s.port + 1, s.port + 2].filter(isListening);
      if (near.length) log(`${C.yellow}     → 但它似乎漂到了 :${near.join(', :')}（服务内部有「端口被占用就 +1」的逻辑）${C.reset}`);
    }
    log(`   ${C.dim}排查：打开 _logs/${drifted[0].id}.log 看最后 30 行${C.reset}`);
  }

  printMobile(results);

  // 把本次实际使用的端口写出来，给 全部停止.bat / 集成路由 复用
  writeFileSync(
    path.join(__dirname, '_ports.json'),
    JSON.stringify(
      results.map((s) => ({ id: s.id, name: s.name, port: s.port, url: s.url, ok: s.ok })),
      null,
      2,
    ),
    'utf8',
  );

  const primary = results.find((s) => s.primary) || results[0];
  if (!noOpen && primary?.ok) {
    log(`${C.dim}正在打开主平台 ${primary.url}${C.reset}`);
    spawn('cmd', ['/c', 'start', '', primary.url], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
  }

  log('');
  log(`${C.bold}${C.green}全部就绪。${C.reset} 本窗口就是唯一控制台：`);
  log(`  ${C.dim}· 关掉本窗口 或 按 Ctrl+C → 全部停止${C.reset}`);
  log(`  ${C.dim}· 单个服务日志 → D:\\AllWebAR\\_logs\\<服务>.log${C.reset}`);
  log(`  ${C.dim}· 想实时看某个服务的输出 → 另开终端 node _launcher.mjs --only <服务> --verbose${C.reset}`);
  log('');
}

function banner() {
  log('');
  log(`${C.bold}${C.blue}============================================================${C.reset}`);
  log(`${C.bold}${C.blue}  AllWebAR  一键启动（单窗口版）${C.reset}`);
  log(`${C.blue}  ar-platform · xr-studio · hand${C.reset}`);
  log(`${C.blue}  手势(可选)${C.reset}`);
  log(`${C.bold}${C.blue}============================================================${C.reset}`);
  log('');
}

/** 中文按 2 列宽计算，保证表格在等宽终端里对齐 */
function displayWidth(str) {
  let w = 0;
  for (const ch of str) {
    w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch)
      ? 2
      : 1;
  }
  return w;
}

/** 按「显示宽度」右侧补空格 —— padEnd 数的是码元，中文会错位 */
function padDisplay(str, width) {
  return str + ' '.repeat(Math.max(0, width - displayWidth(str)));
}

function printTable(list, title) {
  const nameW = Math.max(...list.map((s) => displayWidth(s.name)), 8);
  const portW = 8;
  log(`${C.bold}${title}${C.reset}`);
  log(`  ${padDisplay('名称', nameW)}  ${padDisplay('端口', portW)}地址`);
  log(`  ${'-'.repeat(nameW + portW + 6)}`);
  for (const s of list) {
    const mark = s.ok === undefined ? `${C.dim}·${C.reset}` : s.ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
    log(`  ${mark} ${padDisplay(s.name, nameW)}  ${padDisplay(String(s.port), portW)}${s.url}`);
  }
  log('');
}

function printMobile(list) {
  const lan = getLanIp();
  const httpsOnes = list.filter((s) => s.url.startsWith('https://'));
  if (httpsOnes.length === 0) return;
  log(`${C.bold}手机真机测试${C.reset}（手机与电脑同一 WiFi；摄像头必须 https）`);
  for (const s of httpsOnes) {
    const p = s.url.match(/:(\d+)/)?.[1];
    const pathPart = s.url.replace(/^https:\/\/[^/]+/, '');
    log(`  ${padDisplay(s.name, 20)} https://${lan}:${p}${pathPart}`);
  }
  log(`  ${C.dim}首次访问提示「证书不受信任」→ 高级 → 继续访问${C.reset}`);
  log(`  ${C.dim}手机连不上 → 以管理员身份运行 全部放行防火墙.bat${C.reset}`);
  log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
