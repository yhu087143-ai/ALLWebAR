/**
 * 植物大战僵尸 · 平台可玩版（/game-pvz）
 * 全屏独立路由；游戏逻辑在 src/game/pvz-game.js
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Sun, Sprout, Zap, Shield, Cherry, RotateCcw, Play, ArrowLeft, Trophy, Skull,
} from 'lucide-react';
import { PvzGame, PLANTS } from '../game/pvz-game.js';

const CARD_ICONS = {
  sunflower: Sprout,
  peashooter: Zap,
  wallnut: Shield,
  cherry: Cherry,
};

export default function PvzGamePage() {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const [ui, setUi] = useState({
    sun: 0, wave: 0, totalWaves: 5, zombies: 0, status: 'ready',
    selected: null, cooldowns: {}, plants: 0,
  });

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    const game = new PvzGame(containerRef.current, { onState: setUi });
    gameRef.current = game;
    return () => { game.dispose(); gameRef.current = null; };
  }, []);

  const pick = useCallback((type) => gameRef.current?.selectPlant(type), []);
  const start = useCallback(() => gameRef.current?.start(), []);
  const restart = useCallback(() => gameRef.current?.restart(), []);

  const playing = ui.status === 'playing';
  const over = ui.status === 'over';
  const win = ui.status === 'win';

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#0d1420]">
      {/* three.js 画布 */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* 顶部状态栏 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="pointer-events-auto flex items-center gap-1.5 rounded-xl bg-black/40 px-3 py-2 text-xs text-white/70 backdrop-blur transition-colors hover:text-white"
          >
            <ArrowLeft size={14} /> 返回
          </a>
          <div className="flex items-center gap-2 rounded-xl bg-black/40 px-4 py-2 backdrop-blur">
            <Sun size={18} className="text-amber-300" />
            <span className="text-lg font-bold text-amber-200">{ui.sun}</span>
          </div>
        </div>
        <div className="rounded-xl bg-black/40 px-4 py-2 text-right backdrop-blur">
          <div className="text-xs text-white/50">
            第 {Math.max(ui.wave, 1)} / {ui.totalWaves} 波
          </div>
          <div className="text-sm text-white/80">
            {ui.status === 'playing' ? `场上僵尸 ${ui.zombies}` : '等待开始'}
          </div>
        </div>
      </div>

      {/* 底部卡片栏 */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-4">
        <div className="flex items-end gap-2 rounded-2xl bg-black/45 p-2.5 backdrop-blur">
          {Object.entries(PLANTS).map(([type, spec]) => {
            const Icon = CARD_ICONS[type];
            const cd = ui.cooldowns[type] || 0;
            const disabled = !playing || ui.sun < spec.cost || cd > 0;
            const active = ui.selected === type;
            return (
              <button
                key={type}
                onClick={() => pick(type)}
                disabled={disabled}
                className={`relative w-24 overflow-hidden rounded-xl border p-2 text-left transition-all
                  ${active ? 'border-amber-300 bg-amber-300/15' : 'border-white/10 bg-white/5'}
                  ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:border-white/30'}`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon size={15} style={{ color: spec.color }} />
                  <span className="text-xs text-white/90">{spec.name}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-200">
                  <Sun size={11} /> {spec.cost}
                </div>
                {cd > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs text-white/80">
                    {cd.toFixed(1)}s
                  </div>
                )}
              </button>
            );
          })}
          <button
            onClick={restart}
            className="flex h-full w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:text-white"
            title="重新开始"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* 操作提示 */}
      {playing && !ui.selected && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-10 text-center text-xs text-white/40">
          点击下方卡片选择植物，再点击草坪格子种下；点击掉落的阳光收集
        </div>
      )}

      {/* 开始 / 结算遮罩 */}
      {(ui.status === 'ready' || over || win) && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[22rem] rounded-2xl border border-white/10 bg-[#101a2c]/90 p-8 text-center">
            {ui.status === 'ready' && (
              <>
                <h1 className="text-2xl font-bold text-white">植物大战僵尸</h1>
                <p className="mt-1 text-xs text-white/50">平台游戏引擎 · 可玩版</p>
                <ul className="mt-5 space-y-1.5 text-left text-xs leading-relaxed text-white/60">
                  <li>· 点击卡片选择植物，再点草坪格子种下</li>
                  <li>· 向日葵产阳光，豌豆射手自动射击，坚果墙挡路</li>
                  <li>· 点击掉落的阳光收集资源</li>
                  <li>· 撑过 5 波僵尸进攻即获胜，别让僵尸走进左边的房子</li>
                </ul>
                <button
                  onClick={start}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400"
                >
                  <Play size={15} /> 开始游戏
                </button>
              </>
            )}
            {over && (
              <>
                <Skull size={40} className="mx-auto text-red-400" />
                <h1 className="mt-3 text-xl font-bold text-white">僵尸进了房子…</h1>
                <p className="mt-1 text-xs text-white/50">坚持到了第 {Math.max(ui.wave, 1)} 波</p>
                <button
                  onClick={restart}
                  className="mt-6 w-full rounded-xl bg-white/10 py-3 text-sm text-white transition-colors hover:bg-white/20"
                >
                  再来一局
                </button>
              </>
            )}
            {win && (
              <>
                <Trophy size={40} className="mx-auto text-amber-300" />
                <h1 className="mt-3 text-xl font-bold text-white">胜利！</h1>
                <p className="mt-1 text-xs text-white/50">5 波僵尸全部挡下</p>
                <button
                  onClick={restart}
                  className="mt-6 w-full rounded-xl bg-amber-400 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-300"
                >
                  再来一局
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
