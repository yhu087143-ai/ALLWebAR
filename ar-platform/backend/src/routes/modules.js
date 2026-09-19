/**
 * 模块清单与存活探测
 * ---------------------------------------------------------------------------
 * 首页过去把每个姊妹项目的端口和「运行中」状态都写死在 Home.jsx 里，结果是：
 *   · 端口全是过期的（导览写 3100 实际 3010、手势写 3200 实际 3011、
 *     平面写 4300 实际 8080）→ 点进去全是死链
 *   · status 恒为 'running'，服务没起也显示运行中
 *
 * 现在把「模块拓扑」收拢到这里作为唯一事实来源，并提供真实存活探测。
 * 前端只负责外观（图标 / 配色 / 文案），拓扑与状态一律问这个接口。
 *
 * 探测方式是裸 TCP connect —— 不看 HTTP 状态码，因为要判断的是
 * 「这个服务到底有没有起来」，不是「它是否愿意回 200」。
 */

import { Router } from 'express';
import net from 'net';

const router = Router();

/**
 * 姊妹项目拓扑。port 为 null 表示当前不可自动启动（见 note）。
 * path 是该模块「对外入口路径」，前端拼链接与 iframe 都用它。
 */
const MODULES = [
  {
    id: 'engine',
    label: '10 · Engine',
    name: '通用 AR 引擎',
    port: 5180,
    protocol: 'https',
    path: '/',
    self: true,
  },
  {
    /*
     * 导览已并入主站，不再作为独立站点启动。
     *
     * 原来的 D:\ar-tour-guide（3010）是本平台早期的重复实现：界面独立、功能重叠，
     * 用户明确要求「不再开窗口」。项目文件保留在原处，但这里 port 为 null ——
     * 不是「服务没起来」，而是根本不需要单独起。
     * 编排走主站 /create-guide，演示走 /guide-demo，已发布走 /guide/:id。
     */
    id: 'tour',
    label: '20 · TourGuide',
    name: 'AR 导览',
    port: null,
    protocol: 'https',
    path: '/guide-demo',
    internal: true,
    note: '已并入主站：编排 /create-guide · 演示 /guide-demo',
  },
  {
    id: 'hand',
    label: '30 · HandGesture',
    name: '手部手势',
    port: 3011,
    protocol: 'https',
    path: '/test-hand',
  },
  {
    id: 'plane',
    label: '40 · PlaneTracking',
    name: '平面追踪',
    port: 8080,
    protocol: 'https',
    path: '/',
  },
  {
    id: 'card',
    label: '50 · CardAR',
    name: '贺卡放置',
    port: 5173,
    protocol: 'https',
    path: '/',
  },
  {
    id: 'xr',
    label: 'XR · Studio',
    name: 'XR 创作台',
    port: 5174,
    protocol: 'http',
    path: '/',
    internal: true,
  },
  {
    id: 'gen3d',
    label: '60 · AIGen3D',
    name: 'AI 3D 生成',
    port: null,
    protocol: 'http',
    path: '/',
    note: '需 ≥16GB 显存，未随一键启动拉起',
  },
];

/** 裸 TCP 探活：连上就算活着，不关心它回什么 */
function probePort(port, timeout = 500) {
  return new Promise((resolve) => {
    if (!port) return resolve(false);
    const sock = new net.Socket();
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeout);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
    sock.connect(port, '127.0.0.1');
  });
}

/**
 * GET /api/modules
 * 返回模块清单 + 实时存活状态。status 有四种：
 *   up          —— 端口在监听
 *   down        —— 端口没人
 *   integrated  —— 已并入主站，不需要单独启动（导览）
 *   manual      —— 本就不该自动启动（例如显存不够）
 */
router.get('/', async (req, res) => {
  const results = await Promise.all(
    MODULES.map(async (m) => {
      const up = m.port ? await probePort(m.port) : false;
      const status = !m.port ? (m.internal ? 'integrated' : 'manual') : up ? 'up' : 'down';
      return { ...m, up, status };
    }),
  );
  res.json({ modules: results, checkedAt: new Date().toISOString() });
});

export default router;
